// Notes view for the library page — migrated from options-notes.js.

// ---- Pure layer (no DOM/chrome/fetch) -- loadable standalone from
// tests/options-notes-tests.html. Signatures below are frozen (spec section 3).

// pbpEntryBytes lives in shared.js; typeof-guarded so this section stays
// loadable without shared.js in the test page. The fallback mirrors
// shared.js's own byte estimate exactly, so behavior is identical whether or
// not shared.js is also loaded.
function _pbpNotesEntryBytes(key, rec) {
  if (typeof pbpEntryBytes === "function") return pbpEntryBytes(key, rec);
  try { return key.length + JSON.stringify(rec).length; } catch (_) { return key.length; }
}

// Builds the summary row model for one pbp_hl_* storage entry, or null for
// a malformed record (spec 6.1: bad records are skipped, never thrown).
function pbpNotesRow(key, rec) {
  if (!rec || typeof rec !== "object" || !Array.isArray(rec.items)) return null;
  let noteCount = 0;
  let lastTs = 0;
  for (const it of rec.items) {
    if (it && typeof it === "object") {
      if (typeof it.note === "string" && it.note.trim()) noteCount++;
      if (typeof it.ts === "number" && it.ts > lastTs) lastTs = it.ts;
    }
  }
  return {
    key,
    url: typeof rec.url === "string" ? rec.url : "",
    title: typeof rec.title === "string" ? rec.title : "",
    hlCount: rec.items.length,
    noteCount,
    lastTs,
    bytes: _pbpNotesEntryBytes(key, rec),
  };
}

// Case-insensitive substring match across title/url/quote/note. Empty/blank
// query always matches (spec 3). Operates on the raw rec (not the row model)
// so it sees every item's quote/note directly.
function pbpNotesMatch(rec, q) {
  const query = (typeof q === "string" ? q : "").trim().toLowerCase();
  if (!query) return true;
  if (!rec || typeof rec !== "object") return false;
  const title = typeof rec.title === "string" ? rec.title : "";
  const url = typeof rec.url === "string" ? rec.url : "";
  if (title.toLowerCase().includes(query) || url.toLowerCase().includes(query)) return true;
  const items = Array.isArray(rec.items) ? rec.items : [];
  for (const it of items) {
    if (!it || typeof it !== "object") continue;
    const quote = typeof it.quote === "string" ? it.quote : "";
    const note = typeof it.note === "string" ? it.note : "";
    if (quote.toLowerCase().includes(query) || note.toLowerCase().includes(query)) return true;
  }
  return false;
}

function pbpNotesEntryHasColor(rec, colorSet) {
  if (!colorSet || !colorSet.size) return true;
  if ([1, 2, 3, 4, 5].every((c) => colorSet.has(c))) return true;
  const items = rec && Array.isArray(rec.items) ? rec.items : [];
  return items.some((it) => {
    if (!it || typeof it !== "object") return false;
    const c = Number(it.color);
    return colorSet.has(c >= 1 && c <= 5 ? c : 1);
  });
}

// ============================================================
// Render / interaction layer (DOM + chrome.storage). Invoked by the
// pbp-lib-view mount below on every "notes" view activation -- same
// no-guard, rescan-every-time pattern as renderStoragePanel() in options.js
// (a fresh chrome.storage.local.get(null) scan per activation; the data set
// is small enough that this is cheap).
//
// Master-detail (2026-08): the left pane lists ONE ROW PER HIGHLIGHT, the
// right pane reads the selected one. Storage is untouched -- it still holds
// one pbp_hl_<page> record with an items[] array -- so the flattening into
// per-highlight rows lives here, in the view, and the pure layer above keeps
// its frozen article-level signatures.
// ============================================================

const PBP_NOTES_COLORS = [1, 2, 3, 4, 5];
const PBP_NOTES_COLOR_KEYS = ["hlColorQuote", "hlColorDefinition", "hlColorExample", "hlColorDoubt", "hlColorTodo"];
let _notesAllRows = []; // [{ row, rec }], last full scan, sorted lastTs desc
let _notesActiveColors = new Set(PBP_NOTES_COLORS);
// The highlight the detail pane is reading, as "<storage key>#<item id>".
// Same job _pbpVocabDetailWordId does for the vocabulary view: it outlives
// every rebuild, so a rescan can put the selection back where it was.
let _pbpNotesSelectedKey = null;

