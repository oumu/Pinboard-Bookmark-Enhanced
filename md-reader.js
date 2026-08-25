// ============================================================
// Pinboard Bookmark Enhanced - md-preview reading-UX small features:
// footnote popover (R3), in-doc search (R4), and the "?" keyboard-
// shortcuts help popover (spec sec.5). Loaded ONLY by md-preview.html,
// AFTER md-ask.js and md-highlight.js (md-preview.html script tags) --
// the DOM wiring section below calls _pbpAskFlash (md-ask.js) and
// pbpTrPeekPopPos (md-translate.js) directly, every such call typeof-
// guarded so load-order or a partial-load failure in either file
// degrades this file silently rather than throwing (md-highlight.js
// already calls _pbpAskFlash unguarded since it loads strictly after
// md-ask.js -- this file is deliberately more defensive per the batch
// plan). Design: docs/superpowers/specs/
// 2026-07-06-reading-experience-batch-design.md section 3 (R3
// footnotes), section 4 (R4 search), section 5 (keyboard help). These
// three small, independent reading-UX features share this ONE file
// (spec sec.8: these three reading-UX small pieces live together in one
// file, same family) rather than three files, mirroring the
// by-subsystem-not-by-feature file split
// md-ask.js/md-translate.js/md-highlight.js already use. This task
// creates the file with the footnote feature (pbpFnHrefParse +
// _pbpFnInit); later tasks append the search and keyboard-help
// features against the two section markers and the bootstrap block
// below -- do not rename or move them.
// ============================================================

// ---- pure section (no DOM/chrome/fetch; loadable standalone for file://
// tests) ----

// R3 (spec sec.3): parse a footnote-family href into {kind, id} or null.
// Defuddle normalizes every source site's footnote markup into two id-
// bearing shapes -- REF: <sup id="fnref:N"><a href="#fn:N">N</a></sup>,
// DEF backref: <a href="#fnref:N" class="footnote-backref"> (a footnote
// cited more than once appends "-2"/"-3"... to the backref id) -- but
// BOTH the sup's and the li's own id attributes are lost in this app's
// Turndown-then-marked round-trip (spec sec.0 R3: Turndown's default
// <sup>/<li> handling drops non-content attributes; DOMPurify's own
// id-strip hook in md-convert.js would strip them again even if
// Turndown kept them). Only the href VALUES survive (they're plain
// markdown link syntax) -- so this parser is the entire cross-reference
// mechanism: kind "ref" is a body citation link (#fn:N), kind "backref"
// is the return link inside a definition <li> (#fnref:N, occurrence
// suffix stripped since the REF side never carries it -- that
// per-occurrence id is exactly what's lost, so DEF->REF can only ever
// resolve to the base id (spec sec.3: jump to the first occurrence in
// the body, a documented, accepted limitation).
// Anything not matching either shape (including non-string input)
// returns null so a caller can leave native anchor behavior alone.
function pbpFnHrefParse(href) {
  const s = typeof href === "string" ? href : "";
  const backref = /^#fnref:(.+)$/.exec(s);
  if (backref) return { kind: "backref", id: backref[1].replace(/-\d+$/, "") };
  const ref = /^#fn:(.+)$/.exec(s);
  if (ref) return { kind: "ref", id: ref[1] };
  return null;
}

// Reader typography tier maps/sanitizer/apply (PBP_TYPO_FONT_SCALES,
// PBP_TYPO_LEADINGS, pbpTypoSanitize, pbpTypoApplyVars) live in shared.js, NOT
// here: md-preview.js applies the stored tiers BEFORE its first render, and
// this file is a LATER defer script -- defining them here was a real
// load-order race (Codex acceptance). The runtime "Aa" panel below consumes
// them as globals.

// ---- R4: in-document search match enumeration (pure, no DOM) ----
// Case-insensitive, non-overlapping consecutive occurrences of `query`
// inside `text`, capped at `cap` results. Offsets are into `text` as-is
// (toLowerCase() is length-preserving for the overwhelming common case;
// exotic Unicode casefolding that changes length is a known, accepted
// limitation -- same category of simplification the codebase already
// accepts elsewhere, e.g. pbpAiFuzzyFind's ASCII-oriented matching).
function pbpSearchEnumerate(text, query, cap) {
  const out = [];
  if (typeof text !== "string" || typeof query !== "string" || !query.length) return out;
  const limit = (typeof cap === "number" && cap > 0) ? cap : 0;
  if (limit <= 0) return out;
  const hay = text.toLowerCase();
  const needle = query.toLowerCase();
  let from = 0;
  while (out.length < limit) {
    const idx = hay.indexOf(needle, from);
    if (idx === -1) break;
    out.push({ start: idx, end: idx + needle.length });
    from = idx + needle.length;
  }
  return out;
}

// ---- R4 (regex toggle): same enumeration contract as pbpSearchEnumerate,
// but the needle is a user-typed regular expression instead of a literal
// substring. Distinct failure mode: an invalid pattern (new RegExp(pattern,
// "gi") throws) returns null so the caller can tell "bad pattern" apart
// from "valid pattern, zero matches" (empty array); every other input
// guard mirrors pbpSearchEnumerate exactly (non-string text, empty
// pattern, cap<=0 all return []). This runs the user's own pattern against
// their own page -- the same trust boundary an editor's find-in-file regex
// box (VS Code, ...) already accepts, so catastrophic-backtracking risk
// here is accepted the same way, not a model-facing surface.
function pbpSearchEnumerateRegex(text, pattern, cap) {
  const out = [];
  if (typeof text !== "string" || typeof pattern !== "string" || !pattern.length) return out;
  const limit = (typeof cap === "number" && cap > 0) ? cap : 0;
  if (limit <= 0) return out;
  let re;
  try { re = new RegExp(pattern, "gi"); } catch (_) { return null; }
  let m;
  while (out.length < limit && (m = re.exec(text))) {
    if (m[0].length === 0) { re.lastIndex++; continue; } // zero-length match guard: advance, don't push (prevents infinite loop, e.g. "x*")
    out.push({ start: m.index, end: m.index + m[0].length });
  }
  return out;
}

// ---- R9 (spec 2): scroll-restore anchor picker ----
// Pure math only -- the caller (md-preview.js) does the live DOM measuring
// (getBoundingClientRect per block, view-aware via trOnlyScrollTarget) and
// hands the resulting {top, bottom} list in here. rects are VIEWPORT-
// relative (0 = current top of the viewport), the same convention
// getBoundingClientRect() itself uses -- exactly what md-preview.js's own
// pbpScrollMapBlocks "topmost visible block" scan already assumes for its
// `bottom > 0` test, copied here. Returns { n, frac } (n is 1-based,
// matching data-pb / data-pb-tr) or null when there is nothing to anchor to.
function pbpReaderPickScrollAnchor(rects) {
  if (!Array.isArray(rects) || !rects.length) return null;
  let idx = rects.findIndex((r) => r && r.bottom > 0);
  if (idx === -1) idx = rects.length - 1;
  const r = rects[idx];
  if (!r) return null;
  const h = r.bottom - r.top;
  const frac = h > 0 ? Math.min(Math.max(-r.top / h, 0), 1) : 0;
  return { n: idx + 1, frac };
}

// ---- H6 (spec sec.2): note-text search matching, pure ----
// Filters `items` (the pbpHlCurrentItems() shape: array of {id, note, ...})
// down to the ids whose `note` field matches `query`. Literal mode
// (isRegex falsy) = case-insensitive indexOf on item.note, same
// case-folding convention as pbpSearchEnumerate. Regex mode compiles
// `query` as `new RegExp(query, "i")` and .test()s it against the note --
// an invalid pattern returns null, the same "tell bad pattern apart from
// zero matches" contract pbpSearchEnumerateRegex uses (the _pbpSearchRun
// caller never even reaches this path on an invalid pattern -- its own
// compile-once check already short-circuits the whole run before the
// note pass runs; this null return is for direct/unit-test callers and
// defense in depth). An item whose `note` is not a string (missing,
// undefined, non-string) is silently skipped -- it can never be a hit,
// not an error; an item with note === "" is not specially skipped either,
// it simply never matches a non-empty query on its own. Only the `note`
// field is ever inspected -- `quote` is already live in the rendered DOM
// and covered by the existing DOM scan, so matching it here too would
// double-count (spec sec.2). Order is preserved exactly as given in
// `items` (already document order per pbpHlCurrentItems).
function pbpSearchFilterNotes(items, query, isRegex) {
  if (!Array.isArray(items) || typeof query !== "string" || !query.length) return [];
  let re = null;
  if (isRegex) {
    try { re = new RegExp(query, "i"); } catch (_) { return null; }
  }
  const needle = query.toLowerCase();
  const out = [];
  for (const item of items) {
    if (!item || typeof item.note !== "string") continue;
    const hit = re ? re.test(item.note) : item.note.toLowerCase().indexOf(needle) !== -1;
    if (hit) out.push(item.id);
  }
  return out;
}

// ---- DOM wiring ----

// View-mode-aware visibility check for R3 (spec sec.3, reusing R4's exact
// two-selector judgment, spec sec.0 R4): NEVER use offsetParent (it is
// also true for genuinely-visible-but-off-screen content under
// #rendered-view's content-visibility:auto rule, md-preview.css) -- only
// the two known hidden-state selectors count. A .pb-tr sibling is
// display:none unless the view is bilingual/tr-only; an original block
// carrying data-pb-tr-done is display:none in tr-only mode unless its
// per-block .pb-show-orig peek is active (md-translate.js
// _pbpTrPeekToggle).
function _pbpFnIsHidden(el) {
  const trHost = el.closest(".pb-tr");
  if (trHost) {
    const body = document.body;
    return !body.classList.contains("tr-bilingual") && !body.classList.contains("tr-only");
  }
  if (document.body.classList.contains("tr-only")) {
    const orig = el.closest("[data-pb-tr-done]");
    if (orig && !orig.classList.contains("pb-show-orig")) return true;
  }
  return false;
}

