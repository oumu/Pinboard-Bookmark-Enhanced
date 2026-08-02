#!/usr/bin/env node
// qa-drive — exploratory QA harness: loads the REPO ROOT as an unpacked
// extension into Playwright's bundled Chromium, seeds realistic state
// (settings / vocab / preview article), mocks every external dependency
// (Pinboard API + dictionary via context.route fixtures, AI providers via a
// real local HTTP server on 127.0.0.1), then walks the user-visible surfaces
// (options tabs, md-preview reader interactions, toolbar popup, pinboard.in
// site theme) taking screenshots and collecting console/pageerror evidence
// into .qa-scan/report/<label>/ for human + AI review.
//
// Unlike zip-install-smoke.mjs (release gate: pass/fail) this is a REPORTER:
// surface-level breakage is recorded as a finding, not an exit code. Only
// tooling failures (launch, seed, no SW) exit non-zero.
//
// PREREQUISITES  (same as zip-install-smoke.mjs)
//   cd .qa-scan && npm install && npx playwright install chromium
//
// USAGE
//   node scripts/qa-drive.mjs                       # all surfaces, headed
//   node scripts/qa-drive.mjs --headless            # popup surface skipped
//   node scripts/qa-drive.mjs --surfaces options,preview
//   node scripts/qa-drive.mjs --surfaces themes --label themes  # 13 preset × 明暗矩阵
//   node scripts/qa-drive.mjs --site-theme dracula  # pinboard.in theme shot
//   node scripts/qa-drive.mjs --label after-fix
//
// Network model (design record 2026-08-02, cross-reviewed with Codex):
//   - context.route() fixtures serve api.pinboard.in / freedictionaryapi.com
//     / pinboard.in pages for all Playwright-tracked pages;
//   - AI chat-completions run against a REAL local HTTP server (127.0.0.1,
//     ephemeral port) so every context (page or SW) reaches it — route()
//     coverage of extension-SW fetches has no official guarantee;
//   - --host-resolver-rules="MAP * ~NOTFOUND" blackholes everything else at
//     DNS level (literal-IP loopback is unaffected), so nothing escapes.

import { createServer } from "node:http";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(SCRIPT_DIR, "..");
const QA_SCAN = resolve(REPO, ".qa-scan");
const REPORT_ROOT = resolve(QA_SCAN, "report");
const TIMEOUT_MS = 15_000;

// ---- CLI ----
const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const hasFlag = (n) => argv.includes(n);
const CONFIG = {
  label: flag("--label", "qa"),
  headless: hasFlag("--headless"),
  keepProfile: hasFlag("--keep-profile"),
  siteTheme: flag("--site-theme", "modern-card"),
  surfaces: (flag("--surfaces", "options,preview,popup,pinboard")).split(",").filter(Boolean),
};
if (!/^[A-Za-z0-9._-]+$/.test(CONFIG.label)) {
  console.error("[qa-drive] --label may contain only letters, numbers, dot, underscore, hyphen");
  process.exit(2);
}
if (CONFIG.headless) CONFIG.surfaces = CONFIG.surfaces.filter((s) => s !== "popup");

let chromium;
try {
  const req = createRequire(resolve(QA_SCAN, "package.json"));
  ({ chromium } = req("playwright"));
} catch {
  console.error("[qa-drive] playwright not found. Install: cd .qa-scan && npm install && npx playwright install chromium");
  process.exit(2);
}

// ============================================================
// Fixtures
// ============================================================

const FAKE_TOKEN = "qa:0000000000000000000000000000000000000000"; // username "qa"
const ARTICLE_URL = "http://127.0.0.1:43123/qa-article";
const ARTICLE_TITLE = "QA 走查用固定文章 — Serendipity in Systems";
const PREVIEW_KEY = "qa-drive-preview";

// Rich synthetic markdown: exercises headings/TOC, code block (copy button),
// table (scroll container), blockquote, footnote, list, EN+CJK mix (dict echo
// and selection-dictionary targets), and an inline data-URI image.
const TINY_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAF0lEQVQYV2NkYGD4z8DAwMgABXAGNgEAJd4DAcM0DcYAAAAASUVORK5CYII=";
const SYNTHETIC_MARKDOWN = [
  `# ${ARTICLE_TITLE}`,
  "这是 QA 走查用的固定合成文章，不含真实书签或私人信息。The word serendipity appears here so the selection dictionary has a stable English target. 混排中文与 English 以覆盖字体与词典回显。",
  "## 结构元素",
  "下面是引用块、列表与行内元素的组合，用于检查排版密度与行高。",
  "> 引用块：好的阅读器让长文变得可以呼吸。A quote with **bold**, *italic*, and `inline code`.",
  "- 列表项一：包含一个 [内部链接](#结构元素)",
  "- 列表项二：包含 English words like ephemeral and ubiquitous",
  "- 列表项三：数字 12345 与全角标点，测试标点悬挂。",
  "## 代码与表格",
  "```js\nfunction serendipity(seed) {\n  // 固定示例代码，检查复制按钮与高亮\n  return seed * 42;\n}\n```",
  "| 列 A | 列 B | 一个比较长的列标题 C |\n|---|---|---|\n| alpha | 1 | 表格滚动容器检查 |\n| beta | 2 | second row |",
  `![固定小图](${TINY_PNG})`,
  "## 长文滚动区",
  // English-dominant paragraphs: with translateTargetLang=zh-CN, blocks already
  // in the target language are skipped without a request — the translator only
  // gets exercised if most blocks are foreign-language.
  ...Array.from({ length: 12 }, (_, i) =>
    `Paragraph ${i + 1}: this section exists to create scroll depth. The reader keeps its anchor while the translator and dictionary get realistic English material to work on. 第 ${i + 1} 段的锚点提示。`),
  "## 脚注示例",
  "这一句话带一个脚注[^1]，用于检查脚注浮层。",
  "[^1]: 脚注内容：固定文本，不引用外部资源。",
].join("\n\n");

