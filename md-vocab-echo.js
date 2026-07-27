// ============================================================
// Pinboard Bookmark Enhanced - md-vocab-echo.js
// Vocab echo: dotted-underline saved vocabulary words in the reader via the
// CSS Custom Highlight API (zero DOM mutation), click opens the dictionary
// view. Pointer enhancement only -- the keyboard-reachable path stays
// "select text -> explain popover"; the underline is not presented as a
// full accessible control. Controlled by dictEchoEnabled (default on).
// Pure helpers above PURE END load in tests/md-dict-tests.html via file://.
// ============================================================

const PBP_ECHO_TERM_LIMIT = 500; // matching keys cap (newest updatedAt first)
const PBP_ECHO_PER_TERM = 20;    // drawn ranges per term
const PBP_ECHO_TOTAL = 500;      // drawn ranges total

// Adjacent letter/number/combining-mark/underscore rejects a word-boundary
// match. \p{M} matters: a combining accent glued to the match edge means the
// visible word continues.
const PBP_ECHO_WORD_ADJ = /[\p{L}\p{N}\p{M}_]/u;
// Scripts written without spaces get plain substring matching instead.
const PBP_ECHO_SUBSTR = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;

function pbpEchoNeedsBoundary(term) {
  return !PBP_ECHO_SUBSTR.test(String(term || ""));
}

// rows (already updatedAt-desc from pbpVocabAll) -> ordered match list.
// Term only -- echoing the lemma would show "unsaved" in the dict view and
// invite duplicate records (spec §1). Longest-first so overlap resolution
// in pbpEchoFindInText is "first claim wins".
function pbpEchoTermSet(rows, cap) {
  const limit = cap || PBP_ECHO_TERM_LIMIT;
  const seen = new Set();
  const out = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r || typeof r.term !== "string") continue;
    const display = r.term.normalize("NFC").trim();
    if (!display) continue;
    const bound = pbpEchoNeedsBoundary(display);
    // Only single LATIN letters are noise ("a", "I"); single chars of other
    // scripts (书 / 단 / я) are legitimate words -- boundary matching keeps
    // their precision (spec §2).
    if (/^\p{Script=Latin}$/u.test(display)) continue;
    let key = display.toLowerCase();
    // Case folding that changes length (Turkish İ) breaks index mapping --
    // degrade that term to exact-case matching instead of guessing offsets.
    if (key.length !== display.length) key = display;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ key, display, bound });
    if (out.length >= limit) break;
  }
  out.sort((a, b) => b.key.length - a.key.length);
  return out;
}

// Code-point-safe index of the code point PRECEDING UTF-16 index i.
function _pbpEchoPrevCpIndex(text, i) {
  const c = text.charCodeAt(i - 1);
  return (c >= 0xdc00 && c <= 0xdfff && i >= 2) ? i - 2 : i - 1;
}

function pbpEchoBoundaryOk(text, start, end) {
  if (start > 0) {
    const cp = text.codePointAt(_pbpEchoPrevCpIndex(text, start));
    if (cp !== undefined && PBP_ECHO_WORD_ADJ.test(String.fromCodePoint(cp))) return false;
  }
  if (end < text.length) {
    const cp = text.codePointAt(end);
    if (cp !== undefined && PBP_ECHO_WORD_ADJ.test(String.fromCodePoint(cp))) return false;
  }
  return true;
}

// One text-node's data -> matches. Case-insensitive via a lowercased copy;
// when folding shifts indices (İ in the node) degrade to exact-case so the
// reported offsets always index the ORIGINAL string. Overlaps: terms arrive
// longest-first, first claim wins. perTermCaps (Map key->remaining budget)
// lives INSIDE the matcher: a term past its budget must not ghost-claim a
// region and block shorter terms from it (Codex plan-review MEDIUM 4).
function pbpEchoFindInText(text, terms, maxHits, perTermCaps) {
  const src = String(text || "");
  const folded = src.toLowerCase();
  const caseOk = folded.length === src.length;
  const hay = caseOk ? folded : src;
  const cap = maxHits == null ? Infinity : maxHits;
  const out = [];
  const taken = [];
  for (const t of terms) {
    if (out.length >= cap) break;
    const termCap = perTermCaps && perTermCaps.has(t.key) ? perTermCaps.get(t.key) : Infinity;
    if (termCap <= 0) continue;
    const needle = caseOk ? t.key : t.display;
    let termHits = 0;
    let from = 0;
    while (out.length < cap && termHits < termCap) {
      const i = hay.indexOf(needle, from);
      if (i === -1) break;
      const e = i + needle.length;
      from = i + 1;
      if (t.bound && !pbpEchoBoundaryOk(src, i, e)) continue;
      if (taken.some(([s, x]) => i < x && e > s)) continue;
      taken.push([i, e]);
      out.push({ start: i, end: e, key: t.key });
      termHits++;
      from = e;
    }
  }
  out.sort((a, b) => a.start - b.start);
  return out;
}

