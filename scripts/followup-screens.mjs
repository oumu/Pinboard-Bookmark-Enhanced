#!/usr/bin/env node
// scripts/followup-screens.mjs — evidence capture for the 2026-08-06 follow-up
// batch (C1 focus-language unification, C3 fixed-width canvas). NOT a gate:
// it takes pictures, it asserts nothing. The gates are verify.sh's
// [render-audit] / [ui-contract] / [theme] segments.
//
//   node scripts/followup-screens.mjs --focus       # per-theme focus states
//   node scripts/followup-screens.mjs --responsive  # width x view matrix
//   node scripts/followup-screens.mjs               # both
//
// Needs a display: xvfb-run -a node scripts/followup-screens.mjs
// Prereqs identical to scripts/ui-render-audit.mjs (.qa-scan playwright).
import { createRequire } from "node:module";
import { mkdirSync, rmSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const OUT = resolve(ROOT, "docs/superpowers/design-uplift-2026-08/screens/followup");
const TIMEOUT_MS = 15000;

const req = createRequire(resolve(ROOT, ".qa-scan", "package.json"));
const { chromium } = req("playwright");

const wantFocus = process.argv.includes("--focus") || process.argv.length === 2;
const wantResponsive = process.argv.includes("--responsive") || process.argv.length === 2;

const SEED_ACCOUNT = "qa-followup";
const SEED_TOKEN_OBF = "obf:" + Buffer.from(`${SEED_ACCOUNT}:audit0000000000000000000000000000`, "utf8").toString("base64");
const SEED_OWNER = "acct_" + encodeURIComponent(SEED_ACCOUNT);

// Three themes chosen because their --{ns}-focus-ring differ in SHAPE, not
// just hue -- that is the whole point of the token being per-theme:
//   terminal        0 0 6px 1px   phosphor blur
//   paper-ink       0 0 0 1px     flat hairline, no glow at all
//   solarized-light 0 0 0 2px     translucent flat ring
// plus the undecorated default light surface as the control.
const FOCUS_THEMES = ["", "terminal", "paper-ink", "solarized-light"];
const WIDTHS = [800, 1000, 1280, 1680, 2200];

function themeToStorage(theme) {
  if (theme === "") return { themePresetKey: "", optTheme: "light" };
  if (theme === "popup-dark") return { themePresetKey: "", optTheme: "dark" };
  const m = /^(flexoki|solarized|catppuccin)-(light|dark)$/.exec(theme);
  if (m) return { themePresetKey: m[1], optTheme: m[2] };
  const DARK = new Set(["dracula", "gruvbox-dark", "nord-night", "rose-pine", "terminal"]);
  return { themePresetKey: theme, optTheme: DARK.has(theme) ? "dark" : "light" };
}
const setTheme = (sw, themePresetKey, optTheme) =>
  sw.evaluate((v) => chrome.storage.local.set(v), { themePresetKey, optTheme });

async function seed(sw) {
  await sw.evaluate((tok) => chrome.storage.local.set({ pinboardToken: tok }), SEED_TOKEN_OBF);
  await sw.evaluate(async (owner) => {
    for (const [term, gloss] of [
      ["serendipity", "The occurrence of events by chance in a happy or beneficial way — a long enough gloss to exercise the detail pane's measure."],
      ["ephemeral", "Lasting for a very short time."],
      ["quixotic", "Exceedingly idealistic; unrealistic and impractical."],
    ]) {
      const w = await pbpVocabSaveWord(owner, { term, language: "en", gloss });
      if (w && w.id) await pbpVocabBatchAddGroup([w.id], owner, "Follow-up QA");
    }
  }, SEED_OWNER);
  await sw.evaluate(() => chrome.storage.local.set({
    "pbp_hl_followup-fixture": {
      url: "https://example.com/followup-fixture",
      title: "Follow-up Fixture Page With A Fairly Long Title To Exercise Wrapping",
      items: [
        { id: "h1", ts: Date.now(), quote: "This is the highlighted passage used by the follow-up screenshot fixture, long enough to wrap across more than one line in the reading pane.", note: "A fixture note.", color: 1 },
        { id: "h2", ts: Date.now() - 1000, quote: "A second highlight on the same page.", note: "", color: 3 },
      ],
    },
  }));
}

async function shot(page, name) {
  await page.screenshot({ path: join(OUT, `${name}.png`) });
  console.log(`  ${name}.png`);
}

// :focus-visible only matches a <button> when the last input modality was the
// keyboard. A bare .focus() leaves the modality unset, so every button ring
// would be absent from the capture -- which is exactly what these shots exist
// to show. One real key press flips Chromium into keyboard modality first.
async function focusVia(page, selector) {
  await page.keyboard.press("Shift");
  const ok = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    el.focus();
    return document.activeElement === el;
  }, selector);
  if (!ok) { console.log(`  SKIP (not found/focusable): ${selector}`); return false; }
  await page.waitForTimeout(300); // outlast the 150ms focus transition
  return true;
}