const ARTICLE_HTML = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${ARTICLE_TITLE}</title></head>
<body><main><h1>${ARTICLE_TITLE}</h1><p>固定本地活动页，供 popup 抓取标题与 URL。A stable local page.</p></main></body></html>`;

// Minimal-but-structural pinboard.in bookmarks page: the ids/classes the
// 13 site themes and pinboard-sort target (banner, sub_banner, user_navbar,
// bookmark rows, right_bar tag cloud). Hand-written from the composer's
// canonical surface inventory — NOT a live-site copy.
function pinboardFixtureHtml() {
  const bookmark = (title, desc, tags, extra = "") => `
    <div class="bookmark ${extra}">
      <div class="display"><a class="bookmark_title" href="#">${title}</a></div>
      <div class="description">${desc}</div>
      <div class="tags">${tags.map((t) => `<a class="tag" href="#">${t}</a>`).join(" ")}</div>
      <a class="when" href="#">3 days ago</a>
    </div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>qa: bookmarks</title></head>
<body id="pinboard">
  <div id="banner"><span id="pinboard_name"><a href="#">pinboard</a></span>
    <span id="top_menu"><a href="#">popular</a> <a href="#">recent</a></span>
    <span id="banner_searchbox"><input type="text" value=""/><span class="search_button"><input type="submit" value="search"/></span></span>
  </div>
  <div id="sub_banner"><a href="#" class="selected">bookmarks</a> <a href="#">notes</a></div>
  <div class="user_navbar">
    <span class="small_username">qa</span>
    <span class="bookmark_count_box"><span class="bookmark_count" style="color:#aa5511">42</span></span>
    <div id="bmarks_page_nav">
      <a class="filter selected" href="#">all</a> <a class="filter" href="#">private</a>
      <a class="filter" href="#">unread</a> <a class="filter" href="#">untagged</a>
      <span class="rss_linkbox"><a class="rss_link" href="#">RSS</a></span>
    </div>
  </div>
  <div id="main_column">
    ${bookmark("Serendipity in Systems — 长文示例", "混排中文与 English 的描述文本。", ["reading", "systems", "中文标签"])}
    ${bookmark("A private bookmark example", "私密书签样式检查。", ["private-stuff"], "private")}
    ${bookmark("Third bookmark with a much longer title to test wrapping behaviour in narrow columns", "", ["css", "design", "qa"])}
  </div>
  <div id="right_bar">
    <table><tr onmouseover="this.style.background='#ffa'"><td><a class="tag" href="#">reading</a> <span>12</span></td></tr>
    <tr><td><a class="tag" href="#">systems</a> <span>8</span></td></tr>
    <tr><td><a class="tag" href="#">design</a> <span>5</span></td></tr></table>
  </div>
</body></html>`;
}

// Pinboard API v1 fixtures (GET, shapes per api docs / existing perf harness).
const PINBOARD_API = new Map([
  ["/v1/posts/get", '{"date":"2026-08-01T00:00:00Z","user":"qa","posts":[]}'],
  ["/v1/posts/recent", JSON.stringify({
    date: "2026-08-01T00:00:00Z", user: "qa", posts: [
      { href: "https://example.invalid/a", description: "QA 固定最近书签一", tags: "reading qa", time: "2026-08-01T10:00:00Z", shared: "yes", toread: "no", extended: "" },
      { href: "https://example.invalid/b", description: "Recent bookmark two", tags: "systems", time: "2026-07-30T10:00:00Z", shared: "no", toread: "yes", extended: "备注文本" },
      { href: "https://example.invalid/c", description: "Third recent", tags: "", time: "2026-07-29T10:00:00Z", shared: "yes", toread: "no", extended: "" },
    ],
  })],
  ["/v1/posts/suggest", '[{"popular":["reading","systems"]},{"recommended":["qa","设计","longform"]}]'],
  ["/v1/tags/get", '{"reading":12,"systems":8,"design":5,"qa":3,"中文标签":2,"longform":1}'],
  ["/v1/posts/add", '{"result_code":"done"}'],
  ["/v1/posts/update", '{"update_time":"2026-08-01T00:00:00Z"}'],
  ["/v1/user/api_token", '{"result":"0000000000000000000000000000000000000000"}'],
]);

// freedictionaryapi.com fixture for "serendipity" (shape per pbpDictNormalizeEntry).
const DICT_FIXTURE = JSON.stringify({
  word: "serendipity",
  entries: [{
    language: { code: "en", name: "English" },
    partOfSpeech: "noun",
    pronunciations: [{ type: "ipa", text: "/ˌsɛɹ.ənˈdɪp.ɪ.ti/", tags: ["UK"] }],
    forms: [{ word: "serendipities", tags: ["plural"] }],
    senses: [
      { definition: "An unsought, unintended, and/or unexpected, but fortunate, discovery.", examples: ["The discovery was pure serendipity."], tags: [], synonyms: ["fluke", "happenstance"], antonyms: [], subsenses: [] },
      { definition: "The gift of finding valuable things not sought for.", examples: [], tags: ["uncountable"], synonyms: [], antonyms: [], subsenses: [] },
    ],
  }],
  source: { url: "https://en.wiktionary.org/wiki/serendipity", license: { name: "CC BY-SA", url: "https://creativecommons.org/licenses/by-sa/4.0" } },
});

// ============================================================
// AI mock server (real HTTP on 127.0.0.1 — reachable from page AND SW)
// ============================================================

// Echo-translator: find {id,text} segment arrays anywhere in the user prompt
// (md-translate sends prompt = JSON.stringify(payload)) and answer the exact
// contract {"translations":[{"id":N,"text":"..."}]}.
function aiAnswerFor(body) {
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n");
  const user = messages.filter((m) => m.role !== "system").map((m) => m.content).join("\n");
  if (system.includes('"translations"')) {
    let segments = [];
    try {
      const payload = JSON.parse(user);
      const walk = (v) => {
        if (Array.isArray(v)) {
          if (v.length && v.every((x) => x && typeof x === "object" && "id" in x && typeof x.text === "string")) segments = v;
          else v.forEach(walk);
        } else if (v && typeof v === "object") Object.values(v).forEach(walk);
      };
      walk(payload);
    } catch { /* fall through to empty translations */ }
    // Marker goes AFTER any leading markdown structure chars: a prefix glued
    // to "- item" / "# head" / "> quote" breaks the syntax and renders the
    // echoed translation as a bare paragraph — which round one of screenshot
    // review misdiagnosed as a real "list items lose their bullets" bug
    // (blocks are whole UL/OL per PBP_AI_BLOCK_TAGS; the flaw was this mock).
    const mark = (t) => String(t).slice(0, 400).replace(/^([#>*\-+\d.\s]*)/, "$1【测译】");
    return JSON.stringify({
      translations: segments.map((s) => ({ id: s.id, text: mark(s.text) })),
    });
  }
  if (/"tags"|标签/.test(user) && /"summary"|摘要/.test(user)) {
    return '{"tags":["qa-mock","阅读","systems"],"summary":"这是 QA mock 返回的固定摘要，用于界面走查，不代表真实内容。"}';
  }
  return "这是 QA mock 的固定回答：用于 Ask/Explain 界面走查。The quick brown fox jumps over the lazy dog.";
}

function startAiMock() {
  return new Promise((resolveStart) => {
    const requests = [];
    const server = createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => { raw += c; });
      req.on("end", () => {
        let body = null;
        try { body = JSON.parse(raw); } catch { /* keep null */ }
        const content = aiAnswerFor(body);
        const msgs = Array.isArray(body?.messages) ? body.messages : [];
        requests.push({
          path: req.url, model: body?.model || null, stream: !!body?.stream,
          systemHead: msgs.filter((m) => m.role === "system").map((m) => m.content).join("\n").slice(0, 120),
          userHead: msgs.filter((m) => m.role !== "system").map((m) => m.content).join("\n").slice(0, 300),
          answerHead: content.slice(0, 200),
        });
        if (body?.stream) {
          res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
          // Split into a few deltas so streaming parsers see realistic chunking.
          const step = Math.max(1, Math.ceil(content.length / 4));
          for (let i = 0; i < content.length; i += step) {
            res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: content.slice(i, i + step) } }] })}\n\n`);
          }
          res.write("data: [DONE]\n\n");
          res.end();
        } else {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ choices: [{ message: { role: "assistant", content } }] }));
        }
      });
    });
    server.listen(0, "127.0.0.1", () => resolveStart({ server, port: server.address().port, requests }));
  });
}

