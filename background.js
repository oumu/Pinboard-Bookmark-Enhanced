// ============================================================
// Pinboard Bookmark Plus - Background Service Worker (v4.0)
// ============================================================

importScripts("i18n.js", "shared.js", "ai.js");

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

// URL 状态缓存
const statusCache = new Map();
const CACHE_TTL = 5 * 60 * 1000;
const MAX_CACHE_SIZE = 500;

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

// ---- P3: Debounce + dedup for tab switch ----
let _checkDebounceTimer = null;
const _pendingChecks = new Map(); // url -> Promise

async function debouncedCheck(tabId, url) {
  if (!url || !url.startsWith("http")) {
    setIcon(tabId, false);
    return;
  }
  // Check if bookmark status icon is enabled
  try {
    const { optCheckBookmarkStatus } = await chrome.storage.sync.get({ optCheckBookmarkStatus: true });
    if (!optCheckBookmarkStatus) return;
  } catch (_) {}
  // Dedup: if same URL is already being checked, reuse promise
  if (_pendingChecks.has(url)) {
    const bookmarked = await _pendingChecks.get(url);
    setIcon(tabId, bookmarked);
    return;
  }
  const promise = checkBookmarked(url);
  _pendingChecks.set(url, promise);
  try {
    const bookmarked = await promise;
    setIcon(tabId, bookmarked);
  } finally {
    _pendingChecks.delete(url);
  }
}

// ---- Load settings with deobfuscation ----
async function loadSettings() {
  const s = await chrome.storage.sync.get(SETTINGS_DEFAULTS);
  deobfuscateSettings(s);
  return s;
}

// F7: Track recent saves for undo via notification button
const _recentSaves = new Map(); // notificationId -> { url, token }

// ---- Show Chrome notification (with category filter) ----
async function showNotification(id, title, message, category, undoInfo) {
  try {
    const cats = await chrome.storage.sync.get({
      notifyQuickSave: true, notifyReadLater: true,
      notifyTabSet: true, notifyBatchSave: true, notifyErrors: true
    });
    if (category === "quickSave" && !cats.notifyQuickSave) return;
    if (category === "readLater" && !cats.notifyReadLater) return;
    if (category === "tabSet" && !cats.notifyTabSet) return;
    if (category === "batchSave" && !cats.notifyBatchSave) return;
    if (category === "error" && !cats.notifyErrors) return;
  } catch (_) {}
  const notifId = id + "-" + Date.now();
  const opts = { type: "basic", iconUrl: "icons/pin-default-48.png", title, message };
  if (undoInfo) {
    opts.buttons = [{ title: t("bgUndo") }];
    _recentSaves.set(notifId, undoInfo);
    // Auto-expire undo after 30s
    setTimeout(() => _recentSaves.delete(notifId), 30000);
  }
  chrome.notifications.create(notifId, opts);
}

// F7: Handle undo button click on notifications
chrome.notifications.onButtonClicked.addListener(async (notifId, btnIndex) => {
  if (btnIndex !== 0) return;
  const info = _recentSaves.get(notifId);
  if (!info) return;
  _recentSaves.delete(notifId);
  try {
    const resp = await pinboardFetch(`https://api.pinboard.in/v1/posts/delete?auth_token=${info.token}&url=${encodeURIComponent(info.url)}&format=json`);
    const data = await resp.json();
    if (data.result_code === "done") {
      statusCache.set(info.url, { bookmarked: false, timestamp: Date.now() });
      showNotification("undo-done", t("bgUndone"), t("bgBookmarkRemoved"));
    }
  } catch (_) {}
});

// ---- 设置图标 ----
async function setIcon(tabId, bookmarked) {
  try {
    await chrome.action.setIcon({ tabId, path: bookmarked ? ICONS_BOOKMARKED : ICONS_DEFAULT });
  } catch (_) {}
}