// Minimal escaping for embedding an href-derived id inside a quoted
// attribute-selector string (only '"' and '\' can break out of the
// quotes). CSS.escape() is the wrong tool here: it escapes for an
// IDENTIFIER context (colons, leading digits, ...), not a quoted-string
// context, and would corrupt an otherwise-exact id.
function _pbpFnEscAttr(s) {
  return String(s).replace(/["\\]/g, "\\$&");
}

// Ref -> def (spec sec.3): exact href cross-query, never a prefix match
// (N=1 would wrongly match N=10). Bilingual view can have TWO candidate
// <li>s (the original footnotes list plus its .pb-tr translated
// sibling, spec sec.0 R3) -- prefer the first VISIBLE one; if none are
// visible, fall back to the first one found rather than silently doing
// nothing.
function _pbpFnFindDef(id) {
  const sel = 'a[href="#fnref:' + _pbpFnEscAttr(id) + '"]';
  let cands;
  try { cands = document.querySelectorAll(sel); } catch (_) { return null; }
  let first = null;
  for (const a of cands) {
    const li = a.closest("li");
    if (!li) continue;
    if (!first) first = li;
    if (!_pbpFnIsHidden(li)) return li;
  }
  return first;
}

// Backref -> body ref (spec sec.3): same exact-href / prefer-visible
// pattern, symmetric with _pbpFnFindDef.
function _pbpFnFindRef(id) {
  const sel = 'a[href="#fn:' + _pbpFnEscAttr(id) + '"]';
  let cands;
  try { cands = document.querySelectorAll(sel); } catch (_) { return null; }
  let first = null;
  for (const a of cands) {
    if (!first) first = a;
    if (!_pbpFnIsHidden(a)) return a;
  }
  return first;
}

let _pbpFnPop = null;
let _pbpFnCurrentLi = null;

// Manual explain-pop may coexist with another reader popover only while the
// user has pinned it. Every loose popover keeps the previous mutual-exclusion
// behavior and therefore performs a real close (including request abort).
function _pbpReaderKeepPopover(el) {
  return !!(el && el.id === "explain-pop" && typeof window.pbpExplainPopoverPinned === "function"
    && window.pbpExplainPopoverPinned(el));
}

function _pbpReaderHideOtherPopovers(current) {
  document.querySelectorAll(":popover-open").forEach((el) => {
    if (el !== current && !_pbpReaderKeepPopover(el)) {
      try { el.hidePopover(); } catch (_) {}
    }
  });
}

// Re-applied on every open (cheap; the popover is a page-lifetime
// singleton) -- same belt-and-suspenders idiom as _pbpHlApplyCardI18n
// (md-highlight.js).
function _pbpFnApplyPopI18n(pop) {
  pop.setAttribute("aria-label", t("fnPopLabel"));
  const label = pop.querySelector(".fn-pop-jump-label");
  if (label) label.textContent = t("fnPopJump");
}

// Lazily builds the singleton #fn-pop popover (spec sec.3): a scrollable
// clone of the resolved definition <li> plus a "jump to footnote"
// button. Native popover="auto" supplies Esc + light-dismiss; explain-pop is
// manual so it can remain alongside this surface while pinned.
function _pbpFnEnsurePop() {
  if (_pbpFnPop) return _pbpFnPop;
  const pop = document.createElement("div");
  pop.id = "fn-pop";
  pop.setAttribute("popover", "auto");

  const body = document.createElement("div");
  body.className = "fn-pop-body";
  pop.appendChild(body);

  const foot = document.createElement("div");
  foot.className = "fn-pop-foot";
  const jumpBtn = document.createElement("button");
  jumpBtn.type = "button";
  jumpBtn.className = "fn-pop-jump";
  jumpBtn.innerHTML = (typeof PBP_ICONS === "object" && PBP_ICONS && PBP_ICONS.arrowDown) || "";
  const jumpLabel = document.createElement("span");
  jumpLabel.className = "fn-pop-jump-label";
  jumpBtn.appendChild(jumpLabel);
  jumpBtn.addEventListener("click", () => {
    if (!_pbpFnCurrentLi) return;
    try { pop.hidePopover(); } catch (_) {}
    pbpScrollIntoView(_pbpFnCurrentLi, { block: "center", behavior: "smooth" });
    const range = document.createRange();
    range.selectNode(_pbpFnCurrentLi);
    if (typeof _pbpAskFlash === "function") _pbpAskFlash(range, _pbpFnCurrentLi);
  });
  foot.appendChild(jumpBtn);
  pop.appendChild(foot);

  document.body.appendChild(pop);
  _pbpFnPop = pop;
  return pop;
}

// Opens (or repositions, if already open) the singleton popover for a
// resolved definition <li>, anchored to the clicked ref/backref
// element's current rect. anchorEl is only used for positioning;
// content always comes from li, never from anchorEl (spec sec.3).
function _pbpFnOpenPop(li, anchorEl) {
  const pop = _pbpFnEnsurePop();
  _pbpFnApplyPopI18n(pop);
  const body = pop.querySelector(".fn-pop-body");
  const clone = li.cloneNode(true);
  // Strip backref ("return to citation") links from the clone -- they
  // carry no id/class after the Turndown round-trip (spec sec.0 R3), so
  // href-shape is the only way to find them, same as the click parser
  // above.
  clone.querySelectorAll('a[href^="#fnref:"]').forEach((a) => a.remove());
  body.replaceChildren(clone);
  _pbpFnCurrentLi = li;

  // Mutual exclusion: any other open popover must close first (same
  // explicit-hide convention _pbpHlOpenCard/_pbpExplainOpenPop already
  // use).
  _pbpReaderHideOtherPopovers(pop);

  const rect = anchorEl.getBoundingClientRect();
  if (!pop.matches(":popover-open")) pop.showPopover();
  // Measure-then-place two-step, same as _pbpHlOpenCard.
  pop.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - pop.offsetWidth - 8)) + "px";
  const pos = (typeof pbpTrPeekPopPos === "function")
    ? pbpTrPeekPopPos(rect, pop.offsetHeight, window.innerHeight)
    : { top: rect.bottom + 8 };
  pop.style.top = pos.top + "px";
}

function _pbpFnOnRefClick(a, id) {
  const li = _pbpFnFindDef(id);
  if (!li) return; // no definition found -- silent no-op, same as today's dead link (spec sec.3)
  _pbpFnOpenPop(li, a);
}

function _pbpFnOnBackrefClick(id) {
  const a = _pbpFnFindRef(id);
  if (!a) return; // silent no-op, symmetric with the ref direction
  pbpScrollIntoView(a, { block: "center", behavior: "smooth" });
  const range = document.createRange();
  range.selectNode(a);
  if (typeof _pbpAskFlash === "function") _pbpAskFlash(range, a);
}

// Delegated #rendered-view click handler (spec sec.3): intercepts
// footnote ref/backref anchors by href SHAPE, not by id (Defuddle's ids
// never survive the Turndown round-trip) -- pbpFnHrefParse is the
// single source of truth for what counts as a footnote link. A native
// <a> is already focusable and Enter already fires a "click" event, so
// this one listener covers keyboard activation for free.
function _pbpFnOnClick(e) {
  const a = e.target.closest("a[href]");
  if (!a) return;
  const parsed = pbpFnHrefParse(a.getAttribute("href") || "");
  if (!parsed) return; // not a footnote link -- leave native behavior alone
  e.preventDefault();
  if (parsed.kind === "ref") _pbpFnOnRefClick(a, parsed.id);
  else _pbpFnOnBackrefClick(parsed.id);
}

// Idempotent: binds the delegated listener once per #rendered-view
// element (a dataset flag guards a second call, mirroring pbpHlInit's
// own _pbpHlState-presence guard).
function _pbpFnInit() {
  const view = document.getElementById("rendered-view");
  if (!view || view.dataset.pbpFnBound) return;
  view.dataset.pbpFnBound = "1";
  view.addEventListener("click", _pbpFnOnClick);
}

// ---- R4: in-document search ("/" hotkey, #search-pop) ----
// Bare "/" opens a floating top-center search bar scoped to the RENDERED
// view only (raw view keeps native Ctrl+F, spec sec.4). Candidates are
// #rendered-view's direct children, filtered by the two known view-mode
// hidden-selectors (never offsetParent -- content-visibility:auto makes
// off-screen-but-visible content report offsetParent===null too, see
// recon R4 risk 3). Matches paint via two CSS Custom Highlight names with
// EXPLICIT .priority (search=1, current=2) so overlap with user
// highlights (pbp-hl-*, default priority 0) and the jump flash
// (pbp-flash, priority 3 as of this task's one-line md-ask.js touch) is a
// defined contract, not the previous implicit Map-insertion-order
// tie-break. Per the CSS Custom Highlight spec only ONE background wins
// per overlapping text run (no compositing) -- the priority order above
// is the best achievable "both stay discernible" outcome: the
// NON-overlapping portion of each highlight keeps its own color, only
// the exact overlap switches to the higher-priority tint.
const PBP_SEARCH_PREV_SVG = typeof PBP_ICONS !== "undefined" ? PBP_ICONS.arrowUp : "";
const PBP_SEARCH_NEXT_SVG = typeof PBP_ICONS !== "undefined" ? PBP_ICONS.arrowDown : "";

let _pbpSearchInited = false;
let _pbpSearchPopEl = null;
let _pbpSearchState = { query: "", matches: [], ranges: [], idx: -1 };
let _pbpSearchInputTimer = null;
let _pbpSearchMo = null;
let _pbpSearchMoTimer = null;
// Regex-mode toggle: persisted in chrome.storage.local (pbp_srch_regex),
// read once when the popover is first built (see _pbpSearchEnsurePop).
let _pbpSearchRegexOn = false;

