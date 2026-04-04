// ============================================================
// Pinboard Bookmark Plus - Popup (v2.2)
// ============================================================

let currentTags = [];
let allUserTags = [];
let allUserTagCounts = {};
let tagCaseMap = {};
let pageInfo = {};
let existingBookmark = null;
let acIndex = -1;
let settings = {};


document.addEventListener("DOMContentLoaded", async () => {
  settings = await chrome.storage.sync.get(SETTINGS_DEFAULTS);
  deobfuscateSettings(settings);

  // Apply theme: JS controls .dark class on <html>
  function applyTheme() {
    const isDark = settings.optTheme === "dark" ||
      (settings.optTheme === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", isDark);
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
    if (!confirm("Log out? Your API token will be removed.")) return;
    await chrome.storage.sync.remove("pinboardToken");
    settings.pinboardToken = "";
    document.getElementById("main-section").classList.add("hidden");
    showLogin();
  });
});

// ===================== Login =====================
function showLogin() {
  document.getElementById("login-section").classList.remove("hidden");
  document.getElementById("main-section").classList.add("hidden");
  document.getElementById("login-btn").addEventListener("click", async () => {
    const token = document.getElementById("token-input").value.trim();
    if (!token || !token.includes(":")) { showElement("login-error", "Invalid format. Use username:TOKEN"); return; }
    try {
      const res = await fetch(`https://api.pinboard.in/v1/user/api_token/?auth_token=${token}&format=json`);
      if (res.ok) { await chrome.storage.sync.set({ pinboardToken: obfuscateKey(token) }); settings.pinboardToken = token; showMain(token); }
      else showElement("login-error", "Authentication failed.");
    } catch (e) { showElement("login-error", "Network error."); }
  });
}

// ===================== Main =====================
async function showMain(token) {
  document.getElementById("login-section").classList.add("hidden");
  document.getElementById("main-section").classList.remove("hidden");
  document.getElementById("user-info").textContent = `Pinboard — ${token.split(":")[0]}`;
  const username = token.split(":")[0];
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
    document.getElementById("submit-btn").disabled = true;
    document.getElementById("submit-btn").title = "Cannot save: unsupported URL";
    document.getElementById("ai-summary-btn").classList.add("disabled-link");
    document.getElementById("ai-tags-btn").classList.add("disabled-link");
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

  await checkExistingBookmark(token, pageInfo.url);
  setTimeout(() => fetchPinboardSuggestTags(token, pageInfo.url), 500);
  setTimeout(() => fetchAllUserTags(token), 1000);
  setupTagsInput();
  setupSubmit(token);
  setupAIFeatures();
  setupDescriptionCounter();
  setupTabSet();
  if (settings.optShowRecent) fetchRecentBookmarks(token);
  document.querySelector(".tags-input-wrap").addEventListener("click", () => document.getElementById("tags-input").focus());
  if (settings.optAiAutoTags && hasAIKey(settings)) document.getElementById("ai-tags-btn").click();
  showOfflineQueueStatus();

  // Focus optimization: tags input for new bookmarks, description for existing
  setTimeout(() => {
    if (existingBookmark) document.getElementById("description-input").focus();
    else document.getElementById("tags-input").focus();
  }, 100);
}



