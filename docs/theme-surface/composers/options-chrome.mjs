import { expandPalette } from "./_util.mjs";
import { mergeTokens } from "./compose-theme.mjs";
import { deriveUiColors, deriveUiRadius, regularizeUiRadius, fgToAA, fgToAAMulti, hexToRgb, rgbToHex, resolveOpaqueBg } from "./_ui-derive.mjs";
import { POPUP_THEME_MAP } from "./popup-chrome.mjs";

// Default-surface (no preset selected) component-layer baseline — Task 5,
// step ① of the composer color migration. Every value below is copied
// VERBATIM from the CSS literal it stands in for today (btn-fg measured via
// real Chromium rendering — see task-5-report.md), so adding these
// declarations changes nothing currently rendered (nothing consumes these
// 5 names yet — Task 8/9/12/13 do): a later task that swaps a hardcoded
// literal for var(--opt-*) finds the identical color already seeded here.
const DEFAULT_LIGHT = {
  "btn-fg": "#000000",          // measured: getComputedStyle(.btn).color on the unthemed default
                                 // page (options.css:341 declares no `color` — this is the browser's
                                 // ButtonText resolution, NOT a guess; see task-5-report.md).
  "danger-quiet-fg": "#cc0000", // = --opt-danger default #c00 (options.css:74), 6-digit form
  "on-danger": "#ffffff",       // = .confirm-popover .confirm-yes `color` default (options.css:1329);
                                 // already 5.89:1 on --opt-danger default, clears AA unmodified.
  "chip-bg": "#e8edf4",         // options has no existing chip role. Derived, not copied: 10% of
                                 // --opt-accent default (#4477bb) mixed over --opt-panel default
                                 // (#fafafa) — the same color-mix(accent 10%, transparent) formula
                                 // library's real .vocab-group-chip already uses, resolved to a
                                 // literal hex since nothing renders this token yet.
  "chip-fg": "#333333",         // = --opt-fg default (#333), fgToAA(fg, chip-bg) is identity at
                                 // 10.73:1 — already AA-clear against the pale tint above.
};

// Map canonical UI colors (from _ui-derive) + a few options-only roles to --opt-* names.
// `mode` drives the native-control scheme (scrollbar, number spinner, etc.) for
// this theme's own block -- Task 6. Previously a separate hand-written selector
// list in options.css grouped the 8 dark presets against a single
// `{ color-scheme: dark; }` rule; now every block states its own scheme directly.
function emitOpt(ui, palette, overrides, radius, mode) {
  // --opt-save is success-coloured text shown on the panel/bg → make it AA on bg.
  const save = rgbToHex(fgToAA(hexToRgb(palette.success), hexToRgb(palette.bg)));
  const map = {
    bg: ui.bg, panel: ui.bg2, tab: ui.bg2, "tab-active": ui.bg,
    fg: ui.fg, "fg-muted": ui["fg-muted"], "fg-hint": ui["fg-hint"],
    accent: ui.accent, save,
    border: ui.border, "border-section": ui.divider,
    "input-bg": ui["input-bg"], "input-border": ui.border,
    "btn-bg": ui.bg2, "btn-hover": ui["drop-hover"],
    "pf-bg": ui.bg2, "code-bg": ui.bg2,
    // Derived, not override-only: before this, --opt-radius-* was emitted solely
    // where a pilot restated it, so 9 of the 13 themes fell back to :root's
    // generic 3/6/10 while their site CSS used the pilot's own scale.
    ...deriveUiRadius(radius),
  };
  // Pilot-level ui overrides (tokens.json `ui.options.<mode>`) win over the map
  // and may introduce extra roles (e.g. danger, radius-lg).
  Object.assign(map, overrides ?? {});
  // Last word, so an override can pick any scale but cannot reintroduce the
  // sm > md > lg inversion several pilots carry on the site side.
  Object.assign(map, regularizeUiRadius(map));

  // Component-layer paired tokens (Task 5, fixed post-review Critical 2):
  // computed HERE from the map's FINAL, post-override btn-bg/btn-hover/danger
  // -- not at the palette layer inside deriveUiColors. A pilot's
  // ui.options.<mode> override commonly replaces btn-bg/btn-hover/danger
  // (dracula/nord/flexoki-dark/... all do; EVERY pilot supplies `danger`,
  // there is no base-map fallback for it), so deriving against the
  // pre-override palette value would guarantee AA for a color that isn't
  // what's actually painted below.
  const bgRgb = hexToRgb(map.bg);
  const panelRgb = hexToRgb(map.panel);
  const btnBgRgb = hexToRgb(map["btn-bg"]);
  const btnHoverRgb = hexToRgb(map["btn-hover"]);
  const dangerRgb = hexToRgb(map.danger);
  map["btn-fg"] = rgbToHex(fgToAAMulti(hexToRgb(map.fg), [btnBgRgb, btnHoverRgb]));
  map["danger-quiet-fg"] = rgbToHex(fgToAAMulti(dangerRgb, [bgRgb, panelRgb, btnBgRgb]));
  map["on-danger"] = rgbToHex(fgToAA(hexToRgb(palette["btn-fg"]), dangerRgb));
  // options has no tag-bg/tag-fg role of its own -- no pilot's ui.options.<mode>
  // touches it -- so palette.tag-bg/tag-fg (post expandPalette) IS the final
  // value. 9 of 13 pilots declare it as the literal "transparent";
  // resolveOpaqueBg composites that (or any other non-hex/8-digit-alpha
  // shape) onto panel instead of feeding hexToRgb() a non-hex string.
  map["chip-bg"] = palette["tag-bg"];
  map["chip-fg"] = rgbToHex(fgToAA(hexToRgb(palette["tag-fg"]), resolveOpaqueBg(palette["tag-bg"], panelRgb)));

  return [`  color-scheme: ${mode};`, ...Object.entries(map).map(([k, v]) => `  --opt-${k}: ${v};`)].join("\n");
}

// tokensByPilot: { [pilotSlug]: parsedTokensJson }
export function composeOptionsThemes(tokensByPilot) {
  const blocks = [];
  for (const entry of POPUP_THEME_MAP) {
    const tk = tokensByPilot[entry.pilot];
    if (!tk) throw new Error(`options-chrome: missing pilot ${entry.pilot} for ${entry.id}`);
    const merged = entry.useDarkMode && tk.modes?.dark ? mergeTokens(tk, tk.modes.dark) : tk;
    const palette = expandPalette(merged.palette);
    const ui = deriveUiColors(palette, entry.mode);
    blocks.push(`html[data-theme="${entry.id}"] {\n${emitOpt(ui, palette, tk.ui?.options?.[entry.mode], merged.radius, entry.mode)}\n}`);
  }
  // Native-control scheme, default surface (no preset selected) -- Task 6.
  // options.html declares `<meta name="color-scheme" content="light dark">`,
  // so without an explicit declaration here a LIGHT default page on a DARK OS
  // would otherwise keep dark native scrollbars/spinners -- a dark bar down a
  // light page. Every dark preset states its own `color-scheme: dark` inside
  // its own html[data-theme] block above (see emitOpt); this :root baseline
  // only ever applies when no preset is active, which is always the light
  // default surface (options-theme-early.js falls back to the "flexoki-dark"
  // preset, not a bare dark default, whenever the user prefers dark and has
  // no preset picked), so "light" is the only value this baseline needs.
  const defaultBody = [`  color-scheme: light;`, ...Object.entries(DEFAULT_LIGHT).map(([k, v]) => `  --opt-${k}: ${v};`)].join("\n");
  blocks.push(`:root {\n${defaultBody}\n}`);
  return blocks.join("\n");
}
