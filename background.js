// ============================================================
// Pinboard Bookmark Enhanced - Background Service Worker (v4.0)
// ============================================================

importScripts(
  "i18n.js", "shared.js", "vocab-store.js", "vocab-gdrive.js",
  "ai-cache.js", "ai.js", "jina.js", "wayback.js"
);

// Load manual language setting (async, t() falls back to browser locale until ready)
initI18n();

// 图标路径
const ICONS_DEFAULT = {
  16: "icons/pin-default-16.png", 32: "icons/pin-default-32.png",
  48: "icons/pin-default-48.png", 128: "icons/pin-default-128.png"
};
const ICONS_BOOKMARKED = {
  16: "icons/pin-saved-16.png", 32: "icons/pin-saved-32.png",
  48: "icons/pin-saved-48.png", 128: "icons/pin-saved-128.png"
};
const ICONS_TOREAD = {
  16: "icons/pin-toread-16.png", 32: "icons/pin-toread-32.png",
  48: "icons/pin-toread-48.png", 128: "icons/pin-toread-128.png"
};
const ICON_PATHS = { default: ICONS_DEFAULT, saved: ICONS_BOOKMARKED, toread: ICONS_TOREAD };

// setIcon with a path: map makes Chrome RE-FETCH all 4 PNGs from disk on every
// call. Combined with tabs.onUpdated re-firing "complete" repeatedly (and the
// keepalive keeping the SW warm to service each one), this produced a sustained
// stream of pin-default-*.png requests that dragged page loads (the options page
// showed DOMContentLoaded ~2.4s). Decode each icon to ImageData ONCE at startup so
// setIcon never touches the network; setIcon falls back to path: until ready.
const _iconImageData = { default: null, saved: null };
async function _decodeIconSet(pathMap) {
  const out = {};
  for (const size of Object.keys(pathMap)) {
    const resp = await fetch(chrome.runtime.getURL(pathMap[size]));
    const blob = await resp.blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    canvas.getContext("2d").drawImage(bitmap, 0, 0);
    out[size] = canvas.getContext("2d").getImageData(0, 0, bitmap.width, bitmap.height);
    bitmap.close();
  }
  return out;
}
// Lazy: an MV3 "startup" is EVERY SW wake (alarms fire ~every 4 min), and a pure
// alarm wake never calls setIcon — decoding 12 PNGs up front on each wake was
// pure waste. First setIcon call kicks the decode; until it lands, setIcon's
// path: fallback covers the gap.
let _iconDecodeStarted = false;
function _ensureIconDecode() {
  if (_iconDecodeStarted) return;
  _iconDecodeStarted = true;
  (async () => {
    try {
      const [def, bm, tr] = await Promise.all([_decodeIconSet(ICONS_DEFAULT), _decodeIconSet(ICONS_BOOKMARKED), _decodeIconSet(ICONS_TOREAD)]);
      _iconImageData.default = def;
      _iconImageData.saved = bm;
      _iconImageData.toread = tr;
    } catch (_) { /* decode failed — setIcon keeps using the path: fallback */ }
  })();
}

// URL 状态缓存
const statusCache = new Map();
const CACHE_TTL = 5 * 60 * 1000;
const MAX_CACHE_SIZE = 500;
let _pinboardAuthEpoch = 0;

function pbpCapturePinboardAuth(token) {
  return {
    account: pbpPinboardAccountFromToken(token),
    epoch: _pinboardAuthEpoch,
  };
}

function pbpPinboardAuthEpoch() {
  return _pinboardAuthEpoch;
}

function pbpPinboardAuthIsCurrent(auth) {
  return !!auth?.account && auth.epoch === _pinboardAuthEpoch;
}

function pbpStatusCacheGet(url, auth) {
  if (!pbpPinboardAuthIsCurrent(auth)) return null;
  const cached = statusCache.get(url);
  return cached?.account === auth.account ? cached : null;
}

function pbpStatusCacheSet(url, auth, value) {
  if (!pbpPinboardAuthIsCurrent(auth)) return false;
  statusCache.set(url, { ...value, account: auth.account });
  cleanupStatusCache();
  return true;
}

function cleanupStatusCache() {
  if (statusCache.size <= MAX_CACHE_SIZE) return;
  const entries = [...statusCache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp);
  const toRemove = entries.slice(0, entries.length - MAX_CACHE_SIZE);
  toRemove.forEach(([key]) => statusCache.delete(key));
}

// ---- P2: Cached token + invalidation ----
let _cachedToken = null;

async function getCachedToken() {
  if (_cachedToken) return _cachedToken;
  const s = await loadSettings();
  _cachedToken = s.pinboardToken || null;
  return _cachedToken;
}

async function getCurrentPinboardAuth() {
  while (true) {
    const epoch = _pinboardAuthEpoch;
    const token = await getCachedToken();
    if (epoch !== _pinboardAuthEpoch) continue;
    return { token: token || "", account: pbpPinboardAccountFromToken(token), epoch };
  }
}

// ---- P3: Debounce + dedup for tab switch ----
// P2.7: Per-tab debounce bucket keeps unrelated tab events from cancelling the
// focused tab's refresh. Execution-time focus checks below discard background tabs.
// _pendingChecks handles network-layer dedup, so extra scheduling is cheap.
const _checkDebounceTimers = new Map(); // tabId -> timeoutId
function _scheduleTabCheck(tabId, fn, delay) {
  const prev = _checkDebounceTimers.get(tabId);
  if (prev) clearTimeout(prev);
  _checkDebounceTimers.set(tabId, setTimeout(() => {
    _checkDebounceTimers.delete(tabId);
    fn();
  }, delay));
}
const _pendingChecks = new Map(); // auth epoch + URL -> Promise

function invalidatePinboardAuthState() {
  _pinboardAuthEpoch++;
  const epoch = _pinboardAuthEpoch;
  _cachedToken = null;
  statusCache.clear();
  _pendingChecks.clear();
  _lastIconState.clear();
  _lastCheckedUrl.clear();
  try { Promise.resolve(chrome.storage.session.remove("_currentTab")).catch(() => {}); } catch (_) {}
  chrome.tabs.query({}).then((tabs) => {
    if (epoch !== _pinboardAuthEpoch) return;
    for (const tab of tabs) {
      if (typeof tab?.id === "number") setIcon(tab.id, "default");
      if (tab?.active && tab.url?.startsWith("http")) _scheduleCurrentTabRefresh(tab.id, tab.url);
    }
  }).catch(() => {});
  chrome.action.setBadgeText({ text: "" });
  updateBadge().catch(() => {});
}

let _authChangeTail = Promise.resolve();
function scheduleEffectiveAuthRefresh(changes, area) {
  if (!(changes.pinboardToken || changes.syncApiKeys || changes.optSyncEnabled)) return;
  _authChangeTail = _authChangeTail.then(async () => {
    let state;
    try {
      state = await pbpReadSecretSyncState({ includeGlobalWhenSyncOff: true, persistInferredState: false });
    } catch (_) {
      invalidatePinboardAuthState();
      return;
    }
    if (!pbpAuthStorageChangeIsRelevant(changes, area, state)) return;
    let freshToken;
    try {
      const raw = await pbpReadSettingsWithSecrets({ pinboardToken: SETTINGS_DEFAULTS.pinboardToken });
      freshToken = deobfuscateKey(raw.pinboardToken) || "";
    } catch (_) {
      invalidatePinboardAuthState();
      return;
    }
    if (_cachedToken === null) {
      // A restarted worker has no in-memory baseline, while the browser can still
      // display the previous worker's badge/icon. A relevant credential event is
      // therefore an unknown-to-changed transition and must fail closed.
      invalidatePinboardAuthState();
      return;
    }
    if (freshToken !== _cachedToken) invalidatePinboardAuthState();
  }).catch(() => invalidatePinboardAuthState());
}

async function debouncedCheck(url) {
  if (!url || !url.startsWith("http")) {
    return;
  }
  // Check if bookmark status icon is enabled
  try {
    const { optCheckBookmarkStatus } = await (await getSettingsStorage()).get({ optCheckBookmarkStatus: true });
    if (!optCheckBookmarkStatus) return;
  } catch (e) {
    // Storage unavailable — fall through to default behavior (check enabled)
    console.warn("[bookmark-status] settings read failed:", e?.message || e);
  }
  // Dedup only within one auth epoch. An older request may still settle after
  // logout/account switch, but its cache write is rejected by the epoch guard.
  const pendingKey = _pinboardAuthEpoch + "\n" + url;
  if (_pendingChecks.has(pendingKey)) {
    return _pendingChecks.get(pendingKey);
  }
  const promise = checkBookmarked(url);
  _pendingChecks.set(pendingKey, promise);
  try {
    return await promise;
  } finally {
    if (_pendingChecks.get(pendingKey) === promise) _pendingChecks.delete(pendingKey);
  }
}

// ---- Load settings with deobfuscation (module-level cache, invalidated on storage.onChanged) ----
let _settingsCache = null;
let _settingsCacheGeneration = 0;
let _settingsCachePending = null;
async function loadSettings() {
  while (true) {
    if (_settingsCache) return _settingsCache;
    const generation = _settingsCacheGeneration;
    if (!_settingsCachePending || _settingsCachePending.generation !== generation) {
      const promise = pbpReadSettingsWithSecrets(SETTINGS_DEFAULTS).then(deobfuscateSettings);
      _settingsCachePending = { generation, promise };
    }
    const pending = _settingsCachePending;
    try {
      const settings = await pending.promise;
      if (generation !== _settingsCacheGeneration) continue;
      _settingsCache = settings;
      return settings;
    } catch (error) {
      if (generation === _settingsCacheGeneration) throw error;
    } finally {
      if (_settingsCachePending === pending) _settingsCachePending = null;
    }
  }
}
function invalidateSettingsCache() {
  _settingsCacheGeneration++;
  _settingsCache = null;
}

// F7: Track recent saves for undo via notification button.
// MV3: this worker is killed after 30s idle, so the Map alone cannot own the undo
// state — the toast outlives the worker and the button would then silently no-op.
// storage.session is the source of truth (it lives exactly as long as the browser
// session that can still show the toast); the Map is only this generation's warm
// cache. Expiry runs off a named alarm, not setTimeout, for the same reason.
const _recentSaves = new Map(); // notificationId -> { url, account, expiresAt }
const PBP_UNDO_KEY = "_undoSaves";
const PBP_UNDO_TTL = 30000;
const PBP_UNDO_ALARM = "undo-expire";
// A little past the TTL so a sweep never lands on a record that is one tick short
// of expiring (Chrome clamps alarms under 30s anyway).
const PBP_UNDO_ALARM_DELAY_MIN = (PBP_UNDO_TTL + 5000) / 60000;

function pbpUndoSessionStore() {
  try { return chrome.storage?.session || null; } catch (_) { return null; }
}

async function pbpRememberUndo(notifId, record) {
  _recentSaves.set(notifId, record);
  const store = pbpUndoSessionStore();
  if (!store) return; // memory-only fallback: undo still works while this worker lives
  try {
    const map = (await store.get(PBP_UNDO_KEY))[PBP_UNDO_KEY] || {};
    const now = Date.now();
    for (const id of Object.keys(map)) { if (!(map[id]?.expiresAt > now)) delete map[id]; }
    map[notifId] = record;
    await store.set({ [PBP_UNDO_KEY]: map });
    chrome.alarms.create(PBP_UNDO_ALARM, { delayInMinutes: PBP_UNDO_ALARM_DELAY_MIN });
  } catch (e) {
    // No secrets in the record (non-secret account + the saved URL), but log the
    // platform failure: a lost record downgrades Undo to a dead button.
    console.warn("[undo] cannot persist undo record:", e?.name, e?.message);
  }
}

// Undo is single-use: drop the record from both tiers before the network call.
// Returns null when the record is unknown (lost with an earlier worker) or expired.
async function pbpTakeUndoRecord(notifId) {
  let record = _recentSaves.get(notifId) || null;
  _recentSaves.delete(notifId);
  const store = pbpUndoSessionStore();
  if (store) {
    try {
      const map = (await store.get(PBP_UNDO_KEY))[PBP_UNDO_KEY] || {};
      if (!record) record = map[notifId] || null;
      if (map[notifId]) { delete map[notifId]; await store.set({ [PBP_UNDO_KEY]: map }); }
    } catch (e) {
      console.warn("[undo] session lookup failed:", e?.name, e?.message);
    }
  }
  if (!record) return null;
  return (record.expiresAt && record.expiresAt <= Date.now()) ? null : record;
}

// chrome.notifications.clear() returns a promise — a sync try/catch never sees its
// rejection. Await it and leave a trace (the id carries no user data).
async function pbpClearNotification(notifId) {
  try { await chrome.notifications.clear(notifId); }
  catch (e) { console.warn("[undo] notification clear failed:", e?.name, e?.message); }
}

// Alarm-driven expiry: drop timed-out records and take their toasts down, so no
// notification center keeps an Undo button that can no longer do anything.
async function pbpSweepExpiredUndo() {
  const now = Date.now();
  for (const [id, record] of _recentSaves) { if (!(record?.expiresAt > now)) _recentSaves.delete(id); }
  const store = pbpUndoSessionStore();
  if (!store) return;
  const map = (await store.get(PBP_UNDO_KEY))[PBP_UNDO_KEY] || {};
  let changed = false;
  for (const [id, record] of Object.entries(map)) {
    if (record?.expiresAt > now) continue;
    delete map[id];
    changed = true;
    await pbpClearNotification(id);
  }
  if (changed) await store.set({ [PBP_UNDO_KEY]: map });
  // A save that landed between two sweeps is still pending: schedule one more pass.
  if (Object.keys(map).length) chrome.alarms.create(PBP_UNDO_ALARM, { delayInMinutes: PBP_UNDO_ALARM_DELAY_MIN });
}

async function pbpReadFreshPinboardAuthForAccount(account) {
  while (true) {
    const epoch = pbpPinboardAuthEpoch();
    const raw = await pbpReadSettingsWithSecrets({ pinboardToken: SETTINGS_DEFAULTS.pinboardToken });
    const token = deobfuscateKey(raw.pinboardToken) || "";
    if (epoch !== pbpPinboardAuthEpoch()) continue;
    const auth = { token, account: pbpPinboardAccountFromToken(token), epoch };
    return auth.account && auth.account === account ? auth : null;
  }
}

// ---- Show Chrome notification (with category filter) ----
async function showNotification(id, title, message, category, undoInfo) {
  try {
    const cats = await (await getSettingsStorage()).get({
      notifyQuickSave: true, notifyReadLater: true,
      notifyTabSet: true, notifyBatchSave: true, notifyErrors: true
    });
    if (category === "quickSave" && !cats.notifyQuickSave) return;
    if (category === "readLater" && !cats.notifyReadLater) return;
    if (category === "tabSet" && !cats.notifyTabSet) return;
    if (category === "batchSave" && !cats.notifyBatchSave) return;
    if (category === "error" && !cats.notifyErrors) return;
  } catch (_) {
    // Storage failure: default to showing the notification (least surprising)
  }
  const notifId = id + "-" + Date.now();
  const opts = { type: "basic", iconUrl: "icons/pin-default-48.png", title, message };
  if (undoInfo) {
    opts.buttons = [{ title: t("bgUndo") }];
    // Register before the toast exists, so the button can never be clicked ahead
    // of its record. Chrome/OS notification centers keep the toast visible
    // indefinitely, so the sweep clears it once the record expires.
    await pbpRememberUndo(notifId, {
      url: undoInfo.url, account: undoInfo.account, expiresAt: Date.now() + PBP_UNDO_TTL
    });
  }
  chrome.notifications.create(notifId, opts);
}

// Undo failure feedback: the bookmark is still on Pinboard, so the "saved"
// toast stays truthful and is left in place — what the click needs is to hear
// that the removal did not happen. Same showNotification error family (and the
// same notifyErrors gate) every other Pinboard write path uses; the body is the
// server's own result_code when it sent one, else the key classifyPinboardError
// derives from the response or the thrown error.
function pbpNotifyUndoFailed(cause) {
  const message = (typeof cause === "string" && cause) ? cause : t(classifyPinboardError(cause));
  showNotification("undo-error", t("bgUndoFailed"), message, "error");
}

// F7: Handle undo button click on notifications
chrome.notifications.onButtonClicked.addListener(async (notifId, btnIndex) => {
  if (btnIndex !== 0) return;
  const info = await pbpTakeUndoRecord(notifId);
  if (!info) {
    // Expired, or lost with an earlier worker generation: the toast is still on
    // screen offering an Undo that cannot happen. Take it down so the click at
    // least removes the dead button instead of doing nothing at all.
    await pbpClearNotification(notifId);
    return;
  }
  try {
    const auth = await pbpReadFreshPinboardAuthForAccount(info.account);
    if (!auth || !pbpPinboardAuthIsCurrent(auth)) {
      // A different signed-in account is the deliberate isolation cancel — the
      // record belongs to an account this session may not act for, the same
      // reason the catch below exempts account_changed from even a log. A
      // cleared token is a real failure the click deserves to hear about; 401
      // is the shape classifyPinboardError maps to the auth copy.
      const current = await getCurrentPinboardAuth().catch(() => null);
      if (!current?.token) pbpNotifyUndoFailed(401);
      return;
    }
    const resp = await pinboardFetch(`https://api.pinboard.in/v1/posts/delete?auth_token=${auth.token}&url=${encodeURIComponent(info.url)}&format=json`);
    // Classify the HTTP layer first, the way deliverSaveIntent does: 401/403/429
    // and 5xx answer with an HTML body, so reading result_code first turned every
    // one of them into a silent JSON parse failure.
    if (!resp.ok) { pbpNotifyUndoFailed(resp); return; }
    let data = null;
    try { data = await resp.json(); } catch (_) { /* classified below */ }
    const code = typeof data?.result_code === "string" ? data.result_code : "";
    // "item not found" means the bookmark is already gone — that IS the state the
    // user asked for, so finish it exactly like a delete this click performed.
    if (code === "done" || /item\s+not\s+found/i.test(code)) {
      pbpStatusCacheSet(info.url, auth, { bookmarked: false, timestamp: Date.now() });
      try {
        // Same reset the bookmark_deleted handler does: _lastIconState dedup would
        // otherwise pin the toolbar icon to "saved" until the user navigates away.
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (pbpPinboardAuthIsCurrent(auth) && tab?.id && pbpSameBookmark(tab.url, info.url)) {
          setIcon(tab.id, "default");
        }
      } catch (e) {
        // The removal already landed: a failed icon reset must never reach the
        // user as a failed Undo.
        console.warn("[undo] icon reset failed:", e?.name, e?.message);
      }
      // The "saved" toast is now false and its button is spent — replace it.
      await pbpClearNotification(notifId);
      showNotification("undo-done", t("bgUndone"), t("bgBookmarkRemoved"));
      return;
    }
    pbpNotifyUndoFailed(code);
  } catch (e) {
    if (e?.code === "account_changed") return;
    // Undo path failure — user expects feedback, log so it's debuggable
    console.warn("[undo] bookmark removal failed:", e?.message || e);
    pbpNotifyUndoFailed(e);
  }
});

// ---- 设置图标 ----
// Use callback form (not promise) so chrome.runtime.lastError is consumed
// inside the callback — the only Chromium-guaranteed way to mark it handled.
// Reading lastError after `await` (promise form) is too late: the unchecked
// check fires in the same microtask the promise settles, before user code runs.
// Symptoms otherwise: "Unchecked runtime.lastError: No tab with id: X"
// with Context: Unknown and Stack: :0 (anonymous function).
const _lastIconState = new Map(); // tabId -> last state string set (dedup)
function setIcon(tabId, state) {
  if (typeof tabId !== "number" || tabId < 0) return;
  if (typeof state === "boolean") state = state ? "saved" : "default"; // legacy guard
  // Dedup: skip if this tab's icon is already in the desired state. A tab that
  // re-fires onUpdated "complete" repeatedly would otherwise re-set the same icon
  // over and over — this guard eliminates that storm regardless of trigger frequency.
  if (_lastIconState.get(tabId) === state) return;
  _lastIconState.set(tabId, state);
  _ensureIconDecode(); // lazy one-shot; path: fallback below covers until it lands
  try {
    const cached = _iconImageData[state];
    const details = cached
      ? { tabId, imageData: cached }                              // in-memory, zero network
      : { tabId, path: ICON_PATHS[state] || ICONS_DEFAULT };       // fallback until decoded
    chrome.action.setIcon(details, () => { void chrome.runtime.lastError; /* consume to mark handled */ });
  } catch (_) { /* synchronous throw on invalid args — ignore */ }
}

// ---- 检查 URL 是否已收藏 (uses cached token, direct fetch for latency) ----
async function checkBookmarked(url, capturedAuth = null) {
  const auth = capturedAuth || await getCurrentPinboardAuth();
  if (!auth.token || !auth.account) return false;
  if (capturedAuth && !pbpPinboardAuthIsCurrent(auth)) return false;
  const cached = pbpStatusCacheGet(url, auth);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) return cached.bookmarked;
  try {
    const resp = await pinboardFetch(`https://api.pinboard.in/v1/posts/get?auth_token=${auth.token}&format=json&url=${encodeURIComponent(url)}`);
    if (!resp.ok) return false;
    const data = await resp.json();
    const posts = data.posts || [];
    const bookmarked = posts.length > 0;
    return pbpStatusCacheSet(url, auth, { bookmarked, timestamp: Date.now(), posts })
      ? bookmarked
      : false;
  } catch (e) {
    // "Failed to fetch" is expected on network loss or API downtime — only warn for unexpected errors
    if (e?.code !== "account_changed" && !(e instanceof TypeError && /failed to fetch/i.test(e.message))) {
      console.warn("checkBookmarked error:", e);
    }
    return false;
  }
}

