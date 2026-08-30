#!/usr/bin/env node
// Ratchet the remaining tokens.overrides.css escape-hatch debt by the exact
// program-consumed identity: at-rule context + selector + property + priority
// + theme. Values may be tuned; new structural debt is blocked; removals pass.

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseDeclarations, parseStyleRules } from "./css-syntax.mjs";

const toolsDir = dirname(fileURLToPath(import.meta.url));
const surfaceDir = resolve(toolsDir, "..");

function parseArgs(argv) {
  const options = {
    pilots: resolve(surfaceDir, "pilots"),
    baseline: resolve(toolsDir, "override-debt-baseline.json"),
    writeBaseline: false,
  };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--write-baseline") options.writeBaseline = true;
    else if (arg === "--pilots" || arg === "--baseline") {
      const value = argv[++index];
      if (!value) throw new Error(`${arg} requires a path`);
      options[arg === "--pilots" ? "pilots" : "baseline"] = resolve(value);
    } else throw new Error(`unknown argument: ${arg}`);
  }
  return options;
}

function identityKey(entry) {
  return JSON.stringify([entry.context, entry.selector, entry.property, entry.important]);
}

function collect(pilotsDir) {
  const identities = new Map();
  const themes = [];
  for (const file of readdirSync(pilotsDir).filter((name) => name.endsWith(".tokens.json")).sort()) {
    const path = resolve(pilotsDir, file);
    const pilot = JSON.parse(readFileSync(path, "utf8"));
    const theme = pilot?.meta?.id || basename(file, ".tokens.json");
    themes.push(theme);
    const seen = new Set();
    for (const rule of parseStyleRules(pilot?.overrides?.css ?? "")) {
      for (const selector of rule.selectors) {
        for (const declaration of parseDeclarations(rule.body)) {
          const entry = {
            context: rule.context,
            selector,
            property: declaration.property,
            important: declaration.important,
          };
          const key = identityKey(entry);
          if (seen.has(key)) continue;
          seen.add(key);
          if (!identities.has(key)) identities.set(key, { ...entry, themes: new Set() });
          identities.get(key).themes.add(theme);
        }
      }
    }
  }
  return { identities, themes };
}

function serializable({ identities, themes }) {
  return {
    version: 1,
    identity: "at-rule context + selector + property + !important + theme; declaration values are intentionally excluded",
    themes: [...themes].sort(),
    entries: [...identities.values()]
      .map((entry) => ({
        context: entry.context,
        selector: entry.selector,
        property: entry.property,
        important: entry.important,
        themes: [...entry.themes].sort(),
      }))
      .sort((a, b) => identityKey(a).localeCompare(identityKey(b))),
  };
}

function readBaseline(path) {
  const data = JSON.parse(readFileSync(path, "utf8"));
  if (data.version !== 1 || !Array.isArray(data.entries)) {
    throw new Error(`${path}: unsupported baseline shape`);
  }
  const identities = new Map();
  for (const entry of data.entries) {
    if (!Array.isArray(entry.context) || typeof entry.selector !== "string" ||
      typeof entry.property !== "string" || typeof entry.important !== "boolean" ||
      !Array.isArray(entry.themes)) {
      throw new Error(`${path}: malformed baseline entry`);
    }
    identities.set(identityKey(entry), new Set(entry.themes));
  }
  return identities;
}

function pairCount(identities) {
  return [...identities.values()].reduce((total, entry) =>
    total + (entry.themes instanceof Set ? entry.themes.size : 0), 0);
}

let options;
try {
  options = parseArgs(process.argv.slice(2));
  const current = collect(options.pilots);
  if (options.writeBaseline) {
    const output = `${JSON.stringify(serializable(current), null, 2)}\n`;
    writeFileSync(options.baseline, output);
    console.log(`[override-debt] wrote ${current.identities.size} identities / ${pairCount(current.identities)} theme pairs to ${options.baseline}`);
    process.exit(0);
  }

  const baseline = readBaseline(options.baseline);
  const additions = [];
  let currentPairs = 0;
  for (const [key, entry] of current.identities) {
    const allowedThemes = baseline.get(key) ?? new Set();
    for (const theme of entry.themes) {
      currentPairs++;
      if (!allowedThemes.has(theme)) additions.push({ ...entry, theme });
    }
  }
  const baselinePairs = [...baseline.values()].reduce((total, themes) => total + themes.size, 0);
  const retired = baselinePairs - (currentPairs - additions.length);

  if (additions.length) {
    console.error(`[override-debt] FAIL - ${additions.length} new structural debt identity pair(s)`);
    for (const entry of additions) {
      const context = entry.context.length ? `${entry.context.join(" > ")} > ` : "";
      console.error(`  ${entry.theme}: ${context}${entry.selector} { ${entry.property}${entry.important ? " !important" : ""}; }`);
    }
    console.error("  Migrate the rule to a token/pattern/composer, or deliberately refresh the reviewed baseline with --write-baseline.");
    process.exit(1);
  }

  console.log(`[override-debt] PASS - ${current.themes.length} themes, ${currentPairs} current pairs, retired ${retired} from baseline`);
} catch (error) {
  console.error(`[override-debt] ERROR - ${error.message}`);
  process.exit(1);
}
