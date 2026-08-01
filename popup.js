// ============================================================
// Pinboard Bookmark Enhanced - Popup (v2.3)
// ============================================================


// Override pinboardFetch to route through background service worker.
// This prevents Chrome's native credentials dialog when Pinboard returns 401.
// (function declarations on window are writable, so reassignment works)
function _pbpProxyPinboardFetch(url, immediate) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: "pinboard_api_call", url, immediate: immediate === true })
      .then(resp => {
        if (!resp) { reject(new Error("no background response")); return; }
        if (resp.status === 401) {
          // Invalid token — redirect to login instead of letting Chrome show the auth dialog
          resetPinboardSession();
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
}

pinboardFetch = function(url) {
  return _pbpProxyPinboardFetch(url, false);
};

pinboardFetchImmediate = function(url) {
  return _pbpProxyPinboardFetch(url, true);
};

let currentTags = [];
let allUserTags = [];
let allUserTagCounts = {};
let tagCaseMap = {};
let pageInfo = {};
let existingBookmark = null;
let bookmarkLookup = { status: "idle", url: "", generation: 0, promise: null, formLoaded: false };
// P2: track which form fields the user has edited so the async existing-bookmark
// lookup never clobbers in-progress input. Resets naturally on each popup open
// (fresh document). Declared top-level so checkExistingBookmark() can read it.
const fieldDirtyFlags = { "title-input": false, "description-input": false, "private-check": false, "readlater-check": false };

function pbpRebasePopupTags(serverTags, submittedTags, liveTags) {
  const baseline = Array.isArray(submittedTags) ? submittedTags : [];
  const current = Array.isArray(liveTags) ? liveTags : [];
  const unchanged = baseline.length === current.length && baseline.every((tag, index) => tag === current[index]);
  if (unchanged) return unionTags(serverTags, current.join(" ")).split(/\s+/).filter(Boolean);

  const controlled = new Set([...baseline, ...current].map((tag) => String(tag).toLowerCase()));
  const serverOnly = String(serverTags || "").split(/\s+/).filter((tag) => tag && !controlled.has(tag.toLowerCase()));
  return unionTags(serverOnly.join(" "), current.join(" ")).split(/\s+/).filter(Boolean);
}

// Wayback per-save toggle: defaults to the auto-decision and tracks the private
// checkbox until the user manually overrides it (then it sticks).
let _archiveUserTouched = false;
function recomputeArchiveCheck() {
  if (_archiveUserTouched) return;
  const el = $id("archive-check");
  if (!el) return;
  el.checked = pbpWaybackShouldArchive({
    enabled: settings.waybackArchiveEnabled === true,
    skipPrivate: settings.waybackSkipPrivate !== false,
    isPrivate: $id("private-check").checked,
    force: false,
    override: undefined,
  });
}

function shouldUpdateField(fieldId) {
  // Don't overwrite a field the user has already typed into / toggled.
  // (Dirty flag is the precise signal; we deliberately do NOT also guard on
  // activeElement — popup.js:906 auto-focuses title-input, and a focused-but-
  // unedited field should still receive the saved value.)
  return !fieldDirtyFlags[fieldId];
}

function invalidateBookmarkLookup() {
  bookmarkLookup = {
    status: "idle",
    url: "",
    generation: bookmarkLookup.generation + 1,
    promise: null,
    formLoaded: false,
  };
  existingBookmark = null;
  const banner = $id("existing-banner");
  if (banner) {
    banner.textContent = "";
    banner.classList.add("hidden");
  }
  try { localStorage.removeItem("pp-last-tab"); } catch (_) {}
  const deleteBtn = $id("delete-btn");
  if (deleteBtn) {
    deleteBtn.querySelector(".del-confirm-popover")?.remove();
    deleteBtn.disabled = false;
    deleteBtn.classList.remove("loading");
    deleteBtn.textContent = t("delete");
    deleteBtn.classList.add("hidden");
  }
  const submitBtn = $id("submit-btn");
  if (submitBtn && !submitBtn.classList.contains("loading") && !submitBtn.classList.contains("saved-success") && !submitBtn.classList.contains("save-error")) {
    submitBtn.textContent = t("submit");
  }
}

let acIndex = -1;
let settings = {};

async function resetPinboardSession() {
  try {
    const result = await persistSettings({ pinboardToken: "" });
    if (!result.ok) return false;
  } catch (_) { return false; }
  settings.pinboardToken = "";
  invalidateBookmarkLookup();
  const recent = $id("recent-bookmarks");
  if (recent) { recent.replaceChildren(); recent.classList.add("hidden"); }
  window.location.reload();
  return true;
}

// ===================== URL Clean Helpers (B4) =====================
// urlClean is loaded as part of SETTINGS_DEFAULTS — no separate storage hit needed.
// Also fixes a latent bug: the previous direct chrome.storage.sync.get bypassed the
// optSyncEnabled toggle, so users with sync disabled would have read defaults instead
// of their saved values (options.js writes via getSettingsStorage, which respects the toggle).
function _loadUrlCleanSettings() {
  return settings.urlClean || { enabled: true, onPopupOpen: true, onPaste: true, aggressiveMode: false, customParams: [], excludeParams: [] };
}

function _renderCleanHint({ removedCount, original }) {
  const hint = $id("url-clean-hint");
  if (!hint) return;
  while (hint.firstChild) hint.removeChild(hint.firstChild);
  if (removedCount <= 0) { hint.classList.add("hidden"); return; }
  hint.classList.remove("hidden");
  const label = document.createElement("span");
  label.textContent = t("urlCleanedN").replace("{n}", removedCount);
  const sep = document.createElement("span");
  sep.textContent = "·";
  const undo = document.createElement("button");
  undo.type = "button";
  undo.className = "url-clean-undo";
  undo.textContent = t("urlShowOriginal");
  undo.addEventListener("click", () => {
    const urlInput = $id("url-input");
    urlInput.value = original;
    urlInput.dispatchEvent(new Event("input", { bubbles: true }));
    hint.classList.add("hidden");
    urlInput.focus();
  });
  hint.appendChild(label); hint.appendChild(sep); hint.appendChild(undo);
}

// Enable decorative transitions (confirm-popover exit in shared.js) only after
// the initial paint — same double-rAF gate as options.js/md-preview.js, so this
// adds zero first-frame cost on the cold-start path.
if (typeof requestAnimationFrame === "function") {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    document.documentElement.classList.add("motion-ready");
  }));
}

document.addEventListener("DOMContentLoaded", async () => {
  document.querySelectorAll(".btn-ic[data-ic]").forEach(s => { s.innerHTML = PBP_ICONS[s.dataset.ic] || ""; });
  initI18n();
  applyI18n();
  setupSecretToggles();

  // B4: validate tab-data mirror against chrome.storage.session._currentTab
  // (set by SW on tab change). If mismatched (tabId or ts > 60s), clear prefill.
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const sess = await chrome.storage.session.get("_currentTab");
    const _currentTab = sess._currentTab;
    const mirrorFresh = _currentTab && _currentTab.ts && (Date.now() - _currentTab.ts < 60000);
    if (!mirrorFresh || !activeTab || _currentTab?.tabId !== activeTab.id) {
      const u = document.getElementById("url-input");
      const ti = document.getElementById("title-input");
      if (u && !document.activeElement?.isSameNode(u)) u.value = "";
      if (ti && !document.activeElement?.isSameNode(ti)) ti.value = "";
    }
  } catch (_) {}

  settings = await pbpReadSettingsWithSecrets(SETTINGS_DEFAULTS);
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

  $id("options-link").addEventListener("click", (e) => {
    e.preventDefault(); pbpOpenOptionsTab("general");
  });
  $id("logout-link").addEventListener("click", (e) => {
    e.preventDefault();
    // Anchored confirm popover, matching every other destructive action —
    // window.confirm is a browser-modal that freezes the whole popup.
    showConfirmPopover($id("logout-link"), {
      msg: t("confirmLogout"),
      yesText: t("logout"),
      noText: t("cancel"),
      onConfirm: async () => {
        const result = await persistSettings({ pinboardToken: "" });
        if (!result.ok) return;
        settings.pinboardToken = "";
        invalidateBookmarkLookup();
        const recent = $id("recent-bookmarks");
        if (recent) { recent.replaceChildren(); recent.classList.add("hidden"); }
        window.location.reload();
      },
    });
  });
});

