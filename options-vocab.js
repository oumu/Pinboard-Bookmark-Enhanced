// ============================================================
// Pinboard Bookmark Enhanced - options-vocab.js
// Vocabulary tab: the settings half of the vocabulary feature -- Google
// Drive sync, the export/Anki/Eudic sends, and the two offline dictionary
// packs. The word LIST itself (search / filter / sort / selection / batch
// bar) lives on the standalone library page, in library-vocab.js.
// Every action here is scoped to ALL of the current Pinboard owner's rows,
// never to a UI selection, so nothing on this page needs the list's state.
// ============================================================

// var, not let: library-vocab.js declares these two names as well (its
// generation guard and the same status-flash timer). The pages never
// co-load, but tests/options-vocab-tests.html loads BOTH files, and a
// second top-level `let` of the same name is a SyntaxError that kills the
// whole script.
var _vocabRenderGen = 0; // guards stale async renders (account switch mid-fetch)
var _vocabFlashTimer = 0; // guards two flashes racing to clear each other's text early
let _vocabDriveBusy = false;
let _vocabDriveActionSeq = 0;
const PBP_VOCAB_GOOGLE_API_ORIGIN = "https://www.googleapis.com/*";

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

// Reads the owner's rows itself now that the rendered list lives on another
// page. Fail-closed: any read failure leaves the button hidden rather than
// offering a send that would have nothing to send.
async function _pbpVocabUpdateExternalActions() {
  const eudicBtn = $id("vocab-eudic-btn");
  if (!eudicBtn) return;
  let rows = [];
  try {
    rows = await pbpVocabAll(await pbpVocabCurrentOwner());
  } catch (_) {
    eudicBtn.hidden = true;
    return;
  }
  // External sends intentionally stay scoped to ALL current-owner rows,
  // never a UI selection or a search result.
  eudicBtn.hidden = !_vocabEudicConfigured
    || typeof pbpEudicPartition !== "function"
    || pbpEudicPartition(rows).byLang.size === 0;
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
    if (synced?.ok) _pbpVocabFlashStatus(true, t("vocabDriveSynced"));
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
    // Last successful sync is minute-precise, so without this flash two
    // clicks inside one minute change nothing on screen. (A pull that landed
    // new words shows up on the library page's own next render -- this page
    // has no word list to reconcile.)
    if (response?.ok && type !== "vocabDriveDisconnect") {
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
// slow Drive status read that's still in flight when the account changes
// again (or the user leaves and re-enters the tab) from clobbering a newer
// render. The word list is the library page's job (library-vocab.js).
async function renderVocabPanel() {
  if (!$id("vocab-drive-body")) return;
  const gen = ++_vocabRenderGen;
  ++_vocabDriveActionSeq;
  _pbpVocabDriveClear();
  _pbpVocabDriveSetBusy(false);
  if (_pbpVocabDriveAvailable()) _pbpVocabDriveRefresh(gen, true);
  else _pbpVocabDriveRenderUnavailable();
  // Fire-and-forget like the Drive refresh above: the button starts hidden and
  // appears only once a token is confirmed, which is the honest default.
  _pbpVocabRefreshEudicConfigured().then(_pbpVocabUpdateExternalActions);
  _pbpPackRefreshStatus();
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

// Left a real <a href> so middle-click / "open in new tab" still work, but a
// plain click reuses the library tab instead of stacking one per visit --
// same helper every other entry point to that page now goes through.
const _vocabOpenLibrary = $id("vocab-open-library");
if (_vocabOpenLibrary && typeof pbpOpenExtensionTab === "function") {
  _vocabOpenLibrary.addEventListener("click", (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    pbpOpenExtensionTab("library.html", "vocab");
  });
}

const _vocabAnkiBtn = $id("vocab-anki-btn");
if (_vocabAnkiBtn) _vocabAnkiBtn.addEventListener("click", _pbpVocabSendAnki);

const _vocabEudicBtn = $id("vocab-eudic-btn");
if (_vocabEudicBtn) _vocabEudicBtn.addEventListener("click", _pbpVocabSendEudic);

const _vocabExportBtn = $id("vocab-export-btn");
if (_vocabExportBtn) _vocabExportBtn.addEventListener("click", _pbpVocabExport);

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
// change which area holds the effective token) invalidates the Drive card's
// owner line and the Eudic button's row test -- re-render only when the
// vocab tab is the one on screen; renderVocabPanel's generation counter
// absorbs a rerun that lands after the user has already navigated away and
// back again. (The word list re-reads on its own page, library-vocab.js.)
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
    if (activeBtn && activeBtn.dataset.panel === "vocab") renderVocabPanel();
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
