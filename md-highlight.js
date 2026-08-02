// ============================================================
// Pinboard Bookmark Enhanced - md-preview user-text highlighting.
// Loaded ONLY by md-preview.html (after md-ask.js). This top section
// is PURE (no DOM / chrome.* / fetch) so tests/md-ai-tests.html can
// load the file on file://. Design: docs/superpowers/specs/
// 2026-07-03-md-preview-highlights-design.md section 3 (anchor +
// restore) and section 5 (H2 export). Later plan tasks append:
// storage (pbp_hl_<urlKey>), the floating bar, the edit card, and the
// CSS Highlight registry wiring (spec sections 1, 2, 4, 6).
// ============================================================

// ---- Anchor generation (spec 3): {quote, prefix, suffix} from a
// block's plain text and a [startOff, endOff) selection range.
// prefix/suffix are each clamped to <= 32 chars AND to the block's
// own bounds -- a selection near either edge naturally yields a
// shorter affix, never padding.
function pbpHlSelectorOf(blockText, startOff, endOff) {
  const text = typeof blockText === "string" ? blockText : "";
  const s = Math.max(0, Math.min(startOff, text.length));
  const e = Math.max(s, Math.min(endOff, text.length));
  return {
    quote: text.slice(s, e),
    prefix: text.slice(Math.max(0, s - 32), s),
    suffix: text.slice(e, Math.min(text.length, e + 32)),
  };
}

// Longest common SUFFIX of a and b (scores how well the text
// immediately BEFORE a candidate occurrence matches the recorded
// prefix).
function _pbpHlCommonSuffixLen(a, b) {
  let i = a.length, j = b.length, n = 0;
  while (i > 0 && j > 0 && a[i - 1] === b[j - 1]) { i--; j--; n++; }
  return n;
}

// Longest common PREFIX of a and b (scores how well the text
// immediately AFTER a candidate occurrence matches the recorded
// suffix).
function _pbpHlCommonPrefixLen(a, b) {
  let i = 0;
  const n = Math.min(a.length, b.length);
  while (i < n && a[i] === b[i]) i++;
  return i;
}

// ---- Restore-time relocation (spec 3): find item.quote in the
// CURRENT blockText. Zero occurrences -> null (caller degrades to a
// whole-block highlight). One occurrence -> that one. Multiple ->
// score every occurrence by how much of item.prefix/item.suffix it
// reproduces immediately outside the match, take the highest score;
// a tie keeps the FIRST occurrence (deterministic across reloads,
// no randomness).
function pbpHlLocate(blockText, item) {
  const text = typeof blockText === "string" ? blockText : "";
  const quote = item && typeof item.quote === "string" ? item.quote : "";
  if (!quote) return null;
  const prefix = (item && typeof item.prefix === "string") ? item.prefix : "";
  const suffix = (item && typeof item.suffix === "string") ? item.suffix : "";
  const hits = [];
  let idx = text.indexOf(quote);
  while (idx !== -1) {
    hits.push(idx);
    idx = text.indexOf(quote, idx + 1);
  }
  if (!hits.length) return null;
  if (hits.length === 1) return { start: hits[0], end: hits[0] + quote.length };
  let best = hits[0];
  let bestScore = -1;
  for (const start of hits) {
    const end = start + quote.length;
    const score = _pbpHlCommonSuffixLen(text.slice(0, start), prefix)
      + _pbpHlCommonPrefixLen(text.slice(end), suffix);
    if (score > bestScore) {
      bestScore = score;
      best = start;
    }
  }
  return { start: best, end: best + quote.length };
}

// ---- Content-drift relocation layer (anchoring round, pure/testable).
// Restore used to trust item.n unconditionally: after the source page
// drifts (a paragraph inserted shifts every later block's n), the quote
// either vanished (silent skip), degraded to highlighting a WRONG whole
// block, or -- worst -- exact-matched inside an unrelated block that
// inherited the old n. The three functions below give restore a way to
// re-find the quote ANYWHERE with strict acceptance rules instead. ----

// Fingerprint of a block list as [[tag, text], ...] pairs. JSON-encoded
// before hashing so block BOUNDARIES are part of the identity -- the ask
// subsystem's pbpAiBlocksFingerprint joins texts with "\n", under which
// one "a\nb" block and two "a"/"b" blocks collide, which is exactly the
// structural change this fingerprint exists to detect (Codex review).
// Depends on md-ai-core.js's pbpAiHash (the tests page loads both files).
function pbpHlFpOfBlocks(pairs) {
  if (typeof pbpAiHash !== "function") return "";
  try { return pbpAiHash(JSON.stringify(Array.isArray(pairs) ? pairs : [])); } catch (_) { return ""; }
}

// Global EXACT relocation: search item.quote across every {n, text} block.
// Strictness contract (Codex review): a lone candidate wins; multiple
// candidates only if ONE has the strictly highest prefix/suffix context
// score; any tie -> null (caller orphans). Unlike pbpHlLocate's in-block
// tie-keeps-first (bounded ambiguity: the user's own block), first-wins
// across arbitrary blocks would be a silent mis-anchor. Block distance to
// the stored n is deliberately NOT a tie-breaker -- it manufactures false
// confidence for short/repeated quotes anchoring to whichever twin sits
// nearest.
function pbpHlGlobalLocate(blocks, item) {
  const quote = item && typeof item.quote === "string" ? item.quote : "";
  if (!quote) return null;
  const prefix = (item && typeof item.prefix === "string") ? item.prefix : "";
  const suffix = (item && typeof item.suffix === "string") ? item.suffix : "";
  const cands = [];
  for (const b of (Array.isArray(blocks) ? blocks : [])) {
    const text = (b && typeof b.text === "string") ? b.text : "";
    let idx = text.indexOf(quote);
    while (idx !== -1) {
      const end = idx + quote.length;
      cands.push({
        n: b.n, start: idx, end,
        score: _pbpHlCommonSuffixLen(text.slice(0, idx), prefix)
          + _pbpHlCommonPrefixLen(text.slice(end), suffix),
      });
      if (cands.length > 200) return null; // pathological repetition (1-char quotes etc.): inherently ambiguous
      idx = text.indexOf(quote, idx + 1);
    }
  }
  if (!cands.length) return null;
  if (cands.length === 1) return cands[0];
  cands.sort((a, b) => b.score - a.score);
  return cands[0].score > cands[1].score ? cands[0] : null;
}

// Whitespace-collapse normalizer with an offset map back into the original
// string: norm[i] came from text[map[i]]. Runs of whitespace (any \s,
// newlines included) collapse to one space so a quote saved as "foo bar"
// still matches text re-extracted as "foo\nbar". Pure; the map is what
// keeps the eventual Range on ORIGINAL offsets.
function pbpHlWsNormalize(text) {
  const t = typeof text === "string" ? text : "";
  let norm = "";
  const map = [];
  let inWs = false;
  for (let i = 0; i < t.length; i++) {
    if (/\s/.test(t[i])) {
      if (!inWs) { norm += " "; map.push(i); inWs = true; }
    } else {
      norm += t[i];
      map.push(i);
      inWs = false;
    }
  }
  return { norm, map };
}

// Whitespace-normalized fallback for pbpHlGlobalLocate: same strict
// acceptance rules, run over normalized text, hit mapped back to original
// offsets. NOT skipped when the quote itself has no collapsible runs --
// the BLOCK text may still differ from the quote only in whitespace shape
// ("foo bar" vs "foo\nbar"), which is exactly the case this rescues.
function pbpHlGlobalLocateNormalized(blocks, item) {
  const qn = pbpHlWsNormalize(item && item.quote).norm;
  if (!qn) return null;
  const pn = pbpHlWsNormalize(item && item.prefix).norm;
  const sn = pbpHlWsNormalize(item && item.suffix).norm;
  const normBlocks = [];
  const maps = new Map();
  for (const b of (Array.isArray(blocks) ? blocks : [])) {
    const { norm, map } = pbpHlWsNormalize(b && b.text);
    normBlocks.push({ n: b.n, text: norm });
    maps.set(b.n, map);
  }
  const hit = pbpHlGlobalLocate(normBlocks, { quote: qn, prefix: pn, suffix: sn });
  if (!hit) return null;
  const map = maps.get(hit.n);
  if (!map || hit.end < 1 || hit.end > map.length) return null;
  return { n: hit.n, start: map[hit.start], end: map[hit.end - 1] + 1 };
}

// ---- H5 translated-side paint gate (spec 1.3, pure/testable). An
// original-side item (no side, or side !== "tr") is always eligible here --
// its own block-existence check lives in the DOM layer. A translated-side
// item paints ONLY when the language it was recorded in (item.lang) still
// matches the language the .pb-tr block currently displays (blockTrLang, read
// off the element's data-pb-tr-lang by the DOM caller -- memo-immune, never
// from the stale settings promise).
function pbpHlItemPaints(item, blockTrLang) {
  if (!item || item.side !== "tr") return true;
  return typeof item.lang === "string" && item.lang.length > 0 && item.lang === blockTrLang;
}

// ---- H5 block-level mirror color (spec 1.5, pure/testable). Among the
// highlights in block n anchored to `side` ("orig"|"tr") that would actually
// paint (tr items gated by blockTrLang), return the color (1..5) of the
// newest by ts, else 0. pbpHlSyncMirror uses it cross-side: the .pb-tr shows
// the ORIGINAL side's color, the original block shows the TRANSLATED side's.
function pbpHlLatestColorOnSide(items, n, side, blockTrLang) {
  const list = Array.isArray(items) ? items : [];
  let best = null;
  for (const it of list) {
    if (!it || (Number(it.n) || 0) !== n) continue;
    const itSide = it.side === "tr" ? "tr" : "orig";
    if (itSide !== side) continue;
    if (side === "tr" && !pbpHlItemPaints(it, blockTrLang)) continue;
    if (!best || (Number(it.ts) || 0) > (Number(best.ts) || 0)) best = it;
  }
  if (!best) return 0;
  const c = Number(best.color) | 0;
  return (c >= 1 && c <= 5) ? c : 1;
}

// ---- H2 export: aggregation section (spec 5). Tag slugs are FIXED
// English strings (a markdown interchange format, like frontmatter)
// -- i18n only touches UI labels, never these.
const PBP_HL_SLUGS = ["#hl-quote", "#hl-definition", "#hl-example", "#hl-doubt", "#hl-todo"];

// Blockquote a possibly-multi-line string: prefix every line with
// "> " (a bare "> " would print a trailing space, so an empty line
// gets just ">" instead -- both are valid CommonMark blockquote
// lines).
function _pbpHlQuoteLines(text) {
  return String(text).split("\n").map((line) => (line ? "> " + line : ">")).join("\n");
}

// items -> "## Highlights" section: one blockquote (+ optional note
// paragraph, via spec 5's blank quoted "> " line trick for a second
// paragraph) and a fixed-slug tag line per item. Empty/missing items
// -> "" (no heading at all) so Task 6's composeExport
// "no highlights -> byte-identical output" regression guard holds
// trivially.
function pbpHlComposeSection(items) {
  const list = Array.isArray(items) ? items.filter((it) => it && typeof it.quote === "string" && it.quote) : [];
  if (!list.length) return "";
  const groups = list.map((it) => {
    let block = _pbpHlQuoteLines(it.quote);
    if (it.note) block += "\n>\n" + _pbpHlQuoteLines(it.note);
    const slug = PBP_HL_SLUGS[(Number(it.color) | 0) - 1] || PBP_HL_SLUGS[0];
    // H5 (spec 1.6): a translated-side highlight prints its own-language quote,
    // tagged so a mixed-language export is unambiguous. Original items get no
    // tag -> byte-identical to today (regression guard holds).
    const tag = (it.side === "tr" && it.lang) ? " [tr:" + it.lang + "]" : "";
    return block + "\n\n" + slug + tag;
  });
  return "## Highlights\n\n" + groups.join("\n\n");
}

