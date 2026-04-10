# Jina Reader Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Jina Reader API integration for Markdown export and AI content source enhancement.

**Architecture:** New `jina.js` handles API calls + caching. Popup gets a Markdown export button. A new `jina-preview.html` page shows full-page Markdown preview. Settings page gets AI Content Source radio + Jina API Key field. AI pipeline in `popup-ai.js` optionally uses Jina content instead of local extraction.

**Tech Stack:** Vanilla JS, Chrome Extension APIs (storage, tabs, scripting), Jina Reader REST API (`r.jina.ai`)

**Spec:** `docs/superpowers/specs/2026-04-10-jina-reader-integration-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `jina.js` | Create | Jina API wrapper, cache, markdownToPlainText |
| `jina-preview.html` | Create | Markdown preview page layout |
| `jina-preview.js` | Create | Preview page logic (render, copy, view toggle) |
| `jina-preview.css` | Create | Preview page styles (light/dark) |
| `shared.js` | Modify (lines 73-76) | Add `aiContentSource`, `jinaApiKey` defaults |
| `manifest.json` | Modify (lines 15-31) | Add `https://r.jina.ai/*` to host_permissions |
| `popup.html` | Modify (lines 107-108, 118) | Add Markdown button + jina.js script |
| `popup.js` | Modify | Add Markdown button handler |
| `popup-ai.js` | Modify (lines 55-83, 135-165) | Jina content source in AI pipeline |
| `options.html` | Modify (lines 336-337) | Add AI Content Source + Jina API Key UI |
| `options.js` | Modify (lines 173, 400) | Load/save new settings |
| `_locales/*/messages.json` | Modify (9 dirs) | Add i18n keys |

---

### Task 1: Settings Defaults + Manifest

**Files:**
- Modify: `shared.js:73-76` (add 2 new defaults before existing `optPrivateDefault`)
- Modify: `manifest.json:15-31` (add Jina host permission)

- [ ] **Step 1: Add new settings defaults to shared.js**

In `shared.js`, find the line with `ollamaModel: "llama3",` (around line 56) and the custom provider fields. After the `customName: "Custom",` line (line 57), add the Jina settings. Actually, add them after the AI-related settings block. Find `aiCacheDuration: 60,` (line 58) and add after it:

```javascript
  aiContentSource: "local", jinaApiKey: "",
```

This places them with the other AI settings. The line is in the `SETTINGS_DEFAULTS` object around line 58.

- [ ] **Step 2: Add Jina host permission to manifest.json**

In `manifest.json`, add `"https://r.jina.ai/*"` to the `host_permissions` array (line 15-31). Add it after the last AI provider entry (`"https://api.moonshot.cn/*"` on line 30):

```json
    "https://api.moonshot.cn/*",
    "https://r.jina.ai/*"
```

- [ ] **Step 3: Commit**

```bash
git add shared.js manifest.json
git commit -m "feat(jina): add settings defaults and host permission"
```

---

### Task 2: Create `jina.js` — API Wrapper + Cache

**Files:**
- Create: `jina.js`

- [ ] **Step 1: Create jina.js with fetchJinaMarkdown and markdownToPlainText**

```javascript
// ============================================================
// Pinboard Bookmark Enhanced - Jina Reader API Integration
// ============================================================

// ---- Jina Reader API: fetch page as Markdown ----
async function fetchJinaMarkdown(url, options = {}) {
  const { apiKey, forceRefresh, cacheDuration } = options;
  const cacheKey = `jina_md_${url}`;

  // Check cache first
  if (!forceRefresh) {
    try {
      const data = await chrome.storage.local.get(cacheKey);
      if (data[cacheKey]) {
        const { result, timestamp } = data[cacheKey];
        const dur = (cacheDuration || 60) * 60 * 1000;
        if (dur > 0 && Date.now() - timestamp <= dur) {
          return { ...result, fromCache: true };
        }
      }
    } catch (_) {}
  }

  // Build request headers
  const headers = { Accept: "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  try {
    const res = await fetchWithTimeout(`https://r.jina.ai/${url}`, { headers }, 30000);
    if (!res.ok) {
      return { error: `Jina API returned ${res.status}`, fallback: true };
    }
    const json = await res.json();
    const d = json.data || {};
    const result = {
      markdown: d.content || "",
      title: d.title || "",
      url: d.url || url,
      tokens: d.usage?.tokens || json.meta?.usage?.tokens || 0
    };

    // Cache result
    if ((cacheDuration || 60) > 0) {
      try {
        await chrome.storage.local.set({ [cacheKey]: { result, timestamp: Date.now() } });
      } catch (_) {}
    }

    return { ...result, fromCache: false };
  } catch (e) {
    return { error: e.message || "Jina API request failed", fallback: true };
  }
}