async function _pbpNotesScan() {
  if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) return [];
  let all;
  try { all = await chrome.storage.local.get(null); } catch (_) { return []; }
  const rows = [];
  for (const key of Object.keys(all || {})) {
    if (!key.startsWith("pbp_hl_") || key === "pbp_hl_last_color") continue;
    const row = pbpNotesRow(key, all[key]);
    if (row) rows.push({ row, rec: all[key] });
  }
  rows.sort((a, b) => b.row.lastTs - a.row.lastTs);
  return rows;
}

function _pbpNotesFormatDate(ts) {
  if (!ts) return "";
  try { return new Date(ts).toLocaleDateString(); } catch (_) { return ""; }
}

function _pbpNotesColorOf(it) {
  const c = Number(it && it.color);
  return c >= 1 && c <= 5 ? c : 1;
}

// Stable per-row identity: the page's storage key plus the highlight's own id.
// Everything that has to survive a rebuild (selection, aria-current, the
// refresh restore) matches on this string, never on DOM position.
function _pbpNotesHitKey(key, it, idx) {
  return key + "#" + (it && it.id != null ? String(it.id) : "i" + idx);
}

// The whole scan, flattened to one entry per highlight, newest first. Sorting
// by the highlight's own ts (not the page's last-active) is what makes the
// list read as "what did I mark recently" across pages.
function _pbpNotesHits() {
  const hits = [];
  for (const { row, rec } of _notesAllRows) {
    const items = Array.isArray(rec.items) ? rec.items : [];
    items.forEach((it, idx) => {
      if (!it || typeof it !== "object") return;
      hits.push({
        key: _pbpNotesHitKey(row.key, it, idx),
        row,
        rec,
        item: it,
        ts: typeof it.ts === "number" ? it.ts : row.lastTs,
      });
    });
  }
  hits.sort((a, b) => b.ts - a.ts);
  return hits;
}

// Per-highlight filtering that REUSES the frozen article-level predicates on a
// one-item view of the record: pbpNotesMatch's "page title/url matches, or any
// item does" and pbpNotesEntryHasColor's "any item is in the set" both collapse
// to exactly the per-highlight question when items is [this one]. No second
// copy of either rule, and a title match still surfaces the page's highlights.
function _pbpNotesVisibleHits() {
  const filterInput = $id("notes-filter");
  const q = filterInput ? filterInput.value : "";
  return _pbpNotesHits().filter((hit) => {
    const one = { title: hit.row.title, url: hit.row.url, items: [hit.item] };
    return pbpNotesMatch(one, q) && pbpNotesEntryHasColor(one, _notesActiveColors);
  });
}

// Lookup over ALL hits, not just the visible ones: the detail pane's
// same-page section can hand back a highlight the current filter hides.
function _pbpNotesFindHit(key) {
  return key ? _pbpNotesHits().find((hit) => hit.key === key) || null : null;
}

function _pbpNotesHostname(url) {
  try { return new URL(String(url || "")).hostname; } catch (_) { return ""; }
}

// Split `text` around case-insensitive matches of `query`; matches render in
// <mark>. Appends, so one host can carry quote + note. Twin of
// library-vocab.js's _pbpVocabHighlightTerm (same shape, different needle
// source) -- textContent-only construction, never innerHTML with stored text.
function _pbpNotesMarkText(host, text, query) {
  const value = text == null ? "" : String(text);
  const needle = (query || "").trim().toLowerCase();
  if (!needle) { host.appendChild(document.createTextNode(value)); return; }
  const lower = value.toLowerCase();
  let idx = 0, pos = lower.indexOf(needle);
  while (pos !== -1) {
    host.appendChild(document.createTextNode(value.slice(idx, pos)));
    const mark = document.createElement("mark");
    mark.textContent = value.slice(pos, pos + needle.length);
    host.appendChild(mark);
    idx = pos + needle.length;
    pos = lower.indexOf(needle, idx);
  }
  host.appendChild(document.createTextNode(value.slice(idx)));
}

