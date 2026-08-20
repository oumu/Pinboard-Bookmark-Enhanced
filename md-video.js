// ============================================================
// Pinboard Bookmark Enhanced — md-video.js (md-preview only)
// Video + subtitles panel for video-page bookmarks. PURE section first
// (URL detect / InnerTube request builders / timedtext parsers /
// paragraph merge) — loaded file:// by tests/md-video-tests.html.
// Runtime section (fetch + panel DOM) is guarded behind typeof checks.
// Subtitle fetches run in the preview page itself after a click-time
// exact-origin grant for https://www.youtube.com/* — never in the
// background, never with credentials.
// ============================================================

// ── PURE SECTION (no DOM/chrome/fetch at load) ──

function pbpVideoDetect(pageUrl) {
  let u;
  try { u = new URL(String(pageUrl || "")); } catch (_) { return null; }
  const host = u.hostname.replace(/^www\.|^m\./, "");
  const ID = /^[\w-]{6,20}$/;
  if (host === "youtube.com") {
    const v = u.searchParams.get("v");
    if (v && ID.test(v)) return { provider: "youtube", videoId: v };
    const m = u.pathname.match(/^\/shorts\/([\w-]{6,20})/);
    if (m) return { provider: "youtube", videoId: m[1] };
    return null;
  }
  if (host === "youtu.be") {
    const m = u.pathname.match(/^\/([\w-]{6,20})/);
    return m ? { provider: "youtube", videoId: m[1] } : null;
  }
  if (host === "bilibili.com") {
    let bvid = "";
    const m = u.pathname.match(/\/video\/(BV[\w]{8,12})/i);
    if (m) bvid = m[1];
    else if (/^BV[\w]{8,12}$/i.test(u.searchParams.get("bvid") || "")) bvid = u.searchParams.get("bvid");
    if (!bvid) return null;
    const p = parseInt(u.searchParams.get("p") || "1", 10);
    return { provider: "bilibili", bvid: bvid, part: Number.isFinite(p) && p > 0 ? p : 1 };
  }
  return null;
}

// Anonymous InnerTube client chain (community-standard: mobile/TV client
// impersonation needs no API key and no login). Order matters: IOS first
// (most reliable for captions as of 2026-08), MWEB last.
const PBP_YT_CLIENTS = [
  { name: "IOS", clientName: "5", clientVersion: "20.10.3" },
  { name: "ANDROID", clientName: "3", clientVersion: "20.10.38" },
  { name: "TVHTML5_SIMPLY_EMBEDDED_PLAYER", clientName: "85", clientVersion: "2.0" },
  { name: "MWEB", clientName: "2", clientVersion: "2.20260101.00.00" },
];

function pbpYtPlayerRequest(videoId, clientIdx, hl) {
  const c = PBP_YT_CLIENTS[clientIdx];
  return {
    url: "https://www.youtube.com/youtubei/v1/player?prettyPrint=false",
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      context: { client: { clientName: c.clientName, clientVersion: c.clientVersion, hl: hl || "en", gl: "US" } },
      videoId: videoId, contentCheckOk: true, racyCheckOk: true
    })
  };
}

function pbpYtExtractTracks(playerJson) {
  const list = playerJson && playerJson.captions && playerJson.captions.playerCaptionsTracklistRenderer
    && playerJson.captions.playerCaptionsTracklistRenderer.captionTracks;
  if (!Array.isArray(list)) return [];
  return list.filter((tr) => tr && tr.baseUrl).map((tr) => ({
    baseUrl: String(tr.baseUrl),
    lang: String(tr.languageCode || ""),
    label: (tr.name && (tr.name.simpleText || (Array.isArray(tr.name.runs) && tr.name.runs[0] && tr.name.runs[0].text))) || String(tr.languageCode || ""),
    asr: tr.kind === "asr"
  }));
}

