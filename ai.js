// ============================================================
// Pinboard Bookmark Enhanced - AI & Content Extraction (shared)
// ============================================================

// ---- Page content extraction (used by popup and background) ----
// Callback-wrapped chrome APIs: when tab closes mid-call, promise form leaks
// "Unchecked runtime.lastError: No tab with id" via the legacy lastError channel
// that await/try-catch cannot consume. Callback form lets us read lastError
// inside the callback — the only Chromium-guaranteed consumption path.
function _cbTabsGet(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.get(tabId, (tab) => {
      void chrome.runtime.lastError; resolve(tab || null);
    });
  });
}
function _cbExecuteScript(args) {
  return new Promise((resolve) => {
    chrome.scripting.executeScript(args, (results) => {
      void chrome.runtime.lastError; resolve(results || null);
    });
  });
}

async function getPageInfoFromTab(tabId, opts = {}) {
  // Defuddle is a ~120KB content extractor injected into the target tab. It's only needed
  // for AI summary/tags + batch save with AI enabled — NOT for filling the popup form
  // (which only needs url/title/selectedText/metaDescription). Default off saves 50-200ms
  // per popup open for users not invoking AI right away. AI/batch paths pass {withDefuddle: true}.
  const withDefuddle = !!opts.withDefuddle;
  const expectedUrl = typeof opts.expectedUrl === "string" ? opts.expectedUrl : null;
  try {
    const tab = await _cbTabsGet(tabId);
    if (!tab || (expectedUrl !== null && tab.url !== expectedUrl)) return null;
    const url = tab.url || "";
    if (!url.startsWith("http://") && !url.startsWith("https://") && !url.startsWith("file://")) {
      return { url, title: tab.title || "", selectedText: "", metaDescription: "", referrer: "", pageText: "" };
    }

    if (withDefuddle) {
      // site-rules.js first (paired with Defuddle, runs before it — a matched
      // rule short-circuits). OPTIONAL: injected separately with failure
      // ignored so a broken rule can't mask Defuddle. Mirrors popup.js
      // extractLocalMarkdown / background.js extractForPreview.
      await _cbExecuteScript({ target: { tabId }, files: ["site-rules.js"] });
      // Inject Defuddle library (ignore failure — e.g. tab closed mid-inject)
      await _cbExecuteScript({ target: { tabId }, files: ["vendor/defuddle.js"] });
      const injectedTab = await _cbTabsGet(tabId);
      if (!injectedTab || (expectedUrl !== null && injectedTab.url !== expectedUrl)) return null;
    }

    const results = await _cbExecuteScript({
      target: { tabId },
      args: [withDefuddle],
      func: (useDefuddle) => {
        const info = { url: location.href, title: document.title, selectedText: "", metaDescription: "", referrer: document.referrer || "", pageText: "" };
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) { const t = sel.toString().trim(); if (t) info.selectedText = t; }
        const md = document.querySelector('meta[name="description"]') || document.querySelector('meta[property="og:description"]');
        if (md) info.metaDescription = md.getAttribute("content") || "";

        // Fast path (default): no pageText extraction. Popup form only needs the fields above.
        if (!useDefuddle) return info;

        // Per-site rule first (Zhihu/SO/HN/V2EX/arXiv/X): Defuddle's generic
        // single-body extraction drops the answers/replies on exactly the
        // pages site-rules.js exists to cover, so AI tags/summary and batch
        // save fed the model a fraction of the page. Same contract as the
        // markdown extractors: any failure or thin result falls to Defuddle.
        // Text stays under the same 8000-char budget as the Defuddle path.
        if (typeof applySiteRule === "function") {
          try {
            const hit = applySiteRule(document, location.href);
            const text = (hit && hit.contentHtml && typeof pbpSiteRuleText === "function")
              ? pbpSiteRuleText(hit.contentHtml) : "";
            if (text.length > 50) {
              info.pageText = text.substring(0, 8000);
              return info;
            }
          } catch (_) { /* fall through to Defuddle */ }
        }

        // Try Defuddle for high-quality content extraction
        if (typeof Defuddle !== "undefined") {
          // Patch window.URL in the ISOLATED world to prevent defuddle from
          // throwing "Failed to construct 'URL': Invalid URL" on relative/weird hrefs
          // (GitHub releases pages etc.). Mirrors popup.js extractLocalMarkdown shim.
          // Without this, throws still get reported in chrome://extensions Errors panel
          // even when our window.error listener "swallows" them post-throw.
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
          // Belt-and-suspenders: still swallow async errors that escape try/catch
          // (YouTube/Reddit __awaiter promises reject AFTER parse() returns).
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
            // Suppress Defuddle's internal console.error for malformed schema.org JSON on third-party pages
            const _origCE = console.error;
            console.error = (...a) => { if (!String(a[0]).startsWith("Defuddle:")) _origCE.apply(console, a); };
            let result;
            try { result = new Defuddle(clone).parse(); } finally { console.error = _origCE; }
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
    const info = results?.[0]?.result;
    if (info && (expectedUrl === null || info.url === expectedUrl)) {
      if (expectedUrl !== null) {
        const extractedTab = await _cbTabsGet(tabId);
        if (!extractedTab || extractedTab.url !== expectedUrl) return null;
      }
      return info;
    }
  } catch (e) { console.warn("getPageInfoFromTab failed:", e.message); }
  return null;
}


// ---- Fetch with timeout ----
function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  // A caller's signal is CHAINED, not replaced (research T4.4): Cancel in
  // the reader aborts the in-flight request instead of waiting out the
  // round-trip; the timeout controller still governs on its own.
  const caller = options.signal;
  const onAbort = () => controller.abort();
  if (caller) {
    if (caller.aborted) controller.abort();
    else caller.addEventListener("abort", onAbort, { once: true });
  }
  return fetch(url, { ...options, redirect: "error", signal: controller.signal }).finally(() => {
    clearTimeout(timer);
    // Unhook on settle (critic #5): one pass shares a signal across N batch
    // requests, and { once } only fires-and-removes on abort, not on success.
    if (caller) { try { caller.removeEventListener("abort", onAbort); } catch (_) {} }
  });
}

// ---- Unified AI error handler ----
async function handleAIError(res, provider) {
  let msg = `${provider} failed (HTTP ${res.status})`;
  let errorType = null;
  try {
    const body = await res.json();
    if (body.error?.message) msg = `${provider}: ${body.error.message}`;
    else if (body.error?.type) msg = `${provider}: ${body.error.type}`;
    // Detect model-not-found errors. Match ONLY explicit model-error phrasing, never a
    // bare "model" substring: provider auth errors often embed a help-link URL containing
    // the word "model" (e.g. DashScope's invalid-key message links to
    // ".../model-studio/error-code"), which previously flagged every bad-KEY error as
    // "model expired" and misdirected the user to change the model instead of the key.
    const detail = String((body.error?.message || "") + " " + (body.error?.code || "") + " " + (body.error?.type || "")).toLowerCase();
    const modelErr =
      /model[_\s-]?not[_\s-]?(?:found|exist)/.test(detail) ||
      /\b(?:model|deployment)\b[^.]{0,40}\b(?:not\s+found|not\s+exist|does\s*not\s+exist|is\s+invalid|unavailable|unsupported|deprecated|decommissioned|no\s+longer\s+(?:available|supported))\b/.test(detail) ||
      /\b(?:unknown|invalid|unsupported|no\s+such|non[\s-]?existent)\s+model\b/.test(detail);
    if (res.status === 404 || modelErr) {
      errorType = "model_not_found";
    }
  } catch (_) {}
  const err = new Error(msg);
  if (errorType) err.code = errorType;
  err.status = res.status;
  throw err;
}

// ---- OpenAI-compatible provider registry ----
// Single source of truth for every provider reached via callOpenAICompat /
// _streamOpenAICompat. gemini / claude / ollama use bespoke callers (different
// request/response shapes) and are dispatched ahead of this table.
//   keyField     settings key holding the API key (also drives hasAIKey)
//   base         default endpoint (overridable per-provider via baseField)
//   baseField    optional settings key whose value overrides `base` (openai/custom)
//   modelField   settings key holding the model id
//   defaultModel fallback when the model setting is blank
const OPENAI_COMPAT_PROVIDERS = {
  openai:      { keyField: "openaiApiKey",      base: "https://api.openai.com/v1",                         baseField: "openaiBaseUrl", modelField: "openaiModel",      defaultModel: "gpt-5.4-nano",                thinkingOff: { reasoning_effort: "none" } },
  deepseek:    { keyField: "deepseekApiKey",    base: "https://api.deepseek.com/v1",                                            modelField: "deepseekModel",    defaultModel: "deepseek-v4-flash",               thinkingOff: { thinking: { type: "disabled" } } },  // v4-flash defaults thinking ON; 4xx self-heal (deepseek-reasoner rejects it)
  qwen:        { keyField: "qwenApiKey",        base: "https://dashscope.aliyuncs.com/compatible-mode/v1",                      modelField: "qwenModel",        defaultModel: "qwen-flash",                      thinkingOff: { enable_thinking: false } },
  minimax:     { keyField: "minimaxApiKey",     base: "https://api.minimaxi.com/v1",                                            modelField: "minimaxModel",     defaultModel: "MiniMax-M2",                      thinkingOff: { thinking: { type: "disabled" } } },  // M2 no-op but harmless; M3-ready
  openrouter:  { keyField: "openrouterApiKey",  base: "https://openrouter.ai/api/v1",                                           modelField: "openrouterModel",  defaultModel: "openai/gpt-oss-20b:free",   thinkingOff: { reasoning: { enabled: false } } },
  groq:        { keyField: "groqApiKey",        base: "https://api.groq.com/openai/v1",                                         modelField: "groqModel",        defaultModel: "llama-3.1-8b-instant" },          // no thinkingOff: no safe universal field; groq doesn't think by default
  mistral:     { keyField: "mistralApiKey",     base: "https://api.mistral.ai/v1",                                              modelField: "mistralModel",     defaultModel: "mistral-small-latest",            thinkingOff: { reasoning_effort: "none" } },
  cohere:      { keyField: "cohereApiKey",      base: "https://api.cohere.ai/compatibility/v1",                                 modelField: "cohereModel",      defaultModel: "command-r7b-12-2024",             thinkingOff: { reasoning_effort: "none" } },
  siliconflow: { keyField: "siliconflowApiKey", base: "https://api.siliconflow.cn/v1",                                          modelField: "siliconflowModel", defaultModel: "Qwen/Qwen3-8B",                   thinkingOff: { enable_thinking: false } },
  zhipu:       { keyField: "zhipuApiKey",       base: "https://open.bigmodel.cn/api/paas/v4",                                   modelField: "zhipuModel",       defaultModel: "glm-4.7-flash",                   thinkingOff: { thinking: { type: "disabled" } } },
  kimi:        { keyField: "kimiApiKey",        base: "https://api.moonshot.cn/v1",                                             modelField: "kimiModel",        defaultModel: "kimi-k2.6",                       thinkingOff: { thinking: { type: "disabled" } } },
  custom:      { keyField: "customApiKey",      base: "",                                                  baseField: "customBaseUrl", modelField: "customModel",      defaultModel: "" },                          // no thinkingOff: dialect unknown
};

// Resolve an OpenAI-compatible provider's base URL (per-provider baseField override wins).
function _openaiCompatBase(cfg, s) {
  return (cfg.baseField && s[cfg.baseField]) || cfg.base;
}

// ---- Thinking-disable: dialect param + 4xx self-healing fallback + memo (spec T0-c) ----
// thinkingOff is the per-provider "turn reasoning off" body field. It is sent on every
// request EXCEPT when memoized as rejected for this (provider, model). On a 400/422 we
// strip it, retry once, and remember the rejection (open model space: free-text model
// fields + custom providers mean a static allowlist can't be trusted).
function _aiEffectiveExtraBody(cfg, thinkRejected) {
  const base = (cfg && cfg.extraBody) || {};
  const off = (cfg && cfg.thinkingOff && !thinkRejected) ? cfg.thinkingOff : {};
  return { ...base, ...off };
}
function _aiShouldRetryNoThink(cfg, thinkRejected, errStatus) {
  return !!(cfg && cfg.thinkingOff) && !thinkRejected && (errStatus === 400 || errStatus === 422);
}

const _PBP_THINK_REJECT_KEY = "pbpThinkReject";
async function _aiThinkRejected(memoKey) {
  try {
    if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) return false;
    const o = await chrome.storage.local.get(_PBP_THINK_REJECT_KEY);
    const m = o && o[_PBP_THINK_REJECT_KEY];
    return !!(m && m[memoKey]);
  } catch (_) { return false; }
}
async function _aiThinkReject(memoKey) {
  try {
    if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) return;
    const o = await chrome.storage.local.get(_PBP_THINK_REJECT_KEY);
    const m = (o && o[_PBP_THINK_REJECT_KEY]) || {};
    m[memoKey] = true;
    await chrome.storage.local.set({ [_PBP_THINK_REJECT_KEY]: m });
  } catch (_) { /* storage unavailable: skip memo, fallback still works per-call */ }
}

