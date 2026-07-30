#!/usr/bin/env node
// ECDICT import acceptance harness. Runs the six gates from
// docs/superpowers/specs/2026-07-30-ecdict-en-zh-pack-design-rev7.md §10.3
// (as amended by rev8 A2/A3/A4) against the real extension in a real Chromium.
//
// NOT part of pre-commit or verify.sh: a single run can legitimately take
// minutes, while the HTML suite runner caps at 30s.
//
//   node scripts/ecdict-import-perf.mjs [--fixture entry|bytes|real|quota|all]
//                                       [--csv <path to ecdict.csv[.gz]>]
//                                       [--runs 3]
//
// The `real` fixture needs the user-supplied ecdict.csv; `entry` and `bytes`
// are synthesized, so the harness runs without it.
//
// Which fixture proves which gate:
//   gap / wall clock / heap   -> F-entry and F-bytes (the two resource ceilings)
//   idb quota accounting      -> F-real ONLY. The synthesized fixtures repeat the
//                                same characters, and IndexedDB's LevelDB backend
//                                compresses that away: F-bytes reports a ratio of
//                                0.06, which says nothing about real entropy.
//   entry / payload counts    -> all three
//
// Launch flags follow scripts/perf-cold-sample.mjs rather than the smoke test:
// the smoke flags leave background networking and component updates running,
// which shows up as noise in wall-clock and heap.

import { createRequire } from "node:module";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import zlib from "node:zlib";

// Same resolution base as scripts/zip-install-smoke.mjs: playwright lives in
// .qa-scan/node_modules, not anywhere above this file.
const EXT = process.cwd();
let chromium;
try {
  const req = createRequire(path.resolve(EXT, ".qa-scan", "package.json"));
  ({ chromium } = req("playwright"));
} catch {
  console.error("[perf] playwright missing. Install: cd .qa-scan && npm install && npx playwright install chromium");
  process.exit(2);
}

const argv = process.argv.slice(2);
const arg = (name, dflt) => { const i = argv.indexOf(name); return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt; };
const WHICH = arg("--fixture", "all");
const CSV = arg("--csv", "");
const RUNS = Number(arg("--runs", "3"));

// ---- Gates (pre-registered; see spec §10.3) -------------------------------
const GATES = {
  gapMs: 50,
  wallMs: 90_000,
  heapBytes: 150 * 1024 * 1024,
  idbRatio: 10,
};

// ---- Fixtures -------------------------------------------------------------
// F-entry maxes the ENTRY ceiling with a deliberately small payload. rev7 put
// it at ~152 B/record, which lands 0.5 B/record under the 32 MiB payload cap and
// would trip that gate before the entry gate; 100 B leaves real headroom.
const MAX_ENTRIES = 220_000;
const MAX_WORD = 256, MAX_TRANS = 4096;
const HDR = "word,phonetic,definition,translation,pos,collins,oxford,tag,bnc,frq,exchange,detail,audio";

function fEntry() {
  // 220,000 rows, every one admitted by R1 via the frequency window.
  // payload per record = utf8(key) + utf8(word) + utf8(translation).
  const out = [HDR];
  for (let i = 0; i < MAX_ENTRIES; i++) {
    const w = "w" + String(i).padStart(7, "0");        // 8 B word, 8 B key
    const tr = "n. " + "甲".repeat(28);                 // 3 + 84 = 87 B
    out.push(`${w},,,${tr},,,,,0,1,,,`);               // ~103 B payload/record
  }
  return { name: "F-entry", csv: out.join("\n"), expectEntries: MAX_ENTRIES };
}

// Must track PBP_ECDICT_MAX_PAYLOAD_BYTES in dict-pack.js. A hardcoded record
// count silently stops testing the boundary the moment that constant moves.
const MAX_PAYLOAD_BYTES = 24 * 1024 * 1024;

