#!/usr/bin/env node
// recipe-lint — static checks on composers/ui-components.mjs, the single
// source for the @generated:ui-components region's structural CSS recipes.
//
// Runs against the FULL recipe (every family, every ns) regardless of which
// families tools/apply-ui-themes.mjs currently has switched on — mechanism
// and content are checked separately (Task 8 vs Task 9). See that file's
// header and docs/theme-surface/COMPONENTS.md for the rules being enforced:
//
//   1. paired-color law (§7.1): any rule declaring background/
//      background-color must have a color declaration to pair with, either
//      on itself or via an explicit `pairColorWith` pointing at a rule in
//      the same recipe that declares one.
//   2. chip geometry (§5.1 laws 2/3): vertical padding >= 2px always; for
//      radius:"full" (pill) targets, horizontal padding >= the effective
//      pill radius (height/2, borderless).
//   3. SPACING adapter accuracy: every px->var(--{ns}-sp-N) mapping in
//      SPACING must match that surface's actual :root --{ns}-sp-N value.
//   4. no direct --{ns}-sp-N references in the recipe source outside the
//      SPACING table itself (recipes must go through sp(), never spell out
//      the token).
//   5. no var(--x, fallback) in the rendered recipe output (colors are
//      fallback-free tokens; a fallback silently escapes
//      ui-token-coverage's "used" regex).
//   6. pressInstant (§3.3): the .btn base rule's `transition` never lists
//      `transform` — press must read instantly, not animate.
//   7. noTransitionAll (§3.3/emil review): no rule's `transition` is `all`.
//   8. motionBudget (§3.3): every duration token the recipe actually
//      references (var(--motion-state) / var(--pp-motion-state)) is <=200ms
//      in that surface's real :root; an unvetted duration token fails loud
//      instead of silently passing unchecked.
//   9. hoverGeomGated (§3.3/§7.5): no `:hover` rule in the recipe changes
//      geometry (transform/width/height/margin/padding) — the recipe has no
//      @media(hover:hover) wrapping support, so a geometry-changing hover
//      can't be expressed here at all yet.
//  10. solidDangerScope (§4.4): `background: var(--{ns}-danger)` only
//      appears on `.confirm-popover .confirm-yes`.
//  11. dangerPaired (§4.4): any rule backgrounding `--{ns}-danger` declares
//      `--{ns}-on-danger` as `color` in that SAME rule (stricter than the
//      general paired-color law, which allows deferring via pairColorWith).
//  12. btnIcBase (§2.3): every ns's `.btn-ic` declares
//      display:inline-flex + align-items:center, and `.btn-ic svg` declares
//      display:block.
//
// Usage: node docs/theme-surface/tools/recipe-lint.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { renderComponents, familyRules, FAMILIES, SPACING, CHIP_GEOM, CHIP_TARGETS } from "../composers/ui-components.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..", "..");
const NS_LIST = ["pp", "opt", "lib"];
const CSS_PATH = { pp: resolve(ROOT, "popup.css"), opt: resolve(ROOT, "options.css"), lib: resolve(ROOT, "library.css") };
const SELF_PATH = resolve(__dirname, "..", "composers", "ui-components.mjs");

const fails = [];
const fail = msg => fails.push(msg);

// ---------------------------------------------------------------------------
// 1. paired-color law
// ---------------------------------------------------------------------------
for (const ns of NS_LIST) {
  const allRules = FAMILIES.flatMap(f => familyRules(ns, f));
  const declaresColor = new Set(allRules.filter(r => r.decls.some(([p]) => p === "color")).map(r => r.selector));
  for (const r of allRules) {
    const hasBg = r.decls.some(([p]) => p === "background" || p === "background-color");
    if (!hasBg) continue;
    const selfColor = r.decls.some(([p]) => p === "color");
    if (selfColor) continue;
    if (r.pairColorWith && declaresColor.has(r.pairColorWith)) continue;
    fail(`paired-color: ${ns} "${r.selector}" declares background with no paired color` +
      (r.pairColorWith ? ` (pairColorWith "${r.pairColorWith}" declares no color either)` : " (no pairColorWith set)"));
  }
}

