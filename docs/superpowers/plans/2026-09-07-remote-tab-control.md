# CLI/REST 遠端控制分頁 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 這是使用者在 session 中途提出的需求，直接命中本專案最初的核心動機——「在 SSH 環境用 AI 寫文件，看不到即時渲染結果」。讓 CLI（給 AI/腳本用）跟 REST API 可以遠端開啟/關閉/列出前端的分頁，這樣 AI 在 SSH 裡新增一個檔案後，執行一個指令，正在瀏覽器裡看著的使用者就能立刻看到那個檔案，不用自己去側邊欄找。

**追加需求（同一輪提出）：`open` 只能開已設定 root 底下的檔案，不能自動擴大權限範圍。** 如果 AI 想開的檔案不在任何一個目前已設定的 root 資料夾底下，`open` 指令**不能**自動把那個資料夾偷偷加進 root 清單再打開——那等於指令悄悄擴大了 daemon 對磁碟的讀寫範圍，是一個資安邊界問題，不能當副作用發生。正確行為：`open` 失敗，明確告訴使用者「這個路徑不在任何已設定的 root 底下，請先執行 `add-root <資料夾>`」。這代表本計畫也必須提供「動態新增 root 資料夾」的 CLI/REST 能力（見 Task 3）——目前架構下 root 清單只能在 `start --root ...` 啟動當下決定，daemon 執行期間完全沒有新增 root 的手段。

**Architecture 上的關鍵決定：分頁狀態從「純前端 local state」變成「daemon 端共享狀態」**

目前「分頁（tabs）」100% 活在 `App.tsx` 的 React state 裡，後端完全不知道誰開了什麼檔案。要讓 CLI 能命令前端顯示某個檔案，daemon 需要多一層輕量的「目前開啟中檔案」共享狀態：

- 存在記憶體即可（一個 `Set`/`Map`，key 是 `${rootId}:${relPath}`），**不寫進 config.json**——這是執行期狀態，跟 chokidar watcher 的狀態同一類，daemon 重啟後清空是預期行為，不是 bug
- 這個狀態是**雙向同步**的：CLI/REST 呼叫會改變它並透過既有的 WebSocket（`ws-server.js` 早在 Plan 2 就建好、`broadcast()` 方法已經存在，只是從來沒人真正呼叫過）廣播給所有連線中的瀏覽器；反過來，使用者在瀏覽器裡自己點開/關閉分頁，前端也要呼叫同一組 REST API 把這個共享狀態同步回 daemon——這樣 `md-viewer-server tabs`（列出清單）指令才會反映「真正」開啟中的分頁，而不是只反映「CLI 曾經開過的」那個較窄的子集
- 草稿（`useDraft`，localStorage）維持純前端、不同步——這是「這個瀏覽器分頁還沒存檔的編輯內容」，跟「哪些檔案目前被視為開啟中」是兩個不同概念，不需要一起同步

**與既有/並行工作的關係：**

- `docs/superpowers/plans/2026-09-07-main-content-view-gaps.md` 的 Task 3（WebSocket 前端消費端，`useFileWatcher` hook）如果先做完，這個 plan 的 Task 7（前端接線）應該**擴充那個 hook**去處理 `tab-opened`/`tab-closed`/`root-added` 事件，而不是另外建一個獨立的 WebSocket 連線——一個瀏覽器分頁沒有理由對同一個 daemon 開兩條 WS 連線。若這個 plan 先執行，則反過來：Task 7 建立的 WS 消費機制，之後 main-content-view-gaps.md 的 Task 3 要擴充這一個，不要重建。**執行順序不強制，但兩個 plan 的 WebSocket 客戶端邏輯最終必須合併成一個 hook，實作者請先檢查對方的 plan 是否已經跑過，避免重複建設。**
- 檔案在後端被刪除時分頁要標記唯讀（使用者在 brainstorm 時提出的另一個需求）也歸在 `main-content-view-gaps.md` 的 Task 3 範圍——那是 `file-removed` 事件的處理，跟這裡的 `tab-opened`/`tab-closed` 是同一個 WebSocket 連線上的不同事件類型，一起做。

**Tech Stack:** 沿用既有 Node.js + Express 後端、React + TypeScript 前端，不新增套件。

## Global Constraints

