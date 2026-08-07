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
// Raw owner scope of the last successfully committed render (renderVocabPanel
// or _pbpVocabReloadAfterMutation's success path). Read by _pbpVocabSoftReload
// (I3) to tell "the account under me actually changed" apart from "nothing
// changed, this is just a freshness re-fire" BEFORE any await -- the same
// fail-closed-first timing _pbpVocabClearVisibleState already uses.
let _vocabCurrentOwner = null;
const PBP_VOCAB_RENDER_BATCH = 100;
const _vocabCollator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

// Detail-pane activation hook, implemented below by _pbpVocabRenderDetail.
// `true` = this is a user activation, so narrow mode swaps to the detail pane
// (a plain refresh render must not, see _pbpVocabRenderDetail).
let _pbpVocabOnRowActivate = (w) => _pbpVocabRenderDetail(w, true);
// Id of the word currently shown in the detail pane (or null); read by the
// mutation-reload and generic-render paths to re-find and re-mark its row.
let _pbpVocabDetailWordId = null;

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

// Read-only stats over the owner's full row set. `now` injected for testability.
function pbpVocabStats(rows, now) {
  const groups = new Set();
  const langs = new Set();
  let learning = 0, known = 0, added7 = 0, added30 = 0;
  const d7 = now - 7 * 86400000, d30 = now - 30 * 86400000;
  for (const r of rows) {
    if (String(r.status || "new") === "known") known++; else learning++;
    for (const g of pbpVocabGroups(r)) groups.add(g);
    if (r.language && r.language !== "und") langs.add(r.language);
    if (r.createdAt >= d7) added7++;
    if (r.createdAt >= d30) added30++;
  }
  return { total: rows.length, learning, known, groups: groups.size, languages: langs.size, added7, added30 };
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

// One selection gesture, four entry points: Ctrl/Cmd+click, Ctrl/Cmd+Space,
// Shift+click, Shift+Space. `range` sets the whole anchor..target interval to
// what a plain toggle of THIS row would have produced -- which is what keeps
// "Shift over an already-selected block deselects it", the semantics the
// checkbox era got for free from the browser-toggled `checkbox.checked`.
// The anchor moves to the last operated row either way (unchanged rule).
function _pbpVocabRowSelect(w, range) {
  // A batch mutation is mid-flight and owns every row it is about to rewrite;
  // the checkbox era expressed this as `checkbox.disabled`, which went away
  // with the checkbox.
  if (_vocabBatchBusy) return;
  const want = !_vocabSelected.has(w.id);
  if (range && _vocabLastSelectedId) {
    _vocabSelected = pbpVocabSelectRange(_vocabSelected, _vocabViewRows,
      _vocabLastSelectedId, w.id, want);
  } else if (want) {
    _vocabSelected.add(w.id);
  } else {
    _vocabSelected.delete(w.id);
  }
  _vocabLastSelectedId = w.id;
  _pbpVocabSyncSelectionUi();
}

// Master-detail activation: hand the word to the detail pane and mark this row
// as the current one. Exactly one row carries aria-current, so clear the
// others first. Split out of the click handler because the same activation is
// now one of three things a click can mean (see the handler below).
function _pbpVocabActivateRow(w, card) {
  _pbpVocabOnRowActivate(w);
  document.querySelectorAll("#vocab-list .vocab-card[aria-current]").forEach((el) => el.removeAttribute("aria-current"));
  card.setAttribute("aria-current", "true");
}

// No render-index parameter any more: its only job was the expandable body's
// DOM id, and the master-detail row has no body to address.
function _pbpVocabBuildRow(w) {
  const card = document.createElement("article");
  card.className = "notes-card vocab-card";
  // role=row + role=gridcell, not listitem (user ruling 2026-08-06: the
  // per-row checkbox is gone and selection is carried by the row's own fill).
  // `aria-selected` is only supported on grid/listbox descendants -- declared
  // on a `listitem` it is invalid ARIA that assistive tech drops silently, so
  // deleting the checkbox without moving the role would have deleted the
  // screen-reader path with it. `option` is out: it must be a leaf, and this
  // row carries two real buttons.
  card.setAttribute("role", "row");
  card.dataset.vocabId = w.id;
  const isSelected = _vocabSelected.has(w.id);
  card.setAttribute("aria-selected", isSelected ? "true" : "false");
  card.classList.toggle("selected", isSelected); // drives the row accent band

  const top = document.createElement("div");
  top.className = "notes-card-top";
  top.setAttribute("role", "gridcell");

  const head = document.createElement("button");
  head.type = "button";
  head.className = "notes-card-head";
  head.setAttribute("aria-keyshortcuts", "Control+Space Shift+Space");

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

  // Desktop list grammar: a plain click reads the row (activation), a
  // modified click selects it for the batch bar. The two are deliberately
  // separate verbs -- selecting must NOT move the detail pane, or building a
  // 20-row selection would re-render the right pane 20 times.
  head.addEventListener("click", (e) => {
    if (e.shiftKey) { _pbpVocabRowSelect(w, true); return; }
    if (e.ctrlKey || e.metaKey) { _pbpVocabRowSelect(w, false); return; }
    _pbpVocabActivateRow(w, card);
  });
  // Keyboard twins of those two modifiers, so multi-select never requires a
  // pointer. Space is the button's OWN activation key, so the modified forms
  // have to be caught on keydown and preventDefault'd -- otherwise the
  // browser also synthesises the plain click and the row would activate as
  // well as toggle. Announced through aria-keyshortcuts (below); the visible
  // hint rides on "Select all"'s title, the one always-present control in the
  // same region (a title on every row would tooltip the whole list).
  head.addEventListener("keydown", (e) => {
    if (e.key !== " " && e.key !== "Spacebar") return;
    if (e.shiftKey) { e.preventDefault(); _pbpVocabRowSelect(w, true); }
    else if (e.ctrlKey || e.metaKey) { e.preventDefault(); _pbpVocabRowSelect(w, false); }
  });

  return card;
}

// Ported verbatim from the pre-migration row builder; _pbpVocabRenderDetail
// below wires it into the detail pane.
// Note editor. The field, its concurrent-merge rule and the Drive privacy
// copy ("may include ... notes") all existed with no way to type into it.
// Save is explicit (mutation-at-confirm discipline, same as every other
// vocab edit); the button only appears once the text actually differs.
// Returns { wrap, save }: the field stays in the reading flow, the commit
// button belongs to the pane's closing action row (v2b, user-chosen). They
// are built together because the save button's whole existence is derived
// from the field's dirty state.
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
  // icon + label, as confirmed on the mockup. `check` is the commit gesture
  // (the tick you get back), distinct from `checkCircle`, which this page
  // already spends on "mark as known".
  setBtnIcon(noteSave, "check", t("hlSave"));
  noteSave.hidden = true;
  noteInput.addEventListener("input", () => {
    noteSave.hidden = noteInput.value === (w.note || "");
  });
  noteSave.addEventListener("click", async () => {
    if (noteSave.disabled) return;
    noteSave.disabled = true;
    const gen = ++_vocabRenderGen;
    let owner = null;
    const restoreSelection = _pbpVocabHoldSelection(gen);
    try {
      owner = await pbpVocabCurrentOwner();
      const ok = await pbpVocabSetNote(w.id, owner, noteInput.value);
      const refreshed = await _pbpVocabReloadAfterMutation(owner, gen);
      restoreSelection();
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
      if (owner) { await _pbpVocabReloadAfterMutation(owner, gen); restoreSelection(); }
      if (gen === _vocabRenderGen) _pbpVocabFlashStatus(false, t("vocabBatchFailed"));
    } finally {
      noteSave.disabled = false;
    }
  });
  noteWrap.appendChild(noteInput);
  return { wrap: noteWrap, save: noteSave };
}

