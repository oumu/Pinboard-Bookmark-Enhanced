#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT=$(git rev-parse --show-toplevel)
VENDOR_DIR="${REPO_ROOT}/vendor"
mkdir -p "${VENDOR_DIR}"

TMP=$(mktemp -d)
npm pack defuddle --pack-destination "${TMP}"
tar xzf "${TMP}"/defuddle-*.tgz -C "${TMP}"

VERSION=$(node -e "console.log(require('${TMP}/package/package.json').version)")
cp "${TMP}/package/dist/index.js" "${VENDOR_DIR}/defuddle.js"
sed -i "1s|^|// defuddle v${VERSION} — https://github.com/kepano/defuddle\n|" "${VENDOR_DIR}/defuddle.js"
rm -rf "${TMP}"

echo "Updated to defuddle v${VERSION}"
echo "  ${VENDOR_DIR}/defuddle.js"

# Update Turndown
TMP2=$(mktemp -d)
npm pack turndown --pack-destination "${TMP2}"
tar xzf "${TMP2}"/turndown-*.tgz -C "${TMP2}"

TD_VERSION=$(node -e "console.log(require('${TMP2}/package/package.json').version)")
cp "${TMP2}/package/lib/turndown.browser.umd.js" "${VENDOR_DIR}/turndown.js"
sed -i "1s|^|// turndown v${TD_VERSION} — https://github.com/mixmark-io/turndown\n|" "${VENDOR_DIR}/turndown.js"
rm -rf "${TMP2}"

echo "Updated to turndown v${TD_VERSION}"
echo "  ${VENDOR_DIR}/turndown.js"
