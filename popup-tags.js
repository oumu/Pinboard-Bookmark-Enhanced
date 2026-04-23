// ============================================================
// Pinboard Bookmark Enhanced - Tag Input & Autocomplete
// ============================================================

// ---- Suggest Tags (Pinboard API) ----
async function fetchPinboardSuggestTags(token, url) {
  const container = $id("pinboard-suggest-tags");
  const cacheKey = "cached_suggest_" + url;
  const SUGGEST_TTL = 10 * 60 * 1000; // 10 minutes

  let data;
  try {
    const stored = await chrome.storage.local.get(cacheKey);
    if (stored[cacheKey] && Date.now() - stored[cacheKey].timestamp < SUGGEST_TTL) {
      data = stored[cacheKey].data;
    }
  } catch (_) {}

  if (!data) {
    try {
      // Suggest is non-critical read-only; bypass rate-limit queue so it fires immediately
      // on popup open instead of waiting 3.1s+ behind fetchAllUserTags. 429 is handled.
      const resp = await pinboardFetchImmediate(`https://api.pinboard.in/v1/posts/suggest?url=${enc(url)}&auth_token=${token}&format=json`, { timeoutMs: 8000 });
      if (!resp.ok) {
        // 500: Pinboard's way of saying "no suggestions for this niche URL"
        if (resp.status === 500) { container.textContent = t("suggestNoSuggestions"); container.classList.add("muted"); return; }
        // Auth and rate-limit failures are actionable — show specific guidance
        if (resp.status === 401 || resp.status === 403) { container.textContent = t("pinboardErrorAuth"); container.classList.add("muted"); return; }
        if (resp.status === 429) { container.textContent = t("pinboardErrorRateLimit"); container.classList.add("muted"); return; }
        // All other server errors: Pinboard cannot handle this URL
        container.textContent = t("suggestUnavailable");
        container.classList.add("muted");
        return;
      }
      data = await resp.json();
      chrome.storage.local.set({ [cacheKey]: { data, timestamp: Date.now() } }).catch(() => {});
    } catch (e) {
      // Network-level errors (TypeError from connection reset, AbortError from timeout)
      // for the suggest endpoint typically mean Pinboard can't process this URL, not that
      // the user's network is broken — surface a neutral "unavailable" message instead.
      container.textContent = t("suggestUnavailable");
      container.classList.add("muted");
      return;
    }
  }

  try {
    container.innerHTML = "";
    const popular = data[0]?.popular || [];
    const recommended = data[1]?.recommended || [];
    if (!popular.length && !recommended.length) { container.textContent = t("suggestNoSuggestions"); container.classList.add("muted"); return; }

    const resolveTag = (t) => (settings.optRespectTagCase && tagCaseMap) ? resolveTagCase(t, tagCaseMap) : t;

    function buildSuggestGroup(label, tags, addAllId) {
      const g = document.createElement("div");
      g.className = "suggest-group";
      const lbl = document.createElement("span");
      lbl.className = "group-label";
      lbl.textContent = label;
      g.appendChild(lbl);
      // Resolve tags then sort: matched (by count desc) first, unmatched keep original order
      const resolvedTags = tags.map(t => resolveTag(t));
      resolvedTags.sort((a, b) => {
        const ca = allUserTagCounts[a] || 0, cb = allUserTagCounts[b] || 0;
        if (ca && !cb) return -1;
        if (!ca && cb) return 1;
        return 0;
      });
      resolvedTags.forEach((resolved) => {
        const el = document.createElement("span");
        el.className = "stag";
        el.dataset.tag = resolved;
        el.appendChild(document.createTextNode(resolved));
        const count = allUserTagCounts[resolved];
        if (count) {
          const cs = document.createElement("span");
          cs.className = "ac-count";
          cs.textContent = ` (${count})`;
          el.appendChild(cs);
        }
        el.addEventListener("click", () => { addTag(resolved); el.classList.add("used"); });
        g.appendChild(el);
        g.appendChild(document.createTextNode(" "));
      });
      if (addAllId) {
        const aa = document.createElement("span");
        aa.className = "add-all-link";
        aa.id = addAllId;
        aa.textContent = t("addAll");
        g.appendChild(aa);
      }
      return g;
    }

    if (popular.length) container.appendChild(buildSuggestGroup(t("suggestPopular"), popular, null));
    if (recommended.length) container.appendChild(buildSuggestGroup(t("suggestRecommended"), recommended, "add-all-suggest"));

    const addAllSuggest = $id("add-all-suggest");
    addAllSuggest?.addEventListener("click", () => {
      container.querySelectorAll(".stag:not(.used)").forEach((el) => { addTag(el.dataset.tag); el.classList.add("used"); });
      if (addAllSuggest) { addAllSuggest.textContent = "✓"; addAllSuggest.style.pointerEvents = "none"; addAllSuggest.style.color = "#080"; }
    });
  } catch (e) {
    console.error("suggest tags error:", e);
    container.textContent = t("suggestFailed", e.message || String(e));
    container.classList.add("muted");
  }
}

