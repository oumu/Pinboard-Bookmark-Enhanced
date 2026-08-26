// ============================================================
// Pinboard Bookmark Enhanced - Tab Set, Batch Save & Tag Presets
// ============================================================

let batchAiPermissionPending = null;

async function readBatchAccount() {
  const raw = await pbpReadSettingsWithSecrets({ pinboardToken: "" });
  const token = deobfuscateKey(raw.pinboardToken) || "";
  return { token, account: pbpPinboardAccountFromToken(token) };
}

function batchAiPermissionOrigins(validTabs, s) {
  const origins = validTabs.map(tab => new URL(tab.url).origin + "/*");
  const providerOrigin = _aiTargetOriginPattern(s);
  if (providerOrigin) origins.push(providerOrigin);
  return [...new Set(origins)];
}

function batchAiPermissionRows(origins, s) {
  const providerOrigin = _aiTargetOriginPattern(s);
  const provider = s.aiProvider || "gemini";
  const providerKey = "prov" + provider[0].toUpperCase() + provider.slice(1);
  const translated = t(providerKey);
  const providerName = translated === providerKey ? provider : translated;
  return origins.map(pattern => {
    const origin = pattern.replace(/\/\*$/, "");
    return pattern === providerOrigin ? t("batchPermProvider", providerName, origin) : origin;
  });
}

function showBatchAiPermission(origins, s) {
  const panel = $id("batch-permission");
  const title = $id("batch-permission-title");
  const list = $id("batch-permission-list");
  if (!panel || !title || !list) return;
  title.textContent = t("batchPermConfirm", String(origins.length));
  list.replaceChildren(...batchAiPermissionRows(origins, s).map(text => {
    const item = document.createElement("li");
    item.textContent = text;
    return item;
  }));
  clearTimeout(_batchPermHideTimer);
  panel.classList.remove("dismissing");
  panel.classList.remove("hidden");
  $id("batch-permission-grant")?.focus();
}

let _batchPermHideTimer = null;
function hideBatchAiPermission() {
  const panel = $id("batch-permission");
  if (panel) {
    if (!panel.classList.contains("hidden")
        && document.documentElement.classList.contains("motion-ready")) {
      // Mirror the fadeSlideDown entrance on the way out (all three callers
      // are direct responses to a grant/cancel click). motion-ready gate keeps
      // the harness pages on synchronous .hidden semantics.
      clearTimeout(_batchPermHideTimer);
      panel.classList.add("dismissing");
      _batchPermHideTimer = setTimeout(() => {
        panel.classList.remove("dismissing");
        panel.classList.add("hidden");
      }, 120);
    } else {
      panel.classList.remove("dismissing");
      panel.classList.add("hidden");
    }
  }
  const grant = $id("batch-permission-grant");
  const cancel = $id("batch-permission-cancel");
  if (grant) grant.disabled = false;
  if (cancel) cancel.disabled = false;
}

function restoreBatchButton(batchBtn) {
  setBtnIcon(batchBtn, "pin", t("batchSaveBtn"));
  batchBtn.disabled = false;
}

async function dispatchBatchSave(snapshot, batchBtn, account) {
  const resp = await chrome.runtime.sendMessage({ action: "startBatchSave", tabs: snapshot, account });
  if (resp && resp.status === "account_changed") {
    showStatus("status-msg", t("pinboardErrorAuth"), "error");
    restoreBatchButton(batchBtn);
    return;
  }
  if (resp && resp.status === "busy") {
    showStatus("status-msg", t("batchRunningBg"), "success");
    restoreBatchButton(batchBtn);
    return;
  }
  const progress = $id("batch-progress");
  if (progress) {
    clearTimeout(progress._pbpDoneLinger);
    clearTimeout(progress._pbpDoneFade);
    progress.classList.remove("dismissing");
    progress.classList.remove("hidden");
  }
  setBtnIcon(batchBtn, "pin", t("batchProgress", "0", String(snapshot.length), "0", "0"));
}

