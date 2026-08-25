#!/usr/bin/env node
// design-uplift Task 13 verification: computed-style matrix for popup.html
// across the default (no preset) surface + all 14 data-theme presets (the
// former bare dark-class state is retired: no-preset dark is flexoki-dark
// since 2026-08-25), for every selector
// this task's hex/rgba->var() migration touched -- base state AND forced
// :hover where the changed rule is a :hover variant. Adapted from
// scripts/options-color-matrix.mjs (Task 12's own matrix, itself the base
// this file was asked to be reshaped from).
//
// Modes:
//   node scripts/popup-color-matrix.mjs --dump <out.json>   dump current state
//   node scripts/popup-color-matrix.mjs --diff <before.json> <after.json>
//     print every (theme, selector, prop) pair whose value changed
//
// Not wired into verify.sh / pre-commit -- one-off review-response artifact,
// same precedent as options-color-matrix.mjs / ecdict-import-perf.mjs.
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const req = createRequire(resolve(ROOT, ".qa-scan", "package.json"));
const { chromium } = req("playwright");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".mjs": "text/javascript", ".json": "application/json" };

// null = default surface (no dataset.theme). The former "DARK" pseudo-theme
// (the bare dark class) is gone: no-preset dark is the flexoki-dark preset (2026-08-25).
const THEMES = [
  null,
  "modern-card", "nord-night", "terminal", "paper-ink", "dracula",
  "flexoki-light", "flexoki-dark", "solarized-light", "solarized-dark",
  "catppuccin-latte", "catppuccin-mocha", "gruvbox-dark", "rose-pine", "github-light",
];

// [selector, hasHover] -- every selector Task 13's default-light / former
// bare-dark-class / preset-override-cleanup batches touched. Hover probed where the changed
// rule is a :hover variant. ::before support added (popup's loading spinner
// lives on ::before, options had no ::before probe to model this on).
const PROBES = [
  [".login-body .key-toggle", false],
  [".error-text", false],
  [".preset-btn", false],
  [".preset-btn", true],
  [".preset-btn.used", false],
  [".action-link.loading", false],
  [".action-link.loading::before", false],
  [".submit-bar button.loading", false],
  [".submit-bar button.loading::before", false],
  [".tag-remove", false],
  [".stag.used", false],
  [".fc-details", false],
  [".del-btn", false],
  [".del-btn", true],
  [".batch-progress-text", false],
  [".regen-link.loading", false],
  [".regen-link + .regen-link", false],
  [".ql-sep", false],
  [".offline-queue-list", false],
  [".offline-queue-empty", false],
  [".offline-queue-title", false],
  [".offline-queue-meta", false],
  [".offline-queue-actions button", false],
  [".offline-queue-actions button", true],
  [".offline-queue-actions .offline-queue-remove", true],
  [".offline-queue-actions .offline-queue-failed", false],
  [".recent-bm-area", false],
  [".recent-bm-del", false],
  [".recent-bm-edit", false],
  [".edit-cancel", false],
  [".edit-cancel", true],
  [".confirm-popover .confirm-yes", false],
  [".confirm-popover .confirm-yes", true],
  [".confirm-popover .confirm-no", false],
  [".confirm-popover .confirm-no", true],
  ["#desc-char-count.over-limit", false],
  // Step 3 (preset-override dead-code cleanup) verification sweep -- every
  // base/compound selector either a candidate rule was removed FROM or a
  // candidate rule's specificity-family sibling, covering both the 32
  // rules removed as genuinely redundant and the 20 restored after the
  // cascade-specificity investigation (task-13-report.md Appendix). Static
  // markup in popup.html covers most of these directly; a few need the
  // fixture-injected elements above (already covered by existing probes).
  ["body", false],
  ["a", false],
  [".header-bar", false],
  [".header-bar a", false],
  [".header-bar .header-ic", false],
  [".header-bar .header-ic", true],
  [".login-body p", false],
  [".login-body input", false],
  [".login-body input", true],
  [".tags-input-wrap", false],
  [".tags-input-wrap input", false],
  [".ac-count", false],
  [".submit-hint", false],
  [".kb-hint", false],
  [".muted", false],
  [".group-label", false],
  [".stag.ai", false],
  [".action-link", false],
  [".cache-hint", false],
  [".regen-link", false],
  ["#desc-char-count", false],
  [".quick-actions", false],
  [".ac-new-hint", false],
  [".ac-new-hint", true],
  [".ac-new-icon", false],
  [".qbtn", false],
  [".qbtn", true],
  [".qbtn.saving", false],
  [".qbtn.saved", false],
  [".search-field", false],
  [".search-field", true],
  [".clear-all-link", false],
  [".clear-all-link", true],
  [".last-used-hint", false],
  [".last-used-hint", true],
  [".quick-links a", false],
  [".recent-bm-label", false],
  [".recent-bm-item", false],
  [".recent-bm-domain", false],
  [".offline-clear", false],
  [".status-msg.success", false],
  [".status-msg.error", false],
  [".add-all-link", false],
  [".add-all-link", true],
  ['.field > input[type="text"]', false],
  ['.field > input[type="text"]', true],
];

