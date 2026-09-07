#!/bin/sh
set -eu

ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"

set -- tests/*-tests.html
if [ ! -f "$1" ]; then
  echo "[browser] no tests/*-tests.html suites found" >&2
  exit 1
fi

if [ ! -d ".qa-scan/node_modules/playwright" ]; then
  echo "[browser] Playwright is not installed; run: npm ci --prefix .qa-scan" >&2
  exit 1
fi

echo "[browser] running $# HTML suites"
browser_failures=0
# Run the 358-case synchronous conversion suite before the lighter pages.
echo "[browser] tests/md-convert-tests.html"
if ! node ".qa-scan/run-test.mjs" "tests/md-convert-tests.html"; then
  browser_failures=$((browser_failures + 1))
fi
for suite do
  if [ "$suite" = "tests/md-convert-tests.html" ]; then
    continue
  fi
  echo "[browser] $suite"
  if ! node ".qa-scan/run-test.mjs" "$suite"; then
    browser_failures=$((browser_failures + 1))
  fi
done
if [ "$browser_failures" -ne 0 ]; then
  echo "[browser] $browser_failures suite(s) failed" >&2
  exit 1
fi

echo "[syntax] checking JavaScript"
git ls-files -- '*.js' '*.mjs' |
  while IFS= read -r file; do
    node --check "$file"
  done

echo "[eslint] correctness lint over runtime scripts (config: eslint.config.mjs)"
# ESLint lives in .qa-scan's dev-only node_modules (same precedent as
# playwright); the flat config self-collects this repo's cross-file globals.
ESLINT_USE_FLAT_CONFIG=true npx --prefix .qa-scan eslint .

echo "[vendor-lock] verifying vendored artifacts against vendor/vendor-lock.json"
node "scripts/vendor-lock-check.mjs"

echo "[network-exits] cross-checking runtime hosts vs docs/network-exits.json vs privacy.md"
node "scripts/network-exits-check.mjs"

echo "[ui-contract] checking static UI contracts"
node "tests/ui-contract-tests.mjs"

echo "[ui-vocabulary] checking structural class tokens against the registry and the legacy baseline"
node "scripts/ui-vocabulary-lint.mjs"
node "tests/ui-vocabulary-tests.mjs"

echo "[render-audit] checking hand-written render oracle (contrast + geometry + media preferences)"
# This single gate was ~80% of this script's wall clock (440s of ~550s; 4
# shards bring it to 154s and this script to 264s): 3 surfaces x 15 themes of
# real getComputedStyle/geometry in a headed Chromium, ~9s per (surface,
# theme) trip. The active theme lives in the extension's service-worker
# storage, so one browser holds exactly one theme at a time and the split
# has to be process-level: each shard loads its own unpacked
# extension (~3s), replays the identical fixture seeding and judges its own
# slice of THEMES against known-failures, so ANY shard's non-zero exit fails
# this gate. Shard 0 also runs the single sweep pass (families 4-11 + the
# spacingScale ledger). Capped at 4 because every shard is a whole headed
# Chromium and the per-shard fixed cost (launch + shard 0's sweep) stops
# paying past that; 1 shard means no --shard flag at all, i.e. exactly the
# invocation this line used to be.
# PBP_RENDER_SHARDS lets CI override the shard count (e.g. a constrained
# runner) without editing this script; it must be a positive integer or the
# computed default below is used instead.
RENDER_SHARDS_DEFAULT=$(node -e 'const n=(require("node:os").cpus()||[]).length||1;process.stdout.write(String(Math.max(1,Math.min(4,n))))')
case "${PBP_RENDER_SHARDS:-}" in
  '')
    RENDER_SHARDS="$RENDER_SHARDS_DEFAULT"
    ;;
  *[!0-9]*|0)
    echo "[render-audit] ignoring invalid PBP_RENDER_SHARDS=\"$PBP_RENDER_SHARDS\" (must be a positive integer); using $RENDER_SHARDS_DEFAULT" >&2
    RENDER_SHARDS="$RENDER_SHARDS_DEFAULT"
    ;;
  *)
    RENDER_SHARDS="$PBP_RENDER_SHARDS"
    ;;
esac
if [ "$RENDER_SHARDS" -le 1 ]; then
  node "scripts/ui-render-audit.mjs"
else
  echo "[render-audit] running $RENDER_SHARDS shards in parallel"
  RENDER_DIR=$(mktemp -d)
  render_pids=""
  shard=0
  while [ "$shard" -lt "$RENDER_SHARDS" ]; do
    node "scripts/ui-render-audit.mjs" --shard="$shard/$RENDER_SHARDS" > "$RENDER_DIR/$shard.log" 2>&1 &
    render_pids="$render_pids $!"
    shard=$((shard + 1))
  done
  render_failures=0
  for pid in $render_pids; do
    if ! wait "$pid"; then
      render_failures=$((render_failures + 1))
    fi
  done
  # Printed after the join, one shard at a time: interleaved live output from
  # four processes is unreadable, and nothing here reports progress anyway.
  shard=0
  while [ "$shard" -lt "$RENDER_SHARDS" ]; do
    cat "$RENDER_DIR/$shard.log"
    shard=$((shard + 1))
  done
  rm -rf "$RENDER_DIR"
  if [ "$render_failures" -ne 0 ]; then
    echo "[render-audit] $render_failures of $RENDER_SHARDS shard(s) failed" >&2
    exit 1
  fi
fi

echo "[options-help-render] checking semantic roles and raster alignment"
node "scripts/options-help-render-audit.mjs"

echo "[docs-lint] checking README x9 mirror + prose contracts"
node "scripts/docs-lint.mjs"

echo "[store-descriptions] checking CWS store copy is regenerated from the READMEs"
node "scripts/sync-store-descriptions.mjs" --check

echo "[hooks] checking installed git hooks still delegate to the tracked scripts"
sh "scripts/setup-hooks.sh" --check

echo "[theme] checking generated theme integrity"
node "docs/theme-surface/tools/validate-contracts.mjs"
node "tests/theme-contract-tests.mjs"
node "tests/theme-css-syntax-tests.mjs"
node "tests/theme-tooling-tests.mjs"
node "tests/theme-ui-derive-tests.mjs"
node "tests/theme-media-audit-tests.mjs"
node "tests/theme-override-debt-tests.mjs"
node "tests/theme-sync-check-tests.mjs"
node "docs/theme-surface/tools/diff-all.mjs" --strict
node "docs/theme-surface/tools/token-coverage.mjs"
node "docs/theme-surface/tools/cascade-lint.mjs"
node "docs/theme-surface/tools/override-drift.mjs"
node "docs/theme-surface/tools/override-debt.mjs"
node "docs/theme-surface/tools/handedit-audit.mjs"
node "docs/theme-surface/tools/css-region-audit.mjs"
node "docs/theme-surface/tools/ui-token-coverage.mjs"
node "docs/theme-surface/tools/contrast-audit.mjs"
node "docs/theme-surface/tools/recipe-lint.mjs"

echo "[verify] all checks passed"
