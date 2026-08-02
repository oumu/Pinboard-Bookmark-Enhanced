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
// ============================================================

const PBP_NOTES_COLORS = [1, 2, 3, 4, 5];
const PBP_NOTES_COLOR_KEYS = ["hlColorQuote", "hlColorDefinition", "hlColorExample", "hlColorDoubt", "hlColorTodo"];
let _notesAllRows = []; // [{ row, rec }], last full scan, sorted lastTs desc
let _notesActiveColors = new Set(PBP_NOTES_COLORS);

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

function _pbpNotesVisibleEntries() {
  const filterInput = $id("notes-filter");
  const q = filterInput ? filterInput.value : "";
  return _notesAllRows.filter((e) => pbpNotesMatch(e.rec, q) && pbpNotesEntryHasColor(e.rec, _notesActiveColors));
}

function _pbpNotesBuildItem(it) {
  const itemEl = document.createElement("div");
  itemEl.className = "notes-item";

  const dot = document.createElement("span");
  const color = Number(it && it.color);
  dot.className = "note-dot c" + (color >= 1 && color <= 5 ? color : 1);
  itemEl.appendChild(dot);

  const textEl = document.createElement("div");
  textEl.className = "notes-item-text";

  const quote = typeof it.quote === "string" ? it.quote : "";
  const quoteEl = document.createElement("div");
  quoteEl.className = "notes-item-quote";
  quoteEl.textContent = quote.length > 220 ? quote.slice(0, 220) + "\u2026" : quote;
  textEl.appendChild(quoteEl);

  if (it.side === "tr" && it.lang) {
    const langEl = document.createElement("span");
    langEl.className = "notes-item-lang";
    langEl.textContent = String(it.lang);
    textEl.appendChild(langEl);
  }

  const note = typeof it.note === "string" ? it.note : "";
  if (note.trim()) {
    const noteEl = document.createElement("div");
    noteEl.className = "notes-item-note";
    noteEl.textContent = note;
    textEl.appendChild(noteEl);
  }

  itemEl.appendChild(textEl);
  return itemEl;
}

function _pbpNotesBuildRow(entry) {
  const { row, rec } = entry;
  const card = document.createElement("article");
  card.className = "notes-card";

  const top = document.createElement("div");
  top.className = "notes-card-top";

  const bodyId = "notes-card-body-" + row.key.replace(/[^a-zA-Z0-9_-]/g, "_");
  const head = document.createElement("button");
  head.type = "button";
  head.className = "notes-card-head";
  head.setAttribute("aria-expanded", "false");
  head.setAttribute("aria-controls", bodyId);

  const chev = document.createElement("span");
  chev.className = "notes-card-chevron";
  chev.setAttribute("aria-hidden", "true");
  head.appendChild(chev);

  const main = document.createElement("span");
  main.className = "notes-card-main";

  const titleEl = document.createElement("span");
  titleEl.className = "notes-row-title";
  titleEl.textContent = row.url ? (row.title || row.url) : t("notesUnknownPage");
  main.appendChild(titleEl);

  const meta = document.createElement("span");
  meta.className = "notes-row-meta";

  const hlSpan = document.createElement("span");
  hlSpan.className = "notes-meta-chip";
  hlSpan.textContent = String(row.hlCount) + " " + t("notesColHighlights");
  meta.appendChild(hlSpan);

  const noteSpan = document.createElement("span");
  noteSpan.className = "notes-meta-chip";
  noteSpan.textContent = String(row.noteCount) + " " + t("notesColNotes");
  meta.appendChild(noteSpan);

  const dateText = _pbpNotesFormatDate(row.lastTs);
  if (dateText) {
    const dateSpan = document.createElement("span");
    dateSpan.className = "notes-meta-chip";
    dateSpan.textContent = dateText;
    dateSpan.title = t("notesColLastActive");
    meta.appendChild(dateSpan);
  }

  const bytesSpan = document.createElement("span");
  bytesSpan.className = "notes-meta-chip";
  bytesSpan.textContent = typeof pbpFormatBytes === "function" ? pbpFormatBytes(row.bytes) : String(row.bytes);
  bytesSpan.title = t("notesColSize");
  meta.appendChild(bytesSpan);

  main.appendChild(meta);
  head.appendChild(main);
  top.appendChild(head);

  let pageUrl = null;
  try {
    pageUrl = row.url ? new URL(row.url) : null;
    if (pageUrl && pageUrl.protocol !== "http:" && pageUrl.protocol !== "https:") pageUrl = null;
  } catch (_) {
    pageUrl = null;
  }
  if (pageUrl) {
    const openLink = document.createElement("a");
    openLink.className = "btn btn-sm notes-row-open";
    openLink.href = pageUrl.href;
    openLink.target = "_blank";
    openLink.rel = "noopener noreferrer";
    openLink.textContent = pageUrl.host || pageUrl.href;
    // External-link mark: this is the one "leaves the page" row action that
    // looked like an in-page toggle without it. Static PBP_ICONS constant.
    openLink.insertAdjacentHTML("beforeend", PBP_ICONS.extOpen.replace('<svg ', '<svg class="ext-icon" '));
    openLink.addEventListener("click", (e) => e.stopPropagation());
    top.appendChild(openLink);
  }

  const delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.className = "btn btn-sm notes-row-del row-del-x";
  // Icon-only, same ghost X as the vocab rows; the name lives in
  // title/aria-label and the line box matches the URL button beside it.
  setBtnIcon(delBtn, "cross", "");
  delBtn.title = t("notesDeleteBtn");
  delBtn.setAttribute("aria-label", t("notesDeleteBtn"));
  delBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    _pbpNotesDelete(row, delBtn);
  });
  top.appendChild(delBtn);
  card.appendChild(top);

  const body = document.createElement("div");
  body.id = bodyId;
  body.className = "notes-card-body";
  body.hidden = true;

  if (!row.url) {
    const hint = document.createElement("p");
    hint.className = "notes-unknown-hint";
    hint.textContent = t("notesUnknownHint");
    body.appendChild(hint);
  }

  const itemsEl = document.createElement("div");
  itemsEl.className = "notes-items";
  const items = Array.isArray(rec.items) ? rec.items : [];
  items.forEach((it) => {
    if (!it || typeof it !== "object") return;
    itemsEl.appendChild(_pbpNotesBuildItem(it));
  });
  body.appendChild(itemsEl);
  card.appendChild(body);

  head.addEventListener("click", () => {
    const open = body.hidden;
    body.hidden = !open;
    head.setAttribute("aria-expanded", open ? "true" : "false");
  });

  return card;
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
      _pbpNotesRenderList(_pbpNotesVisibleEntries());
    });
    wrap.appendChild(b);
  });
}

