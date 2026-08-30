#!/usr/bin/env node
// For a given theme slug, look at every real-drift selector (composer output
// missing a declaration shipped has), and emit a CSS patch containing the
// SHIPPED declarations for those selectors. The patch is intended to be
// pasted into tokens.overrides.css so composer + overrides cascade converges
// on shipped visuals.
//
// Usage:
//   node tools/generate-overrides.mjs <slug>            # write patch file only
//   node tools/generate-overrides.mjs <slug> --inject   # patch + merge into
//                                                      # <slug>.tokens.json
//   node tools/generate-overrides.mjs all --inject     # batch all themes
// Output: pilots/<slug>.overrides-patch.css (always)
//         pilots/<slug>.tokens.json (when --inject)
//
// Merge semantics: patch rules are appended after any existing overrides.css
// content (separated by a "migration-patch" banner). Existing hand-authored
// overrides (e.g. ::before decorations on terminal/gruvbox-dark) are preserved.

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

const args = process.argv.slice(2);
const slug = args[0];
const INJECT = args.includes("--inject");
if (!slug) { console.error("usage: generate-overrides.mjs <slug|all> [--inject]"); process.exit(2); }

// Batch mode: run every *.tokens.json (except flexoki, already closed) and inject
if (slug === "all") {
  const files = readdirSync(PILOTS).filter(f => f.endsWith(".tokens.json"));
  let ok = 0, total = 0;
  for (const f of files) {
    const s = f.replace(/\.tokens\.json$/, "");
    total++;
    try {
      const child = await import("node:child_process");
      const r = child.spawnSync(process.execPath, [new URL(import.meta.url).pathname, s, ...(INJECT ? ["--inject"] : [])], { stdio: "inherit" });
      if (r.status === 0) ok++;
    } catch (e) { console.error(`[${s}] error:`, e.message); }
  }
  console.log(`\n[batch] ${ok}/${total} themes processed`);
  process.exit(0);
}

const TOKENS_PATH = resolve(PILOTS, `${slug}.tokens.json`);
const tokens = JSON.parse(readFileSync(TOKENS_PATH, "utf8"));

// Idempotency fix: strip any prior auto-patch from tokens.overrides.css BEFORE
// computing `generated`. Otherwise the tool diffs shipped against a view that
// includes the stale patch, decides "nothing missing", then writes back an
// overrides.css that no longer contains those decls — losing real coverage.
// (Manifested as generate-overrides on gruvbox-dark emitting 0 decls while
//  diff-all reported 95 missing immediately after.)
const AUTO_BANNER_RE_STRIP = /\/\*\s*={2,}\s*overrides-patch for [\s\S]*?\*\/[\s\S]*?(?=(?:\n\s*\/\*|$))/g;
if (tokens.overrides?.css) {
  tokens.overrides.css = tokens.overrides.css.replace(AUTO_BANNER_RE_STRIP, "").trimEnd() + (tokens.overrides.css.endsWith("\n") ? "\n" : "");
}
const generated = composeTheme(tokens, compose);
const re = new RegExp(`"${slug}":\\s*\\{[\\s\\S]*?css:\\s*\`([\\s\\S]*?)\`\\s*\\}`, "m");
const m = src.match(re);
if (!m) { console.error(`cannot locate shipped "${slug}"`); process.exit(1); }
const shipped = m[1];

// Parse but keep full raw declaration text (whitespace-normalized) to preserve
// !important and original color literals for the override patch.
function parseBlocksRaw(css) {
  return declarationMap(css);
}

function parseBlocksNorm(css) {
  // Same but values lowercased for comparison.
  const raw = parseBlocksRaw(css);
  const norm = new Map();
  for (const [sel, decls] of raw) norm.set(sel, new Set(decls.map(d => d.toLowerCase())));
  return norm;
}

// Mode-aware var table for comparing var()-wrapped values to literals
function varTableFromCss(css, selector) {
  return new Map([...declarationValueMap(css, selector)]
    .filter(([property]) => property.startsWith("--")));
}
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
const resolveVal = (v, sel) => {
  const table = tableFor(sel);
  let cur = v;
  for (let i = 0; i < 5; i++) {
    const next = cur.replace(/var\((--[\w-]+)(?:\s*,\s*[^()]+)?\)/g, (_, n) => table.get(n) ?? _);
    if (next === cur) break; cur = next;
  }
  return cur.replace(/\s+/g, " ").toLowerCase();
};