// Candidate containers: #rendered-view's DIRECT children only (matches
// spec sec.4 -- cross-top-level-block matches are out of scope), filtered
// by the two known view-mode hidden-selectors (md-preview.css): a .pb-tr
// sibling is hidden unless a translation view is active; an original
// block carrying data-pb-tr-done is hidden in tr-only mode unless peeked
// open via .pb-show-orig.
function _pbpSearchVisibleCandidates(view) {
  const bilingual = document.body.classList.contains("tr-bilingual");
  const trOnly = document.body.classList.contains("tr-only");
  const out = [];
  // (research T2.1) Video pages: when the timeline is the visible study
  // view (#rendered-view hidden by md-video.js's setStudyView), search the
  // caption rows instead of the hidden article -- counting matches painted
  // into display:none was the "ghost 1/12" the audit found. Each row's
  // text span is a candidate; stepping scrolls to the row, whose own click
  // seeks the player. The open description joins in either view.
  const list = document.querySelector(".pbv-col-study .pbv-list");
  if (view.hidden && list && !list.hidden) {
    // The VISIBLE side of each row (retro #4): translated-only hides the
    // original on projected rows, bilingual shows both, companion-track
    // lines always show.
    for (const row of list.querySelectorAll(".pbv-row")) {
      const txt = row.querySelector(":scope > .pbv-text");
      const tr = row.querySelector(":scope > .pbv-tr");
      const projected = row.classList.contains("pbv-row--tr");
      const aux = row.classList.contains("pbv-row--aux");
      if (txt && !(trOnly && projected)) out.push(txt);
      if (tr && (aux || (projected && (bilingual || trOnly)))) out.push(tr);
    }
    _pbpSearchPushDescription(out);
    return out;
  }
  for (const el of view.children) {
    if (el.classList.contains("pb-tr")) {
      if (!bilingual && !trOnly) continue;
    } else if (trOnly && el.hasAttribute("data-pb-tr-done") && !el.classList.contains("pb-show-orig")) {
      continue;
    }
    out.push(el);
  }
  _pbpSearchPushDescription(out);
  return out;
}
// The video description (<details#video-description>) is outside the
// article; it is searchable only while expanded -- a collapsed one would
// produce exactly the invisible matches the rule above removes.
function _pbpSearchPushDescription(out) {
  const desc = document.querySelector("details#video-description[open] > .desc-body");
  if (!desc) return;
  for (const el of desc.children) out.push(el);
}

// Gate matches md-ask.js's _pbpAskFlash precedent verbatim (typeof Highlight
// === "function" && typeof CSS !== "undefined" && "highlights" in CSS) --
// kept identical across every CSS Custom Highlight call site in this
// feature family so the call sites can't drift apart.
function _pbpSearchPaintAll() {
  if (typeof Highlight !== "function" || typeof CSS === "undefined" || !("highlights" in CSS)) return;
  const valid = _pbpSearchState.ranges.filter((r) => !!r);
  if (!valid.length) { CSS.highlights.delete("pbp-search"); return; }
  const h = new Highlight(...valid);
  h.priority = 1; // spec sec.4: explicit contract, below current (2) and flash (3)
  CSS.highlights.set("pbp-search", h);
}

// H6 (spec sec.2): note hits (see _pbpSearchRun) carry a Range but no
// `.el` -- this derives the element to scroll into view from the Range's
// start container, text node vs element node both handled.
function _pbpSearchElFromRangeStart(range) {
  const c = range.startContainer;
  return c.nodeType === Node.TEXT_NODE ? c.parentElement : c;
}

function _pbpSearchPaintCurrent(jump) {
  const st = _pbpSearchState;
  if (typeof Highlight === "function" && typeof CSS !== "undefined" && "highlights" in CSS) {
    const r = st.idx >= 0 ? st.ranges[st.idx] : null;
    if (r) {
      const h = new Highlight(r);
      h.priority = 2;
      CSS.highlights.set("pbp-search-current", h);
    } else {
      CSS.highlights.delete("pbp-search-current");
    }
  }
  if (jump && st.idx >= 0) {
    const m = st.matches[st.idx];
    // H6 (spec sec.2): a note hit is {noteId, range}, not {el, start, end}
    // -- fall back to deriving the element from the Range's start
    // container so the jump-to-current behavior is identical either way.
    const el = m && (m.el || (m.range && _pbpSearchElFromRangeStart(m.range)));
    // Instant unconditionally, not just under reduced motion: this replaces
    // native Ctrl+F, which is instant, and it re-runs on every Enter/Shift+Enter
    // AND every debounced keystroke -- typing a 5-letter query queued five
    // overlapping distance-scaled smooth scrolls, leaving the page gliding while
    // the reader is trying to read the hit.
    pbpScrollIntoView(el, { block: "center", behavior: "instant" });
  }
}

function _pbpSearchUpdateCounter() {
  const pop = _pbpSearchPopEl;
  if (!pop) return;
  const counter = pop.querySelector("#search-count");
  if (!counter) return;
  const st = _pbpSearchState;
  const total = st.matches.length >= 500 ? "500+" : String(st.matches.length);
  const cur = st.matches.length ? String(st.idx + 1) : "0";
  counter.textContent = cur + " / " + total;
  // Pairs with the aria-busy set in _pbpSearchOnInput / _pbpSearchArmObserver
  // -- this is the ONLY place that clears it, so every debounced rescan
  // settles into exactly one AT announcement of the FINAL count.
  counter.removeAttribute("aria-busy");
}

// H6 (spec sec.2) note-search overlap guard: a search query can
// independently match BOTH a highlight's rendered quote text (found by
// the DOM scan in _pbpSearchRun below) and that SAME highlight's
// separate `note` field (found by the note pass) -- two different
// match shapes (an {el,start,end} exact substring vs a {noteId,range}
// whole-quote span) pointing at the same visual location. Two ranges
// overlap unless one ends at-or-before the other starts; START_TO_END
// is the compareBoundaryPoints() constant that yields "this range's
// end vs. the other range's start" (its naming is notoriously easy to
// get backwards -- verified against a real Chromium instance, not
// assumed). Same primitive md-highlight.js's _pbpHlClipRangeToBlock
// already uses for range-vs-range geometry, so this decides true
// overlap correctly across every view mode (bilingual/tr-only/etc), no
// text-heuristic guessing needed.
function _pbpSearchRangesOverlap(a, b) {
  if (a.compareBoundaryPoints(Range.START_TO_END, b) <= 0) return false; // a ends at/before b starts
  if (b.compareBoundaryPoints(Range.START_TO_END, a) <= 0) return false; // b ends at/before a starts
  return true;
}

function _pbpSearchRangeOverlapsAny(range, ranges) {
  for (const r of ranges) {
    if (r && _pbpSearchRangesOverlap(range, r)) return true;
  }
  return false;
}

// Re-run the whole scan against the CURRENT DOM. Called on input
// (debounced in _pbpSearchOnInput) and on rescan triggers (view-mode
// toggle / target-language change, observed via _pbpSearchArmObserver).
function _pbpSearchRun(query) {
  const st = _pbpSearchState;
  st.query = query;
  st.matches = [];
  st.ranges = [];
  const CAP = 500;
  const view = document.getElementById("rendered-view");
  // Regex mode: compile validity is identical for every candidate container,
  // so check once per run rather than re-catching inside the loop below --
  // an invalid pattern degrades to "zero matches" (srch-bad below flags it,
  // pbpSearchEnumerateRegex itself is never even called in that case).
  let bad = false;
  if (_pbpSearchRegexOn && query) {
    try { new RegExp(query, "gi"); } catch (_) { bad = true; }
  }
  if (query && view && !bad) {
    const cands = _pbpSearchVisibleCandidates(view);
    scan:
    for (const el of cands) {
      const hits = _pbpSearchRegexOn
        ? pbpSearchEnumerateRegex(el.textContent, query, CAP - st.matches.length)
        : pbpSearchEnumerate(el.textContent, query, CAP - st.matches.length);
      for (const h of hits) {
        st.matches.push({ el: el, start: h.start, end: h.end });
        if (st.matches.length >= CAP) break scan;
      }
    }
    for (const m of st.matches) {
      st.ranges.push(typeof _pbpAskRangeFromOffsets === "function" ? _pbpAskRangeFromOffsets(m.el, m.start, m.end) : null);
    }
    // H6 (spec sec.2): note-text pass, AFTER the DOM scan + its ranges
    // are built above -- so (a) DOM matches keep first claim on the 500
    // cap (body-text hits win ties for the shared budget), and (b) each
    // candidate note hit can be checked with _pbpSearchRangeOverlapsAny
    // against the DOM-scan ranges already collected. Without that check
    // a query matching both a highlight's rendered quote (already
    // surfaced by the DOM scan above) and its separate `note` field
    // would land the SAME highlight in st.matches twice. typeof-guarded
    // on pbpHlCurrentItems -- a no-op whenever md-highlight.js never
    // loaded/inited (AI-less users) or the user simply has zero
    // highlights, which is exactly the "search behaves byte-identically
    // to today" guarantee this hook must uphold.
    if (st.matches.length < CAP && typeof pbpHlCurrentItems === "function") {
      const noteIds = pbpSearchFilterNotes(pbpHlCurrentItems(), query, _pbpSearchRegexOn);
      // null = invalid regex -- the DOM scan above already short-circuited
      // itself (the `bad` guard) and flagged srch-bad; this pass
      // contributes nothing extra on top, same as the DOM side.
      if (noteIds) {
        for (const id of noteIds) {
          if (st.matches.length >= CAP) break;
          const range = typeof pbpHlRangeOf === "function" ? pbpHlRangeOf(id) : null;
          if (!range) continue; // not painted (tr-lang mismatch / block drift, spec sec.2) -- skip this hit
          if (_pbpSearchRangeOverlapsAny(range, st.ranges)) continue; // dedup: this same highlight's quote text already produced a DOM-scan hit (spec sec.2 coincidental cross-hit overlap)
          st.matches.push({ noteId: id, range: range });
          st.ranges.push(range);
        }
      }
    }
  }
  if (_pbpSearchPopEl) {
    const inputEl = _pbpSearchPopEl.querySelector("#search-input");
    if (inputEl) inputEl.classList.toggle("srch-bad", bad);
  }
  st.idx = st.matches.length ? 0 : -1;
  _pbpSearchPaintAll();
  _pbpSearchPaintCurrent(true);
  _pbpSearchUpdateCounter();
}

function _pbpSearchStep(dir) {
  const st = _pbpSearchState;
  if (!st.matches.length) return;
  st.idx = (st.idx + dir + st.matches.length) % st.matches.length;
  _pbpSearchPaintCurrent(true);
  _pbpSearchUpdateCounter();
}

function _pbpSearchOnInput(e) {
  clearTimeout(_pbpSearchInputTimer);
  const val = e.target.value;
  // aria-busy set here, cleared in _pbpSearchUpdateCounter once the
  // debounced _pbpSearchRun below settles.
  if (_pbpSearchPopEl) {
    const counter = _pbpSearchPopEl.querySelector("#search-count");
    if (counter) counter.setAttribute("aria-busy", "true");
  }
  _pbpSearchInputTimer = setTimeout(() => _pbpSearchRun(val), 150);
}