function fBytes() {
  // Maxes the PAYLOAD ceiling with the widest record the parser accepts.
  // Widest is 256 B key + 256 B word (ASCII) + 4096 units x 3 B of CJK = 12,800 B.
  // Note this is NOT (256+256+4096)x3: the word and key are ASCII, one byte per
  // unit, so an earlier draft's 13,824 B over-counted them.
  const perRecord = MAX_WORD + MAX_WORD + MAX_TRANS * 3;
  const count = Math.floor(MAX_PAYLOAD_BYTES / perRecord);
  const word = "w".repeat(MAX_WORD);
  const tr = "甲".repeat(MAX_TRANS);
  const out = [HDR];
  for (let i = 0; i < count; i++) {
    out.push(`${word.slice(0, MAX_WORD - 8) + String(i).padStart(8, "0")},,,${tr},,,,,0,1,,,`);
  }
  return { name: "F-bytes", csv: out.join("\n"), expectEntries: count };
}

function fReal() {
  if (!CSV) { console.error("[perf] --fixture real needs --csv <ecdict.csv[.gz]>"); process.exit(2); }
  const raw = readFileSync(CSV);
  const csv = (CSV.endsWith(".gz") ? zlib.gunzipSync(raw) : raw).toString("utf8");
  return { name: "F-real", csv, expectEntries: 59_137 };
}

