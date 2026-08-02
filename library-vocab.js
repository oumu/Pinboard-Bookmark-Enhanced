// ============================================================
// Pinboard Bookmark Enhanced - library-vocab.js
// Library page, Vocabulary view: the master list of the current Pinboard
// owner's pbp-vocab records (search / filter / sort / selection / batch
// bar), moved here from options-vocab.js. The row builder is the only
// adapted piece: rows no longer expand in place, they activate the detail
// pane on the right (_pbpVocabOnRowActivate). Everything Drive / export /
// dictionary-pack stays in options-vocab.js -- this file owns the list.
// ============================================================

// var, not let, for the two names this file shares with options-vocab.js:
// the two pages never co-load, but tests/options-vocab-tests.html loads BOTH
// files, and a second top-level `let` of the same name is a SyntaxError that
// kills the whole script. `var` redeclaration is harmless, and on that page
// the two halves sharing one generation counter is exactly what the Drive
// tests already assume.
var _vocabRenderGen = 0; // guards stale async renders (account switch mid-fetch)
var _vocabFlashTimer = 0; // guards two flashes racing to clear each other's text early
let _vocabRows = [];     // last render's rows for the current owner
let _vocabViewRows = []; // current filtered + sorted view (selection boundary)
let _vocabSelected = new Set();
// Deleted-card exit, decoupled from the data path: the mutation and reload
// fire immediately; only the reload's final DOM commit waits out this window
// (see _pbpVocabExitSettle call in _pbpVocabReloadAfterMutation), so the
// owner/gen guards keep their exact timing and ordering.
let _vocabExitHoldUntil = 0;
function _pbpVocabMarkExit(cards) {
  if (!document.documentElement.classList.contains("motion-ready")) return;
  if (typeof pbpPrefersReducedMotion === "function" && pbpPrefersReducedMotion()) return;
  let marked = false;
  for (const el of cards) {
    if (el && el.isConnected) { el.classList.add("card-exit"); marked = true; }
  }
  if (marked) _vocabExitHoldUntil = performance.now() + 220;
}
async function _pbpVocabExitSettle() {
  const wait = _vocabExitHoldUntil - performance.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
}
let _vocabLastSelectedId = null;
let _vocabRenderLimit = 100;
let _vocabBatchBusy = false;
let _vocabOwnerLabel = ""; // decoded non-secret Pinboard username for visible scope copy
const PBP_VOCAB_RENDER_BATCH = 100;
const _vocabCollator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

// Detail-pane activation hook — implemented by the detail pane (Task 6).
let _pbpVocabOnRowActivate = () => {};

