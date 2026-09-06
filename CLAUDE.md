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

## Watch for orphaned `vitest` worker processes

`npm run test:unit`/`test:integration`/`test:frontend` all run `vitest run` (not watch mode), which is supposed to exit on its own once the suite finishes. In a long subagent-driven-development session with many implementer/reviewer subagents each running these commands repeatedly, worker processes have been observed to survive past their parent command (e.g. when a subagent's shell session ends or times out while vitest's worker pool is still spinning up/down) and pile up in the background — each one still consuming real CPU, and enough of them accumulating noticeably slows down the whole machine, to the point of interfering with other work running on it at the same time.

Periodically check for this — e.g. after a batch of tasks, or whenever things feel slower than they should:

```bash
ps aux | grep -i vitest | grep -v grep
```

If several `node (vitest N)` processes are listed and have been running far longer than any single `npm run test:*` invocation should take (a normal run finishes in a few seconds), they're orphaned — kill them:

```bash
ps aux | grep -i vitest | grep -v grep | awk '{print $2}' | xargs -r kill -9
```

This is safe: they're ephemeral test-runner workers with no unsaved state, not anything from the user's own work.
