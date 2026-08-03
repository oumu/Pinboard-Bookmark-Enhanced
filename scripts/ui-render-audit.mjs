#!/usr/bin/env node
// scripts/ui-render-audit.mjs — the design-uplift render oracle. Loads the
// unpacked extension (source tree, not a release ZIP) into a real Chromium,
// seeds a minimal fixture (one Pinboard-shaped token, one vocab word + group,
// one highlight/note), then walks tests/render-audit-checklist.mjs's
// hand-written CHECKS × THEMES matrix against the ACTUAL rendered DOM:
// computed `color`, the real composited ancestor background (walking the
// live cascade, not reading CSS source), and real getBoundingClientRect()
// geometry. This is what makes it a different failure class than the static
// [static] gates (recipe-lint, css-region-audit, etc.): a component can pass
// every static token-wiring check and still render wrong once the browser's
// own cascade and layout are involved -- see COMPONENTS.md §7.1's two-door
// requirement ("两道门必须都在").
//
// USAGE
//   node scripts/ui-render-audit.mjs                      # gate: known-failures WARN, new violations FAIL
//   node scripts/ui-render-audit.mjs --update-known-failures  # (re)write the baseline
//
// PREREQUISITES (same as scripts/zip-install-smoke.mjs)
//   cd .qa-scan && npm install && npx playwright install chromium
//
// EXIT
//   0 → pass (all failures already in known-failures, or --update-known-failures ran)
//   1 → at least one NEW violation not covered by known-failures
//   2 → tooling/env error (no playwright, no display, seed failed, bad JSON, etc.)

