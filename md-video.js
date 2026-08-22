// ============================================================
// Pinboard Bookmark Enhanced — md-video.js (md-preview only)
// Video + subtitles panel for video-page bookmarks. PURE section first
// (URL detect / watch-page scrape / timedtext parsers /
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

// Deterministic poster URL -- no API call. hqdefault exists for every video;
// maxresdefault does not, so prefer the one that always resolves. bilibili
// has no equivalent stable thumbnail endpoint reachable without an API call,
// so its poster card falls back to the plain placeholder card.
function pbpVideoPosterUrl(detected) {
  return detected && detected.provider === "youtube"
    ? "https://i.ytimg.com/vi/" + detected.videoId + "/hqdefault.jpg" : "";
}

// A tab qualifies as a same-origin caption-fetch host only when it is
// plainly on https://www.youtube.com -- the click-time permission grant
// covers exactly that origin, and scripting.executeScript rides host access.
// m.youtube.com / youtu.be tabs are NOT eligible: the grant doesn't cover
// them, so injection there would be an ungranted-origin injection.
function pbpYtTabEligible(tabUrl) {
  try {
    const u = new URL(String(tabUrl || ""));
    return u.protocol === "https:" && u.hostname === "www.youtube.com";
  } catch (_) { return false; }
}

// YouTube's InnerTube endpoint now demands a PO Token on every client we
// could impersonate (yt-dlp PO Token Guide, 2026-07), and a browser cannot
// produce one -- attestation needs the native app runtime. The watch page
// itself still carries the caption track list, so lift it from there.
function pbpYtWatchUrl(videoId, hl) {
  return "https://www.youtube.com/watch?v=" + encodeURIComponent(videoId) +
    (hl ? "&hl=" + encodeURIComponent(hl) : "");
}