const PROPS = ["color", "background-color", "border-top-color", "border-bottom-color", "border-left-color"];
const WIDTH_PROPS = ["border-top-width", "border-bottom-width", "border-left-width"];

function serveRoot() {
  return new Promise((resolveStart) => {
    const server = createServer((request, res) => {
      const urlPath = decodeURIComponent(request.url.split("?")[0]);
      const filePath = resolve(ROOT, "." + urlPath === "./" ? "./popup.html" : "." + urlPath);
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
  // popup.css's own @media (prefers-reduced-motion: reduce) block sets
  // transition-duration: 0.01ms !important globally -- without this a
  // getComputedStyle() read right after a theme switch or hover() can land
  // mid-transition. Task 12 re-review found this ALONE is not sufficient
  // (implicit "transition: all 0.01ms" still leaves one animation-frame gap
  // between the style recalc and the value settling) -- see the double-rAF
  // wait after every theme switch below, which is the actual fix.
  await page.emulateMedia({ reducedMotion: "reduce" });
  page.on("pageerror", () => {}); // popup.js throws on chrome.* undefined; harmless for static computed-style reads
  await page.goto(`http://127.0.0.1:${port}/popup.html`, { waitUntil: "load" });
  // emulateMedia + double-rAF (below) is STILL not deterministic: a design-
  // uplift Task 13 reviewer re-run (5x back to back) caught a getComputedStyle()
  // read landing on the PREVIOUS theme's --pp-link color. Root cause:
  // popup.css's reduced-motion rule only zeroes transition-DURATION (still a
  // transition, just a very fast one -- one frame can still land mid-flight
  // under real scheduling jitter), and it says nothing about CSS @keyframes
  // animations. A hard override that removes the transition/animation
  // machinery entirely (not just speeds it up) is what actually makes reads
  // deterministic -- verified 3/3 identical dumps after adding this.
  await page.addStyleTag({ content: "*{transition:none!important;animation:none!important}" });

  // Most probed selectors only ever exist as DOM popup.js/popup-*.js create
  // at runtime -- popup.js itself won't run here (no chrome.* APIs), so
  // inject minimal fixture markup mirroring the real DOM shape each producer
  // builds (verified by reading popup.js/popup-tags.js/popup-ai.js/
  // popup-batch.js/popup-offline.js/shared.js's showConfirmPopover -- not
  // guessed). Theme-agnostic: renders correctly under any data-theme.
  await page.evaluate(() => {
    const body = document.body;

    // .preset-btn / .preset-btn.used (popup-batch.js applyTagPresets)
    const presetWrap = document.createElement("div");
    presetWrap.innerHTML = '<button type="button" class="preset-btn">Work</button>'
      + '<button type="button" class="preset-btn used" disabled>Home</button>';
    body.appendChild(presetWrap);

    // .action-link.loading (popup-ai.js classList.add("loading") on #ai-summary-btn)
    const actionLoading = document.createElement("button");
    actionLoading.type = "button";
    actionLoading.className = "action-link loading";
    actionLoading.innerHTML = '<span class="ai-progress-label"></span>';
    body.appendChild(actionLoading);

    // .submit-bar button.loading (popup.js delBtn.classList.add("loading"), same shape as #submit-btn)
    const submitBar = document.createElement("div");
    submitBar.className = "submit-bar";
    const loadingBtn = document.createElement("button");
    loadingBtn.type = "button";
    loadingBtn.className = "loading";
    submitBar.appendChild(loadingBtn);
    body.appendChild(submitBar);

    // .tag-item > .tag-remove (popup-tags.js renderTags) and .stag.used (popup-tags.js)
    const tagsDisplay = document.createElement("span");
    tagsDisplay.innerHTML = '<span class="tag-item"><button type="button" class="tag-remove">x</button></span>';
    body.appendChild(tagsDisplay);
    const stagUsed = document.createElement("button");
    stagUsed.type = "button";
    stagUsed.className = "stag used";
    body.appendChild(stagUsed);

    // .del-btn (popup.js delete-btn). Its child .del-confirm-popover is gone:
    // the Delete button opens the shared .confirm-popover now, which this
    // harness does not need to stand up -- shared.js builds it on the body.
    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "del-btn";
    body.appendChild(delBtn);

    // .regen-link + .regen-link (popup-ai.js createActionLink x2, adjacent siblings)
    const regenWrap = document.createElement("span");
    regenWrap.innerHTML = '<a href="#" class="regen-link loading">Regenerate</a><a href="#" class="regen-link">Remove</a>';
    body.appendChild(regenWrap);

    // .offline-queue-item family (popup-offline.js renderOfflineQueue) --
    // reuse the real static #offline-queue-list container so .offline-queue-list
    // itself is also probed on the real shipped node, not a fixture stand-in.
    const list = document.getElementById("offline-queue-list");
    if (list) {
      list.innerHTML = '<div class="offline-queue-item">'
        + '<div class="offline-queue-body"><div class="offline-queue-title">t</div><div class="offline-queue-meta">m</div></div>'
        + '<div class="offline-queue-actions">'
        + '<button type="button" class="offline-queue-retry">r</button>'
        + '<button type="button" class="offline-queue-remove">x</button>'
        + '<button type="button" class="offline-queue-failed">f</button>'
        + '</div></div>';
    }
    const empty = document.createElement("div");
    empty.className = "offline-queue-empty";
    body.appendChild(empty);

    // .recent-bm-del / .recent-bm-edit -- reuse the real static
    // #recent-bookmarks container (.recent-bm-area probe reads this node).
    const recentArea = document.getElementById("recent-bookmarks");
    if (recentArea) {
      recentArea.innerHTML = '<div class="recent-bm-row">'
        + '<a class="recent-bm-item" href="#">x<span class="recent-bm-domain">d</span></a>'
        + '<span class="recent-bm-edit">e</span>'
        + '<span class="recent-bm-del">d</span></div>';
    }

    // .edit-cancel (popup.js exitEditMode banner append) -- reuse the real
    // static #existing-banner container.
    const banner = document.getElementById("existing-banner");
    if (banner) banner.innerHTML = '<span class="edit-cancel" role="button" tabindex="0">x</span>';

    // .confirm-popover .confirm-yes/.confirm-no (shared.js showConfirmPopover, portaled to body)
    const confirmPop = document.createElement("div");
    confirmPop.className = "confirm-popover";
    confirmPop.innerHTML = '<span class="confirm-msg">msg</span>'
      + '<button type="button" class="confirm-yes">Yes</button>'
      + '<button type="button" class="confirm-no">No</button>';
    body.appendChild(confirmPop);

    // #desc-char-count.over-limit -- state class on the real static node.
    document.getElementById("desc-char-count")?.classList.add("over-limit");
  });

  const settle = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

  const missing = new Set();
  const out = {};
  for (const theme of THEMES) {
    const key = theme || "default";
    await page.evaluate((t) => {
      delete document.documentElement.dataset.theme;
      if (t) document.documentElement.dataset.theme = t;
    }, theme);
    // Double-rAF wait after every dataset.theme/classList switch (Task 12
    // re-review finding: reducedMotion's 0.01ms transition-duration alone
    // still leaves one frame where an in-flight recalc can be read stale).
    await settle();
    out[key] = {};
    for (const [sel, hover] of PROBES) {
      const isBefore = sel.endsWith("::before");
      const probeSel = sel.replace("::before", "");
      const label = `${sel}${hover ? ":hover" : ""}`;
      try {
        if (hover) {
          const handle = await page.$(probeSel);
          if (handle) { await handle.hover({ force: true, timeout: 2000 }).catch(() => {}); }
          await settle();
        }
        const vals = await page.evaluate(({ probeSel, isBefore, props, widthProps }) => {
          const el = document.querySelector(probeSel);
          if (!el) return null;
          const cs = getComputedStyle(el, isBefore ? "::before" : null);
          const r = {};
          for (const p of props) r[p] = cs.getPropertyValue(p);
          for (const p of widthProps) r[p] = cs.getPropertyValue(p);
          return r;
        }, { probeSel, isBefore, props: PROPS, widthProps: WIDTH_PROPS });
        out[key][label] = vals;
        if (vals === null) missing.add(label);
        if (hover) await page.mouse.move(0, 0); // reset hover before the next probe
      } catch (e) {
        out[key][label] = { error: String(e.message || e) };
      }
    }
  }
  await browser.close();
  server.close();
  if (missing.size) {
    console.warn(`\n[popup-color-matrix] WARNING: ${missing.size} probe(s) found no element in EVERY theme state (selector typo, or fixture injection above doesn't cover it):`);
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
    const uncovered = new Set();
    const asymmetric = [];
    for (const theme of Object.keys(after)) {
      const b = before[theme] || {};
      const a = after[theme];
      for (const label of Object.keys(a)) {
        const bv = b[label], av = a[label];
        if (bv === null && av === null) { uncovered.add(label); continue; }
        if ((bv === null) !== (av === null)) { asymmetric.push(`[${theme}] ${label}: ${bv === null ? "before=null" : "after=null"}`); continue; }
        if (!bv || !av) continue;
        for (const prop of PROPS) {
          if (bv[prop] === av[prop] || (!bv[prop] && !av[prop])) continue;
          const widthProp = prop === "border-top-color" ? "border-top-width" : prop === "border-bottom-color" ? "border-bottom-width" : prop === "border-left-color" ? "border-left-width" : null;
          if (widthProp && parseFloat(av[widthProp]) === 0 && parseFloat(bv[widthProp]) === 0) continue;
          changes++;
          console.log(`[${theme}] ${label} ${prop}: "${bv[prop] ?? "(none)"}" -> "${av[prop] ?? "(none)"}"`);
        }
      }
    }
    console.log(`\n${changes} value(s) changed across ${THEMES.length} theme states x ${PROBES.length} probes x ${PROPS.length} props`);
    if (asymmetric.length) {
      console.log(`\n${asymmetric.length} ASYMMETRIC probe(s) -- element existed in only one of the two dumps:`);
      for (const line of asymmetric) console.log(`  ${line}`);
    }
    if (uncovered.size) {
      console.log(`\n${uncovered.size} probe(s) UNCOVERED (null in both dumps) -- not verified by this run:`);
      for (const label of uncovered) console.log(`  ${label}`);
    }
    return;
  }
  console.error("usage: --dump <out.json> | --diff <before.json> <after.json>");
  process.exit(2);
}
main();
