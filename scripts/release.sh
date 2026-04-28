#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT=$(git rev-parse --show-toplevel)
MANIFEST="${REPO_ROOT}/manifest.json"
RELEASE_DIR="${REPO_ROOT}/release"

VERSION=$(python3 -c "import json; print(json.load(open('${MANIFEST}'))['version'])")
TAG="v${VERSION}"
ZIP_NAME="pinboard-bookmark-enhanced-v${VERSION}.zip"
ZIP_PATH="${RELEASE_DIR}/${ZIP_NAME}"

echo "================================================"
echo "  Pinboard Bookmark Enhanced — Release ${TAG}"
echo "================================================"
echo ""
echo "  ZIP : ${ZIP_PATH}"
echo ""

# Note: README version badge is dynamic (shields.io reads GitHub release tag),
# so no manual sync step is required here.

# ---- Step 1: Build ZIP ----

INCLUDE=(
  manifest.json
  popup.html popup.js popup.css
  popup-ai.js popup-batch.js popup-tags.js
  options.html options.js options.css options-theme-early.js
  background.js shared.js ai.js i18n.js
  jina.js md-preview.html md-preview.js md-preview.css
  vendor
  pinboard-style.js pinboard-themes.js
  _locales icons
)

mkdir -p "${RELEASE_DIR}"

if [ -f "${ZIP_PATH}" ]; then
  echo "  Removing existing ${ZIP_NAME}"
  rm "${ZIP_PATH}"
fi

cd "${REPO_ROOT}"
python3 - "${ZIP_PATH}" "${VERSION}" "${INCLUDE[@]}" <<'PYEOF'
import sys, zipfile, pathlib

zip_path = sys.argv[1]
version  = sys.argv[2]
targets  = sys.argv[3:]
prefix   = f"pinboard-bookmark-enhanced-v{version}/"

with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
    for target in targets:
        p = pathlib.Path(target)
        if not p.exists():
            print(f"  Warning: {target} not found, skipping")
            continue
        if p.is_dir():
            for file in sorted(p.rglob('*')):
                if file.is_file() and '.DS_Store' not in file.name:
                    zf.write(file, prefix + str(file))
        else:
            zf.write(p, prefix + str(p))
PYEOF

echo "  ZIP created."
echo ""

# ---- Step 2: Check gh CLI ----

if ! command -v gh &>/dev/null; then
  echo "  gh CLI not found. ZIP is ready at:"
  echo "    ${ZIP_PATH}"
  echo ""
  echo "  Install gh: https://cli.github.com"
  exit 0
fi

if ! gh auth status &>/dev/null; then
  echo "  gh not authenticated. ZIP is ready at:"
  echo "    ${ZIP_PATH}"
  echo ""
  echo "  Run: gh auth login"
  exit 0
fi

# ---- Step 3: Generate changelog ----

# Try local tags first, then fall back to GitHub release tags
PREV_TAG=""
PREV_TAG=$(git tag --sort=-version:refname | grep -v "^${TAG}$" | head -1) || true

if [ -z "${PREV_TAG}" ]; then
  # No local tags — fetch the latest release tag from GitHub
  PREV_TAG=$(gh release list --limit 5 --json tagName --jq '.[].tagName' 2>/dev/null \
    | grep -v "^${TAG}$" | head -1) || true
fi

if [ -n "${PREV_TAG}" ]; then
  echo "  Changelog: ${PREV_TAG}..${TAG}"
else
  echo "  Changelog: last 20 commits (no previous tag found)"
fi

CHANGELOG=$(python3 - "${PREV_TAG}" <<'PYEOF'
import sys, subprocess, re

prev_tag = sys.argv[1] if len(sys.argv) > 1 and sys.argv[1] else ""

if prev_tag:
    result = subprocess.run(
        ["git", "log", f"{prev_tag}..HEAD", "--pretty=format:%s", "--no-merges"],
        capture_output=True, text=True
    )
    # If the tag doesn't exist locally, fall back to recent commits
    if result.returncode != 0:
        result = subprocess.run(
            ["git", "log", "--pretty=format:%s", "--no-merges", "-20"],
            capture_output=True, text=True
        )
else:
    result = subprocess.run(
        ["git", "log", "--pretty=format:%s", "--no-merges", "-20"],
        capture_output=True, text=True
    )

commits = [line.strip() for line in result.stdout.splitlines() if line.strip()]

# Skip release-infrastructure bookkeeping commits (auto-generated noise)
skip_patterns = [
    re.compile(r'^docs:\s*update version badge'),
    re.compile(r'^chore:\s*sync manifest version'),
]
commits = [c for c in commits if not any(p.match(c) for p in skip_patterns)]

groups = {
    "feat":     {"label": "New Features",   "items": []},
    "fix":      {"label": "Bug Fixes",      "items": []},
    "perf":     {"label": "Performance",    "items": []},
    "style":    {"label": "Styling",        "items": []},
    "refactor": {"label": "Improvements",   "items": []},
    "chore":    {"label": "Maintenance",    "items": []},
    "docs":     {"label": "Documentation",  "items": []},
}
order = ["feat", "fix", "perf", "style", "refactor", "chore", "docs"]

pattern = re.compile(r'^(\w+)(?:\([^)]+\))?!?:\s*(.+)$')

for msg in commits:
    m = pattern.match(msg)
    if not m:
        continue
    ctype, subject = m.group(1).lower(), m.group(2)
    if ctype in groups:
        groups[ctype]["items"].append(subject)

output = []
for key in order:
    items = groups[key]["items"]
    if not items:
        continue
    output.append(f"### {groups[key]['label']}")
    for item in items:
        output.append(f"- {item}")
    output.append("")

if not output:
    output = ["No significant changes."]

print("\n".join(output))
PYEOF
)

echo ""

# ---- Step 4: Handle existing release ----

if gh release view "${TAG}" &>/dev/null; then
  echo "  Release ${TAG} already exists."
  # Non-interactive: auto-overwrite. Use --no-overwrite flag to prevent.
  if [ "${1:-}" = "--no-overwrite" ]; then
    echo "  --no-overwrite specified. Aborted."
    exit 0
  fi
  # Interactive terminal: ask for confirmation
  if [ -t 0 ]; then
    read -r -p "  Overwrite? (y/N) " CONFIRM
    if [ "${CONFIRM}" != "y" ] && [ "${CONFIRM}" != "Y" ]; then
      echo "  Aborted."
      exit 0
    fi
  else
    echo "  Non-interactive mode: overwriting."
  fi
  gh release delete "${TAG}" --yes --cleanup-tag
  echo "  Old release deleted."
fi

# ---- Step 5: Create GitHub release ----

NOTES="## What's Changed

${CHANGELOG}
---

### Installation
1. Download \`${ZIP_NAME}\` below
2. Unzip to a local folder
3. Open \`chrome://extensions/\`, enable **Developer mode**
4. Click **Load unpacked**, select the unzipped folder"

gh release create "${TAG}" \
  "${ZIP_PATH}" \
  --title "${TAG}" \
  --notes "${NOTES}" \
  --latest

echo ""
echo "  Release published: ${TAG}"
echo "  https://github.com/$(gh repo view --json nameWithOwner -q .nameWithOwner)/releases/tag/${TAG}"
echo ""