// The back button is static markup at the top of the pane now, wired once --
// it used to be rebuilt inside #vocab-detail on every render, which meant it
// existed only when the pane had CONTENT. Arriving in narrow mode with
// nothing selected (which the lookup door below does on purpose) was then a
// dead end with no way back to the list.
{
  const back = $id("vocab-detail-back");
  if (back) {
    // Icon + label live in the markup (data-ic / data-i18n), not in a
    // setBtnIcon call here: this runs at module load, where t() can only fall
    // back to the BROWSER locale -- applyI18n has not yet loaded the user's
    // chosen UI language. Everything static on this page takes its text the
    // same way for that reason.
    back.addEventListener("click", () => {
      document.body.classList.remove("lib-narrow-detail");
      _pbpVocabRenderDetail(null);
    });
  }
}

// Renders the master-detail right pane for the activated word (or clears it
// back to the empty state for null, e.g. after a delete). Reassigned onto
// _pbpVocabOnRowActivate above; also called directly by the reload-after-
// mutation and delete-linkage paths.
// `enterNarrow` is opt-in: only a user activation (row click, free-lookup
// submit) may swap narrow mode from the list to the detail. Refresh renders
// (mutation reload, view re-entry) keep whichever pane the user is on --
// otherwise every sibling mutation would yank a narrow reader into the
// detail, and library.js's view switch could never hand the list back.
function _pbpVocabRenderDetail(w, enterNarrow) {
  const empty = $id("vocab-detail-empty");
  const detail = $id("vocab-detail");
  // No-op where the detail pane doesn't exist -- library-vocab.js's row
  // builder (and thus this hook) also runs inside tests/options-vocab-tests.html,
  // which co-loads both vocab halves but only ever mounts options.html's
  // expandable-card markup (no #vocab-detail-*).
  if (!empty || !detail) return;
  // Switching (or clearing) the shown word invalidates any in-flight
  // re-lookup immediately: opening a fresh word must fire zero network
  // requests on its own, and a stale online/local chain must never write
  // into a dict area that now belongs to a different word.
  if (_pbpVocabDictCtrl) { _pbpVocabDictCtrl.abort(); _pbpVocabDictCtrl = null; }
  _pbpVocabDetailWordId = w ? w.id : null;
  empty.hidden = !!w;
  detail.hidden = !w;
  if (!w) document.body.classList.remove("lib-narrow-detail");
  else if (enterNarrow) document.body.classList.add("lib-narrow-detail");
  if (!w) { detail.replaceChildren(); return; }

  const frag = document.createDocumentFragment();

  // (The narrow-mode back button is static markup at the top of the PANE now,
  // so it survives every state this host can be in -- including empty.)

  // 1. Word head: term + language chip + speak
  const head = document.createElement("div");
  head.className = "vocab-detail-head";
  const term = document.createElement("h2");
  term.className = "vocab-detail-term";
  term.textContent = w.term;
  head.appendChild(term);
  const langLabel = pbpDictLanguageLabel(w.language, document.documentElement.lang);
  if (langLabel) {
    const chip = document.createElement("span");
    chip.className = "notes-meta-chip";
    chip.textContent = langLabel;
    head.appendChild(chip);
  }
  const speak = document.createElement("button");
  speak.type = "button";
  speak.className = "btn btn-sm vocab-detail-speak";
  setBtnIcon(speak, "speaker", "");
  speak.title = t("dictSpeak");
  speak.setAttribute("aria-label", t("dictSpeak"));
  speak.addEventListener("click", () => pbpDictSpeak(w.term, w.language === "und" ? "" : w.language));
  head.appendChild(speak);
  frag.appendChild(head);

  // 2. Status toggle + group management
  const actions = document.createElement("div");
  actions.className = "vocab-detail-actions";
  const known = String(w.status || "new") === "known";
  const statusBtn = document.createElement("button");
  statusBtn.type = "button";
  statusBtn.className = "btn btn-sm";
  setBtnIcon(statusBtn, known ? "rotateCcw" : "checkCircle",
    t(known ? "vocabMarkLearning" : "vocabMarkKnown"));
  statusBtn.addEventListener("click", () => _pbpVocabDetailMutate(w, (owner) =>
    pbpVocabBatchSetStatus([w.id], owner, known ? "new" : "known")));
  actions.appendChild(statusBtn);
  // Group unit: same input+stepper family as the batch bar, scoped to [w.id].
  const groupUnit = document.createElement("span");
  groupUnit.className = "vocab-group-unit";
  const groupInput = document.createElement("input");
  groupInput.type = "text";
  groupInput.setAttribute("list", "vocab-group-list"); // shared datalist from the list pane
  groupInput.placeholder = t("vocabGroupNamePlaceholder");
  groupInput.setAttribute("aria-label", t("vocabGroupNamePlaceholder"));
  groupInput.autocomplete = "off";
  groupUnit.appendChild(groupInput);
  const addGroup = document.createElement("button");
  addGroup.type = "button";
  addGroup.className = "btn btn-sm vocab-group-step";
  setBtnIcon(addGroup, "plus", "");
  addGroup.title = t("vocabAddToGroup");
  addGroup.setAttribute("aria-label", t("vocabAddToGroup"));
  addGroup.addEventListener("click", () => {
    const name = pbpVocabNormalizeGroupName(groupInput.value);
    if (name) _pbpVocabDetailMutate(w, (owner) => pbpVocabBatchAddGroup([w.id], owner, name));
  });
  groupUnit.appendChild(addGroup);
  const removeGroup = document.createElement("button");
  removeGroup.type = "button";
  removeGroup.className = "btn btn-sm vocab-group-step";
  setBtnIcon(removeGroup, "minus", "");
  removeGroup.title = t("vocabRemoveFromGroup");
  removeGroup.setAttribute("aria-label", t("vocabRemoveFromGroup"));
  removeGroup.addEventListener("click", () => {
    const name = pbpVocabNormalizeGroupName(groupInput.value);
    if (name) _pbpVocabDetailMutate(w, (owner) => pbpVocabBatchRemoveGroup([w.id], owner, name));
  });
  groupUnit.appendChild(removeGroup);
  actions.appendChild(groupUnit);
  // Current group chips get their own row (vocab-group-inspect-report.md
  // 2026-08-05 Finding 6/vocab-detail-group-chips CSS) and, unlike the
  // read-only list-row instance, a per-chip "x" (Finding 5): the group name
  // is already known here, so removing one is a single click on the chip
  // itself instead of retyping it into the input above and hitting the "-"
  // stepper. Reuses the exact same mutation primitive that stepper already
  // calls -- same owner/gen discipline, no new code path.
  const currentGroups = pbpVocabGroups(w);
  if (currentGroups.length) {
    const chipList = document.createElement("span");
    chipList.className = "vocab-detail-group-chips";
    for (const group of currentGroups) {
      const chip = document.createElement("span");
      chip.className = "notes-meta-chip vocab-group-chip removable";
      chip.textContent = group;
      const removeChip = document.createElement("button");
      removeChip.type = "button";
      removeChip.className = "chip-remove";
      setBtnIcon(removeChip, "cross", "");
      // Reuses the existing localized "Remove from group" label rather than
      // adding a new per-group-name locale key across all 9 locales -- the
      // group name itself is user data, not translatable UI text.
      removeChip.title = t("vocabRemoveFromGroup") + ": " + group;
      removeChip.setAttribute("aria-label", t("vocabRemoveFromGroup") + ": " + group);
      removeChip.addEventListener("click", (e) => {
        e.stopPropagation();
        _pbpVocabDetailMutate(w, (owner) => pbpVocabBatchRemoveGroup([w.id], owner, group));
      });
      chip.appendChild(removeChip);
      chipList.appendChild(chip);
    }
    actions.appendChild(chipList);
  }
  frag.appendChild(actions);

  // 3. Stored gloss + IPA
  if (w.ipa || w.gloss) {
    const glossBox = document.createElement("div");
    glossBox.className = "vocab-detail-gloss";
    if (w.ipa) {
      const ipa = document.createElement("div");
      ipa.className = "vocab-gloss-ipa";
      ipa.textContent = w.ipa;
      glossBox.appendChild(ipa);
    }
    if (w.gloss) {
      const def = document.createElement("div");
      def.className = "vocab-gloss-text";
      def.textContent = w.gloss;
      glossBox.appendChild(def);
    }
    frag.appendChild(glossBox);
  }

  // 4. Contexts: quote with the term highlighted + source link
  for (const c of (Array.isArray(w.contexts) ? w.contexts : [])) {
    if (!c) continue;
    const item = document.createElement("div");
    item.className = "vocab-detail-context";
    const quote = document.createElement("blockquote");
    quote.className = "notes-item-quote";
    _pbpVocabHighlightTerm(quote, c.quote || "", w.term);
    item.appendChild(quote);
    const safeHref = pbpDictSafeUrl(c.articleUrl);
    if (safeHref) {
      const link = document.createElement("a");
      link.className = "notes-row-open";
      link.href = safeHref;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = c.articleTitle || safeHref;
      item.appendChild(link);
    }
    frag.appendChild(item);
  }

  // 5. Note editor. The field goes here, in the reading flow; its Save lands
  // in the closing row below (v2b) so a commit control sits with the other
  // commit controls instead of hanging off the textarea's edge.
  const noteEditor = _pbpVocabBuildNoteEditor(w);
  frag.appendChild(noteEditor.wrap);

  // 6. Dictionary results host. Stays in the READING flow even though the
  // button that fills it now sits in the closing row below: a definition is
  // material to read, not an action, and hanging it under the actions would
  // put the row's rule in the middle of the pane.
  const dictHost = document.createElement("div");
  dictHost.className = "vocab-detail-dict";
  frag.appendChild(dictHost);

  // 7. Closing action row (variant C): re-lookup left, delete right. Both are
  // "what you do with this word once you are done reading it", so they share
  // one rule-topped row instead of stacking as two.
  const footer = document.createElement("div");
  footer.className = "vocab-detail-footer";

  // On-demand dictionary re-lookup: zero network until clicked. One live
  // lookup per detail render -- the button hides itself on click, and a
  // fresh render (word switch) always rebuilds an unclicked button.
  const lookupBtn = document.createElement("button");
  lookupBtn.type = "button";
  lookupBtn.className = "btn btn-sm vocab-detail-relookup";
  setBtnIcon(lookupBtn, "book", t("libraryRelookup"));
  lookupBtn.addEventListener("click", () => {
    lookupBtn.hidden = true;
    _pbpVocabRelookup(w, dictHost);
  });
  footer.appendChild(lookupBtn);

  // Delete (confirm popover family; on success the detail pane resets)
  const del = document.createElement("button");
  del.type = "button";
  del.className = "btn btn-sm danger ghost vocab-detail-delete";
  setBtnIcon(del, "trash", t("dictDeleteWord"));
  del.addEventListener("click", () => _pbpVocabDeleteRow(w, del));
  footer.appendChild(del);
  // Save, at the far right of the row. It stays in layout while hidden
  // (visibility, not display -- see .vocab-note-save[hidden] in library.css),
  // so becoming dirty moves nothing else in the row by even a subpixel.
  footer.appendChild(noteEditor.save);
  frag.appendChild(footer);

  detail.replaceChildren(frag);
  // Same focus handoff the free-lookup result does, at the root every
  // activation passes through: a row click is the primary way into narrow
  // mode, and the head button it started from has just been hidden with the
  // rest of the list.
  if (enterNarrow) _pbpVocabFocusNarrowBack();
}

