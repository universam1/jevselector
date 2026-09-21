import { describe, expect, test, afterEach } from "bun:test"
import { resolveConfig } from "../src/config.ts"

const savedKey = process.env.TYPESAFE_API_KEY

afterEach(() => {
  if (savedKey === undefined) delete process.env.TYPESAFE_API_KEY
  else process.env.TYPESAFE_API_KEY = savedKey
})

describe("resolveConfig", () => {
  test("applies defaults", () => {
    delete process.env.TYPESAFE_API_KEY
    const c = resolveConfig({})
    expect(c.model).toBe("jev-latest")
    expect(c.keepThreshold).toBe(0.5)
    expect(c.filterSkills).toBe(true)
    expect(c.filterTools).toBe(true)
    expect(c.alwaysKeepTools).toEqual([])
    expect(c.apiKey).toBeUndefined()
  })

  test("options override defaults", () => {
    const c = resolveConfig({
      model: "jev-1.13.0",
      keepThreshold: 0.7,
      filterTools: false,
      alwaysKeepTools: ["read", "shell"],
      alwaysKeepSkills: ["deepwork"],
      verbose: true,
    })
    expect(c.model).toBe("jev-1.13.0")
    expect(c.keepThreshold).toBe(0.7)
    expect(c.filterTools).toBe(false)
    expect(c.alwaysKeepTools).toEqual(["read", "shell"])
    expect(c.alwaysKeepSkills).toEqual(["deepwork"])
    expect(c.verbose).toBe(true)
  })

  test("coerces string numbers and booleans", () => {
    const c = resolveConfig({ keepThreshold: "0.3", filterSkills: "false" })
    expect(c.keepThreshold).toBe(0.3)
    expect(c.filterSkills).toBe(false)
  })

  test("apiKey option beats env", () => {
    process.env.TYPESAFE_API_KEY = "env-key"
    expect(resolveConfig({ apiKey: "opt-key" }).apiKey).toBe("opt-key")
    expect(resolveConfig({}).apiKey).toBe("env-key")
  })

  test("invalid number falls back to default", () => {
    expect(resolveConfig({ keepThreshold: "not-a-number" }).keepThreshold).toBe(0.5)
  })
})