function pbpVocabSearchText(value) {
  return String(value || "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/i\u0307/g, "i")
    .replace(/ß/g, "ss")
    .replace(/ς/g, "σ")
    .trim();
}

function pbpVocabFilterSort(rows, query, group, sortMode, status) {
  const needle = pbpVocabSearchText(query);
  const groupName = typeof pbpVocabNormalizeGroupName === "function"
    ? pbpVocabNormalizeGroupName(group) : String(group || "").trim();
  // Two states only ("known" and everything else): the store clamps writes
  // to new/known, and records predating the flag read as "new" here.
  const wantStatus = status === "known" || status === "new" ? status : "";
  const filtered = (Array.isArray(rows) ? rows : []).filter((row) => {
    const groups = typeof pbpVocabGroups === "function" ? pbpVocabGroups(row) : [];
    if (groupName && !groups.includes(groupName)) return false;
    if (wantStatus && (String((row && row.status) || "new") === "known" ? "known" : "new") !== wantStatus) return false;
    if (!needle) return true;
    const contexts = Array.isArray(row && row.contexts) ? row.contexts : [];
    const fields = [row && row.term, row && row.lemma, row && row.gloss, row && row.note,
      ...groups, ...contexts.flatMap((ctx) => [ctx && ctx.quote, ctx && ctx.articleTitle])];
    return fields.some((value) => pbpVocabSearchText(value).includes(needle));
  }).map((row, index) => ({ row, index }));

  const mode = ["oldest", "az", "za"].includes(sortMode) ? sortMode : "latest";
  filtered.sort((a, b) => {
    let cmp = 0;
    if (mode === "latest" || mode === "oldest") {
      cmp = (Number(a.row.updatedAt) || Number(a.row.createdAt) || 0)
        - (Number(b.row.updatedAt) || Number(b.row.createdAt) || 0);
      if (mode === "latest") cmp *= -1;
    } else {
      cmp = _vocabCollator.compare(String(a.row.term || a.row.lemma || ""), String(b.row.term || b.row.lemma || ""));
      if (mode === "za") cmp *= -1;
    }
    return cmp || a.index - b.index;
  });
  return filtered.map((item) => item.row);
}

function pbpVocabSelectResults(selected, rows, mode) {
  const next = new Set(selected || []);
  for (const row of (Array.isArray(rows) ? rows : [])) {
    if (!row || !row.id) continue;
    if (mode === "invert") {
      if (next.has(row.id)) next.delete(row.id); else next.add(row.id);
    } else {
      next.add(row.id);
    }
  }
  return next;
}

function pbpVocabSelectRange(selected, rows, anchorId, targetId, checked) {
  const next = new Set(selected || []);
  const ids = (Array.isArray(rows) ? rows : []).map((row) => row && row.id);
  const start = ids.indexOf(anchorId);
  const end = ids.indexOf(targetId);
  if (start < 0 || end < 0) {
    if (targetId) checked ? next.add(targetId) : next.delete(targetId);
    return next;
  }
  const lo = Math.min(start, end), hi = Math.max(start, end);
  for (let i = lo; i <= hi; i++) {
    if (!ids[i]) continue;
    checked ? next.add(ids[i]) : next.delete(ids[i]);
  }
  return next;
}

// No render-index parameter any more: its only job was the expandable body's
// DOM id, and the master-detail row has no body to address.
function _pbpVocabBuildRow(w) {
  const card = document.createElement("article");
  card.className = "notes-card vocab-card";
  card.setAttribute("role", "listitem");
  card.dataset.vocabId = w.id;

  const top = document.createElement("div");
  top.className = "notes-card-top";

  const select = document.createElement("input");
  select.type = "checkbox";
  select.className = "vocab-row-select";
  select.dataset.vocabId = w.id;
  select.checked = _vocabSelected.has(w.id);
  card.classList.toggle("selected", select.checked); // drives the row accent band
  select.setAttribute("aria-label", t("vocabSelectWord", w.term));
  select.addEventListener("click", (e) => {
    if (e.shiftKey && _vocabLastSelectedId) {
      _vocabSelected = pbpVocabSelectRange(_vocabSelected, _vocabViewRows,
        _vocabLastSelectedId, w.id, select.checked);
    } else if (select.checked) {
      _vocabSelected.add(w.id);
    } else {
      _vocabSelected.delete(w.id);
    }
    _vocabLastSelectedId = w.id;
    _pbpVocabSyncSelectionUi();
  });
  top.appendChild(select);

  const head = document.createElement("button");
  head.type = "button";
  head.className = "notes-card-head";

  const main = document.createElement("span");
  main.className = "notes-card-main";

  // Fixed two-line rhythm (2026-08 redesign): line 1 = term + chips, line 2 =
  // the gloss clamped to ONE ellipsised line. The gloss used to live in the
  // wrapping chip row, so a long AI gloss pushed the chips onto extra lines
  // and every card ended up a different height (real-device report).
  const headline = document.createElement("span");
  headline.className = "vocab-row-headline";
  const titleEl = document.createElement("span");
  titleEl.className = "notes-row-title";
  titleEl.textContent = w.term;
  headline.appendChild(titleEl);

  const meta = document.createElement("span");
  meta.className = "notes-row-meta";
  const languageLabel = pbpDictLanguageLabel(w.language, document.documentElement.lang);
  if (languageLabel) {
    const langChip = document.createElement("span");
    langChip.className = "notes-meta-chip";
    langChip.textContent = languageLabel;
    meta.appendChild(langChip);
  }
  if (String(w.status || "new") === "known") {
    const statusChip = document.createElement("span");
    statusChip.className = "notes-meta-chip vocab-status-chip";
    statusChip.textContent = t("vocabStatusKnown");
    meta.appendChild(statusChip);
  }
  for (const group of pbpVocabGroups(w)) {
    const groupChip = document.createElement("span");
    groupChip.className = "notes-meta-chip vocab-group-chip";
    groupChip.textContent = group;
    meta.appendChild(groupChip);
  }
  headline.appendChild(meta);
  main.appendChild(headline);

  if (w.gloss) {
    const glossLine = document.createElement("span");
    glossLine.className = "vocab-row-gloss";
    glossLine.textContent = (w.gloss || "").split("\n")[0];
    main.appendChild(glossLine);
  }

  head.appendChild(main);
  top.appendChild(head);

  const delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.className = "btn btn-sm notes-row-del row-del-x";
  // Icon-only: the full sentence ate a third of every row. The name lives in
  // title/aria-label; the confirm popover still anchors to the button.
  setBtnIcon(delBtn, "cross", "");
  delBtn.title = t("dictDeleteWord");
  delBtn.setAttribute("aria-label", t("dictDeleteWord"));
  delBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    _pbpVocabDeleteRow(w, delBtn);
  });
  top.appendChild(delBtn);
  card.appendChild(top);

  // Master-detail: the head no longer discloses a body of its own, it hands
  // the word to the detail pane and marks itself as the current row. Exactly
  // one row carries aria-current, so clear the others first.
  head.addEventListener("click", () => {
    _pbpVocabOnRowActivate(w);
    document.querySelectorAll("#vocab-list .vocab-card[aria-current]").forEach((el) => el.removeAttribute("aria-current"));
    card.setAttribute("aria-current", "true");
  });

  return card;
}