// Rescan trigger (spec sec.4: "view change / lang change"): a single
// MutationObserver on #rendered-view (attributes+childList+subtree+
// characterData) covers BOTH without touching md-translate.js. Debounced
// 300ms past the last mutation; no-ops while the popover is closed.
function _pbpSearchArmObserver() {
  _pbpSearchDisarmObserver();
  const view = document.getElementById("rendered-view");
  if (!view) return;
  _pbpSearchMo = new MutationObserver(() => {
    // Condition checked BEFORE scheduling so aria-busy below is only ever
    // set when a rescan is actually going to run.
    if (!(_pbpSearchPopEl && _pbpSearchPopEl.matches(":popover-open") && _pbpSearchState.query)) return;
    clearTimeout(_pbpSearchMoTimer);
    const counter = _pbpSearchPopEl.querySelector("#search-count");
    if (counter) counter.setAttribute("aria-busy", "true");
    _pbpSearchMoTimer = setTimeout(() => {
      _pbpSearchRun(_pbpSearchState.query);
    }, 300);
  });
  _pbpSearchMo.observe(view, { childList: true, subtree: true, attributes: true, characterData: true });
  // The timeline list is a search candidate source too (video pages); a
  // density switch or track change rebuilds it wholesale, which must
  // rescan rather than leave counts pointing at detached rows (retro
  // VID-R1-02/SRCH-1). One observer, two targets -- the echo module's idiom.
  const list = document.querySelector(".pbv-col-study .pbv-list");
  if (list) _pbpSearchMo.observe(list, { childList: true, subtree: true, characterData: true });
}

function _pbpSearchDisarmObserver() {
  clearTimeout(_pbpSearchMoTimer);
  if (_pbpSearchMo) { _pbpSearchMo.disconnect(); _pbpSearchMo = null; }
}

// Full state teardown: both highlight names cleared, observer stopped,
// in-memory match list reset. Runs on EVERY dismissal path (Esc,
// click-outside, explicit hidePopover) via the popover's own "toggle"
// event registered once in _pbpSearchEnsurePop.
function _pbpSearchTeardown() {
  if (typeof Highlight === "function" && typeof CSS !== "undefined" && "highlights" in CSS) {
    CSS.highlights.delete("pbp-search");
    CSS.highlights.delete("pbp-search-current");
  }
  _pbpSearchDisarmObserver();
  _pbpSearchState = { query: "", matches: [], ranges: [], idx: -1 };
}

function _pbpSearchEnsurePop() {
  if (_pbpSearchPopEl) return _pbpSearchPopEl;
  const pop = document.createElement("div");
  pop.id = "search-pop";
  pop.setAttribute("popover", "auto"); // top-layer + Esc + light-dismiss for free

  const input = document.createElement("input");
  input.type = "text";
  input.id = "search-input";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.placeholder = t("srchPlaceholder");
  input.setAttribute("aria-label", t("srchInputAria"));
  input.addEventListener("input", _pbpSearchOnInput);
  input.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    // Flush a pending 150ms debounce: comparing the live input value
    // against the last-RUN query catches "Enter pressed before
    // _pbpSearchRun fired yet" without introspecting the timer.
    if (input.value !== _pbpSearchState.query) {
      clearTimeout(_pbpSearchInputTimer);
      _pbpSearchRun(input.value);
      return; // _pbpSearchRun already lands on match 1; don't also step past it
    }
    _pbpSearchStep(e.shiftKey ? -1 : 1);
  });
  pop.appendChild(input);

  // Regex-mode toggle (spec: regex search). ".*" is plain ASCII text, not
  // an icon -- the label itself already communicates the mode; aria-pressed
  // carries the on/off state for AT. State is persisted across popover
  // sessions in chrome.storage.local; read here (async is fine, the pop is
  // fresh and the query is empty) and written back on every click.
  const regexBtn = document.createElement("button");
  regexBtn.type = "button";
  regexBtn.id = "search-regex";
  regexBtn.className = "srch-regex";
  regexBtn.textContent = ".*";
  regexBtn.setAttribute("aria-pressed", "false");
  regexBtn.setAttribute("aria-label", t("srchRegexAria"));
  regexBtn.title = t("srchRegexAria");
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
    try {
      chrome.storage.local.get({ pbp_srch_regex: false }, (res) => {
        _pbpSearchRegexOn = !!(res && res.pbp_srch_regex);
        regexBtn.setAttribute("aria-pressed", _pbpSearchRegexOn ? "true" : "false");
      });
    } catch (_) {}
  }
  regexBtn.addEventListener("click", () => {
    _pbpSearchRegexOn = !_pbpSearchRegexOn;
    regexBtn.setAttribute("aria-pressed", _pbpSearchRegexOn ? "true" : "false");
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      try { chrome.storage.local.set({ pbp_srch_regex: _pbpSearchRegexOn }); } catch (_) {}
    }
    clearTimeout(_pbpSearchInputTimer);
    _pbpSearchRun(input.value);
    input.focus();
  });
  pop.appendChild(regexBtn);

  // aria-live=polite counter, paired with aria-busy around each debounced
  // rescan (same pairing md-ask.js uses for its streaming .ask-a).
  const count = document.createElement("span");
  count.id = "search-count";
  count.className = "srch-count";
  count.setAttribute("aria-live", "polite");
  count.textContent = "0 / 0";
  pop.appendChild(count);

  const prev = document.createElement("button");
  prev.type = "button";
  prev.id = "search-prev";
  prev.className = "srch-nav";
  prev.innerHTML = PBP_SEARCH_PREV_SVG;
  prev.setAttribute("aria-label", t("srchPrevAria"));
  prev.title = t("srchPrevAria");
  prev.addEventListener("click", () => _pbpSearchStep(-1));
  pop.appendChild(prev);

  const next = document.createElement("button");
  next.type = "button";
  next.id = "search-next";
  next.className = "srch-nav";
  next.innerHTML = PBP_SEARCH_NEXT_SVG;
  next.setAttribute("aria-label", t("srchNextAria"));
  next.title = t("srchNextAria");
  next.addEventListener("click", () => _pbpSearchStep(1));
  pop.appendChild(next);

  pop.addEventListener("toggle", (e) => {
    if (e.newState === "closed") _pbpSearchTeardown();
  });
  document.body.appendChild(pop);
  _pbpSearchPopEl = pop;
  return pop;
}

// Mutual exclusion with the other popover families (spec sec.6.1) --
// "#fn-pop" is Task 3's footnote popover; a plain getElementById is used
// since it degrades to a safe no-op (null) whether or not that feature
// happened to mount.
function _pbpSearchOpen() {
  const pop = _pbpSearchEnsurePop();
  _pbpReaderHideOtherPopovers(pop);
  _pbpSearchTeardown();
  const input = pop.querySelector("#search-input");
  input.value = "";
  input.classList.remove("srch-bad"); // stale invalid-regex border must not survive a close/reopen
  _pbpSearchUpdateCounter();
  if (!pop.matches(":popover-open")) pop.showPopover();
  input.focus();
  _pbpSearchArmObserver();
}

// Same typing/modifier gate as the bare-letter shortcuts
// (pbpTrIsTypingContext, md-translate.js), plus one search-specific 5th
// gate: raw view is a plain <pre>, not a rendered document -- "/" is a
// no-op there so native Ctrl+F keeps working on raw text untouched.
function _pbpSearchOnKeyDown(e) {
  if (e.key !== "/") return;
  // Don't gate on shiftKey: on some layouts (German QWERTZ, French AZERTY)
  // "/" requires Shift, and on US layouts Shift+/ yields "?" so e.key
  // already disambiguates -- same reasoning as the "?" help hotkey.
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const ae = document.activeElement;
  const isTyping = (typeof pbpTrIsTypingContext === "function")
    ? pbpTrIsTypingContext(ae && ae.tagName, !!(ae && ae.isContentEditable))
    : !!(ae && (ae.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName || "")));
  if (isTyping) return;
  if (document.body.classList.contains("raw-active")) return;
  e.preventDefault();
  _pbpSearchOpen();
}

function _pbpSearchInit() {
  if (_pbpSearchInited) return;
  _pbpSearchInited = true;
  document.addEventListener("keydown", _pbpSearchOnKeyDown);
}

// ---- Keyboard-shortcuts help (spec 5): "?" hotkey + rail-bottom link +
// options static section all point at the same popover. ----
const PBP_KBD_HELP_ROWS = [
  { chips: ["t"], key: "kbdHelpTranslate" },
  { chips: ["v"], key: "kbdHelpToggleView" },
  { chips: ["d"], key: "kbdHelpDictionary" },
  { chips: ["e"], key: "kbdHelpExplain" },
  { chips: ["h", "1-5"], key: "kbdHelpHighlight" },
  { chips: ["a"], key: "kbdHelpAsk" },
  { chips: ["/"], key: "kbdHelpSearch" },
  { chips: ["z"], key: "kbdHelpZen" },
  { chips: ["?"], key: "kbdHelpShowHelp" },
  { chips: ["Esc"], key: "kbdHelpClose" }
];
// Video pages only (research T3.3) -- appended at build time when the page
// is in video-mode (set before the help can be opened).
const PBP_KBD_HELP_VIDEO_ROWS = [
  { chips: ["Space"], key: "kbdHelpVideoPlay" },
  { chips: ["Left", "Right"], key: "kbdHelpVideoSeek" }, // key names, not arrow glyphs (font iron rule; mirrors pbpVideoShortcutKeys)
  { chips: ["[", "]"], key: "kbdHelpVideoCue" },
  { chips: ["r"], key: "kbdHelpVideoLoop" },
  { chips: ["f"], key: "kbdHelpVideoFollow" },
  { chips: ["c"], key: "kbdHelpVideoCurrent" },
  { chips: ["b"], key: "kbdHelpVideoView" }
];
let _pbpKbdHelpPopEl = null;

