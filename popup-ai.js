// ============================================================
// Pinboard Bookmark Enhanced - AI Summary & Tags
// ============================================================

// ===================== AI Progress Indicator (B3) =====================
const AI_STAGE_TIMERS = new Map();
const AI_STAGE_STARTED = new Map();
const AI_BUTTON_BASE_TEXT = new Map();

function pbpPopupAiAccount() {
  return pbpPinboardAccountFromToken(settings?.pinboardToken);
}

// WONTFIX (audit L14, documented): this guard compares against the
// popup's in-memory settings snapshot, so an EXTERNAL credential change
// (sync from another device) while the popup is held open is not
// observed - stale ops can keep updating this popup's UI. Popup lifetimes
// are seconds; the save path re-reads credentials atomically
// (submitSaveIntent expectedAccount) and fails closed, so nothing crosses
// accounts at rest. Hardening this one guard would not even be
// self-consistent: existingBookmark, allUserTags and the form fields are
// exactly as stale after the same external change and none of them is
// re-read either. A storage listener that invalidates the session was
// judged over-engineering for that window.
function pbpPopupAiAccountIsCurrent(account) {
  return !!account && pbpPopupAiAccount() === account;
}

function setAiProgress(buttonId, { provider, stage }) {
  const btn = $id(buttonId);
  if (!btn) return;
  if (!AI_BUTTON_BASE_TEXT.has(buttonId)) {
    // Capture original button text before first stage runs
    let baseText = "";
    for (const node of btn.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) baseText += node.textContent;
    }
    AI_BUTTON_BASE_TEXT.set(buttonId, baseText.trim());
  }
  let labelEl = btn.querySelector(".ai-progress-label");
  if (!labelEl) {
    labelEl = document.createElement("span");
    labelEl.className = "ai-progress-label";
    btn.appendChild(labelEl);
  }
  btn.dataset.stage = stage;
  const tpl = t(`aiStage_${stage}`) || "";
  labelEl.textContent = " · " + tpl.replace("{provider}", provider || "AI");
  labelEl.setAttribute("data-slow-hint", t("aiSlowHint") || "");

  const startedAt = AI_STAGE_STARTED.get(buttonId) || Date.now();
  AI_STAGE_STARTED.set(buttonId, startedAt);
  const prior = AI_STAGE_TIMERS.get(buttonId);
  if (prior) clearTimeout(prior);
  AI_STAGE_TIMERS.set(buttonId, setTimeout(() => {
    if (btn.classList.contains("loading")) btn.classList.add("slow");
  }, Math.max(0, 8000 - (Date.now() - startedAt))));
}

function clearAiProgress(buttonId) {
  const btn = $id(buttonId);
  if (!btn) return;
  btn.classList.remove("slow");
  delete btn.dataset.stage;
  btn.querySelector(".ai-progress-label")?.remove();
  const timer = AI_STAGE_TIMERS.get(buttonId);
  if (timer) { clearTimeout(timer); AI_STAGE_TIMERS.delete(buttonId); }
  AI_STAGE_STARTED.delete(buttonId);
  AI_BUTTON_BASE_TEXT.delete(buttonId);
}

// ---- Enrich page content via Jina Reader if configured ----
// Populate pageInfo.pageText on demand. Avoids Defuddle injection on popup boot — the
// content script for AI quality is only fetched when the user actually invokes AI.
// Returns the source the text ACTUALLY came from ("jina" | "local") -
// callers key the AI caches by it (Codex r2 M2): a Jina failure that
// fell back to local Defuddle must not persist local-content results
// into the jina namespace. Remembered on pageInfo for the session so a
// second op reuses the same answer.
async function ensurePageText(s, buttonId) {
  s = s || settings;
  if (pageInfo.pageText) {
    return pageInfo._pbpTextSource || (s.aiContentSource === "jina" ? "jina" : "local");
  }
  // Video pages (T7.13): the subtitles ARE the content. Only where the
  // caption origin grant already stands (contains, never a prompt); any
  // miss falls through to the configured source untouched.
  if (s.aiUseTranscript !== false) {
    const tx = await pbpAiTranscriptText(s, buttonId);
    if (tx) { pageInfo.pageText = tx; pageInfo._pbpTextSource = "transcript"; return "transcript"; }
  }
  if (s.aiContentSource === "jina") {
    // Throws only on host_permission (surface the grant flow); any other
    // failure leaves pageText empty and falls through to local Defuddle
    // below. The old code returned unconditionally here - its warn log
    // claimed "using local content" while nobody ever ran the local
    // extractor (audit A9).
    await enrichPageTextIfJina(s);
    if (pageInfo.pageText) { pageInfo._pbpTextSource = "jina"; return "jina"; }
  }
  // Local source: lazy-inject Defuddle and pull full page text
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      const info = await getPageInfoFromTab(tab.id, { withDefuddle: true, expectedUrl: pageInfo.url });
      if (info?.pageText) { pageInfo.pageText = info.pageText; pageInfo._pbpTextSource = "local"; }
    }
  } catch (_) { /* tab gone / inject failed — pageText stays empty, caller will surface aiNoContent */ }
  return "local";
}

async function enrichPageTextIfJina(s) {
  s = s || settings;
  if (s.aiContentSource !== "jina") return;
  if (!pageInfo?.url) return;
  try {
    const jinaKey = s.jinaApiKey ? deobfuscateKey(s.jinaApiKey) : "";
    const result = await fetchJinaMarkdown(pageInfo.url, {
      apiKey: jinaKey,
      cacheDuration: s.aiCacheDuration
    });
    if (result.code === "host_permission") {
      const origins = _aiRequiredOriginPatterns(s, [PBP_JINA_ORIGIN_PATTERN]);
      const hosts = origins
        .map(pattern => pattern.replace(/\/\*$/, "")).join(", ");
      const err = new Error(t("aiErrorHostPermission", hosts));
      err.code = "host_permission";
      err.permissionStage = "extracting";
      err.permissionOrigins = origins;
      throw err;
    }
    if (!result.error && result.markdown) {
      pageInfo.pageText = markdownToPlainText(result.markdown);
    }
  } catch (e) {
    if (e?.code === "host_permission") throw e;
    console.warn("Jina content enrichment failed, using local content:", e.message);
  }
}

// The video page's caption grant, if it stands: the detected video, else
// null. contains() ONLY (never a prompt): the first grant belongs to the
// preview's own "Enable subtitles & load video" click, never to a popup AI
// action. Off video pages this touches no permission API at all.
async function pbpAiVideoGrant(s) {
  if (s.aiUseTranscript === false) return null;
  const det = (typeof pbpVideoDetect === "function" && pageInfo && pageInfo.url) ? pbpVideoDetect(pageInfo.url) : null;
  if (!det) return null;
  const originPat = det.provider === "bilibili" ? PBP_BILI_ORIGIN_PATTERN : PBP_YT_ORIGIN_PATTERN;
  try { return (await chrome.permissions.contains({ origins: [originPat] }) === true) ? det : null; } catch (_) { return null; }
}

