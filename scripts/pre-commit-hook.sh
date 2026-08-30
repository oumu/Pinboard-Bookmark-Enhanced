#!/bin/sh
# Theme-surface drift guard. When a theme contract/source or generated runtime
# file is staged, runs the read-only factory pipeline plus the complementary
# source/cascade/hand-edit/UI contract gates and blocks on any failure.
#
# Installed as .git/hooks/pre-commit via scripts/setup-hooks.sh
CHANGED=$(git diff --cached --name-only --diff-filter=ACMR | grep -E '^(docs/theme-surface/(pilots/[^/]+\.tokens\.json|composers/[^/]+\.mjs|tools/[^/]+\.mjs|manifest\.json|tokens\.schema\.json)|pinboard-themes\.js|popup\.css|options\.css|library\.css)$')

if [ -z "$CHANGED" ]; then
  exit 0
fi

echo "[drift-guard] theme-surface files changed — running read-only factory gates"
echo "$CHANGED" | sed 's/^/  /'

if ! command -v node >/dev/null 2>&1; then
  echo "[drift-guard] COMMIT BLOCKED — node not found in PATH; install Node.js and rerun the commit" >&2
  exit 1
fi

# Run from repo root so relative imports in the .mjs work correctly.
REPO_ROOT=$(git rev-parse --show-toplevel)
cd "$REPO_ROOT/docs/theme-surface" || exit 1

echo "[css-syntax] checking complex selector/declaration parsing contracts"
if ! node "$REPO_ROOT/tests/theme-css-syntax-tests.mjs"; then
  echo ""
  echo "[css-syntax] COMMIT BLOCKED — shared CSS scanner regressed on nested syntax or at-rule context" >&2
  exit 1
fi

echo "[theme-sync] verifying the complete factory pipeline without writing files"
if ! node tools/sync-all.mjs --check; then
  echo ""
  echo "[theme-sync] COMMIT BLOCKED — generated artifacts drifted or a factory gate failed" >&2
  echo "  Fix: node docs/theme-surface/tools/sync-all.mjs" >&2
  exit 1
fi

echo "[token-coverage] checking composer v() references against resolved tokens"
if ! node tools/token-coverage.mjs; then
  echo ""
  echo "[token-coverage] COMMIT BLOCKED — composer references a token no theme defines" >&2
  echo "  Fix: define the token in palette/typo/space/radius/border, add a fallback" >&2
  echo "       in composers/_util.mjs#expandPalette, or correct the typo in the composer" >&2
  exit 1
fi

echo "[cascade-lint] checking pattern cascade resolution"
if ! node tools/cascade-lint.mjs; then
  echo ""
  echo "[cascade-lint] COMMIT BLOCKED — cascade conflict detected" >&2
  echo "  Diagnose: node docs/theme-surface/tools/cascade-lint.mjs --verbose" >&2
  exit 1
fi

echo "[override-drift] checking per-theme overrides for unscoped duplicates"
if ! node tools/override-drift.mjs; then
  echo ""
  echo "[override-drift] COMMIT BLOCKED — override re-broadens composer-narrowed selector" >&2
  echo "  Fix: add the composer's :not(...) exclusions to the override selector" >&2
  exit 1
fi

echo "[handedit-audit] checking pinboard-themes.js for rules not produced by composer"
if ! node tools/handedit-audit.mjs; then
  echo ""
  echo "[handedit-audit] COMMIT BLOCKED — hand-edited rule detected in pinboard-themes.js" >&2
  echo "  Diagnose: node docs/theme-surface/tools/handedit-audit.mjs --verbose" >&2
  echo "  Fix: migrate the rule to composers/ or pilots/<slug>.tokens.json overrides.css, then re-run sync-all" >&2
  exit 1
fi

echo "[ui-contract] checking static UI contracts (hex/rgba ratchet, var-fallback consistency, chip geometry)"
if ! node "$REPO_ROOT/tests/ui-contract-tests.mjs"; then
  echo ""
  echo "[ui-contract] COMMIT BLOCKED — a hand-maintained popup.css/options.css/library.css contract regressed" >&2
  exit 1
fi
