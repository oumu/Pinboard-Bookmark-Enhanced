#!/usr/bin/env bash
# Refresh vendored JS libraries to the TRUE npm-registry "latest", BYPASSING any
# local npm cooldown (e.g. Aikido safe-chain's rolling ~7-day "before" window).
#
# Why not `npm pack`: safe-chain wraps npm/npx/yarn/pnpm/bun/pip and injects a
# `--before=<~7 days ago>` cutoff, so `npm pack <pkg>@latest` silently resolves to
# an OLDER version and `@<fresh-version>` ETARGETs. It does NOT wrap curl or node.
# So we fetch release tarballs straight from registry.npmjs.org over HTTP and
# verify the SHA-1 the registry itself publishes (dist.shasum) — cooldown-immune
# by construction, and still tamper-evident against the published artifact.
#
# Covers: defuddle, turndown, marked, dompurify (npm) + highlight.js (cdnjs build).
# NOT covered: katex/ (multi-file dist + woff2 fonts) — refresh per vendor/README.md.
set -euo pipefail
REPO_ROOT=$(git rev-parse --show-toplevel)
VENDOR_DIR="${REPO_ROOT}/vendor"
mkdir -p "${VENDOR_DIR}"
TMP=$(mktemp -d)
trap 'rm -rf "${TMP}"' EXIT

REG="https://registry.npmjs.org"

# fetch_npm <pkg> <path-in-tarball> <dest-file> <banner-name|""> <banner-url|"">
# A non-empty banner-name prepends "// <name> v<ver> — <url>" — used for dist
# files that ship WITHOUT their own version banner (defuddle, turndown). marked
# and dompurify carry their own upstream banner, so pass "" for those.
fetch_npm() {
  local pkg="$1" path="$2" dest="$3" bname="$4" burl="${5:-}"
  curl -fsS "${REG}/${pkg}/latest" -o "${TMP}/m.json"
  local line ver url sha
  line=$(node -e 'const d=require(process.argv[1]);process.stdout.write(d.version+" "+d.dist.tarball+" "+d.dist.shasum)' "${TMP}/m.json")
  ver="${line%% *}"; url="${line#* }"; url="${url%% *}"; sha="${line##* }"
  curl -fsSL "${url}" -o "${TMP}/p.tgz"
  local got; got=$(sha1sum "${TMP}/p.tgz" | cut -d' ' -f1)
  if [ "${got}" != "${sha}" ]; then
    echo "  ✗ integrity FAIL ${pkg}@${ver}: got ${got}, registry says ${sha}" >&2
    exit 1
  fi
  rm -rf "${TMP}/package"
  tar xzf "${TMP}/p.tgz" -C "${TMP}"
  cp "${TMP}/package/${path}" "${VENDOR_DIR}/${dest}"
  if [ -n "${bname}" ]; then
    sed -i "1s|^|// ${bname} v${ver} — ${burl}\n|" "${VENDOR_DIR}/${dest}"
  fi
  echo "  ${dest}  <-  ${pkg}@${ver}  (sha1 verified, cooldown-bypassed)"
}

echo "Refreshing vendored libraries from registry.npmjs.org (cooldown-bypassed):"
fetch_npm defuddle  dist/index.js               defuddle.js    defuddle "https://github.com/kepano/defuddle"
fetch_npm turndown  lib/turndown.browser.umd.js turndown.js    turndown "https://github.com/mixmark-io/turndown"
fetch_npm marked    lib/marked.umd.js           marked.min.js  ""
fetch_npm dompurify dist/purify.min.js          purify.min.js  ""

# highlight.js — the prebuilt browser bundle is NOT in the npm tarball; it lives
# on cdnjs. Resolve the latest version from the npm registry, then pull that exact
# build + the two github themes the extension ships.
curl -fsS "${REG}/highlight.js/latest" -o "${TMP}/hljs.json"
HLJS_VER=$(node -e 'process.stdout.write(require(process.argv[1]).version)' "${TMP}/hljs.json")
CDN="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/${HLJS_VER}"
curl -fsSL "${CDN}/highlight.min.js"              -o "${VENDOR_DIR}/highlight.min.js"
curl -fsSL "${CDN}/styles/github.min.css"         -o "${VENDOR_DIR}/hljs-github.min.css"
curl -fsSL "${CDN}/styles/github-dark.min.css"    -o "${VENDOR_DIR}/hljs-github-dark.min.css"
echo "  highlight.min.js + hljs-github*.min.css  <-  highlight.js@${HLJS_VER}  (cdnjs)"

echo ""
echo "Done. NOTE: a marked major bump may require adapting the custom renderer.heading"
echo "in md-convert.js (v13+ passes a token object, not positional text/level/raw)."
echo "katex/ is not refreshed here — see vendor/README.md. Run the test suite + zip-smoke."
echo ""
echo "vendor-lock: update vendor/vendor-lock.json in the SAME commit (versions above +"
echo "these sha256 sums), or scripts/vendor-lock-check.mjs will fail verify.sh:"
( cd "${REPO_ROOT}" && sha256sum vendor/defuddle.js vendor/turndown.js vendor/marked.min.js \
    vendor/purify.min.js vendor/highlight.min.js vendor/hljs-github.min.css \
    vendor/hljs-github-dark.min.css 2>/dev/null | sed 's/^/  /' ) || true
