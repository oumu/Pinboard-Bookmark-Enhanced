import { expandPalette } from "./_util.mjs";
import { mergeTokens } from "./compose-theme.mjs";
import { deriveUiColors, deriveUiRadius, regularizeUiRadius, fgToAA, fgToAAMulti, borderToAA, hexToRgb, rgbToHex, resolveOpaqueBg } from "./_ui-derive.mjs";
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
                                 // (#fafafa at the time this was derived — see the "panel" entry
                                 // below, corrected post-derivation; the 1.4pp panel delta doesn't
                                 // move this flat literal enough to matter) — the same
                                 // color-mix(accent 10%, transparent) formula library's real
                                 // .vocab-group-chip already uses, resolved to a literal hex since
                                 // nothing renders this token yet.
  "chip-fg": "#333333",         // = --opt-fg default (#333), fgToAA(fg, chip-bg) is identity at
                                 // 10.73:1 — already AA-clear against the pale tint above.
  // Task 12 review round 2 (B-class "补角色"): `body`/`.panel` had their own
  // hardcoded, hand-maintained :root defaults that never matched what these
  // two elements actually painted (bg was #fff but body painted #f5f5f0;
  // panel was #fafafa but .panel painted #fff) -- a real pre-existing gap
  // this task closes by moving both into the audited DEFAULT_LIGHT layer
  // with the values that match what ships today, then routing consumption
  // through the bare token instead of a page-local one-off. Corrective
  // ripple to two pre-existing bare/fallback consumers is intentional and
  // logged in COMPONENTS.md Appendix C: .btn.ghost:hover / .btn.danger.ghost
  // :hover's color-mix(fg, --opt-bg) base shifts fff->f5f5f0, and
  // .accordion-header:hover / .preset-preview-section summary's panel-based
  // background shifts fafafa->fff.
  "bg": "#f5f5f0",               // = body's real unthemed background (options.css body rule).
  "panel": "#ffffff",            // = .panel's real unthemed background (options.css .panel rule).
  // --opt-save / --opt-warn had NO default-light value at all (per-theme
  // only) and every unthemed consumer had independently invented its own
  // var(x, literal) fallback text -- three different ad-hoc "warn" ambers
  // and two different "save" greens drifted in from different call sites.
  // Both converge here on github-light's real per-theme value for the same
  // role (so the default surface and one of the 13 presets agree), NOT on a
  // fresh AA derivation against this default bg (#f5f5f0):
  //   save #1a7f37 vs #f5f5f0 = 4.64:1 -- clears 4.5:1.
  //   warn #9a6700 vs #f5f5f0 = 4.45:1 -- does NOT clear 4.5:1.
  // warn is left as-is rather than re-derived: nothing currently gates
  // --opt-warn's contrast (contrast-audit's warn-fg/warn-bg pair targets a
  // different, tinted-fill role options.css doesn't have), and this exact
  // literal is already github-light's real per-theme value (where it DOES
  // clear AA -- 4.57:1 against that theme's own #f6f8fa bg, 4.87:1 against
  // its #ffffff panel; the default surface's #f5f5f0 is a hair darker,
  // which is what drops it under 4.5). Re-deriving a bespoke default-only
  // value would decouple it from its one visible precedent for a policy
  // bar (plain-text AA on the never-audited default surface) this task
  // didn't establish. Flagged here instead of silently claiming AA.
  "save": "#1a7f37",
  "warn": "#9a6700",
  "border": "#8a8a8a",           // NOT a literal copy: the hand-written :root's old #ccc was only
                                  // 1.47:1 against --opt-btn-bg (#f5f5f0) and 1.61:1 against panel
                                  // (#fff) (design-uplift Task 16, USER RULING -- border reads visibly
                                  // heavier now, the intended effect). Derived the same way the themed
                                  // border is: borderToAA(border, [btn-bg, panel]) — 3.16:1 / 3.45:1,
                                  // both clear the 3:1 non-text floor.
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
  // border (design-uplift Task 16, USER RULING): same gap and same
  // resolveOpaqueBg requirement (terminal's translucent #33ff3340) as
  // popup-chrome.mjs's border derivation -- see its comment for the full
  // rationale. Unlike popup, options' btn-bg and panel CAN genuinely
  // differ post-override (dracula/nord-night/flexoki-dark all override
  // options btn-bg without touching panel), so both are real, distinct
  // constraints here, not a duplicated single value.
  map["border"] = rgbToHex(borderToAA(resolveOpaqueBg(map.border, btnBgRgb), [btnBgRgb, panelRgb]));
  map["btn-fg"] = rgbToHex(fgToAAMulti(hexToRgb(map.fg), [btnBgRgb, btnHoverRgb]));
  map["danger-quiet-fg"] = rgbToHex(fgToAAMulti(dangerRgb, [bgRgb, panelRgb, btnBgRgb]));
  map["on-danger"] = rgbToHex(fgToAA(hexToRgb(palette["btn-fg"]), dangerRgb));
  // options has no tag-bg/tag-fg role of its own -- no pilot's ui.options.<mode>
  // touches it -- so palette.tag-bg/tag-fg (post expandPalette) IS the final
  // value. 9 of 13 pilots declare it as the literal "transparent";
  // resolveOpaqueBg composites that (or any other non-hex/8-digit-alpha
  // shape) onto panel instead of feeding hexToRgb() a non-hex string.
  map["chip-bg"] = palette["tag-bg"];
  // fgToAAMulti, not fgToAA: a pressable chip ([aria-pressed]) swaps its
  // hover fill for btn-hover (COMPONENTS §5.3), so chip-fg must clear AA
  // against BOTH backgrounds, same shape as btn-fg above. Plain fgToAA
  // against chip-bg alone left 7/13 themes under 4.5:1 on btn-hover
  // (nord-night 3.62, solarized-dark 3.29, gruvbox-dark 3.16, and three more
  // narrow misses) -- caught by contrast-audit's new chip-fg-vs-btn-hover
  // pair (Task 7), fixed here rather than allowlisted.
  map["chip-fg"] = rgbToHex(fgToAAMulti(hexToRgb(palette["tag-fg"]), [resolveOpaqueBg(palette["tag-bg"], panelRgb), btnHoverRgb]));

  // Returns the computed map alongside the rendered text (not just text):
  // composeOptionsThemes needs map.accent AFTER pilot overrides are applied
  // (below) to source the preset-row swatch dot -- catppuccin-latte and
  // solarized-light both override ui.options.light.accent, so the raw
  // pre-override `ui.accent` a caller might otherwise reach for is NOT what
  // --opt-accent actually resolves to for those two themes.
  return { map, text: [`  color-scheme: ${mode};`, ...Object.entries(map).map(([k, v]) => `  --opt-${k}: ${v};`)].join("\n") };
}

