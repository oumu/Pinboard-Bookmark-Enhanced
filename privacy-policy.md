# Privacy Policy — Pinboard Bookmark Plus

**Last updated:** 2026-04-06

## Data Collection

Pinboard Bookmark Plus does **not** collect, transmit, or store any personal data on external servers. The extension has no analytics, no tracking, and no telemetry.

## Data Storage

All data is stored **locally** on your device using Chrome's built-in storage APIs:

| Data | Storage | Synced via Google Account |
|------|---------|--------------------------|
| Settings & preferences | `chrome.storage.sync` | Yes |
| API keys (obfuscated) | `chrome.storage.sync` | Yes |
| Custom CSS & themes | `chrome.storage.sync` (chunked) | Yes |
| AI result cache | `chrome.storage.local` | No |
| Tag cache | `chrome.storage.local` | No |

## Network Requests

The extension only makes network requests to services **you explicitly configure**:

1. **Pinboard API** (`api.pinboard.in`) — to save, retrieve, and manage your bookmarks. Authenticated with your Pinboard API token.

2. **AI Provider APIs** (only when you click "AI tags" or "AI summary") — page title, URL, and a portion of page text are sent to your chosen AI provider to generate tags or summaries. Supported providers include OpenAI, Anthropic, Google Gemini, DeepSeek, Groq, Mistral, Cohere, SiliconFlow, Qwen, MiniMax, OpenRouter, Ollama, or a custom endpoint. **No data is sent to any AI provider unless you explicitly trigger it.**

3. **Pinboard website** (`pinboard.in`) — the content script injects custom CSS styles onto pinboard.in pages. No data is extracted or transmitted.

## Permissions

| Permission | Purpose |
|------------|---------|
| `activeTab` | Read current page info (title, URL, selected text) for bookmarking |
| `storage` | Store settings and caches locally |
| `scripting` | Extract page content for AI features |
| `tabs` | Access tab URLs for bookmark status and batch save |
| `notifications` | Show save confirmations for quick save / read later |
| `alarms` | Periodic cache cleanup and offline queue processing |
| `host_permissions` | API calls to Pinboard and configured AI providers |

## Third-Party Services

The extension communicates with third-party services **only at your direction**:
- **Pinboard** — your bookmark service, using your API token
- **AI providers** — only the provider you select and configure with your own API key

No data is shared with any other third party.

## Changes

If this privacy policy changes, the update will be included in the extension release notes.

## Contact

For questions about this privacy policy, open an issue at: https://github.com/oumu/Pinboard-Bookmark-Plus/issues
