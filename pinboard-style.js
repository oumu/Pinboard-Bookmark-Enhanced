// ============================================================
// Pinboard Bookmark Enhanced - Custom Style Injector
// Content script for pinboard.in pages (runs at document_start)
//
// Schema v2 (2026-05-01):
//   themePresetKey   → string, looks up CSS from PINBOARD_THEMES (loaded above)
//   customOverlayCSS → user's tweak CSS, appended after preset (CSS later wins)
//   customOverlayCSS_localFallback → this device's quota fallback
// ============================================================

// Adaptive theme map (mirrors shared.js — content scripts can't import it)
const PBP_ADAPTIVE_THEME_MAP = {
  flexoki: ["flexoki-light", "flexoki-dark"],
  solarized: ["solarized-light", "solarized-dark"],
  catppuccin: ["catppuccin-latte", "catppuccin-mocha"]
};

// Only cloak when prior evidence (origin-scoped, synchronous) says a theme is
// configured. Default/un-themed users get NO blank flash — there is nothing to
// fade in. localStorage is readable here (content script runs in pinboard.in
// origin); shared.js's chrome.storage mirror is async and unavailable that early.
let _pbpHasTheme = false;
try { _pbpHasTheme = localStorage.getItem("pbp_has_theme") === "1"; } catch (_) {}
// Paint the last rendered background underneath the cloak. Hiding the page
// without one showed the browser's default canvas -- white -- for up to 400ms
// and then hard cut to the theme, so the eight-plus dark presets flashed white
// on every pinboard.in load. The value is written back after the theme applies
// (see the end of this file) by reading what actually rendered, which keeps
// preset CSS unparsed and sidesteps the adaptive presets' light/dark split.
// It is validated to an rgb()/rgba() literal first: it lives in pinboard.in's
// own localStorage, which makes it untrusted input to a <style> element.
//
// Cached per resolved light/dark, because the OS can flip that between loads
// with no user action -- one key would then paint the light background over a
// dark render. What it still cannot predict is the user switching PRESET: the
// preset key is only readable asynchronously, so the first navigation after a
// light-to-dark preset change paints the old light colour. That is one frame of
// the wrong shade on a deliberate user action, not the every-load flash this
// replaces.
const PBP_CLOAK_BG_RE = /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(?:,\s*(?:0|1|0?\.\d+)\s*)?\)$/;
const pbpCloakBgKey = (isDark) => (isDark ? "pbp_cloak_bg_d" : "pbp_cloak_bg_l");
let _pbpCloakBg = "";
try {
  const osDark = typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;
  // Prefer the mode the OS is in; fall back to the other so an explicit
  // light/dark override still gets a colour on its very first cached load.
  for (const key of [pbpCloakBgKey(osDark), pbpCloakBgKey(!osDark)]) {
    const cached = localStorage.getItem(key) || "";
    if (PBP_CLOAK_BG_RE.test(cached)) { _pbpCloakBg = cached; break; }
  }
} catch (_) {}
let _pbpCloak = null;
if (_pbpHasTheme) {
  _pbpCloak = document.createElement("style");
  _pbpCloak.id = "pbp-cloak";
  // Paint the root and hide its children, rather than zeroing the root's own
  // opacity: the root's background is what propagates to the canvas, and the
  // canvas is exactly what must keep showing the themed colour. Hiding
  // `html > *` rather than `body` alone also covers anything a page parks
  // directly under documentElement. (Top-layer content escapes either way.)
  _pbpCloak.textContent = _pbpCloakBg
    ? `html { background: ${_pbpCloakBg} !important; } html > * { opacity: 0 !important; }`
    : "html { opacity: 0 !important; }";
  (document.head || document.documentElement).appendChild(_pbpCloak);
}

