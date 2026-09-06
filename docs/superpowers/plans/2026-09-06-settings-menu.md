# 設定選單 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立分類式設定選單（一般／外觀／自訂 CSS，仿 md-reader），涵蓋隱私模式總開關與鎖定邏輯、PlantUML 伺服器設定、CSS 範本管理。這是 `/goal` 六個子計畫中的最後一個，完成後主要的使用者可見功能全部到位。

**Architecture:** 設定分兩種持久化層級：
1. **後端 config.json（`GET/PUT /api/settings`，Plan 4 已建立雛形）**：只放「會影響伺服器行為或安全姿態」的設定——`privacyMode`、`blockRemoteContent`、`plantumlServerUrl`、`sendToPlantUmlServer`、`allowHtmlScripts`、`bakOnSave`。這些設定需要跨裝置/瀏覽器一致（同一台 daemon 可能被多個瀏覽器分頁連線），且隱私鎖定必須在伺服器端也強制生效，不能只靠前端 UI disable 掉開關就假裝安全。
2. **前端 localStorage（新 `useLocalPrefs` hook）**：純顯示/裝置本地偏好——主題、accent color、編輯器字型大小/縮排、顯示隱藏檔、大綱側邊欄預設摺疊、字元集相容模式、即時更新開關、`.txt` 是否當 Markdown 渲染、換行風格。這些不影響資料安全，且沒有跨裝置同步的必要。

CSS 自訂範本（`css-presets.json`）是第三種持久化：存在後端 XDG Config 目錄，但內容只是純文字範本庫，不是「設定值」，走獨立的 `GET/POST /api/css-presets` API（spec 已定義）。

**Tech Stack:** 沿用既有 React + TypeScript + Vitest 前端與 Express 後端，不新增套件。

## Global Constraints

- **隱私模式的鎖定必須在後端強制生效，不能只在前端 disable UI**：`readSettings` 回傳一個 `effective` 子物件（`{blockRemoteContent, sendToPlantUmlServer, allowHtmlScripts}`），當 `privacyMode` 為 `true` 時這三個欄位一律回傳安全值，無論使用者個別儲存的偏好為何；使用者個別偏好本身仍完整保留在頂層欄位，讓隱私模式關閉後能恢復原本設定。所有讀取這些旗標做安全判斷的地方（PlantUML proxy、doctor 檢查）一律讀 `effective.*`，不可直接讀頂層欄位。
- **修正既有安全缺口**：目前 `POST /api/plantuml-proxy`（`src/server/api/plantuml.js`）完全沒有檢查 `sendToPlantUmlServer`，只要呼叫這支 API 就一定會把圖表原始碼送到外部伺服器，設定開關形同虛設（前端不呼叫不代表無法直接呼叫 API）。本計畫的 Task 1 必須修正：`effective.sendToPlantUmlServer` 為 `false` 時，這支 API 回 `403 { errorCode: 'PLANTUML_DISABLED' }`，不進行任何外部請求。
- `PUT /api/settings` 的欄位白名單（`ALLOWED_SETTINGS_KEYS`，`src/server/settings.js`）擴充新欄位時，沿用 Plan 4 已建立的「未知欄位整批拒絕」機制，不放寬既有的 mass-assignment 防護
- 自訂 CSS 只作用於文章渲染容器（`.markdown-body`，見 Plan 6 的 `MarkdownView`），不得影響側邊欄/分頁列/設定選單本身的樣式——用一個獨立的 `<style>` 標籤注入，selector 一律加上容器 class 前綴
- Commit 規範（`CLAUDE.md`）：一個邏輯段落一個 commit，Why/What/How 三段式；UI 段落標註 `[UI CHECKPOINT]`
- **Review 方式**：依 `CLAUDE.md` 最新規則，本計畫的每個 task 完成後用 `/codex:review --base <prev-commit-sha>` 做 code review，不再 dispatch Claude sonnet/opus reviewer subagent

---

## File Structure

```
src/server/
├── settings.js                    ← 擴充新欄位 + effective 覆寫邏輯（Modify）
├── css-presets.js                    ← 新建：讀取/新增 CSS 範本 + 首次啟動種子範本
├── api/
│   ├── settings.js                     ← 既有路由不變
│   ├── css-presets.js                   ← 新建：GET/POST /api/css-presets
│   └── plantuml.js                       ← 修正：檢查 effective.sendToPlantUmlServer（Modify）
└── doctor.js                               ← 修正：PlantUML 檢查改讀 effective.*（Modify）

src/frontend/
├── hooks/
│   ├── useSettings.ts              ← 新建：後端設定 CRUD hook
│   └── useLocalPrefs.ts               ← 新建：localStorage 偏好 hook
├── components/
│   ├── SettingsModal.tsx                 ← 新建：分類 tab 容器
│   ├── settings/
│   │   ├── GeneralTab.tsx                    ← 新建
│   │   ├── AppearanceTab.tsx                    ← 新建
│   │   └── CustomCssTab.tsx                        ← 新建
│   └── TopBar.tsx                                     ← 修正：接上齒輪按鈕（Modify）
├── App.tsx                                               ← 修正：settings modal 開關狀態 + allowHtmlScripts 接線（Modify）
└── i18n/locales/*.json                                     ← 各 task 隨需擴充 settings.* 翻譯鍵

tests/unit/server/
├── settings.test.js（既有，擴充）
└── css-presets.test.js（新建）

tests/integration/
└── api-plantuml.test.js（既有，擴充 disabled 案例）— 若不存在則於 Task 1 建立最小案例

tests/frontend/
├── useSettings.test.ts
├── useLocalPrefs.test.ts
├── SettingsModal.test.tsx
├── GeneralTab.test.tsx
├── AppearanceTab.test.tsx
└── CustomCssTab.test.tsx
```

---

### Task 1: 後端設定擴充 + 隱私模式鎖定 + 修正 PlantUML proxy 安全缺口

**Files:**
- Modify: `src/server/settings.js`
- Modify: `src/server/api/plantuml.js`
- Modify: `src/server/doctor.js`
- Test: `tests/unit/server/settings.test.js`（擴充）
- Test: 找到或建立涵蓋 `POST /api/plantuml-proxy` 的 integration 測試檔（擴充「disabled 時回 403」案例）

**Interfaces:**
- `readSettings(configDir)` 回傳新增欄位 `privacyMode: boolean`（預設 `false`）、`blockRemoteContent: boolean`（預設 `false`）、`allowHtmlScripts: boolean`（預設 `false`）、`bakOnSave: boolean`（預設 `false`），以及新增的 `effective: {blockRemoteContent, sendToPlantUmlServer, allowHtmlScripts}` 子物件
- `ALLOWED_SETTINGS_KEYS` 新增 `'privacyMode', 'blockRemoteContent', 'allowHtmlScripts', 'bakOnSave'`

- [ ] **Step 1: 寫失敗測試**

在 `tests/unit/server/settings.test.js` 加入：

```js
describe('privacy mode effective overrides', () => {
  it('effective values equal stored values when privacyMode is false', () => {
    updateSettings(configDir, {
      blockRemoteContent: false,
      sendToPlantUmlServer: true,
      allowHtmlScripts: true,
    })
    const settings = readSettings(configDir)
    expect(settings.effective).toEqual({
      blockRemoteContent: false,
      sendToPlantUmlServer: true,
      allowHtmlScripts: true,
    })
  })

  it('forces safe effective values when privacyMode is true, regardless of stored preferences', () => {
    updateSettings(configDir, {
      privacyMode: true,
      blockRemoteContent: false,
      sendToPlantUmlServer: true,
      allowHtmlScripts: true,
    })
    const settings = readSettings(configDir)
    expect(settings.effective).toEqual({
      blockRemoteContent: true,
      sendToPlantUmlServer: false,
      allowHtmlScripts: false,
    })
    // stored preferences are preserved, not overwritten, so turning privacy mode
    // back off restores what the user had before
    expect(settings.blockRemoteContent).toBe(false)
    expect(settings.sendToPlantUmlServer).toBe(true)
    expect(settings.allowHtmlScripts).toBe(true)
  })

  it('defaults privacyMode, blockRemoteContent, allowHtmlScripts, bakOnSave to false', () => {
    const settings = readSettings(configDir)
    expect(settings.privacyMode).toBe(false)
    expect(settings.blockRemoteContent).toBe(false)
    expect(settings.allowHtmlScripts).toBe(false)
    expect(settings.bakOnSave).toBe(false)
  })

  it('accepts the new keys through updateSettings', () => {
    expect(() =>
      updateSettings(configDir, {
        privacyMode: true,
        blockRemoteContent: true,
        allowHtmlScripts: false,
        bakOnSave: true,
      })
    ).not.toThrow()
  })
})
```

Also add to whichever integration test file exercises `POST /api/plantuml-proxy` (search for it first; if none exists, add a minimal one alongside the existing plantuml unit tests):

