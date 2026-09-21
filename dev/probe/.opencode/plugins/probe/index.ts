// M1 capture probe: dump the REAL system parts + skills + tools to a file
// so we can measure token footprint and run a synthetic Jev filter offline.

import { define } from "@opencode-ai/plugin/v2/promise"

const LOG = process.env.PROBE_LOG || "/tmp/opencode-probe.jsonl"
const DUMP = process.env.PROBE_DUMP || "/tmp/opencode-context-dump.json"

function log(event: string, data: unknown) {
  try {
    const fs = require("node:fs")
    fs.appendFileSync(LOG, JSON.stringify({ t: Date.now(), event, data }) + "\n")
  } catch {}
}

export default define({
  id: "probe",
  async setup(ctx: any) {
    let capturedSkills: any[] = []

    await ctx.skill.transform((draft: any) => {
      try {
        capturedSkills = (draft.list() as any[]).map((s) => ({
          id: s?.id,
          name: s?.name,
          description: s?.description,
          contentLen: typeof s?.content === "string" ? s.content.length : null,
        }))
      } catch (e) {
        log("skill.capture.err", String(e))
      }
    })

    if (ctx.session?.hook) {
      await ctx.session.hook("context", (event: any) => {
        try {
          // Dump the last message shape so we can extract user request text.
          const msgs = event.messages ?? []
          const last = msgs[msgs.length - 1]
          log("context.messages", {
            count: msgs.length,
            lastShape: last ? Object.keys(last) : null,
            lastInfoRole: last?.info?.role ?? last?.role,
            contentType: Array.isArray(last?.content) ? "array" : typeof last?.content,
            contentSample: Array.isArray(last?.content)
              ? last.content.slice(0, 4).map((c: any) => ({ keys: Object.keys(c ?? {}), type: c?.type, text: String(c?.text ?? "").slice(0, 100) }))
              : String(last?.content ?? "").slice(0, 200),
          })
          const systemParts = (event.system as any[]).map((s) =>
            typeof s === "string" ? { kind: "string", text: s } : { kind: "part", type: s?.type, text: s?.text ?? "" },
          )
          const tools = Object.entries(event.tools ?? {}).map(([id, def]: any) => ({
            id,
            descLen: typeof def?.description === "string" ? def.description.length : null,
            description: typeof def?.description === "string" ? def.description.slice(0, 300) : null,
          }))
          const dump = {
            capturedAt: Date.now(),
            agent: event.agent,
            model: event.model,
            systemParts,
            systemTotalChars: systemParts.reduce((n, p) => n + (p.text?.length ?? 0), 0),
            tools,
            skills: capturedSkills,
          }
          const fs = require("node:fs")
          fs.writeFileSync(DUMP, JSON.stringify(dump, null, 2))
          log("context.dumped", {
            systemParts: systemParts.length,
            systemChars: dump.systemTotalChars,
            toolCount: tools.length,
            skillCount: capturedSkills.length,
          })
        } catch (e) {
          log("context.dump.err", String(e))
        }
      })
    }
  },
})
