// ============================================================
// Pinboard Bookmark Enhanced - md-preview AI core (block index,
// placeholders, stream parsing, gating, IDB key conventions).
// Loaded ONLY by md-preview.html (after md-preview.js). Top level
// defines functions + module state only: no DOM/chrome side effects,
// so tests/md-ai-tests.html can load it on file://.
// Consumers: md-translate.js / md-ask.js (init on "pbp:rendered").
// ============================================================

// ---- Block index (shared by explain / ask / translate) ----
// Block id n is 1-based and triple-purpose: citation anchor [Pn] ->
// [data-pb="n"], translation slot (translated block = nextSibling),
// cache key component (blockHash = pbpAiHash(pbpAiMdOf(n))).
const PBP_AI_BLOCK_TAGS = ["P", "H1", "H2", "H3", "H4", "H5", "H6", "UL", "OL", "BLOCKQUOTE", "TABLE", "PRE"];
// Non-block wrappers a whole-article extraction can land under (Jina/some
// site DOMs wrap everything in one <div>). Descended exactly ONE level —
// see the loop below — never recursed, so a container-of-containers still
// yields zero blocks rather than silently walking arbitrarily deep.
const PBP_AI_CONTAINER_TAGS = ["DIV", "SECTION", "ARTICLE"];
let _pbpAiBlockIndex = [];
let _pbpAiTextCache = Object.create(null);
let _pbpAiMdCache = Object.create(null);
let _pbpAiTextKatexCache = Object.create(null);

function pbpAiIndexBlocks(rootEl) {
  _pbpAiBlockIndex = [];
  _pbpAiTextCache = Object.create(null);
  _pbpAiMdCache = Object.create(null);
  _pbpAiTextKatexCache = Object.create(null);
  if (!rootEl) return _pbpAiBlockIndex;
  let n = 0;
  const add = (el, tag) => {
    n += 1;
    el.dataset.pb = String(n);
    _pbpAiBlockIndex.push({ n, el, tag });
  };
  // Forum pages (pbpForumMarkComments ran): a thread <blockquote> is a container,
  // not a block — index each comment's .pb-comment-body in document (pre) order.
  const isForum = !!rootEl.querySelector(".pb-comment-body");
  // renderMarkdown wraps every table in <div class="pb-table-wrap"> for
  // horizontal scrolling (md-convert.js). The block id must land on the
  // TABLE, not the wrapper -- and the wrapper must not eat the one level of
  // container descent below, or a table inside a one-<div> article would
  // fall out of the index entirely.
  const unwrap = (el) =>
    (el.classList && el.classList.contains("pb-table-wrap")
      && el.firstElementChild && el.firstElementChild.tagName === "TABLE")
      ? el.firstElementChild : el;
  for (const raw of rootEl.children) {
    const el = unwrap(raw);
    if (isForum && el.tagName === "BLOCKQUOTE" && el.querySelector(".pb-comment-body")) {
      for (const body of el.querySelectorAll(".pb-comment-body")) add(body, "div");
      continue;
    }
    if (PBP_AI_BLOCK_TAGS.indexOf(el.tagName) !== -1) {
      add(el, el.tagName.toLowerCase());
      continue;
    }
    // Top-level non-block container (e.g. the whole article inside one
    // <div>): descend one level and index its direct children that match,
    // in their document order, at this container's position in the sequence.
    if (PBP_AI_CONTAINER_TAGS.indexOf(el.tagName) !== -1) {
      for (const rawChild of el.children) {
        const child = unwrap(rawChild);
        if (PBP_AI_BLOCK_TAGS.indexOf(child.tagName) !== -1) add(child, child.tagName.toLowerCase());
      }
    }
  }
  return _pbpAiBlockIndex;
}

function pbpAiBlocks() {
  return _pbpAiBlockIndex;
}

function pbpAiBlockEl(n) {
  const b = _pbpAiBlockIndex[(Number(n) || 0) - 1];
  return b ? b.el : null;
}

// Study-surface host for selection-driven actions (research T2.2): the
// article (#rendered-view) as always, OR the visible timeline list of a
// video page (.pbv-list, md-video.js). Returns the host element that
// contains `node`, else null. Visibility matters: the two surfaces are
// shown in alternation, and a selection inside the hidden one is nothing
// to act on. Both ends of a selection must resolve to the SAME host.
function pbpStudyHost(node) {
  if (!node) return null;
  const el = node.nodeType === 3 ? node.parentElement : node;
  if (!el || typeof el.closest !== "function") return null;
  const view = document.getElementById("rendered-view");
  // Same visibility test on both surfaces (retro VID-R1-06): a selection
  // left behind in the article after switching to the timeline is not a
  // study surface either.
  if (view && view.contains(el)) return (!view.hidden && view.offsetParent !== null) ? view : null;
  const list = el.closest(".pbv-list");
  if (list && !list.hidden && list.offsetParent !== null) return list;
  return null;
}
function pbpStudyHostIsTimeline(host) {
  return !!(host && host.classList && host.classList.contains("pbv-list"));
}