```js
it('returns 403 PLANTUML_DISABLED and makes no upstream request when sendToPlantUmlServer is off', async () => {
  updateSettings(configDir, { sendToPlantUmlServer: false })
  const res = await request(app)
    .post('/api/plantuml-proxy')
    .set('X-Auth-Token', token)
    .send({ source: '@startuml\nA -> B\n@enduml' })
  expect(res.status).toBe(403)
  expect(res.body.errorCode).toBe('PLANTUML_DISABLED')
})

it('returns 403 when privacyMode forces sendToPlantUmlServer off even if the stored preference is true', async () => {
  updateSettings(configDir, { sendToPlantUmlServer: true, privacyMode: true })
  const res = await request(app)
    .post('/api/plantuml-proxy')
    .set('X-Auth-Token', token)
    .send({ source: '@startuml\nA -> B\n@enduml' })
  expect(res.status).toBe(403)
  expect(res.body.errorCode).toBe('PLANTUML_DISABLED')
})
```

（實作者請對照該測試檔既有的 `app`/`token`/`request` 設置方式調整這兩個案例，重點是驗證行為，不需要逐字照抄前置設置。）

- [ ] **Step 2: 執行測試確認失敗**

Run: `npm run test:unit -- settings.test.js && npm run test:integration -- plantuml`
Expected: FAIL — new fields/behavior don't exist yet

- [ ] **Step 3: 實作**

`src/server/settings.js`（關鍵變更）：

```js
const ALLOWED_SETTINGS_KEYS = [
  'plantumlServerUrl',
  'sendToPlantUmlServer',
  'privacyMode',
  'blockRemoteContent',
  'allowHtmlScripts',
  'bakOnSave',
]

export function readSettings(configDir) {
  const config = readConfig(configDir) ?? {}
  const privacyMode = config.privacyMode ?? false
  const blockRemoteContent = config.blockRemoteContent ?? false
  const sendToPlantUmlServer = config.sendToPlantUmlServer ?? false
  const allowHtmlScripts = config.allowHtmlScripts ?? false

  return {
    plantumlServerUrl: config.plantumlServerUrl ?? DEFAULT_PLANTUML_SERVER_URL,
    sendToPlantUmlServer,
    privacyMode,
    blockRemoteContent,
    allowHtmlScripts,
    bakOnSave: config.bakOnSave ?? false,
    // Privacy mode locks these three to safe values for any code path that
    // makes a security-relevant decision. Stored preferences above are left
    // untouched so disabling privacy mode restores what the user had.
    effective: {
      blockRemoteContent: privacyMode ? true : blockRemoteContent,
      sendToPlantUmlServer: privacyMode ? false : sendToPlantUmlServer,
      allowHtmlScripts: privacyMode ? false : allowHtmlScripts,
    },
  }
}
```

`src/server/api/plantuml.js`（加在 body 驗證之後、`readSettings` 呼叫之後）：

```js
const settings = readSettings(configDir)
if (!settings.effective.sendToPlantUmlServer) {
  return res.status(403).json({ errorCode: 'PLANTUML_DISABLED' })
}
const { plantumlServerUrl } = settings
```

`src/server/doctor.js`：把第 106 行附近的 `const { plantumlServerUrl, sendToPlantUmlServer } = readSettings(configDir)` 改成從 `effective` 讀 `sendToPlantUmlServer`（`plantumlServerUrl` 仍讀頂層，因為 URL 本身不是安全鎖定欄位）：

```js
const { plantumlServerUrl, effective } = readSettings(configDir)
const sendToPlantUmlServer = effective.sendToPlantUmlServer
```

- [ ] **Step 4: 執行測試確認通過**

Run: `npm run test:unit -- settings.test.js && npm run test:integration -- plantuml && npm run test:unit -- doctor`
Expected: PASS

- [ ] **Step 5: Codex code review**

Run: `/codex:review --base <commit-immediately-before-this-task>`（若差異偏大可加 `--background`）。修正任何 Critical/Important 發現後再繼續。

- [ ] **Step 6: Commit**

```bash
git add src/server/settings.js src/server/api/plantuml.js src/server/doctor.js tests/unit/server/settings.test.js
git commit -m "$(cat <<'EOF'
Add privacy-mode fields with server-enforced effective overrides

Why: The design spec's privacy mode must force three security-
relevant flags (block-remote-content, send-to-plantuml, allow-html-
scripts) to safe values regardless of the user's individually saved
preference — and that lock has to hold even if a client calls the
API directly, not just when the UI disables the toggles. Auditing the
existing plantuml-proxy endpoint while adding this found it never
checked sendToPlantUmlServer at all: any client could always trigger
an outbound request with document content, making the existing
setting purely decorative.
What: readSettings now returns the three privacy-lockable fields at
their raw stored values plus an `effective` object that privacy mode
overrides to safe values; individual preferences survive privacy mode
being toggled off. POST /api/plantuml-proxy now checks
effective.sendToPlantUmlServer and returns 403 PLANTUML_DISABLED
before making any upstream request when it's off. doctor's PlantUML
reachability check now reads the same effective value so it doesn't
report on a check that's actually locked off.
How: The override happens once, inside readSettings, so every
consumer (API routes, doctor, and the future settings UI) sees a
single authoritative effective view instead of each re-implementing
the privacy-mode lock logic.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KCkr3UUhi36YHAEiAAhp5L
EOF
)"
```

---

### Task 2: CSS 範本後端（`css-presets.json` + API）

**Files:**
- Create: `src/server/css-presets.js`
- Create: `src/server/api/css-presets.js`
- Modify: `src/server/app.js`（或既有掛載路由的檔案，掛上新 router）
- Test: `tests/unit/server/css-presets.test.js`
- Test: 擴充 integration 測試涵蓋 `GET`/`POST /api/css-presets`

**Interfaces:**
- `readCssPresets(configDir)`: 回傳 `Array<{id: string, name: string, css: string}>`；檔案不存在時，建立並寫入兩個預設範本（`editorial`、`developer`，selector 使用 `.markdown-body` 前綴）後回傳
- `createCssPreset(configDir, {name, css})`: 新增一筆（`id` 用 `crypto.randomUUID()`），寫回檔案，回傳更新後的完整清單
- `GET /api/css-presets` → `readCssPresets`；`POST /api/css-presets` → `createCssPreset`，缺 `name`/`css` 回 `400 { errorCode: 'INVALID_PRESET' }`

- [ ] **Step 1: 寫失敗測試**

`tests/unit/server/css-presets.test.js`:

```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { readCssPresets, createCssPreset } from '../../../src/server/css-presets.js'

describe('css-presets', () => {
  let configDir

  beforeEach(() => {
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'css-presets-test-'))
  })

  afterEach(() => {
    fs.rmSync(configDir, { recursive: true, force: true })
  })

  it('seeds two default presets on first read when the file does not exist', () => {
    const presets = readCssPresets(configDir)
    expect(presets).toHaveLength(2)
    expect(presets.map((p) => p.name)).toEqual(expect.arrayContaining(['editorial', 'developer']))
    expect(fs.existsSync(path.join(configDir, 'css-presets.json'))).toBe(true)
  })

  it('seeded preset selectors are scoped to the markdown-body container', () => {
    const presets = readCssPresets(configDir)
    for (const preset of presets) {
      expect(preset.css).toMatch(/\.markdown-body/)
    }
  })

  it('does not reseed on a second read (preserves user edits/deletions)', () => {
    readCssPresets(configDir)
    fs.writeFileSync(path.join(configDir, 'css-presets.json'), JSON.stringify([]))
    expect(readCssPresets(configDir)).toEqual([])
  })

  it('createCssPreset appends a new preset with a generated id', () => {
    readCssPresets(configDir)
    const updated = createCssPreset(configDir, { name: 'my-theme', css: '.markdown-body { color: red; }' })
    expect(updated).toHaveLength(3)
    const created = updated.find((p) => p.name === 'my-theme')
    expect(created).toBeDefined()
    expect(typeof created.id).toBe('string')
    expect(created.id.length).toBeGreaterThan(0)
  })

  it('createCssPreset persists across reads', () => {
    createCssPreset(configDir, { name: 'x', css: '.markdown-body {}' })
    const presets = readCssPresets(configDir)
    expect(presets.some((p) => p.name === 'x')).toBe(true)
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npm run test:unit -- css-presets.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: 實作**

`src/server/css-presets.js`:

```js
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

function getCssPresetsPath(configDir) {
  return path.join(configDir, 'css-presets.json')
}

