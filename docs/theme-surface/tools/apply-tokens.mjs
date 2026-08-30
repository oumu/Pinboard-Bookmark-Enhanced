#!/usr/bin/env node
// Dev-time codegen: consume a tokens.json, produce CSS via composeTheme, and
// compare declaration-by-declaration against the currently shipped CSS in
// pinboard-themes.js. Optionally rewrite the file in place with --write.
//
// Usage:
//   node tools/apply-tokens.mjs <slug>             # diff only
//   node tools/apply-tokens.mjs <slug> --write     # diff + swap shipped css
//
// Exit code: 0 always when diff-only. When --write: 0 on success, 1 on failure.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { compose } from "../composers/classic-list-v2.mjs";
import { composeTheme } from "../composers/compose-theme.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..", "..");
const THEMES_PATH = resolve(ROOT, "pinboard-themes.js");

const [slug, ...flags] = process.argv.slice(2);
if (!slug) { console.error("usage: apply-tokens.mjs <slug> [--write]"); process.exit(2); }
const WRITE = flags.includes("--write");

// ---- Load tokens + generate ----
const tokens = JSON.parse(readFileSync(resolve(__dirname, "..", "pilots", `${slug}.tokens.json`), "utf8"));
const generated = composeTheme(tokens, compose);

// ---- Locate shipped block ----
const src = readFileSync(THEMES_PATH, "utf8");
const re = new RegExp(`("${slug}":\\s*\\{[\\s\\S]*?css:\\s*\`)([\\s\\S]*?)(\`\\s*\\})`, "m");
const m = src.match(re);
if (!m) { console.error(`[apply-tokens] cannot locate shipped "${slug}" block`); process.exit(1); }
const [, head, shipped, tail] = m;

