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
  if (!tab) {
    pageInfo = { url: "", title: "", selectedText: "", metaDescription: "", referrer: "", pageText: "" };
  } else {
    pageInfo = (await getPageInfoFromTab(tab.id)) || {
      url: tab.url || "", title: tab.title || "", selectedText: "", metaDescription: "", referrer: "", pageText: ""
    };
  }

  document.getElementById("url-input").value = pageInfo.url;
  document.getElementById("title-input").value = pageInfo.title;

  // Check if URL is supported by Pinboard
  // Tab set & batch save work regardless of current page URL
  setupTabSet();

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
  setupTagPresets();

// ---- Local Markdown extraction via Defuddle ----
async function extractLocalMarkdown(tabId) {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["vendor/defuddle.js"] });
  } catch (_) {
    return { error: "Cannot access this page" };
  }
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        if (typeof Defuddle === "undefined") return { error: "Defuddle not available" };
        try {
          const clone = document.cloneNode(true);
          const result = new Defuddle(clone).parse();
          if (!result?.content) return { error: "No content extracted" };
          return { contentHtml: result.content, title: result.title || document.title, url: location.href };
        } catch (e) { return { error: e.message }; }
      }
    });
    if (results?.[0]?.result) return results[0].result;
    return { error: "Script execution failed" };
  } catch (e) { return { error: e.message }; }
}

