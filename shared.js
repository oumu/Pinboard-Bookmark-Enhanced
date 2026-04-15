// ============================================================
// Pinboard Bookmark Enhanced - Shared Constants
// ============================================================

const ADAPTIVE_THEME_MAP = {
  flexoki: ["flexoki-light", "flexoki-dark"],
  solarized: ["solarized-light", "solarized-dark"],
  catppuccin: ["catppuccin-latte", "catppuccin-mocha"]
};

const TEXTAREA_MIN_HEIGHT = 54;
const TEXTAREA_MAX_HEIGHT = 300;
const TAG_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

const DEFAULT_TAG_PROMPT = `Suggest 5-10 bookmark tags for the following webpage. {{lang_instruction}} Tags should be lowercase, {{separator_instruction}}. Return ONLY a JSON array.

Title: {{title}}
URL: {{url}}
Content: {{content}}

Format: ["tag1","tag2"]`;

const DEFAULT_SUMMARY_PROMPT = `Summarize the following webpage concisely in 2-4 sentences. Focus on key points. {{lang_instruction}}

Title: {{title}}
Content: {{content}}`;

// Simple obfuscation for API keys stored in chrome.storage
// Not real encryption — prevents casual plaintext reading
function obfuscateKey(key) {
  if (!key) return "";
  try { return "obf:" + btoa(unescape(encodeURIComponent(key))); } catch (_) { return key; }
}
function deobfuscateKey(val) {
  if (!val) return "";
  // Loop-strip up to 4 layers to handle legacy double-wrapped keys
  // (pre-fix save path could re-obfuscate an already-obfuscated value).
  for (let i = 0; i < 4 && typeof val === "string" && val.startsWith("obf:"); i++) {
    try { val = decodeURIComponent(escape(atob(val.substring(4)))); } catch (_) { return val; }
  }
  return val;
}

const SETTINGS_DEFAULTS = {
  pinboardToken: "",
  aiProvider: "gemini",
  geminiApiKey: "", geminiModel: "gemini-2.5-flash-lite",
  openaiApiKey: "", openaiModel: "gpt-4.1-nano", openaiBaseUrl: "https://api.openai.com/v1",
  claudeApiKey: "", claudeModel: "claude-haiku-4-5-20251001",
  deepseekApiKey: "", deepseekModel: "deepseek-chat",
  qwenApiKey: "", qwenModel: "qwen-flash",
  minimaxApiKey: "", minimaxModel: "MiniMax-Text-01",
  openrouterApiKey: "", openrouterModel: "meta-llama/llama-4-scout:free",
  groqApiKey: "", groqModel: "meta-llama/llama-4-scout-17b-16e-instruct",
  mistralApiKey: "", mistralModel: "mistral-small-latest",
  cohereApiKey: "", cohereModel: "command-r-08-2024",
  siliconflowApiKey: "", siliconflowModel: "Qwen/Qwen3-8B",
  zhipuApiKey: "", zhipuModel: "glm-4.7-flash",
  kimiApiKey: "", kimiModel: "kimi-k2.5",
  ollamaBaseUrl: "http://localhost:11434", ollamaModel: "llama3",
  customApiKey: "", customModel: "", customBaseUrl: "", customName: "Custom",
  aiTagLang: "en", aiSummaryLang: "auto", aiCacheDuration: 60,
  aiContentSource: "local", jinaApiKey: "",
  customTagPrompt: "", customSummaryPrompt: "",
  optPrivateDefault: false, optPrivateIncognito: true, optReadlaterDefault: false,
  optAutoDescription: true, optBlockquote: true, optIncludeReferrer: false,
  optAiAutoTags: false,
  qsAutoNotes: true, qsBlockquote: true, qsDefaultTags: "", qsAiTags: false, qsAiSummary: false,
  rlAutoNotes: true, rlBlockquote: true, rlDefaultTags: "", rlAiTags: false, rlAiSummary: false,
  optBatchTagEnabled: true, optBatchTag: "batch_saved",
  batchAiTags: false, batchAiSummary: false, batchSkipExisting: false,
  optLang: "auto",
  optShowRecent: false, optShowSearch: false, optTheme: "auto",
  notifyQuickSave: true, notifyReadLater: true,
  notifyTabSet: true, notifyBatchSave: true, notifyErrors: true,
  customFont: "",
  optRespectTagCase: true, aiTagSeparator: "-",
  offlineQueueEnabled: true, optShowBadge: false,
  tagSyncMode: "cached", // "fresh" | "cached" | "prewarmed"
  optCheckBookmarkStatus: true, optShowSuggestTags: true,
  optShowAiSummary: true, optShowAiTags: true,
  optShowQuickLinks: true, optShowQuickRow: true,
  tagPresets: "", optAutoCloseAfterSave: true,
  themePresetKey: "", optPopupFollowTheme: true
};