// ---- Opportunistic inline marking (spec 5). "Protected" spans are
// fenced code blocks (```...```) and inline code spans (`...`) --
// matches inside either are never wrapped. ponytail: this is a
// substring/regex scan, not a real CommonMark tokenizer (no nested
// fence-length counting, no multi-line inline spans); good enough
// for "is this quote inside SOME code span" -- upgrade to
// md-convert's real parser only if that ceiling is ever hit in
// practice. Trap (Important-1): an UNCLOSED fence at EOF has no
// closing ``` for the first branch to find, so WITHOUT a dedicated
// branch the alternation falls through to the inline-code branch,
// which greedily swallows just the fence opener's first two
// backticks as an empty `` span -- leaving everything after the
// fence opener (to end of document) completely unprotected. Per
// CommonMark, an unclosed fence runs to end of document, so the
// middle branch below closes that gap; it MUST stay ordered AFTER
// the closed-fence branch so a real closer still wins when one
// exists (alternation tries branches left-to-right per start index).
function _pbpHlProtectedRanges(md) {
  const ranges = [];
  const re = /```[\s\S]*?```|```[\s\S]*$|`[^`\n]*`/g;
  let m;
  while ((m = re.exec(md))) {
    ranges.push([m.index, m.index + m[0].length]);
  }
  return ranges;
}

function _pbpHlInProtected(ranges, start, end) {
  return ranges.some(([a, b]) => start < b && end > a);
}

// md, items -> md with each item's quote wrapped in "==...==" IFF it
// matches verbatim exactly ONCE outside any protected span. Zero or
// multiple (ambiguous) matches -> that item is skipped (spec 5: the
// aggregation section is the always-complete record; this is
// best-effort on top, zero data loss either way). Overlapping wraps
// across items are resolved by keeping the earliest and dropping the
// rest -- also treated as "ambiguous".
function pbpHlInlineMark(md, items, view) {
  const text = typeof md === "string" ? md : "";
  let list = Array.isArray(items) ? items : [];
  // H5 (spec 1.6): filter by the translation view being exported. orig -> only
  // original-side items; tr -> only translated-side items (fixes the old
  // tr-only export silently dropping every == mark, because an orig-language
  // quote never matched the translated-only body); bilingual/undefined ->
  // both sides (each quote matches its own language's text in the interleaved
  // body). Legacy 2-arg callers pass view=undefined -> unchanged.
  if (view === "orig") list = list.filter((it) => it && it.side !== "tr");
  else if (view === "tr") list = list.filter((it) => it && it.side === "tr");
  if (!text || !list.length) return text;
  const protectedRanges = _pbpHlProtectedRanges(text);
  const wraps = [];
  for (const it of list) {
    if (!it || typeof it.quote !== "string" || !it.quote) continue;
    const quote = it.quote;
    let hit = null;
    let count = 0;
    let idx = text.indexOf(quote);
    while (idx !== -1) {
      const end = idx + quote.length;
      if (!_pbpHlInProtected(protectedRanges, idx, end)) {
        count++;
        hit = { start: idx, end };
      }
      idx = text.indexOf(quote, idx + 1);
    }
    if (count === 1) wraps.push(hit);
  }
  if (!wraps.length) return text;
  wraps.sort((a, b) => a.start - b.start);
  const kept = [];
  let lastEnd = -1;
  for (const w of wraps) {
    if (w.start >= lastEnd) {
      kept.push(w);
      lastEnd = w.end;
    }
  }
  let out = "";
  let pos = 0;
  for (const w of kept) {
    out += text.slice(pos, w.start) + "==" + text.slice(w.start, w.end) + "==";
    pos = w.end;
  }
  out += text.slice(pos);
  return out;
}

// ---- Notebook list model (spec 2.1, pure/testable): document order (n asc,
// ts asc within the same block) -> optional color filter -> excerpt
// truncation. Never touches Ranges/Highlights/DOM -- the DOM layer below
// (_pbpHlNotebookRender) maps this over live blockEl lookups separately.
const PBP_HL_EXCERPT_LEN = 60;

// First line of a possibly-multi-line string, truncated to
// PBP_HL_EXCERPT_LEN chars with a trailing ellipsis (U+2026, \u escape per
// the iron rule -- no literal non-ASCII in code) ONLY when it actually
// exceeds the limit; exactly at the limit stays bare (spec: truncate + ellipsis
// only past the 60-char cutoff, not at it).
function _pbpHlExcerpt(text) {
  const first = String(text).split("\n")[0];
  return first.length > PBP_HL_EXCERPT_LEN
    ? first.slice(0, PBP_HL_EXCERPT_LEN) + "\u2026"
    : first;
}

// items -> notebook rows, document order, optionally filtered by color.
// colorFilter: a Set of enabled colors (1..5), or null/undefined meaning
// "all colors" (spec 2.2 default all-on). noteExcerpt is null (not "")
// when the item's note is empty, so DOM callers can tell "no note line"
// from "an empty-string note line" with one falsy check.
function pbpHlNotebookModel(items, colorFilter) {
  const list = Array.isArray(items) ? items.filter((it) => it && typeof it.quote === "string") : [];
  const filtered = colorFilter
    ? list.filter((it) => colorFilter.has((it.color >= 1 && it.color <= 5) ? it.color : 1))
    : list.slice();
  filtered.sort((a, b) => {
    const dn = (Number(a.n) || 0) - (Number(b.n) || 0);
    return dn !== 0 ? dn : (Number(a.ts) || 0) - (Number(b.ts) || 0);
  });
  return filtered.map((it) => ({
    id: it.id,
    color: (it.color >= 1 && it.color <= 5) ? it.color : 1,
    excerpt: _pbpHlExcerpt(it.quote),
    noteExcerpt: it.note ? _pbpHlExcerpt(it.note) : null,
  }));
}

// ---- Save-answer-as-note text join (H4 spec 2.2, pure/testable): appended
// to an item's note by the DOM-layer pbpHlAttachNote below. A blank note (or
// one that is only whitespace) is replaced outright; a non-empty note gets
// the new answer appended after a blank line, so multiple saved answers read
// as separate paragraphs.
function pbpHlAppendNoteText(existing, answer) {
  const e = typeof existing === "string" ? existing : "";
  const a = typeof answer === "string" ? answer : "";
  return e.trim() ? e + "\n\n" + a : a;
}

// ============================================================
// DOM / UI layer. Lazily mounted: pbpHlInit runs on "pbp:rendered"
// (same pattern as pbpTrInit / pbpAskInit).
// ============================================================

// ---- Storage (storage.local only; highlights are permanent user data,
// never routed through ai-cache.js's LRU/TTL cache) ----
function _pbpHlKey(url) {
  return "pbp_hl_" + pbpAiHash(String(url || ""));
}

// Degrades to [] on any storage failure or when chrome.storage is absent
// (file:// tests) -- spec 6: a storage read failure silently disables
// highlighting for this page instead of crashing.
async function _pbpHlLoad(url) {
  if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) return [];
  try {
    const key = _pbpHlKey(url);
    const d = await chrome.storage.local.get(key);
    const rec = d && d[key];
    if (!rec || typeof rec !== "object" || !Array.isArray(rec.items)) return [];
    return rec.items;
  } catch (_) { return []; }
}

// Single-key read-modify-write: caller passes the FULL current items array.
// Deletes the key outright when items is empty (spec 2: deleting down to
// zero items removes the whole key, no empty-shell leftover). On write
// failure, toasts via btn if given, else the #copy-status live region;
// never throws.
async function _pbpHlSave(url, items, btn) {
  if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) return false;
  const key = _pbpHlKey(url);
  try {
    if (!items.length) { await chrome.storage.local.remove(key); return true; }
    // url/title ride the record because the key is a one-way hash of the url:
    // without them an aggregate "all pages with notes" view cannot name the
    // page. Records saved before this field existed self-heal on next save.
    const title = (_pbpHlState && _pbpHlState.title) || "";
    await chrome.storage.local.set({ [key]: { v: 1, url: String(url || ""), title, items } });
    return true;
  } catch (_) {
    _pbpHlToast(t("hlSaveFailed"), btn);
    return false;
  }
}

let _pbpHlWriteQueue = Promise.resolve();

function _pbpHlQueueWrite(fn) {
  const run = _pbpHlWriteQueue.catch(() => {}).then(fn);
  _pbpHlWriteQueue = run.catch(() => {});
  return run;
}

async function _pbpHlLastColorGet() {
  if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) return 1;
  try {
    const d = await chrome.storage.local.get({ pbp_hl_last_color: 1 });
    const c = Number(d.pbp_hl_last_color);
    return (c >= 1 && c <= 5) ? c : 1;
  } catch (_) { return 1; }
}

async function _pbpHlLastColorSet(color) {
  if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) return;
  try { await chrome.storage.local.set({ pbp_hl_last_color: Number(color) || 1 }); } catch (_) {}
}

// Write-failure toast (spec 6: a save failure must toast, not fail silently
// -- reuse the existing feedback mechanism). When a button is available
// (bar color dot / note button), reuse
// flashButtonLabel (md-preview.js:989) exactly like send/X2 do. The
// keyboard-triggered creation path (H/1-5, no button in view) has no btn to
// flash, so it falls back to the SAME #copy-status aria-live node
// copyToClipboard's announce() already uses (md-preview.js:967) -- not a
// new mechanism, the page's one buttonless toast channel.
function _pbpHlToast(msg, btn) {
  if (btn && typeof flashButtonLabel === "function") { flashButtonLabel(btn, msg); return; }
  const el = document.getElementById("copy-status");
  if (!el) return;
  el.textContent = msg;
  setTimeout(() => { if (el.textContent === msg) el.textContent = ""; }, 1500);
}

// ---- Init + restore ----
const PBP_HL_COLORS = [1, 2, 3, 4, 5];
// State shape: { url, title, items, ranges: {id -> {color, range}},
// degraded: {id -> true}, resolvedN: {id -> n'}, orphans: {id -> true} }.
// resolvedN/orphans are RUNTIME-ONLY re-anchoring results (anchoring
// round): resolvedN records which block an item actually painted in this
// render (usually item.n; different after global relocation), orphans
// marks orig-side items whose quote could not be found anywhere. Item
// STORAGE never learns about either -- writing a heuristic n' back would
// destroy the original selector on the first mis-anchor (highlights are
// permanent user data, see _pbpHlSave).
let _pbpHlState = null;

// Effective block for an item THIS render: the relocation result when one
// exists, else the stored n. Every DOM consumer (jump/card/rect/observer
// re-anchor) must resolve through this, or the paint lands in the new
// block while clicks chase the old one.
function _pbpHlEffN(item) {
  const r = _pbpHlState && _pbpHlState.resolvedN;
  const id = item && item.id;
  return (r && id && r[id] != null) ? r[id] : (item ? item.n : 0);
}

// Fingerprint of the CURRENT render's block list, from the same frozen
// pbpAiTextOf snapshots used at creation time (never live textContent --
// hljs/KaTeX rewrites would make creation-fp and restore-fp of identical
// content disagree). Computed once per restore pass / per creation batch.
function _pbpHlCurrentFp() {
  try {
    return pbpHlFpOfBlocks(pbpAiBlocks().map((b) => {
      const el = pbpAiBlockEl(b.n);
      return [(el && el.tagName) || "", pbpAiTextOf(b.n)];
    }));
  } catch (_) { return ""; }
}

async function pbpHlInit(detail) {
  const view = document.getElementById("rendered-view");
  if (!view || _pbpHlState) return;
  // D10 guard 2 (never unconditionally re-index): only take the first-index
  // path when there is BOTH no index yet AND no .pb-tr sentinel (meaning
  // translation never ran and never indexed either); otherwise, if the
  // index is still empty after that, bail without mounting rather than
  // touching pbpAiIndexBlocks a second time.
  if (!pbpAiBlocks().length) {
    if (!view.querySelector(".pb-tr")) pbpAiIndexBlocks(view);
    if (!pbpAiBlocks().length) return;
  }
  const url = String((detail && detail.url) || "");
  const title = String((detail && detail.title) || "");
  const items = await _pbpHlLoad(url);
  _pbpHlState = { url, title, items, ranges: Object.create(null), degraded: Object.create(null), resolvedN: Object.create(null), orphans: Object.create(null) };
  pbpHlRestore();
  // Restored-from-storage highlights must surface the rail entry on first
  // paint too -- storage.local.get fires no onChanged, so without this call
  // the rail stays hidden until the session's first mutation (create/delete).
  _pbpHlNotebookRender();
  _pbpHlBindInteractions(view); // Task 4
}

