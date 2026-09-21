// Extract the current user request text from the session.context messages.
//
// M0 confirmed messages are: { id, role, content, metadata } where `content`
// is an array of parts like { type: "text", text: string }. We take the last
// user message and join its text parts.

interface ContentPart {
  type?: string
  text?: string
}
interface Message {
  role?: string
  info?: { role?: string }
  content?: string | ContentPart[]
}

export function extractUserRequest(messages: unknown[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i] as Message | undefined
    const role = m?.role ?? m?.info?.role
    if (role !== "user") continue
    const c = m?.content
    if (typeof c === "string") return c.trim()
    if (Array.isArray(c)) {
      return c
        .filter((p) => p?.type === "text" && typeof p.text === "string")
        .map((p) => p.text)
        .join("\n")
        .trim()
    }
  }
  return ""
}