// ---- Tag case normalization helpers ----
// Build a map: normalized_tag → preferred_casing (by highest count)
function buildTagCaseMap(tagCounts) {
  const groups = {};
  for (const [tag, count] of Object.entries(tagCounts)) {
    const norm = normalizeTagKey(tag);
    if (!groups[norm]) groups[norm] = [];
    groups[norm].push({ tag, count: parseInt(count) || 0 });
  }
  const map = {};
  for (const [norm, variants] of Object.entries(groups)) {
    variants.sort((a, b) => b.count - a.count);
    map[norm] = variants[0].tag;
  }
  return map;
}

// Normalize tag for fuzzy matching: lowercase, strip separators
function normalizeTagKey(tag) {
  return tag.toLowerCase().replace(/[-_]/g, "");
}

// Resolve a tag to its preferred existing casing
function resolveTagCase(tag, caseMap) {
  const norm = normalizeTagKey(tag);
  return caseMap[norm] || tag;
}

// ---- Pinboard API rate limiter ----
// Ensures minimum 3.1s between Pinboard API calls
const _pinboardQueue = [];
let _pinboardLastCall = 0;
let _pinboardProcessing = false;

// Accepts options.timeoutMs (default 15000) to override abort timeout per call.
// Non-critical endpoints (e.g. suggest) should pass a shorter value to fail fast.
function pinboardFetch(url, options) {
  return new Promise((resolve, reject) => {
    _pinboardQueue.push({ url, options: options || {}, resolve, reject });
    _processPinboardQueue();
  });
}

// Fire immediately without joining the rate-limit queue.
// Use only for non-critical read-only GET endpoints (e.g. posts/suggest) that already
// handle 429 gracefully. Avoids the 3.1s+ rate-limit wait that the main queue imposes.
function pinboardFetchImmediate(url, options) {
  return new Promise((resolve, reject) => {
    _executePinboardFetch(url, options || {}, resolve, reject);
  });
}

async function _processPinboardQueue() {
  if (_pinboardProcessing || !_pinboardQueue.length) return;
  _pinboardProcessing = true;
  while (_pinboardQueue.length) {
    const { url, options, resolve, reject } = _pinboardQueue.shift();
    // Cross-context coordination: read shared timestamp from storage
    let lastCall = _pinboardLastCall;
    try {
      const stored = await chrome.storage.local.get("_pbRateLimitTs");
      if (stored._pbRateLimitTs > lastCall) lastCall = stored._pbRateLimitTs;
    } catch (_) {}
    const now = Date.now();
    const wait = Math.max(0, 3100 - (now - lastCall));
    // Reserve the time slot BEFORE waiting/fetching to prevent race conditions
    // between popup and background contexts reading stale timestamps
    const reservedTime = now + wait;
    _pinboardLastCall = reservedTime;
    try { await chrome.storage.local.set({ _pbRateLimitTs: reservedTime }); } catch (_) {}
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    // Fire without awaiting — rate limit is timing-based (gap between request starts),
    // not completion-based. Awaiting each fetch caused queue starvation: a slow/hung
    // request (e.g. suggest for a niche URL) would delay all subsequent queued requests
    // by its full timeout duration.
    _executePinboardFetch(url, options, resolve, reject);
  }
  _pinboardProcessing = false;
}

function _executePinboardFetch(url, options, resolve, reject) {
  const ctrl = new AbortController();
  const { timeoutMs = 15000, ...fetchOpts } = options;
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  fetch(url, { ...fetchOpts, signal: ctrl.signal })
    .finally(() => clearTimeout(timer))
    .then(resolve, reject);
}

// ---- Pinboard error classifier ----
// Returns an i18n key describing a Pinboard API failure.
// Input: HTTP Response, Error, or status number. Caller handles 401 (pinboardFetch redirects)
// and 500 (Pinboard's quirk for niche URLs → "no suggestions") BEFORE calling this.
function classifyPinboardError(input) {
  if (input && typeof input === "object" && "status" in input && !("name" in input)) {
    const s = input.status;
    if (s === 401 || s === 403) return "pinboardErrorAuth";
    if (s === 429) return "pinboardErrorRateLimit";
    if (s >= 500) return "pinboardErrorServer";
    return "pinboardErrorOffline";
  }
  if (typeof input === "number") {
    if (input === 401 || input === 403) return "pinboardErrorAuth";
    if (input === 429) return "pinboardErrorRateLimit";
    if (input >= 500) return "pinboardErrorServer";
    return "pinboardErrorOffline";
  }
  // Error instance (network failure, AbortError, etc.)
  const name = input?.name;
  if (name === "AbortError") return "pinboardErrorTimeout";
  if (input instanceof TypeError) return "pinboardErrorOffline";
  return "pinboardErrorOffline";
}

// ---- Settings storage selector (sync vs local based on user preference) ----
// The preference itself is always stored in chrome.storage.local (bootstrap location)
async function getSettingsStorage() {
  try {
    const { optSyncEnabled } = await chrome.storage.local.get({ optSyncEnabled: false });
    return optSyncEnabled ? chrome.storage.sync : chrome.storage.local;
  } catch (_) {
    return chrome.storage.local;
  }
}

