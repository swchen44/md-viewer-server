# 設定選單 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立分類式設定選單（一般／外觀／自訂 CSS，仿 md-reader），涵蓋隱私模式總開關與鎖定邏輯、PlantUML 伺服器設定、CSS 四選一（兩個唯讀內建範本 + 兩個可編輯的個人 slot）。這是 `/goal` 六個子計畫中的最後一個，完成後主要的使用者可見功能全部到位。

**Architecture:** 設定分兩種持久化層級：
1. **後端 config.json（`GET/PUT /api/settings`，Plan 4 已建立雛形）**：只放「會影響伺服器行為或安全姿態，或屬於使用者想長期保存的個人設定」的設定——`privacyMode`、`blockRemoteContent`、`plantumlServerUrl`、`sendToPlantUmlServer`、`allowHtmlScripts`、`bakOnSave`，以及 CSS 選擇狀態 `customCssChoice`/`customCssUser1`/`customCssUser2`（見下方 CSS 設計調整）。這些設定需要跨裝置/瀏覽器一致（同一台 daemon 可能被多個瀏覽器分頁連線），且隱私鎖定必須在伺服器端也強制生效，不能只靠前端 UI disable 掉開關就假裝安全。
2. **前端 localStorage（新 `useLocalPrefs` hook）**：純顯示/裝置本地偏好——主題、accent color、編輯器字型大小/縮排、顯示隱藏檔、大綱側邊欄預設摺疊、字元集相容模式、即時更新開關、`.txt` 是否當 Markdown 渲染、換行風格。這些不影響資料安全，且沒有跨裝置同步的必要。

**CSS 設計調整（2026-09-06，執行前修改，尚未動工零成本）**：原始 spec 設想的是一個可持續累積的範本庫（`css-presets.json` + `GET/POST /api/css-presets`）。使用者參考了姊妹專案 `md-reader` 已經上線、測試過的「四選一」模型（`docs/superpowers/plans/2026-09-06-css-slots-search-history.md`），決定改用同一套更簡單的設計：固定四個選項——`editorial`/`developer` 兩個內建範本（唯讀，可選可看不可改）、`user1`/`user2` 兩個個人 slot（可編輯，選取後編輯框顯示該 slot 內容，按「套用」才會寫回並生效）。這比原本的成長式範本庫更簡單，也不需要獨立的 `css-presets.json` 檔案或 API——四個選項的狀態整個併入既有的 flat settings 模型（`customCssChoice: 'editorial'|'developer'|'user1'|'user2'`、`customCssUser1: string`、`customCssUser2: string`），兩個內建範本的 CSS 內容變成程式碼裡的常數（不是可成長的檔案）。**因為 Plan 7 從未開始實作，這個設計改動零重工成本，直接反映在下面的 Task 2/8 裡，不再有獨立的「CSS 範本後端」task。**

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
├── settings.js                    ← 擴充新欄位（含 CSS 選擇狀態）+ effective 覆寫邏輯（Modify）
├── custom-css-presets.js             ← 新建：兩個內建範本的 CSS 常數 + resolveCustomCss() 解析目前生效內容
├── api/
│   ├── settings.js                     ← 既有路由不變
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
└── settings.test.js（既有，擴充：privacy 欄位 + CSS 選擇狀態欄位）

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

### Task 2: CSS 選擇狀態後端（四選一：兩個唯讀內建範本 + 兩個可編輯個人 slot）

**Files:**
- Create: `src/server/custom-css-presets.js`
- Modify: `src/server/settings.js`
- Test: `tests/unit/server/settings.test.js`（擴充）
- Test: `tests/unit/server/custom-css-presets.test.js`

**Interfaces:**
- `custom-css-presets.js` 匯出 `EDITORIAL_CSS: string`、`DEVELOPER_CSS: string`（兩個內建範本的 CSS 內容，selector 使用 `.markdown-body` 前綴，從 md-reader 移植）、`type CustomCssChoice = 'editorial' | 'developer' | 'user1' | 'user2'`、`resolveCustomCssChoice({customCssChoice, customCssUser1, customCssUser2}): {choice: CustomCssChoice, draft: string, readonly: boolean}`——`editorial`/`developer` 回傳對應常數且 `readonly: true`；`user1`/`user2` 回傳對應 slot 內容（可能是空字串）且 `readonly: false`
- `settings.js` 的 `ALLOWED_SETTINGS_KEYS` 新增 `'customCssChoice', 'customCssUser1', 'customCssUser2'`；`readSettings` 回傳這三個欄位，預設 `customCssChoice: 'user1'`、`customCssUser1: ''`、`customCssUser2: ''`