// ---------------------------------------------------------------------------
// 2. chip geometry (§5.1 laws 2/3). padH/fontSize are per-target (Appendix C
// regulates each chip site individually); padV/lineHeight are the two true
// cross-target invariants on CHIP_GEOM.
// ---------------------------------------------------------------------------
{
  const { padV, lineHeight } = CHIP_GEOM;
  if (padV < 2) fail(`chip-geometry: CHIP_GEOM.padV (${padV}px) violates law 3 (padding-block >= 2px)`);
  // §5.2 comment: "无边框高 18px（有效半径9px）、带边框高 20px（10px）。水平 10px 覆盖两种情况的
  // 有效半径" — law 2 must hold against whichever case has the LARGER effective radius, i.e. the
  // 1px-bordered case (our chip recipe emits no border today, but the law is about what the
  // padding number has to cover, not just today's declared properties).
  const BORDER_PX = 1;
  const borderlessRadius = (2 * padV + lineHeight) / 2;
  const borderedRadius = (2 * padV + lineHeight + 2 * BORDER_PX) / 2;
  const effectiveRadius = Math.max(borderlessRadius, borderedRadius);
  for (const t of CHIP_TARGETS) {
    if (t.radius === "full" && t.padH < effectiveRadius) {
      fail(`chip-geometry: ${t.ns} "${t.selector}" horizontal padding ${t.padH}px < effective pill radius ${effectiveRadius}px (law 2, bordered case)`);
    }
  }
}

