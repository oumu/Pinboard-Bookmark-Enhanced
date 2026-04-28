# Pinboard Bookmark Enhanced

A Chrome extension that supercharges [Pinboard](https://pinboard.in) bookmarking with AI-powered tags, summaries, and a fully themeable interface.

[![Chrome](https://img.shields.io/badge/Chrome-MV3-brightgreen?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/)
[![Version](https://img.shields.io/github/v/release/pine2D/Pinboard-Bookmark-Enhanced?label=version)](https://github.com/pine2D/Pinboard-Bookmark-Enhanced/releases/latest)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

![Popup demo](docs/screenshots/demo-popup.png)

---

## Features

- **Smart pre-fill** — title, URL, page meta description, selected text and referrer are auto-inserted into the bookmark form
- **AI tags & summaries** — bring your own API key for OpenAI, Anthropic, Gemini, DeepSeek, Groq, Mistral, Cohere, Qwen, MiniMax, OpenRouter, Ollama, or any custom OpenAI-compatible endpoint
- **Themes for `pinboard.in`** — multiple curated palettes (Modern Card · Dracula · Nord · Terminal · Paper-Ink · Solarized · Catppuccin · Gruvbox · Rose Pine · GitHub Light · Flexoki Adaptive · …) plus your own custom CSS
- **Batch save** — capture all open tabs in one go
- **Offline queue** — saves drafts when offline, syncs when reconnected
- **9 languages** — en · de · fr · ja · pl · ru · zh-CN · zh-HK · zh-TW
- **Customizable shortcuts** — bind keys for *open popup*, *quick save*, *read later* at `chrome://extensions/shortcuts`

## Install

1. Download the latest [release ZIP](https://github.com/pine2D/Pinboard-Bookmark-Enhanced/releases/latest)
2. Unzip
3. `chrome://extensions/` → enable **Developer mode** → **Load unpacked** → select the unzipped folder
4. Click the toolbar icon → paste your [Pinboard API token](https://pinboard.in/settings/password) → save

## Privacy

No tracking, no analytics, no telemetry. All data lives on your device via `chrome.storage`. AI requests fire **only** when you click "AI tags" or "AI summary" and go directly to the provider you configured. Full policy: <https://pine2D.github.io/Pinboard-Bookmark-Enhanced/privacy.html>

## License

MIT — see [LICENSE](LICENSE).
