// ============================================================
// Pinboard Bookmark Enhanced - Popup (v2.3)
// ============================================================

// Override pinboardFetch to route through background service worker.
// This prevents Chrome's native credentials dialog when Pinboard returns 401.
// (function declarations on window are writable, so reassignment works)
pinboardFetch = function(url, options) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: "pinboard_api_call", url, options: options || null })
      .then(resp => {
        if (!resp) { reject(new Error("no background response")); return; }
        if (resp.status === 401) {
          // Invalid token — redirect to login instead of letting Chrome show the auth dialog
          (async () => {
            try { await (await getSettingsStorage()).remove("pinboardToken"); } catch (_) {}
          })();
          showLogin();
          // Return a dummy resolved response so call sites don't also throw
          resolve({ ok: false, status: 401, json: () => Promise.resolve({}), text: () => Promise.resolve("") });
          return;
        }
        resolve({
          ok: resp.ok,
          status: resp.status,
          json: () => { try { return Promise.resolve(JSON.parse(resp.text || "{}")); } catch { return Promise.resolve({}); } },
          text: () => Promise.resolve(resp.text || "")
        });
      })
      .catch(reject);
  });
};

let currentTags = [];
let allUserTags = [];
let allUserTagCounts = {};
let tagCaseMap = {};
let pageInfo = {};
let existingBookmark = null;
let acIndex = -1;
let settings = {};


document.addEventListener("DOMContentLoaded", async () => {
  await initI18n();
  applyI18n();

  settings = await (await getSettingsStorage()).get(SETTINGS_DEFAULTS);
  deobfuscateSettings(settings);

  // Apply theme: preset-based data-theme (if enabled), or fallback to generic .dark
  function applyTheme() {
    const prefersDark = settings.optTheme === "dark" ||
      (settings.optTheme === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    const key = settings.optPopupFollowTheme !== false ? (settings.themePresetKey || "") : "";
    if (ADAPTIVE_THEME_MAP[key]) {
      const [light, dark] = ADAPTIVE_THEME_MAP[key];
      document.documentElement.dataset.theme = prefersDark ? dark : light;
      document.documentElement.classList.remove("dark");
    } else if (key) {
      document.documentElement.dataset.theme = key;
      document.documentElement.classList.remove("dark");
    } else {
      delete document.documentElement.dataset.theme;
      document.documentElement.classList.toggle("dark", prefersDark);
    }
  }
  applyTheme();
  if (settings.optTheme === "auto") {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme);
  }

  if (!settings.pinboardToken) showLogin();
  else showMain(settings.pinboardToken);

  document.getElementById("options-link").addEventListener("click", (e) => {
    e.preventDefault(); chrome.runtime.openOptionsPage();
  });
  document.getElementById("logout-link").addEventListener("click", async (e) => {
    e.preventDefault();
    if (!confirm(t("confirmLogout"))) return;
    await (await getSettingsStorage()).remove("pinboardToken");
    settings.pinboardToken = "";
    document.getElementById("main-section").classList.add("hidden");
    showLogin();
  });
});

// ===================== Login =====================
function showLogin() {
  document.getElementById("login-section").classList.remove("hidden");
  document.getElementById("main-section").classList.add("hidden");
}
// Login listener — bound once outside showLogin() to avoid duplicate listeners
document.getElementById("login-btn").addEventListener("click", async () => {
  const token = document.getElementById("token-input").value.trim();
  if (!token || !token.includes(":")) { showElement("login-error", t("loginInvalidFormat")); return; }
  try {
    const res = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: "test_pinboard_token", token }, (resp) => {
        if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
        resolve(resp);
      });
    });
    if (res.ok) { await (await getSettingsStorage()).set({ pinboardToken: obfuscateKey(token) }); settings.pinboardToken = token; showMain(token); }
    else showElement("login-error", t("loginFailed"));
  } catch (e) { showElement("login-error", t("networkError")); }
});

