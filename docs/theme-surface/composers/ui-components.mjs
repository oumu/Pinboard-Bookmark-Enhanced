// docs/theme-surface/composers/ui-components.mjs
//
// SINGLE SOURCE for the `@generated:ui-components` region's structural CSS
// recipes (button/chip/danger/form-field geometry + state feedback) and the
// spacing adapter that maps px semantics onto each surface's --{ns}-sp-*
// scale. Authority: docs/theme-surface/COMPONENTS.md — every recipe here is
// a direct transcription of that doc's fenced ```css blocks, parameterized
// by `ns` ("pp" | "opt" | "lib").
//
// tools/recipe-lint.mjs statically checks this file (both its literal
// source text and its rendered output). tests/render-audit-checklist.mjs is
// a SEPARATE, hand-written render oracle — never generate it from this file
// (see that file's own header for why: a checklist mechanically derived
// from the recipe would pass by construction and couldn't catch a recipe
// bug).
//
// Task 8 scope: this file is complete and fully checked by recipe-lint, but
// tools/apply-ui-themes.mjs's three new SURFACES entries call
// renderComponents(ns, []) — i.e. no families active — so the three CSS
// files' @generated:ui-components regions stay empty (placeholder comment
// only) after this lands. Task 9 flips families on one at a time by editing
// ACTIVE_COMPONENT_FAMILIES in apply-ui-themes.mjs, deleting the
// hand-written rules each family supersedes in the same commit.

// -----------------------------------------------------------------------
// Spacing adapter (COMPONENTS.md "记号约定"): recipes declare padding/gap in
// px semantics; this maps each px value to the surface token of EQUAL
// numeric value. Never translate --sp-N *names* across surfaces — the three
// scales don't line up rung-for-rung (popup/options are 7-step 2/4/6/8/12/
// 16/24, library is 5-step 4/8/12/16/24). A px value with no matching rung
// on a given surface falls back to a literal px (library has no 2 or 6
// rung).
export const SPACING = {
  pp: {
    2: "var(--pp-sp-1)", 4: "var(--pp-sp-2)", 6: "var(--pp-sp-3)",
    8: "var(--pp-sp-4)", 12: "var(--pp-sp-5)", 16: "var(--pp-sp-6)", 24: "var(--pp-sp-7)",
  },
  opt: {
    2: "var(--opt-sp-1)", 4: "var(--opt-sp-2)", 6: "var(--opt-sp-3)",
    8: "var(--opt-sp-4)", 12: "var(--opt-sp-5)", 16: "var(--opt-sp-6)", 24: "var(--opt-sp-7)",
  },
  lib: {
    4: "var(--lib-sp-1)", 8: "var(--lib-sp-2)", 12: "var(--lib-sp-3)",
    16: "var(--lib-sp-4)", 24: "var(--lib-sp-5)",
  },
};
export const sp = (ns, px) => SPACING[ns][px] ?? `${px}px`;

// Per-surface token NAME differences for the same role. popup spells the two
// control-frame roles with a `-bd` suffix (--pp-btn-bd / --pp-input-bd) --
// COMPONENTS.md §9.1 law 1 states this explicitly ("popup 用自己的 -bd 后缀"),
// and those are the names popup-chrome.mjs emits per theme. A recipe that
// spelled `--pp-btn-border` would reference a token no theme defines: not a
// silent wrong colour but a hard ui-token-coverage failure, which is the good
// outcome -- still, the recipe has to ask for the name that exists. Roles with
// no entry here fall through unchanged.
const TOKEN_ALIAS = {
  pp: { "btn-border": "btn-bd", "input-border": "input-bd" },
  opt: {},
  lib: {},
};
const v = (ns, role) => `var(--${ns}-${TOKEN_ALIAS[ns][role] ?? role})`;

// Motion token per surface (COMPONENTS.md "记号约定": options/library share
// --motion-state, popup has its own --pp-motion-state).
const MOTION = { pp: "var(--pp-motion-state)", opt: "var(--motion-state)", lib: "var(--motion-state)" };
const motion = ns => MOTION[ns];