// Parked verbatim from the pre-migration row builder; nothing calls it yet.
// Task 6 wires this into the detail pane.
// Note editor. The field, its concurrent-merge rule and the Drive privacy
// copy ("may include ... notes") all existed with no way to type into it.
// Save is explicit (mutation-at-confirm discipline, same as every other
// vocab edit); the button only appears once the text actually differs.
function _pbpVocabBuildNoteEditor(w) {
  const noteWrap = document.createElement("div");
  noteWrap.className = "vocab-note-edit";
  const noteInput = document.createElement("textarea");
  noteInput.className = "vocab-note-input";
  noteInput.rows = 2;
  noteInput.maxLength = 500;
  noteInput.placeholder = t("hlNotePlaceholder");
  noteInput.setAttribute("aria-label", t("hlNotePlaceholder"));
  noteInput.value = w.note || "";
  const noteSave = document.createElement("button");
  noteSave.type = "button";
  noteSave.className = "btn btn-sm vocab-note-save";
  noteSave.textContent = t("hlSave");
  noteSave.hidden = true;
  noteInput.addEventListener("input", () => {
    noteSave.hidden = noteInput.value === (w.note || "");
  });
  noteSave.addEventListener("click", async () => {
    if (noteSave.disabled) return;
    noteSave.disabled = true;
    const gen = ++_vocabRenderGen;
    let owner = null;
    try {
      owner = await pbpVocabCurrentOwner();
      const ok = await pbpVocabSetNote(w.id, owner, noteInput.value);
      const refreshed = await _pbpVocabReloadAfterMutation(owner, gen);
      if (gen !== _vocabRenderGen) return;
      if (!ok) {
        _pbpVocabFlashStatus(false, t("vocabBatchFailed"));
        // Pin the failure to the card it happened on -- the reload above
        // rebuilt the DOM, so find the successor by id.
        document.querySelectorAll("#vocab-list > .vocab-card").forEach((el) => {
          if (el.dataset.vocabId === w.id) el.classList.add("is-error");
        });
      }
      else if (!refreshed) _pbpVocabFlashStatus(false, t("vocabRefreshFailed"));
      else _pbpVocabFlashStatus(true, t("vocabNoteSaved"));
    } catch (_) {
      if (owner) await _pbpVocabReloadAfterMutation(owner, gen);
      if (gen === _vocabRenderGen) _pbpVocabFlashStatus(false, t("vocabBatchFailed"));
    } finally {
      noteSave.disabled = false;
    }
  });
  noteWrap.appendChild(noteInput);
  noteWrap.appendChild(noteSave);
  return noteWrap;
}

// Verbatim twin: options-vocab.js and library-vocab.js each carry this helper
// (the pages never co-load; the test page co-loads both — keep the two
// definitions byte-identical so shadowing is harmless).
function _pbpVocabFlashStatus(ok, text) {
  const el = $id("vocab-status");
  if (!el) return;
  delete el.dataset.vocabLoading;
  setStatusIcon(el, ok, text);
  // Two flashes in quick succession (e.g. export then Anki) must not race:
  // the earlier call's clear-timer would otherwise wipe the later message.
  clearTimeout(_vocabFlashTimer);
  _vocabFlashTimer = setTimeout(() => { el.textContent = ""; }, 3000);
}

function _pbpVocabSetLoading(loading) {
  const list = $id("vocab-list");
  if (list) list.setAttribute("aria-busy", loading ? "true" : "false");
  const status = $id("vocab-status");
  if (!status) return;
  if (loading) {
    clearTimeout(_vocabFlashTimer);
    status.classList.remove("ok", "bad");
    status.dataset.vocabLoading = "true";
    status.textContent = t("vocabLoading");
  } else if (status.dataset.vocabLoading === "true") {
    delete status.dataset.vocabLoading;
    status.textContent = "";
  }
}

function _pbpVocabFocusStable() {
  const search = $id("vocab-search");
  if (!search || search.disabled || search.closest("[hidden], [inert]")) return;
  try { search.focus({ preventScroll: true }); } catch (_) { search.focus(); }
}

function pbpVocabSelectionSnapshotValid(ids, selected, rows) {
  const captured = Array.isArray(ids) ? ids : [];
  const selectedIds = selected instanceof Set ? selected : new Set(selected || []);
  const unique = new Set(captured);
  if (unique.size !== captured.length || unique.size !== selectedIds.size) return false;
  const visibleIds = new Set((Array.isArray(rows) ? rows : []).map((row) => row && row.id));
  return captured.every((id) => selectedIds.has(id) && visibleIds.has(id));
}