// ===================== Login =====================
function showLogin() {
  document.documentElement.dataset.section = "login";
  try { localStorage.removeItem("pp-logged-in"); } catch (_) {}
  $id("login-section").classList.remove("hidden");
  $id("main-section").classList.add("hidden");
  const qa = document.querySelector(".quick-actions");
  if (qa) qa.classList.add("hidden");
}
// Login listener — bound once outside showLogin() to avoid duplicate listeners
$id("login-btn").addEventListener("click", async (event) => {
  const loginBtn = event.currentTarget;
  if (loginBtn.disabled) return;
  loginBtn.disabled = true;
  const token = $id("token-input").value.trim();
  // Same shape rule the options field warns with (shared.js), so a paste that
  // the settings page would flag cannot sail through the login gate.
  if (pbpIsValidTokenFormat(token) !== true) {
    showElement("login-error", t("loginInvalidFormat"));
    loginBtn.disabled = false;
    return;
  }
  try {
    const res = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: "test_pinboard_token", token }, (resp) => {
        if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
        resolve(resp);
      });
    });
    if (res.ok) {
      const saved = await persistSettings({ pinboardToken: obfuscateKey(token) });
      if (!saved.ok) { showElement("login-error", t("networkError")); return; }
      settings.pinboardToken = token;
      const recent = $id("recent-bookmarks");
      if (recent) { recent.replaceChildren(); recent.classList.add("hidden"); }
      showMain(token);
    } else showElement("login-error", t("loginFailed"));
  } catch (e) { showElement("login-error", t("networkError")); }
  finally { loginBtn.disabled = false; }
});

// ===================== Main =====================
async function showMain(token) {
  document.documentElement.dataset.section = "main";
  try { localStorage.setItem("pp-logged-in", "1"); } catch (_) {}
  $id("login-section").classList.add("hidden");
  $id("main-section").classList.remove("hidden");
  const qa = document.querySelector(".quick-actions");
  if (qa) qa.classList.remove("hidden");
  const username = token.split(":")[0];
  const sessionAccount = pbpPinboardAccountFromToken(token);
  const userInfo = $id("user-info");
  userInfo.innerHTML = "";
  const pbLink = document.createElement("a");
  pbLink.href = "https://pinboard.in/";
  pbLink.target = "_blank";
  pbLink.textContent = "Pinboard";
  userInfo.appendChild(pbLink);
  userInfo.appendChild(document.createTextNode(` \u2014 ${username}`));
  const unreadLink = $id("unread-link");
  if (unreadLink) unreadLink.href = `https://pinboard.in/u:${encodeURIComponent(username)}/unread/`;

  if (!settings.optShowSearch) {
    const searchRow = document.querySelector(".search-row");
    if (searchRow) searchRow.classList.add("hidden");
  }
  if (settings.optShowAiSummary === false) {
    const aiSummaryBtn = $id("ai-summary-btn");
    if (aiSummaryBtn) aiSummaryBtn.classList.add("hidden");
    const aiSummaryHint = $id("ai-summary-hint");
    if (aiSummaryHint) aiSummaryHint.classList.add("hidden");
  }
  if (settings.optShowAiTags === false) {
    const aiTagsBox = $id("ai-suggest-tags");
    const aiTagsRow = aiTagsBox ? aiTagsBox.closest(".row") : null;
    if (aiTagsRow) aiTagsRow.classList.add("hidden");
  }
  if (settings.optShowQuickLinks === false) {
    const ql = document.querySelector(".quick-links");
    if (ql) ql.classList.add("hidden");
  }
  if (settings.optShowQuickRow === false) {
    const qr = document.querySelector(".quick-row");
    if (qr) qr.classList.add("hidden");
  }
  const searchInput = $id("search-input");
  if (searchInput) {
    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && searchInput.value.trim()) {
        chrome.tabs.create({ url: `https://pinboard.in/search/u:${username}?query=${enc(searchInput.value.trim())}` });
      }
    });
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  // Fill URL/Title immediately from tab info so the form isn't visibly blank while the
  // (slow) content-script injection runs. Tracking-param strip + selectedText/meta arrive later.
  if (tab) {
    $id("url-input").value = tab.url || "";
    $id("title-input").value = tab.title || "";
  }
  // Kick off page-info extraction AND the bookmark cache lookup in parallel — both depend
  // only on `tab` (already obtained). Awaiting them sequentially wastes overlap potential.
  // Bind extraction and bookmark prefetch to the same URL so a mid-open navigation cannot
  // pair content from the new page with the old bookmark request.
  const _pageInfoPromise = tab ? getPageInfoFromTab(tab.id, { expectedUrl: tab.url || "" }) : Promise.resolve(null);
  const _bookmarkPrefetchUrl = tab?.url || "";
  const _bookmarkPrefetchPromise = _bookmarkPrefetchUrl
    ? chrome.runtime.sendMessage({ type: "get_bookmark_data", url: _bookmarkPrefetchUrl, account: sessionAccount }).catch(() => null)
    : Promise.resolve(null);
  if (!tab) {
    pageInfo = { url: "", title: "", selectedText: "", metaDescription: "", referrer: "", pageText: "" };
  } else {
    pageInfo = (await _pageInfoPromise) || {
      url: tab.url || "", title: tab.title || "", selectedText: "", metaDescription: "", referrer: "", pageText: ""
    };
  }

  const _ucs = await _loadUrlCleanSettings();
  let targetUrl = pageInfo.url;
  if (_ucs.enabled && _ucs.onPopupOpen && pageInfo.url) {
    const { cleaned, removedCount, original } = stripTrackingParams(pageInfo.url, _ucs);
    targetUrl = cleaned;
    $id("url-input").value = cleaned;
    _renderCleanHint({ removedCount, original });
  } else {
    $id("url-input").value = pageInfo.url;
  }
  $id("title-input").value = pageInfo.title;

  // Check if URL is supported by Pinboard
  // Tab set & batch save work regardless of current page URL
  setupTabSet();

  const isUnsupportedUrl = !pageInfo.url || (!pageInfo.url.startsWith("http://") && !pageInfo.url.startsWith("https://"));
  if (isUnsupportedUrl) {
    // Collapse the dead bookmark form into a coherent empty state: CSS hides
    // every .form-body child except #url-warning, leaving the still-functional
    // quick-actions bar (a sibling of #main-section) untouched.
    $id("main-section").classList.add("unsupported-url");
    $id("url-warning").classList.remove("hidden");
    $id("url-input").value = "";
    $id("title-input").value = "";
    $id("submit-btn").disabled = true;
    $id("submit-btn").title = t("urlCannotSave");
    $id("ai-summary-btn").classList.add("disabled-link");
    $id("ai-tags-btn").classList.add("disabled-link");
    return;
  }

  $id("url-input").addEventListener("input", () => {
    invalidateBookmarkLookup();
    const val = $id("url-input").value.trim();
    const bad = !val || (!val.startsWith("http://") && !val.startsWith("https://"));
    $id("url-warning").classList.toggle("hidden", !bad);
    // audit A1: AI is anchored to the opened page - grey it out while the
    // URL points somewhere non-equivalent (popup-ai.js owns the check).
    if (typeof pbpAiSyncUrlEditState === "function") pbpAiSyncUrlEditState();
    updateCharCount();
  });
  $id("title-input").addEventListener("input", updateCharCount);
  // P2: mark fields dirty on any user interaction so checkExistingBookmark()
  // skips writing them after the user has started editing.
  ["title-input", "description-input", "private-check", "readlater-check"].forEach((id) => {
    const mark = () => { fieldDirtyFlags[id] = true; };
    $id(id).addEventListener("input", mark);
    $id(id).addEventListener("change", mark);
  });

  $id("url-input").addEventListener("paste", async (e) => {
    const settings = await _loadUrlCleanSettings();
    if (!settings.enabled || !settings.onPaste) return;
    const pasted = e.clipboardData?.getData("text") || "";
    if (!pasted) return;
    const { cleaned, removedCount, original } = stripTrackingParams(pasted, settings);
    if (removedCount > 0) {
      e.preventDefault();
      $id("url-input").value = cleaned;
      // dispatch input event so any input listeners pick up the change
      $id("url-input").dispatchEvent(new Event("input", { bubbles: true }));
      showFeedback({
        variant: "success",
        message: t("urlPasteCleanedN").replace("{n}", removedCount),
        actions: [{
          label: t("undo"),
          onClick: (card) => {
            $id("url-input").value = original;
            $id("url-input").dispatchEvent(new Event("input", { bubbles: true }));
            card.classList.add("dismissing");
            setTimeout(() => card.remove(), 120);
          }
        }],
        autoHide: 1800,
      });
    }
  });

  let desc = "";
  if (pageInfo.selectedText) {
    desc = settings.optBlockquote ? `<blockquote>${escapeForExtended(pageInfo.selectedText)}</blockquote>` : pageInfo.selectedText;
  } else if (settings.optAutoDescription !== false && pageInfo.metaDescription) { desc = pageInfo.metaDescription; }
  if (settings.optIncludeReferrer && pageInfo.referrer) { desc += (desc ? "\n\n" : "") + `via: ${pageInfo.referrer}`; }
  $id("description-input").value = desc;
  updateCharCount();
  setTimeout(() => autoResizeTextarea($id("description-input")), 50);

  if (settings.optPrivateDefault) $id("private-check").checked = true;
  if (settings.optPrivateIncognito && tab.incognito) $id("private-check").checked = true;
  if (settings.optReadlaterDefault) $id("readlater-check").checked = true;
  recomputeArchiveCheck();
  $id("private-check").addEventListener("change", recomputeArchiveCheck);
  $id("archive-check").addEventListener("change", async (e) => {
    _archiveUserTouched = true;
    if (e.target.checked) {
      try {
        const granted = await chrome.permissions.request({ origins: ["https://web.archive.org/*"] });
        if (!granted) {
          e.target.checked = false;
          showStatus("status-msg", t("waybackPermDenied"), "error");
        }
      } catch (_) {
        e.target.checked = false;
        showStatus("status-msg", t("waybackPermDenied"), "error");
      }
    }
  });

  // Setup UI features immediately — don't block on network requests
  setupTagsInput();
  setupSubmit(token);
  setupAIFeatures();
  setupDescriptionCounter();
  setupTagPresets();

