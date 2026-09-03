// ============================================================
// Pinboard Bookmark Enhanced - Tag Input & Autocomplete
// ============================================================

function pbpPopupTagCacheEntry(entry, token) {
  const account = pbpPinboardAccountFromToken(token);
  return account && entry && typeof entry === "object" && !Array.isArray(entry)
    && entry.account === account
    ? entry
    : null;
}

function pbpPopupTagCacheEnvelope(token, payload) {
  const account = pbpPinboardAccountFromToken(token);
  return account ? { ...payload, account } : null;
}

function pbpPopupTagAccountIsCurrent(account) {
  const token = typeof settings === "object" && settings ? settings.pinboardToken : "";
  return !!account && pbpPinboardAccountFromToken(token) === account;
}

// ---- Suggest Tags (Pinboard API) ----
async function fetchPinboardSuggestTags(token, url) {
  const container = $id("pinboard-suggest-tags");
  const cacheKey = "cached_suggest_" + url;
  const SUGGEST_TTL = 10 * 60 * 1000; // 10 minutes
  const account = pbpPinboardAccountFromToken(token);

  if (!account || !pbpPopupTagAccountIsCurrent(account)) {
    // Nothing will be fetched, so take the markup's skeleton down here: this
    // bail-out is outside the try below, so its finally never runs.
    container.replaceChildren();
    container.setAttribute("aria-busy", "false");
    return;
  }

  // The four .tag-skel bars popup.html ships stay up until content lands.
  // Clearing them here ran in the same task as popup.js unhiding #suggest-row,
  // so the browser never painted them and the whole request read as an empty
  // row; every writer below replaces the container's children wholesale.
  try {
  let data;
  try {
    const stored = await chrome.storage.local.get(cacheKey);
    if (!pbpPopupTagAccountIsCurrent(account)) return;
    const entry = pbpPopupTagCacheEntry(stored[cacheKey], token);
    if (entry && Date.now() - entry.timestamp < SUGGEST_TTL) {
      data = entry.data;
    }
  } catch (_) {}

  if (!pbpPopupTagAccountIsCurrent(account)) return;
  if (!data) {
    try {
      // Suggest is non-critical read-only; bypass rate-limit queue so it fires immediately
      // on popup open instead of waiting 3.1s+ behind fetchAllUserTags. 429 is handled.
      const resp = await pinboardFetchImmediate(`https://api.pinboard.in/v1/posts/suggest?url=${enc(url)}&auth_token=${token}&format=json`, { timeoutMs: 8000 });
      if (!pbpPopupTagAccountIsCurrent(account)) return;
      if (!resp.ok) {
        // Auth and rate-limit failures are actionable — show specific guidance
        if (resp.status === 401 || resp.status === 403) { container.textContent = t("pinboardErrorAuth"); container.classList.add("muted"); return; }
        if (resp.status === 429) { container.textContent = t("pinboardErrorRateLimit"); container.classList.add("muted"); return; }
        // Everything else (500, other server errors): surface as neutral "no suggestions"
        container.textContent = t("emptyTagSuggestions");
        container.classList.add("muted");
        return;
      }
      data = await resp.json();
      if (!pbpPopupTagAccountIsCurrent(account)) return;
      const entry = pbpPopupTagCacheEnvelope(token, { data, timestamp: Date.now() });
      if (entry) chrome.storage.local.set({ [cacheKey]: entry }).catch(() => {});
    } catch (e) {
      if (!pbpPopupTagAccountIsCurrent(account)) return;
      // Network-level errors for the suggest endpoint typically mean Pinboard can't process
      // this URL, not that the user's network is broken — surface the same neutral message.
      container.textContent = t("emptyTagSuggestions");
      container.classList.add("muted");
      return;
    }
  }

  try {
    if (!pbpPopupTagAccountIsCurrent(account)) return;
    while (container.firstChild) container.removeChild(container.firstChild);
    const popular = data[0]?.popular || [];
    const recommended = data[1]?.recommended || [];
    if (!popular.length && !recommended.length) {
      container.textContent = t("emptyTagSuggestions");
      container.classList.add("muted");
      return;
    }

    const resolveTag = (t) => (settings.optRespectTagCase && tagCaseMap) ? resolveTagCase(t, tagCaseMap) : t;

    function buildSuggestGroup(label, tags, addAllId) {
      const g = document.createElement("div");
      g.className = "suggest-group";
      const lbl = document.createElement("span");
      lbl.className = "group-label";
      lbl.textContent = label;
      g.appendChild(lbl);
      // Alt+1..9 hint now rides pbpAssignAltNumBadges (finally-block below):
      // it must exist even when this function never runs (no suggestions but
      // AI chips present), so it can't live here anymore.
      // Resolve tags then sort: matched (by count desc) first, unmatched keep original order
      const resolvedTags = tags.map(t => resolveTag(t));
      resolvedTags.sort((a, b) => {
        const ca = allUserTagCounts[a] || 0, cb = allUserTagCounts[b] || 0;
        if (ca && !cb) return -1;
        if (!ca && cb) return 1;
        return 0;
      });
      resolvedTags.forEach((resolved) => {
        const el = document.createElement("button");
        el.type = "button";
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
        el.addEventListener("click", () => { addTag(resolved); el.classList.add("used"); el.disabled = true; });
        g.appendChild(el);
        g.appendChild(document.createTextNode(" "));
      });
      if (addAllId) {
        const aa = document.createElement("button");
        aa.type = "button";
        aa.className = "add-all-link";
        aa.id = addAllId;
        aa.textContent = t("addAll");
        aa.setAttribute("aria-label", t("addAll"));
        g.appendChild(aa);
      }
      return g;
    }

    if (popular.length) container.appendChild(buildSuggestGroup(t("suggestPopular"), popular, null));
    if (recommended.length) container.appendChild(buildSuggestGroup(t("suggestRecommended"), recommended, "add-all-suggest"));

    const addAllSuggest = $id("add-all-suggest");
    addAllSuggest?.addEventListener("click", () => {
      container.querySelectorAll(".stag:not(.used)").forEach((el) => { addTag(el.dataset.tag); el.classList.add("used"); });
      if (addAllSuggest) { addAllSuggest.innerHTML = PBP_ICONS.check; addAllSuggest.disabled = true; addAllSuggest.classList.add("tag-copied-flash"); }
    });
  } catch (e) {
    if (!pbpPopupTagAccountIsCurrent(account)) return;
    console.error("suggest tags error:", e);
    container.textContent = t("suggestFailed", e.message || String(e));
    container.classList.add("muted");
  }
  } finally {
    container.setAttribute("aria-busy", "false");
    // A mid-flight bail-out (account drifted) writes nothing, and the skeleton
    // is no longer wiped up front -- it would pulse for the life of the popup.
    if (container.querySelector(".tag-skel")) container.replaceChildren();
    // Every exit path (chips rendered, empty, auth/429/network error) re-slots
    // Alt+N across both rows -- AI chips may already be on screen and must
    // keep working digits + the hint even when suggest came back empty.
    pbpAssignAltNumBadges();
  }
}