// On-demand dictionary re-lookup inside the detail pane. Reuses md-dict's
// pure query seams (_pbpDictSlotRun online chain + _pbpDictEcdictSide local
// pack) with NO AI leg: the lemma promise resolves empty immediately (ai.js
// is not loaded on this page). Participates in md-dict's staleness token so
// a second click or a word switch invalidates the previous run exactly like
// explain-pop does.
let _pbpVocabDictCtrl = null;

// Child controller per run, chained to the session-level `_pbpVocabDictCtrl`
// -- mirrors md-dict.js's pbpDictRun child/parent discipline (its own
// `_pbpDictChildCtrl` + `_pbpDictParentCleanup`, distinct names to avoid a
// SyntaxError double-`let` since both files co-load on this page). Without
// this, a language switch reused the single outer signal for every run:
// _pbpDictSlotRun only checks THAT signal for staleness, so a slow in-flight
// fetch for the OLD language (up to its 8s timeout) could still land in the
// shared onlineEl after the new language's result, silently showing content
// the dropdown no longer names. Module-level (not a per-call closure) so
// every caller of _pbpVocabDictRun below shares one child-run slot.
let _pbpVocabDictChildCtrl = null;
let _pbpVocabDictChildCleanup = null;

// Shared dictionary run core, extracted from _pbpVocabRelookup so free lookup
// (a later task) can reuse it verbatim. Reuses md-dict's pure query seams
// (_pbpDictSlotRun online chain + _pbpDictEcdictSide local pack) with NO AI
// leg: the lemma promise resolves empty immediately (ai.js is not loaded on
// this page). Participates in md-dict's staleness token so a second run or a
// word switch invalidates the previous one exactly like explain-pop does.
// `els` = { localEl, onlineEl } (the two stable slot children -- see the
// slot-invariant comment at each call site). `rerun` is the caller's "run
// this exact query again" callback (e.g. re-read a language <select> and
// call its own startRun); it only fires if this run is still the live one.
function _pbpVocabDictRun(term, lang, els, sentence, rerun) {
  const { localEl, onlineEl } = els;
  if (_pbpVocabDictChildCtrl) _pbpVocabDictChildCtrl.abort();
  if (_pbpVocabDictChildCleanup) { _pbpVocabDictChildCleanup(); _pbpVocabDictChildCleanup = null; }
  const child = new AbortController();
  _pbpVocabDictChildCtrl = child;
  // Fix round 1 (Minor 5): capture the parent controller AT REGISTRATION
  // time, not the module var at cleanup time. _pbpVocabDictCtrl can be
  // reassigned to a NEW session controller between now and cleanup (free
  // lookup and a word-detail relookup each replace it) -- reading the
  // module var inside the cleanup closure would remove the listener from
  // whatever controller happens to be current THEN, leaking it on the one
  // it was actually added to.
  const parent = _pbpVocabDictCtrl;
  const onParentAbort = () => child.abort();
  if (parent.signal.aborted) child.abort();
  else {
    parent.signal.addEventListener("abort", onParentAbort, { once: true });
    _pbpVocabDictChildCleanup = () => { try { parent.signal.removeEventListener("abort", onParentAbort); } catch (_) {} };
  }
  const signal = child.signal;

  const cur = { term, lang, sentence };
  cur.rerun = () => { if (_pbpDictCurrent === cur) rerun(); };
  _pbpDictCurrent = cur;
  _pbpDictSlotSkeleton(onlineEl);
  _pbpDictEcdictSide(localEl, term, lang, signal, cur);
  _pbpDictSlotRun(onlineEl, term, lang, signal, Promise.resolve(""), cur.rerun, cur.sentence)
    .catch((err) => console.warn("library relookup failed:", err.name, err.message));
}