// ===================== Main =====================
async function showMain(token) {
  document.getElementById("login-section").classList.add("hidden");
  document.getElementById("main-section").classList.remove("hidden");
  const username = token.split(":")[0];
  const userInfo = document.getElementById("user-info");
  userInfo.innerHTML = "";
  const pbLink = document.createElement("a");
  pbLink.href = "https://pinboard.in/";
  pbLink.target = "_blank";
  pbLink.textContent = "Pinboard";
  userInfo.appendChild(pbLink);
  userInfo.appendChild(document.createTextNode(` \u2014 ${username}`));
  const unreadLink = document.getElementById("unread-link");
  if (unreadLink) unreadLink.href = `https://pinboard.in/u:${encodeURIComponent(username)}/unread/`;

  if (!settings.optShowSearch) {
    const searchRow = document.querySelector(".search-row");
    if (searchRow) searchRow.classList.add("hidden");
  }
  const searchInput = document.getElementById("search-input");
  if (searchInput) {
    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && searchInput.value.trim()) {
        chrome.tabs.create({ url: `https://pinboard.in/search/u:${username}?query=${enc(searchInput.value.trim())}` });
      }
    });
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  pageInfo = (await getPageInfoFromTab(tab.id)) || {
    url: tab.url || "", title: tab.title || "", selectedText: "", metaDescription: "", referrer: "", pageText: ""
  };

  document.getElementById("url-input").value = pageInfo.url;
  document.getElementById("title-input").value = pageInfo.title;

  // Check if URL is supported by Pinboard
  const isUnsupportedUrl = !pageInfo.url || (!pageInfo.url.startsWith("http://") && !pageInfo.url.startsWith("https://"));
  if (isUnsupportedUrl) {
    document.getElementById("url-warning").classList.remove("hidden");
    document.getElementById("url-input").value = "";
    document.getElementById("title-input").value = "";
    document.getElementById("submit-btn").disabled = true;
    document.getElementById("submit-btn").title = t("urlCannotSave");
    document.getElementById("ai-summary-btn").classList.add("disabled-link");
    document.getElementById("ai-tags-btn").classList.add("disabled-link");
    return;
  }

  document.getElementById("url-input").addEventListener("input", () => {
    const val = document.getElementById("url-input").value.trim();
    const bad = !val || (!val.startsWith("http://") && !val.startsWith("https://"));
    document.getElementById("url-warning").classList.toggle("hidden", !bad);
    document.getElementById("submit-btn").disabled = bad;
  });

  let desc = "";
  if (pageInfo.selectedText) {
    desc = settings.optBlockquote ? `<blockquote>${pageInfo.selectedText}</blockquote>` : pageInfo.selectedText;
  } else if (settings.optAutoDescription !== false && pageInfo.metaDescription) { desc = pageInfo.metaDescription; }
  if (settings.optIncludeReferrer && pageInfo.referrer) { desc += (desc ? "\n\n" : "") + `via: ${pageInfo.referrer}`; }
  document.getElementById("description-input").value = desc;
  updateCharCount();
  setTimeout(() => autoResizeTextarea(document.getElementById("description-input")), 50);

  if (settings.optPrivateDefault) document.getElementById("private-check").checked = true;
  if (settings.optPrivateIncognito && tab.incognito) document.getElementById("private-check").checked = true;
  if (settings.optReadlaterDefault) document.getElementById("readlater-check").checked = true;

  // Setup UI features immediately — don't block on network requests
  setupTagsInput();
  setupSubmit(token);
  setupAIFeatures();
  setupDescriptionCounter();
  setupTabSet();
  setupTagPresets();

  // Fire suggest tags — enqueue before bookmark check
  if (settings.optShowSuggestTags) {
    document.getElementById("suggest-row").classList.remove("hidden");
    fetchPinboardSuggestTags(token, pageInfo.url);
  }
  // Bookmark check — non-blocking, updates UI when ready
  checkExistingBookmark(token, pageInfo.url);
  // Fetch all user tags (uses local cache, populates tagCaseMap), then trigger auto AI tags
  fetchAllUserTags(token).then(() => {
    if (settings.optAiAutoTags && hasAIKey(settings)) document.getElementById("ai-tags-btn").click();
  });
  // Recent bookmarks — lowest priority, enqueue last
  if (settings.optShowRecent) fetchRecentBookmarks(token);

  document.querySelector(".tags-input-wrap").addEventListener("click", () => document.getElementById("tags-input").focus());
  showOfflineQueueStatus();

  // Focus optimization: tags input for new bookmarks, description for existing
  setTimeout(() => {
    if (existingBookmark) document.getElementById("description-input").focus();
    else document.getElementById("tags-input").focus();
  }, 100);
}