// Lift ytInitialPlayerResponse from watch-page HTML. Brace-matched rather
// than regex-terminated: the JSON contains nested braces and escaped quotes.
function pbpYtExtractPlayerJson(html) {
  const s = String(html || "");
  const key = "ytInitialPlayerResponse";
  let i = s.indexOf(key);
  while (i !== -1) {
    const brace = s.indexOf("{", i);
    if (brace === -1) return null;
    let depth = 0, inStr = false, esc = false;
    for (let j = brace; j < s.length; j++) {
      const c = s[j];
      if (esc) { esc = false; continue; }
      if (c === "\\") { esc = true; continue; }
      if (c === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) {
          try { return JSON.parse(s.slice(brace, j + 1)); } catch (_) { break; }
        }
      }
    }
    i = s.indexOf(key, i + key.length);
  }
  return null;
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
// raw segments). Three breakers, because punctuation alone is not enough:
// bilibili's ASR tracks carry NO sentence-final punctuation at all, and the
// punctuation-only rule rendered a 25-minute video as one wall of text.
//  1. sentence-final punctuation (original rule);
//  2. a silent gap (>2.5s between one segment's end and the next's start) --
//     a real pause in speech is a paragraph boundary;
//  3. an accumulated-length ceiling (~200 chars) so unpunctuated,
//     gap-free runs still break into readable blocks.
function pbpVideoMergeParagraphs(segments) {
  const out = [];
  let buf = [];
  let bufLen = 0;
  let lastEnd = -1;
  const flush = () => {
    if (!buf.length) return;
    out.push(buf.join(" ").replace(/\s+/g, " ").trim());
    buf = []; bufLen = 0;
  };
  for (const seg of segments || []) {
    const from = typeof seg.from === "number" ? seg.from : -1;
    if (lastEnd >= 0 && from >= 0 && from - lastEnd > 2.5) flush();
    buf.push(seg.content);
    bufLen += String(seg.content || "").length;
    const to = typeof seg.to === "number" && seg.to > 0 ? seg.to : from;
    if (to >= 0) lastEnd = to;
    if (/[.!?。！？…]["')\]]?$/.test(seg.content) || bufLen >= 200) flush();
  }
  flush();
  return out.filter(Boolean);
}

// Unpunctuated-track detection: ASR subtitles (bilibili's especially) carry
// no sentence-final punctuation at all. Only tracks like that qualify for
// punctuation enhancement -- properly punctuated tracks are never touched.
function pbpVideoNeedsPunctuation(segments) {
  const segs = (segments || []).filter((s) => s && s.content);
  if (segs.length < 10) return false;
  let punct = 0;
  for (const s of segs) if (/[.!?。！？…]["')\]]?$/.test(s.content)) punct++;
  return punct / segs.length < 0.1;
}

// Zero-token heuristic tier: pause length decides the mark (short pause ->
// comma, long pause -> full stop; interrogative particles -> question mark).
// Chinese-specific rules, so non-CJK segments are left alone. Returns new
// segment objects; never mutates the input.
function pbpVideoHeuristicPunctuate(segments) {
  const segs = segments || [];
  const out = [];
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    const content = String((s && s.content) || "");
    if (!/[一-鿿]/.test(content) || /[，。！？…、；：,.!?;:]$/.test(content)) { out.push(s); continue; }
    const next = segs[i + 1];
    const end = typeof s.to === "number" && s.to > 0 ? s.to : (typeof s.from === "number" ? s.from : -1);
    const gap = next && typeof next.from === "number" && end >= 0 ? next.from - end : Infinity;
    let mark = "";
    if (!next || gap >= 1.5) mark = /[吗呢]$/.test(content) ? "？" : "。";
    else if (gap >= 0.4) mark = "，";
    out.push(mark ? { ...s, content: content + mark } : s);
  }
  return out;
}

// Conservation gate for the AI tier: stripping punctuation and whitespace
// from both sides must leave identical character sequences -- the model may
// only insert or adjust marks, never touch a word (fail-closed per batch).
function pbpVideoPunctConserved(original, punctuated) {
  const strip = (t) => String(t || "").replace(/[\s，。！？；：、“”‘’（）《》【】…—,.!?;:'"()\[\]{}·-]+/g, "");
  const a = strip(original);
  return a.length > 0 && a === strip(punctuated);
}

// Map AI-punctuated text back onto the timed segments, so the panel rows
// (and their seek timestamps) get the punctuation too -- without this the
// AI pass was invisible until Copy/Use-as-article. Deterministic because
// the conservation gate guarantees identical non-punctuation character
// streams: each segment consumes its own count of non-punctuation chars
// from the AI text, absorbing the marks between and right after them.
// Any mismatch returns null (fail-closed; caller keeps its segments).
function pbpVideoApplyPunctText(segments, punctText) {
  const isMark = (ch) => /[\s，。！？；：、“”‘’（）《》【】…—,.!?;:'"()\[\]{}·-]/.test(ch);
  const src = String(punctText || "");
  let i = 0;
  const out = [];
  for (const seg of segments || []) {
    const plainLen = String((seg && seg.content) || "").split("").filter((c) => !isMark(c)).length;
    if (!plainLen) { out.push(seg); continue; }
    let taken = 0;
    let piece = "";
    while (i < src.length && taken < plainLen) {
      const ch = src[i++];
      piece += ch;
      if (!isMark(ch)) taken++;
    }
    if (taken < plainLen) return null; // AI text ran short -- refuse
    // absorb trailing marks (not whitespace) belonging to this sentence
    while (i < src.length && isMark(src[i]) && !/\s/.test(src[i])) piece += src[i++];
    const content = piece.replace(/\s+/g, " ").trim();
    if (!content) return null;
    out.push({ ...seg, content });
  }
  // leftover non-punctuation chars mean the streams diverged -- refuse
  while (i < src.length) { if (!isMark(src[i])) return null; i++; }
  return out;
}

function pbpVideoFmtTime(sec) {
  sec = Math.max(0, Math.floor(+sec || 0));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const p2 = (n) => (n < 10 ? "0" : "") + n;
  return h ? h + ":" + p2(m) + ":" + p2(s) : m + ":" + p2(s);
}

function pbpVideoTranscriptMarkdown(segments, meta, paragraphsOverride) {
  meta = meta || {};
  const lines = ["## Transcript" + (meta.trackLabel ? " (" + meta.trackLabel + ")" : "")];
  if (meta.url) lines.push("", "> " + (meta.title ? "[" + meta.title + "](" + meta.url + ")" : "<" + meta.url + ">"));
  lines.push("");
  const paras = (Array.isArray(paragraphsOverride) && paragraphsOverride.length)
    ? paragraphsOverride : pbpVideoMergeParagraphs(segments);
  lines.push(paras.join("\n\n"));
  return lines.join("\n");
}

// Playability gate from a watch-page player response. "OK" means YouTube
// served us a real video; anything else (LOGIN_REQUIRED for the bot check,
// AGE_VERIFICATION_REQUIRED, UNPLAYABLE, ERROR) means the answer we got is
// about US, not about the video's captions. Missing status -> "" (unknown),
// which callers treat as "carry on" rather than as a refusal.
function pbpYtPlayabilityStatus(playerJson) {
  const st = playerJson && playerJson.playabilityStatus && playerJson.playabilityStatus.status;
  return typeof st === "string" ? st : "";
}

// Orchestrator: watch page (carries ytInitialPlayerResponse) -> tracks ->
// pick -> caption body (XML first, fmt=json3 fallback). fetchFn injectable
// for tests; every network step is fail-soft and reports a coarse error code
// the UI maps. opts.useLogin switches every fetch (watch page AND caption
// body) between cookieless and login-cookie credentials.
async function pbpYtFetchTranscript(videoId, opts) {
  opts = opts || {};
  const fetchFn = opts.fetchFn || ((u, o) => fetch(u, o));
  const credentials = opts.useLogin ? "include" : "omit";
  let playerJson = null;
  try {
    const resp = await fetchFn(pbpYtWatchUrl(videoId, opts.uiLang), { credentials, signal: AbortSignal.timeout(15000) });
    if (resp.ok) playerJson = pbpYtExtractPlayerJson(await resp.text());
  } catch (_) { /* leave playerJson null */ }
  if (!playerJson) return { error: "player" };
  // Distinguish "YouTube refused us" from "this video has no captions" before
  // reading the track list. A bot-gated response still parses and still has no
  // captions field, so without this check every rate-limited request was
  // reported to the user as "no subtitles available" -- a claim that is simply
  // untrue and sends them looking for the wrong problem. LOGIN_REQUIRED with a
  // bot-check reason is exactly what the embedded player shows as "Sign in to
  // confirm you're not a bot".
  const status = pbpYtPlayabilityStatus(playerJson);
  if (status && status !== "OK") return { error: "blocked", status: status };
  const tracks = pbpYtExtractTracks(playerJson);
  if (!tracks.length) return { error: "no-tracks" };
  const track = opts.pickBaseUrl ? (tracks.find((tr) => tr.baseUrl === opts.pickBaseUrl) || pbpYtPickTrack(tracks, opts.uiLang)) : pbpYtPickTrack(tracks, opts.uiLang);
  const segments = await pbpYtFetchCaptionBody(track.baseUrl, fetchFn, opts.useLogin);
  if (!segments.length) return { error: "caption-body", tracks, track };
  return { tracks, track, segments };
}

async function pbpYtFetchCaptionBody(baseUrl, fetchFn, useLogin) {
  fetchFn = fetchFn || ((u, o) => fetch(u, o));
  const credentials = useLogin ? "include" : "omit";
  try {
    const r1 = await fetchFn(baseUrl, { credentials, signal: AbortSignal.timeout(15000) });
    if (r1.ok) {
      const fromXml = pbpYtParseTimedtextXml(await r1.text());
      if (fromXml.length) return fromXml;
    }
  } catch (_) { /* fall through to json3 */ }
  try {
    const jUrl = baseUrl + (baseUrl.includes("?") ? "&" : "?") + "fmt=json3";
    const r2 = await fetchFn(jUrl, { credentials, signal: AbortSignal.timeout(15000) });
    if (r2.ok) return pbpYtParseJson3(await r2.text());
  } catch (_) {}
  return [];
}

// Hand-build the get_transcript params protobuf (base64) for a video +
// track, so the transcript-panel endpoint stays reachable even when the
// page's own data carries no getTranscriptEndpoint (observed live on a
// device: "no params in page data"). Wire layout is the community-verified
// one shipping in Invidious' produce_transcript_params: an outer message
// { 1: videoId, 2: urlsafe-b64+escaped inner { 1: "asr"?, 2: lang, 3: "" },
// 3: 1, 5: panel id, 6: 1, 7: 1, 8: 1 }.
function pbpYtTranscriptParams(videoId, langCode, asr) {
  const enc = (s) => Array.from(new TextEncoder().encode(String(s)));
  const varint = (n) => { const out = []; let v = n >>> 0; do { let b = v & 0x7f; v >>>= 7; if (v) b |= 0x80; out.push(b); } while (v); return out; };
  const str = (field, s) => { const b = enc(s); return [(field << 3) | 2, ...varint(b.length), ...b]; };
  const num = (field, v) => [(field << 3) | 0, ...varint(v)];
  const b64 = (bytes) => btoa(String.fromCharCode.apply(null, bytes));
  const inner = [...(asr ? str(1, "asr") : []), ...str(2, langCode || "en"), ...str(3, "")];
  const innerTok = encodeURIComponent(b64(inner).replace(/\+/g, "-").replace(/\//g, "_"));
  const outer = [
    ...str(1, videoId),
    ...str(2, innerTok),
    ...num(3, 1),
    ...str(5, "engagement-panel-searchable-transcript-search-panel"),
    ...num(6, 1), ...num(7, 1), ...num(8, 1),
  ];
  return b64(outer);
}

// Parse a /youtubei/v1/get_transcript response (the endpoint behind
// YouTube's own "Show transcript" panel) into segments. Shape verified
// against the shipping implementation in the page-assist extension:
// actions[] -> updateEngagementPanelAction -> transcriptRenderer.content
// .transcriptSearchPanelRenderer.body.transcriptSegmentListRenderer
// .initialSegments[] -> transcriptSegmentRenderer { startMs, endMs,
// snippet.runs[].text }; continuations arrive as
// appendContinuationItemsAction.continuationItems instead.
function pbpYtParseTranscriptPanel(data) {
  const out = [];
  const actions = data && data.actions;
  if (!Array.isArray(actions)) return out;
  for (const action of actions) {
    const upd = action && action.updateEngagementPanelAction;
    const segs =
      (upd && upd.content && upd.content.transcriptRenderer && upd.content.transcriptRenderer.content
        && upd.content.transcriptRenderer.content.transcriptSearchPanelRenderer
        && upd.content.transcriptRenderer.content.transcriptSearchPanelRenderer.body
        && upd.content.transcriptRenderer.content.transcriptSearchPanelRenderer.body.transcriptSegmentListRenderer
        && upd.content.transcriptRenderer.content.transcriptSearchPanelRenderer.body.transcriptSegmentListRenderer.initialSegments)
      || (action && action.appendContinuationItemsAction && action.appendContinuationItemsAction.continuationItems)
      || null;
    if (!Array.isArray(segs)) continue;
    for (const seg of segs) {
      const r = seg && seg.transcriptSegmentRenderer;
      if (!r) continue;
      const content = ((r.snippet && r.snippet.runs) || []).map((x) => (x && x.text) || "").join("").replace(/\s+/g, " ").trim();
      if (!content) continue;
      const from = (+r.startMs || 0) / 1000;
      const to = (+r.endMs || 0) / 1000;
      out.push({ from, to, content });
    }
  }
  return out;
}

// Deep-scan parser for captured transcript network bodies. YouTube is
// mid-migration (2026): /get_transcript still answers with the classic
// transcriptSegmentRenderer actions tree, while the PAmodern /get_panel
// grade answers with transcriptSegmentViewModel { timestamp, simpleText }
// nested under shifting wrapper paths. A bounded recursive walk that
// collects BOTH shapes survives the A/B mix; exact-path parsing does not
// (research: Codex 2026-08-22, cross-checked against Distill /
// YouTubeTranscriptCopier / youtube-transcript-downloader).
function pbpYtParseTranscriptDeep(data) {
  const out = [];
  const parseTs = (t) => {
    const p = String(t || "").trim().split(":").map(Number);
    return (!p.length || p.some(isNaN)) ? 0 : p.reduce((a, b) => a * 60 + b, 0);
  };
  const textOf = (v) => {
    if (v == null) return "";
    if (typeof v === "string") return v;
    if (typeof v.simpleText === "string") return v.simpleText;
    if (typeof v.content === "string") return v.content;
    if (Array.isArray(v.runs)) return v.runs.map((r) => (r && r.text) || "").join("");
    return "";
  };
  const walk = (node, depth) => {
    if (!node || typeof node !== "object" || depth > 40) return;
    const vm = node.transcriptSegmentViewModel;
    if (vm && typeof vm === "object") {
      const content = (textOf(vm.simpleText) || textOf(vm.text) || textOf(vm.snippet)).replace(/\s+/g, " ").trim();
      if (content) out.push({ from: parseTs(textOf(vm.timestamp) || textOf(vm.startTimeText)), to: 0, content });
      return; // segments don't nest inside each other
    }
    const r = node.transcriptSegmentRenderer;
    if (r && typeof r === "object") {
      const content = textOf(r.snippet).replace(/\s+/g, " ").trim();
      if (content) out.push({ from: (+r.startMs || 0) / 1000, to: (+r.endMs || 0) / 1000, content });
      return;
    }
    for (const k in node) {
      const v = node[k];
      if (v && typeof v === "object") walk(v, depth + 1);
    }
  };
  walk(data, 0);
  return out;
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
  // Chrome sends no Referer from chrome-extension:// frames, and YouTube's
  // enablejsapi=1 path rejects that with "Error 153". This page lives on the
  // project's own GitHub Pages origin (docs/yt-embed.html, published verbatim
  // -- docs/_config.yml only excludes superpowers/theme-surface/*.json/*.mjs/
  // README.md) so YouTube sees a real https referrer; it only ever forwards
  // the two player commands the reader uses and never reads or stores anything.
  const RELAY_BASE = "https://pine2d.github.io/Pinboard-Bookmark-Enhanced/yt-embed.html";
  const RELAY_ORIGIN = "https://pine2d.github.io";
  // Lucide v0.525.0 "play" (ISC, https://unpkg.com/lucide-static@0.525.0/icons/play.svg),
  // byte-copied rather than hand-drawn. Kept local (not added to shared.js's
  // PBP_ICONS) since this is the poster card's only consumer.
  const PBV_PLAY_SVG = '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="6 3 20 12 6 21 6 3"/></svg>';
  // extOpen is PBP_ICONS's real-external-link icon (shared.js, already loaded
  // by md-preview.html before this file); guarded for the standalone test page.
  const PBV_EXTERNAL_SVG = typeof PBP_ICONS !== "undefined" ? PBP_ICONS.extOpen : "";

  let _panel = null, _iframe = null, _segments = [], _meta = {};
  let _isBili = false; // provider of the mounted player -- seekTo() picks its jump mechanism by it
  let _aiPunctParas = null; // AI-punctuated paragraphs; Copy/Use-as-article prefer them when present
  let _ctxTabId = null;   // source tab from pbpVideoInit ctx (may be gone by click time)
  let _ytFetchFn = null;  // tab-injected fetchFn when the tab route won; null = extension-page fetch

  // Same-origin caption fetch, executed INSIDE an open YouTube tab. From the
  // page's own context the watch HTML answers with an OK playabilityStatus
  // and caption baseUrls complete with their pot (PO Token) parameter; the
  // extension page's cross-site fetch gets LOGIN_REQUIRED instead -- login
  // cookies don't attach cross-site, and the botguard has no page context to
  // attest (probed live 2026-08: cookieless watch fetch = LOGIN_REQUIRED,
  // zero tracks). Injection rides the click-time https://www.youtube.com/*
  // grant plus the existing "scripting" permission -- no new permissions.
  async function ytFindFetchTab() {
    if (typeof _ctxTabId === "number") {
      try {
        const tab = await chrome.tabs.get(_ctxTabId);
        if (tab && pbpYtTabEligible(tab.url)) return tab.id;
      } catch (_) { /* source tab is gone; any YouTube tab works the same */ }
    }
    try {
      const tabs = await chrome.tabs.query({ url: "https://www.youtube.com/*" });
      for (const tab of tabs || []) {
        if (tab && typeof tab.id === "number" && pbpYtTabEligible(tab.url)) return tab.id;
      }
    } catch (_) {}
    return null;
  }

  function ytTabFetchFn(tabId, videoId) {
    return async (url) => {
      const inj = await chrome.scripting.executeScript({
        target: { tabId },
        world: "MAIN", // window.ytInitialPlayerResponse lives in the page world
        func: async (u, wantVid) => {
          // A page the user can actually watch already holds an OK player
          // response whose caption baseUrls carry their pot (PO Token)
          // parameter -- strictly better evidence than re-fetching the watch
          // HTML, which the botguard gates even same-origin (a script fetch
          // carries Sec-Fetch-Dest: empty, unlike a navigation). Two page
          // sources, both videoId-checked and OK-checked: the player API
          // (movie_player.getPlayerResponse() tracks SPA navigation, so it is
          // current even when the user browsed INTO this video), then the
          // load-time global (present on direct opens, STALE after SPA moves).
          // Watch-page requests only: caption (timedtext) URLs also carry a
          // v= param, and handing them the player response instead of the
          // track body would break both the XML and json3 parses.
          const isWatch = (() => { try { return new URL(u, location.href).pathname === "/watch"; } catch (_) { return false; } })();
          if (wantVid && isWatch) {
            const usable = (pr) => {
              try {
                return pr && pr.videoDetails && pr.videoDetails.videoId === wantVid &&
                  pr.playabilityStatus && pr.playabilityStatus.status === "OK";
              } catch (_) { return false; }
            };
            try {
              const player = document.getElementById("movie_player");
              const pr = player && typeof player.getPlayerResponse === "function" ? player.getPlayerResponse() : null;
              if (usable(pr)) return { ok: true, status: 200, body: "ytInitialPlayerResponse = " + JSON.stringify(pr) + ";" };
            } catch (_) { /* try the global next */ }
            try {
              const pr = window.ytInitialPlayerResponse;
              if (usable(pr)) return { ok: true, status: 200, body: "ytInitialPlayerResponse = " + JSON.stringify(pr) + ";" };
            } catch (_) { /* fall through to the network */ }
          }
          try {
            const r = await fetch(u, { credentials: "same-origin", signal: AbortSignal.timeout(15000) });
            return { ok: r.ok, status: r.status, body: await r.text() };
          } catch (e) {
            return { ok: false, status: 0, body: "" };
          }
        },
        args: [url, videoId || ""],
      });
      const r = (inj && inj[0] && inj[0].result) || { ok: false, status: 0, body: "" };
      return { ok: r.ok, status: r.status, text: async () => r.body, json: async () => JSON.parse(r.body) };
    };
  }

  // Last-resort caption rescue, run when the timedtext route came back empty
  // or gated. Two in-page routes, both same-origin from the YouTube tab:
  //  1. /youtubei/v1/get_transcript -- the endpoint behind YouTube's own
  //     "Show transcript" panel. params comes from the page's live data
  //     (ytd-app polymer data tracks SPA navigation; the load-time
  //     ytInitialData is the direct-open fallback) and is accepted only if
  //     its protobuf carries this videoId in cleartext. context comes from
  //     the page's real ytcfg (correct clientVersion/visitorData). This is
  //     the call the UI itself makes, from the environment the UI runs in.
  //  2. /youtubei/v1/player with the IOS client: its captionTracks baseUrls
  //     are not PO-Token-gated (community-verified 2026-01), then json3.
  async function ytTabPanelTranscript(tabId, videoId, hl, fallbackParams) {
    let inj = null;
    try {
      inj = await chrome.scripting.executeScript({
        target: { tabId },
        world: "MAIN",
        func: async (vid, lang, fbParams) => {
          // out.trace carries WHY each route failed back to the extension
          // page, where it is console.warn'd -- this chain being silent is
          // how four device-report rounds went undiagnosable.
          const out = { kind: "", body: "", trace: [] };
          const paramsFor = () => {
            const scan = (root) => {
              try {
                const panels = root && root.engagementPanels;
                if (!Array.isArray(panels)) return "";
                for (const p of panels) {
                  const m = JSON.stringify(p).match(/"getTranscriptEndpoint":\{"params":"([^"]+)"/);
                  if (m) return m[1];
                }
              } catch (_) {}
              return "";
            };
            let params = "";
            try {
              const app = document.querySelector("ytd-app");
              params = scan(app && app.data) || scan(app && app.data && app.data.response);
            } catch (_) {}
            if (!params) { try { params = scan(window.ytInitialData); } catch (_) {} }
            if (params) {
              try {
                if (!atob(params.replace(/-/g, "+").replace(/_/g, "/")).includes(vid)) params = "";
              } catch (_) { params = ""; }
            }
            return params;
          };
          const pageContext = () => {
            try {
              const c = window.ytcfg && (window.ytcfg.data_ ? window.ytcfg.data_.INNERTUBE_CONTEXT
                : (window.ytcfg.get && window.ytcfg.get("INNERTUBE_CONTEXT")));
              if (c && c.client) return JSON.parse(JSON.stringify(c));
            } catch (_) {}
            return { client: { clientName: "WEB", clientVersion: "2.20260101.00.00" } };
          };
          try {
            let params = paramsFor();
            if (!params && fbParams) { params = fbParams; out.trace.push("get_transcript: using hand-built params"); }
            if (!params) out.trace.push("get_transcript: no params at all");
            if (params) {
              const r = await fetch("/youtubei/v1/get_transcript?prettyPrint=false", {
                method: "POST", credentials: "same-origin",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ context: pageContext(), params: params }),
                signal: AbortSignal.timeout(15000),
              });
              if (r.ok) {
                const txt = await r.text();
                if (txt && txt.length > 50) { out.kind = "panel"; out.body = txt; return out; }
                out.trace.push("get_transcript: 200 but body len " + (txt ? txt.length : 0));
              } else {
                out.trace.push("get_transcript: HTTP " + r.status);
              }
            }
          } catch (e) { out.trace.push("get_transcript: " + String((e && e.message) || e)); }
          try {
            const r = await fetch("/youtubei/v1/player?prettyPrint=false", {
              // same-origin: the fully anonymous form was tried and refused
              // live on a clean residential device (trace: "ios player:
              // status LOGIN_REQUIRED, tracks 0"), while the one verified
              // success carried the page's visitor session. Keep the session.
              method: "POST", credentials: "same-origin",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                context: { client: { clientName: "IOS", clientVersion: "20.10.38", deviceMake: "Apple", deviceModel: "iPhone16,2", osName: "iPhone", osVersion: "18.3.2.22D82" } },
                videoId: vid, contentCheckOk: true, racyCheckOk: true,
              }),
              signal: AbortSignal.timeout(15000),
            });
            if (r.ok) {
              const pj = await r.json();
              const ps = pj && pj.playabilityStatus && pj.playabilityStatus.status;
              const list = pj && pj.captions && pj.captions.playerCaptionsTracklistRenderer
                && pj.captions.playerCaptionsTracklistRenderer.captionTracks;
              if (Array.isArray(list) && list.length) {
                const base = String(lang || "").toLowerCase().split("-")[0];
                const tr = list.find((t) => String(t.languageCode || "").toLowerCase().split("-")[0] === base && t.kind !== "asr")
                  || list.find((t) => t.kind !== "asr") || list[0];
                const u = tr.baseUrl + (tr.baseUrl.indexOf("?") !== -1 ? "&" : "?") + "fmt=json3";
                const r2 = await fetch(u, { credentials: "same-origin", signal: AbortSignal.timeout(15000) });
                if (r2.ok) {
                  const t3 = await r2.text();
                  if (t3 && t3.length > 20) { out.kind = "json3"; out.body = t3; return out; }
                  out.trace.push("ios timedtext: 200 but body len " + (t3 ? t3.length : 0));
                } else {
                  out.trace.push("ios timedtext: HTTP " + r2.status);
                }
              } else {
                out.trace.push("ios player: status " + (ps || "?") + ", tracks " + (Array.isArray(list) ? list.length : 0));
              }
            } else {
              out.trace.push("ios player: HTTP " + r.status);
            }
          } catch (e) { out.trace.push("ios player: " + String((e && e.message) || e)); }
          return out;
        },
        args: [videoId, hl || "", fallbackParams || ""],
      });
    } catch (e) {
      console.warn("[pbp-video] rescue injection failed:", (e && e.message) || e);
      return null;
    }
    const r = inj && inj[0] && inj[0].result;
    // info, not warn: these are intermediate tiers -- the run often still
    // succeeds a tier later, and a warn here reads as a fault to the user.
    if (r && Array.isArray(r.trace) && r.trace.length) console.info("[pbp-video] rescue trace:", r.trace.join(" | "));
    if (!r || !r.kind) return null;
    try {
      if (r.kind === "panel") return pbpYtParseTranscriptPanel(JSON.parse(r.body));
      if (r.kind === "json3") return pbpYtParseJson3(r.body);
    } catch (e) {
      console.warn("[pbp-video] rescue parse (" + r.kind + "):", (e && e.message) || e);
    }
    return null;
  }

  // Final rescue tier, research-corrected (Codex 2026-08-22). All four
  // direct network routes are bot-walled, but the page's OWN frontend
  // authenticates fine -- so make IT do the work and take the result:
  //  1. MAIN-world temporary fetch/XHR taps capture the transcript JSON the
  //     page itself requests (/get_transcript classic tree, or the PAmodern
  //     /get_panel viewmodel grade);
  //  2. the panel is opened through the REAL control chain (expand the
  //     description, click "Show transcript") -- setAttribute only flips the
  //     shell and never loads data, which is why the previous tier saw
  //     "panel opened but no segments appeared";
  //  3. DOM fallback reads BOTH row generations (2026 migration:
  //     transcript-segment-view-model vs ytd-transcript-segment-renderer)
  //     with scroll-and-accumulate, since the list is virtualized and
  //     recycles off-screen rows.
  async function ytTabDomTranscript(tabId) {
    let inj = null;
    try {
      inj = await chrome.scripting.executeScript({
        target: { tabId },
        world: "MAIN", // the fetch/XHR taps must live in the page world
        func: async () => {
          const out = { kind: "", body: "", segs: [], trace: "" };
          const q = (s, r) => (r || document).querySelector(s);
          const qa = (s, r) => Array.from((r || document).querySelectorAll(s));
          const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
          const parseTs = (t) => {
            const parts = String(t || "").trim().split(":").map(Number);
            if (!parts.length || parts.some(isNaN)) return 0;
            return parts.reduce((a, b) => a * 60 + b, 0);
          };
          const ROW_SEL = "transcript-segment-view-model, ytd-transcript-segment-renderer";
          const TS_SEL = ".ytwTranscriptSegmentViewModelTimestamp, .segment-timestamp";
          const TX_SEL = ".yt-core-attributed-string[role='text'], span[role='text'], .segment-text, yt-formatted-string";
          // Shadow-piercing queries: the 2026 panel generations render rows
          // inside open shadow roots that plain querySelectorAll never sees
          // (the prime suspect behind "panel opened but no rows"). Scoped to
          // the panel subtree to stay cheap inside the poll loop.
          const deepQA = (sel, root) => {
            const out = [];
            const walk = (r) => {
              try { r.querySelectorAll(sel).forEach((n) => out.push(n)); } catch (_) {}
              let all = [];
              try { all = r.querySelectorAll("*"); } catch (_) { return; }
              for (const n of all) if (n.shadowRoot) walk(n.shadowRoot);
            };
            walk(root || document);
            return out;
          };
          const deepQ = (sel, root) => deepQA(sel, root)[0] || null;
          const panels = () => qa('ytd-engagement-panel-section-list-renderer[target-id*="transcript"]');
          const readRows = () => {
            let rows = qa(ROW_SEL);
            if (!rows.length) for (const p of panels()) { rows = deepQA(ROW_SEL, p); if (rows.length) break; }
            return rows.map((row) => {
              const ts = q(TS_SEL, row) || deepQ(TS_SEL, row);
              const tx = q(TX_SEL, row) || deepQ(TX_SEL, row);
              return {
                from: parseTs(ts && ts.textContent),
                to: 0,
                content: ((tx && tx.textContent) || "").replace(/\s+/g, " ").trim(),
              };
            }).filter((s) => s.content);
          };
          // What is ACTUALLY inside the panels -- read the answer instead of
          // guessing the next selector when rows stay at zero.
          const panelDiag = () => panels().map((p) => {
            const tags = new Set();
            deepQA("*", p).slice(0, 400).forEach((n) => { if (tags.size < 15) tags.add(n.tagName.toLowerCase()); });
            return (p.getAttribute("target-id") || "?") + "[vis=" + (p.getAttribute("visibility") || "?") + ",h=" + p.offsetHeight + "]{" + Array.from(tags).join(",") + "}";
          }).join(" ; ") || "no transcript panels in DOM";

          // -- network taps (restored in finally) --
          const origFetch = window.fetch;
          const origOpen = XMLHttpRequest.prototype.open;
          const origSend = XMLHttpRequest.prototype.send;
          let captured = "";
          let opened = false;
          const wants = (u) => /\/youtubei\/v1\/(get_transcript|get_panel)/.test(String(u || ""));
          const keeps = (t) => t && /transcriptSegment(ViewModel|Renderer)|transcriptSearchPanelRenderer/.test(t);
          try {
            window.fetch = function (...a) {
              const p = origFetch.apply(this, a);
              try {
                const u = (a[0] && a[0].url) || a[0];
                if (!captured && wants(u)) {
                  p.then((resp) => resp.clone().text().then((t) => { if (!captured && keeps(t)) captured = t; }).catch(() => {})).catch(() => {});
                }
              } catch (_) {}
              return p;
            };
            XMLHttpRequest.prototype.open = function (m, u, ...rest) {
              this.__pbpUrl = u;
              return origOpen.call(this, m, u, ...rest);
            };
            XMLHttpRequest.prototype.send = function (...a) {
              try {
                if (!captured && wants(this.__pbpUrl)) {
                  this.addEventListener("load", () => {
                    try { if (!captured && keeps(this.responseText)) captured = this.responseText; } catch (_) {}
                  });
                }
              } catch (_) {}
              return origSend.apply(this, a);
            };

            // already-open panel with rows? read it without touching the UI
            let segs = readRows();
            if (!segs.length) {
              // real control chain: expand the description, then the button
              const expand = q("ytd-text-inline-expander #expand, tp-yt-paper-button#expand, #description #expand");
              if (expand) { try { expand.click(); } catch (_) {} await sleep(400); }
              let btn = q("ytd-video-description-transcript-section-renderer button");
              for (let i = 0; i < 8 && !btn; i++) { await sleep(400); btn = q("ytd-video-description-transcript-section-renderer button"); }
              if (btn) { btn.click(); opened = true; }
              else {
                const panel = qa('ytd-engagement-panel-section-list-renderer[target-id*="transcript"]')[0];
                if (panel) { panel.setAttribute("visibility", "ENGAGEMENT_PANEL_VISIBILITY_EXPANDED"); opened = true; out.trace = "no transcript button; shell-opened panel (may not load data)"; }
                else { out.trace = "no transcript entry in page"; return out; }
              }
              // wait for the page's own request or for rows, whichever first
              for (let i = 0; i < 36 && !captured; i++) {
                await sleep(400);
                segs = readRows();
                if (segs.length) break;
              }
            }
            if (captured) { out.kind = "net"; out.body = captured; return out; }
            if (segs.length) {
              // virtualized list: scroll and accumulate. Keyed by timestamp
              // with LAST read winning: rows caught mid-recycle during the
              // scroll yield garbled mixed text, and the stable re-read a
              // beat later must replace them (a first-read-wins content key
              // kept both the garbled and the clean row).
              const seen = new Map();
              const keep = (list) => list.forEach((s) => seen.set(s.from, s));
              keep(segs);
              const row0 = q(ROW_SEL);
              let scroller = row0 && row0.parentElement;
              while (scroller && scroller !== document.body && scroller.scrollHeight <= scroller.clientHeight + 4) scroller = scroller.parentElement;
              if (scroller && scroller !== document.body) {
                let stable = 0, lastCount = seen.size;
                for (let i = 0; i < 80 && stable < 3; i++) {
                  scroller.scrollTop += Math.max(120, scroller.clientHeight * 0.9);
                  await sleep(280); // let recycled rows settle before reading
                  keep(readRows());
                  if (seen.size === lastCount) stable++; else { stable = 0; lastCount = seen.size; }
                }
                scroller.scrollTop = 0;
              }
              out.kind = "dom";
              out.segs = Array.from(seen.values()).sort((a, b) => a.from - b.from);
              return out;
            }
            if (!out.trace) out.trace = "no rows, no captured response; panels: " + panelDiag();
            return out;
          } finally {
            window.fetch = origFetch;
            XMLHttpRequest.prototype.open = origOpen;
            XMLHttpRequest.prototype.send = origSend;
            // leave the page as we found it -- close only what we opened
            if (opened) {
              try {
                const p = qa('ytd-engagement-panel-section-list-renderer[target-id*="transcript"]')
                  .find((x) => x.getAttribute("visibility") === "ENGAGEMENT_PANEL_VISIBILITY_EXPANDED");
                if (p) p.setAttribute("visibility", "ENGAGEMENT_PANEL_VISIBILITY_HIDDEN");
              } catch (_) {}
            }
          }
        },
      });
    } catch (e) {
      console.warn("[pbp-video] dom transcript injection failed:", (e && e.message) || e);
      return null;
    }
    const r = inj && inj[0] && inj[0].result;
    if (r && r.trace) console.warn("[pbp-video] dom transcript:", r.trace);
    if (!r) return null;
    if (r.kind === "net") {
      try {
        const data = JSON.parse(r.body);
        const viaActions = pbpYtParseTranscriptPanel(data);
        const segs = viaActions.length ? viaActions : pbpYtParseTranscriptDeep(data);
        if (segs.length) return segs;
      } catch (e) {
        console.warn("[pbp-video] captured transcript parse:", (e && e.message) || e);
      }
      return null;
    }
    return (r.segs && r.segs.length) ? r.segs : null;
  }

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function seekTo(sec) {
    if (!_iframe || !_iframe.contentWindow) return;
    if (_isBili) {
      // player.bilibili.com exposes no postMessage seek API; the only
      // working jump is reloading the iframe with its t= start parameter.
      // Costs a reload flash, buys clickable transcript rows.
      try {
        const u = new URL(_iframe.src);
        u.searchParams.set("t", String(Math.max(0, Math.floor(sec))));
        u.searchParams.set("autoplay", "1");
        _iframe.src = u.toString();
      } catch (_) {}
      return;
    }
    // The relay forwards only these two commands to the nested YouTube
    // iframe (see docs/yt-embed.html) -- the extension speaks the relay's
    // small protocol, not the raw IFrame API, and never posts to "*".
    // Best-effort: if the player isn't ready the message is dropped -- the
    // row click then simply does nothing (degrade, never throw).
    const post = (func, args) => _iframe.contentWindow.postMessage(
      { pbpVideo: 1, func, args: args || [] }, RELAY_ORIGIN);
    post("seekTo", [sec, true]);
    post("playVideo");
  }

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
      } else {
        row.tabIndex = -1;
      }
      frag.appendChild(row);
    });
    listEl.appendChild(frag);
  }

  async function loadFlow(detected, statusEl, bodyEl, trackSel, copyBtn, adoptBtn, aiBtn) {
    statusEl.textContent = t("mdVideoLoading");
    const isBili = detected.provider === "bilibili";
    let granted = false;
    try { granted = await chrome.permissions.request({ origins: [isBili ? BILI_ORIGIN : YT_ORIGIN] }) === true; } catch (_) {}
    if (!granted) { statusEl.textContent = t("mdVideoPermMissing"); return; }
    let res;
    let useLogin = false;
    let ytHadTab = false;
    if (isBili) {
      res = await pbpBiliFetchTranscript(detected.bvid, detected.part, {});
      if (res.meta && res.meta.title) _meta.title = res.meta.title;
    } else {
      const uiLang = (chrome.i18n && chrome.i18n.getUILanguage && chrome.i18n.getUILanguage()) || "en";
      // Tab route first: the page's own session succeeds where the extension
      // page's cross-site fetch is bot-gated (see ytTabFetchFn). The
      // extension-page fetch stays as the no-tab fallback, still governed by
      // the login opt-in (the tab route needs no opt-in -- it reads through
      // the user's own open page, adding nothing they haven't already sent).
      _ytFetchFn = null;
      const fetchTabId = await ytFindFetchTab();
      ytHadTab = fetchTabId != null;
      if (ytHadTab) {
        const tabFetch = ytTabFetchFn(fetchTabId, detected.videoId);
        res = await pbpYtFetchTranscript(detected.videoId, { uiLang, fetchFn: tabFetch });
        console.info("[pbp-video] tab route (tab " + fetchTabId + "):", res.error || ("ok, " + (res.segments || []).length + " segments"));
        if (!res.error || res.tracks) _ytFetchFn = tabFetch;
      } else {
        console.info("[pbp-video] no eligible www.youtube.com tab; using extension-page fetch only");
      }
      if (!res || (res.error && !res.tracks)) {
        try {
          const s = await pbpReadSettingsWithSecrets({ mdVideoUseLogin: SETTINGS_DEFAULTS.mdVideoUseLogin });
          useLogin = s && s.mdVideoUseLogin === true;
        } catch (_) {}
        const fb = await pbpYtFetchTranscript(detected.videoId, { uiLang, useLogin });
        console.info("[pbp-video] extension-page fallback (login " + useLogin + "):", fb.error || ("ok, " + (fb.segments || []).length + " segments"));
        // Keep whichever answer got further: a fallback that also failed must
        // not overwrite a tab result that at least carried the track list.
        if (!res || !fb.error || fb.tracks) { res = fb; _ytFetchFn = null; }
      }
      // Both timedtext routes failed (typically exp=xpe: the text is
      // PO-Token-gated even when the track list arrives). Ask the tab for the
      // transcript the way YouTube's own panel does. The stale track picker
      // is dropped on success: its timedtext URLs are exactly what just
      // failed, so offering them as "switch track" would be a trap.
      if (ytHadTab && res && res.error) {
        // Hand-build a transcript-panel params token from the track list the
        // failed timedtext round already gave us (language + asr), so the
        // rescue no longer depends on finding an endpoint in the page data.
        const rTrack = (res.tracks && res.tracks.length)
          ? (pbpYtPickTrack(res.tracks, uiLang) || res.tracks[0]) : null;
        const fbParams = pbpYtTranscriptParams(detected.videoId,
          rTrack ? rTrack.lang : (String(uiLang || "en").split("-")[0]), !!(rTrack && rTrack.asr));
        const segs = await ytTabPanelTranscript(fetchTabId, detected.videoId, uiLang, fbParams);
        console.info("[pbp-video] panel rescue:", segs ? segs.length + " segments" : "failed");
        if (segs && segs.length) res = { tracks: [], track: null, segments: segs };
        // Endpoint rescue exhausted -> read what YouTube's own UI renders.
        if (res.error) {
          const domSegs = await ytTabDomTranscript(fetchTabId);
          console.info("[pbp-video] dom rescue:", domSegs ? domSegs.length + " segments" : "failed");
          if (domSegs && domSegs.length) res = { tracks: [], track: null, segments: domSegs };
        }
      }
    }
    if (res.error === "player" || res.error === "view") { statusEl.textContent = t("mdVideoFailed"); return; }
    if (res.error === "login") { statusEl.textContent = t("mdVideoBiliLogin"); return; }
    // YouTube answered, but about us rather than about the video: the request
    // was gated (bot check / age wall / unplayable). Saying "no subtitles"
    // here would be a lie, and would point the user at the wrong problem. When
    // no YouTube tab was open to fetch through, say what actually helps.
    if (res.error === "blocked") {
      statusEl.textContent = t("mdVideoBlocked") + (ytHadTab ? "" : " " + t("mdVideoOpenTabHint"));
      return;
    }
    if (res.error === "no-tracks" || res.error === "caption-body") {
      // "no subtitles" would be a lie when the track list is sitting right
      // there -- caption-body means the TEXT was withheld (PO-Token-gated
      // timedtext), and switching tracks re-fetches through the picker.
      statusEl.textContent = t(res.error === "caption-body" && res.tracks ? "mdVideoBodyBlocked" : "mdVideoNoTracks");
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
    // punctuation enhancement: heuristic tier applies silently; the AI
    // button only appears for tracks the detector judged unpunctuated.
    _aiPunctParas = null;
    let wasUnpunct = false;
    if ((res.segments || []).length && typeof pbpVideoNeedsPunctuation === "function" && pbpVideoNeedsPunctuation(res.segments)) {
      wasUnpunct = true;
      res.segments = pbpVideoHeuristicPunctuate(res.segments);
    }
    if (aiBtn) {
      let aiOk = false;
      try {
        const sa = typeof pbpAiGetSettings === "function" ? await pbpAiGetSettings() : null;
        aiOk = !!(sa && typeof pbpAiAvailable === "function" && pbpAiAvailable(sa));
      } catch (_) {}
      aiBtn.hidden = !(wasUnpunct && (res.segments || []).length && aiOk);
    }
    copyBtn.hidden = !(res.segments || []).length;
    if (adoptBtn) adoptBtn.hidden = !((res.segments || []).length && typeof window.pbpAdoptTranscript === "function");
    _segments = res.segments || [];
    _meta.trackLabel = res.track ? (isBili ? res.track.lan_doc : res.track.label) : "";
    if (_segments.length) renderTranscript(bodyEl, _segments, true);
    trackSel.addEventListener("change", async () => {
      statusEl.textContent = t("mdVideoLoading");
      const segs = isBili ? await pbpBiliFetchSubtitleBody(trackSel.value) : await pbpYtFetchCaptionBody(trackSel.value, _ytFetchFn || undefined, useLogin);
      statusEl.textContent = segs.length ? "" : t("mdVideoNoTracks");
      if (segs.length && typeof pbpVideoNeedsPunctuation === "function" && pbpVideoNeedsPunctuation(segs)) {
        segs = pbpVideoHeuristicPunctuate(segs);
      }
      _aiPunctParas = null; // a new track invalidates the previous AI pass
      _segments = segs;
      const sel = trackSel.selectedOptions && trackSel.selectedOptions[0];
      _meta.trackLabel = sel ? sel.textContent : "";
      copyBtn.hidden = !segs.length;
      renderTranscript(bodyEl, segs, true);
    });
  }

  window.pbpVideoInit = function pbpVideoInit(ctx) {
    const detected = pbpVideoDetect(ctx && ctx.pageUrl);
    if (!detected) {
      console.info("[pbp-video] mount skipped: no video detected in", (ctx && ctx.pageUrl) || "(no pageUrl)");
      return;
    }
    const view = document.getElementById("rendered-view");
    if (!view || !view.parentNode || document.getElementById("video-panel")) {
      console.info("[pbp-video] mount skipped:", !view ? "no #rendered-view" : (document.getElementById("video-panel") ? "panel already mounted" : "detached view"));
      return;
    }
    console.info("[pbp-video] panel mounted for", detected.provider, ctx.pageUrl);
    _meta = { title: (ctx && ctx.title) || document.title || "", url: ctx.pageUrl };
    _ctxTabId = (ctx && typeof ctx.tabId === "number") ? ctx.tabId : null;

    const panel = el("section", "video-panel");
    panel.id = "video-panel";
    panel.setAttribute("aria-label", t("mdVideoTitle"));

    // Poster-card state (design option A): a 16:9 card the same size as the
    // player that replaces it, so loading causes no layout shift.
    const cta = el("button", "pbv-poster");
    cta.type = "button";
    cta.title = t("mdVideoLoad");
    cta.setAttribute("aria-label", t("mdVideoLoad"));
    const posterUrl = pbpVideoPosterUrl(detected);
    if (posterUrl) {
      const poster = document.createElement("img");
      poster.src = posterUrl;
      poster.loading = "lazy";
      poster.referrerPolicy = "no-referrer";
      poster.alt = "";
      // A blocked/missing poster degrades to the plain placeholder card
      // instead of a broken-image icon.
      poster.addEventListener("error", () => { poster.style.display = "none"; }, { once: true });
      cta.appendChild(poster);
    }
    const play = el("span", "pbv-play");
    play.setAttribute("aria-hidden", "true");
    play.innerHTML = PBV_PLAY_SVG;
    cta.appendChild(play);
    cta.appendChild(el("span", "pbv-poster-label", t("mdVideoLoad")));
    panel.appendChild(cta);
    view.parentNode.insertBefore(panel, view);
    _panel = panel;

    cta.addEventListener("click", async () => {
      cta.disabled = true;
      // player iframe mounts immediately (no permission needed for a frame)
      const media = el("div", "pbv-media");
      _iframe = document.createElement("iframe");
      _isBili = detected.provider === "bilibili";
      _iframe.src = detected.provider === "bilibili"
        ? "https://player.bilibili.com/player.html?bvid=" + detected.bvid + "&page=" + detected.part + "&high_quality=1&danmaku=0"
        : RELAY_BASE + "?v=" + encodeURIComponent(detected.videoId);
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
          await navigator.clipboard.writeText(pbpVideoTranscriptMarkdown(_segments, _meta, _aiPunctParas));
          const prev = copyBtn.textContent;
          copyBtn.textContent = t("mdVideoCopied");
          setTimeout(() => { copyBtn.textContent = prev; }, 1800);
        } catch (_) { status.textContent = t("mdVideoCopyFailed"); }
      });
      // "Use as article": only offered on the empty-document shells (the two
      // video-page mount paths define pbpAdoptTranscript; the normal article
      // path nulls it). Rebuilds the page THROUGH the canonical payload +
      // reload, so the rail, exports, Ask, and translation all run on the
      // transcript exactly as they would on an extracted article.
      const adoptBtn = el("button", "pbv-adopt");
      adoptBtn.type = "button";
      adoptBtn.hidden = true;
      adoptBtn.textContent = t("mdVideoAdoptDoc");
      adoptBtn.addEventListener("click", () => {
        if (typeof window.pbpAdoptTranscript !== "function" || !_segments.length) return;
        adoptBtn.disabled = true;
        try { window.pbpAdoptTranscript(pbpVideoTranscriptMarkdown(_segments, _meta, _aiPunctParas), _meta.title || ""); }
        catch (_) { adoptBtn.disabled = false; }
      });
      // AI punctuation (combo plan, user-picked): heuristic tier applies
      // automatically in loadFlow; this button upgrades the Copy/Use-as-
      // article text via the configured AI provider. Spends tokens, so it
      // is a deliberate click behind the robot icon (icon contract) and only
      // shows for tracks the detector judged unpunctuated.
      const aiBtn = el("button", "pbv-ai-punct");
      aiBtn.type = "button";
      aiBtn.hidden = true;
      aiBtn.innerHTML = typeof PBP_ICONS !== "undefined" ? PBP_ICONS.robot : "";
      const aiLabel = el("span", "", t("mdVideoAiPunct"));
      aiBtn.appendChild(aiLabel);
      aiBtn.addEventListener("click", async () => {
        if (!_segments.length || aiBtn.disabled) return;
        aiBtn.disabled = true;
        aiLabel.textContent = t("mdVideoAiPunct") + "…";
        try {
          const paras = pbpVideoMergeParagraphs(_segments);
          const batches = [];
          let cur = [], len = 0;
          for (const para of paras) {
            cur.push(para); len += para.length;
            if (len > 1600) { batches.push(cur.join("\n")); cur = []; len = 0; }
          }
          if (cur.length) batches.push(cur.join("\n"));
          const sa = await pbpAiGetSettings();
          const outBatches = [];
          for (const b of batches) {
            const prompt = "为下面的语音转写文本添加或修正标点符号，并按语义用空行分段。严格保持文字本身不变：不得增加、删除或改写任何非标点文字。直接输出处理后的文本，不要任何解释。\n\n" + b;
            const text = await callAI(sa, prompt);
            // fail-closed per batch: a batch the model rewrote keeps its input
            outBatches.push(pbpVideoPunctConserved(b, text) ? String(text).trim() : b);
          }
          _aiPunctParas = outBatches.join("\n\n").split(/\n{2,}/)
            .map((x) => x.replace(/\s+/g, " ").trim()).filter(Boolean);
          // Make the pass visible where the user is looking: map the marks
          // back onto the timed rows and re-render the panel (fail-closed --
          // on any stream mismatch the rows simply keep their current text).
          const applied = pbpVideoApplyPunctText(_segments, outBatches.join("\n"));
          if (applied) {
            _segments = applied;
            renderTranscript(body, _segments, true);
          }
          aiLabel.textContent = t("mdVideoAiPunctDone");
        } catch (e) {
          console.warn("[pbp-video] ai punctuation:", (e && e.message) || e);
          _aiPunctParas = null;
          status.textContent = t("mdVideoAiPunctFail");
          aiLabel.textContent = t("mdVideoAiPunct");
          aiBtn.disabled = false;
        }
      });
      bar.appendChild(trackSel); bar.appendChild(copyBtn); bar.appendChild(adoptBtn); bar.appendChild(aiBtn);
      if (detected.provider === "youtube") {
        // Relay-failure degrade: the player depends on GitHub Pages staying
        // up; this always-present link needs no failure detection (a
        // cross-origin iframe load can't be inspected for a 404/DNS failure)
        // and bounds the dependency by giving a working path regardless.
        const openExt = document.createElement("a");
        openExt.className = "action-btn pbv-open-ext";
        openExt.href = "https://www.youtube.com/watch?v=" + encodeURIComponent(detected.videoId);
        openExt.target = "_blank";
        openExt.rel = "noopener noreferrer";
        openExt.innerHTML = PBV_EXTERNAL_SVG;
        openExt.appendChild(el("span", "btn-label", t("mdVideoOpenExternal")));
        bar.appendChild(openExt);
      }
      bar.appendChild(status);
      const body = el("div", "pbv-list");
      panel.replaceChildren(media, bar, body);
      await loadFlow(detected, status, body, trackSel, copyBtn, adoptBtn, aiBtn);
    });
  };
})();