// ---- Badge: unread count ----
async function updateBadge() {
  const s = await loadSettings();
  const auth = await getCurrentPinboardAuth();
  if (!s.optShowBadge || !auth.token) {
    chrome.action.setBadgeText({ text: "" });
    return;
  }
  try {
    const resp = await pinboardFetch(`https://api.pinboard.in/v1/posts/all?auth_token=${auth.token}&format=json&toread=yes&results=100&meta=no`);
    const data = await resp.json();
    if (!pbpPinboardAuthIsCurrent(auth)) return;
    const count = Array.isArray(data) ? data.length : 0;
    chrome.action.setBadgeText({ text: count > 0 ? String(count > 99 ? "99+" : count) : "" });
    chrome.action.setBadgeBackgroundColor({ color: "#4477bb" });
  } catch (_) {
    // chrome.action API failure is non-fatal — badge is informational only
  }
}

// ---- Unified save pipeline + offline queue ----

const PBP_SAVE_MODES = new Set(["create", "update", "merge", "skip", "overwrite"]);
const PBP_POPUP_SAVE_MODES = new Set(["create", "update", "merge"]);

function pbpSaveFailure(reason, { detail, httpStatus } = {}) {
  const result = { status: "failed", reason };
  if (detail) {
    result.detail = String(detail)
      .replace(/auth_token=[^&\s]+/gi, "auth_token=[redacted]")
      .slice(0, 160);
  }
  if (Number.isInteger(httpStatus)) result.httpStatus = httpStatus;
  return result;
}

function validateSaveIntent(intent) {
  if (!intent || typeof intent !== "object" || Array.isArray(intent)) return pbpSaveFailure("invalid");
  if (!PBP_SAVE_MODES.has(intent.mode)) return pbpSaveFailure("invalid");
  if (typeof intent.url !== "string" || typeof intent.title !== "string"
      || typeof intent.notes !== "string" || typeof intent.tags !== "string"
      || typeof intent.private !== "boolean") return pbpSaveFailure("invalid");
  try {
    const parsed = new URL(intent.url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return pbpSaveFailure("invalid");
  } catch (_) {
    return pbpSaveFailure("invalid");
  }
  if (intent.toread !== undefined && typeof intent.toread !== "boolean") return pbpSaveFailure("invalid");
  if (intent.archive !== undefined && typeof intent.archive !== "boolean") return pbpSaveFailure("invalid");
  if (intent.time !== undefined && (typeof intent.time !== "string" || !intent.time)) return pbpSaveFailure("invalid");
  if (intent.mode === "update" && !intent.time) return pbpSaveFailure("invalid");
  if (intent.mode === "create" && intent.time !== undefined) return pbpSaveFailure("invalid");
  return null;
}

// Delivery-time merge/skip decisions always use a fresh read. statusCache remains
// a presentation cache and is refreshed only after a successful lookup.
async function fetchExistingBookmark(url, token, auth = pbpCapturePinboardAuth(token)) {
  try {
    const resp = await pinboardFetch(`https://api.pinboard.in/v1/posts/get?auth_token=${token}&format=json&url=${encodeURIComponent(url)}`);
    if (!resp.ok) {
      const httpStatus = Number.isInteger(resp.status) ? resp.status : undefined;
      const reason = httpStatus === 401 || httpStatus === 403 ? "not_logged_in" : "http";
      return {
        exists: false,
        lookupFailed: true,
        reason,
        httpStatus,
        retryable: httpStatus === 429 || httpStatus >= 500,
      };
    }
    const data = await resp.json();
    if (!Array.isArray(data?.posts)) {
      return {
        exists: false,
        lookupFailed: true,
        reason: "lookup",
        retryable: true,
      };
    }
    const posts = data.posts;
    const exists = posts.length > 0;
    const post = exists ? posts[0] : null;
    pbpStatusCacheSet(url, auth, { bookmarked: exists, timestamp: Date.now(), posts });
    return {
      exists,
      lookupFailed: false,
      post,
    };
  } catch (error) {
    if (error?.code === "account_changed") {
      return { exists: false, lookupFailed: true, reason: "account_changed", retryable: false };
    }
    return {
      exists: false,
      lookupFailed: true,
      reason: "lookup",
      retryable: true,
    };
  }
}

async function pbpSendResolvedPlan(plan, settings) {
  const apiUrl = buildPostsAddUri({
    token: settings.pinboardToken,
    url: plan.fields.url,
    title: plan.fields.title,
    extended: plan.fields.notes,
    tags: plan.fields.tags,
    shared: plan.fields.private ? "no" : "yes",
    toread: plan.fields.toread ? "yes" : "no",
    dt: plan.fields.time,
    replace: plan.replace,
  });
  if (apiUrl.length > POSTS_ADD_URI_BUDGET) {
    return { result: pbpSaveFailure("too_long", { detail: String(apiUrl.length) }), persisted: null, retryable: false };
  }

  let resp;
  try {
    resp = await pinboardFetch(apiUrl);
  } catch (error) {
    if (error?.code === "account_changed") {
      return { result: pbpSaveFailure("account_changed"), persisted: null, retryable: false };
    }
    return { result: pbpSaveFailure("network"), persisted: null, retryable: true };
  }

  const httpStatus = Number.isInteger(resp.status) ? resp.status : undefined;
  if (httpStatus === 409 || httpStatus === 412) {
    return { result: pbpSaveFailure("conflict", { httpStatus }), persisted: null, retryable: false };
  }
  if (resp.ok === false) {
    if (httpStatus === 401 || httpStatus === 403) {
      return { result: pbpSaveFailure("not_logged_in", { httpStatus }), persisted: null, retryable: false };
    }
    if (httpStatus === 414) {
      return { result: pbpSaveFailure("too_long", { detail: String(apiUrl.length), httpStatus }), persisted: null, retryable: false };
    }
    return {
      result: pbpSaveFailure("http", { httpStatus }),
      persisted: null,
      retryable: httpStatus === 429 || httpStatus >= 500,
    };
  }

  let data = null;
  try { data = await resp.json(); } catch (_) { /* classified below */ }
  const code = typeof data?.result_code === "string" ? data.result_code : "";
  if (code === "done") {
    return {
      result: { status: "saved", mutation: plan.mutation },
      persisted: { ...plan.fields },
      retryable: false,
    };
  }
  if (/already\s+exists/i.test(code)) {
    return { result: pbpSaveFailure("conflict", { httpStatus }), persisted: null, retryable: false };
  }
  return {
    result: pbpSaveFailure("api", { detail: code || "invalid_response", httpStatus }),
    persisted: null,
    retryable: false,
  };
}

async function deliverSaveIntent(intent, settings, auth = pbpCapturePinboardAuth(settings?.pinboardToken)) {
  const invalid = validateSaveIntent(intent);
  if (invalid) return { result: invalid, persisted: null, retryable: false };
  if (!settings?.pinboardToken) {
    return { result: pbpSaveFailure("not_logged_in"), persisted: null, retryable: false };
  }

  let recoveredConflict = false;
  while (true) {
    if (!pbpPinboardAuthIsCurrent(auth)) {
      return { result: pbpSaveFailure("account_changed"), persisted: null, retryable: false };
    }
    let lookup = null;
    if (intent.mode === "merge" || intent.mode === "skip") {
      lookup = await fetchExistingBookmark(intent.url, settings.pinboardToken, auth);
    }
    if (!pbpPinboardAuthIsCurrent(auth)) {
      return { result: pbpSaveFailure("account_changed"), persisted: null, retryable: false };
    }
    const plan = pbpResolveSavePlan(intent, lookup);
    if (plan.action === "failed") {
      return { result: plan.result, persisted: null, retryable: !!plan.retryable || !!lookup?.retryable };
    }
    if (plan.action === "skip") {
      return { result: { status: "skipped" }, persisted: plan.fields, retryable: false };
    }

    const delivered = await pbpSendResolvedPlan(plan, settings);
    if (delivered.result.reason !== "conflict"
        || recoveredConflict
        || (intent.mode !== "merge" && intent.mode !== "skip")) return delivered;
    recoveredConflict = true;
  }
}

// Serialize ALL offlineQueue writes through one promise chain so concurrent handlers
// (enqueue / process / retry / popup remove+clear messages) never lose updates.
const runOfflineQueueWrite = pbpCreateRecoveringTail();
function mutateOfflineQueue(action) {
  return runOfflineQueueWrite(async () => {
    const { offlineQueue = [] } = await chrome.storage.local.get("offlineQueue");
    const next = pbpOfflineQueueReduce(offlineQueue, action);
    await chrome.storage.local.set({ offlineQueue: next });
    // A non-empty queue needs the (conditional) keepalive alarm alive to drive
    // replay. typeof-guarded: source-slice test pages run this without the
    // alarm block in scope.
    if (next.length && typeof _ensureKeepaliveAlarmOnce === "function") _ensureKeepaliveAlarmOnce();
    return next;
  });
}

function newOfflineQueueId() {
  return Date.now() + "-" + Math.random().toString(36).slice(2, 9);
}

async function readOfflineQueueWithIds() {
  return runOfflineQueueWrite(async () => {
    let { offlineQueue = [] } = await chrome.storage.local.get("offlineQueue");
    if (!Array.isArray(offlineQueue)) offlineQueue = [];
    const prefix = newOfflineQueueId();
    let changed = false;
    const next = offlineQueue.map((item, index) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return item;
      let migrated = item;
      if (!item.queueId) {
        migrated = { ...migrated, queueId: `${prefix}-${index}` };
        changed = true;
      }
      if (Object.prototype.hasOwnProperty.call(item, "token")) {
        const storedAccount = typeof item.account === "string" ? item.account : "";
        const account = storedAccount || pbpPinboardAccountFromToken(item.token);
        migrated = { ...migrated, ...(account ? { account } : {}) };
        delete migrated.token;
        changed = true;
      }
      return migrated;
    });
    if (changed) {
      await chrome.storage.local.set({ offlineQueue: next });
      offlineQueue = next;
    }
    return Array.isArray(offlineQueue) ? offlineQueue : [];
  });
}

async function enqueueOfflineSave(params) {
  const queueId = newOfflineQueueId();
  await mutateOfflineQueue({ kind: "enqueue", item: { ...params, queuedAt: Date.now(), queueId } });
  return queueId;
}

function normalizeOfflineSaveIntent(item, settings) {
  const hasStoredMode = Object.prototype.hasOwnProperty.call(item || {}, "mode");
  const legacyMode = settings?.bgSaveMode === "skip" || settings?.bgSaveMode === "overwrite"
    ? settings.bgSaveMode
    : "merge";
  return {
    mode: hasStoredMode ? item.mode : legacyMode,
    url: typeof item?.url === "string" ? item.url : "",
    title: typeof item?.title === "string" ? item.title : "",
    notes: typeof item?.notes === "string" ? item.notes : "",
    tags: typeof item?.tags === "string" ? item.tags : "",
    private: item?.private === true,
    toread: item?.toread === true || item?.toread === "yes",
    archive: typeof item?.archive === "boolean" ? item.archive : undefined,
    time: typeof item?.time === "string" && item.time ? item.time : undefined,
  };
}

// pinboardFetch serializes request starts, not the lookup-to-write transaction.
// This tail protects that complete transaction for both live saves and replay.
const runSaveDeliveryTransaction = pbpCreateRecoveringTail();

async function applySaveResultSideEffects(envelope, settings, {
  deferBadge = false,
  auth = pbpCapturePinboardAuth(settings?.pinboardToken),
} = {}) {
  const { result, persisted } = envelope || {};
  if (!persisted || (result?.status !== "saved" && result?.status !== "skipped")) return;

  try {
    const cachedPosts = result.status === "skipped" ? pbpStatusCacheGet(persisted.url, auth)?.posts : undefined;
    const cacheUpdated = pbpStatusCacheSet(persisted.url, auth, {
      bookmarked: true,
      timestamp: Date.now(),
      toreadHint: persisted.toread === true,           // display stub — posts only ever come from a real posts/get response
      ...(cachedPosts ? { posts: cachedPosts } : {}),
    });
    if (cacheUpdated) {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (pbpPinboardAuthIsCurrent(auth) && tab?.id && pbpSameBookmark(tab.url, persisted.url)) {
        setIcon(tab.id, iconStateFor(pbpStatusCacheGet(persisted.url, auth)));
      }
    }
  } catch (_) { /* status/icon are best-effort */ }

  if (result.status !== "saved") return;
  if (!deferBadge) {
    try { Promise.resolve(updateBadge()).catch(() => {}); } catch (_) {}
  }
  try {
    Promise.resolve(pbpWaybackArchive(persisted.url, settings, {
      isPrivate: persisted.private === true,
      override: persisted.archive,
    })).catch(() => {});
  } catch (_) { /* accepted save is never requeued for a side-effect failure */ }
}

function queueRecordFromSaveIntent(intent, token) {
  return {
    account: pbpPinboardAccountFromToken(token),
    mode: intent.mode === "create" ? "merge" : intent.mode,
    url: intent.url,
    title: intent.title,
    notes: intent.notes,
    tags: intent.tags,
    private: intent.private,
    toread: intent.toread,
    archive: intent.archive,
    time: intent.time,
  };
}

function submitSaveIntent(intent, { deferBadge = false, expectedAccount = "" } = {}) {
  return runSaveDeliveryTransaction(async () => {
    let settings;
    try { settings = await loadSettings(); }
    catch (_) { return pbpSaveFailure("internal"); }
    let deliveryAuth;
    try { deliveryAuth = await getCurrentPinboardAuth(); }
    catch (_) { return pbpSaveFailure("internal"); }
    const deliveryAccount = pbpPinboardAccountFromToken(settings.pinboardToken);
    if (!deliveryAuth.token) return pbpSaveFailure("not_logged_in");
    if (expectedAccount && deliveryAuth.account !== expectedAccount) {
      return pbpSaveFailure("account_changed");
    }
    if (settings.pinboardToken && deliveryAuth.account !== deliveryAccount) {
      return pbpSaveFailure("internal");
    }
    const deliverySettings = { ...settings, pinboardToken: deliveryAuth.token };

    let envelope;
    try { envelope = await deliverSaveIntent(intent, deliverySettings, deliveryAuth); }
    catch (_) { return pbpSaveFailure("internal"); }

    if (envelope.result.status === "saved" || envelope.result.status === "skipped") {
      await applySaveResultSideEffects(envelope, deliverySettings, { deferBadge, auth: deliveryAuth });
      return envelope.result.status === "saved" && envelope.result.mutation === "created"
        ? { ...envelope.result, account: deliveryAuth.account }
        : envelope.result;
    }
    if (!envelope.retryable || !deliverySettings.offlineQueueEnabled) return envelope.result;

    try {
      const queueId = await enqueueOfflineSave(queueRecordFromSaveIntent(intent, deliverySettings.pinboardToken));
      return { status: "queued", queueId };
    } catch (_) {
      return pbpSaveFailure("storage");
    }
  });
}

function sendOfflineItem(item) {
  return runSaveDeliveryTransaction(async () => {
    let settings;
    try { settings = await loadSettings(); }
    catch (_) {
      return { result: pbpSaveFailure("internal"), persisted: null, retryable: false, settings: {} };
    }
    let deliveryAuth;
    try { deliveryAuth = await getCurrentPinboardAuth(); }
    catch (_) {
      return { result: pbpSaveFailure("internal"), persisted: null, retryable: false, settings };
    }
    const token = pbpResolveOfflineQueueToken(deliveryAuth.token, item);
    if (!token) {
      const reason = deliveryAuth.token ? "account_mismatch" : "not_logged_in";
      return { result: pbpSaveFailure(reason), persisted: null, retryable: false, settings };
    }
    const deliverySettings = { ...settings, pinboardToken: token };
    const intent = normalizeOfflineSaveIntent(item, settings);
    let envelope;
    try { envelope = await deliverSaveIntent(intent, deliverySettings, deliveryAuth); }
    catch (_) { envelope = { result: pbpSaveFailure("internal"), persisted: null, retryable: false }; }
    return { ...envelope, settings: deliverySettings, auth: deliveryAuth };
  });
}

function drainOfflineQueueIds(queueIds) {
  return pbpDrainOfflineQueue(queueIds, {
    getItem: (queueId) => runOfflineQueueWrite(async () => {
      const { offlineQueue = [] } = await chrome.storage.local.get("offlineQueue");
      return Array.isArray(offlineQueue)
        ? offlineQueue.find((item) => item?.queueId === queueId) || null
        : null;
    }),
    // noteActivity: replay work is activity (same rationale as batch progress —
    // a long drain driven by the keepalive alarm must not idle-terminate
    // mid-run). typeof-guarded: source-slice test pages execute this function
    // without the keepalive block in scope.
    sendItem: (item) => { if (typeof noteActivity === "function") noteActivity(); return sendOfflineItem(item); },
    removeItem: (queueId) => mutateOfflineQueue({ kind: "remove", queueId }),
    onSuccess: (_item, delivered) => applySaveResultSideEffects(delivered, delivered.settings, { auth: delivered.auth }),
  });
}

const runOfflineQueueConsumer = pbpCreateRecoveringTail();
let _offlineQueueDrain = null;
function processOfflineQueue() {
  if (_offlineQueueDrain) return _offlineQueueDrain;
  const operation = runOfflineQueueConsumer(async () => {
    const snapshot = await readOfflineQueueWithIds();
    if (!snapshot.length) return;
    await drainOfflineQueueIds(snapshot.map((item) => item?.queueId).filter(Boolean));
  });
  const drain = operation.finally(() => {
    if (_offlineQueueDrain === drain) _offlineQueueDrain = null;
  });
  _offlineQueueDrain = drain;
  return drain;
}

function retryOfflineItem(queueId) {
  if (!queueId || typeof queueId !== "string") {
    return Promise.resolve({ ok: false, result: pbpSaveFailure("invalid") });
  }
  return runOfflineQueueConsumer(async () => {
    try {
      await readOfflineQueueWithIds();
      const outcomes = await drainOfflineQueueIds([queueId]);
      const outcome = outcomes[0];
      return outcome
        ? { ok: outcome.acknowledged, result: outcome.result }
        : { ok: false, result: pbpSaveFailure("invalid") };
    } catch (_) {
      return { ok: false, result: pbpSaveFailure("storage") };
    }
  });
}

function submitPopupSaveIntent(intent, expectedAccount) {
  if (!expectedAccount || typeof expectedAccount !== "string") {
    return Promise.resolve(pbpSaveFailure("account_changed"));
  }
  if (!intent || !PBP_POPUP_SAVE_MODES.has(intent.mode)) {
    return Promise.resolve(pbpSaveFailure("invalid"));
  }
  if (intent.mode === "update" && !intent.time) {
    return Promise.resolve(pbpSaveFailure("invalid"));
  }
  if (intent.mode === "create" && intent.time !== undefined) {
    return Promise.resolve(pbpSaveFailure("invalid"));
  }
  return submitSaveIntent(intent, { expectedAccount });
}

