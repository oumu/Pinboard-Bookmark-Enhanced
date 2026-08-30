import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const syncAll = resolve(root, "docs/theme-surface/tools/sync-all.mjs");
const pilotDir = resolve(root, "docs/theme-surface/pilots");
const generatedPilotArtifacts = readdirSync(pilotDir)
  .filter((name) => name.endsWith(".generated.css") || name.endsWith(".apply-report.json") ||
    name === "migration-matrix.json" || name === "drift-matrix.json")
  .map((name) => resolve(pilotDir, name));
const watched = [
  "pinboard-themes.js",
  "popup.css",
  "options.css",
  "library.css",
].map((path) => resolve(root, path)).concat(generatedPilotArtifacts).filter(existsSync);

const before = new Map(watched.map((path) => [path, {
  content: readFileSync(path),
  mtimeMs: statSync(path).mtimeMs,
}]));

const result = spawnSync(process.execPath, [syncAll, "--check"], {
  cwd: root,
  encoding: "utf8",
});
const output = `${result.stdout || ""}${result.stderr || ""}${result.error ? `\n${result.error.code || result.error.name}: ${result.error.message}` : ""}`;
const failures = [];
if (result.status !== 0) failures.push(`sync-all --check must pass on a synchronized tree (exit ${result.status}):\n${output}`);
if (!output.includes("check mode")) failures.push(`sync-all --check must identify read-only mode:\n${output}`);

for (const [path, snapshot] of before) {
  const after = statSync(path);
  if (!readFileSync(path).equals(snapshot.content)) failures.push(`sync-all --check changed file content: ${path}`);
  if (after.mtimeMs !== snapshot.mtimeMs) failures.push(`sync-all --check wrote to file: ${path}`);
}

if (failures.length) {
  console.error(failures.map((message) => `FAIL ${message}`).join("\n"));
  process.exit(1);
}

console.log("theme sync check tests ok");