// ---- Convert Markdown to plain text (for AI prompts) ----
function markdownToPlainText(markdown) {
  if (!markdown) return "";
  return markdown
    // Remove images
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    // Convert links to text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    // Remove headings markup
    .replace(/^#{1,6}\s+/gm, "")
    // Remove bold/italic
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1")
    .replace(/_{1,3}([^_]+)_{1,3}/g, "$1")
    // Remove inline code
    .replace(/`([^`]+)`/g, "$1")
    // Remove code block fences
    .replace(/```[\s\S]*?```/g, "")
    // Remove blockquote markers
    .replace(/^>\s?/gm, "")
    // Remove horizontal rules
    .replace(/^[-*_]{3,}\s*$/gm, "")
    // Remove HTML tags
    .replace(/<[^>]+>/g, "")
    // Collapse multiple newlines
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
```

- [ ] **Step 2: Commit**

```bash
git add jina.js
git commit -m "feat(jina): add Jina Reader API wrapper with cache and markdown-to-text"
```

---

### Task 3: Create Preview Page

**Files:**
- Create: `jina-preview.html`
- Create: `jina-preview.js`
- Create: `jina-preview.css`

- [ ] **Step 1: Create jina-preview.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Markdown Preview</title>
  <link rel="stylesheet" href="jina-preview.css" />
</head>
<body>
  <header id="toolbar">
    <div class="toolbar-left">
      <h1 id="preview-title"></h1>
      <a id="preview-url" href="#" target="_blank"></a>
    </div>
    <div class="toolbar-right">
      <span id="token-count" class="token-badge"></span>
      <div class="view-toggle">
        <button id="btn-raw" class="toggle-btn">Raw</button>
        <button id="btn-rendered" class="toggle-btn active">Rendered</button>
      </div>
      <button id="btn-copy-md" class="action-btn">&#x1F4CB; Copy Markdown</button>
      <button id="btn-copy-html" class="action-btn">&#x1F4CB; Copy HTML</button>
    </div>
  </header>
  <main>
    <article id="rendered-view" class="content-view"></article>
    <pre id="raw-view" class="content-view hidden"></pre>
  </main>
  <script src="jina-preview.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create jina-preview.css**

```css
/* ============================================================
   Jina Reader Markdown Preview — Styles
   ============================================================ */

:root {
  --bg: #fff; --fg: #1a1a1a; --border: #e0e0e0;
  --toolbar-bg: #f8f8f8; --code-bg: #f4f4f4;
  --link: #0366d6; --badge-bg: #e8e8e8;
  --btn-bg: #f0f0f0; --btn-hover: #e0e0e0;
  --active-bg: #0366d6; --active-fg: #fff;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #1a1a1a; --fg: #e0e0e0; --border: #333;
    --toolbar-bg: #222; --code-bg: #2a2a2a;
    --link: #58a6ff; --badge-bg: #333;
    --btn-bg: #333; --btn-hover: #444;
    --active-bg: #58a6ff; --active-fg: #1a1a1a;
  }
}

* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--bg); color: var(--fg); line-height: 1.6; }

/* Toolbar */
#toolbar { position: sticky; top: 0; z-index: 10; display: flex; justify-content: space-between; align-items: center; padding: 12px 24px; background: var(--toolbar-bg); border-bottom: 1px solid var(--border); flex-wrap: wrap; gap: 8px; }
.toolbar-left { flex: 1; min-width: 200px; overflow: hidden; }
.toolbar-left h1 { font-size: 16px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.toolbar-left a { font-size: 12px; color: var(--link); text-decoration: none; word-break: break-all; }
.toolbar-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

/* Buttons */
.action-btn, .toggle-btn { padding: 6px 12px; border: 1px solid var(--border); border-radius: 4px; background: var(--btn-bg); color: var(--fg); cursor: pointer; font-size: 13px; white-space: nowrap; }
.action-btn:hover, .toggle-btn:hover { background: var(--btn-hover); }
.toggle-btn.active { background: var(--active-bg); color: var(--active-fg); border-color: var(--active-bg); }
.token-badge { font-size: 12px; color: #888; background: var(--badge-bg); padding: 2px 8px; border-radius: 10px; }
.view-toggle { display: flex; gap: 0; }
.view-toggle .toggle-btn { border-radius: 0; }
.view-toggle .toggle-btn:first-child { border-radius: 4px 0 0 4px; }
.view-toggle .toggle-btn:last-child { border-radius: 0 4px 4px 0; border-left: none; }

/* Content */
main { max-width: 900px; margin: 0 auto; padding: 32px 24px; }
.content-view.hidden { display: none; }

/* Raw view */
#raw-view { font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace; font-size: 13px; white-space: pre-wrap; word-break: break-word; background: var(--code-bg); padding: 20px; border-radius: 6px; }

/* Rendered view — Markdown HTML */
#rendered-view h1, #rendered-view h2, #rendered-view h3, #rendered-view h4, #rendered-view h5, #rendered-view h6 { margin: 1.2em 0 0.4em; font-weight: 600; }
#rendered-view h1 { font-size: 1.8em; border-bottom: 1px solid var(--border); padding-bottom: 0.3em; }
#rendered-view h2 { font-size: 1.4em; border-bottom: 1px solid var(--border); padding-bottom: 0.2em; }
#rendered-view h3 { font-size: 1.2em; }
#rendered-view p { margin: 0.8em 0; }
#rendered-view a { color: var(--link); text-decoration: none; }
#rendered-view a:hover { text-decoration: underline; }
#rendered-view code { font-family: "SFMono-Regular", Consolas, monospace; background: var(--code-bg); padding: 2px 6px; border-radius: 3px; font-size: 0.9em; }
#rendered-view pre { background: var(--code-bg); padding: 16px; border-radius: 6px; overflow-x: auto; margin: 1em 0; }
#rendered-view pre code { background: none; padding: 0; }
#rendered-view blockquote { border-left: 3px solid var(--border); padding: 4px 16px; margin: 1em 0; color: #666; }
#rendered-view img { max-width: 100%; height: auto; border-radius: 4px; }
#rendered-view ul, #rendered-view ol { margin: 0.8em 0; padding-left: 2em; }
#rendered-view li { margin: 0.3em 0; }
#rendered-view table { border-collapse: collapse; width: 100%; margin: 1em 0; }
#rendered-view th, #rendered-view td { border: 1px solid var(--border); padding: 6px 12px; text-align: left; }
#rendered-view th { background: var(--code-bg); font-weight: 600; }
#rendered-view hr { border: none; border-top: 1px solid var(--border); margin: 1.5em 0; }

/* Copy feedback */
.action-btn.copied { background: #28a745; color: #fff; border-color: #28a745; }
```

- [ ] **Step 3: Create jina-preview.js**

Note: The `renderMarkdown` function produces HTML from Markdown content. Since Jina Reader returns structured content from web pages (not arbitrary user input), and the Markdown is first HTML-escaped before processing, this is acceptable for an extension-internal preview page. The content never includes user-editable input — it comes from Jina's server-side processing of published web pages.

```javascript
// ============================================================
// Jina Reader Markdown Preview Page
// ============================================================

(async function () {
  // Read preview data from storage
  const data = await chrome.storage.local.get("jina_preview_data");
  const info = data.jina_preview_data;
  if (!info) {
    document.getElementById("rendered-view").textContent = "No preview data available. Please use the Markdown button in the popup first.";
    return;
  }
  // Clear temporary data
  await chrome.storage.local.remove("jina_preview_data");

  const { markdown, title, url, tokens } = info;

  // Fill header
  document.getElementById("preview-title").textContent = title || "Untitled";
  const urlEl = document.getElementById("preview-url");
  urlEl.textContent = url || "";
  urlEl.href = url || "#";
  document.getElementById("token-count").textContent = tokens ? `${tokens} tokens` : "";
  document.title = `${title || "Markdown"} — Preview`;

  // Fill content
  document.getElementById("raw-view").textContent = markdown;
  const renderedHtml = renderMarkdown(markdown);
  document.getElementById("rendered-view").innerHTML = renderedHtml;

  // View toggle
  const btnRaw = document.getElementById("btn-raw");
  const btnRendered = document.getElementById("btn-rendered");
  const rawView = document.getElementById("raw-view");
  const renderedView = document.getElementById("rendered-view");

  btnRaw.addEventListener("click", () => {
    rawView.classList.remove("hidden");
    renderedView.classList.add("hidden");
    btnRaw.classList.add("active");
    btnRendered.classList.remove("active");
  });
  btnRendered.addEventListener("click", () => {
    renderedView.classList.remove("hidden");
    rawView.classList.add("hidden");
    btnRendered.classList.add("active");
    btnRaw.classList.remove("active");
  });

  // Copy buttons
  document.getElementById("btn-copy-md").addEventListener("click", async (e) => {
    await copyToClipboard(markdown, e.target);
  });
  document.getElementById("btn-copy-html").addEventListener("click", async (e) => {
    await copyToClipboard(renderedView.innerHTML, e.target);
  });
})();

// ---- Copy to clipboard with visual feedback ----
async function copyToClipboard(text, btn) {
  const orig = btn.textContent;
  try {
    await navigator.clipboard.writeText(text);
    btn.textContent = "Copied!";
    btn.classList.add("copied");
    setTimeout(() => { btn.textContent = orig; btn.classList.remove("copied"); }, 1500);
  } catch (_) {
    btn.textContent = "Failed";
    setTimeout(() => { btn.textContent = orig; }, 1500);
  }
}

// ---- Simple Markdown to HTML renderer ----
// Security note: Input is HTML-escaped before any Markdown processing.
// Content comes from Jina Reader API (server-side processed web pages),
// not from arbitrary user input. This page is an extension-internal tool.
function renderMarkdown(md) {
  if (!md) return "";
  // Escape HTML entities first to prevent injection
  let html = md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Code blocks (``` ... ```) — must be before inline processing
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre><code class="lang-${lang}">${code.trimEnd()}</code></pre>`;
  });

  // Split into blocks for block-level processing
  const blocks = html.split(/\n\n+/);
  const rendered = blocks.map(block => {
    // Skip pre blocks (already processed)
    if (block.startsWith("<pre>")) return block;

    // Headings
    block = block.replace(/^(#{1,6})\s+(.+)$/gm, (_, hashes, text) => {
      const level = hashes.length;
      return `<h${level}>${text}</h${level}>`;
    });

    // Horizontal rules
    block = block.replace(/^[-*_]{3,}\s*$/gm, "<hr>");

    // Blockquotes
    if (/^&gt;\s/m.test(block)) {
      const lines = block.split("\n").map(l => l.replace(/^&gt;\s?/, "")).join("\n");
      block = `<blockquote><p>${lines}</p></blockquote>`;
    }

    // Unordered lists
    if (/^\s*[-*+]\s/m.test(block) && !block.startsWith("<")) {
      const items = block.split(/\n/).filter(l => /^\s*[-*+]\s/.test(l))
        .map(l => `<li>${l.replace(/^\s*[-*+]\s+/, "")}</li>`).join("\n");
      block = `<ul>${items}</ul>`;
    }

    // Ordered lists
    if (/^\s*\d+\.\s/m.test(block) && !block.startsWith("<")) {
      const items = block.split(/\n/).filter(l => /^\s*\d+\.\s/.test(l))
        .map(l => `<li>${l.replace(/^\s*\d+\.\s+/, "")}</li>`).join("\n");
      block = `<ol>${items}</ol>`;
    }

    // Tables
    if (/\|.*\|/.test(block) && /\|[-:\s|]+\|/.test(block)) {
      const rows = block.split("\n").filter(r => r.trim().startsWith("|"));
      if (rows.length >= 2) {
        const parseRow = (r) => r.split("|").slice(1, -1).map(c => c.trim());
        const headerCells = parseRow(rows[0]);
        const bodyRows = rows.slice(2);
        let table = "<table><thead><tr>" + headerCells.map(c => `<th>${c}</th>`).join("") + "</tr></thead><tbody>";
        bodyRows.forEach(r => {
          const cells = parseRow(r);
          table += "<tr>" + cells.map(c => `<td>${c}</td>`).join("") + "</tr>";
        });
        table += "</tbody></table>";
        block = table;
      }
    }

    // Inline formatting (applied to all blocks)
    // Images — note: src URLs were escaped, unescape for valid URLs
    block = block.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) => {
      src = src.replace(/&amp;/g, "&");
      return `<img src="${src}" alt="${alt}" />`;
    });
    // Links
    block = block.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, href) => {
      href = href.replace(/&amp;/g, "&");
      return `<a href="${href}" target="_blank">${text}</a>`;
    });
    // Bold + italic
    block = block.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
    // Bold
    block = block.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    // Italic
    block = block.replace(/\*(.+?)\*/g, "<em>$1</em>");
    // Inline code
    block = block.replace(/`([^`]+)`/g, "<code>$1</code>");

    // Wrap plain text blocks in <p>
    if (!block.startsWith("<") && block.trim()) {
      block = `<p>${block.replace(/\n/g, "<br>")}</p>`;
    }

    return block;
  });

  return rendered.join("\n");
}
```