- [ ] **Step 1: 寫失敗測試**

`tests/unit/server/custom-css-presets.test.js`:

```js
import { describe, it, expect } from 'vitest'
import {
  EDITORIAL_CSS,
  DEVELOPER_CSS,
  resolveCustomCssChoice,
} from '../../../src/server/custom-css-presets.js'

describe('resolveCustomCssChoice', () => {
  it('built-in choices are readonly and return the constant CSS', () => {
    const editorial = resolveCustomCssChoice({
      customCssChoice: 'editorial',
      customCssUser1: 'ignored',
      customCssUser2: 'ignored',
    })
    expect(editorial).toEqual({ choice: 'editorial', draft: EDITORIAL_CSS, readonly: true })

    const developer = resolveCustomCssChoice({
      customCssChoice: 'developer',
      customCssUser1: '',
      customCssUser2: '',
    })
    expect(developer).toEqual({ choice: 'developer', draft: DEVELOPER_CSS, readonly: true })
  })

  it('user choices are editable and return that slot\'s stored content', () => {
    expect(
      resolveCustomCssChoice({ customCssChoice: 'user1', customCssUser1: 'one', customCssUser2: 'two' })
    ).toEqual({ choice: 'user1', draft: 'one', readonly: false })

    expect(
      resolveCustomCssChoice({ customCssChoice: 'user2', customCssUser1: 'one', customCssUser2: 'two' })
    ).toEqual({ choice: 'user2', draft: 'two', readonly: false })
  })

  it('an empty user slot resolves to an empty draft, not the built-in CSS', () => {
    expect(
      resolveCustomCssChoice({ customCssChoice: 'user1', customCssUser1: '', customCssUser2: '' })
    ).toEqual({ choice: 'user1', draft: '', readonly: false })
  })

  it('built-in preset CSS is scoped to the markdown-body container', () => {
    expect(EDITORIAL_CSS).toMatch(/\.markdown-body/)
    expect(DEVELOPER_CSS).toMatch(/\.markdown-body/)
  })
})
```

在 `tests/unit/server/settings.test.js` 加入：

```js
it('defaults CSS choice to user1 with empty slots', () => {
  const settings = readSettings(configDir)
  expect(settings.customCssChoice).toBe('user1')
  expect(settings.customCssUser1).toBe('')
  expect(settings.customCssUser2).toBe('')
})

it('accepts CSS choice fields through updateSettings', () => {
  updateSettings(configDir, {
    customCssChoice: 'user2',
    customCssUser1: '.markdown-body { color: blue; }',
    customCssUser2: '.markdown-body { color: green; }',
  })
  const settings = readSettings(configDir)
  expect(settings.customCssChoice).toBe('user2')
  expect(settings.customCssUser1).toBe('.markdown-body { color: blue; }')
  expect(settings.customCssUser2).toBe('.markdown-body { color: green; }')
})
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npm run test:unit -- custom-css-presets.test.js settings.test.js`
Expected: FAIL

- [ ] **Step 3: 實作**

`src/server/custom-css-presets.js`（CSS 內容從 md-reader 的 `src/config/custom-css-presets.ts` 移植，selector 換成本專案的 `.markdown-body` 容器）：

```js
export const EDITORIAL_CSS = `.markdown-body {
  background: #f5f1e8;
  font-family: Georgia, 'Times New Roman', serif;
}
.markdown-body h1, .markdown-body h2 {
  font-family: Georgia, serif;
  font-size: 2.2em;
}`

export const DEVELOPER_CSS = `.markdown-body {
  background: #1e1e1e;
  color: #d4d4d4;
}
.markdown-body pre, .markdown-body code {
  background: #0d0d0d;
  color: #9cdcfe;
  font-family: 'Fira Code', monospace;
}`

export function resolveCustomCssChoice({ customCssChoice, customCssUser1, customCssUser2 }) {
  if (customCssChoice === 'editorial') {
    return { choice: 'editorial', draft: EDITORIAL_CSS, readonly: true }
  }
  if (customCssChoice === 'developer') {
    return { choice: 'developer', draft: DEVELOPER_CSS, readonly: true }
  }
  if (customCssChoice === 'user2') {
    return { choice: 'user2', draft: customCssUser2 ?? '', readonly: false }
  }
  return { choice: 'user1', draft: customCssUser1 ?? '', readonly: false }
}
```

