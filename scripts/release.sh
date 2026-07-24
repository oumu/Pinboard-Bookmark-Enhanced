#!/usr/bin/env bash
set -euo pipefail

usage() {
  printf '%s\n' \
    "Usage: scripts/release.sh [options]" \
    "" \
    "Options:" \
    "  --build-only    Build and smoke-test the ZIP without publishing or syncing" \
    "  --overwrite     Rebuild a local ZIP or resume an exact-HEAD draft; published releases stay immutable" \
    "  --docs-ok       Skip the docs freshness gate" \
    "  --skip-smoke    Skip ZIP install smoke (release-script debugging only)" \
    "  --no-overwrite  Deprecated no-op; immutable-by-default is now enforced" \
    "  -h, --help      Show this help"
}

BUILD_ONLY=0
OVERWRITE=0
DOCS_OK=0
SKIP_SMOKE=0

while [ "$#" -gt 0 ]; do
  case "$1" in
    --build-only) BUILD_ONLY=1 ;;
    --overwrite) OVERWRITE=1 ;;
    --docs-ok) DOCS_OK=1 ;;
    --skip-smoke) SKIP_SMOKE=1 ;;
    --no-overwrite)
      echo "  [release] WARN: --no-overwrite is deprecated; releases are immutable by default." >&2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "  [release] Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
  shift
done

REPO_ROOT=$(git rev-parse --show-toplevel)
RELEASE_DIR="${REPO_ROOT}/release"

HEAD_SHA=$(git rev-parse HEAD)
VERSION=$(git show "${HEAD_SHA}:manifest.json" | python3 -c 'import json, sys; print(json.load(sys.stdin)["version"])')
TAG="v${VERSION}"
ZIP_NAME="pinboard-bookmark-enhanced-v${VERSION}.zip"
ZIP_PATH="${RELEASE_DIR}/${ZIP_NAME}"

echo "================================================"
echo "  Pinboard Bookmark Enhanced — Release ${TAG}"
echo "================================================"
echo ""
echo "  ZIP : ${ZIP_PATH}"
echo ""

# ---- Step 0: Publish preflight ----
# Build-only deliberately skips this entire networked section.

REPO_FULL=""
LOCAL_TAG_EXISTS=0
LOCAL_TAG_SHA=""
REMOTE_TAG_EXISTS=0
REMOTE_TAG_SHA=""
RELEASE_EXISTS=0
RELEASE_STATE=""
RELEASE_TARGET=""
RELEASE_ID=""
PREV_TAG=""

remote_tag_commit() {
  local refs
  if ! refs=$(git ls-remote origin "refs/tags/${TAG}" "refs/tags/${TAG}^{}"); then
    return 2
  fi
  if [ -z "${refs}" ]; then
    return 1
  fi
  printf '%s\n' "${refs}" | awk '
    $2 ~ /\^\{\}$/ { peeled = $1 }
    $2 !~ /\^\{\}$/ { direct = $1 }
    END { print peeled ? peeled : direct }
  '
}

version_gt() {
  python3 - "$1" "$2" <<'PYEOF'
import re, sys

def parse(value):
    if not re.fullmatch(r'\d+(?:\.\d+){1,3}', value):
        raise ValueError(value)
    parts = [int(part) for part in value.split('.')]
    return tuple(parts + [0] * (4 - len(parts)))

try:
    current, previous = parse(sys.argv[1]), parse(sys.argv[2])
except ValueError as exc:
    print(f"invalid numeric release version: {exc.args[0]}", file=sys.stderr)
    sys.exit(2)
sys.exit(0 if current > previous else 1)
PYEOF
}

refresh_release() {
  local lookup matches
  if ! lookup=$(gh api --paginate "repos/${REPO_FULL}/releases?per_page=100" \
    --jq ".[] | select(.tag_name == \"${TAG}\") | [(if .draft then \"draft\" elif .prerelease then \"prerelease\" else \"published\" end), (.target_commitish // \"\"), (.id | tostring)] | @tsv"); then
    return 2
  fi
  if [ -z "${lookup}" ]; then
    RELEASE_EXISTS=0
    RELEASE_STATE=""
    RELEASE_TARGET=""
    RELEASE_ID=""
    return 1
  fi
  matches=$(printf '%s\n' "${lookup}" | awk 'NF { count++ } END { print count + 0 }')
  if [ "${matches}" -ne 1 ]; then
    return 2
  fi
  RELEASE_EXISTS=1
  IFS=$'\t' read -r RELEASE_STATE RELEASE_TARGET RELEASE_ID <<< "${lookup}"
  return 0
}