// ============================================================
// Network routing (fixtures for page-context requests + audit trail)
// ============================================================

async function installRoutes(context, records, aiPort) {
  await context.route(/^https?:\/\//, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const rec = { method: request.method(), origin: url.origin, path: url.pathname };
    try {
      if (url.hostname === "127.0.0.1" && url.port === String(aiPort)) {
        rec.disposition = "ai-mock-passthrough";
        records.push(rec);
        await route.continue();
        return;
      }
      if (request.url() === ARTICLE_URL) {
        rec.disposition = "article-fixture";
        records.push(rec);
        await route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: ARTICLE_HTML });
        return;
      }
      if (url.hostname === "api.pinboard.in") {
        const body = request.method() === "GET" ? PINBOARD_API.get(url.pathname) : null;
        rec.disposition = body ? "pinboard-fixture" : "blocked-pinboard";
        records.push(rec);
        if (body) await route.fulfill({ status: 200, contentType: "application/json", body });
        else await route.abort("blockedbyclient");
        return;
      }
      if (url.hostname === "pinboard.in") {
        rec.disposition = "pinboard-page-fixture";
        records.push(rec);
        await route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: pinboardFixtureHtml() });
        return;
      }
      if (url.hostname === "freedictionaryapi.com") {
        const isSerendipity = /\/entries\/en\/serendipity$/i.test(url.pathname);
        rec.disposition = isSerendipity ? "dict-fixture" : "dict-empty";
        records.push(rec);
        await route.fulfill({ status: 200, contentType: "application/json", body: isSerendipity ? DICT_FIXTURE : '{"entries":[]}' });
        return;
      }
      rec.disposition = "blocked-external";
      records.push(rec);
      await route.abort("blockedbyclient");
    } catch (e) {
      // Route teardown races (page closing) are expected; still leave a trace
      // so a genuine fixture bug can't hide in here (Codex review risk #5).
      console.warn(`[qa-drive] route handler: ${e.message}`);
    }
  });
}

// ============================================================
// Launch + host-permission grant + seed
// ============================================================

const LAUNCH_ARGS = [
  `--disable-extensions-except=${REPO}`,
  `--load-extension=${REPO}`,
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-default-apps",
  "--disable-background-networking",
  "--disable-component-update",
  "--disable-sync",
  "--metrics-recording-only",
  "--no-pings",
  "--lang=zh-CN",
  // NB: MAP * catches literal IPs too (verified empirically 2026-08-02:
  // 127.0.0.1 got ERR_NAME_NOT_RESOLVED) — loopback must be excluded.
  "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1",
];

function launchContext(profile) {
  return chromium.launchPersistentContext(profile, {
    executablePath: chromium.executablePath(),
    headless: CONFIG.headless,
    locale: "zh-CN",
    colorScheme: "light",
    deviceScaleFactor: 1,
    viewport: { width: 1280, height: 900 },
    args: LAUNCH_ARGS,
  });
}

async function getWorker(context) {
  const existing = context.serviceWorkers().find((w) => w.url().startsWith("chrome-extension://"));
  if (existing) return existing;
  return context.waitForEvent("serviceworker", {
    predicate: (w) => w.url().startsWith("chrome-extension://"),
    timeout: TIMEOUT_MS,
  });
}