// -----------------------------------------------------------------------
// Tiny rule-group builder. A "rule" is one CSS block; recipes group related
// rules (base + :hover/:active/:focus-visible/:disabled + chrome variants
// like .ghost) so tools/recipe-lint.mjs can enforce COMPONENTS.md §7.1's
// "paired consumption law" (any rule declaring background/background-color
// must have a color declaration to pair with) without re-deriving CSS
// cascade/specificity from scratch. `pairColorWith` is set explicitly (not
// inferred from the selector string) when a rule's color legitimately comes
// from a DIFFERENT rule in the same recipe that the same element also
// matches (e.g. .btn.ghost has no color of its own — it inherits .btn's).
function rule(selector, decls, { pairColorWith = null } = {}) {
  return { selector, decls, pairColorWith };
}
function stringifyRule({ selector, decls }) {
  const body = decls.map(([prop, value]) => `  ${prop}: ${value};`).join("\n");
  return `${selector} {\n${body}\n}`;
}
function stringifyRules(rules) {
  return rules.map(stringifyRule).join("\n");
}

// -----------------------------------------------------------------------
// §1 + §3: button family (structural geometry + state-feedback recipe,
// COMPONENTS.md §1.2/§1.3/§3.2 — the two sections share one recipe, §3.2
// says so explicitly).
//
// popup joined this family in the popup button-family campaign (C4a),
// retiring §0's "popup 没有 .btn 族" exemption. It is emitted for pp exactly
// as for the other two -- the exemption was about popup having six one-off
// button recipes with no shared class, not about popup wanting a different
// geometry. What is NOT claimed here: adding the class to a given popup
// button is a per-button migration with its own layout consequences, so the
// hand-written recipes that have not been migrated yet keep their own rules
// and simply never match `.btn`.
function btnRules(ns) {
  return [
    rule(".btn", [
      ["display", "inline-flex"],
      ["align-items", "center"],
      ["justify-content", "center"],
      ["gap", sp(ns, 4)],
      ["padding", `${sp(ns, 4)} ${sp(ns, 16)}`],
      ["font-size", "12px"],
      ["line-height", "16px"],
      ["font-family", "inherit"],
      ["cursor", "pointer"],
      // Soft Fill (COMPONENTS.md §9 law 1): the resting border-color collapses INTO
      // the fill. --{ns}-btn-border IS --{ns}-btn-bg for every theme except
      // the ones whose pilot restores a real frame (terminal). border-width
      // stays 1px so the collapse costs zero layout shift, and :hover /
      // :focus-visible / .danger still paint a real edge on top of it.
      ["border", `1px solid ${v(ns, "btn-border")}`],
      ["border-radius", `var(--${ns}-radius-md)`],
      ["background", `var(--${ns}-btn-bg)`],
      ["color", `var(--${ns}-btn-fg)`],
      ["transition", `background ${motion(ns)}, border-color ${motion(ns)}, color ${motion(ns)}, box-shadow ${motion(ns)}`],
    ]),
    rule(".btn:hover:not(:disabled)", [["background", `var(--${ns}-btn-hover)`]], { pairColorWith: ".btn" }),
    // Not transitioned — §3.1 decision #1/#2: press must read instantly.
    rule(".btn:active:not(:disabled)", [["transform", "scale(0.97)"]]),
    // §7.3 `bordered` placement (2026-08-06 focus-language unification). The
    // .btn family's resting frame is CHROME (--{ns}-btn-border, which Soft
    // Fill collapses into the fill), so focus re-tints that frame and adds
    // the surface's glow instead of stacking a hard rectangle outside it.
    // Both values are consumed as tokens, never expanded: --{ns}-focus-ring's
    // SHAPE is per-theme identity (terminal's phosphor blur, paper-ink's flat
    // 1px, solarized's 2px translucent), and inlining it would flatten 13
    // presets into one look.
    rule(".btn:focus-visible", [
      ["outline", "none"],
      ["border-color", `var(--${ns}-focus-bd)`],
      ["box-shadow", `var(--${ns}-focus-ring)`],
    ]),
    // :disabled opacity intentionally drops contrast — WCAG 1.4.3 exempts
    // disabled controls; render oracle must skip this state (§3.4).
    rule(".btn:disabled", [["opacity", "0.45"], ["cursor", "not-allowed"]]),
    rule(".btn-sm", [["padding", `${sp(ns, 2)} ${sp(ns, 8)}`], ["font-size", "11px"], ["line-height", "14px"]]),
    // Ghost chrome — a third shell orthogonal to the rung, not a new family.
    // No color of its own: relies on .btn's (an element with class="btn
    // ghost" matches both selectors; .btn supplies color).
    rule(".btn.ghost", [["background", "transparent"], ["border-color", "transparent"]], { pairColorWith: ".btn" }),
    rule(".btn.ghost:hover:not(:disabled)", [
      ["background", `color-mix(in srgb, var(--${ns}-fg) 6%, var(--${ns}-bg))`],
    ], { pairColorWith: ".btn" }),
    // Ghost's `border-color: transparent` is (0,2,0) and is emitted AFTER
    // `.btn:focus-visible` (also (0,2,0)), so source order alone would hand
    // the resting transparent frame the win during focus and leave the
    // bordered placement with nothing but its glow. Restated at (0,3,0) so
    // the outcome is decided by specificity, not by where in this file the
    // rules happen to sit (COMPONENTS.md §8.6: "别赌源序").
    rule(".btn.ghost:focus-visible", [["border-color", `var(--${ns}-focus-bd)`]], { pairColorWith: ".btn" }),
  ];
}

