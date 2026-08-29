function pbpExactOriginPermissionSnapshot(origins) {
  const exact = [];
  for (const pattern of Array.isArray(origins) ? origins : []) {
    try {
      const url = new URL(pattern);
      if ((url.protocol === "https:" || url.protocol === "http:") &&
          url.hostname && !url.hostname.includes("*") &&
          !url.username && !url.password && url.pathname === "/*" &&
          !url.search && !url.hash && !exact.includes(pattern)) exact.push(pattern);
    } catch (_) {}
  }
  return exact;
}

async function pbpRevokeLegacyAllSitesPermission(permissionApi) {
  const wildcard = "*://*/*";
  const granted = await permissionApi.getAll();
  const snapshot = pbpExactOriginPermissionSnapshot(granted && granted.origins);
  await permissionApi.remove({ origins: [wildcard] });
  if (snapshot.length) {
    try { await permissionApi.request({ origins: snapshot }); } catch (_) {}
  }

  const missing = [];
  for (const origin of snapshot) {
    try {
      if (!(await permissionApi.contains({ origins: [origin] }))) missing.push(origin);
    } catch (_) { missing.push(origin); }
  }
  let wildcardAbsent = false;
  try { wildcardAbsent = !(await permissionApi.contains({ origins: [wildcard] })); } catch (_) {}
  if (!wildcardAbsent) missing.push(wildcard);
  return { ok: wildcardAbsent && missing.length === 0, missing, wildcardAbsent };
}

// Persist overlay CSS without touching UI state. Callers own the one status
// message shown to the user; import callers can still observe genuine errors.
async function saveOverlayWithFallback(value) {
  const ssl = (typeof globalThis !== "undefined" && globalThis.__pbpTestSyncSetLarge)
    ? globalThis.__pbpTestSyncSetLarge : syncSetLarge;
  // Oversize CSS (legacy themes/imports predating the 50 KB form gate) must
  // never be refused on a restore path — but the 50 KB cap is a SYNC-area
  // policy. When settings sync is off, the local area stores the value
  // directly (no per-item limit) and the local-route readers never consult
  // the fallback key, so the fallback write would make the CSS invisible;
  // fall through to the normal path there. The form path still rejects
  // oversize input via pbpSaveOptionsSnapshot's assertOverlay.
  if (pbpOverlayByteLength(value) > OVERLAY_BYTE_LIMIT &&
      (await getSettingsStorage()) !== chrome.storage.local) {
    // Deliberately a plain string, not a freshness record: this oversize CSS
    // exists nowhere else, so it must never be auto-dropped in favor of a
    // later foreign sync commit.
    await chrome.storage.local.set({ customOverlayCSS_localFallback: value });
    return { fellBackToLocal: true };
  }
  try {
    await ssl("customOverlayCSS", value);
    await chrome.storage.local.remove("customOverlayCSS_localFallback");
    return { fellBackToLocal: false };
  } catch (e) {
    if (!(e && e.pbpFellBackToLocal) && !/QUOTA|quota/i.test(e && e.message || "")) throw e;
    // When syncSetLarge itself fell back it already stored a freshness-
    // stamped fallback record; rewriting it as a plain string would classify
    // as permanently "fresh" and shadow every future cloud commit. Only the
    // test seam (quota message without the marker) still stores the raw
    // value directly.
    if (!(e && e.pbpFellBackToLocal)) {
      await chrome.storage.local.set({ customOverlayCSS_localFallback: value });
    }
    return { fellBackToLocal: true };
  }
}

async function pbpRefreshSyncLocalFallbackStatus() {
  const status = $id("opt-sync-local-only");
  if (!status) return [];
  let local;
  try {
    local = await chrome.storage.local.get(["optSyncEnabled", ...PBP_LARGE_FALLBACK_KEYS]);
  } catch (_) {
    return [];
  }
  const fields = local.optSyncEnabled === true
    ? pbpDetectLargeLocalFallbacks(local) : [];
  status.hidden = fields.length === 0;
  status.textContent = fields.length
    ? t("syncLocalOnlyStatus", fields.map((key) => t(pbpLargeFallbackFieldLabel(key))).join(", "))
    : "";
  return fields;
}

// One auto-save transaction with explicit mutable baselines. Ordinary
// settings commit first; an invalid/failed overlay cannot roll their baseline
// back or cause an unrelated stale form snapshot to be retried later.
async function pbpSaveOptionsSnapshot(state, data, overlayValue, {
  persist,
  saveOverlay,
  assertOverlay,
  onSettingsSaved,
}) {
  const settingsDelta = pbpSettingsDelta(data, state.settings);
  const overlayChanged = overlayValue !== state.overlay;
  const res = Object.keys(settingsDelta).length
    ? await persist(settingsDelta)
    : { ok: true, fellBackToLocal: false };
  if (!res.ok) throw res.error || new Error("settings save failed");
  if (Object.keys(settingsDelta).length) {
    state.settings = Object.assign({}, state.settings, settingsDelta);
    if (onSettingsSaved) onSettingsSaved(settingsDelta);
  }

  let overlay = { fellBackToLocal: false };
  if (overlayChanged) {
    assertOverlay(overlayValue);
    overlay = await saveOverlay(overlayValue);
    state.overlay = overlayValue;
  }
  return {
    settingsDelta,
    overlayChanged,
    fellBackToLocal: !!(res.fellBackToLocal || overlay.fellBackToLocal),
  };
}

function pbpQueueOptionsSave(state, save) {
  if (state.suspended) return state.chain;
  const run = state.chain.then(save, save);
  // Return the real outcome so the caller can report it, while keeping the
  // stored queue tail fulfilled so one unexpected exception cannot poison all
  // later saves or a bulk-import drain.
  state.chain = run.catch(() => {});
  return run;
}

let _tagGovVisibleAccount = "";

// Enable decorative transitions only after the initial page has painted.
if (typeof requestAnimationFrame === "function") {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    document.documentElement.classList.add("motion-ready");
  }));
}

function _tagGovUiOwned(account) {
  const card = $id("tag-gov-progress");
  return !!account && _tagGovVisibleAccount === account && card?.dataset.account === account;
}

function _tagGovClaimProgress(account) {
  const card = $id("tag-gov-progress");
  if (card && account && _tagGovVisibleAccount === account) card.dataset.account = account;
}

function _tagGovSetProgress(value, expectedAccount = "") {
  if (expectedAccount && !_tagGovUiOwned(expectedAccount)) return;
  const percent = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  const fill = $id("tag-gov-progress-fill");
  const bar = $id("tag-gov-progress-bar");
  if (fill) fill.style.width = percent + "%";
  if (bar) bar.setAttribute("aria-valuenow", String(percent));
}