// ---- P1: Shared save function ----
async function saveFromBackground({ url, title, tab, settingsOverrides, toread, notifyId, notifyTitle, notifyCategory }) {
  const startAuth = await getCurrentPinboardAuth();
  if (!startAuth.token) {
    showNotification(notifyId + "-error", t("bgNotLoggedIn"), t("bgSetToken"), "error");
    return pbpSaveFailure("not_logged_in");
  }
  const loadedSettings = await loadSettings();
  const s = { ...loadedSettings, ...(settingsOverrides || {}), pinboardToken: startAuth.token };
  const mode = s.bgSaveMode === "skip" || s.bgSaveMode === "overwrite" ? s.bgSaveMode : "merge";
  const isPrivate = pbpEffectivePrivate(s, { incognito: tab?.incognito });

  // Extract page info if tab available
  let pageInfo = null;
  if (tab?.id) {
    try {
      pageInfo = (s._aiTags || s._aiSummary) && hasAIKey(s)
        ? await getPageInfoFromTab(tab.id, { withDefuddle: true, expectedUrl: url })
        : await getPageInfoFromTab(tab.id, { expectedUrl: url });
    } catch (_) { /* content script may not be injected yet — proceed with empty pageInfo */ }
  }

  // Build notes from page info
  let notes = "";
  if (pageInfo) {
    notes = buildAutoNotes(pageInfo, {
      autoDescription: s._autoNotes,
      blockquote: s._blockquote,
      includeReferrer: false
    });
  }

  // Default tags
  let tags = [];
  if (s._defaultTags) {
    tags = s._defaultTags.split(/[,\s]+/).map(t => t.trim()).filter(Boolean);
  }

  // AI features
  // SW extraction is ALWAYS local (getPageInfoFromTab + Defuddle) - it
  // never calls Jina. Cache under the namespace that matches the content
  // (audit A3): keying by the configured aiContentSource wrote local
  // results into the "jina" namespace, which the popup then served as
  // supposed Jina extractions.
  const aiCacheSource = "local";
  // Popup parity (audit A14): feed the tag prompts the same frequency-
  // sorted vocabulary the popup injects; without it quick-saved bookmarks
  // got tags with zero anchoring to the user's existing tag system.
  let userTagsTop = [];
  try {
    const cachedTags = await chrome.storage.local.get("cached_user_tags");
    const entry = cachedTags?.cached_user_tags;
    if (entry?.account === startAuth.account && entry.counts) userTagsTop = pbpTagsByCount(entry.counts);
  } catch (_) { /* no cache -> unanchored prompt, same as before */ }
  const aiPromises = [];
  let aiHostPermissionMissing = false;
  let combinedCachedTags = null;
  let combinedCachedSummary = null;
  // Per-artifact resolution state (audit A8): null = still needed. A
  // combined reply may legally come back half-empty ({"summary":"ok",
  // "tags":[]}) - the produced half is applied, the EMPTY half falls
  // through to its own dedicated single call below instead of being
  // silently treated as a produced result.
  let aiTagsResolved = null;
  let summaryResolved = null;

  // Both tags AND summary requested -> one combined call (sends the body once).
  // Gated OFF when the user set a custom tag/summary prompt: the combined prompt uses
  // TAG_GUIDANCE (not their template), so customizers fall through to the separate calls
  // below, which honor customTagPrompt/customSummaryPrompt (Global Constraint).
  if (pageInfo?.pageText && hasAIKey(s) && s._aiTags && s._aiSummary
      && !s.customTagPrompt?.trim() && !s.customSummaryPrompt?.trim()) {
    try {
      const tCached = combinedCachedTags = await getAICache(url, "tags", s.aiCacheDuration, aiCacheSource, startAuth.account, s);
      const sCached = combinedCachedSummary = await getAICache(url, "summary", s.aiCacheDuration, aiCacheSource, startAuth.account, s);
      // A16: a cached half is reused as-is; the combined call only runs
      // when BOTH halves are missing (regenerating both overwrote the
      // cached one and paid for it again). Exactly one missing -> its
      // dedicated single job below fills it.
      if (tCached) aiTagsResolved = tCached;
      if (sCached) summaryResolved = sCached;
      if (aiTagsResolved === null && summaryResolved === null) {
        const resp = await callAI(s, buildCombinedPrompt(s, title, url, pageInfo.pageText, notes, pbpRelevantTagsFirst(userTagsTop, title, url)));
        const parsed = parseAICombined(resp, s.aiTagSeparator);
        // Cache each half only when it has content: a cached empty would
        // turn the malformed half into a sticky fake success (A8).
        if (parsed.tags.length) {
          aiTagsResolved = parsed.tags;
          await setAICache(url, "tags", parsed.tags, s.aiCacheDuration, aiCacheSource, startAuth.account, s);
        }
        if (parsed.summary) {
          summaryResolved = parsed.summary;
          await setAICache(url, "summary", parsed.summary, s.aiCacheDuration, aiCacheSource, startAuth.account, s);
        }
      }
    } catch (e) {
      if (e?.code === "host_permission") {
        aiHostPermissionMissing = true;
        if (combinedCachedTags) aiTagsResolved = combinedCachedTags;
        if (combinedCachedSummary) summaryResolved = combinedCachedSummary;
        console.warn(`${notifyCategory} AI skipped:`, e.message);
      } else {
        console.warn(`${notifyCategory} AI combined failed, falling back to separate calls:`, e.message);
      }
    }
  }

  if (!aiHostPermissionMissing && pageInfo?.pageText && hasAIKey(s)) {
    if (s._aiTags && aiTagsResolved === null) {
      aiPromises.push(
        (async () => {
          try {
            const cached = await getAICache(url, "tags", s.aiCacheDuration, aiCacheSource, startAuth.account, s);
            if (cached) return { type: "tags", result: cached };
            const prompt = buildTagPrompt(s, title, url, pageInfo.pageText, notes, pbpRelevantTagsFirst(userTagsTop, title, url));
            const resp = await callAI(s, prompt);
            const aiTags = refineTags(parseAITags(resp, s.aiTagSeparator), { cap: AI_TAG_CAP, separator: s.aiTagSeparator });
            await setAICache(url, "tags", aiTags, s.aiCacheDuration, aiCacheSource, startAuth.account, s);
            return { type: "tags", result: aiTags };
          } catch (e) {
            if (e?.code === "host_permission") aiHostPermissionMissing = true;
            console.warn(`${notifyCategory} AI tags failed:`, e.message);
            return null;
          }
        })()
      );
    }
    if (s._aiSummary && summaryResolved === null) {
      aiPromises.push(
        (async () => {
          try {
            const cached = await getAICache(url, "summary", s.aiCacheDuration, aiCacheSource, startAuth.account, s);
            if (cached) return { type: "summary", result: cached };
            const prompt = buildSummaryPrompt(s, title, url, pageInfo.pageText, notes);
            const summary = await callAI(s, prompt);
            await setAICache(url, "summary", summary, s.aiCacheDuration, aiCacheSource, startAuth.account, s);
            return { type: "summary", result: summary };
          } catch (e) {
            if (e?.code === "host_permission") aiHostPermissionMissing = true;
            console.warn(`${notifyCategory} AI summary failed:`, e.message);
            return null;
          }
        })()
      );
    }
  }

  // Apply combined-path results, then whatever the single calls produced.
  if (aiTagsResolved) tags = [...tags, ...aiTagsResolved];
  if (summaryResolved) {
    const wrapped = `[AI Summary]\n<blockquote>${escapeForExtended(summaryResolved)}</blockquote>`;
    notes = notes ? notes + "\n\n" + wrapped : wrapped;
  }
  const aiResults = await Promise.all(aiPromises);
  for (const r of aiResults) {
    if (!r) continue;
    if (r.type === "tags") tags = [...tags, ...r.result];
    if (r.type === "summary") {
      const wrapped = `[AI Summary]\n<blockquote>${escapeForExtended(r.result)}</blockquote>`;
      notes = notes ? notes + "\n\n" + wrapped : wrapped;
    }
  }

  const result = await submitSaveIntent({
    mode,
    url,
    title,
    notes,
    tags: tags.join(" "),
    private: isPrivate,
    toread: toread === true ? true : undefined,
    archive: undefined,
  }, { expectedAccount: startAuth.account });

  if (result.status === "saved") {
    const undoInfo = result.mutation === "created" && result.account
      ? { url, account: result.account }
      : undefined;
    showNotification(
      notifyId + "-saved",
      notifyTitle,
      t(aiHostPermissionMissing ? "bgTitleSavedAiSkipped" : "bgTitleSaved", title.substring(0, 60)),
      notifyCategory,
      undoInfo
    );
    processOfflineQueue().catch(() => {});
    return result;
  }
  if (result.status === "queued") {
    showNotification(notifyId + "-queued", t("bgQueuedOffline"), t("bgTitleQueued", title.substring(0, 60)), notifyCategory);
    return result;
  }
  if (result.status === "skipped") {
    showNotification(notifyId + "-skipped", t("bgSkippedTitle"), t("bgSkippedExists"), notifyCategory);
    return result;
  }
  if (result.reason === "not_logged_in") {
    showNotification(notifyId + "-error", t("bgNotLoggedIn"), t("bgSetToken"), "error");
  } else if (result.reason === "too_long") {
    showNotification(
      notifyId + "-error",
      t("bgSaveFailed"),
      t("uriTooLong", result.detail || "?", String(POSTS_ADD_URI_BUDGET)),
      "error"
    );
  } else if (result.reason === "network" || result.reason === "lookup") {
    showNotification(notifyId + "-error", t("bgNetworkError"), result.detail || t("pinboardErrorOffline"), "error");
  } else if (result.reason === "account_changed") {
    showNotification(notifyId + "-error", t("bgNotLoggedIn"), t("pinboardErrorAuth"), "error");
  } else {
    showNotification(notifyId + "-error", t("bgSaveFailed"), result.detail || result.reason || "Unknown error", "error");
  }
  return result;
}

// Helper: resolve prefix-specific settings to internal keys
function resolvePrefixSettings(s, prefix) {
  return {
    _autoNotes: s[prefix + "AutoNotes"],
    _blockquote: s[prefix + "Blockquote"],
    _defaultTags: s[prefix + "DefaultTags"],
    _aiTags: s[prefix + "AiTags"],
    _aiSummary: s[prefix + "AiSummary"]
  };
}

// B4: write current tab data to session storage for popup mirror prefill (Phase 1)
async function _writeCurrentTabMirror(tabId, url, title) {
  if (!url || !url.startsWith("http")) {
    try { await chrome.storage.session.remove("_currentTab"); } catch (_) {}
    return;
  }
  const auth = await getCurrentPinboardAuth();
  const cached = pbpStatusCacheGet(url, auth);
  const posts = (cached && Date.now() - cached.timestamp < CACHE_TTL) ? (cached.posts || null) : null;
  try {
    await chrome.storage.session.set({
      _currentTab: { tabId, url, title: title || "", posts, account: auth.account, ts: Date.now() }
    });
    if (!pbpPinboardAuthIsCurrent(auth)) await chrome.storage.session.remove("_currentTab");
  } catch (_) {}
}

async function _getFocusedActiveTab(expectedTabId, expectedUrl) {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (tab?.id !== expectedTabId) return null;
  if (typeof expectedUrl === "string" && tab.url !== expectedUrl) return null;
  if (!tab.url || (!tab.url.startsWith("http://") && !tab.url.startsWith("https://"))) return null;
  return tab;
}

// tabId -> last URL a status check was dispatched for. Read only by the
// same-document arm of tabs.onUpdated, to tell a real in-page route change from a
// pure #fragment jump; cleared on tab close and on any auth change (fail open).
const _lastCheckedUrl = new Map();
function _urlWithoutFragment(url) {
  if (typeof url !== "string") return "";
  const hash = url.indexOf("#");
  return hash === -1 ? url : url.slice(0, hash);
}

function _scheduleCurrentTabRefresh(tabId, expectedUrl) {
  if (typeof expectedUrl === "string") _lastCheckedUrl.set(tabId, expectedUrl);
  _scheduleTabCheck(tabId, async () => {
    try {
      const tab = await _getFocusedActiveTab(tabId, expectedUrl);
      if (!tab) return;
      // onActivated/onFocusChanged can arrive without an expected URL; record what
      // the check actually ran against so the fragment gate below has a baseline.
      _lastCheckedUrl.set(tabId, tab.url);

      noteActivity();
      const bookmarked = await debouncedCheck(tab.url);

      // The tab may have navigated or lost focus while the API request was in flight.
      const currentTab = await _getFocusedActiveTab(tab.id, tab.url);
      if (!currentTab) return;
      if (typeof bookmarked === "boolean") {
        // checkBookmarked (via debouncedCheck) just wrote the cache entry; re-derive
        // the current auth to read it back atomically (same account/epoch).
        const auth = await getCurrentPinboardAuth();
        setIcon(currentTab.id, iconStateFor(pbpStatusCacheGet(currentTab.url, auth)));
      }
      await _writeCurrentTabMirror(currentTab.id, currentTab.url, currentTab.title);
    } catch (_) {
      // Tab closed/replaced between event and query — expected race, skip
    }
  }, 150);
}

// ---- 标签页激活/更新时刷新图标 (P3: debounced + deduped) ----
chrome.tabs.onActivated.addListener(({ tabId }) => {
  _scheduleCurrentTabRefresh(tabId);
});

// `changeInfo.url` is the same-document (history.pushState) signal: SPA sites
// (YouTube, Twitter, Zhihu) never re-run loading->complete for an in-page route
// change, and Chromium only clears the tab-scoped action icon on cross-document
// navigation — so without this arm the icon stays stuck on the previous page's
// state. Accept either signal; the 150ms per-tab debounce, the _pendingChecks
// dedup and the 5-minute status cache keep the extra events off the network.
// That same signal also fires for a bare #fragment jump (footnote, table of
// contents), and Pinboard treats `page#note` as a DIFFERENT url than `page`:
// re-checking it returns posts:[] and would flip a saved article's icon to "not
// saved" on every anchor click, burning one 3.1s rate-limit slot each time.
// Bookmark identity ignores the fragment, so a fragment-only move keeps the state
// the page already has. A cross-document navigation carries a status transition;
// a bare url change is the same-document (pushState/fragment) case.
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!(changeInfo.status === "complete" || changeInfo.url)) return;
  if (!tab.url || !tab.url.startsWith("http")) return;
  const sameDocument = !!changeInfo.url && changeInfo.status === undefined;
  if (sameDocument && _urlWithoutFragment(tab.url) === _urlWithoutFragment(_lastCheckedUrl.get(tabId))) return;
  // Chromium clears the tab-scoped action icon on a cross-document navigation
  // (the platform behaviour this listener already relies on), so the dedup entry
  // stops describing what the toolbar shows. Recomputing the SAME state after a
  // reload, or on a saved -> saved hop, would then short-circuit setIcon and
  // leave the default pin up. Same rule invalidatePinboardAuthState follows:
  // when the truth behind the dedup moves, the dedup entry goes first.
  if (!sameDocument) _lastIconState.delete(tabId);
  _scheduleCurrentTabRefresh(tabId, tab.url);
});

chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;
  chrome.tabs.query({ active: true, windowId }).then(([tab]) => {
    if (tab?.id) _scheduleCurrentTabRefresh(tab.id, tab.url);
  }).catch(() => {});
});

// P2.7: Clean up per-tab timer when tab closes to prevent Map leak on long sessions.
chrome.tabs.onRemoved.addListener((tabId) => {
  const timer = _checkDebounceTimers.get(tabId);
  if (timer) { clearTimeout(timer); _checkDebounceTimers.delete(tabId); }
  _lastIconState.delete(tabId); // prevent Map leak over long sessions
  _lastCheckedUrl.delete(tabId);
  pbpImgFixSweepRules(tabId);
});

// ---- Image-fix DNR session rules: SW is the sole owner (hotlink round) -----
// md-preview pages ask the SW to install a tab-scoped Referer rule around each
// image re-fetch (md-embed.js pbpImgFixWithReferer). The SW owns this end to
// end for two reasons Codex's reviews made concrete:
//   - Rule ids are EXTENSION-GLOBAL. A page-local counter had every preview tab
//     starting at the same id, so a second tab's remove+add voided the first
//     tab's live rule (confirm-review HIGH-1). Only a single serialized context
//     can hand out ids that are unique across tabs; allocation below runs on a
//     promise chain so two concurrent installs can never pick the same id.
//   - A session rule outlives the page that wanted it. `finally` in the page
//     cannot be the last word (tab closed/navigated/discarded mid-fetch), or a
//     stranded rule would keep rewriting Referer for whatever loads in that tab
//     id NEXT (acceptance HIGH-2). The sweeps below are the guarantee.
// The rule's tab scope comes from sender.tab -- never from the message -- so a
// page cannot request a rule aimed at another tab.
const PBP_IMGFIX_RULE_MIN = 786001;
const PBP_IMGFIX_RULE_MAX = 786999;

// ONE serialized domain for EVERY rule mutation -- install, remove, sweep.
// Serializing only allocation was not enough (confirm-review 2 BLOCKER/HIGH):
//   - install racing a leave-sweep: the sweep read an empty rule set, finished,
//     and THEN the install landed -- stranding a Referer rule on a tab that had
//     already navigated to a normal website, which is exactly the traffic
//     privacy.md promises never to touch;
//   - remove racing anything: its read-owner-then-delete pair was not atomic,
//     so a delayed remove could delete an id that had since been reallocated to
//     a different preview tab.
// Everything below therefore runs inside _imgFixQueue, and install additionally
// re-validates INSIDE the critical section that the tab is still showing the
// preview document it claimed -- a navigation that slipped in before the install
// ran means the rule must never be created at all.
let _imgFixQueue = Promise.resolve();
const _imgFixTabDoc = new Map();    // tabId -> owner preview URL without its #fragment
const _imgFixRuleOwner = new Map(); // ruleId -> owner preview URL (ABA guard on remove)

function _imgFixSerialize(fn) {
  const run = _imgFixQueue.then(fn);
  _imgFixQueue = run.then(() => {}, () => {}); // a failure must not poison the queue
  return run;
}

function _imgFixStripHash(u) {
  const s = String(u || "");
  const i = s.indexOf("#");
  return i === -1 ? s : s.slice(0, i);
}

function _imgFixIsPreviewUrl(u) {
  return typeof u === "string" && u.startsWith(chrome.runtime.getURL("md-preview.html"));
}

function _imgFixRuleIdsOf(rules, pred) {
  return rules
    .filter((r) => r.id >= PBP_IMGFIX_RULE_MIN && r.id <= PBP_IMGFIX_RULE_MAX)
    .filter(pred)
    .map((r) => r.id);
}

function _imgFixRuleTabs(r) {
  return (r.condition && Array.isArray(r.condition.tabIds)) ? r.condition.tabIds : [];
}

// Install: re-validate the tab AND the exact document, pick the lowest free id,
// add the rule -- all in one critical section, so no sweep can interleave.
// initiatorDomains is the STRUCTURAL guarantee (confirm-review 3 HIGH):
// requestDomains + xmlhttprequest + tabIds alone would also match a normal
// website's XHR to the same CDN if that site somehow occupied this tab id
// between the check and the rule taking effect. Pinning the initiator to this
// extension's own id makes a page-originated request unable to match the rule
// at all -- verified live: initiator=extension id -> rule applies (Referer set,
// 200); initiator=any site -> rule does not apply (403, referrerless). The
// navigation sweeps below remain as the resource-cleanup backstop.
function pbpImgFixInstallRule({ domains, origin, tabId, docUrl }) {
  return _imgFixSerialize(async () => {
    // Live re-check (NOT the sender snapshot): if the tab navigated while this
    // request queued, the asking page is gone and the rule must never exist.
    // _cbTabsGet resolves null (lastError consumed) when the tab is gone —
    // which lands in the same throw as "not a preview".
    const live = await _cbTabsGet(tabId);
    if (!live || !_imgFixIsPreviewUrl(live.url)) throw new Error("tab_not_preview");
    const owner = _imgFixStripHash(docUrl || live.url);
    // Same PREVIEW page is not enough -- it must be the same preview DOCUMENT
    // (?k=A vs ?k=B), and a navigation already committed to somewhere else
    // (pendingUrl) disqualifies it too.
    if (_imgFixStripHash(live.url) !== owner) throw new Error("tab_not_preview");
    if (live.pendingUrl && _imgFixStripHash(live.pendingUrl) !== owner) throw new Error("tab_navigating");
    const rules = await chrome.declarativeNetRequest.getSessionRules();
    const used = new Set(rules.map((r) => r.id));
    let id = 0;
    for (let i = PBP_IMGFIX_RULE_MIN; i <= PBP_IMGFIX_RULE_MAX; i++) {
      if (!used.has(i)) { id = i; break; }
    }
    if (!id) throw new Error("imgfix_rule_pool_exhausted");
    await chrome.declarativeNetRequest.updateSessionRules({
      addRules: [{
        id,
        priority: 1,
        condition: {
          requestDomains: domains,
          resourceTypes: ["xmlhttprequest"],
          tabIds: [tabId],
          initiatorDomains: [chrome.runtime.id], // only THIS extension's own requests
        },
        action: {
          type: "modifyHeaders",
          requestHeaders: [{ header: "referer", operation: "set", value: origin + "/" }],
        },
      }],
    });
    // Which preview DOCUMENT owns this tab's rules (a later same-document hash
    // change must not sweep) and which document owns each rule id (an ABA
    // guard: a late remove from a dying page must not delete a rule the NEXT
    // document in the same tab was given the recycled id for).
    _imgFixTabDoc.set(tabId, owner);
    _imgFixRuleOwner.set(id, owner);
    return id;
  });
}

// Owner-checked AND atomic: read + delete share one critical section. Ownership
// is (tab, document) -- the tab alone allowed the ABA above (confirm-review 3).
function pbpImgFixRemoveRules(ruleIds, tabId, docUrl) {
  return _imgFixSerialize(async () => {
    const doc = _imgFixStripHash(docUrl || "");
    const rules = await chrome.declarativeNetRequest.getSessionRules();
    const mine = _imgFixRuleIdsOf(rules, (r) => {
      if (!ruleIds.includes(r.id) || !_imgFixRuleTabs(r).includes(tabId)) return false;
      const owner = _imgFixRuleOwner.get(r.id);
      return !owner || !doc || owner === doc; // unknown owner (SW restarted) -> fall back to the tab check
    });
    if (mine.length) {
      await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: mine });
      mine.forEach((id) => _imgFixRuleOwner.delete(id));
    }
  });
}

// tabId given -> that tab's rules. No tabId (SW start) -> every rule whose tab
// is gone OR is no longer showing a preview page: a blanket range wipe would
// kill rules a live preview installed while the SW slept, but only checking
// "tab exists" would leave a rule stranded on a tab that has since navigated to
// a normal site (confirm-review 2).
// True once a FULL (no-tabId) sweep has completed successfully in this SW
// generation. The navigation listener's no-owner fast path is only sound when
// the startup sweep really ran: if its getSessionRules/tabs.query threw (the
// catch below swallows it), the owner map is empty and skipping would strand
// leftover rules with no leave-the-page cleanup (Codex review P2).
let _imgFixStartupSweepOk = false;
function pbpImgFixSweepRules(tabId) {
  if (!chrome.declarativeNetRequest || !chrome.declarativeNetRequest.getSessionRules) return Promise.resolve();
  return _imgFixSerialize(async () => {
    const rules = await chrome.declarativeNetRequest.getSessionRules();
    let ids;
    if (tabId === undefined) {
      const tabs = await chrome.tabs.query({});
      const previewTabs = new Map(tabs.filter((t) => _imgFixIsPreviewUrl(t.url)).map((t) => [t.id, _imgFixStripHash(t.url)]));
      // Re-seed the document-owner map from the live tabs. Without this, the
      // first hash change after an SW restart would find an unknown owner and
      // sweep a fix that is running perfectly fine (confirm-review 3).
      previewTabs.forEach((doc, id) => { if (!_imgFixTabDoc.has(id)) _imgFixTabDoc.set(id, doc); });
      ids = _imgFixRuleIdsOf(rules, (r) => {
        const t = _imgFixRuleTabs(r);
        return t.length > 0 && t.every((id) => !previewTabs.has(id));
      });
    } else {
      ids = _imgFixRuleIdsOf(rules, (r) => _imgFixRuleTabs(r).includes(tabId));
      _imgFixTabDoc.delete(tabId);
    }
    if (ids.length) {
      await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: ids });
      ids.forEach((id) => _imgFixRuleOwner.delete(id));
    }
    if (tabId === undefined) _imgFixStartupSweepOk = true;
  }).catch(() => { /* best-effort: a sweep failure must never break tab handling */ });
}

