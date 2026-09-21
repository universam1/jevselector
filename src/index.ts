// jevselector — OpenCode v2 plugin.
//
// Registers a `session.context` hook that, per turn, asks Jev which advertised
// skills and outgoing tools are relevant to the current user request and active
// agent, then removes the rest from that request only. Fails open on any error.

import { define } from "@opencode-ai/plugin/v2/promise"

import { resolveConfig, type JevSelectorConfig } from "./config.ts"
import { decide, type ToolCandidate } from "./decide.ts"
import { cacheKey, memGet, memSet } from "./cache.ts"
import { extractUserRequest } from "./messages.ts"
import {
  findSkillsPartIndex,
  parseSkills,
  rewriteSkillsBlock,
  type AdvertisedSkill,
} from "./skills.ts"
import type { RuntimePluginContext, SessionContextEvent } from "./types.ts"

function report(cfg: JevSelectorConfig, msg: string, extra?: unknown) {
  if (!cfg.verbose) return
  if (extra === undefined) console.error(`[jevselector] ${msg}`)
  else console.error(`[jevselector] ${msg}`, JSON.stringify(extra))
}

export default define({
  id: "jevselector",
  async setup(rawCtx) {
    const ctx = rawCtx as unknown as RuntimePluginContext
    const cfg = resolveConfig(ctx.options ?? {})

    if (!cfg.apiKey) {
      // Fail open, but make the misconfiguration obvious.
      console.error("[jevselector] TYPESAFE_API_KEY not set — plugin disabled (failing open, all skills/tools exposed)")
      return
    }
    if (!ctx.session?.hook) {
      console.error("[jevselector] ctx.session.hook unavailable — plugin disabled")
      return
    }

    await ctx.session.hook("context", async (raw) => {
      const event = raw as SessionContextEvent
      const started = Date.now()
      try {
        // 1) Gather candidates.
        const skillsPartIdx = cfg.filterSkills ? findSkillsPartIndex(event.system) : -1
        const advertised: AdvertisedSkill[] =
          skillsPartIdx >= 0 ? parseSkills(event.system[skillsPartIdx]!.text ?? "") : []

        const toolCandidates: ToolCandidate[] = cfg.filterTools
          ? Object.entries(event.tools ?? {})
              .filter(([id]) => !cfg.alwaysKeepTools.includes(id))
              .map(([id, def]) => ({ id, description: typeof def?.description === "string" ? def.description : "" }))
          : []

        const skillCandidates = advertised.filter((s) => !cfg.alwaysKeepSkills.includes(s.id))

        if (skillCandidates.length === 0 && toolCandidates.length === 0) return

        const userRequest = extractUserRequest(event.messages ?? [])
        if (!userRequest) {
          report(cfg, "no user request text; skipping (fail open)")
          return
        }

        // 2) Cache lookup (per agent + request + candidate set).
        const key = cacheKey({
          agent: event.agent,
          userRequest,
          skillIds: skillCandidates.map((s) => s.id),
          toolIds: toolCandidates.map((t) => t.id),
        })

        let keepSkillIds: Set<string>
        let keepToolIds: Set<string>

        const cached = memGet(key)
        if (cached) {
          keepSkillIds = new Set(cached.keepSkillIds)
          keepToolIds = new Set(cached.keepToolIds)
          report(cfg, `cache hit (agent=${event.agent})`)
        } else {
          // 3) Ask Jev.
          const decision = await decide(cfg, {
            agent: event.agent,
            userRequest,
            skills: skillCandidates,
            tools: toolCandidates,
          })
          memSet(key, decision)
          keepSkillIds = decision.keepSkillIds
          keepToolIds = decision.keepToolIds
          report(
            cfg,
            `jev decided (agent=${event.agent}, ${decision.latencyMs}ms, in=${decision.usage.input} out=${decision.usage.output})`,
            {
              skillsKept: `${keepSkillIds.size}/${skillCandidates.length}`,
              toolsKept: `${keepToolIds.size}/${toolCandidates.length}`,
            },
          )
        }

        // 4) Apply skill filtering (always-keep skills are re-added).
        if (cfg.filterSkills && skillsPartIdx >= 0) {
          const keep = advertised.filter(
            (s) => keepSkillIds.has(s.id) || cfg.alwaysKeepSkills.includes(s.id),
          )
          if (keep.length !== advertised.length) {
            const part = event.system[skillsPartIdx]!
            part.text = rewriteSkillsBlock(part.text ?? "", keep)
            report(cfg, `skills ${advertised.length} -> ${keep.length}`)
          }
        }

        // 5) Apply tool filtering (always-keep tools are never dropped).
        if (cfg.filterTools) {
          let dropped = 0
          for (const id of Object.keys(event.tools ?? {})) {
            if (cfg.alwaysKeepTools.includes(id)) continue
            if (!keepToolIds.has(id) && toolCandidates.some((t) => t.id === id)) {
              delete event.tools[id]
              dropped++
            }
          }
          if (dropped > 0) report(cfg, `tools dropped: ${dropped}`)
        }
      } catch (err) {
        // Fail open, but loud (testing posture).
        console.error(`[jevselector] fail-open after error (${Date.now() - started}ms):`, err instanceof Error ? err.message : err)
      }
    })

    report(cfg, `active (model=${cfg.model}, threshold=${cfg.keepThreshold}, filterSkills=${cfg.filterSkills}, filterTools=${cfg.filterTools})`)
  },
})