// -----------------------------------------------------------------------
// §2: .btn-ic (icon inside a button). The ONLY family popup participates in
// this campaign. options/library share one recipe (gap comes from the host
// .btn's flex gap); popup's hosts aren't flex containers, so it keeps its
// own baseline-compensation + margin-right variant (§2.1).
function btnIcRules(ns) {
  if (ns === "pp") {
    return [
      rule(".btn-ic", [
        ["display", "inline-flex"], ["align-items", "center"],
        ["vertical-align", "-3px"], ["margin-right", sp(ns, 4)],
      ]),
      rule(".btn-ic svg", [["display", "block"]]),
    ];
  }
  return [
    rule(".btn-ic", [["display", "inline-flex"], ["align-items", "center"]]),
    rule(".btn-ic svg", [["display", "block"]]),
  ];
}

// -----------------------------------------------------------------------
// §4: danger operations, two tiers.
//
// The SOLID tier (.confirm-popover .confirm-yes) is emitted for all three
// surfaces. popup's exemption in §0 ("popup 的 .confirm-popover 是
// warn-on-warn ... §4 的危险两档不适用于 popup") described the state of the
// code, not a design position: under all 13 presets popup painted its
// confirm button `background: var(--pp-warn-fg); color: var(--pp-warn-bg)`,
// so the button that performs an irreversible delete signalled "notice"
// rather than "danger". No gate could see it -- the warn pair measures
// 4.5-5.2:1 on every theme, so contrast was never the problem. Retiring the
// exemption is the popup button-family campaign's C3a.
//
// The QUIET tier stays options+library-only for now: it is defined ON
// `.btn.danger`, and popup has no `.btn` class until this campaign's C4
// switches the button family on for pp. Emitting it earlier would ship
// rules that match nothing.
function dangerRules(ns) {
  const solid = [
    // Solid tier -- the only allowed full-strength red. Self-paired.
    rule(".confirm-popover .confirm-yes", [
      ["background", `var(--${ns}-danger)`],
      ["color", `var(--${ns}-on-danger)`],
      ["border-color", `var(--${ns}-danger)`],
    ]),
    // Hover keeps the background and adds an inset ring -- no color change,
    // so no background/color pairing to check here.
    rule(".confirm-popover .confirm-yes:hover", [
      ["box-shadow", `inset 0 0 0 1px var(--${ns}-on-danger)`],
    ]),
  ];
  return [
    rule(".btn.danger", [
      ["color", `var(--${ns}-danger-quiet-fg)`],
      ["border-color", `color-mix(in srgb, var(--${ns}-danger) 55%, var(--${ns}-border))`],
    ]),
    rule(".btn.danger:hover:not(:disabled)", [
      ["background", `color-mix(in srgb, var(--${ns}-danger) 8%, var(--${ns}-btn-bg))`],
    ], { pairColorWith: ".btn.danger" }),
    rule(".btn.danger.ghost", [
      ["border-color", "transparent"], ["background", "transparent"],
    ], { pairColorWith: ".btn.danger" }),
    rule(".btn.danger.ghost:hover:not(:disabled)", [
      ["background", `color-mix(in srgb, var(--${ns}-danger) 8%, var(--${ns}-bg))`],
      ["border-color", `color-mix(in srgb, var(--${ns}-danger) 45%, transparent)`],
    ], { pairColorWith: ".btn.danger" }),
    // Focus wins the frame for the WHOLE .btn family, danger tiers included:
    // `.btn.danger` (0,2,0) and `.btn.danger.ghost` (0,3,0) are emitted after
    // the btn family's `:focus-visible`, so without these two the quiet-danger
    // edge would out-rank the focus border and a focused delete button would
    // show glow-only. The tier is not lost — it still reads through
    // --{ns}-danger-quiet-fg on the label and the danger hover fill — and a
    // focus indicator that means the same thing everywhere beats one that
    // silently degrades on exactly the buttons with the worst consequences.
    rule(".btn.danger:focus-visible", [["border-color", `var(--${ns}-focus-bd)`]], { pairColorWith: ".btn.danger" }),
    // `:not(:disabled)` here is a SPECIFICITY lever, not a state filter (a
    // :disabled element cannot match :focus-visible in the first place).
    // `.btn.danger.ghost:hover:not(:disabled)` above is (0,5,0) and is the
    // only hover rule in this family that touches border-color, so a (0,4,0)
    // focus patch lost the border whenever a ghost-danger button was hovered
    // AND focused -- i.e. exactly when a pointer user tabs to the delete
    // button they are already pointing at. Now (0,5,0) and emitted after it.
    rule(".btn.danger.ghost:focus-visible:not(:disabled)", [["border-color", `var(--${ns}-focus-bd)`]], { pairColorWith: ".btn.danger" }),
    ...solid,
  ];
}