const DEFAULT_PRESETS = [
  {
    id: 'editorial',
    name: 'editorial',
    css: `.markdown-body {
  background: #f5f1e8;
  font-family: Georgia, 'Times New Roman', serif;
}
.markdown-body h1, .markdown-body h2 {
  font-family: Georgia, serif;
  font-size: 2.2em;
}`,
  },
  {
    id: 'developer',
    name: 'developer',
    css: `.markdown-body {
  background: #1e1e1e;
  color: #d4d4d4;
}
.markdown-body pre, .markdown-body code {
  background: #0d0d0d;
  color: #9cdcfe;
  font-family: 'Fira Code', monospace;
}`,
  },
]

export function readCssPresets(configDir) {
  const filePath = getCssPresetsPath(configDir)
  if (!fs.existsSync(filePath)) {
    fs.mkdirSync(configDir, { recursive: true })
    fs.writeFileSync(filePath, JSON.stringify(DEFAULT_PRESETS, null, 2))
    return DEFAULT_PRESETS
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
}

export function createCssPreset(configDir, { name, css }) {
  const presets = readCssPresets(configDir)
  const preset = { id: crypto.randomUUID(), name, css }
  const updated = [...presets, preset]
  fs.writeFileSync(getCssPresetsPath(configDir), JSON.stringify(updated, null, 2))
  return updated
}
```

`src/server/api/css-presets.js`:

```js
import express from 'express'
import { readCssPresets, createCssPreset } from '../css-presets.js'

export function createCssPresetsRouter(configDir) {
  const router = express.Router()

  router.get('/css-presets', (req, res) => {
    res.json(readCssPresets(configDir))
  })

  router.post('/css-presets', (req, res) => {
    const { name, css } = req.body
    if (!name || typeof name !== 'string' || typeof css !== 'string') {
      return res.status(400).json({ errorCode: 'INVALID_PRESET' })
    }
    res.status(201).json(createCssPreset(configDir, { name, css }))
  })

  return router
}
```

在掛載其他 API router 的地方（找 `createPlantUmlRouter`/`createSettingsRouter` 掛載處，通常在 `src/server/app.js`）加入：

```js
app.use('/api', authMiddleware(config.token), createCssPresetsRouter(configDir))
```

（實作者請對照現有 router 掛載方式與中介層順序調整，維持既有的認證中介層覆蓋範圍。）

- [ ] **Step 4: 執行測試確認通過**

Run: `npm run test:unit -- css-presets.test.js`
Expected: PASS（5 個測試）

擴充 integration 測試檔（找到既有掛載其他 API router 的 integration 測試檔案，仿照其結構加入）：

```js
it('GET /api/css-presets returns the seeded defaults', async () => {
  const res = await request(app).get('/api/css-presets').set('X-Auth-Token', token)
  expect(res.status).toBe(200)
  expect(res.body).toHaveLength(2)
})

it('POST /api/css-presets requires auth', async () => {
  const res = await request(app).post('/api/css-presets').send({ name: 'x', css: '.markdown-body{}' })
  expect(res.status).toBe(401)
})

it('POST /api/css-presets rejects a missing css field', async () => {
  const res = await request(app)
    .post('/api/css-presets')
    .set('X-Auth-Token', token)
    .send({ name: 'x' })
  expect(res.status).toBe(400)
  expect(res.body.errorCode).toBe('INVALID_PRESET')
})
```

Run: `npm run test:integration -- css-presets`
Expected: PASS

- [ ] **Step 5: Codex code review**

Run: `/codex:review --base <prev-commit-sha>`. 修正任何 Critical/Important 發現。

- [ ] **Step 6: Commit**

```bash
git add src/server/css-presets.js src/server/api/css-presets.js src/server/app.js tests/unit/server/css-presets.test.js tests/integration/*.test.js
git commit -m "$(cat <<'EOF'
Add CSS preset storage and GET/POST /api/css-presets

Why: The design spec's custom-CSS settings tab needs a growable
template library persisted server-side (XDG config), not hardcoded
in the frontend, so a user's saved presets survive across browsers
and reinstalls of the frontend bundle.
What: css-presets.js seeds css-presets.json with two presets ported
from md-reader (editorial, developer) on first read if the file
doesn't exist yet, and never reseeds afterward (so user edits/
deletions stick). GET returns the current list; POST appends a new
preset with a generated id.
How: Selectors in the seeded presets are scoped to .markdown-body so
they only affect the article-rendering container, matching the
constraint that custom CSS must not leak into the app's own chrome
(sidebar, tab bar, settings modal).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KCkr3UUhi36YHAEiAAhp5L
EOF
)"
```

---

### Task 3: `useSettings` hook（後端設定 CRUD）

**Files:**
- Create: `src/frontend/hooks/useSettings.ts`
- Test: `tests/frontend/useSettings.test.ts`

**Interfaces:**
- Produces: `useSettings()` → `{settings: Settings | null, updateSettings: (patch: Partial<Settings>) => Promise<void>, error: string | null}`, where `Settings` mirrors the backend shape from Task 1 (`plantumlServerUrl`, `sendToPlantUmlServer`, `privacyMode`, `blockRemoteContent`, `allowHtmlScripts`, `bakOnSave`, `effective: {...}`). Fetches `GET /api/settings` on mount; `updateSettings` calls `PUT /api/settings` with the patch and updates local state with the response

- [ ] **Step 1: 寫失敗測試**

`tests/frontend/useSettings.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useSettings } from '../../src/frontend/hooks/useSettings.js'

function settingsResponse(overrides = {}) {
  return {
    plantumlServerUrl: 'https://www.plantuml.com/plantuml',
    sendToPlantUmlServer: false,
    privacyMode: false,
    blockRemoteContent: false,
    allowHtmlScripts: false,
    bakOnSave: false,
    effective: { blockRemoteContent: false, sendToPlantUmlServer: false, allowHtmlScripts: false },
    ...overrides,
  }
}

describe('useSettings', () => {
  beforeEach(() => sessionStorage.setItem('mvs-token', 'tok'))
  afterEach(() => {
    vi.unstubAllGlobals()
    sessionStorage.clear()
  })

  it('fetches settings on mount', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(settingsResponse()))))
    const { result } = renderHook(() => useSettings())
    await waitFor(() => expect(result.current.settings).not.toBeNull())
    expect(result.current.settings?.allowHtmlScripts).toBe(false)
  })

  it('updateSettings PUTs the patch and updates local state from the response', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(settingsResponse())))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(settingsResponse({ privacyMode: true })))
      )
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useSettings())
    await waitFor(() => expect(result.current.settings).not.toBeNull())

    await act(async () => {
      await result.current.updateSettings({ privacyMode: true })
    })

    expect(result.current.settings?.privacyMode).toBe(true)
    const putCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT')
    expect(putCall).toBeDefined()
    expect(JSON.parse(putCall[1].body)).toEqual({ privacyMode: true })
  })

  it('surfaces an error message when updateSettings fails (e.g. 400 invalid settings)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(settingsResponse())))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ errorCode: 'INVALID_SETTINGS' }), { status: 400 })
      )
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useSettings())
    await waitFor(() => expect(result.current.settings).not.toBeNull())

    await act(async () => {
      await result.current.updateSettings({ plantumlServerUrl: 'not a url' })
    })

    expect(result.current.error).toBe('INVALID_SETTINGS')
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npm run test:frontend -- useSettings.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: 實作**

`src/frontend/hooks/useSettings.ts`:

```ts
import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../api-client.js'

export interface Settings {
  plantumlServerUrl: string
  sendToPlantUmlServer: boolean
  privacyMode: boolean
  blockRemoteContent: boolean
  allowHtmlScripts: boolean
  bakOnSave: boolean
  effective: {
    blockRemoteContent: boolean
    sendToPlantUmlServer: boolean
    allowHtmlScripts: boolean
  }
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiFetch('/api/settings')
      .then((res) => res.json())
      .then(setSettings)
  }, [])

  const updateSettings = useCallback(async (patch: Partial<Settings>) => {
    const res = await apiFetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.errorCode ?? 'UNKNOWN_ERROR')
      return
    }
    setError(null)
    setSettings(data)
  }, [])

  return { settings, updateSettings, error }
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `npm run test:frontend -- useSettings.test.ts`
Expected: PASS（3 個測試）

- [ ] **Step 5: Codex code review**

Run: `/codex:review --base <prev-commit-sha>`

- [ ] **Step 6: Commit**

```bash
git add src/frontend/hooks/useSettings.ts tests/frontend/useSettings.test.ts
git commit -m "$(cat <<'EOF'
Add useSettings hook for backend-synced settings

Why: Every settings-tab component needs a shared way to read and
write the server-persisted settings (Task 1's privacy/PlantUML
fields) without each duplicating fetch/PUT boilerplate and error
handling.
What: useSettings fetches GET /api/settings on mount and exposes an
updateSettings(patch) function that PUTs the patch and replaces local
state with the server's response (which reflects any effective-value
overrides), or surfaces the response's errorCode on failure (e.g. an
invalid PlantUML URL) without touching existing state.
How: State is intentionally replaced wholesale from each response
rather than merged locally, since the backend is the single source of
truth for the effective/locked values — a local merge could drift
from what privacy-mode lock logic actually computed.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KCkr3UUhi36YHAEiAAhp5L
EOF
)"
```

---

### Task 4: `useLocalPrefs` hook（裝置本地偏好）

**Files:**
- Create: `src/frontend/hooks/useLocalPrefs.ts`
- Test: `tests/frontend/useLocalPrefs.test.ts`

**Interfaces:**
- Produces: `useLocalPrefs()` → `{prefs: LocalPrefs, setPref: <K extends keyof LocalPrefs>(key: K, value: LocalPrefs[K]) => void}`, where `LocalPrefs` = `{theme: 'light'|'dark'|'system', accentColor: string, editorFontSize: number, editorIndentWidth: number, showHiddenFiles: boolean, outlineDefaultCollapsed: boolean, charsetCompatMode: boolean, autoReloadViewingTabs: boolean, renderTxtAsMarkdown: boolean}`. Persists to `localStorage` under key `mvs-local-prefs` as a single JSON blob; defaults applied for any missing/corrupt key

- [ ] **Step 1: 寫失敗測試**

`tests/frontend/useLocalPrefs.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useLocalPrefs, DEFAULT_LOCAL_PREFS } from '../../src/frontend/hooks/useLocalPrefs.js'

describe('useLocalPrefs', () => {
  beforeEach(() => localStorage.clear())

  it('returns defaults when nothing is stored', () => {
    const { result } = renderHook(() => useLocalPrefs())
    expect(result.current.prefs).toEqual(DEFAULT_LOCAL_PREFS)
  })

  it('setPref updates one field and persists it', () => {
    const { result } = renderHook(() => useLocalPrefs())
    act(() => result.current.setPref('theme', 'dark'))
    expect(result.current.prefs.theme).toBe('dark')
    const stored = JSON.parse(localStorage.getItem('mvs-local-prefs') ?? '{}')
    expect(stored.theme).toBe('dark')
  })

  it('setPref leaves other fields unchanged', () => {
    const { result } = renderHook(() => useLocalPrefs())
    act(() => result.current.setPref('editorFontSize', 16))
    act(() => result.current.setPref('theme', 'dark'))
    expect(result.current.prefs.editorFontSize).toBe(16)
    expect(result.current.prefs.theme).toBe('dark')
  })

  it('falls back to defaults when localStorage contains corrupt JSON', () => {
    localStorage.setItem('mvs-local-prefs', '{not valid json')
    const { result } = renderHook(() => useLocalPrefs())
    expect(result.current.prefs).toEqual(DEFAULT_LOCAL_PREFS)
  })

  it('fills in missing keys from a partial stored blob (forward-compat with new prefs added later)', () => {
    localStorage.setItem('mvs-local-prefs', JSON.stringify({ theme: 'dark' }))
    const { result } = renderHook(() => useLocalPrefs())
    expect(result.current.prefs.theme).toBe('dark')
    expect(result.current.prefs.editorFontSize).toBe(DEFAULT_LOCAL_PREFS.editorFontSize)
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npm run test:frontend -- useLocalPrefs.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: 實作**

`src/frontend/hooks/useLocalPrefs.ts`:

```ts
import { useCallback, useState } from 'react'

export interface LocalPrefs {
  theme: 'light' | 'dark' | 'system'
  accentColor: string
  editorFontSize: number
  editorIndentWidth: number
  showHiddenFiles: boolean
  outlineDefaultCollapsed: boolean
  charsetCompatMode: boolean
  autoReloadViewingTabs: boolean
  renderTxtAsMarkdown: boolean
}

export const DEFAULT_LOCAL_PREFS: LocalPrefs = {
  theme: 'system',
  accentColor: '#2f6fed',
  editorFontSize: 14,
  editorIndentWidth: 2,
  showHiddenFiles: false,
  outlineDefaultCollapsed: false,
  charsetCompatMode: false,
  autoReloadViewingTabs: true,
  renderTxtAsMarkdown: false,
}

const STORAGE_KEY = 'mvs-local-prefs'

function loadPrefs(): LocalPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_LOCAL_PREFS
    const parsed = JSON.parse(raw)
    return { ...DEFAULT_LOCAL_PREFS, ...parsed }
  } catch {
    return DEFAULT_LOCAL_PREFS
  }
}

export function useLocalPrefs() {
  const [prefs, setPrefs] = useState<LocalPrefs>(loadPrefs)

  const setPref = useCallback(<K extends keyof LocalPrefs>(key: K, value: LocalPrefs[K]) => {
    setPrefs((prev) => {
      const next = { ...prev, [key]: value }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  return { prefs, setPref }
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `npm run test:frontend -- useLocalPrefs.test.ts`
Expected: PASS（5 個測試）

- [ ] **Step 5: Codex code review**

Run: `/codex:review --base <prev-commit-sha>`

- [ ] **Step 6: Commit**

```bash
git add src/frontend/hooks/useLocalPrefs.ts tests/frontend/useLocalPrefs.test.ts
git commit -m "$(cat <<'EOF'
Add useLocalPrefs hook for device-local UI preferences

Why: Appearance and a handful of general settings (theme, accent
color, editor font size/indent, hidden-file visibility, outline
default-collapsed, charset compat mode, auto-reload, txt-as-markdown)
are pure per-device display preferences with no security implication
and no need to sync across browsers hitting the same daemon — storing
them server-side would be unnecessary round-trips and state to manage
for zero benefit.
What: useLocalPrefs persists a single JSON blob to
localStorage['mvs-local-prefs'], merging over DEFAULT_LOCAL_PREFS so
missing or corrupt stored data (or a preference added in a later
release) always resolves to a valid value instead of throwing.
How: One blob rather than one localStorage key per preference, so
future preferences added here don't need new storage plumbing — just
an addition to the LocalPrefs interface and DEFAULT_LOCAL_PREFS.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KCkr3UUhi36YHAEiAAhp5L
EOF
)"
```

---

### Task 5: `SettingsModal` 殼層 + TopBar 齒輪按鈕接線

**Files:**
- Create: `src/frontend/components/SettingsModal.tsx`
- Modify: `src/frontend/components/TopBar.tsx`
- Modify: `src/frontend/App.tsx`（settings modal 開關狀態）
- Test: `tests/frontend/SettingsModal.test.tsx`
- Test: 擴充 `tests/frontend/App.test.tsx`（齒輪按鈕開啟 modal）

**Interfaces:**
- `<SettingsModal open={boolean} onClose={() => void} />` — renders `null` when `open` is `false`; otherwise a `role="dialog"` with a left-side category tab list (`一般`/`外觀`/`自訂 CSS`, via i18n keys `settings.generalTab`/`settings.appearanceTab`/`settings.customCssTab`) and a content area that swaps per selected category (Tasks 6-8 fill in the real tab content; this task renders an empty placeholder `<div data-testid="settings-tab-content">` per tab so later tasks can target it)
- `TopBar` gains a required prop `onOpenSettings: () => void`, rendered as a `⚙` button with `aria-label="settings"` (or an i18n key `topBar.settingsLabel`) in the previously-empty controls `<div>`

- [ ] **Step 1: 加入 i18n 鍵**

在 5 個 `src/frontend/i18n/locales/*.json` 加入：

```json
{
  "settings": {
    "generalTab": "General",
    "appearanceTab": "Appearance",
    "customCssTab": "Custom CSS"
  },
  "topBar": {
    "settingsLabel": "Settings"
  }
}
```

（`en.json` 用上面英文；其餘 4 個語言檔請翻成對應語言，繁中/簡中/日文/韓文，維持既有檔案的 JSON 結構與巢狀鍵名一致。）

- [ ] **Step 2: 寫失敗測試**

`tests/frontend/SettingsModal.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SettingsModal } from '../../src/frontend/components/SettingsModal.js'

describe('SettingsModal', () => {
  it('renders nothing when open is false', () => {
    render(<SettingsModal open={false} onClose={() => {}} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders the three category tabs when open', () => {
    render(<SettingsModal open={true} onClose={() => {}} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('General')).toBeInTheDocument()
    expect(screen.getByText('Appearance')).toBeInTheDocument()
    expect(screen.getByText('Custom CSS')).toBeInTheDocument()
  })

  it('defaults to the General category content', () => {
    render(<SettingsModal open={true} onClose={() => {}} />)
    expect(screen.getByTestId('settings-tab-content')).toBeInTheDocument()
  })

  it('switching category tabs swaps the content area', () => {
    render(<SettingsModal open={true} onClose={() => {}} />)
    fireEvent.click(screen.getByText('Appearance'))
    // content area still present after switching (real content arrives in Task 7)
    expect(screen.getByTestId('settings-tab-content')).toBeInTheDocument()
  })

  it('calls onClose when the close control is activated', () => {
    const onClose = vi.fn()
    render(<SettingsModal open={true} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
```

For `tests/frontend/App.test.tsx`, add:

```tsx
it('clicking the settings gear opens the settings modal', () => {
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: /settings/i }))
  expect(screen.getByRole('dialog')).toBeInTheDocument()
})
```

（實作者請對照現有 `App.test.tsx` 的 render/fetch-mock 前置設置調整這個案例。）

- [ ] **Step 3: 執行測試確認失敗**

Run: `npm run test:frontend -- SettingsModal.test.tsx App.test.tsx`
Expected: FAIL — module not found / button not found

- [ ] **Step 4: 實作**

`src/frontend/components/SettingsModal.tsx`:

```tsx
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

type Category = 'general' | 'appearance' | 'customCss'

interface SettingsModalProps {
  open: boolean
  onClose: () => void
}

export function SettingsModal({ open, onClose }: SettingsModalProps) {
  const { t } = useTranslation()
  const [category, setCategory] = useState<Category>('general')

  if (!open) return null

  return (
    <div role="dialog" aria-label={t('settings.generalTab')} style={{ display: 'flex' }}>
      <nav>
        <button onClick={() => setCategory('general')}>{t('settings.generalTab')}</button>
        <button onClick={() => setCategory('appearance')}>{t('settings.appearanceTab')}</button>
        <button onClick={() => setCategory('customCss')}>{t('settings.customCssTab')}</button>
      </nav>
      <div data-testid="settings-tab-content">
        {/* Task 6/7/8 replace this with GeneralTab/AppearanceTab/CustomCssTab based on `category` */}
      </div>
      <button aria-label="close" onClick={onClose}>
        ×
      </button>
    </div>
  )
}
```

在 `TopBar.tsx` 加入 `onOpenSettings` prop 並渲染按鈕：

```tsx
interface TopBarProps {
  onOpenSettings: () => void
}

