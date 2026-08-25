// Synchronous theme mirror + stable first-frame gate. chrome.storage remains
// authoritative and corrects the mirror asynchronously below.
const PBP_OPTIONS_ADAPTIVE_MAP = {
  flexoki: ["flexoki-light", "flexoki-dark"],
  solarized: ["solarized-light", "solarized-dark"],
  catppuccin: ["catppuccin-latte", "catppuccin-mocha"]
};

const _optionsRoot = document.documentElement;
setTimeout(() => {
  if (!_optionsRoot.dataset.optionsReady) _optionsRoot.dataset.optionsReady = "fallback";
}, 3000);

// Library's first-frame gate (theme model 2026-08-25, F8): library.css hides
// header + main until `data-options-ready` is set. Released once the
// authoritative theme has landed -- from the boot read, from a runtime
// re-read that superseded it, or on a KNOWN storage failure -- so the 3s
// fail-open timer above only ever covers a read that never settles. Options
// releases its own gate from options.js once its form is populated.
// `location` is absent in the ui-contract vm harness that runs this file
// standalone, hence the typeof guard (that harness never needs the gate).
function pbpIsOptionsPage() {
  return typeof location !== "undefined" && /options\.html$/.test(location.pathname);
}
function pbpReleaseLibraryGate() {
  if (typeof location === "undefined") return;
  if (!pbpIsOptionsPage()) _optionsRoot.dataset.optionsReady = "1";
}

// Last applied inputs, re-run by the system light/dark listener below
// (settings batch D1: an open Options/Library page follows the OS switch
// like the popup and the reader do).
const _optionsLastTheme = { mode: "auto", presetKey: "", follow: true };
// follow === false drops the preset: "Extension pages follow the Pinboard
// theme preset" gates Options and Library exactly like the popup (theme
// model 2026-08-25, settings batch D4). Omitted = legacy caller = follow.
function pbpApplyOptionsEarlyTheme(mode, presetKey, follow) {
  const key = follow === false ? "" : (presetKey || "");
  _optionsLastTheme.mode = mode || "auto";
  _optionsLastTheme.presetKey = presetKey || "";
  _optionsLastTheme.follow = follow !== false;
  delete _optionsRoot.dataset.theme;
  const prefersDark = mode === "dark" ||
    (mode === "auto" && typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);

  if (Object.prototype.hasOwnProperty.call(PBP_OPTIONS_ADAPTIVE_MAP, key)) {
    const [light, dark] = PBP_OPTIONS_ADAPTIVE_MAP[key];
    _optionsRoot.dataset.theme = prefersDark ? dark : light;
  } else if (key) {
    _optionsRoot.dataset.theme = key;
  } else if (prefersDark) {
    _optionsRoot.dataset.theme = "flexoki-dark";
  }
}
if (typeof window.matchMedia === "function") {
  try {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      if (_optionsLastTheme.mode === "auto") {
        pbpApplyOptionsEarlyTheme(_optionsLastTheme.mode, _optionsLastTheme.presetKey, _optionsLastTheme.follow);
      }
    });
  } catch (_) {}
}

// follow undefined = legacy caller: leave the popup-owned "pp-theme-follow"
// mirror untouched rather than overwrite it with a guess.
function pbpStoreOptionsThemeMirror(mode, presetKey, follow) {
  try {
    localStorage.setItem("pp-theme", mode || "auto");
    localStorage.setItem("pp-theme-preset", presetKey || "");
    if (typeof follow === "boolean") localStorage.setItem("pp-theme-follow", follow ? "1" : "0");
  } catch (_) {}
}

let _optionsMirrorMode = "auto";
let _optionsMirrorPreset = "";
let _optionsMirrorFollow = true;
try {
  _optionsMirrorMode = localStorage.getItem("pp-theme") || "auto";
  _optionsMirrorPreset = localStorage.getItem("pp-theme-preset") || "";
  _optionsMirrorFollow = localStorage.getItem("pp-theme-follow") !== "0"; // popup-owned mirror, default true
} catch (_) {}
pbpApplyOptionsEarlyTheme(_optionsMirrorMode, _optionsMirrorPreset, _optionsMirrorFollow);