// A preview tab navigating AWAY is the leak: the tab id stays the same, so a
// stranded rule would otherwise linger there. Same-DOCUMENT changes must NOT
// sweep (every TOC click is a hash change) -- compared against the owning
// document recorded at install time, so a real navigation to a different
// preview document (?k=A -> ?k=B) still sweeps. Unknown owner sweeps: losing a
// rule only makes a fix fail, keeping a wrong one is the problem. A same-URL
// RELOAD never fires changeInfo.url at all -- that case is handled by the
// preview page sweeping its own tab on load (imgFixResetTab below).
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (!changeInfo.url) return;
  const owner = _imgFixTabDoc.get(tabId);
  // No owner = this tab holds no rule in this SW generation, so there is nothing
  // to sweep: the startup sweep below (queued at module evaluation, ahead of any
  // listener work on the same serial queue) already dropped rules for tabs that
  // are gone or no longer previews AND re-seeded owners for live previews.
  // Without this early return, EVERY navigation on EVERY ordinary tab (including
  // pure #anchor jumps and SPA pushState storms) paid a getSessionRules() IPC —
  // and each chrome.* call resets the SW's 30s idle timer, silently defeating
  // the "sleep after the keepalive window lapses" design. Guarded on the
  // startup sweep having actually succeeded: if it threw, the owner map is
  // untrustworthy and we fall back to sweep-on-every-navigation (correctness
  // over the optimization).
  if (!owner && _imgFixStartupSweepOk) return;
  if (_imgFixIsPreviewUrl(changeInfo.url) && _imgFixStripHash(changeInfo.url) === owner) return;
  pbpImgFixSweepRules(tabId);
});

pbpImgFixSweepRules(); // SW start: drop rules whose tab is gone or no longer a preview; re-seed owners

// Dynamic content-script hygiene: md-video.js registers the Bili player
// bridge with persistAcrossSessions:true, so revoking the origin in
// chrome://extensions left the REGISTRATION behind — if that origin were ever
// granted again (user widens site access, a future broader grant), the script
// would resurrect without fresh consent. Drop the registration the moment its
// origin grant goes away. Top-level synchronous registration per MV3 rules;
// the id string mirrors md-video.js's BILI_BRIDGE_ID (isolated script
// contexts, deliberate duplication).
chrome.permissions.onRemoved.addListener((perms) => {
  const origins = (perms && perms.origins) || [];
  if (origins.some((o) => typeof o === "string" && o.includes("player.bilibili.com"))) {
    chrome.scripting.unregisterContentScripts({ ids: ["pbp-bili-player-bridge"] }).catch(() => {});
  }
});

// ---- Activity-windowed keepalive ------------------------------------------
// Keep the SW (and thus the extension renderer process) warm for a short window
// after the user's last tab/popup activity, so clicking the toolbar icon during
// active browsing opens the popup instantly instead of paying a ~2s cold start.
// After the window lapses with no activity, ping stops and the SW sleeps normally
// (no 24/7 drain). It is the chrome.* API CALL — not setInterval — that resets the
// 30s idle timer (Chrome 110+). If a future Chrome stops honoring this, the SW just
// sleeps = current behavior (graceful, no error).
const KEEPALIVE_WINDOW_MS = 10 * 60 * 1000; // warm for ~10 min after last activity
const KEEPALIVE_PING_MS = 15 * 1000;        // < 30s idle timeout; 2x margin vs timer jitter
let _lastActivityTs = 0;
let _lastActivitySessionWrite = 0;
let _keepAliveTimer = null;

function ensureKeepAlive() {
  if (_keepAliveTimer) return; // already pinging
  if (Date.now() - _lastActivityTs >= KEEPALIVE_WINDOW_MS) return; // window lapsed
  _keepAliveTimer = setInterval(() => {
    if (Date.now() - _lastActivityTs >= KEEPALIVE_WINDOW_MS) {
      // Return BEFORE any chrome.* call, so this tick does NOT reset the idle
      // timer → the SW can go idle and terminate normally. Do NOT add a ping
      // above this guard, or the SW will never sleep.
      clearInterval(_keepAliveTimer);
      _keepAliveTimer = null;
      return;
    }
    // The API call (not setInterval itself) resets the SW idle timer; empty cb is fine in MV3.
    try { chrome.runtime.getPlatformInfo(() => {}); } catch (_) {}
  }, KEEPALIVE_PING_MS);
}

function noteActivity() {
  _lastActivityTs = Date.now();
  // Mirror to session storage (throttled) so a SW restart within the window can
  // resume keepalive even if the restarting event isn't itself a tab event.
  if (_lastActivityTs - _lastActivitySessionWrite > 30000) {
    _lastActivitySessionWrite = _lastActivityTs;
    try { chrome.storage.session.set({ _lastActivityTs }); } catch (_) {}
  }
  ensureKeepAlive();
  // Activity (re)opens the window — make sure the conditional keepalive alarm
  // exists again as the mid-window revival backstop (flag-throttled, so the
  // high-frequency tab-event path pays no alarms.get IPC).
  _ensureKeepaliveAlarmOnce();
}

// On (cold) SW startup, restore last activity and resume keepalive if still in window.
// Use Math.max(): a tab/popup event may cold-start the SW and run noteActivity()
// (setting a fresh in-memory ts) BEFORE this async restore resolves. Without max(),
// the stale session value (0 on a fresh session) would clobber the fresh ts, and the
// next ping tick would see ">= window" and kill the just-started window.
chrome.storage.session.get({ _lastActivityTs: 0 }).then(({ _lastActivityTs: ts }) => {
  _lastActivityTs = Math.max(_lastActivityTs, ts || 0);
  ensureKeepAlive();
}).catch(() => {});
// ---------------------------------------------------------------------------

// Keep service worker alive + periodic tasks. Same-name alarms.create() CANCELS
// and REPLACES the existing alarm, resetting its clock — and this top level runs
// on every SW wake. The keepalive alarm's own 4-min wake therefore kept resetting
// storage-warm's 5-min clock, so storage-warm NEVER fired. Create only when
// absent (same pattern as syncPrewarmTagsAlarm below).
function ensurePeriodicAlarm(name, periodInMinutes) {
  chrome.alarms.get(name).then((existing) => {
    if (!existing) chrome.alarms.create(name, { periodInMinutes });
  }).catch(() => {});
}

// The keepalive alarm is CONDITIONAL, not 24/7. It exists while any of these
// holds: (a) the activity window is open — the alarm is the revival backstop
// for the 15s ping if Chrome reclaims the SW mid-window (memory pressure);
// (b) the offline queue is non-empty — the alarm drives replay; (c) a batch
// is running — the alarm drives the interrupted-batch sweep. When all three
// are false the alarm's own handler clears it, so an idle browser stops
// waking this worker every 4 minutes. Ensure points: SW top level (self-heal
// on any wake), noteActivity, offline-queue writes, batch progress writes —
// a missed wire is repaired on the next SW wake of any kind.
let _keepaliveAlarmEnsured = false;
function _ensureKeepaliveAlarmOnce() {
  if (_keepaliveAlarmEnsured) return;
  _keepaliveAlarmEnsured = true;
  ensurePeriodicAlarm("keepalive", 4);
}
async function _keepaliveAlarmStillNeeded() {
  const [{ offlineQueue = [], batch_progress }, sess] = await Promise.all([
    chrome.storage.local.get(["offlineQueue", "batch_progress"]),
    chrome.storage.session.get({ _lastActivityTs: 0 }).catch(() => ({ _lastActivityTs: 0 })),
  ]);
  const lastTs = Math.max(_lastActivityTs, Number(sess._lastActivityTs) || 0);
  return (Date.now() - lastTs) < KEEPALIVE_WINDOW_MS ||
    (Array.isArray(offlineQueue) && offlineQueue.length > 0) ||
    !!(batch_progress && batch_progress.running);
}
async function _syncKeepaliveAlarm() {
  try {
    if (await _keepaliveAlarmStillNeeded()) _ensureKeepaliveAlarmOnce();
  } catch (_) {}
}
async function _maybeReleaseKeepaliveAlarm() {
  try {
    if (await _keepaliveAlarmStillNeeded()) return;
    // Drop the ensure flag BEFORE clearing, then re-check after: an event
    // landing between the needed-check and clear() (queue write, activity)
    // may have seen the old alarm still present and short-circuited its
    // ensure — without the re-check, the clear would strand that work until
    // the next SW wake (Codex review P2). The re-create path goes through
    // ensurePeriodicAlarm's get-then-create, so a lost race merely leaves
    // the alarm alive one extra cycle — the safe direction.
    _keepaliveAlarmEnsured = false;
    await chrome.alarms.clear("keepalive");
    if (await _keepaliveAlarmStillNeeded()) _ensureKeepaliveAlarmOnce();
  } catch (_) {}
}
// Badge refresh is its own longer-period alarm: it is a NETWORK poll
// (posts/all?toread=yes) and was riding the 4-min keepalive — 360 requests a
// day for badge-on users. 15 min is plenty for an unread count; direct badge
// updates on save/queue events still happen inline.
async function _syncBadgeAlarm() {
  try {
    const s = await loadSettings();
    if (s.optShowBadge) {
      const existing = await chrome.alarms.get("badge-refresh");
      if (!existing) chrome.alarms.create("badge-refresh", { periodInMinutes: 15 });
    } else {
      await chrome.alarms.clear("badge-refresh");
    }
  } catch (_) {}
}
_syncKeepaliveAlarm();
_syncBadgeAlarm();
// Periodically re-prime SETTINGS_DEFAULTS so chrome.storage doesn't go cold between
// uses (Chrome evicts storage backend after inactivity, causing slow first-open).
ensurePeriodicAlarm("storage-warm", 5);

sweepAICacheMigrationBackup().catch(() => {});
sweepSuggestCache().catch(() => {});

// One-time migration: bgSaveNoClobber (boolean) -> bgSaveMode (tri-state).
// Raw array-key read (no defaults) so a genuinely-absent bgSaveMode is detectable.
async function migrateBgSaveMode() {
  try {
    const store = await getSettingsStorage();
    const raw = await store.get(["bgSaveMode", "bgSaveNoClobber"]);
    if (raw.bgSaveMode !== undefined) return; // already migrated or user-set
    const mode = (raw.bgSaveNoClobber === false) ? "overwrite" : "merge";
    await store.set({ bgSaveMode: mode });
  } catch (e) {
    // MV3 rule: never swallow a platform API failure silently. No secrets here —
    // bgSaveMode/bgSaveNoClobber are plain preference keys.
    console.warn("bgSaveMode migration failed:", e?.name, e?.message);
  }
}
// Keep the migration's promise: primeSettings callers await it first. Both are
// read-then-write over bgSaveMode, and onInstalled fires primeSettings almost
// immediately on update — if both reads completed before either write, prime's
// stale snapshot re-inserted the default "merge", permanently clobbering a legacy
// bgSaveNoClobber=false user's "overwrite" preference.
const _bgSaveModeMigration = migrateBgSaveMode();

// One-time cleanup: GitHub Models retired its inference API on 2026-07-30
// (models.github.ai now answers HTTP 410), so the provider entry is gone from
// the UI and registry. Reset any user still pointing at it to the default
// provider and drop the stored PAT copy + model key. Both storage areas are
// swept because credential routing (optSyncEnabled/syncApiKeys) may have left
// copies in either; reads are quota-free and writes only fire while legacy
// keys actually exist, so re-running every SW start stays cheap and idempotent.
async function migrateGithubModelsRetirement() {
  for (const area of [chrome.storage.local, chrome.storage.sync]) {
    try {
      const raw = await area.get(["aiProvider", "githubModelsApiKey", "githubModelsModel"]);
      const dead = ["githubModelsApiKey", "githubModelsModel"].filter((k) => raw[k] !== undefined);
      if (dead.length) await area.remove(dead);
      if (raw.aiProvider === "githubmodels") await area.set({ aiProvider: "gemini" });
    } catch (e) {
      // MV3 rule: leave a trace before folding platform failures away. No
      // secrets here — key names only, values never logged.
      console.warn("githubmodels retirement cleanup failed:", e?.name, e?.message);
    }
  }
}
migrateGithubModelsRetirement();

// One-shot legacy scrub (roadmap #24; retires shared.js's "two-release
// cleanup" TODO): keys-off migration used to strip only the token field,
// leaving a legacy plaintext webhook capability URL in chrome.storage.sync
// indefinitely after the user turned credential sync off. The local-fill
// logic has been shipping since v2.99 (2026-07-28) — far past the
// two-release window it was waiting for — so every active device holds its
// own local copy. Flag-gated one-shot; a failure retries on the next SW
// evaluation. Retire by 2026-12-31 (CLAUDE.md 临时事项).
async function pbpScrubLegacySyncWebhookUrls() {
  try {
    const { _webhookSyncScrubDone } = await chrome.storage.local.get("_webhookSyncScrubDone");
    if (_webhookSyncScrubDone) return;
    await pbpWithSecretStorageLock(async () => {
      // Re-read INSIDE the lock. keys-on means the sync copy is LIVE data
      // owned by credential sync — nothing to scrub (a later keys-off runs
      // pbpDisableSyncApiKeys' full strip anyway), just mark done.
      const flags = await pbpReadSecretSyncStateUnlocked({ includeGlobalWhenSyncOff: true });
      if (!flags.syncApiKeys) {
        const { exportTargets } = await chrome.storage.sync.get("exportTargets");
        if (pbpExportTargetsHaveSecrets(exportTargets)) {
          // Rescue before scrub: fill any secret slot local does not hold, so
          // this scrub can never destroy the account's last copy.
          const { exportTargets: localTargets } = await chrome.storage.local.get("exportTargets");
          const filled = pbpMergeExportTargetSecrets(localTargets, exportTargets, { fillWins: false });
          await chrome.storage.local.set({ exportTargets: filled });
          await chrome.storage.sync.set({ exportTargets: pbpStripExportTargetTokens(exportTargets) });
          console.info("[secrets-migration] legacy sync webhook capability URLs scrubbed");
        }
      }
      await chrome.storage.local.set({ _webhookSyncScrubDone: true });
    });
  } catch (e) {
    console.warn("legacy webhook sync scrub failed:", e?.name, e?.message);
  }
}
pbpScrubLegacySyncWebhookUrls();

// One-shot claim migration (roadmap #19, approved 2026-08-29): pre-existing
// highlight items carry no owner field — claim them for the CURRENT Pinboard
// account so the new per-account visibility rule has a defined baseline
// (mirrors the offline queue's legacy-token rewrite). Waits until an account
// exists: logged-out leaves items unclaimed (= visible to all) and re-checks
// cheaply on later SW evaluations. Each record's read-modify-write holds the
// same per-record Web Lock the reader's commit path uses ("pbp-hl:<key>"), so
// a concurrent highlight save cannot be clobbered. Retire by 2026-12-31
// (CLAUDE.md 临时事项, flag _hlOwnerClaimDone).
async function pbpClaimLegacyHighlightOwners() {
  try {
    const { _hlOwnerClaimDone } = await chrome.storage.local.get("_hlOwnerClaimDone");
    if (_hlOwnerClaimDone) return;
    const scope = await pbpVocabCurrentOwner();
    if (!scope || scope === "ownerless") return; // no account yet — retry on a later wake
    let keys;
    if (typeof chrome.storage.local.getKeys === "function") {
      keys = (await chrome.storage.local.getKeys()).filter((k) => k.startsWith("pbp_hl_") && k !== "pbp_hl_last_color");
    } else {
      keys = Object.keys(await chrome.storage.local.get(null)).filter((k) => k.startsWith("pbp_hl_") && k !== "pbp_hl_last_color");
    }
    let claimed = 0;
    let aborted = false;
    for (const key of keys) {
      await navigator.locks.request("pbp-hl:" + key, async () => {
        // Per-write owner re-validation (Codex review; CLAUDE.md: async
        // write-backs re-check the owner EVERY time): an account switch
        // mid-walk must not keep claiming records for the departed account.
        // Abort without the done flag — the next wake retries cleanly.
        if ((await pbpVocabCurrentOwner()) !== scope) { aborted = true; return; }
        const d = await chrome.storage.local.get(key);
        const rec = d && d[key];
        if (!rec || typeof rec !== "object" || Array.isArray(rec) || !Array.isArray(rec.items)) return;
        let changed = false;
        const items = rec.items.map((it) => {
          if (it && typeof it === "object" && !Array.isArray(it) && typeof it.owner !== "string") {
            changed = true;
            return { ...it, owner: scope };
          }
          return it;
        });
        if (changed) { await chrome.storage.local.set({ [key]: { ...rec, items } }); claimed++; }
      });
      if (aborted) break;
    }
    if (aborted) {
      console.warn("[hl-owner] claim aborted: account changed mid-walk; will retry");
      return;
    }
    // Final gate before the flag for the same reason.
    if ((await pbpVocabCurrentOwner()) !== scope) return;
    await chrome.storage.local.set({ _hlOwnerClaimDone: true });
    if (claimed) console.info(`[hl-owner] claimed legacy highlight items on ${claimed} page record(s)`);
  } catch (e) {
    console.warn("highlight owner claim failed:", e?.name, e?.message);
  }
}
pbpClaimLegacyHighlightOwners();

// Conditional site-theme payload (roadmap #37, dynamic-registration variant):
// pinboard-themes.js is a 704KB generated constant that every pinboard.in
// navigation used to parse at document_start — to read ONE of its 13 css
// strings, and only when a preset is set at all (themePresetKey defaults to
// ""). It is now statically absent from the manifest and registered here only
// while a preset is active, so the DEFAULT configuration pays nothing.
// pinboard-style.js already typeof-guards PINBOARD_THEMES, and its consumers
// run in async storage callbacks, so relative execution order between the
// static and dynamic document_start scripts never matters. The full
// css-as-files split was deliberately NOT done: it would re-anchor five
// theme-factory gates (apply-tokens/diff-all/cascade-lint/handedit-audit/
// override-drift all parse pinboard-themes.js) for marginal further gain.
const PBP_SITE_THEME_SCRIPT_ID = "pbp-site-theme-css";
// Serialized (Codex final review): two overlapping syncs could commit the
// OLDER settings' registration state (classic check-then-act). The tail chain
// makes each run re-read settings after its predecessor finished, so the last
// completed run always reflects the latest value.
let _siteThemeSyncTail = Promise.resolve();
function pbpSyncSiteThemeScript() {
  const run = _siteThemeSyncTail.then(() => _pbpSyncSiteThemeScriptOnce());
  _siteThemeSyncTail = run.catch(() => {});
  return run;
}
async function _pbpSyncSiteThemeScriptOnce() {
  try {
    if (!chrome.scripting || !chrome.scripting.registerContentScripts) return;
    const s = await loadSettings();
    const wantTheme = !!(s && s.themePresetKey);
    const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [PBP_SITE_THEME_SCRIPT_ID] }).catch(() => []);
    const has = !!(existing && existing.length);
    if (wantTheme && !has) {
      await chrome.scripting.registerContentScripts([{
        id: PBP_SITE_THEME_SCRIPT_ID,
        matches: ["https://pinboard.in/*", "https://*.pinboard.in/*"],
        js: ["pinboard-themes.js"],
        runAt: "document_start",
        world: "ISOLATED",
        persistAcrossSessions: true,
      }]);
    } else if (!wantTheme && has) {
      await chrome.scripting.unregisterContentScripts({ ids: [PBP_SITE_THEME_SCRIPT_ID] });
    }
  } catch (e) {
    console.warn("site-theme script sync failed:", e?.name, e?.message);
  }
}
pbpSyncSiteThemeScript();

// Trusted-only storage (roadmap #36): content scripts lose direct read access
// to local/sync — the same areas that hold the Pinboard token and every BYO
// API key. The pinboard.in scripts now fetch their handful of non-secret
// prefs through the get_site_prefs message (allowlisted in the router gate),
// so a content-script compromise no longer implies a credential read.
// session is TRUSTED_CONTEXTS by default already. Top-level, every SW eval —
// setAccessLevel is per-session state, so it must be re-asserted on wake.
const PBP_STORAGE_ACCESS_RETRY_ALARM = "storage-access-retry";
// Retry budget for that alarm. The count lives in storage.session, not in a
// module variable: every retry wakes a FRESH worker generation, so an in-memory
// counter restarts at zero each time and a permanently failing platform call
// (the API missing on this Chrome build, an enterprise policy refusal) re-arms
// the one-shot alarm every minute for as long as the browser runs — waking the
// worker and re-running the whole boot sequence with it. Session scope is the
// right lifetime: a browser restart may well be a new Chrome build, so the
// budget starts over then. Giving up is an acceptable end state — the
// pinboard.in content scripts read their prefs through get_site_prefs and no
// longer touch storage directly, so trusted-only is defense in depth here.
const PBP_STORAGE_ACCESS_RETRY_KEY = "_storageAccessRetries";
const PBP_STORAGE_ACCESS_MAX_RETRIES = 5;