// Same anchored confirm popover as every other destructive micro-action
// (notes, theme delete, tab reset) -- never a blocking browser dialog. Owner is
// re-derived at action time, not reused from the render pass, so a delete
// confirmed after an account switch still checks against the CURRENT
// account (account-isolation invariant).
function _pbpVocabDeleteRow(w, anchor) {
  showConfirmPopover(anchor, {
    msg: t("dictDeleteConfirm", w.term),
    yesText: t("delete"),
    noText: t("cancel"),
    onConfirm: async () => {
      // Share renderVocabPanel's generation: every confirmed mutation gets
      // a UI-commit ticket immediately, so a later user action supersedes an
      // older reload even when the older IDB snapshot resolves last.
      const gen = ++_vocabRenderGen;
      let owner = null;
      // Whole body in try/catch: showConfirmPopover only console.errors a
      // rejected onConfirm, so a thrown owner read (or anything else here)
      // would otherwise vanish with no user-visible feedback.
      try {
        owner = await pbpVocabCurrentOwner();
        const ok = await pbpVocabDelete(w.id, owner);
        // Only a confirmed delete collapses the card -- a failed one would
        // fold and then pop back on the reconciling re-render.
        if (ok) _pbpVocabMarkExit([anchor.closest(".notes-card")]);
        // Re-read on failure too: an earlier overlapping mutation may have
        // committed already, and this latest action owns the final reconcile.
        const refreshed = await _pbpVocabReloadAfterMutation(owner, gen);
        if (gen !== _vocabRenderGen) return;
        if (!ok) _pbpVocabFlashStatus(false, t("dictDeleteFailed"));
        else if (!refreshed) _pbpVocabFlashStatus(false, t("vocabRefreshFailed"));
      } catch (_) {
        if (owner) await _pbpVocabReloadAfterMutation(owner, gen);
        else if (gen === _vocabRenderGen) {
          _pbpVocabClearVisibleState();
          _pbpVocabSetLoading(false);
        }
        if (gen === _vocabRenderGen) _pbpVocabFlashStatus(false, t("dictDeleteFailed"));
      }
    },
  });
}

function _pbpVocabClearSelection() {
  _vocabSelected.clear();
  _vocabLastSelectedId = null;
}

function _pbpVocabSyncSelectionUi() {
  const validIds = new Set(_vocabViewRows.map((row) => row.id));
  for (const id of [..._vocabSelected]) if (!validIds.has(id)) _vocabSelected.delete(id);
  // Keep every visible row's checkbox and .selected state in step with the
  // selection set (shift-range and select-all mutate rows that were not the
  // click target).
  document.querySelectorAll("#vocab-list > .vocab-card").forEach((el) => {
    const on = _vocabSelected.has(el.dataset.vocabId);
    el.classList.toggle("selected", on);
    const cb = el.querySelector(".vocab-row-select");
    if (cb && cb.checked !== on) cb.checked = on;
  });
  const selectedCount = _vocabSelected.size;
  // Selection mode: any active selection keeps every row's checkbox shown
  // (user-ratified) -- range work must not require hovering rows one by one.
  const listEl = $id("vocab-list");
  if (listEl) listEl.classList.toggle("selecting", selectedCount > 0);
  const selectedEl = $id("vocab-selected-count");
  if (selectedEl) selectedEl.textContent = t("vocabSelectedCount", String(selectedCount));
  // Batch bar: shown only while a selection exists; the .selecting class
  // drives the dock-slot growth and fade as ONE transition set, so the
  // sections below the list only ever move in lockstep with the bar.
  const toolbar = $id("vocab-batch-toolbar");
  if (toolbar) toolbar.classList.toggle("selecting", selectedCount > 0);
  const allBtn = $id("vocab-select-all");
  const invertBtn = $id("vocab-invert-selection");
  if (allBtn) allBtn.disabled = _vocabBatchBusy || !_vocabViewRows.length;
  if (invertBtn) invertBtn.disabled = _vocabBatchBusy || !_vocabViewRows.length;
  const groupInput = $id("vocab-group-input");
  const addBtn = $id("vocab-add-group");
  const deleteBtn = $id("vocab-batch-delete");
  const group = groupInput && typeof pbpVocabNormalizeGroupName === "function"
    ? pbpVocabNormalizeGroupName(groupInput.value) : "";
  const removeBtn = $id("vocab-remove-group");
  if (groupInput) groupInput.disabled = _vocabBatchBusy;
  if (addBtn) addBtn.disabled = _vocabBatchBusy || !selectedCount || !group;
  // Remove additionally needs the typed group to actually be on something in the
  // selection. Enabling it symmetrically with add would let a click report "12
  // removed" while changing nothing.
  if (removeBtn) {
    const inGroup = group && selectedCount ? _pbpVocabSelectedInGroup(group) : 0;
    removeBtn.disabled = _vocabBatchBusy || !selectedCount || !group || !inGroup;
    // "Selection and group don't overlap" is the one disable condition nothing
    // on screen explains; say it on hover. The fallback is the button's full
    // label -- it is icon-only now, so the title doubles as its tooltip name.
    // Never via #vocab-status, a live region the batch results keep rewriting.
    removeBtn.title = (group && selectedCount && !inGroup) ? t("vocabRemoveGroupNoMatch") : t("vocabRemoveFromGroup");
  }
  if (deleteBtn) deleteBtn.disabled = _vocabBatchBusy || !selectedCount;
  const knownBtn = $id("vocab-mark-known");
  const learningBtn = $id("vocab-mark-learning");
  if (knownBtn) knownBtn.disabled = _vocabBatchBusy || !selectedCount;
  if (learningBtn) learningBtn.disabled = _vocabBatchBusy || !selectedCount;
  document.querySelectorAll("#vocab-list .vocab-row-select").forEach((checkbox) => {
    checkbox.checked = _vocabSelected.has(checkbox.dataset.vocabId);
    checkbox.disabled = _vocabBatchBusy;
  });
}

