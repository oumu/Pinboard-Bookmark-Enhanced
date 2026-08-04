import { expandPalette } from "./_util.mjs";
import { mergeTokens } from "./compose-theme.mjs";
import { deriveUiColors, deriveUiRadius, regularizeUiRadius, fgToAA, fgToAAMulti, hexToRgb, rgbToHex, resolveOpaqueBg } from "./_ui-derive.mjs";

// popup theme id -> { pilot, mode, useDarkMode? }
// 12 themes map 1:1; the flexoki pilot yields BOTH flexoki-light and flexoki-dark.
export const POPUP_THEME_MAP = [
  { id: "modern-card", pilot: "modern-card", mode: "light" },
  { id: "nord-night", pilot: "nord-night", mode: "dark" },
  { id: "terminal", pilot: "terminal", mode: "dark" },
  { id: "paper-ink", pilot: "paper-ink", mode: "light" },
  { id: "dracula", pilot: "dracula", mode: "dark" },
  { id: "flexoki-light", pilot: "flexoki", mode: "light" },
  { id: "flexoki-dark", pilot: "flexoki", mode: "dark", useDarkMode: true },
  { id: "solarized-light", pilot: "solarized-light", mode: "light" },
  { id: "solarized-dark", pilot: "solarized-dark", mode: "dark" },
  { id: "catppuccin-latte", pilot: "catppuccin-latte", mode: "light" },
  { id: "catppuccin-mocha", pilot: "catppuccin-mocha", mode: "dark" },
  { id: "gruvbox-dark", pilot: "gruvbox-dark", mode: "dark" },
  { id: "rose-pine", pilot: "rose-pine", mode: "dark" },
  { id: "github-light", pilot: "github-light", mode: "light" },
];

// Default-surface (no preset selected) component-layer baseline — Task 5,
// step ① of the composer color migration. Every value below is copied
// VERBATIM from the CSS literal it stands in for today, so adding these
// declarations changes nothing currently rendered (nothing consumes these
// 5 names yet — Task 8/9/12/13 do): a later task that swaps a hardcoded
// literal for var(--pp-*) finds the identical color already seeded here.
// Source-line table: task-5-report.md.
const DEFAULT_LIGHT = {
  "btn-fg": "#2a2d33",          // = --pp-fg default (popup.css:25). Popup has no unified .btn
                                 // today, so there is no ButtonText fallback to preserve; the
                                 // themed derivation's fgToAAMulti(fg, [bg2, drop-hover]) candidate
                                 // IS --pp-fg and is already AA-clear against both, so this mirrors
                                 // that formula's (identity) result rather than guessing.
  "chip-bg": "#e2eafa",         // = --pp-tag-bg default (popup.css:53)
  "chip-fg": "#33589f",         // = --pp-tag-fg default (popup.css:54)
  "danger-quiet-fg": "#c24343", // = --pp-danger default (popup.css:66)
  "on-danger": "#ffffff",       // = .confirm-popover .confirm-yes `color` default light (popup.css:2048)
  "on-accent": "#ffffff",       // = --pp-on-accent default (popup.css:47) -- moved here design-uplift
                                 // Task 13 step 2, retiring the hand-written :root duplicate of the
                                 // exact same "default value when no preset is active" role this
                                 // block already exists for.
  "preset-fg": "#2d5cb9",       // NOT a literal copy: the default surface's .preset-btn read
                                 // var(--pp-link) (#3f6fd0) for text, which is only 4.27:1 on
                                 // --pp-preset-btn-bg (#eef2ff) and 3.63:1 on-hover
                                 // (--pp-preset-btn-hover-bg, #d5e0ff) -- both below AA, the same
                                 // never-audited-pair class as the themed preset-fg gap Task 13's
                                 // main pass fixed. Derived the same way: fgToAAMulti(link, [preset-
                                 // btn-bg, preset-btn-hover-bg]) — 5.62:1 / 4.77:1, both clear AA
                                 // (design-uplift Task 13 review round).
};
const DEFAULT_DARK = {
  "btn-fg": "#e6e7ea",          // = --pp-fg, html.dark (popup.css:1044)
  "chip-bg": "#2a3550",         // = --pp-tag-bg, html.dark (popup.css:1057)
  "chip-fg": "#a9c3f2",         // = --pp-tag-fg, html.dark (popup.css:1058)
  "danger-quiet-fg": "#e57373", // = --pp-danger, html.dark (popup.css:1061)
  "on-danger": "#10131a",       // NOT a literal copy: html.dark .confirm-yes today hardcodes
                                 // color:#fff on a background:#c33 (popup.css:2066) that never reads
                                 // --pp-danger, so #fff isn't actually paired with the value this
                                 // token stands in for — and #fff on the REAL --pp-danger dark
                                 // (#e57373) is only 2.99:1, below AA. Derived the same way the
                                 // themed on-danger is: fgToAA(candidate, danger), candidate = the
                                 // surface's own "text on a solid brand fill" choice, --pp-on-accent
                                 // dark (#10131a) — 6.22:1 against #e57373, already clears AA (identity).
  "on-accent": "#10131a",       // = --pp-on-accent, html.dark (popup.css:1102) -- moved here design-
                                 // uplift Task 13 step 2, same reason as DEFAULT_LIGHT's entry above.
};