document.addEventListener("DOMContentLoaded", async () => {
  // Hydrate declarative icon slots (same contract as popup.js): static
  // PBP_ICONS constants only, never page content.
  document.querySelectorAll(".btn-ic[data-ic]").forEach(s => { s.innerHTML = PBP_ICONS[s.dataset.ic] || ""; });
  initI18n();
  applyI18n();

  function pbpBindLooseLabels(root) {
    (root || document).querySelectorAll("label.bl:not([for])").forEach((label) => {
      const box = label.parentElement;
      const control = box && box.querySelector("input[id], select[id], textarea[id]");
      if (control) label.htmlFor = control.id;
    });
  }
  pbpBindLooseLabels(document);

  // W3: Lazy-init scaffolding for the appearance panel.
  // Hoisted to the top of DOMContentLoaded so the tab-switch handler and the
  // saved-tab restore (both below) can safely reference _initAppearancePanel.
  // The actual render depends on currentPresetKey + PINBOARD_THEMES, which
  // aren't initialized until the settings load completes much further down.
  // Until that bootstrap finishes, we record a pending request and flush it
  // when _appearancePanelBootReady flips to true.
  let _appearanceInited = false;
  let _appearancePanelBootReady = false;
  let _appearancePendingInit = false;
  let _pinboardThemesPromise = null;
  function _loadPinboardThemes() {
    if (_pinboardThemesPromise) return _pinboardThemesPromise;
    _pinboardThemesPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "pinboard-themes.js";
      s.onload = () => resolve();
      s.onerror = () => {
        _pinboardThemesPromise = null; // allow retry on transient failure
        reject(new Error("Failed to load pinboard-themes.js"));
      };
      document.head.appendChild(s);
    });
    return _pinboardThemesPromise;
  }
  async function _initAppearancePanel() {
    if (_appearanceInited) return;
    if (!_appearancePanelBootReady) { _appearancePendingInit = true; return; }
    _appearanceInited = true;
    try {
      await _loadPinboardThemes();
    } catch (e) {
      console.warn("[options] pinboard-themes lazy load failed:", e.message);
      _appearanceInited = false; // allow retry on next switch
      return;
    }
    renderPresetPreview();
  }

  // ---- Tags panel lazy-init ----
  let _tagGovInited = false;
  async function _initTagGovPanel() {
    if (_tagGovInited) return;
    _tagGovInited = true;
    const initialAuth = await getTagGovAuth();
    _tagGovVisibleAccount = initialAuth?.account || "";
    const overview = $id("tag-gov-overview");
    // Bind Refresh UNCONDITIONALLY before the first load: when the initial
    // loadTagCounts failed (no token yet, offline), the gated binding left a dead
    // Refresh button and no recovery short of a full page reload (_tagGovInited
    // never resets). Static #tag-gov-refresh from options.html (data-i18n
    // localized); updateTagGovOverview preserves it across re-renders.
    const refreshBtn = overview ? overview.querySelector("#tag-gov-refresh") : null;
    if (refreshBtn) refreshBtn.addEventListener("click", async () => {
      refreshBtn.disabled = true;
      const auth = await getTagGovAuth();
      if (!auth) { refreshBtn.disabled = false; return; }
      const aiKey = pbpAccountStorageKey("_tagGovAiGroups", auth.account);
      await chrome.storage.local.set({ [aiKey]: { account: auth.account, groups: [], ts: Date.now() } });
      const fresh = await loadTagCounts(true, auth.account);
      if (fresh) updateTagGovOverview(fresh);
      else _tagGovShowLoadFailed();
      await renderTagGov();
      await renderLowCountTags();
      refreshBtn.disabled = false;
    });
    const counts = await loadTagCounts();
    if (counts && overview) {
      updateTagGovOverview(counts);
    } else if (overview) {
      _tagGovShowLoadFailed();
    }
    // Restore the last run's outcome if it left anything needing attention —
    // all-ok runs are not resurrected (no nagging).
    if (_tagGovUnfinishedBatches === 0) {
      const auth = await getTagGovAuth();
      const lastRunKey = pbpAccountStorageKey("_tagGovLastRun", auth?.account);
      const storedLastRun = lastRunKey ? (await chrome.storage.local.get(lastRunKey))[lastRunKey] : null;
      if (auth && !(await getTagGovAuth(auth.account))) return;
      const lr = _tagGovOwned(storedLastRun, auth?.account);
      if (lr && (lr.fail > 0 || lr.skipped > 0 || (lr.problems && lr.problems.length))) {
        await getTagGovToken(); // seed _tagGovUser so restored delete rows render t:-page links
        _tagGovProblems.length = 0;
        _tagGovProblems.push(...(lr.problems || []));
        const card = $id("tag-gov-progress");
        const pt = $id("tag-gov-progress-text");
        _tagGovClaimProgress(auth.account);
        if (card) card.hidden = false;
        _tagGovSetProgress(100, auth.account);
        if (pt) {
          pt.textContent = t("tagGovLastRun", new Date(lr.ts).toLocaleString()) + " "
            + t("tagGovDoneSummary", String(lr.ok), String(lr.fail))
            + (lr.skipped > 0 ? " · " + t("tagGovSkippedSummary", String(lr.skipped)) : "");
        }
        _tagGovSetProgressBtn("dismiss", auth.account);
        renderTagGovProblems(auth.account);
      }
    }

    // Link the bundles note to the user's bundles page on pinboard.in
    // (username = the part of the API token before the colon).
    const bundlesWarn = $id("tag-gov-bundles-warn");
    if (bundlesWarn && !bundlesWarn.querySelector("a")) {
      const user = (await getTagGovToken()).split(":")[0];
      if (user) {
        const a = document.createElement("a");
        a.href = "https://pinboard.in/u:" + encodeURIComponent(user) + "/bundles/";
        a.target = "_blank";
        a.rel = "noopener";
        a.textContent = "pinboard.in/u:" + user + "/bundles/";
        bundlesWarn.appendChild(document.createTextNode(" "));
        bundlesWarn.appendChild(a);
      }
    }
    await renderTagGov();
    await renderLowCountTags();
  }

  let _tagGovAccountReloadTail = Promise.resolve();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (!_tagGovInited || (area !== "sync" && area !== "local")
        || !(changes.pinboardToken || changes.syncApiKeys || changes.optSyncEnabled)) return;
    _tagGovAccountReloadTail = _tagGovAccountReloadTail.then(async () => {
      let state;
      try {
        state = await pbpReadSecretSyncState({ includeGlobalWhenSyncOff: true, persistInferredState: false });
      } catch (_) {
        state = null;
      }
      if (state && !pbpAuthStorageChangeIsRelevant(changes, area, state)) return;
      const auth = state ? await getTagGovAuth() : null;
      const nextAccount = auth?.account || "";
      if (nextAccount === _tagGovVisibleAccount) return;
      _tagGovVisibleAccount = nextAccount;
      if (_tagGovUnfinishedBatches === 0) _tagGovProblems.length = 0;
      _tagGovUser = auth?.account || "";
      $id("tag-gov-groups")?.replaceChildren();
      $id("tag-gov-lowcount-list")?.replaceChildren();
      $id("tag-gov-problems")?.replaceChildren();
      const progress = $id("tag-gov-progress");
      if (progress) {
        progress.hidden = true;
        delete progress.dataset.account;
      }
      $id("tag-gov-bundles-warn")?.querySelector("a")?.remove();
      if (!auth) {
        _tagGovShowLoadFailed();
        return;
      }
      const counts = await loadTagCounts(false, auth.account);
      if (_tagGovVisibleAccount !== auth.account || !(await getTagGovAuth(auth.account))) return;
      if (counts) updateTagGovOverview(counts);
      else _tagGovShowLoadFailed();
      await renderTagGov();
      await renderLowCountTags();
      if (_tagGovVisibleAccount !== auth.account) return;
      const warn = $id("tag-gov-bundles-warn");
      if (warn && !warn.querySelector("a")) {
        const a = document.createElement("a");
        a.href = "https://pinboard.in/u:" + encodeURIComponent(auth.account) + "/bundles/";
        a.target = "_blank";
        a.rel = "noopener";
        a.textContent = "pinboard.in/u:" + auth.account + "/bundles/";
        warn.appendChild(document.createTextNode(" "));
        warn.appendChild(a);
      }
    }).catch(() => {});
  });

  // ---- Tab switching ----
  const _tabBtns = [...document.querySelectorAll(".tab-btn")];
  const mobileTabSelect = $id("mobile-tab-select");
  // "Reset This Tab" only makes sense on panels that HAVE reset defaults —
  // Storage is cache management with its own clear buttons, so the link is
  // noise there (real-device feedback). PANEL_DEFAULTS is declared further
  // down (TDZ at initial activation time), hence the late-bound ref: until
  // it's assigned the button keeps its markup default (visible), and the
  // assignment site below re-syncs for the initially active panel.
  let _resetDefaultsRef = null;
  function _syncResetBtnVisibility(panel) {
    const b = $id("reset-panel-btn");
    if (b && _resetDefaultsRef) b.hidden = !_resetDefaultsRef[panel];
  }
  function activateTab(btn) {
    _tabBtns.forEach((b) => { b.classList.remove("active"); b.setAttribute("aria-selected", "false"); b.tabIndex = -1; });
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    btn.setAttribute("aria-selected", "true");
    btn.tabIndex = 0;
    if (mobileTabSelect) mobileTabSelect.value = btn.dataset.panel;
    $id(`panel-${btn.dataset.panel}`).classList.add("active");
    _syncResetBtnVisibility(btn.dataset.panel);
    // W3: lazy-init expensive per-panel rendering on first view.
    if (btn.dataset.panel === "appearance") _initAppearancePanel();
    if (btn.dataset.panel === "tags") _initTagGovPanel();
    if (btn.dataset.panel === "storage") renderStoragePanel();
    if (btn.dataset.panel === "vocab") renderVocabPanel();
    history.replaceState(null, "", "#" + btn.dataset.panel);
  }
  _tabBtns.forEach((btn, i) => {
    btn.tabIndex = btn.classList.contains("active") ? 0 : -1;
    btn.addEventListener("click", () => activateTab(btn));
    btn.addEventListener("keydown", (e) => {
      let n = -1;
      if (e.key === "ArrowDown") n = (i + 1) % _tabBtns.length;
      else if (e.key === "ArrowUp") n = (i - 1 + _tabBtns.length) % _tabBtns.length;
      else return;
      e.preventDefault();
      activateTab(_tabBtns[n]);
      _tabBtns[n].focus();
    });
  });
  mobileTabSelect?.addEventListener("change", () => {
    const btn = document.querySelector(`.tab-btn[data-panel="${mobileTabSelect.value}"]`);
    if (btn) activateTab(btn);
  });

  // Restore active tab after language switch
  const savedTab = sessionStorage.getItem("activeTab");
  if (savedTab) {
    sessionStorage.removeItem("activeTab");
    const btn = document.querySelector(`.tab-btn[data-panel="${savedTab}"]`);
    if (btn) btn.click();
  }

  // Deep-link: options.html#<panel> activates that tab on load and when a
  // reused options tab is retargeted to a different hash.
  function _activateHashPanel() {
    const _hashPanel = (location.hash || "").replace(/^#/, "");
    if (!_hashPanel) return;
    const _dlBtn = document.querySelector(`.tab-btn[data-panel="${_hashPanel}"]`);
    if (_dlBtn) _dlBtn.click();
  }
  _activateHashPanel();
  window.addEventListener("hashchange", _activateHashPanel);

  // ---- Storage management (C2-6) ----
  // Category checkboxes over the reclaimable-cache allowlist in shared.js.
  // Defaults: large+cheap-to-rebuild caches checked; tag cache off (clearing it
  // briefly slows tag autocomplete).
  const STORAGE_CATS = [
    { id: "jina", labelKey: "storageCatJina", defaultOn: true },
    { id: "urls", labelKey: "storageCatUrls", defaultOn: true },
    { id: "tags", labelKey: "storageCatTags", defaultOn: false },
    { id: "misc", labelKey: "storageCatMisc", defaultOn: true },
  ];
  function showStorageStatus(msg, kind) {
    const el = $id("storage-status");
    if (!el) return;
    el.textContent = msg;
    // Reuse the AA-tuned .et-test-status colors (.ok/.err/.warn) already themed
    // across all presets, rather than the popup-only status-msg classes.
    el.className = "et-test-status " + (kind || "");
    el.classList.remove("hidden");
  }
  async function renderStoragePanel() {
    const host = $id("storage-cats");
    if (!host) return;
    let measured = null;
    try { measured = await pbpMeasureLocalStorage(); } catch (_) { measured = null; }
    host.textContent = "";
    if (!measured) {
      const p = document.createElement("p");
      p.className = "hint";
      p.textContent = t("storageMeasureFailed");
      host.appendChild(p);
      return;
    }
    let total = 0;
    STORAGE_CATS.forEach((c) => {
      const m = measured[c.id] || { keys: [], bytes: 0 };
      total += m.bytes;
      const row = document.createElement("div");
      row.className = "fg";
      const label = document.createElement("label");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.className = "storage-cat-cb";
      cb.dataset.cat = c.id;
      // Empty categories must not present as "checked": a disabled checkbox
      // still matches the :checked collection query used by "clear selected".
      cb.checked = c.defaultOn && m.keys.length > 0;
      cb.disabled = m.keys.length === 0;
      const span = document.createElement("span");
      span.textContent = `${t(c.labelKey)} — ${pbpFormatBytes(m.bytes)} (${m.keys.length})`;
      label.appendChild(cb);
      label.appendChild(document.createTextNode(" "));
      label.appendChild(span);
      row.appendChild(label);
      host.appendChild(row);
    });
    const totalP = document.createElement("p");
    totalP.className = "hint";
    totalP.textContent = t("storageReclaimable", pbpFormatBytes(total));
    host.appendChild(totalP);
  }
  const _storageClearBtn = $id("storage-clear-btn");
  if (_storageClearBtn) {
    _storageClearBtn.addEventListener("click", async () => {
      const cats = [...document.querySelectorAll(".storage-cat-cb:checked")].map((cb) => cb.dataset.cat);
      if (!cats.length) { showStorageStatus(t("storageNoneSelected"), "warn"); return; }
      _storageClearBtn.disabled = true;
      let freed = 0;
      try {
        freed = await pbpReclaimLocalStorage(cats);
      } catch (_) {
        showStorageStatus(t("storageClearFailed"), "err");
        _storageClearBtn.disabled = false;
        return;
      }
      await renderStoragePanel();
      _storageClearBtn.disabled = false;
      showStorageStatus(t("storageCleared", pbpFormatBytes(freed)), "ok");
    });
  }

  // ---- Reset current tab to defaults ----
  const PANEL_DEFAULTS = {
    general: {
      fields: {
        "opt-lang": "auto",
        "opt-backup-include-highlights": true,
        "notify-quick-save": true, "notify-read-later": true, "notify-tab-set": true,
        "notify-batch-save": true, "notify-errors": true
      },
      skip: ["opt-pinboard-token", "opt-sync-enabled"] // never reset token or sync toggle
    },
    popup: {
      fields: {
        "opt-check-bookmark-status": true, "opt-auto-close": true, "offline-queue-enabled": true,
        "opt-show-search": false, "opt-show-recent": false, "opt-show-badge": false,
        "opt-show-suggest-tags": true,
        "opt-show-ai-summary": true, "opt-show-ai-tags": true,
        "opt-show-quick-links": true, "opt-show-quick-row": true,
        "opt-popup-width-custom": "550"
      },
      radios: { "popup-width-preset": "550" },
      nested: {
        urlClean: {
          "opt-urlclean-enabled": true, "opt-urlclean-on-open": true, "opt-urlclean-on-paste": true,
          "opt-urlclean-aggressive": false, "opt-urlclean-custom": [], "opt-urlclean-exclude": []
        }
      }
    },
    bookmarks: {
      fields: {
        "opt-private-default": false, "opt-private-incognito": true, "opt-readlater-default": false,
        "opt-auto-description": true, "opt-blockquote": true, "opt-include-referrer": false,
        "opt-respect-tag-case": true, "opt-tag-presets": "",
        "opt-bgsave-merge": true, "opt-bgsave-skip": false, "opt-bgsave-overwrite": false
      },
      radios: { "tag-sync-mode": "cached" }
    },
    ai: {
      fields: {
        "opt-ai-provider": "gemini",
        "opt-gemini-model": "gemini-3.5-flash-lite", "opt-openai-model": "gpt-5.4-nano",
        "opt-openai-baseurl": "https://api.openai.com/v1", "opt-claude-model": "claude-haiku-4-5",
        "opt-deepseek-model": "deepseek-v4-flash", "opt-qwen-model": "qwen-flash",
        "opt-minimax-model": "MiniMax-M2", "opt-openrouter-model": "openai/gpt-oss-20b:free",
        "opt-groq-model": "llama-3.1-8b-instant", "opt-mistral-model": "mistral-small-latest",
        "opt-cohere-model": "command-r7b-12-2024", "opt-siliconflow-model": "Qwen/Qwen3-8B",
        "opt-zhipu-model": "glm-4.7-flash", "opt-kimi-model": "kimi-k2.6",
        "opt-ollama-baseurl": "http://localhost:11434", "opt-ollama-model": "llama3.2",
        "opt-custom-name": "Custom", "opt-custom-baseurl": "", "opt-custom-model": ""
      },
      skip: ["opt-gemini-key","opt-openai-key","opt-claude-key","opt-deepseek-key","opt-qwen-key","opt-minimax-key","opt-openrouter-key","opt-groq-key","opt-mistral-key","opt-cohere-key","opt-siliconflow-key","opt-zhipu-key","opt-kimi-key","opt-custom-key","opt-jina-key"]
    },
    "ai-behavior": {
      fields: {
        "opt-ai-tag-lang": "en", "opt-ai-summary-lang": "auto", "opt-ai-cache-duration": "60",
        "opt-ai-auto-tags": false, "opt-ai-use-transcript": true, "opt-ai-tag-separator": "-",
        "opt-custom-tag-prompt": "", "opt-custom-summary-prompt": ""
      },
      radios: { "ai-content-source": "local" }
    },
    reader: {
      fields: {
        "opt-preview-ai-enabled": true, "opt-preview-skim": false, "opt-preview-ai-model": "",
        "translate-target-lang": "auto", "translate-target-lang-custom": "",
        "opt-translate-glossary": "", "opt-selection-trigger": "icon",
        // Video pages (moved here from the Export tab, settings batch A1):
        // defaults mirror shared.js mdVideoLangPref / mdVideoDarkScheme /
        // mdVideoPauseOnLookup / mdVideoUseLogin.
        "opt-md-video-lang": "", "opt-md-video-dark": false,
        "opt-md-video-pause-lookup": true, "opt-md-video-use-login": true
      }
    },
    quick: {
      fields: {
        "qs-auto-notes": true, "qs-blockquote": true, "qs-default-tags": "", "qs-ai-tags": false, "qs-ai-summary": false,
        "rl-auto-notes": true, "rl-blockquote": true, "rl-default-tags": "", "rl-ai-tags": false, "rl-ai-summary": false,
        "opt-batch-tag-enabled": true, "opt-batch-tag": "batch_saved",
        "batch-ai-tags": false, "batch-ai-summary": false, "batch-skip-existing": false
      }
    },
    markdown: {
      fields: {
        "opt-md-frontmatter": true, "opt-md-extended-meta": true,
        "opt-md-image-policy": "keep", "opt-md-include-toc": false,
        "opt-md-include-hl": true
      }
    },
    archive: {
      // Credentials live ONLY in skip: applyPanelReset iterates fields and
      // never consults skip, so listing them in both cleared the S3 keys
      // while the confirm dialog promised they were kept.
      fields: {
        "opt-wayback-enabled": false, "opt-wayback-batch": false,
        "opt-wayback-skip-private": true
      },
      skip: ["opt-wayback-s3key", "opt-wayback-s3secret"]
    },
    appearance: {
      fields: {
        "opt-theme": "auto", "opt-popup-follow-theme": true, "opt-custom-font": "",
        "opt-custom-css": ""
      },
      // The active Pinboard preset is closure state (currentPresetKey), not a
      // form control, so the fields walk cannot reach it (Codex r2 M3):
      // applyPreset("") clears it, refreshes the preset buttons/preview and
      // re-applies the page theme, then autosaves. applyPreset is a hoisted
      // function declaration in this same scope.
      after: () => applyPreset("")
    },
    tags: {
      fields: { "opt-tag-sort-by-pop": true },
      skip: []
    },
    vocab: {
      fields: {
        "dict-echo-enabled": true,
        "dict-anki-deck": "Pinboard Vocab",
        "dict-anki-port": "8765"
      },
      skip: ["dict-anki-key", "dict-eudic-token"]
    }
  };
  if (typeof window !== "undefined") window.__PBP_PANEL_DEFAULTS = PANEL_DEFAULTS;
  // Late-bind for _syncResetBtnVisibility (declared before PANEL_DEFAULTS —
  // see comment there), then re-sync the panel that was activated on load.
  _resetDefaultsRef = PANEL_DEFAULTS;
  { const _ab = document.querySelector(".tab-btn.active"); if (_ab) _syncResetBtnVisibility(_ab.dataset.panel); }

  // Gray out the Obsidian vault/folder inputs when the master toggle is off.
  // Safe to call on any page/panel (guards on element existence); programmatic
  // .checked changes (load, reset) don't fire 'change', so call it explicitly.
  // Render one settings card per export target from the registry. Inputs use
  // data-et="<id>.<key>" so saveSettings can collect them generically.
  function renderExportTargets(exportTargets) {
    const host = $id("export-targets");
    if (!host || typeof PBP_EXPORT_TARGETS === "undefined") return;
    host.innerHTML = "";
    exportTargets = exportTargets || {};
    pbpExportTargetIds().forEach((id) => {
      const row = PBP_EXPORT_TARGETS[id];
      const cfg = exportTargets[id] || {};

      const sec = document.createElement("div");
      sec.className = "accordion-section";
      const head = document.createElement("button");
      head.type = "button";
      head.className = "accordion-header";
      head.dataset.target = "et-" + id;
      head.setAttribute("aria-controls", head.dataset.target);
      const arrow = document.createElement("span");
      arrow.className = "accordion-arrow";
      const titleEl = document.createElement("span");
      titleEl.textContent = row.label;
      head.appendChild(arrow); head.appendChild(document.createTextNode(" ")); head.appendChild(titleEl);

      const card = document.createElement("div");
      card.className = "accordion-body export-target-card";
      card.id = "et-" + id;

      const enableLabel = document.createElement("label");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.dataset.et = id + ".enabled";
      cb.checked = !!cfg.enabled;
      const sp = document.createElement("span");
      sp.textContent = t("mdSendEnableTo").replace("{name}", row.label);
      enableLabel.appendChild(cb); enableLabel.appendChild(document.createTextNode(" ")); enableLabel.appendChild(sp);
      card.appendChild(enableLabel);

      (row.settings || []).forEach((s) => {
        if (s.type !== "text" && s.type !== "secret" && s.type !== "select") return;
        const wrap = document.createElement("div");
        wrap.className = "et-field";
        const lab = document.createElement("label");
        lab.className = "bl";
        lab.textContent = t(s.label);
        const inp = document.createElement(s.type === "select" ? "select" : "input");
        if (s.type !== "select") {
          inp.type = s.type === "secret" ? "password" : "text";
          inp.autocomplete = "off";
        }
        inp.id = id + "-" + s.key;
        lab.htmlFor = inp.id;
        inp.dataset.et = id + "." + s.key;
        if (s.type === "secret" || s.secret === true) {
          inp.dataset.secret = "1";
          inp.value = (typeof deobfuscateKey === "function") ? deobfuscateKey(cfg[s.key] || "") : (cfg[s.key] || "");
        } else if (s.type === "select") {
          (s.options || []).forEach((opt) => {
            const o = document.createElement("option");
            o.value = opt.value;
            o.textContent = t(opt.label);
            inp.appendChild(o);
          });
          inp.value = cfg[s.key] || s.default || ((s.options && s.options[0] && s.options[0].value) || "");
        } else {
          inp.value = cfg[s.key] || "";
        }
        if (s.placeholder) inp.placeholder = s.placeholder;
        wrap.appendChild(lab);
        // Secret fields get the same show/hide affordance as every other
        // credential in this page (AI keys, Pinboard token): the .key-wrap +
        // .key-toggle pair setupSecretToggles() binds by data-target. Without
        // it an export token was the only credential you could never re-read.
        if (s.type === "secret" || s.secret === true) {
          const keyWrap = document.createElement("span");
          keyWrap.className = "key-wrap";
          const toggle = document.createElement("button");
          toggle.type = "button";
          toggle.className = "key-toggle";
          toggle.dataset.target = inp.id;
          toggle.title = t("showHideKey");
          toggle.setAttribute("aria-label", t("showHideKey"));
          keyWrap.appendChild(inp);
          keyWrap.appendChild(toggle);
          wrap.appendChild(keyWrap);
        } else {
          wrap.appendChild(inp);
        }
        card.appendChild(wrap);
        // Mirror the runtime endpoint policy while the user edits the URL.
        if (id === "webhook" && s.key === "url") {
          const warn = document.createElement("p");
          warn.className = "hint hint-warn";
          warn.hidden = true;
          warn.textContent = t("mdTargetWebhookHttpWarn");
          const syncWarn = () => {
            warn.hidden = !(typeof pbpWebhookHttpWarn === "function" && pbpWebhookHttpWarn(inp.value.trim()));
          };
          inp.addEventListener("input", syncWarn);
          syncWarn();
          card.appendChild(warn);
        }
        // Same inline mirror for the Notion parent: warn while the pasted
        // value cannot yield a page id (the runtime would then send the raw
        // string and the API would answer 400/404).
        if (id === "notion" && s.key === "parent") {
          const warn = document.createElement("p");
          warn.className = "hint hint-warn";
          warn.hidden = true;
          warn.textContent = t("mdTargetNotionParentWarn");
          const syncWarn = () => {
            const v = inp.value.trim();
            warn.hidden = !v || !(typeof pbpNotionParseParentId === "function" && pbpNotionParseParentId(v) === "");
          };
          inp.addEventListener("input", syncWarn);
          syncWarn();
          card.appendChild(warn);
        }
      });

      if (row.onboarding) {
        const det = document.createElement("details");
        det.className = "et-onboarding";
        const sum = document.createElement("summary");
        sum.textContent = t("mdSendHowToSetUp");
        const p = document.createElement("p");
        p.className = "hint";
        p.textContent = t(row.onboarding);
        det.appendChild(sum); det.appendChild(p);
        card.appendChild(det);
      }
      if (row.precheckRequest) {
        const testWrap = document.createElement("div");
        testWrap.className = "et-field et-test";
        const testBtn = document.createElement("button");
        testBtn.type = "button";
        testBtn.className = "btn btn-sm";
        testBtn.textContent = t("mdSendTest");
        const testStatus = document.createElement("span");
        testStatus.className = "et-test-status";
        // Same live region the static #storage-status carries: the outcome
        // (permission refused, 401, reachable) arrives seconds after the click
        // and is otherwise announced to nobody. className is reassigned per run
        // below, which only rewrites the class attribute -- these survive it.
        testStatus.setAttribute("role", "status");
        testStatus.setAttribute("aria-live", "polite");
        testBtn.addEventListener("click", async () => {
          if (testBtn.disabled) return;
          const tokenInp = card.querySelector('[data-et="' + id + '.token"]');
          const portInp = card.querySelector('[data-et="' + id + '.port"]');
          const token = (tokenInp && tokenInp.value.trim()) || "";
          const port = (portInp && portInp.value.trim()) || "";
          // Busy state is set synchronously on purpose: the permission request
          // below is the first await in this handler and must stay inside the
          // click's own user-gesture stack, so nothing may be awaited before it.
          testBtn.disabled = true;
          testBtn.setAttribute("aria-busy", "true");
          try {
            testStatus.className = "et-test-status";
            if (!token) { testStatus.classList.add("warn"); testStatus.textContent = t("mdSendTestNoToken"); return; }
            testStatus.textContent = t("mdSending");
            try {
              const granted = await chrome.permissions.request({ origins: [row.origin] });
              if (!granted) { testStatus.classList.add("err"); testStatus.textContent = t("mdSendTestPerm"); return; }
            } catch (e) {
              // Platform rejection folded into a product message -- leave the
              // error's shape (never the origin or token) in the console.
              console.warn("[export-target] permission request failed:", e && e.name, e && e.message);
              testStatus.classList.add("err"); testStatus.textContent = t("mdSendTestPerm"); return;
            }
            try {
              const pr = row.precheckRequest({ port }, token);
              const resp = await fetch(pr.url, { method: pr.method, headers: pr.headers, body: pr.body, redirect: "error" });
              if (resp.status === 401) { testStatus.classList.add("err"); testStatus.textContent = t("mdSendTestBadToken"); }
              else if (!resp.ok) { testStatus.classList.add("err"); testStatus.textContent = t("mdSendTestDown"); }
              else { testStatus.classList.add("ok"); testStatus.textContent = t("mdSendTestOk"); }
            } catch (_) { testStatus.classList.add("err"); testStatus.textContent = t("mdSendTestDown"); }
          } finally {
            testBtn.disabled = false;
            testBtn.removeAttribute("aria-busy");
          }
        });
        testWrap.appendChild(testBtn); testWrap.appendChild(testStatus);
        card.appendChild(testWrap);
      }
      sec.appendChild(head); sec.appendChild(card);
      host.appendChild(sec);
    });
    pbpAccRestore(host);
    // These cards are built AFTER the page-level setupSecretToggles() pass, and
    // are rebuilt on panel reset -- bind the freshly created .key-toggle buttons
    // here so every render (initial and reset) gets a working show/hide.
    if (typeof setupSecretToggles === "function") setupSecretToggles(host);
    // Same story for auto-save, with worse consequences: unbound inputs in a
    // re-rendered card never reach storage, while the card's own Test button
    // reads the DOM and still reports success on a token nothing will save.
    bindAutoSave(host);
  }

  // Collect the rendered target cards back into an exportTargets object.
  function collectExportTargets() {
    const out = {};
    pbpExportTargetIds().forEach((id) => { out[id] = {}; });
    document.querySelectorAll("#export-targets [data-et]").forEach((el) => {
      const [id, key] = el.dataset.et.split(".", 2);
      if (!out[id]) out[id] = {};
      if (el.dataset.secret) out[id][key] = (typeof obfuscateKey === "function") ? obfuscateKey(el.value.trim()) : el.value.trim();
      else out[id][key] = el.type === "checkbox" ? el.checked : el.value.trim();
    });
    return out;
  }

  // Show the free-text language input only while the select sits on "custom".
  // Safe to call on any page/panel (guards on element existence); programmatic
  // .value changes (load, reset) don't fire 'change', so call it explicitly.
  function syncTranslateLangCustomState() {
    const sel = $id("translate-target-lang");
    const customEl = $id("translate-target-lang-custom");
    if (!sel || !customEl) return;
    customEl.classList.toggle("hidden", sel.value !== "custom");
  }

  // Resolution contract for the persisted translateTargetLang (read by
  // md-translate.js as a plain string -- it never sees this select):
  //   select on a non-custom option -> that option's code ("auto", "ja", ...)
  //   select on "custom"            -> trimmed free text from the custom input
  //   custom input empty            -> "auto"
  // The literal sentinel "custom" is therefore never persisted.
  function resolveTranslateTargetLang() {
    const sel = $id("translate-target-lang");
    if (!sel) return "auto";
    if (sel.value !== "custom") return sel.value;
    const customEl = $id("translate-target-lang-custom");
    return (customEl && customEl.value.trim()) || "auto";
  }

  // Reset a panel's controls to defaults. Handles three address modes that the
  // old id-only loop missed: (a) radio GROUPS addressed by name (popup-width,
  // tag-sync-mode, ai-content-source), (b) the nested urlClean object, (c)
  // array-valued textareas (custom/exclude params join with newline → "").
  // Custom-overlay CSS clears via its normal opt-custom-css field reset above;
  // it then persists because the reset handler runs saveAll() right after this
  // (saveAll unconditionally calls saveOverlayWithFallback with the cleared value).
  function applyPanelReset(def, root) {
    for (const [id, val] of Object.entries(def.fields || {})) {
      const el = $id(id);
      if (!el) continue;
      // Radios reset via .checked like checkboxes (boolean = whether selected).
      // The old else-branch overwrote a radio's VALUE attribute with "true"/
      // "false" -- saveAll() then persisted bgSaveMode as "true", which the
      // background treats as overwrite (merge protection silently lost).
      if (el.type === "checkbox" || el.type === "radio") el.checked = val;
      else el.value = val;
    }
    // Radio groups by name → check the input whose value === the default.
    for (const [name, val] of Object.entries(def.radios || {})) {
      const r = root.querySelector(`input[name="${name}"][value="${val}"]`);
      if (r) r.checked = true;
    }
    // Nested objects (urlClean): map each member id → its default. Array
    // defaults (customParams/excludeParams) reduce to an empty textarea.
    for (const group of Object.values(def.nested || {})) {
      for (const [id, dflt] of Object.entries(group)) {
        const el = $id(id);
        if (!el) continue;
        if (el.type === "checkbox") el.checked = !!dflt;
        else el.value = Array.isArray(dflt) ? dflt.join("\n") : dflt;
      }
    }
  }
  // Test hook (browser test harness; no-op in normal page).
  if (typeof window !== "undefined") window.__PBP_applyPanelReset = applyPanelReset;

  $id("reset-panel-btn").addEventListener("click", function () {
    const resetBtn = this;
    const activeBtn = document.querySelector(".tab-btn.active");
    if (!activeBtn) return;
    const panel = activeBtn.dataset.panel;
    const def = PANEL_DEFAULTS[panel];
    if (!def) return;
    showConfirmPopover(resetBtn, {
      msg: t("resetConfirm", activeBtn.textContent) + (def.skip ? t("resetKeysKept") : ""),
      yesText: t("reset"),
      noText: t("cancel"),
      onConfirm: () => {
        applyPanelReset(def, document);
        // export-targets has no static fields; reset = re-render with defaults (all disabled).
        // Must run BEFORE saveAll() so collectExportTargets() sees cleared cards, not stale ones.
        if (panel === "markdown") renderExportTargets({});
        saveAllSafely();
        if (typeof def.after === "function") def.after();
        // applyPanelReset assigns .value directly, which fires no 'change', so
        // every control whose dependants live on a change listener has to be
        // re-synced by hand. Missing this one left the AI panel showing the
        // default provider in the dropdown while the OLD provider's key/model
        // fields stayed on screen -- keys typed there landed on the wrong
        // provider. Both calls are no-ops on panels that lack the control.
        syncTranslateLangCustomState();
        updateProviderFields();
      },
    });
  });

  // ---- Accordion sections ----
  // Accordion expand/collapse state, persisted device-locally (localStorage = synchronous
  // read at render = no open->collapse flash; same class as pp-i18n-* / pp-options-fields).
  const PP_ACC_KEY = "pp-acc";
  let pbpAccRestoring = true;
  function pbpAccState() { try { return JSON.parse(localStorage.getItem(PP_ACC_KEY)) || {}; } catch (_) { return {}; } }
  function pbpAccSet(key, open) { const m = pbpAccState(); m[key] = open; try { localStorage.setItem(PP_ACC_KEY, JSON.stringify(m)); } catch (_) {} }
  // Apply persisted open/closed to custom accordions and keyed native details.
  function pbpAccRestore(root) {
    const scope = root || document;
    scope.querySelectorAll(".accordion-section").forEach((sec) => {
      const head = sec.querySelector(".accordion-header[data-target]");
      if (!head) return;
      const st = pbpAccState()[head.dataset.target];
      if (st === true) sec.classList.add("open");
      else if (st === false) sec.classList.remove("open");
      head.setAttribute("aria-expanded", String(sec.classList.contains("open")));
      // st === undefined -> leave the HTML default (.open or not)
    });
    scope.querySelectorAll("details[data-acc-key]").forEach((det) => {
      const st = pbpAccState()[det.dataset.accKey];
      if (typeof st === "boolean") det.open = st;
    });
  }
  // Motion gate: only user-initiated toggles get the height transition.
  // @starting-style replays its entry animation EVERY time the element goes
  // from not-rendered to rendered -- and tab panels toggle display:none, so
  // without this gate every tab switch replayed the accordions/details
  // growing from 0. The marker outlives the 200ms transition, then drops.
  function pbpMotionMark(el) {
    clearTimeout(el._ppMotionT);
    el.classList.add("motion-toggle");
    el._ppMotionT = setTimeout(() => el.classList.remove("motion-toggle"), 400);
  }
  // Event delegation handles both static and dynamically-created accordion headers.
  document.addEventListener("click", (e) => {
    const header = e.target.closest(".accordion-header");
    if (!header) return;
    const sec = header.closest(".accordion-section");
    if (!sec) return;
    pbpMotionMark(sec); // before the class flip so the entry frame sees it
    const isOpen = sec.classList.toggle("open");
    header.setAttribute("aria-expanded", String(isOpen));
    const key = header.dataset.target;
    if (key) pbpAccSet(key, isOpen);
  });
  // Same gate for native <details>: capture phase runs before the default
  // toggle action renders ::details-content, so the marker is in place for
  // the entry frame. Delegated -> also covers dynamically-created details.
  document.addEventListener("click", (e) => {
    const summary = e.target.closest("summary");
    const det = summary && summary.closest("details");
    if (det) pbpMotionMark(det);
  }, true);
  document.addEventListener("toggle", (e) => {
    const det = e.target.closest?.("details[data-acc-key]");
    if (!det || pbpAccRestoring) return;
    pbpAccSet(det.dataset.accKey, det.open);
  }, true);

  setupSecretToggles();

  // ---- All settings with defaults (from shared.js) ----
  await pbpMigrateSecretsToLocal();
  let s = await pbpReadSettingsWithSecrets(SETTINGS_DEFAULTS);
  deobfuscateSettings(s);

  // ---- Schema v2 migration: split customCSS into themePresetKey + customOverlayCSS ----
  // Runs once per profile (guarded by _migrationV2), then stays dormant. Silently converts
  // un-migrated profiles so their old custom CSS keeps rendering; the one-time "upgraded"
  // banner + 7-day undo it used to show were removed once all undo windows had expired.
  // The v2 theme-storage migration's one-time "upgraded" banner + 7-day undo were
  // removed (every undo window had long expired). Reclaim their now-dead local keys.
  chrome.storage.local.remove(["_migrationBackup", "_migrationBannerDismissed"]).catch(() => {});

  migrationV2: {
    // Earlier builds wrote themePresetKey/_migrationV2 straight to
    // chrome.storage.sync even when settings sync was OFF, where no reader
    // (getSettingsStorage routes to local) ever saw them — the user's site
    // theme silently vanished after migration. Adopt a stray preset key once
    // (never delete the sync copy: another device may sync for real), and
    // honor the migration flag from either area so migration never re-runs.
    const settingsArea = await getSettingsStorage();
    if (settingsArea !== chrome.storage.sync && !s.themePresetKey) {
      try {
        // Own-property probe: adopt only when this device NEVER stored the
        // key. A user-chosen "None" persists an own "" — resurrecting the
        // stray preset over that explicit choice would make None impossible
        // to keep across options reopens.
        const probe = await settingsArea.get("themePresetKey");
        if (!("themePresetKey" in probe)) {
          const stray = await chrome.storage.sync.get({ themePresetKey: "" });
          if (typeof stray.themePresetKey === "string" && stray.themePresetKey) {
            await settingsArea.set({ themePresetKey: stray.themePresetKey });
            s.themePresetKey = stray.themePresetKey;
          }
        }
      } catch (_) {}
    }
    let migrated = false;
    try {
      // Read the done-flag from BOTH areas unconditionally: it may live in
      // local (set while settings sync was off) or in sync (set while on, or
      // by legacy builds), and the sync toggle does not carry it across. A
      // one-way check re-ran the migration after an OFF->ON toggle, and its
      // newOverlay="" write wiped the freshly synced overlay.
      const [localFlags, syncFlags] = await Promise.all([
        chrome.storage.local.get({ _migrationV2: false }),
        chrome.storage.sync.get({ _migrationV2: false }),
      ]);
      migrated = localFlags._migrationV2 === true || syncFlags._migrationV2 === true;
    } catch (_) {}
    const oldCSSFromSync = await syncGetLarge("customCSS", "");
    let oldCSS = oldCSSFromSync;
    if (!oldCSS) {
      const localOldCSS = await chrome.storage.local.get({ customCSS: "" });
      if (localOldCSS.customCSS) oldCSS = localOldCSS.customCSS;
    }
    const oldKeyForMigration = s.themePresetKey || "";
    // v1 evidence is the legacy customCSS ONLY. A bare themePresetKey is v2
    // state (any fresh user who picked a preset); counting it made this block
    // re-run with oldCSS="" and the newOverlay="" write below ERASED the
    // user's overlay on their next options open. When real v1 CSS exists the
    // stored key still guides resolution; when it doesn't there is nothing to
    // migrate.
    const hasOldData = !!oldCSS;
    if (!migrated && hasOldData) {
      try {
        // A2 Phase 3: migration uses PINBOARD_THEMES so we must load it now.
        // This is a one-time cost for un-migrated users; future opens skip this entire block.
        await _loadPinboardThemes();
      } catch (e) {
        console.error("[migrationV2] failed to load pinboard-themes.js", e);
        // Don't set _migrationV2 flag — will retry on next load
        break migrationV2;
      }
      // Resolve preset key: trust stored key, fall back to CSS-text reverse lookup
      let resolvedKey = oldKeyForMigration;
      if (!resolvedKey && oldCSS) {
        for (const [key, theme] of Object.entries(PINBOARD_THEMES)) {
          if (theme.css.trim() === oldCSS.trim()) { resolvedKey = key; break; }
        }
        // Adaptive parent fallback: catppuccin-latte → catppuccin
        if (resolvedKey) {
          for (const [parent, [light, dark]] of Object.entries(ADAPTIVE_THEME_MAP)) {
            if (resolvedKey === light || resolvedKey === dark) { resolvedKey = parent; break; }
          }
        }
      }
      // Decide overlay value (X1: equal to preset → empty; X2/X3: keep full)
      let newOverlay = "";
      if (oldCSS) {
        const preset = resolvedKey ? PINBOARD_THEMES[resolvedKey] : null;
        const presetCSS = preset ? preset.css : "";
        // Adaptive: also compare against light/dark variants
        const adaptiveVariants = ADAPTIVE_THEME_MAP[resolvedKey] || [];
        const allowed = [presetCSS, ...adaptiveVariants.map(k => PINBOARD_THEMES[k]?.css || "")];
        const matchesPreset = allowed.some(css => css && css.trim() === oldCSS.trim());
        newOverlay = matchesPreset ? "" : oldCSS;
      }
      try {
        // The 50 KB cap is a SYNC-area policy. When settings sync is off the
        // local area stores the value directly (no per-item limit) and the
        // local-route readers never consult the fallback key, so writing the
        // fallback there would make the migrated CSS invisible.
        if (settingsArea !== chrome.storage.local &&
            pbpOverlayByteLength(newOverlay) > OVERLAY_BYTE_LIMIT) {
          await chrome.storage.local.set({ customOverlayCSS_localFallback: newOverlay });
        } else {
          await syncSetLarge("customOverlayCSS", newOverlay);
          await chrome.storage.local.remove("customOverlayCSS_localFallback");
        }
        // Persist resolved preset key in the ACTIVE settings area (sync only
        // when settings sync is on) so readers actually see it.
        await settingsArea.set({ themePresetKey: resolvedKey || "" });
        // Cleanup old customCSS (sync chunks + local backup)
        const meta = await chrome.storage.sync.get("customCSS");
        if (meta.customCSS && meta.customCSS._chunks) {
          const oldChunks = Array.from({ length: meta.customCSS._chunks }, (_, i) => `customCSS_${i}`);
          await chrome.storage.sync.remove(["customCSS", ...oldChunks]);
        }
        await chrome.storage.local.remove("customCSS");
        // Done-flag goes to LOCAL always (readable no matter how the sync
        // toggle moves later) and additionally to sync when that is the
        // active area; the read side above checks both.
        await chrome.storage.local.set({ _migrationV2: true });
        if (settingsArea === chrome.storage.sync) await settingsArea.set({ _migrationV2: true });
        // Update s.* with new schema for the rest of the page init
        s.themePresetKey = resolvedKey || "";
        s.customOverlayCSS = newOverlay;
      } catch (e) {
        console.error("[migrationV2] failed", e);
        // Don't set _migrationV2 flag — will retry on next load
      }
    }
    // Always read overlay (post-migration or fresh install)
    if (s.customOverlayCSS === undefined) {
      const local = await chrome.storage.local.get("customOverlayCSS_localFallback");
      if (typeof local.customOverlayCSS_localFallback === "string") {
        s.customOverlayCSS = local.customOverlayCSS_localFallback;
      } else {
        s.customOverlayCSS = await syncGetLarge("customOverlayCSS", "");
      }
    }
  }

  // ---- Preview model override: per-provider session map ----
  // The input shows ONE provider's entry at a time (the provider selected on
  // the AI Providers tab); switching providers stashes the visible value and
  // loads the new provider's (updateProviderFields). Legacy single-key
  // previewAiModel migrates into the map under the provider active at load --
  // the only provider it can plausibly belong to (md-ai-core falls back to the
  // legacy key at read time until this first write lands).
  const _previewModelMap = (s.previewAiModelByProvider && typeof s.previewAiModelByProvider === "object"
      && !Array.isArray(s.previewAiModelByProvider))
    ? { ...s.previewAiModelByProvider } : {};
  let _previewModelProvider = s.aiProvider || "gemini";
  if (!Object.prototype.hasOwnProperty.call(_previewModelMap, _previewModelProvider)
      && typeof s.previewAiModel === "string" && s.previewAiModel.trim()) {
    _previewModelMap[_previewModelProvider] = s.previewAiModel.trim();
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
    "opt-zhipu-key": s.zhipuApiKey, "opt-zhipu-model": s.zhipuModel,
    "opt-kimi-key": s.kimiApiKey, "opt-kimi-model": s.kimiModel,
    "opt-ollama-baseurl": s.ollamaBaseUrl, "opt-ollama-model": s.ollamaModel,
    "opt-custom-name": s.customName, "opt-custom-baseurl": s.customBaseUrl,
    "opt-custom-key": s.customApiKey, "opt-custom-model": s.customModel,
    "opt-ai-tag-lang": s.aiTagLang, "opt-ai-summary-lang": s.aiSummaryLang, "opt-ai-cache-duration": s.aiCacheDuration,
    "opt-custom-tag-prompt": s.customTagPrompt, "opt-custom-summary-prompt": s.customSummaryPrompt,
    "opt-batch-tag": s.optBatchTag, "opt-lang": s.optLang, "opt-theme": s.optTheme,
    "qs-default-tags": s.qsDefaultTags, "rl-default-tags": s.rlDefaultTags,
    "opt-custom-font": s.customFont, "opt-custom-css": s.customOverlayCSS,
    "opt-ai-tag-separator": s.aiTagSeparator,
    "opt-jina-key": s.jinaApiKey,
    "opt-tag-presets": s.tagPresets,
    "opt-wayback-s3key": s.waybackS3Key,
    "opt-wayback-s3secret": s.waybackS3Secret,
    "opt-preview-ai-model": _previewModelMap[s.aiProvider || "gemini"] ?? "",
    "opt-translate-glossary": s.translateGlossary,
    "opt-selection-trigger": s.selectionTrigger,
    "dict-anki-deck": s.dictAnkiDeck || "",
    "dict-anki-port": s.dictAnkiPort || "8765",
    "dict-anki-key": s.dictAnkiKey || "",
    "dict-eudic-token": s.dictEudicToken || ""
  };
  for (const [id, val] of Object.entries(fieldMap)) {
    const el = $id(id);
    if (el) el.value = val;
  }
  // Show default prompts as placeholder so users see them when field is empty
  $id("opt-custom-tag-prompt").placeholder = DEFAULT_TAG_PROMPT;
  $id("opt-custom-summary-prompt").placeholder = DEFAULT_SUMMARY_PROMPT;

  // AI Content Source radio
  const srcRadio = document.querySelector(`input[name="ai-content-source"][value="${s.aiContentSource || 'local'}"]`);
  if (srcRadio) srcRadio.checked = true;

  // Tag Sync Mode radio
  const tsRadio = document.querySelector(`input[name="tag-sync-mode"][value="${s.tagSyncMode || 'cached'}"]`);
  if (tsRadio) tsRadio.checked = true;

  // Background Save Mode radio
  const bsRadio = document.querySelector(`input[name="bgsave-mode"][value="${s.bgSaveMode || 'merge'}"]`);
  if (bsRadio) bsRadio.checked = true;

  // Markdown export image policy select
  const mdImgSel = $id("opt-md-image-policy");
  if (mdImgSel) mdImgSel.value = s.mdExportImagePolicy || "keep";
  // Video preview (research T6.1 / T3.5)
  const vidLang = $id("opt-md-video-lang");
  // Shown canonical (Codex review F19): a legacy raw value such as " EN-us,
  // zh-CN " is displayed -- and, since the collected form differs from the
  // stored raw string, re-saved -- in the normalised form the pickers use.
  if (vidLang) vidLang.value = pbpVideoLangPrefs(s.mdVideoLangPref).join(", ");
  // Migrate the legacy obsidian* keys into exportTargets.obsidian (one-time,
  // non-destructive — old keys stay readable as a fallback).
  const _et = s.exportTargets || {};
  if (!_et.obsidian && (s.obsidianEnabled || s.obsidianVault || s.obsidianFolder)) {
    _et.obsidian = { enabled: !!s.obsidianEnabled, vault: s.obsidianVault || "", folder: s.obsidianFolder || "" };
  }
  renderExportTargets(_et);
  pbpAccRestore(document); // restore all accordion states (static quick-actions + export targets)
  setTimeout(() => { pbpAccRestoring = false; }, 0);

  // ---- Fill checkbox fields ----
  const checkMap = {
    "opt-private-default": s.optPrivateDefault, "opt-private-incognito": s.optPrivateIncognito,
    "opt-readlater-default": s.optReadlaterDefault, "opt-auto-description": s.optAutoDescription,
    "opt-blockquote": s.optBlockquote, "opt-include-referrer": s.optIncludeReferrer,
    "opt-ai-auto-tags": s.optAiAutoTags,
    "opt-ai-use-transcript": s.aiUseTranscript !== false, // default-true boolean: absent on pre-key settings
    "qs-auto-notes": s.qsAutoNotes, "qs-blockquote": s.qsBlockquote,
    "qs-ai-tags": s.qsAiTags, "qs-ai-summary": s.qsAiSummary,
    "rl-auto-notes": s.rlAutoNotes, "rl-blockquote": s.rlBlockquote,
    "rl-ai-tags": s.rlAiTags, "rl-ai-summary": s.rlAiSummary,
    "opt-batch-tag-enabled": s.optBatchTagEnabled,
    "opt-backup-include-highlights": s.backupIncludeHighlights !== false,
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
    "opt-show-ai-summary": s.optShowAiSummary,
    "opt-show-ai-tags": s.optShowAiTags,
    "opt-show-quick-links": s.optShowQuickLinks,
    "opt-show-quick-row": s.optShowQuickRow,
    "opt-auto-close": s.optAutoCloseAfterSave,
    "opt-popup-follow-theme": s.optPopupFollowTheme,
    "opt-md-frontmatter": s.mdExportFrontmatter,
    "opt-md-extended-meta": s.mdExportExtendedMeta,
    "opt-md-include-toc": s.mdExportIncludeToc,
    "opt-md-include-hl": s.mdExportIncludeHighlights,
    "opt-md-video-use-login": s.mdVideoUseLogin === true,
    "opt-md-video-pause-lookup": s.mdVideoPauseOnLookup !== false,
    "opt-md-video-dark": s.mdVideoDarkScheme === true,
    "opt-tag-sort-by-pop": s.tagSortByPopEnabled,
    "opt-wayback-enabled": s.waybackArchiveEnabled === true,
    "opt-wayback-batch": s.waybackArchiveBatch === true,
    "opt-wayback-skip-private": s.waybackSkipPrivate !== false,
    "opt-preview-ai-enabled": s.previewAiEnabled !== false,
    "opt-preview-skim": s.previewSkimEnabled === true,
    "dict-echo-enabled": s.dictEchoEnabled === true
  };
  for (const [id, val] of Object.entries(checkMap)) {
    const el = $id(id);
    if (el) el.checked = val;
  }
  // ---- Preview AI: translation target language (select + custom free-text) ----
  // Stored value is either an option code or a free-text language name; map it
  // back onto the two controls. Guard against a hand-edited backup that smuggled
  // in the "custom" sentinel (resolveTranslateTargetLang never persists it).
  {
    const sel = $id("translate-target-lang");
    const customEl = $id("translate-target-lang-custom");
    if (sel && customEl) {
      const stored = s.translateTargetLang || "auto";
      const codes = Array.from(sel.options).map(o => o.value);
      if (stored !== "custom" && codes.includes(stored)) {
        sel.value = stored;
      } else if (stored === "custom") {
        sel.value = "auto";
      } else {
        sel.value = "custom";
        customEl.value = stored;
      }
      syncTranslateLangCustomState();
      sel.addEventListener("change", syncTranslateLangCustomState);
    }
  }

  // ---- Popup width (B9) ----
  const popupWidth = Number(s.popupWidth) || 550;
  const presetValues = [450, 550, 650];
  if (presetValues.includes(popupWidth)) {
    const radio = document.querySelector(`input[name="popup-width-preset"][value="${popupWidth}"]`);
    if (radio) radio.checked = true;
  } else {
    const radio = document.querySelector(`input[name="popup-width-preset"][value="custom"]`);
    if (radio) radio.checked = true;
  }
  const customInput = $id("opt-popup-width-custom");
  if (customInput) {
    customInput.value = popupWidth;
    const selectCustomRadio = () => {
      const customRadio = document.querySelector('input[name="popup-width-preset"][value="custom"]');
      if (customRadio && !customRadio.checked) customRadio.checked = true;
    };
    customInput.addEventListener("focus", selectCustomRadio);
    customInput.addEventListener("input", selectCustomRadio);
    // Clamp + writeback only on blur/Enter — never during input,
    // because auto-save would re-clamp partial values (e.g. "6" → 420).
    const clampAndCommit = () => {
      const raw = parseInt(customInput.value, 10);
      if (isNaN(raw)) return;
      customInput.value = Math.max(420, Math.min(720, raw));
    };
    customInput.addEventListener("blur", clampAndCommit);
    customInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); clampAndCommit(); customInput.blur(); }
    });
  }

  // ---- URL Clean settings (B4) ----
  const urlClean = s.urlClean || { enabled: true, onPopupOpen: true, onPaste: true, aggressiveMode: false, customParams: [], excludeParams: [] };
  $id("opt-urlclean-enabled").checked = !!urlClean.enabled;
  $id("opt-urlclean-on-open").checked = !!urlClean.onPopupOpen;
  $id("opt-urlclean-on-paste").checked = !!urlClean.onPaste;
  $id("opt-urlclean-aggressive").checked = !!urlClean.aggressiveMode;
  $id("opt-urlclean-custom").value = (urlClean.customParams || []).join("\n");
  $id("opt-urlclean-exclude").value = (urlClean.excludeParams || []).join("\n");

  // optSyncEnabled is device-local; syncApiKeys is one Chrome-account-wide
  // marker because the credentials themselves share chrome.storage.sync.
  let initialSyncState;
  try {
    initialSyncState = await pbpReadSecretSyncState({
      includeGlobalWhenSyncOff: true,
      persistInferredState: false,
    });
  } catch (_) {
    const localState = await chrome.storage.local.get({ optSyncEnabled: false });
    initialSyncState = { optSyncEnabled: !!localState.optSyncEnabled, syncApiKeys: false };
  }
  const { optSyncEnabled, syncApiKeys } = initialSyncState;
  const syncToggle = $id("opt-sync-enabled");
  if (syncToggle) syncToggle.checked = optSyncEnabled;

  // The account-wide key toggle remains disabled on a device whose ordinary
  // settings sync is off; that device keeps using its local credential copy.
  const syncKeysToggle = $id("opt-sync-api-keys");
  if (syncKeysToggle) {
    syncKeysToggle.checked = syncApiKeys;
    syncKeysToggle.disabled = !optSyncEnabled;
  }
  await pbpRefreshSyncLocalFallbackStatus();

  // Sync toggle change: migrate settings then reload
  syncToggle?.addEventListener("change", async () => {
    const enabling = syncToggle.checked;
    let cancelled = false;
    // Declared out here because the post-reload watchdog below has to know
    // whether this run adopted the cloud profile (see its comment).
    let useCloud = false;
    if (syncKeysToggle) syncKeysToggle.disabled = !enabling;
    const oldStorage = enabling ? chrome.storage.local : chrome.storage.sync;
    const newStorage = enabling ? chrome.storage.sync : chrome.storage.local;
    // This action reloads the page and migrates the persisted snapshot. Freeze
    // the debounce queue first so edits made immediately before the toggle are
    // neither lost on reload nor omitted from the migration source.
    await pauseOptionsAutoSave();
    const pendingSave = await saveAll();
    if (!pendingSave.ok) {
      const actual = await chrome.storage.local.get({ optSyncEnabled: !enabling }).catch(() => ({ optSyncEnabled: !enabling }));
      syncToggle.checked = !!actual.optSyncEnabled;
      if (syncKeysToggle) syncKeysToggle.disabled = !actual.optSyncEnabled;
      resumeOptionsAutoSave();
      return;
    }
    try {
      const beforeTransition = await chrome.storage.local.get({ optSyncEnabled: !enabling });
      // Never hold the origin-wide secret-storage Web Lock across a modal.
      // Chrome can suspend a tab-modal confirm when the options tab loses
      // focus; holding the lock there would also stall popup and SW reads.
      if (enabling && !beforeTransition.optSyncEnabled) {
        const cloud = await chrome.storage.sync.get(null);
        // Bookkeeping residue (optOverlayInLocal, _migrationV2, a stray
        // themePresetKey) and default-valued keys must not trigger this
        // dialog: choosing "use cloud" against a hollow profile silently
        // resets every local setting to defaults after the reload.
        if (pbpCloudHasMeaningfulSyncSettings(cloud)) {
          if (confirm(t("syncConflictUseCloud"))) {
            useCloud = true;
          } else if (!confirm(t("syncConflictOverwriteCloud"))) {
            cancelled = true;
          }
        }
      }
      if (cancelled) {
        syncToggle.checked = false;
        if (syncKeysToggle) syncKeysToggle.disabled = true;
        resumeOptionsAutoSave();
        return;
      }
      await pbpWithSecretStorageLock(async () => {
        const fresh = await pbpReadSecretSyncStateUnlocked({ includeGlobalWhenSyncOff: true });
        if (!!fresh.optSyncEnabled === enabling) return;
        try {
          // Joining an existing Chrome account uses its cloud settings as the
          // source of truth. Local values remain untouched, so enabling sync on
          // a second device can never overwrite an established cloud profile.
          if (enabling && useCloud) {
            await chrome.storage.local.set({ optSyncEnabled: true });
            _settingsStorageCache = chrome.storage.sync;
            return;
          }

          // 1. Migrate regular settings
          const settingKeys = Object.keys(SETTINGS_DEFAULTS);
          let data = await oldStorage.get(settingKeys);
          data = await pbpResolveChunkedSettings(data, oldStorage, settingKeys);
          const largeValues = {};
          PBP_CHUNKED_SETTING_KEYS.forEach((key) => {
            if (Object.prototype.hasOwnProperty.call(data, key)) {
              largeValues[key] = data[key];
              delete data[key];
            }
          });
          // Keep the ordinary-settings migration from overwriting whichever
          // side currently owns the full credential/export-target snapshot.
          if (enabling) {
            if (!fresh.syncApiKeys) {
              const { main, secrets } = pbpSplitSecretBatch(data);
              if (Object.keys(secrets).length) await chrome.storage.local.set(secrets);
              await newStorage.set(main);
            } else {
              // Global key sync is already on. Local credentials can be stale;
              // publish this device's ordinary target settings while keeping
              // the current cloud credentials inside the same mixed object.
              const { main } = pbpSplitSecretBatch(data);
              const cloudTargets = await chrome.storage.sync.get("exportTargets");
              main.exportTargets = pbpOverlaySecrets(
                { exportTargets: main.exportTargets || {} },
                cloudTargets,
                new Set(["exportTargets"]),
              ).exportTargets;
              await newStorage.set(main);
            }
          } else {
            if (fresh.syncApiKeys) {
              // Cloud is current while keys-on; copy its snapshot down so this
              // sync-off device can continue locally without cloud reads. But
              // guard against a keys-off scrub racing this copy-down (the
              // marker read above and this data read are not atomic across
              // devices): a "" tombstone must never overwrite a non-empty
              // local credential, and local-only export-target credentials
              // survive the merge — same rule as pbpDisableSyncApiKeys.
              const guarded = { ...data };
              const localSnapshot = await chrome.storage.local.get(API_KEY_FIELDS.concat(["exportTargets"]));
              API_KEY_FIELDS.forEach((key) => {
                if (guarded[key] === "" && typeof localSnapshot[key] === "string" && localSnapshot[key] !== "") {
                  delete guarded[key];
                }
              });
              if (guarded.exportTargets && typeof guarded.exportTargets === "object" && !Array.isArray(guarded.exportTargets)) {
                guarded.exportTargets = pbpMergeExportTargetSecrets(
                  guarded.exportTargets, localSnapshot.exportTargets, { fillWins: false });
              }
              await newStorage.set(guarded);
            } else {
              // Merge the latest cloud non-secret target settings with this
              // device's credential fields before local becomes the sole area.
              const { main } = pbpSplitSecretBatch(data);
              const localTargets = await chrome.storage.local.get("exportTargets");
              main.exportTargets = pbpOverlaySecrets(
                { exportTargets: main.exportTargets || {} },
                localTargets,
                new Set(["exportTargets"]),
              ).exportTargets;
              await newStorage.set(main);
            }
          }
          // 2. Migrate customOverlayCSS (large value) — read from old, then switch pref, then write to new
          const customOverlayCSS = await syncGetLarge("customOverlayCSS", "");
          const savedThemes = await syncGetLarge("savedThemes", []);
          await chrome.storage.local.set({ optSyncEnabled: enabling });
          _settingsStorageCache = newStorage;
          for (const [key, value] of [
            ...Object.entries(largeValues),
            ["customOverlayCSS", customOverlayCSS],
            ["savedThemes", savedThemes],
          ]) {
            try { await syncSetLarge(key, value); }
            catch (error) {
              if (!enabling) throw error;
              // Quota fallback is an explicit device-local override. Network,
              // permission, and other storage failures are not safe to label
              // as saved locally; abort and restore the device sync flag.
              if (!(error && error.pbpFellBackToLocal)) throw error;
            }
          }
        } catch (e) {
          await chrome.storage.local.set({ optSyncEnabled: !enabling });
          _settingsStorageCache = oldStorage;
          throw e;
        }
      });
    } catch (e) {
      // Migration failed — revert toggle and abort
      console.error("sync migration failed:", e);
      const actual = await chrome.storage.local.get({ optSyncEnabled: !enabling }).catch(() => ({ optSyncEnabled: !enabling }));
      syncToggle.checked = !!actual.optSyncEnabled;
      if (syncKeysToggle) syncKeysToggle.disabled = !actual.optSyncEnabled;
      const errEl = $id("opt-sync-error");
      if (errEl) {
        errEl.textContent = t("syncMigrationFailed") || "Sync migration failed. Try again; if it persists, check available Chrome Sync storage.";
        // Sync-migration errors own this General-panel slot outright: the
        // standing auto-save alert lives in #opt-global-alert, so the 8s
        // auto-hide below can never take an unrelated message with it.
        errEl.classList.remove("hidden");
        setTimeout(() => errEl.classList.add("hidden"), 8000);
      }
      resumeOptionsAutoSave();
      return;
    }
    // Fade out and reload
    const activePanel = document.querySelector(".tab-btn.active")?.dataset.panel || "general";
    sessionStorage.setItem("activeTab", activePanel);
    document.body.style.transition = "opacity var(--motion-pop) var(--ease-out)";
    document.body.style.opacity = "0";
    setTimeout(() => location.reload(), 140);
    // The reload is not guaranteed to happen: the tag-governance beforeunload
    // guard asks "Reload this site?" whenever batches are unfinished, and
    // answering Cancel leaves the page frozen at opacity 0 with auto-save still
    // suspended -- from then on every edit is dropped and export/import park
    // forever inside pauseOptionsAutoSave()'s wait loop. If we are still on
    // screen well after the reload should have replaced us, undo both; when it
    // does happen this timer dies with the page. Written inline rather than
    // shared with the language switch below because this handler is executed in
    // isolation by the settings-persist harness, which injects every free name
    // it uses -- a helper call here would be an undefined identifier there.
    //
    // Auto-save is deliberately NOT resumed on the "use the cloud settings"
    // path: that branch writes nothing but the device flag, so every field on
    // screen still holds this device's old values and only the reload repaints
    // them from sync. Resuming would schedule a save that pushes that stale
    // form over the whole cloud profile the user just adopted -- and on to
    // every other device. Staying frozen costs a dead export/import button
    // until the page is reloaded, which the alert asks for; a silent overwrite
    // of the cloud profile is not recoverable.
    setTimeout(() => {
      if (document.hidden) return;
      document.body.style.opacity = "";
      if (useCloud) {
        const alertEl = $id("opt-global-alert");
        if (alertEl) {
          // t() echoes the key back when a message is missing (i18n.js:135), so
          // `|| fallback` would put the raw key on screen. Compare instead: the
          // English text retires itself the moment syncReloadNeeded lands in
          // the nine locale files.
          const localized = t("syncReloadNeeded");
          alertEl.textContent = localized === "syncReloadNeeded"
            ? "Reload this page to finish switching to the settings stored in Chrome Sync."
            : localized;
          alertEl.classList.remove("hidden");
        }
        return;
      }
      resumeOptionsAutoSave();
    }, 2000);
  });

  // syncApiKeys toggle: on = copy local secrets up to sync (opt back into cloud
  // keys, full exportTargets incl. token -- this IS opting in); off = first copy
  // the current sync truth down, then flip the flag and scrub sync.
  syncKeysToggle?.addEventListener("change", async () => {
    const enabling = syncKeysToggle.checked;
    if (!enabling && !confirm(t("syncApiKeysDisableConfirm"))) {
      syncKeysToggle.checked = true;
      return;
    }
    try {
      if (enabling) {
        await pbpEnableSyncApiKeys();
      } else {
        await pbpDisableSyncApiKeys();
      }
      const actual = await pbpReadSecretSyncState({ includeGlobalWhenSyncOff: true });
      syncKeysToggle.checked = !!actual.syncApiKeys;
      syncKeysToggle.disabled = !actual.optSyncEnabled;
    } catch (e) {
      console.error("syncApiKeys toggle failed:", e);
      // Reflect the authoritative account-wide marker; never infer a rollback
      // from the stale checkbox direction.
      const actual = await pbpReadSecretSyncState({ includeGlobalWhenSyncOff: true })
        .catch(() => ({ optSyncEnabled: true, syncApiKeys: !enabling }));
      syncKeysToggle.checked = !!actual.syncApiKeys;
      syncKeysToggle.disabled = !actual.optSyncEnabled;
      const errEl = $id("opt-sync-error");
      if (errEl) {
        errEl.textContent = t("syncMigrationFailed") || "Sync migration failed. Try again; if it persists, check available Chrome Sync storage.";
        // Sync-migration errors own this General-panel slot outright: the
        // standing auto-save alert lives in #opt-global-alert, so the 8s
        // auto-hide below can never take an unrelated message with it.
        errEl.classList.remove("hidden");
        setTimeout(() => errEl.classList.add("hidden"), 8000);
      }
    }
  });

  // ---- Apply options page theme based on Pinboard theme preset ----
  // The preset applies only while "Extension pages follow the Pinboard theme
  // preset" is on -- the same gate the popup has always had (theme model
  // 2026-08-25, settings batch D4); the checkbox is the live source so every
  // call site stays a two-argument call.
  function applyOptionsPageTheme(presetKey, themeMode) {
    pbpApplyOptionsEarlyTheme(themeMode, presetKey, $id("opt-popup-follow-theme").checked);
  }
  // Track active preset key — schema v2: themePresetKey is authoritative
  let currentPresetKey = s.themePresetKey || "";
  applyOptionsPageTheme(currentPresetKey, s.optTheme);
  pbpStoreOptionsThemeMirror(s.optTheme, currentPresetKey, s.optPopupFollowTheme !== false);
  document.documentElement.dataset.optionsReady = "1";
  $id("opt-popup-follow-theme").addEventListener("change", () => {
    applyOptionsPageTheme(currentPresetKey, $id("opt-theme").value);
  });

  // Language change: save immediately and reload to apply
  $id("opt-lang").addEventListener("change", async () => {
    const lang = $id("opt-lang").value;
    const activePanel = document.querySelector(".tab-btn.active")?.dataset.panel || "general";
    // The generic select listener runs after this handler. Suspend it before
    // the first await, flush every pending field (including optLang), and keep
    // it suspended until reload so the 500 ms timer cannot race the transition.
    await pauseOptionsAutoSave();
    const saved = await saveAll();
    if (!saved.ok) {
      resumeOptionsAutoSave();
      return;
    }
    sessionStorage.setItem("activeTab", activePanel);
    document.body.style.transition = "opacity var(--motion-pop) var(--ease-out)";
    document.body.style.opacity = "0";
    // Prime the i18n mirror BEFORE reload so the reload's SYNC read is fresh —
    // otherwise renderExportTargets() and other t()-at-build-time labels paint the
    // PREVIOUS language (the mirror is normally written only after the async fetch).
    try {
      if (lang === "auto") {
        localStorage.setItem("pp-i18n-lang", "auto");
        localStorage.removeItem("pp-i18n-msgs");
      } else {
        const _r = await fetch(chrome.runtime.getURL(`_locales/${lang}/messages.json`));
        if (_r.ok) {
          localStorage.setItem("pp-i18n-lang", lang);
          localStorage.setItem("pp-i18n-msgs", JSON.stringify(await _r.json()));
        }
      }
    } catch (_) {}
    setTimeout(() => location.reload(), 140);
    // Same watchdog as the sync toggle above: a refused reload would otherwise
    // strand this page invisible with auto-save suspended for good.
    setTimeout(() => {
      if (document.hidden) return;
      document.body.style.opacity = "";
      resumeOptionsAutoSave();
    }, 2000);
  });
  // Real-time switch when theme dropdown changes (affects options-page theme + preset preview)
  // Adaptive presets resolve to light/dark variant in pinboard-style.js content script;
  // options page only re-renders its own dataset.theme here.
  $id("opt-theme").addEventListener("change", () => {
    const mode = $id("opt-theme").value;
    applyOptionsPageTheme(currentPresetKey, mode);
    renderPresetPreview();
  });

  // ---- Provider field toggle ----
  const providers = ["gemini","openai","claude","deepseek","qwen","minimax","openrouter","groq","mistral","cohere","siliconflow","zhipu","kimi","ollama","custom"];
  // Reader tab's model-override input follows the selected provider: stash the
  // visible value under the outgoing provider, show the incoming provider's
  // entry (absent -> empty, NOT the legacy single key: showing a stale
  // cross-provider model here is the exact bug this map exists to kill).
  function syncPreviewModelToProvider(selected) {
    const el = $id("opt-preview-ai-model");
    if (el && selected && selected !== _previewModelProvider) {
      _previewModelMap[_previewModelProvider] = el.value.trim();
      _previewModelProvider = selected;
      el.value = _previewModelMap[selected] ?? "";
    }
    const cap = $id("preview-ai-model-provider");
    const opt = $id("opt-ai-provider").selectedOptions[0];
    if (cap) cap.textContent = t("previewAiModelFor", opt ? opt.textContent.trim() : selected);
  }
  function updateProviderFields() {
    const selected = $id("opt-ai-provider").value;
    providers.forEach(p => {
      const el = $id("fields-" + p);
      if (el) el.hidden = p !== selected; // native hidden: .pf reveal transition keys off [hidden]
    });
    syncPreviewModelToProvider(selected);
  }
  updateProviderFields();
  $id("opt-ai-provider").addEventListener("change", updateProviderFields);

  // ---- Reset prompt buttons ----
  $id("reset-tag-prompt").addEventListener("click", () => {
    $id("opt-custom-tag-prompt").value = DEFAULT_TAG_PROMPT;
    saveAllSafely();
  });
  $id("reset-summary-prompt").addEventListener("click", () => {
    $id("opt-custom-summary-prompt").value = DEFAULT_SUMMARY_PROMPT;
    saveAllSafely();
  });

  // ---- Batch: revoke all-sites permission ----
  // Reflect current grant state on load
  (async () => {
    try {
      const has = await chrome.permissions.contains({ origins: ["*://*/*"] });
      const statusEl = $id("batch-perm-status");
      const btn = $id("batch-revoke-perm");
      if (!has) {
        if (statusEl) statusEl.textContent = t("batchPermNone");
        if (btn) btn.disabled = true;
      }
    } catch (_) {}
  })();

  $id("batch-revoke-perm")?.addEventListener("click", async (e) => {
    e.preventDefault();
    const btn = e.currentTarget;
    const orig = btn.textContent;
    const statusEl = $id("batch-perm-status");
    // The button label reverts after 2s, so this line is where the reason for a
    // failed revoke survives -- tint it with the themed .hint.bad rather than
    // leaving it in hint grey alongside the neutral outcomes.
    function setPermStatus(text, failed) {
      if (!statusEl) return;
      statusEl.textContent = text;
      statusEl.classList.toggle("bad", !!failed);
    }
    btn.disabled = true;
    try {
      const result = await pbpRevokeLegacyAllSitesPermission(chrome.permissions);
      if (result.ok) {
        btn.textContent = t("batchRevokeSuccess");
        setPermStatus(t("batchPermRevoked"), false);
        setTimeout(() => { btn.textContent = orig; }, 2000);
      } else {
        btn.textContent = t("batchRevokeFailed");
        setPermStatus(t("batchRevokeFailed") + ": " + result.missing.join(", "), true);
        btn.disabled = result.wildcardAbsent;
        setTimeout(() => { btn.textContent = orig; }, 2000);
      }
    } catch (err) {
      console.error("revoke permission failed:", err);
      btn.textContent = t("batchRevokeFailed");
      setPermStatus(t("batchRevokeFailed") + ": " + ((err && err.message) || "permissions"), true);
      btn.disabled = false;
      setTimeout(() => { btn.textContent = orig; }, 2000);
    }
  });

  // ---- Wayback: check permission on load ----
  (async () => {
    if (!s.waybackArchiveEnabled) return;
    let has = false;
    try { has = await chrome.permissions.contains({ origins: ["https://web.archive.org/*"] }); } catch (_) {}
    const statusEl = $id("wayback-perm-status");
    if (!has && statusEl) statusEl.textContent = t("waybackPermDenied");
  })();

  // ---- Wayback: toggle permission on opt-wayback-enabled change ----
  $id("opt-wayback-enabled")?.addEventListener("change", async (e) => {
    const enabled = e.target.checked;
    const statusEl = $id("wayback-perm-status");
    if (!enabled) { if (statusEl) statusEl.textContent = ""; return; }
    let granted = false;
    try { granted = await chrome.permissions.request({ origins: ["https://web.archive.org/*"] }); }
    catch (err) { console.error("wayback permission request failed:", err); }
    if (statusEl) statusEl.textContent = granted ? "" : t("waybackPermDenied");
  });

  // ---- Wayback: clear the archive log (display only; keeps the _waybackAttempts
  // dedup map so just-saved URLs are not immediately re-archivable) ----
  // Owner-scoped: the list renders only the signed-in account's rows, so the
  // button drops only those. Removing the whole `_waybackLog` key would clear
  // other accounts' history from a button that never showed it, and would take
  // the legacy rows (written before the log carried an owner) with it.
  //
  // Legacy rows are deliberately KEPT: their owner is unknowable, nobody can
  // see them, and a button labelled "clear my archive log" must not delete what
  // it never displayed. They are not permanent garbage either -- wayback.js
  // appends through WAYBACK_LOG_CAP, so they age out of the ring on their own.
  $id("wayback-log-clear")?.addEventListener("click", async () => {
    const account = await pbpWaybackLogAccount();
    // null = the settings read failed, so we do not know whose rows these are.
    if (account === null) { await renderWaybackLog(); return; }
    try {
      const data = await chrome.storage.local.get({ _waybackLog: [] });
      const log = Array.isArray(data._waybackLog) ? data._waybackLog : [];
      const kept = log.filter(entry => !pbpWaybackLogOwnedBy(entry, account));
      if (kept.length !== log.length) {
        // Re-derive the owner across the await: a token swap mid-click must not
        // land a write computed for the previous account.
        if ((await pbpWaybackLogAccount()) !== account) { await renderWaybackLog(); return; }
        // Best-effort read-modify-write with the same caveat as wayback.js's own
        // append: the service worker can interleave a write and cost one row.
        // Acceptable for an advisory log, and there is no cross-context
        // transaction available over chrome.storage.
        if (kept.length) await chrome.storage.local.set({ _waybackLog: kept });
        else await chrome.storage.local.remove("_waybackLog");
      }
    } catch (_) {}
    await renderWaybackLog();
  });


  const autoSaveState = { suspended: false, chain: Promise.resolve(), waiters: [] };

  // pause/resume double as a mutex between the bulk flows that bracket
  // themselves with them (export, file import, sync toggle, language switch):
  // a second flow's pause() WAITS until the current one
  // resumes. Without this, the flows shared one non-nesting boolean — one
  // flow's finally re-enabled auto-save inside another flow's protected
  // window, and Export could read storage an import was still half-applying.
  // Flows that end in location.reload() never resume; queued waiters die with
  // the page -- unless the reload is refused, which each of those flows arms a
  // watchdog against (beforeunload can veto it; see the sync toggle handler).
  async function pauseOptionsAutoSave() {
    while (autoSaveState.suspended) {
      await new Promise((resolve) => autoSaveState.waiters.push(resolve));
    }
    autoSaveState.suspended = true;
    clearTimeout(saveTimer);
    await autoSaveState.chain;
  }

  function resumeOptionsAutoSave() {
    autoSaveState.suspended = false;
    const next = autoSaveState.waiters.shift();
    if (next) next();
    scheduleAutoSave();
  }

  async function flushOptionsAutoSave() {
    await pauseOptionsAutoSave();
    try {
      return await saveAll();
    } finally {
      resumeOptionsAutoSave();
    }
  }
  // options-vocab's Send-to-Anki flushes pending edits before reading
  // deck/key from storage (same contract as setupBackup's beforeExport).
  window.pbpOptionsFlushAutoSave = flushOptionsAutoSave;


  // ===================== Auto-save =====================
  // Collect all settings from the form and save to chrome.storage.sync
  function collectSettingsFromForm() {
    const _ets = collectExportTargets();
    return {
      // Bookmarks
      pinboardToken: obfuscateKey($id("opt-pinboard-token").value.trim()),
      optPrivateDefault: $id("opt-private-default").checked,
      optPrivateIncognito: $id("opt-private-incognito").checked,
      optReadlaterDefault: $id("opt-readlater-default").checked,
      optAutoDescription: $id("opt-auto-description").checked,
      optBlockquote: $id("opt-blockquote").checked,
      optIncludeReferrer: $id("opt-include-referrer").checked,
      optRespectTagCase: $id("opt-respect-tag-case").checked,
      bgSaveMode: document.querySelector('input[name="bgsave-mode"]:checked')?.value || "merge",
      offlineQueueEnabled: $id("offline-queue-enabled").checked,
      // Quick Actions
      qsAutoNotes: $id("qs-auto-notes").checked,
      qsBlockquote: $id("qs-blockquote").checked,
      qsDefaultTags: $id("qs-default-tags").value.trim(),
      qsAiTags: $id("qs-ai-tags").checked,
      qsAiSummary: $id("qs-ai-summary").checked,
      // Read Later
      rlAutoNotes: $id("rl-auto-notes").checked,
      rlBlockquote: $id("rl-blockquote").checked,
      rlDefaultTags: $id("rl-default-tags").value.trim(),
      rlAiTags: $id("rl-ai-tags").checked,
      rlAiSummary: $id("rl-ai-summary").checked,
      optBatchTagEnabled: $id("opt-batch-tag-enabled").checked,
      optBatchTag: $id("opt-batch-tag").value.trim() || "batch_saved",
      batchAiTags: $id("batch-ai-tags").checked,
      batchAiSummary: $id("batch-ai-summary").checked,
      batchSkipExisting: $id("batch-skip-existing").checked,
      // AI Provider & Keys
      aiProvider: $id("opt-ai-provider").value,
      geminiApiKey: obfuscateKey($id("opt-gemini-key").value.trim()),
      geminiModel: $id("opt-gemini-model").value.trim() || "gemini-3.5-flash-lite",
      openaiApiKey: obfuscateKey($id("opt-openai-key").value.trim()),
      openaiModel: $id("opt-openai-model").value.trim() || "gpt-5.4-nano",
      openaiBaseUrl: $id("opt-openai-baseurl").value.trim() || "https://api.openai.com/v1",
      claudeApiKey: obfuscateKey($id("opt-claude-key").value.trim()),
      claudeModel: $id("opt-claude-model").value.trim() || "claude-haiku-4-5",
      deepseekApiKey: obfuscateKey($id("opt-deepseek-key").value.trim()),
      deepseekModel: $id("opt-deepseek-model").value.trim() || "deepseek-v4-flash",
      qwenApiKey: obfuscateKey($id("opt-qwen-key").value.trim()),
      qwenModel: $id("opt-qwen-model").value.trim() || "qwen-flash",
      minimaxApiKey: obfuscateKey($id("opt-minimax-key").value.trim()),
      minimaxModel: $id("opt-minimax-model").value.trim() || "MiniMax-M2",
      openrouterApiKey: obfuscateKey($id("opt-openrouter-key").value.trim()),
      openrouterModel: $id("opt-openrouter-model").value.trim() || "openai/gpt-oss-20b:free",
      groqApiKey: obfuscateKey($id("opt-groq-key").value.trim()),
      groqModel: $id("opt-groq-model").value.trim() || "llama-3.1-8b-instant",
      mistralApiKey: obfuscateKey($id("opt-mistral-key").value.trim()),
      mistralModel: $id("opt-mistral-model").value.trim() || "mistral-small-latest",
      cohereApiKey: obfuscateKey($id("opt-cohere-key").value.trim()),
      cohereModel: $id("opt-cohere-model").value.trim() || "command-r7b-12-2024",
      siliconflowApiKey: obfuscateKey($id("opt-siliconflow-key").value.trim()),
      siliconflowModel: $id("opt-siliconflow-model").value.trim() || "Qwen/Qwen3-8B",
      zhipuApiKey: obfuscateKey($id("opt-zhipu-key").value.trim()),
      zhipuModel: $id("opt-zhipu-model").value.trim() || "glm-4.7-flash",
      kimiApiKey: obfuscateKey($id("opt-kimi-key").value.trim()),
      kimiModel: $id("opt-kimi-model").value.trim() || "kimi-k2.6",
      ollamaBaseUrl: $id("opt-ollama-baseurl").value.trim() || "http://localhost:11434",
      ollamaModel: $id("opt-ollama-model").value.trim() || "llama3.2",
      customName: $id("opt-custom-name").value.trim() || "Custom",
      customBaseUrl: $id("opt-custom-baseurl").value.trim(),
      customApiKey: obfuscateKey($id("opt-custom-key").value.trim()),
      customModel: $id("opt-custom-model").value.trim(),
      // AI Behavior & Prompts
      optAiAutoTags: $id("opt-ai-auto-tags").checked,
      aiUseTranscript: $id("opt-ai-use-transcript").checked,
      aiTagLang: $id("opt-ai-tag-lang").value,
      aiSummaryLang: $id("opt-ai-summary-lang").value,
      aiCacheDuration: (() => {
        const raw = $id("opt-ai-cache-duration").value;
        const n = (raw === "" || raw == null) ? 60 : parseInt(raw, 10);
        return Math.min(10080, Math.max(0, Number.isNaN(n) ? 60 : n));
      })(),
      aiTagSeparator: $id("opt-ai-tag-separator").value,
      aiContentSource: document.querySelector('input[name="ai-content-source"]:checked')?.value || "local",
      tagSyncMode: document.querySelector('input[name="tag-sync-mode"]:checked')?.value || "cached",
      jinaApiKey: obfuscateKey($id("opt-jina-key").value.trim()),
      customTagPrompt: $id("opt-custom-tag-prompt").value,
      customSummaryPrompt: $id("opt-custom-summary-prompt").value,
      mdExportFrontmatter: $id("opt-md-frontmatter").checked,
      mdExportExtendedMeta: $id("opt-md-extended-meta").checked,
      mdExportImagePolicy: $id("opt-md-image-policy").value,
      mdExportIncludeToc: $id("opt-md-include-toc").checked,
      mdExportIncludeHighlights: $id("opt-md-include-hl").checked,
      mdVideoUseLogin: $id("opt-md-video-use-login").checked,
      // Normalised with the parser the pickers consume (shared.js), so the
      // stored value is canonical ("en, zh-hant") and spacing/case noise
      // never reaches storage; the slice mirrors the input's maxlength.
      mdVideoLangPref: pbpVideoLangPrefsClamp(pbpVideoLangPrefs($id("opt-md-video-lang").value), 80),
      mdVideoPauseOnLookup: $id("opt-md-video-pause-lookup").checked,
      mdVideoDarkScheme: $id("opt-md-video-dark").checked,
      exportTargets: _ets,
      // Mirror obsidian into legacy keys so popup.js "Send to Obsidian" strip (which still
      // reads obsidianEnabled/Vault/Folder) stays in sync. P2 migrates popup to read exportTargets.
      obsidianEnabled: !!(_ets.obsidian && _ets.obsidian.enabled),
      obsidianVault: (_ets.obsidian && _ets.obsidian.vault) || "",
      obsidianFolder: (_ets.obsidian && _ets.obsidian.folder) || "",
      // Preview-page AI (md-preview explain / ask / translate)
      previewAiEnabled: $id("opt-preview-ai-enabled").checked,
      previewSkimEnabled: $id("opt-preview-skim").checked,
      // Per-provider override: commit the visible input under the provider it
      // belongs to, persist the whole map, and retire the legacy single key
      // (folded into the map at load; left non-empty it would keep leaking
      // into providers the map has no entry for via md-ai-core's fallback).
      previewAiModelByProvider: (() => {
        _previewModelMap[_previewModelProvider] = $id("opt-preview-ai-model").value.trim();
        return { ..._previewModelMap };
      })(),
      previewAiModel: "",
      translateTargetLang: resolveTranslateTargetLang(),
      translateGlossary: $id("opt-translate-glossary").value,
      dictEchoEnabled: $id("dict-echo-enabled").checked,
      dictAnkiDeck: $id("dict-anki-deck").value.trim(),
      dictAnkiPort: $id("dict-anki-port").value.trim(),
      dictAnkiKey: obfuscateKey($id("dict-anki-key").value.trim()),
      dictEudicToken: obfuscateKey($id("dict-eudic-token").value.trim()),
      selectionTrigger: $id("opt-selection-trigger").value,
      // Appearance
      optLang: $id("opt-lang").value,
      optTheme: $id("opt-theme").value,
      optShowSearch: $id("opt-show-search").checked,
      optShowRecent: $id("opt-show-recent").checked,
      optShowBadge: $id("opt-show-badge").checked,
      // Notifications
      notifyQuickSave: $id("notify-quick-save").checked,
      notifyReadLater: $id("notify-read-later").checked,
      notifyTabSet: $id("notify-tab-set").checked,
      notifyBatchSave: $id("notify-batch-save").checked,
      notifyErrors: $id("notify-errors").checked,
      // Custom Style (font here; overlay CSS saved separately via syncSetLarge below)
      customFont: $id("opt-custom-font").value.trim(),
      // New toggles
      optCheckBookmarkStatus: $id("opt-check-bookmark-status").checked,
      optShowSuggestTags: $id("opt-show-suggest-tags").checked,
      optShowAiSummary: $id("opt-show-ai-summary").checked,
      optShowAiTags: $id("opt-show-ai-tags").checked,
      optShowQuickLinks: $id("opt-show-quick-links").checked,
      optShowQuickRow: $id("opt-show-quick-row").checked,
      optAutoCloseAfterSave: $id("opt-auto-close").checked,
      optPopupFollowTheme: $id("opt-popup-follow-theme").checked,
      tagSortByPopEnabled: $id("opt-tag-sort-by-pop").checked,
      tagPresets: $id("opt-tag-presets").value,
      waybackArchiveEnabled: $id("opt-wayback-enabled").checked,
      waybackArchiveBatch: $id("opt-wayback-batch").checked,
      waybackSkipPrivate: $id("opt-wayback-skip-private").checked,
      waybackS3Key: obfuscateKey($id("opt-wayback-s3key").value.trim()),
      waybackS3Secret: obfuscateKey($id("opt-wayback-s3secret").value.trim()),
      backupIncludeHighlights: $id("opt-backup-include-highlights").checked,
      themePresetKey: currentPresetKey,
      urlClean: {
        enabled: $id("opt-urlclean-enabled").checked,
        onPopupOpen: $id("opt-urlclean-on-open").checked,
        onPaste: $id("opt-urlclean-on-paste").checked,
        aggressiveMode: $id("opt-urlclean-aggressive").checked,
        customParams: $id("opt-urlclean-custom").value.split("\n").map(s => s.trim()).filter(Boolean),
        excludeParams: $id("opt-urlclean-exclude").value.split("\n").map(s => s.trim()).filter(Boolean),
      },
      // ---- Popup width (B9) ----
      ...(() => {
        const selectedPreset = document.querySelector('input[name="popup-width-preset"]:checked')?.value;
        let popupWidthToSave = 550;
        if (selectedPreset === "custom") {
          const raw = parseInt($id("opt-popup-width-custom").value, 10);
          // Clamp the stored value but do NOT write back to the input — that
          // would clobber partial keystrokes during auto-save (e.g. typing "6"
          // for an eventual "600" would snap to 420). The blur/Enter handler
          // is responsible for cleaning up the displayed value.
          popupWidthToSave = Math.max(420, Math.min(720, isNaN(raw) ? 550 : raw));
        } else if (selectedPreset) {
          popupWidthToSave = parseInt(selectedPreset, 10);
        }
        return { popupWidth: popupWidthToSave };
      })()
    };
  }

  const savedState = {
    settings: collectSettingsFromForm(),
    overlay: $id("opt-custom-css").value,
  };

  async function saveAll() {
    const data = collectSettingsFromForm();
    const overlayValue = $id("opt-custom-css").value;
    try {
      const result = await pbpSaveOptionsSnapshot(savedState, data, overlayValue, {
        persist: persistSettings,
        saveOverlay: saveOverlayWithFallback,
        assertOverlay: pbpAssertOverlaySize,
        onSettingsSaved(settingsDelta) {
          if ("optTheme" in settingsDelta || "themePresetKey" in settingsDelta || "optPopupFollowTheme" in settingsDelta) {
            pbpStoreOptionsThemeMirror(data.optTheme, data.themePresetKey, data.optPopupFollowTheme !== false);
          }
          // Reader pre-paint mirror for "open video pages in dark" (read by
          // md-preview-theme-early.js; same origin, so this page can seed it).
          if ("mdVideoDarkScheme" in settingsDelta) {
            try { localStorage.setItem("md-preview-video-dark", data.mdVideoDarkScheme ? "1" : "0"); } catch (_) {}
          }
        },
      });
      await pbpRefreshSyncLocalFallbackStatus();
      if (result.fellBackToLocal) {
        flashAutoSave("optSavedLocally", "Saved locally (sync quota full)", 4000);
      } else {
        flashAutoSave();
      }
      return { ok: true, fellBackToLocal: result.fellBackToLocal };
    } catch (error) {
      return reportAutoSaveFailure(error);
    }
  }

  // "Some settings may already have been saved" is the one message on this page
  // the user must not miss, and the header slot it used to be the sole home of
  // wipes itself after 4s. Mirror it into the page-level role="alert" slot and
  // leave it there until a save actually succeeds.
  //
  // That slot is #opt-global-alert, NOT #opt-sync-error: auto-save fires from
  // whichever panel the user is editing, while #opt-sync-error sits inside
  // #panel-general, so on the other 12 panels its display:none ancestor hid the
  // message outright and kept the live region from announcing. #opt-sync-error
  // stays the sync-migration slot (that error is raised by controls in that
  // very panel, and its 8s auto-hide must not reach an unrelated alert).
  // The marker records that this element's current text is ours to retire.
  function setAutoSaveFailureAlert(text) {
    const errEl = $id("opt-global-alert");
    if (!errEl) return;
    // Saves are debounced at 500ms and a failing storage area keeps failing:
    // rewriting the same text into a role="alert" re-announces it on every
    // keystroke burst. The standing message is already on screen -- leave it.
    if (errEl.dataset.autosaveFailure === "1" && errEl.textContent === text) return;
    errEl.textContent = text;
    errEl.dataset.autosaveFailure = "1";
    errEl.classList.remove("hidden");
  }

  function clearAutoSaveFailureAlert() {
    const errEl = $id("opt-global-alert");
    if (!errEl || errEl.dataset.autosaveFailure !== "1") return;
    delete errEl.dataset.autosaveFailure;
    errEl.textContent = "";
    errEl.classList.add("hidden");
  }

  function reportAutoSaveFailure(error) {
    console.error("[options] save failed", error);
    const msg = t("optSaveFailed") || "Save did not complete; some settings may already have been saved";
    flashAutoSave("optSaveFailed", "Save did not complete; some settings may already have been saved", 4000, false);
    setAutoSaveFailureAlert(msg);
    return { ok: false, error };
  }

  function saveAllSafely() {
    void pbpQueueOptionsSave(autoSaveState, saveAll).catch(reportAutoSaveFailure);
  }

  // Debounced auto-save: triggers 500ms after last change
  let saveTimer = null;
  function scheduleAutoSave() {
    if (autoSaveState.suspended) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveAllSafely, 500);
  }

  // Listen on all form inputs for auto-save. The page has no manual Save and no
  // beforeunload flush, so an unbound control silently discards whatever was
  // typed into it -- and renderExportTargets() throws away and rebuilds every
  // Send-to card, which left the Notion token / Webhook URL / Obsidian vault
  // entered after a panel reset bound to nothing. Hence re-entrant: called once
  // for the page and again at the end of each render, with a dataset marker so
  // the first render (which runs BEFORE the page-level pass) binds only once.
  // The binding table lives in the function body rather than beside it: that
  // first render happens well above this line, where a const here is still TDZ.
  function bindAutoSave(root) {
    const bindings = [
      { event: "change", selectors: ['input[type="checkbox"]:not([data-no-autosave])'] },
      { event: "input", selectors: ['input[type="text"]:not([data-no-autosave])', 'input[type="password"]:not([data-no-autosave])', 'input[type="number"]:not([data-no-autosave])', 'textarea:not([data-no-autosave])'] },
      { event: "change", selectors: ['select:not([data-no-autosave])'] },
      { event: "change", selectors: ['input[type="radio"]'] },
    ];
    // Page scope stays panel-qualified (the tab strip and the mobile panel
    // picker must never autosave); a subtree already sits inside a .panel, so
    // it qualifies itself.
    const scope = root || document;
    const prefix = scope === document ? ".panel " : "";
    bindings.forEach(({ event, selectors }) => {
      scope.querySelectorAll(selectors.map(sel => prefix + sel).join(", ")).forEach(el => {
        if (el.dataset.autosaveReady === "1") return;
        el.dataset.autosaveReady = "1";
        el.addEventListener(event, scheduleAutoSave);
      });
    });
  }
  bindAutoSave();

  function flashAutoSave(key = "optAutoSaved", fallback = "Saved", delay = 1500, ok = true) {
    // A save that went through retires the standing failure alert; leaving it up
    // would keep warning about settings that are on disk by now.
    if (ok) clearAutoSaveFailureAlert();
    const el = $id("auto-save-status");
    if (!el) return;
    setStatusIcon(el, ok, t(key) || fallback);
    el.classList.toggle("saved", ok);
    clearTimeout(el._timer);
    el._timer = setTimeout(() => {
      el.textContent = t("optAutoSave");
      el.classList.remove("saved");
    }, delay);
  }

  // ---- Export/Import: see options-backup.js ----
  // EXPORTABLE_KEYS whitelist excludes API keys + cache entries from backup.
  const EXPORTABLE_KEYS = Object.keys(SETTINGS_DEFAULTS).filter(k => !API_KEY_FIELDS.includes(k));
  setupBackup({
    exportableKeys: EXPORTABLE_KEYS,
    saveOverlayWithFallback,
    loadThemes: _loadPinboardThemes,
    beforeExport: async () => (await flushOptionsAutoSave()).ok,
    beforeApply: pauseOptionsAutoSave,
    afterApply: async () => {
      resumeOptionsAutoSave();
      await pbpRefreshSyncLocalFallbackStatus();
    },
  });
  setupApiTests();


  // ---- Theme preset buttons ----
  // Schema v2: preset selection only updates currentPresetKey;
  // textarea (overlay) is never touched. Active state mirrors the key.
  function updateThemePresetButtons() {
    document.querySelectorAll(".theme-preset-btn").forEach(btn => {
      const key = btn.dataset.theme || "";
      const isActive = key === currentPresetKey;
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  }
  updateThemePresetButtons();

  // Render a read-only preview of the selected preset's CSS (collapsible panel).
  function renderPresetPreview() {
    const previewEl = $id("preset-preview-content");
    const previewSection = $id("preset-preview-section");
    if (!previewEl || !previewSection) return;
    if (!currentPresetKey) {
      previewSection.style.display = "none";
      previewEl.textContent = "";
      return;
    }
    let themeKey = currentPresetKey;
    if (ADAPTIVE_THEME_MAP[themeKey]) {
      const mode = $id("opt-theme").value;
      const prefersDark = mode === "dark" || (mode === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
      const variantKey = ADAPTIVE_THEME_MAP[themeKey][prefersDark ? 1 : 0];
      if (PINBOARD_THEMES[variantKey]) themeKey = variantKey;
      // Fall back to parent (e.g., flexoki ships one CSS that toggles via .pbp-dark)
    }
    const theme = PINBOARD_THEMES[themeKey];
    previewSection.style.display = "";
    previewEl.textContent = theme ? theme.css : "";
  }

  // W3: appearance panel's render deps (currentPresetKey, PINBOARD_THEMES,
  // ADAPTIVE_THEME_MAP, $id targets) are now initialized — flip the boot-ready
  // flag, flush any queued init from earlier saved-tab clicks, then handle the
  // boot-active case. Dumping a full PINBOARD_THEMES entry (~50KB CSS) into the
  // preview textarea costs noticeable boot time, so we only render when the
  // appearance panel is actually viewed. Settings VALUE population for
  // appearance fields still happens unconditionally above, so saveAll() sees
  // correct values regardless of which panel was viewed.
  _appearancePanelBootReady = true;
  if (_appearancePendingInit) _initAppearancePanel();
  const _activePanelAtBoot = document.querySelector(".tab-btn.active")?.dataset?.panel;
  if (_activePanelAtBoot === "appearance") _initAppearancePanel();

  function applyPreset(key) {
    currentPresetKey = key || "";
    updateThemePresetButtons();
    updateSavedThemeButtons();
    updateSaveThemeBtnState();
    applyOptionsPageTheme(currentPresetKey, $id("opt-theme").value);
    renderPresetPreview();
    scheduleAutoSave();
  }

  document.querySelectorAll(".theme-preset-btn").forEach(btn => {
    btn.addEventListener("click", () => applyPreset(btn.dataset.theme));
  });

  // Toggle "Save as theme" button disabled state based on whether there's
  // any non-whitespace CSS to save. Called from input handler, preset apply,
  // and on initial load.
  function updateSaveThemeBtnState() {
    const saveBtn = $id("save-custom-theme");
    if (!saveBtn) return;
    const css = $id("opt-custom-css").value;
    saveBtn.disabled = !css.trim() || pbpOverlayByteLength(css) > OVERLAY_BYTE_LIMIT;
  }

  // Update saved-theme/save-button state and byte counter when user edits overlay CSS.
  // Schema v2: textarea is the overlay; it does NOT determine the preset.
  $id("opt-custom-css").addEventListener("input", () => {
    updateSavedThemeButtons();
    updateSaveThemeBtnState();
    updateOverlayByteCounter();
  });

  // Byte counter: shows N B / 50 KB; warns at 80%, blocks save at 100%.
  function updateOverlayByteCounter() {
    const ta = $id("opt-custom-css");
    const counter = $id("overlay-byte-counter");
    if (!ta || !counter) return;
    const bytes = pbpOverlayByteLength(ta.value);
    const pct = bytes / OVERLAY_BYTE_LIMIT;
    counter.textContent = `${formatBytes(bytes)} / 50 KB`;
    counter.classList.toggle("warn", pct >= 0.8 && bytes <= OVERLAY_BYTE_LIMIT);
    counter.classList.toggle("over", bytes > OVERLAY_BYTE_LIMIT);
    ta.classList.toggle("over-limit", bytes > OVERLAY_BYTE_LIMIT);
  }
  function formatBytes(b) {
    if (b < 1024) return `${b} B`;
    return `${(b / 1024).toFixed(1)} KB`;
  }
  updateOverlayByteCounter();

  // ---- Saved custom themes ----
  let savedThemes = []; // [{ name: "My Theme", css: "..." }, ...]

  async function loadSavedThemes() {
    savedThemes = await syncGetLarge("savedThemes", []);
    if (!Array.isArray(savedThemes)) savedThemes = [];
    // One-time migration from local
    if (!savedThemes.length) {
      const local = await chrome.storage.local.get({ savedThemes: [] });
      if (Array.isArray(local.savedThemes) && local.savedThemes.length) {
        savedThemes = local.savedThemes;
        await syncSetLarge("savedThemes", savedThemes);
        await chrome.storage.local.remove("savedThemes");
      }
    }
    renderSavedThemes();
  }

  async function persistSavedThemes() {
    try {
      await syncSetLarge("savedThemes", savedThemes);
    } finally {
      await pbpRefreshSyncLocalFallbackStatus();
    }
  }

  function renderSavedThemes() {
    const container = $id("saved-themes-list");
    const section = $id("saved-themes-section");
    while (container.firstChild) container.removeChild(container.firstChild);
    section.style.display = savedThemes.length ? "" : "none";
    const currentCSS = $id("opt-custom-css").value;
    savedThemes.forEach((theme) => {
      const wrap = document.createElement("span");
      wrap.className = "saved-theme-wrap";
      const btn = document.createElement("button");
      btn.className = "btn btn-sm saved-theme-btn";
      btn.textContent = theme.name;
      btn.title = theme.name; // Full-name tooltip in case label gets truncated
      btn.setAttribute("aria-label", t("loadTheme", theme.name));
      const isActive = currentCSS.trim() === theme.css.trim();
      if (isActive) btn.classList.add("active");
      btn.setAttribute("aria-pressed", isActive ? "true" : "false");
      btn.addEventListener("click", () => {
        $id("opt-custom-css").value = theme.css;
        updateThemePresetButtons();
        updateSavedThemeButtons();
        updateSaveThemeBtnState();
        // Custom saved themes do NOT affect options page styling — clear preset key
        currentPresetKey = "";
        applyOptionsPageTheme("", $id("opt-theme").value);
        scheduleAutoSave();
      });
      const del = document.createElement("button");
      del.className = "saved-theme-del";
      del.textContent = "\u00d7";
      del.title = t("deleteTheme");
      del.setAttribute("aria-label", t("deleteThemeNamed", theme.name));
      del.addEventListener("click", (e) => {
        e.stopPropagation();
        showConfirmPopover(wrap, {
          msg: t("deleteThemeConfirm", theme.name),
          yesText: t("delete"),
          noText: t("cancel"),
          onConfirm: async () => {
            // Re-find by name in case the array mutated while popover was open.
            const current = savedThemes.findIndex(th => th.name === theme.name);
            if (current >= 0) {
              savedThemes.splice(current, 1);
              await persistSavedThemes();
              renderSavedThemes();
            }
          },
        });
      });
      wrap.append(btn, del);
      container.appendChild(wrap);
    });
  }

  function updateSavedThemeButtons() {
    const currentCSS = $id("opt-custom-css").value;
    document.querySelectorAll(".saved-theme-btn").forEach(btn => {
      const theme = savedThemes.find(t => t.name === btn.textContent);
      const isActive = !!(theme && currentCSS.trim() === theme.css.trim());
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  }

  $id("save-custom-theme").addEventListener("click", () => {
    const css = $id("opt-custom-css").value.trim();
    if (!css || pbpOverlayByteLength(css) > OVERLAY_BYTE_LIMIT) return;

    const wrap = document.querySelector(".save-theme-wrap");
    if (wrap.querySelector(".theme-name-popover")) return; // already open

    const pop = document.createElement("div");
    pop.className = "theme-name-popover";

    const lbl = document.createElement("label");
    lbl.textContent = t("themeName");

    const inp = document.createElement("input");
    inp.type = "text";
    inp.maxLength = 40;

    const overwriteMsg = document.createElement("p");
    overwriteMsg.className = "tnp-overwrite";
    overwriteMsg.style.display = "none";

    const actions = document.createElement("div");
    actions.className = "tnp-actions";

    const saveBtn = document.createElement("button");
    saveBtn.className = "tnp-save";
    saveBtn.textContent = t("themeNameSave");

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "tnp-cancel";
    cancelBtn.textContent = t("cancel");

    actions.appendChild(saveBtn);
    actions.appendChild(cancelBtn);
    pop.appendChild(lbl);
    pop.appendChild(inp);
    pop.appendChild(overwriteMsg);
    pop.appendChild(actions);
    wrap.appendChild(pop);

    inp.focus();

    function dismiss() {
      document.removeEventListener("keydown", onEscGlobal);
      if (pop.classList.contains("is-closing")) return;
      // Exit fade mirrors .confirm-popover; instant when the CSS recipe can't
      // run (no motion-ready yet, or reduced motion) so removal never lags.
      if (!document.documentElement.classList.contains("motion-ready")
          || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        pop.remove();
        return;
      }
      pop.classList.add("is-closing");
      setTimeout(() => pop.remove(), 150);
    }
    // Document-level ESC so focus doesn't have to be inside the input.
    function onEscGlobal(ev) { if (ev.key === "Escape") dismiss(); }
    document.addEventListener("keydown", onEscGlobal);

    pop.addEventListener("click", (e) => e.stopPropagation());
    cancelBtn.addEventListener("click", dismiss);

    saveBtn.addEventListener("click", async () => {
      const trimmedName = inp.value.trim();
      if (!trimmedName) { inp.focus(); return; }
      const existing = savedThemes.findIndex(th => th.name === trimmedName);
      if (existing >= 0 && overwriteMsg.style.display === "none") {
        overwriteMsg.textContent = t("themeOverwrite", trimmedName);
        overwriteMsg.style.display = "";
        saveBtn.textContent = t("themeNameOverwriteBtn");
        return;
      }
      if (existing >= 0) {
        savedThemes[existing].css = css;
      } else {
        savedThemes.push({ name: trimmedName, css });
      }
      await persistSavedThemes();
      renderSavedThemes();
      dismiss();
    });

    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") saveBtn.click();
    });

    // close on outside click
    function outsideClick() { dismiss(); document.removeEventListener("click", outsideClick); }
    setTimeout(() => document.addEventListener("click", outsideClick), 0);
  });

  await loadSavedThemes();
  updateSaveThemeBtnState();

  // ---- Chrome shortcuts: open chrome://extensions/shortcuts ----
  // A plain <a href="chrome://..."> can't navigate from an extension page, so
  // intercept every shortcut link (any tab) and open it via the tabs API.
  document.querySelectorAll('a[href="chrome://extensions/shortcuts"]').forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
    });
  });
  // Show the ACTUAL bound key for every command that has a display slot in the
  // page ([data-command="<command name>"]) — not a hardcoded guess. Unbound
  // commands show the "unset" hint. One loop covers all current + future slots.
  try {
    const cmds = await chrome.commands.getAll();
    const byName = new Map(cmds.map((c) => [c.name, c.shortcut]));
    document.querySelectorAll("[data-command]").forEach((slot) => {
      const sc = byName.get(slot.dataset.command);
      slot.textContent = "";
      if (sc) {
        const kbd = document.createElement("kbd");
        kbd.textContent = sc;
        slot.appendChild(kbd);
      } else {
        slot.textContent = t("mdShortcutUnset");
      }
    });
  } catch (_) { /* commands API unavailable — leave fields blank */ }


  // B5: Write high-frequency UI fields mirror for next options open.
  // Never stores API keys or tokens — only boolean "loggedIn" and visible UI state.
  try {
    const mirror = {
      ts: Date.now(),
      loggedIn: !!(s.pinboardToken),
      aiProvider: s.aiProvider || "gemini",
      notify: {
        "notify-quick-save": s.notifyQuickSave !== false,
        "notify-read-later": s.notifyReadLater !== false,
        "notify-tab-set": s.notifyTabSet !== false,
        "notify-batch-save": s.notifyBatchSave !== false,
        "notify-errors": s.notifyErrors !== false,
      }
    };
    localStorage.setItem("pp-options-fields", JSON.stringify(mirror));
  } catch (_) {}

  // ---- Tag governance event listeners ----
  $id("tag-gov-reset-ignored")?.addEventListener("click", async (e) => {
    e.preventDefault();
    const startAuth = await getTagGovAuth();
    if (!startAuth) return;
    // Anchor to the positioned <small> wrapper, NOT inside the <a href="#"> itself:
    // a popover nested in the anchor makes its buttons activate the link (the
    // popover only stopPropagation()s, it can't cancel the anchor's default), so
    // confirming OR cancelling navigated to "#" and scroll-jumped the page to top.
    showConfirmPopover($id("tag-gov-reset-ignored")?.closest(".tag-gov-reset-link"), {
      msg: t("tagGovResetIgnoredConfirm"),
      yesText: t("reset"),
      noText: t("cancel"),
      onConfirm: async () => {
        const auth = await getTagGovAuth(startAuth.account);
        if (!auth) return;
        const ignoredKey = pbpAccountStorageKey("_tagGovIgnored", auth.account);
        await chrome.storage.local.set({ [ignoredKey]: { account: auth.account, ids: [] } });
        await renderTagGov();
      }
    });
  });

  $id("tag-gov-delete-selected")?.addEventListener("click", async () => {
    const selectedBoxes = Array.from(document.querySelectorAll(".tag-gov-lowcount-checkbox:checked"));
    const selected = selectedBoxes.map(el => el.value);
    const selectedAccounts = new Set(selectedBoxes.map(el => el.dataset.account).filter(Boolean));
    if (selectedAccounts.size !== 1) return;
    const expectedAccount = selectedAccounts.values().next().value;
    if (!selected.length) return;
    const btn = $id("tag-gov-delete-selected");
    const shown = selected.slice(0, 10).join(", ") + (selected.length > 10 ? ", +" + (selected.length - 10) + " more" : "");
    const msg = t("tagGovConfirmDelete", String(selected.length))
      + "\n" + shown;
    showConfirmPopover(btn, {
      msg,
      yesText: t("tagGovDeleteSelected"),
      noText: t("cancel"),
      onConfirm: async () => {
        if (!(await getTagGovAuth(expectedAccount))) return;
        const delTags = selected.map(tg => tg.toLowerCase());
        if (delTags.some(tg => _tagGovActiveTags.has(tg))) return;
        delTags.forEach(tg => _tagGovActiveTags.add(tg)); // reserve BEFORE await (atomic check+reserve)
        if (btn) btn.disabled = true;
        if (!(await ensureTagSnapshot(expectedAccount))) {
          delTags.forEach(tg => _tagGovActiveTags.delete(tg)); // roll back reservation on snapshot failure
          if (btn) btn.disabled = false;
          return;
        }
        try {
          await runTagGovOps(selected.map(tag => ({ op: "delete", tag })), expectedAccount);
        } finally {
          delTags.forEach(tg => _tagGovActiveTags.delete(tg));
          if (btn) btn.disabled = false;
        }
      }
    });
  });

  let tagGovAiPendingSettings = null;

  async function runTagGovAi(sNow) {
    const btn = $id("tag-gov-ai-btn");
    const statusEl = $id("tag-gov-ai-status");
    if (!hasAIKey(sNow)) {
      if (statusEl) {
        // Failure colour comes from .hint.bad (setStatusIcon sets the class).
        // The old inline #c00 outranked every theme and measured 1.71:1 on
        // Nord Night; clearing the state means dropping the class, not a style.
        setStatusIcon(statusEl, false, t("tagGovAiNoKey"));
        setTimeout(() => { statusEl.textContent = ""; statusEl.classList.remove("ok", "bad"); }, 5000);
      }
      return;
    }

    let grantRetry = false;
    btn.disabled = true;
    btn.textContent = t("tagGovAiRunning");
    if (statusEl) { statusEl.textContent = ""; statusEl.classList.remove("ok", "bad"); }

    try {
      const auth = await getTagGovAuth(sNow._tagGovExpectedAccount || "");
      if (!auth) throw new Error("account_changed");
      const counts = await loadTagCounts(false, auth.account);
      if (!counts) throw new Error("Failed to load tag counts");

      const prompt = pbpTagGovBuildAiPrompt(counts, 1500);
      // Clustering output is a large JSON array, and thinking models (Gemini 2.5,
      // DeepSeek reasoner) burn output budget on reasoning first — the default
      // 1024-token cap came back as an empty response from both. 4096 is accepted
      // by every supported provider.
      const raw = await getOrCreateInflight("taggov|" + auth.account + "|" + sNow.aiProvider, () => callAI(sNow, prompt, { maxTokens: 4096 }));

      const aiGroups = pbpTagGovParseAiResponse(raw, counts);

      if (!(await getTagGovAuth(auth.account))) throw new Error("account_changed");
      const aiKey = pbpAccountStorageKey("_tagGovAiGroups", auth.account);
      await chrome.storage.local.set({ [aiKey]: { account: auth.account, groups: aiGroups, ts: Date.now() } });
      await renderTagGov();

      if (statusEl && aiGroups.length === 0) {
        statusEl.textContent = t("tagGovAiNone");
      }
    } catch (err) {
      let msg = err.name === "AbortError" ? t("testTimeout") : err.message;
      if (err?.code === "model_not_found") {
        msg = t("aiErrorModelNotFound", sNow.aiProvider) + " " + t("aiErrorModelNotFoundHint");
      } else if (err?.code === "host_permission" && $id("opt-ai-provider")?.value === sNow.aiProvider) {
        tagGovAiPendingSettings = { ...sNow, _tagGovExpectedAccount: sNow._tagGovExpectedAccount };
        grantRetry = true;
      }
      if (statusEl) {
        setStatusIcon(statusEl, false, msg);
        if (!grantRetry) setTimeout(() => { statusEl.textContent = ""; statusEl.classList.remove("ok", "bad"); }, 5000);
      }
    } finally {
      btn.disabled = false;
      btn.textContent = grantRetry ? t("aiGrantRetry") : t("tagGovAiBtn");
    }
  }

  $id("opt-ai-provider")?.addEventListener("change", () => {
    tagGovAiPendingSettings = null;
    const btn = $id("tag-gov-ai-btn");
    const statusEl = $id("tag-gov-ai-status");
    if (btn && !btn.disabled) btn.textContent = t("tagGovAiBtn");
    if (statusEl) { statusEl.textContent = ""; statusEl.classList.remove("ok", "bad"); }
  });

  $id("tag-gov-ai-btn")?.addEventListener("click", async (event) => {
    const btn = event.currentTarget;
    if (btn.disabled) return;
    btn.disabled = true;
    try {
      const pending = tagGovAiPendingSettings;
      if (pending && $id("opt-ai-provider")?.value === pending.aiProvider) {
        const granted = await requestAIHostPermissions(pending);
        if (!granted || tagGovAiPendingSettings !== pending) return;
        if (!(await getTagGovAuth(pending._tagGovExpectedAccount))) return;
        tagGovAiPendingSettings = null;
        await runTagGovAi(pending);
        return;
      }
      tagGovAiPendingSettings = null;

      // Keep one live form snapshot through call, permission failure, and retry.
      const live = pbpLiveAiSettingsSnapshot($id("opt-ai-provider")?.value || "gemini");
      let sNow = await pbpReadSettingsWithSecrets(SETTINGS_DEFAULTS);
      deobfuscateSettings(sNow);
      if ($id("opt-ai-provider")?.value !== live.aiProvider) return;
      sNow = { ...sNow, ...live, _tagGovExpectedAccount: pbpPinboardAccountFromToken(sNow.pinboardToken) };
      await runTagGovAi(sNow);
    } finally {
      btn.disabled = false;
    }
  });

  await renderWaybackLog();
});