// How many currently-selected words carry `group`. Reads the rendered view rows,
// which are the same rows the selection was validated against.
function _pbpVocabSelectedInGroup(group) {
  if (!group) return 0;
  return _vocabViewRows.filter((row) => _vocabSelected.has(row.id) && pbpVocabGroups(row).includes(group)).length;
}

function _pbpVocabRefreshGroupOptions(preserveSelection) {
  const filter = $id("vocab-group-filter");
  const datalist = $id("vocab-group-list");
  const groups = [...new Set(_vocabRows.flatMap((row) => pbpVocabGroups(row)))]
    .sort((a, b) => _vocabCollator.compare(a, b));
  if (filter) {
    const previous = preserveSelection ? filter.value : "";
    filter.replaceChildren();
    const all = document.createElement("option");
    all.value = "";
    all.textContent = t("vocabAllGroups");
    filter.appendChild(all);
    for (const group of groups) {
      const option = document.createElement("option");
      option.value = group;
      option.textContent = group;
      filter.appendChild(option);
    }
    filter.value = groups.includes(previous) ? previous : "";
  }
  if (datalist) {
    datalist.replaceChildren(...groups.map((group) => {
      const option = document.createElement("option");
      option.value = group;
      return option;
    }));
  }
}

function _pbpVocabRenderList(append) {
  const list = $id("vocab-list");
  if (!list) return;
  const rows = _vocabViewRows;
  const count = $id("vocab-count");
  if (count) count.textContent = t("vocabResultCount", String(rows.length), String(_vocabRows.length), _vocabOwnerLabel);
  const empty = $id("vocab-empty");
  if (empty) {
    empty.textContent = t("dictVocabEmpty", _vocabOwnerLabel);
    empty.hidden = _vocabRows.length !== 0;
  }
  const noResults = $id("vocab-no-results");
  if (noResults) noResults.hidden = _vocabRows.length === 0 || rows.length !== 0;
  const target = Math.min(rows.length, _vocabRenderLimit);
  const start = append ? Math.min(list.children.length, target) : 0;
  if (!append) list.replaceChildren();
  const fragment = document.createDocumentFragment();
  rows.slice(start, target).forEach((w) => fragment.appendChild(_pbpVocabBuildRow(w)));
  list.appendChild(fragment);
  const more = $id("vocab-load-more");
  if (more) {
    const remaining = Math.max(0, rows.length - target);
    more.hidden = remaining === 0;
    more.textContent = t("vocabLoadMore", String(Math.min(PBP_VOCAB_RENDER_BATCH, remaining)));
  }
  _pbpVocabSyncSelectionUi();
}

function _pbpVocabApplyView(resetLimit) {
  if (resetLimit) _vocabRenderLimit = PBP_VOCAB_RENDER_BATCH;
  _vocabViewRows = pbpVocabFilterSort(_vocabRows,
    ($id("vocab-search") || {}).value || "",
    ($id("vocab-group-filter") || {}).value || "",
    ($id("vocab-sort") || {}).value || "latest",
    ($id("vocab-status-filter") || {}).value || "");
  _pbpVocabRenderList();
}

function _pbpVocabClearVisibleState() {
  _vocabRows = [];
  _vocabViewRows = [];
  _vocabOwnerLabel = "";
  _pbpVocabClearSelection();
  const list = $id("vocab-list");
  if (list) list.replaceChildren();
  _pbpVocabSetLoading(true);
  const count = $id("vocab-count");
  if (count) count.textContent = "";
  // (The batch bar is class-driven, not hidden-attribute driven; its
  // .selecting class clears via _pbpVocabSyncSelectionUi right below.)
  for (const id of ["vocab-empty", "vocab-no-results", "vocab-load-more"]) {
    const el = $id(id); if (el) el.hidden = true;
  }
  _pbpVocabRefreshGroupOptions(false);
  _pbpVocabSyncSelectionUi();
}

async function _pbpVocabReloadAfterMutation(expectedOwner, requestedGen) {
  const gen = Number.isInteger(requestedGen) ? requestedGen : ++_vocabRenderGen;
  if (gen !== _vocabRenderGen) return false;
  _pbpVocabSetLoading(true);
  try {
    const rows = await pbpVocabAll(expectedOwner);
    // Let a running card-exit fold finish before the rebuild (no-op unless a
    // delete just marked cards). Sits BEFORE the owner read and the gen/owner
    // guards: the owner must be re-read AFTER the last await, or an account
    // switch during the fold window would sail past a stale comparison.
    await _pbpVocabExitSettle();
    const ownerNow = await pbpVocabCurrentOwner();
    // A newer mutation, view activation or account-change render owns every
    // visible field now. The old snapshot may still be useful to its caller
    // as completion, but it must not write rows/loading/selection/status.
    if (gen !== _vocabRenderGen) return false;
    if (ownerNow !== expectedOwner) {
      _pbpVocabClearVisibleState();
      renderVocabPanel();
      return false;
    }
    _vocabRows = rows;
    _vocabOwnerLabel = pbpVocabOwnerLabel(expectedOwner);
    _pbpVocabClearSelection();
    _pbpVocabRefreshGroupOptions(true);
    _pbpVocabSetLoading(false);
    _pbpVocabApplyView(true);
    return true;
  } catch (_) {
    if (gen !== _vocabRenderGen) return false;
    _pbpVocabClearVisibleState();
    _pbpVocabSetLoading(false);
    return false;
  }
}