/// ===================== Tab Set 保存功能 =====================
function setupTabSet() {
  const btn = document.getElementById("save-tabset-btn");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    const origText = btn.textContent;
    btn.textContent = "⏳ Saving...";

    try {
      // 获取当前窗口所有有效标签页
      const tabs = await chrome.tabs.query({ currentWindow: true });
      const validTabs = tabs.filter(t =>
        t.url && (t.url.startsWith("http://") || t.url.startsWith("https://"))
      );

      if (validTabs.length === 0) {
        showStatus("status-msg", "No valid tabs to save", "error");
        btn.textContent = origText;
        btn.disabled = false;
        return;
      }

      const tabsData = validTabs.map(t => ({
        title: t.title || t.url,
        url: t.url
      }));

      // 发送消息给 background service worker 执行保存
      // background 不会因 popup 关闭而中断
      chrome.runtime.sendMessage(
        { action: "saveTabSet", tabsData: tabsData },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error("sendMessage error:", chrome.runtime.lastError);
          }
        }
      );

      // 立即显示成功（实际保存由 background 完成）
      btn.textContent = "✅ Sent!";
      setTimeout(() => {
        btn.textContent = origText;
        btn.disabled = false;
      }, 2000);

    } catch (e) {
      console.error("Save tab set error:", e);
      showStatus("status-msg", "Failed: " + e.message, "error");
      btn.textContent = origText;
      btn.disabled = false;
    }
  });

  const batchBtn = document.getElementById("batch-bookmark-btn");
  if (!batchBtn) return;
  batchBtn.addEventListener("click", async () => {
    batchBtn.disabled = true;
    batchBtn.textContent = "⏳ Saving...";
    try {
      const rawToken = await chrome.storage.sync.get("pinboardToken");
      const pinboardToken = deobfuscateKey(rawToken.pinboardToken);
      if (!pinboardToken) {
        showStatus("status-msg", "Not logged in", "error");
        batchBtn.textContent = "📌 Batch Save"; batchBtn.disabled = false;
        return;
      }
      const tabs = await chrome.tabs.query({ currentWindow: true });
      const validTabs = tabs.filter(t => t.url && (t.url.startsWith("http://") || t.url.startsWith("https://")));
      if (!validTabs.length) {
        showStatus("status-msg", "No valid tabs", "error");
        batchBtn.textContent = "📌 Batch Save"; batchBtn.disabled = false;
        return;
      }
      // Parse comma-separated tags into space-separated format for Pinboard
      const baseTags = settings.optBatchTagEnabled && settings.optBatchTag
        ? settings.optBatchTag.split(/[,，]+/).map(t => t.trim().replace(/\s+/g, "-")).filter(Boolean)
        : [];
      const useAiTags = settings.batchAiTags && hasAIKey(settings);
      const useAiSummary = settings.batchAiSummary && hasAIKey(settings);

      let saved = 0, failed = 0, skipped = 0;
      // If skip existing is enabled, check which URLs already exist (with local cache)
      let existingUrls = new Set();
      if (settings.batchSkipExisting) {
        existingUrls = await fetchExistingUrlSet(pinboardToken);
      }
      for (let i = 0; i < validTabs.length; i++) {
        const t = validTabs[i];
        batchBtn.textContent = `⏳ ${i + 1}/${validTabs.length} (✓${saved} ✗${failed})`;
        if (settings.batchSkipExisting && existingUrls.has(t.url)) {
          skipped++;
          continue;
        }
        try {
          let tags = [...baseTags];
          let notes = "";

          // AI features per tab (if enabled)
          if (useAiTags || useAiSummary) {
            let tabPageInfo = null;
            try { tabPageInfo = await getPageInfoFromTab(t.id); } catch (_) {}
            if (tabPageInfo?.pageText) {
              if (useAiTags) {
                try {
                  const cached = await getAICache(t.url, "tags", settings.aiCacheDuration);
                  if (cached) { tags = [...tags, ...cached]; }
                  else {
                    const prompt = buildTagPrompt(settings, t.title || t.url, t.url, tabPageInfo.pageText, "", []);
                    const resp = await callAI(settings, prompt);
                    const rawTags = parseAITags(resp, settings.aiTagSeparator);
                    const aiTags = settings.optRespectTagCase
                      ? rawTags.map(t => resolveTagCase(t, tagCaseMap))
                      : rawTags;
                    await setAICache(t.url, "tags", aiTags, settings.aiCacheDuration);
                    tags = [...tags, ...aiTags];
                  }
                } catch (_) {}
              }
              if (useAiSummary) {
                try {
                  const cached = await getAICache(t.url, "summary", settings.aiCacheDuration);
                  if (cached) { notes = `[AI Summary]\n<blockquote>${cached}</blockquote>`; }
                  else {
                    const prompt = buildSummaryPrompt(settings, t.title || t.url, t.url, tabPageInfo.pageText, "");
                    const summary = await callAI(settings, prompt);
                    await setAICache(t.url, "summary", summary, settings.aiCacheDuration);
                    notes = `[AI Summary]\n<blockquote>${summary}</blockquote>`;
                  }
                } catch (_) {}
              }
            }
          }

          const apiUrl = `https://api.pinboard.in/v1/posts/add?auth_token=${pinboardToken}&format=json&url=${enc(t.url)}&description=${enc(t.title || t.url)}&extended=${enc(notes)}&tags=${enc(tags.join(" "))}&replace=yes`;
          const data = await (await pinboardFetch(apiUrl)).json();
          if (data.result_code === "done") saved++;
          else failed++;
        } catch (_) { failed++; }
      }
      // Update local URL set cache after batch save
      if (saved > 0) {
        const newUrls = validTabs.filter(t => !existingUrls.has(t.url)).map(t => t.url);
        newUrls.forEach(u => existingUrls.add(u));
        try {
          await chrome.storage.local.set({
            cached_existing_urls: { urls: [...existingUrls], timestamp: Date.now() }
          });
        } catch (_) {}
      }
      const tagStr = baseTags.join(", ");
      const skipMsg = skipped > 0 ? `, ${skipped} skipped` : "";
      showStatus("status-msg", `Batch done: ${saved} saved, ${failed} failed${skipMsg}`, saved > 0 ? "success" : "error");
      if (saved > 0) {
        chrome.runtime.sendMessage({ type: "show_notification", id: "batch-saved-" + Date.now(), title: "Pinboard: Batch Saved!", message: `${saved} bookmarks saved${tagStr ? ` (tagged: ${tagStr})` : ""}.`, category: "batchSave" });
      }
      batchBtn.textContent = `✅ ${saved} saved`;
      setTimeout(() => { batchBtn.textContent = "📌 Batch Save"; batchBtn.disabled = false; }, 3000);
    } catch (e) {
      showStatus("status-msg", "Batch save failed: " + e.message, "error");
      batchBtn.textContent = "📌 Batch Save"; batchBtn.disabled = false;
    }
  });
}

