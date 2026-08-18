// ============================================================
// Options page — API connectivity tests (AI providers + Pinboard token).
// Exposes setupApiTests(); options.js calls it after DOMContentLoaded.
//
// Self-contained: depends only on globals (callAI, hasAIKey, t, $id, chrome).
// ============================================================

function pbpLiveAiSettingsSnapshot(provider) {
  function getOptVal(id, fallback) { return $id(id)?.value?.trim() || fallback || ""; }
  return {
    aiProvider: provider,
    geminiApiKey: getOptVal("opt-gemini-key"), geminiModel: getOptVal("opt-gemini-model", "gemini-3.5-flash-lite"),
    openaiApiKey: getOptVal("opt-openai-key"), openaiModel: getOptVal("opt-openai-model", "gpt-5.4-nano"), openaiBaseUrl: getOptVal("opt-openai-baseurl", "https://api.openai.com/v1"),
    claudeApiKey: getOptVal("opt-claude-key"), claudeModel: getOptVal("opt-claude-model", "claude-haiku-4-5"),
    deepseekApiKey: getOptVal("opt-deepseek-key"), deepseekModel: getOptVal("opt-deepseek-model", "deepseek-v4-flash"),
    qwenApiKey: getOptVal("opt-qwen-key"), qwenModel: getOptVal("opt-qwen-model", "qwen-flash"),
    minimaxApiKey: getOptVal("opt-minimax-key"), minimaxModel: getOptVal("opt-minimax-model", "MiniMax-M2"),
    openrouterApiKey: getOptVal("opt-openrouter-key"), openrouterModel: getOptVal("opt-openrouter-model", "openai/gpt-oss-20b:free"),
    ollamaBaseUrl: getOptVal("opt-ollama-baseurl", "http://localhost:11434"), ollamaModel: getOptVal("opt-ollama-model", "llama3.2"),
    groqApiKey: getOptVal("opt-groq-key"), groqModel: getOptVal("opt-groq-model", "llama-3.1-8b-instant"),
    mistralApiKey: getOptVal("opt-mistral-key"), mistralModel: getOptVal("opt-mistral-model", "mistral-small-latest"),
    cohereApiKey: getOptVal("opt-cohere-key"), cohereModel: getOptVal("opt-cohere-model", "command-r7b-12-2024"),
    siliconflowApiKey: getOptVal("opt-siliconflow-key"), siliconflowModel: getOptVal("opt-siliconflow-model", "Qwen/Qwen3-8B"),
    zhipuApiKey: getOptVal("opt-zhipu-key"), zhipuModel: getOptVal("opt-zhipu-model", "glm-4.7-flash"),
    kimiApiKey: getOptVal("opt-kimi-key"), kimiModel: getOptVal("opt-kimi-model", "kimi-k2.6"),
    githubModelsApiKey: getOptVal("opt-githubmodels-key"), githubModelsModel: getOptVal("opt-githubmodels-model", "openai/gpt-4.1-mini"),
    customApiKey: getOptVal("opt-custom-key"), customModel: getOptVal("opt-custom-model"), customBaseUrl: getOptVal("opt-custom-baseurl"),
  };
}

