# 工具列擴充功能 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 這是使用者在 session 中途追加的需求，不屬於原本 `/goal` 的六個子計畫，獨立成一份小計畫：(1) `start` 未指定 `--root` 時預設用執行時的工作目錄，(2) TopBar 加入全螢幕切換、顯示路徑（複製到剪貼簿）、列印三個按鈕，(3) 版本檢查（偵測到 npm 上有新版本時顯示提示，不自動更新）。

**Architecture:**
- 預設 root：只改 `bin/cli.js` 的 CLI 入口邏輯，新增一個可獨立單元測試的純函式 `resolveRoots(roots, cwd)`（放在 `cli-args.js`），不改動 `runStart`/`startWithRotatedToken` 既有、已測試過的行為
- 顯示路徑：新增 `GET /api/file-path?root=&path=`，內部沿用既有 `resolveSafePath`（跟真正讀檔案用的是同一套已審查過的路徑安全邏輯，不另開一條新的路徑運算邏輯）
- 全螢幕/列印：純前端瀏覽器 API（`document.documentElement.requestFullscreen()` / `window.print()`），不需要後端
- 版本檢查：比照 PlantUML proxy 的既有模式——`checkForUpdates` 設定預設 `false`（未經同意不主動連外网），`GET /api/version-check` 在關閉時完全不打真正的網路請求；只做「偵測+提示」，不做自動更新

**Tech Stack:** 沿用既有 Node.js + Express 後端、React + TypeScript 前端，不新增套件（複製到剪貼簿用瀏覽器原生 API + `document.execCommand('copy')` fallback，因為這個 app 設計上是透過 `http://<lan-ip>:port/`（非 https）存取，多數瀏覽器的 `navigator.clipboard` API 只在「安全情境」下可用，LAN 上的純 http 存取通常不算安全情境，所以不能只靠 `navigator.clipboard`）。

## Global Constraints

- `checkForUpdates` 預設 `false`，關閉時 `GET /api/version-check` 完全不對外發出任何 HTTP 請求（跟 `sendToPlantUmlServer` 關閉時 `POST /api/plantuml-proxy` 回 403 不打上游的既有模式一致）
- 版本檢查只「偵測+提示」，絕對不做任何自動下載/安裝/覆蓋套件的行為
- 顯示路徑功能只處理「目前作用中分頁對應的伺服器端真實磁碟路徑」這一種情境（不處理瀏覽器網址列，因為這個 app 前端一律是 `http://host:port/`，沒有 `file://` 網址）
- Commit 規範（`CLAUDE.md`）：一個邏輯段落一個 commit，Why/What/How 三段式；UI 段落標註 `[UI CHECKPOINT]`
- Review 方式：依 `CLAUDE.md` 規則，用 `/codex:review --base <prev-commit-sha>` 做 code review，不 dispatch Claude reviewer subagent
- `checkForUpdates` 這個設定值本身的「開關 UI」留給 `docs/superpowers/plans/2026-09-06-settings-menu.md` 的 Task 6（一般分頁）補上（該 plan 尚未實作，屆時在那份文件里加一個小待辦即可，不在這裡重複建置一套獨立的設定 UI）

---

## File Structure

```
src/server/
├── commands/
│   └── cli-args.js                    ← 新增 resolveRoots (Modify)
├── settings.js                           ← 新增 checkForUpdates 欄位 (Modify)
├── version-check.js                         ← 新建：呼叫 npm registry 比對版本
└── api/
    ├── file-path.js                            ← 新建：GET /api/file-path
    └── version-check.js                           ← 新建：GET /api/version-check

bin/cli.js                                          ← 接上 resolveRoots (Modify)

src/frontend/
├── clipboard.ts                                        ← 新建：copyText() 含 fallback
├── components/
│   ├── TopBar.tsx                                          ← 加三個按鈕 (Modify)
│   └── PathModal.tsx                                          ← 新建：顯示路徑 + 複製
└── App.tsx                                                       ← 接線 (Modify)

tests/unit/server/
├── cli-args.test.js（既有，擴充）
├── settings.test.js（既有，擴充）
└── version-check.test.js（新建）

tests/integration/
├── api-file-path.test.js（新建）
├── api-version-check.test.js（新建）
└── cli-lifecycle.test.js（既有，擴充：無 --root 時預設 cwd）

tests/frontend/
├── clipboard.test.ts
├── PathModal.test.tsx
└── TopBar.test.tsx（新建——Plan 5 從未替 TopBar 建立獨立測試檔，這裡補上）
```

---

### Task 1: `start` 未指定 `--root` 時預設用執行時的工作目錄

**Files:**
- Modify: `src/server/commands/cli-args.js`
- Modify: `bin/cli.js`
- Test: `tests/unit/server/cli-args.test.js`
- Test: 擴充 `tests/integration/cli-lifecycle.test.js`

**Interfaces:**
- Produces: `resolveRoots(roots: string[], cwd: string): string[]` — `roots` 非空時原封不動回傳；`roots` 為空陣列時回傳 `[cwd]`

- [ ] **Step 1: 寫失敗測試**

在 `tests/unit/server/cli-args.test.js` 加入：

```js
import { resolveRoots } from '../../../src/server/commands/cli-args.js'

describe('resolveRoots', () => {
  it('returns the given roots unchanged when at least one is provided', () => {
    expect(resolveRoots(['/a', '/b'], '/cwd')).toEqual(['/a', '/b'])
  })

  it('defaults to the cwd when no --root was given at all', () => {
    expect(resolveRoots([], '/cwd')).toEqual(['/cwd'])
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npm run test:unit -- cli-args.test.js`
Expected: FAIL — `resolveRoots` 未匯出