// ---- Fetch All User Tags (with local cache) ----
function applyTagData(counts) {
  allUserTagCounts = counts;
  allUserTags = Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([tag]) => tag);
  tagCaseMap = buildTagCaseMap(counts);
}

async function fetchAllUserTags(token) {
  const cacheKey = "cached_user_tags";
  // Sync mode: "cached" (default, TTL-based) / "fresh" (bypass cache) / "prewarmed" (cache-only; alarm refreshes)
  const mode = (settings && settings.tagSyncMode) || "cached";

  // Try cache first for cached/prewarmed
  if (mode !== "fresh") {
    try {
      const cached = await chrome.storage.local.get(cacheKey);
      if (cached[cacheKey]) {
        const { tags, counts, timestamp } = cached[cacheKey];
        const fresh = Date.now() - timestamp < TAG_CACHE_TTL;
        if (mode === "prewarmed" || fresh) {
          applyTagData(counts);
          allUserTags = tags; // preserve cached sort order
          return;
        }
      }
    } catch (_) {}
    // In prewarmed mode without any cache yet, fall through to fetch once so UI is usable
  }

  // Fetch from Pinboard (fresh or cached-expired or prewarmed-missing)
  try {
    const resp = await pinboardFetch(`https://api.pinboard.in/v1/tags/get?auth_token=${token}&format=json`);
    if (resp.status === 401) return; // pinboardFetch already redirected to login
    if (!resp.ok) {
      showTagSyncError(classifyPinboardError(resp));
      return;
    }
    const data = await resp.json();
    applyTagData(data);
    await chrome.storage.local.set({ [cacheKey]: { tags: allUserTags, counts: allUserTagCounts, timestamp: Date.now() } });
  } catch (e) {
    console.error(e);
    showTagSyncError(classifyPinboardError(e));
  }
}

// Surface user-tag sync errors in the same container as suggest errors (unified "tag help" area).
// Does not overwrite when suggest has already rendered tags — muted class signals error state.
function showTagSyncError(i18nKey) {
  const container = $id("pinboard-suggest-tags");
  if (!container) return;
  // Don't overwrite suggest results or an already-shown error/timeout message
  if (container.querySelector(".suggest-group") || container.textContent.trim()) return;
  container.textContent = t(i18nKey);
  container.classList.add("muted");
}

// ---- Tags Input Setup ----
function setupTagsInput() {
  const input = $id("tags-input");
  const dropdown = $id("tags-autocomplete");
  let acDebounceTimer = null;
  input.addEventListener("input", () => {
    clearTimeout(acDebounceTimer);
    acDebounceTimer = setTimeout(handleTagInput, 120);
  });
  function handleTagInput() {
    const val = input.value.trim().toLowerCase(); acIndex = -1;
    if (!val) { dropdown.classList.add("hidden"); return; }
    const matches = allUserTags.filter((t) =>
      t.toLowerCase().includes(val) &&
      !currentTags.some((ct) => ct.toLowerCase() === t.toLowerCase())
    ).sort((a, b) => {
      const al = a.toLowerCase(), bl = b.toLowerCase();
      const ap = al.startsWith(val), bp = bl.startsWith(val);
      if (ap !== bp) return ap ? -1 : 1;
      return 0;
    }).slice(0, 10);
    if (!matches.length) {
      dropdown.innerHTML = "";
      const hint = document.createElement("div");
      hint.className = "ac-item ac-new-hint";
      const icon = document.createElement("span"); icon.className = "ac-new-icon"; icon.textContent = "+ ";
      hint.appendChild(icon); hint.appendChild(document.createTextNode(input.value.trim()));
      hint.addEventListener("click", () => { addTag(input.value.trim()); input.value = ""; dropdown.classList.add("hidden"); input.focus(); });
      dropdown.appendChild(hint);
      dropdown.classList.remove("hidden");
      return;
    }
    dropdown.innerHTML = "";
    matches.forEach((tag) => {
      const item = document.createElement("div"); item.className = "ac-item";
      item.dataset.tag = tag;
      item.textContent = tag;
      const count = allUserTagCounts[tag];
      if (count) {
        const countSpan = document.createElement("span");
        countSpan.className = "ac-count";
        countSpan.textContent = `(${count})`;
        item.appendChild(countSpan);
      }
      item.addEventListener("click", () => { addTag(tag); input.value = ""; dropdown.classList.add("hidden"); input.focus(); });
      dropdown.appendChild(item);
    });
    dropdown.classList.remove("hidden");
  }
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
        addTag(items[acIndex].dataset.tag);
      } else if (items.length > 0 && !dropdown.classList.contains("hidden")) {
        addTag(items[0].dataset.tag);
      } else if (input.value.trim()) {
        input.value.trim().split(/[\s,]+/).filter(Boolean).forEach((t) => addTag(t));
      }
      input.value = ""; dropdown.classList.add("hidden");
    } else if (e.key === " " || e.key === "," || e.key === "，") {
      const v = input.value.replace(/[,，]/g, "").trim();
      if (v) { e.preventDefault(); addTag(v); input.value = ""; dropdown.classList.add("hidden"); }
      else if (e.key !== " ") e.preventDefault();
    } else if (e.key === "Backspace" && !input.value && currentTags.length) { removeTag(currentTags[currentTags.length - 1]); }
    else if (e.key === "Escape") { dropdown.classList.add("hidden"); }
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".tags-input-wrap") && !e.target.closest(".autocomplete-dropdown")) dropdown.classList.add("hidden");
  });
  $id("tags-clear-all")?.addEventListener("click", (e) => {
    e.preventDefault();
    currentTags = [];
    renderTags();
  });
  $id("tags-copy-all")?.addEventListener("click", async (e) => {
    e.preventDefault();
    if (!currentTags.length) return;
    const text = currentTags.join(" ");
    try { await navigator.clipboard.writeText(text); }
    catch (_) {
      const ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch (_) {}
      document.body.removeChild(ta);
    }
    const btn = $id("tags-copy-all");
    const orig = btn.textContent;
    btn.textContent = t("tagsCopied", String(currentTags.length));
    btn.classList.add("tag-copied-flash");
    setTimeout(() => { btn.textContent = orig; btn.classList.remove("tag-copied-flash"); }, 1200);
  });
  $id("tags-last-used")?.addEventListener("click", (e) => {
    e.preventDefault();
    const raw = e.currentTarget.dataset.tags || "";
    if (!raw) return;
    raw.split(/\s+/).filter(Boolean).forEach(tag => addTag(tag));
  });
  loadLastUsedTags();
}

