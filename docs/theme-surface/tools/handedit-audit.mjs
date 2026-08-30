#!/usr/bin/env node
// handedit-audit - detect hand-edited CSS rules in pinboard-themes.js.
//
// pinboard-themes.js is the runtime artifact and must be fully derivable from
// composer output + per-theme tokens via sync-all. Any (selector, declaration)
// tuple in the shipped block that the composer does NOT emit is a hand-edit:
// the next sync-all will overwrite it silently.
//
// The existing diff-all --strict only fails on missing-decls. Extras (i.e.
// hand-edits) pass silently. This tool closes that gap.
//
// Algorithm:
//   1. For each *.tokens.json, recompute the expected CSS via
//      composeTheme(tokens, compose).
//   2. Extract the shipped CSS for that theme from pinboard-themes.js.
//   3. Parse both into (selector -> Set<declaration>) maps.
//   4. Any (selector, declaration) present in shipped but not in composer-
//      expected is a hand-edit. Property-level value match against composer
//      decls for the same selector is considered equivalent (cosmetic
//      whitespace / var() resolution doesn't count as a hand-edit).
//
// Usage:
//   node docs/theme-surface/tools/handedit-audit.mjs
//   node docs/theme-surface/tools/handedit-audit.mjs --verbose
//
// Exit code: 0 if clean, 1 if hand-edits detected.

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { compose } from "../composers/classic-list-v2.mjs";
import { composeTheme } from "../composers/compose-theme.mjs";
import { declarationMap, declarationValueMap, formatRuleKey, parseRuleKey } from "./css-syntax.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..", "..");
const PILOTS = resolve(__dirname, "..", "pilots");
const VERBOSE = process.argv.includes("--verbose");
const src = readFileSync(resolve(ROOT, "pinboard-themes.js"), "utf8");

function parseBlocks(css) {
  return new Map([...declarationMap(css, { lowercase: true })]
    .map(([selector, declarations]) => [selector, new Set(declarations)]));
}

// Var resolution table for a given selector context. Mirrors diff-all.mjs:
// :root vars apply broadly; mode-trigger vars (e.g. `.dark-mode`) layer on top
// for selectors scoped under them. This lets us treat the composer's
// `color: var(--text)` as equivalent to the shipped resolved hex value.
function varTableFromCss(css, selector) {
  return new Map([...declarationValueMap(css, selector)]
    .filter(([property]) => property.startsWith("--")));
}

function buildResolver(generated, tokens) {
  const baseVars = varTableFromCss(generated, ":root");
  const modeVars = new Map();
  if (tokens.modes) for (const [, mode] of Object.entries(tokens.modes))
    if (mode?.trigger) modeVars.set(mode.trigger, varTableFromCss(generated, mode.trigger));
  const tableFor = sel => {
    sel = parseRuleKey(sel).selector;
    for (const [trigger, vars] of modeVars)
      if (sel.startsWith(trigger + " ") || sel === trigger) {
        const merged = new Map(baseVars);
        for (const [k, v] of vars) merged.set(k, v);
        return merged;
      }
    return baseVars;
  };
  return (decl, sel) => {
    const table = tableFor(sel);
    let cur = decl;
    for (let i = 0; i < 5; i++) {
      const next = cur.replace(/var\((--[\w-]+)(?:\s*,\s*[^()]+)?\)/g, (_, n) => table.get(n) ?? _);
      if (next === cur) break; cur = next;
    }
    return cur.replace(/\s+/g, " ").toLowerCase();
  };
}