// ---- 检查 URL 是否已收藏 (uses cached token, direct fetch for latency) ----
async function checkBookmarked(url) {
  const cached = statusCache.get(url);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) return cached.bookmarked;
  try {
    const token = await getCachedToken();
    if (!token) return false;
    const resp = await pinboardFetch(`https://api.pinboard.in/v1/posts/get?auth_token=${token}&format=json&url=${encodeURIComponent(url)}`);
    if (!resp.ok) return false;
    const data = await resp.json();
    const posts = data.posts || [];
    const bookmarked = posts.length > 0;
    statusCache.set(url, { bookmarked, timestamp: Date.now(), posts });
    cleanupStatusCache();
    return bookmarked;
  } catch (e) {
    console.error("checkBookmarked error:", e);
    return false;
  }
}

// ---- Badge: unread count ----
async function updateBadge() {
  const s = await loadSettings();
  if (!s.optShowBadge || !s.pinboardToken) {
    chrome.action.setBadgeText({ text: "" });
    return;
  }
  try {
    const resp = await pinboardFetch(`https://api.pinboard.in/v1/posts/all?auth_token=${s.pinboardToken}&format=json&toread=yes&results=100`);
    const data = await resp.json();
    const count = Array.isArray(data) ? data.length : 0;
    chrome.action.setBadgeText({ text: count > 0 ? String(count > 99 ? "99+" : count) : "" });
    chrome.action.setBadgeBackgroundColor({ color: "#4477bb" });
  } catch (_) {}
}

// ---- F3: Offline queue ----
async function enqueueOfflineSave(params) {
  const { offlineQueue = [] } = await chrome.storage.local.get("offlineQueue");
  offlineQueue.push({ ...params, queuedAt: Date.now() });
  await chrome.storage.local.set({ offlineQueue });
}

async function processOfflineQueue() {
  const { offlineQueue = [] } = await chrome.storage.local.get("offlineQueue");
  if (!offlineQueue.length) return;
  const remaining = [];
  for (const item of offlineQueue) {
    try {
      const token = deobfuscateKey(item.token);
      const apiUrl = `https://api.pinboard.in/v1/posts/add?auth_token=${token}&format=json` +
        `&url=${encodeURIComponent(item.url)}&description=${encodeURIComponent(item.title)}` +
        `&extended=${encodeURIComponent(item.notes)}&tags=${encodeURIComponent(item.tags)}` +
        (item.toread ? "&toread=yes" : "") + "&replace=yes";
      const resp = await pinboardFetch(apiUrl);
      const data = await resp.json();
      if (data.result_code !== "done") {
        remaining.push(item); // keep for retry
      } else {
        statusCache.set(item.url, { bookmarked: true, timestamp: Date.now() });
      }
    } catch (_) {
      remaining.push(item); // network still down, keep
    }
  }
  await chrome.storage.local.set({ offlineQueue: remaining });
}