// The AI layer gates every call on chrome.permissions.contains for the target
// origin; granting host permissions needs a user gesture we cannot fake, so we
// patch the profile's extension prefs between two launches (Linux Chromium
// does not enforce pref MACs). Verified by a contains() probe after relaunch.
function grantLoopbackHostInPrefs(profile, extId) {
  const prefsPath = join(profile, "Default", "Preferences");
  const prefs = JSON.parse(readFileSync(prefsPath, "utf8"));
  const settings = prefs.extensions?.settings?.[extId];
  if (!settings) throw new Error(`extension ${extId} not found in profile prefs`);
  for (const key of ["granted_permissions", "active_permissions"]) {
    const bucket = settings[key] || (settings[key] = { api: [], explicit_host: [], manifest_permissions: [], scriptable_host: [] });
    const hosts = bucket.explicit_host || (bucket.explicit_host = []);
    for (const pattern of ["http://127.0.0.1/*", "http://localhost/*", "https://freedictionaryapi.com/*"]) {
      if (!hosts.includes(pattern)) hosts.push(pattern);
    }
  }
  writeFileSync(prefsPath, JSON.stringify(prefs));
}

// status 合法值只有 new/known（pbpVocabBatchSetStatus 会把其他值归一为 new，
// Codex 评审抓出的事实），不要写 "learning" 之类幻想值。
const VOCAB_SEED = [
  { term: "serendipity", language: "en", gloss: "意外发现珍宝的运气", status: "new", note: "来自 QA 固定文章", group: "阅读" },
  { term: "ephemeral", language: "en", gloss: "短暂的，朝生暮死的", status: "known", group: "阅读" },
  { term: "ubiquitous", language: "en", gloss: "无处不在的", status: "known" },
  { term: "呼吸", language: "zh", gloss: "breathe; breathing room", status: "new" },
];

async function seedAll(context, worker, aiPort) {
  // 1. Settings via SW (same key set persistSettings routes to local storage).
  await worker.evaluate(async ({ token, aiBase, siteTheme }) => {
    if (typeof primeSettings === "function") await primeSettings();
    await chrome.storage.local.set({
      optSyncEnabled: false,
      syncApiKeys: false,
      pinboardToken: obfuscateKey(token),
      optLang: "zh_CN",
      optTheme: "light",
      themePresetKey: siteTheme,
      optPopupFollowTheme: true,
      popupWidth: 550,
      aiProvider: "custom",
      customName: "QA Mock",
      customBaseUrl: aiBase,
      customApiKey: obfuscateKey("qa-mock-key"),
      customModel: "qa-mock",
      previewAiEnabled: true,
      previewSkimEnabled: false,
      optAiAutoTags: false,
      dictEchoEnabled: true,
      offlineQueueEnabled: true,
      optShowRecent: true,
      optShowSuggestTags: true,
      translateTargetLang: "zh-CN",
    });
  }, { token: FAKE_TOKEN, aiBase: `http://127.0.0.1:${aiPort}/v1`, siteTheme: CONFIG.siteTheme });

  // 2. Vocabulary through the real write boundary (vocab-store.js in the SW).
  await worker.evaluate(async (words) => {
    const owner = pbpDictOwnerScope("qa");
    for (const w of words) {
      await pbpVocabSaveWord(owner, {
        term: w.term, language: w.language, gloss: w.gloss,
        context: { articleUrl: "https://example.invalid/qa", articleTitle: "QA 固定文章", quote: `……${w.term}……` },
      });
      const id = pbpDictVocabKey(owner, w.language, w.term);
      if (w.status && w.status !== "new") await pbpVocabBatchSetStatus([id], owner, w.status);
      if (w.note) await pbpVocabSetNote(id, owner, w.note);
      if (w.group) await pbpVocabBatchAddGroup([id], owner, w.group);
    }
  }, VOCAB_SEED);

  // 3. Preview article payload.
  await seedPreviewData(worker);

  // 4. Per-page localStorage bootstraps (theme-early/i18n fast paths).
  await finishSeed(context, worker);
}

// Preview article payload (same shape as popup writes before opening).
// One-shot: md-preview consumes the key on load, so re-seed before EVERY
// md-preview navigation (perf-cold-sample re-seeds per open for the same reason).
async function seedPreviewData(worker) {
  await worker.evaluate(async ({ storageKey, markdown, title, url }) => {
    await chrome.storage.local.set({
      [`md_preview_data_${storageKey}`]: {
        markdown, contentHtml: "", title, url, baseUrl: url,
        tags: ["reading", "qa"], tokens: 0, hasApiKey: true,
        source: "local", math: false, forum: false, ts: Date.now(),
      },
    });
  }, { storageKey: PREVIEW_KEY, markdown: SYNTHETIC_MARKDOWN, title: ARTICLE_TITLE, url: ARTICLE_URL });
}

async function finishSeed(context, worker) {
  const page = await context.newPage();
  const extId = new URL(worker.url()).hostname;
  await page.goto(`chrome-extension://${extId}/options.html#general`, { waitUntil: "load", timeout: TIMEOUT_MS });
  await page.evaluate(async () => {
    const response = await fetch(chrome.runtime.getURL("_locales/zh_CN/messages.json"));
    const messages = await response.json();
    localStorage.setItem("pp-sync-enabled", "0");
    localStorage.setItem("pp-i18n-lang", "zh_CN");
    localStorage.setItem("pp-i18n-msgs", JSON.stringify(messages));
    localStorage.setItem("pp-logged-in", "1");
    localStorage.setItem("pp-theme", "light");
    localStorage.setItem("pp-theme-preset", "");
    localStorage.setItem("pp-theme-follow", "1");
    localStorage.setItem("pp-popup-width", "550");
    localStorage.setItem("md-preview-theme", "light");
  });
  await page.close();
}

// ============================================================
// Reporter
// ============================================================