// Build (or rebuild) one item's Range: locate the quote in blockText, map
// the found offsets to a live Range via ask's _pbpAskRangeFromOffsets
// (md-ask.js:697); zero/no match degrades to the whole block (spec 3).
// blockText is passed in by the caller so normal restore (frozen
// pbpAiTextOf cache) and re-anchor (live blockEl.textContent) share this
// one code path with the correct text source for each (spec 3: anchor
// text and mapping text must always come from the same source).
function _pbpHlBuildRange(item, blockEl, blockText) {
  const loc = pbpHlLocate(blockText, item);
  let range = loc ? _pbpAskRangeFromOffsets(blockEl, loc.start, loc.end) : null;
  if (!range) {
    range = document.createRange();
    range.selectNodeContents(blockEl);
    _pbpHlState.degraded[item.id] = true;
  } else {
    delete _pbpHlState.degraded[item.id];
  }
  return range;
}

// M1 hardening (spec sec.3): the locate-text source for a FULL pbpHlRestore
// rebuild pass. A block flagged dataset.pbHlWatched contains pre/math and
// may already have been rewritten by hljs/KaTeX (or may be rewritten
// shortly) -- either way its blockEl.textContent, not the frozen
// pbpAiTextOf(n) snapshot taken before any such rewrite, is the source of
// truth once the flag is set: relocating a quote against the frozen text
// while _pbpAskRangeFromOffsets maps the result onto the LIVE tree can
// mis-anchor or wrongly degrade. Mirrors _pbpHlReanchorBlock's own
// textContent discipline (line 418 in this file) so both rebuild paths
// agree on which text is authoritative for a watched block. Plain
// (non-watched) blocks are byte-for-byte unaffected: they still resolve to
// pbpAiTextOf, exactly as before this change.
function _pbpHlLocateTextFor(blockEl, n) {
  return blockEl.dataset.pbHlWatched ? (blockEl.textContent || "") : pbpAiTextOf(n);
}

// Idempotent full rebuild (spec 3): clears every pbp-hl-* Highlight and
// rebuilds all 5 from _pbpHlState.items. Safe to call more than once (a
// second call just re-clears + re-derives from the same items array).
function pbpHlRestore() {
  if (typeof Highlight !== "function" || typeof CSS === "undefined" || !("highlights" in CSS)) return;
  for (const c of PBP_HL_COLORS) CSS.highlights.delete("pbp-hl-" + c);
  if (!_pbpHlState) return;
  _pbpHlState.ranges = Object.create(null);
  _pbpHlState.degraded = Object.create(null);
  _pbpHlState.resolvedN = Object.create(null);
  _pbpHlState.orphans = Object.create(null);
  // Anchoring round: item.fp (creation-time block fingerprint) picks the
  // orig-side path. fp EQUAL -> content unchanged, trust item.n exactly as
  // before (0-hit still whole-block degrades: only the hljs-rewrite edge
  // can cause it). fp DIFFERENT -> the page drifted; item.n is not
  // trustworthy even when the quote happens to occur there (an unrelated
  // block may have inherited the old n), so go straight to the strict
  // global search. LEGACY (no fp) -> unknown drift: keep the old in-block
  // behavior when it finds the quote (unchanged pages keep painting
  // exactly as before this round), but a miss now falls through to the
  // global search instead of mis-painting a whole possibly-wrong block.
  // Global search failure = orphan (runtime flag; storage untouched,
  // surfaced by the Notebook's count-gated note instead of vanishing).
  const currentFp = _pbpHlCurrentFp();
  let _origBlocks = null; // lazy: most restores never need the global pool
  // Pool text via _pbpHlLocateTextFor, NOT bare pbpAiTextOf: a watched
  // (hljs/KaTeX-rewritten) block's frozen snapshot can yield offsets that
  // are valid against the LIVE tree but point at the wrong characters
  // (Codex acceptance HIGH-2) -- same same-source rule the single-block
  // paths already follow.
  const origBlocks = () => _origBlocks
    || (_origBlocks = pbpAiBlocks().map((b) => {
      const el = pbpAiBlockEl(b.n);
      return { n: b.n, text: el ? _pbpHlLocateTextFor(el, b.n) : "" };
    }));
  const byColor = { 1: [], 2: [], 3: [], 4: [], 5: [] };
  for (const item of _pbpHlState.items) {
    let range = null;
    let effN = item.n;
    const isTr = item.side === "tr";
    if (isTr) {
      // H5 restore (spec 1.3): resolve the .pb-tr sibling; paint gate = it
      // exists AND still displays item.lang. Otherwise the item is
      // Notebook-only (regray + lang badge, Task 2) -- no range, no paint,
      // no error, and NEVER an orphan (an absent/other-language tr layer is
      // "not currently visible", not "lost"). Global relocation deliberately
      // does not apply to the tr side: its blocks are per-render generated
      // text keyed to source blocks, not durable content to re-find.
      const blockEl = document.querySelector('.pb-tr[data-pb-tr="' + item.n + '"]');
      if (!blockEl || !pbpHlItemPaints(item, blockEl.dataset.pbTrLang || "")) continue;
      // _pbpHlBuildRange degrades a 0-hit locate to the whole .pb-tr (spec 1.3).
      range = _pbpHlBuildRange(item, blockEl, blockEl.textContent || "");
    } else {
      const blockEl = pbpAiBlockEl(item.n);
      const fpEqual = typeof item.fp === "string" && item.fp && item.fp === currentFp;
      const legacy = !(typeof item.fp === "string" && item.fp);
      if (blockEl && fpEqual) {
        range = _pbpHlBuildRange(item, blockEl, _pbpHlLocateTextFor(blockEl, item.n));
      } else {
        if (blockEl && legacy) {
          const loc = pbpHlLocate(_pbpHlLocateTextFor(blockEl, item.n), item);
          if (loc) range = _pbpAskRangeFromOffsets(blockEl, loc.start, loc.end);
        }
        if (!range) {
          const g = pbpHlGlobalLocate(origBlocks(), item) || pbpHlGlobalLocateNormalized(origBlocks(), item);
          const gEl = g ? pbpAiBlockEl(g.n) : null;
          if (gEl) {
            effN = g.n;
            range = _pbpAskRangeFromOffsets(gEl, g.start, g.end);
            // Accept only a Range whose actual text IS the quote (compared
            // whitespace-normalized, so normalized-path hits pass too): a
            // rewrite landing between pool build and mapping can produce
            // offsets that are in-bounds yet point at the wrong characters
            // (Codex acceptance HIGH-2's verification half).
            if (range && pbpHlWsNormalize(range.toString()).norm !== pbpHlWsNormalize(item.quote).norm) range = null;
            if (!range) {
              // Confident relocation but the live tree diverged from the
              // frozen snapshot (hljs/KaTeX rewrite in the NEW block):
              // whole-block degrade at the relocated position beats orphaning
              // a hit the strict rules already accepted.
              range = document.createRange();
              range.selectNodeContents(gEl);
              _pbpHlState.degraded[item.id] = true;
            }
          }
        }
        if (!range) {
          _pbpHlState.orphans[item.id] = true;
          continue;
        }
      }
    }
    const col = (item.color >= 1 && item.color <= 5) ? item.color : 1;
    byColor[col].push(range);
    _pbpHlState.ranges[item.id] = { color: col, range };
    _pbpHlState.resolvedN[item.id] = effN;
    // Only original blocks arm the hljs/KaTeX watcher (on the block the item
    // actually painted in); .pb-tr re-anchors via pbpHlReanchorTr (Step 6).
    if (!isTr) _pbpHlArmBlockObserver(pbpAiBlockEl(effN), effN);
  }
  for (const c of PBP_HL_COLORS) {
    if (byColor[c].length) CSS.highlights.set("pbp-hl-" + c, new Highlight(...byColor[c]));
  }
  if (typeof pbpHlSyncMirrorAll === "function") pbpHlSyncMirrorAll(); // H5 (spec 1.5)
}

// hljs/KaTeX rewrite pre/math blocks' text nodes on their own rAF-deferred
// pass; a Range built against pre-rewrite text detaches silently (spec 3).
// One-shot per block: arm a MutationObserver, disconnect on its first
// firing, double-rAF then re-anchor ONLY that block's items (spec 3: rebuild
// just that block's Ranges locally, never a full-page rerun). dataset flag
// guards against re-arming an already-watched block on a later
// pbpHlRestore() call.
function _pbpHlNeedsWatch(blockEl) {
  return !!blockEl.querySelector("pre code, .katex, math");
}

function _pbpHlArmBlockObserver(blockEl, n) {
  if (!_pbpHlNeedsWatch(blockEl) || blockEl.dataset.pbHlWatched) return;
  blockEl.dataset.pbHlWatched = "1";
  const obs = new MutationObserver(() => {
    obs.disconnect();
    requestAnimationFrame(() => requestAnimationFrame(() => _pbpHlReanchorBlock(n)));
  });
  obs.observe(blockEl, { childList: true, subtree: true });
}

function _pbpHlReanchorBlock(n) {
  if (!_pbpHlState || typeof Highlight !== "function" || typeof CSS === "undefined" || !("highlights" in CSS)) return;
  const blockEl = pbpAiBlockEl(n);
  if (!blockEl) return;
  const liveText = blockEl.textContent || ""; // NOT pbpAiTextOf(n): that cache may be frozen pre-hljs/KaTeX (spec 3)
  for (const item of _pbpHlState.items) {
    if (item.side === "tr" || _pbpHlEffN(item) !== n) continue; // effN: a relocated item belongs to the block it PAINTED in
    // An orphan has NO resolvedN, so effN falls back to its stale item.n --
    // which can equal this n when the old block still exists with unrelated
    // content. Without this skip, _pbpHlBuildRange would degrade the orphan
    // to a whole-block paint on that wrong block while the Notebook still
    // says "couldn't be located" (Codex acceptance HIGH-1). Orphan verdicts
    // are only revisited by a full pbpHlRestore, never by this local pass.
    if (_pbpHlState.orphans[item.id]) continue;
    const prev = _pbpHlState.ranges[item.id];
    if (prev) {
      const h = CSS.highlights.get("pbp-hl-" + prev.color);
      if (h) h.delete(prev.range);
    }
    const range = _pbpHlBuildRange(item, blockEl, liveText);
    const col = (item.color >= 1 && item.color <= 5) ? item.color : 1;
    let h = CSS.highlights.get("pbp-hl-" + col);
    if (!h) { h = new Highlight(); CSS.highlights.set("pbp-hl-" + col, h); }
    h.add(range);
    _pbpHlState.ranges[item.id] = { color: col, range };
  }
}

// ---- H5 translated-layer lifecycle (spec 1.3). md-translate.js calls the
// two window hooks below via typeof guards; it never hard-depends on this
// file. All work is wrapped so a highlight failure can never break the
// translation main flow (spec 7.2). ----

// ---- H5 block-level mirror bars (spec 1.5). data-pb-hl-mirror="<1..5>" on
// the paired element; the CSS (md-preview.css) draws a 3px left border in the
// matching --hl-N color, ONLY under body.tr-bilingual / body.tr-only, so the
// original view is pixel-unchanged (spec 1.5 / 3). Cross-side: the .pb-tr
// mirrors the ORIGINAL side's highlights, the original block mirrors the
// TRANSLATED side's paintable highlights. ----
function _pbpHlSetMirror(el, color) {
  if (!el) return;
  if (color >= 1 && color <= 5) el.dataset.pbHlMirror = String(color);
  else if (el.dataset && "pbHlMirror" in el.dataset) delete el.dataset.pbHlMirror;
}

function pbpHlSyncMirror(n) {
  if (!_pbpHlState) return;
  const items = _pbpHlState.items;
  const origEl = pbpAiBlockEl(n);
  const trEl = document.querySelector('.pb-tr[data-pb-tr="' + n + '"]');
  const trLang = trEl ? (trEl.dataset.pbTrLang || "") : "";
  const origColor = pbpHlLatestColorOnSide(items, n, "orig", trLang); // -> shown on the .pb-tr
  const trColor = pbpHlLatestColorOnSide(items, n, "tr", trLang);     // -> shown on the original block
  _pbpHlSetMirror(trEl, origColor);
  _pbpHlSetMirror(origEl, trColor);
}

function pbpHlSyncMirrorAll() {
  if (!_pbpHlState) return;
  const seen = new Set();
  for (const it of _pbpHlState.items) {
    const n = Number(it.n) || 0;
    if (!n || seen.has(n)) continue;
    seen.add(n);
    pbpHlSyncMirror(n);
  }
}