// ---- P1: Shared save function ----
async function saveFromBackground({ url, title, tab, settingsOverrides, toread, notifyId, notifyTitle, notifyCategory }) {
  const s = await loadSettings();
  // Apply settings overrides (prefix-resolved keys)
  if (settingsOverrides) Object.assign(s, settingsOverrides);

  if (!s.pinboardToken) {
    showNotification(notifyId + "-error", t("bgNotLoggedIn"), t("bgSetToken"), "error");
    return;
  }

  // Extract page info if tab available
  let pageInfo = null;
  if (tab?.id) {
    try { pageInfo = await getPageInfoFromTab(tab.id); } catch (_) {}
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

  // AI features (parallel)
  const aiPromises = [];
  if (pageInfo?.pageText && hasAIKey(s)) {
    if (s._aiTags) {
      aiPromises.push(
        (async () => {
          try {
            const cached = await getAICache(url, "tags", s.aiCacheDuration);
            if (cached) return { type: "tags", result: cached };
            const prompt = buildTagPrompt(s, title, url, pageInfo.pageText, notes, []);
            const resp = await callAI(s, prompt);
            const aiTags = parseAITags(resp, s.aiTagSeparator);
            await setAICache(url, "tags", aiTags, s.aiCacheDuration);
            return { type: "tags", result: aiTags };
          } catch (e) { console.warn(`${notifyCategory} AI tags failed:`, e.message); return null; }
        })()
      );
    }
    if (s._aiSummary) {
      aiPromises.push(
        (async () => {
          try {
            const cached = await getAICache(url, "summary", s.aiCacheDuration);
            if (cached) return { type: "summary", result: cached };
            const prompt = buildSummaryPrompt(s, title, url, pageInfo.pageText, notes);
            const summary = await callAI(s, prompt);
            await setAICache(url, "summary", summary, s.aiCacheDuration);
            return { type: "summary", result: summary };
          } catch (e) { console.warn(`${notifyCategory} AI summary failed:`, e.message); return null; }
        })()
      );
    }
  }

  // Wait for AI results
  const aiResults = await Promise.all(aiPromises);
  for (const r of aiResults) {
    if (!r) continue;
    if (r.type === "tags") tags = [...tags, ...r.result];
    if (r.type === "summary") {
      const wrapped = `[AI Summary]\n<blockquote>${r.result}</blockquote>`;
      notes = notes ? notes + "\n\n" + wrapped : wrapped;
    }
  }

  // Save bookmark via pinboardFetch (rate-limited)
  const tagsStr = tags.join(" ");
  const apiUrl = `https://api.pinboard.in/v1/posts/add?auth_token=${s.pinboardToken}&format=json` +
    `&url=${encodeURIComponent(url)}&description=${encodeURIComponent(title)}` +
    `&extended=${encodeURIComponent(notes)}&tags=${encodeURIComponent(tagsStr)}` +
    (toread ? "&toread=yes" : "") + "&replace=yes";

  try {
    const resp = await pinboardFetch(apiUrl);
    const data = await resp.json();

    if (data.result_code === "done") {
      statusCache.set(url, { bookmarked: true, timestamp: Date.now() });
      if (tab?.id) setIcon(tab.id, true);
      showNotification(notifyId + "-saved", notifyTitle, t("bgTitleSaved", title.substring(0, 60)), notifyCategory, { url, token: s.pinboardToken });
      // Opportunistic: process offline queue after successful save
      processOfflineQueue().catch(() => {});
      // Update badge if toread
      if (toread) updateBadge().catch(() => {});
    } else {
      showNotification(notifyId + "-error", t("bgSaveFailed"), data.result_code || "Unknown error", "error");
    }
  } catch (e) {
    // Network error — queue for offline retry if enabled
    if (s.offlineQueueEnabled) {
      await enqueueOfflineSave({ url, title, notes, tags: tagsStr, toread: !!toread, token: obfuscateKey(s.pinboardToken) });
      showNotification(notifyId + "-queued", t("bgQueuedOffline"), t("bgTitleQueued", title.substring(0, 60)), notifyCategory);
    } else {
      showNotification(notifyId + "-error", t("bgNetworkError"), e.message, "error");
    }
  }
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

// ---- 标签页激活/更新时刷新图标 (P3: debounced + deduped) ----
chrome.tabs.onActivated.addListener(({ tabId }) => {
  clearTimeout(_checkDebounceTimer);
  _checkDebounceTimer = setTimeout(async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id === tabId && tab.url) await debouncedCheck(tabId, tab.url);
    } catch (_) {}
  }, 150);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url && tab.url.startsWith("http")) {
    clearTimeout(_checkDebounceTimer);
    _checkDebounceTimer = setTimeout(() => {
      debouncedCheck(tabId, tab.url).catch(() => {});
    }, 150);
  }
});

// Keep service worker alive + periodic tasks
chrome.alarms.create("keepalive", { periodInMinutes: 4 });
chrome.alarms.create("ai-cache-cleanup", { periodInMinutes: 60 * 24 }); // daily
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "keepalive") {
    processOfflineQueue().catch(() => {});
    updateBadge().catch(() => {});
  }
  if (alarm.name === "ai-cache-cleanup") {
    cleanupExpiredAICache().catch(() => {});
  }
});