// ---- One measured run -----------------------------------------------------
async function runOnce(fixture, runIdx) {
  const userDataDir = mkdtempSync(path.join(tmpdir(), "ecdict-perf-"));
  const ctx = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${EXT}`,
      `--load-extension=${EXT}`,
      "--no-first-run", "--no-default-browser-check", "--disable-default-apps",
      // Cold-measurement baseline: keep the browser from doing its own work.
      "--disable-background-networking", "--disable-component-update",
      "--disable-background-timer-throttling", "--disable-renderer-backgrounding",
      "--metrics-recording-only", "--no-pings",
      // Without this the heap figures are coarse and lag behind reality.
      "--enable-precise-memory-info",
    ],
  });
  try {
    let sw = ctx.serviceWorkers()[0];
    if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 20_000 });
    const extId = new URL(sw.url()).host;
    const origin = `chrome-extension://${extId}`;

    const page = await ctx.newPage();
    await page.goto(`${origin}/options.html`, { waitUntil: "domcontentloaded" });

    const cdp = await ctx.newCDPSession(page);
    // Baseline IndexedDB usage for this origin, before any import.
    const usageOf = async () => {
      const { usageBreakdown } = await cdp.send("Storage.getUsageAndQuota", { origin });
      const row = (usageBreakdown || []).find((u) => u.storageType === "indexeddb");
      return row ? row.usage : 0;
    };
    const idbBefore = await usageOf();

    // Longtask observer plus a 4ms interval whose drift cross-checks it.
    // Observers are installed but their counters are ZEROED immediately before
    // the import, and longtask is NOT buffered. Getting this wrong makes the
    // gate meaningless: with buffered:true the first measured run reported a
    // 1992 ms gap inside a 701 ms import, because it had picked up the options
    // page's own first-paint longtask.
    await page.evaluate(() => {
      window.__perf = { longtask: 0, drift: 0 };
      try {
        new PerformanceObserver((l) => {
          for (const e of l.getEntries()) window.__perf.longtask = Math.max(window.__perf.longtask, e.duration);
        }).observe({ type: "longtask" });
      } catch (_) {}
      window.__perfArm = () => {
        window.__perf.longtask = 0;
        window.__perf.drift = 0;
        let prev = performance.now();
        window.__perfTick = setInterval(() => {
          const now = performance.now();
          window.__perf.drift = Math.max(window.__perf.drift, now - prev - 4);
          prev = now;
        }, 4);
      };
    });
    // Let first paint settle so its longtask cannot land inside the window.
    await page.waitForTimeout(1500);

    // Materialize the fixture File BEFORE the baseline. Handing the CSV in as an
    // evaluate argument creates a multi-megabyte JS string in the page and then
    // copies it into a Blob; both used to land inside the measured window and
    // dominated it. A real user picks a File off disk, so the file existing is
    // part of the baseline, not part of the import.
    await page.evaluate((csv) => { window.__file = new File([csv], "ecdict.csv", { type: "text/csv" }); }, fixture.csv);
    await page.evaluate(() => { window.__csvArg = null; });
    try { await cdp.send("HeapProfiler.collectGarbage"); } catch (_) {}
    await page.waitForTimeout(500);

    // Heap is a DELTA over the import window for the same reason. Sampled from
    // Node every 100 ms; rev7's 250 ms can miss a short peak. usedSize plus
    // backingStorageSize -- the latter is what covers array buffers and external
    // strings. There is no externalSize field, contrary to an earlier draft.
    const heapNow = async () => {
      try { const h = await cdp.send("Runtime.getHeapUsage"); return (h.usedSize || 0) + (h.backingStorageSize || 0); }
      catch (_) { return 0; }
    };
    const heapBase = await heapNow();
    let heapPeak = heapBase, sampling = true;
    const sampler = (async () => {
      while (sampling) {
        heapPeak = Math.max(heapPeak, await heapNow());
        await new Promise((r) => setTimeout(r, 100));
      }
    })();

    const result = await page.evaluate(async () => {
      const file = window.__file;
      window.__perfArm();
      const t0 = performance.now();
      let res, err = "";
      let atParsed = null, parseMs = 0;
      try {
        res = await pbpEcdictImportFile(file, {
          rung: "R1",
          onPhase: (ph) => {
            if (ph !== "parsed") return;
            parseMs = performance.now() - t0;
            atParsed = { longtask: window.__perf.longtask, drift: window.__perf.drift };
          }
        });
      } catch (e) { err = (e && e.message) || String(e); }
      const ms = performance.now() - t0;
      clearInterval(window.__perfTick);
      return { ms, parseMs, atParsed, res: res || null, err, perf: { ...window.__perf } };
    });

    sampling = false;
    await sampler;

    if (result.err) throw new Error(`import failed: ${result.err}`);

    // Payload denominator straight from the parse layer, so the ratio uses the
    // one payload definition the spec allows.
    const payload = result.res.payloadBytes;

    // Quota accounting is read after a restart: closing the only context also
    // kills the CDP session, so the numbers have to be taken from a fresh
    // attach against the same profile directory.
    await ctx.close();
    const ctx2 = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, "--no-first-run", "--disable-component-update"],
    });
    let idbAfter = 0, idbInPage = 0, idbSettleMs = -1;
    try {
      // Storage.getUsageAndQuota needs a FRAME-scoped session. A browser-level
      // session answers "Internal error" -- measured, not assumed, and the
      // opposite of what the spec draft prescribed. So open a page on the
      // extension origin first and attach to that.
      const page2 = await ctx2.newPage();
      await page2.goto(`${origin}/options.html`, { waitUntil: "domcontentloaded" });
      const cdp2 = await ctx2.newCDPSession(page2);
      const read = async () => {
        const { usageBreakdown } = await cdp2.send("Storage.getUsageAndQuota", { origin });
        const row = (usageBreakdown || []).find((u) => u.storageType === "indexeddb");
        return row ? row.usage : 0;
      };
      // After a restart the accounting is NOT ready immediately: measured, it
      // reads 0 at +0 ms and settles by ~1 s. Reading once made this whole gate
      // pass vacuously at a ratio of 0.00. Poll for two equal non-zero reads.
      const t0 = Date.now();
      let prev = -1;
      for (let n = 0; n < 40; n++) {
        const v = await read();
        if (v > 0 && v === prev) { idbAfter = v; idbSettleMs = Date.now() - t0; break; }
        prev = v;
        await page2.waitForTimeout(250);
      }
      if (!idbAfter) idbAfter = prev > 0 ? prev : 0;
      // Cross-check against the in-page API, which reports the same number and
      // needs no CDP at all.
      idbInPage = await page2.evaluate(async () => {
        const e = await navigator.storage.estimate();
        return (e.usageDetails && e.usageDetails.indexedDB) || 0;
      });
    } finally { await ctx2.close(); }

    return {
      run: runIdx,
      entries: result.res.entries,
      payload,
      wallMs: Math.round(result.ms),
      gapMs: Math.round(Math.max(result.perf.longtask, result.perf.drift)),
      gapParseMs: result.atParsed ? Math.round(Math.max(result.atParsed.longtask, result.atParsed.drift)) : -1,
      parseMs: Math.round(result.parseMs || 0),
      heapBytes: heapPeak - heapBase,
      idbBefore, idbAfter, idbInPage, idbSettleMs,
      idbDelta: idbAfter - idbBefore,
      idbRatio: payload ? (idbAfter - idbBefore) / payload : 0,
    };
  } finally {
    rmSync(userDataDir, { recursive: true, force: true });
  }
}

