# 主內容區缺口補完 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Plan 6（主內容區）的收尾全計畫 review（opus，2026-09-07）比對 design spec 逐項核對後，發現 6 個 spec 明確要求、但 Plan 6 的 8 個 task 從未涵蓋、目前完全沒有程式碼的功能缺口。這些不是 bug，是**任務拆解本身的遺漏**——Plan 6 本身已經照它自己的 8 個 task 全部做完並通過三輪 review，但那 8 個 task 從一開始就沒有涵蓋這些項目。這份文件把它們補成獨立 task，全部完成後才代表「主內容區」真正符合 design spec，不只是符合 Plan 6 自己寫的（不完整的）任務清單。

**Architecture:** 每個缺口各自獨立、彼此不互相依賴，可以任意順序執行：
1. `.puml`/`.plantuml` 檔案渲染（spec:205）
2. `.mmd` 檔案渲染成圖表而非純文字（spec:206）
3. WebSocket 即時更新的前端消費端（spec:150-151）——後端 `ws-server.js`/`watcher.js` 早在 Plan 2（檔案 API）就做好了廣播，但前端從來沒建立過 WebSocket 連線去接收
4. 大檔案（>5MB）不提供完整渲染的保護（spec:164, 265）
5. 非 UTF-8 檔案的編碼標示（spec:154）
6. 三個 Plan 6 收尾 review 發現、範圍較小但真實的正確性/UX 缺口（見下方 Task 6）

**Tech Stack:** 沿用既有 React + TypeScript + Vitest 前端與 Express 後端，前端新增 WebSocket client（瀏覽器原生 `WebSocket`，不需要額外套件）。

## Global Constraints

- 這份 plan 是在執行 `/goal` 六個子計畫過程中，對 Plan 6 做收尾 review 時發現的範圍缺口，不是使用者直接要求的新功能——執行順序上，這份 plan 排在 Plan 7（設定選單）與 `toolbar-extras.md` 之後或之間皆可，由使用者判斷優先順序
- Commit 規範（`CLAUDE.md`）：一個邏輯段落一個 commit，Why/What/How 三段式；UI 段落標註 `[UI CHECKPOINT]`
- Review 方式：`CLAUDE.md` 目前規定不使用 Codex，一律 dispatch Claude sonnet/opus reviewer subagent（不用 haiku）

---

### Task 1: `.puml`/`.plantuml` 檔案渲染

**Files:**
- Modify: `src/server/entry.js`（`FILE_EXTENSIONS` 加入 `.puml`, `.plantuml`）
- Create: `src/frontend/components/PlantUmlView.tsx`
- Modify: `src/frontend/components/TabContent.tsx`（依副檔名分派）
- Test: `tests/frontend/PlantUmlView.test.tsx`
- Test: 擴充 `tests/frontend/TabContent.test.tsx`

**Interfaces:**
- `<PlantUmlView source={string} sendToServer={boolean} />`——`sendToServer=false` 時顯示原始碼 + 提示文字（「請至設定開啟並指定 server」，spec:205 原文字義）；`sendToServer=true` 時呼叫既有 `POST /api/plantuml-proxy`（Plan 4 已建好，未曾被前端呼叫過）取得 PNG 並顯示為 `<img>`

- [ ] **Step 1: 加入副檔名支援**

`src/server/entry.js` 的 `FILE_EXTENSIONS` 加入 `.puml`, `.plantuml`。這是唯一的後端變更（`/api/plantuml-proxy` 本身在 Plan 4 已經做好且測試過，不用再改）。

- [ ] **Step 2: 寫失敗測試（`PlantUmlView`）**

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PlantUmlView } from '../../src/frontend/components/PlantUmlView.js'

describe('PlantUmlView', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('shows raw source and a hint when sendToServer is false', () => {
    render(<PlantUmlView source="@startuml\nA -> B\n@enduml" sendToServer={false} />)
    expect(screen.getByText(/@startuml/)).toBeInTheDocument()
    expect(screen.getByText(/settings/i)).toBeInTheDocument()
  })

  it('fetches and renders the diagram image when sendToServer is true', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(new Blob(['fake-png-bytes']), { headers: { 'Content-Type': 'image/png' } }))
    )
    render(<PlantUmlView source="@startuml\nA -> B\n@enduml" sendToServer={true} />)
    await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument())
  })

  it('shows an error message if the proxy call fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 502 })))
    render(<PlantUmlView source="@startuml\nA -> B\n@enduml" sendToServer={true} />)
    await waitFor(() => expect(screen.getByText(/error|failed/i)).toBeInTheDocument())
  })
})
```

- [ ] **Step 3: 執行測試確認失敗**

Run: `npm run test:frontend -- PlantUmlView.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 4: 實作**

