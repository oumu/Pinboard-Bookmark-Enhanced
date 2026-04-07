document.addEventListener("DOMContentLoaded", async () => {
  await initI18n();
  applyI18n();
  // Fade in after i18n applied (prevents flash of untranslated/unstyled content)
  document.body.style.transition = "opacity 0.18s";
  document.body.style.opacity = "1";

  // ---- Tab switching ----
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(`panel-${btn.dataset.panel}`).classList.add("active");
    });
  });

  // Restore active tab after language switch
  const savedTab = sessionStorage.getItem("activeTab");
  if (savedTab) {
    sessionStorage.removeItem("activeTab");
    const btn = document.querySelector(`.tab-btn[data-panel="${savedTab}"]`);
    if (btn) btn.click();
  }

  // ---- Reset current tab to defaults ----
  const PANEL_DEFAULTS = {
    general: {
      fields: {
        "opt-lang": "auto",
        "opt-check-bookmark-status": true, "opt-auto-close": true, "offline-queue-enabled": true,
        "opt-show-search": false, "opt-show-recent": false, "opt-show-badge": false,
        "notify-quick-save": true, "notify-read-later": true, "notify-tab-set": true,
        "notify-batch-save": true, "notify-errors": true
      },
      skip: ["opt-pinboard-token", "opt-sync-enabled"] // never reset token or sync toggle
    },
    bookmarks: {
      fields: {
        "opt-private-default": false, "opt-private-incognito": false, "opt-readlater-default": false,
        "opt-auto-description": true, "opt-blockquote": true, "opt-include-referrer": false,
        "opt-respect-tag-case": true, "opt-show-suggest-tags": true, "opt-tag-presets": ""
      }
    },
    ai: {
      fields: {
        "opt-ai-provider": "gemini", "opt-ai-summary-lang": "auto", "opt-ai-cache-duration": "60",
        "opt-ai-auto-tags": false, "opt-ai-tag-separator": "-",
        "opt-custom-tag-prompt": "", "opt-custom-summary-prompt": "",
        "opt-gemini-model": "gemini-2.0-flash", "opt-openai-model": "gpt-4o-mini",
        "opt-openai-baseurl": "https://api.openai.com/v1", "opt-claude-model": "claude-sonnet-4-20250514",
        "opt-deepseek-model": "deepseek-chat", "opt-qwen-model": "qwen-turbo",
        "opt-minimax-model": "MiniMax-Text-01", "opt-openrouter-model": "google/gemini-2.0-flash-exp:free",
        "opt-groq-model": "llama-3.3-70b-versatile", "opt-mistral-model": "mistral-small-latest",
        "opt-cohere-model": "command-r-plus", "opt-siliconflow-model": "Qwen/Qwen2.5-7B-Instruct",
        "opt-ollama-baseurl": "http://localhost:11434", "opt-ollama-model": "llama3",
        "opt-custom-name": "Custom", "opt-custom-baseurl": "", "opt-custom-model": ""
      },
      skip: ["opt-gemini-key","opt-openai-key","opt-claude-key","opt-deepseek-key","opt-qwen-key","opt-minimax-key","opt-openrouter-key","opt-groq-key","opt-mistral-key","opt-cohere-key","opt-siliconflow-key","opt-custom-key"]
    },
    quick: {
      fields: {
        "qs-auto-notes": true, "qs-blockquote": true, "qs-default-tags": "", "qs-ai-tags": false, "qs-ai-summary": false,
        "rl-auto-notes": true, "rl-blockquote": true, "rl-default-tags": "", "rl-ai-tags": false, "rl-ai-summary": false,
        "opt-batch-tag-enabled": true, "opt-batch-tag": "batch_saved",
        "batch-ai-tags": false, "batch-ai-summary": false, "batch-skip-existing": false
      }
    },
    appearance: {
      fields: {
        "opt-theme": "auto", "opt-popup-follow-theme": true, "opt-custom-font": ""
      }
    }
  };

  document.getElementById("reset-panel-btn").addEventListener("click", function () {
    const resetBtn = this;
    const activeBtn = document.querySelector(".tab-btn.active");
    if (!activeBtn) return;
    const panel = activeBtn.dataset.panel;
    const def = PANEL_DEFAULTS[panel];
    if (!def) return;
    // Prevent double-click while popover is showing
    if (resetBtn.querySelector(".confirm-popover")) return;

    const pop = document.createElement("div");
    pop.className = "confirm-popover";
    const msg = document.createElement("span");
    msg.className = "confirm-msg";
    msg.textContent = t("resetConfirm", activeBtn.textContent) + (def.skip ? t("resetKeysKept") : "");
    const yes = document.createElement("button");
    yes.className = "confirm-yes";
    yes.textContent = t("reset");
    const no = document.createElement("button");
    no.className = "confirm-no";
    no.textContent = t("cancel");
    pop.appendChild(msg);
    pop.appendChild(yes);
    pop.appendChild(no);
    resetBtn.appendChild(pop);

    function dismiss() { pop.remove(); }
    pop.addEventListener("click", (e) => e.stopPropagation());
    no.addEventListener("click", dismiss);
    yes.addEventListener("click", () => {
      for (const [id, val] of Object.entries(def.fields)) {
        const el = document.getElementById(id);
        if (!el) continue;
        if (el.type === "checkbox") el.checked = val;
        else el.value = val;
      }
      saveAll();
      dismiss();
    });
  });

  // ---- Accordion sections ----
  document.querySelectorAll(".accordion-header").forEach((header) => {
    header.addEventListener("click", () => {
      header.closest(".accordion-section").classList.toggle("open");
    });
  });

  // ---- API key show/hide toggle ----
  document.querySelectorAll(".key-toggle").forEach(btn => {
    btn.addEventListener("click", () => {
      const input = document.getElementById(btn.dataset.target);
      if (input) {
        const isPassword = input.type === "password";
        input.type = isPassword ? "text" : "password";
        btn.textContent = isPassword ? "🔒" : "👁";
      }
    });
  });

  // ---- All settings with defaults (from shared.js) ----
  const s = await (await getSettingsStorage()).get(SETTINGS_DEFAULTS);
  deobfuscateSettings(s);

  // ---- Load large sync data (chunked to bypass 8KB per-key limit) ----
  s.customCSS = await syncGetLarge("customCSS", "");
  // One-time migration: move customCSS from local to sync
  if (!s.customCSS) {
    const localData = await chrome.storage.local.get({ customCSS: "" });
    if (localData.customCSS) {
      s.customCSS = localData.customCSS;
      await syncSetLarge("customCSS", s.customCSS);
      await chrome.storage.local.remove("customCSS");
    }
  }

  // ---- Fill text/password/select fields ----
  const fieldMap = {
    "opt-pinboard-token": s.pinboardToken,
    "opt-ai-provider": s.aiProvider,
    "opt-gemini-key": s.geminiApiKey, "opt-gemini-model": s.geminiModel,
    "opt-openai-key": s.openaiApiKey, "opt-openai-model": s.openaiModel, "opt-openai-baseurl": s.openaiBaseUrl,
    "opt-claude-key": s.claudeApiKey, "opt-claude-model": s.claudeModel,
    "opt-deepseek-key": s.deepseekApiKey, "opt-deepseek-model": s.deepseekModel,
    "opt-qwen-key": s.qwenApiKey, "opt-qwen-model": s.qwenModel,
    "opt-minimax-key": s.minimaxApiKey, "opt-minimax-model": s.minimaxModel,
    "opt-openrouter-key": s.openrouterApiKey, "opt-openrouter-model": s.openrouterModel,
    "opt-groq-key": s.groqApiKey, "opt-groq-model": s.groqModel,
    "opt-mistral-key": s.mistralApiKey, "opt-mistral-model": s.mistralModel,
    "opt-cohere-key": s.cohereApiKey, "opt-cohere-model": s.cohereModel,
    "opt-siliconflow-key": s.siliconflowApiKey, "opt-siliconflow-model": s.siliconflowModel,
    "opt-ollama-baseurl": s.ollamaBaseUrl, "opt-ollama-model": s.ollamaModel,
    "opt-custom-name": s.customName, "opt-custom-baseurl": s.customBaseUrl,
    "opt-custom-key": s.customApiKey, "opt-custom-model": s.customModel,
    "opt-ai-summary-lang": s.aiSummaryLang, "opt-ai-cache-duration": s.aiCacheDuration,
    "opt-custom-tag-prompt": s.customTagPrompt, "opt-custom-summary-prompt": s.customSummaryPrompt,
    "opt-batch-tag": s.optBatchTag, "opt-lang": s.optLang, "opt-theme": s.optTheme,
    "qs-default-tags": s.qsDefaultTags, "rl-default-tags": s.rlDefaultTags,
    "opt-custom-font": s.customFont, "opt-custom-css": s.customCSS,
    "opt-ai-tag-separator": s.aiTagSeparator,
    "opt-tag-presets": s.tagPresets
  };
  for (const [id, val] of Object.entries(fieldMap)) {
    const el = document.getElementById(id);
    if (el) el.value = val;
  }

  // Show default prompts as placeholder so users see them when field is empty
  document.getElementById("opt-custom-tag-prompt").placeholder = DEFAULT_TAG_PROMPT;
  document.getElementById("opt-custom-summary-prompt").placeholder = DEFAULT_SUMMARY_PROMPT;

  // ---- Fill checkbox fields ----
  const checkMap = {
    "opt-private-default": s.optPrivateDefault, "opt-private-incognito": s.optPrivateIncognito,
    "opt-readlater-default": s.optReadlaterDefault, "opt-auto-description": s.optAutoDescription,
    "opt-blockquote": s.optBlockquote, "opt-include-referrer": s.optIncludeReferrer,
    "opt-ai-auto-tags": s.optAiAutoTags,
    "qs-auto-notes": s.qsAutoNotes, "qs-blockquote": s.qsBlockquote,
    "qs-ai-tags": s.qsAiTags, "qs-ai-summary": s.qsAiSummary,
    "rl-auto-notes": s.rlAutoNotes, "rl-blockquote": s.rlBlockquote,
    "rl-ai-tags": s.rlAiTags, "rl-ai-summary": s.rlAiSummary,
    "opt-batch-tag-enabled": s.optBatchTagEnabled,
    "batch-ai-tags": s.batchAiTags, "batch-ai-summary": s.batchAiSummary,
    "batch-skip-existing": s.batchSkipExisting,
    "opt-show-recent": s.optShowRecent, "opt-show-search": s.optShowSearch,
    "notify-quick-save": s.notifyQuickSave,
    "notify-read-later": s.notifyReadLater,
    "notify-tab-set": s.notifyTabSet, "notify-batch-save": s.notifyBatchSave,
    "notify-errors": s.notifyErrors,
    "opt-respect-tag-case": s.optRespectTagCase,
    "offline-queue-enabled": s.offlineQueueEnabled,
    "opt-show-badge": s.optShowBadge,
    "opt-check-bookmark-status": s.optCheckBookmarkStatus,
    "opt-show-suggest-tags": s.optShowSuggestTags,
    "opt-auto-close": s.optAutoCloseAfterSave,
    "opt-popup-follow-theme": s.optPopupFollowTheme
  };
  for (const [id, val] of Object.entries(checkMap)) {
    const el = document.getElementById(id);
    if (el) el.checked = val;
  }

  // ---- Load sync toggle (stored in local, not in settings storage) ----
  const { optSyncEnabled } = await chrome.storage.local.get({ optSyncEnabled: false });
  const syncToggle = document.getElementById("opt-sync-enabled");
  if (syncToggle) syncToggle.checked = optSyncEnabled;

  // Sync toggle change: migrate settings then reload
  syncToggle?.addEventListener("change", async () => {
    const enabling = syncToggle.checked;
    const oldStorage = enabling ? chrome.storage.local : chrome.storage.sync;
    const newStorage = enabling ? chrome.storage.sync : chrome.storage.local;
    // 1. Migrate regular settings
    try {
      const data = await oldStorage.get(Object.keys(SETTINGS_DEFAULTS));
      await newStorage.set(data);
    } catch (e) { console.error("sync migration:", e); }
    // 2. Migrate customCSS (large value) — read from old, then switch pref, then write to new
    try {
      const customCSS = await syncGetLarge("customCSS", ""); // reads from current (old) storage
      await chrome.storage.local.set({ optSyncEnabled: enabling }); // switch pref NOW
      await syncSetLarge("customCSS", customCSS); // writes to new storage
    } catch (e) { console.error("customCSS migration:", e); }
    // Ensure pref is saved even if CSS migration failed
    await chrome.storage.local.set({ optSyncEnabled: enabling });
    // Fade out and reload
    const activePanel = document.querySelector(".tab-btn.active")?.dataset.panel || "general";
    sessionStorage.setItem("activeTab", activePanel);
    document.body.style.transition = "opacity 0.18s";
    document.body.style.opacity = "0";
    setTimeout(() => location.reload(), 180);
  });

  // ---- Apply options page theme based on Pinboard theme preset ----
  function applyOptionsPageTheme(presetKey, themeMode) {
    const prefersDark = themeMode === "dark" ||
      (themeMode === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    const adaptiveMap = {
      flexoki: ["flexoki-light", "flexoki-dark"],
      solarized: ["solarized-light", "solarized-dark"],
      catppuccin: ["catppuccin-latte", "catppuccin-mocha"]
    };
    if (adaptiveMap[presetKey]) {
      const [light, dark] = adaptiveMap[presetKey];
      document.documentElement.dataset.theme = prefersDark ? dark : light;
    } else if (presetKey) {
      document.documentElement.dataset.theme = presetKey;
    } else if (prefersDark) {
      document.documentElement.dataset.theme = "flexoki-dark";
    } else {
      delete document.documentElement.dataset.theme;
    }
  }
  // Track active preset key — used by saveAll() and theme dropdown listener
  let currentPresetKey = s.themePresetKey || "";
  if (!currentPresetKey && s.customCSS) {
    // Backward compat: detect from CSS text if themePresetKey not yet stored
    for (const [key, theme] of Object.entries(PINBOARD_THEMES)) {
      if (theme.css.trim() === s.customCSS.trim()) { currentPresetKey = key; break; }
    }
  }
  applyOptionsPageTheme(currentPresetKey, s.optTheme);
  // Language change: save immediately and reload to apply
  document.getElementById("opt-lang").addEventListener("change", async () => {
    const lang = document.getElementById("opt-lang").value;
    const activePanel = document.querySelector(".tab-btn.active")?.dataset.panel || "general";
    await (await getSettingsStorage()).set({ optLang: lang });
    sessionStorage.setItem("activeTab", activePanel);
    document.body.style.transition = "opacity 0.18s";
    document.body.style.opacity = "0";
    setTimeout(() => location.reload(), 180);
  });
  // Real-time switch when theme dropdown changes (affects Flexoki Adaptive + no-preset dark)
  document.getElementById("opt-theme").addEventListener("change", () => {
    const mode = document.getElementById("opt-theme").value;
    applyOptionsPageTheme(currentPresetKey, mode);
    // Adaptive pinboard themes: swap CSS when light/dark mode changes
    const adaptivePinboard = {
      solarized: ["solarized-light", "solarized-dark"],
      catppuccin: ["catppuccin-latte", "catppuccin-mocha"]
    };
    if (adaptivePinboard[currentPresetKey]) {
      const prefersDark = mode === "dark" || (mode === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
      const themeKey = adaptivePinboard[currentPresetKey][prefersDark ? 1 : 0];
      const theme = PINBOARD_THEMES[themeKey];
      if (theme) {
        document.getElementById("opt-custom-css").value = theme.css;
        scheduleAutoSave();
      }
    }
  });

  // ---- Provider field toggle ----
  const providers = ["gemini","openai","claude","deepseek","qwen","minimax","openrouter","groq","mistral","cohere","siliconflow","ollama","custom"];
  function updateProviderFields() {
    const selected = document.getElementById("opt-ai-provider").value;
    providers.forEach(p => {
      const el = document.getElementById("fields-" + p);
      if (el) el.classList.toggle("hidden", p !== selected);
    });
  }
  updateProviderFields();
  document.getElementById("opt-ai-provider").addEventListener("change", updateProviderFields);

  // ---- Reset prompt buttons ----
  document.getElementById("reset-tag-prompt").addEventListener("click", () => {
    document.getElementById("opt-custom-tag-prompt").value = DEFAULT_TAG_PROMPT;
    saveAll();
  });
  document.getElementById("reset-summary-prompt").addEventListener("click", () => {
    document.getElementById("opt-custom-summary-prompt").value = DEFAULT_SUMMARY_PROMPT;
    saveAll();
  });

  // ===================== Auto-save =====================
  // Collect all settings from the form and save to chrome.storage.sync
  async function saveAll() {
    const data = {
      // Bookmarks
      pinboardToken: obfuscateKey(document.getElementById("opt-pinboard-token").value.trim()),
      optPrivateDefault: document.getElementById("opt-private-default").checked,
      optPrivateIncognito: document.getElementById("opt-private-incognito").checked,
      optReadlaterDefault: document.getElementById("opt-readlater-default").checked,
      optAutoDescription: document.getElementById("opt-auto-description").checked,
      optBlockquote: document.getElementById("opt-blockquote").checked,
      optIncludeReferrer: document.getElementById("opt-include-referrer").checked,
      optRespectTagCase: document.getElementById("opt-respect-tag-case").checked,
      offlineQueueEnabled: document.getElementById("offline-queue-enabled").checked,
      // Quick Actions
      qsAutoNotes: document.getElementById("qs-auto-notes").checked,
      qsBlockquote: document.getElementById("qs-blockquote").checked,
      qsDefaultTags: document.getElementById("qs-default-tags").value.trim(),
      qsAiTags: document.getElementById("qs-ai-tags").checked,
      qsAiSummary: document.getElementById("qs-ai-summary").checked,
      // Read Later
      rlAutoNotes: document.getElementById("rl-auto-notes").checked,
      rlBlockquote: document.getElementById("rl-blockquote").checked,
      rlDefaultTags: document.getElementById("rl-default-tags").value.trim(),
      rlAiTags: document.getElementById("rl-ai-tags").checked,
      rlAiSummary: document.getElementById("rl-ai-summary").checked,
      optBatchTagEnabled: document.getElementById("opt-batch-tag-enabled").checked,
      optBatchTag: document.getElementById("opt-batch-tag").value.trim() || "batch_saved",
      batchAiTags: document.getElementById("batch-ai-tags").checked,
      batchAiSummary: document.getElementById("batch-ai-summary").checked,
      batchSkipExisting: document.getElementById("batch-skip-existing").checked,
      // AI Provider & Keys
      aiProvider: document.getElementById("opt-ai-provider").value,
      geminiApiKey: obfuscateKey(document.getElementById("opt-gemini-key").value.trim()),
      geminiModel: document.getElementById("opt-gemini-model").value.trim() || "gemini-2.0-flash",
      openaiApiKey: obfuscateKey(document.getElementById("opt-openai-key").value.trim()),
      openaiModel: document.getElementById("opt-openai-model").value.trim() || "gpt-4o-mini",
      openaiBaseUrl: document.getElementById("opt-openai-baseurl").value.trim() || "https://api.openai.com/v1",
      claudeApiKey: obfuscateKey(document.getElementById("opt-claude-key").value.trim()),
      claudeModel: document.getElementById("opt-claude-model").value.trim() || "claude-sonnet-4-20250514",
      deepseekApiKey: obfuscateKey(document.getElementById("opt-deepseek-key").value.trim()),
      deepseekModel: document.getElementById("opt-deepseek-model").value.trim() || "deepseek-chat",
      qwenApiKey: obfuscateKey(document.getElementById("opt-qwen-key").value.trim()),
      qwenModel: document.getElementById("opt-qwen-model").value.trim() || "qwen-turbo",
      minimaxApiKey: obfuscateKey(document.getElementById("opt-minimax-key").value.trim()),
      minimaxModel: document.getElementById("opt-minimax-model").value.trim() || "MiniMax-Text-01",
      openrouterApiKey: obfuscateKey(document.getElementById("opt-openrouter-key").value.trim()),
      openrouterModel: document.getElementById("opt-openrouter-model").value.trim() || "google/gemini-2.0-flash-exp:free",
      groqApiKey: obfuscateKey(document.getElementById("opt-groq-key").value.trim()),
      groqModel: document.getElementById("opt-groq-model").value.trim() || "llama-3.3-70b-versatile",
      mistralApiKey: obfuscateKey(document.getElementById("opt-mistral-key").value.trim()),
      mistralModel: document.getElementById("opt-mistral-model").value.trim() || "mistral-small-latest",
      cohereApiKey: obfuscateKey(document.getElementById("opt-cohere-key").value.trim()),
      cohereModel: document.getElementById("opt-cohere-model").value.trim() || "command-r-plus",
      siliconflowApiKey: obfuscateKey(document.getElementById("opt-siliconflow-key").value.trim()),
      siliconflowModel: document.getElementById("opt-siliconflow-model").value.trim() || "Qwen/Qwen2.5-7B-Instruct",
      ollamaBaseUrl: document.getElementById("opt-ollama-baseurl").value.trim() || "http://localhost:11434",
      ollamaModel: document.getElementById("opt-ollama-model").value.trim() || "llama3",
      customName: document.getElementById("opt-custom-name").value.trim() || "Custom",
      customBaseUrl: document.getElementById("opt-custom-baseurl").value.trim(),
      customApiKey: obfuscateKey(document.getElementById("opt-custom-key").value.trim()),
      customModel: document.getElementById("opt-custom-model").value.trim(),
      // AI Behavior & Prompts
      optAiAutoTags: document.getElementById("opt-ai-auto-tags").checked,
      aiSummaryLang: document.getElementById("opt-ai-summary-lang").value,
      aiCacheDuration: Math.max(0, parseInt(document.getElementById("opt-ai-cache-duration").value) || 60),
      aiTagSeparator: document.getElementById("opt-ai-tag-separator").value,
      customTagPrompt: document.getElementById("opt-custom-tag-prompt").value,
      customSummaryPrompt: document.getElementById("opt-custom-summary-prompt").value,
      // Appearance
      optLang: document.getElementById("opt-lang").value,
      optTheme: document.getElementById("opt-theme").value,
      optShowSearch: document.getElementById("opt-show-search").checked,
      optShowRecent: document.getElementById("opt-show-recent").checked,
      optShowBadge: document.getElementById("opt-show-badge").checked,
      // Notifications
      notifyQuickSave: document.getElementById("notify-quick-save").checked,
      notifyReadLater: document.getElementById("notify-read-later").checked,
      notifyTabSet: document.getElementById("notify-tab-set").checked,
      notifyBatchSave: document.getElementById("notify-batch-save").checked,
      notifyErrors: document.getElementById("notify-errors").checked,
      // Custom Style (font only — CSS stored in local)
      customFont: document.getElementById("opt-custom-font").value.trim(),
      // New toggles
      optCheckBookmarkStatus: document.getElementById("opt-check-bookmark-status").checked,
      optShowSuggestTags: document.getElementById("opt-show-suggest-tags").checked,
      optAutoCloseAfterSave: document.getElementById("opt-auto-close").checked,
      optPopupFollowTheme: document.getElementById("opt-popup-follow-theme").checked,
      tagPresets: document.getElementById("opt-tag-presets").value,
      themePresetKey: currentPresetKey
    };
    await (await getSettingsStorage()).set(data);
    // Save customCSS via chunked sync (supports cross-device sync)
    await syncSetLarge("customCSS", document.getElementById("opt-custom-css").value);
    flashAutoSave();
  }

  // Debounced auto-save: triggers 500ms after last change
  let saveTimer = null;
  function scheduleAutoSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveAll, 500);
  }

  // Listen on all form inputs for auto-save
  document.querySelectorAll('.panel input[type="checkbox"]').forEach(el => {
    el.addEventListener("change", scheduleAutoSave);
  });
  document.querySelectorAll('.panel input[type="text"], .panel input[type="password"], .panel input[type="number"], .panel textarea').forEach(el => {
    el.addEventListener("input", scheduleAutoSave);
  });
  document.querySelectorAll('.panel select').forEach(el => {
    el.addEventListener("change", scheduleAutoSave);
  });

  function flashAutoSave() {
    const el = document.getElementById("auto-save-status");
    el.textContent = t("optAutoSaved");
    el.classList.add("saved");
    clearTimeout(el._timer);
    el._timer = setTimeout(() => {
      el.textContent = t("optAutoSave");
      el.classList.remove("saved");
    }, 1500);
  }

  // ---- Export Settings ----
  document.getElementById("export-settings").addEventListener("click", async () => {
    const raw = await (await getSettingsStorage()).get(null);
    const sensitiveKeys = ["pinboardToken","geminiApiKey","openaiApiKey","claudeApiKey","deepseekApiKey","qwenApiKey","minimaxApiKey","openrouterApiKey","groqApiKey","mistralApiKey","cohereApiKey","siliconflowApiKey","customApiKey"];
    const exportData = Object.fromEntries(
      Object.entries(raw).filter(([k]) => !sensitiveKeys.includes(k))
    );
    // Include chunked sync data
    const customCSS = await syncGetLarge("customCSS", "");
    if (customCSS) exportData.customCSS = customCSS;
    const savedThemesData = await syncGetLarge("savedThemes", []);
    if (savedThemesData.length) exportData.savedThemes = savedThemesData;
    // Remove chunk keys from export (they're internal)
    Object.keys(exportData).forEach(k => { if (/^(customCSS|savedThemes)_\d+$/.test(k) || (exportData[k] && exportData[k]._chunks)) delete exportData[k]; });
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "Pinboard Bookmark Plus settings backup.json"; a.click();
    URL.revokeObjectURL(url);
  });

  // ---- Import Settings ----
  document.getElementById("import-settings-file").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const sensitiveKeys = ["pinboardToken","geminiApiKey","openaiApiKey","claudeApiKey","deepseekApiKey","qwenApiKey","minimaxApiKey","openrouterApiKey","groqApiKey","mistralApiKey","cohereApiKey","siliconflowApiKey","customApiKey"];
      // Separate large data for chunked sync
      const { customCSS, savedThemes: importedThemes, ...rest } = data;
      const safeData = Object.fromEntries(
        Object.entries(rest).filter(([k]) => !sensitiveKeys.includes(k) && !/^(customCSS|savedThemes)_\d+$/.test(k))
      );
      await (await getSettingsStorage()).set(safeData);
      if (customCSS !== undefined) await syncSetLarge("customCSS", customCSS);
      if (importedThemes !== undefined) await syncSetLarge("savedThemes", importedThemes);
      const status = document.getElementById("import-status");
      status.textContent = t("importedReload");
      setTimeout(() => { status.textContent = ""; }, 3000);
    } catch (err) {
      const status = document.getElementById("import-status");
      status.textContent = t("importInvalid");
      status.style.color = "#c00";
      setTimeout(() => { status.textContent = ""; status.style.color = ""; }, 3000);
    }
    e.target.value = "";
  });

  // ---- API Connectivity Tests ----
  async function testAIProvider(provider) {
    const statusEl = document.getElementById(`test-${provider}-status`);
    if (!statusEl) return;
    statusEl.textContent = t("testTesting");
    statusEl.style.color = "#888";

    const cs = {
      aiProvider: provider,
      geminiApiKey: document.getElementById("opt-gemini-key")?.value?.trim() || "",
      geminiModel: document.getElementById("opt-gemini-model")?.value?.trim() || "gemini-2.0-flash",
      openaiApiKey: document.getElementById("opt-openai-key")?.value?.trim() || "",
      openaiModel: document.getElementById("opt-openai-model")?.value?.trim() || "gpt-4o-mini",
      openaiBaseUrl: document.getElementById("opt-openai-baseurl")?.value?.trim() || "https://api.openai.com/v1",
      claudeApiKey: document.getElementById("opt-claude-key")?.value?.trim() || "",
      claudeModel: document.getElementById("opt-claude-model")?.value?.trim() || "claude-sonnet-4-20250514",
      deepseekApiKey: document.getElementById("opt-deepseek-key")?.value?.trim() || "",
      deepseekModel: document.getElementById("opt-deepseek-model")?.value?.trim() || "deepseek-chat",
      qwenApiKey: document.getElementById("opt-qwen-key")?.value?.trim() || "",
      qwenModel: document.getElementById("opt-qwen-model")?.value?.trim() || "qwen-turbo",
      minimaxApiKey: document.getElementById("opt-minimax-key")?.value?.trim() || "",
      minimaxModel: document.getElementById("opt-minimax-model")?.value?.trim() || "MiniMax-Text-01",
      openrouterApiKey: document.getElementById("opt-openrouter-key")?.value?.trim() || "",
      openrouterModel: document.getElementById("opt-openrouter-model")?.value?.trim() || "google/gemini-2.0-flash-exp:free",
      ollamaBaseUrl: document.getElementById("opt-ollama-baseurl")?.value?.trim() || "http://localhost:11434",
      ollamaModel: document.getElementById("opt-ollama-model")?.value?.trim() || "llama3",
      groqApiKey: document.getElementById("opt-groq-key")?.value?.trim() || "",
      groqModel: document.getElementById("opt-groq-model")?.value?.trim() || "llama-3.3-70b-versatile",
      mistralApiKey: document.getElementById("opt-mistral-key")?.value?.trim() || "",
      mistralModel: document.getElementById("opt-mistral-model")?.value?.trim() || "mistral-small-latest",
      cohereApiKey: document.getElementById("opt-cohere-key")?.value?.trim() || "",
      cohereModel: document.getElementById("opt-cohere-model")?.value?.trim() || "command-r-plus",
      siliconflowApiKey: document.getElementById("opt-siliconflow-key")?.value?.trim() || "",
      siliconflowModel: document.getElementById("opt-siliconflow-model")?.value?.trim() || "Qwen/Qwen2.5-7B-Instruct",
      customApiKey: document.getElementById("opt-custom-key")?.value?.trim() || "",
      customModel: document.getElementById("opt-custom-model")?.value?.trim() || "",
      customBaseUrl: document.getElementById("opt-custom-baseurl")?.value?.trim() || "",
    };

    try {
      const testPrompt = "Reply with just the word: OK";
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      async function doFetch(url, options) {
        return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
      }

      let result = "";
      if (provider === "gemini") {
        if (!cs.geminiApiKey) throw new Error(t("testNoApiKey"));
        const res = await doFetch(`https://generativelanguage.googleapis.com/v1beta/models/${cs.geminiModel}:generateContent?key=${cs.geminiApiKey}`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: testPrompt }] }], generationConfig: { temperature: 0, maxOutputTokens: 10 } })
        });
        if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error?.message || `HTTP ${res.status}`); }
        result = (await res.json()).candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "OK";
      } else if (provider === "claude") {
        if (!cs.claudeApiKey) throw new Error(t("testNoApiKey"));
        const res = await doFetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": cs.claudeApiKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
          body: JSON.stringify({ model: cs.claudeModel, max_tokens: 10, messages: [{ role: "user", content: testPrompt }] })
        });
        if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error?.message || `HTTP ${res.status}`); }
        result = (await res.json()).content?.[0]?.text?.trim() || "OK";
      } else if (provider === "ollama") {
        const base = (cs.ollamaBaseUrl || "http://localhost:11434").replace(/\/+$/, "");
        const res = await doFetch(`${base}/api/chat`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: cs.ollamaModel, messages: [{ role: "user", content: testPrompt }], stream: false })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        result = (await res.json()).message?.content?.trim() || "OK";
      } else {
        const baseUrlMap = { openai: cs.openaiBaseUrl, deepseek: "https://api.deepseek.com/v1", qwen: "https://dashscope.aliyuncs.com/compatible-mode/v1", minimax: "https://api.minimax.chat/v1", openrouter: "https://openrouter.ai/api/v1", groq: "https://api.groq.com/openai/v1", mistral: "https://api.mistral.ai/v1", cohere: "https://api.cohere.com/v2", siliconflow: "https://api.siliconflow.cn/v1", custom: cs.customBaseUrl };
        const apiKeyMap = { openai: cs.openaiApiKey, deepseek: cs.deepseekApiKey, qwen: cs.qwenApiKey, minimax: cs.minimaxApiKey, openrouter: cs.openrouterApiKey, groq: cs.groqApiKey, mistral: cs.mistralApiKey, cohere: cs.cohereApiKey, siliconflow: cs.siliconflowApiKey, custom: cs.customApiKey };
        const modelMap = { openai: cs.openaiModel, deepseek: cs.deepseekModel, qwen: cs.qwenModel, minimax: cs.minimaxModel, openrouter: cs.openrouterModel, groq: cs.groqModel, mistral: cs.mistralModel, cohere: cs.cohereModel, siliconflow: cs.siliconflowModel, custom: cs.customModel };
        const baseUrl = baseUrlMap[provider];
        const apiKey = apiKeyMap[provider];
        if (!baseUrl) throw new Error(t("testNoBaseUrl"));
        if (!apiKey && provider !== "custom") throw new Error(t("testNoApiKey"));
        const headers = { "Content-Type": "application/json" };
        if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
        const res = await doFetch(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
          method: "POST", headers,
          body: JSON.stringify({ model: modelMap[provider], messages: [{ role: "user", content: testPrompt }], temperature: 0, max_tokens: 10 })
        });
        if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error?.message || `HTTP ${res.status}`); }
        result = (await res.json()).choices?.[0]?.message?.content?.trim() || "OK";
      }

      statusEl.textContent = t("testConnected", result.substring(0, 20));
      statusEl.style.color = "#080";
      setTimeout(() => { statusEl.textContent = ""; statusEl.style.color = ""; }, 4000);
    } catch (err) {
      const msg = err.name === "AbortError" ? t("testTimeout") : err.message;
      statusEl.textContent = `✗ ${msg}`;
      statusEl.style.color = "#c00";
      setTimeout(() => { statusEl.textContent = ""; statusEl.style.color = ""; }, 5000);
    }
  }

  ["gemini","openai","claude","deepseek","qwen","minimax","openrouter","groq","mistral","cohere","siliconflow","ollama","custom"].forEach(p => {
    document.getElementById(`test-${p}`)?.addEventListener("click", () => testAIProvider(p));
  });

  // ---- Pinboard token: real-time format validation ----
  function isValidTokenFormat(token) {
    // Format: username:TOKEN — both parts non-empty, no spaces, token ≥ 8 chars
    if (!token) return null; // empty — no warning
    const idx = token.indexOf(":");
    if (idx < 1) return false;
    const user = token.slice(0, idx);
    const key = token.slice(idx + 1);
    return user.length > 0 && key.length >= 8 && !/\s/.test(token);
  }

  const tokenInput = document.getElementById("opt-pinboard-token");
  const tokenWarn = document.getElementById("token-format-warn");
  function validateTokenField() {
    const val = tokenInput.value.trim();
    const valid = isValidTokenFormat(val);
    tokenWarn.classList.toggle("visible", valid === false);
  }
  tokenInput?.addEventListener("input", validateTokenField);
  tokenInput?.addEventListener("blur", validateTokenField);
  validateTokenField(); // run once on load

  // ---- Test Pinboard API token (via background to avoid native auth dialog) ----
  document.getElementById("test-pinboard-token")?.addEventListener("click", async () => {
    const btn = document.getElementById("test-pinboard-token");
    const statusEl = document.getElementById("test-pinboard-status");
    const token = tokenInput.value.trim();
    if (isValidTokenFormat(token) === false || !token) {
      statusEl.textContent = `✗ ${t("loginInvalidFormat")}`;
      statusEl.style.color = "#c00";
      setTimeout(() => { statusEl.textContent = ""; statusEl.style.color = ""; }, 4000);
      return;
    }
    btn.disabled = true;
    statusEl.textContent = t("testTesting");
    statusEl.style.color = "";
    try {
      const resp = await chrome.runtime.sendMessage({ type: "test_pinboard_token", token });
      if (resp?.ok) {
        statusEl.textContent = t("testConnected", token.split(":")[0]);
        statusEl.style.color = "#080";
      } else if (resp?.error === "timeout") {
        statusEl.textContent = `✗ ${t("testTimeout")}`;
        statusEl.style.color = "#c00";
      } else if (resp?.error === "network") {
        statusEl.textContent = `✗ ${t("networkError")}`;
        statusEl.style.color = "#c00";
      } else {
        statusEl.textContent = `✗ ${t("loginFailed")}`;
        statusEl.style.color = "#c00";
      }
    } catch (_) {
      statusEl.textContent = `✗ ${t("networkError")}`;
      statusEl.style.color = "#c00";
    } finally {
      btn.disabled = false;
      setTimeout(() => { statusEl.textContent = ""; statusEl.style.color = ""; }, 5000);
    }
  });

  // ---- Theme preset buttons ----
  function updateThemePresetButtons() {
    const css = document.getElementById("opt-custom-css").value;
    document.querySelectorAll(".theme-preset-btn").forEach(btn => {
      const key = btn.dataset.theme;
      if (!key) {
        // "None" button: active when CSS is empty
        btn.classList.toggle("active", !css.trim());
      } else {
        // Adaptive themes: match either light or dark variant
        const adaptivePinboard = {
          solarized: ["solarized-light", "solarized-dark"],
          catppuccin: ["catppuccin-latte", "catppuccin-mocha"]
        };
        const keysToCheck = adaptivePinboard[key] ? adaptivePinboard[key] : [key];
        const isActive = keysToCheck.some(k => {
          const theme = PINBOARD_THEMES[k];
          return theme && css.trim() === theme.css.trim();
        });
        btn.classList.toggle("active", isActive);
      }
    });
  }
  updateThemePresetButtons();

  document.querySelectorAll(".theme-preset-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.theme;
      const cssEl = document.getElementById("opt-custom-css");
      if (!key) {
        cssEl.value = "";
      } else {
        // Adaptive themes: resolve to light/dark variant based on current theme mode
        const adaptivePinboard = {
          solarized: ["solarized-light", "solarized-dark"],
          catppuccin: ["catppuccin-latte", "catppuccin-mocha"]
        };
        let themeKey = key;
        if (adaptivePinboard[key]) {
          const mode = document.getElementById("opt-theme").value;
          const prefersDark = mode === "dark" || (mode === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
          themeKey = adaptivePinboard[key][prefersDark ? 1 : 0];
        }
        const theme = PINBOARD_THEMES[themeKey];
        if (theme) cssEl.value = theme.css;
      }
      updateThemePresetButtons();
      updateSavedThemeButtons();
      // Update tracked key and apply options page theme instantly
      currentPresetKey = key || "";
      applyOptionsPageTheme(currentPresetKey, document.getElementById("opt-theme").value);
      scheduleAutoSave();
    });
  });

  // Update active state and options page theme when user manually edits CSS
  document.getElementById("opt-custom-css").addEventListener("input", () => {
    updateThemePresetButtons();
    updateSavedThemeButtons();
    // Detect if edited CSS matches a built-in preset, update options page theme accordingly
    const css = document.getElementById("opt-custom-css").value;
    let matchedKey = "";
    for (const [key, theme] of Object.entries(PINBOARD_THEMES)) {
      if (theme.css.trim() === css.trim()) { matchedKey = key; break; }
    }
    currentPresetKey = matchedKey;
    applyOptionsPageTheme(currentPresetKey, document.getElementById("opt-theme").value);
  });

  // ---- Saved custom themes ----
  let savedThemes = []; // [{ name: "My Theme", css: "..." }, ...]

  async function loadSavedThemes() {
    savedThemes = await syncGetLarge("savedThemes", []);
    // One-time migration from local
    if (!savedThemes.length) {
      const local = await chrome.storage.local.get({ savedThemes: [] });
      if (local.savedThemes?.length) {
        savedThemes = local.savedThemes;
        await syncSetLarge("savedThemes", savedThemes);
        await chrome.storage.local.remove("savedThemes");
      }
    }
    renderSavedThemes();
  }

  async function persistSavedThemes() {
    await syncSetLarge("savedThemes", savedThemes);
  }

  function renderSavedThemes() {
    const container = document.getElementById("saved-themes-list");
    const section = document.getElementById("saved-themes-section");
    while (container.firstChild) container.removeChild(container.firstChild);
    section.style.display = savedThemes.length ? "" : "none";
    const currentCSS = document.getElementById("opt-custom-css").value;
    savedThemes.forEach((theme, idx) => {
      const wrap = document.createElement("span");
      wrap.className = "saved-theme-wrap";
      const btn = document.createElement("button");
      btn.className = "btn btn-sm saved-theme-btn";
      btn.textContent = theme.name;
      if (currentCSS.trim() === theme.css.trim()) btn.classList.add("active");
      btn.addEventListener("click", () => {
        document.getElementById("opt-custom-css").value = theme.css;
        updateThemePresetButtons();
        updateSavedThemeButtons();
        // Custom saved themes do NOT affect options page styling — clear preset key
        currentPresetKey = "";
        applyOptionsPageTheme("", document.getElementById("opt-theme").value);
        scheduleAutoSave();
      });
      const del = document.createElement("button");
      del.className = "saved-theme-del";
      del.textContent = "\u00d7";
      del.title = t("deleteTheme");
      del.addEventListener("click", async (e) => {
        e.stopPropagation();
        savedThemes.splice(idx, 1);
        await persistSavedThemes();
        renderSavedThemes();
      });
      wrap.append(btn, del);
      container.appendChild(wrap);
    });
  }

  function updateSavedThemeButtons() {
    const currentCSS = document.getElementById("opt-custom-css").value;
    document.querySelectorAll(".saved-theme-btn").forEach(btn => {
      const theme = savedThemes.find(t => t.name === btn.textContent);
      btn.classList.toggle("active", theme && currentCSS.trim() === theme.css.trim());
    });
  }

  document.getElementById("save-custom-theme").addEventListener("click", async () => {
    const css = document.getElementById("opt-custom-css").value.trim();
    if (!css) return;
    const name = prompt(t("themeName"));
    if (!name || !name.trim()) return;
    const trimmedName = name.trim();
    const existing = savedThemes.findIndex(th => th.name === trimmedName);
    if (existing >= 0) {
      if (!confirm(t("themeOverwrite", trimmedName))) return;
      savedThemes[existing].css = css;
    } else {
      savedThemes.push({ name: trimmedName, css });
    }
    await persistSavedThemes();
    renderSavedThemes();
  });

  await loadSavedThemes();

  // ---- Chrome shortcuts link ----
  document.getElementById("open-shortcuts-link")?.addEventListener("click", (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
  });
  document.getElementById("open-shortcuts-link-rl")?.addEventListener("click", (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
  });
});