// ===================== Existing URL Set Cache (for batch dedup) =====================
async function fetchExistingUrlSet(token) {
  const cacheKey = "cached_existing_urls";
  try {
    const cached = await chrome.storage.local.get(cacheKey);
    if (cached[cacheKey]) {
      const { urls, timestamp } = cached[cacheKey];
      if (Date.now() - timestamp < 30 * 60 * 1000) {
        return new Set(urls);
      }
    }
  } catch (_) {}
  // Cache miss — fetch from API
  try {
    const recentData = await (await fetch(`https://api.pinboard.in/v1/posts/all?auth_token=${token}&format=json&results=1000`)).json();
    const urls = recentData.map(p => p.href);
    await chrome.storage.local.set({ [cacheKey]: { urls, timestamp: Date.now() } });
    return new Set(urls);
  } catch (_) {
    return new Set();
  }
}

// ===================== Existing Bookmark =====================
async function checkExistingBookmark(token, url) {
  try {
    const data = await (await fetch(`https://api.pinboard.in/v1/posts/get?url=${enc(url)}&auth_token=${token}&format=json`)).json();
    if (data.posts?.length > 0) {
      existingBookmark = data.posts[0];
      document.getElementById("title-input").value = existingBookmark.description;
      document.getElementById("description-input").value = existingBookmark.extended;
      document.getElementById("private-check").checked = existingBookmark.shared === "no";
      document.getElementById("readlater-check").checked = existingBookmark.toread === "yes";
      currentTags = [];
      renderTags();
      if (existingBookmark.tags?.trim()) existingBookmark.tags.split(" ").filter(Boolean).forEach((t) => { if (t.trim()) addTag(t.trim()); });
      document.getElementById("submit-btn").textContent = "Update";
      document.getElementById("delete-btn").classList.remove("hidden");
      updateCharCount();
      setTimeout(() => autoResizeTextarea(document.getElementById("description-input")), 50);
      // Show bookmark timestamp
      const timeStr = existingBookmark.time;
      if (timeStr) {
        const d = new Date(timeStr);
        const formatted = d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
        showStatus("status-msg", `Last saved: ${formatted}`, "success");
      }
    }
  } catch (e) { console.error(e); }
}