// -----------------------------------------------------------------------
// §5: chip / badge geometry. Concrete selectors are named in COMPONENTS.md
// Appendix C (C8/C9/C10) — the only chip sites this campaign already
// committed to. popup's C11 (`.tag-item`) is explicitly "记账" (bookkeeping
// only; Task 9 decides whether it's in scope), so it's deliberately absent
// from CHIP_TARGETS rather than guessed at here. `.vocab-status-chip` is
// Appendix A3's open design question ("chip family or plain text?") — not
// listed here for the same reason.
//
// CHIP_GEOM holds only the two values every chip target genuinely shares
// (COMPONENTS.md §5.1 laws 1/3: vertical padding >= 2px, line-height pins the
// row-box height). Horizontal padding and font-size are NOT cross-target
// invariants — Appendix C gives each target its own regulation value (C8
// keeps its container-inherited font-size, C9's padding is 8px not 10px,
// C10's font-size stays 10px) — so those live per-entry on CHIP_TARGETS.
// recipe-lint re-derives law 2 from padV/lineHeight instead of trusting a
// canned radius, so a future edit here that breaks it fails loudly.
export const CHIP_GEOM = { padV: 2, lineHeight: 14 };
export const CHIP_TARGETS = [
  // C8: padding 2px 10px, radius-full; font-size NOT emitted (§5.2/C8: "字号仍继承容器").
  { ns: "lib", selector: ".vocab-group-chip", radius: "full", pressable: false, padH: 10 },
  // C9: padding 2px 8px (not 10 — Appendix C gives this target 8px specifically),
  // radius-sm, aria-pressed toggle; font-size unchanged from current shipped value (12px).
  { ns: "lib", selector: ".vocab-stat-chip", radius: "sm", pressable: true, padH: 8, fontSize: "12px" },
  // C10: padding-inline 6px->10px (+4px, law 2), radius-full; font-size unchanged
  // from current shipped value (10px) — Appendix C only calls out the padding/height change.
  { ns: "opt", selector: ".tag-gov-kind-badge", radius: "full", pressable: false, padH: 10, fontSize: "10px" },
];