function _pbpKbdHelpEnsurePop() {
  if (_pbpKbdHelpPopEl) return _pbpKbdHelpPopEl;
  const pop = document.createElement("div");
  pop.id = "kbd-help-pop";
  pop.setAttribute("popover", "auto"); // top-layer + Esc + light-dismiss for this transient help surface
  const title = document.createElement("div");
  title.className = "kbd-help-title";
  title.textContent = t("kbdHelpTitle");
  pop.appendChild(title);
  const list = document.createElement("ul");
  list.className = "kbd-help-list";
  _pbpKbdHelpFillList(list);
  pop.appendChild(list);
  document.body.appendChild(pop);
  _pbpKbdHelpPopEl = pop;
  return pop;
}

// Mutual exclusion with the other popover families (explain-pop / pb-hl-bar
// / pb-hl-card / fn-pop / search-pop): explicitly hide any other open
// popover first, same belt-and-suspenders pattern md-highlight.js already
// uses before opening #explain-pop.
// Rows are (re)built on every open (retro KBD-3): the video rows depend on
// what the page can actually do right now -- md-video.js publishes the
// live key set (bilibili has no player protocol, so Space / arrows / r / f
// are not offered there), and captions may land after the first open.
function _pbpKbdHelpFillList(list) {
  list.replaceChildren();
  let rows = PBP_KBD_HELP_ROWS;
  if (document.body.classList.contains("video-mode")) {
    const live = (typeof window.pbpVideoShortcutKeys === "function") ? window.pbpVideoShortcutKeys() : null;
    rows = rows.concat(PBP_KBD_HELP_VIDEO_ROWS.filter((r) => !live || r.chips.every((c) => live.has(c))));
  }
  rows.forEach((row) => {
    const li = document.createElement("li");
    li.className = "kbd-help-row";
    const chipWrap = document.createElement("span");
    chipWrap.className = "kbd-help-chips";
    row.chips.forEach((c) => {
      const kbd = document.createElement("kbd");
      kbd.className = "kbd-help-chip";
      kbd.textContent = c;
      chipWrap.appendChild(kbd);
    });
    li.appendChild(chipWrap);
    const desc = document.createElement("span");
    desc.className = "kbd-help-desc";
    desc.textContent = t(row.key);
    li.appendChild(desc);
    list.appendChild(li);
  });
}

function _pbpKbdHelpOpen() {
  const pop = _pbpKbdHelpEnsurePop();
  const lst = pop.querySelector(".kbd-help-list");
  if (lst) _pbpKbdHelpFillList(lst);
  _pbpReaderHideOtherPopovers(pop);
  if (!pop.matches(":popover-open")) pop.showPopover();
}

// "?" hotkey: same typing/modifier gate pattern as the bare-letter hotkeys,
// EXCEPT shiftKey is explicitly allowed through (not rejected) -- "?" is
// typed as Shift+/ on most keyboard layouts, so e.shiftKey is normally true
// for this key and must not be treated as a modifier that cancels the
// shortcut.
function _pbpKbdHelpOnKeyDown(e) {
  if (e.key !== "?") return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const ae = document.activeElement;
  if (typeof pbpTrIsTypingContext === "function"
    && pbpTrIsTypingContext(ae && ae.tagName, !!(ae && ae.isContentEditable))) return;
  e.preventDefault();
  _pbpKbdHelpOpen();
}

// Shared rail-bottom row (spec sec.1.1, R2 batch): ONE flex row container
// appended as #rail's LAST child, holding every small rail-bottom text
// button. Idempotent via a plain id lookup (not a dataset flag -- a second
// call from a different feature's init must find and reuse the same row,
// not skip because ITS OWN flag was never set) so whichever of
// _pbpKbdHelpInit / _pbpZenInit runs first creates it and the other just
// appends into it -- neither call owns creation. Interface for any FUTURE
// rail-bottom text button: call this, then row.appendChild(yourButton) --
// never rail.appendChild directly, never a new sibling container class.
function _pbpRailBottomRow() {
  const rail = document.getElementById("rail");
  if (!rail) return null;
  let row = document.getElementById("rail-bottom-row");
  if (row) return row;
  row = document.createElement("div");
  row.id = "rail-bottom-row";
  row.className = "rail-bottom-row";
  rail.appendChild(row); // #toc (nav) is #rail's static last child today, and every
  // dynamic rail section (tr/ask/hl) inserts itself BEFORE #toc -- so a
  // plain appendChild here always lands truly last, i.e. at the rail's
  // bottom, matching spec 5.2's "unobtrusive rail-bottom entry" (comment
  // moved verbatim from the old rail.appendChild(btn) call this replaces).
  return row;
}

let _pbpKbdHelpInited = false;

function _pbpKbdHelpInit() {
  if (_pbpKbdHelpInited) return;
  _pbpKbdHelpInited = true;
  document.addEventListener("keydown", _pbpKbdHelpOnKeyDown);
  const row = _pbpRailBottomRow();
  if (row) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "rail-kbd-help-btn";
    btn.className = "rail-kbd-help-btn";
    btn.innerHTML = PBP_ICONS.keyboard; // static shared constant; label rides title/aria
    btn.title = t("kbdHelpRailBtn");
    btn.setAttribute("aria-label", t("kbdHelpRailBtn"));
    btn.addEventListener("click", () => _pbpKbdHelpOpen());
    row.appendChild(btn);
  }
}

// ---- R2: Zen (focus) reading mode (spec sec.1/3/4 -- "z" hotkey / rail
// button / #zen-bar). Scroll-preservation on enter/exit/width-cycle reuses
// the block-index + fraction technique the Raw<->Rendered toggle (md-
// preview.js:889-930) and its own R9 restore (md-preview.js:955-1029)
// already established -- pbpReaderPickScrollAnchor (this file's pure
// section, above) is the shared math; pbpAiBlocks/pbpAiIndexBlocks/
// pbpAiBlockEl (md-ai-core.js) and trOnlyScrollTarget (md-preview.js) are
// the genuinely page-global pieces this file can reach. NOTE:
// md-preview.js's own pbpScrollMapBlocks() wrapper is NOT page-global --
// it's declared inside that file's `(async function () {...})()` IIFE, so
// it is invisible outside md-preview.js despite looking like a top-level
// declaration; _pbpZenScrollBlocks() below is this file's own copy of its
// three-line body against the genuinely-global pbpAiBlocks/
// pbpAiIndexBlocks pair. Also reaches md-preview.js's own
// pbpRailDrawerClose() (Step 3, this batch) to force-close the mobile
// drawer on zen entry, and moves focus off of #rail before it's hidden if
// that's where focus was -- see _pbpZenEnter() below for both. Spec
// sec.1.4: no R9 self-scroll suppression window is needed here -- the
// settle call's programmatic scroll lands on the correct NEW position, so
// even if it re-arms R9's own save-scroll debounce (md-preview.js), R9
// saving that position is harmless (unlike R9's OWN restore-vs-save race,
// which the suppression window there exists to prevent). ----
const PBP_ZEN_WIDTHS = [680, 880, 1080];
let _pbpZenWidth = 880; // in-memory current width (px); loaded async below. Zen ON/OFF itself is never persisted (spec sec.1.1) -- only this width step is.
let _pbpZenWidthTouched = false; // user cycled before the async load landed -> late read is stale, ignore it
let _pbpZenBarEl = null;
let _pbpZenFadeTimer = null;
let _pbpZenInited = false;

// Width-cycle icon (spec sec.4: PBP_ICONS-style linear stroke, same
// viewBox/stroke-width/linecap/linejoin family as PBP_SEARCH_PREV_SVG/
// PBP_SEARCH_NEXT_SVG above -- kept as a local const like those two rather
// than added to shared.js's PBP_ICONS bank, same precedent). Two arrows
// pointing outward from center reads as "resize/cycle width."
// Alias of the shared width-cycle icon (Lucide move-horizontal) so the
// zen-bar and rail entry points stay pixel-identical with the family.
const PBP_ZEN_WIDTH_SVG = typeof PBP_ICONS !== "undefined" ? PBP_ICONS.widthCycle : "";

// This file's own copy of md-preview.js's pbpScrollMapBlocks() body (see
// the header comment above) against the same genuinely page-global
// pbpAiBlocks/pbpAiIndexBlocks pair -- force-indexes #rendered-view once
// if nothing has indexed it yet (translate/ask only index when AI is
// configured, so this can't assume it already ran), same defensive shape
// every existing caller of that pair already uses.
function _pbpZenScrollBlocks() {
  if (typeof pbpAiBlocks !== "function") return [];
  if (!pbpAiBlocks().length && typeof pbpAiIndexBlocks === "function") {
    const view = document.getElementById("rendered-view");
    if (view) pbpAiIndexBlocks(view);
  }
  return pbpAiBlocks();
}

// Capture-before-relayout half of the scroll-preservation technique:
// topmost visible block + the fraction already scrolled into it, via this
// file's own pbpReaderPickScrollAnchor (pure section, above). null in raw
// view -- #rendered-view is display:none there (.content-view.hidden), so
// every rect would read 0x0 -- same scope limit _pbpReaderSaveScroll
// (md-preview.js:956) already accepts for the R9 save path; a raw-view
// zen toggle simply doesn't reposition scroll, an accepted simplification.
function _pbpZenCaptureAnchor() {
  if (document.body.classList.contains("raw-active")) return null;
  // At the very top, NO anchor is the right anchor: re-settling would
  // scrollIntoView the first block and eat the article's top padding. A
  // layout change at scrollY=0 should leave the reader at scrollY=0
  // (Codex, plan B -- benefits width cycling and the typography tiers alike).
  if (window.scrollY === 0) return null;
  const blocks = _pbpZenScrollBlocks();
  if (!blocks.length) return null;
  const rects = blocks.map((b) => (typeof trOnlyScrollTarget === "function" ? trOnlyScrollTarget(b.el) : b.el).getBoundingClientRect());
  return typeof pbpReaderPickScrollAnchor === "function" ? pbpReaderPickScrollAnchor(rects) : null;
}

