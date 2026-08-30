#!/usr/bin/env node
// Sprint 3 batch migration runner.
// Discovers every *.tokens.json in pilots/, composes via compose-theme + classic-list-v2,
// diffs against shipped CSS in pinboard-themes.js, emits a migration matrix report.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { compose } from "../composers/classic-list-v2.mjs";
import { composeTheme } from "../composers/compose-theme.mjs";
import { parseStyleRules } from "../tools/css-syntax.mjs";

const here = new URL("./", import.meta.url);
const src = readFileSync(new URL("../../../pinboard-themes.js", import.meta.url), "utf8");
const CHECK = process.argv.includes("--check");

const extractShipped = slug => {
  // Regex: tolerate presence/absence of trailing comma after the closing "}"
  const re = new RegExp(`"${slug}":\\s*\\{[\\s\\S]*?css:\\s*\`([\\s\\S]*?)\`\\s*\\}`, "m");
  const m = src.match(re);
  return m ? m[1] : null;
};

const extractSels = css => {
  const sels = new Set();
  for (const rule of parseStyleRules(css)) {
    for (const selector of rule.selectors) {
      if (selector !== ":root") sels.add(selector);
    }
  }
  return sels;
};

const tokenFiles = readdirSync(here).filter(f => f.endsWith(".tokens.json"));

const rows = [];
for (const file of tokenFiles) {
  const slug = file.replace(/\.tokens\.json$/, "");
  const tokens = JSON.parse(readFileSync(new URL(file, here), "utf8"));
  const shipped = extractShipped(slug);
  if (!shipped) { rows.push({ slug, status: "NO_SHIPPED" }); continue; }

  const generated = composeTheme(tokens, compose);
  if (!CHECK) writeFileSync(new URL(`./${slug}.generated.css`, here), generated);

  const ship = extractSels(shipped), gen = extractSels(generated);
  const covered = [...ship].filter(s => gen.has(s)).length;
  const missing = [...ship].filter(s => !gen.has(s));
  const pct = +(covered / ship.size * 100).toFixed(1);

  // modes split (if tokens has modes.dark)
  let modeRow = null;
  if (tokens.modes?.dark) {
    const light = new Set([...ship].filter(s => !s.startsWith("html.pbp-dark")));
    const dark  = new Set([...ship].filter(s =>  s.startsWith("html.pbp-dark")));
    const lCov = [...light].filter(s => gen.has(s)).length;
    const dCov = [...dark].filter(s => gen.has(s)).length;
    modeRow = {
      light_pct: +(lCov / light.size * 100).toFixed(1),
      dark_pct:  +(dCov / dark.size  * 100).toFixed(1)
    };
  }

  rows.push({
    slug,
    shipped_sels: ship.size,
    generated_sels: gen.size,
    covered,
    pct,
    missing_count: missing.length,
    missing_sample: missing.slice(0, 5),
    modes: modeRow,
    shipped_bytes: shipped.length,
    generated_bytes: generated.length
  });
}

if (!CHECK) {
  writeFileSync(new URL("./migration-matrix.json", here),
    JSON.stringify({ generated_at: new Date().toISOString(), rows }, null, 2));
}

console.log("\n=== SPRINT 3 MIGRATION MATRIX ===\n");
const col = (s, w) => String(s).padEnd(w);
console.log(col("theme", 20) + col("shipped", 9) + col("gen", 9) + col("cov%", 8) + col("miss", 6) + "modes");
console.log("-".repeat(70));
for (const r of rows) {
  if (r.status === "NO_SHIPPED") { console.log(col(r.slug, 20) + "SHIPPED NOT FOUND IN pinboard-themes.js"); continue; }
  const modes = r.modes ? `L:${r.modes.light_pct}% D:${r.modes.dark_pct}%` : "-";
  const flag = r.pct === 100 ? "✅" : r.pct >= 95 ? "⚠️" : "❌";
  console.log(col(r.slug, 20) + col(r.shipped_sels, 9) + col(r.generated_sels, 9) + col(`${r.pct}% ${flag}`, 8) + col(r.missing_count, 6) + modes);
}
const total = rows.filter(r => r.pct !== undefined);
const at100 = total.filter(r => r.pct === 100).length;
console.log("-".repeat(70));
console.log(`TOTAL: ${at100}/${total.length} themes at 100% selector coverage`);