- CLI 指令是 REST API 的薄包裝，不要另外兜一套邏輯——跟現有 `stop`/`--rotate-token` 指令呼叫執行中 daemon 自己 HTTP API 的既有模式一致（讀 `src/server/commands/stop.js` 參考這個模式：`readConfig(getConfigDir())` 拿到 `port`/`token`，直接 `fetch('http://127.0.0.1:${port}/api/...')`）
- `open` 指令吃的是路徑（相對某個已設定的 root，或絕對路徑經比對後屬於某個 root），不做檔名模糊搜尋，因為 AI 剛建立的新檔案在「已開啟檔案清單」裡本來就找不到，只能靠路徑本身定位；`close` 指令允許只給檔名，因為使用情境是「憑印象關掉一個目前開著的分頁」，撞到多個同名分頁時要求補完整路徑，不可以自己猜一個關掉
- `entry.js` 目前的 `createApp(...)` 呼叫發生在 `createWsServer(...)` 之前（`wsServer` 要等 `server.listen()` 的 callback 裡才建立），但這個 plan 的 REST 路由（開/關分頁、新增 root）需要呼叫 `wsServer.broadcast(...)`，新增 root 還需要呼叫 watcher 的「開始監控這個新目錄」方法——這是一個先有雞還是先有蛋的初始化順序問題。Task 1 用一個可變的參照物件解決：`const daemonControl = { broadcast: () => {}, addRootWatch: () => {} }`，先把這個空殼傳進所有需要它的 router，等真正的 `wsServer`（Task 1）建立好之後才把兩個方法接上實作——路由程式碼呼叫的一律是 `daemonControl.broadcast(...)`/`daemonControl.addRootWatch(...)`，不用管當下 `wsServer` 是否已經存在
- Commit 規範（`CLAUDE.md`）：一個邏輯段落一個 commit，Why/What/How 三段式；UI 段落標註 `[UI CHECKPOINT]`
- Review 方式：`CLAUDE.md` 目前規定不使用 Codex，一律 dispatch Claude sonnet/opus reviewer subagent（不用 haiku）

---

## File Structure

```
src/server/
├── open-tabs.js                    ← 新建：記憶體內的開啟中分頁集合（純函式 + 一個 Map 實例）
├── api/
│   ├── tabs.js                        ← 新建：GET/POST/DELETE /api/tabs
│   └── roots.js                          ← 修正：新增 POST /api/roots（動態新增 root）（Modify，既有 GET 不變）
├── app.js                                ← 修正：接上 tabs router + daemonControl 參照（Modify）
├── entry.js                                 ← 修正：daemonControl 接線（Modify）
├── config.js                                   ← 修正：新增 `appendRoot(configDir, rootPath)` 持久化（Modify）
├── watcher.js                                     ← 修正：`createWatcher` 回傳值新增 `addRoot(root)` 方法（Modify）
└── commands/
    ├── add-root.js                                    ← 新建：`add-root <path>` CLI 邏輯
    ├── open-file.js                            ← 新建：`open <path>` CLI 邏輯（路徑→root 比對 + 呼叫 REST）
    ├── close-file.js                              ← 新建：`close <path>` CLI 邏輯（含同名消歧義）
    ├── list-tabs.js                                  ← 新建：`tabs` CLI 邏輯
    └── cli-args.js                                      ← 修正：新增 `add-root`/`open`/`close`/`tabs` 指令解析（Modify）

bin/cli.js                                                    ← 修正：接上四個新指令（Modify）

src/frontend/
├── hooks/
│   └── useFileWatcher.ts（若 main-content-view-gaps.md Task 3 已存在則擴充，否則這裡新建最小版本）
└── App.tsx                                                       ← 修正：openFile/closeTab 同步呼叫 REST + 監聽遠端事件 + 復原按鈕 + 新 root 出現時刷新 Sidebar（Modify）

tests/unit/server/
├── open-tabs.test.js
├── add-root.test.js
├── open-file.test.js
├── close-file.test.js
└── list-tabs.test.js

tests/integration/
├── api-tabs.test.js
└── api-roots.test.js（既有，擴充 POST 案例）

tests/frontend/
└── App.test.tsx（既有，擴充）
```

---

### Task 1: 後端 — 記憶體內開啟中分頁集合 + `daemonControl` 接線

**Files:**
- Create: `src/server/open-tabs.js`
- Modify: `src/server/entry.js`
- Test: `tests/unit/server/open-tabs.test.js`