// Re-reads the whole list for the current Pinboard owner. Runs on every
// activation of the Vocabulary view (rescans every time, no "already inited"
// guard -- same convention renderNotesPanel uses). _vocabRenderGen guards a
// slow fetch that's still in flight when the account changes again (or the
// user leaves and re-enters the view) from clobbering a newer render.
async function renderVocabPanel() {
  if (!$id("vocab-list")) return;
  const gen = ++_vocabRenderGen;
  // Clear first, before any await: an account-change render must never leave
  // the previous owner's rows, selection, or derived group names visible.
  _pbpVocabClearVisibleState();
  let rows;
  let owner;
  try {
    owner = await pbpVocabCurrentOwner();
    rows = await pbpVocabAll(owner);
    if (await pbpVocabCurrentOwner() !== owner) {
      if (gen === _vocabRenderGen) renderVocabPanel();
      return;
    }
  } catch (_) {
    // Fail-closed: a rerender triggered by an account switch that then fails
    // to read must NOT leave the previous account's rows on screen (isolation
    // invariant) -- clear the list and say the read failed.
    if (gen === _vocabRenderGen) {
      _pbpVocabClearVisibleState();
      _pbpVocabSetLoading(false);
      _pbpVocabFlashStatus(false, t("vocabLoadFailed"));
    }
    return;
  }
  if (gen !== _vocabRenderGen) return;
  _vocabRows = rows;
  _vocabOwnerLabel = pbpVocabOwnerLabel(owner);
  _pbpVocabSetLoading(false);
  _pbpVocabRefreshGroupOptions(false);
  _pbpVocabApplyView(true);
}

function _pbpVocabSetBatchBusy(busy) {
  _vocabBatchBusy = !!busy;
  _pbpVocabSyncSelectionUi();
}

function _pbpVocabBatchDeleteSelected() {
  const button = $id("vocab-batch-delete");
  if (!button || button.disabled || _vocabBatchBusy || !_vocabSelected.size) return;
  const ids = [..._vocabSelected];
  showConfirmPopover(button, {
    msg: t("vocabBatchDeleteConfirm", String(ids.length)),
    yesText: t("delete"),
    noText: t("cancel"),
    onConfirm: async () => {
      if (_vocabBatchBusy) return;
      if (!pbpVocabSelectionSnapshotValid(ids, _vocabSelected, _vocabViewRows)) {
        _pbpVocabFlashStatus(false, t("vocabSelectionChanged"));
        _pbpVocabFocusStable();
        return;
      }
      _pbpVocabSetBatchBusy(true);
      const gen = ++_vocabRenderGen;
      let owner = null;
      try {
        owner = await pbpVocabCurrentOwner();
        const ok = await pbpVocabBatchDelete(ids, owner);
        if (ok) {
          // One simultaneous fold for the whole batch -- a per-card stagger
          // at 20 selections would blow far past the motion budget.
          const idSet = new Set(ids);
          _pbpVocabMarkExit([...document.querySelectorAll("#vocab-list > .notes-card")]
            .filter((el) => idSet.has(el.dataset.vocabId)));
        }
        const refreshed = await _pbpVocabReloadAfterMutation(owner, gen);
        if (gen !== _vocabRenderGen) return;
        _pbpVocabFocusStable();
        if (!ok) {
          _pbpVocabFlashStatus(false, t("vocabBatchFailed"));
          return;
        }
        if (!refreshed) {
          _pbpVocabFlashStatus(false, t("vocabRefreshFailed"));
          return;
        }
        _pbpVocabFlashStatus(true, t("vocabBatchDeleted", String(ids.length)));
      } catch (_) {
        if (owner) await _pbpVocabReloadAfterMutation(owner, gen);
        else if (gen === _vocabRenderGen) {
          _pbpVocabClearVisibleState();
          _pbpVocabSetLoading(false);
        }
        if (gen === _vocabRenderGen) {
          _pbpVocabFocusStable();
          _pbpVocabFlashStatus(false, t("vocabBatchFailed"));
        }
      } finally {
        _pbpVocabSetBatchBusy(false);
      }
    }
  });
}