// ---- Parse selector→declarations, strip comments first ----
const strip = css => css.replace(/\/\*[\s\S]*?\*\//g, "");
function parseBlocks(css) {
  const out = new Map(); // sel -> Set of normalized decls
  const body = strip(css);
  let i = 0;
  while (i < body.length) {
    const open = body.indexOf("{", i);
    if (open === -1) break;
    // balanced close (handles nested @media etc; for our flat CSS this is rare)
    let depth = 1, close = -1;
    for (let j = open + 1; j < body.length; j++) {
      if (body[j] === "{") depth++;
      else if (body[j] === "}") { depth--; if (depth === 0) { close = j; break; } }
    }
    if (close === -1) break;
    const rawSel = body.slice(i, open).trim();
    const block = body.slice(open + 1, close);
    i = close + 1;
    if (!rawSel || rawSel === ":root" || rawSel.startsWith("@")) continue;
    // Skip nested-rule blocks (contain '{')
    if (block.includes("{")) continue;
    const decls = block
      .split(";")
      .map(d => d.trim())
      .filter(Boolean)
      .map(d => d.replace(/\s+/g, " ").toLowerCase());
    for (const sel of rawSel.split(",").map(s => s.trim().replace(/\s+/g, " ")).filter(Boolean)) {
      if (!out.has(sel)) out.set(sel, new Set());
      for (const d of decls) out.get(sel).add(d);
    }
  }
  return out;
}

const shipMap = parseBlocks(shipped);
const genMap  = parseBlocks(generated);

// ---- Diff ----
const onlyShipped = [...shipMap.keys()].filter(k => !genMap.has(k));
const onlyGen     = [...genMap.keys()].filter(k => !shipMap.has(k));

// ---- Extract :root-like var tables from generated CSS so we can substitute var()
// references when comparing against the literal-value shipped CSS. Mode-scoped
// palettes are emitted as `html.pbp-dark { --x: val }` by compose-theme. ----
function extractVars(selectorPattern) {
  const map = new Map();
  const re = new RegExp(`(?:^|\\n)\\s*${selectorPattern}\\s*\\{([\\s\\S]*?)\\}`, "g");
  let match;
  while ((match = re.exec(generated)) !== null) {
    for (const line of match[1].split(";")) {
      const mm = line.trim().match(/^(--[\w-]+)\s*:\s*(.+)$/);
      if (mm) map.set(mm[1], mm[2].trim());
    }
  }
  return map;
}
const baseVars = extractVars(":root");
const modeVars = new Map(); // trigger -> Map<name, value>
if (tokens.modes) {
  for (const [name, mode] of Object.entries(tokens.modes)) {
    if (mode?.trigger) modeVars.set(mode.trigger, extractVars(mode.trigger.replace(/\./g, "\\.")));
  }
}

function varTableFor(sel) {
  for (const [trigger, vars] of modeVars) {
    if (sel.startsWith(trigger + " ") || sel === trigger) {
      const merged = new Map(baseVars);
      for (const [k, v] of vars) merged.set(k, v);
      return merged;
    }
  }
  return baseVars;
}

function resolveVars(value, sel) {
  const table = varTableFor(sel);
  let cur = value;
  for (let i = 0; i < 5; i++) {
    const next = cur.replace(/var\((--[\w-]+)(?:\s*,\s*[^()]+)?\)/g, (m, name) => table.get(name) ?? m);
    if (next === cur) break;
    cur = next;
  }
  return cur.replace(/\s+/g, " ").toLowerCase();
}

const declDiffs = []; // { sel, missing:[], extra:[], cosmetic:[] }
for (const [sel, shipDecls] of shipMap) {
  const genDecls = genMap.get(sel);
  if (!genDecls) continue;

  // For each shipped decl not literally in gen, try to match it against a
  // var-resolved gen decl (same property + equivalent resolved value).
  const genResolvedByProp = new Map(); // prop -> [{ raw, resolved }]
  for (const d of genDecls) {
    const colon = d.indexOf(":");
    if (colon === -1) continue;
    const prop = d.slice(0, colon).trim();
    const raw = d.slice(colon + 1).trim();
    if (!genResolvedByProp.has(prop)) genResolvedByProp.set(prop, []);
    genResolvedByProp.get(prop).push({ raw, resolved: resolveVars(raw, sel) });
  }

  const missing = [];
  const cosmetic = [];
  for (const d of shipDecls) {
    if (genDecls.has(d)) continue;
    const colon = d.indexOf(":");
    if (colon === -1) { missing.push(d); continue; }
    const prop = d.slice(0, colon).trim();
    const shipVal = d.slice(colon + 1).trim().replace(/\s+/g, " ").toLowerCase();
    const candidates = genResolvedByProp.get(prop) || [];
    const matched = candidates.some(c => c.resolved === shipVal);
    (matched ? cosmetic : missing).push(d);
  }

  // extras: decls in gen but not in ship (inverse)
  const shipResolvedByProp = new Map();
  for (const d of shipDecls) {
    const colon = d.indexOf(":");
    if (colon === -1) continue;
    const prop = d.slice(0, colon).trim();
    const raw = d.slice(colon + 1).trim();
    if (!shipResolvedByProp.has(prop)) shipResolvedByProp.set(prop, []);
    shipResolvedByProp.get(prop).push(raw);
  }
  const extra = [];
  for (const d of genDecls) {
    if (shipDecls.has(d)) continue;
    const colon = d.indexOf(":");
    if (colon === -1) { extra.push(d); continue; }
    const prop = d.slice(0, colon).trim();
    const resolved = resolveVars(d.slice(colon + 1).trim(), sel);
    const shipForProp = shipResolvedByProp.get(prop) || [];
    const matched = shipForProp.some(v => v.replace(/\s+/g, " ").toLowerCase() === resolved);
    if (!matched) extra.push(d);
  }

  if (missing.length || extra.length || cosmetic.length) {
    declDiffs.push({ sel, missing, extra, cosmetic });
  }
}

// ---- Report ----
const realDrift = declDiffs.filter(d => d.missing.length || d.extra.length);
const cosmeticOnly = declDiffs.filter(d => !d.missing.length && !d.extra.length);

const report = {
  slug,
  shipped_bytes: shipped.length,
  generated_bytes: generated.length,
  shipped_selectors: shipMap.size,
  generated_selectors: genMap.size,
  only_in_shipped: onlyShipped.length,
  only_in_generated: onlyGen.length,
  cosmetic_drift: cosmeticOnly.length, // same decl, literal vs var()
  real_drift: realDrift.length,        // genuinely missing/extra decls
  perfect_selectors: [...shipMap.keys()].filter(k => genMap.has(k) && !declDiffs.find(d => d.sel === k)).length,
  samples: {
    only_in_shipped: onlyShipped.slice(0, 10),
    only_in_generated: onlyGen.slice(0, 10),
    real_drift: realDrift.slice(0, 5)
  }
};

console.log(`\n=== apply-tokens diff: ${slug} ===`);
console.log(`shipped:   ${shipped.length} B, ${shipMap.size} selectors`);
console.log(`generated: ${generated.length} B, ${genMap.size} selectors`);
console.log(`only in shipped:    ${onlyShipped.length}`);
console.log(`only in generated:  ${onlyGen.length}`);
console.log(`cosmetic drift (literal vs var() same value): ${cosmeticOnly.length}`);
console.log(`REAL drift (genuinely missing decls):         ${realDrift.length}`);
console.log(`perfect:  ${report.perfect_selectors}/${shipMap.size}`);

if (realDrift.length) {
  console.log(`\n--- real decl-drift (first 10) ---`);
  for (const d of realDrift.slice(0, 10)) {
    console.log(`\n  ${d.sel}`);
    if (d.missing.length) console.log(`    - missing: ${d.missing.slice(0, 3).join(" | ")}${d.missing.length > 3 ? ` (+${d.missing.length - 3})` : ""}`);
    if (d.extra.length)   console.log(`    + extra:   ${d.extra.slice(0, 3).join(" | ")}${d.extra.length > 3 ? ` (+${d.extra.length - 3})` : ""}`);
  }
}

writeFileSync(resolve(__dirname, "..", "pilots", `${slug}.apply-report.json`),
  JSON.stringify({ ...report, all_diffs: declDiffs }, null, 2));

// ---- Optional write ----
if (WRITE) {
  if (realDrift.length > 0 && !flags.includes("--force")) {
    console.error(`\n[apply-tokens] REFUSING to write — ${realDrift.length} REAL decl drifts detected (cosmetic-only ok). Pass --force to override.`);
    process.exit(1);
  }
  const patched = src.replace(re, `${head}${generated}${tail}`);
  writeFileSync(THEMES_PATH, patched);
  console.log(`\n[apply-tokens] rewrote ${slug} block in pinboard-themes.js (${shipped.length} B → ${generated.length} B)`);
}