**Interfaces:**
- `createOpenTabsRegistry()` → `{open(rootId, relPath), close(rootId, relPath), list(): Array<{rootId, relPath}>}`——純粹的記憶體 Map 包裝，`open` 對已存在的項目是 no-op（不重複），`close` 對不存在的項目也是 no-op（不報錯）
- `entry.js` 建立一個 `daemonControl = { broadcast: () => {}, addRootWatch: () => {} }` 物件，傳進 `createApp(...)`；`wsServer` 建立完成後執行 `daemonControl.broadcast = wsServer.broadcast.bind(wsServer)`。`addRootWatch` 留給 Task 3（動態新增 root）接線，這個 task 先建好空殼即可，不需要在這裡就實作真正的邏輯

- [ ] **Step 1: 寫失敗測試**

```js
import { describe, it, expect } from 'vitest'
import { createOpenTabsRegistry } from '../../../src/server/open-tabs.js'

describe('createOpenTabsRegistry', () => {
  it('starts empty', () => {
    expect(createOpenTabsRegistry().list()).toEqual([])
  })

  it('open adds an entry; list reflects it', () => {
    const registry = createOpenTabsRegistry()
    registry.open(0, 'a.md')
    expect(registry.list()).toEqual([{ rootId: 0, relPath: 'a.md' }])
  })

  it('open is idempotent (no duplicate entries)', () => {
    const registry = createOpenTabsRegistry()
    registry.open(0, 'a.md')
    registry.open(0, 'a.md')
    expect(registry.list()).toHaveLength(1)
  })

  it('close removes an entry', () => {
    const registry = createOpenTabsRegistry()
    registry.open(0, 'a.md')
    registry.close(0, 'a.md')
    expect(registry.list()).toEqual([])
  })

  it('close on a non-existent entry is a no-op, not an error', () => {
    const registry = createOpenTabsRegistry()
    expect(() => registry.close(0, 'nope.md')).not.toThrow()
  })

  it('distinguishes entries by both rootId and relPath', () => {
    const registry = createOpenTabsRegistry()
    registry.open(0, 'a.md')
    registry.open(1, 'a.md')
    expect(registry.list()).toHaveLength(2)
  })
})
```

- [ ] **Step 2-3:** 確認失敗、實作（`Map` 用 `${rootId}:${relPath}` 當 key，value 存 `{rootId, relPath}`）。

- [ ] **Step 4: 接上 `entry.js` 的 `daemonControl`**

讀取 `entry.js` 目前 `createApp`/`createWsServer` 的實際呼叫順序（本文件開頭已經描述了目前的順序問題），依 Global Constraints 描述的參照物件模式接線。這個 step 本身不需要新測試——它的正確性由 Task 2（REST API）、Task 3（動態新增 root）跟 Task 7（前端接線）的 integration 測試間接驗證。

- [ ] **Step 5-6:** 執行測試確認通過、dispatch reviewer subagent、Commit。

---

### Task 2: 後端 — `GET/POST/DELETE /api/tabs`

**Files:**
- Create: `src/server/api/tabs.js`
- Modify: `src/server/app.js`
- Test: `tests/integration/api-tabs.test.js`

**Interfaces:**
- `GET /api/tabs` → `200 [{rootId, relPath}, ...]`
- `POST /api/tabs`，body `{root: number, path: string}` → 呼叫 `resolveSafePath`（跟 `file.js`/`file-path.js` 同一套既有的路徑安全邏輯，防止用這個 API 間接探測 root 外的路徑）驗證後，`registry.open(root, path)` + `broadcaster.broadcast({type: 'tab-opened', rootId, relPath})`，回 `201 {rootId, relPath}`；root 不存在回 `404 {errorCode: 'ROOT_NOT_FOUND'}`；路徑不安全回 `400 {errorCode: 'UNSAFE_PATH'}`——**注意：`open` 不要求檔案已存在**（AI 可能是在檔案寫入完成前一刻就想讓分頁先出現，或者前端自己會在收到 `tab-opened` 事件後才真正呼叫 `GET /api/file` 讀取內容，讀不到就走既有的 `TabContent` loadError 分支，不是這個 API 該擋的事）
- `DELETE /api/tabs`，body `{root: number, path: string}` → `registry.close(root, path)` + `broadcaster.broadcast({type: 'tab-closed', rootId, relPath})`，回 `200 {}`（`close` 對不存在的項目也回 200，冪等）

- [ ] **Step 1-6:** 寫失敗測試（涵蓋上述所有分支 + 401 未授權案例，比照既有 `tests/integration/api-*.test.js` 的建置慣例）、確認失敗、實作、確認通過、dispatch reviewer subagent、Commit。

---

### Task 3: 後端 + CLI — 動態新增 root 資料夾

