// Configuration for jevselector, read from plugin options with env fallbacks.

export interface JevSelectorConfig {
  /** Jev model alias. */
  model: string
  /** Jev API base URL. */
  baseUrl: string
  /** API key. Falls back to env TYPESAFE_API_KEY. */
  apiKey: string | undefined
  /** noul probability >= this keeps the item. */
  keepThreshold: number
  /** Abort the Jev call after this many ms; on timeout we fail open. */
  timeoutMs: number
  /** Whether to filter the advertised skills block. */
  filterSkills: boolean
  /** Whether to drop irrelevant tools from the request. Includes MCP tools that
   *  are exposed as top-level `<server>_<tool>` entries. NOTE: when OpenCode
   *  "Code Mode" is enabled, most MCP tools are collapsed behind the `execute`
   *  tool and are not individually addressable here; they cannot be filtered
   *  per-tool in that mode (this is by OpenCode's design, not a bug). */
  filterTools: boolean
  /** Tool IDs that are never candidates for removal (always kept). Empty by default (pure Jev). */
  alwaysKeepTools: string[]
  /** Skill IDs that are never candidates for removal. Empty by default (pure Jev). */
  alwaysKeepSkills: string[]
  /** When true, log decisions loudly to stderr (testing mode). */
  verbose: boolean
}

const DEFAULTS: JevSelectorConfig = {
  model: "jev-latest",
  baseUrl: "https://api.typesafe.ai/v1/systemone",
  apiKey: undefined,
  keepThreshold: 0.5,
  timeoutMs: 4000,
  filterSkills: true,
  filterTools: true,
  alwaysKeepTools: [],
  alwaysKeepSkills: [],
  verbose: false,
}

function num(v: unknown, d: number): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN
  return Number.isFinite(n) ? n : d
}

function bool(v: unknown, d: boolean): boolean {
  if (typeof v === "boolean") return v
  if (v === "true") return true
  if (v === "false") return false
  return d
}

function strArr(v: unknown, d: string[]): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : d
}

export function resolveConfig(options: Record<string, unknown>): JevSelectorConfig {
  return {
    model: typeof options.model === "string" ? options.model : DEFAULTS.model,
    baseUrl: typeof options.baseUrl === "string" ? options.baseUrl : DEFAULTS.baseUrl,
    apiKey:
      (typeof options.apiKey === "string" ? options.apiKey : undefined) ??
      process.env.TYPESAFE_API_KEY,
    keepThreshold: num(options.keepThreshold, DEFAULTS.keepThreshold),
    timeoutMs: num(options.timeoutMs, DEFAULTS.timeoutMs),
    filterSkills: bool(options.filterSkills, DEFAULTS.filterSkills),
    filterTools: bool(options.filterTools, DEFAULTS.filterTools),
    alwaysKeepTools: strArr(options.alwaysKeepTools, DEFAULTS.alwaysKeepTools),
    alwaysKeepSkills: strArr(options.alwaysKeepSkills, DEFAULTS.alwaysKeepSkills),
    verbose: bool(options.verbose, DEFAULTS.verbose),
  }
}