function pbpAiTextOf(n) {
  const key = String(n);
  if (key in _pbpAiTextCache) return _pbpAiTextCache[key];
  const el = pbpAiBlockEl(n);
  const text = el ? (el.textContent || "") : "";
  if (el) _pbpAiTextCache[key] = text;
  return text;
}

// Fingerprint of the CURRENT block list's text (order + content). Ask history
// is keyed by owner+URL (md-ai-core.js _pbpAskHistKey), not by extraction
// engine/content version — switching Defuddle<->Jina (or a site re-render)
// re-indexes blocks with different boundaries/order, so a [Pn] chip persisted
// under the old index can point at unrelated content after restore (audit
// #29). Callers persist this alongside a saved answer and re-derive it at
// restore time to detect the mismatch; never a security boundary, just a
// content-drift signal.
function pbpAiBlocksFingerprint() {
  return pbpAiHash(pbpAiBlocks().map((b) => pbpAiTextOf(b.n)).join("\n"));
}

// ---- Forum thread mark (per-comment body wrappers) ----
// Forum site rules (HN/V2EX/SO-discussions) emit nested <blockquote> threads;
// after marked, one top-level thread = one block, so translate/ask/explain would
// treat the whole thread as a single unit. Earlier we FLATTENED (hoisted each
// comment to a top-level blockquote), which destroyed the nested-blockquote
// styling. Instead we mark IN PLACE: each comment's own content (its leading
// non-blockquote children) is wrapped in a <div class="pb-comment-body">, while
// the reply <blockquote>s stay nested exactly where they are. The block indexer
// (pbpAiIndexBlocks) then indexes each .pb-comment-body as one comment, so
// per-comment translation is unchanged; but the nested DOM is preserved, so
// md-preview.css renders the thread like the exported/downloaded HTML. Moves
// already-sanitized element nodes — never builds markup other than the wrapper
// <div>. Relies on marked wrapping blockquote text in <p> (element children
// carry all content). canonicalMarkdown (export/Copy/Raw) is unaffected — this
// only mutates the rendered DOM. md-preview runs it when info.forum is set OR
// when pbpForumShouldMark detects the structural trigger (nested blockquote),
// right after innerHTML, before pbpAiIndexBlocks.
function _pbpMarkComment(bq) {
  const own = [];
  const childBqs = [];
  let seenBq = false;
  for (const c of Array.from(bq.children)) {    // snapshot: we reparent live nodes
    if (c.tagName === "BLOCKQUOTE") { childBqs.push(c); seenBq = true; }
    else if (!seenBq) own.push(c);              // LEADING non-blockquote = this comment's own header + body
    // non-blockquote nodes AFTER the first reply stay in place (don't reorder them: `> A / >> B / > C`
    // renders as <bq><p>A</p><bq>B</bq><p>C</p></bq> and must keep document order A,B,C)
  }
  if (own.length) {                             // skip shells with no own content
    const body = document.createElement("div");
    body.className = "pb-comment-body";
    bq.insertBefore(body, own[0]);              // wrapper takes the leading content's slot,
    for (const c of own) body.appendChild(c);   // ...ahead of the reply blockquotes
  }
  for (const c of childBqs) _pbpMarkComment(c); // recurse into replies (nesting kept)
}

function pbpForumMarkComments(rootEl) {
  if (!rootEl) return;
  for (const el of Array.from(rootEl.children)) {
    if (el.tagName === "BLOCKQUOTE") _pbpMarkComment(el);
  }
}

// Whether to run per-comment decomposition: a site-rule forum page, OR any page
// whose rendered content contains a NESTED blockquote (the comment-thread shape).
// Single-level quotes (no nesting) return false, so normal articles are untouched.
function pbpForumShouldMark(info, rootEl) {
  return !!(info && info.forum) || !!(rootEl && rootEl.querySelector("blockquote blockquote"));
}

// KaTeX pre-pass (translation fidelity): on a CLONE of the block, swap each
// rendered KaTeX tree for its TeX source pulled from the MathML annotation,
// wrapped back in $/$$ delimiters. Display math first (its wrapper contains
// a .katex child). Turndown then sees plain "$tex$" text. Note: Turndown's
// text escaping may add backslashes (e.g. _ -> \_); marked un-escapes them
// on re-render, and pbpAiShield treats the whole $...$ as one opaque slot,
// so the round trip is loss-free.
function _pbpAiKatexPrepass(clone) {
  clone.querySelectorAll(".katex-display").forEach((disp) => {
    const ann = disp.querySelector('.katex-mathml annotation[encoding="application/x-tex"]');
    const src = ann ? ann.textContent : (disp.textContent || "");
    disp.replaceWith(document.createTextNode("$$" + src + "$$"));
  });
  clone.querySelectorAll(".katex").forEach((k) => {
    const ann = k.querySelector('.katex-mathml annotation[encoding="application/x-tex"]');
    const src = ann ? ann.textContent : (k.textContent || "");
    k.replaceWith(document.createTextNode("$" + src + "$"));
  });
}

