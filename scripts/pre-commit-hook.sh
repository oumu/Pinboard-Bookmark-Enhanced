#!/bin/sh
# Theme-surface drift guard. When any docs/theme-surface/pilots/*.tokens.json
# or composers/*.mjs file is staged, runs diff-all --strict and blocks the
# commit if any theme regressed to having missing declarations against the
# currently shipped CSS in pinboard-themes.js.
#
# Installed as .git/hooks/pre-commit via scripts/setup-hooks.sh
#
# Bypass (rare): git commit --no-verify

CHANGED=$(git diff --cached --name-only --diff-filter=ACMR | grep -E '^(docs/theme-surface/(pilots/[^/]+\.tokens\.json|composers/[^/]+\.mjs|tools/[^/]+\.mjs)|pinboard-themes\.js|popup\.css|options\.css|library\.css)$')

if [ -z "$CHANGED" ]; then
  exit 0
fi

echo "[drift-guard] theme-surface files changed — running diff-all --strict"
echo "$CHANGED" | sed 's/^/  /'

if ! command -v node >/dev/null 2>&1; then
  echo "[drift-guard] node not found in PATH — skipping (install node or use --no-verify)" >&2
  exit 0
fi

# Run from repo root so relative imports in the .mjs work correctly.
REPO_ROOT=$(git rev-parse --show-toplevel)
cd "$REPO_ROOT/docs/theme-surface" || exit 0

if ! node tools/diff-all.mjs --strict; then
  echo ""
  echo "[drift-guard] COMMIT BLOCKED — a theme has missing decls vs shipped CSS." >&2
  echo "  Fix: node docs/theme-surface/tools/generate-overrides.mjs <slug> --inject" >&2
  echo "  Bypass (not recommended): git commit --no-verify" >&2
  exit 1
fi

echo "[token-coverage] checking composer v() references against resolved tokens"
if ! node tools/token-coverage.mjs; then
  echo ""
  echo "[token-coverage] COMMIT BLOCKED — composer references a token no theme defines" >&2
  echo "  Fix: define the token in palette/typo/space/radius/border, add a fallback" >&2
  echo "       in composers/_util.mjs#expandPalette, or correct the typo in the composer" >&2
  echo "  Bypass (not recommended): git commit --no-verify" >&2
  exit 1
fi

echo "[cascade-lint] checking pattern cascade resolution"
if ! node tools/cascade-lint.mjs; then
  echo ""
  echo "[cascade-lint] COMMIT BLOCKED — cascade conflict detected" >&2
  echo "  Diagnose: node docs/theme-surface/tools/cascade-lint.mjs --verbose" >&2
  echo "  Bypass (not recommended): git commit --no-verify" >&2
  exit 1
fi

echo "[override-drift] checking per-theme overrides for unscoped duplicates"
if ! node tools/override-drift.mjs; then
  echo ""
  echo "[override-drift] COMMIT BLOCKED — override re-broadens composer-narrowed selector" >&2
  echo "  Fix: add the composer's :not(...) exclusions to the override selector" >&2
  echo "  Bypass (not recommended): git commit --no-verify" >&2
  exit 1
fi

echo "[handedit-audit] checking pinboard-themes.js for rules not produced by composer"
if ! node tools/handedit-audit.mjs; then
  echo ""
  echo "[handedit-audit] COMMIT BLOCKED — hand-edited rule detected in pinboard-themes.js" >&2
  echo "  Diagnose: node docs/theme-surface/tools/handedit-audit.mjs --verbose" >&2
  echo "  Fix: migrate the rule to composers/ or pilots/<slug>.tokens.json overrides.css, then re-run sync-all" >&2
  echo "  Bypass (not recommended): git commit --no-verify" >&2
  exit 1
fi

# Three more gates, added when popup.css/options.css/library.css themselves
# changed (not just theme-surface sources) -- design-uplift final-fix Rec 1.
# All three measured ~0.06s+0.03s+0.16s, cheap enough to run on every
# matching commit rather than waiting for CI. Full paths (not cd-relative
# "tools/...") because all three resolve their own file locations off
# import.meta.url, not cwd -- safe to call from this hook's already-cd'd
# $REPO_ROOT/docs/theme-surface working directory.
echo "[css-region-audit] checking generated regions for drift/hand-edits"
if ! node "$REPO_ROOT/docs/theme-surface/tools/css-region-audit.mjs"; then
  echo ""
  echo "[css-region-audit] COMMIT BLOCKED — a @generated region drifted from composer output or was hand-edited" >&2
  echo "  Fix: node docs/theme-surface/tools/apply-ui-themes.mjs --write" >&2
  echo "  Bypass (not recommended): git commit --no-verify" >&2
  exit 1
fi

echo "[recipe-lint] checking ui-components.mjs recipe source"
if ! node "$REPO_ROOT/docs/theme-surface/tools/recipe-lint.mjs"; then
  echo ""
  echo "[recipe-lint] COMMIT BLOCKED — component recipe violates a static law (paired-color / chip geometry / SPACING map / no bare --sp-* / no fallback var() / press excluded from transition / no transition:all / motion budget / button-icon rules / radius laws)" >&2
  echo "  Bypass (not recommended): git commit --no-verify" >&2
  exit 1
fi

echo "[ui-contract] checking static UI contracts (hex/rgba ratchet, var-fallback consistency, chip geometry)"
if ! node "$REPO_ROOT/tests/ui-contract-tests.mjs"; then
  echo ""
  echo "[ui-contract] COMMIT BLOCKED — a hand-maintained popup.css/options.css/library.css contract regressed" >&2
  echo "  Bypass (not recommended): git commit --no-verify" >&2
  exit 1
fi
