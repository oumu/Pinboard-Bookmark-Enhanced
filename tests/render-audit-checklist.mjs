// tests/render-audit-checklist.mjs — HAND-WRITTEN oracle. Never generate from
// composers/ui-components.mjs, composers/_ui-derive.mjs, the *-chrome.mjs
// token registries, or the pilots/*.tokens.json recipe sources.
//
// WHY hand-written and not generated: composers/ui-components.mjs (the
// recipe source) and the *-chrome.mjs token registries are exactly what this
// audit exists to check. A checklist mechanically derived FROM them would
// pass by construction -- a bug in the recipe would silently become "the new
// correct answer" instead of a failure. This was a Codex BLOCK verdict during
// the design-uplift SDD review (see docs/theme-surface/COMPONENTS.md's
// consumer table at the top of that file: this file is listed as the single
// source of truth for every geometry/contrast rule tagged `[render]`,
// independent of every generator in this repo). Every entry below was
// written by reading the shipped CSS (library.css / options.css / popup.css)
// and COMPONENTS.md by hand -- not derived, not scraped, not looped over a
// selector list pulled from a generator's output.
//
// Consumed by scripts/ui-render-audit.mjs. A CHECKS entry does NOT carry a
// `theme` field: the runner crosses every entry against every value in
// THEMES below, so "same selector, 16 themes" is a runner-level concern
// (how do we reach a rendered instance), not an oracle-level one (what
// should be true once we're there). The known-failures key format
// (scripts/ui-render-audit.mjs) folds theme back in:
// "<surface>|<theme>|<selector>|<state>|<check>".
//
// expect keys (see docs/theme-surface/COMPONENTS.md for the exact rule
// behind each -- section references in comments below):
//   textContrast   -- computed `color` vs the actual composited ancestor
//                      background, WCAG ratio must be >= this floor (§1.3,
//                      §7.1 "成对消费律")
//   iconContrast   -- computed SVG stroke (inherits `color` via
//                      stroke="currentColor") vs actual background,
//                      ratio must be >= this floor (§2.2, WCAG 1.4.11)
//   iconVCenter    -- |svg boundingRect center Y - host button's content-box
//                      center Y| must be <= this many px (§2.3 `iconVCenter`)
//   padGteRadiusH  -- computed padding-inline (px) >= min(border-radius px,
//                      height/2) -- pill law 2 (§5.1, §5.4 `padGteRadiusH`)
//   padVMin        -- computed padding-block (px) >= this many px --
//                      pill law 3, applies to every chip/badge (§5.1, §5.4)
//
// Selectors below are written against the CURRENT shipped markup (pre-Task
// 9/10 uplift). Task 9/10/12/13 migrate one selector's underlying CSS at a
// time and delete the matching known-failures key as they land -- this file
// itself does not change shape when that happens, only known-failures does.