async function _aiWithThinkingFallback(provider, model, cfg, makeCall) {
  const memoKey = provider + ":" + (model || "");
  const rejected = await _aiThinkRejected(memoKey);
  try {
    return await makeCall(_aiEffectiveExtraBody(cfg, rejected));
  } catch (e) {
    if (_aiShouldRetryNoThink(cfg, rejected, e && e.status)) {
      const out = await makeCall(_aiEffectiveExtraBody(cfg, true)); // retry without thinkingOff
      await _aiThinkReject(memoKey);                                // memo only on retry success
      return out;
    }
    throw e;
  }
}

// ---- Check if AI key is configured ----
function hasAIKey(s) {
  const p = s.aiProvider || "gemini";
  if (p === "ollama") return true;
  const keyField = p === "gemini" ? "geminiApiKey"
    : p === "claude" ? "claudeApiKey"
    : OPENAI_COMPAT_PROVIDERS[p] && OPENAI_COMPAT_PROVIDERS[p].keyField;
  return !!(keyField && s[keyField]);
}

// ---- Host-permission gate ----
// Resolve the exact origin every provider call will hit. Compatible providers reuse
// their request registry; the three bespoke callers use the same bases as their fetch
// functions below. User-configured URLs also pass the shared HTTPS/loopback policy.
function _aiTargetOriginPattern(s) {
  s = s || {};
  const p = s.aiProvider || "gemini";
  let base;
  if (p === "gemini") base = "https://generativelanguage.googleapis.com";
  else if (p === "claude") base = "https://api.anthropic.com";
  else if (p === "ollama") base = s.ollamaBaseUrl || "http://localhost:11434";
  else {
    const cfg = OPENAI_COMPAT_PROVIDERS[p];
    if (!cfg) return null;
    base = _openaiCompatBase(cfg, s);
  }
  const pattern = pbpEndpointOriginPattern(base);
  if (!pattern) {
    let message = "Invalid or insecure AI endpoint. Use HTTPS, or HTTP only with localhost, 127.0.0.1, or [::1].";
    try {
      const translated = t("mdTargetWebhookHttpWarn");
      if (translated && translated !== "mdTargetWebhookHttpWarn") message = translated;
    } catch (_) {}
    const err = new Error(message);
    err.code = "endpoint_invalid";
    throw err;
  }
  return pattern;
}