// ---- Mirror prefill: high-frequency UI fields ----
// Synchronously apply cached field values from localStorage so the form
// doesn't visibly jump from empty → populated. Async path below still
// fires and corrects via storage.get. Mirror TTL 7 days; stale data
// falls back to async path.
const _OPTIONS_MIRROR_TTL_MS = 7 * 24 * 60 * 60 * 1000;
try {
  const raw = localStorage.getItem("pp-options-fields");
  if (raw) {
    const m = JSON.parse(raw);
    if (m && m.ts && (Date.now() - m.ts) < _OPTIONS_MIRROR_TTL_MS) {
      // Logged-in marker (controls panel visibility CSS)
      if (typeof m.loggedIn === "boolean") {
        document.documentElement.dataset.loggedIn = m.loggedIn ? "1" : "0";
      }
      // AI provider + notify checkboxes need DOM — apply on DOMContentLoaded
      document.addEventListener("DOMContentLoaded", () => {
        if (m.aiProvider) {
          const sel = document.getElementById("opt-ai-provider");
          if (sel) {
            const opt = sel.querySelector(`option[value="${m.aiProvider}"]`);
            if (opt) sel.value = m.aiProvider;
          }
        }
        if (m.notify && typeof m.notify === "object") {
          for (const [id, checked] of Object.entries(m.notify)) {
            const el = document.getElementById(id);
            if (el && el.type === "checkbox") el.checked = !!checked;
          }
        }
      }, { once: true });
    }
  }
} catch (_) {}

// Async source-of-truth read — corrects and seeds the mirror for future opens.
if (typeof chrome !== "undefined" && chrome.storage?.local) {
  // One generation counter for the initial authoritative read AND the
  // runtime re-reads below (Codex r2 M1): whichever read started last wins,
  // a slower earlier one never overwrites it.
  let _optionsThemeGen = 0;
  const _optionsBootGen = ++_optionsThemeGen;
  chrome.storage.local.get({ optSyncEnabled: false }).then(({ optSyncEnabled }) => {
    return (optSyncEnabled ? chrome.storage.sync : chrome.storage.local)
      .get({ optTheme: "auto", themePresetKey: "", optPopupFollowTheme: true });
  }).then(s => {
    if (_optionsBootGen !== _optionsThemeGen) return;
    const mode = s.optTheme || "auto";
    const presetKey = s.themePresetKey || "";
    const follow = s.optPopupFollowTheme !== false;
    pbpStoreOptionsThemeMirror(mode, presetKey, follow);
    pbpApplyOptionsEarlyTheme(mode, presetKey, follow);
    pbpReleaseLibraryGate();
  }).catch(() => {
    // storage unavailable: the localStorage mirror already applied; a KNOWN
    // failure must not leave Library blank until the 3s fail-open (Codex
    // 2026-08-26) -- the timer only covers a read that never settles.
    pbpReleaseLibraryGate();
  });

  // Runtime follow (settings batch D1, shared by Options and Library since
  // both load this file): on any theme-related change, or on the sync-routing
  // switch itself (Codex review F7: the theme keys need not change at all),
  // re-read the routed area and re-apply. The routing is resolved here from
  // local optSyncEnabled rather than through shared.js's cache -- that cache
  // is invalidated by a listener registered AFTER this one, so it would still
  // hold the old area when this fires. A generation counter drops a slower
  // earlier read that would otherwise overwrite a newer one.
  // Not on the Options page itself (Codex r2 M2): options.js owns that page's
  // theme state (its form, currentPresetKey, preset buttons) and applies its
  // own changes; a second writer here would repaint from storage while the
  // controls still show the previous state. Library has no such owner.
  if (chrome.storage.onChanged && !pbpIsOptionsPage()) {
    chrome.storage.onChanged.addListener((changes, area) => {
      const themed = changes.optTheme || changes.themePresetKey || changes.optPopupFollowTheme;
      const rerouted = area === "local" && changes.optSyncEnabled;
      if ((area !== "sync" && area !== "local") || !(themed || rerouted)) return;
      const gen = ++_optionsThemeGen;
      chrome.storage.local.get({ optSyncEnabled: false }).then(({ optSyncEnabled }) => {
        return (optSyncEnabled ? chrome.storage.sync : chrome.storage.local)
          .get({ optTheme: "auto", themePresetKey: "", optPopupFollowTheme: true });
      }).then(s => {
        if (gen !== _optionsThemeGen) return;
        const follow = s.optPopupFollowTheme !== false;
        pbpStoreOptionsThemeMirror(s.optTheme || "auto", s.themePresetKey || "", follow);
        pbpApplyOptionsEarlyTheme(s.optTheme || "auto", s.themePresetKey || "", follow);
        pbpReleaseLibraryGate(); // a runtime read that superseded the boot read is the authoritative theme too
      }).catch(() => {});
    });
  }
}