`src/server/settings.js`：把 `ALLOWED_SETTINGS_KEYS` 加上 `'customCssChoice', 'customCssUser1', 'customCssUser2'`，`readSettings` 回傳物件加上：

```js
customCssChoice: config.customCssChoice ?? 'user1',
customCssUser1: config.customCssUser1 ?? '',
customCssUser2: config.customCssUser2 ?? '',
```

（不需要對 `customCssChoice`/`customCssUser1`/`customCssUser2` 做特別的值驗證——`customCssChoice` 若收到不合法字串，`resolveCustomCssChoice` 的 fallback 分支會安全地當成 `user1` 處理，不會因為壞值而炸掉；CSS 內容本身是純文字，不需要語法驗證。）

- [ ] **Step 4: 執行測試確認通過**

Run: `npm run test:unit -- custom-css-presets.test.js settings.test.js`
Expected: PASS

- [ ] **Step 5: Codex code review**

Run: `/codex:review --base <prev-commit-sha>`. 修正任何 Critical/Important 發現。

- [ ] **Step 6: Commit**

```bash
git add src/server/custom-css-presets.js src/server/settings.js tests/unit/server/custom-css-presets.test.js tests/unit/server/settings.test.js
git commit -m "$(cat <<'EOF'
Add four-way CSS choice state (two readonly presets, two editable slots)

Why: Ported from the sibling md-reader project's already-shipped
design (docs/superpowers/plans/2026-09-06-css-slots-search-history.md
in that repo) at the user's request, replacing this plan's original
growable-preset-library design (a separate css-presets.json + REST
API) before any of it was implemented — a simpler fixed-choice model
with built-ins that are explicitly viewable-but-not-editable.
What: customCssChoice/customCssUser1/customCssUser2 added to the flat
settings model (same ALLOWED_SETTINGS_KEYS pattern as every other
setting). resolveCustomCssChoice() returns the effective draft CSS
and a readonly flag for whichever choice is active — built-in choices
resolve to a hardcoded constant and readonly:true; user slots resolve
to their own stored (possibly empty) content and readonly:false.
How: No separate storage file or API needed — this fits entirely into
the existing settings.js/config.json mechanism already used for every
other durable per-daemon setting.

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
- Produces: `useSettings()` → `{settings: Settings | null, updateSettings: (patch: Partial<Settings>) => Promise<void>, error: string | null}`, where `Settings` mirrors the backend shape from Tasks 1-2 (`plantumlServerUrl`, `sendToPlantUmlServer`, `privacyMode`, `blockRemoteContent`, `allowHtmlScripts`, `bakOnSave`, `customCssChoice`, `customCssUser1`, `customCssUser2`, `effective: {...}`). Fetches `GET /api/settings` on mount; `updateSettings` calls `PUT /api/settings` with the patch and updates local state with the response

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
    customCssChoice: 'user1',
    customCssUser1: '',
    customCssUser2: '',
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

export type CustomCssChoice = 'editorial' | 'developer' | 'user1' | 'user2'

export interface Settings {
  plantumlServerUrl: string
  sendToPlantUmlServer: boolean
  privacyMode: boolean
  blockRemoteContent: boolean
  allowHtmlScripts: boolean
  bakOnSave: boolean
  customCssChoice: CustomCssChoice
  customCssUser1: string
  customCssUser2: string
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

> **跨計畫待辦**：`docs/superpowers/plans/2026-09-06-toolbar-extras.md` 的 Task 5 已經在後端加了 `checkForUpdates` 設定欄位（預設 `false`，同 `sendToPlantUmlServer` 的模式），但那份計畫刻意沒有做設定 UI。實作這個 Task 時，請在下面的一般分頁裡順手加一個 `checkForUpdates` 開關（`updateSettings({checkForUpdates: e.target.checked})`），對應 i18n 鍵可取 `settings.checkForUpdates`（"Check for updates"）。這不是這個 task 原本規劃的一部分，但屬於同一種「後端 setting 已存在、缺一個 UI 開關」的收尾工作，一起做完成本更低。

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

### Task 8: 自訂 CSS 分頁（四選一：`editorial`/`developer` 唯讀、`user1`/`user2` 可編輯）

**Files:**
- Create: `src/frontend/components/settings/CustomCssTab.tsx`
- Modify: `src/frontend/components/SettingsModal.tsx`（`category === 'customCss'`）
- Modify: `src/frontend/App.tsx`（把目前生效的 CSS 內容注入一個全域 `<style>` 標籤）
- Test: `tests/frontend/CustomCssTab.test.tsx`

**Interfaces:**
- `<CustomCssTab settings={Settings | null} updateSettings={(patch: Partial<Settings>) => void} />`——四個選項用 radio/button 呈現（`editorial`/`developer`/`user1`/`user2`），選到哪個就把對應內容顯示在下方的 `<textarea>`：`editorial`/`developer` 該 textarea 是 `readOnly`（`disabled` 也可以，但 `readOnly` 讓文字仍可選取複製，體驗更好）；`user1`/`user2` 該 textarea 可編輯，编辑內容是**本地草稿**（元件內部 state，不即時送出），按下「套用」按鈕才呼叫 `updateSettings({customCssChoice: 'user1', customCssUser1: draft})`（同時寫回該 slot 內容並切換生效選項，一次 PUT 完成，不是兩個獨立動作）
- 切換選項時（點選另一個 radio/button）：若原本正在編輯 user slot 且草稿跟已儲存內容不同，**不強制丟棄**——只是単純把顯示切到新選項的內容，原本未套用的草稿留在畫面外就自然遺失（不做跨選項的草稿暫存，YAGNI；使用者若中途切換分心，本來就預期未套用的編輯會遺失，這跟一般表單「沒存就跳頁會遺失」的直覺一致）

- [ ] **Step 1: 寫失敗測試**

`tests/frontend/CustomCssTab.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CustomCssTab } from '../../src/frontend/components/settings/CustomCssTab.js'
import { EDITORIAL_CSS, DEVELOPER_CSS } from '../../src/frontend/custom-css-presets.js'