- [ ] **Step 3: 實作**

在 `src/server/commands/cli-args.js` 加入：

```js
export function resolveRoots(roots, cwd) {
  return roots.length > 0 ? roots : [cwd]
}
```

在 `bin/cli.js`：

```js
import { parseArgs, resolveRoots } from '../src/server/commands/cli-args.js'
// ...
async function main() {
  const { command, roots: rawRoots, port, debug, rotateToken: shouldRotateToken } = parseArgs(
    process.argv.slice(2)
  )

  if (command === 'start') {
    const roots = resolveRoots(rawRoots, process.cwd())
    // 後面所有原本用 `roots` 的地方（startWithRotatedToken/runStart 呼叫）維持不變，
    // 只是現在傳進去的 roots 已經套用過預設值
    ...
  }
```

（實作者請對照現有 `bin/cli.js` 的確切變數命名調整，重點是：只在 `command === 'start'` 分支內套用 `resolveRoots`，不影響 `status`/`stop`/`doctor` 等不需要 `roots` 的指令；`runStart`/`startWithRotatedToken` 本身完全不用修改，維持它們既有對「傳入空陣列 roots 就回報 `no-valid-roots`」的單元測試不變。）

- [ ] **Step 4: 執行測試確認通過**

Run: `npm run test:unit -- cli-args.test.js`
Expected: PASS（2 個新測試）

- [ ] **Step 5: 擴充 integration 測試**

在 `tests/integration/cli-lifecycle.test.js` 加入一個案例：不帶 `--root` 啟動（但用 `cwd` option 指定一個暫存目錄當作子行程的工作目錄），驗證 daemon 成功啟動且該目錄被當成 root：

```js
it('defaults to the invoking working directory when --root is omitted', async () => {
  const cwdRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-default-root-'))
  await execFileAsync(process.execPath, [CLI_PATH, 'start', '--port', String(TEST_PORT)], {
    env,
    cwd: cwdRoot,
  })
  const statusRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/roots`, {
    headers: { 'X-Auth-Token': /* 讀取剛啟動的 token，比照既有測試取得方式 */ '' },
  })
  // 實作者請對照既有測試如何取得剛啟動 daemon 的 token（通常從 stdout 解析或讀 config.json）
  expect(statusRes.status).toBe(200)
})
```

（實作者請對照這個檔案既有測試的 token 取得方式與斷言風格調整，重點是驗證「不給 `--root`、daemon 依然能啟動並把呼叫時的工作目錄當成唯一 root」這條路徑。記得 `afterEach` 要清掉 `cwdRoot` 暫存目錄。）

- [ ] **Step 6: 執行測試確認通過**

Run: `npm run test:integration -- cli-lifecycle`
Expected: PASS

- [ ] **Step 7: Codex code review**

Run: `/codex:review --base <prev-commit-sha>`

- [ ] **Step 8: Commit**

```bash
git add src/server/commands/cli-args.js bin/cli.js tests/unit/server/cli-args.test.js tests/integration/cli-lifecycle.test.js
git commit -m "$(cat <<'EOF'
Default start's root to the invoking working directory

Why: Running `md-viewer-server start` with no --root currently fails
outright ("No valid roots to serve") — for the common case of running
the command from inside the project/folder you want to serve, this
is unnecessary friction; defaulting to the current working directory
matches how most CLI dev tools behave (npm, git, etc.) when no
explicit target is given.
What: Added a small pure resolveRoots(roots, cwd) helper — roots
unchanged if any --root was given, otherwise [cwd]. Wired into
bin/cli.js's `start` branch (both plain start and start
--rotate-token) before calling into runStart/startWithRotatedToken,
which are both left completely untouched so their existing unit tests
(asserting an explicitly-empty roots array reports no-valid-roots)
keep passing unchanged.
How: The default is applied at the CLI-argument layer, not inside
runStart/startWithRotatedToken, specifically to avoid touching those
functions' existing, well-tested "no roots given" contract — an
empty array still means exactly what it meant before to any caller
other than the real CLI entry point.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KCkr3UUhi36YHAEiAAhp5L
EOF
)"
```

---

### Task 2: 後端 — `GET /api/file-path`（顯示路徑用）

**Files:**
- Create: `src/server/api/file-path.js`
- Modify: `src/server/app.js`
- Test: `tests/integration/api-file-path.test.js`

**Interfaces:**
- Produces: `GET /api/file-path?root=&path=` → `200 {absolutePath: string}`；root 不存在回 `404 {errorCode: 'ROOT_NOT_FOUND'}`；路徑不安全回 `400 {errorCode: 'UNSAFE_PATH'}`（沿用 `file.js` 既有的 `findRoot`/`resolveSafePath` 模式）

- [ ] **Step 1: 讀取 `src/server/api/file.js` 作為對照範本**

- [ ] **Step 2: 寫失敗測試**

`tests/integration/api-file-path.test.js`（對照既有 `tests/integration/api-search.test.js` 或 `api-*.test.js` 的 app 建置/token 設置慣例調整）：

```js
it('returns the real absolute path for a file under a valid root', async () => {
  const res = await request(app)
    .get(`/api/file-path?root=0&path=notes/a.md`)
    .set('X-Auth-Token', token)
  expect(res.status).toBe(200)
  expect(res.body.absolutePath).toBe(path.join(testRoot, 'notes/a.md'))
})