function _pbpVocabRelookup(w, host) {
  if (_pbpVocabDictCtrl) _pbpVocabDictCtrl.abort();
  const ctrl = new AbortController();
  _pbpVocabDictCtrl = ctrl;

  const wrap = document.createElement("div");
  wrap.className = "xp-dict";
  const head = document.createElement("div");
  head.className = "xp-dict-head";
  const sel = document.createElement("select");
  sel.className = "xp-dict-lang";
  sel.setAttribute("aria-label", t("dictLangAria"));
  const locale = document.documentElement.lang;
  for (const code of PBP_DICT_LANGS) {
    if (code === "auto") continue; // stored words carry a language; no Auto leg here
    const o = document.createElement("option");
    o.value = code;
    o.textContent = pbpDictLanguageLabel(code, locale) || code;
    sel.appendChild(o);
  }
  const startLang = w.language && w.language !== "und" ? w.language : "";
  if (startLang && [...sel.options].some((o) => o.value === startLang)) sel.value = startLang;
  head.appendChild(sel);
  wrap.appendChild(head);

  const slot = document.createElement("div");
  slot.className = "xp-dict-slot";
  // Slot invariant: two stable children; nothing ever replaceChildren()s
  // the slot itself (md-dict render paths target the children).
  const localEl = document.createElement("div");
  localEl.className = "xp-dict-local";
  const onlineEl = document.createElement("div");
  onlineEl.className = "xp-dict-online";
  slot.appendChild(localEl);
  slot.appendChild(onlineEl);
  wrap.appendChild(slot);
  host.replaceChildren(wrap); // host is .vocab-detail-dict, never the slot

  function startRun(lang) {
    const sentence = (w.contexts && w.contexts[0] && w.contexts[0].quote) || "";
    _pbpVocabDictRun(w.term, lang, { localEl, onlineEl }, sentence, () => startRun(sel.value));
  }
  sel.addEventListener("change", () => startRun(sel.value));
  startRun(sel.value || startLang);
}

// Free dictionary lookup box (list-pane toolbar): any word, not just a saved
// one, walks the same md-dict query seams as relookup above. Session-only
// memory of the last chosen language -- never persisted, and independent of
// any saved word's own language.
let _vocabLookupLang = "en";