// ===================== Suggest Tags =====================
async function fetchPinboardSuggestTags(token, url) {
  const container = document.getElementById("pinboard-suggest-tags");
  try {
    const data = await (await fetch(`https://api.pinboard.in/v1/posts/suggest?url=${enc(url)}&auth_token=${token}&format=json`)).json();
    container.innerHTML = "";
    const popular = data[0]?.popular || [];
    const recommended = data[1]?.recommended || [];
    if (!popular.length && !recommended.length) { container.innerHTML = '<span class="muted">no suggestions</span>'; return; }

    // Resolve suggested tag case against user's existing tags
    const resolveTag = (t) => (settings.optRespectTagCase && tagCaseMap) ? resolveTagCase(t, tagCaseMap) : t;

    if (popular.length) {
      const g = document.createElement("div"); g.className = "suggest-group";
      let h = '<span class="group-label">popular:</span>';
      popular.forEach((t) => { const resolved = resolveTag(t); h += `<span class="stag" data-tag="${esc(resolved)}">${esc(resolved)}</span> `; });
      g.innerHTML = h; container.appendChild(g);
    }
    if (recommended.length) {
      const g = document.createElement("div"); g.className = "suggest-group";
      let h = '<span class="group-label">recommended:</span>';
      recommended.forEach((t) => { const resolved = resolveTag(t); h += `<span class="stag" data-tag="${esc(resolved)}">${esc(resolved)}</span> `; });
      h += '<span class="add-all-link" id="add-all-suggest">Add all</span>';
      g.innerHTML = h; container.appendChild(g);
    }
    container.querySelectorAll(".stag").forEach((el) => {
      el.addEventListener("click", () => { addTag(el.dataset.tag); el.classList.add("used"); });
    });
    document.getElementById("add-all-suggest")?.addEventListener("click", () => {
      container.querySelectorAll(".stag:not(.used)").forEach((el) => { addTag(el.dataset.tag); el.classList.add("used"); });
    });
  } catch (e) { container.innerHTML = '<span class="muted">failed to load</span>'; }
}

async function fetchAllUserTags(token) {
  // Check local cache first (TTL: 10 minutes)
  const cacheKey = "cached_user_tags";
  try {
    const cached = await chrome.storage.local.get(cacheKey);
    if (cached[cacheKey]) {
      const { tags, counts, timestamp } = cached[cacheKey];
      if (Date.now() - timestamp < 10 * 60 * 1000) {
        allUserTagCounts = counts;
        allUserTags = tags;
        tagCaseMap = buildTagCaseMap(counts);
        return;
      }
    }
  } catch (_) {}
  // Cache miss — fetch from API
  try {
    const data = await (await fetch(`https://api.pinboard.in/v1/tags/get?auth_token=${token}&format=json`)).json();
    allUserTagCounts = data;
    // Sort by usage count descending, then alphabetically
    allUserTags = Object.entries(data)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([tag]) => tag);
    tagCaseMap = buildTagCaseMap(data);
    // Cache result
    await chrome.storage.local.set({ [cacheKey]: { tags: allUserTags, counts: allUserTagCounts, timestamp: Date.now() } });
  } catch (e) { console.error(e); }
}

