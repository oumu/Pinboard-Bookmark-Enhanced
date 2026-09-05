#!/usr/bin/env node
// ui-vocabulary-lint — the structural class vocabulary of the four UI surfaces
// (popup / options / library / md-preview, plus shared.js) is a registry, not a
// free-for-all.
//
// Why (2026-09-05 design-language retrospective): 27 "button row" wrappers,
// 5 heading faces and 2 collapse mechanisms accumulated on the settings page
// one feature at a time, because nothing ever asked "does an existing primitive
// fit?" when a new wrapper class was typed. Every gate watched the CSS (the
// producer side); the HTML/JS that CONSUMES the vocabulary met no gate at all
// (70 HTML-only commits since 2026-07 ran zero pre-commit gates).
//
// What it checks (from the data structures the program consumes -- class
// attributes in the HTML and class literals in the surface JS -- never CSS text):
//   BLOCK  a class token that looks structural (docs/theme-surface/ui-vocabulary.json
//          `structuralPattern` / `exactStructural`) and is neither registered there
//          (primitives / regions / components) nor in the shrink-only legacy
//          baseline (scripts/ui-vocabulary-baseline.json).
//   WARN   any other class token that is new to the baseline (advisory: state and
//          modifier classes are free, but a reviewer should see them appear).
// Ratchet semantics mirror docs/theme-surface/tools/override-debt.mjs: identity =
// (surface, token); removals pass ("retired"), additions block, and only
// `--write-baseline` ever writes the baseline file.
//
// Usage:
//   node scripts/ui-vocabulary-lint.mjs                 # gate (exit 1 on BLOCK)
//   node scripts/ui-vocabulary-lint.mjs --write-baseline
//   node scripts/ui-vocabulary-lint.mjs --root <dir> --registry <json> --baseline <json>
//   node scripts/ui-vocabulary-lint.mjs --json          # machine-readable findings on stdout

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = resolve(__dirname, "..");

function parseArgs(argv) {
  const o = { root: DEFAULT_ROOT, registry: null, baseline: null, writeBaseline: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--write-baseline") o.writeBaseline = true;
    else if (a === "--json") o.json = true;
    else if (a === "--root" || a === "--registry" || a === "--baseline") {
      const v = argv[++i];
      if (!v) throw new Error(`${a} requires a path`);
      o[a.slice(2)] = resolve(v);
    } else throw new Error(`unknown argument: ${a}`);
  }
  o.registry ||= resolve(o.root, "docs/theme-surface/ui-vocabulary.json");
  o.baseline ||= resolve(o.root, "scripts/ui-vocabulary-baseline.json");
  return o;
}

const TOKEN = /^[a-z][a-z0-9-]*$/;

// Class tokens from a class attribute value; interpolated pieces (`${...}`) and
// anything that is not a plain kebab token are dropped -- a template hole is not
// a vocabulary entry.
function splitClassValue(value) {
  return value.split(/\s+/).filter((t) => TOKEN.test(t));
}

