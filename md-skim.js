// ============================================================
// Pinboard Bookmark Enhanced - md-skim.js (skim / key-points layer).
// Loaded ONLY by md-preview.html as the LAST script in the chain
// (after md-reader.js). Top level: function/const definitions + one
// "pbp:rendered" {once} listener registration -- no chrome.*/DOM side
// effects at parse time, so tests/md-ai-tests.html can load it on
// file://. Runtime depends on md-ask.js's citation-chip pipeline
// (_pbpAskChipPass/_pbpAskJump/_pbpAskFlash, all reusable as-is --
// none of them are hardwired to #ask-thread/#ask-panel) and
// md-ai-core.js's block index (pbpAiBlocks/pbpAiIndexBlocks/
// pbpAiBlocksFingerprint/pbpAiHash/pbpAiParseCites), both of which
// load earlier in the script chain -- every cross-file call below is
// still typeof-guarded per this codebase's convention rather than
// assumed always-present.
// Design: docs/superpowers/specs/2026-07-07-skim-layer-design.md
// sections 1.1-1.3 (mechanism), 3 (invariants), 6 (acceptance).
// ============================================================

// ---- pure section (no DOM/chrome/fetch; loadable standalone for file://
// tests) ----

// Prompt builder for the skim/key-points layer (spec 1.2.3). Pure: no
// settings/DOM read -- string/flag arguments the caller already resolved
// (context = pbpAskBuildContext(...).text; langInstruction =
// aiSummaryLangInstruction(s); opts = { title, forum }). The citation
// rule reuses ask's rule-3 wording verbatim (md-ask.js, "NEVER group
// citations...") and the CITES rule reuses ask's rule-4 block format
// verbatim -- the skim CITES: block is parsed by the SAME pbpAiParseCites
// (md-ai-core.js) the ask answers use, so the wire format must match
// exactly.
//
// Prompt design (2026-07 research pass): vanilla summary prompts default
// to lead-bias + entity-sparse output (Chain of Density, arXiv 2309.04269),
// and "the article discusses..." filler is the canonical vagueness marker —
// both countered by explicit rules, which beats piling on persona/CoT
// tricks (measured near-zero effect vs a plain baseline). The scan-first
// process line grounds points in located paragraphs before wording them
// (post-rationalized citations are the documented failure mode of
// claim-first ordering). Threads get their own variant: viewpoints with
// attribution, real disagreement preserved (stance homogenization is the
// documented failure of consensus-seeking summaries). The trailing
// reminder after the long context follows the long-context guidance of
// putting instructions after the document.
function pbpSkimBuildPrompt(context, langInstruction, opts) {
  const ctx = String(context == null ? "" : context);
  const lang = String(langInstruction == null ? "" : langInstruction);
  const o = opts || {};
  const title = String(o.title == null ? "" : o.title).replace(/\s+/g, " ").trim();
  const forum = !!o.forum;
  // Wire FORMAT (tokens, quote cap, block shape) stays byte-compatible with
  // ask's parser either way; only the source noun follows the framing so the
  // thread variant never mixes "article" into its own rules.
  const srcWord = forum ? "thread" : "article";
  const cite = "After every point, add an inline citation token [P<n>] where <n> is the paragraph number from the " + srcWord + ". Write each citation as its own token, e.g. [P3][P5]. NEVER group citations inside one pair of brackets or parentheses such as (P3, P5).";
  const citesA = "End the list with a CITES: block - one line per cited paragraph, formatted exactly as:";
  const citesB = "   P<n>: \"verbatim quote of 15 words or fewer, in the " + srcWord + "'s original language\"";
  const system = (forum ? [
    "You extract the key points of ONE discussion thread (original post plus replies) supplied below.",
    "Process: FIRST identify the distinct viewpoints across the WHOLE thread - the original post's claim, where replies genuinely agree, and where they differ. THEN write the points from those paragraphs only.",
    "Rules:",
    "1. Start with a single plain line (no bullet): the one thing someone should know about this thread. Then output 3 to 5 key points as a markdown unordered list (one line per point, using \"- \"). If the thread genuinely supports fewer distinct points, output fewer - never pad.",
    "2. Cover the original post's core claim first, then the strongest reply viewpoints - including notable disagreement or minority views. Do NOT manufacture consensus the thread does not contain; disagreement is information, keep it.",
    "3. Attribute reply viewpoints as viewpoints (e.g. \"several replies argue...\", \"one reply counters...\"), not as facts. Each point must carry at least one concrete detail (number, name, claim, outcome). Never open a point with filler such as \"The thread discusses\" in any language. No two points may repeat the same information.",
    "4. " + cite,
    "5. " + citesA,
    citesB,
    "6. " + lang,
    "7. Use ONLY the thread. Do not invent points the text does not support."
  ] : [
    "You extract the key points of ONE article supplied below.",
    "Process: FIRST scan the ENTIRE article and pick the paragraphs that carry its core claims - conclusions, findings, numbers, decisions - not only the opening paragraphs. THEN write each point from those paragraphs only.",
    "Rules:",
    "1. Start with a single plain line (no bullet): what is genuinely new or most consequential here. Then output 3 to 5 key points as a markdown unordered list (one line per point, using \"- \"). If the article genuinely supports fewer than 3 distinct points, output fewer - never pad.",
    "2. Each point must state a concrete fact, claim or conclusion with at least one specific detail (number, name, date, result). Never open a point with filler such as \"The article discusses/introduces/describes\" in any language. No two points may repeat the same information.",
    "3. If the article contains an important caveat, counter-argument or limitation, dedicate one point to it.",
    "4. " + cite,
    "5. " + citesA,
    citesB,
    "6. " + lang,
    "7. Use ONLY the article. Do not invent points the text does not support."
  ]).join("\n");
  const head = title ? "TITLE: " + title + "\n" : "";
  const label = forum ? "THREAD" : "ARTICLE";
  return { system, prompt: head + label + ":\n" + ctx +
    "\n\nNow output exactly as instructed: the single opening line, the key-point list with [P<n>] citations, then the CITES: block." };
}

