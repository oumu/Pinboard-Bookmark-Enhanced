// Headless runner for the project's tests/*.html browser suites.
// Serves the repo root over a local HTTP server (so tests that fetch() source
// files work — file:// blocks fetch), loads the test in bundled Chromium, then
// waits for the suite's declared number of structured result rows. Exit 0 =
// green, 1 = red, 2 = unknown suite / invalid invocation.
//
// Usage: node .qa-scan/run-test.mjs tests/<file>.html
import { chromium } from "playwright";
import { createServer } from "http";
import { readFile } from "fs/promises";
import { resolve, dirname, extname, relative } from "path";
import { fileURLToPath } from "url";

const file = process.argv[2];
if (!file) {
  console.error("usage: node .qa-scan/run-test.mjs <test.html>");
  process.exit(2);
}
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const abs = resolve(file);
const rel = relative(ROOT, abs).split("\\").join("/");
const TEST_TIMEOUT_MS = rel === "tests/md-convert-tests.html" ? 45000 : 30000;
const CLEANUP_TIMEOUT_MS = 5000;

// Completion is explicit: each suite must emit exactly this many DOM result
// ROWS carrying a pass/fail/skip class. NOTE: the row unit varies per page --
// md-dict/dict-pack/anki/eudic emit one row per assertion, md-ai emits one
// row per test() block. Count rows in the page, not assert calls; an
// unregistered suite is rejected instead of guessed complete.
const EXPECTED_RESULTS = Object.freeze({
  "tests/a11y-tests.html": 37,
  "tests/ai-cache-tests.html": 23,
  "tests/ai-tags-tests.html": 76,
  "tests/anki-connect-tests.html": 41,
  "tests/background-active-tab-tests.html": 31,
  "tests/background-lifecycle-tests.html": 37,
  "tests/batch-dedup-tests.html": 27,
  "tests/contrast-tests.html": 6,
  "tests/dict-pack-tests.html": 187,
  "tests/escape-html-tests.html": 8,
  "tests/eudic-sync-tests.html": 39,
  "tests/export-targets-tests.html": 138,
  "tests/frame-candidate-tests.html": 26,
  "tests/i18n-parity-tests.html": 215,
  "tests/icon-state-tests.html": 11,
  "tests/jina-cache-tests.html": 28,
  "tests/library-notes-tests.html": 106,
  "tests/library-vocab-tests.html": 198,
  "tests/md-ai-tests.html": 881,
  "tests/md-convert-tests.html": 688,
  "tests/md-dict-tests.html": 398,
  "tests/md-embed-tests.html": 48,
  "tests/md-explain-layout-tests.html": 4,
  "tests/md-highlight-commit-tests.html": 160,
  "tests/md-mermaid-tests.html": 13,
  "tests/md-video-tests.html": 433,
  "tests/offline-queue-tests.html": 22,
  "tests/options-notes-tests.html": 36,
  "tests/options-context-help-tests.html": 15,
  "tests/options-reset-tests.html": 13,
  "tests/options-usability-tests.html": 21,
  "tests/options-vocab-tests.html": 69,
  "tests/pinboard-sort-tests.html": 45,
  "tests/pinboard-style-cloak-tests.html": 21,
  "tests/popup-tag-cache-tests.html": 20,
  "tests/popup-save-tests.html": 75,
  "tests/save-pipeline-tests.html": 52,
  "tests/settings-cache-invalidate-tests.html": 8,
  "tests/settings-persist-tests.html": 372,
  "tests/tag-gov-layout-tests.html": 6,
  "tests/tag-gov-reserve-tests.html": 2,
  "tests/tag-gov-tests.html": 67,
  "tests/union-tags-tests.html": 12,
  "tests/url-strip-tests.html": 19,
  "tests/vocab-background-tests.html": 17,
  "tests/vocab-gdrive-tests.html": 72,
  "tests/vocab-store-tests.html": 59,
  "tests/wayback-tests.html": 44,
});
const expected = EXPECTED_RESULTS[rel];
if (expected === undefined) {
  console.error(`ERROR: no expected result count registered for ${rel}`);
  process.exit(2);
}

const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml",
};

// Minimal static server rooted at the repo, so fetch("../shared.js") etc. resolve.
const server = createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    const target = resolve(ROOT, "." + urlPath);
    if (!target.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
    const body = await readFile(target);
    res.writeHead(200, { "Content-Type": MIME[extname(target)] || "application/octet-stream" });
    res.end(body);
  } catch (_) {
    res.writeHead(404); res.end("not found");
  }
});

async function bounded(label, timeoutMs, task) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(task),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