// ===================== Existing Bookmark =====================
async function checkExistingBookmark(token, url) {
  try {
    let data;
    try {
      const cached = await chrome.runtime.sendMessage({ type: "get_bookmark_data", url });
      if (cached?.posts) data = { posts: cached.posts };
    } catch (_) {}
    if (!data) {
      const resp = await pinboardFetch(`https://api.pinboard.in/v1/posts/get?url=${enc(url)}&auth_token=${token}&format=json`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      data = await resp.json();
    }
    if (data.posts?.length > 0) {
      existingBookmark = data.posts[0];
      document.getElementById("title-input").value = existingBookmark.description;
      document.getElementById("description-input").value = existingBookmark.extended;
      document.getElementById("private-check").checked = existingBookmark.shared === "no";
      document.getElementById("readlater-check").checked = existingBookmark.toread === "yes";
      currentTags = [];
      renderTags();
      if (existingBookmark.tags?.trim()) existingBookmark.tags.split(" ").filter(Boolean).forEach((t) => { if (t.trim()) addTag(t.trim()); });
      document.getElementById("submit-btn").textContent = t("update");
      document.getElementById("delete-btn").classList.remove("hidden");
      updateCharCount();
      setTimeout(() => autoResizeTextarea(document.getElementById("description-input")), 50);
      const banner = document.getElementById("existing-banner");
      const timeStr = existingBookmark.time;
      if (banner) {
        let info = t("editingExisting");
        const parts = [];
        if (timeStr) {
          const d = new Date(timeStr);
          parts.push(t("savedOnDate", d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })));
        }
        const tagCount = existingBookmark.tags?.trim() ? existingBookmark.tags.trim().split(/\s+/).length : 0;
        if (tagCount > 0) parts.push(tagCount > 1 ? t("tagCountPlural", String(tagCount)) : t("tagCount", String(tagCount)));
        if (parts.length) info += " (" + parts.join(", ") + ")";
        banner.textContent = info;
        banner.classList.remove("hidden");
      }
    }
  } catch (e) { console.error(e); }
}