function pbpAiMdOf(n) {
  const key = String(n);
  if (key in _pbpAiMdCache) return _pbpAiMdCache[key];
  const el = pbpAiBlockEl(n);
  if (!el) return "";
  const clone = el.cloneNode(true);
  _pbpAiKatexPrepass(clone);
  let md;
  try {
    md = htmlToMarkdown(clone.outerHTML).trim();
  } catch (_) {
    md = (clone.textContent || "").trim();
  }
  _pbpAiMdCache[key] = md;
  return md;
}

// ---- KaTeX-aware text variant (ask context/citations; D10-1) ----
// pbpAiTextOf caches the raw el.textContent, which KaTeX's async
// renderMathInElement (md-preview.js) mutates in place for math blocks:
// the block's textContent becomes rendered glyphs + presentation MathML +
// the TeX annotation, all concatenated (a 2-3x duplicated string per
// equation). Ask's context builder and citation tooltips want the clean
// "$tex$" source instead - the same fidelity the translation path already
// gets from _pbpAiKatexPrepass via pbpAiMdOf. Only blocks that actually
// contain rendered KaTeX pay the clone+prepass cost; everything else is
// just pbpAiTextOf. Degrades to pbpAiTextOf on any failure - never throws,
// never blocks ask.
function pbpAiTextOfKatex(n) {
  const key = String(n);
  if (key in _pbpAiTextKatexCache) return _pbpAiTextKatexCache[key];
  const el = pbpAiBlockEl(n);
  if (!el) return "";
  let text = pbpAiTextOf(n);
  if (el.querySelector(".katex")) {
    try {
      const clone = el.cloneNode(true);
      _pbpAiKatexPrepass(clone);
      text = clone.textContent || "";
    } catch (_) { /* degrade: keep the plain pbpAiTextOf(n) assigned above */ }
  }
  _pbpAiTextKatexCache[key] = text;
  return text;
}

// ---- FNV-1a 32-bit hash, hex string. Math.imul keeps the multiply in
// exact 32-bit space (plain * overflows 2^53 and corrupts the hash).
// Hashes UTF-16 code units (not UTF-8 bytes): consistent within this
// extension, which is all cache keys need.
function pbpAiHash(str) {
  const s = String(str == null ? "" : str);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return ("0000000" + h.toString(16)).slice(-8);
}

// ---- Token estimate: chars/4 heuristic (spec: cost transparency only) ----
function pbpAiEstimateTokens(chars) {
  return Math.ceil((Number(chars) || 0) / 4);
}

// ---- Markdown placeholder shield (translation format fidelity) ----
// Replaces untranslatable spans with unique placeholders the prompt orders
// the model to keep verbatim; pbpAiRestore puts the originals back.
// Placeholder chars U+27E6/U+27E7 are outside the banned glyph range and
// never appear in real markdown. Order matters:
//   T raw-HTML complex-table blocks first (whole-tag shield, <table-prefix
//     gated; see below), before any markdown-syntax pass runs on the block
//   C inline code first (may contain $, urls, brackets)
//   M display then inline math (raw $...$ in non-rendered articles; the
//     KaTeX pre-pass in pbpAiMdOf also lands here as $tex$)
//   I whole images BEFORE links (image syntax embeds link syntax)
//   L link URLs only ([text]( stays visible so the text gets translated),
//     then remaining bare/autolink URLs
function pbpAiShield(md) {
  const slots = [];
  const counters = { C: 0, L: 0, I: 0, M: 0, T: 0 };
  function take(kind, orig) {
    counters[kind] += 1;
    const ph = "⟦" + kind + counters[kind] + "⟧";
    slots.push({ ph, orig });
    return ph;
  }
  let text = String(md == null ? "" : md);
  // Absorb any placeholder-shaped literal text already in the source FIRST (an
  // article that talks about this exact shield format, e.g. a self-referential
  // ⟦C1⟧). Left alone it would collide with a placeholder minted below and
  // restore would then substitute BOTH occurrences with whichever slot's orig
  // matched. Taking it as its own slot burns a fresh counter value, so every ph
  // generated by the passes below is guaranteed not to already appear in the text.
  text = text.replace(/⟦([CLIMT])\d+⟧/g, (m, kind) => take(kind, m));
  // T: raw-HTML complex-table blocks — the ONE block shape whose source text
  // IS raw HTML (turndown's complex-table passthrough, md-convert.js). Shield
  // every tag so the model only ever sees cell text; the conservation gate
  // then guarantees the structure round-trips byte-exact. Gated on the
  // <table prefix so prose "<3" or angle-bracket text can never mint a T.
  // Quote-aware: an attribute value can legally contain a bare ">" (DOM
  // serialization never escapes it, e.g. alt="Home > Products"), so the tag
  // body must skip over "..."/'...' spans rather than stopping at the first
  // ">" -- a naive [^>]* would truncate the tag there and leak the rest of
  // the attribute value as unshielded text.
  if (/^\s*<table[\s>]/i.test(text)) {
    text = text.replace(/<\/?[a-zA-Z](?:"[^"]*"|'[^']*'|[^>"'])*>/g, (m) => take("T", m));
  }
  text = text.replace(/``[^`]+``|`[^`\n]+`/g, (m) => take("C", m));
  text = text.replace(/\$\$[^$]+\$\$/g, (m) => take("M", m));
  // Inline math vs currency heuristic: "$5 and $6" (whitespace inside, no
  // TeX-ish chars) is prose and must stay translatable; anything with
  // \ ^ _ { } = or no internal whitespace is treated as math.
  text = text.replace(/\$([^$\n]+)\$/g, (m, inner) => {
    if (/\s/.test(inner) && !/[\\^_{}=]/.test(inner)) return m;
    return take("M", m);
  });
  text = text.replace(/!\[[^\]\n]*\]\([^)\n]*\)/g, (m) => take("I", m));
  text = text.replace(/(\[[^\]\n]*\]\()([^)\n]+)(\))/g,
    (m, pre, url, post) => pre + take("L", url) + post);
  text = text.replace(/https?:\/\/[^\s<>()⟦⟧]+/g, (m) => take("L", m));
  return { text, slots };
}

