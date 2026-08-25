// All synchronous reads from localStorage mirror — applied BEFORE first paint to prevent
// FOUC: section flash (main vs login), theme flash (light borders in dark mode), width jump.
// chrome.storage is the source of truth; this file's async tail writes the mirror so the
// NEXT popup open is fast.
const PBP_POPUP_ADAPTIVE_MAP = {
  flexoki: ["flexoki-light", "flexoki-dark"],
  solarized: ["solarized-light", "solarized-dark"],
  catppuccin: ["catppuccin-latte", "catppuccin-mocha"]
};

(function applyFromLocalStorageMirror() {
  const root = document.documentElement;

  // Section visibility (main vs login)
  root.dataset.section = localStorage.getItem("pp-logged-in") === "1" ? "main" : "login";

  // Popup width
  const w = Number(localStorage.getItem("pp-popup-width")) || 550;
  root.style.setProperty("--pp-popup-width", Math.max(420, Math.min(720, w)) + "px");

  // Theme: dark class or data-theme based on stored mode + preset + system preference
  const mode = localStorage.getItem("pp-theme") || "auto";
  const preset = localStorage.getItem("pp-theme-preset") || "";
  const followTheme = localStorage.getItem("pp-theme-follow") !== "0"; // default true
  const prefersDark = mode === "dark" ||
    (mode === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const key = followTheme ? preset : "";

  if (PBP_POPUP_ADAPTIVE_MAP[key]) {
    root.dataset.theme = prefersDark ? PBP_POPUP_ADAPTIVE_MAP[key][1] : PBP_POPUP_ADAPTIVE_MAP[key][0];
  } else if (key) {
    root.dataset.theme = key;
  } else if (prefersDark) {
    // No-preset dark resolves to the flexoki-dark preset, the same fallback
    // Options / Library (options-theme-early.js) and the reader's own dark
    // palette use -- one warm-neutral dark across all four surfaces (theme
    // model 2026-08-25, batch 2 D6). popup.css carries no html.dark layer
    // any more (retired with this switch).
    root.dataset.theme = "flexoki-dark";
  }
})();

// B4: tab data prefill — populate only public URL/title fields.
//     synchronously from the last-known tab. popup.js will validate against
//     chrome.storage.session asynchronously and clear stale prefill if mismatched.
//     Account-specific bookmark state is always resolved by the background lookup.
(function applyTabMirror() {
  const _TAB_MIRROR_TTL_MS = 10 * 60 * 1000;
  try {
    const raw = localStorage.getItem("pp-last-tab");
    if (!raw) return;
    const m = JSON.parse(raw);
    if (!m || !m.ts || (Date.now() - m.ts) >= _TAB_MIRROR_TTL_MS || !m.url) return;
    document.addEventListener("DOMContentLoaded", () => {
      const u = document.getElementById("url-input");
      const ti = document.getElementById("title-input");
      if (u && !u.value) u.value = m.url;
      if (ti && !ti.value) ti.value = m.title || "";
    }, { once: true });
  } catch (_) {}
})();

// Async source-of-truth read — corrects mirror if stale, populates on first run.
chrome.storage.local.get({ optSyncEnabled: false }).then(({ optSyncEnabled }) => {
  return (optSyncEnabled ? chrome.storage.sync : chrome.storage.local)
    .get({ optTheme: "auto", themePresetKey: "", optPopupFollowTheme: true, popupWidth: 550 });
}).then(s => {
  // Update localStorage mirror for next popup boot
  try {
    localStorage.setItem("pp-theme", s.optTheme || "auto");
    localStorage.setItem("pp-theme-preset", s.themePresetKey || "");
    localStorage.setItem("pp-theme-follow", s.optPopupFollowTheme === false ? "0" : "1");
    localStorage.setItem("pp-popup-width", String(s.popupWidth || 550));
  } catch (_) {}

  // Re-apply in case the mirror was stale (will be a no-op if mirror was correct)
  const root = document.documentElement;
  const prefersDark = s.optTheme === "dark" ||
    (s.optTheme === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const key = s.optPopupFollowTheme !== false ? (s.themePresetKey || "") : "";

  // Reset before re-applying
  delete root.dataset.theme;

  if (PBP_POPUP_ADAPTIVE_MAP[key]) {
    root.dataset.theme = prefersDark ? PBP_POPUP_ADAPTIVE_MAP[key][1] : PBP_POPUP_ADAPTIVE_MAP[key][0];
  } else if (key) {
    root.dataset.theme = key;
  } else if (prefersDark) {
    // No-preset dark resolves to the flexoki-dark preset, the same fallback
    // Options / Library (options-theme-early.js) and the reader's own dark
    // palette use -- one warm-neutral dark across all four surfaces (theme
    // model 2026-08-25, batch 2 D6). popup.css carries no html.dark layer
    // any more (retired with this switch).
    root.dataset.theme = "flexoki-dark";
  }

  const w = Math.max(420, Math.min(720, Number(s.popupWidth) || 550));
  root.style.setProperty("--pp-popup-width", w + "px");
}).catch(() => { /* storage unavailable: localStorage mirror already applied */ });
