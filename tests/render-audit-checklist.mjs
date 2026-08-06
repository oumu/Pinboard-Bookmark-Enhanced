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
//   hitAreaMin     -- effective hit-area width AND height both >= this many
//                      px (§1.4 `hitAreaMin`). Includes the §1.5 ::before
//                      hit-area expansion when present (COMPONENTS.md §1.4
//                      always said "含 ::before 扩张" -- scripts/ui-render-
//                      audit.mjs's probeSelector reads
//                      getComputedStyle(el, "::before").width/height, which
//                      Chromium already resolves to the USED pixel size for
//                      an absolutely positioned, inset-constrained pseudo-
//                      element (verified live, never the literal "auto").
//                      Falls back to the host's own getBoundingClientRect()
//                      when there's no ::before or it isn't
//                      position:absolute. USER RULING: only icon-only
//                      buttons get this hard assertion -- do not add it to
//                      any icon+text button. design-uplift final-fix I2:
//                      no CHECKS entries carry this key any more -- the
//                      runner class-scans every icon-only <button> for it
//                      instead (scripts/ui-render-audit.mjs's sweepProbe
//                      family 4, gated the same as everything below through
//                      known-failures), so a new icon-only button is
//                      covered automatically instead of needing a hand-
//                      enumerated entry here.
//   widthLtParent  -- computed width (px) <= parent element's CONTENT-box
//                      width - 8px (NOT border-box: a stretched flex item
//                      fills exactly the parent's content box, which sits
//                      inside the parent's own padding+border -- comparing
//                      against border-box width let those alone eat past
//                      the 8px margin and made the guard unable to ever
//                      fail for its one real target, a review-caught bug in
//                      this check's first version. probeSelector computes
//                      it from the parent's getBoundingClientRect().width
//                      minus its computed padding and border). Regression
//                      guard for chip/badge elements that are flex ITEMS of
//                      a column-direction flex container: a flex item is
//                      always block-level regardless of its own inline-
//                      flex/inline-block display value (CSS Display §2.7),
//                      so the container's default `align-items: stretch`
//                      silently fills it to 100% width unless a real
//                      `width` declaration opts out -- a bug the chip
//                      family's generated recipe can't see (it never
//                      declares `width` either way, by design: pill/chip
//                      geometry is content-sized in every OTHER context
//                      this campaign uses it in). The 8px margin clears
//                      normal text-content width variance while still
//                      catching a full stretch (which reads as == parent
//                      content width, not "close to it").
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
//   colorSchemeMatchesTheme -- true: computed `color-scheme` on <html> must
//                      include "dark" when the active THEMES entry is one of
//                      the 8 dark presets, "light" otherwise (Task 6). The
//                      one check in this file whose pass/fail literally
//                      depends on which THEMES value is active -- every
//                      other check's `expect` is a theme-independent
//                      literal; this one stays theme-independent IN THE
//                      CHECKLIST (`colorSchemeMatchesTheme: true`, no
//                      literal "light"/"dark") and scripts/ui-render-audit.mjs
//                      computes the expected value itself from the THEMES
//                      loop's current theme, same spirit as `heightEqWith`
//                      cross-referencing a second selector rather than a
//                      static number. Proxy for native-control (scrollbar,
//                      number spinner) rendering mode -- the thumb/track
//                      pixels themselves aren't probeable, but `color-scheme`
//                      is what actually drives them (COMPONENTS.md's "成对
//                      消费律" applied to a UA-rendered pair instead of an
//                      author-painted one).
//   textInset      -- { h, v }: for an element with a direct (own, not a
//                      descendant's) non-whitespace text node, the smaller
//                      of its two opposing insets (text bbox to the nearest
//                      element-or-ancestor's border padding-box edge) must
//                      be >= h horizontally, >= v vertically (§7.6). The
//                      border host is found by walking up from the element
//                      (self counts at depth 0) to the nearest ALL-FOUR-
//                      SIDES bordered box, stopping at any scrollable or
//                      single-line-ellipsis boundary in between -- see
//                      scripts/ui-render-audit.mjs's findBorderBoxHost for
//                      the full walk. Task 14: options preset-preview's
//                      `<summary>` text sat flush against its enclosing
//                      `#preset-preview-section`'s border because an id
//                      selector zeroed the summary's own horizontal padding.
//   childContainment -- true: a `<summary>`'s icon/pseudo-element children
//                      (svg, ::before, ::after) must stay inside the
//                      summary's own border-box, +/-1px tolerance (§7.6).
//                      Scoped to `<summary>` only -- ordinary buttons'
//                      `::before` hit-area expansion (§1.5) is SUPPOSED to
//                      paint outside the host's visual box, so this check
//                      would misfire on every one of them if it weren't
//                      disclosure-specific. Task 14: the same zeroed-padding
//                      bug left no room for the ::after chevron's rotated
//                      7x7 bbox, which painted ~1.45px past the border.
//   beforeExists   -- true: the host's ::before pseudo-element actually
//                      renders (non-zero size), not just that `content` is
//                      declared. Reuses --sweep's own measurePseudo helper
//                      (containmentChildren) -- pseudo-elements aren't
//                      document.querySelector-able, so this is the only
//                      layer that can see one at all. design-uplift preset-
//                      row redesign (2026-08-04): the swatch dot that
//                      replaced the old bordered-pill chrome.
//   insetBand      -- { minInsetPx, blockInsetPx, radiusVar }: the element
//                      that PAINTS a list's hover/selected band must be held
//                      at least minInsetPx clear of its container on both
//                      inline sides, blockInsetPx on both block sides, and
//                      carry exactly the radius rung named by radiusVar
//                      (e.g. "radius-md") on THAT theme -- a rung, not a px
//                      floor, because a theme's ladder is authoritative
//                      (gruvbox-dark's md is 2px and that is correct)
//                      (COMPONENTS.md §9 law 3, Soft Fill). One verdict for
//                      both halves on purpose: a rounded band at full bleed
//                      still cuts the container's corners, and an inset
//                      square band still reads as a stripe -- neither half
//                      is a design rule on its own. `actual` reports the
//                      smaller of the two insets; a zero radius fails with
//                      an explicit note instead of passing on the inset
//                      alone. blockInsetPx and minRadiusPx were added
//                      2026-08-05 after the first version passed on an
//                      implementation the user rejected on sight: 4px inline
//                      / 0px block plus a 2px radius satisfied "inset AND
//                      rounded" to the letter while reading as a misaligned
//                      stripe. The gap was in the oracle, not in the run.
//                      radiusVar (not a px number) came out of the same
//                      round: the first repair used minRadiusPx: 4 and
//                      immediately red-flagged gruvbox-dark, whose whole
//                      ladder is 2px by design.
//                      Written against the band-painting element,
//                      which is NOT always the row: library's vocabulary
//                      rows paint --row-bg on .notes-card-top inside
//                      .vocab-card, so the entry names the child.
//   tabChrome      -- { activeUnderline, underlinePx }: a tab is a label plus
//                      a selection edge (§9 law 7). BOTH branches assert "no
//                      shell" (no fill, no radius) -- that is the half that
//                      regressed. activeUnderline:true additionally requires
//                      an opaque bottom border of >= underlinePx (default 2);
//                      false requires none. Two entries, two selectors, one
//                      key -- the runner cannot ask "is this the selected
//                      one", the checklist says which is which.
//   outlineContrast -- N: computed outline-color vs the REAL composited
//                      background the ring paints OVER (bgStack minus the
//                      host's own layer, since outline-offset pushes the
//                      ring outside the host's border box onto its
//                      parent's paint), WCAG 1.4.11 non-text floor (§3.3
//                      `focusRingContrast`, generalized from focus-only to
//                      any rendered ring). design-uplift preset-row
//                      redesign: the 2px accent selection ring that
//                      replaced the old border-drawn check tick.
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

  // ---- COMPONENTS.md §9 law 3 (Soft Fill, inset selection). Both of
  // library's lists paint a hover/selected band; before the uplift the
  // vocabulary one had NEITHER a radius nor an inset (a selected row ran
  // edge to edge and its corners cut the list container's own), and the
  // notes one had the radius but no inset. Written per LIST because the two
  // paint on different elements -- .vocab-card delegates its band to the
  // .notes-card-top child, .notes-hit owns its own -- so a single shared
  // selector could not reach both, and a regression in either list has to
  // fail on its own key rather than hiding behind the other. 4px is the
  // shipped inset; the check reads the band element's own margin, so it
  // measures what is painted rather than what the stylesheet says. ----
  { surface: "library", page: "library.html", selector: ".vocab-card .notes-card-top", state: "default",
    expect: { insetBand: { minInsetPx: 4, blockInsetPx: 2, radiusVar: "radius-md" } } },
  { surface: "library", page: "library.html", selector: ".notes-hit", state: "default",
    expect: { insetBand: { minInsetPx: 4, blockInsetPx: 2, radiusVar: "radius-md" } } },

  // ---- COMPONENTS.md §9 law 7 (real tabs). The header's two tabs used to be
  // buttons in tab clothing -- fill, border, radius-md -- which is what the
  // user called out on the grid. Both states are reachable in the default
  // state (vocabulary is selected on load), so no focus/hover plumbing is
  // needed; two selectors, because "selected" and "unselected" assert
  // opposite things about the underline and the same thing about the shell.
  // insetBand's radiusVar has no counterpart here on purpose: a tab's correct
  // radius is 0, and tabChrome checks that directly. ----
  { surface: "library", page: "library.html", selector: ".lib-tab.active", state: "default",
    expect: { tabChrome: { activeUnderline: true, underlinePx: 2 }, textContrast: 4.5 } },
  { surface: "library", page: "library.html", selector: ".lib-tab:not(.active)", state: "default",
    expect: { tabChrome: { activeUnderline: false }, textContrast: 4.5 } },
  { surface: "library", page: "library.html", selector: ".vocab-detail-delete", state: "default",
    expect: { textContrast: 4.5, iconContrast: 3, iconVCenter: 1 } },   // also defect 5
  { surface: "library", page: "library.html", selector: ".notes-detail-delete", state: "default",
    expect: { textContrast: 4.5 } },

  // ---- defect 6: quiet-tier danger (COMPONENTS.md §4.4 `dangerQuietContrast`
  // -- "hover 态同测"). .vocab-detail-delete/.notes-detail-delete are both
  // `.btn.danger` instances (library-vocab.js:513 / library-notes.js:405);
  // their RESTING textContrast is already covered by the two default-state
  // entries above. This is the hover half: `.btn.danger:hover:not(:disabled)`
  // repaints `background` to `color-mix(danger 8%, btn-bg)` -- a real
  // background change, not just a color-blind pseudo-class toggle -- so
  // danger-quiet-fg's AA margin has to survive that tint too, not just the
  // resting btn-bg it was solved against (Task 5's "hover 底 ... 混入比例
  // ≤10%, 使被审计的配对仍具代表性" tolerance). Uses the `state: "hover"`
  // vocabulary scripts/ui-render-audit.mjs's runOneCheck() drives with a
  // real Playwright page.hover() (dispatches actual pointer events, so the
  // live cascade's own `:hover` match produces the getComputedStyle read --
  // not a class-toggle stand-in). ----
  { surface: "library", page: "library.html", selector: ".vocab-detail-delete", state: "hover",
    expect: { textContrast: 4.5 } },
  { surface: "library", page: "library.html", selector: ".notes-detail-delete", state: "hover",
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
  // ---- defect 3 (2nd instance, options side): the chip family's options
  // target (.tag-gov-kind-badge, Appendix C10) had ZERO render-audit
  // coverage at all -- a real fix-round regression (width stretched to its
  // flex-column parent's full width, see widthLtParent's doc comment above)
  // shipped and no automated check saw it. Needs the "tags" tab active AND
  // a seeded plural tag pair (book/books) before a group -- and its badge --
  // exists to probe; see runSimpleTheme's options-specific branch and the
  // cached_user_tags seed in main(). ----
  { surface: "options", page: "options.html", selector: ".tag-gov-kind-badge", state: "default",
    expect: { textContrast: 4.5, padGteRadiusH: true, padVMin: 2, widthLtParent: true } },

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
  // RE-POINTED 2026-08-05 (COMPONENTS.md §8): the probe used to be
  // #vocab-group-input itself. After the fused-control rebuild the input is
  // 18px and its 1px border lives on the .vocab-group-unit shell instead, so
  // the raw input measures 2px under a .btn-sm by construction -- the CONTROL
  // is still 20px. Measuring the shell keeps the original power (md-rung
  // padding creeping back would push the shell to 24px and fail exactly as
  // before) while measuring the thing the user actually sees line up.
  // .vocab-batch-bar's align-items is center, so the shell renders at its
  // natural height and can't be laundered by a stretch the way the two
  // stepper cells inside it can.
  { surface: "library", page: "library.html", selector: "#vocab-batch-toolbar .vocab-group-unit", state: "default",
    expect: { heightEqWith: { selector: "#vocab-invert-selection", tolerancePx: 1 } } },

  // ---- §1.4 hitAreaMin -- design-uplift final-fix I2 migrated this from
  // two hand-enumerated entries (#vocab-invert-selection, #library-link) to
  // a runner-side class-scan over every icon-only <button>; see the
  // scripts/ui-render-audit.mjs's sweepProbe family-4 comment and the
  // `expect` vocabulary note near the top of this file. ----

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

  // ---- Task 6: color-scheme now comes from composers/{popup,options,
  // library}-chrome.mjs (every html[data-theme] block states its own scheme,
  // :root/html.dark defaults fill the no-preset states) instead of a
  // hand-written selector list. library was the one surface with NO such
  // declaration at all before this task -- half the root cause of defect
  // 1/4 (library's own dark presets left native `.btn` text at UA
  // ButtonText resolved against the wrong scheme; see the options `.btn`
  // entry above for the coincidental-pass mechanism this closes for
  // library too). `html` always matches querySelector, so this runs once
  // per theme with no detail-pane/batch-bar setup needed. ----
  { surface: "library", page: "library.html", selector: "html", state: "default",
    expect: { colorSchemeMatchesTheme: true } },

  // ---- Task 14 (§7.6 textInset/childContainment): options preset-preview
  // summary -- user real-device report, two symptoms of the SAME root cause
  // (an id selector, #preset-preview-section > summary, zeroed the
  // summary's own horizontal padding, beating the bordered box's own class
  // rule regardless of source order). textInset catches the text-glued-to-
  // border half; childContainment catches the ::after chevron's rotated
  // bbox poking past the border with nowhere left to sit. Needs the
  // "appearance" tab active + a site-theme preset picked (scripts/ui-render-
  // audit.mjs's options-specific setup) -- the summary is otherwise
  // reachable but its whole `<details>` is `style="display:none"` until
  // then. ----
  { surface: "options", page: "options.html", selector: "#preset-preview-section > summary", state: "default",
    expect: { textInset: { h: 4, v: 2 }, childContainment: true } },

  // ---- design-uplift, preset-row redesign (user-selected Variant A,
  // 2026-08-04): .theme-preset-btn's swatch dot and selection ring, the two
  // new affordances that replaced the old bordered pill + border-drawn
  // check tick (COMPONENTS.md Appendix C). ".theme-preset-btn.active"
  // matches whichever preset the "appearance" tab click already made active
  // (runSimpleTheme's presetRowChecks branch -- shares the SAME click
  // presetPreviewChecks above needs, no second setup step). beforeExists is
  // a render check, not a contrast-audit.mjs pair-table entry, because a
  // pseudo-element's existence isn't a color relationship at all --
  // ::before is not document.querySelector-able, so this is the only layer
  // that can see it (getComputedStyle(el, "::before") via probeSelector's
  // existing --sweep measurePseudo helper). outlineContrast is a render
  // check rather than a COMPONENT_PAIR_SPEC row for the opposite reason:
  // contrast-audit.mjs only has flat per-theme palette values, no ancestor
  // walk, and the ring's real background is whatever's actually painted
  // behind it at outline-offset:2px (.theme-presets-group has no
  // background of its own, so that's .fg's -- not a fixed role name any
  // static palette lookup could name). Deliberately scoped to just this one
  // selector, not a blanket audit of the many other pre-existing
  // accent-colored outlines elsewhere in options.css/popup.css (out of
  // scope for this change -- see preset-variants-report.md). popup's own
  // .preset-btn::before has no equivalent entry here: the render-audit
  // fixture never seeds `tagPresets`, so #tag-presets never renders in this
  // harness today (a pre-existing gap, not something this task introduced;
  // recorded as a follow-up in preset-variants-report.md rather than fixed
  // here, since it requires the same tabs.query/context.route
  // fixture-tab workaround the read-only screenshot tooling needed). ----
  { surface: "options", page: "options.html", selector: ".theme-preset-btn.active", state: "default",
    expect: { beforeExists: true } },
  { surface: "options", page: "options.html", selector: ".theme-preset-btn.active", state: "default",
    expect: { outlineContrast: 3 } },

  // ---- Task 14 (§6.3 rowRungEq, sweep-discovered): the vocab list's search
  // row. #vocab-search sat 4px shorter than its row-mates -- the select's
  // vertical padding was a bare 6px literal (no --lib-sp-* match) instead of
  // the same var(--lib-sp-1) the search input already used; both share the
  // browser's inherited `line-height: normal` for the same font-size, so
  // equalizing padding alone closed the whole gap. The sort control reaches
  // the SAME height a different way -- it's stretched to match its select
  // siblings by .vocab-filter-selects's default (unset) align-items:stretch,
  // not by its own padding/line-height, so it's the one selector that
  // actually exercises that stretch mechanism rather than just re-testing
  // the select fix a second time.
  // RE-POINTED 2026-08-05 (§8) from #vocab-sort-time to .vocab-sort-seg, for
  // the same reason the group-input entry above moved to its shell: the
  // stretch target is now the SHELL, and its 1px border means the cell
  // inside it settles 2px shorter (23.5 vs the row's 25.5) by construction.
  // The control still measures 25.5 and the stretch mechanism is still what
  // is being tested -- only the element that owns the border moved. Side
  // benefit: the two entries no longer share a keyOf()
  // (surface|theme|selector|state|check), which had been silently collapsing
  // them onto one known-failures key. ----
  { surface: "library", page: "library.html", selector: "#vocab-search", state: "default",
    expect: { heightEqWith: { selector: "#vocab-group-filter", tolerancePx: 1 } } },
  { surface: "library", page: "library.html", selector: ".vocab-sort-seg", state: "default",
    expect: { heightEqWith: { selector: "#vocab-search", tolerancePx: 1 } } },

  // ---- Task 14 (§6.3 rowRungEq, sweep-discovered): the free-lookup bar.
  // #vocab-lookup-go is a bare-icon .btn-sm (COMPONENTS.md §1.5's "dense
  // toolbar" clause) -- opposite resolution direction from the row above:
  // here the field/select come DOWN to the sm-rung formula (mirroring
  // .vocab-batch-bar input[type="text"]'s already-shipped precedent)
  // instead of the button going up to md, since this is a compact
  // single-purpose search tool, not a standalone form field. ----
  { surface: "library", page: "library.html", selector: "#vocab-lookup-input", state: "default",
    expect: { heightEqWith: { selector: "#vocab-lookup-go", tolerancePx: 1 } } },

  // ---- vocab-group-inspect-report.md 2026-08-05 Finding 8: a higher-
  // specificity rule (.vocab-detail-head .notes-meta-chip, narrowed from
  // .vocab-detail-pane .notes-meta-chip in this same fix) used to beat
  // .vocab-group-chip's own line-height:14px regardless of source order
  // whenever the group chip's selector widened enough to be caught by it --
  // the list-row instance (.notes-row-meta, no such override anywhere near
  // it) and the detail-pane instance would then measure different heights
  // for what's visually "the same chip". Both instances render
  // simultaneously in this two-pane master-detail layout for the seeded
  // word (Render QA group), so heightEqWith can compare them directly
  // without extra setup. Selector deliberately starts with "#vocab-list",
  // NOT ".notes-row-meta" (the chip's real immediate wrapper, also shared
  // by the notes view) -- libraryView()'s classifier above keys off the
  // selector's own leading class/id to decide vocab-tab vs notes-tab, and a
  // ".notes-"-prefixed string sends the runner to the WRONG tab even though
  // .vocab-group-chip only ever exists in the vocab one (first version of
  // this entry did exactly that: silent "zero-size / not found" on every
  // theme, not a real regression -- caught before landing). Regression
  // guard, not a currently-failing probe -- both trace to the SAME
  // padVMin/line-height already covered by the .vocab-group-chip entry
  // above; this entry is what would actually catch Finding 8's specific
  // failure mode (the two instances silently drifting apart) if the
  // narrowed selector above is ever re-widened. ----
  { surface: "library", page: "library.html", selector: "#vocab-list .vocab-group-chip", state: "default",
    expect: { heightEqWith: { selector: ".vocab-detail-group-chips .vocab-group-chip", tolerancePx: 1 } } },

  // ---- COMPONENTS.md §8: fused controls (design-uplift 2026-08-05, user
  // checkpoint round 4 -- "同类型的问题肯定不止这一处" after the group row was
  // rejected a third time). Two assertions per rebuilt control:
  //
  //   fusedChildrenFlat  laws 1+3 -- no passenger draws a box of its own (no
  //                      radius, no resting fill, at most the single border
  //                      side that IS the divider), and every divider drawn
  //                      inside one shell agrees on colour and width. This is
  //                      the direct regression guard for what shipped before:
  //                      the input carried --lib-input-border while the two
  //                      .btn steppers carried --lib-border, so the two seams
  //                      inside one 215px control were different colours.
  //   fusedFocusRing     law 2 -- the ring is the SHELL's, it actually
  //                      changes on :focus-within, it grows outward from the
  //                      shell's border box (non-negative outline-offset, or
  //                      a non-inset shadow), and the focused passenger draws
  //                      no outline of its own. One entry per tab stop,
  //                      because each passenger reaches the ring through a
  //                      different rule and a missed `outline: none` on any
  //                      one of them re-creates the reported defect.
  //
  // Both instances of the group unit are covered: the batch bar's (static
  // markup, library.html:112) and the detail pane's (built by
  // library-vocab.js:409). They share one recipe but have historically
  // drifted -- Finding 1 in vocab-group-inspect-report.md was precisely the
  // detail-pane copy never matching a selector the batch-bar copy did. ----
  // Batch-bar instance. focusWithin covers the input only: library-vocab.js
  // :1031/:1037 disable both steppers until a group name has been typed AND
  // (for "-") the selection is already in that group, and a disabled control
  // cannot take focus at all -- §3.1 row 9 exempts :disabled from these
  // assertions anyway. The stepper half of the recipe is asserted on the
  // detail-pane twin below, whose steppers are never disabled; the CSS is
  // one shared rule, so coverage is not lost, only relocated.
  { surface: "library", page: "library.html", selector: "#vocab-batch-toolbar .vocab-group-unit", state: "default",
    expect: { fusedChildrenFlat: { children: ['input[type="text"]', "#vocab-add-group", "#vocab-remove-group"] } } },
  { surface: "library", page: "library.html", selector: "#vocab-batch-toolbar .vocab-group-unit", state: "focusWithin",
    focusTarget: 'input[type="text"]', expect: { fusedFocusRing: true } },
  // Detail-pane twin. Its steppers carry no ids (library-vocab.js:418/428
  // builds them anonymously) so the passengers are addressed positionally,
  // and they are always enabled -- this is where all three tab stops get
  // exercised.
  { surface: "library", page: "library.html", selector: ".vocab-detail-pane .vocab-group-unit", state: "default",
    expect: { fusedChildrenFlat: { children: ['input[type="text"]', ".vocab-group-step:nth-of-type(1)", ".vocab-group-step:nth-of-type(2)"] } } },
  { surface: "library", page: "library.html", selector: ".vocab-detail-pane .vocab-group-unit", state: "focusWithin",
    focusTarget: 'input[type="text"]', expect: { fusedFocusRing: true } },
  // The two steppers moved to fusedSegmentRing for the same reason the sort
  // cells did: the shell's ring is now scoped to the TEXT INPUT, so tabbing
  // to a stepper must light the cell and leave the shell alone. Keeping the
  // input on fusedFocusRing is the point of the split -- a text field's focus
  // belongs on the frame around it, a button cell's belongs inside the cell,
  // and asserting both shapes from one unit is what proves the scoping
  // actually discriminates instead of just having been switched off.
  { surface: "library", page: "library.html", selector: ".vocab-detail-pane .vocab-group-unit", state: "focusWithin",
    focusTarget: ".vocab-group-step:nth-of-type(1)", expect: { fusedSegmentRing: true } },
  { surface: "library", page: "library.html", selector: ".vocab-detail-pane .vocab-group-unit", state: "focusWithin",
    focusTarget: ".vocab-group-step:nth-of-type(2)", expect: { fusedSegmentRing: true } },
  // Sort segment: the same law in its button flavour (§7.3's outline recipe
  // on the shell rather than the field's box-shadow, because nothing here
  // takes text entry). Its pre-fix divider colour was driven by aria-pressed,
  // so fusedChildrenFlat's "dividers agree" clause is the live guard against
  // a state re-colouring the seam.
  { surface: "library", page: "library.html", selector: ".vocab-sort-seg", state: "default",
    expect: { fusedChildrenFlat: { children: ["#vocab-sort-time", "#vocab-sort-alpha"] } } },
  // 2026-08-06: these two flipped from fusedFocusRing to fusedSegmentRing.
  // The shell ring is GONE by ruling, and the expectation had to move with
  // it -- a check still demanding "the shell shows an indicator" would have
  // failed the fix. What replaces it is not weaker: fusedSegmentRing asserts
  // BOTH that the shell stayed inert AND that the focused cell drew an inset
  // ring, so neither of the two reported defects (a box lighting up on plain
  // mouse-down; two stacked rectangles on Tab) can come back unnoticed.
  { surface: "library", page: "library.html", selector: ".vocab-sort-seg", state: "focusWithin",
    focusTarget: "#vocab-sort-time", expect: { fusedSegmentRing: true } },
  { surface: "library", page: "library.html", selector: ".vocab-sort-seg", state: "focusWithin",
    focusTarget: "#vocab-sort-alpha", expect: { fusedSegmentRing: true } },
  // ---- COMPONENTS.md §8 law 6: rest <-> focus state stability (user
  // checkpoint round 5: "底色变白、眼睛图标偏移、眼睛段看着独立不融合").
  // Focus may change border-COLOUR and add a ring. It may not move anything,
  // repaint any background, or shift the trailing icon -- measured on the
  // shell AND on each named segment, in both passes, through the same probe.
  // `fusedStateStableChildren` names the segments because the shell's own
  // rect staying put says nothing about a segment inside it moving. ----
  { surface: "library", page: "library.html", selector: ".vocab-detail-pane .vocab-group-unit", state: "focusWithin",
    focusTarget: 'input[type="text"]',
    expect: { fusedStateStable: true,
      fusedStateStableChildren: ['input[type="text"]', ".vocab-group-step:nth-of-type(1)", ".vocab-group-step:nth-of-type(2)"] } },
  { surface: "library", page: "library.html", selector: ".vocab-detail-pane .vocab-group-unit", state: "focusWithin",
    focusTarget: ".vocab-group-step:nth-of-type(1)",
    expect: { fusedStateStable: true,
      fusedStateStableChildren: ['input[type="text"]', ".vocab-group-step:nth-of-type(1)", ".vocab-group-step:nth-of-type(2)"] } },
  { surface: "library", page: "library.html", selector: ".vocab-sort-seg", state: "focusWithin",
    focusTarget: "#vocab-sort-alpha",
    expect: { fusedStateStable: true, fusedStateStableChildren: ["#vocab-sort-time", "#vocab-sort-alpha"] } },
  { surface: "options", page: "options.html", selector: ".key-wrap", state: "focusWithin",
    focusTarget: ".key-toggle",
    expect: { fusedStateStable: true, fusedStateStableChildren: ["input", ".key-toggle"] } },
  { surface: "options", page: "options.html", selector: ".key-wrap", state: "focusWithin",
    focusTarget: "input",
    expect: { fusedStateStable: true, fusedStateStableChildren: ["input", ".key-toggle"] } },

  // NOTE: popup's plain inputs (#title-input, #search-input) are gated
  // statically in tests/ui-contract-tests.mjs, not here. They live in
  // #main-section, which popup.js only un-hides after resolving the active
  // tab's bookmark state -- something this fixture (a normal page, no
  // meaningful active tab) cannot produce, so a render entry here fails at
  // setup rather than measuring anything. Same reason .secret-field and
  // .tags-input-wrap are static-gated; the four surfaces that CAN render
  // their fused controls are all gated live above.

  // ---- COMPONENTS.md §7.3: focus-ring recipe conformance (2026-08-05
  // sweep). One entry per converged site. The two sites that need heavy
  // setup to render at all -- .theme-name-popover (only exists after the
  // disabled #save-custom-theme is enabled and clicked) and popup's
  // .regen-link (popup-ai.js only creates it after an AI response) -- are
  // gated statically in tests/ui-contract-tests.mjs instead: a text-level
  // contract there beats a render entry whose setup is longer than the rule
  // it guards. ----
  // A <select> is an input-class field; this one used to stack a 2px
  // button-style outline on top of the field recipe's focus border, putting
  // two focus languages side by side in one toolbar row.
  { surface: "library", page: "library.html", selector: "#vocab-group-filter", state: "focusWithin",
    focusTarget: ":scope", expect: { focusRecipe: "bordered" } },
  // `borderless` (1px accent core + --{ns}-focus-ring glow) on the two
  // full-width row families. Nothing here asserts a shadow LITERAL: the glow
  // is per-theme identity (terminal blur / paper-ink flat 1px / solarized
  // translucent 2px) and the runner only requires that a non-inset shadow
  // exists and differs from the unfocused baseline -- true on all 16 themes,
  // false the moment the rule stops firing.
  { surface: "options", page: "options.html", selector: ".tab-btn", state: "focusWithin",
    focusTarget: ":scope", expect: { focusRecipe: "borderless" } },
  // .lib-tab carried TWO same-specificity :focus-visible rules until
  // 2026-08-06; the later one won `outline` while the earlier still supplied
  // `box-shadow`, so what shipped was a hard 2px rectangle sitting inside the
  // soft glow -- neither placement, and invisible to any check that only
  // asked "is there a ring". This entry measures the composed result.
  { surface: "library", page: "library.html", selector: ".lib-tab", state: "focusWithin",
    focusTarget: ":scope", expect: { focusRecipe: "borderless" } },
  // `bordered` on the generated .btn family itself -- the one entry that
  // proves the recipe reaches a real button through the live cascade on all
  // 16 themes, including that `border-color` actually lands (a themed rest
  // rule out-ranking the focus rule is the failure mode this catches, and it
  // is exactly what popup's 5 bordered sites needed twins for).
  { surface: "library", page: "library.html", selector: ".vocab-detail-relookup", state: "focusWithin",
    focusTarget: ":scope", expect: { focusRecipe: "bordered" } },
  // `inset` on a list row. Outline-only by contract: .notes-hit[aria-current]
  // already paints `box-shadow: inset 0 0 0 1px` as its "you are here" edge,
  // and a focus shadow at the same specificity would replace it rather than
  // stack, silently deleting the selection cue while focused.
  { surface: "library", page: "library.html", selector: ".notes-hit-btn", state: "focusWithin",
    focusTarget: ":scope", expect: { focusRecipe: "inset" } },
  // popup's `bordered` sites (design-uplift follow-up 2026-08-06, independent
  // review F2). These two are the reason this surface needed per-theme focus
  // twins at all: popup carries a hand-written themed override layer whose
  // RESTING rules (html[data-theme] .qbtn, html.dark .md-strip-btn, ...) set
  // border-color at HIGHER specificity than the base :focus-visible rule, so
  // the border half of the recipe rendered only on the default surface and
  // vanished under all 13 presets. The `bordered` check asserts border-color
  // actually CHANGED on focus, which is precisely the failure mode -- and it
  // asserts it per theme, which a static text contract cannot. Before this,
  // popup had zero focusRecipe entries and the C45 fix was gated by nothing
  // but the author's own specificity arithmetic.
  { surface: "popup", page: "popup.html", selector: ".qbtn", state: "focusWithin",
    focusTarget: ":scope", expect: { focusRecipe: "bordered" } },
  { surface: "popup", page: "popup.html", selector: ".md-strip-btn", state: "focusWithin",
    focusTarget: ":scope", expect: { focusRecipe: "bordered" } },
  // `inset` CARRIED for a passenger: the vocab row's ring is drawn on
  // .notes-card-top, not on the .notes-card-head button that actually takes
  // focus -- the head spans only the first of the row's three grid columns,
  // so its old ring stopped mid-row and ran under .row-del-x. Because the
  // focus target differs from the probed element, the runner additionally
  // requires the head to draw nothing of its own (no double ring).
  { surface: "library", page: "library.html", selector: ".vocab-card .notes-card-top", state: "focusWithin",
    focusTarget: ".notes-card-head", expect: { focusRecipe: "inset" } },

  // The two steppers now paint --lib-fg on --lib-input-bg instead of
  // --lib-btn-fg on --lib-btn-bg. fg-vs-input-bg is a COMPONENTS.md §6.2
  // derivation requirement but is NOT in contrast-audit's
  // COMPONENT_PAIR_SPEC, so this render entry is the only gate on it -- and
  // it covers all 16 themes rather than one token pair.
  // (Deliberately the detail-pane pair, not #vocab-add-group/#vocab-remove-
  // group: the batch bar's two steppers render :disabled on an untouched
  // page, and the runner correctly SKIPs contrast on disabled controls --
  // pointing this at them would have produced 16 silent SKIPs dressed up as
  // coverage.)
  // iconVCenter (round 5): these two measured 2.00px ABOVE centre because
  // shared.js:112's setBtnIcon always appends an empty label span, which
  // under the old `display: inline-grid` became a second grid row
  // (grid-template-rows: 14px 0px) and re-centred the icon across both. The
  // batch-bar copies come from static single-child HTML and never showed it
  // -- same CSS, different DOM -- so only an assertion on the JS-BUILT pair
  // can catch a regression here.
  { surface: "library", page: "library.html", selector: ".vocab-detail-pane .vocab-group-step:nth-of-type(1)", state: "default",
    expect: { iconContrast: 3, iconVCenter: 1 } },
  { surface: "library", page: "library.html", selector: ".vocab-detail-pane .vocab-group-step:nth-of-type(2)", state: "default",
    expect: { iconContrast: 3, iconVCenter: 1 } },
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
