// ============================================================
// Markdown Preview Page
// ============================================================

// Enable decorative transitions only after the initial page has painted.
if (typeof requestAnimationFrame === "function") {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    document.documentElement.classList.add("motion-ready");
  }));
}

// This defer script starts async rendering before the later reader scripts have
// necessarily registered their pbp:rendered listeners. Capture DOMContentLoaded
// synchronously so the eventual dispatch cannot outrun those defer scripts.
const pbpDeferredScriptsReady = document.readyState === "complete"
  ? Promise.resolve()
  : new Promise((resolve) => document.addEventListener("DOMContentLoaded", resolve, { once: true }));

// Render the styled empty state and hide the rail so the page reads as
// intentional (not a half-rendered document). textContent only — no innerHTML.
function renderEmptyState(message) {
  const view = document.getElementById("rendered-view");
  if (view) {
    view.removeAttribute("aria-busy");
    const wrap = document.createElement("div");
    wrap.className = "empty-state";
    const p = document.createElement("p");
    p.textContent = message;
    wrap.appendChild(p);
    view.replaceChildren(wrap);
  }
  document.body.classList.add("md-empty");
}

// Same visual shell as renderEmptyState, but for a recoverable extraction failure: keeps
// the rail (incl. the Defuddle/Jina engine-switch badge) visible/usable instead of hiding
// it, and offers a retry button that re-runs retryFn (the same reextractMarkdown flow the
// engine-switch control already uses — see the pending-extraction branch below). Bare
// renderEmptyState stays reserved for genuinely nothing-to-do states (no preview data /
// no content at all), where there is nothing to retry or switch.
function renderErrorState(message, retryFn, permissionRequired) {
  const view = document.getElementById("rendered-view");
  if (view) {
    view.removeAttribute("aria-busy");
    const wrap = document.createElement("div");
    wrap.className = "empty-state";
    const p = document.createElement("p");
    p.textContent = message;
    wrap.appendChild(p);
    if (typeof retryFn === "function") {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "action-btn";
      btn.textContent = t(permissionRequired ? "aiGrantRetry" : "askErrRetry");
      btn.addEventListener("click", async () => {
        if (btn.disabled) return;
        btn.disabled = true;
        try { await retryFn(); } catch (_) {}
        finally { btn.disabled = false; }
      });
      wrap.appendChild(btn);
    }
    view.replaceChildren(wrap);
  }
  document.body.classList.remove("md-empty"); // undo renderLoadingState's rail-hide so the engine-switch badge stays reachable
}

// Jina extraction runs in the Service Worker, which cannot prompt. This helper is
// called only from a retrying user click after the worker reported host_permission.
async function pbpRequestJinaHostPermission() {
  try {
    return (await chrome.permissions.request({ origins: [PBP_JINA_ORIGIN_PATTERN] })) === true;
  } catch (_) {
    return false;
  }
}

function renderLoadingState(message, note) {
  const view = document.getElementById("rendered-view");
  if (view) {
    const wrap = document.createElement("div");
    wrap.className = "preview-loading";
    const sp = document.createElement("div");
    sp.className = "preview-spinner";
    sp.setAttribute("aria-hidden", "true");
    const p = document.createElement("p");
    p.textContent = message;
    wrap.appendChild(sp);
    wrap.appendChild(p);
    if (note) {
      const n = document.createElement("p");
      n.className = "note";
      n.textContent = note;
      wrap.appendChild(n);
    }
    view.replaceChildren(wrap);
    view.setAttribute("aria-busy", "true");
  }
  document.body.classList.add("md-empty");
}

// Heuristic detection of the ARTICLE's script from its text, so #rendered-view gets a
// lang attribute and :lang() picks the correct CJK font (a Simplified-only stack draws
// Traditional text with wrong glyph forms). Zero-dependency; samples the head of the text.
function detectArticleLang(text) {
  if (!text) return "";
  const s = text.slice(0, 4000);
  if (/[぀-ゟ゠-ヿ]/.test(s)) return "ja"; // Hiragana / Katakana
  if (/[가-힣]/.test(s)) return "ko";              // Hangul syllables
  if (/[一-鿿]/.test(s)) {                          // Han → Simplified vs Traditional
    const simp = (s.match(/[国对见图书龙东车马门话语说题际还买卖产权观难应当么这样实现单关闭过]/g) || []).length;
    const trad = (s.match(/[國對見圖書龍東車馬門話語說題際還買賣產權觀難應當麼這樣實現單關閉過]/g) || []).length;
    if (trad > simp) return "zh-Hant";
    if (simp > trad) return "zh-Hans";
    return ""; // ambiguous → default (TC-first) stack handles it
  }
  // D9-3: Arabic / Hebrew script blocks (escaped code points, not literal RTL
  // characters, to avoid embedding bidi source in this file). Codes double as
  // the RTL signal below (renderedView.dir), unlike the LTR branches above.
  if (/[\u0600-\u06FF]/.test(s)) return "ar"; // Arabic
  if (/[\u0590-\u05FF]/.test(s)) return "he"; // Hebrew
  return ""; // Latin / Cyrillic → default stack's Latin head
}

// Monotonic article generation counter. renderArticleContent() captures it at
// call time and every deferred enhancer it schedules (hljs / Mermaid / KaTeX,
// all of them rAF- or promise-continuations that outlive the render call)
// re-checks it before touching the DOM, so a callback queued for article N can
// never write into article N+1's DOM. Nothing bumps it yet — the first render
// is the only render — so today every check trivially matches and the guards
// are inert; the in-place replacement path bumps it.
let _articleRevision = 0;
// Dispose handle for the scroll-spy belonging to the CURRENT article. Lives at
// module scope beside setupScrollSpy() itself; the render pipeline inside the
// IIFE calls the stored dispose before installing a new spy, so observers and
// the scroll listener can't accumulate across rebuilds.
let _scrollSpyDispose = null;

// Lazy-load the vendored highlight.js (~122KB) on demand: only articles that actually
// contain code blocks pay its parse/compile cost, and never on the blocking first-paint
// path. Cached so concurrent callers share one load; degrades to no-highlight on error.
let _hljsPromise = null;
function ensureHljs() {
  if (typeof hljs !== "undefined") return Promise.resolve();
  if (_hljsPromise) return _hljsPromise;
  _hljsPromise = new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = "vendor/highlight.min.js";
    s.onload = () => resolve();
    s.onerror = () => resolve(); // degrade gracefully: page works without highlighting
    document.head.appendChild(s);
  });
  return _hljsPromise;
}

// Lazy-load KaTeX (JS + auto-render + CSS) only for math-bearing content (e.g. arXiv),
// so non-math previews never pay the ~270KB cost and currency "$" on other pages is
// never touched. CSS is injected here too so the lean first-paint isn't burdened.
let _katexPromise = null;
function ensureKatex() {
  if (typeof renderMathInElement !== "undefined") return Promise.resolve();
  if (_katexPromise) return _katexPromise;
  _katexPromise = new Promise((resolve) => {
    const css = document.createElement("link");
    css.rel = "stylesheet"; css.href = "vendor/katex/katex.min.css";
    document.head.appendChild(css);
    const s = document.createElement("script");
    s.src = "vendor/katex/katex.min.js";
    s.onload = () => {
      const a = document.createElement("script");
      a.src = "vendor/katex/auto-render.min.js";
      a.onload = () => resolve();
      a.onerror = () => resolve();
      document.head.appendChild(a);
    };
    s.onerror = () => resolve(); // degrade gracefully: math stays as $...$ source
    document.head.appendChild(s);
  });
  return _katexPromise;
}

// X2: bookmarked badge padlock icon (no PBP_ICONS entry for this yet — kept
// local to md-preview.js rather than growing shared.js's icon bank for one
// consumer). Same style budget as PBP_ICONS entries in shared.js: viewBox
// 0 0 16 16, stroke currentColor, aria-hidden (a11y label lives on the
// wrapping span in renderBookmarkBadge, not the SVG itself).
const PBP_BOOKMARK_LOCK_SVG = typeof PBP_ICONS !== "undefined" ? PBP_ICONS.lock : "";

// Pure: turns the background.js mdPreviewBookmarkInfo response into the
// badge's render model. No DOM/chrome access — kept side-effect-free even
// though md-preview.js has no test harness to exercise it directly (the
// file's top-level IIFE below depends on chrome.storage/real DOM ids, so
// it isn't loaded by tests/md-ai-tests.html; see the task note).
function pbpBuildBookmarkBadgeModel(resp) {
  if (!resp || resp.bookmarked !== true) return { show: false, tagsShown: [], tagsFull: "", isPrivate: false };
  const tagsFull = typeof resp.tags === "string" ? resp.tags.trim() : "";
  const tagsShown = tagsFull ? tagsFull.split(/\s+/).slice(0, 3) : [];
  return { show: true, tagsShown, tagsFull, isPrivate: resp.shared === "no" };
}

// Builds the bookmarked-badge DOM from a mdPreviewBookmarkInfo response and
// inserts it right after #preview-url. No-op when the model says not to
// show (unbookmarked / offline / no token / any exception — all collapse
// to {bookmarked:false} in background.js, so this silently does nothing).
// Tags are remote data (Pinboard-stored, not this extension's own strings)
// so they're only ever set via textContent/title, never innerHTML.
function renderBookmarkBadge(resp, url) {
  const model = pbpBuildBookmarkBadgeModel(resp);
  if (!model.show) return;
  const urlEl = document.getElementById("preview-url");
  if (!urlEl || !urlEl.parentNode) return;

  const a = document.createElement("a");
  a.className = "bookmark-badge";
  a.href = "https://pinboard.in/add?url=" + encodeURIComponent(url);
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  // Spec X2 i18n key group: an explicit aria-label on the anchor becomes the
  // ENTIRE accessible name (descendants are not traversed), so the private
  // state must be folded in here — the lock span's own aria-label below is
  // never announced through the anchor (it keeps its title tooltip only).
  a.setAttribute("aria-label",
    t("mdBookmarkedBadge") + (model.isPrivate ? ", " + t("mdBookmarkedPrivate") : ""));

  const icon = document.createElement("span");
  icon.className = "bb-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.innerHTML = PBP_ICONS.pin; // shared.js icon bank — fixed literal, no interpolation
  a.appendChild(icon);

  const label = document.createElement("span");
  label.textContent = t("mdBookmarkedBadge");
  a.appendChild(label);

  if (model.tagsShown.length) {
    const tagsEl = document.createElement("span");
    tagsEl.className = "bb-tags";
    tagsEl.textContent = model.tagsShown.join(" "); // remote data -> textContent only
    tagsEl.title = model.tagsFull;                  // full tag string, remote data -> title attr only
    a.appendChild(tagsEl);
  }

  if (model.isPrivate) {
    const lock = document.createElement("span");
    lock.className = "bb-lock";
    lock.setAttribute("role", "img");
    lock.setAttribute("aria-label", t("mdBookmarkedPrivate"));
    lock.title = t("mdBookmarkedPrivate");
    lock.innerHTML = PBP_BOOKMARK_LOCK_SVG; // fixed literal, no interpolation
    a.appendChild(lock);
  }

  urlEl.insertAdjacentElement("afterend", a);
}

// ============================================================
// Measured-height fold animation, shared by the rail accordion and the skim
// layer (md-skim.js loads after this file; it calls at runtime only).
// setFolded(v) must toggle ONLY the hiding class. Both endpoints are MEASURED
// from the real start/end states -- computing the collapsed target from
// head-height + paddings drifted from the truth (the head's own margins were
// missing), which snapped the box ~20px taller the instant the class landed.
// During the tween the content stays visible and is clipped away; the hiding
// class is applied on finish. Returns the Animation (pass it back as `prev`
// so a rapid reversal cancels it and resumes from the painted frame), or
// null when it fell back to an instant toggle (not motion-ready, reduced
// motion, display:none subtree, or animate=false).
// ============================================================
function pbpFoldHeightAnimate(el, next, setFolded, prev, animate) {
  const reduceMotion = pbpPrefersReducedMotion();
  const canAnimate = !!animate && !!el.animate
    && document.documentElement.classList.contains("motion-ready")
    && el.isConnected && el.getClientRects().length > 0
    && !reduceMotion;

  if (!canAnimate) {
    if (prev) prev.cancel();
    setFolded(next);
    el.style.removeProperty("height");
    el.style.removeProperty("overflow");
    return null;
  }

  // Capture the currently painted height before cancelling so a rapid
  // reversal continues from the interrupted frame instead of jumping.
  const currentHeight = el.getBoundingClientRect().height;
  if (prev) prev.cancel();

  el.style.removeProperty("height");
  setFolded(next);
  const endHeight = el.offsetHeight; // real end state, margins and all
  setFolded(false);                  // content visible while the height tweens
  el.style.height = currentHeight + "px";
  el.style.overflow = "clip";

  const cs = getComputedStyle(el);
  const duration = parseFloat(cs.getPropertyValue("--motion-collapse")) || 200;
  // The rail fold is an on-screen morph, so it takes the morph curve -- the same
  // one the options accordion uses. The literal is a last-resort fallback only:
  // if it is ever the value actually in use, --ease-in-out has gone missing from
  // md-preview.css and the fold has silently dropped back to a weak curve.
  const easing = cs.getPropertyValue("--ease-in-out").trim() || "cubic-bezier(0.77, 0, 0.175, 1)";
  const animation = el.animate(
    [{ height: currentHeight + "px" }, { height: endHeight + "px" }],
    { duration, easing }
  );
  animation.onfinish = () => {
    setFolded(next);
    el.style.removeProperty("height");
    el.style.removeProperty("overflow");
  };
  return animation;
}

// ============================================================
// Rail accordion (spec: docs/superpowers/specs/2026-07-04-md-preview-hl-
// notebook-rail-design.md). pbpRailCollapseState is PURE (no DOM/chrome).
// pbpRailCollapsible touches DOM + chrome.storage.local, but (like
// renderBookmarkBadge above) only inside functions invoked at call time --
// defining it here has no side effect. tests/md-ai-tests.html loads this
// whole file on file:// (the boot IIFE above early-returns without chrome),
// so both are directly unit-testable.
// ============================================================
const PBP_RAIL_STORAGE_KEY = "pbp_rail_collapse";

// Merge stored collapse-state against a defaults map: only defaults' own
// keys are read (unknown keys in stored are dropped), a missing/non-boolean
// value for a key falls back to defaults, and a non-object/null stored
// value yields defaults untouched. `defaults` may carry 1 key (a single
// section's own call) or all 5 (tests, or a hypothetical bulk read).
function pbpRailCollapseState(stored, defaults) {
  const out = {};
  const src = (stored && typeof stored === "object") ? stored : {};
  for (const k of Object.keys(defaults || {})) {
    out[k] = typeof src[k] === "boolean" ? src[k] : !!defaults[k];
  }
  return out;
}

// Read-modify-write a single key into the shared storage object so one
// section's toggle never clobbers another's remembered state. Best-effort:
// any failure (including no chrome.storage at all) degrades silently.
function _pbpRailPersist(key, collapsed) {
  if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) return;
  chrome.storage.local.get(PBP_RAIL_STORAGE_KEY).then((r) => {
    const cur = (r && typeof r[PBP_RAIL_STORAGE_KEY] === "object" && r[PBP_RAIL_STORAGE_KEY]) || {};
    const next = Object.assign({}, cur, { [key]: collapsed });
    return chrome.storage.local.set({ [PBP_RAIL_STORAGE_KEY]: next });
  }).catch(() => {});
}