// Incremental re-anchor of block n's translated-side highlights against the
// just-(re)built .pb-tr. Mirrors _pbpHlReanchorBlock but for the tr side:
// resolve the .pb-tr, read the language it now shows, and for each tr item in
// this block delete any stale range then rebuild IFF the paint gate passes.
function _pbpHlReanchorTrBlock(n) {
  if (!_pbpHlState || typeof Highlight !== "function" || typeof CSS === "undefined" || !("highlights" in CSS)) return;
  const trEl = document.querySelector('.pb-tr[data-pb-tr="' + n + '"]');
  const lang = trEl ? (trEl.dataset.pbTrLang || "") : "";
  const liveText = trEl ? (trEl.textContent || "") : "";
  for (const item of _pbpHlState.items) {
    if (item.side !== "tr" || item.n !== n) continue;
    const prev = _pbpHlState.ranges[item.id];
    if (prev) {
      const h = CSS.highlights.get("pbp-hl-" + prev.color);
      if (h) h.delete(prev.range);
      delete _pbpHlState.ranges[item.id];
    }
    if (!trEl || !pbpHlItemPaints(item, lang)) { delete _pbpHlState.degraded[item.id]; delete _pbpHlState.resolvedN[item.id]; continue; }
    const range = _pbpHlBuildRange(item, trEl, liveText);
    const col = (item.color >= 1 && item.color <= 5) ? item.color : 1;
    let h = CSS.highlights.get("pbp-hl-" + col);
    if (!h) { h = new Highlight(); CSS.highlights.set("pbp-hl-" + col, h); }
    h.add(range);
    _pbpHlState.ranges[item.id] = { color: col, range };
    _pbpHlState.resolvedN[item.id] = item.n;
  }
}

// Hook 1 (called at the end of _pbpTrFill, via typeof guard): the .pb-tr for
// block n was just (re)built in the current target language. Re-anchor its
// tr highlights, refresh its mirror bar (Task 2 seam) + the Notebook.
function pbpHlReanchorTr(n) {
  if (!_pbpHlState) return;
  try {
    _pbpHlReanchorTrBlock(n);
    // ponytail: pbpHlSyncMirror/_pbpHlNotebookRender per filled block is
    // O(blocks) across a run; both are cheap DOM writes and only run during
    // active translation. Batch only if a profiler ever flags it.
    if (typeof pbpHlSyncMirror === "function") pbpHlSyncMirror(n);
    _pbpHlNotebookRender();
  } catch (_) {}
}
window.pbpHlReanchorTr = pbpHlReanchorTr; // explicit window attach: md-translate calls it by name.

// Hook 2 (called after _pbpTrApplyTargetLang removes the whole .pb-tr layer,
// via typeof guard): every translated-side range's host element is gone. Drop
// them all from CSS.highlights, clear their degraded flags, regray the
// Notebook, recompute mirrors. Item STORAGE is untouched -- switching back to
// the original language and retranslating revives them through Hook 1.
function pbpHlTrLayerCleared() {
  if (!_pbpHlState) return;
  try {
    const canHl = typeof CSS !== "undefined" && "highlights" in CSS;
    for (const item of _pbpHlState.items) {
      if (item.side !== "tr") continue;
      const prev = _pbpHlState.ranges[item.id];
      if (prev && canHl) {
        const h = CSS.highlights.get("pbp-hl-" + prev.color);
        if (h) h.delete(prev.range);
      }
      delete _pbpHlState.ranges[item.id];
      delete _pbpHlState.degraded[item.id];
      delete _pbpHlState.resolvedN[item.id];
    }
    _pbpHlNotebookRender();
    if (typeof pbpHlSyncMirrorAll === "function") pbpHlSyncMirrorAll();
  } catch (_) {}
}
window.pbpHlTrLayerCleared = pbpHlTrLayerCleared; // explicit window attach: md-translate calls it by name.

// Init hookup: top-level listener registration only (no other side effects;
// the tests page loads this file on file:// and never fires the event) --
// same idiom as md-ask.js:279-283 / md-translate.js:1650-1654.
if (typeof document !== "undefined") {
  document.addEventListener("pbp:rendered", (e) => {
    pbpHlInit((e && e.detail) || {}).catch(() => {});
  }, { once: true });
}

// ---- Range <-> block-text-offset seam (creation side; DOM layer, not the
// pure top section, since it takes live Range/Node arguments). No existing
// "Range -> offsets" helper exists anywhere in the repo (verified: only
// _pbpAskRangeFromOffsets, the opposite direction, exists in md-ask.js) --
// this is the first one, written once here and reused by both the mouseup
// and keyboard creation paths. ----

// A Range boundary's container can be a text node (offset = character
// index) or an element (offset = child index) -- e.g. triple-click / "select
// paragraph" boundaries land on the element. Normalize either shape to a
// concrete {node: TEXT_NODE, offset} pair so the walker below only ever
// compares against text nodes.
function _pbpHlNormalizeBoundary(container, offset) {
  if (container.nodeType === Node.TEXT_NODE) return { node: container, offset };
  const child = container.childNodes[offset];
  if (child) {
    if (child.nodeType === Node.TEXT_NODE) return { node: child, offset: 0 };
    const w = document.createTreeWalker(child, NodeFilter.SHOW_TEXT);
    const t = w.nextNode();
    if (t) return { node: t, offset: 0 };
  }
  // offset points past the last child (or nothing text-bearing under it):
  // fall back to the end of container's last text descendant.
  const w2 = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let last = null, n;
  while ((n = w2.nextNode())) last = n;
  return last ? { node: last, offset: last.nodeValue.length } : { node: container, offset: 0 };
}

// Map a live Range (already known to lie within blockEl) to blockEl's raw
// textContent [start, end) offsets -- the exact inverse of ask's
// _pbpAskRangeFromOffsets (md-ask.js:697), same TreeWalker-accumulation
// technique so the two stay symmetric.
function _pbpHlOffsetsFromRange(blockEl, range) {
  const startB = _pbpHlNormalizeBoundary(range.startContainer, range.startOffset);
  const endB = _pbpHlNormalizeBoundary(range.endContainer, range.endOffset);
  const walker = document.createTreeWalker(blockEl, NodeFilter.SHOW_TEXT);
  let pos = 0, start = null, end = null, node;
  while ((node = walker.nextNode())) {
    const len = node.nodeValue.length;
    if (start === null && node === startB.node) start = pos + startB.offset;
    if (node === endB.node) end = pos + endB.offset;
    pos += len;
  }
  if (start === null || end === null || end <= start) return null;
  return { start, end };
}

// Clip an arbitrary selection Range to blockEl's bounds (native
// Range.compareBoundaryPoints -- no hand-rolled boundary math). Used both to
// test intersection depth and to produce the per-block segment actually
// highlighted; this naturally drops any portion of the selection that falls
// in a non-indexed sibling like .pb-tr (spec 3: a selection spanning
// translated text must anchor only to the original-text block), since
// .pb-tr elements are never part of blockRange to begin with.
function _pbpHlClipRangeToBlock(range, blockEl) {
  const r = range.cloneRange();
  const blockRange = document.createRange();
  blockRange.selectNodeContents(blockEl);
  if (r.compareBoundaryPoints(Range.START_TO_START, blockRange) < 0) {
    r.setStart(blockRange.startContainer, blockRange.startOffset);
  }
  if (r.compareBoundaryPoints(Range.END_TO_END, blockRange) > 0) {
    r.setEnd(blockRange.endContainer, blockRange.endOffset);
  }
  return r;
}

// Split a user selection Range into one clipped segment per intersecting
// indexed (data-pb) block, in document order. Blocks the selection never
// touches, and any portion outside every indexed block (e.g. inside a
// .pb-tr sibling), are simply absent from the result (spec 3).
function _pbpHlSelectionSegments(range) {
  const segments = [];
  for (const b of pbpAiBlocks()) {
    if (!range.intersectsNode(b.el)) continue;
    const seg = _pbpHlClipRangeToBlock(range, b.el);
    if (!seg || seg.collapsed) continue;
    segments.push({ n: b.n, el: b.el, range: seg });
  }
  // H5 (spec 1.2): a selection that touched NO indexed original block may
  // still lie inside one or more translated-side .pb-tr siblings (never part
  // of the block index -- D10). Clip to those ONLY when the original pass
  // produced nothing; a mixed selection spanning both sides stays
  // original-only (spec 1.2 / 9: no cross-side double highlight).
  if (!segments.length) {
    document.querySelectorAll("#rendered-view .pb-tr[data-pb-tr]").forEach((tr) => {
      if (!range.intersectsNode(tr)) return;
      const seg = _pbpHlClipRangeToBlock(range, tr);
      if (!seg || seg.collapsed) return;
      segments.push({ n: Number(tr.dataset.pbTr), el: tr, range: seg, side: "tr" });
    });
  }
  return segments;
}

function _pbpHlNewId() {
  return "h" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ---- Floating creation bar (#pb-hl-bar). Native popover="auto" supplies
// top-layer + Esc + light-dismiss for this transient selection surface.
// explain-pop is manual so it can remain beside the bar while pinned.
// Positioned above the selection via pbpTrPeekPopPos (spec
// 4), horizontally clamped to the viewport the same way #explain-pop is. ----
let _pbpHlBarEl = null;
let _pbpHlBarRange = null;

function _pbpHlEnsureBar() {
  if (_pbpHlBarEl) return _pbpHlBarEl;
  const bar = document.createElement("div");
  bar.id = "pb-hl-bar";
  bar.setAttribute("popover", "auto");
  const names = [t("hlColorQuote"), t("hlColorDefinition"), t("hlColorExample"), t("hlColorDoubt"), t("hlColorTodo")];
  for (let c = 1; c <= 5; c++) {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = "pb-hl-dot pb-hl-dot-" + c;
    dot.dataset.color = String(c);
    dot.title = names[c - 1];
    dot.setAttribute("aria-label", names[c - 1]);
    // Visible digit doubles as the 1-5 shortcut legend and a non-color cue
    // (the five swatches were previously distinguishable by hue alone).
    dot.textContent = String(c);
    dot.setAttribute("aria-keyshortcuts", String(c));
    // Keep the live text selection alive through the click (mousedown on
    // any element normally clears window.getSelection()).
    dot.addEventListener("mousedown", (e) => e.preventDefault());
    dot.addEventListener("click", () => _pbpHlCreateFromSelection(c, dot));
    bar.appendChild(dot);
  }
  const noteBtn = document.createElement("button");
  noteBtn.type = "button";
  noteBtn.className = "pb-hl-note-btn";
  noteBtn.title = t("hlNoteBtn");
  noteBtn.setAttribute("aria-label", t("hlNoteBtn"));
  noteBtn.innerHTML = (typeof PBP_ICONS === "object" && PBP_ICONS && PBP_ICONS.pencil) || "";
  noteBtn.addEventListener("mousedown", (e) => e.preventDefault());
  noteBtn.addEventListener("click", () => _pbpHlCreateWithNote(noteBtn));
  bar.appendChild(noteBtn);
  // Explain entry fused into this bar (was a standalone #explain-pill,
  // md-ask.js): one floating control on selection instead of two. Icon is
  // md-ask.js's PBP_EXPLAIN_PILL_SVG constant -- the same help-circle glyph
  // the old pill used. pbpExplainInvoke (md-ask.js) captures the live
  // selection itself and _pbpExplainOpenPop explicitly closes this bar, so
  // the click handler needs nothing else.
  const explainBtn = document.createElement("button");
  explainBtn.type = "button";
  explainBtn.className = "pb-hl-explain-btn";
  explainBtn.hidden = true;
  explainBtn.title = t("explainSelection");
  explainBtn.setAttribute("aria-label", t("explainSelection"));
  explainBtn.innerHTML = (typeof PBP_EXPLAIN_PILL_SVG === "string" && PBP_EXPLAIN_PILL_SVG) || "";
  explainBtn.addEventListener("mousedown", (e) => e.preventDefault());
  explainBtn.addEventListener("click", () => {
    if (typeof pbpExplainInvoke === "function") pbpExplainInvoke();
  });
  bar.appendChild(explainBtn);
  // Dedicated dictionary entry (real-device feedback): same box/behavior as
  // explainBtn, but jumps the popover straight to the dict tab instead of
  // defaulting to explain. PBP_DICT_BOOK_SVG is md-dict.js's constant.
  const dictBtn = document.createElement("button");
  dictBtn.type = "button";
  dictBtn.className = "pb-hl-dict-btn";
  dictBtn.hidden = true;
  dictBtn.title = t("dictLookupSelection");
  dictBtn.setAttribute("aria-label", t("dictLookupSelection"));
  dictBtn.innerHTML = (typeof PBP_DICT_BOOK_SVG === "string" && PBP_DICT_BOOK_SVG) || "";
  dictBtn.addEventListener("mousedown", (e) => e.preventDefault());
  dictBtn.addEventListener("click", () => {
    if (typeof pbpExplainInvoke === "function") pbpExplainInvoke("dict");
  });
  bar.appendChild(dictBtn);
  // Visibility gate memoized once at bar creation (same accepted pattern as
  // the hl-card AI row, md-highlight.js:1111 -- see _pbpHlEnsureCard):
  // dict P1: the buttons open the dict-capable popover; AI availability no
  // longer gates the surface, only the trigger mode does. "hotkey"/"off"
  // trigger modes still see the bar without these buttons. A trigger-mode
  // change mid-session needs a reopen to update them (same known corner as
  // the card row). dictBtn additionally requires pbpDictRun to exist.
  pbpAiGetSettings().then((s) => {
    if ((s.selectionTrigger || "icon") === "icon") {
      explainBtn.hidden = false;
      dictBtn.hidden = typeof window.pbpDictRun !== "function";
    }
  }).catch(() => {});
  bar.addEventListener("toggle", (e) => { if (e.newState === "closed") _pbpHlBarRange = null; });
  document.body.appendChild(bar);
  _pbpHlBarEl = bar;
  return bar;
}

function _pbpHlShowBar(range) {
  const bar = _pbpHlEnsureBar();
  _pbpHlBarRange = range;
  if (typeof window.pbpExplainDismissIfUnpinned === "function") window.pbpExplainDismissIfUnpinned();
  try { bar.hidePopover(); } catch (_) {} // re-invoke while open: reset first (mirrors _pbpExplainOpenPop)
  bar.showPopover();
  const rect = range.getBoundingClientRect();
  const pos = pbpTrPeekPopPos(rect, bar.offsetHeight, window.innerHeight);
  const bw = bar.offsetWidth;
  const x = Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - bw - 8));
  bar.style.left = x + "px";
  bar.style.top = pos.top + "px";
}