// Synchronous collector used by direct user gestures. Extra destinations (currently
// Jina) are normalized through the same policy and deduplicated before request().
function _aiRequiredOriginPatterns(s, additionalOrigins = []) {
  const origins = [_aiTargetOriginPattern(s)];
  for (const raw of (Array.isArray(additionalOrigins) ? additionalOrigins : [additionalOrigins])) {
    const pattern = pbpEndpointOriginPattern(raw);
    if (!pattern) {
      const err = new Error("Invalid or insecure additional AI endpoint.");
      err.code = "endpoint_invalid";
      throw err;
    }
    origins.push(pattern);
  }
  return [...new Set(origins.filter(Boolean))];
}

// Must be called from a user gesture. Pattern calculation and request() are deliberately
// adjacent; background/automatic callers use the contains-only gate below instead.
function requestAIHostPermissions(s, additionalOrigins = []) {
  const origins = _aiRequiredOriginPatterns(s, additionalOrigins);
  if (!origins.length || typeof chrome === "undefined" || !chrome.permissions || !chrome.permissions.request) {
    return Promise.resolve(false);
  }
  try {
    return Promise.resolve(chrome.permissions.request({ origins })).then(Boolean, () => false);
  } catch (_) {
    return Promise.resolve(false);
  }
}

// Gesture-time companion to the contains-only gate below: callAI itself only
// ever CHECKS (automatic paths must never prompt), so a click surface that
// goes straight to callAI dead-ends forever when the provider origin was
// never granted -- the options-page Test button is not a step users know to
// take (device round 4: six "No access" failures behind a generic label).
// Must be called from a real user gesture. Re-throws the same actionable
// host_permission error when the user declines the prompt.
async function ensureAIHostPermissionWithGesture(s) {
  try {
    await _ensureAIHostPermission(s);
  } catch (e) {
    if (!e || e.code !== "host_permission") throw e;
    if (!(await requestAIHostPermissions(s))) throw e;
  }
}

// Throw an actionable error when the configured endpoint's origin is not granted.
// Read-only: chrome.permissions.contains needs no user gesture and works in the SW.
// No-op only outside an extension context (e.g. unit-test pages).
// The narrow origin is a subset of the declared optional *://*/* permission, which is
// how the options-page Test button requests it on a real gesture.
async function _ensureAIHostPermission(s) {
  const pattern = _aiTargetOriginPattern(s);
  if (!pattern) return;
  if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.id) return;
  let has = false;
  try {
    if (chrome.permissions && chrome.permissions.contains) {
      has = await chrome.permissions.contains({ origins: [pattern] });
    }
  } catch (_) {}
  if (!has) {
    const err = new Error(t("aiErrorHostPermission", pattern.replace(/\/\*$/, "")));
    err.code = "host_permission";
    throw err;
  }
}

// ---- AI dispatcher ----
async function callAI(s, prompt, opts = {}) {
  await _ensureAIHostPermission(s);
  const p = s.aiProvider || "gemini";
  if (p === "gemini") return callGemini(s, prompt, opts);
  if (p === "claude") return callClaude(s, prompt, opts);
  if (p === "ollama") return callOllama(s, prompt, opts);
  const cfg = OPENAI_COMPAT_PROVIDERS[p];
  if (!cfg) throw new Error("Unknown provider: " + p);
  const model = opts.model || s[cfg.modelField] || cfg.defaultModel;
  return _aiWithThinkingFallback(p, model, cfg, (extraBody) =>
    callOpenAICompat(_openaiCompatBase(cfg, s), s[cfg.keyField], model, prompt, { ...opts, extraBody }));
}

// Non-streaming Gemini rides the same thinking-off self-heal as the OpenAI-
// compat table. Every OTHER default-thinking provider already disables
// reasoning on the tags/summary path, but the bespoke Gemini caller sent no
// thinkingConfig — and gemini IS the default provider, so quick-save/batch
// users paid reasoning tokens (and latency) on every request. The field is the
// verified bespoke dialect (rules/ai-providers.md: thinkingConfig.thinkingBudget:0);
// models that reject a zero budget (e.g. gemini-2.5-pro) heal via the shared
// 400/422 strip-and-retry with the per-model memo — never a static allowlist,
// because the model field is free text.
const _GEMINI_THINKING_CFG = { thinkingOff: { thinkingConfig: { thinkingBudget: 0 } } };

async function callGemini(s, prompt, opts = {}) {
  const model = opts.model || s.geminiModel || "gemini-3.5-flash-lite";
  return _aiWithThinkingFallback("gemini", model, _GEMINI_THINKING_CFG, (extraBody) =>
    _callGeminiOnce(s, model, prompt, opts, extraBody));
}

async function _callGeminiOnce(s, model, prompt, opts, extraBody) {
  const maxTokens = opts.maxTokens || 1024;
  const generationConfig = { temperature: 0.3, maxOutputTokens: maxTokens };
  // Gemini's dialect nests under generationConfig, unlike the top-level merge
  // the OpenAI-compat callers use — apply the one relevant key explicitly.
  if (extraBody && extraBody.thinkingConfig) generationConfig.thinkingConfig = extraBody.thinkingConfig;
  // Gemini API requires key as URL param (no Authorization header support) — API design limitation
  const res = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${s.geminiApiKey}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, signal: opts.signal,
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig })
  });
  if (!res.ok) await handleAIError(res, "Gemini");
  const text = (await res.json()).candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) throw new Error("Gemini returned empty response");
  return text;
}

async function callClaude(s, prompt, opts = {}) {
  const maxTokens = opts.maxTokens || 1024;
  const res = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
    method: "POST", signal: opts.signal,
    headers: { "Content-Type": "application/json", "x-api-key": s.claudeApiKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
    body: JSON.stringify({ model: opts.model || s.claudeModel || "claude-haiku-4-5", max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] })
  });
  if (!res.ok) await handleAIError(res, "Claude");
  const text = (await res.json()).content?.[0]?.text?.trim();
  if (!text) throw new Error("Claude returned empty response");
  return text;
}