// ---- Local Markdown extraction via Defuddle ----
// Uses _cbExecuteScript from ai.js to consume chrome.runtime.lastError via
// callback — promise form leaks "Unchecked runtime.lastError: No tab with id"
// when tab closes mid-injection (see ai.js:_cbExecuteScript for detail).
async function extractLocalMarkdown(tabId) {
  const injectRes = await _cbExecuteScript({ target: { tabId }, files: ["vendor/defuddle.js"] });
  if (!injectRes) return { error: "Cannot access this page" };
  // site-rules.js is OPTIONAL — inject separately and ignore failure so a broken
  // rule file can never mask the working Defuddle path (the inline func guards on
  // `typeof applySiteRule`). Mirrors the ignore-failure inject in ai.js.
  await _cbExecuteScript({ target: { tabId }, files: ["site-rules.js"] });
  try {
    const results = await _cbExecuteScript({
      target: { tabId },
      func: () => {
        // Per-site custom extractor (site-rules.js) runs first; falls through to Defuddle.
        try {
          if (typeof applySiteRule === "function") {
            const hit = applySiteRule(document, location.href);
            if (hit && hit.contentHtml) {
              // E1: normalize lazy-load img placeholders (data-src/srcset) on
              // a DETACHED div -- the live DOM is never touched;
              // pbpNormalizeLazyImages comes from site-rules.js, already
              // injected above (extractLocalMarkdown's _cbExecuteScript call).
              const div = document.createElement("div");
              div.innerHTML = hit.contentHtml;
              if (typeof pbpNormalizeLazyImages === "function") pbpNormalizeLazyImages(div, location.href);
              return { contentHtml: div.innerHTML, title: hit.title || document.title, url: location.href, math: !!hit.math, forum: !!hit.forum };
            }
          }
        } catch (_) { /* fall through to Defuddle */ }
        if (typeof Defuddle === "undefined") return { error: "Defuddle not available" };
        // Patch window.URL in the ISOLATED world to prevent defuddle from
        // throwing "Failed to construct 'URL': Invalid URL" on relative/weird hrefs
        // (GitHub pages etc.). Defuddle is UMD and resolves `URL` at runtime, so this
        // interception works. Only affects isolated world; page's window.URL untouched.
        const OriginalURL = window.URL;
        if (!window.__pp_urlShimInstalled) {
          const SafeURL = function(u, b) {
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
          // E1: normalize lazy-load img placeholders on the CLONE before
          // Defuddle parses it -- the live DOM is never touched.
          if (typeof pbpNormalizeLazyImages === "function") pbpNormalizeLazyImages(clone, location.href);
          // Suppress Defuddle's internal console.error for malformed schema.org JSON on third-party pages
          const _origCE = console.error;
          console.error = (...a) => { if (!String(a[0]).startsWith("Defuddle:")) _origCE.apply(console, a); };
          let result;
          try { result = new Defuddle(clone).parse(); } finally { console.error = _origCE; }
          if (!result?.content) return { error: "No content extracted" };
          // X4: Defuddle's parse() result also carries author/published/site/image
          // (its internal MetadataExtractor already does JSON-LD + meta-tag
          // resolution) -- keep them so the preview/export layer can surface them.
          return {
            contentHtml: result.content, title: result.title || document.title, url: location.href,
            math: !!document.querySelector("math"),
            author: result.author || "", published: result.published || "", site: result.site || "", image: result.image || ""
          };
        } catch (e) { return { error: e.message }; }
      }
    });
    if (results?.[0]?.result) return results[0].result;
    return { error: "Script execution failed" };
  } catch (e) { return { error: e.message }; }
}

// Lazy-load Turndown library on demand (saves ~27KB from popup startup)
let _turndownLoadPromise = null;
function ensureTurndown() {
  if (typeof TurndownService !== "undefined") return Promise.resolve();
  if (_turndownLoadPromise) return _turndownLoadPromise;
  _turndownLoadPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "vendor/turndown.js";
    s.onload = () => resolve();
    s.onerror = () => { _turndownLoadPromise = null; reject(new Error("turndown load failed")); };
    document.head.appendChild(s);
  });
  return _turndownLoadPromise;
}

