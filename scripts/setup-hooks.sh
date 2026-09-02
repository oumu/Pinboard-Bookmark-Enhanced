#!/bin/sh
# Install git hooks for this repo.
# Run once after cloning: sh scripts/setup-hooks.sh
#
# sh scripts/setup-hooks.sh --check verifies that the hooks already installed
# in this clone still delegate to the tracked scripts. A clone that ran an
# older revision of this script carries a full-text copy of the hook body,
# which then never follows tracked hook updates; --check reports that drift
# instead of installing anything. A hook that is not installed at all (fresh
# CI checkout) is not drift and passes.

CHECK_ONLY=0
case "${1:-}" in
  --check) CHECK_ONLY=1 ;;
  "") ;;
  *)
    echo "Usage: sh scripts/setup-hooks.sh [--check]" >&2
    exit 2
    ;;
esac

REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
if [ -z "$REPO_ROOT" ]; then
  echo "Error: not inside a git repository." >&2
  exit 1
fi

cd "$REPO_ROOT" || exit 1
HOOKS_DIR=$(git rev-parse --git-path hooks 2>/dev/null)
case "$HOOKS_DIR" in
  /*) ;;
  *) HOOKS_DIR="$REPO_ROOT/$HOOKS_DIR" ;;
esac
SCRIPTS_DIR="$REPO_ROOT/scripts"

# The single line that proves an installed hook is a delegator rather than a
# copy of some past hook body.
delegator_marker() {
  printf 'exec "$REPO_ROOT/scripts/%s"' "$1"
}

check_hook() {
  script_name="$1"
  hook_name="$2"
  dst="$HOOKS_DIR/$hook_name"
  if [ ! -e "$dst" ]; then
    return 0
  fi
  if grep -qF "$(delegator_marker "$script_name")" "$dst"; then
    return 0
  fi
  echo "Error: $dst does not delegate to scripts/$script_name." >&2
  echo "       It is a stale copy of an older hook body, so updates to the" >&2
  echo "       tracked hook script never reach this clone." >&2
  echo "       Fix: sh scripts/setup-hooks.sh" >&2
  return 1
}

install_hook() {
  script_name="$1"
  hook_name="$2"
  src="$SCRIPTS_DIR/$script_name"
  dst="$HOOKS_DIR/$hook_name"
  tmp="$dst.tmp.$$"
  if [ ! -x "$src" ]; then
    echo "Error: tracked hook script is missing or not executable: $src" >&2
    exit 1
  fi
  if ! check_hook "$script_name" "$hook_name" 2>/dev/null; then
    echo "Replacing stale $hook_name hook (was not a delegator)."
  fi
  {
    printf '%s\n' '#!/bin/sh'
    printf '%s\n' 'REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)'
    printf '%s\n' 'if [ -z "$REPO_ROOT" ]; then echo "Hook error: not inside a git repository." >&2; exit 1; fi'
    printf 'exec "$REPO_ROOT/scripts/%s" "$@"\n' "$script_name"
  } > "$tmp"
  chmod +x "$tmp"
  mv "$tmp" "$dst"
  chmod +x "$dst"
  echo "Installed delegator: $hook_name -> scripts/$script_name"
}

if [ "$CHECK_ONLY" -eq 1 ]; then
  drift=0
  check_hook "commit-msg-hook.sh" "commit-msg" || drift=1
  check_hook "pre-commit-hook.sh" "pre-commit" || drift=1
  exit "$drift"
fi

install_hook "commit-msg-hook.sh" "commit-msg"
install_hook "pre-commit-hook.sh" "pre-commit"

echo "Done. Hooks now follow tracked script updates without reinstallation."
echo ""
echo "commit-msg (version bump): DISABLED (cumulative-release mode)."
echo "  Run scripts/bump-version.sh manually before each release."
echo ""
echo "pre-commit (drift guard):"
echo "  Blocks commit when any docs/theme-surface tokens/composer/tool change"
echo "  leaves a theme with missing decls vs shipped CSS."
echo "  Fix:    node docs/theme-surface/tools/generate-overrides.mjs <slug> --inject"
echo "  Bypass: git commit --no-verify"