function _pbpHlHideBar() {
  if (_pbpHlBarEl) { try { _pbpHlBarEl.hidePopover(); } catch (_) {} }
}

// ---- Creation ----
// Creates one item per block the range intersects (spec 3: cross-block
// selections). Stores quote/prefix/suffix via the pure pbpHlSelectorOf
// (Task 1), but registers the ALREADY-SELECTED Range directly for immediate
// paint -- no locate round-trip needed for the item that was just created
// from a live selection (spec 4: register the new Range immediately,
// without a full pbpHlRestore rerun).
async function _pbpHlCreateFromRange(range, color, btn) {
  if (!_pbpHlState) return [];
  const segments = _pbpHlSelectionSegments(range);
  const created = [];
  // One fingerprint per creation batch (anchoring round): stamps every item
  // of this multi-block selection with the SAME creation-time block-list
  // identity, so restore can tell "page unchanged, trust n" from "page
  // drifted, re-find the quote globally". Item-level (not record-level):
  // highlights on one page accumulate across visits/page versions, and the
  // record is rewritten whole on every save -- a record-level fp would be
  // overwritten by each new batch and mislabel older items (Codex review).
  const batchFp = _pbpHlCurrentFp();
  for (const seg of segments) {
    const offsets = _pbpHlOffsetsFromRange(seg.el, seg.range);
    if (!offsets) continue;
    // NOT pbpAiTextOf(seg.n): that cache may be frozen pre-hljs/KaTeX and can
    // diverge from the live DOM _pbpHlOffsetsFromRange just walked (same
    // same-source rule _pbpHlReanchorBlock already follows with
    // blockEl.textContent -- see its comment above).
    const blockText = seg.el.textContent || "";
    const sel = pbpHlSelectorOf(blockText, offsets.start, offsets.end);
    const item = {
      id: _pbpHlNewId(),
      n: seg.n,
      quote: sel.quote,
      prefix: sel.prefix,
      suffix: sel.suffix,
      color,
      note: "",
      ts: Date.now(),
      fp: batchFp
    };
    // H5 (spec 1.1): translated-side highlights carry side + the language of
    // the .pb-tr they were drawn in (read straight off the element, so it is
    // exactly the shown language). Original items get NO extra fields --
    // legacy items and orig items stay identical (backward compat / spec 7.1).
    if (seg.side === "tr") {
      item.side = "tr";
      item.lang = (seg.el.dataset && seg.el.dataset.pbTrLang) || "";
    }
    created.push({ item, seg });
  }
  if (!created.length) return [];
  return _pbpHlQueueWrite(async () => {
    if (!_pbpHlState) return [];
    const nextItems = _pbpHlState.items.concat(created.map((x) => x.item));
    const ok = await _pbpHlSave(_pbpHlState.url, nextItems, btn);
    if (!ok) return [];
    _pbpHlState.items = nextItems;
    created.forEach(({ item, seg }) => {
      _pbpHlRegisterRange(item, seg.range.cloneRange());
      // .pb-tr re-anchors via pbpHlReanchorTr (fired from _pbpTrFill), NOT the
      // hljs/KaTeX watcher (which targets pbpAiBlockEl -- the original block).
      if (seg.side !== "tr") _pbpHlArmBlockObserver(seg.el, seg.n);
    });
    await _pbpHlLastColorSet(color);
    for (const { item } of created) pbpHlSyncMirror(item.n); // H5 (spec 1.5)
    _pbpHlNotebookRender();
    // Spec 1.3 trigger 4: the FIRST highlight created this session
    // auto-expands the rail's hl section (session-visual only, via
    // expand(temp) -- never persisted, never overwrites the user's
    // stored collapse preference). A restore from storage (pbpHlInit)
    // does NOT set this flag, only an actual creation does.
    if (!_pbpHlAutoExpandedThisSession) {
      _pbpHlAutoExpandedThisSession = true;
      if (_pbpHlNbEls && _pbpHlNbEls.handle) _pbpHlNbEls.handle.expand(true);
    }
    return created.map((x) => x.item);
  });
}

function _pbpHlRegisterRange(item, range) {
  if (typeof Highlight !== "function" || typeof CSS === "undefined" || !("highlights" in CSS)) return;
  let h = CSS.highlights.get("pbp-hl-" + item.color);
  if (!h) { h = new Highlight(); CSS.highlights.set("pbp-hl-" + item.color, h); }
  h.add(range);
  _pbpHlState.ranges[item.id] = { color: item.color, range };
  _pbpHlState.resolvedN[item.id] = item.n; // fresh creation: painted exactly where recorded
}

async function _pbpHlCreateFromSelection(color, btn) {
  const range = _pbpHlBarRange;
  _pbpHlHideBar();
  if (!range) return;
  await _pbpHlCreateFromRange(range, color, btn);
  const sel = window.getSelection();
  if (sel) sel.removeAllRanges();
}

async function _pbpHlCreateWithNote(btn) {
  const range = _pbpHlBarRange;
  _pbpHlHideBar();
  if (!range) return;
  const color = await _pbpHlLastColorGet();
  const created = await _pbpHlCreateFromRange(range, color, btn);
  const sel = window.getSelection();
  if (sel) sel.removeAllRanges();
  if (created.length && typeof window._pbpHlOpenCard === "function") {
    window._pbpHlOpenCard(created[created.length - 1].id); // Task 5's card (window hook; no-op until Task 5 lands)
  }
}

// ---- Interaction binder: mouseup (show bar) + keydown (H/1-5 hotkeys) +
// scroll/selection-collapse hide. Esc + click-elsewhere dismiss are free
// via the popover's own light-dismiss (no listener needed for those). ----
function _pbpHlOnMouseUp(e) {
  const view = document.getElementById("rendered-view");
  if (!view || !view.contains(e.target)) return;
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) { _pbpHlHideBar(); return; }
  const range = sel.getRangeAt(0);
  const segments = _pbpHlSelectionSegments(range);
  if (!segments.length) { _pbpHlHideBar(); return; }
  _pbpHlShowBar(range);
}

// Same shared modifier/typing/raw-view gate as the t/v/e/d shortcuts:
// explicit e.shiftKey exclusion (not just case-
// sensitive e.key checks) so Caps Lock without Shift ("H", shiftKey=false)
// still fires while Shift+h ("H", shiftKey=true) does not.
function _pbpHlOnKeyDown(e) {
  if (e.key !== "h" && e.key !== "H" && !/^[1-5]$/.test(e.key)) return;
  const ae = document.activeElement;
  if (!pbpTrSingleKeyAllowed(e, ae && ae.tagName, !!(ae && ae.isContentEditable),
    document.body.classList.contains("raw-active"))) return;
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);
  const view = document.getElementById("rendered-view");
  if (!view || !view.contains(range.commonAncestorContainer)) return;
  const segments = _pbpHlSelectionSegments(range);
  if (!segments.length) return;
  e.preventDefault();
  const color = /^[1-5]$/.test(e.key) ? Number(e.key) : null;
  (async () => {
    const c = color || await _pbpHlLastColorGet();
    await _pbpHlCreateFromRange(range, c, null);
    sel.removeAllRanges();
    _pbpHlHideBar();
  })();
}

function _pbpHlBindInteractions(view) {
  view.addEventListener("mouseup", _pbpHlOnMouseUp);
  document.addEventListener("keydown", _pbpHlOnKeyDown);
  window.addEventListener("scroll", () => _pbpHlHideBar(), true);
  document.addEventListener("selectionchange", () => {
    const sel = window.getSelection();
    if ((!sel || sel.isCollapsed) && _pbpHlBarEl && _pbpHlBarEl.matches(":popover-open")) _pbpHlHideBar();
  });
}

// ---- Cross-file accessor (md-preview.js reads this into buildExportOpts() -- Task 6). ----
// Returns a COPY so a caller can't mutate the live store by reference.
function pbpHlCurrentItems() {
  return _pbpHlState ? _pbpHlState.items.slice() : [];
}

// ---- H6 (spec sec.2): cross-file accessor for md-reader.js's note-search
// hook -- the underlying Range lives in _pbpHlState.ranges, never exposed
// directly (md-reader.js must not reach into another file's private state).
function pbpHlRangeOf(id) {
  const e = _pbpHlState && _pbpHlState.ranges[id];
  return (e && e.range) || null;
}

// ---- Click hit-detection -> edit card (spec sec.4 "点已有高亮 → 卡片") ----
document.addEventListener("pbp:rendered", () => {
  const view = document.getElementById("rendered-view");
  if (!view) return;
  view.addEventListener("click", _pbpHlOnClick);
}, { once: true });

function _pbpHlOnClick(e) {
  // A just-finished drag selection reaching here means mouseup already handed off to
  // the floating bar (Task 4) -- don't also open the edit card underneath it.
  const sel = window.getSelection();
  if (sel && !sel.isCollapsed) return;
  if (typeof document.caretRangeFromPoint !== "function") return;
  if (!_pbpHlState) return;
  const caret = document.caretRangeFromPoint(e.clientX, e.clientY);
  if (!caret) return;
  const node = caret.startContainer;
  const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
  // H5 (spec 1.4): a click inside a .pb-tr resolves to that translated block
  // (data-pb-tr); original clicks still match [data-pb] first. The scan below
  // filters registered ranges by containment in this element, so tr ranges
  // (which live inside the .pb-tr) match correctly; tie still keeps newest ts.
  const blockEl = el && (el.closest("[data-pb]") || el.closest("[data-pb-tr]"));
  if (!blockEl) return;

  // Map the caret hit back to an item via the _pbpHlState.ranges[id] registry
  // (Range identity/boundary lookup) -- never via expandos stamped on Range
  // objects (Task 3 keeps no such expandos).
  let best = null; // {id, ts}
  for (const id in _pbpHlState.ranges) {
    const entry = _pbpHlState.ranges[id];
    const r = entry && entry.range;
    if (!r || !blockEl.contains(r.commonAncestorContainer)) continue;
    let hit;
    try { hit = r.isPointInRange(caret.startContainer, caret.startOffset); } catch (_) { hit = false; }
    if (!hit) continue;
    const item = _pbpHlState.items.find((it) => it.id === id);
    const ts = item ? Number(item.ts) || 0 : 0;
    if (!best || ts > best.ts) best = { id, ts };
  }
  if (!best) return;
  _pbpHlOpenCard(best.id);
}

