# 前端骨架 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立 Vite + React + TypeScript 前端專案骨架：token 登入流程、i18n（5 語言）、整體版面容器（頂部列/分頁列/側邊欄/主內容區）、側邊欄雙模式（檔案樹 + 大綱）與搜尋 UI，並整合進現有的 Express + esbuild 發佈流程。這是後續「主內容區」與「設定選單」子計畫的地基。

**Architecture:** 前端是獨立的 Vite 專案（`src/frontend/`），build 產物是純靜態檔案，由後端 `app.js` 用 `express.static` 提供服務（含 SPA fallback）。狀態管理不用外部函式庫，比照 md-viewer-pwa 的「everything lives in the top-level component」模式，用 React 內建 `useState`/`useContext`。API 存取一律經過一個薄的 `apiClient` 模組，統一處理 `X-Auth-Token` header。

**Tech Stack:** React 18、TypeScript、Vite、react-i18next、Vitest + `@testing-library/react`（前端元件測試）。不引入 Tailwind/shadcn 等重量級 UI 框架（YAGNI，先用純 CSS，之後子計畫如有明顯需求再評估）。

## Global Constraints

- token 流程：進站時從網址列 `?token=` 讀取 → 存 `sessionStorage` → 立即用 `history.replaceState` 清掉網址列的 token 參數 → 之後所有 API 呼叫一律用 `X-Auth-Token` header（不再用 query string）
- 多個 root 時側邊欄最上層列出各 root 名稱；只有一個 root 時省略該層
- 側邊欄頂部兩個 icon tab 切換「檔案」/「大綱」模式，各自有獨立語意的搜尋列（檔案模式：名稱/內容/兩者 + 全部/已開啟 + regex；大綱模式：標題/內文/兩者 + regex，範圍固定當前分頁）
- i18n：en / zh-TW / zh-CN / ja / ko，預設偵測瀏覽器語言，使用者手動切換存 `localStorage`
- API 錯誤一律是 `{errorCode: string}` 結構化格式，前端依 `errorCode` 對照翻譯字串顯示，不直接顯示後端英文訊息
- Vite build 產物需要能被現有的 esbuild bundle 流程一起發佈成離線安裝包（前端 dist 不透過 esbuild 打包，是獨立的靜態檔案，但要放進同一個 `dist/` 目錄結構下）
- Commit 規範（`CLAUDE.md`）：一個邏輯段落一個 commit，訊息含 Why/What/How；**UI 段落完成後依 `CLAUDE.md` 的 checkpoint 規則呈現進度**（本次執行環境是背景 session，無法真的排定未來 wakeup，改以「每個 UI task 完成後在 commit message 與進度報告中清楚標註」的方式落實同樣的精神）

---

## File Structure

```
index.html                          ← Vite 入口 HTML（專案根目錄，Vite 慣例）
vite.config.ts
tsconfig.json
src/frontend/
├── main.tsx                          ← React entry point
├── App.tsx                            ← 頂層元件，管理 tabs/activeTabId 等全域狀態
├── api-client.ts                       ← 統一的 fetch 封裝（帶 X-Auth-Token）
├── auth.ts                              ← token 讀取/儲存/網址清理邏輯
├── i18n/
│   ├── index.ts                           ← i18next 初始化
│   └── locales/
│       ├── en.json
│       ├── zh-TW.json
│       ├── zh-CN.json
│       ├── ja.json
│       └── ko.json
├── components/
│   ├── TopBar.tsx
│   ├── TabBar.tsx
│   ├── Sidebar.tsx
│   ├── FileTreePanel.tsx
│   ├── OutlinePanel.tsx
│   └── SearchBar.tsx
└── styles/
    └── global.css

tests/frontend/
├── auth.test.ts
├── api-client.test.ts
├── App.test.tsx
├── FileTreePanel.test.tsx
├── OutlinePanel.test.tsx
└── SearchBar.test.tsx
```

---

### Task 1: Vite + React + TypeScript 專案建置

**Files:**
- Create: `index.html`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `src/frontend/main.tsx`
- Create: `src/frontend/App.tsx`
- Create: `src/frontend/styles/global.css`
- Modify: `package.json` — 新增前端依賴與 scripts
- Test: `tests/frontend/App.test.tsx`

**Interfaces:**
- Produces: `<App />` React component rendering a placeholder shell (no real content yet, just proves the build pipeline works end-to-end)

- [ ] **Step 1: 安裝依賴**

```bash
npm install react react-dom
npm install -D @vitejs/plugin-react typescript @types/react @types/react-dom vitest @testing-library/react @testing-library/jest-dom jsdom
```

- [ ] **Step 2: 建立設定檔**

`vite.config.ts`:

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: '.',
  plugins: [react()],
  build: {
    outDir: 'dist/frontend',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:4173',
      '/ws': { target: 'ws://127.0.0.1:4173', ws: true },
    },
  },
})
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src/frontend"]
}
```

`index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>MD Viewer Server</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/frontend/main.tsx"></script>
  </body>
</html>
```

`src/frontend/styles/global.css`:

```css
:root {
  color-scheme: light dark;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: -apple-system, 'Segoe UI', system-ui, sans-serif;
}

#root {
  height: 100vh;
  display: flex;
  flex-direction: column;
}
```

`src/frontend/App.tsx`:

```tsx
export function App() {
  return (
    <div data-testid="app-shell">
      <p>MD Viewer Server</p>
    </div>
  )
}
```

`src/frontend/main.tsx`:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.js'
import './styles/global.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
```

- [ ] **Step 3: 更新 `package.json`**

新增 dependencies：`react`、`react-dom`（已由 npm install 寫入）。新增 scripts：

```json
{
  "scripts": {
    "dev:frontend": "vite",
    "build:frontend": "vite build",
    "test:frontend": "vitest run tests/frontend"
  }
}
```

（保留既有的 `test:unit`/`test:integration`/`lint`/`build` scripts 不變；`build` 之後在 Task 9 會擴充成同時 build 前後端。）

- [ ] **Step 4: 建立 Vitest 前端測試設定**

前端元件測試需要 jsdom 環境，跟後端的 node 環境測試分開。建立 `vitest.frontend.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/frontend/setup.ts'],
  },
})
```

`tests/frontend/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest'
```

更新 `package.json` 的 `test:frontend` script 改用這個設定檔：

```json
"test:frontend": "vitest run --config vitest.frontend.config.ts tests/frontend"
```

- [ ] **Step 5: 寫測試並驗證**

`tests/frontend/App.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { App } from '../../src/frontend/App.js'

describe('App', () => {
  it('renders the app shell', () => {
    render(<App />)
    expect(screen.getByTestId('app-shell')).toBeInTheDocument()
  })
})
```

Run: `npm run test:frontend`
Expected: PASS（1 個測試）

- [ ] **Step 6: 驗證 build 流程**

Run: `npm run build:frontend`
Expected: 產出 `dist/frontend/index.html` 與對應的 JS/CSS 檔案

- [ ] **Step 7: Commit**

```bash
git add index.html vite.config.ts tsconfig.json vitest.frontend.config.ts package.json package-lock.json src/frontend/main.tsx src/frontend/App.tsx src/frontend/styles/global.css tests/frontend/setup.ts tests/frontend/App.test.tsx
git commit -m "$(cat <<'EOF'
Scaffold Vite + React + TypeScript frontend project

Why: This is the first frontend code in the project — everything so
far has been the Node.js backend. The frontend needs its own build
pipeline (Vite), its own test environment (Vitest + jsdom, distinct
from the backend's node-environment tests), and a proven end-to-end
path from source to a servable dist/frontend/ directory before any
real UI work begins.
What: vite.config.ts (React plugin, dev-server proxy to the backend
on 4173, build output to dist/frontend), tsconfig.json, index.html,
a placeholder App component, and a separate vitest.frontend.config.ts
(jsdom environment) so frontend and backend tests don't share a test
runner config.
How: TypeScript + React chosen for consistency with the md-viewer-pwa
reference project's stack, though no UI framework (Tailwind/shadcn)
is pulled in yet — YAGNI until a later task demonstrates real need.
No state management library — state lives in the top-level App
component, same pattern as md-viewer-pwa.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KCkr3UUhi36YHAEiAAhp5L
EOF
)"
```

---

### Task 2: 認證流程（token 讀取/儲存/清網址列 + API client）

**Files:**
- Create: `src/frontend/auth.ts`
- Create: `src/frontend/api-client.ts`
- Test: `tests/frontend/auth.test.ts`
- Test: `tests/frontend/api-client.test.ts`

**Interfaces:**
- Produces:
  - `initAuthFromUrl(): string | null` — 讀取 `window.location.search` 的 `token`，若存在則存進 `sessionStorage('mvs-token')` 並用 `history.replaceState` 清掉網址列的 `token` 參數；回傳最終生效的 token（優先讀 `sessionStorage` 既有值，其次讀網址列新值），沒有則回傳 `null`
  - `getStoredToken(): string | null` — 純讀取 `sessionStorage`，不做任何副作用
  - `apiFetch(path: string, options?: RequestInit): Promise<Response>` — 包裝 `fetch`，自動加上 `X-Auth-Token` header（帶入 `getStoredToken()` 的值），`path` 相對於同源（開發時透過 Vite proxy 轉發到後端）

