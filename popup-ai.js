// ============================================================
// Pinboard Bookmark Plus - AI Summary & Tags
// ============================================================

const AI_SUMMARY_TAG = "[AI Summary]";
const AI_BQ_REGEX = /(\n\n)?\[AI Summary\]\n<blockquote>[\s\S]*?<\/blockquote>\s*$/;

// ---- Setup AI feature listeners ----
function setupAIFeatures() {
  document.getElementById("ai-summary-btn").addEventListener("click", async (e) => {
    e.preventDefault();
    await doAISummary(false);
  });

  // Auto-restore cached summary if description doesn't already contain one
  if (!AI_BQ_REGEX.test(document.getElementById("description-input").value)) {
    getAICache(pageInfo.url, "summary", settings.aiCacheDuration).then(cached => {
      if (cached && !AI_BQ_REGEX.test(document.getElementById("description-input").value)) {
        upsertSummary(cached);
        showSummaryActions(true);
      }
    });
  }

  document.getElementById("ai-tags-btn").addEventListener("click", async (e) => {
    e.preventDefault();
    await doAITags(false);
  });
}

// ---- Insert or replace AI summary in description ----
function upsertSummary(summary) {
  const di = document.getElementById("description-input");
  const cur = di.value.trim();
  const wrapped = `${AI_SUMMARY_TAG}\n<blockquote>${summary}</blockquote>`;

  if (AI_BQ_REGEX.test(cur)) {
    di.value = cur.replace(AI_BQ_REGEX, "\n\n" + wrapped).replace(/^\n\n/, "");
  } else {
    di.value = cur ? cur + "\n\n" + wrapped : wrapped;
  }
  updateCharCount();
  autoResizeTextarea(di);
}

// ---- Remove AI summary block from description ----
function removeSummary() {
  const di = document.getElementById("description-input");
  di.value = di.value.replace(AI_BQ_REGEX, "").trim();
  updateCharCount();
  autoResizeTextarea(di);
}

// ---- AI Summary core logic ----
async function doAISummary(forceRefresh) {
  const btn = document.getElementById("ai-summary-btn");
  if (!hasAIKey(settings)) { showStatus("status-msg", "Set AI API key in settings", "error"); return; }
  if (!pageInfo.pageText) { showStatus("status-msg", "No page content to summarize", "error"); return; }

  if (!forceRefresh) {
    const cached = await getAICache(pageInfo.url, "summary", settings.aiCacheDuration);
    if (cached) {
      upsertSummary(cached);
      showSummaryActions(true);
      return;
    }
  }

  if (btn && !btn.classList.contains("hidden")) {
    btn.textContent = "summarizing...";
    btn.classList.add("loading");
  }
  try {
    const summary = await callAI(settings, buildSummaryPrompt(settings, document.getElementById("title-input").value, document.getElementById("url-input").value, pageInfo.pageText, document.getElementById("description-input").value));
    await setAICache(pageInfo.url, "summary", summary, settings.aiCacheDuration);
    upsertSummary(summary);
    showSummaryActions(false);
    showStatus("status-msg", forceRefresh ? "Summary regenerated" : "Summary generated", "success");
  } catch (e) {
    showStatus("status-msg", `AI error: ${e.message}`, "error");
    if (forceRefresh) showSummaryActions(false);
  }
}

