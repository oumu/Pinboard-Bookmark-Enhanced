// md-embed.js — export image embedding (spec 2026-07-12 §2).
// ── PURE SECTION (no DOM/chrome/fetch; loaded by tests/md-convert-tests.html) ──
const PBP_EMBED_LIMITS = { maxImages: 50, maxOrigins: 10, perImageBytes: 3 * 1024 * 1024, totalBytes: 25 * 1024 * 1024, outputBytes: 40 * 1024 * 1024, timeoutMs: 10000, concurrency: 4, wantDataUri: true };
const PBP_EMBED_MIME_EXT = { "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp" };
// Same IMG regex + fence-skip as md-convert.js applyImagePolicy — keep in sync.
const _PBP_EMBED_IMG = /!\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/g;

function _pbpEmbedLines(md, onLine) {
  let inFence = false;
  return (md || "").split("\n").map((line) => {
    if (line.match(/^\s*(```|~~~)/)) { inFence = !inFence; return line; }
    return inFence ? line : _pbpEmbedMasked(line, onLine);
  }).join("\n");
}

// Codex-P3: 行内 code span、HTML 注释与转义 \![ 内的伪图片语法不得进入扫描/重写——
// 它们会驱动权限申请与联网抓取。掩蔽为 NUL 定界占位符（\x00M<i>\x00），处理后还原。
// 顺序：注释先（可能跨多个反引号）、code span 次（多反引号 span 用相同数量反引号定界，
// 行内非贪婪，双/三反引号 span 不再被单反引号正则穿透）、转义 \![ 最后。
// NUL 在正常 markdown 行内不可能出现，与正文字面（如 " M3 "）天然无碰撞；输入中若携带
// 字面 NUL 先剥离（HTML 管线里 NUL 本就会被替换成 U+FFFD，剥掉即根除碰撞面）。
// 万一 stash 索引缺席（不应发生），restore 的 fallback 只保留占位符原样，绝不注入 "undefined"。
function _pbpEmbedMasked(line, onLine) {
  const stash = [];
  const stow = (m) => { stash.push(m); return "\x00M" + (stash.length - 1) + "\x00"; };
  const masked = line.replace(/\x00/g, "")
    .replace(/<!--[\s\S]*?-->/g, stow)
    .replace(/(`+)[\s\S]*?\1/g, stow)
    .replace(/\\!\[/g, stow);
  return onLine(masked).replace(/\x00M(\d+)\x00/g, (match, i) => stash[+i] !== undefined ? stash[+i] : match);
}

function pbpEmbedScan(md, baseUrl) {
  const seen = new Set(), candidates = [], blobs = [], kept = [], origins = [];
  _pbpEmbedLines(md, (line) => {
    line.replace(_PBP_EMBED_IMG, (whole, alt, src) => {
      let abs = src;
      if (baseUrl && !/^[a-z][a-z0-9+.-]*:/i.test(src) && !src.startsWith("//")) {
        try { abs = new URL(src, baseUrl).href; } catch (_) { return whole; }
      }
      if (seen.has(abs)) return whole;
      seen.add(abs);
      if (/^data:/i.test(abs)) return whole;                       // already inline
      if (/^blob:/i.test(abs)) { blobs.push(abs); return whole; }  // dead outside page → alt
      let origin = "";
      try { origin = new URL(abs).origin; } catch (_) { kept.push(abs); return whole; }
      if (!/^https:/i.test(abs)
          || candidates.length >= PBP_EMBED_LIMITS.maxImages
          || (!origins.includes(origin) && origins.length >= PBP_EMBED_LIMITS.maxOrigins)) {
        kept.push(abs);
        return whole;
      }
      if (!origins.includes(origin)) origins.push(origin);
      candidates.push(abs);
      return whole;
    });
    return line;
  });
  return { candidates, blobs, kept, origins };
}

// A4（预览修复缓存复用，Codex 裁决版）：canonical URL key。markdown 原文 src 与
// 浏览器解析后的 img.currentSrc 是同一图片的两种字符串形（marked 会 encodeURI、
// 浏览器会归一 ".." 并 punycode 化 IDN host）——缓存写入与查询两侧统一过这一个
// 函数才可能命中。encodeURI 后把 %25 还原成 %（已编码的输入不被双编码，幂等），
// 再经 URL 序列化归一。解析不了的（如 IPv6 方括号 host 被 encodeURI 破坏）原值
// 兜底——两侧同函数同兜底，仍然一致。
function pbpEmbedCanonicalUrl(u) {
  try { return new URL(encodeURI(u).replace(/%25/g, "%")).href; } catch (_) { return u; }
}

// A4：预览修复缓存条目对导出是否可信。三态判定的"有效性"半边（decoded 由
// <img> 的 load 事件证明过、data URI 与真实字节数俱在）；预算 reserve 由调用方
// 单独做——reserve 失败不是 cache miss，是"共享预算已不足"，重抓只会同样失败，
// 必须直接放弃该图而不是转入网络流（Codex 裁决必改 1）。
function pbpEmbedCacheEntryValid(entry) {
  return !!(entry && entry.decoded === true && typeof entry.dataUri === "string"
    && entry.dataUri.startsWith("data:") && Number.isFinite(entry.byteLength) && entry.byteLength >= 0);
}

// 导出诚实提示的计数器（方案A，Codex 终审版）：统计"读者已亲眼看着加载失败"的图片
// 链接会有几条以 URL 形式留在 keep 类导出产物里。observed 存浏览器解析后的绝对 URL
// （error 时刻的 img.currentSrc）；candidates 和 kept（超 50 图/10 origin 上限、非 https
// 的条目）在 keep 导出里同样以链接形式出走，所以两个清单都算。只做正向证据——预览图片
// 是 loading="lazy"，没滚到的图不会触发 error——返回 0 绝不代表"所有图片安全"。
function pbpEmbedBrokenCount(md, baseUrl, observed) {
  if (!observed || !observed.size) return 0;
  const scan = pbpEmbedScan(md, baseUrl);
  const hits = new Set();
  for (const u of scan.candidates.concat(scan.kept)) {
    let abs = u;
    try { abs = new URL(u, baseUrl || undefined).href; } catch (_) {}
    // marked 会对它输出的 href 做 encodeURI（见 md-epub.js 同款处理），浏览器侧
    // 记录的 key 可能是 markdown 原文的编码变体，三种键形都试。
    if (observed.has(u) || observed.has(abs) || observed.has(encodeURI(u))) hits.add(abs);
  }
  return hits.size;
}

// map: absUrl -> replacement src（data URI 或相对路径）；值为 null → 整图退化为 alt 文本。
// outBudget: pbpEmbedBudget(PBP_EMBED_LIMITS.outputBytes) —— 每次替换按替换串长度记账（Codex-P2），
// 预算耗尽的位置保留原样并计入 dropped。
function pbpEmbedRewrite(md, map, baseUrl, outBudget) {
  let dropped = 0;
  const out = _pbpEmbedLines(md, (line) =>
    line.replace(_PBP_EMBED_IMG, (whole, alt, src) => {
      let abs = src;
      if (baseUrl && !/^[a-z][a-z0-9+.-]*:/i.test(src) && !src.startsWith("//")) {
        try { abs = new URL(src, baseUrl).href; } catch (_) { return whole; }
      }
      if (!(abs in map)) return whole;
      if (map[abs] === null) return alt || "";                       // blob → alt（计数由调用方按 blobs.length 承担）
      const repl = "![" + alt + "](" + map[abs] + ")";
      if (outBudget && !outBudget.reserve(repl.length)) { dropped++; return whole; }
      return repl;
    }));
  return { md: out, dropped };
}

function pbpEmbedBudget(totalBytes) {
  let used = 0;
  return {
    reserve(n) { if (!Number.isFinite(n) || n < 0 || used + n > totalBytes) return false; used += n; return true; },
    // Refund bytes that never became a result. Streaming reserves chunk by
    // chunk, so an image that is aborted (over perImageBytes, timed out,
    // undecodable) has already charged the pool for everything it read --
    // up to perImageBytes each, and TWICE for the hotlink subset, since the
    // Referer retry round draws from this SAME budget. A handful of oversized
    // photos would otherwise exhaust totalBytes and strand every ordinary
    // image that follows as a remote URL.
    release(n) { if (!Number.isFinite(n) || n <= 0) return; used = Math.max(0, used - n); },
    used() { return used; }
  };
}
// ── end PURE SECTION ──
// ── RUNTIME (chrome/fetch) ──
// limits 参数注入（默认生产值）——tests/md-embed-tests.html 用短超时/小上限驱动超时与预算路径
async function _pbpEmbedFetchOne(url, budget, limits = PBP_EMBED_LIMITS) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), limits.timeoutMs); // 罩住整个 body 读取
  // Reservation bookkeeping: only a call that hands its bytes back keeps them
  // charged to the shared pool. Every other exit -- over-cap abort, timeout,
  // network throw, a body the FileReader cannot encode -- refunds in finally.
  let reserved = 0, kept = false;
  try {
    // cacheMode: normally "force-cache" (the images were just painted -- reuse
    // the disk cache, no second download). The hotlink retry MUST override it
    // to "reload": the failed <img> load already put a 403 for that exact URL
    // in the HTTP cache, and force-cache happily replays that failure without
    // ever hitting the network -- so the Referer rule would appear to do
    // nothing (found in the real-extension E2E, not by reading the code).
    const resp = await fetch(url, {
      signal: ctl.signal, credentials: "omit",
      cache: limits.cacheMode || "force-cache",
      redirect: "error",
    });
    if (!resp.ok) return null;
    const mime = (resp.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!(mime in PBP_EMBED_MIME_EXT)) return null;
    const reader = resp.body.getReader();
    const chunks = []; let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (size + value.length > limits.perImageBytes || !budget.reserve(value.length)) {
        ctl.abort(); return null;   // 流式计数，不信 Content-Length（spec §2 F4）
      }
      reserved += value.length;
      size += value.length; chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let off = 0; for (const c of chunks) { bytes.set(c, off); off += c.length; }
    // Codex-C4: EPUB (keepUrls) only needs {mime, bytes} — the data URI is never
    // referenced, but building it doubles peak memory (base64 string ~4/3x bytes)
    // for nothing. limits.wantDataUri === false skips the FileReader round-trip.
    if (limits.wantDataUri === false) { kept = true; return { mime, bytes }; }
    const dataUri = await new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result); fr.onerror = () => rej(fr.error);
      fr.readAsDataURL(new Blob([bytes], { type: mime }));
    });
    kept = true;
    return { dataUri, mime, bytes };
  } catch (e) {
    // null = "not embeddable, ship the remote URL instead". Leave the platform
    // error's shape behind (AbortError on timeout, TypeError on a refused
    // fetch/redirect, the FileReader's error) -- never the image URL.
    console.warn("[embed] image fetch failed:", e && e.name, e && e.message);
    return null;
  } finally { clearTimeout(timer); if (!kept) budget.release(reserved); }
}

