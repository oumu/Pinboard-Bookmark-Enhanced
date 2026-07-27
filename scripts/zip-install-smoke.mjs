#!/usr/bin/env node
// zip-install-smoke — extracts a release ZIP, installs it into a fresh
// Playwright-bundled Chromium via --load-extension, then verifies basic
// runtime health (SW registers; popup, options, and preview open cleanly).
//
// Designed to catch the bug class where the shipped ZIP is missing a file
// that manifest/HTML references (e.g. SW importScripts 404, popup script
// 404 → ReferenceError on first call). Loaded-unpacked tests don't catch
// this; only a real ZIP install does.
//
// PREREQUISITES
//   1. .qa-scan/ has playwright installed:  cd .qa-scan && npm install
//   2. Playwright's bundled Chromium has been downloaded:
//      cd .qa-scan && npx playwright install chromium
//
// USAGE
//   node scripts/zip-install-smoke.mjs
//   node scripts/zip-install-smoke.mjs --zip release/pinboard-bookmark-enhanced-v2.71.zip
//   node scripts/zip-install-smoke.mjs --keep-tmp  # leave extracted dir for inspection
//
// EXIT
//   0 → all checks passed
//   1 → at least one check failed (SW missing, page errors, etc.)
//   2 → tooling/env error (no playwright, no ZIP, etc.)

import { createRequire } from 'node:module';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '..');
const QA_SCAN = resolve(REPO, '.qa-scan');
const EXPECTED_EXTENSION_ID = 'pnjndmjhljjbdlbejeenkepdalokfooh';
const EXPECTED_OAUTH_CLIENT_ID = '1002273768498-uh3bdcaqsrl1rt7dlnrfducebdeg6h63.apps.googleusercontent.com';

let chromium;
try {
  const req = createRequire(resolve(QA_SCAN, 'package.json'));
  ({ chromium } = req('playwright'));
} catch {
  console.error('[zip-smoke] playwright not found.');
  console.error('  Install:  cd .qa-scan && npm install && npx playwright install chromium');
  process.exit(2);
}

// ---- CLI ----
const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const hasFlag = (n) => argv.includes(n);
const KEEP_TMP = hasFlag('--keep-tmp');

let zipPath = flag('--zip', null);
if (!zipPath) {
  const releaseDir = resolve(REPO, 'release');
  if (!existsSync(releaseDir)) {
    console.error('[zip-smoke] no release/ dir; pass --zip <path>');
    process.exit(2);
  }
  const zips = readdirSync(releaseDir)
    .filter(f => f.endsWith('.zip') && f.startsWith('pinboard-bookmark-enhanced-v'))
    .sort()
    .reverse();
  if (!zips.length) {
    console.error('[zip-smoke] no ZIP in release/; pass --zip <path>');
    process.exit(2);
  }
  zipPath = resolve(releaseDir, zips[0]);
}

if (!existsSync(zipPath)) {
  console.error(`[zip-smoke] ZIP not found: ${zipPath}`);
  process.exit(2);
}

// ---- Extract ZIP ----
const tmpRoot = mkdtempSync(join(tmpdir(), 'pbp-zip-smoke-'));
const extractDir = join(tmpRoot, 'ext');
console.log(`[zip-smoke] ZIP: ${zipPath}`);
console.log(`[zip-smoke] extracting → ${extractDir}`);
try {
  // execFileSync (no shell) — argv-array form prevents injection
  execFileSync('unzip', ['-q', zipPath, '-d', extractDir], { stdio: 'inherit' });
} catch {
  console.error('[zip-smoke] unzip failed; is `unzip` installed?');
  rmSync(tmpRoot, { recursive: true, force: true });
  process.exit(2);
}

