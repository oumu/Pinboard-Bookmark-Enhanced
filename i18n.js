// ============================================================
// Pinboard Bookmark Enhanced - i18n Helper
// ============================================================

let _i18nMessages = null;
let _i18nInitPromise = null;

/**
 * Initialize i18n: if user has set a manual language, load that locale's
 * messages.json. Must be called (and awaited) before applyI18n().
 * Safe to call multiple times — subsequent calls return the same promise.
 */
async function initI18n() {
  if (_i18nInitPromise) return _i18nInitPromise;
  _i18nInitPromise = (async () => {
    try {
      // getSettingsStorage is defined in shared.js; safe to call here since
      // initI18n() is always invoked after all scripts are loaded
      const _storage = typeof getSettingsStorage === "function"
        ? await getSettingsStorage()
        : chrome.storage.local;
      const result = await _storage.get({ optLang: "auto" });
      const lang = result.optLang;
      if (lang && lang !== "auto") {
        const url = chrome.runtime.getURL(`_locales/${lang}/messages.json`);
        const resp = await fetch(url);
        if (resp.ok) _i18nMessages = await resp.json();
      }
    } catch (_) {}
  })();
  return _i18nInitPromise;
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
          msg = msg.replace(new RegExp("\\$" + name + "\\$", "gi"), args[idx]);
        }
      }
    }
  }
  return msg;
}

/**
 * Shorthand for chrome.i18n.getMessage with placeholder support.
 * When a manual language is loaded, uses that; otherwise falls back
 * to chrome.i18n.getMessage (browser locale).
 * Usage: t("key") or t("key", "arg1", "arg2")
 */
function t(key, ...args) {
  if (_i18nMessages && _i18nMessages[key]) {
    return _resolveMsg(_i18nMessages[key], args) || key;
  }
  const msg = chrome.i18n.getMessage(key, args.length ? args : undefined);
  return msg || key;
}

/**
 * Apply translations to all elements with data-i18n attributes.
 * Supports:
 *   data-i18n="key"               → textContent
 *   data-i18n-placeholder="key"   → placeholder attribute
 *   data-i18n-title="key"         → title attribute
 *   data-i18n-aria="key"          → aria-label attribute
 *
 * Note: All translations are applied as plain text (textContent)
 * to prevent XSS. No innerHTML injection is used.
 */
function applyI18n(root) {
  root = root || document;

  // P1.5: Merged 4 separate querySelectorAll passes into 1 DOM walk.
  // Each element may have multiple i18n attributes — apply whichever are present.
  root.querySelectorAll("[data-i18n],[data-i18n-placeholder],[data-i18n-title],[data-i18n-aria]").forEach(el => {
    const k1 = el.getAttribute("data-i18n");
    if (k1) el.textContent = t(k1);
    const k2 = el.getAttribute("data-i18n-placeholder");
    if (k2) el.placeholder = t(k2);
    const k3 = el.getAttribute("data-i18n-title");
    if (k3) el.title = t(k3);
    const k4 = el.getAttribute("data-i18n-aria");
    if (k4) el.setAttribute("aria-label", t(k4));
  });
}