// ---- DOM wiring ----

// Context budget in estimated tokens (spec 1.2.3: fixed at 24000, the
// same value as ask's own PBP_ASK_CTX_BUDGET, md-ask.js:306 -- kept as
// its own const rather than reaching into md-ask.js's, since that one
// belongs to a different feature's file).
const PBP_SKIM_CTX_BUDGET = 24000;

let _pbpSkimState = null;

function _pbpSkimCacheKey(url) {
  // Same article opened via a #fragment or ?utm= variant must share one
  // cache entry — every miss is a paid generation. Normalization lives in
  // pbpAiCacheUrlNorm (md-ai-core.js, shared with ask history): keeps hash
  // ROUTERS (#/docs/x, #!page), drops plain anchors, strips the known
  // tracker set. Same output as the pre-extraction inline version, so
  // existing skim_ keys stay valid.
  return "skim_" + pbpAiHash(pbpAiCacheUrlNorm(url));
}

function _pbpSkimCacheMeta(st) {
  const s = (st && st.s) || {};
  const provider = s.aiProvider || "gemini";
  // pbpAiEffectiveModel (not just the override): with no preview override,
  // switching the provider's configured model must invalidate the cache —
  // "openai:default" served model A's summary after switching to model B.
  const model = (typeof pbpAiEffectiveModel === "function")
    ? pbpAiEffectiveModel(s) : (pbpAiResolveModelOverride(s) || "default");
  return {
    langKey: aiSummaryLangInstruction(s),
    modelKey: provider + ":" + model
  };
}

function _pbpSkimCacheMatches(r, st, curBlocksHash) {
  if (!r || typeof r !== "object") return false;
  const meta = _pbpSkimCacheMeta(st);
  if (!r.langKey || !r.modelKey) return false;
  return r.langKey === meta.langKey
    && r.modelKey === meta.modelKey
    // A record with NO blocksHash cannot prove it matches today's content —
    // it goes down the stale path (render + stale bar), never fresh. Only an
    // unavailable CURRENT fingerprint keeps the old tolerance (nothing to
    // compare against).
    && (!curBlocksHash || (!!r.blocksHash && r.blocksHash === curBlocksHash));
}