// Add and remove share every line except the store call and the two words that
// differ in the report, so they share the function. `adding` also decides how
// the count is derived: adding touches the whole selection, removing only the
// part of it that actually carries the group -- and that count must be read
// BEFORE the mutation, since the reload afterwards no longer shows it.
async function _pbpVocabApplyGroupChange(adding) {
  const input = $id("vocab-group-input");
  const button = $id(adding ? "vocab-add-group" : "vocab-remove-group");
  if (!input || !button || button.disabled || _vocabBatchBusy || !_vocabSelected.size) return;
  const group = pbpVocabNormalizeGroupName(input.value);
  if (!group) { _pbpVocabFlashStatus(false, t("vocabGroupRequired")); return; }
  const ids = [..._vocabSelected];
  const affected = adding ? ids.length : _pbpVocabSelectedInGroup(group);
  _pbpVocabSetBatchBusy(true);
  const gen = ++_vocabRenderGen;
  let owner = null;
  try {
    owner = await pbpVocabCurrentOwner();
    const ok = adding
      ? await pbpVocabBatchAddGroup(ids, owner, group)
      : await pbpVocabBatchRemoveGroup(ids, owner, group);
    const refreshed = await _pbpVocabReloadAfterMutation(owner, gen);
    if (gen !== _vocabRenderGen) return;
    _pbpVocabFocusStable();
    if (!ok) {
      _pbpVocabFlashStatus(false, t("vocabBatchFailed"));
      return;
    }
    if (!refreshed) {
      _pbpVocabFlashStatus(false, t("vocabRefreshFailed"));
      return;
    }
    input.value = "";
    _pbpVocabFlashStatus(true, t(adding ? "vocabBatchGrouped" : "vocabBatchUngrouped", String(affected), group));
  } catch (_) {
    if (owner) await _pbpVocabReloadAfterMutation(owner, gen);
    else if (gen === _vocabRenderGen) {
      _pbpVocabClearVisibleState();
      _pbpVocabSetLoading(false);
    }
    if (gen === _vocabRenderGen) {
      _pbpVocabFocusStable();
      _pbpVocabFlashStatus(false, t("vocabBatchFailed"));
    }
  } finally {
    _pbpVocabSetBatchBusy(false);
  }
}

// Batch status flip, same generation/owner/refresh discipline as the group
// mutations. No input field to validate: the selection is the whole argument.
async function _pbpVocabApplyStatusChange(known) {
  const button = $id(known ? "vocab-mark-known" : "vocab-mark-learning");
  if (!button || button.disabled || _vocabBatchBusy || !_vocabSelected.size) return;
  const ids = [..._vocabSelected];
  _pbpVocabSetBatchBusy(true);
  const gen = ++_vocabRenderGen;
  let owner = null;
  try {
    owner = await pbpVocabCurrentOwner();
    const ok = await pbpVocabBatchSetStatus(ids, owner, known ? "known" : "new");
    const refreshed = await _pbpVocabReloadAfterMutation(owner, gen);
    if (gen !== _vocabRenderGen) return;
    _pbpVocabFocusStable();
    if (!ok) { _pbpVocabFlashStatus(false, t("vocabBatchFailed")); return; }
    if (!refreshed) { _pbpVocabFlashStatus(false, t("vocabRefreshFailed")); return; }
    _pbpVocabFlashStatus(true,
      t(known ? "vocabBatchKnownDone" : "vocabBatchLearningDone", String(ids.length)));
  } catch (_) {
    if (owner) await _pbpVocabReloadAfterMutation(owner, gen);
    else if (gen === _vocabRenderGen) {
      _pbpVocabClearVisibleState();
      _pbpVocabSetLoading(false);
    }
    if (gen === _vocabRenderGen) {
      _pbpVocabFocusStable();
      _pbpVocabFlashStatus(false, t("vocabBatchFailed"));
    }
  } finally {
    _pbpVocabSetBatchBusy(false);
  }
}