**Files:**
- Modify: `src/server/api/roots.js`（新增 `POST /api/roots`，既有 `GET` 不變）
- Modify: `src/server/config.js`（新增 `appendRoot(configDir, rootPath)`）
- Modify: `src/server/watcher.js`（`createWatcher` 回傳值新增 `addRoot(root)`）
- Modify: `src/server/entry.js`（把 `daemonControl.addRootWatch` 接上 watcher 的 `addRoot`）
- Create: `src/server/commands/add-root.js`
- Modify: `src/server/commands/cli-args.js`、`bin/cli.js`
- Test: 擴充 `tests/integration/api-roots.test.js`
- Test: `tests/unit/server/add-root.test.js`
- Test: `tests/unit/server/watcher.test.js`（若不存在則新建，只測 `addRoot` 這個新方法）

**Interfaces:**
- `POST /api/roots`，body `{path: string}`：驗證路徑存在且可讀（沿用 `start.js` 既有的 `validateRoots` 邏輯，或直接呼叫它——不要重寫一份）；拒絕跟現有任一 root 完全相同或互為子目錄的路徑（避免同一批檔案被兩個 root id 重複收錄，造成分頁/搜尋結果混亂）；驗證通過後：(1) push 進共享的 `roots` 陣列（原地 mutate，讓所有既有 router 立刻透過既有的 by-reference 讀取方式看到新 root，不需要逐一通知）、(2) 呼叫 `appendRoot(configDir, path)` 寫回 `config.json` 使其在下次啟動後仍然存在、(3) 呼叫 `daemonControl.addRootWatch(newRoot)` 讓 chokidar 開始監控這個新目錄、(4) 呼叫 `daemonControl.broadcast({type: 'root-added', rootId, name})` 通知所有連線中的瀏覽器。成功回 `201 {id, name}`；路徑不存在/不可讀回 `400 {errorCode: 'INVALID_ROOT_PATH'}`；跟既有 root 重疊回 `409 {errorCode: 'ROOT_OVERLAPS_EXISTING'}`
- `createWatcher(...)` 回傳值新增 `addRoot(root)`：對這一個新 root 建立並啟動一個 chokidar watcher（複製既有 `roots.map(...)` 迴圈裡單一 root 的建置邏輯，抽成一個可重複呼叫的內部函式，供初始化跟這個新方法共用，不要複製貼上兩份一樣的 watcher 設定），加進內部的 `watchers` 陣列，讓 `close()` 也能正確關掉它
- `runAddRoot(path, {configDir}): Promise<{outcome: 'added', rootId, name} | {outcome: 'invalid-path'} | {outcome: 'overlaps-existing', existingRootId} | {outcome: 'not-running'} | ...>`——CLI 端的薄包裝，呼叫 `POST /api/roots`

**這個 task 不需要處理「移除 root」**——使用者這次只要求新增，移除 root（等於要決定「移除時已開啟的分頁怎麼辦」這種更複雜的問題）明確排除在本計畫範圍外，需要的話再開新 task。

- [ ] **Step 1-8:** 寫失敗測試（涵蓋成功新增、路徑不存在、與既有 root 重疊、`GET /api/roots` 之後能看到新項目、新 root 底下的檔案異動確實會觸發既有的 WebSocket file-changed 事件——證明 watcher 真的開始監控了，不是只有記憶體清單多一筆）、確認失敗、實作、確認通過、dispatch reviewer subagent、Commit。

在 `bin/cli.js` 加入 `add-root <path>` 的指令分派。

---

### Task 4: CLI — `open <path>` 指令

**Files:**
- Create: `src/server/commands/open-file.js`
- Modify: `src/server/commands/cli-args.js`
- Modify: `bin/cli.js`
- Test: `tests/unit/server/open-file.test.js`
- Test: 擴充 `tests/integration/cli-lifecycle.test.js`

**Interfaces:**
- `resolvePathToRoot(inputPath: string, roots: Array<{id, path}>): {rootId, relPath} | null`——純函式：把使用者輸入的路徑（可能是絕對路徑，也可能是相對於目前工作目錄的相對路徑）比對到某一個已設定的 root，算出該 root 下的相對路徑；比對不到任何 root（路徑不在任何已設定的 root 底下）回傳 `null`
- `runOpenFile(inputPath, {configDir, cwd}): Promise<{outcome: 'opened', rootId, relPath} | {outcome: 'not-configured'} | {outcome: 'not-running'} | {outcome: 'path-outside-roots'}>`——讀 config 拿到 daemon 的 port/token/roots，用 `resolvePathToRoot` 算出目標，呼叫 `POST /api/tabs`。**`path-outside-roots` 這個結果不會自動呼叫 Task 3 的 `add-root`**——`open` 跟「擴大 daemon 的磁碟存取範圍」是兩件不該被同一個指令悄悄綁在一起的事，`bin/cli.js` 收到這個結果時明確印出類似「路徑不在任何已設定的 root 底下，請先執行：`md-viewer-server add-root <資料夾>`」的訊息，由使用者（或呼叫這個 CLI 的 AI agent）自己決定要不要真的擴大範圍，再重下 `open`

