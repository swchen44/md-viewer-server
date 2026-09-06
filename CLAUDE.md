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

## Code review and plan review: use Codex

From now on, code review (of an implementation diff) and plan review (of a plan/design document) must go through the `codex` plugin (`openai/codex-plugin-cc`) instead of dispatching a Claude sonnet/opus reviewer subagent. This applies to every review step in the subagent-driven-development workflow (per-task review and the final whole-branch closing review) and to reviewing a newly written plan document before execution starts.

Prerequisite (one-time per environment): the plugin must be enabled (`/plugin install codex@openai-codex` if not already installed) and the Codex CLI must be set up and authenticated — run `/codex:setup` to check/install/login.

Usage:

- **Code review of a task's diff** (e.g. reviewing one subagent-driven-development task's commit): run `/codex:review --base <prev-commit-sha>` — this repo works directly on `main` with no feature branches, so `--base` should point at the commit immediately before the task's commit(s). Use `--wait` for a small diff, `--background` for a larger one (check `/codex:status` / `/codex:result` for background runs).
- **Plan review, or a deeper/adversarial pass on an implementation or design** (e.g. reviewing a freshly written plan doc, or challenging a task's chosen approach rather than just checking for bugs): run `/codex:adversarial-review --base <prev-commit-sha> [focus text]`, optionally adding focus text describing what to scrutinize (e.g. "review this plan for missing edge cases and security gaps" when the diff being reviewed is the plan document's own commit).
- Both commands are review-only: they return Codex's findings, they don't apply fixes. If Critical/Important findings come back, dispatch a fix the same way as before (sonnet/opus implementer subagent, or fix directly).
- See the plugin's own skills (`codex-cli-runtime`, `codex-result-handling`) for how the underlying async task/result flow works if you need to go beyond the slash commands above.

This does not change how implementers are dispatched — implementers are still Claude subagents on sonnet or opus (never haiku). Only the review step's executor changes, from a Claude reviewer subagent to Codex.