// ===================== Tags Input =====================
function setupTagsInput() {
  const input = document.getElementById("tags-input");
  const dropdown = document.getElementById("tags-autocomplete");
  input.addEventListener("input", () => {
    const val = input.value.trim().toLowerCase(); acIndex = -1;
    if (!val) { dropdown.classList.add("hidden"); return; }
    const matches = allUserTags.filter((t) =>
      t.toLowerCase().includes(val) &&
      !currentTags.some((ct) => ct.toLowerCase() === t.toLowerCase())
    ).sort((a, b) => {
      const al = a.toLowerCase(), bl = b.toLowerCase();
      const ap = al.startsWith(val), bp = bl.startsWith(val);
      if (ap !== bp) return ap ? -1 : 1; // prefix matches first
      return 0; // preserve original order (by usage count)
    }).slice(0, 10);
    if (!matches.length) { dropdown.classList.add("hidden"); return; }
    dropdown.innerHTML = "";
    matches.forEach((tag) => {
      const item = document.createElement("div"); item.className = "ac-item"; item.textContent = tag;
      const count = allUserTagCounts[tag];
      if (count) {
        const countSpan = document.createElement("span");
        countSpan.style.cssText = "color:#999;font-size:10px;margin-left:4px";
        countSpan.textContent = `(${count})`;
        item.appendChild(countSpan);
      }
      item.addEventListener("click", () => { addTag(tag); input.value = ""; dropdown.classList.add("hidden"); input.focus(); });
      dropdown.appendChild(item);
    });
    dropdown.classList.remove("hidden");
  });
  input.addEventListener("paste", (e) => {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData("text");
    if (text) {
      text.split(/[,\s]+/).map(t => t.trim()).filter(Boolean).forEach(t => addTag(t));
      input.value = "";
      dropdown.classList.add("hidden");
    }
  });
  input.addEventListener("keydown", (e) => {
    const items = dropdown.querySelectorAll(".ac-item");
    if (e.key === "ArrowDown") { e.preventDefault(); acIndex = acIndex >= items.length - 1 ? 0 : acIndex + 1; updateAc(items); }
    else if (e.key === "ArrowUp") { e.preventDefault(); acIndex = acIndex <= 0 ? items.length - 1 : acIndex - 1; updateAc(items); }
    else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      if (acIndex >= 0 && items[acIndex]) {
        // 用户已用方向键选中了某项
        addTag(items[acIndex].textContent);
      } else if (items.length > 0 && !dropdown.classList.contains("hidden")) {
        // ✅ 新增：下拉列表可见且有匹配项 → 自动选第一个
        addTag(items[0].textContent);
      } else if (input.value.trim()) {
        // 没有匹配项，按原逻辑添加输入内容
        input.value.trim().split(/[\s,]+/).filter(Boolean).forEach((t) => addTag(t));
      }
      input.value = ""; dropdown.classList.add("hidden");
    } else if (e.key === " ") {
      const v = input.value.trim();
      if (v) { e.preventDefault(); addTag(v); input.value = ""; dropdown.classList.add("hidden"); }
    } else if (e.key === "Backspace" && !input.value && currentTags.length) { removeTag(currentTags[currentTags.length - 1]); }
    else if (e.key === "Escape") { dropdown.classList.add("hidden"); }
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".tags-input-wrap") && !e.target.closest(".autocomplete-dropdown")) dropdown.classList.add("hidden");
  });
  document.getElementById("tags-clear-all")?.addEventListener("click", (e) => {
    e.preventDefault();
    currentTags = [];
    renderTags();
  });
}
function updateAc(items) { items.forEach((el, i) => el.classList.toggle("selected", i === acIndex)); }
function addTag(tag) {
  tag = tag.trim().replace(/\s+/g, settings.aiTagSeparator || "-");
  if (!tag) return;
  // Respect existing tag casing if enabled
  if (settings.optRespectTagCase && tagCaseMap) {
    tag = resolveTagCase(tag, tagCaseMap);
  }
  // 大小写不敏感去重：如果已存在相同 tag（忽略大小写），则跳过
  if (currentTags.some((t) => t.toLowerCase() === tag.toLowerCase())) return;
  currentTags.push(tag);
  renderTags();
}
function removeTag(tag) {
  currentTags = currentTags.filter((t) => t.toLowerCase() !== tag.toLowerCase());
  renderTags();
}
function renderTags() {
  const d = document.getElementById("tags-display"); d.innerHTML = "";
  currentTags.forEach((tag, idx) => {
    const el = document.createElement("span"); el.className = "tag-item";
    el.draggable = true;
    el.dataset.idx = idx;
    el.innerHTML = `${esc(tag)}<span class="tag-remove">&times;</span>`;
    el.querySelector(".tag-remove").addEventListener("click", () => removeTag(tag));
    // Drag-and-drop reorder
    el.addEventListener("dragstart", (e) => { e.dataTransfer.setData("text/plain", idx); el.classList.add("dragging"); });
    el.addEventListener("dragend", () => el.classList.remove("dragging"));
    el.addEventListener("dragover", (e) => { e.preventDefault(); el.classList.add("drag-over"); });
    el.addEventListener("dragleave", () => el.classList.remove("drag-over"));
    el.addEventListener("drop", (e) => {
      e.preventDefault(); el.classList.remove("drag-over");
      const fromIdx = parseInt(e.dataTransfer.getData("text/plain"));
      const toIdx = idx;
      if (fromIdx !== toIdx) {
        const [moved] = currentTags.splice(fromIdx, 1);
        currentTags.splice(toIdx, 0, moved);
        renderTags();
      }
    });
    d.appendChild(el);
  });
  // Show "clear all" link when there are 2+ tags
  const clearBtn = document.getElementById("tags-clear-all");
  if (clearBtn) clearBtn.classList.toggle("hidden", currentTags.length < 2);
}

