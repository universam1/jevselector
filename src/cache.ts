// Per-request decision cache, keyed on (agent, request, candidate-set).
//
// Sub-agents (e.g. oh-my-opencode-slim orchestrator/explorer/fixer) can have
// different relevant sets for the same request, so the agent is part of the key.
// Multi-step turns (tool continuations) reuse the same request text + candidates
// and therefore hit the cache instead of re-calling Jev.

import type { JevDecision } from "./decide.ts"

export interface CacheEntry {
  keepSkillIds: string[]
  keepToolIds: string[]
}

function hashString(s: string): string {
  // FNV-1a 32-bit, hex. Small and dependency-free; collisions are acceptable
  // because a collision only risks reusing a stale relevance set.
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16)
}

export function cacheKey(input: {
  agent: string
  userRequest: string
  skillIds: string[]
  toolIds: string[]
}): string {
  const candidates = [...input.skillIds].sort().join(",") + "|" + [...input.toolIds].sort().join(",")
  return `jevselector:v1:${input.agent}:${hashString(input.userRequest)}:${hashString(candidates)}`
}

const mem = new Map<string, CacheEntry>()

export function memGet(key: string): CacheEntry | undefined {
  return mem.get(key)
}

export function memSet(key: string, decision: JevDecision): CacheEntry {
  const entry: CacheEntry = {
    keepSkillIds: [...decision.keepSkillIds],
    keepToolIds: [...decision.keepToolIds],
  }
  mem.set(key, entry)
  // Bound memory: keep the map from growing without limit.
  if (mem.size > 200) {
    const first = mem.keys().next().value
    if (first !== undefined) mem.delete(first)
  }
  return entry
}