// ---- Tab Set & Batch Bookmark Save ----
function setupTabSet() {
  const btn = $id("save-tabset-btn");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    const origLabel = t("saveTabsBtn");
    setBtnIcon(btn, "tabs", t("batchSaving"));

    try {
      const tabs = await chrome.tabs.query({ currentWindow: true });
      const validTabs = tabs.filter(tab =>
        tab.url && (tab.url.startsWith("http://") || tab.url.startsWith("https://"))
      );

      if (validTabs.length === 0) {
        showStatus("status-msg", t("batchNoValidTabs"), "error");
        setBtnIcon(btn, "tabs", origLabel);
        btn.disabled = false;
        return;
      }

      const tabsData = validTabs.map(tab => ({
        title: tab.title || tab.url,
        url: tab.url
      }));

      await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          { action: "saveTabSet", tabsData: tabsData },
          (response) => {
            if (chrome.runtime.lastError) {
              console.error("sendMessage error:", chrome.runtime.lastError);
            }
            resolve(response);
          }
        );
      });

      setBtnIcon(btn, "tabs", t("batchSent"));
      setTimeout(() => {
        setBtnIcon(btn, "tabs", origLabel);
        btn.disabled = false;
      }, 2000);

    } catch (e) {
      console.error("Save tab set error:", e);
      showStatus("status-msg", t("batchFailed", e.message), "error");
      setBtnIcon(btn, "tabs", origLabel);
      btn.disabled = false;
    }
  });

  const batchBtn = $id("batch-bookmark-btn");
  if (!batchBtn) return;
  const grantBtn = $id("batch-permission-grant");
  const cancelBtn = $id("batch-permission-cancel");

  grantBtn?.addEventListener("click", async () => {
    const pending = batchAiPermissionPending;
    if (!pending) return;
    grantBtn.disabled = true;
    if (cancelBtn) cancelBtn.disabled = true;
    try {
      const granted = await chrome.permissions.request({ origins: pending.origins });
      if (!granted) {
        showStatus("status-msg", t("batchPermDenied"), "error");
        grantBtn.disabled = false;
        if (cancelBtn) cancelBtn.disabled = false;
        return;
      }
      const current = await readBatchAccount();
      if (!current.account || current.account !== pending.account) {
        batchAiPermissionPending = null;
        hideBatchAiPermission();
        showStatus("status-msg", t("pinboardErrorAuth"), "error");
        restoreBatchButton(batchBtn);
        batchBtn.focus();
        return;
      }
      batchAiPermissionPending = null;
      hideBatchAiPermission();
      await dispatchBatchSave(pending.tabs, batchBtn, pending.account);
      const progress = $id("batch-progress");
      if (progress && !progress.classList.contains("hidden")) progress.focus();
      else batchBtn.focus();
    } catch (e) {
      showStatus("status-msg", t("batchFailed", e.message), "error");
      grantBtn.disabled = false;
      if (cancelBtn) cancelBtn.disabled = false;
      if (!batchAiPermissionPending) {
        const progress = $id("batch-progress");
        if (progress) progress.classList.add("hidden");
        restoreBatchButton(batchBtn);
        batchBtn.focus();
      }
    }
  });

  cancelBtn?.addEventListener("click", () => {
    batchAiPermissionPending = null;
    hideBatchAiPermission();
    restoreBatchButton(batchBtn);
    batchBtn.focus();
  });

  batchBtn.addEventListener("click", async () => {
    try {
      const startAuth = await readBatchAccount();
      if (!startAuth.token || !startAuth.account) {
        showStatus("status-msg", t("batchNotLoggedIn"), "error");
        return;
      }
      // Re-entry guard is account-scoped: account B never renders or blocks on
      // account A's background progress record.
      try {
        const { batch_progress: bp } = await chrome.storage.local.get("batch_progress");
        if (bp?.account === startAuth.account && batchIsRunning(bp, Date.now(), BATCH_STALE_TTL)) {
          showStatus("status-msg", t("batchRunningBg"), "success");
          renderBatchProgress(bp, startAuth.account);
          return;
        }
      } catch (_) {}

      batchBtn.disabled = true;
      setBtnIcon(batchBtn, "pin", t("batchSaving"));
      const tabs = await chrome.tabs.query({ currentWindow: true });
      const validTabs = tabs.filter(tab => tab.url && (tab.url.startsWith("http://") || tab.url.startsWith("https://")));
      if (!validTabs.length) {
        showStatus("status-msg", t("batchNoTabs"), "error");
        setBtnIcon(batchBtn, "pin", t("batchSaveBtn")); batchBtn.disabled = false;
        return;
      }

      const useAiTags = settings.batchAiTags && hasAIKey(settings);
      const useAiSummary = settings.batchAiSummary && hasAIKey(settings);
      const snapshot = validTabs.map(tab => ({ id: tab.id, title: tab.title || tab.url, url: tab.url, incognito: !!tab.incognito }));
      if (useAiTags || useAiSummary) {
        const origins = batchAiPermissionOrigins(validTabs, settings);
        if (!(await chrome.permissions.contains({ origins }))) {
          const current = await readBatchAccount();
          if (current.account !== startAuth.account) throw new Error("account_changed");
          batchAiPermissionPending = { tabs: snapshot, origins, account: startAuth.account };
          showBatchAiPermission(origins, settings);
          setBtnIcon(batchBtn, "pin", t("batchSaveBtn"));
          return;
        }
      }
      const current = await readBatchAccount();
      if (current.account !== startAuth.account) throw new Error("account_changed");
      await dispatchBatchSave(snapshot, batchBtn, startAuth.account);
    } catch (e) {
      showStatus("status-msg", t("batchFailed", e.message), "error");
      const progress = $id("batch-progress");
      if (progress) progress.classList.add("hidden");
      setBtnIcon(batchBtn, "pin", t("batchSaveBtn")); batchBtn.disabled = false;
    }
  });

  wireBatchProgress();
}

