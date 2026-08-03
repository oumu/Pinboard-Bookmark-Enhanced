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
// literal for var(--lib-*) finds the identical color already seeded here.
const DEFAULT_LIGHT = {
  "btn-fg": "#000000",          // measured: getComputedStyle(.btn).color on the unthemed default
                                 // page (library.css:119 declares no `color` — this is the browser's
                                 // ButtonText resolution, NOT a guess; see task-5-report.md).
  "danger-quiet-fg": "#c5221f", // = --lib-danger default (library.css:26)
  "on-danger": "#ffffff",       // = .confirm-popover .confirm-yes color: var(--lib-panel, #fff)
                                 // default (library.css:207); already 5.80:1 on --lib-danger default,
                                 // clears AA unmodified.
  "chip-bg": "#e8f1fd",         // = the resolved literal of .vocab-group-chip's own current formula
                                 // (color-mix(--lib-accent 10%, transparent), library.css:1141-1145)
                                 // composited over --lib-panel default (#ffffff) — 10% of --lib-accent
                                 // default (#1a73e8) mixed in.
  "chip-fg": "#1a1a2e",         // = --lib-fg default (.vocab-group-chip's current `color`,
                                 // library.css:1145); fgToAA(fg, chip-bg) is identity at 14.97:1.
};

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
  // Link text sits on both the page bg and the elevated panel/pane surface (the
  // same two-background constraint fg/fg-muted above already enforce) -- a plain
  // fgToAA(accent, oneBg) could clear AA on bg and still fail on panel.
  const link = rgbToHex(fgToAAMulti(hexToRgb(palette.accent), [hexToRgb(ui.bg), hexToRgb(ui.bg2)]));
  const map = {
    bg: ui.bg, panel: ui.bg2, tab: ui.bg2, "tab-active": ui.bg,
    fg, "fg-muted": fgMuted, "fg-hint": ui["fg-hint"],
    accent: ui.accent, link, save, danger, warn,
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

  // Component-layer paired tokens (Task 5, fixed post-review Critical 2/
  // Important 3): computed HERE from the map's FINAL, post-override
  // btn-bg/btn-hover/danger, same fix as options-chrome.mjs. No pilot
  // currently carries a ui.library.<mode> override for these roles, but the
  // map's own `danger` (above) is ALREADY a local re-derivation, not the raw
  // palette value deriveUiColors returns -- computing danger-quiet-fg/
  // on-danger against anything else would be wrong even without an override.
  const bgRgb = hexToRgb(map.bg);
  const panelRgb = hexToRgb(map.panel);
  const btnBgRgb = hexToRgb(map["btn-bg"]);
  const btnHoverRgb = hexToRgb(map["btn-hover"]);
  const dangerRgb = hexToRgb(map.danger);
  map["btn-fg"] = rgbToHex(fgToAAMulti(hexToRgb(map.fg), [btnBgRgb, btnHoverRgb]));
  map["danger-quiet-fg"] = rgbToHex(fgToAAMulti(dangerRgb, [bgRgb, panelRgb, btnBgRgb]));
  map["on-danger"] = rgbToHex(fgToAA(hexToRgb(palette["btn-fg"]), dangerRgb));
  // library has no tag-bg/tag-fg role of its own -- no pilot's ui.library.<mode>
  // touches it -- so palette.tag-bg/tag-fg is the final value. Same
  // transparent/8-digit-alpha guard as options.
  map["chip-bg"] = palette["tag-bg"];
  map["chip-fg"] = rgbToHex(fgToAA(hexToRgb(palette["tag-fg"]), resolveOpaqueBg(palette["tag-bg"], panelRgb)));

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
  const defaultBody = Object.entries(DEFAULT_LIGHT).map(([k, v]) => `  --lib-${k}: ${v};`).join("\n");
  blocks.push(`:root {\n${defaultBody}\n}`);
  return blocks.join("\n");
}
