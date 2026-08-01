// ============================================================
// Pinboard Bookmark Enhanced - options-vocab.js
// Vocabulary tab: renders md-dict.js's pbp-vocab IndexedDB store (words
// saved from the reader's dictionary view) with expand/delete/export.
// Replaces the old reader-rail panel (Codex feedback round 2) -- md-dict.js
// keeps only the pure store layer (pbpVocabAll/Get/SaveWord/Delete).
// Modeled on options-notes.js: lazy render on tab activation, same
// accordion row family, same confirm-popover delete idiom.
// ============================================================

let _vocabRenderGen = 0; // guards stale async renders (account switch mid-fetch)
let _vocabRows = [];     // last render's rows, kept for export
let _vocabViewRows = []; // current filtered + sorted view (selection boundary)
let _vocabSelected = new Set();
let _vocabBatchMarkTimer = null; // expiring .motion-toggle mark on the batch toolbar
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
let _vocabFlashTimer = 0; // guards two flashes racing to clear each other's text early
let _vocabOwnerLabel = ""; // decoded non-secret Pinboard username for visible scope copy
let _vocabDriveBusy = false;
let _vocabDriveActionSeq = 0;
const PBP_VOCAB_RENDER_BATCH = 100;
const PBP_VOCAB_GOOGLE_API_ORIGIN = "https://www.googleapis.com/*";
const _vocabCollator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

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

// Owner derivation: the ONLY correct path is the same atomic secret-aware
// read every other account-scoped consumer uses (pbpReadSettingsWithSecrets
// picks the right storage area and overlays the local secret when sync is
// routed) -- never split/decode opt-pinboard-token's raw form field value
// here. pbpPinboardAccountFromToken deobfuscates internally, so the raw
// (still-obfuscated) token read from storage is passed through as-is.
async function pbpVocabCurrentOwner() {
  const s = await pbpReadSettingsWithSecrets({ pinboardToken: SETTINGS_DEFAULTS.pinboardToken });
  return pbpDictOwnerScope(pbpPinboardAccountFromToken(s.pinboardToken));
}

function pbpVocabOwnerLabel(owner) {
  const scope = String(owner || "");
  if (!scope.startsWith("acct_")) return t("vocabOwnerNoAccount");
  const encoded = scope.slice(5);
  try { return decodeURIComponent(encoded); } catch (_) { return encoded; }
}

function _pbpVocabBuildRow(w, index) {
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
  card.classList.toggle("selected", select.checked); // drives the overlay reveal
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

  // Render-index-based id, not w.id -- non-ASCII terms squashed by a regex
  // collide (two CJK words both become "_"), duplicating ids and breaking
  // aria-controls. Index within the current render generation is always
  // structurally unique, no hashing needed.
  const bodyId = "vocab-body-" + _vocabRenderGen + "-" + index;
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

  const body = document.createElement("div");
  body.id = bodyId;
  body.className = "notes-card-body";
  body.hidden = true;

  const itemsEl = document.createElement("div");
  itemsEl.className = "notes-items";
  // The full gloss used to exist only as the header's single-line ellipsis
  // chip -- reviewing a word meant looking it up again. The expanded card
  // shows what the save actually stored (multi-sentence AI glosses wrap).
  if (w.gloss || w.ipa) {
    const glossEl = document.createElement("div");
    glossEl.className = "notes-item";
    const glossText = document.createElement("div");
    glossText.className = "notes-item-text";
    if (w.ipa) {
      const ipaEl = document.createElement("div");
      ipaEl.className = "vocab-gloss-ipa";
      ipaEl.textContent = w.ipa;
      glossText.appendChild(ipaEl);
    }
    if (w.gloss) {
      const defEl = document.createElement("div");
      defEl.className = "vocab-gloss-text";
      defEl.textContent = w.gloss;
      glossText.appendChild(defEl);
    }
    glossEl.appendChild(glossText);
    itemsEl.appendChild(glossEl);
  }
  const contexts = Array.isArray(w.contexts) ? w.contexts : [];
  for (const c of contexts) {
    if (!c) continue;
    const itemEl = document.createElement("div");
    itemEl.className = "notes-item";
    const textEl = document.createElement("div");
    textEl.className = "notes-item-text";
    const quoteEl = document.createElement("div");
    quoteEl.className = "notes-item-quote";
    quoteEl.textContent = c.quote || "";
    textEl.appendChild(quoteEl);
    const safeHref = pbpDictSafeUrl(c.articleUrl);
    if (safeHref) {
      const link = document.createElement("a");
      link.className = "notes-row-open";
      link.href = safeHref;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = c.articleTitle || safeHref;
      textEl.appendChild(link);
    }
    itemEl.appendChild(textEl);
    itemsEl.appendChild(itemEl);
  }
  // Note editor. The field, its concurrent-merge rule and the Drive privacy
  // copy ("may include ... notes") all existed with no way to type into it.
  // Save is explicit (mutation-at-confirm discipline, same as every other
  // vocab edit); the button only appears once the text actually differs.
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
      if (!ok) _pbpVocabFlashStatus(false, t("vocabBatchFailed"));
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
  itemsEl.appendChild(noteWrap);
  body.appendChild(itemsEl);
  card.appendChild(body);

  head.addEventListener("click", () => {
    const open = body.hidden;
    body.hidden = !open;
    head.setAttribute("aria-expanded", open ? "true" : "false");
  });

  return card;
}

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
  // Keep every visible row's checkbox and .selected overlay state in step
  // with the selection set (shift-range and select-all mutate rows that were
  // not the click target).
  document.querySelectorAll("#vocab-list > .vocab-card").forEach((el) => {
    const on = _vocabSelected.has(el.dataset.vocabId);
    el.classList.toggle("selected", on);
    const cb = el.querySelector(".vocab-row-select");
    if (cb && cb.checked !== on) cb.checked = on;
  });
  const selectedCount = _vocabSelected.size;
  const selectedEl = $id("vocab-selected-count");
  if (selectedEl) selectedEl.textContent = t("vocabSelectedCount", String(selectedCount));
  const batch = $id("vocab-batch-toolbar");
  if (batch) {
    const nextHidden = selectedCount === 0;
    if (batch.hidden !== nextHidden) {
      // Arm the height bridge (options.css .motion-toggle) only when the flag
      // really flips on a selection change; the mark expires so tab resets and
      // list reloads keep their instant hide.
      batch.classList.add("motion-toggle");
      clearTimeout(_vocabBatchMarkTimer);
      _vocabBatchMarkTimer = setTimeout(() => batch.classList.remove("motion-toggle"), 400);
      batch.hidden = nextHidden;
    }
  }
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