function _pbpNotesFilterQuery() {
  const filterInput = $id("notes-filter");
  return filterInput ? filterInput.value : "";
}

// Compact left row: colour bar, two clamped lines of highlight (with the note
// trailing inline in italics), then host + date. No inline delete -- the one
// destructive action lives in the detail pane, where its scope is spelled out.
function _pbpNotesBuildRow(hit) {
  const rowEl = document.createElement("div");
  rowEl.className = "notes-hit";
  rowEl.setAttribute("role", "listitem");
  rowEl.dataset.notesKey = hit.key;

  // The row content is a button so the list stays keyboard-reachable, same
  // shape the vocabulary list uses (card > head button).
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "notes-hit-btn";

  const bar = document.createElement("span");
  bar.className = "notes-hit-bar notes-c" + _pbpNotesColorOf(hit.item);
  bar.setAttribute("aria-hidden", "true");
  btn.appendChild(bar);

  const body = document.createElement("span");
  body.className = "notes-hit-body";

  const q = _pbpNotesFilterQuery();
  const text = document.createElement("span");
  text.className = "notes-hit-text";
  _pbpNotesMarkText(text, typeof hit.item.quote === "string" ? hit.item.quote : "", q);
  const note = typeof hit.item.note === "string" ? hit.item.note : "";
  if (note.trim()) {
    // Explicit separator, not just the italic style: the two run together in
    // the accessible name (and in any copy of the row) without it.
    text.appendChild(document.createTextNode(" — "));
    const noteEl = document.createElement("span");
    noteEl.className = "notes-hit-note";
    _pbpNotesMarkText(noteEl, note, q);
    text.appendChild(noteEl);
  }
  body.appendChild(text);

  const meta = document.createElement("span");
  meta.className = "notes-hit-meta";
  const site = document.createElement("span");
  site.className = "notes-meta-chip";
  site.textContent = _pbpNotesHostname(hit.row.url) || t("notesUnknownPage");
  meta.appendChild(site);
  const dateText = _pbpNotesFormatDate(hit.ts);
  if (dateText) {
    const dateSpan = document.createElement("span");
    dateSpan.className = "notes-meta-chip";
    dateSpan.textContent = dateText;
    dateSpan.title = t("notesColLastActive");
    meta.appendChild(dateSpan);
  }
  body.appendChild(meta);

  btn.appendChild(body);
  btn.addEventListener("click", () => _pbpNotesSelectRow(hit.key));
  rowEl.appendChild(btn);
  return rowEl;
}

function _pbpNotesRowEl(key) {
  if (!key) return null;
  for (const el of document.querySelectorAll("#notes-list .notes-hit")) {
    if (el.dataset.notesKey === key) return el;
  }
  return null;
}

// Exactly one row carries aria-current (the vocabulary list's rule), and the
// marker is re-derived from _pbpNotesSelectedKey after every rebuild.
function _pbpNotesMarkCurrentRow() {
  document.querySelectorAll("#notes-list .notes-hit[aria-current]")
    .forEach((el) => el.removeAttribute("aria-current"));
  const el = _pbpNotesRowEl(_pbpNotesSelectedKey);
  if (el) el.setAttribute("aria-current", "true");
}

function _pbpNotesSelectRow(key) {
  const hit = _pbpNotesFindHit(key);
  if (!hit) return;
  _pbpNotesSelectedKey = key;
  _pbpNotesMarkCurrentRow();
  _pbpNotesRenderDetail(hit, true);
}

// Narrow (single-pane) mode. Mirrors library.css's 860px threshold -- the CSS
// is the source of truth; this is the same number, not a second layout rule.
// Local twin of library-vocab.js's _pbpVocabNarrowMode: the two views own
// separate body classes on purpose, so neither can strand the other's pane.
function _pbpNotesNarrowMode() {
  return typeof matchMedia === "function" && matchMedia("(max-width: 860px)").matches;
}