// Double gate (spec 1.1): shared master AI gate first, skim's own
// opt-in flag second (default off -- token-protection invariant #1,
// spec sec.3). Then the same force-index-if-empty guard pbpAskInit
// uses (md-ask.js:30-38): a prior AI feature on this same
// "pbp:rendered" tick may already have indexed blocks; an
// unconditional re-index would reset their md/text caches mid-flight,
// so only index when the list is still empty. Any failed gate = zero
// DOM, zero listeners, zero requests (token-protection invariant #1).
async function pbpSkimInit(detail) {
  const view = document.getElementById("rendered-view");
  if (!view || _pbpSkimState) return;
  const s = await pbpAiGetSettings();
  if (!pbpAiAvailable(s) || s.previewSkimEnabled !== true) return;
  if (!pbpAiBlocks().length) pbpAiIndexBlocks(view);
  if (!pbpAiBlocks().length) return;

  _pbpSkimState = {
    s,
    url: String((detail && detail.url) || ""),
    title: String((detail && detail.title) || ""),
    forum: !!(detail && detail.forum),
    section: null,
    running: false,
    ctrl: null,
    gen: 0,
    permissionError: null
  };

  _pbpSkimBuildSection(view);
  window.addEventListener("pagehide", () => {
    if (_pbpSkimState && _pbpSkimState.ctrl) _pbpSkimState.ctrl.abort();
  });
  await _pbpSkimLoad();
}

// Builds #skim-section as .doc-body's first child, directly before
// #rendered-view (spec 1.2.1). insertBefore(sec, view) achieves this in
// one call because #rendered-view is already .doc-body's first child
// today (md-preview.html: <div class="doc-body"><article
// id="rendered-view">...</article><pre id="raw-view">...) -- confirmed
// by recon: no consumer in this codebase assumes or measures that
// position (block index / R9 scroll restore / TOC / search /
// highlights all resolve #rendered-view by id, never by DOM position),
// so this insertion is structurally inert to every other system.
//
// Deliberately NOT compensated in code: while #skim-section streams in
// (or regenerates) above #rendered-view, its growing height pushes
// #rendered-view/#raw-view down. No `overflow-anchor: none` exists
// anywhere in md-preview.css, so this relies entirely on the browser's
// native CSS Scroll Anchoring to keep a mid-article scroll position
// stable while off-screen content above it grows. That inference is
// from CSS absence, not a verified runtime test -- a real-machine smoke
// test item (spec sec.4: no scroll-anchoring compensation code is
// written), not something to "fix" here.
function _pbpSkimBuildSection(view) {
  if (document.getElementById("skim-section")) return;
  const docBody = view.parentElement;
  if (!docBody) return;
  const sec = document.createElement("section");
  sec.id = "skim-section";
  sec.setAttribute("aria-labelledby", "skim-title");
  const refreshSvg = (typeof PBP_ICONS === "object" && PBP_ICONS && PBP_ICONS.refresh) || "";
  const collapseSvg = (typeof PBP_ICONS === "object" && PBP_ICONS && PBP_ICONS.arrowDown) || "";
  sec.innerHTML = [
    '<div class="skim-head">',
    '  <h2 id="skim-title" data-i18n="skimTitle">Key points</h2>',
    '  <button type="button" id="skim-stop" class="action-btn" hidden data-i18n="skimStop">Stop</button>',
    '  <button type="button" id="skim-regen" class="skim-ic" data-i18n-title="skimRegen" data-i18n-aria="skimRegen">' + refreshSvg + '</button>',
    '  <button type="button" id="skim-collapse" class="skim-ic" aria-expanded="true" aria-controls="skim-body" data-i18n-title="skimCollapseAria" data-i18n-aria="skimCollapseAria">' + collapseSvg + '</button>',
    '</div>',
    '<div id="skim-stale" class="skim-stale" hidden>',
    '  <span data-i18n="skimStaleNote"></span>',
    '  <button type="button" id="skim-stale-regen" class="action-btn skim-stale-btn">' + (typeof PBP_ICONS !== "undefined" ? PBP_ICONS.refresh : "") + '<span data-i18n="skimRegen"></span></button>',
    '</div>',
    '<div id="skim-status" role="status" aria-live="polite" hidden></div>',
    '<div id="skim-body" aria-busy="false"></div>',
    '<div id="skim-usage" hidden></div>'
  ].join("\n");
  // Key points sit ABOVE the video panel when one is mounted (device
  // feedback 2026-08-22): the panel is #rendered-view's previous sibling,
  // so anchoring on it (when present) keeps skim on top in either
  // mount order.
  docBody.insertBefore(sec, document.getElementById("video-panel") || view);
  applyI18n(sec);

  const regenBtn = sec.querySelector("#skim-regen");
  const collapseBtn = sec.querySelector("#skim-collapse");
  regenBtn.addEventListener("click", () => _pbpSkimRegen().catch(() => {}));
  sec.querySelector("#skim-stale-regen").addEventListener("click", () => _pbpSkimRegen().catch(() => {}));
  sec.querySelector("#skim-stop").addEventListener("click", () => {
    if (_pbpSkimState && _pbpSkimState.ctrl) _pbpSkimState.ctrl.abort();
  });
  _pbpSkimWireCollapse(sec, collapseBtn);
}