function pbpAiRestore(text, slots) {
  const s = String(text == null ? "" : text);
  if (!slots || !slots.length) return s;
  // Reverse creation order, one literal substitution per slot (not a rescanning
  // regex pass): a later shield pass's whole-match can swallow an earlier pass's
  // placeholder into its own orig (e.g. an image whose alt text already got its
  // inline code replaced by ⟦C1⟧ -> I1.orig literally contains "⟦C1⟧"). Walking
  // the array newest-first fully unwinds this NESTING, because a later slot's
  // orig is a substring of text whose placeholders were all minted earlier, so
  // it can only ever embed an already-minted ph, never one from its own future.
  // That guarantee does NOT cover ABSORBED literal slots (pre-existing
  // placeholder-shaped text taken in at shield start, see the first pass
  // above): their origs ARE placeholder strings themselves, so descending bare
  // literals in the source (e.g. "⟦C2⟧ ... ⟦C1⟧") can swap/cycle on restore.
  // Accepted boundary -- real content doesn't produce that shape (pinned by
  // the "absorbed-literal swap" test below). .split/.join (not .replace with a
  // string arg) so an orig containing "$" never triggers replacement-pattern
  // interpretation.
  let out = s;
  for (let i = slots.length - 1; i >= 0; i--) {
    out = out.split(slots[i].ph).join(slots[i].orig);
  }
  return out;
}

// ---- Incremental parser for streamed {"translations":[{id,text},...]} ----
// push(accumText) is ALWAYS called with the full accumulated stream text
// (markers get cut by chunk boundaries; never parse deltas). Each complete
// {"id":N,"text":"..."} fires onItem exactly once per id. finish() adds a
// tolerant full JSON sweep (fences stripped, outermost braces sliced) to
// catch key-reordered or otherwise regex-missed items, and returns the set
// of all ids seen (caller diffs against the request to find missing blocks).
function pbpAiMakeStreamJsonParser(onItem) {
  const seen = new Set();
  const itemRe = /\{\s*"id"\s*:\s*(\d+)\s*,\s*"text"\s*:\s*"((?:[^"\\]|\\.)*)"\s*\}/g;
  function sweep(accumText) {
    const s = String(accumText == null ? "" : accumText);
    itemRe.lastIndex = 0;
    let m;
    while ((m = itemRe.exec(s)) !== null) {
      const id = Number(m[1]);
      if (seen.has(id)) continue;
      let textVal;
      try { textVal = JSON.parse('"' + m[2] + '"'); } catch (_) { continue; }
      seen.add(id);
      try { onItem({ id, text: textVal }); } catch (_) {}
    }
  }
  return {
    push(accumText) { sweep(accumText); },
    finish(accumText) {
      sweep(accumText);
      let s = String(accumText == null ? "" : accumText).trim();
      s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
      const a = s.indexOf("{");
      const b = s.lastIndexOf("}");
      if (a !== -1 && b > a) {
        try {
          const obj = JSON.parse(s.slice(a, b + 1));
          const arr = obj && Array.isArray(obj.translations) ? obj.translations : [];
          for (const it of arr) {
            const id = Number(it && it.id);
            if (!Number.isInteger(id) || seen.has(id) || typeof (it && it.text) !== "string") continue;
            seen.add(id);
            try { onItem({ id, text: it.text }); } catch (_) {}
          }
        } catch (_) {}
      }
      return { seenIds: new Set(seen) };
    }
  };
}