// Focus one element, reporting whether it actually took: focus() on a
// display:none element (the back button above 860px) is a silent no-op, and
// every caller here needs to fall through to its next candidate when that
// happens.
function _pbpNotesFocus(el) {
  if (!el) return false;
  try { el.focus({ preventScroll: true }); } catch (_) { el.focus(); }
  return document.activeElement === el;
}

// Twin of library-vocab.js's _pbpVocabFocusNarrowBack, kept local rather than
// shared because it queries this view's own back button: entering the detail
// in narrow mode hides the list INCLUDING the row button focus came from, and
// Chrome then drops focus to <body> with no keyboard route back.
function _pbpNotesFocusNarrowBack(host) {
  if (!host || !_pbpNotesNarrowMode()) return;
  _pbpNotesFocus(host.querySelector(".notes-detail-back"));
}

function _pbpNotesBuildBackBtn() {
  const back = document.createElement("button");
  back.type = "button";
  back.className = "btn btn-sm notes-detail-back";
  // cross, like the vocabulary pane's back control: closing the detail IS the
  // gesture, and the icon registry has no arrowLeft.
  setBtnIcon(back, "cross", t("libraryBack"));
  back.addEventListener("click", () => _pbpNotesRenderDetail(null));
  return back;
}

// Reading pane for one highlight, or the empty state for null (nothing
// selected, selection deleted, back button). `enterNarrow` is opt-in exactly
// as in library-vocab.js: only a user activation may swap narrow mode from the
// list to the detail, so a background refresh never yanks a narrow reader.
function _pbpNotesRenderDetail(hit, enterNarrow) {
  const empty = $id("notes-detail-empty");
  const detail = $id("notes-detail");
  if (!empty || !detail) return;
  empty.hidden = !!hit;
  detail.hidden = !hit;
  if (!hit) {
    _pbpNotesSelectedKey = null;
    document.body.classList.remove("lib-narrow-notes");
    detail.replaceChildren();
    _pbpNotesMarkCurrentRow();
    return;
  }
  if (enterNarrow) document.body.classList.add("lib-narrow-notes");

  const q = _pbpNotesFilterQuery();
  const frag = document.createDocumentFragment();

  // 0. Back button (narrow mode only -- CSS decides, see .notes-detail-back)
  frag.appendChild(_pbpNotesBuildBackBtn());

  // 1. Source line: page title (linked when the url is safe) + date + language
  const head = document.createElement("div");
  head.className = "notes-detail-head";
  const href = typeof pbpDictSafeUrl === "function" ? pbpDictSafeUrl(hit.row.url) : "";
  const label = hit.row.title || _pbpNotesHostname(hit.row.url) || t("notesUnknownPage");
  if (href) {
    const link = document.createElement("a");
    link.className = "notes-detail-source";
    link.href = href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = label;
    head.appendChild(link);
  } else {
    const plain = document.createElement("span");
    plain.className = "notes-detail-source";
    plain.textContent = label;
    head.appendChild(plain);
  }
  const dateText = _pbpNotesFormatDate(hit.ts);
  if (dateText) {
    const dateSpan = document.createElement("span");
    dateSpan.className = "notes-meta-chip";
    dateSpan.textContent = dateText;
    head.appendChild(dateSpan);
  }
  if (hit.item.side === "tr" && hit.item.lang) {
    const langSpan = document.createElement("span");
    langSpan.className = "notes-meta-chip";
    langSpan.textContent = String(hit.item.lang);
    head.appendChild(langSpan);
  }
  frag.appendChild(head);

  // 2. The highlight itself, in full
  const quote = document.createElement("blockquote");
  quote.className = "notes-detail-quote notes-c" + _pbpNotesColorOf(hit.item);
  _pbpNotesMarkText(quote, typeof hit.item.quote === "string" ? hit.item.quote : "", q);
  frag.appendChild(quote);

  // 3. Note, in full (the reader's Notebook still owns editing it)
  const note = typeof hit.item.note === "string" ? hit.item.note : "";
  if (note.trim()) {
    const noteEl = document.createElement("p");
    noteEl.className = "notes-detail-note";
    _pbpNotesMarkText(noteEl, note, q);
    frag.appendChild(noteEl);
  }

  if (!hit.row.url) {
    const hint = document.createElement("p");
    hint.className = "notes-unknown-hint";
    hint.textContent = t("notesUnknownHint");
    frag.appendChild(hint);
  }

  // 4. Delete. Scope is the PAGE's record (the only unit storage has, and the
  // unit the reader writes) -- the confirm popover names that page before
  // anything is removed, which is where the scope is disclosed.
  const del = document.createElement("button");
  del.type = "button";
  del.className = "btn btn-sm danger ghost notes-detail-delete";
  setBtnIcon(del, "trash", t("notesDeleteBtn"));
  del.addEventListener("click", () => _pbpNotesDelete(hit.row, del));
  frag.appendChild(del);

  // 5. The rest of this page's highlights, as a jump list
  const siblings = _pbpNotesHits().filter((h) => h.row.key === hit.row.key && h.key !== hit.key);
  if (siblings.length) {
    const section = document.createElement("section");
    section.className = "notes-detail-siblings";
    const title = document.createElement("h2");
    title.className = "notes-detail-sib-title";
    title.textContent = t("hlSectionTitle");
    section.appendChild(title);
    for (const sib of siblings) {
      const sibBtn = document.createElement("button");
      sibBtn.type = "button";
      sibBtn.className = "notes-sib";
      sibBtn.dataset.notesKey = sib.key;
      const dot = document.createElement("span");
      dot.className = "note-dot c" + _pbpNotesColorOf(sib.item);
      dot.setAttribute("aria-hidden", "true");
      sibBtn.appendChild(dot);
      const sibText = document.createElement("span");
      sibText.className = "notes-sib-text";
      sibText.textContent = typeof sib.item.quote === "string" ? sib.item.quote : "";
      sibBtn.appendChild(sibText);
      sibBtn.addEventListener("click", () => _pbpNotesSelectRow(sib.key));
      section.appendChild(sibBtn);
    }
    frag.appendChild(section);
  }

  detail.replaceChildren(frag);
  if (enterNarrow) _pbpNotesFocusNarrowBack(detail);
}

