import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const sourceRecipePath = resolve(root, "docs/theme-surface/composers/ui-components.mjs");
const sourceLintPath = resolve(root, "docs/theme-surface/tools/recipe-lint.mjs");
const cssSyntaxPath = resolve(root, "docs/theme-surface/tools/css-syntax.mjs");
const applyTokensPath = resolve(root, "docs/theme-surface/tools/apply-tokens.mjs");
const preCommitPath = resolve(root, "scripts/pre-commit-hook.sh");
const setupHooksPath = resolve(root, "scripts/setup-hooks.sh");
const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); };
const temp = mkdtempSync(resolve(tmpdir(), "pbp-theme-tooling-"));

try {
  const recipePath = resolve(temp, "ui-components.mjs");
  const lintPath = resolve(temp, "recipe-lint.mjs");
  const recipeSource = readFileSync(sourceRecipePath, "utf8");
  const originalTransition = "[\"transition\", `background ${motion(ns)}, border-color ${motion(ns)}, color ${motion(ns)}, box-shadow ${motion(ns)}`]";
  const mutatedTransition = "[\"transition\", `background ${motion(ns)}, border-color ${motion(ns)}, color ${motion(ns)}, box-shadow ${motion(ns)}, transform ${motion(ns)}`]";
  check(recipeSource.includes(originalTransition),
    "fixture mutation target must match the real .btn transition recipe");
  writeFileSync(recipePath, recipeSource.replace(originalTransition, mutatedTransition));

  const lintSource = readFileSync(sourceLintPath, "utf8")
    .replace("../composers/ui-components.mjs", pathToFileURL(recipePath).href)
    .replace("./css-syntax.mjs", pathToFileURL(cssSyntaxPath).href)
    .replace(
      'const ROOT = resolve(__dirname, "..", "..", "..");',
      `const ROOT = ${JSON.stringify(root)};`,
    )
    .replace(
      'const SELF_PATH = resolve(__dirname, "..", "composers", "ui-components.mjs");',
      `const SELF_PATH = ${JSON.stringify(recipePath)};`,
    );
  writeFileSync(lintPath, lintSource);

  const result = spawnSync(process.execPath, [lintPath], {
    cwd: root,
    encoding: "utf8",
  });
  const output = `${result.stdout || ""}${result.stderr || ""}`;
  check(result.status === 1,
    `mutated recipe must fail recipe-lint, got exit ${result.status}:\n${output}`);
  check(output.includes("pressInstant: pp .btn"),
    `recipe-lint must report the popup .btn transition mutation:\n${output}`);

  const applyResult = spawnSync(process.execPath, [applyTokensPath, "catppuccin-latte"], {
    cwd: root,
    encoding: "utf8",
  });
  const applyOutput = `${applyResult.stdout || ""}${applyResult.stderr || ""}`;
  check(applyResult.status === 0,
    `apply-tokens read-only check must pass, got exit ${applyResult.status}:\n${applyOutput}`);
  check(!applyOutput.includes('hover-effect:"left-bar"') &&
    !applyOutput.includes('hover-effect:"underline"'),
  `apply-tokens must not recommend retired hover-effect values:\n${applyOutput}`);

  const fakeGitPath = resolve(temp, "git");
  writeFileSync(fakeGitPath, `#!/bin/sh
if [ "$1" = "diff" ]; then
  echo "docs/theme-surface/manifest.json"
elif [ "$1" = "rev-parse" ]; then
  echo ${JSON.stringify(root)}
fi
`);
  chmodSync(fakeGitPath, 0o755);
  const noNodeResult = spawnSync("/bin/sh", [preCommitPath], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, PATH: `${temp}:/usr/bin:/bin` },
  });
  const noNodeOutput = `${noNodeResult.stdout || ""}${noNodeResult.stderr || ""}`;
  check(noNodeResult.status === 1,
    `pre-commit must fail closed when Node is unavailable, got exit ${noNodeResult.status}:\n${noNodeOutput}`);

  const hookRepo = resolve(temp, "hook-repo");
  const hookScripts = resolve(hookRepo, "scripts");
  mkdirSync(hookScripts, { recursive: true });
  const initResult = spawnSync("git", ["init", "--quiet"], { cwd: hookRepo, encoding: "utf8" });
  check(initResult.status === 0, `hook fixture repository must initialize: ${initResult.stderr || initResult.error?.message || ""}`);
  const fixturePreCommit = resolve(hookScripts, "pre-commit-hook.sh");
  const fixtureCommitMsg = resolve(hookScripts, "commit-msg-hook.sh");
  writeFileSync(fixturePreCommit, "#!/bin/sh\nexit 37\n");
  writeFileSync(fixtureCommitMsg, "#!/bin/sh\nexit 0\n");
  chmodSync(fixturePreCommit, 0o755);
  chmodSync(fixtureCommitMsg, 0o755);

  const setupResult = spawnSync("/bin/sh", [setupHooksPath], { cwd: hookRepo, encoding: "utf8" });
  const setupOutput = `${setupResult.stdout || ""}${setupResult.stderr || ""}`;
  check(setupResult.status === 0, `hook setup must pass in a repository fixture:\n${setupOutput}`);
  const installedPreCommit = resolve(hookRepo, ".git/hooks/pre-commit");
  const firstHookRun = spawnSync("/bin/sh", [installedPreCommit], { cwd: hookRepo, encoding: "utf8" });
  check(firstHookRun.status === 37, `installed hook must invoke the tracked fixture script, got ${firstHookRun.status}`);

  writeFileSync(fixturePreCommit, "#!/bin/sh\nexit 0\n");
  const secondHookRun = spawnSync("/bin/sh", [installedPreCommit], { cwd: hookRepo, encoding: "utf8" });
  check(secondHookRun.status === 0,
    `installed hook must pick up tracked script updates without reinstalling, got ${secondHookRun.status}`);
} finally {
  rmSync(temp, { recursive: true, force: true });
}

if (failures.length) {
  console.error(failures.map((message) => `FAIL ${message}`).join("\n"));
  process.exit(1);
}

console.log("theme tooling tests ok");