function pbpYtPickTrack(tracks, uiLang) {
  if (!Array.isArray(tracks) || !tracks.length) return null;
  const base = String(uiLang || "").toLowerCase().split("-")[0];
  let best = null, bestScore = -1;
  for (const tr of tracks) {
    let score = 0;
    if (base && String(tr.lang).toLowerCase().split("-")[0] === base) score += 100;
    if (!tr.asr) score += 50;
    if (score > bestScore) { bestScore = score; best = tr; }
  }
  return best;
}

// Two full decode passes: timedtext double-encodes entities
// ("&amp;amp;" -> pass 1 "&amp;" -> pass 2 "&"), so a single ordered
// replace chain cannot resolve it — each pass must independently handle
// numeric refs before named refs, then the whole thing runs twice.
function _pbpVideoDecodeEntities(s) {
  const once = (x) => String(x)
    .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n))
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
  return once(once(s));
}

function pbpYtParseTimedtextXml(xmlText) {
  const out = [];
  // Capture the tag's attribute blob and the inner text separately, then
  // pull start/dur out of the blob regardless of attribute order — a single
  // combined regex with a greedy [^>]* before an optional dur group never
  // backtracks into it (the match already succeeds with dur unmatched).
  const re = /<text\b([^>]*)>([\s\S]*?)<\/text>/g;
  let m;
  while ((m = re.exec(String(xmlText || ""))) !== null) {
    const attrs = m[1];
    const startM = attrs.match(/\bstart="([\d.]+)"/);
    if (!startM) continue;
    const durM = attrs.match(/\bdur="([\d.]+)"/);
    const from = parseFloat(startM[1]);
    const dur = durM ? parseFloat(durM[1]) : 0;
    const content = _pbpVideoDecodeEntities(m[2].replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
    if (content) out.push({ from, to: from + dur, content });
  }
  return out;
}

function pbpYtParseJson3(jsonText) {
  let data;
  try { data = JSON.parse(jsonText); } catch (_) { return []; }
  if (!data || !Array.isArray(data.events)) return [];
  const out = [];
  for (const ev of data.events) {
    if (!ev || !Array.isArray(ev.segs)) continue;
    const content = ev.segs.map((sg) => (sg && sg.utf8) || "").join("").replace(/\s+/g, " ").trim();
    if (!content) continue;
    const from = (ev.tStartMs || 0) / 1000;
    const to = from + (ev.dDurationMs || 0) / 1000;
    out.push({ from, to, content });
  }
  return out;
}

// Reading-paragraph merge for the Markdown copy (the interactive panel keeps
// raw segments): break only after a segment that ends on sentence-final
// punctuation; any trailing partial run flushes as its own paragraph.
function pbpVideoMergeParagraphs(segments) {
  const out = [];
  let buf = [];
  for (const seg of segments || []) {
    buf.push(seg.content);
    if (/[.!?。！？…]["')\]]?$/.test(seg.content)) { out.push(buf.join(" ").replace(/\s+/g, " ").trim()); buf = []; }
  }
  if (buf.length) out.push(buf.join(" ").replace(/\s+/g, " ").trim());
  return out.filter(Boolean);
}

function pbpVideoFmtTime(sec) {
  sec = Math.max(0, Math.floor(+sec || 0));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const p2 = (n) => (n < 10 ? "0" : "") + n;
  return h ? h + ":" + p2(m) + ":" + p2(s) : m + ":" + p2(s);
}

function pbpVideoTranscriptMarkdown(segments, meta) {
  meta = meta || {};
  const lines = ["## Transcript" + (meta.trackLabel ? " (" + meta.trackLabel + ")" : "")];
  if (meta.url) lines.push("", "> " + (meta.title ? "[" + meta.title + "](" + meta.url + ")" : "<" + meta.url + ">"));
  lines.push("");
  lines.push(pbpVideoMergeParagraphs(segments).join("\n\n"));
  return lines.join("\n");
}

// Orchestrator: player (4-client chain) -> tracks -> pick -> caption body
// (XML first, fmt=json3 fallback). fetchFn injectable for tests; every
// network step is fail-soft and reports a coarse error code the UI maps.
async function pbpYtFetchTranscript(videoId, opts) {
  opts = opts || {};
  const fetchFn = opts.fetchFn || ((u, o) => fetch(u, o));
  let playerJson = null;
  for (let i = 0; i < PBP_YT_CLIENTS.length; i++) {
    const req = pbpYtPlayerRequest(videoId, i, opts.uiLang);
    try {
      const resp = await fetchFn(req.url, { method: req.method, headers: req.headers, body: req.body, credentials: "omit", signal: AbortSignal.timeout(15000) });
      if (!resp.ok) continue;
      const json = await resp.json();
      if (json && typeof json === "object") { playerJson = json; break; }
    } catch (_) { /* next client */ }
  }
  if (!playerJson) return { error: "player" };
  const tracks = pbpYtExtractTracks(playerJson);
  if (!tracks.length) return { error: "no-tracks" };
  const track = opts.pickBaseUrl ? (tracks.find((tr) => tr.baseUrl === opts.pickBaseUrl) || pbpYtPickTrack(tracks, opts.uiLang)) : pbpYtPickTrack(tracks, opts.uiLang);
  const segments = await pbpYtFetchCaptionBody(track.baseUrl, fetchFn);
  if (!segments.length) return { error: "caption-body", tracks, track };
  return { tracks, track, segments };
}

async function pbpYtFetchCaptionBody(baseUrl, fetchFn) {
  fetchFn = fetchFn || ((u, o) => fetch(u, o));
  try {
    const r1 = await fetchFn(baseUrl, { credentials: "omit", signal: AbortSignal.timeout(15000) });
    if (r1.ok) {
      const fromXml = pbpYtParseTimedtextXml(await r1.text());
      if (fromXml.length) return fromXml;
    }
  } catch (_) { /* fall through to json3 */ }
  try {
    const jUrl = baseUrl + (baseUrl.includes("?") ? "&" : "?") + "fmt=json3";
    const r2 = await fetchFn(jUrl, { credentials: "omit", signal: AbortSignal.timeout(15000) });
    if (r2.ok) return pbpYtParseJson3(await r2.text());
  } catch (_) {}
  return [];
}

// ---- Bilibili WBI-signed subtitle extraction ---------------------------
// Subtitles come from x/player/wbi/v2, which needs a WBI signature (mixin key
// from x/web-interface/nav) AND the user's bilibili login (SESSDATA, sent as
// credentials:"include" by the runtime): logged out, the subtitle list is
// empty by design -> the orchestrator returns error:"login". Algorithm + the
// 64-int table are the shipping bilibili scheme (verified against a production
// extension; the community doc repo was taken down 2026-01).

const PBP_BILI_MIXIN_TAB = [46,47,18,2,53,8,23,32,15,50,10,31,58,3,45,35,27,43,5,49,33,9,42,19,29,28,14,39,12,38,41,13,37,48,7,16,24,55,40,61,26,17,0,1,60,51,30,4,22,25,54,21,56,59,6,63,57,62,11,36,20,34,44,52];

// Compact RFC1321 MD5 (self-contained; zero deps). Returns lowercase 32-hex.
function pbpMd5(str) {
  function rl(n, c) { return (n << c) | (n >>> (32 - c)); }
  function add(a, b) { const l = (a & 0xffff) + (b & 0xffff); return (((a >> 16) + (b >> 16) + (l >> 16)) << 16) | (l & 0xffff); }
  function cmn(q, a, b, x, s, t) { return add(rl(add(add(a, q), add(x, t)), s), b); }
  function ff(a, b, c, d, x, s, t) { return cmn((b & c) | (~b & d), a, b, x, s, t); }
  function gg(a, b, c, d, x, s, t) { return cmn((b & d) | (c & ~d), a, b, x, s, t); }
  function hh(a, b, c, d, x, s, t) { return cmn(b ^ c ^ d, a, b, x, s, t); }
  function ii(a, b, c, d, x, s, t) { return cmn(c ^ (b | ~d), a, b, x, s, t); }
  // UTF-8 encode
  const bytes = [];
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    if (c < 0x80) bytes.push(c);
    else if (c < 0x800) { bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f)); }
    else if (c < 0xd800 || c >= 0xe000) { bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f)); }
    else { i++; c = 0x10000 + (((c & 0x3ff) << 10) | (str.charCodeAt(i) & 0x3ff)); bytes.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 0x3f), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f)); }
  }
  const n = bytes.length;
  const words = [];
  for (let i = 0; i < n; i++) words[i >> 2] = (words[i >> 2] || 0) | (bytes[i] << ((i % 4) * 8));
  words[n >> 2] = (words[n >> 2] || 0) | (0x80 << ((n % 4) * 8));
  const bitLen = n * 8;
  const total = (((n + 8) >> 6) + 1) * 16;
  while (words.length < total) words.push(0);
  words[total - 2] = bitLen;
  words[total - 1] = 0;
  let a = 1732584193, b = -271733879, c = -1732584194, d = 271733878;
  const S = [7,12,17,22,5,9,14,20,4,11,16,23,6,10,15,21];
  const K = [-680876936,-389564586,606105819,-1044525330,-176418897,1200080426,-1473231341,-45705983,1770035416,-1958414417,-42063,-1990404162,1804603682,-40341101,-1502002290,1236535329,-165796510,-1069501632,643717713,-373897302,-701558691,38016083,-660478335,-405537848,568446438,-1019803690,-187363961,1163531501,-1444681467,-51403784,1735328473,-1926607734,-378558,-2022574463,1839030562,-35309556,-1530992060,1272893353,-155497632,-1094730640,681279174,-358537222,-722521979,76029189,-640364487,-421815835,530742520,-995338651,-198630844,1126891415,-1416354905,-57434055,1700485571,-1894986606,-1051523,-2054922799,1873313359,-30611744,-1560198380,1309151649,-145523070,-1120210379,718787259,-343485551];
  for (let i = 0; i < words.length; i += 16) {
    let a0 = a, b0 = b, c0 = c, d0 = d;
    for (let j = 0; j < 64; j++) {
      let f, g, sIdx;
      if (j < 16) { f = ff; g = j; sIdx = j % 4; }
      else if (j < 32) { f = gg; g = (5 * j + 1) % 16; sIdx = 4 + (j % 4); }
      else if (j < 48) { f = hh; g = (3 * j + 5) % 16; sIdx = 8 + (j % 4); }
      else { f = ii; g = (7 * j) % 16; sIdx = 12 + (j % 4); }
      const nb = f(a0, b0, c0, d0, words[i + g], S[sIdx], K[j]);
      a0 = d0; d0 = c0; c0 = b0; b0 = nb;
    }
    a = add(a, a0); b = add(b, b0); c = add(c, c0); d = add(d, d0);
  }
  function toHex(x) {
    let s = "";
    for (let i = 0; i < 4; i++) s += ((x >> (i * 8)) & 0xff).toString(16).padStart(2, "0");
    return s;
  }
  return toHex(a) + toHex(b) + toHex(c) + toHex(d);
}