// Eudic is a Chinese-market product behind a token the user has to fetch by
// hand, but "en" is one of its supported languages, so the language test alone
// showed the button to anyone who had ever saved an English word -- and it
// then failed on dictEudicTokenRequired. Reading the token here would need an
// await in a render path, so presence is cached and refreshed on the same
// signals that already invalidate this panel. The token FIELD in settings
// stays visible either way; that is where the feature is meant to be found.
let _vocabEudicConfigured = false;

async function _pbpVocabRefreshEudicConfigured() {
  try {
    const s = await pbpReadSettingsWithSecrets({ dictEudicToken: SETTINGS_DEFAULTS.dictEudicToken });
    _vocabEudicConfigured = !!(s && s.dictEudicToken);
  } catch (_) { _vocabEudicConfigured = false; }
}

function _pbpVocabUpdateExternalActions() {
  const eudicBtn = $id("vocab-eudic-btn");
  if (eudicBtn) {
    // External sends intentionally stay scoped to ALL current-owner rows,
    // never the UI selection or the current search result.
    eudicBtn.hidden = !_vocabEudicConfigured
      || typeof pbpEudicPartition !== "function"
      || pbpEudicPartition(_vocabRows).byLang.size === 0;
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
  rows.slice(start, target).forEach((w, i) => fragment.appendChild(_pbpVocabBuildRow(w, start + i)));
  list.appendChild(fragment);
  const more = $id("vocab-load-more");
  if (more) {
    const remaining = Math.max(0, rows.length - target);
    more.hidden = remaining === 0;
    more.textContent = t("vocabLoadMore", String(Math.min(PBP_VOCAB_RENDER_BATCH, remaining)));
  }
  _pbpVocabUpdateExternalActions();
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
  for (const id of ["vocab-empty", "vocab-no-results", "vocab-load-more", "vocab-batch-toolbar"]) {
    const el = $id(id); if (el) el.hidden = true;
  }
  _pbpVocabRefreshGroupOptions(false);
  _pbpVocabSyncSelectionUi();
  _pbpVocabUpdateExternalActions();
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
    // A newer mutation, tab activation or account-change render owns every
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

function _pbpVocabDriveClear() {
  const clearNotices = $id("vocab-drive-clear-notices");
  if (clearNotices) clearNotices.hidden = true;
  for (const id of [
    "vocab-drive-state", "vocab-drive-account", "vocab-drive-owner",
    "vocab-drive-last-success", "vocab-drive-pending-words",
    "vocab-drive-pending-batches", "vocab-drive-error", "vocab-drive-notices"
  ]) {
    const el = $id(id);
    if (el) {
      el.replaceChildren();
      el.classList.remove("ok", "bad");
    }
  }
  const fields = $id("vocab-drive-fields");
  if (fields) fields.hidden = true;
  for (const id of ["vocab-drive-connect", "vocab-drive-sync", "vocab-drive-disconnect"]) {
    const button = $id(id);
    if (button) button.hidden = true;
  }
}

function _pbpVocabDriveDate(value) {
  if (!Number.isFinite(value) || value <= 0) return "";
  try {
    const locale = typeof uiLangToBCP47 === "function" ? uiLangToBCP47() : undefined;
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium", timeStyle: "short"
    }).format(new Date(value));
  } catch (_) {
    return new Date(value).toLocaleString();
  }
}

function _pbpVocabDriveErrorKey(code) {
  return ({
    auth: "vocabDriveErrorAuth",
    pinboard_auth: "vocabDriveErrorPinboardAuth",
    permission: "vocabDriveErrorPermission",
    corrupt: "vocabDriveErrorCorrupt",
    local_store: "vocabDriveErrorLocalStore",
    network: "vocabDriveErrorNetwork",
    account_changed: "vocabDriveErrorAccountChanged",
    entry_too_large: "vocabDriveErrorEntryTooLarge"
  })[code] || "vocabDriveErrorRemote";
}

function _pbpVocabDriveAvailable() {
  try {
    return pbpVocabDriveOAuthActive(chrome.runtime.getManifest());
  } catch (_) {
    return false;
  }
}

function _pbpVocabDriveRenderUnavailable() {
  _pbpVocabDriveClear();
  const actions = $id("vocab-drive-actions");
  if (actions) actions.hidden = true;
  const state = $id("vocab-drive-state");
  if (state) state.textContent = t("vocabDriveUnavailable");
  _pbpVocabDriveSetBusy(false);
}

function _pbpVocabDriveShowError(code, retryAt, blocked, connected) {
  const el = $id("vocab-drive-error");
  if (!el) return;
  const parts = [t(_pbpVocabDriveErrorKey(code))];
  const retry = _pbpVocabDriveDate(retryAt);
  if (retry) parts.push(t("vocabDriveRetryAt", retry));
  // Every state that cannot proceed on its own names a button that is actually
  // on screen. A blocked account only clears through a forced run, so Sync now
  // is the exit for the codes reconnecting cannot fix; while disconnected the
  // Disconnect button is hidden, so the hint has to point at Connect instead.
  // Anything still retrying already shows its next-retry time and needs no
  // instruction.
  if (blocked) {
    if (code === "auth" || code === "permission") {
      parts.push(t(connected ? "vocabDriveReconnectRequired" : "vocabDriveConnectRequired"));
    } else if (code !== "entry_too_large") {
      parts.push(t("vocabDriveSyncNowRequired"));
    }
  }
  setStatusIcon(el, false, parts.join(" "));
}

function _pbpVocabDriveSetBusy(busy, focusOwner, phaseKey) {
  _vocabDriveBusy = !!busy;
  const body = $id("vocab-drive-body");
  if (body) body.setAttribute("aria-busy", String(_vocabDriveBusy));
  // A first sync can page through Drive for minutes. Without this the state
  // line keeps whatever it said before -- usually "not connected" -- for the
  // whole run, so the panel reads as if the click did nothing. Only written
  // while busy; _pbpVocabDriveRender owns the line the rest of the time.
  // The authorization phase needs its own line: getAuthToken({interactive})
  // opens a Chrome sign-in or consent window and waits indefinitely, so the
  // panel sits busy until the user acts in a DIFFERENT window. Saying "syncing
  // vocabulary" there reads as a hang and hides the fact that it is their move.
  const state = $id("vocab-drive-state");
  if (state && _vocabDriveBusy) {
    state.classList.remove("ok", "bad");
    state.textContent = t(phaseKey || "vocabDriveWorking");
  }
  for (const id of ["vocab-drive-connect", "vocab-drive-sync", "vocab-drive-disconnect"]) {
    const button = $id(id);
    if (!button) continue;
    const keepFocused = _vocabDriveBusy && button === focusOwner;
    button.disabled = _vocabDriveBusy && !keepFocused;
    if (keepFocused) button.setAttribute("aria-disabled", "true");
    else button.removeAttribute("aria-disabled");
  }
}

