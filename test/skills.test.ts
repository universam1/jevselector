import { describe, expect, test } from "bun:test"
import { findSkillsPartIndex, parseSkills, rewriteSkillsBlock } from "../src/skills.ts"

const BLOCK = `Some preamble text.
<available_skills>
  <skill>
    <id>simplify</id>
    <name>simplify</name>
    <description>Simplifies code for clarity without changing behavior.</description>
  </skill>
  <skill>
    <id>pdf</id>
    <name>pdf</name>
    <description>Work with PDF files.</description>
  </skill>
</available_skills>
Some trailing text.`

describe("skills", () => {
  test("findSkillsPartIndex locates the block", () => {
    expect(findSkillsPartIndex([{ text: "no block here" }, { text: BLOCK }])).toBe(1)
    expect(findSkillsPartIndex([{ text: "nothing" }])).toBe(-1)
  })

  test("parseSkills extracts id/name/description", () => {
    const skills = parseSkills(BLOCK)
    expect(skills).toHaveLength(2)
    expect(skills[0]).toEqual({
      id: "simplify",
      name: "simplify",
      description: "Simplifies code for clarity without changing behavior.",
    })
    expect(skills[1]!.id).toBe("pdf")
  })

  test("parseSkills returns empty when no block", () => {
    expect(parseSkills("no skills here")).toEqual([])
  })

  test("rewriteSkillsBlock keeps only selected skills", () => {
    const skills = parseSkills(BLOCK)
    const kept = skills.filter((s) => s.id === "simplify")
    const out = rewriteSkillsBlock(BLOCK, kept)
    expect(out).toContain("<id>simplify</id>")
    expect(out).not.toContain("<id>pdf</id>")
    expect(out).toContain("Some preamble text.")
    expect(out).toContain("Some trailing text.")
  })

  test("rewriteSkillsBlock with empty keep produces empty block", () => {
    const out = rewriteSkillsBlock(BLOCK, [])
    expect(out).toContain("<available_skills></available_skills>")
    expect(out).not.toContain("<id>simplify</id>")
    expect(out).toContain("Some preamble text.")
  })

  test("rewrite is idempotent round-trip on kept set", () => {
    const skills = parseSkills(BLOCK)
    const out = rewriteSkillsBlock(BLOCK, skills)
    const reparsed = parseSkills(out)
    expect(reparsed.map((s) => s.id)).toEqual(skills.map((s) => s.id))
  })
})
