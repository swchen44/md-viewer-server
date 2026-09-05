# MD Viewer Server — 設計規格

日期：2026-09-05

## 背景與動機

使用者平常在 Windows 用 SSH 連線到 Linux terminal，在 SSH 裡用 AI 寫 markdown/html 檔案，但 SSH 純文字環境沒辦法立即看到渲染結果。目標是做一個工具解決這個痛點：一個跑在 Linux 上的背景 daemon，前端用 Windows 上的 Chrome 瀏覽器連線去檢視、搜尋、編輯這些檔案。

參考了兩個既有專案的功能定位（本專案是全新實作，不是 fork）：

- **md-reader (MD Reader Lite)**：Chrome 擴充功能，隱私優先、離線優先，本地渲染 markdown/html/mermaid/plantuml，資料夾樹側邊欄、outline(TOC) 側邊欄，分類式設定選單，支援多種 markdown 副檔名。
- **md-viewer-pwa (MD View)**：純 client-side React+Vite PWA，multi-tab、檢視/編輯/Split 三模式、Shiki 語法高亮、Mermaid、PDF/文字匯出、File System Access API、accent color、light/dark 主題。

## 目標與非目標

**目標**：
- 在 Linux 上跑一個背景 daemon（`start`/`stop`/`status`），Windows Chrome 連線後可檢視、搜尋、線上編輯指定資料夾內的文件
- 檔案變動（不論是 SSH 裡 AI 寫的，還是瀏覽器裡編輯的）都能即時反映在所有連線的瀏覽器上
- 公司內網無法連外的環境下也能安裝、不需要 root 權限

**非目標**（本次不做，見文末「範圍外」）：
- 版本歷史 / undo（只做可選的單層 `.bak` 備份）
- 多人協作即時共編（同一檔案多人編輯走「後寫入者衝突提示」，不做 CRDT/OT）
- 手機 App 等級的完美 RWD（只求窄螢幕基本可用）

## 整體架構

```
md-viewer-server/                  ← 單一 npm 套件
├── bin/cli.js                     ← start / stop / status 指令入口
├── src/server/                    ← Express + ws 後端
│   ├── daemon.js                  ← detached child_process 管理、pid/log 檔
│   ├── api/                       ← REST API（檔案清單、讀寫、搜尋、資源）
│   ├── watcher.js                 ← chokidar 監控 root 資料夾 → WebSocket 推播
│   └── auth.js                    ← token 驗證 middleware
├── src/frontend/                  ← Vite + React SPA（build 成靜態檔）
│   └── dist/                      ← server 直接 serve 這裡
└── ~/.md-viewer-server/           ← 執行期資料（使用者自己可寫的路徑，不需要 root）
    ├── config.json                ← 固定 token、port、roots 清單
    ├── server.pid
    └── server.log                 ← 全英文
```

**技術選型**：Express（REST）+ `ws`（WebSocket）+ `chokidar`（跨平台檔案監控）。三者皆為純 JS 實作，沒有 native module，方便打包成單一 bundle（見「發佈與安裝」）。前端沿用 md-viewer-pwa 的 UI 概念（Tab bar、Split view、Shiki、Mermaid）但資料存取層改成打 server API，取代 File System Access API；資料夾樹＋搜尋欄互動參考 md-reader。

## 發佈與安裝

前提：目標 Linux 機器確定有 Node.js 執行環境；安裝時假設使用者**沒有 root 權限**，且環境可能**完全無法連外**（無法 `npm install`）。

- 用 `esbuild` 把 server 端程式碼與所有 npm 依賴（express/ws/chokidar 皆純 JS）打包成單一 `bundle.js`，不依賴 `node_modules` 目錄
- 發佈物：`md-viewer-server-<version>.tar.gz`，內含 `bundle.js` + build 好的前端靜態檔 + 一個 shell wrapper script
- 安裝方式：解壓縮到使用者自己 home 目錄下任意路徑（例如 `~/tools/md-viewer-server/`），執行 `./md-viewer-server start --root ...`（wrapper 內部呼叫 `node bundle.js "$@"`）。全程不需要 `npm install`、不需要系統權限
- daemon 執行期資料本來就落在 `~/.md-viewer-server/`，與「無 root」的假設天生相容
- 更新版本：下載新版 tar.gz 解壓縮覆蓋，`stop` 舊的、`start` 新的，不透過 npm registry
- 同時仍發佈到 npm registry，給網路暢通的環境用 `npx md-viewer-server` 直接執行