// Every place a surface file can mint a class name. HTML: class attributes.
// JS: className assignment, classList mutations, class attributes inside
// string/template HTML, setAttribute("class", ...), and md-video.js's
// el(tag, cls) helper. Returns Map<token, firstLine>.
function collectTokens(source) {
  const found = new Map();
  const add = (tok, index) => {
    if (!found.has(tok)) found.set(tok, source.slice(0, index).split("\n").length);
  };
  const patterns = [
    /\bclass\s*=\s*"([^"${}]*)"/g,
    /\bclass\s*=\s*'([^'${}]*)'/g,
    /\.className\s*=\s*["'`]([^"'`${}]*)["'`]/g,
    /\bclassName:\s*["'`]([^"'`${}]*)["'`]/g,
    /\.classList\.(?:add|toggle|remove|replace)\(([^)]*)\)/g,
    /\.setAttribute\(\s*["']class["']\s*,\s*["'`]([^"'`${}]*)["'`]/g,
    /\bel\(\s*["'][a-z0-9]+["']\s*,\s*["'`]([^"'`${}]*)["'`]/g,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(source)) !== null) {
      const body = m[1] || "";
      // classList.add("a", "b") -> pull each quoted literal; class="a b" -> split
      const literals = re.source.includes("classList") ? [...body.matchAll(/["'`]([^"'`${}]+)["'`]/g)].map((x) => x[1]) : [body];
      for (const lit of literals) for (const tok of splitClassValue(lit)) add(tok, m.index);
    }
  }
  return found;
}

function readRegistry(path) {
  const data = JSON.parse(readFileSync(path, "utf8"));
  if (data.version !== 1 || typeof data.surfaces !== "object" || typeof data.structuralPattern !== "string") {
    throw new Error(`${path}: unsupported registry shape`);
  }
  for (const [name, s] of Object.entries(data.surfaces)) {
    for (const key of ["files", "exactStructural", "primitives", "regions", "components"]) {
      if (!Array.isArray(s[key]) || !s[key].every((x) => typeof x === "string")) throw new Error(`${path}: surface ${name}.${key} must be a string array`);
    }
  }
  return data;
}

function readBaseline(path) {
  if (!existsSync(path)) return new Map();
  const data = JSON.parse(readFileSync(path, "utf8"));
  if (data.version !== 1 || !Array.isArray(data.entries)) throw new Error(`${path}: unsupported baseline shape`);
  const map = new Map();
  for (const e of data.entries) {
    if (typeof e.surface !== "string" || typeof e.token !== "string" || typeof e.structural !== "boolean") throw new Error(`${path}: malformed baseline entry`);
    map.set(`${e.surface}\n${e.token}`, e);
  }
  return map;
}

function scan(root, registry) {
  const structural = new RegExp(registry.structuralPattern);
  const rows = []; // { surface, token, structural, registered, file, line }
  for (const [surface, s] of Object.entries(registry.surfaces)) {
    const registered = new Set([...s.primitives, ...s.regions, ...s.components]);
    const exact = new Set(s.exactStructural);
    const seen = new Map(); // token -> {file, line}
    for (const rel of s.files) {
      const abs = resolve(root, rel);
      if (!existsSync(abs)) continue;
      for (const [tok, line] of collectTokens(readFileSync(abs, "utf8"))) {
        if (!seen.has(tok)) seen.set(tok, { file: rel, line });
      }
    }
    for (const [token, where] of seen) {
      rows.push({ surface, token, structural: exact.has(token) || structural.test(token), registered: registered.has(token), ...where });
    }
  }
  return rows;
}

function serializable(rows, registry) {
  const entries = rows
    .filter((r) => !r.registered)
    .map((r) => ({ surface: r.surface, token: r.token, structural: r.structural }))
    .sort((a, b) => `${a.surface}\n${a.token}`.localeCompare(`${b.surface}\n${b.token}`));
  return {
    version: 1,
    identity: "surface + class token used by that surface's HTML/JS and not registered in docs/theme-surface/ui-vocabulary.json; `structural` marks tokens the gate blocks on. Shrink-only: remove entries as the token retires or gets registered; regenerate deliberately with --write-baseline.",
    surfaces: Object.keys(registry.surfaces),
    entries,
  };
}

function suggest(registry, surface, token) {
  const prims = registry.surfaces[surface]?.primitives || [];
  const suffix = token.split("-").pop();
  const near = prims.filter((p) => p.endsWith(suffix) || p.split("-").pop() === suffix);
  return (near.length ? near : prims).map((p) => `.${p}`).join(" ");
}

function main() {
  const o = parseArgs(process.argv.slice(2));
  const registry = readRegistry(o.registry);
  const rows = scan(o.root, registry);
  if (o.writeBaseline) {
    const data = serializable(rows, registry);
    writeFileSync(o.baseline, JSON.stringify(data, null, 2) + "\n");
    const structural = data.entries.filter((e) => e.structural).length;
    console.log(`[ui-vocabulary] wrote ${data.entries.length} unregistered token(s) (${structural} structural) to ${o.baseline}`);
    return 0;
  }
  const baseline = readBaseline(o.baseline);
  const current = new Set();
  let blockers = 0, warnings = 0;
  const findings = [];
  for (const r of rows) {
    if (r.registered) continue;
    const key = `${r.surface}\n${r.token}`;
    current.add(key);
    if (baseline.has(key)) continue;
    if (r.structural) {
      blockers++;
      findings.push({ level: "BLOCK", ...r });
      console.log(`  ${r.file}:${r.line}  BLOCK  new structural class ".${r.token}" on ${r.surface} — use an existing primitive (${suggest(registry, r.surface, r.token) || "none registered yet"}) or register it in docs/theme-surface/ui-vocabulary.json with its geometry contract (COMPONENTS.md §10)`);
    } else {
      warnings++;
      findings.push({ level: "WARN", ...r });
      console.log(`  ${r.file}:${r.line}  WARN   new class ".${r.token}" on ${r.surface} (not structural by name; make sure it is a state/modifier, not an unregistered wrapper)`);
    }
  }
  let retired = 0;
  for (const key of baseline.keys()) if (!current.has(key)) retired++;
  if (o.json) console.log(JSON.stringify({ blockers, warnings, retired, findings }));
  console.log("");
  if (blockers) {
    console.log(`=== ui-vocabulary: FAIL — ${blockers} new structural class(es), ${warnings} new other class(es), ${retired} retired from baseline ===`);
    console.log("  Fix: reuse a registered primitive, or register the new one (docs/theme-surface/ui-vocabulary.json + COMPONENTS.md §10). Deliberate legacy refresh: node scripts/ui-vocabulary-lint.mjs --write-baseline");
    return 1;
  }
  console.log(warnings
    ? `=== ui-vocabulary: PASS with ${warnings} new non-structural class(es) (advisory), ${retired} retired from baseline ===`
    : `=== ui-vocabulary: PASS — ${current.size} unregistered legacy token(s) held by baseline, ${retired} retired ===`);
  return 0;
}

try {
  process.exit(main());
} catch (e) {
  console.error(`[ui-vocabulary] ERROR - ${e.message}`);
  process.exit(1);
}
