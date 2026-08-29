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

echo "[render-audit] checking hand-written render oracle (contrast + geometry)"
node "scripts/ui-render-audit.mjs"

echo "[docs-lint] checking README x9 mirror + prose contracts"
node "scripts/docs-lint.mjs"

echo "[store-descriptions] checking CWS store copy is regenerated from the READMEs"
node "scripts/sync-store-descriptions.mjs" --check

echo "[theme] checking generated theme integrity"
node "docs/theme-surface/tools/diff-all.mjs" --strict
node "docs/theme-surface/tools/token-coverage.mjs"
node "docs/theme-surface/tools/cascade-lint.mjs"
node "docs/theme-surface/tools/override-drift.mjs"
node "docs/theme-surface/tools/handedit-audit.mjs"
node "docs/theme-surface/tools/css-region-audit.mjs"
node "docs/theme-surface/tools/ui-token-coverage.mjs"
node "docs/theme-surface/tools/contrast-audit.mjs"
node "docs/theme-surface/tools/recipe-lint.mjs"

echo "[verify] all checks passed"
