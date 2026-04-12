// ============================================================
// Pinboard Bookmark Enhanced - Tag Input & Autocomplete
// ============================================================

// ---- Suggest Tags (Pinboard API) ----
async function fetchPinboardSuggestTags(token, url) {
  const container = document.getElementById("pinboard-suggest-tags");
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
      const resp = await pinboardFetch(`https://api.pinboard.in/v1/posts/suggest?url=${enc(url)}&auth_token=${token}&format=json`);
      if (!resp.ok) {
        if (resp.status === 500) { container.textContent = t("suggestNoSuggestions"); container.classList.add("muted"); return; }
        throw new Error(`HTTP ${resp.status}`);
      }
      data = await resp.json();
      chrome.storage.local.set({ [cacheKey]: { data, timestamp: Date.now() } }).catch(() => {});
    } catch (e) {
      container.textContent = t("suggestFailed", e.message || String(e));
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

    const addAllSuggest = document.getElementById("add-all-suggest");
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
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    applyTagData(data);
    await chrome.storage.local.set({ [cacheKey]: { tags: allUserTags, counts: allUserTagCounts, timestamp: Date.now() } });
  } catch (e) { console.error(e); }
}

// ---- Tags Input Setup ----
function setupTagsInput() {
  const input = document.getElementById("tags-input");
  const dropdown = document.getElementById("tags-autocomplete");
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
  document.getElementById("tags-clear-all")?.addEventListener("click", (e) => {
    e.preventDefault();
    currentTags = [];
    renderTags();
  });
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
  const d = document.getElementById("tags-display"); d.innerHTML = "";
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
  const clearBtn = document.getElementById("tags-clear-all");
  if (clearBtn) clearBtn.classList.toggle("hidden", currentTags.length < 2);
  syncSuggestTagStates();
}

function syncSuggestTagStates() {
  const lowerTags = new Set(currentTags.map(t => t.toLowerCase()));
  document.querySelectorAll("#pinboard-suggest-tags .stag, #ai-suggest-tags .stag").forEach((el) => {
    const tag = (el.dataset.tag || "").toLowerCase();
    if (lowerTags.has(tag)) el.classList.add("used");
    else el.classList.remove("used");
  });
}
