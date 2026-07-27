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

function pbpVocabFilterSort(rows, query, group, sortMode) {
  const needle = pbpVocabSearchText(query);
  const groupName = typeof pbpVocabNormalizeGroupName === "function"
    ? pbpVocabNormalizeGroupName(group) : String(group || "").trim();
  const filtered = (Array.isArray(rows) ? rows : []).filter((row) => {
    const groups = typeof pbpVocabGroups === "function" ? pbpVocabGroups(row) : [];
    if (groupName && !groups.includes(groupName)) return false;
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

  const titleEl = document.createElement("span");
  titleEl.className = "notes-row-title";
  titleEl.textContent = w.term;
  main.appendChild(titleEl);

  const meta = document.createElement("span");
  meta.className = "notes-row-meta";
  const languageLabel = pbpDictLanguageLabel(w.language, document.documentElement.lang);
  if (languageLabel) {
    const langChip = document.createElement("span");
    langChip.className = "notes-meta-chip";
    langChip.textContent = languageLabel;
    meta.appendChild(langChip);
  }
  const glossChip = document.createElement("span");
  glossChip.className = "notes-meta-chip";
  glossChip.textContent = (w.gloss || "").split("\n")[0];
  meta.appendChild(glossChip);
  for (const group of pbpVocabGroups(w)) {
    const groupChip = document.createElement("span");
    groupChip.className = "notes-meta-chip vocab-group-chip";
    groupChip.textContent = group;
    meta.appendChild(groupChip);
  }
  main.appendChild(meta);

  head.appendChild(main);
  top.appendChild(head);

  const delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.className = "btn btn-sm notes-row-del";
  delBtn.textContent = t("dictDeleteWord");
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
  if (w.note) {
    const noteEl = document.createElement("div");
    noteEl.className = "notes-item-note";
    noteEl.textContent = w.note;
    itemsEl.appendChild(noteEl);
  }
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
  const selectedCount = _vocabSelected.size;
  const selectedEl = $id("vocab-selected-count");
  if (selectedEl) selectedEl.textContent = t("vocabSelectedCount", String(selectedCount));
  const batch = $id("vocab-batch-toolbar");
  if (batch) batch.hidden = selectedCount === 0;
  const allBtn = $id("vocab-select-all");
  const invertBtn = $id("vocab-invert-selection");
  if (allBtn) allBtn.disabled = _vocabBatchBusy || !_vocabViewRows.length;
  if (invertBtn) invertBtn.disabled = _vocabBatchBusy || !_vocabViewRows.length;
  const groupInput = $id("vocab-group-input");
  const addBtn = $id("vocab-add-group");
  const deleteBtn = $id("vocab-batch-delete");
  const group = groupInput && typeof pbpVocabNormalizeGroupName === "function"
    ? pbpVocabNormalizeGroupName(groupInput.value) : "";
  if (groupInput) groupInput.disabled = _vocabBatchBusy;
  if (addBtn) addBtn.disabled = _vocabBatchBusy || !selectedCount || !group;
  if (deleteBtn) deleteBtn.disabled = _vocabBatchBusy || !selectedCount;
  document.querySelectorAll("#vocab-list .vocab-row-select").forEach((checkbox) => {
    checkbox.checked = _vocabSelected.has(checkbox.dataset.vocabId);
    checkbox.disabled = _vocabBatchBusy;
  });
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

function _pbpVocabUpdateExternalActions() {
  const eudicBtn = $id("vocab-eudic-btn");
  if (eudicBtn) {
    // External sends intentionally stay scoped to ALL current-owner rows,
    // never the UI selection or the current search result.
    eudicBtn.hidden = typeof pbpEudicPartition !== "function"
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
    ($id("vocab-sort") || {}).value || "latest");
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
  // Only Google authorization and permission are recoverable by reconnecting.
  // Corrupt remote data, a failed local write and an oversized entry all
  // survive a reconnect, so telling the user to disconnect wastes their time.
  // The hint also needs the Disconnect button to exist: while disconnected it
  // is hidden and Connect is the visible action, so naming it strands the user.
  if (connected && blocked && (code === "auth" || code === "permission")) {
    parts.push(t("vocabDriveReconnectRequired"));
  }
  setStatusIcon(el, false, parts.join(" "));
}

function _pbpVocabDriveSetBusy(busy, focusOwner) {
  _vocabDriveBusy = !!busy;
  const body = $id("vocab-drive-body");
  if (body) body.setAttribute("aria-busy", String(_vocabDriveBusy));
  // A first sync can page through Drive for minutes. Without this the state
  // line keeps whatever it said before -- usually "not connected" -- for the
  // whole run, so the panel reads as if the click did nothing. Only written
  // while busy; _pbpVocabDriveRender owns the line the rest of the time.
  const state = $id("vocab-drive-state");
  if (state && _vocabDriveBusy) {
    state.classList.remove("ok", "bad");
    state.textContent = t("vocabDriveWorking");
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
  if (owner) owner.textContent = String(status.owner || "");
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
  if (notices) {
    // Zero is the normal state; rendering "Delete conflict notices: 0" leaves
    // a permanent line of jargon on a healthy account and makes the live
    // region announce a non-event on every render.
    const count = Math.max(0, Number(status.notices) || 0);
    notices.textContent = count > 0 ? t("vocabDriveNotices", count.toLocaleString()) : "";
    notices.classList.toggle("bad", count > 0);
  }
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
    _pbpVocabDriveSetBusy(true, sourceButton);
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

async function _pbpVocabAddSelectedToGroup() {
  const input = $id("vocab-group-input");
  const button = $id("vocab-add-group");
  if (!input || !button || button.disabled || _vocabBatchBusy || !_vocabSelected.size) return;
  const group = pbpVocabNormalizeGroupName(input.value);
  if (!group) { _pbpVocabFlashStatus(false, t("vocabGroupRequired")); return; }
  const ids = [..._vocabSelected];
  _pbpVocabSetBatchBusy(true);
  const gen = ++_vocabRenderGen;
  let owner = null;
  try {
    owner = await pbpVocabCurrentOwner();
    const ok = await pbpVocabBatchAddGroup(ids, owner, group);
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
    _pbpVocabFlashStatus(true, t("vocabBatchGrouped", String(ids.length), group));
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
    const tsv = pbpDictTsv(rows.map(_pbpVocabCanonicalRow));
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

// Send-to-Anki click chain. Ordering is the spec (anki spec rev2 §3):
// (1) FIRST await = chrome.permissions.request (user gesture; already-granted
// resolves true without UI), (2) requestPermission as the first AnkiConnect
// action, (3..n) owner derived AFTER the permission awaits and re-checked
// via ownerCheck before every later dispatch -- the permission dialogs can
// sit open long enough for an account switch (fail-closed invariant).
// Canonical row shared by the TSV export and the Anki send (spec: both
// derive from the SAME canonical shape; the Anki side escapes its own copy).
function _pbpVocabCanonicalRow(w) {
  return {
    term: w.term,
    reading: w.ipa || "",
    definition: (w.gloss || "").replace(/\s*\n\s*/g, " "),
    contexts: (Array.isArray(w.contexts) ? w.contexts : []).map((c) => c && c.quote).filter(Boolean),
    source: (w.contexts && w.contexts[0] && w.contexts[0].articleUrl) || "",
    license: [w.license, w.sourceUrl].filter(Boolean).join(" ")
  };
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
    const canonical = rows.map(_pbpVocabCanonicalRow);
    const res = await pbpAnkiSendRows(canonical, {
      deck: s.dictAnkiDeck || "Pinboard Vocab",
      key: s.dictAnkiKey || "",
      port,
      ownerCheck: async () => (await pbpVocabCurrentOwner()) === owner
    });
    if (res.stage === "done") {
      _pbpVocabFlashStatus(res.failed === 0, t("dictAnkiResult", String(res.added), String(res.skipped), String(res.failed)));
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
      _pbpVocabFlashStatus(false, res.error || t("dictEudicFailed"));
    } else if (res.generic) {
      // ANY generic batch poisons the totals -- never show a partial count
      // as if it were the whole story.
      _pbpVocabFlashStatus(true, t("dictEudicGenericOk"));
    } else {
      _pbpVocabFlashStatus(true,
        t("dictEudicResult", String(res.added), String(res.skipped), String(res.unsupported)));
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
for (const id of ["vocab-group-filter", "vocab-sort"]) {
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
if (_vocabAddGroup) _vocabAddGroup.addEventListener("click", _pbpVocabAddSelectedToGroup);
const _vocabBatchDelete = $id("vocab-batch-delete");
if (_vocabBatchDelete) _vocabBatchDelete.addEventListener("click", _pbpVocabBatchDeleteSelected);
const _vocabDriveConnect = $id("vocab-drive-connect");
if (_vocabDriveConnect) _vocabDriveConnect.addEventListener("click", _pbpVocabDriveConnect);
const _vocabDriveSync = $id("vocab-drive-sync");
if (_vocabDriveSync) _vocabDriveSync.addEventListener("click", () =>
  _pbpVocabDriveAction("vocabDriveSyncNow", true));
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