// ===================== Submit / Delete =====================
function setupSubmit(token) {
  document.getElementById("submit-btn").addEventListener("click", async () => {
    const btn = document.getElementById("submit-btn"); btn.disabled = true; btn.classList.add("loading"); const orig = btn.textContent; btn.textContent = "Saving...";
    const url = document.getElementById("url-input").value;
    const title = document.getElementById("title-input").value;
    if (!url || !title) { showStatus("status-msg", "URL and Title required", "error"); btn.disabled = false; btn.textContent = orig; return; }
    try {
      const apiUrl = `https://api.pinboard.in/v1/posts/add?auth_token=${token}&format=json&url=${enc(url)}&description=${enc(title)}&extended=${enc(document.getElementById("description-input").value)}&tags=${enc(currentTags.join(" "))}&shared=${document.getElementById("private-check").checked ? "no" : "yes"}&toread=${document.getElementById("readlater-check").checked ? "yes" : "no"}&replace=yes`;
      const data = await (await pinboardFetch(apiUrl)).json();
      if (data.result_code === "done") {
        showStatus("status-msg", "Bookmark saved.", "success");
        btn.textContent = "✅ Saved!";
        btn.style.background = "#d4edda";
        btn.style.borderColor = "#28a745";
        setTimeout(() => { btn.style.background = ""; btn.style.borderColor = ""; }, 1200);
        // 通知 background 更新图标
        chrome.runtime.sendMessage({ type: "bookmark_saved", url: url });
        setTimeout(() => window.close(), 1200);
      } else showStatus("status-msg", `Error: ${data.result_code}`, "error");
    } catch (e) { showStatus("status-msg", "Network error", "error"); }
    btn.disabled = false; btn.classList.remove("loading"); btn.textContent = orig;
  });

  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      const mainSection = document.getElementById("main-section");
      if (!mainSection.classList.contains("hidden")) {
        document.getElementById("submit-btn").click();
      }
    }
  });

  document.getElementById("delete-btn").addEventListener("click", async () => {
    if (!confirm("Delete this bookmark?")) return;
    const delBtn = document.getElementById("delete-btn");
    const delOrig = delBtn.textContent;
    delBtn.disabled = true; delBtn.classList.add("loading"); delBtn.textContent = "Deleting...";
    const url = document.getElementById("url-input").value;
    try {
      const data = await (await pinboardFetch(`https://api.pinboard.in/v1/posts/delete?url=${enc(url)}&auth_token=${token}&format=json`)).json();
      if (data.result_code === "done" || data.result_code === "item not found") {
        showStatus("status-msg", "Deleted.", "success");
        // 通知 background 更新图标
        chrome.runtime.sendMessage({ type: "bookmark_deleted", url: url });
        setTimeout(() => window.close(), 800);
      } else showStatus("status-msg", `Error: ${data.result_code}`, "error");
    } catch (e) { showStatus("status-msg", "Network error", "error"); }
    delBtn.disabled = false; delBtn.classList.remove("loading"); delBtn.textContent = delOrig;
  });
}

// ===================== AI Features =====================
function setupAIFeatures() {
  // ---- AI Summary ----
  document.getElementById("ai-summary-btn").addEventListener("click", async (e) => {
    e.preventDefault();
    await doAISummary(false, false);
  });

  // ---- AI Tags ----
  document.getElementById("ai-tags-btn").addEventListener("click", async (e) => {
    e.preventDefault();
    await doAITags(false);
  });
}

// AI summary: 用前置标签行来标识，Pinboard 上显示为自然的纯文本标题
const AI_SUMMARY_TAG = "[AI Summary]";
const AI_BQ_REGEX = /(\n\n)?\[AI Summary\]\n<blockquote>[\s\S]*?<\/blockquote>\s*$/;

// ---- Append summary (add to end of description) ----
function appendSummary(summary) {
  const di = document.getElementById("description-input");
  const cur = di.value.trim();
  const wrapped = `${AI_SUMMARY_TAG}\n<blockquote>${summary}</blockquote>`;

  // If there's already an AI summary block, replace it; otherwise append
  if (AI_BQ_REGEX.test(cur)) {
    di.value = cur.replace(AI_BQ_REGEX, "\n\n" + wrapped).replace(/^\n\n/, "");
  } else {
    di.value = cur ? cur + "\n\n" + wrapped : wrapped;
  }
  updateCharCount();
}

// ---- Replace only the AI-generated summary in description ----
function replaceSummary(summary) {
  const di = document.getElementById("description-input");
  const cur = di.value;
  const wrapped = `${AI_SUMMARY_TAG}\n<blockquote>${summary}</blockquote>`;

  if (AI_BQ_REGEX.test(cur)) {
    di.value = cur.replace(AI_BQ_REGEX, "\n\n" + wrapped).replace(/^\n\n/, "");
  } else {
    const trimmed = cur.trim();
    di.value = trimmed ? trimmed + "\n\n" + wrapped : wrapped;
  }
  updateCharCount();
}


