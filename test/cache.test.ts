import { describe, expect, test } from "bun:test"
import { cacheKey, memGet, memSet } from "../src/cache.ts"

describe("cache", () => {
  test("cacheKey is stable regardless of candidate order", () => {
    const a = cacheKey({ agent: "orchestrator", userRequest: "hi", skillIds: ["a", "b"], toolIds: ["x", "y"] })
    const b = cacheKey({ agent: "orchestrator", userRequest: "hi", skillIds: ["b", "a"], toolIds: ["y", "x"] })
    expect(a).toBe(b)
  })

  test("cacheKey differs by agent (sub-agent independence)", () => {
    const orch = cacheKey({ agent: "orchestrator", userRequest: "hi", skillIds: ["a"], toolIds: [] })
    const lib = cacheKey({ agent: "librarian", userRequest: "hi", skillIds: ["a"], toolIds: [] })
    expect(orch).not.toBe(lib)
  })

  test("cacheKey differs by request", () => {
    const one = cacheKey({ agent: "x", userRequest: "req one", skillIds: [], toolIds: [] })
    const two = cacheKey({ agent: "x", userRequest: "req two", skillIds: [], toolIds: [] })
    expect(one).not.toBe(two)
  })

  test("memSet/memGet round-trip", () => {
    const key = cacheKey({ agent: "a", userRequest: "r", skillIds: ["s1"], toolIds: ["t1"] })
    expect(memGet(key)).toBeUndefined()
    memSet(key, {
      keepSkillIds: new Set(["s1"]),
      keepToolIds: new Set(["t1"]),
      usage: { input: 1, output: 1 },
      latencyMs: 1,
    })
    const got = memGet(key)
    expect(got?.keepSkillIds).toEqual(["s1"])
    expect(got?.keepToolIds).toEqual(["t1"])
  })
})
