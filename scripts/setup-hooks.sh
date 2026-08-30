#!/bin/sh
# Install git hooks for this repo.
# Run once after cloning: sh scripts/setup-hooks.sh

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