function pbpBiliMixinKey(navJson) {
  const img = navJson && navJson.data && navJson.data.wbi_img;
  if (!img || !img.img_url || !img.sub_url) return "";
  const base = (u) => String(u).split("/").pop().split(".")[0];
  const raw = base(img.img_url) + base(img.sub_url);
  return PBP_BILI_MIXIN_TAB.map((i) => raw[i]).join("").slice(0, 32);
}

function pbpBiliSign(params, mixinKey) {
  const p = Object.assign({}, params, { wts: Math.floor(Date.now() / 1000) });
  const query = Object.keys(p).sort()
    .map((k) => encodeURIComponent(k) + "=" + encodeURIComponent(p[k])).join("&");
  p.w_rid = pbpMd5(query + (mixinKey || ""));
  return p;
}

function pbpBiliExtractCid(viewJson, part) {
  const d = viewJson && viewJson.data;
  if (!d || (!d.cid && !Array.isArray(d.pages))) return null;
  let cid = d.cid;
  if (Array.isArray(d.pages) && d.pages.length) {
    const pg = d.pages.find((x) => x && x.page === part) || d.pages[part - 1];
    if (pg && pg.cid) cid = pg.cid;
  }
  return { cid: cid, title: d.title || "", pic: d.pic || "", owner: (d.owner && d.owner.name) || "", pages: d.pages || [] };
}