// ---- Gate 6: quota abort must leave the previous pack intact ---------------
// This is the only scenario that produces a REAL IDBRequest error event rather
// than a synchronous throw, so it is the only place the "let the error bubble
// and abort" contract is exercised end to end. The unit suite cannot do it: it
// has no way to exhaust a quota.
async function runQuotaAbort() {
  const userDataDir = mkdtempSync(path.join(tmpdir(), "ecdict-quota-"));
  const ARGS = [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`,
    "--no-first-run", "--no-default-browser-check", "--disable-component-update"];
  const ctx = await chromium.launchPersistentContext(userDataDir, { headless: false, args: ARGS });
  try {
    let sw = ctx.serviceWorkers()[0];
    if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 20_000 });
    const origin = `chrome-extension://${new URL(sw.url()).host}`;
    const page = await ctx.newPage();
    await page.goto(`${origin}/options.html`, { waitUntil: "domcontentloaded" });
    const cdp = await ctx.newCDPSession(page);

    // A small pack goes in first and is the thing that must survive.
    const small = fSmall();
    const first = await page.evaluate(async (csv) => {
      const f = new File([csv], "small.csv", { type: "text/csv" });
      return (await pbpEcdictImportFile(f, { rung: "R1" })).entries;
    }, small.csv);

    const usage = async () => {
      const { usageBreakdown } = await cdp.send("Storage.getUsageAndQuota", { origin });
      const row = (usageBreakdown || []).find((u) => u.storageType === "indexeddb");
      return row ? row.usage : 0;
    };
    const baseline = await usage();

    // Headroom above current usage but far below what the replacement needs, so
    // the failure lands while records are being written rather than at clear().
    const quotaSize = baseline + 4 * 1024 * 1024;
    await cdp.send("Storage.overrideQuotaForOrigin", { origin, quotaSize });
    let outcome;
    try {
      const big = fHighEntropy();
      outcome = await page.evaluate(async (csv) => {
        const f = new File([csv], "big.csv", { type: "text/csv" });
        try { const r = await pbpEcdictImportFile(f, { rung: "R1" }); return { ok: true, entries: r.entries }; }
        catch (e) { return { ok: false, name: e && e.name, message: (e && e.message) || String(e) }; }
      }, big.csv);
    } finally {
      // Reset takes the call with NO quotaSize; leaving the override in place
      // would poison every later measurement against this profile.
      await cdp.send("Storage.overrideQuotaForOrigin", { origin });
    }

    const after = await page.evaluate(async () => {
      const meta = await pbpEcdictMeta();
      const hit = await pbpEcdictLookup("q000001");
      return { state: meta && meta.state, entries: meta && meta.entries, lookup: hit.state };
    });

    console.log(`\n=== Gate 6: quota abort (quota ${quotaSize} B over a ${baseline} B baseline) ===`);
    console.log(`  first import: ${first} entries`);
    console.log(`  replacement : ${outcome.ok ? `UNEXPECTEDLY SUCCEEDED (${outcome.entries})` : `rejected as ${outcome.name || "Error"}: ${outcome.message}`}`);
    console.log(`  old pack    : meta ${after.state}, ${after.entries} entries, lookup ${after.lookup}`);
    const pass = !outcome.ok && after.state === "ready" && after.entries === first && after.lookup === "hit";
    console.log(`  [${pass ? "PASS" : "FAIL"}] a quota-exhausted replacement leaves the previous pack ready and queryable`);
    return pass;
  } finally {
    rmSync(userDataDir, { recursive: true, force: true });
  }
}