// ---- Tag Governance helpers (top-level so they survive the DOMContentLoaded closure) ----

const TAG_GOV_RETRY_WAIT_MS = 10000; // single backoff before retrying a 429 once (Pinboard rate limit)
const TAG_GOV_LIST_RETRY_WAIT_MS = 60000; // posts/all has its own documented once-per-5-min budget — back off much longer

// Rebuild the tag-overview line (tag count + total uses). Top level, NOT inside the
// DOMContentLoaded closure: runTagGovOps calls it after every batch (a closure-scoped
// version threw "updateTagGovOverview is not defined" there, killing the post-batch
// re-render). Preserves the #tag-gov-refresh button across replaceChildren — query it
// live from the container instead of $id, whose memoized cache could hold a stale node.
function updateTagGovOverview(counts) {
  const overview = $id("tag-gov-overview");
  if (!counts || !overview) return;
  const tagCount = Object.keys(counts).length;
  const totalUses = Object.values(counts).reduce((a, b) => a + b, 0);
  const refreshBtn = overview.querySelector("#tag-gov-refresh");
  overview.replaceChildren();
  const span = document.createElement("span");
  span.textContent = t("tagGovOverview", String(tagCount), String(totalUses));
  overview.appendChild(span);
  if (refreshBtn) overview.appendChild(refreshBtn);
}