`src/frontend/components/PlantUmlView.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { apiFetch } from '../api-client.js'

interface PlantUmlViewProps {
  source: string
  sendToServer: boolean
}

export function PlantUmlView({ source, sendToServer }: PlantUmlViewProps) {
  const { t } = useTranslation()
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!sendToServer) return
    let cancelled = false
    let objectUrl: string | null = null
    apiFetch('/api/plantuml-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error('proxy failed')
        const blob = await res.blob()
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setImageUrl(objectUrl)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [source, sendToServer])

  if (!sendToServer) {
    return (
      <div>
        <pre>{source}</pre>
        <p>{t('plantuml.disabledHint', 'Enable "send diagram source to PlantUML server" in Settings to render this diagram.')}</p>
      </div>
    )
  }

  if (error) {
    return <p>{t('plantuml.error', 'Failed to render this PlantUML diagram.')}</p>
  }

  if (!imageUrl) {
    return <p>{t('plantuml.loading', 'Rendering...')}</p>
  }

  return <img src={imageUrl} alt={t('plantuml.imageAlt', 'Rendered PlantUML diagram')} />
}
```

在 `TabContent.tsx` 加入 `.puml`/`.plantuml` 副檔名判斷（跟既有的 `isHtml` 判斷同一種寫法），渲染 `<PlantUmlView source={tab.content} sendToServer={effective.sendToPlantUmlServer} />`——`effective.sendToPlantUmlServer` 需要從 `useSettings`（Plan 7 Task 3，若尚未實作則暫時接一個 prop 由 `App.tsx` 傳入，比照 `allowHtmlScripts` 目前的接線方式）取得。

（實作者請對照 `TabContent.tsx` 目前實際的 dispatch 結構調整，不要重新設計既有邏輯；`.puml`/`.plantuml` 檔案不受 view/edit/split 模式影響——沒有「編輯圖表原始碼再即時預覽」的 split 需求，spec 沒有要求，保持單一渲染模式即可，YAGNI。）

- [ ] **Step 5-7:** 執行測試確認通過、dispatch reviewer subagent（sonnet/opus）、Commit（含 `[UI CHECKPOINT]`）。

---

### Task 2: `.mmd` 檔案渲染成圖表

**Files:**
- Modify: `src/frontend/components/TabContent.tsx`
- Test: 擴充 `tests/frontend/TabContent.test.tsx`

**Interfaces:** `.mmd` 檔案在 view 模式渲染成 `<MermaidBlock definition={tab.content} />`（Task 3 of Plan 6 已建好、已修過兩個 bug），而不是目前的 `<MarkdownView>`；edit 模式仍是純文字編輯 mermaid 原始碼（`<MarkdownEditor>`，不需要新元件）；split 模式左邊編輯右邊即時渲染成圖表（不是 markdown 預覽）——需要一個小的 `MermaidSplitView` 或重用 `SplitView` 但把右側預覽從 `MarkdownView` 換成 `MermaidBlock`（實作者請判斷哪種更乾淨，若 `SplitView` 目前寫死 `MarkdownView` 而不易替換，加一個 `previewMode` prop 是最小改動）

- [ ] **Step 1: 寫失敗測試**

擴充 `tests/frontend/TabContent.test.tsx`：