// The quota gate needs data IndexedDB cannot compress away. With the repetitive
// F-entry fixture, 220,000 records fitted inside a 4 MiB quota and the write
// simply succeeded -- the same Snappy compression that makes the ratio gate
// meaningless on synthetic data. Deterministic pseudo-random content instead: no
// Math.random, so a failure is reproducible.
function fHighEntropy() {
  const out = [HDR];
  let seed = 0x2f6e2b1;
  const hex = (n) => {
    let s = "";
    for (let i = 0; i < n; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      s += (seed & 0xf).toString(16);
    }
    return s;
  };
  for (let i = 0; i < 100_000; i++) out.push(`h${String(i).padStart(6, "0")},,,n. ${hex(190)},,,,,0,1,,,`);
  return { name: "F-entropy", csv: out.join("\n"), expectEntries: 100_000 };
}

function fSmall() {
  const out = [HDR];
  for (let i = 0; i < 500; i++) out.push(`q${String(i).padStart(6, "0")},,,n. ${"甲".repeat(20)},,,,,0,1,,,`);
  return { name: "F-small", csv: out.join("\n"), expectEntries: 500 };
}

// ---- Drive ---------------------------------------------------------------
if (WHICH === "quota") {
  const ok = await runQuotaAbort();
  process.exitCode = ok ? 0 : 1;
  console.log(ok ? "\nall gates passed" : "\n1 gate(s) failed");
} else {
const chosen = WHICH === "all" ? [fEntry(), fBytes()] : [{ entry: fEntry, bytes: fBytes, real: fReal }[WHICH]()];
const mib = (n) => (n / 1048576).toFixed(2) + " MiB";
let failed = 0;

for (const fx of chosen) {
  console.log(`\n=== ${fx.name} (${RUNS} cold runs) ===`);
  const rows = [];
  for (let i = 1; i <= RUNS; i++) {
    process.stdout.write(`  run ${i}/${RUNS} ... `);
    try { const r = await runOnce(fx, i); rows.push(r); console.log(`${r.entries} entries, wall ${r.wallMs}ms (parse ${r.parseMs}ms), gap ${r.gapMs}ms (parse-phase ${r.gapParseMs}ms), heap ${mib(r.heapBytes)}, idb ${r.idbAfter}B x${r.idbRatio.toFixed(2)} (settled ${r.idbSettleMs}ms, in-page ${r.idbInPage}B)`); }
    catch (e) { console.log(`FAILED: ${e.message}`); failed++; }
  }
  if (!rows.length) continue;
  const max = (k) => Math.max(...rows.map((r) => r[k]));
  const median = (k) => { const v = rows.map((r) => r[k]).sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; };
  // Aggregation per spec: max for gap / heap / idb, median for wall clock.
  const agg = { entries: rows[0].entries, payload: rows[0].payload, idbAfter: max("idbAfter"), gapMs: max("gapMs"), wallMs: median("wallMs"), heapBytes: max("heapBytes"), idbRatio: max("idbRatio") };
  const verdict = (ok) => (ok ? "PASS" : "FAIL");
  const checks = [
    ["entries", `${agg.entries} (expected ${fx.expectEntries})`, agg.entries === fx.expectEntries],
    ["payload", `${agg.payload} B = ${mib(agg.payload)}`, agg.payload <= MAX_PAYLOAD_BYTES],
    ["max event-loop gap", `${agg.gapMs} ms (<= ${GATES.gapMs})`, agg.gapMs <= GATES.gapMs],
    ["cold wall clock (median)", `${agg.wallMs} ms (<= ${GATES.wallMs})`, agg.wallMs <= GATES.wallMs],
    ["peak heap", `${mib(agg.heapBytes)} (<= ${mib(GATES.heapBytes)})`, agg.heapBytes <= GATES.heapBytes],
    // A zero reading is a broken measurement, not a great result: guard against
    // the gate passing vacuously the way it did before the settle poll existed.
    ["idb quota accounting", `x${agg.idbRatio.toFixed(2)} of payload (<= ${GATES.idbRatio}), absolute ${rows[0].idbAfter} B`,
      agg.idbRatio > 0 && agg.idbRatio <= GATES.idbRatio],
  ];
  for (const [name, value, ok] of checks) {
    console.log(`  [${verdict(ok)}] ${name}: ${value}`);
    if (!ok) failed++;
  }
}

console.log(failed ? `\n${failed} gate(s)/run(s) failed` : "\nall gates passed");
process.exitCode = failed ? 1 : 0;
}