function _pbpBiliIsZh(t) { return /^zh|^ai-zh/i.test(t.lan || "") || /中文|中文\(AI\)|Chinese/i.test(t.lan_doc || ""); }
function _pbpBiliIsAi(t) { return /^ai-/i.test(t.lan || "") || /AI|智能/i.test(t.lan_doc || ""); }
function pbpBiliPickSubtitle(subs) {
  if (!Array.isArray(subs) || !subs.length) return null;
  const zh = subs.filter(_pbpBiliIsZh);
  const human = zh.find((s) => !_pbpBiliIsAi(s));
  return human || zh[0] || subs[0];
}

function pbpBiliParseSubtitleJson(json) {
  const body = json && json.body;
  if (!Array.isArray(body)) return [];
  return body.filter((b) => b && b.content != null).map((b) => ({
    from: +b.from || 0, to: +b.to || 0, content: String(b.content).replace(/\s+/g, " ").trim()
  })).filter((s) => s.content);
}

// Orchestrator. credentials handling lives in the runtime caller's fetchFn;
// the injected test fetchFn ignores it. error: "view" | "login" | "no-tracks"
// | "caption-body". "login" specifically = the API returned an EMPTY subtitle
// list, which for a public API means the user isn't logged into bilibili.
async function pbpBiliFetchTranscript(bvid, part, opts) {
  opts = opts || {};
  const fetchFn = opts.fetchFn || ((u, o) => fetch(u, o));
  let view;
  try {
    const r = await fetchFn("https://api.bilibili.com/x/web-interface/view?bvid=" + encodeURIComponent(bvid), { credentials: "include", signal: AbortSignal.timeout(15000) });
    if (!r.ok) return { error: "view" };
    view = await r.json();
  } catch (_) { return { error: "view" }; }
  const info = pbpBiliExtractCid(view, part);
  if (!info || !info.cid) return { error: "view" };
  let mixinKey = "";
  try {
    const nr = await fetchFn("https://api.bilibili.com/x/web-interface/nav", { credentials: "include", signal: AbortSignal.timeout(15000) });
    if (nr.ok) mixinKey = pbpBiliMixinKey(await nr.json());
  } catch (_) { /* unsigned attempt below may still work for some videos */ }
  const signed = pbpBiliSign({ bvid: bvid, cid: info.cid }, mixinKey);
  const qs = Object.keys(signed).map((k) => encodeURIComponent(k) + "=" + encodeURIComponent(signed[k])).join("&");
  let player;
  try {
    const pr = await fetchFn("https://api.bilibili.com/x/player/wbi/v2?" + qs, { credentials: "include", signal: AbortSignal.timeout(15000) });
    if (!pr.ok) return { error: "no-tracks", meta: info };
    player = await pr.json();
  } catch (_) { return { error: "no-tracks", meta: info }; }
  const subs = (player && player.data && player.data.subtitle && player.data.subtitle.subtitles) || [];
  if (!subs.length) return { error: "login", meta: info };
  const track = opts.pickSubtitleUrl ? (subs.find((s) => s.subtitle_url === opts.pickSubtitleUrl) || pbpBiliPickSubtitle(subs)) : pbpBiliPickSubtitle(subs);
  const segments = await pbpBiliFetchSubtitleBody(track.subtitle_url, fetchFn);
  if (!segments.length) return { error: "caption-body", tracks: subs, track: track, meta: info };
  return { tracks: subs, track: track, segments: segments, meta: info };
}