// ---- Chunked sync storage for large values ----
// chrome.storage.sync has 8KB per-key limit; split large strings into chunks
// When sync is disabled, local storage is used directly (5MB limit, no chunking needed)
const SYNC_CHUNK_SIZE = 7000; // bytes, leave margin under 8KB (QUOTA_BYTES_PER_ITEM)

async function syncSetLarge(key, value) {
  const storage = await getSettingsStorage();
  const str = typeof value === "string" ? value : JSON.stringify(value);
  if (storage === chrome.storage.local) {
    // Local storage: no chunking needed
    if (!str) { await chrome.storage.local.remove(key); return; }
    await chrome.storage.local.set({ [key]: str });
    return;
  }
  // Sync storage: use chunking (8KB per-key limit)
  const meta = await chrome.storage.sync.get(key);
  if (meta[key]?._chunks) {
    const oldKeys = Array.from({ length: meta[key]._chunks }, (_, i) => `${key}_${i}`);
    await chrome.storage.sync.remove(oldKeys);
  }
  if (!str) { await chrome.storage.sync.remove(key); return; }
  const chunks = [];
  for (let i = 0; i < str.length; i += SYNC_CHUNK_SIZE) {
    chunks.push(str.substring(i, i + SYNC_CHUNK_SIZE));
  }
  const data = { [key]: { _chunks: chunks.length } };
  chunks.forEach((chunk, i) => { data[`${key}_${i}`] = chunk; });
  try {
    await chrome.storage.sync.set(data);
  } catch (e) {
    // Quota exceeded — fall back to local storage
    console.warn("sync storage quota exceeded, falling back to local:", e.message);
    await chrome.storage.local.set({ [key]: str });
    throw e; // re-throw so callers know sync failed
  }
}

async function syncGetLarge(key, defaultValue) {
  const storage = await getSettingsStorage();
  if (storage === chrome.storage.local) {
    const data = await chrome.storage.local.get({ [key]: defaultValue });
    return data[key];
  }
  // Sync storage: read chunked value
  const meta = await chrome.storage.sync.get(key);
  if (!meta[key] || !meta[key]._chunks) return defaultValue;
  const chunkKeys = Array.from({ length: meta[key]._chunks }, (_, i) => `${key}_${i}`);
  const chunks = await chrome.storage.sync.get(chunkKeys);
  let str = "";
  for (const k of chunkKeys) str += (chunks[k] || "");
  if (!str) return defaultValue;
  if (typeof defaultValue === "string") return str;
  try { return JSON.parse(str); } catch (_) { return defaultValue; }
}

const API_KEY_FIELDS = ["pinboardToken","geminiApiKey","openaiApiKey","claudeApiKey","deepseekApiKey","qwenApiKey","minimaxApiKey","openrouterApiKey","groqApiKey","mistralApiKey","cohereApiKey","siliconflowApiKey","zhipuApiKey","kimiApiKey","customApiKey","jinaApiKey"];

function deobfuscateSettings(s) {
  API_KEY_FIELDS.forEach(k => { if (s[k]) s[k] = deobfuscateKey(s[k]); });
  return s;
}

// ---- DOM cache helper (P1.6) ----
// Popup/options DOM is static — elements never removed, only toggled via classList.
// Memoize getElementById to avoid repeated DOM tree walks on hot paths.
// null results are NOT cached (lets later queries succeed if element is added).
const _domRefs = {};
function $id(id) {
  const cached = _domRefs[id];
  if (cached) return cached;
  const el = document.getElementById(id);
  if (el) _domRefs[id] = el;
  return el;
}

// Render an inline .confirm-popover anchored inside `anchor`.
// Caller supplies pre-translated strings via { msg, yesText, noText }.
// Popover self-dismisses on Escape / Cancel / Confirm; de-dupes if already open.
function showConfirmPopover(anchor, opts) {
  if (!anchor || anchor.querySelector(".confirm-popover")) return;
  const { msg, yesText, noText, onConfirm, onCancel } = opts || {};
  const pop = document.createElement("div");
  pop.className = "confirm-popover";
  const m = document.createElement("span");
  m.className = "confirm-msg";
  m.textContent = msg || "";
  const yes = document.createElement("button");
  yes.type = "button";
  yes.className = "confirm-yes";
  yes.textContent = yesText || "OK";
  const no = document.createElement("button");
  no.type = "button";
  no.className = "confirm-no";
  no.textContent = noText || "Cancel";
  pop.append(m, yes, no);
  anchor.appendChild(pop);

  function dismiss() {
    pop.remove();
    document.removeEventListener("keydown", onKey);
  }
  function onKey(ev) {
    if (ev.key === "Escape") { dismiss(); if (onCancel) onCancel(); }
  }
  pop.addEventListener("click", (e) => e.stopPropagation());
  no.addEventListener("click", () => { dismiss(); if (onCancel) onCancel(); });
  yes.addEventListener("click", () => { dismiss(); if (onConfirm) onConfirm(); });
  document.addEventListener("keydown", onKey);
  no.focus();
}