// Convert HTML to Markdown for clipboard. Lazy-loads Turndown, then
// delegates to the shared global htmlToMarkdown() from md-convert.js.
async function htmlToMarkdownAsync(html, opts) {
  try { await ensureTurndown(); } catch (_) { return html; }
  return htmlToMarkdown(html, opts);
}

  // ---- Markdown export button ----
  const jinaMdBtn = $id("jina-md-btn");
  if (jinaMdBtn) {
    let jinaGrantPending = false;
    jinaMdBtn.title = settings.aiContentSource === "jina" ? t("jinaMarkdownTitleJina") : t("jinaMarkdownTitle");
    // Disable on non-http pages
    const currentUrl = $id("url-input")?.value || "";
    if (!currentUrl.startsWith("http://") && !currentUrl.startsWith("https://")) {
      jinaMdBtn.disabled = true;
      jinaMdBtn.title = t("jinaMdNonWebHint");
    }
    jinaMdBtn.addEventListener("click", async () => {
      if (jinaMdBtn.disabled) return;
      const url = $id("url-input").value;
      if (!url) return;
      jinaMdBtn.disabled = true;

      if (jinaGrantPending) {
        let granted = false;
        try {
          granted = await chrome.permissions.request({ origins: [PBP_JINA_ORIGIN_PATTERN] });
        } catch (_) {}
        if (!granted) {
          showStatus("status-msg", t("aiErrorHostPermission", PBP_JINA_ORIGIN_PATTERN.replace(/\/\*$/, "")), "error");
          jinaMdBtn.disabled = false;
          return;
        }
        jinaGrantPending = false;
      }

      const origLabel = t("jinaMarkdownBtn");
      setBtnIcon(jinaMdBtn, "doc", t("jinaConverting"));

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
        if (result.code === "host_permission") {
          jinaGrantPending = true;
          setBtnIcon(jinaMdBtn, "doc", t("aiGrantRetry"));
          jinaMdBtn.title = t("aiErrorHostPermission", PBP_JINA_ORIGIN_PATTERN.replace(/\/\*$/, ""));
          jinaMdBtn.disabled = false;
          showStatus("status-msg", jinaMdBtn.title, "error");
          return;
        }
        jinaMdBtn.innerHTML = PBP_ICONS.cross + " " + t("jinaFailed");
        jinaMdBtn.title = result.error;
        // Persistent, specific status — so the user can tell API-key vs other failures
        if (settings.aiContentSource === "jina" && result.authFailed) {
          showStatus("status-msg", t("jinaAuthFailed"), "error");
        } else {
          showStatus("status-msg", t("jinaFailedDetail", result.error), "error");
        }
        setTimeout(() => { setBtnIcon(jinaMdBtn, "doc", origLabel); jinaMdBtn.disabled = false; jinaMdBtn.title = ""; }, 2000);
        return;
      }

      // Convert to markdown (Jina already has it, Local needs Turndown)
      const markdown = result.markdown || await htmlToMarkdownAsync(result.contentHtml, { baseUrl: result.url || url });
      const clippedDate = (() => { const d = new Date(); const p = (n) => (n < 10 ? "0" : "") + n; return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()); })();

      // X4: extended metadata (author/published/site/image/words), gated by the
      // mdExportExtendedMeta setting (default on). Off -> meta stays exactly the
      // five base keys, byte-identical to pre-X4 exports (spec invariant 1).
      // Shared by copyMd/downloadMd/sendObsidian below -- same fields, same gate.
      function attachExtendedMeta(meta) {
        if (settings.mdExportExtendedMeta === false) return meta;
        const author = (result.author || "").trim();
        if (author) meta.author = author.slice(0, 200);
        let site = (result.site || "").trim();
        if (!site) { try { site = new URL(result.url || url).hostname; } catch (_) { site = ""; } }
        if (site) meta.site = site.slice(0, 200);
        const published = publishedIso(result.published || "");
        meta.date = published || "";
        if (published) meta.published = published;
        meta.clipped = clippedDate;
        if (result.image) meta.image = result.image;
        const stats = readingStats(markdown);
        meta.words = stats.words + stats.cjkChars;
        return meta;
      }

      // Reveal the action strip; the user picks Copy / Preview / Download / Obsidian.
      // No auto-copy: clicking Markdown must not silently clobber the clipboard, nor be
      // aborted by a clipboard failure when the user only wanted preview/download/Obsidian.
      const copyMd = async (e) => {
        const btn = e.currentTarget;
        // Icon-only button: feedback is an icon swap (copy -> check / warning),
        // the add-all-link precedent. Static PBP_ICONS constants only.
        const ic = btn.querySelector(".btn-ic");
        if (btn._t) clearTimeout(btn._t);
        // Same meta/opts as downloadMd/sendObsidian below — composeExport applies
        // frontmatter/imagePolicy/TOC so Copy matches Download/Obsidian/preview's
        // Copy MD instead of copying the bare canonical markdown (relative image
        // src left unresolved, frontmatter/TOC settings silently ignored).
        const meta = attachExtendedMeta({
          title: result.title || $id("title-input")?.value || "",
          url: result.url || url,
          date: clippedDate,
          tags: Array.isArray(currentTags) ? currentTags.slice() : [],
          source: settings.aiContentSource === "jina" ? "jina" : "defuddle"
        });
        const out = composeExport(markdown, meta, {
          frontmatter: settings.mdExportFrontmatter,
          imagePolicy: settings.mdExportImagePolicy,
          includeToc: settings.mdExportIncludeToc
        });
        try {
          await navigator.clipboard.writeText(out);
          if (ic) ic.innerHTML = PBP_ICONS.check;
          btn.classList.add("copied");
        } catch (_) {
          if (ic) ic.innerHTML = PBP_ICONS.warning;
        }
        btn._t = setTimeout(() => { if (ic) ic.innerHTML = PBP_ICONS.copy; btn.classList.remove("copied"); }, 1500);
      };
      const openPreview = async () => {
        // Per-open token key so concurrent previews never clobber each other's
        // payload (the old single global key let a second open overwrite the
        // first before its tab read it). Wrapped in try/catch because this is
        // mounted as previewBtn.onclick: the returned Promise is unconsumed, so
        // a storage-quota reject (huge article) would otherwise be a silent
        // unhandled rejection with no preview tab and no feedback.
        try {
          const k = crypto.randomUUID();
          await chrome.storage.local.set({
            ["md_preview_data_" + k]: {
              markdown: markdown || "",
              contentHtml: result.contentHtml || "",
              title: result.title || $id("title-input")?.value || "",
              url: result.url || url,
              baseUrl: result.url || url,
              // Immutable tab identity (hotlink round): the LIVE tab URL, not
              // `url` -- that one comes from the editable url-input and may be
              // tracker-stripped or hand-edited, so it can differ from what the
              // tab actually shows and would fail the weak-handle guard on the
              // next local re-extract (Codex acceptance HIGH-3). It is also the
              // Referer origin source, which must be the real page.
              sourceTabUrl: tab.url || url,
              account: sessionAccount,
              tags: Array.isArray(currentTags) ? currentTags.slice() : [],
              description: $id("description-input")?.value || "",
              tokens: result.tokens || 0,
              hasApiKey: !!result._hasApiKey,
              source: settings.aiContentSource || "local",
              math: !!result.math,
              forum: !!result.forum,
              // X4: raw metadata transport -- md-preview.js reads these into
              // info.author/published/site/image; gated by buildMeta()'s
              // exportSettings.mdExportExtendedMeta check (design spec 4.2).
              author: result.author || "",
              published: result.published || "",
              site: result.site || "",
              image: result.image || "",
              tabId: tab.id,
              ts: Date.now() // sweep grace: don't orphan-collect a slot mid-handoff
            }
          });
          await chrome.tabs.create({ url: "md-preview.html?k=" + k });
        } catch (e) {
          // Quota-full is recoverable: offer a one-click path to the Storage
          // panel where the user can reclaim cache, then reopen the preview.
          if (/quota/i.test((e && e.message) || "")) {
            if (window._lastStatusFeedback) window._lastStatusFeedback.dismiss();
            window._lastStatusFeedback = showFeedback({
              variant: "error",
              message: t("mdPreviewQuotaFull"),
              actions: [{
                label: t("manageStorage"),
                onClick: () => pbpOpenOptionsTab("storage"),
              }],
            });
          } else {
            showStatus("status-msg", t("mdPreviewOpenFailed"), "error");
          }
        }
      };
      const downloadMd = () => {
        const meta = attachExtendedMeta({
          title: result.title || $id("title-input")?.value || "",
          url: result.url || url,
          date: clippedDate,
          tags: Array.isArray(currentTags) ? currentTags.slice() : [],
          source: settings.aiContentSource === "jina" ? "jina" : "defuddle"
        });
        const out = composeExport(markdown, meta, {
          frontmatter: settings.mdExportFrontmatter,
          imagePolicy: settings.mdExportImagePolicy,
          includeToc: settings.mdExportIncludeToc
        });
        downloadFile(safeFilename(meta.title) + ".md", out, "text/markdown;charset=utf-8");
      };
      const sendObsidian = async () => {
        const meta = attachExtendedMeta({
          title: result.title || $id("title-input")?.value || "",
          url: result.url || url,
          date: clippedDate,
          tags: Array.isArray(currentTags) ? currentTags.slice() : [],
          source: settings.aiContentSource === "jina" ? "jina" : "defuddle"
        });
        // Obsidian ALWAYS gets YAML frontmatter (registry semantics: the preview
        // page's export-targets.js row hardcodes obsidian.frontmatter = "inline",
        // independent of the mdExportFrontmatter checkbox — see
        // pbpBuildFileBody()/md-export-send.js). Mirror that shape here — compose
        // without frontmatter, then wrap with applyFrontmatter — so popup and
        // preview sends produce byte-identical output for the same article.
        const out = applyFrontmatter(
          composeExport(markdown, meta, {
            frontmatter: false,
            imagePolicy: settings.mdExportImagePolicy,
            includeToc: settings.mdExportIncludeToc
          }),
          meta,
          {}
        );
        try {
          await navigator.clipboard.writeText(out);
        } catch (_) {
          // Clipboard failed — do NOT fall back to inlining `out` into the
          // obsidian:// URI: popup.html doesn't load export-targets.js's
          // PBP_URI_BUDGET gate, so a long note would silently no-op past
          // Chromium's external-protocol length wall (~2046 chars) on Windows,
          // reporting success while creating nothing. Report and stop instead
          // (matches md-export-send.js's "clipboard failure -> error, no data
          // loss" semantics).
          showStatus("status-msg", t("obsidianClipboardFailed"), "error");
          return;
        }
        const uri = buildObsidianUri({
          vault: settings.obsidianVault,
          folder: settings.obsidianFolder,
          name: safeFilename(meta.title),
          clipboard: true,
          content: ""
        });
        window.open(uri, "_blank");
        if (!sessionStorage.getItem("_obsidian_hint_shown")) {
          sessionStorage.setItem("_obsidian_hint_shown", "1");
          showStatus("status-msg", t("obsidianInstallHint"), "info");
        }
      };
      const strip = $id("md-actions-strip");
      if (strip) {
        strip.classList.remove("hidden");
        pbpScrollIntoView(strip, { behavior: "smooth", block: "nearest" });
        const copyBtn = $id("md-strip-copy");
        const previewBtn = $id("md-strip-preview");
        const dlBtn = $id("md-strip-dl");
        // Assign (not addEventListener) so re-clicks don't stack handlers.
        if (copyBtn) copyBtn.onclick = copyMd;
        if (previewBtn) previewBtn.onclick = openPreview;
        if (dlBtn) dlBtn.onclick = downloadMd;
        const obsBtn = $id("md-strip-obsidian");
        // (The old "shorten Download to .md when Obsidian shows" width dance is
        // gone -- icon-only cells have nothing to shorten.)
        if (settings.obsidianEnabled) {
          if (obsBtn) { obsBtn.style.display = ""; obsBtn.onclick = sendObsidian; }
        } else if (obsBtn) {
          obsBtn.style.display = "none";
        }
      }

      // No "Copied" state on the main button now — revert as soon as the strip is shown.
      setBtnIcon(jinaMdBtn, "doc", origLabel);
      jinaMdBtn.disabled = false;
    });
  }

  // Fetch all user tags first (cache hit is instant, populates tagCaseMap for case resolution)
  fetchAllUserTags(token).then(() => {
    if (settings.optAiAutoTags && settings.optShowAiTags !== false && hasAIKey(settings)) $id("ai-tags-btn").click();
  });
  // Suggest tags — enqueue after user tags so tagCaseMap is ready
  if (settings.optShowSuggestTags) {
    $id("suggest-row").classList.remove("hidden");
    fetchPinboardSuggestTags(token, targetUrl);
  }
  // Bookmark check — non-blocking, updates UI when ready.
  // Pass the prefetched cache promise (started right after popup-form-ready) so the
  // service-worker round-trip overlaps with getPageInfoFromTab instead of running after it.
  checkExistingBookmark(token, targetUrl, {
    prefetchUrl: _bookmarkPrefetchUrl,
    prefetchPromise: _bookmarkPrefetchPromise,
  });
  // Recent bookmarks — lowest priority, enqueue last
  if (settings.optShowRecent) fetchRecentBookmarks(token);

  document.querySelector(".tags-input-wrap")?.addEventListener("click", () => $id("tags-input").focus());
  showOfflineQueueStatus();

  // Focus optimization: tags input for new bookmarks, description for existing
  setTimeout(() => {
    if (existingBookmark) $id("description-input").focus();
    else $id("tags-input").focus();
  }, 100);
}

