#!/usr/bin/env node
// Run apply-tokens diff across every *.tokens.json and emit a drift matrix.
// Surfaces the real cost of swapping shipped CSS for composer output per theme.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { compose } from "../composers/classic-list-v2.mjs";
import { composeTheme } from "../composers/compose-theme.mjs";
import { declarationMap, declarationValueMap, parseRuleKey } from "./css-syntax.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..", "..");
const PILOTS = resolve(__dirname, "..", "pilots");
const src = readFileSync(resolve(ROOT, "pinboard-themes.js"), "utf8");
const CHECK = process.argv.includes("--check");

function parseBlocks(css) {
  return new Map([...declarationMap(css, { lowercase: true })]
    .map(([selector, declarations]) => [selector, new Set(declarations)]));
}

function varTableFromCss(css, selector) {
  return new Map([...declarationValueMap(css, selector)]
    .filter(([property]) => property.startsWith("--")));
}

function driftFor(slug, tokens) {
  const generated = composeTheme(tokens, compose);
  const re = new RegExp(`"${slug}":\\s*\\{[\\s\\S]*?css:\\s*\`([\\s\\S]*?)\`\\s*\\}`, "m");
  const m = src.match(re);
  if (!m) return null;
  const shipped = m[1];

  const baseVars = varTableFromCss(generated, ":root");
  const modeVars = new Map();
  if (tokens.modes) for (const [n, mode] of Object.entries(tokens.modes))
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
  const resolveVal = (v, sel) => {
    const table = tableFor(sel);
    let cur = v;
    for (let i = 0; i < 5; i++) {
      const next = cur.replace(/var\((--[\w-]+)(?:\s*,\s*[^()]+)?\)/g, (_, n) => table.get(n) ?? _);
      if (next === cur) break; cur = next;
    }
    return cur.replace(/\s+/g, " ").toLowerCase();
  };

  const shipMap = parseBlocks(shipped);
  const genMap = parseBlocks(generated);

  let realSel = 0, cosmeticSel = 0, perfectSel = 0;
  let realDecls = 0, cosmeticDecls = 0, extraDecls = 0;
  for (const [sel, shipDecls] of shipMap) {
    const genDecls = genMap.get(sel);
    if (!genDecls) continue;

    const genByProp = new Map();
    for (const d of genDecls) {
      const c = d.indexOf(":"); if (c === -1) continue;
      const prop = d.slice(0, c).trim();
      if (!genByProp.has(prop)) genByProp.set(prop, []);
      genByProp.get(prop).push(resolveVal(d.slice(c + 1).trim(), sel));
    }
    let missing = 0, cosmetic = 0;
    for (const d of shipDecls) {
      if (genDecls.has(d)) continue;
      const c = d.indexOf(":"); if (c === -1) { missing++; continue; }
      const prop = d.slice(0, c).trim();
      const v = d.slice(c + 1).trim().replace(/\s+/g, " ").toLowerCase();
      (genByProp.get(prop)?.some(r => r === v) ? cosmetic++ : missing++);
    }
    let extra = 0;
    const shipByProp = new Map();
    for (const d of shipDecls) {
      const c = d.indexOf(":"); if (c === -1) continue;
      const prop = d.slice(0, c).trim();
      if (!shipByProp.has(prop)) shipByProp.set(prop, []);
      shipByProp.get(prop).push(d.slice(c + 1).trim().replace(/\s+/g, " ").toLowerCase());
    }
    for (const d of genDecls) {
      if (shipDecls.has(d)) continue;
      const c = d.indexOf(":"); if (c === -1) { extra++; continue; }
      const prop = d.slice(0, c).trim();
      const v = resolveVal(d.slice(c + 1).trim(), sel);
      if (!(shipByProp.get(prop)?.some(r => r === v))) extra++;
    }

    realDecls += missing;
    cosmeticDecls += cosmetic;
    extraDecls += extra;
    if (missing === 0 && extra === 0 && cosmetic === 0) perfectSel++;
    else if (missing === 0 && extra === 0) cosmeticSel++;
    else realSel++;
  }

  return {
    slug,
    ship_sel: shipMap.size,
    gen_sel: genMap.size,
    perfect_sel: perfectSel,
    cosmetic_sel: cosmeticSel,
    real_drift_sel: realSel,
    real_missing_decls: realDecls,
    extra_decls: extraDecls,
    cosmetic_decls: cosmeticDecls
  };
}

const rows = [];
for (const file of readdirSync(PILOTS).filter(f => f.endsWith(".tokens.json"))) {
  const slug = file.replace(/\.tokens\.json$/, "");
  const tokens = JSON.parse(readFileSync(resolve(PILOTS, file), "utf8"));
  const r = driftFor(slug, tokens);
  if (r) rows.push(r);
}

if (!CHECK) {
  writeFileSync(resolve(PILOTS, "drift-matrix.json"),
    JSON.stringify({ generated_at: new Date().toISOString(), rows }, null, 2));
}

const col = (s, w) => String(s).padEnd(w);
console.log("\n=== DECL-LEVEL DRIFT MATRIX (post compose-theme fix) ===\n");
console.log(col("theme", 20) + col("perfect", 10) + col("cosmetic", 10) + col("miss-decls", 12) + col("extra-decls", 12) + "verdict");
console.log("-".repeat(78));
rows.sort((a, b) => b.real_missing_decls - a.real_missing_decls);
for (const r of rows) {
  // miss-decls is the drift-guard signal: composer+overrides MUST emit every
  // declaration shipped explicitly sets. Extras are baseline hardening and
  // are allowed (usually harmless) — tracked but not a gate.
  const verdict = r.real_missing_decls === 0 ? "OK" : r.real_missing_decls < 50 ? "WARN" : "FAIL";
  console.log(col(r.slug, 20) + col(`${r.perfect_sel}/${r.ship_sel}`, 10) + col(r.cosmetic_sel, 10) + col(r.real_missing_decls, 12) + col(r.extra_decls, 12) + verdict);
}
const total = rows.reduce((a, r) => ({
  perfect: a.perfect + r.perfect_sel,
  cosmetic: a.cosmetic + r.cosmetic_sel,
  real: a.real + r.real_drift_sel,
  miss: a.miss + r.real_missing_decls,
  extra: a.extra + r.extra_decls,
  ship: a.ship + r.ship_sel
}), { perfect: 0, cosmetic: 0, real: 0, miss: 0, extra: 0, ship: 0 });
console.log("-".repeat(78));
console.log(`TOTAL: ${total.perfect}/${total.ship} perfect | ${total.miss} missing decls | ${total.extra} extra decls`);

// Drift-guard mode: --strict causes exit 1 when any theme has miss-decls > 0.
// Intended for git hook / CI. Without --strict the tool is informational.
const STRICT = process.argv.includes("--strict");
if (STRICT) {
  const failed = rows.filter(r => r.real_missing_decls > 0);
  if (failed.length) {
    console.error(`\n[drift-guard] STRICT fail: ${failed.length}/${rows.length} themes have missing decls`);
    console.error(failed.map(r => `  - ${r.slug}: ${r.real_missing_decls} missing`).join("\n"));
    process.exit(1);
  }
  console.log(`\n[drift-guard] STRICT pass: all ${rows.length} themes have 0 missing decls`);
}
