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

// Track list a RESCUE session may offer for switching. Rescue sessions can
// only re-fetch per language through the page player's own caption machinery
// (ytTabPlayerCaptionCapture), and the player exposes one track per language:
// its tracklist hides the asr variant whenever a manual track exists for the
// same language (verified live 2026-08-23: player response carried ".en" AND
// "a.en", player tracklist only ".en", and setOption{kind:"asr"} silently
// fetched the manual track). Offering unswitchable asr variants in the picker
// would be a trap, so mirror the player's rule.
function pbpYtRescueTracks(tracks) {
  const list = Array.isArray(tracks) ? tracks : [];
  const manual = new Set(list.filter((tr) => tr && !tr.asr).map((tr) => String(tr.lang || "")));
  return list.filter((tr) => tr && (!tr.asr || !manual.has(String(tr.lang || ""))));
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
// AI pass was invisible everywhere except the committed article text. Deterministic because
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

// Which transcript row is the player inside at time t? Index of the LAST
// segment whose `from` is <= t, or -1 when t precedes the first segment (and
// for an empty list). Binary search rather than a scan because the relay
// reports four times a second and an hour-long video runs into the thousands
// of segments. Segments are assumed sorted by `from` -- every producer in
// this file emits them in track order.
function pbpVideoRowIndexAt(segments, t) {
  const segs = segments || [];
  const time = +t;
  if (!segs.length || !Number.isFinite(time)) return -1;
  let lo = 0, hi = segs.length - 1, found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    // Number(undefined) is NaN, not 0: a segment with no `from` must not read
    // as "starts at 0" and swallow every earlier row.
    const from = Number(segs[mid] && segs[mid].from);
    if (Number.isFinite(from) && from <= time) { found = mid; lo = mid + 1; }
    else hi = mid - 1;
  }
  return found;
}

function pbpVideoFmtTime(sec) {
  sec = Math.max(0, Math.floor(+sec || 0));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const p2 = (n) => (n < 10 ? "0" : "") + n;
  return h ? h + ":" + p2(m) + ":" + p2(s) : m + ":" + p2(s);
}

// THE meta builder for pbpVideoTranscriptMarkdown. Every caller that turns a
// session into transcript markdown -- md-preview.js's pre-render bootstrap,
// its error-shell commit, and md-video.js's panel (Copy, first-run commit, AI
// punctuation) -- goes through here, so the H2 heading, the track label, and
// the source blockquote are byte-identical across commits. Two commits of the
// same video that disagreed on the title would silently rewrite the article's
// first heading (and with it the TOC) under the reader.
function pbpVideoTranscriptMeta(session, fallbackTitle, pageUrl) {
  const track = session && session.track;
  return {
    title: (session && session.meta && session.meta.title) || fallbackTitle || "",
    url: pageUrl || "",
    trackLabel: track ? (track.label || track.lan_doc || "") : ""
  };
}

// Stable identity for a subtitle track, independent of its fetch endpoint
// (baseUrl/subtitle_url can expire or get re-signed on refetch) and of its
// display label (YouTube/bilibili can localize track names between fetches).
// YouTube: language + whether it's the auto-generated (asr) variant, since a
// video can carry both a manual and an asr track for the same language.
// bilibili: lan is the API's own stable id; a bare id covers list entries
// that arrive without one; lan_doc is the last resort. Null/undefined track
// or an unrecognized provider return "" rather than throwing -- callers
// (state build/validate, track-switch matching) treat "" as "no key".
function pbpVideoTrackKey(track, provider) {
  if (!track || !provider) return "";
  if (provider === "youtube") {
    const lang = track.lang || "";
    return lang ? "yt:" + lang + (track.asr ? ":asr" : "") : "";
  }
  if (provider === "bilibili") {
    const id = track.lan || track.id || track.lan_doc || "";
    return id ? "bili:" + id : "";
  }
  return "";
}

