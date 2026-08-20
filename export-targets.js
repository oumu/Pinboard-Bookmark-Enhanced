// ============================================================
// Pinboard Bookmark Enhanced — Export Targets registry (PURE)
// No DOM / chrome / fetch. Loaded by md-preview.html, options.html, tests.
// Depends on md-convert.js globals (applyFrontmatter, buildObsidianUri,
// safeFilename) and shared.js (pbpEndpointOriginPattern).
// ============================================================

// Safe ceiling for a custom-scheme URI handed to the OS protocol launcher.
// HARD WALL = Windows: ShellExecute caps ~2048, and Chromium's external-protocol
// prompt SILENTLY no-ops its "Open" button above ~2046 chars (crbug 727909).
// macOS/Linux allow far more, but this single cross-platform constant stays
// Windows-safe. DO NOT raise above ~2000 — past the wall content is silently
// LOST (worse than the clipboard fallback). Long bodies go via clipboard /
// the HTTP token API, never a longer URL. encodeURIComponent inflates markdown
// ~1.6x (ASCII) / ~9x (CJK), so even 2000 holds only ~1200 ASCII / ~220 CJK raw chars.
const PBP_URI_BUDGET = 2000;

// Remove a single leading YAML frontmatter block ("---\n...\n---"). Idempotent;
// no-op when absent. (rawBody from getViewMarkdown() is already YAML-free; this
// guards callers that pass a frontmattered string.)
function pbpStripFrontmatter(md) {
  return String(md == null ? "" : md).replace(/^﻿?---\r?\n[\s\S]*?\r?\n---(?:\r?\n\r?\n?)?/, "");
}

// Body for a .md FILE (download / long-content fallback) per the row's
// frontmatter policy. rawBody is expected YAML-free (getViewMarkdown()).
function pbpBuildFileBody(id, meta, rawBody) {
  const row = PBP_EXPORT_TARGETS[id];
  rawBody = String(rawBody == null ? "" : rawBody);
  const policy = row ? row.frontmatter : "strip";
  if (policy === "inline") return applyFrontmatter(rawBody, meta || {}, {}); // md-convert.js
  return rawBody; // "strip"
}

// Is the assembled URI too long to hand to the OS protocol launcher?
function pbpUriTooLong(uri) { return String(uri || "").length > PBP_URI_BUDGET; }

// Show the configuration warning for any endpoint the runtime will block.
function pbpWebhookHttpWarn(url) {
  const raw = String(url || "").trim();
  return !!raw && !pbpEndpointOriginPattern(raw);
}

function pbpExportTargetSecretValue(cfg, key) {
  const value = String((cfg && cfg[key]) || "");
  return typeof deobfuscateKey === "function" ? deobfuscateKey(value) : value;
}

// Inline SVG icons (no emoji — font-fallback rule). 16px line icons.
const _PBP_ICON_OBSIDIAN =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M6 3h12l4 6-10 13L2 9Z"/><path d="M11 3 8 9l4 13 4-13-3-6"/><path d="M2 9h20"/></svg>';
const _PBP_ICON_GITHUB =
  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 1C5.9 1 1 5.9 1 12c0 4.9 3.2 9 7.6 10.4.6.1.8-.2.8-.5v-1.8c-3.1.7-3.8-1.5-3.8-1.5-.5-1.3-1.2-1.6-1.2-1.6-1-.7.1-.7.1-.7 1.1.1 1.7 1.1 1.7 1.1 1 1.7 2.6 1.2 3.2.9.1-.7.4-1.2.7-1.5-2.5-.3-5.1-1.2-5.1-5.5 0-1.2.4-2.2 1.1-3-.1-.3-.5-1.4.1-2.9 0 0 .9-.3 3 1.1.9-.2 1.8-.4 2.7-.4.9 0 1.8.1 2.7.4 2.1-1.4 3-1.1 3-1.1.6 1.5.2 2.6.1 2.9.7.8 1.1 1.8 1.1 3 0 4.3-2.6 5.2-5.1 5.5.4.3.8 1 .8 2.1v3.1c0 .3.2.6.8.5C19.8 21 23 16.9 23 12c0-6.1-4.9-11-11-11z"/></svg>';
