# Lessons Learned

一行格式：情境 → 教訓 → 對策。開發過程中持續累積，不是只在事後補寫。

## 從 md-reader 專案借鑒（避免重踩）

md-reader 是 Chrome 擴充功能，大部分教訓（MV3 CSP、host_permissions、manifest match pattern）跟本專案（Node server + Web 前端）不適用，以下是篩選過、真正相關的部分：

1. **回應缺 charset，CJK 內容被瀏覽器嗅探成錯誤編碼**：md-reader 曾因為 `text/markdown` 回應沒標 `charset=utf-8`，Chrome 對中文內容嗅探成 Big5/GBK，造成位元組級破壞（多位元組字被截斷）。對策：本專案所有回傳文字內容的 API（`/api/file`、`/api/asset` 的文字類型）一律明確在 `Content-Type` 加上 `; charset=utf-8`，不要依賴瀏覽器猜測。
2. **全域 regex 改寫 raw source 的代價**：md-reader 曾用全域 regex 清除 `%%...%%` 註解語法，結果連 Mermaid 圖表定義裡的 `%%`（那是 Mermaid 自己的註解語法）也被誤刪。對策：本專案若未來要做任何 pre-parse 文字改寫（例如 wikilink 轉換），一律要 fence-aware（先掃描 code fence 邊界再處理），不能對整份原始文字做無差別 regex 取代。
3. **Markdown 表格儲存格內的 `|` 被格式化工具破壞**：儲存格內若有原始 `|`（本專案的 API 表格就有 `target=name|content|both` 這種寫法），沒轉義會被 Prettier 之類工具連鎖打斷表格結構。對策：文件裡表格儲存格內的 `|` 一律用 `\|` 轉義（本 spec 已這樣處理）；寫完文件 commit 前留意格式化工具的實際輸出。
4. **自動化工具「卡住」時，先驗證設定檔而非懷疑環境**：md-reader 曾因 manifest.json 裡一個 match pattern 不合法，讓 Playwright/agent-browser 的瀏覽器啟動流程整個 hang 住，表象很像環境壞掉，實際是設定檔本身有問題。對策：本專案的 CLI/CI 卡住或行為異常時，先檢查 `config.json`、`css-presets.json` 等設定檔的合法性，再往下懷疑執行環境。

## 本專案累積的教訓（隨開發進度更新）

1. **pino redact 只精確匹配指定路徑，不會自動挖進巢狀物件**：`src/server/logger.js` 的 `redact: {paths: ['token']}` 只遮罩最外層剛好叫 `token` 的欄位；若之後某處把 token 包進巢狀物件（如 `{auth: {token}}`）或用別的欄位名（如 `accessToken`、`req.headers['x-auth-token']`）傳給 logger，該次呼叫的 token 就會原文外洩。對策：往後任何會記錄到認證資訊的程式碼，一律用字面上的 `logger.X({token}, ...)` 這種頂層 `token` key，不要巢狀化或改名；若某個 task 真的需要巢狀記錄，該 task 要先擴充 `redact.paths`，不能只依賴既有規則。
