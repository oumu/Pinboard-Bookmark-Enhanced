# Pinboard Bookmark Enhanced

A Chrome extension that supercharges [Pinboard](https://pinboard.in) bookmarking with AI-powered tags, summaries, and a fully themeable interface.

[![Chrome](https://img.shields.io/badge/Chrome-MV3-brightgreen?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/)
[![Version](https://img.shields.io/github/v/release/oumu/Pinboard-Bookmark-Enhanced?label=version)](https://github.com/oumu/Pinboard-Bookmark-Enhanced/releases/latest)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

---

## Features

- **One-click save** — title, URL, description, tags pre-filled from the current tab
- **AI tags & summaries** — 13 providers (OpenAI, Anthropic, Gemini, DeepSeek, Groq, Mistral, Cohere, Qwen, MiniMax, OpenRouter, Ollama, custom)
- **13 themes for `pinboard.in`** — Modern Card · Dracula · Nord · Terminal · Paper-Ink · Solarized · Catppuccin · Gruvbox · Rose Pine · GitHub Light · Flexoki Adaptive
- **Tag autocomplete** — recall your existing Pinboard tag cloud while typing
- **Batch save** — capture all open tabs in one go
- **Offline queue** — saves drafts when offline, syncs when reconnected
- **9 languages** — en · de · fr · ja · pl · ru · zh-CN · zh-HK · zh-TW
- **Keyboard shortcuts** — `Alt+B` open · `Alt+Shift+B` quick save · `Alt+Shift+R` read later

## Install

1. Download the latest [release ZIP](https://github.com/oumu/Pinboard-Bookmark-Enhanced/releases/latest)
2. Unzip
3. `chrome://extensions/` → enable **Developer mode** → **Load unpacked** → select the unzipped folder
4. Click the toolbar icon → paste your [Pinboard API token](https://pinboard.in/settings/password) → save

## Privacy

No tracking, no analytics, no telemetry. All data lives on your device via `chrome.storage`. AI requests fire **only** when you click "AI tags" or "AI summary" and go directly to the provider you configured. Full policy: <https://oumu.github.io/Pinboard-Bookmark-Enhanced/privacy.html>

## Development

Vanilla JavaScript, zero build step. Edit any source file and reload the extension at `chrome://extensions/`.

```
manifest.json       # MV3 manifest
background.js       # service worker
popup.html/js/css   # toolbar popup
options.html/js     # settings page
pinboard-style.js   # content script for pinboard.in
pinboard-themes.js  # 13 generated themes
docs/theme-surface/ # theme-factory composer + 13 token files
```

Theme changes regenerate via `node docs/theme-surface/tools/sync-all.mjs`.

## License

MIT — see [LICENSE](LICENSE).