// ---- Fetch All User Tags (with local cache) ----
function applyTagData(counts) {
  allUserTagCounts = counts;
  allUserTags = pbpTagsByCount(counts); // shared.js: same ordering the SW AI prompts use (A14)
  tagCaseMap = buildTagCaseMap(counts);
}

// Prewarmed mode serves cache ignoring the 10-min TTL (the SW alarm refreshes it),
// but with a staleness ceiling: if the alarm clearly hasn't run (cache older than
// this), fall through to a one-shot fetch so tags can't be stuck stale forever.
const PREWARM_STALE_CEILING = 2 * 60 * 60 * 1000; // 2 hours
let _popupUserTagAccount = "";

async function fetchAllUserTags(token) {
  const cacheKey = "cached_user_tags";
  const account = pbpPinboardAccountFromToken(token);
  if (!account || !pbpPopupTagAccountIsCurrent(account)) return;
  if (_popupUserTagAccount !== account) {
    applyTagData({});
    _popupUserTagAccount = account;
  }
  // Sync mode: "cached" (default, TTL-based) / "fresh" (bypass cache) / "prewarmed" (cache-first; alarm refreshes)
  const mode = (settings && settings.tagSyncMode) || "cached";

  // Try cache first for cached/prewarmed
  if (mode !== "fresh") {
    try {
      const cached = await chrome.storage.local.get(cacheKey);
      if (!pbpPopupTagAccountIsCurrent(account)) return;
      const entry = pbpPopupTagCacheEntry(cached[cacheKey], token);
      if (entry && entry.counts) {
        const age = Date.now() - (entry.timestamp || 0);
        const usable = mode === "prewarmed"
          ? age < PREWARM_STALE_CEILING
          : age < TAG_CACHE_TTL;
        if (usable) {
          applyTagData(entry.counts); // rebuilds the sorted tag list from counts
          return;
        }
      }
    } catch (_) {}
    // No usable cache (missing / expired / prewarmed-but-too-stale): fetch once so UI is usable
  }

  if (!pbpPopupTagAccountIsCurrent(account)) return;
  // Fetch from Pinboard (fresh, or cached-expired, or prewarmed-stale/missing)
  try {
    const resp = await pinboardFetch(`https://api.pinboard.in/v1/tags/get?auth_token=${token}&format=json`);
    if (!pbpPopupTagAccountIsCurrent(account)) return;
    if (resp.status === 401) return; // pinboardFetch already redirected to login
    if (!resp.ok) {
      showTagSyncError(classifyPinboardError(resp));
      return;
    }
    const data = await resp.json();
    if (!pbpPopupTagAccountIsCurrent(account)) return;
    applyTagData(data);
    const entry = pbpPopupTagCacheEnvelope(token, { counts: allUserTagCounts, timestamp: Date.now() });
    // Caught here, not by the outer catch: applyTagData already ran, so
    // autocomplete, the counts and the AI prompt's "existing tags" are all
    // live. A local-storage quota failure (jina_md_ / cached_suggest_ can fill
    // it on a heavy user) is a lost cache entry, not a failed sync -- letting
    // it fall through classified it as "you appear to be offline" and, since
    // the skeletons still occupy the inline container, showTagSyncError
    // escalated it to the full-width red card on every popup open.
    // Same treatment the suggest cache write already gets (.catch(() => {})).
    if (entry) {
      try { await chrome.storage.local.set({ [cacheKey]: entry }); }
      catch (e) { console.warn("[tags] cache write failed:", e?.name, e?.message); }
    }
  } catch (e) {
    if (!pbpPopupTagAccountIsCurrent(account)) return;
    console.error("user-tag sync failed:", e);
    showTagSyncError(classifyPinboardError(e));
  }
}

