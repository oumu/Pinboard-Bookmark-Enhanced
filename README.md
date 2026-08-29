# Pinboard Bookmark Enhanced

**English** | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [繁體中文（香港）](README.zh-HK.md) | [Deutsch](README.de.md) | [Français](README.fr.md) | [日本語](README.ja.md) | [Polski](README.pl.md) | [Русский](README.ru.md)

A Chrome extension for [Pinboard](https://pinboard.in): AI tags and summaries, a built-in reader with translation and highlights, and 13 themes for the site itself.

> **Note:** This extension requires a Pinboard.in account. [Pinboard](https://pinboard.in) is an independent, **PAID** bookmarking service. This extension is a third-party client that connects to your existing Pinboard account with your own Pinboard API token. It is not affiliated with, sponsored by, or endorsed by Pinboard. You must already have (or sign up for) a paid Pinboard.in account to use this extension.

[![Chrome](https://img.shields.io/badge/Chrome-MV3-brightgreen?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/)
[![Version](https://img.shields.io/github/v/release/pine2D/Pinboard-Bookmark-Enhanced?label=version)](https://github.com/pine2D/Pinboard-Bookmark-Enhanced/releases/latest)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

![Popup demo](docs/screenshots/demo-popup.png)

---

## Features

### Save
- **One click, everything filled in**: title, description, and selected text, with tracking parameters stripped from the URL
- **Save by hotkey**: skip the popup, or batch-save every open tab
- **Works offline**: saves are queued locally and retried when you're back online

![One-click save with AI tags and summary](docs/cws-assets/originals/screenshot-1-save.png)

### Tag
- **AI tags & summary**: reads the article body without the ads, menus, and sidebars; bring your own key (14 providers, or any OpenAI-compatible endpoint)
- **Autocomplete** from your own tags, Pinboard's suggestions, and one-tap presets
- **Tag cleanup**: find duplicate and rarely-used tags, merge them in batches

### Read
- **Any page becomes a clean reader**: a Markdown view with table of contents, search, and footnote peek; math, diagrams, and tables render properly
- **Five-color highlights with notes**: both survive re-renders, translation, even page edits
- **Translate the page or ask it questions**: full-page translation with a bilingual view; answers cite the source and jump straight to it
- **Look up words as you read**: definitions open on the sense that fits your sentence; saved words keep notes and a learning status and can be sent to Anki or Eudic; optional offline dictionary packs for Chinese-English and English-Chinese
- **A full page for notes and vocabulary**: saved words and highlights in one place, with dictionary lookup and batch management
- **Send or download**: [Obsidian](https://obsidian.md), Notion, NotebookLM, a GitHub Gist, or any webhook; `.md`, `.html`, or `.epub` for your e-reader
- **Watch while you read**: YouTube and bilibili previews pair the video with its subtitles; the transcript follows playback, any line jumps the player, and AI tags and summaries can read the captions instead of the page

![Reader with bilingual translation and highlights](docs/cws-assets/originals/screenshot-2-reader.png)

![Ask the page and get cited answers](docs/cws-assets/originals/screenshot-3-ask.png)

### Make Pinboard yours
- **13 themes for pinboard.in** (Dracula · Nord · Catppuccin · Solarized · …) plus your own custom CSS
- **Auto-archive to the [Wayback Machine](https://web.archive.org)**: optionally submit every save; pages stay reachable after the original link dies
- **Backup and sync**: settings via Chrome Sync, vocabulary via your own Google Drive, manual JSON backups that can include highlights, notes, vocabulary, and your API keys; each is opt-in, with the exact terms under Privacy below
- **9 languages** · configurable shortcuts · local-first storage · zero tracking

![13 themes for pinboard.in](docs/cws-assets/originals/screenshot-4-themes.png)

## Install

**[→ Install from Chrome Web Store](https://chromewebstore.google.com/detail/pinboard-bookmark-enhance/pnjndmjhljjbdlbejeenkepdalokfooh)** (recommended)

Or load unpacked from a release ZIP:
1. Download the latest [release ZIP](https://github.com/pine2D/Pinboard-Bookmark-Enhanced/releases/latest)
2. Unzip
3. `chrome://extensions/` → enable **Developer mode** → **Load unpacked** → select the unzipped folder

The source checkout has a separate fixed development ID, so it can coexist with the Chrome Web Store version for testing. A release ZIP uses the Chrome Web Store ID, so those two versions cannot coexist in one Chrome profile. Chrome Sync can share settings after you enable settings sync on each device. Before replacing an older unpacked release, export its settings; after loading the new release, import that backup.

After installing, click the toolbar icon → paste your [Pinboard API token](https://pinboard.in/settings/password) → save

## Privacy

No tracking, no analytics, no telemetry. For new users, settings and credentials stay on this device by default. Ordinary settings sync is enabled separately on each device. Credential sync is one Chrome-account-wide choice, but only devices with settings sync enabled participate; other devices continue using local credentials. New users start with credential sync off, while upgrades keep it on when non-empty credentials already exist in Chrome Sync to avoid data loss. When enabled, API keys, tokens, passwords, and export credentials are shared through Chrome Sync and are obfuscated, not encrypted. Saved bookmarks, page content, and the offline queue never enter Chrome Sync. AI requests are sent **only** through features you enable or invoke (AI tags/summary, page Q&A, translation, selection explain, or the opt-in key-points skim) and go directly to the provider you configured. At install time, only Pinboard access is granted; AI, Jina, Batch-selected sites, and optional export and archive destinations request only the exact site permission when you use the corresponding action. Custom network endpoints must use HTTPS; HTTP is allowed only for `localhost`, `127.0.0.1`, and `[::1]`. Extension pages enforce a strict Content-Security-Policy (no remote code). Full policy: <https://pine2d.github.io/Pinboard-Bookmark-Enhanced/privacy.html>

## License

MIT. See [LICENSE](LICENSE).