// One-time wiring for #vocab-lookup-bar, called once at module load from the
// same guarded top-level section as the stats chips (bottom of this file) --
// there is no per-render rebuild of this toolbar, so it only ever needs to
// be wired once.
function _pbpVocabWireLookupBar() {
  const input = $id("vocab-lookup-input");
  const sel = $id("vocab-lookup-lang");
  const go = $id("vocab-lookup-go");
  if (!input || !sel || !go) return; // absent on pages/fixtures with no lookup bar
  // Fix round 1 (Important 2): this wiring runs at deferred-script parse
  // time, before library.js's applyI18n() sets document.documentElement.lang
  // -- reading it here would always see the raw <html lang="en"> attribute
  // and mislabel every language option. uiLangToBCP47() computes the real
  // UI locale independently of that timing (same precedent as md-dict.js's
  // xp-dict-lang build), so it is correct even this early; the relookup
  // select below builds on click, well after applyI18n has already run, so
  // document.documentElement.lang is safe there.
  const locale = typeof uiLangToBCP47 === "function" ? uiLangToBCP47() : document.documentElement.lang;
  for (const code of PBP_DICT_LANGS) {
    if (code === "auto") continue; // free lookup mirrors relookup: no Auto leg
    const o = document.createElement("option");
    o.value = code;
    o.textContent = pbpDictLanguageLabel(code, locale) || code;
    sel.appendChild(o);
  }
  sel.value = _vocabLookupLang;
  sel.addEventListener("change", () => { _vocabLookupLang = sel.value; });
  go.addEventListener("click", _pbpVocabFreeLookup);
  input.addEventListener("keydown", (e) => {
    // IME guard (Important 3): Chrome dispatches a key="Enter" keydown with
    // isComposing=true (keyCode 229 as a fallback signal) when the user
    // confirms an IME candidate -- that Enter must never submit a lookup for
    // the still-uncommitted composition text (md-ask.js / popup-tags.js).
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === "Enter") _pbpVocabFreeLookup();
  });
}

// Free dictionary lookup: renders a lookup-result view into the detail host.
// Lookup-only by design -- no save path (spec: context/save semantics are a
// separate, later design question). Mutually exclusive with the word-detail
// view: submitting a lookup drops any activated word's aria-current/id
// linkage, and activating a row (or the saved-word hint below) hands the
// detail host back to _pbpVocabRenderDetail.
function _pbpVocabFreeLookup() {
  const input = $id("vocab-lookup-input");
  const sel = $id("vocab-lookup-lang");
  if (!input || !sel) return;
  const term = (input.value || "").trim();
  if (!term) return;
  const lang = sel.value || _vocabLookupLang;

  // The lookup result owns the detail host: drop any word-detail linkage so
  // reload paths do not resurrect a word over the result (they no-op on null).
  _pbpVocabDetailWordId = null;
  document.querySelectorAll("#vocab-list .vocab-card[aria-current]").forEach((el) => el.removeAttribute("aria-current"));
  const empty = $id("vocab-detail-empty");
  const detail = $id("vocab-detail");
  if (!empty || !detail) return;
  empty.hidden = true;
  detail.hidden = false;
  document.body.classList.add("lib-narrow-detail"); // narrow mode shows the result pane

  const frag = document.createDocumentFragment();

  const head = document.createElement("div");
  head.className = "vocab-detail-head";
  const termEl = document.createElement("h2");
  termEl.className = "vocab-detail-term";
  termEl.textContent = term;
  head.appendChild(termEl);
  const langChip = document.createElement("span");
  langChip.className = "notes-meta-chip";
  langChip.textContent = pbpDictLanguageLabel(lang, document.documentElement.lang) || lang;
  head.appendChild(langChip);
  const speak = document.createElement("button");
  speak.type = "button";
  speak.className = "btn btn-sm vocab-detail-speak";
  setBtnIcon(speak, "speaker", "");
  speak.title = t("dictSpeak");
  speak.setAttribute("aria-label", t("dictSpeak"));
  speak.addEventListener("click", () => pbpDictSpeak(term, lang));
  head.appendChild(speak);
  frag.appendChild(head);

  // Saved-word hint: case-folded match against the current owner's rows.
  const folded = pbpVocabSearchText(term);
  const saved = _vocabRows.find((r) => pbpVocabSearchText(r.term) === folded);
  if (saved) {
    const hint = document.createElement("button");
    hint.type = "button";
    hint.className = "btn btn-sm vocab-lookup-saved";
    setBtnIcon(hint, "bookMarked", t("libraryLookupSaved"));
    hint.addEventListener("click", () => {
      // Fix round 1 (Important 4): the hint (and this closure) survives
      // mutation reloads that happen while the lookup result stays on
      // screen -- `saved` can be a deleted/edited row by click time. Re-
      // resolve from the CURRENT _vocabRows instead of rendering the
      // captured snapshot; a vanished id is a no-op, not a ghost detail.
      const fresh = _vocabRows.find((r) => r.id === saved.id);
      if (!fresh) return;
      // An activation like a row click: it replaces this whole pane, so the
      // hint button focus sits on goes with it.
      _pbpVocabRenderDetail(fresh, true);
      const row = document.querySelector(`#vocab-list .vocab-card[data-vocab-id="${CSS.escape(fresh.id)}"]`);
      if (row) row.setAttribute("aria-current", "true");
    });
    frag.appendChild(hint);
  }

  const host = document.createElement("div");
  host.className = "vocab-detail-dict";
  frag.appendChild(host);
  detail.replaceChildren(frag);

  // AMENDMENT (Task 2 review defect): _pbpVocabDictRun dereferences
  // _pbpVocabDictCtrl.signal.aborted, but nothing on this path ever created
  // it -- a cold page load (free lookup submitted before any word-detail
  // relookup ever ran) leaves it null and this throws. Fix: do exactly what
  // _pbpVocabRelookup does at its own call site -- abort any existing
  // session controller and start a fresh one. This also gives free lookup
  // its own session identity, so it and a word-detail relookup mutually
  // abort each other through the same _pbpVocabDictCtrl.
  if (_pbpVocabDictCtrl) _pbpVocabDictCtrl.abort();
  _pbpVocabDictCtrl = new AbortController();

  // Slot pair per the md-dict invariant: two stable children, never
  // replaceChildren() on the slot itself.
  const wrap = document.createElement("div");
  wrap.className = "xp-dict";
  const slot = document.createElement("div");
  slot.className = "xp-dict-slot";
  const localEl = document.createElement("div");
  localEl.className = "xp-dict-local";
  const onlineEl = document.createElement("div");
  onlineEl.className = "xp-dict-online";
  slot.appendChild(localEl);
  slot.appendChild(onlineEl);
  wrap.appendChild(slot);
  host.replaceChildren(wrap);

  // `lang`, not sel.value: this run belongs to the submitted query. md-dict's
  // rerun callback fires long after submit (retry link, cache miss), and by
  // then the dropdown may name a language the user picked for the NEXT
  // lookup -- rerunning under it would silently answer a different question
  // than the result heading claims. A language change re-submits on its own.
  const run = () => _pbpVocabDictRun(term, lang, { localEl, onlineEl }, "", run);
  run();
  _pbpVocabFocusNarrowBack();
}

