# Playwright E2E Test Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Add a deterministic Playwright smoke suite that exercises the built dist/bundle.js and browser UI, then run it in GitHub Actions as npm run test:e2e.

**Architecture:** Playwright webServer starts a foreground test-server wrapper. The wrapper creates temporary XDG config/state directories and a temporary document root, then spawns dist/bundle.js with a fixed test token. Tests use real HTTP and WebSocket traffic, reset shared state between tests, and run with one worker because the daemon registry and fixture root are shared.

**Tech Stack:** @playwright/test 1.63.0, Chromium, Node.js, the existing Express/ws daemon, and GitHub Actions.

**Spec:** Current behavior documented in README.md, README.zh-TW.md, and docs/DEVELOPER.md; server contracts in src/server/app.js, src/server/api/, and src/server/ws-server.js.

## Global Constraints

- Runtime support remains Node.js >=18.0.0; CI uses .nvmrc Node 20.
- E2E always tests build output. Run npm run build before starting the test server and require dist/bundle.js plus dist/frontend/index.html.
- Every run uses temporary XDG_CONFIG_HOME, XDG_STATE_HOME, and a temporary root. Never touch the developer's home config.
- Use token 1234 only inside the isolated test process. Do not upload it as a standalone artifact.
- PlantUML and version checks stay disabled in the fixture, so E2E never depends on an external service.
- Keep tests serial with workers: 1 until each worker owns a separate daemon and root.
- Prefer existing data-testid, accessible roles, labels, and visible text. Do not add screenshot pixel comparisons in the first suite.
- Retain trace, screenshot, video, and HTML report on failures.

---

### Task 1: Add the Playwright runner and isolated build-server fixture

**Files:**
- Modify: package.json and package-lock.json
- Create: playwright.config.js
- Create: scripts/e2e-server.js
- Create: tests/e2e/fixtures.js
- Modify: .gitignore

**Interfaces:**
- Produces npm run test:e2e using playwright test --config=playwright.config.js.
- Produces node scripts/e2e-server.js --port <port>, which serves dist/bundle.js and exits cleanly on SIGTERM.
- Produces fixture helpers TOKEN, api(request, endpoint, options), openApp(page), getRootPath(request), resetFixture(request, rootPath), and openFile(page, relPath).

- [ ] Step 1: Add the pinned dependency and script.

Run:

~~~bash
npm install --save-dev @playwright/test@1.63.0
~~~

Add this script:

~~~json
"test:e2e": "playwright test --config=playwright.config.js"
~~~

Expected: package-lock.json records @playwright/test and npm run test:e2e -- --list resolves after the config exists.

- [ ] Step 2: Configure Playwright.

Create playwright.config.js with testDir tests/e2e, a 30-second test timeout, a 5-second expect timeout, fullyParallel false, workers 1, CI-only retries, list plus HTML reporters, outputDir test-results, and use settings for:

~~~text
baseURL: http://127.0.0.1:<port>
trace: retain-on-failure
screenshot: only-on-failure
video: retain-on-failure
~~~

Configure webServer with command node scripts/e2e-server.js --port <port>, health URL http://127.0.0.1:<port>/api/health, 120-second startup timeout, reuseExistingServer false, and graceful shutdown with SIGTERM.

Expected: the runner waits for the unauthenticated health endpoint and never reuses an unrelated daemon.

- [ ] Step 3: Implement the isolated foreground server wrapper.

scripts/e2e-server.js must:

1. Parse the numeric --port argument.
2. Create temporary config, state, and root directories below os.tmpdir().
3. Write config.json with token 1234, the requested port, one temporary root, privacyMode false, sendToPlantUmlServer false, and checkForUpdates false.
4. Seed README.md, notes.md, and sandbox.html with deterministic content.
5. Spawn node dist/bundle.js with temporary XDG_CONFIG_HOME and XDG_STATE_HOME.
6. Forward SIGTERM and SIGINT to the child, remove temporary directories after exit, and return the child exit code.
7. Fail clearly before spawning if dist/bundle.js or dist/frontend/index.html is absent.

Do not launch bin/cli.js start here. That command detaches a daemon; CLI lifecycle behavior is already covered by tests/integration/cli-lifecycle.test.js.

- [ ] Step 4: Add shared fixture helpers and reset logic.