// Convert HTML to Markdown via Turndown (runs in popup context for clipboard copy)
function htmlToMarkdown(html) {
  if (typeof TurndownService === "undefined") return html;
  const td = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced", bulletListMarker: "-" });
  td.addRule("preformattedCode", {
    filter: (n) => n.nodeName === "PRE",
    replacement: (content, node) => {
      const code = node.querySelector("code");
      let lang = "";
      if (code) {
        const cls = code.getAttribute("class") || "";
        const m = cls.match(/language-(\S+)/);
        lang = (m && m[1]) || code.getAttribute("data-lang") || code.getAttribute("data-language") || "";
      }
      if (!lang) lang = node.getAttribute("data-language") || "";
      const text = (code || node).textContent || "";
      return "\n\n```" + lang + "\n" + text.replace(/`/g, "\\`") + "\n```\n\n";
    }
  });
  td.addRule("table", {
    filter: "table",
    replacement: (content, node) => {
      const rows = Array.from(node.querySelectorAll("tr"));
      if (!rows.length) return content;
      const out = [];
      rows.forEach((row, i) => {
        const cells = Array.from(row.querySelectorAll("th, td"))
          .map(c => (c.textContent || "").trim().replace(/\|/g, "\\|").replace(/\n/g, " "));
        out.push("| " + cells.join(" | ") + " |");
        if (i === 0) out.push("| " + cells.map(() => "---").join(" | ") + " |");
      });
      return "\n\n" + out.join("\n") + "\n\n";
    }
  });
  td.addRule("highlight", { filter: "mark", replacement: (c) => "==" + c + "==" });
  td.addRule("strikethrough", {
    filter: (n) => n.nodeName === "DEL" || n.nodeName === "S" || n.nodeName === "STRIKE",
    replacement: (c) => "~~" + c + "~~"
  });
  td.addRule("figure", {
    filter: "figure",
    replacement: (content, node) => {
      const img = node.querySelector("img");
      const caption = node.querySelector("figcaption");
      if (!img) return content;
      const alt = caption ? caption.textContent.trim() : (img.getAttribute("alt") || "");
      const src = img.getAttribute("src") || "";
      return "\n\n![" + alt + "](" + src + ")" + (caption ? "\n*" + caption.textContent.trim() + "*" : "") + "\n\n";
    }
  });
  td.addRule("listItem", {
    filter: "li",
    replacement: (content, node) => {
      content = content.replace(/^\n+/, "").replace(/\n+$/, "\n").replace(/\n/gm, "\n    ");
      const parent = node.parentNode;
      let prefix = "- ";
      if (parent && parent.nodeName === "OL") {
        const start = parseInt(parent.getAttribute("start") || "1", 10);
        const index = Array.from(parent.children).indexOf(node);
        prefix = (start + index) + ". ";
      }
      const cb = node.querySelector("input[type=checkbox]");
      if (cb) {
        prefix += cb.checked ? "[x] " : "[ ] ";
        content = content.replace(/^\s*\[[ x]\]\s*/, "");
      }
      return prefix + content.trim() + "\n";
    }
  });
  return td.turndown(html);
}

  // ---- Markdown export button ----
  const jinaMdBtn = document.getElementById("jina-md-btn");
  if (jinaMdBtn) {
    jinaMdBtn.title = settings.aiContentSource === "jina" ? t("jinaMarkdownTitleJina") : t("jinaMarkdownTitle");
    // Disable on non-http pages
    const currentUrl = document.getElementById("url-input")?.value || "";
    if (!currentUrl.startsWith("http://") && !currentUrl.startsWith("https://")) {
      jinaMdBtn.disabled = true;
      jinaMdBtn.title = "Only works on web pages";
    }
    jinaMdBtn.addEventListener("click", async () => {
      if (jinaMdBtn.disabled) return;
      const url = document.getElementById("url-input").value;
      if (!url) return;

      const origText = jinaMdBtn.textContent;
      jinaMdBtn.textContent = t("jinaConverting");
      jinaMdBtn.disabled = true;

      let result;
      if (settings.aiContentSource === "jina") {
        const jinaKey = settings.jinaApiKey ? deobfuscateKey(settings.jinaApiKey) : "";
        result = await fetchJinaMarkdown(url, { apiKey: jinaKey, cacheDuration: settings.aiCacheDuration });
        if (!result.error) result._hasApiKey = !!jinaKey;
      } else {
        result = await extractLocalMarkdown(tab.id);
        if (!result.error) result._hasApiKey = false;
      }

      if (result.error) {
        jinaMdBtn.textContent = "❌ " + t("jinaFailed");
        jinaMdBtn.title = result.error;
        setTimeout(() => { jinaMdBtn.textContent = origText; jinaMdBtn.disabled = false; jinaMdBtn.title = ""; }, 2000);
        return;
      }

      // Convert to markdown for clipboard (Jina already has it, Local needs Turndown)
      const markdown = result.markdown || htmlToMarkdown(result.contentHtml);

      try {
        await navigator.clipboard.writeText(markdown);
      } catch (_) {
        jinaMdBtn.textContent = "❌ " + t("jinaFailed");
        setTimeout(() => { jinaMdBtn.textContent = origText; jinaMdBtn.disabled = false; }, 2000);
        return;
      }
      jinaMdBtn.textContent = "✅ " + t("jinaCopied");

      setTimeout(() => {
        jinaMdBtn.textContent = "👁 " + t("jinaViewBtn");
        jinaMdBtn.disabled = false;
        jinaMdBtn.onclick = async () => {
          await chrome.storage.local.set({
            md_preview_data: {
              markdown: result.markdown || "",
              contentHtml: result.contentHtml || "",
              title: result.title || document.getElementById("title-input")?.value || "",
              url: result.url || url,
              tokens: result.tokens || 0,
              hasApiKey: !!result._hasApiKey,
              source: settings.aiContentSource || "local"
            }
          });
          chrome.tabs.create({ url: "md-preview.html" });
        };
      }, 1500);
    });
  }

  // Fetch all user tags first (cache hit is instant, populates tagCaseMap for case resolution)
  fetchAllUserTags(token).then(() => {
    if (settings.optAiAutoTags && hasAIKey(settings)) document.getElementById("ai-tags-btn").click();
  });
  // Suggest tags — enqueue after user tags so tagCaseMap is ready
  if (settings.optShowSuggestTags) {
    document.getElementById("suggest-row").classList.remove("hidden");
    fetchPinboardSuggestTags(token, pageInfo.url);
  }
  // Bookmark check — non-blocking, updates UI when ready
  checkExistingBookmark(token, pageInfo.url);
  // Recent bookmarks — lowest priority, enqueue last
  if (settings.optShowRecent) fetchRecentBookmarks(token);

  document.querySelector(".tags-input-wrap")?.addEventListener("click", () => document.getElementById("tags-input").focus());
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

  // Submit state machine: idle -> loading -> success -> idle / loading -> error -> idle (user retry resets)
  const btn = document.getElementById("submit-btn");
  let submitOriginalText = btn.textContent;
  let submitErrorResetTimer = null;

  function setSubmitState(state, label) {
    btn.classList.remove("loading", "saved-success", "save-error");
    if (state === "loading") {
      btn.disabled = true;
      btn.classList.add("loading");
      btn.textContent = label || t("saving");
    } else if (state === "success") {
      btn.disabled = false;
      btn.classList.add("saved-success");
      btn.textContent = label || t("savedSuccess");
    } else if (state === "error") {
      btn.disabled = false;
      btn.classList.add("save-error");
      btn.textContent = label || `↻ ${t("saveRetry")}`;
    } else { // idle
      btn.disabled = false;
      btn.textContent = submitOriginalText;
    }
  }

  document.getElementById("submit-btn").addEventListener("click", async () => {
    // Snapshot current label as "idle text" unless we're in a transient state
    if (!btn.classList.contains("saved-success") && !btn.classList.contains("save-error") && !btn.classList.contains("loading")) {
      submitOriginalText = btn.textContent;
    }
    clearTimeout(submitErrorResetTimer);
    setSubmitState("loading");

    const url = document.getElementById("url-input").value;
    const title = document.getElementById("title-input").value;
    if (!url || !title) {
      showStatus("status-msg", t("urlAndTitleRequired"), "error");
      setSubmitState("idle");
      return;
    }
    try {
      const apiUrl = `https://api.pinboard.in/v1/posts/add?auth_token=${token}&format=json&url=${enc(url)}&description=${enc(title)}&extended=${enc(document.getElementById("description-input").value)}&tags=${enc(currentTags.join(" "))}&shared=${document.getElementById("private-check").checked ? "no" : "yes"}&toread=${document.getElementById("readlater-check").checked ? "yes" : "no"}&replace=yes`;
      const data = await (await pinboardFetch(apiUrl)).json();
      if (data.result_code === "done") {
        showStatus("status-msg", t("bookmarkSaved"), "success");
        setSubmitState("success");
        chrome.runtime.sendMessage({ type: "bookmark_saved", url: url });
        if (settings.optAutoCloseAfterSave) {
          autoCloseTimer = setTimeout(() => window.close(), 1800);
          document.addEventListener("mousedown", () => { clearTimeout(autoCloseTimer); autoCloseTimer = null; }, { once: true });
        }
        setTimeout(() => { if (btn.classList.contains("saved-success")) setSubmitState("idle"); }, 1200);
        return;
      }
      showStatus("status-msg", `Error: ${data.result_code}`, "error");
      setSubmitState("error");
    } catch (e) {
      showStatus("status-msg", t("networkError"), "error");
      setSubmitState("error");
    }
    // Auto-recover to idle so Ctrl+Enter keeps working after a visible error
    submitErrorResetTimer = setTimeout(() => {
      if (btn.classList.contains("save-error")) setSubmitState("idle");
    }, 3000);
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
  document.querySelector(".submit-bar")?.appendChild(hintSpan);

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

// ===================== Edit From Recent =====================
async function loadBookmarkForEdit(url, token) {
  // Reset current form state
  existingBookmark = null;
  currentTags = [];
  renderTags();
  document.getElementById("url-input").value = url;
  document.getElementById("title-input").value = "";
  document.getElementById("description-input").value = "";
  document.getElementById("private-check").checked = false;
  document.getElementById("readlater-check").checked = false;
  document.getElementById("submit-btn").textContent = t("submit");
  document.getElementById("delete-btn").classList.add("hidden");
  // Mark edit mode so banner shows cancel affordance
  document.body.dataset.editMode = "1";
  // Reuse existing-bookmark path which will populate the form from posts/get
  await checkExistingBookmark(token, url);
  // Append cancel affordance to banner using safe DOM APIs (no innerHTML)
  const banner = document.getElementById("existing-banner");
  if (banner && !banner.querySelector(".edit-cancel")) {
    const cancel = document.createElement("span");
    cancel.className = "edit-cancel";
    cancel.textContent = "×";
    cancel.title = t("editCancelTitle");
    cancel.setAttribute("role", "button");
    cancel.setAttribute("tabindex", "0");
    cancel.addEventListener("click", exitEditMode);
    cancel.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); exitEditMode(); } });
    banner.appendChild(document.createTextNode(" "));
    banner.appendChild(cancel);
  }
  // Scroll form into view
  document.getElementById("title-input")?.focus();
  document.getElementById("title-input")?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function exitEditMode() {
  delete document.body.dataset.editMode;
  // Simplest reliable restore: reload popup so current-tab logic runs again
  window.location.reload();
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
      const edit = document.createElement("span");
      edit.className = "recent-bm-edit";
      edit.textContent = "✏️";
      edit.title = t("recentEditTitle");
      edit.addEventListener("click", async (e) => {
        e.preventDefault();
        await loadBookmarkForEdit(p.href, token);
      });
      row.appendChild(edit);
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
  // Delegate list rendering + per-item actions to popup-offline.js
  if (window.PPOffline) {
    window.PPOffline.init();
    await window.PPOffline.refresh();
  }
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
