#!/usr/bin/env node
// Pilot: render flexoki via composeTheme(tokens, classic-list-v2). Validates the
// modes feature that prefixes every selector with `html.pbp-dark` for the dark mode.
import { readFileSync, writeFileSync } from "node:fs";
import { compose } from "../composers/classic-list-v2.mjs";
import { composeTheme } from "../composers/compose-theme.mjs";
import { parseStyleRules } from "../tools/css-syntax.mjs";

const tokens = JSON.parse(readFileSync(new URL("./flexoki.tokens.json", import.meta.url), "utf8"));
const generated = composeTheme(tokens, compose);
writeFileSync(new URL("./flexoki.generated.css", import.meta.url), generated);

// Extract shipped flexoki CSS from pinboard-themes.js
const src = readFileSync(new URL("../../../pinboard-themes.js", import.meta.url), "utf8");
const m = src.match(/"flexoki":\s*\{[\s\S]*?css:\s*`([\s\S]*?)`\s*\}\s*,/);
if (!m) { console.error("cannot locate flexoki shipped CSS"); process.exit(1); }
const shipped = m[1];
writeFileSync(new URL("./flexoki.shipped.css", import.meta.url), shipped);

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

// Split analysis: light selectors vs dark-mode (html.pbp-dark-prefixed) selectors
const lightShipped = new Set([...shippedSel].filter(s => !s.startsWith("html.pbp-dark")));
const darkShipped  = new Set([...shippedSel].filter(s =>  s.startsWith("html.pbp-dark")));
const lightGen = new Set([...generatedSel].filter(s => !s.startsWith("html.pbp-dark")));
const darkGen  = new Set([...generatedSel].filter(s =>  s.startsWith("html.pbp-dark")));

const coveredLight = [...lightShipped].filter(s => lightGen.has(s));
const missingLight = [...lightShipped].filter(s => !lightGen.has(s));
const coveredDark  = [...darkShipped].filter(s => darkGen.has(s));
const missingDark  = [...darkShipped].filter(s => !darkGen.has(s));

// Color coverage (tokens vs shipped hex)
const shippedHex = new Set([...shipped.matchAll(/#[0-9a-f]{3,8}\b/gi)].map(m => m[0].toLowerCase()));
const tokenHex = new Set();
const collectHex = v => { if (typeof v === "string") [...v.matchAll(/#[0-9a-f]{3,8}\b/gi)].forEach(m => tokenHex.add(m[0].toLowerCase())); else if (v && typeof v === "object") Object.values(v).forEach(collectHex); };
collectHex(tokens);
const shippedOnly = [...shippedHex].filter(c => !tokenHex.has(c));

const overall = {
  shipped: shippedSel.size, generated: generatedSel.size,
  covered: coveredLight.length + coveredDark.length,
  coverage_pct: ((coveredLight.length + coveredDark.length) / shippedSel.size * 100).toFixed(1)
};

const report = {
  shipped_bytes: shipped.length,
  generated_bytes: generated.length,
  overall,
  light: {
    shipped: lightShipped.size,
    covered: coveredLight.length,
    missing: missingLight.length,
    coverage_pct: lightShipped.size ? (coveredLight.length / lightShipped.size * 100).toFixed(1) : "n/a"
  },
  dark: {
    shipped: darkShipped.size,
    covered: coveredDark.length,
    missing: missingDark.length,
    coverage_pct: darkShipped.size ? (coveredDark.length / darkShipped.size * 100).toFixed(1) : "n/a"
  },
  shipped_colors_total: shippedHex.size,
  colors_in_tokens: [...shippedHex].filter(c => tokenHex.has(c)).length,
  colors_missing: shippedOnly,
  missing_light_selectors: missingLight.slice(0, 20),
  missing_dark_selectors:  missingDark.slice(0, 20)
};
writeFileSync(new URL("./flexoki-report.json", import.meta.url), JSON.stringify(report, null, 2));

console.log("=== PILOT: flexoki (modes test) ===");
console.log(`shipped:   ${report.shipped_bytes} B, ${shippedSel.size} selectors (light ${lightShipped.size} / dark ${darkShipped.size})`);
console.log(`generated: ${report.generated_bytes} B, ${generatedSel.size} selectors (light ${lightGen.size} / dark ${darkGen.size})`);
console.log(`overall:   ${overall.covered}/${overall.shipped} selectors (${overall.coverage_pct}%)`);
console.log(`light:     ${coveredLight.length}/${lightShipped.size} (${report.light.coverage_pct}%)`);
console.log(`dark:      ${coveredDark.length}/${darkShipped.size} (${report.dark.coverage_pct}%)`);
console.log(`colors:    ${report.colors_in_tokens}/${shippedHex.size}`);
if (missingLight.length) { console.log(`\nMissing LIGHT (first 15):`); missingLight.slice(0, 15).forEach(s => console.log(`  - ${s}`)); }
if (missingDark.length)  { console.log(`\nMissing DARK (first 15):`);  missingDark.slice(0, 15).forEach(s => console.log(`  - ${s}`)); }