async function pbpStorageAccessRetryCount() {
  try {
    const stored = await chrome.storage.session.get({ [PBP_STORAGE_ACCESS_RETRY_KEY]: 0 });
    return Number(stored?.[PBP_STORAGE_ACCESS_RETRY_KEY]) || 0;
  } catch (e) {
    // Unknown count: fail toward retrying (a session-storage failure is itself
    // the transient kind), but leave the trace MV3 requires.
    console.warn("[storage-access] retry counter read failed:", e?.name, e?.message);
    return 0;
  }
}

async function pbpRestrictStorageAccess() {
  let failed = false;
  for (const name of ["local", "sync"]) {
    try {
      await chrome.storage[name].setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
    } catch (e) {
      failed = true;
      // Name/message only: storage errors carry no setting values or secrets.
      console.warn(`[storage-access] ${name} trusted-only failed:`, e?.name, e?.message);
    }
  }
  if (failed) {
    const attempt = await pbpStorageAccessRetryCount();
    if (attempt >= PBP_STORAGE_ACCESS_MAX_RETRIES) {
      console.warn(`[storage-access] trusted-only still unavailable after ${attempt} retries; not rescheduling`);
      return false;
    }
    try { await chrome.storage.session.set({ [PBP_STORAGE_ACCESS_RETRY_KEY]: attempt + 1 }); }
    catch (e) { console.warn("[storage-access] retry counter write failed:", e?.name, e?.message); }
    try {
      // One-shot and same-name: repeated failures replace rather than stack.
      // Exponential backoff (1, 2, 4, 8, 16 minutes) because a failure that
      // outlives the first minute is usually the permanent kind.
      await chrome.alarms.create(PBP_STORAGE_ACCESS_RETRY_ALARM, {
        delayInMinutes: Math.min(30, 2 ** attempt),
      });
    } catch (e) {
      console.warn("[storage-access] retry scheduling failed:", e?.name, e?.message);
    }
    return false;
  }
  try { await chrome.alarms.clear(PBP_STORAGE_ACCESS_RETRY_ALARM); }
  catch (e) { console.warn("[storage-access] retry cleanup failed:", e?.name, e?.message); }
  try {
    // Read-then-remove: success is the every-wake path, so it must not write.
    if (await pbpStorageAccessRetryCount() > 0) {
      await chrome.storage.session.remove(PBP_STORAGE_ACCESS_RETRY_KEY);
    }
  } catch (e) { console.warn("[storage-access] retry counter cleanup failed:", e?.name, e?.message); }
  return true;
}
// Re-assert trusted-only storage on every SW generation. A transient platform
// failure keeps at most one same-name one-shot retry scheduled; neither path
// keeps the worker awake or stacks alarms.
pbpRestrictStorageAccess().catch((e) => {
  console.warn("[storage-access] setup failed:", e?.name, e?.message);
});

// Security-first permission migration. Older Batch versions could leave the
// optional all-sites grant active. Removing it also clears matching exact
// optional grants in Chrome, so configurations stay untouched and each feature
// restores only its current origin on the next explicit action. A click racing
// this one-time cleanup may need one retry; every execution path rechecks access
// before network or cross-tab work, so the race fails closed.
const PBP_LEGACY_WILDCARD_CLEANUP_KEY = "_legacyWildcardCleanupV1";
async function pbpMigrateLegacyWildcardPermission() {
  const stored = await chrome.storage.local.get(PBP_LEGACY_WILDCARD_CLEANUP_KEY);
  if (stored[PBP_LEGACY_WILDCARD_CLEANUP_KEY] === true) return;
  const wildcard = "*://*/*";
  let active = await chrome.permissions.contains({ origins: [wildcard] });
  if (active) {
    await chrome.permissions.remove({ origins: [wildcard] });
    active = await chrome.permissions.contains({ origins: [wildcard] });
  }
  if (!active) {
    await chrome.storage.local.set({ [PBP_LEGACY_WILDCARD_CLEANUP_KEY]: true });
  }
}
pbpMigrateLegacyWildcardPermission().catch(() => {});

// Credential-routing maintenance (batch (4)): idempotent, best-effort,
// fire-and-forget at boot. It mirrors the last keys-on cloud snapshot locally
// and, while keys are off, migrates/scrubs any stale cloud secret. The existing
// storage-warm alarm retries either direction within 5 minutes.
pbpMigrateSecretsToLocal().catch(() => {});

const PBP_VOCAB_DRIVE_CONNECTED_KEY = "vocabDriveConnected";
const PBP_GOOGLE_API_ORIGIN = "https://www.googleapis.com/*";
const PBP_VOCAB_DRIVE_CAPABLE =
  pbpVocabDriveOAuthActive(chrome.runtime.getManifest());
const queueVocabSync = pbpCreateRecoveringTail();
const vocabDriveClient = PBP_VOCAB_DRIVE_CAPABLE
  ? pbpCreateVocabDriveClient() : null;
const runVocabDriveSync = PBP_VOCAB_DRIVE_CAPABLE
  ? pbpCreateVocabDriveSyncRunner({
      client: vocabDriveClient,
      getCurrentPinboardAuth,
      pinboardAuthIsCurrent: pbpPinboardAuthIsCurrent
    })
  : null;

// A blocked account clears every alarm, so nothing else will ever mention it
// again -- without this the only way to learn that sync died is to open
// Settings. Announce it once per transition, never on a run the user started.
async function pbpAnnounceVocabDriveBlocked(before, after) {
  if (after?.blocked !== true || before?.blocked === true) return;
  await showNotification(
    "vocab-drive-blocked", t("extName"), t("vocabDriveBlockedNotice"), "error"
  );
}

// A pull writes straight into IndexedDB from here; open reader and settings
// pages hold their own snapshots and have no way to know.
function pbpBroadcastVocabSynced(owner) {
  try {
    const pending = chrome.runtime.sendMessage({ type: "PBP_VOCAB_SYNCED", owner });
    if (pending && typeof pending.catch === "function") pending.catch(() => {});
  } catch (_) {}
}

function pbpQueueVocabDriveSync(options) {
  if (!PBP_VOCAB_DRIVE_CAPABLE) {
    return Promise.resolve({ ok: false, error: "unavailable", retryable: false });
  }
  return queueVocabSync(async () => {
    const auth = await getCurrentPinboardAuth().catch(() => null);
    const ownerScope = auth?.account ? pbpDictOwnerScope(auth.account) : "";
    const ownerHash = ownerScope
      ? await pbpVocabOwnerHash(ownerScope).catch(() => "") : "";
    const before = ownerHash ? await pbpVocabGetPreflightState(ownerHash).catch(() => null) : null;
    const result = await runVocabDriveSync(options);
    if (result?.ok && result.changed) pbpBroadcastVocabSynced(ownerScope);
    if (!options?.interactive && ownerHash) {
      const after = await pbpVocabGetPreflightState(ownerHash).catch(() => null);
      await pbpAnnounceVocabDriveBlocked(before, after).catch(() => {});
    }
    return result;
  });
}

async function pbpVocabDriveIsConnected() {
  if (!PBP_VOCAB_DRIVE_CAPABLE) return false;
  const stored = await chrome.storage.local.get(PBP_VOCAB_DRIVE_CONNECTED_KEY);
  return stored[PBP_VOCAB_DRIVE_CONNECTED_KEY] === true;
}

async function pbpGetVocabDriveStatus() {
  const connected = await pbpVocabDriveIsConnected();
  const auth = await getCurrentPinboardAuth();
  if (!auth.account || !pbpPinboardAuthIsCurrent(auth)) {
    return { connected, owner: "", pendingWords: 0, pendingBatches: 0, notices: 0 };
  }
  const ownerScope = pbpDictOwnerScope(auth.account);
  const ownerHash = await pbpVocabOwnerHash(ownerScope);
  const [snapshot, preflight] = await Promise.all([
    pbpVocabSyncSnapshot(ownerScope, ownerHash),
    pbpVocabGetPreflightState(ownerHash)
  ]);
  const states = snapshot.states.slice()
    .sort((a, b) => (b.lastSuccessAt || 0) - (a.lastSuccessAt || 0));
  const state = states[0] || null;
  const outbox = snapshot.outbox;
  const pending = state
    ? snapshot.batches.filter((row) => row.drivePermissionId === state.drivePermissionId) : [];
  const notices = snapshot.notices;
  if (!pbpPinboardAuthIsCurrent(auth)) {
    return { connected, owner: "", pendingWords: 0, pendingBatches: 0, notices: 0 };
  }
  return {
    ...(state || {}),
    ...(preflight ? {
      lastError: preflight.lastError,
      retryAttempt: preflight.retryAttempt,
      retryAt: preflight.retryAt,
      blocked: preflight.blocked
    } : {}),
    connected,
    owner: auth.account,
    pendingWords: outbox.length,
    pendingBatches: pending.length,
    notices: notices.length,
    // The bare count named nothing. The record key is "<lang>|<term>", and the
    // term is already visible in the vocabulary list on the same page.
    noticeTerms: notices.slice(0, 20).map((row) => {
      const key = String(row.recordKey || "");
      const separator = key.indexOf("|");
      return separator >= 0 ? key.slice(separator + 1) : key;
    }).filter(Boolean)
  };
}

async function pbpVocabDriveResponse(result) {
  const response = result?.ok
    ? { ok: true }
    : { ok: false, error: result?.error || "remote" };
  try {
    response.status = await pbpGetVocabDriveStatus();
  } catch (_) {}
  return response;
}

// Floor between two cold-start syncs. This function runs at the top level, and
// an MV3 "startup" is EVERY SW wake (see the lazy icon-decode note at the top of
// this file) — with storage-warm waking an idle browser every 5 minutes, a
// connected device opened a Drive session (an about() round trip, plus another
// on a successful finish) that often, while the design cadence is the 15-minute
// vocab-sync-periodic alarm. Alarm-driven runs carry the real schedule and pass
// no throttle, so a freshly dirtied word still syncs immediately. The stamp is
// persisted because the throttle has to survive the worker that set it.
const PBP_VOCAB_BOOT_SYNC_KEY = "_vocabBootSyncTs";
const PBP_VOCAB_BOOT_SYNC_MIN_MS = 15 * 60 * 1000;

async function pbpBootVocabDriveSync({ throttleMs = 0 } = {}) {
  if (!PBP_VOCAB_DRIVE_CAPABLE) return { ok: true };
  if (!await pbpVocabDriveIsConnected()) return { ok: true };
  const granted = await chrome.permissions.contains({
    permissions: ["identity"],
    origins: [PBP_GOOGLE_API_ORIGIN]
  });
  if (!granted) {
    await chrome.storage.local.set({ [PBP_VOCAB_DRIVE_CONNECTED_KEY]: false });
    await Promise.all([
      chrome.alarms.clear("vocab-sync-dirty"),
      chrome.alarms.clear("vocab-sync-periodic"),
      chrome.alarms.clear("vocab-sync-retry")
    ]);
    return { ok: false, error: "permission" };
  }
  if (throttleMs > 0) {
    const now = Date.now();
    let last = 0;
    try {
      const stored = await chrome.storage.local.get({ [PBP_VOCAB_BOOT_SYNC_KEY]: 0 });
      last = Number(stored?.[PBP_VOCAB_BOOT_SYNC_KEY]) || 0;
    } catch (e) {
      console.warn("[vocab-sync] boot throttle read failed:", e?.name, e?.message);
    }
    // Stamp BEFORE the run: a failed sync sets its own retryAt/backoff and owns
    // the vocab-sync-retry alarm, so the wake path must not hammer it either.
    if (now - last < throttleMs) return { ok: true, throttled: true };
    try { await chrome.storage.local.set({ [PBP_VOCAB_BOOT_SYNC_KEY]: now }); }
    catch (e) { console.warn("[vocab-sync] boot throttle write failed:", e?.name, e?.message); }
  }
  return pbpQueueVocabDriveSync({ interactive: false });
}

async function pbpDisconnectVocabDrive() {
  if (!PBP_VOCAB_DRIVE_CAPABLE) {
    return { ok: false, error: "unavailable" };
  }
  let token = "";
  try {
    const result = await chrome.identity.getAuthToken({ interactive: false });
    token = typeof result === "string" ? result : result?.token || "";
  } catch (_) {}
  if (token) {
    try { await chrome.identity.removeCachedAuthToken({ token }); } catch (_) {}
  }
  try {
    await chrome.permissions.remove({
      permissions: ["identity"],
      origins: [PBP_GOOGLE_API_ORIGIN]
    });
  } catch (_) {}
  await chrome.storage.local.set({ [PBP_VOCAB_DRIVE_CONNECTED_KEY]: false });
  await Promise.all([
    chrome.alarms.clear("vocab-sync-dirty"),
    chrome.alarms.clear("vocab-sync-periodic"),
    chrome.alarms.clear("vocab-sync-retry")
  ]);
  return { ok: true, status: await pbpGetVocabDriveStatus() };
}

pbpBootVocabDriveSync({ throttleMs: PBP_VOCAB_BOOT_SYNC_MIN_MS }).catch(() => {});

const queuePrewarmAlarmSync = pbpCreateRecoveringTail();
function syncPrewarmTagsAlarm() {
  return queuePrewarmAlarmSync(async () => {
    const s = await loadSettings();
    const existing = await chrome.alarms.get("prewarm-tags");
    const shouldRun = s.tagSyncMode === "prewarmed" && !!s.pinboardToken;
    if (shouldRun && !existing) {
      chrome.alarms.create("prewarm-tags", { periodInMinutes: 15, delayInMinutes: 0.5 });
      prewarmTagsNow().catch(() => {}); // populate now; don't wait ~30s for the first alarm
    } else if (!shouldRun && existing) {
      chrome.alarms.clear("prewarm-tags");
    }
  });
}

async function prewarmTagsNow() {
  const auth = await getCurrentPinboardAuth();
  if (!auth.token) return;
  try {
    const resp = await pinboardFetch(`https://api.pinboard.in/v1/tags/get?auth_token=${auth.token}&format=json`);
    if (!resp.ok) return;
    const data = await resp.json();
    if (!pbpPinboardAuthIsCurrent(auth)) return;
    // Store only the count map + timestamp; the popup rebuilds the sorted tag list
    // from counts on read (deterministic), so storing the array too is dead weight.
    await chrome.storage.local.set({
      cached_user_tags: { account: auth.account, counts: data, timestamp: Date.now() }
    });
  } catch (e) {
    // Tag cache write failure: stale data hurts autocomplete UX, log it
    if (e?.code !== "account_changed") console.warn("[tag-cache] write failed:", e?.message || e);
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === PBP_STORAGE_ACCESS_RETRY_ALARM) {
    pbpRestrictStorageAccess().catch((e) => {
      console.warn("[storage-access] retry failed:", e?.name, e?.message);
    });
  }
  if (alarm.name === "vocab-sync-dirty" ||
      alarm.name === "vocab-sync-periodic" ||
      alarm.name === "vocab-sync-retry") {
    pbpBootVocabDriveSync().catch(() => {});
  }
  if (alarm.name === "keepalive") {
    processOfflineQueue().catch(() => {});
    pbpSweepInterruptedBatch().catch((e) => {
      console.warn("[batch] interrupted sweep failed:", e?.name, e?.message);
    });
    ensureKeepAlive(); // if SW was revived mid-window by the alarm, resume pinging
    // Self-release: when the activity window lapsed AND there is no queued or
    // running work left, clear this alarm so an idle browser stops waking the
    // worker every 4 minutes. Any later activity/queue/batch re-creates it.
    _maybeReleaseKeepaliveAlarm();
  }
  if (alarm.name === "badge-refresh") {
    updateBadge().catch(() => {});
  }
  if (alarm.name === PBP_UNDO_ALARM) {
    pbpSweepExpiredUndo().catch((e) => console.warn("[undo] expiry sweep failed:", e?.name, e?.message));
  }
  if (alarm.name === "prewarm-tags") {
    prewarmTagsNow().catch(() => {});
  }
  if (alarm.name === "storage-warm") {
    _bgSaveModeMigration.then(() => primeSettings()).catch(() => {});
    pbpMigrateSecretsToLocal().catch(() => {});
  }
});

// React to settings change: toggle the prewarm alarm on/off (settings live in sync or local based on optSyncEnabled)
chrome.storage.onChanged.addListener((changes, area) => {
  if ((area === "sync" || area === "local") && pbpSettingsKeysChanged(changes)) {
    invalidateSettingsCache();
  }
  if (area === "sync" || area === "local") scheduleEffectiveAuthRefresh(changes, area);
  if (area === "sync" && (changes.syncApiKeys || changes.exportTargets ||
      API_KEY_FIELDS.some((key) => !!changes[key]))) {
    // Mirror keys-on snapshots promptly on every participating online device;
    // the periodic storage-warm run remains the MV3 restart/offline fallback.
    pbpMigrateSecretsToLocal().catch(() => {});
  }
  const routingChanged = !!(changes.optSyncEnabled || changes.syncApiKeys);
  if ((area === "sync" || area === "local") && (routingChanged || changes.tagSyncMode || changes.pinboardToken)) {
    syncPrewarmTagsAlarm().catch(() => {});
  }
  // Conditional site-theme payload (roadmap #37): register/unregister the
  // 704KB themes constant as the preset comes and goes (routing changes can
  // flip the effective value too, so re-check on those as well).
  if ((area === "sync" || area === "local") && (changes.themePresetKey || routingChanged)) {
    pbpSyncSiteThemeScript();
  }
});
// Initial check
syncPrewarmTagsAlarm().catch(() => {});

// Sweep expired migration backup (7 days)
async function sweepAICacheMigrationBackup() {
  try {
    const { _aiCacheMigrationBackup } = await chrome.storage.local.get("_aiCacheMigrationBackup");
    if (!_aiCacheMigrationBackup) return;
    const ageMs = Date.now() - (_aiCacheMigrationBackup.ts || 0);
    if (ageMs > 7 * 24 * 60 * 60 * 1000) {
      await chrome.storage.local.remove("_aiCacheMigrationBackup");
      console.log("[ai-cache] migration backup swept after 7 days");
    }
  } catch (_) {}
}


// Recurring sweep of the per-URL suggest-tag cache (cached_suggest_*). The popup
// writes one key per visited URL with a 10-min read-TTL but never evicts them, so
// without this they accumulate unbounded in storage.local and slow reads. Gated to
// ~once / 6h to bound the get(null) scan; drops entries older than 1h (past the TTL).
const SUGGEST_SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000;
const SUGGEST_STALE_MS = 60 * 60 * 1000;
// Recurring sweep of per-URL cache (cached_suggest_* and jina_md_*). Both write
// entries with a read-TTL but never evict them, so without this they accumulate
// unbounded in storage.local and slow reads. Gated to ~once / 6h to bound the
// get(null) scan. The two families expire on DIFFERENT clocks: cached_suggest_
// has a fixed 10-min read TTL (1h here is the generous side of it), while
// jina_md_ is read back through resolveCacheMs(aiCacheDuration) (jina.js) — a
// user-settable duration of up to 7 days. Sweeping those on a hardcoded hour
// silently voided the setting and re-billed the next preview to r.jina.ai, so
// resolve the same value the reader uses; 0 there means caching is off, which
// makes every stored entry unreachable and therefore sweepable.
async function sweepSuggestCache() {
  try {
    const now = Date.now();
    const { _suggestSweepTs = 0 } = await chrome.storage.local.get({ _suggestSweepTs: 0 });
    if (now - _suggestSweepTs < SUGGEST_SWEEP_INTERVAL_MS) return;
    let jinaStaleMs = resolveCacheMs(SETTINGS_DEFAULTS.aiCacheDuration);
    try {
      const raw = await pbpReadSettingsWithSecrets({ aiCacheDuration: SETTINGS_DEFAULTS.aiCacheDuration });
      jinaStaleMs = resolveCacheMs(raw.aiCacheDuration);
    } catch (e) {
      // MV3 rule: leave a trace instead of folding the failure away. No secrets
      // here — the read asks for one duration key.
      console.warn("[cache-sweep] cache duration read failed:", e?.name, e?.message);
    }
    const all = await chrome.storage.local.get(null);
    const stale = Object.keys(all).filter((k) => {
      if (k.startsWith("cached_suggest_")) return isStaleCacheEntry(all[k], now, SUGGEST_STALE_MS);
      if (k.startsWith("jina_md_")) return jinaStaleMs === 0 || isStaleCacheEntry(all[k], now, jinaStaleMs);
      return false;
    });
    if (stale.length) await chrome.storage.local.remove(stale);
    await chrome.storage.local.set({ _suggestSweepTs: now });
    if (stale.length) console.log(`[cache-sweep] evicted ${stale.length} stale entries (suggest + jina_md)`);
  } catch (_) {}
}