- [ ] **Step 1: 寫失敗測試**

`tests/frontend/auth.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { initAuthFromUrl, getStoredToken } from '../../src/frontend/auth.js'

describe('initAuthFromUrl', () => {
  beforeEach(() => {
    sessionStorage.clear()
    window.history.replaceState(null, '', '/')
  })

  it('reads token from URL, stores it, and clears the URL', () => {
    window.history.replaceState(null, '', '/?token=1234')
    const token = initAuthFromUrl()
    expect(token).toBe('1234')
    expect(sessionStorage.getItem('mvs-token')).toBe('1234')
    expect(window.location.search).toBe('')
  })

  it('preserves other query params while removing only token', () => {
    window.history.replaceState(null, '', '/?token=1234&foo=bar')
    initAuthFromUrl()
    expect(window.location.search).toBe('?foo=bar')
  })

  it('prefers an existing sessionStorage token over a URL token', () => {
    sessionStorage.setItem('mvs-token', '9999')
    window.history.replaceState(null, '', '/?token=1234')
    const token = initAuthFromUrl()
    expect(token).toBe('9999')
  })

  it('returns null when there is no token anywhere', () => {
    expect(initAuthFromUrl()).toBeNull()
  })
})

describe('getStoredToken', () => {
  beforeEach(() => sessionStorage.clear())

  it('returns null when nothing is stored', () => {
    expect(getStoredToken()).toBeNull()
  })

  it('returns the stored token', () => {
    sessionStorage.setItem('mvs-token', '5678')
    expect(getStoredToken()).toBe('5678')
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npm run test:frontend -- auth.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: 實作**

`src/frontend/auth.ts`:

```ts
const TOKEN_KEY = 'mvs-token'

export function getStoredToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY)
}

export function initAuthFromUrl(): string | null {
  const existing = getStoredToken()
  const url = new URL(window.location.href)
  const urlToken = url.searchParams.get('token')

  if (urlToken) {
    url.searchParams.delete('token')
    const newSearch = url.searchParams.toString()
    window.history.replaceState(
      null,
      '',
      url.pathname + (newSearch ? `?${newSearch}` : '') + url.hash
    )
  }

  if (existing) return existing

  if (urlToken) {
    sessionStorage.setItem(TOKEN_KEY, urlToken)
    return urlToken
  }

  return null
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `npm run test:frontend -- auth.test.ts`
Expected: PASS（6 個測試）

- [ ] **Step 5: 寫失敗測試（api-client）**

`tests/frontend/api-client.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { apiFetch } from '../../src/frontend/api-client.js'

describe('apiFetch', () => {
  beforeEach(() => {
    sessionStorage.setItem('mvs-token', 'abc123')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}')))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    sessionStorage.clear()
  })

  it('adds the X-Auth-Token header from sessionStorage', async () => {
    await apiFetch('/api/roots')
    expect(fetch).toHaveBeenCalledWith(
      '/api/roots',
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-Auth-Token': 'abc123' }),
      })
    )
  })

  it('merges caller-provided headers with the auth header', async () => {
    await apiFetch('/api/file', { headers: { 'Content-Type': 'application/json' } })
    expect(fetch).toHaveBeenCalledWith(
      '/api/file',
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Auth-Token': 'abc123',
          'Content-Type': 'application/json',
        }),
      })
    )
  })

  it('works with no token stored (sends empty header rather than throwing)', async () => {
    sessionStorage.clear()
    await expect(apiFetch('/api/roots')).resolves.toBeDefined()
  })
})
```

- [ ] **Step 6: 執行測試確認失敗**

Run: `npm run test:frontend -- api-client.test.ts`
Expected: FAIL — module not found

- [ ] **Step 7: 實作**

`src/frontend/api-client.ts`:

```ts
import { getStoredToken } from './auth.js'

export function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = getStoredToken() ?? ''
  const headers = {
    ...options.headers,
    'X-Auth-Token': token,
  }
  return fetch(path, { ...options, headers })
}
```

- [ ] **Step 8: 執行測試確認通過**

Run: `npm run test:frontend -- api-client.test.ts`
Expected: PASS（3 個測試）

- [ ] **Step 9: Commit**

```bash
git add src/frontend/auth.ts src/frontend/api-client.ts tests/frontend/auth.test.ts tests/frontend/api-client.test.ts
git commit -m "$(cat <<'EOF'
Add token auth flow and API client wrapper

Why: Per the design spec's security section, the token arrives via
URL query string (for one-click links) but must not linger there —
it needs to move into sessionStorage and be scrubbed from browser
history immediately, with all subsequent API calls using the
X-Auth-Token header instead of the query string.
What: initAuthFromUrl() does the one-time URL-to-storage migration
(preferring an already-stored token over a new URL one, so a stale
bookmarked link can't silently downgrade an active session) and
strips only the token param via history.replaceState, preserving any
other query params. apiFetch() wraps fetch to attach the header
automatically so no call site has to remember to do it manually.
How: sessionStorage (not localStorage) matches the spec's intent —
the token shouldn't persist across browser restarts by default.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KCkr3UUhi36YHAEiAAhp5L
EOF
)"
```

---

### Task 3: i18n 架構（5 語言）

**Files:**
- Create: `src/frontend/i18n/index.ts`
- Create: `src/frontend/i18n/locales/{en,zh-TW,zh-CN,ja,ko}.json`
- Modify: `src/frontend/main.tsx` — 初始化 i18n
- Test: `tests/frontend/i18n.test.ts`

**Interfaces:**
- Produces: `i18n` instance (default export of `src/frontend/i18n/index.ts`) configured with 5 languages, browser-language detection, `localStorage` persistence for manual override

- [ ] **Step 1: 安裝依賴**

```bash
npm install react-i18next i18next i18next-browser-languagedetector
```

- [ ] **Step 2: 寫失敗測試**

`tests/frontend/i18n.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import i18n from '../../src/frontend/i18n/index.js'

describe('i18n setup', () => {
  it('has all 5 required languages loaded as resources', () => {
    const languages = Object.keys(i18n.services.resourceStore.data)
    for (const lang of ['en', 'zh-TW', 'zh-CN', 'ja', 'ko']) {
      expect(languages).toContain(lang)
    }
  })

  it('falls back to English for a missing key', () => {
    expect(i18n.t('nonexistent.key.that.does.not.exist')).toBe(
      'nonexistent.key.that.does.not.exist'
    )
  })

  it('translates a known key in the default language', () => {
    i18n.changeLanguage('en')
    expect(i18n.t('sidebar.filesTab')).toBe('Files')
  })

  it('translates the same key in Traditional Chinese', () => {
    i18n.changeLanguage('zh-TW')
    expect(i18n.t('sidebar.filesTab')).toBe('檔案')
  })
})
```

- [ ] **Step 3: 執行測試確認失敗**

Run: `npm run test:frontend -- i18n.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: 建立語言檔**

`src/frontend/i18n/locales/en.json`:

```json
{
  "sidebar": {
    "filesTab": "Files",
    "outlineTab": "Outline"
  },
  "search": {
    "placeholder": "Search...",
    "targetName": "Name",
    "targetContent": "Content",
    "targetBoth": "Both",
    "scopeAll": "All files",
    "scopeOpen": "Open tabs"
  }
}
```

`src/frontend/i18n/locales/zh-TW.json`:

```json
{
  "sidebar": {
    "filesTab": "檔案",
    "outlineTab": "大綱"
  },
  "search": {
    "placeholder": "搜尋...",
    "targetName": "檔名",
    "targetContent": "內容",
    "targetBoth": "兩者",
    "scopeAll": "全部檔案",
    "scopeOpen": "已開啟分頁"
  }
}
```

`src/frontend/i18n/locales/zh-CN.json`:

```json
{
  "sidebar": {
    "filesTab": "文件",
    "outlineTab": "大纲"
  },
  "search": {
    "placeholder": "搜索...",
    "targetName": "文件名",
    "targetContent": "内容",
    "targetBoth": "两者",
    "scopeAll": "全部文件",
    "scopeOpen": "已打开标签"
  }
}
```

`src/frontend/i18n/locales/ja.json`:

```json
{
  "sidebar": {
    "filesTab": "ファイル",
    "outlineTab": "アウトライン"
  },
  "search": {
    "placeholder": "検索...",
    "targetName": "ファイル名",
    "targetContent": "内容",
    "targetBoth": "両方",
    "scopeAll": "すべてのファイル",
    "scopeOpen": "開いているタブ"
  }
}
```

`src/frontend/i18n/locales/ko.json`:

```json
{
  "sidebar": {
    "filesTab": "파일",
    "outlineTab": "개요"
  },
  "search": {
    "placeholder": "검색...",
    "targetName": "파일명",
    "targetContent": "내용",
    "targetBoth": "둘 다",
    "scopeAll": "모든 파일",
    "scopeOpen": "열린 탭"
  }
}
```

- [ ] **Step 5: 實作 i18n 初始化**

`src/frontend/i18n/index.ts`:

```ts
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import en from './locales/en.json'
import zhTW from './locales/zh-TW.json'
import zhCN from './locales/zh-CN.json'
import ja from './locales/ja.json'
import ko from './locales/ko.json'

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      'zh-TW': { translation: zhTW },
      'zh-CN': { translation: zhCN },
      ja: { translation: ja },
      ko: { translation: ko },
    },
    fallbackLng: 'en',
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'mvs-language',
      caches: ['localStorage'],
    },
    interpolation: { escapeValue: false },
  })

