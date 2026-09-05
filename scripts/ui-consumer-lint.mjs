#!/usr/bin/env node
// ui-consumer-lint — the edit-time face of the UI design-language gates.
//
// Wired as a Claude Code PostToolUse hook (.claude/settings.json) on Edit /
// Write / MultiEdit. It reads the hook payload from stdin, and when the edited
// file is one of the UI consumer surfaces (popup/options/library/md-preview
// HTML, their JS, shared.js, md-preview.css) it runs the two sub-second static
// gates -- layout-lint (inline spacing, RULE 5) and ui-vocabulary-lint (new
// structural class tokens) -- and exits 2 with the findings on stderr so the
// violation reaches the model in the same turn it was written, not at commit
// time. Any other file, or no stdin, exits 0 silently. It never edits anything.
//
// Manual use: node scripts/ui-consumer-lint.mjs --file options.html

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const GOVERNED = /^(?:(?:popup|options|library|md-preview)\.html|(?:popup|options|library)(?:-[a-z-]+)?\.js|md-[a-z-]+\.js|shared\.js|md-preview\.css|docs\/theme-surface\/ui-vocabulary\.json|scripts\/ui-vocabulary-baseline\.json)$/;

function targetFromArgsOrStdin() {
  const i = process.argv.indexOf("--file");
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  let raw = "";
  try { raw = readFileSync(0, "utf8"); } catch (_) { return null; }
  if (!raw.trim()) return null;
  try {
    const payload = JSON.parse(raw);
    return payload?.tool_input?.file_path || payload?.tool_response?.filePath || null;
  } catch (_) { return null; }
}

const target = targetFromArgsOrStdin();
if (!target) process.exit(0);
const rel = relative(ROOT, resolve(ROOT, target)).replace(/\\/g, "/");
if (!GOVERNED.test(rel)) process.exit(0);

const gates = [
  ["layout-lint", resolve(ROOT, "docs/theme-surface/tools/layout-lint.mjs")],
  ["ui-vocabulary", resolve(ROOT, "scripts/ui-vocabulary-lint.mjs")],
];
const failures = [];
for (const [name, script] of gates) {
  const r = spawnSync(process.execPath, [script], { cwd: ROOT, encoding: "utf8" });
  if (r.status !== 0) {
    const out = `${r.stdout || ""}${r.stderr || ""}`.split("\n").filter((l) => /BLOCK|FAIL|ERROR/.test(l)).join("\n");
    failures.push(`[${name}] ${rel}\n${out}`);
  }
}
if (failures.length) {
  process.stderr.write(`UI design-language gate failed after editing ${rel}:\n${failures.join("\n")}\nRules: .claude/rules/ui-primitives.md (three questions for any new element). Fix before moving on.\n`);
  process.exit(2);
}
process.exit(0);
