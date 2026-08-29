#!/usr/bin/env node
// Regenerates docs/cws-assets/store-descriptions.md from the nine READMEs.
//
// The Chrome Web Store's detailed-description field is PLAIN TEXT: it renders no
// Markdown, so bold markers, backticks and [label](url) links would all show up
// literally. This converts the README feature list into what should actually be
// pasted, keeping the store listing and the READMEs from drifting apart.
//
// The paid-account disclosure is NOT taken from the README: it is the wording a
// CWS review already accepted (a missing paid disclosure got this extension
// rejected once), plus the sentence stating AI is optional and BYO-key. It is
// carried over verbatim from the previous generated file.
//
// Usage:
//   node scripts/sync-store-descriptions.mjs           rewrite the file
//   node scripts/sync-store-descriptions.mjs --check    exit 1 if it is stale
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "docs/cws-assets/store-descriptions.md");

const LOCALES = [
  ["English (en)", "README.md"],
  ["简体中文 (zh-CN)", "README.zh-CN.md"],
  ["繁體中文 (zh-TW)", "README.zh-TW.md"],
  ["繁體中文（香港） (zh-HK)", "README.zh-HK.md"],
  ["Deutsch (de)", "README.de.md"],
  ["Français (fr)", "README.fr.md"],
  ["日本語 (ja)", "README.ja.md"],
  ["Polski (pl)", "README.pl.md"],
  ["Русский (ru)", "README.ru.md"],
];

// Markdown -> the plain text the store actually shows.
function toPlainText(md) {
  return md
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")  // links: keep the URL visible
    .replace(/\*\*([^*]+)\*\*/g, "$1")               // bold markers
    .replace(/`([^`]+)`/g, "$1")                     // code spans
    .replace(/[ \t]+$/gm, "");
}

// The disclosure block from the previous generation, one entry per locale, in
// LOCALES order. Regenerating never rewrites these.
function readExistingDisclosures() {
  const previous = readFileSync(OUT, "utf8");
  const blocks = [...previous.matchAll(/```text\n([\s\S]*?)\n```/g)].map((m) => m[1]);
  if (blocks.length !== LOCALES.length) {
    throw new Error(`expected ${LOCALES.length} text blocks in the existing file, found ${blocks.length}`);
  }
  return blocks.map((block, index) => {
    const disclosure = block.split("\n\n")[0].trim();
    if (!disclosure) throw new Error(`empty disclosure for ${LOCALES[index][0]}`);
    return disclosure;
  });
}

function buildFeatures(readmePath) {
  const text = readFileSync(resolve(ROOT, readmePath), "utf8");
  const features = text.split(/^## /m).find((part) => /^### /m.test(part));
  if (!features) throw new Error(`no feature section in ${readmePath}`);
  const lines = [];
  for (const raw of features.split("\n")) {
    if (/^!\[/.test(raw)) continue;                       // screenshots
    const heading = raw.match(/^### (.+)$/);
    if (heading) { lines.push("", `# ${toPlainText(heading[1])}`); continue; }
    if (/^- /.test(raw)) { lines.push(toPlainText(raw)); continue; }
  }
  const sections = lines.filter((line) => line.startsWith("# ")).length;
  const bullets = lines.filter((line) => line.startsWith("- ")).length;
  // 4 sections is the README structural contract (docs-lint asserts it too);
  // the bullet count is not pinned here — the nine locales must mirror each
  // other, with the first locale (EN) as the baseline. A hardcoded count went
  // stale silently when the READMEs grew from 15 to 17 bullets.
  if (sections !== 4) {
    throw new Error(`${readmePath}: expected 4 sections, got ${sections}`);
  }
  return { text: lines.join("\n").trim(), sections, bullets };
}

const disclosures = readExistingDisclosures();
const parts = [
  "# Chrome Web Store — Store Descriptions (per locale)",
  "",
  "> Paste the matching locale block into **CWS Dashboard → Store listing → Detailed description**",
  "> for that language. **Plain text** — the Chrome Web Store renders no Markdown, so this file",
  "> already has the bold markers, backticks and link syntax removed.",
  ">",
  "> **Generated** by `node scripts/sync-store-descriptions.mjs` from the nine READMEs. Edit the",
  "> READMEs and regenerate; do not hand-edit the blocks below. The leading ⚠ paid-account",
  "> disclosure is the wording a CWS review already accepted and is carried across regenerations",
  "> untouched.",
  "",
];
let baseline = null;
LOCALES.forEach(([label, readme], index) => {
  const feat = buildFeatures(readme);
  if (!baseline) {
    baseline = { bullets: feat.bullets, path: readme };
  } else if (feat.bullets !== baseline.bullets) {
    throw new Error(`${readme}: ${feat.bullets} bullets do not mirror ${baseline.path} (${baseline.bullets})`);
  }
  parts.push("---", "", `## ${label}`, "", "```text", disclosures[index], "", feat.text, "```", "");
});
const output = parts.join("\n");

if (process.argv.includes("--check")) {
  const current = readFileSync(OUT, "utf8");
  if (current !== output) {
    console.error("[store-descriptions] STALE — run: node scripts/sync-store-descriptions.mjs");
    process.exit(1);
  }
  console.log("[store-descriptions] up to date");
} else {
  writeFileSync(OUT, output);
  const chars = LOCALES.map(([label], i) => {
    const block = output.split("```text\n")[i + 1].split("\n```")[0];
    return `${label}: ${block.length}`;
  });
  console.log("[store-descriptions] written\n  " + chars.join("\n  "));
}