export default i18n
```

- [ ] **Step 6: 在 `main.tsx` 引入 i18n**

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.js'
import './i18n/index.js'
import './styles/global.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
```

- [ ] **Step 7: 執行測試確認通過**

Run: `npm run test:frontend -- i18n.test.ts`
Expected: PASS（4 個測試）

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json src/frontend/i18n src/frontend/main.tsx tests/frontend/i18n.test.ts
git commit -m "$(cat <<'EOF'
Add i18next setup with 5 languages

Why: The design spec requires 5 UI languages (en/zh-TW/zh-CN/ja/ko)
with browser-language auto-detection and a manual override that
persists across sessions.
What: i18next + react-i18next + i18next-browser-languagedetector,
configured to detect from localStorage first (a prior manual choice)
then the browser's navigator language, falling back to English for
missing keys. Seed translation files cover the sidebar tab labels and
search UI strings that later tasks in this plan will render.
How: Plain JSON resource files per language, loaded statically at
build time (not lazy-loaded) since 5 small JSON files add negligible
bundle size — no need for per-language code-splitting at this scale.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KCkr3UUhi36YHAEiAAhp5L
EOF
)"
```

---

### Task 4: 整體版面容器（TopBar / TabBar / Sidebar 骨架）

**Files:**
- Create: `src/frontend/components/TopBar.tsx`
- Create: `src/frontend/components/TabBar.tsx`
- Create: `src/frontend/components/Sidebar.tsx`
- Modify: `src/frontend/App.tsx` — 組裝整體版面 + tabs 狀態
- Test: `tests/frontend/App.test.tsx`（擴充）

**Interfaces:**
- Produces:
  - `Tab` type: `{id: string, rootId: number, relPath: string, title: string, dirty: boolean}`
  - `<App />` renders `<TopBar />` + a row of `<Sidebar />` + `<TabBar />`/main content area, managing `tabs: Tab[]` and `activeTabId: string | null` state
  - `<TabBar tabs={Tab[]} activeTabId={string|null} onSelect={(id) => void} onClose={(id) => void} />`
  - `<Sidebar mode={'files'|'outline'} onModeChange={(mode) => void} />` — this task only builds the mode-switching shell (two icon buttons), not the panel content (that's Tasks 5-6)

- [ ] **Step 1: 寫失敗測試**

`tests/frontend/App.test.tsx`（取代 Task 1 的版本）:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { App } from '../../src/frontend/App.js'

describe('App layout', () => {
  it('renders the top bar, sidebar, and an empty tab bar', () => {
    render(<App />)
    expect(screen.getByTestId('top-bar')).toBeInTheDocument()
    expect(screen.getByTestId('sidebar')).toBeInTheDocument()
    expect(screen.getByTestId('tab-bar')).toBeInTheDocument()
  })

  it('sidebar defaults to files mode and can switch to outline mode', () => {
    render(<App />)
    const outlineButton = screen.getByRole('button', { name: /outline/i })
    expect(screen.getByTestId('sidebar')).toHaveAttribute('data-mode', 'files')
    fireEvent.click(outlineButton)
    expect(screen.getByTestId('sidebar')).toHaveAttribute('data-mode', 'outline')
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npm run test:frontend -- App.test.tsx`
Expected: FAIL — `top-bar`/`sidebar`/`tab-bar` testids not found

- [ ] **Step 3: 實作元件**

`src/frontend/components/TopBar.tsx`:

```tsx
export function TopBar() {
  return (
    <header data-testid="top-bar" style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px' }}>
      <span>MD Viewer Server</span>
      <div>{/* language/theme/settings buttons: later tasks */}</div>
    </header>
  )
}
```

`src/frontend/components/TabBar.tsx`:

```tsx
export interface Tab {
  id: string
  rootId: number
  relPath: string
  title: string
  dirty: boolean
}

interface TabBarProps {
  tabs: Tab[]
  activeTabId: string | null
  onSelect: (id: string) => void
  onClose: (id: string) => void
}

export function TabBar({ tabs, activeTabId, onSelect, onClose }: TabBarProps) {
  return (
    <div data-testid="tab-bar" style={{ display: 'flex' }}>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          onClick={() => onSelect(tab.id)}
          style={{ fontWeight: tab.id === activeTabId ? 'bold' : 'normal' }}
        >
          {tab.dirty ? '● ' : ''}
          {tab.title}
          <button onClick={(e) => { e.stopPropagation(); onClose(tab.id) }} aria-label={`close ${tab.title}`}>
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
```

`src/frontend/components/Sidebar.tsx`:

```tsx
import { useTranslation } from 'react-i18next'

export type SidebarMode = 'files' | 'outline'

interface SidebarProps {
  mode: SidebarMode
  onModeChange: (mode: SidebarMode) => void
  children?: React.ReactNode
}

export function Sidebar({ mode, onModeChange, children }: SidebarProps) {
  const { t } = useTranslation()
  return (
    <aside data-testid="sidebar" data-mode={mode} style={{ width: 240, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex' }}>
        <button aria-pressed={mode === 'files'} onClick={() => onModeChange('files')}>
          {t('sidebar.filesTab')}
        </button>
        <button aria-pressed={mode === 'outline'} onClick={() => onModeChange('outline')}>
          {t('sidebar.outlineTab')}
        </button>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>{children}</div>
    </aside>
  )
}
```

- [ ] **Step 4: 組裝 `App.tsx`**

```tsx
import { useState } from 'react'
import { TopBar } from './components/TopBar.js'
import { TabBar, type Tab } from './components/TabBar.js'
import { Sidebar, type SidebarMode } from './components/Sidebar.js'

export function App() {
  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>('files')

  function closeTab(id: string) {
    setTabs((prev) => prev.filter((t) => t.id !== id))
    setActiveTabId((prev) => (prev === id ? null : prev))
  }

  return (
    <div data-testid="app-shell" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <TopBar />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Sidebar mode={sidebarMode} onModeChange={setSidebarMode} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <TabBar tabs={tabs} activeTabId={activeTabId} onSelect={setActiveTabId} onClose={closeTab} />
          <div style={{ flex: 1, overflow: 'auto' }}>{/* main content area: later plan */}</div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: 執行測試確認通過**

Run: `npm run test:frontend -- App.test.tsx`
Expected: PASS（2 個測試）

- [ ] **Step 6: 執行完整前端測試套件**

Run: `npm run test:frontend`
Expected: 全部通過（含 Task 1-3 的既有測試）

- [ ] **Step 7: Commit — 這是一個 UI 段落**

依 `CLAUDE.md` 的 checkpoint 規則，這是本計畫第一個完整可視的 UI 段落（版面骨架）。commit message 明確標註這一點，供之後檢視。

```bash
git add src/frontend/components/TopBar.tsx src/frontend/components/TabBar.tsx src/frontend/components/Sidebar.tsx src/frontend/App.tsx tests/frontend/App.test.tsx
git commit -m "$(cat <<'EOF'
Add overall layout shell: TopBar, TabBar, Sidebar mode switch

Why: Every later frontend task (file tree, outline, main content view)
needs a layout to render into — this establishes the structural
skeleton (top bar / sidebar / tab bar / content area) and the
top-level tabs/activeTabId/sidebarMode state that owns it, before any
task builds real panel content on top.
What: TopBar (placeholder for language/theme/settings controls,
built out in the settings-menu plan), TabBar (renders open tabs with
a dirty-indicator dot and close button, no real tab-opening logic
yet), Sidebar (the files/outline mode-switch shell with i18n'd
button labels, panel content is Tasks 5-6). App.tsx owns tabs/
activeTabId/sidebarMode as top-level state, following md-viewer-pwa's
single-source-of-truth pattern rather than introducing a state
library.
How: [UI CHECKPOINT] This is a UI-facing segment per CLAUDE.md's
checkpoint rule. The execution environment for this plan is a
background session (no interactive wakeup mechanism available), so
the checkpoint is satisfied by this explicit commit-message flag plus
a clear status report to the user, rather than a literal timed pause.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KCkr3UUhi36YHAEiAAhp5L
EOF
)"
```

---

### Task 5: 側邊欄 — 檔案樹模式

**Files:**
- Create: `src/frontend/components/FileTreePanel.tsx`
- Modify: `src/frontend/App.tsx` — 傳入 `<FileTreePanel />` 作為 Sidebar 在 files 模式下的 children
- Test: `tests/frontend/FileTreePanel.test.tsx`

**Interfaces:**
- Produces: `<FileTreePanel roots={Array<{id,name}>} onOpenFile={(rootId: number, relPath: string) => void} />` — calls `GET /api/roots` and, for each root, `GET /api/files?root=<id>` via `apiFetch`; renders root name headers only when there is more than one root; clicking a file calls `onOpenFile`

- [ ] **Step 1: 寫失敗測試**

`tests/frontend/FileTreePanel.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { FileTreePanel } from '../../src/frontend/components/FileTreePanel.js'