it('returns 404 ROOT_NOT_FOUND for an unknown root id', async () => {
  const res = await request(app).get(`/api/file-path?root=999&path=a.md`).set('X-Auth-Token', token)
  expect(res.status).toBe(404)
  expect(res.body.errorCode).toBe('ROOT_NOT_FOUND')
})

it('returns 400 UNSAFE_PATH for a path-traversal attempt', async () => {
  const res = await request(app)
    .get(`/api/file-path?root=0&path=../../../etc/passwd`)
    .set('X-Auth-Token', token)
  expect(res.status).toBe(400)
  expect(res.body.errorCode).toBe('UNSAFE_PATH')
})

it('requires auth', async () => {
  const res = await request(app).get(`/api/file-path?root=0&path=a.md`)
  expect(res.status).toBe(401)
})
```

- [ ] **Step 3: 執行測試確認失敗**

Run: `npm run test:integration -- api-file-path`
Expected: FAIL — 404（路由不存在）

- [ ] **Step 4: 實作**

`src/server/api/file-path.js`:

```js
import express from 'express'
import { resolveSafePath, PathSafetyError } from '../path-safety.js'

function findRoot(roots, rootId) {
  return roots.find((r) => r.id === Number(rootId))
}

export function createFilePathRouter(roots) {
  const router = express.Router()

  router.get('/file-path', (req, res) => {
    const root = findRoot(roots, req.query.root)
    if (!root) return res.status(404).json({ errorCode: 'ROOT_NOT_FOUND' })

    try {
      const absolutePath = resolveSafePath(root.path, req.query.path)
      res.json({ absolutePath })
    } catch (err) {
      if (err instanceof PathSafetyError) return res.status(400).json({ errorCode: 'UNSAFE_PATH' })
      throw err
    }
  })

  return router
}
```

在 `src/server/app.js` 掛載（跟其他 `/api` router 放一起）：

```js
import { createFilePathRouter } from './api/file-path.js'
// ...
app.use('/api', authMiddleware, createFilePathRouter(roots))
```

- [ ] **Step 5: 執行測試確認通過**

Run: `npm run test:integration -- api-file-path`
Expected: PASS（4 個測試）

- [ ] **Step 6: Codex code review**

Run: `/codex:review --base <prev-commit-sha>`

- [ ] **Step 7: Commit**

```bash
git add src/server/api/file-path.js src/server/app.js tests/integration/api-file-path.test.js
git commit -m "$(cat <<'EOF'
Add GET /api/file-path for the frontend's show-path feature

Why: The frontend's new "show path" feature needs the real absolute
disk path of the currently open file to display and let the user
copy — that path is server-side private state (never sent as part of
GET /api/roots, deliberately, to avoid leaking filesystem layout at
large), so a dedicated endpoint that computes it on-demand for one
specific already-authorized file is the right shape rather than
broadly exposing every root's absolute path.
What: GET /api/file-path?root=&path= reuses the same findRoot/
resolveSafePath pattern already used by the real file-read endpoint
(file.js), so the exact same security-audited path resolution and
traversal protection applies here too, rather than introducing a
second, potentially-divergent path-computation code path.
How: Requires auth like every other /api route; a path-traversal
attempt gets the same 400 UNSAFE_PATH the real file endpoints already
return.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KCkr3UUhi36YHAEiAAhp5L
EOF
)"
```

---

### Task 3: 前端 — 複製到剪貼簿工具函式

**Files:**
- Create: `src/frontend/clipboard.ts`
- Test: `tests/frontend/clipboard.test.ts`

**Interfaces:**
- Produces: `copyText(text: string): Promise<void>` — 優先用 `navigator.clipboard.writeText`；該 API 不存在（例如透過純 `http://` 存取 LAN daemon，瀏覽器視為非安全情境）或呼叫失敗時，退回 `document.execCommand('copy')` 的舊寫法；兩者都失敗則 throw

- [ ] **Step 1: 寫失敗測試**