async function callOpenAICompat(baseUrl, apiKey, model, prompt, opts = {}) {
  const maxTokens = opts.maxTokens || 1024;
  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
  const res = await fetchWithTimeout(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST", headers, signal: opts.signal,
    body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], temperature: 0.3, max_tokens: maxTokens, ...(opts.extraBody || {}) })
  });
  if (!res.ok) await handleAIError(res, "API");
  const text = (await res.json()).choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("API returned empty response");
  return text;
}

async function callOllama(s, prompt, opts = {}) {
  const base = (s.ollamaBaseUrl || "http://localhost:11434").replace(/\/+$/, "");
  const res = await fetchWithTimeout(`${base}/api/chat`, {
    method: "POST", headers: { "Content-Type": "application/json" }, signal: opts.signal,
    // options mirrors the streaming path (_streamOllama): without num_predict
    // the non-streaming call ignored opts.maxTokens entirely, so callers that
    // size the output budget per request (AI punctuation batches) silently got
    // the server default and truncated long outputs.
    body: JSON.stringify({
      model: opts.model || s.ollamaModel || "llama3.2", messages: [{ role: "user", content: prompt }], stream: false,
      options: { num_predict: opts.maxTokens || 1024 }
    })
  });
  if (!res.ok) await handleAIError(res, "Ollama");
  const text = (await res.json()).message?.content?.trim();
  if (!text) throw new Error("Ollama returned empty response");
  return text;
}

// ============================================================
// Streaming helpers (md-preview ask / translate / explain)
// ============================================================
// Pure SSE/NDJSON parsing. No fetch, no chrome.*, no DOM — unit-tested
// in tests/md-ai-tests.html.

// Split complete SSE events out of an accumulating text buffer.
// Returns { events, rest }: `events` = the "data:" payload of every
// COMPLETE event (blank-line terminated; multiple data lines joined with
// \n per SSE spec; comment/event:/id: lines dropped); `rest` = trailing
// incomplete fragment the caller must keep and prepend to the next chunk.
function _pbpSseChunks(buffered) {
  const blocks = String(buffered).split(/\r?\n\r?\n/);
  const rest = blocks.pop();
  const events = [];
  for (const block of blocks) {
    const dataLines = [];
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith("data:")) dataLines.push(line.slice(5).replace(/^ /, ""));
    }
    if (dataLines.length) {
      const payload = dataLines.join("\n");
      if (payload) events.push(payload);
    }
  }
  return { events, rest };
}

// Per-provider delta extractors: parsed JSON chunk -> visible text or null.
// null = chunk carries no user-visible text (role headers, pings, usage,
// thinking deltas, final stats) — the caller simply skips it.
function _pbpOpenAIDelta(obj) {
  const t = obj?.choices?.[0]?.delta?.content;
  return (typeof t === "string" && t.length) ? t : null;
}

function _pbpGeminiDelta(obj) {
  const parts = obj?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return null;
  let out = "";
  for (const p of parts) { if (typeof p?.text === "string") out += p.text; }
  return out.length ? out : null;
}

function _pbpClaudeDelta(obj) {
  if (obj?.type !== "content_block_delta") return null;
  const t = obj.delta?.text;
  return (typeof t === "string" && t.length) ? t : null;
}

function _pbpOllamaDelta(obj) {
  const t = obj?.message?.content;
  return (typeof t === "string" && t.length) ? t : null;
}

// Per-provider USAGE extractors (opportunistic): parsed JSON chunk ->
// {inTok, outTok} (either field may be null) or null when the chunk carries no
// token counts. ZERO request mutation — we never set stream_options.include_usage
// or any per-provider dialect field (free-text `model` makes blanket params the
// "disable-thinking 400" class of footgun). If a provider does not happen to emit
// usage in its stream, the extractor returns null and the caller falls back to a
// chars/4 estimate. Field names verified against official provider docs (cited).
function _pbpOpenAIUsage(obj) {
  // OpenAI Chat Completions streaming: final chunk carries usage.prompt_tokens /
  // usage.completion_tokens (choices then []). Present only when the server emits
  // it — standard OpenAI needs stream_options.include_usage (we DON'T send it), but
  // several compat providers (e.g. DeepSeek) include it by default. Opportunistic.
  // developers.openai.com/api/reference/resources/chat/subresources/completions/streaming-events
  const u = obj && obj.usage;
  if (!u) return null;
  const inTok = typeof u.prompt_tokens === "number" ? u.prompt_tokens : null;
  const outTok = typeof u.completion_tokens === "number" ? u.completion_tokens : null;
  return (inTok === null && outTok === null) ? null : { inTok, outTok };
}

function _pbpGeminiUsage(obj) {
  // Gemini streamGenerateContent: usageMetadata.promptTokenCount /
  // usageMetadata.candidatesTokenCount, repeated (cumulative) on each chunk.
  // ai.google.dev/api/generate-content (UsageMetadata)
  const u = obj && obj.usageMetadata;
  if (!u) return null;
  const inTok = typeof u.promptTokenCount === "number" ? u.promptTokenCount : null;
  const outTok = typeof u.candidatesTokenCount === "number" ? u.candidatesTokenCount : null;
  return (inTok === null && outTok === null) ? null : { inTok, outTok };
}

function _pbpClaudeUsage(obj) {
  // Anthropic Messages streaming: input_tokens arrives in message_start
  // (message.usage.input_tokens); cumulative output_tokens in message_delta
  // (usage.output_tokens). Two events -> the sink merges per field.
  // platform.claude.com/docs/en/docs/build-with-claude/streaming
  if (obj && obj.type === "message_start") {
    const it = obj.message && obj.message.usage && obj.message.usage.input_tokens;
    return typeof it === "number" ? { inTok: it, outTok: null } : null;
  }
  if (obj && obj.type === "message_delta") {
    const ot = obj.usage && obj.usage.output_tokens;
    return typeof ot === "number" ? { inTok: null, outTok: ot } : null;
  }
  return null;
}

function _pbpOllamaUsage(obj) {
  // Ollama /api/chat: final object (done:true) carries prompt_eval_count /
  // eval_count. github.com/ollama/ollama/blob/main/docs/api.md
  if (!obj || !obj.done) return null;
  const inTok = typeof obj.prompt_eval_count === "number" ? obj.prompt_eval_count : null;
  const outTok = typeof obj.eval_count === "number" ? obj.eval_count : null;
  return (inTok === null && outTok === null) ? null : { inTok, outTok };
}

// ---- Stream plumbing ----

const PBP_STREAM_IDLE_MS = 30000;

// Child AbortController that follows the caller's optional signal.
// The 30s idle timeout aborts the CHILD only — never the caller's
// controller (callers reuse one controller across parallel requests,
// e.g. the translate queue's Stop button).
function _pbpChainAbort(signal) {
  const ctrl = new AbortController();
  if (signal) {
    if (signal.aborted) ctrl.abort();
    else signal.addEventListener("abort", () => ctrl.abort(), { once: true });
  }
  return ctrl;
}

