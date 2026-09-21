import { describe, expect, test } from "bun:test"
import { extractUserRequest } from "../src/messages.ts"

describe("extractUserRequest", () => {
  test("extracts text from array content of last user message", () => {
    const msgs = [
      { role: "user", content: [{ type: "text", text: "first" }] },
      { role: "assistant", content: [{ type: "text", text: "reply" }] },
      { role: "user", content: [{ type: "text", text: "second request" }] },
    ]
    expect(extractUserRequest(msgs)).toBe("second request")
  })

  test("handles string content", () => {
    expect(extractUserRequest([{ role: "user", content: "plain string" }])).toBe("plain string")
  })

  test("joins multiple text parts", () => {
    const msgs = [{ role: "user", content: [{ type: "text", text: "a" }, { type: "text", text: "b" }] }]
    expect(extractUserRequest(msgs)).toBe("a\nb")
  })

  test("reads role from info.role fallback", () => {
    expect(extractUserRequest([{ info: { role: "user" }, content: [{ type: "text", text: "x" }] }])).toBe("x")
  })

  test("returns empty when no user message", () => {
    expect(extractUserRequest([{ role: "assistant", content: "hi" }])).toBe("")
    expect(extractUserRequest([])).toBe("")
  })

  test("ignores non-text parts", () => {
    const msgs = [{ role: "user", content: [{ type: "image", url: "x" }, { type: "text", text: "only this" }] }]
    expect(extractUserRequest(msgs)).toBe("only this")
  })
})