import { createRequire } from "node:module";
import { existsSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

import { CHECKS, THEMES } from "../tests/render-audit-checklist.mjs";
// Reused, not re-implemented, so this audit and contrast-audit.mjs's static
// CSS-source audit can never quietly disagree on what a passing ratio is.
import { cr, hexRgb, parseRgba, composite } from "../docs/theme-surface/tools/contrast-audit.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const KNOWN_FAILURES_PATH = resolve(ROOT, "tests", "render-audit-known-failures.json");
const TIMEOUT_MS = 15000;

const UPDATE = process.argv.includes("--update-known-failures");

let chromium;
try {
  const req = createRequire(resolve(ROOT, ".qa-scan", "package.json"));
  ({ chromium } = req("playwright"));
} catch {
  console.error("[render-audit] playwright not found.");
  console.error("  Install:  cd .qa-scan && npm install && npx playwright install chromium");
  process.exit(2);
}

const SURFACE_PAGES = { library: "library.html", options: "options.html", popup: "popup.html" };

// ---- Fixture identity. Any Pinboard-token-shaped string works here -- it
// never leaves this machine and nothing validates it against the real API.
// obfuscateKey()'s algorithm (shared.js), reproduced inline since Node has no
// window.btoa: "obf:" + base64(utf8(raw)). ----
const SEED_TOKEN_ACCOUNT = "qa-render";
const SEED_TOKEN_RAW = `${SEED_TOKEN_ACCOUNT}:audit0000000000000000000000000000`;
const SEED_TOKEN_OBF = "obf:" + Buffer.from(SEED_TOKEN_RAW, "utf8").toString("base64");
const SEED_OWNER = "acct_" + encodeURIComponent(SEED_TOKEN_ACCOUNT);

// ---- Theme storage mapping. Hand-copied from shared.js's ADAPTIVE_THEME_MAP
// (verified at authoring time, not imported: shared.js is a plain script,
// not an ES module, and this keeps the mapping legible next to the THEMES
// list it serves). "popup-dark" and "" are not real storage values -- they
// decode to the (themePresetKey, optTheme) pair that PRODUCES that state. ----
const ADAPTIVE_VARIANTS = {
  flexoki: ["flexoki-light", "flexoki-dark"],
  solarized: ["solarized-light", "solarized-dark"],
  catppuccin: ["catppuccin-latte", "catppuccin-mocha"],
};
function themeToStorage(themeKey) {
  if (themeKey === "") return { themePresetKey: "", optTheme: "light" };
  if (themeKey === "popup-dark") return { themePresetKey: "", optTheme: "dark" };
  for (const [umbrella, [light, dark]] of Object.entries(ADAPTIVE_VARIANTS)) {
    if (themeKey === light) return { themePresetKey: umbrella, optTheme: "light" };
    if (themeKey === dark) return { themePresetKey: umbrella, optTheme: "dark" };
  }
  return { themePresetKey: themeKey, optTheme: "light" }; // fixed preset, mode is a don't-care
}

// ---- Color/geometry math. compositeStack + resolveColor are the render
// oracle's own combinators (a live-DOM ancestor walk has no equivalent in
// contrast-audit.mjs, which reads hex literals out of CSS source) built ONLY
// from the five imported primitives -- no re-implementation of lum/cr. ----
function resolveColor(raw, bg) {
  const s = String(raw || "").trim();
  if (!s) return null;
  if (s.startsWith("#")) return hexRgb(s);
  const parsed = parseRgba(s);
  return parsed ? composite(parsed.slice(0, 3), parsed[3], bg) : null;
}
function compositeStack(rawColors) {
  let base = [255, 255, 255]; // opaque canvas default; every page's <html> paints over this before it matters
  for (let i = rawColors.length - 1; i >= 0; i--) {
    const parsed = parseRgba(rawColors[i]);
    if (!parsed || parsed[3] <= 0) continue;
    base = composite(parsed.slice(0, 3), parsed[3], base);
  }
  return base;
}
function round2(n) { return n == null ? n : Math.round(n * 100) / 100; }
function verdict(check, ok, actual, expected, note) { return { check, status: ok ? "OK" : "FAIL", actual, expected, note: note || null }; }
function skip(check, expected, note) { return { check, status: "SKIP", actual: null, expected, note }; }

// Runs INSIDE the page (Playwright serializes this function's source), so it
// must be self-contained -- no references to anything outside its own body.
function probeSelector(selector) {
  const el = document.querySelector(selector);
  if (!el) return { found: false };
  const cs = getComputedStyle(el);
  const rect = el.getBoundingClientRect();
  const bgStack = [];
  for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
    bgStack.push(getComputedStyle(node).backgroundColor);
  }
  const svgEl = el.querySelector("svg");
  let svg = null;
  if (svgEl) {
    const r = svgEl.getBoundingClientRect();
    svg = { color: getComputedStyle(svgEl).color, rect: { top: r.top, height: r.height } };
  }
  return {
    found: true,
    disabled: !!el.disabled,
    color: cs.color,
    bgStack,
    rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
    svg,
    paddingLeft: parseFloat(cs.paddingLeft) || 0,
    paddingRight: parseFloat(cs.paddingRight) || 0,
    paddingTop: parseFloat(cs.paddingTop) || 0,
    paddingBottom: parseFloat(cs.paddingBottom) || 0,
    borderRadius: parseFloat(cs.borderTopLeftRadius) || 0,
  };
}

// Node-side: turns one probe() result into one-or-more {check, status,
// actual, expected} verdicts, per the `expect` keys the CHECK declared.
function evaluateCheck(check, raw) {
  if (!raw.found) return { setupError: `selector not found in DOM: ${check.selector}` };
  const bg = compositeStack(raw.bgStack);
  const out = [];
  const exp = check.expect;
  const disabledSkip = !!raw.disabled; // WCAG 1.4.3 exempts disabled controls -- contrast checks only

  if ("textContrast" in exp) {
    if (disabledSkip) out.push(skip("textContrast", exp.textContrast, "disabled (WCAG 1.4.3 exempt)"));
    else {
      const fg = resolveColor(raw.color, bg);
      const ratio = fg ? cr(fg, bg) : 0;
      out.push(verdict("textContrast", ratio >= exp.textContrast, round2(ratio), exp.textContrast));
    }
  }
  if ("iconContrast" in exp) {
    if (disabledSkip) out.push(skip("iconContrast", exp.iconContrast, "disabled (WCAG 1.4.3 exempt)"));
    else if (!raw.svg) out.push(verdict("iconContrast", false, null, exp.iconContrast, "no <svg> descendant"));
    else {
      const fg = resolveColor(raw.svg.color, bg);
      const ratio = fg ? cr(fg, bg) : 0;
      out.push(verdict("iconContrast", ratio >= exp.iconContrast, round2(ratio), exp.iconContrast));
    }
  }
  if ("iconVCenter" in exp) {
    if (!raw.svg) out.push(verdict("iconVCenter", false, null, exp.iconVCenter, "no <svg> descendant"));
    else {
      const hostCenter = raw.rect.top + raw.rect.height / 2;
      const svgCenter = raw.svg.rect.top + raw.svg.rect.height / 2;
      out.push(verdict("iconVCenter", Math.abs(hostCenter - svgCenter) <= exp.iconVCenter,
        round2(Math.abs(hostCenter - svgCenter)), exp.iconVCenter));
    }
  }
  if ("padGteRadiusH" in exp) {
    const effRadius = Math.min(raw.borderRadius, raw.rect.height / 2);
    const padH = Math.min(raw.paddingLeft, raw.paddingRight);
    out.push(verdict("padGteRadiusH", padH >= effRadius - 0.5, round2(padH), round2(effRadius)));
  }
  if ("padVMin" in exp) {
    const padV = Math.min(raw.paddingTop, raw.paddingBottom);
    out.push(verdict("padVMin", padV >= exp.padVMin - 0.01, round2(padV), exp.padVMin));
  }
  return { results: out };
}