// Re-settle half: resolve the anchor against the block list AFTER the
// layout change (the class/style mutations already happened synchronously
// above each call site below) -- same scrollIntoView + scrollBy(frac *
// height) shape as md-preview.js's own R9 applyRestore().
function _pbpZenSettleAnchor(anchor) {
  if (!anchor || typeof pbpAiBlockEl !== "function") return;
  const blockEl = pbpAiBlockEl(anchor.n);
  if (!blockEl) return;
  const target = typeof trOnlyScrollTarget === "function" ? trOnlyScrollTarget(blockEl) : blockEl;
  target.scrollIntoView({ block: "start" });
  const frac = Math.min(Math.max(Number(anchor.frac) || 0, 0), 1);
  if (frac > 0) {
    const h = target.getBoundingClientRect().height;
    if (h > 0) window.scrollBy(0, frac * h);
  }
}

// Two-phase settle (transition-round): main/.doc-body now carry
// margin-left/margin-right/max-width transitions (md-preview.css), so the
// single immediate _pbpZenSettleAnchor() call above (still called first,
// unchanged) can run against MID-ANIMATION geometry -- correct under
// reduced motion (those transitions collapse to 0s there, so "immediately
// after the class/style mutation" already IS the final geometry) and only
// an approximation otherwise. This phase re-settles ONCE more after the
// layout transition actually finishes, against the final geometry.
// Harmless when it's redundant (reduced motion, or the immediate call
// already nailed it): same "no R9 suppression needed" reasoning as
// _pbpZenSettleAnchor's own call sites already document above (spec
// sec.1.4) -- a second correct programmatic scroll can only re-arm R9's
// save-scroll debounce (md-preview.js), never race its restore.
//
// Module-level handles (not per-call locals): a re-settle armed by one
// call must be torn down if another zen action (enter/exit/width-cycle)
// happens before it fires, so rapid repeated toggles never stack listeners
// or timers -- _pbpZenSettleClearPending() is called at the start of every
// _pbpZenSettleAfterLayout() for exactly this reason, in addition to being
// the normal one-shot cleanup path.
let _pbpZenSettleTimer = null;
let _pbpZenSettlePending = null; // non-null (the anchor) while a re-settle is armed; also doubles as the "already fired" guard

function _pbpZenSettleClearPending() {
  if (_pbpZenSettleTimer !== null) {
    clearTimeout(_pbpZenSettleTimer);
    _pbpZenSettleTimer = null;
  }
  document.removeEventListener("transitionend", _pbpZenSettleOnTransitionEnd);
  _pbpZenSettlePending = null;
}

function _pbpZenSettleFire() {
  if (!_pbpZenSettlePending) return; // already fired via the other race leg (or nothing armed)
  const anchor = _pbpZenSettlePending;
  _pbpZenSettleClearPending();
  _pbpZenSettleAnchor(anchor);
}

// Delegated on document rather than bound to a single element: the
// transitioning properties live on two different elements (margin-left/
// margin-right on `main`, max-width on `.doc-body`), and delegation is the
// simplest reliable way to catch either without wiring two listeners.
function _pbpZenSettleOnTransitionEnd(e) {
  const el = e.target;
  const isTracked = el && (el.tagName === "MAIN" || (el.classList && el.classList.contains("doc-body")));
  if (!isTracked) return;
  // `max-width` used to be here for .doc-body's reading-width tween. That
  // transition is gone (interpolating the measure re-wrapped every paragraph),
  // so the branch could never fire; the 300ms fallback covers width changes.
  if (e.propertyName !== "margin-left" && e.propertyName !== "margin-right") return;
  _pbpZenSettleFire();
}

function _pbpZenSettleAfterLayout(anchor) {
  _pbpZenSettleAnchor(anchor); // phase 1: immediate, correct under reduced motion
  _pbpZenSettleClearPending(); // repeated rapid toggles must not stack listeners/timers
  if (!anchor) return;
  _pbpZenSettlePending = anchor; // phase 2, armed: transitionend or the 300ms fallback, whichever fires first
  document.addEventListener("transitionend", _pbpZenSettleOnTransitionEnd);
  _pbpZenSettleTimer = setTimeout(_pbpZenSettleFire, 300);
}

// Width persistence: exact pbp_srch_regex shape (md-reader.js:565-575) --
// chrome.storage.local.get with an inline default, both chrome/
// chrome.storage typeof-guarded, read once here at init; written back
// only from the cycle buttons below. An unrecognized stored value (e.g. a
// stale format from a future/rolled-back version) degrades to the 880
// default rather than propagating garbage into --pbp-width. Unified-width
// round: the stored value now drives BOTH modes (--pbp-width on .doc-body,
// md-preview.css ~:292), so the callback must APPLY it, not just remember
// it for a later zen entry -- the page first paints at the 880 fallback and
// settles to the stored step here (one animated max-width transition; the
// existing scroll-anchor settle keeps the reading position through it).
// Storage key stays pbp_zen_width: it predates the unification and a rename
// would orphan every existing user's saved step for zero benefit.
function _pbpZenLoadWidth() {
  if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) return;
  try {
    chrome.storage.local.get({ pbp_zen_width: 880 }, (res) => {
      // The cycle buttons are clickable before this async read lands; a user
      // interaction is fresher truth than the stored step it already
      // overwrote, so a late arrival must not clobber it (Codex acceptance).
      if (_pbpZenWidthTouched) return;
      _pbpZenWidth = (res && PBP_ZEN_WIDTHS.indexOf(res.pbp_zen_width) !== -1) ? res.pbp_zen_width : 880;
      if (_pbpZenWidth !== 880) _pbpZenApplyWidth(); // 880 == CSS fallback: applying would only churn layout
      else _pbpZenUpdateWidthBtn(); // still label the buttons with the resolved step
    });
  } catch (_) {}
}

// Single apply path shared by load + both cycle buttons: sets the
// mode-independent --pbp-width, relabels every width control, and re-settles
// the scroll anchor through the max-width transition.
function _pbpZenApplyWidth() {
  const anchor = _pbpZenCaptureAnchor();
  document.body.style.setProperty("--pbp-width", _pbpZenWidth + "px");
  _pbpZenUpdateWidthBtn();
  _pbpZenSettleAfterLayout(anchor);
}

// Width button title/aria (spec sec.1.3: "simplest honest form") -- one
// i18n key + the concatenated step value, not a 3-way translated string.
// Updates BOTH entry points (zen bar icon button + rail text button); either
// may not exist yet (bar is lazy, rail button only after _pbpZenInit).
function _pbpZenUpdateWidthBtn() {
  const label = t("zenWidthAria") + ": " + _pbpZenWidth + "px";
  const btn = document.getElementById("zen-width-btn");
  if (btn) {
    btn.setAttribute("aria-label", label);
    btn.title = label;
  }
  const railBtn = document.getElementById("rail-width-btn");
  if (railBtn) {
    // Icon-only cell: the step value lives in title/aria (label already
    // concatenates it), never in textContent -- that would wipe the SVG.
    railBtn.setAttribute("aria-label", label);
    railBtn.title = label;
  }
}

// Lazily builds the singleton #zen-bar (spec sec.1.3): NOT a popover -- no
// Esc/light-dismiss semantics, it stays mounted (CSS-hidden outside
// body.zen) for the rest of the page's life once zen is entered once.
function _pbpZenEnsureBar() {
  if (_pbpZenBarEl) return _pbpZenBarEl;
  const bar = document.createElement("div");
  bar.id = "zen-bar";

  const widthBtn = document.createElement("button");
  widthBtn.type = "button";
  widthBtn.id = "zen-width-btn";
  widthBtn.className = "zen-btn";
  widthBtn.innerHTML = PBP_ZEN_WIDTH_SVG;
  widthBtn.addEventListener("click", _pbpZenCycleWidth);
  bar.appendChild(widthBtn);

  // "Aa" typography entry (plan B): text, not an inline SVG -- plain Latin
  // glyphs carry no emoji/dingbat slow-font risk (CLAUDE.md font iron rule).
  const typoBtn = document.createElement("button");
  typoBtn.type = "button";
  typoBtn.id = "zen-typo-btn";
  typoBtn.className = "zen-btn";
  typoBtn.textContent = "Aa";
  typoBtn.setAttribute("aria-label", t("typoPanelAria"));
  typoBtn.title = t("typoPanelAria");
  typoBtn.addEventListener("click", () => _pbpTypoToggle(typoBtn));
  bar.appendChild(typoBtn);

  const exitBtn = document.createElement("button");
  exitBtn.type = "button";
  exitBtn.id = "zen-exit-btn";
  exitBtn.className = "zen-btn";
  exitBtn.innerHTML = (typeof PBP_ICONS === "object" && PBP_ICONS && PBP_ICONS.cross) || "";
  exitBtn.setAttribute("aria-label", t("zenExitAria"));
  exitBtn.title = t("zenExitAria");
  exitBtn.addEventListener("click", _pbpZenExit);
  bar.appendChild(exitBtn);

  document.body.appendChild(bar);
  _pbpZenBarEl = bar;
  return bar;
}

// Width-cycle click (zen bar + rail button share this): 680 -> 880 -> 1080
// -> 680 ..., persisted (spec sec.1.2), applied mode-independently via
// _pbpZenApplyWidth. The .set() promise gets a .catch: storage failure must
// stay silent-but-handled, not an unhandled rejection (Codex review).
function _pbpZenCycleWidth() {
  _pbpZenWidthTouched = true; // see _pbpZenLoadWidth: a late storage read must not undo this click
  const idx = PBP_ZEN_WIDTHS.indexOf(_pbpZenWidth);
  _pbpZenWidth = PBP_ZEN_WIDTHS[(idx === -1 ? 0 : idx + 1) % PBP_ZEN_WIDTHS.length];
  _pbpZenApplyWidth();
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
    try { chrome.storage.local.set({ pbp_zen_width: _pbpZenWidth }).catch(() => {}); } catch (_) {}
  }
}

// Mouse-idle fade (spec sec.1.3): 2s of stillness fades #zen-bar to near-
// invisible + pointer-events:none (CSS .faded, md-preview.css); any
// mousemove restores it immediately; #zen-bar:focus-within overrides
// .faded in CSS so a keyboard user tabbed onto a bar button never has it
// fade under them.
function _pbpZenOnMouseMove() {
  if (_pbpZenBarEl) _pbpZenBarEl.classList.remove("faded");
  clearTimeout(_pbpZenFadeTimer);
  _pbpZenFadeTimer = setTimeout(() => {
    if (_pbpZenBarEl) _pbpZenBarEl.classList.add("faded");
  }, 2000);
}

