// ============================================================
// Pinboard Bookmark Enhanced - Markdown Conversion (shared)
// Single canonical-Markdown subsystem. Loaded by popup.html and
// md-preview.html as a global-function script (zero build).
//   - htmlToMarkdown / markdownToPlainText: pure-ish, no render libs
//   - slugify: GitHub-style heading slug (CJK-preserving)
//   - renderMarkdown: marked() -> DOMPurify.sanitize() (preview only)
// ============================================================

// ---- Defuddle comment-tree normalization ----
// Defuddle's buildCommentTree opens a new <blockquote> only when the comment depth
// INCREASES (and always for depth 0), so consecutive SAME-depth comments at depth >= 1
// land as sibling <div class="comment"> nodes inside ONE <blockquote>. Downstream that
// merges two comments into a single block: the second author's <p> is no longer
// :first-child (no accent/elbow), both comments become one translation unit, and a
// comment that follows its sibling's replies gets reordered above them by the
// per-comment marker. Split such blockquotes into one per comment BEFORE turndown,
// anchored on Defuddle's own .comment wrapper class (no text heuristics). Reply
// <blockquote>s sitting between two comment divs stay with the PRECEDING comment.
function _splitMergedComments(html) {
  if (typeof document === "undefined" || html.indexOf('class="comment"') === -1) return html;
  // Inert document (same pattern turndown uses internally): scripts never execute
  // and resources (<img src>) never load while we restructure third-party HTML.
  const doc = document.implementation.createHTMLDocument("");
  const root = doc.createElement("div");
  root.innerHTML = html;
  const isComment = (n) => n.tagName === "DIV" && n.classList.contains("comment");
  // Deepest-first (querySelectorAll is document order; reversed = children before
  // parents) so a nested reply's split happens before its ancestor is walked.
  const bqs = Array.from(root.querySelectorAll("blockquote")).reverse();
  for (const bq of bqs) {
    const kids = Array.from(bq.children);
    if (kids.filter(isComment).length < 2) continue;
    const groups = [];
    let cur = null;
    for (const k of kids) {
      if (isComment(k)) { cur = [k]; groups.push(cur); }
      else if (cur) cur.push(k);
      // nodes before the first comment div (not emitted by Defuddle) stay in place
    }
    let anchor = bq;
    for (let g = 1; g < groups.length; g++) {
      const nb = doc.createElement("blockquote");
      for (const node of groups[g]) nb.appendChild(node);
      anchor.insertAdjacentElement("afterend", nb);
      anchor = nb;
    }
  }
  return root.innerHTML;
}

