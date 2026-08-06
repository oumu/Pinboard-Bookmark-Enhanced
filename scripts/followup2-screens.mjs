#!/usr/bin/env node
// scripts/followup2-screens.mjs — evidence capture + narrow-width overflow
// sweep for the 2026-08-06 follow-up SECOND batch (S1 row-selection rebuild,
// S2 notes batch bar, S3 pane overflow). NOT a gate: --rows/--notes take
// pictures and assert nothing; --sweep prints a findings table that a human
// (and then tests/render-audit-checklist.mjs's paneFit entries) acts on.
//
//   node scripts/followup2-screens.mjs --rows    # vocab row states x 2 themes
//   node scripts/followup2-screens.mjs --notes   # notes selection + batch bar
//   node scripts/followup2-screens.mjs --sweep   # narrow-width overflow scan
//
// Needs a display: xvfb-run -a node scripts/followup2-screens.mjs --sweep
import { createRequire } from "node:module";
import { mkdirSync, rmSync, mkdtempSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const OUT = resolve(ROOT, "docs/superpowers/design-uplift-2026-08/screens/followup2");
const TIMEOUT_MS = 15000;
const req = createRequire(resolve(ROOT, ".qa-scan", "package.json"));
const { chromium } = req("playwright");

const argv = process.argv.slice(2);
const all = argv.length === 0;
const want = (f) => all || argv.includes(f);
const TAG = (argv.find((a) => a.startsWith("--tag=")) || "--tag=").slice(6);

const SEED_ACCOUNT = "qa-followup2";
const SEED_TOKEN_OBF = "obf:" + Buffer.from(`${SEED_ACCOUNT}:audit0000000000000000000000000000`, "utf8").toString("base64");
const SEED_OWNER = "acct_" + encodeURIComponent(SEED_ACCOUNT);
// Light + dark control pair. Both are undecorated default surfaces plus one
// real preset each, so the row bands are read through two different
// --lib-row-selected-bg / --lib-accent pairs rather than one.
const THEMES = ["", "dracula"];
const SWEEP_WIDTHS = [900, 960, 1024, 1100, 1200];

function themeToStorage(theme) {
  if (theme === "") return { themePresetKey: "", optTheme: "light" };
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
    const rows = [
      ["serendipity", "The occurrence of events by chance in a happy or beneficial way — a long enough gloss to exercise the row's one-line clamp."],
      ["ephemeral", "Lasting for a very short time."],
      ["quixotic", "Exceedingly idealistic; unrealistic and impractical."],
      ["Wortzusammensetzung", "Ein außergewöhnlich langes deutsches Kompositum, das die Ellipse der Zeile prüfen soll."],
      ["perspicacious", "Having a ready insight into and understanding of things."],
    ];
    for (const [term, gloss] of rows) {
      // `context` (singular) -- pbpVocabSaveWord merges ONE context per call
      // through pbpDictMergeContext; a `contexts` array is silently ignored,
      // and the first version of this seed lost the source link entirely
      // because of it (which is exactly the element the overflow sweep is
      // pointed at).
      const w = await pbpVocabSaveWord(owner, {
        term, language: "en", gloss,
        context: {
          quote: "A context sentence long enough to wrap inside the reading column and still leave the source link on a line of its own.",
          articleTitle: "An Extremely Long Source Article Title That Has No Business Fitting Inside A Narrow Detail Pane At All",
          articleUrl: "https://example.com/an/extremely/long/path/segment/that/does/not/break/anywhere",
        },
      });
      if (w && w.id) await pbpVocabBatchAddGroup([w.id], owner, "Follow-up QA");
    }
  }, SEED_OWNER);
  await sw.evaluate(() => chrome.storage.local.set({
    "pbp_hl_followup2-a": {
      url: "https://example.com/followup2-a",
      title: "Follow-up Fixture Page With A Fairly Long Title To Exercise Wrapping",
      items: [
        { id: "h1", ts: Date.now(), quote: "This is the highlighted passage used by the follow-up screenshot fixture, long enough to wrap across more than one line in the reading pane.", note: "A fixture note.", color: 1 },
        { id: "h2", ts: Date.now() - 1000, quote: "A second highlight on the same page.", note: "", color: 3 },
        { id: "h3", ts: Date.now() - 2000, quote: "A third highlight, which exists so a Shift range has something to span.", note: "", color: 4 },
      ],
    },
    "pbp_hl_followup2-b": {
      url: "https://example.com/an/extremely/long/path/segment/that/does/not/break/anywhere/at/all",
      title: "AnotherFixturePageWhoseTitleIsOneUnbreakableTokenOfConsiderableLength",
      items: [
        { id: "h4", ts: Date.now() - 3000, quote: "A highlight on a second page.", note: "Note with an unbreakable https://example.com/very/long/url/that/cannot/wrap inside it.", color: 5 },
      ],
    },
  }));
}

