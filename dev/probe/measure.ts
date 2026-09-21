#!/usr/bin/env bun
// M1 synthetic end-to-end measurement:
// Take the REAL captured system prompt (with 34 advertised skills + 19 tools),
// call REAL Jev to score relevance for a set of representative user requests,
// then compute actual token savings from filtering the <available_skills> block
// and dropping irrelevant tools.

import { readFileSync } from "node:fs"

const DUMP = process.env.PROBE_DUMP || "/tmp/opencode-context-dump.json"
const API = "https://api.typesafe.ai/v1/systemone"
const KEY = process.env.TYPESAFE_API_KEY
if (!KEY) throw new Error("TYPESAFE_API_KEY not set")

const KEEP_THRESHOLD = Number(process.env.KEEP_THRESHOLD ?? "0.5")

// crude token estimate ~4 chars/token (good enough for relative savings)
const tok = (s: string) => Math.ceil(s.length / 4)

type Dump = {
  systemParts: { kind: string; type?: string; text: string }[]
  systemTotalChars: number
  tools: { id: string; description: string | null }[]
}

const dump: Dump = JSON.parse(readFileSync(DUMP, "utf8"))

// Extract the advertised skills from the system block.
const fullSystem = dump.systemParts.map((p) => p.text).join("\n")
const blockMatch = fullSystem.match(/<available_skills>[\s\S]*?<\/available_skills>/)
const skillsBlock = blockMatch?.[0] ?? ""
const skillEntries = [...skillsBlock.matchAll(/<skill>\s*<id>(.*?)<\/id>\s*<name>(.*?)<\/name>\s*<description>([\s\S]*?)<\/description>\s*<\/skill>/g)].map(
  (m) => ({ id: m[1], name: m[2], description: m[3].trim() }),
)

// Always-keep allowlist (core tools + orchestration skills that must stay).
const ALWAYS_KEEP_TOOLS = new Set(["read", "grep", "glob", "patch", "shell", "skill", "subagent", "question", "task_status", "task_result", "task_revive", "task_cancel", "task_message", "wait_for_user", "execute"])

async function jevBatch(state: unknown, questions: Record<string, any>) {
  const t0 = Date.now()
  const res = await fetch(API, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "jev-latest", state, questions }),
  })
  const ms = Date.now() - t0
  if (!res.ok) throw new Error(`Jev ${res.status}: ${await res.text()}`)
  const json: any = await res.json()
  return { json, ms }
}

async function scoreForRequest(userRequest: string) {
  // One batched call: a noul per skill + a noul per (non-allowlisted) tool.
  const candidateTools = dump.tools.filter((t) => !ALWAYS_KEEP_TOOLS.has(t.id))
  const state = {
    user_request: userRequest,
    skills: skillEntries.map((s) => ({ id: s.id, description: s.description })),
    tools: candidateTools.map((t) => ({ id: t.id, description: t.description })),
  }
  const questions: Record<string, any> = {}
  for (const s of skillEntries) {
    questions[`skill__${s.id}`] = {
      type: "noul",
      instructions: `Is the skill "${s.id}" relevant and likely useful for this user request?`,
      criteria: { true: "Directly relevant to the request", false: "Not relevant to the request" },
    }
  }
  for (const t of candidateTools) {
    questions[`tool__${t.id}`] = {
      type: "noul",
      instructions: `Is the tool "${t.id}" relevant and likely useful for this user request?`,
      criteria: { true: "Likely needed for the request", false: "Not needed for the request" },
    }
  }
  const { json, ms } = await jevBatch(state, questions)
  const keptSkills = skillEntries.filter((s) => (json.answers[`skill__${s.id}`]?.noul ?? 1) >= KEEP_THRESHOLD)
  const keptToolIds = new Set([
    ...ALWAYS_KEEP_TOOLS,
    ...candidateTools.filter((t) => (json.answers[`tool__${t.id}`]?.noul ?? 1) >= KEEP_THRESHOLD).map((t) => t.id),
  ])
  return { json, ms, keptSkills, keptToolIds, candidateTools }
}

// Rebuild a filtered available_skills block for token accounting.
function rebuildSkillsBlock(kept: { id: string; name: string; description: string }[]) {
  if (kept.length === 0) return "" // whole block removed
  const items = kept
    .map((s) => `  <skill>\n    <id>${s.id}</id>\n    <name>${s.name}</name>\n    <description>${s.description}</description>\n  </skill>`)
    .join("\n")
  return `<available_skills>\n${items}\n</available_skills>`
}

const REQUESTS = [
  "Help me refactor this Python function to be more readable",
  "Create a PowerPoint deck summarizing Q3 results",
  "Debug why my Remotion video render is failing",
  "What's the architecture of this codebase? Map it out.",
]

const baselineSkillsTok = tok(skillsBlock)
const baselineToolsTok = dump.tools.reduce((n, t) => n + tok(t.description ?? ""), 0)
const baselineSystemTok = tok(fullSystem)

console.log("=".repeat(70))
console.log("BASELINE")
console.log(`  system prompt total:      ${baselineSystemTok} tok (${fullSystem.length} chars)`)
console.log(`  available_skills block:   ${baselineSkillsTok} tok (${skillEntries.length} skills)`)
console.log(`  tool descriptions:        ${baselineToolsTok} tok (${dump.tools.length} tools)`)
console.log(`  KEEP_THRESHOLD:           ${KEEP_THRESHOLD}`)
console.log("=".repeat(70))

let totalJevIn = 0, totalJevOut = 0, totalMs = 0

for (const req of REQUESTS) {
  const { json, ms, keptSkills, keptToolIds, candidateTools } = await scoreForRequest(req)
  totalJevIn += json.usage?.input_tokens ?? 0
  totalJevOut += json.usage?.output_tokens ?? 0
  totalMs += ms

  const newBlock = rebuildSkillsBlock(keptSkills)
  const newSkillsTok = tok(newBlock)
  const droppedTools = dump.tools.filter((t) => !keptToolIds.has(t.id))
  const newToolsTok = dump.tools.filter((t) => keptToolIds.has(t.id)).reduce((n, t) => n + tok(t.description ?? ""), 0)

  const skillsSaved = baselineSkillsTok - newSkillsTok
  const toolsSaved = baselineToolsTok - newToolsTok
  const totalSaved = skillsSaved + toolsSaved
  const pctOfSystem = ((totalSaved / baselineSystemTok) * 100).toFixed(1)

  console.log(`\nREQUEST: ${req}`)
  console.log(`  Jev: ${ms}ms, in=${json.usage?.input_tokens} out=${json.usage?.output_tokens}`)
  console.log(`  skills kept: ${keptSkills.length}/${skillEntries.length}  ->  ${keptSkills.map((s) => s.id).join(", ") || "(none)"}`)
  console.log(`  tools dropped: ${droppedTools.length}/${dump.tools.length}  ->  ${droppedTools.map((t) => t.id).join(", ") || "(none)"}`)
  console.log(`  SAVED: skills ${skillsSaved} tok + tools ${toolsSaved} tok = ${totalSaved} tok  (${pctOfSystem}% of system prompt)`)
}

console.log("\n" + "=".repeat(70))
console.log("JEV COST (per turn, 4 turns measured)")
console.log(`  avg latency:   ${Math.round(totalMs / REQUESTS.length)}ms`)
console.log(`  avg in/out:    ${Math.round(totalJevIn / REQUESTS.length)}/${Math.round(totalJevOut / REQUESTS.length)} tok`)
console.log("=".repeat(70))