function _pbpZenArmFade() {
  document.addEventListener("mousemove", _pbpZenOnMouseMove, { passive: true });
  _pbpZenOnMouseMove(); // starts the 2s countdown immediately on entry, same effect as a real mousemove would
}

// Zero-leak teardown (spec sec.1.3): removes the listener + clears the
// timer + un-fades the bar so the NEXT zen entry starts from a clean state.
function _pbpZenDisarmFade() {
  document.removeEventListener("mousemove", _pbpZenOnMouseMove);
  clearTimeout(_pbpZenFadeTimer);
  _pbpZenFadeTimer = null;
  if (_pbpZenBarEl) _pbpZenBarEl.classList.remove("faded");
}

// Enter zen. Two adversarial-review fixes live here (see corrections 4/5
// above): (a) force-closes the mobile drawer via md-preview.js's
// pbpRailDrawerClose() -- entering zen from the ONLY reachable mobile path
// (the zen button inside the open drawer) must not leave body.rail-open /
// the scrim's visible state / #rail's dialog attributes stranded, or
// exiting zen would resurrect the drawer overlay; (b) if focus was inside
// #rail before this call (the rail button that was just clicked, or a
// keyboard user tabbed onto it before pressing "z"), #rail is about to be
// display:none'd out from under that focus, so focus is explicitly moved
// to #zen-exit-btn once the bar exists -- otherwise the browser blurs the
// vanishing element and focus silently falls back to <body> with no
// indication of where it went. The ordinary "z"-from-elsewhere path (focus
// NOT inside #rail) is untouched -- it never had a focus-loss problem, and
// forcing focus onto the bar in that case would be a needless surprise
// mid-document.
function _pbpZenEnter() {
  if (document.body.classList.contains("zen")) return;
  // Zen is a reading mode of the ARTICLE: surface it if a video workspace
  // has the timeline in front (audit U6; no-op elsewhere).
  try { document.dispatchEvent(new CustomEvent("pbp:ensure-article-visible")); } catch (_) {}
  const anchor = _pbpZenCaptureAnchor();
  const ae = document.activeElement;
  const focusWasInRail = !!(ae && typeof ae.closest === "function" && ae.closest("#rail"));
  // No width write here: --pbp-width is mode-independent (set on load/cycle),
  // so entering zen only hides chrome -- the column never resizes.
  document.body.classList.add("zen");
  if (typeof pbpRailDrawerClose === "function") pbpRailDrawerClose();
  _pbpZenEnsureBar();
  _pbpZenUpdateWidthBtn();
  _pbpZenSettleAfterLayout(anchor);
  _pbpZenArmFade();
  if (focusWasInRail) {
    const exitBtn = document.getElementById("zen-exit-btn");
    if (exitBtn) exitBtn.focus();
  }
}

function _pbpZenExit() {
  if (!document.body.classList.contains("zen")) return;
  const anchor = _pbpZenCaptureAnchor();
  document.body.classList.remove("zen");
  // --pbp-width deliberately survives exit (mode-independent width).
  _pbpZenSettleAfterLayout(anchor);
  _pbpZenDisarmFade();
}

function _pbpZenToggle() {
  if (document.body.classList.contains("zen")) _pbpZenExit();
  else _pbpZenEnter();
}

// Same 4-condition gate as this file's own "?" hotkey (_pbpKbdHelpOnKeyDown,
// above) and md-highlight.js's "h" hotkey -- z is
// a bare letter, so shiftKey is REJECTED like every other bare-letter
// hotkey in this codebase (unlike "/" and "?", which are already-shifted
// characters on most keyboard layouts and so are exempted from the shift
// check; z has no such exemption).
function _pbpZenOnKeyDown(e) {
  if (e.key !== "z" && e.key !== "Z") return;
  if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
  const ae = document.activeElement;
  if (typeof pbpTrIsTypingContext === "function"
    && pbpTrIsTypingContext(ae && ae.tagName, !!(ae && ae.isContentEditable))) return;
  e.preventDefault();
  _pbpZenToggle();
}

function _pbpZenInit() {
  if (_pbpZenInited) return;
  _pbpZenInited = true;
  _pbpZenLoadWidth();
  document.addEventListener("keydown", _pbpZenOnKeyDown);
  const row = _pbpRailBottomRow();
  if (row) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "rail-zen-btn";
    btn.className = "rail-kbd-help-btn"; // spec sec.1.1: reuse the existing rail-bottom visual, don't fork a near-duplicate rule
    btn.innerHTML = PBP_ICONS.zen; // static shared constant; label rides title/aria
    btn.title = t("zenEnterBtn");
    btn.setAttribute("aria-label", t("zenEnterBtn"));
    btn.addEventListener("click", () => _pbpZenEnter());
    row.appendChild(btn);
    // Unified-width round: with --pbp-width governing normal mode too, the
    // width cycle needs an entry point OUTSIDE zen (the zen bar is the only
    // other one) -- same rail-bottom text-button family as its neighbors.
    // Label is the bare step value ("880px"); full text rides title/aria
    // (set by _pbpZenUpdateWidthBtn, which also keeps it in sync with the
    // zen bar's icon button).
    const widthBtn = document.createElement("button");
    widthBtn.type = "button";
    widthBtn.id = "rail-width-btn";
    widthBtn.className = "rail-kbd-help-btn";
    widthBtn.innerHTML = PBP_ZEN_WIDTH_SVG; // current step value rides title/aria (_pbpZenUpdateWidthBtn)
    widthBtn.addEventListener("click", _pbpZenCycleWidth);
    row.appendChild(widthBtn);
    _pbpZenUpdateWidthBtn();
  }
}

// ---- Reader typography runtime ("Aa" panel, plan B, Codex-adjudicated).
// Pure maps + sanitizer live in the pure section above (pbpTypoSanitize);
// the INITIAL application happens in md-preview.js before the first render
// (the tiers ride the same storage read as the preview payload -- no extra
// IPC, no re-layout flash). This section owns the runtime panel, the two
// "Aa" entry points (zen bar + rail bottom), anchor-preserving re-layout,
// and persistence. Storage contract mirrors pbp_zen_width exactly:
// chrome.storage.local, per-device, touched-guard against stale async
// reads. ----
let _pbpTypoFont = 0;
let _pbpTypoLeading = 0;
let _pbpTypoTouched = false; // same stale-async-read guard as _pbpZenWidthTouched
let _pbpTypoPopEl = null;
let _pbpTypoInited = false;

function _pbpTypoPersist() {
  if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) return;
  try { chrome.storage.local.set({ pbp_font_tier: _pbpTypoFont, pbp_leading_tier: _pbpTypoLeading }).catch(() => {}); } catch (_) {}
}

// Runtime tier change: capture the reading anchor, swap the vars, re-settle --
// the same preserve-position contract width cycling honors (and via the
// scrollY=0 guard in _pbpZenCaptureAnchor, a change at the top of the page
// leaves the reader at the top). Settle is the SYNC single-shot
// _pbpZenSettleAnchor, NOT _pbpZenSettleAfterLayout: that helper's 300ms
// second phase exists for the width path's max-width TRANSITION, which
// font-size/line-height changes don't have -- reusing it here yanked a user
// who scrolled within those 300ms back to the pre-scroll anchor (Codex
// acceptance, reproduced live: settle 1834 -> user scrolls 2600 -> dragged
// back to 1834).
function _pbpTypoSet(fontTier, leadingTier) {
  _pbpTypoTouched = true;
  const anchor = _pbpZenCaptureAnchor();
  const t2 = pbpTypoApplyVars(fontTier, leadingTier);
  _pbpTypoFont = t2.font;
  _pbpTypoLeading = t2.leading;
  _pbpTypoSyncPop();
  _pbpZenSettleAnchor(anchor);
  _pbpTypoPersist();
}

// Panel state -> DOM sync: percentage readout, stepper end-stops, leading
// segment pressed states. aria-disabled, never the disabled attribute -- a
// real disabled would drop focus to <body> the instant the boundary tier is
// reached under the user's pointer (same Chromium behavior the image-fix
// button already works around).
function _pbpTypoSyncPop() {
  if (!_pbpTypoPopEl) return;
  const val = _pbpTypoPopEl.querySelector(".typo-value");
  if (val) val.textContent = Math.round(PBP_TYPO_FONT_SCALES[String(_pbpTypoFont)] * 100) + "%";
  const minus = _pbpTypoPopEl.querySelector("#typo-font-minus");
  const plus = _pbpTypoPopEl.querySelector("#typo-font-plus");
  if (minus) minus.setAttribute("aria-disabled", _pbpTypoFont <= -2 ? "true" : "false");
  if (plus) plus.setAttribute("aria-disabled", _pbpTypoFont >= 2 ? "true" : "false");
  const scheme = (typeof window.pbpReaderSchemeGet === "function") ? window.pbpReaderSchemeGet() : "auto";
  _pbpTypoPopEl.querySelectorAll(".typo-seg-btn").forEach((b) => {
    const on = ("scheme" in b.dataset) ? b.dataset.scheme === scheme : Number(b.dataset.tier) === _pbpTypoLeading;
    b.setAttribute("aria-pressed", on ? "true" : "false");
  });
}

