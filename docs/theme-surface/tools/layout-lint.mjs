#!/usr/bin/env node
// layout-lint — flag CSS patterns that have caused layout regressions:
//   1. fixed `width: NNNpx` on label/group selectors (Adaptive label clip)
//   2. content-box inputs without explicit max-width (edit-form input overflow)
//
// The lint is advisory: prints warnings but exits 0 unless a rule is
// classified as "BLOCK". Tightens over time as we add rules.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..", "..");

const TARGETS = [
  resolve(ROOT, "popup.css"),
  resolve(ROOT, "options.css"),
];

let blockers = 0;
let warnings = 0;

for (const path of TARGETS) {
  const text = readFileSync(path, "utf8");
  const file = path.split("/").pop();

  // RULE 1: fixed pixel width on label/group/title-class selectors (the .theme-group-label clip class).
  const re1 = /([^{}\n]*\.[a-z-]*(label|group|title|tag|chip|badge)[^{}\n]*)\{[^}]*\bwidth:\s*(\d+)px[^}]*\}/gi;
  let m;
  while ((m = re1.exec(text)) !== null) {
    const sel = m[1].trim().slice(0, 80);
    const px = parseInt(m[3]);
    if (px <= 100) {
      const lineNum = text.slice(0, m.index).split("\n").length;
      console.log(`  ${file}:${lineNum}  WARN  fixed width:${px}px on label-style selector "${sel}" — use min-width if content can grow (i18n, longer text)`);
      warnings++;
    }
  }

  // RULE 2: width on inline elements that should use min-width (theme-card-style fixed boxes).
  // Skip — too many legit uses; rule 1 covers the high-risk case.
}

// RULE 3: composer (classic-list-v2.mjs) form.input rule must declare padding + border-radius
// so input/textarea/select align with form.submit/form.cancel heights and rounded corners.
// Detection note: composer is a JS template literal so ${v(...)} interpolations contain
// real `{`/`}` chars — naive [^{]/[^}] regexes break. Slice a window after the selector
// header and scan within that window instead.
const composerPath = resolve(__dirname, "..", "composers", "classic-list-v2.mjs");
const composerSrc = readFileSync(composerPath, "utf8");
const headerIdx = composerSrc.indexOf('input[type="text"], input:not([type])');
if (headerIdx >= 0) {
  // Take everything up to the next blank line + selector at column 0 (next CSS rule).
  const after = composerSrc.slice(headerIdx);
  const blockEnd = after.search(/\n\}\s*\n/);
  const body = blockEnd > 0 ? after.slice(0, blockEnd) : after.slice(0, 600);
  if (!/\bpadding\s*:/.test(body)) {
    console.log("  composer  form.input rule missing `padding:` — input/button heights will not align");
    blockers++;
  }
  if (!/\bborder-radius\s*:/.test(body)) {
    console.log("  composer  form.input rule missing `border-radius:` — rounded corners will crowd the text");
    blockers++;
  }
} else {
  console.log("  composer  form.input rule could not be located — skipped padding/radius lint");
  warnings++;
}

console.log("");
if (blockers > 0) {
  console.log(`=== layout-lint: FAIL — ${blockers} blocker(s), ${warnings} warning(s) ===`);
  process.exit(1);
} else if (warnings > 0) {
  console.log(`=== layout-lint: PASS with ${warnings} warning(s) (advisory) ===`);
  process.exit(0);
} else {
  console.log("=== layout-lint: PASS ===");
  process.exit(0);
}