function chipRules(ns) {
  const out = [];
  for (const target of CHIP_TARGETS.filter(t => t.ns === ns)) {
    const { selector, radius, pressable, padH, fontSize } = target;
    const decls = [
      ["display", "inline-flex"],
      ["align-items", "center"],
      // padH routed through sp() too (Minor fix): today's output is unchanged
      // (lib padH=10/opt padH=10 have no matching rung, lib padH=8 resolves to
      // var(--lib-sp-2) which IS 8px) — this just stops a future padH edit from
      // silently bypassing the adapter contract.
      ["padding", `${sp(ns, CHIP_GEOM.padV)} ${sp(ns, padH)}`],
    ];
    if (fontSize) decls.push(["font-size", fontSize]); // C8 deliberately omits this — inherits container
    decls.push(
      ["line-height", `${CHIP_GEOM.lineHeight}px`],
      ["border-radius", `var(--${ns}-radius-${radius})`],
      ["background", `var(--${ns}-chip-bg)`],
      ["color", `var(--${ns}-chip-fg)`],
    );
    out.push(rule(selector, decls));
    if (pressable) {
      out.push(rule(`${selector}[aria-pressed]:hover`, [["background", `var(--${ns}-btn-hover)`]], { pairColorWith: selector }));
      out.push(rule(`${selector}[aria-pressed]:active`, [["transform", "scale(0.97)"]]));
      // §7.3 `bordered`: a pressable chip keeps a 1px frame at rest so the
      // pressed/focused edge costs no reflow (§9 law 1) -- that frame IS the
      // focus core, same as the .btn family's.
      out.push(rule(`${selector}[aria-pressed]:focus-visible`, [
        ["outline", "none"],
        ["border-color", `var(--${ns}-focus-bd)`],
        ["box-shadow", `var(--${ns}-focus-ring)`],
      ]));
    }
  }
  return out;
}