## Daemon 生命週期管理

CLI 指令：

- `start --root <path> [--root <path2> ...] [--port 4173]`
  1. 讀取/建立 `~/.md-viewer-server/config.json`（含固定 token、port、roots 清單）
  2. 讀 `server.pid`，用 `process.kill(pid, 0)` 探測是否已有存活程序 → 有就印出現有連結與狀態、直接結束，**不重啟**
  3. 檢查每個 `--root` 是否存在且可讀；不存在/無權限的 root 略過並印警告，其餘 root 正常啟動（只要至少一個 root 有效）
  4. 檢查 port 是否被佔用；被佔用就印錯誤並結束，**不自動改用其他 port**（避免每次連結網址不一致）
  5. `spawn(node, [bundlePath], {detached:true, stdio:'ignore'}).unref()`，寫入 `server.pid`
  6. 偵測本機所有網卡 IP，列出候選連結（含 token）供使用者選擇正確的區網 IP；印出 `http://<ip>:<port>?token=<4位數字>`
- `status`：讀 pid 檔並探活，活著就重印連結、root 清單、port；死了就印「未執行」
- `stop`：對 pid 送 `SIGTERM`；收到訊號後 server 端 graceful shutdown（見下）；等待程序結束後清除 pid 檔
  - **Graceful shutdown**：停止接受新的 HTTP/WS 連線、對所有連線中的前端推播「伺服器即將關閉」事件（前端據此提示使用者存檔）、等待進行中的寫入請求完成（有逾時上限）、關閉 chokidar watcher、結束程序

## 認證與安全性

- token 為 4 位數字，產生後存在 `config.json`，重啟不換（除非之後手動提供 `--rotate-token`）
- **刻意不做防暴力破解**（同區網環境，使用者評估風險可接受）
- **token 傳遞與洩漏面**：`start`/`status` 印出的連結帶 `?token=xxxx` 方便使用者直接點擊/貼上。前端進站驗證成功後：
  - 立即用 `history.replaceState` 把網址列上的 `token` 參數清掉，降低留在瀏覽器歷史記錄的機會
  - 把 token 存進 `sessionStorage`，之後所有 REST API 呼叫改用 `X-Auth-Token` header 傳遞
  - WebSocket handshake 仍必須用 query string 帶 token（協定限制），這是已知取捨並在文件中註明
- **`.html` 檔案是實質安全風險**（不是「內網」這個取捨能涵蓋的）：AI 產出的 html 若含 `<script>`，在同源環境執行時可讀取 `sessionStorage` 裡的 token、直接打後端 API。因應設計：
  - html 一律用 `<iframe sandbox="allow-scripts">` 顯示，**不給 `allow-same-origin`**——即使允許執行 script，sandboxed iframe 在缺少 `allow-same-origin` 時會被視為獨立的 opaque origin，無法讀取 parent 頁面的 `sessionStorage`／無法帶著身份對後端 API 發請求
  - 設定選單提供「允許 html 檔案執行 script」開關，**預設關閉**（關閉時 iframe 完全不給 `allow-scripts`，只顯示排版後的靜態內容）
  - 隱私模式開啟時，此開關**強制鎖定為關閉**，不論使用者原本設定為何（UI 上該選項顯示為 disabled）
- **路徑安全**：所有檔案操作 API 用 `root 編號 + root 內相對路徑` 定址，後端一律先 `path.resolve` 再檢查結果是否仍在該 root 目錄底下（防 `../` 跳出），並對 symlink 目標做同樣檢查（防 symlink 逃逸）

## 後端 API 設計

**檔案定址規則**：所有 API 用 `root=<編號>&path=<root 內相對路徑>` 指定檔案，多 root 情況下前端一律要標明來源 root。

**REST API**（除 WebSocket handshake 外，皆需要 `X-Auth-Token` header）：