// ===================== Existing Bookmark =====================
// prefetch (optional): { prefetchUrl, prefetchPromise } — a get_bookmark_data lookup
// kicked off in parallel from showMain. Used only when prefetchUrl matches the url we
// actually need (else a stale prefetch would mislead). Misses fall back to a live fetch.
async function checkExistingBookmark(token, url, prefetch, forceFresh = false, submittedTags) {
  const lookupUrl = String(url || "").trim();
  // Clear any optimistic first-paint mirror before the source-of-truth lookup.
  // A found result restores the edit UI; missing/failed results leave it cleared.
  invalidateBookmarkLookup();
  const generation = bookmarkLookup.generation;
  bookmarkLookup = { status: "pending", url: lookupUrl, generation, promise: null, formLoaded: false };

  const promise = (async () => {
    try {
      let data;
      if (!forceFresh) {
        try {
          let cached;
          const lookupAccount = pbpPinboardAccountFromToken(token);
          if (prefetch && prefetch.prefetchUrl === lookupUrl && prefetch.prefetchPromise) {
            cached = await prefetch.prefetchPromise;
          } else {
            cached = await chrome.runtime.sendMessage({ type: "get_bookmark_data", url: lookupUrl, account: lookupAccount });
          }
          if (cached?.account !== lookupAccount) cached = null;
          if (cached?.posts) data = { posts: cached.posts };
        } catch (_) {}
      }
      if (!data) {
        const resp = await pinboardFetch(`https://api.pinboard.in/v1/posts/get?url=${enc(lookupUrl)}&auth_token=${token}&format=json`);
        if (resp.status === 401) throw new Error("HTTP 401"); // pinboardFetch already redirected to login
        if (resp.status === 0) throw new Error("HTTP 0");
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        data = await resp.json();
      }

      if (bookmarkLookup.generation !== generation || bookmarkLookup.url !== lookupUrl || $id("url-input").value.trim() !== lookupUrl) {
        return { status: "stale", url: lookupUrl };
      }

      if (data.posts?.length > 0) {
        existingBookmark = data.posts[0];
        if (shouldUpdateField("title-input")) $id("title-input").value = existingBookmark.description;
        if (shouldUpdateField("description-input")) $id("description-input").value = existingBookmark.extended;
        if (shouldUpdateField("private-check")) $id("private-check").checked = existingBookmark.shared === "no";
        recomputeArchiveCheck();
        if (shouldUpdateField("readlater-check")) $id("readlater-check").checked = existingBookmark.toread === "yes";
        currentTags = Array.isArray(submittedTags)
          ? pbpRebasePopupTags(existingBookmark.tags || "", submittedTags, currentTags)
          : unionTags(existingBookmark.tags || "", currentTags.join(" ")).split(/\s+/).filter(Boolean);
        renderTags();
        $id("submit-btn").textContent = t("update");
        $id("delete-btn").classList.remove("hidden");
        updateCharCount();
        setTimeout(() => autoResizeTextarea($id("description-input")), 50);
        const banner = $id("existing-banner");
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
        bookmarkLookup = { status: "found", url: lookupUrl, generation, promise: null, formLoaded: true };
      } else {
        existingBookmark = null;
        bookmarkLookup = { status: "missing", url: lookupUrl, generation, promise: null, formLoaded: false };
      }

      // B4: Write only public page identity for next-popup prefill. Existing-bookmark
      // state is account-specific and must come from the guarded background lookup.
      try {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (bookmarkLookup.generation === generation && bookmarkLookup.url === lookupUrl && $id("url-input").value.trim() === lookupUrl && activeTab?.url) {
          const mirror = {
            tabId: activeTab.id,
            url: $id("url-input").value || activeTab.url,
            title: $id("title-input").value || activeTab.title || "",
            ts: Date.now()
          };
          localStorage.setItem("pp-last-tab", JSON.stringify(mirror));
        }
      } catch (_) {}
      return { status: bookmarkLookup.status, url: lookupUrl };
    } catch (e) {
      if (bookmarkLookup.generation === generation && bookmarkLookup.url === lookupUrl && $id("url-input").value.trim() === lookupUrl) {
        bookmarkLookup = { status: "failed", url: lookupUrl, generation, promise: null, formLoaded: false };
        console.error("user info banner error:", e);
        return { status: "failed", url: lookupUrl };
      }
      return { status: "stale", url: lookupUrl };
    }
  })();
  bookmarkLookup.promise = promise;
  return promise;
}