// ---- AI Summary core logic (forceRefresh = bypass cache, replace = replace mode) ----
async function doAISummary(forceRefresh, replaceMode) {
  const btn = document.getElementById("ai-summary-btn");
  if (!hasAIKey(settings)) { showStatus("status-msg", "Set AI API key in settings", "error"); return; }
  if (!pageInfo.pageText) { showStatus("status-msg", "No page content to summarize", "error"); return; }

  // Check cache (unless forcing refresh)
  if (!forceRefresh) {
    const cached = await getAICache(pageInfo.url, "summary", settings.aiCacheDuration);
    if (cached) {
      appendSummary(cached);
      showSummaryCacheHint();
      return;
    }
  }

  if (btn) {
    btn.textContent = "summarizing...";
    btn.classList.add("loading");
  }
  try {
    const summary = await callAI(settings, buildSummaryPrompt(settings, document.getElementById("title-input").value, document.getElementById("url-input").value, pageInfo.pageText, document.getElementById("description-input").value));
    await setAICache(pageInfo.url, "summary", summary, settings.aiCacheDuration);

    if (replaceMode) {
      replaceSummary(summary);
    } else {
      appendSummary(summary);
    }

    const msg = replaceMode ? "Summary replaced" : (forceRefresh ? "Summary regenerated" : "Summary generated");
    showStatus("status-msg", msg, "success");
  } catch (e) {
    showStatus("status-msg", `AI error: ${e.message}`, "error");
  }
  if (btn) {
    btn.textContent = "🤖 AI summary";
    btn.classList.remove("loading");
  }
}

// ---- Show cache hint with regenerate + replace buttons ----
function showSummaryCacheHint() {
  const bar = document.getElementById("ai-summary-btn").parentElement;
  // Remove old hint if exists
  bar.querySelector(".cache-hint-wrap")?.remove();

  const wrap = document.createElement("span");
  wrap.className = "cache-hint-wrap";
  wrap.innerHTML = [
    '<span class="cache-hint">cached</span>',
    '<a href="#" class="regen-link" data-mode="append">↻ regenerate</a>',
    '<a href="#" class="regen-link" data-mode="replace">↻ regenerate &amp; replace</a>'
  ].join("");
  bar.appendChild(wrap);

  wrap.querySelectorAll(".regen-link").forEach((link) => {
    link.addEventListener("click", async (e) => {
      e.preventDefault();
      const mode = e.currentTarget.dataset.mode;
      const isReplace = mode === "replace";

      // Disable all links in this hint
      wrap.querySelectorAll(".regen-link").forEach((l) => {
        l.classList.add("loading");
      });
      e.currentTarget.textContent = isReplace ? "replacing..." : "regenerating...";

      await doAISummary(true, isReplace);
      wrap.remove();
    });
  });
}

// ---- AI Tags core logic (forceRefresh = bypass cache) ----
async function doAITags(forceRefresh) {
  const btn = document.getElementById("ai-tags-btn");
  const container = document.getElementById("ai-suggest-tags");

  if (!hasAIKey(settings)) {
    container.innerHTML = '<span class="muted">set AI key in <a href="#" class="go-settings">settings</a></span>';
    container.querySelector(".go-settings")?.addEventListener("click", (ev) => { ev.preventDefault(); chrome.runtime.openOptionsPage(); });
    return;
  }

  // Check cache (unless forcing refresh)
  if (!forceRefresh) {
    const cached = await getAICache(pageInfo.url, "tags", settings.aiCacheDuration);
    if (cached) {
      renderAITags(cached, true); // true = from cache
      return;
    }
  }

  // Only update button text if the button exists
  if (btn) {
    btn.textContent = "generating...";
    btn.classList.add("loading");
  }

  try {
    const resp = await callAI(settings, buildTagPrompt(settings, document.getElementById("title-input").value, document.getElementById("url-input").value, pageInfo.pageText, document.getElementById("description-input").value, allUserTags));
    const rawTags = parseAITags(resp, settings.aiTagSeparator);
    const tags = settings.optRespectTagCase
      ? rawTags.map(t => resolveTagCase(t, tagCaseMap))
      : rawTags;
    await setAICache(pageInfo.url, "tags", tags, settings.aiCacheDuration);
    renderAITags(tags, false); // false = freshly generated
    if (forceRefresh) {
      showStatus("status-msg", "Tags regenerated", "success");
    }
  } catch (e) {
    container.innerHTML = `<span class="muted">${esc(e.message)}</span>`;
  }

  // Restore button text if the button still exists
  if (btn) {
    btn.textContent = "generate";
    btn.classList.remove("loading");
  }
}


