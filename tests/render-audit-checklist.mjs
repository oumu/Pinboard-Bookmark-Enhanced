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

  // ---- 2026-08-06 selection rebuild (user ruling: "取消用 checkbox 标示单词
  // 被选中，直接用选中项的底色予以区别；注意区别鼠标点击选中（激活详情）和
  // 多项选中进行操作的状态"). With the checkbox gone, "selected for a batch
  // action" and "current, i.e. the row the detail pane is reading" are two
  // accent-tinted fills on the same element -- a token change on any one of
  // 16 themes could quietly collapse them into one look, and nothing else in
  // this oracle looks at two states of the same component at once.
  //
  // A pair passes on a fill gap of >= minDelta OR on a different marker
  // (box-shadow/outline), because both are real separators: on some presets
  // --lib-row-selected-bg and color-mix(accent N%, bg) land close together
  // and the accent edge is what tells them apart, while on others there is
  // no edge and the fill is the whole signal. Asking for both would fail
  // correct designs; asking for neither is the collapse this entry exists to
  // catch.
  //
  // EXCEPT for rest <-> selected, named in fillOnlyPairs. That pair is the
  // user's ruling itself ("use the selected row's BACKGROUND to tell it
  // apart"), so the fill has to carry it -- and it is the one pair where the
  // OR clause disarms the check completely, since `selected` always carries
  // a ring that `rest` does not. Independent review demonstrated it: revert
  // the band from 18% to 10% and the gate stayed green on every theme,
  // because the delta branch was never reached. The number this entry exists
  // to defend was the number it could not see.
  //
  // minTextContrast rides along because the two are one trade-off, not two:
  // the only way to widen a fill gap is to push the fill, and the label sits
  // on that fill. Measuring separation without measuring legibility would
  // reward exactly the wrong fix.
  //
  // All FOUR states are probed, including "selected AND current" -- the runner
  // drives one row through them with the real gestures (Ctrl+click, click,
  // Ctrl+click) rather than looking for four rows at once, which aria-current's
  // exclusivity makes impossible anyway. Every pair is compared, so the
  // combined state cannot silently equal either of its halves either.
  { surface: "library", page: "library.html", selector: "#vocab-list .vocab-card .notes-card-top", state: "rowStates",
    expect: { bandDistinct: { minDelta: 24, minTextContrast: 4.5, textSelector: ".notes-card-head",
      fillOnlyPairs: [["rest", "selected"]] } } },
  // ---- 2026-08-06 narrow-width overflow report: `a.notes-row-open` ran 351px
  // past the vocabulary detail pane's right edge at a 900px viewport and
  // handed the pane a 327px horizontal scroll. Root cause was a bare inline
  // <a> whose max-width / overflow / text-overflow are inert per CSS 2.1
  // while its inherited white-space: nowrap is not -- so the rule read as
  // "clip this" and the browser painted one unbreakable full-width line.
  //
  // The gate is a CLASS SCAN, not a list of the selectors that were caught:
  // an enumerated probe only ever covers what someone already thought of, and
  // this defect was in an element nobody had thought about since the class
  // stopped being used on the notes ROW it was sized for. The widths bracket
  // the 860px narrow-mode threshold on the wide side (the two-pane layout is
  // where a pane can be too small for its contents) up to the point where the
  // reading column stops shrinking. Both panes of the view are scanned in one
  // pass, so a fix that just moves the overflow from the list to the detail
  // still fails. `expected` is 0 -- nothing may escape a pane, ever.
  // The notes list carries the SAME four states and the same grammar (accent
  // fill + ring for "selected", neutral fill + 2px left edge for "current"),
  // so it gets its own entry rather than being assumed covered by the
  // vocabulary one -- the two lists paint on different elements and reach
  // their bands through different rules. This is also the entry that forced
  // the notes list's "current" marker to move from a ring to a left edge:
  // sharing the ring between "current" and "selected" measured 7 units of
  // fill apart on gruvbox-dark, which is not a difference anyone can see.
  // No textSelector: the notes row button IS the text host, and the driver
  // already reads `color` off the probed element in that case -- pointing it
  // at a child would measure the meta chips instead of the highlight text.
  { surface: "library", page: "library.html", selector: ".notes-hit .notes-hit-btn", state: "rowStates",
    expect: { bandDistinct: { minDelta: 24, minTextContrast: 4.5, textSelector: ".notes-hit-text",
      fillOnlyPairs: [["rest", "selected"]] } } },

  // ---- List header, round 2 (user ruling 2026-08-07). Four bare rows, and
  // the one thing that has to hold for all of them is that they run the full
  // width of the list column and end flush with their own last control. The
  // version this replaced failed both ways at once: the filter controls were
  // wrapped in a single non-shrinking flex unit that could only fit whole or
  // drop whole, and the count row handed its slack to an EMPTY status span's
  // `margin-left: auto`, leaving "Select all" stranded mid-row.
  //
  // Two measurements per row, because neither implies the other -- a row can
  // be full width and still end 40px short of its last control, and it can hug
  // its contents while being narrower than the column. Widths bracket the
  // single-pane threshold on both sides so a row that only breaks in one
  // column width cannot hide.
  { surface: "library", page: "library.html", selector: ".vocab-list-pane", state: "headerRowsFlush",
    expect: { headerRowsFlush: { widths: [1680, 1100, 800], tolerancePx: 1, columnSel: ".vocab-list-pane",
      rows: [".vocab-filter-toolbar", ".vocab-filter-row", "#vocab-stats", ".vocab-context-bar"],
      // The ONLY row allowed to be absent, and only because it ships `hidden`
      // and stays that way until the first render has counts. Every other row
      // going display:none is the loudest defect this gate could be asked
      // about, so it is a failure rather than a skip (review F3, 2026-08-07).
      mayVanish: ["#vocab-stats"] } } },

  { surface: "library", page: "library.html", selector: ".vocab-list-pane", state: "paneFit",
    expect: { paneFit: { widths: [900, 960, 1024, 1100, 1200], tolerancePx: 1,
      panes: [".vocab-list-pane", "#vocab-detail-pane"] } } },
  { surface: "library", page: "library.html", selector: ".notes-list-pane", state: "paneFit",
    expect: { paneFit: { widths: [900, 960, 1024, 1100, 1200], tolerancePx: 1,
      panes: [".notes-list-pane", "#notes-detail-pane"] } } },
  // Separate entry, NOT folded into the one above (debt-sweep 2026-08-07):
  // headerRowsFlush only proves "flush single line" >=860px, where the
  // single-pane threshold guarantees room for one. Below it wrapping is
  // explicitly ALLOWED (the F5 fix, 473f324, gave .vocab-filter-row
  // `flex-wrap: wrap` there) -- what still must never happen is the row
  // pushing content past the pane's own box or forcing the pane itself to
  // scroll horizontally, which is exactly what paneFit already measures
  // (pastRightEdge / pastLeftEdge / paneScroll) for every element inside the
  // pane, not just the four named header rows. F5 itself (93px overflow at
  // 320, 53px at 360, caught only because the responsive fixture was for
  // once aligned to real markup) is the simplest counter-example this
  // closes: reintroduce `flex-wrap: nowrap` on `.vocab-filter-row` and
  // paneScroll fires at both widths. `#vocab-detail-pane` is deliberately
  // EXCLUDED from this entry's `panes` (unlike the one above): this is
  // specifically the list-pane's OWN narrow-wrap contract, and needs
  // `resetNarrowDetail` so it measures the list actually showing (see that
  // flag's comment in drivePaneFit) rather than whatever `-detail-` check
  // ran earlier in the same theme's batch and left `body.lib-narrow-detail`
  // set -- the detail pane's OWN narrow-width behavior is a separate,
  // unexamined question this entry does not answer.
  // Selector deliberately distinct from the entry above ("(narrow)" suffix,
  // not a real CSS selector) -- both are state:"paneFit" against the same
  // element, and every paneFit result reports through the SAME literal
  // check-type string ("paneFit", hardcoded in runOneCheck), so surface +
  // theme + selector + state is the only thing keyOf() has left to tell two
  // entries apart. An identical selector here would silently collide known-
  // failures keys with the entry above.
  { surface: "library", page: "library.html", selector: ".vocab-list-pane (narrow)", state: "paneFit",
    expect: { paneFit: { widths: [320, 360], tolerancePx: 1, resetNarrowDetail: true,
      panes: [".vocab-list-pane"] } } },
  // followup3's "not fused into a third cell" ruling for the narrow-screen
  // lookup door (library.css ".vocab-filter-row > .vocab-lookup-narrow")
  // never had a gate (debt-sweep 2026-08-07). 500px: comfortably inside the
  // <860px band where the door is display:inline-flex, and measured (this
  // task) to keep the sort segment and door on one flex line without
  // wrapping at every width down to 320 -- 500 is not a magic number, just a
  // representative point in that always-one-line range.
  { surface: "library", page: "library.html", selector: ".vocab-filter-row", state: "gapMin",
    expect: { gapMin: { width: 500, fromSel: ".vocab-sort-seg", toSel: ".vocab-lookup-narrow", min: 12 } } },

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
  // (popup.css's `.btn-ic { display:inline-flex; align-items:center }` rule
  // guarantees that child is always centered inside its own parent; the
  // diff is structurally 0 regardless of any real bug). iconContrast is the
  // real check here: color is inherited through the host (.header-ic sets
  // `color: var(--pp-fg-muted)`), so it genuinely exercises the token.
  { surface: "popup", page: "popup.html", selector: ".btn-ic", state: "default",
    expect: { iconContrast: 3 } },
  // The defect-5 shape was `.btn-ic`'s `vertical-align:-3px` (popup.css,
  // `.btn-ic`'s own rule) -- a heuristic offset relative to the HOST
  // button's own line box, not to .btn-ic's own interior. That only showed
  // up when measured against the host, and only when the host wasn't itself
  // a flex container (a flex host makes `vertical-align` inert on its
  // flex-item children, which is why `.header-ic`/`.qbtn`/`.clear-all-link`
  // -- all `display:flex`+`align-items:center` -- never reproduced it).
  // `#offline-queue-clear` (`.offline-clear`) was the one member of this
  // link-styled icon-button group that never got the declaration: 1.7px off
  // centre on 15 themes, 2.7px on terminal (COMPONENTS.md's own account of
  // this, popup.css's `.offline-clear` rule cites the same numbers). NOW
  // FIXED (debt-sweep 2026-08-07 re-verified, but the fix itself predates
  // this branch -- popup-buttons battle, `.offline-clear { display:
  // inline-flex; align-items: center }`): re-measured diff is 0.004px, this
  // key is no longer in known-failures.json, and this entry is a live
  // regression guard against the fix regressing, not a description of an
  // open defect. Needs at least one offline-queue item to be visible
  // (`#offline-queue-bar` is hidden when the queue is empty) -- the runner
  // seeds one and explicitly re-triggers `window.PPOffline.refresh()` after
  // navigation (see scripts/ui-render-audit.mjs's popup setup). This was
  // NOT a fixture-only race: root-caused and fixed (debt-sweep 2026-08-07,
  // popup.js) -- `showOfflineQueueStatus()` used to sit after the
  // unsupported-URL early `return`, so it silently never ran at all on any
  // unsupported-URL page (chrome://, about:, file://, a PDF viewer, or the
  // popup's own extension:// URL -- what every direct navigation to
  // popup.html hits, harness included). A real user with items stuck in the
  // offline queue got no indication of them from any tab that wasn't a
  // plain http(s) page, not merely a slow one: empirically confirmed by
  // waiting 2s past the automatic call with no manual refresh -- the bar
  // never appeared. Fixed by moving the call before the early return, next
  // to `setupTabSet()` which already ran unconditionally for the same
  // reason. The manual re-trigger below is now redundant on a patched
  // build but kept as defense in depth for this test's own setup ordering.
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
  // siblings by its row's align-items:stretch, not by its own padding/
  // line-height, so it's the one selector that actually exercises that
  // stretch mechanism rather than just re-testing the select fix a second
  // time. (The stretch used to come from .vocab-filter-selects's unset
  // default; that wrapper was deleted in the 2026-08-07 header rebuild and
  // .vocab-filter-row now declares `align-items: stretch` outright. Same
  // mechanism, and it is still the only entry that tests it.)
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
  // The lookup row moved into the detail panel 2026-08-07; these two entries
  // follow it there. Three controls, so two comparisons -- the field against
  // the button was the pair that was mismatched when this row was first
  // written, and the language <select> is the third leg that a single pair
  // cannot see (it reaches the same height through the row's own stretch, not
  // through its own padding, so it can drift independently).
  { surface: "library", page: "library.html", selector: "#vocab-lookup-input", state: "default",
    expect: { heightEqWith: { selector: "#vocab-lookup-go", tolerancePx: 1 } } },
  { surface: "library", page: "library.html", selector: "#vocab-lookup-lang", state: "default",
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
  // concentricEnds: true (independent review F1, hit-area-debt): the input
  // (first/left) and #vocab-remove-group (last/right) now round their own
  // OUTER corners to nest inside the shell (COMPONENTS.md §9.2 law 2) --
  // #vocab-add-group, the middle cell, still has to be flat on all four.
  // edgeClickable (independent review F2, hit-area-debt): hitAreaMin only
  // reads the ::before pad's COMPUTED box, which stays the same number
  // whether or not the shell's `overflow` actually lets a real pointer
  // event reach it (F1's root cause) -- this asserts a point just past each
  // stepper's own top edge resolves via elementFromPoint to that stepper,
  // not the shell. RED-verified by reverting .vocab-group-unit's overflow
  // to `hidden` (its pre-fix value): fails both points on both cells.
  { surface: "library", page: "library.html", selector: "#vocab-batch-toolbar .vocab-group-unit", state: "default",
    expect: { fusedChildrenFlat: { children: ['input[type="text"]', "#vocab-add-group", "#vocab-remove-group"], concentricEnds: true },
      edgeClickable: { children: ["#vocab-add-group", "#vocab-remove-group"] } } },
  { surface: "library", page: "library.html", selector: "#vocab-batch-toolbar .vocab-group-unit", state: "focusWithin",
    focusTarget: 'input[type="text"]', expect: { fusedFocusRing: true } },
  // Detail-pane twin. Its steppers carry no ids (library-vocab.js:418/428
  // builds them anonymously) so the passengers are addressed positionally,
  // and they are always enabled -- this is where all three tab stops get
  // exercised.
  // Same concentricEnds exception as the batch-bar instance above -- one
  // shared CSS rule (`.vocab-group-unit > input`/`:last-child`), so both
  // DOM copies pick it up identically.
  { surface: "library", page: "library.html", selector: ".vocab-detail-pane .vocab-group-unit", state: "default",
    expect: { fusedChildrenFlat: { children: ['input[type="text"]', ".vocab-group-step:nth-of-type(1)", ".vocab-group-step:nth-of-type(2)"], concentricEnds: true },
      edgeClickable: { children: [".vocab-group-step:nth-of-type(1)", ".vocab-group-step:nth-of-type(2)"] } } },
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
  // concentricEnds: true (independent review F1, hit-area-debt): both cells
  // are shell ends here (only 2 cells total), so both round their own OUTER
  // corners -- #vocab-sort-time's left pair, #vocab-sort-alpha's right pair.
  // edgeClickable (F2): same real-pointer-event assertion as the group unit
  // above. RED-verified by reverting .vocab-sort-seg's overflow to `hidden`.
  { surface: "library", page: "library.html", selector: ".vocab-sort-seg", state: "default",
    expect: { fusedChildrenFlat: { children: ["#vocab-sort-time", "#vocab-sort-alpha"], concentricEnds: true },
      edgeClickable: { children: ["#vocab-sort-time", "#vocab-sort-alpha"] } } },
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
  // The lookup field, added 2026-08-07 by independent review F1. When the row
  // moved into the detail pane it dropped the `notes-toolbar` class, and with
  // it the ENTIRE field recipe -- border, fill, radius, appearance:none AND
  // all three focus rules -- because that recipe is scoped to
  // `.notes-toolbar input[type="search"]`. What shipped was a UA-native search
  // box wearing the platform's own 2px inset bevel and its own focus ring.
  // This one entry gates both halves at once on all 16 themes: `bordered`
  // fails on a UA control (it draws an outline, paints no --lib-focus-ring
  // glow, and never moves its border-color), and a control that has no
  // authored border cannot pass the border-color half either.
  // Why the two heightEqWith entries on this same row did NOT see it: the row
  // is `align-items: stretch`, so the select and the button were stretched to
  // the BROKEN input's height and measured equal to it. Equality held while
  // every member of the row was wrong together -- "漏判的最简单反例" for a
  // pure-geometry gate, and the reason this row needed a materials gate too.
  { surface: "library", page: "library.html", selector: "#vocab-lookup-input", state: "focusWithin",
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
  // `.saved-theme-btn` (debt-sweep 2026-08-07): shares every OTHER rule in
  // its shared-base block with `.theme-preset-btn` -- fill, hover, `.active`
  // ring -- but the :focus-visible line at the top of that block only ever
  // named `.theme-preset-btn`, so the pill fell through to the generic
  // `.btn:focus-visible` (bordered) recipe, which is invisible on a
  // `border: none` pill (only the glow showed, no >=3:1 core -- the same
  // defect shape §7.3 exists to catch). Needs `savedThemes` seeded in
  // storage before the button exists at all; see runSimpleTheme's seed.
  { surface: "options", page: "options.html", selector: ".saved-theme-btn", state: "focusWithin",
    focusTarget: ":scope", expect: { focusRecipe: "borderless" } },

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

  // ---- popup's confirm popover (popup button-family campaign C3a). Until
  // this campaign popup was the only surface where the solid-danger tier was
  // hand-written per layer, and under all 13 presets it was painted from the
  // WARN family instead (`background: var(--pp-warn-fg); color:
  // var(--pp-warn-bg)`). Note what that means for gate design: the warn pair
  // measures 4.5-5.2:1 on every preset, so a contrast assertion could not
  // have caught the original defect and this trio does not pretend to -- the
  // wrong-family bug is caught statically (tests/ui-contract-tests.mjs fails
  // any hand-written rule that paints .confirm-yes). What these three DO
  // catch is the regression that a static text scan cannot see: the popover
  // is assembled by shared.js at click time out of three elements that
  // inherit colour from three different layers, so "is the text actually
  // readable on the card it lands on, in this theme" is only answerable
  // after a real cascade + real composite. .confirm-msg is the one that has
  // never had any gate at all -- it inherits the popover's own `color`,
  // which is --pp-danger by default and --pp-fg under a preset, over
  // --pp-bg; neither pair is in contrast-audit's COMPONENT_PAIR_SPEC.
  // The runner opens the real popover via #logout-link and never confirms
  // (see runSimpleTheme's popup setup). ----
  { surface: "popup", page: "popup.html", selector: ".confirm-popover .confirm-msg", state: "default",
    expect: { textContrast: 4.5 } },
  { surface: "popup", page: "popup.html", selector: ".confirm-popover .confirm-yes", state: "default",
    expect: { textContrast: 4.5 } },
  { surface: "popup", page: "popup.html", selector: ".confirm-popover .confirm-no", state: "default",
    expect: { textContrast: 4.5 } },

  // ---- popup's submit bar, the first two buttons to carry `class="btn"`
  // (campaign C4a). Both had ZERO render coverage before -- scoping found no
  // assertion of any kind on #submit-btn / .del-btn -- which is how a
  // focus-indicator gap survived on the popup's primary action across all 16
  // themes: #submit-btn's own (1,0,0) `border-color: var(--pp-accent)` (and
  // its themed twin at (1,1,1)) out-ranked `.submit-bar button:focus-visible`
  // (0,2,1), so focus produced a glow and no >=3:1 core.
  //
  // `borderless` for #submit-btn is a deliberate placement call, not the
  // family default: §7.3's second question asks whether the resting frame is
  // neutral chrome or semantic, and this one is the same accent as the fill
  // -- it IS the primary-action tier. .del-btn is `bordered` because it takes
  // the .btn family's frame, which Soft Fill collapses into the fill and
  // which therefore costs nothing to re-tint.
  //
  // heightEqWith is the §6.3 rowRungEq for this bar: the two buttons sat at
  // 28px on a hand-written `min-height` before, and the migration drops them
  // to the family's 26px md rung -- pinning them to EACH OTHER (rather than
  // to a literal 26) keeps the assertion about the thing that is actually
  // wrong when it breaks, which is one of them drifting off the rung.
  { surface: "popup", page: "popup.html", selector: "#submit-btn", state: "default",
    expect: { textContrast: 4.5, heightEqWith: { selector: ".del-btn", tolerancePx: 1 } } },
  { surface: "popup", page: "popup.html", selector: "#submit-btn", state: "focusWithin",
    focusTarget: ":scope", expect: { focusRecipe: "borderless" } },
  // #submit-btn's own (1,0,0) base rule (background/border-color/color) used
  // to permanently outrank `.submit-bar button.saved-success` (0,2,1) and its
  // themed twin (debt-sweep 2026-08-07, F8 in the popup-buttons review) --
  // setSubmitState() added the class every save, and the button never
  // repainted on any of the 16 themes; only textContent changed. The fix
  // folds the id into both rules (same shape as the pre-existing
  // `#submit-btn:disabled` exemption above). classState is the first check
  // in this file to drive a state via classList rather than a real
  // interaction -- there is no user gesture that reaches "just saved".
  //
  // `removeClass`/`clearDisabled` (independent review F2/F3, 2026-08-08):
  // the first version of this check only added the target class, which does
  // NOT reproduce setSubmitState()'s actual DOM mutation -- that function
  // always does `classList.remove("loading", "saved-success", "save-error")`
  // + `disabled = false` first. Skipping that meant the "rest" baseline this
  // check reads could be measuring whatever OTHER state the element had been
  // left in by an earlier check, not the idle resting cascade the fix
  // actually has to out-rank -- and with no settle wait, a read taken in the
  // same task as classList.add() could land mid-transition on `.btn`'s own
  // `transition: background ...` instead of at the target value. Both fixed:
  // the DOM mutation now mirrors setSubmitState() exactly (mirror() above),
  // and the read is taken 260ms after the class add (same settle discipline
  // focusWithin uses just below).
  //
  // save-error also gates textContrast now (independent review F1): the
  // rule used to pair --pp-danger with --pp-warn-bg, two roles that were
  // never a designed combination and measured below 4.5:1 on 9/13 presets +
  // default. Fixed to consume --pp-warn-fg/--pp-warn-bg (popup.css, both
  // out of the same pairToAA(destroy, bg, mode) call -- AA-safe by
  // construction, now a registered COMPONENT_PAIR_SPEC row). This entry is
  // what would have actually caught the original bug -- COMPONENT_PAIR_SPEC
  // only proves a NAMED token pair is safe, it has no way to know which
  // rule consumes which tokens; measuring the real rendered button is the
  // only check that traces to the actual CSS selector.
  { surface: "popup", page: "popup.html", selector: "#submit-btn", state: "classState",
    addClass: ["saved-success"], removeClass: ["loading", "saved-success", "save-error"], clearDisabled: true,
    expect: { bgChangedFromRest: true } },
  { surface: "popup", page: "popup.html", selector: "#submit-btn", state: "classState",
    addClass: ["save-error"], removeClass: ["loading", "saved-success", "save-error"], clearDisabled: true,
    expect: { bgChangedFromRest: true, textContrast: 4.5 } },
  { surface: "popup", page: "popup.html", selector: ".del-btn", state: "default",
    expect: { textContrast: 4.5 } },
  { surface: "popup", page: "popup.html", selector: ".del-btn", state: "focusWithin",
    focusTarget: ":scope", expect: { focusRecipe: "bordered" } },

  // .qbtn stays a hand-written "equal-share strip" variant -- three of them
  // divide one 550px row, so the family's `padding: 4px 16px` would fold the
  // row in the longer locales (COMPONENTS.md §0's popup variant table). What
  // it DOES join is the height ladder, via min-height. Pinned to #submit-btn
  // rather than to a literal 26: if this ever breaks, the interesting fact is
  // "the quick row and the submit bar stopped agreeing", not "a number moved"
  // -- and a literal would also have to be re-checked by hand every time the
  // md rung moves. Measured 24.30px before the min-height landed, i.e. 1.7px
  // off #submit-btn's 26 against a 1px tolerance: this entry fails on the
  // pre-ruling geometry, which is the only reason it is worth having.
  { surface: "popup", page: "popup.html", selector: ".qbtn", state: "default",
    expect: { heightEqWith: { selector: "#submit-btn", tolerancePx: 1 } } },
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
// default-light surface (no data-theme attribute). There is no bare-dark
// state on any surface any more: the no-preset+dark combination resolves to
// data-theme="flexoki-dark" on popup, options and library alike
// (popup-theme-early.js / options-theme-early.js, theme model 2026-08-25,
// batch 2 D6), which the "flexoki-dark" entry below already covers; the
// popup's former hand-maintained `html.dark` block was retired with it.
export const THEMES = [
  "",                  // default light -- no data-theme attribute
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
