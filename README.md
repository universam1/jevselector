# jevselector

An [OpenCode](https://opencode.ai) **v2** plugin that uses [Jev](https://typesafe.ai)
(TypeSafe AI's "System One" decision model) to dynamically select which **skills**
and **tools** are exposed to the model on each turn — trimming the system prompt
and tool set to only what is relevant to the current request.

## Why

OpenCode advertises every discovered skill's description in the system prompt on
**every** turn, and exposes the full tool set. With ~30 skills installed, the
`<available_skills>` block alone can be **over half of the system prompt** — spent
describing skills the current request will never use.

jevselector asks Jev, per turn, which skills and tools are actually relevant to
the current user request and active agent, and removes the rest **from that
request only**. Nothing is unregistered globally; a hidden skill is still loadable
by exact id if the model asks for it.

## Measured results

Real OpenCode v2.0.12 run against a live Jev endpoint, default agent, ~34 skills:

| User request | Skills kept | Tokens saved | % of system prompt |
| --- | --- | --- | --- |
| Refactor a Python function | `simplify`, `verification-planning` | ~2,950 | **~52%** |
| Create a PowerPoint deck | `pptx` | ~3,060 | **~54%** |
| Debug a Remotion render | `remotion-*` (4) | ~3,000 | **~53%** |
| Map codebase architecture | `codemap` | ~3,180 | **~56%** |

Verified end-to-end: the measured **outgoing** system prompt dropped from ~5,672
to ~2,724 tokens on a real turn. Jev decision cost: ~250–950 ms, cached across
tool-continuation turns. Token figures are ~4-chars/token estimates.

## How it works

1. Registers a `session.context` hook (fires once per model turn).
2. Extracts the advertised skills (from the `<available_skills>` system block),
   the outgoing tool set, the current user request, and the active agent.
3. Sends **one batched Jev request** — a `noul` relevance question per skill and
   per tool over shared state.
4. Rewrites the skills block to only the relevant skills, and deletes irrelevant
   tools from the request. Applied to that request only.
5. Caches the decision per `(agent, request, candidate-set)`, so multi-step turns
   and delegated sub-agents (e.g. oh-my-opencode-slim `orchestrator` →
   `librarian`) each get their own rating without re-calling Jev on continuations.
6. **Fails open** (exposes everything) on any Jev error or timeout.

## Requirements

- OpenCode **v2** (tested on v2.0.12) with the `@opencode-ai/plugin` v2 promise API.
- A TypeSafe AI API key in `TYPESAFE_API_KEY`.
- Node 20+ / Bun (OpenCode's plugin runtime).

## Install

Add to your `opencode.json`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    { "package": "jevselector", "options": { "keepThreshold": 0.5 } }
  ]
}
```

Set your key (do not commit it):

```sh
export TYPESAFE_API_KEY=...   # e.g. in your shell profile
```

Restart OpenCode (or start a new run) to load the plugin.

## Configuration

All options are optional.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `keepThreshold` | number | `0.5` | Keep an item when its Jev `noul` probability is ≥ this. |
| `model` | string | `"jev-latest"` | Jev model alias. |
| `baseUrl` | string | `https://api.typesafe.ai/v1/systemone` | Jev endpoint. |
| `apiKey` | string | `$TYPESAFE_API_KEY` | API key (prefer the env var). |
| `timeoutMs` | number | `4000` | Abort the Jev call after this; then fail open. |
| `filterSkills` | boolean | `true` | Filter the advertised skills block. |
| `filterTools` | boolean | `true` | Drop irrelevant tools from the request. |
| `alwaysKeepSkills` | string[] | `[]` | Skill ids never removed. |
| `alwaysKeepTools` | string[] | `[]` | Tool ids never removed. |
| `verbose` | boolean | `false` | Log decisions to stderr. |

### Recommended safety pinning

By default jevselector trusts Jev completely (no allowlist). On some turns Jev may
score workflow-critical skills as irrelevant. If you use a multi-agent setup such
as oh-my-opencode-slim, consider pinning orchestration skills so they are never
dropped:

```jsonc
{
  "plugins": [
    {
      "package": "jevselector",
      "options": {
        "alwaysKeepSkills": ["oh-my-opencode-slim", "deepwork", "worktrees", "verification-planning"]
      }
    }
  ]
}
```

## MCP tools

- When OpenCode exposes MCP tools as top-level `<server>_<tool>` entries, they
  appear in the per-turn tool set and **are filtered** like any other tool.
- When **Code Mode** is enabled, OpenCode collapses most MCP tools behind the
  `execute` tool; individual MCP tools are not separately addressable in the
  per-turn hook and therefore cannot be filtered per-tool. This is by OpenCode's
  design. In Code Mode, jevselector still filters skills and any top-level tools.

## Limitations & notes

- Relevance is only as good as Jev's judgment and your `keepThreshold`. Start at
  `0.5` and tune. Lower keeps more (safer, less savings); higher keeps less.
- Removing a skill from the advertisement does not revoke loading it by exact id.
- Token savings compound across a conversation because the system prompt is
  re-sent every turn, while the Jev decision is cached per request.

## Development

```sh
bun install
bun test          # unit tests for the pure logic
bun run typecheck # tsc --noEmit
```

The `dev/` directory contains the M0/M1 verification harness (runtime probes and
the end-to-end measurement script) used to validate the approach against a real
OpenCode install.

## License

[MIT](./LICENSE) © universam1