function mockFetchSequence(responses: unknown[]) {
  let call = 0
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(() => {
      const body = responses[call++]
      return Promise.resolve(new Response(JSON.stringify(body)))
    })
  )
}

describe('FileTreePanel', () => {
  beforeEach(() => sessionStorage.setItem('mvs-token', 'tok'))
  afterEach(() => {
    vi.unstubAllGlobals()
    sessionStorage.clear()
  })

  it('renders files from a single root without a root-name header', async () => {
    mockFetchSequence([{ files: [{ relPath: 'a.md', size: 10, mtimeMs: 1 }] }])
    render(<FileTreePanel roots={[{ id: 0, name: 'myproject' }]} onOpenFile={() => {}} />)

    await waitFor(() => expect(screen.getByText('a.md')).toBeInTheDocument())
    expect(screen.queryByText('myproject')).not.toBeInTheDocument()
  })

  it('shows a root-name header for each root when there are multiple roots', async () => {
    mockFetchSequence([
      { files: [{ relPath: 'a.md', size: 10, mtimeMs: 1 }] },
      { files: [{ relPath: 'b.md', size: 20, mtimeMs: 2 }] },
    ])
    render(
      <FileTreePanel
        roots={[
          { id: 0, name: 'proj1' },
          { id: 1, name: 'proj2' },
        ]}
        onOpenFile={() => {}}
      />
    )

    await waitFor(() => expect(screen.getByText('proj1')).toBeInTheDocument())
    expect(screen.getByText('proj2')).toBeInTheDocument()
    expect(screen.getByText('a.md')).toBeInTheDocument()
    expect(screen.getByText('b.md')).toBeInTheDocument()
  })

  it('calls onOpenFile with the root id and relPath when a file is clicked', async () => {
    mockFetchSequence([{ files: [{ relPath: 'a.md', size: 10, mtimeMs: 1 }] }])
    const onOpenFile = vi.fn()
    render(<FileTreePanel roots={[{ id: 0, name: 'proj' }]} onOpenFile={onOpenFile} />)

    await waitFor(() => screen.getByText('a.md'))
    fireEvent.click(screen.getByText('a.md'))
    expect(onOpenFile).toHaveBeenCalledWith(0, 'a.md')
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npm run test:frontend -- FileTreePanel.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: 實作**

`src/frontend/components/FileTreePanel.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { apiFetch } from '../api-client.js'

interface FileEntry {
  relPath: string
  size: number
  mtimeMs: number
}

interface Root {
  id: number
  name: string
}

interface FileTreePanelProps {
  roots: Root[]
  onOpenFile: (rootId: number, relPath: string) => void
}

export function FileTreePanel({ roots, onOpenFile }: FileTreePanelProps) {
  const [filesByRoot, setFilesByRoot] = useState<Record<number, FileEntry[]>>({})

  useEffect(() => {
    let cancelled = false
    async function loadAll() {
      const entries = await Promise.all(
        roots.map(async (root) => {
          const res = await apiFetch(`/api/files?root=${root.id}`)
          const data = await res.json()
          return [root.id, data.files as FileEntry[]] as const
        })
      )
      if (!cancelled) {
        setFilesByRoot(Object.fromEntries(entries))
      }
    }
    loadAll()
    return () => {
      cancelled = true
    }
  }, [roots])

  return (
    <div data-testid="file-tree-panel">
      {roots.map((root) => (
        <div key={root.id}>
          {roots.length > 1 && <div style={{ fontWeight: 'bold' }}>{root.name}</div>}
          {(filesByRoot[root.id] ?? []).map((file) => (
            <div
              key={file.relPath}
              onClick={() => onOpenFile(root.id, file.relPath)}
              style={{ cursor: 'pointer' }}
            >
              {file.relPath}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `npm run test:frontend -- FileTreePanel.test.tsx`
Expected: PASS（3 個測試）

- [ ] **Step 5: 接進 `App.tsx`**

在 `App.tsx` 加入 `roots` 狀態（開頭 `useEffect` 呼叫 `GET /api/roots` 取得），並在 `sidebarMode === 'files'` 時把 `<FileTreePanel roots={roots} onOpenFile={openFile} />` 傳給 `<Sidebar>` 的 children；`openFile` 函式負責在 `tabs` 裡新增一個分頁（若該檔案已開啟則切換過去，不重複開）。

```tsx
// inside App.tsx, alongside existing state:
const [roots, setRoots] = useState<Array<{ id: number; name: string }>>([])

useEffect(() => {
  apiFetch('/api/roots')
    .then((res) => res.json())
    .then(setRoots)
}, [])

function openFile(rootId: number, relPath: string) {
  const existing = tabs.find((t) => t.rootId === rootId && t.relPath === relPath)
  if (existing) {
    setActiveTabId(existing.id)
    return
  }
  const id = `${rootId}:${relPath}`
  const title = relPath.split('/').pop() ?? relPath
  setTabs((prev) => [...prev, { id, rootId, relPath, title, dirty: false }])
  setActiveTabId(id)
}

// in the render, inside <Sidebar>:
// {sidebarMode === 'files' && <FileTreePanel roots={roots} onOpenFile={openFile} />}
```

（實作者請將這段整合進現有的 `App.tsx`，import `apiFetch` 與 `FileTreePanel`。）

- [ ] **Step 6: 執行完整前端測試套件**

Run: `npm run test:frontend`
Expected: 全部通過

- [ ] **Step 7: Commit — 這是一個 UI 段落**

```bash
git add src/frontend/components/FileTreePanel.tsx src/frontend/App.tsx tests/frontend/FileTreePanel.test.tsx
git commit -m "$(cat <<'EOF'
Add file tree sidebar panel wired to GET /api/roots and /api/files

Why: This is the primary way a user opens a file to view/edit — the
sidebar's "files" mode needs to list what's actually on disk per the
backend's file API (Plan 2), not placeholder data.
What: FileTreePanel fetches all roots' file lists on mount and
renders them flat (no nested folder tree yet — that's an acceptable
first pass; a hierarchical tree view can be layered on later without
changing this component's external contract). Per the design spec's
UI rule, the root-name header only appears when there's more than one
root. Clicking a file calls onOpenFile, which App.tsx wires to open
(or focus, if already open) a tab.
How: [UI CHECKPOINT] UI-facing segment per CLAUDE.md's checkpoint
rule — see Task 4's commit for the note on how this is handled in a
background-session execution environment.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KCkr3UUhi36YHAEiAAhp5L
EOF
)"
```

---

### Task 6: 側邊欄 — 大綱模式

**Files:**
- Create: `src/frontend/components/OutlinePanel.tsx`
- Modify: `src/frontend/App.tsx` — 在 `sidebarMode === 'outline'` 時渲染 `<OutlinePanel />`
- Test: `tests/frontend/OutlinePanel.test.tsx`

**Interfaces:**
- Produces: `<OutlinePanel activeTab={{rootId, relPath} | null} onJumpToHeading={(line: number) => void} />` — calls `GET /api/outline?root=&path=` for the currently active tab; shows "no file open" state when `activeTab` is `null`

- [ ] **Step 1: 寫失敗測試**

`tests/frontend/OutlinePanel.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { OutlinePanel } from '../../src/frontend/components/OutlinePanel.js'

describe('OutlinePanel', () => {
  beforeEach(() => sessionStorage.setItem('mvs-token', 'tok'))
  afterEach(() => {
    vi.unstubAllGlobals()
    sessionStorage.clear()
  })

  it('shows a placeholder when no tab is active', () => {
    render(<OutlinePanel activeTab={null} onJumpToHeading={() => {}} />)
    expect(screen.getByText(/no file open/i)).toBeInTheDocument()
  })

  it('fetches and renders headings for the active tab', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            headings: [
              { level: 1, text: 'Intro', line: 1 },
              { level: 2, text: 'Details', line: 5 },
            ],
          })
        )
      )
    )
    render(
      <OutlinePanel activeTab={{ rootId: 0, relPath: 'a.md' }} onJumpToHeading={() => {}} />
    )
    await waitFor(() => expect(screen.getByText('Intro')).toBeInTheDocument())
    expect(screen.getByText('Details')).toBeInTheDocument()
  })

  it('calls onJumpToHeading with the line number when a heading is clicked', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ headings: [{ level: 1, text: 'Intro', line: 1 }] }))
      )
    )
    const onJump = vi.fn()
    render(
      <OutlinePanel activeTab={{ rootId: 0, relPath: 'a.md' }} onJumpToHeading={onJump} />
    )
    await waitFor(() => screen.getByText('Intro'))
    fireEvent.click(screen.getByText('Intro'))
    expect(onJump).toHaveBeenCalledWith(1)
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npm run test:frontend -- OutlinePanel.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: 實作**

