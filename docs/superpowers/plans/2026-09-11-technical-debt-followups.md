# Technical Debt Follow-ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the three deferred defects recorded in the Claude session: strict route parameter validation, settings synchronization across browser clients, and outline content search.

**Architecture:** Keep one shared route helper for all root-scoped APIs and preserve existing structured error codes. Extend the existing single WebSocket event stream with `settings-changed`; clients refresh settings through the existing API rather than duplicating settings payload parsing. Keep outline search local to the active tab's already-loaded content, with regex execution isolated in the existing Worker path.

**Tech Stack:** Node.js, Express, WebSocket, React, TypeScript, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-05-md-viewer-server-design.md`

## Global Constraints

- Keep CLI/API and browser behavior backwards compatible except for malformed input, which must return a structured 400 error rather than throwing.
- Do not create a second WebSocket connection; extend `useFileWatcher`.
- Every production behavior change starts with a failing test and ends with the relevant suite passing.
- Keep settings persisted on the daemon; browser clients must re-fetch the authoritative value after `settings-changed`.
- Outline content search is scoped to the active tab and must not read arbitrary files or send content to the server.

### Task 1: Harden root/path parameters across scoped APIs

**Files:**
- Create: `src/server/root-params.js`
- Modify: `src/server/api/file.js`
- Modify: `src/server/api/file-path.js`
- Modify: `src/server/api/rename-mkdir.js`
- Modify: `src/server/api/asset.js`
- Modify: `src/server/api/search.js`
- Modify: `src/server/api/tabs.js`
- Test: `tests/unit/server/root-params.test.js`
- Test: relevant API test files for missing `path` and malformed `root`

**Interfaces:**
- `parseRootId(value) -> number | null`: accepts only a canonical non-negative integer string or integer number.
- `findRoot(roots, value) -> root | null`: uses strict parsing and never treats empty strings, arrays, or objects as root `0`.
- `requireRelativePath(value) -> string`: rejects missing, non-string, empty, absolute, and traversal-shaped values with a structured path-parameter error handled by each router.

- [x] Write unit tests proving malformed root values do not select root 0 and missing paths produce a controlled error.
- [x] Run the focused tests and observe the expected failures against current route-local helpers.
- [x] Implement the shared parsing/validation helpers and update all six routers.
- [x] Run focused API tests, then all unit and integration tests.
- [x] Commit the hardening as one logical change.

### Task 2: Broadcast settings changes to connected browsers

**Files:**
- Modify: `src/server/api/settings.js`
- Modify: `src/server/app.js`
- Modify: `src/frontend/hooks/useFileWatcher.ts`
- Modify: `src/frontend/hooks/useSettings.ts`
- Modify: `src/frontend/App.tsx`
- Test: `tests/integration/api-plantuml-settings.test.js` or a focused settings API test
- Test: `tests/frontend/useFileWatcher.test.ts`
- Test: `tests/frontend/useSettings.test.ts`
- Test: `tests/frontend/App.test.tsx`

**Interfaces:**
- `createSettingsRouter(configDir, daemonControl)` broadcasts `{type: 'settings-changed'}` after a successful PUT.
- `useFileWatcher` accepts `onSettingsChanged?: () => void` and dispatches the new event type.
- `useSettings` exposes a stable `reloadSettings(): Promise<void>` that replaces the current settings with the daemon response.

- [x] Add failing server and frontend tests for the event and refresh behavior.
- [x] Run the focused tests and verify they fail because no event/handler exists.
- [x] Add the daemonControl wiring and settings event dispatch.
- [x] Add the hook reload method and connect App's event handler without opening another socket.
- [x] Run frontend, unit, and integration tests.
- [x] Commit the settings synchronization change.

### Task 3: Search outline headings, content, or both

**Files:**
- Modify: `src/frontend/components/SearchBar.tsx`
- Modify: `src/frontend/components/OutlinePanel.tsx`
- Modify: `src/frontend/App.tsx`
- Test: `tests/frontend/SearchBar.test.tsx`
- Test: `tests/frontend/OutlinePanel.test.tsx`
- Test: `tests/frontend/App.test.tsx`

**Interfaces:**
- `OutlineSearchTarget = 'title' | 'content' | 'both'`.
- `OutlineSearchOptions` carries `{target, regex}`.
- `OutlinePanel` receives the active tab content and applies case-insensitive substring or Worker-backed regex matching to headings and/or source lines, returning heading line numbers for navigation.

- [x] Add failing component tests proving outline mode renders three target choices and content/both produce matching results.
- [x] Run the focused frontend tests and verify the failures are due to the missing controls/logic.
- [x] Implement target selection and local content matching, retaining current regex Worker safeguards.
- [x] Run all frontend tests and typecheck.
- [x] Perform a real browser check of outline title/content/both behavior and stop for UI checkpoint acceptance.
- [x] Commit the UI change with `[UI CHECKPOINT]` in the message.

## Definition of Done

- [x] Malformed root/path parameters return structured 400 responses and never throw uncaught TypeErrors.
- [x] All connected browser clients refresh settings after a successful settings update.
- [x] Outline mode supports title, content, and both searches in plain text and regex modes.
- [x] `npm run lint`, `npm run typecheck:frontend`, `npm run test:frontend`, `npm run test:unit`, `npm run test:integration`, and `npm run build` pass.
- [x] The UI checkpoint has been manually verified in a browser.
