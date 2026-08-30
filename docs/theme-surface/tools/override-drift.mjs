#!/usr/bin/env node
// override-drift - detect per-theme overrides.css selectors that re-broaden
// a composer selector the composer had narrowed with :not(...).
//
// Drift-guard checks string equality of declarations but is blind to the
// case where the composer emits `#right_bar a:not(.tag) { color: ... }`
// and a theme's tokens.json overrides.css carries the bare legacy form
// `#right_bar a { color: ... }`. The override "wins" at the same
// specificity-and-later-source-order tier and re-creates the cascade
// collision the composer's :not(.tag) was designed to remove.
//
// Algorithm:
//   1. Compose each theme's CSS via composeTheme(tokens, compose).
//   2. Index every composer selector by its "shape signature" - the
//      selector with all :not(X) pseudo-classes stripped.
//   3. Parse each tokens.json `overrides.css` and compute the signature
//      of every override selector the same way.
//   4. If an override signature matches a composer signature AND the
//      composer's actual selector has :not(...) exclusions the override
//      does not, flag as drift.
//
// Usage:
//   node docs/theme-surface/tools/override-drift.mjs
//
// Exit code: 0 if clean, 1 if drifts detected.

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { compose } from "../composers/classic-list-v2.mjs";
import { composeTheme } from "../composers/compose-theme.mjs";
import { parseDeclarations, parseStyleRules } from "./css-syntax.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PILOTS = resolve(__dirname, "..", "pilots");

// ----------------------------------------------------------------------------
// Selector helpers.
// ----------------------------------------------------------------------------
// Strip :not(...) (one or more, possibly chained) from a selector.
// `#tag_cloud_header a:not(.tag):not(.tag_heading_selected)` -> `#tag_cloud_header a`
// Iterative to handle chains and nested parens defensively.
function stripNot(sel) {
  let out = "";
  let i = 0;
  while (i < sel.length) {
    // Look for ":not("
    if (sel.startsWith(":not(", i)) {
      let depth = 1, j = i + 5;
      while (j < sel.length && depth > 0) {
        if (sel[j] === "(") depth++;
        else if (sel[j] === ")") depth--;
        j++;
      }
      i = j; // skip the entire :not(...)
      continue;
    }
    out += sel[i++];
  }
  return out;
}

// Normalise whitespace for stable comparison.
function norm(sel) {
  return sel.trim().replace(/\s+/g, " ");
}

// Extract individual top-level selectors from a raw CSS body and return
// `{ selector, lineNum }` per occurrence. Skips @-rules and :root.
function extractSelectors(css) {
  const out = [];
  for (const rule of parseStyleRules(css)) {
    for (const selector of rule.selectors) {
      if (selector === ":root") continue;
      out.push({ selector: norm(selector), lineNum: rule.lineNum });
    }
  }
  return out;
}

// First non-whitespace declaration line (for the drift-report hint).
function firstDecl(css, selector) {
  const rule = parseStyleRules(css).find((candidate) =>
    candidate.selectors.some((item) => norm(item) === norm(selector)));
  return rule ? parseDeclarations(rule.body)[0]?.raw || "" : "";
}

// ----------------------------------------------------------------------------
// Per-theme drift check.
// ----------------------------------------------------------------------------
function driftFor(slug, tokens) {
  // Build composer index from the composed CSS BEFORE the overrides are
  // appended. composeTheme appends tokens.overrides.css at the end - to
  // avoid self-matching that block, strip it first.
  const tokensNoOverrides = { ...tokens, overrides: undefined };
  const composedCss = composeTheme(tokensNoOverrides, compose);

  const composerIndex = new Map(); // signature -> [{ selector, lineNum }]
  for (const { selector, lineNum } of extractSelectors(composedCss)) {
    if (!selector.includes(":not(")) continue; // only care about composer rules that USED :not
    const sig = norm(stripNot(selector));
    if (!sig) continue;
    if (!composerIndex.has(sig)) composerIndex.set(sig, []);
    composerIndex.get(sig).push({ selector, lineNum });
  }

  const overridesCss = tokens?.overrides?.css || "";
  if (!overridesCss.trim()) return { slug, drifts: [] };

  const drifts = [];
  for (const { selector, lineNum } of extractSelectors(overridesCss)) {
    // Override that already has the same :not exclusions is fine.
    const sig = norm(stripNot(selector));
    if (!composerIndex.has(sig)) continue;
    const composerEntries = composerIndex.get(sig);
    // Drift if the override does NOT contain at least one :not(...) the
    // composer did. We compare on signature equality + the override
    // lacking the composer's :not. If the override has its own :not, allow it.
    for (const composerEntry of composerEntries) {
      if (selectorAtLeastAsScoped(selector, composerEntry.selector)) continue;
      // Real drift.
      const sampleDecl = firstDecl(overridesCss, selector);
      drifts.push({
        composerSelector: composerEntry.selector,
        composerLine: composerEntry.lineNum,
        overrideSelector: selector,
        overrideLine: lineNum,
        sampleDecl
      });
      break; // one report per override selector is enough
    }
  }
  return { slug, drifts };
}

