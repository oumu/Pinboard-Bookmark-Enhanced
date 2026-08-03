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
//   heightEqWith   -- { selector, tolerancePx }: |this element's
//                      getBoundingClientRect().height - the comparison
//                      selector's height| <= tolerancePx. For same-row
//                      alignment (§6.3 `rowRungEq`) -- a single-selector
//                      `expect` key can't express "matches its neighbor",
//                      so this is the one two-selector shape in the
//                      vocabulary. The comparison selector is metadata on
//                      the check, not part of the known-failures key (the
//                      key's `check` segment stays the plain string
//                      "heightEqWith").
//   hitAreaMin     -- getBoundingClientRect() width AND height both >= this
//                      many px (§1.4 `hitAreaMin`). USER RULING: only
//                      icon-only buttons get this hard assertion -- do not
//                      add it to any icon+text button.
//   textContrastMulti -- { ratio, extraBgSelectorVar }: computed `color` vs
//                      BOTH the actual composited background AND the
//                      current surface's `--{ns}-{extraBgSelectorVar}`
//                      token (e.g. "btn-hover"), each >= ratio. For
//                      `[aria-pressed]` chips, whose hover state repaints
//                      onto `--{ns}-btn-hover` instead of their resting
//                      chip-bg (§5.3/§5.4's `fgToAAMulti` pattern -- the
//                      chip's text color has to survive both paints, not
//                      just the one currently on screen). If the token
//                      can't be resolved to a color, the check degrades to
//                      the single actual-background comparison and the
//                      verdict's `note` says so explicitly -- it never
//                      silently drops the second background.
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
  // options has a themed-state override (options.css:1244) that patches
  // every preset -- but the DEFAULT (no-preset) state ALSO passes today,
  // for an unrelated reason: options.css sets `:root { color-scheme: light }`
  // (library has no such declaration -- exactly why library's copy of this
  // bug IS visible and this one mostly isn't), which forces UA ButtonText
  // to resolve near-black unconditionally, and the default background is
  // light, so black-on-light clears AA by coincidence. Measured:
  // `color: rgb(0,0,0)` on `rgb(245,245,240)`, ~19:1, every theme, verified.
  // This entry is a confirmed TRUE NEGATIVE today, not a script bug -- it
  // stays as a regression guard: if Task 9 deletes the html[data-theme]
  // override without adding `color: var(--opt-btn-fg)` in the same commit,
  // themed states go dark and this check starts failing (§1.3).
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
  // .btn-ic's OWN box only ever contains its own svg -- comparing .btn-ic's
  // rect against its svg's rect for iconVCenter is a vacuous assertion
  // (popup.css:137 `.btn-ic { display:inline-flex; align-items:center }`
  // guarantees that child is always centered inside its own parent; the
  // diff is structurally 0 regardless of any real bug). iconContrast is the
  // real check here: color is inherited through the host (.header-ic sets
  // `color: var(--pp-fg-muted)`), so it genuinely exercises the token.
  { surface: "popup", page: "popup.html", selector: ".btn-ic", state: "default",
    expect: { iconContrast: 3 } },
  // The actual defect-5 shape for popup is `.btn-ic`'s `vertical-align:-3px`
  // (popup.css:137) -- a heuristic offset relative to the HOST button's own
  // line box, not to .btn-ic's own interior. That only shows up when
  // measured against the host, and only when the host isn't itself a flex
  // container (a flex host makes `vertical-align` inert on its flex-item
  // children, which is why `.header-ic`/`.qbtn`/`.clear-all-link` -- all
  // `display:flex`+`align-items:center` -- do NOT reproduce it: verified by
  // direct measurement, diff=0px on `.header-ic .btn-ic`). #offline-queue-clear
  // (`.offline-clear`, popup.css:848) has no flex/display override at all,
  // so its `.btn-ic` is positioned purely by the vertical-align hack --
  // measured diff 1.7px against a 1px tolerance, a real, reproducible
  // instance. Needs at least one offline-queue item to be visible
  // (`#offline-queue-bar` is hidden when the queue is empty) -- the runner
  // seeds one and explicitly re-triggers `window.PPOffline.refresh()` after
  // navigation (see scripts/ui-render-audit.mjs's popup setup: the
  // automatic on-load refresh raced the seed and left the bar hidden in
  // this harness on every attempt, a possible product-level race worth a
  // separate look, not something this task fixes).
  { surface: "popup", page: "popup.html", selector: "#offline-queue-clear", state: "default",
    expect: { iconVCenter: 1 } },

  // ---- defect 2: .vocab-batch-bar row height mismatch. The group-name
  // input keeps the md-rung padding (library.css:830 `padding: 4px 8px`)
  // vs. a true row-mate .btn-sm's 2px 8px (COMPONENTS.md §6.3 `rowRungEq`).
  // The comparison target is #vocab-invert-selection, NOT #vocab-add-group:
  // #vocab-add-group/#vocab-remove-group live inside .vocab-group-unit,
  // whose `align-items: stretch` (library.css:1045) already stretches them
  // to match the oversized input -- comparing against them would silently
  // launder the exact bug this check exists to catch. #vocab-invert-selection
  // is a plain .btn.btn-sm sibling in the OUTER .vocab-batch-bar row
  // (align-items:center, no stretch), so it renders at its true height and
  // is the one that actually visibly mismatches the group-input/-step unit.
  // Selectors are the real ids from library.html's markup (library-vocab.js
  // only reads them via $id, it doesn't construct this row). Needs a
  // selected row to reveal the bar (`.vocab-batch-bar.selecting`) -- the
  // runner checks a row's checkbox first for any check using `heightEqWith`.
  { surface: "library", page: "library.html", selector: "#vocab-group-input", state: "default",
    expect: { heightEqWith: { selector: "#vocab-invert-selection", tolerancePx: 1 } } },

  // ---- §1.4 hitAreaMin (USER RULING: icon-only buttons only). ----
  // #vocab-invert-selection is a plain .btn.btn-sm icon-only button in the
  // SAME .vocab-batch-bar row as the defect-2 entry above (library.html:108)
  // -- COMPONENTS.md §1.5 names this exact gap: "sm 阶的 icon-only 按钮命中
  // 区不达标（20px < 24px）". Measured height ~22.5px < 24, a real failure.
  // Needs the same row-selection precondition as the heightEqWith entry
  // above (batch bar hidden until a row is checked).
  { surface: "library", page: "library.html", selector: "#vocab-invert-selection", state: "default",
    expect: { hitAreaMin: 24 } },
  // #library-link is a .header-ic icon-only button (popup.css:168-169:
  // `width:24px; height:24px`) -- exactly on the boundary, a regression
  // guard rather than a currently-failing instance.
  { surface: "popup", page: "popup.html", selector: "#library-link", state: "default",
    expect: { hitAreaMin: 24 } },

  // ---- §5 chip family: a second representative -- a NON-pill (radius-sm)
  // chip, to catch padVMin violations pill-law-2 wouldn't (C9: current
  // `padding: 1px 8px`, no line-height). Also the checklist's one
  // `[aria-pressed]` chip (library.css:934-947 `.vocab-stat-chip`) -- its
  // hover repaints ONLY the background to --lib-btn-hover (text stays
  // --lib-fg-muted throughout), so chip-fg must clear AA against that
  // token too, not just the resting chip-bg (§5.3/§5.4 `fgToAAMulti`). ----
  { surface: "library", page: "library.html", selector: ".vocab-stat-chip", state: "default",
    expect: { padVMin: 2, textContrastMulti: { ratio: 4.5, extraBgSelectorVar: "btn-hover" } } },

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
