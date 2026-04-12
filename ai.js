// ============================================================
// Pinboard Bookmark Enhanced - AI & Content Extraction (shared)
// ============================================================

// ---- Page content extraction (used by popup and background) ----
async function getPageInfoFromTab(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    const url = tab.url || "";
    if (!url.startsWith("http://") && !url.startsWith("https://") && !url.startsWith("file://")) {
      return { url, title: tab.title || "", selectedText: "", metaDescription: "", referrer: "", pageText: "" };
    }

    // Inject Defuddle library first
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ["vendor/defuddle.js"] });
    } catch (_) {
      // Defuddle injection failed — fall through to legacy extraction
    }

    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const info = { url: location.href, title: document.title, selectedText: "", metaDescription: "", referrer: document.referrer || "", pageText: "" };
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) { const t = sel.toString().trim(); if (t) info.selectedText = t; }
        const md = document.querySelector('meta[name="description"]') || document.querySelector('meta[property="og:description"]');
        if (md) info.metaDescription = md.getAttribute("content") || "";

        // Try Defuddle for high-quality content extraction
        if (typeof Defuddle !== "undefined") {
          // Swallow defuddle v0.16.0 async errors that escape try/catch:
          //   1. Sync `new URL(href)` on relative/weird hrefs (GitHub, etc.)
          //   2. Async extractors (YouTube/Reddit) via __awaiter Promise chains
          //      — these reject AFTER parse() returns, bypassing try/catch
          // Match by URL-error text OR defuddle-origin filename/stack.
          const swallowDefuddle = (ev) => {
            try {
              const reason = ev && ev.reason;
              const msg = String((ev && ev.message) || (reason && reason.message) || reason || "");
              const stack = String((ev && ev.error && ev.error.stack) || (reason && reason.stack) || "");
              const filename = String((ev && ev.filename) || "");
              const isURLError = /Failed to construct 'URL'|Invalid URL|URL constructor/i.test(msg + " " + stack);
              const fromDefuddle = /defuddle/i.test(filename) || /defuddle/i.test(stack);
              if (isURLError || fromDefuddle) {
                ev.preventDefault && ev.preventDefault();
                ev.stopImmediatePropagation && ev.stopImmediatePropagation();
                ev.stopPropagation && ev.stopPropagation();
                return false;
              }
            } catch (_) { /* never let the swallow handler itself throw */ }
          };
          window.addEventListener("error", swallowDefuddle, true);
          window.addEventListener("unhandledrejection", swallowDefuddle, true);
          // Extend window to 3s — YouTube extractor's fetchPlayerData + pollFor
          // (setTimeout 250ms × up to 20 tries) can run up to ~5s, but 3s covers
          // the common failure path on non-YouTube pages where the async URL
          // throws early. Cleanup prevents listener leakage on long sessions.
          setTimeout(() => {
            window.removeEventListener("error", swallowDefuddle, true);
            window.removeEventListener("unhandledrejection", swallowDefuddle, true);
          }, 3000);
          try {
            const clone = document.cloneNode(true);
            const result = new Defuddle(clone).parse();
            if (result?.textContent && result.textContent.length > 50) {
              info.pageText = result.textContent.substring(0, 8000);
              return info;
            }
          } catch (_) { /* fall through to legacy */ }
        }

        // Fallback: legacy innerText extraction
        const mainEl = document.querySelector("article") || document.querySelector("main") || document.querySelector('[role="main"]') || document.body;
        info.pageText = (mainEl ? mainEl.innerText : "").substring(0, 8000);
        return info;
      }
    });
    if (results?.[0]?.result) return results[0].result;
  } catch (e) { console.warn("getPageInfoFromTab failed:", e.message); }
  return null;
}

// ---- Fetch with timeout ----
function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

// ---- Unified AI error handler ----
async function handleAIError(res, provider) {
  let msg = `${provider} failed (HTTP ${res.status})`;
  try {
    const body = await res.json();
    if (body.error?.message) msg = `${provider}: ${body.error.message}`;
    else if (body.error?.type) msg = `${provider}: ${body.error.type}`;
  } catch (_) {}
  throw new Error(msg);
}

// ---- Check if AI key is configured ----
function hasAIKey(s) {
  const p = s.aiProvider || "gemini";
  if (p === "ollama") return true;
  const keyMap = { gemini: "geminiApiKey", openai: "openaiApiKey", claude: "claudeApiKey", deepseek: "deepseekApiKey", qwen: "qwenApiKey", minimax: "minimaxApiKey", openrouter: "openrouterApiKey", groq: "groqApiKey", mistral: "mistralApiKey", cohere: "cohereApiKey", siliconflow: "siliconflowApiKey", zhipu: "zhipuApiKey", kimi: "kimiApiKey", custom: "customApiKey" };
  return !!s[keyMap[p]];
}