// Compare scoping: does `override` carry ANY :not(...) from the composer?
// We flag drift only when the override is FULLY BARE relative to the composer's
// :not(...) set - i.e. shares no exclusions at all. This matches the bug class
// we hit: composer adds `:not(.tag)`, override keeps the legacy bare form and
// re-hijacks .tag elements. If the override carries `:not(.tag)` but the
// composer chains an extra `:not(.tag_heading_selected)` for a different
// concern, that's deliberate scoping and not the drift we care about.
function selectorAtLeastAsScoped(override, composer) {
  const overrideNots = extractNots(override);
  const composerNots = extractNots(composer);
  if (composerNots.length === 0) return true;
  // Override is "at least as scoped" if it shares at least one :not(...)
  // with the composer (i.e. it isn't the fully-bare legacy form).
  for (const c of composerNots) {
    if (overrideNots.includes(c)) return true;
  }
  return false;
}

function extractNots(sel) {
  const out = [];
  let i = 0;
  while (i < sel.length) {
    if (sel.startsWith(":not(", i)) {
      let depth = 1, j = i + 5;
      while (j < sel.length && depth > 0) {
        if (sel[j] === "(") depth++;
        else if (sel[j] === ")") depth--;
        if (depth === 0) break;
        j++;
      }
      const inner = sel.slice(i + 5, j);
      out.push(inner.trim());
      i = j + 1;
      continue;
    }
    i++;
  }
  return out;
}

// ----------------------------------------------------------------------------
// Run for every tokens.json.
// ----------------------------------------------------------------------------
const reports = [];
let totalDrifts = 0;
for (const file of readdirSync(PILOTS).filter(f => f.endsWith(".tokens.json"))) {
  const slug = file.replace(/\.tokens\.json$/, "");
  const tokens = JSON.parse(readFileSync(resolve(PILOTS, file), "utf8"));
  const r = driftFor(slug, tokens);
  if (r.drifts.length > 0) {
    totalDrifts += r.drifts.length;
    reports.push(r);
  }
}

if (reports.length === 0) {
  console.log(`[override-drift] PASS - all themes' overrides honor composer :not(...) scoping`);
  process.exit(0);
}

console.log("[override-drift] DRIFTS DETECTED\n");
for (const r of reports) {
  console.log(`theme: ${r.slug}`);
  for (const d of r.drifts) {
    console.log(`  composer: ${d.composerSelector}`);
    console.log(`  override: ${d.overrideSelector} { ${d.sampleDecl} } (line ${d.overrideLine} of overrides.css)`);
    // Build hint: take composer's :not(...) tokens and inject them into the override at the matching base.
    const hint = applyComposerScoping(d.overrideSelector, d.composerSelector);
    console.log(`  hint: scope override to match composer's exclusions`);
    console.log(`    ${hint} { ${d.sampleDecl} }`);
    console.log("");
  }
}
console.log(`[override-drift] FAIL - ${reports.length} theme(s) with ${totalDrifts} drift(s)`);
process.exit(1);

// Build a "fixed" override selector by appending the composer's :not(...)
// tokens after the matching base segment. Best-effort: if the structure is
// too irregular for a clean splice, fall back to the composer selector.
function applyComposerScoping(override, composer) {
  const nots = extractNots(composer);
  if (nots.length === 0) return override;
  // Find the part of the composer selector before the first :not - this is
  // where the suffix should land in the override too.
  const firstNotIdx = composer.indexOf(":not(");
  const composerHead = composer.slice(0, firstNotIdx).trim();
  if (override.startsWith(composerHead)) {
    const suffix = nots.map(n => `:not(${n})`).join("");
    const tail = override.slice(composerHead.length);
    return `${composerHead}${suffix}${tail}`;
  }
  return composer;
}