function _pbpVocabDriveRender(status) {
  if (!_pbpVocabDriveAvailable()) {
    _pbpVocabDriveRenderUnavailable();
    return;
  }
  _pbpVocabDriveClear();
  const actions = $id("vocab-drive-actions");
  if (actions) actions.hidden = false;
  const connected = status?.connected === true;
  const state = $id("vocab-drive-state");
  const connect = $id("vocab-drive-connect");
  const sync = $id("vocab-drive-sync");
  const disconnect = $id("vocab-drive-disconnect");
  if (connect) connect.hidden = connected;
  if (sync) sync.hidden = !connected;
  if (disconnect) disconnect.hidden = !connected;
  if (!connected) {
    if (state) state.textContent = t("vocabDriveDisconnected");
    _pbpVocabDriveSetBusy(false);
    return;
  }

  if (state) setStatusIcon(state, true, t("vocabDriveConnected"));
  const fields = $id("vocab-drive-fields");
  if (fields) fields.hidden = false;
  const email = String(status.emailAddress || "");
  const displayName = String(status.displayName || "");
  const account = $id("vocab-drive-account");
  if (account) account.textContent = displayName && email
    ? `${displayName} (${email})` : (displayName || email);
  const owner = $id("vocab-drive-owner");
  // An empty row reads as a rendering glitch; the panel is scoped to a Pinboard
  // account, so say when there isn't one. Same label the vocabulary list uses.
  if (owner) owner.textContent = String(status.owner || "") || t("vocabOwnerNoAccount");
  const lastSuccess = $id("vocab-drive-last-success");
  if (lastSuccess) lastSuccess.textContent =
    _pbpVocabDriveDate(status.lastSuccessAt) || t("vocabDriveNever");
  const pendingWords = $id("vocab-drive-pending-words");
  if (pendingWords) pendingWords.textContent =
    Math.max(0, Number(status.pendingWords) || 0).toLocaleString();
  const pendingBatches = $id("vocab-drive-pending-batches");
  if (pendingBatches) pendingBatches.textContent =
    Math.max(0, Number(status.pendingBatches) || 0).toLocaleString();
  const notices = $id("vocab-drive-notices");
  // Zero is the normal state; rendering "Delete conflict notices: 0" leaves a
  // permanent line of jargon on a healthy account and makes the live region
  // announce a non-event on every render. When it is not zero, a bare number
  // names nothing -- say which words and what happened to them, and offer a
  // way to dismiss, since nothing else ever clears these rows.
  const noticeCount = Math.max(0, Number(status.notices) || 0);
  if (notices) {
    const terms = Array.isArray(status.noticeTerms) ? status.noticeTerms : [];
    const parts = noticeCount > 0 ? [t("vocabDriveNotices", noticeCount.toLocaleString())] : [];
    if (terms.length) parts.push(t("vocabDriveNoticesExplain", terms.join(", ")));
    notices.textContent = parts.join(" ");
    notices.classList.toggle("bad", noticeCount > 0);
  }
  const clearNoticesBtn = $id("vocab-drive-clear-notices");
  if (clearNoticesBtn) clearNoticesBtn.hidden = noticeCount === 0;
  if (status.lastError) {
    _pbpVocabDriveShowError(status.lastError, status.retryAt, status.blocked === true, true);
  }
  _pbpVocabDriveSetBusy(false);
}

function _pbpVocabDriveApplyResponse(response, fallbackStatus) {
  const status = response?.status || (response?.ok ? fallbackStatus : null);
  if (status) _pbpVocabDriveRender(status);
  if (!response?.ok) {
    // A blocked preflight is the authoritative reason and outranks whatever
    // this attempt reported. Otherwise the code this run produced wins: a
    // persisted lastError may predate the run and would mislabel it.
    const code = status?.blocked === true
      ? (status.lastError || response?.error)
      : (response?.error || status?.lastError);
    // Not connected is a state, not a failure. The re-render above already
    // says so and puts Connect on screen; a red line repeating it adds noise
    // and no next step.
    if (code === "not_connected") return status;
    _pbpVocabDriveShowError(
      code, status?.retryAt, status?.blocked === true, status?.connected === true
    );
  }
  return status;
}

// A pull writes words straight into IndexedDB from the service worker, and
// nothing notifies this page. Without this the list keeps showing the snapshot
// renderVocabPanel took before its own sync finished, so a second device reads
// "no words saved" immediately after its first successful sync.
async function _pbpVocabDriveReloadRows(gen) {
  if (gen !== _vocabRenderGen) return;
  let owner = "";
  try { owner = await pbpVocabCurrentOwner(); } catch (_) { return; }
  if (!owner || gen !== _vocabRenderGen) return;
  await _pbpVocabReloadAfterMutation(owner, gen);
}

// The status read is the only thing that un-hides the action row, so when it
// fails the panel is left with an error and no button at all -- the container
// ships hidden and _pbpVocabDriveClear re-hides all three on every render.
// Offer Connect: with the grant already in place it resolves immediately and
// force-syncs, so it doubles as the retry this panel otherwise lacks.
function _pbpVocabDriveOfferRetry() {
  const actions = $id("vocab-drive-actions");
  if (actions) actions.hidden = false;
  const connect = $id("vocab-drive-connect");
  if (connect) connect.hidden = false;
  _pbpVocabDriveSetBusy(false);
}

