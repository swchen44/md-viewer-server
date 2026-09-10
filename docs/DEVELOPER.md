# Developer Guide

這份文件描述目前 repository 的實作，不是未完成的設計草稿。設計規格與 `docs/superpowers/plans/` 是開發歷史記錄；若內容與程式碼不同，以本文件、`package.json` 和目前測試為準。

## 需求與本機設置

- Node.js `>=18.0.0`；`.nvmrc` 與 CI 使用 Node 20。
- npm 需要能安裝相依套件。執行 `npm ci`。
- 前端和後端共用同一個 repository。第一次啟動前執行 `npm run build`，讓 daemon 有 `dist/frontend/` 可服務。

```bash
npm ci
npm run build
node bin/cli.js start --root /absolute/path/to/a/test-root --port 4173
```

省略 `--root` 時，CLI 使用執行指令時的 current working directory。daemon 綁定 `0.0.0.0`，CLI 會印出可用的 LAN URL 和 token。

## 專案結構

```text
md-viewer-server/
├── bin/cli.js              CLI 入口
├── src/server/             Express API、daemon、watcher、WebSocket
├── src/frontend/           Vite + React SPA
├── scripts/build.js        Vite frontend build + esbuild server bundles
├── tests/unit/              server/unit tests
├── tests/integration/      CLI、API、WebSocket、daemon integration tests
├── tests/frontend/         React/TypeScript tests
└── docs/                   developer docs、lessons、歷史 spec/plan
```

後端先用 `src/server/entry.js` 建立 HTTP server、API 與 watcher；`src/server/app.js` 掛載 REST routes；前端由 Express 提供 `dist/frontend/`。開發環境中 `start` 優先執行 source entry；發布 bundle 沒有 source entry 時才執行 `dist/bundle.js`。

## CLI

```text
md-viewer-server start [--root <path> ...] [--port <port>] [--debug] [--rotate-token]
md-viewer-server stop
md-viewer-server status
md-viewer-server doctor
md-viewer-server add-root <path>
md-viewer-server open <path>
md-viewer-server close <path>
md-viewer-server tabs
```

- `start` 驗證每個 root；不存在或不可讀的 root 會略過並警告。`--root` 可重複。預設 port 是 `4173`。
- `--debug` 是目前保留的 CLI 旗標；daemon runtime 尚未依此切換 log level，請不要把它當成已完成的除錯開關。
- `--rotate-token` 旋轉設定中的 token，若 daemon 正在跑則重啟以套用新 token。
- `add-root` 只能對執行中的 daemon 使用，成功後持久化到 `config.json`、啟動 watcher，並廣播 `root-added`。
- `open` 只接受已設定 root 底下的路徑，不會因為要求開檔而擴大 root 權限範圍。
- `close` 可用完整路徑或檔名；檔名有歧義時會要求完整路徑。
- `tabs` 列出所有連線 client 共用的目前開啟分頁。此狀態只存在記憶體，不會跨 daemon restart 保存。
- `doctor` 檢查 Node、bundle、XDG 目錄、設定、root 權限、daemon、port、stale pid、Linux inotify、PlantUML 連線與磁碟空間。CLI 目前沒有 `--help`、`--version` 或 `doctor --fix`。

## 執行期資料

| 用途 | 路徑 |
|---|---|
| 設定 | `$XDG_CONFIG_HOME/md-viewer-server/config.json`，fallback `~/.config/md-viewer-server/config.json` |
| PID | `$XDG_STATE_HOME/md-viewer-server/server.pid`，fallback `~/.local/state/md-viewer-server/server.pid` |
| Log | `$XDG_STATE_HOME/md-viewer-server/server.log`，fallback `~/.local/state/md-viewer-server/server.log` |

`config.json` 同時保存 daemon lifecycle state 和使用者 settings。`start` 保留既有 settings；`PUT /api/settings` 只接受白名單中的設定欄位，不會改寫 token、port 或 roots。

## 認證與安全邊界

- `GET /api/health` 不需認證，供 CLI 探活。
- 其他 REST API 使用 `X-Auth-Token: <token>` header。
- WebSocket 使用 `/ws?token=<token>`。
- CLI 印出的 URL 帶有 token；前端第一次載入後把 token 移到 `sessionStorage`，並從網址列移除。
- daemon 綁定 `0.0.0.0` 且不提供 HTTPS，部署者必須限制網路範圍或自行放在 TLS reverse proxy 後面。
- 所有 root/path API 會驗證 root id、拒絕空 path，並阻擋 `..` 與 symlink 逃逸。錯誤回應使用 `{errorCode: string}`。
- `.html` 預設用沒有 `allow-same-origin` 的 sandbox iframe；`allowHtmlScripts` 和其他隱私設定由 server 的 `effective` 值強制限制。

## REST API

除 `GET /api/health` 外，所有路由都需要 `X-Auth-Token`。檔案 API 使用 `root=<number>` 和 root 內的相對 `path`。

