// ============================================================
// Pinboard Bookmark Plus - Tab Set, Batch Save & Tag Presets
// ============================================================

// ---- Tab Set & Batch Bookmark Save ----
function setupTabSet() {
  const btn = document.getElementById("save-tabset-btn");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    const origText = btn.textContent;
    btn.textContent = t("batchSaving");

    try {
      const tabs = await chrome.tabs.query({ currentWindow: true });
      const validTabs = tabs.filter(t =>
        t.url && (t.url.startsWith("http://") || t.url.startsWith("https://"))
      );

      if (validTabs.length === 0) {
        showStatus("status-msg", t("batchNoValidTabs"), "error");
        btn.textContent = origText;
        btn.disabled = false;
        return;
      }

      const tabsData = validTabs.map(t => ({
        title: t.title || t.url,
        url: t.url
      }));

      chrome.runtime.sendMessage(
        { action: "saveTabSet", tabsData: tabsData },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error("sendMessage error:", chrome.runtime.lastError);
          }
        }
      );

      btn.textContent = t("batchSent");
      setTimeout(() => {
        btn.textContent = origText;
        btn.disabled = false;
      }, 2000);

    } catch (e) {
      console.error("Save tab set error:", e);
      showStatus("status-msg", t("batchFailed", e.message), "error");
      btn.textContent = origText;
      btn.disabled = false;
    }
  });

  const batchBtn = document.getElementById("batch-bookmark-btn");
  if (!batchBtn) return;
  batchBtn.addEventListener("click", async () => {
    batchBtn.disabled = true;
    batchBtn.textContent = t("batchSaving");
    try {
      const rawToken = await chrome.storage.sync.get("pinboardToken");
      const pinboardToken = deobfuscateKey(rawToken.pinboardToken);
      if (!pinboardToken) {
        showStatus("status-msg", t("batchNotLoggedIn"), "error");
        batchBtn.textContent = t("batchSaveBtn"); batchBtn.disabled = false;
        return;
      }
      const tabs = await chrome.tabs.query({ currentWindow: true });
      const validTabs = tabs.filter(t => t.url && (t.url.startsWith("http://") || t.url.startsWith("https://")));
      if (!validTabs.length) {
        showStatus("status-msg", t("batchNoTabs"), "error");
        batchBtn.textContent = t("batchSaveBtn"); batchBtn.disabled = false;
        return;
      }
      const baseTags = settings.optBatchTagEnabled && settings.optBatchTag
        ? settings.optBatchTag.split(/[,，]+/).map(t => t.trim().replace(/\s+/g, "-")).filter(Boolean)
        : [];
      const useAiTags = settings.batchAiTags && hasAIKey(settings);
      const useAiSummary = settings.batchAiSummary && hasAIKey(settings);

      let saved = 0, failed = 0, skipped = 0;
      let existingUrls = new Set();
      if (settings.batchSkipExisting) {
        existingUrls = await fetchExistingUrlSet(pinboardToken);
      }
      for (let i = 0; i < validTabs.length; i++) {
        const t = validTabs[i];
        batchBtn.textContent = t("batchProgress", String(i + 1), String(validTabs.length), String(saved), String(failed));
        if (settings.batchSkipExisting && existingUrls.has(t.url)) {
          skipped++;
          continue;
        }
        try {
          let tags = [...baseTags];
          let notes = "";

          if (useAiTags || useAiSummary) {
            let tabPageInfo = null;
            try { tabPageInfo = await getPageInfoFromTab(t.id); } catch (_) {}
            if (tabPageInfo?.pageText) {
              const aiJobs = [];
              if (useAiTags) aiJobs.push((async () => {
                try {
                  const cached = await getAICache(t.url, "tags", settings.aiCacheDuration);
                  if (cached) return { type: "tags", result: cached };
                  const prompt = buildTagPrompt(settings, t.title || t.url, t.url, tabPageInfo.pageText, "", []);
                  const resp = await callAI(settings, prompt);
                  const rawTags = parseAITags(resp, settings.aiTagSeparator);
                  const aiTags = settings.optRespectTagCase
                    ? rawTags.map(tag => resolveTagCase(tag, tagCaseMap))
                    : rawTags;
                  await setAICache(t.url, "tags", aiTags, settings.aiCacheDuration);
                  return { type: "tags", result: aiTags };
                } catch (_) { return null; }
              })());
              if (useAiSummary) aiJobs.push((async () => {
                try {
                  const cached = await getAICache(t.url, "summary", settings.aiCacheDuration);
                  if (cached) return { type: "summary", result: cached };
                  const prompt = buildSummaryPrompt(settings, t.title || t.url, t.url, tabPageInfo.pageText, "");
                  const summary = await callAI(settings, prompt);
                  await setAICache(t.url, "summary", summary, settings.aiCacheDuration);
                  return { type: "summary", result: summary };
                } catch (_) { return null; }
              })());
              const results = await Promise.all(aiJobs);
              for (const r of results) {
                if (!r) continue;
                if (r.type === "tags") tags = [...tags, ...r.result];
                if (r.type === "summary") notes = `[AI Summary]\n<blockquote>${r.result}</blockquote>`;
              }
            }
          }

          const dedupedTags = [...new Set(tags.map(tag => tag.toLowerCase()))].map(lower => tags.find(tag => tag.toLowerCase() === lower));
          const apiUrl = `https://api.pinboard.in/v1/posts/add?auth_token=${pinboardToken}&format=json&url=${enc(t.url)}&description=${enc(t.title || t.url)}&extended=${enc(notes)}&tags=${enc(dedupedTags.join(" "))}&replace=yes`;
          const data = await (await pinboardFetch(apiUrl)).json();
          if (data.result_code === "done") saved++;
          else failed++;
        } catch (_) { failed++; }
      }
      if (saved > 0) {
        const newUrls = validTabs.filter(t => !existingUrls.has(t.url)).map(t => t.url);
        newUrls.forEach(u => existingUrls.add(u));
        try {
          await chrome.storage.local.set({
            cached_existing_urls: { urls: [...existingUrls], timestamp: Date.now() }
          });
        } catch (_) {}
      }
      const tagStr = baseTags.join(", ");
      const skipMsg = skipped > 0 ? t("batchSkipped", String(skipped)) : "";
      showStatus("status-msg", t("batchDone", String(saved), String(failed)) + skipMsg, saved > 0 ? "success" : "error");
      if (saved > 0) {
        const tagsSuffix = tagStr ? t("batchTaggedSuffix", tagStr) : "";
        chrome.runtime.sendMessage({ type: "show_notification", id: "batch-saved-" + Date.now(), title: t("bgBatchSaved"), message: t("batchSavedNotify", String(saved), tagsSuffix), category: "batchSave" });
      }
      batchBtn.textContent = t("batchSavedCount", String(saved));
      setTimeout(() => { batchBtn.textContent = t("batchSaveBtn"); batchBtn.disabled = false; }, 3000);
    } catch (e) {
      showStatus("status-msg", t("batchFailed", e.message), "error");
      batchBtn.textContent = t("batchSaveBtn"); batchBtn.disabled = false;
    }
  });
}