// The ONE namespace a fast-path read may hit: the one ensurePageText would
// write to. With the caption grant standing that is "transcript" -- and
// only that: falling through to the configured source would serve a
// page-text result made before the grant and never try the captions
// (Codex r9 H2). A miss re-runs the capture (passive routes only, see
// pbpAiTranscriptText); a video without captions then finds its page-text
// result under the actual source inside fetchAIArtifacts.
async function pbpAiFastCached(kind, s, account) {
  const src = (await pbpAiVideoGrant(s)) ? "transcript" : s.aiContentSource;
  return getAICache(pageInfo.url, kind, s.aiCacheDuration, src, account, s);
}

// ---- Video transcript as AI content (T7.13) ----
// md-video.js is 300KB: loaded on demand, only on a video page and only
// once an AI action asks for content. Same runtime <script> shape as
// ensureTurndown (popup.js); same-origin packaged file, allowed by the
// extension CSP. Its load-time listeners all bail outside video-mode.
let _videoModulePromise = null;
function pbpEnsureVideoModule() {
  if (typeof window.pbpPrepareVideoSession === "function") return Promise.resolve();
  if (_videoModulePromise) return _videoModulePromise;
  _videoModulePromise = new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = "md-video.js";
    el.onload = () => resolve();
    el.onerror = () => { _videoModulePromise = null; reject(new Error("md-video.js failed to load")); };
    document.head.appendChild(el);
  });
  return _videoModulePromise;
}
// "" when this is not a video page, the caption origin is not granted
// (pbpAiVideoGrant), or no transcript came back -- the caller then uses the
// configured source.
async function pbpAiTranscriptText(s, buttonId) {
  if (!(await pbpAiVideoGrant(s))) return "";
  if (buttonId) setAiProgress(buttonId, { provider: s.aiProvider, stage: "transcript" });
  try { await pbpEnsureVideoModule(); } catch (e) { console.warn("[pbp-video] popup transcript module:", e && e.message); return ""; }
  let sess = null;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    // passive: timedtext routes only -- the rescue tiers drive the reader's
    // own YouTube tab (caption track, transcript panel), which an AI action
    // in the popup must never do (review C8).
    sess = await window.pbpPrepareVideoSession({ pageUrl: pageInfo.url, tabId: tab ? tab.id : null, passive: true });
  } catch (e) {
    console.warn("[pbp-video] popup transcript:", e && e.name, e && e.message); // no page text, no token
    return "";
  }
  const segs = (sess && sess.segments) || [];
  if (!segs.length) return "";
  // Plain paragraphs, not the transcript markdown: no heading / source line
  // eating into the prompt's content window.
  return (typeof pbpVideoMergeParagraphs === "function") ? pbpVideoMergeParagraphs(segs).join("\n\n") : segs.map((x) => x.content).join(" ");
}

// ---- URL-edit guard (audit A1) ----
// The AI pipeline is anchored to pageInfo.url: extraction reads the tab
// that page is showing, the cache keys use it, and the save uses the
// edited url-input. Editing the URL to a NON-equivalent target used to
// produce a summary of page A cached under A but saved onto bookmark B.
// Equivalence deliberately ignores fragments and tracking params so the
// paste-clean flow (strip utm etc.) keeps AI enabled.
function _aiNormalizeUrl(url) {
  let normalized = String(url == null ? "" : url).trim();
  try {
    const parsed = new URL(normalized);
    parsed.hash = "";
    normalized = parsed.href;
  } catch (_) {}
  try {
    if (typeof stripTrackingParams === "function") {
      normalized = stripTrackingParams(normalized, {}).cleaned || normalized;
    }
  } catch (_) {}
  return normalized;
}

function _aiUrlEquivalent(a, b) {
  return _aiNormalizeUrl(a) === _aiNormalizeUrl(b);
}

// Called from the url-input "input" listener (popup.js): grey the AI
// entry points out while the URL differs from the opened page; editing
// back re-enables them. The in-op guards below stay authoritative
// (hotkey/retry paths bypass pointer-events).
function pbpAiSyncUrlEditState() {
  const edited = !_aiUrlEquivalent($id("url-input").value, pageInfo.url);
  $id("ai-summary-btn")?.classList.toggle("disabled-link", edited);
  $id("ai-tags-btn")?.classList.toggle("disabled-link", edited);
}

// Settle any in-flight same-URL bookmark lookup before touching the
// description (audit A2). checkExistingBookmark nulls .promise once it
// lands, so this is a no-op when the lookup already settled; the promise
// resolves status objects and never rejects, catch is belt-and-braces.
// Bounded re-await (Codex round 2, H1): a forceFresh lookup can REPLACE
// the promise while we wait - keep settling the current one instead of
// proceeding on a stale completion.
async function _aiAwaitBookmarkLookup() {
  try {
    for (let i = 0; i < 5; i++) {
      const p = (typeof bookmarkLookup !== "undefined") ? bookmarkLookup?.promise : null;
      if (!p) return;
      await p;
      const cur = (typeof bookmarkLookup !== "undefined") ? bookmarkLookup?.promise : null;
      if (cur === p || !cur) return;
    }
  } catch (_) {}
}

// Op-liveness guard for every post-await UI/cache commit (Codex round 2,
// H1): the account can drift AND the URL field can be edited away from
// the opened page while an op is mid-flight - either way the op's result
// no longer belongs to what the form will save. Cache writes keyed by
// pageInfo.url stay legitimate either way; only the FORM commits gate.
function _aiOpStillCurrent(account) {
  return pbpPopupAiAccountIsCurrent(account)
    && _aiUrlEquivalent($id("url-input").value, pageInfo.url);
}

function pbpAiWrapSummary(summary) {
  return `<blockquote>${escapeForExtended(summary)}</blockquote>`;
}

function pbpAiFindLastExactSummaryRange(value, summary) {
  const wrapped = pbpAiWrapSummary(summary);
  const start = String(value).lastIndexOf(wrapped);
  return start < 0 ? null : { start, end: start + wrapped.length };
}

function _pbpAiSummaryRangeValid(value, range) {
  return !!range &&
    Number.isInteger(range.start) &&
    Number.isInteger(range.end) &&
    range.start >= 0 &&
    range.end > range.start &&
    range.end <= value.length;
}