function baseSettings(overrides = {}) {
  return {
    plantumlServerUrl: 'https://www.plantuml.com/plantuml',
    sendToPlantUmlServer: false,
    privacyMode: false,
    blockRemoteContent: false,
    allowHtmlScripts: false,
    bakOnSave: false,
    customCssChoice: 'user1',
    customCssUser1: '',
    customCssUser2: '',
    effective: { blockRemoteContent: false, sendToPlantUmlServer: false, allowHtmlScripts: false },
    ...overrides,
  }
}

describe('CustomCssTab', () => {
  it('shows the editorial preset content in a readonly textarea when selected', () => {
    render(<CustomCssTab settings={baseSettings({ customCssChoice: 'editorial' })} updateSettings={() => {}} />)
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    expect(textarea).toHaveValue(EDITORIAL_CSS)
    expect(textarea).toHaveAttribute('readonly')
  })

  it('shows the developer preset content in a readonly textarea when selected', () => {
    render(<CustomCssTab settings={baseSettings({ customCssChoice: 'developer' })} updateSettings={() => {}} />)
    expect(screen.getByRole('textbox')).toHaveValue(DEVELOPER_CSS)
  })

  it('shows user1 slot content in an editable textarea when selected', () => {
    render(
      <CustomCssTab
        settings={baseSettings({ customCssChoice: 'user1', customCssUser1: '.markdown-body { color: red; }' })}
        updateSettings={() => {}}
      />
    )
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    expect(textarea).toHaveValue('.markdown-body { color: red; }')
    expect(textarea).not.toHaveAttribute('readonly')
  })

  it('switching to a built-in choice calls updateSettings with just the choice', () => {
    const updateSettings = vi.fn()
    render(<CustomCssTab settings={baseSettings()} updateSettings={updateSettings} />)
    fireEvent.click(screen.getByRole('button', { name: /editorial/i }))
    expect(updateSettings).toHaveBeenCalledWith({ customCssChoice: 'editorial' })
  })

  it('editing the user1 draft then clicking Apply persists the slot and switches the active choice in one call', () => {
    const updateSettings = vi.fn()
    render(
      <CustomCssTab settings={baseSettings({ customCssChoice: 'user2' })} updateSettings={updateSettings} />
    )
    fireEvent.click(screen.getByRole('button', { name: /user 1/i }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '.markdown-body { color: blue; }' } })
    fireEvent.click(screen.getByRole('button', { name: /apply/i }))
    expect(updateSettings).toHaveBeenCalledWith({
      customCssChoice: 'user1',
      customCssUser1: '.markdown-body { color: blue; }',
    })
  })

  it('the Apply button is not shown for built-in (readonly) choices', () => {
    render(<CustomCssTab settings={baseSettings({ customCssChoice: 'editorial' })} updateSettings={() => {}} />)
    expect(screen.queryByRole('button', { name: /apply/i })).not.toBeInTheDocument()
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
    "cssChoiceEditorial": "Editorial (readonly)",
    "cssChoiceDeveloper": "Developer (readonly)",
    "cssChoiceUser1": "User 1",
    "cssChoiceUser2": "User 2",
    "cssApply": "Apply",
    "cssReadonlyHint": "Built-in presets are readonly. Select User 1 or User 2 to write your own CSS."
  }
}
```

- [ ] **Step 4: 建立前端共用的內建範本常數**

前端也需要 `EDITORIAL_CSS`/`DEVELOPER_CSS` 這兩個常數本身（純渲染測試/顯示用；實際生效內容一律以後端 `GET /api/settings` 回傳的為準，前端常數只是為了在還沒拿到 settings 前有東西可以先渲染，或給測試 import 用）。建立 `src/frontend/custom-css-presets.ts`，內容跟 `src/server/custom-css-presets.js` 的 `EDITORIAL_CSS`/`DEVELOPER_CSS` 完全一致（純字串常數，重複兩份可接受——這是前後端各自獨立的 bundle，沒有共用模組機制，維持一致性用測試鎖住即可，不需要為了不重複而引入 monorepo 共用套件的複雜度）。

- [ ] **Step 5: 實作 `CustomCssTab`**

`src/frontend/components/settings/CustomCssTab.tsx`:

```tsx
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Settings, CustomCssChoice } from '../../hooks/useSettings.js'
import { EDITORIAL_CSS, DEVELOPER_CSS } from '../../custom-css-presets.js'