// ===================== Submit / Delete =====================
function setupSubmit(token) {
  let autoCloseTimer = null;

  // Submit state machine: idle -> loading -> success -> idle / loading -> error -> idle (user retry resets)
  const btn = $id("submit-btn");
  if (btn._pbpSubmitBound) return;
  btn._pbpSubmitBound = true;
  const submitAccount = pbpPinboardAccountFromToken(token);
  let submitErrorResetTimer = null;
  let submitAttemptSeq = 0;

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
      btn.textContent = label || t("saveRetry");
    } else { // idle
      btn.disabled = false;
      const currentUrl = $id("url-input").value.trim();
      btn.textContent = bookmarkLookup.status === "found" && bookmarkLookup.url === currentUrl && bookmarkLookup.formLoaded
        ? t("update")
        : t("submit");
      updateCharCount();
    }
  }

  $id("submit-btn").addEventListener("click", async () => {
    const submitAttempt = ++submitAttemptSeq;
    const ownsSubmitUi = () => submitAttempt === submitAttemptSeq;
    const url = $id("url-input").value.trim();
    const reviewedAtClick = bookmarkLookup.status === "found"
      && bookmarkLookup.url === url
      && bookmarkLookup.formLoaded;
    clearTimeout(submitErrorResetTimer);
    setSubmitState("loading");

    if (!url || !$id("title-input").value) {
      showStatus("status-msg", t("urlAndTitleRequired"), "error");
      setSubmitState("idle");
      return;
    }
    let lookupGenerationAtSave = null;
    try {
      const lookupMatches = bookmarkLookup.url === url;
      let lookupGenerationAtWait = bookmarkLookup.generation;
      if (bookmarkLookup.status === "pending" && lookupMatches && bookmarkLookup.promise) {
        await bookmarkLookup.promise;
      } else if (!lookupMatches || bookmarkLookup.status === "idle" || bookmarkLookup.status === "failed" || (bookmarkLookup.status === "pending" && !bookmarkLookup.promise)) {
        const lookupPromise = checkExistingBookmark(token, url);
        lookupGenerationAtWait = bookmarkLookup.generation;
        await lookupPromise;
      }
      if (!ownsSubmitUi()) return;
      if (bookmarkLookup.generation !== lookupGenerationAtWait || bookmarkLookup.url !== url || $id("url-input").value.trim() !== url) {
        setSubmitState("idle");
        return;
      }

      const savePolicy = pbpPopupSavePolicy({
        lookupStatus: bookmarkLookup.status,
        lookupUrl: bookmarkLookup.url,
        currentUrl: url,
        formLoaded: bookmarkLookup.formLoaded,
        reviewedAtClick,
      });
      if (!savePolicy.allow) {
        if (savePolicy.reason === "review_required") {
          showStatus("status-msg", t("editingExisting"), "info");
          setSubmitState("idle");
        } else {
          showStatus("status-msg", t("networkError"), "error");
          setSubmitState("error");
          submitErrorResetTimer = setTimeout(() => { if (btn.classList.contains("save-error")) setSubmitState("idle"); }, 3000);
        }
        return;
      }

      lookupGenerationAtSave = bookmarkLookup.generation;
      const {
        url: saveUrl,
        title,
        extended,
        tags,
        isPrivate,
        isReadLater,
        archiveRequested,
      } = {
        url: $id("url-input").value.trim(),
        title: $id("title-input").value,
        extended: $id("description-input").value,
        tags: currentTags.slice(),
        isPrivate: $id("private-check").checked,
        isReadLater: $id("readlater-check").checked,
        archiveRequested: $id("archive-check").checked,
      };
      if (!ownsSubmitUi()
          || bookmarkLookup.generation !== lookupGenerationAtSave
          || bookmarkLookup.url !== saveUrl
          || saveUrl !== url) {
        setSubmitState("idle");
        return;
      }
      if (!saveUrl || !title) {
        showStatus("status-msg", t("urlAndTitleRequired"), "error");
        setSubmitState("idle");
        return;
      }
      const summaryOwnership =
        typeof pbpAiSummaryOwnershipSnapshot === "function"
          ? pbpAiSummaryOwnershipSnapshot(extended)
          : null;
      const intent = {
        mode: savePolicy.mode,
        url: saveUrl,
        title,
        notes: extended,
        tags: tags.join(" "),
        private: isPrivate,
        toread: isReadLater,
        archive: _archiveUserTouched ? archiveRequested : undefined,
      };
      if (savePolicy.mode === "update") {
        intent.time = existingBookmark?.time;
      }
      const formMatchesSubmitted = () => (
        $id("title-input").value === title
        && $id("description-input").value === extended
        && $id("private-check").checked === isPrivate
        && $id("readlater-check").checked === isReadLater
        && $id("archive-check").checked === archiveRequested
        && $id("tags-input").value.trim() === ""
        && currentTags.length === tags.length
        && currentTags.every((tag, index) => tag === tags[index])
      );
      Object.keys(fieldDirtyFlags).forEach((id) => { fieldDirtyFlags[id] = false; });

      const archiveIndicatorRequested = (savePolicy.mode !== "merge" || intent.archive !== undefined)
        && pbpWaybackShouldArchive({
          enabled: settings.waybackArchiveEnabled === true,
          skipPrivate: settings.waybackSkipPrivate !== false,
          isPrivate,
          force: false,
          override: intent.archive,
        });
      let attemptsStored = {};
      if (archiveIndicatorRequested) {
        try { attemptsStored = await chrome.storage.local.get("_waybackAttempts"); } catch (_) {}
      }
      if (!ownsSubmitUi() || bookmarkLookup.generation !== lookupGenerationAtSave || $id("url-input").value.trim() !== url) {
        if (ownsSubmitUi()) setSubmitState("idle");
        return;
      }
      const result = await chrome.runtime.sendMessage({ type: "save_intent", intent, account: submitAccount });
      if (!result || typeof result !== "object" || typeof result.status !== "string") {
        throw new Error("invalid save response");
      }
      if (result.status === "failed" && result.reason === "not_logged_in") {
        await resetPinboardSession();
        return;
      }
      if (!ownsSubmitUi() || bookmarkLookup.generation !== lookupGenerationAtSave || $id("url-input").value.trim() !== url) {
        if (ownsSubmitUi()) setSubmitState("idle");
        return;
      }

      if (result.status === "queued") {
        showStatus("status-msg", t("offlineQueued", "1"), "info");
        setSubmitState("idle");
        try { if (window.PPOffline) await window.PPOffline.refresh(); } catch (_) {}
        return;
      }

      if (result.status === "skipped" || (result.status === "failed" && result.reason === "conflict")) {
        const conflictLookupPromise = checkExistingBookmark(token, url, null, true, tags);
        const conflictLookupGeneration = bookmarkLookup.generation;
        const conflictLookup = await conflictLookupPromise;
        if (!ownsSubmitUi()) return;
        if (bookmarkLookup.generation !== conflictLookupGeneration || bookmarkLookup.url !== url || $id("url-input").value.trim() !== url) {
          setSubmitState("idle");
          return;
        }
        if (conflictLookup.status === "found") {
          showStatus("status-msg", t("editingExisting"), "info");
          setSubmitState("idle");
          return;
        }
        showStatus("status-msg", t("networkError"), "error");
        setSubmitState("error");
        submitErrorResetTimer = setTimeout(() => { if (btn.classList.contains("save-error")) setSubmitState("idle"); }, 3000);
        return;
      }

      if (result.status === "saved") {
        try {
          if (typeof pbpAiSaveSummaryOwnership === "function") {
            const exactRange =
              savePolicy.mode === "create" || savePolicy.mode === "update"
                ? summaryOwnership
                : null;
            await pbpAiSaveSummaryOwnership(
              submitAccount, saveUrl, extended, exactRange);
          }
        } catch (_) {}
        if (!ownsSubmitUi()
            || bookmarkLookup.generation !== lookupGenerationAtSave
            || $id("url-input").value.trim() !== url) return;
        if (typeof saveLastUsedTags === "function") saveLastUsedTags(tags, submitAccount);
        if (savePolicy.mode === "update") {
          existingBookmark = {
            href: url,
            description: title,
            extended,
            tags: tags.join(" "),
            shared: isPrivate ? "no" : "yes",
            toread: isReadLater ? "yes" : "no",
            time: intent.time,
          };
        } else {
          checkExistingBookmark(token, url, null, true, tags);
        }
        showStatus("status-msg", t("bookmarkSaved"), "success");
        setSubmitState("success");
        // Optimistic archive indicator (cosmetic only, never blocks save or auto-close)
        try {
          const attempts = attemptsStored?._waybackAttempts || {};
          if (archiveIndicatorRequested && typeof pbpWaybackShouldAttempt === "function" && pbpWaybackShouldAttempt(attempts, url, Date.now())) {
            const statusEl = $id("status-msg");
            if (statusEl) {
              const indicator = document.createElement("span");
              indicator.className = "wayback-indicator";
              indicator.textContent = t("archiveRequested");
              statusEl.appendChild(document.createTextNode(" · "));
              statusEl.appendChild(indicator);
            }
          }
        } catch (_) {}
        if (settings.optAutoCloseAfterSave && formMatchesSubmitted()) {
          const autoCloseGeneration = bookmarkLookup.generation;
          const bar = document.createElement("div");
          bar.className = "auto-close-bar";
          bar.setAttribute("aria-hidden", "true");
          document.body.appendChild(bar);
          autoCloseTimer = setTimeout(() => {
            autoCloseTimer = null;
            document.removeEventListener("pointermove", onAutoCloseMove);
            if (ownsSubmitUi()
                && bookmarkLookup.generation === autoCloseGeneration
                && bookmarkLookup.url === url
                && $id("url-input").value.trim() === url
                && formMatchesSubmitted()) {
              window.close();
            } else {
              bar.remove();
            }
          }, 1800);
          // Interaction cancels the auto-close outright -- there is no pause
          // state, so the bar never shows a countdown that is not running.
          // Pointer movement counts as interaction, not just a click: reaching
          // for the popup to read it is exactly when you do not want it to
          // vanish. It needs a distance threshold, though, because the popup
          // opens under a cursor that is already resting on the toolbar button,
          // and the stray move that lands there must not cancel anything --
          // otherwise the feature would never fire for anyone.
          const cancelAutoClose = () => {
            clearTimeout(autoCloseTimer);
            autoCloseTimer = null;
            bar.remove();
            document.removeEventListener("pointermove", onAutoCloseMove);
          };
          let moveOrigin = null;
          const onAutoCloseMove = (e) => {
            if (!moveOrigin) { moveOrigin = { x: e.clientX, y: e.clientY }; return; }
            if (Math.abs(e.clientX - moveOrigin.x) < 8 && Math.abs(e.clientY - moveOrigin.y) < 8) return;
            cancelAutoClose();
          };
          document.addEventListener("pointermove", onAutoCloseMove);
          document.addEventListener("mousedown", cancelAutoClose, { once: true });
        }
        setTimeout(() => { if (btn.classList.contains("saved-success")) setSubmitState("idle"); }, 1200);
        return;
      }

      if (result.status === "failed" && result.reason === "too_long") {
        showStatus("status-msg", t("uriTooLong", String(result.detail || ""), String(POSTS_ADD_URI_BUDGET)), "error");
      } else if (result.status === "failed" && result.reason === "http" && result.httpStatus) {
        showStatus("status-msg", `HTTP ${result.httpStatus}`, "error");
      } else if (result.status === "failed" && result.reason === "api" && result.detail) {
        showStatus("status-msg", `Error: ${result.detail}`, "error");
      } else if (result.status === "failed" && result.reason === "account_changed") {
        showStatus("status-msg", t("pinboardErrorAuth"), "error");
      } else {
        showStatus("status-msg", t("networkError"), "error");
      }
      setSubmitState("error");
    } catch (e) {
      if (!ownsSubmitUi() || (lookupGenerationAtSave !== null && (bookmarkLookup.generation !== lookupGenerationAtSave || $id("url-input").value.trim() !== url))) {
        if (ownsSubmitUi()) setSubmitState("idle");
        return;
      }
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
      const mainSection = $id("main-section");
      if (!mainSection.classList.contains("hidden")) {
        $id("submit-btn").click();
      }
    } else if (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && e.key === "Enter") {
      const mainSection = $id("main-section");
      if (mainSection.classList.contains("hidden")) return;
      e.preventDefault();
      // Shift+Enter fires AI summary AND tags together. They share one combined
      // API call: whichever runs first issues the combined request and caches the
      // other half, so the second is an instant cache hit (one call fills both).
      // Already-present halves re-render from cache; re-roll uses the regenerate links.
      if (typeof doAISummary === "function") doAISummary(false);
      if (typeof doAITags === "function") doAITags(false);
    } else if (e.key === "Escape") {
      const delPop = document.querySelector(".del-confirm-popover");
      if (delPop) { delPop.remove(); return; }
      if (autoCloseTimer) { clearTimeout(autoCloseTimer); autoCloseTimer = null; document.querySelector(".auto-close-bar")?.remove(); return; }
      const tagsInput = $id("tags-input");
      if (tagsInput && document.activeElement === tagsInput) return;
      window.close();
    }
  });

  const hintSpan = document.createElement("span");
  hintSpan.className = "submit-hint";
  hintSpan.textContent = t("hintCtrlEnter");
  document.querySelector(".submit-bar")?.appendChild(hintSpan);

  $id("delete-btn").addEventListener("click", () => {
    const delBtn = $id("delete-btn");
    if (delBtn.querySelector(".del-confirm-popover")) return;
    const deleteUrl = $id("url-input").value.trim();
    if (bookmarkLookup.status !== "found" || bookmarkLookup.url !== deleteUrl || !bookmarkLookup.formLoaded) return;
    const deleteGeneration = bookmarkLookup.generation;
    const ownsDeleteForm = () => bookmarkLookup.generation === deleteGeneration
      && bookmarkLookup.status === "found"
      && bookmarkLookup.url === deleteUrl
      && bookmarkLookup.formLoaded
      && $id("url-input").value.trim() === deleteUrl;

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
      if (!ownsDeleteForm()) return;
      const delOrig = delBtn.textContent;
      delBtn.disabled = true; delBtn.classList.add("loading"); delBtn.textContent = t("deleting");
      try {
        const data = await (await pinboardFetch(`https://api.pinboard.in/v1/posts/delete?url=${enc(deleteUrl)}&auth_token=${token}&format=json`)).json();
        const deleted = data.result_code === "done" || data.result_code === "item not found";
        if (deleted) chrome.runtime.sendMessage({ type: "bookmark_deleted", url: deleteUrl, account: submitAccount });
        if (!ownsDeleteForm()) return;
        if (deleted) {
          showStatus("status-msg", t("deleted"), "success");
          setTimeout(() => { if (ownsDeleteForm()) window.close(); }, 800);
        } else showStatus("status-msg", `Error: ${data.result_code}`, "error");
      } catch (e) {
        if (ownsDeleteForm()) showStatus("status-msg", t("networkError"), "error");
      }
      if (ownsDeleteForm()) {
        delBtn.disabled = false; delBtn.classList.remove("loading"); delBtn.textContent = delOrig;
      }
    });
  });
}