(async () => {
  // Inline storage selector (shared.js not available in content scripts)
  async function getStorage() {
    const { optSyncEnabled } = await chrome.storage.local.get({ optSyncEnabled: false });
    return optSyncEnabled ? chrome.storage.sync : chrome.storage.local;
  }

  // Read large value — chunked from sync, direct from local. Mirrors
  // shared.js's fallback-freshness rules (content scripts can't load shared.js
  // or take its Web Locks): a quota-fallback record wins only while sync still
  // shows the generation it was written against ("_base"); once another device
  // commits a newer generation, sync wins. A generation swap racing these
  // unlocked reads (meta read, then chunks already deleted) is retried once
  // with fresh metadata instead of silently rendering without the overlay.
  async function readChunkedSync(key, defaultValue) {
    const storage = await getStorage();
    if (storage === chrome.storage.local) {
      const data = await chrome.storage.local.get({ [key]: defaultValue });
      return data[key];
    }
    const fallbackKey = `${key}_localFallback`;
    const fallback = await chrome.storage.local.get(fallbackKey);
    if (typeof fallback[fallbackKey] === "string") return fallback[fallbackKey];
    const record = fallback[fallbackKey];
    const isRecord = !!(record && record._pbpLargeFallback === 1 && typeof record.value === "string");
    // Last-known rescue (mirrors shared.js): when a record exists but sync
    // cannot be read cleanly — committed metadata whose chunks are missing,
    // or a newer generation whose chunks have not propagated yet — fall back
    // to the record's value rather than rendering unthemed.
    const rescue = isRecord ? record.value : null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const meta = await chrome.storage.sync.get(key);
      const stored = meta[key];
      const generation = stored && typeof stored === "object" ? stored._generation : undefined;
      if (isRecord && !(stored && typeof stored === "object" && generation === record._generation)) {
        // Not the committed-then-crashed case; is the record still fresh?
        const current = typeof generation === "string" ? generation : null;
        const base = Object.prototype.hasOwnProperty.call(record, "_base") ? record._base : current;
        if (current === base) return record.value;
        // Stale record (another device committed a newer generation): sync
        // wins when it reads; the rescue above covers the propagation gap.
      }
      if (typeof stored === "string") return stored;
      const count = Number(stored && stored._chunks);
      if (!Number.isInteger(count) || count < 1 || count > 512 ||
          (generation !== undefined && (typeof generation !== "string" || !/^[a-z0-9]+$/i.test(generation)))) {
        return rescue === null ? defaultValue : rescue;
      }
      const prefix = generation ? `${key}_${generation}_` : `${key}_`;
      const chunkKeys = Array.from({ length: count }, (_, i) => `${prefix}${i}`);
      const chunks = await chrome.storage.sync.get(chunkKeys);
      if (chunkKeys.every((chunkKey) => typeof chunks[chunkKey] === "string")) {
        return chunkKeys.map((chunkKey) => chunks[chunkKey]).join("") || defaultValue;
      }
      // Missing chunks: a writer likely swapped generations mid-read — loop
      // once for fresh metadata, then rescue/default (the 400ms uncloak
      // guard still applies either way).
    }
    return rescue === null ? defaultValue : rescue;
  }

  function uncloak() {
    const el = document.getElementById("pbp-cloak");
    if (el) el.remove();
  }

  // Safety: always uncloak after 400ms even if something fails (was 800ms;
  // themed storage reads resolve well under this on warm SW)
  setTimeout(uncloak, 400);

  try {
    const storage = await getStorage();
    const data = await storage.get({
      customFont: "",
      optTheme: "auto",
      themePresetKey: "",
    });

    // The reader itself prefers this device's local quota fallback when present.
    const overlay = await readChunkedSync("customOverlayCSS", "");

    // Inject pbp-dark class based on extension theme setting
    const isDark = data.optTheme === "dark" ||
      (data.optTheme === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("pbp-dark", isDark);

    // Resolve preset CSS from PINBOARD_THEMES (loaded above us as content script)
    let presetCss = "";
    if (data.themePresetKey && typeof PINBOARD_THEMES !== "undefined") {
      // Adaptive presets: prefer the explicit variant if it exists in
      // PINBOARD_THEMES (solarized-light, catppuccin-mocha, etc.), otherwise
      // fall back to the parent entry. Flexoki ships ONE css string that
      // toggles via the `html.pbp-dark` class, so its variant keys don't
      // exist as separate entries — using the parent is correct.
      let themeKey = data.themePresetKey;
      if (PBP_ADAPTIVE_THEME_MAP[themeKey]) {
        const variantKey = PBP_ADAPTIVE_THEME_MAP[themeKey][isDark ? 1 : 0];
        if (PINBOARD_THEMES[variantKey]) themeKey = variantKey;
      }
      if (PINBOARD_THEMES[themeKey]) presetCss = PINBOARD_THEMES[themeKey].css || "";
    }

    let combined = "";
    if (data.customFont) {
      combined += `body, .bookmark_title, .bookmark_description, .tag { font-family: ${data.customFont} !important; }\n`;
    }
    if (presetCss) {
      combined += `/* === preset: ${data.themePresetKey} === */\n${presetCss}\n`;
    }
    if (overlay) {
      combined += `/* === user overlay === */\n${overlay}\n`;
    }

    // Persist cheap synchronous evidence for NEXT cold load's cloak gate.
    const _pbpThemed = !!(data.themePresetKey || data.customFont || overlay);
    try { localStorage.setItem("pbp_has_theme", _pbpThemed ? "1" : "0"); } catch (_) {}

    if (combined) {
      const style = document.createElement("style");
      style.id = "pbp-injected";
      style.textContent = combined;
      (document.head || document.documentElement).appendChild(style);
    }

    // Cache the background this load actually rendered, for the NEXT cold
    // load's cloak. Deferred to `load` because at document_start the page's own
    // stylesheet has not been applied yet, so the computed value would be the
    // UA default. Only ever read on the next navigation, so the delay is free.
    // Keyed by the mode that actually rendered, which is what makes an OS
    // light/dark flip between loads paint the right colour.
    const cacheCloakBg = () => {
      try {
        if (!_pbpThemed) {
          localStorage.removeItem(pbpCloakBgKey(true));
          localStorage.removeItem(pbpCloakBgKey(false));
          return;
        }
        const bg = getComputedStyle(document.body).backgroundColor;
        if (PBP_CLOAK_BG_RE.test(bg) && bg !== "rgba(0, 0, 0, 0)") {
          localStorage.setItem(pbpCloakBgKey(isDark), bg);
        }
      } catch (_) {}
    };
    if (document.readyState === "complete") cacheCloakBg();
    else window.addEventListener("load", cacheCloakBg, { once: true });
  } catch (_) {}

  uncloak();
})();
