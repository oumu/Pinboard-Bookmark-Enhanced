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
//   node scripts/followup2-screens.mjs --variantc  # variant C, 1100/1680 x 2 themes
//   node scripts/followup2-screens.mjs --resp      # responsive matrix + measurements
//   node scripts/followup2-screens.mjs --save      # save button rest/dirty/focus
//   node scripts/followup2-screens.mjs --header    # batch 3: list header, 3 widths x 2 themes
//   node scripts/followup2-screens.mjs --l1        # batch 3: lookup row in the panel
//   node scripts/followup2-screens.mjs --narrow    # batch 3: narrow lookup door flow
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
// The third batch (header + lookup migration) files its evidence under its own
// directory; `shot`/`clipShot` write wherever OUTDIR currently points.
const OUT3 = resolve(ROOT, "docs/superpowers/design-uplift-2026-08/screens/followup3");
let OUTDIR = OUT;
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
  await page.screenshot({ path: join(OUTDIR, `${name}.png`) });
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
    path: join(OUTDIR, `${name}.png`),
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


// ---- Variant C: the pane hugs its content, surplus width becomes margin ----
async function runVariantC(page, sw, extBase) {
  console.log("== variant C two-pane ==");
  for (const theme of THEMES) {
    const { themePresetKey, optTheme } = themeToStorage(theme);
    await setTheme(sw, themePresetKey, optTheme);
    const label = theme || "default-light";
    for (const width of [1100, 1680]) {
      for (const view of ["vocab", "notes"]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.goto(`${extBase}library.html?_vc=${width}-${view}-${encodeURIComponent(theme)}#${view}`, { waitUntil: "load", timeout: TIMEOUT_MS });
        const rowSel = view === "vocab" ? "#vocab-list .vocab-card .notes-card-head" : "#notes-list .notes-hit-btn";
        await page.waitForSelector(rowSel, { timeout: TIMEOUT_MS }).catch(() => {});
        await page.locator(rowSel).first().click().catch(() => {});
        await page.waitForTimeout(400);
        await shot(page, `variantc-${view}-${width}-${label}`);
      }
    }
  }
}

// ---- Responsive matrix, with the numbers the layout contract is about ----
async function runResponsive(page, sw, extBase) {
  console.log("== responsive matrix ==");
  const { themePresetKey, optTheme } = themeToStorage("");
  await setTheme(sw, themePresetKey, optTheme);
  const report = [];
  for (const width of [800, 1000, 1280, 1680, 2200]) {
    for (const view of ["vocab", "notes"]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(`${extBase}library.html?_rs=${width}-${view}#${view}`, { waitUntil: "load", timeout: TIMEOUT_MS });
      const rowSel = view === "vocab" ? "#vocab-list .vocab-card .notes-card-head" : "#notes-list .notes-hit-btn";
      await page.waitForSelector(rowSel, { timeout: TIMEOUT_MS }).catch(() => {});
      await page.locator(rowSel).first().click().catch(() => {});
      await page.waitForTimeout(400);
      report.push({ width, view, ...await page.evaluate((v) => {
        const q = (s) => document.querySelector(s);
        const w = (el) => el ? +el.getBoundingClientRect().width.toFixed(1) : null;
        const main = q(".lib-main"), header = q(".lib-header");
        const bench = q(v === "vocab" ? ".vocab-workbench" : ".notes-workbench");
        const px = (el, p) => el ? parseFloat(getComputedStyle(el)[p]) : null;
        const mr = main && main.getBoundingClientRect(), br = bench && bench.getBoundingClientRect();
        return {
          hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
          mainPad: [px(main, "paddingLeft"), px(main, "paddingRight")],
          headerPad: [px(header, "paddingLeft"), px(header, "paddingRight")],
          cols: bench ? getComputedStyle(bench).gridTemplateColumns : null,
          list: w(q(v === "vocab" ? ".vocab-list-pane" : ".notes-list-pane")),
          pane: w(q(v === "vocab" ? ".vocab-detail-pane" : ".notes-detail-pane")),
          benchGutter: mr && br ? [+(br.x - mr.x).toFixed(1), +(mr.right - br.right).toFixed(1)] : null,
          body: document.body.className || "(none)",
        };
      }, view) });
      await shot(page, `variantc-resp-${width}-${view}`);
    }
  }
  console.log(JSON.stringify(report, null, 1));
}