// Shared streaming driver. POSTs `url` and pipes the response body
// through `consume(buf, isFinal) -> rest`: consume extracts complete
// payloads from the accumulated text and returns the unconsumed tail
// (must return "" when isFinal).
// Idle timeout: one resettable 30s timer, armed before fetch and re-armed
// on every received network chunk — covers time-to-first-byte AND
// mid-stream stalls. (Byte-level, not delta-level: an SSE keep-alive
// comment also resets it, which is the desired liveness semantics.)
// Rejections: handleAIError(res, providerName) on non-ok; DOMException
// AbortError when the CALLER aborts; Error("AI stream timeout") when the
// idle timer fires.
async function _pbpStreamRead(url, init, opts, providerName, consume) {
  const ctrl = _pbpChainAbort(opts.signal);
  let timedOut = false;
  let idleTimer = null;
  const resetIdle = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { timedOut = true; ctrl.abort(); }, PBP_STREAM_IDLE_MS);
  };
  let reader = null;
  try {
    resetIdle();
    const res = await fetch(url, { ...init, redirect: "error", signal: ctrl.signal });
    // Headers received: start a fresh idle window for time-to-first-byte.
    resetIdle();
    if (!res.ok) {
      clearTimeout(idleTimer);
      // always throws (same semantics as the non-streaming callers)
      await handleAIError(res, providerName);
    }
    if (!res.body) {
      clearTimeout(idleTimer);
      throw new Error(providerName + " response has no stream body");
    }
    reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      resetIdle();
      buf += decoder.decode(value, { stream: true });
      buf = consume(buf, false);
    }
    buf += decoder.decode();
    consume(buf, true);
  } catch (e) {
    // Caller abort takes precedence over an idle timeout that fired in the
    // same tick, so the rejection surfaces as the caller's AbortError, not
    // "AI stream timeout".
    if (timedOut && !(opts.signal && opts.signal.aborted)) {
      throw new Error("AI stream timeout");
    }
    // Network disconnection: fetch() rejects with a bare TypeError ("Failed to
    // fetch") when offline / DNS or connection fails — distinct from
    // handleAIError's provider-classified Error (.status set) and the caller's
    // AbortError (.name === "AbortError"), so this never touches provider error
    // classification. Ask/Translate display e.message directly (no code lookup
    // downstream), so bake the localized text into the message here (D4-2).
    // Best-effort: if t() is unavailable for any reason, degrade to the
    // original error untouched rather than let classification itself fail.
    const offline = (e instanceof TypeError && /failed to fetch/i.test(e.message || "")) ||
      (typeof navigator !== "undefined" && navigator.onLine === false);
    if (offline) {
      let offlineMsg = "";
      try { offlineMsg = t("pinboardErrorOffline"); } catch (_) { offlineMsg = ""; }
      if (offlineMsg) {
        const netErr = new Error(offlineMsg);
        netErr.code = "network";
        throw netErr;
      }
    }
    throw e;
  } finally {
    clearTimeout(idleTimer);
    // reader.cancel() returns a PROMISE that rejects with AbortError when
    // the stream is already aborted -- the sync try/catch alone left an
    // orphaned rejection ("Uncaught (in promise) AbortError:
    // BodyStreamBuffer was aborted") on every popover close mid-stream.
    if (reader) { try { reader.cancel().catch(() => {}); } catch (_) {} }
  }
}

// Build a consume() for SSE bodies: split complete events, JSON-parse each,
// run the provider delta extractor, forward text via onText(delta).
// "[DONE]" (OpenAI terminator) and unparseable keep-alives are skipped;
// stream end is signaled by the reader, not by the terminator.
function _pbpSseConsumer(extractDelta, onText, onRaw) {
  return (buf, isFinal) => {
    const { events, rest } = _pbpSseChunks(isFinal ? buf + "\n\n" : buf);
    for (const ev of events) {
      if (ev === "[DONE]") continue;
      let obj;
      try { obj = JSON.parse(ev); } catch (_) { continue; }
      if (onRaw) onRaw(obj);            // T4: opportunistic usage side-channel (per parsed chunk)
      const d = extractDelta(obj);
      if (d) onText(d);
    }
    return isFinal ? "" : rest;
  };
}

// Opportunistic usage collector shared by every streaming path. `extractUsage`
// is a per-provider extractor above. onRaw() runs it on each parsed chunk and
// keeps the LAST non-null value PER FIELD (Gemini repeats cumulative usage each
// chunk -> last wins; Claude splits input/output across two events -> merged).
// flush() invokes opts.onUsage exactly once after a NORMAL stream end, iff any
// field was captured. Any extractor throw is swallowed (degrade to estimate).
function _pbpUsageSink(extractUsage, opts) {
  const acc = { inTok: null, outTok: null };
  let saw = false;
  return {
    onRaw(obj) {
      let u;
      try { u = extractUsage(obj); } catch (_) { u = null; }
      if (!u) return;
      if (u.inTok != null) { acc.inTok = u.inTok; saw = true; }
      if (u.outTok != null) { acc.outTok = u.outTok; saw = true; }
    },
    flush() {
      if (saw && opts && typeof opts.onUsage === "function") {
        // Side channel must never break the primary result: a throwing
        // consumer callback must not reject the surrounding stream promise.
        try { opts.onUsage({ inTok: acc.inTok || 0, outTok: acc.outTok || 0 }); } catch (_) {}
      }
    }
  };
}

async function _streamOpenAICompat(baseUrl, apiKey, model, prompt, opts, onDelta) {
  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
  const messages = [];
  if (opts.system) messages.push({ role: "system", content: opts.system });
  messages.push({ role: "user", content: prompt });
  let full = "";
  const usage = _pbpUsageSink(_pbpOpenAIUsage, opts);
  await _pbpStreamRead(
    `${baseUrl.replace(/\/+$/, "")}/chat/completions`,
    {
      method: "POST", headers,
      body: JSON.stringify({
        model,
        messages,
        temperature: opts.temperature !== undefined ? opts.temperature : 0.3,
        max_tokens: opts.maxTokens || 1024,
        stream: true,
        ...(opts.extraBody || {})
      })
    },
    opts, "API",
    _pbpSseConsumer(_pbpOpenAIDelta, (d) => { full += d; onDelta(d, full); }, usage.onRaw)
  );
  if (!full.trim()) throw new Error("API returned empty response");
  usage.flush();
  return full;
}

async function _streamGemini(s, prompt, opts, onDelta) {
  const model = opts.model || s.geminiModel || "gemini-3.5-flash-lite";
  const generationConfig = {
    temperature: opts.temperature !== undefined ? opts.temperature : 0.3,
    maxOutputTokens: opts.maxTokens || 1024
  };
  // Translate path: hard-disable thinking so the output budget is all payload.
  if (opts.noThinking) generationConfig.thinkingConfig = { thinkingBudget: 0 };
  const body = { contents: [{ parts: [{ text: prompt }] }], generationConfig };
  if (opts.system) body.systemInstruction = { parts: [{ text: opts.system }] };
  let full = "";
  const usage = _pbpUsageSink(_pbpGeminiUsage, opts);
  // Gemini requires the key as a URL param (same limitation as callGemini)
  await _pbpStreamRead(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${s.geminiApiKey}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    opts, "Gemini",
    _pbpSseConsumer(_pbpGeminiDelta, (d) => { full += d; onDelta(d, full); }, usage.onRaw)
  );
  if (!full.trim()) throw new Error("Gemini returned empty response");
  usage.flush();
  return full;
}

