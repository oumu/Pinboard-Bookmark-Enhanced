#!/bin/sh
# Theme-surface drift guard + UI design-language consumer gates. When a theme
# contract/source or generated runtime file is staged, runs the read-only
# factory pipeline plus the complementary source/cascade/hand-edit/UI contract
# gates; when a surface HTML/JS file is staged, runs the fast static
# design-language gates. Blocks on any failure.
#
# Installed as .git/hooks/pre-commit via scripts/setup-hooks.sh
# Two trigger groups, one `git diff` call:
#   THEME_RE -- theme-factory sources, pinboard-themes.js and the three
#               generated-region CSS files: the full read-only factory pipeline.
#   UI_*_RE  -- the CONSUMER side of the design language: the four surface HTML
#               files, their JS, shared.js, md-preview.css and the vocabulary
#               registry/baseline. Only sub-second static gates run here
#               (layout-lint inline spacing, ui-vocabulary structural classes),
#               plus ui-contract when HTML / md-preview.css changed. Before
#               2026-09-05 an HTML-only commit ran ZERO gates -- 70 such commits
#               since July are how 23 inline styles and 27 ad-hoc wrapper
#               classes reached the settings page.
STAGED=$(git diff --cached --name-only --diff-filter=ACMR)
THEME_RE='^(docs/theme-surface/(pilots/[^/]+\.tokens\.json|composers/[^/]+\.mjs|tools/[^/]+\.mjs|tools/override-debt-baseline\.json|manifest\.json|tokens\.schema\.json)|pinboard-themes\.js|popup\.css|options\.css|library\.css)$'
UI_HTML_RE='^((popup|options|library|md-preview)\.html|md-preview\.css)$'
UI_VOCAB_RE='^((popup|options|library|md-preview)\.html|(popup|options|library)(-[a-z-]+)?\.js|md-[a-z-]+\.js|shared\.js|docs/theme-surface/ui-vocabulary\.json|scripts/ui-vocabulary-baseline\.json|scripts/ui-vocabulary-lint\.mjs)$'
CHANGED=$(printf '%s
' "$STAGED" | grep -E "$THEME_RE")
UI_HTML_CHANGED=$(printf '%s
' "$STAGED" | grep -E "$UI_HTML_RE")
UI_VOCAB_CHANGED=$(printf '%s
' "$STAGED" | grep -E "$UI_VOCAB_RE")
if [ -z "$CHANGED" ] && [ -z "$UI_HTML_CHANGED" ] && [ -z "$UI_VOCAB_CHANGED" ]; then
  exit 0
fi

if ! command -v node >/dev/null 2>&1; then
  echo "[drift-guard] COMMIT BLOCKED — node not found in PATH; install Node.js and rerun the commit" >&2
  exit 1
fi

# Run from repo root so relative imports in the .mjs work correctly.
REPO_ROOT=$(git rev-parse --show-toplevel)

if [ -n "$CHANGED" ]; then
echo "[drift-guard] theme-surface files changed — running read-only factory gates"
echo "$CHANGED" | sed 's/^/  /'
cd "$REPO_ROOT/docs/theme-surface" || exit 1

echo "[css-syntax] checking complex selector/declaration parsing contracts"
if ! node "$REPO_ROOT/tests/theme-css-syntax-tests.mjs"; then
  echo ""
  echo "[css-syntax] COMMIT BLOCKED — shared CSS scanner regressed on nested syntax or at-rule context" >&2
  exit 1
fi

echo "[ui-derive] checking shared post-override role derivation"
if ! node "$REPO_ROOT/tests/theme-ui-derive-tests.mjs"; then
  echo ""
  echo "[ui-derive] COMMIT BLOCKED — shared UI control derivation contract regressed" >&2
  exit 1
fi

echo "[override-debt-test] checking structural ratchet behavior"
if ! node "$REPO_ROOT/tests/theme-override-debt-tests.mjs"; then
  echo ""
  echo "[override-debt-test] COMMIT BLOCKED — override debt ratchet no longer detects identity swaps" >&2
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
fi

# ---- UI consumer group: fast static gates on the markup/JS side ----
cd "$REPO_ROOT" || exit 1
if [ -n "$UI_HTML_CHANGED" ] && [ -z "$CHANGED" ]; then
  echo "[ui-consumer] surface HTML / reader CSS changed — running the static design-language gates"
  echo "$UI_HTML_CHANGED" | sed 's/^/  /'
  echo "[layout-lint] checking inline spacing on the four UI surfaces"
  if ! node "$REPO_ROOT/docs/theme-surface/tools/layout-lint.mjs"; then
    echo ""
    echo "[layout-lint] COMMIT BLOCKED — inline spacing or a layout blocker (move it to a relationship rule / spacing token in the surface CSS)" >&2
    exit 1
  fi
  echo "[ui-contract] checking static UI contracts (HTML semantics, ids, hidden/aria, reader CSS roles)"
  if ! node "$REPO_ROOT/tests/ui-contract-tests.mjs"; then
    echo ""
    echo "[ui-contract] COMMIT BLOCKED — a hand-maintained HTML/CSS contract regressed" >&2
    exit 1
  fi
fi
if [ -n "$UI_VOCAB_CHANGED" ]; then
  echo "[ui-vocabulary] checking structural class tokens against the registry and the legacy baseline"
  if ! node "$REPO_ROOT/scripts/ui-vocabulary-lint.mjs"; then
    echo ""
    echo "[ui-vocabulary] COMMIT BLOCKED — a new structural class token; reuse a registered primitive or register it (docs/theme-surface/ui-vocabulary.json + COMPONENTS.md §10)" >&2
    exit 1
  fi
fi