interface CustomCssTabProps {
  settings: Settings | null
  updateSettings: (patch: Partial<Settings>) => void
}

const CHOICES: CustomCssChoice[] = ['editorial', 'developer', 'user1', 'user2']

function resolveDisplay(settings: Settings, choice: CustomCssChoice): { content: string; readonly: boolean } {
  if (choice === 'editorial') return { content: EDITORIAL_CSS, readonly: true }
  if (choice === 'developer') return { content: DEVELOPER_CSS, readonly: true }
  if (choice === 'user2') return { content: settings.customCssUser2, readonly: false }
  return { content: settings.customCssUser1, readonly: false }
}

export function CustomCssTab({ settings, updateSettings }: CustomCssTabProps) {
  const { t } = useTranslation()
  // Draft is local-only until Apply — see the task's "no cross-choice draft
  // stash" note: switching choices before applying silently discards it.
  const [draft, setDraft] = useState<string | null>(null)

  if (!settings) return null

  const activeChoice = settings.customCssChoice
  const { content, readonly } = resolveDisplay(settings, activeChoice)
  const displayedValue = draft ?? content

  function selectChoice(choice: CustomCssChoice) {
    setDraft(null)
    if (choice === 'editorial' || choice === 'developer') {
      updateSettings({ customCssChoice: choice })
    } else {
      // Switching to a user slot doesn't persist anything by itself — only
      // Apply does. This lets the user look at a slot without committing.
      updateSettings({ customCssChoice: choice })
    }
  }

  function applyDraft() {
    if (draft === null) return
    const key = activeChoice === 'user2' ? 'customCssUser2' : 'customCssUser1'
    updateSettings({ customCssChoice: activeChoice, [key]: draft })
    setDraft(null)
  }

  return (
    <div>
      <div>
        {CHOICES.map((choice) => (
          <button key={choice} aria-pressed={activeChoice === choice} onClick={() => selectChoice(choice)}>
            {t(`settings.cssChoice${choice[0].toUpperCase()}${choice.slice(1)}`)}
          </button>
        ))}
      </div>
      {readonly && <p>{t('settings.cssReadonlyHint')}</p>}
      <textarea
        value={displayedValue}
        readOnly={readonly}
        onChange={(e) => !readonly && setDraft(e.target.value)}
        rows={12}
      />
      {!readonly && <button onClick={applyDraft}>{t('settings.cssApply')}</button>}
    </div>
  )
}
```

（實作者請注意：`selectChoice` 切到 `user1`/`user2` 時**立刻**呼叫 `updateSettings({customCssChoice: choice})`——也就是說「選取某個 user slot」本身就會讓它成為目前生效的 CSS（即使還沒編輯過），這跟 md-reader 的行為一致：四個選項是真正的「目前用哪一個」單選，不是「先選來看看，套用了才生效」。這點會反映在 Step 1 的測試裡（`switching to a built-in choice calls updateSettings with just the choice`），實作者請確保 `user1`/`user2` 的切換也遵循一樣的即時生效邏輯，只有「編輯後的草稿內容」才需要額外按 Apply 才會持久化。)

在 `SettingsModal.tsx` 接上 `useSettings` 並在 `category === 'customCss'` 時渲染 `<CustomCssTab settings={settings} updateSettings={updateSettings} />`。

在 `App.tsx`：不再需要 `localStorage`-based `customCss` state——直接從 `settings`（`useSettings` 的回傳值）算出目前生效的 CSS 內容並注入 `<style>`：

```tsx
const effectiveCustomCss = settings
  ? settings.customCssChoice === 'editorial'
    ? EDITORIAL_CSS
    : settings.customCssChoice === 'developer'
      ? DEVELOPER_CSS
      : settings.customCssChoice === 'user2'
        ? settings.customCssUser2
        : settings.customCssUser1
  : ''

