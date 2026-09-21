# dev harness

Verification artifacts used to build jevselector against a real OpenCode install.

- `probe/` — M0 runtime probes that discovered the real v2 plugin context
  (`ctx.session.hook("context")`, mutable `system`/`tools`, `skill.transform`).
- `e2e/` — end-to-end config + a verify plugin that measures the post-filter
  system prompt size in a live `opencode run`.
- `probe/measure.ts` — synthetic measurement: feeds a captured context to real
  Jev and computes token savings per request.

These are not part of the published package.