- [ ] **Step 1-6:** 寫失敗測試（`resolvePathToRoot` 的純函式測試涵蓋絕對路徑/相對路徑/不屬於任何 root 三種情況；`runOpenFile` 的測試比照 `stop.js`/`start.js` 既有測試對「daemon 沒在跑」等情境的處理方式；額外驗證 `path-outside-roots` 時**不會**發生任何 `POST /api/roots` 呼叫——這是這個 task 唯一需要特別鎖住的「不做什麼」的行為）、確認失敗、實作、確認通過、dispatch reviewer subagent、Commit。

在 `bin/cli.js` 加入 `open <path>` 的指令分派，`path-outside-roots` 結果印出上述提示訊息，其餘結果印出結果（比照 `printStartResult` 等既有函式的風格）。

---

### Task 5: CLI — `close <path>` 指令（含同名消歧義）

**Files:**
- Create: `src/server/commands/close-file.js`
- Modify: `bin/cli.js`
- Test: `tests/unit/server/close-file.test.js`

**Interfaces:**
- `runCloseFile(inputPath, {configDir}): Promise<{outcome: 'closed', rootId, relPath} | {outcome: 'ambiguous', candidates: Array<{rootId, relPath}>} | {outcome: 'not-found'} | ...>`——先呼叫 `GET /api/tabs` 拿到目前開啟中清單；若 `inputPath` 本身能透過 `resolvePathToRoot`（沿用 Task 4 的函式）明確算出 `{rootId, relPath}`，直接關閉那一筆（不需要模糊比對，使用者給了完整路徑就照字面辦事）；若 `inputPath` 算不出明確的 root（例如使用者就是只打了一個裸檔名，不構成任何 root 下的有效相對路徑），改成比對「目前開啟清單裡，`relPath` 的檔名部分（`path.basename`）等於 `inputPath`」——0 筆回 `not-found`，1 筆直接關閉，多筆回 `ambiguous` 並附上完整候選路徑清單，CLI 印出來要求使用者用完整路徑重下指令

- [ ] **Step 1-6:** 寫失敗測試（涵蓋明確路徑/裸檔名唯一命中/裸檔名多筆命中三種情況）、確認失敗、實作、確認通過、dispatch reviewer subagent、Commit。

---

### Task 6: CLI — `tabs` 列出清單指令

**Files:**
- Create: `src/server/commands/list-tabs.js`
- Modify: `bin/cli.js`
- Test: `tests/unit/server/list-tabs.test.js`

**Interfaces:** `runListTabs({configDir}): Promise<{outcome: 'listed', tabs: Array<{rootId, relPath}>} | {outcome: 'not-running'} | ...>`——單純呼叫 `GET /api/tabs`，`bin/cli.js` 印成人類可讀的清單（每行一筆，帶上 root 名稱而不只是 rootId，方便閱讀——需要額外呼叫 `GET /api/roots` 拿到 `{id, name}` 對照）

- [ ] **Step 1-4:** 寫失敗測試、確認失敗、實作、確認通過、dispatch reviewer subagent、Commit。

---

### Task 7: 前端 — 分頁開關雙向同步 + 遠端事件接線

**Files:**
- Modify: `src/frontend/App.tsx`
- Modify: `src/frontend/hooks/useFileWatcher.ts`（若 `main-content-view-gaps.md` Task 3 已存在則擴充；否則這個 task 建立最小版本，之後那邊的 Task 3 再擴充成處理 `file-changed`/`file-added`/`file-removed`）
- Test: 擴充 `tests/frontend/App.test.tsx`、`tests/frontend/useFileWatcher.test.ts`