// Surface user-tag sync errors in the same container as suggest errors (unified "tag help" area).
// Does not overwrite when suggest has already rendered tags — muted class signals error state.
// When that container cannot speak — #suggest-row is hidden (optShowSuggestTags off) or suggest
// already filled it — fall back to the popup's .feedback-card error, the surface the save and
// batch failures use. tags/get is the only source for autocomplete, tag counts, case folding and
// the AI prompt's "existing tags", so its failure must never be silent.
function showTagSyncError(i18nKey) {
  const container = $id("pinboard-suggest-tags");
  const rowHidden = !!$id("suggest-row")?.classList.contains("hidden");
  // .tag-skel counts as occupied: suggest is still in flight and will replace
  // whatever we write here, so an inline message would be eaten unseen.
  const occupied = !!container
    && !!(container.querySelector(".suggest-group, .tag-skel") || container.textContent.trim());
  if (!container || rowHidden || occupied) {
    showStatus("status-msg", t(i18nKey), "error");
    return;
  }
  container.textContent = t(i18nKey);
  container.classList.add("muted");
}

// ---- Tags Input Setup ----
function setupTagsInput() {
  const input = $id("tags-input");
  const dropdown = $id("tags-autocomplete");
  let acRaf = 0;
  function closeAutocomplete() {
    dropdown.classList.add("hidden");
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    acIndex = -1;
  }
  function openAutocomplete() {
    dropdown.classList.remove("hidden");
    input.setAttribute("aria-expanded", "true");
  }
  /* rAF, not a debounce timer: the filter is an in-memory array scan, so the
     suggestions can be on screen the same frame as the keystroke. A fixed
     delay here reads as input lag on the hottest path in the popup. IME
     composition is the exception — rebuilding mid-composition flickers the
     dropdown on every dead key, so wait for compositionend. */
  input.addEventListener("input", (e) => {
    if (e.isComposing) return;
    if (acRaf) return;
    acRaf = requestAnimationFrame(() => { acRaf = 0; handleTagInput(); });
  });
  input.addEventListener("compositionend", () => handleTagInput());
  function handleTagInput() {
    const val = input.value.trim().toLowerCase(); acIndex = -1;
    input.removeAttribute("aria-activedescendant");
    if (!val) { closeAutocomplete(); return; }
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
      hint.id = "tags-ac-option-0";
      hint.setAttribute("role", "option");
      hint.setAttribute("aria-selected", "false");
      hint.dataset.tag = input.value.trim();
      const icon = document.createElement("span"); icon.className = "ac-new-icon"; icon.textContent = "+ ";
      hint.appendChild(icon); hint.appendChild(document.createTextNode(input.value.trim()));
      hint.addEventListener("click", () => { addTag(input.value.trim()); input.value = ""; closeAutocomplete(); input.focus(); });
      dropdown.appendChild(hint);
      openAutocomplete();
      return;
    }
    dropdown.innerHTML = "";
    const scrollEl = document.createElement("div");
    scrollEl.className = "ac-scroll";
    scrollEl.setAttribute("role", "presentation");
    matches.forEach((tag, index) => {
      const item = document.createElement("div"); item.className = "ac-item";
      item.id = `tags-ac-option-${index}`;
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", "false");
      item.dataset.tag = tag;
      item.textContent = tag;
      const count = allUserTagCounts[tag];
      if (count) {
        const countSpan = document.createElement("span");
        countSpan.className = "ac-count";
        countSpan.textContent = `(${count})`;
        item.appendChild(countSpan);
      }
      item.addEventListener("click", () => { addTag(tag); input.value = ""; closeAutocomplete(); input.focus(); });
      scrollEl.appendChild(item);
    });
    dropdown.appendChild(scrollEl);
    const footer = document.createElement("div");
    footer.className = "ac-hint-footer";
    footer.setAttribute("aria-hidden", "true");
    const kEnter = document.createElement("kbd"); kEnter.textContent = "Enter";
    const kTab = document.createElement("kbd"); kTab.textContent = "Tab";
    const kSpace = document.createElement("kbd"); kSpace.textContent = "Space";
    footer.appendChild(kEnter);
    footer.appendChild(document.createTextNode(" / "));
    footer.appendChild(kTab);
    footer.appendChild(document.createTextNode(" " + t("tagsHintSelect") + " · "));
    footer.appendChild(kSpace);
    footer.appendChild(document.createTextNode(" " + t("tagsHintNew")));
    dropdown.appendChild(footer);
    openAutocomplete();
  }
  input.addEventListener("paste", (e) => {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData("text");
    if (text) {
      text.split(/[,\s]+/).map(t => t.trim()).filter(Boolean).forEach(t => addTag(t));
      input.value = "";
      closeAutocomplete();
    }
  });
  input.addEventListener("keydown", (e) => {
    // IME composition dispatches Enter (confirm) and Space (candidate pick) as
    // real keydowns while input.value still holds the uncommitted string, so
    // without this the branches below submit half-typed pinyin/kana as a tag
    // (same guard as md-ask.js / library-vocab.js; keyCode 229 covers the
    // ordering where compositionend fires first).
    if (e.isComposing || e.keyCode === 229) return;
    let items = dropdown.querySelectorAll(".ac-item");
    let acVisible = !dropdown.classList.contains("hidden") && items.length > 0;
    if (e.key === "ArrowDown" && acVisible) { e.preventDefault(); acIndex = acIndex >= items.length - 1 ? 0 : acIndex + 1; updateAc(items, input); }
    else if (e.key === "ArrowUp" && acVisible) { e.preventDefault(); acIndex = acIndex <= 0 ? items.length - 1 : acIndex - 1; updateAc(items, input); }
    else if (e.key === "Enter" || e.key === "Tab") {
      // The rebuild is coalesced into a rAF, and a keydown can drain before
      // that frame runs (cold popup, janked main thread). The dropdown then
      // still describes the PREVIOUS input string -- committing items[0], or
      // the ac-new-hint carrying the truncated value, adds the wrong tag.
      // Flush the pending rebuild first, then read it.
      if (acRaf) {
        cancelAnimationFrame(acRaf);
        acRaf = 0;
        handleTagInput();
        items = dropdown.querySelectorAll(".ac-item");
        acVisible = !dropdown.classList.contains("hidden") && items.length > 0;
      }
      const hasPending = input.value.trim().length > 0;
      if (e.key === "Tab" && !acVisible && !hasPending) return;
      e.preventDefault();
      if (acIndex >= 0 && items[acIndex]) {
        addTag(items[acIndex].dataset.tag);
      } else if (acVisible) {
        addTag(items[0].dataset.tag);
      } else if (hasPending) {
        input.value.trim().split(/[\s,]+/).filter(Boolean).forEach((t) => addTag(t));
      }
      input.value = ""; closeAutocomplete();
    } else if (e.key === " " || e.key === "," || e.key === "，") {
      const v = input.value.replace(/[,，]/g, "").trim();
      if (v) { e.preventDefault(); addTag(v); input.value = ""; closeAutocomplete(); }
      else if (e.key !== " ") e.preventDefault();
    } else if (e.key === "Backspace" && !input.value && currentTags.length) { removeTag(currentTags[currentTags.length - 1]); }
    else if (e.key === "Escape") { closeAutocomplete(); }
  });
  // Dropping a dragged tag past the last chip lands on this flex-grow input.
  // Guard it so native DnD never inserts the index; move the tag to the end instead.
  input.addEventListener("dragover", (e) => { if (_dragReorderFromIdx !== null) e.preventDefault(); });
  input.addEventListener("drop", (e) => {
    if (_dragReorderFromIdx === null) return;   // genuine external text drop -> leave native behavior intact
    e.preventDefault();
    const from = _dragReorderFromIdx;
    if (from >= 0 && from < currentTags.length - 1) {
      const [moved] = currentTags.splice(from, 1);
      currentTags.push(moved);
      renderTags();
    }
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".tags-input-wrap") && !e.target.closest(".autocomplete-dropdown")) closeAutocomplete();
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
    // Swap only the label span -- overwriting the whole button would wipe the
    // .btn-ic SVG the markup now carries.
    const lbl = btn.querySelector(".link-label") || btn;
    const orig = lbl.textContent;
    lbl.textContent = t("tagsCopied", String(currentTags.length));
    btn.classList.add("tag-copied-flash");
    setTimeout(() => { lbl.textContent = orig; btn.classList.remove("tag-copied-flash"); }, 1200);
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
  const token = typeof settings === "object" && settings ? settings.pinboardToken : "";
  const account = pbpPinboardAccountFromToken(token);
  _lastUsedTagsCache = [];
  renderLastUsedHint();
  if (!account) return;
  try {
    const key = pbpAccountStorageKey("lastUsedTags", account);
    const stored = await chrome.storage.local.get(key);
    if (!pbpPopupTagAccountIsCurrent(account)) return;
    const entry = pbpPopupTagCacheEntry(stored[key], token);
    if (Array.isArray(entry?.tags) && entry.tags.length) {
      _lastUsedTagsCache = entry.tags.slice();
      renderLastUsedHint();
    }
  } catch (_) {}
}