// Installs a collapsible header on sectionEl. opts: {label: string|Element,
// count?: () => string|null, defaultCollapsed: boolean}.
//
// opts.count is read ONCE here to seed the header badge span (class
// .rail-sec-count). It is NOT re-polled by this engine -- a section whose
// count changes over its lifetime (the hl notebook) keeps the badge live by
// writing .rail-sec-count.textContent itself on each re-render (Task 3),
// exactly as md-translate.js writes .rail-sec-progress for the tr mini-count.
//
// HEADLESS MODE: when opts.label is an Element that is sectionEl's ONLY
// child, there is no separate content to hide (ask-section's sole content
// IS its entry button, whose aria-expanded/aria-controls already correctly
// describe "is the thing I control -- #ask-panel -- visible", which for a
// one-row section already means exactly the same thing as "is this section
// expanded"). In that case pbpRailCollapsible does NOT touch the element's
// classes/attributes at all -- any DOM change here would either duplicate
// or fight that pre-existing, already-correct wiring. It only returns the
// storage-backed expand/collapse/isCollapsed trio (collapse()/persisted
// expand() DO write pbp_rail_collapse for interface conformance, but have
// no visible effect since there is nothing to show/hide).
//
// NORMAL MODE (Export/TOC/tr/hl): opts.label is a plain string or a plain
// non-interactive label element. A new <button class="rail-sec-head">
// replaces it in place (same text, optional data-i18n carried over so live
// language switches keep working, optional count badge, a CSS-triangle
// indicator, an always-present-but-empty mini-progress slot, and
// aria-expanded/aria-controls pointing at sectionEl's own id -- assigned
// one if it doesn't have one). Collapsing toggles sectionEl.classList
// "rail-collapsed"; CSS (`.rail-collapsed > *:not(.rail-sec-head)`) hides
// every OTHER direct child, so anything appended to sectionEl LATER (a
// progress span, the view-toggle wrap, a usage line) is automatically
// covered without pbpRailCollapsible tracking a separate content-wrapper
// reference.
function pbpRailCollapsible(sectionEl, key, opts) {
  opts = opts || {};
  const headless = opts.label instanceof Element
    && sectionEl.children.length === 1
    && sectionEl.children[0] === opts.label;
  let collapsed = !!opts.defaultCollapsed;
  let headBtn = null;
  let railAnimation = null;
  // Set true by a user click or an explicit expand()/collapse() call (e.g. Task 2's
  // cache-restore auto-expand). Once true, the async storage catch-up below never
  // applies its correction -- otherwise a toggle landing between install and the
  // chrome.storage.local.get() resolving gets silently reverted by a stale read.
  let overridden = false;

  function applyDom(next, animate) {
    if (headBtn) headBtn.setAttribute("aria-expanded", next ? "false" : "true");
    railAnimation = pbpFoldHeightAnimate(
      sectionEl,
      next,
      (v) => sectionEl.classList.toggle("rail-collapsed", v),
      railAnimation,
      !!animate && !!headBtn
    );
  }

  function setState(next, persist, animate) {
    const changed = next !== collapsed;
    collapsed = next;
    if (!headless) applyDom(next, changed && animate);
    if (persist) _pbpRailPersist(key, next);
  }

  if (!headless) {
    const existingLabelEl = (opts.label instanceof Element) ? opts.label : null;
    const labelText = existingLabelEl ? existingLabelEl.textContent : String(opts.label || "");
    const dataI18n = (existingLabelEl && existingLabelEl.getAttribute)
      ? existingLabelEl.getAttribute("data-i18n") : null;

    headBtn = document.createElement("button");
    headBtn.type = "button";
    headBtn.className = "rail-sec-head";

    const tri = document.createElement("span");
    tri.className = "rail-sec-tri";
    tri.setAttribute("aria-hidden", "true");
    headBtn.appendChild(tri);

    const labelSpan = document.createElement("span");
    labelSpan.className = "rail-sec-label";
    labelSpan.textContent = labelText;
    if (dataI18n) labelSpan.setAttribute("data-i18n", dataI18n);
    headBtn.appendChild(labelSpan);

    if (typeof opts.count === "function") {
      const c = opts.count();
      if (c != null) {
        const countSpan = document.createElement("span");
        countSpan.className = "rail-sec-count";
        countSpan.textContent = c;
        headBtn.appendChild(countSpan);
      }
    }

    const prog = document.createElement("span");
    prog.className = "rail-sec-progress";
    headBtn.appendChild(prog);

    if (!sectionEl.id) sectionEl.id = "rail-sec-" + key;
    headBtn.setAttribute("aria-controls", sectionEl.id);

    if (existingLabelEl) existingLabelEl.replaceWith(headBtn);
    else sectionEl.insertBefore(headBtn, sectionEl.firstChild);

    headBtn.addEventListener("click", () => { overridden = true; setState(!collapsed, true, true); });

    // Apply the default SYNCHRONOUSLY, before the async storage read below.
    // chrome.storage.local.get() is a real IPC round-trip in the extension
    // (not a same-tick resolved promise) -- without this, every collapsed-
    // by-default section (Export, tr) would render fully expanded for at
    // least one frame then visibly snap shut once the promise resolves.
    // `collapsed` already equals `!!opts.defaultCollapsed` at this point
    // (see its declaration above), so this paints the common case (no
    // stored override, or an override that matches the default) with zero
    // flash; only a genuinely different stored value causes the async
    // branch below to fix it up with one visible re-toggle.
    applyDom(collapsed, false);
  }

  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(PBP_RAIL_STORAGE_KEY).then((r) => {
      if (overridden) return; // a click or expand()/collapse() already set the authoritative state -- don't fight it
      const merged = pbpRailCollapseState(r && r[PBP_RAIL_STORAGE_KEY], { [key]: !!opts.defaultCollapsed });
      if (merged[key] !== collapsed) setState(merged[key], false, true);
    }).catch(() => {});
  }

  return {
    expand(temp) { overridden = true; setState(false, !temp, true); },
    collapse() { overridden = true; setState(true, true, true); },
    isCollapsed() { return collapsed; },
  };
}

// ============================================================
// Color scheme (spec: docs/superpowers/specs/2026-07-04-md-preview-color-
// scheme-design.md). optTheme ("dark"|"light"|"auto") forces the preview
// page's color-scheme, overriding the CSS default of following the
// system (:root { color-scheme: light dark } + light-dark() tokens in
// md-preview.css). The two hljs <link>s' media attribute is the one
// thing light-dark() cannot drive (their media query targets the OS's
// prefers-color-scheme, not the page's color-scheme property) -- a
// forced mode rewrites it directly: the "off" sheet gets media="not all"
// (never matches, but the stylesheet stays in the DOM so nothing else
// has to change) and the wanted one gets media="all". "auto" restores
// the literal media strings md-preview.html ships with.
// pbpResolveColorScheme is PURE (no DOM/chrome) -- unit-tested in
// tests/md-ai-tests.html. md-preview-theme-early.js carries its own tiny
// copy of this same pair (it must run standalone, before this deferred
// file loads) -- see that file's header comment.
// ============================================================
// Must mirror the literal media attributes on the two hljs <link>s in
// md-preview.html (lines 8-9) -- "auto" mode restores exactly these.
const PBP_HLJS_AUTO_LIGHT_MEDIA = "(prefers-color-scheme: light)";
const PBP_HLJS_AUTO_DARK_MEDIA = "(prefers-color-scheme: dark)";

function pbpResolveColorScheme(mode) {
  if (mode === "dark") return { colorScheme: "dark", lightMedia: "not all", darkMedia: "all" };
  if (mode === "light") return { colorScheme: "light", lightMedia: "all", darkMedia: "not all" };
  return { colorScheme: "", lightMedia: PBP_HLJS_AUTO_LIGHT_MEDIA, darkMedia: PBP_HLJS_AUTO_DARK_MEDIA };
}

function pbpApplyColorScheme(mode) {
  try {
    const r = pbpResolveColorScheme(mode);
    document.documentElement.style.colorScheme = r.colorScheme;
    const lightLink = document.getElementById("hljs-light-link");
    const darkLink = document.getElementById("hljs-dark-link");
    if (lightLink) lightLink.media = r.lightMedia;
    if (darkLink) darkLink.media = r.darkMedia;
  } catch (_) { /* degrade: leave the system-following CSS default in place */ }
}