const shot = async (page, name) => {
  await page.screenshot({ path: join(OUT, `${name}.png`) });
  console.log(`  ${name}.png`);
};

async function clipShot(page, selector, name, pad = 14) {
  const box = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  }, selector);
  if (!box) { console.log(`  SKIP clip (not found): ${selector}`); return; }
  const vp = page.viewportSize();
  await page.screenshot({
    path: join(OUT, `${name}.png`),
    clip: {
      x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad),
      width: Math.min(vp.width - Math.max(0, box.x - pad), box.width + pad * 2),
      height: Math.min(vp.height - Math.max(0, box.y - pad), box.height + pad * 2),
    },
  });
  console.log(`  ${name}.png`);
}

// :focus-visible only matches after a real key press puts Chromium in
// keyboard modality -- a bare .focus() would capture rows with no ring.
async function keyboardFocus(page, selector) {
  await page.keyboard.press("Shift");
  const ok = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    el.focus();
    return document.activeElement === el;
  }, selector);
  await page.waitForTimeout(300);
  return ok;
}

// ---- S1: the five row states, on one screen, per theme ----
async function runRows(page, sw, extBase) {
  console.log("== vocab row states ==");
  for (const theme of THEMES) {
    const { themePresetKey, optTheme } = themeToStorage(theme);
    await setTheme(sw, themePresetKey, optTheme);
    const label = theme || "default-light";
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${extBase}library.html?_f2=${encodeURIComponent(theme)}#vocab`, { waitUntil: "load", timeout: TIMEOUT_MS });
    await page.waitForSelector("#vocab-list .vocab-card", { timeout: TIMEOUT_MS });
    await page.waitForTimeout(400);
    const heads = page.locator("#vocab-list .vocab-card .notes-card-head");
    // row0 = current (plain click), row1 = selected (Ctrl), row2 = selected +
    // current, row3 = rest, row4 = hover.
    await heads.nth(1).click({ modifiers: ["Control"] });
    await heads.nth(2).click({ modifiers: ["Control"] });
    await heads.nth(2).click();
    await heads.nth(0).click();
    await heads.nth(2).click({ modifiers: ["Control"] });
    await heads.nth(2).click({ modifiers: ["Control"] });
    await page.waitForTimeout(300);
    await clipShot(page, "#vocab-list", `rowstates-${label}`);
    await heads.nth(4).hover();
    await page.waitForTimeout(250);
    await clipShot(page, "#vocab-list", `rowstates-hover-${label}`);
    await page.mouse.move(0, 0);
    await page.waitForTimeout(250);
    if (await keyboardFocus(page, "#vocab-list .vocab-card:nth-child(4) .notes-card-head")) {
      await clipShot(page, "#vocab-list", `rowstates-focus-${label}`);
    }
    await page.evaluate(() => document.activeElement?.blur());
    await page.waitForTimeout(200);
    // Text-selection artefact check: Shift-clicking a row must not leave a
    // browser text selection smeared across the list.
    const stray = await page.evaluate(() => String(window.getSelection()));
    console.log(`  [${label}] stray text selection after shift-click: ${JSON.stringify(stray.slice(0, 60))}`);
    await shot(page, `rowstates-page-${label}`);
  }
}

// ---- S2: the notes list's selection + batch bar ----
async function runNotes(page, sw, extBase) {
  console.log("== notes selection + batch bar ==");
  for (const theme of THEMES) {
    const { themePresetKey, optTheme } = themeToStorage(theme);
    await setTheme(sw, themePresetKey, optTheme);
    const label = theme || "default-light";
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${extBase}library.html?_f2n=${encodeURIComponent(theme)}#notes`, { waitUntil: "load", timeout: TIMEOUT_MS });
    await page.waitForSelector("#notes-list .notes-hit", { timeout: TIMEOUT_MS });
    await page.waitForTimeout(400);
    const rows = page.locator("#notes-list .notes-hit-btn");
    await rows.nth(0).click();
    await rows.nth(1).click({ modifiers: ["Control"] });
    await rows.nth(3).click({ modifiers: ["Shift"] });
    await page.waitForTimeout(400);
    await shot(page, `notes-batchbar-${label}`);
    await clipShot(page, ".notes-batch-bar", `notes-batchbar-clip-${label}`, 20);
    await clipShot(page, "#notes-list", `notes-rowstates-${label}`);
  }
}