**Interfaces:**
- `useFileWatcher` 新增分派 `onTabOpened(rootId, relPath)`/`onTabClosed(rootId, relPath)`/`onRootAdded(rootId, name)` 三個 callback（跟既有/未來的 `onFileChanged` 等並列，同一條 WS 連線依 `event.type` 分派）
- `App.tsx` 的 `openFile`：除了既有的本地 `setTabs` 邏輯，額外呼叫 `POST /api/tabs`（fire-and-forget 即可，不需要等它回應才更新本地 UI——本地互動要即時反應，遠端同步失敗不該卡住使用者；失敗時安靜記錄，不用跳錯誤訊息，這只是「讓 CLI 看得到」的輔助功能，不是核心存檔流程）
- `App.tsx` 的 `closeTab`：額外呼叫 `DELETE /api/tabs`（同樣 fire-and-forget）
- 收到遠端 `tab-opened` 事件：若本地還沒有這個分頁，呼叫既有的 `openFile` 邏輯開一個（**不要**因為遠端事件又重複呼叫一次 `POST /api/tabs`，否則會形成廣播迴圈——`openFile` 需要一個內部旗標區分「使用者本地操作觸發」跟「收到遠端事件後同步觸發」，只有前者才呼叫 REST API）
- 收到遠端 `tab-closed` 事件：若本地有這個分頁，關閉它（同樣不要重複呼叫 `DELETE /api/tabs`）
- 收到遠端 `root-added` 事件（來自 Task 3 的 `add-root`）：把新 root 加進 `roots` state，讓 `FileTreePanel` 立刻看得到（不需要整個重新 `GET /api/roots`，直接把事件帶的 `{rootId, name}` append 進現有陣列即可）

- [ ] **Step 1-8:** 寫失敗測試（涵蓋本地開關會呼叫對應 REST API、遠端事件會反映到本地分頁清單、遠端事件不會造成廣播迴圈、`root-added` 事件會讓新 root 出現在 `roots` state 這四類案例）、確認失敗、實作、確認通過、dispatch reviewer subagent、Commit（`[UI CHECKPOINT]`）。

---

### Task 8: 前端 — 誤關閉復原按鈕

**Files:**
- Modify: `src/frontend/App.tsx`
- Test: 擴充 `tests/frontend/App.test.tsx`

**Interfaces:** `closeTab` 時把被關閉分頁的 `{rootId, relPath, title}` 存進一個 `lastClosedTab` state（只保留最近一筆，不做多層 undo 堆疊——YAGNI，多層復原的價值遠低於複雜度）；畫面右下角顯示一個「復原」提示，5 秒後自動消失（用一個 `setTimeout` 清空 `lastClosedTab`）；點擊「復原」呼叫既有 `openFile(rootId, relPath)` 重新開啟，並立刻清空 `lastClosedTab`（避免同一個提示被按兩次）

- [ ] **Step 1-6:** 寫失敗測試（關閉分頁後提示出現、5 秒後自動消失、點擊復原重新開啟分頁、點擊後提示立刻消失）、確認失敗、實作、確認通過、dispatch reviewer subagent、Commit（`[UI CHECKPOINT]`）。

---

## Definition of Done

- [ ] `npm run lint`, `npm run typecheck:frontend`, `npm run test:frontend`, `npm run test:unit`, `npm run test:integration`, `npm run build` all pass
- [ ] `md-viewer-server open <path>` for a path outside every configured root does NOT open anything and does NOT modify the root list — it prints an instruction to run `add-root` first
- [ ] `md-viewer-server add-root <dir>` on a running daemon makes that directory's files immediately browsable (sidebar) and editable (file API) in every connected browser without a restart, and the daemon watches it for live-update events (verified with a real file change inside the newly added root triggering a `file-changed` WS event)
- [ ] `add-root` persists to `config.json`, so a subsequent restart still serves it without re-specifying `--root`
- [ ] `add-root` rejects a path that doesn't exist/isn't readable, and rejects a path that duplicates or nests inside an already-configured root
- [ ] `md-viewer-server open <path>` while the daemon is running and a browser is connected causes that file to appear as an open tab in the browser within roughly one WebSocket round-trip, with no page reload
- [ ] `md-viewer-server close <path>` (full path) closes the matching tab in every connected browser; a bare filename that matches more than one open tab reports the candidates instead of guessing
- [ ] `md-viewer-server tabs` lists exactly the files currently open across all connected browsers (not just ones opened via CLI) — verified by opening one file via the browser UI and one via `open`, then confirming `tabs` shows both
- [ ] Manually closing a tab in the browser shows an undo affordance for a few seconds; clicking it reopens the same file
- [ ] No broadcast feedback loop: opening/closing a tab via the browser does not cause the browser's own WebSocket handler to redundantly re-open/re-close it
