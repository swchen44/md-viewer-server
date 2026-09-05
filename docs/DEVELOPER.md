# Developer Guide

> 專案尚在設計/實作初期。這份文件會隨每個開發階段完成的模組持續補齊，目前先列出骨架，標明每個章節該包含什麼。

## 專案結構

```
md-viewer-server/
├── bin/cli.js              ← CLI 入口（start/stop/status/doctor）
├── src/server/             ← 後端（Express + ws + chokidar）
├── src/frontend/           ← 前端（Vite + React SPA）
├── tests/                  ← unit/integration/e2e，見設計規格「tests/ 目錄結構」
└── docs/
    ├── superpowers/specs/  ← 設計規格（brainstorming 產物）
    ├── DEVELOPER.md         ← 本文件
    └── LESSONS.md           ← 開發過程踩坑記錄
```

完整架構決策見 [設計規格](superpowers/specs/2026-09-05-md-viewer-server-design.md)。

## 開發環境設置

（實作階段補：Node 版本需求、`npm install`、環境變數、如何在本機跑一個測試用的 root 資料夾）

## 常用指令

（實作階段補：`npm run dev`、`npm run build`、`npm run test:unit` / `test:integration` / `test:e2e`、`npm run lint`）

## 打包與離線安裝包驗證

（實作階段補：如何本機重現 `esbuild` bundle 流程、如何驗證 tar.gz 在乾淨環境可以無 `npm install` 直接執行）

## API 一覽

見設計規格「後端 API 設計」章節；實作階段這裡補上實際範例請求/回應。

## 除錯

（實作階段補：`server.log` 位置、常見錯誤碼對照、如何用 `doctor` 診斷環境問題）

## Commit 與協作規範

見專案根目錄 [CLAUDE.md](../CLAUDE.md)：一段一個 commit，訊息含 why/what/how。