// Pinboard username (token prefix), stashed by getTagGovToken for building
// pinboard.in/u:<user>/... links without an extra async hop at render time.
let _tagGovUser = "";

// Loading tag counts failed (no token / offline / API error): say so in the
// overview line instead of leaving the unfilled "$TAGS$ tags" template visible.
// Preserves the Refresh button the same way updateTagGovOverview does.
function _tagGovShowLoadFailed() {
  const overview = $id("tag-gov-overview");
  if (!overview) return;
  const refreshBtn = overview.querySelector("#tag-gov-refresh");
  overview.replaceChildren();
  const span = document.createElement("span");
  span.textContent = t("tagGovLoadFailed");
  overview.appendChild(span);
  if (refreshBtn) overview.appendChild(refreshBtn);
}

// Shared token reader for tag-governance operations.
// Returns the deobfuscated Pinboard token, or "" if not set / on error.
async function getTagGovToken() {
  try {
    let s = await pbpReadSettingsWithSecrets(SETTINGS_DEFAULTS);
    const token = deobfuscateKey(s.pinboardToken) || "";
    _tagGovUser = token ? token.split(":")[0] || "" : "";
    return token;
  } catch (e) {
    console.error("[tag-gov] getTagGovToken failed:", e);
    return "";
  }
}

