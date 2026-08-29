// Vendor lock check (roadmap #38): verify every shipped vendor artifact's
// SHA-256 against the hand-maintained vendor/vendor-lock.json oracle, and
// verify the lock covers every vendor file that actually ships (a file on
// disk with no lock entry is as suspicious as a hash mismatch). Run by
// verify.sh; exit 1 on any drift.
//
// The lock is deliberately NOT generated from the shipped files — that would
// be "consistent with myself" (project testing iron rule). It is written by
// hand at each vendor refresh, from the versions update-vendor.sh reports.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lock = JSON.parse(readFileSync(join(ROOT, "vendor", "vendor-lock.json"), "utf8"));

let failures = 0;
const fail = (msg) => { failures++; console.error(`[vendor-lock] FAIL: ${msg}`); };

// 1. Every locked file exists and matches its recorded hash.
for (const [rel, entry] of Object.entries(lock.files)) {
  let body;
  try {
    body = readFileSync(join(ROOT, rel));
  } catch {
    fail(`${rel}: locked but missing on disk`);
    continue;
  }
  const sha = createHash("sha256").update(body).digest("hex");
  if (sha !== entry.sha256) {
    fail(`${rel}: sha256 mismatch (disk ${sha.slice(0, 12)}… vs lock ${entry.sha256.slice(0, 12)}…) — unrecorded upgrade or tampering; refresh the lock deliberately`);
  }
}

// 2. Every vendor file that ships is covered: locked, the README, or fonts.
const covered = new Set(Object.keys(lock.files));
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    const rel = relative(ROOT, abs).split("\\").join("/");
    if (statSync(abs).isDirectory()) { walk(abs); continue; }
    if (rel === "vendor/vendor-lock.json" || rel === "vendor/README.md") continue;
    if (rel.startsWith(lock.fontPolicy.dir + "/")) {
      if (!rel.endsWith(lock.fontPolicy.extension)) fail(`${rel}: non-${lock.fontPolicy.extension} file in the fonts dir`);
      continue;
    }
    if (!covered.has(rel)) fail(`${rel}: ships from vendor/ but has no lock entry`);
  }
};
walk(join(ROOT, "vendor"));

// 3. Font policy: exact count of woff2 files.
const fonts = readdirSync(join(ROOT, lock.fontPolicy.dir)).filter((f) => f.endsWith(lock.fontPolicy.extension));
if (fonts.length !== lock.fontPolicy.count) {
  fail(`${lock.fontPolicy.dir}: ${fonts.length} ${lock.fontPolicy.extension} files, lock expects ${lock.fontPolicy.count}`);
}

if (failures) {
  console.error(`[vendor-lock] ${failures} problem(s)`);
  process.exit(1);
}
console.log(`[vendor-lock] PASS - ${covered.size} artifacts + ${fonts.length} fonts verified against the lock`);
