// Runtime augmentation types for the OpenCode v2 plugin context.
//
// The shipped @opencode-ai/plugin/v2/promise .d.ts under-declares the runtime
// context. M0 runtime probing (OpenCode v2.0.12) confirmed the real ctx exposes
// a `session` domain with a `hook("context", ...)` method whose event carries
// mutable `system`, `tools`, plus `agent`, `model`, `messages`, `options`.
//
// These types describe only what jevselector uses. They are intentionally
// permissive where the exact upstream shape is not guaranteed.

export interface SystemPart {
  type?: string
  text?: string
  [k: string]: unknown
}

export interface ToolDef {
  description: string
  input?: unknown
  [k: string]: unknown
}

export interface ModelRef {
  providerID: string
  id: string
  variant?: string
}

/** Event passed to the `session.context` hook. Mutating it affects only the
 *  outgoing model request for this turn. */
export interface SessionContextEvent {
  readonly sessionID: string
  readonly agent: string
  readonly model: ModelRef
  system: SystemPart[]
  messages: unknown[]
  options: Record<string, unknown>
  tools: Record<string, ToolDef>
}

export interface Registration {
  dispose(): Promise<void>
}

export interface SessionDomain {
  hook(
    name: "context",
    cb: (event: SessionContextEvent) => void | Promise<void>,
  ): Promise<Registration>
  hook(name: string, cb: (event: unknown) => void | Promise<void>): Promise<Registration>
}

export interface PluginStorage {
  get(key: string): Promise<unknown>
  set(key: string, value: unknown): Promise<void>
  remove(key: string): Promise<void>
}

/** Only the members jevselector reads. The real ctx has many more. */
export interface RuntimePluginContext {
  options: Record<string, unknown>
  session: SessionDomain
  storage?: PluginStorage
}
