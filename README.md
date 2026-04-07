# Pinboard Bookmark Plus

A Chrome extension that supercharges [Pinboard](https://pinboard.in) bookmarking with AI-powered tags, summaries, and a fully themeable interface.

![Chrome](https://img.shields.io/badge/Chrome-MV3-brightgreen?logo=googlechrome&logoColor=white)
![Version](https://img.shields.io/badge/version-2.3-blue)
![License](https://img.shields.io/badge/license-MIT-green)

---

## Highlights

- **AI tags & summaries** from 13 providers (OpenAI, Claude, Gemini, DeepSeek, Groq, Mistral, Qwen, MiniMax, Cohere, SiliconFlow, OpenRouter, Ollama, Custom)
- **13 built-in themes** that style both Pinboard.in and the extension UI simultaneously
- **Quick Actions** — one-click save, read-later, and batch-save all tabs
- **Privacy first** — all data stored locally, no analytics, no tracking

---

## Features

### Bookmarking

| Feature | Description |
|---------|-------------|
| One-click save | Title, URL, description, tags auto-filled from page |
| Duplicate detection | Existing bookmarks auto-switch to edit mode |
| Selected text capture | Page selection becomes description (optional blockquote wrap) |
| Editable URL | Modify the link before saving |
| Private & Read Later | Per-bookmark flags with configurable defaults |
| Referrer tracking | Optionally append source page URL to description |
| Batch save tabs | Save all open tabs as a Pinboard tab set |

### AI

| Feature | Description |
|---------|-------------|
| Smart tags | Generate 5-10 relevant tags from page content via LLM |
| Smart summary | 2-4 sentence description from page content |
| Existing tag matching | AI references your tag library for consistency |
| Multi-language | Auto-detect or force zh/en/ja/ko/fr/de/es/ru |
| Customizable prompts | Template variables: `{{title}}`, `{{url}}`, `{{content}}`, `{{description}}` |
| Result caching | Configurable TTL (default 60 min), cache indicator with regenerate option |
| Auto-generate on open | Optional: trigger AI tags when popup opens |

**Supported providers:**

| Provider | Default Model | Auth |
|----------|---------------|------|
| Google Gemini | gemini-2.0-flash | API Key |
| OpenAI | gpt-4o-mini | API Key (custom base URL) |
| Anthropic Claude | claude-sonnet-4-20250514 | API Key |
| DeepSeek | deepseek-chat | API Key |
| Groq | llama-3.3-70b-versatile | API Key |
| Mistral AI | mistral-small-latest | API Key |
| Alibaba Qwen | qwen-turbo | API Key |
| MiniMax | MiniMax-Text-01 | API Key |
| Cohere | command-r-plus | API Key |
| SiliconFlow | Qwen2.5-7B-Instruct | API Key |
| OpenRouter | gemini-2.0-flash-exp:free | API Key |
| Ollama | llama3 | Local, no key |
| Custom | configurable | Custom base URL + optional key |

### Themes

13 built-in presets that style **both** pinboard.in pages **and** the extension popup + settings page:

| Theme | Style |
|-------|-------|
| Modern Card | Clean, Google-inspired light theme |
| Nord Night | Cool blue arctic palette |
| Terminal | Green-on-black monospace hacker aesthetic |
| Paper & Ink | Warm parchment, classic readability |
| Dracula | Gothic dark with vibrant accents |
| Flexoki Adaptive | Auto light/dark based on system preference |
| Solarized Light | Ethan Schoonover's warm light palette |
| Solarized Dark | Ethan Schoonover's dark palette |
| Catppuccin Latte | Pastel light theme |
| Catppuccin Mocha | Soothing dark with pastel accents |
| Gruvbox Dark | Retro warm dark with earthy tones |
| Rose Pine | Soft romantic dark palette |
| GitHub Light | GitHub-inspired clean light theme |

Plus:
- **Save custom themes** — name and reuse your CSS modifications
- **Custom CSS editor** — full control over pinboard.in styling
- **Custom font injection** — apply any font to pinboard.in
- **Popup theme toggle** — choose whether popup follows Pinboard theme

### Quick Actions

- **Quick Save** — save current page with default tags, no form needed
- **Read Later** — one-click mark as read-later with default tags
- **Batch Save** — save all open tabs as individual bookmarks with AI tags/summaries
- **Keyboard shortcuts** — configurable via `chrome://extensions/shortcuts`

### Other

- Toolbar icon changes when current page is already bookmarked
- Tag autocomplete with frequency-sorted suggestions; shows `+ tag` hint when no match found
- Tag presets for common tag groups
- Search bar in popup for quick Pinboard searches
- Recent bookmarks display
- Offline queue — saves are queued when offline, synced when back
- Import/export settings
- API connectivity test per provider
- API key show/hide toggle for all provider inputs
- Auto-growing notes field — starts compact, expands as you type
- Enhanced duplicate detection — shows save date and tag count
- `Escape` closes popup (or cancels pending auto-close after save); `Ctrl+Enter` saves
- Auto-close after save is cancellable by moving the mouse or pressing Escape
- Delete confirmation uses inline popover instead of browser dialog
- "Add all" button shows ✓ after adding all suggested or AI tags

### Languages

UI available in 9 languages, matching Pinboard's official supported locales:

| Language | Locale |
|----------|--------|
| English | en |
| 简体中文 | zh_CN |
| 繁體中文（台灣）| zh_TW |
| 中文（香港）| zh_HK |
| 日本語 | ja |
| Deutsch | de |
| Français | fr |
| Polski | pl |
| Русский | ru |

Language can be set in Settings → Appearance, or auto-detected from browser locale.

---

## Installation

1. Clone this repository:

   ```bash
   git clone https://github.com/oumu/Pinboard-Bookmark-Plus.git
   ```

2. Open `chrome://extensions/`, enable **Developer mode**

3. Click **Load unpacked**, select the extension folder

4. Pin the extension to your toolbar

### Prerequisites

- A [Pinboard](https://pinboard.in) account + API token ([settings/password](https://pinboard.in/settings/password))
- *(Optional)* API key from any supported AI provider

---

## Privacy

- All keys stored **locally** in Chrome storage — never sent to third parties
- Page content only sent to **your chosen AI provider** when you click AI buttons
- No analytics, no tracking, no data collection

---

## Tech Stack

- Chrome Extension Manifest V3
- Vanilla JavaScript — zero dependencies, no build step
- Chrome Storage API (sync + local)
- Pinboard API v1
- Multiple LLM provider APIs

---

## License

[MIT](LICENSE)

---

## Acknowledgments

- [Pinboard](https://pinboard.in) by Maciej Ceglowski
- Inspired by the original [Pinboard Chrome extension](https://pinboard.in/resources/)

---

<details>
<summary><strong>中文说明</strong></summary>

# Pinboard Bookmark Plus

一款为 [Pinboard](https://pinboard.in) 打造的 Chrome 扩展，支持 AI 智能标签、摘要生成和全面主题定制。

---

## 亮点

- **AI 标签 & 摘要** — 支持 13 个 AI 服务商（OpenAI、Claude、Gemini、DeepSeek、Groq、Mistral、通义千问、MiniMax、Cohere、硅基流动、OpenRouter、Ollama、自定义）
- **13 套内置主题** — 同时美化 Pinboard 网站和扩展界面
- **快捷操作** — 一键保存、稍后阅读、批量保存所有标签页
- **隐私优先** — 所有数据本地存储，无分析、无追踪

---

## 功能

### 书签管理

| 功能 | 说明 |
|------|------|
| 一键保存 | 自动填充标题、URL、描述、标签 |
| 重复检测 | 已收藏页面自动切换为编辑模式 |
| 选中文本捕获 | 页面选中内容作为描述（可选 blockquote 包裹） |
| URL 可编辑 | 保存前可修改链接地址 |
| 私有 & 稍后阅读 | 逐条设置，支持默认值配置 |
| 来源追踪 | 可选在描述中追加来源页 URL |
| 批量保存标签页 | 一键将所有打开的标签页保存为 Pinboard 标签组 |

### AI 功能

| 功能 | 说明 |
|------|------|
| 智能标签 | 基于页面内容通过 LLM 生成 5-10 个相关标签 |
| 智能摘要 | 基于页面内容生成 2-4 句描述 |
| 已有标签匹配 | AI 参考你的标签库保持一致性 |
| 多语言支持 | 自动检测或指定 zh/en/ja/ko/fr/de/es/ru |
| 自定义提示词 | 模板变量：`{{title}}`、`{{url}}`、`{{content}}`、`{{description}}` |
| 结果缓存 | 可配置 TTL（默认 60 分钟），显示缓存状态和重新生成链接 |
| 自动生成 | 可选：打开弹窗时自动触发 AI 标签 |

### 主题系统

13 套内置主题预设，**同时**美化 Pinboard 网站**和**扩展弹窗 + 设置页面：

| 主题 | 风格 |
|------|------|
| Modern Card | 简洁现代，Google 风格浅色主题 |
| Nord Night | 冷色系北极蓝调色板 |
| Terminal | 黑底绿字等宽字体黑客风 |
| Paper & Ink | 暖色羊皮纸，经典阅读体验 |
| Dracula | 哥特暗色搭配鲜明强调色 |
| Flexoki Adaptive | 自动跟随系统亮色/暗色偏好 |
| Solarized Light | Ethan Schoonover 暖色浅色调色板 |
| Solarized Dark | Ethan Schoonover 暗色调色板 |
| Catppuccin Latte | 柔和粉彩浅色主题 |
| Catppuccin Mocha | 舒适暗色搭配粉彩强调色 |
| Gruvbox Dark | 复古暖色暗色主题 |
| Rose Pine | 柔和浪漫暗色调色板 |
| GitHub Light | GitHub 风格简洁浅色主题 |

此外：
- **自定义主题保存** — 命名并复用你的 CSS 修改
- **CSS 编辑器** — 完全控制 pinboard.in 样式
- **自定义字体** — 为 pinboard.in 注入任意字体
- **弹窗主题开关** — 选择弹窗是否跟随 Pinboard 主题

### 快捷操作

- **快速保存** — 使用默认标签一键保存，无需填写表单
- **稍后阅读** — 一键标记为稍后阅读
- **批量保存** — 将所有标签页分别保存为独立书签，支持 AI 标签/摘要
- **键盘快捷键** — 通过 `chrome://extensions/shortcuts` 配置
- `Escape` 关闭弹窗（或取消保存成功后的自动关闭倒计时）；`Ctrl+Enter` 保存
- 保存后自动关闭可通过移动鼠标或按 Escape 取消
- 标签自动补全无匹配时显示 `+ 标签名` 提示行，可点击直接添加
- 删除确认改为内联弹出框，与重置操作风格一致
- "全部添加"按钮点击后显示 ✓ 反馈

### 多语言支持

界面支持 9 种语言，覆盖 Pinboard 官方支持的所有语言：

| 语言 | Locale |
|------|--------|
| English | en |
| 简体中文 | zh_CN |
| 繁體中文（台灣）| zh_TW |
| 中文（香港）| zh_HK |
| 日本語 | ja |
| Deutsch | de |
| Français | fr |
| Polski | pl |
| Русский | ru |

可在 设置 → 外观 中手动切换语言，或自动跟随浏览器语言。

---

## 安装

1. 克隆本仓库：

   ```bash
   git clone https://github.com/oumu/Pinboard-Bookmark-Plus.git
   ```

2. 打开 `chrome://extensions/`，启用**开发者模式**

3. 点击**加载已解压的扩展程序**，选择扩展文件夹

4. 将扩展固定到工具栏

### 前置条件

- [Pinboard](https://pinboard.in) 账户 + API 令牌（[settings/password](https://pinboard.in/settings/password)）
- *（可选）* 任一支持的 AI 服务商 API 密钥

---

## 隐私

- 所有密钥**本地存储**于 Chrome 存储，不发送至任何第三方
- 页面内容仅在点击 AI 按钮时发送至**你选择的 AI 服务商**
- 无分析、无追踪、无数据收集

</details>