// ZIP contains pinboard-bookmark-enhanced-vX.Y.Z/ as a single root dir
const subdirs = readdirSync(extractDir);
if (subdirs.length !== 1) {
  console.error(`[zip-smoke] expected 1 dir at ZIP root, got ${subdirs.length}: ${subdirs.join(', ')}`);
  if (!KEEP_TMP) rmSync(tmpRoot, { recursive: true, force: true });
  process.exit(2);
}
const extPath = join(extractDir, subdirs[0]);
const userDataDir = join(tmpRoot, 'profile');
const packagedManifest = JSON.parse(readFileSync(join(extPath, 'manifest.json'), 'utf8'));
function hasDriveOAuthCapability(manifest) {
  const scopes = Array.isArray(manifest.oauth2?.scopes) ? manifest.oauth2.scopes : [];
  const hosts = Array.isArray(manifest.optional_host_permissions)
    ? manifest.optional_host_permissions : [];
  return Array.isArray(manifest.optional_permissions) &&
    manifest.optional_permissions.includes('identity') &&
    typeof manifest.oauth2?.client_id === 'string' &&
    manifest.oauth2.client_id.trim().length > 0 &&
    scopes.length === 1 &&
    scopes[0] === 'https://www.googleapis.com/auth/drive.appdata' &&
    (hosts.includes('https://www.googleapis.com/*') || hosts.includes('*://*/*'));
}
const driveOAuthActive = hasDriveOAuthCapability(packagedManifest);
const simulatedActiveDriveManifest = {
  optional_permissions: ['identity'],
  optional_host_permissions: ['https://www.googleapis.com/*'],
  oauth2: {
    client_id: 'smoke-test.apps.googleusercontent.com',
    scopes: ['https://www.googleapis.com/auth/drive.appdata'],
  },
};
if (!hasDriveOAuthCapability(simulatedActiveDriveManifest) ||
    hasDriveOAuthCapability({
      ...simulatedActiveDriveManifest,
      oauth2: {
        ...simulatedActiveDriveManifest.oauth2,
        scopes: [...simulatedActiveDriveManifest.oauth2.scopes, 'extra'],
      },
    })) {
  console.error('[zip-smoke] Drive OAuth capability contract is inconsistent');
  cleanup();
  process.exit(1);
}
function cleanup() {
  if (KEEP_TMP) {
    console.log(`[zip-smoke] --keep-tmp: tmp preserved at ${tmpRoot}`);
  } else {
    try { rmSync(tmpRoot, { recursive: true, force: true }); } catch {}
  }
}
if (!driveOAuthActive ||
    packagedManifest.oauth2.client_id !== EXPECTED_OAUTH_CLIENT_ID) {
  console.error('[zip-smoke] release manifest does not use the registered production Drive OAuth client');
  cleanup();
  process.exit(1);
}

// ---- Check 0: dynamically-referenced runtime files survived packaging ----
// These aren't all referenced by manifest/HTML tags, so release.sh's static
// sanity check can't see them. Keep this explicit list beside the real ZIP test.
console.log('[zip-smoke] check 0: dynamically-referenced runtime files present...');
const REQUIRED_RUNTIME_FILES = [
  'site-rules.js',
  'vocab-store.js',
  'vocab-gdrive.js',
  'vendor/turndown.js',
  'vendor/highlight.min.js',
  'vendor/hljs-github.min.css',
  'vendor/hljs-github-dark.min.css',
  'vendor/katex/katex.min.js',
  'vendor/katex/katex.min.css',
  'vendor/katex/auto-render.min.js',
  'vendor/defuddle.js',
  'icons/pin-default-16.png',
  'icons/pin-default-32.png',
  'icons/pin-default-48.png',
  'icons/pin-default-128.png',
  'icons/pin-saved-16.png',
  'icons/pin-saved-32.png',
  'icons/pin-saved-48.png',
  'icons/pin-saved-128.png',
];
const missingRuntime = REQUIRED_RUNTIME_FILES.filter(f => !existsSync(join(extPath, f)));
if (missingRuntime.length) {
  console.error('[zip-smoke] FAIL: ZIP missing dynamically-referenced runtime file(s):');
  missingRuntime.forEach(f => console.error(`    - ${f}`));
  cleanup();
  process.exit(1);
}
console.log(`  present: ${REQUIRED_RUNTIME_FILES.join(', ')}`);