// ---- S3: narrow-width overflow sweep over BOTH panes of BOTH views ----
const sweepInPage = ({ panes, tolerance }) => {
  const hits = [];
  const nameOf = (el) => {
    const cls = (el.className && typeof el.className === "string") ? "." + el.className.trim().split(/\s+/).join(".") : "";
    return el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + cls;
  };
  for (const paneSel of panes) {
    const pane = document.querySelector(paneSel);
    if (!pane) continue;
    const pr = pane.getBoundingClientRect();
    const pcs = getComputedStyle(pane);
    const padR = parseFloat(pcs.paddingRight) || 0, bR = parseFloat(pcs.borderRightWidth) || 0;
    const padL = parseFloat(pcs.paddingLeft) || 0, bL = parseFloat(pcs.borderLeftWidth) || 0;
    const contentRight = pr.right - padR - bR, contentLeft = pr.left + padL + bL;
    // A pane that scrolls horizontally is itself a finding.
    if (pane.scrollWidth > pane.clientWidth + tolerance) {
      hits.push({ pane: paneSel, el: paneSel, kind: "paneScroll", over: +(pane.scrollWidth - pane.clientWidth).toFixed(2) });
    }
    for (const el of pane.querySelectorAll("*")) {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden" || el.closest("[hidden]")) continue;
      if (cs.position === "fixed") continue;
      // Screen-reader-only labels are parked off-canvas on purpose.
      if (el.classList.contains("sr-only") || el.closest(".sr-only")) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (r.right > contentRight + tolerance) {
        hits.push({ pane: paneSel, el: nameOf(el), kind: "pastRightEdge", over: +(r.right - contentRight).toFixed(2) });
      } else if (r.left < contentLeft - tolerance) {
        hits.push({ pane: paneSel, el: nameOf(el), kind: "pastLeftEdge", over: +(contentLeft - r.left).toFixed(2) });
      }
      // NOT scrollWidth > clientWidth: that is the NORMAL state of every
      // correctly-ellipsised single-line element (the whole mechanism is "the
      // content is wider than the box, so paint an ellipsis"). Reporting it
      // buried the one real finding under five false positives on the first
      // run. What actually matters is whether anything escapes the PANE, and
      // the two edge tests above are that.
    }
  }
  return hits;
};

async function runSweep(page, sw, extBase) {
  console.log("== narrow-width overflow sweep ==");
  const { themePresetKey, optTheme } = themeToStorage("");
  await setTheme(sw, themePresetKey, optTheme);
  const findings = [];
  for (const width of SWEEP_WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    for (const view of ["vocab", "notes"]) {
      await page.goto(`${extBase}library.html?_f2s=${width}-${view}#${view}`, { waitUntil: "load", timeout: TIMEOUT_MS });
      const rowSel = view === "vocab" ? "#vocab-list .vocab-card .notes-card-head" : "#notes-list .notes-hit-btn";
      await page.waitForSelector(rowSel, { timeout: TIMEOUT_MS }).catch(() => {});
      await page.waitForTimeout(350);
      await page.locator(rowSel).first().click().catch(() => {});
      if (view === "vocab") await page.locator(rowSel).nth(1).click({ modifiers: ["Control"] }).catch(() => {});
      else await page.locator(rowSel).nth(1).click({ modifiers: ["Control"] }).catch(() => {});
      await page.waitForTimeout(400);
      const panes = view === "vocab"
        ? [".vocab-list-pane", "#vocab-detail-pane"]
        : [".notes-list-pane", "#notes-detail-pane"];
      const hits = await page.evaluate(sweepInPage, { panes, tolerance: 0.75 });
      for (const h of hits) findings.push({ width, view, ...h });
      if (TAG) await shot(page, `overflow-${TAG}-${width}-${view}`);
    }
  }
  const seen = new Map();
  for (const f of findings) {
    const key = `${f.view}|${f.pane}|${f.el}|${f.kind}`;
    const prev = seen.get(key);
    if (!prev || f.over > prev.over) seen.set(key, f);
  }
  const rows = [...seen.values()].sort((a, b) => b.over - a.over);
  console.log(`\n${rows.length} distinct overflow finding(s) across widths ${SWEEP_WIDTHS.join("/")}:`);
  for (const r of rows) console.log(`  [${r.view}] ${r.kind} +${r.over}px  ${r.el}  (pane ${r.pane}, worst at ${r.width}px)`);
  if (!rows.length) console.log("  none");
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const userDataDir = mkdtempSync(join(tmpdir(), "pbp-followup2-"));
  const ctx = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`,
      "--no-first-run", "--no-default-browser-check", "--disable-default-apps"],
  });
  try {
    const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent("serviceworker", { timeout: TIMEOUT_MS });
    const extBase = `chrome-extension://${new URL(sw.url()).hostname}/`;
    await seed(sw);
    const page = await ctx.newPage();
    if (want("--rows")) await runRows(page, sw, extBase);
    if (want("--notes")) await runNotes(page, sw, extBase);
    if (want("--sweep")) await runSweep(page, sw, extBase);
  } finally {
    await ctx.close().catch(() => {});
    rmSync(userDataDir, { recursive: true, force: true });
  }
  console.log(`\nwrote to ${OUT}`);
}
main().catch((e) => { console.error(e.stack || e.message); process.exit(1); });
