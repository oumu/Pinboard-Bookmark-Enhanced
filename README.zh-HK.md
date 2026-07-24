# Pinboard 書籤強化

[English](README.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | **繁體中文（香港）** | [Deutsch](README.de.md) | [Français](README.fr.md) | [日本語](README.ja.md) | [Polski](README.pl.md) | [Русский](README.ru.md)

為 [Pinboard](https://pinboard.in) 而設的 Chrome 擴充功能：AI 標籤與摘要、內置閱讀器（支援翻譯與高亮），以及 13 套網站主題。

> **說明：** 需要 Pinboard.in 帳號 —— [Pinboard](https://pinboard.in) 是一項獨立、**付費**的書籤服務。本擴充功能是第三方客戶端，以你自己的 Pinboard API token 連接你現有的 Pinboard 帳號。本專案與 Pinboard 沒有任何隸屬、贊助或認可關係。你必須已經擁有（或註冊）一個付費 Pinboard.in 帳號，方可使用本擴充功能。

[![Chrome](https://img.shields.io/badge/Chrome-MV3-brightgreen?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/)
[![Version](https://img.shields.io/github/v/release/pine2D/Pinboard-Bookmark-Enhanced?label=version)](https://github.com/pine2D/Pinboard-Bookmark-Enhanced/releases/latest)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

![Popup demo](docs/screenshots/demo-popup.png)

---

## 功能特色

### 儲存
- **一鍵儲存，自動填好相關資料**：標題、描述與選取的文字自動填入，並移除 URL 中的追蹤參數
- **快捷鍵直接儲存**：無需打開彈出視窗；也可以一次儲存所有已打開的分頁
- **離線也能儲存**：內容先進入本機佇列，重新連線後自動重試

![一鍵儲存，AI 產生標籤與摘要](docs/cws-assets/originals/screenshot-1-save.png)

### 標籤
- **AI 產生標籤與摘要**：讀取去除廣告、選單與側欄後的文章正文；自備 API key，支援 13 家服務商或任何 OpenAI 兼容端點
- **標籤自動完成**：你的歷史標籤、Pinboard 建議標籤、一按即用的預設
- **標籤治理**：找出重複與低使用次數的標籤，分批合併

### 閱讀
- **網頁變成清爽的閱讀器**：Markdown 檢視，附目錄、全文搜尋、註腳速覽
- **五色高亮與筆記**：重新渲染、翻譯、內容變動後仍會保留
- **整頁翻譯，或向文章提問**：支援雙語對照；答案附帶引註，一按即跳回原文出處
- **邊閱讀邊查詞及溫習生詞**：可使用網上釋義或可選的離線中英詞典；儲存生詞後，可搜尋、排序及分組，也可匯出目前 Pinboard 帳戶的全部生詞、全部傳送到 Anki，或將支援語言的生詞傳送到歐路詞典
- **傳送或下載**：傳送至 [Obsidian](https://obsidian.md)、GitHub Gist 或任何 webhook；也可下載為 `.md`、`.html`、`.epub`，在電子書閱讀器上閱讀

![清爽閱讀器：雙語對照、五色高亮與筆記](docs/cws-assets/originals/screenshot-2-reader.png)

![向文章提問，答案附帶引註](docs/cws-assets/originals/screenshot-3-ask.png)

### 個人化
- **13 套 pinboard.in 佈景主題**（Dracula、Nord、Catppuccin、Solarized 等），更可疊加自訂 CSS
- **自動存檔至 [Wayback Machine](https://web.archive.org)**：可選擇每次儲存時一併提交；原連結失效後仍可尋回網頁
- **備份與同步**：Chrome Sync 只在已開啟設定同步的裝置之間共享設定，憑據同步需另行開啟。手動 JSON 備份包含設定，亦可選擇加入高亮、筆記及目前 Pinboard 帳戶的生詞。Google Drive 生詞同步已實作，但在 OAuth 設定啟用前暫不可用；啟用後亦只同步目前 Pinboard 帳戶的生詞。
- **9 種語言**、可自訂快捷鍵、本機優先儲存、零追蹤

![13 套 pinboard.in 佈景主題](docs/cws-assets/originals/screenshot-4-themes.png)

## 安裝

**[→ 從 Chrome Web Store 安裝](https://chromewebstore.google.com/detail/pinboard-bookmark-enhance/pnjndmjhljjbdlbejeenkepdalokfooh)**（推薦）

或從 release ZIP 手動載入：
1. 下載最新的 [release ZIP](https://github.com/pine2D/Pinboard-Bookmark-Enhanced/releases/latest)
2. 解壓縮
3. `chrome://extensions/` → 開啟**開發人員模式** → **載入未封裝項目** → 選擇解壓縮後的資料夾

release ZIP 與 Chrome Web Store 版本使用相同的擴充功能 ID；在每部裝置開啟設定同步後，Chrome Sync 便可共享設定。兩者不能同時安裝在同一個 Chrome 個人檔案。如要取代較舊的解壓安裝版本，請先匯出其設定，再載入新版本並匯入備份。

安裝完成後：按一下工具列圖示 → 貼上你的 [Pinboard API token](https://pinboard.in/settings/password) → 儲存

## 私隱

零追蹤、零分析、零遙測。對新用戶，設定與憑據預設儲存在本機。一般設定同步需在每部裝置分別開啟。憑據同步是 Chrome 帳號層級的選項，但只有開啟了一般設定同步的裝置才會參與；關閉一般設定同步的裝置會繼續使用本機憑據。新用戶預設關閉憑據同步；如升級時 Chrome Sync 已有非空憑據，為免資料遺失會保持開啟。開啟後，API 金鑰、token、密碼與匯出憑據會透過 Chrome Sync 共享，只經混淆處理，並未加密。書籤內容、頁面內容與離線佇列不會透過 Chrome Sync 同步。AI 請求**只**會經你啟用或使用的功能發出——AI 標籤／摘要、頁面問答、翻譯、選取段落解釋，或 opt-in 的重點摘要——並直接傳送至你設定的服務商。安裝時只會授予 Pinboard 的存取權限；AI、Jina、批次操作所選的網站，以及可選的匯出與存檔目的地，只會在你執行相應操作時申請目前確切網站的權限。自訂網絡端點必須使用 HTTPS；HTTP 只可用於 `localhost`、`127.0.0.1` 與 `[::1]`。擴充功能頁面實施嚴格的 Content-Security-Policy（不會執行遠端程式碼）。完整政策：<https://pine2d.github.io/Pinboard-Bookmark-Enhanced/privacy.html>

## 授權

MIT，見 [LICENSE](LICENSE)。