(async function () {
  initI18n();
  applyI18n();
  // file://-safe bailout: tests/md-ai-tests.html loads this whole file (deferred
  // scripts, no extension context) to reach pbpRailCollapseState/pbpRailCollapsible
  // below -- neither needs anything past this point. Mirrors the same typeof-chrome
  // guard already used for md-highlight.js's top-level chrome.storage.onChanged wiring.
  if (typeof chrome === "undefined" || !chrome.storage) return;

  // optTheme: authoritative confirmation pass. md-preview-theme-early.js already
  // applied a best-effort guess (localStorage mirror) before first paint; this read
  // is the real chrome.storage source of truth, run as early as possible (before
  // extraction/render below) so it never lags behind on a slow page. Own try/catch
  // (must never block the render path on a settings hiccup) -- degrades to whatever
  // the early script (or the CSS default) already set. storage.onChanged keeps an
  // already-open preview in sync when optTheme changes in Options (same dynamic
  // sync/local area handling as md-translate.js's translateTargetLang listener).
  try {
    const settingsArea = await getSettingsStorage();
    const { optTheme } = await settingsArea.get({ optTheme: "auto" });
    pbpApplyColorScheme(optTheme);
  } catch (_) { /* degrade: leave whatever md-preview-theme-early.js (or the CSS default) set */ }
  if (chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if ((area !== "sync" && area !== "local") || !changes.optTheme) return;
      pbpApplyColorScheme(changes.optTheme.newValue);
    });
  }

  // Per-tab token key: the opener (popup / shortcut) minted ?k=<uuid> and wrote the
  // payload to md_preview_data_<uuid>, so this tab reads ONLY its own slot and can't
  // be clobbered by a concurrent preview. No k = a pre-update tab → fall back to the
  // legacy global key so it still opens.
  const k = new URLSearchParams(location.search).get("k");
  const MP_KEY = k ? "md_preview_data_" + k : "md_preview_data";
  // Read preview data from storage. The reader typography tiers (plan B) ride
  // this SAME read -- no extra IPC -- and are applied BEFORE the first render
  // below, so a non-default tier never paints at the default and re-lays out.
  // pbpTypoApplyVars lives in shared.js, which PRECEDES this file in
  // md-preview.html -- availability is structural, not a load-order bet
  // (defining it in the later md-reader.js was a real race: Codex acceptance
  // delayed that script 1.8s and the render shipped unstyled). The typeof
  // guard only covers shared.js failing to load at all. _pbpTypoStored hands
  // the raw tiers to md-reader.js's _pbpTypoInit so it doesn't re-read
  // storage.
  const data = await chrome.storage.local.get([MP_KEY, "pbp_font_tier", "pbp_leading_tier"]);
  window._pbpTypoStored = { font: data.pbp_font_tier, leading: data.pbp_leading_tier };
  if (typeof pbpTypoApplyVars === "function") pbpTypoApplyVars(data.pbp_font_tier, data.pbp_leading_tier);
  const info = data[MP_KEY];
  if (!info) {
    renderEmptyState(t("mdPreviewEmpty"));
    return;
  }
  // Clear temporary data — but KEEP a pending/restore placeholder so a manual reload
  // during extraction (or before it retriggers, on F5 / Memory Saver discard) re-drives
  // it instead of hitting the empty state (the reextract success path overwrites
  // md_preview_data with the full payload, which that load then clears).
  if (!info.pending && !info.restore) {
    await chrome.storage.local.remove(MP_KEY);
  }

  const { contentHtml, title, url, tokens, source } = info;
  const srcTabId = info.tabId;
  const baseUrl = info.baseUrl || url || "";
  // Immutable source-tab identity (hotlink round): `url`/`baseUrl` can be
  // Jina's canonicalized d.url or (from the popup) an edited/tracker-stripped
  // input value; only this field is guaranteed to be the tab's literal URL, so
  // it alone is safe for the weak-handle guard and as the image-fix Referer
  // origin. LEGACY payloads (written before this field existed) fall back to
  // url: that reproduces the PRE-EXISTING behavior exactly -- a Jina-first
  // legacy preview still can't switch back to local (the bug this field fixes
  // going forward), but adopting the tab's CURRENT url instead would silently
  // extract a different page if the user had navigated, which is the very
  // thing the guard exists to prevent. Reloading such a preview does NOT heal
  // it (the restore record carries this same fallback value forward); only
  // opening a fresh preview from the popup/shortcut seeds the real tab URL.
  const sourceTabUrl = (typeof info.sourceTabUrl === "string" && info.sourceTabUrl) || url || "";
  const previewAccount = typeof info.account === "string" ? info.account : "";
  const tags = Array.isArray(info.tags) ? info.tags : [];
  const description = info.description || "";
  // X4: raw metadata transported by popup.js/background.js's widened
  // extraction payload. Gated by buildMeta()'s exportSettings.mdExportExtendedMeta
  // check (design spec 4.2) -- this file only reads them here; T4's buildMeta()
  // consumes these consts by closure (same scope as `description` above).
  const author = info.author || "";
  const published = info.published || "";
  const site = info.site || "";
  const image = info.image || "";

  // Engine-switch plumbing, hoisted above the pending-extraction branch so a failed
  // shortcut/reload attempt can offer a working Defuddle<->Jina escape hatch (below)
  // instead of only the later "switch engine on an already-rendered article" control
  // that reuses these same functions/elements further down.
  const sourceEl = document.getElementById("source-badge");
  const engineStatusEl = document.getElementById("engine-status");
  const srcUrlForSwitch = url || "";
  function setEngineStatus(text, isError) {
    if (!engineStatusEl) return;
    engineStatusEl.textContent = text || "";
    engineStatusEl.classList.toggle("error", !!isError);
  }
  function engineLabel(e) { return e === "jina" ? "Jina Reader" : "Defuddle"; }
  function engineUnavailable(e) {
    if (e === "jina") return !/^https?:\/\//i.test(srcUrlForSwitch);
    return !srcTabId; // local needs the source tab
  }
  function friendlyEngineErr(r) {
    const code = r && r.error;
    if (code === "tab_unavailable" || code === "tab_navigated") return t("mdEngineTabGone");
    if (code === "empty") return t("mdPreviewNoContent");
    if (code === "host_permission") return t("aiErrorHostPermission", "https://r.jina.ai");
    // "network" covers both this file's own sendMessage-throw catches (below,
    // and the engine-switch handler further down) and jina.js's fetch-TypeError
    // classification relayed unchanged through background.js — otherwise every
    // offline failure fell into the generic mdEngineExtractFailed bucket,
    // indistinguishable from a bad API key or a dead Jina service (D4-2).
    if (code === "network") return t("pinboardErrorOffline");
    return t("mdEngineExtractFailed");
  }
  function applyAvailability(curEngine) {
    if (!sourceEl) return;
    sourceEl.querySelectorAll(".src-seg").forEach((seg) => {
      const e = seg.getAttribute("data-engine");
      const active = e === curEngine;
      const unavail = engineUnavailable(e) && !active;
      seg.classList.toggle("active", active);
      seg.setAttribute("aria-pressed", active ? "true" : "false");
      seg.disabled = unavail;
      if (unavail) seg.setAttribute("aria-disabled", "true");
      else seg.removeAttribute("aria-disabled");
      if (!active && !unavail) seg.title = t("mdEngineSwitchTo", engineLabel(e));
      else if (unavail && e === "local") seg.title = t("mdEngineTabGone");
      else seg.removeAttribute("title");
    });
  }

  // Single writer for "the transcript becomes this page's article". Defined
  // here, not in md-video.js, so the rewritten payload keeps this page's
  // account/tags/description contract intact (owner isolation). Writes the
  // transcript as the canonical markdown and reloads into the normal article
  // path -- rail, exports, Ask, and translation then all run on the
  // transcript. Callers: the pending/restore branch below (extraction failed
  // on a video page but captions exist) and md-video.js's AI-punctuation pass
  // (refresh the article in place once the marks land).
  // videoTranscript marks the payload as ALREADY being a transcript, so the
  // reloaded normal path keeps this exact markdown instead of re-deriving one
  // from the session (which would silently drop the AI punctuation).
  // videoDescriptionMd carries the extracted description ALONGSIDE it: the
  // description is not recoverable from a transcript payload (the extraction
  // that produced it is long gone), so dropping it here would empty the
  // collapsed description block on every commit.
  // Returns true only when the payload was written and the reload is under
  // way, so callers can fall back when storage refuses the write.
  // aiPunct=true marks the markdown as carrying a PAID AI-punctuation pass:
  // the reloaded page hides the AI button only for those payloads (paying
  // twice for the same track would be the bug), while heuristic-tier commits
  // (first-run promotion, track switches) keep the upgrade on offer.
  window.pbpVideoCommitTranscript = async (transcriptMd, fallbackTitle, aiPunct) => {
    if (!transcriptMd || !String(transcriptMd).trim()) return false;
    try {
      await chrome.storage.local.set({
        [MP_KEY]: {
          markdown: String(transcriptMd), title: title || fallbackTitle || "",
          videoTranscript: true,
          videoAiPunct: aiPunct === true,
          videoDescriptionMd: (window.pbpVideoDoc && window.pbpVideoDoc.descriptionMarkdown) || "",
          url, baseUrl, sourceTabUrl, tabId: srcTabId,
          source: source === "jina" ? "jina" : "local",
          account: previewAccount, tags, description, ts: Date.now()
        }
      });
      location.reload();
      return true;
    } catch (_) { /* quota -- keep the panel as-is; Copy still works */ }
    return false;
  };

  // Shortcut opens the preview INSTANTLY with a pending placeholder, then the
  // preview drives extraction via the reextract path (so the tab appears immediately
  // even when Jina needs a network round-trip). On success the SW has written the
  // full md_preview_data, so we reload into the normal render path.
  if (info.pending || info.restore) {
    const titleEl0 = document.getElementById("preview-title");
    if (titleEl0) { titleEl0.textContent = title || t("mdPreviewUntitled"); titleEl0.title = title || ""; }
    document.title = (title || "Markdown") + " — " + t("mdStripPreview");
    // video-mode BEFORE any extraction work: the page is a watch page no
    // matter how the extraction turns out, so the shell should not spend the
    // whole (possibly slow) attempt styled as an ordinary article and then
    // reflow. md-video.js is the last defer script and this runs before the
    // barrier below, so the typeof guard covers "not parsed yet"; the
    // post-failure path re-adds the class once the barrier has passed.
    if (typeof pbpVideoDetect === "function" && pbpVideoDetect(sourceTabUrl || url)) {
      document.body.classList.add("video-mode");
    }

    // One function drives the initial attempt, the error state's retry button, and the
    // rail's engine-switch badge clicks — all funnel back through the same
    // reextractMarkdown message, never a separate channel.
    let attemptedEngine = info.engine;
    let inFlight = false;
    async function retryExtract(engine, failure) {
      if (inFlight) return;
      inFlight = true;
      try {
        if (engine === "jina" && failure && failure.error === "host_permission") {
          if (!await pbpRequestJinaHostPermission()) return;
        }
      } finally {
        inFlight = false;
      }
      await attemptExtract(engine);
    }
    async function attemptExtract(engine) {
      inFlight = true;
      attemptedEngine = engine;
      applyAvailability(engine);
      renderLoadingState(
        t("mdEngineExtracting", engineLabel(engine)),
        engine === "jina" ? t("mdEngineExtractingNoteJina") : ""
      );
      let pr;
      try {
        pr = await chrome.runtime.sendMessage({
          type: "reextractMarkdown", tabId: srcTabId, url, engine, sourceTabUrl,
          account: previewAccount, tags, description, k
        });
      } catch (_) { pr = { ok: false, error: "network" }; }
      inFlight = false;
      if (pr && pr.ok) { location.reload(); return; }
      renderErrorState(
        friendlyEngineErr(pr),
        () => retryExtract(attemptedEngine, pr),
        pr && pr.error === "host_permission"
      );
      // Video pages reach HERE, not the canonical-markdown guard further down:
      // a bilibili/YouTube watch page has no article to extract, so the
      // extraction reports "empty" and this branch renders the error and
      // returns. Mount the panel over that error shell too -- for a video page
      // the video IS the content, so "extraction failed" is not the whole
      // story. (Fixing only the later guard is why bilibili still showed a
      // bare error after the previous round.)
      // md-video.js is the LAST defer script; this async flow can resume ahead
      // of it (storage/sendMessage round-trips vary), and the typeof guard then
      // silently skipped the mount -- the intermittent "no panel" of six device
      // rounds. Wait for the defer chain before deciding.
      await pbpDeferredScriptsReady;
      // Extraction dead-ended, but on a video page the transcript IS the
      // article: try the capture session and, when it yields captions,
      // rebuild the page THROUGH the canonical payload + reload so the normal
      // path (rail, TOC, exports, Ask, translation) runs on the transcript.
      // Reloads exactly ONCE and only with segments: the payload written is a
      // full one, so the reloaded page never re-enters this branch.
      const vDetectedErr = typeof pbpVideoDetect === "function" ? pbpVideoDetect(sourceTabUrl || url) : null;
      if (vDetectedErr) {
        document.body.classList.add("video-mode");
        // The caption session is extraction work too: leaving inFlight false
        // here let a .src-seg badge click start a concurrent attemptExtract
        // while a transcript commit + reload was already under way, so two
        // writers raced for MP_KEY. Held for the whole block and released only
        // if we are NOT reloading.
        inFlight = true;
        let committed = false;
        try {
          let vSession = null;
          if (typeof window.pbpPrepareVideoSession === "function") {
            try { vSession = await window.pbpPrepareVideoSession({ pageUrl: sourceTabUrl || url, tabId: srcTabId }); }
            catch (e) { console.warn("[pbp-video] session failed on error shell:", (e && e.message) || e); }
          }
          if (vSession && vSession.granted && vSession.segments && vSession.segments.length
              && typeof pbpVideoTranscriptMarkdown === "function" && typeof pbpVideoTranscriptMeta === "function") {
            committed = await window.pbpVideoCommitTranscript(
              pbpVideoTranscriptMarkdown(vSession.segments, pbpVideoTranscriptMeta(vSession, title, sourceTabUrl || url)),
              title || ""
            );
          }
        } finally {
          if (!committed) inFlight = false;
        }
        if (committed) return; // reload is under way; do not also mount the panel
        // The panel about to mount can still promote the transcript once the
        // user grants the origin (md-video.js's first-run commit), which needs
        // a pbpVideoDoc to key off. No transcript reached the article here, so
        // this shell is a fallback by definition.
        if (!window.pbpVideoDoc) window.pbpVideoDoc = { kind: "video-fallback", descriptionMarkdown: "" };
      }
      if (typeof pbpVideoInit === "function") pbpVideoInit({ pageUrl: sourceTabUrl || url, title: title, tabId: srcTabId });
      else console.warn("[pbp-video] mount unavailable: pbpVideoInit missing after deferred scripts");
      applyAvailability(attemptedEngine);
    }
    if (sourceEl) {
      sourceEl.querySelectorAll(".src-seg").forEach((seg) => {
        seg.addEventListener("click", () => {
          const e = seg.getAttribute("data-engine");
          if (inFlight || e === attemptedEngine || seg.disabled) return;
          attemptExtract(e);
        });
      });
    }
    await attemptExtract(info.engine); // awaited so a synchronous throw here still reaches the IIFE's top-level .catch()
    return;
  }
  // Canonical Markdown: Defuddle HTML -> Turndown; Jina already gives MD.
  // Single source of truth for Raw view, Copy MD, Download .md, and Rendered.
  const _extractedMarkdown0 = info.markdown || (contentHtml ? htmlToMarkdown(contentHtml, { baseUrl }) : "");
  // Math pages only: repair scraped TeX once at the source so the live view,
  // TOC, translate blocks, and every export see the same normalized text.
  // Applied to the EXTRACTED text only -- a caption transcript carries no
  // scraped TeX, and normalizing it would only risk mangling plain speech.
  const _extractedMarkdown = (info.math && typeof pbpLatexNormalize === "function")
    ? pbpLatexNormalize(_extractedMarkdown0) : _extractedMarkdown0;

  // Video bootstrap: on a watch page the transcript IS the article. Run the
  // capture session BEFORE the canonical text is fixed, so the empty guard,
  // TOC, stats, language detection, render, and every export downstream see
  // the transcript with no further special-casing. The extracted text (usually
  // just the video description) is stashed on pbpVideoDoc for the collapsed
  // description block. No captions -> keep the extracted text as-is
  // ("video-fallback"), including the empty-extraction case, which still falls
  // into the empty-state + panel-mount guard below.
  let _videoMarkdown = null;
  {
    // md-video.js is the LAST defer script; this async flow can resume ahead of
    // it, so wait for the defer chain before probing for its globals.
    await pbpDeferredScriptsReady;
    const vDetected = typeof pbpVideoDetect === "function" ? pbpVideoDetect(sourceTabUrl || url) : null;
    if (vDetected) {
      document.body.classList.add("video-mode");
      let vSession = null;
      // Committed-transcript payloads (videoTranscript flag) skip the whole
      // capture session: the article is already decided, and gating first
      // paint on a network chain whose result gets ignored held every F5 of
      // a committed page at "Loading subtitles" (final-review M2). The panel
      // still fetches captions lazily through loadFlow after mount.
      if (info.videoTranscript !== true && typeof window.pbpPrepareVideoSession === "function") {
        // #rendered-view is still empty here (the render() call that fills
        // it is far below, after this whole block) -- without this the page
        // shows a blank article while captions fetch. The pending/restore
        // branch above already shows its own loading state via
        // attemptExtract, so this is the normal-path bootstrap's only gap.
        renderLoadingState(t("mdVideoLoading"), "");
        try { vSession = await window.pbpPrepareVideoSession({ pageUrl: sourceTabUrl || url, tabId: srcTabId }); }
        catch (e) { console.warn("[pbp-video] session failed:", (e && e.message) || e); }
        // renderLoadingState's md-empty hides the rail (CSS: body.md-empty
        // .rail{display:none}) and its aria-busy="true" marks #rendered-view
        // as loading -- both fine while the spinner is showing, but this
        // path (unlike the pending branch, which always reloads on success)
        // falls straight through to the real render below, so it must undo
        // both itself. The empty-content guard further down re-adds
        // md-empty on its own if canonicalMarkdown ends up blank.
        document.body.classList.remove("md-empty");
        const _rvAfterVideoLoad = document.getElementById("rendered-view");
        if (_rvAfterVideoLoad) _rvAfterVideoLoad.removeAttribute("aria-busy");
      }
      const vSegments = (vSession && vSession.granted && vSession.segments) || [];
      if (info.videoTranscript === true) {
        // This payload was written by pbpVideoCommitTranscript: the markdown
        // already IS the transcript (possibly AI-punctuated). Re-deriving one
        // from the session would throw that pass away. The description rides
        // along in the payload -- it cannot be re-extracted from here.
        window.pbpVideoDoc = { kind: "video-transcript", descriptionMarkdown: info.videoDescriptionMd || "", committed: true, aiPunct: info.videoAiPunct === true };
      } else if (vSegments.length && typeof pbpVideoTranscriptMarkdown === "function"
                 && typeof pbpVideoTranscriptMeta === "function") {
        window.pbpVideoDoc = { kind: "video-transcript", descriptionMarkdown: _extractedMarkdown };
        _videoMarkdown = pbpVideoTranscriptMarkdown(vSegments, pbpVideoTranscriptMeta(vSession, title, sourceTabUrl || url));
      } else {
        // Keep the description here too: the first-run promotion commit reads
        // it off this object, and an empty stash silently killed the
        // description block for that whole session (final-review M1).
        window.pbpVideoDoc = { kind: "video-fallback", descriptionMarkdown: _extractedMarkdown };
      }
    }
  }
  // `let`, not const: an in-place article replacement reassigns this after its
  // payload is persisted, so getMarkdown() (and everything downstream of it —
  // export, Copy, Raw, reading stats) follows without a page reload. Nothing
  // reassigns it today; every reader already goes through getMarkdown(), which
  // is why widening the binding is enough.
  let canonicalMarkdown = _videoMarkdown !== null ? _videoMarkdown : _extractedMarkdown;
  function getMarkdown() { return canonicalMarkdown; }
  if (!canonicalMarkdown.trim()) {
    // A video page's "content" IS the video: YouTube/bilibili watch pages
    // routinely extract to nothing, and returning here used to kill the whole
    // preview before the video panel could mount (bilibili never showed a
    // panel at all; a YouTube re-open that extracted empty lost its button).
    // Render the empty-state shell first, then let the panel attach above it.
    renderEmptyState(t("mdPreviewNoContent"));
    // pbpDeferredScriptsReady is already awaited above (video bootstrap), so
    // md-video.js -- the LAST defer script -- has run by now; the typeof guard
    // only covers it failing to load at all.
    if (typeof pbpVideoInit === "function") pbpVideoInit({ pageUrl: sourceTabUrl || url, title: title, tabId: srcTabId });
    else console.warn("[pbp-video] mount unavailable: pbpVideoInit missing after deferred scripts");
    return;
  }

  // Reload/Memory-Saver recovery: replace the (now redundant) full payload with a
  // lightweight restore record — url/tabId/engine/tags, NO markdown/contentHtml (avoids
  // storage.local quota on huge articles) — so a later reload rebuilds the article via
  // the SAME reextractMarkdown path the engine-switch control uses (below), instead of
  // landing on the "no preview data" empty state. Best-effort: a write failure just
  // degrades to the pre-existing behavior (empty state on the next reload).
  //
  // A COMMITTED TRANSCRIPT is the one thing re-extraction cannot rebuild: the
  // watch page has no article, so the restore record's reextract would fail,
  // fall into the error shell, and re-derive a heuristic transcript --
  // silently throwing away an AI punctuation pass the user paid for. Keep the
  // full payload (markdown + description) for those pages instead, WITHOUT
  // restore:true so the reload lands straight back in the flag branch above.
  // Transcripts run ~100KB, well inside storage.local; the try/catch degrade
  // is unchanged.
  const _restoreRecord = info.videoTranscript === true
    ? {
        videoTranscript: true, markdown: canonicalMarkdown,
        videoAiPunct: info.videoAiPunct === true,
        videoDescriptionMd: (window.pbpVideoDoc && window.pbpVideoDoc.descriptionMarkdown) || "",
        title: title || "", url, baseUrl, sourceTabUrl, tabId: srcTabId,
        source: source === "jina" ? "jina" : "local",
        account: previewAccount, tags, description, ts: Date.now()
      }
    : {
        restore: true, url, tabId: srcTabId, sourceTabUrl,
        engine: source === "jina" ? "jina" : "local",
        account: previewAccount, tags, description, ts: Date.now()
      };
  try {
    await chrome.storage.local.set({ [MP_KEY]: _restoreRecord });
  } catch (_) { /* degrade to current behavior: next reload hits the empty state */ }

  // Export-options defaults from settings (per-export overridable via the header row).
  // Read from the SAME storage area options.js writes to: sync when the user enabled
  // sync, else local (the default). md-preview.html loads shared.js for
  // SETTINGS_DEFAULTS/deobfuscate helpers, but md-preview.* and md-*.js still use
  // native document.getElementById by convention. Reading chrome.storage.sync directly
  // would miss every customization for the default (sync-off) user — including the
  // obsidianEnabled gate, the vault/folder, and the frontmatter/image/TOC defaults.
  const EXPORT_SETTINGS_DEFAULTS = {
    mdExportFrontmatter: true,
    mdExportImagePolicy: "keep",
    mdExportIncludeToc: false,
    mdExportIncludeHighlights: true,
    mdExportExtendedMeta: true,
    obsidianEnabled: false,
    obsidianVault: "",
    obsidianFolder: "",
    exportTargets: {}
  };
  // Own try/catch: a storage read failure here (sync quota hiccup, corrupt area, etc.)
  // must degrade to defaults rather than propagate and blank the whole article — the
  // extraction above already succeeded and there's real content ready to render.
  let exportSettings = EXPORT_SETTINGS_DEFAULTS;
  try {
    exportSettings = await pbpReadSettingsWithSecrets(EXPORT_SETTINGS_DEFAULTS);
  } catch (_) {
    // degrade to defaults; article rendering remains usable
  }
  const expFrontmatter = document.getElementById("exp-frontmatter");
  const expImagePolicy = document.getElementById("exp-image-policy");
  const expIncludeToc = document.getElementById("exp-include-toc");
  const expIncludeHl = document.getElementById("exp-include-hl");
  // exp-frontmatter/-include-toc/-include-hl are real <button aria-pressed>
  // toggles now (rail redesign spec sec.1/4), not checkboxes -- pbpExpTglOn
  // reads the pressed state, pbpExpTglSet writes it. Same session-only
  // scope as the checkboxes they replace: initialized once from
  // exportSettings here, flipped by the click handlers below, never
  // persisted back to storage (persistence lives in options.js's own
  // opt-md-* checkboxes, a separate id space).
  function pbpExpTglOn(el) { return !!el && el.getAttribute("aria-pressed") === "true"; }
  function pbpExpTglSet(el, on) { if (el) el.setAttribute("aria-pressed", on ? "true" : "false"); }
  pbpExpTglSet(expFrontmatter, !!exportSettings.mdExportFrontmatter);
  if (expImagePolicy) expImagePolicy.value = exportSettings.mdExportImagePolicy || "keep";
  pbpExpTglSet(expIncludeToc, !!exportSettings.mdExportIncludeToc);
  pbpExpTglSet(expIncludeHl, !!exportSettings.mdExportIncludeHighlights);
  for (const tgl of [expFrontmatter, expIncludeToc, expIncludeHl]) {
    tgl?.addEventListener("click", () => pbpExpTglSet(tgl, !pbpExpTglOn(tgl)));
  }

  function pad2(n) { return n < 10 ? "0" + n : "" + n; }
  function todayIso() {
    const d = new Date();
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }
  const clippedDate = todayIso();
  // Shared export metadata + per-export option resolution (used by Copy/Download MD and Download .html).
  function buildMeta() {
    const meta = {
      title: title || "",
      url: url || "",
      date: clippedDate,
      tags,
      source: source === "jina" ? "jina" : "defuddle"
    };
    if (description) meta.description = description;
    // X4: extended metadata (author/published/site/image/words), gated by the
    // mdExportExtendedMeta setting (default on). Off -> meta stays exactly the
    // six keys above, byte-identical to pre-X4 exports (spec invariant 1).
    // author/published/site/image below are the outer-scope consts Task 3
    // declared off `info` (same closure as `description` above) -- reused here,
    // not re-read from `info.*` a second time.
    if (exportSettings.mdExportExtendedMeta !== false) {
      const trimmedAuthor = author.trim();
      if (trimmedAuthor) meta.author = trimmedAuthor.slice(0, 200);
      let resolvedSite = site.trim();
      if (!resolvedSite) {
        try { resolvedSite = new URL(url).hostname; } catch (_) { resolvedSite = ""; }
      }
      if (resolvedSite) meta.site = resolvedSite.slice(0, 200);
      const publishedDate = publishedIso(published);
      meta.date = publishedDate || "";
      if (publishedDate) meta.published = publishedDate;
      meta.clipped = clippedDate;
      if (image) meta.image = image;
      const stats = readingStats(getViewMarkdown());
      meta.words = stats.words + stats.cjkChars;
    }
    return meta;
  }
  function buildExportOpts() {
    return {
      frontmatter: expFrontmatter ? pbpExpTglOn(expFrontmatter) : !!exportSettings.mdExportFrontmatter,
      imagePolicy: expImagePolicy ? expImagePolicy.value : (exportSettings.mdExportImagePolicy || "keep"),
      includeToc: expIncludeToc ? pbpExpTglOn(expIncludeToc) : !!exportSettings.mdExportIncludeToc,
      // Same gate as the live-preview KaTeX pass below (info.math) — composeStyledHtml
      // only attempts renderMathInElement when this is true (audit E3 gap).
      math: !!info.math,
      // H2 export (md-highlight.js, loaded after this file — guarded because
      // buildExportOpts() only runs from click handlers, long after every deferred
      // script has executed; the typeof check just protects against md-highlight.js
      // failing to load at all). Unpressing exp-include-hl drops BOTH the inline
      // ==marks== and the "## Highlights" section (composeExport already skips
      // both for an empty array).
      highlights: (expIncludeHl ? pbpExpTglOn(expIncludeHl) : !!exportSettings.mdExportIncludeHighlights)
        ? ((typeof pbpHlCurrentItems === "function") ? pbpHlCurrentItems() : [])
        : [],
      // H5 (spec 1.6): which translation view the highlights are exported for,
      // read off the body class _pbpTrSetMode toggles (tr-only / tr-bilingual).
      hlView: document.body.classList.contains("tr-only") ? "tr"
        : (document.body.classList.contains("tr-bilingual") ? "bilingual" : "orig")
    };
  }
  // Raw view markdown, following the translation view: md-translate.js sets
  // window.pbpViewMarkdown when the view is bilingual/translated-only; it
  // returns null (or is undefined) for the original view. No frontmatter/
  // imagePolicy/TOC applied yet — composeExport/composeStyledHtml do that.
  function getViewMarkdown() {
    const viewMd = (typeof window.pbpViewMarkdown === "function") ? window.pbpViewMarkdown() : null;
    return viewMd || getMarkdown();
  }
  function buildExportMarkdown() {
    const opts = buildExportOpts();
    // Copy cannot embed (no resolveEmbed pass in its click chain): clamp
    // explicitly like Send-to does instead of leaning on applyImagePolicy's
    // incidental keep fall-through for unknown values (Codex, plan A).
    if (opts.imagePolicy === "embed") opts.imagePolicy = "keep";
    return composeExport(getViewMarkdown(), buildMeta(), opts);
  }

  // Codex-P4: status-line helper for the export section (no existing export
  // status affordance in this file to reuse) -- transient, self-hiding notice
  // for partial embed coverage. Not used for hard errors (those still throw/
  // degrade silently per the rest of the export pipeline).
  function showExportNote(msg) {
    const el = document.getElementById("export-note");
    if (!el) return;
    el.textContent = msg; el.hidden = !msg;
    // Scale visibility with content: the broken-image note carries an actual
    // instruction ("pick Embed"), and 6s was gone before anyone finished it.
    const ms = Math.min(12000, 4000 + (msg ? msg.length * 60 : 0));
    clearTimeout(el._t); el._t = setTimeout(() => { el.hidden = true; }, ms);
  }

  // Honest broken-image note (plan A, Codex-adjudicated): fires on any exit whose
  // OUTPUT keeps image links -- policy "keep", or "embed" silently degrading to
  // keep on an exit that cannot embed (Copy, Send-to; exitEmbeds=false). alt/strip
  // ship no links, and the three Download exits do real embedding with their own
  // partial note in resolveEmbed. Counting is positive evidence only: images are
  // loading="lazy", so a link that never scrolled into view has fired no error
  // yet -- hence "may not display", never a safety claim. And an error is any
  // load failure (404, network, hotlink), so the copy never says "hotlink".
  function imgFixExportNote(exitEmbeds) {
    const policy = expImagePolicy ? expImagePolicy.value : (exportSettings.mdExportImagePolicy || "keep");
    const clamped = policy === "embed" && !exitEmbeds;
    if (!clamped && policy !== "keep") return;
    const msgs = [];
    if (clamped) msgs.push(t("mdImgEmbedNotHere"));
    const n = (typeof pbpEmbedBrokenCount === "function")
      ? pbpEmbedBrokenCount(getViewMarkdown(), buildMeta().url || "", imgFixObserved)
      : 0;
    // Count rides t()'s substitution args, NOT a manual .replace: with a
    // "placeholders" block in messages.json, chrome.i18n.getMessage (the t()
    // fallback when no explicit UI language is picked) consumes $COUNT$
    // BEFORE a manual replace could see it -- the number silently vanished.
    // Same latent bug fixed at the mdEmbedPartial/mdStatsProgress call sites.
    if (n > 0) msgs.push(t("mdImgBrokenNote", String(n)));
    if (msgs.length) showExportNote(msgs.join(" ")); // ONE merged call -- a second showExportNote would overwrite the first
  }

  // Embed image policy (Task 4): runs on the RAW view markdown, BEFORE either
  // composeExport or composeStyledHtml -- each export format still calls its
  // own compose function exactly once (Codex-P1). Only fires when the export
  // image policy is "embed"; every other policy is a no-op pass-through so
  // Copy MD/HTML and any other getViewMarkdown() caller are unaffected.
  // Click (user gesture) -> synchronous scan -> synchronous permissions.request
  // -> async fetch -> rewrite on the RAW md. Returns rawMd (with data URIs
  // substituted where fetched), an "unembedded" count for the UI notice, and
  // the fetched Map (kept for parity with the runtime contract; unused here).
  // opts.keepUrls (Task 6, EPUB): skip the data-URI rewrite for successfully
  // fetched images -- pbpBuildEpub needs the original absolute URL still in the
  // markdown (and in the returned `fetched` Map) so it can find the matching
  // <img> via querySelector and rewrite it to a relative images/ path itself,
  // adding a real zip entry. Blob URLs still degrade to alt text either way
  // (dead outside the page regardless of export format). No separate note
  // formula needed: pbpEmbedRewrite's outBudget is omitted in this mode, so
  // rw.dropped is always 0 and the shared formula below already reduces to
  // spec's keepUrls count (blobs + unfetched candidates + kept, no dropped).
  async function resolveEmbed(rawMd, meta, opts) {
    const policy = expImagePolicy ? expImagePolicy.value : (exportSettings.mdExportImagePolicy || "keep");
    if (policy !== "embed") return { md: rawMd, note: 0, fetched: new Map() };
    const keepUrls = !!(opts && opts.keepUrls);
    // Codex-C1a: no separate applyImagePolicy("keep") absolutize pass here --
    // pbpEmbedScan/pbpEmbedRewrite each already absolutize relative src against
    // baseUrl internally, AND (unlike applyImagePolicy) mask inline code spans/
    // escaped \![ first. A pre-pass here would rewrite pseudo-image URLs sitting
    // inside code spans before that masking ever ran.
    const scan = pbpEmbedScan(rawMd, meta.url || "");
    // Codex-C4: EPUB (keepUrls) never touches the data URI -- pbpBuildEpub reads
    // {mime, bytes} straight off the fetched Map -- so skip building it (saves a
    // base64 string, ~4/3x the image bytes, at peak memory for large image sets).
    const embedLimits = keepUrls ? { ...PBP_EMBED_LIMITS, wantDataUri: false } : PBP_EMBED_LIMITS;
    // ONE budget across both rounds (Codex review): the hotlink retry below
    // must not get a fresh 25 MiB pool on top of round 1's.
    const embedBudget = pbpEmbedBudget(embedLimits.totalBytes);
    // A4 (Codex-adjudicated): reuse images the preview's fix flow already
    // fetched AND proved decodable, instead of re-downloading them (for the
    // hotlink subset that meant a full DNR-rule round trip). Synchronous, so
    // permissions.request below stays the click chain's FIRST await. Three-way
    // split per candidate: valid entry + budget reserved -> hit; valid entry
    // but the shared budget is exhausted -> DROPPED outright (refetching would
    // just fail the same budget -- never send it to the network or the retry
    // round); no/invalid entry -> network. Hits keyed by the SCAN url (the
    // cache key may be an alias form); EPUB (keepUrls) needs raw bytes the
    // cache doesn't hold, so it always fetches.
    const hits = new Map();
    let toFetch = scan.candidates;
    if (!keepUrls && imgFixCache.size) {
      toFetch = [];
      for (const u of scan.candidates) {
        const entry = imgFixCache.get(imgFixCacheKey(u));
        if (typeof pbpEmbedCacheEntryValid === "function" && pbpEmbedCacheEntryValid(entry)) {
          if (embedBudget.reserve(entry.byteLength)) hits.set(u, { dataUri: entry.dataUri, mime: entry.mime });
          // else: dropped -- stays out of both lists, counts as unembedded in the note
        } else {
          toFetch.push(u);
        }
      }
    }
    // Only the origins we still have to FETCH need host access -- a full cache
    // hit exports with zero prompts and zero network (the bytes are already in
    // page memory; no new origin access happens).
    const neededOrigins = [...new Set(toFetch.map((u) => { try { return new URL(u).origin; } catch (_) { return ""; } }).filter(Boolean))];
    let granted = false;
    if (neededOrigins.length) {
      try { granted = await chrome.permissions.request({ origins: neededOrigins.map(o => o + "/*") }); } catch (_) {}
    }
    const fetched = granted ? await pbpEmbedFetchAll(toFetch, embedLimits, embedBudget) : new Map();
    // Hotlink retry (hotlink round): images that failed the plain extension
    // fetch get ONE more pass behind a tab-scoped Referer session rule --
    // empty-Referer-rejecting CDNs (verified live: cdnfile.sspai.com) refuse
    // the extension page's inherently referrerless requests, so an "embed"
    // export silently shipped without images on such sites. Host permission
    // was already granted above for exactly these origins; the rule rides it
    // (declarativeNetRequestWithHostAccess) and is removed when the run ends.
    // failedUrls comes from toFetch, NOT scan.candidates: cache hits and
    // budget-dropped entries must never reach the retry round (Codex must-fix).
    if (granted && fetched.size < toFetch.length) {
      const failedUrls = toFetch.filter((u) => !fetched.has(u));
      const retried = await pbpImgFixWithReferer(failedUrls, sourceTabUrl || meta.url || "", embedLimits, embedBudget);
      retried.forEach((v, u) => fetched.set(u, v));
    }
    hits.forEach((v, u) => fetched.set(u, v)); // after the retry merge -- hits never look like failures
    const map = {};
    scan.blobs.forEach(u => { map[u] = null; });
    if (!keepUrls) fetched.forEach((v, u) => { map[u] = v.dataUri; });
    const rw = keepUrls
      ? pbpEmbedRewrite(rawMd, map, meta.url || "")
      : pbpEmbedRewrite(rawMd, map, meta.url || "", pbpEmbedBudget(PBP_EMBED_LIMITS.outputBytes));
    // Codex-P6: a blob URL replaced with alt text is also "not embedded as-is",
    // so it counts toward the notice alongside permission/fetch/budget misses.
    const note = scan.blobs.length + (scan.candidates.length - fetched.size) + scan.kept.length + rw.dropped;
    return { md: rw.md, note, fetched };
  }

  // Fill header
  const previewTitleEl = document.getElementById("preview-title");
  previewTitleEl.textContent = title || t("mdPreviewUntitled");
  previewTitleEl.title = title || t("mdPreviewUntitled");
  const urlEl = document.getElementById("preview-url");
  urlEl.href = url || "#";
  urlEl.textContent = "";
  if (url) {
    urlEl.title = url;
    // Split hostname (bold) from the rest so a long path/query still reads
    // as "example.com/…" once .preview-url's single-line ellipsis clips it.
    // Built via DOM API (textContent/createElement), never innerHTML, since
    // `url` is page-supplied data (sanitize discipline). Non-absolute/
    // unparsable URLs (no scheme, "about:", etc.) fall back to plain text.
    // Locate the parsed hostname in the ORIGINAL `url` string, not `u.href`
    // (the normalized form punycode-encodes IDN hosts and percent-encodes
    // the path) -- so the display keeps the user's original Unicode/encoding.
    // Anything before the match (scheme, userinfo, etc.) is intentionally
    // dropped; `title` already carries the full URL.
    let host = "", rest = "";
    try {
      const u = new URL(url);
      const idx = u.hostname ? url.indexOf(u.hostname) : -1;
      if (idx < 0) throw new Error("hostname not found in raw url");
      host = u.hostname;
      rest = url.slice(idx + u.hostname.length);
    } catch (_) {
      host = "";
    }
    if (host) {
      const hostSpan = document.createElement("span");
      hostSpan.className = "url-host";
      hostSpan.textContent = host;
      urlEl.appendChild(hostSpan);
      urlEl.appendChild(document.createTextNode(rest));
    } else {
      urlEl.textContent = url;
    }
  } else {
    urlEl.removeAttribute("title");
  }

  // X2: bookmarked badge. Fire-and-forget against the same checkBookmarked/
  // statusCache the toolbar icon uses (background.js) — never blocks first
  // paint. Skipped entirely when there's no URL to look up; every failure
  // path (offline/no token/exception) resolves to {bookmarked:false} in the
  // handler, so renderBookmarkBadge's model.show stays false and nothing
  // renders — no console noise, no visible error state.
  if (url && previewAccount) {
    chrome.runtime.sendMessage({ type: "mdPreviewBookmarkInfo", url, account: previewAccount })
      .then((resp) => {
        if (resp?.account === previewAccount) renderBookmarkBadge(resp, url);
      })
      .catch(() => {});
  }

  const tokenEl = document.getElementById("token-count");
  if (source === "jina" && tokens && info.hasApiKey) {
    tokenEl.textContent = t("mdStatTokens", String(tokens));
  } else {
    tokenEl.style.display = "none";
  }
  const curEngine = source === "jina" ? "jina" : "local";
  let switching = false;
  let jinaPermissionMissing = false;

  if (sourceEl) {
    applyAvailability(curEngine);
    sourceEl.querySelectorAll(".src-seg").forEach((seg) => {
      seg.addEventListener("click", async () => {
        const e = seg.getAttribute("data-engine");
        if (switching || e === curEngine || seg.disabled) return;
        switching = true;
        sourceEl.setAttribute("aria-busy", "true");
        sourceEl.querySelectorAll(".src-seg").forEach((s) => { s.disabled = true; });
        if (e === "jina" && jinaPermissionMissing) {
          if (!await pbpRequestJinaHostPermission()) {
            switching = false;
            sourceEl.removeAttribute("aria-busy");
            applyAvailability(curEngine);
            return;
          }
          jinaPermissionMissing = false;
        }
        seg.classList.add("loading");
        setEngineStatus(t("mdEngineExtracting", engineLabel(e)), false);
        let r;
        try {
          r = await chrome.runtime.sendMessage({
            type: "reextractMarkdown",
            tabId: srcTabId, url: srcUrlForSwitch, engine: e, sourceTabUrl,
            account: previewAccount, tags, description, k
          });
        } catch (_) { r = { ok: false, error: "network" }; }
        if (r && r.ok) { location.reload(); return; }
        if (e === "jina" && r && r.error === "host_permission") jinaPermissionMissing = true;
        // failure: keep current content, restore the control
        switching = false;
        sourceEl.removeAttribute("aria-busy");
        seg.classList.remove("loading");
        applyAvailability(curEngine);
        setEngineStatus(friendlyEngineErr(r), true);
        if (e === "local" && r && (r.error === "tab_unavailable" || r.error === "tab_navigated")) {
          const localSeg = sourceEl.querySelector('.src-seg[data-engine="local"]');
          if (localSeg) {
            localSeg.disabled = true;
            localSeg.setAttribute("aria-disabled", "true");
            localSeg.title = t("mdEngineTabGone");
          }
        }
      });
    });
  }
  document.title = `${title || "Markdown"} — ${t("mdStripPreview")}`;

  // Reading stats (header) — computed from canonical Markdown
  let queueReadingStats = null;
  // Recompute the word/CJK/minutes base from the CURRENT canonical markdown and
  // repaint. No-op when the header element is absent. Used by the in-place
  // replacement path; the first render deliberately does NOT call it (see
  // computeStatBase below).
  let refreshReadingStats = () => {};
  const statsEl = document.getElementById("reading-stats");
  if (statsEl) {
    // statBase is the article-derived half of the line ("913 words · ~5 min");
    // the scroll-progress half is appended per repaint. It used to be a const
    // captured from the FIRST markdown, which silently froze the counts for any
    // later article — hence the separate recompute step.
    let statBase = "";
    const computeStatBase = () => {
      const stats = readingStats(getMarkdown());
      const wordLabel = stats.cjkChars > 0
        ? `${t("mdStatWords", stats.words.toLocaleString())} · ${t("mdStatCjk", stats.cjkChars.toLocaleString())}`
        : t("mdStatWords", stats.words.toLocaleString());
      statBase = `${wordLabel} · ${t("mdStatMin", String(stats.minutes))}`;
    };
    // First render computes the base ONLY: the repaint is queued later by
    // renderArticleContent(), after the article DOM exists, so the very first
    // progress measurement isn't taken against an empty document. Callers on
    // the replacement path want both, so refreshReadingStats() below does both.
    computeStatBase();
    let statTick = false;
    const renderStats = () => {
      statTick = false;
      const doc = document.documentElement;
      const pct = readingProgressPercent(window.scrollY, window.innerHeight, doc.scrollHeight);
      statsEl.textContent = `${statBase} · ${t("mdStatsProgress", pct + "%")}`; // args through t(): chrome.i18n consumes $PCT$ before a manual replace could (see imgFixExportNote)
    };
    const queueStats = () => {
      if (statTick) return;
      statTick = true;
      requestAnimationFrame(renderStats);
    };
    queueReadingStats = queueStats;
    refreshReadingStats = () => { computeStatBase(); queueStats(); };
    window.addEventListener("scroll", queueStats, { passive: true });
    window.addEventListener("resize", queueStats);
  }

  // Single render path: canonical Markdown -> marked() -> DOMPurify -> innerHTML.
  // renderMarkdown() is now the lone sanitize point (XSS closed here).
  const renderedView = document.getElementById("rendered-view");

  // ---- Hotlink-guard image fix (hotlink round; Codex-adjudicated design).
  // Some CDNs reject EMPTY-Referer image requests (verified live on
  // cdnfile.sspai.com; the opposite variant -- foreign referers blocked,
  // empty allowed -- is what the preview's referrerpolicy=no-referrer
  // correctly serves). An extension page can only send an empty Referer, so
  // on such sites every image 403s. Recovery: capture-phase error listener
  // (error doesn't bubble; attached BEFORE innerHTML so no error task can
  // predate it) collects failed https URLs -> count-gated note with a Fix
  // button -> the CLICK requests precise origins (first await in the gesture
  // chain, same contract as resolveEmbed) -> pbpImgFixWithReferer (md-embed:
  // tab-scoped DNR session rule sets Referer to the ARTICLE's origin, then
  // the ordinary budgeted extension fetch) -> data-URI swap in the DOM only
  // (canonical markdown and storage untouched). Origins the user already
  // granted skip the button: contains()-gated auto-fix, per the CLAUDE.md
  // rule that automatic paths may only ever CHECK permissions. A session
  // url->dataUri cache makes re-renders (raw toggle, translation) swap
  // instantly without refetching; one attempt per URL, so 404s/decode
  // failures can't loop.
  // canonical absUrl -> { dataUri, mime, byteLength, decoded } (session-lived).
  // Keys go through pbpEmbedCanonicalUrl so the export path (markdown-form
  // URLs) can hit entries written from browser-form img.currentSrc (A4).
  // byteLength is the raw fetch size (NOT the ~4/3x data URI string length) so
  // resolveEmbed can charge reuse against its 25 MiB budget; decoded flips
  // true only after a real <img> proves the data URI renders.
  const imgFixCache = new Map();
  const imgFixCacheKey = (u) => (typeof pbpEmbedCanonicalUrl === "function" ? pbpEmbedCanonicalUrl(u) : u);
  const imgFixFailed = new Map();   // absUrl -> Set<img>: QUEUED, not yet sent
  const imgFixInFlight = new Map(); // absUrl -> Set<img>: sent, awaiting the fetch
  const imgFixTried = new Set();    // SETTLED (fixed, or given up on): never re-queued
  const imgFixObserved = new Set(); // every https URL SEEN failing here, any cause (404/network/hotlink) — the export honesty note reads this; never pruned (a URL that failed once stays a risk signal for this document)
  const imgFixOriginsSeen = new Set(); // origins this page has already fixed against (maxOrigins cap)
  // ONE page-level budget across every batch (Codex acceptance MEDIUM-2): a
  // per-batch budget let a long lazy-loading article punch through totalBytes
  // once per scroll batch. maxImages caps how many images a single page may
  // pull this way; both mirror the export path's ceilings.
  const imgFixBudget = pbpEmbedBudget(PBP_EMBED_LIMITS.totalBytes);
  let imgFixAttempted = 0; // URLs actually sent to a fix run (ceiling accounting)
  let imgFixFixed = 0;     // data URIs actually swapped in (what the note reports)
  let imgFixStranded = 0;  // over-ceiling URLs this page will never attempt
  let imgFixTimer = null;
  let imgFixRunning = false;
  let imgFixRerun = false; // a batch arrived DURING a run -> re-arm after it (never drop it)

  // Per-URL admission against the page ceilings. NOT a global "capped" latch:
  // one over-budget origin used to freeze the whole page, so a later lazy image
  // from an origin that was already granted and counted got dropped too
  // (confirm-review 3 MEDIUM). Rejected URLs are settled on the spot -- they
  // never enter the queue, so the drain loop can't spin on unfixable work.
  // imgFixAttempted already counts every in-flight URL (it is incremented when a
  // batch is SENT), so only the still-QUEUED ones may be added here -- summing
  // it with a queue that still held the in-flight URLs double-counted the live
  // batch and could park the page at the ceiling with 30 images actually fixed
  // (Codex confirm-review 4). imgFixFailed now holds queued URLs only; in-flight
  // ones live in imgFixInFlight.
  function imgFixAdmits(url) {
    if (imgFixAttempted + imgFixFailed.size >= PBP_EMBED_LIMITS.maxImages) return false;
    let o = "";
    try { o = new URL(url).origin; } catch (_) { return false; }
    if (imgFixOriginsSeen.has(o)) return true;
    const pending = new Set();
    for (const u of imgFixFailed.keys()) { try { pending.add(new URL(u).origin); } catch (_) {} }
    pending.add(o);
    const fresh = [...pending].filter((x) => !imgFixOriginsSeen.has(x)).length;
    return imgFixOriginsSeen.size + fresh <= PBP_EMBED_LIMITS.maxOrigins;
  }
  const imgFixNote = document.getElementById("img-fix-note");
  const imgFixSourceOrigin = (() => {
    try {
      const p = new URL(sourceTabUrl || baseUrl);
      return (p.protocol === "https:" || p.protocol === "http:") ? p.origin : "";
    } catch (_) { return ""; }
  })();
  function imgFixApply(img, entry, url) {
    img.dataset.pbpImgFixed = "1";
    // Responsive attrs would let the browser re-pick a broken remote candidate
    // over the fixed src (Codex review) -- the data URI is the whole image now.
    img.removeAttribute("srcset");
    img.removeAttribute("sizes");
    img.classList.remove("pbp-img-broken");
    // decoded=true only once a real <img> proves the data URI renders (A4):
    // ANY node succeeding is proof for the shared entry -- same data URI. The
    // export path refuses undecoded entries, so a just-fixed image whose load
    // hasn't fired yet simply refetches (safe, conservative). Listener sits
    // BEFORE the src assignment: data URIs can decode synchronously.
    img.addEventListener("load", () => { entry.decoded = true; }, { once: true });
    // "Fetched" is not "renders": the fetch layer only checks HTTP status and
    // MIME, so a truncated/corrupt payload would count as fixed while the image
    // stays blank -- and its error would then be swallowed by the pbpImgFixed
    // guard in the listener below (Codex confirm-review LOW). If the data URI
    // fails to decode, undo the claim: the image goes back to broken, the URL
    // is settled (no refetch loop), the bad data URI leaves the cache, and the
    // success count gives the point back.
    img.addEventListener("error", () => {
      delete img.dataset.pbpImgFixed;
      img.classList.add("pbp-img-broken");
      if (url) { imgFixCache.delete(imgFixCacheKey(url)); imgFixTried.add(url); }
      imgFixFixed = Math.max(0, imgFixFixed - 1);
      const b = imgFixBlockOf(img);
      if (b) imgFixRowFor(b, img); // reappears, as "still unavailable"
      imgFixNoteSettle();
    }, { once: true });
    img.src = entry.dataUri;
  }

  // Anything the page re-renders under us (translation filling/clearing the
  // .pb-tr layer, a retry rebuilding a block, the raw/rendered toggle) can
  // DISCONNECT <img> nodes this machinery still tracks. Without a prune, the
  // rows would point at nothing AND the queue would still carry those URLs --
  // so a click would request permission, spend budget and fetch images that no
  // longer exist on the page (Codex confirm-review MEDIUM). A debounced
  // observer covers every such path, not just the three in md-translate.
  function imgFixPrune() {
    imgFixFailed.forEach((set, u) => {
      set.forEach((img) => { if (!img.isConnected) set.delete(img); });
      if (!set.size) imgFixFailed.delete(u); // not "tried": if it comes back, it may be fixable
    });
    imgFixInFlight.forEach((set) => {
      set.forEach((img) => { if (!img.isConnected) set.delete(img); });
      // The entry itself stays: its fetch is already out, and a node re-added
      // during the flight still gets the result.
    });
    imgFixRowsSync();
    imgFixNoteRender();
  }
  let imgFixPruneTimer = null;
  if (typeof MutationObserver === "function") {
    new MutationObserver(() => {
      clearTimeout(imgFixPruneTimer);
      imgFixPruneTimer = setTimeout(imgFixPrune, 200);
    }).observe(renderedView, { childList: true, subtree: true });
  }

  // ---- In-place fix rows (design round, Codex-adjudicated).
  // The affordance lives NEXT TO the broken image, not in a bar: a sticky bar
  // covered the very text it floated over, and a bar pinned to the article head
  // was already off-screen by the time lazy images failed -- which is exactly
  // how this shipped broken ("images still don't show", while the notice sat
  // above the viewport, dutifully counting). One row per LOGICAL BLOCK, never
  // per <img>:
  //   - the row is a sibling AFTER the block, never inside it, so its button
  //     text can never leak into the block's textContent -> AI context, block
  //     fingerprints, translation input, Turndown markdown;
  //   - a <div> child of #rendered-view is a CONTAINER, not a block, for
  //     pbpAiIndexBlocks (md-ai-core.js:14/19: only P/H1-6/UL/OL/BLOCKQUOTE/
  //     TABLE/PRE count), and this one holds no block tags -- so block numbering
  //     is untouched;
  //   - translation inserts .pb-tr/.pb-tr-err with afterend(block), i.e. BEFORE
  //     this row, and every sibling check there is classList-guarded -- so the
  //     row is inert to that machinery and always ends up last in the group;
  //   - N broken images in one paragraph -> ONE row, ONE tab stop.
  // Copy is deliberately not "blocked by the site": the error listener sees any
  // https image failure (404, network, decode), not a diagnosed hotlink block.
  // block -> { row, msg, btn, imgs:Set<img> }. The row owns the exact <img>
  // nodes it speaks for: inferring them from the DOM ("does this block still
  // contain a broken image?") was wrong twice -- a TRANSLATED image lives in
  // the block's .pb-tr sibling, not inside the block, and a top-level <img>
  // fallback makes block === img, which querySelector never matches (Codex
  // acceptance). State is derived from this set, never re-scanned.
  const imgFixRows = new Map();
  function imgFixBlockOf(img) {
    // A .pb-tr (translated) block maps back to its ORIGINAL block, so the row
    // never lands inside the translation layer.
    const tr = img.closest(".pb-tr");
    if (tr) {
      const n = Number(tr.dataset.pbTr);
      const orig = n && typeof pbpAiBlockEl === "function" ? pbpAiBlockEl(n) : null;
      if (orig) return orig;
    }
    const block = img.closest("[data-pb]");
    if (block) return block;
    // Unindexed (raw <img> straight under #rendered-view): anchor on the image's
    // own top-level ancestor so the row still lands next to it.
    let el = img;
    while (el.parentElement && el.parentElement !== renderedView) el = el.parentElement;
    return el.parentElement === renderedView ? el : null;
  }
  function imgFixRowFor(block, img) {
    let e = imgFixRows.get(block);
    if (!e || !e.row.isConnected) {
      const row = document.createElement("div");
      row.className = "pbp-img-fix-ui";
      const msg = document.createElement("span");
      msg.className = "pbp-img-fix-msg";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "pbp-img-fix-btn";
      btn.textContent = t("mdImgFixBtn");
      row.append(msg, btn);
      // After the block AND after any translation companions it already has --
      // inserting between a block and its .pb-tr would break the sibling contract
      // md-translate relies on (md-translate.js:1275-1283).
      let anchor = block;
      for (let s = anchor.nextElementSibling; s; s = s.nextElementSibling) {
        if (!s.classList || !(s.classList.contains("pb-tr") || s.classList.contains("pb-tr-err"))) break;
        anchor = s;
      }
      anchor.insertAdjacentElement("afterend", row);
      e = { row, msg, btn, imgs: new Set() };
      imgFixRows.set(block, e);
    }
    if (img) e.imgs.add(img);
    imgFixRowState(block, e);
    return e;
  }
  // Move focus off a node that is about to vanish, WITHOUT leaving a permanent
  // tabindex behind and without aiming at a display:none target (tr-only hides
  // the original block, and focus() on it silently no-ops -> focus falls to
  // <body>). Pick the nearest VISIBLE sibling of the row, make it focusable for
  // exactly as long as it holds focus, then clean the attribute up.
  function imgFixMoveFocusOut(row) {
    if (!row.contains(document.activeElement)) return;
    let target = null;
    for (let s = row.previousElementSibling; s; s = s.previousElementSibling) {
      if (s.offsetParent !== null || s === renderedView) { target = s; break; }
    }
    target = target || renderedView;
    const borrowed = !target.hasAttribute("tabindex");
    if (borrowed) target.setAttribute("tabindex", "-1");
    try { target.focus({ preventScroll: true }); } catch (_) {}
    if (borrowed) {
      target.addEventListener("blur", () => target.removeAttribute("tabindex"), { once: true });
    }
  }
  // The row's state is a pure function of the <img> nodes it owns:
  //   any still queued/in-flight -> offer the action (disabled while running)
  //   all settled but still broken -> say so, drop the button (no dead click)
  //   none broken any more -> the row is done
  function imgFixRowState(block, e) {
    e.imgs.forEach((img) => {
      if (!img.isConnected || !img.classList.contains("pbp-img-broken")) e.imgs.delete(img);
    });
    if (!e.imgs.size) {
      imgFixMoveFocusOut(e.row);
      e.row.remove();
      imgFixRows.delete(block);
      return;
    }
    const actionable = [...e.imgs].some((img) => {
      const u = img.currentSrc || img.src || "";
      return imgFixFailed.has(u) || imgFixInFlight.has(u);
    });
    e.msg.textContent = actionable ? t("mdImgFixFailed") : t("mdImgFixUnfixable");
    if (!actionable && e.btn.contains(document.activeElement)) imgFixMoveFocusOut(e.row);
    e.btn.hidden = !actionable;           // never a button that would fire an empty batch
    // aria-disabled, NOT the disabled property: disabling the very button the
    // user just activated makes it unfocusable, and the focus falls to <body>
    // mid-run (Chromium, verified). This keeps it focusable and inert, and the
    // delegated handler below refuses to act on it.
    e.btn.setAttribute("aria-disabled", String(imgFixRunning));
  }
  function imgFixRowsSync() {
    [...imgFixRows.entries()].forEach(([block, e]) => imgFixRowState(block, e));
  }
  function imgFixNoteRender() {
    if (!imgFixNote) return; // sr-only live region: announces, never paints
    const n = imgFixFailed.size;
    imgFixNote.textContent = n ? t("mdImgFixNote", String(n)) : "";
  }
  // batch: an explicit, already-permission-checked URL list (the auto path
  // freezes what it verified). Without it the auto run re-read the whole queue
  // AFTER awaiting permissions.contains, so an origin that arrived in between
  // -- one the user never granted -- rode along in an automatic fetch, which
  // the privacy policy says can never happen (Codex confirm-review 4 P1).
  async function imgFixRun(viaGesture, batch) {
    // A batch that lands mid-run must not be dropped: remember it and re-arm
    // once this run drains, instead of returning into a state where nothing
    // re-schedules and the note claims "fixed N/N" while newer images stay
    // broken.
    if (imgFixRunning) { imgFixRerun = true; return; }
    if (!imgFixSourceOrigin) return;
    imgFixPrune(); // never ask permission for, or spend budget on, images the page has since dropped
    let urls = (batch || [...imgFixFailed.keys()]).filter((u) => imgFixFailed.has(u));
    if (!urls.length) return;
    imgFixRunning = true;
    imgFixRowsSync(); // every in-place button goes disabled for the whole run
    let ok = 0;
    try {
      const origins = [...new Set(urls.map((u) => { try { return new URL(u).origin; } catch (_) { return ""; } }).filter(Boolean))];
      if (viaGesture) {
        let granted = false;
        // First await in the direct click chain (same contract as resolveEmbed).
        try { granted = await chrome.permissions.request({ origins: origins.map((o) => o + "/*") }); } catch (_) {}
        if (!granted) return;
      }
      origins.forEach((o) => imgFixOriginsSeen.add(o));
      // Move QUEUED -> IN-FLIGHT. The queue must not keep these (imgFixAdmits
      // would then count them twice against maxImages, since imgFixAttempted
      // already does), and a late-arriving <img> for the same URL has to be
      // able to join the live set rather than be turned away as "settled"
      // (Codex confirm-review 4, both P2s). imgFixTried is only stamped when
      // the run SETTLES the URL, below -- never at dispatch.
      urls.forEach((u) => {
        const set = imgFixFailed.get(u) || new Set();
        const live = imgFixInFlight.get(u);
        if (live) set.forEach((img) => live.add(img));
        else imgFixInFlight.set(u, set);
        imgFixFailed.delete(u);
      });
      imgFixAttempted += urls.length;
      const fetched = await pbpImgFixWithReferer(urls, imgFixSourceOrigin, PBP_EMBED_LIMITS, imgFixBudget);
      urls.forEach((u) => {
        const v = fetched.get(u);
        const set = imgFixInFlight.get(u) || new Set(); // may have grown during the fetch
        if (v && v.dataUri) {
          ok++;
          // byteLength = raw fetch size off v.bytes (kept only as a number --
          // holding the buffer would double peak memory for nothing);
          // decoded flips in imgFixApply's load listener (A4).
          const entry = { dataUri: v.dataUri, mime: v.mime, byteLength: v.bytes ? v.bytes.byteLength : NaN, decoded: false };
          imgFixCache.set(imgFixCacheKey(u), entry);
          set.forEach((img) => imgFixApply(img, entry, u));
        }
        imgFixInFlight.delete(u);
        imgFixTried.add(u); // settled either way: fixed, or given up on
      });
      imgFixFixed += ok;
    } finally {
      imgFixRunning = false;
      imgFixRowsSync();
      if (imgFixRerun || imgFixFailed.size) {
        // New arrivals (errors that landed mid-run): drain them in a follow-up
        // pass rather than stranding them. Over-cap items are never left in the
        // queue (settled above), so this cannot spin against unfixable work.
        imgFixRerun = false;
        clearTimeout(imgFixTimer);
        imgFixTimer = setTimeout(imgFixAutoCheck, 300);
      } else if (urls.length || imgFixStranded) {
        imgFixNoteSettle();
      }
    }
  }

  // Final aggregate ANNOUNCEMENT (sr-only). Counts are real outcomes:
  // imgFixFixed counts data URIs actually swapped in, never attempts. The unit
  // is distinct image URLs, not <img> nodes (the same URL can appear twice).
  function imgFixNoteSettle() {
    if (!imgFixNote) return;
    const total = imgFixAttempted + imgFixStranded;
    imgFixNote.textContent = (!total || imgFixFixed === total)
      ? "" : t("mdImgFixPartial", String(imgFixFixed), String(total));
  }
  async function imgFixAutoCheck() {
    imgFixPrune(); // renders the note too
    if (!imgFixSourceOrigin || !imgFixFailed.size) return;
    // FREEZE the batch before the first await: whatever lands in the queue while
    // permissions.contains resolves has NOT been checked, and must not ride
    // along in an automatic (no-prompt) fetch (Codex confirm-review 4 P1). It
    // stays queued and gets its own pass -- behind the button if its origin is
    // ungranted.
    const batch = [...imgFixFailed.keys()];
    const origins = [...new Set(batch.map((u) => { try { return new URL(u).origin; } catch (_) { return ""; } }).filter(Boolean))];
    if (!origins.length) return;
    for (const o of origins) {
      const has = await chrome.permissions.contains({ origins: [o + "/*"] }).catch(() => false);
      if (!has) return; // any ungranted origin -> stay behind the button (never auto-request)
    }
    imgFixRun(false, batch);
  }
  // One delegated handler for every in-place button (they come and go with the
  // rows). Any of them fixes the WHOLE page -- one permission prompt, not one
  // per image -- so the label says so ("try to fix this page's images").
  // The click freezes its batch: chrome.permissions.request must ask for
  // exactly the origins the user is being shown, and the grant it returns must
  // not be stretched to cover an origin that arrived while the prompt was open.
  renderedView.addEventListener("click", (e) => {
    const btn = e.target.closest && e.target.closest(".pbp-img-fix-btn");
    if (!btn || btn.getAttribute("aria-disabled") === "true") return;
    imgFixRun(true, [...imgFixFailed.keys()]);
  });
  renderedView.addEventListener("error", (e) => {
    const img = e.target;
    if (!img || img.tagName !== "IMG" || img.dataset.pbpImgFixed) return;
    const u = img.currentSrc || img.src || "";
    if (!/^https:\/\//i.test(u)) return; // data:/blob:/http: not fixable through this channel
    imgFixObserved.add(u); // export honesty note: this link is now KNOWN to fail at least here
    img.classList.add("pbp-img-broken");
    const cached = imgFixCache.get(imgFixCacheKey(u));
    if (cached) { imgFixApply(img, cached, u); return; }
    // The row is created only AFTER the queue decision below, and always via
    // imgFixRowFor(block, img) so it OWNS this node. Creating it up-front left a
    // button that fired an empty batch for a URL that was never queued (already
    // settled, or over the page ceiling) -- Codex acceptance.
    const block = imgFixBlockOf(img);
    const row = (b) => { if (b) imgFixRowFor(b, img); };
    // A fetch for this exact URL is already out: join its set so the result is
    // applied to THIS node too. Checking imgFixTried first would have turned a
    // second lazy <img> of the same image away for good (Codex confirm-review 4).
    const live = imgFixInFlight.get(u);
    if (live) { live.add(img); row(block); return; }
    if (imgFixTried.has(u)) { row(block); return; } // settled and still broken -> row says so, no button
    let set = imgFixFailed.get(u);
    if (!set) {
      // Per-URL ceiling check AT ENTRY: an image over the page's limits is
      // settled here and never queued, so the drain loop only ever sees work it
      // can actually do.
      if (!imgFixAdmits(u)) {
        imgFixTried.add(u);
        imgFixStranded++;
        imgFixNoteSettle();
        row(block); // honest: the image failed, and this page will not retry it
        return;
      }
      set = new Set();
      imgFixFailed.set(u, set);
    }
    set.add(img);
    row(block);
    clearTimeout(imgFixTimer);
    imgFixTimer = setTimeout(imgFixAutoCheck, 400);
  }, true);

  // ---- The article render, as ONE re-callable step ----------------------
  // Markdown -> renderMarkdown() (still the lone sanitize point; this function
  // adds no second HTML-producing path) -> lazy-img attrs -> innerHTML ->
  // forum marking -> lang/dir -> stats repaint -> post-paint enhancers, in
  // exactly that order. Extracted verbatim from the inline first-render block
  // so an in-place replacement can re-run the identical sequence instead of
  // reloading the page; the first render below is its only caller today.
  //
  // Everything it touches is scoped to #rendered-view's CHILDREN — the element
  // itself is never replaced, which is what lets the one-time ResizeObserver,
  // the image-error capture listener installed above, and the TOC click
  // delegate all survive a re-render.
  function renderArticleContent(markdown) {
    // Captured once per render; the deferred enhancers below compare against
    // the live counter so a slow lazy-load can't paint into a newer article.
    const rev = _articleRevision;
    let renderedHtml = renderMarkdown(markdown);
    // Lazy-load images / async decode (sanitizer keeps these attributes).
    renderedHtml = renderedHtml.replace(/<img(?=\s)/gi, '<img loading="lazy" decoding="async"');
    renderedView.innerHTML = renderedHtml;
    // Forum pages + any page with a nested blockquote: split into per-comment blocks
    // BEFORE the AI layer indexes (pbp:rendered). Structural detection (blockquote blockquote)
    // means Reddit and similar pages benefit without a per-site rule. Single-level quotes
    // are untouched. canonicalMarkdown (export/Copy/Raw) is unaffected — DOM-only.
    if (typeof pbpForumShouldMark === "function" && pbpForumShouldMark(info, renderedView) && typeof pbpForumMarkComments === "function") pbpForumMarkComments(renderedView);
    // Clear BEFORE detecting: on the first render #rendered-view is fresh DOM
    // and both removals are no-ops, but a re-render inherits the previous
    // article's attributes — an Arabic article followed by an English one would
    // otherwise keep dir="rtl" (and its lang) forever, since the detection
    // branches below only ever SET. Detection must therefore be idempotent.
    renderedView.removeAttribute("lang");
    renderedView.removeAttribute("dir");
    const articleLang = detectArticleLang(markdown);
    if (articleLang) renderedView.lang = articleLang; // article-script font for the reading content
    // D9-3: RTL article -> container-level dir so blockquote/list/TOC physical
    // direction CSS mirrors along with the text.
    if (articleLang === "ar" || articleLang === "he") renderedView.dir = "rtl";
    // First measurement runs in rAF, after article injection/layout. The
    // ResizeObserver that keeps it fresh is installed ONCE at the call site
    // below — it observes #rendered-view, which this function never replaces.
    if (queueReadingStats) queueReadingStats();
    // Syntax highlighting is OFF the critical first-paint path: the article paints
    // immediately, then — only if it actually contains code — highlight.js is lazy-loaded
    // and applied after paint (rAF). Avoids blocking the page on a 122KB compile + a
    // synchronous whole-document highlight pass (the cold-load spinner).
    if (renderedView.querySelector("pre > code")) {
      requestAnimationFrame(() => {
        if (rev !== _articleRevision) return;
        ensureHljs().then(() => { if (rev === _articleRevision) highlightCodeBlocksChunked(renderedView); });
      });
    }
    // Mermaid fences render locally into data-URI figures — lazy (module only
    // loads its 3.4MB vendor when a fence exists) and off the first paint.
    if (typeof pbpMermaidEnhance === "function" && renderedView.querySelector("pre > code.language-mermaid")) {
      requestAnimationFrame(() => {
        if (rev !== _articleRevision) return;
        pbpMermaidEnhance(renderedView).catch(() => {});
      });
    }
    // Math rendering — ONLY for LaTeX-bearing content (info.math, e.g. arXiv). Gating on
    // the flag (not just a "$") keeps KaTeX off every other page so currency like "$5"
    // is never mangled. Off the first-paint path (rAF), degrades to $...$ source on error.
    if (info.math && /\$/.test(renderedView.textContent)) {
      requestAnimationFrame(() => {
        if (rev !== _articleRevision) return;
        return ensureKatex().then(() => {
          if (rev !== _articleRevision) return;
          if (typeof renderMathInElement === "function") {
            try {
              renderMathInElement(renderedView, {
                delimiters: [{ left: "$$", right: "$$", display: true }, { left: "$", right: "$", display: false }],
                throwOnError: false
              });
            } catch (_) { /* leave $...$ source visible on failure */ }
          }
        });
      });
    }
  }

  renderArticleContent(canonicalMarkdown);
  // One observer for the life of the page: #rendered-view is a stable element
  // (renderArticleContent only swaps its children), so re-installing this per
  // render would stack duplicate observers on the same target for nothing.
  if (queueReadingStats && typeof ResizeObserver === "function") new ResizeObserver(queueReadingStats).observe(renderedView);
  // pbpDeferredScriptsReady is already awaited by the video bootstrap above,
  // so md-video.js -- the LAST defer script -- has run; the typeof guard only
  // covers it failing to load at all.
  if (typeof pbpVideoInit === "function") pbpVideoInit({ pageUrl: sourceTabUrl || url, title: title, tabId: srcTabId });
  else console.warn("[pbp-video] mount unavailable: pbpVideoInit missing after deferred scripts");

  // ---- Build TOC sidebar from the canonical markdown ----
  const tocNav = document.getElementById("toc");
  const tocList = document.getElementById("toc-list");
  // Rail accordion (spec 2026-07-04): installed ONCE here, regardless of
  // whether headings exist below -- #toc's own [hidden] gate (owned by
  // rebuildToc) stays the orthogonal "does a TOC exist at all" control; this is
  // "is its content collapsed" and coexists with it. Keeping it outside
  // rebuildToc is what lets the collapsed/expanded state survive a rebuild.
  pbpRailCollapsible(tocNav, "toc", { label: tocNav.querySelector(".rail-label"), defaultCollapsed: false });
  const expSec = document.getElementById("export-section");
  if (expSec) pbpRailCollapsible(expSec, "export", { label: expSec.querySelector(".rail-label"), defaultCollapsed: true });
  // ONE delegated click handler for the whole TOC, bound to the container that
  // outlives every rebuild. It used to be an anonymous listener added inside
  // the "has headings" branch, i.e. per build — harmless while there was only
  // ever one build, but a second one would have stacked a duplicate handler
  // (and every jump would fire twice). Delegation also means rebuildToc() can
  // freely discard and recreate the <a> elements it targets.
  //
  // tr-only view hides the ORIGINAL heading and shows its .pb-tr translation
  // sibling instead (see trOnlyScrollTarget) — the anchor's native #slug jump
  // targets the (display:none) original, which never scrolls (0-size rect).
  // Intercept and redirect to the visible sibling; the id stays owned by the
  // original heading (untouched invariant), only the SCROLL target changes.
  tocList.addEventListener("click", (e) => {
    const a = e.target.closest("a[data-slug]");
    if (!a) return;
    const headEl = renderedView.querySelector("#" + cssEscape(a.dataset.slug));
    if (!headEl) return;
    const target = trOnlyScrollTarget(headEl);
    pbpFocusArticleTarget(target);
    if (target !== headEl) {
      e.preventDefault();
      pbpScrollIntoView(target, { behavior: "smooth", block: "start" });
    }
  });

  // Rebuild the sidebar from whatever is currently in #rendered-view. Safe to
  // call repeatedly: it clears the list, re-hides #toc when the new article has
  // no headings (the old build could only ever REVEAL it, so a headingless
  // replacement would have left an empty TOC on screen), and swaps the
  // scroll-spy rather than stacking a second observer over the first.
  function rebuildToc() {
    // Walk the already-rendered (and sanitized) headings so each TOC anchor
    // equals a real element id (buildToc's markdown-derived slugs can diverge from
    // marked's rendered ids for headings with inline links/images or duplicates).
    const headings = Array.from(renderedView.querySelectorAll("h2[id], h3[id], h4[id]"))
      .map((el) => ({ level: +el.tagName[1], text: el.textContent, slug: el.id }))
      .filter((h) => h.slug);

    // Tear the old spy down BEFORE the links it holds leave the DOM, so its
    // IntersectionObserver and scroll listener never outlive their targets.
    if (_scrollSpyDispose) { _scrollSpyDispose(); _scrollSpyDispose = null; }
    tocList.replaceChildren();
    if (!headings.length) {
      tocNav.hidden = true; // #toc ships hidden, so this is a no-op on first render
      return;
    }
    const frag = document.createDocumentFragment();
    headings.forEach((h) => {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = "#" + h.slug;
      a.textContent = h.text;
      a.title = h.text; // full heading text -- CSS ellipsis-truncates the visible line (~:13px density), title recovers it
      a.dataset.level = String(h.level);
      a.dataset.slug = h.slug;
      li.appendChild(a);
      frag.appendChild(li);
    });
    tocList.appendChild(frag);
    tocNav.hidden = false;
    _scrollSpyDispose = setupScrollSpy(renderedView, tocList);
  }
  rebuildToc();
  setupDrawer();

  // Notify the md-ai layer (md-ai-core / md-translate / md-ask) that the
  // article DOM is final. Fires even when the TOC is absent. detail.url is
  // the cache-key source for tr_/ask_/trview_ entries (md_preview_data is
  // already removed from storage at this point; the page holds the markdown
  // in closure and md-ai reads text via the DOM blocks).
  // detail.forum: md-skim switches to the discussion-thread prompt variant on
  // it. Reuse the SAME determination the comment-marking pass above used —
  // pbpForumShouldMark covers the site-rule flag AND structural detection
  // (nested blockquotes: Reddit-likes with no per-site rule), so the prompt
  // variant and the comment styling always agree.
  const _isForumPage = (typeof pbpForumShouldMark === "function")
    ? !!pbpForumShouldMark(info, renderedView) : !!info.forum;
  await pbpDeferredScriptsReady;
  document.dispatchEvent(new CustomEvent("pbp:rendered", { detail: { url, title, forum: _isForumPage, account: previewAccount } }));

  // Raw view populated lazily on first switch

  // View toggle
  const btnRaw = document.getElementById("btn-raw");
  const btnRendered = document.getElementById("btn-rendered");
  const rawView = document.getElementById("raw-view");
  // Has the raw <pre> ever been filled? The fill used to be guarded on
  // `!rawView.textContent`, which is the same test as this flag for a first
  // fill (canonical markdown is non-empty — the blank case returned long ago)
  // but says nothing about staleness afterwards: once populated, the old guard
  // could never refresh it, so a canonical change would silently leave the raw
  // view showing the previous article. The flag separates "not filled yet"
  // (lazy fill, below) from "filled and therefore must be kept in sync"
  // (syncRawView).
  let _rawFilled = false;
  // Push the current canonical markdown into the raw view — but only if the
  // user has ever opened it. Deliberately does NOT switch views or fill it
  // early: an untouched raw view stays lazy and gets the fresh text on its
  // first activation anyway. Nothing changes canonical markdown today, so this
  // is unreachable on the first-render path.
  function syncRawView() {
    if (!_rawFilled) return;
    rawView.textContent = getMarkdown();
  }

  // Reading-position mapping across the switch: Raw (13px <pre>) and Rendered
  // (clamp 17-22px article typography) are the same content at very different
  // heights, so keeping window.scrollY strands the reader. Map by content-block
  // index instead (approximate is fine): find the topmost visible block in the
  // view being LEFT, convert to a fraction of total blocks, land on the same
  // fraction in the view being ENTERED. Indexed lazily via md-ai-core.js's
  // pbpAiIndexBlocks — translate/ask only index when AI is configured, so this
  // can't assume it already ran.
  function pbpScrollMapBlocks() {
    if (typeof pbpAiBlocks !== "function") return [];
    if (!pbpAiBlocks().length && typeof pbpAiIndexBlocks === "function") pbpAiIndexBlocks(renderedView);
    return pbpAiBlocks();
  }

  btnRaw.addEventListener("click", () => {
    const blocks = pbpScrollMapBlocks();
    let frac = null;
    if (blocks.length && !renderedView.classList.contains("hidden") && !renderedView.hidden) {
      const idx = blocks.findIndex((b) => trOnlyScrollTarget(b.el).getBoundingClientRect().bottom > 0);
      frac = (idx === -1 ? blocks.length - 1 : idx) / blocks.length;
    }
    if (!_rawFilled) { rawView.textContent = getMarkdown(); _rawFilled = true; }
    rawView.classList.remove("hidden");
    renderedView.classList.add("hidden");
    btnRaw.classList.add("active");
    btnRendered.classList.remove("active");
    btnRaw.setAttribute("aria-pressed", "true");
    btnRendered.setAttribute("aria-pressed", "false");
    document.body.classList.add("raw-active");
    if (frac !== null) {
      const top = rawView.getBoundingClientRect().top + window.scrollY;
      window.scrollTo(0, top + frac * rawView.scrollHeight);
    }
  });
  btnRendered.addEventListener("click", () => {
    let frac = null;
    if (!rawView.classList.contains("hidden")) {
      const top = rawView.getBoundingClientRect().top + window.scrollY;
      const h = rawView.scrollHeight || 1; // guard: div-by-zero if not yet laid out
      frac = Math.min(Math.max((window.scrollY - top) / h, 0), 0.999);
    }
    renderedView.classList.remove("hidden");
    rawView.classList.add("hidden");
    btnRendered.classList.add("active");
    btnRaw.classList.remove("active");
    btnRendered.setAttribute("aria-pressed", "true");
    btnRaw.setAttribute("aria-pressed", "false");
    document.body.classList.remove("raw-active");
    if (frac !== null) {
      const blocks = pbpScrollMapBlocks();
      if (blocks.length) {
        const idx = Math.min(Math.floor(frac * blocks.length), blocks.length - 1);
        trOnlyScrollTarget(blocks[idx].el).scrollIntoView({ block: "start" });
      }
    }
  });

  // ---- R9: silent scroll-position restore (spec 2) ----
  // Records where the reader was (block index n + fraction scrolled into
  // that block) so a later reopen of the SAME article (exact tab.url string
  // match, same limitation tr_/ask_ caches already accept) lands back there
  // with zero UI. Storage: the generic IDB KV in ai-cache.js, keyed
  // "scroll_" + pbpAiHash(url) -- pbpAiHash/pbpAiBlockEl are defined in
  // md-ai-core.js, which loads AFTER this file (script tag order), hence the
  // typeof guards; pbpAiCacheGet/Set/Delete are in ai-cache.js, which loads
  // BEFORE this file, so those are called ungated (same as md-ai-core.js
  // itself does).
  let _pbpScrollSaveTimer = null;
  // Timestamp (ms, Date.now()) until which the save-side 'scroll' listener
  // below ignores every event entirely (doesn't even arm the debounce).
  // Restore's own scrollIntoView/scrollBy calls fire native 'scroll' events
  // on window exactly like a real user scroll would; without this guard, one
  // of those restore-triggered events can arm the 600ms debounce, which then
  // reads a scrollY that -- because hljs/KaTeX/lazy-image layout can differ
  // slightly between the original save and this reopen -- lands just on the
  // OTHER side of the one-viewport boundary from where it was originally
  // saved, so _pbpReaderSaveScroll silently deletes the very record that was
  // just used to restore. Sole writer: applyRestore() in the rAF block below.
  let _pbpScrollRestoreUntil = 0;

  function _pbpReaderSaveScroll() {
    if (renderedView.classList.contains("hidden") || renderedView.hidden) return; // raw or timeline view active: rects would read 0x0
    if (typeof pbpAiHash !== "function") return;
    const key = "scroll_" + pbpAiHash(url);
    if (window.scrollY <= window.innerHeight) {
      // Back inside the first screen: nothing worth restoring, and any
      // earlier deeper-scroll record is now stale -- drop it.
      pbpAiCacheDelete(key).catch(() => {});
      return;
    }
    const blocks = pbpScrollMapBlocks(); // force-index if empty, same defensive call the Raw/Rendered toggle above already makes
    if (!blocks.length) return;
    const rects = blocks.map((b) => trOnlyScrollTarget(b.el).getBoundingClientRect());
    const anchor = typeof pbpReaderPickScrollAnchor === "function" ? pbpReaderPickScrollAnchor(rects) : null;
    if (!anchor) return;
    const ts = Date.now();
    pbpAiCacheSet(key, { n: anchor.n, frac: anchor.frac, ts }, ts).catch(() => {});
  }

  window.addEventListener("scroll", () => {
    if (Date.now() < _pbpScrollRestoreUntil) return; // ignore our own restore's programmatic scroll -- see _pbpScrollRestoreUntil above
    clearTimeout(_pbpScrollSaveTimer);
    _pbpScrollSaveTimer = setTimeout(_pbpReaderSaveScroll, 600);
  }, { passive: true });
  // Best-effort extra flush: pagehide can race an in-flight IDB write (no
  // working precedent anywhere in this codebase for a reliable async write
  // from pagehide -- md-ask.js/md-translate.js's own pagehide handlers only
  // do synchronous ctrl.abort()), so this is a bonus on top of the debounce
  // above, not the primary save path.
  window.addEventListener("pagehide", () => {
    clearTimeout(_pbpScrollSaveTimer);
    _pbpReaderSaveScroll();
  });

  // Restore: after render + two animation frames (one layout pass in) --
  // hljs/KaTeX/lazy images may still shift things later, but the block
  // anchor keeps any resulting error inside one block, not the whole page.
  requestAnimationFrame(() => {
    requestAnimationFrame(async () => {
      if (typeof pbpAiHash !== "function") return;
      const key = "scroll_" + pbpAiHash(url);
      let entry;
      try {
        entry = await pbpAiCacheGet(key);
      } catch (_) {
        return;
      }
      const rec = entry && entry.result;
      if (!rec || !Number.isFinite(rec.n) || rec.n < 1) return;
      if (window.scrollY > 200) return; // reader already scrolled on their own -- don't fight them
      const blocks = pbpScrollMapBlocks();
      if (!blocks.length) return;

      // Resolves rec against the CURRENT view (trOnlyScrollTarget reads
      // document.body's tr-only class live each call) and performs the jump.
      // Factored into a function so it can be re-run once below if the view
      // mode flips shortly after this first call -- see the MutationObserver.
      // Returns false (no-op) if the block no longer exists.
      let restoredAtY = null;
      const applyRestore = () => {
        const blockEl = typeof pbpAiBlockEl === "function" ? pbpAiBlockEl(rec.n) : null;
        if (!blockEl) return false;
        const target = trOnlyScrollTarget(blockEl);
        _pbpScrollRestoreUntil = Date.now() + 1000; // suppress the save listener for this programmatic scroll (both calls below fire native 'scroll' events)
        target.scrollIntoView({ block: "start", behavior: "instant" });
        const frac = Math.min(Math.max(Number(rec.frac) || 0, 0), 1);
        if (frac > 0) {
          const h = target.getBoundingClientRect().height;
          if (h > 0) window.scrollBy(0, frac * h);
        }
        restoredAtY = window.scrollY;
        return true;
      };
      if (!applyRestore()) return;

      // Race guard: md-translate.js's pbpTrInit runs its OWN auto view-restore
      // (rAF-chunked st.work build, THEN an IDB cache probe, THEN -- only on a
      // full cache hit with a persisted tr-only/bilingual view -- _pbpTrSetMode,
      // which is what actually flips document.body's tr-only/tr-bilingual
      // classes) fully asynchronously, on a timeline this double-rAF window is
      // too short to observe. trOnlyScrollTarget above only redirects to the
      // .pb-tr sibling when document.body already carries "tr-only" AT THE
      // MOMENT IT'S CALLED -- so if translate's mode flip lands moments after
      // this restore, the reader was just silently placed on the original
      // block that's about to become display:none. Watch body's class
      // attribute for that flip; if it fires while the reader is still
      // sitting exactly where this restore put them (no manual scroll in
      // between), re-resolve trOnlyScrollTarget against the now-current view
      // and land again -- still silent, still block-anchored, only ever fires
      // once. A real scroll away in the meantime means they're reading; back
      // off and leave them alone.
      let resettled = false;
      // Body's class attribute also flips for unrelated reasons during this
      // window (rail-open, ask-open, ...) -- snapshot the two view-mode
      // classes up front so an unrelated mutation doesn't consume the
      // one-shot re-settle before the real tr-only/tr-bilingual flip shows up.
      const hadTrOnly = document.body.classList.contains("tr-only");
      const hadTrBilingual = document.body.classList.contains("tr-bilingual");
      const mo = new MutationObserver(() => {
        if (resettled) return;
        const nowTrOnly = document.body.classList.contains("tr-only");
        const nowTrBilingual = document.body.classList.contains("tr-bilingual");
        if (nowTrOnly === hadTrOnly && nowTrBilingual === hadTrBilingual) return; // not the flip we're waiting for -- keep observing
        if (restoredAtY === null || Math.abs(window.scrollY - restoredAtY) > 4) { resettled = true; mo.disconnect(); return; }
        resettled = true;
        mo.disconnect();
        applyRestore();
      });
      mo.observe(document.body, { attributes: true, attributeFilter: ["class"] });
      // pbpTrInit's cache probe is a one-shot pass near page boot -- 5s is a
      // generous upper bound even for a very long article, so stop watching
      // well after it could plausibly still be running.
      setTimeout(() => mo.disconnect(), 5000);
    });
  });

  // Copy buttons
  document.getElementById("btn-copy-md").addEventListener("click", async (e) => {
    imgFixExportNote(false);
    await copyToClipboard(buildExportMarkdown(), e.currentTarget);
  });
  document.getElementById("btn-copy-html").addEventListener("click", async (e) => {
    // Capture the target BEFORE any await — per DOM spec, currentTarget is nulled
    // once the event dispatch that invoked this listener finishes, and this handler
    // crosses real async boundaries (ensureHljs's script load, loadHljsCss's fetches)
    // before ever touching it. Same fix already applied to btn-copy-md.
    const btn = e.currentTarget;
    imgFixExportNote(false);
    // Same content as the HTML download: a complete styled doc that follows the
    // original/bilingual/translation-only view (getViewMarkdown), copied as
    // text — symmetric with Copy MD == Download MD. (Was renderedView.innerHTML,
    // which always carried every .pb-tr block regardless of the selected view.)
    // Pass RAW view markdown (no YAML frontmatter) — composeStyledHtml renders
    // the frontmatter as a styled <header>, so feeding it the YAML-prefixed
    // buildExportMarkdown() would double it into the body as plain text.
    if (renderedView.querySelector("pre > code")) await ensureHljs(); // so composeStyledHtml highlights
    const hljsCss = await loadHljsCss();
    if (info.math) await ensureKatex(); // so composeStyledHtml renders math (mirrors hljs above)
    const katexCss = info.math ? await loadKatexCss() : "";
    const _copyOpts = buildExportOpts();
    // Copy cannot embed: clamp like buildExportMarkdown above (Codex, plan A).
    if (typeof pbpMermaidWarmExport === "function") await pbpMermaidWarmExport(renderedView);
    const doc = composeStyledHtml(getViewMarkdown(), buildMeta(), { ..._copyOpts, imagePolicy: _copyOpts.imagePolicy === "embed" ? "keep" : _copyOpts.imagePolicy, hljsCss, katexCss });
    await copyToClipboard(doc, btn);
  });

  // Download buttons
  const safeTitle = safeFilename(title);
  document.getElementById("btn-dl-md").addEventListener("click", async () => {
    imgFixExportNote(true); // sync, before the gesture-sensitive await below
    // First await in the direct click chain: resolveEmbed()'s chrome.permissions.request()
    // must run while the user gesture is still active (same invariant as Send-to below).
    const meta = buildMeta(), opts = buildExportOpts();
    const emb = await resolveEmbed(getViewMarkdown(), meta);
    // imagePolicy is clamped to "keep" here -- the data URIs resolveEmbed already
    // substituted have a scheme, so applyImagePolicy's "keep" pass absolutizes
    // any remaining plain src and leaves data: URIs untouched (Codex-P1: one
    // composeExport pass, no double transform of the export markdown).
    const body = composeExport(emb.md, meta, { ...opts, imagePolicy: opts.imagePolicy === "embed" ? "keep" : opts.imagePolicy });
    downloadFile(safeTitle + ".md", body, "text/markdown;charset=utf-8");
    if (emb.note > 0) showExportNote(t("mdEmbedPartial", String(emb.note))); // args through t() -- chrome.i18n consumes $COUNT$ before a manual replace could
  });
  document.getElementById("btn-dl-html").addEventListener("click", async () => {
    imgFixExportNote(true);
    // First await in the direct click chain: resolveEmbed()'s chrome.permissions.request()
    // must run while the user gesture is still active, so it runs before the
    // (also-awaited, but not gesture-sensitive) hljs/katex CSS loads below.
    const meta = buildMeta(), opts = buildExportOpts();
    const emb = await resolveEmbed(getViewMarkdown(), meta);
    if (renderedView.querySelector("pre > code")) await ensureHljs(); // so composeStyledHtml highlights the export
    const hljsCss = await loadHljsCss();
    if (info.math) await ensureKatex(); // so composeStyledHtml renders math (mirrors hljs above)
    const katexCss = info.math ? await loadKatexCss() : "";
    // Follow the original/bilingual/translation-only view like the Markdown export
    // does, but pass RAW view markdown (getViewMarkdown, no YAML frontmatter):
    // composeStyledHtml turns frontmatter into a styled <header>. Passing the
    // YAML-prefixed buildExportMarkdown() rendered the YAML into the body as text.
    if (typeof pbpMermaidWarmExport === "function") await pbpMermaidWarmExport(renderedView);
    const doc = composeStyledHtml(emb.md, meta, { ...opts, imagePolicy: opts.imagePolicy === "embed" ? "keep" : opts.imagePolicy, hljsCss, katexCss });
    downloadFile(safeTitle + ".html", doc, "text/html;charset=utf-8");
    if (emb.note > 0) showExportNote(t("mdEmbedPartial", String(emb.note))); // args through t() -- chrome.i18n consumes $COUNT$ before a manual replace could
  });
  document.getElementById("btn-dl-epub").addEventListener("click", async () => {
    imgFixExportNote(true);
    // First await in the direct click chain: resolveEmbed()'s chrome.permissions.request()
    // must run while the user gesture is still active (same invariant as above).
    // keepUrls:true (Task 6): successfully fetched images stay at their absolute
    // URL in emb.md -- pbpBuildEpub finds them via <img src="abs"> and rewrites
    // to a relative images/ path itself while adding the zip entry (emb.fetched).
    const meta = buildMeta(), opts = buildExportOpts();
    const emb = await resolveEmbed(getViewMarkdown(), meta, { keepUrls: true });
    // Codex F5: EPUB gets its own composeExport call -- frontmatter/inline
    // ==marks== don't belong in content.xhtml (dc:* metadata covers title/
    // author/date/etc, and marked doesn't parse "==...==" so an inline mark
    // would leak as literal text, same reasoning as composeStyledHtml above).
    const md = composeExport(emb.md, meta, {
      ...opts, frontmatter: false, highlightsInline: false,
      imagePolicy: opts.imagePolicy === "embed" ? "keep" : opts.imagePolicy
    });
    // dc:language (spec §3): only meaningful once the reader is actually
    // looking at a translated view; original/auto exports stay "und" (unknown)
    // rather than guessing. md-translate.js loads after this file, hence the
    // typeof guard on window.pbpTrExportTargetLang.
    const inTrView = document.body.classList.contains("tr-only") || document.body.classList.contains("tr-bilingual");
    // Codex-C3: pbpEpubLang canonicalizes to BCP-47 (or "und") -- the translate
    // target can be a free-text label ("Classical Chinese") that isn't a legal tag.
    meta.lang = pbpEpubLang((inTrView && typeof window.pbpTrExportTargetLang === "function" && window.pbpTrExportTargetLang()) || "und");
    if (typeof pbpMermaidWarmExport === "function") await pbpMermaidWarmExport(renderedView);
    downloadFile(safeTitle + ".epub", pbpBuildEpub({ md, meta, images: emb.fetched }), "application/epub+zip");
    if (emb.note > 0) showExportNote(t("mdEmbedPartial", String(emb.note))); // args through t() -- chrome.i18n consumes $COUNT$ before a manual replace could
  });

  let _sendMenuCtl = null;
  async function setupSendMenu() {
    const split = document.getElementById("send-split");
    if (!split || typeof PBP_EXPORT_TARGETS === "undefined") return;

    // Live-update: tear down the previous render's persistent (non-menu-item) listeners
    // so a re-render on a settings change doesn't stack duplicate handlers.
    if (_sendMenuCtl) _sendMenuCtl.abort();
    _sendMenuCtl = new AbortController();
    const _sig = _sendMenuCtl.signal;
    // Re-read the send-related settings fresh so an options change (fixed token,
    // enabled/disabled target, changed vault/folder) is reflected WITHOUT reopening the preview.
    try {
      const _fresh = await pbpReadSettingsWithSecrets({ exportTargets: {}, obsidianEnabled: false, obsidianVault: "", obsidianFolder: "" });
      Object.assign(exportSettings, _fresh);
    } catch (_) {}

    // Resolve enabled targets. Back-compat: if exportTargets is empty but the
    // legacy obsidian* settings exist, synthesize the obsidian row so existing
    // users keep one-click Obsidian before they re-open the options page.
    const et = Object.assign({}, exportSettings.exportTargets || {});
    if (!et.obsidian && (exportSettings.obsidianEnabled || exportSettings.obsidianVault || exportSettings.obsidianFolder)) {
      et.obsidian = {
        enabled: !!exportSettings.obsidianEnabled,
        vault: exportSettings.obsidianVault || "",
        folder: exportSettings.obsidianFolder || ""
      };
    }
    const enabledIds = pbpExportTargetIds().filter((id) => et[id] && et[id].enabled);

    const primary = document.getElementById("send-primary");
    const primaryIc = document.getElementById("send-primary-ic");
    const primaryLabel = document.getElementById("send-primary-label");
    const caret = document.getElementById("send-caret");
    const menu = document.getElementById("send-menu");
    const sendStatus = document.getElementById("send-status");
    let sendStatusTimer;
    function showSendStatus(msg, isError, url, viewLabel) {
      if (!sendStatus) return;
      clearTimeout(sendStatusTimer);
      sendStatus.classList.toggle("error", !!isError);
      sendStatus.hidden = false;          // unhide before setting text so aria-live announces it
      sendStatus.textContent = msg;
      let hasLink = false;
      if (url) {
        // href comes from a network JSON response and lands in a privileged
        // extension page — only allow https: (blocks a javascript:/data: sink).
        let safe = "";
        try { if (new URL(url).protocol === "https:") safe = url; } catch (_) {}
        if (safe) {
          hasLink = true;
          if (msg) sendStatus.appendChild(document.createTextNode(" "));
          const a = document.createElement("a");
          a.href = safe;
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          a.textContent = viewLabel || t("mdSendViewGist");
          // Let the link open without the parent's dismiss-on-click swallowing it.
          a.addEventListener("click", (e) => e.stopPropagation());
          sendStatus.appendChild(a);
        }
      }
      // Plain messages auto-hide; a status carrying the gist link stays until the
      // next send or a manual click-dismiss — so the sole URL isn't lost on a
      // timer (and a focused link isn't yanked out from under the user).
      if (!hasLink) sendStatusTimer = setTimeout(() => { sendStatus.hidden = true; sendStatus.textContent = ""; }, 6000);
    }
    if (sendStatus) sendStatus.addEventListener("click", () => {
      clearTimeout(sendStatusTimer); sendStatus.hidden = true; sendStatus.textContent = "";
    }, { signal: _sig });

    split.classList.remove("send-empty");
    primary.title = "";
    caret.removeAttribute("hidden");
    menu.setAttribute("hidden", "");
    caret.setAttribute("aria-expanded", "false");

    if (!enabledIds.length) {
      split.classList.add("send-empty");
      primaryIc.innerHTML = "";
      primaryLabel.textContent = t("mdSendToEllipsis");
      caret.setAttribute("hidden", "");
      primary.title = t("mdSendNoneConfigured");
      primary.addEventListener("click", () => pbpOpenOptionsTab("markdown"), { signal: _sig });
      return;
    }

    let lastId = await pbpGetLastTarget();
    if (!enabledIds.includes(lastId)) lastId = enabledIds[0];

    function setPrimary(id) {
      const row = PBP_EXPORT_TARGETS[id];
      primary.dataset.targetId = id;
      primaryIc.innerHTML = row.icon;
      primaryLabel.textContent = t("mdSendTo").replace("{name}", row.label);
    }
    setPrimary(lastId);

    let _sending = false;
    async function doSend(id) {
      if (_sending) return;                 // re-entrancy guard: a double-click on a
      _sending = true;                      // slow gist POST must not create two gists
      try {                                 // (the "mdSending" label is the affordance;
        const row = PBP_EXPORT_TARGETS[id]; // not disabling keeps the restored focus, F8)
        setPrimary(id);
        const cfg = et[id] || {};
        // First await in the direct click chain: chrome.permissions.request()
        // must run while the user gesture is still active.
        await pbpRequestTargetPermission(id, cfg);
        await pbpSetLastTarget(id);
        const meta = buildMeta();
        const _exp = buildExportOpts();
        imgFixExportNote(false);
        // Send-to never runs resolveEmbed (no permission-gesture flow here) --
        // "embed" clamps to "keep" so a plain absolute link is sent instead of
        // a dangling literal "embed" policy string reaching applyImagePolicy.
        const _sendBody = composeExport(getViewMarkdown(), meta, { frontmatter: false, imagePolicy: _exp.imagePolicy === "embed" ? "keep" : _exp.imagePolicy, includeToc: _exp.includeToc, highlights: _exp.highlights, hlView: _exp.hlView }); // H5 (spec 1.6): send-to honors the exported view's tri-state too
        primary.classList.add("sending");
        primaryLabel.textContent = t("mdSending");
        let res;
        try {
          res = await pbpSendToTarget(id, { meta, rawBody: _sendBody, cfg });
        } catch (_) {
          res = { ok: false, fellBack: false, error: "" };
        }
        primary.classList.remove("sending");
        setPrimary(id);
        if (res.ok && !res.fellBack) {
          // token-api (gist/webhook) has a real HTTP receipt -- text unchanged.
          // url-scheme (obsidian) has no receipt: the OS may have silently
          // dropped the open, so the claim is scoped to what's verifiably
          // true ("opened" + "copied"), not "sent".
          if (row.mechanism === "url-scheme") {
            flashButtonLabel(primary, t("mdOpenedApp").replace("{name}", row.label));
            showSendStatus(t("mdSentUrlScheme").replace("{name}", row.label), false);
          } else {
            flashButtonLabel(primary, t("mdSentTo").replace("{name}", row.label));        // short -> button
            if (res.url) showSendStatus(t("mdSentTo").replace("{name}", row.label), false, res.url, row.viewLabel ? t(row.viewLabel) : undefined); // + clickable link
          }
        } else if (res.error === "open-blocked") {
          showSendStatus(t("mdSendOpenBlocked"), true);
        } else if (res.ok) {
          showSendStatus(t("mdSendTooLongFellBack").replace("{name}", row.label), false); // long -> roomy block
        } else if (typeof res.error === "string" && res.error.startsWith("missing:")) {
          showSendStatus(t("mdSendNeedsSetup"), false);
        } else if (res.error === "api-perm") {
          showSendStatus(t("mdSendApiPerm"), true);
        } else if (res.error === "api-insecure") {
          showSendStatus(t("mdTargetWebhookHttpWarn"), true);
        } else if (res.error === "api-down") {
          showSendStatus(t("mdSendApiDown"), true);
        } else if (res.error === "api-token") {
          showSendStatus(t("mdSendApiBadToken"), true);
        } else if (res.error === "api-notion-share") {
          showSendStatus(t("mdSendNotionNotShared"), true);
        } else if (res.error === "api-failed") {
          showSendStatus(t("mdSendApiFailed"), true);
        } else {
          showSendStatus(t("mdSendFailed"), true);
        }
      } finally {
        _sending = false;
      }
    }

    primary.addEventListener("click", () => { if (primary.dataset.targetId) doSend(primary.dataset.targetId); }, { signal: _sig });

    function closeMenu() { menu.setAttribute("hidden", ""); caret.setAttribute("aria-expanded", "false"); }
    function openMenu() {
      menu.removeAttribute("hidden");
      caret.setAttribute("aria-expanded", "true");
      const f = menu.querySelector(".send-mi");
      if (f) f.focus();
    }
    caret.addEventListener("click", (e) => { e.stopPropagation(); menu.hasAttribute("hidden") ? openMenu() : closeMenu(); }, { signal: _sig });
    document.addEventListener("click", (e) => { if (!split.contains(e.target)) closeMenu(); }, { signal: _sig });
    // Keyboard-only close: Tab-ing off the last/first menu item has no click event, so
    // without this the menu stays visually open until the next click-outside or Escape
    // (audit D5-3). relatedTarget is reliable for focus()/Tab moves within the same
    // document; it can be null when focus leaves the document entirely, so fall back to
    // an immediate re-check of document.activeElement once the change has settled.
    menu.addEventListener("focusout", (e) => {
      const next = e.relatedTarget;
      if (next !== null && next !== undefined) {
        if (!split.contains(next)) closeMenu();
        return;
      }
      setTimeout(() => { if (!split.contains(document.activeElement)) closeMenu(); }, 0);
    }, { signal: _sig });
    menu.addEventListener("keydown", (e) => {
      const items = [...menu.querySelectorAll(".send-mi")];
      const i = items.indexOf(document.activeElement);
      if (e.key === "Escape") { closeMenu(); caret.focus(); }
      else if (e.key === "ArrowDown") { e.preventDefault(); (items[i + 1] || items[0]).focus(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); (items[i - 1] || items[items.length - 1]).focus(); }
    }, { signal: _sig });

    menu.innerHTML = "";
    const ordered = [lastId].concat(enabledIds.filter((id) => id !== lastId)); // last-used pinned on top
    ordered.forEach((id) => {
      const row = PBP_EXPORT_TARGETS[id];
      const item = document.createElement("button");
      item.type = "button";
      item.className = "send-mi";
      item.setAttribute("role", "menuitem");
      item.dataset.targetId = id;
      const ic = document.createElement("span");
      ic.className = "send-mi-ic"; ic.setAttribute("aria-hidden", "true"); ic.innerHTML = row.icon;
      const lb = document.createElement("span");
      lb.textContent = row.label;
      item.appendChild(ic); item.appendChild(lb);
      if (id === lastId) {
        const tag = document.createElement("span");
        tag.className = "send-mi-tag"; tag.textContent = t("mdSendLastUsed");
        item.appendChild(tag);
      }
      // Restore focus to the primary button before the menu collapses, so a
      // keyboard user isn't dropped to <body> (WCAG 2.4.3).
      item.addEventListener("click", () => { closeMenu(); primary.focus(); doSend(id); });
      menu.appendChild(item);
    });

    const foot = document.createElement("button");
    foot.type = "button"; foot.className = "send-mi send-mi-foot"; foot.setAttribute("role", "menuitem");
    foot.textContent = t("mdManageDestinations");
    foot.addEventListener("click", () => { closeMenu(); pbpOpenOptionsTab("markdown"); });
    menu.appendChild(foot);
  }

  await setupSendMenu();
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.syncApiKeys || changes.exportTargets || changes.obsidianEnabled || changes.obsidianVault || changes.obsidianFolder) {
      setupSendMenu();
    }
  });
})().catch((e) => {
  // Top-level backstop: any unhandled throw in the init flow above (malformed HTML into
  // Turndown, a rejected storage read, marked.parse choking on the extracted markdown,
  // etc.) previously left the page mid-render — title/rail filled in, #rendered-view
  // blank, no error text, no aria-busy cleared. Fall back to the empty state instead of
  // a silent half-rendered page.
  // Deliberately does NOT mount the video panel the way the three in-flow
  // dead ends do: this backstop fires on a genuine thrown fault, and the
  // identifiers it would need (sourceTabUrl/title) live inside the IIFE scope
  // above. A video page that merely extracts to nothing never reaches here.
  console.error("md-preview init failed:", e);
  renderEmptyState(t("mdEngineExtractFailed"));
});