// ---- HTML -> Markdown via Turndown (popup uses lazy ensureTurndown) ----
// opts.baseUrl absolutizes relative a[href] before conversion (see
// _pbpAbsolutizeLinks); relative img src stays untouched here — that is
// applyImagePolicy's job at export time.
// Module-level singleton (perf): building a TurndownService + its 8 custom rules on
// every call was a real multiplier when pbpAiMdOf() converts a page block by block
// (a forum thread is hundreds of blocks). turndown() holds no per-call mutable state,
// and the table/callout rules already call td.turndown() reentrantly on the same
// instance, so one shared instance is safe. Built lazily so popup's deferred
// turndown.js injection still works (TurndownService undefined at module load).
let _pbpTurndown = null;
function _pbpSanitizeComplexTableHtml(node) {
  const clone = node.cloneNode(true);
  clone.querySelectorAll("script, style, iframe, object, embed, link, meta").forEach((el) => el.remove());
  clone.querySelectorAll("*").forEach((el) => {
    Array.from(el.attributes).forEach((attr) => {
      const name = attr.name.toLowerCase();
      const value = String(attr.value || "").trim();
      if (name.startsWith("on") || name === "style" || name === "srcdoc") {
        el.removeAttribute(attr.name);
        return;
      }
      if ((name === "href" || name === "src" || name === "xlink:href") && /^(?:javascript|vbscript|data):/i.test(value)) {
        el.removeAttribute(attr.name);
      }
    });
  });
  return clone.outerHTML;
}
function _pbpGetTurndown() {
  if (_pbpTurndown) return _pbpTurndown;
  if (typeof TurndownService === "undefined") return null;
  const td = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced", bulletListMarker: "-" });
  // MathML (LaTeXML/arxiv-html, KaTeX): a <math> carries BOTH presentation MathML
  // and the TeX source (alttext attr, or <annotation encoding="application/x-tex">).
  // Default conversion concatenates textContent = presentation + annotation ->
  // duplicated output ("47.21 % 47.21\%"). Emit ONLY the TeX, wrapped in $/$$, so it
  // round-trips clean and renders via KaTeX (md-preview gates on info.math, which the
  // extractor sets when the page has <math>). No TeX source -> fall back to default.
  td.addRule("mathml", {
    filter: "math",
    replacement: (content, node) => {
      let tex = (node.getAttribute("alttext") || "").trim();
      if (!tex && node.querySelector) {
        const ann = node.querySelector('annotation[encoding="application/x-tex"]');
        tex = ann ? (ann.textContent || "").trim() : "";
      }
      if (!tex) return content;
      return node.getAttribute("display") === "block" ? ("$$" + tex + "$$") : ("$" + tex + "$");
    }
  });
  td.addRule("preformattedCode", {
    filter: (n) => n.nodeName === "PRE",
    replacement: (content, node) => {
      const code = node.querySelector("code");
      let lang = "";
      if (code) {
        const cls = code.getAttribute("class") || "";
        const m = cls.match(/language-(\S+)/);
        lang = (m && m[1]) || code.getAttribute("data-lang") || code.getAttribute("data-language") || "";
      }
      if (!lang) lang = node.getAttribute("data-language") || node.getAttribute("data-lang") || "";
      const text = (code || node).textContent || "";
      // Fence must outrun the longest backtick run already inside the code, or a
      // literal ``` (or longer) in the sample would prematurely close the block
      // (turndown's default fenced strategy). Content is never escaped/mutated.
      const longestRun = (text.match(/`+/g) || []).reduce((max, run) => Math.max(max, run.length), 0);
      const fence = "`".repeat(Math.max(3, longestRun + 1));
      return "\n\n" + fence + lang + "\n" + text + "\n" + fence + "\n\n";
    }
  });
  td.addRule("table", {
    filter: "table",
    replacement: (content, node) => {
      // Complex = merged cells OR a nested table. A nested table used to
      // recurse through this same rule and then get flattened to one line by
      // cellMd's newline collapse — unreadable garbage. querySelector on the
      // table matches DESCENDANTS only, so the outer table itself never
      // self-triggers.
      if (node.querySelector && node.querySelector("th[rowspan],td[rowspan],th[colspan],td[colspan],table")) {
        return "\n\n" + _pbpSanitizeComplexTableHtml(node) + "\n\n";
      }
      // :scope-limited to this table's own direct rows -- a plain "tr" query would
      // also pull in a nested <table>'s rows (cell content), which then gets output
      // twice: once flattened into this table (wrong column count) and once again
      // via the cell's own recursive td.turndown() call below.
      const rows = Array.from(node.querySelectorAll(":scope > thead > tr, :scope > tbody > tr, :scope > tr, :scope > tfoot > tr"));
      if (!rows.length) return content;
      // Convert each cell's INNER HTML to markdown so inline formatting
      // (inline code, links, bold/em) survives — plain textContent would
      // flatten e.g. `en` -> en and drop [text](url) links. Then collapse to a
      // single pipe-safe line (GFM table cells can't span multiple lines).
      const cellMd = (c) => {
        let md;
        try { md = td.turndown(c.innerHTML); } catch (_) { md = c.textContent || ""; }
        return md.replace(/\n+/g, " ").replace(/\|/g, "\\|").trim();
      };
      const out = [];
      rows.forEach((row, i) => {
        const cells = Array.from(row.querySelectorAll(":scope > th, :scope > td")).map(cellMd);
        out.push("| " + cells.join(" | ") + " |");
        if (i === 0) out.push("| " + cells.map(() => "---").join(" | ") + " |");
      });
      return "\n\n" + out.join("\n") + "\n\n";
    }
  });
  // GitHub alerts (> [!TIP] etc.): Defuddle normalizes them to Obsidian-style
  // callouts (<div data-callout="tip" class="callout"><div class="callout-title">…
  // </div><p>…</p></div>). Restore the `> [!TYPE]` blockquote so the export round-trips.
  td.addRule("calloutAlert", {
    filter: (n) => n.nodeName === "DIV" && (n.hasAttribute("data-callout") || (n.classList && n.classList.contains("callout"))),
    replacement: (content, node) => {
      const type = (node.getAttribute("data-callout") || "note").trim().toUpperCase();
      const clone = node.cloneNode(true);
      const titleEl = clone.querySelector(".callout-title");
      if (titleEl) titleEl.remove();
      let body;
      try { body = td.turndown(clone.innerHTML); } catch (_) { body = clone.textContent || ""; }
      body = body.replace(/^\n+/, "").replace(/\n+$/, "").trim();
      const quoted = body ? body.split("\n").map((l) => (l.length ? "> " + l : ">")).join("\n") : ">";
      return "\n\n> [!" + type + "]\n" + quoted + "\n\n";
    }
  });
  td.addRule("highlight", { filter: "mark", replacement: (c) => "==" + c + "==" });
  td.addRule("strikethrough", {
    filter: (n) => n.nodeName === "DEL" || n.nodeName === "S" || n.nodeName === "STRIKE",
    replacement: (c) => "~~" + c + "~~"
  });
  td.addRule("figure", {
    filter: "figure",
    replacement: (content, node) => {
      const img = node.querySelector("img");
      const caption = node.querySelector("figcaption");
      if (!img) return content;
      const alt = caption ? caption.textContent.trim() : (img.getAttribute("alt") || "");
      const src = img.getAttribute("src") || "";
      return "\n\n![" + alt + "](" + src + ")" + (caption ? "\n*" + caption.textContent.trim() + "*" : "") + "\n\n";
    }
  });
  td.addRule("listItem", {
    filter: "li",
    replacement: (content, node) => {
      content = content.replace(/^\n+/, "").replace(/\n+$/, "\n").replace(/\n/gm, "\n    ");
      const parent = node.parentNode;
      let prefix = "- ";
      if (parent && parent.nodeName === "OL") {
        const start = parseInt(parent.getAttribute("start") || "1", 10);
        const index = Array.from(parent.children).indexOf(node);
        prefix = (start + index) + ". ";
      }
      const cb = node.querySelector("input[type=checkbox]");
      if (cb) {
        prefix += cb.checked ? "[x] " : "[ ] ";
        content = content.replace(/^\s*\[[ x]\]\s*/, "");
      }
      return prefix + content.trim() + "\n";
    }
  });
  _pbpTurndown = td;
  return td;
}

// Site-rule contentHtml preserves the page's relative hrefs (V2EX /member/…,
// X /hashtag/…, SO /questions/…); Turndown copies href verbatim, so those links
// would resolve against chrome-extension:// in the preview and stay dead in
// exported .md. Absolutize non-fragment relative a[href] against baseUrl before
// conversion — the anchor-side mirror of applyImagePolicy's img-src handling.
// Protocol-relative //host/x IS absolutized here (new URL gives it baseUrl's
// scheme): left alone it resolves against chrome-extension:// in the preview,
// exactly the failure this pass exists to prevent. Skips: #fragments and
// absolute schemes only.
function _pbpAbsolutizeLinks(html, baseUrl) {
  if (typeof document === "undefined" || html.indexOf("href") === -1) return html;
  // Inert document (same pattern as _splitMergedComments): scripts never
  // execute and resources never load while we rewrite third-party HTML.
  const doc = document.implementation.createHTMLDocument("");
  const root = doc.createElement("div");
  root.innerHTML = html;
  let touched = false;
  root.querySelectorAll("a[href]").forEach((a) => {
    const href = a.getAttribute("href") || "";
    if (!href || href.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(href)) return;
    try { a.setAttribute("href", new URL(href, baseUrl).href); touched = true; } catch (_) { /* keep original */ }
  });
  return touched ? root.innerHTML : html;
}

function htmlToMarkdown(html, opts) {
  const td = _pbpGetTurndown();
  if (!td) return html;
  html = _splitMergedComments(String(html == null ? "" : html));
  const baseUrl = (opts && opts.baseUrl) || "";
  if (baseUrl) html = _pbpAbsolutizeLinks(html, baseUrl);
  return td.turndown(html);
}

// ---- Convert Markdown to plain text (for AI prompts) ----
// Moved verbatim from jina.js (behavior unchanged).
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

// ---- GitHub-style heading slug (CJK-preserving) ----
// lowercase -> strip everything except word chars / CJK / spaces / hyphens
// -> spaces to hyphens -> collapse repeats. Used by renderMarkdown headings + P2 buildToc.
function slugify(text) {
  return (text || "")
    .trim()
    .toLowerCase()
    // strip punctuation but keep latin word chars, digits, CJK, whitespace, hyphen
    .replace(/[^\w一-鿿぀-ヿ가-힯\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ---- Markdown -> safe HTML (preview only; needs marked + DOMPurify) ----
let _markedConfigured = false;
// Reset per renderMarkdown() call (one parse = one heading-id namespace) so the
// heading renderer's dedup can never straddle unrelated renderMarkdown() calls
// (ask.js re-renders individual answer chunks, md-translate re-renders individual
// blocks -- those must NOT share a running "-1/-2" counter with each other).
let _headingSeen = null;
function _configureMarked() {
  if (_markedConfigured || typeof marked === "undefined") return;
  const renderer = new marked.Renderer();
  // GitHub-style slug id on headings so the TOC anchors (P2/P3) resolve.
  // marked v13+ passes the heading TOKEN (not positional text/level/raw); render
  // the inline content via this.parser.parseInline and slug the raw token.text.
  renderer.heading = function (token) {
    const text = this.parser.parseInline(token.tokens);
    let id = slugify(token.text);
    // Same -1/-2 dedup rule as buildToc (below), so a TOC anchor built there
    // always resolves to a real heading id here even when headings repeat.
    if (_headingSeen) {
      if (_headingSeen[id] != null) { _headingSeen[id] += 1; id = id + "-" + _headingSeen[id]; }
      else _headingSeen[id] = 0;
    }
    return `<h${token.depth} id="${id}">${text}</h${token.depth}>\n`;
  };
  // Wide tables used to punch through the article column and put a
  // horizontal scrollbar on the WHOLE page (the table itself carries
  // overflow:hidden for its border-radius, and no ancestor clipped it).
  // Wrapping at the renderer means every consumer -- preview, translated
  // .pb-tr blocks, HTML export -- scrolls the table in place instead.
  // pbpAiIndexBlocks looks through this wrapper (md-ai-core.js), so block
  // ids still land on the TABLE element.
  const protoTable = marked.Renderer.prototype.table;
  renderer.table = function (token) {
    return '<div class="pb-table-wrap">' + protoTable.call(this, token) + "</div>";
  };
  marked.use({ gfm: true, breaks: false, renderer });
  _markedConfigured = true;
}

let _purifyHooked = false;
function _ensurePurifyHook() {
  if (_purifyHooked || typeof DOMPurify === "undefined") return;
  // D1-2: ADD_TAGS:["input"] exists solely so GFM task-list checkboxes survive
  // sanitize. uponSanitizeElement runs BEFORE attribute filtering, on the raw
  // (untrusted) attributes, so it's the right hook to drop an instance outright
  // (per DOMPurify's own docs pattern: node.parentNode.removeChild(node)) rather
  // than trying to un-render it via an attribute change later.
  DOMPurify.addHook("uponSanitizeElement", (node, data) => {
    if (data.tagName === "input") {
      const type = (node.getAttribute("type") || "").toLowerCase();
      if (type !== "checkbox" && node.parentNode) node.parentNode.removeChild(node);
    }
  });
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (node.tagName === "A") {
      const href = node.getAttribute("href") || "";
      if (!href.startsWith("#")) { // not page-internal (TOC/footnote) — open in new tab
        node.setAttribute("target", "_blank");
        node.setAttribute("rel", "noopener noreferrer");
      }
    }
    if (node.tagName === "IMG") {
      node.removeAttribute("href"); // HTML parser can coerce a raw SVG <image> into IMG[href]
      node.removeAttribute("xlink:href");
      node.setAttribute("referrerpolicy", "no-referrer");
    }
    // Any checkbox that survived the hook above must never be interactive.
    if (node.tagName === "INPUT") node.setAttribute("disabled", "");
    // D1-1: ADD_ATTR:["id"] exists only so heading slugs (TOC anchors) survive.
    // Any OTHER element's id from untrusted content could clobber a real page
    // id (e.g. #ask-input) via same-id shadowing of getElementById/querySelector,
    // so strip it post-filter on everything except h1-h6.
    if (!/^H[1-6]$/.test(node.tagName) && node.hasAttribute("id")) {
      node.removeAttribute("id");
    }
  });
  _purifyHooked = true;
}

// The SINGLE sanitize point for the preview page. Replaces both the old
// hand-rolled renderMarkdown AND the raw contentHtml innerHTML injection.
function renderMarkdown(md) {
  if (!md) return "";
  if (typeof marked === "undefined" || typeof DOMPurify === "undefined") {
    // Fail safe: never inject unsanitized markup. Escape and return as text.
    return String(md)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
  _configureMarked();
  _ensurePurifyHook();
  _headingSeen = Object.create(null); // fresh dedup namespace for this parse
  let rawHtml;
  try {
    rawHtml = marked.parse(md);
  } finally {
    _headingSeen = null;
  }
  return DOMPurify.sanitize(rawHtml, {
    // Keep heading slug ids for TOC anchors; allow GFM task-list checkboxes.
    ADD_ATTR: ["id", "target", "rel"],
    ADD_TAGS: ["input"],
    // Only ordinary IMG elements have an enforceable no-referrer policy here.
    // Drop raw remote-capable media/SVG containers instead of allowing an
    // undisclosed subresource request through <image>, poster, or <source>.
    // Form/interactive controls: DOMPurify's DEFAULT allow-list passes the
    // whole family, so a literal "<select>" in article text rendered as a
    // LIVE control in the reading surface (user repro 2026-07-15) — focus
    // target, keyboard trap, tab-order pollution. The preview renders
    // documents, not forms; drop the entire class (text content survives via
    // KEEP_CONTENT, same as GitHub's renderer). <input> stays the one
    // exception — the uponSanitizeElement hook above keeps only disabled
    // GFM task-list checkboxes. <details>/<summary> stay: interactive but
    // content-semantic (README collapsibles). <style> ELEMENTS are also in
    // DOMPurify's default list — FORBID_ATTR only covers the attribute —
    // and untrusted CSS would restyle the whole page; drop it too.
    FORBID_TAGS: ["svg", "image", "video", "audio", "source", "track",
      "form", "select", "option", "optgroup", "textarea", "button", "label",
      "fieldset", "legend", "datalist", "output", "dialog", "style"],
    FORBID_ATTR: ["style", "background", "poster"]
  });
}

// ── Code highlighting (preview page only; needs highlight.js global `hljs`) ──
// Called AFTER renderMarkdown's sanitized HTML is injected into the DOM.
// Targets ALL block code (`pre > code`): marked tags fenced blocks with a
// language as `class="language-xxx"`, but content from Defuddle->Turndown often
// loses the language (source used a non-standard class), so we also highlight
// untagged blocks via hljs auto-detection. Inline `<code>` is not matched.
// No-op (not a throw) when hljs is absent — popup never vendors highlight.js,
// and the pure string functions in this file must stay usable without it.
function highlightCodeBlocks(root) {
  if (!root || typeof hljs === "undefined") return;
  const blocks = root.querySelectorAll('pre > code');
  blocks.forEach((block) => {
    if (block.classList.contains("hljs")) return; // idempotent: skip already-highlighted blocks
    try {
      hljs.highlightElement(block);
    } catch (_) {
      // A single malformed block must not abort the rest of the page.
    }
  });
}

// Chunked variant (preview page only). Same per-block logic as
// highlightCodeBlocks, spread across rAF frames so a code-dense article
// doesn't pay one synchronous hljs pass over every block as a single long
// task (audit #18). composeStyledHtml (export) keeps the synchronous
// highlightCodeBlocks: it reads tmp.innerHTML immediately after the call
// and can't wait for frames.
const PBP_HLJS_CHUNK = 4;
function highlightCodeBlocksChunked(root) {
  if (!root || typeof hljs === "undefined") return;
  const blocks = Array.from(root.querySelectorAll('pre > code'));
  if (!blocks.length) return;
  const raf = (typeof requestAnimationFrame === "function") ? requestAnimationFrame : (fn) => setTimeout(fn, 0);
  let i = 0;
  const step = () => {
    const end = Math.min(i + PBP_HLJS_CHUNK, blocks.length);
    for (; i < end; i++) {
      const block = blocks[i];
      if (block.classList.contains("hljs")) continue; // idempotent
      try {
        hljs.highlightElement(block);
      } catch (_) {
        // A single malformed block must not abort the rest of the page.
      }
    }
    if (i < blocks.length) raf(step);
  };
  raf(step);
}

// ── Export transform ①: YAML frontmatter ──

// Escape a string for a YAML double-quoted scalar (quotes / colons / newlines).
function yamlString(s) {
  const str = s == null ? "" : String(s);
  const escaped = str
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r\n/g, "\\n")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\n");
  return '"' + escaped + '"';
}

// Normalize a page's raw "published" metadata string to a YAML-safe date shape.
// Called ONLY at meta-build time (md-preview.js buildMeta / popup.js's three meta
// construction points) -- applyFrontmatter/composeStyledHtml/the webhook payload
// never call this; they just format whatever meta.published already holds.
//   - "/^\d{4}-\d{2}-\d{2}/" prefix (JSON-LD/meta datePublished mainstream ISO 8601
//     shapes) -> take that 10-char YYYY-MM-DD prefix directly (zero timezone math).
//   - Otherwise Date.parse()-able -> format the UTC calendar date as YYYY-MM-DD.
//   - Unparseable -> return the input unchanged (caller must render it via
//     yamlString, never as a bare YAML date scalar).
// Empty in, empty out. Pure (no Date.now(), no locale, no DOM).
function publishedIso(s) {
  if (!s) return "";
  const str = String(s);
  const isoPrefix = str.match(/^\d{4}-\d{2}-\d{2}/);
  if (isoPrefix) return isoPrefix[0];
  const t = Date.parse(str);
  if (Number.isNaN(t)) return str;
  const d = new Date(t);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return y + "-" + m + "-" + day;
}

// meta: {title,url,date,tags,source,description?,author?,published?,clipped?,site?,image?,words?}
// opts.fields: ordered subset of [title,url,date,tags,source]; description always
// trails (only when present). Bare scalars for url/date/source; quoted for
// title/description; tags as an inline flow array. Extended fields (author/
// published/clipped/site/image/words) trail description in that fixed order, each only
// when present on meta -- see applyFrontmatter's own tail below for the
// emission rules.
function applyFrontmatter(md, meta, opts) {
  meta = meta || {};
  opts = opts || {};
  const fields = opts.fields || ["title", "url", "date", "tags", "source"];
  const lines = ["---"];
  for (const f of fields) {
    if (f === "title") lines.push("title: " + yamlString(meta.title || ""));
    else if (f === "url") lines.push("url: " + (meta.url || ""));
    else if (f === "date") lines.push("date: " + (meta.date || ""));
    else if (f === "tags") lines.push("tags: [" + (Array.isArray(meta.tags) ? meta.tags.join(", ") : "") + "]");
    else if (f === "source") lines.push("source: " + (meta.source || ""));
  }
  if (meta.description) lines.push("description: " + yamlString(meta.description));
  // X4 (metadata export pack): extended fields, fixed order, each only when present
  // on meta. published: bare scalar when it already looks like a normalized
  // YYYY-MM-DD (the meta-build-time publishedIso() call's success shape), else
  // yamlString-quoted (never emitted bare unless it looks like a real date).
  // author/site/image are always yamlString-quoted (arbitrary page-sourced text).
  // words: bare integer, gated on Number.isFinite (NOT truthiness -- 0 is a
  // legitimate word count).
  if (meta.published) {
    lines.push("published: " + (/^\d{4}-\d{2}-\d{2}$/.test(meta.published) ? meta.published : yamlString(meta.published)));
  }
  if (meta.clipped) {
    lines.push("clipped: " + (/^\d{4}-\d{2}-\d{2}$/.test(meta.clipped) ? meta.clipped : yamlString(meta.clipped)));
  }
  if (meta.author) lines.push("author: " + yamlString(meta.author));
  if (meta.site) lines.push("site: " + yamlString(meta.site));
  if (meta.image) lines.push("image: " + yamlString(meta.image));
  if (Number.isFinite(meta.words)) lines.push("words: " + meta.words);
  lines.push("---");
  return lines.join("\n") + "\n\n" + (md || "");
}

// ── Export transform ②: image policy ──
// policy: "keep" (absolutize relative src via new URL(src, baseUrl)) |
//         "alt"  (![alt](src) -> alt text; drop image when alt empty) |
//         "strip" (remove all images)
function applyImagePolicy(md, opts) {
  opts = opts || {};
  const policy = opts.policy || "keep";
  const baseUrl = opts.baseUrl || "";
  const IMG = /!\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/g;
  const rewrite = (line) => {
    if (policy === "strip") return line.replace(IMG, "");
    if (policy === "alt") return line.replace(IMG, (_, alt) => (alt || ""));
    // keep: absolutize relative src
    return line.replace(IMG, (whole, alt, src) => {
      let abs = src;
      if (baseUrl && !/^[a-z][a-z0-9+.-]*:/i.test(src) && !src.startsWith("//")) {
        try { abs = new URL(src, baseUrl).href; } catch (_) { return whole; }
      }
      return "![" + alt + "](" + abs + ")";
    });
  };
  // Same inFence line-scan as buildToc: a code sample showing ![alt](src)
  // syntax is literal content, not a real image, and must not be rewritten.
  let inFence = false;
  return (md || "").split("\n").map((line) => {
    if (line.match(/^\s*(```|~~~)/)) { inFence = !inFence; return line; }
    if (inFence) return line;
    return rewrite(line);
  }).join("\n");
}

// ── Export transform ③: table of contents ──
// Scans ATX headings in [minLevel,maxLevel], skipping fenced code blocks.
// Slugs reuse P1 slugify() (GitHub-style, CJK preserved). De-dupes slugs with -1, -2…
// Returns { tocMarkdown, headings:[{level,text,slug}] }.
function buildToc(md, opts) {
  opts = opts || {};
  const minLevel = opts.minLevel || 2;
  const maxLevel = opts.maxLevel || 4;
  const lines = (md || "").split("\n");
  const headings = [];
  const seen = Object.create(null);
  let inFence = false;
  for (const line of lines) {
    const fence = line.match(/^\s*(```|~~~)/);
    if (fence) { inFence = !inFence; continue; }
    if (inFence) continue;
    const m = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (!m) continue;
    const level = m[1].length;
    const text = m[2].trim();
    // Count EVERY heading level into the dedup map (matching renderer.heading's
    // all-level _headingSeen), even ones outside [minLevel,maxLevel] -- an
    // out-of-range heading still occupies a slug slot at render time, so it must
    // burn one here too or a later in-range TOC entry would point at a slug the
    // renderer already reassigned to a different (out-of-range) heading.
    let slug = slugify(text);
    if (seen[slug] != null) { seen[slug] += 1; slug = slug + "-" + seen[slug]; }
    else seen[slug] = 0;
    if (level < minLevel || level > maxLevel) continue;
    headings.push({ level, text, slug });
  }
  if (!headings.length) return { tocMarkdown: "", headings };
  const body = headings.map(h => {
    const indent = "  ".repeat(h.level - minLevel);
    return indent + "- [" + h.text + "](#" + h.slug + ")";
  }).join("\n");
  return { tocMarkdown: "## Contents\n" + body, headings };
}

// ── Export transform ④: reading stats ──
// CJK-aware: Latin counted by whitespace words, CJK by character.
// minutes = ceil(words/200 + cjkChars/350); 0 for empty input.
function readingStats(md) {
  const plain = markdownToPlainText(md || "");
  // CJK ranges: CJK Unified + Ext-A, Hiragana/Katakana, Hangul, full-width forms
  const cjkRe = /[぀-ヿ㐀-䶿一-鿿豈-﫿가-힯]/g;
  const cjkMatches = plain.match(cjkRe);
  const cjkChars = cjkMatches ? cjkMatches.length : 0;
  // Strip CJK before tokenizing Latin so CJK runs don't inflate word count
  const latinPart = plain.replace(cjkRe, " ").trim();
  const words = latinPart ? latinPart.split(/\s+/).filter(Boolean).length : 0;
  const minutes = (words === 0 && cjkChars === 0) ? 0 : Math.ceil(words / 200 + cjkChars / 350);
  return { words, cjkChars, minutes };
}

function readingProgressPercent(scrollY, viewportHeight, scrollHeight) {
  const total = Math.max(0, Number(scrollHeight || 0) - Number(viewportHeight || 0));
  if (total <= 0) return 100;
  const y = Math.min(Math.max(Number(scrollY || 0), 0), total);
  return Math.round((y / total) * 100);
}

// ── Export orchestrator ──
// opts: { frontmatter:bool, imagePolicy:"keep"|"alt"|"strip", includeToc:bool,
//         highlights:Array|null, highlightsInline:bool (default true) }
// Order: imagePolicy → (highlights inline mark) → (TOC prepend) → (highlights section
// append) → (frontmatter prepend). baseUrl = meta.url.
// highlights (H2, md-highlight.js): absent/empty -> byte-identical to the pre-H2 output
// (regression guard, spec sec.5/9). highlightsInline:false lets composeStyledHtml's own
// internal call opt OUT of the "==...==" inline mark (marked doesn't parse ==, so styled
// HTML only ever gets the aggregation section) while the plain .md export path (default
// true) gets both. Both pbpHlInlineMark/pbpHlComposeSection calls are typeof-guarded:
// popup.html loads this file WITHOUT md-highlight.js and never passes opts.highlights,
// but a guard costs nothing and removes a latent ReferenceError for any future caller.
function composeExport(canonicalMd, meta, opts) {
  meta = meta || {};
  opts = opts || {};
  let body = applyImagePolicy(canonicalMd || "", {
    policy: opts.imagePolicy || "keep",
    baseUrl: meta.url || ""
  });
  const hlItems = Array.isArray(opts.highlights) ? opts.highlights : null;
  if (hlItems && hlItems.length && opts.highlightsInline !== false && typeof pbpHlInlineMark === "function") {
    body = pbpHlInlineMark(body, hlItems, opts.hlView); // H5 (spec 1.6): filter marks by the exported view
  }
  if (opts.includeToc) {
    const { tocMarkdown } = buildToc(body, { minLevel: 2, maxLevel: 4 });
    if (tocMarkdown) body = tocMarkdown + "\n\n" + body;
  }
  if (hlItems && hlItems.length && typeof pbpHlComposeSection === "function") {
    body = body + "\n\n" + pbpHlComposeSection(hlItems);
  }
  if (opts.frontmatter) {
    body = applyFrontmatter(body, meta, {});
  }
  return body;
}

// ── Shared download helpers (used by popup + preview) ──
// safeFilename: blacklist filesystem-hostile chars (/ \ ? % * : | " < > # +
// control chars) -> "_"; all other Unicode (kana, hangul, cyrillic, accented
// latin, ...) passes through untouched; cap at 80; empty -> "untitled".
// (Moved/unified from md-preview.js. Was a script whitelist until B3 -- that
// collapsed ja/ko/ru/de titles into underscore strings.)
function safeFilename(title) {
  const base = (title || "untitled").replace(/[\\/?%*:|"<>#\x00-\x1F]/g, "_").slice(0, 80);
  return base || "untitled";
}

// downloadFile: Blob + transient <a download>. Click-time only (no boot cost).
function downloadFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ── Standalone styled HTML export (Download .html) ──
// Curated, print-friendly reader stylesheet for the exported document. Scoped to
// .export-doc so it never collides with hljs token rules. Light + dark.
// Dark branch follows md-preview.css's A "warm-neutral" palette (docs/superpowers/
// 2026-07-13-dark-palette-research-codex.md) -- was the same blue-leaning Slate hex
// family as the old md-preview.css tokens, now mapped 1:1 by role (--x-bd/--x-bdl had
// no exact prior match in the token table; mapped to --border/--border-light). Light
// branch untouched.
// --x-pre-bg: split out from --x-surface (dark-review H2a/M4) so the code-block
// container can sit a step darker than panel-level surfaces, same relationship
// as md-preview.css's --pre-bg vs --surface (see D8-7 comment there).
// @media print reset: this file has no light-dark()/color-scheme mechanism (it
// targets an offline, standalone .html opened outside this extension), so unlike
// md-preview.css's single `color-scheme: light !important` switch, printing here
// must explicitly re-pin every --x-* var back to its light value -- the print
// block is a plain (unconditional) @media print, so its :root wins the cascade
// over the dark-media :root at equal specificity by source order, whether or not
// the viewer's OS is in dark mode. The re-pin can't reach the injected hljsCss
// though (composeStyledHtml appends the dark vendor sheet inside its own
// @media (prefers-color-scheme:dark), which still matches when printing on a
// dark-mode OS and paints literal token hexes, not --x-* vars) -- so the print
// block also flattens pre/code/span to near-black text on transparent, same
// trade as md-preview.css's H2b print rule: no syntax color on paper, but
// guaranteed legibility.
// .hljs-section dark override: same root cause as md-preview.css's M4 fix --
// hljs-github-dark's own .hljs-section (#1f6feb) only clears 3.94:1 on this
// palette's --x-pre-bg (#161513); `.export-doc pre .hljs-section` (3 classes)
// outranks the vendor sheet's bare `.hljs-section` (1 class) regardless of which
// <style> block ends up first in the exported document.
const READER_CSS = `
:root{--x-fg:#1a202c;--x-mut:#5a6473;--x-bd:#e2e8f0;--x-bdl:#eef2f7;--x-link:#2563eb;--x-code-bg:#f1f5f9;--x-code-fg:#334155;--x-bq-bd:#2563eb;--x-bq-bg:#f0f9ff;--x-bq-fg:#1e3a5f;--x-stripe:#f8fafc;--x-surface:#fff;--x-bg:#fff;--x-pre-bg:#fff}
@media (prefers-color-scheme:dark){:root{--x-fg:#CECDC3;--x-mut:#A6A49F;--x-bd:#403E3C;--x-bdl:#343331;--x-link:#6095C5;--x-code-bg:#282726;--x-code-fg:#C8C6BC;--x-bq-bd:#6095C5;--x-bq-bg:#22282D;--x-bq-fg:#B9CAD6;--x-stripe:#22211F;--x-surface:#282726;--x-bg:#1C1B1A;--x-pre-bg:#161513}.export-doc pre .hljs-section{color:#6cb6ff}}
*{box-sizing:border-box}
html,body{margin:0;background:var(--x-bg)}
.export-doc{max-width:760px;margin:0 auto;padding:48px 24px 96px;color:var(--x-fg);line-height:1.75;font-size:16px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,"Helvetica Neue","PingFang SC","Microsoft YaHei","Noto Sans CJK SC",sans-serif;-webkit-font-smoothing:antialiased}
.export-doc header{margin-bottom:32px;padding-bottom:16px;border-bottom:1px solid var(--x-bd)}
.export-doc .doc-title{margin:0 0 6px;font-size:2em;font-weight:700;line-height:1.25}
.export-doc .doc-meta{margin:0;color:var(--x-mut);font-size:.85em;word-break:break-word}
.export-doc .doc-meta a{color:var(--x-mut)}
.export-doc h1,.export-doc h2,.export-doc h3,.export-doc h4{font-weight:650;line-height:1.3;margin:1.6em 0 .5em}
.export-doc h1{font-size:1.9em}.export-doc h2{font-size:1.5em;padding-bottom:.3em;border-bottom:1px solid var(--x-bdl)}.export-doc h3{font-size:1.25em}.export-doc h4{font-size:1.05em;color:var(--x-mut)}
.export-doc p{margin:1em 0}
.export-doc a{color:var(--x-link);text-decoration:underline;text-underline-offset:2px}
.export-doc code{font-family:"SFMono-Regular","Cascadia Code",Consolas,"PingFang SC","Microsoft YaHei",monospace;background:var(--x-code-bg);color:var(--x-code-fg);padding:2px 7px;border-radius:4px;font-size:.875em}
.export-doc pre{background:var(--x-pre-bg);border:1px solid var(--x-bd);padding:20px 24px;border-radius:8px;overflow-x:auto;margin:1.5em 0;line-height:1.55}
.export-doc pre code{background:none;padding:0;border-radius:0;font-size:13px}
.export-doc blockquote{border-left:3px solid var(--x-bq-bd);background:var(--x-bq-bg);color:var(--x-bq-fg);padding:12px 20px;margin:1.5em 0;border-radius:0 6px 6px 0}
.export-doc blockquote p{margin:.4em 0}
.export-doc blockquote>p:first-child>strong:first-child{color:var(--x-bq-bd)}
.export-doc blockquote blockquote{position:relative;background:transparent;border-left:1px solid rgba(128,128,128,.4);padding:4px 0 4px 16px;margin:.4em 0;border-radius:0}
.export-doc blockquote blockquote>p:first-child{position:relative}
.export-doc blockquote blockquote>p:first-child::before{content:"";position:absolute;left:-16px;top:50%;width:14px;height:1px;background:rgba(128,128,128,.4);transform:translateY(-50%)}
.export-doc img{max-width:100%;height:auto;border-radius:8px;margin:1.5em 0;border:1px solid var(--x-bd)}
.export-doc ul,.export-doc ol{margin:1em 0;padding-left:1.75em}
.export-doc li{margin:.35em 0}
.export-doc .pb-table-wrap{margin:1.5em 0;overflow-x:auto}
.export-doc .pb-table-wrap>table{margin:0}
.export-doc table{border-collapse:collapse;width:100%;margin:1.5em 0;font-size:.9375em;border:1px solid var(--x-bd);border-radius:8px;overflow:hidden}
.export-doc th,.export-doc td{padding:10px 16px;text-align:left;border-bottom:1px solid var(--x-bdl);overflow-wrap:anywhere}
.export-doc thead{background:var(--x-code-bg)}
.export-doc tbody tr:nth-child(even){background:var(--x-stripe)}
.export-doc hr{border:none;border-top:1px solid var(--x-bd);margin:2.5em 0}
@media print{:root{--x-fg:#1a202c;--x-mut:#5a6473;--x-bd:#e2e8f0;--x-bdl:#eef2f7;--x-link:#2563eb;--x-code-bg:#f1f5f9;--x-code-fg:#334155;--x-bq-bd:#2563eb;--x-bq-bg:#f0f9ff;--x-bq-fg:#1e3a5f;--x-stripe:#f8fafc;--x-surface:#fff;--x-bg:#fff;--x-pre-bg:#fff}html,body{background:#fff}.export-doc{max-width:100%;padding:0}.export-doc pre,.export-doc pre code,.export-doc pre span{color:#1f2328 !important;background:transparent !important}}
`;

// HTML-escape for text contexts (title, header fields).
function _xmlEscape(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// composeStyledHtml: canonical markdown -> a complete self-contained HTML doc.
// Honors imagePolicy + includeToc via composeExport; frontmatter is rendered as a
// VISIBLE header (never YAML). renderMarkdown + highlightCodeBlocks run on a
// detached node (needs a DOM — preview/test page, not the popup). The caller
// passes opts.hljsCss (fetched from the vendored theme) so this stays chrome-free.
// meta: {title,url,date,tags,source,description?,author?,published?,clipped?,site?,image?,words?}
// opts: { frontmatter, imagePolicy, includeToc, hljsCss, math, katexCss, highlights }
function composeStyledHtml(canonicalMd, meta, opts) {
  meta = meta || {};
  opts = opts || {};
  // highlightsInline:false -- styled HTML gets ONLY the aggregation section (spec
  // sec.5): marked doesn't parse "==...==", so an inline mark would render as literal
  // text in the exported doc.
  const bodyMd = composeExport(canonicalMd || "", meta, {
    frontmatter: false,
    imagePolicy: opts.imagePolicy || "keep",
    includeToc: !!opts.includeToc,
    highlights: Array.isArray(opts.highlights) ? opts.highlights : null,
    highlightsInline: false
  });
  let article = renderMarkdown(bodyMd);
  if (typeof document !== "undefined" && typeof hljs !== "undefined") {
    const tmp = document.createElement("div");
    tmp.innerHTML = article;
    highlightCodeBlocks(tmp);
    article = tmp.innerHTML;
  }
  // Math (audit E3 gap): mirrors the hljs pass above — a second detached-node
  // render so Download .html / Copy HTML match the live preview's KaTeX
  // rendering instead of leaving raw $...$/$$...$$ TeX source in the export.
  // Same delimiters as md-preview.js's live renderMathInElement call. Caller
  // only sets opts.math for math-bearing pages (info.math); if KaTeX isn't
  // loaded on the caller's page (load failure, or a page — e.g. this file's
  // own test harness — that never vendors it), renderMathInElement is simply
  // undefined and the $...$ source passes through untouched (degrade, not throw).
  if (opts.math && typeof document !== "undefined" && typeof renderMathInElement === "function") {
    const tmp = document.createElement("div");
    tmp.innerHTML = article;
    try {
      renderMathInElement(tmp, {
        delimiters: [{ left: "$$", right: "$$", display: true }, { left: "$", right: "$", display: false }],
        throwOnError: false
      });
      article = tmp.innerHTML;
    } catch (_) { /* leave $...$ source untouched on failure */ }
  }
  let header = "";
  if (opts.frontmatter) {
    const parts = [];
    if (meta.title) parts.push('<h1 class="doc-title">' + _xmlEscape(meta.title) + "</h1>");
    const sub = [];
    if (meta.url) {
      const safeUrl = /^https?:\/\//i.test(meta.url) ? meta.url : "";
      if (safeUrl) sub.push('<a href="' + _xmlEscape(safeUrl) + '" rel="noopener noreferrer">' + _xmlEscape(safeUrl) + "</a>");
      else sub.push("<span>" + _xmlEscape(meta.url) + "</span>");
    }
    if (meta.date) sub.push("<span>" + _xmlEscape(meta.date) + "</span>");
    if (Array.isArray(meta.tags) && meta.tags.length) sub.push("<span>" + meta.tags.map(_xmlEscape).join(", ") + "</span>");
    if (sub.length) parts.push('<p class="doc-meta">' + sub.join(" &middot; ") + "</p>");
    // X4: a SECOND .doc-meta line for extended metadata (author/site/published),
    // reusing the same class (zero new CSS). Rendered only when at least one of
    // the three is present; published here is meta.published (already normalized
    // at meta-build time, or the raw unparseable string -- either way just text).
    const sub2 = [];
    if (meta.author) sub2.push("<span>" + _xmlEscape(meta.author) + "</span>");
    if (meta.site) sub2.push("<span>" + _xmlEscape(meta.site) + "</span>");
    if (meta.published) sub2.push("<span>" + _xmlEscape(meta.published) + "</span>");
    if (sub2.length) parts.push('<p class="doc-meta">' + sub2.join(" &middot; ") + "</p>");
    if (parts.length) header = '<header class="doc-header">' + parts.join("") + "</header>\n";
  }
  // UX-i2: emit the article's detected language (and dir for RTL scripts) instead
  // of a hardcoded lang="en", so the standalone export matches the live preview's
  // #rendered-view lang/dir. detectArticleLang lives on the preview page (md-preview.js);
  // typeof-guarded so the file:// test harness (loads md-convert.js alone) degrades to "en".
  const lang = (typeof detectArticleLang === "function" && detectArticleLang(canonicalMd || "")) || "en";
  const dir = (lang === "ar" || lang === "he" || lang === "fa") ? ' dir="rtl"' : "";
  return '<!DOCTYPE html>\n<html lang="' + lang + '"' + dir + '>\n<head>\n<meta charset="UTF-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
    "<title>" + _xmlEscape(meta.title || "Document") + "</title>\n<style>\n" +
    READER_CSS + (opts.hljsCss || "") + (opts.katexCss || "") + "\n</style>\n</head>\n<body>\n" +
    '<main class="export-doc">\n' + header + article + "\n</main>\n</body>\n</html>\n";
}

// ── Obsidian export: build a core obsidian://new URI ──
// clipboard=true → Obsidian reads the note body from the system clipboard (keeps
// the URI short → no length limit, mirrors the official Obsidian Web Clipper);
// otherwise the body rides in &content. vault/folder optional (empty vault =
// current vault; empty folder = vault root). Pure string assembly — no chrome/DOM.
function buildObsidianUri(opts) {
  opts = opts || {};
  const action = opts.action === "daily" ? "daily" : "new";
  const name = opts.name || "Untitled";
  const folder = (opts.folder || "").replace(/^\/+|\/+$/g, "");
  const path = (folder ? folder + "/" : "") + name;
  const params = [];
  if (action === "new") params.push("file=" + encodeURIComponent(path));
  let u = "obsidian://" + action + (params.length ? "?" + params.join("&") : "");
  const addParam = (p) => { u += (u.indexOf("?") === -1 ? "?" : "&") + p; };
  if (opts.vault) addParam("vault=" + encodeURIComponent(opts.vault));
  if (opts.clipboard) addParam("clipboard");
  if (opts.append) addParam("append");
  if (opts.content) addParam("content=" + encodeURIComponent(opts.content));
  return u;
}
