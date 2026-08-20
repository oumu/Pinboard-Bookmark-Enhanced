# Pinboard 書籤強化

[English](README.md) | [简体中文](README.zh-CN.md) | **繁體中文** | [繁體中文（香港）](README.zh-HK.md) | [Deutsch](README.de.md) | [Français](README.fr.md) | [日本語](README.ja.md) | [Polski](README.pl.md) | [Русский](README.ru.md)

為 [Pinboard](https://pinboard.in) 打造的 Chrome 擴充功能：AI 標籤與摘要、支援翻譯與劃重點的內建閱讀器，以及 13 套網站佈景主題。

> **說明：** 需要 Pinboard.in 帳號 —— [Pinboard](https://pinboard.in) 是一項獨立的**付費**書籤服務。本擴充功能是第三方用戶端，使用你自己的 Pinboard API token 連接到你既有的 Pinboard 帳號。本專案與 Pinboard 無任何隸屬、贊助或背書關係。你必須已擁有（或註冊）付費的 Pinboard.in 帳號才能使用本擴充功能。

[![Chrome](https://img.shields.io/badge/Chrome-MV3-brightgreen?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/)
[![Version](https://img.shields.io/github/v/release/pine2D/Pinboard-Bookmark-Enhanced?label=version)](https://github.com/pine2D/Pinboard-Bookmark-Enhanced/releases/latest)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

![Popup demo](docs/screenshots/demo-popup.png)

---

## 功能特色

### 儲存
- **一鍵儲存，資料自動填妥**：自動填入標題、描述與選取的文字，並移除 URL 中的追蹤參數
- **快捷鍵直接儲存**：不必開啟彈出視窗；也可以一次儲存所有開啟的分頁
- **離線也能儲存**：內容先進入本機佇列，重新連線後自動重試

![一鍵儲存，AI 產生標籤與摘要](docs/cws-assets/originals/screenshot-1-save.png)

### 標籤
- **AI 產生標籤與摘要**：只讀文章正文，不含廣告、選單與側欄；自備 API key，支援 14 家服務商或任何 OpenAI 相容端點
- **標籤自動補全**：你的歷史標籤、Pinboard 建議標籤、一鍵預設
- **標籤治理**：找出重複與低使用次數的標籤，分批合併

### 閱讀
- **網頁變成清爽的閱讀器**：Markdown 檢視，內建目錄、全文搜尋、註腳速覽
- **五色劃重點與筆記**：重新渲染、翻譯、內容變動後依然保留
- **整頁翻譯，或向文章提問**：支援雙語對照；回答附帶引用，一按即跳回原文出處
- **邊讀邊查詞、複習生詞**：查詞時會依你正在讀的句子，優先顯示最貼切的釋義；生詞可加筆記、標記為已掌握，也可傳送到 Anki 與歐路詞典；另可選用離線中英、英中詞典包
- **筆記與生詞獨立成頁**：儲存的生詞與劃重點集中在同一頁，隨手查詞、批次管理
- **傳送或下載**：傳送到 [Obsidian](https://obsidian.md)、Notion、NotebookLM、GitHub Gist 或任何 webhook；也可下載為 `.md`、`.html`、`.epub`，在電子書閱讀器上閱讀

![清爽閱讀器：雙語對照、五色劃重點與筆記](docs/cws-assets/originals/screenshot-2-reader.png)

![向文章提問，回答附帶引用](docs/cws-assets/originals/screenshot-3-ask.png)

### 個人化
- **13 套 pinboard.in 佈景主題**（Dracula、Nord、Catppuccin、Solarized 等），還可疊加自訂 CSS
- **自動存檔到 [Wayback Machine](https://web.archive.org)**：開啟後，每次儲存都會一併提交；原連結失效後仍找得回網頁
- **備份與同步**：設定透過 Chrome Sync 同步，生詞則透過你自己的 Google Drive，另有手動 JSON 備份，可一併納入劃重點、筆記、生詞與 API 金鑰。這三項都要自行開啟，細節見下方的「隱私」
- **9 種語言**、可自訂快捷鍵、本機優先儲存、零追蹤

![13 套 pinboard.in 佈景主題](docs/cws-assets/originals/screenshot-4-themes.png)

## 安裝

**[→ 從 Chrome 線上應用程式商店安裝](https://chromewebstore.google.com/detail/pinboard-bookmark-enhance/pnjndmjhljjbdlbejeenkepdalokfooh)**（推薦）

或從 release ZIP 手動載入：
1. 下載最新的 [release ZIP](https://github.com/pine2D/Pinboard-Bookmark-Enhanced/releases/latest)
2. 解壓縮
3. `chrome://extensions/` → 開啟**開發人員模式** → **載入未封裝項目** → 選擇解壓縮後的資料夾

原始碼目錄使用獨立且固定的開發版本 ID，可與 Chrome 線上應用程式商店版本並存，方便測試。release ZIP 使用 Chrome 線上應用程式商店 ID，無法與商店版本同時安裝在同一個 Chrome 個人資料中。在每台裝置開啟設定同步後，Chrome Sync 即可共用設定。如果要取代較早的解壓縮安裝版本，請先匯出其設定，再載入新版本並匯入備份。

安裝完成後：點擊工具列圖示 → 貼上你的 [Pinboard API token](https://pinboard.in/settings/password) → 儲存

## 隱私

零追蹤、零分析、零遙測。新使用者的設定與憑證預設儲存在本機。一般設定同步必須在每台裝置上分別開啟。憑證同步是 Chrome 帳號層級的選項，但只有開啟一般設定同步的裝置才會參與；關閉一般設定同步的裝置會繼續使用本機憑證。新使用者的憑證同步預設關閉；若升級時 Chrome Sync 已有非空憑證，為避免資料遺失會保持開啟。開啟後，API 金鑰、權杖、密碼與匯出憑證會透過 Chrome Sync 共用，且僅經過混淆處理，並未加密。書籤內容、頁面內容與離線佇列不會透過 Chrome Sync 同步。AI 請求**僅**透過你啟用或使用的功能發送——包括 AI 標籤／摘要、頁面問答、翻譯、選取解說，或選用的重點速覽——並直接傳送到你設定的服務商。安裝時僅授予 Pinboard 存取權限；AI、Jina、批次操作中選取的網站，以及選用的匯出與封存目的地，只會在你執行相應操作時申請目前確切網站的權限。自訂網路端點必須使用 HTTPS；HTTP 僅允許用於 `localhost`、`127.0.0.1` 和 `[::1]`。擴充功能頁面採用嚴格的 Content-Security-Policy（不執行遠端程式碼）。完整政策：<https://pine2d.github.io/Pinboard-Bookmark-Enhanced/privacy.html>

## 授權

MIT，見 [LICENSE](LICENSE)。