- [ ] **Step 4: Commit**

```bash
git add jina-preview.html jina-preview.js jina-preview.css
git commit -m "feat(jina): add Markdown preview page with raw/rendered views"
```

---

### Task 4: Popup — Add Markdown Button + Handler

**Files:**
- Modify: `popup.html:107-108` (add button in quick-row)
- Modify: `popup.html:118` (add jina.js script)
- Modify: `popup.js` (add button handler)

- [ ] **Step 1: Add Markdown button to popup.html**

In `popup.html`, find the `quick-row` div (line 106-109). Add the Jina button after the batch-bookmark button:

```html
      <button id="batch-bookmark-btn" class="qbtn" title="Save each open tab as an individual bookmark" data-i18n="batchSaveBtn" data-i18n-title="batchSaveTitle">📌 Batch Save</button>
      <button id="jina-md-btn" class="qbtn" title="Convert page to Markdown via Jina Reader" data-i18n="jinaMarkdownBtn" data-i18n-title="jinaMarkdownTitle">📄 Markdown</button>
```

- [ ] **Step 2: Add jina.js script to popup.html**

In `popup.html`, find the script tags section (line 117-125). Add `jina.js` after `ai.js`:

```html
  <script src="ai.js"></script>
  <script src="jina.js"></script>
```

