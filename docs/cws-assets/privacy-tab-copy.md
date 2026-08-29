# CWS privacy-tab copy (paste-ready)

> Canonical archive of the Chrome Web Store developer-dashboard privacy tab.
> Update this file whenever the dashboard text changes, and re-check it against
> docs/privacy.md whenever a release adds a data exit or permission.
> Last synced: 2026-08-29 (provider count lowered to 13 after the GitHub Models
> service retirement and provider removal in v2.107.6; everything else
> unchanged and still aligned with docs/privacy.md).

## Single purpose description (891/1000)

Save, enrich, read, and export Pinboard bookmarks. The extension captures the page you choose, optionally extracts readable article content, generates AI tags, summaries, translations, or Ask-the-page answers with the provider you select, then saves or exports the result to destinations you configure.

Workflow: toolbar or shortcut -> review the current page -> optional AI or Markdown preview/export -> save to Pinboard.

Related features: AI tags/summaries, translation, Ask/Explain, key-points skim; batch save, offline queue, optional Wayback archiving; Send to Obsidian, GitHub Gist, or a webhook; file-based settings backup; tag autocomplete and cleanup; pinboard.in themes.

Data: local-first. No developer servers, no analytics, no telemetry, no sale of data. Page URLs and content leave your device only when you take an action, and only to Pinboard or the service you configured.

## activeTab justification (unchanged, accurate)

Read the active tab's URL and title to pre-fill the bookmark form when you open the popup, and to scope content extraction to the tab you are acting on.

## storage justification (tail sentence replaced)

Persist settings, credentials, and local caches needed for the bookmark workflow: Pinboard token, AI provider keys, export-target tokens, preferences, custom CSS/themes, bookmark-status cache, tag cache/tag-cleanup state, AI result cache, offline queue, Markdown preview data, highlights/notes, and the Wayback log. Stored in chrome.storage.local by default; selected non-content settings sync via chrome.storage.sync only if you enable settings sync, and obfuscated credentials join only with the separate account-wide API-key sync option. Nothing is sent to any developer server.

## scripting justification (612/1000)

Inject the bundled Defuddle extractor (and optional per-site extraction rules) into the page to pull clean article text/HTML. This runs only on explicit user action: clicking AI tags or AI summary, quick-saving or batch-saving with AI enabled, or opening Markdown preview (button or Alt+Shift+M, including the in-preview engine toggle, Translate, Ask, and Explain). It never runs on popup open or passively. Batch save with AI first asks you to approve the exact origins of the selected tabs, listed in the prompt, so those non-active tabs can be read; the extension never requests an all-sites grant at runtime.

## tabs justification (unchanged, accurate)

Enumerate open tabs for batch save, and read tab titles/URLs for "save tab set" (which POSTs them to pinboard.in/tabs/save/ using your existing pinboard.in login cookie, then opens tabs/show for you to confirm). Also read the active tab's URL/title on tab switch or navigation to update the toolbar icon (bookmarked state) and pre-fill the popup.

## notifications justification (unchanged, accurate)

Show success/failure/queued feedback after save operations (quick-save, read-later, batch, tab-set, offline retry) and provide a 30-second Undo button that deletes the just-saved bookmark via the Pinboard API.

## alarms justification (352/1000)

Run recurring background tasks: keep the service worker warm during active use, re-prime the settings cache, expire the bookmark-status cache, retry the offline save queue, refresh the unread badge, and optionally prewarm the Pinboard tag list. Alarms themselves send nothing; tasks that contact Pinboard do so only while their configuration allows it.

## Host permission justification (979/1000)

Static hosts: api.pinboard.in and pinboard.in, for saving/fetching/managing bookmarks, pinboard.in themes and tag sorting, and cookie-based Save Tab Set. 13 user-selectable AI providers plus Jina Reader cover optional AI/extraction actions; each is contacted only when configured and only when you trigger the action. Optional hosts are requested at runtime as exact origins only: the selected tabs of a batch save, your custom OpenAI-compatible endpoint or non-loopback Ollama, GitHub Gist export, webhook export, web.archive.org for opt-in Wayback archiving, and the image origins needed when you choose the Embed (offline) export policy or click Fix on hotlink-blocked preview images. localhost/127.0.0.1 remain allowed for a local Ollama. The manifest ceiling is https://*/* plus literal-loopback HTTP only; it merely lets Chrome offer these exact-origin prompts, and the extension never requests the ceiling patterns themselves. Page content goes only to the service you selected, never to the developer.

## declarativeNetRequestWithHostAccess justification (481/1000; field will appear on next submit)

Set the Referer header (to the article page's origin only) on the extension's own image re-fetches during two user actions in Markdown preview: the Fix button for hotlink-blocked images, and the Embed (offline) export retry. Implemented as a temporary session rule scoped to the granted image origins, the fetch request type, and that single preview tab; the rule is removed when the run finishes. It grants no page access by itself and never touches other tabs' or sites' traffic.

## identity justification (981/1000)

Obtain an OAuth access token for the optional Google Drive vocabulary sync, and nothing else. This is an optional permission: nothing requests it until you click Connect Google Drive in settings, and every other feature works without it. The only scope requested is drive.appdata, which reaches the extension's own hidden application-data folder and cannot read, list, or modify any other file in your Drive. It is used to store vocabulary batches for the current Pinboard account so your devices converge on the same list, plus one Drive about.get call so settings can show which account is connected. identity is never used to sign you in to this extension, to identify you to the developer, or for analytics or advertising; no account data reaches anyone but Google. Background syncs only check whether the permission is already granted and never open an OAuth prompt. Disconnect this device removes the cached token and this permission, and leaves your local vocabulary intact.

## Remote code

No, I am not using remote code.

## Data usage checkboxes (matches docs/privacy.md "Chrome Web Store data categories")

Checked: Personally identifiable information / Authentication information / Web history / Website content.
Unchecked: Health / Financial and payment / Personal communications / Location / User activity.
All three certification boxes: checked.

## Privacy policy URL

https://pine2d.github.io/Pinboard-Bookmark-Enhanced/privacy.html
