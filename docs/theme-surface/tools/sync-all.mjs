#!/usr/bin/env node
// sync-all — one-shot orchestrator for the theme-factory pipeline.
//
// Runs in order (11 steps; see the numbered console.log lines below for the
// authoritative list — this comment summarizes, it is not the source of
// truth):
//   1. tools/validate-contracts.mjs  — pilot schema + manifest cross-check
//   2. pilots/render-all.mjs         — regenerate all <slug>.generated.css
//   3. tools/apply-ui-themes.mjs --write — write BOTH generated regions
//      (@generated:ui-themes + @generated:ui-components) into popup.css /
//      options.css / library.css
//   4. tools/apply-tokens.mjs <slug> --write --force — push generated
//      blocks into pinboard-themes.js
//   5. tools/diff-all.mjs --strict   — drift verification (must report 0/0)
//   6. tools/contrast-audit.mjs      — WCAG AA / component-pair gate
//   7. tools/css-region-audit.mjs    — all 6 generated regions un-hand-edited
//   8. tools/ui-token-coverage.mjs   — every consumed --pp-*/--opt-*/--lib-*
//      token resolves per theme
//   9. tools/layout-lint.mjs         — advisory warnings + hard blockers
//  10. tools/url-lint.mjs            — hardcoded URL drift
//  11. tools/recipe-lint.mjs         — ui-components.mjs single-source checks
//
// Exit code: 0 when every step above passes, 1 on any step failure.
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

console.log("--- step 1/11: validate-contracts ---");
const contractOut = run("validate-contracts", [resolve(SURFACE, "tools/validate-contracts.mjs")]);
console.log(contractOut.trim() + "\n");

console.log("--- step 2/11: render-all ---");
const renderOut = run("render-all", [resolve(PILOTS, "render-all.mjs")]);
const renderTail = renderOut.trim().split("\n").slice(-3).join("\n");
console.log(renderTail + "\n");

console.log("--- step 3/11: apply-ui-themes (--write; popup/options/library @generated:ui-themes regions) ---");
const uiThemesOut = run("apply-ui-themes", [resolve(SURFACE, "tools/apply-ui-themes.mjs"), "--write"]);
console.log(uiThemesOut.trim() + "\n");

console.log("--- step 4/11: apply-tokens (--force) ---");
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
console.log(`[sync-all] total bytes delta across ${slugs.length} themes: ${totalDelta >= 0 ? "+" : ""}${totalDelta} B\n`);

console.log("--- step 5/11: diff-all (strict) ---");
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

console.log("\n--- step 6/11: contrast-audit (WCAG AA gate) ---");
const auditOk = spawnSync("node", [resolve(SURFACE, "tools/contrast-audit.mjs")], { stdio: "inherit" }).status === 0;

console.log("\n--- step 7/11: css-region-audit (popup @generated region drift) ---");
const regionOk = spawnSync("node", [resolve(SURFACE, "tools/css-region-audit.mjs")], { stdio: "inherit" }).status === 0;

console.log("\n--- step 8/11: ui-token-coverage (--pp-* defined per theme) ---");
const tokenOk = spawnSync("node", [resolve(SURFACE, "tools/ui-token-coverage.mjs")], { stdio: "inherit" }).status === 0;

console.log("\n--- step 9/11: layout-lint (warnings advisory; blockers HARD GATE) ---");
const layoutOk = spawnSync("node", [resolve(SURFACE, "tools/layout-lint.mjs")], { stdio: "inherit" }).status === 0;

console.log("\n--- step 10/11: url-lint (hardcoded URL drift) ---");
const urlOk = spawnSync("node", [resolve(SURFACE, "tools/url-lint.mjs")], { stdio: "inherit" }).status === 0;

console.log("\n--- step 11/11: recipe-lint (ui-components.mjs single-source checks) ---");
const recipeOk = spawnSync("node", [resolve(SURFACE, "tools/recipe-lint.mjs")], { stdio: "inherit" }).status === 0;

const ok = driftOk && auditOk && regionOk && tokenOk && layoutOk && urlOk && recipeOk;
console.log(`\n=== sync-all: ${ok ? "✅ ALL GATES PASSED" : "❌ FAILED"} — drift ${driftOk ? "ZERO" : "DETECTED"}, contrast ${auditOk ? "PASS" : "FAIL"}, region ${regionOk ? "PASS" : "FAIL"}, tokens ${tokenOk ? "PASS" : "FAIL"}, layout ${layoutOk ? "PASS" : "FAIL"}, url ${urlOk ? "PASS" : "FAIL"}, recipe ${recipeOk ? "PASS" : "FAIL"} ===`);
process.exit(ok ? 0 : 1);