// ---- CITES block parser (ask answers) ----
// Answer format: body with inline [Pn], then a trailing block:
//   CITES:
//   P7: "verbatim quote"
// Tolerates: absence, curly/straight/missing quotes, "- " list dashes,
// junk lines, stream truncation mid-line. Anchors on the LAST "CITES:"
// line so a body that mentions the word is not split early.
// Full-width colon (：) and CJK corner quotes (「」『』) are accepted
// everywhere ASCII forms are: models generating Chinese output routinely
// emit them despite the ASCII wire format in the prompt, and a missed
// marker dumps the whole CITES block into the rendered body.
function pbpAiParseCites(fullText) {
  const text = String(fullText == null ? "" : fullText);
  // The marker must END its line (or the text — stream truncation): without
  // the anchor, a body line like "CITES：这是正文" would split the answer
  // and swallow everything after it.
  const markerRe = /(?:^|\n)[ \t]*CITES[:：][ \t]*\r?(?:\n|$)/g;
  let m;
  let last = null;
  while ((m = markerRe.exec(text)) !== null) last = m;
  if (!last) return { body: text.trim(), cites: [] };
  const body = text.slice(0, last.index).trim();
  const cites = [];
  for (let line of text.slice(last.index + last[0].length).split("\n")) {
    line = line.replace(/\r$/, "");
    const lm = line.match(/^[ \t]*[-*]?[ \t]*P(\d+)[ \t]*[:：][ \t]*(.+)$/);
    if (!lm) continue;
    const quote = lm[2].trim()
      .replace(/^["“'‘「『]/, "")
      .replace(/["”'’」』]$/, "")
      .trim();
    if (quote) cites.push({ p: Number(lm[1]), quote });
  }
  return { body, cites };
}

// ---- Fuzzy quote locator (client-side citation verification) ----
// Whitespace-normalized; returns ORIGINAL haystack indices {start,end} for
// the Range/highlight, or null. Exact indexOf first; else sliding fixed-size
// window with capped (banded) Levenshtein, budget = floor(needleLen/5)
// (spec: ~1 error per 5 chars).
// Note: the match window is fixed at the needle's normalized length, so when
// the needle is shorter than the true match (a deletion), the returned end
// offset can be up to budget chars short on the trailing edge -- acceptable
// for approximate citation highlighting.
function _pbpAiNormWithMap(s) {
  const chars = [];
  const map = [];
  let prevSpace = true;
  const str = String(s == null ? "" : s);
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (/\s/.test(c)) {
      if (!prevSpace) { chars.push(" "); map.push(i); prevSpace = true; }
    } else {
      chars.push(c); map.push(i); prevSpace = false;
    }
  }
  while (chars.length && chars[chars.length - 1] === " ") { chars.pop(); map.pop(); }
  return { text: chars.join(""), map };
}

function _pbpAiEditDistanceCapped(a, b, budget) {
  if (Math.abs(a.length - b.length) > budget) return budget + 1;
  let prev = new Array(b.length + 1);
  let cur = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > budget) return budget + 1;
    const tmp = prev; prev = cur; cur = tmp;
  }
  return prev[b.length];
}

function pbpAiFuzzyFind(needle, haystack) {
  const nd = _pbpAiNormWithMap(needle);
  const hay = _pbpAiNormWithMap(haystack);
  if (!nd.text || !hay.text) return null;
  const mapBack = (s, e) => ({ start: hay.map[s], end: hay.map[e - 1] + 1 });
  const exact = hay.text.indexOf(nd.text);
  if (exact !== -1) return mapBack(exact, exact + nd.text.length);
  const budget = Math.floor(nd.text.length / 5);
  if (budget === 0) return null;
  const win = nd.text.length;
  let bestDist = budget + 1;
  let bestStart = -1;
  for (let i = 0; i < hay.text.length; i++) {
    const slice = hay.text.slice(i, i + win);
    if (slice.length < win - budget) break;
    const d = _pbpAiEditDistanceCapped(nd.text, slice, Math.min(budget, bestDist - 1));
    if (d < bestDist) {
      bestDist = d;
      bestStart = i;
      if (bestDist === 0) break;
    }
  }
  if (bestStart === -1 || bestDist > budget) return null;
  return mapBack(bestStart, Math.min(bestStart + win, hay.text.length));
}

// ---- Settings (md-preview page) ----
// Memoized for a short-lived preview, invalidated on any real settings change.
let _pbpAiSettingsPromise = null;

if (typeof chrome !== "undefined" && chrome.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync" && area !== "local") return;
    if (pbpSettingsKeysChanged(changes)) _pbpAiSettingsPromise = null;
    if (changes.optSyncEnabled) _pbpAiSettingsPromise = null;
  });
}

function pbpAiGetSettings() {
  if (!_pbpAiSettingsPromise) {
    // Memoize the promise, but NEVER a rejected one: a rejected promise is
    // truthy, so the `!_pbpAiSettingsPromise` guard above would pin one
    // transient storage failure onto every AI entry point on the page (ask,
    // translate, skim, video) and silently defeat md-ask.js's backoff retry.
    // Same singleflight shape as background.js's loadSettings(); the identity
    // guard keeps a concurrent onChanged reset from being clobbered.
    const p = _pbpAiSettingsPromise = pbpReadSettingsWithSecrets(SETTINGS_DEFAULTS)
      .then((s) => deobfuscateSettings(s))
      .catch((e) => {
        if (_pbpAiSettingsPromise === p) _pbpAiSettingsPromise = null;
        throw e;
      });
  }
  return _pbpAiSettingsPromise;
}