`src/frontend/components/OutlinePanel.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { apiFetch } from '../api-client.js'

interface Heading {
  level: number
  text: string
  line: number
}

interface ActiveTabRef {
  rootId: number
  relPath: string
}

interface OutlinePanelProps {
  activeTab: ActiveTabRef | null
  onJumpToHeading: (line: number) => void
}

export function OutlinePanel({ activeTab, onJumpToHeading }: OutlinePanelProps) {
  const { t } = useTranslation()
  const [headings, setHeadings] = useState<Heading[]>([])

  useEffect(() => {
    if (!activeTab) {
      setHeadings([])
      return
    }
    let cancelled = false
    apiFetch(`/api/outline?root=${activeTab.rootId}&path=${encodeURIComponent(activeTab.relPath)}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setHeadings(data.headings)
      })
    return () => {
      cancelled = true
    }
  }, [activeTab])

  if (!activeTab) {
    return <div data-testid="outline-panel">{t('outline.noFileOpen', 'No file open')}</div>
  }

  return (
    <div data-testid="outline-panel">
      {headings.map((h) => (
        <div
          key={h.line}
          onClick={() => onJumpToHeading(h.line)}
          style={{ paddingLeft: (h.level - 1) * 12, cursor: 'pointer' }}
        >
          {h.text}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `npm run test:frontend -- OutlinePanel.test.tsx`
Expected: PASS（3 個測試）

- [ ] **Step 5: 接進 `App.tsx`**

在 `sidebarMode === 'outline'` 時傳入 `<OutlinePanel activeTab={activeTab ? {rootId: activeTab.rootId, relPath: activeTab.relPath} : null} onJumpToHeading={...} />`（`onJumpToHeading` 這個 plan 先留一個空函式或 `console.log`，真正捲動到該行是「主內容區」子計畫的工作）。

- [ ] **Step 6: 執行完整前端測試套件**

Run: `npm run test:frontend`
Expected: 全部通過

- [ ] **Step 7: Commit — 這是一個 UI 段落**

```bash
git add src/frontend/components/OutlinePanel.tsx src/frontend/App.tsx tests/frontend/OutlinePanel.test.tsx
git commit -m "$(cat <<'EOF'
Add outline sidebar panel wired to GET /api/outline

Why: The sidebar's second mode lets users jump to headings within
the currently active document — needs real heading data from the
search plan's outline endpoint, not placeholder content.
What: OutlinePanel shows a "no file open" state when there's no
active tab, otherwise fetches and renders the active tab's heading
structure with indentation by level. Clicking a heading calls
onJumpToHeading(line) — actually scrolling to that line is out of
scope for this plan (no rendered document content exists yet) and
belongs to the main-content-view plan.
How: [UI CHECKPOINT] UI-facing segment per CLAUDE.md's checkpoint
rule — see Task 4's commit for the background-session handling note.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KCkr3UUhi36YHAEiAAhp5L
EOF
)"
```

---

### Task 7: 搜尋 UI（兩種模式）

**Files:**
- Create: `src/frontend/components/SearchBar.tsx`
- Modify: `src/frontend/components/FileTreePanel.tsx` — 有搜尋字串時切換成搜尋結果列表
- Modify: `src/frontend/components/OutlinePanel.tsx` — 有搜尋字串時只顯示符合的標題
- Modify: `src/frontend/App.tsx` — 把 `<SearchBar>` 放在 Sidebar 內、依 `sidebarMode` 顯示不同語意的搜尋選項
- Test: `tests/frontend/SearchBar.test.tsx`

**Interfaces:**
- Produces: `<SearchBar mode={'files'|'outline'} onSearch={(query: string, options: SearchOptions) => void} />`
  - files 模式：`SearchOptions = {target: 'name'|'content'|'both', scope: 'all'|'open', regex: boolean}`
  - outline 模式：`SearchOptions = {target: 'title'|'content'|'both', regex: boolean}`（scope 固定，不在 UI 顯示）

- [ ] **Step 1: 寫失敗測試**

`tests/frontend/SearchBar.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SearchBar } from '../../src/frontend/components/SearchBar.js'

describe('SearchBar', () => {
  it('files mode shows scope options; outline mode does not', () => {
    const { rerender } = render(<SearchBar mode="files" onSearch={() => {}} />)
    expect(screen.getByText(/all files/i)).toBeInTheDocument()

    rerender(<SearchBar mode="outline" onSearch={() => {}} />)
    expect(screen.queryByText(/all files/i)).not.toBeInTheDocument()
  })

  it('calls onSearch with the query and default options when typing (debounced)', async () => {
    vi.useFakeTimers()
    const onSearch = vi.fn()
    render(<SearchBar mode="files" onSearch={onSearch} />)

    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: 'hello' } })
    expect(onSearch).not.toHaveBeenCalled()

    vi.advanceTimersByTime(300)
    expect(onSearch).toHaveBeenCalledWith('hello', { target: 'both', scope: 'all', regex: false })
    vi.useRealTimers()
  })

  it('toggles regex mode', () => {
    const onSearch = vi.fn()
    render(<SearchBar mode="files" onSearch={onSearch} />)
    fireEvent.click(screen.getByRole('button', { name: /regex/i }))
    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: 'a+' } })
    vi.useFakeTimers()
    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: 'a+' } })
    vi.advanceTimersByTime(300)
    expect(onSearch).toHaveBeenLastCalledWith(
      'a+',
      expect.objectContaining({ regex: true })
    )
    vi.useRealTimers()
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npm run test:frontend -- SearchBar.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: 實作**

`src/frontend/components/SearchBar.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

type FilesTarget = 'name' | 'content' | 'both'
type FilesScope = 'all' | 'open'
type OutlineTarget = 'title' | 'content' | 'both'

interface FilesSearchOptions {
  target: FilesTarget
  scope: FilesScope
  regex: boolean
}

interface OutlineSearchOptions {
  target: OutlineTarget
  regex: boolean
}

type SearchOptions = FilesSearchOptions | OutlineSearchOptions

interface SearchBarProps {
  mode: 'files' | 'outline'
  onSearch: (query: string, options: SearchOptions) => void
}

const DEBOUNCE_MS = 300

export function SearchBar({ mode, onSearch }: SearchBarProps) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [target, setTarget] = useState<FilesTarget | OutlineTarget>('both')
  const [scope, setScope] = useState<FilesScope>('all')
  const [regex, setRegex] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      const options: SearchOptions =
        mode === 'files'
          ? { target: target as FilesTarget, scope, regex }
          : { target: target as OutlineTarget, regex }
      onSearch(query, options)
    }, DEBOUNCE_MS)
    return () => clearTimeout(timerRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, target, scope, regex, mode])

  return (
    <div data-testid="search-bar">
      <input
        placeholder={t('search.placeholder')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div>
        <button aria-pressed={target === 'name'} onClick={() => setTarget(mode === 'files' ? 'name' : 'title')}>
          {mode === 'files' ? t('search.targetName') : t('search.targetName')}
        </button>
        <button aria-pressed={target === 'content'} onClick={() => setTarget('content')}>
          {t('search.targetContent')}
        </button>
        <button aria-pressed={target === 'both'} onClick={() => setTarget('both')}>
          {t('search.targetBoth')}
        </button>
      </div>
      {mode === 'files' && (
        <div>
          <button aria-pressed={scope === 'all'} onClick={() => setScope('all')}>
            {t('search.scopeAll')}
          </button>
          <button aria-pressed={scope === 'open'} onClick={() => setScope('open')}>
            {t('search.scopeOpen')}
          </button>
        </div>
      )}
      <button aria-pressed={regex} aria-label="regex" onClick={() => setRegex((r) => !r)}>
        .*
      </button>
    </div>
  )
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `npm run test:frontend -- SearchBar.test.tsx`
Expected: PASS（3 個測試）

- [ ] **Step 5: 接進 Sidebar / FileTreePanel / OutlinePanel**

在 `App.tsx` 裡，`<Sidebar>` 的 children 現在依模式分別是：

```tsx
{sidebarMode === 'files' && (
  <>
    <SearchBar mode="files" onSearch={handleFileSearch} />
    <FileTreePanel roots={roots} onOpenFile={openFile} searchResults={fileSearchResults} />
  </>
)}
{sidebarMode === 'outline' && (
  <>
    <SearchBar mode="outline" onSearch={handleOutlineSearch} />
    <OutlinePanel activeTab={...} onJumpToHeading={...} headingFilter={outlineSearchQuery} />
  </>
)}
```

`handleFileSearch(query, options)`：若 `query` 為空字串，清空 `fileSearchResults`（讓 `FileTreePanel` 顯示回原本的樹狀結構）；否則呼叫 `GET /api/search?root=...&q=...&target=...&scope=...&regex=...`（多 root 時對每個 root 各呼叫一次並合併結果，或視需求只搜當前顯示的 root——這個 plan 先實作成對每個 root 各呼叫一次），把結果存進 `fileSearchResults` 狀態傳給 `FileTreePanel`。

`FileTreePanel` 新增 `searchResults?: {fileMatches, contentMatches} | null` prop：非 `null` 時渲染搜尋結果列表（檔名 + 命中行預覽）取代原本的樹狀結構；`null` 或 `undefined` 時維持原本行為。

`handleOutlineSearch(query, options)`：純前端過濾（大綱搜尋範圍固定是目前分頁，`OutlinePanel` 已經有完整的 headings 陣列在記憶體裡，不需要另外呼叫 API）——把 `query`/`options` 往下傳給 `OutlinePanel` 做 client-side 篩選即可，`OutlinePanel` 新增 `headingFilter?: {query: string, regex: boolean}` prop。

（這些串接屬於「把已經各自測試過的元件組裝起來」的整合工作，實作者請對照 Task 5/6 已經寫好的元件介面精確調整，不要重新設計介面。整合後的行為用手動在瀏覽器測試確認：`npm run dev:frontend`（需要背景先跑一個真實 daemon 供 Vite proxy 轉發），輸入搜尋字串觀察側邊欄內容變化。）

- [ ] **Step 6: 執行完整前端測試套件**

Run: `npm run test:frontend`
Expected: 全部通過

- [ ] **Step 7: Commit — 這是一個 UI 段落**

```bash
git add src/frontend/components/SearchBar.tsx src/frontend/components/FileTreePanel.tsx src/frontend/components/OutlinePanel.tsx src/frontend/App.tsx tests/frontend/SearchBar.test.tsx
git commit -m "$(cat <<'EOF'
Wire search UI into both sidebar modes

Why: Per the design spec, search semantics change with the sidebar
mode — files mode searches name/content/both across all-files-or-
open-tabs with regex support; outline mode searches title/content
within just the current tab. Both needed a debounced input UI and
wiring into the panels built in Tasks 5-6.
What: SearchBar renders mode-appropriate controls (scope options only
in files mode) and debounces onSearch calls by 300ms. Files-mode
search calls GET /api/search per root and feeds results into
FileTreePanel's new searchResults prop, which swaps the tree view for
a results list when non-null. Outline-mode search filters the
already-fetched headings client-side (no extra API call needed, since
the scope is always "this one already-loaded document").
How: [UI CHECKPOINT] UI-facing segment per CLAUDE.md's checkpoint
rule — see Task 4's commit for the background-session handling note.
Multi-root file search issues one request per root and merges results
rather than adding a multi-root query parameter to the backend API,
keeping Plan 3's API surface unchanged.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KCkr3UUhi36YHAEiAAhp5L
EOF
)"
```

---

### Task 8: 搜尋歷史記錄（自動完成 + 可清除 + 可設定筆數上限）

> 這個 task 是在 Task 7 開發過程中，使用者追加的需求：搜尋框要記住最近搜尋過的字串，輸入時即時比對顯示建議選單，可用鍵盤（↑/↓ 選、Enter 確定、Tab 補全）操作，歷史筆數上限可調整（預設 10 筆），可一鍵清除。**必須等 Task 7 的 commit 完成、`SearchBar.tsx` 定案後才開始**，避免與 Task 7 對同一檔案的變更衝突。

**Files:**
- Create: `src/frontend/hooks/useSearchHistory.ts`
- Modify: `src/frontend/components/SearchBar.tsx`（讀取 Task 7 落地後的實際版本再整合，不要對照本節之外任何假設的舊版介面）
- Test: `tests/frontend/useSearchHistory.test.ts`
- Test: 擴充 `tests/frontend/SearchBar.test.tsx`

**Interfaces:**
- `useSearchHistory(mode: 'files' | 'outline')` → `{entries: string[], maxSize: number, addEntry: (query: string) => void, clearHistory: () => void, setMaxSize: (n: number) => void}`。存在 `localStorage['mvs-search-history:<mode>']`，格式 `{maxSize: number, entries: string[]}`；`files` 模式與 `outline` 模式各自獨立一份歷史（語意不同，不應該混在一起）
- `SearchBar` 的對外 props（`{mode, onSearch}`）**不變**——歷史記錄是 `SearchBar` 內部行為，呼叫端（`App.tsx`）不需要知道歷史記錄的存在，也不需要修改

**行為規格：**
- `addEntry`：trim 後為空字串不記錄；已存在的字串會移到最前面而非重複一筆（去重＋提升到最新）；超過 `maxSize` 的舊筆數自動捨棄
- `setMaxSize`：改變上限後，若目前筆數超過新上限，立刻截斷多餘的舊筆數
- `clearHistory`：清空 `entries`，`maxSize` 設定值保留
- **何時寫入歷史**：不是每次 debounce 觸發 `onSearch` 就寫入（那樣打字過程中的每個中間字串都會被記錄，不是使用者的本意）——只有使用者「確定」一次搜尋時才寫入：按 `Enter`、或用滑鼠點選/鍵盤選取一筆建議並確定。既有的 300ms debounce 即時搜尋行為（Task 7 已實作）維持不變，兩者並存
- **建議選單**：輸入框有焦點時，若目前輸入字串為空，顯示全部歷史（最新在前）；若有輸入字串，只顯示歷史中「不分大小寫、包含該子字串」的項目。選單為空（沒有比對到任何歷史，或歷史本身是空的）時完全不渲染選單容器
- **鍵盤操作**：`ArrowDown`/`ArrowUp` 在建議選單中移動反白項目（含邊界處理，不循環也可以，不循環比循環更常見）；`Enter`：若有反白項目則採用該項目的文字（同時視為一次確定搜尋，寫入歷史、立即呼叫 `onSearch` 不等 debounce）；若無反白項目則直接把目前輸入框內容視為確定搜尋（同樣寫入歷史、立即呼叫 `onSearch`）；`Escape`：關閉選單，不改變輸入框內容；`Tab`：把輸入框內容**自動補全**成反白項目（無反白時用清單第一項）的完整文字，**不**觸發搜尋、**不**寫入歷史、**不**把焦點移出輸入框（`event.preventDefault()`），維持選單開啟讓使用者可以再按 Enter 確定
- **清除與筆數設定 UI**：`SearchBar` 在搜尋輸入框旁固定顯示一個「清除歷史」按鈕（沒有歷史時 disabled）與一個筆數上限的 `<input type="number" min={1} max={100}>`（受控於 `maxSize`，變更時呼叫 `setMaxSize`）——不需要額外的設定選單串接，這個小功能整個在 `SearchBar` 內自我完備

- [ ] **Step 1: 寫失敗測試（`useSearchHistory`）**

`tests/frontend/useSearchHistory.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSearchHistory } from '../../src/frontend/hooks/useSearchHistory.js'

describe('useSearchHistory', () => {
  beforeEach(() => localStorage.clear())

  it('defaults to an empty history with maxSize 10', () => {
    const { result } = renderHook(() => useSearchHistory('files'))
    expect(result.current.entries).toEqual([])
    expect(result.current.maxSize).toBe(10)
  })

  it('addEntry adds a query, most recent first', () => {
    const { result } = renderHook(() => useSearchHistory('files'))
    act(() => result.current.addEntry('foo'))
    act(() => result.current.addEntry('bar'))
    expect(result.current.entries).toEqual(['bar', 'foo'])
  })

  it('addEntry ignores an empty or whitespace-only query', () => {
    const { result } = renderHook(() => useSearchHistory('files'))
    act(() => result.current.addEntry('   '))
    expect(result.current.entries).toEqual([])
  })

  it('addEntry de-dupes by moving an existing entry to the front', () => {
    const { result } = renderHook(() => useSearchHistory('files'))
    act(() => result.current.addEntry('foo'))
    act(() => result.current.addEntry('bar'))
    act(() => result.current.addEntry('foo'))
    expect(result.current.entries).toEqual(['foo', 'bar'])
  })

  it('addEntry truncates to maxSize', () => {
    const { result } = renderHook(() => useSearchHistory('files'))
    act(() => result.current.setMaxSize(2))
    act(() => result.current.addEntry('a'))
    act(() => result.current.addEntry('b'))
    act(() => result.current.addEntry('c'))
    expect(result.current.entries).toEqual(['c', 'b'])
  })

  it('clearHistory empties entries but keeps maxSize', () => {
    const { result } = renderHook(() => useSearchHistory('files'))
    act(() => result.current.setMaxSize(5))
    act(() => result.current.addEntry('foo'))
    act(() => result.current.clearHistory())
    expect(result.current.entries).toEqual([])
    expect(result.current.maxSize).toBe(5)
  })

  it('setMaxSize truncates existing entries down to the new smaller limit', () => {
    const { result } = renderHook(() => useSearchHistory('files'))
    act(() => result.current.addEntry('a'))
    act(() => result.current.addEntry('b'))
    act(() => result.current.addEntry('c'))
    act(() => result.current.setMaxSize(1))
    expect(result.current.entries).toEqual(['c'])
  })

  it('keeps files-mode and outline-mode history independent', () => {
    const files = renderHook(() => useSearchHistory('files'))
    const outline = renderHook(() => useSearchHistory('outline'))
    act(() => files.result.current.addEntry('file query'))
    expect(outline.result.current.entries).toEqual([])
  })

  it('persists across hook instances (survives a reload)', () => {
    const first = renderHook(() => useSearchHistory('files'))
    act(() => first.result.current.addEntry('foo'))
    const second = renderHook(() => useSearchHistory('files'))
    expect(second.result.current.entries).toEqual(['foo'])
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npm run test:frontend -- useSearchHistory.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: 實作 `useSearchHistory`**

`src/frontend/hooks/useSearchHistory.ts`:

```ts
import { useCallback, useState } from 'react'

interface StoredHistory {
  maxSize: number
  entries: string[]
}

const DEFAULT_MAX_SIZE = 10

function storageKey(mode: string): string {
  return `mvs-search-history:${mode}`
}

function loadHistory(mode: string): StoredHistory {
  try {
    const raw = localStorage.getItem(storageKey(mode))
    if (!raw) return { maxSize: DEFAULT_MAX_SIZE, entries: [] }
    const parsed = JSON.parse(raw)
    return {
      maxSize: typeof parsed.maxSize === 'number' && parsed.maxSize > 0 ? parsed.maxSize : DEFAULT_MAX_SIZE,
      entries: Array.isArray(parsed.entries) ? parsed.entries : [],
    }
  } catch {
    return { maxSize: DEFAULT_MAX_SIZE, entries: [] }
  }
}

function persist(mode: string, history: StoredHistory) {
  localStorage.setItem(storageKey(mode), JSON.stringify(history))
}

export function useSearchHistory(mode: string) {
  const [history, setHistory] = useState<StoredHistory>(() => loadHistory(mode))

  const addEntry = useCallback(
    (query: string) => {
      const trimmed = query.trim()
      if (!trimmed) return
      setHistory((prev) => {
        const withoutDuplicate = prev.entries.filter((e) => e !== trimmed)
        const entries = [trimmed, ...withoutDuplicate].slice(0, prev.maxSize)
        const next = { ...prev, entries }
        persist(mode, next)
        return next
      })
    },
    [mode]
  )

  const clearHistory = useCallback(() => {
    setHistory((prev) => {
      const next = { ...prev, entries: [] }
      persist(mode, next)
      return next
    })
  }, [mode])

  const setMaxSize = useCallback(
    (maxSize: number) => {
      setHistory((prev) => {
        const next = { maxSize, entries: prev.entries.slice(0, maxSize) }
        persist(mode, next)
        return next
      })
    },
    [mode]
  )

  return { entries: history.entries, maxSize: history.maxSize, addEntry, clearHistory, setMaxSize }
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `npm run test:frontend -- useSearchHistory.test.ts`
Expected: PASS（8 個測試）

- [ ] **Step 5: 讀取 Task 7 落地後的 `SearchBar.tsx` 實際內容**

不要假設任何特定的既有程式碼結構——先讀檔案，理解目前的 `query`/`target`/`scope`/`regex`/debounce 邏輯，再決定怎麼疊加歷史記錄功能，盡量以最小改動整合，不重寫既有邏輯。

- [ ] **Step 6: 寫失敗測試（`SearchBar` 新行為，擴充既有測試檔）**

在 `tests/frontend/SearchBar.test.tsx` 加入（依既有測試檔的 import/mock 慣例調整）：

```tsx
it('shows matching history suggestions as the user types', async () => {
  localStorage.setItem(
    'mvs-search-history:files',
    JSON.stringify({ maxSize: 10, entries: ['hello world', 'goodbye', 'help'] })
  )
  render(<SearchBar mode="files" onSearch={() => {}} />)
  fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: 'hel' } })
  expect(screen.getByText('hello world')).toBeInTheDocument()
  expect(screen.getByText('help')).toBeInTheDocument()
  expect(screen.queryByText('goodbye')).not.toBeInTheDocument()
})

it('shows all history when the input is empty and focused', () => {
  localStorage.setItem(
    'mvs-search-history:files',
    JSON.stringify({ maxSize: 10, entries: ['a', 'b'] })
  )
  render(<SearchBar mode="files" onSearch={() => {}} />)
  fireEvent.focus(screen.getByPlaceholderText(/search/i))
  expect(screen.getByText('a')).toBeInTheDocument()
  expect(screen.getByText('b')).toBeInTheDocument()
})

it('pressing Enter commits the query immediately, bypassing debounce, and records history', () => {
  vi.useFakeTimers()
  const onSearch = vi.fn()
  render(<SearchBar mode="files" onSearch={onSearch} />)
  const input = screen.getByPlaceholderText(/search/i)
  fireEvent.change(input, { target: { value: 'my query' } })
  fireEvent.keyDown(input, { key: 'Enter' })
  expect(onSearch).toHaveBeenCalledWith('my query', expect.anything())
  vi.useRealTimers()

  // history persisted for the next mount
  const { unmount } = render(<SearchBar mode="files" onSearch={() => {}} />)
  fireEvent.focus(screen.getByPlaceholderText(/search/i))
  expect(screen.getByText('my query')).toBeInTheDocument()
  unmount()
})

it('ArrowDown highlights a suggestion and Enter selects it', () => {
  localStorage.setItem(
    'mvs-search-history:files',
    JSON.stringify({ maxSize: 10, entries: ['alpha', 'beta'] })
  )
  const onSearch = vi.fn()
  render(<SearchBar mode="files" onSearch={onSearch} />)
  const input = screen.getByPlaceholderText(/search/i)
  fireEvent.focus(input)
  fireEvent.keyDown(input, { key: 'ArrowDown' })
  fireEvent.keyDown(input, { key: 'Enter' })
  expect(input).toHaveValue('alpha')
  expect(onSearch).toHaveBeenCalledWith('alpha', expect.anything())
})

it('Tab completes the input to the highlighted suggestion without submitting or moving focus', () => {
  localStorage.setItem(
    'mvs-search-history:files',
    JSON.stringify({ maxSize: 10, entries: ['alpha', 'beta'] })
  )
  const onSearch = vi.fn()
  render(<SearchBar mode="files" onSearch={onSearch} />)
  const input = screen.getByPlaceholderText(/search/i)
  fireEvent.focus(input)
  fireEvent.keyDown(input, { key: 'ArrowDown' })
  const tabEvent = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
  input.dispatchEvent(tabEvent)
  expect(input).toHaveValue('alpha')
  expect(tabEvent.defaultPrevented).toBe(true)
  expect(onSearch).not.toHaveBeenCalled()
})

it('clicking "clear history" empties the suggestion list', () => {
  localStorage.setItem(
    'mvs-search-history:files',
    JSON.stringify({ maxSize: 10, entries: ['alpha'] })
  )
  render(<SearchBar mode="files" onSearch={() => {}} />)
  fireEvent.click(screen.getByRole('button', { name: /clear history/i }))
  fireEvent.focus(screen.getByPlaceholderText(/search/i))
  expect(screen.queryByText('alpha')).not.toBeInTheDocument()
})

it('changing the max-size input updates the stored limit', () => {
  render(<SearchBar mode="files" onSearch={() => {}} />)
  const maxSizeInput = screen.getByLabelText(/history size|max.*history/i)
  fireEvent.change(maxSizeInput, { target: { value: '3' } })
  expect(JSON.parse(localStorage.getItem('mvs-search-history:files') ?? '{}').maxSize).toBe(3)
})

it('keeps files-mode and outline-mode search history separate', () => {
  localStorage.setItem(
    'mvs-search-history:files',
    JSON.stringify({ maxSize: 10, entries: ['files query'] })
  )
  render(<SearchBar mode="outline" onSearch={() => {}} />)
  fireEvent.focus(screen.getByPlaceholderText(/search/i))
  expect(screen.queryByText('files query')).not.toBeInTheDocument()
})
```

（實作者請對照目前 `SearchBar.tsx` 實際的測試撰寫慣例調整這些案例的細節——例如 `onSearch` 的 `options` 參數形狀依 Task 7 落地後的真實型別而定，這裡用 `expect.anything()` 只是為了不對那個形狀做多餘假設。）

- [ ] **Step 7: 執行測試確認失敗**

Run: `npm run test:frontend -- SearchBar.test.tsx`
Expected: FAIL — 新案例找不到歷史/自動完成相關行為

- [ ] **Step 8: 實作**

在 `SearchBar.tsx` 內：
1. 呼叫 `const { entries, maxSize, addEntry, clearHistory, setMaxSize } = useSearchHistory(mode)`
2. 新增 `isFocused`（或用 `suggestionsOpen`）與 `highlightedIndex` state
3. 計算 `suggestions = entries.filter((e) => e.toLowerCase().includes(query.toLowerCase()))`（`query` 為空字串時回傳整個 `entries`）
4. `onFocus` 開啟建議選單；`onBlur` 延遲關閉（避免點擊選單項目時 blur 搶先觸發，可以用 `onMouseDown` 在選單項目上呼叫 `event.preventDefault()`，或用一個小的 `setTimeout`）
5. `onKeyDown` 處理 `ArrowDown`/`ArrowUp`/`Enter`/`Escape`/`Tab` 如上述行為規格
6. 「確定搜尋」的共用邏輯（Enter 或點選建議都會用到）：清掉既有 debounce 計時器、直接呼叫 `onSearch(finalQuery, options)`、呼叫 `addEntry(finalQuery)`、關閉選單
7. 建議選單容器只在 `suggestions.length > 0` 且開啟時渲染，每個選項用 `onMouseDown`（見上）+ `onClick` 觸發選取
8. 在既有搜尋控制項旁加入「清除歷史」按鈕（`disabled={entries.length === 0}`，`onClick={clearHistory}`）與筆數上限 `<input type="number" min={1} max={100} value={maxSize} onChange={(e) => setMaxSize(Number(e.target.value))} aria-label={t('search.historyMaxSizeLabel')} />`
9. 在 5 個 `src/frontend/i18n/locales/*.json` 加入 `search.clearHistory`（"Clear history"）與 `search.historyMaxSizeLabel`（"History size"）鍵，其餘語言對應翻譯，遵循既有巢狀結構慣例

- [ ] **Step 9: 執行測試確認通過**

Run: `npm run test:frontend`
Expected: 全部通過

- [ ] **Step 10: 完整驗證**

Run: `npm run lint && npm run typecheck:frontend && npm run test:frontend`
Expected: 全部通過

- [ ] **Step 11: Codex code review**

Run: `/codex:review --base <Task-7-commit-sha>`（依 `CLAUDE.md` 最新規則，不 dispatch Claude reviewer subagent）。修正任何 Critical/Important 發現。

- [ ] **Step 12: Commit — 這是一個 UI 段落**

```bash
git add src/frontend/hooks/useSearchHistory.ts src/frontend/components/SearchBar.tsx src/frontend/i18n/locales/*.json tests/frontend/useSearchHistory.test.ts tests/frontend/SearchBar.test.tsx
git commit -m "$(cat <<'EOF'
Add search history with autocomplete to SearchBar

Why: User-requested mid-implementation addition (after Task 7 landed):
the search box should remember recent queries, show live-matching
suggestions as the user types, support keyboard selection and
Tab-to-complete (a pattern common across browsers/IDEs/shells), and
let the configurable history size be adjusted or cleared — without
depending on the not-yet-built settings menu (Plan 7).
What: useSearchHistory persists a per-mode ({files, outline} kept
independent) {maxSize, entries} blob to localStorage, with add
(dedupe + move-to-front + truncate), clear, and setMaxSize (which
also truncates on shrink). SearchBar's existing debounced live-search
onSearch behavior (Task 7) is unchanged; history is recorded only on
an explicit commit (Enter, or selecting a suggestion) so intermediate
keystrokes during live search don't pollute the history. Tab
autocompletes the input to the highlighted suggestion without
submitting or losing focus. A "clear history" button and a numeric
max-size input ship inline in SearchBar itself, self-contained.
How: [UI CHECKPOINT] UI-facing segment per CLAUDE.md's checkpoint
rule. SearchBar's external prop contract ({mode, onSearch}) is
unchanged, so no App.tsx/FileTreePanel/OutlinePanel changes were
needed for this task.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KCkr3UUhi36YHAEiAAhp5L
EOF
)"
```

---

### Task 9: 整合進發佈流程（Express 靜態檔案服務 + esbuild bundle）

**Files:**
- Modify: `src/server/app.js` — 新增 `express.static` 服務前端 dist，含 SPA fallback
- Modify: `scripts/build.js` — 在 esbuild bundle 之前先跑 `vite build`
- Modify: `package.json` — `build` script 改成同時 build 前後端
- Test: `tests/integration/frontend-serving.test.js`

**Interfaces:**
- Produces: 真實伺服器在非 `/api`/`/ws` 路徑一律回傳 `dist/frontend/index.html`（SPA fallback），靜態資源（JS/CSS）以正確 MIME type 提供

- [ ] **Step 1: 讀取現有 `src/server/app.js`、`scripts/build.js`、`package.json`**

- [ ] **Step 2: 修改 `src/server/app.js`**

在所有 `/api/*` 路由**之後**（避免 SPA fallback 攔截到 API 請求），加入：

```js
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FRONTEND_DIST = path.join(__dirname, '..', '..', 'dist', 'frontend')

// after all /api routes, before the final catch-all:
app.use(express.static(FRONTEND_DIST))
app.get('*', (req, res) => {
  res.sendFile(path.join(FRONTEND_DIST, 'index.html'))
})
```

（實作者請確認這段放在 `/api/shutdown` 之後、且不會攔截任何 `/api/*` 或 `/ws` 路徑——Express 路由是依註冊順序匹配，只要放在最後即可。）

- [ ] **Step 3: 修改 `scripts/build.js`**

在 esbuild 呼叫之前，加入呼叫 Vite build 的步驟：

```js
import { execSync } from 'node:child_process'

// before the esbuild `await build({...})` call:
console.log('Building frontend...')
execSync('vite build', { cwd: root, stdio: 'inherit' })
```

- [ ] **Step 4: 寫測試**

`tests/integration/frontend-serving.test.js`:

```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const execFileAsync = promisify(execFile)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CLI_PATH = path.join(__dirname, '..', '..', 'bin', 'cli.js')
const TEST_PORT = 22000 + (process.pid % 10000)

describe('frontend static serving', () => {
  let configHome, stateHome, testRoot, env

  beforeEach(async () => {
    configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'fe-serve-config-'))
    stateHome = fs.mkdtempSync(path.join(os.tmpdir(), 'fe-serve-state-'))
    testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fe-serve-root-'))
    env = { ...process.env, XDG_CONFIG_HOME: configHome, XDG_STATE_HOME: stateHome }
    await execFileAsync(
      process.execPath,
      [CLI_PATH, 'start', '--root', testRoot, '--port', String(TEST_PORT)],
      { env }
    )
  })

  afterEach(async () => {
    await execFileAsync(process.execPath, [CLI_PATH, 'stop'], { env }).catch(() => {})
    fs.rmSync(configHome, { recursive: true, force: true })
    fs.rmSync(stateHome, { recursive: true, force: true })
    fs.rmSync(testRoot, { recursive: true, force: true })
  })

  it('serves the frontend index.html for a non-API path', async () => {
    const res = await fetch(`http://127.0.0.1:${TEST_PORT}/`)
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('<div id="root">')
  })

  it('serves the SPA fallback for a client-side route', async () => {
    const res = await fetch(`http://127.0.0.1:${TEST_PORT}/some/client/route`)
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('<div id="root">')
  })

  it('does not let the SPA fallback shadow API routes', async () => {
    const res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/health`)
    const body = await res.json()
    expect(body.service).toBe('md-viewer-server')
  })
})
```

- [ ] **Step 5: 執行完整驗證**

Run: `npm run build && npm run test:integration`
Expected: 全部通過（`npm run build` 現在會先跑 `vite build` 產生 `dist/frontend/`，再跑 esbuild 產生 `dist/bundle.js`）

- [ ] **Step 6: Commit**

```bash
git add src/server/app.js scripts/build.js package.json tests/integration/frontend-serving.test.js
git commit -m "$(cat <<'EOF'
Serve the frontend build from Express with SPA fallback

Why: The frontend built in Tasks 1-7 has been developed against
Vite's dev server (with its proxy to the backend); the actual offline
installer needs the real Express server to serve the built static
files directly, since there's no separate frontend hosting in the
deployed daemon.
What: app.js adds express.static(dist/frontend) plus a catch-all
route serving index.html for any non-API path (SPA fallback), placed
after all /api routes so it can never shadow them. build.js now runs
`vite build` before the esbuild bundle step, so `npm run build`
produces both dist/frontend/ and dist/bundle.js in one command.
How: Route registration order (not a path prefix check) is what
prevents the fallback from intercepting /api/* — Express matches
routes in registration order, and every /api route is already
registered earlier in app.js.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KCkr3UUhi36YHAEiAAhp5L
EOF
)"
```

---

## Definition of Done

- [ ] `npm run lint` passes
- [ ] `npm run test:unit` passes (backend, unaffected by this plan)
- [ ] `npm run test:frontend` passes (all frontend component/unit tests)
- [ ] `npm run build` produces `dist/frontend/` and `dist/bundle.js`
- [ ] `npm run test:integration` passes (including the new frontend-serving tests)
- [ ] A real spawned daemon serves the frontend at `/`, with token auth flow working end-to-end (URL token → sessionStorage → API calls succeed)
- [ ] Sidebar correctly shows/hides the root-name layer based on root count
- [ ] Both sidebar modes (files/outline) and their mode-appropriate search options render and call the correct APIs
- [ ] Search history persists per mode (files/outline independent), autocompletes via keyboard (arrow keys + Enter + Tab-to-complete), defaults to 10 entries, and can be resized or cleared