// sharedBudget (hotlink round): an optional caller-owned pbpEmbedBudget. The
// two-round export flow (plain fetch, then a Referer-DNR retry of the failed
// subset) must draw from ONE totalBytes pool -- letting each round build its
// own would double the ceiling (Codex review). Omitted -> per-call budget,
// exactly the old behavior (tests and single-round callers unchanged).
async function pbpEmbedFetchAll(candidates, limits = PBP_EMBED_LIMITS, sharedBudget) {
  const out = new Map();
  if (!candidates.length) return out;
  const budget = sharedBudget || pbpEmbedBudget(limits.totalBytes);
  const queue = candidates.slice();
  await Promise.all(Array.from({ length: limits.concurrency }, async () => {
    for (let url = queue.shift(); url !== undefined; url = queue.shift()) {
      const got = await _pbpEmbedFetchOne(url, budget, limits);
      if (got) out.set(url, got);
    }
  }));
  return out;
}

// ---- Hotlink-guard Referer retry (hotlink round; Codex-adjudicated design).
// Some image CDNs reject EMPTY-Referer requests outright (verified live on
// cdnfile.sspai.com: any non-empty Referer passes, empty is refused) -- and an
// extension page can only ever send an empty Referer (chrome-extension://
// origins are never emitted as referrers, and the preview additionally forces
// referrerpolicy=no-referrer, which is the CORRECT default for the opposite,
// far more common "foreign referers blocked / empty allowed" variant). Header
// spoofing from the page is impossible (Referer is a forbidden header), so the
// fix is a SHORT-LIVED declarativeNetRequest session rule that sets Referer to
// the article's own origin, scoped as narrowly as the API allows:
//   - only the failed images' registrable domains (requestDomains),
//   - only xmlhttprequest (the fetch below; never a blanket resource type),
//   - only THIS preview tab (tabIds), so no other extension surface or page
//     ever sees the rewrite,
//   - a PRIVATE rule id per run (never a shared constant): two runs overlap
//     routinely (the reading-view auto-fix and an export click, or two lazy-
//     load batches), and with one shared id the second run's remove+add would
//     silently void the first run's rule, then the first run's finally would
//     delete the SECOND run's live rule (Codex acceptance HIGH-1),
//   - removed in finally AND on pagehide AND by the background sweeper -- a
//     session rule outlives the JS frame that created it, so `finally` alone
//     cannot be the only cleanup (Codex acceptance HIGH-2): a tab closed or
//     navigated mid-fetch would strand a rule that keeps rewriting Referer for
//     whatever loads in that tab id next.
// declarativeNetRequestWithHostAccess keys the whole thing to host access the
// user already granted per-origin via chrome.permissions.request -- no
// wildcard, no install-time warning, matching the CLAUDE.md network invariant.
// Referer value is the page ORIGIN + "/", never the full path/query (privacy:
// the CDN learns which site embedded it -- which it inherently knows -- not
// which article).
// Rule ids are allocated by the SERVICE WORKER, never by this page. DNR's rule
// namespace is extension-GLOBAL while a page-local counter is not: two preview
// tabs would both start at the range's first id, and the second one's
// remove+add would void the first one's live rule (Codex confirm-review
// HIGH-1 -- the single-page concurrency test missed this entirely). The SW is
// the one serialized context that can hand out ids that are unique across
// every preview tab, and it derives the rule's tabId from sender.tab (a page
// cannot ask for a rule scoped to someone else's tab).
const _pbpImgFixLiveRuleIds = new Set(); // ids this page owns right now (pagehide cleanup)