// ---- Save-answer-as-note bridge (H4 spec 2.2): explain/translate answers
// land on a highlight's note through this single entry point. target =
// { itemId } (card entry point, used by Task 3) or { range } (live-selection
// entry point, a frozen cloneRange() snapshot from md-ask.js's
// pbpExplainInvoke). The range path hit-tests the SAME isPointInRange
// primitive _pbpHlOnClick uses just above against every registered Range in
// _pbpHlState.ranges, tie -> newest item.ts. A miss creates a new highlight
// through the one creation path (_pbpHlCreateFromRange, last-used color) and
// the note lands on the LAST item that call created (mirrors
// _pbpHlCreateWithNote's own "open the last created item" choice). Persists
// via _pbpHlSave + _pbpHlNotebookRender only (spec invariant 2). Returns
// false (after a hlSaveFailed toast) when creation fails so the caller's
// button can re-enable itself; _pbpHlSave toasts its own failures.
async function pbpHlAttachNote(target, answerText) {
  if (!_pbpHlState) { _pbpHlToast(t("hlSaveFailed")); return false; }
  const answer = typeof answerText === "string" ? answerText : "";
  let item = null;
  let itemId = "";

  if (target && target.itemId) {
    item = _pbpHlState.items.find((it) => it.id === target.itemId) || null;
    // H4 (Task 3): the card's "save as note" now targets a stored itemId,
    // making a stale-id miss reachable (item deleted between card open and
    // the async round-trip finishing) -- mirror the null-state toast above
    // instead of failing silently.
    if (!item) { _pbpHlToast(t("hlSaveFailed")); return false; }
    itemId = item.id;
  } else if (target && target.range) {
    const range = target.range;
    let best = null; // { ts, item }
    for (const id in _pbpHlState.ranges) {
      const entry = _pbpHlState.ranges[id];
      const r = entry && entry.range;
      if (!r) continue;
      let hit;
      try { hit = r.isPointInRange(range.startContainer, range.startOffset); } catch (_) { hit = false; }
      if (!hit) continue;
      const it = _pbpHlState.items.find((x) => x.id === id);
      const ts = it ? Number(it.ts) || 0 : 0;
      if (!best || ts > best.ts) best = { ts, item: it };
    }
    if (best && best.item) {
      item = best.item;
    } else {
      const color = await _pbpHlLastColorGet();
      // ponytail: _pbpHlCreateFromRange already does its own _pbpHlSave +
      // _pbpHlNotebookRender internally before returning, with the new item's
      // note still "". The append below then triggers a SECOND save + render
      // with the real note. That is one extra storage.local write and a
      // one-frame Notebook flash for this miss-branch only -- harmless, not
      // worth a bespoke non-persisting creation path (would violate the
      // single-creation-path invariant).
      const created = await _pbpHlCreateFromRange(range, color, null);
      if (!created.length) {
        _pbpHlToast(t("hlSaveFailed"));
        return false;
      }
      item = created[created.length - 1];
    }
    itemId = item.id;
  } else {
    return false;
  }

  const openNote = (_pbpHlCardItemId === itemId && _pbpHlCard) ? _pbpHlCard.querySelector(".hl-card-note") : null;
  const cardValueAtStart = openNote ? openNote.value : null;

  return _pbpHlQueueWrite(async () => {
    if (!_pbpHlState) { _pbpHlToast(t("hlSaveFailed")); return false; }
    const current = _pbpHlState.items.find((it) => it.id === itemId);
    if (!current) { _pbpHlToast(t("hlSaveFailed")); return false; }
    const prev = current.note;
    current.note = pbpHlAppendNoteText(current.note, answer);
    const ok = await _pbpHlSave(_pbpHlState.url, _pbpHlState.items, null);
    if (!ok) { current.note = prev; return false; } // roll back the in-memory append so a retry doesn't double-append
    _pbpHlNotebookRender();
    if (_pbpHlCard && _pbpHlCardItemId === current.id) {
      const noteEl = _pbpHlCard.querySelector(".hl-card-note");
      if (noteEl && _pbpHlNoteDirty) {
        noteEl.value = pbpHlAppendNoteText(noteEl.value, answer);
      } else if (noteEl && !_pbpHlNoteDirty && (cardValueAtStart === null || noteEl.value === cardValueAtStart)) {
        noteEl.value = current.note;
        _pbpHlCardBaseNote = current.note || "";
      }
    }
    return true;
  });
}
window.pbpHlAttachNote = pbpHlAttachNote; // explicit window attach: makes the md-ask.js "Save as note" contract self-documenting.

// Read-only: which stored highlight covers this range's start point?
// Returns the newest covering item's id, or "". Used by md-dict.js to
// cross-reference a vocab save with an existing highlight (spec decision #4).
function pbpHlItemIdAtRange(range) {
  if (!_pbpHlState || !range) return "";
  let best = null; // { ts, id }
  for (const id in _pbpHlState.ranges) {
    const entry = _pbpHlState.ranges[id];
    const r = entry && entry.range;
    if (!r) continue;
    let hit;
    try { hit = r.isPointInRange(range.startContainer, range.startOffset); } catch (_) { hit = false; }
    if (!hit) continue;
    const it = _pbpHlState.items.find((x) => x.id === id);
    const ts = it ? Number(it.ts) || 0 : 0;
    if (!best || ts > best.ts) best = { ts, id };
  }
  return best ? best.id : "";
}
window.pbpHlItemIdAtRange = pbpHlItemIdAtRange;

// ---- Edit card (spec sec.4). Native popover="auto": Esc + light-dismiss for
// this transient editor; a pinned manual explain-pop may remain open. ----
const PBP_HL_COLOR_KEYS = ["hlColorQuote", "hlColorDefinition", "hlColorExample", "hlColorDoubt", "hlColorTodo"]; // index 0..4 = color 1..5, fixed order (spec sec.5 slugs)
let _pbpHlCard = null;
let _pbpHlCardItemId = null;
let _pbpHlCardBaseNote = "";

function _pbpHlEnsureCard() {
  if (_pbpHlCard) return _pbpHlCard;
  const card = document.createElement("div");
  card.id = "pb-hl-card";
  card.setAttribute("popover", "auto");

  const quote = document.createElement("blockquote");
  quote.className = "hl-card-quote";
  card.appendChild(quote);

  const degraded = document.createElement("div");
  degraded.className = "hl-card-degraded";
  degraded.hidden = true;
  card.appendChild(degraded);

  const dots = document.createElement("div");
  dots.className = "hl-card-colors";
  dots.setAttribute("role", "group");
  for (let color = 1; color <= 5; color++) {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = "hl-card-dot hl-card-dot-" + color;
    dot.dataset.color = String(color);
    dot.addEventListener("click", () => _pbpHlSwitchColor(color));
    dots.appendChild(dot);
  }
  card.appendChild(dots);

  // ---- H4: AI action row (explain / translate / ask), above the note
  // textarea. Hidden until the async availability check resolves; stays hidden
  // forever when AI is unavailable (spec 2.3: "AI unavailable -> card stays
  // pixel-identical to today" -- `hidden` gives zero layout footprint, same
  // technique .hl-card-degraded above already uses). pbpAiGetSettings() is
  // memoized page-wide, so this settles once no matter how many cards open.
  const aiRow = document.createElement("div");
  aiRow.className = "hl-card-ai";
  aiRow.setAttribute("role", "group");
  aiRow.hidden = true;
  const explainBtn = document.createElement("button");
  explainBtn.type = "button";
  explainBtn.className = "hl-card-ai-explain";
  explainBtn.addEventListener("click", () => _pbpHlCardAiOpen("explain"));
  aiRow.appendChild(explainBtn);
  const translateBtn = document.createElement("button");
  translateBtn.type = "button";
  translateBtn.className = "hl-card-ai-translate";
  translateBtn.addEventListener("click", () => _pbpHlCardAiOpen("translate"));
  aiRow.appendChild(translateBtn);
  const askBtn = document.createElement("button");
  askBtn.type = "button";
  askBtn.className = "hl-card-ai-ask";
  askBtn.addEventListener("click", _pbpHlCardAskCurrent);
  aiRow.appendChild(askBtn);
  card.appendChild(aiRow);
  pbpAiGetSettings().then((s) => { if (pbpAiAvailable(s)) aiRow.hidden = false; }).catch(() => {});

  const note = document.createElement("textarea");
  note.className = "hl-card-note";
  note.dir = "auto";
  note.rows = 3;
  note.addEventListener("blur", _pbpHlCommitNote);
  card.appendChild(note);

  const foot = document.createElement("div");
  foot.className = "hl-card-foot";
  // Delete left, Save right (space-between): this delete has no confirm
  // popover, so physical distance from the commit CTA is the misclick guard.
  const del = document.createElement("button");
  del.type = "button";
  del.className = "hl-card-delete";
  del.addEventListener("click", _pbpHlDeleteCurrent);
  foot.appendChild(del);
  const save = document.createElement("button");
  save.type = "button";
  save.className = "hl-card-save";
  save.addEventListener("click", _pbpHlCommitNote);
  foot.appendChild(save);
  card.appendChild(foot);

  card.addEventListener("toggle", (e) => {
    if (e.newState === "closed") _pbpHlCardItemId = null;
  });
  document.body.appendChild(card);
  _pbpHlCard = card;
  return card;
}

// ---- H4: card AI row handlers (spec 2.3). Rect derivation mirrors
// _pbpHlOpenCard: the registered live Range's rect when this highlight isn't
// degraded, else the host block's rect. Returns null when the block can't be
// found (e.g. a stale item.n after re-extraction) so callers can bail
// silently instead of opening at a garbage position.
function _pbpHlItemRect(item) {
  const blockEl = pbpAiBlockEl(_pbpHlEffN(item)); // effN: relocated items rect against the block they painted in
  if (!blockEl) return null;
  let rect = blockEl.getBoundingClientRect();
  const degraded = !!(_pbpHlState && _pbpHlState.degraded[item.id]);
  if (!degraded) {
    const entry = _pbpHlState && _pbpHlState.ranges[item.id];
    if (entry && entry.range) rect = entry.range.getBoundingClientRect();
  }
  return rect;
}

// Card "Explain"/"Translate" buttons -> window.pbpExplainOpenForItem
// (md-ask.js). No typeof guard needed: md-ask.js loads before md-highlight.js
// and defines it at parse time, not behind any async gate.
function _pbpHlCardAiOpen(action) {
  if (!_pbpHlState || !_pbpHlCardItemId) return;
  const item = _pbpHlState.items.find((it) => it.id === _pbpHlCardItemId);
  if (!item) return;
  if (_pbpHlState.orphans[item.id]) {
    // No trustworthy host block -> no AI context to hand over. Unreachable
    // by construction today (every card entry point already refuses
    // orphans), but a silent dead button is the wrong failure mode if a
    // future path opens the card anyway -- say why (Codex re-review).
    _pbpHlToast(t("hlOrphanUnlocatable"));
    return;
  }
  const rect = _pbpHlItemRect(item);
  if (!rect) return;
  if (_pbpHlCard) { try { _pbpHlCard.hidePopover(); } catch (_) {} } // two auto popovers must not overlap
  // effN, not item.n: md-ask reads the host block AND its neighbors for
  // context -- after relocation the stored n would feed the model an
  // unrelated old paragraph (Codex acceptance MEDIUM).
  window.pbpExplainOpenForItem({
    text: item.quote, n: _pbpHlEffN(item), itemId: item.id, rect, action,
    // Translated-side highlights recorded the language they were made in;
    // the dictionary uses it as selection metadata (original-side stays "").
    lang: item.side === "tr" ? (item.lang || "") : ""
  });
}