let browser;
let browserDisconnected = false;
const runtimeErrors = [];
const blockedExternal = [];     // DOM subresources: blocked + reported, non-fatal
const blockedProgrammatic = []; // fetch/xhr/etc: a missed mock — fails the run
try {
  await bounded("server start", CLEANUP_TIMEOUT_MS, () => new Promise((resolveListen, rejectListen) => {
    const onError = (error) => rejectListen(error);
    server.once("error", onError);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", onError);
      resolveListen();
    });
  }));
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}/${rel}`;

  const dom = await bounded("test", TEST_TIMEOUT_MS, async () => {
    browser = await chromium.launch();
    browser.once("disconnected", () => { browserDisconnected = true; });
    const page = await browser.newPage();
    page.on("pageerror", (error) => runtimeErrors.push("PAGEERROR: " + error.message));
    page.on("crash", () => runtimeErrors.push("PAGECRASH: renderer crashed"));
    const localOrigin = new URL(url).origin;
    // Closed network by default (same policy as scripts/perf-cold-sample.mjs):
    // any http(s) request off the local test server is aborted and reported.
    // A missed fetch mock must fail loudly here — not silently reach a real
    // API and go green-online / red-offline. A suite that genuinely needs an
    // external origin must mock it via page fixtures instead.
    await page.route("**/*", (route) => {
      const request = route.request();
      const requestUrl = request.url();
      if (/^https?:/.test(requestUrl) && new URL(requestUrl).origin !== localOrigin) {
        // Programmatic requests (fetch/xhr/websocket…) off-origin mean a
        // missed mock — those FAIL the run (Codex review: a NOTE alone lets
        // code that swallows the network error stay green). DOM subresources
        // (an <img src> in a layout fixture, a stylesheet) are expected
        // fixture noise: blocked and reported, not fatal. A subframe document
        // load is the same class: an <iframe src> fixture declares it in the
        // DOM, nothing programmatic swallowed an error. Main-frame navigation
        // off-origin still fails.
        const rt = request.resourceType();
        const subresource = rt === "image" || rt === "media" || rt === "font" || rt === "stylesheet"
          || (rt === "document" && request.frame() !== page.mainFrame());
        (subresource ? blockedExternal : blockedProgrammatic)
          .push(rt + " " + request.method() + " " + requestUrl);
        return route.abort("blockedbyclient");
      }
      return route.continue();
    });

    const response = await page.goto(url, { waitUntil: "load", timeout: 0 });
    if (!response || !response.ok()) throw new Error(`test page failed to load: HTTP ${response && response.status()}`);
    await page.waitForFunction((resultCount) => {
      let total = 0;
      for (const el of document.querySelectorAll(".pass, .fail, .skip")) {
        if (el.classList.contains("pass") || el.classList.contains("fail") || el.classList.contains("skip")) total++;
      }
      return total >= resultCount;
    }, expected, { polling: 50, timeout: 0 });

    return page.evaluate(() => {
      let pass = 0, fail = 0, skip = 0;
      const failures = [];
      for (const el of document.querySelectorAll(".pass, .fail, .skip")) {
        if (el.classList.contains("fail")) { fail++; failures.push(el.textContent || "FAIL"); }
        else if (el.classList.contains("pass")) pass++;
        else if (el.classList.contains("skip")) skip++;
      }
      return { pass, fail, skip, failures: failures.slice(0, 20), title: document.title || "" };
    });
  });

  const total = dom.pass + dom.fail + dom.skip;
  console.log(`pass=${dom.pass} fail=${dom.fail} skip=${dom.skip} expected=${expected} title="${dom.title}"`);
  if (dom.failures?.length) console.error("failures:\n  " + dom.failures.join("\n  "));
  if (total !== expected) console.error(`ERROR: expected ${expected} result rows, found ${total}`);
  if (runtimeErrors.length) console.error("errors:\n  " + runtimeErrors.slice(0, 25).join("\n  "));
  if (browserDisconnected) console.error("ERROR: browser disconnected before the suite completed");
  if (blockedExternal.length) {
    const unique = [...new Set(blockedExternal)];
    console.error(`NOTE: closed network blocked ${blockedExternal.length} external subresource(s):\n  ` + unique.slice(0, 10).join("\n  "));
  }
  if (blockedProgrammatic.length) {
    const unique = [...new Set(blockedProgrammatic)];
    console.error(`ERROR: closed network blocked ${blockedProgrammatic.length} PROGRAMMATIC external request(s) — a mock is missing:\n  ` + unique.slice(0, 10).join("\n  "));
  }
  if (dom.fail > 0 || total !== expected || runtimeErrors.length > 0 || browserDisconnected || blockedProgrammatic.length > 0) process.exitCode = 1;
} catch (error) {
  console.error(`ERROR: ${error && error.message ? error.message : error}`);
  if (runtimeErrors.length) console.error("errors:\n  " + runtimeErrors.slice(0, 25).join("\n  "));
  process.exitCode = 1;
} finally {
  const cleanupErrors = [];
  if (browser) {
    try {
      await bounded("browser close", CLEANUP_TIMEOUT_MS, () => browser.close());
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  if (server.listening) {
    try {
      await bounded("server close", CLEANUP_TIMEOUT_MS, () => new Promise((resolveClose, rejectClose) => {
        server.close((error) => error ? rejectClose(error) : resolveClose());
      }));
    } catch (error) {
      if (server.closeAllConnections) server.closeAllConnections();
      cleanupErrors.push(error);
    }
  }
  if (cleanupErrors.length) {
    for (const error of cleanupErrors) console.error(`ERROR: ${error.message || error}`);
    process.exitCode = 1;
  }
}

process.exit(process.exitCode || 0);