async function _pbpVocabDriveRefresh(gen, requestSync) {
  if (!_pbpVocabDriveAvailable()) {
    _pbpVocabDriveRenderUnavailable();
    return;
  }
  let actionSeq = 0;
  const loading = $id("vocab-drive-state");
  if (loading) loading.textContent = t("vocabDriveLoading");
  try {
    const response = await chrome.runtime.sendMessage({ type: "vocabDriveStatus" });
    if (gen !== _vocabRenderGen) return;
    if (!response?.ok) {
      const state = $id("vocab-drive-state");
      if (state) state.textContent = t("vocabDriveStatusFailed");
      _pbpVocabDriveShowError(response?.error);
      _pbpVocabDriveOfferRetry();
      return;
    }
    _pbpVocabDriveRender(response.status);
    if (!requestSync || response.status?.connected !== true) return;
    actionSeq = ++_vocabDriveActionSeq;
    _pbpVocabDriveSetBusy(true);
    const synced = await chrome.runtime.sendMessage({ type: "vocabDriveSyncNow" });
    if (gen !== _vocabRenderGen || actionSeq !== _vocabDriveActionSeq) return;
    _pbpVocabDriveApplyResponse(synced, response.status);
    if (synced?.ok) {
      await _pbpVocabDriveReloadRows(gen);
      _pbpVocabFlashStatus(true, t("vocabDriveSynced"));
    }
  } catch (_) {
    if (gen !== _vocabRenderGen ||
        (actionSeq && actionSeq !== _vocabDriveActionSeq)) return;
    const state = $id("vocab-drive-state");
    if (state) state.textContent = t("vocabDriveStatusFailed");
    _pbpVocabDriveShowError("remote");
    _pbpVocabDriveOfferRetry();
  } finally {
    if (actionSeq && actionSeq === _vocabDriveActionSeq) {
      _pbpVocabDriveSetBusy(false);
    }
  }
}

async function _pbpVocabDriveSend(type, force, gen, actionSeq, sourceButton, focusTargetId) {
  if (!_pbpVocabDriveAvailable()) {
    _pbpVocabDriveRenderUnavailable();
    return;
  }
  try {
    const message = { type };
    if (force === true) message.force = true;
    const response = await chrome.runtime.sendMessage(message);
    if (gen !== _vocabRenderGen || actionSeq !== _vocabDriveActionSeq) return;
    const moveFocus = document.activeElement === sourceButton;
    _pbpVocabDriveApplyResponse(response);
    const preferred = moveFocus && focusTargetId ? $id(focusTargetId) : null;
    const target = preferred && !preferred.hidden
      ? preferred : (moveFocus && sourceButton && !sourceButton.hidden ? sourceButton : null);
    if (target && !target.hidden) {
      try { target.focus({ preventScroll: true }); }
      catch (_) { target.focus(); }
    }
    // Connect and Sync now both run a full sync; Disconnect touches no words.
    // The flash comes last: the reload writes the loading state to the same
    // status line and would clear it. Last successful sync is minute-precise,
    // so without this two clicks inside one minute change nothing on screen.
    if (response?.ok && type !== "vocabDriveDisconnect") {
      await _pbpVocabDriveReloadRows(gen);
      _pbpVocabFlashStatus(true, t("vocabDriveSynced"));
    }
  } catch (_) {
    if (gen === _vocabRenderGen && actionSeq === _vocabDriveActionSeq) {
      _pbpVocabDriveShowError("remote");
    }
  } finally {
    if (actionSeq === _vocabDriveActionSeq) _pbpVocabDriveSetBusy(false);
  }
}

async function _pbpVocabDriveConnect() {
  if (_vocabDriveBusy || !_pbpVocabDriveAvailable()) return;
  const gen = _vocabRenderGen;
  const actionSeq = ++_vocabDriveActionSeq;
  const sourceButton = $id("vocab-drive-connect");
  let granted = false;
  try {
    const permission = chrome.permissions.request({
      permissions: ["identity"],
      origins: [PBP_VOCAB_GOOGLE_API_ORIGIN]
    });
    _pbpVocabDriveSetBusy(true, sourceButton, "vocabDriveAuthorizing");
    granted = await permission;
  } catch (_) {}
  if (gen !== _vocabRenderGen || actionSeq !== _vocabDriveActionSeq) {
    if (actionSeq === _vocabDriveActionSeq) _pbpVocabDriveSetBusy(false);
    return;
  }
  if (!granted) {
    _pbpVocabDriveSetBusy(false);
    setStatusIcon($id("vocab-drive-error"), false, t("vocabDrivePermissionDenied"));
    return;
  }
  return _pbpVocabDriveSend(
    "vocabDriveConnect", false, gen, actionSeq, sourceButton, "vocab-drive-sync"
  );
}

async function _pbpVocabDriveAction(type, force, focusTargetId) {
  if (_vocabDriveBusy || !_pbpVocabDriveAvailable()) return;
  const gen = _vocabRenderGen;
  const actionSeq = ++_vocabDriveActionSeq;
  const sourceButton = type === "vocabDriveDisconnect"
    ? $id("vocab-drive-disconnect") : $id("vocab-drive-sync");
  _pbpVocabDriveSetBusy(true, sourceButton);
  return _pbpVocabDriveSend(
    type, force, gen, actionSeq, sourceButton, focusTargetId
  );
}

