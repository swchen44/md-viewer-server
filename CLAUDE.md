# CLAUDE.md

This file provides guidance to Claude Code when working in this repository.

## Commit convention

Commit at the granularity of one logical section/module per commit — do not batch unrelated sections into one commit. Every commit message must cover three parts, in this order:

- **Why**: the motivation or problem this section addresses
- **What**: what was added or changed
- **How**: the approach/mechanism used

Example:

```
Add token-based auth middleware

Why: REST API and WebSocket need to reject unauthenticated LAN traffic
without adding brute-force protection complexity (accepted risk for
LAN-only deployment, see design spec).
What: 4-digit token stored in config.json, checked via X-Auth-Token
header for REST and query string for WS handshake.
How: Express middleware compares header/query token against config
value in constant time; WS upgrade handler checks token before accepting.
```

## Design spec

See `docs/superpowers/specs/2026-09-05-md-viewer-server-design.md` for the full design.

## UI checkpoint review during implementation

When executing the implementation plan, pause after each completed UI-facing segment (e.g. one panel, one view mode, one settings tab) and present it to the user for acceptance before starting the next segment. The user may not be at the keyboard continuously: schedule a wakeup roughly 3 minutes out; if there's no response by then, treat the segment as accepted and continue to the next one. Non-UI backend segments (API endpoints, daemon logic) don't need this checkpoint — only pause where a human needs to actually look at something.

## Code review and plan review: do not use Codex

Do not use the `codex` plugin (`/codex:review`, `/codex:adversarial-review`, or any other `codex:*` command) for code review or plan review. An earlier version of this file directed review through Codex; that's reverted — the tool repeatedly hung for long stretches (stuck on an environment-side command unrelated to the diff being reviewed) during real use in this project, wasting significant time across multiple sessions.

Review (per-task, and the final whole-branch/whole-plan closing review) goes back to dispatching a Claude reviewer subagent — sonnet or opus, never haiku, matching how implementers are dispatched. This is the original subagent-driven-development review flow: after a task's implementer reports back, generate the review package (`scripts/review-package <prev-commit> <new-commit>`) and dispatch a sonnet/opus reviewer subagent against it. If Critical/Important findings come back, dispatch a fix the same way (sonnet/opus, never haiku).