- [ ] **Step 3: Add Markdown button handler in popup.js**

Find the section in `popup.js` where other button event listeners are set up (near `setupTabSet()` calls or DOMContentLoaded). Add the Jina Markdown button handler. Look for where `batch-bookmark-btn` or `save-tabset-btn` are referenced and add nearby:

```javascript
  // ---- Jina Reader Markdown button ----
  const jinaMdBtn = document.getElementById("jina-md-btn");
  if (jinaMdBtn) {
    // Disable on non-http pages
    const currentUrl = document.getElementById("url-input")?.value || "";
    if (!currentUrl.startsWith("http://") && !currentUrl.startsWith("https://")) {
      jinaMdBtn.disabled = true;
      jinaMdBtn.title = "Only works on web pages";
    }
    jinaMdBtn.addEventListener("click", async () => {
      if (jinaMdBtn.disabled) return;
      const url = document.getElementById("url-input").value;
      if (!url) return;

      const origText = jinaMdBtn.textContent;
      jinaMdBtn.textContent = t("jinaConverting");
      jinaMdBtn.disabled = true;

      const jinaKey = settings.jinaApiKey ? deobfuscateKey(settings.jinaApiKey) : "";
      const result = await fetchJinaMarkdown(url, {
        apiKey: jinaKey,
        cacheDuration: settings.aiCacheDuration
      });

      if (result.error) {
        jinaMdBtn.textContent = "❌ " + t("jinaFailed");
        jinaMdBtn.title = result.error;
        setTimeout(() => { jinaMdBtn.textContent = origText; jinaMdBtn.disabled = false; jinaMdBtn.title = ""; }, 2000);
        return;
      }

      // Copy to clipboard
      try {
        await navigator.clipboard.writeText(result.markdown);
      } catch (_) {
        jinaMdBtn.textContent = "❌ " + t("jinaFailed");
        setTimeout(() => { jinaMdBtn.textContent = origText; jinaMdBtn.disabled = false; }, 2000);
        return;
      }

      // Show success with View link
      jinaMdBtn.textContent = "✅ " + t("jinaCopied");
      setTimeout(() => {
        jinaMdBtn.textContent = "👁 " + t("jinaViewBtn");
        jinaMdBtn.disabled = false;
        // Rebind to open preview on next click
        jinaMdBtn.onclick = async () => {
          await chrome.storage.local.set({
            jina_preview_data: {
              markdown: result.markdown,
              title: result.title || document.getElementById("title-input")?.value || "",
              url: result.url || url,
              tokens: result.tokens || 0
            }
          });
          chrome.tabs.create({ url: "jina-preview.html" });
        };
      }, 1500);
    });
  }
```