tests/e2e/fixtures.js should export test and expect from @playwright/test. TOKEN is 1234 and AUTH_HEADERS is { 'X-Auth-Token': TOKEN }. rootPath comes from GET /api/health. api merges AUTH_HEADERS with caller headers. openApp navigates to /?token=1234 and waits for [data-testid="app-shell"]. openFile scopes the click to [data-testid="file-tree-panel"] and waits for the requested content.

resetFixture must rewrite the three seed files, restore baseline settings, and delete known open-tab paths through DELETE /api/tabs. Use the root path returned by /api/health so disk-change tests can use fs without another hidden channel.

- [ ] Step 5: Ignore generated output.

Add playwright-report/ and test-results/ to .gitignore.

- [ ] Step 6: Verify and commit the runner foundation.

~~~bash
npm run build
npx playwright test --config=playwright.config.js --list
git add package.json package-lock.json playwright.config.js scripts/e2e-server.js tests/e2e/fixtures.js .gitignore
git commit -m "Add isolated Playwright E2E runner"
~~~

Expected: the runner lists tests once specs exist and no user daemon or config is touched.

---

### Task 2: Cover authentication, rendering, editing, saving, and conflicts

**Files:**
- Create: tests/e2e/auth-and-edit.spec.js
- Modify: tests/e2e/fixtures.js only for missing helpers

- [ ] Step 1: Add the authentication smoke test.

Test name: loads the shell with the CLI token and removes it from the address bar.

Open the app, assert [data-testid="app-shell"] is visible, assert the final URL has no token query parameter, and request GET /api/roots without headers. The response must be 401.

- [ ] Step 2: Add the render/edit/save test.

Test name: opens a Markdown file, edits it, and persists Ctrl+S.

Open README.md, assert the seeded heading, click [data-testid="mode-edit"], fill the textarea with a unique marker, wait for the PUT /api/file response while pressing Control+S on Linux or Meta+S on macOS, then verify the marker through authenticated GET /api/file?root=0&path=README.md.

- [ ] Step 3: Add the conflict dialog test.

Test name: shows a conflict dialog when disk content changes during an edit.

Open README.md, enter a local edit, overwrite the same file using fs.writeFileSync(path.join(rootPath, 'README.md'), ...), press save, and assert role dialog with accessible name File conflict. Click Keep mine and overwrite, wait for the force PUT, and verify the local marker through the API.

- [ ] Step 4: Run and commit this spec.

~~~bash
npm run build
npx playwright test tests/e2e/auth-and-edit.spec.js --config=playwright.config.js
git add tests/e2e/auth-and-edit.spec.js
git commit -m "Add Playwright auth and editing coverage"
~~~

Expected: 3 tests pass in one worker without external network calls.

---

### Task 3: Cover file search, outline search, regex, and live reload

**Files:**
- Create: tests/e2e/search-outline-reload.spec.js

Seed README.md with a heading-only marker, a body-only marker named install dependencies, and a second heading.

- [ ] Step 1: Test file Content search.

Test name: finds a body-only marker with file Content search.

In the Files sidebar, select Content, fill Search... with install dependencies, and assert [data-testid="search-results"] contains README.md.

- [ ] Step 2: Test outline Title, Content, and Both.

Test name: filters the outline by title, content, and both.

Open README.md, switch to Outline, assert seeded headings, then run a Title query for the heading marker, a Content query for install dependencies, and a Both query for the heading marker. Reset the query between targets and assert the owning heading remains each time.

- [ ] Step 3: Test anchored outline regex matching.

Test name: matches an outline content regex against the source line.

Select outline Content, enable the regex control, search for ^install dependencies, and assert Setup remains visible. This is the browser-level regression for source-line anchoring.

- [ ] Step 4: Test WebSocket live reload.

Test name: reloads a clean viewing tab after an on-disk change.

Open README.md in View mode, wait for the original marker, overwrite it with a new marker using rootPath, and wait for [data-testid="markdown-view"] to contain the new marker. Do not assert a fixed timing value.

- [ ] Step 5: Run and commit.

~~~bash
npm run build
npx playwright test tests/e2e/search-outline-reload.spec.js --config=playwright.config.js
git add tests/e2e/search-outline-reload.spec.js
git commit -m "Add Playwright search and reload coverage"
~~~

Expected: 4 tests pass; the anchored regex case exercises the browser path, not only unit tests.

