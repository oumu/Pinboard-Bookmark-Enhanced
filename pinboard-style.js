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
  // Trusted-only storage (roadmap #36): this script can no longer read
  // chrome.storage — local/sync also hold the Pinboard token and every BYO
  // API key, and setAccessLevel(TRUSTED_CONTEXTS) closed that whole surface
  // to content scripts. The handful of non-secret display prefs (and the
  // overlay CSS, chunk-resolved by shared.js's full implementation on the
  // trusted side) arrive through the SW's allowlisted get_site_prefs message
  // instead. The old inline chunked-sync reader lived here only because
  // content scripts couldn't load shared.js — moot now.
  function fetchSitePrefs() {
    return new Promise((resolve) => {
      let settled = false;
      const settle = (v) => { if (!settled) { settled = true; resolve(v); } };
      try {
        chrome.runtime.sendMessage({ type: "get_site_prefs" })
          .then((resp) => settle(resp && typeof resp === "object" && !resp.error ? resp : null), () => settle(null));
      } catch (_) { settle(null); }
      // A cold SW can take a moment; the 400ms cloak guard below already
      // bounds the visual cost — this bound only keeps the promise from
      // hanging forever if the channel dies.
      setTimeout(() => settle(null), 3000);
    });
  }

  function uncloak() {
    const el = document.getElementById("pbp-cloak");
    if (el) el.remove();
  }

  // Safety: always uncloak after 400ms even if something fails (was 800ms;
  // themed storage reads resolve well under this on warm SW)
  setTimeout(uncloak, 400);

  try {
    const prefs = await fetchSitePrefs();
    if (!prefs) { uncloak(); return; } // channel down: render unthemed, cloak guard already bounded the wait
    const data = {
      customFont: typeof prefs.customFont === "string" ? prefs.customFont : "",
      optTheme: typeof prefs.optTheme === "string" ? prefs.optTheme : "auto",
      themePresetKey: typeof prefs.themePresetKey === "string" ? prefs.themePresetKey : "",
    };
    const overlay = typeof prefs.overlayCss === "string" ? prefs.overlayCss : "";

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