// Narrow (single-pane) mode. Mirrors library.css's 860px threshold -- the CSS
// is the source of truth and the responsive sweep guards it; this is the same
// number, not a second layout rule. matchMedia rather than reading the list
// pane's computed display: this runs right after the class flip on a click
// path, and a computed-style read there forces a style recalc for an answer
// that only depends on the viewport.
function _pbpVocabNarrowMode() {
  return typeof matchMedia === "function" && matchMedia("(max-width: 860px)").matches;
}

// Entering the detail in narrow mode hides the whole list, INCLUDING whatever
// was focused to get here (a row's head button, the lookup box). Chrome then
// drops focus to <body>, so the next Tab restarts at the top of the page with
// no way back. Hand it to the one control that returns to the list.
function _pbpVocabFocusNarrowBack() {
  if (!_pbpVocabNarrowMode()) return;
  const back = $id("vocab-detail-back");
  if (!back) return;
  try { back.focus({ preventScroll: true }); } catch (_) { back.focus(); }
}

// Split the quote around case-insensitive matches of the term; matches render
// in <mark>. textContent-only construction — no innerHTML with stored text.
function _pbpVocabHighlightTerm(host, quote, term) {
  const needle = (term || "").toLowerCase();
  if (!needle) { host.textContent = quote; return; }
  const lower = quote.toLowerCase();
  let idx = 0, pos = lower.indexOf(needle);
  while (pos !== -1) {
    host.appendChild(document.createTextNode(quote.slice(idx, pos)));
    const mark = document.createElement("mark");
    mark.textContent = quote.slice(pos, pos + needle.length);
    host.appendChild(mark);
    idx = pos + needle.length;
    pos = lower.indexOf(needle, idx);
  }
  host.appendChild(document.createTextNode(quote.slice(idx)));
}

// A detail-pane edit acts on ONE word; it is not a batch action, so the list
// selection it never touched must survive its reload. _pbpVocabReloadAfterMutation
// clears the selection unconditionally -- correct for the batch-bar callers,
// wrong for these. Snapshot before, hand it back after, and let
// _pbpVocabSyncSelectionUi prune whatever the fresh rows no longer contain
// (the same pruning _pbpVocabSoftReload leans on).
function _pbpVocabHoldSelection(gen) {
  const saved = new Set(_vocabSelected);
  const anchor = _vocabLastSelectedId;
  return () => {
    if (gen !== _vocabRenderGen || !saved.size) return;
    _vocabSelected = new Set(saved);
    _vocabLastSelectedId = anchor;
    _pbpVocabSyncSelectionUi();
  };
}

// Shared single-word mutation wrapper: owner + generation discipline identical
// to the batch actions (mutation at confirm, reload after, stale writes dropped).
async function _pbpVocabDetailMutate(w, mutate) {
  const gen = ++_vocabRenderGen;
  let owner = null;
  const restoreSelection = _pbpVocabHoldSelection(gen);
  try {
    owner = await pbpVocabCurrentOwner();
    const ok = await mutate(owner);
    const refreshed = await _pbpVocabReloadAfterMutation(owner, gen);
    restoreSelection();
    if (gen !== _vocabRenderGen) return;
    if (!ok) _pbpVocabFlashStatus(false, t("vocabBatchFailed"));
    else if (!refreshed) _pbpVocabFlashStatus(false, t("vocabRefreshFailed"));
  } catch (err) {
    console.warn("vocab detail mutate failed:", err.name, err.message);
    if (owner) { await _pbpVocabReloadAfterMutation(owner, gen); restoreSelection(); }
    if (gen === _vocabRenderGen) _pbpVocabFlashStatus(false, t("vocabBatchFailed"));
  }
}

// Verbatim twin: options-vocab.js and library-vocab.js each carry this
// helper (the pages never co-load, and since the phase-A test split neither
// does the test suite -- tests/ui-contract-tests.mjs statically asserts the
// two definitions stay byte-identical, so an edit to one without the other
// fails that check instead of silently drifting).
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
        // The confirm popover handed focus back to the delete button, which
        // the reload has just rebuilt away -- without this, focus lands on
        // <body>. Same landing spot every batch action already uses.
        _pbpVocabFocusStable();
        if (!ok) _pbpVocabFlashStatus(false, t("dictDeleteFailed"));
        else if (!refreshed) _pbpVocabFlashStatus(false, t("vocabRefreshFailed"));
      } catch (_) {
        if (owner) await _pbpVocabReloadAfterMutation(owner, gen);
        else if (gen === _vocabRenderGen) {
          _pbpVocabClearVisibleState();
          _pbpVocabSetLoading(false);
        }
        if (gen === _vocabRenderGen) {
          _pbpVocabFocusStable();
          _pbpVocabFlashStatus(false, t("dictDeleteFailed"));
        }
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
  // Keep every visible row's band and aria-selected in step with the
  // selection set (shift-range and select-all mutate rows that were not the
  // click target). The two must move together: the fill is the sighted
  // user's only cue and aria-selected is everyone else's.
  document.querySelectorAll("#vocab-list > .vocab-card").forEach((el) => {
    const on = _vocabSelected.has(el.dataset.vocabId);
    el.classList.toggle("selected", on);
    el.setAttribute("aria-selected", on ? "true" : "false");
  });
  const selectedCount = _vocabSelected.size;
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
  // Full rebuilds (append=false: search/filter/sort/reload) replace every
  // row, dropping the aria-current marker set by row activation even though
  // the detail pane still shows that word. Re-find it by id and re-mark it --
  // this covers search/filter/sort here; _pbpVocabReloadAfterMutation covers
  // its own reload the same way, since that path also re-renders the
  // detail pane's content (not just the marker).
  if (!append && _pbpVocabDetailWordId) {
    const current = document.querySelector(
      `#vocab-list .vocab-card[data-vocab-id="${CSS.escape(_pbpVocabDetailWordId)}"]`);
    if (current) current.setAttribute("aria-current", "true");
  }
}