class Reporter {
  constructor(runDir) {
    this.runDir = runDir;
    this.shotDir = join(runDir, "shots");
    mkdirSync(this.shotDir, { recursive: true });
    this.surfaces = [];
    this.network = [];
    this.shotSeq = 0;
  }
  surface(name) {
    const s = { name, states: [], consoleErrors: [], pageErrors: [], notes: [], failures: [] };
    this.surfaces.push(s);
    return s;
  }
  attach(page, s) {
    const onConsole = (m) => { if (m.type() === "error") s.consoleErrors.push(m.text()); };
    const onPageError = (e) => s.pageErrors.push(e.message);
    const onRequestFailed = (r) => s.consoleErrors.push(`requestfailed: ${r.url()} (${r.failure()?.errorText || "?"})`);
    page.on("console", onConsole);
    page.on("pageerror", onPageError);
    page.on("requestfailed", onRequestFailed);
    return () => { page.off("console", onConsole); page.off("pageerror", onPageError); page.off("requestfailed", onRequestFailed); };
  }
  async shot(page, s, state, opts = {}) {
    const file = `${String(++this.shotSeq).padStart(2, "0")}-${s.name}-${state}.png`;
    await page.screenshot({ path: join(this.shotDir, file), fullPage: !!opts.fullPage });
    s.states.push({ state, file });
    console.log(`[qa-drive]   shot: ${file}`);
    return file;
  }
  saveShotBuffer(buffer, s, state) {
    const file = `${String(++this.shotSeq).padStart(2, "0")}-${s.name}-${state}.png`;
    writeFileSync(join(this.shotDir, file), buffer);
    s.states.push({ state, file });
    console.log(`[qa-drive]   shot: ${file}`);
    return file;
  }
  finish(meta) {
    const json = { schemaVersion: 1, generatedAt: new Date().toISOString(), ...meta, surfaces: this.surfaces, network: this.network };
    writeFileSync(join(this.runDir, "report.json"), JSON.stringify(json, null, 2));
    const md = [
      `# qa-drive report — ${meta.label}`,
      `生成时间：${json.generatedAt} ｜ 表面：${meta.surfaces.join(", ")} ｜ headless=${meta.headless}`,
      "",
      ...this.surfaces.flatMap((s) => [
        `## ${s.name}`,
        ...s.states.map((st) => `- **${st.state}** → ![${st.state}](shots/${st.file})`),
        ...(s.notes.length ? ["", "备注：", ...s.notes.map((n) => `- ${n}`)] : []),
        ...(s.failures.length ? ["", "**驱动失败（harness 层）**：", ...s.failures.map((f) => `- ${f}`)] : []),
        ...(s.pageErrors.length ? ["", "**pageerror**：", ...s.pageErrors.map((e) => `- \`${e}\``)] : []),
        ...(s.consoleErrors.length ? ["", "**console.error**：", ...s.consoleErrors.slice(0, 10).map((e) => `- \`${e}\``),
          ...(s.consoleErrors.length > 10 ? [`- …共 ${s.consoleErrors.length} 条`] : [])] : []),
        "",
      ]),
      "## 网络处置汇总",
      ...Object.entries(this.network.reduce((acc, r) => {
        const k = `${r.disposition} ${r.origin}${r.path}`;
        acc[k] = (acc[k] || 0) + 1; return acc;
      }, {})).sort().map(([k, n]) => `- ${k} ×${n}`),
      "",
    ].join("\n");
    writeFileSync(join(this.runDir, "report.md"), md);
  }
}

// ============================================================
// Surface drivers (best-effort: failures recorded, run continues)
// ============================================================

// Parsed from options.html so a new tab is covered without touching the
// harness (same auto-coverage idea as sitePresetKeys); fallback keeps the
// harness alive if the markup pattern ever changes.
function optionsTabs() {
  const src = readFileSync(join(REPO, "options.html"), "utf8");
  const tabs = [...src.matchAll(/id="tab-([a-z-]+)"/g)].map((m) => m[1]);
  return tabs.length ? tabs : ["general", "popup", "bookmarks", "quick", "ai", "ai-behavior",
    "reader", "notes", "vocab", "markdown", "tags", "archive", "appearance", "storage"];
}

async function driveOptions(context, extId, rep) {
  const s = rep.surface("options");
  const page = await context.newPage();
  const detach = rep.attach(page, s);
  try {
    await page.goto(`chrome-extension://${extId}/options.html#general`, { waitUntil: "load", timeout: TIMEOUT_MS });
    await page.waitForTimeout(800);
    for (const tab of optionsTabs()) {
      try {
        await page.locator(`#tab-${tab}`).click({ timeout: 3000 });
        await page.waitForTimeout(tab === "vocab" ? 1200 : 400);
        await rep.shot(page, s, `tab-${tab}`, { fullPage: true });
      } catch (e) {
        s.failures.push(`tab-${tab}: ${e.message}`);
      }
    }
  } catch (e) {
    s.failures.push(`options open: ${e.message}`);
  } finally {
    detach();
    await page.close().catch(() => {});
  }
}

// Select the first occurrence of `text` inside #rendered-view so keyboard
// shortcuts that read the selection (d / e / 1-5) have a target.
function selectInRendered(needle) {
  const root = document.getElementById("rendered-view");
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const i = node.textContent.indexOf(needle);
    if (i < 0) continue;
    const range = document.createRange();
    range.setStart(node, i);
    range.setEnd(node, i + needle.length);
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    node.parentElement.scrollIntoView({ block: "center", behavior: "instant" });
    return true;
  }
  return false;
}