// in the render:
<style>{effectiveCustomCss}</style>
```

（selector 已由範本/使用者自行限制在 `.markdown-body`，App 層不做二次過濾——若使用者刻意寫出影響其他區域的 selector 屬於使用者自行承擔，不是資安邊界，因為 CSS 不能拿來執行任意程式碼或存取 token。實作者若覺得在 `App.tsx` 重複這段 choice-resolve 邏輯不夠 DRY，可以抽成一個小的共用函式放進 `src/frontend/custom-css-presets.ts`，跟 `EDITORIAL_CSS`/`DEVELOPER_CSS` 放一起。）

- [ ] **Step 6: 執行測試確認通過**

Run: `npm run test:frontend`
Expected: 全部通過

- [ ] **Step 7: Codex code review**

Run: `/codex:review --base <prev-commit-sha>`

- [ ] **Step 8: Commit — UI 段落**

```bash
git add src/frontend/components/settings/CustomCssTab.tsx src/frontend/components/SettingsModal.tsx src/frontend/App.tsx src/frontend/custom-css-presets.ts src/frontend/i18n/locales/*.json tests/frontend/CustomCssTab.test.tsx
git commit -m "$(cat <<'EOF'
Add four-way Custom CSS tab (readonly presets, editable user slots)

Why: Ported from md-reader's shipped design per the user's mid-plan
request — simpler than this plan's original growable-preset-library
UI (never implemented), with built-in choices that are explicitly
viewable but not editable.
What: CustomCssTab shows four choices (editorial/developer/user1/
user2); selecting a built-in immediately makes it the effective CSS
and shows its content in a readonly textarea; selecting a user slot
also immediately makes it effective (showing its currently-saved
content), and editing it holds a local draft until Apply persists it
to that slot in the same PUT that keeps it the active choice.
App.tsx computes the effective CSS straight from settings
(customCssChoice/customCssUser1/customCssUser2) instead of a
localStorage-based draft, since these are now backend-persisted.
How: [UI CHECKPOINT] UI-facing segment per CLAUDE.md's checkpoint
rule — last new settings-tab content; Task 9 wires the remaining
cross-cutting integration and does the whole-plan closing review.

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
- [ ] CSS four-way choice persists across restarts (`customCssChoice`/`customCssUser1`/`customCssUser2` in config.json); switching to `editorial`/`developer` shows the built-in CSS in a readonly textarea and cannot be edited or overwritten; switching to `user1`/`user2` shows that slot's saved content editable, and only an explicit Apply persists a draft edit
- [ ] Theme selection visibly changes `document.documentElement`'s `data-theme` attribute
- [ ] Opening an `.html` file after enabling "allow HTML scripts" in settings renders its iframe with `sandbox="allow-scripts"` (still without `allow-same-origin`, per Plan 6's HtmlView contract)
- [ ] All six `/goal` sub-plans (檔案 API, 搜尋, 認證細節, 前端骨架, 主內容區, 設定選單) are now implemented and merged to `main`
