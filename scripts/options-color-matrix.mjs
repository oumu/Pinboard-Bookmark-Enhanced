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
  [".disclosure > summary", false],
  [".disclosure > summary", true],
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
  // emulateMedia's reduced-motion rule only zeroes transition-DURATION (still
  // a transition, just very fast -- can still land mid-flight under real
  // scheduling jitter) and says nothing about @keyframes animations. This
  // script previously had NO settle wait at all after a theme switch (unlike
  // popup-color-matrix.mjs's double-rAF) -- a design-uplift Task 13 reviewer
  // re-run (5x back to back) caught a getComputedStyle() read landing on the
  // PREVIOUS theme's --opt-link color. Fixed the same way popup's matrix was:
  // remove the transition/animation machinery entirely (not just speed it
  // up) plus a double-rAF wait after every switch/hover below -- verified
  // 3/3 identical dumps after adding both.
  await page.addStyleTag({ content: "*{transition:none!important;animation:none!important}" });
  // Force the layout visible (normally gated by html[data-options-ready]).
  await page.evaluate(() => { document.documentElement.dataset.optionsReady = "1"; });
  // Several probed selectors only ever exist as DOM options.js creates at
  // runtime (confirm popover, theme-name popover, saved-theme buttons,
  // status icons, tag-gov problem rows) -- static options.html never ships
  // them, and options.js itself won't run here (no chrome.* APIs). Task 12
  // review round 3 (item 4): rather than silently probing null 32 times,
  // inject minimal fixture markup that mirrors the real DOM shape each
  // producer builds (shared.js's showConfirmPopover, options.js's saved-
  // theme-button / theme-name-popover / status-ic / tag-gov-problem-kind
  // builders -- verified by reading those functions, not guessed), theme-
  // agnostic so it renders correctly no matter which data-theme is active.
  await page.evaluate(() => {
    const body = document.body;

    const confirmPop = document.createElement("div");
    confirmPop.className = "confirm-popover";
    confirmPop.innerHTML = '<span class="confirm-msg">msg</span><button class="confirm-yes">Yes</button><button class="confirm-no">No</button>';
    body.appendChild(confirmPop);

    const wrap = document.querySelector(".save-theme-wrap");
    const tnp = document.createElement("div");
    tnp.className = "theme-name-popover";
    tnp.innerHTML = '<label>Name</label><input type="text" maxlength="40">'
      + '<p class="tnp-overwrite">overwrite</p>'
      + '<div class="tnp-actions"><button class="tnp-save">Save</button><button class="tnp-cancel">Cancel</button></div>';
    (wrap || body).appendChild(tnp);

    const savedWrap = document.createElement("div");
    savedWrap.className = "saved-theme-wrap";
    savedWrap.innerHTML = '<button class="btn btn-sm saved-theme-btn active">Saved</button><button class="saved-theme-del">x</button>';
    body.appendChild(savedWrap);

    const firstPreset = document.querySelector(".theme-preset-btn");
    if (firstPreset) firstPreset.classList.add("active");

    const statusWrap = document.createElement("div");
    statusWrap.innerHTML = '<span class="status-ic ok">ok</span><span class="status-ic bad">bad</span>';
    body.appendChild(statusWrap);

    const badRow = document.createElement("span");
    badRow.className = "tag-gov-problem-kind bad";
    badRow.textContent = "failed";
    body.appendChild(badRow);

    // These elements exist statically in options.html but only ever pick up
    // their state class (.bad/.saved/.ok/.err/.warn/.over) from a JS call
    // this harness never makes -- flip one real instance of each so the
    // matrix probes the SAME shipped node instead of a synthetic stand-in.
    document.querySelector(".save-status")?.classList.add("bad");
    document.getElementById("auto-save-status")?.classList.add("saved");
    const statusEl = document.getElementById("storage-status");
    if (statusEl) { statusEl.classList.remove("hidden"); statusEl.classList.add("ok"); }
    const counterEl = document.querySelector(".overlay-byte-counter");
    if (counterEl) counterEl.classList.add("warn");

    // .et-test-status.{ok,err,warn} and .et-field select never coexist on
    // the one real #storage-status node (only one state class at a time,
    // and it's a <span>, not the customizable-select markup) -- append
    // throwaway sibling probes instead of fighting that node for double
    // duty. .et-onboarding is NOT static markup in options.html -- it's a
    // live consumer, built by options.js's renderExportTargets() (~line 700)
    // for every PBP_EXPORT_TARGETS row that sets `onboarding` (currently
    // Gist and Webhook). renderExportTargets() runs unconditionally during
    // normal settings load, so the real page this script drives against
    // already has real .et-onboarding markup by the time these PROBES entries
    // run -- no synthetic injection needed here, unlike the two throwaway
    // spans below.
    const etTestOk = document.createElement("span");
    etTestOk.className = "et-test-status ok";
    body.appendChild(etTestOk);
    const etTestErr = document.createElement("span");
    etTestErr.className = "et-test-status err";
    body.appendChild(etTestErr);
    const etTestWarn = document.createElement("span");
    etTestWarn.className = "et-test-status warn";
    body.appendChild(etTestWarn);
    const overCounter = document.createElement("span");
    overCounter.className = "overlay-byte-counter over";
    body.appendChild(overCounter);
    const etFieldSelect = document.createElement("div");
    etFieldSelect.className = "et-field";
    etFieldSelect.innerHTML = "<select><option>a</option></select>";
    body.appendChild(etFieldSelect);
  });

  const settle = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

  const missing = new Set();
  const out = {};
  for (const theme of THEMES) {
    const key = theme || "default";
    await page.evaluate((t) => {
      if (t) document.documentElement.dataset.theme = t;
      else delete document.documentElement.dataset.theme;
    }, theme);
    // Double-rAF wait after every theme switch (same fix as
    // popup-color-matrix.mjs -- the addStyleTag override above already
    // removes the transition/animation window this is closing, but the
    // wait also covers the style-recalc frame gap on its own, so both stay
    // as independent, redundant safety nets rather than relying on one).
    await settle();
    out[key] = {};
    for (const [sel, hover] of PROBES) {
      const probeSel = sel.replace("::after", "");
      const isAfter = sel.endsWith("::after");
      const label = `${sel}${hover ? ":hover" : ""}`;
      try {
        if (hover) {
          const handle = await page.$(probeSel);
          if (handle) { await handle.hover({ force: true, timeout: 2000 }).catch(() => {}); }
          await settle();
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
        if (vals === null) missing.add(label);
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
  if (missing.size) {
    console.warn(`\n[options-color-matrix] WARNING: ${missing.size} probe(s) found no element in EVERY theme state (selector typo, or fixture injection above doesn't cover it):`);
    for (const label of missing) console.warn(`  ${label}`);
  }
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
    const uncovered = new Set(); // both before AND after are null -- probe never found its element in either dump
    const asymmetric = []; // exactly one side null -- element appeared/disappeared between dumps, worth a human look
    for (const theme of Object.keys(after)) {
      const b = before[theme] || {};
      const a = after[theme];
      for (const label of Object.keys(a)) {
        const bv = b[label], av = a[label];
        if (bv === null && av === null) { uncovered.add(label); continue; }
        if ((bv === null) !== (av === null)) { asymmetric.push(`[${theme}] ${label}: ${bv === null ? "before=null" : "after=null"}`); continue; }
        if (!bv || !av) continue; // error case (try/catch), not a real null -- leave to manual inspection
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
    if (asymmetric.length) {
      console.log(`\n${asymmetric.length} ASYMMETRIC probe(s) -- element existed in only one of the two dumps (fixture/DOM shape changed between before/after, not a style change):`);
      for (const line of asymmetric) console.log(`  ${line}`);
    }
    if (uncovered.size) {
      console.log(`\n${uncovered.size} probe(s) UNCOVERED (null in both dumps, across every theme they were null in) -- not verified by this run:`);
      for (const label of uncovered) console.log(`  ${label}`);
    }
    return;
  }
  console.error("usage: --dump <out.json> | --diff <before.json> <after.json>");
  process.exit(2);
}
main();