function _pbpNotesRenderToolbar(total, visible) {
  const count = $id("notes-count");
  if (count) count.textContent = String(visible) + " / " + String(total);
}

function _pbpNotesBuildColorFilters() {
  const wrap = $id("notes-color-filters");
  if (!wrap || wrap.dataset.ready) return;
  wrap.dataset.ready = "1";
  PBP_NOTES_COLORS.forEach((c, idx) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "notes-filter-dot";
    b.setAttribute("aria-pressed", "true");
    b.setAttribute("aria-label", t(PBP_NOTES_COLOR_KEYS[idx]));
    const dot = document.createElement("span");
    dot.className = "note-dot c" + c;
    dot.setAttribute("aria-hidden", "true");
    b.appendChild(dot);
    b.addEventListener("click", () => {
      if (_notesActiveColors.has(c) && _notesActiveColors.size > 1) _notesActiveColors.delete(c);
      else _notesActiveColors.add(c);
      b.setAttribute("aria-pressed", _notesActiveColors.has(c) ? "true" : "false");
      _pbpNotesRenderList(_pbpNotesVisibleHits());
    });
    wrap.appendChild(b);
  });
}

function _pbpNotesRenderList(hits) {
  const list = $id("notes-list");
  if (!list) return;
  const total = _pbpNotesHits().length;
  _pbpNotesRenderToolbar(total, hits.length);
  list.replaceChildren();
  // The empty state is a SIBLING of the list, never a child: #notes-list is
  // role="list", whose only valid children are listitems (same placement the
  // vocabulary view uses for #vocab-empty / #vocab-no-results).
  const empty = $id("notes-empty");
  if (empty) {
    empty.hidden = hits.length > 0;
    if (!hits.length) empty.textContent = total ? t("notesFilterEmpty") : t("notesEmpty");
  }
  if (!hits.length) return;
  const frag = document.createDocumentFragment();
  hits.forEach((hit) => frag.appendChild(_pbpNotesBuildRow(hit)));
  list.appendChild(frag);
  // A rebuild drops the marker even though the detail pane still reads that
  // highlight -- re-derive it from the surviving selection key.
  _pbpNotesMarkCurrentRow();
}