// Card "Ask" button -> window.pbpAskOpenPanel directly (typeof-guarded per
// the canonical contract). The row only shows once AI is available, but the
// guard costs one line and keeps this safe even if the ask-panel bootstrap
// failed.
function _pbpHlCardAskCurrent() {
  if (!_pbpHlState || !_pbpHlCardItemId) return;
  const item = _pbpHlState.items.find((it) => it.id === _pbpHlCardItemId);
  if (!item) return;
  if (_pbpHlCard) { try { _pbpHlCard.hidePopover(); } catch (_) {} }
  if (typeof window.pbpAskOpenPanel === "function") {
    window.pbpAskOpenPanel('"' + item.quote + '" ');
  }
}

// Re-applies i18n text to the card's static labels. Called on every open (cheap; the
// card is a singleton so this can't be a first-paint cost).
function _pbpHlApplyCardI18n(card) {
  card.querySelectorAll(".hl-card-dot").forEach((dot) => {
    const label = t(PBP_HL_COLOR_KEYS[Number(dot.dataset.color) - 1]);
    dot.title = label;
    dot.setAttribute("aria-label", label);
  });
  card.querySelector(".hl-card-note").placeholder = t("hlNotePlaceholder");
  card.querySelector(".hl-card-save").textContent = t("hlSave");
  // Icon-only controls (icon audit P0): delete folds to the shared cross
  // (matching the Notebook list's hl-item-del), and the AI trio wears the
  // same explain/translate/ask icons as the explain-pop. Labels ride
  // title/aria; static PBP_ICONS constants only.
  const _hlIconBtn = (sel, icon, label) => {
    const b = card.querySelector(sel);
    b.innerHTML = icon;
    b.title = label;
    b.setAttribute("aria-label", label);
  };
  _hlIconBtn(".hl-card-delete", PBP_ICONS.cross, t("hlDelete"));
  _hlIconBtn(".hl-card-ai-explain", PBP_ICONS.explain, t("hlCardExplain"));
  _hlIconBtn(".hl-card-ai-translate", PBP_ICONS.translate, t("hlCardTranslate"));
  _hlIconBtn(".hl-card-ai-ask", PBP_ICONS.ask, t("hlCardAsk"));
}

// Single entry point for both the click-hit-detection path (Step 2) and Task 4's
// note-button ("用上次色创建 + 直接打开卡片聚焦 textarea" -- spec sec.4). Re-derives
// position/rect from the item's id every time, so it never depends on the caller
// already having a live Range in hand.
function _pbpHlOpenCard(id) {
  if (!_pbpHlState) return;
  const item = _pbpHlState.items.find((it) => it.id === id);
  if (!item) return;
  // Orphan invariant: the card never opens for an unlocatable item. Its
  // effN falls back to the stale item.n, whose block may still EXIST with
  // unrelated content -- positioning a card there would look anchored while
  // pointing at the wrong text. All entry points (text click: not painted;
  // notebook row: disabled; create flow: never orphan) already agree; this
  // guard makes it a hard invariant rather than an emergent one.
  if (_pbpHlState.orphans[item.id]) return;
  const blockEl = pbpAiBlockEl(_pbpHlEffN(item));
  if (!blockEl) return;

  const degraded = !!_pbpHlState.degraded[item.id];
  let rect = blockEl.getBoundingClientRect();
  if (!degraded) {
    const entry = _pbpHlState.ranges[id];
    if (entry && entry.range) rect = entry.range.getBoundingClientRect();
  }

  const card = _pbpHlEnsureCard();
  _pbpHlApplyCardI18n(card);
  _pbpHlCardItemId = id;
  card.querySelector(".hl-card-quote").textContent = item.quote || ""; // textContent only (spec sec.6)
  card.querySelectorAll(".hl-card-dot").forEach((dot) => {
    const active = Number(dot.dataset.color) === Number(item.color);
    dot.classList.toggle("active", active);
    dot.setAttribute("aria-pressed", String(active));
  });
  const degradedEl = card.querySelector(".hl-card-degraded");
  degradedEl.hidden = !degraded;
  degradedEl.textContent = degraded ? t("hlDegraded") : "";
  const noteEl = card.querySelector(".hl-card-note");
  noteEl.value = item.note || ""; // textContent-equivalent for a form control's value
  _pbpHlCardBaseNote = noteEl.value;
  _pbpHlNoteDirty = false;

  if (typeof window.pbpExplainDismissIfUnpinned === "function") window.pbpExplainDismissIfUnpinned();
  if (!card.matches(":popover-open")) card.showPopover();
  // Position AFTER showPopover so offsetHeight is real (measure-then-place
  // two-step, same as the ask subsystem's #explain-pop pattern).
  card.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - card.offsetWidth - 8)) + "px";
  const pos = pbpTrPeekPopPos(rect, card.offsetHeight, window.innerHeight);
  card.style.top = pos.top + "px";
  noteEl.focus();
  noteEl.setSelectionRange(noteEl.value.length, noteEl.value.length); // caret at end, no accidental select-all
}

window._pbpHlOpenCard = _pbpHlOpenCard; // explicit window attach: makes the "Task 4 calls it directly" contract self-documenting.

// Color switch: mutate + persist + full rebuild (pbpHlRestore is idempotent -- spec
// sec.3 -- so re-running it is the simplest correct way to move this item's Range from
// its old pbp-hl-N Highlight to the new one; no manual .delete()/.add() bookkeeping).
async function _pbpHlSwitchColor(color) {
  const pendingId = _pbpHlCardItemId;
  const card = _pbpHlCard;
  const btn = card && card.querySelector(".hl-card-dot-" + color);
  return _pbpHlQueueWrite(async () => {
    if (!_pbpHlState) return;
    const item = _pbpHlState.items.find((it) => it.id === pendingId);
    if (!item || item.color === color) return;
    const oldColor = item.color;
    item.color = color;
    const ok = await _pbpHlSave(_pbpHlState.url, _pbpHlState.items, btn);
    if (!ok) {
      if (item.color === color) item.color = oldColor;
      if (_pbpHlCardItemId === item.id) _pbpHlOpenCard(item.id);
      return;
    }
    if (typeof pbpHlRestore === "function") pbpHlRestore();
    _pbpHlNotebookRender(); // list dot color + color-filter membership can both change
    // Guard: only reopen/reposition the card onto this item if it's still the one displayed --
    // the user may have closed this card and opened a different highlight's card while the
    // save was in flight (same bug class as the run-start-pill guards in 57642a2).
    if (_pbpHlCardItemId === item.id) _pbpHlOpenCard(item.id); // re-render the card's active dot + re-measure position
  });
}

let _pbpHlNoteDirty = false;
document.addEventListener("input", (e) => {
  if (e.target && e.target.classList && e.target.classList.contains("hl-card-note")) _pbpHlNoteDirty = true;
});

// Blur AND explicit Save button both route here (spec: "note textarea(失焦或保存钮落存储)").
function _pbpHlCommitNote() {
  if (!_pbpHlNoteDirty || !_pbpHlCardItemId || !_pbpHlState) return;
  const pendingId = _pbpHlCardItemId;
  const card = _pbpHlCard;
  const noteEl = card && card.querySelector(".hl-card-note");
  if (!noteEl) return;
  const nextNote = noteEl.value;
  const baseNote = _pbpHlCardBaseNote || "";
  const saveBtn = card && card.querySelector(".hl-card-save");
  _pbpHlNoteDirty = false;
  // no pbpHlRestore -- notes never touch the Range/Highlight, but the
  // list's note-excerpt line does need to reflect the edit.
  _pbpHlQueueWrite(async () => {
    if (!_pbpHlState) return false;
    const item = _pbpHlState.items.find((it) => it.id === pendingId);
    if (!item) return false;
    const oldNote = item.note || "";
    let mergedNote = nextNote;
    if (oldNote !== baseNote && oldNote !== nextNote) {
      if (oldNote.startsWith(baseNote)) {
        const suffix = oldNote.slice(baseNote.length);
        if (suffix && !mergedNote.endsWith(suffix)) {
          mergedNote = suffix.charAt(0) === "\n" ? mergedNote + suffix : pbpHlAppendNoteText(mergedNote, suffix);
        }
      } else {
        mergedNote = pbpHlAppendNoteText(mergedNote, oldNote);
      }
    }
    item.note = mergedNote;
    const ok = await _pbpHlSave(_pbpHlState.url, _pbpHlState.items, saveBtn);
    if (!ok) {
      item.note = oldNote;
      _pbpHlNoteDirty = true;
      const currentNote = _pbpHlCard && _pbpHlCard.querySelector(".hl-card-note");
      if (_pbpHlCardItemId === item.id && currentNote && currentNote.value === nextNote) _pbpHlOpenCard(item.id);
      return false;
    }
    _pbpHlNotebookRender();
    if (_pbpHlCardItemId === item.id) _pbpHlCardBaseNote = item.note || "";
    return true;
  });
}

// Shared delete core (spec 2.1: the list's x button and the card's delete
// button MUST be the same code path). State cleanup (splice + persist +
// re-derive Ranges + re-render the notebook) runs unconditionally; only
// the UI action of hiding the CARD is guarded, because the user may have
// opened a DIFFERENT highlight's card while this delete's save was in
// flight, and that card must stay open (same bug class as the
// run-start-pill guards in 57642a2).
function _pbpHlDeleteItem(id, btn) {
  return _pbpHlQueueWrite(async () => {
    if (!_pbpHlState) return false;
    const idx = _pbpHlState.items.findIndex((it) => it.id === id);
    if (idx === -1) return false;
    const removed = _pbpHlState.items[idx];
    const removedN = Number(removed.n) || 0;
    const nextItems = _pbpHlState.items.slice(0, idx).concat(_pbpHlState.items.slice(idx + 1));
    const ok = await _pbpHlSave(_pbpHlState.url, nextItems, btn);
    if (!ok) return false;
    _pbpHlState.items = nextItems;
    if (removedN && typeof pbpHlSyncMirror === "function") pbpHlSyncMirror(removedN); // H5 (spec 1.5)
    if (typeof pbpHlRestore === "function") pbpHlRestore();
    _pbpHlNotebookRender();
    if (_pbpHlCard && _pbpHlCardItemId === id) _pbpHlCard.hidePopover();
    return true;
  });
}

function _pbpHlDeleteCurrent() {
  if (!_pbpHlState || !_pbpHlCardItemId) return;
  // Confirm before the only destructive action in the reader (highlight +
  // note, no undo) -- the same anchored popover every other surface uses.
  // shared.js promotes it into the top layer above this [popover] card.
  const btn = _pbpHlCard.querySelector(".hl-card-delete");
  const id = _pbpHlCardItemId;
  showConfirmPopover(btn, {
    msg: t("hlDeleteConfirm"),
    yesText: t("hlDelete"),
    noText: t("cancel"),
    onConfirm: () => _pbpHlDeleteItem(id, btn),
  });
}

// ---- Notebook list: collapsible "Highlights (N)" section (spec 2). N is
// ALWAYS the total item count, never the color-filtered count (spec 2.2:
// the badge must not read as "how many are showing"). Rebuilds on every
// mutation path (create/switch-color/commit-note/delete, all above) plus
// chrome.storage.onChanged below (cross-window fallback). Renamed from the
// old count-only _pbpHlUpdateRailCount; verified (grep, see plan) that its
// only 3 call sites are init/delete/onChanged, all in this file -- renamed
// directly below rather than keeping a now-pointless alias.
let _pbpHlColorFilter = new Set(PBP_HL_COLORS); // session-only, default all-on (spec 2.2 -- never persisted)
let _pbpHlNbEls = null; // {sec, list, filterBtns, emptyHint, copyBtn, handle} -- built once
let _pbpHlAutoExpandedThisSession = false; // spec 1.3 trigger 4 guard