// F1: Cleanup expired AI cache entries
async function cleanupExpiredAICache() {
  try {
    const all = await chrome.storage.local.get(null);
    const { aiCacheDuration = 60 } = await chrome.storage.sync.get({ aiCacheDuration: 60 });
    const maxAge = (aiCacheDuration || 60) * 60 * 1000;
    const now = Date.now();
    const expired = Object.keys(all).filter(k =>
      k.startsWith("ai_cache_") && all[k]?.timestamp && (now - all[k].timestamp > maxAge)
    );
    if (expired.length) await chrome.storage.local.remove(expired);
  } catch (_) {}
}

// Startup: process offline queue + update badge
chrome.runtime.onStartup.addListener(() => {
  processOfflineQueue().catch(() => {});
  updateBadge().catch(() => {});
});

// ---- 监听来自 popup 的消息 ----
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== "object") { sendResponse({ error: "invalid" }); return true; }

  if (message.type === "get_bookmark_data" && message.url) {
    const cached = statusCache.get(message.url);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL && cached.posts) {
      sendResponse({ posts: cached.posts });
    } else {
      sendResponse({ posts: null });
    }
    return true;
  }

  if (message.type === "bookmark_saved" && message.url) {
    statusCache.set(message.url, { bookmarked: true, timestamp: Date.now() });
    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (tab?.id) setIcon(tab.id, true);
    }).catch(() => {});
    // Update badge if toread bookmark was saved
    if (message.toread) updateBadge().catch(() => {});
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === "bookmark_deleted" && message.url) {
    statusCache.set(message.url, { bookmarked: false, timestamp: Date.now() });
    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (tab?.id) setIcon(tab.id, false);
    }).catch(() => {});
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === "show_notification") {
    showNotification(message.id || "popup-notify", message.title || "Pinboard", message.message || "", message.category || "");
    sendResponse({ ok: true });
    return true;
  }

  if (message.action === "saveTabSet" && message.tabsData) {
    handleSaveTabSet(message.tabsData);
    sendResponse({ status: "started" });
    return true;
  }
});

// ===================== Tab Set 保存 =====================
async function handleSaveTabSet(tabsData) {
  try {
    // Tab Set uses pinboard.in web API (cookie auth, not API token)
    const result = { browser: "chrome", windows: [tabsData.map(t => ({ title: t.title, url: t.url }))] };
    const formData = new FormData();
    formData.append("data", JSON.stringify(result));
    const resp = await fetch("https://pinboard.in/tabs/save/", { method: "POST", body: formData, credentials: "include" });
    if (resp.ok) {
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
  if (changes.pinboardToken) _cachedToken = null;
  if (changes.optShowBadge) {
    if (changes.optShowBadge.newValue) updateBadge().catch(() => {});
    else chrome.action.setBadgeText({ text: "" });
  }
});

// ===================== Read Later (keyboard shortcut) =====================
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "read_later") return;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url || !tab.url.startsWith("http")) {
      showNotification("rl-error", t("bgCannotSave"), t("bgCannotBookmark"), "error");
      return;
    }
    const s = await loadSettings();
    const overrides = resolvePrefixSettings(s, "rl");
    await saveFromBackground({
      url: tab.url, title: tab.title || tab.url, tab,
      settingsOverrides: overrides,
      toread: true,
      notifyId: "rl",
      notifyTitle: t("bgReadLater"),
      notifyCategory: "readLater"
    });
  } catch (e) {
    showNotification("rl-error", t("bgReadLaterFailed"), e.message, "error");
  }
});

// ===================== Quick Save (keyboard shortcut) =====================
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "quick_save") return;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url || !tab.url.startsWith("http")) {
      showNotification("qs-error", t("bgCannotSave"), t("bgCannotBookmark"), "error");
      return;
    }
    const s = await loadSettings();
    const overrides = resolvePrefixSettings(s, "qs");
    await saveFromBackground({
      url: tab.url, title: tab.title || tab.url, tab,
      settingsOverrides: overrides,
      toread: false,
      notifyId: "qs",
      notifyTitle: t("bgQuickSaved"),
      notifyCategory: "quickSave"
    });
  } catch (e) {
    showNotification("qs-error", t("bgQuickSaveFailed"), e.message, "error");
  }
});
