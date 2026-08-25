import { expandPalette } from "./_util.mjs";
import { mergeTokens } from "./compose-theme.mjs";
import { deriveUiColors, deriveUiRadius, regularizeUiRadius, fgToAA, fgToAAMulti, borderToAA, focusBdToAA, fillSeparate, hexToRgb, rgbToHex, resolveOpaqueBg } from "./_ui-derive.mjs";

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
  "danger-quiet-fg": "#bd3d3d", // WAS a verbatim copy of --pp-danger default (#c24343); re-derived
                                 // 2026-08-05 because Soft Fill's btn-bg (#eff0f2) is a darker fill
                                 // than the #ffffff this text used to sit on, dropping it to 4.41:1.
                                 // fgToAAMulti(danger, [bg, panel, btn-bg]) — 5.39 / 5.03 / 4.72:1.
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
  "btn-bg": "#eff0f2",          // NOT a literal copy (Soft Fill, design-uplift 2026-08-05): popup had no
                                 // button-fill role at all -- .qbtn/.submit-bar button painted --pp-bg on
                                 // the default surface and --pp-bg2 under every preset, i.e. the same
                                 // token that paints the .quick-actions strip they sit ON. With the
                                 // resting frame gone that is an invisible button. fillSeparate(bg2,
                                 // [bg, bg2], fg) -- 1.14:1 vs --pp-bg, 1.06:1 vs --pp-bg2.
  "btn-bd": "#eff0f2",          // = btn-bg: the resting border collapses INTO the fill (border-width
                                 // kept, zero layout shift). terminal restores a real frame through its
                                 // pilot ui.popup override; nothing else does.
  "btn-hover": "#dee5f2",       // NOT a literal copy: --pp-drop-hover (#e6eefb) is only 1.02:1 against
                                 // the new btn-bg above -- with rest no longer white, the old hover fill
                                 // stopped reading as a change at all. fillSeparate(drop-hover, [btn-bg],
                                 // fg) -- 1.06:1 vs rest, still the same accent-tinted family.
  "input-bd": "#edf0f4",        // = --pp-input-bg (itself nudged to #edf0f4 in :root by the same
                                 // fillSeparate([bg, bg2]) pass) -- the field's resting frame collapses
                                 // into its own fill, same rule as btn-bd. Replaces the hand-written
                                 // `--pp-input-bd: transparent`, which only ever held on the default
                                 // surface: every preset re-armed a full --pp-border frame further down.
  "border": "#7e8aa0",          // NOT a literal copy: the hand-written :root's old #e8eaee was only
                                 // 1.12:1 against --pp-bg2 (design-uplift Task 16, USER RULING --
                                 // border reads visibly heavier now, the intended effect). Derived the
                                 // same way the themed border is:
                                 // borderToAA(border, [btn-bg, panel]) — 3.05:1 / 3.25:1. Re-derived
                                 // 2026-08-05 (was #848fa4 against a btn-bg that was still bg2).
};
// DEFAULT_DARK (the popup's `html.dark` component-layer tokens) is gone:
// since the theme model of 2026-08-25 (batch 2 D6) the popup's no-preset
// dark resolves to the flexoki-dark preset, so nothing sets the `dark` class
// and the block it emitted was dead. The preset's own html[data-theme]
// block carries every one of those roles, derived + audited like any theme.

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
    "border", "divider", "input-bg", "input-bd", "input-focus-bg", "tag-bg", "tag-fg", "tag-hover", "drop-hover",
    "chip-bg", "chip-fg", "btn-bg", "btn-bd", "btn-hover", "btn-fg",
    "banner-bg", "banner-bd", "banner-fg", "warn-bg", "warn-bd", "warn-fg",
    "ok-bg", "ok-bd", "ok-fg", "offline-bg", "offline-bd", "offline-fg",
    "danger", "danger-quiet-fg", "on-danger", "spinner-bg", "spinner-fg", "preset-bg", "preset-fg",
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
    // Soft Fill separation (design-uplift 2026-08-05, USER RULING) -- runs
    // FIRST, because btn-fg/chip-fg/border below all derive against the
    // button fill and must see its final value. popup had no button-fill
    // role: .qbtn/.submit-bar button painted --pp-bg2, the same token that
    // paints the .quick-actions strip they sit on (7 of 14 blocks: 1.00:1).
    // Skipped per-role when the pilot restores a resting frame -- terminal
    // declares ui.popup.dark["btn-bd"]/["input-bd"], and a framed control
    // doesn't need its fill to carry the affordance, so re-tinting it would
    // only cost that theme its identity (its confirmation board measured
    // 0.00% pixel change across all three surfaces).
    const ppO = tk.ui?.popup?.[entry.mode] ?? {};
    const fgRgb = hexToRgb(ui.fg);
    // Two hosts, not one: .submit-bar button sits on --pp-bg, .qbtn and
    // .search-field sit on the --pp-bg2 strip. A fill separated from only
    // one of the two can land straight on the other.
    const ppHosts = [hexToRgb(ui.bg), hexToRgb(ui.bg2)];
    ui["btn-bg"] = ppO["btn-bd"] != null ? ui.bg2 : rgbToHex(fillSeparate(hexToRgb(ui.bg2), ppHosts, fgRgb));
    ui["btn-bd"] = ppO["btn-bd"] ?? ui["btn-bg"];
    ui["input-bg"] = ppO["input-bd"] != null ? ui["input-bg"] : rgbToHex(fillSeparate(hexToRgb(ui["input-bg"]), ppHosts, fgRgb));
    ui["input-bd"] = ppO["input-bd"] ?? ui["input-bg"];
    const btnBgRgb = hexToRgb(ui["btn-bg"]);
    // Hover must stay a perceptible STEP from the new rest fill: on the
    // default surface --pp-drop-hover was only 1.02:1 against it, i.e. a
    // hover that no longer reads as a change. Same separation function, one
    // host (the fill it has to differ from). Identity wherever drop-hover is
    // already far enough away, which is most themed blocks.
    ui["btn-hover"] = rgbToHex(fillSeparate(hexToRgb(ui["drop-hover"]), [btnBgRgb], fgRgb));
    const btnHoverRgb = hexToRgb(ui["btn-hover"]);
    // Focus edge (design-uplift follow-up 2026-08-06, independent review F1).
    // §7.3's `bordered` placement makes this token the focus indicator's CORE,
    // and Soft Fill collapsed the resting border into the fill -- so it is the
    // ONLY thing carrying WCAG 1.4.11's 3:1 for the whole .btn family, every
    // field and every fused shell. Derived against the two fills a focusable
    // control actually wears. A pilot ui.* override still wins outright (that
    // is how terminal / paper-ink / solarized keep their bespoke edges), which
    // is why this is guarded rather than assigned unconditionally.
    if (ppO["focus-bd"] == null) {
      ui["focus-bd"] = rgbToHex(focusBdToAA(hexToRgb(ui.accent),
        hexToRgb(ui["input-focus-bg"] ?? ui["input-bg"]),
        [btnBgRgb, hexToRgb(ui["input-bg"])]));
    }
    const bgRgb = hexToRgb(ui.bg);
    const panelRgb = hexToRgb(ui.bg2);
    const dangerRgb = hexToRgb(ui.danger);
    // border (design-uplift Task 16, USER RULING): raw palette copy has no
    // AA guarantee against its own resting surface -- Task 7 measured
    // 1.0-1.73:1 across all 13 pilots (COMPONENTS.md's border-color row,
    // WCAG 1.4.11's 3:1 non-text floor). resolveOpaqueBg first: terminal's
    // border is a translucent glow (#33ff3340, an 8-digit alpha hex, same
    // shape as its spinner-bg handled below) -- hexToRgb() alone would
    // misparse it as 6-digit. popup still has no dedicated panel role --
    // bg2 IS the panel -- but it is no longer also the button fill (Soft
    // Fill split them above), so these two constraints are genuinely
    // distinct now where they used to be the same number twice.
    ui["border"] = rgbToHex(borderToAA(resolveOpaqueBg(ui.border, btnBgRgb), [btnBgRgb, panelRgb]));
    // preset-bd RETIRED (design-uplift, preset-row Variant A, 2026-08-04):
    // `.preset-btn` is borderless now (COMPONENTS.md Appendix C30), so no
    // rule anywhere reads --pp-preset-bd -- removed from emitPp's key list
    // above rather than left as a defined-but-unconsumed token (the prior
    // state this comment used to document: Task 16's border-weight
    // back-and-forth, unified light-side per USER CHECKPOINT, superseded by
    // the full redesign that removed the border entirely). deriveUiColors
    // (_ui-derive.mjs) still computes ui["preset-bd"] internally -- shared
    // by options/library-chrome.mjs too, not worth a bespoke per-surface
    // return shape just to omit one field nobody reads once popup's own
    // emission list drops it.
    ui["btn-fg"] = rgbToHex(fgToAAMulti(hexToRgb(ui.fg), [btnBgRgb, btnHoverRgb]));
    // bg / panel(=bg2) / btn-bg, per COMPONENTS.md §4.3 -- three genuinely
    // distinct fills since the Soft Fill split.
    ui["danger-quiet-fg"] = rgbToHex(fgToAAMulti(dangerRgb, [bgRgb, panelRgb, btnBgRgb]));
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
    ui["chip-fg"] = rgbToHex(fgToAAMulti(hexToRgb(ui["tag-fg"]), [resolveOpaqueBg(ui["tag-bg"], panelRgb), btnHoverRgb]));
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
  // Default surface = the light baseline only: the popup's no-preset dark is
  // the flexoki-dark preset block above (theme model 2026-08-25, batch 2 D6),
  // the same fallback options-theme-early.js uses for Options / Library.
  const emitDefault = (obj, scheme) => [`  color-scheme: ${scheme};`, ...Object.entries(obj).map(([k, v]) => `  --pp-${k}: ${v};`)].join("\n");
  blocks.push(`:root {\n${emitDefault(DEFAULT_LIGHT, "light")}\n}`);
  return blocks.join("\n");
}