// Best-effort sweep of orphaned per-tab preview payloads (md_preview_data_<uuid>).
// Each preview tab owns a token key; storage.local.remove for it only runs on the
// render path, never on tab close/crash — so closed previews leak their key. Cross-
// references CURRENTLY-live preview tabs (incl. discarded Memory-Saver tabs, which
// stay in tabs.query with their ?k= intact) and drops the rest. The legacy no-token
// global key `md_preview_data` (no trailing underscore) is deliberately excluded by
// the prefix so a pre-update tab's fallback slot is never swept out from under it.
// Throttled to ~once / 30 min via a persisted timestamp (same pattern as
// sweepSuggestCache): "once per SW script evaluation" really meant once per SW
// WAKE (~every 4 min via alarms), and the full get(null) fallback deserializes
// the entire local area (jina_md_ page caches can reach MBs) — right when a
// popup cold-open may be hitting the same storage backend. Orphaned keys are
// harmless residue; letting them linger up to 30 min costs nothing.
const PREVIEW_SWEEP_INTERVAL_MS = 30 * 60 * 1000;
async function pbpSweepPreviewOrphans() {
  try {
    const now = Date.now();
    const { _previewSweepTs = 0 } = await chrome.storage.local.get({ _previewSweepTs: 0 });
    if (now - _previewSweepTs < PREVIEW_SWEEP_INTERVAL_MS) return;
    const tabs = await chrome.tabs.query({});            // includes discarded tabs
    const base = chrome.runtime.getURL("md-preview.html");
    const live = new Set();
    for (const tb of tabs) {
      if (tb.url && tb.url.startsWith(base)) {
        const kk = new URL(tb.url).searchParams.get("k");
        if (kk) live.add("md_preview_data_" + kk);
      }
    }
    // Chrome ≥130 getKeys() lists keys without deserializing values; fall back
    // to get(null) below min-chrome 130. Candidates then get a targeted get()
    // just for their grace-window timestamps.
    let candidates;
    if (typeof chrome.storage.local.getKeys === "function") {
      const keys = await chrome.storage.local.getKeys();
      candidates = keys.filter((x) => x.startsWith("md_preview_data_") && !live.has(x));
    } else {
      const all = await chrome.storage.local.get(null);
      candidates = Object.keys(all).filter((x) => x.startsWith("md_preview_data_") && !live.has(x));
    }
    // Grace window: keep keys written in the last 60s even if their tab isn't in
    // tabs.query yet — closes the cold-start TOCTOU where popup set()s a token key
    // (waking the SW → this sweep) before its tabs.create() registers the ?k= tab.
    if (candidates.length) {
      const entries = await chrome.storage.local.get(candidates);
      const stale = candidates.filter((x) =>
        !(entries[x] && entries[x].ts && (now - entries[x].ts) < 60000));
      if (stale.length) await chrome.storage.local.remove(stale);
    }
    await chrome.storage.local.set({ _previewSweepTs: now });
  } catch (_) { /* best-effort: leaked keys just linger to the next sweep */ }
}
// Cold-start residue clean (fire-and-forget; internally throttled).
pbpSweepPreviewOrphans();

// Startup: process offline queue + update badge + prime settings (cheap no-op when already primed)
chrome.runtime.onStartup.addListener(() => {
  _bgSaveModeMigration.then(() => primeSettings()).catch(() => {});
  processOfflineQueue().catch(() => {});
  updateBadge().catch(() => {});
});

// Install/update: prime SETTINGS_DEFAULTS so the first popup open is fast for users whose
// storage doesn't have every key yet (storage.get(missing-key) is measurably slower).
chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === "install" || reason === "update") {
    _bgSaveModeMigration.then(() => primeSettings()).catch(() => {});
    readOfflineQueueWithIds().catch(() => {});
  }
});

