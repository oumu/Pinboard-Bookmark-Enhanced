#!/usr/bin/env node
// Task 12 review round 2 verification: computed-style matrix for options.html
// across the default (no-preset) surface + all 14 data-theme presets, for
// every selector this fix round touched -- base state AND forced :hover.
//
// Modes:
//   node scripts/options-color-matrix.mjs --dump <out.json>   dump current state
//   node scripts/options-color-matrix.mjs --diff <before.json> <after.json>
//     print every (theme, selector, prop) pair whose value changed
//
// Not wired into verify.sh / pre-commit -- this is a one-off review-response
// artifact (matches CLAUDE.md's precedent for scripts/ecdict-import-perf.mjs).
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const req = createRequire(resolve(ROOT, ".qa-scan", "package.json"));
const { chromium } = req("playwright");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".mjs": "text/javascript", ".json": "application/json" };

const THEMES = [
  null, // default / no preset
  "modern-card", "nord-night", "terminal", "paper-ink", "dracula",
  "flexoki-light", "flexoki-dark", "solarized-light", "solarized-dark",
  "catppuccin-latte", "catppuccin-mocha", "gruvbox-dark", "rose-pine", "github-light",
];

// [selector, hasHover] -- every selector this fix round's base OR override
// rules touch (color/background/border tokens changed, redundant-override
// deletions, or A/B-class remaps). Hover probed where the changed rule is a
// :hover variant.
const PROBES = [
  ["body", false],
  ["h1", false],
  [".panel", false],
  [".tab-btn", false],
  [".tab-btn", true],
  [".tab-btn.active", false],
  [".reset-tab-btn", false],
  [".reset-tab-btn", true],
  [".fg label.bl", false],
  [".panel-foot a", false],
  [".panel-foot a", true],
  [".hint", false],
  [".hint a", false],
  [".hint code", false],
  [".kbd-help-chips kbd", false],
  [".free-tier-help", false],
  [".free-tier-help summary", false],
  [".opt-error", false],
  [".divider", false],
  [".save-status", false],
  [".save-status.bad", false],
  [".field-warn", false],
  [".section-title", false],
  [".pf", false],
  [".pf h3", false],
  [".et-onboarding", false],
  [".et-onboarding summary", false],
  ['.et-field select', true],
  [".accordion-section", false],
  [".accordion-header", false],
  [".accordion-header", true],
  [".auto-save-hint", false],
  [".auto-save-hint.saved", false],
  [".theme-group-label", false],
  [".theme-preset-btn.active", false],
  [".saved-theme-btn.active", false],
  [".theme-preset-btn.active::after", false],
  [".saved-theme-del", false],
  [".key-toggle", false],
  [".key-toggle", true],
  [".status-ic.ok", false],
  [".status-ic.bad", false],
  ["#opt-custom-css", false],
  [".fg select", true],
  [".et-test-status.ok", false],
  [".et-test-status.err", false],
  [".et-test-status.warn", false],
  [".confirm-popover", false],
  [".confirm-popover .confirm-no", false],
  [".confirm-popover .confirm-no", true],
  [".theme-name-popover", false],
  [".theme-name-popover label", false],
  [".theme-name-popover .tnp-overwrite", false],
  [".theme-name-popover .tnp-save", false],
  [".theme-name-popover .tnp-save", true],
  [".theme-name-popover .tnp-cancel", false],
  [".theme-name-popover .tnp-cancel", true],
  [".overlay-byte-counter", false],
  [".overlay-byte-counter.warn", false],
  [".overlay-byte-counter.over", false],
  [".preset-preview-section", false],
  [".preset-preview-section summary", false],
  [".preset-preview-section summary", true],
  [".preset-preview-content", false],
  [".tag-gov-problem-kind.bad", false],
  [".vocab-disclosure > summary", true],
  [".vocab-drive-fields", false],
];

const PROPS = ["color", "background-color", "border-top-color", "border-left-color"];
// border-*-color is only visually meaningful where the matching side has a
// nonzero width -- an invisible 0-width side's color is allowed to drift
// freely (e.g. currentcolor) with zero rendered effect, and several redundant
// html[data-theme] overrides this round set border-color on all four sides
// even though the base rule only ever gives ONE side a nonzero width. Capture
// width alongside color so the diff pass can filter these out instead of
// misreporting them as visual changes.
const WIDTH_PROPS = ["border-top-width", "border-left-width"];

