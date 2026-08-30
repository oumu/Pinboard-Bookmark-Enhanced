import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const cli = resolve(root, "docs/theme-surface/tools/validate-contracts.mjs");
const pilotsDir = resolve(root, "docs/theme-surface/pilots");
const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); };

function run(args = []) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: "utf8",
  });
}

function outputOf(result) {
  return `${result.stdout || ""}${result.stderr || ""}`;
}

const discoveredPilots = readdirSync(pilotsDir)
  .filter((name) => name.endsWith(".tokens.json"));
const current = run(["--json"]);
check(current.status === 0,
  `current contracts must validate (exit ${current.status}):\n${outputOf(current)}`);
if (current.status === 0) {
  try {
    const report = JSON.parse(current.stdout);
    check(report.ok === true, "JSON report must expose ok=true");
    check(report.pilots === discoveredPilots.length,
      `validator must discover every pilot (${discoveredPilots.length}), got ${report.pilots}`);
    check(report.manifest?.pages > 0 && report.manifest?.surfaces > 0,
      "JSON report must prove the manifest was loaded and cross-validated");
  } catch (error) {
    failures.push(`--json must emit valid JSON: ${error.message}`);
  }
}

const temp = mkdtempSync(join(tmpdir(), "pbp-theme-contract-"));
try {
  const sourcePilot = JSON.parse(readFileSync(resolve(pilotsDir, "github-light.tokens.json"), "utf8"));

  const unknownRootPilot = structuredClone(sourcePilot);
  unknownRootPilot.unknownContractKey = true;
  const unknownRootPath = resolve(temp, "github-light.tokens.json");
  writeFileSync(unknownRootPath, `${JSON.stringify(unknownRootPilot, null, 2)}\n`);
  const unknownRoot = run(["--pilot", unknownRootPath]);
  check(unknownRoot.status === 1,
    `unknown root key must fail validation, got exit ${unknownRoot.status}`);
  check(outputOf(unknownRoot).includes("/unknownContractKey"),
    `unknown root diagnostic must name its JSON pointer:\n${outputOf(unknownRoot)}`);

  const mismatchedIdPilot = structuredClone(sourcePilot);
  mismatchedIdPilot.meta.id = "different-id";
  writeFileSync(unknownRootPath, `${JSON.stringify(mismatchedIdPilot, null, 2)}\n`);
  const mismatchedId = run(["--pilot", unknownRootPath]);
  check(mismatchedId.status === 1,
    `filename/meta.id mismatch must fail validation, got exit ${mismatchedId.status}`);
  check(outputOf(mismatchedId).includes("filename stem"),
    `filename/meta.id diagnostic must explain the mismatch:\n${outputOf(mismatchedId)}`);

  for (const [surface, role] of [["options", "btn-fg"], ["popup", "spinner-fg"]]) {
    const derivedOutputPilot = structuredClone(sourcePilot);
    derivedOutputPilot.ui ??= {};
    derivedOutputPilot.ui[surface] ??= {};
    derivedOutputPilot.ui[surface].light ??= {};
    derivedOutputPilot.ui[surface].light[role] = "#ff00ff";
    writeFileSync(unknownRootPath, `${JSON.stringify(derivedOutputPilot, null, 2)}\n`);
    const derivedOutput = run(["--pilot", unknownRootPath]);
    const derivedOutputText = outputOf(derivedOutput);
    check(derivedOutput.status === 1,
      `${surface}.${role} derived output must fail validation, got exit ${derivedOutput.status}`);
    check(derivedOutputText.includes(`/ui/${surface}/light/${role}`) &&
      derivedOutputText.includes("derived output role"),
    `derived-output diagnostic must name the JSON pointer and explain the contract:\n${derivedOutputText}`);
  }

  const manifest = JSON.parse(readFileSync(resolve(root, "docs/theme-surface/manifest.json"), "utf8"));
  const unlistedManifest = structuredClone(manifest);
  unlistedManifest.page_templates["P1-list"].pages =
    unlistedManifest.page_templates["P1-list"].pages.filter((page) => page !== "home");
  const manifestPath = resolve(temp, "manifest.json");
  writeFileSync(manifestPath, `${JSON.stringify(unlistedManifest, null, 2)}\n`);
  const unlistedPage = run(["--manifest", manifestPath]);
  check(unlistedPage.status === 1,
    `page omitted from its declared template must fail validation, got exit ${unlistedPage.status}`);
  check(outputOf(unlistedPage).includes("not listed by its declared template"),
    `unlisted-page diagnostic must explain the reverse-reference failure:\n${outputOf(unlistedPage)}`);

  delete manifest.surfaces["banner.root"];
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const brokenManifest = run(["--manifest", manifestPath]);
  check(brokenManifest.status === 1,
    `missing template surface must fail manifest validation, got exit ${brokenManifest.status}`);
  check(outputOf(brokenManifest).includes("banner.root"),
    `manifest diagnostic must name the missing surface:\n${outputOf(brokenManifest)}`);
} finally {
  rmSync(temp, { recursive: true, force: true });
}

if (failures.length) {
  console.error(failures.map((message) => `FAIL ${message}`).join("\n"));
  process.exit(1);
}

console.log("theme contract tests ok");