// ---- PURE END ----

// ---- Runtime: scan/registry/generation ----------------------------------
// Everything below is inert outside md-preview (guarded on #rendered-view /
// chrome.*), so the whole file stays loadable from the file:// test page.

let _echoEpoch = 0;
let _echoOwner = "ownerless";
let _echoEnabled = false;
let _echoHl = null;               // the single Highlight instance (priority -1)
let _echoRanges = new Map();      // blockKey -> [{range, key, n}]
let _echoCounts = new Map();      // term key -> drawn count
let _echoTotal = 0;
let _echoTerms = [];
let _echoObserver = null;
let _echoDirty = new Set();
let _echoDebounce = 0;
let _echoIdles = new Set(); // ALL pending idle handles (concurrent scan loops)
let _echoReadSeq = 0;       // guards stale settings reads from clobbering newer state

function _echoView() { return document.getElementById("rendered-view"); }

// Block inventory: original [data-pb] blocks plus each one's .pb-tr sibling.
// Keys "o<n>" / "t<n>". Hidden originals (tr-only view) are scanned anyway:
// unpainted ranges cost nothing and mode switches are class-only mutations
// this module deliberately does not observe.
function _echoBlockKeys() {
  const keys = [];
  for (const b of (typeof pbpAiBlocks === "function" ? pbpAiBlocks() : [])) {
    keys.push("o" + b.n);
    const sib = b.el && b.el.nextElementSibling;
    if (sib && sib.classList && sib.classList.contains("pb-tr")) keys.push("t" + b.n);
  }
  return keys;
}

function _echoKeyEl(key) {
  const n = Number(key.slice(1));
  const el = typeof pbpAiBlockEl === "function" ? pbpAiBlockEl(n) : null;
  if (!el) return null;
  if (key[0] === "o") return el;
  const sib = el.nextElementSibling;
  return (sib && sib.classList && sib.classList.contains("pb-tr")) ? sib : null;
}

function _echoKeyOf(el) {
  if (el.dataset && el.dataset.pb) return "o" + el.dataset.pb;
  if (el.classList && el.classList.contains("pb-tr")) {
    const prev = el.previousElementSibling;
    if (prev && prev.dataset && prev.dataset.pb) return "t" + prev.dataset.pb;
  }
  return null;
}

function _echoDropKey(key) {
  const list = _echoRanges.get(key);
  if (!list) return;
  for (const it of list) {
    if (_echoHl) _echoHl.delete(it.range);
    const c = _echoCounts.get(it.key) || 0;
    if (c > 1) _echoCounts.set(it.key, c - 1); else _echoCounts.delete(it.key);
    _echoTotal--;
  }
  _echoRanges.delete(key);
}

function _echoRequestIdle(step) {
  const id = requestIdleCallback((deadline) => {
    _echoIdles.delete(id);
    step(deadline);
  }, { timeout: 1000 });
  _echoIdles.add(id);
}

function _echoClearAll() {
  for (const id of _echoIdles) cancelIdleCallback(id);
  _echoIdles.clear();
  if (_echoDebounce) { clearTimeout(_echoDebounce); _echoDebounce = 0; }
  _echoDirty.clear();
  _echoRanges.clear();
  _echoCounts.clear();
  _echoTotal = 0;
  try { CSS.highlights.delete("pbp-vocab-echo"); } catch (_) {}
  _echoHl = null;
}

function _echoScanBlock(key) {
  _echoDropKey(key);
  if (_echoTotal >= PBP_ECHO_TOTAL) return;
  const el = _echoKeyEl(key);
  if (!el) return;
  const blockFold = (el.textContent || "").toLowerCase();
  const live = _echoTerms.filter((t) =>
    (_echoCounts.get(t.key) || 0) < PBP_ECHO_PER_TERM && blockFold.includes(t.key.toLowerCase()));
  if (!live.length) return;
  // Registry init BEFORE any counting: if CSS.highlights.set throws we bail
  // with zero side effects -- counts bumped ahead of a failed commit could
  // never be rolled back by _echoDropKey (Codex plan-review LOW 6).
  if (!_echoHl) {
    try {
      const h = new Highlight();
      h.priority = -1; // below user highlights (0) and search layers (1..3)
      CSS.highlights.set("pbp-vocab-echo", h);
      _echoHl = h;
    } catch (_) { return; }
  }
  const n = Number(key.slice(1));
  const found = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const p = node.parentElement;
      return (p && p.closest("pre, code")) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
    }
  });
  let node;
  while ((node = walker.nextNode())) {
    if (_echoTotal >= PBP_ECHO_TOTAL) break;
    const text = node.data;
    if (!text) continue; // NOT length<2: single-char CJK nodes must scan
    const usable = live.filter((t) => (_echoCounts.get(t.key) || 0) < PBP_ECHO_PER_TERM);
    if (!usable.length) break;
    const remaining = new Map(usable.map((t) => [t.key, PBP_ECHO_PER_TERM - (_echoCounts.get(t.key) || 0)]));
    for (const m of pbpEchoFindInText(text, usable, PBP_ECHO_TOTAL - _echoTotal, remaining)) {
      const r = new Range();
      try { r.setStart(node, m.start); r.setEnd(node, m.end); } catch (_) { continue; }
      found.push({ range: r, key: m.key, n });
      _echoCounts.set(m.key, (_echoCounts.get(m.key) || 0) + 1);
      _echoTotal++;
      if (_echoTotal >= PBP_ECHO_TOTAL) break;
    }
  }
  if (!found.length) return;
  for (const it of found) _echoHl.add(it.range);
  _echoRanges.set(key, found);
}

