import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const cli = resolve(root, "docs/theme-surface/tools/override-debt.mjs");
const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); };
const temp = mkdtempSync(resolve(tmpdir(), "pbp-override-debt-"));
const pilots = resolve(temp, "pilots");
const baseline = resolve(temp, "baseline.json");

function writePilot(slug, css) {
  writeFileSync(resolve(pilots, `${slug}.tokens.json`), `${JSON.stringify({
    meta: { id: slug },
    overrides: { css },
  }, null, 2)}\n`);
}

function run(args = []) {
  return spawnSync(process.execPath, [cli, "--pilots", pilots, "--baseline", baseline, ...args], {
    cwd: root,
    encoding: "utf8",
  });
}

function outputOf(result) {
  return `${result.stdout || ""}${result.stderr || ""}`;
}

try {
  mkdirSync(pilots);
  writePilot("alpha", ".item { color: #111; }");
  writePilot("beta", "@media (min-width: 1px) { .item { color: #222 !important; } }");

  const seeded = run(["--write-baseline"]);
  check(seeded.status === 0, `baseline generation must pass:\n${outputOf(seeded)}`);
  const baselineData = JSON.parse(readFileSync(baseline, "utf8"));
  check(Array.isArray(baselineData.entries) && baselineData.entries.length === 2,
    "baseline must store readable rule/property identities, not only aggregate counts");

  writePilot("alpha", ".item { color: #333; }");
  const valueChange = run();
  check(valueChange.status === 0,
    `changing only a value within an existing debt identity must pass:\n${outputOf(valueChange)}`);

  writePilot("alpha", ".item { background: #333; }");
  const swappedIdentity = run();
  const swappedOutput = outputOf(swappedIdentity);
  check(swappedIdentity.status === 1,
    `delete-one/add-one with the same count must fail identity ratchet, got ${swappedIdentity.status}`);
  check(swappedOutput.includes("alpha") && swappedOutput.includes(".item") &&
    swappedOutput.includes("background"),
  `new-debt diagnostic must name theme, selector and property:\n${swappedOutput}`);

  writePilot("alpha", "");
  const retired = run();
  check(retired.status === 0 && outputOf(retired).includes("retired 1"),
    `removing debt must pass and report the retired identity:\n${outputOf(retired)}`);
} finally {
  rmSync(temp, { recursive: true, force: true });
}

if (failures.length) {
  console.error(failures.map((message) => `FAIL ${message}`).join("\n"));
  process.exit(1);
}

console.log("theme override debt tests ok");