function auditTheme(slug, tokens) {
  const generated = composeTheme(tokens, compose);
  const re = new RegExp(`"${slug}":\\s*\\{[\\s\\S]*?css:\\s*\`([\\s\\S]*?)\`\\s*\\}`, "m");
  const m = src.match(re);
  if (!m) return { slug, shipped: null, generated, handedits: [] };
  const shipped = m[1];

  const shipMap = parseBlocks(shipped);
  const genMap = parseBlocks(generated);
  const resolve = buildResolver(generated, tokens);

  const handedits = [];
  for (const [sel, shipDecls] of shipMap) {
    const genDecls = genMap.get(sel);
    // Selector not in composer output at all -> every decl is a hand-edit.
    if (!genDecls) {
      for (const d of shipDecls) handedits.push({ selector: formatRuleKey(sel), declaration: d, reason: "selector-not-emitted" });
      continue;
    }
    // Selector exists: compare decl-by-decl, allowing var-resolved equivalents.
    const genByProp = new Map();
    for (const d of genDecls) {
      const c = d.indexOf(":"); if (c === -1) continue;
      const prop = d.slice(0, c).trim();
      if (!genByProp.has(prop)) genByProp.set(prop, []);
      genByProp.get(prop).push(resolve(d.slice(c + 1).trim(), sel));
    }
    for (const d of shipDecls) {
      if (genDecls.has(d)) continue;
      const c = d.indexOf(":"); if (c === -1) { handedits.push({ selector: formatRuleKey(sel), declaration: d, reason: "malformed" }); continue; }
      const prop = d.slice(0, c).trim();
      const v = d.slice(c + 1).trim().replace(/\s+/g, " ").toLowerCase();
      if (genByProp.get(prop)?.some(r => r === v)) continue; // cosmetic / var-resolved match
      handedits.push({ selector: formatRuleKey(sel), declaration: d, reason: "decl-not-emitted" });
    }
  }
  return { slug, shipped, generated, handedits };
}

// --------------------------------------------------------------------------
// Run for every tokens.json.
// --------------------------------------------------------------------------
const reports = [];
for (const file of readdirSync(PILOTS).filter(f => f.endsWith(".tokens.json"))) {
  const slug = file.replace(/\.tokens\.json$/, "");
  const tokens = JSON.parse(readFileSync(resolve(PILOTS, file), "utf8"));
  const r = auditTheme(slug, tokens);
  reports.push(r);
}

const flagged = reports.filter(r => r.handedits.length > 0);
const totalHandedits = flagged.reduce((a, r) => a + r.handedits.length, 0);

if (VERBOSE) {
  for (const r of reports) {
    console.log(`\n--- ${r.slug} ---`);
    if (!r.shipped) { console.log("  (no shipped block found in pinboard-themes.js)"); continue; }
    const shipMap = parseBlocks(r.shipped);
    const genMap = parseBlocks(r.generated);
    console.log(`  shipped selectors: ${shipMap.size}`);
    console.log(`  composer selectors: ${genMap.size}`);
    console.log(`  hand-edits: ${r.handedits.length}`);
  }
  console.log("");
}

if (flagged.length === 0) {
  console.log(`[handedit-audit] PASS - ${reports.length} themes, 0 hand-edits`);
  process.exit(0);
}

console.log("[handedit-audit] HAND-EDITS DETECTED\n");
for (const r of flagged) {
  console.log(`theme: ${r.slug}`);
  for (const h of r.handedits) {
    console.log(`  selector: ${h.selector}`);
    console.log(`    declaration: ${h.declaration}`);
    console.log(`    diagnosis: rule exists in pinboard-themes.js but composer does not emit it.`);
    console.log(`               Either (a) migrate to docs/theme-surface/composers/classic-list-v2.mjs,`);
    console.log(`                  or (b) add to docs/theme-surface/pilots/${r.slug}.tokens.json overrides.css,`);
    console.log(`                  or (c) re-run sync-all (will overwrite this hand-edit).`);
  }
  console.log("");
}
console.log(`[handedit-audit] FAIL - ${flagged.length} theme${flagged.length === 1 ? "" : "s"} with ${totalHandedits} hand-edit${totalHandedits === 1 ? "" : "s"}`);
process.exit(1);
