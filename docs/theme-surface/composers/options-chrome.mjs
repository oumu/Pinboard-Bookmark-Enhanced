import { expandPalette } from "./_util.mjs";
import { mergeTokens } from "./compose-theme.mjs";
import { deriveUiColors, deriveUiRadius, regularizeUiRadius, fgToAA, hexToRgb, rgbToHex } from "./_ui-derive.mjs";
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
function emitOpt(ui, palette, overrides, radius) {
  // --opt-save is success-coloured text shown on the panel/bg → make it AA on bg.
  const save = rgbToHex(fgToAA(hexToRgb(palette.success), hexToRgb(palette.bg)));
  const map = {
    bg: ui.bg, panel: ui.bg2, tab: ui.bg2, "tab-active": ui.bg,
    fg: ui.fg, "fg-muted": ui["fg-muted"], "fg-hint": ui["fg-hint"],
    accent: ui.accent, save,
    border: ui.border, "border-section": ui.divider,
    "input-bg": ui["input-bg"], "input-border": ui.border,
    "btn-bg": ui.bg2, "btn-hover": ui["drop-hover"], "btn-fg": ui["btn-fg"],
    "pf-bg": ui.bg2, "code-bg": ui.bg2,
    "danger-quiet-fg": ui["danger-quiet-fg"], "on-danger": ui["on-danger"],
    "chip-bg": ui["chip-bg"], "chip-fg": ui["chip-fg"],
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
  return Object.entries(map).map(([k, v]) => `  --opt-${k}: ${v};`).join("\n");
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
    blocks.push(`html[data-theme="${entry.id}"] {\n${emitOpt(ui, palette, tk.ui?.options?.[entry.mode], merged.radius)}\n}`);
  }
  const defaultBody = Object.entries(DEFAULT_LIGHT).map(([k, v]) => `  --opt-${k}: ${v};`).join("\n");
  blocks.push(`:root {\n${defaultBody}\n}`);
  return blocks.join("\n");
}