function _tagGovOwned(entry, account) {
  return account && entry && typeof entry === "object" && !Array.isArray(entry)
    && entry.account === account ? entry : null;
}

async function getTagGovAuth(expectedAccount = "") {
  const token = await getTagGovToken();
  const account = pbpPinboardAccountFromToken(token);
  if (!token || !account || (expectedAccount && account !== expectedAccount)) return null;
  return { token, account };
}

async function requireTagGovAuth(expectedAccount) {
  const auth = await getTagGovAuth(expectedAccount);
  if (auth) return auth;
  const error = new Error("account_changed");
  error.code = "account_changed";
  throw error;
}

// Once per options-page session: download a tags/get snapshot before any destructive op.
// Returns true if the snapshot was already downloaded this session or was just successfully
// downloaded. Returns false (and shows an error in #tag-gov-progress-text) on any failure.
let _tagGovSnapshotAccount = "";

async function ensureTagSnapshot(expectedAccount) {
  if (expectedAccount && _tagGovSnapshotAccount === expectedAccount) return true;
  _tagGovClaimProgress(expectedAccount);
  _tagGovSetProgress(0, expectedAccount);
  const progressText = $id("tag-gov-progress-text");
  const progress = $id("tag-gov-progress");
  try {
    const auth = await getTagGovAuth(expectedAccount);
    if (!auth) {
      if (_tagGovUiOwned(expectedAccount) && progress) progress.hidden = false;
      if (_tagGovUiOwned(expectedAccount) && progressText) progressText.textContent = t("tagGovSnapshotFailed");
      _tagGovSetProgressBtn("dismiss", expectedAccount); // failure card must be closable on a fresh page
      return false;
    }
    const resp = await pinboardFetch(
      `https://api.pinboard.in/v1/tags/get?auth_token=${encodeURIComponent(auth.token)}&format=json`
    );
    if (!resp || !resp.ok) {
      if (_tagGovUiOwned(expectedAccount) && progress) progress.hidden = false;
      if (_tagGovUiOwned(expectedAccount) && progressText) progressText.textContent = t("tagGovSnapshotFailed");
      _tagGovSetProgressBtn("dismiss", expectedAccount); // failure card must be closable on a fresh page
      return false;
    }
    const counts = await resp.json();
    if (!(await getTagGovAuth(auth.account))) return false;
    const now = new Date();
    const pad = (n, w = 2) => String(n).padStart(w, "0");
    const yyyymmdd = pad(now.getFullYear(), 4) + pad(now.getMonth() + 1) + pad(now.getDate());
    const hhmm = pad(now.getHours()) + pad(now.getMinutes());
    const filename = `pinboard-tags-snapshot-${yyyymmdd}-${hhmm}.json`;
    const blob = new Blob(
      [JSON.stringify({ exportedAt: now.toISOString(), counts }, null, 2)],
      { type: "application/json" }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    _tagGovSnapshotAccount = auth.account;
    // Don't stomp a running batch's progress line with the snapshot note.
    if (_tagGovUnfinishedBatches === 0) {
      if (_tagGovUiOwned(expectedAccount) && progress) progress.hidden = false;
      if (_tagGovUiOwned(expectedAccount) && progressText) progressText.textContent = t("tagGovSnapshotSaved");
    }
    return true;
  } catch (e) {
    if (e?.code !== "account_changed") console.error("[tag-gov] ensureTagSnapshot failed:", e);
    if (_tagGovUiOwned(expectedAccount) && progress) progress.hidden = false;
    if (_tagGovUiOwned(expectedAccount) && progressText) progressText.textContent = t("tagGovSnapshotFailed");
    _tagGovSetProgressBtn("dismiss", expectedAccount); // failure card must be closable on a fresh page
    return false;
  }
}

// Format a seconds estimate: "45s" under 90s, whole minutes above.
function formatTagGovEst(seconds) {
  return seconds < 90 ? Math.ceil(seconds) + "s" : Math.ceil(seconds / 60) + " min";
}

// Add one group id to this account's ignore list. Shared by the Ignore button
// and by the unmergeable-group retirement below, so the two can never drift
// apart on the owner checks: re-validated inside the account lock on BOTH
// sides of the read, since a token swap mid-write must not push an id into
// another account's list.
async function _tagGovIgnoreGroup(account, groupId) {
  const ignoredKey = pbpAccountStorageKey("_tagGovIgnored", account);
  await _tagGovWithAccountLock(account, async () => {
    if (!(await getTagGovAuth(account))) return;
    const stored = await chrome.storage.local.get(ignoredKey);
    const list = (_tagGovOwned(stored[ignoredKey], account)?.ids || []).slice();
    if (list.includes(groupId)) return;
    list.push(groupId);
    if (!(await getTagGovAuth(account))) return;
    await chrome.storage.local.set({ [ignoredKey]: { account, ids: list } });
  });
}

// One-off note on the tag-governance progress card. That card is the section's
// only aria-live surface (role="status") and the only one with a Dismiss
// button, and ensureTagSnapshot already posts non-progress notes there.
// Skipped while a batch is running -- the same line carries the live counter,
// and stomping it would be the worse regression (ensureTagSnapshot withholds
// its own note under the identical rule).
function _tagGovShowNote(text, expectedAccount) {
  if (_tagGovUnfinishedBatches !== 0) return;
  _tagGovClaimProgress(expectedAccount);
  if (!_tagGovUiOwned(expectedAccount)) return;
  _tagGovSetProgress(0, expectedAccount);
  const progress = $id("tag-gov-progress");
  const progressText = $id("tag-gov-progress-text");
  if (progress) progress.hidden = false;
  if (progressText) progressText.textContent = text;
  _tagGovSetProgressBtn("dismiss", expectedAccount);
}

// The "already one tag" sentence has no locale key yet (adding one is a
// nine-locale change that belongs in the same commit as the strings
// themselves), and t() echoes an unknown key straight back to the screen --
// so fall back to English until the key lands, and pick it up automatically
// once it does. Same pattern as library-notes.js's PBP_NOTES_DELETE_FAILED_KEY.
const TAG_GOV_ALREADY_ONE_TAG_KEY = "tagGovAlreadyOneTag";
function _tagGovAlreadyOneTagText() {
  const msg = t(TAG_GOV_ALREADY_ONE_TAG_KEY);
  return msg === TAG_GOV_ALREADY_ONE_TAG_KEY
    ? "These tags differ only in capitalization, so Pinboard already stores them as one tag — there is nothing to merge. The suggestion has been removed."
    : msg;
}

// pbpTagGovBuildPlan returns [] for two very different reasons, and only one of
// them can honestly be told to the user as "already merged". True = every
// member is the canonical tag under Pinboard's case-insensitive matching.
// False = one of the builder's structural bail-outs (a member with no tag
// string, a canonical outside the group, a leading-dot private tag). Mirrors
// the builder's guard order so the two cannot disagree.
function _tagGovPlanEmptyByCaseOnly(members, canonical) {
  const tags = (Array.isArray(members) ? members : []).map(m => m && m.tag);
  if (!canonical || !tags.length) return false;
  if (!tags.every(tg => typeof tg === "string" && tg)) return false;
  if (!tags.includes(canonical)) return false;
  if (tags.some(tg => tg.startsWith("."))) return false;
  return tags.every(tg => tg.toLowerCase() === canonical.toLowerCase());
}

// A group whose merge plan is empty can never be acted on: retire it instead of
// leaving a button that does nothing. Uses the same ignore list as the Ignore
// button, because AI groups live in a stored snapshot and a row merely dropped
// from the DOM would be rebuilt by the very next render.
async function _tagGovRetireUnmergeableGroup(group, canonical, expectedAccount) {
  const auth = await getTagGovAuth(expectedAccount);
  if (!auth) return;
  // Note first: it must survive even if the ignore write below fails.
  if (_tagGovPlanEmptyByCaseOnly(group.members, canonical)) {
    _tagGovShowNote(_tagGovAlreadyOneTagText(), auth.account);
  } else {
    // Unreachable from either producer today -- pbpTagGovFindGroups and
    // pbpTagGovParseAiResponse both drop dot-tags, non-string members and a
    // canonical outside the group -- so this branch carries no locale string of
    // its own. Leave a trace (tag names only, no token) rather than swallowing
    // it, and still retire the row: an unactionable suggestion is unactionable
    // whatever the reason.
    console.warn("[tag-gov] empty merge plan with no case-only explanation:", group.id, "->", canonical);
  }
  await _tagGovIgnoreGroup(auth.account, group.id);
  if (await getTagGovAuth(auth.account)) await renderTagGov();
}

async function confirmMergeGroup(group, canonical, anchorEl, expectedAccount) {
  if (!group || !group.members || group.members.length === 0) return;
  const plan = pbpTagGovBuildPlan(group.members, canonical);
  // An empty plan means every member already IS the canonical tag as far as
  // Pinboard is concerned: its tags are case-insensitive, so a group whose
  // members differ only in capitalization ("AI" / "ai") is a single tag
  // server-side with nothing to rename. The heuristic detector no longer emits
  // those, but AI-group members come straight from the model and
  // pbpTagGovParseAiResponse does not case-dedupe them, so this stays live.
  // Returning silently read as a dead Merge button.
  if (plan.length === 0) {
    await _tagGovRetireUnmergeableGroup(group, canonical, expectedAccount);
    return;
  }
  const renames = plan.filter(op => op.op === "rename");
  const summary = renames.map(op => op.old + " -> " + canonical).join(" | ");
  // Renames run as per-bookmark re-saves (tags/rename is broken server-side), so the
  // duration scales with bookmark count: one posts/all fetch per rename + one posts/add
  // per bookmark, each spaced 3.1s by the rate-limit queue.
  const canonLower = canonical.toLowerCase();
  const bookmarkCount = group.members.reduce((sum, m) =>
    (m && m.tag && m.tag.toLowerCase() !== canonLower) ? sum + (m.count || 0) : sum, 0);
  const estSec = Math.ceil((renames.length + bookmarkCount) * 3.2);
  const estStr = formatTagGovEst(estSec);
  const msg = t("tagGovConfirmMerge", String(renames.length), canonical)
    + (summary ? ": " + summary : "")
    + "\n" + t("tagGovMergeEstimate", estStr);
  const anchor = anchorEl;
  if (!anchor) return;
  showConfirmPopover(anchor, {
    msg,
    yesText: t("tagGovMerge"),
    noText: t("cancel"),
    onConfirm: async () => {
      if (!(await getTagGovAuth(expectedAccount))) return;
      // Refuse overlapping plans (same group clicked twice, or a sibling group
      // sharing a tag) instead of burning another rate-limited posts/all slot.
      const planTags = [];
      for (const pop of plan) planTags.push(pop.old.toLowerCase(), pop.new.toLowerCase());
      if (planTags.some(tg => _tagGovActiveTags.has(tg))) return;
      planTags.forEach(tg => _tagGovActiveTags.add(tg)); // reserve BEFORE await (atomic check+reserve)
      if (!(await ensureTagSnapshot(expectedAccount))) {
        planTags.forEach(tg => _tagGovActiveTags.delete(tg)); // roll back reservation on snapshot failure
        return;
      }
      _tagGovMarkRowQueued(anchor.closest(".tag-gov-group-row"));
      try {
        await runTagGovOps(plan, expectedAccount);
      } finally {
        planTags.forEach(tg => _tagGovActiveTags.delete(tg));
      }
    }
  });
}

// Pinboard's v1 tags/rename endpoint is broken server-side (verified 2026-06-11: HTTP 500
// with empty body for EVERY input, including two nonexistent tag names — it crashes before
// input validation; the documented v2 API is not deployed, all /v2/* paths return an
// Apache-level 403). tags/delete and posts/add still work, so renames are implemented as
// per-bookmark re-tagging: fetch every post carrying the old tag, then re-save each via
// posts/add replace=yes with the old tag substituted. The old tag disappears on its own
// once its use count reaches zero. Deliberately NO tags/delete afterwards: if any re-save
// was skipped or failed, deleting would strip the old tag with no new tag present (data loss).
// Each network call flows through the shared 3.1s pinboardFetch queue.
async function retagBookmarksViaResave(expectedAccount, oldTag, newTag, onProgress) {
  const enc = encodeURIComponent;
  // The 10s retry sleeps used to be a frozen screen — tell the user what is happening.
  const setWaitNote = () => {
    const pt = $id("tag-gov-progress-text");
    if (pt) pt.textContent = t("tagGovRateLimitWait");
  };
  const listUrl = (token) => `https://api.pinboard.in/v1/posts/all?tag=${enc(oldTag)}&meta=no&format=json&auth_token=${enc(token)}`;
  // pinboardFetch REJECTS on network failure or its 30s timeout — without this catch
  // the rejection escaped to the op-level handler as an anonymous fail with no row.
  let resp;
  try {
    let auth = await requireTagGovAuth(expectedAccount);
    resp = await pinboardFetch(listUrl(auth.token), { timeoutMs: 30000 });
    if (resp.status === 429) {
      setWaitNote();
      await new Promise(r => setTimeout(r, TAG_GOV_LIST_RETRY_WAIT_MS));
      // Stop clicked during the 60s wait: don't burn the budgeted retry on a result
      // that would be discarded anyway.
      if (_tagGovCancelRequested) {
        return { total: 0, saved: 0, failed: 0, skipped: 0, problems: [], cancelled: true };
      }
      auth = await requireTagGovAuth(expectedAccount);
      resp = await pinboardFetch(listUrl(auth.token), { timeoutMs: 30000 });
      if (resp.status === 429) return { total: 0, saved: 0, failed: 0, skipped: 0, problems: [], aborted: true };
    }
  } catch (e) {
    if (e?.code === "account_changed") throw e;
    return { total: 0, saved: 0, failed: 1, skipped: 0,
      problems: [{ url: "", title: "", kind: "failed", reason: "posts/all: " + (e?.name || "network error") }], aborted: false };
  }
  // A failed list fetch means NO bookmark was touched — say which pair and why, so the
  // summary's "1 failed" is not an anonymous dead end (re-running is fully safe).
  if (!resp.ok) {
    return { total: 0, saved: 0, failed: 1, skipped: 0,
      problems: [{ url: "", title: "", kind: "failed", reason: "posts/all HTTP " + resp.status }], aborted: false };
  }
  await requireTagGovAuth(expectedAccount);
  const posts = await resp.json();
  await requireTagGovAuth(expectedAccount);
  if (!Array.isArray(posts)) {
    return { total: 0, saved: 0, failed: 1, skipped: 0,
      problems: [{ url: "", title: "", kind: "failed", reason: "posts/all: unexpected response" }], aborted: false };
  }

  const oldLower = oldTag.toLowerCase();
  let saved = 0, failed = 0, skipped = 0;
  const problems = []; // { url, title, kind: "failed" | "skipped" } per bookmark
  for (let i = 0; i < posts.length; i++) {
    if (_tagGovCancelRequested) {
      return { total: posts.length, saved, failed, skipped, problems, cancelled: true };
    }
    const auth = await requireTagGovAuth(expectedAccount);
    if (onProgress) onProgress(i, posts.length);
    const post = posts[i];
    if (!post || !post.href) {
      failed++;
      problems.push({ url: "", title: (post && post.description) || "", kind: "failed", reason: "missing href" });
      continue;
    }
    const tags = (post.tags || "").split(/\s+/).filter(Boolean);
    // Pinboard tags are case-insensitive: match accordingly. Already clean -> count as done without a write.
    if (!tags.some(tg => tg.toLowerCase() === oldLower)) { saved++; continue; }
    const seen = new Set();
    const next = [];
    for (const tg of tags) {
      const replaced = tg.toLowerCase() === oldLower ? newTag : tg;
      const key = replaced.toLowerCase();
      if (!seen.has(key)) { seen.add(key); next.push(replaced); }
    }
    const uri = buildPostsAddUri({
      token: auth.token,
      url: post.href,
      title: post.description || post.href,
      extended: post.extended || "",
      tags: next.join(" "),
      shared: post.shared,
      toread: post.toread,
      dt: post.time
    });
    // Never truncate a bookmark to fit the URI cap — skip it and surface the count instead.
    if (uri.length > POSTS_ADD_URI_BUDGET) {
      skipped++;
      problems.push({ url: post.href, title: post.description || post.href, kind: "skipped" });
      continue;
    }
    try {
      let r = await pinboardFetch(uri);
      if (r.status === 429) {
        setWaitNote();
        await new Promise(rs => setTimeout(rs, TAG_GOV_RETRY_WAIT_MS));
        if (_tagGovCancelRequested) {
          return { total: posts.length, saved, failed, skipped, problems, cancelled: true };
        }
        const retryAuth = await requireTagGovAuth(expectedAccount);
        const retryUri = buildPostsAddUri({
          token: retryAuth.token,
          url: post.href,
          title: post.description || post.href,
          extended: post.extended || "",
          tags: next.join(" "),
          shared: post.shared,
          toread: post.toread,
          dt: post.time
        });
        r = await pinboardFetch(retryUri);
        if (r.status === 429) {
          // A persistent 429 on one bookmark is likely a transient cross-context
          // collision (popup/background share the rate budget) — record it and move
          // on instead of killing the whole run over a single bookmark.
          failed++;
          problems.push({ url: post.href, title: post.description || post.href, kind: "failed", reason: "HTTP 429" });
          continue;
        }
      }
      if (!r.ok) {
        failed++;
        problems.push({ url: post.href, title: post.description || post.href, kind: "failed", reason: "HTTP " + r.status });
        continue;
      }
      const data = await r.json();
      if (data.result_code === "done") {
        saved++;
      } else {
        failed++;
        problems.push({ url: post.href, title: post.description || post.href, kind: "failed", reason: String(data.result_code || "unknown") });
      }
    } catch (e) {
      if (e?.code === "account_changed") throw e;
      console.error("[tag-gov] retag re-save failed:", post.href, e);
      failed++;
      problems.push({ url: post.href, title: post.description || post.href, kind: "failed", reason: e?.name || "network error" });
    }
  }
  if (onProgress) onProgress(posts.length, posts.length);
  return { total: posts.length, saved, failed, skipped, problems, aborted: false };
}

// Batches queue up instead of running concurrently: several confirmed merges would
// otherwise interleave their writes into the single shared progress line (observed in
// the field as alternating "1/2 ... 24/92" / "1/2 ... 36/42" from different batches).
// Network calls were already serialized by the pinboardFetch queue; this serializes
// the UI and the ok/fail bookkeeping too.
let _tagGovBatchChain = Promise.resolve();
let _tagGovUnfinishedBatches = 0;
let _tagGovRunAccount = "";
// Number of queued batches to drop after an abort/stop: exactly the batches that
// were waiting at that moment (they would keep hammering an API that just told us
// to stop, and their op lines would overwrite the abort explanation). A NEW batch
// the user confirms during the drain window lands after these and still runs.
let _tagGovDrainCount = 0;
// Set by the Stop button; checked at every per-bookmark/per-op checkpoint. A stopped
// run drains its queue like an aborted one — completed re-saves persist server-side.
let _tagGovCancelRequested = false;

// The single button on the progress card: "Stop" while a run is active, "Dismiss"
// once the queue drains (the sticky card otherwise pins to the viewport forever).
function _tagGovSetProgressBtn(mode, expectedAccount = "") {
  if (expectedAccount && !_tagGovUiOwned(expectedAccount)) return;
  const btn = $id("tag-gov-progress-btn");
  if (!btn) return;
  btn.dataset.mode = mode;
  btn.disabled = false;
  btn.hidden = false;
  btn.textContent = mode === "stop" ? t("tagGovStop") : t("tagGovDismiss");
}

document.addEventListener("click", (ev) => {
  const btn = ev.target instanceof Element && ev.target.closest("#tag-gov-progress-btn");
  if (!btn) return;
  const card = $id("tag-gov-progress");
  const owner = card?.dataset.account || "";
  if (!owner || !_tagGovUiOwned(owner)) return;
  if (btn.dataset.mode === "stop") {
    _tagGovCancelRequested = true;
    btn.disabled = true; // takes effect at the next per-bookmark checkpoint
  } else {
    if (card) card.hidden = true;
    // The attention list is a sibling of the card — dismiss both, or it stays
    // orphaned on screen with no way to clear it.
    _tagGovProblems.length = 0;
    renderTagGovProblems(owner);
    // Dismiss = acknowledged: drop the persisted record so it stops reappearing.
    getTagGovAuth(owner).then((auth) => {
      if (auth) return chrome.storage.local.remove(pbpAccountStorageKey("_tagGovLastRun", owner));
    }).catch(() => {});
  }
});
// Bookmarks that need manual attention, accumulated across the queued batches of one
// run and reset when a fresh run starts (counter at zero).
const _tagGovProblems = [];
const TAG_GOV_PROBLEMS_CAP = 20;
// Every tag involved in a queued/running op (lowercased): used to refuse
// double-queueing the same group (or a sibling group sharing a tag) and to keep
// rebuilt rows visually frozen if the user refreshes mid-run.
const _tagGovActiveTags = new Set();

// Visually freeze a group row whose merge is queued/running: disable its controls
// and append a "Queued" note. Rows rebuilt by renderTagGov re-apply this state from
// _tagGovActiveTags; the drain-time re-render naturally clears it.
function _tagGovMarkRowQueued(row) {
  if (!row || row.classList.contains("tag-gov-row-queued")) return;
  row.classList.add("tag-gov-row-queued");
  row.querySelectorAll("button, input").forEach(el => { el.disabled = true; });
  const note = document.createElement("span");
  note.className = "tag-gov-queued-note";
  note.textContent = t("tagGovQueuedBadge");
  row.appendChild(note);
}

// Run-level totals shown in the done summary, accumulated across the queued batches
// of one run: per-batch numbers alone hid earlier batches' failures — only the last
// batch's summary survived on screen while the problems list was cross-batch.
const _tagGovRunTotals = { ok: 0, fail: 0, skipped: 0 };

// Render the manual-attention list under the progress row: failed re-saves and
// skipped over-budget bookmarks, each linking to pinboard's edit form for that URL.
function renderTagGovProblems(expectedAccount = "") {
  if (expectedAccount && !_tagGovUiOwned(expectedAccount)) return;
  const box = $id("tag-gov-problems");
  if (!box) return;
  box.replaceChildren();
  if (_tagGovProblems.length === 0) { box.classList.add("hidden"); return; }
  box.classList.remove("hidden");
  const title = document.createElement("div");
  title.className = "tag-gov-problems-title";
  title.textContent = t("tagGovProblemsTitle");
  box.appendChild(title);
  for (const pr of _tagGovProblems.slice(0, TAG_GOV_PROBLEMS_CAP)) {
    const row = document.createElement("div");
    row.className = "tag-gov-problem-row";
    const kind = document.createElement("span");
    kind.className = "tag-gov-problem-kind" + (pr.kind === "failed" ? " bad" : "");
    kind.textContent = t(pr.kind === "failed" ? "tagGovProblemFailed" : "tagGovProblemSkipped");
    row.appendChild(kind);
    if (pr.tag) {
      // delete-path row: the tag name, linked to its page so the user can inspect
      // what still carries it before retrying.
      row.appendChild(document.createTextNode(" "));
      if (_tagGovUser) {
        const a = document.createElement("a");
        a.href = "https://pinboard.in/u:" + encodeURIComponent(_tagGovUser) + "/t:" + encodeURIComponent(pr.tag) + "/";
        a.target = "_blank";
        a.rel = "noopener";
        a.textContent = pr.tag;
        row.appendChild(a);
      } else {
        row.appendChild(document.createTextNode(pr.tag));
      }
    } else {
      row.appendChild(document.createTextNode(" " + pr.old + " -> " + pr.new));
      if (pr.url) {
        row.appendChild(document.createTextNode(" · "));
        const a = document.createElement("a");
        a.href = "https://pinboard.in/add?url=" + encodeURIComponent(pr.url);
        a.target = "_blank";
        a.rel = "noopener";
        a.textContent = pr.title || pr.url;
        row.appendChild(a);
      }
    }
    if (pr.reason) row.appendChild(document.createTextNode(" · " + pr.reason));
    box.appendChild(row);
  }
  if (_tagGovProblems.length > TAG_GOV_PROBLEMS_CAP) {
    const more = document.createElement("div");
    more.className = "tag-gov-problem-row";
    more.textContent = "+" + (_tagGovProblems.length - TAG_GOV_PROBLEMS_CAP);
    box.appendChild(more);
  }
}

// Busy dot on the Tags tab button: inactive panels are display:none, so a running
// batch is otherwise invisible from every other settings tab.
function _tagGovSetTabBusy(busy) {
  const btn = document.querySelector('.tab-btn[data-panel="tags"]');
  if (btn) btn.classList.toggle("tab-busy", busy);
}

function _tagGovWithAccountLock(account, work) {
  const locks = typeof navigator !== "undefined" && navigator.locks;
  return locks && typeof locks.request === "function"
    ? locks.request("pbp-tag-gov-" + account, work)
    : Promise.resolve().then(work);
}

async function runTagGovOps(ops, expectedAccount = "") {
  const auth = await getTagGovAuth(expectedAccount);
  if (!auth) return { ok: 0, fail: 0, aborted: true, reason: "account_changed" };
  if (_tagGovUnfinishedBatches > 0 && _tagGovRunAccount !== auth.account) {
    return { ok: 0, fail: 0, aborted: true, reason: "account_changed" };
  }
  if (_tagGovUnfinishedBatches === 0) {
    _tagGovRunAccount = auth.account;
    _tagGovClaimProgress(auth.account);
    _tagGovSetTabBusy(true);
    // fresh run: reset the cross-batch accumulators
    _tagGovProblems.length = 0;
    _tagGovRunTotals.ok = 0;
    _tagGovRunTotals.fail = 0;
    _tagGovRunTotals.skipped = 0;
    _tagGovDrainCount = 0;
    _tagGovCancelRequested = false;
  }
  _tagGovUnfinishedBatches++;
  const run = _tagGovBatchChain.then(() =>
    _tagGovWithAccountLock(auth.account, () => _runTagGovBatch(ops, auth.account)).finally(() => {
      _tagGovUnfinishedBatches--;
      if (_tagGovUnfinishedBatches === 0) {
        _tagGovRunAccount = "";
        _tagGovSetTabBusy(false);
        // Backstop for a batch that threw before reaching the tail: never leave
        // the card stuck on a dead "Stop" button.
        _tagGovSetProgressBtn("dismiss", auth.account);
      }
    })
  );
  _tagGovBatchChain = run.catch(() => {});
  return run;
}

// Warn before leaving while batches are running/queued. Completed re-saves persist
// server-side; re-running the same merge after a reload resumes safely (posts/all
// only returns still-untagged bookmarks) — but the rest of the running batch and
// every queued batch would be silently dropped.
window.addEventListener("beforeunload", (e) => {
  if (_tagGovUnfinishedBatches > 0) {
    e.preventDefault();
    e.returnValue = ""; // required by Chrome to show the native confirmation
  }
});

// True only while the drain-time tail re-render runs: renderTagGov must not re-freeze
// rows from _tagGovActiveTags then (the tags are released a few microtasks later), but
// MUST re-freeze them on user-triggered re-renders (ignore/refresh/AI) mid-run.
let _tagGovIsTailRender = false;

async function _tagGovTailRefresh(expectedAccount) {
  _tagGovSetProgressBtn("dismiss", expectedAccount);
  // Persist the run outcome: the summary and attention list were DOM-only and
  // vanished if the page closed before the user came back to look at them.
  try {
    const lastRunKey = pbpAccountStorageKey("_tagGovLastRun", expectedAccount);
    await chrome.storage.local.set({ [lastRunKey]: {
      account: expectedAccount,
      ts: Date.now(),
      ok: _tagGovRunTotals.ok,
      fail: _tagGovRunTotals.fail,
      skipped: _tagGovRunTotals.skipped,
      problems: _tagGovProblems.slice(0, TAG_GOV_PROBLEMS_CAP)
    } });
  } catch (_) {}
  if (!(await getTagGovAuth(expectedAccount))) return;
  const fresh = await loadTagCounts(true, expectedAccount);
  if (!(await getTagGovAuth(expectedAccount))) return;
  if (fresh) updateTagGovOverview(fresh);
  _tagGovIsTailRender = true;
  try {
    await renderTagGov();
    await renderLowCountTags();
  } finally {
    _tagGovIsTailRender = false;
  }
}

async function _runTagGovBatch(ops, expectedAccount) {
  if (_tagGovDrainCount > 0) {
    // Queued behind an aborted/stopped batch: drop without touching the progress
    // line (it shows the abort explanation), but still refresh the panel at drain.
    _tagGovDrainCount--;
    // The stopped run is fully drained — a new batch confirmed during the drain
    // window must NOT inherit the stale cancel flag (it would die at its first
    // checkpoint with zero ops executed, shown as "Stopped" the user never asked for).
    if (_tagGovDrainCount === 0) _tagGovCancelRequested = false;
    if (_tagGovUnfinishedBatches === 1) await _tagGovTailRefresh(expectedAccount);
    return { ok: 0, fail: 0, aborted: true };
  }
  if (!ops || ops.length === 0) return { ok: 0, fail: 0, aborted: false };
  _tagGovClaimProgress(expectedAccount);
  _tagGovSetProgress(0, expectedAccount);
  const runAuth = await getTagGovAuth(expectedAccount);
  if (!runAuth) {
    const pt = $id("tag-gov-progress-text");
    const pg = $id("tag-gov-progress");
    if (_tagGovUiOwned(expectedAccount) && pg) pg.hidden = false;
    if (_tagGovUiOwned(expectedAccount) && pt) pt.textContent = t("pinboardErrorAuth");
    _tagGovSetProgressBtn("dismiss", expectedAccount);
    // Account changes cancel the captured plan; they are not operation failures.
    if (_tagGovUnfinishedBatches === 1) await _tagGovTailRefresh(expectedAccount);
    return { ok: 0, fail: 0, aborted: true, reason: "account_changed" };
  }

  const progress = $id("tag-gov-progress");
  const ptext = $id("tag-gov-progress-text");
  // Visibility from any scroll position is handled by CSS — #tag-gov-progress is
  // position:sticky at the viewport bottom, so no scroll jump is needed here.
  if (_tagGovUiOwned(expectedAccount) && progress) progress.hidden = false;

  _tagGovSetProgressBtn("stop", expectedAccount);

  let ok = 0, fail = 0, aborted = false, cancelled = false, skippedTotal = 0;
  const enc = encodeURIComponent;

  for (let i = 0; i < ops.length; i++) {
    if (_tagGovCancelRequested) {
      cancelled = true;
      break;
    }
    try { await requireTagGovAuth(expectedAccount); }
    catch (_) { aborted = true; break; }
    const op = ops[i];
    // Bar = completed ops + fractional progress inside the current op. The old
    // (i + 1) / ops.length formula filled the bar at the START of each op — a
    // single-op batch showed 100% from the first second while 30 bookmarks were
    // still being re-saved.
    _tagGovSetProgress((i / ops.length) * 100, expectedAccount);
    const opLine =
      t("tagGovOpLabel", String(i + 1), String(ops.length)) + " " +
      "<span class=\"status-ic ok\">" + PBP_ICONS.check + "</span>" + ok + " " +
      "<span class=\"status-ic bad\">" + PBP_ICONS.cross + "</span>" + fail;
    const queueSuffix = () => {
      const waiting = _tagGovUnfinishedBatches - 1; // batches queued behind this one
      return waiting > 0 ? " · " + t("tagGovQueuedBatches", String(waiting)) : "";
    };
    if (_tagGovUiOwned(expectedAccount) && ptext) ptext.innerHTML = opLine + queueSuffix();

    if (op.op === "rename") {
      // tags/rename is broken server-side -- re-tag each bookmark instead (see helper above).
      try {
        const res = await retagBookmarksViaResave(expectedAccount, op.old, op.new, (done, total) => {
          if (total <= 0) return;
          _tagGovSetProgress(((i + done / total) / ops.length) * 100, expectedAccount);
          if (_tagGovUiOwned(expectedAccount) && ptext) {
            // Live ETA from the REAL bookmark total — the confirm-time estimate came
            // from possibly-stale cached counts. Upcoming ops add one posts/all each.
            const remainSec = (total - done) * 3.2 + (ops.length - i - 1) * 3.2;
            const eta = remainSec >= 3 ? " · " + t("tagGovTimeLeft", formatTagGovEst(remainSec)) : "";
            ptext.innerHTML = opLine + " " + t("tagGovRetagProgress", String(done), String(total)) + eta + queueSuffix();
          }
        });
        // Collect partial results BEFORE the abort check — an aborted op returns the
        // failed/skipped rows it accumulated, exactly what the user needs to see then.
        skippedTotal += res.skipped;
        for (const pr of (res.problems || [])) {
          _tagGovProblems.push({ ...pr, old: op.old, new: op.new });
        }
        if (res.cancelled) {
          cancelled = true;
          break;
        }
        if (res.aborted) {
          aborted = true;
          break;
        }
        // Skipped bookmarks don't fail the task — they are listed for manual editing.
        if (res.failed === 0) {
          ok++;
        } else {
          fail++;
        }
      } catch (e) {
        if (e?.code === "account_changed") { aborted = true; break; }
        console.error("[tag-gov] op failed:", op, e);
        fail++;
      }
      continue;
    }

    if (op.op !== "delete") {
      fail++;
      continue;
    }
    try {
      let auth = await requireTagGovAuth(expectedAccount);
      let opUrl = `https://api.pinboard.in/v1/tags/delete?tag=${enc(op.tag)}&auth_token=${enc(auth.token)}&format=json`;
      let resp = await pinboardFetch(opUrl);
      if (resp.status === 429) {
        if (_tagGovUiOwned(expectedAccount) && ptext) ptext.textContent = t("tagGovRateLimitWait");
        await new Promise(r => setTimeout(r, TAG_GOV_RETRY_WAIT_MS));
        if (_tagGovCancelRequested) {
          cancelled = true;
          break;
        }
        auth = await requireTagGovAuth(expectedAccount);
        opUrl = `https://api.pinboard.in/v1/tags/delete?tag=${enc(op.tag)}&auth_token=${enc(auth.token)}&format=json`;
        resp = await pinboardFetch(opUrl);
        if (resp.status === 429) {
          aborted = true;
          break;
        }
      }
      await requireTagGovAuth(expectedAccount);
      if (!resp.ok) {
        fail++;
        _tagGovProblems.push({ kind: "failed", tag: op.tag, reason: "HTTP " + resp.status });
        continue;
      }
      const data = await resp.json();
      if (data.result === "done") {
        ok++;
      } else {
        fail++;
        _tagGovProblems.push({ kind: "failed", tag: op.tag, reason: String(data.result || "unknown") });
      }
    } catch (e) {
      if (e?.code === "account_changed") { aborted = true; break; }
      console.error("[tag-gov] op failed:", op, e);
      fail++;
      _tagGovProblems.push({ kind: "failed", tag: op.tag, reason: e?.name || "network error" });
    }
  }

  if (!aborted && !cancelled) _tagGovSetProgress(100, expectedAccount);
  const cancelledBehind = (aborted || cancelled) ? _tagGovUnfinishedBatches - 1 : 0;
  if (aborted || cancelled) {
    _tagGovDrainCount = cancelledBehind;
    // Solo stop (nothing queued behind): release the cancel flag right away so a
    // batch confirmed during this batch's tail refresh runs normally.
    if (cancelledBehind === 0) _tagGovCancelRequested = false;
  }

  _tagGovRunTotals.ok += ok;
  _tagGovRunTotals.fail += fail;
  _tagGovRunTotals.skipped += skippedTotal;

  if (_tagGovUiOwned(expectedAccount) && ptext) {
    const behindNote = cancelledBehind > 0 ? " · " + t("tagGovQueuedCancelled", String(cancelledBehind)) : "";
    ptext.textContent = cancelled
      ? t("tagGovStopped") + behindNote
      : aborted
        ? t("tagGovAborted429") + behindNote
        : t("tagGovDoneSummary", String(_tagGovRunTotals.ok), String(_tagGovRunTotals.fail))
          + (_tagGovRunTotals.skipped > 0 ? " · " + t("tagGovSkippedSummary", String(_tagGovRunTotals.skipped)) : "");
    // The manual-attention list renders below the (viewport-pinned) progress row, at
    // the bottom of the panel — out of sight when scrolled up. Link to it explicitly.
    if (_tagGovProblems.length > 0) {
      ptext.appendChild(document.createTextNode(" · "));
      const seeBelow = document.createElement("a");
      seeBelow.href = "#";
      seeBelow.textContent = t("tagGovProblemsSeeBelow");
      seeBelow.addEventListener("click", (ev) => {
        ev.preventDefault();
        // block:"center" keeps the list clear of the sticky progress card at the bottom
        pbpScrollIntoView($id("tag-gov-problems"), { block: "center", behavior: "smooth" });
      });
      ptext.appendChild(seeBelow);
    }
  }
  renderTagGovProblems(expectedAccount);

  // Refresh detection/UI only when this is the last batch in the queue: a mid-queue
  // renderTagGov() rebuilt the group rows under the user (resetting a canonical radio
  // they had just changed — risking a merge in the wrong direction) and burned one
  // forced tags/get per batch. The old pre-purge of cached_user_tags was redundant —
  // loadTagCounts(true) bypasses and rewrites the cache itself — and cleared popup
  // autocomplete's cache whenever the refetch failed.
  if (_tagGovUnfinishedBatches === 1) await _tagGovTailRefresh(expectedAccount);

  return { ok, fail, aborted, cancelled };
}

async function loadTagCounts(forceFresh = false, expectedAccount = "") {
  try {
    const startAuth = await getTagGovAuth(expectedAccount);
    if (!startAuth) return null;
    if (!forceFresh) {
      const cached = await chrome.storage.local.get({ cached_user_tags: null });
      const entry = _tagGovOwned(cached.cached_user_tags, startAuth.account);
      if (entry) {
        const { counts, timestamp } = entry;
        if (Date.now() - timestamp < TAG_CACHE_TTL) {
          if (!(await getTagGovAuth(startAuth.account))) return null;
          return counts || null;
        }
      }
    }
    let auth = startAuth;
    const url = (token) => `https://api.pinboard.in/v1/tags/get?auth_token=${encodeURIComponent(token)}&format=json`;
    // tags/get on a slow pinboard day exceeds the default 15s timeout (seen in the
    // field: AbortError and Failed-to-fetch back-to-back) — allow 30s and retry once
    // through the queue before declaring failure to the panel.
    let resp;
    try {
      resp = await pinboardFetch(url(auth.token), { timeoutMs: 30000 });
    } catch (e) {
      console.warn("[tag-gov] tags/get failed, retrying once:", e?.name || e);
      auth = await requireTagGovAuth(startAuth.account);
      resp = await pinboardFetch(url(auth.token), { timeoutMs: 30000 });
    }
    if (!resp || !resp.ok) return null;
    const counts = await resp.json();
    if (!counts || typeof counts !== "object") return null;
    if (!(await getTagGovAuth(startAuth.account))) return null;
    await chrome.storage.local.set({
      cached_user_tags: { account: startAuth.account, counts, timestamp: Date.now() }
    });
    return counts;
  } catch (e) {
    // Expected failure mode (slow/unreachable API) and already surfaced in the UI —
    // warn, not error: unpacked extensions list console.error on chrome://extensions,
    // which should stay reserved for real defects.
    if (e?.code !== "account_changed") console.warn("[tag-gov] loadTagCounts failed:", e);
    return null;
  }
}

async function renderTagGov() {
  const container = $id("tag-gov-groups");
  if (!container) return;
  const auth = await getTagGovAuth();
  if (!auth) { container.replaceChildren(); return; }

  // Do NOT empty the container before the awaits below: a paint during the async gap
  // collapses the panel height, Chrome clamps the scroll offset, and the page visibly
  // jumps to the top. Build the new content first, then swap atomically at the end.
  const ignoredKey = pbpAccountStorageKey("_tagGovIgnored", auth.account);
  const aiKey = pbpAccountStorageKey("_tagGovAiGroups", auth.account);
  const stored = await chrome.storage.local.get(["cached_user_tags", ignoredKey, aiKey]);
  if (!(await getTagGovAuth(auth.account))) return;
  const tagCounts = _tagGovOwned(stored.cached_user_tags, auth.account)?.counts;

  if (!tagCounts) {
    const empty = document.createElement("div");
    empty.className = "fg";
    empty.textContent = t("tagGovNoGroups");
    container.replaceChildren(empty);
    return;
  }

  const ignoredList = _tagGovOwned(stored[ignoredKey], auth.account)?.ids || [];
  // AI groups are a stored snapshot and never expire on their own. After a merge the
  // heuristic groups self-heal (rebuilt from fresh counts) but stale AI groups would
  // keep showing vanished members — worse, an AI group whose canonical was itself
  // just merged away would re-create that tag if merged. Filter members against the
  // live counts, refresh their counts, and drop groups left with fewer than 2 members.
  const aiGroups = ((_tagGovOwned(stored[aiKey], auth.account)?.groups) || [])
    .map(g => ({
      ...g,
      members: (g.members || [])
        .filter(m => m && Object.prototype.hasOwnProperty.call(tagCounts, m.tag))
        .map(m => ({ ...m, count: tagCounts[m.tag] }))
    }))
    .filter(g => g.members.length >= 2
      && g.members.some(m => m.tag === g.suggestedCanonical));

  let allGroups = pbpTagGovFindGroups(tagCounts);
  allGroups = allGroups.concat(aiGroups);
  // Heuristic and AI detection share the same id scheme (sorted members joined) and
  // the AI prompt is steered toward the same plural/separator/typo shapes — without
  // dedupe a duplicated group rendered twice with IDENTICAL radio name="group-<id>",
  // so the two rows fought over one radio group and a canonical chosen in one row
  // silently uncheck-ed the other. Keep the first occurrence (heuristic wins).
  const seenGroupIds = new Set();
  allGroups = allGroups.filter(g => !seenGroupIds.has(g.id) && seenGroupIds.add(g.id));
  allGroups = allGroups.filter(g => !ignoredList.includes(g.id));

  if (!allGroups.length) {
    const empty = document.createElement("div");
    empty.className = "fg";
    empty.textContent = t("tagGovNoGroups");
    container.replaceChildren(empty);
    return;
  }

  const frag = document.createDocumentFragment();
  for (const group of allGroups) {
    const row = document.createElement("div");
    row.className = "tag-gov-group-row";

    const badge = document.createElement("span");
    badge.className = "tag-gov-kind-badge";
    const kindKey = group.kind === "plural" ? "tagGovKindPlural"
      : group.kind === "separator" ? "tagGovKindSeparator"
      : group.kind === "typo" ? "tagGovKindTypo"
      : "tagGovKindAi";
    badge.textContent = t(kindKey);
    row.appendChild(badge);

    const membersList = document.createElement("div");
    membersList.className = "tag-gov-members";
    for (const member of group.members) {
      const label = document.createElement("label");
      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = "group-" + group.id;
      radio.value = member.tag;
      radio.defaultChecked = (member.tag === group.suggestedCanonical);
      label.appendChild(radio);
      const text = document.createElement("span");
      text.textContent = " " + member.tag + " (" + member.count + ")";
      label.appendChild(text);
      membersList.appendChild(label);
    }
    row.appendChild(membersList);

    if (group.kind === "ai" && group.reason) {
      const reason = document.createElement("small");
      reason.className = "tag-gov-reason";
      reason.textContent = group.reason;
      row.appendChild(reason);
    }

    const btnGroup = document.createElement("div");
    btnGroup.className = "tag-gov-actions";

    const mergeBtn = document.createElement("button");
    mergeBtn.className = "btn btn-sm";
    mergeBtn.textContent = t("tagGovMerge");
    mergeBtn.addEventListener("click", () => {
      const selected = row.querySelector("input[type=\"radio\"]:checked");
      const canonical = selected ? selected.value : group.suggestedCanonical;
      if (typeof confirmMergeGroup === "function") confirmMergeGroup(group, canonical, mergeBtn, auth.account);
    });
    btnGroup.appendChild(mergeBtn);

    const ignoreBtn = document.createElement("button");
    ignoreBtn.className = "btn btn-sm";
    ignoreBtn.textContent = t("tagGovIgnore");
    ignoreBtn.addEventListener("click", async () => {
      await _tagGovIgnoreGroup(auth.account, group.id);
      if (await getTagGovAuth(auth.account)) await renderTagGov();
    });
    btnGroup.appendChild(ignoreBtn);

    row.appendChild(btnGroup);
    frag.appendChild(row);

    // Re-freeze rows whose tags belong to a queued/RUNNING op — a user-triggered
    // re-render (ignore/refresh/AI) mid-run must restore the frozen state even with
    // a single batch running (the old counter>1 test dropped it, leaving a clickable
    // row whose confirm then no-oped silently on the active-tags guard). The one
    // exception is the drain-time tail render, where the active tags are released a
    // few microtasks later and marking would freeze the just-finished group's row.
    if (!_tagGovIsTailRender
        && _tagGovUnfinishedBatches > 0
        && group.members.some(m => m && m.tag && _tagGovActiveTags.has(m.tag.toLowerCase()))) {
      _tagGovMarkRowQueued(row);
    }
  }
  container.replaceChildren(frag);
}

async function renderLowCountTags() {
  const listContainer = $id("tag-gov-lowcount-list");
  if (!listContainer) return;
  const auth = await getTagGovAuth();
  if (!auth) { listContainer.replaceChildren(); return; }

  // Same scroll-jump guard as renderTagGov: never leave the container empty across
  // an await — build first, swap atomically.
  const cached = await chrome.storage.local.get({ cached_user_tags: null });
  if (!(await getTagGovAuth(auth.account))) return;
  const counts = _tagGovOwned(cached.cached_user_tags, auth.account)?.counts;
  if (!counts) {
    listContainer.replaceChildren();
    return;
  }

  const lowCount = pbpTagGovLowCountTags(counts, 1);
  if (!lowCount.length) {
    const empty = document.createElement("div");
    empty.textContent = t("tagGovNoLowCount");
    listContainer.replaceChildren(empty);
    return;
  }

  const table = document.createElement("div");
  table.className = "tag-gov-lowcount-table";
  const boxes = [];
  let lastIdx = null;            // anchor = last individually-clicked box; resets each render
  lowCount.forEach((item, i) => {
    const row = document.createElement("div");
    row.className = "tag-gov-lowcount-row";
    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "tag-gov-lowcount-checkbox";
    checkbox.value = item.tag;
    checkbox.dataset.account = auth.account;
    checkbox.addEventListener("click", (e) => {
      // The browser already toggled this checkbox before the click handler runs,
      // so checkbox.checked is the new state and the range follows it. The anchor
      // moves only on a plain click; shift-clicks extend from the same anchor
      // (native checkbox-list range semantics).
      if (e.shiftKey && lastIdx !== null) {
        pbpTagGovApplyShiftRange(boxes, lastIdx, i);
      } else {
        lastIdx = i;
      }
    });
    boxes.push(checkbox);
    label.appendChild(checkbox);
    const text = document.createElement("span");
    text.textContent = " " + item.tag + " (" + item.count + ")";
    label.appendChild(text);
    row.appendChild(label);
    table.appendChild(row);
  });
  listContainer.replaceChildren(table);

  const summary = $id("tag-gov-lowcount")?.querySelector("summary");
  if (summary) summary.textContent = t("tagGovLowCountTitle") + " (" + lowCount.length + ")";

  const selectAll = $id("tag-gov-select-all");
  if (selectAll) {
    selectAll.checked = false;
    selectAll.onchange = () => {
      listContainer.querySelectorAll(".tag-gov-lowcount-checkbox")
        .forEach(cb => { cb.checked = selectAll.checked; });
    };
  }
}

// ---- Wayback Log Viewer ----
// Map a raw wayback outcome detail to an i18n explanation key, or null for unknown.
function waybackErrorKey(detail) {
  const d = String(detail || "").toLowerCase();
  if (!d) return null;
  if (d.includes("401") || d.includes("unauthorized")) return "archiveErrAuth";
  if (d.includes("failed to fetch") || d.includes("network")) return "archiveErrNetwork";
  if (d.includes("too-many-daily-captures")) return "archiveErrDailyLimit";
  if (d.includes("blocked")) return "archiveErrBlocked";
  if (d.includes("no-access") || d.includes("403")) return "archiveErrNoAccess";
  if (d.includes("not-found") || d.includes("404")) return "archiveErrNotFound";
  if (/http-5\d\d/.test(d) || d.includes("internal-server-error") || d.includes("service-unavailable") || d.includes("gateway") || d.includes("celery") || d.includes("job-failed") || d.includes("no-browsers")) return "archiveErrServer";
  return null;
}

// The signed-in Pinboard owner the archive log is scoped by: "" when signed
// out (logged-out saves are logged with account ""), or null when the settings
// read itself failed. Render and Clear MUST agree on this value -- when they
// drifted apart, Clear wiped rows the list had never shown. Callers that
// DELETE must treat null as "unknown, do nothing" rather than folding it into
// the signed-out "" bucket, which would take the logged-out rows with it.
async function pbpWaybackLogAccount() {
  try {
    const sNow = await pbpReadSettingsWithSecrets({ pinboardToken: SETTINGS_DEFAULTS.pinboardToken });
    return pbpPinboardAccountFromToken(sNow.pinboardToken);
  } catch (e) {
    // Never token/account text -- only the platform error's shape.
    console.warn("[wayback] owner read failed:", e && e.name, e && e.message);
    return null;
  }
}

// Rows belonging to `account`, using the exact predicate renderWaybackLog
// filters with. Strict `===` on purpose: `(entry.account || "") === account`
// would make a signed-out clear ("" account) also match the legacy rows that
// carry no account field at all.
function pbpWaybackLogOwnedBy(entry, account) {
  return !!entry && typeof entry === "object" && entry.account === account;
}

// Runs concurrently (Clear, the retry timer, and the account-change listener
// below can all be in flight at once) and every run appends into the same
// container across two awaits. Without a generation stamp the run that STARTED
// first could append last -- painting the previous account's rows on top of the
// new account's freshly cleared list, which is exactly the leak the owner gate
// exists to prevent. Newest run wins; older ones bail before they append.
let _waybackLogRenderGen = 0;

async function renderWaybackLog() {
  const gen = ++_waybackLogRenderGen;
  const container = $id("wayback-log");
  if (!container) return;

  container.replaceChildren();

  // Owner gate: every row is a page URL this account asked archive.org to keep,
  // so it must never surface under a different (or signed-out) Pinboard login.
  // Derived the one correct way -- the secret-aware settings read, never the
  // token form field. Entries written before the log carried an owner have no
  // account at all and stay hidden from everyone, signed out included.
  // null (the read itself failed) is UNKNOWN, never signed-out: folding it into
  // "" would hand the anonymous rows -- background.js logs archive_url saves
  // with account "" when no token is set -- to whoever hits a transient storage
  // error. Fail closed: no rows, no Clear, and no empty-state claim either.
  const account = await pbpWaybackLogAccount();

  let log = [];
  if (account !== null) {
    try {
      const data = await chrome.storage.local.get({ _waybackLog: [] });
      log = Array.isArray(data._waybackLog) ? data._waybackLog : [];
    } catch (e) {
      console.warn("[wayback] log read failed:", e && e.name, e && e.message);
      log = [];
    }
    log = log.filter(entry => pbpWaybackLogOwnedBy(entry, account));
  }

  // Both awaits are behind us; a newer run has already re-cleared the container
  // and owns the paint from here on.
  if (gen !== _waybackLogRenderGen) return;

  // Show the Clear button only when there's something to clear
  const clearBtn = $id("wayback-log-clear");
  if (clearBtn) clearBtn.style.display = log.length ? "" : "none";

  // Unknown owner: leave the panel blank rather than assert "no requests yet",
  // which would be a claim about a log we could not scope. Storage reads fail
  // transiently, and every other entry point (reopening Settings, the retry
  // timer, the account-change listener below) renders again from scratch.
  if (account === null) return;

  if (!log.length) {
    const empty = document.createElement("div");
    empty.className = "wayback-log-empty";
    empty.textContent = t("archiveLogEmpty");
    container.appendChild(empty);
    return;
  }

  const reversed = [...log].reverse();

  function buildRow(entry) {
    const row = document.createElement("div");
    row.className = "wayback-log-row";

    const urlEl = document.createElement("a");
    urlEl.className = "wayback-log-url";
    let urlText = "";
    try { urlText = entry.url || ""; } catch (_) { urlText = ""; }
    urlEl.title = urlText;
    if (urlText) {
      urlEl.href = "https://web.archive.org/web/*/" + urlText;
      urlEl.target = "_blank";
      urlEl.rel = "noopener";
    }
    const urlTextSpan = document.createElement("span");
    urlTextSpan.className = "wayback-log-url-text";
    urlTextSpan.textContent = urlText;
    urlEl.appendChild(urlTextSpan);
    // Shared external-link mark (class added for the 10px .ext-icon sizing);
    // static PBP_ICONS constant, never page content.
    urlEl.insertAdjacentHTML("beforeend", PBP_ICONS.extOpen.replace('<svg ', '<svg class="ext-icon" '));

    const timeEl = document.createElement("span");
    timeEl.className = "wayback-log-time";
    timeEl.textContent = _waybackRelTime(entry.ts);

    const outcomeEl = document.createElement("span");
    outcomeEl.className = "wayback-log-outcome";
    const outcome = (typeof entry.outcome === "string") ? entry.outcome : "";
    let outcomeText;
    let showRetry = false;
    let showPermissionHelp = false;
    if (outcome === "requested") {
      outcomeText = t("archiveOutcomeRequested");
    } else if (outcome.startsWith("job:")) {
      outcomeText = t("archiveOutcomeRequested");
      outcomeEl.title = outcome;
    } else if (outcome === "skipped") {
      outcomeText = t("archiveOutcomeSkipped");
    } else if (outcome === "skippedPrivate") {
      outcomeText = t("archiveOutcomeSkippedPrivate");
    } else if (outcome === "permDenied") {
      outcomeText = t("archiveOutcomePermMissing");
      showPermissionHelp = true;
    } else if (outcome === "rate-limited") {
      outcomeText = t("archiveOutcomeRateLimited");
      outcomeEl.title = t("archiveErrRateLimited");
      showRetry = true;
    } else if (outcome === "timeout") {
      outcomeText = t("archiveOutcomeTimeout");
      outcomeEl.title = t("archiveErrTimeoutHint");
      showRetry = true;
    } else if (outcome.startsWith("error")) {
      const detail = outcome.startsWith("error:") ? outcome.slice(6) : "";
      const errKey = waybackErrorKey(detail);
      outcomeText = errKey
        ? t("archiveOutcomeError") + " · " + t(errKey)
        : (detail ? t("archiveOutcomeError") + " · " + detail.slice(0, 48) : t("archiveOutcomeError"));
      outcomeEl.title = outcome;
      showRetry = true;
    } else {
      outcomeText = outcome;
    }
    outcomeEl.textContent = outcomeText;
    const outcomeWrap = document.createElement("span");
    outcomeWrap.className = "wayback-log-outcome-wrap";
    outcomeWrap.appendChild(outcomeEl);

    row.appendChild(urlEl);
    row.appendChild(timeEl);
    row.appendChild(outcomeWrap);

    if (showPermissionHelp) {
      const help = document.createElement("button");
      help.type = "button";
      help.className = "wayback-perm-help";
      help.setAttribute("aria-label", t("waybackPermDenied"));
      help.innerHTML = PBP_ICONS.warning;
      help.addEventListener("click", () => {
        const target = $id("opt-wayback-enabled");
        pbpScrollIntoView(target, { block: "center", behavior: "smooth" });
        target?.focus({ preventScroll: true });
      });
      outcomeWrap.appendChild(help);

      const tip = document.createElement("span");
      tip.className = "wayback-perm-tip";
      tip.setAttribute("role", "note");
      tip.textContent = t("waybackPermDenied");
      row.appendChild(tip);
    }

    if (showRetry && entry.url) {
      const btn = document.createElement("button");
      btn.className = "wayback-log-retry";
      btn.title = t("archiveRetry");
      btn.setAttribute("aria-label", t("archiveRetry"));
      btn.innerHTML = PBP_ICONS.refresh;
      btn.addEventListener("click", async () => {
        // The SW acknowledges AFTER the archive attempt has written its log
        // entry, so re-rendering on response shows the real outcome — the old
        // fixed 2.5s timer re-rendered long before the 10-30s archive timeout
        // and made this button look dead.
        btn.disabled = true;
        try { await chrome.runtime.sendMessage({ type: "archive_url", url: entry.url, force: true }); } catch (_) {}
        renderWaybackLog();
      });
      row.appendChild(btn);
    }

    return row;
  }

  const visible = reversed.slice(0, 10);
  const rest = reversed.slice(10);

  for (const entry of visible) {
    container.appendChild(buildRow(entry));
  }

  if (rest.length > 0) {
    const details = document.createElement("details");
    details.className = "wayback-log-more";
    const summary = document.createElement("summary");
    summary.textContent = t("archiveLogMore", String(rest.length));
    details.appendChild(summary);
    for (const entry of rest) {
      details.appendChild(buildRow(entry));
    }
    container.appendChild(details);
  }
}

// The owner gate above runs once per render, and the Archive panel is NOT in
// activateTab's lazy-rerender set -- so a token swap made in another tab of this
// same page left the previous account's rows (page URLs, private bookmarks
// included) on screen for as long as the page stayed open. Re-render on the
// three keys that can change who is signed in, whichever area carries them;
// renderWaybackLog re-derives the account itself and its generation stamp
// settles concurrent runs. Same shape as options-vocab.js's account listener.
if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if ((area !== "sync" && area !== "local")
        || !(changes.pinboardToken || changes.optSyncEnabled || changes.syncApiKeys)) return;
    renderWaybackLog();
  });
}

function _waybackRelTime(ts) {
  if (!ts) return "";
  const diff = Math.max(0, Date.now() - ts);
  const s = Math.floor(diff / 1000);
  if (s < 60) return t("offlineJustNow");
  const m = Math.floor(s / 60);
  if (m < 60) return t("offlineMinAgo", String(m));
  const h = Math.floor(m / 60);
  if (h < 24) return t("offlineHourAgo", String(h));
  const d = Math.floor(h / 24);
  return t("offlineDayAgo", String(d));
}
