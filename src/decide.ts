// The Jev decision layer: given a user request, an agent, and candidate
// skills/tools, ask Jev (one batched request) which are relevant.

import type { JevSelectorConfig } from "./config.ts"
import type { AdvertisedSkill } from "./skills.ts"

export interface ToolCandidate {
  id: string
  description: string
}

export interface JevDecision {
  keepSkillIds: Set<string>
  keepToolIds: Set<string>
  usage: { input: number; output: number }
  latencyMs: number
}

interface NoulAnswer {
  type: "noul"
  noul: number
}

interface JevResponse {
  model: string
  answers: Record<string, NoulAnswer | undefined>
  usage?: { input_tokens?: number; output_tokens?: number }
}

const SKILL_PREFIX = "skill__"
const TOOL_PREFIX = "tool__"

/**
 * Ask Jev which candidates are relevant. Throws on any failure so the caller
 * can decide the fail policy. Uses a single batched request over shared state.
 */
export async function decide(
  cfg: JevSelectorConfig,
  input: {
    agent: string
    userRequest: string
    skills: AdvertisedSkill[]
    tools: ToolCandidate[]
  },
): Promise<JevDecision> {
  if (!cfg.apiKey) throw new Error("jevselector: TYPESAFE_API_KEY not set")

  const state = {
    agent: input.agent,
    user_request: input.userRequest,
    skills: input.skills.map((s) => ({ id: s.id, description: s.description })),
    tools: input.tools.map((t) => ({ id: t.id, description: t.description })),
  }

  const questions: Record<string, unknown> = {}
  for (const s of input.skills) {
    questions[`${SKILL_PREFIX}${s.id}`] = {
      type: "noul",
      instructions: `Given the active agent "${input.agent}", is the skill "${s.id}" relevant and likely useful for this user request?`,
      criteria: { true: "Directly relevant to the request", false: "Not relevant to the request" },
    }
  }
  for (const t of input.tools) {
    questions[`${TOOL_PREFIX}${t.id}`] = {
      type: "noul",
      instructions: `Given the active agent "${input.agent}", is the tool "${t.id}" relevant and likely useful for this user request?`,
      criteria: { true: "Likely needed for the request", false: "Not needed for the request" },
    }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs)
  const t0 = Date.now()
  let res: Response
  try {
    res = await fetch(cfg.baseUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: cfg.model, state, questions }),
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }
  const latencyMs = Date.now() - t0
  if (!res.ok) {
    throw new Error(`jevselector: Jev ${res.status}: ${await res.text().catch(() => "")}`)
  }
  const json = (await res.json()) as JevResponse

  const keepSkillIds = new Set<string>()
  for (const s of input.skills) {
    const a = json.answers[`${SKILL_PREFIX}${s.id}`]
    // Fail-safe per-item: if an answer is missing, keep the item.
    if (!a || a.noul >= cfg.keepThreshold) keepSkillIds.add(s.id)
  }
  const keepToolIds = new Set<string>()
  for (const t of input.tools) {
    const a = json.answers[`${TOOL_PREFIX}${t.id}`]
    if (!a || a.noul >= cfg.keepThreshold) keepToolIds.add(t.id)
  }

  return {
    keepSkillIds,
    keepToolIds,
    usage: { input: json.usage?.input_tokens ?? 0, output: json.usage?.output_tokens ?? 0 },
    latencyMs,
  }
}