// Gate: master switch on AND a usable AI key (hasAIKey from ai.js; ollama
// counts as keyed). False -> no md-ai entry point renders at all.
function pbpAiAvailable(s) {
  return s.previewAiEnabled !== false && hasAIKey(s);
}

// Preview model override is PER PROVIDER (previewAiModelByProvider): a model
// name written for one provider is meaningless on another, and the old single
// key silently leaked across an AI-provider switch (translate failed while the
// provider's own test connection passed). The legacy single key previewAiModel
// applies only while the map has NO entry for the current provider -- an
// explicit "" entry means "no override", so hasOwnProperty, not truthiness.
function pbpAiResolveModelOverride(s) {
  const st = s || {};
  const p = st.aiProvider || "gemini";
  const map = st.previewAiModelByProvider;
  const raw = (map && typeof map === "object" && !Array.isArray(map)
      && Object.prototype.hasOwnProperty.call(map, p))
    ? map[p] : st.previewAiModel;
  const m = (typeof raw === "string") ? raw.trim() : "";
  return m || undefined;
}

// Error attribution for the override: when a preview request dies on a
// model-shaped failure while an override is active, name the override as the
// suspect -- the AI Providers tab's test connection never exercises it, so
// without this line the failure looks unexplainable. Returns "" when silent
// (no override, or an error class the override can't cause: 401/403/429/5xx).
function pbpAiOverrideErrHint(err, s) {
  const model = pbpAiResolveModelOverride(s);
  if (!model) return "";
  const code = err && err.code;
  const status = err && err.status;
  if (code !== "model_not_found" && status !== 400 && status !== 404 && status !== 422) return "";
  return t("previewAiOverrideErrHint", model, (s && s.aiProvider) || "gemini");
}

// Cache-identity model: the preview override if set, else the provider's
// CONFIGURED model (what requests will actually use), else that provider's
// default. A bare "default" placeholder would let a configured-model switch
// keep serving the old model's cached output.
function pbpAiEffectiveModel(s) {
  const o = pbpAiResolveModelOverride(s);
  if (o) return o;
  const st = s || {};
  const p = st.aiProvider || "gemini";
  const own = p === "gemini" ? (st.geminiModel || "gemini-3.5-flash-lite")
    : p === "claude" ? (st.claudeModel || "claude-haiku-4-5")
    : p === "ollama" ? (st.ollamaModel || "llama3.2")
    : null;
  if (own !== null) return String(own).trim() || "default";
  const reg = (typeof OPENAI_COMPAT_PROVIDERS === "object" && OPENAI_COMPAT_PROVIDERS[p]) || null;
  const conf = (reg && reg.modelField && st[reg.modelField]) || "";
  return String(conf).trim() || (reg && reg.defaultModel) || "default";
}

// A permission prompt is only legal from a real user gesture. Error UIs call this
// directly from their existing Retry/Regenerate click; the callback is untouched
// until the exact provider origin is granted, so denial leaves state and caches alone.
async function pbpAiRetryWithPermission(error, settings, retry) {
  if (error && error.code === "host_permission") {
    let granted = false;
    try { granted = await requestAIHostPermissions(settings); } catch (_) {}
    if (!granted) return false;
  }
  await retry();
  return true;
}

// ---- IDB persistence: thin wrappers over ai-cache.js (pbpAiCacheGet/Set).
// ONE aggregated entry per article per (lang, model) so the 200-entry LRU
// is not flooded by per-block writes. Entry shape: {key, result, ts}.
const PBP_ASK_HIST_MAX = 20;

function _pbpTrOwnerScope(account) {
  return account ? "acct_" + encodeURIComponent(String(account)) : "ownerless";
}

