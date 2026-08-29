// ============================================================
// Pinboard Bookmark Enhanced - i18n Helper
// ============================================================

let _i18nMessages = null;
// Which language _i18nMessages actually holds. The version stamp lives in
// SHARED localStorage — after a language switch, another page may have already
// updated the stamp while THIS page still holds the old language's messages,
// so the stamp alone must never short-circuit the refresh (Codex review P2).
let _i18nMessagesLang = null;
let _i18nReady = false;
let _i18nRefreshGeneration = 0;

/**
 * Synchronously populate _i18nMessages from localStorage mirror (if user
 * set manual language). Auto-mode users hit chrome.i18n.getMessage which
 * is already synchronous, so no mirror is needed for them. Then kicks off
 * an async refresh that updates the mirror and re-applies translations if
 * data changed.
 *
 * Signature is callable as both sync (returns undefined) and via `await`
 * (await on non-Promise resolves immediately) — preserves call sites in
 * popup.js / options.js / background.js that do `await initI18n();`.
 */
function initI18n() {
  if (_i18nReady) {
    _refreshI18nAsync().catch(() => {});
    return;
  }
  // Sync mirror apply
  try {
    const lang = localStorage.getItem("pp-i18n-lang");
    if (lang && lang !== "auto") {
      const msgs = localStorage.getItem("pp-i18n-msgs");
      if (msgs) {
        try {
          _i18nMessages = JSON.parse(msgs);
          _i18nMessagesLang = lang;
        } catch (_) {}
      }
    }
  } catch (_) {}
  _i18nReady = true;
  // Async refresh (fire-and-forget)
  _refreshI18nAsync().catch(() => {});
}

/**
 * Async refresh: read latest optLang from storage, fetch locale messages
 * if needed, update localStorage mirror + _i18nMessages, re-apply
 * translations if anything changed.
 */
async function _refreshI18nAsync() {
  const generation = ++_i18nRefreshGeneration;
  try {
    const _storage = typeof getSettingsStorage === "function"
      ? await getSettingsStorage()
      : chrome.storage.local;
    const { optLang = "auto" } = await _storage.get({ optLang: "auto" });
    if (generation !== _i18nRefreshGeneration) return;

    const prevLang = (typeof localStorage !== "undefined" ? localStorage.getItem("pp-i18n-lang") : null) || "auto";

    if (optLang === "auto") {
      try {
        localStorage.setItem("pp-i18n-lang", "auto");
        localStorage.removeItem("pp-i18n-msgs");
        localStorage.removeItem("pp-i18n-stamp");
      } catch (_) {}
      const changed = _i18nMessages !== null;
      if (changed) {
        _i18nMessages = null;
        _i18nMessagesLang = null;
        if (typeof applyI18n === "function") applyI18n();
      }
      return;
    }

    // Version-stamp short circuit: messages.json only changes with the extension
    // version, so when the mirror was written by THIS version for THIS language
    // and boot already parsed it, there is nothing to fetch or diff. Saves a
    // ~100KB fetch+parse plus three full JSON.stringify passes on every surface
    // open for manual-language users. Fail-open: any localStorage hiccup just
    // falls through to the full refresh below.
    try {
      if (_i18nMessages && _i18nMessagesLang === optLang &&
          localStorage.getItem("pp-i18n-stamp") === optLang + "@" + chrome.runtime.getManifest().version) {
        return;
      }
    } catch (_) {}

    // Manual language: fetch locale messages
    const url = chrome.runtime.getURL(`_locales/${optLang}/messages.json`);
    const resp = await fetch(url);
    if (!resp.ok) return;
    const msgs = await resp.json();
    if (generation !== _i18nRefreshGeneration) return;
    const currentStorage = typeof getSettingsStorage === "function"
      ? await getSettingsStorage()
      : chrome.storage.local;
    const { optLang: currentLang = "auto" } = await currentStorage.get({ optLang: "auto" });
    if (generation !== _i18nRefreshGeneration || currentLang !== optLang) return;

    try {
      localStorage.setItem("pp-i18n-lang", optLang);
      localStorage.setItem("pp-i18n-msgs", JSON.stringify(msgs));
      localStorage.setItem("pp-i18n-stamp", optLang + "@" + chrome.runtime.getManifest().version);
    } catch (_) {
      // localStorage may be full or unavailable (e.g. SW context); proceed without mirror
    }

    // Re-apply not only on a language switch but also when the fetched messages
    // DIFFER from what we applied at boot (the sync localStorage mirror can be stale
    // after any messages.json edit — new/changed keys would otherwise render via the
    // chrome.i18n default-locale fallback, e.g. English, until the next open).
    const changed = prevLang !== optLang || _i18nMessages === null
      || JSON.stringify(_i18nMessages) !== JSON.stringify(msgs);
    _i18nMessages = msgs;
    _i18nMessagesLang = optLang;
    if (changed && typeof applyI18n === "function") applyI18n();
  } catch (e) {
    console.warn("[i18n] async refresh failed:", e?.message || e);
  }
}