// Collapse toggle: mirrors md-reader.js's pbp_srch_regex get/set shape
// (md-reader.js:665-678), NOT the rail's pbpRailCollapsible -- skim
// deliberately has no rail entry (spec 1.2: single entry point, no
// second "is it open" control to keep in sync). Default expanded
// (get() default false = not collapsed).
function _pbpSkimWireCollapse(sec, collapseBtn) {
  // State lives in a variable, not the class: pbpFoldHeightAnimate defers the
  // hiding class until the tween finishes, so reading classList mid-animation
  // would see the OLD state and a quick second click would not reverse.
  let isCollapsed = false;
  let foldAnim = null;
  // Same guard as pbpRailCollapsible's `overridden`: the storage restore is a
  // real IPC round-trip, so a click landing before it resolves must not be
  // silently reverted by the stale read.
  let overridden = false;
  const setCollapsed = (collapsed, animate) => {
    isCollapsed = collapsed;
    collapseBtn.setAttribute("aria-expanded", collapsed ? "false" : "true");
    const fold = (v) => sec.classList.toggle("collapsed", v);
    if (typeof pbpFoldHeightAnimate === "function") { // md-preview.js; absent on file:// test loads
      foldAnim = pbpFoldHeightAnimate(sec, collapsed, fold, foldAnim, !!animate);
    } else {
      fold(collapsed);
    }
  };
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
    try {
      chrome.storage.local.get({ pbp_skim_collapsed: false }, (res) => {
        if (overridden) return;
        setCollapsed(!!(res && res.pbp_skim_collapsed)); // restore: no animation
      });
    } catch (_) {}
  }
  collapseBtn.addEventListener("click", () => {
    overridden = true;
    // Arms the chevron-spin transition (md-preview.css) from the first real
    // click on; the storage restore above runs before any click, so its
    // programmatic aria-expanded flip stays animation-free.
    collapseBtn.classList.add("motion-toggle");
    const collapsed = !isCollapsed;
    setCollapsed(collapsed, true);
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      try { chrome.storage.local.set({ pbp_skim_collapsed: collapsed }); } catch (_) {}
    }
  });
}

// Cache read (spec 1.2.2): hit + fingerprint match -> render only, zero
// requests (token-protection invariant #3, spec sec.3). Hit + drift ->
// render the cached bullets anyway (still useful, best-effort chip
// jump) and show the stale banner; NEVER auto-regenerate on drift --
// the banner's own button (and the header's Regen button) are the only
// ways back to a fresh generation. Miss -> auto-generate once.
async function _pbpSkimLoad() {
  const st = _pbpSkimState;
  let entry = null;
  try { entry = await pbpAiCacheGet(_pbpSkimCacheKey(st.url)); } catch (_) {}
  const r = entry && entry.result;
  const curFp = (typeof pbpAiBlocksFingerprint === "function") ? pbpAiBlocksFingerprint() : "";
  if (r && typeof r === "object" && typeof r.md === "string"
      && _pbpSkimCacheMatches(r, st, curFp)) {
    _pbpSkimRenderCached(r);
    return;
  }
  const meta = _pbpSkimCacheMeta(st);
  if (r && typeof r === "object" && typeof r.md === "string"
      && r.langKey && r.modelKey
      && r.langKey === meta.langKey
      && r.modelKey === meta.modelKey
      && curFp && (!r.blocksHash || r.blocksHash !== curFp)) {
    _pbpSkimRenderCached(r);
    const stale = document.getElementById("skim-stale");
    if (stale) stale.hidden = false;
    return;
  }
  await _pbpSkimRun();
}