async function drivePreview(context, worker, extId, rep) {
  const s = rep.surface("preview");
  const page = await context.newPage();
  const detach = rep.attach(page, s);
  const step = async (state, fn) => {
    try { await fn(); } catch (e) { s.failures.push(`${state}: ${e.message}`); }
  };
  try {
    await seedPreviewData(worker);
    await page.goto(`chrome-extension://${extId}/md-preview.html?k=${PREVIEW_KEY}`, { waitUntil: "load", timeout: TIMEOUT_MS });
    await page.waitForFunction(() => document.querySelectorAll("#rendered-view [data-pb]").length > 0, { timeout: TIMEOUT_MS });
    await page.waitForTimeout(800);
    await rep.shot(page, s, "base");

    await step("help-overlay", async () => {
      await page.locator("#rendered-view").click({ position: { x: 20, y: 10 } });
      await page.keyboard.press("?");
      await page.waitForTimeout(500);
      await rep.shot(page, s, "help-overlay");
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
    });

    await step("search", async () => {
      await page.keyboard.press("/");
      await page.waitForTimeout(300);
      await page.keyboard.type("English");
      await page.waitForTimeout(600);
      await rep.shot(page, s, "search-open");
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
    });

    await step("dictionary", async () => {
      const found = await page.evaluate(selectInRendered, "serendipity");
      if (!found) throw new Error("selection target not found");
      await page.keyboard.press("d");
      await page.waitForTimeout(2500); // dict fixture fetch + render
      await rep.shot(page, s, "dictionary-pop");
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
    });

    await step("highlight-bar", async () => {
      const found = await page.evaluate(selectInRendered, "好的阅读器让长文变得可以呼吸");
      if (!found) throw new Error("selection target not found");
      // The creation float bar normally shows on pointerup; force it so the
      // 5-dot palette (digit legend + note button) gets a screenshot state.
      await page.evaluate(() => {
        const bar = _pbpHlEnsureBar();
        if (!bar.isConnected) document.body.appendChild(bar);
        bar.showPopover ? bar.showPopover() : (bar.style.display = "flex");
      });
      await page.waitForTimeout(400);
      await rep.shot(page, s, "highlight-bar");
      await page.evaluate(() => { const b = document.getElementById("pb-hl-bar"); b?.hidePopover?.(); });
    });

    await step("highlight", async () => {
      const found = await page.evaluate(selectInRendered, "好的阅读器让长文变得可以呼吸");
      if (!found) throw new Error("selection target not found");
      await page.keyboard.press("1");
      await page.waitForTimeout(800);
      await rep.shot(page, s, "highlight-yellow");
    });

    await step("translate", async () => {
      await page.keyboard.press("t");
      // Bilingual blocks appear as .pb-tr; give the mock round-trips time.
      try {
        await page.waitForFunction(() => document.querySelectorAll(".pb-tr").length > 0, { timeout: 20_000 });
      } catch (e) {
        const st = await page.evaluate(() => ({
          tr: document.querySelectorAll(".pb-tr").length,
          err: document.querySelectorAll(".pb-tr-err").length,
          done: document.querySelectorAll("[data-pb-tr-done]").length,
        }));
        s.notes.push(`translate 未出现 .pb-tr（tr=${st.tr} err=${st.err} done=${st.done}）`);
        await rep.shot(page, s, "translate-timeout");
        throw e;
      }
      await page.waitForTimeout(1500);
      await rep.shot(page, s, "translate-bilingual");
      await page.keyboard.press("v");
      await page.waitForTimeout(800);
      await rep.shot(page, s, "translate-view-cycle");
    });
  } catch (e) {
    s.failures.push(`preview open: ${e.message}`);
  } finally {
    detach();
    await page.close().catch(() => {});
  }
}

async function drivePinboard(context, rep) {
  const s = rep.surface("pinboard-site");
  const page = await context.newPage();
  const detach = rep.attach(page, s);
  try {
    await page.goto("https://pinboard.in/u:qa/", { waitUntil: "load", timeout: TIMEOUT_MS });
    await page.waitForTimeout(1200); // content-script theme injection
    await rep.shot(page, s, `theme-${CONFIG.siteTheme || "none"}`, { fullPage: true });
    s.notes.push(`themePresetKey=${JSON.stringify(CONFIG.siteTheme)}（--site-theme 可换）`);
  } catch (e) {
    s.failures.push(`pinboard fixture: ${e.message}`);
  } finally {
    detach();
    await page.close().catch(() => {});
  }
}

// ---- Theme matrix: user-reachable presets × light/dark UI chrome. ----
// Preset keys are parsed from options.html's preset buttons — the UMBRELLA
// keys the product actually stores ("solarized", not "solarized-dark").
// Writing variant keys into themePresetKey creates an unreachable state the
// UI never produces (the adaptive-chip "bug" a review round chased before an
// adversarial verifier traced it back to this fixture — keep it fixed).
// Adaptive umbrellas resolve their variant from optTheme at render time.