// mode drives the native-control scheme (scrollbar, number spinner, calendar
// picker etc.) for this theme's own block -- Task 6. Previously a separate
// hand-written selector list in popup.css grouped the 8 dark presets against
// a single `{ color-scheme: dark; }` rule (light presets got no explicit
// declaration and relied on the :root default below); now every block states
// its own scheme directly, one property per theme, no separate list to keep
// in sync when a new preset is added.
function emitPp(ui, mode) {
  const lines = [`  color-scheme: ${mode};`];
  const set = (k, val) => lines.push(`  --pp-${k}: ${val};`);
  for (const k of ["bg", "bg2", "fg", "fg-muted", "fg-hint", "link", "accent", "accent2",
    "border", "divider", "input-bg", "input-focus-bg", "tag-bg", "tag-fg", "tag-hover", "drop-hover",
    "chip-bg", "chip-fg", "btn-fg",
    "banner-bg", "banner-bd", "banner-fg", "warn-bg", "warn-bd", "warn-fg",
    "ok-bg", "ok-bd", "ok-fg", "offline-bg", "offline-bd", "offline-fg",
    "danger", "danger-quiet-fg", "on-danger", "spinner-bg", "spinner-fg", "preset-bg", "preset-bd", "preset-fg",
    "radius-sm", "radius-md", "radius-lg", "radius-tag", "focus-bd", "focus-ring", "on-accent"]) {
    if (ui[k] != null) set(k, ui[k]);
  }
  // info-* are aliases of banner-* (no separate derivation)
  set("info-bg", "var(--pp-banner-bg)");
  set("info-bd", "var(--pp-banner-bd)");
  set("info-fg", "var(--pp-banner-fg)");
  return lines.join("\n");
}

