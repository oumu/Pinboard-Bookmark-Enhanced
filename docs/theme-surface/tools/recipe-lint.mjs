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
// 2. chip geometry (§5.1 laws 2/3)
// ---------------------------------------------------------------------------
{
  const { padV, padH, lineHeight } = CHIP_GEOM;
  if (padV < 2) fail(`chip-geometry: CHIP_GEOM.padV (${padV}px) violates law 3 (padding-block >= 2px)`);
  const borderlessHeight = 2 * padV + lineHeight;
  const effectiveRadius = borderlessHeight / 2;
  for (const t of CHIP_TARGETS) {
    if (t.radius === "full" && padH < effectiveRadius) {
      fail(`chip-geometry: ${t.ns} "${t.selector}" horizontal padding ${padH}px < effective pill radius ${effectiveRadius}px (law 2)`);
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
  const spacingBlock = /export const SPACING = \{[\s\S]*?\n\};/.exec(src);
  const rest = spacingBlock ? src.slice(0, spacingBlock.index) + src.slice(spacingBlock.index + spacingBlock[0].length) : src;
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
if (fails.length) {
  console.log(`recipe-lint: FAIL (${fails.length})`);
  for (const f of fails) console.log(`  x ${f}`);
  process.exit(1);
}
console.log(`recipe-lint: PASS (${NS_LIST.length} surfaces x ${FAMILIES.length} families)`);
process.exit(0);