async function runOneCheck(page, theme, check, results) {
  if (check.state !== "default") {
    throw new Error(`unsupported state "${check.state}" on ${check.selector} -- extend runOneCheck() before adding non-default states to the checklist`);
  }
  const raw = await page.evaluate(probeSelector, check.selector);
  const evald = evaluateCheck(check, raw);
  if (evald.setupError) {
    throw new Error(`SETUP ERROR [${check.surface}|${theme}|${check.selector}|${check.state}]: ${evald.setupError}`);
  }
  for (const r of evald.results) {
    results.push({ surface: check.surface, theme, selector: check.selector, state: check.state, ...r });
  }
}

// ---- library.html has two independent master-detail views behind one tab
// strip; a selector's prefix tells us which view to be on and whether a row
// needs clicking open first (every "*-detail-*" selector lives in a detail
// pane that starts empty). ----
function libraryView(selector) { return selector.startsWith(".notes-") ? "notes" : "vocab"; }
function needsDetailOpen(selector) { return selector.includes("-detail-"); }

async function runLibraryTheme(page, extBase, theme, checks, results) {
  // Explicit #vocab hash (not bare navigation): _pbpLibInitialView() prefers
  // an explicit hash over the localStorage "last view" memory, so this can't
  // be dragged into "notes" by a previous theme iteration's tab click.
  //
  // The `_ra` query param is load-bearing, not decoration: a previous theme
  // iteration's #notes tab click does `history.replaceState(null, "", "#notes")`
  // (library.js's _pbpLibApplyView), which does NOT reload the document. If
  // this goto's URL then differs from the current one ONLY by fragment
  // (#notes -> #vocab, same path+query), Chromium treats it as a
  // same-document navigation and skips the reload entirely -- theme storage
  // written by setTheme() right before this call would silently never be
  // picked up, and every iteration after the first would keep testing
  // whatever theme happened to be active on the very first real load. A
  // per-theme query string forces a real cross-document navigation every
  // time (verified: page.goto to the byte-identical URL DOES force a reload
  // in this Chromium; only the fragment-only case does not).
  await page.goto(`${extBase}library.html?_ra=${encodeURIComponent(theme)}#vocab`, { waitUntil: "load", timeout: TIMEOUT_MS });
  await page.waitForSelector("#vocab-list .vocab-card", { timeout: TIMEOUT_MS }).catch(() => {});
  await page.waitForTimeout(300);

  const vocabChecks = checks.filter((c) => libraryView(c.selector) === "vocab");
  const notesChecks = checks.filter((c) => libraryView(c.selector) === "notes");

  if (vocabChecks.length) {
    if (vocabChecks.some((c) => needsDetailOpen(c.selector))) {
      const head = page.locator("#vocab-list .vocab-card .notes-card-head").first();
      if (await head.count()) { await head.click(); await page.waitForTimeout(250); }
    }
    for (const check of vocabChecks) await runOneCheck(page, theme, check, results);
  }

  if (notesChecks.length) {
    await page.click("#lib-tab-notes");
    await page.waitForSelector("#notes-list .notes-hit", { timeout: TIMEOUT_MS }).catch(() => {});
    await page.waitForTimeout(250);
    if (notesChecks.some((c) => needsDetailOpen(c.selector))) {
      const hit = page.locator("#notes-list .notes-hit-btn").first();
      if (await hit.count()) { await hit.click(); await page.waitForTimeout(250); }
    }
    for (const check of notesChecks) await runOneCheck(page, theme, check, results);
  }
}