function setupApiTests() {

  // Every test result is wiped by a timer. Held anonymously, a finished run's
  // pending clear fires in the middle of the NEXT run for the same target and
  // erases a real result off screen. Keyed by target, each run cancels its
  // predecessor's clear before scheduling its own.
  const _testClearTimers = new Map();
  function cancelStatusClear(key) {
    clearTimeout(_testClearTimers.get(key));
    _testClearTimers.delete(key);
  }
  function scheduleStatusClear(key, statusEl, ms) {
    cancelStatusClear(key);
    _testClearTimers.set(key, setTimeout(() => {
      _testClearTimers.delete(key);
      statusEl.textContent = "";
      statusEl.style.color = "";
    }, ms));
  }

  async function testAIProvider(provider) {
    const statusEl = $id(`test-${provider}-status`);
    if (!statusEl) return;
    // The call underneath is an unbounded network request. Without this the
    // button stayed live throughout, so a second click started a concurrent run
    // against the same status element. Mirrors the Pinboard token test below.
    const btn = $id(`test-${provider}`);
    if (btn?.disabled) return;
    if (btn) btn.disabled = true;
    cancelStatusClear(provider);
    try {
      statusEl.classList.remove("ok", "bad");
      statusEl.textContent = t("testTesting");
      statusEl.style.color = "#888";

      const cs = pbpLiveAiSettingsSnapshot(provider);

      if (!hasAIKey(cs)) {
        setStatusIcon(statusEl, false, t("testNoApiKey"));
        statusEl.style.color = "#c00";
        scheduleStatusClear(provider, statusEl, 5000);
        return;
      }

      // Test is a direct user gesture: request only this provider's exact origin before
      // calling it. Automatic/background paths stay contains-only and never prompt.
      let originPattern = null;
      let granted = false;
      try {
        originPattern = _aiTargetOriginPattern(cs);
        granted = await requestAIHostPermissions(cs);
      } catch (err) {
        setStatusIcon(statusEl, false, err?.message || t("networkError"));
        statusEl.style.color = "#c00";
        scheduleStatusClear(provider, statusEl, 5000);
        return;
      }
      if (!granted) {
        setStatusIcon(statusEl, false, t("aiErrorHostPermission", originPattern.replace(/\/\*$/, "")));
        statusEl.style.color = "#c00";
        scheduleStatusClear(provider, statusEl, 5000);
        return;
      }

      try {
        const result = await callAI(cs, "Reply with just the word: OK");

        setStatusIcon(statusEl, true, t("testConnected", (result || "OK").substring(0, 20)));
        statusEl.style.color = "#080";
        scheduleStatusClear(provider, statusEl, 4000);
      } catch (err) {
        let msg = err.name === "AbortError" ? t("testTimeout") : err.message;
        if (err?.code === "model_not_found") {
          const mnf = pbpAiModelNotFoundText(cs.aiProvider);
          msg = mnf.msg + " " + mnf.hint;
        }
        setStatusIcon(statusEl, false, msg);
        statusEl.style.color = "#c00";
        scheduleStatusClear(provider, statusEl, 5000);
      }
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  ["gemini","openai","claude","deepseek","qwen","minimax","openrouter","groq","mistral","cohere","siliconflow","zhipu","kimi","githubmodels","ollama","custom"].forEach(p => {
    $id(`test-${p}`)?.addEventListener("click", () => testAIProvider(p));
  });

  // ---- Pinboard token: real-time format validation (shared.js rule) ----
  const tokenInput = $id("opt-pinboard-token");
  const tokenWarn = $id("token-format-warn");
  function validateTokenField() {
    const val = tokenInput.value.trim();
    tokenWarn.classList.toggle("visible", pbpIsValidTokenFormat(val) === false);
  }
  tokenInput?.addEventListener("input", validateTokenField);
  tokenInput?.addEventListener("blur", validateTokenField);
  validateTokenField();

  // ---- Test Pinboard API token (via background to avoid native auth dialog) ----
  $id("test-pinboard-token")?.addEventListener("click", async () => {
    const btn = $id("test-pinboard-token");
    const statusEl = $id("test-pinboard-status");
    const token = tokenInput.value.trim();
    if (pbpIsValidTokenFormat(token) !== true) {
      setStatusIcon(statusEl, false, t("loginInvalidFormat"));
      statusEl.style.color = "#c00";
      scheduleStatusClear("pinboard", statusEl, 4000);
      return;
    }
    btn.disabled = true;
    cancelStatusClear("pinboard");
    statusEl.classList.remove("ok", "bad");
    statusEl.textContent = t("testTesting");
    statusEl.style.color = "";
    try {
      const resp = await chrome.runtime.sendMessage({ type: "test_pinboard_token", token });
      if (resp?.ok) {
        setStatusIcon(statusEl, true, t("testConnected", token.split(":")[0]));
        statusEl.style.color = "#080";
      } else if (resp?.error === "timeout") {
        setStatusIcon(statusEl, false, t("testTimeout"));
        statusEl.style.color = "#c00";
      } else if (resp?.error === "network") {
        setStatusIcon(statusEl, false, t("networkError"));
        statusEl.style.color = "#c00";
      } else {
        setStatusIcon(statusEl, false, t("loginFailed"));
        statusEl.style.color = "#c00";
      }
    } catch (_) {
      setStatusIcon(statusEl, false, t("networkError"));
      statusEl.style.color = "#c00";
    } finally {
      btn.disabled = false;
      scheduleStatusClear("pinboard", statusEl, 5000);
    }
  });
}