function _pbpImgFixDomains(urls) {
  const domains = new Set();
  for (const u of urls) {
    try {
      const p = new URL(u);
      if (p.protocol === "https:") domains.add(p.hostname);
    } catch (_) {}
  }
  return [...domains];
}

// Last-ditch cleanup for rules this page still owns when it goes away mid-run
// (close/navigate/discard). pagehide is the only unload event that fires
// reliably on bfcache + tab close; the call is best-effort (the API is async
// and the page may die first), which is exactly why background.js ALSO sweeps.
// A fresh preview document drops whatever the PREVIOUS document in this tab
// left behind. The one navigation Chrome never reports as a URL change is a
// same-URL reload, so the SW's navigation sweep cannot see it -- this is that
// case's cleanup (confirm-review 3). Fire-and-forget: a failure only leaves a
// rule that the tab-close sweep will collect anyway.
if (typeof window !== "undefined" && typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
  try { chrome.runtime.sendMessage({ type: "imgFixResetTab" })?.catch?.(() => {}); } catch (_) {}
}

if (typeof window !== "undefined" && typeof chrome !== "undefined" && chrome.runtime) {
  window.addEventListener("pagehide", () => {
    if (!_pbpImgFixLiveRuleIds.size) return;
    // Best-effort only (an async API in an unload handler may not land) -- the
    // SW's own tabs.onRemoved / navigation sweeps are the actual guarantee.
    try {
      chrome.runtime.sendMessage({ type: "imgFixRemoveReferer", ruleIds: [..._pbpImgFixLiveRuleIds] })
        ?.catch?.(() => {});
    } catch (_) {}
  });
}

