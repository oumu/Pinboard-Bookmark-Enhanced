#!/usr/bin/env node
// Pilot: render github-light via classic-list composer, diff against shipped CSS.
import { readFileSync, writeFileSync } from "node:fs";
import { compose } from "../composers/classic-list.mjs";
import { parseStyleRules } from "../tools/css-syntax.mjs";

const tokens = JSON.parse(readFileSync(new URL("./github-light.tokens.json", import.meta.url), "utf8"));
const generated = compose(tokens);
writeFileSync(new URL("./github-light.generated.css", import.meta.url), generated);

// Extract the shipped CSS from pinboard-themes.js
const src = readFileSync(new URL("../../../pinboard-themes.js", import.meta.url), "utf8");
const m = src.match(/"github-light"[\s\S]*?css:\s*`([\s\S]*?)`\s*\}\s*\n/);
if (!m) { console.error("cannot locate github-light shipped CSS"); process.exit(1); }
const shipped = m[1];
writeFileSync(new URL("./github-light.shipped.css", import.meta.url), shipped);

// Selector-level coverage analysis
const extractSelectors = css => {
  const sels = new Set();
  for (const rule of parseStyleRules(css)) {
    for (const selector of rule.selectors) {
      if (selector !== ":root") sels.add(selector);
    }
  }
  return sels;
};
const shippedSel = extractSelectors(shipped);
const generatedSel = extractSelectors(generated);
const missing = [...shippedSel].filter(s => !generatedSel.has(s));
const covered = [...shippedSel].filter(s => generatedSel.has(s));

// Color slot coverage
const shippedHex = new Set([...shipped.matchAll(/#[0-9a-f]{3,8}\b/gi)].map(m => m[0].toLowerCase()));
const tokenHex = new Set();
const collectHex = v => { if (typeof v === "string") [...v.matchAll(/#[0-9a-f]{3,8}\b/gi)].forEach(m => tokenHex.add(m[0].toLowerCase())); else if (v && typeof v === "object") Object.values(v).forEach(collectHex); };
collectHex(tokens);
const shippedOnly = [...shippedHex].filter(c => !tokenHex.has(c));

const report = {
  shipped_bytes: shipped.length,
  generated_bytes: generated.length,
  shipped_selectors: shippedSel.size,
  generated_selectors: generatedSel.size,
  covered_count: covered.length,
  missing_count: missing.length,
  coverage_pct: (covered.length / shippedSel.size * 100).toFixed(1),
  shipped_colors_total: shippedHex.size,
  colors_in_tokens: [...shippedHex].filter(c => tokenHex.has(c)).length,
  colors_missing_from_tokens: shippedOnly,
  missing_selectors: missing.slice(0, 30),
};
writeFileSync(new URL("./report.json", import.meta.url), JSON.stringify(report, null, 2));

console.log("=== PILOT: github-light ===");
console.log(`shipped:   ${report.shipped_bytes} bytes, ${report.shipped_selectors} selectors`);
console.log(`generated: ${report.generated_bytes} bytes, ${report.generated_selectors} selectors`);
console.log(`coverage:  ${covered.length}/${shippedSel.size} selectors (${report.coverage_pct}%)`);
console.log(`colors:    ${report.colors_in_tokens}/${shippedHex.size} shipped hex colors mapped to tokens`);
if (shippedOnly.length) console.log(`colors NOT in tokens: ${shippedOnly.join(", ")}`);
console.log(`\nTop missing selectors (${missing.length} total):`);
missing.slice(0, 25).forEach(s => console.log(`  - ${s}`));
