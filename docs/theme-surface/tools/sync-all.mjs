#!/usr/bin/env node
// sync-all — one-shot orchestrator for the theme-factory pipeline.
//
// Runs in order:
//   1. pilots/render-all.mjs     — regenerate all <slug>.generated.css
//   2. tools/apply-tokens.mjs <slug> --write --force × 13 — push generated
//      blocks into pinboard-themes.js
//   3. tools/diff-all.mjs        — final drift verification (must report 0/0)
//
// Exit code: 0 on full success (rendered + applied + drift==0), 1 on any
// step failure or non-zero drift.
//
// Usage:
//   node docs/theme-surface/tools/sync-all.mjs
//   # or from anywhere with the repo as cwd:
//   node tools/sync-all.mjs

import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SURFACE = resolve(__dirname, "..");
const PILOTS = resolve(SURFACE, "pilots");

const run = (label, args) => {
  const t0 = Date.now();
  const r = spawnSync("node", args, { stdio: ["ignore", "pipe", "inherit"], encoding: "utf8" });
  const ms = Date.now() - t0;
  if (r.status !== 0) {
    console.error(`\n[sync-all] ${label} FAILED (${ms}ms, exit ${r.status})`);
    if (r.stdout) console.error(r.stdout);
    process.exit(1);
  }
  console.log(`[sync-all] ${label} OK (${ms}ms)`);
  return r.stdout;
};

console.log("=== sync-all: theme-factory pipeline ===\n");

console.log("--- step 1/10: render-all ---");
const renderOut = run("render-all", [resolve(PILOTS, "render-all.mjs")]);
const renderTail = renderOut.trim().split("\n").slice(-3).join("\n");
console.log(renderTail + "\n");

console.log("--- step 2/10: apply-ui-themes (--write; popup/options/library @generated:ui-themes regions) ---");
const uiThemesOut = run("apply-ui-themes", [resolve(SURFACE, "tools/apply-ui-themes.mjs"), "--write"]);
console.log(uiThemesOut.trim() + "\n");

console.log("--- step 3/10: apply-tokens × 13 (--force) ---");
const slugs = readdirSync(PILOTS)
  .filter(f => f.endsWith(".tokens.json"))
  .map(f => f.replace(/\.tokens\.json$/, ""))
  .sort();

let totalDelta = 0;
for (const slug of slugs) {
  const out = run(`  apply-tokens ${slug}`, [
    resolve(SURFACE, "tools/apply-tokens.mjs"),
    slug, "--write", "--force"
  ]);
  const m = out.match(/\((\d+) B → (\d+) B\)/);
  if (m) totalDelta += parseInt(m[2]) - parseInt(m[1]);
}
console.log(`[sync-all] total bytes delta across 13 themes: ${totalDelta >= 0 ? "+" : ""}${totalDelta} B\n`);

console.log("--- step 4/10: diff-all (strict) ---");
const diffOut = run("diff-all", [resolve(SURFACE, "tools/diff-all.mjs")]);
const diffTail = diffOut.trim().split("\n").slice(-5).join("\n");
console.log(diffTail);

const totalLine = diffOut.split("\n").find(l => l.startsWith("TOTAL:"));
const m = totalLine && totalLine.match(/(\d+)\/(\d+) perfect.*?(\d+) missing.*?(\d+) extra/);
if (!m) {
  console.error("\n[sync-all] could not parse drift TOTAL line — aborting");
  process.exit(1);
}
const [, perfect, total, missing, extra] = m;
const driftOk = perfect === total && missing === "0" && extra === "0";

console.log("\n--- step 5/10: contrast-audit (WCAG AA gate) ---");
const auditOk = spawnSync("node", [resolve(SURFACE, "tools/contrast-audit.mjs")], { stdio: "inherit" }).status === 0;

console.log("\n--- step 6/10: css-region-audit (popup @generated region drift) ---");
const regionOk = spawnSync("node", [resolve(SURFACE, "tools/css-region-audit.mjs")], { stdio: "inherit" }).status === 0;

console.log("\n--- step 7/10: ui-token-coverage (--pp-* defined per theme) ---");
const tokenOk = spawnSync("node", [resolve(SURFACE, "tools/ui-token-coverage.mjs")], { stdio: "inherit" }).status === 0;

console.log("\n--- step 8/10: layout-lint (warnings advisory; blockers HARD GATE) ---");
const layoutOk = spawnSync("node", [resolve(SURFACE, "tools/layout-lint.mjs")], { stdio: "inherit" }).status === 0;

console.log("\n--- step 9/10: url-lint (hardcoded URL drift) ---");
const urlOk = spawnSync("node", [resolve(SURFACE, "tools/url-lint.mjs")], { stdio: "inherit" }).status === 0;

console.log("\n--- step 10/10: recipe-lint (ui-components.mjs single-source checks) ---");
const recipeOk = spawnSync("node", [resolve(SURFACE, "tools/recipe-lint.mjs")], { stdio: "inherit" }).status === 0;

const ok = driftOk && auditOk && regionOk && tokenOk && layoutOk && urlOk && recipeOk;
console.log(`\n=== sync-all: ${ok ? "✅ ALL GATES PASSED" : "❌ FAILED"} — drift ${driftOk ? "ZERO" : "DETECTED"}, contrast ${auditOk ? "PASS" : "FAIL"}, region ${regionOk ? "PASS" : "FAIL"}, tokens ${tokenOk ? "PASS" : "FAIL"}, layout ${layoutOk ? "PASS" : "FAIL"}, url ${urlOk ? "PASS" : "FAIL"}, recipe ${recipeOk ? "PASS" : "FAIL"} ===`);
process.exit(ok ? 0 : 1);