// Shared cache-key URL normalization (extracted from md-skim.js so ask
// history and skim agree byte-for-byte): drop #fragments except hash
// ROUTERS (#/docs/x, #!page — those address content), then strip the known
// tracking-param set with default settings (deterministic key, independent
// of the user's strip config). Any parse failure falls back to the input.
function pbpAiCacheUrlNorm(url) {
  let u = String(url || "");
  try {
    const p = new URL(u);
    if (!/^#[!/]/.test(p.hash)) p.hash = "";
    u = p.href;
  } catch (_) {}
  try {
    if (typeof stripTrackingParams === "function") u = stripTrackingParams(u).cleaned || u;
  } catch (_) {}
  return u;
}
function _pbpTrCacheKey(url, lang, model, account) {
  return "tr_" + _pbpTrOwnerScope(account) + "_" + lang + "_" + model + "_" + pbpAiHash(String(url || ""));
}

// ---- tr_ cache meta helpers (ZH-1a; pure, unit-tested) ----
// Bounded generation set: append-if-absent, cap 4, drop oldest. gens.length>1
// is the "mixed generations" signal, so a single-value meta would let the
// continue-run merge overwrite history and certify a 60% old + 40% new entry
// as pure-new -- the mechanism switching itself off on its main path (D3).
function pbpTrGensPush(gens, gen) {
  const out = Array.isArray(gens) ? gens.slice() : [];
  if (out.indexOf(gen) === -1) out.push(gen);
  while (out.length > 4) out.shift();
  return out;
}

// The single write-transform behind pbpTrCacheSet (runs inside the
// pbpAiCacheAppend transaction; pure so tests can drive it directly).
// meta undefined (retry path / a flush without a run meta) -> carry the
// previous meta through unchanged; stripping it here is exactly the
// high-frequency-flush defect gate D5 pins. A LEGACY entry (blocks present,
// meta undefined) never gains a fabricated meta: its blocks' generation is
// unknown, and certifying them as current would mislabel a mixed article as
// pure-new (spec ZH-1a section 6 -- legacy entries stay "generation unknown"
// and never prompt). All absence checks use === undefined ("" and 0 are
// legal values).
function pbpTrCacheApplyWrite(prev, blocksMap, meta) {
  const prevBlocks = (prev && prev.blocks && typeof prev.blocks === "object") ? prev.blocks : {};
  const hadPrevBlocks = Object.keys(prevBlocks).length > 0;
  const out = { blocks: Object.assign({}, prevBlocks, blocksMap || {}) };
  const prevMeta = (prev && typeof prev === "object") ? prev.meta : undefined;
  if (meta === undefined) {
    if (prevMeta !== undefined) out.meta = prevMeta;
    return out;
  }
  if (prevMeta === undefined && hadPrevBlocks) return out;
  // gfs is a bounded SET like gens, not a last-write value (review finding #3):
  // a continue-run after a user-glossary edit produces blocks from two term
  // tables in one entry, and overwriting the fingerprint would certify that
  // mixed entry as "current". ag stays last-write on purpose -- it is reuse
  // material for the next run's extraction skip, not a certification record.
  const next = {
    gens: pbpTrGensPush(prevMeta ? prevMeta.gens : [], meta.pg),
    gfs: pbpTrGensPush(prevMeta ? prevMeta.gfs : [], meta.gf),
    sm: meta.sm
  };
  const ag = meta.ag !== undefined ? meta.ag : (prevMeta ? prevMeta.ag : undefined);
  if (ag !== undefined) next.ag = ag;
  out.meta = next;
  return out;
}
// Owner-scoped like the tr_/trview_/gloss_ families (account-isolation
// invariant): ask Q&A is account-derived data — an ownerless key let a
// later Pinboard login on this machine read (and clear) the previous
// user's threads. URL-normalized like skim: fragment/tracker variants of
// one article share one thread. Legacy ownerless "ask_<rawhash>" entries
// are NOT adopted (adoption would be the same cross-account leak); the
// restore path deletes them on sight and the LRU ages out the rest.
function _pbpAskHistKey(url, account) {
  return "ask_" + _pbpTrOwnerScope(account) + "_" + pbpAiHash(pbpAiCacheUrlNorm(url));
}
function _pbpAskHistLegacyKey(url) { return "ask_" + pbpAiHash(String(url || "")); }
function _pbpTrViewKey(url, account) {
  return "trview_" + _pbpTrOwnerScope(account) + "_" + pbpAiHash(String(url || ""));
}
function _pbpAskHistTrim(arr) {
  return Array.isArray(arr) ? arr.slice(-PBP_ASK_HIST_MAX) : [];
}

async function pbpTrCacheGet(url, lang, model, account) {
  const entry = await pbpAiCacheGet(_pbpTrCacheKey(url, lang, model, account));
  const r = entry && entry.result;
  if (!r || typeof r !== "object" || !r.blocks || typeof r.blocks !== "object") return null;
  // ZH-1a D5: the allowlist carries meta through -- the strip here was one of
  // the two places that silently ate it. === undefined, never truthiness.
  const out = { blocks: r.blocks };
  if (r.meta !== undefined) out.meta = r.meta;
  return out;
}

// `replace` (ZH-1b retranslate / full-miss runs): discard the stored blocks
// AND meta atomically with this write instead of merging -- the fresh entry
// holds only the current run's output and generation (gate D11). Crucially
// there is NO separate pre-run delete: the old paid translation survives on
// disk until new content actually lands (review batch-2 #2/#9 -- Stop,
// offline or a total failure then lose nothing; reloading restores it).
async function pbpTrCacheSet(url, lang, model, blocksMap, account, meta, replace) {
  // Atomic merge (mirrors pbpAskHistAppend): a plain get-then-put lets two
  // preview tabs on the same URL/lang/model race and silently drop one tab's
  // freshly-translated (and paid-for) blocks. Routing the read-merge-write
  // through pbpAiCacheAppend puts it in ONE readwrite IDB transaction, which
  // IndexedDB serializes across tabs/connections. `meta` (optional, ZH-1a) is
  // the run's generation record; the transform merges it against the stored
  // one (see pbpTrCacheApplyWrite). NOTE (ZH-2): the `blocks` key order
  // carries NO time or document semantics -- viewport-priority claiming means
  // writes arrive in whatever order batches finish; consumers must key by
  // blockHash only, never by insertion order.
  const key = _pbpTrCacheKey(url, lang, model, account);
  await pbpAiCacheAppend(key, (prev) => pbpTrCacheApplyWrite(replace ? undefined : prev, blocksMap, meta), Date.now());
}

// Auto-extracted terminology cache (spec T1): one entry per account/article/(lang, model),
// parallel to the translation cache. Entry shape: {key, result:{terms:{...}}, ts}.
function _pbpTrGlossaryCacheKey(url, lang, model, account) {
  // ZH-1a D6: the extraction-prompt generation lives in the KEY, not in meta --
  // extraction has no "stale but usable" middle state; a bumped generation
  // should simply re-extract (one cheap noThinking call). This also closes the
  // seam where a later PBP_TR_GLOSSARY_SYSTEM change (ZH-4 / ZH-9 / EN-2)
  // would otherwise never trigger re-extraction. The constant is defined in
  // md-translate.js's pure top (next to the prompt it covers) and resolved at
  // call time; md-preview.html and the test page load both files.
  const gen = (typeof PBP_TR_GLOSSARY_GEN === "number") ? PBP_TR_GLOSSARY_GEN : 0;
  return "gloss_" + _pbpTrOwnerScope(account) + "_g" + gen + "_" + lang + "_" + model + "_" + pbpAiHash(String(url || ""));
}
async function pbpTrGlossaryCacheGet(url, lang, model, account) {
  const entry = await pbpAiCacheGet(_pbpTrGlossaryCacheKey(url, lang, model, account));
  const r = entry && entry.result;
  if (!r || typeof r !== "object" || !r.terms || typeof r.terms !== "object") return null;
  return r.terms;
}
async function pbpTrGlossaryCacheSet(url, lang, model, terms, account) {
  await pbpAiCacheSet(_pbpTrGlossaryCacheKey(url, lang, model, account), { terms: terms || {} }, Date.now());
}

async function pbpAskHistGet(url, account) {
  const entry = await pbpAiCacheGet(_pbpAskHistKey(url, account));
  return (entry && Array.isArray(entry.result)) ? entry.result : [];
}

async function pbpAskHistSet(url, arr, account) {
  await pbpAiCacheSet(_pbpAskHistKey(url, account), _pbpAskHistTrim(arr), Date.now());
}

// Atomic history append (D2-2): a plain pbpAskHistGet()+push+pbpAskHistSet()
// sequence is two separate IDB transactions, so two preview tabs open on the
// same URL can race a concurrent get-then-put and silently lose one tab's
// round (classic last-writer-wins). Routing the read-modify-write through
// ai-cache.js's pbpAiCacheAppend puts it in ONE readwrite transaction,
// which IndexedDB serializes across tabs/connections - closing the race.
async function pbpAskHistAppend(url, round, account) {
  await pbpAiCacheAppend(_pbpAskHistKey(url, account), (prev) => {
    const hist = Array.isArray(prev) ? prev.slice() : [];
    hist.push(round);
    return _pbpAskHistTrim(hist);
  });
}

async function pbpAskHistReplaceLast(url, round, account) {
  await pbpAiCacheAppend(_pbpAskHistKey(url, account), (prev) => {
    const hist = Array.isArray(prev) ? prev.slice() : [];
    if (hist.length && hist[hist.length - 1] && hist[hist.length - 1].q === round.q) {
      hist[hist.length - 1] = round;
    } else {
      hist.push(round);
    }
    return _pbpAskHistTrim(hist);
  });
}

async function pbpTrViewGet(url, account) {
  const entry = await pbpAiCacheGet(_pbpTrViewKey(url, account));
  const r = entry && entry.result;
  if (!r || typeof r !== "object" || typeof r.mode !== "string") return null;
  return { mode: r.mode, lang: String(r.lang || "") };
}

async function pbpTrViewSet(url, state, account) {
  await pbpAiCacheSet(_pbpTrViewKey(url, account), {
    mode: String((state && state.mode) || "original"),
    lang: String((state && state.lang) || "")
  }, Date.now());
}

// ---- Local usage counters (storage.local only, NO telemetry; spec sec 11:
// keep/deepen/kill decision after three months). Fire-and-forget.
function pbpAiBumpCounter(name) {
  if (name !== "explain" && name !== "ask" && name !== "translate") return;
  try {
    if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) return;
    chrome.storage.local.get({ pbp_ai_usage: { explain: 0, ask: 0, translate: 0 } })
      .then((d) => {
        const u = (d && d.pbp_ai_usage && typeof d.pbp_ai_usage === "object")
          ? d.pbp_ai_usage : { explain: 0, ask: 0, translate: 0 };
        u[name] = (u[name] || 0) + 1;
        return chrome.storage.local.set({ pbp_ai_usage: u });
      })
      .catch(() => {});
  } catch (_) {}
}
