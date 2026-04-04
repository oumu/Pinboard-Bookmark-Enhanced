// ============================================================
// Pinboard Bookmark Plus - Background Service Worker (v4.0)
// ============================================================

importScripts("shared.js", "ai.js");

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

// ---- Show Chrome notification (with category filter) ----
async function showNotification(id, title, message, category) {
  try {
    const cats = await chrome.storage.sync.get({
      notifyContextMenu: true, notifyQuickSave: true, notifyReadLater: true,
      notifyTabSet: true, notifyBatchSave: true, notifyErrors: true
    });
    if (category === "contextMenu" && !cats.notifyContextMenu) return;
    if (category === "quickSave" && !cats.notifyQuickSave) return;
    if (category === "readLater" && !cats.notifyReadLater) return;
    if (category === "tabSet" && !cats.notifyTabSet) return;
    if (category === "batchSave" && !cats.notifyBatchSave) return;
    if (category === "error" && !cats.notifyErrors) return;
  } catch (_) {}
  chrome.notifications.create(id + "-" + Date.now(), {
    type: "basic", iconUrl: "icons/pin-default-48.png", title, message
  });
}

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
    const resp = await fetch(`https://api.pinboard.in/v1/posts/get?auth_token=${token}&format=json&url=${encodeURIComponent(url)}`);
    const data = await resp.json();
    const bookmarked = data.posts && data.posts.length > 0;
    statusCache.set(url, { bookmarked, timestamp: Date.now() });
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
    const resp = await fetch(`https://api.pinboard.in/v1/posts/all?auth_token=${s.pinboardToken}&format=json&toread=yes&results=100`);
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
      const apiUrl = `https://api.pinboard.in/v1/posts/add?auth_token=${item.token}&format=json` +
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
    showNotification(notifyId + "-error", "Pinboard: Not logged in", "Set your API token in extension settings.", "error");
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
      showNotification(notifyId + "-saved", notifyTitle, `"${title.substring(0, 60)}" saved.`, notifyCategory);
      // Opportunistic: process offline queue after successful save
      processOfflineQueue().catch(() => {});
      // Update badge if toread
      if (toread) updateBadge().catch(() => {});
    } else {
      showNotification(notifyId + "-error", "Pinboard: Save failed", data.result_code || "Unknown error", "error");
    }
  } catch (e) {
    // Network error — queue for offline retry if enabled
    if (s.offlineQueueEnabled) {
      await enqueueOfflineSave({ url, title, notes, tags: tagsStr, toread: !!toread, token: s.pinboardToken });
      showNotification(notifyId + "-queued", "Pinboard: Queued offline", `"${title.substring(0, 60)}" will be saved when online.`, notifyCategory);
    } else {
      showNotification(notifyId + "-error", "Pinboard: Network error", e.message, "error");
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
      const tab = await chrome.tabs.get(tabId);
      await debouncedCheck(tabId, tab.url);
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
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "keepalive") {
    processOfflineQueue().catch(() => {});
    updateBadge().catch(() => {});
  }
});

// Startup: process offline queue + update badge
chrome.runtime.onStartup.addListener(() => {
  processOfflineQueue().catch(() => {});
  updateBadge().catch(() => {});
});

// ---- 监听来自 popup 的消息 ----
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== "object") { sendResponse({ error: "invalid" }); return true; }

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
    const result = { browser: "chrome", windows: [tabsData.map(t => ({ title: t.title, url: t.url }))] };
    const formData = new FormData();
    formData.append("data", JSON.stringify(result));
    const resp = await fetch("https://pinboard.in/tabs/save/", { method: "POST", body: formData, credentials: "include" });
    if (resp.ok) {
      chrome.tabs.create({ url: "https://pinboard.in/tabs/show/" });
      showNotification("tabset-saved", "Pinboard: Tab Set Saved!", `${tabsData.length} tabs saved.`, "tabSet");
    } else {
      const hint = resp.status === 401 || resp.status === 403
        ? "Please log in to pinboard.in in your browser first." : `HTTP ${resp.status}`;
      showNotification("tabset-error", "Pinboard: Tab Set Failed", hint, "error");
    }
  } catch (e) {
    showNotification("tabset-error", "Pinboard: Tab Set Failed", e.message, "error");
  }
}

// ===================== Context Menu =====================
async function setupContextMenu() {
  await chrome.contextMenus.removeAll();
  const s = await chrome.storage.sync.get({ ctxEnabled: true });
  if (!s.ctxEnabled) return;
  chrome.contextMenus.create({
    id: "save-to-pinboard",
    title: "Save to Pinboard",
    contexts: ["page", "link", "selection"]
  });
}

chrome.runtime.onInstalled.addListener(() => setupContextMenu());
// Re-create menu when setting changes
chrome.storage.onChanged.addListener((changes) => {
  if (changes.pinboardToken) _cachedToken = null;
  if (changes.optShowBadge) {
    if (changes.optShowBadge.newValue) updateBadge().catch(() => {});
    else chrome.action.setBadgeText({ text: "" });
  }
  if (changes.ctxEnabled) setupContextMenu();
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const url = info.linkUrl || info.pageUrl;
  if (!url) return;
  const title = info.linkUrl ? (info.selectionText || info.linkUrl) : (tab?.title || url);
  const s = await loadSettings();
  const overrides = resolvePrefixSettings(s, "ctx");
  await saveFromBackground({
    url, title, tab,
    settingsOverrides: overrides,
    toread: false,
    notifyId: "pinboard",
    notifyTitle: "Pinboard: Saved!",
    notifyCategory: "contextMenu"
  });
});

// ===================== Read Later (keyboard shortcut) =====================
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "read_later") return;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url || !tab.url.startsWith("http")) {
      showNotification("rl-error", "Pinboard: Cannot save", "This page cannot be bookmarked.", "error");
      return;
    }
    const s = await loadSettings();
    const overrides = resolvePrefixSettings(s, "rl");
    await saveFromBackground({
      url: tab.url, title: tab.title || tab.url, tab,
      settingsOverrides: overrides,
      toread: true,
      notifyId: "rl",
      notifyTitle: "Pinboard: Quick Read Later!",
      notifyCategory: "readLater"
    });
  } catch (e) {
    showNotification("rl-error", "Pinboard: Read Later failed", e.message, "error");
  }
});

// ===================== Quick Save (keyboard shortcut) =====================
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "quick_save") return;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url || !tab.url.startsWith("http")) {
      showNotification("qs-error", "Pinboard: Cannot save", "This page cannot be bookmarked.", "error");
      return;
    }
    const s = await loadSettings();
    const overrides = resolvePrefixSettings(s, "qs");
    await saveFromBackground({
      url: tab.url, title: tab.title || tab.url, tab,
      settingsOverrides: overrides,
      toread: false,
      notifyId: "qs",
      notifyTitle: "Pinboard: Quick Saved!",
      notifyCategory: "quickSave"
    });
  } catch (e) {
    showNotification("qs-error", "Pinboard: Quick Save failed", e.message, "error");
  }
});
