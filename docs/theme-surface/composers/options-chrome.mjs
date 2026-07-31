import { expandPalette } from "./_util.mjs";
import { mergeTokens } from "./compose-theme.mjs";
import { deriveUiColors, deriveUiRadius, regularizeUiRadius, fgToAA, hexToRgb, rgbToHex } from "./_ui-derive.mjs";
import { POPUP_THEME_MAP } from "./popup-chrome.mjs";

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
  return blocks.join("\n");
}