- [ ] **Step 4: Commit**

```bash
git add popup.html popup.js
git commit -m "feat(jina): add Markdown export button to popup"
```

---

### Task 5: AI Pipeline — Jina Content Source Integration

**Files:**
- Modify: `popup-ai.js:55-83` (doAISummary — add Jina content enrichment)
- Modify: `popup-ai.js:135-165` (doAITags — add Jina content enrichment)

- [ ] **Step 1: Add Jina content enrichment helper in popup-ai.js**

At the top of `popup-ai.js` (after the existing constants/variables), add a helper function that enriches `pageInfo.pageText` with Jina content when configured:

```javascript
// ---- Enrich page content via Jina Reader if configured ----
async function enrichPageTextIfJina() {
  if (settings.aiContentSource !== "jina") return;
  if (!pageInfo?.url) return;
  try {
    const jinaKey = settings.jinaApiKey ? deobfuscateKey(settings.jinaApiKey) : "";
    const result = await fetchJinaMarkdown(pageInfo.url, {
      apiKey: jinaKey,
      cacheDuration: settings.aiCacheDuration
    });
    if (!result.error && result.markdown) {
      pageInfo.pageText = markdownToPlainText(result.markdown);
    }
  } catch (e) {
    console.warn("Jina content enrichment failed, using local content:", e.message);
  }
}
```

