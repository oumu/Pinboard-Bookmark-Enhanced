# Pinboard 书签增强

[English](README.md) | **简体中文** | [繁體中文](README.zh-TW.md) | [繁體中文（香港）](README.zh-HK.md) | [Deutsch](README.de.md) | [Français](README.fr.md) | [日本語](README.ja.md) | [Polski](README.pl.md) | [Русский](README.ru.md)

为 [Pinboard](https://pinboard.in) 打造的 Chrome 扩展：AI 标签与摘要、带翻译和高亮的内置阅读器，以及 13 套站点主题。

> **说明：** 需要 Pinboard.in 账号 —— Pinboard（pinboard.in）是一项独立的**付费**书签服务。本扩展是第三方客户端，使用你自己的 Pinboard API token 连接到你已有的 Pinboard 账号。本项目与 Pinboard 官方无关，未获其赞助或认可。你必须已经拥有（或注册）一个付费的 Pinboard.in 账号才能使用本扩展。

[![Chrome](https://img.shields.io/badge/Chrome-MV3-brightgreen?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/)
[![Version](https://img.shields.io/github/v/release/pine2D/Pinboard-Bookmark-Enhanced?label=version)](https://github.com/pine2D/Pinboard-Bookmark-Enhanced/releases/latest)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

![Popup demo](docs/screenshots/demo-popup.png)

---

## 功能特性

### 保存
- **一键保存，信息自动填好**：自动填入标题、描述和选中文本，并去掉 URL 里的追踪参数
- **快捷键直接保存**：无需打开弹窗；也可以一次保存所有打开的标签页
- **断网也能保存**：内容先进入本地队列，恢复联网后自动重试

![一键保存，AI 生成标签和摘要](docs/cws-assets/originals/screenshot-1-save.png)

### 标签
- **AI 生成标签和摘要**：只读文章正文，不掺广告、菜单和侧边栏；自备 API key，支持 14 家服务商或任意 OpenAI 兼容接口
- **标签自动补全**：历史标签、Pinboard 建议标签、一键预设
- **标签治理**：找出重复和低频标签，分批合并

### 阅读
- **网页变成清爽的阅读器**：Markdown 视图，自带目录、全文搜索、脚注速览
- **五色高亮与笔记**：页面重渲染、翻译、内容变动后都会保留
- **整页翻译，或向文章提问**：支持双语对照；回答附带引用，点击即可跳到原文出处
- **边读边查词和复习生词**：查词优先显示贴合当前句子的释义；生词能记笔记、标记已掌握，也能发送到 Anki 和欧路词典；可以选择离线汉英、英汉词典包
- **笔记和生词独立成页**：保存的生词和高亮集中在一个整页，随手查词、批量管理
- **发送或下载**：发送到 [Obsidian](https://obsidian.md)、Notion、NotebookLM、GitHub Gist 或任意 webhook；也可下载 `.md`、`.html`、`.epub`，供电子书阅读器使用
- **边读边看**：YouTube 和 B 站页面的预览可加载视频与多语种字幕，字幕随播放进度同步滚动，点击字幕行跳转播放，AI 标签与摘要也能直接读字幕

![清爽阅读器：双语对照、五色高亮与笔记](docs/cws-assets/originals/screenshot-2-reader.png)

![向文章提问，回答附带引用](docs/cws-assets/originals/screenshot-3-ask.png)

### 个性化
- **13 套 pinboard.in 主题**（Dracula、Nord、Catppuccin、Solarized 等），还能叠加自定义 CSS
- **自动存档到 [Wayback Machine](https://web.archive.org)**：开启后，每次保存都会同步提交一份；原链接失效后仍能找回网页
- **备份与同步**：设置和生词分别通过 Chrome Sync 与你自己的 Google Drive 同步，手动 JSON 备份可包含高亮、笔记、生词和 API 密钥；这些都是可选项，细节见下方「隐私」
- **9 种语言**、可自定义快捷键、本地优先存储、零追踪

![13 套 pinboard.in 主题](docs/cws-assets/originals/screenshot-4-themes.png)

## 安装

**[→ 从 Chrome 网上应用店安装](https://chromewebstore.google.com/detail/pinboard-bookmark-enhance/pnjndmjhljjbdlbejeenkepdalokfooh)**（推荐）

或从 release ZIP 手动加载：
1. 下载最新的 [release ZIP](https://github.com/pine2D/Pinboard-Bookmark-Enhanced/releases/latest)
2. 解压
3. `chrome://extensions/` → 开启**开发者模式** → **加载已解压的扩展程序** → 选择解压后的目录

源码目录使用独立且固定的开发版 ID，可与 Chrome 网上应用店版本共存，方便测试。release ZIP 使用 Chrome 网上应用店 ID，不能与商店版同时安装在同一 Chrome 个人资料中。在每台设备上开启设置同步后，Chrome Sync 即可共享设置。如果要替换较早的解压安装版，请先导出其设置，再加载新版并导入备份。

安装完成后：点击工具栏图标 → 粘贴你的 [Pinboard API token](https://pinboard.in/settings/password) → 保存

## 隐私

零追踪、零分析、零遥测。新用户的设置和凭据默认保存在本机。普通设置同步需在每台设备上分别开启。凭据同步是 Chrome 账号级选项，但只有开启普通设置同步的设备才会参与；关闭普通设置同步的设备继续使用本地凭据。新用户的凭据同步默认关闭；若升级时 Chrome Sync 已有非空凭据，则为避免数据丢失会保持开启。开启后，API 密钥、令牌、密码和导出凭据会通过 Chrome Sync 共享，且仅做混淆存储，并未加密。书签内容、页面内容和离线队列不会通过 Chrome Sync 同步。AI 请求**仅**通过你启用或调用的功能发出——AI 标签/摘要、页面问答、翻译、选中段落解读，或可选启用的 AI 要点摘要——并直接发送到你配置的服务商。安装时仅授予 Pinboard 访问权限；AI、Jina、批量操作中选定的站点，以及可选的导出和归档目的地，只会在你执行相应操作时申请当前精确站点权限。自定义网络端点必须使用 HTTPS；HTTP 仅允许用于 `localhost`、`127.0.0.1` 和 `[::1]`。扩展页面强制执行严格的内容安全策略（Content-Security-Policy，禁止远程代码）。完整政策：<https://pine2d.github.io/Pinboard-Bookmark-Enhanced/privacy.html>

## 许可证

MIT，见 [LICENSE](LICENSE)。