function _pbpSkimRenderCached(r) {
  const body = document.getElementById("skim-body");
  if (!body) return;
  _pbpSkimSetStatus("");
  body.innerHTML = renderMarkdown(r.md);
  // Rebuild the sampled-paragraph set persisted at generation time so a
  // cache hit applies the same sent-gate as the live pass; legacy entries
  // without the field degrade to null = unknown (old behavior).
  const sent = Array.isArray(r.sent) ? new Set(r.sent) : null;
  if (typeof _pbpAskChipPass === "function") _pbpAskChipPass(body, Array.isArray(r.cites) ? r.cites : [], sent);
}

function _pbpSkimSetStatus(text) {
  const el = document.getElementById("skim-status");
  if (!el) return;
  const msg = String(text || "");
  el.textContent = msg;
  el.hidden = !msg;
}

// Core generate/regenerate runner (spec 1.2.3-1.2.6). Callers:
// _pbpSkimLoad's cache-miss path (nothing else can be running yet at
// that point) and _pbpSkimRegen (which owns the abort-then-supersede
// handshake below via st.gen). st.gen is bumped as this function's very
// first statement -- a synchronous line before any `await` -- so by the
// time a caller's own `await` yields control back to the event loop,
// any PREVIOUS in-flight call's closure has already lost the
// `myGen === st.gen` check in its own catch/finally/paint and will not
// touch the DOM this call is about to build.
async function _pbpSkimRun() {
  const st = _pbpSkimState;
  if (!st) return;
  st.gen += 1;
  const myGen = st.gen;
  const body = document.getElementById("skim-body");
  if (!body) return;
  st.running = true;
  st.ctrl = new AbortController();
  const stopBtn = document.getElementById("skim-stop");
  const regenBtn = document.getElementById("skim-regen");
  const usageEl = document.getElementById("skim-usage");
  if (stopBtn) stopBtn.hidden = false;
  if (regenBtn) regenBtn.disabled = true;
  if (usageEl) usageEl.hidden = true; // stale number from a previous run must not linger (mirrors _pbpTrRenderUsage's own reset-on-new-run)
  _pbpSkimSetStatus(t("skimGenerating"));
  body.setAttribute("aria-busy", "true");
  let raf = 0;
  let acc = "";
  // gen-guarded so a stale run's own late rAF paint (scheduled just
  // before its abort took effect) cannot stomp a newer run's
  // freshly-cleared body with its own frozen `acc` (a one-frame flicker
  // otherwise -- see _pbpSkimRegen below).
  const paint = () => { raf = 0; if (myGen === st.gen) body.textContent = acc; };
  let gotUsage = false;
  const usage = { inTok: 0, outTok: 0, approx: false };
  let built = null;
  try {
    const ctx = pbpAskBuildContext(pbpAiBlocks(), PBP_SKIM_CTX_BUDGET);
    const langInstruction = aiSummaryLangInstruction(st.s);
    built = pbpSkimBuildPrompt(ctx.text, langInstruction, { title: st.title, forum: st.forum });
    // st.gen in the key: a future regen fired mid-stream would otherwise
    // collide with the not-yet-cleaned-up previous inflight promise for the
    // same url and be silently swallowed instead of restarted (reviewer
    // hardening -- unreachable via today's UI, cheap to close now).
    const full = await getOrCreateInflight("skim_" + st.url + "_" + myGen, () =>
      callAIStream(st.s, built.prompt, {
        maxTokens: 1024,
        model: pbpAiResolveModelOverride(st.s),
        system: built.system,
        signal: st.ctrl.signal,
        onUsage: (u) => { gotUsage = true; usage.inTok = u.inTok; usage.outTok = u.outTok; }
      }, (d, accText) => {
        acc = accText;
        if (!raf) raf = requestAnimationFrame(paint);
      })
    );
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    if (myGen !== st.gen) return; // superseded by a newer regen mid-stream: drop this result silently
    if (!gotUsage) {
      usage.approx = true;
      usage.inTok = pbpAiEstimateTokens((built.system + built.prompt).length);
      usage.outTok = pbpAiEstimateTokens(full.length);
    }
    _pbpSkimFinalize(full, usage, ctx.sent);
  } catch (e) {
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    if (myGen !== st.gen) return; // superseded: ignore this run's error entirely
    if (e && e.name === "AbortError") {
      // The cancelled rAF above may hold the LAST streamed chunk unpainted;
      // flush it so "keep whatever text already streamed" holds exactly.
      if (acc) body.textContent = acc;
      _pbpSkimSetStatus("");
      // Stop button: keep whatever text already streamed, quietly (spec
      // 1.2.3/1.2.6) -- unlike ask's Stop, no "Stopped" note is
      // appended; skim is a single rolling summary, not a conversation
      // log entry. Do NOT cache partial text (token-protection: a
      // half-formed bullet list with an unclosed CITES block would
      // parse into garbage/incomplete citations on the next page load).
    } else {
      st.permissionError = (e && e.code === "host_permission") ? e : null;
      _pbpSkimShowError(e);
    }
  } finally {
    if (myGen === st.gen) {
      st.running = false;
      st.ctrl = null;
      if (stopBtn) stopBtn.hidden = true;
      if (regenBtn) regenBtn.disabled = false;
      body.removeAttribute("aria-busy");
    }
  }
}