// ---- Copy to clipboard with visual feedback ----
async function copyToClipboard(text, btn) {
  const label = btn.querySelector(".btn-label");
  const setLabel = (s) => { if (label) label.textContent = s; else btn.textContent = s; };
  // Persist the original label ONCE so a re-click within the revert window can't
  // capture "Copied!" as the "original" and freeze the button on success text.
  if (btn._copyOrig == null) btn._copyOrig = label ? label.textContent : btn.textContent;
  const announce = (msg) => { const el = document.getElementById("copy-status"); if (el) el.textContent = msg; };
  clearTimeout(btn._copyTimer);
  try {
    await navigator.clipboard.writeText(text);
    setLabel(t("jinaCopied"));
    btn.classList.add("copied");
    announce(t("jinaCopied"));
  } catch (_) {
    setLabel(t("mdPreviewFailed"));
    announce(t("mdPreviewFailed"));
  }
  btn._copyTimer = setTimeout(() => {
    setLabel(btn._copyOrig);
    btn.classList.remove("copied");
    btn._copyOrig = null;
    announce("");
  }, 1500);
}

// One-shot button feedback: swap the .btn-label to msg + .copied for 1.5s, then
// revert; also announce to the #copy-status live region for screen readers. Uses
// the same re-entry guard as copyToClipboard (persist orig once, clear pending timer).
function flashButtonLabel(btn, msg) {
  const label = btn.querySelector(".btn-label");
  const setLabel = (s) => { if (label) label.textContent = s; else btn.textContent = s; };
  if (btn._copyOrig == null) btn._copyOrig = label ? label.textContent : btn.textContent;
  const el = document.getElementById("copy-status");
  if (el) el.textContent = msg;
  setLabel(msg);
  btn.classList.add("copied");
  clearTimeout(btn._copyTimer);
  btn._copyTimer = setTimeout(() => {
    setLabel(btn._copyOrig);
    btn.classList.remove("copied");
    btn._copyOrig = null;
    if (el) el.textContent = "";
  }, 1500);
}