// Same anchored confirm popover as every other destructive micro-action
// (theme delete, tab reset, offline-queue remove) — never window.confirm.
// showConfirmPopover lives in shared.js, which the standalone test page does
// not load; that is fine because the tests exercise only the pure layer and
// never invoke this handler.
function _pbpNotesDelete(row, anchor) {
  const label = row.title || row.url || t("notesUnknownPage");
  showConfirmPopover(anchor, {
    msg: t("notesDeleteConfirm", label),
    yesText: t("delete"),
    noText: t("cancel"),
    onConfirm: async () => {
      // Where the selected row sat, so focus can land on its successor once
      // the list is rebuilt (the confirm popover restored focus to the delete
      // button, which the rebuild removes -- otherwise focus falls to <body>).
      const position = Math.max(0, _pbpNotesVisibleHits().findIndex((h) => h.key === _pbpNotesSelectedKey));
      try {
        await chrome.storage.local.remove(row.key);
      } catch (e) {
        // A swallowed failure looked identical to success (popover closed,
        // row still there, zero feedback). Pin it to the row it happened on
        // and leave a trace -- name/message only, never note content.
        console.warn("[notes] delete failed", e && e.name, e && e.message);
        const rowEl = _pbpNotesRowEl(_pbpNotesSelectedKey);
        // The row can be filtered out (or scrolled away) while its detail is
        // open, and a signal nobody can see is no signal -- fall back to the
        // button the user actually pressed.
        if (rowEl) rowEl.classList.add("is-error");
        else if (anchor) anchor.classList.add("is-error");
        return;
      }
      _notesAllRows = _notesAllRows.filter((e) => e.row.key !== row.key);
      // The detail was reading one of the highlights that just went away.
      if (_pbpNotesSelectedKey && _pbpNotesSelectedKey.startsWith(row.key + "#")) _pbpNotesRenderDetail(null);
      _pbpNotesRenderList(_pbpNotesVisibleHits());
      _pbpNotesFocusAfterDelete(position);
    },
  });
}

// Nearest surviving row, else the filter input -- the vocabulary list's
// _pbpVocabFocusStable with one extra step, because notes rows are the only
// thing between the toolbar and the bottom of the pane.
function _pbpNotesFocusAfterDelete(position) {
  const list = $id("notes-list");
  const rows = list ? [...list.querySelectorAll(".notes-hit-btn")] : [];
  const target = rows.length ? rows[Math.min(position, rows.length - 1)] : $id("notes-filter");
  if (!target || target.closest("[hidden], [inert]")) return;
  _pbpNotesFocus(target);
}

// Called from the pbp-lib-view mount below on every "notes" view activation.
// Re-scans storage every activation (no "already inited" guard), matching
// renderStoragePanel()'s convention.
async function renderNotesPanel() {
  if (!$id("notes-list")) return;
  _pbpNotesBuildColorFilters();
  _notesAllRows = await _pbpNotesScan();
  _pbpNotesRenderList(_pbpNotesVisibleHits());
}

// The filter input is static markup (never recreated), so bind its listener
// once at script-load time rather than re-binding inside renderNotesPanel on
// every tab activation (same one-time-bind convention options.js uses for
// storage-clear-btn). Guarded on `$id` existing: this whole file is also
// loaded standalone by tests/options-notes-tests.html, which exercises only
// the pure layer above and never loads shared.js -- without this guard the
// bootstrap would throw ReferenceError: $id is not defined and fail that
// test's page-error check even though every assertion still passes (dry-run
// confirmed this exact failure mode before the guard was added, and confirmed
// 0 page errors after).
if (typeof $id === "function") {
  const _notesFilterInput = $id("notes-filter");
  if (_notesFilterInput) {
    _notesFilterInput.addEventListener("input", () => {
      _pbpNotesBuildColorFilters();
      _pbpNotesRenderList(_pbpNotesVisibleHits());
    });
  }
}