async function runSimpleTheme(page, url, theme, checks, results) {
  await page.goto(url, { waitUntil: "load", timeout: TIMEOUT_MS });
  await page.waitForTimeout(500); // settles the theme-early async storage.get correction
  for (const check of checks) await runOneCheck(page, theme, check, results);
}

function setTheme(sw, presetKey, mode) {
  return sw.evaluate(async ({ p, m }) => {
    await chrome.storage.local.set({ themePresetKey: p, optTheme: m });
  }, { p: presetKey, m: mode });
}

function keyOf(r) { return `${r.surface}|${r.theme}|${r.selector}|${r.state}|${r.check}`; }

function report(results) {
  const fails = results.filter((r) => r.status === "FAIL");
  const okCount = results.filter((r) => r.status === "OK").length;
  const skipCount = results.filter((r) => r.status === "SKIP").length;

  if (UPDATE) {
    const knownFailures = {};
    for (const r of fails) {
      knownFailures[keyOf(r)] = {
        surface: r.surface, theme: r.theme, selector: r.selector, state: r.state, check: r.check,
        actual: r.actual, expected: r.expected, note: r.note,
      };
    }
    writeFileSync(KNOWN_FAILURES_PATH, JSON.stringify(knownFailures, null, 2) + "\n");
    console.log(`[render-audit] ${okCount} OK, ${skipCount} SKIP, ${fails.length} FAIL`);
    console.log(`[render-audit] wrote ${fails.length} known-failure(s) to ${KNOWN_FAILURES_PATH}`);
    for (const r of fails) console.log(`  FAIL  ${keyOf(r)}  actual=${r.actual}  expected=${r.expected}${r.note ? "  (" + r.note + ")" : ""}`);
    process.exit(0);
  }

  let known = {};
  if (existsSync(KNOWN_FAILURES_PATH)) {
    try { known = JSON.parse(readFileSync(KNOWN_FAILURES_PATH, "utf8")); } catch (e) {
      console.error(`[render-audit] failed to parse ${KNOWN_FAILURES_PATH}: ${e.message}`);
      process.exit(2);
    }
  }

  const violations = [];
  const warnings = [];
  for (const r of fails) {
    if (Object.prototype.hasOwnProperty.call(known, keyOf(r))) warnings.push(r);
    else violations.push(r);
  }
  const seenKeys = new Set(fails.map(keyOf));
  const stale = Object.keys(known).filter((k) => !seenKeys.has(k));

  console.log(`[render-audit] ${okCount} OK, ${skipCount} SKIP, ${warnings.length} WARN (known), ${violations.length} FAIL (new)`);
  if (warnings.length) {
    console.log(`[render-audit] known failures still outstanding (see ${KNOWN_FAILURES_PATH}):`);
    for (const r of warnings) console.log(`  WARN  ${keyOf(r)}  actual=${r.actual}  expected=${r.expected}`);
  }
  if (stale.length) {
    console.log(`[render-audit] ${stale.length} known-failure key(s) no longer reproduce -- consider deleting from ${KNOWN_FAILURES_PATH}:`);
    for (const k of stale) console.log(`  STALE  ${k}`);
  }
  if (violations.length) {
    console.log(`[render-audit] === FAIL -- ${violations.length} new violation(s) not covered by known-failures ===`);
    for (const r of violations) console.log(`  FAIL  ${keyOf(r)}  actual=${r.actual}  expected=${r.expected}${r.note ? "  (" + r.note + ")" : ""}`);
    process.exit(1);
  }
  console.log("[render-audit] === PASS ===");
  process.exit(0);
}