async function pbpBiliFetchSubtitleBody(subtitleUrl, fetchFn) {
  fetchFn = fetchFn || ((u, o) => fetch(u, o));
  const url = String(subtitleUrl || "").startsWith("//") ? "https:" + subtitleUrl : subtitleUrl;
  if (!url) return [];
  try {
    const r = await fetchFn(url, { credentials: "omit", signal: AbortSignal.timeout(15000) });
    if (r.ok) return pbpBiliParseSubtitleJson(await r.json());
  } catch (_) {}
  return [];
}
// ── end PURE SECTION ──

// ── RUNTIME (chrome/fetch/DOM; md-preview only) ──
// Panel lives as a SIBLING above #rendered-view: translation re-renders
// replace renderedView's content and must never destroy the player.
(function () {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const YT_ORIGIN = "https://www.youtube.com/*";
  const BILI_ORIGIN = "https://api.bilibili.com/*";
  const EMBED_BASE = "https://www.youtube-nocookie.com"; // privacy-enhanced embed

  let _panel = null, _iframe = null, _segments = [], _meta = {};

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function seekTo(sec) {
    if (!_iframe || !_iframe.contentWindow) return;
    // youtube iframe API accepts serialized commands once enablejsapi=1.
    // Best-effort: if the player isn't ready the message is dropped — the
    // row click then simply does nothing (degrade, never throw).
    const post = (func, args) => _iframe.contentWindow.postMessage(
      JSON.stringify({ event: "command", func, args: args || [] }), EMBED_BASE);
    post("seekTo", [sec, true]);
    post("playVideo");
  }

  // seekable=false renders static rows (no click, no seek title) — the
  // bilibili iframe exposes no clean postMessage seek API.
  function renderTranscript(listEl, segments, seekable) {
    listEl.textContent = "";
    const frag = document.createDocumentFragment();
    segments.forEach((seg) => {
      const row = el("button", seekable ? "pbv-row" : "pbv-row pbv-row--static");
      row.type = "button";
      const time = el("span", "pbv-time", pbpVideoFmtTime(seg.from));
      const text = el("span", "pbv-text", seg.content);
      row.appendChild(time); row.appendChild(text);
      if (seekable) {
        row.title = t("mdVideoSeekTo", pbpVideoFmtTime(seg.from));
        row.addEventListener("click", () => seekTo(Math.floor(seg.from)));
      }
      frag.appendChild(row);
    });
    listEl.appendChild(frag);
  }

  async function loadFlow(detected, statusEl, bodyEl, trackSel, copyBtn) {
    statusEl.textContent = t("mdVideoLoading");
    const isBili = detected.provider === "bilibili";
    let granted = false;
    try { granted = await chrome.permissions.request({ origins: [isBili ? BILI_ORIGIN : YT_ORIGIN] }) === true; } catch (_) {}
    if (!granted) { statusEl.textContent = t("mdVideoPermMissing"); return; }
    let res;
    if (isBili) {
      res = await pbpBiliFetchTranscript(detected.bvid, detected.part, {});
      if (res.meta && res.meta.title) _meta.title = res.meta.title;
    } else {
      const uiLang = (chrome.i18n && chrome.i18n.getUILanguage && chrome.i18n.getUILanguage()) || "en";
      res = await pbpYtFetchTranscript(detected.videoId, { uiLang });
    }
    if (res.error === "player" || res.error === "view") { statusEl.textContent = t("mdVideoFailed"); return; }
    if (res.error === "login") { statusEl.textContent = t("mdVideoBiliLogin"); return; }
    if (res.error === "no-tracks" || res.error === "caption-body") {
      statusEl.textContent = t("mdVideoNoTracks");
      if (!res.tracks) return;
    }
    if (!res.error) statusEl.textContent = "";
    // track picker
    trackSel.textContent = "";
    (res.tracks || []).forEach((tr) => {
      const opt = document.createElement("option");
      const value = isBili ? tr.subtitle_url : tr.baseUrl;
      const label = isBili ? tr.lan_doc : tr.label;
      opt.value = value;
      opt.textContent = label + (tr.asr ? " (" + t("mdVideoAsr") + ")" : "");
      if (res.track && value === (isBili ? res.track.subtitle_url : res.track.baseUrl)) opt.selected = true;
      trackSel.appendChild(opt);
    });
    trackSel.hidden = !(res.tracks || []).length;
    copyBtn.hidden = !(res.segments || []).length;
    _segments = res.segments || [];
    _meta.trackLabel = res.track ? (isBili ? res.track.lan_doc : res.track.label) : "";
    if (_segments.length) renderTranscript(bodyEl, _segments, !isBili);
    trackSel.addEventListener("change", async () => {
      statusEl.textContent = t("mdVideoLoading");
      const segs = isBili ? await pbpBiliFetchSubtitleBody(trackSel.value) : await pbpYtFetchCaptionBody(trackSel.value);
      statusEl.textContent = segs.length ? "" : t("mdVideoNoTracks");
      _segments = segs;
      const sel = trackSel.selectedOptions && trackSel.selectedOptions[0];
      _meta.trackLabel = sel ? sel.textContent : "";
      copyBtn.hidden = !segs.length;
      renderTranscript(bodyEl, segs, !isBili);
    });
  }

  window.pbpVideoInit = function pbpVideoInit(ctx) {
    const detected = pbpVideoDetect(ctx && ctx.pageUrl);
    if (!detected) return;
    const view = document.getElementById("rendered-view");
    if (!view || !view.parentNode || document.getElementById("video-panel")) return;
    _meta = { title: (ctx && ctx.title) || document.title || "", url: ctx.pageUrl };

    const panel = el("section", "video-panel");
    panel.id = "video-panel";
    panel.setAttribute("aria-label", t("mdVideoTitle"));

    // CTA state: one button; the panel body appears on load.
    const cta = el("button", "pbv-cta");
    cta.type = "button";
    cta.appendChild(el("span", "pbv-cta-label", t("mdVideoLoad")));
    panel.appendChild(cta);
    view.parentNode.insertBefore(panel, view);
    _panel = panel;

    cta.addEventListener("click", async () => {
      cta.disabled = true;
      // player iframe mounts immediately (no permission needed for a frame)
      const media = el("div", "pbv-media");
      _iframe = document.createElement("iframe");
      _iframe.src = detected.provider === "bilibili"
        ? "https://player.bilibili.com/player.html?bvid=" + detected.bvid + "&page=" + detected.part + "&high_quality=1&danmaku=0"
        : EMBED_BASE + "/embed/" + detected.videoId + "?enablejsapi=1&rel=0";
      _iframe.allow = "encrypted-media; picture-in-picture; fullscreen";
      _iframe.title = t("mdVideoTitle");
      media.appendChild(_iframe);
      const bar = el("div", "pbv-bar");
      const status = el("span", "pbv-status");
      status.setAttribute("aria-live", "polite");
      const trackSel = document.createElement("select");
      trackSel.className = "pbv-tracks";
      trackSel.hidden = true;
      trackSel.setAttribute("aria-label", t("mdVideoTrackAria"));
      const copyBtn = el("button", "pbv-copy");
      copyBtn.type = "button";
      copyBtn.hidden = true;
      copyBtn.textContent = t("mdVideoCopyMd");
      copyBtn.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(pbpVideoTranscriptMarkdown(_segments, _meta));
          const prev = copyBtn.textContent;
          copyBtn.textContent = t("mdVideoCopied");
          setTimeout(() => { copyBtn.textContent = prev; }, 1800);
        } catch (_) { status.textContent = t("mdVideoCopyFailed"); }
      });
      bar.appendChild(trackSel); bar.appendChild(copyBtn); bar.appendChild(status);
      const body = el("div", "pbv-list");
      panel.replaceChildren(media, bar, body);
      await loadFlow(detected, status, body, trackSel, copyBtn);
    });
  };
})();
