#!/usr/bin/env bash
set -euo pipefail

# Cumulative version bump.
#
# Scans commits since the latest GitHub release tag, picks the highest
# conventional-commit type, and bumps manifest.json accordingly.
#
# Bump rules (same as the old commit-msg hook):
#   BREAKING CHANGE   → major
#   feat:             → minor
#   fix|refactor|perf → patch
#   chore|docs|test|style|ci → no contribution
#
# Usage:
#   scripts/bump-version.sh            # bump + commit
#   scripts/bump-version.sh --dry-run  # show what would change, no write
#   scripts/bump-version.sh --force-patch  # force patch even if no qualifying commits

REPO_ROOT=$(git rev-parse --show-toplevel)
MANIFEST="${REPO_ROOT}/manifest.json"
cd "${REPO_ROOT}"

DRY_RUN=0
FORCE=""
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --force-patch) FORCE="patch" ;;
    --force-minor) FORCE="minor" ;;
    --force-major) FORCE="major" ;;
    *) echo "Unknown arg: $arg" >&2; exit 2 ;;
  esac
done

# Find the most recent release tag (prefer GitHub release tag, fall back to local)
PREV_TAG=""
if command -v gh &>/dev/null && gh auth status &>/dev/null; then
  PREV_TAG=$(gh release list --limit 1 --json tagName --jq '.[0].tagName' 2>/dev/null || true)
fi
if [ -z "${PREV_TAG}" ]; then
  PREV_TAG=$(git tag --sort=-version:refname | head -1 || true)
fi

if [ -z "${PREV_TAG}" ]; then
  echo "  No previous release tag found. Will scan last 50 commits."
  RANGE_ARGS=(-50)
else
  echo "  Scanning commits since ${PREV_TAG}..HEAD"
  RANGE_ARGS=("${PREV_TAG}..HEAD")
fi

BUMP=$(python3 - "${FORCE}" "${RANGE_ARGS[@]}" <<'PYEOF'
import sys, subprocess, re

force = sys.argv[1]
git_args = sys.argv[2:]

result = subprocess.run(
    ["git", "log", "--pretty=format:%B%x1e", "--no-merges", *git_args],
    capture_output=True, text=True, check=True,
)
messages = [m.strip() for m in result.stdout.split("\x1e") if m.strip()]

bump = ""
breaking = re.compile(r'(^|\n)BREAKING CHANGE')
feat = re.compile(r'^feat(\([^)]+\))?!?:', re.MULTILINE)
patch_kinds = re.compile(r'^(fix|refactor|perf)(\([^)]+\))?!?:', re.MULTILINE)
bang = re.compile(r'^\w+(\([^)]+\))?!:', re.MULTILINE)

rank = {"": 0, "patch": 1, "minor": 2, "major": 3}

for msg in messages:
    if breaking.search(msg) or bang.search(msg):
        cand = "major"
    elif feat.search(msg):
        cand = "minor"
    elif patch_kinds.search(msg):
        cand = "patch"
    else:
        continue
    if rank[cand] > rank[bump]:
        bump = cand

if force:
    bump = force

print(bump)
PYEOF
)

if [ -z "${BUMP}" ]; then
  echo "  No qualifying commits since last release. Nothing to bump."
  echo "  (Use --force-patch to bump anyway.)"
  exit 0
fi

echo "  Bump type: ${BUMP}"

NEW_VER=$(python3 - "${MANIFEST}" "${BUMP}" "${DRY_RUN}" <<'PYEOF'
import sys, json

manifest_path, bump, dry = sys.argv[1], sys.argv[2], sys.argv[3] == "1"

with open(manifest_path, 'r', encoding='utf-8') as f:
    data = json.load(f)

current = data.get('version', '0.0')
parts = current.split('.')
major = int(parts[0]) if len(parts) > 0 else 0
minor = int(parts[1]) if len(parts) > 1 else 0
patch = int(parts[2]) if len(parts) > 2 else 0

if bump == 'major':
    major += 1; minor = 0; patch = 0
    new_ver = f"{major}.0"
elif bump == 'minor':
    minor += 1; patch = 0
    new_ver = f"{major}.{minor}"
else:
    patch += 1
    new_ver = f"{major}.{minor}.{patch}"

print(f"  {current} → {new_ver}", file=sys.stderr)

if not dry:
    data['version'] = new_ver
    with open(manifest_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write('\n')

print(new_ver)
PYEOF
)

if [ "${DRY_RUN}" = "1" ]; then
  echo "  Dry run; manifest not modified."
  exit 0
fi

git add "${MANIFEST}"
git commit -m "chore: bump manifest to ${NEW_VER}"

echo ""
echo "  Bumped to ${NEW_VER}. Next: scripts/release.sh"