// ===================== Edit From Recent =====================
async function loadBookmarkForEdit(url, token) {
  // Reset current form state
  invalidateBookmarkLookup();
  Object.keys(fieldDirtyFlags).forEach((id) => { fieldDirtyFlags[id] = false; });
  currentTags = [];
  renderTags();
  $id("url-input").value = url;
  $id("title-input").value = "";
  $id("description-input").value = "";
  $id("private-check").checked = false;
  $id("readlater-check").checked = false;
  $id("submit-btn").textContent = t("submit");
  $id("delete-btn").classList.add("hidden");
  // Mark edit mode so banner shows cancel affordance
  document.body.dataset.editMode = "1";
  // Reuse existing-bookmark path which will populate the form from posts/get
  const lookup = await checkExistingBookmark(token, url);
  if (lookup.status !== "found") {
    delete document.body.dataset.editMode;
    if (lookup.status === "failed") showStatus("status-msg", t("networkError"), "error");
    return;
  }
  // Append cancel affordance to banner using safe DOM APIs (no innerHTML)
  const banner = $id("existing-banner");
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
  // Scroll form into view. preventScroll on the focus so it does not do its own
  // instant jump first and leave the explicit scroll animating from there --
  // two scrolls were fighting over one event.
  $id("title-input")?.focus({ preventScroll: true });
  pbpScrollIntoView($id("title-input"), { behavior: "smooth", block: "center" });
}