function renderLastUsedHint() {
  const el = $id("tags-last-used");
  if (!el) return;
  if (!_lastUsedTagsCache.length || currentTags.length > 0) {
    delete el.dataset.tags;
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

function saveLastUsedTags(tags, expectedAccount = "") {
  if (!Array.isArray(tags) || !tags.length) return;
  const token = typeof settings === "object" && settings ? settings.pinboardToken : "";
  if (expectedAccount && pbpPinboardAccountFromToken(token) !== expectedAccount) return;
  const snapshot = tags.slice();
  const entry = pbpPopupTagCacheEnvelope(token, { tags: snapshot });
  if (!entry) return;
  const key = pbpAccountStorageKey("lastUsedTags", entry.account);
  _lastUsedTagsCache = snapshot;
  try { chrome.storage.local.set({ [key]: entry }).catch(() => {}); } catch (_) {}
}

function updateAc(items, input) {
  items.forEach((el, i) => {
    const selected = i === acIndex;
    el.classList.toggle("selected", selected);
    el.setAttribute("aria-selected", String(selected));
  });
  const active = items[acIndex];
  if (active) {
    input.setAttribute("aria-activedescendant", active.id);
    active.scrollIntoView({ block: "nearest" });
  }
  else input.removeAttribute("aria-activedescendant");
}

let _dragReorderFromIdx = null;

function addTag(tag) {
  if (typeof tag !== "string" || !tag) return;
  tag = tag.trim().replace(/\s+/g, settings.aiTagSeparator || "-");
  if (!tag) return;
  if (settings.optRespectTagCase && tagCaseMap) {
    tag = resolveTagCase(tag, tagCaseMap);
  }
  if (currentTags.some((t) => t.toLowerCase() === tag.toLowerCase())) return;
  currentTags.push(tag);
  renderTags();
}

function removeTag(tag) {
  currentTags = currentTags.filter((t) => t.toLowerCase() !== tag.toLowerCase());
  // Codex r2 M3: a removed tag loses its AI provenance - if the user
  // re-adds the same name by hand, replace-mode regen must treat it as
  // the user's tag and never retract it.
  if (typeof _aiSessionAddedTags !== "undefined") _aiSessionAddedTags.delete(tag.toLowerCase());
  renderTags();
}

function renderTags() {
  const d = $id("tags-display"); d.innerHTML = "";
  currentTags.forEach((tag, idx) => {
    const el = document.createElement("span"); el.className = "tag-item";
    el.draggable = true;
    el.dataset.idx = idx;
    const handle = document.createElement("span");
    handle.className = "tag-drag-handle";
    // Grip dots are CSS-drawn (radial-gradient), not a ⋮⋮ (U+22EE) glyph,
    // which can fall back to a slow emoji font on Windows hi-DPI Chrome.
    handle.setAttribute("aria-hidden", "true");
    el.appendChild(handle);
    const text = document.createTextNode(tag);
    const rm = document.createElement("button");
    rm.type = "button";
    rm.className = "tag-remove";
    rm.innerHTML = PBP_ICONS.cross;
    rm.title = t("tagRemoveAria", tag);
    rm.setAttribute("aria-label", t("tagRemoveAria", tag));
    rm.addEventListener("click", () => removeTag(tag));
    el.appendChild(text);
    el.appendChild(rm);
    el.addEventListener("dragstart", (e) => {
      _dragReorderFromIdx = idx;
      e.dataTransfer.effectAllowed = "move";
      // Custom MIME (not text/plain): a drop onto the text input can't then
      // trigger the browser's native "insert dragged text" and stamp the index in.
      e.dataTransfer.setData("application/x-pb-tag-reorder", String(idx));
      el.classList.add("dragging");
    });
    el.addEventListener("dragend", () => { el.classList.remove("dragging"); _dragReorderFromIdx = null; });
    el.addEventListener("dragover", (e) => { e.preventDefault(); el.classList.add("drag-over"); });
    el.addEventListener("dragleave", () => el.classList.remove("drag-over"));
    el.addEventListener("drop", (e) => {
      e.preventDefault(); el.classList.remove("drag-over");
      const fromIdx = _dragReorderFromIdx;
      const toIdx = idx;
      if (fromIdx !== null && fromIdx !== toIdx) {
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
    if (lowerTags.has(tag)) { el.classList.add("used"); el.disabled = true; }
    else { el.classList.remove("used"); el.disabled = false; }
  });
}

// Alt+1..9 slot assignment across BOTH chip rows (suggest, then AI, document
// order). Called only when a chip list is REBUILT (suggest render / AI tags
// render), never on add/remove: the old handler re-indexed the surviving
// :not(.used) chips on every keypress, so each add shifted every later digit
// and Alt+2 could land three chips away from the visibly-second one. Slots
// are therefore STABLE within a render cycle -- a chip used mid-cycle keeps
// its badge but goes disabled, it does not free its number for a neighbor.
// Duplicate tag strings (the same tag can appear in both the popular and the
// recommended API arrays) share one slot: adding either marks both used via
// syncSuggestTagStates, so giving each its own digit would strand a dead slot.
// The visible digit badge IS the mapping the keydown handler resolves
// ([data-alt-num]), so what the user sees is what Alt+N does by construction.
function pbpAssignAltNumBadges() {
  syncSuggestTagStates(); // used-state must be settled BEFORE slots are handed out
  const byTag = new Map(); // lowercase tag -> slot (duplicates share)
  let next = 1;
  document.querySelectorAll("#pinboard-suggest-tags .stag, #ai-suggest-tags .stag").forEach((el) => {
    delete el.dataset.altNum;
    el.removeAttribute("aria-keyshortcuts");
    const old = el.querySelector(".stag-num");
    if (old) old.remove();
    const tag = (el.dataset.tag || "").toLowerCase();
    let slot = byTag.get(tag);
    if (slot === undefined) {
      if (el.classList.contains("used") || next > 9) return; // used at render time gets no slot
      slot = next++;
      byTag.set(tag, slot);
    }
    el.dataset.altNum = String(slot);
    el.setAttribute("aria-keyshortcuts", "Alt+" + slot);
    const b = document.createElement("span");
    b.className = "stag-num";
    b.setAttribute("aria-hidden", "true");
    b.textContent = String(slot);
    el.prepend(b);
  });
  // One hint, riding whichever row actually holds numbered chips first -- the
  // old version lived inside the first suggest group only, so "no suggestions
  // but AI tags present" showed working Alt+N with zero affordance.
  document.querySelectorAll(".alt-num-hint").forEach((h) => h.remove());
  const first = document.querySelector(".stag[data-alt-num]");
  if (!first) return;
  const host = first.closest(".suggest-area");
  if (!host) return;
  const hint = document.createElement("span");
  hint.className = "kb-hint alt-num-hint";
  hint.textContent = t("kbdAltTagHint");
  const groupLabel = host.querySelector(".suggest-group .group-label");
  if (groupLabel) groupLabel.after(hint);
  else host.prepend(hint);
}