// tokensByPilot: { [pilotSlug]: parsedTokensJson }
export function composePopupThemes(tokensByPilot) {
  const blocks = [];
  for (const entry of POPUP_THEME_MAP) {
    const tk = tokensByPilot[entry.pilot];
    if (!tk) throw new Error(`popup-chrome: missing pilot ${entry.pilot} for ${entry.id}`);
    const merged = entry.useDarkMode && tk.modes?.dark ? mergeTokens(tk, tk.modes.dark) : tk;
    const palette = expandPalette(merged.palette);
    // Pilot-level ui overrides (tokens.json `ui.popup.<mode>`) win over derivation:
    // theme-specific refinements the palette derivation cannot express.
    const derived = deriveUiColors(palette, entry.mode);
    // on-accent is emitted EXPLICITLY for every theme (default: the theme bg,
    // the long-standing submit-button text derivation). It must not fall back
    // through var() to :root's light-surface white: custom properties inherit,
    // so a var(--pp-on-accent, ...) fallback in a shared rule is dead code —
    // the exact mistake that turned every themed submit button white (2026-07).
    // Radius is DERIVED now, not override-only. Before this, --pp-radius-* was
    // emitted solely where a pilot restated it, so 9 of the 13 themes silently
    // fell back to :root's generic 3/8/10 while their site CSS used the pilot's
    // own scale. regularizeUiRadius runs last so an override cannot reintroduce
    // an inversion (paper-ink shipped lg:3px under md:4px).
    const ui = {
      ...derived, "on-accent": derived.bg,
      ...deriveUiRadius(merged.radius),
      ...(tk.ui?.popup?.[entry.mode] ?? {}),
    };
    Object.assign(ui, regularizeUiRadius(ui));
    // Component-layer paired tokens (Task 5, fixed post-review Critical 2/
    // Important 3): computed HERE, from `ui`'s FINAL post-override bg2/
    // drop-hover/tag-bg/tag-fg/danger, not inside deriveUiColors. A pilot's
    // ui.popup.<mode> override can replace any of those roles (flexoki-light
    // overrides tag-bg from the palette's "transparent" to #FAEEC6, for
    // example) -- deriving against the pre-override palette value would
    // guarantee AA for a color that isn't what's actually emitted below.
    const btnBgRgb = hexToRgb(ui.bg2);
    const btnHoverRgb = hexToRgb(ui["drop-hover"]);
    const bgRgb = hexToRgb(ui.bg);
    const dangerRgb = hexToRgb(ui.danger);
    ui["btn-fg"] = rgbToHex(fgToAAMulti(hexToRgb(ui.fg), [btnBgRgb, btnHoverRgb]));
    // panel === bg2 === btn-bg for popup (no dedicated panel role); the 3-bg
    // set is spelled out per COMPONENTS.md §4.3 even though two of the three
    // are numerically identical today.
    ui["danger-quiet-fg"] = rgbToHex(fgToAAMulti(dangerRgb, [bgRgb, btnBgRgb, btnBgRgb]));
    ui["on-danger"] = rgbToHex(fgToAA(hexToRgb(palette["btn-fg"]), dangerRgb));
    // chip-bg carries the tag-bg role's FINAL (post-override) value verbatim;
    // chip-fg is AA-corrected against what that value actually composites to
    // once painted over bg2 (9 of 13 pilots declare tag-bg as the literal
    // "transparent", which resolveOpaqueBg treats as "shows bg2 through").
    // fgToAAMulti, not fgToAA -- same pressable-chip fix as options/library-
    // chrome.mjs (COMPONENTS §5.3, Task 7's contrast-audit chip-fg-vs-btn-hover
    // pair). Identity here: popup's plain fgToAA already cleared both
    // backgrounds on every theme, so this changes zero shipped bytes for popup.
    ui["chip-bg"] = ui["tag-bg"];
    ui["chip-fg"] = rgbToHex(fgToAAMulti(hexToRgb(ui["tag-fg"]), [resolveOpaqueBg(ui["tag-bg"], btnBgRgb), btnHoverRgb]));
    // preset-fg (design-uplift Task 13, USER RULING): deriveUiColors emits it
    // as a raw palette copy (hx("accent")), with no AA guarantee against its
    // own preset-bg -- contrast-audit's orphan guard caught 6/14 themes at
    // 3.0-4.3:1 (modern-card/flexoki-dark/solarized-light/solarized-dark/
    // catppuccin-latte/gruvbox-dark), the exact same "unaudited paired token"
    // class Task 5/7 already fixed for btn-fg/chip-fg. preset-bg is always a
    // plain hex (never "transparent" like tag-bg can be, verified across all
    // 13 pilots), so no resolveOpaqueBg needed. drop-hover is included
    // because .preset-btn:hover swaps its fill to --pp-drop-hover while
    // keeping the same text color (popup.css's generic html[data-theme]
    // .preset-btn:hover rule) -- today preset-bg and drop-hover are the same
    // source value (both hx("accent-soft")) so this is currently a single
    // effective constraint, but fgToAAMulti keeps the derivation correct if a
    // future pilot ui.popup override ever splits them apart.
    const presetBgRgb = hexToRgb(ui["preset-bg"]);
    ui["preset-fg"] = rgbToHex(fgToAAMulti(hexToRgb(ui["preset-fg"]), [presetBgRgb, btnHoverRgb]));
    // spinner-fg (design-uplift Task 13, USER RULING): same raw-copy gap as
    // preset-fg above, but the loading-spinner ring is a non-text UI
    // indicator (WCAG 1.4.11's 3:1 floor, not the 4.5:1 text minimum) --
    // 3/14 blocks measured below 3:1 (flexoki-dark 2.71, solarized-light
    // 2.32, solarized-dark 2.63). spinner-bg is USUALLY a plain hex (border
    // role) but terminal's is an 8-digit alpha hex (#33ff3340, a translucent
    // glow) -- resolveOpaqueBg composites it against bg2 first (same
    // treatment chip-bg's derivation already gives tag-bg's "transparent"
    // case above), since hexToRgb() alone would silently misparse an 8-digit
    // value as a 6-digit one.
    ui["spinner-fg"] = rgbToHex(fgToAA(hexToRgb(ui["spinner-fg"]), resolveOpaqueBg(ui["spinner-bg"], btnBgRgb), 3));
    blocks.push(`html[data-theme="${entry.id}"] {\n${emitPp(ui, entry.mode)}\n}`);
  }
  // `html.dark` here has the SAME selector (so the same specificity, 0,1,0)
  // as the hand-maintained `html.dark {...}` block earlier in popup.css --
  // for any property both declare, source order alone decides, and this one
  // is later. It's a non-issue for the 5 names below (verified via grep:
  // none of them exist anywhere in popup.css before this change). The
  // broader reason `html.dark` and `html[data-theme=X]` never fight each
  // other is NOT about specificity at all: popup-theme-early.js's boot
  // logic is an if/else-if chain that sets `dataset.theme` OR adds the
  // `.dark` class, never both, and its async tail explicitly clears the
  // other (`delete root.dataset.theme; root.classList.remove("dark")`)
  // before re-applying -- the two states are mutually exclusive on <html>
  // by construction, not by cascade math.
  const emitDefault = (obj, scheme) => [`  color-scheme: ${scheme};`, ...Object.entries(obj).map(([k, v]) => `  --pp-${k}: ${v};`)].join("\n");
  blocks.push(`:root {\n${emitDefault(DEFAULT_LIGHT, "light")}\n}`);
  blocks.push(`html.dark {\n${emitDefault(DEFAULT_DARK, "dark")}\n}`);
  return blocks.join("\n");
}