```tsx
it('renders MermaidBlock (not MarkdownView) for a .mmd file in view mode', () => {
  render(
    <TabContent
      tab={makeTab({ relPath: 'diagram.mmd', content: 'graph TD; A-->B;', mtimeMs: 1 })}
      onContentLoaded={() => {}}
      onChange={() => {}}
      onSave={() => {}}
      allowHtmlScripts={false}
    />
  )
  expect(screen.getByTestId('mermaid-block')).toBeInTheDocument()
  expect(screen.queryByTestId('markdown-view')).not.toBeInTheDocument()
})

it('renders MarkdownEditor (plain text) for a .mmd file in edit mode', () => {
  render(
    <TabContent
      tab={makeTab({ relPath: 'diagram.mmd', content: 'graph TD; A-->B;', mtimeMs: 1, mode: 'edit' })}
      onContentLoaded={() => {}}
      onChange={() => {}}
      onSave={() => {}}
      allowHtmlScripts={false}
    />
  )
  expect(screen.getByRole('textbox')).toHaveValue('graph TD; A-->B;')
})
```

- [ ] **Step 2-3:** 確認失敗、實作（`TabContent.tsx` 加入 `isMermaid = tab.relPath.endsWith('.mmd')` 判斷，`effectiveMode === 'view'` 時渲染 `MermaidBlock` 而非 `MarkdownView`；`edit` 維持 `MarkdownEditor`；`split` 模式視實作者判斷決定是否值得為這個相對少見的檔案類型單獨建立 mermaid 版 split view，或先只做 view/edit 兩種、split 模式先退化成跟 edit 相同（純文字編輯，無即時預覽）並在 commit message 說明——**這是可以接受的範圍縮減**，因為 spec 對 `.mmd` 只要求「一律前端渲染」，沒有明確要求一定要有 split 預覽）。

- [ ] **Step 4-6:** 執行測試確認通過、dispatch reviewer subagent、Commit（`[UI CHECKPOINT]`）。

---

### Task 3: WebSocket 前端消費端 — 開啟中分頁的即時更新

**Files:**
- Create: `src/frontend/hooks/useFileWatcher.ts`
- Modify: `src/frontend/App.tsx`
- Test: `tests/frontend/useFileWatcher.test.ts`

**Interfaces:**
- `useFileWatcher(onFileChanged: (rootId: number, relPath: string) => void, onFileAdded: (...) => void, onFileRemoved: (...) => void): void`——連線到 `ws://<host>/ws?token=<token>`（token 從 `getStoredToken()` 取得），依收到的事件類型分派到對應 callback；連線斷線時自動重連（simple backoff，例如固定 3 秒重試，不需要指數退避的複雜度——YAGNI，daemon 通常不會頻繁斷線）
- `App.tsx` 用這個 hook：`file-changed` 事件若命中某個已開啟分頁，依 `autoReloadViewingTabs`（Plan 7 的 local pref，若尚未實作則先寫死 `true`）決定要嘛直接重新 fetch 該分頁內容並更新（前提：該分頁目前不是 `dirty`，避免蓋掉使用者正在編輯的內容——這是本 task 需要自行決定的合理邊界，spec 沒有明講但這是唯一不會意外丟資料的做法），要嘛只顯示一個「檔案已更新」提示條不自動換內容

**先確認後端事件格式**：讀 `src/server/watcher.js` 確認 `createWatcher` 實際廣播的事件物件長什麼樣（`{type: 'file-changed'|'file-added'|'file-removed', root, path}` 這種形狀是猜測，實作者請對照原始碼精確調整，不要假設）。

- [ ] **Step 1: 讀取 `src/server/watcher.js`、`src/server/ws-server.js` 確認真實事件格式與 WS 路徑/驗證方式**

- [ ] **Step 2: 寫失敗測試**

`tests/frontend/useFileWatcher.test.ts`（需要 mock 全域 `WebSocket`——檢查 `tests/frontend/setup.ts` 是否已經有 `Worker` 的 mock 模式可以參考類似做法）：

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useFileWatcher } from '../../src/frontend/hooks/useFileWatcher.js'

class MockWebSocket {
  static instances: MockWebSocket[] = []
  onmessage: ((event: { data: string }) => void) | null = null
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  constructor(public url: string) {
    MockWebSocket.instances.push(this)
  }
  close() {}
  emit(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) })
  }
}