function _pbpHlNotebookRender() {
  const rail = document.getElementById("rail");
  if (!rail) return;
  if (!_pbpHlNbEls) _pbpHlNbEls = _pbpHlBuildNotebookDom(rail);
  const items = _pbpHlState ? _pbpHlState.items : [];
  _pbpHlNbEls.sec.hidden = items.length === 0; // 0 total -> whole section hidden (unchanged from before)
  // Header count badge is TOTAL and always live. pbpRailCollapsible (Task 1)
  // reads opts.count ONCE at build to seed the .rail-sec-count span; keeping
  // it in sync on every mutation is this render's job (spec 2.3: render =
  // count + list), mirroring md-translate.js writing #tr-section
  // .rail-sec-progress by selector rather than relying on the engine to re-poll.
  const countEl = _pbpHlNbEls.sec.querySelector(".rail-sec-count");
  if (countEl) countEl.textContent = "(" + items.length + ")";
  _pbpHlNbEls.filterBtns.forEach((b) => {
    const on = _pbpHlColorFilter.has(Number(b.dataset.color));
    b.setAttribute("aria-pressed", String(on));
    b.classList.toggle("off", !on);
  });
  const model = pbpHlNotebookModel(items, _pbpHlColorFilter);
  _pbpHlNbEls.list.replaceChildren(...model.map(_pbpHlBuildItemEl));
  _pbpHlNbEls.emptyHint.hidden = !(items.length > 0 && model.length === 0);
  // Orphan note (anchoring round): count-gated like Hypothesis's Orphans
  // tab -- present exactly while orphans exist, gone when healthy, never a
  // dismissible one-shot banner. TOTAL orphan count, independent of the
  // color filter (the filter narrows the list, not the fact that notes
  // failed to place).
  const orphanCount = _pbpHlState ? Object.keys(_pbpHlState.orphans || {}).length : 0;
  _pbpHlNbEls.orphanNote.hidden = orphanCount === 0;
  _pbpHlNbEls.orphanNote.textContent = orphanCount ? t("hlOrphanNote", String(orphanCount)) : "";
}

// One-time DOM build: filter row + list + empty-filter hint + copy footer,
// then installs the collapsible header via pbpRailCollapsible (Task 1,
// md-preview.js). Same insertion point as before (immediately before #toc, or
// appended to #rail if #toc is absent).
function _pbpHlBuildNotebookDom(rail) {
  const sec = document.createElement("div");
  sec.className = "rail-section";
  sec.id = "hl-rail-section";
  sec.hidden = true;

  const filterRow = document.createElement("div");
  filterRow.className = "hl-filter-row";
  filterRow.setAttribute("role", "group");
  filterRow.setAttribute("aria-label", t("hlFilterGroupAria"));
  const filterBtns = PBP_HL_COLORS.map((c) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "hl-filter-dot hl-filter-dot-" + c;
    b.dataset.color = String(c);
    const label = t(PBP_HL_COLOR_KEYS[c - 1]);
    b.title = label;
    b.setAttribute("aria-label", label);
    b.setAttribute("aria-pressed", "true");
    b.addEventListener("click", () => {
      if (_pbpHlColorFilter.has(c)) _pbpHlColorFilter.delete(c); else _pbpHlColorFilter.add(c);
      _pbpHlNotebookRender();
    });
    filterRow.appendChild(b);
    return b;
  });
  sec.appendChild(filterRow);

  const orphanNote = document.createElement("p");
  orphanNote.className = "hl-orphan-note";
  orphanNote.hidden = true;
  sec.appendChild(orphanNote);

  const list = document.createElement("ul");
  list.className = "hl-list";
  list.id = "hl-list";
  sec.appendChild(list);

  const emptyHint = document.createElement("p");
  emptyHint.className = "hl-filter-empty";
  emptyHint.textContent = t("hlFilterEmpty");
  emptyHint.hidden = true;
  sec.appendChild(emptyHint);

  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.id = "hl-rail-copy";
  copyBtn.className = "action-btn hl-rail-btn";
  const lab = document.createElement("span");
  lab.className = "btn-label";
  lab.textContent = t("hlCopyMd");
  copyBtn.appendChild(lab);
  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(pbpHlComposeSection(_pbpHlState ? _pbpHlState.items : []));
      flashButtonLabel(copyBtn, t("hlCopied"));
    } catch (_) {
      flashButtonLabel(copyBtn, t("mdPreviewFailed"));
    }
  });
  sec.appendChild(copyBtn);

  const toc = document.getElementById("toc");
  if (toc) toc.insertAdjacentElement("beforebegin", sec);
  else rail.appendChild(sec);

  const handle = (typeof pbpRailCollapsible === "function")
    ? pbpRailCollapsible(sec, "hl", {
        label: t("hlSectionTitle"),
        count: () => "(" + (_pbpHlState ? _pbpHlState.items.length : 0) + ")",
        defaultCollapsed: false,
      })
    : null; // degrade: no collapsible header (file:// test harness has no #rail at all, never reaches here)

  // Opener into the standalone library page's Notes view. Lives inside
  // .rail-sec-head itself -- that header is a flex row spanning the full
  // section width (pbpRailCollapsible), so a child appended after
  // .rail-sec-count paints inline in the same row, matching the neighboring
  // rail icon buttons. Because the header row IS the accordion-toggle
  // <button>, a click here must stopPropagation or it would also
  // collapse/expand the section.
  const headBtn = sec.querySelector(".rail-sec-head");
  if (headBtn) {
    const openLib = document.createElement("button");
    openLib.type = "button";
    openLib.className = "rail-sec-open";
    openLib.innerHTML = (typeof PBP_ICONS === "object" && PBP_ICONS && PBP_ICONS.book) || "";
    openLib.title = t("libraryOpen");
    openLib.setAttribute("aria-label", t("libraryOpen"));
    openLib.addEventListener("click", (e) => {
      e.stopPropagation(); // header row toggles the accordion; the opener must not
      try { window.open(chrome.runtime.getURL("library.html#notes")); } catch (_) {}
    });
    headBtn.appendChild(openLib);
  }

  return { sec, list, filterBtns, emptyHint, copyBtn, handle, orphanNote };
}

// One <li> per notebook entry (spec 2.1). textContent/title only for all
// user text -- zero innerHTML for user data, same rule as the edit card.
function _pbpHlBuildItemEl(m) {
  const full = _pbpHlState.items.find((it) => it.id === m.id);
  const orphan = !!(full && _pbpHlState.orphans && _pbpHlState.orphans[full.id]);
  const blockEl = full ? pbpAiBlockEl(_pbpHlEffN(full)) : null; // effN: a relocated item's row must jump to where it painted
  // tr-only escape hatch mirrors md-translate.js's own visibility rule
  // (body.tr-only + [data-pb-tr-done] hides the original unless .pb-show-orig
  // is toggled on -- md-preview.css:1045). Dim, don't disable: spec 2.3
  // wants a silent no-op at click time (checked again in _pbpHlNotebookJump),
  // not a permanently-disabled control, since this view state can change
  // within the same page load.
  const isTr = !!full && full.side === "tr";
  const painted = !!(_pbpHlState.ranges && _pbpHlState.ranges[m.id]);
  const trVisible = document.body.classList.contains("tr-bilingual") || document.body.classList.contains("tr-only");
  const dimmed = isTr
    ? !(painted && trVisible)
    : (!!blockEl && document.body.classList.contains("tr-only")
        && blockEl.hasAttribute("data-pb-tr-done") && !blockEl.classList.contains("pb-show-orig"));

  const li = document.createElement("li");
  // Orphan (quote unlocatable in the current content) is visually distinct
  // from dim (temporarily hidden by the translation view): dashed edge +
  // muted, note text still fully readable -- the data outlives the anchor.
  li.className = "hl-item" + (dimmed ? " hl-item-dim" : "") + (orphan ? " hl-item-orphan" : "");

  const main = document.createElement("button");
  main.type = "button";
  main.className = "hl-item-main";
  const dot = document.createElement("span");
  dot.className = "hl-item-dot hl-item-dot-" + m.color;
  dot.setAttribute("aria-hidden", "true");
  main.appendChild(dot);
  const q = document.createElement("span");
  q.className = "hl-item-quote";
  q.textContent = m.excerpt;
  main.appendChild(q);
  if (isTr) {
    const badge = document.createElement("span");
    badge.className = "hl-item-lang";
    badge.textContent = full.lang || "";
    badge.setAttribute("aria-label", t("hlTrBadgeAria", full.lang || ""));
    main.appendChild(badge);
  }
  main.title = full ? full.quote : m.excerpt;
  if (!blockEl || orphan) {
    // Block gone OR quote unlocatable (orphan): both are permanent for this
    // render. An orphan's stored n may still name an EXISTING block that now
    // holds unrelated content -- jumping there would flash the wrong text,
    // so the row disables rather than mislead.
    main.disabled = true;
  } else {
    main.addEventListener("click", () => _pbpHlNotebookJump(full));
  }
  li.appendChild(main);

  const del = document.createElement("button");
  del.type = "button";
  del.className = "hl-item-del";
  const delLabel = t("hlDelete"); // reuse the existing card-delete label, per spec 2.1
  del.title = delLabel;
  del.setAttribute("aria-label", delLabel);
  del.innerHTML = (typeof PBP_ICONS === "object" && PBP_ICONS && PBP_ICONS.cross) || "";
  del.addEventListener("click", () => showConfirmPopover(del, {
    msg: t("hlDeleteConfirm"),
    yesText: t("hlDelete"),
    noText: t("cancel"),
    onConfirm: () => _pbpHlDeleteItem(m.id, del),
  }));
  li.appendChild(del);

  if (m.noteExcerpt) {
    const note = document.createElement("div");
    note.className = "hl-item-note";
    note.textContent = m.noteExcerpt;
    li.appendChild(note);
  }
  return li;
}

// Item click: scroll + flash the source block, reusing ask's citation-jump
// flash verbatim (md-ask.js:730 _pbpAskFlash) -- no independent/third flash
// mechanism (spec 2.1). Re-checks tr-only visibility at click time (not just
// at last render) so a stale dim-class never causes an incorrect jump.
function _pbpHlNotebookJump(item) {
  if (item && item.side === "tr") {
    const trEl = document.querySelector('.pb-tr[data-pb-tr="' + item.n + '"]');
    if (!trEl) return;
    // .pb-tr is display:none in the pure original view -> silent no-op (spec 1.4).
    if (!document.body.classList.contains("tr-bilingual") && !document.body.classList.contains("tr-only")) return;
    pbpFocusArticleTarget(trEl);
    pbpScrollIntoView(trEl, { block: "center", behavior: "smooth" });
    const entry = _pbpHlState.ranges[item.id];
    const range = (entry && entry.range) || (() => { const r = document.createRange(); r.selectNode(trEl); return r; })();
    _pbpAskFlash(range, trEl);
    return;
  }
  const blockEl = pbpAiBlockEl(_pbpHlEffN(item)); // effN: jump to where the highlight actually painted
  if (!blockEl) return;
  if (document.body.classList.contains("tr-only") && blockEl.hasAttribute("data-pb-tr-done") && !blockEl.classList.contains("pb-show-orig")) return; // spec 2.3: silent no-op
  pbpFocusArticleTarget(blockEl);
  pbpScrollIntoView(blockEl, { block: "center", behavior: "smooth" });
  const entry = _pbpHlState.ranges[item.id];
  const range = (entry && entry.range) || (() => { const r = document.createRange(); r.selectNode(blockEl); return r; })();
  _pbpAskFlash(range, blockEl);
}

// Reactive trigger: fires on ANY write to this page's pbp_hl_<urlKey> key, regardless of
// which code path performed it. _pbpHlState.items is always current by the time any write
// lands (every mutator updates it in place BEFORE persisting), so this never reloads from
// the change record (storage doesn't carry the transient `degraded` flag).
if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !_pbpHlState) return;
    if (!(_pbpHlKey(_pbpHlState.url) in changes)) return;
    _pbpHlNotebookRender();
  });
}

// H5 (spec 1.4 / 1.5): the Notebook dim state of tr rows and the mirror bars
// both depend on the current translation view (tr-bilingual / tr-only), which
// md-translate toggles as a body class (V key, mode buttons, peek). Re-render
// on any body-class mutation so those stay correct without md-translate
// calling us. Cheap: replaceChildren + attribute writes; class mutations are
// rare (view toggle, rail open, raw toggle). ponytail: not filtered to the
// tr-* classes specifically -- the extra renders are harmless; narrow only if
// ever profiled.
if (typeof MutationObserver === "function" && typeof document !== "undefined") {
  const startBodyObs = () => {
    if (!document.body) return;
    new MutationObserver(() => {
      if (!_pbpHlState) return;
      _pbpHlNotebookRender();
      pbpHlSyncMirrorAll();
    }).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  };
  if (document.body) startBodyObs();
  else document.addEventListener("DOMContentLoaded", startBodyObs, { once: true });
}