function _pbpNotesRenderList(entries) {
  const list = $id("notes-list");
  if (!list) return;
  _pbpNotesRenderToolbar(_notesAllRows.length, entries.length);
  list.textContent = "";
  if (!entries.length) {
    const empty = document.createElement("p");
    empty.className = "notes-empty";
    empty.textContent = _notesAllRows.length ? t("notesFilterEmpty") : t("notesEmpty");
    list.appendChild(empty);
    return;
  }
  entries.forEach((entry) => list.appendChild(_pbpNotesBuildRow(entry)));
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
      const cardEl = anchor && anchor.closest ? anchor.closest(".notes-card") : null;
      try {
        await chrome.storage.local.remove(row.key);
      } catch (e) {
        // A swallowed failure looked identical to success (popover closed,
        // row still there, zero feedback). Pin it to the card it happened on
        // and leave a trace -- name/message only, never note content.
        console.warn("[notes] delete failed", e && e.name, e && e.message);
        if (cardEl) cardEl.classList.add("is-error");
        return;
      }
      if (cardEl) cardEl.classList.remove("is-error");
      _notesAllRows = _notesAllRows.filter((e) => e.row.key !== row.key);
      // Fold the card out before the rebuild (vocab cards share the recipe via
      // options.css .card-exit). Marked only after the remove succeeded, and
      // only when motion is wanted; a concurrent filter re-render just makes
      // the delayed rebuild a harmless duplicate.
      if (cardEl && cardEl.isConnected
          && document.documentElement.classList.contains("motion-ready")
          && !(typeof pbpPrefersReducedMotion === "function" && pbpPrefersReducedMotion())) {
        cardEl.classList.add("card-exit");
        await new Promise((resolve) => setTimeout(resolve, 220));
      }
      _pbpNotesRenderList(_pbpNotesVisibleEntries());
    },
  });
}

// Called from the pbp-lib-view mount below on every "notes" view activation.
// Re-scans storage every activation (no "already inited" guard), matching
// renderStoragePanel()'s convention.
async function renderNotesPanel() {
  if (!$id("notes-list")) return;
  _pbpNotesBuildColorFilters();
  _notesAllRows = await _pbpNotesScan();
  _pbpNotesRenderList(_pbpNotesVisibleEntries());
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
      _pbpNotesRenderList(_pbpNotesVisibleEntries());
    });
  }
}

// Library page mount: render on first show and on every re-show/visibility
// return (the event carries the target view).
document.addEventListener("pbp-lib-view", (e) => {
  if (e.detail.view !== "notes") return;
  renderNotesPanel();
});