// Finalize (spec 1.2.4): parse CITES -> render -> chip pass -> cache
// write -> usage line. _pbpAskFinalize (md-ask.js) is deliberately NOT
// reused here -- its trailing call to _pbpAskDecorate adds ask's own
// copy button + #ask-clear wiring (ask-thread-specific chrome); skim
// only needs the two generic steps renderMarkdown + _pbpAskChipPass.
function _pbpSkimFinalize(fullText, usage, sent) {
  const st = _pbpSkimState;
  const body = document.getElementById("skim-body");
  if (!body) return;
  st.permissionError = null;
  const parsed = pbpAiParseCites(fullText);
  body.innerHTML = renderMarkdown(parsed.body);
  // Same sent-gate as ask (A7): a cite of a paragraph the sampler never
  // sent must not earn the solid verified state even when its guessed
  // quote fuzzy-matches.
  if (typeof _pbpAskChipPass === "function") _pbpAskChipPass(body, parsed.cites, sent);
  _pbpSkimSetStatus("");
  const blocksHash = (typeof pbpAiBlocksFingerprint === "function") ? pbpAiBlocksFingerprint() : "";
  const meta = _pbpSkimCacheMeta(st);
  pbpAiCacheSet(_pbpSkimCacheKey(st.url), {
    md: parsed.body,
    cites: parsed.cites,
    sent: Array.from(sent || []),
    blocksHash,
    ts: Date.now(),
    model: meta.modelKey,
    langKey: meta.langKey,
    modelKey: meta.modelKey
  }, Date.now()).catch(() => {});
  const stale = document.getElementById("skim-stale");
  if (stale) stale.hidden = true;
  _pbpSkimRenderUsage(usage);
}

// Usage line (spec 1.2.4): mirrors _pbpTrRenderUsage (md-translate.js:
// 899-916) exactly -- same trActualUsage i18n key, same U+2248
// (ALMOST EQUAL TO) approx-prefix convention, written as a \u escape
// (project rule: no literal non-ASCII bytes in .js source). Only ever
// called from a run that actually made a request in this session
// (_pbpSkimFinalize) -- a cache hit never calls this, so #skim-usage
// stays hidden after a zero-request load, matching translate's own
// "session-only, never persisted" usage semantics.
function _pbpSkimRenderUsage(usage) {
  const el = document.getElementById("skim-usage");
  if (!el || !usage) return;
  const line = t("trActualUsage", String(usage.inTok), String(usage.outTok));
  el.textContent = usage.approx ? "\u2248 " + line : line;
  el.hidden = false;
}