const _PBP_ICON_WEBHOOK =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h11"/><path d="M10 7l5 5-5 5"/><circle cx="19.5" cy="12" r="2.5"/></svg>';
const _PBP_ICON_NOTION =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>';
const _PBP_ICON_NOTEBOOKLM =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6h4"/><path d="M2 10h4"/><path d="M2 14h4"/><path d="M2 18h4"/><rect width="16" height="20" x="4" y="2" rx="2"/><path d="M9.5 8h5"/><path d="M9.5 12H16"/><path d="M9.5 16H14"/></svg>';

// Notion parent page reference -> dashed UUID ("" when unparseable). Accepts a
// bare 32-hex id, a dashed UUID, or a notion.so page URL whose LAST path
// segment ends in the 32-hex id ("/My-Page-<32hex>"). A database VIEW id only
// ever appears in the query string (?v=<32hex>), so only the path is consulted.
function pbpNotionParseParentId(input) {
  const raw = String(input == null ? "" : input).trim();
  if (!raw) return "";
  const bare = raw.replace(/-/g, "");
  if (/^[0-9a-f]{32}$/i.test(bare)) return _pbpNotionDashUuid(bare);
  let path = "";
  try { path = new URL(raw).pathname; } catch (_) { return ""; }
  const seg = path.split("/").filter(Boolean).pop() || "";
  const tail = seg.split("-").pop() || "";
  return /^[0-9a-f]{32}$/i.test(tail) ? _pbpNotionDashUuid(tail) : "";
}

function _pbpNotionDashUuid(h) {
  h = h.toLowerCase();
  return h.slice(0, 8) + "-" + h.slice(8, 12) + "-" + h.slice(12, 16) + "-" + h.slice(16, 20) + "-" + h.slice(20);
}

