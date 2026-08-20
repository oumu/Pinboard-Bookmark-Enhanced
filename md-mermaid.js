// ============================================================
// Pinboard Bookmark Enhanced — md-mermaid.js
// Local ```mermaid rendering for the reader (md-preview.html only).
// PURE SECTION first (no DOM/chrome side effects at load) so
// tests/md-mermaid-tests.html can drive it on file://. The RUNTIME section
// lazy-loads vendor/mermaid.min.js (3.4MB — only when the article actually
// carries a mermaid fence) via a <script src> tag in the extension's own
// page. NEVER chrome.scripting.executeScript: upstream mermaid issues
// #5378 (CSP/Function("return this")) and #5383 (UTF-8) both live on that
// injection path. Render output goes into <img src="data:image/svg+xml...">
// — the browser's secure static mode (no script execution, no external
// loads) — so renderMarkdown's DOMPurify single point stays untouched.
// Consumes pbpB64Utf8 (md-convert.js) and pbpAiHash (md-ai-core.js); both
// are loaded on md-preview.html, and every call here runs long after the
// deferred scripts settled.
// ============================================================

// ---- PURE ----
const PBP_MERMAID_SRC = "vendor/mermaid.min.js";

function pbpMermaidBlocks(root) {
  if (!root || !root.querySelectorAll) return [];
  return Array.from(root.querySelectorAll("pre > code.language-mermaid"))
    .filter((c) => (c.textContent || "").trim());
}

// Effective scheme: the forced colorScheme style (pbpApplyColorScheme,
// md-preview.js) wins; "auto" leaves it empty and the OS preference decides.
function pbpMermaidIsDark() {
  const forced = (document.documentElement.style.colorScheme || "").trim();
  if (forced === "dark") return true;
  if (forced === "light") return false;
  return !!(typeof window !== "undefined" && window.matchMedia
    && window.matchMedia("(prefers-color-scheme: dark)").matches);
}

function pbpMermaidConfig(dark) {
  return {
    startOnLoad: false,
    securityLevel: "strict",
    theme: dark ? "dark" : "default",
    fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif'
  };
}

// ---- RUNTIME ----
let _pbpMermaidLoad = null;    // script-injection promise (tests pre-resolve it)
let _pbpMermaidTheme = null;   // theme mermaid.initialize() currently holds
const _pbpMermaidCache = new Map(); // pbpAiHash(source)+"|"+theme -> {svg,dataUri,w,h}
let _pbpMermaidSeq = 0;

// Failure is memoized (same convention as ensureHljs/ensureKatex in
// md-preview.js): a failed <script> load resolves — never rejects, never
// clears _pbpMermaidLoad — so a run of N mermaid fences in one enhance pass
// triggers exactly one injection attempt, not N. `mermaid` stays undefined;
// the `mermaid.initialize` call in _pbpMermaidRender then throws a
// ReferenceError, which the caller's existing try/catch (enhance/retheme)
// already degrades on.
function _pbpMermaidEnsure() {
  if (_pbpMermaidLoad) return _pbpMermaidLoad;
  _pbpMermaidLoad = new Promise((res) => {
    const s = document.createElement("script");
    s.src = PBP_MERMAID_SRC;
    s.onload = () => res();
    s.onerror = () => res();   // failure is remembered: the cached promise resolves,
                               // mermaid stays undefined, and the initialize call
                               // below throws into the caller's try/catch — degrade
                               // once, never re-inject (same convention as
                               // ensureHljs/ensureKatex in md-preview.js).
    document.head.appendChild(s);
  });
  return _pbpMermaidLoad;
}

async function _pbpMermaidRender(source, dark) {
  const theme = dark ? "dark" : "default";
  const key = pbpAiHash(source) + "|" + theme;
  const hit = _pbpMermaidCache.get(key);
  if (hit) return hit;
  await _pbpMermaidEnsure();
  if (_pbpMermaidTheme !== theme) {
    mermaid.initialize(pbpMermaidConfig(dark));
    _pbpMermaidTheme = theme;
  }
  await mermaid.parse(source);   // throws on syntax error -> caller degrades
  const { svg } = await mermaid.render("pbp-mermaid-" + (++_pbpMermaidSeq), source);
  const vb = /viewBox="\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)/.exec(svg);
  const entry = {
    svg,
    dataUri: "data:image/svg+xml;base64," + pbpB64Utf8(svg),
    w: vb ? Math.round(parseFloat(vb[1])) : 0,
    h: vb ? Math.round(parseFloat(vb[2])) : 0
  };
  _pbpMermaidCache.set(key, entry);
  return entry;
}