// Error UI (spec 1.2.5): a short failure message plus a single-shot
// retry button, both inside #skim-body -- mirrors _pbpAskErrorUi's
// placement (md-ask.js:487-509) rather than cramming retry chrome into
// the compact header row. Every failure path in _pbpSkimRun is wrapped
// in try/catch and this function itself cannot throw (plain DOM writes
// only), so a generation failure degrades to this without ever
// breaking the rest of the page (spec sec.3 invariant #4).
function _pbpSkimShowError(error) {
  const body = document.getElementById("skim-body");
  if (!body) return;
  _pbpSkimSetStatus("");
  body.replaceChildren();
  const p = document.createElement("p");
  p.className = "skim-err";
  p.textContent = (error && error.code === "host_permission" && error.message)
    ? error.message : t("skimFailed");
  const retry = document.createElement("button");
  retry.type = "button";
  retry.className = "action-btn skim-retry";
  retry.innerHTML = PBP_ICONS.refresh; // static shared constant, never page content
  retry.append(t(error && error.code === "host_permission" ? "aiGrantRetry" : "askErrRetry"));
  retry.addEventListener("click", () => {
    // Same guard shape as ask's retry (md-ask.js _pbpAskErrorUi): a
    // stale click after a newer run already started must not fire a
    // second, overlapping request.
    if (_pbpSkimState && _pbpSkimState.running) return;
    _pbpSkimRegen().catch(() => {});
  });
  body.appendChild(p);
  body.appendChild(retry);
}

// Regenerate (spec 1.2.6): abort whatever is in flight, clear the body,
// then run again -- this OVERWRITES the cache (_pbpSkimFinalize's
// pbpAiCacheSet replaces the previous entry for this url). Distinct
// from the Stop button: Stop only aborts and keeps the partial text;
// Regen aborts AND immediately restarts. See _pbpSkimRun's own comment
// for why the in-flight run's stale closure cannot clobber this call's
// fresh state once _pbpSkimRun bumps st.gen.
async function _pbpSkimRegen() {
  const st = _pbpSkimState;
  if (!st || st.running) return;
  st.running = true;
  const retry = document.querySelector("#skim-body .skim-retry");
  if (retry) retry.disabled = true;
  try {
    // Settings may have changed since init (provider/model/summary language
    // switched in Options while this tab stayed open): re-read, and re-run
    // the double gate — if the user has since turned AI or skim off, a
    // manual regen must stay a no-op (token-protection invariant #1).
    // Fail CLOSED on a read failure: without confirmed-current settings a
    // paid request must not fire on the stale snapshot.
    try { st.s = await pbpAiGetSettings(); } catch (_) { return; }
    if (!pbpAiAvailable(st.s) || st.s.previewSkimEnabled !== true) return;
    if (st.permissionError) {
      const recovered = await pbpAiRetryWithPermission(st.permissionError, st.s, () => {});
      if (!recovered) return;
      st.permissionError = null;
    }
    if (st.ctrl) st.ctrl.abort();
    const stale = document.getElementById("skim-stale");
    if (stale) stale.hidden = true;
    const body = document.getElementById("skim-body");
    if (body) {
      if (body.contains(document.activeElement)) {
        body.tabIndex = -1;
        body.focus();
      }
      body.replaceChildren();
    }
    await _pbpSkimRun();
  } finally {
    st.running = false;
    if (retry) retry.disabled = false;
  }
}

// Init hookup: top-level listener registration only (no other side
// effects; the tests page loads this file on file:// and never fires
// "pbp:rendered", so this line never executes there).
if (typeof document !== "undefined") {
  document.addEventListener("pbp:rendered", (e) => {
    pbpSkimInit((e && e.detail) || {}).catch(() => {});
  }, { once: true });
}