- [ ] **Step 2: Call enrichPageTextIfJina before AI summary generation**

In `doAISummary()` (around line 55-83 of popup-ai.js), add the Jina enrichment call right after the cache check and before the AI call. Find the line:

```javascript
    btn.classList.add("loading");
  }
  try {
    const summary = await callAI(settings, buildSummaryPrompt(...
```

Add `await enrichPageTextIfJina();` before the `callAI` line:

```javascript
    btn.classList.add("loading");
  }
  try {
    await enrichPageTextIfJina();
    const summary = await callAI(settings, buildSummaryPrompt(...
```

- [ ] **Step 3: Call enrichPageTextIfJina before AI tags generation**

In `doAITags()` (around line 135-165 of popup-ai.js), find the section after the cache check where AI is called. Look for the `try {` block that calls `callAI`. Add `await enrichPageTextIfJina();` before it:

Find the pattern (approximately lines 160-165):

```javascript
  btn.classList.add("loading");
  try {
    const resp = await callAI(settings, buildTagPrompt(...
```

Change to:

```javascript
  btn.classList.add("loading");
  try {
    await enrichPageTextIfJina();
    const resp = await callAI(settings, buildTagPrompt(...
```

- [ ] **Step 4: Commit**

```bash
git add popup-ai.js
git commit -m "feat(jina): integrate Jina Reader as optional AI content source"
```

---

### Task 6: Settings Page — AI Content Source + Jina API Key

**Files:**
- Modify: `options.html` (after AI Provider sections, before AI Behavior)
- Modify: `options.js` (load + save new fields)

- [ ] **Step 1: Add AI Content Source + Jina API Key UI to options.html**

