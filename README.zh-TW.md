# MD Viewer Server

[English](README.md)

> **目前狀態：設計階段。** 設計規格已定案，尚未開始實作。這份 README 描述的是規劃中的功能；正式發布安裝包後會補上實際安裝步驟，目前以[設計規格文件](docs/superpowers/specs/2026-09-05-md-viewer-server-design.md)為準。

一個跑在 Linux 上的背景 daemon，透過瀏覽器 UI 檢視、搜尋、編輯區網內的 Markdown/HTML 檔案。設計初衷：你 SSH 進 Linux 機器，讓 AI 在裡面寫 Markdown/HTML，但 SSH 純文字環境看不到渲染結果——這個工具讓你直接用 Windows 的 Chrome 瀏覽器即時看到、編輯這些檔案,不用把檔案來回搬到桌機。

## 特色（規劃中）

- **CLI daemon**：`start` / `stop` / `status` / `doctor`，不需要 root 權限，完全離線可用（目標機器不需要 `npm install`，安裝包內含所有相依套件）
- **即時更新**：磁碟上的檔案變動（不論是 AI 寫的、編輯器改的）透過 WebSocket 即時推送到所有連線中的瀏覽器
- **檢視、搜尋、編輯**：多分頁介面（檢視／編輯／Split），檔名與全文搜尋皆支援 regex，大綱側邊欄可快速跳轉標題
- **多 root 支援**：一次指定多個資料夾
- **安全性內建**：`.html` 檔案在沙箱 iframe 內渲染（即使允許執行 script 也讀不到你的登入 token）、檔案定址防路徑穿越、編輯衝突偵測（樂觀鎖機制）
- **可自訂**：亮/暗主題、主色調、自訂 CSS 範本（可編輯、可擴充）、5 種介面語言（en / zh-TW / zh-CN / ja / ko）
- **隱私模式**：一鍵封鎖遠端圖片/影片、強制關閉 PlantUML 傳送與 script 執行

## 安裝方式

規劃兩種安裝路徑：

- **離線/內網環境**：從 [Releases](../../releases) 下載 `md-viewer-server-<version>.tar.gz`，解壓縮到 home 目錄下任意位置（不需要 root），執行 `./md-viewer-server start --root <路徑>`
- **可連外的環境**：`npx md-viewer-server start --root <路徑>`

完整 CLI 指令與 API 說明：見[開發者文件](docs/DEVELOPER.md)。

## 回報問題

請使用 issue 範本（bug report），並填寫：

- 重現步驟
- 預期行為
- 實際發生的行為
- 環境資訊：作業系統、Node.js 版本、瀏覽器與版本

沒有重現步驟的模糊回報很難處理，範本會引導你填寫這些欄位。