// Idle-sliced scan. Snapshot {epoch, owner, enabled} captured at schedule
// time and revalidated before every slice (spec §3 generation protocol --
// epoch alone is not enough, Codex plan-review BLOCKER).
function _echoScheduleScan(keys) {
  const epoch = _echoEpoch;
  const owner = _echoOwner;
  const enabled = _echoEnabled;
  const valid = () => epoch === _echoEpoch && owner === _echoOwner && enabled && _echoEnabled;
  const queue = [...keys];
  const step = (deadline) => {
    if (!valid()) return;
    let floor = 4; // progress floor even when timeRemaining is stingy
    while (queue.length && (floor-- > 0 || (deadline && deadline.timeRemaining() > 4))) {
      _echoScanBlock(queue.shift());
    }
    if (queue.length) _echoRequestIdle(step);
  };
  _echoRequestIdle(step);
}

async function _echoRestart() {
  const epoch = ++_echoEpoch;
  const owner = _echoOwner;
  _echoClearAll();
  const view = _echoView();
  if (!_echoEnabled || !view) return;
  // Ask/translate init owns the canonical pbpAiIndexBlocks call on
  // pbp:rendered; this mirrors md-ask's lazy backfill for safety.
  if (typeof pbpAiIndexBlocks === "function" && typeof pbpAiBlocks === "function"
      && !pbpAiBlocks().length) pbpAiIndexBlocks(view);
  const rows = await (typeof pbpVocabAll === "function" ? pbpVocabAll(owner).catch(() => []) : []);
  if (epoch !== _echoEpoch || owner !== _echoOwner || !_echoEnabled) return;
  _echoTerms = pbpEchoTermSet(rows);
  if (!_echoTerms.length) return;
  _echoScheduleScan(_echoBlockKeys());
  _echoObserve();
}

// ---- Mutation tracking (dirty blocks, immediate invalidation) -----------
function _echoObserve() {
  const view = _echoView();
  if (!view || _echoObserver) return;
  _echoObserver = new MutationObserver((muts) => {
    if (!_echoEnabled) return;
    let unresolvable = false;
    const mark = (node) => {
      const el = node.nodeType === 1 ? node : node.parentElement;
      const host = el && el.closest ? el.closest("[data-pb], .pb-tr") : null;
      if (host) {
        const key = _echoKeyOf(host);
        if (key) { _echoDirty.add(key); return; }
      }
      unresolvable = true;
    };
    for (const m of muts) {
      if (m.type === "characterData") { mark(m.target); continue; }
      for (const node of m.addedNodes) mark(node);
      for (const node of m.removedNodes) {
        // Detached nodes have lost their siblings; a removed block/.pb-tr
        // can't be keyed reliably -> full rescan.
        if (node.nodeType === 1 && node.matches
            && node.matches("[data-pb], .pb-tr")) unresolvable = true;
        else mark(m.target);
      }
    }
    // Live Ranges in replaced nodes collapse/drift the moment the DOM
    // changes; drop them NOW, rescan after the debounce (spec §3).
    if (unresolvable) {
      // Full dirty = the CURRENT block inventory, not just blocks that had
      // hits before -- after a root-level swap, freshly-matching blocks must
      // scan too (Codex plan-review HIGH 2). Old-range keys are added on top
      // so their stale ranges get dropped immediately below.
      for (const key of _echoBlockKeys()) _echoDirty.add(key);
      for (const key of [..._echoRanges.keys()]) _echoDirty.add(key);
    }
    for (const key of _echoDirty) _echoDropKey(key);
    if (_echoDebounce) clearTimeout(_echoDebounce);
    _echoDebounce = setTimeout(() => {
      _echoDebounce = 0;
      if (!_echoEnabled) return;
      const keys = [..._echoDirty];
      _echoDirty.clear();
      _echoScheduleScan(keys);
    }, 400);
  });
  _echoObserver.observe(view, { childList: true, subtree: true, characterData: true });
}