// ---- Background batch progress (driven by storage.local.batch_progress) ----
function renderBatchProgress(p, currentAccount) {
  if (!p) return;
  if (!currentAccount || p.account !== currentAccount) return;
  const batchBtn = $id("batch-bookmark-btn");
  const progress = $id("batch-progress");
  const fill = $id("batch-progress-fill");
  const ptext = $id("batch-progress-text");
  const total = p.total || 0;
  const cur = Math.min(total, Math.max(0, Number(p.i) || 0));
  const pct = total ? Math.round((cur / total) * 100) : 0;
  if (progress) {
    clearTimeout(progress._pbpDoneLinger);
    clearTimeout(progress._pbpDoneFade);
    progress.classList.remove("dismissing");
    progress.classList.remove("hidden");
    progress.setAttribute("aria-valuenow", String(pct));
    progress.setAttribute("aria-valuetext", t("batchProgress", String(cur), String(total), String(p.saved || 0), String(p.failed || 0)));
  }
  if (fill) fill.style.width = pct + "%";
  // Counts are integers -> safe to interpolate; SVG icons avoid emoji font fallback.
  const queuedMsg = p.queued > 0 ? `  ${t("offlineQueued", String(p.queued))}` : "";
  if (ptext) ptext.innerHTML = `${cur}/${total}  <span class="status-ic ok">${PBP_ICONS.check}</span>${p.saved || 0}  <span class="status-ic bad">${PBP_ICONS.cross}</span>${p.failed || 0}${queuedMsg}${p.aiFailed ? `  AI<span class="status-ic bad">${PBP_ICONS.cross}</span>${p.aiFailed}` : ""}`;
  if (!batchBtn) return;
  if (p.done) {
    const skipMsg = p.skipped > 0 ? t("batchSkipped", String(p.skipped)) : "";
    const tooLongMsg = p.tooLong > 0 ? t("batchTooLong", String(p.tooLong)) : "";
    const queuedDoneMsg = p.queued > 0 ? ` · ${t("offlineQueued", String(p.queued))}` : "";
    const aiWarnMsg = p.aiFailed > 0 ? ` (AI failed: ${p.aiFailed})` : "";
    if (p.error === "not_logged_in") showStatus("status-msg", t("batchNotLoggedIn"), "error");
    else if (p.error === "account_changed") showStatus("status-msg", t("pinboardErrorAuth"), "error");
    // The SW's interrupted-batch sweep writes this terminal record; without its
    // own branch the raw token would leak into the UI via batchFailed. Same
    // wording as the notification the sweep fires.
    else if (p.error === "interrupted") showStatus("status-msg", t("batchInterrupted", String(cur), String(total)), "error");
    else if (p.error) showStatus("status-msg", t("batchFailed", p.error), "error");
    else {
      const hasFailure = (p.failed || 0) > 0 || (p.tooLong || 0) > 0;
      const kind = hasFailure ? "error" : (p.saved || 0) > 0 ? "success" : "info";
      showStatus("status-msg", t("batchDone", String(p.saved || 0), String(p.failed || 0)) + skipMsg + tooLongMsg + queuedDoneMsg + aiWarnMsg, kind);
    }
    setBtnIcon(batchBtn, "pin", t("batchSavedCount", String(p.saved || 0)));
    // Timer handles live on the element (not module lets: the test pages
    // slice this file into two Function bodies that couldn't share one
    // declaration). Every show site cancels them -- an uncancelled leftover
    // from the previous run would hide and re-label the new run's progress.
    if (progress) { clearTimeout(progress._pbpDoneLinger); clearTimeout(progress._pbpDoneFade); }
    const linger = setTimeout(() => {
      const restoreFocus = !!progress && document.activeElement === progress;
      if (progress) {
        if (document.documentElement.classList.contains("motion-ready")) {
          progress.classList.add("dismissing");
          progress._pbpDoneFade = setTimeout(() => { progress.classList.remove("dismissing"); progress.classList.add("hidden"); }, 120);
        } else {
          progress.classList.add("hidden");
        }
      }
      setBtnIcon(batchBtn, "pin", t("batchSaveBtn"));
      batchBtn.disabled = false;
      if (restoreFocus) batchBtn.focus();
    }, 1500);
    if (progress) progress._pbpDoneLinger = linger;
  } else {
    batchBtn.disabled = true;
    setBtnIcon(batchBtn, "pin", t("batchProgress", String(cur), String(total), String(p.saved || 0), String(p.failed || 0)));
  }
}