function renderAITags(tags, fromCache) {
  const container = document.getElementById("ai-suggest-tags");
  container.innerHTML = "";

  if (!tags.length) {
    container.innerHTML = '<span class="muted">no tags generated</span>';
    return;
  }

  // Tag items
  tags.forEach((tag) => {
    const el = document.createElement("span");
    el.className = "stag ai";
    el.textContent = tag;
    el.dataset.tag = tag;
    el.addEventListener("click", () => { addTag(tag); el.classList.add("used"); });
    container.appendChild(el);
  });

  // "Add all" link
  const aa = document.createElement("span");
  aa.className = "add-all-link";
  aa.textContent = "Add all";
  aa.addEventListener("click", () => {
    container.querySelectorAll(".stag:not(.used)").forEach((el) => { addTag(el.dataset.tag); el.classList.add("used"); });
  });
  container.appendChild(aa);

  // Cache hint + regenerate/replace buttons (only when loaded from cache)
  if (fromCache) {
    const cachedTagSet = new Set(tags.map(t => t.toLowerCase()));
    const hintWrap = document.createElement("span");
    hintWrap.className = "cache-hint-wrap";
    hintWrap.style.display = "inline-block";
    hintWrap.style.marginLeft = "8px";
    hintWrap.innerHTML = [
      '<span class="cache-hint">cached</span>',
      '<a href="#" class="regen-link" data-mode="append">↻ regenerate</a>',
      '<a href="#" class="regen-link" data-mode="replace">↻ replace</a>'
    ].join("");
    container.appendChild(hintWrap);

    hintWrap.querySelectorAll(".regen-link").forEach((link) => {
      link.addEventListener("click", async (e) => {
        e.preventDefault();
        const mode = e.currentTarget.dataset.mode;
        hintWrap.querySelectorAll(".regen-link").forEach((l) => l.classList.add("loading"));
        e.currentTarget.textContent = mode === "replace" ? "replacing..." : "regenerating...";
        if (mode === "replace") {
          // Remove cached AI tags from currentTags before regenerating
          currentTags = currentTags.filter(t => !cachedTagSet.has(t.toLowerCase()));
          renderTags();
        }
        await doAITags(true);
      });
    });
  }
}

// ===================== Recent Bookmarks =====================
async function fetchRecentBookmarks(token) {
  const container = document.getElementById("recent-bookmarks");
  if (!container) return;
  try {
    const data = await (await fetch(`https://api.pinboard.in/v1/posts/recent?auth_token=${token}&format=json&count=5`)).json();
    const posts = data.posts || [];
    if (!posts.length) return;
    container.classList.remove("hidden");
    const label = document.createElement("div");
    label.className = "recent-bm-label";
    label.textContent = "Recent:";
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
      a.textContent = (p.description || p.href).substring(0, 55);
      row.appendChild(a);
      const del = document.createElement("span");
      del.className = "recent-bm-del";
      del.textContent = "✕";
      del.title = "Delete this bookmark";
      del.addEventListener("click", async () => {
        if (!confirm("Delete this bookmark?")) return;
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
  } catch (e) { container.classList.remove("hidden"); container.innerHTML = '<div class="recent-bm-label">Recent:</div><span class="muted">failed to load</span>'; }
}

// ===================== Offline Queue Status =====================
async function showOfflineQueueStatus() {
  const bar = document.getElementById("offline-queue-bar");
  if (!bar) return;
  try {
    const { offlineQueue = [] } = await chrome.storage.local.get("offlineQueue");
    if (offlineQueue.length > 0) {
      bar.classList.remove("hidden");
      document.getElementById("offline-queue-text").textContent = `${offlineQueue.length} bookmark${offlineQueue.length > 1 ? "s" : ""} queued (offline)`;
    } else {
      bar.classList.add("hidden");
    }
  } catch (_) { bar.classList.add("hidden"); }

  document.getElementById("offline-queue-clear")?.addEventListener("click", async (e) => {
    e.preventDefault();
    if (!confirm("Clear all queued bookmarks?")) return;
    await chrome.storage.local.set({ offlineQueue: [] });
    bar.classList.add("hidden");
  });
}

// ===================== Helpers =====================
function setupDescriptionCounter() {
  const textarea = document.getElementById("description-input");
  textarea.addEventListener("input", () => { updateCharCount(); autoResizeTextarea(textarea); });
  // Initial resize
  setTimeout(() => autoResizeTextarea(textarea), 50);
}
function autoResizeTextarea(el) {
  el.style.height = "auto";
  el.style.height = Math.min(Math.max(el.scrollHeight, 54), 300) + "px";
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