function uiPresetKeys() {
  const src = readFileSync(join(REPO, "options.html"), "utf8");
  return [...new Set([...src.matchAll(/theme-preset-btn" data-theme="([a-z0-9-]*)"/g)].map((m) => m[1]))];
}

function adaptivePresetKeys() {
  const src = readFileSync(join(REPO, "shared.js"), "utf8");
  const block = src.match(/ADAPTIVE_THEME_MAP = \{([\s\S]*?)\}/);
  return block ? [...block[1].matchAll(/([a-z0-9-]+):/g)].map((m) => m[1]) : ["flexoki", "solarized", "catppuccin"];
}

async function driveThemes(context, worker, extId, rep) {
  const s = rep.surface("themes");
  const presets = uiPresetKeys();
  const adaptive = new Set(adaptivePresetKeys());
  const setTheme = (preset, mode) => worker.evaluate(async ({ p, m }) => {
    await chrome.storage.local.set({ themePresetKey: p, optTheme: m });
  }, { p: preset, m: mode });

  // Options UI: preset × light/dark (double reload settles the theme-early
  // localStorage mirror so the shot has no boot-flash artifacts).
  const page = await context.newPage();
  const detach = rep.attach(page, s);
  try {
    for (const preset of presets) {
      for (const mode of ["light", "dark"]) {
        try {
          await setTheme(preset, mode);
          await page.goto(`chrome-extension://${extId}/options.html#appearance`, { waitUntil: "load", timeout: TIMEOUT_MS });
          await page.reload({ waitUntil: "load", timeout: TIMEOUT_MS });
          await page.waitForTimeout(350);
          await rep.shot(page, s, `options-${preset || "default"}-${mode}`);
        } catch (e) {
          s.failures.push(`options-${preset || "default"}-${mode}: ${e.message}`);
        }
      }
    }
    // md-preview follows optTheme light/dark only.
    for (const mode of ["light", "dark"]) {
      try {
        await setTheme("", mode);
        await seedPreviewData(worker);
        await page.goto(`chrome-extension://${extId}/md-preview.html?k=${PREVIEW_KEY}`, { waitUntil: "load", timeout: TIMEOUT_MS });
        await page.waitForFunction(() => document.querySelectorAll("#rendered-view [data-pb]").length > 0, { timeout: TIMEOUT_MS });
        await page.waitForTimeout(600);
        await rep.shot(page, s, `preview-${mode}`);
      } catch (e) {
        s.failures.push(`preview-${mode}: ${e.message}`);
      }
    }
    // pinboard.in site fixture: adaptive umbrellas render a different variant
    // per light/dark, so they get two shots; fixed presets get one.
    for (const preset of presets.filter(Boolean)) {
      for (const mode of adaptive.has(preset) ? ["light", "dark"] : ["light"]) {
        try {
          await setTheme(preset, mode);
          await page.goto("https://pinboard.in/u:qa/", { waitUntil: "load", timeout: TIMEOUT_MS });
          await page.waitForTimeout(700);
          await rep.shot(page, s, adaptive.has(preset) ? `site-${preset}-${mode}` : `site-${preset}`, { fullPage: true });
        } catch (e) {
          s.failures.push(`site-${preset}-${mode}: ${e.message}`);
        }
      }
    }
  } finally {
    await setTheme(CONFIG.siteTheme, "light").catch(() => {});
    detach();
    await page.close().catch(() => {});
  }
}

// ---- Real toolbar popup via CDP (lifted from scripts/perf-cold-sample.mjs,
// trimmed to "open, wait ready, screenshot") — headed only. ----

function createTargetSession(browserCdp, sessionId) {
  let commandId = 0;
  const pending = new Map();
  const eventHandlers = new Set();
  const onMessage = (event) => {
    if (event.sessionId !== sessionId) return;
    const message = JSON.parse(event.message);
    if (message.id && pending.has(message.id)) {
      const entry = pending.get(message.id);
      pending.delete(message.id);
      clearTimeout(entry.timer);
      if (message.error) entry.reject(new Error(message.error.message));
      else entry.resolve(message.result);
      return;
    }
    for (const handler of eventHandlers) handler(message);
  };
  browserCdp.on("Target.receivedMessageFromTarget", onMessage);
  return {
    onEvent(handler) { eventHandlers.add(handler); },
    async send(method, params = {}) {
      const id = ++commandId;
      const reply = new Promise((resolveReply, rejectReply) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          rejectReply(new Error(`${method} timed out`));
        }, TIMEOUT_MS);
        pending.set(id, { resolve: resolveReply, reject: rejectReply, timer });
      });
      await browserCdp.send("Target.sendMessageToTarget", { sessionId, message: JSON.stringify({ id, method, params }) });
      return reply;
    },
    close() {
      browserCdp.off("Target.receivedMessageFromTarget", onMessage);
      for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(new Error("target session closed")); }
      pending.clear();
    },
  };
}

async function drivePopup(context, worker, extId, rep) {
  const s = rep.surface("popup");
  const active = await context.newPage();
  const detach = rep.attach(active, s);
  let browserCdp = null;
  let session = null;
  let targetId = null;
  try {
    await active.goto(ARTICLE_URL, { waitUntil: "load", timeout: TIMEOUT_MS });
    await active.bringToFront();
    browserCdp = await context.browser().newBrowserCDPSession();
    await browserCdp.send("Target.setDiscoverTargets", { discover: true });
    const popupUrl = `chrome-extension://${extId}/popup.html`;

    const found = new Promise((resolveFound, rejectFound) => {
      const timer = setTimeout(() => rejectFound(new Error("popup target not seen")), TIMEOUT_MS);
      const onTarget = ({ targetInfo }) => {
        if (targetInfo.type === "page" && targetInfo.url === popupUrl) {
          clearTimeout(timer);
          browserCdp.off("Target.targetCreated", onTarget);
          browserCdp.off("Target.targetInfoChanged", onTarget);
          resolveFound(targetInfo);
        }
      };
      browserCdp.on("Target.targetCreated", onTarget);
      browserCdp.on("Target.targetInfoChanged", onTarget);
    });

    await worker.evaluate((timeout) => Promise.race([
      chrome.action.openPopup(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("openPopup timed out")), timeout)),
    ]), TIMEOUT_MS);
    const target = await found;
    targetId = target.targetId;
    const { sessionId } = await browserCdp.send("Target.attachToTarget", { targetId, flatten: false });
    session = createTargetSession(browserCdp, sessionId);
    session.onEvent((message) => {
      if (message.method === "Runtime.exceptionThrown") {
        s.pageErrors.push(message.params?.exceptionDetails?.exception?.description || "popup exception");
      }
    });
    await session.send("Runtime.enable");
    await session.send("Page.enable");

    const readyExpr = `(() => {
      const main = document.getElementById("main-section");
      const url = document.getElementById("url-input");
      return !!(main && !main.classList.contains("hidden") && url && url.value === ${JSON.stringify(ARTICLE_URL)});
    })()`;
    const deadline = Date.now() + TIMEOUT_MS;
    for (;;) {
      const r = await session.send("Runtime.evaluate", { expression: readyExpr, returnByValue: true });
      if (r.result?.value === true) break;
      if (Date.now() > deadline) throw new Error("popup did not become ready");
      await new Promise((r2) => setTimeout(r2, 100));
    }
    await new Promise((r2) => setTimeout(r2, 1200)); // suggest/status settle
    const image = await session.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    rep.saveShotBuffer(Buffer.from(image.data, "base64"), s, "toolbar");
    s.notes.push("真实工具栏弹窗（chrome.action.openPopup + CDP）。popup 的 Pinboard 请求经 SW 代理；本环境实测 context.route 连 SW 请求也拦到（fixture 标签可见）——这是观测行为非官方保证，若某次回归失效会表现为失败态截图 + 处置汇总缺 pinboard-fixture 条目，不会假绿");
  } catch (e) {
    s.failures.push(`popup: ${e.message}`);
  } finally {
    try { if (session) await session.send("Runtime.evaluate", { expression: "window.close()" }).catch(() => {}); } catch {}
    if (session) session.close();
    if (browserCdp && targetId) await browserCdp.send("Target.closeTarget", { targetId }).catch(() => {});
    if (browserCdp) await browserCdp.detach().catch(() => {});
    detach();
    await active.close().catch(() => {});
  }
}

