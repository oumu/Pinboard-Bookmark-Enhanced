#!/usr/bin/env node
// For a given theme slug, look at every real-drift selector (composer output
// missing a declaration shipped has), and emit a CSS patch containing the
// SHIPPED declarations for those selectors. The patch is intended to be
// pasted into tokens.overrides.css so composer + overrides cascade converges
// on shipped visuals.
//
// Usage: node tools/generate-overrides.mjs <slug>
// Output: pilots/<slug>.overrides-patch.css

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { compose } from "../composers/classic-list-v2.mjs";
import { composeTheme } from "../composers/compose-theme.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..", "..");
const PILOTS = resolve(__dirname, "..", "pilots");
const src = readFileSync(resolve(ROOT, "pinboard-themes.js"), "utf8");

const slug = process.argv[2];
if (!slug) { console.error("usage: generate-overrides.mjs <slug>"); process.exit(2); }

const tokens = JSON.parse(readFileSync(resolve(PILOTS, `${slug}.tokens.json`), "utf8"));
const generated = composeTheme(tokens, compose);
const re = new RegExp(`"${slug}":\\s*\\{[\\s\\S]*?css:\\s*\`([\\s\\S]*?)\`\\s*\\}`, "m");
const m = src.match(re);
if (!m) { console.error(`cannot locate shipped "${slug}"`); process.exit(1); }
const shipped = m[1];

const strip = css => css.replace(/\/\*[\s\S]*?\*\//g, "");

// Parse but keep full raw declaration text (whitespace-normalized) to preserve
// !important and original color literals for the override patch.
function parseBlocksRaw(css) {
  const out = new Map(); // sel -> array of raw decls in order (deduped by string)
  const body = strip(css);
  let i = 0;
  while (i < body.length) {
    const open = body.indexOf("{", i);
    if (open === -1) break;
    let depth = 1, close = -1;
    for (let j = open + 1; j < body.length; j++) {
      if (body[j] === "{") depth++;
      else if (body[j] === "}") { depth--; if (depth === 0) { close = j; break; } }
    }
    if (close === -1) break;
    const rawSel = body.slice(i, open).trim();
    const block = body.slice(open + 1, close);
    i = close + 1;
    if (!rawSel || rawSel === ":root" || rawSel.startsWith("@") || block.includes("{")) continue;
    const decls = block.split(";").map(d => d.trim().replace(/\s+/g, " ")).filter(Boolean);
    for (const sel of rawSel.split(",").map(s => s.trim().replace(/\s+/g, " ")).filter(Boolean)) {
      if (!out.has(sel)) out.set(sel, []);
      const arr = out.get(sel);
      for (const d of decls) if (!arr.includes(d)) arr.push(d);
    }
  }
  return out;
}

function parseBlocksNorm(css) {
  // Same but values lowercased for comparison.
  const raw = parseBlocksRaw(css);
  const norm = new Map();
  for (const [sel, decls] of raw) norm.set(sel, new Set(decls.map(d => d.toLowerCase())));
  return norm;
}

// Mode-aware var table for comparing var()-wrapped values to literals
function varTableFromCss(css, selPattern) {
  const map = new Map();
  const regex = new RegExp(`(?:^|\\n)\\s*${selPattern}\\s*\\{([\\s\\S]*?)\\}`, "g");
  for (const match of css.matchAll(regex)) {
    for (const line of match[1].split(";")) {
      const mm = line.trim().match(/^(--[\w-]+)\s*:\s*(.+)$/);
      if (mm) map.set(mm[1], mm[2].trim());
    }
  }
  return map;
}
const baseVars = varTableFromCss(generated, ":root");
const modeVars = new Map();
if (tokens.modes) for (const [, mode] of Object.entries(tokens.modes))
  if (mode?.trigger) modeVars.set(mode.trigger, varTableFromCss(generated, mode.trigger.replace(/\./g, "\\.")));
const tableFor = sel => {
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
  if (missingDecls.length) patches.push({ sel, decls: missingDecls });
}

const banner = `/* ======== overrides-patch for ${slug} (auto-generated by tools/generate-overrides.mjs) ========\n * Restores shipped decls the composer's token-driven output doesn't match.\n * Paste relevant blocks into tokens.overrides.css, review each one, drop\n * ones you're happy to let the composer win on.\n */\n`;
const body = patches.map(p =>
  `${p.sel} { ${p.decls.join("; ")}${p.decls.length ? ";" : ""} }`
).join("\n");

const outPath = resolve(PILOTS, `${slug}.overrides-patch.css`);
writeFileSync(outPath, banner + body + "\n");

console.log(`[generate-overrides] ${slug}`);
console.log(`  real-drift selectors patched: ${patches.length}`);
console.log(`  total decls emitted:          ${patches.reduce((a, p) => a + p.decls.length, 0)}`);
console.log(`  wrote ${outPath}`);