// renderMarkdown + htmlToMarkdown + safeFilename + downloadFile now live in md-convert.js (single source of truth).

// Inline the vendored hljs theme so the standalone .html highlights offline.
// Light always; dark under a media query. Best-effort: "" if fetch/chrome absent.
async function loadHljsCss() {
  if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.getURL) return "";
  try {
    const light = await (await fetch(chrome.runtime.getURL("vendor/hljs-github.min.css"))).text();
    let dark = "";
    try { dark = await (await fetch(chrome.runtime.getURL("vendor/hljs-github-dark.min.css"))).text(); } catch (_) {}
    return light + (dark ? "\n@media (prefers-color-scheme:dark){\n" + dark + "\n}\n" : "");
  } catch (_) { return ""; }
}

// Same pattern as loadHljsCss: inline the vendored KaTeX stylesheet so a math
// export renders offline (audit E3 gap). Note: katex.min.css references its
// webfonts via relative "fonts/..." url()s — those don't resolve once inlined
// into a standalone exported .html (no fonts/ dir alongside it), so exported
// math falls back to the browser's default font metrics instead of KaTeX's
// web fonts. Accepted: the composed glyph layout still renders correctly,
// only the font face degrades, and we deliberately do NOT inline the font
// files themselves (would bloat every export by the whole KaTeX font set).
async function loadKatexCss() {
  if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.getURL) return "";
  try {
    return await (await fetch(chrome.runtime.getURL("vendor/katex/katex.min.css"))).text();
  } catch (_) { return ""; }
}