// ---- AI dispatcher ----
async function callAI(s, prompt) {
  const p = s.aiProvider || "gemini";
  switch (p) {
    case "gemini": return callGemini(s, prompt);
    case "claude": return callClaude(s, prompt);
    case "openai": return callOpenAICompat(s.openaiBaseUrl || "https://api.openai.com/v1", s.openaiApiKey, s.openaiModel || "gpt-4.1-nano", prompt);
    case "deepseek": return callOpenAICompat("https://api.deepseek.com/v1", s.deepseekApiKey, s.deepseekModel || "deepseek-chat", prompt);
    case "qwen": return callOpenAICompat("https://dashscope.aliyuncs.com/compatible-mode/v1", s.qwenApiKey, s.qwenModel || "qwen-flash", prompt);
    case "minimax": return callOpenAICompat("https://api.minimax.chat/v1", s.minimaxApiKey, s.minimaxModel || "MiniMax-Text-01", prompt);
    case "openrouter": return callOpenAICompat("https://openrouter.ai/api/v1", s.openrouterApiKey, s.openrouterModel || "meta-llama/llama-4-scout:free", prompt);
    case "groq": return callOpenAICompat("https://api.groq.com/openai/v1", s.groqApiKey, s.groqModel || "meta-llama/llama-4-scout-17b-16e-instruct", prompt);
    case "mistral": return callOpenAICompat("https://api.mistral.ai/v1", s.mistralApiKey, s.mistralModel || "mistral-small-latest", prompt);
    case "cohere": return callOpenAICompat("https://api.cohere.com/v2", s.cohereApiKey, s.cohereModel || "command-r-08-2024", prompt);
    case "siliconflow": return callOpenAICompat("https://api.siliconflow.cn/v1", s.siliconflowApiKey, s.siliconflowModel || "Qwen/Qwen3-8B", prompt);
    case "zhipu": return callOpenAICompat("https://open.bigmodel.cn/api/paas/v4", s.zhipuApiKey, s.zhipuModel || "glm-4.7-flash", prompt);
    case "kimi": return callOpenAICompat("https://api.moonshot.cn/v1", s.kimiApiKey, s.kimiModel || "kimi-k2.5", prompt);
    case "ollama": return callOllama(s, prompt);
    case "custom": return callOpenAICompat(s.customBaseUrl, s.customApiKey, s.customModel, prompt);
    default: throw new Error("Unknown provider: " + p);
  }
}

async function callGemini(s, prompt) {
  const model = s.geminiModel || "gemini-2.5-flash-lite";
  // Gemini API requires key as URL param (no Authorization header support) — API design limitation
  const res = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${s.geminiApiKey}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.3, maxOutputTokens: 1024 } })
  });
  if (!res.ok) await handleAIError(res, "Gemini");
  const text = (await res.json()).candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) throw new Error("Gemini returned empty response");
  return text;
}

async function callClaude(s, prompt) {
  const res = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": s.claudeApiKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
    body: JSON.stringify({ model: s.claudeModel || "claude-haiku-4-5-20251001", max_tokens: 1024, messages: [{ role: "user", content: prompt }] })
  });
  if (!res.ok) await handleAIError(res, "Claude");
  const text = (await res.json()).content?.[0]?.text?.trim();
  if (!text) throw new Error("Claude returned empty response");
  return text;
}

async function callOpenAICompat(baseUrl, apiKey, model, prompt) {
  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
  const res = await fetchWithTimeout(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST", headers,
    body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], temperature: 0.3, max_tokens: 1024 })
  });
  if (!res.ok) await handleAIError(res, "API");
  const text = (await res.json()).choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("API returned empty response");
  return text;
}

async function callOllama(s, prompt) {
  const base = (s.ollamaBaseUrl || "http://localhost:11434").replace(/\/+$/, "");
  const res = await fetchWithTimeout(`${base}/api/chat`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: s.ollamaModel || "llama3", messages: [{ role: "user", content: prompt }], stream: false })
  });
  if (!res.ok) await handleAIError(res, "Ollama");
  const text = (await res.json()).message?.content?.trim();
  if (!text) throw new Error("Ollama returned empty response");
  return text;
}