// ===================== Submit / Delete =====================
function setupSubmit(token) {
  let autoCloseTimer = null;

  document.getElementById("submit-btn").addEventListener("click", async () => {
    const btn = document.getElementById("submit-btn"); btn.disabled = true; btn.classList.add("loading"); const orig = btn.textContent; btn.textContent = t("saving");
    const url = document.getElementById("url-input").value;
    const title = document.getElementById("title-input").value;
    if (!url || !title) { showStatus("status-msg", t("urlAndTitleRequired"), "error"); btn.disabled = false; btn.textContent = orig; return; }
    try {
      const apiUrl = `https://api.pinboard.in/v1/posts/add?auth_token=${token}&format=json&url=${enc(url)}&description=${enc(title)}&extended=${enc(document.getElementById("description-input").value)}&tags=${enc(currentTags.join(" "))}&shared=${document.getElementById("private-check").checked ? "no" : "yes"}&toread=${document.getElementById("readlater-check").checked ? "yes" : "no"}&replace=yes`;
      const data = await (await pinboardFetch(apiUrl)).json();
      if (data.result_code === "done") {
        showStatus("status-msg", t("bookmarkSaved"), "success");
        btn.textContent = t("savedSuccess");
        btn.classList.add("saved-success");
        setTimeout(() => { btn.classList.remove("saved-success"); }, 1200);
        chrome.runtime.sendMessage({ type: "bookmark_saved", url: url });
        if (settings.optAutoCloseAfterSave) {
          autoCloseTimer = setTimeout(() => window.close(), 1800);
          // Cancel auto-close on deliberate click, not mousemove
          // (mousemove fires too easily during Ctrl+Enter keyboard save)
          document.addEventListener("mousedown", () => { clearTimeout(autoCloseTimer); autoCloseTimer = null; }, { once: true });
        }
        btn.disabled = false; btn.classList.remove("loading");
        setTimeout(() => { btn.textContent = orig; }, 1200);
        return;
      } else showStatus("status-msg", `Error: ${data.result_code}`, "error");
    } catch (e) { showStatus("status-msg", t("networkError"), "error"); }
    btn.disabled = false; btn.classList.remove("loading"); btn.textContent = orig;
  });

  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      const mainSection = document.getElementById("main-section");
      if (!mainSection.classList.contains("hidden")) {
        document.getElementById("submit-btn").click();
      }
    } else if (e.key === "Escape") {
      const delPop = document.querySelector(".del-confirm-popover");
      if (delPop) { delPop.remove(); return; }
      if (autoCloseTimer) { clearTimeout(autoCloseTimer); autoCloseTimer = null; return; }
      const tagsInput = document.getElementById("tags-input");
      if (tagsInput && document.activeElement === tagsInput) return;
      window.close();
    }
  });

  const hintSpan = document.createElement("span");
  hintSpan.className = "submit-hint";
  hintSpan.textContent = t("hintCtrlEnter");
  document.querySelector(".submit-bar").appendChild(hintSpan);

  document.getElementById("delete-btn").addEventListener("click", () => {
    const delBtn = document.getElementById("delete-btn");
    if (delBtn.querySelector(".del-confirm-popover")) return;

    const pop = document.createElement("div");
    pop.className = "del-confirm-popover";
    const msg = document.createElement("span");
    msg.textContent = t("confirmDelete");
    const yes = document.createElement("button");
    yes.className = "del-confirm-yes";
    yes.textContent = t("delete");
    const no = document.createElement("button");
    no.className = "del-confirm-no";
    no.textContent = t("cancel");
    pop.appendChild(msg); pop.appendChild(yes); pop.appendChild(no);
    delBtn.appendChild(pop);

    function dismiss() { pop.remove(); }
    pop.addEventListener("click", (e) => e.stopPropagation());
    no.addEventListener("click", dismiss);
    setTimeout(() => document.addEventListener("click", dismiss, { once: true }), 0);

    yes.addEventListener("click", async () => {
      dismiss();
      const delOrig = delBtn.textContent;
      delBtn.disabled = true; delBtn.classList.add("loading"); delBtn.textContent = t("deleting");
      const url = document.getElementById("url-input").value;
      try {
        const data = await (await pinboardFetch(`https://api.pinboard.in/v1/posts/delete?url=${enc(url)}&auth_token=${token}&format=json`)).json();
        if (data.result_code === "done" || data.result_code === "item not found") {
          showStatus("status-msg", t("deleted"), "success");
          chrome.runtime.sendMessage({ type: "bookmark_deleted", url: url });
          setTimeout(() => window.close(), 800);
        } else showStatus("status-msg", `Error: ${data.result_code}`, "error");
      } catch (e) { showStatus("status-msg", t("networkError"), "error"); }
      delBtn.disabled = false; delBtn.classList.remove("loading"); delBtn.textContent = delOrig;
    });
  });
}