// Render the read-only stats strip from the full owner row set (not the
// filtered view). Called after every _pbpVocabApplyView -- cheap, pure
// counting -- and hidden with the rest of the list by
// _pbpVocabClearVisibleState.
function _pbpVocabRenderStats() {
  const bar = $id("vocab-stats");
  if (!bar) return;
  // The two status chips left this strip for the filter row (header round 2),
  // so they no longer disappear with it -- hide them on the same condition or
  // an owner with no words gets two empty buttons in the middle of the row.
  const chips = [$id("vocab-stat-learning"), $id("vocab-stat-known")];
  if (!_vocabRows.length) {
    bar.hidden = true;
    for (const chip of chips) if (chip) chip.hidden = true;
    return;
  }
  const s = pbpVocabStats(_vocabRows, Date.now());
  bar.hidden = false;
  for (const chip of chips) if (chip) chip.hidden = false;
  $id("vocab-stat-total").textContent = t("libraryStatsWords", String(s.total));
  const filter = $id("vocab-status-filter");
  const learningBtn = $id("vocab-stat-learning");
  const knownBtn = $id("vocab-stat-known");
  learningBtn.textContent = t("libraryStatsLearning", String(s.learning));
  knownBtn.textContent = t("libraryStatsKnown", String(s.known));
  const filterValue = filter ? filter.value : "";
  learningBtn.setAttribute("aria-pressed", String(filterValue === "new"));
  knownBtn.setAttribute("aria-pressed", String(filterValue === "known"));
  $id("vocab-stat-groups").textContent = t("libraryStatsGroups", String(s.groups));
  $id("vocab-stat-languages").textContent = t("libraryStatsLanguages", String(s.languages));
  $id("vocab-stat-recent").textContent = t("libraryStatsRecent", String(s.added7), String(s.added30));
}

function _pbpVocabApplyView(resetLimit) {
  if (resetLimit) _vocabRenderLimit = PBP_VOCAB_RENDER_BATCH;
  _vocabViewRows = pbpVocabFilterSort(_vocabRows,
    ($id("vocab-search") || {}).value || "",
    ($id("vocab-group-filter") || {}).value || "",
    ($id("vocab-sort") || {}).value || "latest",
    ($id("vocab-status-filter") || {}).value || "");
  _pbpVocabRenderList();
  _pbpVocabRenderStats();
}

function _pbpVocabClearVisibleState() {
  _vocabRows = [];
  _vocabViewRows = [];
  _vocabOwnerLabel = "";
  _vocabCurrentOwner = null;
  _pbpVocabClearSelection();
  const list = $id("vocab-list");
  if (list) list.replaceChildren();
  _pbpVocabSetLoading(true);
  const count = $id("vocab-count");
  if (count) count.textContent = "";
  const statsBar = $id("vocab-stats");
  if (statsBar) statsBar.hidden = true;
  // (The batch bar is class-driven, not hidden-attribute driven; its
  // .selecting class clears via _pbpVocabSyncSelectionUi right below.)
  for (const id of ["vocab-empty", "vocab-no-results", "vocab-load-more"]) {
    const el = $id(id); if (el) el.hidden = true;
  }
  _pbpVocabRefreshGroupOptions(false);
  _pbpVocabSyncSelectionUi();
}

// Detail pane follows the data: re-render the shown word from the freshly
// read rows, or reset to the empty state when it is gone. Shared by the
// mutation reload and by renderVocabPanel -- a view re-entry that dropped
// this left the pane showing a word the list no longer has.
//
// Unsaved text survives the rebuild. A mutation on a SIBLING row (or another
// tab's write) rebuilds this pane too, and half-typed note / group-name text
// is the user's, not the store's. The save button's visibility is derived
// rather than snapshotted: "the text differs from the stored note" is
// precisely what it means, and deriving it stays honest after a note save
// (where the restored text now equals the stored one).
function _pbpVocabReconcileDetail() {
  if (!_pbpVocabDetailWordId) return;
  const detail = $id("vocab-detail");
  if (!detail) return;
  const liveNote = detail.querySelector(".vocab-note-input");
  const liveGroup = detail.querySelector(".vocab-group-unit input");
  const draftNote = liveNote ? liveNote.value : null;
  const draftGroup = liveGroup ? liveGroup.value : "";
  const fresh = _vocabViewRows.find((row) => row.id === _pbpVocabDetailWordId);
  _pbpVocabRenderDetail(fresh || null);
  if (!fresh) return;
  const el = document.querySelector(`#vocab-list .vocab-card[data-vocab-id="${CSS.escape(fresh.id)}"]`);
  if (el) el.setAttribute("aria-current", "true");
  const note = detail.querySelector(".vocab-note-input");
  if (note && draftNote !== null && draftNote !== note.value) {
    note.value = draftNote;
    const save = detail.querySelector(".vocab-note-save");
    if (save) save.hidden = false;
  }
  const group = detail.querySelector(".vocab-group-unit input");
  if (group && draftGroup) group.value = draftGroup;
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
      // I1: the list clear above leaves a stale word from the PREVIOUS owner
      // sitting in the detail pane -- at <860px that stale detail is the
      // only thing on screen, an owner-isolation breach.
      _pbpVocabRenderDetail(null);
      renderVocabPanel();
      return false;
    }
    _vocabRows = rows;
    _vocabOwnerLabel = pbpVocabOwnerLabel(expectedOwner);
    _vocabCurrentOwner = expectedOwner;
    _pbpVocabClearSelection();
    _pbpVocabRefreshGroupOptions(true);
    _pbpVocabSetLoading(false);
    // Keep the render depth: a mutation is not a reason to throw away the
    // pages a user loaded with "Load more" (the row cap still clamps to the
    // fresh row count). Non-append render, so _pbpVocabRenderList re-marks
    // aria-current across the whole restored depth.
    _pbpVocabApplyView(false);
    _pbpVocabReconcileDetail();
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
      // Same owner-isolation reset as every other account-change path (I1):
      // the previous owner's word must not stay in the detail pane while the
      // re-read runs -- at <860px that pane is the whole screen.
      if (gen === _vocabRenderGen) {
        _pbpVocabRenderDetail(null);
        renderVocabPanel();
      }
      return;
    }
  } catch (_) {
    // Fail-closed: a rerender triggered by an account switch that then fails
    // to read must NOT leave the previous account's rows on screen (isolation
    // invariant) -- clear the list and say the read failed.
    if (gen === _vocabRenderGen) {
      _pbpVocabClearVisibleState();
      _pbpVocabRenderDetail(null); // I1: the clear never touched the detail pane
      _pbpVocabSetLoading(false);
      _pbpVocabFlashStatus(false, t("vocabLoadFailed"));
    }
    return;
  }
  if (gen !== _vocabRenderGen) return;
  _vocabRows = rows;
  _vocabOwnerLabel = pbpVocabOwnerLabel(owner);
  _vocabCurrentOwner = owner;
  _pbpVocabSetLoading(false);
  _pbpVocabRefreshGroupOptions(false);
  _pbpVocabApplyView(true);
  // Same reconcile the mutation reload does: re-entering the view (or any
  // other full re-read) must not leave a word in the detail pane that the
  // freshly read list no longer contains.
  _pbpVocabReconcileDetail();
}