| Method & Path | 用途 |
|---|---|
| `GET /api/roots` | 列出所有 root（編號、顯示名稱），前端用來決定是否顯示 root 分層 |
| `GET /api/files?root=` | 列出該 root 下所有符合副檔名的檔案（樹狀結構，含相對路徑、大小、mtime） |
| `GET /api/file?root=&path=` | 讀取檔案內容，回傳 `{content, mtime, encoding}`；非 UTF-8 檔案標記 `encoding` 供前端提示唯讀 |
| `PUT /api/file?root=&path=` | 寫入檔案內容，body `{content, mtime, force?}`。寫入前重新比對目前檔案 mtime：一致才寫入（先寫暫存檔再 `rename`，保證原子性），不一致回 `409` 並附最新內容；`force=true` 略過比對直接覆蓋。若設定啟用 `.bak` 備份，寫入前把舊內容另存一份 `<file>.bak`（只保留最新一份，非多版本歷史） |
| `POST /api/file?root=&path=` | 新建空檔案 |
| `DELETE /api/file?root=&path=` | 刪除檔案 |
| `POST /api/rename` | body `{root, from, to}`，重新命名/搬移 |
| `POST /api/mkdir?root=&path=` | 建立資料夾 |
| `GET /api/asset?root=&path=` | 靜態資源（markdown/html 內引用的相對路徑圖片、影片等二進位內容），依副檔名決定 `Content-Type`；渲染時把文件內的相對路徑改寫成呼叫這支 API |
| `GET /api/search?q=&target=name\|content\|both&scope=all\|open&regex=&openPaths=` | 搜尋。`scope=open` 時帶上目前已開啟分頁的路徑清單，只在這些檔案內搜尋 |
| `GET /api/outline?root=&path=` | 回傳單篇文章的標題結構，供大綱側邊欄使用；大綱模式的「內文」搜尋直接在前端已載入的內容上做 |

檔案不存在、無權限、寫入失敗等一律回傳 `{errorCode: "..."}` 這種結構化錯誤碼（不是英文字串），前端依照目前語言翻譯成對應訊息顯示；後端 `server.log` 一律記錄英文原始訊息。

**WebSocket**（`/ws?token=xxxx`）：
- `chokidar.watch(root, {ignored: [/node_modules/, /\.git/], depth: <上限>})` 監控每個 root
- 事件推播：`file-changed`（內容變動）、`file-added`、`file-removed`（新增/刪除，供側邊欄檔案樹局部更新，不用整頁重整）
- server 關閉前廣播 `server-shutting-down` 事件

## 即時更新與衝突處理

- **檢視中的分頁**：收到 `file-changed` 就直接重新 `fetch` + 重新渲染（設定可關閉此自動行為，關閉後只顯示「檔案已更新」提示條，不自動換內容，避免閱讀被打斷）
- **編輯中的分頁**：收到 `file-changed` 只在分頁標題旁顯示黃點提示，不強制打斷輸入；真正的衝突判定延到存檔那一刻
- **存檔衝突（409）**：彈對話框讓使用者選「保留我的內容並覆蓋」（`force=true` 重送）或「捨棄我的，重新載入最新版」
- **草稿持久化**：編輯中內容定期自動存到 `localStorage`，瀏覽器當掉/誤關可以救回未存檔內容
- **非 UTF-8 檔案**：不支援線上編輯存檔（避免強制轉碼造成內容毀損），只能唯讀檢視，UI 標示原始編碼；設定選單的「字元集相容模式」開關可以強制以 UTF-8 重新解碼**顯示**，切換後重新整理當前分頁

## 搜尋功能

側邊欄有兩種模式，搜尋語意跟著模式切換：

- **📁 檔案模式**：範圍 `全部檔案` / `只搜已開啟分頁`；標的 `檔名` / `全文` / `兩者`；可切 regex（不合法的正規表示式在輸入框下方顯示錯誤、不送出請求）。輸入 debounce 300ms 自動觸發搜尋。全文搜尋結果列出命中行號＋文字片段（關鍵字 highlight），每檔最多顯示前 3 行命中、超過顯示「還有 N 處」；點結果開分頁並捲動定位
- **📑 大綱模式**：範圍固定為「目前作用中分頁這一篇」；標的 `標題` / `內文` / `兩者`；可切 regex；用於在單篇文章內搜尋/跳轉
- 有搜尋字串時側邊欄從樹狀圖/大綱切換成搜尋結果列表，清空輸入框時切回原本畫面