function serveRoot() {
  return new Promise((resolveStart) => {
    const server = createServer((req, res) => {
      const urlPath = decodeURIComponent(req.url.split("?")[0]);
      const filePath = resolve(ROOT, "." + urlPath === "./" ? "./options.html" : "." + urlPath);
      readFile(filePath).then((buf) => {
        res.writeHead(200, { "Content-Type": MIME[extname(filePath)] || "application/octet-stream" });
        res.end(buf);
      }).catch(() => { res.writeHead(404); res.end("not found"); });
    });
    server.listen(0, "127.0.0.1", () => resolveStart({ server, port: server.address().port }));
  });
}

async function dump() {
  const { server, port } = await serveRoot();
  const browser = await chromium.launch();
  const page = await browser.newPage();
  // options.css's own @media (prefers-reduced-motion: reduce) block sets
  // transition-duration: 0.01ms !important on every element -- without this,
  // a getComputedStyle() read right after mouse.move()/hover() lands
  // mid-transition (.tab-btn/.reset-tab-btn/.panel-foot a all animate color
  // over --motion-state = 150ms) and returns an interpolated color that
  // belongs to neither the before nor the after state (caught empirically:
  // first pass without this produced nonsense like a terminal-theme value
  // bleeding into a paper-ink probe).
  await page.emulateMedia({ reducedMotion: "reduce" });
  // options.js will throw on chrome.* undefined -- harmless for static
  // computed-style extraction, we never call into it.
  page.on("pageerror", () => {});
  await page.goto(`http://127.0.0.1:${port}/options.html`, { waitUntil: "load" });
  // Force the layout visible (normally gated by html[data-options-ready]).
  await page.evaluate(() => { document.documentElement.dataset.optionsReady = "1"; });

  const out = {};
  for (const theme of THEMES) {
    const key = theme || "default";
    await page.evaluate((t) => {
      if (t) document.documentElement.dataset.theme = t;
      else delete document.documentElement.dataset.theme;
    }, theme);
    out[key] = {};
    for (const [sel, hover] of PROBES) {
      const probeSel = sel.replace("::after", "");
      const isAfter = sel.endsWith("::after");
      const label = `${sel}${hover ? ":hover" : ""}`;
      try {
        if (hover) {
          const handle = await page.$(probeSel);
          if (handle) { await handle.hover({ force: true, timeout: 2000 }).catch(() => {}); }
        }
        const vals = await page.evaluate(({ probeSel, isAfter, props, widthProps }) => {
          const el = document.querySelector(probeSel);
          if (!el) return null;
          const cs = getComputedStyle(el, isAfter ? "::after" : null);
          const r = {};
          for (const p of props) r[p] = cs.getPropertyValue(p);
          for (const p of widthProps) r[p] = cs.getPropertyValue(p);
          return r;
        }, { probeSel, isAfter, props: PROPS, widthProps: WIDTH_PROPS });
        out[key][label] = vals;
        if (hover) {
          // reset hover by moving mouse away
          await page.mouse.move(0, 0);
        }
      } catch (e) {
        out[key][label] = { error: String(e.message || e) };
      }
    }
  }
  await browser.close();
  server.close();
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === "--dump") {
    const out = await dump();
    await writeFile(resolve(ROOT, args[1]), JSON.stringify(out, null, 2));
    console.log(`wrote ${args[1]}`);
    return;
  }
  if (args[0] === "--diff") {
    const before = JSON.parse(await readFile(resolve(ROOT, args[1]), "utf8"));
    const after = JSON.parse(await readFile(resolve(ROOT, args[2]), "utf8"));
    let changes = 0;
    for (const theme of Object.keys(after)) {
      const b = before[theme] || {};
      const a = after[theme];
      for (const label of Object.keys(a)) {
        const bv = b[label], av = a[label];
        if (!bv || !av) continue;
        for (const prop of PROPS) {
          if (bv[prop] === av[prop] || (!bv[prop] && !av[prop])) continue;
          // Zero-width side: color drift there never paints.
          const widthProp = prop === "border-top-color" ? "border-top-width" : prop === "border-left-color" ? "border-left-width" : null;
          if (widthProp && parseFloat(av[widthProp]) === 0 && parseFloat(bv[widthProp]) === 0) continue;
          changes++;
          console.log(`[${theme}] ${label} ${prop}: "${bv[prop] ?? "(none)"}" -> "${av[prop] ?? "(none)"}"`);
        }
      }
    }
    console.log(`\n${changes} value(s) changed across ${THEMES.length} theme states x ${PROBES.length} probes x ${PROPS.length} props`);
    return;
  }
  console.error("usage: --dump <out.json> | --diff <before.json> <after.json>");
  process.exit(2);
}
main();