// I3: a visibilitychange-triggered re-fire of pbp-lib-view on a vocab view
// that's ALREADY showing must not blow away in-progress selection or
// load-more depth just because the tab regained focus -- only a real account
// switch justifies the full clear. Called by the pbp-lib-view listener below
// when it recognizes the event as a freshness re-fire rather than a first-
// show/view-switch.
async function _pbpVocabSoftReload() {
  const gen = ++_vocabRenderGen;
  let owner;
  try {
    owner = await pbpVocabCurrentOwner();
  } catch (err) {
    console.warn("vocab soft reload owner read failed:", err.name, err.message);
    // Fail-closed, same shape as renderVocabPanel's own catch: an owner read
    // that throws here is exactly as untrustworthy as one that throws there,
    // so it gets the identical clear + detail-reset (I1) + flash treatment
    // rather than leaving a possibly-stale account's rows on screen.
    if (gen === _vocabRenderGen) {
      _pbpVocabClearVisibleState();
      _pbpVocabRenderDetail(null);
      _pbpVocabSetLoading(false);
      _pbpVocabFlashStatus(false, t("vocabLoadFailed"));
    }
    return;
  }
  if (gen !== _vocabRenderGen) return;
  if (owner !== _vocabCurrentOwner) {
    // The account actually moved between the last commit and this re-fire --
    // this is exactly the account-switch case, so reuse its exact path
    // (full clear, including I1's detail reset) rather than a second,
    // subtly different one.
    _pbpVocabClearVisibleState();
    _pbpVocabRenderDetail(null);
    renderVocabPanel();
    return;
  }
  // _pbpVocabReloadAfterMutation unconditionally clears the selection --
  // correct for its usual callers, a mutation just happened, but nothing
  // changed under the user here. Snapshot and restore it around the call.
  // (Render depth needs no snapshot: the reload preserves _vocabRenderLimit.)
  const savedSelection = new Set(_vocabSelected);
  const savedAnchor = _vocabLastSelectedId;
  const reloaded = await _pbpVocabReloadAfterMutation(owner, gen);
  if (gen !== _vocabRenderGen) return;
  if (!reloaded) {
    // The read failed and the reload already cleared, fail-closed. Rendering
    // the now-empty list here would paint "no saved words yet" over a read
    // failure -- indistinguishable from actually losing every word. Say the
    // read failed instead and leave #vocab-empty hidden.
    _pbpVocabFlashStatus(false, t("vocabLoadFailed"));
    return;
  }
  _vocabSelected = savedSelection;
  _vocabLastSelectedId = savedAnchor;
  // Rebuild to the restored depth. _pbpVocabBuildRow reads _vocabSelected at
  // build time, and the trailing _pbpVocabSyncSelectionUi() call inside
  // _pbpVocabRenderList prunes any restored id that no longer exists in the
  // fresh _vocabViewRows (e.g. deleted from another tab while this one was
  // hidden) -- the same machinery every other render pass already relies on,
  // just fed the pre-reload snapshot instead of an empty set.
  _pbpVocabRenderList();
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
// Stats-strip status chips proxy #vocab-status-filter: click sets it and
// reuses the existing change pipeline; a second click on the active chip
// clears the filter back to "all" instead of toggling to the other status.
for (const chipId of ["vocab-stat-learning", "vocab-stat-known"]) {
  const chip = $id(chipId);
  if (chip) chip.addEventListener("click", () => {
    const filter = $id("vocab-status-filter");
    if (!filter) return;
    const target = chip.dataset.status;
    filter.value = filter.value === target ? "" : target;
    filter.dispatchEvent(new Event("change"));
  });
}
// Free-lookup toolbar: one-time wiring alongside the stats chips above (see
// _pbpVocabWireLookupBar's own comment -- no per-render rebuild, so no
// "already wired" guard is needed here either).
_pbpVocabWireLookupBar();
// Narrow-screen door to the lookup row. Below 860px the detail pane is
// display:none until `lib-narrow-detail` is on the body, so the list needs
// one control that flips into the pane and puts the caret where the user was
// heading. Nothing is looked up here -- it opens the tool, it does not run it.
const _vocabLookupNarrow = $id("vocab-lookup-narrow");
if (_vocabLookupNarrow) _vocabLookupNarrow.addEventListener("click", () => {
  document.body.classList.add("lib-narrow-detail");
  const input = $id("vocab-lookup-input");
  if (!input) return;
  try { input.focus({ preventScroll: true }); } catch (_) { input.focus(); }
});
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
// _vocabViewShown (I3) distinguishes a real first-show/view-switch (library.js's
// click/hashchange/initial dispatch sites, which always go through
// _pbpLibApplyView and toggle the view DOM) from a pure freshness re-fire on
// an already-rendered vocab view (library.js's visibilitychange listener, the
// ONLY dispatch site that does not go through _pbpLibApplyView). The event
// itself carries no such flag, so this is inferred from our own state.
let _vocabViewShown = false;
document.addEventListener("pbp-lib-view", (e) => {
  if (e.detail.view !== "vocab") { _vocabViewShown = false; return; }
  if (_vocabViewShown) { _pbpVocabSoftReload(); return; }
  _vocabViewShown = true;
  renderVocabPanel();
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
    if (area !== "sync" && area !== "local") return;
    const relevant = [changes.pinboardToken, changes.optSyncEnabled, changes.syncApiKeys].filter(Boolean);
    // An identical rewrite (settings saved with the same token, a toggle set
    // to the value it already had) names no new account. Tearing the whole
    // view down for it would drop selection, render depth and the open
    // detail for nothing.
    if (!relevant.length || relevant.every((change) => change.oldValue === change.newValue)) return;
    _pbpVocabClearVisibleState();
    // I1: same owner-isolation gap as _pbpVocabReloadAfterMutation's
    // ownerNow-mismatch branch above -- the list clear never touched the
    // detail pane, so the previous owner's word stayed on screen.
    _pbpVocabRenderDetail(null);
    renderVocabPanel();
  });
}