// ---- Tag Presets ----
function setupTagPresets() {
  const raw = settings.tagPresets || "";
  if (!raw.trim()) return;
  const container = document.getElementById("tag-presets");
  const presetsRow = document.getElementById("presets-row");
  if (!container || !presetsRow) return;
  const presets = raw.split("\n").map(line => {
    const m = line.match(/^(.+?)[:：]\s*(.+)$/);
    if (!m) return null;
    return { name: m[1].trim(), tags: m[2].split(/[,，]+/).map(t => t.trim()).filter(Boolean) };
  }).filter(Boolean);
  if (!presets.length) return;
  presetsRow.classList.remove("hidden");
  presets.forEach(p => {
    const btn = document.createElement("span");
    btn.className = "preset-btn";
    btn.textContent = p.name;
    btn.title = p.tags.join(", ");
    btn.addEventListener("click", () => {
      p.tags.forEach(t => addTag(t));
      btn.classList.add("used");
    });
    container.appendChild(btn);
  });
}

// ---- Existing URL Set Cache (for batch dedup) ----
async function fetchExistingUrlSet(token) {
  const cacheKey = "cached_existing_urls";
  try {
    const cached = await chrome.storage.local.get(cacheKey);
    if (cached[cacheKey]) {
      const { urls, timestamp } = cached[cacheKey];
      if (Date.now() - timestamp < 30 * 60 * 1000) {
        return new Set(urls);
      }
    }
  } catch (_) {}
  try {
    const recentData = await (await pinboardFetch(`https://api.pinboard.in/v1/posts/all?auth_token=${token}&format=json&results=1000&meta=no`)).json();
    const urls = recentData.map(p => p.href);
    await chrome.storage.local.set({ [cacheKey]: { urls, timestamp: Date.now() } });
    return new Set(urls);
  } catch (_) {
    return new Set();
  }
}