// ---- Show regenerate + remove actions after summary is inserted ----
function showSummaryActions(fromCache) {
  const btn = document.getElementById("ai-summary-btn");
  const bar = btn.parentElement;
  btn.classList.add("hidden");
  bar.querySelector(".cache-hint-wrap")?.remove();

  const wrap = document.createElement("span");
  wrap.className = "cache-hint-wrap";

  if (fromCache) {
    const hint = document.createElement("span");
    hint.className = "cache-hint";
    hint.textContent = "cached";
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

  const regenLink = createActionLink("\u21bb regenerate", "regenerate");
  const removeLink = createActionLink("\u2715 remove", "remove");
  wrap.appendChild(regenLink);
  wrap.appendChild(removeLink);
  bar.appendChild(wrap);

  removeLink.addEventListener("click", (e) => {
    e.preventDefault();
    removeSummary();
    wrap.remove();
    btn.textContent = "\ud83e\udd16 AI summary";
    btn.classList.remove("hidden", "loading");
    showStatus("status-msg", "Summary removed", "success");
  });

  regenLink.addEventListener("click", async (e) => {
    e.preventDefault();
    wrap.querySelectorAll(".regen-link").forEach(l => l.classList.add("loading"));
    regenLink.textContent = "regenerating...";
    await doAISummary(true);
  });
}

// ---- AI Tags core logic ----
async function doAITags(forceRefresh) {
  const btn = document.getElementById("ai-tags-btn");
  const container = document.getElementById("ai-suggest-tags");

  if (!hasAIKey(settings)) {
    container.textContent = "";
    const msg = document.createElement("span");
    msg.className = "muted";
    msg.textContent = "set AI key in ";
    const link = document.createElement("a");
    link.href = "#";
    link.className = "go-settings";
    link.textContent = "settings";
    link.addEventListener("click", (ev) => { ev.preventDefault(); chrome.runtime.openOptionsPage(); });
    msg.appendChild(link);
    container.appendChild(msg);
    return;
  }

  if (!forceRefresh) {
    const cached = await getAICache(pageInfo.url, "tags", settings.aiCacheDuration);
    if (cached) {
      renderAITags(cached, true);
      return;
    }
  }

  if (btn) {
    btn.textContent = "generating...";
    btn.classList.add("loading");
  }

  try {
    const resp = await callAI(settings, buildTagPrompt(settings, document.getElementById("title-input").value, document.getElementById("url-input").value, pageInfo.pageText, document.getElementById("description-input").value, allUserTags));
    const rawTags = parseAITags(resp, settings.aiTagSeparator);
    const tags = settings.optRespectTagCase
      ? rawTags.map(t => resolveTagCase(t, tagCaseMap))
      : rawTags;
    await setAICache(pageInfo.url, "tags", tags, settings.aiCacheDuration);
    renderAITags(tags, false);
    if (forceRefresh) {
      showStatus("status-msg", "Tags regenerated", "success");
    }
  } catch (e) {
    container.textContent = e.message;
    container.classList.add("muted");
  }

  if (btn) {
    btn.textContent = "generate";
    btn.classList.remove("loading");
  }
}

function renderAITags(tags, fromCache) {
  const container = document.getElementById("ai-suggest-tags");
  container.innerHTML = "";

  if (!tags.length) {
    container.textContent = "no tags generated";
    container.classList.add("muted");
    return;
  }

  tags.forEach((tag) => {
    const el = document.createElement("span");
    el.className = "stag ai";
    el.textContent = tag;
    el.dataset.tag = tag;
    el.addEventListener("click", () => { addTag(tag); el.classList.add("used"); });
    container.appendChild(el);
  });

  const aa = document.createElement("span");
  aa.className = "add-all-link";
  aa.textContent = "Add all";
  aa.addEventListener("click", () => {
    container.querySelectorAll(".stag:not(.used)").forEach((el) => { addTag(el.dataset.tag); el.classList.add("used"); });
  });
  container.appendChild(aa);

  if (fromCache) {
    const cachedTagSet = new Set(tags.map(t => t.toLowerCase()));
    const hintWrap = document.createElement("span");
    hintWrap.className = "cache-hint-wrap";
    hintWrap.style.display = "inline-block";
    hintWrap.style.marginLeft = "8px";

    const cachedSpan = document.createElement("span");
    cachedSpan.className = "cache-hint";
    cachedSpan.textContent = "cached";
    hintWrap.appendChild(cachedSpan);

    ["append", "replace"].forEach(mode => {
      const link = document.createElement("a");
      link.href = "#";
      link.className = "regen-link";
      link.dataset.mode = mode;
      link.textContent = mode === "append" ? "\u21bb regenerate" : "\u21bb replace";
      link.addEventListener("click", async (e) => {
        e.preventDefault();
        hintWrap.querySelectorAll(".regen-link").forEach((l) => l.classList.add("loading"));
        link.textContent = mode === "replace" ? "replacing..." : "regenerating...";
        if (mode === "replace") {
          currentTags = currentTags.filter(t => !cachedTagSet.has(t.toLowerCase()));
          renderTags();
        }
        await doAITags(true);
      });
      hintWrap.appendChild(link);
    });

    container.appendChild(hintWrap);
  }
}