// ---- Last-used tags memory ----
let _lastUsedTagsCache = [];

async function loadLastUsedTags() {
  try {
    const { lastUsedTags } = await chrome.storage.local.get("lastUsedTags");
    if (Array.isArray(lastUsedTags) && lastUsedTags.length) {
      _lastUsedTagsCache = lastUsedTags;
      renderLastUsedHint();
    }
  } catch (_) {}
}

function renderLastUsedHint() {
  const el = $id("tags-last-used");
  if (!el) return;
  if (!_lastUsedTagsCache.length || currentTags.length > 0) {
    el.classList.add("hidden");
    return;
  }
  while (el.firstChild) el.removeChild(el.firstChild);
  const label = document.createElement("span");
  label.className = "lu-label";
  label.textContent = t("lastUsedTagsLabel");
  const tags = document.createElement("span");
  tags.className = "lu-tags";
  tags.textContent = _lastUsedTagsCache.join(" ");
  el.appendChild(label);
  el.appendChild(tags);
  el.dataset.tags = _lastUsedTagsCache.join(" ");
  el.classList.remove("hidden");
}

function saveLastUsedTags(tags) {
  if (!Array.isArray(tags) || !tags.length) return;
  const snapshot = tags.slice();
  _lastUsedTagsCache = snapshot;
  try { chrome.storage.local.set({ lastUsedTags: snapshot }).catch(() => {}); } catch (_) {}
}

function updateAc(items) { items.forEach((el, i) => el.classList.toggle("selected", i === acIndex)); }

let _newlyAddedTag = null;

function addTag(tag) {
  tag = tag.trim().replace(/\s+/g, settings.aiTagSeparator || "-");
  if (!tag) return;
  if (settings.optRespectTagCase && tagCaseMap) {
    tag = resolveTagCase(tag, tagCaseMap);
  }
  if (currentTags.some((t) => t.toLowerCase() === tag.toLowerCase())) return;
  currentTags.push(tag);
  _newlyAddedTag = tag.toLowerCase();
  renderTags();
  _newlyAddedTag = null;
}

function removeTag(tag) {
  currentTags = currentTags.filter((t) => t.toLowerCase() !== tag.toLowerCase());
  renderTags();
}

function renderTags() {
  const d = $id("tags-display"); d.innerHTML = "";
  currentTags.forEach((tag, idx) => {
    const el = document.createElement("span"); el.className = "tag-item";
    if (_newlyAddedTag && tag.toLowerCase() === _newlyAddedTag) el.classList.add("is-new");
    el.draggable = true;
    el.dataset.idx = idx;
    const text = document.createTextNode(tag);
    const rm = document.createElement("span");
    rm.className = "tag-remove";
    rm.innerHTML = "&times;";
    rm.addEventListener("click", () => removeTag(tag));
    el.appendChild(text);
    el.appendChild(rm);
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
  const clearBtn = $id("tags-clear-all");
  if (clearBtn) clearBtn.classList.toggle("hidden", currentTags.length < 2);
  const copyBtn = $id("tags-copy-all");
  if (copyBtn) copyBtn.classList.toggle("hidden", currentTags.length < 1);
  renderLastUsedHint();
  syncSuggestTagStates();
  if (typeof updateCharCount === "function") updateCharCount();
}

function syncSuggestTagStates() {
  const lowerTags = new Set(currentTags.map(t => t.toLowerCase()));
  document.querySelectorAll("#pinboard-suggest-tags .stag, #ai-suggest-tags .stag").forEach((el) => {
    const tag = (el.dataset.tag || "").toLowerCase();
    if (lowerTags.has(tag)) el.classList.add("used");
    else el.classList.remove("used");
  });
}