function wireBatchProgress() {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.batch_progress) {
      readBatchAccount().then(({ account }) => {
        if (account) renderBatchProgress(changes.batch_progress.newValue, account);
      }).catch(() => {});
    }
  });
  // Reopen restore: show a fresh running batch or a completion that happened
  // while the Popup was closed. The existing hide timer prevents a sticky panel.
  Promise.all([chrome.storage.local.get("batch_progress"), readBatchAccount()]).then(([{ batch_progress: bp }, { account }]) => {
    const now = Date.now();
    const freshDone = bp?.done && (now - (bp.ts || 0)) < BATCH_STALE_TTL;
    if (bp?.account === account && (batchIsRunning(bp, now, BATCH_STALE_TTL) || freshDone)) {
      renderBatchProgress(bp, account);
    }
  }).catch(() => {});
}

// ---- Tag Presets ----
function setupTagPresets() {
  const raw = settings.tagPresets || "";
  if (!raw.trim()) return;
  const container = $id("tag-presets");
  const presetsRow = $id("presets-row");
  if (!container || !presetsRow) return;
  const presets = raw.split("\n").map(line => {
    const m = line.match(/^(.+?)[:：]\s*(.+)$/);
    if (!m) return null;
    return { name: m[1].trim(), tags: m[2].split(/[,，]+/).map(s => s.trim()).filter(Boolean) };
  }).filter(Boolean);
  if (!presets.length) return;
  presetsRow.classList.remove("hidden");
  presets.forEach(p => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "preset-btn";
    btn.textContent = p.name;
    btn.title = p.tags.join(", ");
    btn.addEventListener("click", () => {
      p.tags.forEach(tag => addTag(tag));
      btn.classList.add("used");
      btn.disabled = true;
      $id("tags-input")?.focus();
    });
    container.appendChild(btn);
  });
}