export const CHECKS = [
  // ---- defect 1/4: .btn declares no `color`; text + currentColor icon fall
  // to the UA ButtonText system color instead of a themed, AA-derived value.
  // library has zero `html[data-theme] .btn` override so ALL 13 presets +
  // the default state are exposed (COMPONENTS.md §1.3). ----
  { surface: "library", page: "library.html", selector: ".vocab-detail-relookup", state: "default",
    expect: { textContrast: 4.5, iconContrast: 3 } },
  { surface: "library", page: "library.html", selector: ".vocab-detail-delete", state: "default",
    expect: { textContrast: 4.5, iconContrast: 3, iconVCenter: 1 } },   // also defect 5
  { surface: "library", page: "library.html", selector: ".notes-detail-delete", state: "default",
    expect: { textContrast: 4.5 } },
  // options has a themed-state override (options.css:1244) that only masks
  // the bug in the DEFAULT (no-preset) state -- this entry is expected to
  // fail only under theme "" until Task 9 deletes that override (§1.3).
  { surface: "options", page: "options.html", selector: ".btn", state: "default",
    expect: { textContrast: 4.5 } },

  // ---- defect 3: .vocab-group-chip is `padding: 0 4px` on a `radius-full`
  // pill -- both pill laws violated (COMPONENTS.md §5.1, §5.4). ----
  { surface: "library", page: "library.html", selector: ".vocab-group-chip", state: "default",
    expect: { textContrast: 4.5, padGteRadiusH: true, padVMin: 2 } },

  // ---- defect 5 (2nd instance): .btn-ic in library only has 4 container-
  // scoped equivalents; every other host (incl. .vocab-detail-speak) falls
  // back to inline-element baseline alignment instead of a centered box
  // (COMPONENTS.md §2.1, §2.4). popup's .btn-ic is in scope for §2's base
  // rule even though popup is exempt from the rest of the button family. ----
  { surface: "library", page: "library.html", selector: ".vocab-detail-speak", state: "default",
    expect: { iconContrast: 3, iconVCenter: 1 } },
  { surface: "popup", page: "popup.html", selector: ".btn-ic", state: "default",
    expect: { iconContrast: 3, iconVCenter: 1 } },

  // ---- §5 chip family: a second representative -- a NON-pill (radius-sm)
  // chip, to catch padVMin violations pill-law-2 wouldn't (C9: current
  // `padding: 1px 8px`, no line-height). ----
  { surface: "library", page: "library.html", selector: ".vocab-stat-chip", state: "default",
    expect: { padVMin: 2 } },

  // ---- §1/§2 button + icon family: representative instances beyond the
  // defect-tagged selectors above, so the button-family assertions have
  // coverage that isn't 100% coincident with the six named defects. ----
  { surface: "library", page: "library.html", selector: ".row-del-x", state: "default",
    expect: { iconContrast: 3 } },
  { surface: "options", page: "options.html", selector: "#export-settings", state: "default",
    expect: { textContrast: 4.5 } },
];

// Hand-copied literal `data-theme` values, verified at authoring time with:
//   grep -o '\[data-theme="[a-z0-9-]*"\]' library.css options.css popup.css
// (all three files emit the identical 14-value set) -- NOT parsed/imported
// at runtime, per the independence rule at the top of this file. This is the
// same umbrella-vs-variant split scripts/qa-drive.mjs:809-826 documents: 8
// fixed presets (dracula/github-light/gruvbox-dark/modern-card/nord-night/
// paper-ink/rose-pine/terminal) + 3 adaptive umbrellas (flexoki/solarized/
// catppuccin), each of which expands to a light+dark variant = 14 real
// data-theme strings. "13 套主题" (CLAUDE.md) counts pilot *files*
// (docs/theme-surface/pilots/*.tokens.json) -- flexoki is ONE pilot file
// with a `modes.dark` block that still renders TWO selectors, so the
// rendered-selector count is 14, not 13; both numbers are correct, they're
// just counting different things. On top of the 14: "" is the undecorated
// default-light surface (no data-theme attribute, no dark class) and
// "popup-dark" is popup's own hand-maintained `html.dark` default (§7.2) --
// options/library have no equivalent bare-dark state of their own: their
// no-preset+dark combination resolves to data-theme="flexoki-dark" via
// PBP_OPTIONS_ADAPTIVE_MAP's fallback (options-theme-early.js), which is
// already covered by the "flexoki-dark" entry below. scripts/ui-render-audit.mjs
// skips "popup-dark" for any surface other than "popup" for exactly this
// reason (testing it there would just re-run "flexoki-dark" under a
// different name).
export const THEMES = [
  "",                  // default light -- no data-theme attribute
  "popup-dark",        // popup's html.dark default (popup surface only)
  "catppuccin-latte", "catppuccin-mocha",
  "dracula",
  "flexoki-light", "flexoki-dark",
  "github-light",
  "gruvbox-dark",
  "modern-card",
  "nord-night",
  "paper-ink",
  "rose-pine",
  "solarized-light", "solarized-dark",
  "terminal",
];