// Called from options.js's activateTab -- the sole lazy-init line added
// there, same convention as renderNotesPanel/renderStoragePanel (rescans
// every activation, no "already inited" guard). _vocabRenderGen guards a
// slow fetch that's still in flight when the account changes again (or the
// user leaves and re-enters the tab) from clobbering a newer render.
async function renderVocabPanel() {
  if (!$id("vocab-list")) return;
  const gen = ++_vocabRenderGen;
  ++_vocabDriveActionSeq;
  _pbpVocabDriveClear();
  _pbpVocabDriveSetBusy(false);
  if (_pbpVocabDriveAvailable()) _pbpVocabDriveRefresh(gen, true);
  else _pbpVocabDriveRenderUnavailable();
  // Fire-and-forget like the Drive refresh above: the button starts hidden and
  // appears only once a token is confirmed, which is the honest default.
  _pbpVocabRefreshEudicConfigured().then(_pbpVocabUpdateExternalActions);
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
  _pbpPackRefreshStatus();
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

// Fail-closed on account switch: owner is re-derived AFTER the rows fetch
// resolves and compared against the owner the rows were fetched for. If they
// differ (token rotated, or sync/keys-routing toggled mid-fetch), the export
// aborts BEFORE the Blob is built -- never download the previous account's
// words under the new account's export click. The whole chain is wrapped so
// any rejection (owner read, IDB read) surfaces feedback instead of dying
// silently (this runs as a click handler; an unhandled rejection there is
// invisible to the user).
async function _pbpVocabExport() {
  const btn = $id("vocab-export-btn");
  if (!btn || btn.disabled) return; // double-click guard, same as the Anki/Eudic buttons
  btn.disabled = true;
  try {
    // A just-edited setting may still sit in the options page's debounced
    // auto-save; flush it first, same ordering as the Anki/Eudic sends
    // (Codex final-review MEDIUM precedent), and abort if the flush fails.
    if (typeof window.pbpOptionsFlushAutoSave === "function") {
      let flushed = null;
      try { flushed = await window.pbpOptionsFlushAutoSave(); } catch (_) {}
      if (!flushed || !flushed.ok) { _pbpVocabFlashStatus(false, t("vocabSettingsSaveFailed")); return; }
    }
    const owner = await pbpVocabCurrentOwner();
    const rows = await pbpVocabAll(owner);
    const ownerNow = await pbpVocabCurrentOwner();
    if (ownerNow !== owner) {
      _pbpVocabFlashStatus(false, t("vocabAccountChanged"));
      return;
    }
    // Enrichment is another await, so the owner is rechecked AFTER it and before
    // a Blob exists: the file must never be built from a previous account's rows.
    const zhMap = await _pbpVocabZhMap(rows);
    const zhTag = await _pbpVocabEcdictTag();
    const ownerBeforeBlob = await pbpVocabCurrentOwner();
    if (ownerBeforeBlob !== owner) {
      _pbpVocabFlashStatus(false, t("vocabAccountChanged"));
      return;
    }
    const tsv = pbpDictTsv(rows.map((w) => _pbpVocabCanonicalRow(w, zhMap, zhTag)));
    const blob = new Blob([tsv], { type: "text/tab-separated-values" });
    const a = document.createElement("a");
    const d = new Date();
    const stamp = d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0");
    a.href = URL.createObjectURL(blob);
    a.download = "vocab-" + stamp + ".tsv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  } catch (_) {
    _pbpVocabFlashStatus(false, t("vocabExportFailed"));
  } finally {
    btn.disabled = false;
  }
}

// First few names only: the status line is one line, and five terms are
// enough to spot the pattern (the counts still carry the full totals).
function _pbpVocabTermList(terms) {
  const list = terms.slice(0, 5).join(", ");
  return terms.length > 5 ? list + "…" : list;
}

// Send-to-Anki click chain. Ordering is the spec (anki spec rev2 §3):
// (1) FIRST await = chrome.permissions.request (user gesture; already-granted
// resolves true without UI), (2) requestPermission as the first AnkiConnect
// action, (3..n) owner derived AFTER the permission awaits and re-checked
// via ownerCheck before every later dispatch -- the permission dialogs can
// sit open long enough for an account switch (fail-closed invariant).
// Canonical row shared by the TSV export and the Anki send (spec: both
// derive from the SAME canonical shape; the Anki side escapes its own copy).
// Derived on this device from the local ECDICT pack, for the export paths only.
// COMPUTE-ONLY: nothing here writes pbp-vocab or reaches Drive. vocab-store.js
// stays the sole writer, the 13 stored fields are untouched, and "the current
// owner's whole vocabulary" keeps meaning exactly what it meant before.
// One batched transaction for the whole export, never one per row.
async function _pbpVocabZhMap(words) {
  if (typeof pbpEcdictLookupMany !== "function") return new Map();
  const keys = [];
  for (const w of words) {
    // English only, and the saved lemma is a second chance for an inflected form.
    // Compared through the same primary-language helper vocab-store uses for
    // record identity: a stored tag may carry a region, and a bare === "en"
    // would then match nothing and silently enrich no row at all.
    if (_pbpVocabPrimary(w.language) !== "en") continue;
    if (w.term) keys.push(w.term);
    if (w.lemma) keys.push(w.lemma);
  }
  if (!keys.length) return new Map();
  try { return await pbpEcdictLookupMany(keys); } catch (_) { return new Map(); }
}

// vocab-store.js defines pbpDictPrimaryLang and options.html loads it; the
// fallback only keeps this from throwing if the load order ever changes.
function _pbpVocabPrimary(code) {
  if (typeof pbpDictPrimaryLang === "function") return pbpDictPrimaryLang(code);
  return String(code || "").trim().toLowerCase().split(/[-_]/)[0];
}

function _pbpVocabZhFor(w, zhMap) {
  if (!zhMap || !zhMap.size || _pbpVocabPrimary(w.language) !== "en") return "";
  const hit = (w.term && zhMap.get(pbpEcdictKey(w.term))) ||
              (w.lemma && zhMap.get(pbpEcdictKey(w.lemma)));
  if (!hit || !hit.length) return "";
  // Every matching record, not just the first. Case folding collapses distinct
  // headwords onto one key ("US" and "us"), so hit[0] would export whichever the
  // imported file listed first and lose the other sense entirely.
  const seen = new Set();
  const out = [];
  for (const r of hit) {
    for (const sense of pbpEcdictSenses(r.translation)) {
      if (seen.has(sense)) continue;
      seen.add(sense);
      out.push(sense);
    }
  }
  return out.join("; ");
}

// zh and zhNote stay SEPARATE from definition/license: the Anki path has to
// escape each piece on its own before joining them with its own trusted <br>,
// and pre-joining here would either double-escape or smuggle markup through.
function _pbpVocabCanonicalRow(w, zhMap, tag) {
  const zh = _pbpVocabZhFor(w, zhMap);
  return {
    term: w.term,
    // Only pbpAnkiNoteFromRow reads these two (they become note tags);
    // pbpDictTsv ignores unknown keys, so the TSV shape is untouched.
    language: w.language || "",
    groups: pbpVocabGroups(w),
    reading: w.ipa || "",
    definition: (w.gloss || "").replace(/\s*\n\s*/g, " "),
    contexts: (Array.isArray(w.contexts) ? w.contexts : []).map((c) => c && c.quote).filter(Boolean),
    source: (w.contexts && w.contexts[0] && w.contexts[0].articleUrl) || "",
    license: [w.license, w.sourceUrl].filter(Boolean).join(" "),
    zh,
    // Labelled so the local Chinese never looks like it came from the online
    // entry, and carrying the diagnostic pack identity. Never presented as a
    // confirmed data licence.
    zhNote: zh ? t("vocabZhFromPack") + (tag ? " (" + tag + ")" : "") : ""
  };
}

// Diagnostic identity of the imported pack: rung plus a short slice of the
// CRC32. Not an identity or licence claim -- 32 bits collide.
// Read AFTER the lookup and passed per export, never held in a module variable:
// reading it first let a pack swapped in mid-export label content that came from
// a different pack, and one variable let a TSV and an Anki send overwrite each
// other's label.
async function _pbpVocabEcdictTag() {
  try {
    const meta = (typeof pbpEcdictMeta === "function") ? await pbpEcdictMeta() : null;
    return meta && meta.state === "ready"
      ? "ECDICT " + (meta.rung || "") + " " + String(meta.decodedCrc32 || "").slice(0, 8)
      : "";
  } catch (_) { return ""; }
}

async function _pbpVocabSendAnki() {
  const btn = $id("vocab-anki-btn");
  if (!btn || btn.disabled) return;
  btn.disabled = true;
  const orig = btn.textContent;
  try {
    btn.textContent = t("dictAnkiSending");
    // The permission pattern depends on the configurable port, so one fast
    // settings read precedes permissions.request. Transient activation is a
    // TIME window (~5s), not a microtask budget; a single storage read stays
    // well inside it. A port typed within the 500ms auto-save debounce may
    // read stale once -- worst case is a connection error and a retry.
    const preRead = await pbpReadSettingsWithSecrets({ dictAnkiPort: SETTINGS_DEFAULTS.dictAnkiPort });
    const port = preRead.dictAnkiPort;
    const pattern = pbpEndpointOriginPattern(pbpAnkiEndpointFor(port));
    let granted = false;
    try { granted = await chrome.permissions.request({ origins: [pattern] }); } catch (_) {}
    if (!granted) { _pbpVocabFlashStatus(false, t("dictAnkiHostPermissionDenied")); return; }
    // requestPermission FIRST (spec §3): the long human-approval wait happens
    // BEFORE owner derivation, so the owner snapshot below stays fresh.
    const perm = await pbpAnkiCall("requestPermission", {}, "", 120000, port);
    if (!perm.ok || !perm.result) { _pbpVocabFlashStatus(false, t("dictAnkiConnectPermissionFailed")); return; }
    if (perm.result.permission !== "granted") { _pbpVocabFlashStatus(false, t("dictAnkiConnectPermissionDenied")); return; }
    const apiVersion = Number(perm.result.version);
    if (!Number.isFinite(apiVersion) || apiVersion < 6) {
      _pbpVocabFlashStatus(false, t("dictAnkiVersionUnsupported"));
      return;
    }
    const keyRequired = perm.result.requireApiKey === true || perm.result.requireApikey === true;
    // A just-edited deck/key may still sit in the options page's 500ms
    // debounced auto-save; flush it so the read below sees what the user
    // sees, and abort if the save fails (Codex final-review MEDIUM).
    if (typeof window.pbpOptionsFlushAutoSave === "function") {
      let flushed = null;
      try { flushed = await window.pbpOptionsFlushAutoSave(); } catch (_) {}
      if (!flushed || !flushed.ok) { _pbpVocabFlashStatus(false, t("vocabSettingsSaveFailed")); return; }
    }
    const raw = await pbpReadSettingsWithSecrets({
      dictAnkiDeck: SETTINGS_DEFAULTS.dictAnkiDeck,
      dictAnkiKey: SETTINGS_DEFAULTS.dictAnkiKey
    });
    const s = deobfuscateSettings(raw);
    if (keyRequired && !s.dictAnkiKey) { _pbpVocabFlashStatus(false, t("dictAnkiKeyRequired")); return; }
    const owner = await pbpVocabCurrentOwner();
    const rows = await pbpVocabAll(owner);
    if ((await pbpVocabCurrentOwner()) !== owner) { _pbpVocabFlashStatus(false, t("vocabAccountChanged")); return; }
    if (!rows.length) { _pbpVocabFlashStatus(false, t("dictAnkiNothing")); return; }
    const zhMap = await _pbpVocabZhMap(rows);
    const zhTag = await _pbpVocabEcdictTag();
    const ownerBeforeSend = await pbpVocabCurrentOwner();
    if (ownerBeforeSend !== owner) {
      _pbpVocabFlashStatus(false, t("vocabAccountChanged"));
      return;
    }
    const canonical = rows.map((w) => _pbpVocabCanonicalRow(w, zhMap, zhTag));
    const res = await pbpAnkiSendRows(canonical, {
      deck: s.dictAnkiDeck || "Pinboard Vocab",
      key: s.dictAnkiKey || "",
      port,
      ownerCheck: async () => (await pbpVocabCurrentOwner()) === owner
    });
    if (res.stage === "done") {
      let msg = t("dictAnkiResult", String(res.added), String(res.skipped), String(res.failed));
      // Name the casualties: a bare count leaves "re-send the whole library
      // and hope" as the only recovery move.
      if (res.failed > 0 && Array.isArray(res.failedTerms) && res.failedTerms.length) {
        msg += " · " + t("vocabFailedTerms", _pbpVocabTermList(res.failedTerms));
      }
      _pbpVocabFlashStatus(res.failed === 0, msg);
    } else if (res.stage === "modelMismatch") {
      _pbpVocabFlashStatus(false, t("dictAnkiModelMismatch"));
    } else if (res.stage === "modelFields") {
      _pbpVocabFlashStatus(false, t("dictAnkiFieldCheckFailed"));
    } else if (res.stage === "owner") {
      _pbpVocabFlashStatus(false, t("vocabAccountChanged"));
    } else {
      // Pipeline stages (deck/model/precheck/add) carry AnkiConnect's own
      // error text; use the generic send failure only when no detail exists.
      _pbpVocabFlashStatus(false, res.error || t("dictAnkiFailed"));
    }
  } catch (_) {
    _pbpVocabFlashStatus(false, t("dictAnkiFailed"));
  } finally {
    btn.textContent = orig;
    btn.disabled = false;
  }
}

async function _pbpVocabSendEudic() {
  const btn = $id("vocab-eudic-btn");
  if (!btn || btn.disabled) return;
  btn.disabled = true;
  const orig = btn.textContent;
  try {
    btn.textContent = t("dictEudicSending");
    const pattern = pbpEndpointOriginPattern(PBP_EUDIC_ENDPOINT);
    let granted = false;
    try { granted = await chrome.permissions.request({ origins: [pattern] }); } catch (_) {}
    if (!granted) { _pbpVocabFlashStatus(false, t("dictEudicHostPermissionDenied")); return; }
    if (typeof window.pbpOptionsFlushAutoSave === "function") {
      let flushed = null;
      try { flushed = await window.pbpOptionsFlushAutoSave(); } catch (_) {}
      if (!flushed || !flushed.ok) { _pbpVocabFlashStatus(false, t("vocabSettingsSaveFailed")); return; }
    }
    const raw = await pbpReadSettingsWithSecrets({ dictEudicToken: SETTINGS_DEFAULTS.dictEudicToken });
    const s = deobfuscateSettings(raw);
    if (!s.dictEudicToken) { _pbpVocabFlashStatus(false, t("dictEudicTokenRequired")); return; }
    const owner = await pbpVocabCurrentOwner();
    const rows = await pbpVocabAll(owner);
    if ((await pbpVocabCurrentOwner()) !== owner) { _pbpVocabFlashStatus(false, t("vocabAccountChanged")); return; }
    const res = await pbpEudicSendRows(rows, {
      token: s.dictEudicToken,
      ownerCheck: async () => (await pbpVocabCurrentOwner()) === owner
    });
    if (res.stage === "owner") {
      _pbpVocabFlashStatus(false, t("vocabAccountChanged"));
    } else if (res.stage === "auth") {
      _pbpVocabFlashStatus(false, t("dictEudicTokenRequired"));
    } else if (res.forbidden) {
      _pbpVocabFlashStatus(false, t("dictEudicRejected"));
    } else if (res.failed) {
      // Parameter errors surface the server's own message (spec §2).
      let msg = res.error || t("dictEudicFailed");
      if (Array.isArray(res.failedTerms) && res.failedTerms.length) {
        msg += " · " + t("vocabFailedTerms", _pbpVocabTermList(res.failedTerms));
      }
      _pbpVocabFlashStatus(false, msg);
    } else if (res.generic) {
      // ANY generic batch poisons the totals -- never show a partial count
      // as if it were the whole story.
      _pbpVocabFlashStatus(true, t("dictEudicGenericOk"));
    } else {
      let msg = t("dictEudicResult", String(res.added), String(res.skipped), String(res.unsupported));
      if (res.unsupported > 0 && Array.isArray(res.unsupportedTerms) && res.unsupportedTerms.length) {
        msg += " · " + t("vocabUnsupportedTerms", _pbpVocabTermList(res.unsupportedTerms));
      }
      _pbpVocabFlashStatus(true, msg);
    }
  } catch (_) {
    _pbpVocabFlashStatus(false, t("dictEudicFailed"));
  } finally {
    btn.textContent = orig;
    btn.disabled = false;
  }
}

const _vocabAnkiBtn = $id("vocab-anki-btn");
if (_vocabAnkiBtn) _vocabAnkiBtn.addEventListener("click", _pbpVocabSendAnki);

const _vocabEudicBtn = $id("vocab-eudic-btn");
if (_vocabEudicBtn) _vocabEudicBtn.addEventListener("click", _pbpVocabSendEudic);

const _vocabExportBtn = $id("vocab-export-btn");
if (_vocabExportBtn) _vocabExportBtn.addEventListener("click", _pbpVocabExport);

const _vocabSearch = $id("vocab-search");
if (_vocabSearch) _vocabSearch.addEventListener("input", () => {
  _pbpVocabClearSelection();
  _pbpVocabApplyView(true);
});
for (const id of ["vocab-group-filter", "vocab-status-filter", "vocab-sort"]) {
  const control = $id(id);
  if (control) control.addEventListener("change", () => {
    _pbpVocabClearSelection();
    _pbpVocabApplyView(true);
  });
}
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
const _vocabDriveConnect = $id("vocab-drive-connect");
if (_vocabDriveConnect) _vocabDriveConnect.addEventListener("click", _pbpVocabDriveConnect);
const _vocabDriveSync = $id("vocab-drive-sync");
if (_vocabDriveSync) _vocabDriveSync.addEventListener("click", () =>
  _pbpVocabDriveAction("vocabDriveSyncNow", true));
const _vocabDriveClearNotices = $id("vocab-drive-clear-notices");
if (_vocabDriveClearNotices) _vocabDriveClearNotices.addEventListener("click", async () => {
  const gen = _vocabRenderGen;
  try {
    const response = await chrome.runtime.sendMessage({ type: "vocabDriveClearNotices" });
    if (gen !== _vocabRenderGen) return;
    _pbpVocabDriveApplyResponse(response);
  } catch (_) {
    if (gen === _vocabRenderGen) _pbpVocabDriveShowError("remote");
  }
});
const _vocabDriveDisconnect = $id("vocab-drive-disconnect");
if (_vocabDriveDisconnect) _vocabDriveDisconnect.addEventListener("click", () =>
  _pbpVocabDriveAction("vocabDriveDisconnect", false, "vocab-drive-connect"));

// Account switch (token rotation, or the sync/keys-routing toggles that
// change which area holds the effective token) invalidates every row
// currently shown -- re-render only when the vocab tab is the one on
// screen; renderVocabPanel's generation counter absorbs a rerun that lands
// after the user has already navigated away and back again.
if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" || area === "local") {
      if (changes.dictEudicToken) {
        _pbpVocabRefreshEudicConfigured().then(_pbpVocabUpdateExternalActions);
      }
    }
    if ((area !== "sync" && area !== "local") ||
        !(changes.pinboardToken || changes.optSyncEnabled || changes.syncApiKeys)) return;
    const activeBtn = document.querySelector(".tab-btn.active");
    if (activeBtn && activeBtn.dataset.panel === "vocab") {
      _pbpVocabClearVisibleState();
      renderVocabPanel();
    }
  });
}