if [ "${BUILD_ONLY}" -eq 0 ]; then
  if [ -n "$(git status --porcelain --untracked-files=normal)" ]; then
    echo "  ABORT: working tree is not clean (including untracked, non-ignored files)." >&2
    exit 1
  fi

  if ! command -v gh >/dev/null 2>&1; then
    echo "  ABORT: gh CLI is required for publication." >&2
    exit 1
  fi
  if ! gh auth status >/dev/null 2>&1; then
    echo "  ABORT: gh is not authenticated. Run: gh auth login" >&2
    exit 1
  fi

  CURRENT_BRANCH=$(git branch --show-current)
  UPSTREAM=$(git rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' 2>/dev/null || true)
  if [ "${CURRENT_BRANCH}" != "main" ] || [ "${UPSTREAM}" != "origin/main" ]; then
    echo "  ABORT: publication requires main tracking origin/main." >&2
    echo "         current branch: ${CURRENT_BRANCH:-<detached>}; upstream: ${UPSTREAM:-<none>}" >&2
    exit 1
  fi

  if ! REMOTE_MAIN_REFS=$(git ls-remote origin refs/heads/main); then
    echo "  ABORT: could not verify origin/main." >&2
    exit 1
  fi
  REMOTE_MAIN_SHA=$(printf '%s\n' "${REMOTE_MAIN_REFS}" | awk '$2 == "refs/heads/main" { print $1; exit }')
  if [ -z "${REMOTE_MAIN_SHA}" ] || [ "${REMOTE_MAIN_SHA}" != "${HEAD_SHA}" ]; then
    echo "  ABORT: current HEAD is not published at origin/main." >&2
    echo "         HEAD: ${HEAD_SHA}" >&2
    echo "  origin/main: ${REMOTE_MAIN_SHA:-<missing>}" >&2
    exit 1
  fi

  if ! REPO_FULL=$(gh repo view --json nameWithOwner --jq .nameWithOwner); then
    echo "  ABORT: could not resolve the GitHub repository." >&2
    exit 1
  fi

  if ! PREV_TAG=$(gh release list \
    --repo "${REPO_FULL}" \
    --exclude-drafts \
    --exclude-pre-releases \
    --limit 100 \
    --json tagName \
    --jq "[.[] | select(.tagName != \"${TAG}\")][0].tagName // \"\""); then
    echo "  ABORT: could not resolve the latest formal GitHub Release." >&2
    exit 1
  fi
  if [ -n "${PREV_TAG}" ]; then
    if ! git fetch --tags --quiet origin; then
      echo "  ABORT: could not refresh release tags." >&2
      exit 1
    fi
    if ! git rev-parse -q --verify "${PREV_TAG}^{commit}" >/dev/null 2>&1; then
      echo "  ABORT: formal Release tag ${PREV_TAG} is not resolvable locally." >&2
      exit 1
    fi
    if ! git merge-base --is-ancestor "${PREV_TAG}^{commit}" "${HEAD_SHA}"; then
      echo "  ABORT: formal Release tag ${PREV_TAG} is not an ancestor of HEAD." >&2
      exit 1
    fi
    if ! version_gt "${VERSION}" "${PREV_TAG#v}"; then
      echo "  ABORT: manifest version ${VERSION} must be greater than formal Release ${PREV_TAG}." >&2
      exit 1
    fi
  fi

  if ! CI_RUN=$(gh run list \
    --repo "${REPO_FULL}" \
    --workflow "CI" \
    --commit "${HEAD_SHA}" \
    --limit 1 \
    --json databaseId,headSha,status,conclusion \
    --jq 'if length == 0 then "" else [.[0].headSha, .[0].status, (.[0].conclusion // ""), (.[0].databaseId | tostring)] | @tsv end'); then
    echo "  ABORT: could not verify CI for ${HEAD_SHA}." >&2
    exit 1
  fi
  IFS=$'\t' read -r CI_SHA CI_STATUS CI_CONCLUSION CI_ID <<< "${CI_RUN}"
  if [ -z "${CI_SHA:-}" ] || [ "${CI_SHA}" != "${HEAD_SHA}" ] \
    || [ "${CI_STATUS:-}" != "completed" ] || [ "${CI_CONCLUSION:-}" != "success" ]; then
    echo "  ABORT: exact HEAD must have a completed, successful CI workflow." >&2
    echo "         HEAD: ${HEAD_SHA}; run: ${CI_ID:-<none>}; status: ${CI_STATUS:-<none>}; conclusion: ${CI_CONCLUSION:-<none>}" >&2
    exit 1
  fi
  echo "  CI gate OK (run ${CI_ID}, ${HEAD_SHA})"

  if git show-ref --verify --quiet "refs/tags/${TAG}"; then
    LOCAL_TAG_EXISTS=1
    LOCAL_TAG_SHA=$(git rev-parse "${TAG}^{commit}")
  fi

  if REMOTE_TAG_SHA=$(remote_tag_commit); then
    REMOTE_TAG_EXISTS=1
  else
    REMOTE_TAG_STATUS=$?
    if [ "${REMOTE_TAG_STATUS}" -eq 2 ]; then
      echo "  ABORT: could not verify remote tag ${TAG}." >&2
      exit 1
    fi
    REMOTE_TAG_SHA=""
  fi

  if refresh_release; then
    if [ "${RELEASE_STATE}" = "prerelease" ]; then
      echo "  ABORT: Release ${TAG} is a prerelease; conversion/overwrite is not supported." >&2
      exit 1
    fi
  else
    RELEASE_LOOKUP_STATUS=$?
    if [ "${RELEASE_LOOKUP_STATUS}" -eq 2 ]; then
      echo "  ABORT: could not verify GitHub Release ${TAG}." >&2
      exit 1
    fi
  fi

  if [ "${LOCAL_TAG_EXISTS}" -eq 1 ] && [ "${LOCAL_TAG_SHA}" != "${HEAD_SHA}" ]; then
    echo "  ABORT: local tag ${TAG} points to ${LOCAL_TAG_SHA}, not HEAD ${HEAD_SHA}." >&2
    echo "         Tags are immutable; bump the version." >&2
    exit 1
  fi
  if [ "${REMOTE_TAG_EXISTS}" -eq 1 ] && [ "${REMOTE_TAG_SHA}" != "${HEAD_SHA}" ]; then
    echo "  ABORT: remote tag ${TAG} points to ${REMOTE_TAG_SHA}, not HEAD ${HEAD_SHA}." >&2
    echo "         Tags are immutable; bump the version." >&2
    exit 1
  fi
  if [ "${RELEASE_EXISTS}" -eq 1 ] && [ "${RELEASE_STATE}" = "draft" ] \
    && [ "${REMOTE_TAG_EXISTS}" -eq 0 ] \
    && [ "${RELEASE_TARGET}" != "${HEAD_SHA}" ]; then
    echo "  ABORT: draft Release ${TAG} targets ${RELEASE_TARGET:-<none>}, not exact HEAD ${HEAD_SHA}." >&2
    exit 1
  fi
  if [ "${RELEASE_EXISTS}" -eq 1 ] && [ "${RELEASE_STATE}" = "published" ] \
    && [ "${REMOTE_TAG_EXISTS}" -eq 0 ]; then
    echo "  ABORT: published Release ${TAG} has no verifiable remote tag." >&2
    exit 1
  fi
  if [ "${RELEASE_EXISTS}" -eq 1 ] && [ "${RELEASE_STATE}" = "published" ]; then
    echo "  ABORT: published Release ${TAG} is immutable; bump the version." >&2
    exit 1
  fi
  if [ "${RELEASE_EXISTS}" -eq 1 ] && [ "${OVERWRITE}" -eq 0 ]; then
    echo "  ABORT: ${TAG} already exists as an exact-HEAD draft Release." >&2
    echo "         Use --overwrite to resume that verified draft." >&2
    exit 1
  fi
  if [ "${REMOTE_TAG_EXISTS}" -eq 1 ] && [ "${RELEASE_EXISTS}" -eq 0 ]; then
    echo "  Recovering ${TAG} from its verified same-commit remote tag."
  fi
fi

# ---- Step 0: Docs freshness gate ----
#
# A release that ships features must not leave user-facing docs behind.
# If the range since the previous tag contains feat commits while EVERY
# watched doc is untouched, abort. Watched set: README.md + its 8 locale
# mirrors, CLAUDE.md, docs/privacy.md, docs/index.md (Pages front door),
# and the theme-factory docs (docs/theme-surface/README.md + NEW_THEME.md
# — must move whenever factory mechanics change). After verifying the docs
# are genuinely current, re-run with --docs-ok to proceed.
if [ "${BUILD_ONLY}" -eq 1 ]; then
  echo "  --build-only: skipping publication docs gate"
elif [ "${DOCS_OK}" -eq 1 ]; then
  echo "  --docs-ok: skipping docs freshness gate"
else
  if [ -n "${PREV_TAG}" ]; then
    FEAT_COUNT=$(git log "${PREV_TAG}..${HEAD_SHA}" --pretty=format:%s --no-merges | grep -c "^feat" || true)
    DOCS_TOUCHED=$(git diff --name-only "${PREV_TAG}..${HEAD_SHA}" -- \
      README.md README.*.md CLAUDE.md docs/privacy.md docs/index.md \
      docs/theme-surface/README.md docs/theme-surface/NEW_THEME.md | wc -l)
    if [ "${FEAT_COUNT}" -gt 0 ] && [ "${DOCS_TOUCHED}" -eq 0 ]; then
      echo "  ABORT: docs freshness gate."
      echo "  ${FEAT_COUNT} feat commit(s) since ${PREV_TAG}, but every watched doc is"
      echo "  untouched in that range. Checklist before overriding:"
      echo "    - README.md x9 locales   (user-facing features)"
      echo "    - CLAUDE.md              (conventions / invariants / module map)"
      echo "    - docs/privacy.md        (ANY new data exit: API, export target, AI surface)"
      echo "    - docs/index.md          (Pages front door)"
      echo "    - docs/theme-surface/README.md + NEW_THEME.md (factory mechanics)"
      echo "  Update what applies, or re-run with --docs-ok if all are genuinely current."
      exit 1
    fi
    echo "  Docs gate OK (${FEAT_COUNT} feat commit(s); docs files touched: ${DOCS_TOUCHED})"
  fi
fi

# Note: README version badge is dynamic (shields.io reads GitHub release tag),
# so no manual sync step is required here.

# ---- Step 1: Build ZIP ----
#
# Auto-scan + exclude pattern (replaces former hardcoded INCLUDE list, which
# silently dropped new extension files added between releases).
#
# Top-level extension files are auto-included by glob pattern (*.html, *.js,
# *.css, manifest.json). Recursive directories vendor/, icons/, _locales/
# are always included. Everything else at root (README, LICENSE, perf data,
# test pages, hidden files/dirs, scripts/, docs/, release/, etc.) is excluded.
#
# A post-build sanity check parses manifest.json + included HTML files to
# extract every <script src> / <link href> / SW / content_script reference,
# then asserts every referenced file is in the ZIP. This catches the bug
# class where a new JS file is added to the codebase but forgotten in the
# release manifest.

mkdir -p "${RELEASE_DIR}"

if [ -f "${ZIP_PATH}" ]; then
  if [ "${OVERWRITE}" -eq 0 ]; then
    echo "  ABORT: local artifact already exists: ${ZIP_PATH}" >&2
    echo "         Use --overwrite to delete and rebuild this ZIP explicitly." >&2
    exit 1
  fi
  echo "  --overwrite: removing existing ${ZIP_NAME}"
  rm -- "${ZIP_PATH}"
fi

cd "${REPO_ROOT}"
python3 - "${ZIP_PATH}" "${VERSION}" "${HEAD_SHA}" <<'PYEOF'
import base64, fnmatch, hashlib, json, pathlib, posixpath, re, subprocess, sys, zipfile

zip_path = sys.argv[1]
version  = sys.argv[2]
snapshot = sys.argv[3]
prefix   = f"pinboard-bookmark-enhanced-v{version}/"

REPO = pathlib.Path('.')
RELEASE_EXTENSION_ID = 'pnjndmjhljjbdlbejeenkepdalokfooh'
RELEASE_EXTENSION_KEY = (
    'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAwNA1FMsd5vKiPgnGvwMiqO7Q'
    'V2PRke84BnYJPJRVGNFPG6Z1OzNpwHWI60aamTOpXcgby7z45atUCJk0d2Knh1LWuz7'
    'gxvYpxzz9puSEH2owW9AGBZztX4hbHWeL/WnR+oRiSAHYXRAS8/RBS156nbG9TVrF1z'
    'yQpSwPFqofX3ezhhg9GLyqcixSuyDquloyuyAFgA5lG7tf6/XvyfYgnyelksL2StQnn'
    'Cmei9Jro1uDDmBV0Kpj5pcS4Xw9Ifq29JBMu3pxJ02FYaeqmpAwfs/ZCnVU/STACfs7'
    'Lsn4pWzonj1n8WevNewDZuY3hoaYF63wzc0KTxYHVGkxnGGFbQIDAQAB'
)

key_hash = hashlib.sha256(base64.b64decode(RELEASE_EXTENSION_KEY)).hexdigest()[:32]
key_id = ''.join(chr(ord('a') + int(char, 16)) for char in key_hash)
if key_id != RELEASE_EXTENSION_ID:
    print(f'  ERROR: release public key maps to {key_id}, expected {RELEASE_EXTENSION_ID}.', file=sys.stderr)
    sys.exit(1)

# Top-level extension files (whitelist by pattern)
TOP_LEVEL_PATTERNS = ['*.html', '*.js', '*.css', 'manifest.json']

# Directories included recursively
INCLUDE_DIRS = ['vendor', 'icons', '_locales']

# Top-level files to exclude even if matching a pattern
EXCLUDE_FILES = set()  # dev test pages now live in tests/ (auto-excluded: not in INCLUDE_DIRS)

# Top-level patterns to exclude
EXCLUDE_PATTERNS = ['perf-baseline.json', 'perf-after-*.json', '.*', '*.md', 'LICENSE']

def included_at_root(name: str) -> bool:
    if name in EXCLUDE_FILES:
        return False
    for pat in EXCLUDE_PATTERNS:
        if fnmatch.fnmatch(name, pat):
            return False
    return any(fnmatch.fnmatch(name, pat) for pat in TOP_LEVEL_PATTERNS)

def selected(path: str) -> bool:
    parts = path.split('/')
    return included_at_root(path) if len(parts) == 1 else parts[0] in INCLUDE_DIRS

tree = subprocess.run(
    ['git', 'ls-tree', '-r', '-z', snapshot],
    check=True, capture_output=True,
).stdout
tracked = {}
unsafe = []
for record in tree.split(b'\0'):
    if not record:
        continue
    metadata, raw_path = record.split(b'\t', 1)
    mode, object_type, oid = metadata.decode('ascii').split()
    path = raw_path.decode('utf-8')
    if not selected(path):
        continue
    if object_type != 'blob' or mode == '120000':
        unsafe.append(path)
        continue
    tracked[path] = (mode, oid)

# Refuse ignored/untracked candidates instead of silently packaging machine-local files.
worktree_candidates = set()
for entry in REPO.iterdir():
    if (entry.is_file() or entry.is_symlink()) and included_at_root(entry.name):
        worktree_candidates.add(entry.name)
for directory in INCLUDE_DIRS:
    root = REPO / directory
    if not root.exists():
        continue
    for entry in root.rglob('*'):
        if entry.is_file() or entry.is_symlink():
            worktree_candidates.add(entry.relative_to(REPO).as_posix())

extras = sorted(worktree_candidates - set(tracked))
if unsafe or extras:
    print(f'  ERROR: release inputs must be regular files tracked by {snapshot}:', file=sys.stderr)
    for path in sorted(unsafe + extras):
        print(f'    - {path}', file=sys.stderr)
    sys.exit(1)

included = sorted(tracked)
contents = {}
with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
    for path in included:
        mode, oid = tracked[path]
        data = subprocess.run(
            ['git', 'cat-file', 'blob', oid],
            check=True, capture_output=True,
        ).stdout
        if path == 'manifest.json':
            manifest = json.loads(data)
            if 'key' in manifest:
                print('  ERROR: source manifest.json must stay key-free for an independent development ID.', file=sys.stderr)
                sys.exit(1)
            manifest['key'] = RELEASE_EXTENSION_KEY
            data = (json.dumps(manifest, ensure_ascii=False, indent=2) + '\n').encode('utf-8')
        contents[path] = data
        info = zipfile.ZipInfo(prefix + path, date_time=(1980, 1, 1, 0, 0, 0))
        info.create_system = 3
        info.compress_type = zipfile.ZIP_DEFLATED
        permissions = 0o755 if mode == '100755' else 0o644
        info.external_attr = (0o100000 | permissions) << 16
        zf.writestr(info, data)

# Sanity check: every file referenced by manifest + included HTML must be present
referenced = {'md-preview.html', 'site-rules.js', 'vendor/defuddle.js'}
manifest = json.loads(contents['manifest.json'])

def add_reference(value, base=''):
    if not isinstance(value, str) or value.startswith(('http:', 'https:', '//', 'data:', '#')):
        return
    value = value.split('#', 1)[0].split('?', 1)[0]
    referenced.add(posixpath.normpath(posixpath.join(base, value)))

def add_icons(value):
    if isinstance(value, str):
        add_reference(value)
    elif isinstance(value, dict):
        for path in value.values():
            add_reference(path)

if 'background' in manifest and 'service_worker' in manifest['background']:
    add_reference(manifest['background']['service_worker'])
for cs in manifest.get('content_scripts', []):
    for path in cs.get('js', []) + cs.get('css', []):
        add_reference(path)
for action_key in ('action', 'browser_action', 'page_action'):
    action = manifest.get(action_key, {})
    add_reference(action.get('default_popup'))
    add_icons(action.get('default_icon'))
add_icons(manifest.get('icons'))
if 'options_page' in manifest:
    add_reference(manifest['options_page'])
add_reference(manifest.get('options_ui', {}).get('page'))
add_reference(manifest.get('devtools_page'))
add_reference(manifest.get('side_panel', {}).get('default_path'))
for path in manifest.get('chrome_url_overrides', {}).values():
    add_reference(path)
for path in manifest.get('sandbox', {}).get('pages', []):
    add_reference(path)
for resource_group in manifest.get('web_accessible_resources', []):
    for path in resource_group.get('resources', []):
        add_reference(path)
default_locale = manifest.get('default_locale')
if default_locale:
    add_reference(f'_locales/{default_locale}/messages.json')

# Saved-state icons and these pages/scripts are loaded only through runtime JS.
for size in (16, 32, 48, 128):
    add_reference(f'icons/pin-saved-{size}.png')

script_re = re.compile(r'<script[^>]+src=["\']([^"\']+)["\']', re.IGNORECASE)
link_re   = re.compile(r'<link[^>]+href=["\']([^"\']+)["\']', re.IGNORECASE)
for html_name in [f for f in included if f.endswith('.html')]:
    text = contents[html_name].decode('utf-8')
    base = posixpath.dirname(html_name)
    for m in script_re.finditer(text):
        add_reference(m.group(1), base)
    for m in link_re.finditer(text):
        add_reference(m.group(1), base)

included_set = set(included)
missing = []
for ref in sorted(referenced):
    if any(char in ref for char in '*?['):
        if not any(fnmatch.fnmatch(path, ref) for path in included):
            missing.append(ref)
    elif ref not in included_set:
        missing.append(ref)
if missing:
    print(f"  ERROR: referenced by manifest/HTML but missing from ZIP:", file=sys.stderr)
    for m in missing:
        print(f"    - {m}", file=sys.stderr)
    print(f"  Fix release.sh INCLUDE_DIRS / TOP_LEVEL_PATTERNS / EXCLUDE_* rules.", file=sys.stderr)
    sys.exit(1)

print(f"  ZIP created — {len(included)} files; extension ID fixed to {RELEASE_EXTENSION_ID}.")
print("  All manifest + HTML references resolved.")
PYEOF

echo ""

# ---- Step 1.5: ZIP install smoke test ----
# Real Chromium install + SW + popup + options smoke. Catches the bug class
# where ZIP packaging silently dropped a referenced file. Run BEFORE gh
# release create so a broken ZIP never reaches users.
#
# Skip with --skip-smoke (e.g. when iterating on the release script itself).

if [ "${SKIP_SMOKE}" -eq 1 ]; then
  echo "  --skip-smoke: skipping zip-install-smoke test"
else
  echo "  Smoke-testing ZIP..."
  if ! node "${REPO_ROOT}/scripts/zip-install-smoke.mjs" --zip "${ZIP_PATH}"; then
    echo "" >&2
    echo "  [release] ZIP smoke test FAILED — aborting before publish." >&2
    echo "  ZIP retained at: ${ZIP_PATH}" >&2
    echo "  Rerun manually:  node scripts/zip-install-smoke.mjs --zip ${ZIP_PATH}" >&2
    exit 1
  fi
  echo ""
fi

EXPECTED_ZIP_SIZE=$(python3 -c 'import os, sys; print(os.path.getsize(sys.argv[1]))' "${ZIP_PATH}")
EXPECTED_ZIP_DIGEST=$(python3 -c 'import hashlib, sys; print(hashlib.sha256(open(sys.argv[1], "rb").read()).hexdigest())' "${ZIP_PATH}")
echo "  Artifact frozen (${EXPECTED_ZIP_SIZE} bytes, sha256:${EXPECTED_ZIP_DIGEST})"
echo ""

if [ "${BUILD_ONLY}" -eq 1 ]; then
  echo "  Build-only complete: ZIP validated; 未发布、未同步。"
  exit 0
fi

# ---- Step 3: Generate changelog ----

if [ -n "${PREV_TAG}" ]; then
  echo "  Changelog: ${PREV_TAG}..${TAG}"
else
  echo "  Changelog: last 20 commits (no previous tag found)"
fi

CHANGELOG=$(python3 - "${PREV_TAG}" "${HEAD_SHA}" <<'PYEOF'
import sys, subprocess, re

prev_tag = sys.argv[1] if len(sys.argv) > 1 and sys.argv[1] else ""
snapshot = sys.argv[2]

if prev_tag:
    result = subprocess.run(
        ["git", "log", f"{prev_tag}..{snapshot}", "--pretty=format:%s", "--no-merges"],
        capture_output=True, text=True
    )
else:
    result = subprocess.run(
        ["git", "log", snapshot, "--pretty=format:%s", "--no-merges", "-20"],
        capture_output=True, text=True
    )

if result.returncode != 0:
    print(result.stderr.strip() or "git log failed", file=sys.stderr)
    sys.exit(result.returncode)

commits = [line.strip() for line in result.stdout.splitlines() if line.strip()]

# Skip release-infrastructure bookkeeping and internal maintenance noise.
skip_patterns = [
    re.compile(r'^docs:\s*update version badge'),
    re.compile(r'^chore(?:\([^)]+\))?:'),
]
commits = [c for c in commits if not any(p.match(c) for p in skip_patterns)]

groups = {
    "feat":     {"label": "New Features",   "items": []},
    "fix":      {"label": "Bug Fixes",      "items": []},
    "perf":     {"label": "Performance",    "items": []},
    "style":    {"label": "Styling",        "items": []},
    "refactor": {"label": "Improvements",   "items": []},
    "docs":     {"label": "Documentation",  "items": []},
    "security": {"label": "Security",       "items": []},
}
order = ["feat", "fix", "perf", "style", "refactor", "docs", "security"]

pattern = re.compile(r'^(\w+)(?:\(([^)]+)\))?!?:\s*(.+)$')

for msg in commits:
    m = pattern.match(msg)
    if not m:
        continue
    ctype, scope, subject = m.group(1).lower(), (m.group(2) or '').lower(), m.group(3)
    if ctype == 'fix' and scope == 'security':
        ctype = 'security'
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

# ---- Step 4: Publish or update GitHub release ----

NOTES="## What's Changed

${CHANGELOG}
---

### Installation
1. Download \`${ZIP_NAME}\` below
2. Unzip to a local folder
3. Open \`chrome://extensions/\`, enable **Developer mode**
4. Click **Load unpacked**, select the unzipped folder"

verify_publish_snapshot() {
  local current_head remote_refs remote_sha
  current_head=$(git rev-parse HEAD)
  if [ "${current_head}" != "${HEAD_SHA}" ] \
    || [ -n "$(git status --porcelain --untracked-files=normal)" ]; then
    echo "  ABORT: source changed after release preflight; restart the release." >&2
    return 1
  fi
  if ! remote_refs=$(git ls-remote origin refs/heads/main); then
    echo "  ABORT: could not re-verify origin/main before publication." >&2
    return 1
  fi
  remote_sha=$(printf '%s\n' "${remote_refs}" | awk '$2 == "refs/heads/main" { print $1; exit }')
  if [ "${remote_sha}" != "${HEAD_SHA}" ]; then
    echo "  ABORT: origin/main changed after release preflight; restart the release." >&2
    return 1
  fi
}

verify_local_artifact() {
  local size digest
  size=$(python3 -c 'import os, sys; print(os.path.getsize(sys.argv[1]))' "${ZIP_PATH}")
  digest=$(python3 -c 'import hashlib, sys; print(hashlib.sha256(open(sys.argv[1], "rb").read()).hexdigest())' "${ZIP_PATH}")
  if [ "${size}" != "${EXPECTED_ZIP_SIZE}" ] || [ "${digest}" != "${EXPECTED_ZIP_DIGEST}" ]; then
    echo "  ABORT: ZIP changed after smoke test; restart the release." >&2
    return 1
  fi
}

verify_remote_tag_before_publish() {
  local sha status
  if sha=$(remote_tag_commit); then
    if [ "${sha}" != "${HEAD_SHA}" ]; then
      echo "  ABORT: remote tag ${TAG} changed before publication (${sha})." >&2
      return 1
    fi
    return 0
  else
    status=$?
  fi
  if [ "${status}" -eq 2 ]; then
    echo "  ABORT: could not re-verify remote tag ${TAG} before publication." >&2
    return 1
  fi
  return 0
}

verify_release_asset() {
  local attempt asset_meta
  local asset_count="0" asset_state="<missing>" asset_size="0" asset_digest="<missing>"

  for attempt in 1 2 3 4 5; do
    if asset_meta=$(gh api "repos/${REPO_FULL}/releases/${RELEASE_ID}" \
      --jq "[.assets[] | select(.name == \"${ZIP_NAME}\")] | [length, (.[0].state // \"<missing>\"), (.[0].size // 0), (.[0].digest // \"<missing>\")] | @tsv" 2>&1); then
      IFS=$'\t' read -r asset_count asset_state asset_size asset_digest <<< "${asset_meta}"
      asset_digest=${asset_digest#sha256:}
      asset_digest=$(printf '%s' "${asset_digest}" | tr '[:upper:]' '[:lower:]')
      if [ "${asset_count}" = "1" ] && [ "${asset_state}" = "uploaded" ] \
        && [ "${asset_size}" = "${EXPECTED_ZIP_SIZE}" ] \
        && [ "${asset_digest}" = "${EXPECTED_ZIP_DIGEST}" ]; then
        echo "  Release asset verified (${EXPECTED_ZIP_SIZE} bytes, sha256:${EXPECTED_ZIP_DIGEST})"
        return 0
      fi
    fi
    [ "${attempt}" -eq 5 ] || sleep 2
  done

  echo "  ABORT: GitHub asset verification failed for ${ZIP_NAME}." >&2
  echo "         expected: count=1 state=uploaded size=${EXPECTED_ZIP_SIZE} sha256:${EXPECTED_ZIP_DIGEST}" >&2
  echo "         observed: count=${asset_count} state=${asset_state} size=${asset_size} digest=${asset_digest}" >&2
  return 1
}

verify_publish_snapshot
verify_local_artifact

if [ "${RELEASE_EXISTS}" -eq 1 ]; then
  echo "  Resuming verified exact-HEAD draft Release ${TAG}..."
  gh release edit "${TAG}" \
    --repo "${REPO_FULL}" \
    --title "${TAG}" \
    --notes "${NOTES}"
elif [ "${REMOTE_TAG_EXISTS}" -eq 1 ]; then
  echo "  Creating draft Release ${TAG} from the existing verified tag..."
  gh release create "${TAG}" \
    --repo "${REPO_FULL}" \
    --verify-tag \
    --target "${HEAD_SHA}" \
    --draft \
    --title "${TAG}" \
    --notes "${NOTES}"
  RELEASE_STATE="draft"
else
  echo "  Creating exact-HEAD draft Release ${TAG}..."
  gh release create "${TAG}" \
    --repo "${REPO_FULL}" \
    --target "${HEAD_SHA}" \
    --draft \
    --title "${TAG}" \
    --notes "${NOTES}"
  RELEASE_STATE="draft"
fi

if [ "${RELEASE_EXISTS}" -eq 0 ]; then
  RELEASE_CREATED=0
  for attempt in 1 2 3 4 5; do
    if refresh_release; then
      RELEASE_CREATED=1
      break
    else
      RELEASE_LOOKUP_STATUS=$?
    fi
    if [ "${RELEASE_LOOKUP_STATUS}" -eq 2 ]; then
      break
    fi
    [ "${attempt}" -eq 5 ] || sleep 2
  done
  if [ "${RELEASE_CREATED}" -ne 1 ]; then
    echo "  ABORT: draft ${TAG} was created but could not be resolved by tag." >&2
    exit 1
  fi
  if [ "${RELEASE_STATE}" != "draft" ] \
    || { [ "${REMOTE_TAG_EXISTS}" -eq 0 ] && [ "${RELEASE_TARGET}" != "${HEAD_SHA}" ]; }; then
    echo "  ABORT: new Release ${TAG} must remain a draft bound to exact HEAD ${HEAD_SHA}." >&2
    echo "         observed state=${RELEASE_STATE:-<none>} target=${RELEASE_TARGET:-<none>}" >&2
    exit 1
  fi
fi

verify_local_artifact
gh release upload "${TAG}" "${ZIP_PATH}" --clobber --repo "${REPO_FULL}"
if ! verify_release_asset; then
  [ "${RELEASE_STATE}" = "draft" ] \
    && echo "         Draft retained for safe retry with --overwrite." >&2
  exit 1
fi

if [ "${RELEASE_STATE}" = "draft" ]; then
  echo "  Publishing verified draft ${TAG}..."
  verify_publish_snapshot
  verify_local_artifact
  verify_remote_tag_before_publish
  gh release edit "${TAG}" \
    --repo "${REPO_FULL}" \
    --draft=false \
    --latest
fi

if ! FINAL_RELEASE_STATE=$(gh api "repos/${REPO_FULL}/releases/${RELEASE_ID}" \
  --jq 'if .draft then "draft" elif .prerelease then "prerelease" else "published" end'); then
  echo "  ABORT: release command completed, but Release ${TAG} could not be verified." >&2
  exit 1
fi
if [ "${FINAL_RELEASE_STATE}" != "published" ]; then
  echo "  ABORT: Release ${TAG} is ${FINAL_RELEASE_STATE}, expected published." >&2
  exit 1
fi

PUBLISHED_TAG_SHA=""
for attempt in 1 2 3 4 5; do
  if PUBLISHED_TAG_SHA=$(remote_tag_commit); then
    break
  fi
  PUBLISHED_TAG_SHA=""
  [ "${attempt}" -eq 5 ] || sleep 2
done
if [ -z "${PUBLISHED_TAG_SHA}" ]; then
  echo "  ABORT: release command completed, but remote tag ${TAG} could not be verified." >&2
  exit 1
fi
if [ "${PUBLISHED_TAG_SHA}" != "${HEAD_SHA}" ]; then
  echo "  ABORT: published tag ${TAG} resolves to ${PUBLISHED_TAG_SHA}, expected ${HEAD_SHA}." >&2
  echo "         Runtime sync was not performed." >&2
  exit 1
fi

echo ""
echo "  Release published: ${TAG}"
echo "  https://github.com/${REPO_FULL}/releases/tag/${TAG}"
echo "  Remote tag verified: ${PUBLISHED_TAG_SHA}"
echo ""

# ---- Step 5: Mirror the verified public release into the local runtime ----

if [ -f "${REPO_ROOT}/scripts/sync-runtime.sh" ]; then
  echo "  Syncing verified release to local extension folder..."
  bash "${REPO_ROOT}/scripts/sync-runtime.sh" --zip "${ZIP_PATH}" \
    || echo "  [release] WARN: runtime sync failed (public release remains valid)"
  echo ""
fi

# ---- Step 6: Purge GitHub camo cache so README shields.io badge updates immediately ----
README_URL="https://github.com/${REPO_FULL}"
if README_HTML=$(curl -fsSL "${README_URL}"); then
  CAMO_URL=$(printf '%s\n' "${README_HTML}" \
    | grep -oE 'https://camo\.githubusercontent\.com/[^"]*' \
    | grep -E 'release%2F|release/' \
    | head -1 || true)
  if [ -z "${CAMO_URL}" ]; then
    echo "  (no camo URL detected for version badge — skipping purge)"
  elif STATUS=$(curl -sS -X PURGE -o /dev/null -w "%{http_code}" "${CAMO_URL}"); then
    case "${STATUS}" in
      2??) echo "  Camo cache PURGE → HTTP ${STATUS} (badge refreshes within seconds)" ;;
      *) echo "  [release] WARN: camo PURGE returned HTTP ${STATUS}; release remains published." >&2 ;;
    esac
  else
    echo "  [release] WARN: camo PURGE request failed; release remains published." >&2
  fi
else
  echo "  [release] WARN: could not read GitHub README for camo lookup; skipping purge." >&2
fi
