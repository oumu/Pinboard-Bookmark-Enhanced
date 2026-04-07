#!/bin/sh
# Auto-bump manifest.json version based on commit message type.
# Installed as .git/hooks/commit-msg via scripts/setup-hooks.sh
#
# Rules:
#   feat:             → minor bump  (2.4 → 2.5)
#   fix|refactor|perf → patch bump  (2.4 → 2.4.1, 2.4.1 → 2.4.2)
#   BREAKING CHANGE   → major bump  (2.4 → 3.0)
#   chore|docs|test|style|ci → no bump

COMMIT_MSG_FILE="$1"
MSG=$(cat "$COMMIT_MSG_FILE")
MANIFEST="manifest.json"

# Determine bump type
if echo "$MSG" | grep -qE "(^|\n)BREAKING CHANGE"; then
  BUMP="major"
elif echo "$MSG" | grep -qE "^feat(\([^)]+\))?!?:"; then
  BUMP="minor"
elif echo "$MSG" | grep -qE "^(fix|refactor|perf)(\([^)]+\))?!?:"; then
  BUMP="patch"
else
  exit 0
fi

# Read & bump version via python3
python3 - "$MANIFEST" "$BUMP" <<'PYEOF'
import sys, json, re

manifest_path, bump = sys.argv[1], sys.argv[2]

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
else:  # patch
    patch += 1
    new_ver = f"{major}.{minor}.{patch}"

data['version'] = new_ver

with open(manifest_path, 'w', encoding='utf-8') as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
    f.write('\n')

print(f"[version-bump] {current} → {new_ver} ({bump})")
PYEOF

# Stage the updated manifest so it's included in this commit
git add "$MANIFEST"
