import { expandPalette } from "./_util.mjs";
import { mergeTokens } from "./compose-theme.mjs";
import { deriveUiColors, deriveUiRadius, regularizeUiRadius, fgToAA, fgToAAMulti, borderToAA, focusBdToAA, fillSeparate, mix, hexToRgb, rgbToHex, resolveOpaqueBg, resolveChipBg } from "./_ui-derive.mjs";
import { POPUP_THEME_MAP } from "./popup-chrome.mjs";

// Accent-over-bg mixes library.css paints behind a row that is SELECTED for a
// batch action (rest, then :hover). Mirrors
// `.vocab-card.selected .notes-card-top` -- see the row-selected-fg comment
// below for why the duplication is deliberate and what catches a drift.
const LIB_BATCH_BAND_MIX = [0.18, 0.24];

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
  // Soft Fill control fills (design-uplift 2026-08-05), moved off their
  // hand-written :root literals for the same reason options' pair was: both
  // were #ffffff, exactly --lib-panel/--lib-pane-bg, so a frameless control
  // in a detail pane had nothing left to see. fillSeparate(fill, [panel,
  // bg], fg) — 1.14:1 vs panel, 1.06:1 vs --lib-bg.
  "btn-bg": "#f0f0f1",
  "btn-border": "#f0f0f1",      // = btn-bg (frame collapsed into the fill).
  "btn-hover": "#e6e9f1",       // NOT a literal copy: the old #eef2f9 is 1.01:1 against the new rest
                                 // fill. fillSeparate(btn-hover, [btn-bg], fg) — 1.07:1.
  "input-bg": "#f0f0f1",
  "input-border": "#f0f0f1",    // = input-bg.
  "border": "#858596",          // NOT a literal copy: the hand-written :root's old #e2e2e6 was only
                                 // 1.29:1 against --lib-btn-bg/--lib-panel (both #fff by default)
                                 // (design-uplift Task 16, USER RULING -- border reads visibly heavier
                                 // now, the intended effect). Derived the same way the themed border
                                 // is: borderToAA(border, [btn-bg, panel]) — 3.18:1 / 3.63:1, clears
                                 // the 3:1 non-text floor. Re-derived 2026-08-05 (was #90909f) because
                                 // Soft Fill darkened btn-bg out from under it — contrast-audit's
                                 // `border vs btn-bg` row caught the stale value at 2.76:1.
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
// `mode` drives the native-control scheme (scrollbar, number spinner, etc.)
// for this theme's own block -- Task 6, library's FIRST color-scheme
// declaration (popup/options already had a hand-written one; library never
// did -- half the root cause of defect 1/4: library's own dark presets left
// native `.btn` text at UA ButtonText resolved against the wrong scheme).
function emitLib(ui, palette, overrides, radius, focus = {}, mode) {
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
    bg: ui.bg, panel: ui.bg2,
    fg, "fg-muted": fgMuted, "fg-hint": ui["fg-hint"],
    accent: ui.accent, link, save, danger, warn,
    border: ui.border, "border-section": ui.divider,
    "input-bg": ui["input-bg"], "input-border": ui.border,
    "btn-bg": ui.bg2, "btn-hover": ui["drop-hover"],
    "code-bg": ui.bg2,
    "pane-bg": ui.bg2,
    "pane-divider": ui.border,
    "row-selected-bg": ui["drop-hover"],
    // Not plain `fg` any more (2026-08-06 selection rebuild). --lib-row-selected-fg
    // is the label colour for BOTH row states now: "current" (--lib-row-selected-bg,
    // which `fg` above already derives against) and "selected for a batch action",
    // whose band is mixed at runtime from accent over bg. Those two live in
    // library.css's hand-written page layer, so the percentages are duplicated
    // here on purpose -- LIB_BATCH_BAND_MIX below and the `color-mix(...)` values
    // in `.vocab-card.selected .notes-card-top` (+ its :hover) must stay in step.
    // Nothing lints that pairing statically; what catches a drift is the render
    // oracle's bandDistinct entry, which measures the label against the band the
    // browser actually painted (it is what found this cliff: solarized's
    // row-selected-fg had 4.71:1 of headroom at the old 10% mix and fell straight
    // through AA at 18%).
    "row-selected-fg": rgbToHex(fgToAAMulti(hexToRgb(fg), [
      rowSelectedBgRgb,
      ...LIB_BATCH_BAND_MIX.map((t) => mix(hexToRgb(ui.bg), hexToRgb(ui.accent), t).map(Math.round)),
    ])),
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
  // Soft Fill separation (design-uplift 2026-08-05, USER RULING) -- runs
  // BEFORE border/btn-fg/chip-fg, which all derive against the button fill.
  // library is the worst case of the three surfaces: --lib-btn-bg is
  // byte-identical to --lib-panel/--lib-pane-bg in ALL 14 blocks (no pilot
  // overrides library's btn-bg), so with the frame collapsed every button in
  // a detail pane would be a rectangle of pane colour on pane colour.
  // Skipped per-role when the pilot restores a real frame (terminal, via
  // ui.library.<mode>["btn-border"]/["input-border"]).
  const ovr = overrides ?? {};
  const fgRgb = hexToRgb(map.fg);
  // Two hosts, and here they genuinely differ: the vocab/notes toolbars sit
  // on --lib-bg, the detail panes on --lib-panel. Separating from panel
  // alone lands modern-card's fill straight on its own page background.
  const hosts = [hexToRgb(map.panel), hexToRgb(map.bg)];
  if (ovr["btn-border"] == null) map["btn-bg"] = rgbToHex(fillSeparate(hexToRgb(map["btn-bg"]), hosts, fgRgb));
  map["btn-border"] = ovr["btn-border"] ?? map["btn-bg"];
  if (ovr["input-border"] == null) map["input-bg"] = rgbToHex(fillSeparate(hexToRgb(map["input-bg"]), hosts, fgRgb));
  map["input-border"] = ovr["input-border"] ?? map["input-bg"];
  const bgRgb = hexToRgb(map.bg);
  const panelRgb = hexToRgb(map.panel);
  const btnBgRgb = hexToRgb(map["btn-bg"]);
  // Hover must stay a perceptible step from the new rest fill (1.01:1 on the
  // default surface otherwise). row-selected-bg deliberately keeps the
  // untouched drop-hover: a selected ROW sits on the panel, not on a button
  // fill, so it is a different constraint and must not drift with this one.
  map["btn-hover"] = rgbToHex(fillSeparate(hexToRgb(map["btn-hover"]), [btnBgRgb], fgRgb));
  const btnHoverRgb = hexToRgb(map["btn-hover"]);
  // Focus edge (design-uplift follow-up 2026-08-06, independent review F1).
  // §7.3's `bordered` placement makes this token the focus indicator's CORE,
  // and Soft Fill collapsed the resting border into the fill (btn-border ==
  // btn-bg, 1.00:1) -- so it is the ONLY thing carrying WCAG 1.4.11's 3:1 for
  // the whole .btn family, every field and every fused shell. Derived against
  // the two fills a focusable control actually wears; worst one wins.
  // Guarded on the MAP, not on `ovr`, because this surface has TWO override
  // sources -- the `focus` argument (popup's pilot block, spread into the map
  // literal above) and ui.library.<mode> -- and either one that already
  // landed must win outright. That is how terminal / paper-ink / solarized
  // keep their bespoke edges here.
  if (map["focus-bd"] == null) {
    map["focus-bd"] = rgbToHex(focusBdToAA(hexToRgb(map.accent), hexToRgb(map["input-bg"]),
      [btnBgRgb, hexToRgb(map["input-bg"])]));
  }
  const dangerRgb = hexToRgb(map.danger);
  // border (design-uplift Task 16, USER RULING): same gap, same
  // resolveOpaqueBg requirement and same options-chrome.mjs rationale --
  // no pilot currently overrides library's btn-bg/panel independently, so
  // the two constraints are numerically identical today but kept separate
  // for COMPONENTS.md §4.3 spec-conformance (same convention as its own
  // danger-quiet-fg 3-bg call above).
  map["border"] = rgbToHex(borderToAA(resolveOpaqueBg(map.border, btnBgRgb), [btnBgRgb, panelRgb]));
  map["btn-fg"] = rgbToHex(fgToAAMulti(hexToRgb(map.fg), [btnBgRgb, btnHoverRgb]));
  map["danger-quiet-fg"] = rgbToHex(fgToAAMulti(dangerRgb, [bgRgb, panelRgb, btnBgRgb]));
  map["on-danger"] = rgbToHex(fgToAA(hexToRgb(palette["btn-fg"]), dangerRgb));
  // library has no tag-bg/tag-fg role of its own -- no pilot's ui.library.<mode>
  // touches it -- so palette.tag-bg/tag-fg is the final value. chip-bg is a
  // real pill fill (not just an AA input like border/danger above), so a
  // "transparent" tag-bg (9/13 pilots) needs resolveChipBg's accent-tint
  // synthesis, not resolveOpaqueBg's bare-panel fallback -- see that
  // function's comment (_ui-derive.mjs) for why bare panel is just as
  // invisible a pill as the literal `transparent` it used to ship
  // (vocab-group-inspect-report.md 2026-08-05 Finding 2). chipBgRgb is
  // reused below for chip-fg's contrast check so both stay derived from the
  // exact same resolved fill.
  // Same separation floor as btn/input above; identity on all 14 blocks
  // today (see options-chrome.mjs's twin comment).
  const chipBgRgb = fillSeparate(resolveChipBg(palette["tag-bg"], hexToRgb(map.accent), panelRgb), [panelRgb], fgRgb);
  map["chip-bg"] = rgbToHex(chipBgRgb);
  // fgToAAMulti, not fgToAA -- same pressable-chip fix as options-chrome.mjs
  // (COMPONENTS §5.3, Task 7's contrast-audit chip-fg-vs-btn-hover pair).
  map["chip-fg"] = rgbToHex(fgToAAMulti(hexToRgb(palette["tag-fg"]), [chipBgRgb, btnHoverRgb]));

  return [`  color-scheme: ${mode};`, ...Object.entries(map).map(([k, v]) => `  --lib-${k}: ${v};`)].join("\n");
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
    blocks.push(`html[data-theme="${entry.id}"] {\n${emitLib(ui, palette, tk.ui?.library?.[entry.mode], merged.radius, focus, entry.mode)}\n}`);
  }
  // Native-control scheme, default surface (no preset selected) -- Task 6.
  // library.html declares `<meta name="color-scheme" content="light dark">`
  // (shares options-theme-early.js's boot logic, which likewise falls back to
  // a themed preset rather than a bare dark default whenever the user
  // prefers dark with no preset picked), so this :root baseline only ever
  // applies on the light default surface -- "light" is the only value it
  // needs. Every dark preset states its own `color-scheme: dark` inside its
  // own html[data-theme] block above (see emitLib).
  const defaultBody = [`  color-scheme: light;`, ...Object.entries(DEFAULT_LIGHT).map(([k, v]) => `  --lib-${k}: ${v};`)].join("\n");
  blocks.push(`:root {\n${defaultBody}\n}`);
  return blocks.join("\n");
}