// ---- Offline dictionary pack (dict-pack.js primitives; CC-CEDICT) -------
async function _pbpPackRefreshStatus() {
  const el = $id("dict-pack-status");
  const del = $id("dict-pack-delete");
  if (!el) return;
  let meta;
  try {
    meta = (typeof pbpPackMeta === "function") ? await pbpPackMeta() : { state:"error" };
  } catch (_) {
    meta = { state:"error" };
  }
  if (meta && meta.state === "ready") {
    const d = new Date(meta.importedAt);
    el.textContent = t("dictPackStatus", String(meta.entries),
      d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"));
    if (del) del.hidden = false;
  } else if (meta && meta.state === "error") {
    el.textContent = t("dictPackReadFailed");
    if (del) del.hidden = true;
  } else {
    el.textContent = t("dictPackEmpty");
    if (del) del.hidden = true;
  }
}

function _pbpPackWire() {
  const open = $id("dict-pack-open");
  const imp = $id("dict-pack-import");
  const file = $id("dict-pack-file");
  const del = $id("dict-pack-delete");
  if (!open || !imp || !file) return;
  open.addEventListener("click", () => {
    try { chrome.tabs.create({ url: "https://www.mdbg.net/chinese/dictionary?page=cc-cedict" }); } catch (_) {}
  });
  imp.addEventListener("click", () => file.click());
  file.addEventListener("change", async () => {
    const f = file.files && file.files[0];
    file.value = "";
    if (!f || imp.disabled) return;
    imp.disabled = true;
    const el = $id("dict-pack-status");
    let lastShown = 0;
    try {
      const res = await pbpPackImportFile(f, (n) => {
        // TIME-based throttle (~1s): aria-live must not machine-gun the
        // screen reader on a fast import; final state comes from refresh.
        const now = performance.now();
        if (el && now - lastShown >= 1000) { lastShown = now; el.textContent = t("dictPackImporting", String(n)); }
      });
      _pbpVocabFlashStatus(true, t("dictPackDone", String(res.entries)));
    } catch (_) {
      _pbpVocabFlashStatus(false, t("dictPackFailed"));
    } finally {
      imp.disabled = false;
      _pbpPackRefreshStatus();
    }
  });
  if (del) del.addEventListener("click", () => {
    showConfirmPopover(del, {
      msg: t("dictPackDeleteConfirm"),
      yesText: t("delete"),
      noText: t("cancel"),
      onConfirm: async () => {
        try {
          await pbpPackDelete();
          await _pbpPackRefreshStatus();
        } catch (_) {
          const status = $id("dict-pack-status");
          if (status) status.textContent = t("dictPackDeleteFailed");
        }
      }
    });
  });
  _pbpPackRefreshStatus();
}
_pbpPackWire();

// ---- Offline English->Chinese pack (ECDICT field layout) -----------------
// No download link and no "open download page" button, unlike the CC-CEDICT
// block above: that dataset's licence is explicit, this one's provenance is
// mixed, so the extension names the format and nothing else.
async function _pbpEcdictRefreshStatus() {
  const el = $id("ecdict-pack-status");
  const del = $id("ecdict-pack-delete");
  if (!el) return;
  let meta;
  try {
    meta = (typeof pbpEcdictMeta === "function") ? await pbpEcdictMeta() : { state: "error" };
  } catch (_) {
    meta = { state: "error" };
  }
  // A database newer than this page cannot be recovered from by retrying; only
  // a reload can. Say so instead of showing a generic read failure.
  if (typeof pbpPackIsStale === "function" && pbpPackIsStale()) {
    el.textContent = t("ecdictStaleReload");
    if (del) del.hidden = true;
    return;
  }
  if (meta && meta.state === "ready") {
    const d = new Date(meta.importedAt);
    el.textContent = t("ecdictReady", String(meta.entries),
      d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"));
    if (del) del.hidden = false;
  } else if (meta && meta.state === "error") {
    el.textContent = t("dictPackReadFailed");
    if (del) del.hidden = true;
  } else {
    // NOT dictPackEmpty: that string names MDBG, CC BY-SA 4.0 and .txt.gz, which
    // belong to the other pack entirely.
    el.textContent = t("ecdictEmpty");
    if (del) del.hidden = true;
  }
}

function _pbpEcdictWire() {
  const imp = $id("ecdict-pack-import");
  const file = $id("ecdict-pack-file");
  const del = $id("ecdict-pack-delete");
  if (!imp || !file) return;
  imp.addEventListener("click", () => file.click());
  file.addEventListener("change", async () => {
    const f = file.files && file.files[0];
    file.value = "";
    if (!f || imp.disabled) return;
    imp.disabled = true;
    const el = $id("ecdict-pack-status");
    let lastShown = 0;
    const tick = (n) => {
      // TIME-based throttle (~1s): aria-live must not machine-gun a screen
      // reader on a long import; the final state comes from the refresh.
      const now = performance.now();
      if (el && now - lastShown >= 1000) { lastShown = now; el.textContent = t("ecdictImporting", String(n)); }
    };
    try {
      // Widest rung, deliberately, and there is no picker: a lookup dictionary
      // earns its keep on the words you actually stopped to look up, and the two
      // narrower rungs exist to prove the predicate is cumulative, not to be
      // shipped. Measured cost of R3 over R1 on the real file: 24.8s vs 10.6s
      // import, 38 MB vs 14 MB stored. All six resource gates pass at R3
      // (scripts/ecdict-import-perf.mjs --fixture real --rung R3).
      const res = await pbpEcdictImportFile(f, { rung: "R3", onParsed: tick, onProgress: tick });
      _pbpVocabFlashStatus(true, t("dictPackDone", String(res.entries)));
    } catch (e) {
      const msg = String((e && e.message) || "");
      // Distinguish "this is not the right kind of file" from "this file is too
      // big for us", because the user's next action differs.
      const key = /not an ECDICT csv|malformed/.test(msg) ? "ecdictNotEcdictFormat"
        // Payload before entry count: a file inside the entry ceiling can still
        // breach the byte ceiling, and "too many entries" would be a lie there.
        : /too large|payload above/.test(msg) ? "ecdictTooLarge"
        : /entry count above/.test(msg) ? "ecdictTooManyEntries"
        : "ecdictParseFailed";
      _pbpVocabFlashStatus(false, t(key));
      // "Wrong file" is an expected outcome the user already sees in the status
      // line; logging it at warn level put it in chrome://extensions' Errors
      // panel, where it reads like the extension broke. Only unexpected faults
      // belong there.
      const expected = key !== "ecdictParseFailed";
      (expected ? console.info : console.warn)("[ecdict] import rejected:", e && e.name, msg);
    } finally {
      imp.disabled = false;
      _pbpEcdictRefreshStatus();
    }
  });
  if (del) del.addEventListener("click", () => {
    showConfirmPopover(del, {
      msg: t("dictPackDeleteConfirm"),
      yesText: t("delete"),
      noText: t("cancel"),
      onConfirm: async () => {
        try {
          await pbpEcdictDelete();
          await _pbpEcdictRefreshStatus();
        } catch (_) {
          const status = $id("ecdict-pack-status");
          if (status) status.textContent = t("dictPackDeleteFailed");
        }
      }
    });
  });
  _pbpEcdictRefreshStatus();
}
_pbpEcdictWire();