async function pbpImgFixWithReferer(urls, refererOrigin, limits = PBP_EMBED_LIMITS, sharedBudget) {
  const domains = _pbpImgFixDomains(urls);
  let origin = "";
  try {
    const p = new URL(refererOrigin);
    if (p.protocol === "https:" || p.protocol === "http:") origin = p.origin;
  } catch (_) {}
  if (!domains.length || !origin) return new Map();
  if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.sendMessage) return new Map();
  // The SW allocates a globally-unique id AND derives the tab scope from
  // sender.tab -- no tabId travels in this message. A failure here (no
  // permission, no tab, SW gone) degrades to "not fixed", never throws.
  let ruleId = null;
  try {
    const resp = await chrome.runtime.sendMessage({ type: "imgFixInstallReferer", domains, origin });
    if (!resp || !resp.ok || typeof resp.ruleId !== "number") return new Map();
    ruleId = resp.ruleId;
  } catch (_) { return new Map(); }
  _pbpImgFixLiveRuleIds.add(ruleId);
  try {
    // cacheMode:"reload" is load-bearing here -- see _pbpEmbedFetchOne.
    return await pbpEmbedFetchAll(urls, { ...limits, cacheMode: "reload" }, sharedBudget);
  } finally {
    _pbpImgFixLiveRuleIds.delete(ruleId);
    try { await chrome.runtime.sendMessage({ type: "imgFixRemoveReferer", ruleIds: [ruleId] }); } catch (_) {}
  }
}