/**
 * Resolve a message entry's placeholders with provided arguments.
 */
function _resolveMsg(entry, args) {
  let msg = entry.message;
  if (!msg) return "";
  if (entry.placeholders && args.length) {
    for (const [name, def] of Object.entries(entry.placeholders)) {
      const m = (def.content || "").match(/^\$(\d+)$/);
      if (m) {
        const idx = parseInt(m[1]) - 1;
        if (idx >= 0 && idx < args.length) {
          // Function replacement (not a bare string) -- a string replacement
          // interprets $&, $`, $', $$, $N in the arg as special patterns and
          // would corrupt any placeholder value containing them.
          msg = msg.replace(new RegExp("\\$" + name + "\\$", "gi"), () => String(args[idx]));
        }
      }
    }
  }
  return msg;
}

/**
 * Shorthand for chrome.i18n.getMessage with placeholder support.
 * When a manual language is loaded (via mirror or async refresh), uses
 * that; otherwise falls back to chrome.i18n.getMessage (browser locale).
 * Usage: t("key") or t("key", "arg1", "arg2")
 */
function t(key, ...args) {
  if (_i18nMessages && _i18nMessages[key]) {
    return _resolveMsg(_i18nMessages[key], args) || key;
  }
  const msg = chrome.i18n.getMessage(key, args.length ? args : undefined);
  return msg || key;
}

// Map the active UI locale to the BCP-47 tag used by <html lang> and :lang().
function uiLangToBCP47() {
  let lang = null;
  try { lang = localStorage.getItem("pp-i18n-lang"); } catch (_) {}
  if (!lang || lang === "auto") {
    try { lang = chrome.i18n.getUILanguage(); } catch (_) { lang = "en"; }
  }
  lang = (lang || "en").replace(/_/g, "-").toLowerCase();
  if (lang === "zh-hk" || lang === "zh-tw" || lang.startsWith("zh-hant")) return "zh-Hant";
  if (lang === "zh-cn" || lang === "zh-sg" || lang === "zh" || lang.startsWith("zh-hans")) return "zh-Hans";
  if (lang.startsWith("ja")) return "ja";
  if (lang.startsWith("ko")) return "ko";
  return lang.split("-")[0];
}

/**
 * Apply translations to all elements with data-i18n attributes.
 * Supports:
 *   data-i18n="key"               → textContent
 *   data-i18n-placeholder="key"   → placeholder attribute
 *   data-i18n-title="key"         → title attribute
 *   data-i18n-aria="key"          → aria-label attribute
 *   data-i18n-label="key"         → label attribute (optgroup)
 *
 * Note: All translations are applied as plain text (textContent)
 * to prevent XSS. No innerHTML injection is used.
 */
function applyI18n(root) {
  // No DOM (e.g. the service worker imports i18n.js for t() only) — nothing to translate.
  // Without this, `root || document` throws "document is not defined" on every manual-language
  // SW cold start (caught at the _refreshI18nAsync warn), spamming chrome://extensions errors.
  if (typeof document === "undefined") return;
  root = root || document;
  document.documentElement.lang = uiLangToBCP47();

  // P1.5: Merged 4 separate querySelectorAll passes into 1 DOM walk.
  root.querySelectorAll("[data-i18n],[data-i18n-placeholder],[data-i18n-title],[data-i18n-aria],[data-i18n-label]").forEach(el => {
    const k1 = el.getAttribute("data-i18n");
    if (k1) el.textContent = t(k1);
    const k2 = el.getAttribute("data-i18n-placeholder");
    if (k2) el.placeholder = t(k2);
    const k3 = el.getAttribute("data-i18n-title");
    if (k3) el.title = t(k3);
    const k4 = el.getAttribute("data-i18n-aria");
    if (k4) el.setAttribute("aria-label", t(k4));
    const k5 = el.getAttribute("data-i18n-label");
    if (k5) el.setAttribute("label", t(k5));
  });
}