const _vocabSearch = $id("vocab-search");
if (_vocabSearch) _vocabSearch.addEventListener("input", () => {
  _pbpVocabClearSelection();
  _pbpVocabApplyView(true);
});
for (const id of ["vocab-group-filter", "vocab-status-filter"]) {
  const control = $id(id);
  if (control) control.addEventListener("change", () => {
    _pbpVocabClearSelection();
    _pbpVocabApplyView(true);
  });
}
// Sort only reorders the same visible set: keep the selection (desktop
// convention), reset the shift anchor -- a range from a pre-sort anchor
// would span an arbitrary interval in the new visual order.
const _vocabSortSelect = $id("vocab-sort");
if (_vocabSortSelect) _vocabSortSelect.addEventListener("change", () => {
  _vocabLastSelectedId = null;
  _pbpVocabApplyView(true);
  _pbpVocabSyncSortSeg();
});
// Sort segment: two direction-toggle buttons proxying the hidden #vocab-sort
// select (the state carrier every existing handler and test already speaks).
// Click an inactive dimension = enter it at its default direction; click the
// active one = flip. Icons show the CURRENT direction, title/aria the sort a
// click will apply next (reuses the four existing option strings).
const PBP_VOCAB_SORT_DIMS = [
  { btn: "vocab-sort-time", states: ["latest", "oldest"], icons: ["clockArrowDown", "clockArrowUp"], labels: ["vocabSortLatest", "vocabSortOldest"] },
  { btn: "vocab-sort-alpha", states: ["az", "za"], icons: ["arrowDownAZ", "arrowDownZA"], labels: ["vocabSortAz", "vocabSortZa"] },
];
function _pbpVocabSyncSortSeg() {
  const select = $id("vocab-sort");
  if (!select) return;
  const value = select.value || "latest";
  for (const dim of PBP_VOCAB_SORT_DIMS) {
    const btn = $id(dim.btn);
    if (!btn) continue;
    const idx = dim.states.indexOf(value);
    const active = idx !== -1;
    btn.setAttribute("aria-pressed", active ? "true" : "false");
    const ic = btn.querySelector(".btn-ic");
    if (ic && typeof PBP_ICONS !== "undefined") ic.innerHTML = PBP_ICONS[dim.icons[active ? idx : 0]] || "";
    const label = t(dim.labels[active ? 1 - idx : 0]);
    btn.title = label;
    btn.setAttribute("aria-label", label);
  }
}
for (const dim of PBP_VOCAB_SORT_DIMS) {
  const btn = $id(dim.btn);
  if (btn) btn.addEventListener("click", () => {
    const select = $id("vocab-sort");
    if (!select) return;
    const idx = dim.states.indexOf(select.value);
    select.value = idx === -1 ? dim.states[0] : dim.states[1 - idx];
    select.dispatchEvent(new Event("change"));
  });
}
_pbpVocabSyncSortSeg();
const _vocabClearBtn = $id("vocab-clear-selection");
if (_vocabClearBtn) _vocabClearBtn.addEventListener("click", () => {
  _pbpVocabClearSelection();
  _pbpVocabSyncSelectionUi();
  // The bar (with the clicked button) just hid: hand focus to the nearest
  // persistent selection control instead of letting it fall to <body>.
  const allBtn = $id("vocab-select-all");
  if (allBtn) { try { allBtn.focus({ preventScroll: true }); } catch (_) { allBtn.focus(); } }
});
const _vocabSelectAll = $id("vocab-select-all");
if (_vocabSelectAll) _vocabSelectAll.addEventListener("click", () => {
  _vocabSelected = pbpVocabSelectResults(_vocabSelected, _vocabViewRows, "all");
  _vocabLastSelectedId = null;
  _pbpVocabSyncSelectionUi();
});
const _vocabInvert = $id("vocab-invert-selection");
if (_vocabInvert) _vocabInvert.addEventListener("click", () => {
  _vocabSelected = pbpVocabSelectResults(_vocabSelected, _vocabViewRows, "invert");
  _vocabLastSelectedId = null;
  _pbpVocabSyncSelectionUi();
});
const _vocabLoadMore = $id("vocab-load-more");
if (_vocabLoadMore) _vocabLoadMore.addEventListener("click", () => {
  _vocabRenderLimit = Math.min(_vocabViewRows.length, _vocabRenderLimit + PBP_VOCAB_RENDER_BATCH);
  _pbpVocabRenderList(true);
});
const _vocabGroupInput = $id("vocab-group-input");
if (_vocabGroupInput) _vocabGroupInput.addEventListener("input", _pbpVocabSyncSelectionUi);
const _vocabAddGroup = $id("vocab-add-group");
if (_vocabAddGroup) _vocabAddGroup.addEventListener("click", () => _pbpVocabApplyGroupChange(true));
const _vocabRemoveGroup = $id("vocab-remove-group");
if (_vocabRemoveGroup) _vocabRemoveGroup.addEventListener("click", () => _pbpVocabApplyGroupChange(false));
const _vocabBatchDelete = $id("vocab-batch-delete");
if (_vocabBatchDelete) _vocabBatchDelete.addEventListener("click", _pbpVocabBatchDeleteSelected);
const _vocabMarkKnown = $id("vocab-mark-known");
if (_vocabMarkKnown) _vocabMarkKnown.addEventListener("click", () => _pbpVocabApplyStatusChange(true));
const _vocabMarkLearning = $id("vocab-mark-learning");
if (_vocabMarkLearning) _vocabMarkLearning.addEventListener("click", () => _pbpVocabApplyStatusChange(false));

// Mount. library.js dispatches this on the initial view, on every view
// switch, and when the tab becomes visible again -- words saved from the
// reader while this tab was hidden have to show up on return.
document.addEventListener("pbp-lib-view", (e) => {
  if (e.detail.view === "vocab") renderVocabPanel();
});

// Account switch (token rotation, or the sync/keys-routing toggles that
// change which area holds the effective token) invalidates every row
// currently shown -- clear first, then re-read for the new owner.
// renderVocabPanel's generation counter absorbs a rerun that lands after the
// user has already switched views. Unconditional, unlike the options page's
// active-tab check: this view keeps its rows in the DOM while Notes is on
// screen, so a hidden stale list is exactly what must not survive.
if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if ((area !== "sync" && area !== "local") ||
        !(changes.pinboardToken || changes.optSyncEnabled || changes.syncApiKeys)) return;
    _pbpVocabClearVisibleState();
    renderVocabPanel();
  });
}