async function main() {
  const userDataDir = mkdtempSync(join(tmpdir(), "pbp-render-audit-"));
  let ctx;
  try {
    // Unpacked source tree, not a ZIP (this audits the working tree, not a
    // release build) -- same recipe as scripts/zip-install-smoke.mjs:187-195.
    ctx = await chromium.launchPersistentContext(userDataDir, {
      headless: false, // MV3 extensions require headed (or 'new' headless on recent Chrome)
      args: [
        `--disable-extensions-except=${ROOT}`,
        `--load-extension=${ROOT}`,
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-default-apps",
      ],
    });
  } catch (e) {
    console.error(`[render-audit] Chromium launch failed: ${e.message}`);
    console.error("  If running headless on a server, try installing X virtual framebuffer:");
    console.error("    sudo apt install xvfb && xvfb-run -a node scripts/ui-render-audit.mjs");
    rmSync(userDataDir, { recursive: true, force: true });
    process.exit(2);
  }

  let sw = ctx.serviceWorkers()[0];
  if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: TIMEOUT_MS }).catch(() => null);
  if (!sw) {
    console.error("[render-audit] no service worker registered within 15s");
    await ctx.close().catch(() => {});
    rmSync(userDataDir, { recursive: true, force: true });
    process.exit(2);
  }
  const extId = new URL(sw.url()).hostname;
  const extBase = `chrome-extension://${extId}/`;

  // ---- Seed fixture data. All three writes go through the SW, which
  // already importScripts()'s vocab-store.js (background.js) -- same origin,
  // same IndexedDB as any extension page. Calling its own public functions
  // (pbpVocabSaveWord / pbpVocabBatchAddGroup) instead of touching the
  // "words" object store directly keeps the single-writer invariant intact
  // (CLAUDE.md: "vocab-store.js 是 pbp-vocab 的唯一写入口"). ----
  await sw.evaluate((tok) => chrome.storage.local.set({ pinboardToken: tok }), SEED_TOKEN_OBF);

  const seeded = await sw.evaluate(async (owner) => {
    const w = await pbpVocabSaveWord(owner, {
      term: "renderAuditFixture",
      language: "en",
      gloss: "Fixture word seeded by scripts/ui-render-audit.mjs so the vocabulary detail pane has something to render.",
    });
    if (!w || !w.id) return false;
    await pbpVocabBatchAddGroup([w.id], owner, "Render QA");
    return true;
  }, SEED_OWNER);
  if (!seeded) {
    console.error("[render-audit] vocab seed failed (pbpVocabSaveWord returned no id)");
    await ctx.close().catch(() => {});
    rmSync(userDataDir, { recursive: true, force: true });
    process.exit(2);
  }

  await sw.evaluate(() => chrome.storage.local.set({
    "pbp_hl_render-audit-fixture": {
      url: "https://example.com/render-audit-fixture",
      title: "Render Audit Fixture Page",
      items: [{
        id: "h1",
        ts: Date.now(),
        quote: "This is the highlighted passage used by the render audit fixture.",
        note: "A short fixture note for the render audit.",
        color: 1,
      }],
    },
  }));

  const page = await ctx.newPage();
  const results = [];
  try {
    for (const surface of Object.keys(SURFACE_PAGES)) {
      const checks = CHECKS.filter((c) => c.surface === surface);
      if (!checks.length) continue;
      for (const theme of THEMES) {
        // popup-dark decodes to (themePresetKey:"", optTheme:"dark"), which
        // for options/library resolves to data-theme="flexoki-dark" via
        // PBP_OPTIONS_ADAPTIVE_MAP's fallback -- already covered by the
        // "flexoki-dark" THEMES entry, so re-running it under this surface
        // would just duplicate that run under a different label.
        if (theme === "popup-dark" && surface !== "popup") continue;
        const { themePresetKey, optTheme } = themeToStorage(theme);
        await setTheme(sw, themePresetKey, optTheme);
        if (surface === "library") await runLibraryTheme(page, extBase, theme, checks, results);
        else await runSimpleTheme(page, `${extBase}${SURFACE_PAGES[surface]}`, theme, checks, results);
      }
    }
  } finally {
    await page.close().catch(() => {});
    await ctx.close().catch(() => {});
    rmSync(userDataDir, { recursive: true, force: true });
  }

  report(results);
}

main().catch((e) => {
  console.error(`[render-audit] fatal: ${e.stack || e.message}`);
  process.exit(2);
});