// -----------------------------------------------------------------------
// §6: form controls. options + library get the full field recipe; popup
// only gets accent-color (§6: "popup 只吃颜色对与 accent-color") — it has
// no `.fg` class. `.fg select`'s chevron background-image and `.fg
// textarea`'s monospace stack are explicitly page-level hand-maintained
// exceptions (§6.1), never emitted here.
function formRules(ns) {
  if (ns === "pp") {
    return [rule('input[type="checkbox"], input[type="radio"]', [["accent-color", `var(--${ns}-accent)`]])];
  }
  const FIELD_SEL = `.fg input[type="text"], .fg input[type="password"], .fg input[type="number"], .fg select, .fg textarea`;
  const out = [
    rule(FIELD_SEL, [
      ["width", "100%"],
      ["padding", `${sp(ns, 4)} ${sp(ns, 8)}`],
      ["font-size", "13px"],
      ["line-height", "16px"],
      ["font-family", "inherit"],
      ["border", `1px solid var(--${ns}-input-border)`],
      ["border-radius", `var(--${ns}-radius-md)`],
      ["background-color", `var(--${ns}-input-bg)`],
      ["color", `var(--${ns}-fg)`],
      ["-webkit-appearance", "none"],
      ["appearance", "none"],
      ["box-shadow", "none"],
      ["transition", `border-color ${motion(ns)} ease, background-color ${motion(ns)} ease, box-shadow ${motion(ns)} ease`],
    ]),
    rule(`.fg input:hover:not(:focus), .fg select:hover:not(:focus), .fg textarea:hover:not(:focus)`, [
      ["border-color", `color-mix(in srgb, var(--${ns}-input-border) 55%, var(--${ns}-fg))`],
    ], { pairColorWith: FIELD_SEL }),
    rule(`.fg input:focus, .fg select:focus, .fg textarea:focus`, [
      ["outline", "none"], ["border-color", `var(--${ns}-focus-bd)`],
    ], { pairColorWith: FIELD_SEL }),
    rule(`.fg input:focus-visible, .fg select:focus-visible, .fg textarea:focus-visible`, [
      ["box-shadow", `var(--${ns}-focus-ring)`],
    ]),
    rule('input[type="checkbox"], input[type="radio"]', [["accent-color", `var(--${ns}-accent)`]]),
    // §7.3 `borderless`: a checkbox paints no frame of its own (the tick is
    // UA-drawn from accent-color), so the 1px accent core carries legibility
    // and the token glow carries the family resemblance. The core is NOT
    // optional -- the glow alone is too faint on light surfaces.
    rule('.fg input[type="checkbox"]:focus-visible', [
      ["outline", `1px solid var(--${ns}-accent)`],
      ["outline-offset", "2px"],
      ["box-shadow", `var(--${ns}-focus-ring)`],
    ]),
  ];
  // §6.1 toolbar-scoped field variant (sm rung, matches the row's .btn-sm
  // height). Concrete selector per COMPONENTS.md Appendix C3 — the only named
  // target this campaign (library.css:834, "本战役排期"); options has no
  // equivalent named in Appendix C, so this only emits for lib.
  //
  // Selector widened from ".vocab-batch-bar input[type=text]" to
  // ".vocab-group-unit input[type=text]" (vocab-group-inspect-report.md
  // 2026-08-05 Finding 1): the batch bar's own group input is already
  // wrapped in .vocab-group-unit, so this is a pure broadening, not a
  // retarget -- but the detail pane renders the SAME input+stepper unit
  // (library-vocab.js: "same input+stepper family as the batch bar") scoped
  // to #vocab-detail, outside .vocab-batch-bar entirely, and never matched
  // the old selector at all. The hand-written border/background/focus-
  // visible recipe at library.css:969-980 gets the identical widening in the
  // same commit -- see that file for why the detail-pane input rendered with
  // zero styling (Finding 1's actual bug: no border, no radius, a double
  // focus ring) rather than just the wrong size.
  if (ns === "lib") {
    out.push(rule('.vocab-group-unit input[type="text"]', [
      ["padding", `${sp(ns, 2)} ${sp(ns, 8)}`],
      ["font-size", "12px"],
      ["line-height", "14px"],
    ]));
  }
  return out;
}

// -----------------------------------------------------------------------
const FAMILY_BUILDERS = { btn: btnRules, btnIc: btnIcRules, danger: dangerRules, chip: chipRules, form: formRules };
export const FAMILIES = Object.keys(FAMILY_BUILDERS);

// Rules for one (ns, family) — exported so recipe-lint can run its static
// checks (paired-color law, chip geometry law) against structured data
// instead of re-parsing the stringified CSS.
export function familyRules(ns, family) {
  const build = FAMILY_BUILDERS[family];
  if (!build) throw new Error(`ui-components: unknown family "${family}"`);
  return build(ns);
}

const PLACEHOLDER = "/* populated per-family in later tasks */";

// renderComponents(ns, families) — the recipe API. `families` defaults to
// every family (this is what recipe-lint checks: the FULL recipe source,
// not whatever apply-ui-themes.mjs currently has switched on). An empty
// array (what apply-ui-themes.mjs's Task-8-era SURFACES entries pass)
// yields just the placeholder comment, keeping the generated regions empty
// until Task 9 flips families on.
export function renderComponents(ns, families = FAMILIES) {
  const blocks = families.map(f => stringifyRules(familyRules(ns, f))).filter(Boolean);
  return blocks.length ? blocks.join("\n\n") : PLACEHOLDER;
}