// ---- 监听来自 popup 的消息 ----
// Named, not an inline arrow (roadmap #35): the router is the single entry
// for all four surfaces' messaging, and the project's source-slice test
// technique can only reach NAMED functions — as an anonymous callback these
// 21 branches were the largest untestable block in the extension. Behavior
// is unchanged; registration stays top-level synchronous per MV3 rules.
function handleRuntimeMessage(message, sender, sendResponse) {
  if (!message || typeof message !== "object") { sendResponse({ error: "invalid" }); return true; }
  // Structural gate (defense in depth): accept only messages from this
  // extension's own PAGES. Today this is unreachable — no content script calls
  // runtime.sendMessage and the manifest has no externally_connectable — but
  // that safety is an environmental fact, not a guarantee: any future
  // postMessage→sendMessage bridge in a content script (bili-player-bridge
  // already listens for postMessage) would otherwise expose the privileged
  // handlers below (pinboard_api_call dispatches with the live token).
  // sender.url distinguishes the two: extension pages (popup, and options/
  // library/md-preview which DO run in tabs, so sender.tab can't be the test)
  // carry a chrome-extension://<own-id>/ URL; content scripts carry the web
  // page's URL. Fail closed when absent.
  if (!sender || sender.id !== chrome.runtime.id ||
      typeof sender.url !== "string" || !sender.url.startsWith(chrome.runtime.getURL(""))) {
    // One deliberate content-script window (roadmap #36): the pinboard.in
    // scripts read their prefs via message now that storage is trusted-only.
    // Same-extension sender + pinboard.in page + exactly this type; the
    // handler returns only non-secret display prefs by construction.
    if (sender && sender.id === chrome.runtime.id &&
        typeof sender.url === "string" && /^https:\/\/([a-z0-9-]+\.)?pinboard\.in\//.test(sender.url) &&
        message.type === "get_site_prefs") {
      (async () => {
        const s = await loadSettings();
        const overlay = await pbpWithLargeStorageLock("customOverlayCSS", () =>
          pbpReadLargeWithFallbackUnlocked("customOverlayCSS", async () => {
            try {
              const st = await getSettingsStorage();
              return (await st.get("customOverlayCSS")).customOverlayCSS;
            } catch (_) { return ""; }
          }, ""));
        sendResponse({
          customFont: String(s.customFont || ""),
          optTheme: String(s.optTheme || "auto"),
          themePresetKey: String(s.themePresetKey || ""),
          overlayCss: typeof overlay === "string" ? overlay : "",
          tagSortByPopEnabled: s.tagSortByPopEnabled !== false,
        });
      })().catch(() => sendResponse(null));
      return true;
    }
    sendResponse({ error: "forbidden" });
    return true;
  }
  noteActivity(); // using the popup keeps the SW warm for the next open

  if (message.type === "PBP_VOCAB_DIRTY") {
    if (!PBP_VOCAB_DRIVE_CAPABLE) {
      sendResponse({ ok: false, error: "unavailable" });
      return true;
    }
    pbpVocabDriveIsConnected()
      .then((connected) => connected
        ? pbpVocabScheduleDirty(chrome.alarms)
        : false)
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false, error: "remote" }));
    return true;
  }

  if (message.type === "vocabDriveConnect") {
    if (!PBP_VOCAB_DRIVE_CAPABLE) {
      sendResponse({ ok: false, error: "unavailable" });
      return true;
    }
    chrome.storage.local.set({ [PBP_VOCAB_DRIVE_CONNECTED_KEY]: true })
      .then(() => pbpQueueVocabDriveSync({ interactive: true, force: true }))
      .then(async (result) => {
        // A retryable auth failure means the token could not be minted right
        // now, not that the grant is gone. Dropping the connected flag would
        // make pbpBootVocabDriveSync return early and turn the retry alarm the
        // runner just scheduled into a no-op.
        if (!result.ok && result.retryable !== true &&
            (result.error === "auth" || result.error === "permission")) {
          await chrome.storage.local.set({ [PBP_VOCAB_DRIVE_CONNECTED_KEY]: false });
        }
        return pbpVocabDriveResponse(result);
      })
      .then(sendResponse)
      .catch(() => sendResponse({ ok: false, error: "remote" }));
    return true;
  }

  if (message.type === "vocabDriveStatus") {
    if (!PBP_VOCAB_DRIVE_CAPABLE) {
      sendResponse({ ok: false, error: "unavailable" });
      return true;
    }
    pbpGetVocabDriveStatus()
      .then((status) => sendResponse({ ok: true, status }))
      .catch(() => sendResponse({ ok: false, error: "remote" }));
    return true;
  }

  if (message.type === "vocabDriveClearNotices") {
    getCurrentPinboardAuth()
      .then(async (auth) => {
        if (!auth.account || !pbpPinboardAuthIsCurrent(auth)) {
          return { ok: false, error: "pinboard_auth" };
        }
        const cleared = await pbpVocabClearNotices(pbpDictOwnerScope(auth.account));
        return cleared ? { ok: true } : { ok: false, error: "local_store" };
      })
      .then((result) => pbpVocabDriveResponse(result))
      .then(sendResponse)
      .catch(() => sendResponse({ ok: false, error: "remote" }));
    return true;
  }

  if (message.type === "vocabDriveSyncNow") {
    if (!PBP_VOCAB_DRIVE_CAPABLE) {
      sendResponse({ ok: false, error: "unavailable" });
      return true;
    }
    pbpVocabDriveIsConnected()
      .then(async (connected) => {
        // Not an authorization problem: this device simply has not connected.
        if (!connected) return { ok: false, error: "not_connected" };
        if (message.force === true) await chrome.alarms.clear("vocab-sync-retry");
        return pbpQueueVocabDriveSync({
          interactive: false,
          force: message.force === true
        });
      })
      .then((result) => pbpVocabDriveResponse(result))
      .then(sendResponse)
      .catch(() => sendResponse({ ok: false, error: "remote" }));
    return true;
  }

  if (message.type === "vocabDriveDisconnect") {
    if (!PBP_VOCAB_DRIVE_CAPABLE) {
      sendResponse({ ok: false, error: "unavailable" });
      return true;
    }
    queueVocabSync(async () => pbpDisconnectVocabDrive())
      .then(sendResponse)
      .catch(() => sendResponse({ ok: false, error: "remote" }));
    return true;
  }

  if (message.type === "get_bookmark_data" && message.url) {
    getCurrentPinboardAuth().then((auth) => {
      if (!message.account || message.account !== auth.account) {
        sendResponse({ posts: null, account: "" });
        return;
      }
      const cached = pbpStatusCacheGet(message.url, auth);
      sendResponse({
        posts: cached && Date.now() - cached.timestamp < CACHE_TTL && cached.posts
          ? cached.posts
          : null,
        account: auth.account,
      });
    }).catch(() => sendResponse({ posts: null, account: "" }));
    return true;
  }

  if (message.type === "get_offline_queue") {
    readOfflineQueueWithIds()
      .then((queue) => sendResponse({ ok: true, queue }))
      .catch(() => sendResponse({ ok: false, queue: [] }));
    return true;
  }

  if (message.type === "save_intent") {
    submitPopupSaveIntent(message.intent, message.account)
      .then(sendResponse)
      .catch(() => sendResponse(pbpSaveFailure("internal")));
    return true;
  }

  if (message.type === "archive_url" && typeof message.url === "string") {
    // Acknowledge AFTER the archive attempt has run and its log entry is
    // written (pbpWaybackArchive resolves post-log and never throws), so the
    // caller can re-render its log on response instead of guessing with a
    // timer. This was the one branch of this listener with no sendResponse:
    // the port closed synchronously and the retry button looked dead for the
    // full 10-30s archive timeout.
    loadSettings()
      .then((s) => pbpWaybackArchive(message.url, s, { isPrivate: message.private === true, force: message.force === true }))
      .then(() => sendResponse({ done: true }))
      .catch((e) => {
        console.warn("[wayback] archive_url failed:", e?.name, e?.message);
        sendResponse({ done: false });
      });
    return true;
  }

  if (message.type === "bookmark_deleted" && message.url) {
    getCurrentPinboardAuth().then(async (auth) => {
      if (!message.account || message.account !== auth.account) {
        sendResponse({ ok: false });
        return;
      }
      const updated = pbpStatusCacheSet(message.url, auth, { bookmarked: false, timestamp: Date.now() });
      if (updated) {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (pbpPinboardAuthIsCurrent(auth) && tab?.id && pbpSameBookmark(tab.url, message.url)) {
          setIcon(tab.id, "default");
        }
      }
      sendResponse({ ok: updated });
    }).catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (message.action === "saveTabSet" && message.tabsData) {
    handleSaveTabSet(message.tabsData);
    sendResponse({ status: "started" });
    return true;
  }

  if (message.action === "startBatchSave" && Array.isArray(message.tabs)) {
    if (_batchRunning) { sendResponse({ status: "busy" }); return true; }
    _batchRunning = true; // reserve synchronously before the first auth await
    getCurrentPinboardAuth().then((auth) => {
      if (!message.account || auth.account !== message.account) {
        _batchRunning = false;
        sendResponse({ status: "account_changed" });
        return;
      }
      handleBatchSave(message.tabs, message.account, true).catch(() => {}); // fire-and-forget; keeps SW alive via in-flight fetches
      sendResponse({ status: "started", account: message.account });
    }).catch(() => {
      _batchRunning = false;
      sendResponse({ status: "account_changed" });
    });
    return true;
  }

  if (message.type === "pinboard_api_call") {
    // Proxy Pinboard fetch through service worker to avoid Chrome's native auth dialog on 401
    if (!pbpIsAllowedPinboardApiUrl(message.url)) {
      sendResponse({ ok: false, status: 0, text: "", error: "invalid_pinboard_api_url" });
      return true;
    }
    getCurrentPinboardAuth().then(async (auth) => {
      const authorizedUrl = pbpAuthorizePinboardApiUrl(message.url, auth.token);
      if (!authorizedUrl) {
        sendResponse({ ok: false, status: 0, text: "", error: "account_changed" });
        return;
      }
      const immediate = message.immediate === true
        && new URL(authorizedUrl).pathname === "/v1/posts/suggest";
      // timeoutMs pass-through (roadmap #23): options' tag-governance calls
      // need 30s for posts/all-sized reads; clamp so a page can't park a
      // queue slot forever.
      const timeoutMs = Math.min(60000, Math.max(1000, Number(message.timeoutMs) || 15000));
      const res = immediate
        ? await pinboardFetchImmediate(authorizedUrl, { timeoutMs: 8000 })
        : await pinboardFetch(authorizedUrl, { timeoutMs });
        const text = await res.text();
        if (!pbpPinboardAuthIsCurrent(auth)) {
          sendResponse({ ok: false, status: 0, text: "", error: "account_changed" });
          return;
        }
        sendResponse({ ok: res.ok, status: res.status, text });
      })
      .catch(err => sendResponse({ ok: false, status: 0, text: "", error: err.code || err.message }));
    return true;
  }

  if (message.type === "retry_offline_item" && typeof message.queueId === "string") {
    retryOfflineItem(message.queueId)
      .then(({ ok, result }) => sendResponse({ ok, result }))
      .catch(() => sendResponse({ ok: false, result: pbpSaveFailure("internal") }));
    return true;
  }

  if (message.type === "remove_offline_item" && typeof message.queueId === "string") {
    mutateOfflineQueue({ kind: "remove", queueId: message.queueId })
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (message.type === "clear_offline_queue") {
    mutateOfflineQueue({ kind: "clear" })
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (message.type === "test_pinboard_token" && message.token) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    // redirect:"error" — same invariant _executePinboardFetch enforces: the
    // auth_token rides the query string, so following a 3xx would replay the
    // plaintext token to whatever host the Location names. A 3xx now rejects
    // into the existing .catch and reports as a network failure.
    fetch(`https://api.pinboard.in/v1/user/api_token/?auth_token=${encodeURIComponent(message.token)}&format=json`, { signal: ctrl.signal, redirect: "error" })
      .then(res => { clearTimeout(timer); sendResponse({ ok: res.ok, status: res.status }); })
      .catch(err => { clearTimeout(timer); sendResponse({ ok: false, error: err.name === "AbortError" ? "timeout" : "network" }); });
    return true; // keep channel open for async response
  }

  // ---- Image-fix Referer rules (hotlink round). Tab scope comes from
  // sender.tab, never the message; the sender must be OUR preview page, so no
  // other surface (content script, another extension page) can drive this.
  // frameId === 0 (top-level document) on both handlers: a sub-frame that
  // happened to load md-preview.html would otherwise satisfy the URL prefix
  // check. The repo embeds no such frame today -- this is defense in depth.
  if (message.type === "imgFixInstallReferer") {
    const tabId = sender && sender.tab && sender.tab.id;
    const fromPreview = !!(sender && sender.frameId === 0 && _imgFixIsPreviewUrl(sender.url));
    const domains = Array.isArray(message.domains)
      ? message.domains.filter((d) => typeof d === "string" && d && !/[/:*?]/.test(d)) : [];
    let origin = "";
    try {
      const p = new URL(message.origin);
      if (p.protocol === "https:" || p.protocol === "http:") origin = p.origin;
    } catch (_) {}
    if (typeof tabId !== "number" || !fromPreview || !domains.length || !origin) {
      sendResponse({ ok: false, error: "bad_request" });
      return true;
    }
    pbpImgFixInstallRule({ domains, origin, tabId, docUrl: sender.url })
      .then((ruleId) => sendResponse({ ok: true, ruleId }))
      .catch((e) => sendResponse({ ok: false, error: (e && e.message) || "install_failed" }));
    return true;
  }

  if (message.type === "imgFixRemoveReferer") {
    const tabId = sender && sender.tab && sender.tab.id;
    const fromPreview = !!(sender && sender.frameId === 0 && _imgFixIsPreviewUrl(sender.url));
    const ids = Array.isArray(message.ruleIds) ? message.ruleIds.filter((n) => typeof n === "number") : [];
    if (typeof tabId !== "number" || !fromPreview || !ids.length) { sendResponse({ ok: false }); return true; }
    pbpImgFixRemoveRules(ids, tabId, sender.url)
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  // A freshly loaded preview clears its OWN tab's leftovers. Covers the one
  // navigation Chrome never reports as a URL change: a same-URL reload (F5 /
  // Memory-Saver restore), after which the old document's rules would otherwise
  // sit there until the tab closed (confirm-review 3).
  if (message.type === "imgFixResetTab") {
    const tabId = sender && sender.tab && sender.tab.id;
    const fromPreview = !!(sender && sender.frameId === 0 && _imgFixIsPreviewUrl(sender.url));
    if (typeof tabId !== "number" || !fromPreview) { sendResponse({ ok: false }); return true; }
    pbpImgFixSweepRules(tabId).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message.type === "reextractMarkdown") {
    const { tabId, url, engine, k, sourceTabUrl } = message;
    const frame = message.frame === true; // embedded-frame pass, only after the reader's grant button
    // The origin the reader says the user granted: origin form only (no path),
    // https only; checked against the live grant below before any injection.
    // True origin-form check (Codex 2026-08-26): the URL parser rejects
    // wildcards / spaces, and `origin === input` rejects any path, query,
    // fragment, credentials or default-port noise a regex would let through.
    const frameOrigin = (() => {
      if (!frame || typeof message.frameOrigin !== "string") return "";
      try { const u = new URL(message.frameOrigin); return (u.protocol === "https:" && u.origin === message.frameOrigin) ? u.origin : ""; }
      catch (_) { return ""; }
    })();
    if (!url || (engine !== "local" && engine !== "jina")) {
      sendResponse({ ok: false, error: "bad_request" }); return true;
    }
    // Write back to the requesting tab's own token key so the reload reads the
    // fresh payload from the SAME slot it owns. No k = pre-update tab → fall
    // back to the legacy global key.
    const key = k ? "md_preview_data_" + k : "md_preview_data";
    (async () => {
      const stored = (await chrome.storage.local.get(key))[key];
      if (!stored || stored.url !== url || stored.tabId !== tabId) {
        sendResponse({ ok: false, error: "bad_request" });
        return;
      }
      // The storage slot is the preview's immutable ownership record. Message
      // fields are mutable and must never be allowed to replace account metadata.
      const owner = {
        account: typeof stored.account === "string" ? stored.account : "",
        tags: Array.isArray(stored.tags) ? stored.tags.slice() : [],
        description: typeof stored.description === "string" ? stored.description : "",
      };
      // sourceTabUrl is IMMUTABLE tab identity (hotlink round): prefer the
      // slot's own record, else the message's, else the legacy url. It must
      // survive every payload rewrite below, or one Jina pass (whose d.url
      // overwrites `url`) would erase it and re-brick the local engine.
      const tabUrl = (typeof stored.sourceTabUrl === "string" && stored.sourceTabUrl)
        || (typeof sourceTabUrl === "string" && sourceTabUrl) || url;
      // Frame pass: the grant must exist for exactly the origin the reader
      // names (contains only -- the SW never requests), else the message is a
      // stale or forged request and gets the same host_permission answer the
      // reader already knows how to show.
      if (frame) {
        let held = false;
        if (frameOrigin) {
          try { held = await chrome.permissions.contains({ origins: [frameOrigin + "/*"] }); } catch (_) { held = false; }
        }
        if (!held) { sendResponse({ ok: false, error: "host_permission" }); return; }
      }
      const out = await extractForPreview({ tabId, url, engine, sourceTabUrl: tabUrl, frame, frameOrigin });
      if (out.error) {
        // frameOrigin (origin string only) lets the reader offer the one-click
        // grant for an article that lives in an embedded cross-origin frame.
        sendResponse(out.frameOrigin ? { ok: false, error: out.error, frameOrigin: out.frameOrigin } : { ok: false, error: out.error });
        return;
      }
      const latest = (await chrome.storage.local.get(key))[key];
      if (!latest || latest.url !== url || latest.tabId !== tabId
          || (typeof latest.account === "string" ? latest.account : "") !== owner.account) {
        sendResponse({ ok: false, error: "account_changed" });
        return;
      }
      await chrome.storage.local.set({
        [key]: {
          // baseUrl resolves relative links/images: for a frame pass it is the
          // FRAME's own URL (out.baseUrl), never the top page's (Codex 2026-08-26).
          ...out, baseUrl: out.baseUrl || out.url || url, tabId, sourceTabUrl: tabUrl,
          account: owner.account,
          tags: owner.tags,
          description: owner.description,
          ts: Date.now() // sweep grace (see pbpSweepPreviewOrphans)
        }
      });
      sendResponse({ ok: true });
    })()
      .catch(e => sendResponse({ ok: false, error: e.message }));
    return true;
  }

  if (message.type === "mdPreviewBookmarkInfo" && message.url) {
    // Same checkBookmarked()/statusCache the toolbar icon uses (X2: badge = one
    // cache, one source of truth). checkBookmarked()'s TTL-hit branch can return
    // bookmarked:true from a cache entry that was populated WITHOUT .posts (see
    // save pipeline / quick-save / batch-save / skip-mode / offline-queue call
    // sites) — so the boolean alone isn't enough to read tags/shared/toread from.
    // Mirror get_bookmark_data's guard (background.js:845-846: require
    // cached.posts, not just cached.bookmarked) and force one fresh posts/get
    // lookup when .posts is missing, same shape as fetchExistingBookmark
    // (background.js:242). Any failure collapses to bookmarked:false.
    const url = message.url;
    (async () => {
        const auth = await getCurrentPinboardAuth();
        if (!message.account || message.account !== auth.account) {
          sendResponse({ bookmarked: false, account: "" });
          return;
        }
        const bookmarked = await checkBookmarked(url, auth);
        if (!pbpPinboardAuthIsCurrent(auth)) {
          sendResponse({ bookmarked: false, account: "" });
          return;
        }
        if (!bookmarked) { sendResponse({ bookmarked: false, account: auth.account }); return; }
        let post = pbpStatusCacheGet(url, auth)?.posts?.[0];
        if (!post) {
          if (!auth.token) { sendResponse({ bookmarked: false, account: auth.account }); return; }
          const resp = await pinboardFetch(`https://api.pinboard.in/v1/posts/get?auth_token=${auth.token}&format=json&url=${encodeURIComponent(url)}`);
          const posts = resp.ok ? (await resp.json()).posts || [] : [];
          if (!pbpPinboardAuthIsCurrent(auth)) {
            sendResponse({ bookmarked: false, account: "" });
            return;
          }
          if (!pbpStatusCacheSet(url, auth, { bookmarked: posts.length > 0, timestamp: Date.now(), posts })) {
            sendResponse({ bookmarked: false, account: "" }); return;
          }
          post = posts[0];
        }
        if (!post) { sendResponse({ bookmarked: false, account: auth.account }); return; }
        sendResponse({ bookmarked: true, tags: post.tags || "", shared: post.shared, toread: post.toread, account: auth.account });
      })()
      .catch(() => sendResponse({ bookmarked: false, account: "" }));
    return true;
  }
}
chrome.runtime.onMessage.addListener(handleRuntimeMessage);

// ===================== Batch Bookmark 保存（后台） =====================
// The batch loop moved out of popup-batch.js so it survives popup close.
// Progress is mirrored to storage.local.batch_progress for the popup to render;
// the completion notification fires here regardless of popup state.
let _batchRunning = false;

function _newBatchRunId() {
  return crypto.randomUUID();
}

// A cleanup from run A must never delete run B's newer snapshot/cancel marker.
// Chrome storage has no compare-and-delete primitive, but the SW has one live
// generation and _batchRunning serializes starts; the ownership re-read closes
// the only practical stale-finally path.
async function _removeBatchRecordIfOwned(key, runId) {
  try {
    const stored = await chrome.storage.local.get(key);
    if (stored[key]?.runId !== runId) return false;
    await chrome.storage.local.remove(key);
    return true;
  } catch (e) {
    console.warn(`[batch] ${key} cleanup failed:`, e?.name, e?.message);
    return false;
  }
}

// Returns whether the record actually landed: a caller that announces a terminal
// state (the interrupted sweep) must not tell the user a story storage refused to
// keep. In-loop callers ignore it — the progress UI degrades, the batch continues.
async function _writeBatchProgress(p) {
  // Ongoing batch work IS activity: without this, a long batch (100 tabs with
  // AI ≈ 13 min) outlives the 10-min keepalive window, and the next AI call
  // that goes ~30s without touching a chrome.* API lets the SW idle-terminate
  // mid-run. One call per processed item keeps the window open exactly as long
  // as real work is progressing — no 24/7 drain. typeof-guarded: source-slice
  // test pages execute this function without the keepalive block in scope.
  if (typeof noteActivity === "function") noteActivity();
  try {
    await chrome.storage.local.set({ batch_progress: { ...p, ts: Date.now() } });
    return true;
  } catch (e) {
    // MV3 rule: never swallow a platform failure silently. No secrets in this
    // record — counters plus the non-secret account.
    console.warn("[batch] progress write failed:", e?.name, e?.message);
    return false;
  }
}

// A batch that died with the SW (browser quit, extension reload, crash) leaves
// batch_progress stuck at running with no terminal record and no notification —
// the user never learns which tab it stopped on. Re-running is cheap (AI results
// come from the IDB cache, saves merge tags and keep the original time), so the
// only fix needed is to close the record out loud. Runs on the existing keepalive
// alarm: no new storage key, no new alarm.
async function pbpSweepInterruptedBatch() {
  if (_batchRunning) return; // this SW generation owns a live batch
  const { batch_progress: bp } = await chrome.storage.local.get("batch_progress");
  if (!bp || !bp.running || bp.done) return;
  if (batchIsRunning(bp, Date.now(), BATCH_STALE_TTL)) return; // heartbeat still fresh
  // Account isolation: the record is derived from the account that started the
  // batch, so a different signed-in account may neither close it out nor be told
  // about it. Leaving it untouched costs nothing — it is a single key that the
  // next batch (any account) overwrites wholesale, its stale ts already reads as
  // "not running" everywhere, and the owner's own session sweeps it on return.
  const auth = await getCurrentPinboardAuth();
  if (bp.account && bp.account !== auth.account) return;
  // TOCTOU: the startBatchSave handler reserves _batchRunning synchronously and a
  // live batch rewrites batch_progress with a fresh ts, and both awaits above gave
  // a retry room to start. Re-check the flag AND confirm the record is still the
  // exact one that was read — writing the "interrupted" shape over a batch that is
  // actually running would report it as dead in the popup and in a notification.
  if (_batchRunning) return;
  const fresh = (await chrome.storage.local.get("batch_progress")).batch_progress;
  if (!fresh || !fresh.running || fresh.done || fresh.runId !== bp.runId || fresh.ts !== bp.ts) return;
  if (_batchRunning) return;
  // RESUME first (roadmap #34): when the interrupted worker left a valid job
  // snapshot for this account with unprocessed tabs, pick the batch back up at
  // its cursor instead of declaring it dead. Bounded to two revivals so a
  // batch that keeps dying (e.g. an item that crashes the worker) converges to
  // the interrupted terminal state instead of looping forever. Credentials are
  // NEVER in the snapshot — the resumed run re-reads them like any fresh one.
  try {
    const { batch_job: job } = await chrome.storage.local.get("batch_job");
    if (job && typeof bp.runId === "string" && bp.runId && job.runId === bp.runId &&
        job.account === bp.account && Array.isArray(job.tabs) &&
        Number(job.next) < job.tabs.length && Number(job.resumeCount || 0) < 2) {
      if (_batchRunning) return; // last-moment TOCTOU re-check before reserving
      _batchRunning = true;
      const resumeState = {
        runId: job.runId,
        startIndex: Number(job.next) || 0,
        counts: job.counts || {},
        resumeCount: Number(job.resumeCount || 0) + 1,
      };
      console.info(`[batch] resuming interrupted batch at ${resumeState.startIndex}/${job.tabs.length} (attempt ${resumeState.resumeCount})`);
      handleBatchSave(job.tabs, job.account, true, resumeState).catch((e) => {
        console.warn("[batch] resumed run failed:", e?.name, e?.message);
      });
      return;
    }
    if (job?.runId === bp.runId) await _removeBatchRecordIfOwned("batch_job", bp.runId);
  } catch (e) {
    // Resume is best-effort; the interrupted terminal state below still lands.
    console.warn("[batch] resume snapshot read failed:", e?.name, e?.message);
  }
  // The snapshot read/removal above yielded. Confirm identity again so a new
  // run that started in that window is neither overwritten nor announced dead.
  if (_batchRunning) return;
  const latest = (await chrome.storage.local.get("batch_progress")).batch_progress;
  if (!latest || latest.runId !== bp.runId || latest.ts !== bp.ts || !latest.running || latest.done) return;
  // Announce only what actually landed: a swallowed storage failure would leave the
  // record stuck at running while the user reads an "interrupted" toast, and every
  // later alarm tick would fire another one.
  if (!(await _writeBatchProgress({ ...bp, running: false, done: true, error: "interrupted" }))) return;
  showNotification("batch-error", t("bgBatchSaved"),
    t("batchInterrupted", String(bp.i || 0), String(bp.total || 0)), "error");
}

function handleBatchSave(tabs, expectedAccount = "", reserved = false, resumeState = null) {
  if (!reserved) {
    if (_batchRunning) return Promise.resolve();
    _batchRunning = true;
  }
  return _runBatchSave(tabs, expectedAccount, resumeState).finally(() => { _batchRunning = false; });
}

async function _runBatchSave(tabs, expectedAccount, resumeState = null) {
  const runId = resumeState?.runId || _newBatchRunId();
  const startAuth = await getCurrentPinboardAuth();
  const account = expectedAccount || startAuth.account;
  if (!startAuth.token || !account || startAuth.account !== account) {
    // audit A13: the message handler already replied "started" before this
    // second credential read - a bare return left no terminal
    // batch_progress record and the popup sat disabled at 0% forever.
    // Write the same done-with-error shape the in-run catch produces -
    // but ONLY when an expectedAccount was explicitly handed over (the
    // popup start flow always passes one, so a poller exists): that
    // covers both a genuine account switch AND an external token clear
    // in this window (Codex r2 L6). Internal/legacy calls without an
    // expected account keep the established no-record contract.
    if (expectedAccount && account) {
      await _writeBatchProgress({
        running: false, done: true, error: "account_changed",
        runId, account, total: tabs.length, i: 0,
        saved: 0, queued: 0, failed: 0, aiFailed: 0, skipped: 0, tooLong: 0
      });
    }
    // A resumed run landing here means the account changed while the batch
    // was down — its snapshot can never be finished by anyone. Drop it.
    await _removeBatchRecordIfOwned("batch_job", runId);
    await _removeBatchRecordIfOwned("batch_cancel_requested", runId);
    _batchRunning = false;
    return;
  }
  const total = tabs.length;
  // Resumable job (roadmap #34): counts and the cursor either start fresh or
  // pick up where the interrupted worker generation left off.
  const rc = (resumeState && resumeState.counts) || {};
  let processed = Number(rc.processed) || 0;
  let saved = Number(rc.saved) || 0, queued = Number(rc.queued) || 0, failed = Number(rc.failed) || 0,
      aiFailed = Number(rc.aiFailed) || 0, skipped = Number(rc.skipped) || 0, tooLong = Number(rc.tooLong) || 0;
  const startIndex = resumeState ? Math.max(0, Number(resumeState.startIndex) || 0) : 0;
  const resumeCount = Number(resumeState?.resumeCount) || 0;
  const base = () => ({ runId, resumeCount, account, total, i: processed, saved, queued, failed, aiFailed, skipped, tooLong });
  // Persist the job snapshot BEFORE the first item: everything a resume needs
  // (public tab identity + cursor + counts), never a token. The per-item
  // checkpoint below rewrites cursor+counts; every terminal path removes it.
  const jobRecord = () => ({
    runId,
    account,
    tabs: tabs.map((tb) => ({ id: tb.id, url: tb.url, title: tb.title, incognito: !!tb.incognito })),
    next: processed,
    counts: { processed, saved, queued, failed, aiFailed, skipped, tooLong },
    resumeCount,
    ts: Date.now(),
  });
  const clearJob = () => _removeBatchRecordIfOwned("batch_job", runId);
  const clearCancel = () => _removeBatchRecordIfOwned("batch_cancel_requested", runId);
  try { await chrome.storage.local.set({ batch_job: jobRecord() }); }
  catch (e) { console.warn("[batch] initial checkpoint failed:", e?.name, e?.message); }
  const requireAccount = async () => {
    const auth = await getCurrentPinboardAuth();
    if (auth.account !== account) {
      const error = new Error("account_changed");
      error.code = "account_changed";
      throw error;
    }
    return auth;
  };
  // Cancel markers carry runId, so a fresh run ignores an old marker while a
  // resumed run still honors the exact persisted intent on its first item.
  await _writeBatchProgress({ running: true, done: false, error: null, ...base() });

  try {
    await requireAccount();
    const loadedSettings = await loadSettings();
    const currentAuth = await requireAccount();
    const s = { ...loadedSettings, pinboardToken: currentAuth.token };
    if (!s.pinboardToken) {
      await clearJob();
      await clearCancel();
      await _writeBatchProgress({ running: false, done: true, error: "not_logged_in", ...base() });
      showNotification("batch-error", t("bgBatchSaved"), t("bgNotLoggedIn"), "error");
      return;
    }

    const baseTags = s.optBatchTagEnabled && s.optBatchTag
      ? s.optBatchTag.split(/[,，]+/).map(x => x.trim().replace(/\s+/g, "-")).filter(Boolean)
      : [];
    const useAiTags = s.batchAiTags && hasAIKey(s);
    const useAiSummary = s.batchAiSummary && hasAIKey(s);
    // Batch extraction is always local Defuddle - cache under the matching
    // namespace, never the configured aiContentSource (audit A3, same as
    // saveFromBackground).
    const aiCacheSource = "local";

    // popup's global tagCaseMap is unreachable in the SW; rebuild from the cached
    // user-tag counts (popup-tags.js persists them under "cached_user_tags").
    // The same counts also feed the frequency-sorted vocabulary the tag
    // prompts anchor on (audit A14, popup parity).
    let tagCaseMap = {};
    let userTagsTop = [];
    try {
      const cached = await chrome.storage.local.get("cached_user_tags");
      const entry = cached?.cached_user_tags;
      const counts = entry?.account === account ? entry.counts : null;
      if (counts) {
        userTagsTop = pbpTagsByCount(counts);
        if (s.optRespectTagCase) tagCaseMap = buildTagCaseMap(counts);
      }
    } catch (_) { /* no cache -> map stays empty, prompt unanchored (same as before) */ }

    for (let i = startIndex; i < tabs.length; i++) {
      const tab = tabs[i];

      // Cooperative cancel (roadmap #32): the popup writes this flag; one
      // storage read per item is noise next to the 3.1s rate-limit spacing.
      // Already-saved items stay saved — the terminal record says how many.
      try {
        const { batch_cancel_requested } = await chrome.storage.local.get("batch_cancel_requested");
        if (batch_cancel_requested?.runId === runId && batch_cancel_requested?.account === account) {
          await clearCancel();
          await clearJob();
          await _writeBatchProgress({ running: false, done: true, error: "cancelled", ...base() });
          showNotification("batch-cancelled", t("bgBatchSaved"), t("batchCancelled", String(saved)), "info");
          return;
        }
      } catch (e) {
        // A failed read must not kill the save loop, but MV3 platform failures
        // cannot disappear without a trace. No payload/account is logged.
        console.warn("[batch] cancel check failed:", e?.name, e?.message);
      }

      try {
        await requireAccount();
        let tags = [...baseTags];
        let notes = "";

        if (useAiTags || useAiSummary) {
          let pageInfo = null;
          try { pageInfo = await getPageInfoFromTab(tab.id, { withDefuddle: true, expectedUrl: tab.url }); }
          catch (e) { console.warn("batch: cannot extract page content for", tab.url, e.message); }
          await requireAccount();
          if (pageInfo?.pageText) {
            // Per-artifact resolution (audit A8, mirrors the quick-save
            // path): a half-empty combined reply keeps its good half and
            // sends ONLY the empty half to a dedicated single call - the
            // old boolean gate treated any parsed reply as fully handled,
            // silently dropping the missing artifact without counting it.
            let aiTagsResolved = null;
            let summaryResolved = null;
            if (useAiTags && useAiSummary && !s.customTagPrompt?.trim() && !s.customSummaryPrompt?.trim()) {
              try {
                const tCached = await getAICache(tab.url, "tags", s.aiCacheDuration, aiCacheSource, account, s);
                const sCached = await getAICache(tab.url, "summary", s.aiCacheDuration, aiCacheSource, account, s);
                // A16: reuse a cached half; combined call only when both missing.
                if (tCached) aiTagsResolved = tCached;
                if (sCached) summaryResolved = sCached;
                if (aiTagsResolved === null && summaryResolved === null) {
                  const resp = await callAI(s, buildCombinedPrompt(s, tab.title || tab.url, tab.url, pageInfo.pageText, "", pbpRelevantTagsFirst(userTagsTop, tab.title || "", tab.url)));
                  const parsed = parseAICombined(resp, s.aiTagSeparator);
                  if (parsed.tags.length) {
                    aiTagsResolved = s.optRespectTagCase ? parsed.tags.map(tg => resolveTagCase(tg, tagCaseMap)) : parsed.tags;
                    await setAICache(tab.url, "tags", aiTagsResolved, s.aiCacheDuration, aiCacheSource, account, s);
                  }
                  if (parsed.summary) {
                    summaryResolved = parsed.summary;
                    await setAICache(tab.url, "summary", parsed.summary, s.aiCacheDuration, aiCacheSource, account, s);
                  }
                }
              } catch (e) { console.warn("batch AI combined failed, falling back:", tab.url, e.message); }
            }
            {
              const aiJobs = [];
              if (useAiTags && aiTagsResolved === null) aiJobs.push((async () => {
                try {
                  const cached = await getAICache(tab.url, "tags", s.aiCacheDuration, aiCacheSource, account, s);
                  if (cached) return { type: "tags", result: cached };
                  const prompt = buildTagPrompt(s, tab.title || tab.url, tab.url, pageInfo.pageText, "", pbpRelevantTagsFirst(userTagsTop, tab.title || "", tab.url));
                  const resp = await callAI(s, prompt);
                  const rawTags = refineTags(parseAITags(resp, s.aiTagSeparator), { cap: AI_TAG_CAP, separator: s.aiTagSeparator });
                  const aiTags = s.optRespectTagCase ? rawTags.map(tg => resolveTagCase(tg, tagCaseMap)) : rawTags;
                  await setAICache(tab.url, "tags", aiTags, s.aiCacheDuration, aiCacheSource, account, s);
                  return { type: "tags", result: aiTags };
                } catch (e) { console.warn("batch AI tags failed:", tab.url, e.message); aiFailed++; return null; }
              })());
              if (useAiSummary && summaryResolved === null) aiJobs.push((async () => {
                try {
                  const cached = await getAICache(tab.url, "summary", s.aiCacheDuration, aiCacheSource, account, s);
                  if (cached) return { type: "summary", result: cached };
                  const prompt = buildSummaryPrompt(s, tab.title || tab.url, tab.url, pageInfo.pageText, "");
                  const summary = await callAI(s, prompt);
                  await setAICache(tab.url, "summary", summary, s.aiCacheDuration, aiCacheSource, account, s);
                  return { type: "summary", result: summary };
                } catch (e) { console.warn("batch AI summary failed:", tab.url, e.message); aiFailed++; return null; }
              })());
              if (aiTagsResolved) tags = [...tags, ...aiTagsResolved];
              if (summaryResolved) notes = `[AI Summary]\n<blockquote>${escapeForExtended(summaryResolved)}</blockquote>`;
              const results = await Promise.all(aiJobs);
              for (const r of results) {
                if (!r) continue;
                if (r.type === "tags") tags = [...tags, ...r.result];
                if (r.type === "summary") notes = `[AI Summary]\n<blockquote>${escapeForExtended(r.result)}</blockquote>`;
              }
            }
          } else {
            // audit A12: extraction failed or came back empty (tab closed,
            // navigation, injection failure) - the bookmark still saves
            // bare, but the REQUESTED artifacts were not produced. Count
            // them per artifact (the same unit the single-job catches
            // use) so the batch summary's AI-failed figure stays truthful
            // instead of reporting 0.
            aiFailed += (useAiTags ? 1 : 0) + (useAiSummary ? 1 : 0);
          }
        }

        const dedupedTags = [...new Set(tags.map(tg => tg.toLowerCase()))].map(lower => tags.find(tg => tg.toLowerCase() === lower));
        const isPrivate = pbpEffectivePrivate(s, { incognito: tab.incognito });
        await requireAccount();
        const result = await submitSaveIntent({
          mode: s.batchSkipExisting ? "skip" : "merge",
          url: tab.url,
          title: tab.title || tab.url,
          notes,
          tags: dedupedTags.join(" "),
          private: isPrivate,
          toread: s.optReadlaterDefault ? true : undefined,
          archive: s.waybackArchiveBatch ? undefined : false,
        }, { deferBadge: true, expectedAccount: account });
        if (result.reason === "account_changed") {
          const error = new Error("account_changed");
          error.code = "account_changed";
          throw error;
        }
        if (result.status === "saved") saved++;
        else if (result.status === "queued") queued++;
        else if (result.status === "skipped") skipped++;
        else if (result.reason === "too_long") tooLong++;
        else failed++;
      } catch (e) {
        if (e?.code === "account_changed") throw e;
        failed++;
      } finally {
        processed = i + 1;
        await _writeBatchProgress({ running: true, done: false, error: null, ...base() });
        // Idempotent checkpoint: cursor + counts land after every item, so an
        // interrupted worker resumes at the next unprocessed tab instead of
        // reporting the whole run dead (roadmap #34).
        try { await chrome.storage.local.set({ batch_job: jobRecord() }); }
        catch (e) { console.warn("[batch] checkpoint failed:", e?.name, e?.message); }
      }
    }

    if (saved > 0) await updateBadge().catch(() => {});

    await clearJob();
    await clearCancel();
    await _writeBatchProgress({ running: false, done: true, error: null, ...base() });
    const tagsSuffix = baseTags.length ? t("batchTaggedSuffix", baseTags.join(", ")) : "";
    const skippedMsg = skipped > 0 ? t("batchSkipped", String(skipped)) : "";
    const tooLongMsg = tooLong > 0 ? t("batchTooLong", String(tooLong)) : "";
    const queuedMsg = queued > 0 ? ` · ${t("offlineQueued", String(queued))}` : "";
    if (saved > 0 || queued > 0 || failed > 0 || tooLong > 0) {
      const message = t("batchDone", String(saved), String(failed)) + skippedMsg + tooLongMsg + queuedMsg + tagsSuffix;
      if (saved > 0 || queued > 0) {
        const title = saved > 0 ? t("bgBatchSaved") : t("bgQueuedOffline");
        showNotification("batch-saved", title, message, "batchSave");
      } else {
        // Nothing landed at all (a server-revoked token answers 401 -> not
        // retryable -> not even queued). Batch is built to outlive the popup,
        // and the popup only replays a terminal record for BATCH_STALE_TTL, so
        // without this the whole run vanishes without a word. Report it in the
        // error family the other terminal batch failures use — never as a
        // "Saved 0 bookmarks" success. An all-SKIPPED run stays silent: nothing
        // failed there, the bookmarks were already saved.
        showNotification("batch-error", t("bgBatchSaved"), message, "error");
      }
    }
  } catch (e) {
    // A thrown error is a REAL terminal state (account switch, unexpected
    // failure) — never resumable. Drop the job so the sweep cannot revive it.
    await clearJob();
    await clearCancel();
    await _writeBatchProgress({ running: false, done: true, error: e.message, ...base() });
    if (e?.code !== "account_changed") showNotification("batch-error", t("bgBatchSaved"), e.message, "error");
  } finally {
    _batchRunning = false;
  }
}

// ===================== Tab Set 保存 =====================
async function handleSaveTabSet(tabsData) {
  try {
    // Tab Set uses pinboard.in web API (cookie auth, not API token)
    const result = { browser: "chrome", windows: [tabsData.map(t => ({ title: t.title, url: t.url }))] };
    const formData = new FormData();
    formData.append("data", JSON.stringify(result));
    // Deadline (same 20s tier as md-export-send): the caller is fire-and-forget
    // and the popup re-enables its button on a 2s timer, so these notifications
    // are the user's only feedback — a hung socket would silence both of them
    // and keep the worker alive until Chrome's own network timeout. AbortError
    // lands in the catch below as an ordinary tabset-error.
    const resp = await fetch("https://pinboard.in/tabs/save/", {
      method: "POST", body: formData, credentials: "include",
      signal: AbortSignal.timeout(20000),
    });
    if (resp.ok) {
      // /tabs/save/ only STAGES the tabs — Pinboard requires the user to click
      // "Save" on /tabs/show/ to actually bookmark them. So we open that page and
      // the notification says "one more step", not "saved" (keys kept for compat).
      chrome.tabs.create({ url: "https://pinboard.in/tabs/show/" });
      showNotification("tabset-saved", t("bgTabSetSaved"), t("bgTabsSavedCount", String(tabsData.length)), "tabSet");
    } else {
      const hint = resp.status === 401 || resp.status === 403
        ? t("bgLoginRequired") : `HTTP ${resp.status}`;
      showNotification("tabset-error", t("bgTabSetFailed"), hint, "error");
    }
  } catch (e) {
    showNotification("tabset-error", t("bgTabSetFailed"), e.message, "error");
  }
}

// ---- Storage change listener ----
chrome.storage.onChanged.addListener((changes) => {
  if (changes.optShowBadge) {
    // The event can come from an inactive storage area. Resolve the effective
    // setting instead of trusting this area's candidate value.
    updateBadge().catch(() => {});
    _syncBadgeAlarm(); // create/clear the 15-min network poll to match
  }
});

// ---- Markdown preview via keyboard shortcut (no popup) ----
// Self-contained extractor injected into the active tab's ISOLATED world.
// Mirrors popup.js extractLocalMarkdown's inner func: per-site rule first,
// then Defuddle. Returns HTML only — md-preview.html runs Turndown itself.
function extractPageForMarkdown() {
  // Embedded-frame candidate (2026-08-25): app shells such as claude.ai
  // artifacts keep the whole article in one large cross-origin iframe, so
  // the top document has nothing to extract. Report the frame's ORIGIN only
  // (no path, no query) so the reader can offer a one-click, user-gesture
  // grant for exactly that origin and re-run extraction in every frame.
  // Sandboxed frames without allow-same-origin have an opaque origin no
  // grant can name, so they are not candidates. The src is page-controlled,
  // so the candidate is only ever a SUGGESTION the user confirms in Chrome's
  // own prompt (Codex 2026-08-26): srcdoc frames (src is decorative there),
  // hidden frames and off-screen frames are excluded, and the 40% is measured
  // on the frame's VISIBLE intersection with the viewport; the grant is then
  // bound to the frame's real origin by the Service Worker, never to this src.
  function dominantFrameOrigin() {
    try {
      const vw = Math.max(1, window.innerWidth), vh = Math.max(1, window.innerHeight);
      let best = null, bestArea = 0;
      for (const f of document.querySelectorAll("iframe")) {
        if (f.hasAttribute("srcdoc")) continue;
        let origin;
        try { origin = new URL(f.src, location.href).origin; } catch (_) { continue; }
        if (!/^https:\/\//.test(origin) || origin === location.origin) continue;
        const sb = f.getAttribute("sandbox");
        if (sb !== null && !/\ballow-same-origin\b/.test(sb)) continue;
        // Hidden by itself OR by any ancestor: opacity does not inherit, so a
        // frame under an opacity:0 wrapper still reports opacity 1 on its own
        // computed style (Codex 2026-08-26).
        let hidden = false;
        for (let n = f; n && !hidden; n = n.parentElement) {
          const cs = getComputedStyle(n);
          hidden = cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0;
        }
        if (hidden) continue;
        const r = f.getBoundingClientRect();
        const w = Math.min(r.right, vw) - Math.max(r.left, 0);
        const h = Math.min(r.bottom, vh) - Math.max(r.top, 0);
        const area = Math.max(0, w) * Math.max(0, h);
        if (area > bestArea) { bestArea = area; best = origin; }
      }
      return best && bestArea >= 0.4 * vw * vh ? best : "";
    } catch (_) { return ""; }
  }
  // "Nothing here" is judged on TEXT, not on the HTML string: Defuddle hands
  // back the main container even when all it holds is an <iframe> (claude.ai
  // artifact pages, device 2026-08-26), and a truthy-string gate let that empty
  // shell pass as an article, so the frame offer below never appeared.
  // Media-only articles (a comic, a gallery) stay content.
  function extractionLooksEmpty(html) {
    const s = String(html || "");
    if (/<(img|picture|video|audio|svg|canvas|object|embed|math)\b/i.test(s)) return false;
    return !/\S/.test(s.replace(/<[^>]*>/g, " ").replace(/&(nbsp|#160|#xa0);/gi, " "));
  }
  try {
    if (typeof applySiteRule === "function") {
      const hit = applySiteRule(document, location.href);
      if (hit && hit.contentHtml) {
        // E1: normalize lazy-load img placeholders (data-src/srcset) on an
        // INERT-document div -- a div from the LIVE document fetches every
        // <img> it holds even while detached, and fixLazyImages promotes
        // data-src onto src first. Mirrors site-rules.js's inertDoc(), which
        // this serialized page function cannot reach (closure-free by
        // contract). pbpNormalizeLazyImages comes from site-rules.js, already
        // injected by extractForPreview before this function runs
        // (chrome.scripting.executeScript calls).
        const div = document.implementation.createHTMLDocument("").createElement("div");
        div.innerHTML = hit.contentHtml;
        if (typeof pbpNormalizeLazyImages === "function") pbpNormalizeLazyImages(div, location.href);
        if (typeof pbpUpgradeSrcsetImages === "function") pbpUpgradeSrcsetImages(div, location.href);
        return { contentHtml: div.innerHTML, title: hit.title || document.title, url: location.href, math: !!hit.math, forum: !!hit.forum };
      }
    }
  } catch (_) { /* fall through to Defuddle */ }
  if (typeof Defuddle === "undefined") return { error: "Defuddle not available" };
  const OriginalURL = window.URL;
  if (!window.__pp_urlShimInstalled) {
    const SafeURL = function (u, b) {
      try { return b !== undefined ? new OriginalURL(u, b) : new OriginalURL(u); }
      catch (_) { return new OriginalURL("about:blank"); }
    };
    SafeURL.prototype = OriginalURL.prototype;
    try { SafeURL.createObjectURL = OriginalURL.createObjectURL.bind(OriginalURL); } catch (_) {}
    try { SafeURL.revokeObjectURL = OriginalURL.revokeObjectURL.bind(OriginalURL); } catch (_) {}
    try { SafeURL.canParse = OriginalURL.canParse && OriginalURL.canParse.bind(OriginalURL); } catch (_) {}
    window.URL = SafeURL;
    window.__pp_urlShimInstalled = true;
  }
  try {
    const clone = document.cloneNode(true);
    // E1: normalize lazy-load img placeholders on the CLONE before Defuddle
    // parses it -- the live DOM is never touched.
    if (typeof pbpNormalizeLazyImages === "function") pbpNormalizeLazyImages(clone, location.href);
    if (typeof pbpUpgradeSrcsetImages === "function") pbpUpgradeSrcsetImages(clone, location.href);
    if (typeof pbpPreDefuddleNormalize === "function") pbpPreDefuddleNormalize(clone);
    const _origCE = console.error;
    console.error = (...a) => { if (!String(a[0]).startsWith("Defuddle:")) _origCE.apply(console, a); };
    let result;
    try { result = new Defuddle(clone).parse(); } finally { console.error = _origCE; }
    if (!result?.content || extractionLooksEmpty(result.content)) return { error: "No content extracted", frameOrigin: dominantFrameOrigin() };
    // X4: mirrors popup.js's extractLocalMarkdown -- keep Defuddle's
    // author/published/site/image alongside content/title/url/math.
    return {
      contentHtml: result.content, title: result.title || document.title, url: location.href,
      math: !!document.querySelector("math"),
      author: result.author || "", published: result.published || "", site: result.site || "", image: result.image || ""
    };
  } catch (e) { return { error: e.message }; }
}

// Unified extraction service for the preview. Shared by the keyboard-shortcut
// opener and the in-preview engine toggle (reextractMarkdown). Returns the
// md_preview_data payload fields (minus tags/description/tabId, added by caller)
// or { error }. engine is "local" (Defuddle) or "jina".
async function extractForPreview({ tabId, url, engine, sourceTabUrl, frame, frameOrigin }) {
  if (engine === "jina") {
    // Fresh read — do NOT use loadSettings() (its _settingsCache can be stale
    // when the user edits settings while the SW is warm). getSettingsStorage()
    // returns RAW (obfuscated) settings, so deobfuscate the key exactly once.
    const raw = await pbpReadSettingsWithSecrets({
      jinaApiKey: SETTINGS_DEFAULTS.jinaApiKey,
      aiCacheDuration: SETTINGS_DEFAULTS.aiCacheDuration
    });
    const key = raw.jinaApiKey ? deobfuscateKey(raw.jinaApiKey) : "";
    const r = await fetchJinaMarkdown(url, { apiKey: key, cacheDuration: raw.aiCacheDuration });
    if (r.error) return { error: r.error };
    if (!r.markdown || !r.markdown.trim()) return { error: "empty" };
    return {
      source: "jina", markdown: r.markdown, contentHtml: "",
      title: r.title || "", url: r.url || url,
      tokens: r.tokens || 0, hasApiKey: !!key, math: false,
      // X4: published is jina.js's best-effort field; author/site/image have no
      // Jina counterpart. site's hostname fallback happens at meta-build time in
      // buildMeta() (design spec 4.2), not here -- this layer only transports
      // what the engine actually gave us.
      published: r.published || ""
    };
  }
  // engine === "local" (Defuddle)
  if (!tabId) return { error: "tab_unavailable" };
  // Weak-handle guard: the stored tabId may now host a DIFFERENT page (user
  // navigated, or the id was reused). activeTab can persist across same-origin
  // navigation, so a successful inject could silently extract the wrong page.
  // Compared against sourceTabUrl when present (hotlink round): `url` can be
  // Jina's canonicalized d.url, which never equals the tab's literal URL --
  // without the split, one Jina pass bricked the switch back to the local
  // engine with a spurious tab_navigated (Codex review).
  // _cbTabsGet (ai.js, loaded via importScripts): callback form consumes
  // lastError inside the callback — the promise form leaks "Unchecked
  // runtime.lastError: No tab with id" when the tab closes mid-call, which is
  // exactly this path's high-frequency scenario (user closes the source tab
  // while switching engines / authorizing a frame).
  const live = await _cbTabsGet(tabId);
  if (!live) return { error: "tab_unavailable" };
  if (!live.url || live.url !== (sourceTabUrl || url)) return { error: "tab_navigated" };
  // Defuddle is required; injection failure (tab closed / CSP / no permission) → degrade.
  // `frame` (2026-08-25): the reader asked for the embedded-frame pass after the
  // user granted that frame's exact origin -- inject into every frame Chrome
  // lets us reach (frames without a host grant are silently skipped by the
  // platform) and take the first frame that yields an article, preferring
  // the candidate origin the top document reported. Never automatic: the top
  // frame alone is the default, and the grant itself only ever comes from the
  // reader's button (permissions.request needs that user gesture anyway).
  let target = { tabId };
  if (frame === true) {
    // Locate the frames that really ARE the granted origin first (a cheap
    // probe returns each reachable frame's own origin; frames we hold no
    // grant for are skipped by Chrome), then inject only into those. The
    // page-reported src decides nothing past the prompt (Codex 2026-08-26):
    // no matching frame, or no article in it, is "nothing here" -- never a
    // fallback to some other frame.
    if (!frameOrigin) return { error: "empty" };
    const probe = await _cbExecuteScript({ target: { tabId, allFrames: true }, func: () => location.origin });
    const frameIds = (Array.isArray(probe) ? probe : [])
      .filter((r) => r && r.frameId !== 0 && r.result === frameOrigin).map((r) => r.frameId);
    if (!frameIds.length) return { error: "empty" };
    target = { tabId, frameIds };
  }
  const injected = await _cbExecuteScript({ target, files: ["vendor/defuddle.js"] });
  if (!injected) return { error: "tab_unavailable" };
  // site-rules.js is OPTIONAL — ignore failure so a broken rule can't mask Defuddle.
  await _cbExecuteScript({ target, files: ["site-rules.js"] });
  const results = await _cbExecuteScript({ target, func: extractPageForMarkdown });
  const top = results && results[0] && results[0].result;
  let out = top;
  let frameBase = "";
  if (frame === true && Array.isArray(results)) {
    const sameOrigin = (u) => { try { return new URL(u).origin === frameOrigin; } catch (_) { return false; } };
    const pick = results.find((r) => r && r.result && r.result.contentHtml && sameOrigin(r.result.url));
    out = pick ? pick.result : null;
    if (pick) frameBase = pick.result.url; // relative links resolve against the FRAME, not the top page
  }
  if (!out || out.error || !out.contentHtml) {
    // Defuddle's own "nothing here" string is the same product state as a
    // missing result: report it as `empty` so the reader shows the no-content
    // copy (and the frame offer) instead of the generic failure text.
    const raw = out && out.error;
    const err = { error: (raw && raw !== "No content extracted") ? raw : "empty" };
    // Surface the candidate only on a plain "nothing here" -- a real error keeps its own text.
    if (top && typeof top.frameOrigin === "string" && top.frameOrigin && frame !== true) err.frameOrigin = top.frameOrigin;
    return err;
  }
  return {
    source: "local", markdown: "", contentHtml: out.contentHtml,
    title: out.title || "", url: url, // prefer caller url over extractor's
    baseUrl: frameBase || url,        // frame pass: the frame's own URL for relative links
    tokens: 0, hasApiKey: false, math: !!out.math, forum: !!out.forum,
    // X4: forward the four metadata fields extractPageForMarkdown's Defuddle
    // branch now keeps. The reextractMarkdown handler's `...out` spread
    // (background.js ~943-953) forwards these automatically into storage --
    // no separate edit needed there.
    author: out.author || "", published: out.published || "", site: out.site || "", image: out.image || ""
  };
}

async function openMarkdownPreviewFromShortcut() {
  pbpSweepPreviewOrphans(); // best-effort: clear closed-preview residue before adding one
  let tab;
  try {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  } catch (_) { /* fall through to the guard below */ }
  if (!tab?.id || !tab.url || !tab.url.startsWith("http")) {
    showNotification("mdpv-error", t("bgMdPreviewFailed"), t("bgMdPreviewNoContent"), "error");
    return;
  }
  // Open the preview INSTANTLY with a pending placeholder so the shortcut feels
  // responsive; the preview page drives extraction via reextractMarkdown (the same
  // path as the in-preview toggle). Follow the aiContentSource setting (fresh read).
  const [raw, auth] = await Promise.all([
    (await getSettingsStorage()).get({ aiContentSource: SETTINGS_DEFAULTS.aiContentSource }),
    getCurrentPinboardAuth().catch(() => ({ account: "" })),
  ]);
  const engine = raw.aiContentSource === "jina" ? "jina" : "local";
  // Per-open token key so two shortcut opens (or a shortcut + a popup Preview)
  // never share one storage slot and clobber each other before their tabs read.
  const k = crypto.randomUUID();
  try {
    await chrome.storage.local.set({
      ["md_preview_data_" + k]: {
        pending: true, engine, source: engine,
        tabId: tab.id, url: tab.url, baseUrl: tab.url, sourceTabUrl: tab.url, title: tab.title || "",
        account: auth.account || "", tags: [], description: "", ts: Date.now() // sweep grace (see pbpSweepPreviewOrphans)
      }
    });
    // video=1 (non-sensitive) lets md-preview-theme-early.js resolve the
    // "open video pages in dark" default before first paint; the page itself
    // still decides video-mode from the payload (theme model 2026-08-25).
    const videoQ = (typeof pbpVideoDetect === "function" && pbpVideoDetect(tab.url)) ? "&video=1" : "";
    await chrome.tabs.create({ url: "md-preview.html?k=" + k + videoQ });
  } catch (e) {
    // storage.local.set can reject on quota; tabs.create can reject too. Surface
    // it instead of silently opening nothing (aligns with the read_later/quick_save
    // failure notifications in the onCommand listener below).
    const quota = /quota/i.test((e && e.message) || "");
    showNotification(
      "mdpv-error",
      t("bgMdPreviewFailed"),
      quota ? t("bgMdPreviewTooLarge") : ((e && e.message) || t("bgMdPreviewNoContent")),
      "error"
    );
  }
}

// ===================== Keyboard Shortcuts =====================
chrome.commands.onCommand.addListener(async (command) => {
  if (command === "markdown_preview") {
    await openMarkdownPreviewFromShortcut();
    return;
  }
  if (command === "save_tabset") {
    try {
      const tabs = await chrome.tabs.query({ currentWindow: true });
      const tabsData = tabs
        .filter(t => t.url && /^https?:/i.test(t.url))
        .map(t => ({ title: t.title || t.url, url: t.url }));
      if (!tabsData.length) {
        showNotification("tabset-error", t("bgTabSetFailed"), t("batchNoValidTabs"), "error");
        return;
      }
      await handleSaveTabSet(tabsData);
    } catch (e) {
      showNotification("tabset-error", t("bgTabSetFailed"), e.message, "error");
    }
    return;
  }
  const commandConfig = {
    read_later: { prefix: "rl", toread: true, notifyId: "rl", notifyTitle: () => t("bgReadLater"), notifyCategory: "readLater", errorTitle: () => t("bgReadLaterFailed") },
    quick_save: { prefix: "qs", toread: false, notifyId: "qs", notifyTitle: () => t("bgQuickSaved"), notifyCategory: "quickSave", errorTitle: () => t("bgQuickSaveFailed") },
  };
  const cfg = commandConfig[command];
  if (!cfg) return;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url || !tab.url.startsWith("http")) {
      showNotification(`${cfg.notifyId}-error`, t("bgCannotSave"), t("bgCannotBookmark"), "error");
      return;
    }
    const s = await loadSettings();
    const overrides = resolvePrefixSettings(s, cfg.prefix);
    await saveFromBackground({
      url: tab.url, title: tab.title || tab.url, tab,
      settingsOverrides: overrides,
      toread: cfg.toread,
      notifyId: cfg.notifyId,
      notifyTitle: cfg.notifyTitle(),
      notifyCategory: cfg.notifyCategory
    });
  } catch (e) {
    showNotification(`${cfg.notifyId}-error`, cfg.errorTitle(), e.message, "error");
  }
});