// ---- Launch fresh Chromium with extension ----
console.log('[zip-smoke] launching Chromium with extension loaded...');
let ctx;
try {
  ctx = await chromium.launchPersistentContext(userDataDir, {
    headless: false, // MV3 extensions require headed (or 'new' headless on recent Chrome)
    args: [
      `--disable-extensions-except=${extPath}`,
      `--load-extension=${extPath}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-default-apps',
    ],
  });
} catch (e) {
  console.error(`[zip-smoke] Chromium launch failed: ${e.message}`);
  console.error('  If running headless on a server, try installing X virtual framebuffer:');
  console.error('    sudo apt install xvfb && xvfb-run -a node scripts/zip-install-smoke.mjs');
  cleanup();
  process.exit(2);
}

const consoleErrors = [];
ctx.on('console', msg => {
  if (msg.type() === 'error') {
    consoleErrors.push({ scope: 'ctx', text: msg.text() });
  }
});

// ---- Check 1: Service worker registers ----
console.log('[zip-smoke] check 1: service worker registers...');
let sw = ctx.serviceWorkers()[0];
if (!sw) {
  sw = await ctx.waitForEvent('serviceworker', { timeout: 15000 }).catch(() => null);
}
if (!sw) {
  console.error('[zip-smoke] FAIL: no service worker registered within 15s');
  await ctx.close().catch(() => {});
  cleanup();
  process.exit(1);
}
console.log(`  SW URL: ${sw.url()}`);

const extId = new URL(sw.url()).hostname;
console.log(`  extension ID: ${extId}`);
if (extId !== EXPECTED_EXTENSION_ID) {
  console.error(`[zip-smoke] FAIL: release ZIP extension ID is ${extId}, expected ${EXPECTED_EXTENSION_ID}`);
  await ctx.close().catch(() => {});
  cleanup();
  process.exit(1);
}

// Capture SW console errors
sw.on('console', msg => {
  if (msg.type() === 'error') {
    consoleErrors.push({ scope: 'sw', text: msg.text() });
  }
});

// Brief wait so SW can finish boot (importScripts, alarm setup, etc.)
await new Promise(r => setTimeout(r, 1500));
const vocabRuntime = await sw.evaluate(() => ({
  store: typeof pbpVocabGetSyncMeta === 'function',
  drive: typeof pbpCreateVocabDriveSyncRunner === 'function',
}));
if (!vocabRuntime.store || !vocabRuntime.drive) {
  console.error(`[zip-smoke] FAIL: vocabulary runtime imports unavailable: ${JSON.stringify(vocabRuntime)}`);
  await ctx.close().catch(() => {});
  cleanup();
  process.exit(1);
}
console.log('  vocabulary runtime imports OK');

// ---- Checks 2-4: extension pages open without runtime/resource failures ----
const extensionBase = `chrome-extension://${extId}/`;
async function checkExtensionPage(number, name, waitMs) {
  console.log(`[zip-smoke] check ${number}: ${name}.html opens...`);
  const failures = [];
  const page = await ctx.newPage();
  let collecting = true;
  page.on('pageerror', e => {
    if (collecting) failures.push(`pageerror: ${e.message}`);
  });
  page.on('requestfailed', request => {
    if (!collecting || !request.url().startsWith(extensionBase)) return;
    failures.push(`request failed: ${request.url()} (${request.failure()?.errorText || 'unknown error'})`);
  });
  page.on('response', response => {
    if (collecting && response.url().startsWith(extensionBase) && response.status() >= 400) {
      failures.push(`extension resource HTTP ${response.status()}: ${response.url()}`);
    }
  });
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push({ scope: name, text: msg.text() });
  });
  try {
    await page.goto(`${extensionBase}${name}.html`, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await new Promise(r => setTimeout(r, waitMs));
    if (name === 'options') {
      await page.locator('#tab-vocab').click();
      const connect = page.locator('#vocab-drive-connect');
      const actions = page.locator('#vocab-drive-actions');
      const state = page.locator('#vocab-drive-state');
      if (await connect.count() !== 1) {
        failures.push('Google Drive vocabulary control not found');
      } else if (driveOAuthActive) {
        if (!await connect.isVisible()) {
          failures.push('OAuth-active manifest did not expose Connect Google Drive');
        }
      } else {
        if (await connect.isVisible() || await actions.isVisible()) {
          failures.push('OAuth-inactive manifest exposed Google Drive actions');
        }
        const expected = await page.evaluate(() =>
          chrome.i18n.getMessage('vocabDriveUnavailable'));
        if ((await state.textContent())?.trim() !== expected) {
          failures.push('OAuth-inactive manifest did not show the unavailable status');
        }
      }
    }
  } catch (e) {
    failures.push(`navigation failed: ${e.message}`);
  }
  collecting = false;
  await page.close().catch(() => {});
  if (failures.length) {
    console.error(`  FAIL: ${name} raised ${failures.length} runtime/resource failure(s):`);
    failures.forEach(e => console.error(`    - ${e}`));
    return false;
  }
  console.log(`  ${name} OK`);
  return true;
}

for (const check of [[2, 'popup', 1500], [3, 'options', 2000], [4, 'md-preview', 2000]]) {
  if (!await checkExtensionPage(...check)) {
    await ctx.close().catch(() => {});
    cleanup();
    process.exit(1);
  }
}

// ---- Check 5: image-fix DNR session-rule ownership & lifecycle ----
// The hotlink-guard Referer rules (md-embed.js -> background.js) are the one
// subsystem the file:// test suites cannot reach: they need a real MV3 service
// worker, real chrome.declarativeNetRequest, and real tab lifecycle. This is
// the only harness in the repo with all three, so the invariants that a review
// found broken twice live here (no network is required -- rules are inspected
// through the API, never exercised against a live CDN):
//   1. concurrent installs from two preview tabs get DISTINCT ids, each scoped
//      to its own tab (a shared id let one tab void the other's live rule);
//   2. a page can only remove its OWN tab's rules (cross-tab remove is a no-op);
//   3. install is refused for a tab that is not showing a preview document
//      (this is what keeps a rule off a tab that navigated to a normal site);
//   4. every rule is pinned to this extension as the request initiator, so a
//      page-originated request structurally cannot match it;
//   5. leaving the preview page sweeps that tab's rules.
console.log('[zip-smoke] check 5: image-fix DNR rule ownership/lifecycle...');
const dnrFailures = [];
try {
  const listRules = () => sw.evaluate(async () => {
    const rs = await chrome.declarativeNetRequest.getSessionRules();
    return rs.filter(r => r.id >= 786001 && r.id <= 786999).map(r => ({
      id: r.id,
      tabIds: (r.condition && r.condition.tabIds) || [],
      initiators: (r.condition && r.condition.initiatorDomains) || [],
    }));
  });
  const install = (page, domain) => page.evaluate(d => chrome.runtime.sendMessage({
    type: 'imgFixInstallReferer', domains: [d], origin: 'https://example.org',
  }), domain);

  const a = await ctx.newPage();
  await a.goto(`${extensionBase}md-preview.html?k=smokeA`, { waitUntil: 'domcontentloaded', timeout: 10000 });
  const b = await ctx.newPage();
  await b.goto(`${extensionBase}md-preview.html?k=smokeB`, { waitUntil: 'domcontentloaded', timeout: 10000 });

  const [ra, rb] = await Promise.all([install(a, 'img-a.invalid'), install(b, 'img-b.invalid')]);
  if (!ra?.ok || !rb?.ok) dnrFailures.push(`install failed: ${JSON.stringify([ra, rb])}`);
  const live = await listRules();
  if (live.length !== 2) dnrFailures.push(`expected 2 live rules, got ${live.length}`);
  if (new Set(live.map(r => r.id)).size !== 2) dnrFailures.push(`rule ids collided across tabs: ${live.map(r => r.id)}`);
  if (new Set(live.map(r => String(r.tabIds))).size !== 2) dnrFailures.push('rules are not scoped to distinct tabs');
  if (!live.every(r => r.initiators.includes(extId))) {
    dnrFailures.push(`rules not pinned to the extension as initiator: ${JSON.stringify(live.map(r => r.initiators))}`);
  }

  // Cross-tab remove must be refused (tab A tries to drop tab B's rule).
  await a.evaluate(id => chrome.runtime.sendMessage({ type: 'imgFixRemoveReferer', ruleIds: [id] }), rb.ruleId);
  const afterCross = await listRules();
  if (!afterCross.some(r => r.id === rb.ruleId)) dnrFailures.push('cross-tab remove deleted another tab\'s rule');

  // Install must be refused for a tab that is not a preview document.
  const normal = await ctx.newPage();
  await normal.goto('about:blank', { timeout: 10000 });
  const refused = await sw.evaluate(async () => {
    const tabs = await chrome.tabs.query({});
    const t = tabs.find(x => (x.url || '').startsWith('about:blank'));
    if (!t) return 'no-blank-tab';
    try {
      await pbpImgFixInstallRule({ domains: ['img-c.invalid'], origin: 'https://example.org', tabId: t.id });
      return 'INSTALLED';
    } catch (e) { return `refused:${e.message}`; }
  });
  if (!String(refused).startsWith('refused:')) dnrFailures.push(`install on a non-preview tab was not refused (${refused})`);

  // Leaving the preview page sweeps that tab's rules.
  await b.goto('about:blank', { waitUntil: 'domcontentloaded', timeout: 10000 });
  await new Promise(r => setTimeout(r, 1200));
  const afterLeave = await listRules();
  if (afterLeave.some(r => r.id === rb.ruleId)) dnrFailures.push('rule survived the preview tab navigating away');

  await Promise.all([a.close().catch(() => {}), b.close().catch(() => {}), normal.close().catch(() => {})]);
} catch (e) {
  dnrFailures.push(`probe threw: ${e.message}`);
}
if (dnrFailures.length) {
  console.error('  FAIL: image-fix DNR invariants broken:');
  dnrFailures.forEach(f => console.error(`    - ${f}`));
  await ctx.close().catch(() => {});
  cleanup();
  process.exit(1);
}
console.log('  image-fix DNR OK');

// ---- Teardown ----
await ctx.close().catch(() => {});
cleanup();

// Console errors are warnings — fail count is for diagnostics only.
// Real failures already exited above. Common benign console errors:
// "Failed to load resource" for icons on chrome:// pages, etc.
if (consoleErrors.length) {
  console.warn(`[zip-smoke] note: ${consoleErrors.length} console error(s) captured (not a fail):`);
  consoleErrors.slice(0, 5).forEach(e => console.warn(`  [${e.scope}] ${e.text}`));
  if (consoleErrors.length > 5) console.warn(`  ... and ${consoleErrors.length - 5} more`);
}

console.log('[zip-smoke] PASS');
process.exit(0);