// ---- Prompt builders (no DOM dependency) ----
function buildTagPrompt(s, title, url, content, description, userTags) {
  const sep = s.aiTagSeparator || "-";
  const sepMap = { "-": "use hyphens for multi-word (e.g. machine-learning)", "_": "use underscores for multi-word (e.g. machine_learning)", " ": "use spaces for multi-word tags" };
  let langInst = "Tags must be in English.";
  const lang = s.aiTagLang || "en";
  if (lang === "auto") langInst = "Use the same language as the content for tags.";
  else if (lang === "zh") langInst = "Tags must be in Chinese (简体中文).";
  else if (lang === "zh-TW") langInst = "Tags must be in Traditional Chinese (繁體中文/台灣).";
  else if (lang === "zh-HK") langInst = "Tags must be in Traditional Chinese (繁體中文/香港).";
  else if (lang === "en") langInst = "Tags must be in English.";
  else if (lang === "ja") langInst = "Tags must be in Japanese (日本語).";
  else if (lang === "ko") langInst = "Tags must be in Korean (한국어).";
  else langInst = `Tags must be in ${lang}.`;
  const tmpl = s.customTagPrompt?.trim() || DEFAULT_TAG_PROMPT;
  let prompt = tmpl
    .replace(/\{\{lang_instruction\}\}/g, langInst)
    .replace(/\{\{separator_instruction\}\}/g, sepMap[sep] || sepMap["-"])
    .replace(/\{\{title\}\}/g, title)
    .replace(/\{\{url\}\}/g, url)
    .replace(/\{\{content\}\}/g, (content || "").substring(0, 3000))
    .replace(/\{\{description\}\}/g, description || "");
  if (userTags && userTags.length > 0) {
    prompt += `\n\nExisting tags (prefer reusing these if applicable): ${userTags.slice(0, 50).join(", ")}`;
  }
  return prompt;
}

function buildSummaryPrompt(s, title, url, content, description) {
  const tmpl = s.customSummaryPrompt?.trim() || DEFAULT_SUMMARY_PROMPT;
  let langInst = "Write in the same language as the content.";
  const lang = s.aiSummaryLang || "auto";
  if (lang === "zh") langInst = "Write in Chinese (简体中文).";
  else if (lang === "zh-TW") langInst = "Write in Traditional Chinese (繁體中文/台灣).";
  else if (lang === "zh-HK") langInst = "Write in Traditional Chinese (繁體中文/香港).";
  else if (lang === "en") langInst = "Write in English.";
  else if (lang === "ja") langInst = "Write in Japanese.";
  else if (lang === "ko") langInst = "Write in Korean.";
  else if (lang !== "auto") langInst = `Write in ${lang}.`;
  return tmpl
    .replace(/\{\{title\}\}/g, title)
    .replace(/\{\{url\}\}/g, url)
    .replace(/\{\{content\}\}/g, (content || "").substring(0, 5000))
    .replace(/\{\{description\}\}/g, description || "")
    .replace(/\{\{lang_instruction\}\}/g, langInst);
}

// ---- Parse AI tag response ----
// separator: "-" or "_" (configurable via settings.aiTagSeparator)
function parseAITags(resp, separator) {
  const sep = separator || "-";
  let tags = [];
  try {
    const m = resp.match(/\[[\s\S]*?\]/);
    if (m) tags = JSON.parse(m[0]);
  } catch (_) {
    tags = resp.split(/[,\n]/).map(t => t.replace(/["[\]`]/g, "").trim()).filter(Boolean);
  }
  return tags.map(t => t.toLowerCase().replace(/\s+/g, sep));
}

// ---- AI cache helpers ----
function getCacheKey(url, type, source) { return `ai_cache_${type}_${source || "local"}_${url}`; }
const AI_CACHE_INDEX_KEY = "ai_cache_index";

async function _updateAICacheIndex(mutator) {
  try {
    const { [AI_CACHE_INDEX_KEY]: idx = {} } = await chrome.storage.local.get(AI_CACHE_INDEX_KEY);
    const next = mutator(idx);
    await chrome.storage.local.set({ [AI_CACHE_INDEX_KEY]: next });
  } catch (_) { /* best-effort index — cleanup falls back to full scan when missing */ }
}

async function getAICache(url, type, cacheDuration, source) {
  const key = getCacheKey(url, type, source);
  const data = await chrome.storage.local.get(key);
  if (!data[key]) return null;
  const { result, timestamp } = data[key];
  const dur = (cacheDuration || 60) * 60 * 1000;
  if (dur === 0) return null;
  if (Date.now() - timestamp > dur) {
    await chrome.storage.local.remove(key);
    _updateAICacheIndex((idx) => { delete idx[key]; return idx; });
    return null;
  }
  return result;
}

async function setAICache(url, type, result, cacheDuration, source) {
  if ((cacheDuration || 60) === 0) return;
  const key = getCacheKey(url, type, source);
  const timestamp = Date.now();
  await chrome.storage.local.set({ [key]: { result, timestamp } });
  _updateAICacheIndex((idx) => { idx[key] = timestamp; return idx; });
}

// ---- Build notes/description for a page ----
function buildAutoNotes(pageInfo, opts) {
  let desc = "";
  if (pageInfo.selectedText) {
    desc = opts.blockquote ? `<blockquote>${pageInfo.selectedText}</blockquote>` : pageInfo.selectedText;
  } else if (opts.autoDescription && pageInfo.metaDescription) {
    desc = pageInfo.metaDescription;
  }
  if (opts.includeReferrer && pageInfo.referrer) {
    desc += (desc ? "\n\n" : "") + `via: ${pageInfo.referrer}`;
  }
  return desc;
}