// Locate one continuous textarea edit through its longest common prefix/suffix.
// Ownership fails closed when that edit crosses a summary/note boundary.
function pbpAiTrackSummaryRange(range, oldValue, newValue) {
  const oldText = String(oldValue || "");
  const newText = String(newValue || "");
  if (!_pbpAiSummaryRangeValid(oldText, range)) return { kind: "merged" };

  let oldStart = 0;
  while (oldStart < oldText.length &&
         oldStart < newText.length &&
         oldText[oldStart] === newText[oldStart]) oldStart++;

  let oldEnd = oldText.length;
  let newEnd = newText.length;
  while (oldEnd > oldStart &&
         newEnd > oldStart &&
         oldText[oldEnd - 1] === newText[newEnd - 1]) {
    oldEnd--;
    newEnd--;
  }

  const delta = newEnd - oldEnd;
  if (oldEnd <= range.start) {
    return { kind: "owned", start: range.start + delta, end: range.end + delta };
  }
  if (oldStart >= range.end) {
    return { kind: "owned", start: range.start, end: range.end };
  }
  if (oldStart >= range.start && oldEnd <= range.end) {
    const end = range.end + delta;
    return end <= range.start
      ? { kind: "deleted" }
      : { kind: "owned", start: range.start, end };
  }
  return { kind: "merged" };
}

function pbpAiRemoveSummaryRange(value, range) {
  const text = String(value || "");
  if (!_pbpAiSummaryRangeValid(text, range)) return { value: text, removed: false };
  let before = text.slice(0, range.start);
  let after = text.slice(range.end);
  if (before.endsWith("\n\n") && after.startsWith("\n\n")) {
    after = after.slice(2);
  } else if (before.endsWith("\n\n")) {
    before = before.slice(0, -2);
  } else if (after.startsWith("\n\n")) {
    after = after.slice(2);
  }
  return { value: before + after, removed: true };
}

// Legacy recognition only: new summaries no longer write [AI Summary].
// The regex literal lives in shared.js so old-block migration/removal cannot drift.
const AI_BQ_REGEX = _AI_BQ_REGEX_SHARED;
// pbpShouldRestoreCachedSummary is defined in shared.js (pure helper, B4).
let _aiSummaryRange = null;
let _aiSummaryValue = "";

const AI_SUMMARY_OWNER_PREFIX = "summary_owner_";

function pbpAiSummaryOwnershipKey(account, url) {
  const normalizedUrl = _aiNormalizeUrl(url);
  if (!account || !normalizedUrl) return "";
  return AI_SUMMARY_OWNER_PREFIX + encodeURIComponent(account) + "_" + normalizedUrl;
}

