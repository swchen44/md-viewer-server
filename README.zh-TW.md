# MD Viewer Server

[English](README.md)

> **目前狀態：早期實作版本（0.1.0）。** daemon 與瀏覽器 UI 已完成，可以直接從這個 repository 執行。npm 套件與離線安裝包尚未發布，目前請使用下方的 source checkout 安裝方式。

一個背景 daemon，透過瀏覽器 UI 在區網內檢視、搜尋、編輯 Markdown/HTML 檔案。使用情境是：SSH 進 Linux 機器，讓 AI agent 在裡面寫 Markdown/HTML，再用另一台電腦的瀏覽器立即查看渲染結果。

## 功能

- **CLI daemon**：`start`、`stop`、`status`、`doctor`、`add-root`、`open`、`close`、`tabs`
- **即時更新**：磁碟檔案變動透過 WebSocket 推送給連線中的瀏覽器
- **檢視、搜尋、編輯**：文字文件支援檢視／編輯／Split，檔名／內容／兩者搜尋、regex、已開分頁範圍搜尋，大綱支援標題／內容／兩者篩選
- **Markdown 與圖表**：Markdown 副檔名、GFM、Mermaid code block、`.mmd`、`.puml`、`.plantuml`
- **多 root**：啟動時指定多個 root，也能在 daemon 執行中新增 root
- **衝突保護**：樂觀鎖避免編輯悄悄覆蓋較新的檔案，可選擇儲存 `.bak` 備份
- **安全控制**：防路徑穿越、sandbox HTML、隱私模式，以及後端強制的 PlantUML 權限檢查
- **UI 自訂**：亮／暗／系統主題、主色調、編輯器設定、自訂 CSS slot，以及五種介面語言（`en`、`zh-TW`、`zh-CN`、`ja`、`ko`）

## 需求

- Node.js `>=18.0.0`（`.nvmrc` 與 CI 使用 Node 20）
- 一個可讀取的資料夾
- 從其他電腦連線時，瀏覽器與 server 位於同一個區網

## 從 source 啟動

```bash
git clone <repository-url>
cd md-viewer-server
npm ci
npm run build
node bin/cli.js start --root /path/to/你的 Markdown 資料夾
```

`start` 會輸出一個或多個帶有認證 token 的瀏覽器 URL，請開啟目前使用電腦對應的 URL。預設 port 是 `4173`；省略 `--root` 時，會服務執行指令時的目前工作目錄。

daemon 會綁定 `0.0.0.0`，讓區網內其他裝置連線。輸出 URL 裡的 token 可以存取已設定的 root，請視為密碼，不要貼到公開 log 或 issue。daemon 不提供 HTTPS，請只在信任的網路使用，或放在適當的 TLS reverse proxy 後面。

## CLI 指令

```text
md-viewer-server start [--root <路徑> ...] [--port <port>] [--debug] [--rotate-token]
md-viewer-server stop
md-viewer-server status
md-viewer-server doctor
md-viewer-server add-root <路徑>
md-viewer-server open <路徑>
md-viewer-server close <路徑>
md-viewer-server tabs
```

- `start` 會略過不存在或不可讀的 root 並顯示警告。若沒有任何有效 root，啟動會中止。
- `--debug` 目前是保留的旗標，尚未改變 daemon 的 runtime log 行為。
- `add-root` 需要 daemon 正在執行，新增後會寫入設定並立即開始監控。
- `open` 不會自動新增 root。路徑不在已設定 root 底下時，請先執行 `add-root <資料夾>`。
- `close` 支援完整路徑或檔名。檔名對應多個已開分頁時，請改用完整路徑。
- `--rotate-token` 會產生新 token，必要時重啟 daemon。使用舊 token 的瀏覽器必須用新 URL 重新連線。

## 隱私與檔案限制

- 隱私模式會強制封鎖遠端內容、關閉 PlantUML 傳送、關閉 HTML script，直接呼叫 API 也一樣有效。
- PlantUML 傳送預設關閉。開啟後，圖表原始碼會送到設定的 PlantUML server。
- `.html` 會在 sandbox iframe 中渲染，script 預設關閉。
- 超過 5 MiB 的檔案不會完整讀取、渲染或編輯。
- 判定為非 UTF-8 的檔案只能檢視。
- 這不是多人即時共編工具，檔案編輯使用衝突偵測，不使用 CRDT/OT。

## 設定與 log

daemon 遵循 XDG 目錄：

- 設定：`$XDG_CONFIG_HOME/md-viewer-server/config.json`，或 `~/.config/md-viewer-server/config.json`
- 狀態：`$XDG_STATE_HOME/md-viewer-server/server.pid` 與 `server.log`，或 `~/.local/state/md-viewer-server/`

啟動、權限、port 或檔案監控有問題時，執行 `md-viewer-server doctor`。

## 測試

```bash
npm run test:e2e
```

Playwright E2E suite 會 build 應用程式並啟動隔離的測試 server。本機瀏覽器安裝與失敗診斷方式見 [Developer Guide](docs/DEVELOPER.md#buildtestlint)。

## 發布狀態

`npm run build` 會產生 `dist/frontend/`、`dist/bundle.js`、`dist/regex-worker.js`。自包含離線 tarball 與發布到 npm 後的 `npx md-viewer-server` 是規劃中的發布產物，目前尚未完成。發布前不要把 Releases URL 或 `npx` 當成現行安裝方式。

## 回報問題

請使用 issue 範本，並附上：

- 重現步驟
- 預期行為
- 實際行為
- 環境資訊：server 作業系統、Node.js 版本、瀏覽器與版本、release tag 或 commit
- 需要時附上 `md-viewer-server doctor` 輸出與 `server.log`