**效能上限**：全文搜尋與渲染對超過門檻大小（例如 5MB）的檔案只顯示「檔案過大，不提供全文搜尋/完整渲染」提示，避免大型 log 檔混進資料夾拖垮效能。

## 前端 UI 設計

### 整體版面骨架

```
┌─────────────────────────────────────────────────┐
│ [☰]              [🌐語言] [🌓主題] [⚙️]            │ ← 頂部列
├───────────┬─────────────────────────────────────┤
│[📁][📑]   │ Tab1│Tab2│Tab3│...│ [▾找Tab] │ + │    │ ← 側邊欄 icon tab + 分頁列
│───────────│─────────────────────────────────────│
│🔍搜尋列    │                                      │
│(依模式變化)│         主內容區                      │
│───────────│   （檢視 / 編輯 / Split 三選一）        │
│ 樹狀/大綱  │                                      │
│ 內容       │                                      │
└───────────┴─────────────────────────────────────┘
```

整體視覺語言仿 VS Code（側邊欄 icon bar、可拖曳寬度、深色主題質感）。

### 側邊欄

- 頂部兩個 icon tab 切換：📁 檔案樹 / 📑 大綱，各自帶獨立的搜尋列（見「搜尋功能」）
- 寬度可拖曳，記住「上次選的模式、拖曳過的寬度」（存 `localStorage`）
- 多個 root 時最上層依序列出每個 root 的資料夾名稱；只有一個 root 時省略這層，直接顯示該 root 內容
- 窄螢幕（RWD）下收合成覆蓋式抽屜，由頂部 `☰` 按鈕開關

### 分頁列（Tab bar）

- 延續 md-viewer-pwa 的多分頁模式，可同時開多檔案切換
- 未存檔分頁標題前加實心圓點 `● a.md` dirty 標記，存檔後恢復正常
- 分頁一多，右側提供「▾找 Tab」下拉選單列出所有已開啟分頁供快速跳轉
- 窄螢幕下分頁列可橫向捲動

### 主內容區

- 每個分頁可切換 `檢視` / `編輯` / `Split`（互斥，切一個清另一個），沿用 md-viewer-pwa 邏輯
- Split：左邊原始文字編輯，右邊即時渲染預覽
- `.html` 檔案一律用 sandboxed iframe 顯示（見「認證與安全性」）
- `.puml`/`.plantuml`：PlantUML 傳送開關關閉時顯示原始碼＋「請至設定開啟並指定 server」提示；開啟時送到設定的 PlantUML server 取得圖片
- `.mmd` 與 markdown 內的 mermaid code fence 一律前端渲染，不受隱私設定影響

### 頂部工具列

- 🌐 語言切換：下拉選單，5 語言（en / zh-TW / zh-CN / ja / ko），選擇存 `localStorage`，預設偵測瀏覽器語言
- 🌓 主題切換：light / dark / 跟隨系統
- ⚙️ 設定齒輪：開啟設定視窗

### 設定視窗

分類式設定選單（仿 md-reader），左側分類 tab：

**一般**
- 語言
- Markdown 渲染：換行風格、`.txt` 是否以 Markdown 渲染
- 檔案總管：顯示隱藏檔（`.` 開頭）、大綱側邊欄預設摺疊
- 檔案編碼：字元集相容模式（強制 UTF-8 重新解碼顯示，切換後重新整理當前分頁）
- 即時更新：「檢視中分頁自動重新載入」開關
- 編輯：「存檔時建立 `.bak` 備份」開關（預設**關閉**）
- 隱私：
  - **「隱私模式」總開關**，預設關閉。開啟時強制鎖定（disabled）以下三項為安全值，不論使用者原本個別設定為何：
    - 封鎖文件內遠端圖片/影片/iframe → 強制封鎖
    - 「傳送圖表原始碼到 PlantUML server」→ 強制關閉
    - 「允許 html 檔案執行 script」→ 強制關閉
  - 個別開關（隱私模式關閉時可自由調整）：
    - 「封鎖文件內遠端圖片/影片/iframe」開關
    - PlantUML 伺服器網址（可自架，預設 `plantuml.com`）
    - 「傳送圖表原始碼到 PlantUML server」開關，預設關閉（唯一會把文件內容送第三方的功能）
    - 「允許 html 檔案執行 script」開關，預設關閉