// Lazily builds the singleton #typo-pop: native popover="auto" (Esc +
// light-dismiss for free), same family as #fn-pop/#kbd-help-pop. Two rows:
// font-size stepper ("-" / readout / "+", ASCII only per the font iron rule)
// and a three-way leading segment (aria-pressed toggles, .srch-regex
// vocabulary).
function _pbpTypoEnsurePop() {
  if (_pbpTypoPopEl) return _pbpTypoPopEl;
  const pop = document.createElement("div");
  pop.id = "typo-pop";
  pop.setAttribute("popover", "auto");
  pop.setAttribute("aria-label", t("typoPanelAria"));

  const fontRow = document.createElement("div");
  fontRow.className = "typo-row";
  const fontLabel = document.createElement("span");
  fontLabel.className = "typo-label";
  fontLabel.textContent = t("typoFontLabel");
  fontRow.appendChild(fontLabel);
  const steps = document.createElement("div");
  steps.className = "typo-steps";
  const minus = document.createElement("button");
  minus.type = "button";
  minus.id = "typo-font-minus";
  minus.className = "typo-step";
  minus.textContent = "-";
  minus.setAttribute("aria-label", t("typoFontSmaller"));
  minus.title = t("typoFontSmaller");
  minus.addEventListener("click", () => { if (minus.getAttribute("aria-disabled") !== "true") _pbpTypoSet(_pbpTypoFont - 1, _pbpTypoLeading); });
  const val = document.createElement("span");
  val.className = "typo-value";
  val.setAttribute("aria-live", "polite"); // readout announces the new tier for AT users
  const plus = document.createElement("button");
  plus.type = "button";
  plus.id = "typo-font-plus";
  plus.className = "typo-step";
  plus.textContent = "+";
  plus.setAttribute("aria-label", t("typoFontLarger"));
  plus.title = t("typoFontLarger");
  plus.addEventListener("click", () => { if (plus.getAttribute("aria-disabled") !== "true") _pbpTypoSet(_pbpTypoFont + 1, _pbpTypoLeading); });
  steps.appendChild(minus);
  steps.appendChild(val);
  steps.appendChild(plus);
  fontRow.appendChild(steps);
  pop.appendChild(fontRow);

  const leadRow = document.createElement("div");
  leadRow.className = "typo-row";
  const leadLabel = document.createElement("span");
  leadLabel.className = "typo-label";
  leadLabel.textContent = t("typoLeadingLabel");
  leadRow.appendChild(leadLabel);
  const seg = document.createElement("div");
  seg.className = "typo-seg";
  seg.setAttribute("role", "group");
  seg.setAttribute("aria-label", t("typoLeadingLabel"));
  [[-1, "typoLeadingCompact"], [0, "typoLeadingNormal"], [1, "typoLeadingRelaxed"]].forEach(([tier, key]) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "typo-seg-btn";
    b.dataset.tier = String(tier);
    b.textContent = t(key);
    b.addEventListener("click", () => _pbpTypoSet(_pbpTypoFont, tier));
    seg.appendChild(b);
  });
  leadRow.appendChild(seg);
  pop.appendChild(leadRow);

  // Third row (theme model 2026-08-25): the reader's per-device light/dark
  // override -- Follow (the global Theme, plus the video-page default) /
  // Light / Dark. Same three-way segment family as line spacing; the value
  // lives in md-preview.js (pbpReaderSchemeGet/Set), which persists it as
  // pbp_color_scheme next to the typography tiers.
  const schemeRow = document.createElement("div");
  schemeRow.className = "typo-row";
  const schemeLabel = document.createElement("span");
  schemeLabel.className = "typo-label";
  schemeLabel.textContent = t("typoSchemeLabel");
  schemeRow.appendChild(schemeLabel);
  const schemeSeg = document.createElement("div");
  schemeSeg.className = "typo-seg";
  schemeSeg.setAttribute("role", "group");
  schemeSeg.setAttribute("aria-label", t("typoSchemeLabel"));
  [["auto", "typoSchemeAuto"], ["light", "typoSchemeLight"], ["dark", "typoSchemeDark"]].forEach(([mode, key]) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "typo-seg-btn";
    b.dataset.scheme = mode;
    b.textContent = t(key);
    b.addEventListener("click", () => {
      if (typeof window.pbpReaderSchemeSet === "function") window.pbpReaderSchemeSet(mode);
      _pbpTypoSyncPop();
    });
    schemeSeg.appendChild(b);
  });
  schemeRow.appendChild(schemeSeg);
  pop.appendChild(schemeRow);

  document.body.appendChild(pop);
  _pbpTypoPopEl = pop;
  return pop;
}

// Open next to whichever "Aa" was clicked -- same mutual exclusion +
// measure-then-place flow as _pbpFnOpenPop; clicking the same entry again
// closes (toggle).
function _pbpTypoToggle(anchorEl) {
  const pop = _pbpTypoEnsurePop();
  if (pop.matches(":popover-open")) { try { pop.hidePopover(); } catch (_) {} return; }
  _pbpReaderHideOtherPopovers(pop);
  _pbpTypoSyncPop();
  const rect = anchorEl.getBoundingClientRect();
  pop.showPopover();
  pop.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - pop.offsetWidth - 8)) + "px";
  const pos = (typeof pbpTrPeekPopPos === "function")
    ? pbpTrPeekPopPos(rect, pop.offsetHeight, window.innerHeight)
    : { top: rect.bottom + 8 };
  pop.style.top = pos.top + "px";
}

function _pbpTypoInit() {
  if (_pbpTypoInited) return;
  _pbpTypoInited = true;
  const stored = (typeof window !== "undefined" && window._pbpTypoStored) || null;
  if (stored) {
    // md-preview.js already read + applied these before the first render;
    // this is just the in-memory mirror for the panel.
    const t2 = pbpTypoSanitize(stored.font, stored.leading);
    _pbpTypoFont = t2.font;
    _pbpTypoLeading = t2.leading;
  } else if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
    // Fallback (md-preview.js init died before its storage read): own async
    // load with the same touched-guard as _pbpZenLoadWidth.
    try {
      chrome.storage.local.get({ pbp_font_tier: 0, pbp_leading_tier: 0 }, (res) => {
        if (_pbpTypoTouched) return;
        const t2 = pbpTypoApplyVars(res && res.pbp_font_tier, res && res.pbp_leading_tier);
        _pbpTypoFont = t2.font;
        _pbpTypoLeading = t2.leading;
        _pbpTypoSyncPop();
      });
    } catch (_) {}
  }
  const row = _pbpRailBottomRow();
  if (row) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "rail-typo-btn";
    btn.className = "rail-kbd-help-btn"; // same rail-bottom text-button family as its neighbors
    btn.textContent = "Aa";
    btn.setAttribute("aria-label", t("typoPanelAria"));
    btn.title = t("typoPanelAria");
    btn.addEventListener("click", () => _pbpTypoToggle(btn));
    row.appendChild(btn);
  }
}

// ---- bootstrap: ONE shared "pbp:rendered" listener for every
// md-reader.js feature (spec sec.8: R3 footnotes / R4 search / "?"
// keyboard help all live in this one file). Later tasks extend this
// SAME block by adding one more try-wrapped init call each -- never
// register a second "pbp:rendered" listener here. Each call is
// independently try/catched so one feature's init failure can never
// block a sibling feature's init. Same once-listener idiom as
// md-highlight.js / md-ask.js / md-translate.js; the test harness loads
// this file on file:// and never dispatches "pbp:rendered", so this
// registration is inert there. ----
// Code-block copy button (Feather copy). Injected at runtime, never by the
// renderer: exports rebuild their DOM from markdown via renderMarkdown, so
// the button can't leak into .md/.html/EPUB output. Persistent, not
// hover-revealed (reader ban on hover-triggered chrome); the .btn-label span
// is what flashButtonLabel writes into, so the SVG survives the "copied"
// flash.
// Alias of the shared copy icon (was a hand-copied Feather twin of it).
const PBP_COPY_CODE_SVG = typeof PBP_ICONS !== "undefined" ? PBP_ICONS.copy : "";
function _pbpCopyCodeInject() {
  const view = document.getElementById("rendered-view");
  if (!view) return;
  for (const pre of view.querySelectorAll("pre")) {
    if (pre.querySelector(".pb-copy-code")) continue;
    const code = pre.querySelector("code");
    if (!code || !code.textContent.trim()) continue;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pb-copy-code";
    btn.title = t("mdCopyCode");
    btn.setAttribute("aria-label", t("mdCopyCode"));
    btn.innerHTML = PBP_COPY_CODE_SVG; // static constant, never page content
    const label = document.createElement("span");
    label.className = "btn-label";
    btn.appendChild(label);
    btn.addEventListener("click", () => {
      // copyToClipboard (md-preview.js) flashes the label and announces via
      // #copy-status; reading textContent here keeps hljs spans out.
      copyToClipboard(code.textContent, btn);
    });
    pre.appendChild(btn);
  }
}
function _pbpCopyCodeInit() {
  _pbpCopyCodeInject();
  // Re-renders (engine switch) replace #rendered-view wholesale; re-inject.
  document.addEventListener("pbp:rendered", _pbpCopyCodeInject);
}

// ---- In-place article replacement (video track switch / AI punctuation /
// first-authorization promotion). md-preview.js replaces #rendered-view's
// CHILDREN and brackets the swap with pbp:article-will-replace /
// pbp:article-replaced, sharing ONE frozen detail (never mutate it).
//
// Everything one-shot in this file stays exactly as it is, by design rather
// than by omission: the keyboard, zen and typography handlers are
// document-level; the footnote click handler and the search observer hang off
// #rendered-view ITSELF, which survives the swap (only its children are
// replaced), and the search observer already treats a root-level child swap as
// its rescan trigger. Only two things in here are per-ARTICLE.
function _pbpReaderOnArticleWillReplace() {
  if (!_pbpFnPop) return;
  // The popover body is a CLONE of a definition <li> from the article being
  // replaced, and its jump button scrolls to _pbpFnCurrentLi -- about to be a
  // detached node, i.e. a scroll to nowhere plus a flash on an element that is
  // no longer in the document.
  try { _pbpFnPop.hidePopover(); } catch (_) {}
  _pbpFnCurrentLi = null;
}

function _pbpReaderOnArticleReplaced() {
  // The buttons lived inside the article, so the swap took them with it.
  // Injection is idempotent per <pre> (it skips one that already has a
  // .pb-copy-code), which is what makes this safe to call after a swap that
  // completed, half-completed, or threw.
  try { _pbpCopyCodeInject(); } catch (_) {}
}

if (typeof document !== "undefined") {
  document.addEventListener("pbp:rendered", () => {
    try { _pbpFnInit(); } catch (_) {}
    try { _pbpSearchInit(); } catch (_) {}
    try { _pbpKbdHelpInit(); } catch (_) {}
    try { _pbpZenInit(); } catch (_) {}
    try { _pbpTypoInit(); } catch (_) {}
    try { _pbpCopyCodeInit(); } catch (_) {}
  }, { once: true });
  // Deliberately NOT {once:true}: one page life can see any number of
  // replacements (track switch, AI punctuation, promotion).
  document.addEventListener("pbp:article-will-replace", _pbpReaderOnArticleWillReplace);
  document.addEventListener("pbp:article-replaced", _pbpReaderOnArticleReplaced);
}