// ---- Save button v2b: rest / dirty / focus, per theme ----
async function runSave(page, sw, extBase) {
  console.log("== save button v2b ==");
  for (const theme of THEMES) {
    const { themePresetKey, optTheme } = themeToStorage(theme);
    await setTheme(sw, themePresetKey, optTheme);
    const label = theme || "default-light";
    await page.setViewportSize({ width: 1400, height: 1000 });
    await page.goto(`${extBase}library.html?_sv=${encodeURIComponent(theme)}#vocab`, { waitUntil: "load", timeout: TIMEOUT_MS });
    await page.waitForSelector("#vocab-list .vocab-card .notes-card-head", { timeout: TIMEOUT_MS });
    await page.locator("#vocab-list .vocab-card .notes-card-head").first().click();
    await page.waitForTimeout(450);
    const measure = () => page.evaluate(() => {
      const f = document.querySelector(".vocab-detail-footer");
      const r = (s) => { const el = f && f.querySelector(s); return el ? +el.getBoundingClientRect().x.toFixed(2) : null; };
      const save = f && f.querySelector(".vocab-note-save");
      const seam = save && getComputedStyle(save, "::before");
      return { relookupX: r(".vocab-detail-relookup"), deleteX: r(".vocab-detail-delete"), saveX: r(".vocab-note-save"),
        footerW: f ? +f.getBoundingClientRect().width.toFixed(2) : null,
        saveVisibility: save ? getComputedStyle(save).visibility : null,
        seam: seam ? { w: seam.width, h: seam.height, bg: seam.backgroundColor, left: seam.left } : null };
    });
    const rest = await measure();
    await clipShot(page, ".vocab-detail-footer", `save-v2b-rest-${label}`, 18);
    await page.locator(".vocab-note-input").fill("A note typed to make the editor dirty.");
    await page.waitForTimeout(450);
    const dirty = await measure();
    await clipShot(page, ".vocab-detail-footer", `save-v2b-dirty-${label}`, 18);
    await keyboardFocus(page, ".vocab-note-save");
    await clipShot(page, ".vocab-detail-footer", `save-v2b-focus-${label}`, 18);
    const shift = ["relookupX", "deleteX"].map((k) => +(dirty[k] - rest[k]).toFixed(2));
    console.log(`  [${label}] rest->dirty shift relookup/delete = ${shift.join("/")}px, seam ${JSON.stringify(dirty.seam)}, saveVisibility ${rest.saveVisibility}->${dirty.saveVisibility}`);
  }
}


// ---- batch 3: the rebuilt list header ----
async function runHeader(page, sw, extBase) {
  console.log("== list header (batch 3) ==");
  OUTDIR = OUT3;
  const report = [];
  for (const theme of THEMES) {
    const { themePresetKey, optTheme } = themeToStorage(theme);
    await setTheme(sw, themePresetKey, optTheme);
    const label = theme || "default-light";
    for (const width of [1680, 1100, 800]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${extBase}library.html?_h3=${width}-${encodeURIComponent(theme)}#vocab`, { waitUntil: "load", timeout: TIMEOUT_MS });
      await page.waitForSelector("#vocab-list .vocab-card", { timeout: TIMEOUT_MS }).catch(() => {});
      await page.waitForTimeout(400);
      report.push({ theme: label, width, ...await page.evaluate(() => {
        const pane = document.querySelector(".vocab-list-pane");
        const rows = [".vocab-filter-toolbar", ".vocab-filter-row", "#vocab-stats", ".vocab-context-bar"];
        const measured = rows.map((sel) => {
          const el = document.querySelector(sel);
          if (!el || getComputedStyle(el).display === "none") return null;
          const r = el.getBoundingClientRect();
          const kids = [...el.children].filter((k) => getComputedStyle(k).display !== "none");
          const right = kids.length ? Math.max(...kids.map((k) => k.getBoundingClientRect().right)) : r.right;
          return { sel, w: +r.width.toFixed(1), h: +r.height.toFixed(1), edgeGap: +(r.right - right).toFixed(1) };
        }).filter(Boolean);
        return { paneW: +pane.getBoundingClientRect().width.toFixed(1), rows: measured,
          hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 };
      }) });
      await clipShot(page, ".vocab-list-pane", `header-${width}-${label}`, 8);
    }
    // Chip pressed state, 3x-style closeup.
    await page.setViewportSize({ width: 1680, height: 900 });
    await page.goto(`${extBase}library.html?_h3c=${encodeURIComponent(theme)}#vocab`, { waitUntil: "load", timeout: TIMEOUT_MS });
    await page.waitForSelector("#vocab-stat-learning", { timeout: TIMEOUT_MS }).catch(() => {});
    await page.waitForTimeout(400);
    await page.locator("#vocab-stat-learning").click().catch(() => {});
    await page.mouse.move(0, 0);
    await page.waitForTimeout(350);
    await clipShot(page, ".vocab-filter-row", `header-chip-pressed-${label}`, 10);
  }
  console.log(JSON.stringify(report, null, 1));
  OUTDIR = OUT;
}