// ---- Rail drawer (narrow viewports) ----
// Off-canvas modal-style drawer: move focus in on open, trap Tab while open,
// restore focus to the opener on close. Only engaged <1000px (toggle is
// display:none above, so setOpen(true) never fires at wide widths).
function setupDrawer() {
  const toggle = document.getElementById("rail-toggle");
  const scrim = document.getElementById("rail-scrim");
  const rail = document.getElementById("rail");
  const main = document.querySelector("main");
  if (!toggle || !scrim || !rail) return;
  let lastFocus = null;
  const focusables = () => Array.from(
    rail.querySelectorAll('button, a[href], input, select, [tabindex]:not([tabindex="-1"])')
  ).filter((el) => el.offsetParent !== null);
  const isOpen = () => document.body.classList.contains("rail-open");
  const setOpen = (open) => {
    document.body.classList.toggle("rail-open", open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    scrim.hidden = !open;
    if (open) {
      lastFocus = document.activeElement;
      rail.setAttribute("role", "dialog");
      rail.setAttribute("aria-modal", "true");
      if (main) main.inert = true;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (isOpen()) (document.getElementById("btn-rendered") || rail).focus();
      }));
    } else {
      pbpRailDrawerClose();
      if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
      else toggle.focus();
    }
  };
  toggle.addEventListener("click", () => setOpen(!isOpen()));
  scrim.addEventListener("click", () => setOpen(false));
  document.addEventListener("keydown", (e) => {
    if (!isOpen()) return;
    if (e.key === "Escape") { setOpen(false); return; }
    if (e.key === "Tab") {
      const f = focusables();
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  window.matchMedia("(max-width: 1000px)").addEventListener("change", (e) => {
    if (!e.matches) pbpRailDrawerClose();
  });
}

// Closes the mobile off-canvas rail drawer if it happens to be open (R2
// zen batch, spec sec.1.2 "zen also hides the drawer toggle"). Entering
// zen while the drawer is open only CSS-hides #rail/.rail-toggle/
// .rail-scrim (md-preview.css) -- it does NOT clear the drawer's OWN
// state, which lives entirely inside setupDrawer()'s closure above
// (body.rail-open, the scrim's hidden attribute, #rail's role/aria-modal).
// Left uncleared, exiting zen hands control back to the pre-existing
// `body.rail-open .rail { transform: translateX(0); visibility: visible }`
// rule and the scrim's now-stale visible state, popping the full-screen
// drawer overlay back onto the screen even though the user only asked to
// leave zen. Declared top-level (genuinely page-global, like
// trOnlyScrollTarget right below) rather than added inside setupDrawer's
// closure, so md-reader.js's zen feature can reach it via a typeof guard,
// same as every other cross-file call in this file. Mirrors setupDrawer's
// own setOpen(false) branch (rail-open class / aria-expanded /
// scrim.hidden / role+aria-modal) but deliberately does NOT restore focus
// to setupDrawer's private `lastFocus` -- that variable isn't reachable
// from outside setupDrawer's closure, and the caller (md-reader.js's
// _pbpZenEnter) already handles its own focus target for the zen-entry
// case.
function pbpRailDrawerClose() {
  document.body.classList.remove("rail-open");
  const toggle = document.getElementById("rail-toggle");
  const scrim = document.getElementById("rail-scrim");
  const rail = document.getElementById("rail");
  const main = document.querySelector("main");
  if (toggle) toggle.setAttribute("aria-expanded", "false");
  if (scrim) scrim.hidden = true;
  if (rail) {
    rail.removeAttribute("role");
    rail.removeAttribute("aria-modal");
  }
  if (main) main.inert = false;
}

// Drawer-originated jumps must not leave focus inside hidden controls.
function pbpFocusArticleTarget(target) {
  if (!target) return;
  pbpRailDrawerClose();
  if (!target.hasAttribute("tabindex")) target.tabIndex = -1;
  target.focus({ preventScroll: true });
}

// In tr-only mode, a translated ORIGINAL heading is display:none (md-preview.css:890
// hides every [data-pb-tr-done] unless .pb-show-orig is toggled back on) while its
// .pb-tr sibling (inserted by _pbpTrFill, md-translate.js) carries the visible text.
// Anything that scrolls to or measures the geometry of a heading element must resolve
// through this first, or it reads/targets a collapsed 0/0/0/0 box.
function trOnlyScrollTarget(headEl) {
  if (!document.body.classList.contains("tr-only")) return headEl;
  if (!headEl.dataset || !headEl.dataset.pbTrDone || headEl.classList.contains("pb-show-orig")) return headEl;
  const sib = headEl.nextElementSibling;
  return (sib && sib.classList && sib.classList.contains("pb-tr")) ? sib : headEl;
}

// ---- Scroll-spy: highlight the TOC entry for the heading nearest the top ----
// Returns a dispose function that unhooks EVERYTHING this installs (observer,
// scroll listener, any rAF still in flight). Callers must run it before
// rebuilding the TOC: the observer and the listener are page-lifetime objects
// holding on to the old headings and old <a> elements, so without a teardown a
// second install would leave the previous spy running and fighting the new one
// over the .active class. The no-op returns keep the contract uniform — a
// caller can always store and later call whatever came back.
function setupScrollSpy(renderedView, tocList) {
  const noop = () => {};
  const links = Array.from(tocList.querySelectorAll("a"));
  if (!links.length) return noop;

  // No sticky toolbar overlays the content now (rail is beside it); a small
  // top clearance keeps the heading at the very top from flickering.
  const topClear = 16;

  // Map slug -> link for O(1) activation.
  const linkBySlug = new Map(links.map((a) => [a.dataset.slug, a]));

  // Resolve each link's target heading element by id (slug === heading id).
  const targets = links
    .map((a) => renderedView.querySelector("#" + cssEscape(a.dataset.slug)))
    .filter(Boolean);
  if (!targets.length) return noop;

  let activeSlug = null;
  const setActive = (slug) => {
    if (slug === activeSlug) return;
    if (activeSlug && linkBySlug.has(activeSlug)) linkBySlug.get(activeSlug).classList.remove("active");
    const a = linkBySlug.get(slug);
    if (a) {
      a.classList.add("active");
      activeSlug = slug;
    }
  };

  // Track which headings are currently intersecting; the topmost wins.
  const visible = new Set();

  // Bottom-up scan for the last heading above the viewport. In tr-only mode
  // the heading itself is display:none (see trOnlyScrollTarget) and always
  // reports a degenerate 0/0/0/0 rect — measure its visible .pb-tr sibling
  // instead. Shared by the observer callback (nothing intersecting) and the
  // scroll fallback below (observer starved because all targets are
  // display:none, so it never fires again after the initial hide).
  const runFallback = () => {
    for (let i = targets.length - 1; i >= 0; i--) {
      if (trOnlyScrollTarget(targets[i]).getBoundingClientRect().top < topClear + 12) { setActive(targets[i].id); return; }
    }
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const id = entry.target.id;
      if (entry.isIntersecting) visible.add(id);
      else visible.delete(id);
    });
    // Pick the visible heading closest to the top of the doc order.
    let topId = null;
    for (const t of targets) {
      if (visible.has(t.id)) { topId = t.id; break; }
    }
    if (topId) { setActive(topId); return; }
    // If nothing is intersecting (scrolled past all into a long section),
    // keep the last heading above the viewport active.
    runFallback();
  }, {
    // top margin clears the (measured) sticky toolbar; -70% bottom keeps the
    // "current" heading active until the next one nears the top.
    rootMargin: "-" + topClear + "px 0px -70% 0px",
    threshold: 0,
  });
  targets.forEach((t) => observer.observe(t));

  // In tr-only view every target is display:none (md-preview.css
  // `body.tr-only #rendered-view [data-pb-tr-done]:not(.pb-show-orig)`), so
  // it never intersects and the observer callback fires once (the hide
  // transition) and then never again — the highlight freezes. Drive the
  // same fallback off scroll instead, throttled to one measure per frame.
  // In original/bilingual views `visible` stays populated by the observer,
  // so this bails out immediately and costs nothing.
  let spyRaf = 0;
  // Named (was anonymous) so dispose can remove exactly this listener.
  const onSpyScroll = () => {
    if (visible.size) return;
    if (spyRaf) return;
    spyRaf = requestAnimationFrame(() => { spyRaf = 0; runFallback(); });
  };
  window.addEventListener("scroll", onSpyScroll, { passive: true });

  return () => {
    observer.disconnect();
    window.removeEventListener("scroll", onSpyScroll);
    // A pending frame would otherwise still call runFallback() against the
    // detached old headings after teardown.
    if (spyRaf) { cancelAnimationFrame(spyRaf); spyRaf = 0; }
  };
}

// CSS.escape fallback for slugs used in querySelector("#"+id).
function cssEscape(s) {
  if (window.CSS && typeof CSS.escape === "function") return CSS.escape(s);
  return String(s).replace(/[^a-zA-Z0-9\-_ -￿]/g, (c) => "\\" + c);
}
