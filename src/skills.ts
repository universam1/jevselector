// Parse and rebuild the <available_skills> block embedded in a system prompt part.
//
// M0 confirmed OpenCode advertises skills as an XML-ish block inside one system
// part's text:
//   <available_skills>
//     <skill><id>..</id><name>..</name><description>..</description></skill>
//     ...
//   </available_skills>

export interface AdvertisedSkill {
  id: string
  name: string
  description: string
}

const BLOCK_RE = /<available_skills>[\s\S]*?<\/available_skills>/
const SKILL_RE =
  /<skill>\s*<id>([\s\S]*?)<\/id>\s*<name>([\s\S]*?)<\/name>\s*<description>([\s\S]*?)<\/description>\s*<\/skill>/g

/** Find which system part index contains the skills block, or -1. */
export function findSkillsPartIndex(system: { text?: string }[]): number {
  return system.findIndex((p) => typeof p.text === "string" && p.text.includes("<available_skills>"))
}

export function parseSkills(blockText: string): AdvertisedSkill[] {
  const m = blockText.match(BLOCK_RE)
  if (!m) return []
  const out: AdvertisedSkill[] = []
  for (const s of m[0].matchAll(SKILL_RE)) {
    out.push({ id: s[1]!.trim(), name: s[2]!.trim(), description: s[3]!.trim() })
  }
  return out
}

function renderSkill(s: AdvertisedSkill): string {
  return `  <skill>\n    <id>${s.id}</id>\n    <name>${s.name}</name>\n    <description>${s.description}</description>\n  </skill>`
}

/**
 * Replace the <available_skills> block in `text` so it only advertises `keep`.
 * If `keep` is empty, the block is replaced with an empty <available_skills/>
 * marker to preserve surrounding structure while removing all descriptions.
 * Skills not in `keep` remain loadable by exact id (OpenCode validates by id),
 * they are just no longer advertised.
 */
export function rewriteSkillsBlock(text: string, keep: AdvertisedSkill[]): string {
  const replacement =
    keep.length === 0
      ? `<available_skills></available_skills>`
      : `<available_skills>\n${keep.map(renderSkill).join("\n")}\n</available_skills>`
  return text.replace(BLOCK_RE, replacement)
}