// Is a captured session about THIS video? md-preview.js runs the session
// before it renders, so by the time the panel mounts the transcript is usually
// already in hand -- reusing it is the difference between one capture
// round-trip per page and two. Identity is provider + video id; bilibili
// additionally compares `part`, since one bvid can host many parts (episodes)
// with entirely different subtitle tracks -- matching on bvid alone would
// silently reuse part 1's transcript on part 2's page.
function pbpVideoSessionMatches(session, detected) {
  const d = session && session.detected;
  if (!d || !detected || d.provider !== detected.provider) return false;
  return detected.provider === "bilibili"
    ? (d.bvid === detected.bvid && d.part === detected.part)
    : d.videoId === detected.videoId;
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

// Safe track descriptor for videoState.tracks -- key + display fields only,
// deliberately dropping baseUrl/subtitle_url. Those endpoints can be signed
// and expire; persisting them would let an F5 restore hand the picker a URL
// that 404s. Runtime re-maps a stable key back to a live endpoint only when
// the user actually switches tracks.
function _pbpVideoTrackDescribe(track, provider) {
  if (provider === "bilibili") {
    return {
      key: pbpVideoTrackKey(track, provider),
      lang: (track && track.lan) || "",
      label: (track && track.lan_doc) || "",
      asr: !!(track && _pbpBiliIsAi(track))
    };
  }
  return {
    key: pbpVideoTrackKey(track, provider),
    lang: (track && track.lang) || "",
    label: (track && track.label) || "",
    asr: !!(track && track.asr)
  };
}

// Versioned F5-persistence payload for a video transcript session. Bundles
// exactly what loadFlow() needs to redraw the panel and the article without
// a refetch: current segments, the AI-punctuation paragraphs (loadFlow
// currently zeroes _aiPunctParas unconditionally on every mount -- without
// carrying `paragraphs` through here, a reload would silently revert an
// AI-punctuated article to the heuristic tier), and enough video identity +
// track metadata for the picker to redraw its selection. Returns null when
// there is no video identity to key the state by -- nothing to persist.
function pbpVideoStateBuild(opts) {
  opts = opts || {};
  const detected = opts.detected;
  if (!detected) return null;
  const provider = detected.provider;
  const tracks = Array.isArray(opts.tracks) ? opts.tracks : [];
  const segments = Array.isArray(opts.segments) ? opts.segments : [];
  const aiParas = Array.isArray(opts.aiParas) && opts.aiParas.length ? opts.aiParas.slice() : null;
  const meta = opts.meta || {};
  const state = {
    v: 1,
    provider,
    selectedTrackKey: pbpVideoTrackKey(opts.track, provider),
    tracks: tracks.map((tr) => _pbpVideoTrackDescribe(tr, provider)),
    segments: segments.map((s) => ({
      from: +(s && s.from) || 0, to: +(s && s.to) || 0, content: String((s && s.content) || "")
    })),
    paragraphs: aiParas,
    wasUnpunct: !!opts.wasUnpunct,
    aiPunct: !!opts.aiPunct,
    meta: { title: meta.title || "", url: meta.url || "", trackLabel: meta.trackLabel || "" }
  };
  if (provider === "bilibili") { state.bvid = detected.bvid; state.part = detected.part; }
  else { state.videoId = detected.videoId; }
  return state;
}

// Fail-closed hydration gate: everything F5 restores from storage is
// untrusted until it passes here. Checks, cheapest/identity-shaped first:
// version, video identity (bilibili's `part` included -- see
// pbpVideoSessionMatches above), segment array shape/bounds, and finally
// that segments + paragraphs + meta reconstruct byte-identical markdown to
// the canonical article the page actually committed. That last check is the
// one that matters most: any drift between persisted timeline state and the
// committed article (a bug in this file, a manual storage edit, a schema
// migration gone wrong) must fall back to a live refetch rather than render
// a timeline that silently disagrees with the article above it.
function pbpVideoStateValidate(state, detected, canonicalMarkdown) {
  if (!state || typeof state !== "object") return false;
  if (state.v !== 1) return false;
  if (!detected) return false;
  if (state.provider !== detected.provider) return false;
  if (detected.provider === "bilibili") {
    if (state.bvid !== detected.bvid || state.part !== detected.part) return false;
  } else if (state.videoId !== detected.videoId) return false;
  const segs = state.segments;
  if (!Array.isArray(segs) || segs.length > 20000) return false;
  let totalChars = 0;
  for (const s of segs) {
    if (!s || typeof s !== "object") return false;
    if (typeof s.from !== "number" || !Number.isFinite(s.from)) return false;
    if (typeof s.to !== "number" || !Number.isFinite(s.to)) return false;
    if (typeof s.content !== "string") return false;
    totalChars += s.content.length;
    if (totalChars > 2 * 1024 * 1024) return false;
  }
  if (state.paragraphs != null && !Array.isArray(state.paragraphs)) return false;
  if (typeof canonicalMarkdown !== "string") return false;
  return pbpVideoTranscriptMarkdown(segs, state.meta, state.paragraphs) === canonicalMarkdown;
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
// Panel and #rendered-view are never nested inside each other: translation
// re-renders replace renderedView's content and must never destroy the
// player. In video-mode (A2 workspace, mountVideoWorkspace) #video-panel
// lives in .pbv-col-player and #rendered-view in .pbv-col-study -- sibling
// grid columns, not sibling DOM nodes, but still disjoint subtrees. Outside
// video-mode (defensive fallback only) the panel stays a plain SIBLING
// above #rendered-view, as before.
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
  // Fix round 1 (reviewer-caught): renderTranscript's rAF batch chain had no
  // cancellation. A track-change (~1372) or AI-punctuation re-render (~1614)
  // firing while a PRIOR call's chain is still mid-flight (realistic on a
  // >200-segment transcript + a fast track switch) let the stale closure keep
  // appending old-track rows into the freshly cleared list after the new call
  // had already started rendering -- silent data pollution, and those rows'
  // seek handlers carried old-track timestamps. Each renderTranscript call
  // stamps its own epoch and every deferred continuation (the step() rAF
  // callback and the requestAnimationFrame(step) call itself) bails once a
  // newer call has bumped _renderEpoch past it.
  let _renderEpoch = 0;
  let _isBili = false; // provider of the mounted player -- seekTo() picks its jump mechanism by it
  let _aiPunctParas = null; // AI-punctuated paragraphs; Copy and the transcript commits prefer them
  let _ctxTabId = null;   // source tab from pbpVideoInit ctx (may be gone by click time)
  let _ytFetchFn = null;  // tab-injected fetchFn when the tab route won; null = extension-page fetch
  let _ytFetchTabId = null; // the tab behind _ytFetchFn -- the player-capture track switch injects into it
  window.pbpVideoSession = null; // latest prepareVideoSession() result, for md-preview.js

  // Study-column reading/timeline toggle (Task 4). Set by mountVideoWorkspace
  // only in video-mode workspaces; a non-video defensive mount (panel stays a
  // plain sibling of #rendered-view, .pbv-list stays inside the panel) leaves
  // these null, so setStudyView is a harmless no-op there.
  let _studyReadingEl = null, _studyListEl = null;
  let _toggleReadingBtn = null, _toggleTimelineBtn = null;

  // Playback-position sync (Task 6). _followOn is the toggle's state (default
  // ON); _currentRowIdx/_currentRowEl are the highlighted row (index for
  // change detection, element for the actual class removal -- a re-render
  // replaces the nodes, so the index alone would clear the wrong row).
  let _followOn = true, _followBtn = null;
  let _currentRowIdx = -1, _currentRowEl = null;
  let _helloTimer = null, _helloTries = 0, _relayAlive = false;

  // Same-origin caption fetch, executed INSIDE an open YouTube tab. From the
  // page's own context the watch HTML answers with an OK playabilityStatus
  // and caption baseUrls complete with their pot (PO Token) parameter; the
  // extension page's cross-site fetch gets LOGIN_REQUIRED instead -- login
  // cookies don't attach cross-site, and the botguard has no page context to
  // attest (probed live 2026-08: cookieless watch fetch = LOGIN_REQUIRED,
  // zero tracks). Injection rides the click-time https://www.youtube.com/*
  // grant plus the existing "scripting" permission -- no new permissions.
  async function ytFindFetchTab(tabId) {
    if (typeof tabId === "number") {
      try {
        const tab = await chrome.tabs.get(tabId);
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
              // virtualized list: scroll and accumulate. Two safeguards,
              // both learned from garbled rows on device: a row only counts
              // when two reads 120ms apart agree (a node caught mid-recycle
              // never survives that), and the FIRST stable version of a
              // timestamp is final -- last-read-wins let a row's dying
              // glimpse (recycled as it scrolled out) overwrite a good read.
              const seen = new Map();
              const keep = (list) => list.forEach((s) => { if (!seen.has(s.from)) seen.set(s.from, s); });
              const readStable = async () => {
                const a = readRows();
                await sleep(120);
                const b = readRows();
                const bk = new Set(b.map((s) => s.from + "|" + s.content));
                return a.filter((s) => bk.has(s.from + "|" + s.content));
              };
              keep(await readStable());
              const row0 = q(ROW_SEL);
              let scroller = row0 && row0.parentElement;
              while (scroller && scroller !== document.body && scroller.scrollHeight <= scroller.clientHeight + 4) scroller = scroller.parentElement;
              if (scroller && scroller !== document.body) {
                let stable = 0, lastCount = seen.size;
                for (let i = 0; i < 80 && stable < 3; i++) {
                  scroller.scrollTop += Math.max(120, scroller.clientHeight * 0.9);
                  await sleep(240);
                  keep(await readStable());
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

  // Player-driven caption capture: the one per-language fetch route that
  // still works (verified live 2026-08-23 on a 22-track video). Direct
  // timedtext answers 200/empty without a runtime PO Token even from the
  // page context with credentials, and hand-built get_transcript params die
  // on HTTP 400 (BotGuard) -- but the page player's OWN caption machinery
  // fetches through its signed internal URL and succeeds (43-53KB json3
  // captured for ja / zh-Hans / en). So make the player load the track
  // (loadModule + setOption) and tap its fetch/XHR round-trip. The caption
  // overlay flips on in the source tab for the capture's duration; prior
  // caption state is restored in finally (an empty getOption("captions",
  // "track") object means captions were off -- probed live).
  async function ytTabPlayerCaptionCapture(tabId, langCode) {
    let inj = null;
    try {
      inj = await chrome.scripting.executeScript({
        target: { tabId },
        world: "MAIN", // the fetch/XHR taps must live in the page world
        func: async (lang) => {
          const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
          const player = document.querySelector("#movie_player");
          if (!player || typeof player.setOption !== "function") return { body: "", trace: "no player api" };
          const origFetch = window.fetch;
          const origOpen = XMLHttpRequest.prototype.open;
          const origSend = XMLHttpRequest.prototype.send;
          let captured = "";
          const wants = (u) => /timedtext/.test(String(u || ""));
          let prior = null;
          try { prior = player.getOption("captions", "track"); } catch (_) {}
          try {
            window.fetch = function (...a) {
              const p = origFetch.apply(this, a);
              try {
                const u = (a[0] && a[0].url) || a[0];
                if (!captured && wants(u)) {
                  p.then((resp) => resp.clone().text().then((t) => { if (!captured && t) captured = t; }).catch(() => {})).catch(() => {});
                }
              } catch (_) {}
              return p;
            };
            XMLHttpRequest.prototype.open = function (m, u, ...rest) { this.__pbpUrl = u; return origOpen.call(this, m, u, ...rest); };
            XMLHttpRequest.prototype.send = function (...a) {
              try {
                if (!captured && wants(this.__pbpUrl)) {
                  this.addEventListener("load", () => {
                    try { if (!captured && this.responseText) captured = this.responseText; } catch (_) {}
                  });
                }
              } catch (_) {}
              return origSend.apply(this, a);
            };
            const drive = async () => {
              try { player.loadModule("captions"); } catch (_) {}
              await sleep(250);
              if (lang) { try { player.setOption("captions", "track", { languageCode: lang }); } catch (_) {} }
              // background-tab timers throttle to ~1Hz, so 15 ticks bounds
              // the wait at ~15s there while the foreground case lands in
              // one or two ticks (the XHR fires right after setOption)
              for (let i = 0; i < 15 && !captured; i++) await sleep(400);
            };
            await drive();
            if (!captured) {
              // a track the player already holds re-fetches only after a
              // module bounce
              try { player.unloadModule("captions"); } catch (_) {}
              await sleep(250);
              await drive();
            }
            return { body: captured, trace: captured ? "" : "no timedtext round-trip" };
          } finally {
            window.fetch = origFetch;
            XMLHttpRequest.prototype.open = origOpen;
            XMLHttpRequest.prototype.send = origSend;
            try {
              if (prior && prior.languageCode) player.setOption("captions", "track", prior);
              else player.unloadModule("captions");
            } catch (_) {}
          }
        },
        args: [langCode || ""],
      });
    } catch (e) {
      console.warn("[pbp-video] player capture injection failed:", (e && e.message) || e);
      return null;
    }
    const r = inj && inj[0] && inj[0].result;
    if (r && r.trace) console.info("[pbp-video] player capture:", r.trace);
    if (!r || !r.body) return null;
    // json3 first (the format observed live); srv/XML as the fallback shape
    try {
      const segs = pbpYtParseJson3(r.body);
      if (segs.length) return segs;
    } catch (e) { console.warn("[pbp-video] player capture parse:", (e && e.message) || e); }
    try {
      const segs = pbpYtParseTimedtextXml(r.body);
      if (segs.length) return segs;
    } catch (_) {}
    return null;
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

  // ---- playback-position sync (Task 6) -------------------------------
  // The relay (docs/yt-embed.html) stays silent until we speak: it arms its
  // outbound reporting on the FIRST valid inbound message and replies only to
  // that message's origin. "hello" is that opener. The relay page loads
  // YouTube's IFrame API before its player exists, but its message listener
  // is registered synchronously -- still, the frame's document may not have
  // run at all when we mount it, so the greeting repeats until an answer
  // comes back (or 10s of silence: no relay, no protocol, no harm).
  function sendRelayHello() {
    if (!_iframe || !_iframe.contentWindow) return;
    try {
      _iframe.contentWindow.postMessage({ pbpVideo: 1, func: "hello", args: [] }, RELAY_ORIGIN);
    } catch (_) { /* frame gone mid-flight; the interval below stops itself */ }
  }

  function stopRelayHello() {
    if (_helloTimer) { clearInterval(_helloTimer); _helloTimer = null; }
  }

  function startRelayHello() {
    stopRelayHello();
    _relayAlive = false;
    _helloTries = 0;
    sendRelayHello();
    _helloTimer = setInterval(() => {
      if (_relayAlive || !_iframe || ++_helloTries > 20) { stopRelayHello(); return; }
      sendRelayHello();
    }, 500);
  }

  // Inbound half of the protocol. Registered ONCE, at module load, and every
  // message is validated on BOTH origin and source before a single field is
  // read out of it: any page can postMessage to this one, and e.origin alone
  // does not prove the message came from OUR frame. Anything that fails is
  // dropped in silence -- no logging (it would be a free console-spam channel
  // for third parties).
  function onRelayMessage(e) {
    if (e.origin !== RELAY_ORIGIN) return;
    if (!_iframe || !_iframe.contentWindow || e.source !== _iframe.contentWindow) return;
    const d = e.data;
    if (!d || typeof d !== "object" || d.pbpVideo !== 1) return;
    // "ready" carries no data and moves nothing on screen; it is proof of
    // life only, which is what lets the greeting loop stop early.
    if (d.event === "ready") { _relayAlive = true; return; }
    if (d.event !== "time") return;
    _relayAlive = true;
    highlightRowAt(d.t);
  }
  window.addEventListener("message", onRelayMessage);

  function transcriptListEl() {
    return _studyListEl || (_panel ? _panel.querySelector(".pbv-list") : null);
  }

  // Move the current-row marker. Cheap by design: the relay reports 4x/second
  // but a row change happens at transcript pace, so everything below the
  // index comparison runs only on an actual change.
  function highlightRowAt(t) {
    const list = transcriptListEl();
    if (!list) return;
    const idx = pbpVideoRowIndexAt(_segments, t);
    if (idx === _currentRowIdx) return;
    const rows = list.children;
    // renderTranscript appends in rAF-paced batches, so on a long transcript
    // the target row may not exist yet. Skip this tick entirely (keeping the
    // old index so the change is still pending) and let the next report --
    // 250ms later, by which time more batches have landed -- catch up.
    if (idx >= 0 && idx >= rows.length) return;
    if (_currentRowEl) {
      _currentRowEl.classList.remove("pbv-row--current");
      _currentRowEl.removeAttribute("aria-current");
    }
    _currentRowIdx = idx;
    _currentRowEl = idx >= 0 ? rows[idx] : null;
    if (!_currentRowEl) return;
    _currentRowEl.classList.add("pbv-row--current");
    _currentRowEl.setAttribute("aria-current", "true");
    // Follow only when the timeline is the visible study view: scrolling a
    // hidden list is pointless, and in video-mode the list shares the page
    // scroller with the article -- following while the user reads would drag
    // the article out from under them.
    if (_followOn && !list.hidden && playerHoldsPosition()) {
      try { followScrollTo(_currentRowEl, list); } catch (_) {}
    }
  }

  // Park the current row at ~35% viewport height -- upper-middle, level with
  // the sticky player's vertical center -- so the eye never travels between
  // video and caption (device feedback 2026-08-23; block:"nearest" only kept
  // the row on-screen, usually pinned to the bottom edge). Manual scrolling
  // still wins: any wheel/touch/key in the study column flips _followOn off
  // (bindFollowPause), and a user scroll naturally cancels an in-flight
  // smooth animation. Position correctness never depends on the animation
  // (md-preview rule), so reduced-motion simply jumps.
  function followScrollTo(row, list) {
    const behavior = (typeof matchMedia === "function"
      && matchMedia("(prefers-reduced-motion: reduce)").matches) ? "auto" : "smooth";
    // The non-video defensive mount keeps the list as its own scroller
    // (max-height 40vh); the video-mode workspace unclamps it, so the PAGE
    // scrolls. The overflow state IS the layout answer -- read it rather
    // than re-deriving the mode here.
    if (list.scrollHeight > list.clientHeight + 4) {
      list.scrollTo({ top: Math.max(0, row.offsetTop - Math.round(list.clientHeight * 0.35)), behavior });
      return;
    }
    const r = row.getBoundingClientRect();
    const top = Math.max(0, (window.scrollY || 0) + r.top - Math.round(window.innerHeight * 0.35));
    window.scrollTo({ top, behavior });
  }

  // Follow is only safe while the player stays put as the page scrolls. In
  // the narrow single-column layout (@container max-width:1220px in
  // md-preview.css) the panel drops to position:static ABOVE the list, so a
  // page-level scrollIntoView walks the video off screen -- the exact thing
  // following is meant to prevent. The computed position IS the layout state,
  // so read it instead of re-deriving the breakpoint here (also correct for
  // the non-video defensive mount, where the panel was never sticky). Read
  // per row change, not per report: a row changes at transcript pace.
  function playerHoldsPosition() {
    if (!_panel || typeof getComputedStyle !== "function") return false;
    try { return getComputedStyle(_panel).position === "sticky"; } catch (_) { return false; }
  }

  function clearCurrentRow() {
    if (_currentRowEl) {
      _currentRowEl.classList.remove("pbv-row--current");
      _currentRowEl.removeAttribute("aria-current");
    }
    _currentRowIdx = -1;
    _currentRowEl = null;
  }

  function setFollow(on) {
    _followOn = !!on;
    if (_followBtn) _followBtn.setAttribute("aria-pressed", _followOn ? "true" : "false");
  }

  // Any scroll/seek intent inside the list means the user took the wheel;
  // auto-scrolling on top of that is the classic fight-the-user bug. Follow
  // stays off until they press the toggle again -- named handlers so a second
  // runLoad on the same list re-registers nothing.
  function onListWheel() { if (_followOn) setFollow(false); }
  function onListTouch() { if (_followOn) setFollow(false); }
  const FOLLOW_PAUSE_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "PageUp", "PageDown", "Home", "End"]);
  function onListKeydown(e) { if (_followOn && FOLLOW_PAUSE_KEYS.has(e.key)) setFollow(false); }

  function bindFollowPause(list) {
    if (!list) return;
    list.addEventListener("wheel", onListWheel, { passive: true });
    list.addEventListener("touchstart", onListTouch, { passive: true });
    list.addEventListener("keydown", onListKeydown);
    // The list is not the scroller in video-mode -- the page is, and the
    // pointer is usually over the study COLUMN (article, skim, whitespace)
    // rather than over a row. Wheeling there is the same "I took the wheel"
    // signal, so it pauses too. Same named handler, so a second runLoad
    // re-registers nothing.
    const col = list.closest ? list.closest(".pbv-col-study") : null;
    if (col) col.addEventListener("wheel", onListWheel, { passive: true });
  }

  // Task 4 row shape: .pbv-row is a plain container (selectable text needs a
  // non-button ancestor), button.pbv-time is the only interactive control
  // (seek), span.pbv-text carries the transcript text. Static (non-seekable)
  // rows keep the button present but inert -- same tabIndex=-1/no-title/
  // no-listener treatment the old row-as-button gave them -- so the
  // .pbv-row--static class keeps working the day a non-seekable provider
  // actually ships one.
  function renderVideoRow(seg, seekable) {
    const row = el("div", seekable ? "pbv-row" : "pbv-row pbv-row--static");
    const time = el("button", "pbv-time", pbpVideoFmtTime(seg.from));
    time.type = "button";
    const text = el("span", "pbv-text", seg.content);
    if (seekable) {
      const label = t("mdVideoSeekTo", pbpVideoFmtTime(seg.from));
      time.title = label;
      time.setAttribute("aria-label", label);
      time.addEventListener("click", () => seekTo(Math.floor(seg.from)));
      // The whole row seeks again (device feedback 2026-08-23: row clicks
      // stopped jumping after the Task 4 button split) -- EXCEPT when the
      // click ends a text selection: the selectable-text contract and the
      // seek contract share this row, and the collapsed-selection check is
      // what keeps them from fighting. Keyboard access stays on the time
      // button, so the row itself needs no tabindex.
      row.addEventListener("click", (ev) => {
        if (ev.target && ev.target.closest && ev.target.closest("button")) return;
        const sel = typeof window.getSelection === "function" ? window.getSelection() : null;
        if (sel && !sel.isCollapsed) return;
        seekTo(Math.floor(seg.from));
      });
    } else {
      time.tabIndex = -1;
    }
    row.appendChild(time);
    row.appendChild(text);
    return row;
  }

  // Batched so a long transcript (an hour-plus video runs into the
  // thousands of segments) never blocks the main thread building rows in one
  // pass. The first 200 land synchronously -- short lists, and every test
  // fixture, render with nothing left to schedule -- and the remainder
  // follow in rAF-paced DocumentFragment batches of 200. requestAnimationFrame
  // is absent in some minimal test/automation DOM shims; without it, append
  // everything else synchronously rather than silently stalling forever.
  function renderTranscript(listEl, segments, seekable) {
    listEl.textContent = "";
    clearCurrentRow(); // the highlighted node just stopped existing
    const epoch = ++_renderEpoch; // this call's token -- see the field comment above
    const BATCH = 200;
    const total = segments.length;
    let i = 0;
    function appendBatch(count) {
      const frag = document.createDocumentFragment();
      const end = Math.min(i + count, total);
      for (; i < end; i++) frag.appendChild(renderVideoRow(segments[i], seekable));
      listEl.appendChild(frag);
    }
    appendBatch(BATCH); // first batch: same tick as the call, inherently safe
    if (i >= total) return;
    if (typeof requestAnimationFrame === "undefined") {
      appendBatch(total - i);
      return;
    }
    const step = () => {
      if (epoch !== _renderEpoch) return; // superseded by a newer render -- stop
      appendBatch(BATCH);
      if (i < total && epoch === _renderEpoch) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // permissions.request demands a user gesture even for already-granted
  // origins, so an automatic load (no gesture) dies on "permission declined"
  // despite the standing grant if this runs unconditionally.
  // Callers therefore check chrome.permissions.contains() first and only
  // reach this helper on a real click when that check came back false.
  async function requestVideoOrigin(detected) {
    const originPat = detected.provider === "bilibili" ? BILI_ORIGIN : YT_ORIGIN;
    try { return await chrome.permissions.request({ origins: [originPat] }) === true; } catch (_) { return false; }
  }

  // Data-layer capture chain: URL detect -> permission check (contains
  // ONLY; automatic/no-gesture path) -> provider fetch -> punctuation tier.
  // Extracted out of loadFlow so a future caller (md-preview.js) can await
  // a video's transcript session directly. ctx = { pageUrl, tabId }.
  async function prepareVideoSession(ctx) {
    const detected = pbpVideoDetect(ctx && ctx.pageUrl);
    if (!detected) {
      const session = { detected: null, granted: false };
      window.pbpVideoSession = session;
      return session;
    }
    const isBili = detected.provider === "bilibili";
    const originPat = isBili ? BILI_ORIGIN : YT_ORIGIN;
    // contains ONLY here: this path runs on automatic (no-gesture) callers
    // too, and permissions.request would refuse those even when already
    // granted. The user-gesture request lives in requestVideoOrigin, called
    // from the poster-card click handler before this function runs.
    let granted = false;
    try { granted = await chrome.permissions.contains({ origins: [originPat] }) === true; } catch (_) {}
    if (!granted) {
      const session = { detected, granted: false };
      window.pbpVideoSession = session;
      return session;
    }
    let res;
    let useLogin = false;
    let ytHadTab = false;
    let ytFetchFn = null;
    let ytFetchTabId = null; // survives into the session: the track-switch player capture injects into it
    const tabId = ctx && typeof ctx.tabId === "number" ? ctx.tabId : null;
    if (isBili) {
      res = await pbpBiliFetchTranscript(detected.bvid, detected.part, {});
    } else {
      const uiLang = (chrome.i18n && chrome.i18n.getUILanguage && chrome.i18n.getUILanguage()) || "en";
      // Tab route first: the page's own session succeeds where the extension
      // page's cross-site fetch is bot-gated (see ytTabFetchFn). The
      // extension-page fetch stays as the no-tab fallback, still governed by
      // the login opt-in (the tab route needs no opt-in -- it reads through
      // the user's own open page, adding nothing they haven't already sent).
      const fetchTabId = await ytFindFetchTab(tabId);
      ytHadTab = fetchTabId != null;
      if (ytHadTab) ytFetchTabId = fetchTabId;
      if (ytHadTab) {
        const tabFetch = ytTabFetchFn(fetchTabId, detected.videoId);
        res = await pbpYtFetchTranscript(detected.videoId, { uiLang, fetchFn: tabFetch });
        console.info("[pbp-video] tab route (tab " + fetchTabId + "):", res.error || ("ok, " + (res.segments || []).length + " segments"));
        if (!res.error || res.tracks) ytFetchFn = tabFetch;
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
        if (!res || !fb.error || fb.tracks) { res = fb; ytFetchFn = null; }
      }
      // Both timedtext routes failed (typically exp=xpe: the text is
      // PO-Token-gated even when the track list arrives). Ask the tab for the
      // transcript the way YouTube's own panel does. The track picker is KEPT
      // on rescue success (device report 2026-08-23: bilibili could switch
      // subtitle languages, YouTube could not) -- switching re-fetches through
      // ytTabPlayerCaptionCapture, the verified per-language route, so the
      // list is filtered to what that route can actually serve
      // (pbpYtRescueTracks: one track per language, player semantics).
      if (ytHadTab && res && res.error) {
        // Hand-build a transcript-panel params token from the track list the
        // failed timedtext round already gave us (language + asr), so the
        // rescue no longer depends on finding an endpoint in the page data.
        const rTrack = (res.tracks && res.tracks.length)
          ? (pbpYtPickTrack(res.tracks, uiLang) || res.tracks[0]) : null;
        const rTracks = pbpYtRescueTracks(res.tracks);
        const fbParams = pbpYtTranscriptParams(detected.videoId,
          rTrack ? rTrack.lang : (String(uiLang || "en").split("-")[0]), !!(rTrack && rTrack.asr));
        const segs = await ytTabPanelTranscript(fetchTabId, detected.videoId, uiLang, fbParams);
        console.info("[pbp-video] panel rescue:", segs ? segs.length + " segments" : "failed");
        // rTrack is accurate here: the hand-built params requested exactly it
        if (segs && segs.length) res = { tracks: rTracks, track: rTrack, segments: segs };
        // Player-capture tier: drive the page player's own caption machinery
        // and take the signed timedtext round-trip it makes. Better data than
        // the DOM tier below (real from/to timings, no panel scrape).
        if (res.error) {
          const capSegs = await ytTabPlayerCaptionCapture(fetchTabId, rTrack ? rTrack.lang : null);
          console.info("[pbp-video] player capture rescue:", capSegs ? capSegs.length + " segments" : "failed");
          if (capSegs && capSegs.length) res = { tracks: rTracks, track: rTrack, segments: capSegs };
        }
        // Endpoint rescues exhausted -> read what YouTube's own UI renders.
        // track:null is honest here: the DOM scrape returns whatever language
        // the page panel happens to show, so no picker entry gets marked
        // selected (loadFlow renders a neutral placeholder instead).
        if (res.error) {
          const domSegs = await ytTabDomTranscript(fetchTabId);
          console.info("[pbp-video] dom rescue:", domSegs ? domSegs.length + " segments" : "failed");
          if (domSegs && domSegs.length) res = { tracks: rTracks, track: null, segments: domSegs };
        }
      }
    }
    // punctuation enhancement: heuristic tier applies silently here so every
    // consumer of the session sees already-punctuated segments; wasUnpunct
    // tells the caller whether the AI upgrade button should be offered.
    let segments = res.segments || [];
    let wasUnpunct = false;
    if (segments.length && typeof pbpVideoNeedsPunctuation === "function" && pbpVideoNeedsPunctuation(segments)) {
      wasUnpunct = true;
      segments = pbpVideoHeuristicPunctuate(segments);
    }
    const session = {
      detected, granted: true,
      tracks: res.tracks, track: res.track, segments, error: res.error,
      wasUnpunct, meta: res.meta, useLogin, ytHadTab, ytFetchFn, ytFetchTabId,
    };
    window.pbpVideoSession = session;
    return session;
  }

  async function loadFlow(detected, statusEl, bodyEl, trackSel, copyBtn, aiBtn) {
    statusEl.textContent = t("mdVideoLoading");
    const isBili = detected.provider === "bilibili";
    const cached = window.pbpVideoSession;
    const session = (cached && pbpVideoSessionMatches(cached, detected) && cached.segments && cached.segments.length)
      ? cached
      : await prepareVideoSession({ pageUrl: (_meta && _meta.url) || "", tabId: _ctxTabId });
    if (!session.granted) { statusEl.textContent = t("mdVideoPermMissing"); return; }
    _ytFetchFn = session.ytFetchFn || null;
    _ytFetchTabId = (typeof session.ytFetchTabId === "number") ? session.ytFetchTabId : null;
    const useLogin = session.useLogin;
    const ytHadTab = session.ytHadTab;
    const res = { tracks: session.tracks, track: session.track, segments: session.segments, error: session.error };
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
    // Rescue sessions may not know which track the capture returned (the DOM
    // scrape reads whatever language the page panel shows) -- letting the
    // browser mark the first option selected would be a lie, so lead with a
    // neutral disabled placeholder instead. Reuses the picker's own aria
    // label ("subtitle language") rather than minting a new locale key.
    if ((res.tracks || []).length && !res.track) {
      const ph = document.createElement("option");
      ph.value = "";
      ph.textContent = t("mdVideoTrackAria");
      ph.selected = true; ph.disabled = true; ph.hidden = true;
      trackSel.insertBefore(ph, trackSel.firstChild);
    }
    trackSel.hidden = !(res.tracks || []).length;
    // punctuation enhancement already applied by prepareVideoSession; the AI
    // button only appears for tracks the detector judged unpunctuated.
    _aiPunctParas = null;
    const wasUnpunct = session.wasUnpunct;
    if (aiBtn) {
      let aiOk = false;
      try {
        const sa = typeof pbpAiGetSettings === "function" ? await pbpAiGetSettings() : null;
        aiOk = !!(sa && typeof pbpAiAvailable === "function" && pbpAiAvailable(sa));
      } catch (_) {}
      // No re-offer only after an AI pass actually committed (videoAiPunct
      // rode the payload): a committed page whose article is still the
      // heuristic tier -- first-run promotion, or a track switch after an AI
      // pass -- must keep the button, or the AI upgrade dead-ends forever on
      // every committed page (device report 2026-08-23).
      const committedAi = !!(window.pbpVideoDoc && window.pbpVideoDoc.committed && window.pbpVideoDoc.aiPunct);
      aiBtn.hidden = !(wasUnpunct && (res.segments || []).length && aiOk && !committedAi);
    }
    copyBtn.hidden = !(res.segments || []).length;
    // Reveal the study-view toggle and the follow control only when there
    // is a transcript to switch to / follow (final-review M6).
    const hasSegs = (res.segments || []).length > 0;
    const tgEl = document.querySelector(".pbv-view-toggle");
    if (tgEl) tgEl.hidden = !hasSegs;
    if (_followBtn) _followBtn.hidden = !(hasSegs && document.body.classList.contains("video-mode") && detected.provider === "youtube");
    _segments = res.segments || [];
    // ONE meta construction (pbpVideoTranscriptMeta) shared with md-preview.js:
    // Copy, the first-run commit below, and the AI-punctuation commit all read
    // this object, so every transcript this page ever writes carries the same
    // heading, track label, and source link.
    _meta = pbpVideoTranscriptMeta(session, _meta && _meta.title, _meta && _meta.url);
    if (_segments.length) {
      renderTranscript(bodyEl, _segments, true);
      // Timeline is the default study view once a transcript exists (device
      // feedback 2026-08-23: "优先显示时间轴") -- the reading article stays one
      // toggle click away, and the follow highlight lands where the user is
      // looking. Runs once per mount (loadFlow), so a later manual toggle to
      // reading is never fought.
      setStudyView("timeline");
    }
    trackSel.addEventListener("change", async () => {
      if (!trackSel.value) return; // the neutral placeholder is not a track
      statusEl.textContent = t("mdVideoLoading");
      // Heading label through the single meta builder's vocabulary, NOT the
      // option text -- the option carries the " (auto-generated)" UI suffix,
      // and committing that rewrote the article H2/TOC (final-review L4).
      const selTrack = (window.pbpVideoSession && (window.pbpVideoSession.tracks || []).find(
        (tr) => (tr.baseUrl || tr.subtitle_url) === trackSel.value)) || null;
      let segs = isBili ? await pbpBiliFetchSubtitleBody(trackSel.value) : await pbpYtFetchCaptionBody(trackSel.value, _ytFetchFn || undefined, useLogin);
      // Rescue cascade (device report 2026-08-23: no YouTube language
      // switching): on sessions that needed a rescue, the picker's timedtext
      // URLs are PO-Token-walled, so re-fetch through the page player's own
      // caption machinery -- the verified per-language route.
      if (!segs.length && !isBili && _ytFetchTabId != null && selTrack) {
        segs = (await ytTabPlayerCaptionCapture(_ytFetchTabId, selTrack.lang)) || [];
      }
      if (!segs.length) {
        // Keep the transcript the user already has: replacing a working
        // timeline with an empty list would turn a failed switch into data
        // loss. mdVideoBodyBlocked names the real problem for YouTube.
        statusEl.textContent = t(isBili ? "mdVideoNoTracks" : "mdVideoBodyBlocked");
        return;
      }
      statusEl.textContent = "";
      if (typeof pbpVideoNeedsPunctuation === "function" && pbpVideoNeedsPunctuation(segs)) {
        segs = pbpVideoHeuristicPunctuate(segs);
      }
      _aiPunctParas = null; // a new track invalidates the previous AI pass
      _segments = segs;
      const sel = trackSel.selectedOptions && trackSel.selectedOptions[0];
      _meta.trackLabel = selTrack ? (selTrack.label || selTrack.lan_doc || "") : ((sel && sel.textContent) || "");
      copyBtn.hidden = false;
      renderTranscript(bodyEl, segs, true);
      // Atomic track switch (Task 5): the timeline above already follows the
      // newly selected track; when the transcript IS this page's article
      // too, keep it in sync the same way as the AI-punctuation pass --
      // write + reload through the single committer (md-preview.js owns the
      // account/tags/description contract). A track switch always carries
      // the heuristic tier, so the AI flag rides as false.
      if (window.pbpVideoDoc
          && window.pbpVideoDoc.kind === "video-transcript"
          && typeof window.pbpVideoCommitTranscript === "function") {
        window.pbpVideoCommitTranscript(pbpVideoTranscriptMarkdown(segs, _meta, null), _meta.title || "", false);
      }
    });
    // First run: the bootstrap could not fetch captions because the origin
    // grant did not exist yet, so md-preview.js settled for "video-fallback"
    // (the extracted description as the article). The click that got us here
    // IS that grant, and the transcript is now in hand -- promote it to the
    // article instead of making the user reload the page by hand. Runs once:
    // the payload this writes comes back as kind "video-transcript".
    if (_segments.length && window.pbpVideoDoc && window.pbpVideoDoc.kind === "video-fallback"
        && typeof window.pbpVideoCommitTranscript === "function") {
      window.pbpVideoCommitTranscript(pbpVideoTranscriptMarkdown(_segments, _meta, _aiPunctParas), _meta.title || "", !!_aiPunctParas);
    }
  }

  window.pbpPrepareVideoSession = prepareVideoSession;
  window.pbpVideoEnsureReadingView = ensureReadingView;

  // Reading/timeline toggle (Task 4). Pattern-matched on #source-badge/
  // .src-seg (md-preview.js's applyAvailability): same container+segment
  // classes, same aria-pressed/active contract. .src-seg's CSS carries no
  // #source-badge scoping (md-preview.css), so reusing the class here picks
  // up the existing look with no new rules beyond .pbv-view-toggle's own
  // study-column spacing.
  function buildViewToggle() {
    const wrap = el("div", "pbv-view-toggle source-badge");
    wrap.setAttribute("role", "group");
    const reading = el("button", "src-seg", t("mdVideoViewReading"));
    reading.type = "button";
    reading.setAttribute("data-view", "reading");
    reading.addEventListener("click", () => setStudyView("reading"));
    const timeline = el("button", "src-seg", t("mdVideoViewTimeline"));
    timeline.type = "button";
    timeline.setAttribute("data-view", "timeline");
    timeline.addEventListener("click", () => setStudyView("timeline"));
    wrap.appendChild(reading);
    wrap.appendChild(timeline);
    _toggleReadingBtn = reading;
    _toggleTimelineBtn = timeline;
    return wrap;
  }

  function setStudyView(mode) {
    const reading = mode !== "timeline";
    if (_studyReadingEl) _studyReadingEl.hidden = !reading;
    if (_studyListEl) _studyListEl.hidden = reading;
    if (_toggleReadingBtn) {
      _toggleReadingBtn.classList.toggle("active", reading);
      _toggleReadingBtn.setAttribute("aria-pressed", reading ? "true" : "false");
    }
    if (_toggleTimelineBtn) {
      _toggleTimelineBtn.classList.toggle("active", !reading);
      _toggleTimelineBtn.setAttribute("aria-pressed", !reading ? "true" : "false");
    }
  }

  // Ask/skim citation jumps into the transcript need the reading view on
  // screen even when the reader is parked on the timeline segment. No
  // dispatch site exists yet (that wiring is optional follow-up for md-ask.js
  // / md-skim.js); the contract is live from here on regardless.
  function ensureReadingView() { setStudyView("reading"); }
  document.addEventListener("pbp:ensure-article-visible", ensureReadingView);

  // Collapsed source description (Task 5). md-preview.js stashes the video's
  // extracted/committed description on window.pbpVideoDoc BEFORE mounting
  // this panel (video-transcript bootstrap and pbpVideoCommitTranscript's
  // reload both set it) -- only that kind carries a description worth
  // showing (video-fallback's IS the article already, nothing to collapse).
  // Rendered through renderMarkdown(), the SAME single sanitize point the
  // article itself uses (md-convert.js) -- never a raw innerHTML of
  // markdown-derived text. Empty/missing description -> no element at all,
  // not an empty collapsed shell.
  function buildVideoDescription() {
    const doc = window.pbpVideoDoc;
    if (!doc || doc.kind !== "video-transcript") return null;
    const md = doc.descriptionMarkdown;
    if (!md || !String(md).trim()) return null;
    const details = document.createElement("details");
    details.id = "video-description";
    const summary = document.createElement("summary");
    summary.textContent = t("mdVideoDescription");
    details.appendChild(summary);
    const body = el("div", "desc-body");
    if (typeof renderMarkdown === "function") body.innerHTML = renderMarkdown(md);
    details.appendChild(body);
    return details;
  }

  // A2 dual-column workspace (video-mode only). Builds .pbv-workspace inside
  // .doc-body: .pbv-col-player gets #video-panel, .pbv-col-study gets (in
  // order) an empty #video-skim-slot, the reading/timeline toggle,
  // #rendered-view -- moved via appendChild, so every id-based consumer
  // elsewhere in the codebase (TOC, highlights, scroll restore, Ask,
  // translation...) keeps working unchanged; only its ancestor chain changes
  // -- then an empty .pbv-list (hidden; renderTranscript fills it once the
  // transcript loads). #video-panel itself now holds only .pbv-media +
  // .pbv-bar (runLoad no longer builds its own .pbv-list). Runs only when
  // body.video-mode is actually set -- a detect hit without the class
  // (defensive; Tasks 1/2 set it early on every branch that reaches this
  // mount, so this should not happen in practice) falls back to the
  // pre-workspace sibling insert, unchanged, and mounts no toggle at all --
  // that non-video panel keeps its list in-panel, as today.
  function mountVideoWorkspace(view, panel) {
    const docBody = view.parentNode;
    if (!document.body.classList.contains("video-mode")) {
      docBody.insertBefore(panel, view);
      return;
    }
    const workspace = el("div", "pbv-workspace");
    const playerCol = el("div", "pbv-col-player");
    const studyCol = el("div", "pbv-col-study");
    const skimSlot = document.createElement("div");
    skimSlot.id = "video-skim-slot";
    // md-skim.js builds #skim-section lazily on "pbp:rendered", which
    // dispatches (md-preview.js) strictly after every pbpVideoInit call
    // site -- so in practice this mount always runs first and there is
    // nothing to adopt yet. Move an existing section into the slot anyway
    // (appendChild moves, never clones) so a future build-order change
    // can't strand key points outside the workspace.
    const existingSkim = document.getElementById("skim-section");
    studyCol.appendChild(skimSlot);
    if (existingSkim) skimSlot.appendChild(existingSkim);

    const viewToggle = buildViewToggle();
    // Hidden until captions actually exist: on caption-less pages the
    // Timeline segment swapped the article for an empty bordered box with
    // no explanation (final-review M6). loadFlow unhides it.
    viewToggle.hidden = true;
    studyCol.appendChild(viewToggle);

    playerCol.appendChild(panel);
    docBody.insertBefore(workspace, view);
    studyCol.appendChild(view); // moves the existing node; id lookups unaffected
    _studyReadingEl = view;

    const list = el("div", "pbv-list");
    list.hidden = true; // reading is the default view
    studyCol.appendChild(list);
    _studyListEl = list;

    // Last element of the study column: below the article/timeline, not
    // competing with either for attention while still reachable.
    const descEl = buildVideoDescription();
    if (descEl) studyCol.appendChild(descEl);

    workspace.appendChild(playerCol);
    workspace.appendChild(studyCol);
    setStudyView("reading");
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
    // First-run: prepareVideoSession's automatic (no-gesture) check already
    // ran before this mount and found no standing origin grant -- granted is
    // explicitly false (not merely absent/unset). Make that state legible
    // instead of reusing the generic "load" label: this poster IS the one
    // primary action that both asks for the permission (a real user gesture)
    // and loads the video, so it says so. Declined keeps this same card/label
    // (mdVideoPermMissing renders in the status line below it) -- no loop.
    const firstRun = !!(window.pbpVideoSession && window.pbpVideoSession.granted === false);
    const posterLabel = t(firstRun ? "mdVideoEnable" : "mdVideoLoad");
    const cta = el("button", firstRun ? "pbv-poster pbv-poster--enable" : "pbv-poster");
    cta.type = "button";
    cta.title = posterLabel;
    cta.setAttribute("aria-label", posterLabel);
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
    cta.appendChild(el("span", "pbv-poster-label", posterLabel));
    panel.appendChild(cta);
    mountVideoWorkspace(view, panel);
    _panel = panel;

    // Set by runLoad once the status line exists, so the automatic-load
    // rejection handler below has somewhere to report to.
    let statusRef = null;

    async function runLoad(fromClick) {
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
      // First chance to greet the relay: its listener is registered in the
      // page's first synchronous script, so by load it is certainly up. The
      // repeating greeting below covers the race where this fires early or
      // not at all (cross-origin load events are still delivered, but a
      // failed load fires none).
      _iframe.addEventListener("load", sendRelayHello);
      media.appendChild(_iframe);
      const bar = el("div", "pbv-bar");
      const status = el("span", "pbv-status");
      status.setAttribute("aria-live", "polite");
      statusRef = status;
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
      // AI punctuation (combo plan, user-picked): heuristic tier applies
      // automatically in loadFlow; this button upgrades the Copy text -- and,
      // when the transcript IS this page's article, the article itself --
      // via the configured AI provider. Spends tokens, so it is a deliberate
      // click behind the robot icon (icon contract) and only shows for tracks
      // the detector judged unpunctuated.
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
          // Split on ANY newline run: the prompt asks for blank-line breaks
          // but models routinely emit single newlines, and the blank-line-only
          // split glued whole batches into one wall (device report: punctuated
          // but unbroken article). Overlong runs still split on sentence ends.
          _aiPunctParas = outBatches.join("\n\n").split(/\n+/)
            .map((x) => x.replace(/\s+/g, " ").trim()).filter(Boolean)
            .flatMap((x) => x.length > 300 ? x.split(/(?<=[。！？.!?])\s*/).filter(Boolean) : [x]);
          // Make the pass visible where the user is looking: map the marks
          // back onto the timed rows and re-render the panel (fail-closed --
          // on any stream mismatch the rows simply keep their current text).
          const applied = pbpVideoApplyPunctText(_segments, outBatches.join("\n"));
          if (applied) {
            _segments = applied;
            renderTranscript(body, _segments, true);
          }
          aiLabel.textContent = t("mdVideoAiPunctDone");
          // The article IS this transcript on every video page that had
          // captions, so refresh it in place: md-preview.js owns the payload
          // write + reload (account/tags/description contract), this file only
          // hands it the punctuated markdown.
          if (window.pbpVideoDoc && window.pbpVideoDoc.kind === "video-transcript"
              && typeof window.pbpVideoCommitTranscript === "function" && _segments.length) {
            window.pbpVideoCommitTranscript(pbpVideoTranscriptMarkdown(_segments, _meta, _aiPunctParas), _meta.title || "", true);
          }
        } catch (e) {
          console.warn("[pbp-video] ai punctuation:", (e && e.message) || e);
          _aiPunctParas = null;
          status.textContent = t("mdVideoAiPunctFail");
          aiLabel.textContent = t("mdVideoAiPunct");
          aiBtn.disabled = false;
        }
      });
      bar.appendChild(trackSel); bar.appendChild(copyBtn); bar.appendChild(aiBtn);
      if (detected.provider === "youtube") {
        // Follow toggle (Task 6). Same bar-button family as Copy / AI
        // punctuation (.pbv-copy, .pbv-ai-punct in md-preview.css), plus the
        // project's standard pressed vocabulary for a real toggle button
        // (aria-pressed, no checkbox, no checkmark glyph). Labelled text, so
        // no icon and no separate aria-label. YouTube-only (this branch) and
        // video-mode-only: the position protocol exists for the relay player,
        // and the timeline it scrolls lives in the workspace study column.
        const followBtn = el("button", "pbv-follow");
        followBtn.type = "button";
        followBtn.textContent = t("mdVideoFollow");
        // starts hidden even in video-mode: a page whose captions never
        // arrive must not offer a follow control (final-review M6);
        // loadFlow unhides it when segments actually exist.
        followBtn.hidden = true;
        _followBtn = followBtn;
        setFollow(true); // default ON; also writes the initial aria-pressed
        followBtn.addEventListener("click", () => setFollow(!_followOn));
        bar.appendChild(followBtn);
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
      // Video-mode workspaces already have an empty .pbv-list waiting in the
      // study column (mountVideoWorkspace built it); #video-panel then holds
      // only .pbv-media + .pbv-bar. The non-video defensive mount never set
      // _studyListEl, so it keeps building + keeping the list in-panel, as
      // before.
      const body = _studyListEl || el("div", "pbv-list");
      bindFollowPause(body);
      panel.replaceChildren(media, bar);
      if (!_studyListEl) panel.appendChild(body);
      // The frame is in the document now, so it has a contentWindow to greet.
      if (detected.provider === "youtube") startRelayHello();
      // contains BEFORE request: permissions.request demands a user gesture
      // even for already-granted origins, so the automatic load below (no
      // gesture) would die on "permission declined" despite a standing grant.
      // prepareVideoSession's automatic path only ever checks; the request
      // stays here, and only ever fires on a real poster-card click -- the
      // only user gesture this flow has.
      const originPat = detected.provider === "bilibili" ? BILI_ORIGIN : YT_ORIGIN;
      let granted = false;
      try { granted = await chrome.permissions.contains({ origins: [originPat] }) === true; } catch (_) {}
      // Only a real click may escalate to permissions.request (Chrome
      // rejects it without a gesture anyway, and the host-permission rule
      // says automatic paths only ever check) -- the auto-boot path lands
      // on the poster card instead, whose click re-enters with the gesture.
      if (!granted && fromClick === true) granted = await requestVideoOrigin(detected);
      if (!granted) {
        status.textContent = t("mdVideoPermMissing");
        // Declined/failed permission dead end (fix round 1): cta was already
        // detached from the panel above (replaceChildren(media, bar), before
        // this check ran) -- disabling it alone would leave nothing on
        // screen to click again. Restore the poster card as the retry entry
        // point, same idiom the auto-load catch handler below already uses
        // for an early failure. Each click is a fresh user gesture, so this
        // creates no loop: nothing re-clicks cta automatically while ungranted.
        cta.disabled = false;
        // Keep the bar too: the decline message lives in it -- restoring the
        // poster alone would silently eat the "permission declined" status.
        // And keep the PLAYER when it already mounted: privacy.md guarantees
        // the embed loads without the subtitle grant, so a decline must only
        // cost the captions, never tear the video out (final-review H2).
        if (_iframe && _iframe.isConnected) panel.replaceChildren(media, bar);
        else panel.replaceChildren(cta, bar);
        return;
      }
      await loadFlow(detected, status, body, trackSel, copyBtn, aiBtn);
    }

    cta.addEventListener("click", () => runLoad(true));
    // The session already holds this video's transcript (md-preview.js ran it
    // before rendering, and the article the user is reading IS that
    // transcript), so the origin grant is standing and there is nothing left
    // to ask for -- go straight to the player instead of making the user click
    // a poster card to reach content that is already on screen. runLoad swaps
    // the panel's children synchronously, before this task yields, so the
    // poster never paints. Without a session (permission not granted yet, or
    // no captions) the poster card + requestVideoOrigin flow stays exactly as
    // it was: that click is the gesture the grant needs.
    const booted = window.pbpVideoSession;
    if (booted && pbpVideoSessionMatches(booted, detected) && booted.granted
        && booted.segments && booted.segments.length) {
      // No click means no click handler to swallow a rejection: an unhandled
      // one would leave the panel wedged mid-swap with no way back. Report it
      // where the user is looking, and if the swap never got as far as the
      // status line, put the poster card back as the retry entry.
      runLoad(false).catch((e) => {
        console.warn("[pbp-video] auto load:", (e && e.message) || e);
        if (statusRef) statusRef.textContent = t("mdVideoFailed");
        else { cta.disabled = false; panel.replaceChildren(cta); }
      });
    } else if (window.pbpVideoDoc && window.pbpVideoDoc.committed === true) {
      // Committed-transcript reloads skip the bootstrap session entirely
      // (final-review M2), so there is no cached session to satisfy the
      // branch above -- yet the article on screen IS this video's transcript.
      // Parking it behind a poster click regressed the AI-punctuation loop
      // into a dead end (device report 2026-08-23: the commit's reload landed
      // on "load video & subtitles"). The grant that captured this transcript
      // is standing unless the user revoked it: contains() decides (automatic
      // path -- only ever checks, never requests), and a revoked grant keeps
      // the poster flow, whose click is the re-request gesture.
      (async () => {
        const originPat = detected.provider === "bilibili" ? BILI_ORIGIN : YT_ORIGIN;
        let g = false;
        try { g = await chrome.permissions.contains({ origins: [originPat] }) === true; } catch (_) {}
        if (g) await runLoad(false);
      })().catch((e) => {
        console.warn("[pbp-video] committed auto load:", (e && e.message) || e);
        if (statusRef) statusRef.textContent = t("mdVideoFailed");
        else { cta.disabled = false; panel.replaceChildren(cta); }
      });
    }
  };
})();