function exitEditMode() {
  delete document.body.dataset.editMode;
  // Simplest reliable restore: reload popup so current-tab logic runs again
  window.location.reload();
}

// ===================== Recent Bookmarks =====================
async function fetchRecentBookmarks(token) {
  const container = $id("recent-bookmarks");
  const account = pbpPinboardAccountFromToken(token);
  if (!container) return;
  try {
    const resp = await pinboardFetch(`https://api.pinboard.in/v1/posts/recent?auth_token=${token}&format=json&count=5`);
    if (resp.status === 401) return; // pinboardFetch already redirected to login
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    const posts = data.posts || [];
    if (!posts.length) {
      injectEmptyState(container, "bookmark", t("emptyRecentBookmarks"));
      container.classList.remove("hidden");
      return;
    }
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
      edit.innerHTML = PBP_ICONS.pencil;
      edit.title = t("recentEditTitle");
      edit.setAttribute("role", "button");
      edit.setAttribute("tabindex", "0");
      edit.setAttribute("aria-label", t("recentEditTitle"));
      const doEdit = async (e) => {
        if (e) e.preventDefault();
        await loadBookmarkForEdit(p.href, token);
      };
      edit.addEventListener("click", doEdit);
      edit.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); doEdit(); } });
      row.appendChild(edit);
      const del = document.createElement("span");
      del.className = "recent-bm-del";
      del.innerHTML = PBP_ICONS.cross;
      del.title = t("recentDeleteTitle");
      del.setAttribute("role", "button");
      del.setAttribute("tabindex", "0");
      del.setAttribute("aria-label", t("recentDeleteTitle"));
      const doDelete = () => {
        // Anchored confirm popover, matching the other destructive actions —
        // never the browser-modal window.confirm.
        showConfirmPopover(del, {
          msg: t("confirmDelete"),
          yesText: t("delete"),
          noText: t("cancel"),
          onConfirm: async () => {
            try {
              const data = await (await pinboardFetch(`https://api.pinboard.in/v1/posts/delete?url=${enc(p.href)}&auth_token=${token}&format=json`)).json();
              if (data.result_code === "done" || data.result_code === "item not found") {
                row.remove();
                chrome.runtime.sendMessage({ type: "bookmark_deleted", url: p.href, account });
              }
            } catch (_) {}
          },
        });
      };
      del.addEventListener("click", doDelete);
      del.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); doDelete(); } });
      row.appendChild(del);
      container.appendChild(row);
    });
  } catch (e) {
    console.error("recent bookmarks error:", e);
    container.classList.remove("hidden");
    container.replaceChildren();
    const label = document.createElement("div");
    label.className = "recent-bm-label";
    label.textContent = t("recentLabel");
    const msg = document.createElement("span");
    msg.className = "muted";
    msg.textContent = t("recentFailed", e.message || String(e));
    container.appendChild(label);
    container.appendChild(msg);
  }
}

// ===================== Offline Queue Status =====================
async function showOfflineQueueStatus() {
  const bar = $id("offline-queue-bar");
  if (!bar) return;
  // Delegate list rendering + per-item actions to popup-offline.js
  if (window.PPOffline) {
    window.PPOffline.init();
    await window.PPOffline.refresh();
  }
  $id("offline-queue-clear")?.addEventListener("click", (e) => {
    e.preventDefault();
    const anchor = e.currentTarget;
    showConfirmPopover(anchor, {
      msg: t("offlineClearConfirm"),
      yesText: t("clear"),
      noText: t("cancel"),
      onConfirm: async () => {
        const ok = await new Promise((resolve) => {
          chrome.runtime.sendMessage({ type: "clear_offline_queue" }, (resp) => {
            resolve(!!(resp && resp.ok));
          });
        });
        if (window.PPOffline) await window.PPOffline.refresh();
        else if (ok) bar.classList.add("hidden");
      },
    });
  });
}

// ===================== Helpers =====================
function setupDescriptionCounter() {
  const textarea = $id("description-input");
  textarea.addEventListener("input", () => { updateCharCount(); autoResizeTextarea(textarea); });
  setTimeout(() => autoResizeTextarea(textarea), 50);
}
// P1.4: Batch layout read/write into rAF — avoids sync reflow on every keystroke.
// Coalesces rapid successive calls (e.g. input event flood) into one frame.
let _autoResizeRaf = 0;
function autoResizeTextarea(el) {
  if (!el) return;
  if (_autoResizeRaf) cancelAnimationFrame(_autoResizeRaf);
  _autoResizeRaf = requestAnimationFrame(() => {
    _autoResizeRaf = 0;
    el.style.height = "auto";
    el.style.height = Math.min(Math.max(el.scrollHeight, TEXTAREA_MIN_HEIGHT), TEXTAREA_MAX_HEIGHT) + "px";
  });
}
function updateCharCount() {
  const len = $id("description-input").value.length;
  const uriLen = buildPostsAddUri({
    token: settings.pinboardToken || "user:0000000000000000000000000000000000000000",
    url: $id("url-input").value,
    title: $id("title-input").value,
    extended: $id("description-input").value,
    tags: currentTags.join(" "),
    shared: $id("private-check").checked ? "no" : "yes",
    toread: $id("readlater-check").checked ? "yes" : "no",
  }).length;
  const el = $id("desc-char-count");
  el.textContent = `${len} chars · ${uriLen}/${POSTS_ADD_URI_BUDGET} B`;
  const over = uriLen > POSTS_ADD_URI_BUDGET || len > 65000;
  const near = uriLen > POSTS_ADD_URI_BUDGET * 0.8 || len > 60000;
  el.style.color = over ? "#c00" : near ? "#e80" : "";
  el.classList.toggle("over-limit", over);

  // Gate submit on over-limit (without overriding unsupported-url disable path)
  const url = $id("url-input").value.trim();
  const urlBad = !url || (!url.startsWith("http://") && !url.startsWith("https://"));
  const sub = $id("submit-btn");
  if (!sub.classList.contains("loading")) sub.disabled = urlBad || over;
  sub.title = over ? t("submitUriTooLong") : urlBad ? t("urlCannotSave") : "";
}
function showElement(id, text) { const el = $id(id); el.textContent = text; el.classList.remove("hidden"); }
function showStatus(id, msg, kind) {
  if (kind === "error") {
    if (window._lastStatusFeedback) window._lastStatusFeedback.dismiss();
    window._lastStatusFeedback = showFeedback({
      variant: "error",
      message: msg,
      autoHide: 4000,
    });
    return;
  }
  const el = $id(id);
  if (!el) return;
  el.textContent = msg;
  el.className = "status-msg " + (kind || "");
  el.classList.remove("hidden");
}
function esc(s) { const d = document.createElement("div"); d.textContent = s; return d.innerHTML; }
function enc(s) { return encodeURIComponent(s); }

// Alt+1~9 adds the chip wearing that badge digit. The badge (data-alt-num,
// assigned by pbpAssignAltNumBadges on list rebuild) is the single source of
// truth, so the digit always matches what the user sees -- the old version
// re-indexed the surviving :not(.used) chips per keypress, which made every
// add shift all later digits off the visible order. e.repeat guard: a held
// Alt+digit must not machine-gun tags (each add used to promote a new chip
// into the same index). Used chips keep their badge but are skipped here;
// syncSuggestTagStates (via addTag -> renderTags) marks every duplicate of
// the added tag used, including the one just clicked.
document.addEventListener("keydown", (e) => {
  if (!e.altKey || e.ctrlKey || e.metaKey || e.repeat) return;
  if (!/^[1-9]$/.test(e.key)) return;
  const el = document.querySelector(`.stag[data-alt-num="${e.key}"]:not(.used)`);
  if (el) {
    e.preventDefault();
    // Route through the chip's own click handler (Codex r2 M3): a direct
    // addTag() bypassed the AI chips' provenance recording, so replace-
    // mode regen could not retract hotkey-added AI tags. The handler also
    // owns the .used/disabled marking.
    el.click();
  }
});