async function pbpAiSummaryTextHash(value) {
  const bytes = new TextEncoder().encode(String(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function pbpAiSummaryOwnershipSnapshot(description) {
  if (_aiSummaryValue !== description ||
      !_pbpAiSummaryRangeValid(description, _aiSummaryRange)) return null;
  return { start: _aiSummaryRange.start, end: _aiSummaryRange.end };
}

async function pbpAiSaveSummaryOwnership(account, url, description, range) {
  const key = pbpAiSummaryOwnershipKey(account, url);
  if (!key) return;
  if (!_pbpAiSummaryRangeValid(description, range)) {
    if (typeof pbpAiCacheDelete === "function") await pbpAiCacheDelete(key);
    return;
  }
  if (typeof pbpAiCacheSet !== "function") return;
  const savedAt = Date.now();
  const receipt = {
    account,
    url: _aiNormalizeUrl(url),
    notesHash: await pbpAiSummaryTextHash(description),
    start: range.start,
    end: range.end,
    savedAt
  };
  await pbpAiCacheSet(key, receipt, savedAt);
}

async function pbpAiLoadSummaryOwnership(account, url, description) {
  const key = pbpAiSummaryOwnershipKey(account, url);
  if (!key || typeof pbpAiCacheGet !== "function") return null;
  const entry = await pbpAiCacheGet(key);
  const receipt = entry && entry.result;
  const basicValid = receipt &&
    receipt.account === account &&
    receipt.url === _aiNormalizeUrl(url) &&
    _pbpAiSummaryRangeValid(description, receipt);
  if (!basicValid) {
    if (entry && typeof pbpAiCacheDelete === "function") await pbpAiCacheDelete(key);
    return null;
  }
  let notesHash;
  try { notesHash = await pbpAiSummaryTextHash(description); }
  catch (_) { return null; }
  if (notesHash !== receipt.notesHash) {
    if (typeof pbpAiCacheDelete === "function") await pbpAiCacheDelete(key);
    return null;
  }
  return { start: receipt.start, end: receipt.end };
}

// ---- Setup AI feature listeners ----
// ---- AI Error Card ----
let _aiErrorLastOp = null; // "summary" | "tags"
let _aiErrorLastPermission = null;

// Fallback provider order: stable list, current provider gets skipped.
const AI_PROVIDER_ORDER = [
  "gemini", "openai", "claude", "deepseek", "qwen", "openrouter", "groq",
  "mistral", "cohere", "siliconflow", "zhipu", "kimi", "minimax",
  "ollama", "custom"
];
const AI_PROVIDER_LABEL = {
  gemini: "Gemini", openai: "OpenAI", claude: "Claude", deepseek: "DeepSeek",
  qwen: "Qwen", minimax: "MiniMax", openrouter: "OpenRouter", groq: "Groq",
  mistral: "Mistral", cohere: "Cohere", siliconflow: "SiliconFlow", zhipu: "Zhipu",
  kimi: "Kimi", ollama: "Ollama", custom: "Custom"
};

// Find first provider OTHER than `current` that has a usable key, by iterating
// AI_PROVIDER_ORDER. Returns null if no fallback is available.
function pickFallbackProvider(s) {
  const current = s.aiProvider || "gemini";
  for (const p of AI_PROVIDER_ORDER) {
    if (p === current) continue;
    if (hasAIKey({ ...s, aiProvider: p })) return p;
  }
  return null;
}

function showAIError(op, err, opSettings) {
  // opSettings = the immutable snapshot the failed op actually ran with
  // (audit A4): the error card must describe the provider that failed,
  // not whatever the global settings hold by the time it renders.
  const s = opSettings || settings;
  _aiErrorLastOp = op;
  _aiErrorLastPermission = err?.code === "host_permission" ? {
    settings: { ...s },
    stage: err.permissionStage,
    origins: [...(err.permissionOrigins || _aiRequiredOriginPatterns(s))],
  } : null;
  const card = $id("ai-error-card");
  if (!card) return;
  const providerKey = (s.aiProvider || "openai");
  const provLabel = AI_PROVIDER_LABEL[providerKey] || providerKey;
  $id("ai-error-title").textContent = t("aiErrorTitle", op === "tags" ? t("aiErrorOpTags") : t("aiErrorOpSummary"));
  const msgEl = $id("ai-error-message");

  const short = (err && err.message) ? err.message : String(err || t("aiUnknownError"));

  // Remove any previously inserted model-not-found hint element
  msgEl.parentElement.querySelector(".model-not-found-hint")?.remove();

  if (err?.code === "model_not_found") {
    const mnf = pbpAiModelNotFoundText(provLabel);
    msgEl.textContent = mnf.msg;
    const hintEl = document.createElement("div");
    hintEl.className = "model-not-found-hint";
    hintEl.textContent = mnf.hint;
    msgEl.parentElement.insertBefore(hintEl, msgEl.nextSibling);
  } else {
    msgEl.textContent = `[${provLabel}] ${short}`;
  }

  const detailsEl = $id("ai-error-details");
  detailsEl.textContent = (err && err.stack) ? err.stack : short;
  detailsEl.classList.add("hidden");
  $id("ai-error-details-toggle").textContent = t("aiErrorDetails");

  // Fallback button: show when another provider has a valid key
  const fallbackBtn = $id("ai-error-fallback");
  if (fallbackBtn) {
    // Pick relative to the provider that actually FAILED (Codex r2 L5):
    // after a fallback-provider failure, choosing from the global default
    // could re-offer the provider that just failed.
    const next = pickFallbackProvider(s);
    if (next) {
      const nextLabel = AI_PROVIDER_LABEL[next] || next;
      fallbackBtn.textContent = t("aiErrorTryWith", nextLabel) || `Try with ${nextLabel}`;
      fallbackBtn.dataset.provider = next;
      fallbackBtn.classList.remove("hidden");
    } else {
      fallbackBtn.classList.add("hidden");
      delete fallbackBtn.dataset.provider;
    }
  }

  const retryBtn = $id("ai-error-retry");
  if (retryBtn) retryBtn.textContent = t(err?.code === "host_permission" ? "aiGrantRetry" : "aiErrorRetry");

  clearTimeout(_aiErrorHideTimer);
  card.classList.remove("dismissing");
  card.classList.remove("hidden");
}

let _aiErrorHideTimer = null;
function hideAIError({ animate = false } = {}) {
  const card = $id("ai-error-card");
  if (card) {
    clearTimeout(_aiErrorHideTimer);
    if (animate && !card.classList.contains("hidden")
        && document.documentElement.classList.contains("motion-ready")) {
      // Dismiss button only, and only once motion-ready (same gate as the
      // shared confirm popover -- keeps the harness pages, which never mark
      // motion-ready, on synchronous .hidden semantics). The programmatic
      // call sites clear the card right before starting a fresh AI op; a
      // 120ms deferred .hidden there would swallow the next card.
      card.classList.add("dismissing");
      _aiErrorHideTimer = setTimeout(() => {
        card.classList.remove("dismissing");
        card.classList.add("hidden");
      }, 120);
    } else {
      card.classList.remove("dismissing");
      card.classList.add("hidden");
    }
  }
  const retryBtn = $id("ai-error-retry");
  if (retryBtn) retryBtn.textContent = t("aiErrorRetry");
  _aiErrorLastOp = null;
  _aiErrorLastPermission = null;
}

function setupAIFeatures() {
  // Wire error card controls once
  $id("ai-error-dismiss")?.addEventListener("click", (e) => { e.preventDefault(); hideAIError({ animate: true }); });
  $id("ai-error-retry")?.addEventListener("click", async (event) => {
    const retryBtn = event.currentTarget;
    if (retryBtn.disabled) return;
    retryBtn.disabled = true;
    try {
      const op = _aiErrorLastOp;
      const recovery = _aiErrorLastPermission;
      if (!op) return;
      if (recovery) {
        const providerOrigin = _aiTargetOriginPattern(recovery.settings);
        const extraOrigins = recovery.origins.filter(origin => origin !== providerOrigin);
        const granted = await requestAIHostPermissions(recovery.settings, extraOrigins);
        if (!granted) return;
      }
      hideAIError();
      // Immutable per-op snapshot (audit A4): the old code mutated the
      // GLOBAL settings.aiProvider for the await's duration, so a
      // concurrent tags/summary op could read the wrong provider
      // mid-flight and the interleaved finally could restore a stale one.
      const opSettings = recovery
        ? { ...settings, aiProvider: recovery.settings.aiProvider }
        : undefined;
      if (op === "tags") await doAITags(true, opSettings);
      else if (op === "summary") await doAISummary(true, opSettings);
    } finally {
      retryBtn.disabled = false;
    }
  });
  $id("ai-error-fallback")?.addEventListener("click", async (e) => {
    const next = e.currentTarget.dataset.provider;
    const op = _aiErrorLastOp;
    if (!next || !op) return;
    // One-shot override via an immutable snapshot (audit A4) — never by
    // mutating the global settings: a concurrent op would read the swapped
    // provider mid-flight. Nothing to restore; the global stays untouched.
    hideAIError();
    const opSettings = { ...settings, aiProvider: next };
    if (op === "tags") await doAITags(true, opSettings);
    else if (op === "summary") await doAISummary(true, opSettings);
  });
  $id("ai-error-details-toggle")?.addEventListener("click", (e) => {
    e.preventDefault();
    const d = $id("ai-error-details");
    d.classList.toggle("hidden");
    e.target.textContent = d.classList.contains("hidden") ? t("aiErrorDetails") : t("aiErrorHideDetails");
  });

  $id("ai-summary-btn").addEventListener("click", async (e) => {
    e.preventDefault();
    await doAISummary(false);
  });

  const descriptionInput = $id("description-input");
  _aiSummaryValue = descriptionInput.value;
  descriptionInput.addEventListener("input", () => {
    const nextValue = descriptionInput.value;
    if (!_aiSummaryRange) {
      _aiSummaryValue = nextValue;
      return;
    }
    const tracked = pbpAiTrackSummaryRange(_aiSummaryRange, _aiSummaryValue, nextValue);
    _aiSummaryValue = nextValue;
    if (tracked.kind === "owned") {
      _aiSummaryRange = { start: tracked.start, end: tracked.end };
      return;
    }
    _aiSummaryRange = null;
    _aiResetSummaryActions();
    if (tracked.kind === "merged") {
      showStatus("status-msg", t("aiSummaryMerged"), "error");
    }
  });

  // Auto-restore cached summary only for fresh (non-bookmarked) pages whose
  // description doesn't already contain a summary. For existing bookmarks,
  // checkExistingBookmark (popup.js) restores the user's saved `extended` — we
  // must not race it (lost summary) or append on top (duplicate summary).
  const restoreAccount = pbpPopupAiAccount();
  // Same namespace rule as a click (review C9): a video summary made from
  // the captions lives under "transcript", not the configured source.
  pbpAiFastCached("summary", settings, restoreAccount).then(async (cached) => {
    await _aiAwaitBookmarkLookup();
    if (!_aiOpStillCurrent(restoreAccount)) return;
    if (existingBookmark) {
      await _aiRestoreSummaryOwnership(restoreAccount, pageInfo.url, cached);
      return;
    }
    if (cached &&
        pbpShouldRestoreCachedSummary(existingBookmark, $id("description-input").value)) {
      upsertSummary(cached);
      showSummaryActions(true);
    }
  });

  $id("ai-tags-btn").addEventListener("click", async (e) => {
    e.preventDefault();
    await doAITags(false);
  });
}

// All complete [AI Summary] blocks in a description, in order. Callers
// operate on the LAST one (the block this popup manages); earlier ones
// are legacy duplicates the user can clean up block-by-block.
function _aiSummaryBlockMatches(text) {
  return [...String(text || "").matchAll(new RegExp(AI_BQ_REGEX.source, "g"))];
}

function _aiLastLegacySummaryRange(value) {
  const matches = _aiSummaryBlockMatches(value);
  if (!matches.length) return null;
  const last = matches[matches.length - 1];
  const lead = last[1] || "";
  return {
    start: last.index + lead.length,
    end: last.index + last[0].length
  };
}

function _aiAdoptSummaryRange(value, range, fromCache) {
  const input = $id("description-input");
  if (input.value !== value || !_pbpAiSummaryRangeValid(value, range)) return false;
  _aiSummaryRange = { start: range.start, end: range.end };
  _aiSummaryValue = value;
  showSummaryActions(fromCache);
  return true;
}

async function _aiRestoreSummaryOwnership(account, url, cachedSummary) {
  const input = $id("description-input");
  const value = input.value;
  if (_aiSummaryValue === value &&
      _pbpAiSummaryRangeValid(value, _aiSummaryRange)) {
    showSummaryActions(false);
    return "session";
  }

  const receiptRange = existingBookmark && value === existingBookmark.extended
    ? await pbpAiLoadSummaryOwnership(account, url, value)
    : null;
  if (!_aiOpStillCurrent(account) || input.value !== value) return null;
  if (receiptRange && _aiAdoptSummaryRange(value, receiptRange, false)) return "receipt";

  const legacyRange = _aiLastLegacySummaryRange(value);
  if (legacyRange && _aiAdoptSummaryRange(value, legacyRange, false)) return "legacy";

  const cachedRange = cachedSummary
    ? pbpAiFindLastExactSummaryRange(value, cachedSummary)
    : null;
  if (cachedRange && _aiAdoptSummaryRange(value, cachedRange, true)) return "cache";
  return null;
}

// ---- Insert or replace AI summary in description ----
// Replace the session-owned range, migrate the last legacy block in place,
// or append a new block without rewriting surrounding notes.
function upsertSummary(summary) {
  const di = $id("description-input");
  const cur = di.value;
  const wrapped = pbpAiWrapSummary(summary);
  let next;
  let start;
  if (_aiSummaryValue === cur && _pbpAiSummaryRangeValid(cur, _aiSummaryRange)) {
    start = _aiSummaryRange.start;
    next = cur.slice(0, start) + wrapped + cur.slice(_aiSummaryRange.end);
  } else {
    _aiSummaryRange = null;
    const legacyRange = _aiLastLegacySummaryRange(cur);
    if (legacyRange) {
      start = legacyRange.start;
      next = cur.slice(0, legacyRange.start) + wrapped + cur.slice(legacyRange.end);
    } else {
      const separator = !cur || cur.endsWith("\n\n") ? "" : (cur.endsWith("\n") ? "\n" : "\n\n");
      start = cur.length + separator.length;
      next = cur + separator + wrapped;
    }
  }
  di.value = next;
  _aiSummaryRange = { start, end: start + wrapped.length };
  _aiSummaryValue = next;
  updateCharCount();
  autoResizeTextarea(di);
}

// ---- Remove AI summary block from description ----
// Remove only the session-owned range, or the last identifiable legacy block.
function removeSummary() {
  const di = $id("description-input");
  const cur = di.value;
  let removed = { value: cur, removed: false };
  if (_aiSummaryValue === cur && _pbpAiSummaryRangeValid(cur, _aiSummaryRange)) {
    removed = pbpAiRemoveSummaryRange(cur, _aiSummaryRange);
  } else {
    _aiSummaryRange = null;
    const legacyRange = _aiLastLegacySummaryRange(cur);
    if (legacyRange) removed = pbpAiRemoveSummaryRange(cur, legacyRange);
  }
  if (removed.removed) di.value = removed.value;
  _aiSummaryRange = null;
  _aiSummaryValue = di.value;
  updateCharCount();
  autoResizeTextarea(di);
  return removed.removed;
}

// Unified "no AI key" prompt: one feedback card shared by AI summary and AI tags so
// both behave identically. The full standard sentence lives in the aiSetKey message,
// which marks the word linking to the options page with [[...]] — e.g.
// "Set AI API key in [[settings]]". Marking the word in place (rather than composing
// a prefix + the settings word) keeps the sentence grammatical in every locale: CJK/JA
// put the word mid-sentence and pl/ru decline it ("ustawieniach", "настройках"). The
// link label is the marked word itself, so the declension is preserved. Persistent
// (no autoHide): it's an actionable setup prompt, not a transient status.
function showSetKeyError() {
  if (window._lastStatusFeedback) window._lastStatusFeedback.dismiss();
  const raw = t("aiSetKey");
  const msg = document.createElement("span");
  const m = raw.match(/\[\[(.+?)\]\]/);
  if (m) {
    if (m.index > 0) msg.appendChild(document.createTextNode(raw.slice(0, m.index)));
    const link = document.createElement("a");
    link.href = "#";
    link.className = "go-settings";
    link.textContent = m[1];
    link.addEventListener("click", (e) => { e.preventDefault(); pbpOpenOptionsTab("ai"); });
    msg.appendChild(link);
    const rest = raw.slice(m.index + m[0].length);
    if (rest) msg.appendChild(document.createTextNode(rest));
  } else {
    msg.textContent = raw;
  }
  window._lastStatusFeedback = showFeedback({ variant: "error", messageNode: msg });
}

// Apply optional case-resolution to AI tags (mirrors the prior inline doAITags logic).
function finalizeAITags(rawTags, s) {
  return (s || settings).optRespectTagCase ? rawTags.map(t => resolveTagCase(t, tagCaseMap)) : rawTags;
}

// Fetch one AI artifact ("summary" | "tags") for the current page (cache-miss path only).
// If the OTHER artifact is also missing, issue ONE combined call and cache the other
// half so its later click is an instant, zero-extra-body-token cache hit. forceRefresh
// (regenerate) always does a single dedicated call. Combined failure -> single fallback.
// `s` = the caller's immutable settings snapshot (audit A4): every read
// below sees one consistent provider/model/lang for the op's whole life.
async function fetchAIArtifacts(kind, forceRefresh, account, s, source) {
  s = s || settings;
  source = source || s.aiContentSource;
  const url = pageInfo.url;
  const otherKind = kind === "summary" ? "tags" : "summary";
  // Inflight identity carries the same generation fingerprint as the
  // cache keys (audit A5): two ops differing in model/lang/template must
  // not dedupe onto one request.
  const combinedKey = `${account}|${aiCacheFingerprint(s, "combined")}|combined|${url}`;
  if (!pbpPopupAiAccountIsCurrent(account)) return null;

  const callSingle = () => {
    if (kind === "summary") {
      return getOrCreateInflight(`${account}|${aiCacheFingerprint(s, "summary")}|summary|${url}`, () =>
        callAI(s, buildSummaryPrompt(s, $id("title-input").value, pageInfo.url, pageInfo.pageText, $id("description-input").value)));
    }
    return getOrCreateInflight(`${account}|${aiCacheFingerprint(s, "tags")}|tags|${url}`, async () => {
      const resp = await callAI(s, buildTagPrompt(s, $id("title-input").value, pageInfo.url, pageInfo.pageText, $id("description-input").value, pbpRelevantTagsFirst(allUserTags, $id("title-input").value, pageInfo.url)));
      return finalizeAITags(refineTags(parseAITags(resp, s.aiTagSeparator), { cap: AI_TAG_CAP, separator: s.aiTagSeparator }), s);
    });
  };

  if (forceRefresh) return callSingle();

  // Codex r2 M2: extraction may have fallen back to a different source than
  // the one the caller's fast-path cache check probed (Jina -> local; and
  // with a caption grant that probe is "transcript" alone, so a video
  // without captions lands here with source "local" -- Codex r9 H2).
  // Re-check our own kind under the ACTUAL namespace before paying for a
  // call; one local read.
  {
    const own = await getAICache(url, kind, s.aiCacheDuration, source, account, s);
    if (!pbpPopupAiAccountIsCurrent(account)) return null;
    if (own != null) return own;
  }

  // Custom-prompt users keep their own templates -> never use the combined prompt
  // (it uses TAG_GUIDANCE, not customTagPrompt/customSummaryPrompt). Global Constraint.
  if (s.customTagPrompt?.trim() || s.customSummaryPrompt?.trim()) return callSingle();

  // A8: a combined reply may come back half-empty ({"summary":"ok",
  // "tags":[]}) - the parser deliberately tolerates that so the GOOD half
  // survives, but the requester of the EMPTY half must treat it as a
  // miss, not render/cache an empty artifact as success.
  const halfOf = (both, which) => which === "tags"
    ? (both.tags && both.tags.length ? finalizeAITags(both.tags, s) : null)
    : (both.summary ? both.summary : null);

  // Ride an in-flight combined call if one is already running. If that call
  // rejects (combined parse failure) or came back empty for OUR half, fall
  // through to this call's own cache/single path instead of surfacing the
  // other click's error or its empty half.
  if (_inflightAI.has(combinedKey)) {
    try {
      const both = await _inflightAI.get(combinedKey);
      if (!pbpPopupAiAccountIsCurrent(account)) return null;
      if (both) {
        const mine = halfOf(both, kind);
        if (mine != null) return mine;
      }
    } catch (_) { /* combined in-flight failed */ }
    // Codex r2 M4: the combined attempt already ran - whatever its
    // outcome, falling through re-entered the opportunistic branch and
    // fired a SECOND combined call (reproduced: 2x combined + 1x single
    // for one half-empty reply). Go straight to the dedicated single
    // call for our half.
    if (!pbpPopupAiAccountIsCurrent(account)) return null;
    return callSingle();
  }

  // If the other half is already cached, only the requested half is missing.
  const otherCached = await getAICache(url, otherKind, s.aiCacheDuration, source, account, s);
  if (!pbpPopupAiAccountIsCurrent(account)) return null;
  if (otherCached != null) return callSingle();

  // Opportunistic combined call.
  let both = null;
  try {
    both = await getOrCreateInflight(combinedKey, async () => {
      const resp = await callAI(s, buildCombinedPrompt(s, $id("title-input").value, pageInfo.url, pageInfo.pageText, $id("description-input").value, pbpRelevantTagsFirst(allUserTags, $id("title-input").value, pageInfo.url)));
      return parseAICombined(resp, s.aiTagSeparator);
    });
  } catch (e) {
    both = null;
  }
  if (!pbpPopupAiAccountIsCurrent(account)) return null;
  if (!both) return callSingle();

  // Cache the OTHER half so its later click is instant + free - but only
  // when that half has content: caching a combined-parse empty would turn
  // a malformed half into a sticky fake success (A8).
  const otherVal = halfOf(both, otherKind);
  if (otherVal != null && pbpPopupAiAccountIsCurrent(account)) {
    await setAICache(url, otherKind, otherVal, s.aiCacheDuration, source, account, s);
  }
  if (!pbpPopupAiAccountIsCurrent(account)) return null;
  // Empty requested half = miss -> dedicated single call (A8).
  const mine = halfOf(both, kind);
  return mine != null ? mine : callSingle();
}

// ---- AI Summary core logic ----
// sOverride (audit A4): optional immutable settings snapshot (fallback/
// retry provider swaps). The op freezes its own copy up front - every
// read across the awaits below sees one consistent configuration.
async function doAISummary(forceRefresh, sOverride) {
  const btn = $id("ai-summary-btn");
  const s = { ...(sOverride || settings) };
  const account = pbpPopupAiAccount();
  if (!account) return;
  if (!hasAIKey(s)) { showSetKeyError(); return; }
  if (!_aiUrlEquivalent($id("url-input").value, pageInfo.url)) {
    showStatus("status-msg", t("aiUrlEdited"), "error");
    return;
  }
  hideAIError();
  // audit A2: a pending bookmark lookup rewrites the description when it
  // lands - a summary inserted before that gets clobbered (paid result
  // lost, regenerate/remove bar stranded over nothing).
  await _aiAwaitBookmarkLookup();
  if (!_aiOpStillCurrent(account)) return;

  if (!forceRefresh) {
    const cached = await pbpAiFastCached("summary", s, account);
    if (cached && _aiOpStillCurrent(account)) {
      const adopted = await _aiRestoreSummaryOwnership(account, pageInfo.url, cached);
      if (!_aiOpStillCurrent(account)) return;
      if (adopted) return;
      upsertSummary(cached);
      showSummaryActions(true);
      return;
    }
  }

  const showProgressOnBtn = btn && !btn.classList.contains("hidden");
  if (showProgressOnBtn) {
    btn.classList.add("loading");
  }
  try {
    if (showProgressOnBtn) setAiProgress("ai-summary-btn", { provider: s.aiProvider, stage: "extracting" });
    const contentSource = await ensurePageText(s, showProgressOnBtn ? "ai-summary-btn" : "");
    if (!_aiOpStillCurrent(account)) return;
    if (!pageInfo.pageText) { showStatus("status-msg", t("aiNoContent"), "error"); return; }
    if (showProgressOnBtn) setAiProgress("ai-summary-btn", { provider: s.aiProvider, stage: "calling" });
    const summary = await fetchAIArtifacts("summary", forceRefresh, account, s, contentSource);
    // account-only here: the result belongs to pageInfo.url and SHOULD be
    // cached even if the URL field drifted; the stillCurrent gate below
    // protects the form commit.
    if (!pbpPopupAiAccountIsCurrent(account)) return;
    if (showProgressOnBtn) setAiProgress("ai-summary-btn", { provider: s.aiProvider, stage: "parsing" });
    await setAICache(pageInfo.url, "summary", summary, s.aiCacheDuration, contentSource, account, s);
    if (!_aiOpStillCurrent(account)) return;
    upsertSummary(summary);
    showSummaryActions(false);
    showStatus("status-msg", forceRefresh ? t("aiSummaryRegenerated") : t("aiSummaryGenerated"), "success");
  } catch (e) {
    if (!_aiOpStillCurrent(account)) return;
    if (e?.code === "host_permission" && !e.permissionOrigins) {
      e.permissionStage = "calling";
      e.permissionOrigins = _aiRequiredOriginPatterns(s);
    }
    showAIError("summary", e, s);
    if (forceRefresh) showSummaryActions(false);
  } finally {
    if (showProgressOnBtn && pbpPopupAiAccountIsCurrent(account)) {
      clearAiProgress("ai-summary-btn");
      btn.classList.remove("loading");
    }
  }
}

function _aiResetSummaryActions() {
  const btn = $id("ai-summary-btn");
  btn?.parentElement?.querySelector(".cache-hint-wrap")?.remove();
  if (btn) {
    setBtnIcon(btn, "robot", t("aiSummaryBtn"));
    btn.classList.remove("loading");
    btn.classList.toggle("hidden", settings.optShowAiSummary === false);
  }
  const hint = $id("ai-summary-hint");
  if (hint && settings.optShowAiSummary !== false) hint.classList.remove("hidden");
}

// ---- Show regenerate + remove actions after summary is inserted ----
function showSummaryActions(fromCache) {
  const btn = $id("ai-summary-btn");
  const bar = btn.parentElement;
  btn.classList.add("hidden");
  $id("ai-summary-hint")?.classList.add("hidden");
  bar.querySelector(".cache-hint-wrap")?.remove();

  const wrap = document.createElement("span");
  wrap.className = "cache-hint-wrap";

  if (fromCache) {
    const hint = document.createElement("span");
    hint.className = "cache-hint";
    hint.textContent = t("aiCached");
    wrap.appendChild(hint);
  }

  function createActionLink(text, action) {
    const link = document.createElement("a");
    link.href = "#";
    link.className = "regen-link";
    link.dataset.action = action;
    link.textContent = text;
    return link;
  }

  const regenLink = createActionLink(t("aiRegenerate"), "regenerate");
  regenLink.title = t("aiSummaryBtnTitle");
  const removeLink = createActionLink(t("aiRemove"), "remove");
  wrap.appendChild(regenLink);
  wrap.appendChild(removeLink);
  bar.appendChild(wrap);

  removeLink.addEventListener("click", (e) => {
    e.preventDefault();
    const removed = removeSummary();
    _aiResetSummaryActions();
    showStatus("status-msg", t(removed ? "aiSummaryRemoved" : "aiSummaryMerged"), removed ? "success" : "error");
  });

  regenLink.addEventListener("click", async (e) => {
    e.preventDefault();
    // Guard FIRST. doAISummary refuses on an edited URL, and
    // pbpAiSyncUrlEditState only disables #ai-summary-btn / #ai-tags-btn, so
    // this link stays clickable: swapping the label before the refusal left it
    // pinned on "Regenerating..." forever, with no request and no feedback.
    if (!_aiUrlEquivalent($id("url-input").value, pageInfo.url)) {
      showStatus("status-msg", t("aiUrlEdited"), "error");
      return;
    }
    wrap.querySelectorAll(".regen-link").forEach(l => l.classList.add("loading"));
    regenLink.textContent = t("aiRegenerating");
    await doAISummary(true);
  });
}

// ---- AI Tags core logic ----
// sOverride: same immutable-snapshot contract as doAISummary (audit A4).
async function doAITags(forceRefresh, sOverride) {
  const btn = $id("ai-tags-btn");
  const container = $id("ai-suggest-tags");
  const s = { ...(sOverride || settings) };
  const account = pbpPopupAiAccount();
  if (!account) return;
  hideAIError();

  if (!hasAIKey(s)) { showSetKeyError(); return; }
  if (!_aiUrlEquivalent($id("url-input").value, pageInfo.url)) {
    showStatus("status-msg", t("aiUrlEdited"), "error");
    return;
  }

  if (!forceRefresh) {
    const cached = await pbpAiFastCached("tags", s, account);
    if (cached && _aiOpStillCurrent(account)) {
      renderAITags(cached, true);
      return;
    }
  }

  // ai-tags-btn now HIDES once chips render (renderAITags parks it instead of
  // deleting it), so drive progress the way doAISummary always has - a hidden
  // button must not collect stage labels a regenerate run would never show.
  const showProgressOnBtn = btn && !btn.classList.contains("hidden");
  if (showProgressOnBtn) {
    btn.classList.add("loading");
  }

  try {
    if (showProgressOnBtn) setAiProgress("ai-tags-btn", { provider: s.aiProvider, stage: "extracting" });
    const contentSource = await ensurePageText(s, showProgressOnBtn ? "ai-tags-btn" : "");
    if (!_aiOpStillCurrent(account)) return;
    if (!pageInfo.pageText) { showStatus("status-msg", t("aiNoContent"), "error"); return; }
    if (showProgressOnBtn) setAiProgress("ai-tags-btn", { provider: s.aiProvider, stage: "calling" });
    const tags = await fetchAIArtifacts("tags", forceRefresh, account, s, contentSource);
    // account-only here: cache the paid result regardless of URL drift;
    // the stillCurrent gate below protects the chip render.
    if (!pbpPopupAiAccountIsCurrent(account)) return;
    if (showProgressOnBtn) setAiProgress("ai-tags-btn", { provider: s.aiProvider, stage: "parsing" });
    // Empty result = miss, never a cached fake success (same ruling as the
    // combined-parse halves above): caching [] would make every later click
    // return "no tags" for free until the entry expired.
    if (tags.length) await setAICache(pageInfo.url, "tags", tags, s.aiCacheDuration, contentSource, account, s);
    if (!_aiOpStillCurrent(account)) return;
    renderAITags(tags, false);
    if (forceRefresh) {
      showStatus("status-msg", t("aiTagsRegenerated"), "success");
    }
  } catch (e) {
    if (!_aiOpStillCurrent(account)) return;
    if (e?.code === "host_permission" && !e.permissionOrigins) {
      e.permissionStage = "calling";
      e.permissionOrigins = _aiRequiredOriginPatterns(s);
    }
    _aiClearTagsOutput(container);
    container.classList.remove("muted");
    _aiParkTagsBtn(container, true); // keep a retry entry once the error card is dismissed
    pbpAssignAltNumBadges(); // AI chips gone: re-slot so suggest-row digits/hint stay truthful
    showAIError("tags", e, s);
  } finally {
    // Cleanup stays keyed on `btn`, not showProgressOnBtn: renderAITags may
    // have parked (hidden) the button between the two, and both calls are
    // idempotent no-ops when no progress was ever shown.
    if (btn && pbpPopupAiAccountIsCurrent(account)) {
      clearAiProgress("ai-tags-btn");
      btn.classList.remove("loading");
    }
  }
}

// Tags added via AI chips THIS popup session (lowercase). Replace-mode
// regen may only retract tags it knows the AI added here: a same-named
// tag the user typed, or that came back on an existing bookmark, has no
// AI provenance and must survive (audit A10).
const _aiSessionAddedTags = new Set();

// #ai-tags-btn is a CHILD of #ai-suggest-tags (popup.html) and nothing in the
// codebase rebuilds it, so clearing the container wholesale used to delete the
// only entry point for a rerun: once the user dismissed the error card (which
// also drops the Retry action) Shift+Enter was all that was left, and that
// fires the summary too. Remove only what a render produced, and PARK the
// button - hidden while chips are up, visible again on error/empty - rather
// than detaching it: $id drops detached nodes, so a removed button is gone
// for the life of the popup.
const AI_TAGS_OUTPUT_SEL = ".stag, .add-all-link, .cache-hint-wrap, .empty-state";
function _aiClearTagsOutput(container) {
  container.querySelectorAll(AI_TAGS_OUTPUT_SEL).forEach((n) => n.remove());
}
function _aiParkTagsBtn(container, visible) {
  const btn = $id("ai-tags-btn");
  if (!btn) return;
  btn.classList.remove("loading");
  btn.classList.toggle("hidden", !visible);
  if (visible && container.firstChild !== btn) container.prepend(btn);
}
// injectEmptyState() clears its host; build it detached and move the block in
// so the parked button above it survives.
function _aiAppendEmptyState(container, svgKey, message) {
  const holder = document.createElement("div");
  injectEmptyState(holder, svgKey, message);
  const node = holder.firstElementChild;
  if (node) container.appendChild(node);
}

function renderAITags(tags, fromCache) {
  const container = $id("ai-suggest-tags");
  _aiClearTagsOutput(container);
  container.classList.remove("muted");

  if (!tags.length) {
    _aiAppendEmptyState(container, "spark", t("emptyAiTagsHint"));
    _aiParkTagsBtn(container, true);
    pbpAssignAltNumBadges();
    return;
  }
  _aiParkTagsBtn(container, false);

  // Render in the model's specificity order (most defining first); do NOT reorder
  // owned tags to the front — that would bury a new defining tag like "ai_token_relay".
  // Real <button>s like the suggest row's chips (popup-tags.js): AI chips share
  // the .stag Alt+N pipeline, and syncSuggestTagStates sets .disabled, which
  // only carries native semantics (focusability, AT state) on a button.
  tags.forEach((tag) => {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "stag ai";
    el.dataset.tag = tag;
    el.appendChild(document.createTextNode(tag));
    const count = allUserTagCounts[tag];
    if (count) {
      const cs = document.createElement("span");
      cs.className = "ac-count";
      cs.textContent = ` (${count})`;
      el.appendChild(cs);
    }
    el.addEventListener("click", () => {
      addTag(tag);
      _aiSessionAddedTags.add(tag.toLowerCase());
      el.classList.add("used");
      el.disabled = true;
    });
    container.appendChild(el);
  });

  const aa = document.createElement("button");
  aa.type = "button";
  aa.className = "add-all-link";
  aa.textContent = t("addAll");
  aa.setAttribute("aria-label", t("addAll"));
  aa.addEventListener("click", () => {
    container.querySelectorAll(".stag:not(.used)").forEach((el) => {
      addTag(el.dataset.tag);
      _aiSessionAddedTags.add(el.dataset.tag.toLowerCase());
      el.classList.add("used");
    });
    aa.innerHTML = PBP_ICONS.check; aa.disabled = true; aa.classList.add("tag-copied-flash");
  });
  container.appendChild(aa);
  pbpAssignAltNumBadges();

  if (fromCache) {
    const cachedTagSet = new Set(tags.map(t => t.toLowerCase()));
    const hintWrap = document.createElement("span");
    hintWrap.className = "cache-hint-wrap";
    hintWrap.style.display = "inline-block";
    hintWrap.style.marginLeft = "8px";

    const cachedSpan = document.createElement("span");
    cachedSpan.className = "cache-hint";
    cachedSpan.textContent = t("aiCached");
    hintWrap.appendChild(cachedSpan);

    ["append", "replace"].forEach(mode => {
      const link = document.createElement("a");
      link.href = "#";
      link.className = "regen-link";
      link.dataset.mode = mode;
      link.textContent = mode === "append" ? t("aiRegenerate") : t("aiReplace");
      link.addEventListener("click", async (e) => {
        e.preventDefault();
        // Codex r2 M3: the form may have been switched to another bookmark
        // (edit-from-recent) since these links rendered - doAITags would
        // refuse below, but the replace-mode removal would already have
        // fired. Gate the whole handler on op liveness first - and before the
        // label/loading swap, which otherwise pinned the link on
        // "Regenerating..." forever (these links are not covered by
        // pbpAiSyncUrlEditState's disabled-link pass), with no feedback.
        if (!_aiUrlEquivalent($id("url-input").value, pageInfo.url)) {
          showStatus("status-msg", t("aiUrlEdited"), "error");
          return;
        }
        hintWrap.querySelectorAll(".regen-link").forEach((l) => l.classList.add("loading"));
        link.textContent = mode === "replace" ? t("aiReplacing") : t("aiRegenerating");
        if (mode === "replace") {
          // Retract only tags this session's AI chips added: a same-named
          // tag with no AI provenance (typed, or from the saved bookmark)
          // stays (audit A10).
          currentTags = currentTags.filter(t =>
            !(cachedTagSet.has(t.toLowerCase()) && _aiSessionAddedTags.has(t.toLowerCase())));
          renderTags();
        }
        await doAITags(true);
      });
      hintWrap.appendChild(link);
    });

    container.appendChild(hintWrap);
  }
}