export function TopBar({ onOpenSettings }: TopBarProps) {
  const { t } = useTranslation()
  return (
    <header data-testid="top-bar" style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px' }}>
      <span>MD Viewer Server</span>
      <div>
        <button aria-label={t('topBar.settingsLabel')} onClick={onOpenSettings}>
          ⚙
        </button>
      </div>
    </header>
  )
}
```

在 `App.tsx` 加入 `settingsOpen` state，把 `<TopBar onOpenSettings={() => setSettingsOpen(true)} />` 與 `<SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />` 接上（`aria-label`/`role="dialog"` 的 accessible name 用 `t('settings.generalTab')` 只是暫時值，實務上更適合用一個獨立的 `settings.dialogTitle` 鍵——若採用請一併補進 5 個語言檔）。

- [ ] **Step 5: 執行測試確認通過**

Run: `npm run test:frontend`
Expected: 全部通過

- [ ] **Step 6: Codex code review**

Run: `/codex:review --base <prev-commit-sha>`

- [ ] **Step 7: Commit — UI 段落**

```bash
git add src/frontend/components/SettingsModal.tsx src/frontend/components/TopBar.tsx src/frontend/App.tsx src/frontend/i18n/locales/*.json tests/frontend/SettingsModal.test.tsx tests/frontend/App.test.tsx
git commit -m "$(cat <<'EOF'
Add settings modal shell with categorized tabs and TopBar gear button

Why: The design spec calls for a categorized settings menu (仿
md-reader) reached via a gear icon in the top bar; this is the
container shell that Tasks 6-8 fill with real tab content, matching
the same incremental-skeleton-then-content approach used for the main
sidebar in Plan 5.
What: SettingsModal renders null when closed, or a dialog with three
category buttons (General/Appearance/Custom CSS) and a content slot
that later tasks route based on the selected category. TopBar gained
an onOpenSettings callback prop wired to a gear button; App.tsx owns
the open/close boolean.
How: [UI CHECKPOINT] UI-facing segment per CLAUDE.md's checkpoint
rule — flagging for review before Tasks 6-8 build real settings
controls into the content slot.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KCkr3UUhi36YHAEiAAhp5L
EOF
)"
```

---

### Task 6: 一般分頁（含隱私區塊）

**Files:**
- Create: `src/frontend/components/settings/GeneralTab.tsx`
- Modify: `src/frontend/components/SettingsModal.tsx`（`category === 'general'` 時渲染 `<GeneralTab>`）
- Test: `tests/frontend/GeneralTab.test.tsx`

**Interfaces:**
- `<GeneralTab settings={Settings | null} updateSettings={...} prefs={LocalPrefs} setPref={...} />`（型別沿用 Task 3/4 的 `useSettings`/`useLocalPrefs` 回傳值）— renders: language selector (reusing `i18next.changeLanguage`), `renderTxtAsMarkdown` toggle (local pref), `showHiddenFiles` + `outlineDefaultCollapsed` toggles (local prefs), `charsetCompatMode` toggle (local pref), `autoReloadViewingTabs` toggle (local pref), `bakOnSave` toggle (backend setting), and a **Privacy** section: `privacyMode` toggle (backend), plus `blockRemoteContent` / `plantumlServerUrl` text input / `sendToPlantUmlServer` / `allowHtmlScripts` controls that are **disabled** (native `disabled` attribute) whenever `settings.privacyMode` is `true`

- [ ] **Step 1: 寫失敗測試**

`tests/frontend/GeneralTab.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GeneralTab } from '../../src/frontend/components/settings/GeneralTab.js'
import { DEFAULT_LOCAL_PREFS } from '../../src/frontend/hooks/useLocalPrefs.js'

function baseSettings(overrides = {}) {
  return {
    plantumlServerUrl: 'https://www.plantuml.com/plantuml',
    sendToPlantUmlServer: false,
    privacyMode: false,
    blockRemoteContent: false,
    allowHtmlScripts: false,
    bakOnSave: false,
    effective: { blockRemoteContent: false, sendToPlantUmlServer: false, allowHtmlScripts: false },
    ...overrides,
  }
}

describe('GeneralTab', () => {
  it('privacy-locked controls are enabled when privacyMode is false', () => {
    render(
      <GeneralTab
        settings={baseSettings()}
        updateSettings={() => {}}
        prefs={DEFAULT_LOCAL_PREFS}
        setPref={() => {}}
      />
    )
    expect(screen.getByLabelText(/allow.*html.*script/i)).not.toBeDisabled()
  })

  it('privacy-locked controls are disabled when privacyMode is true', () => {
    render(
      <GeneralTab
        settings={baseSettings({ privacyMode: true })}
        updateSettings={() => {}}
        prefs={DEFAULT_LOCAL_PREFS}
        setPref={() => {}}
      />
    )
    expect(screen.getByLabelText(/allow.*html.*script/i)).toBeDisabled()
    expect(screen.getByLabelText(/block.*remote/i)).toBeDisabled()
    expect(screen.getByLabelText(/send.*plantuml/i)).toBeDisabled()
  })

  it('toggling privacyMode calls updateSettings with the new value', () => {
    const updateSettings = vi.fn()
    render(
      <GeneralTab
        settings={baseSettings()}
        updateSettings={updateSettings}
        prefs={DEFAULT_LOCAL_PREFS}
        setPref={() => {}}
      />
    )
    fireEvent.click(screen.getByLabelText(/privacy mode/i))
    expect(updateSettings).toHaveBeenCalledWith({ privacyMode: true })
  })

  it('toggling a local pref calls setPref, not updateSettings', () => {
    const setPref = vi.fn()
    const updateSettings = vi.fn()
    render(
      <GeneralTab
        settings={baseSettings()}
        updateSettings={updateSettings}
        prefs={DEFAULT_LOCAL_PREFS}
        setPref={setPref}
      />
    )
    fireEvent.click(screen.getByLabelText(/hidden files/i))
    expect(setPref).toHaveBeenCalledWith('showHiddenFiles', true)
    expect(updateSettings).not.toHaveBeenCalled()
  })

  it('renders nothing crash-worthy when settings is still null (loading)', () => {
    expect(() =>
      render(
        <GeneralTab settings={null} updateSettings={() => {}} prefs={DEFAULT_LOCAL_PREFS} setPref={() => {}} />
      )
    ).not.toThrow()
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npm run test:frontend -- GeneralTab.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: 加入 i18n 鍵**

在 5 個語言檔加入（`en.json` 範例，其餘語言請對應翻譯）：

```json
{
  "settings": {
    "language": "Language",
    "renderTxtAsMarkdown": "Render .txt files as Markdown",
    "showHiddenFiles": "Show hidden files",
    "outlineCollapsed": "Outline panel collapsed by default",
    "charsetCompatMode": "Charset compatibility mode (force UTF-8 redecoding)",
    "autoReload": "Auto-reload viewing tabs on file change",
    "bakOnSave": "Create .bak backup on save",
    "privacyModeLabel": "Privacy mode",
    "blockRemoteContent": "Block remote images/videos/iframes in documents",
    "plantumlServerUrl": "PlantUML server URL",
    "sendToPlantUmlServer": "Send diagram source to PlantUML server",
    "allowHtmlScripts": "Allow HTML files to execute scripts"
  }
}
```

- [ ] **Step 4: 實作**

`src/frontend/components/settings/GeneralTab.tsx`:

```tsx
import { useTranslation } from 'react-i18next'
import type { Settings } from '../../hooks/useSettings.js'
import type { LocalPrefs } from '../../hooks/useLocalPrefs.js'

interface GeneralTabProps {
  settings: Settings | null
  updateSettings: (patch: Partial<Settings>) => void
  prefs: LocalPrefs
  setPref: <K extends keyof LocalPrefs>(key: K, value: LocalPrefs[K]) => void
}

export function GeneralTab({ settings, updateSettings, prefs, setPref }: GeneralTabProps) {
  const { t, i18n } = useTranslation()
  const locked = settings?.privacyMode ?? false

  return (
    <div>
      <label>
        {t('settings.language')}
        <select value={i18n.language} onChange={(e) => i18n.changeLanguage(e.target.value)}>
          <option value="en">English</option>
          <option value="zh-TW">繁體中文</option>
          <option value="zh-CN">简体中文</option>
          <option value="ja">日本語</option>
          <option value="ko">한국어</option>
        </select>
      </label>

      <label>
        <input
          type="checkbox"
          checked={prefs.renderTxtAsMarkdown}
          onChange={(e) => setPref('renderTxtAsMarkdown', e.target.checked)}
        />
        {t('settings.renderTxtAsMarkdown')}
      </label>
      <label>
        <input
          type="checkbox"
          checked={prefs.showHiddenFiles}
          onChange={(e) => setPref('showHiddenFiles', e.target.checked)}
        />
        {t('settings.showHiddenFiles')}
      </label>
      <label>
        <input
          type="checkbox"
          checked={prefs.outlineDefaultCollapsed}
          onChange={(e) => setPref('outlineDefaultCollapsed', e.target.checked)}
        />
        {t('settings.outlineCollapsed')}
      </label>
      <label>
        <input
          type="checkbox"
          checked={prefs.charsetCompatMode}
          onChange={(e) => setPref('charsetCompatMode', e.target.checked)}
        />
        {t('settings.charsetCompatMode')}
      </label>
      <label>
        <input
          type="checkbox"
          checked={prefs.autoReloadViewingTabs}
          onChange={(e) => setPref('autoReloadViewingTabs', e.target.checked)}
        />
        {t('settings.autoReload')}
      </label>

      {settings && (
        <>
          <label>
            <input
              type="checkbox"
              checked={settings.bakOnSave}
              onChange={(e) => updateSettings({ bakOnSave: e.target.checked })}
            />
            {t('settings.bakOnSave')}
          </label>

          <fieldset>
            <legend>{t('settings.privacyModeLabel')}</legend>
            <label>
              <input
                type="checkbox"
                checked={settings.privacyMode}
                onChange={(e) => updateSettings({ privacyMode: e.target.checked })}
              />
              {t('settings.privacyModeLabel')}
            </label>
            <label>
              <input
                type="checkbox"
                disabled={locked}
                checked={settings.blockRemoteContent}
                onChange={(e) => updateSettings({ blockRemoteContent: e.target.checked })}
              />
              {t('settings.blockRemoteContent')}
            </label>
            <label>
              {t('settings.plantumlServerUrl')}
              <input
                type="text"
                value={settings.plantumlServerUrl}
                onChange={(e) => updateSettings({ plantumlServerUrl: e.target.value })}
              />
            </label>
            <label>
              <input
                type="checkbox"
                disabled={locked}
                checked={settings.sendToPlantUmlServer}
                onChange={(e) => updateSettings({ sendToPlantUmlServer: e.target.checked })}
              />
              {t('settings.sendToPlantUmlServer')}
            </label>
            <label>
              <input
                type="checkbox"
                disabled={locked}
                checked={settings.allowHtmlScripts}
                onChange={(e) => updateSettings({ allowHtmlScripts: e.target.checked })}
              />
              {t('settings.allowHtmlScripts')}
            </label>
          </fieldset>
        </>
      )}
    </div>
  )
}
```

在 `SettingsModal.tsx` 接上 `useSettings`/`useLocalPrefs` 並在 `category === 'general'` 時渲染 `<GeneralTab settings={settings} updateSettings={updateSettings} prefs={prefs} setPref={setPref} />`（取代 `data-testid="settings-tab-content"` 的空殼——保留該 `data-testid` 包在外層 wrapper 上，讓 Task 5 的測試仍然通過）。

- [ ] **Step 5: 執行測試確認通過**

Run: `npm run test:frontend`
Expected: 全部通過

- [ ] **Step 6: Codex code review**

Run: `/codex:review --base <prev-commit-sha>`

- [ ] **Step 7: Commit — UI 段落**

```bash
git add src/frontend/components/settings/GeneralTab.tsx src/frontend/components/SettingsModal.tsx src/frontend/i18n/locales/*.json tests/frontend/GeneralTab.test.tsx
git commit -m "$(cat <<'EOF'
Add General settings tab with privacy-mode lock UI

Why: This is the tab where the design spec's privacy-mode toggle and
its three locked settings live, plus the general
file-explorer/encoding/live-update preferences.
What: GeneralTab renders local prefs (language, txt-as-markdown,
hidden files, outline default-collapsed, charset compat, auto-
reload) via useLocalPrefs's setPref, and backend settings (bak-on-
save, privacy mode, block-remote-content, PlantUML URL/send toggle,
allow-html-scripts) via useSettings's updateSettings. The three
privacy-lockable controls get the native `disabled` attribute
whenever settings.privacyMode is true, mirroring the server-side
effective-value lock added in Task 1 — this is a UX affordance only;
Task 1 is what actually enforces the lock server-side.
How: [UI CHECKPOINT] UI-facing segment per CLAUDE.md's checkpoint
rule.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KCkr3UUhi36YHAEiAAhp5L
EOF
)"
```

---

### Task 7: 外觀分頁

**Files:**
- Create: `src/frontend/components/settings/AppearanceTab.tsx`
- Modify: `src/frontend/components/SettingsModal.tsx`（`category === 'appearance'`）
- Modify: `src/frontend/App.tsx`（把 `prefs.theme` 套用到 `document.documentElement`）
- Test: `tests/frontend/AppearanceTab.test.tsx`

**Interfaces:**
- `<AppearanceTab prefs={LocalPrefs} setPref={...} />` — renders theme radio group (`light`/`dark`/`system`), an accent-color `<input type="color">`, editor font-size number input, editor indent-width number input; all backed by `useLocalPrefs`

- [ ] **Step 1: 寫失敗測試**

`tests/frontend/AppearanceTab.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AppearanceTab } from '../../src/frontend/components/settings/AppearanceTab.js'
import { DEFAULT_LOCAL_PREFS } from '../../src/frontend/hooks/useLocalPrefs.js'

describe('AppearanceTab', () => {
  it('selecting a theme option calls setPref with the new theme', () => {
    const setPref = vi.fn()
    render(<AppearanceTab prefs={DEFAULT_LOCAL_PREFS} setPref={setPref} />)
    fireEvent.click(screen.getByLabelText(/dark/i))
    expect(setPref).toHaveBeenCalledWith('theme', 'dark')
  })

  it('changing the font size input calls setPref with a number, not a string', () => {
    const setPref = vi.fn()
    render(<AppearanceTab prefs={DEFAULT_LOCAL_PREFS} setPref={setPref} />)
    fireEvent.change(screen.getByLabelText(/font size/i), { target: { value: '18' } })
    expect(setPref).toHaveBeenCalledWith('editorFontSize', 18)
  })

  it('changing the indent width input calls setPref with a number', () => {
    const setPref = vi.fn()
    render(<AppearanceTab prefs={DEFAULT_LOCAL_PREFS} setPref={setPref} />)
    fireEvent.change(screen.getByLabelText(/indent/i), { target: { value: '4' } })
    expect(setPref).toHaveBeenCalledWith('editorIndentWidth', 4)
  })

  it('changing the accent color input calls setPref with the hex value', () => {
    const setPref = vi.fn()
    render(<AppearanceTab prefs={DEFAULT_LOCAL_PREFS} setPref={setPref} />)
    fireEvent.change(screen.getByLabelText(/accent/i), { target: { value: '#ff0000' } })
    expect(setPref).toHaveBeenCalledWith('accentColor', '#ff0000')
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npm run test:frontend -- AppearanceTab.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: 加入 i18n 鍵**

```json
{
  "settings": {
    "theme": "Theme",
    "themeLight": "Light",
    "themeDark": "Dark",
    "themeSystem": "System",
    "accentColor": "Accent color",
    "editorFontSize": "Editor font size",
    "editorIndentWidth": "Editor indent width"
  }
}
```

- [ ] **Step 4: 實作**

`src/frontend/components/settings/AppearanceTab.tsx`:

```tsx
import { useTranslation } from 'react-i18next'
import type { LocalPrefs } from '../../hooks/useLocalPrefs.js'

interface AppearanceTabProps {
  prefs: LocalPrefs
  setPref: <K extends keyof LocalPrefs>(key: K, value: LocalPrefs[K]) => void
}

export function AppearanceTab({ prefs, setPref }: AppearanceTabProps) {
  const { t } = useTranslation()

  return (
    <div>
      <fieldset>
        <legend>{t('settings.theme')}</legend>
        {(['light', 'dark', 'system'] as const).map((option) => (
          <label key={option}>
            <input
              type="radio"
              name="theme"
              checked={prefs.theme === option}
              onChange={() => setPref('theme', option)}
            />
            {t(`settings.theme${option[0].toUpperCase()}${option.slice(1)}`)}
          </label>
        ))}
      </fieldset>

      <label>
        {t('settings.accentColor')}
        <input
          type="color"
          value={prefs.accentColor}
          onChange={(e) => setPref('accentColor', e.target.value)}
        />
      </label>

      <label>
        {t('settings.editorFontSize')}
        <input
          type="number"
          value={prefs.editorFontSize}
          onChange={(e) => setPref('editorFontSize', Number(e.target.value))}
        />
      </label>

      <label>
        {t('settings.editorIndentWidth')}
        <input
          type="number"
          value={prefs.editorIndentWidth}
          onChange={(e) => setPref('editorIndentWidth', Number(e.target.value))}
        />
      </label>
    </div>
  )
}
```

在 `App.tsx` 加入一個 `useEffect` 依 `prefs.theme` 設定 `document.documentElement.dataset.theme`（`system` 時移除該 attribute，交給 CSS 的 `prefers-color-scheme` 媒體查詢決定）：

```tsx
useEffect(() => {
  if (prefs.theme === 'system') {
    delete document.documentElement.dataset.theme
  } else {
    document.documentElement.dataset.theme = prefs.theme
  }
}, [prefs.theme])
```

（實際的 dark/light CSS 變數定義屬於 `src/frontend/styles/global.css` 的既有範疇，若尚未有對應變數，這個 task 不需要補齊完整的視覺主題系統——只需要把「使用者選擇」正確反映到 DOM 屬性上，讓既有或後續的 CSS 有依據可用。）

- [ ] **Step 5: 執行測試確認通過**

Run: `npm run test:frontend`
Expected: 全部通過

- [ ] **Step 6: Codex code review**

Run: `/codex:review --base <prev-commit-sha>`

- [ ] **Step 7: Commit — UI 段落**

```bash
git add src/frontend/components/settings/AppearanceTab.tsx src/frontend/components/SettingsModal.tsx src/frontend/App.tsx src/frontend/i18n/locales/*.json tests/frontend/AppearanceTab.test.tsx
git commit -m "$(cat <<'EOF'
Add Appearance settings tab and apply theme choice to the document

Why: The design spec's Appearance tab covers theme, accent color, and
editor font size/indent width — all device-local display preferences
with no backend involvement (Task 4's useLocalPrefs).
What: AppearanceTab renders a theme radio group plus color/number
inputs, each writing straight to useLocalPrefs. App.tsx applies the
resolved theme choice to document.documentElement's `data-theme`
attribute (removed entirely for "system", so the existing
prefers-color-scheme media query take over).
How: [UI CHECKPOINT] UI-facing segment per CLAUDE.md's checkpoint
rule. Number inputs coerce via Number() before calling setPref so
LocalPrefs' numeric fields never end up holding a string.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KCkr3UUhi36YHAEiAAhp5L
EOF
)"
```

---

### Task 8: 自訂 CSS 分頁

**Files:**
- Create: `src/frontend/components/settings/CustomCssTab.tsx`
- Modify: `src/frontend/components/SettingsModal.tsx`（`category === 'customCss'`）
- Modify: `src/frontend/App.tsx`（把目前套用中的 CSS 內容注入一個全域 `<style>` 標籤）
- Test: `tests/frontend/CustomCssTab.test.tsx`

**Interfaces:**
- `<CustomCssTab value={string} onChange={(css: string) => void} onResetToDefault={() => void} />` — a `<textarea>` for live editing (content owned by the parent, persisted to `localStorage['mvs-custom-css']` by the parent, not this component), a preset `<select>` populated from `GET /api/css-presets`, an "Apply" button that sets `value` to the selected preset's `css`, and a "Save as new preset" flow (name prompt via a controlled text input, not `window.prompt` — browser dialogs are disallowed per this project's tooling constraints) that calls `POST /api/css-presets`

- [ ] **Step 1: 寫失敗測試**

`tests/frontend/CustomCssTab.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CustomCssTab } from '../../src/frontend/components/settings/CustomCssTab.js'

describe('CustomCssTab', () => {
  beforeEach(() => sessionStorage.setItem('mvs-token', 'tok'))
  afterEach(() => {
    vi.unstubAllGlobals()
    sessionStorage.clear()
  })

  it('renders the current CSS value in the editor', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify([]))))
    render(<CustomCssTab value=".markdown-body { color: red; }" onChange={() => {}} onResetToDefault={() => {}} />)
    expect(screen.getByRole('textbox')).toHaveValue('.markdown-body { color: red; }')
  })

  it('calls onChange as the user edits', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify([]))))
    const onChange = vi.fn()
    render(<CustomCssTab value="" onChange={onChange} onResetToDefault={() => {}} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '.markdown-body {}' } })
    expect(onChange).toHaveBeenCalledWith('.markdown-body {}')
  })

  it('loads presets from GET /api/css-presets and applying one calls onChange with its css', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify([{ id: '1', name: 'editorial', css: '.markdown-body { color: blue; }' }]))
      )
    )
    const onChange = vi.fn()
    render(<CustomCssTab value="" onChange={onChange} onResetToDefault={() => {}} />)
    await waitFor(() => screen.getByText('editorial'))
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: /apply/i }))
    expect(onChange).toHaveBeenCalledWith('.markdown-body { color: blue; }')
  })

  it('calls onResetToDefault when the reset button is clicked', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify([]))))
    const onResetToDefault = vi.fn()
    render(<CustomCssTab value="x" onChange={() => {}} onResetToDefault={onResetToDefault} />)
    fireEvent.click(screen.getByRole('button', { name: /reset/i }))
    expect(onResetToDefault).toHaveBeenCalledOnce()
  })

  it('saving as a new preset POSTs the current value with the entered name', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([])))
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ id: '2', name: 'my-preset', css: '.markdown-body {}' }]), { status: 201 })
      )
    vi.stubGlobal('fetch', fetchMock)
    render(<CustomCssTab value=".markdown-body {}" onChange={() => {}} onResetToDefault={() => {}} />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    fireEvent.change(screen.getByLabelText(/preset name/i), { target: { value: 'my-preset' } })
    fireEvent.click(screen.getByRole('button', { name: /save as new preset/i }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    const postCall = fetchMock.mock.calls[1]
    expect(JSON.parse(postCall[1].body)).toEqual({ name: 'my-preset', css: '.markdown-body {}' })
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npm run test:frontend -- CustomCssTab.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: 加入 i18n 鍵**

```json
{
  "settings": {
    "cssEditorLabel": "Custom CSS (article rendering area only)",
    "cssPresetLabel": "Preset",
    "cssApply": "Apply",
    "cssReset": "Reset to default",
    "cssPresetNameLabel": "Preset name",
    "cssSaveAsNew": "Save as new preset"
  }
}
```

- [ ] **Step 4: 實作**

`src/frontend/components/settings/CustomCssTab.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { apiFetch } from '../../api-client.js'

interface Preset {
  id: string
  name: string
  css: string
}

interface CustomCssTabProps {
  value: string
  onChange: (css: string) => void
  onResetToDefault: () => void
}

export function CustomCssTab({ value, onChange, onResetToDefault }: CustomCssTabProps) {
  const { t } = useTranslation()
  const [presets, setPresets] = useState<Preset[]>([])
  const [selectedPresetId, setSelectedPresetId] = useState('')
  const [newPresetName, setNewPresetName] = useState('')

  useEffect(() => {
    apiFetch('/api/css-presets')
      .then((res) => res.json())
      .then(setPresets)
  }, [])

  function applySelectedPreset() {
    const preset = presets.find((p) => p.id === selectedPresetId)
    if (preset) onChange(preset.css)
  }

  async function saveAsNewPreset() {
    const res = await apiFetch('/api/css-presets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newPresetName, css: value }),
    })
    const updated = await res.json()
    setPresets(updated)
    setNewPresetName('')
  }

  return (
    <div>
      <label>
        {t('settings.cssEditorLabel')}
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={12} />
      </label>

      <button onClick={onResetToDefault}>{t('settings.cssReset')}</button>

      <label>
        {t('settings.cssPresetLabel')}
        <select value={selectedPresetId} onChange={(e) => setSelectedPresetId(e.target.value)}>
          <option value="" disabled>
            —
          </option>
          {presets.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.name}
            </option>
          ))}
        </select>
      </label>
      <button onClick={applySelectedPreset}>{t('settings.cssApply')}</button>

      <label>
        {t('settings.cssPresetNameLabel')}
        <input type="text" value={newPresetName} onChange={(e) => setNewPresetName(e.target.value)} />
      </label>
      <button onClick={saveAsNewPreset}>{t('settings.cssSaveAsNew')}</button>
    </div>
  )
}
```

在 `App.tsx`：加入 `customCss` state（初始從 `localStorage.getItem('mvs-custom-css') ?? ''`），`onChange` 時同時更新 state 與寫回 `localStorage`；渲染一個 `<style>{customCss}</style>` 掛在頂層（selector 已由範本/使用者自行限制在 `.markdown-body`，App 層不做二次過濾——若使用者刻意寫出影響其他區域的 selector 屬於使用者自行承擔，不是資安邊界，因為 CSS 不能拿來執行任意程式碼或存取 token）。`onResetToDefault` 清空 `customCss` 並移除該 `localStorage` 鍵。

- [ ] **Step 5: 執行測試確認通過**

Run: `npm run test:frontend`
Expected: 全部通過

- [ ] **Step 6: Codex code review**

Run: `/codex:review --base <prev-commit-sha>`

- [ ] **Step 7: Commit — UI 段落**

```bash
git add src/frontend/components/settings/CustomCssTab.tsx src/frontend/components/SettingsModal.tsx src/frontend/App.tsx src/frontend/i18n/locales/*.json tests/frontend/CustomCssTab.test.tsx
git commit -m "$(cat <<'EOF'
Add Custom CSS settings tab with preset apply/save

Why: The design spec's Custom CSS tab needs a live editor scoped to
the article-rendering container, backed by the growable preset
library Task 2 built server-side.
What: CustomCssTab is a controlled textarea (content owned by
App.tsx, persisted to localStorage so it's not lost on reload) plus a
preset dropdown fetched from GET /api/css-presets, an Apply button
that loads a preset's css into the editor, and a name input + Save
button that POSTs the current editor content as a new preset.
App.tsx injects the current CSS into a top-level <style> tag.
How: [UI CHECKPOINT] UI-facing segment per CLAUDE.md's checkpoint
rule — this is the last new settings-tab content; Task 9 wires the
remaining cross-cutting integration (allowHtmlScripts into TabContent)
and does the whole-plan closing review.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KCkr3UUhi36YHAEiAAhp5L
EOF
)"
```

---

### Task 9: 收尾整合 — `allowHtmlScripts` 接線 + 全計畫驗證

**Files:**
- Modify: `src/frontend/App.tsx`（把 Plan 6 寫死的 `allowHtmlScripts={false}` 換成 `settings?.effective.allowHtmlScripts ?? false`）
- Test: 擴充 `tests/frontend/App.test.tsx`

**Interfaces:** 無新介面——這是把 Task 3 的 `useSettings` 與 Plan 6 Task 7/8 建立的 `<TabContent allowHtmlScripts={...}>` 接起來的收尾工作

- [ ] **Step 1: 寫失敗測試**

在 `App.test.tsx` 加入：

```tsx
it('passes settings.effective.allowHtmlScripts through to TabContent for an open .html tab', async () => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
    if (url.includes('/api/settings')) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            plantumlServerUrl: 'https://www.plantuml.com/plantuml',
            sendToPlantUmlServer: false,
            privacyMode: false,
            blockRemoteContent: false,
            allowHtmlScripts: true,
            bakOnSave: false,
            effective: { blockRemoteContent: false, sendToPlantUmlServer: false, allowHtmlScripts: true },
          })
        )
      )
    }
    if (url.includes('/api/roots')) {
      return Promise.resolve(new Response(JSON.stringify([{ id: 0, name: 'proj' }])))
    }
    if (url.includes('/api/files')) {
      return Promise.resolve(new Response(JSON.stringify({ files: [{ relPath: 'a.html', size: 5, mtimeMs: 1 }] })))
    }
    if (url.includes('/api/file?')) {
      return Promise.resolve(new Response(JSON.stringify({ content: '<p>hi</p>', mtimeMs: 1, encoding: 'utf-8' })))
    }
    return Promise.resolve(new Response(JSON.stringify([])))
  }))
  render(<App />)
  await waitFor(() => screen.getByText('a.html'))
  fireEvent.click(screen.getByText('a.html'))
  await waitFor(() => expect(screen.getByTitle('html-preview').getAttribute('sandbox')).toContain('allow-scripts'))
  vi.unstubAllGlobals()
})
```

（實作者請對照當時 `App.tsx`/`App.test.tsx` 的實際結構調整 fetch mock 細節，重點是驗證「設定開啟 allowHtmlScripts → 開啟的 .html 分頁的 iframe sandbox 含 allow-scripts」這條端到端路徑。）

- [ ] **Step 2: 執行測試確認失敗**

Run: `npm run test:frontend -- App.test.tsx`
Expected: FAIL — `allowHtmlScripts` 仍寫死 `false`

- [ ] **Step 3: 實作**

在 `App.tsx` 找到 Plan 6 遺留的 `<TabContent ... allowHtmlScripts={false} />`，改為：

```tsx
<TabContent
  tab={activeTab}
  onContentLoaded={handleContentLoaded}
  onChange={(value) => handleChange(activeTab.id, value)}
  onSave={() => handleSave(activeTab.id)}
  allowHtmlScripts={settings?.effective.allowHtmlScripts ?? false}
/>
```

- [ ] **Step 4: 執行測試確認通過**

Run: `npm run test:frontend`
Expected: 全部通過

- [ ] **Step 5: 完整驗證**

Run: `npm run lint && npm run typecheck:frontend && npm run test:frontend && npm run test:unit && npm run test:integration && npm run build`
Expected: 全部通過

- [ ] **Step 6: Codex code review — 全計畫收尾 review**

Run: `/codex:adversarial-review --base <Plan5-Task4-或更早的-commit-sha,即本計畫開始前的-commit>`，focus text 例如：「Review the entire settings-menu plan (privacy mode lock enforcement, CSS preset security, backend/frontend settings split) for design flaws, security gaps, and whether the privacy-mode lock can be bypassed anywhere」。修正任何 Critical/Important 發現。

- [ ] **Step 7: Commit**

```bash
git add src/frontend/App.tsx tests/frontend/App.test.tsx
git commit -m "$(cat <<'EOF'
Wire allowHtmlScripts setting into TabContent, completing the privacy-mode lock end to end

Why: Plan 6 (main content view) built HtmlView/TabContent with a
placeholder allowHtmlScripts={false} constant, explicitly deferring
to this settings-menu plan to supply the real value. Without this
wiring, the privacy-mode lock built in Task 1 and surfaced in Task 6
would control a setting that no rendering code actually reads.
What: App.tsx now passes settings?.effective.allowHtmlScripts (from
Task 3's useSettings, reflecting Task 1's server-side privacy-mode
override) into TabContent instead of a hardcoded false.
How: [UI CHECKPOINT] Last integration step of the settings-menu plan
and the last of the six /goal sub-plans. Codex adversarial review run
across the whole plan's diff to check the privacy-mode lock can't be
bypassed through any path (direct API call, settings UI state, or
this final wiring).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KCkr3UUhi36YHAEiAAhp5L
EOF
)"
```

---

## Definition of Done

- [ ] `npm run lint`, `npm run typecheck:frontend`, `npm run test:frontend`, `npm run test:unit`, `npm run test:integration`, `npm run build` all pass
- [ ] Privacy mode, once enabled, forces `blockRemoteContent`/`sendToPlantUmlServer`/`allowHtmlScripts` to safe values both in the settings UI (disabled controls) and enforced server-side (`effective.*`), verified by calling `POST /api/plantuml-proxy` directly while privacy mode is on
- [ ] Turning privacy mode back off restores the user's previously saved individual preferences (not defaults)
- [ ] CSS presets seed on first read, persist new presets across restarts, and applying/saving a preset round-trips through the Custom CSS tab
- [ ] Theme selection visibly changes `document.documentElement`'s `data-theme` attribute
- [ ] Opening an `.html` file after enabling "allow HTML scripts" in settings renders its iframe with `sandbox="allow-scripts"` (still without `allow-same-origin`, per Plan 6's HtmlView contract)
- [ ] All six `/goal` sub-plans (檔案 API, 搜尋, 認證細節, 前端骨架, 主內容區, 設定選單) are now implemented and merged to `main`