async function clipShot(page, selector, name, pad = 24) {
  const box = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  }, selector);
  if (!box) { console.log(`  SKIP clip (not found): ${selector}`); return; }
  const vp = page.viewportSize();
  const clip = {
    x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad),
    width: Math.min(vp.width, box.width + pad * 2), height: Math.min(vp.height, box.height + pad * 2),
  };
  await page.screenshot({ path: join(OUT, `${name}.png`), clip });
  console.log(`  ${name}.png`);
}

// popup + options focus evidence (independent review F2: the first pass shot
// library only, while the trickiest cascade work -- popup's five `bordered`
// sites and their per-theme twins -- had no pictures at all).
async function runFocusPopupOptions(page, sw, extBase) {
  for (const theme of FOCUS_THEMES) {
    const { themePresetKey, optTheme } = themeToStorage(theme);
    await setTheme(sw, themePresetKey, optTheme);
    const label = theme || "default-light";
    await page.setViewportSize({ width: 800, height: 900 });
    await page.goto(`${extBase}popup.html?_fs=${encodeURIComponent(theme)}`, { waitUntil: "load", timeout: TIMEOUT_MS });
    await page.waitForTimeout(600);
    // Same fixture step scripts/ui-render-audit.mjs takes: popup.js only
    // un-hides these once it has resolved the active tab's bookmark state,
    // which a plain fixture page cannot produce.
    await page.evaluate(() => {
      document.getElementById("main-section")?.classList.remove("hidden");
      document.getElementById("md-actions-strip")?.classList.remove("hidden");
    });
    await page.waitForTimeout(200);
    for (const [sel, name] of [["#jina-md-btn", "qbtn"], ["#md-strip-copy", "mdstripbtn"]]) {
      if (await focusVia(page, sel)) await clipShot(page, sel, `focus-popup-${name}-${label}`);
      await page.evaluate(() => document.activeElement?.blur());
      await page.waitForTimeout(300);
    }
    await page.setViewportSize({ width: 1100, height: 900 });
    await page.goto(`${extBase}options.html?_fs=${encodeURIComponent(theme)}`, { waitUntil: "load", timeout: TIMEOUT_MS });
    await page.waitForTimeout(700);
    for (const [sel, name] of [[".tab-btn", "tabbtn"], [".key-toggle", "keytoggle"]]) {
      if (await focusVia(page, sel)) {
        await clipShot(page, name === "keytoggle" ? ".key-wrap" : sel, `focus-options-${name}-${label}`);
      }
      await page.evaluate(() => document.activeElement?.blur());
      await page.waitForTimeout(300);
    }
  }
}

async function runFocus(page, sw, extBase) {
  console.log("== focus states ==");
  for (const theme of FOCUS_THEMES) {
    const { themePresetKey, optTheme } = themeToStorage(theme);
    await setTheme(sw, themePresetKey, optTheme);
    const label = theme || "default-light";
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${extBase}library.html?_fs=${encodeURIComponent(theme)}#vocab`, { waitUntil: "load", timeout: TIMEOUT_MS });
    await page.waitForTimeout(600);
    // Open a row so the detail pane (and its group-unit stepper) exists.
    await page.evaluate(() => document.querySelector("#vocab-list .notes-card-head")?.click());
    await page.waitForTimeout(500);

    for (const [sel, name] of [
      ["#vocab-sort-time", "sortseg-cell"],
      ["#lib-tab-vocab", "libtab"],
      ["#vocab-status-filter", "statusfilter"],
      ["#vocab-list .notes-card-head", "notescard-row"],
      [".vocab-detail-pane .vocab-group-step:nth-of-type(1)", "groupunit-stepper"],
      ['.vocab-detail-pane .vocab-group-unit input[type="text"]', "groupunit-input"],
    ]) {
      if (await focusVia(page, sel)) {
        const clipSel = name === "notescard-row" ? "#vocab-list .notes-card-top"
          : name.startsWith("groupunit") ? ".vocab-detail-pane .vocab-group-unit" : sel;
        await clipShot(page, clipSel, `focus-${name}-${label}`);
      }
      await page.evaluate(() => document.activeElement?.blur());
      await page.waitForTimeout(300);
    }
    // Whole-page reference so the rings can be judged in context too.
    await focusVia(page, "#vocab-sort-time");
    await shot(page, `focus-page-${label}`);
  }
  await runFocusPopupOptions(page, sw, extBase);
}

