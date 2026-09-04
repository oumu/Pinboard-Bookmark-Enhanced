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
const syncAllPath = resolve(root, "docs/theme-surface/tools/sync-all.mjs");
const preCommitPath = resolve(root, "scripts/pre-commit-hook.sh");
const verifyPath = resolve(root, "scripts/verify.sh");
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

  const syncAllSource = readFileSync(syncAllPath, "utf8");
  const preCommitSource = readFileSync(preCommitPath, "utf8");
  const verifySource = readFileSync(verifyPath, "utf8");
  for (const required of [
    "tests/theme-ui-derive-tests.mjs",
    "tests/theme-override-debt-tests.mjs",
  ]) {
    check(preCommitSource.includes(required),
      `pre-commit must run ${required}`);
    check(verifySource.includes(required),
      `verify must run ${required}`);
  }
  check(syncAllSource.includes('runGate("override-debt"'),
    "sync-all must run the override-debt gate");
  check(verifySource.includes('node "docs/theme-surface/tools/override-debt.mjs"'),
    "verify must run the repository override-debt baseline gate");
  check(verifySource.includes('node "tests/theme-media-audit-tests.mjs"'),
    "verify must run the media-preference oracle tests");
  check(preCommitSource.includes("tools/override-debt-baseline\\.json"),
    "pre-commit trigger must include the override-debt baseline");

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

  const driftCheckClean = spawnSync("/bin/sh", [setupHooksPath, "--check"], { cwd: hookRepo, encoding: "utf8" });
  check(driftCheckClean.status === 0,
    `hook drift check must pass right after installation, got ${driftCheckClean.status}:\n${driftCheckClean.stdout || ""}${driftCheckClean.stderr || ""}`);

  writeFileSync(installedPreCommit, "#!/bin/sh\n# stale full-text copy of an older hook script\nexit 0\n");
  chmodSync(installedPreCommit, 0o755);
  const driftCheckStale = spawnSync("/bin/sh", [setupHooksPath, "--check"], { cwd: hookRepo, encoding: "utf8" });
  const driftStaleOutput = `${driftCheckStale.stdout || ""}${driftCheckStale.stderr || ""}`;
  check(driftCheckStale.status !== 0,
    `hook drift check must fail on a hook that no longer delegates to the tracked script, got ${driftCheckStale.status}`);
  check(driftStaleOutput.includes("scripts/setup-hooks.sh"),
    `hook drift check must name the reinstall remedy:\n${driftStaleOutput}`);
  check(readFileSync(installedPreCommit, "utf8").includes("stale full-text copy"),
    "hook drift check must report drift instead of silently reinstalling");

  // An installed delegator that lost its executable bit is drift too, and the
  // most dangerous kind: git skips a non-executable hook with one hint line and
  // commits anyway, so the gates stop running while --check (and verify.sh's
  // [hooks] section, which reads its exit status) would otherwise say they do.
  const setupAgain = spawnSync("/bin/sh", [setupHooksPath], { cwd: hookRepo, encoding: "utf8" });
  check(setupAgain.status === 0,
    `reinstalling the fixture hooks must succeed: ${setupAgain.stdout || ""}${setupAgain.stderr || ""}`);
  chmodSync(installedPreCommit, 0o644);
  const driftCheckNotExec = spawnSync("/bin/sh", [setupHooksPath, "--check"], { cwd: hookRepo, encoding: "utf8" });
  const notExecOutput = `${driftCheckNotExec.stdout || ""}${driftCheckNotExec.stderr || ""}`;
  check(driftCheckNotExec.status !== 0,
    `hook drift check must fail on an installed hook git cannot execute, got ${driftCheckNotExec.status}`);
  check(notExecOutput.includes("scripts/setup-hooks.sh"),
    `the not-executable report must name the reinstall remedy:\n${notExecOutput}`);

  rmSync(installedPreCommit, { force: true });
  const driftCheckMissing = spawnSync("/bin/sh", [setupHooksPath, "--check"], { cwd: hookRepo, encoding: "utf8" });
  check(driftCheckMissing.status === 0,
    `hook drift check must skip hooks that are not installed at all (fresh CI checkout), got ${driftCheckMissing.status}`);

  // install_hook aborts the whole setup when a tracked hook script is not
  // executable, so every fresh clone would end up with no gates at all. The
  // invariant is stated as a CLASS -- "every tracked script install_hook
  // requires -x for" -- read out of setup-hooks.sh itself, so adding a third
  // hook is covered without editing this assertion. 1f6ec40 fixed the mode on
  // the two current scripts; nothing pinned it until now.
  const setupSource = readFileSync(setupHooksPath, "utf8");
  const installedScripts = [...setupSource.matchAll(/^install_hook "([^"]+)"/gm)].map((m) => m[1]);
  check(installedScripts.length >= 2,
    `could not read the install_hook script list out of setup-hooks.sh, found ${installedScripts.length}`);
  const lsFiles = spawnSync("git", ["ls-files", "-s", ...installedScripts.map((n) => `scripts/${n}`)],
    { cwd: root, encoding: "utf8" });
  check(lsFiles.status === 0, `git ls-files must read the tracked hook script modes: ${lsFiles.stderr || ""}`);
  const modeRows = (lsFiles.stdout || "").trim().split("\n").filter(Boolean)
    .map((line) => ({ mode: line.slice(0, 6), path: line.trim().split("\t")[1] }));
  check(modeRows.length === installedScripts.length,
    `git ls-files listed ${modeRows.length} of ${installedScripts.length} hook scripts`);
  const notExecutable = modeRows.filter((row) => row.mode !== "100755").map((row) => `${row.path} (${row.mode})`);
  check(notExecutable.length === 0,
    `every tracked hook script must be committed executable, or setup-hooks.sh aborts and a fresh clone gets no gates: ${notExecutable.join(", ")}`);

  // The release-notes generator is the one piece of the release chain nothing
  // ever runs before a publish: CI runs release.sh --build-only, which exits at
  // Step 1.5, and Step 3 is where this lives. A syntax error would at least
  // abort under `set -euo pipefail`; a grouping mistake would not -- it would
  // quietly publish wrong notes. Drive it on a fixture history written the way
  // git actually stores commits (subject, blank line, body).
  const changelogPath = resolve(root, "scripts/changelog.py");
  const releaseSource = readFileSync(resolve(root, "scripts/release.sh"), "utf8");
  check(releaseSource.includes('python3 "${REPO_ROOT}/scripts/changelog.py"'),
    "release.sh must generate its changelog through scripts/changelog.py, or this fixture tests a file nothing runs");
  const clRepo = resolve(temp, "changelog-repo");
  mkdirSync(clRepo, { recursive: true });
  const git = (...args) => spawnSync("git", args, { cwd: clRepo, encoding: "utf8" });
  git("init", "--quiet");
  git("config", "user.email", "fixture@example.invalid");
  git("config", "user.name", "Changelog Fixture");
  git("config", "commit.gpgsign", "false");
  const fixtureCommits = [
    "chore: bump manifest to 9.9.9",
    "docs: update version badge",
    "feat(tags): group the low-count list",
    "fix(security): stop putting the token in the URL",
    "fix(popup): keep the queue bar honest\n\nA body paragraph.\n\nfix(nothing): a body line that only LOOKS like a subject",
    "refactor(store)!: drop the legacy record shape",
    "perf(reader): reuse the parsed document\n\nBREAKING CHANGE: the export helper signature moved.",
    "style(options): tighten the help column\n\nBREAKING-CHANGE: the stored token is now required.",
    "chore(deps): retire the vendored copy\n\nBREAKING CHANGE: the vendored copy is gone.",
    "wip on the thing",
  ];
  for (const message of fixtureCommits) {
    writeFileSync(resolve(clRepo, "file.txt"), message);
    git("add", "-A");
    const made = spawnSync("git", ["commit", "--quiet", "--no-verify", "-m", message],
      { cwd: clRepo, encoding: "utf8" });
    check(made.status === 0, `changelog fixture commit failed (${message.split("\n")[0]}): ${made.stderr || ""}`);
  }
  const clRun = spawnSync("python3", [changelogPath, "", "HEAD"], { cwd: clRepo, encoding: "utf8" });
  const notes = clRun.stdout || "";
  const clNotes = clRun.stderr || "";
  check(clRun.status === 0,
    `changelog.py must render a fixture history, got exit ${clRun.status}:\n${clNotes}`);
  const section = (label) => {
    const at = notes.indexOf(`### ${label}`);
    if (at === -1) return "";
    const next = notes.indexOf("\n### ", at + 1);
    return next === -1 ? notes.slice(at) : notes.slice(at, next);
  };
  const breaking = section("Breaking Changes");
  // Both footer spellings and the `!` subject, and the `!` outranking the skip
  // list -- these are the four triggers scripts/bump-version.sh reads for major.
  check(breaking.includes("refactor(store)!: drop the legacy record shape"),
    `a "!" subject is not in Breaking Changes (and its "!" must survive into the notes):\n${notes}`);
  check(breaking.includes("reuse the parsed document"),
    `a BREAKING CHANGE footer did not reach Breaking Changes:\n${notes}`);
  check(breaking.includes("tighten the help column"),
    `a BREAKING-CHANGE footer did not reach Breaking Changes:\n${notes}`);
  check(breaking.includes("chore(deps): retire the vendored copy"),
    `a breaking chore must outrank the chore skip pattern:\n${notes}`);
  check(section("Security").includes("stop putting the token in the URL") &&
    !section("Bug Fixes").includes("stop putting the token in the URL"),
    `fix(security) must be grouped under Security, not Bug Fixes:\n${notes}`);
  // The record separator: a body with blank lines must not split one commit
  // into several, nor swallow the commit that follows it.
  check(section("Bug Fixes").includes("keep the queue bar honest") &&
    !notes.includes("only LOOKS like a subject"),
    `a body line was rendered as its own entry -- the %x1f/%x1e record split is broken:\n${notes}`);
  check(section("New Features").includes("group the low-count list"),
    `a feat commit did not reach New Features:\n${notes}`);
  check(!notes.includes("bump manifest") && !notes.includes("update version badge"),
    `release bookkeeping is still rendered into the notes:\n${notes}`);
  // Unmatched subjects vanish from the notes, so they have to be announced.
  check(clNotes.includes("wip on the thing"),
    `a commit no group claimed must be reported on stderr:\n${clNotes}`);
} finally {
  rmSync(temp, { recursive: true, force: true });
}

if (failures.length) {
  console.error(failures.map((message) => `FAIL ${message}`).join("\n"));
  process.exit(1);
}

console.log("theme tooling tests ok");