// Re-scan and re-render without throwing away what the user was reading.
// Every activation re-reads storage and rebuilds every row, so the selected
// highlight (and the scroll position that put it on screen) would otherwise
// be lost on a plain alt-tab back to this page. No `enterNarrow` on the
// re-render: a refresh must never swap a narrow reader's pane.
async function _pbpNotesRefreshPreservingState() {
  const selected = _pbpNotesSelectedKey;
  const scroll = window.scrollY;
  // Keyboard focus lives on a row button or on a control inside the detail,
  // and the rebuild replaces both -- every delete triggers this refresh 250ms
  // later through its own storage write, so without this the focus
  // _pbpNotesFocusAfterDelete just placed falls to <body> a quarter second
  // later (measured on the real page). In narrow mode that is a dead end: the
  // list is display:none, so there is nothing left to Tab to. Snapshot the row
  // by key, and the detail control by its own class (the detail's controls are
  // all built here, one specific class each, last in the list).
  const active = document.activeElement;
  const focusedRow = active && active.closest ? active.closest("#notes-list .notes-hit") : null;
  const focusedKey = focusedRow ? focusedRow.dataset.notesKey : null;
  const inDetail = !focusedRow && active && active.closest && active.closest("#notes-detail");
  const detailClass = inDetail && active.classList.length
    ? active.classList[active.classList.length - 1] : null;
  await renderNotesPanel();
  const hit = _pbpNotesFindHit(selected);
  if (hit) {
    _pbpNotesSelectedKey = selected;
    _pbpNotesMarkCurrentRow();
    _pbpNotesRenderDetail(hit);
  } else {
    _pbpNotesRenderDetail(null);
  }
  const refocus = focusedKey && _pbpNotesRowEl(focusedKey);
  if (refocus) _pbpNotesFocus(refocus.querySelector(".notes-hit-btn"));
  else if (detailClass) {
    // The equivalent control in the rebuilt detail, else the back button --
    // which is the one control that always exists and, in narrow mode, the
    // only way back to the list. (_pbpNotesFocus reports a no-op focus, so a
    // control the rebuild dropped falls through.)
    const host = $id("notes-detail");
    const same = host && !host.hidden ? host.querySelector("." + CSS.escape(detailClass)) : null;
    if (!_pbpNotesFocus(same) && host) _pbpNotesFocus(host.querySelector(".notes-detail-back"));
  }
  if (scroll) window.scrollTo(0, scroll);
}

// Library page mount: render on first show and on every re-show/visibility
// return (the event carries the target view).
document.addEventListener("pbp-lib-view", (e) => {
  if (e.detail.view !== "notes") return;
  _pbpNotesRefreshPreservingState();
});

// Highlights and notes are written by the reader in another tab. This page
// keeps its rendered list while the vocabulary view is on screen, so a write
// that lands now is only picked up on the next activation -- refresh the
// visible list immediately instead. Hidden is already covered: activation
// and visibilitychange both re-scan.
//
// Trailing-debounced: highlighting a passage writes the whole pbp_hl_ record
// per stroke, and each refresh is a full storage scan plus a full rebuild of
// every card. Expansion and scroll survive it either way -- both are captured
// inside _pbpNotesRefreshPreservingState when the timer fires, off the live
// DOM that nothing has rebuilt in the meantime. Visibility is re-checked
// there too: the user may have left for the vocabulary view mid-burst, and
// that view's own activation will re-scan on the way back.
let _notesHlRefreshTimer = 0;
if (typeof $id === "function" && typeof chrome !== "undefined" && chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (!Object.keys(changes).some((key) => key.startsWith("pbp_hl_") && key !== "pbp_hl_last_color")) return;
    clearTimeout(_notesHlRefreshTimer);
    _notesHlRefreshTimer = setTimeout(() => {
      const view = $id("view-notes");
      if (!view || view.hidden) return;
      _pbpNotesRefreshPreservingState();
    }, 250);
  });
}