// ===================== Recent Bookmarks =====================
async function fetchRecentBookmarks(token) {
  const container = document.getElementById("recent-bookmarks");
  if (!container) return;
  try {
    const resp = await pinboardFetch(`https://api.pinboard.in/v1/posts/recent?auth_token=${token}&format=json&count=5`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    const posts = data.posts || [];
    if (!posts.length) return;
    container.classList.remove("hidden");
    const label = document.createElement("div");
    label.className = "recent-bm-label";
    label.textContent = t("recentLabel");
    container.appendChild(label);
    posts.forEach(p => {
      if (!/^https?:\/\//i.test(p.href)) return;
      const row = document.createElement("div");
      row.className = "recent-bm-row";
      const a = document.createElement("a");
      a.href = p.href;
      a.target = "_blank";
      a.className = "recent-bm-item";
      a.title = p.description;
      const titleText = (p.description || p.href).substring(0, 50);
      try { const host = new URL(p.href).hostname.replace(/^www\./, ""); a.innerHTML = esc(titleText) + ` <span class="recent-bm-domain">${esc(host)}</span>`; }
      catch (_) { a.textContent = titleText; }
      row.appendChild(a);
      const del = document.createElement("span");
      del.className = "recent-bm-del";
      del.textContent = "✕";
      del.title = t("recentDeleteTitle");
      del.addEventListener("click", async () => {
        if (!confirm(t("confirmDelete"))) return;
        try {
          const data = await (await pinboardFetch(`https://api.pinboard.in/v1/posts/delete?url=${enc(p.href)}&auth_token=${token}&format=json`)).json();
          if (data.result_code === "done" || data.result_code === "item not found") {
            row.remove();
            chrome.runtime.sendMessage({ type: "bookmark_deleted", url: p.href });
          }
        } catch (_) {}
      });
      row.appendChild(del);
      container.appendChild(row);
    });
  } catch (e) { console.error("recent bookmarks error:", e); container.classList.remove("hidden"); container.innerHTML = `<div class="recent-bm-label">${esc(t("recentLabel"))}</div><span class="muted">${esc(t("recentFailed", e.message || String(e)))}</span>`; }
}

// ===================== Offline Queue Status =====================
async function showOfflineQueueStatus() {
  const bar = document.getElementById("offline-queue-bar");
  if (!bar) return;
  try {
    const { offlineQueue = [] } = await chrome.storage.local.get("offlineQueue");
    if (offlineQueue.length > 0) {
      bar.classList.remove("hidden");
      document.getElementById("offline-queue-text").textContent = t("offlineQueued", String(offlineQueue.length));
    } else {
      bar.classList.add("hidden");
    }
  } catch (_) { bar.classList.add("hidden"); }

  document.getElementById("offline-queue-clear")?.addEventListener("click", async (e) => {
    e.preventDefault();
    if (!confirm(t("offlineClearConfirm"))) return;
    await chrome.storage.local.set({ offlineQueue: [] });
    bar.classList.add("hidden");
  }, { once: true });
}

// ===================== Helpers =====================
function setupDescriptionCounter() {
  const textarea = document.getElementById("description-input");
  textarea.addEventListener("input", () => { updateCharCount(); autoResizeTextarea(textarea); });
  setTimeout(() => autoResizeTextarea(textarea), 50);
}
function autoResizeTextarea(el) {
  el.style.height = "auto";
  el.style.height = Math.min(Math.max(el.scrollHeight, TEXTAREA_MIN_HEIGHT), TEXTAREA_MAX_HEIGHT) + "px";
}
function updateCharCount() {
  const len = document.getElementById("description-input").value.length;
  const el = document.getElementById("desc-char-count");
  el.textContent = len;
  el.style.color = len > 65000 ? "#c00" : len > 60000 ? "#e80" : "";
}
function showElement(id, text) { const el = document.getElementById(id); el.textContent = text; el.classList.remove("hidden"); }
function showStatus(id, text, type) { const el = document.getElementById(id); el.textContent = text; el.className = `status-msg ${type}`; el.classList.remove("hidden"); }
function esc(s) { const d = document.createElement("div"); d.textContent = s; return d.innerHTML; }
function enc(s) { return encodeURIComponent(s); }

// Alt+1~9 to add suggest/AI tags by index
document.addEventListener("keydown", (e) => {
  if (!e.altKey || e.ctrlKey || e.metaKey) return;
  const n = parseInt(e.key);
  if (n < 1 || n > 9 || isNaN(n)) return;
  const allStags = [...document.querySelectorAll("#pinboard-suggest-tags .stag:not(.used), #ai-suggest-tags .stag:not(.used)")];
  if (n <= allStags.length) {
    e.preventDefault();
    const el = allStags[n - 1];
    addTag(el.dataset.tag);
    el.classList.add("used");
  }
});