---

### Task 4: Cover settings synchronization, HTML sandbox, and remote tabs

**Files:**
- Create: tests/e2e/settings-sandbox-sync.spec.js

Use a second page in the same browser context. Both pages use token 1234 and the same daemon.

- [ ] Step 1: Test settings synchronization.

Test name: propagates privacy mode to a second browser page.

Open Settings on both pages, toggle Privacy mode on page one, and assert on page two that Privacy mode is checked and remote-content, PlantUML, and HTML-script controls are disabled. Reset settings through the authenticated API.

- [ ] Step 2: Test the HTML sandbox boundary.

Test name: renders HTML in a sandbox without same-origin access.

Open sandbox.html, locate iframe[title="html-preview"], assert sandbox contains allow-scripts and does not contain allow-same-origin, and keep all fixture script and assets local.

- [ ] Step 3: Test remote tab synchronization.

Test name: synchronizes a tab opened and closed from another page.

Open notes.md from page one, assert its tab appears on page two after tab-opened, close it from page one, and assert it disappears on page two after tab-closed. Use the accessible close label.

- [ ] Step 4: Run and commit.

~~~bash
npm run build
npx playwright test tests/e2e/settings-sandbox-sync.spec.js --config=playwright.config.js
git add tests/e2e/settings-sandbox-sync.spec.js
git commit -m "Add Playwright settings and sync coverage"
~~~

Expected: 3 tests pass with both pages sharing one token and one daemon.

---

### Task 5: Re-enable E2E in GitHub Actions with diagnostics

**Files:**
- Modify: .github/workflows/ci.yml

- [ ] Step 1: Install Chromium after build.

~~~yaml
- name: Install Playwright browsers
  run: npx playwright install --with-deps chromium
~~~

- [ ] Step 2: Run the suite.

~~~yaml
- name: E2E tests
  run: npm run test:e2e
~~~

Keep lint, typecheck, unit, build, and integration steps. The Playwright config owns one-worker execution and CI retries.

- [ ] Step 3: Upload reports after success or failure.

~~~yaml
- name: Upload Playwright report
  if: ${{ !cancelled() }}
  uses: actions/upload-artifact@v4
  with:
    name: playwright-report
    path: |
      playwright-report/
      test-results/
    retention-days: 14
~~~

- [ ] Step 4: Run CI-equivalent commands locally.

~~~bash
npm ci
npm run lint
npm run typecheck:frontend
npm run test:unit
npm run build
npm run test:integration
npx playwright install chromium
npm run test:e2e
~~~

Expected: every command exits 0 and generated reports remain ignored by git.

- [ ] Step 5: Commit CI integration.

~~~bash
git add .github/workflows/ci.yml
git commit -m "Run Playwright E2E tests in CI"
~~~

---

### Task 6: Update documentation and perform final verification

**Files:**
- Modify: README.md
- Modify: README.zh-TW.md
- Modify: docs/DEVELOPER.md
- Modify: docs/superpowers/specs/2026-09-05-md-viewer-server-design.md

- [ ] Step 1: Document the E2E workflow.

Add npm run test:e2e to both READMEs and describe the required build, local browser install, temporary fixture isolation, and playwright-report/test-results diagnostics in docs/DEVELOPER.md. Remove the statement that no E2E suite exists. Keep npm and offline release status separate.

- [ ] Step 2: Reconcile the historical design note.

Keep the historical banner and state that Playwright E2E is now implemented. Leave genuinely unimplemented design items labeled historical.

- [ ] Step 3: Run final verification.

~~~bash
git diff --check
npm run lint
npm run typecheck:frontend
npm run test:unit
npm run test:frontend
npm run build
npm run test:integration
npm run test:e2e
~~~

Expected: all commands exit 0, all Playwright tests pass, and ps shows no orphaned vitest or server/entry.js processes.

- [ ] Step 4: Commit documentation.

~~~bash
git add README.md README.zh-TW.md docs/DEVELOPER.md docs/superpowers/specs/2026-09-05-md-viewer-server-design.md
git commit -m "Document Playwright E2E workflow"
~~~

## Out of scope

- A second browser project or mobile matrix.
- Pixel-diff visual regression baselines.
- Running the detached CLI lifecycle through Playwright.
- Implementing the currently no-op --debug flag.