// docs/privacy.md (Network requests, item 3) states the extension runs no
// translation snapshot/sharing service and that translations leave the device
// only via explicit Send-to exports. That sentence assumes two behaviors
// defined below: the Gist target stays a SECRET gist (public:false; URL still
// shareable), and the Webhook target posts only to the user-configured
// endpoint. Changing either must update that privacy.md sentence in the same
// commit (release.sh's privacy gate only fires on NEW egress, not on behavior
// changes -- this comment is the only reminder channel).
const PBP_EXPORT_TARGETS = {
  obsidian: {
    id: "obsidian",
    label: "Obsidian",
    icon: _PBP_ICON_OBSIDIAN,
    mechanism: "url-scheme",
    viaClipboard: true,          // body goes via the system clipboard, not the URI
    frontmatter: "inline",       // Obsidian parses YAML natively
    buildUri(meta, rawBody, cfg) {
      cfg = cfg || {};
      const route = cfg.route === "append" || cfg.route === "daily" ? cfg.route : "new";
      return buildObsidianUri({  // md-convert.js global
        action: route === "daily" ? "daily" : "new",
        append: route === "append" || route === "daily",
        vault: cfg.vault, folder: route === "daily" ? "" : cfg.folder,
        name: safeFilename((meta && meta.title) || "Untitled"),
        clipboard: true, content: ""
      });
    },
    settings: [
      { key: "route", type: "select", label: "mdObsidianRoute", default: "new", options: [
        { value: "new", label: "mdObsidianRouteNew" },
        { value: "append", label: "mdObsidianRouteAppend" },
        { value: "daily", label: "mdObsidianRouteDaily" }
      ] },
      { key: "vault", type: "text", label: "mdObsidianVault" },
      { key: "folder", type: "text", label: "mdObsidianFolder" }
    ],
    onboarding: ""
  },

  // Notion — token-api via the 2026-03-11 markdown ingestion: POST /v1/pages
  // accepts the whole article as ONE `markdown` string (no client-side
  // markdown->blocks conversion, no 100-block batching; `markdown` is
  // mutually exclusive with `children`). Auth = user-created internal
  // integration token; the parent page must be shared with that integration
  // or the API answers 404/403 (mapped to api-notion-share in
  // md-export-send.js). YAML frontmatter would render as literal text in
  // Notion, so the body strips it and carries source metadata as a leading
  // blockquote instead. Very long articles may exceed the 20s send timeout
  // and degrade to the clipboard (known MVP limit; chunked append via
  // PATCH /v1/pages/{id}/markdown is a later phase).
  notion: {
    id: "notion",
    label: "Notion",
    icon: _PBP_ICON_NOTION,
    mechanism: "token-api",
    frontmatter: "strip",
    origin: "https://api.notion.com/*",
    _headers(token, extra) {
      return Object.assign(
        { "Authorization": "Bearer " + token, "Notion-Version": "2026-03-11" }, extra || {});
    },
    // Leading source block keeps url/tags visible on the page until a
    // database-properties phase exists. English labels match the frontmatter
    // key convention the other targets use.
    _body(meta, body) {
      meta = meta || {};
      const lines = [];
      if (meta.url) lines.push("> Source: <" + String(meta.url) + ">");
      if (Array.isArray(meta.tags) && meta.tags.length) lines.push("> Tags: " + meta.tags.join(", "));
      const head = lines.join("\n");
      return head ? head + "\n\n" + String(body || "") : String(body || "");
    },
    precheckRequest(cfg, token) {
      return { url: "https://api.notion.com/v1/users/me", method: "GET", headers: this._headers(token) };
    },
    buildRequest(meta, body, cfg, token) {
      meta = meta || {};
      // Unparseable parent ships the raw trimmed value: the API then answers
      // with a clear 400/404 instead of this row inventing a guess. The
      // options card mirrors the same parser as an inline warning.
      const parent = pbpNotionParseParentId((cfg || {}).parent) || String((cfg || {}).parent || "").trim();
      return {
        url: "https://api.notion.com/v1/pages",
        method: "POST",
        headers: this._headers(token, { "Content-Type": "application/json" }),
        body: JSON.stringify({
          parent: { page_id: parent },
          properties: { title: { title: [{ text: { content: String(meta.title || "Untitled").slice(0, 2000) } }] } },
          markdown: this._body(meta, body)
        })
      };
    },
    settings: [
      { key: "token", type: "secret", required: true, label: "mdTargetNotionToken" },
      { key: "parent", type: "text", required: true, label: "mdTargetNotionParent", placeholder: "https://www.notion.so/…" }
    ],
    onboarding: "mdTargetNotionOnboarding"
  },

  // NotebookLM — guided hand-off, NOT an API push: consumer NotebookLM has no
  // public write API (verified 2026-08), so this row copies the full text to
  // the clipboard and opens notebooklm.google.com; the user pastes it as a
  // "Copied text" source there. Zero network from the extension, zero host
  // grants (pbpRequestTargetPermission short-circuits: no buildRequest).
  notebooklm: {
    id: "notebooklm",
    label: "NotebookLM",
    icon: _PBP_ICON_NOTEBOOKLM,
    mechanism: "url-scheme",
    viaClipboard: true,
    frontmatter: "strip",
    buildUri() { return "https://notebooklm.google.com/"; },
    settings: [],
    onboarding: "mdTargetNotebookLmOnboarding"
  },

  // GitHub Gist — token-api. A gist file IS raw markdown (GitHub renders the
  // YAML frontmatter natively), so no block conversion. Each clip = one new
  // private gist. NOTE: gists require a CLASSIC PAT with the `gist` scope —
  // fine-grained tokens cannot create gists (GitHub docs, verified 2026-06).
  github: {
    id: "github",
    label: "GitHub Gist",
    icon: _PBP_ICON_GITHUB,
    mechanism: "token-api",
    frontmatter: "inline",          // gist file = one raw markdown string incl. YAML
    origin: "https://api.github.com/*",
    // Gist filename: sanitized title + ".md" (no path/reserved chars; non-empty).
    _slug(meta) {
      const t = String((meta && meta.title) || "clip")
        .replace(/[\/\\?%*:|"<>#]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 80);
      return (t || "clip") + ".md";
    },
    precheckRequest(cfg, token) {
      return {
        url: "https://api.github.com/user",
        method: "GET",
        headers: { "Accept": "application/vnd.github+json", "Authorization": "Bearer " + token, "X-GitHub-Api-Version": "2022-11-28" }
      };
    },
    buildRequest(meta, body, cfg, token) {
      meta = meta || {};
      const files = {};
      // gist rejects empty content (422) — guard with the title or a placeholder.
      files[this._slug(meta)] = { content: String(body || "") || String(meta.title || "(empty)") };
      return {
        url: "https://api.github.com/gists",
        method: "POST",
        headers: { "Accept": "application/vnd.github+json", "Authorization": "Bearer " + token, "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" },
        body: JSON.stringify({ description: String(meta.title || "Clipped from web"), public: false, files: files })
      };
    },
    settings: [
      { key: "token", type: "secret", required: true, label: "mdTargetGithubToken" }
    ],
    onboarding: "mdTargetGithubOnboarding"
  },

  // Generic webhook — token-api to a user-supplied endpoint. POSTs a JSON
  // envelope {title,url,date,tags,markdown}; optional Bearer token. The host
  // origin is derived from the user's URL (dynamic), so `origin` is a fn of cfg.
  // Success = any 2xx (the endpoint returns no id). For automation/self-hosted
  // receivers (n8n / Make / Zapier / Readwise / Discord-via-relay).
  webhook: {
    id: "webhook",
    label: "Webhook",
    icon: _PBP_ICON_WEBHOOK,
    mechanism: "token-api",
    frontmatter: "strip",          // bare markdown rides the envelope's `markdown` field
    origin(cfg) {
      return pbpEndpointOriginPattern(pbpExportTargetSecretValue(cfg, "url"));
    },
    parseSuccess(resp) { return !!(resp && resp.ok); },
    buildRequest(meta, body, cfg, token) {
      meta = meta || {};
      const headers = { "Content-Type": "application/json" };
      // token = the FULL Authorization header value (e.g. "Bearer <x>",
      // "Token <x>", "Basic <x>") — sent verbatim so ANY auth scheme works
      // (Readwise uses "Token", not "Bearer").
      if (token) headers["Authorization"] = token;
      const payload = {
        title: String(meta.title || ""),
        url: String(meta.url || ""),
        date: String(meta.date || ""),
        tags: Array.isArray(meta.tags) ? meta.tags : [],
        markdown: String(body || "")
      };
      // X4: extended metadata (opt-in via mdExportExtendedMeta), appended AFTER the
      // original 5 keys -- absent entirely when the meta-build-time gate didn't
      // attach these fields, so the payload stays byte-identical to today's when
      // the setting is off. words is gated on Number.isFinite, not truthiness (0
      // is a legitimate word count and must still be carried).
      if (meta.clipped) payload.clipped = String(meta.clipped);
      if (meta.author) payload.author = String(meta.author);
      if (meta.published) payload.published = String(meta.published);
      if (meta.site) payload.site = String(meta.site);
      if (meta.image) payload.image = String(meta.image);
      if (Number.isFinite(meta.words)) payload.words = meta.words;
      return { url: pbpExportTargetSecretValue(cfg, "url"), method: "POST", headers, body: JSON.stringify(payload) };
    },
    settings: [
      // Capability URLs often contain an unrevoked secret in their path/query.
      // Keep the text input usable, but route/store/export it as a credential.
      { key: "url", type: "text", secret: true, required: true, label: "mdTargetWebhookUrl", placeholder: "https://…" },
      { key: "token", type: "secret", label: "mdTargetWebhookToken", placeholder: "Bearer …  /  Token …" }
    ],
    onboarding: "mdTargetWebhookOnboarding"
  }
};

// Display order for the menu + settings rendering.
function pbpExportTargetIds() { return ["obsidian", "notion", "notebooklm", "github", "webhook"]; }