function _echoDisconnect() {
  if (_echoObserver) { _echoObserver.disconnect(); _echoObserver = null; }
}

// ---- Click (capture phase; yields to real highlights) -------------------
function _echoHitAt(caret) {
  for (const list of _echoRanges.values()) {
    for (const it of list) {
      try {
        if (it.range.collapsed) continue;
        if (it.range.isPointInRange(caret.startContainer, caret.startOffset)) return it;
      } catch (_) {}
    }
  }
  return null;
}

function _echoOnClick(e) {
  if (!_echoEnabled || !_echoTotal) return;
  if (e.target && e.target.closest
      && e.target.closest("a, button, input, select, textarea, [contenteditable]")) return;
  const sel = window.getSelection && window.getSelection();
  if (sel && !sel.isCollapsed) return; // drag-selection belongs to the highlight bar
  if (typeof document.caretRangeFromPoint !== "function") return;
  const caret = document.caretRangeFromPoint(e.clientX, e.clientY);
  if (!caret) return;
  try {
    if (typeof window.pbpHlItemIdAtRange === "function"
        && window.pbpHlItemIdAtRange(caret)) return; // real highlight wins
  } catch (_) {}
  const hit = _echoHitAt(caret);
  if (!hit || typeof window.pbpExplainOpenForItem !== "function") return;
  e.preventDefault();
  e.stopPropagation(); // keep .pb-tr peek handlers out of this click
  window.pbpExplainOpenForItem({
    text: hit.range.toString(),
    n: hit.n,
    range: hit.range.cloneRange(),
    rect: hit.range.getBoundingClientRect(),
    action: "dict"
  });
}

// ---- Wiring -------------------------------------------------------------
async function _echoReadEnabled() {
  const s = await pbpReadSettingsWithSecrets({ dictEchoEnabled: SETTINGS_DEFAULTS.dictEchoEnabled });
  return s.dictEchoEnabled === true;
}

document.addEventListener("pbp:rendered", (e) => {
  const owner = pbpDictOwnerScope(e && e.detail ? e.detail.account : "");
  const readSeq = ++_echoReadSeq;
  // SYNCHRONOUS invalidation before any await: the old owner's idle queue
  // must die NOW, not after the settings read resolves (Codex plan-review
  // BLOCKER). _echoEnabled=false makes every in-flight valid() fail.
  _echoEpoch++;
  _echoEnabled = false;
  _echoClearAll();
  _echoDisconnect();
  _echoOwner = owner;
  const view = _echoView();
  // Re-bind every render, mirroring md-highlight's idiom: addEventListener
  // dedups an identical fn on the same element, and survives the container
  // ever being replaced wholesale.
  if (view) view.addEventListener("click", _echoOnClick, true);
  _echoReadEnabled().then((on) => {
    if (readSeq !== _echoReadSeq || owner !== _echoOwner) return;
    _echoEnabled = on;
    if (on) _echoRestart();
  }).catch(() => {});
});

document.addEventListener("pbp:vocab-changed", (e) => {
  const owner = e && e.detail ? e.detail.owner : "";
  if (!_echoEnabled || owner !== _echoOwner) return;
  _echoRestart();
});

// pbp:vocab-changed only covers saves made in THIS document. A Drive pull
// writes from the service worker, so without this the underlines keep matching
// the term set captured when the preview opened. The service worker only sends
// this when local records actually moved.
if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((message) => {
    if (!message || message.type !== "PBP_VOCAB_SYNCED") return;
    if (!_echoEnabled || message.owner !== _echoOwner) return;
    _echoRestart();
  });
}

if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync" && area !== "local") return;
    if (!(changes.dictEchoEnabled || changes.optSyncEnabled)) return;
    // Re-read the EFFECTIVE value (settings can migrate between areas);
    // never trust a single area's newValue (spec §3). readSeq: a slow read
    // must not clobber the state a newer read/render already set.
    const readSeq = ++_echoReadSeq;
    // Synchronous suspend (mirror the pbp:rendered path): a toggle-off must
    // not leave scans/clicks running while the settings read is in flight;
    // readSeq keeps a slow read from clobbering newer state.
    _echoEpoch++;
    _echoEnabled = false;
    _echoClearAll();
    _echoDisconnect();
    _echoReadEnabled().then((on) => {
      if (readSeq !== _echoReadSeq) return;
      _echoEnabled = on;
      if (on) _echoRestart();
    }).catch(() => {});
  });
}
