#!/usr/bin/env node
// sync-all — one-shot orchestrator for the theme-factory pipeline.
//
// Runs in order (12 steps; see the numbered console.log lines below for the
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
//  12. tools/override-debt.mjs        — structural ratchet for overrides.css
//
// Exit code: 0 when every step above passes, 1 on any step failure.
//
// Usage:
//   node docs/theme-surface/tools/sync-all.mjs
//   node docs/theme-surface/tools/sync-all.mjs --check  # verify, write nothing
//   # or from anywhere with the repo as cwd:
//   node tools/sync-all.mjs

import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SURFACE = resolve(__dirname, "..");
const PILOTS = resolve(SURFACE, "pilots");
const args = process.argv.slice(2);
const unknown = args.filter((arg) => arg !== "--check");
if (unknown.length) {
  console.error(`usage: sync-all.mjs [--check]\nunknown argument(s): ${unknown.join(", ")}`);
  process.exit(2);
}
const CHECK = args.includes("--check");

const run = (label, args) => {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, args, { stdio: ["ignore", "pipe", "inherit"], encoding: "utf8" });
  const ms = Date.now() - t0;
  if (r.error) {
    console.error(`\n[sync-all] ${label} COULD NOT START (${ms}ms): ${r.error.code || r.error.name}: ${r.error.message}`);
    process.exit(1);
  }
  if (r.status !== 0) {
    console.error(`\n[sync-all] ${label} FAILED (${ms}ms, exit ${r.status})`);
    if (r.stdout) console.error(r.stdout);
    process.exit(1);
  }
  console.log(`[sync-all] ${label} OK (${ms}ms)`);
  return r.stdout;
};

const runGate = (label, path) => {
  const r = spawnSync(process.execPath, [path], { stdio: "inherit" });
  if (r.error) {
    console.error(`[sync-all] ${label} COULD NOT START: ${r.error.code || r.error.name}: ${r.error.message}`);
    return false;
  }
  return r.status === 0;
};

console.log(`=== sync-all: theme-factory pipeline (${CHECK ? "check mode; read-only" : "write mode"}) ===\n`);

console.log("--- step 1/12: validate-contracts ---");
const contractOut = run("validate-contracts", [resolve(SURFACE, "tools/validate-contracts.mjs")]);
console.log(contractOut.trim() + "\n");

console.log("--- step 2/12: render-all ---");
const renderOut = run("render-all", [
  resolve(PILOTS, "render-all.mjs"),
  ...(CHECK ? ["--check"] : []),
]);
const renderTail = renderOut.trim().split("\n").slice(-3).join("\n");
console.log(renderTail + "\n");

console.log(`--- step 3/12: apply-ui-themes (${CHECK ? "check" : "--write"}; popup/options/library generated regions) ---`);
const uiThemesOut = run("apply-ui-themes", [
  resolve(SURFACE, "tools/apply-ui-themes.mjs"),
  ...(CHECK ? [] : ["--write"]),
]);
console.log(uiThemesOut.trim() + "\n");

console.log("--- step 4/12: apply-tokens (--force) ---");
const slugs = readdirSync(PILOTS)
  .filter(f => f.endsWith(".tokens.json"))
  .map(f => f.replace(/\.tokens\.json$/, ""))
  .sort();

let totalDelta = 0;
for (const slug of slugs) {
  const out = run(`  apply-tokens ${slug}`, [
    resolve(SURFACE, "tools/apply-tokens.mjs"),
    slug,
    ...(CHECK ? ["--check"] : ["--write", "--force"]),
  ]);
  const m = out.match(/\((\d+) B → (\d+) B\)/);
  if (m) totalDelta += parseInt(m[2]) - parseInt(m[1]);
}
console.log(`[sync-all] total bytes delta across ${slugs.length} themes: ${totalDelta >= 0 ? "+" : ""}${totalDelta} B\n`);

console.log("--- step 5/12: diff-all (strict) ---");
const diffOut = run("diff-all", [
  resolve(SURFACE, "tools/diff-all.mjs"),
  "--strict",
  ...(CHECK ? ["--check"] : []),
]);
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

console.log("\n--- step 6/12: contrast-audit (WCAG AA gate) ---");
const auditOk = runGate("contrast-audit", resolve(SURFACE, "tools/contrast-audit.mjs"));

console.log("\n--- step 7/12: css-region-audit (popup @generated region drift) ---");
const regionOk = runGate("css-region-audit", resolve(SURFACE, "tools/css-region-audit.mjs"));

console.log("\n--- step 8/12: ui-token-coverage (--pp-* defined per theme) ---");
const tokenOk = runGate("ui-token-coverage", resolve(SURFACE, "tools/ui-token-coverage.mjs"));

console.log("\n--- step 9/12: layout-lint (warnings advisory; blockers HARD GATE) ---");
const layoutOk = runGate("layout-lint", resolve(SURFACE, "tools/layout-lint.mjs"));

console.log("\n--- step 10/12: url-lint (hardcoded URL drift) ---");
const urlOk = runGate("url-lint", resolve(SURFACE, "tools/url-lint.mjs"));

console.log("\n--- step 11/12: recipe-lint (ui-components.mjs single-source checks) ---");
const recipeOk = runGate("recipe-lint", resolve(SURFACE, "tools/recipe-lint.mjs"));

console.log("\n--- step 12/12: override-debt (structural escape-hatch ratchet) ---");
const overrideDebtOk = runGate("override-debt", resolve(SURFACE, "tools/override-debt.mjs"));

const ok = driftOk && auditOk && regionOk && tokenOk && layoutOk && urlOk && recipeOk && overrideDebtOk;
console.log(`\n=== sync-all: ${ok ? "✅ ALL GATES PASSED" : "❌ FAILED"} — drift ${driftOk ? "ZERO" : "DETECTED"}, contrast ${auditOk ? "PASS" : "FAIL"}, region ${regionOk ? "PASS" : "FAIL"}, tokens ${tokenOk ? "PASS" : "FAIL"}, layout ${layoutOk ? "PASS" : "FAIL"}, url ${urlOk ? "PASS" : "FAIL"}, recipe ${recipeOk ? "PASS" : "FAIL"}, override-debt ${overrideDebtOk ? "PASS" : "FAIL"} ===`);
process.exit(ok ? 0 : 1);