**外觀**
- 主題、主色調 accent color 調色盤
- 編輯器字型大小、縮排寬度

**自訂 CSS**
- CSS 編輯器，即時套用，**只作用於文章渲染區域**，不影響側邊欄/分頁列等 App 其他 UI
- 存在瀏覽器 `localStorage`，有「重設為預設值」按鈕

### 快捷鍵

- `Ctrl+S`：編輯/Split 模式下存檔（必要項目，其餘快捷鍵留給實作階段依常見編輯器慣例補充）

### RWD / 行動裝置

不追求手機 App 等級的完美適配，只求基本可用：
- 側邊欄在窄螢幕下收合為覆蓋式抽屜
- 分頁列在窄螢幕下可橫向捲動，搭配「▾找 Tab」下拉選單作為主要導覽方式
- Split 模式在窄螢幕下的呈現方式（例如退化為上下堆疊或僅檢視/僅編輯二選一）留給實作階段決定

## i18n（多國語言）

前端支援 5 種語言：英文（en）、繁體中文（zh-TW）、簡體中文（zh-CN）、日文（ja）、韓文（ko）。用 i18next 架構、語言檔可擴充，預設偵測瀏覽器語言，使用者可手動切換並存 `localStorage`。後端 API 回應一律用結構化 `errorCode`，由前端依當前語言翻譯，不回傳英文字串給 UI 顯示。

## 穩健性與邊界情況處理

- 存檔用「先寫暫存檔、再 `rename`」保證原子性，避免寫到一半損毀原檔
- 非 UTF-8 檔案不支援線上編輯存檔（見「即時更新與衝突處理」）
- chokidar 監控排除常見大目錄（`node_modules`、`.git` 等）並設監控深度上限，避免 inotify watcher 數量爆掉
- 大檔案（超過門檻大小）不提供全文搜尋/完整渲染，只顯示提示
- 新增/刪除檔案透過 WebSocket `file-added`/`file-removed` 事件，側邊欄檔案樹局部更新
- `start` 時個別 root 不存在/無權限只略過該 root 並警告，不讓整個 daemon 起不來；port 被佔用時報錯結束、不自動換 port
- 多網卡環境下列出所有候選 IP 供使用者選擇正確的連結
- `stop` 時 graceful shutdown：先廣播「即將關閉」事件讓前端提示存檔，再等待進行中請求完成（有逾時），才真正結束程序

## 測試策略

- **Unit**（Vitest）：後端純函式（token 產生、mtime 比對邏輯、副檔名過濾、路徑安全檢查、搜尋比對/regex 驗證）；前端純邏輯（i18n 格式化、tab 狀態 reducer、dirty 判斷）
- **Integration**（Vitest + supertest 等）：REST API 端到端測試（含 409 衝突情境、多 root 檔案列表、`.bak` 備份行為、path traversal 防護、搜尋 API 各種 mode）；WebSocket 推播測試（改檔案 → 驗證收到對應事件）
- **E2E**（Playwright）：完整使用情境 —— 帶 token 連線（含網址 token 清除行為）、開檔編輯存檔、模擬外部改檔觸發衝突對話框、搜尋各模式切換、側邊欄兩種模式切換、多 root 顯示、html sandbox 是否成功阻擋 script 存取 token、RWD 窄螢幕基本可用性

## 範圍外（本次不做）

- 多人即時共編（CRDT/OT），僅做後寫入者衝突提示
- 完整版本歷史／多版本 undo，僅提供可選的單層 `.bak` 備份（預設關閉）
- 手機 App 等級的完美 RWD 適配
- token 防暴力破解機制（同區網環境，使用者評估風險可接受）
- 動態新增/移除 root（root 清單於 `start` 時固定，需重啟變更）
