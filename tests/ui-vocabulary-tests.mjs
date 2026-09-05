// CLI behaviour of scripts/ui-vocabulary-lint.mjs -- mirrors
// tests/theme-override-debt-tests.mjs: the gate is a ratchet over
// (surface, class token) identities, so the contract to pin is "removals pass,
// additions block, only --write-baseline writes", plus the extraction paths
// (HTML class attributes AND JS class literals) and the wiring.
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { tmpdir } from "node:os";

const root = resolve(import.meta.dirname, "..");
const lintPath = resolve(root, "scripts/ui-vocabulary-lint.mjs");
const fail = [];
const check = (ok, msg) => { if (!ok) fail.push(msg); };

const temp = mkdtempSync(resolve(tmpdir(), "pbp-ui-vocab-"));
try {
  mkdirSync(resolve(temp, "docs/theme-surface"), { recursive: true });
  mkdirSync(resolve(temp, "scripts"), { recursive: true });
  const registry = {
    version: 1,
    structuralPattern: "(^|-)(row|actions|bar|card)$",
    surfaces: {
      demo: { files: ["demo.html", "demo.js"], exactStructural: ["fg"], primitives: ["fg", "fg-actions"], regions: ["header-bar"], components: ["btn"] },
    },
  };
  const registryPath = resolve(temp, "docs/theme-surface/ui-vocabulary.json");
  const baselinePath = resolve(temp, "scripts/ui-vocabulary-baseline.json");
  writeFileSync(registryPath, JSON.stringify(registry));
  const write = (html, js) => {
    writeFileSync(resolve(temp, "demo.html"), html);
    writeFileSync(resolve(temp, "demo.js"), js);
  };
  const run = (...args) => spawnSync(process.execPath, [lintPath, "--root", temp, "--registry", registryPath, "--baseline", baselinePath, ...args], { encoding: "utf8" });

  // 1. registered primitives/regions/components pass without any baseline
  write('<div class="fg"><div class="fg-actions"><button class="btn">x</button></div></div><div class="header-bar"></div>', "");
  let r = run();
  check(r.status === 0, `registered tokens must pass without a baseline, got ${r.status}:\n${r.stdout}${r.stderr}`);

  // 2. an unregistered structural token blocks and names file, line and the nearest primitive
  write('<div class="fg">\n<div class="legacy-row"></div></div>', "");
  r = run();
  check(r.status === 1, `unregistered structural token must block, got ${r.status}`);
  check(/demo\.html:2\s+BLOCK\s+new structural class "\.legacy-row"/.test(r.stdout), `BLOCK line must name file, line and token:\n${r.stdout}`);
  check(/\.fg-actions/.test(r.stdout), "BLOCK line must suggest a registered primitive");

  // 3. --write-baseline records it (structural: true) and the gate passes again
  r = run("--write-baseline");
  check(r.status === 0 && existsSync(baselinePath), "write-baseline must exit 0 and create the file");
  const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
  check(baseline.version === 1 && baseline.entries.length === 1 && baseline.entries[0].token === "legacy-row" && baseline.entries[0].structural === true,
    `baseline must hold readable identities, got ${JSON.stringify(baseline.entries)}`);
  r = run();
  check(r.status === 0, `baselined token must pass, got ${r.status}:\n${r.stdout}`);

  // 4. JS class literals are extracted: className, classList.add, template class="...", el(tag, cls)
  write('<div class="fg"><div class="legacy-row"></div></div>',
    'a.className = "js-actions";\nb.classList.add("state-on", "second-card");\nc.innerHTML = `<div class="tpl-bar"></div>`;\nel("div", "helper-row");');
  r = run();
  check(r.status === 1, "structural tokens minted in JS must block");
  for (const tok of ["js-actions", "second-card", "tpl-bar", "helper-row"]) check(r.stdout.includes(`".${tok}"`), `JS literal .${tok} must be extracted`);
  check(/WARN\s+new class "\.state-on"/.test(r.stdout), "non-structural new token is advisory (WARN), not a blocker");

  // 5. removal passes and is reported as retired; a delete-one/add-one swap still blocks
  write('<div class="fg"></div>', "");
  r = run();
  check(r.status === 0 && /retired/.test(r.stdout), `retiring a baselined token must pass and be reported:\n${r.stdout}`);
  write('<div class="fg"><div class="other-row"></div></div>', "");
  r = run();
  check(r.status === 1, "swapping one legacy token for another (flat count) must block");

  // 6. malformed baseline / unknown flag fail loudly
  writeFileSync(baselinePath, JSON.stringify({ version: 2, entries: [] }));
  r = run();
  check(r.status === 1 && /unsupported baseline shape/.test(r.stderr), "unsupported baseline must fail with a message");
  r = run("--bogus");
  check(r.status === 1 && /unknown argument/.test(r.stderr), "unknown flag must fail");
} finally {
  rmSync(temp, { recursive: true, force: true });
}

// wiring: the gate must be reachable from pre-commit (UI consumer group), verify.sh and the edit-time hook
const preCommit = readFileSync(resolve(root, "scripts/pre-commit-hook.sh"), "utf8");
const verify = readFileSync(resolve(root, "scripts/verify.sh"), "utf8");
check(preCommit.includes("scripts/ui-vocabulary-lint.mjs"), "pre-commit must run the ui-vocabulary gate");
check(/UI_VOCAB_RE=.*\(popup\|options\|library\|md-preview\)\\\.html/.test(preCommit), "pre-commit must trigger the UI consumer group on the four surface HTML files");
check(verify.includes('node "scripts/ui-vocabulary-lint.mjs"'), "verify must run the ui-vocabulary gate");
const hookSettings = resolve(root, ".claude/settings.json");
check(existsSync(hookSettings) && /ui-consumer-lint\.mjs/.test(readFileSync(hookSettings, "utf8")), ".claude/settings.json must wire scripts/ui-consumer-lint.mjs as a PostToolUse hook");
// the registry itself must parse and every registered surface file must exist
const reg = JSON.parse(readFileSync(resolve(root, "docs/theme-surface/ui-vocabulary.json"), "utf8"));
for (const [name, s] of Object.entries(reg.surfaces)) for (const f of s.files) check(existsSync(resolve(root, f)), `ui-vocabulary.json: surface ${name} lists missing file ${f}`);

if (fail.length) { console.error(fail.map((m) => `FAIL ${m}`).join("\n")); process.exit(1); }
console.log("ui vocabulary tests ok");