// ============================================================
// Main
// ============================================================

const runDir = join(REPORT_ROOT, CONFIG.label);
// Same label overwrites, but the previous run survives one generation as
// <label>-prev (Codex review: silent rm of a kept baseline is a footgun).
const prevDir = `${runDir}-prev`;
if (existsSync(runDir)) {
  rmSync(prevDir, { recursive: true, force: true });
  renameSync(runDir, prevDir);
}
mkdirSync(runDir, { recursive: true });
const rep = new Reporter(runDir);
const profile = join(runDir, ".profile");

const { server: aiServer, port: aiPort, requests: aiRequests } = await startAiMock();
console.log(`[qa-drive] AI mock on http://127.0.0.1:${aiPort}/v1 (chat/completions)`);

let context = null;
try {
  // Phase 1: create profile + seed, then close so we can patch prefs.
  console.log("[qa-drive] phase 1: launch, seed state");
  context = await launchContext(profile);
  await installRoutes(context, rep.network, aiPort);
  let worker = await getWorker(context);
  const extId = new URL(worker.url()).hostname;
  console.log(`[qa-drive] extension: ${extId}`);
  await new Promise((r) => setTimeout(r, 1200));
  await seedAll(context, worker, aiPort);
  await context.close();
  context = null;

  // Phase 2: grant loopback host permission in prefs, relaunch, verify.
  console.log("[qa-drive] phase 2: grant loopback host permission, relaunch");
  grantLoopbackHostInPrefs(profile, extId);
  context = await launchContext(profile);
  await installRoutes(context, rep.network, aiPort);
  worker = await getWorker(context);
  // Probe EVERY origin the prefs patch claims to grant (Codex review: a
  // single-origin probe can green-light a half-applied grant).
  const grants = await worker.evaluate(async (origins) => {
    const out = {};
    for (const o of origins) out[o] = await chrome.permissions.contains({ origins: [o] });
    return out;
  }, ["http://127.0.0.1/*", "http://localhost/*", "https://freedictionaryapi.com/*"]);
  const granted = Object.values(grants).every(Boolean);
  console.log(`[qa-drive] host permission grants: ${JSON.stringify(grants)}`);
  if (!granted) console.warn("[qa-drive] WARN: prefs grant did not (fully) stick — AI/dictionary states will fail with host_permission");
  worker.on("console", (m) => {
    if (m.type() === "error") rep.network.push({ disposition: "sw-console-error", origin: "sw", path: m.text().slice(0, 160) });
  });

  // Surfaces
  for (const surface of CONFIG.surfaces) {
    console.log(`[qa-drive] surface: ${surface}`);
    if (surface === "options") await driveOptions(context, extId, rep);
    else if (surface === "preview") await drivePreview(context, worker, extId, rep);
    else if (surface === "pinboard") await drivePinboard(context, rep);
    else if (surface === "popup") await drivePopup(context, worker, extId, rep);
    else if (surface === "themes") await driveThemes(context, worker, extId, rep);
    else console.warn(`[qa-drive] unknown surface: ${surface}`);
  }

  writeFileSync(join(runDir, "ai-requests.json"), JSON.stringify(aiRequests, null, 2));
  // Provenance (Codex review: a report you can't tie to a commit/browser
  // version can't anchor comparisons later).
  const git = (args) => { try { return execFileSync("git", args, { cwd: REPO, encoding: "utf8" }).trim(); } catch { return null; } };
  rep.finish({
    label: CONFIG.label,
    surfaces: CONFIG.surfaces,
    headless: CONFIG.headless,
    siteTheme: CONFIG.siteTheme,
    extensionId: extId,
    hostPermissionGrants: grants,
    aiRequests: aiRequests.length,
    environment: {
      commit: git(["rev-parse", "--short", "HEAD"]),
      dirty: (git(["status", "--short"]) || "").split("\n").filter(Boolean).length,
      chromium: context.browser()?.version() || null,
      node: process.version,
      platform: process.platform,
    },
  });
  console.log(`[qa-drive] report: ${join(runDir, "report.md")}`);
  const failures = rep.surfaces.reduce((n, s) => n + s.failures.length, 0);
  const errors = rep.surfaces.reduce((n, s) => n + s.pageErrors.length + s.consoleErrors.length, 0);
  console.log(`[qa-drive] done: ${rep.shotSeq} shots, ${failures} driver failure(s), ${errors} page/console error(s)`);
} catch (error) {
  console.error(`[qa-drive] fatal: ${error.message}`);
  process.exitCode = 2;
} finally {
  await context?.close().catch(() => {});
  aiServer.close();
  if (!CONFIG.keepProfile) rmSync(profile, { recursive: true, force: true });
}
