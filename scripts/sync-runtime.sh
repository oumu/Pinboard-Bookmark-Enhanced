#!/usr/bin/env bash
set -euo pipefail

# Mirror a built release ZIP into the local unpacked-extension folder that
# Windows Chrome loads via "Load unpacked". The release ZIP is the single
# source of truth for what ships, so this never drifts from release.sh's
# file-selection rules. rsync --delete makes the destination an exact mirror
# (stale runtime files removed), matching "keep only the release content".
#
# Usage:
#   scripts/sync-runtime.sh                 # mirror release/<current-version>.zip
#   scripts/sync-runtime.sh --zip <path>    # mirror a specific ZIP
#   scripts/sync-runtime.sh --dest <path>   # override destination folder
#   PBP_RUNTIME_DEST=<path> scripts/sync-runtime.sh   # same, via env
#
# Destination defaults to the Windows D: drive folder Chrome already loads.

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd "${SCRIPT_DIR}/.." && pwd)
MANIFEST="${REPO_ROOT}/manifest.json"
RELEASE_DIR="${REPO_ROOT}/release"

DEST="${PBP_RUNTIME_DEST:-/mnt/d/APP/Chrome-Extensions/Pinboard-Bookmark-Enhanced}"
ZIP_PATH=""

while [ $# -gt 0 ]; do
  case "$1" in
    --zip)  ZIP_PATH="${2:-}"; shift 2 ;;
    --dest) DEST="${2:-}"; shift 2 ;;
    -h|--help)
      grep '^#' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) echo "  [sync-runtime] Unknown arg: $1" >&2; exit 2 ;;
  esac
done

if [ -z "${ZIP_PATH}" ]; then
  # grep-filter guards against shell shims (e.g. safe-chain) printing to stdout.
  VERSION=$(python3 -c "import json; print(json.load(open('${MANIFEST}'))['version'])" 2>/dev/null \
    | grep -E '^[0-9.]+$' | tail -1)
  ZIP_PATH="${RELEASE_DIR}/pinboard-bookmark-enhanced-v${VERSION}.zip"
fi

if [ ! -f "${ZIP_PATH}" ]; then
  echo "  [sync-runtime] ZIP not found: ${ZIP_PATH}" >&2
  echo "  Build one first:  bash scripts/release.sh   (or pass --zip <path>)" >&2
  exit 1
fi

# Safety guard: refuse to delete-mirror into an unexpected destination.
case "${DEST}" in
  */Pinboard-Bookmark-Enhanced) : ;;
  *)
    echo "  [sync-runtime] Refusing: --dest must end in /Pinboard-Bookmark-Enhanced" >&2
    echo "                 got: ${DEST}" >&2
    exit 2 ;;
esac

command -v rsync >/dev/null 2>&1 || { echo "  [sync-runtime] rsync not found" >&2; exit 1; }
command -v unzip >/dev/null 2>&1 || { echo "  [sync-runtime] unzip not found" >&2; exit 1; }

if ! mkdir -p "${DEST}" 2>/dev/null; then
  echo "  [sync-runtime] Destination unavailable (mounted?): ${DEST}" >&2
  exit 1
fi

TMP=$(mktemp -d)
trap 'rm -rf "${TMP}"' EXIT

unzip -q "${ZIP_PATH}" -d "${TMP}"

# The ZIP wraps everything in one top-level dir (pinboard-bookmark-enhanced-vX.Y.Z/).
SRC=$(find "${TMP}" -mindepth 1 -maxdepth 1 -type d | head -1)
if [ -z "${SRC}" ] || [ ! -f "${SRC}/manifest.json" ]; then
  echo "  [sync-runtime] Unexpected ZIP layout (no manifest.json under top dir)" >&2
  exit 1
fi

echo "  Mirroring $(basename "${ZIP_PATH}") -> ${DEST}"
# --checksum, not the size+mtime quick check: release.sh stamps every ZIP
# entry with the same fixed 1980-01-01 mtime (reproducible builds), so a file
# whose SIZE is unchanged between versions (manifest.json "2.107.3" ->
# "2.107.5", a same-length one-line fix) looked identical to rsync and was
# silently left stale in the mirror (device 2026-08-26: code 2.107.5,
# manifest still 2.107.3). ~110 files; content hashing is cheap here.
rsync -rtc --delete --no-perms --no-owner --no-group "${SRC}/" "${DEST}/"

test -f "${DEST}/manifest.json" || {
  echo "  [sync-runtime] FAILED: manifest.json missing in destination after sync" >&2
  exit 1
}

COUNT=$(find "${DEST}" -type f | wc -l | tr -d ' ')
echo "  Synced ${COUNT} files. Reload at chrome://extensions to pick up changes."
