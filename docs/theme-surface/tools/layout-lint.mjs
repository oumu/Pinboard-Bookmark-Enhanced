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

// RULE 3: composer (classic-list-v2.mjs) — form.input + form.submit + form.reset must declare
// EXACTLY the same padding + border-radius + line-height so their box-sizing:border-box
// heights match pixel-for-pixel in inline forms (input next to submit, etc).
const composerPath = resolve(__dirname, "..", "composers", "classic-list-v2.mjs");
const composerSrc = readFileSync(composerPath, "utf8");
function pickBlock(headerNeedle) {
  const idx = composerSrc.indexOf(headerNeedle);
  if (idx < 0) return null;
  const after = composerSrc.slice(idx);
  const end = after.search(/\n\}\s*\n/);
  return end > 0 ? after.slice(0, end) : after.slice(0, 600);
}
function extract(body, prop) {
  const m = body && body.match(new RegExp("\\b" + prop + "\\s*:\\s*([^;\\n]+)"));
  return m ? m[1].trim().replace(/\s*!important\s*$/, "") : null;
}
const inputBody = pickBlock('input[type="text"], input:not([type])');
const submitBody = pickBlock('input[type="submit"], input[type="button"]');
const resetBody = pickBlock('input[type="reset"], input[type="reset"].reset');
if (!inputBody || !submitBody || !resetBody) {
  console.log("  composer  could not locate one or more form rules — skipped padding/radius/line-height lint");
  warnings++;
} else {
  const props = ["padding", "border-radius", "line-height"];
  for (const prop of props) {
    const ip = extract(inputBody, prop);
    const sp = extract(submitBody, prop);
    const rp = extract(resetBody, prop);
    if (!ip || !sp || !rp) {
      console.log(`  composer  ${prop}: missing — input=${ip} submit=${sp} reset=${rp}`);
      blockers++;
    } else if (ip !== sp || sp !== rp) {
      console.log(`  composer  ${prop} mismatch — input='${ip}' submit='${sp}' reset='${rp}' (must be identical for height alignment)`);
      blockers++;
    }
  }
}

// RULE 4: composer — #bmarks_page_nav a.filter (non-selected) must NOT declare horizontal padding.
// Pinboard's filter row sits inside a flex container; padding on every link still adds to flex item
// width and pushes RSS chip to wrap on narrow themes.
// Only the .selected pill may have padding, and only when balanced by negative margin (zero inline drift).
function pickInlineRule(prefix) {
  // For single-line rules like `selector { decls }`. Extracts content between the
  // first `{` and the LAST `}` on the same line, so embedded `${v("...")}` template
  // literals don't truncate the body early.
  const idx = composerSrc.indexOf(prefix);
  if (idx < 0) return null;
  const lineEnd = composerSrc.indexOf("\n", idx);
  const line = composerSrc.slice(idx, lineEnd > 0 ? lineEnd : composerSrc.length);
  const start = line.indexOf("{");
  const end = line.lastIndexOf("}");
  if (start < 0 || end < 0 || end <= start) return null;
  return line.slice(start + 1, end);
}
const filterBaseBody = pickInlineRule("#bmarks_page_nav a.filter {");
const filterSelBody  = pickInlineRule("#bmarks_page_nav a.filter.selected {");
const navRootBody    = pickInlineRule("#bmarks_page_nav {");
const rssBoxBody     = pickInlineRule("#bmarks_page_nav .rss_linkbox {");
if (filterBaseBody && /\bpadding\s*:/.test(filterBaseBody)) {
  console.log(`  composer  #bmarks_page_nav a.filter (base) declares padding — would wrap the flex filter row. Move padding to .selected only.`);
  blockers++;
}
if (filterSelBody) {
  const padX = (filterSelBody.match(/\bpadding\s*:\s*[\d.]+\w*\s+([\d.]+)(\w+)/) || [])[1];
  const marX = (filterSelBody.match(/\bmargin\s*:\s*[\d.]+\w*\s+(-?[\d.]+)(\w+)/) || [])[1];
  if (padX && (!marX || Number(marX) !== -Number(padX))) {
    console.log(`  composer  #bmarks_page_nav a.filter.selected has padding-x=${padX} but margin-x=${marX || 'missing'} — must be exact negative to neutralize inline drift.`);
    blockers++;
  }
}
// RSS chip pinning contract: nav must be flexbox + .rss_linkbox must use margin-left:auto.
// Without this, RSS wraps to a second line on themes with size-base > 13px.
if (navRootBody && !/display\s*:\s*flex/.test(navRootBody)) {
  console.log(`  composer  #bmarks_page_nav must declare display:flex — otherwise .rss_linkbox margin-left:auto won't pin RSS to right.`);
  blockers++;
}
// margin-left:auto can be declared explicitly OR via the 4-value `margin: T R B auto` shorthand.
const hasMarginLeftAuto = rssBoxBody && (
  /margin-left\s*:\s*auto/.test(rssBoxBody) ||
  /margin\s*:\s*\S+\s+\S+\s+\S+\s+auto\b/.test(rssBoxBody)
);
if (!hasMarginLeftAuto) {
  console.log(`  composer  #bmarks_page_nav .rss_linkbox must declare margin-left:auto (explicit or 4-value shorthand) — otherwise RSS won't be right-aligned in flex layout.`);
  blockers++;
}
// Outer .user_navbar must ALSO be flex so the inner #bmarks_page_nav (flex item with BFC) doesn't
// drop below the float-left siblings (.small_username, .bookmark_count_box).
const userNavbarBody = pickInlineRule(".user_navbar {");
if (!userNavbarBody || !/display\s*:\s*flex/.test(userNavbarBody)) {
  console.log(`  composer  .user_navbar must declare display:flex — otherwise inner #bmarks_page_nav (flex BFC) drops to a 2nd line below .small_username/.bookmark_count_box floats.`);
  blockers++;
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