async function _streamClaude(s, prompt, opts, onDelta) {
  const body = {
    model: opts.model || s.claudeModel || "claude-haiku-4-5",
    max_tokens: opts.maxTokens || 1024,
    temperature: opts.temperature !== undefined ? opts.temperature : 0.3,
    messages: [{ role: "user", content: prompt }],
    stream: true
  };
  if (opts.system) body.system = opts.system;
  let full = "";
  const usage = _pbpUsageSink(_pbpClaudeUsage, opts);
  await _pbpStreamRead(
    "https://api.anthropic.com/v1/messages",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": s.claudeApiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify(body)
    },
    opts, "Claude",
    _pbpSseConsumer(_pbpClaudeDelta, (d) => { full += d; onDelta(d, full); }, usage.onRaw)
  );
  if (!full.trim()) throw new Error("Claude returned empty response");
  usage.flush();
  return full;
}

async function _streamOllama(s, prompt, opts, onDelta) {
  const base = (s.ollamaBaseUrl || "http://localhost:11434").replace(/\/+$/, "");
  const messages = [];
  if (opts.system) messages.push({ role: "system", content: opts.system });
  messages.push({ role: "user", content: prompt });
  const body = {
    model: opts.model || s.ollamaModel || "llama3.2",
    messages,
    stream: true,
    options: {
      temperature: opts.temperature !== undefined ? opts.temperature : 0.3,
      num_predict: opts.maxTokens || 1024
    }
  };
  let full = "";
  const usage = _pbpUsageSink(_pbpOllamaUsage, opts);
  // Ollama streams NDJSON (one JSON object per line), not SSE.
  const consume = (buf, isFinal) => {
    const lines = buf.split("\n");
    const rest = isFinal ? "" : lines.pop();
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let obj;
      try { obj = JSON.parse(trimmed); } catch (_) { continue; }
      usage.onRaw(obj);                 // T4: final done:true chunk carries the counts
      const d = _pbpOllamaDelta(obj);
      if (d) { full += d; onDelta(d, full); }
    }
    return rest;
  };
  await _pbpStreamRead(
    `${base}/api/chat`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    opts, "Ollama", consume
  );
  if (!full.trim()) throw new Error("Ollama returned empty response");
  usage.flush();
  return full;
}

// ---- Streaming AI dispatcher ----
// callAIStream(s, prompt, opts, onDelta) -> Promise<string fullText>
//   opts: { maxTokens?, model? (override provider default), system?,
//           signal? (AbortSignal), temperature? (default 0.3),
//           noThinking? (Gemini only),
//           onUsage?({inTok,outTok}) — T4: fired at most once after a NORMAL
//             stream end IFF the provider opportunistically emitted usage in the
//             stream (ZERO request mutation). Callers omitting it are unaffected. }
//   onDelta(deltaText, accumulatedText) fires once per text chunk.
//   Resolves with the full accumulated text (identical to the last
//   accumulatedText passed to onDelta). Rejects with handleAIError
//   semantics on non-ok / AbortError on caller abort /
//   Error("AI stream timeout") on 30s idle.
async function callAIStream(s, prompt, opts = {}, onDelta) {
  const cb = (typeof onDelta === "function") ? onDelta : () => {};
  await _ensureAIHostPermission(s);
  const p = s.aiProvider || "gemini";
  if (p === "gemini") return _streamGemini(s, prompt, opts, cb);
  if (p === "claude") return _streamClaude(s, prompt, opts, cb);
  if (p === "ollama") return _streamOllama(s, prompt, opts, cb);
  const cfg = OPENAI_COMPAT_PROVIDERS[p];
  if (!cfg) throw new Error("Unknown provider: " + p);
  const model = opts.model || s[cfg.modelField] || cfg.defaultModel;
  return _aiWithThinkingFallback(p, model, cfg, (extraBody) =>
    _streamOpenAICompat(_openaiCompatBase(cfg, s), s[cfg.keyField], model, prompt, { ...opts, extraBody }, cb));
}

// ---- Shared prompt fragments (used by tag, summary, and combined builders) ----
const TAG_SEP_MAP = {
  "-": "use hyphens for multi-word (e.g. machine-learning)",
  "_": "use underscores for multi-word (e.g. machine_learning)",
  " ": "use spaces for multi-word tags",
};

function aiTagLangInstruction(s) {
  const lang = (s && s.aiTagLang) || "en";
  if (lang === "auto") return "Use the same language as the content for tags.";
  if (lang === "zh") return "Tags must be in Chinese (简体中文).";
  if (lang === "zh-TW") return "Tags must be in Traditional Chinese (繁體中文/台灣).";
  if (lang === "zh-HK") return "Tags must be in Traditional Chinese (繁體中文/香港).";
  if (lang === "en") return "Tags must be in English.";
  if (lang === "ja") return "Tags must be in Japanese (日本語).";
  if (lang === "ko") return "Tags must be in Korean (한국어).";
  return `Tags must be in ${lang}.`;
}

function aiSummaryLangInstruction(s) {
  const lang = (s && s.aiSummaryLang) || "auto";
  if (lang === "zh") return "Write in Chinese (简体中文).";
  if (lang === "zh-TW") return "Write in Traditional Chinese (繁體中文/台灣).";
  if (lang === "zh-HK") return "Write in Traditional Chinese (繁體中文/香港).";
  if (lang === "en") return "Write in English.";
  if (lang === "ja") return "Write in Japanese.";
  if (lang === "ko") return "Write in Korean.";
  if (lang !== "auto") return `Write in ${lang}.`;
  return "Write in the same language as the content.";
}

// ---- Prompt builders (no DOM dependency) ----
// Content window for the tag/summary/combined prompts (campaign S3).
// The old cap kept only the FIRST 4000 chars - pure lead bias with the
// conclusion physically deleted. Same total budget, split head+tail: the
// head carries the framing/purpose the recall-note style leans on, the
// tail adds the conclusion Defuddle-extracted articles end with (long
// posts often state what a thing IS FOR at the end). Experimental:
// head+tail over head-only at this size is inference, not measurement.
const AI_CONTENT_HEAD = 3200;
const AI_CONTENT_TAIL = 800;
function _aiContentWindow(content) {
  const text = String(content || "");
  if (text.length <= AI_CONTENT_HEAD + AI_CONTENT_TAIL) return text;
  return text.slice(0, AI_CONTENT_HEAD) + "\n[...]\n" + text.slice(text.length - AI_CONTENT_TAIL);
}

// Single-pass template fill: sequential .replace() calls re-scanned the
// WHOLE prompt after each substitution, so a page value containing a later
// placeholder was expanded too (title "literal {{content}}" became the
// page body). One pass over the ORIGINAL template only; inserted values
// are never rescanned, unknown placeholders stay literal (custom-template
// typo stays visible instead of vanishing).
function _aiFillTemplate(tmpl, vars) {
  return String(tmpl).replace(/\{\{(\w+)\}\}/g, (m, name) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? vars[name] : m);
}