// Button-facing preset key -> which POPUP_THEME_MAP id's FINAL (post-
// override) --opt-accent represents it in the .theme-preset-btn swatch dot
// (design-uplift, preset-row Variant A follow-up, 2026-08-04 USER RULING:
// "每预设独立强调色圆点" -- a real color picker -- is the whole point of
// Variant A; a single shared --opt-accent dot for every button lost it).
// Adaptive umbrellas (flexoki/solarized/catppuccin) render ONE button in
// options.html for BOTH their light/dark variants
// (data-theme="flexoki", not "flexoki-light"), so a representative pick is
// needed -- light chosen for all three, consistently, not "whichever mode
// the page is currently in": the dot is a static identity marker, not a
// live preview, and one fixed rule is simpler to reason about than one that
// flips with the page's own light/dark setting. "" (None) has no pilot and
// is deliberately left out of this map -- its dot falls through to the
// hand-written base rule's plain `var(--opt-accent)` (options.css).
const SWATCH_SOURCE_BY_BUTTON_KEY = {
  flexoki: "flexoki-light",
  solarized: "solarized-light",
  catppuccin: "catppuccin-latte",
  "modern-card": "modern-card",
  "paper-ink": "paper-ink",
  "github-light": "github-light",
  "nord-night": "nord-night",
  terminal: "terminal",
  dracula: "dracula",
  "gruvbox-dark": "gruvbox-dark",
  "rose-pine": "rose-pine",
};

// tokensByPilot: { [pilotSlug]: parsedTokensJson }
export function composeOptionsThemes(tokensByPilot) {
  const blocks = [];
  const accentByThemeId = {};
  for (const entry of POPUP_THEME_MAP) {
    const tk = tokensByPilot[entry.pilot];
    if (!tk) throw new Error(`options-chrome: missing pilot ${entry.pilot} for ${entry.id}`);
    const merged = entry.useDarkMode && tk.modes?.dark ? mergeTokens(tk, tk.modes.dark) : tk;
    const palette = expandPalette(merged.palette);
    const ui = deriveUiColors(palette, entry.mode);
    const { map, text } = emitOpt(ui, palette, tk.ui?.options?.[entry.mode], merged.radius, entry.mode);
    accentByThemeId[entry.id] = map.accent;
    blocks.push(`html[data-theme="${entry.id}"] {\n${text}\n}`);
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
  // Preset-row swatch dots: one rule per button-facing preset key, keyed off
  // the SAME data-theme attribute options.html already puts on each
  // .theme-preset-btn -- no new DOM attribute needed. --variant-swatch is
  // consumed by options.css's hand-written .theme-preset-btn::before rule.
  for (const [buttonKey, themeId] of Object.entries(SWATCH_SOURCE_BY_BUTTON_KEY)) {
    const accent = accentByThemeId[themeId];
    if (!accent) throw new Error(`options-chrome: swatch source theme "${themeId}" (for button "${buttonKey}") missing from POPUP_THEME_MAP`);
    blocks.push(`.theme-preset-btn[data-theme="${buttonKey}"] {\n  --variant-swatch: ${accent};\n}`);
  }
  return blocks.join("\n");
}