// ---------------------------------------------------------------------------
// 3. SPACING adapter accuracy vs each surface's real :root --{ns}-sp-N
// ---------------------------------------------------------------------------
{
  const actual = {}; // ns -> { N: px }
  for (const ns of NS_LIST) {
    const css = readFileSync(CSS_PATH[ns], "utf8");
    actual[ns] = {};
    for (const m of css.matchAll(new RegExp(`--${ns}-sp-(\\d+):\\s*(\\d+)px`, "g"))) {
      actual[ns][m[1]] = Number(m[2]);
    }
  }
  for (const ns of NS_LIST) {
    for (const [pxKey, tokenValue] of Object.entries(SPACING[ns])) {
      const m = /^var\(--(?:pp|opt|lib)-sp-(\d+)\)$/.exec(tokenValue);
      if (!m) continue; // literal px fallback entry — nothing to cross-check
      const rung = m[1];
      const rootPx = actual[ns][rung];
      if (rootPx === undefined) {
        fail(`spacing-adapter: ${ns} SPACING[${pxKey}] references --${ns}-sp-${rung}, which is not defined in ${CSS_PATH[ns]}`);
      } else if (rootPx !== Number(pxKey)) {
        fail(`spacing-adapter: ${ns} SPACING[${pxKey}] -> --${ns}-sp-${rung}, but that token is ${rootPx}px in ${CSS_PATH[ns]} (mismatch)`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 4. no direct --{ns}-sp-N reference in the recipe source outside SPACING
// ---------------------------------------------------------------------------
{
  const src = readFileSync(SELF_PATH, "utf8");
  // Strip // line comments and /* */ block comments first — a prose
  // explanation that happens to quote "var(--lib-sp-2)" (documenting what
  // sp() resolves to) is not a leak. Text-grep that can't tell code from
  // comments is a known failure shape in this codebase (contrast-audit's
  // orphan-detection fix round 2) — don't repeat it here.
  const noComments = src
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, " "))
    .replace(/\/\/.*$/gm, "");
  const spacingBlock = /export const SPACING = \{[\s\S]*?\n\};/.exec(noComments);
  const rest = spacingBlock ? noComments.slice(0, spacingBlock.index) + noComments.slice(spacingBlock.index + spacingBlock[0].length) : noComments;
  // Two shapes both bypass the adapter: a hardcoded surface prefix
  // (var(--pp-sp-2)) and a template-interpolated one using the recipe's own
  // `ns` parameter (var(--${ns}-sp-2)) — the latter is the more likely
  // mistake in this file's own idiom (every other token reference is
  // `var(--${ns}-...)`), so it must be caught too.
  const leakRe = /var\(--(?:pp|opt|lib|\$\{ns\})-sp-\d+\)/g;
  for (const m of rest.matchAll(leakRe)) {
    fail(`no-sp-var-leak: recipe source references "${m[0]}" directly outside the SPACING table — use sp(ns, px) instead`);
  }
}

// ---------------------------------------------------------------------------
// 5. no fallback var() in rendered output
// ---------------------------------------------------------------------------
for (const ns of NS_LIST) {
  const rendered = renderComponents(ns, FAMILIES);
  for (const m of rendered.matchAll(/var\(--[a-z0-9-]+\s*,/gi)) {
    fail(`no-var-fallback: ${ns} rendered recipe contains fallback var() "${m[0]}..." — colors must be fallback-free`);
  }
}

// ---------------------------------------------------------------------------
// 6. pressInstant — .btn's own transition never lists transform
// ---------------------------------------------------------------------------
for (const ns of ["opt", "lib"]) { // pp has no .btn family this campaign
  const btn = familyRules(ns, "btn").find(r => r.selector === ".btn");
  const transition = btn?.decls.find(([p]) => p === "transition")?.[1] || "";
  if (/\btransform\b/.test(transition)) fail(`pressInstant: ${ns} .btn transition lists "transform" — press must stay instant (§3.1/§3.3)`);
}

// ---------------------------------------------------------------------------
// 7. noTransitionAll
// ---------------------------------------------------------------------------
for (const ns of NS_LIST) {
  if (/transition\s*:\s*all\b/.test(renderComponents(ns, FAMILIES))) fail(`noTransitionAll: ${ns} recipe uses "transition: all"`);
}

// ---------------------------------------------------------------------------
// 8. motionBudget — only vetted, <=200ms duration tokens in transitions
// ---------------------------------------------------------------------------
{
  const MOTION_TOKEN = { pp: "--pp-motion-state", opt: "--motion-state", lib: "--motion-state" };
  const VETTED = new Set(["var(--motion-state)", "var(--pp-motion-state)"]);
  for (const ns of NS_LIST) {
    const css = readFileSync(CSS_PATH[ns], "utf8");
    const m = new RegExp(`${MOTION_TOKEN[ns]}:\\s*(\\d+)ms`).exec(css);
    if (!m) fail(`motionBudget: ${ns} ${MOTION_TOKEN[ns]} not found in ${CSS_PATH[ns]}`);
    else if (Number(m[1]) > 200) fail(`motionBudget: ${ns} ${MOTION_TOKEN[ns]} is ${m[1]}ms, over the 200ms budget (§3.3)`);
    for (const t of renderComponents(ns, FAMILIES).matchAll(/transition\s*:\s*([^;]+);/g)) {
      for (const tok of t[1].matchAll(/var\(--[a-z0-9-]*motion[a-z0-9-]*\)/g)) {
        if (!VETTED.has(tok[0])) fail(`motionBudget: ${ns} transition references unvetted duration token ${tok[0]} — vet its :root value (<=200ms) before adding it here`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 9. hoverGeomGated — no :hover rule in the recipe changes geometry
// ---------------------------------------------------------------------------
{
  const GEOM_PROPS = new Set(["transform", "width", "height", "margin", "padding",
    "margin-top", "margin-right", "margin-bottom", "margin-left",
    "padding-top", "padding-right", "padding-bottom", "padding-left"]);
  for (const ns of NS_LIST) {
    for (const r of FAMILIES.flatMap(f => familyRules(ns, f))) {
      if (!r.selector.includes(":hover")) continue;
      for (const [prop] of r.decls) {
        if (GEOM_PROPS.has(prop)) fail(`hoverGeomGated: ${ns} "${r.selector}" hover changes geometry (${prop}) — recipe can't express @media(hover:hover) wrapping yet (§3.3/§7.5)`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 10/11. solidDangerScope + dangerPaired
// ---------------------------------------------------------------------------
for (const ns of NS_LIST) {
  for (const r of FAMILIES.flatMap(f => familyRules(ns, f))) {
    const bg = r.decls.find(([p]) => p === "background")?.[1];
    if (bg !== `var(--${ns}-danger)`) continue;
    if (r.selector !== ".confirm-popover .confirm-yes") fail(`solidDangerScope: ${ns} "${r.selector}" backgrounds var(--${ns}-danger) outside .confirm-popover .confirm-yes`);
    const color = r.decls.find(([p]) => p === "color")?.[1];
    if (color !== `var(--${ns}-on-danger)`) fail(`dangerPaired: ${ns} "${r.selector}" backgrounds var(--${ns}-danger) without var(--${ns}-on-danger) as color in the same rule`);
  }
}

// ---------------------------------------------------------------------------
// 12. btnIcBase — unqualified .btn-ic / .btn-ic svg base rules exist per ns
// ---------------------------------------------------------------------------
for (const ns of NS_LIST) {
  const has = (r, prop, val) => r?.decls.some(([p, v]) => p === prop && v === val);
  const base = familyRules(ns, "btnIc").find(r => r.selector === ".btn-ic");
  const svg = familyRules(ns, "btnIc").find(r => r.selector === ".btn-ic svg");
  if (!has(base, "display", "inline-flex") || !has(base, "align-items", "center")) fail(`btnIcBase: ${ns} ".btn-ic" missing display:inline-flex/align-items:center`);
  if (!has(svg, "display", "block")) fail(`btnIcBase: ${ns} ".btn-ic svg" missing display:block`);
}

// ---------------------------------------------------------------------------
if (fails.length) {
  console.log(`recipe-lint: FAIL (${fails.length})`);
  for (const f of fails) console.log(`  x ${f}`);
  process.exit(1);
}
console.log(`recipe-lint: PASS (${NS_LIST.length} surfaces x ${FAMILIES.length} families)`);
process.exit(0);