// Vocabulary-reuse line appended to tag and combined prompts. Strength is
// deliberate (campaign B2): three shipped bookmark managers independently
// demonstrated that a soft "prefer reusing" does not stop models from
// coining near-duplicate new tags ("ad tech"/"adtech"/"ad-technology"),
// fragmenting the vocabulary. Still not a hard closed list - a genuinely
// new topic may coin a tag when nothing listed covers it.
const AI_TAG_REUSE_LINE = "Existing tags - reuse EVERY tag below that fits this page; check for close variants of a candidate before coining anything new, and invent a new tag only when nothing below covers that facet: ";

function buildTagPrompt(s, title, url, content, description, userTags) {
  const sep = s.aiTagSeparator || "-";
  const tmpl = s.customTagPrompt?.trim() || DEFAULT_TAG_PROMPT;
  let prompt = _aiFillTemplate(tmpl, {
    lang_instruction: aiTagLangInstruction(s),
    separator_instruction: TAG_SEP_MAP[sep] || TAG_SEP_MAP["-"],
    title: title || "",
    url: url || "",
    content: _aiContentWindow(content),
    description: description || "",
  });
  if (userTags && userTags.length > 0) {
    prompt += `\n\n${AI_TAG_REUSE_LINE}${userTags.slice(0, 50).join(", ")}`;
  }
  return prompt;
}

function buildSummaryPrompt(s, title, url, content, description) {
  const tmpl = s.customSummaryPrompt?.trim() || DEFAULT_SUMMARY_PROMPT;
  return _aiFillTemplate(tmpl, {
    lang_instruction: aiSummaryLangInstruction(s),
    title: title || "",
    url: url || "",
    content: _aiContentWindow(content),
    description: description || "",
  });
}

function buildCombinedPrompt(s, title, url, content, description, userTags) {
  const sep = s.aiTagSeparator || "-";
  let prompt = `Analyze the following webpage and return ONLY a JSON object with exactly two keys: "summary" and "tags".

"summary": a bookmark note read months from now to recall what this page is and why it was saved - not an article summary. ${aiSummaryLangInstruction(s)} 2-4 sentences: first what kind of page this is and what it is for, then the 1-2 specific details that distinguish it from others of its kind. Do not restate the title; never open with filler like "This article discusses"; do not echo the page's marketing tone; keep product names and technical terms untranslated.

"tags": an array of up to ${AI_TAG_CAP} bookmark tags. ${aiTagLangInstruction(s)} Tags should be lowercase, ${TAG_SEP_MAP[sep] || TAG_SEP_MAP["-"]}.
${TAG_GUIDANCE}

Title: {{title}}
URL: {{url}}
Content: {{content}}

Format: {"summary":"...","tags":["tag1","tag2"]}`;
  prompt = _aiFillTemplate(prompt, {
    title: title || "",
    url: url || "",
    content: _aiContentWindow(content),
  });
  if (userTags && userTags.length > 0) {
    prompt += `\n\n${AI_TAG_REUSE_LINE}${userTags.slice(0, 50).join(", ")}`;
  }
  return prompt;
}

// Parse a combined {"summary","tags"} reply. Throws on no-object / bad-JSON /
// empty result so callers can fall back to two separate calls.
function parseAICombined(resp, separator) {
  const sep = separator || "-";
  if (typeof resp !== "string") throw new Error("combined: empty response");
  const m = resp.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("combined: no JSON object");
  const obj = JSON.parse(m[0]); // throws on bad JSON -> caller falls back
  const summary = typeof obj.summary === "string" ? obj.summary.trim() : "";
  let tags = Array.isArray(obj.tags) ? obj.tags : [];
  tags = tags.filter(t => typeof t === "string").map(t => t.toLowerCase().replace(/\s+/g, sep));
  tags = refineTags(tags, { cap: AI_TAG_CAP, separator: sep });
  if (!summary && tags.length === 0) throw new Error("combined: empty result");
  return { summary, tags };
}