describe('useFileWatcher', () => {
  beforeEach(() => {
    MockWebSocket.instances = []
    vi.stubGlobal('WebSocket', MockWebSocket)
    sessionStorage.setItem('mvs-token', 'tok')
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    sessionStorage.clear()
  })

  it('connects to /ws with the stored token', () => {
    renderHook(() => useFileWatcher(() => {}, () => {}, () => {}))
    expect(MockWebSocket.instances[0].url).toContain('token=tok')
  })

  it('dispatches a file-changed event to onFileChanged', () => {
    const onFileChanged = vi.fn()
    renderHook(() => useFileWatcher(onFileChanged, () => {}, () => {}))
    MockWebSocket.instances[0].emit({ type: 'file-changed', root: 0, path: 'a.md' })
    expect(onFileChanged).toHaveBeenCalledWith(0, 'a.md')
  })
})
```

（實作者請對照 `src/server/watcher.js` 的真實事件欄位名稱調整這個測試，上面的 `root`/`path` 命名是猜測。）

- [ ] **Step 3-4:** 確認失敗、實作 hook（原生 `WebSocket`，`onmessage` 解析 `JSON.parse(event.data)`，依 `type` 分派）。

- [ ] **Step 5: 接進 `App.tsx`**

`onFileChanged` 命中已開啟且非 `dirty` 的分頁時，重新呼叫 `GET /api/file` 更新該分頁內容（沿用 `handleContentLoaded` 的邏輯，或另外抽一個小函式）；命中 `dirty` 分頁時只更新一個「外部已修改」的旗標，不動使用者正在編輯的內容（這其實跟現有的 409 衝突機制是互補的——真的存檔時才會走 409 流程，這裡只是「別默默蓋掉還沒存的東西」的第一道防線）。`onFileAdded`/`onFileRemoved` 這個 task 先只處理「不讓 FileTreePanel 顯示過期清單」——最小可接受的做法是收到任何 `file-added`/`file-removed` 事件就重新呼叫 `GET /api/files` 刷新該 root 的檔案清單（不需要做成精緻的局部更新，那是效能優化，YAGNI）。

- [ ] **Step 6-8:** 執行測試確認通過、dispatch reviewer subagent、Commit（`[UI CHECKPOINT]`）。

---

### Task 4: 大檔案保護（>5MB 不提供完整渲染）

**Files:**
- Modify: `src/server/api/file.js`
- Modify: `src/frontend/components/TabContent.tsx`
- Test: 擴充 `tests/integration/api-file.test.js`、`tests/frontend/TabContent.test.tsx`

**Interfaces:**
- `GET /api/file` 對超過門檻大小（5MB，寫死常數即可，不需要做成使用者可調設定——spec 用「例如 5MB」帶過，不是要求可設定）的檔案，回傳 `200 {content: null, mtimeMs, encoding, tooLarge: true}`（不回傳實際內容，避免真的把 5MB+ 的內容送過網路又渲染，防護的意義才存在）
- `TabContent` 收到 `tooLarge: true` 時顯示「檔案過大，不提供完整渲染」提示，不嘗試渲染，也不提供編輯（不確定內容就不能安全編輯存檔）

- [ ] **Step 1: 寫失敗測試**

在 integration 測試裡建立一個 >5MB 的暫存檔案，驗證 `GET /api/file` 回傳 `tooLarge: true` 且 `content` 為 `null`；在 `TabContent.test.tsx` 驗證收到這個回應時顯示提示文字且不渲染 `MarkdownView`/`MarkdownEditor`。

- [ ] **Step 2-3:** 確認失敗、實作（`file.js` 的 `GET /api/file` 在讀檔前先 `fs.statSync` 檢查大小，超過門檻直接回傳精簡回應，不呼叫 `readFile` 讀取完整內容）。

- [ ] **Step 4-6:** 執行測試確認通過、dispatch reviewer subagent、Commit。

---

### Task 5: 非 UTF-8 檔案的編碼標示

**Files:**
- Modify: `src/frontend/components/TabContent.tsx`（或一個新的小型 `EncodingBadge` 元件）
- Test: 擴充 `tests/frontend/TabContent.test.tsx`

**Interfaces:** 當 `tab.encoding === 'unknown'` 時，在內容區頂部顯示一個小標示（例如「非 UTF-8 編碼，僅供檢視」），不需要真的偵測出實際字元集名稱（後端 `isValidUtf8` 目前只能判斷「是」或「不是」UTF-8，不做完整字元集偵測——這超出目前 `file-store.js` 的能力範圍，做這個需要引入字元集偵測函式庫，屬於過度工程，YAGNI；spec 原文「UI 標示原始編碼」在目前後端能力下，最誠實的做法就是標示「非 UTF-8」而非猜測實際編碼名稱）。

- [ ] **Step 1-6:** 寫失敗測試、確認失敗、實作、確認通過、dispatch reviewer subagent、Commit（`[UI CHECKPOINT]`）。

---

### Task 6: Plan 6 收尾 review 發現的三個較小缺口

**Files:**
- Modify: `src/frontend/App.tsx`
- Modify: `src/frontend/components/TabContent.tsx`
- Test: 擴充 `tests/frontend/App.test.tsx`、`tests/frontend/TabContent.test.tsx`

三個獨立的小修正，可以合併一個 commit 或分開，實作者自行判斷：

1. **`.html` 分頁不該顯示 Edit/Split 按鈕**：`TabContent.tsx` 目前對 `.html` 一律渲染 `HtmlView`，不受 `tab.mode` 影響，但 `App.tsx` 的 mode 切換按鈕（Plan 6 Task 8 新增）對所有分頁都顯示，包含 `.html`——點了也沒有效果，但這是誤導性 UI。修正：`.html` 分頁只顯示 View 按鈕（或乾脆不顯示整排按鈕，因為只有一種模式可選沒有意義）。
2. **Mode 按鈕在 `encoding` 判定出來之前就可以點擊**：`Tab.encoding` 預設 `'utf-8'`，在 `GET /api/file` 回應抵達前，Edit/Split 按鈕是可點的（雖然 `TabContent` 的 `effectiveMode` 覆寫機制保證真的是非 UTF-8 檔案時不會真的進入編輯模式，這不是資安或資料損毀問題，純粹是 UI 觀感——按鈕會顯示「已選取編輯模式」但畫面其實還是唯讀）。修正：Edit/Split 按鈕在 `tab.content === null`（尚未載入完成）時 disabled。
3. **Split 模式或 View 模式下 `Ctrl+S` 沒有效果，觸發瀏覽器原生存檔對話框**：目前 `Ctrl+S` 監聽只綁在 `MarkdownEditor` 的 `<textarea>` 上，焦點在 Split 的預覽欄或 View 模式時完全没有 keydown 監聽，使用者按 `Ctrl+S` 會跳出瀏覽器「儲存網頁」對話框——這正是 spec 要求 `preventDefault()` 要避免的情況，只是目前只在編輯框內有效，其他地方沒有。修正：在 `TabContent` 或 `App.tsx` 層級加一個涵蓋整個內容區（不只 textarea）的 `keydown` 監聽，統一攔截 `Ctrl+S`/`Cmd+S` 並呼叫 `onSave`（不論目前是哪個模式、焦點在哪裡），避免重複攔截(若 `MarkdownEditor` 自己的監聽已經處理過，這裡不需要重複呼叫——用 `event.defaultPrevented` 檢查或直接把 `MarkdownEditor` 自己的 keydown 監聽整個移除、統一由外層處理，實作者自行判斷哪種改動更小)。

- [ ] **Step 1-6:** 每項各自寫失敗測試、確認失敗、實作、確認通過；三項合併一次 review + commit 即可（都是小修正，不需要各自獨立跑一輪 review 流程）。

---

## Definition of Done

- [ ] `npm run lint`, `npm run typecheck:frontend`, `npm run test:frontend`, `npm run test:unit`, `npm run test:integration`, `npm run build` all pass
- [ ] Opening a `.puml`/`.plantuml` file shows raw source + hint when the send-to-server setting is off, and a rendered image when it's on
- [ ] Opening a `.mmd` file renders it as a Mermaid diagram in view mode, not literal text
- [ ] Editing a file in one browser tab and having another (or the same) client externally modify the file on disk triggers either an automatic reload (non-dirty tab) or a safe no-op (dirty tab) via the WebSocket connection — verified with a real two-client scenario, not just unit tests
- [ ] Opening a file larger than the size threshold shows a "file too large" message instead of attempting to render or edit it
- [ ] A non-UTF-8 file's tab visibly indicates it's not UTF-8
- [ ] `Ctrl+S` works regardless of which part of the content area has focus, in every view mode
- [ ] Mode-toggle buttons are hidden/disabled where they'd be misleading (`.html` files, files still loading)