| Method | Endpoint | 說明 |
|---|---|---|
| GET | `/api/health` | 回傳 `{service, version, uptime, roots}`，免認證 |
| GET/POST | `/api/roots` | 列出 root；POST body `{path}` 動態新增 root |
| GET | `/api/files?root=` | 列出符合支援副檔名的檔案 |
| GET/PUT/POST/DELETE | `/api/file?root=&path=` | 讀取、更新、新建、刪除檔案；PUT 支援 `mtimeMs`、`force`，衝突回 409 |
| GET | `/api/file-path?root=&path=` | 取得安全解析後的絕對路徑 |
| POST | `/api/rename` | body `{root, from, to}` |
| POST | `/api/mkdir?root=&path=` | 建立資料夾 |
| GET | `/api/asset?root=&path=` | 讀取 root 內的圖片、影片或文字資源 |
| GET | `/api/search?root=&q=&target=&scope=&regex=&openPaths=` | `target=name\|content\|both`、`scope=all\|open` 的檔名/內容搜尋 |
| GET | `/api/outline?root=&path=` | 回傳文件 heading 結構；outline 內容搜尋由前端對已載入內容篩選 |
| GET/PUT | `/api/settings` | 讀取或更新持久化 settings，更新後廣播 `settings-changed` |
| POST | `/api/plantuml-proxy` | 依 effective settings 決定是否把圖表 source 送往 PlantUML server |
| GET | `/api/version-check` | `checkForUpdates` 關閉時不發出外部請求 |
| GET/POST/DELETE | `/api/tabs` | 列出、開啟、關閉跨 client 共用的記憶體分頁狀態 |
| POST | `/api/shutdown` | 供 `stop` 使用，需 token |

常見錯誤碼包括 `UNAUTHORIZED`、`INVALID_ROOT_ID`、`ROOT_NOT_FOUND`、`UNSAFE_PATH`、`FILE_NOT_FOUND`、`FILE_EXISTS`、`CONFLICT`、`INVALID_REGEX`、`REGEX_TIMEOUT`、`INVALID_SETTINGS`、`PLANTUML_DISABLED`、`PLANTUML_UNREACHABLE`、`INVALID_ROOT_PATH` 和 `ROOT_OVERLAPS_EXISTING`。

所有文字 response 明確使用 UTF-8 charset。檔案大於 5 MiB 時，`GET /api/file` 回傳 `tooLarge: true` 且不讀取完整內容；非 UTF-8 檔案標記為 `encoding: "unknown"`，前端以 view-only 顯示。

## WebSocket 事件

連線格式為 `/ws?token=<token>`。目前 daemon 會廣播：

```text
file-changed  { type, rootId, relPath }
file-added    { type, rootId, relPath }
file-removed  { type, rootId, relPath }
tab-opened    { type, rootId, relPath }
tab-closed    { type, rootId, relPath }
root-added    { type, rootId, name }
settings-changed { type }
watch-error   { type, rootId, message }
```

前端只有 `useFileWatcher` 這個 WebSocket consumer。未知事件會忽略；`settings-changed` 會重新讀取 settings，避免多個瀏覽器看到不同設定。

## Settings

後端持久化欄位包括 `plantumlServerUrl`、`sendToPlantUmlServer`、`privacyMode`、`blockRemoteContent`、`allowHtmlScripts`、`bakOnSave`、`checkForUpdates`、`customCssChoice`、`customCssUser1`、`customCssUser2`。`privacyMode` 開啟時，`effective.blockRemoteContent` 必為 `true`，`effective.sendToPlantUmlServer` 和 `effective.allowHtmlScripts` 必為 `false`；關閉後恢復使用者原本保存的偏好。

## Build、test、lint

```bash
npm run build                 # Vite + esbuild，產生 dist/frontend、dist/bundle.js、dist/regex-worker.js
npm run lint
npm run typecheck:frontend
npm run test:unit
npm run test:integration
npm run test:frontend
npm run dev:frontend         # Vite，/api 與 /ws proxy 到 127.0.0.1:4173
```

目前 repository 沒有 `test:e2e` script 或 Playwright suite；CI 不會呼叫不存在的 E2E 命令。新增 E2E 流程時，需同時加入 dependency、script、測試檔與 CI step。

## 發布

`npm run build` 只建立 bundle 和前端靜態檔，尚未建立 tar.gz wrapper、GitHub Release workflow 或已發布的 npm 版本。發布離線安裝包前，必須驗證乾淨環境只靠 Node 執行 wrapper；發布 npm 前，必須確認 `prepublishOnly` build、套件內容和 `npx md-viewer-server` quick start 都能工作。

## Commit 與協作

遵循根目錄 [CLAUDE.md](../CLAUDE.md)：一個 logical module 一個 commit，commit message 依序說明 Why、What、How。歷史 plan 的未勾選 checkbox 不代表目前實作狀態，請以 source、tests 和本文件為準。
