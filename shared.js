// ============================================================
// Pinboard Bookmark Plus - Shared Constants
// ============================================================

const DEFAULT_TAG_PROMPT = `Suggest 5-10 bookmark tags for the following webpage. Tags should be lowercase, {{separator_instruction}}. Return ONLY a JSON array.

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
  if (!val.startsWith("obf:")) return val; // backwards compatible with plaintext
  try { return decodeURIComponent(escape(atob(val.substring(4)))); } catch (_) { return val; }
}

const SETTINGS_DEFAULTS = {
  pinboardToken: "",
  aiProvider: "gemini",
  geminiApiKey: "", geminiModel: "gemini-2.0-flash",
  openaiApiKey: "", openaiModel: "gpt-4o-mini", openaiBaseUrl: "https://api.openai.com/v1",
  claudeApiKey: "", claudeModel: "claude-sonnet-4-20250514",
  deepseekApiKey: "", deepseekModel: "deepseek-chat",
  qwenApiKey: "", qwenModel: "qwen-turbo",
  minimaxApiKey: "", minimaxModel: "MiniMax-Text-01",
  openrouterApiKey: "", openrouterModel: "google/gemini-2.0-flash-exp:free",
  groqApiKey: "", groqModel: "llama-3.3-70b-versatile",
  mistralApiKey: "", mistralModel: "mistral-small-latest",
  cohereApiKey: "", cohereModel: "command-r-plus",
  siliconflowApiKey: "", siliconflowModel: "Qwen/Qwen2.5-7B-Instruct",
  ollamaBaseUrl: "http://localhost:11434", ollamaModel: "llama3",
  customApiKey: "", customModel: "", customBaseUrl: "", customName: "Custom",
  aiSummaryLang: "auto", aiCacheDuration: 60,
  customTagPrompt: "", customSummaryPrompt: "",
  optPrivateDefault: false, optPrivateIncognito: false, optReadlaterDefault: false,
  optAutoDescription: true, optBlockquote: true, optIncludeReferrer: false,
  optAiAutoTags: false,
  qsAutoNotes: true, qsBlockquote: true, qsDefaultTags: "", qsAiTags: false, qsAiSummary: false,
  rlAutoNotes: true, rlBlockquote: true, rlDefaultTags: "", rlAiTags: false, rlAiSummary: false,
  optBatchTagEnabled: true, optBatchTag: "batch_saved",
  batchAiTags: false, batchAiSummary: false, batchSkipExisting: false,
  optShowRecent: false, optShowSearch: false, optTheme: "auto",
  notifyQuickSave: true, notifyReadLater: true,
  notifyTabSet: true, notifyBatchSave: true, notifyErrors: true,
  customFont: "",
  optRespectTagCase: true, aiTagSeparator: "-",
  offlineQueueEnabled: true, optShowBadge: false,
  optCheckBookmarkStatus: true, optShowSuggestTags: true,
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

function pinboardFetch(url, options) {
  return new Promise((resolve, reject) => {
    _pinboardQueue.push({ url, options, resolve, reject });
    _processPinboardQueue();
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
    try { resolve(await fetch(url, options)); } catch (e) { reject(e); }
  }
  _pinboardProcessing = false;
}

// ---- Chunked sync storage for large values ----
// chrome.storage.sync has 8KB per-key limit; split large strings into chunks
const SYNC_CHUNK_SIZE = 7000; // bytes, leave margin under 8KB (QUOTA_BYTES_PER_ITEM)

async function syncSetLarge(key, value) {
  const str = typeof value === "string" ? value : JSON.stringify(value);
  // Remove old chunks first
  const meta = await chrome.storage.sync.get(key);
  if (meta[key]?._chunks) {
    const oldKeys = Array.from({ length: meta[key]._chunks }, (_, i) => `${key}_${i}`);
    await chrome.storage.sync.remove(oldKeys);
  }
  if (!str) {
    await chrome.storage.sync.remove(key);
    return;
  }
  const chunks = [];
  for (let i = 0; i < str.length; i += SYNC_CHUNK_SIZE) {
    chunks.push(str.substring(i, i + SYNC_CHUNK_SIZE));
  }
  const data = { [key]: { _chunks: chunks.length } };
  chunks.forEach((chunk, i) => { data[`${key}_${i}`] = chunk; });
  await chrome.storage.sync.set(data);
}

async function syncGetLarge(key, defaultValue) {
  const meta = await chrome.storage.sync.get(key);
  if (!meta[key] || !meta[key]._chunks) return defaultValue;
  const chunkKeys = Array.from({ length: meta[key]._chunks }, (_, i) => `${key}_${i}`);
  const chunks = await chrome.storage.sync.get(chunkKeys);
  let str = "";
  for (const k of chunkKeys) str += (chunks[k] || "");
  if (!str) return defaultValue;
  // If defaultValue is string, return string; otherwise parse JSON
  if (typeof defaultValue === "string") return str;
  try { return JSON.parse(str); } catch (_) { return defaultValue; }
}

const API_KEY_FIELDS = ["pinboardToken","geminiApiKey","openaiApiKey","claudeApiKey","deepseekApiKey","qwenApiKey","minimaxApiKey","openrouterApiKey","groqApiKey","mistralApiKey","cohereApiKey","siliconflowApiKey","customApiKey"];

function deobfuscateSettings(s) {
  API_KEY_FIELDS.forEach(k => { if (s[k]) s[k] = deobfuscateKey(s[k]); });
  return s;
}