// ---- Parse AI tag response ----
// separator: "-" or "_" (configurable via settings.aiTagSeparator)
// JSON first: try EVERY bracketed candidate (a "[Note]" in prose before
// the real array must not eat the parse), accept the first that is a JSON
// array with string members - or a deliberate empty [] (the model saying
// "no tags"). Only when NO candidate qualifies fall back to text
// splitting; the old code skipped the fallback entirely when the reply
// had no bracket at all ("alpha, beta" silently became zero tags, then
// got cached as an empty success). The splitter also accepts CJK
// separators - a Chinese model reply "机器学习，深度学习、翻译" used to
// survive as ONE glued tag.
function parseAITags(resp, separator) {
  const sep = separator || "-";
  const text = typeof resp === "string" ? resp : "";
  let tags = null;
  for (const m of text.matchAll(/\[[\s\S]*?\]/g)) {
    try {
      const arr = JSON.parse(m[0]);
      if (!Array.isArray(arr)) continue;
      const strs = arr.filter(t => typeof t === "string");
      if (arr.length === 0 || strs.length) { tags = strs; break; }
    } catch (_) { /* not JSON - try the next bracketed candidate */ }
  }
  if (tags === null) {
    tags = text.split(/[,\n;，、；]/)
      .map(t => t.replace(/["[\]`]/g, "").trim())
      .filter(Boolean);
  }
  return tags.map(t => t.toLowerCase().replace(/\s+/g, sep));
}

// ---- Refine AI tags: dedup, preserve order, cap ----
// Input is the already-normalized output of parseAITags (lowercased, separator-applied),
// but the helper is defensive so it can also be fed raw model strings.
// The former "conservative plural fold" (drop an s-suffixed tag whose
// singular was already kept) is gone: it deleted semantically DIFFERENT
// tags - ["new","news"] lost news, ["cs","css"] lost css (both
// reproduced by the popup-AI audit). Exact/separator-normalized dedup
// stays; genuine plural near-dupes are rare within one 8-tag reply and
// tag-gov's grouped cleanup owns the vocabulary-wide case.
function refineTags(tags, opts) {
  const cap = (opts && opts.cap) || AI_TAG_CAP;
  if (!Array.isArray(tags)) return [];
  const out = [];
  const seen = new Set();
  for (const raw of tags) {
    if (typeof raw !== "string") continue;
    const tag = raw.trim();
    if (!tag) continue;
    // Canonical key: lowercase, strip separators/spaces so "token-relay" == "token_relay" == "tokenrelay".
    const key = tag.toLowerCase().replace(/[\s_-]+/g, "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= cap) break;
  }
  return out;
}

// ---- User-facing AI failure text (ZH-3) ----
// One shared classifier for the translate UI's failure strings. Rules, in
// order (structured fields FIRST -- keyword matching misclassifies, see the
// DashScope precedent in handleAIError above):
//   1. err.code non-empty -> return err.message verbatim. Every code's message
//      is already specific at its throw site (network's is localized there,
//      _pbpStreamRead D4-2); a second mapping only blurs it. Tests pin this
//      pass-through -- do not "unify" it into a table lookup.
//   2. err.status -> 401/403 key, 429 quota, >=500 network.
//   3. conservative message keywords (quota/rate limit, api key, timeout,
//      failed-to-fetch). Never match a bare "model" substring.
//   4. unclassified -> String(err.message), never swallowed.
// Writes nothing; callers put the result into textContent/dataset.tip/
// aria-label only (spec ZH-3 write-surface allowlist).
function pbpAiErrorText(err) {
  const msg = String((err && err.message) || "") || "translation failed";
  // CLAUDE.md "swallowed exceptions must leave a trace": log the raw shape
  // before folding it into a product string (no keys/tokens in these fields).
  try { console.warn("[pbp-ai] request failed:", err && err.name, err && err.status, msg); } catch (_) {}
  if (err && err.code) return msg;
  const status = err && err.status;
  if (status === 401 || status === 403) return t("trErrKey");
  if (status === 429) return t("trErrQuota");
  if (typeof status === "number" && status >= 500) return t("trErrNetwork");
  if (/rate.?limit|too many requests|quota|resource.*exhausted|insufficient.*(?:balance|credit)/i.test(msg)) return t("trErrQuota");
  if (/invalid.*api.?key|incorrect api key|api key not valid|unauthorized|authentication/i.test(msg)) return t("trErrKey");
  if (/\btimed? ?out\b|timeout/i.test(msg)) return t("trErrTimeout");
  if (/failed to fetch|network/i.test(msg)) return t("trErrNetwork");
  return msg;
}

// ZH-3 §5: single composer for the model-not-found guidance popup-ai.js and
// options-connectivity.js previously each assembled by hand. Presentation
// stays with each caller (panel vs concatenated status line).
function pbpAiModelNotFoundText(providerLabel) {
  return { msg: t("aiErrorModelNotFound", providerLabel), hint: t("aiErrorModelNotFoundHint") };
}

// ---- In-flight dedup registry ----
// Prevents duplicate paid API calls when auto-click and manual click race
// (e.g. popup boot auto-clicks ai-tags-btn while user clicks it too).
// Mirrors the _pendingChecks pattern in background.js.
const _inflightAI = new Map(); // key -> Promise

function getOrCreateInflight(key, factory) {
  if (_inflightAI.has(key)) return _inflightAI.get(key);
  const promise = factory();
  _inflightAI.set(key, promise);
  // Cleanup runs on a SEPARATE chain from the returned `promise`. If `promise`
  // rejects (fetch timeout/abort, network fail), the caller's await/try-catch
  // handles the returned chain — but this cleanup chain would surface its own
  // "Uncaught (in promise)" rejection. .catch swallows it here; the caller still
  // sees (and handles) the rejection via the returned `promise`.
  promise.finally(() => _inflightAI.delete(key)).catch(() => {});
  return promise;
}

// ---- AI cache helpers ----
// Tiny stable string hash (djb2, base36) for fingerprint components that
// are free text (custom prompt templates).
function _aiFpHash(str) {
  let h = 5381;
  const s = String(str || "");
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

// Effective model for the fingerprint - mirrors what callAI actually
// dispatches per provider (configured model, else that provider's default).
function _aiEffectiveModelForFp(s) {
  const p = s.aiProvider || "gemini";
  if (p === "gemini") return s.geminiModel || "gemini-3.5-flash-lite";
  if (p === "claude") return s.claudeModel || "claude-haiku-4-5";
  if (p === "ollama") return s.ollamaModel || "llama3.2";
  const cfg = OPENAI_COMPAT_PROVIDERS[p];
  return cfg ? (s[cfg.modelField] || cfg.defaultModel || "default") : "default";
}

// Generation-identity fingerprint (audit A5): a tags/summary result
// depends on provider:model, output language, separator (tags) and the
// custom template - a cache hit that ignored them kept serving
// stale-config output (switch the language to Chinese, reopen, still get
// the cached English). Baked into the cache key AND the inflight keys;
// changing any dimension is a clean miss and old entries LRU-age out.
// type "combined" is the inflight-only identity covering both halves.
// Effective network endpoint for the fingerprint (Codex r2 L7): the
// configurable-base providers (openai/custom via baseField, ollama) can
// point the SAME provider:model at a different backend - a fingerprint
// that ignores it kept serving the old backend's results.
function _aiEffectiveEndpointForFp(s) {
  const p = s.aiProvider || "gemini";
  if (p === "ollama") return s.ollamaBaseUrl || "http://localhost:11434";
  const cfg = OPENAI_COMPAT_PROVIDERS[p];
  return cfg ? _openaiCompatBase(cfg, s) : "";
}

function aiCacheFingerprint(s, type) {
  if (!s) return "";
  if (type === "combined") {
    return aiCacheFingerprint(s, "tags") + "&" + aiCacheFingerprint(s, "summary");
  }
  const base = (s.aiProvider || "gemini") + ":" + _aiEffectiveModelForFp(s)
    + ":e" + _aiFpHash(_aiEffectiveEndpointForFp(s));
  if (type === "tags") {
    return [base, "l" + (s.aiTagLang || "en"), "s" + (s.aiTagSeparator || "-"),
      "c" + _aiFpHash(s.customTagPrompt?.trim() || "")].join("|");
  }
  return [base, "l" + (s.aiSummaryLang || "auto"),
    "c" + _aiFpHash(s.customSummaryPrompt?.trim() || "")].join("|");
}

function getCacheKey(url, type, source, account, fp) {
  if (type === "tags" || type === "summary") {
    if (!account) return "";
    const fpPart = fp ? encodeURIComponent(fp) + "_" : "";
    return `ai_cache_${type}_${source || "local"}_${fpPart}${encodeURIComponent(account)}_${url}`;
  }
  return `ai_cache_${type}_${source || "local"}_${url}`;
}


async function getAICache(url, type, cacheDuration, source, account, s) {
  const key = getCacheKey(url, type, source, account, aiCacheFingerprint(s, type));
  if (!key) return null;
  const dur = resolveCacheMs(cacheDuration);
  if (dur === 0) return null;   // 0 now reachable: cache disabled, never read

  // IDB path (sole AI-cache backend)
  if (typeof pbpAiCacheGet !== "function") return null;
  const entry = await pbpAiCacheGet(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > dur) {
    pbpAiCacheDelete(key).catch(() => {});
    return null;
  }
  return entry.result;
}

async function setAICache(url, type, result, cacheDuration, source, account, s) {
  if (resolveCacheMs(cacheDuration) === 0) return;   // disabled: never write
  const key = getCacheKey(url, type, source, account, aiCacheFingerprint(s, type));
  if (!key) return;
  const timestamp = Date.now();

  // IDB path (sole AI-cache backend)
  if (typeof pbpAiCacheSet !== "function") return;
  await pbpAiCacheSet(key, result, timestamp);
}

// ---- Build notes/description for a page ----
function buildAutoNotes(pageInfo, opts) {
  let desc = "";
  if (pageInfo.selectedText) {
    desc = opts.blockquote ? `<blockquote>${escapeForExtended(pageInfo.selectedText)}</blockquote>` : pageInfo.selectedText;
  } else if (opts.autoDescription && pageInfo.metaDescription) {
    desc = pageInfo.metaDescription;
  }
  if (opts.includeReferrer && pageInfo.referrer) {
    desc += (desc ? "\n\n" : "") + `via: ${pageInfo.referrer}`;
  }
  return desc;
}