const shipRaw = parseBlocksRaw(shipped);
const shipNorm = parseBlocksNorm(shipped);
const genNorm = parseBlocksNorm(generated);

// Build index of gen's resolved decls per (sel, prop) so we don't patch
// declarations where composer+var already match shipped.
const genResolvedIndex = new Map(); // sel -> Map<prop, Set<resolved-value>>
for (const [sel, decls] of genNorm) {
  const byProp = new Map();
  for (const d of decls) {
    const c = d.indexOf(":"); if (c === -1) continue;
    const prop = d.slice(0, c).trim();
    const resolved = resolveVal(d.slice(c + 1).trim(), sel);
    if (!byProp.has(prop)) byProp.set(prop, new Set());
    byProp.get(prop).add(resolved);
  }
  genResolvedIndex.set(sel, byProp);
}

// Emit patch: per selector, the subset of shipped decls that are neither
// literally in gen nor semantically covered by a var()-resolved gen decl.
const patches = [];
for (const [sel, rawDecls] of shipRaw) {
  const genDeclsLiteral = genNorm.get(sel);
  if (!genDeclsLiteral) continue; // selector not present in gen — skip (separate category)
  const genByProp = genResolvedIndex.get(sel) || new Map();
  const missingDecls = [];
  for (const d of rawDecls) {
    const dNorm = d.toLowerCase();
    if (genDeclsLiteral.has(dNorm)) continue;
    const c = dNorm.indexOf(":"); if (c === -1) { missingDecls.push(d); continue; }
    const prop = dNorm.slice(0, c).trim();
    const val  = dNorm.slice(c + 1).trim();
    const covered = genByProp.get(prop)?.has(val);
    if (!covered) missingDecls.push(d);
  }
  if (missingDecls.length) {
    const { context, selector } = parseRuleKey(sel);
    patches.push({ context, selector, decls: missingDecls });
  }
}

const banner = `/* ======== overrides-patch for ${slug} (auto-generated by tools/generate-overrides.mjs) ========\n * Restores shipped decls the composer's token-driven output doesn't match.\n */`;
const indent = (text) => text.split("\n").map((line) => `  ${line}`).join("\n");
const patchBody = patches.map((patch) => {
  let css = `${patch.selector} { ${patch.decls.join("; ")}${patch.decls.length ? ";" : ""} }`;
  for (const atRule of [...patch.context].reverse()) css = `${atRule} {\n${indent(css)}\n}`;
  return css;
}).join("\n");

const outPath = resolve(PILOTS, `${slug}.overrides-patch.css`);
writeFileSync(outPath, banner + "\n" + patchBody + "\n");

console.log(`[generate-overrides] ${slug}`);
console.log(`  real-drift selectors patched: ${patches.length}`);
console.log(`  total decls emitted:          ${patches.reduce((a, p) => a + p.decls.length, 0)}`);
console.log(`  wrote ${outPath}`);

if (INJECT) {
  // Merge-not-overwrite: preserve any existing overrides.css content (may be
  // hand-authored ::before decorations etc.) and strip any prior auto-patch
  // block before appending the fresh one.
  const existing = tokens.overrides?.css || "";
  // Match banner comment (/* ======... overrides-patch for X ...===  * Restores... */)
  // and everything up to the next /* comment or end-of-string. The prior regex
  // required `={2,}\s*\*\/` which failed when the banner body contained prose
  // like "Restores shipped decls..." between the === and the closing */.
  const AUTO_BANNER_RE = /\/\*\s*={2,}\s*overrides-patch for [\s\S]*?\*\/[\s\S]*?(?=(?:\n\s*\/\*|$))/g;
  const preserved = existing.replace(AUTO_BANNER_RE, "").trim();
  const merged = [preserved, banner, patchBody].filter(Boolean).join("\n\n").trim();
  tokens.overrides = tokens.overrides || {};
  tokens.overrides.css = merged;
  writeFileSync(TOKENS_PATH, JSON.stringify(tokens, null, 2));
  console.log(`  injected into ${TOKENS_PATH}`);
  console.log(`    preserved existing overrides: ${preserved.length} bytes`);
  console.log(`    appended patch:               ${banner.length + patchBody.length} bytes`);
}