// ---- batch 3: the lookup row at the top of the detail panel ----
async function runL1(page, sw, extBase) {
  console.log("== L1 lookup row (batch 3) ==");
  OUTDIR = OUT3;
  for (const theme of THEMES) {
    const { themePresetKey, optTheme } = themeToStorage(theme);
    await setTheme(sw, themePresetKey, optTheme);
    const label = theme || "default-light";
    await page.setViewportSize({ width: 1400, height: 950 });
    await page.goto(`${extBase}library.html?_l1=${encodeURIComponent(theme)}#vocab`, { waitUntil: "load", timeout: TIMEOUT_MS });
    await page.waitForSelector("#vocab-list .vocab-card", { timeout: TIMEOUT_MS });
    await page.waitForTimeout(400);
    await shot(page, `l1-empty-${label}`);
    const m = await page.evaluate(() => {
      const pane = document.querySelector(".vocab-detail-pane");
      const bar = document.getElementById("vocab-lookup-bar");
      const cs = bar && getComputedStyle(bar);
      const kids = bar ? [...bar.children].filter((k) => getComputedStyle(k).display !== "none") : [];
      return { paneW: +pane.getBoundingClientRect().width.toFixed(1),
        barW: bar ? +bar.getBoundingClientRect().width.toFixed(1) : null,
        barInPane: !!(bar && pane.contains(bar)),
        kidHeights: kids.map((k) => +k.getBoundingClientRect().height.toFixed(1)).join("/"),
        // FULL box, all four edges. Reading only the TOP edge (what this
        // probe did until 2026-08-07) reports a flat "border: 0px, padding:
        // 0px" and hides the one edge that is intentionally non-zero -- the
        // bottom seam -- which then went into the batch report as if the row
        // had no padding or border at all.
        island: cs ? { bg: cs.backgroundColor,
          border: `${cs.borderTopWidth} ${cs.borderRightWidth} ${cs.borderBottomWidth} ${cs.borderLeftWidth}`,
          radius: cs.borderTopLeftRadius,
          pad: `${cs.paddingTop} ${cs.paddingRight} ${cs.paddingBottom} ${cs.paddingLeft}` } : null,
        // The FIELD's own materials, not just the bar's. Added 2026-08-07:
        // this probe reported "no island, three equal heights" while the input
        // inside was rendering as a UA-native search box, because equal
        // heights survive a broken field (the row stretches, so its healthy
        // siblings were pulled DOWN to match it) and the island check only
        // ever looked at the wrapper.
        field: (() => {
          const i = document.getElementById("vocab-lookup-input");
          if (!i) return null;
          const f = getComputedStyle(i);
          return { border: `${f.borderTopWidth} ${f.borderTopStyle} ${f.borderTopColor}`, bg: f.backgroundColor,
            radius: f.borderTopLeftRadius, pad: `${f.paddingTop} ${f.paddingRight}`, appearance: f.appearance };
        })(),
        backVisible: getComputedStyle(document.querySelector(".vocab-detail-back")).display };
    });
    console.log(`  [${label}] ${JSON.stringify(m)}`);
    await page.locator("#vocab-list .vocab-card .notes-card-head").first().click();
    await page.waitForTimeout(400);
    await shot(page, `l1-withword-${label}`);
  }
  OUTDIR = OUT;
}

// ---- batch 3: the narrow-screen door ----
async function runNarrow(page, sw, extBase) {
  console.log("== narrow lookup door (batch 3) ==");
  OUTDIR = OUT3;
  const { themePresetKey, optTheme } = themeToStorage("");
  await setTheme(sw, themePresetKey, optTheme);
  await page.setViewportSize({ width: 800, height: 900 });
  await page.goto(`${extBase}library.html?_nd=1#vocab`, { waitUntil: "load", timeout: TIMEOUT_MS });
  await page.waitForSelector("#vocab-list .vocab-card", { timeout: TIMEOUT_MS });
  await page.waitForTimeout(400);
  await shot(page, "narrow-list");
  await clipShot(page, ".vocab-filter-row", "narrow-door-closeup", 10);
  await page.locator("#vocab-lookup-narrow").click();
  await page.waitForTimeout(450);
  const after = await page.evaluate(() => ({
    narrowClass: document.body.classList.contains("lib-narrow-detail"),
    focused: document.activeElement && document.activeElement.id,
    listHidden: getComputedStyle(document.querySelector(".vocab-list-pane")).display === "none",
    backVisible: getComputedStyle(document.querySelector(".vocab-detail-back")).display !== "none",
  }));
  console.log(`  after door click: ${JSON.stringify(after)}`);
  await shot(page, "narrow-lookup-open");
  await page.locator(".vocab-detail-back").click();
  await page.waitForTimeout(400);
  const back = await page.evaluate(() => ({ narrowClass: document.body.classList.contains("lib-narrow-detail"),
    listVisible: getComputedStyle(document.querySelector(".vocab-list-pane")).display !== "none" }));
  console.log(`  after back click: ${JSON.stringify(back)}`);
  await shot(page, "narrow-back-to-list");
  OUTDIR = OUT;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  mkdirSync(OUT3, { recursive: true });
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
    if (want("--variantc")) await runVariantC(page, sw, extBase);
    if (want("--resp")) await runResponsive(page, sw, extBase);
    if (want("--save")) await runSave(page, sw, extBase);
    if (want("--header")) await runHeader(page, sw, extBase);
    if (want("--l1")) await runL1(page, sw, extBase);
    if (want("--narrow")) await runNarrow(page, sw, extBase);
  } finally {
    await ctx.close().catch(() => {});
    rmSync(userDataDir, { recursive: true, force: true });
  }
  console.log(`\nwrote to ${OUT}`);
}
main().catch((e) => { console.error(e.stack || e.message); process.exit(1); });