async function runResponsive(page, sw, extBase) {
  console.log("== responsive matrix ==");
  const { themePresetKey, optTheme } = themeToStorage("");
  await setTheme(sw, themePresetKey, optTheme);
  const report = [];
  for (const width of WIDTHS) {
    for (const view of ["vocab", "notes"]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${extBase}library.html?_rs=${width}-${view}#${view}`, { waitUntil: "load", timeout: TIMEOUT_MS });
      await page.waitForTimeout(600);
      const rowSel = view === "vocab" ? "#vocab-list .notes-card-head" : "#notes-list .notes-hit-btn";
      await page.evaluate((s) => document.querySelector(s)?.click(), rowSel);
      await page.waitForTimeout(500);
      const m = await page.evaluate((v) => {
        const px = (el, p) => el ? parseFloat(getComputedStyle(el)[p]) : null;
        const w = (sel) => { const el = document.querySelector(sel); return el ? +el.getBoundingClientRect().width.toFixed(1) : null; };
        const main = document.querySelector(".lib-main");
        const header = document.querySelector(".lib-header");
        const bench = document.querySelector(v === "vocab" ? ".vocab-workbench" : ".notes-workbench");
        const listSel = v === "vocab" ? ".vocab-list-pane" : ".notes-list-pane";
        const paneSel = v === "vocab" ? ".vocab-detail-pane" : ".notes-detail-pane";
        const pane = document.querySelector(paneSel);
        // Centring is measured on the pane's CONTENT BOX vs a real prose
        // child's box, not on firstElementChild (which can be a zero-width
        // wrapper and silently reports 0 either way -- it did).
        let colW = null, gutterL = null, gutterR = null;
        if (pane) {
          const pr = pane.getBoundingClientRect(), pcs = getComputedStyle(pane);
          const innerL = pr.left + parseFloat(pcs.paddingLeft) + parseFloat(pcs.borderLeftWidth);
          const innerR = pr.right - parseFloat(pcs.paddingRight) - parseFloat(pcs.borderRightWidth);
          // Widest non-absolutely-positioned direct child = the grid column.
          for (const c of pane.children) {
            if (getComputedStyle(c).position === "absolute") continue;
            const cr = c.getBoundingClientRect();
            if (cr.width > (colW || 0)) {
              colW = +cr.width.toFixed(1);
              gutterL = +(cr.left - innerL).toFixed(1);
              gutterR = +(innerR - cr.right).toFixed(1);
            }
          }
        }
        return {
          docScrollW: document.documentElement.scrollWidth,
          clientW: document.documentElement.clientWidth,
          hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
          mainPadInline: main ? [px(main, "paddingLeft"), px(main, "paddingRight")] : null,
          headerPadInline: header ? [px(header, "paddingLeft"), px(header, "paddingRight")] : null,
          benchCols: bench ? getComputedStyle(bench).gridTemplateColumns : null,
          listW: w(listSel),
          paneW: w(paneSel),
          colW, gutterL, gutterR,
          centred: gutterL != null && Math.abs(gutterL - gutterR) <= 1,
          narrow: document.body.className,
        };
      }, view);
      report.push({ width, view, ...m });
      await shot(page, `resp-${width}-${view}`);
    }
  }
  console.log(JSON.stringify(report, null, 1));
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const userDataDir = mkdtempSync(join(tmpdir(), "pbp-followup-"));
  const ctx = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`,
      "--no-first-run", "--no-default-browser-check", "--disable-default-apps"],
  });
  try {
    let sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent("serviceworker", { timeout: TIMEOUT_MS });
    const extBase = `chrome-extension://${new URL(sw.url()).hostname}/`;
    await seed(sw);
    const page = await ctx.newPage();
    if (wantFocus) await runFocus(page, sw, extBase);
    if (wantResponsive) await runResponsive(page, sw, extBase);
  } finally {
    await ctx.close().catch(() => {});
    rmSync(userDataDir, { recursive: true, force: true });
  }
  console.log(`\nwrote to ${OUT}`);
}
main().catch((e) => { console.error(e.stack || e.message); process.exit(1); });
