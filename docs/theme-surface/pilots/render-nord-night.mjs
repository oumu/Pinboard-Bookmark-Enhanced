#!/usr/bin/env node
// Sprint 3 migration sample: nord-night via composeTheme(tokens, classic-list-v2).
// Emits generated.css + diffs selector coverage against shipped CSS.
import { readFileSync, writeFileSync } from "node:fs";
import { compose } from "../composers/classic-list-v2.mjs";
import { composeTheme } from "../composers/compose-theme.mjs";
import { parseStyleRules } from "../tools/css-syntax.mjs";

const tokens = JSON.parse(readFileSync(new URL("./nord-night.tokens.json", import.meta.url), "utf8"));
const generated = composeTheme(tokens, compose);
writeFileSync(new URL("./nord-night.generated.css", import.meta.url), generated);

const src = readFileSync(new URL("../../../pinboard-themes.js", import.meta.url), "utf8");
const m = src.match(/"nord-night":\s*\{[\s\S]*?css:\s*`([\s\S]*?)`\s*\}\s*,/);
if (!m) { console.error("cannot locate nord-night shipped CSS"); process.exit(1); }
const shipped = m[1];
writeFileSync(new URL("./nord-night.shipped.css", import.meta.url), shipped);

const extract = css => {
  const sels = new Set();
  for (const rule of parseStyleRules(css)) {
    for (const selector of rule.selectors) {
      if (selector !== ":root") sels.add(selector);
    }
  }
  return sels;
};

const ship = extract(shipped), gen = extract(generated);
const covered = [...ship].filter(s => gen.has(s));
const missing = [...ship].filter(s => !gen.has(s));
const pct = (covered.length / ship.size * 100).toFixed(1);

// Color tokens coverage
const shippedHex = new Set([...shipped.matchAll(/#[0-9a-f]{3,8}\b/gi)].map(x => x[0].toLowerCase()));
const tokenHex = new Set();
const walk = v => { if (typeof v === "string") [...v.matchAll(/#[0-9a-f]{3,8}\b/gi)].forEach(x => tokenHex.add(x[0].toLowerCase())); else if (v && typeof v === "object") Object.values(v).forEach(walk); };
walk(tokens);
const colorsMissing = [...shippedHex].filter(c => !tokenHex.has(c));

const report = {
  shipped_bytes: shipped.length,
  generated_bytes: generated.length,
  shipped_selectors: ship.size,
  generated_selectors: gen.size,
  covered: covered.length,
  missing_count: missing.length,
  coverage_pct: pct,
  shipped_colors: shippedHex.size,
  colors_in_tokens: [...shippedHex].filter(c => tokenHex.has(c)).length,
  colors_missing: colorsMissing,
  missing_selectors: missing
};
writeFileSync(new URL("./nord-night-report.json", import.meta.url), JSON.stringify(report, null, 2));

console.log("=== MIGRATION: nord-night ===");
console.log(`shipped:   ${report.shipped_bytes} B, ${ship.size} selectors`);
console.log(`generated: ${report.generated_bytes} B, ${gen.size} selectors`);
console.log(`coverage:  ${covered.length}/${ship.size} (${pct}%)`);
console.log(`colors:    ${report.colors_in_tokens}/${shippedHex.size}`);
if (missing.length) { console.log(`\nMissing selectors:`); missing.forEach(s => console.log(`  - ${s}`)); }
if (colorsMissing.length) console.log(`\nColors not in tokens: ${colorsMissing.join(", ")}`);
