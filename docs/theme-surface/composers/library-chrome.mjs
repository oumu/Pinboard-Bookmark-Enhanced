import { expandPalette } from "./_util.mjs";
import { mergeTokens } from "./compose-theme.mjs";
import { deriveUiColors, deriveUiRadius, regularizeUiRadius, fgToAA, hexToRgb, rgbToHex, contrast } from "./_ui-derive.mjs";
import { POPUP_THEME_MAP } from "./popup-chrome.mjs";

// Push fg's lightness (hue+sat preserved) until it clears AA against EVERY
// background in `bgs`, not just one. Library text is shared across bg, panel
// AND the selected-row fill (fg doubles as row-selected-fg) — popup/options'
// plain fgToAA(fg, oneBg) can't express a "clears all of these" constraint.
// Same repeated-worst-case technique _util.mjs's on-accent derivation uses.
function fgToAAMulti(fg, bgs, min = 4.5) {
  let cur = fg;
  for (let i = 0; i < 8; i++) {
    let worst = null;
    for (const bg of bgs) {
      const c = contrast(cur, bg);
      if (!worst || c < worst.c) worst = { bg, c };
    }
    if (worst.c >= min) break;
    cur = fgToAA(cur, worst.bg, min);
  }
  return cur;
}

// Map canonical UI colors to --lib-* names for the standalone library page
// (notes + vocabulary). Role set = the options roles plus master-detail
// additions (pane bg/divider, selected-row pair).
//
// `focus` mirrors how popup-chrome.mjs consumes tk.ui.popup.<mode>: no pilot
// carries a dedicated ui.library.<mode>.focus-bd/focus-ring override, so this
// reuses popup's (only 3 pilots declare one — terminal/paper-ink/solarized's
// glow-style box-shadow). Guarded with `!= null` and NOT unconditionally
// spread: deriveUiColors never computes focus-bd/focus-ring itself, so an
// unconditional `ui["focus-bd"]` here would literally emit
// `--lib-focus-bd: undefined;` for every one of the other 11 themes. Themes
// without an override fall through the cascade to library.css's :root
// computed default (same color-mix(--lib-accent) formula), which is the ONLY
// thing that makes --lib-focus-ring resolve for those themes at all.
function emitLib(ui, palette, overrides, radius, focus = {}) {
  const save = rgbToHex(fgToAA(hexToRgb(palette.success), hexToRgb(palette.bg)));
  // Unlike options, no pilot carries ui.library overrides yet, so danger/warn
  // must be derived here or ui-token-coverage fails on themes without them.
  // Verified via `node -e` against expandPalette output: there is no `danger`
  // key — the danger-equivalent role is `destroy` (same source deriveUiColors
  // reads for its own `danger`). There is no warn-equivalent role at all in
  // any of the 13 pilots' palettes, so warn stays a fixed literal for every
  // theme until a pilot declares one.
  const danger = rgbToHex(fgToAA(hexToRgb(palette.destroy || "#d93025"), hexToRgb(ui.bg)));
  const warn = rgbToHex(fgToAA(hexToRgb("#b06000"), hexToRgb(ui.bg)));
  // fg/fg-muted must clear AA against bg, panel AND row-selected-bg (accent-soft) —
  // deriveUiColors only guarantees AA against bg. 7 of 14 themes failed fg-muted
  // vs panel (nord-night, flexoki x2, solarized x2, catppuccin-latte, gruvbox-dark)
  // and 2 also failed fg vs panel / row-selected-fg vs row-selected-bg (solarized
  // x2) before this fix — verified via contrast-audit.mjs.
  const rowSelectedBgRgb = hexToRgb(ui["drop-hover"]);
  const fg = rgbToHex(fgToAAMulti(hexToRgb(ui.fg), [hexToRgb(ui.bg), hexToRgb(ui.bg2), rowSelectedBgRgb]));
  const fgMuted = rgbToHex(fgToAAMulti(hexToRgb(ui["fg-muted"]), [hexToRgb(ui.bg), hexToRgb(ui.bg2)]));
  const map = {
    bg: ui.bg, panel: ui.bg2, tab: ui.bg2, "tab-active": ui.bg,
    fg, "fg-muted": fgMuted, "fg-hint": ui["fg-hint"],
    accent: ui.accent, save, danger, warn,
    border: ui.border, "border-section": ui.divider,
    "input-bg": ui["input-bg"], "input-border": ui.border,
    "btn-bg": ui.bg2, "btn-hover": ui["drop-hover"],
    "code-bg": ui.bg2,
    "pane-bg": ui.bg2,
    "pane-divider": ui.border,
    "row-selected-bg": ui["drop-hover"],
    "row-selected-fg": fg,
    ...(focus["focus-bd"] != null ? { "focus-bd": focus["focus-bd"] } : {}),
    ...(focus["focus-ring"] != null ? { "focus-ring": focus["focus-ring"] } : {}),
    ...deriveUiRadius(radius),
  };
  Object.assign(map, overrides ?? {});
  Object.assign(map, regularizeUiRadius(map));
  return Object.entries(map).map(([k, v]) => `  --lib-${k}: ${v};`).join("\n");
}

// tokensByPilot: { [pilotSlug]: parsedTokensJson }
export function composeLibraryThemes(tokensByPilot) {
  const blocks = [];
  for (const entry of POPUP_THEME_MAP) {
    const tk = tokensByPilot[entry.pilot];
    if (!tk) throw new Error(`library-chrome: missing pilot ${entry.pilot} for ${entry.id}`);
    const merged = entry.useDarkMode && tk.modes?.dark ? mergeTokens(tk, tk.modes.dark) : tk;
    const palette = expandPalette(merged.palette);
    const ui = deriveUiColors(palette, entry.mode);
    const focus = tk.ui?.popup?.[entry.mode] ?? {};
    blocks.push(`html[data-theme="${entry.id}"] {\n${emitLib(ui, palette, tk.ui?.library?.[entry.mode], merged.radius, focus)}\n}`);
  }
  return blocks.join("\n");
}