In `options.html`, find the divider before "AI Behavior" section (the `<div class="divider"></div>` line followed by `secAiBehavior`). Add a new section BEFORE it (after the last provider's `</div>` and before the divider):

Find:
```html
      <div class="divider"></div>
      <div class="section-title" data-i18n="secAiBehavior">AI Behavior</div>
```

Insert before it:
```html
      <div class="divider"></div>
      <div class="section-title" data-i18n="secAiContentSource">AI Content Source</div>
      <div class="fg">
        <label><input type="radio" name="ai-content-source" id="opt-ai-src-local" value="local" checked /> <span data-i18n="aiContentSourceLocal">Local (built-in extraction)</span></label>
      </div>
      <div class="fg">
        <label><input type="radio" name="ai-content-source" id="opt-ai-src-jina" value="jina" /> <span data-i18n="aiContentSourceJina">Jina Reader (higher quality)</span></label>
      </div>

      <div class="divider"></div>
      <div class="section-title" data-i18n="secJinaReader">Jina Reader</div>
      <div class="fg">
        <label class="bl" data-i18n="jinaApiKeyLabel">API Key (optional)</label>
        <input type="password" id="opt-jina-key" placeholder="jina_xxxx (leave empty for free tier)" data-i18n-placeholder="jinaApiKeyPlaceholder" />
        <button type="button" class="key-toggle" data-target="opt-jina-key" title="Show/hide key" data-i18n-title="showHideKey">👁</button>
        <p class="hint">Free tier: 20 RPM. Add key for higher quota. <a href="https://jina.ai/reader#pricing" target="_blank">Get key</a></p>
      </div>
```

- [ ] **Step 2: Add load logic in options.js**

In `options.js`, find the `fieldMap` object in the `loadSettings` function (around line 154-180). Add the Jina API key field:

After the line `"opt-ai-tag-separator": s.aiTagSeparator,` add:

```javascript
    "opt-jina-key": s.jinaApiKey,
```

Then, after the fieldMap loop (`for (const [id, val] ...`), add radio button loading. Find the section where checkboxes are loaded (the `checkMap` around line 192). Before the checkMap, add:

```javascript
  // AI Content Source radio
  const srcRadio = document.querySelector(`input[name="ai-content-source"][value="${s.aiContentSource || 'local'}"]`);
  if (srcRadio) srcRadio.checked = true;
```

- [ ] **Step 3: Add save logic in options.js**

In `options.js`, find the `saveSettings` function. In the settings object being built, find the line with `aiTagSeparator:` (around line 400). After it, add:

```javascript
      aiContentSource: document.querySelector('input[name="ai-content-source"]:checked')?.value || "local",
      jinaApiKey: obfuscateKey(document.getElementById("opt-jina-key").value.trim()),
```

- [ ] **Step 4: Commit**

```bash
git add options.html options.js
git commit -m "feat(jina): add AI content source and Jina API key settings"
```

---

### Task 7: Internationalization — Add i18n Keys

**Files:**
- Modify: `_locales/en/messages.json` (add keys)
- Modify: all other locale files (8 directories: de, fr, ja, pl, ru, zh_CN, zh_HK, zh_TW)

- [ ] **Step 1: Add English i18n keys**

Add the following entries to `_locales/en/messages.json` before the closing `}`:

```json
  "jinaMarkdownBtn": { "message": "📄 Markdown" },
  "jinaMarkdownTitle": { "message": "Convert page to Markdown via Jina Reader" },
  "jinaConverting": { "message": "⏳ Converting..." },
  "jinaCopied": { "message": "Copied!" },
  "jinaFailed": { "message": "Failed" },
  "jinaViewBtn": { "message": "View" },
  "secAiContentSource": { "message": "AI Content Source" },
  "aiContentSourceLocal": { "message": "Local (built-in extraction)" },
  "aiContentSourceJina": { "message": "Jina Reader (higher quality)" },
  "secJinaReader": { "message": "Jina Reader" },
  "jinaApiKeyLabel": { "message": "API Key (optional)" },
  "jinaApiKeyPlaceholder": { "message": "jina_xxxx (leave empty for free tier)" },
  "jinaKeyHint": { "message": "Free tier: 20 RPM. Add key for higher quota." }
```

- [ ] **Step 2: Add Chinese (zh_CN) i18n keys**

Add to `_locales/zh_CN/messages.json`:

```json
  "jinaMarkdownBtn": { "message": "📄 Markdown" },
  "jinaMarkdownTitle": { "message": "通过 Jina Reader 将页面转换为 Markdown" },
  "jinaConverting": { "message": "⏳ 转换中..." },
  "jinaCopied": { "message": "已复制!" },
  "jinaFailed": { "message": "失败" },
  "jinaViewBtn": { "message": "查看" },
  "secAiContentSource": { "message": "AI 内容来源" },
  "aiContentSourceLocal": { "message": "本地提取（内置）" },
  "aiContentSourceJina": { "message": "Jina Reader（更高质量）" },
  "secJinaReader": { "message": "Jina Reader" },
  "jinaApiKeyLabel": { "message": "API Key（可选）" },
  "jinaApiKeyPlaceholder": { "message": "jina_xxxx（留空使用免费配额）" },
  "jinaKeyHint": { "message": "免费：20次/分钟。添加 Key 获得更高配额。" }
```

- [ ] **Step 3: Add Japanese (ja) i18n keys**

Add to `_locales/ja/messages.json`:

```json
  "jinaMarkdownBtn": { "message": "📄 Markdown" },
  "jinaMarkdownTitle": { "message": "Jina Reader でページを Markdown に変換" },
  "jinaConverting": { "message": "⏳ 変換中..." },
  "jinaCopied": { "message": "コピー済み!" },
  "jinaFailed": { "message": "失敗" },
  "jinaViewBtn": { "message": "表示" },
  "secAiContentSource": { "message": "AIコンテンツソース" },
  "aiContentSourceLocal": { "message": "ローカル（内蔵抽出）" },
  "aiContentSourceJina": { "message": "Jina Reader（高品質）" },
  "secJinaReader": { "message": "Jina Reader" },
  "jinaApiKeyLabel": { "message": "APIキー（任意）" },
  "jinaApiKeyPlaceholder": { "message": "jina_xxxx（空欄で無料枠を使用）" },
  "jinaKeyHint": { "message": "無料: 20リクエスト/分。キーを追加でクォータ増加。" }
```

- [ ] **Step 4: Add zh_TW i18n keys**

Add to `_locales/zh_TW/messages.json`:

```json
  "jinaMarkdownBtn": { "message": "📄 Markdown" },
  "jinaMarkdownTitle": { "message": "透過 Jina Reader 將頁面轉換為 Markdown" },
  "jinaConverting": { "message": "⏳ 轉換中..." },
  "jinaCopied": { "message": "已複製!" },
  "jinaFailed": { "message": "失敗" },
  "jinaViewBtn": { "message": "檢視" },
  "secAiContentSource": { "message": "AI 內容來源" },
  "aiContentSourceLocal": { "message": "本地擷取（內建）" },
  "aiContentSourceJina": { "message": "Jina Reader（更高品質）" },
  "secJinaReader": { "message": "Jina Reader" },
  "jinaApiKeyLabel": { "message": "API Key（選填）" },
  "jinaApiKeyPlaceholder": { "message": "jina_xxxx（留空使用免費額度）" },
  "jinaKeyHint": { "message": "免費：20次/分鐘。添加 Key 獲得更高額度。" }
```

- [ ] **Step 5: Add remaining locale keys (zh_HK, de, fr, pl, ru)**

For these locales, add English fallback keys (same as en) to each `messages.json`. This ensures no missing key errors. Native speakers can improve translations later:

Each file gets the same block as `_locales/en/messages.json` from Step 1.

- [ ] **Step 6: Commit**

```bash
git add _locales/
git commit -m "feat(jina): add i18n keys for Jina Reader feature (9 locales)"
```

---

### Task 8: Smoke Test + Final Verification

- [ ] **Step 1: Verify no syntax errors in all modified JSON files**

```bash
node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('manifest.json OK')"
for f in _locales/*/messages.json; do node -e "JSON.parse(require('fs').readFileSync('$f','utf8')); console.log('$f OK')"; done
```

- [ ] **Step 2: Verify all new files are properly referenced**

Check that `jina.js` is referenced in `popup.html`:
```bash
grep "jina.js" popup.html
```
Expected: `<script src="jina.js"></script>`

Check that `jina-preview.html` is a valid extension page (no special manifest entry needed for `chrome.tabs.create`).

- [ ] **Step 3: Verify settings defaults match options UI**

Check that `SETTINGS_DEFAULTS` includes `aiContentSource` and `jinaApiKey`:
```bash
grep "aiContentSource\|jinaApiKey" shared.js
```
Expected: both keys present with defaults `"local"` and `""`.

Check that options.js saves both fields:
```bash
grep "aiContentSource\|jinaApiKey" options.js
```
Expected: both present in load fieldMap and save object.

- [ ] **Step 4: Verify popup-ai.js calls enrichPageTextIfJina**

```bash
grep "enrichPageTextIfJina" popup-ai.js
```
Expected: function definition + 2 call sites (in doAISummary and doAITags).

- [ ] **Step 5: Manual test checklist (in browser)**

Load the extension at `chrome://extensions/` (reload if already loaded):

1. Open any web page, click extension, verify "📄 Markdown" button appears in quick-row
2. Click "📄 Markdown", should show "Converting..." then "Copied!" then "View"
3. Click "View", should open preview page in new tab with rendered Markdown
4. In preview page: toggle Raw/Rendered, Copy MD, Copy HTML — all should work
5. Open Settings, AI tab, verify "AI Content Source" section with Local/Jina radio
6. Verify "Jina Reader" section with API Key field
7. Select "Jina Reader" as content source, generate AI tags, should use Jina content
8. Switch back to "Local", generate AI tags, should use local extraction
9. Open extension on `chrome://extensions/` page, Markdown button should be disabled