`tests/frontend/clipboard.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { copyText } from '../../src/frontend/clipboard.js'

describe('copyText', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('uses navigator.clipboard.writeText when available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    await copyText('hello')
    expect(writeText).toHaveBeenCalledWith('hello')
  })

  it('falls back to execCommand when navigator.clipboard is unavailable', async () => {
    vi.stubGlobal('navigator', {})
    const execCommand = vi.fn().mockReturnValue(true)
    document.execCommand = execCommand
    await copyText('hello')
    expect(execCommand).toHaveBeenCalledWith('copy')
  })

  it('falls back to execCommand when navigator.clipboard.writeText throws', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const execCommand = vi.fn().mockReturnValue(true)
    document.execCommand = execCommand
    await copyText('hello')
    expect(execCommand).toHaveBeenCalledWith('copy')
  })

  it('throws when both the clipboard API and execCommand fail', async () => {
    vi.stubGlobal('navigator', {})
    document.execCommand = vi.fn().mockReturnValue(false)
    await expect(copyText('hello')).rejects.toThrow()
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npm run test:frontend -- clipboard.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: 實作**

`src/frontend/clipboard.ts`:

```ts
// This app is designed to be reached over plain http://<lan-ip>:<port>/ (see
// the design spec's LAN-only deployment model), not https — most browsers
// only expose navigator.clipboard on a "secure context" (https, or
// localhost), so the modern Clipboard API can be entirely absent for a
// real user on a real LAN link. Fall back to the older execCommand-based
// copy trick (deprecated, but still the only thing that works there).
export async function copyText(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch {
      // fall through to the legacy fallback below
    }
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()
  let ok = false
  try {
    ok = document.execCommand('copy')
  } finally {
    document.body.removeChild(textarea)
  }
  if (!ok) throw new Error('Copy failed: no working clipboard mechanism available')
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `npm run test:frontend -- clipboard.test.ts`
Expected: PASS（4 個測試）

- [ ] **Step 5: Codex code review**

Run: `/codex:review --base <prev-commit-sha>`

- [ ] **Step 6: Commit**

```bash
git add src/frontend/clipboard.ts tests/frontend/clipboard.test.ts
git commit -m "$(cat <<'EOF'
Add a copy-to-clipboard helper with a plain-http fallback

Why: The upcoming show-path feature needs to copy text to the system
clipboard, but navigator.clipboard requires a secure context — and
this app is designed to be reached over plain http://<lan-ip>:<port>/
per the design spec's LAN deployment model, which most browsers do
not treat as secure. Relying on navigator.clipboard alone would
silently fail to even exist for a real user on a real LAN link.
What: copyText() tries navigator.clipboard.writeText first (works
when the API is present, e.g. localhost or a future https setup),
and falls back to the older document.execCommand('copy') trick
(hidden textarea + select + execCommand) when the modern API is
absent or throws.
How: Deprecated API used deliberately as a fallback of last resort,
not the primary path — a comment explains why it's still needed here.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KCkr3UUhi36YHAEiAAhp5L
EOF
)"
```

---

### Task 4: 前端 — 顯示路徑 Modal + TopBar 接線

**Files:**
- Create: `src/frontend/components/PathModal.tsx`
- Modify: `src/frontend/components/TopBar.tsx`
- Modify: `src/frontend/App.tsx`
- Test: `tests/frontend/PathModal.test.tsx`
- Test: `tests/frontend/TopBar.test.tsx`（新建，Plan 5 從未替 TopBar 建過獨立測試檔）
- Test: 擴充 `tests/frontend/App.test.tsx`

**Interfaces:**
- `<PathModal open={boolean} path={string | null} onClose={() => void} />` — `open=false`或 `path=null` 時不渲染；否則顯示 `role="dialog"`，內容為 `path` 文字 + 一個複製按鈕；按鈕點擊呼叫 `copyText(path)`，成功時文字短暫（1500ms）變成翻譯過的「已複製」，失敗變成「複製失敗」，之後恢復原文字
- `TopBar` 新增 `onShowPath: () => void`（呼叫端負責決定要不要真的開 modal，例如沒有作用中分頁時可以直接不理會或顯示無檔案提示）、`onFullscreen: () => void`、`onPrint: () => void` 三個必要 prop，渲染順序：全螢幕、顯示路徑、列印

- [ ] **Step 1: 加入 i18n 鍵**

在 5 個 `src/frontend/i18n/locales/*.json` 加入（`en.json` 範例）：

```json
{
  "topBar": {
    "fullscreenLabel": "Fullscreen",
    "showPathLabel": "Show path",
    "printLabel": "Print"
  },
  "pathModal": {
    "ariaLabel": "File path",
    "copy": "Copy",
    "copied": "Copied",
    "copyFailed": "Copy failed",
    "noFileOpen": "No file open"
  }
}
```

（其餘 4 語言請對應翻譯，遵循既有巢狀結構慣例。）

- [ ] **Step 2: 寫失敗測試（PathModal）**

`tests/frontend/PathModal.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PathModal } from '../../src/frontend/components/PathModal.js'
import * as clipboard from '../../src/frontend/clipboard.js'

describe('PathModal', () => {
  afterEach(() => vi.restoreAllMocks())

  it('renders nothing when open is false', () => {
    render(<PathModal open={false} path="/a/b.md" onClose={() => {}} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders nothing when path is null even if open is true', () => {
    render(<PathModal open={true} path={null} onClose={() => {}} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows the path text', () => {
    render(<PathModal open={true} path="/Users/a/測試 b.md" onClose={() => {}} />)
    expect(screen.getByText('/Users/a/測試 b.md')).toBeInTheDocument()
  })

  it('shows "Copied" briefly after a successful copy, then reverts', async () => {
    vi.spyOn(clipboard, 'copyText').mockResolvedValue(undefined)
    vi.useFakeTimers({ shouldAdvanceTime: true })
    render(<PathModal open={true} path="/a.md" onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /^copy$/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /copied/i })).toBeInTheDocument())
    vi.advanceTimersByTime(1500)
    await waitFor(() => expect(screen.getByRole('button', { name: /^copy$/i })).toBeInTheDocument())
    vi.useRealTimers()
  })

  it('shows "Copy failed" when copyText rejects', async () => {
    vi.spyOn(clipboard, 'copyText').mockRejectedValue(new Error('denied'))
    render(<PathModal open={true} path="/a.md" onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /^copy$/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /copy failed/i })).toBeInTheDocument())
  })
})
```

- [ ] **Step 3: 執行測試確認失敗**

Run: `npm run test:frontend -- PathModal.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 4: 實作 PathModal**

`src/frontend/components/PathModal.tsx`:

```tsx
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { copyText } from '../clipboard.js'

interface PathModalProps {
  open: boolean
  path: string | null
  onClose: () => void
}

type CopyState = 'idle' | 'copied' | 'failed'

export function PathModal({ open, path, onClose }: PathModalProps) {
  const { t } = useTranslation()
  const [copyState, setCopyState] = useState<CopyState>('idle')

  if (!open || path === null) return null

  async function handleCopy() {
    try {
      await copyText(path!)
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
    setTimeout(() => setCopyState('idle'), 1500)
  }

  const copyLabel =
    copyState === 'copied'
      ? t('pathModal.copied', 'Copied')
      : copyState === 'failed'
        ? t('pathModal.copyFailed', 'Copy failed')
        : t('pathModal.copy', 'Copy')

  return (
    <div role="dialog" aria-label={t('pathModal.ariaLabel', 'File path')}>
      <p>{path}</p>
      <button onClick={handleCopy}>{copyLabel}</button>
      <button onClick={onClose} aria-label="close">
        ×
      </button>
    </div>
  )
}
```

- [ ] **Step 5: 執行測試確認通過**

Run: `npm run test:frontend -- PathModal.test.tsx`
Expected: PASS（5 個測試）

- [ ] **Step 6: 寫失敗測試（TopBar）**

`tests/frontend/TopBar.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TopBar } from '../../src/frontend/components/TopBar.js'

describe('TopBar', () => {
  it('renders fullscreen, show-path, and print buttons in that order', () => {
    render(<TopBar onFullscreen={() => {}} onShowPath={() => {}} onPrint={() => {}} />)
    const buttons = screen.getAllByRole('button')
    const labels = buttons.map((b) => b.getAttribute('aria-label'))
    const fsIndex = labels.findIndex((l) => /fullscreen/i.test(l ?? ''))
    const pathIndex = labels.findIndex((l) => /show path|path/i.test(l ?? ''))
    const printIndex = labels.findIndex((l) => /print/i.test(l ?? ''))
    expect(fsIndex).toBeGreaterThanOrEqual(0)
    expect(pathIndex).toBeGreaterThan(fsIndex)
    expect(printIndex).toBeGreaterThan(pathIndex)
  })

  it('calls onFullscreen/onShowPath/onPrint when clicked', () => {
    const onFullscreen = vi.fn()
    const onShowPath = vi.fn()
    const onPrint = vi.fn()
    render(<TopBar onFullscreen={onFullscreen} onShowPath={onShowPath} onPrint={onPrint} />)
    fireEvent.click(screen.getByLabelText(/fullscreen/i))
    fireEvent.click(screen.getByLabelText(/show path|^path$/i))
    fireEvent.click(screen.getByLabelText(/print/i))
    expect(onFullscreen).toHaveBeenCalledOnce()
    expect(onShowPath).toHaveBeenCalledOnce()
    expect(onPrint).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 7: 執行測試確認失敗**

Run: `npm run test:frontend -- TopBar.test.tsx`
Expected: FAIL — `TopBar` 目前不接受這些 props

- [ ] **Step 8: 實作**

讀取目前的 `TopBar.tsx`（Plan 5 Task 4/5 留下的版本，含既有的 settings 齒輪按鈕，若 Plan 7 尚未執行則齒輪按鈕可能還不存在——請對照實際檔案調整，不要假設任何未確認的既有內容），在既有的按鈕群組裡，依全螢幕、顯示路徑、列印的順序加入三個按鈕：

```tsx
interface TopBarProps {
  onFullscreen: () => void
  onShowPath: () => void
  onPrint: () => void
  // ...既有 props（如果有的話）保持不變
}

export function TopBar({ onFullscreen, onShowPath, onPrint /* , ...existing */ }: TopBarProps) {
  const { t } = useTranslation()
  return (
    <header data-testid="top-bar" style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px' }}>
      <span>MD Viewer Server</span>
      <div>
        <button aria-label={t('topBar.fullscreenLabel', 'Fullscreen')} onClick={onFullscreen}>
          ⛶
        </button>
        <button aria-label={t('topBar.showPathLabel', 'Show path')} onClick={onShowPath}>
          🔗
        </button>
        <button aria-label={t('topBar.printLabel', 'Print')} onClick={onPrint}>
          🖨
        </button>
        {/* 既有按鈕（若有）維持原位置，不在本 task 調整順序 */}
      </div>
    </header>
  )
}
```

- [ ] **Step 9: 執行測試確認通過**

Run: `npm run test:frontend -- TopBar.test.tsx`
Expected: PASS（2 個測試）

- [ ] **Step 10: 接進 `App.tsx`**

新增：
1. `pathModalOpen` state（boolean）與 `currentPath` state（`string | null`）
2. `handleShowPath()`：若無 `activeTab` 直接不動作（或設 `currentPath` 為 `null`，`PathModal` 自己就不會渲染）；否則呼叫 `GET /api/file-path?root=<activeTab.rootId>&path=<activeTab.relPath>`，把回傳的 `absolutePath` 存進 `currentPath`，開啟 modal
3. `handleFullscreen()`：`document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => {})`
4. `handlePrint()`：`window.print()`
5. 渲染 `<TopBar onFullscreen={handleFullscreen} onShowPath={handleShowPath} onPrint={handlePrint} />` 與 `<PathModal open={pathModalOpen} path={currentPath} onClose={() => setPathModalOpen(false)} />`

（實作者請對照目前 `App.tsx` 實際的 state/handler 組織方式調整，不要重新設計既有的整體結構。）

在 `tests/frontend/App.test.tsx` 加入一個案例，驗證點擊「顯示路徑」按鈕在有作用中分頁時會呼叫 `GET /api/file-path` 並顯示回傳的路徑（對照既有測試的 fetch mock 慣例調整）。

- [ ] **Step 11: 執行完整驗證**

Run: `npm run lint && npm run typecheck:frontend && npm run test:frontend`
Expected: 全部通過

- [ ] **Step 12: Codex code review**

Run: `/codex:review --base <prev-commit-sha>`

- [ ] **Step 13: Commit — 這是一個 UI 段落**

```bash
git add src/frontend/components/PathModal.tsx src/frontend/components/TopBar.tsx src/frontend/App.tsx src/frontend/i18n/locales/*.json tests/frontend/PathModal.test.tsx tests/frontend/TopBar.test.tsx tests/frontend/App.test.tsx
git commit -m "$(cat <<'EOF'
Add fullscreen, show-path, and print buttons to TopBar

Why: User-requested addition: a way to see and copy the real disk
path of the file currently being viewed (useful when e.g. handing a
path to another tool), plus fullscreen and print — none of which
existed in this app's TopBar yet.
What: TopBar gains three buttons in this order: fullscreen (toggles
document.documentElement.requestFullscreen()/exitFullscreen()), show
path (fetches GET /api/file-path for the active tab and opens
PathModal with a copy-to-clipboard button), print (window.print()).
PathModal shows nothing when there's no active tab (path stays null).
How: [UI CHECKPOINT] UI-facing segment per CLAUDE.md's checkpoint
rule.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KCkr3UUhi36YHAEiAAhp5L
EOF
)"
```

---

### Task 5: 版本檢查 — 後端

**Files:**
- Modify: `src/server/settings.js`
- Create: `src/server/version-check.js`
- Create: `src/server/api/version-check.js`
- Modify: `src/server/app.js`
- Test: `tests/unit/server/settings.test.js`（擴充）
- Test: `tests/unit/server/version-check.test.js`
- Test: `tests/integration/api-version-check.test.js`

**Interfaces:**
- `readSettings` 新增 `checkForUpdates: boolean`（預設 `false`）；`ALLOWED_SETTINGS_KEYS` 新增 `'checkForUpdates'`
- `checkLatestVersion({currentVersion, fetchImpl, registryUrl, timeoutMs}): Promise<{latestVersion: string, updateAvailable: boolean} | null>` — 失敗（逾時、非 200、格式錯誤）一律回傳 `null`，不 throw
- `GET /api/version-check` → `checkForUpdates` 為 `false` 時**完全不發出任何網路請求**，直接回傳 `{enabled: false}`；為 `true` 時回傳 `{enabled: true, currentVersion, latestVersion, updateAvailable}`，若檢查失敗則 `{enabled: true, currentVersion, latestVersion: null, updateAvailable: false}`

- [ ] **Step 1: 寫失敗測試**

在 `tests/unit/server/settings.test.js` 加入：

```js
it('defaults checkForUpdates to false', () => {
  expect(readSettings(configDir).checkForUpdates).toBe(false)
})

it('accepts checkForUpdates through updateSettings', () => {
  updateSettings(configDir, { checkForUpdates: true })
  expect(readSettings(configDir).checkForUpdates).toBe(true)
})
```

`tests/unit/server/version-check.test.js`:

```js
import { describe, it, expect, vi } from 'vitest'
import { checkLatestVersion } from '../../../src/server/version-check.js'

describe('checkLatestVersion', () => {
  it('returns updateAvailable: true when the registry reports a newer version', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ version: '9.9.9' }),
    })
    const result = await checkLatestVersion({ currentVersion: '0.1.0', fetchImpl })
    expect(result).toEqual({ latestVersion: '9.9.9', updateAvailable: true })
  })

  it('returns updateAvailable: false when already on the latest version', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ version: '0.1.0' }),
    })
    const result = await checkLatestVersion({ currentVersion: '0.1.0', fetchImpl })
    expect(result).toEqual({ latestVersion: '0.1.0', updateAvailable: false })
  })

  it('returns null (does not throw) when the registry is unreachable', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('network error'))
    const result = await checkLatestVersion({ currentVersion: '0.1.0', fetchImpl })
    expect(result).toBeNull()
  })

  it('returns null when the registry responds with a non-200 status', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 404 })
    const result = await checkLatestVersion({ currentVersion: '0.1.0', fetchImpl })
    expect(result).toBeNull()
  })

  it('returns null when the response body has no usable version field', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) })
    const result = await checkLatestVersion({ currentVersion: '0.1.0', fetchImpl })
    expect(result).toBeNull()
  })
})
```

`tests/integration/api-version-check.test.js`（對照既有 integration 測試慣例調整 app/token 設置）：

```js
it('does not call fetch at all when checkForUpdates is disabled (default)', async () => {
  const res = await request(app).get('/api/version-check').set('X-Auth-Token', token)
  expect(res.status).toBe(200)
  expect(res.body).toEqual({ enabled: false })
})

it('performs the check and reports updateAvailable when enabled', async () => {
  await request(app)
    .put('/api/settings')
    .set('X-Auth-Token', token)
    .send({ checkForUpdates: true })
  // 實作者請視需要 mock 全域 fetch 或注入 fetchImpl，避免測試真的打外部網路
  const res = await request(app).get('/api/version-check').set('X-Auth-Token', token)
  expect(res.status).toBe(200)
  expect(res.body.enabled).toBe(true)
})

it('requires auth', async () => {
  const res = await request(app).get('/api/version-check')
  expect(res.status).toBe(401)
})
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npm run test:unit -- settings.test.js version-check.test.js && npm run test:integration -- api-version-check`
Expected: FAIL

- [ ] **Step 3: 實作**

`src/server/settings.js` 加入 `checkForUpdates`（同 `sendToPlantUmlServer` 的模式，加進 `ALLOWED_SETTINGS_KEYS` 陣列與 `readSettings` 的回傳物件，預設 `false`）。

`src/server/version-check.js`:

```js
const REGISTRY_URL = 'https://registry.npmjs.org/md-viewer-server/latest'
const TIMEOUT_MS = 3000

function isNewerVersion(latest, current) {
  const toParts = (v) => v.split('.').map(Number)
  const [lMaj, lMin, lPatch] = toParts(latest)
  const [cMaj, cMin, cPatch] = toParts(current)
  if (lMaj !== cMaj) return lMaj > cMaj
  if (lMin !== cMin) return lMin > cMin
  return lPatch > cPatch
}

export async function checkLatestVersion({
  currentVersion,
  fetchImpl = fetch,
  registryUrl = REGISTRY_URL,
  timeoutMs = TIMEOUT_MS,
}) {
  try {
    const res = await fetchImpl(registryUrl, { signal: AbortSignal.timeout(timeoutMs) })
    if (!res.ok) return null
    const body = await res.json()
    if (typeof body.version !== 'string') return null
    return { latestVersion: body.version, updateAvailable: isNewerVersion(body.version, currentVersion) }
  } catch {
    return null
  }
}
```

`src/server/api/version-check.js`:

```js
import express from 'express'
import { readSettings } from '../settings.js'
import { checkLatestVersion } from '../version-check.js'
import { readFileSync } from 'node:fs'

// package.json 版本號在編譯期由 esbuild `define` 內嵌（沿用 entry.js 既有的
// __MVS_BUNDLED_VERSION__ 機制），開發模式下才即時讀檔。
function currentVersion() {
  if (typeof __MVS_BUNDLED_VERSION__ !== 'undefined') return __MVS_BUNDLED_VERSION__
  const pkg = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf-8'))
  return pkg.version
}

export function createVersionCheckRouter(configDir) {
  const router = express.Router()

  router.get('/version-check', async (req, res) => {
    const { checkForUpdates } = readSettings(configDir)
    if (!checkForUpdates) {
      return res.json({ enabled: false })
    }
    const version = currentVersion()
    const result = await checkLatestVersion({ currentVersion: version })
    res.json({
      enabled: true,
      currentVersion: version,
      latestVersion: result?.latestVersion ?? null,
      updateAvailable: result?.updateAvailable ?? false,
    })
  })

  return router
}
```

（實作者請對照 `entry.js`/`scripts/build.js` 既有的 `__MVS_BUNDLED_VERSION__` define 機制的實際變數名稱與用法調整，不要假設；若該機制目前只用在 `entry.js` 內部、沒有暴露成可以在其他檔案引用的共用常數，就地取讀 `package.json` 版本號也是可接受的簡化。）

在 `src/server/app.js` 掛載：

```js
app.use('/api', authMiddleware, createVersionCheckRouter(configDir))
```

- [ ] **Step 4: 執行測試確認通過**

Run: `npm run test:unit -- settings.test.js version-check.test.js && npm run test:integration -- api-version-check`
Expected: PASS

- [ ] **Step 5: Codex code review**

Run: `/codex:review --base <prev-commit-sha>`

- [ ] **Step 6: Commit**

```bash
git add src/server/settings.js src/server/version-check.js src/server/api/version-check.js src/server/app.js tests/unit/server/settings.test.js tests/unit/server/version-check.test.js tests/integration/api-version-check.test.js
git commit -m "$(cat <<'EOF'
Add opt-in version-check settings field and GET /api/version-check

Why: User-requested: detect when a newer version is published to npm
and surface a hint — but never auto-update, and never make an
unprompted outbound network call. This project has consistently
gated every outbound network feature behind an explicit opt-in
setting defaulting to off (see sendToPlantUmlServer/privacyMode) —
this follows the same pattern.
What: checkForUpdates (default false) added to settings.js exactly
like sendToPlantUmlServer. checkLatestVersion() calls the npm
registry with a 3s timeout, gracefully returning null (never
throwing) on any failure — unreachable registry, non-200, malformed
body. GET /api/version-check returns {enabled: false} without making
any network call at all when the setting is off, matching how
POST /api/plantuml-proxy behaves when its own send-toggle is off.
How: The settings UI toggle for checkForUpdates is deferred to the
settings-menu plan's General tab (not yet implemented) — this task
only builds the backend field, the check itself, and the endpoint;
noted as a cross-plan follow-up in that plan's Task 6.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KCkr3UUhi36YHAEiAAhp5L
EOF
)"
```

---

### Task 6: 版本檢查 — 前端提示

**Files:**
- Modify: `src/frontend/App.tsx`
- Modify: `src/frontend/components/TopBar.tsx`
- Test: 擴充 `tests/frontend/App.test.tsx`、`tests/frontend/TopBar.test.tsx`

**Interfaces:**
- `TopBar` 新增選用 prop `updateAvailable?: {latestVersion: string} | null`——非 `null` 時在既有按鈕群組旁顯示一個小提示（例如一行文字或小圖示，不需要做成可關閉的通知系統，YAGNI），內容用 i18n 鍵組出「有新版本 X.Y.Z 可用」的文字
- `App.tsx` 掛載時呼叫一次 `GET /api/version-check`；若 `enabled && updateAvailable`，把 `{latestVersion}` 傳給 `TopBar`

- [ ] **Step 1: 加入 i18n 鍵**

```json
{
  "topBar": {
    "updateAvailable": "Update available: {{version}}"
  }
}
```

（`react-i18next` 的 `t('topBar.updateAvailable', {version: '1.2.3'})` 插值語法；其餘 4 語言請對應翻譯，保留 `{{version}}` 插值標記不變。）

- [ ] **Step 2: 寫失敗測試**

在 `tests/frontend/TopBar.test.tsx` 加入：

```tsx
it('shows an update hint when updateAvailable is provided', () => {
  render(
    <TopBar
      onFullscreen={() => {}}
      onShowPath={() => {}}
      onPrint={() => {}}
      updateAvailable={{ latestVersion: '9.9.9' }}
    />
  )
  expect(screen.getByText(/9\.9\.9/)).toBeInTheDocument()
})

it('shows nothing when updateAvailable is null/undefined', () => {
  render(<TopBar onFullscreen={() => {}} onShowPath={() => {}} onPrint={() => {}} />)
  expect(screen.queryByText(/update available/i)).not.toBeInTheDocument()
})
```

在 `tests/frontend/App.test.tsx` 加入一個案例：mock `GET /api/version-check` 回傳 `{enabled: true, updateAvailable: true, latestVersion: '9.9.9'}`，驗證畫面上出現該版本號。

- [ ] **Step 3: 執行測試確認失敗**

Run: `npm run test:frontend -- TopBar.test.tsx App.test.tsx`
Expected: FAIL

- [ ] **Step 4: 實作**

`TopBar.tsx` 加入：

```tsx
interface TopBarProps {
  onFullscreen: () => void
  onShowPath: () => void
  onPrint: () => void
  updateAvailable?: { latestVersion: string } | null
}

// 在既有按鈕群組旁：
{updateAvailable && (
  <span>{t('topBar.updateAvailable', 'Update available: {{version}}', { version: updateAvailable.latestVersion })}</span>
)}
```

`App.tsx` 加入：

```tsx
const [updateAvailable, setUpdateAvailable] = useState<{ latestVersion: string } | null>(null)

useEffect(() => {
  apiFetch('/api/version-check')
    .then((res) => res.json())
    .then((data) => {
      if (data.enabled && data.updateAvailable && data.latestVersion) {
        setUpdateAvailable({ latestVersion: data.latestVersion })
      }
    })
    .catch(() => {
      // 檢查失敗不影響主功能，安靜忽略即可
    })
}, [])
```

並把 `updateAvailable` 傳給 `<TopBar>`。

- [ ] **Step 5: 執行完整驗證**

Run: `npm run lint && npm run typecheck:frontend && npm run test:frontend`
Expected: 全部通過

- [ ] **Step 6: Codex code review**

Run: `/codex:review --base <prev-commit-sha>`

- [ ] **Step 7: Commit — 這是一個 UI 段落**

```bash
git add src/frontend/App.tsx src/frontend/components/TopBar.tsx src/frontend/i18n/locales/*.json tests/frontend/TopBar.test.tsx tests/frontend/App.test.tsx
git commit -m "$(cat <<'EOF'
Show a non-blocking update-available hint in TopBar

Why: Completes the version-check feature (backend built in Task 5):
surface the check's result in the UI without being disruptive — no
modal, no dismiss-tracking state, just a small hint per the user's
explicit "detect and show a hint, never auto-update" request.
What: App.tsx calls GET /api/version-check once on mount; when the
setting is enabled and a newer version is reported, passes it to
TopBar, which renders a small inline text hint next to the existing
buttons. A disabled setting or a failed check (network error, npm
registry unreachable) both result in no hint at all — quiet by
default.
How: [UI CHECKPOINT] UI-facing segment per CLAUDE.md's checkpoint
rule. This is the last task of the toolbar-extras plan.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KCkr3UUhi36YHAEiAAhp5L
EOF
)"
```

---

## Definition of Done

- [ ] `npm run lint`, `npm run typecheck:frontend`, `npm run test:frontend`, `npm run test:unit`, `npm run test:integration`, `npm run build` all pass
- [ ] `md-viewer-server start` with no `--root` serves the invoking working directory
- [ ] `--rotate-token` also benefits from the same default (goes through the same CLI-layer resolution)
- [ ] TopBar shows fullscreen, show-path, and print buttons in that order; fullscreen actually toggles the browser's fullscreen state; print opens the browser's print dialog
- [ ] Clicking "show path" with an active tab opens a modal with the real server-side absolute path (not a browser URL), decoded/human-readable (no percent-encoding garbling, since it's a raw filesystem path string, never URL-encoded in the first place); copy button writes to the clipboard and gives visible success/failure feedback
- [ ] `checkForUpdates` defaults to off; `GET /api/version-check` makes zero outbound network calls while it's off
- [ ] A follow-up note exists in `docs/superpowers/plans/2026-09-06-settings-menu.md`'s Task 6 to add the `checkForUpdates` toggle to the General tab once that plan is implemented