// Enhance every un-processed mermaid fence under root: render to a data-URI
// <figure><img>, hide the source <pre> (kept in the DOM: it is the
// re-render source and the degrade surface). Idempotent via data marker;
// the marker is set even when a block fails so a broken fence isn't
// re-parsed on every later pass.
async function pbpMermaidEnhance(root) {
  const blocks = pbpMermaidBlocks(root)
    .filter((c) => c.parentElement && !c.parentElement.dataset.pbpMermaid);
  if (!blocks.length) return;
  const dark = pbpMermaidIsDark();
  for (const code of blocks) {
    const pre = code.parentElement;
    pre.dataset.pbpMermaid = "1";
    let entry;
    try { entry = await _pbpMermaidRender((code.textContent || "").trim(), dark); }
    catch (e) {
      try { console.warn("mermaid render skipped:", e && e.name, e && e.message); } catch (_) {}
      continue;                  // degrade: the fence stays visible as a code block
    }
    const fig = document.createElement("figure");
    fig.className = "pb-mermaid";
    const img = document.createElement("img");
    img.alt = "diagram";
    if (entry.w && entry.h) { img.width = entry.w; img.height = entry.h; }
    img.src = entry.dataUri;
    fig.appendChild(img);
    pre.insertAdjacentElement("afterend", fig);
    pre.hidden = true;
  }
}

// Re-render every existing figure for the current effective scheme (cache
// makes flips back and forth free). Failures keep the previous render.
async function pbpMermaidRetheme(root) {
  const figs = Array.from((root || document).querySelectorAll("figure.pb-mermaid"));
  if (!figs.length) return;
  const dark = pbpMermaidIsDark();
  for (const fig of figs) {
    const pre = fig.previousElementSibling;
    const code = pre && pre.querySelector ? pre.querySelector("code") : null;
    if (!code) continue;
    try {
      const entry = await _pbpMermaidRender((code.textContent || "").trim(), dark);
      const img = fig.querySelector("img");
      if (img) { img.src = entry.dataUri; if (entry.w && entry.h) { img.width = entry.w; img.height = entry.h; } }
    } catch (_) { /* keep the previous theme's render */ }
  }
}

// Theme wiring. optTheme changes land via storage (md-preview.js applies the
// colorScheme in its own listener — defer one frame so pbpMermaidIsDark reads
// the UPDATED value); OS flips matter only in "auto" mode and arrive via
// matchMedia. Both guards mirror md-preview.js's typeof patterns so the
// file:// test page can load this file without chrome.
if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if ((area !== "sync" && area !== "local") || !changes.optTheme) return;
    requestAnimationFrame(() => { pbpMermaidRetheme(document).catch(() => {}); });
  });
}
if (typeof window !== "undefined" && window.matchMedia) {
  try {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      pbpMermaidRetheme(document).catch(() => {});
    });
  } catch (_) { /* older engines: no live OS-flip re-render */ }
}

// ---- Export substitution (Download .html / EPUB) ----
// Sync, cache-only: composeStyledHtml and pbpBuildEpub run synchronously
// after renderMarkdown, so they can only consume entries already rendered.
// Exports always use the LIGHT ("default") theme — the destination's theme
// is unknowable and a transparent dark-theme SVG is unreadable on a light
// page; the .export-doc/EPUB css gives the figure a white card instead.
function pbpMermaidApplyCached(root) {
  if (!root || !root.querySelectorAll) return;
  root.querySelectorAll("pre > code.language-mermaid").forEach((code) => {
    const entry = _pbpMermaidCache.get(pbpAiHash((code.textContent || "").trim()) + "|default");
    if (!entry) return;                       // never rendered: fence stays
    const doc = root.ownerDocument || document;
    const fig = doc.createElement("figure");
    fig.className = "pb-mermaid";
    const img = doc.createElement("img");
    img.alt = "diagram";
    if (entry.w && entry.h) { img.width = entry.w; img.height = entry.h; }
    img.src = entry.dataUri;
    fig.appendChild(img);
    code.parentElement.replaceWith(fig);
  });
}

// Pre-render the light-theme entry for every fence under root so the sync
// substitution above finds them. Per-block failures resolve silently (those
// fences just stay fenced in the export).
async function pbpMermaidWarmExport(root) {
  for (const code of pbpMermaidBlocks(root || document)) {
    try { await _pbpMermaidRender((code.textContent || "").trim(), false); } catch (_) {}
  }
}
