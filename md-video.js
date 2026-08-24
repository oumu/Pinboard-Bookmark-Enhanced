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

// Default-track hints (research T6.1/T6.2), set by the reader before a
// fetch: the ordered language preference from settings and the track key
// remembered for this video. A plain holder because the two pick sites sit
// in the fetch helpers, which take no reader state.
const PBP_VIDEO_PICK_HINTS = { prefs: [], preferKey: "" };

// Ordered caption-language preference (research T6.1): "en, ja" -> ["en",
// "ja"]; base subtags only, lower-cased, de-duplicated, empty for "auto".
function pbpVideoLangPrefs(raw) {
  const out = [];
  for (const part of String(raw || "").split(/[,\s;]+/)) {
    const b = part.trim().toLowerCase().split("-")[0];
    if (b && !out.includes(b)) out.push(b);
  }
  return out;
}

// Remembered-track resolution (research T6.2, retro #6): the picker's
// values disambiguate duplicate stable keys with a "#N" ordinal (second
// occurrence = "#2"), so a remembered "yt:en#2" must resolve to the second
// track carrying the bare key -- never to the first one.
function pbpVideoResolvePreferKey(tracks, provider, preferKey) {
  if (!preferKey || !Array.isArray(tracks)) return null;
  const m = /^(.*)#(\d+)$/.exec(preferKey);
  const bare = m ? m[1] : preferKey;
  const ordinal = m ? Number(m[2]) : 1;
  let seen = 0;
  for (const tr of tracks) {
    if (pbpVideoTrackKey(tr, provider) !== bare) continue;
    seen++;
    if (seen === ordinal) return tr;
  }
  return null;
}

// Default track. Order (research T6.1/T6.2): the track remembered for THIS
// video (preferKey) > preferred language, human > preferred language, ASR
// > UI language, human > UI language, ASR > any human > first. A
// remembered key that no longer matches a live track is simply ignored
// (fail-open; provider re-orderings can retire a key, known B12).
function pbpYtPickTrack(tracks, uiLang, prefs, preferKey) {
  if (!Array.isArray(tracks) || !tracks.length) return null;
  const remembered = pbpVideoResolvePreferKey(tracks, "youtube", preferKey);
  if (remembered) return remembered;
  const base = String(uiLang || "").toLowerCase().split("-")[0];
  const pref = Array.isArray(prefs) ? prefs : [];
  let best = null, bestScore = -1;
  for (const tr of tracks) {
    const lb = String(tr.lang || "").toLowerCase().split("-")[0];
    let score = 0;
    const pi = pref.indexOf(lb);
    // Preference tiers are 100 apart so the human/ASR bonus (50) and the
    // UI-language bonus (100, only below the tiers) can never cross a
    // language boundary (retro #5: "en, ja" with en-ASR + ja-human must
    // still pick en).
    if (pi >= 0) score += 10000 - pi * 100;
    if (base && lb === base) score += 100;
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
  // fromCodePoint, not fromCharCode: supplementary characters (emoji in
  // captions arrive as &#128512;) truncate to a garbage BMP unit under
  // fromCharCode. Hex refs (&#x1F600;) are legal XML and appear too; a
  // reference outside Unicode range is left as literal text (audit A8).
  const num = (n) => {
    const cp = Number(n);
    if (!Number.isInteger(cp) || cp < 0 || cp > 0x10FFFF) return null;
    if (cp >= 0xD800 && cp <= 0xDFFF) return null; // lone surrogate: not a character
    return String.fromCodePoint(cp);
  };
  const once = (x) => String(x)
    .replace(/&#x([0-9a-fA-F]+);/g, (m, h) => { const c = num(parseInt(h, 16)); return c == null ? m : c; })
    .replace(/&#(\d+);/g, (m, n) => { const c = num(n); return c == null ? m : c; })
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
function pbpVideoMergeParagraphRecords(segments) {
  const out = [];
  let buf = [];
  let bufLen = 0;
  let bufFrom = -1; // first segment's start inside the building paragraph
  let lastEnd = -1;
  const flush = () => {
    if (!buf.length) return;
    const text = buf.join(" ").replace(/\s+/g, " ").trim();
    if (text) out.push({ text, from: bufFrom >= 0 ? bufFrom : 0 });
    buf = []; bufLen = 0; bufFrom = -1;
  };
  for (const seg of segments || []) {
    const from = typeof seg.from === "number" ? seg.from : -1;
    if (lastEnd >= 0 && from >= 0 && from - lastEnd > 2.5) flush();
    if (!buf.length) bufFrom = from;
    buf.push(seg.content);
    bufLen += String(seg.content || "").length;
    const to = typeof seg.to === "number" && seg.to > 0 ? seg.to : from;
    if (to >= 0) lastEnd = to;
    if (/[.!?。！？…]["')\]]?$/.test(seg.content) || bufLen >= 200) flush();
  }
  flush();
  return out;
}

// The string shape every existing caller (markdown build, AI batching,
// tests) consumes -- a thin projection of the records above so text and
// time can never drift apart (research T1.1).
function pbpVideoMergeParagraphs(segments) {
  return pbpVideoMergeParagraphRecords(segments).map((r) => r.text);
}

// Paragraph start times for an ARBITRARY paragraph split of the same
// transcript (research T1.1). The AI pass re-cuts paragraphs wherever the
// model put its newlines, so the records above can't time those -- but the
// conservation gate guarantees the mark-and-whitespace-stripped character
// stream is identical, so walking that stream maps every paragraph's first
// character back onto the segment that carries it. Returns one start
// second per paragraph, or null whenever the streams disagree -- callers
// must treat null as "no gutter", never guess (fail-closed).
function pbpVideoParaStarts(segments, paras) {
  const clean = (x) => pbpVideoPunctStrip(String(x || "")).replace(/\s+/g, "");
  const segs = segments || [];
  const bounds = [];
  let total = 0;
  for (const seg of segs) { total += clean(seg.content).length; bounds.push(total); }
  const starts = [];
  let pos = 0, idx = 0; // both cursors only ever move forward (retro PERF-V4)
  for (const p of paras || []) {
    while (idx < bounds.length && bounds[idx] <= pos) idx++;
    if (idx >= bounds.length) return null; // paragraphs run past the segment stream
    starts.push(typeof segs[idx].from === "number" ? segs[idx].from : 0);
    pos += clean(p).length;
  }
  if (pos !== total) return null; // leftover characters -- not the same text
  return starts;
}

// Unpunctuated-track detection: ASR subtitles (bilibili's especially) carry
// no sentence-final punctuation at all. Only tracks like that qualify for
// punctuation enhancement -- properly punctuated tracks are never touched.
// Sentence/clause-end predicates shared by the detector and the heuristic
// below (audit A6: two hand-kept regexes disagreed on quote-closed cues, so
// 『他说“好。”』 read as unpunctuated to one and punctuated to the other and
// earned a second mark after the quote). A run of closing quotes/brackets
// may follow the mark.
const PBP_VIDEO_SENT_END_RE = /[.!?。！？…][”’」』）)\]》】}"']*$/;
const PBP_VIDEO_CLAUSE_END_RE = /[，。！？…、；：,.!?;:][”’」』）)\]》】}"']*$/;

function pbpVideoNeedsPunctuation(segments) {
  const segs = (segments || []).filter((s) => s && s.content);
  if (segs.length < 10) return false;
  let punct = 0;
  for (const s of segs) if (PBP_VIDEO_SENT_END_RE.test(s.content)) punct++;
  return punct / segs.length < 0.1;
}

// Zero-token heuristic tier. Two signals decide the mark:
//   * a real pause between cues (human-timed tracks): short pause -> comma,
//     long pause -> full stop; interrogative particles -> question mark;
//   * the cue boundary itself. Machine captions (bilibili ai-zh, YouTube
//     ASR) tile the timeline edge-to-edge -- device round 4 measured 125 of
//     132 boundaries at exactly gap 0 -- so the pause rules alone mark
//     almost nothing on precisely the tracks that need them. An ASR
//     segmenter still breaks at phrase edges, so a contiguous boundary
//     earns a comma, promoted to a full stop once the running sentence has
//     grown past a readable length (a marks-free wall was the device
//     report; unbounded comma run-ons would be its sibling).
// Chinese-specific rules, so non-CJK segments are left alone. Returns new
// segment objects; never mutates the input.
function pbpVideoHeuristicPunctuate(segments) {
  const segs = segments || [];
  const out = [];
  let run = 0; // chars since the last sentence-ending mark
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    const content = String((s && s.content) || "");
    if (!/[一-鿿]/.test(content) || PBP_VIDEO_CLAUSE_END_RE.test(content)) {
      run = PBP_VIDEO_SENT_END_RE.test(content) ? 0 : run + content.length;
      out.push(s);
      continue;
    }
    const next = segs[i + 1];
    const end = typeof s.to === "number" && s.to > 0 ? s.to : (typeof s.from === "number" ? s.from : -1);
    const gap = next && typeof next.from === "number" && end >= 0 ? next.from - end : Infinity;
    run += content.length;
    // Interrogative particle may sit inside closing quotes ("你说对吗”").
    const interrog = /[吗呢][”’」』）)\]"']*$/.test(content);
    let mark;
    if (!next || gap >= 1.5) mark = interrog ? "？" : "。";
    else if (interrog) mark = "？";
    else if (gap >= 0.4) mark = "，";
    else mark = run >= 48 ? "。" : "，"; // contiguous ASR boundary
    if (mark === "。" || mark === "？") run = 0;
    out.push({ ...s, content: content + mark });
  }
  return out;
}

// ONE punctuation vocabulary for the conservation gate and the timeline
// remap below (audit A5: two hand-kept copies had already drifted, and the
// old list both missed real-model marks and stripped word-internal ones).
// A character is a FREE mark (insertable/removable by the AI tier) when it
// is whitespace or listed punctuation -- EXCEPT when it glues two word
// characters together: the apostrophe in don't, the hyphen in re-enter,
// the decimal point in 3.14 and the name dot in 哈利·波特 are content, and
// a model that drops them has rewritten the words (fail-closed).
// 「」『』・～〜 joined the list: CJK models punctuate with them routinely,
// and their absence rejected whole legitimate batches.
const PBP_VIDEO_MARK_RE = /[\s，。！？；：、“”‘’（）《》【】…—「」『』・～〜·,.!?;:'"()\[\]{}\-]/;
function pbpVideoIsIntraMark(s, i) {
  const ch = s[i];
  // Unicode word classes (closing review H5): ASCII-only context let
  // l’été lose its apostrophe and 中-英 its hyphen -- any letter or
  // digit counts as a word character now.
  if (ch === "\u00b7" || ch === "\u30fb" || ch === "'" || ch === "\u2019" || ch === "." || ch === "-") {
    return /[\p{L}\p{N}]/u.test(s[i - 1] || "") && /[\p{L}\p{N}]/u.test(s[i + 1] || "");
  }
  return false;
}
// The conserved character stream: free marks dropped, everything else --
// words AND word-internal marks -- kept in order.
function pbpVideoPunctStrip(text) {
  const s = String(text || "");
  let out = "";
  for (let i = 0; i < s.length; i++) {
    if (!PBP_VIDEO_MARK_RE.test(s[i]) || pbpVideoIsIntraMark(s, i)) out += s[i];
  }
  return out;
}

// Conservation gate for the AI tier: the conserved streams of both sides
// must be identical -- the model may only insert or adjust free marks,
// never touch a word (fail-closed per batch).
function pbpVideoPunctConserved(original, punctuated) {
  const a = pbpVideoPunctStrip(original);
  return a.length > 0 && a === pbpVideoPunctStrip(punctuated);
}

// Banded edit script between two conserved character streams (repair tier
// below). Ops are aligned to `b`: match/sub consume one char of each side
// (sub carries the SOURCE char), del carries a source char missing from b,
// ins marks a model-invented char to drop. Returns null when the distance
// exceeds maxEdits -- that is a rewrite or truncation, not typo drift.
function _pbpVideoEditOps(a, b, maxEdits) {
  const n = a.length, m = b.length;
  if (Math.abs(n - m) > maxEdits) return null;
  const band = maxEdits;
  const W = 2 * band + 1;
  const INF = 0x3fffffff;
  const dp = new Int32Array((n + 1) * W).fill(INF);
  const at = (i, j) => {
    const o = j - i + band;
    return (o >= 0 && o < W) ? i * W + o : -1;
  };
  dp[at(0, 0)] = 0;
  for (let i = 0; i <= n; i++) {
    const jLo = Math.max(0, i - band), jHi = Math.min(m, i + band);
    for (let j = jLo; j <= jHi; j++) {
      const cur = dp[at(i, j)];
      if (cur >= INF) continue;
      if (i < n && j < m) {
        const c = cur + (a[i] === b[j] ? 0 : 1);
        const q = at(i + 1, j + 1);
        if (q >= 0 && c < dp[q]) dp[q] = c;
      }
      if (i < n) { const q = at(i + 1, j); if (q >= 0 && cur + 1 < dp[q]) dp[q] = cur + 1; }
      if (j < m) { const q = at(i, j + 1); if (q >= 0 && cur + 1 < dp[q]) dp[q] = cur + 1; }
    }
  }
  const endQ = at(n, m);
  if (endQ < 0 || dp[endQ] > maxEdits) return null;
  const ops = [];
  let i = n, j = m;
  while (i > 0 || j > 0) {
    const cur = dp[at(i, j)];
    let stepped = false;
    if (i > 0 && j > 0) {
      const q = at(i - 1, j - 1);
      if (q >= 0 && dp[q] + (a[i - 1] === b[j - 1] ? 0 : 1) === cur) {
        ops.push(a[i - 1] === b[j - 1] ? { op: "match" } : { op: "sub", ch: a[i - 1] });
        i--; j--; stepped = true;
      }
    }
    if (!stepped && i > 0) {
      const q = at(i - 1, j);
      if (q >= 0 && dp[q] + 1 === cur) { ops.push({ op: "del", ch: a[i - 1] }); i--; stepped = true; }
    }
    if (!stepped && j > 0) {
      const q = at(i, j - 1);
      if (q >= 0 && dp[q] + 1 === cur) { ops.push({ op: "ins" }); j--; stepped = true; }
    }
    if (!stepped) return null;
  }
  ops.reverse();
  return ops;
}

// Word-drift repair for the AI tier (device round 6, BV1YGKk6dE8b): real
// models silently "fix" ASR output even when told not to -- stutter
// duplicates dropped, homophone typos corrected (~9 single-char edits per
// 1600-char batch measured live) -- and the fail-closed gate then rejected
// most batches of exactly the content that needs punctuating most. The
// marks are the ONLY thing we want from the model, so this restores the
// SOURCE's characters wherever the conserved streams diverge and keeps the
// model's marks where they sit. Bounded (~3%): a larger drift is a rewrite
// or truncation and still fails closed. The result passes the conservation
// gate BY CONSTRUCTION -- and is asserted to, so fail-closed is intact.
function pbpVideoPunctRepair(original, aiOutput) {
  const a = pbpVideoPunctStrip(original);
  const src = String(aiOutput || "");
  const b = pbpVideoPunctStrip(src);
  if (!a.length || !b.length) return null;
  if (a === b) return src;
  const maxEdits = Math.min(48, Math.max(12, Math.round(a.length * 0.03)));
  const ops = _pbpVideoEditOps(a, b, maxEdits);
  if (!ops) return null;
  let out = "";
  let oi = 0;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (PBP_VIDEO_MARK_RE.test(ch) && !pbpVideoIsIntraMark(src, i)) { out += ch; continue; }
    while (oi < ops.length && ops[oi].op === "del") { out += ops[oi].ch; oi++; }
    const op = ops[oi++];
    if (!op) return null;
    if (op.op === "match") out += ch;
    else if (op.op === "sub") out += op.ch; // the source's character wins
    // op "ins": the model invented this character -- drop it
  }
  while (oi < ops.length) {
    if (ops[oi].op === "del") out += ops[oi].ch;
    else if (ops[oi].op !== "ins") return null;
    oi++;
  }
  return pbpVideoPunctConserved(original, out) ? out : null;
}

// Map AI-punctuated text back onto the timed segments, so the panel rows
// (and their seek timestamps) get the punctuation too -- without this the
// AI pass was invisible everywhere except the committed article text. Deterministic because
// the conservation gate guarantees identical non-punctuation character
// streams: each segment consumes its own count of non-punctuation chars
// from the AI text, absorbing the marks between and right after them.
// Any mismatch returns null (fail-closed; caller keeps its segments).
function pbpVideoApplyPunctText(segments, punctText) {
  // Free-mark test shared with the conservation gate (audit A5): a mark is
  // absorbable only when the SAME predicate the gate used also treats it as
  // free -- word-internal marks count as content on both sides, keeping the
  // two character streams aligned by construction.
  const src = String(punctText || "");
  const isFree = (s, idx) => PBP_VIDEO_MARK_RE.test(s[idx]) && !pbpVideoIsIntraMark(s, idx);
  let i = 0;
  const out = [];
  for (const seg of segments || []) {
    const plainLen = pbpVideoPunctStrip(String((seg && seg.content) || "")).length;
    if (!plainLen) { out.push(seg); continue; }
    let taken = 0;
    let piece = "";
    while (i < src.length && taken < plainLen) {
      piece += src[i];
      if (!isFree(src, i)) taken++;
      i++;
    }
    if (taken < plainLen) return null; // AI text ran short -- refuse
    // absorb trailing marks (not whitespace) belonging to this sentence
    while (i < src.length && isFree(src, i) && !/\s/.test(src[i])) { piece += src[i]; i++; }
    const content = piece.replace(/\s+/g, " ").trim();
    if (!content) return null;
    out.push({ ...seg, content });
  }
  // leftover conserved chars mean the streams diverged -- refuse
  while (i < src.length) { if (!isFree(src, i)) return null; i++; }
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
  // A SAFE DESCRIPTOR (_pbpVideoTrackDescribe's output -- videoState.tracks,
  // and therefore every track an F5-hydrated session carries) already IS its
  // own stable key: it stores `key` and deliberately drops the
  // provider-native fields read below. bilibili is the case that makes this
  // load-bearing rather than an optimization -- a descriptor keeps `lan`
  // under `lang` and `lan_doc` under `label`, so recomputing would return ""
  // and leave every restored track unaddressable by the picker. Real
  // provider tracks never carry a `key` property, so this branch is
  // descriptor-only.
  if (typeof track.key === "string") return track.key;
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

// Injection-queue factory (audit E1): FIFO, stillWanted probed at RUN time
// not enqueue time, and a rejected run never breaks the chain -- semantics
// with real product weight (the 2026-08-24 rapid-switch storm hang), so
// they live in a pure factory the file:// test page can drive.
function pbpVideoMakeInjectQueue() {
  let chain = Promise.resolve();
  return function queue(runFn, stillWanted) {
    const run = async () => {
      if (stillWanted && !stillWanted()) return null; // superseded while queued
      return runFn();
    };
    const p = chain.then(run, run);
    chain = p.then(() => {}, () => {}); // the chain never carries a rejection
    return p;
  };
}

// Rescue-tier ordering from the success-tier memory (plan 丙-乙): reorder
// only, never drop -- a stale memory may cost latency, never coverage.
function pbpVideoTierOrder(cachedVia) {
  return cachedVia === "capture" ? ["capture", "panel", "dom"]
    : cachedVia === "dom" ? ["dom", "capture", "panel"]
    : ["panel", "capture", "dom"];
}

// AI batch splitting: paragraphs pack until the cap is EXCEEDED, so a batch
// may overshoot by up to one paragraph -- budgeted, because maxTokens is
// sized from the real batch length downstream.
function pbpVideoSplitBatches(paras, cap) {
  const batches = [];
  let cur = [], len = 0;
  for (const para of paras || []) {
    cur.push(para); len += para.length;
    if (len > cap) { batches.push(cur.join("\n")); cur = []; len = 0; }
  }
  if (cur.length) batches.push(cur.join("\n"));
  return batches;
}

// Whitespace-insensitive change test: a model that only rewraps lines
// changed the string but punctuated nothing -- committing that would retire
// the AI button (aiPunct persists) over words that never gained a mark.
function pbpVideoPunctChanged(outBatches, batches) {
  const norm = (x) => String(x || "").replace(/\s+/g, " ").trim();
  return (outBatches || []).some((o, i) => norm(o) !== norm((batches || [])[i]));
}

// Markdown-fence unwrap for AI output: strips ONE outer fence pair; the
// unwrapped text still faces the same conservation gate afterwards, so
// fail-closed is not weakened.
function pbpVideoStripFence(text) {
  return String(text || "").replace(/^```[^\n]*\n?/, "").replace(/\n?```\s*$/, "");
}

// Markdown-escape publisher-controlled text (video titles) before it is
// concatenated into Markdown source (audit A7): a title like "[x](url)"
// must render as its own characters, never as a link or heading structure.
function pbpVideoEscapeMdText(text) {
  return String(text || "").replace(/([\\`*_[\]<>#|])/g, "\\$1");
}

function pbpVideoTranscriptMarkdown(segments, meta, paragraphsOverride, headingOverride, rawTitle) {
  meta = meta || {};
  // Localized heading (audit U14): the literal "Transcript" leaked into the
  // TOC and every export for non-English readers. Falls back to the legacy
  // literal outside an extension context (file:// test pages have no t()).
  // headingOverride/rawTitle exist for the hydration gate's migration
  // accepts: heading AND title escaping both changed in the same campaign,
  // so validate must be able to rebuild every pre-campaign shape.
  const lines = pbpVideoTranscriptHeaderLines(meta, headingOverride, rawTitle);
  const paras = (Array.isArray(paragraphsOverride) && paragraphsOverride.length)
    ? paragraphsOverride : pbpVideoMergeParagraphs(segments);
  lines.push(paras.join("\n\n"));
  return lines.join("\n");
}

// Heading + source-link lines shared by the canonical transcript and the
// timestamped export (research T1.2) -- single-sourced so the two never
// drift on escaping or heading localisation.
function pbpVideoTranscriptHeaderLines(meta, headingOverride, rawTitle) {
  meta = meta || {};
  const heading = headingOverride
    || (typeof t === "function" && t("mdVideoTranscriptHeading")) || "Transcript";
  const lines = ["## " + heading + (meta.trackLabel ? " (" + meta.trackLabel + ")" : "")];
  const titleTxt = meta.title ? (rawTitle ? meta.title : pbpVideoEscapeMdText(meta.title)) : "";
  if (meta.url) lines.push("", "> " + (meta.title ? "[" + titleTxt + "](" + meta.url + ")" : "<" + meta.url + ">"));
  lines.push("");
  return lines;
}

// SRT timestamp: HH:MM:SS,mmm (comma is the SRT spec's decimal mark).
function pbpVideoSrtTime(sec) {
  const s = Math.max(0, Number(sec) || 0);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = Math.floor(s % 60);
  const ms = Math.round((s - Math.floor(s)) * 1000) % 1000;
  const p2 = (n) => String(n).padStart(2, "0");
  return p2(h) + ":" + p2(m) + ":" + p2(r) + "," + String(ms).padStart(3, "0");
}

// Side-channel exports (research T1.2): built straight from the in-memory
// segments, never from the committed article -- so the canonical markdown,
// videoState and the hydration matrix stay exactly as they are (the reason
// U14 was parked). A cue with no usable end runs to the next cue's start,
// or 3s when it is the last one.
function pbpVideoSrt(segments) {
  const segs = segments || [];
  const out = [];
  let n = 0;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    const text = String((s && s.content) || "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    const from = Math.max(0, Number(s.from) || 0);
    let to = Number(s.to);
    if (!(to > from)) {
      const nx = segs[i + 1];
      to = (nx && Number(nx.from) > from) ? Number(nx.from) : from + 3;
    }
    out.push(String(++n), pbpVideoSrtTime(from) + " --> " + pbpVideoSrtTime(to), text, "");
  }
  return out.join("\n");
}

// Paragraph markdown with a leading [mm:ss](deep link) per paragraph. Uses
// the AI paragraphs when they align with the segment stream, else the
// heuristic records; a page URL that is not a recognised video keeps the
// bare [mm:ss] tag without a link.
function pbpVideoTimedMarkdown(segments, meta, aiParas) {
  meta = meta || {};
  let recs = null;
  if (Array.isArray(aiParas) && aiParas.length) {
    const starts = pbpVideoParaStarts(segments, aiParas);
    if (starts) recs = aiParas.map((text, i) => ({ text, from: starts[i] }));
  }
  if (!recs) recs = pbpVideoMergeParagraphRecords(segments);
  const lines = pbpVideoTranscriptHeaderLines(meta);
  lines.push(recs.map((r) => {
    const label = pbpVideoFmtTime(r.from);
    const link = meta.url ? pbpVideoDeepLink(meta.url, r.from) : "";
    return (link ? "[" + label + "](" + link + ")" : "[" + label + "]") + " " + r.text;
  }).join("\n\n"));
  return lines.join("\n");
}

// Safe track descriptor for videoState.tracks -- key + display fields only,
// deliberately dropping baseUrl/subtitle_url. Those endpoints can be signed
// and expire; persisting them would let an F5 restore hand the picker a URL
// that 404s. Runtime re-maps a stable key back to a live endpoint only when
// the user actually switches tracks.
function _pbpVideoTrackDescribe(track, provider) {
  // IDEMPOTENT: a commit made ON an F5-hydrated session rebuilds its
  // videoState from the session's tracks, which are already descriptors. Read
  // through them once more and bilibili would lose everything (a descriptor
  // has no lan/lan_doc at all -> key "", empty labels), quietly degrading the
  // persisted track list one reload at a time. Pass a descriptor through
  // unchanged instead; the four-field shape below is exactly what
  // pbpVideoStateValidate enforces, and no provider-native track carries a
  // `key` property.
  if (track && typeof track.key === "string" && typeof track.lang === "string"
      && typeof track.label === "string" && typeof track.asr === "boolean") {
    return { key: track.key, lang: track.lang, label: track.label, asr: track.asr };
  }
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

// Pre-click cost accounting for an AI punctuation pass (research T4.2):
// characters the NEXT click would actually send -- batches with a cached
// conservation-passing answer are free, so a retry's estimate shows only
// the remaining debt. Pure; the token math stays with the caller.
function pbpVideoAiEstChars(batches, cachedHas) {
  let chars = 0;
  for (const b of batches || []) if (!cachedHas || !cachedHas(b)) chars += b.length;
  return chars;
}

// Paragraph rows for the timeline's paragraph density (research T7.10):
// one row per reading paragraph, timed [first segment start, next
// paragraph start or last segment end). AI paragraphs are used when they
// align with the segment stream, else the heuristic records -- the SAME
// choice the reading view makes, so row i is article paragraph i.
function pbpVideoParagraphRows(segments, aiParas) {
  const segs = segments || [];
  if (!segs.length) return [];
  let recs = null;
  if (Array.isArray(aiParas) && aiParas.length) {
    const starts = pbpVideoParaStarts(segs, aiParas);
    if (starts) recs = aiParas.map((text, i) => ({ text, from: starts[i] }));
  }
  if (!recs) recs = pbpVideoMergeParagraphRecords(segs);
  const last = segs[segs.length - 1];
  const end = (typeof last.to === "number" && last.to > 0) ? last.to : (Number(last.from) || 0);
  return recs.map((r, i) => ({ from: r.from, to: i + 1 < recs.length ? recs[i + 1].from : end, content: r.text }));
}

// Auxiliary-track pairing (research T5.2): each row takes the aux cues
// whose midpoint falls inside [row start, next row start) -- rows tile the
// timeline, so every cue lands in exactly one row or, before the first
// row, in none. Returns one joined string per row ("" = nothing paired).
function pbpVideoPairByTime(rows, aux) {
  const list = rows || [], cues = aux || [];
  const out = [];
  let j = 0;
  for (let i = 0; i < list.length; i++) {
    const from = Number(list[i].from) || 0;
    const nextFrom = i + 1 < list.length ? Number(list[i + 1].from) : NaN;
    const to = (Number(list[i].to) > from) ? Number(list[i].to) : from + 3;
    const end = Number.isFinite(nextFrom) ? nextFrom : to;
    const parts = [];
    while (j < cues.length) {
      const c = cues[j];
      const cf = Number(c.from) || 0;
      const ct = (Number(c.to) > cf) ? Number(c.to) : cf + 2;
      const mid = (cf + ct) / 2;
      if (mid < from) { j++; continue; }
      if (mid >= end) break;
      const txt = String((c && c.content) || "").trim();
      if (txt) parts.push(txt);
      j++;
    }
    out.push(parts.join(" "));
  }
  return out;
}

// Row that carries a paragraph's projection (research T5.1): the first row
// starting inside [start, nextStart). -1 when none does.
function pbpVideoRowForParagraph(rows, start, nextStart) {
  const list = rows || [];
  // rows are sorted by `from`: lower_bound(start), then the window check
  let lo = 0, hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const f = Number(list[mid] && list[mid].from);
    if (Number.isFinite(f) && f < start) lo = mid + 1; else hi = mid;
  }
  if (lo >= list.length) return -1;
  const f = Number(list[lo] && list[lo].from);
  return (Number.isFinite(f) && f >= start && (nextStart == null || f < nextStart)) ? lo : -1;
}

// Previous/next cue index for keyboard stepping (research T3.3): from the
// current row, or from the row at `sec` when nothing is current yet;
// clamped to the transcript. -1 only for an empty transcript.
function pbpVideoCueStep(segments, currentIdx, sec, dir) {
  const n = (segments || []).length;
  if (!n) return -1;
  let idx = currentIdx >= 0 ? currentIdx : pbpVideoRowIndexAt(segments, Number(sec) || 0);
  if (idx < 0) idx = 0;
  return Math.min(n - 1, Math.max(0, idx + (dir < 0 ? -1 : 1)));
}

// Watch-page deep link at a second (research T1.1/T1.3): the one URL shape
// every time-carrying consumer (vocab context, timestamped export, Ask/skim
// chips) shares. Mirrors the open-external link construction; empty string
// when the page is not a recognised video URL.
function pbpVideoDeepLink(pageUrl, sec) {
  const det = pbpVideoDetect(pageUrl);
  if (!det) return "";
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  if (det.provider === "bilibili") {
    return "https://www.bilibili.com/video/" + encodeURIComponent(det.bvid) + "/?"
      + (det.part > 1 ? "p=" + det.part + "&" : "") + "t=" + s;
  }
  return "https://www.youtube.com/watch?v=" + encodeURIComponent(det.videoId) + "&t=" + s + "s";
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
  // Persisted keys carry the same "#N" collision suffix the live picker
  // uses (audit B12): without it, selecting the second of two same-key
  // tracks (English + English CC) survived the session but an F5 restored
  // the FIRST one under the second one's words. Suffixing is idempotent --
  // descriptors from a hydrated session already carry their suffix, which
  // makes their keys distinct and leaves this pass a no-op.
  const seenKeys = new Map();
  const descs = tracks.map((tr) => {
    const d = _pbpVideoTrackDescribe(tr, provider);
    if (d && d.key) {
      const n = (seenKeys.get(d.key) || 0) + 1;
      seenKeys.set(d.key, n);
      if (n > 1) d.key = d.key + "#" + n;
    }
    return d;
  });
  const selIdx = opts.track ? tracks.indexOf(opts.track) : -1;
  const state = {
    v: 1,
    provider,
    selectedTrackKey: selIdx >= 0
      ? ((descs[selIdx] && descs[selIdx].key) || "")
      : pbpVideoTrackKey(opts.track, provider),
    tracks: descs,
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
// pbpVideoSessionMatches above), tracks/selectedTrackKey shape (display-only
// data that never flows through the markdown-equality check below, so it
// needs its own guard here -- see the inline comment at that check), segment
// array shape/bounds, and finally that segments + paragraphs + meta
// reconstruct byte-identical markdown to the canonical article the page
// actually committed. That last check is the one that matters most: any
// drift between persisted timeline state and the committed article (a bug
// in this file, a manual storage edit, a schema migration gone wrong) must
// fall back to a live refetch rather than render a timeline that silently
// disagrees with the article above it.
function pbpVideoStateValidate(state, detected, canonicalMarkdown) {
  if (!state || typeof state !== "object") return false;
  if (state.v !== 1) return false;
  if (!detected) return false;
  if (state.provider !== detected.provider) return false;
  if (detected.provider === "bilibili") {
    if (state.bvid !== detected.bvid || state.part !== detected.part) return false;
  } else if (state.videoId !== detected.videoId) return false;
  // tracks/selectedTrackKey are describe-only picker data: nothing forces
  // them through the markdown-equality check below (unlike segments/
  // paragraphs), so a corrupted shape here would otherwise sail through
  // validation and only blow up later when a hydration consumer does
  // state.tracks.map(...) or compares against selectedTrackKey. Guard the
  // exact shape pbpVideoStateBuild always produces. selectedTrackKey "" is
  // accepted even when tracks is non-empty: the DOM-scrape rescue tier
  // (loadFlow's last-resort transcript capture) legitimately reports a
  // non-empty track list with no known selection (track: null -- "track:null
  // is honest here" per loadFlow's own comment), and
  // pbpVideoTrackKey(null, ...) is exactly "" -- rejecting that combination
  // would fail-close a real, valid session state.
  if (!Array.isArray(state.tracks)) return false;
  for (const tr of state.tracks) {
    if (!tr || typeof tr !== "object") return false;
    if (typeof tr.key !== "string") return false;
    if (typeof tr.lang !== "string") return false;
    if (typeof tr.label !== "string") return false;
    if (typeof tr.asr !== "boolean") return false;
  }
  if (typeof state.selectedTrackKey !== "string") return false;
  // meta's own shape, because the equality check below cannot see all of it:
  // pbpVideoTranscriptMarkdown only emits the source blockquote (and with it
  // the title) when meta.url is truthy, so on a URL-less state the title
  // would ride in completely unconstrained -- and it does reach the article,
  // on the NEXT commit (pbpVideoTranscriptMeta takes title from the session
  // but url from the live page). A title that never entered the article it
  // was persisted with must not be restorable from storage either, so the
  // two are bound together (review F3).
  const meta = state.meta;
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return false;
  if (typeof meta.title !== "string" || typeof meta.url !== "string" || typeof meta.trackLabel !== "string") return false;
  if (!meta.url && meta.title) return false;
  const segs = state.segments;
  if (!Array.isArray(segs) || segs.length > 20000) return false;
  let totalChars = 0;
  let prevFrom = -Infinity;
  for (const s of segs) {
    if (!s || typeof s !== "object") return false;
    if (typeof s.from !== "number" || !Number.isFinite(s.from)) return false;
    if (typeof s.to !== "number" || !Number.isFinite(s.to)) return false;
    if (typeof s.content !== "string") return false;
    // Track order, the invariant this file already RELIES on: pbpVideoRowIndexAt
    // binary-searches these rows ("Segments are assumed sorted by `from` --
    // every producer in this file emits them in track order"), and follow-mode
    // seeking reads the result. Free for every legitimate producer; a persisted
    // state whose timings were shuffled would silently mis-seek instead.
    if (s.from < prevFrom) return false;
    prevFrom = s.from;
    totalChars += s.content.length;
    if (totalChars > 2 * 1024 * 1024) return false;
  }
  if (state.paragraphs != null && !Array.isArray(state.paragraphs)) return false;
  if (typeof canonicalMarkdown !== "string") return false;
  // THE gap the byte-equality check below cannot close on its own (review F1):
  // pbpVideoTranscriptMarkdown IGNORES segments entirely whenever paragraphs
  // are non-empty -- i.e. exactly the AI-punctuated tier this format exists
  // for -- so equality with the canonical article says nothing at all about
  // the rows this state would hydrate into the timeline. Unbound, a corrupt
  // or hand-edited record could put words on screen that the article does not
  // contain, and (through the re-offered AI pass, which rebuilds its prompt
  // from _segments) commit them into the article itself.
  //
  // Bind them with the same conservation invariant every legitimate producer
  // already satisfies, so nothing real is rejected: pbpVideoMergeParagraphs
  // only joins rows with spaces and normalizes whitespace, the AI pass gates
  // every batch on this very predicate, and pbpVideoApplyPunctText consumes
  // exactly each row's non-mark characters. What it bounds is "no word can
  // appear in the timeline that is not in the article"; what it deliberately
  // cannot bound is which ROW a given word sits in, because the persistence
  // format has no way to express row boundaries once paragraphs shadow them.
  if (Array.isArray(state.paragraphs) && state.paragraphs.length
      && !pbpVideoPunctConserved(segs.map((s) => s.content).join(" "), state.paragraphs.join(" "))) return false;
  if (pbpVideoTranscriptMarkdown(segs, state.meta, state.paragraphs) === canonicalMarkdown) return true;
  // Migration accepts (audit U14 + closing review): the heading was
  // localized AND the title gained markdown escaping in the SAME campaign,
  // so a pre-campaign record can differ on either axis or both. Accept
  // every remaining combination -- otherwise old payloads (titles with
  // | [ ] # etc. are common on YouTube/bilibili) orphan into a refetch and
  // silently drop paid AI passes (node-reproduced, closing review).
  const accepts = [["Transcript", false], [null, true], ["Transcript", true]];
  for (const [h, raw] of accepts) {
    if (pbpVideoTranscriptMarkdown(segs, state.meta, state.paragraphs, h, raw) === canonicalMarkdown) return true;
  }
  return false;
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
  // Default-track pick only. The old opts.pickBaseUrl branch existed so a
  // track switch could re-enter this whole chain with a chosen URL; the picker
  // now fetches the chosen endpoint directly (pbpYtFetchCaptionBody), so
  // nothing has passed it since -- removed rather than left as a dead option.
  const track = pbpYtPickTrack(tracks, opts.uiLang, PBP_VIDEO_PICK_HINTS.prefs, PBP_VIDEO_PICK_HINTS.preferKey);
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
    // A multi-part URL pointing at a part that no longer exists must FAIL,
    // not silently fall back to part 1's cid -- that would fetch and commit
    // the wrong part's subtitles as this bookmark's article (audit A9).
    else if (part > 1) return null;
  }
  return { cid: cid, title: d.title || "", pic: d.pic || "", owner: (d.owner && d.owner.name) || "", pages: d.pages || [] };
}

function _pbpBiliIsZh(t) { return /^zh|^ai-zh/i.test(t.lan || "") || /中文|中文\(AI\)|Chinese/i.test(t.lan_doc || ""); }
function _pbpBiliIsAi(t) { return /^ai-/i.test(t.lan || "") || /AI|智能/i.test(t.lan_doc || ""); }
// bilibili default subtitle: remembered key > preferred languages in order
// (human before AI within a language) > the zh default > first.
function pbpBiliPickSubtitle(subs, prefs, preferKey) {
  if (!Array.isArray(subs) || !subs.length) return null;
  const remembered = pbpVideoResolvePreferKey(subs, "bilibili", preferKey);
  if (remembered) return remembered;
  const baseOf = (s) => String((s && s.lan) || "").toLowerCase().replace(/^ai-/, "").split("-")[0];
  for (const b of (Array.isArray(prefs) ? prefs : [])) {
    const lang = subs.filter((s) => baseOf(s) === b);
    if (!lang.length) continue;
    return lang.find((s) => !_pbpBiliIsAi(s)) || lang[0];
  }
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
  // Default-track pick only -- see the pbpYtFetchTranscript twin: the removed
  // opts.pickSubtitleUrl branch was the URL-addressed track switch, which now
  // goes straight to pbpBiliFetchSubtitleBody.
  const track = pbpBiliPickSubtitle(subs, PBP_VIDEO_PICK_HINTS.prefs, PBP_VIDEO_PICK_HINTS.preferKey);
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
  // Lucide v0.525.0 "locate-fixed" (same byte-copy rule) -- the follow-
  // playback toggle's icon: a locked crosshair reads as "stay locked onto
  // the position". Local for the same single-consumer reason as PLAY above.
  const PBV_FOLLOW_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="2" x2="5" y1="12" y2="12"/><line x1="19" x2="22" y1="12" y2="12"/><line x1="12" x2="12" y1="2" y2="5"/><line x1="12" x2="12" y1="19" y2="22"/><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="3"/></svg>';
  // Learning-loop glyphs (research T3.2/T3.6), Lucide v0.525.0 repeat-1 / pause / timer.
  const PBV_LOOP_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/><path d="M11 10h1v4"/></svg>';
  const PBV_PAUSE_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/></svg>';
  const PBV_CLOCK_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="10" x2="14" y1="2" y2="2"/><line x1="12" x2="15" y1="14" y2="11"/><circle cx="12" cy="14" r="8"/></svg>';
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

  // ---- Commit-transaction state (in-place article replacement) ----
  // The controls a commit has to freeze, the AI button's label span, and the
  // list the timeline renders into. They are BUILT in runLoad and USED from
  // loadFlow, the track-change handler and the AI pass; threading four more
  // parameters through two call chains would only hide that coupling.
  let _trackSelEl = null, _aiBtnEl = null, _listEl = null;
  // Punctuation-state note beside the picker (audit U1): says WHY the AI
  // button is or is not on offer for the current track.
  let _aiNoteEl = null;
  // Status element for module-level writers (seek preannounce, audit U12).
  let _statusEl = null;
  // Retry control, module-level so loadFlow successes can retire it and
  // every failure catch can surface it (closing review M2/F3).
  let _retryBtnEl = null;
  // Current video identity for per-video persistence (audit U4). Set at
  // mount; null on non-video defensive mounts.
  let _detectedNow = null;
  // Owner scope for that persistence (closing review M7): view choices are
  // per-Pinboard-account, like every other account-derived record.
  let _ownerNow = "ownerless";
  // Per-view scroll memory within this page session (audit U11): both study
  // views share the PAGE scroller in video-mode, so switching used to dump
  // the reader at whatever offset the other view left behind.
  const _viewScroll = { reading: null, timeline: null };
  // Cancel flag for a running AI-punctuation pass (audit U8): checked
  // between batches; finished batches stay cached.
  let _aiCancelRequested = false;

  // ---- per-video view memory (audit U4): local-only, 50-entry LRU ----
  function _videoViewKey(d) {
    return _ownerNow + "|" + (d.provider === "bilibili"
      ? "bili:" + d.bvid + ":" + (d.part || 1)
      : "yt:" + d.videoId);
  }
  // Whole per-video record (research T6.2/T6.3): { view, trackKey, t, ts }.
  async function pbpVideoSavedRecord(d) {
    try {
      const rec = (await chrome.storage.local.get("pbp_video_view")).pbp_video_view || {};
      const e = rec[_videoViewKey(d)];
      return (e && typeof e === "object") ? e : null;
    } catch (_) { return null; }
  }
  async function pbpVideoSavedView(d) {
    const e = await pbpVideoSavedRecord(d);
    return e && (e.view === "reading" || e.view === "timeline") ? e.view : null;
  }
  // Merge-write: each caller patches only its own field (view / trackKey /
  // t); same owner-scoped key, same 50-entry LRU, local-only.
  // Writes are serialised in-page (retro #8): the 5s position save, a
  // view/density flip and a track switch can otherwise read the same stale
  // snapshot and the last writer drops the others' fields. Cross-tab
  // interleaving on the same record remains possible (known limitation;
  // the record is a convenience, not data).
  let _viewWriteChain = Promise.resolve();
  function pbpVideoSaveView(d, patch) {
    _viewWriteChain = _viewWriteChain.then(async () => {
      const rec = (await chrome.storage.local.get("pbp_video_view")).pbp_video_view || {};
      const k = _videoViewKey(d);
      const prev = (rec[k] && typeof rec[k] === "object") ? rec[k] : {};
      const p = (patch && typeof patch === "object") ? patch : { view: patch };
      rec[k] = { ...prev, ...p, ts: Date.now() };
      const keys = Object.keys(rec);
      if (keys.length > 50) {
        keys.sort((a, b) => ((rec[a] && rec[a].ts) || 0) - ((rec[b] && rec[b].ts) || 0));
        for (const kk of keys.slice(0, keys.length - 50)) delete rec[kk];
      }
      await chrome.storage.local.set({ pbp_video_view: rec });
    }).catch(() => {});
    return _viewWriteChain;
  }
  // Last-selection-wins token. Every track-change event takes one, and every
  // await re-checks it: a response for a track the user has already moved off
  // must render nothing, touch no state, and above all never ATTEMPT a commit.
  // The committer's serial lock would refuse a stale commit -- but only after
  // being asked to persist the wrong track, and a refusal cannot un-ask.
  let _trackSwitchSeq = 0;
  // Bumped every time the panel ADOPTS a different transcript -- a track
  // switch's segments landing, or a rollback putting the previous ones back.
  // A long-running operation that captured the transcript before the bump is
  // working from words that are no longer on screen; that is a different
  // question from _trackSwitchSeq, which only tells one switch from another
  // and is already bumped (at handler entry) before a switch has adopted
  // anything. The paid AI pass fences on THIS one.
  let _transcriptEpoch = 0;
  // Picker option values, index-aligned with the track list the picker was
  // built from. Usually just each track's pbpVideoTrackKey -- see
  // buildTrackValues for why "usually" is not "always".
  let _trackValues = [];
  // Value of the option matching the track the ARTICLE currently carries
  // (picker rollback target). This is the picker's value space, which may
  // carry a collision suffix; the persisted selectedTrackKey is always the
  // plain pbpVideoTrackKey and is computed separately.
  let _selectedTrackKey = "";
  // Did the CURRENT track arrive unpunctuated? Decides the AI offer and rides
  // into videoState. Re-evaluated per track switch, not frozen at mount.
  let _wasUnpunct = false;
  // A pass whose result is already in the article: the button stays disabled
  // through any later freeze/unfreeze until refreshAiOffer re-offers it for a
  // new track. Kept out of the freeze counters so an unfreeze cannot re-arm a
  // pass the user already paid for.
  let _aiPassDone = false;
  // Per-batch AI-punctuation result cache, keyed by the batch's exact text
  // (audit B9): a pass where some batches failed no longer commits, and the
  // retry click re-pays ONLY for the failed batches -- the passed ones
  // answer from here. Page-lifetime; a track switch changes the batch text,
  // so stale entries simply never match.
  const _aiBatchCache = new Map();
  // Cross-session punctuation cache (research T4.1): the page-lifetime map
  // above is seeded from, and fed into, one aggregate pbp-ai-cache entry
  // per owner + video + track + provider/model + generation. Only answers
  // that pass the conservation gate AND actually punctuate are admitted --
  // on both the write and the (re-verified) read. Bump the generation when
  // the prompt, the mark whitelist or the repair rules change.
  const PBP_VIDEO_PUNCT_GEN = 2; // 2: key = the model callAI really uses (retro V3)
  let _aiSettingsSnap = null;
  let _aiAbort = null; // per-pass AbortController (research T4.4)
  // The model identity the punctuation request is ACTUALLY sent with:
  // callAI (ai.js) resolves provider-native model fields and ignores the
  // reader override, so the key mirrors that resolution -- plus the base
  // URL for OpenAI-compatible endpoints, where the same model name on two
  // hosts is two different models (retro V3).
  function punctModelId(sa) {
    const p = sa.aiProvider || "gemini";
    if (p === "gemini") return "gemini:" + (sa.geminiModel || "default");
    if (p === "claude") return "claude:" + (sa.claudeModel || "default");
    if (p === "ollama") return "ollama:" + (sa.ollamaModel || "default") + "@" + (sa.ollamaBaseUrl || "");
    const cfg = (typeof OPENAI_COMPAT_PROVIDERS === "object" && OPENAI_COMPAT_PROVIDERS[p]) || null;
    const model = (cfg && ((cfg.modelField && sa[cfg.modelField]) || cfg.defaultModel)) || "default";
    let base = "";
    try { base = (typeof _openaiCompatBase === "function" && cfg) ? String(_openaiCompatBase(cfg, sa) || "") : ""; } catch (_) {}
    return p + ":" + model + "@" + base;
  }
  function punctCacheKey(sa) {
    if (!_detectedNow || !sa || typeof pbpAiHash !== "function") return "";
    // _ownerNow is already the non-secret owner scope ("acct_<name>" /
    // "ownerless"), the same vocabulary the other owner-scoped keys use
    // (retro V5: feeding it to _pbpTrOwnerScope doubled the prefix).
    const owner = String(_ownerNow || "ownerless");
    const raw = _videoViewKey(_detectedNow) + "|" + (_selectedTrackKey || "") + "|" + punctModelId(sa) + "|g" + PBP_VIDEO_PUNCT_GEN;
    return "vpunct_" + owner + "_" + pbpAiHash(raw);
  }
  async function seedPunctCache(sa, batches) {
    const key = punctCacheKey(sa);
    if (!key || typeof pbpAiCacheGet !== "function") return 0;
    let entry = null;
    try { entry = await pbpAiCacheGet(key); } catch (_) { return 0; }
    const map = entry && entry.result && entry.result.batches;
    if (!map || typeof map !== "object") return 0;
    let n = 0;
    for (const b of batches || []) {
      if (_aiBatchCache.has(b)) continue;
      const out = map[pbpAiHash(b)];
      if (typeof out !== "string") continue;
      if (pbpVideoPunctConserved(b, out) && pbpVideoPunctChanged([out], [b])) { _aiBatchCache.set(b, out); n++; }
    }
    if (n) console.info("[pbp-video] ai punctuation: " + n + " batch(es) restored from the cross-session cache");
    return n;
  }
  function persistPunctBatch(sa, batches, b, out) {
    const key = punctCacheKey(sa);
    if (!key || typeof pbpAiCacheAppend !== "function") return;
    const h = pbpAiHash(b);
    // The entry converges on THIS transcript's batches: hashes of batch
    // texts that no longer exist (a re-generated ASR track) are dropped,
    // so the aggregate cannot grow without bound (retro V7).
    const keep = new Set((batches || []).map((x) => pbpAiHash(x)));
    pbpAiCacheAppend(key, (prev) => {
      const base = (prev && typeof prev === "object" && prev.batches && typeof prev.batches === "object") ? prev.batches : {};
      const next = {};
      for (const k of Object.keys(base)) if (keep.has(k)) next[k] = base[k];
      next[h] = out;
      return { gen: PBP_VIDEO_PUNCT_GEN, batches: next };
    }, Date.now()).catch(() => {});
  }
  // Provider host-grant state settled at OFFER time (audit B10):
  // permissions.request demands the click's transient activation, so the
  // origins and the contains() answer are computed ahead of the click and
  // the request becomes the handler's FIRST await when a grant is missing.
  let _aiOrigins = null, _aiHostGranted = false;
  // Last playback position the relay reported (audit B13): a re-render
  // clears the row highlight, and a paused player sends no new time events
  // to restore it -- so the re-render sites replay this instead.
  let _lastRelayTime = null;

  // Video duration for the header stats line (research T1.6): the last
  // segment's end IS the length, no network involved. md-preview.js reads
  // this from computeStatBase; 0 = no transcript yet, caller falls back.
  window.pbpVideoDuration = () => {
    const s = _segments;
    return (s && s.length) ? Math.max(0, Math.floor(s[s.length - 1].to || 0)) : 0;
  };

  // Pre-click cost estimate for the AI punctuation button (research T4.2):
  // same ×3 calibration the translation estimator applies on CJK-heavy text
  // (pbpAiEstimateTokens is chars/4, Latin-calibrated), covering an echo
  // pass's input + output. Cached batches are subtracted, so after a
  // partial failure the title advertises only what the retry still pays.
  function aiCostTitle() {
    const base = t("mdVideoAiPunct");
    try {
      if (!_segments.length) return base;
      const batches = pbpVideoSplitBatches(pbpVideoMergeParagraphs(_segments), 1600);
      const chars = pbpVideoAiEstChars(batches, (b) => _aiBatchCache.has(b));
      if (!chars) return base;
      const tok = (typeof pbpAiEstimateTokens === "function"
        ? pbpAiEstimateTokens(chars) : Math.ceil(chars / 4)) * 3;
      return base + " · " + t("mdVideoAiPunctEst", tok.toLocaleString());
    } catch (_) { return base; }
  }
  function applyAiCostTitle(btn) {
    if (!btn) return;
    const label = aiCostTitle();
    btn.title = label;
    btn.setAttribute("aria-label", label);
  }

  // ---- paragraph time gutter (research T1.1) ----------------------------
  // The reading view's paragraphs learn their start second: `data-t` on the
  // <p> plus a ZERO-TEXT seek button as its first child whose label paints
  // via CSS content:attr(data-label). Zero text by contract -- highlight
  // anchors, translation block hashes, Ask/skim block text and the copied
  // selection all read textContent, and DOMPurify's FORBID_TAGS (button)
  // strips it again on any DOM->markdown->render round trip. The canonical
  // markdown, videoState and the hydration matrix are untouched.
  // Fail-closed: any paragraph-count or character-stream disagreement means
  // no gutter at all rather than a wrong time on a right paragraph.
  function applyParaTimes() {
    if (!document.body.classList.contains("video-mode")) return;
    if (!window.pbpVideoDoc || window.pbpVideoDoc.kind !== "video-transcript") return;
    if (!_segments.length) return;
    const view = document.getElementById("rendered-view");
    if (!view) return;
    const paras = (_aiPunctParas && _aiPunctParas.length) ? _aiPunctParas : pbpVideoMergeParagraphs(_segments);
    const starts = pbpVideoParaStarts(_segments, paras);
    if (!starts) { console.info("[pbp-video] para-times: stream mismatch -- gutter skipped"); return; }
    const ps = view.querySelectorAll(":scope > p");
    if (ps.length !== starts.length) {
      console.info("[pbp-video] para-times: " + ps.length + " paragraphs vs " + starts.length + " starts -- gutter skipped");
      return;
    }
    ps.forEach((p, i) => {
      // Precise (ms): two paragraphs starting at 10.2 and 10.8 must not
      // collapse onto the same second (retro #3); labels and deep links
      // floor on their own.
      const sec = Math.max(0, Math.round((Number(starts[i]) || 0) * 1000) / 1000);
      p.dataset.t = String(sec);
      let btn = p.querySelector(":scope > .pbv-ptime");
      if (!btn) {
        btn = document.createElement("button");
        btn.type = "button";
        btn.className = "pbv-ptime";
        btn.tabIndex = -1; // 165 tab stops otherwise; keyboard seeking lives on the timeline / [ ] / c (retro A11Y-2)
        btn.addEventListener("click", (ev) => {
          ev.stopPropagation();
          seekTo(Number(btn.dataset.t || "0"), false); // jump, keep the play state (critic #3)
        });
        p.insertBefore(btn, p.firstChild);
      }
      const label = pbpVideoFmtTime(sec);
      btn.dataset.t = String(sec);
      btn.dataset.label = label;
      const aria = t("mdVideoSeekTo", label);
      btn.title = aria;
      btn.setAttribute("aria-label", aria);
    });
    scheduleProjectTranslations();
  }
  // Every article commit re-renders #rendered-view (the gutter goes with
  // the old nodes); md-preview.js dispatches this after the new DOM is up.
  document.addEventListener("pbp:article-replaced", () => { try { applyParaTimes(); } catch (_) {} });

  // Node -> second bridge for the reader modules (vocab deep links, Ask/skim
  // chip seeks): a timeline row carries data-from, a gutter paragraph
  // carries data-t. null when the node sits in neither.
  window.pbpVideoTimeForNode = (node) => {
    let n = node && node.nodeType === 3 ? node.parentElement : node;
    while (n && n !== document.body) {
      if (n.dataset) {
        if (n.classList && n.classList.contains("pbv-row") && n.dataset.from != null) return Number(n.dataset.from);
        if (n.tagName === "P" && n.dataset.t != null) return Number(n.dataset.t);
      }
      n = n.parentElement;
    }
    return null;
  };
  window.pbpVideoDeepLinkAt = (sec) => (_meta && _meta.url) ? pbpVideoDeepLink(_meta.url, sec) : "";
  // Current playback second (relay-reported on YouTube; the last explicit
  // seek on bilibili) for the Ask "near the current caption" scope.
  window.pbpVideoCurrentTime = () => _lastRelayTime;
  // Live shortcut set for the help panel (retro KBD-3): only keys that do
  // something on THIS page/provider are listed.
  window.pbpVideoShortcutKeys = () => {
    const s = new Set(["[", "]", "c", "b"]);
    if (!_isBili && _followBtn && !_followBtn.hidden) {
      s.add("Space"); s.add("\u2190"); s.add("\u2192"); s.add("f");
      if (_loopBtn && !_loopBtn.hidden) s.add("r");
    }
    return s;
  };
  // Seek entry for reader modules (Ask/skim chips): same best-effort seekTo.
  window.pbpVideoSeek = (sec) => { try { seekTo(Math.max(0, Number(sec) || 0), false); } catch (_) {} }; // citation jumps keep the play state

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
  // Playback controls (research T3.x). _relayState = last YT.PlayerState the
  // relay reported (1 = playing). Loop / auto-pause / lookup-pause / rate
  // ride the relay's verbs; an older relay page ignores the new ones, so
  // every command is best-effort and no UI claims a state it did not see.
  let _relayState = -1;
  let _loopOn = false, _loopBtn = null;
  let _autoPauseOn = false, _autoPauseBtn = null, _rateSel = null;
  let _pausedByLookup = false, _lookupTimer = null;
  let _backBtn = null, _statusElRef = null;
  let _seekGraceUntil = 0, _seekTarget = null, _seekDir = 1; // stale ticks right after a seek
  let _autoPauseLatch = -1, _endedCleared = false; // one pause per cue; one resume-clear per ending
  let _auxGen = 0;                                 // bumped when the primary track changes (retro #7)
  let _rovingBtn = null;                         // the one time button in the tab order (T3.4)
  let _estOn = false, _estBtn = null, _estTimer = null, _estAnchor = null; // bilibili estimate clock (T3.6)
  let _videoPrefs = { langPrefs: [], pauseOnLookup: true }; // settings snapshot (T6.1/T3.5)
  let _rowSegs = [], _density = "cue", _densityBtn = null;  // timeline rows as rendered (T7.10)
  let _trObserver = null, _trProjTimer = null;                // translation projection (T5.1)
  let _auxSel = null, _auxSegs = null;                         // auxiliary track (T5.2)
  let _savedRec = null, _resumeEl = null, _lastPosSaveAt = 0;  // continue-watching (T6.3)

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
  async function ytTabDomTranscript(tabId, videoId) {
    let inj = null;
    try {
      inj = await chrome.scripting.executeScript({
        target: { tabId },
        world: "MAIN", // the fetch/XHR taps must live in the page world
        args: [videoId || ""],
        func: async (vid) => {
          const out = { kind: "", body: "", segs: [], trace: "" };
          // Wrong-tab guard, same class as the player-capture guard (device
          // 2026-08-24): the fetch tab was picked by HOSTNAME and the rescue
          // chain ahead of this tier can burn tens of seconds -- the tab may
          // be showing ANOTHER video by now, and this scraper reads whatever
          // transcript panel that page happens to show. Without this, video
          // B's captions get returned as A's "success" and even poison the
          // tier cache (audit round 5, A1).
          if (vid && !String(location.href).includes(vid)) {
            out.trace = "tab no longer on target video";
            return out;
          }
          // Same cross-page tap lease as the player capture (audit A3): this
          // scraper installs the same fetch/XHR wrappers.
          const myLease = { exp: Date.now() + 90000 };
          if (window.__pbpTapLease && window.__pbpTapLease.exp > Date.now()) {
            out.trace = "another capture holds this tab";
            return out;
          }
          window.__pbpTapLease = myLease;
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
          // Row NODES, not mapped objects: the scroller search below needs a
          // real element to climb from, and rows can live inside shadow roots
          // where the light-DOM q(ROW_SEL) never finds them (audit A2: row0
          // null skipped the scroll accumulation and first-screen rows were
          // returned as the "complete" transcript).
          const rowNodes = () => {
            let rows = qa(ROW_SEL);
            if (!rows.length) for (const p of panels()) { rows = deepQA(ROW_SEL, p); if (rows.length) break; }
            return rows;
          };
          const readRows = () => {
            return rowNodes().map((row) => {
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
          const tagTap = () => {
            try { window.fetch.__pbpTap = myLease; } catch (_) {}
            try { XMLHttpRequest.prototype.open.__pbpTap = myLease; } catch (_) {}
            try { XMLHttpRequest.prototype.send.__pbpTap = myLease; } catch (_) {}
          };
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
            tagTap();

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
            if (captured) {
              if (vid && !String(location.href).includes(vid)) {
                out.trace = "tab navigated away mid-scrape";
                return out;
              }
              out.kind = "net"; out.body = captured; return out;
            }
            if (segs.length) {
              // virtualized list: scroll and accumulate. Two safeguards,
              // both learned from garbled rows on device: a row only counts
              // when two reads 120ms apart agree (a node caught mid-recycle
              // never survives that), and the FIRST stable version of a
              // timestamp is final -- last-read-wins let a row's dying
              // glimpse (recycled as it scrolled out) overwrite a good read.
              // Key on from|content, not from alone: machine captions can
              // put two different lines on the same timestamp, and a
              // from-only map silently dropped the second (audit A2).
              const seen = new Map();
              const keep = (list) => list.forEach((s) => { const k = s.from + "|" + s.content; if (!seen.has(k)) seen.set(k, s); });
              const readStable = async () => {
                const a = readRows();
                await sleep(120);
                const b = readRows();
                const bk = new Set(b.map((s) => s.from + "|" + s.content));
                return a.filter((s) => bk.has(s.from + "|" + s.content));
              };
              keep(await readStable());
              // Climb from a real row node and keep climbing THROUGH shadow
              // boundaries (parentElement is null at a shadow root's top; the
              // host continues the chain) -- the light-DOM-only climb is what
              // made row0 null for shadow panels and skipped accumulation.
              const up = (el) => el && (el.parentElement || (el.getRootNode && el.getRootNode().host) || null);
              const row0 = rowNodes()[0] || null;
              let scroller = up(row0);
              while (scroller && scroller !== document.body && scroller.scrollHeight <= scroller.clientHeight + 4) scroller = up(scroller);
              if (scroller && scroller !== document.body) {
                let stable = 0, lastCount = seen.size;
                for (let i = 0; i < 80 && stable < 3; i++) {
                  scroller.scrollTop += Math.max(120, scroller.clientHeight * 0.9);
                  await sleep(240);
                  keep(await readStable());
                  if (seen.size === lastCount) stable++; else { stable = 0; lastCount = seen.size; }
                }
                scroller.scrollTop = 0;
              } else {
                // No scroller found (closing review H4): row COUNT proves
                // nothing about completeness on a long video. Accept only
                // when the collected rows demonstrably cover the video --
                // last timestamp within the final 20% of the duration --
                // otherwise fail the tier rather than pose a first screen as
                // the full transcript.
                let dur = 0;
                try {
                  const pl = document.querySelector("#movie_player");
                  if (pl && typeof pl.getDuration === "function") dur = Number(pl.getDuration()) || 0;
                } catch (_) {}
                const lastFrom = Math.max(0, ...Array.from(seen.values()).map((x) => x.from || 0));
                if (!(dur > 0 && lastFrom >= dur * 0.8)) {
                  out.trace = "no scroller; refusing " + seen.size + " rows (coverage " +
                    (dur > 0 ? Math.round((lastFrom / dur) * 100) + "%" : "unknown") + ")";
                  return out;
                }
                out.trace = "no scroller; accepted on duration coverage";
              }
              // Return-time identity recheck (closing review H2): the tab can
              // SPA-navigate mid-scrape; rows read after that may be another
              // video's panel.
              if (vid && !String(location.href).includes(vid)) {
                out.kind = ""; out.segs = [];
                out.trace = "tab navigated away mid-scrape";
                return out;
              }
              out.kind = "dom";
              out.segs = Array.from(seen.values()).sort((a, b) => a.from - b.from);
              return out;
            }
            if (!out.trace) out.trace = "no rows, no captured response; panels: " + panelDiag();
            return out;
          } finally {
            if (window.fetch && window.fetch.__pbpTap === myLease) window.fetch = origFetch;
            if (XMLHttpRequest.prototype.open.__pbpTap === myLease) XMLHttpRequest.prototype.open = origOpen;
            if (XMLHttpRequest.prototype.send.__pbpTap === myLease) XMLHttpRequest.prototype.send = origSend;
            if (window.__pbpTapLease === myLease) delete window.__pbpTapLease;
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
  // Tab-injection mutex. Every transcript grab that installs fetch/XHR taps
  // in the user's YouTube tab (player capture, DOM scrape) runs through this
  // chain: overlapping injections un-hook each other's taps in the finally
  // (non-LIFO restore leaves dead wrapper chains) and fight over the single
  // #movie_player's caption state -- the confirmed root of the "switched ~10
  // times, then everything locked up" device report (2026-08-24; overlapping
  // runs ALL fail and each burns its full budget). Serialized, a superseded
  // caller can also skip its injection entirely via the stillWanted probe.
  const queueTabInjection = pbpVideoMakeInjectQueue();

  async function ytTabPlayerCaptionCapture(tabId, langCode, videoId) {
    let inj = null;
    try {
      inj = await chrome.scripting.executeScript({
        target: { tabId },
        world: "MAIN", // the fetch/XHR taps must live in the page world
        func: async (lang, vid) => {
          // Wrong-tab guard: the tab may have navigated to another video
          // since it was picked as the fetch tab -- driving ITS player would
          // capture another video's captions.
          if (vid && !String(location.href).includes(vid)) return { body: "", trace: "tab no longer on the target video" };
          const player = document.querySelector("#movie_player");
          if (!player || typeof player.setOption !== "function") return { body: "", trace: "no player api" };
          // Cross-page tap lease (audit A3): queueTabInjection serializes
          // taps within ONE preview page, but a duplicated/second preview
          // page runs its own chain -- both would nest fetch/XHR wrappers in
          // this SAME tab and un-hook each other's in finally, leaving a dead
          // wrapper installed for good. A live foreign lease fails this run
          // cleanly; 30s expiry (> the 2x12s capture budget) means a crashed
          // holder can never wedge the tab forever.
          const myLease = { exp: Date.now() + 30000 };
          if (window.__pbpTapLease && window.__pbpTapLease.exp > Date.now()) {
            return { body: "", trace: "another capture holds this tab" };
          }
          window.__pbpTapLease = myLease;
          const origFetch = window.fetch;
          const origOpen = XMLHttpRequest.prototype.open;
          const origSend = XMLHttpRequest.prototype.send;
          // Ownership-checked restore (closing review H3): a throttled
          // background tab can outlive the lease's wall-clock expiry, and an
          // unconditional restore would then rip out a SUCCESSOR run's
          // wrappers. Each wrapper is tagged with its lease; restore only
          // unhooks what still belongs to this run.
          const tagTap = () => {
            try { window.fetch.__pbpTap = myLease; } catch (_) {}
            try { XMLHttpRequest.prototype.open.__pbpTap = myLease; } catch (_) {}
            try { XMLHttpRequest.prototype.send.__pbpTap = myLease; } catch (_) {}
          };
          // EVENT-DRIVEN: the taps resolve this promise the moment the
          // player's timedtext round-trip lands. The old 400ms poll loop
          // throttled to >=1s/tick in a background tab (and to minutes under
          // intensive throttling), so a capture that had already succeeded
          // sat waiting for the next poll -- the bulk of the 2-3s track-switch
          // delay the device reported. Timers now serve only as the failure
          // backstop; the success path needs none.
          let resolveCap = null;
          let captured = "";
          const capReady = new Promise((r) => { resolveCap = r; });
          const gotBody = (t) => { if (!captured && t) { captured = t; resolveCap(t); } };
          // Language-tightened match: the user's own tab traffic (their
          // caption choice in another language) must not satisfy a capture
          // for lang X. No lang requested -> accept any timedtext.
          const wants = (u) => {
            const s = String(u || "");
            if (!/timedtext/.test(s)) return false;
            if (!lang) return true;
            try { return new URL(s, location.href).searchParams.get("lang") === lang; } catch (_) { return true; }
          };
          let prior = null;
          try { prior = player.getOption("captions", "track"); } catch (_) {}
          try {
            window.fetch = function (...a) {
              const p = origFetch.apply(this, a);
              try {
                const u = (a[0] && a[0].url) || a[0];
                if (!captured && wants(u)) {
                  p.then((resp) => resp.clone().text().then(gotBody).catch(() => {})).catch(() => {});
                }
              } catch (_) {}
              return p;
            };
            XMLHttpRequest.prototype.open = function (m, u, ...rest) { this.__pbpUrl = u; return origOpen.call(this, m, u, ...rest); };
            XMLHttpRequest.prototype.send = function (...a) {
              try {
                if (!captured && wants(this.__pbpUrl)) {
                  this.addEventListener("load", () => {
                    try { gotBody(this.responseText); } catch (_) {}
                  });
                }
              } catch (_) {}
              return origSend.apply(this, a);
            };
            tagTap();
            const backstop = (ms) => new Promise((r) => setTimeout(() => r(""), ms));
            const drive = () => {
              try { player.loadModule("captions"); } catch (_) {}
              if (lang) { try { player.setOption("captions", "track", { languageCode: lang }); } catch (_) {} }
            };
            // The deadline clock starts AFTER setOption (drive is synchronous),
            // so throttled timers can only delay the FAILURE exit, never the
            // success (event) path.
            drive();
            await Promise.race([capReady, backstop(12000)]);
            if (!captured) {
              // a track the player already holds re-fetches only after a
              // module bounce
              try { player.unloadModule("captions"); } catch (_) {}
              drive();
              await Promise.race([capReady, backstop(12000)]);
            }
            // Return-time identity recheck (closing review H2): the tab can
            // SPA-navigate to another video DURING the capture window; a body
            // captured after that may belong to the new video.
            if (vid && !String(location.href).includes(vid)) {
              return { body: "", trace: "tab navigated away mid-capture" };
            }
            return { body: captured, trace: captured ? "" : "no timedtext round-trip" };
          } finally {
            if (window.fetch && window.fetch.__pbpTap === myLease) window.fetch = origFetch;
            if (XMLHttpRequest.prototype.open.__pbpTap === myLease) XMLHttpRequest.prototype.open = origOpen;
            if (XMLHttpRequest.prototype.send.__pbpTap === myLease) XMLHttpRequest.prototype.send = origSend;
            // Restore only OUR caption state (audit A4): if the user picked
            // a different track by hand during the capture window, their
            // choice is newer than this run's snapshot -- leave it standing.
            try {
              let cur = null;
              try { cur = player.getOption("captions", "track"); } catch (_) {}
              // Ours ONLY when the track is still exactly the one this run
              // set (closing review M1): an empty state means the user turned
              // captions off mid-capture, and a different-language state
              // means they picked their own -- both are theirs to keep. With
              // no lang requested this run set nothing, so restore freely.
              const ours = !lang || !!(cur && cur.languageCode === lang);
              if (ours) {
                if (prior && prior.languageCode) player.setOption("captions", "track", prior);
                else player.unloadModule("captions");
              }
            } catch (_) {}
            if (window.__pbpTapLease === myLease) delete window.__pbpTapLease;
          }
        },
        args: [langCode || "", videoId || ""],
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

  // Replay the last relay-reported position after a re-render or view
  // return (audit B13 + closing review M5): highlightRowAt's same-index
  // fast path would otherwise swallow the replay -- the index did not
  // change, but the DOM node or the scroll context did.
  function replayHighlight() {
    if (_lastRelayTime == null) return;
    _currentRowIdx = -1; // force the full path (class re-apply + follow scroll)
    try { highlightRowAt(_lastRelayTime); } catch (_) {}
  }

  // Screen-reader mirror for status writes (research T7.4). The visual
  // status bar is deliberately NOT a live region: the AI pass rewrites it
  // once per batch, and polite live-region semantics would read every one
  // of those out ("7 batches = 7 full-sentence announcements"). Milestones
  // route through here instead; per-batch progress stays visual-only via
  // pbvSetStatus's "busy-quiet" kind. Clear-then-write across a task
  // boundary so a repeated identical message still registers as a change.
  let _srStatusEl = null, _srStatusTimer = null;
  // The live region is inserted EMPTY at mount (retro A11Y-1): a region
  // that appears together with its first message is not reliably read.
  function ensureSrRegion() {
    if (_srStatusEl && _srStatusEl.isConnected) return _srStatusEl;
    _srStatusEl = el("span", "pbv-sr-only");
    _srStatusEl.setAttribute("role", "status");
    document.body.appendChild(_srStatusEl);
    return _srStatusEl;
  }
  function srAnnounce(text) {
    if (!text) return;
    ensureSrRegion();
    _srStatusEl.textContent = "";
    if (_srStatusTimer) clearTimeout(_srStatusTimer);
    const val = text;
    _srStatusTimer = setTimeout(() => {
      _srStatusTimer = null;
      if (_srStatusEl) _srStatusEl.textContent = val;
    }, 30);
  }

  // Status writes with a semantic tone (audit U5 / 方案A): the status line
  // is a message bar now. kind true|"error" = persistent error (red
  // stripe); "busy" = ongoing work (stays until the next write);
  // "busy-quiet" = busy visuals without a screen-reader announcement (the
  // per-batch AI progress); anything else = transient info that stands 4s
  // and fades out. A plain textContent write elsewhere still works, it
  // just stays toneless, permanent and unannounced.
  let _statusFadeTimer = null;
  function pbvSetStatus(elx, text, kind) {
    if (!elx) return;
    if (_statusFadeTimer) { clearTimeout(_statusFadeTimer); _statusFadeTimer = null; }
    delete elx.dataset.fading;
    elx.textContent = text;
    if (kind !== "busy-quiet") srAnnounce(text);
    if (kind === true || kind === "error") { elx.dataset.state = "error"; return; }
    if (kind === "busy" || kind === "busy-quiet") { elx.dataset.state = "busy"; return; }
    delete elx.dataset.state;
    if (!text) return;
    _statusFadeTimer = setTimeout(() => {
      elx.dataset.fading = "1";
      _statusFadeTimer = setTimeout(() => {
        delete elx.dataset.fading;
        if (elx.textContent === text) elx.textContent = "";
        _statusFadeTimer = null;
      }, 320);
    }, 4000);
  }

  // 方案A: transient toast over the player for events that describe the
  // PLAYER (the bilibili seek reload), not the caption toolbar. Time-based,
  // never hover-triggered (reading-surface overlay rule).
  let _toastEl = null, _toastTimer = null, _toastTimer2 = null;
  function pbvToast(text) {
    const host = _iframe && _iframe.parentElement;
    if (!host) return;
    if (!_toastEl || !_toastEl.isConnected || _toastEl.parentElement !== host) {
      if (_toastEl) { try { _toastEl.remove(); } catch (_) {} }
      _toastEl = el("div", "pbv-toast");
      _toastEl.setAttribute("role", "status");
      host.appendChild(_toastEl);
    }
    if (_toastTimer) clearTimeout(_toastTimer);
    if (_toastTimer2) clearTimeout(_toastTimer2);
    delete _toastEl.dataset.fading;
    _toastEl.textContent = text;
    _toastTimer = setTimeout(() => {
      if (!_toastEl) return;
      _toastEl.dataset.fading = "1";
      _toastTimer2 = setTimeout(() => { if (_toastEl) { _toastEl.remove(); _toastEl = null; } }, 320);
    }, 2000);
  }

  // play: true (default) = the entry means "play from here" (timeline row,
  // selection bar, cue stepping, loop); false = a pure jump that keeps the
  // player's play/pause state (gutter badge, Ask/skim chips, resume) so it
  // never fights the auto-pause / lookup-pause it may have just triggered
  // (critic #3).
  function seekTo(sec, play) {
    if (!_iframe || !_iframe.contentWindow) return;
    const wantPlay = play !== false;
    if (_isBili) {
      // player.bilibili.com exposes no postMessage seek API; the only
      // working jump is reloading the iframe with its t= start parameter.
      // Announce it (audit U12 / 方案A): as a toast over the player -- it
      // describes the player, not the caption toolbar.
      pbvToast(t("mdVideoSeeking", pbpVideoFmtTime(sec)));
      // Costs a reload flash, buys clickable transcript rows.
      try {
        const u = new URL(_iframe.src);
        u.searchParams.set("t", String(Math.max(0, Math.floor(sec))));
        u.searchParams.set("autoplay", wantPlay ? "1" : "0");
        _iframe.src = u.toString();
        // (research T3.6①) bilibili has no position protocol, but THIS
        // jump's target is exact knowledge -- mark the row so the timeline
        // shows where the player now is instead of nothing at all.
        // Precise for the marker (the t= parameter above is floored): a
        // floored value sits a hair before the row's start and the marker
        // settles on the previous row (batch-F smoke).
        _lastRelayTime = Math.max(0, Number(sec) || 0);
        replayHighlight();
        estAnchor(_lastRelayTime); // re-anchor the estimate clock, if on
        _lastPosSaveAt = 0; savePos(_lastRelayTime); // an explicit jump is worth remembering now
      } catch (_) {}
      return;
    }
    // The relay forwards only these two commands to the nested YouTube
    // iframe (see docs/yt-embed.html) -- the extension speaks the relay's
    // small protocol, not the raw IFrame API, and never posts to "*".
    // Best-effort: if the player isn't ready the message is dropped -- the
    // row click then simply does nothing (degrade, never throw).
    relayPost("seekTo", [sec, true]);
    if (wantPlay || _relayState === 1) relayPost("playVideo");
    markSeek(sec);
  }
  // Seek as a pending transaction (retro #10): mark the target row now (the
  // relay's next tick may still carry the pre-seek position) and, for a
  // short grace, drop ticks that lie BEHIND the target in the seek
  // direction -- a plain distance threshold let a stale 10.3s tick undo a
  // 10.2 -> 11.5 jump. Every seek entry (rows, keys, resume) goes through
  // here so none is left without the grace.
  function markSeek(sec) {
    const from = (_lastRelayTime == null) ? sec : _lastRelayTime;
    _seekDir = sec >= from ? 1 : -1;
    _seekTarget = sec;
    _seekGraceUntil = (typeof performance !== "undefined" ? performance.now() : Date.now()) + 700;
    _autoPauseLatch = -1;
    _lastRelayTime = sec;
    replayHighlight();
  }
  function relayPost(func, args) {
    if (!_iframe || !_iframe.contentWindow || _isBili) return;
    try { _iframe.contentWindow.postMessage({ pbpVideo: 1, func, args: args || [] }, RELAY_ORIGIN); } catch (_) {}
  }
  function relayPause() { relayPost("pauseVideo"); }
  function relayPlay() { relayPost("playVideo"); }
  function relaySetRate(rate) {
    const r = Number(rate);
    if (!(r >= 0.25 && r <= 2)) return;
    relayPost("setPlaybackRate", [r]);
  }
  function togglePlay() { if (_relayState === 1) relayPause(); else relayPlay(); }
  function seekBy(delta) {
    if (_lastRelayTime == null || _isBili) return;
    seekTo(Math.max(0, Math.floor(_lastRelayTime + delta)));
  }
  function stepCue(dir) {
    const idx = pbpVideoCueStep(_rowSegs, _currentRowIdx, _lastRelayTime || 0, dir);
    if (idx >= 0) seekTo(Number(_rowSegs[idx].from) || 0);
  }
  function setLoop(on) {
    _loopOn = !!on;
    if (_loopBtn) _loopBtn.setAttribute("aria-pressed", _loopOn ? "true" : "false");
    if (_loopOn && _currentRowIdx < 0 && _lastRelayTime != null) { try { highlightRowAt(_lastRelayTime); } catch (_) {} }
    srAnnounce(t("mdVideoLoop") + " · " + t(_loopOn ? "mdVideoStateOn" : "mdVideoStateOff"));
  }
  function setAutoPause(on) {
    _autoPauseOn = !!on;
    if (_autoPauseBtn) _autoPauseBtn.setAttribute("aria-pressed", _autoPauseOn ? "true" : "false");
  }
  // "Back to the current cue" (research T3.7): scrolls to where playback
  // is, in whichever study view is showing. No follow re-arm on its own.
  function jumpToCurrent() {
    const list = transcriptListEl();
    if (_studyReadingEl && !_studyReadingEl.hidden) {
      const tv = _lastRelayTime;
      if (tv == null) return;
      let target = null;
      for (const p of _studyReadingEl.querySelectorAll(":scope > p[data-t]")) {
        if (Number(p.dataset.t) <= tv) target = p; else break;
      }
      if (target && typeof pbpScrollIntoView === "function") pbpScrollIntoView(target, { block: "center", behavior: "smooth" });
      return;
    }
    if (_currentRowEl && list) { try { followScrollTo(_currentRowEl, list); } catch (_) {} }
  }
  function toggleStudyView() {
    if (!_studyReadingEl || !_studyListEl) return;
    setStudyView(_studyReadingEl.hidden ? "reading" : "timeline", true);
  }
  // Follow was switched off by scrolling: a visible way back (research
  // T3.7) -- shows only while the current row is off-screen.
  let _backBtnTick = false;
  function updateBackBtn() {
    if (!_backBtn || _backBtnTick) return;
    if (typeof requestAnimationFrame !== "function") { updateBackBtnNow(); return; }
    _backBtnTick = true; // one geometry read per frame, not per relay tick (retro PERF-V6)
    requestAnimationFrame(() => { _backBtnTick = false; updateBackBtnNow(); });
  }
  function updateBackBtnNow() {
    if (!_backBtn) return;
    const list = transcriptListEl();
    let show = !_followOn && !!_currentRowEl && !!list && !list.hidden && _lastRelayTime != null;
    if (show) {
      const r = _currentRowEl.getBoundingClientRect();
      show = r.bottom < 0 || r.top > window.innerHeight;
    }
    if (_backBtn.hidden === show) _backBtn.hidden = !show;
    if (show) {
      const label = t("mdVideoBackToCurrent", pbpVideoFmtTime(_lastRelayTime));
      if (_backBtn.textContent !== label) _backBtn.textContent = label;
    }
  }
  // Saved playback position (research T6.3): throttled to one write per 5s
  // of playback; cleared once the tail is reached so a finished video
  // never offers "continue".
  function savePos(sec) {
    if (!_detectedNow || !_segments.length || typeof sec !== "number" || !isFinite(sec)) return;
    const now = Date.now();
    if (now - _lastPosSaveAt < 5000) return;
    _lastPosSaveAt = now;
    pbpVideoSaveView(_detectedNow, { t: Math.max(0, Math.floor(sec)) });
  }
  function offerResume(sec) {
    if (!_resumeEl) return;
    _resumeEl.textContent = "";
    const label = el("span", "pbv-resume-text", t("mdVideoResumePrompt", pbpVideoFmtTime(sec)));
    const go = el("button", "action-btn pbv-resume-go", t("mdVideoResumeGo"));
    go.type = "button";
    const restart = el("button", "action-btn pbv-resume-restart", t("mdVideoResumeRestart"));
    restart.type = "button";
    go.addEventListener("click", () => {
      _resumeEl.hidden = true;
      if (_isBili) {
        // t= start parameter, no autoplay -- the player reloads paused there.
        try {
          const u = new URL(_iframe.src);
          u.searchParams.set("t", String(Math.max(0, Math.floor(sec))));
          u.searchParams.set("autoplay", "0"); // explicit: the contract is 'never autoplay', not 'player default' (retro)
          _iframe.src = u.toString();
        } catch (_) {}
      } else {
        relayPost("seekTo", [sec, true]); // no playVideo: the reader presses play
      }
      markSeek(sec);
      estAnchor(sec);
    });
    restart.addEventListener("click", () => {
      _resumeEl.hidden = true;
      if (_detectedNow) pbpVideoSaveView(_detectedNow, { t: 0 });
    });
    _resumeEl.appendChild(label);
    _resumeEl.appendChild(go);
    _resumeEl.appendChild(restart);
    _resumeEl.hidden = false;
  }

  // Pause while the reader looks a word up (research T3.5): a non-collapsed
  // selection on a study surface, or an open explain popover, holds the
  // player; the moment both are gone the SAME pause is released. A pause
  // the user made themselves is never released here (flag-gated).
  function lookupActive() {
    const pop = document.getElementById("explain-pop");
    if (pop && pop.matches && pop.matches(":popover-open")) return true;
    const sel = typeof window.getSelection === "function" ? window.getSelection() : null;
    return !!(sel && !sel.isCollapsed && typeof pbpStudyHost === "function" && pbpStudyHost(sel.anchorNode));
  }
  function lookupPauseCheck() {
    if (_isBili || !_segments.length || !document.body.classList.contains("video-mode")) return;
    if (!_videoPrefs.pauseOnLookup) return; // settings: opt-out (research T3.5)
    if (_lookupTimer) clearTimeout(_lookupTimer);
    _lookupTimer = setTimeout(() => {
      _lookupTimer = null;
      const active = lookupActive();
      if (active && _relayState === 1 && !_pausedByLookup) { _pausedByLookup = true; relayPause(); return; }
      if (!active && _pausedByLookup) { _pausedByLookup = false; relayPlay(); }
    }, 150);
  }
  document.addEventListener("selectionchange", lookupPauseCheck);
  document.addEventListener("click", lookupPauseCheck, true);
  document.addEventListener("keyup", (e) => { if (e.key === "Escape") lookupPauseCheck(); }, true);
  // bilibili estimate clock (research T3.6): no position protocol exists,
  // so after each explicit seek a local clock advances the row marker.
  // Opt-in, labelled as an estimate, re-anchored by every row click; any
  // pause or drag inside the player drifts it -- which is why it is off
  // by default and says so.
  function estStop() { if (_estTimer) { clearInterval(_estTimer); _estTimer = null; } }
  function estAnchor(sec) {
    if (!_estOn) return;
    _estAnchor = { sec: Math.max(0, sec), at: (typeof performance !== "undefined" ? performance.now() : Date.now()) };
    estStop();
    _estTimer = setInterval(() => {
      if (!_estOn || !_estAnchor || !_segments.length) { estStop(); return; }
      const now = (typeof performance !== "undefined" ? performance.now() : Date.now());
      const tv = _estAnchor.sec + (now - _estAnchor.at) / 1000;
      const last = _segments[_segments.length - 1];
      if (tv > (last.to || last.from) + 2) { estStop(); return; }
      _lastRelayTime = tv;
      try { highlightRowAt(tv); } catch (_) {}
      updateBackBtn();
      savePos(tv);
    }, 500);
  }
  function setEstimate(on) {
    _estOn = !!on;
    if (_estBtn) _estBtn.setAttribute("aria-pressed", _estOn ? "true" : "false");
    if (_estOn) estAnchor(_lastRelayTime != null ? _lastRelayTime : 0); else estStop();
  }
  // Roving tabindex for the timeline (research T3.4): exactly one time
  // button in the tab order -- the current row's while playback moves and
  // the list is not focused, else the last one the keyboard visited.
  function setRoving(btn) {
    if (!btn || btn === _rovingBtn) return;
    if (_rovingBtn) _rovingBtn.tabIndex = -1;
    _rovingBtn = btn;
    btn.tabIndex = 0;
  }
  // Video shortcut layer (research T3.3): scoped to video pages with a
  // transcript, behind the same typing/modifier gate as the reader's single
  // keys. Space and the arrows defer to focused controls and to the
  // timeline list (whose own arrow keys navigate rows); [ ] r f c b are
  // free in the reader's key map.
  function onVideoKeydown(e) {
    if (!_segments.length || !document.body.classList.contains("video-mode")) return;
    const ae = document.activeElement;
    const tag = ae && ae.tagName;
    const allowed = (typeof pbpTrSingleKeyAllowed === "function")
      ? pbpTrSingleKeyAllowed(e, tag, !!(ae && ae.isContentEditable), document.body.classList.contains("raw-active"))
      : !(e.ctrlKey || e.metaKey || e.altKey || e.shiftKey);
    if (!allowed) return;
    const list = transcriptListEl();
    const inList = !!(list && ae && list.contains(ae));
    const onControl = !!(ae && /^(BUTTON|A|SELECT|INPUT|TEXTAREA|SUMMARY)$/.test(tag || "")) && !inList;
    // Space / arrows take over ONLY where they can do something: the
    // timeline is the visible study view and the relay is reporting
    // (retro KBD-1/V8) -- in the reading view, or before the player has
    // spoken, they stay the browser's scroll keys.
    const playerKeys = !!(list && !list.hidden) && _relayAlive && _lastRelayTime != null && !_isBili;
    let handled = true;
    switch (e.key) {
      case " ": if (onControl || inList || !playerKeys) return; togglePlay(); break;
      case "ArrowLeft": case "ArrowRight": if (onControl || inList || !playerKeys) return; seekBy(e.key === "ArrowLeft" ? -3 : 3); break;
      case "[": case "]": stepCue(e.key === "[" ? -1 : 1); break;
      case "r": case "R": if (_isBili || !_loopBtn || _loopBtn.hidden) return; setLoop(!_loopOn); break;
      case "f": case "F": if (!_followBtn || _followBtn.hidden || _followBtn.disabled) return; setFollow(!_followOn); break;
      case "c": case "C": jumpToCurrent(); break;
      case "b": case "B": toggleStudyView(); break;
      default: handled = false;
    }
    if (handled) e.preventDefault();
  }
  document.addEventListener("keydown", onVideoKeydown);

  // ---- playback-position sync (Task 6) -------------------------------
  // The relay (docs/yt-embed.html) stays silent until we speak: it arms its
  // outbound reporting on the FIRST valid inbound message and replies only to
  // that message's origin. "hello" is that opener. startRelayHello is wired
  // to the iframe's load event (never called on an unloaded frame -- those
  // posts hit the frame's initial extension-origin document and each one
  // logs a target-origin error); the relay registers its listener in its
  // first synchronous script, so by load it can hear us, and the repeating
  // greeting only covers a slow ANSWER (10s of silence: no relay, no
  // protocol, no harm).
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
    if (typeof d.state === "number") _relayState = d.state;
    if (typeof d.t !== "number" || !isFinite(d.t)) return;
    // Stale tick right after an explicit seek (see seekTo): drop it.
    const nowMs = (typeof performance !== "undefined" ? performance.now() : Date.now());
    if (nowMs < _seekGraceUntil && _seekTarget != null) {
      if (_seekDir > 0 && d.t < _seekTarget - 0.5) return; // stale, behind a forward seek
      if (_seekDir < 0 && d.t > _seekTarget + 0.5) return; // stale, ahead of a backward seek
      _seekGraceUntil = 0; // first confirming tick closes the transaction
    }
    const cur = (_currentRowIdx >= 0) ? _rowSegs[_currentRowIdx] : null;
    const curEnd = cur ? ((typeof cur.to === "number" && cur.to > cur.from) ? cur.to : cur.from + 2) : 0;
    // Cue loop (research T3.2): hold inside the current cue -- pure reader
    // logic on the relay's 250ms reports, no new relay verb needed.
    if (_loopOn && cur && d.t >= curEnd - 0.05) { seekTo(cur.from); return; }
    // Auto-pause at cue END (research T3.2, retro #1): judged on the cue's
    // own end time with a one-shot latch per row, so a gap before the next
    // cue or the very last cue still pauses; the latch resets on seeks
    // and row changes.
    if (_autoPauseOn && cur && _relayState === 1 && _autoPauseLatch !== _currentRowIdx && d.t >= curEnd - 0.25) {
      _autoPauseLatch = _currentRowIdx;
      relayPause();
    }
    _lastRelayTime = d.t; // replayed after re-renders (audit B13)
    const prevIdx = _currentRowIdx;
    highlightRowAt(d.t);
    if (_currentRowIdx !== prevIdx) _autoPauseLatch = -1;
    updateBackBtn();
    if (_relayState === 1) savePos(d.t); // research T6.3
    // Finished (YT.PlayerState.ENDED = 0): the continue-watching record is
    // cleared HERE, on the player's own word, never from the caption tail
    // (retro #9: credits and silent stretches run past the last cue).
    if (_relayState === 0 && !_endedCleared && _detectedNow) { _endedCleared = true; pbpVideoSaveView(_detectedNow, { t: 0 }); }
    if (_relayState === 1) _endedCleared = false;
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
    const idx = pbpVideoRowIndexAt(_rowSegs, t);
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
    if (!list.contains(document.activeElement)) setRoving(_currentRowEl.querySelector(":scope > .pbv-time"));
    // Follow only when the timeline is the visible study view: scrolling a
    // hidden list is pointless, and in video-mode the list shares the page
    // scroller with the article -- following while the user reads would drag
    // the article out from under them.
    // The narrow stacked layout has no sticky player to stay level with --
    // follow-scrolling there just drags the page from under the reader
    // (audit B14; the class is set by the layout observer on the button).
    const narrow = _followBtn && _followBtn.classList.contains("pbv-follow-narrow");
    if (_followOn && !narrow && !list.hidden && playerHoldsPosition()) {
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

  function setFollow(on, auto) {
    const was = _followOn;
    _followOn = !!on;
    if (_followBtn) _followBtn.setAttribute("aria-pressed", _followOn ? "true" : "false");
    // Re-enabling follow on a PAUSED player: no new time event will come to
    // re-anchor the highlight, so replay the last reported position (B13).
    if (_followOn) replayHighlight();
    // Scroll/touch/keys switched it off silently before (research T3.7):
    // say so once, transiently, and let the back-to-current button appear.
    if (was && !_followOn && auto && _statusElRef) pbvSetStatus(_statusElRef, t("mdVideoFollowPaused"), false);
    updateBackBtn();
  }

  // Any scroll/seek intent inside the list means the user took the wheel;
  // auto-scrolling on top of that is the classic fight-the-user bug. Follow
  // stays off until they press the toggle again -- named handlers so a second
  // runLoad on the same list re-registers nothing.
  function onListWheel() { if (_followOn) setFollow(false, true); }
  function onListTouch() { if (_followOn) setFollow(false, true); }
  const FOLLOW_PAUSE_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "PageUp", "PageDown", "Home", "End"]);
  function onListKeydown(e) {
    if (_followOn && FOLLOW_PAUSE_KEYS.has(e.key)) setFollow(false, true);
    // Roving navigation (research T3.4): Up/Down/Home/End move between the
    // rows' time buttons; Enter/Space are the button's own activation.
    if (!/^(ArrowUp|ArrowDown|Home|End)$/.test(e.key)) return;
    const list = e.currentTarget;
    // Structural walk, O(1) per key (critic #4): a full querySelectorAll
    // per repeat would also defeat content-visibility on thousands of rows.
    const seekableRow = (r, dir) => { while (r && r.classList.contains("pbv-row--static")) r = dir < 0 ? r.previousElementSibling : r.nextElementSibling; return r; };
    const ae = document.activeElement;
    const curRow = ae && ae.closest ? ae.closest(".pbv-row") : null;
    let row = null;
    if (e.key === "Home") row = seekableRow(list.firstElementChild, 1);
    else if (e.key === "End") row = seekableRow(list.lastElementChild, -1);
    else if (!curRow || curRow.parentElement !== list) row = seekableRow(e.key === "ArrowDown" ? list.firstElementChild : list.lastElementChild, e.key === "ArrowDown" ? 1 : -1);
    else row = seekableRow(e.key === "ArrowDown" ? curRow.nextElementSibling : curRow.previousElementSibling, e.key === "ArrowDown" ? 1 : -1) || curRow;
    const btn = row ? row.querySelector(":scope > .pbv-time") : null;
    if (!btn) return;
    e.preventDefault();
    setRoving(btn);
    try { btn.focus({ preventScroll: false }); } catch (_) {}
  }

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
      // Precise (ms), not floored: a delegated click seeks HERE and marks
      // THIS row -- a floored value lands a hair before the row's start and
      // the marker settles on the previous row (batch-F smoke). Deep links
      // floor on their own.
      row.dataset.from = String(Math.max(0, Math.round((Number(seg.from) || 0) * 1000) / 1000)); // node->time bridge (T1.3/T2.2)
      time.tabIndex = -1; // roving: setRoving() promotes exactly one (T3.4)
      const label = t("mdVideoSeekTo", pbpVideoFmtTime(seg.from));
      time.title = label;
      time.setAttribute("aria-label", label);
      // Clicks are delegated to the list (research T7.10): one listener
      // instead of two closures per row -- the time button and the row
      // itself both seek to data-from (selection-ending clicks excepted,
      // see onListClick). Keyboard access stays on the time button.
      if (_density === "paragraph") row.classList.add("pbv-row--para");
    } else {
      time.tabIndex = -1;
    }
    row.setAttribute("role", "listitem");
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
    // Density (research T7.10): cue rows as delivered, or one row per
    // reading paragraph. _rowSegs is what every row-indexed consumer
    // (current-row marker, loop, cue stepping) reads from now on.
    const rows = (_density === "paragraph") ? pbpVideoParagraphRows(segments, _aiPunctParas) : segments;
    _rowSegs = rows;
    const BATCH = 200;
    const total = rows.length;
    let i = 0;
    function appendBatch(count) {
      const frag = document.createDocumentFragment();
      const end = Math.min(i + count, total);
      for (; i < end; i++) { const r = renderVideoRow(rows[i], seekable); r.dataset.i = String(i); frag.appendChild(r); }
      listEl.appendChild(frag);
    }
    appendBatch(BATCH); // first batch: same tick as the call, inherently safe
    _rovingBtn = null;
    setRoving(listEl.querySelector(".pbv-row:not(.pbv-row--static) > .pbv-time"));
    if (i >= total) { scheduleProjectTranslations(); return; }
    if (typeof requestAnimationFrame === "undefined") {
      appendBatch(total - i);
      scheduleProjectTranslations();
      return;
    }
    const step = () => {
      if (epoch !== _renderEpoch) return; // superseded by a newer render -- stop
      appendBatch(BATCH);
      if (i < total && epoch === _renderEpoch) requestAnimationFrame(step);
      else scheduleProjectTranslations();
    };
    requestAnimationFrame(step);
  }

  // Delegated row clicks (research T7.10): the time button and the row both
  // seek to data-from; a click that ends a text selection does not (the
  // selectable-text contract and the seek contract share the row).
  function onListClick(ev) {
    const target = ev.target;
    const row = target && target.closest ? target.closest(".pbv-row") : null;
    if (!row || row.classList.contains("pbv-row--static") || row.dataset.from == null) return;
    if (!target.closest(".pbv-time")) {
      if (target.closest("button, a, select")) return;
      const sel = typeof window.getSelection === "function" ? window.getSelection() : null;
      if (sel && !sel.isCollapsed) return;
    }
    seekTo(Number(row.dataset.from) || 0);
  }
  function bindRowClicks(list) {
    if (!list || list._pbpRowClicksWired) return;
    list._pbpRowClicksWired = true;
    list.addEventListener("click", onListClick);
  }

  // Density switch (research T7.10): re-renders the timeline from the same
  // segments; per-video memory rides pbp_video_view like the view choice.
  function setDensity(mode, persist) {
    _density = mode === "paragraph" ? "paragraph" : "cue";
    if (_loopOn) setLoop(false); // the loop unit changes with the density -- never silently (retro #2)
    syncDensityBtn();
    const list = transcriptListEl();
    if (list && _segments.length) { renderTranscript(list, _segments, true); replayHighlight(); }
    if (persist && _detectedNow) pbpVideoSaveView(_detectedNow, { density: _density });
  }
  function syncDensityBtn() {
    if (_densityBtn) _densityBtn.setAttribute("aria-pressed", _density === "paragraph" ? "true" : "false");
  }

  // Translation projection (research T5.1): the article's per-paragraph
  // translations (.pb-tr siblings md-translate fills) are mirrored onto
  // the timeline -- onto the row that starts each paragraph -- WITHOUT a
  // second AI request. Driven by a mutation observer on the article and
  // re-run after every timeline render; the v-key body classes decide
  // visibility in CSS. Rows carrying an auxiliary track keep theirs.
  function scheduleProjectTranslations() {
    if (_trProjTimer) clearTimeout(_trProjTimer);
    _trProjTimer = setTimeout(() => {
      _trProjTimer = null;
      // Aux lines only need re-applying after a timeline re-render (no row
      // carries the mark yet); article translation traffic never rebuilds
      // them (retro #11).
      try { if (_auxSegs) { const list = transcriptListEl(); if (list && !list.querySelector(".pbv-row--aux")) applyAux(); } } catch (_) {}
      try { projectTranslations(); } catch (_) {}
    }, 300);
  }
  // Auxiliary track (research T5.2): options = every track except the
  // primary; the previous choice survives a rebuild when still offered.
  function fillAuxOptions(tracks, isBiliProv) {
    if (!_auxSel) return;
    const prevVal = _auxSel.value;
    _auxSel.textContent = "";
    const none = document.createElement("option");
    none.value = "";
    none.textContent = t("mdVideoAuxNone");
    _auxSel.appendChild(none);
    let n = 0;
    (tracks || []).forEach((tr, i) => {
      const value = _trackValues[i];
      if (!value || value === _selectedTrackKey) return;
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = ((isBiliProv ? (tr.lan_doc || tr.label) : tr.label) || "")
        + ((!isBiliProv && tr.asr) ? " (" + t("mdVideoAsr") + ")" : "");
      _auxSel.appendChild(opt);
      n++;
    });
    _auxSel.hidden = n === 0;
    const keep = prevVal && Array.from(_auxSel.options).some((o) => o.value === prevVal);
    _auxSel.value = keep ? prevVal : "";
    if (!keep && _auxSegs) { _auxSegs = null; applyAux(); }
  }
  function applyAux() {
    const list = transcriptListEl();
    if (!list) return;
    const rows = list.children;
    if (!_auxSegs) {
      for (const r of rows) {
        if (r.dataset.aux !== "1") continue;
        delete r.dataset.aux;
        r.classList.remove("pbv-row--aux");
        const old = r.querySelector(":scope > .pbv-tr");
        if (old) old.remove();
      }
      scheduleProjectTranslations();
      return;
    }
    const paired = pbpVideoPairByTime(_rowSegs, _auxSegs);
    for (let i = 0; i < rows.length && i < paired.length; i++) {
      const r = rows[i];
      if (!paired[i]) {
        if (r.dataset.aux === "1") { delete r.dataset.aux; clearRowLine(r, "pbv-row--aux"); }
        continue;
      }
      r.classList.remove("pbv-row--tr");
      setRowLine(r, "pbv-row--aux", paired[i], "");
      r.dataset.aux = "1";
    }
  }
  // Incremental (retro #11): a streaming translation fires this many times;
  // only rows whose projected text actually changed are touched, so live
  // selections and Ranges elsewhere survive, and nothing is torn down to
  // be rebuilt identical.
  function setRowLine(row, cls, text, lang) {
    let tr = row.querySelector(":scope > .pbv-tr");
    if (!tr) { tr = el("span", "pbv-tr", text); row.appendChild(tr); }
    else if (tr.textContent !== text) tr.textContent = text;
    if (lang) { if (tr.getAttribute("lang") !== lang) tr.setAttribute("lang", lang); }
    else if (tr.hasAttribute("lang")) tr.removeAttribute("lang");
    row.classList.add(cls);
  }
  function clearRowLine(row, cls) {
    const tr = row.querySelector(":scope > .pbv-tr");
    if (tr) tr.remove();
    row.classList.remove(cls);
  }
  function projectTranslations() {
    const list = transcriptListEl();
    const view = document.getElementById("rendered-view");
    if (!list || !view || !_rowSegs.length) return;
    const rows = list.children;
    const want = new Map(); // row index -> { text, lang }
    const ps = view.querySelectorAll(":scope > p[data-t]");
    if (ps.length) {
      const starts = Array.from(ps, (p) => Number(p.dataset.t));
      ps.forEach((p, i) => {
        const sib = p.nextElementSibling;
        if (!sib || !sib.classList || !sib.classList.contains("pb-tr")) return;
        const text = String(sib.textContent || "").trim();
        if (!text) return;
        const ri = pbpVideoRowForParagraph(_rowSegs, starts[i], i + 1 < starts.length ? starts[i + 1] : null);
        if (ri >= 0 && !want.has(ri)) want.set(ri, { text, lang: sib.getAttribute("lang") || sib.dataset.pbTrLang || "" });
      });
    }
    // Touch only rows that are, or should be, projected (retro PERF-V2).
    for (const r of list.querySelectorAll(":scope > .pbv-row--tr")) {
      if (!want.has(Number(r.dataset.i))) clearRowLine(r, "pbv-row--tr");
    }
    for (const [i, w] of want) {
      const r = rows[i];
      if (!r || r.dataset.aux === "1") continue; // companion track owns this row's line
      setRowLine(r, "pbv-row--tr", w.text, w.lang);
    }
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
  // Settings half of the pick hints (retro #12): loaded once, BEFORE any
  // fetch that picks a default track -- the extraction-error shell calls
  // prepareVideoSession ahead of loadFlow, which used to leave the hints
  // at their empty defaults for that path. The per-video record (owner-
  // keyed) still belongs to loadFlow.
  let _videoPrefsLoaded = false;
  async function ensureVideoPrefs() {
    if (_videoPrefsLoaded) return;
    try {
      const s = await pbpReadSettingsWithSecrets({
        mdVideoLangPref: SETTINGS_DEFAULTS.mdVideoLangPref, mdVideoPauseOnLookup: SETTINGS_DEFAULTS.mdVideoPauseOnLookup
      });
      _videoPrefs = { langPrefs: pbpVideoLangPrefs(s && s.mdVideoLangPref), pauseOnLookup: !(s && s.mdVideoPauseOnLookup === false) };
    } catch (_) { _videoPrefs = { langPrefs: [], pauseOnLookup: true }; }
    PBP_VIDEO_PICK_HINTS.prefs = _videoPrefs.langPrefs;
    _videoPrefsLoaded = true;
  }
  async function prepareVideoSession(ctx) {
    const detected = pbpVideoDetect(ctx && ctx.pageUrl);
    if (!detected) {
      const session = { detected: null, granted: false };
      window.pbpVideoSession = session;
      return session;
    }
    await ensureVideoPrefs();
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
          ? (pbpYtPickTrack(res.tracks, uiLang, PBP_VIDEO_PICK_HINTS.prefs, PBP_VIDEO_PICK_HINTS.preferKey) || res.tracks[0]) : null;
        const rTracks = pbpYtRescueTracks(res.tracks);
        // Success-tier memory (device round 3, plan 丙-乙): remember which
        // rescue tier fed this site last time and RUN IT FIRST next time --
        // reordering, never removing, so a stale memory only costs the old
        // ordering's latency, never coverage. 7-day TTL: YouTube's walls move.
        let cachedVia = null;
        try {
          const rec = (await chrome.storage.local.get("pbp_video_tier_youtube")).pbp_video_tier_youtube;
          if (rec && rec.via && Date.now() - (rec.ts || 0) < 7 * 24 * 3600 * 1000) cachedVia = rec.via;
        } catch (_) {}
        const tryPanel = async () => {
          if (!res.error) return;
          const fbParams = pbpYtTranscriptParams(detected.videoId,
            rTrack ? rTrack.lang : (String(uiLang || "en").split("-")[0]), !!(rTrack && rTrack.asr));
          const segs = await ytTabPanelTranscript(fetchTabId, detected.videoId, uiLang, fbParams);
          console.info("[pbp-video] panel rescue:", segs ? segs.length + " segments" : "failed");
          // rTrack is accurate here: the hand-built params requested exactly it
          if (segs && segs.length) res = { tracks: rTracks, track: rTrack, segments: segs, via: "panel" };
        };
        // Player-capture tier: drive the page player's own caption machinery
        // and take the signed timedtext round-trip it makes. Better data than
        // the DOM tier (real from/to timings, no panel scrape).
        const tryCapture = async () => {
          if (!res.error) return;
          const capSegs = await queueTabInjection(
            () => ytTabPlayerCaptionCapture(fetchTabId, rTrack ? rTrack.lang : null, detected.videoId));
          console.info("[pbp-video] player capture rescue:", capSegs ? capSegs.length + " segments" : "failed");
          if (capSegs && capSegs.length) res = { tracks: rTracks, track: rTrack, segments: capSegs, via: "capture" };
        };
        // DOM tier: read what YouTube's own UI renders. track:null is honest
        // here: the scrape returns whatever language the page panel happens
        // to show, so no picker entry gets marked selected (loadFlow renders
        // a neutral placeholder instead).
        const tryDom = async () => {
          if (!res.error) return;
          const domSegs = await queueTabInjection(() => ytTabDomTranscript(fetchTabId, detected.videoId));
          console.info("[pbp-video] dom rescue:", domSegs ? domSegs.length + " segments" : "failed");
          if (domSegs && domSegs.length) res = { tracks: rTracks, track: null, segments: domSegs, via: "dom" };
        };
        const tierByName = { panel: tryPanel, capture: tryCapture, dom: tryDom };
        for (const name of pbpVideoTierOrder(cachedVia)) await tierByName[name]();
        if (res.via) {
          try { await chrome.storage.local.set({ pbp_video_tier_youtube: { via: res.via, ts: Date.now() } }); } catch (_) {}
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
      captionsVia: res.via, // set only by the rescue tiers: timedtext is PROVEN dead for this session
    };
    window.pbpVideoSession = session;
    return session;
  }

  // ---- Control freeze: per-control hold COUNTS, not a boolean ----
  // The two transcript transactions overlap by design: a track switch keeps
  // the picker live through its FETCH so last-selection-wins works, while the
  // AI pass must be frozen out for that whole switch. A single boolean let
  // whichever transaction finished first unfreeze the OTHER one's controls
  // mid-flight -- that is what allowed a paid AI pass to be started against
  // the outgoing transcript and then committed under the incoming track's
  // heading (review F1). Counting holds means a release only ever gives back
  // what its own holder took.
  //
  // The committer's serial lock is not a substitute: a lock can only REFUSE a
  // second commit, and by then the caller has already asked it to persist the
  // wrong text. Freezing is what stops the ask.
  let _freezeTrack = 0, _freezeAi = 0;
  function applyControlFreeze() {
    if (_trackSelEl) _trackSelEl.disabled = _freezeTrack > 0;
    if (_aiBtnEl) _aiBtnEl.disabled = _freezeAi > 0 || _aiPassDone;
  }
  // Returns an idempotent release. Idempotent because the AI pass releases
  // from a `finally` that can be reached twice-over on some paths, and a
  // double release would hand the controls back while another transaction
  // still holds them.
  function freezeControls(what) {
    const track = !!(what && what.track), ai = !!(what && what.ai);
    if (track) _freezeTrack++;
    if (ai) _freezeAi++;
    applyControlFreeze();
    let released = false;
    return function release() {
      if (released) return;
      released = true;
      if (track) _freezeTrack--;
      if (ai) _freezeAi--;
      applyControlFreeze();
    };
  }

  // Picker option values, one per track, index-aligned with the list.
  //
  // pbpVideoTrackKey is deliberately NOT injective over a real track list: two
  // YouTube manual tracks can share languageCode ("English" and "English
  // (CC)"), and two bilibili entries can share lan. Two <option>s with the
  // same value collapse -- the second becomes unselectable and clicking it
  // silently switches to the first (review F4). So the Nth track carrying an
  // already-seen key gets "#N" appended, purely to keep the DOM values
  // distinct.
  //
  // pbpVideoStateBuild applies this same suffix pass to its persisted
  // descriptors (audit B12), so an F5 CAN now address the second duplicate:
  // the hydrated descriptor keys and these picker values agree by
  // construction (same list order, same algorithm).
  function buildTrackValues(tracks, provider) {
    const seen = new Map();
    return (tracks || []).map((tr) => {
      const key = pbpVideoTrackKey(tr, provider);
      if (!key) return ""; // keyless -> unaddressable; the option is disabled
      const n = (seen.get(key) || 0) + 1;
      seen.set(key, n);
      return n === 1 ? key : key + "#" + n;
    });
  }

  // Everything a commit can change about "which transcript this page shows",
  // captured in one object so a REFUSED commit can put all of it back. The
  // article did not change, so neither may the timeline, the picker, the Copy
  // text, or the cached session a later loadFlow() reads -- restoring only the
  // visible half is exactly how a rollback leaves the session lying to the
  // next mount.
  function captureTranscriptState() {
    const sess = window.pbpVideoSession || null;
    return {
      segments: _segments, paras: _aiPunctParas, trackLabel: _meta.trackLabel,
      trackKey: _selectedTrackKey, wasUnpunct: _wasUnpunct, sess,
      sessTrack: sess ? sess.track : null,
      sessSegments: sess ? sess.segments : null,
      sessParagraphs: sess ? sess.paragraphs : undefined,
      sessWasUnpunct: sess ? sess.wasUnpunct : false,
      sessError: sess ? sess.error : undefined
    };
  }
  function restoreTranscriptState(snap) {
    _segments = snap.segments;
    _aiPunctParas = snap.paras;
    _meta.trackLabel = snap.trackLabel;
    _selectedTrackKey = snap.trackKey;
    _wasUnpunct = snap.wasUnpunct;
    if (_trackSelEl) _trackSelEl.value = snap.trackKey;
    if (snap.sess) {
      snap.sess.track = snap.sessTrack;
      snap.sess.segments = snap.sessSegments;
      snap.sess.paragraphs = snap.sessParagraphs;
      snap.sess.wasUnpunct = snap.sessWasUnpunct;
      snap.sess.error = snap.sessError;
    }
    // The words on screen just changed again, so anything still running
    // against the ones it replaced is stale -- same fence as an adoption.
    _transcriptEpoch++;
    if (_listEl) renderTranscript(_listEl, _segments, true);
  }

  // The cached session has to describe the transcript the PANEL shows, or the
  // next loadFlow() cache hit (a re-mount, an F5 hydration) redraws it from a
  // track the reader is not looking at. Called whenever the panel settles on a
  // transcript it is going to keep -- after a persisted commit, and on the
  // no-commit branch where the transcript is not this page's article at all
  // and there is nothing to persist.
  function syncSessionToCommitted(track, wasUnpunct) {
    const sess = window.pbpVideoSession;
    if (!sess) return;
    sess.track = track;
    sess.segments = _segments;
    sess.paragraphs = _aiPunctParas;
    sess.wasUnpunct = !!wasUnpunct;
    // A capture error from the ORIGINAL fetch would make the re-mount report
    // "no subtitles" over a timeline full of them.
    sess.error = undefined;
  }

  // Re-read the provider's live track directory WITHOUT surrendering the
  // panel's own session. An F5-hydrated session (md-preview.js's committed
  // bootstrap) carries safe track descriptors and no endpoints at all --
  // baseUrl/subtitle_url are signed and expire, so the persistence format
  // deliberately drops them (spec 「F5 持久化协议」) -- and the only way back to a
  // fetchable URL is to ask the provider again.
  //
  // Called ONLY from a real switch attempt that found no endpoint, never
  // eagerly: an F5 that just reads the restored transcript must not re-enter
  // the network at all, which is the entire point of hydrating.
  //
  // prepareVideoSession PUBLISHES its result (window.pbpVideoSession = ...).
  // Letting that stand would (a) drop the transcript the panel is showing in
  // favour of whatever default track the fresh capture picked -- a failed
  // switch would then silently leave the next mount on the wrong track -- and
  // (b) detach the object a refused commit rolls back into
  // (captureTranscriptState holds a reference, not the global). So the
  // panel's session is put back and only the live directory is taken from the
  // fresh one.
  // ONE capture at a time, shared by every switch that asks while it runs
  // (review F7). The picker deliberately stays live during a switch (that is
  // what makes last-selection-wins possible), so two rapid selections on a
  // hydrated session would otherwise each start a full prepareVideoSession --
  // and on YouTube each can drive ytTabPlayerCaptionCapture against the user's
  // OPEN watch tab, toggling its captions twice. Correctness never depended on
  // this (both restore the same session and the loser bails on its seq check);
  // the duplicate is a visible side effect on a page the user is looking at.
  // The result is read-only data, so sharing it is safe.
  let _dirRefreshInFlight = null;
  function refreshTrackDirectory() {
    if (_dirRefreshInFlight) return _dirRefreshInFlight;
    _dirRefreshInFlight = (async () => {
      const keep = window.pbpVideoSession;
      try {
        return await prepareVideoSession({ pageUrl: (_meta && _meta.url) || "", tabId: _ctxTabId });
      } catch (e) {
        console.warn("[pbp-video] track directory refresh failed:", (e && e.name) || "", (e && e.message) || e);
        return null;
      } finally {
        if (keep) window.pbpVideoSession = keep;
        _dirRefreshInFlight = null;
      }
    })();
    return _dirRefreshInFlight;
  }

  async function loadFlow(detected, statusEl, bodyEl, trackSel, copyBtn, aiBtn) {
    // Per-video memory + preferences BEFORE any fetch picks a track
    // (research T6.1/T6.2/T6.3): the remembered track key and the ordered
    // language preference steer the default pick; the saved position feeds
    // the continue-watching offer once the transcript is up.
    await ensureVideoPrefs();
    try { _savedRec = await pbpVideoSavedRecord(detected); } catch (_) { _savedRec = null; }
    _density = (_savedRec && _savedRec.density === "paragraph") ? "paragraph" : "cue";
    syncDensityBtn();
    PBP_VIDEO_PICK_HINTS.prefs = _videoPrefs.langPrefs;
    PBP_VIDEO_PICK_HINTS.preferKey = (_savedRec && typeof _savedRec.trackKey === "string") ? _savedRec.trackKey : "";
    pbvSetStatus(statusEl, t("mdVideoLoading"), "busy");
    // Bind the transaction's control surface before the first await: every
    // path below (and the AI pass mounted alongside it) freezes and restores
    // through these.
    _trackSelEl = trackSel;
    _aiBtnEl = aiBtn || null;
    _listEl = bodyEl;
    _statusEl = statusEl;
    const isBili = detected.provider === "bilibili";
    const cached = window.pbpVideoSession;
    const session = (cached && pbpVideoSessionMatches(cached, detected) && cached.segments && cached.segments.length)
      ? cached
      : await prepareVideoSession({ pageUrl: (_meta && _meta.url) || "", tabId: _ctxTabId });
    if (!session.granted) { pbvSetStatus(statusEl, t("mdVideoPermMissing"), true); return; }
    _ytFetchFn = session.ytFetchFn || null;
    _ytFetchTabId = (typeof session.ytFetchTabId === "number") ? session.ytFetchTabId : null;
    // `let`: a hydrated session has no fetch handles at all (they are
    // functions and tab ids, not persistable data), so a later track switch
    // re-reads the directory and adopts that capture's handles instead.
    let useLogin = session.useLogin;
    const ytHadTab = session.ytHadTab;
    const res = { tracks: session.tracks, track: session.track, segments: session.segments, error: session.error };
    if (res.error === "player" || res.error === "view") { pbvSetStatus(statusEl, t("mdVideoFailed"), true); return; }
    if (res.error === "login") { pbvSetStatus(statusEl, t("mdVideoBiliLogin"), true); return; }
    // YouTube answered, but about us rather than about the video: the request
    // was gated (bot check / age wall / unplayable). Saying "no subtitles"
    // here would be a lie, and would point the user at the wrong problem. When
    // no YouTube tab was open to fetch through, say what actually helps.
    if (res.error === "blocked") {
      pbvSetStatus(statusEl, t("mdVideoBlocked") + (ytHadTab ? "" : " " + t("mdVideoOpenTabHint")), true);
      return;
    }
    if (res.error === "no-tracks" || res.error === "caption-body") {
      // "no subtitles" would be a lie when the track list is sitting right
      // there -- caption-body means the TEXT was withheld (PO-Token-gated
      // timedtext), and switching tracks re-fetches through the picker.
      pbvSetStatus(statusEl, t(res.error === "caption-body" && res.tracks ? "mdVideoBodyBlocked" : "mdVideoNoTracks"), true);
      if (!res.tracks) return;
    }
    if (!res.error) pbvSetStatus(statusEl, "", false);
    // track picker
    trackSel.textContent = "";
    // Option values are STABLE KEYS, never endpoints: baseUrl/subtitle_url are
    // signed and expire, and an F5-hydrated session carries no endpoints at
    // all. The change handler maps a value back to whatever endpoint the
    // session currently holds (spec: F5 持久化协议).
    _trackValues = buildTrackValues(res.tracks || [], detected.provider);
    // Which option is the session's own track? By list IDENTITY first, so a
    // duplicate-key pair still selects the right one; the rescue tiers rebuild
    // their track objects (pbpYtRescueTracks), so fall back to the key.
    let selIdx = res.track ? (res.tracks || []).indexOf(res.track) : -1;
    if (selIdx < 0 && res.track) {
      const k0 = pbpVideoTrackKey(res.track, detected.provider);
      selIdx = k0 ? (res.tracks || []).findIndex((tr) => pbpVideoTrackKey(tr, detected.provider) === k0) : -1;
    }
    (res.tracks || []).forEach((tr, i) => {
      const opt = document.createElement("option");
      const value = _trackValues[i];
      // A hydrated session's tracks are safe descriptors: bilibili's lan_doc
      // lives under `label` there, so read that as the fallback rather than
      // painting "undefined" into the picker.
      const label = (isBili ? (tr.lan_doc || tr.label) : tr.label) || "";
      // The "(auto-generated)" suffix is YOUTUBE-only, deliberately: a live
      // bilibili track is the raw API object and carries no `asr` property at
      // all, while a hydrated descriptor carries `asr: _pbpBiliIsAi(track)` --
      // so reading tr.asr for both would make the same track read "中文(AI)"
      // before a reload and "中文(AI) (auto-generated)" after it (review F4).
      // bilibili already marks those tracks in lan_doc, which IS this label.
      const asrSuffix = (!isBili && tr.asr) ? " (" + t("mdVideoAsr") + ")" : "";
      opt.value = value;
      opt.textContent = label + asrSuffix;
      // A track this provider cannot give a stable key (no lang / no lan / no
      // id) is a track the runtime cannot address by key, cannot persist, and
      // cannot restore. Show it -- the list should stay honest about what the
      // video has -- but do not offer a selection that would silently no-op.
      opt.disabled = !value;
      if (value && i === selIdx) opt.selected = true;
      trackSel.appendChild(opt);
    });
    _selectedTrackKey = (selIdx >= 0 && _trackValues[selIdx]) || "";
    fillAuxOptions(res.tracks || [], isBili); // research T5.2
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
    // (Picker unhide moved below the change-listener registration -- audit
    // B11: unhidden here, a selection made during the settings await below
    // was swallowed because no handler existed yet.)
    // punctuation enhancement already applied by prepareVideoSession; the AI
    // button only appears for tracks the detector judged unpunctuated.
    //
    // A cached/hydrated session can carry the AI-punctuation paragraphs the
    // article was committed with (videoState.paragraphs, restored into the
    // session by the F5 hydration). Zeroing this unconditionally -- what this
    // line used to do -- silently downgraded Copy Markdown and every later
    // commit back to the heuristic paragraph merge, on an article that
    // visibly carries the paid pass. A session WITHOUT the field (every
    // non-hydrated one) still lands on exactly the old value, null.
    _aiPunctParas = (Array.isArray(session.paragraphs) && session.paragraphs.length)
      ? session.paragraphs.slice() : null;
    _wasUnpunct = !!session.wasUnpunct;
    // Settled ONCE per mount and captured: the AI offer is recomputed after
    // every track switch and after every commit, and an await inside those
    // paths would race the transaction it follows.
    let aiOk = false;
    if (aiBtn) {
      try {
        const sa = typeof pbpAiGetSettings === "function" ? await pbpAiGetSettings() : null;
        aiOk = !!(sa && typeof pbpAiAvailable === "function" && pbpAiAvailable(sa));
        _aiSettingsSnap = sa;
        // Settle the provider's origin patterns and the contains() answer
        // NOW (audit B10): the AI click can then make permissions.request
        // its first await, inside the gesture's transient activation.
        if (aiOk && typeof _aiRequiredOriginPatterns === "function") {
          try { _aiOrigins = _aiRequiredOriginPatterns(sa); } catch (_) { _aiOrigins = null; }
          let g = false;
          try {
            g = (_aiOrigins && _aiOrigins.length)
              ? await chrome.permissions.contains({ origins: _aiOrigins }) === true : false;
          } catch (_) {}
          _aiHostGranted = g;
        }
      } catch (_) {}
    }
    // No re-offer only after an AI pass actually committed (videoAiPunct rode
    // the payload): a committed page whose article is still the heuristic tier
    // -- first-run promotion, or a track switch after an AI pass -- must keep
    // the button, or the AI upgrade dead-ends forever on every committed page
    // (device report 2026-08-23). Re-read per call, because a track-switch
    // commit is exactly what flips that flag back to false.
    function refreshAiOffer() {
      if (!aiBtn) return;
      const committedAi = !!(window.pbpVideoDoc && window.pbpVideoDoc.committed && window.pbpVideoDoc.aiPunct);
      const show = !!(_wasUnpunct && _segments.length && aiOk && !committedAi);
      aiBtn.hidden = !show;
      // Four kinds of "no button" used to be indistinguishable (device round
      // 5: the user could not tell "already punctuated" from "feature
      // gone"). A stable note next to the picker says which state this
      // track is in; it stays empty only while there is no transcript.
      if (_aiNoteEl) {
        // 方案A: the chip shows the punctuation STATE only; the secondary
        // facts (caption source tier -- audit U13 -- and the missing-AI
        // hint) live in the chip's native tooltip so the toolbar stays calm.
        let note = "";
        let hint = "";
        if (_segments.length) {
          if (committedAi) note = t("mdVideoAiPunctDone");
          else if (!_wasUnpunct) note = t("mdVideoPunctSource");
          else {
            note = t("mdVideoPunctHeuristic");
            if (!aiOk) hint = t("mdVideoAiUnconfigured");
          }
        }
        const via = window.pbpVideoSession && window.pbpVideoSession.captionsVia;
        const viaTxt = via === "panel" ? t("mdVideoViaPanel")
          : via === "capture" ? t("mdVideoViaCapture")
          : via === "dom" ? t("mdVideoViaDom") : "";
        _aiNoteEl.textContent = note;
        _aiNoteEl.title = [hint, viaTxt].filter(Boolean).join(" · ");
        _aiNoteEl.hidden = !note;
      }
      // A re-offer has to arrive usable: a previous pass left the button
      // retired under a "Punctuated" label, and a new track is a new pass.
      // Clearing the latch and then re-deriving `disabled` from the freeze
      // counters is what keeps this from handing the button back while a
      // transaction still holds it (an unconditional `disabled = false` here
      // would defeat the freeze it is called next to).
      if (show) {
        _aiPassDone = false;
        // icon-only button: the offer state lives in title/aria-label --
        // with the pre-click token estimate appended (research T4.2).
        applyAiCostTitle(_aiBtnEl);
        // Cross-session hits make the estimate cheaper (research T4.1).
        try {
          seedPunctCache(_aiSettingsSnap, pbpVideoSplitBatches(pbpVideoMergeParagraphs(_segments), 1600))
            .then((n) => { if (n && _aiBtnEl && !_aiBtnEl.hidden) applyAiCostTitle(_aiBtnEl); });
        } catch (_) {}
      }
      applyControlFreeze();
    }
    copyBtn.hidden = !(res.segments || []).length;
    // Reveal the study-view toggle and the follow control only when there
    // is a transcript to switch to / follow (final-review M6).
    const hasSegs = (res.segments || []).length > 0;
    const tgEl = document.querySelector(".pbv-view-toggle");
    if (tgEl) tgEl.hidden = !hasSegs;
    if (_followBtn) _followBtn.hidden = !(hasSegs && document.body.classList.contains("video-mode") && detected.provider === "youtube");
    // Learning controls ride follow's visibility (research T3.2/T3.3); the
    // bilibili estimate toggle needs only rows.
    const learn = !!(_followBtn && !_followBtn.hidden);
    if (_loopBtn) _loopBtn.hidden = !learn;
    if (_autoPauseBtn) _autoPauseBtn.hidden = !learn;
    if (_rateSel) _rateSel.hidden = !learn;
    if (_estBtn) _estBtn.hidden = !(hasSegs && detected.provider === "bilibili");
    _segments = res.segments || [];
    // ONE meta construction (pbpVideoTranscriptMeta) shared with md-preview.js:
    // Copy, the first-run commit below, and the AI-punctuation commit all read
    // this object, so every transcript this page ever writes carries the same
    // heading, track label, and source link.
    _meta = pbpVideoTranscriptMeta(session, _meta && _meta.title, _meta && _meta.url);
    refreshAiOffer(); // needs _segments; the offer is a function of the CURRENT track
    // Hydrated (F5) sessions render the article before this module runs, so
    // no article-replaced event will fire for them -- time the gutter here.
    // First loads reach the same code via the promotion commit's event.
    try { applyParaTimes(); } catch (_) {}
    if (_segments.length) {
      if (_retryBtnEl) _retryBtnEl.hidden = true; // captions are here (F3)
      renderTranscript(bodyEl, _segments, true);
      // Timeline is the default study view once a transcript exists (device
      // feedback 2026-08-23: "优先显示时间轴") -- unless the reader picked a
      // view for THIS video before (audit U4): their choice survives the F5.
      // Runs once per mount (loadFlow), so a later manual toggle is never
      // fought.
      const savedView = (_savedRec && (_savedRec.view === "reading" || _savedRec.view === "timeline")) ? _savedRec.view : null;
      setStudyView(savedView || "timeline");
      // Continue watching (research T6.3): an explicit choice, never a
      // silent jump and never autoplay. Only worth offering past the first
      // 15s and before the last 30s.
      const dur = window.pbpVideoDuration();
      const savedT = _savedRec && Number(_savedRec.t);
      if (savedT >= 15 && dur > 0 && dur - savedT > 30) offerResume(savedT);
    }
    // Wire-once (closing review M3): the retry button re-enters loadFlow on
    // the SAME trackSel; stacking a listener per pass double-fires every
    // later selection (duplicate fetches). The handler reads live state, so
    // one registration serves every pass.
    if (trackSel._pbpChangeWired) { /* already wired by an earlier pass */ } else {
    trackSel._pbpChangeWired = true;
    trackSel.addEventListener("change", async () => {
      const key = trackSel.value;
      if (!key) return; // the neutral placeholder is not a track
      // The picker is disabled on screen while another transaction owns the
      // transcript, so reaching here means a programmatic dispatch (a test, an
      // extension). `disabled` does not block dispatchEvent -- refuse
      // explicitly rather than race a running commit or a paid AI pass.
      if (_freezeTrack > 0) { trackSel.value = _selectedTrackKey; return; }
      // This event's last-selection-wins token. Re-checked after every await
      // below, so a response for a selection the user already moved off is
      // dropped before it can render, mutate state, or reach the committer.
      const seq = ++_trackSwitchSeq;
      // Freeze the AI button for the WHOLE switch, starting BEFORE the fetch.
      // The picker deliberately stays live (that is what makes
      // last-selection-wins possible), but a paid pass started against the
      // outgoing transcript would compute its paragraphs from those words and
      // then commit them under the incoming track's heading -- and
      // pbpVideoTranscriptMarkdown ignores segments whenever paragraphs are
      // supplied, so the F5 gate cannot even detect the mismatch (review F1).
      // Counted, not boolean: two overlapping switches each hold their own,
      // and the loser's release must not hand the button back under the winner.
      const releaseAiFreeze = freezeControls({ ai: true });
      try {
        // Name the destination (audit U9): ten seconds of a generic
        // "loading" line over an unchanged panel read as a hang.
        const selOpt = trackSel.selectedOptions && trackSel.selectedOptions[0];
        pbvSetStatus(statusEl, selOpt && selOpt.textContent
          ? t("mdVideoSwitchingTo", selOpt.textContent) : t("mdVideoLoading"), "busy");
        // Resolve the selection through the picker's own value space, then
        // read the endpoint off whatever the session currently holds -- the
        // option value is no longer a URL, and the URL a hydrated session was
        // restored from would have expired anyway. Index first so a
        // duplicate-key pair resolves to the option that was actually clicked.
        let sessionTracks = (window.pbpVideoSession && window.pbpVideoSession.tracks) || [];
        const bare = key.replace(/#\d+$/, "");
        const idx = _trackValues.indexOf(key);
        let selTrack = (idx >= 0 && idx < sessionTracks.length) ? sessionTracks[idx] : null;
        if (!selTrack) {
          // The session's track list was replaced since the picker was
          // built. Re-run the SAME dedup pass on the live list so a suffixed
          // key still addresses its duplicate (closing review H6); the bare
          // fallback stays reserved for keys that never had a suffix --
          // resolving "yt:en#2" to the FIRST bare match was the wrong track.
          const liveVals = buildTrackValues(sessionTracks, detected.provider);
          const li = liveVals.indexOf(key);
          if (li >= 0) selTrack = sessionTracks[li];
          else if (!/#\d+$/.test(key)) {
            selTrack = sessionTracks.find((tr) => pbpVideoTrackKey(tr, detected.provider) === bare) || null;
          }
        }
        let endpoint = selTrack ? ((isBili ? selTrack.subtitle_url : selTrack.baseUrl) || "") : "";
        // Nothing to fetch: on an F5-HYDRATED session that is the normal
        // state, not a failure -- descriptors carry no endpoints by design.
        // Re-read the live directory now (and only now, on a real switch
        // attempt) and map the stable key onto a fresh endpoint. Never falls
        // back to the heuristic default track: the key the user picked is the
        // only thing this switch is allowed to fetch.
        if (!endpoint) {
          const fresh = await refreshTrackDirectory();
          if (seq !== _trackSwitchSeq) return; // a newer selection owns the panel now
          if (!fresh || !fresh.granted) {
            // The caption origin was revoked since the article was committed
            // (or the refresh threw). Blaming the track would point the user
            // at the wrong problem -- nothing is fetchable at all right now.
            pbvSetStatus(statusEl, t("mdVideoPermMissing"), true);
            trackSel.value = _selectedTrackKey;
            return;
          }
          const liveTracks = Array.isArray(fresh.tracks) ? fresh.tracks : [];
          const live = liveTracks.find((tr) => pbpVideoTrackKey(tr, detected.provider) === key)
            || liveTracks.find((tr) => pbpVideoTrackKey(tr, detected.provider) === bare)
            || null;
          if (live) { selTrack = live; endpoint = (isBili ? live.subtitle_url : live.baseUrl) || ""; }
          // The rescue tier below is per-LANGUAGE, not per-endpoint, and it
          // needs this capture's fetch handles -- a hydrated session has none
          // (functions and tab ids are not persistable), which is exactly the
          // case where YouTube's timedtext URLs are PO-Token-walled anyway.
          _ytFetchFn = fresh.ytFetchFn || _ytFetchFn;
          if (typeof fresh.ytFetchTabId === "number") _ytFetchTabId = fresh.ytFetchTabId;
          useLogin = fresh.useLogin;
          // Adopt the live list into the session only when it lines up with
          // the picker ON SCREEN, key for key: this handler resolves a
          // duplicate-key option BY INDEX into _trackValues, so adopting a
          // list of another shape would silently point that index at a
          // different track. When it does not line up, this switch still uses
          // the track it just resolved by key and the next one refreshes
          // again -- one extra directory read beats fetching the wrong track.
          const liveKeys = liveTracks.map((tr) => pbpVideoTrackKey(tr, detected.provider));
          const aligned = liveKeys.length === _trackValues.length
            && liveKeys.every((k, i) => k === String(_trackValues[i]).replace(/#\d+$/, ""));
          if (aligned && window.pbpVideoSession) {
            window.pbpVideoSession.tracks = liveTracks;
            sessionTracks = liveTracks;
            // `hydrated` means exactly two things: this object came out of
            // storage unverified, so its granted:true is NOT a standing grant,
            // and its tracks carry no endpoints. Adopting the live directory
            // ends both at once -- the contains() inside prepareVideoSession
            // just answered, and these tracks have real URLs -- so the flag
            // would otherwise decay into "was once restored", which is not
            // what any reader should key off (review F6).
            delete window.pbpVideoSession.hydrated;
          }
        }
        // Rescue sessions (captionsVia set) reached their captions because
        // every timedtext route FAILED -- trying the endpoint first there
        // only burns the 15s fetch timeout before the capture that will
        // actually succeed (the 10-15s "slow switch" of the 2026-08-24
        // device report; the fast switches were the ones whose endpoint
        // failed instantly). Go straight to the capture tier.
        const timedtextDead = !isBili && window.pbpVideoSession && window.pbpVideoSession.captionsVia;
        let segs = (endpoint && !timedtextDead)
          ? (isBili ? await pbpBiliFetchSubtitleBody(endpoint) : await pbpYtFetchCaptionBody(endpoint, _ytFetchFn || undefined, useLogin))
          : [];
        if (seq !== _trackSwitchSeq) return; // a newer selection owns the panel now
        // Rescue cascade (device report 2026-08-23: no YouTube language
        // switching): on sessions that needed a rescue, the picker's timedtext
        // URLs are PO-Token-walled -- and a hydrated session has no URL at all
        // -- so re-fetch through the page player's own caption machinery, the
        // verified per-language route. It keys off lang, not the endpoint.
        if (!segs.length && !isBili && _ytFetchTabId != null && selTrack) {
          // Through the injection mutex, with a superseded probe: a rapid
          // A->B switch drops A's queued capture WITHOUT ever injecting it
          // (saving its whole in-tab budget), and two captures can never
          // overlap in the tab.
          segs = (await queueTabInjection(
            () => ytTabPlayerCaptionCapture(_ytFetchTabId, selTrack.lang, detected.videoId),
            () => seq === _trackSwitchSeq)) || [];
          if (seq !== _trackSwitchSeq) return;
        }
        if (!segs.length) {
          // Keep the transcript the user already has: replacing a working
          // timeline with an empty list would turn a failed switch into data
          // loss. mdVideoBodyBlocked names the real problem for YouTube.
          pbvSetStatus(statusEl, t(isBili ? "mdVideoNoTracks" : "mdVideoBodyBlocked"), true);
          // ...and put the picker back on the track the panel and the article
          // actually carry, so it stops advertising a switch that never landed.
          trackSel.value = _selectedTrackKey;
          return;
        }
        pbvSetStatus(statusEl, "", null); // also clears any leftover tone
        // Verdict on the NEW track, taken BEFORE the heuristic tier runs
        // (after it, nothing "needs punctuation" any more). It decides both
        // the AI offer below and what videoState records for the F5 restore.
        const newUnpunct = !!(typeof pbpVideoNeedsPunctuation === "function" && pbpVideoNeedsPunctuation(segs));
        if (newUnpunct) segs = pbpVideoHeuristicPunctuate(segs);
        const prev = captureTranscriptState();
        _aiPunctParas = null; // a new track invalidates the previous AI pass
        _segments = segs;
        _wasUnpunct = newUnpunct;
        _selectedTrackKey = key;
        if (_detectedNow) pbpVideoSaveView(_detectedNow, { trackKey: key }); // research T6.2
        _auxGen++; // any in-flight companion fetch is stale now (retro #7)
        fillAuxOptions(sessionTracks, isBili); // the new primary leaves the aux list (T5.2)
        _transcriptEpoch++; // different words on screen: fence anything older
        // Heading label through the single meta builder's vocabulary, NOT the
        // option text -- the option carries the " (auto-generated)" UI suffix,
        // and committing that rewrote the article H2/TOC (final-review L4).
        _meta.trackLabel = selTrack ? (selTrack.label || selTrack.lan_doc || "") : "";
        copyBtn.hidden = false;
        // Draw first, commit second, and keep that order: the timeline is what
        // the reader is looking at, and a refused commit rolls it back below.
        // Rendering only after the commit would leave the panel stale for the
        // whole storage round-trip.
        _viewScroll.reading = _viewScroll.timeline = null; // old offsets described the old article (F6)
        renderTranscript(bodyEl, segs, true);
        // Re-render cleared the current-row highlight; a paused player sends
        // no new time event to restore it -- replay the last one (B13).
        replayHighlight();
        // Atomic track switch (Task 5): when the transcript IS this page's
        // article, keep it in sync through the single committer (md-preview.js
        // owns the account/tags/description contract) -- in place now, no
        // reload, so the player never stops. A track switch always carries the
        // heuristic tier, so the AI flag rides as false and the paid upgrade
        // goes back on offer for the new track.
        if (!(window.pbpVideoDoc
              && window.pbpVideoDoc.kind === "video-transcript"
              && typeof window.pbpVideoCommitTranscript === "function")) {
          syncSessionToCommitted(selTrack, newUnpunct);
          refreshAiOffer();
          return;
        }
        const releaseCommit = freezeControls({ track: true });
        let ok = false, threwInCommit = false;
        // `phase` is what makes `threwInCommit` mean what its comment says.
        // Argument construction runs inside this try (so a throw is handled
        // rather than escaping the listener with state already mutated) but
        // BEFORE the await, and a throw there is a PRE-persist failure --
        // nothing was ever asked of the committer -- so it must take the
        // rollback arm, not the keep arm (review F2).
        let phase = "build";
        try {
          const commitMd = pbpVideoTranscriptMarkdown(segs, _meta, null);
          const commitTitle = _meta.title || "";
          const videoState = pbpVideoStateBuild({
            detected, track: selTrack, tracks: sessionTracks, segments: segs,
            aiParas: null, wasUnpunct: newUnpunct, aiPunct: false, meta: _meta
          });
          phase = "commit";
          ok = await window.pbpVideoCommitTranscript(commitMd, commitTitle,
            { aiPunct: false, reason: "video-track-switch", videoState });
        } catch (e) {
          threwInCommit = phase === "commit";
          console.warn("[pbp-video] track-switch commit threw in", phase + ":", (e && e.name) || "", (e && e.message) || e);
        } finally {
          releaseCommit();
        }
        // Two failure shapes, two different repairs -- telling them apart is
        // the whole reason this awaits the committer:
        //   * returned false, or threw before the committer ran -- nothing was
        //     persisted and nothing swapped, so the article is still the
        //     previous track and the timeline, picker and cached session have
        //     to roll back to match it.
        //   * threw INSIDE the committer -- the only throw it can propagate
        //     comes from the applier, which runs after the payload is
        //     persisted and after canonicalMarkdown already points at the new
        //     transcript. Keeping the new timeline holds it level with
        //     canonical, storage and whatever an F5 lands on; rolling back
        //     would instead make the already-persisted videoState disagree
        //     with the timeline, i.e. a fork that SURVIVES the reload. (The
        //     rendered DOM may lag inside renderArticleContent's own throw
        //     window; canonical/storage is the state that outlives it.)
        if (ok || threwInCommit) syncSessionToCommitted(selTrack, newUnpunct);
        else restoreTranscriptState(prev);
        // Quota copy only when the payload truly failed to persist: on the
        // threwInCommit arm the write already landed (final review L1) --
        // claiming "couldn't be saved" there would be a lie.
        if (!ok && !threwInCommit) pbvSetStatus(statusEl, t("mdPreviewQuotaFull"), true);
        refreshAiOffer();
      } finally {
        releaseAiFreeze();
        // Stale-loading sweep (device report 2026-08-24: "Loading subtitles…"
        // left standing after a rapid-switch storm): a superseded switch
        // returns without finalizing the status it wrote, and when the
        // superseding switch was itself refused at entry, nobody ever
        // rewrites it. Once no operation holds a freeze, a lingering loading
        // line describes nothing -- clear it. Terminal messages (failure
        // copy) are not the loading string and stay.
        if (_freezeTrack === 0 && _freezeAi === 0 && statusEl.dataset.state === "busy") {
          // Any lingering BUSY line (loading or 切换到 X) describes work no
          // one holds any more -- clear text and tone together (方案A).
          pbvSetStatus(statusEl, "", false);
        }
      }
    });
    // Auxiliary track fetch (research T5.2): the switch handler's endpoint
    // resolution, minus its commit -- nothing here touches the article,
    // the session track or the canonical markdown.
    async function fetchAuxSegments(key) {
      const sessionTracks = (window.pbpVideoSession && window.pbpVideoSession.tracks) || [];
      const bare = key.replace(/#\d+$/, "");
      const idx = _trackValues.indexOf(key);
      let selTrack = (idx >= 0 && idx < sessionTracks.length) ? sessionTracks[idx] : null;
      if (!selTrack) selTrack = sessionTracks.find((tr) => pbpVideoTrackKey(tr, detected.provider) === bare) || null;
      let endpoint = selTrack ? ((isBili ? selTrack.subtitle_url : selTrack.baseUrl) || "") : "";
      if (!endpoint) {
        const fresh = await refreshTrackDirectory();
        if (!fresh || !fresh.granted) return [];
        const liveTracks = Array.isArray(fresh.tracks) ? fresh.tracks : [];
        const live = liveTracks.find((tr) => pbpVideoTrackKey(tr, detected.provider) === key)
          || liveTracks.find((tr) => pbpVideoTrackKey(tr, detected.provider) === bare) || null;
        if (live) { selTrack = live; endpoint = (isBili ? live.subtitle_url : live.baseUrl) || ""; }
        _ytFetchFn = fresh.ytFetchFn || _ytFetchFn;
        if (typeof fresh.ytFetchTabId === "number") _ytFetchTabId = fresh.ytFetchTabId;
        useLogin = fresh.useLogin;
      }
      const timedtextDead = !isBili && window.pbpVideoSession && window.pbpVideoSession.captionsVia;
      let segs = (endpoint && !timedtextDead)
        ? (isBili ? await pbpBiliFetchSubtitleBody(endpoint) : await pbpYtFetchCaptionBody(endpoint, _ytFetchFn || undefined, useLogin))
        : [];
      if (!segs.length && !isBili && _ytFetchTabId != null && selTrack) {
        segs = (await queueTabInjection(
          () => ytTabPlayerCaptionCapture(_ytFetchTabId, selTrack.lang, detected.videoId), () => true)) || [];
      }
      return segs;
    }
    if (_auxSel && !_auxSel._pbpChangeWired) {
      _auxSel._pbpChangeWired = true;
      let auxSeq = 0;
      _auxSel.addEventListener("change", async () => {
        const key = _auxSel.value;
        const mySeq = ++auxSeq;
        const gen = _auxGen, epoch = _transcriptEpoch;
        if (!key) { _auxSegs = null; applyAux(); return; }
        const selOpt = _auxSel.selectedOptions && _auxSel.selectedOptions[0];
        pbvSetStatus(statusEl, selOpt && selOpt.textContent ? t("mdVideoSwitchingTo", selOpt.textContent) : t("mdVideoLoading"), "busy");
        let segs = [];
        try { segs = await fetchAuxSegments(key); } catch (e) { console.warn("[pbp-video] aux track:", (e && e.message) || e); }
        // Stale if the reader picked another companion, the primary track
        // changed (it may even BE this track now), or the transcript was
        // replaced meanwhile (retro #7).
        if (mySeq !== auxSeq || gen !== _auxGen || epoch !== _transcriptEpoch || _auxSel.value !== key || key === _selectedTrackKey) return;
        if (!segs.length) {
          pbvSetStatus(statusEl, t(isBili ? "mdVideoNoTracks" : "mdVideoBodyBlocked"), true);
          _auxSel.value = "";
          _auxSegs = null;
          applyAux();
          return;
        }
        pbvSetStatus(statusEl, "", null);
        _auxSegs = segs;
        applyAux();
      });
    }
    } // end wire-once (closing review M3)
    // Picker goes live only now that its change handler exists (audit B11).
    trackSel.hidden = !(res.tracks || []).length;
    // First run: the bootstrap could not fetch captions because the origin
    // grant did not exist yet, so md-preview.js settled for "video-fallback"
    // (the extracted description as the article). The click that got us here
    // IS that grant, and the transcript is now in hand -- promote it to the
    // article instead of making the user reload the page by hand. Runs once:
    // the payload this writes comes back as kind "video-transcript".
    if (_segments.length && window.pbpVideoDoc && window.pbpVideoDoc.kind === "video-fallback"
        && typeof window.pbpVideoCommitTranscript === "function") {
      const releaseCommit = freezeControls({ track: true, ai: true });
      let ok = false, threwInCommit = false;
      // Same phase split as the track switch and the AI pass (audit B7): a
      // throw from INSIDE the committer happens after the payload persisted
      // and canonical advanced, so treating it as "not saved" both lies
      // (quota copy over a record that IS on disk) and desyncs the session
      // from what an F5 will restore.
      let phase = "build";
      try {
        const commitMd = pbpVideoTranscriptMarkdown(_segments, _meta, _aiPunctParas);
        const commitTitle = _meta.title || "";
        const videoState = pbpVideoStateBuild({
          detected, track: session.track || null, tracks: res.tracks || [],
          segments: _segments, aiParas: _aiPunctParas, wasUnpunct: _wasUnpunct,
          aiPunct: !!_aiPunctParas, meta: _meta
        });
        phase = "commit";
        ok = await window.pbpVideoCommitTranscript(commitMd, commitTitle,
          { aiPunct: !!_aiPunctParas, reason: "video-promotion", videoState });
      } catch (e) {
        threwInCommit = phase === "commit";
        console.warn("[pbp-video] promotion commit threw in", phase + ":", (e && e.name) || "", (e && e.message) || e);
      } finally {
        releaseCommit();
      }
      // No timeline rollback here, and nothing to roll back TO: this panel has
      // shown exactly this transcript since it mounted, and the article a
      // failed promotion leaves in place is the extracted video description --
      // the legitimate pre-promotion state, not a fork. The quota copy only on
      // a true non-persist; a post-persist throw keeps quiet (console carries
      // it) rather than claiming an on-disk record was not saved.
      if (!ok && !threwInCommit) pbvSetStatus(statusEl, t("mdPreviewQuotaFull"), true);
      // The description just stopped being the article and became the
      // collapsed block -- on an in-place promotion nothing else ever builds
      // it (T3 review F2). On the post-persist-throw arm the payload IS the
      // transcript now, so the description block belongs there too.
      if (ok || threwInCommit) {
        syncSessionToCommitted(session.track || null, _wasUnpunct);
        try { ensureVideoDescription(); } catch (_) {}
        // One-shot notice (audit U15): the article was just swapped and the
        // view flipped under the reader -- say so once, quietly.
        pbvSetStatus(statusEl, t("mdVideoPromoted"), false);
      }
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
    reading.setAttribute("aria-keyshortcuts", "b");
    reading.addEventListener("click", () => setStudyView("reading", true));
    const timeline = el("button", "src-seg", t("mdVideoViewTimeline"));
    timeline.type = "button";
    timeline.setAttribute("data-view", "timeline");
    timeline.setAttribute("aria-keyshortcuts", "b");
    timeline.addEventListener("click", () => setStudyView("timeline", true));
    wrap.appendChild(reading);
    wrap.appendChild(timeline);
    // Density toggle (research T7.10), timeline-only: a real toggle in the
    // aria-pressed vocabulary inside the same segmented group.
    const density = el("button", "src-seg pbv-density", t("mdVideoDensityPara"));
    density.type = "button";
    density.hidden = true;
    density.setAttribute("aria-pressed", "false");
    density.addEventListener("click", () => setDensity(_density === "paragraph" ? "cue" : "paragraph", true));
    wrap.appendChild(density);
    _densityBtn = density;
    _toggleReadingBtn = reading;
    _toggleTimelineBtn = timeline;
    return wrap;
  }

  function setStudyView(mode, persist) {
    const reading = mode !== "timeline";
    // Save the outgoing view's scroll, restore the incoming view's (audit
    // U11) -- only when this call actually flips the views.
    let flipped = false;
    if (_studyReadingEl && _studyListEl) {
      const prevReading = !_studyReadingEl.hidden;
      flipped = prevReading !== reading;
      if (flipped) _viewScroll[prevReading ? "reading" : "timeline"] = window.scrollY;
    }
    if (_studyReadingEl) _studyReadingEl.hidden = !reading;
    if (_studyListEl) _studyListEl.hidden = reading;
    if (flipped) {
      const saved = _viewScroll[reading ? "reading" : "timeline"];
      if (saved != null) { try { window.scrollTo({ top: saved, behavior: "instant" }); } catch (_) {} }
    }
    // Follow can only act on the timeline (audit U4): in the reading view
    // the pressed toggle silently did nothing. Disabled with the reason in
    // its title; restored the moment the timeline is back.
    if (_followBtn) {
      _followBtn.disabled = reading;
      const lbl = t(reading ? "mdVideoFollowReadingOff" : "mdVideoFollow");
      _followBtn.title = lbl;
      _followBtn.setAttribute("aria-label", lbl);
    }
    // Persist only USER choices (audit U4): programmatic flips (defaults,
    // ensure-article-visible) must not overwrite what the reader picked.
    if (persist && _detectedNow) { pbpVideoSaveView(_detectedNow, { view: reading ? "reading" : "timeline" }); }
    if (_toggleReadingBtn) {
      _toggleReadingBtn.classList.toggle("active", reading);
      _toggleReadingBtn.setAttribute("aria-pressed", reading ? "true" : "false");
    }
    if (_toggleTimelineBtn) {
      _toggleTimelineBtn.classList.toggle("active", !reading);
      _toggleTimelineBtn.setAttribute("aria-pressed", !reading ? "true" : "false");
    }
    if (_densityBtn) _densityBtn.hidden = reading;
    // Returning to the timeline while paused: replay the last reported
    // position so the current-row highlight survives the round trip (B13).
    if (!reading) replayHighlight();
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

  // The description block is built ONCE, by mountVideoWorkspace -- and
  // buildVideoDescription returns null on a "video-fallback" page, where the
  // description IS the article and there is nothing to collapse. The first-run
  // promotion now flips that kind IN PLACE (the reload that used to rebuild
  // the whole page went away with this campaign), so on a runtime-ready
  // fallback page the block never appeared again for the rest of the session
  // (T3 review F2). Build it on demand into the same slot the mount uses:
  // last in the study column, below the article and the timeline.
  //
  // Idempotent by id -- a second commit finds the block and leaves it alone,
  // rather than stacking a duplicate #video-description under the first.
  function ensureVideoDescription() {
    if (document.getElementById("video-description")) return;
    const host = _studyListEl && _studyListEl.parentNode;
    if (!host) return; // no workspace (the non-video-mode defensive mount)
    const descEl = buildVideoDescription();
    if (descEl) host.appendChild(descEl);
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
    ensureSrRegion(); // empty live region first, messages later (retro A11Y-1)
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
    list.setAttribute("role", "list");
    list.setAttribute("aria-label", t("mdVideoTimelineAria"));
    bindRowClicks(list);
    studyCol.appendChild(list);
    // Article observer for the translation projection (research T5.1):
    // .pb-tr siblings appear and fill as md-translate streams.
    if (typeof MutationObserver === "function" && !_trObserver) {
      // Only .pb-tr traffic re-projects (retro PERF-V2): highlights, echo
      // ranges, KaTeX and the gutter also mutate the article.
      const isTr = (n) => !!(n && n.nodeType === 1 && n.classList && n.classList.contains("pb-tr"));
      const touchesTr = (m) => {
        const tgt = m.target;
        if (isTr(tgt)) return true;
        const host = tgt && (tgt.nodeType === 3 ? tgt.parentElement : tgt);
        if (host && host.closest && host.closest(".pb-tr")) return true;
        for (const n of m.addedNodes) if (isTr(n) || (n.nodeType === 1 && n.querySelector && n.querySelector(".pb-tr"))) return true;
        for (const n of m.removedNodes) if (isTr(n)) return true;
        return false;
      };
      _trObserver = new MutationObserver((muts) => { for (const m of muts) { if (touchesTr(m)) { scheduleProjectTranslations(); return; } } });
      _trObserver.observe(view, { childList: true, subtree: true, characterData: true });
    }
    // Back-to-current affordance (research T3.7): sticky under the list,
    // shown only while follow is off AND the current row is off-screen.
    const backBtn = el("button", "pbv-back-current");
    backBtn.type = "button";
    backBtn.hidden = true;
    backBtn.setAttribute("aria-keyshortcuts", "c");
    backBtn.addEventListener("click", () => { jumpToCurrent(); setFollow(true); });
    _backBtn = backBtn;
    studyCol.appendChild(backBtn);
    let _backTick = false;
    window.addEventListener("scroll", () => {
      if (_backTick) return;
      _backTick = true;
      requestAnimationFrame(() => { _backTick = false; updateBackBtn(); });
    }, { passive: true });
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
    _detectedNow = detected; // per-video persistence identity (audit U4)
    _ownerNow = (typeof ctx.account === "string" && ctx.account)
      ? "acct_" + encodeURIComponent(ctx.account) : "ownerless"; // owner scope (M7)
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
    // Scope note (audit U2, placement research T7.1): says what the grant
    // actually covers before Chrome's prompt appears. It must live INSIDE
    // the absolutely-positioned bottom label bar -- as the card's only
    // normal-flow child it painted UNDER the absolutely-positioned cover
    // img (in-flow content paints before positioned descendants), so
    // YouTube's always-present poster hid it exactly when it mattered.
    // The label text gets its own span so the async first-run upgrade
    // below can swap the label without wiping the note.
    const posterLabelEl = el("span", "pbv-poster-label");
    posterLabelEl.appendChild(el("span", "pbv-poster-label-text", posterLabel));
    const posterNote = el("span", "pbv-poster-note", t("mdVideoGrantScope"));
    posterNote.hidden = !firstRun;
    posterLabelEl.appendChild(posterNote);
    cta.appendChild(posterLabelEl);
    // Progressive first paint mounts BEFORE any session exists (audit B15:
    // pbpVideoSession is null here since the plan-丙 bootstrap change), so
    // the granted===false read above can no longer fire. Derive first-run
    // from the same authority the auto-boot uses -- contains() -- and
    // upgrade the poster asynchronously; granted pages keep the generic
    // label and their auto-boot takes over anyway.
    if (!window.pbpVideoSession && !firstRun) {
      (async () => {
        try {
          const pat = detected.provider === "bilibili" ? BILI_ORIGIN : YT_ORIGIN;
          const g = await chrome.permissions.contains({ origins: [pat] }) === true;
          if (!g) {
            cta.classList.add("pbv-poster--enable");
            const lbl = t("mdVideoEnable");
            cta.title = lbl;
            cta.setAttribute("aria-label", lbl);
            const span = cta.querySelector(".pbv-poster-label-text");
            if (span) span.textContent = lbl;
            posterNote.hidden = false; // scope note joins the enable state (audit U2)
          }
        } catch (_) {}
      })();
    }
    panel.appendChild(cta);
    mountVideoWorkspace(view, panel);
    _panel = panel;

    // Set by runLoad once the status line exists, so the automatic-load
    // rejection handler below has somewhere to report to.
    let statusRef = null;

    // Re-entry latch: the fallback auto-boot's contains() round-trip opens a
    // window where the user can click the poster before the automatic
    // runLoad(false) lands -- two concurrent runLoads would double-mount the
    // player iframe. First entry wins; a FAILED run releases the latch on
    // every existing recovery path (they all restore the poster card, so the
    // retry click must be able to re-enter).
    let _runLoadEntered = false;
    async function runLoad(fromClick) {
      if (_runLoadEntered) return;
      _runLoadEntered = true;
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
      // Greet only once the relay DOCUMENT is up: posting into a
      // not-yet-loaded frame hits its initial extension-origin document, and
      // every such post logs a target-origin error into chrome://extensions
      // (device round 4's error-list bulk, 20+ entries). load re-fires after
      // every src change (the seek fallback rewrites src), so each
      // navigation re-arms its own greeting loop; the loop itself covers the
      // relay being slow to ANSWER after load. bilibili's player speaks no
      // relay protocol -- never greet it.
      if (detected.provider === "youtube") _iframe.addEventListener("load", startRelayHello);
      media.appendChild(_iframe);
      const bar = el("div", "pbv-bar");
      // No aria-live here (research T7.4): announcements go through the
      // srAnnounce mirror, which pbvSetStatus feeds for every write except
      // the per-batch "busy-quiet" progress ticks.
      const status = el("span", "pbv-status");
      statusRef = status;
      _statusElRef = status;
      // Continue-watching strip (research T6.3): message-bar look, two
      // explicit actions; filled by offerResume, hidden until then.
      const resume = el("div", "pbv-resume");
      resume.hidden = true;
      _resumeEl = resume;
      const trackSel = document.createElement("select");
      trackSel.className = "pbv-tracks";
      trackSel.hidden = true;
      trackSel.setAttribute("aria-label", t("mdVideoTrackAria"));
      // Auxiliary track picker (research T5.2): a second native caption
      // track shown under each row, paired by time. Same form-control
      // family as the primary picker; hidden until two tracks exist.
      const auxSel = document.createElement("select");
      auxSel.className = "pbv-tracks pbv-aux";
      auxSel.hidden = true;
      auxSel.title = t("mdVideoAuxTrack");
      auxSel.setAttribute("aria-label", t("mdVideoAuxTrack"));
      _auxSel = auxSel;
      // Icon-only bar (device feedback 2026-08-24): every control except the
      // track <select> is an icon with title + aria-label. Success feedback
      // swaps the copy icon for the check icon briefly -- with the re-entry
      // guard flashButtonLabel taught us (clearTimeout + fixed resting state,
      // never "capture whatever is there now" which a rapid second click
      // would capture mid-flash).
      const copyBtn = el("button", "pbv-copy");
      copyBtn.type = "button";
      copyBtn.hidden = true;
      copyBtn.innerHTML = typeof PBP_ICONS !== "undefined" ? PBP_ICONS.copy : "";
      copyBtn.title = t("mdVideoCopyMd");
      copyBtn.setAttribute("aria-label", t("mdVideoCopyMd"));
      let copyFlashTimer = null;
      const doCopy = async (text) => {
        try {
          await navigator.clipboard.writeText(text);
          // A prior "Copy failed" line must not outlive a later success
          // (audit B16); the success copy also feeds the aria-live region.
          pbvSetStatus(status, t("mdVideoCopied"), false);
          if (copyFlashTimer) clearTimeout(copyFlashTimer);
          copyBtn.innerHTML = typeof PBP_ICONS !== "undefined" ? PBP_ICONS.check : "";
          copyBtn.classList.add("copied");
          copyBtn.title = t("mdVideoCopied");
          copyFlashTimer = setTimeout(() => {
            copyFlashTimer = null;
            copyBtn.innerHTML = typeof PBP_ICONS !== "undefined" ? PBP_ICONS.copy : "";
            copyBtn.classList.remove("copied");
            copyBtn.title = t("mdVideoCopyMd");
          }, 1800);
        } catch (_) { pbvSetStatus(status, t("mdVideoCopyFailed"), true); }
      };
      copyBtn.addEventListener("click", () => doCopy(pbpVideoTranscriptMarkdown(_segments, _meta, _aiPunctParas)));
      // Export formats (research T1.2): the primary click stays the plain
      // markdown copy; a caret (the send-button split idiom, .send-tri) opens
      // a small menu with the timestamped markdown and an SRT download. All
      // three are side channels built from the in-memory segments -- the
      // committed article is never touched. Group visibility mirrors the
      // copy button's, which loadFlow toggles.
      const copyGroup = el("span", "pbv-copy-group");
      copyGroup.hidden = true;
      const copyCaret = el("button", "pbv-copy-caret");
      copyCaret.type = "button";
      copyCaret.innerHTML = '<span class="send-tri" aria-hidden="true"></span>';
      copyCaret.title = t("mdVideoCopyMore");
      copyCaret.setAttribute("aria-label", t("mdVideoCopyMore"));
      copyCaret.setAttribute("aria-haspopup", "menu");
      copyCaret.setAttribute("aria-expanded", "false");
      const copyMenu = el("div", "send-menu pbv-copy-menu");
      copyMenu.setAttribute("role", "menu");
      copyMenu.hidden = true;
      const menuItem = (labelKey, onPick) => {
        const mi = el("button", "send-mi", t(labelKey));
        mi.type = "button";
        mi.setAttribute("role", "menuitem");
        mi.addEventListener("click", () => { closeCopyMenu(true); onPick(); }); // refocus the caret (retro KBD-2)
        copyMenu.appendChild(mi);
        return mi;
      };
      const closeCopyMenu = (refocus) => {
        if (copyMenu.hidden) return;
        copyMenu.hidden = true;
        copyCaret.setAttribute("aria-expanded", "false");
        document.removeEventListener("click", onDocClickForMenu, true);
        if (refocus) { try { copyCaret.focus({ preventScroll: true }); } catch (_) {} }
      };
      const onDocClickForMenu = (ev) => {
        if (!copyGroup.contains(ev.target)) closeCopyMenu(false);
      };
      copyCaret.addEventListener("click", () => {
        if (!copyMenu.hidden) { closeCopyMenu(true); return; }
        copyMenu.hidden = false;
        copyCaret.setAttribute("aria-expanded", "true");
        const first = copyMenu.querySelector(".send-mi");
        if (first) { try { first.focus({ preventScroll: true }); } catch (_) {} }
        setTimeout(() => document.addEventListener("click", onDocClickForMenu, true), 0);
      });
      copyMenu.addEventListener("keydown", (ev) => {
        if (ev.key === "Escape") { ev.preventDefault(); closeCopyMenu(true); return; }
        if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
          ev.preventDefault();
          const items = Array.from(copyMenu.querySelectorAll(".send-mi"));
          const i = items.indexOf(document.activeElement);
          const nx = items[(i + (ev.key === "ArrowDown" ? 1 : items.length - 1)) % items.length];
          if (nx) nx.focus();
        }
      });
      menuItem("mdVideoCopyMd", () => doCopy(pbpVideoTranscriptMarkdown(_segments, _meta, _aiPunctParas)));
      menuItem("mdVideoCopyTimed", () => doCopy(pbpVideoTimedMarkdown(_segments, _meta, _aiPunctParas)));
      menuItem("mdVideoDownloadSrt", () => {
        try {
          const blob = new Blob([pbpVideoSrt(_segments)], { type: "application/x-subrip;charset=utf-8" });
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = (String((_meta && _meta.title) || "transcript").replace(/[\\/:*?"<>|\s]+/g, " ").trim().slice(0, 80) || "transcript") + ".srt";
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(a.href), 1000);
          pbvSetStatus(status, t("mdVideoSrtSaved"), false);
        } catch (_) { pbvSetStatus(status, t("mdVideoCopyFailed"), true); }
      });
      copyGroup.appendChild(copyBtn);
      copyGroup.appendChild(copyCaret);
      copyGroup.appendChild(copyMenu);
      // loadFlow toggles copyBtn.hidden; the group (and its caret) follow.
      if (typeof MutationObserver === "function") {
        new MutationObserver(() => {
          copyGroup.hidden = copyBtn.hidden;
          if (copyBtn.hidden) closeCopyMenu(false);
        }).observe(copyBtn, { attributes: true, attributeFilter: ["hidden"] });
      }
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
      aiBtn.title = t("mdVideoAiPunct");
      aiBtn.setAttribute("aria-label", t("mdVideoAiPunct"));
      // 方案A: progress ring around the robot while a pass runs. SVG
      // geometry, not a glyph -- the Lucide contract governs glyphs; rings
      // and triangles are layout drawings. Batch progress drives the
      // stroke; the status bar carries the textual count in parallel.
      const ringNS = "http://www.w3.org/2000/svg";
      const ringSvg = document.createElementNS(ringNS, "svg");
      ringSvg.setAttribute("class", "pbv-ring");
      ringSvg.setAttribute("viewBox", "0 0 28 28");
      ringSvg.setAttribute("aria-hidden", "true");
      const ringC = document.createElementNS(ringNS, "circle");
      ringC.setAttribute("cx", "14"); ringC.setAttribute("cy", "14"); ringC.setAttribute("r", "12.5");
      ringSvg.appendChild(ringC);
      ringSvg.style.display = "none";
      aiBtn.appendChild(ringSvg);
      const RING_LEN = 2 * Math.PI * 12.5;
      ringC.style.strokeDasharray = String(RING_LEN);
      const setAiRing = (cur, total) => {
        if (cur == null || !total) { ringSvg.style.display = "none"; return; }
        ringSvg.style.display = "";
        ringC.style.strokeDashoffset = String(RING_LEN * (1 - Math.min(1, cur / total)));
      };
      const runAiPass = async () => {
        // `disabled` blocks real clicks but not dispatchEvent/.click() from
        // script, so the freeze counters are re-checked directly.
        if (!_segments.length || aiBtn.disabled || _freezeAi > 0 || _aiPassDone) return;
        // Bind the pass to the transcript that is on screen RIGHT NOW. A track
        // switch may already have a fetch in flight (the picker stays live so
        // last-selection-wins works); when its segments land they replace
        // _segments and _meta under this pass, and
        // pbpVideoTranscriptMarkdown IGNORES segments whenever paragraphs are
        // supplied -- so committing afterwards would put this track's words
        // under the other track's heading, and pbpVideoStateValidate could not
        // detect it because the paragraphs shadow the segments in the rebuild
        // (review F1). Freezing (below) closes the door; this fence is what
        // catches anything that got through before it shut.
        const epoch = _transcriptEpoch;
        const superseded = () => epoch !== _transcriptEpoch;
        // Freezes the track picker as well: a track switch landing mid-pass
        // would punctuate one track's words into another track's article.
        const releaseFreeze = freezeControls({ track: true, ai: true });
        // A completed pass must not be re-offered once the freeze lifts --
        // re-running it would spend tokens to produce what is already there.
        let passDone = false;
        let doneCount = 0, totalCount = 0; // for the cancel/abort status line
        _aiAbort = (typeof AbortController === "function") ? new AbortController() : null;
        // icon-only button: progress reads out in the aria-live status line
        pbvSetStatus(status, t("mdVideoAiPunct") + "…", "busy");
        aiBtn.setAttribute("aria-busy", "true"); // research T7.4
        _aiCancelRequested = false;
        aiCancelBtn.hidden = false;
        aiCancelBtn.disabled = false;
        setAiRing(0, 1);
        try {
          // Missing provider grant: permissions.request is the FIRST await
          // in this click (audit B10) -- origins and the contains() answer
          // were settled at offer time, so nothing burns the transient
          // activation before Chrome checks for it. Denial throws the same
          // actionable host_permission error the catch below surfaces.
          if (_aiOrigins && _aiOrigins.length && !_aiHostGranted) {
            let granted = false;
            try { granted = await chrome.permissions.request({ origins: _aiOrigins }) === true; } catch (_) {}
            if (!granted) {
              const err = new Error(t("aiErrorHostPermission", String(_aiOrigins[0] || "").replace(/\/\*$/, "")));
              err.code = "host_permission";
              throw err;
            }
            _aiHostGranted = true;
          }
          const paras = pbpVideoMergeParagraphs(_segments);
          const batches = pbpVideoSplitBatches(paras, 1600);
          const sa = await pbpAiGetSettings();
          if (superseded()) return; // the words this pass was built from are gone
          totalCount = batches.length;
          // Cross-session cache (research T4.1): a batch answered on an earlier
          // visit is free again -- seeded before freshTotal is counted.
          await seedPunctCache(sa, batches);
          if (superseded()) return;
          // Provider changed since the offer settled (closing review M4):
          // refresh the origin snapshot so the backstop below asks for the
          // RIGHT provider instead of the stale one.
          if (typeof _aiRequiredOriginPatterns === "function") {
            try {
              const fresh = _aiRequiredOriginPatterns(sa);
              if (fresh && _aiOrigins && fresh.join() !== _aiOrigins.join()) {
                _aiOrigins = fresh;
                _aiHostGranted = false; // let the gesture backstop re-check
              }
            } catch (_) {}
          }
          // The provider origin may never have been granted on this profile
          // (the options-page Test button is the only other surface that
          // asks; device round 4: six "No access" dead-ends behind a generic
          // failure label). Every other AI click surface requests the exact
          // origin on its own gesture -- this one went straight to callAI.
          // Ask HERE, on this click's activation; declining throws the
          // actionable host_permission message into the catch below.
          if (typeof ensureAIHostPermissionWithGesture === "function") {
            await ensureAIHostPermissionWithGesture(sa);
            if (superseded()) return;
          }
          const outBatches = [];
          let rejected = 0;
          // Progress counts the batches THIS pass actually pays for (device
          // round 6: a retry that resumed at "1/7" read as starting over --
          // it was numbering by batch index, not by work remaining).
          const freshTotal = batches.filter((x) => !_aiBatchCache.has(x)).length || batches.length;
          let freshCur = 0;
          for (const [bi, b] of batches.entries()) {
            // Retry economics (audit B9): a batch this page already got a
            // conservation-passing answer for answers from the cache -- the
            // retry after a partial failure re-pays only for what failed.
            if (_aiCancelRequested) {
              // Between-batch cancel (audit U8): finished batches stay in
              // the cache, nothing commits, the button survives via finally.
              pbvSetStatus(status, t("mdVideoAiCancelled", String(outBatches.length), String(batches.length)), false);
              return;
            }
            const cached = _aiBatchCache.get(b);
            if (cached != null) { outBatches.push(cached); continue; }
            freshCur++;
            // busy-quiet: visual count only -- the SR milestone announcements
            // are the pass start and its terminal line (research T7.4).
            pbvSetStatus(status, t("mdVideoAiPunctProgress", String(freshCur), String(freshTotal)), "busy-quiet");
            setAiRing(freshCur - 1 || 0.05, freshTotal);
            const prompt = "为下面的语音转写文本添加或修正标点符号，并按语义用空行分段。严格保持文字本身不变：不得增加、删除或改写任何非标点文字；原文中的错别字、重复和口误也必须原样保留，不要纠正。直接输出处理后的文本，不要任何解释。\n\n" + b;
            // Output ≈ input + marks: the provider DEFAULT of ~1024 output
            // tokens truncates any full-size (~1600+ char) CJK batch, and a
            // truncated echo can never pass the conservation gate below -- the
            // primary suspect behind "clicked AI punctuation, nothing changed"
            // (device report 2026-08-24). 2 tokens/char + headroom covers every
            // provider's tokenizer; 4096 is within all providers' caps.
            const text = await callAI(sa, prompt, { maxTokens: Math.min(4096, b.length * 2 + 256), signal: _aiAbort ? _aiAbort.signal : undefined });
            if (superseded()) return;
            // fail-closed per batch: a batch the model rewrote keeps its input.
            // One resilience step first: strip a markdown code fence the model
            // may have wrapped the (otherwise correct) output in -- the
            // unwrapped text still has to pass the SAME conservation gate, so
            // fail-closed is not weakened.
            let out = String(text || "");
            let ok = pbpVideoPunctConserved(b, out);
            if (!ok) {
              const unfenced = pbpVideoStripFence(out);
              if (unfenced !== out && pbpVideoPunctConserved(b, unfenced)) { out = unfenced; ok = true; }
            }
            if (!ok) {
              // Word-drift repair (device round 6): restore the source's
              // characters under the model's marks. Non-null means the
              // repaired text already passed the conservation gate.
              const repaired = pbpVideoPunctRepair(b, pbpVideoStripFence(out));
              if (repaired != null) {
                console.info("[pbp-video] ai punctuation: batch " + (bi + 1) + "/" + batches.length
                  + " repaired (model word drift undone, marks kept)");
                out = repaired; ok = true;
              }
            }
            if (!ok) {
              rejected++;
              // Breadcrumb, not content (privacy: no transcript text in logs).
              // The length ratio doubles as the diagnosis: out << in means the
              // model truncated or refused; out ≈ in means it rewrote words
              // (typo fixes / script conversion) or used marks outside the
              // conservation whitelist.
              console.info("[pbp-video] ai punctuation: batch " + (bi + 1) + "/" + batches.length
                + " failed conservation (in " + b.length + " chars, out " + out.length + " chars) -- keeping original");
            } else if (pbpVideoPunctChanged([out], [b])) {
              // Cache only outputs that actually punctuated something: a
              // whitespace-only echo passes conservation, and caching it
              // poisons every later retry into the no-change guard (caught
              // live by the mock-Z discriminator, 2026-08-24).
              _aiBatchCache.set(b, out.trim());
              persistPunctBatch(sa, batches, b, out.trim());
            }
            outBatches.push(ok ? out.trim() : b);
            doneCount = outBatches.length;
            setAiRing(freshCur, freshTotal);
          }
          // A cancel during the LAST batch's round-trip must not commit
          // either (closing review F8): the loop-top check never runs again.
          if (_aiCancelRequested) {
            pbvSetStatus(status, t("mdVideoAiCancelled", String(outBatches.length), String(batches.length)), false);
            return;
          }
          // Partial success must NOT commit (audit B9): committing would
          // stamp aiPunct:true -- retiring the button across F5s -- over
          // batches that still carry heuristic text. Passed batches are
          // cached above, so the retry click only re-pays for the failures.
          if (rejected > 0) {
            pbvSetStatus(status, t("mdVideoAiPunctPartial", String(rejected), String(batches.length)), true);
            return;
          }
          // A pass that changed nothing must not commit: committing the
          // original text with aiPunct:true retires the button FOREVER (the
          // flag persists across F5) over words that never gained a mark --
          // the exact silent dead-end the device reported. Covers both "every
          // batch failed conservation" and "the model echoed its input".
          // The early return flows through the finally below: passDone stays
          // false, the label resets, the freeze releases -- the button
          // survives for a (free) retry.
          // Whitespace-normalized on BOTH sides: a model that only rewraps
          // lines "changed" the string while punctuating nothing, and
          // committing that would retire the button (aiPunct persists across
          // F5) over words that never gained a mark.
          if (!pbpVideoPunctChanged(outBatches, batches)) {
            console.info("[pbp-video] ai punctuation: pass produced no change ("
              + rejected + "/" + batches.length + " batches failed conservation) -- transcript kept, button stays");
            pbvSetStatus(status, t("mdVideoAiPunctFail"), true);
            return;
          }
          // Split on ANY newline run: the prompt asks for blank-line breaks
          // but models routinely emit single newlines, and the blank-line-only
          // split glued whole batches into one wall (device report: punctuated
          // but unbroken article). Overlong runs still split on sentence ends.
          // Snapshot BEFORE anything is overwritten -- _aiPunctParas is the
          // very next assignment, and a refused commit has to put the PRE-PASS
          // transcript back (paragraphs, rows and cached session alike), not
          // the pass it failed to save.
          const prev = captureTranscriptState();
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
            replayHighlight(); // B13
          } else {
            // Silent-half breadcrumb: the ARTICLE will carry the pass but the
            // timeline rows keep their pre-pass text (stream remap refused).
            console.warn("[pbp-video] ai punctuation: segment remap refused; rows keep pre-pass text");
          }
          // Done state: status line for the moment, title for posterity (the
          // copy-only branch keeps the retired button in the bar -- its title
          // is what carries "already punctuated" now that there is no label).
          pbvSetStatus(status, t("mdVideoAiPunctDone"), false);
          aiBtn.title = t("mdVideoAiPunctDone");
          aiBtn.setAttribute("aria-label", t("mdVideoAiPunctDone"));
          // The article IS this transcript on every video page that had
          // captions, so refresh it in place: md-preview.js owns the payload
          // write (account/tags/description contract), this file only hands it
          // the punctuated markdown and the runtime state an F5 needs to come
          // back to the SAME paragraphs instead of re-deriving heuristic ones.
          if (window.pbpVideoDoc && window.pbpVideoDoc.kind === "video-transcript"
              && typeof window.pbpVideoCommitTranscript === "function" && _segments.length) {
            const sess = window.pbpVideoSession || {};
            let ok = false, threwInCommit = false;
            // Same phase split as the track switch (review F2): argument
            // construction is inside the try so a throw is handled rather than
            // escaping the listener, but it happens BEFORE the await, and a
            // throw there is a PRE-persist failure that must take the rollback
            // arm.
            let phase = "build";
            try {
              const commitMd = pbpVideoTranscriptMarkdown(_segments, _meta, _aiPunctParas);
              const commitTitle = _meta.title || "";
              const videoState = pbpVideoStateBuild({
                detected, track: sess.track || null, tracks: sess.tracks || [],
                segments: _segments, aiParas: _aiPunctParas, wasUnpunct: _wasUnpunct,
                aiPunct: true, meta: _meta
              });
              phase = "commit";
              ok = await window.pbpVideoCommitTranscript(commitMd, commitTitle,
                { aiPunct: true, reason: "video-ai-punctuation", videoState });
            } catch (e) {
              threwInCommit = phase === "commit";
              console.warn("[pbp-video] ai-punctuation commit threw in", phase + ":", (e && e.name) || "", (e && e.message) || e);
            }
            // Same false/threw split as the track switch: `false` (or a
            // pre-commit throw) means storage and canonical were never
            // touched, so the panel goes back to the pre-pass transcript; a
            // throw from inside the committer means the payload is already
            // persisted and canonical already advanced, so rolling back would
            // create the fork instead of preventing it.
            if (ok || threwInCommit) {
              syncSessionToCommitted(sess.track || null, _wasUnpunct);
              // The pass is in the article now (pbpVideoDoc.aiPunct is true
              // either way -- the committer sets it before applying), so
              // re-offering it would only sell the same words twice. Hidden in
              // place: no reload does it for us any more.
              aiBtn.hidden = true;
              passDone = true;
              // The note beside the picker still said "basic punctuation"
              // (closing review F5) -- it describes an APPLIED pass now.
              if (_aiNoteEl) { _aiNoteEl.textContent = t("mdVideoAiPunctDone"); _aiNoteEl.hidden = false; }
            } else {
              restoreTranscriptState(prev);
            }
            // Same L1 gate as the track switch: threwInCommit means the
            // payload persisted -- only a true non-persist earns the quota copy.
            if (!ok && !threwInCommit) pbvSetStatus(status, t("mdPreviewQuotaFull"), true);
          } else {
            // Copy-only page: the transcript is not this page's article, so
            // there is nothing to commit and the Copy text already carries the
            // pass. Keep the finished label and retire the button.
            passDone = true;
          }
        } catch (e) {
          _aiPunctParas = null;
          // Cancel aborted the in-flight request (research T4.4): that is a
          // user action, not a provider failure -- same line as the
          // between-batch cancel, finished batches stay cached.
          if (_aiCancelRequested) {
            pbvSetStatus(status, t("mdVideoAiCancelled", String(doneCount), String(totalCount)), false);
            return;
          }
          console.warn("[pbp-video] ai punctuation:", (e && e.message) || e);
          // A declined/missing host grant has an actionable, localized
          // message of its own ("No access to ... Grant access and retry.")
          // -- the generic failure label hid exactly that from six real
          // clicks (device round 4).
          pbvSetStatus(status, (e && e.code === "host_permission" && e.message)
            ? e.message : t("mdVideoAiPunctFail"), true);
        } finally {
          // One place decides the button's resting state, so no exit path can
          // leave the label saying "Punctuated" over a pass that never
          // landed, or hand the control back while another transaction still
          // holds it: `passDone` latches the retirement, the release gives
          // back only this pass's own holds, and applyControlFreeze (called by
          // the release) re-derives `disabled` from both.
          if (passDone) _aiPassDone = true;
          // Fresh estimate on the resting label: after a partial failure the
          // cache holds the passed batches, so the retry title advertises
          // only the remaining cost (research T4.2).
          else applyAiCostTitle(aiBtn);
          aiBtn.removeAttribute("aria-busy");
          aiCancelBtn.hidden = true;
          setAiRing(null);
          releaseFreeze();
        }
      };
      aiBtn.addEventListener("click", () => {
        if (!_segments.length || aiBtn.disabled || _freezeAi > 0 || _aiPassDone) return;
        // (research T4.3) the commit this pass ends in replaces the article
        // wholesale: md-translate resets every filled translation and md-ask
        // greys every citation -- correct (paragraph boundaries move under
        // the pass), but before this gate it was also silent, and the
        // translation it wipes was paid for with the user's own tokens.
        // Paid work on screen gets a confirm; a clean page starts at once.
        // The confirm button's own click carries the user gesture the
        // pass's permissions.request needs.
        const hasPaidWork = !!document.querySelector("#rendered-view .pb-tr")
          || !!document.querySelector("#ask-thread .ask-chip:not(.stale)");
        if (hasPaidWork && typeof showConfirmPopover === "function") {
          showConfirmPopover(aiBtn, {
            msg: t("mdVideoAiPunctConfirm"),
            yesText: t("mdVideoAiPunct"),
            noText: t("cancel"),
            onConfirm: () => { runAiPass(); },
          });
          return;
        }
        runAiPass();
      });
      // Terminal-failure recovery (audit B2/B3): every caption dead end used
      // to strand the page with a status line and no control. One retry
      // button re-runs the load flow with a FRESH session; its click is a
      // real user gesture, so a missing/declined origin grant can be
      // re-requested right here (the decline path's way back in). refresh
      // icon per the icon contract: it re-runs this same action.
      const retryBtn = el("button", "pbv-retry");
      retryBtn.type = "button";
      retryBtn.hidden = true;
      retryBtn.innerHTML = typeof PBP_ICONS !== "undefined" ? PBP_ICONS.refresh : "";
      retryBtn.title = t("mdVideoRetry");
      retryBtn.setAttribute("aria-label", t("mdVideoRetry"));
      _retryBtnEl = retryBtn;
      retryBtn.addEventListener("click", async () => {
        if (retryBtn.disabled) return;
        retryBtn.disabled = true;
        retryBtn.hidden = true;
        try {
          let g = false;
          try { g = await chrome.permissions.contains({ origins: [originPat] }) === true; } catch (_) {}
          if (!g) g = await requestVideoOrigin(detected); // this click IS the gesture
          if (!g) { pbvSetStatus(status, t("mdVideoPermDeclined"), true); retryBtn.hidden = false; return; }
          window.pbpVideoSession = null; // force a fresh directory + captions
          pbvSetStatus(status, t("mdVideoLoading"), "busy");
          await loadFlow(detected, status, body, trackSel, copyBtn, aiBtn);
          if (!_segments.length) retryBtn.hidden = false;
        } catch (e) {
          console.warn("[pbp-video] retry:", (e && e.message) || e);
          pbvSetStatus(status, t("mdVideoFailed"), true);
          retryBtn.hidden = false;
        } finally {
          retryBtn.disabled = false;
        }
      });
      // Punctuation-state note (audit U1): filled by refreshAiOffer.
      const aiNote = el("span", "pbv-ai-note");
      aiNote.hidden = true;
      _aiNoteEl = aiNote;
      // Cancel for a running AI pass (audit U8): cross icon per the icon
      // contract (close/remove family). Deliberately OUTSIDE the freeze
      // family -- it must stay clickable while the pass holds the freeze.
      const aiCancelBtn = el("button", "pbv-ai-cancel");
      aiCancelBtn.type = "button";
      aiCancelBtn.hidden = true;
      aiCancelBtn.innerHTML = typeof PBP_ICONS !== "undefined" ? PBP_ICONS.cross : "";
      aiCancelBtn.title = t("mdVideoAiCancel");
      aiCancelBtn.setAttribute("aria-label", t("mdVideoAiCancel"));
      aiCancelBtn.addEventListener("click", () => {
        _aiCancelRequested = true;
        aiCancelBtn.disabled = true;
        if (_aiAbort) { try { _aiAbort.abort(); } catch (_) {} } // research T4.4
      });
      bar.appendChild(trackSel); bar.appendChild(auxSel); bar.appendChild(copyGroup); bar.appendChild(aiBtn); bar.appendChild(aiNote); bar.appendChild(aiCancelBtn); bar.appendChild(retryBtn);
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
        followBtn.innerHTML = PBV_FOLLOW_SVG;
        followBtn.title = t("mdVideoFollow");
        followBtn.setAttribute("aria-label", t("mdVideoFollow"));
        // starts hidden even in video-mode: a page whose captions never
        // arrive must not offer a follow control (final-review M6);
        // loadFlow unhides it when segments actually exist.
        followBtn.hidden = true;
        _followBtn = followBtn;
        setFollow(true); // default ON; also writes the initial aria-pressed
        followBtn.setAttribute("aria-keyshortcuts", "f");
        followBtn.addEventListener("click", () => setFollow(!_followOn));
        bar.appendChild(followBtn);
        // Learning loop (research T3.2/T3.3): repeat the current cue, pause
        // at every cue end, playback rate. Same 28px icon family; real
        // toggles in the aria-pressed vocabulary; unhidden with follow.
        const loopBtn = el("button", "pbv-loop");
        loopBtn.type = "button";
        loopBtn.hidden = true;
        loopBtn.innerHTML = PBV_LOOP_SVG;
        loopBtn.title = t("mdVideoLoop");
        loopBtn.setAttribute("aria-label", t("mdVideoLoop"));
        loopBtn.setAttribute("aria-pressed", "false");
        loopBtn.setAttribute("aria-keyshortcuts", "r");
        loopBtn.addEventListener("click", () => setLoop(!_loopOn));
        _loopBtn = loopBtn;
        bar.appendChild(loopBtn);
        const apBtn = el("button", "pbv-autopause");
        apBtn.type = "button";
        apBtn.hidden = true;
        apBtn.innerHTML = PBV_PAUSE_SVG;
        apBtn.title = t("mdVideoAutoPause");
        apBtn.setAttribute("aria-label", t("mdVideoAutoPause"));
        apBtn.setAttribute("aria-pressed", "false");
        apBtn.addEventListener("click", () => setAutoPause(!_autoPauseOn));
        _autoPauseBtn = apBtn;
        bar.appendChild(apBtn);
        const rateSel = document.createElement("select");
        rateSel.className = "pbv-tracks pbv-rate";
        rateSel.hidden = true;
        rateSel.setAttribute("aria-label", t("mdVideoRate"));
        rateSel.title = t("mdVideoRate");
        for (const r of [0.75, 1, 1.25, 1.5, 2]) {
          const o = document.createElement("option");
          o.value = String(r);
          o.textContent = r + "\u00d7";
          if (r === 1) o.selected = true;
          rateSel.appendChild(o);
        }
        rateSel.addEventListener("change", () => relaySetRate(Number(rateSel.value)));
        _rateSel = rateSel;
        bar.appendChild(rateSel);
        // Below the workspace's container breakpoint the columns stack and
        // the player stops being sticky -- a lit follow toggle there is a
        // no-op lie (audit B14). The COMPUTED sticky state is the layout
        // answer (research T7.7: the old hard-coded 1220 constant silently
        // drifted from the CSS breakpoint); re-read on every resize.
        // Hidden via a layout class so loadFlow's hidden-attribute
        // management stays untouched; highlightRowAt reads the same class.
        if (typeof ResizeObserver === "function") {
          const layoutHost = document.querySelector(".doc-body");
          if (layoutHost) {
            const ro = new ResizeObserver(() => {
              followBtn.classList.toggle("pbv-follow-narrow", !playerHoldsPosition());
            });
            ro.observe(layoutHost);
          }
        }
      }
      if (detected.provider === "bilibili") {
        // Estimate clock toggle (research T3.6): opt-in, labelled estimate.
        const estBtn = el("button", "pbv-estimate");
        estBtn.type = "button";
        estBtn.hidden = true;
        estBtn.innerHTML = PBV_CLOCK_SVG;
        estBtn.title = t("mdVideoEstimate");
        estBtn.setAttribute("aria-label", t("mdVideoEstimate"));
        estBtn.setAttribute("aria-pressed", "false");
        estBtn.addEventListener("click", () => setEstimate(!_estOn));
        _estBtn = estBtn;
        bar.appendChild(estBtn);
      }
      // Player-failure degrade for BOTH providers (audit U12: bilibili had
      // no way out when its embed or login wall misbehaved): an
      // always-present link to the ordinary watch page. Needs no failure
      // detection (a cross-origin iframe load can't be inspected) and
      // bounds the dependency by giving a working path regardless.
      const openExt = document.createElement("a");
      openExt.className = "action-btn pbv-open-ext";
      openExt.href = detected.provider === "bilibili"
        ? "https://www.bilibili.com/video/" + encodeURIComponent(detected.bvid) + "/" + (detected.part > 1 ? "?p=" + detected.part : "")
        : "https://www.youtube.com/watch?v=" + encodeURIComponent(detected.videoId);
      openExt.target = "_blank";
      openExt.rel = "noopener noreferrer";
      openExt.innerHTML = PBV_EXTERNAL_SVG;
      const extLabel = t(detected.provider === "bilibili" ? "mdVideoOpenExternalBili" : "mdVideoOpenExternal");
      openExt.title = extLabel;
      openExt.setAttribute("aria-label", extLabel);
      bar.appendChild(openExt);
      bar.appendChild(status);
      bar.appendChild(resume);
      // Video-mode workspaces already have an empty .pbv-list waiting in the
      // study column (mountVideoWorkspace built it); #video-panel then holds
      // only .pbv-media + .pbv-bar. The non-video defensive mount never set
      // _studyListEl, so it keeps building + keeping the list in-panel, as
      // before.
      const body = _studyListEl || el("div", "pbv-list");
      if (!_studyListEl) { // defensive mount: same list semantics as the workspace list (critic #6)
        body.setAttribute("role", "list");
        body.setAttribute("aria-label", t("mdVideoTimelineAria"));
      }
      bindFollowPause(body);
      bindRowClicks(body);
      // (research T7.2) replaceChildren is about to remove the poster the
      // user just activated; without a hand-off the focus silently falls to
      // <body> and the next Tab restarts from the top of the page (same
      // problem zen mode already solves for its own surface swap,
      // md-reader.js). Captured BEFORE the swap; re-checked at focus time
      // so a user who moved on meanwhile is never yanked back.
      const hadPosterFocus = document.activeElement === cta;
      const focusFell = () => !document.activeElement || document.activeElement === document.body;
      const focusBar = () => {
        if (!hadPosterFocus || !focusFell()) return;
        const target = [trackSel, copyBtn, aiBtn, retryBtn, openExt]
          .find((c) => c && !c.hidden && !c.disabled) || status;
        if (target === status) status.tabIndex = -1;
        try { target.focus({ preventScroll: true }); } catch (_) {}
      };
      panel.replaceChildren(media, bar);
      if (!_studyListEl) panel.appendChild(body);
      focusBar();
      // (The relay greeting arms itself from the iframe's load event above --
      // greeting an unloaded frame only ever produced console errors.)
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
        // Honest decline copy (audit B2): with the player mounted, "nothing
        // was loaded" contradicted the screen -- the video IS there, only the
        // captions are not. The retry button in the bar is the way back in
        // (its click can re-request the grant); the poster stays the entry
        // when the player never mounted.
        const playerUp = _iframe && _iframe.isConnected;
        pbvSetStatus(status, t(playerUp ? "mdVideoPermDeclined" : "mdVideoPermMissing"), true);
        cta.disabled = false;
        _runLoadEntered = false; // the retry click must be able to re-enter
        retryBtn.hidden = false;
        // Keep the PLAYER when it already mounted: privacy.md guarantees
        // the embed loads without the subtitle grant, so a decline must only
        // cost the captions, never tear the video out (final-review H2).
        if (playerUp) panel.replaceChildren(media, bar);
        else panel.replaceChildren(cta, bar);
        // (research T7.2) the retry button is the next action on this path;
        // hand focus there (or back to the restored poster) instead of
        // leaving it wherever the swap dropped it.
        if (hadPosterFocus && focusFell()) {
          const target = playerUp ? retryBtn : cta;
          try { target.focus({ preventScroll: true }); } catch (_) {}
        }
        return;
      }
      await loadFlow(detected, status, body, trackSel, copyBtn, aiBtn);
      // Any caption-less terminal state gets the retry control (audit B3):
      // loadFlow's failure exits only write a status line, and re-checking
      // is always safe here.
      if (!_segments.length) retryBtn.hidden = false;
    }

    // Same rejection net as the auto paths (audit B3): an unhandled throw
    // out of a click-started run left a permanent loading shell behind.
    cta.addEventListener("click", () => runLoad(true).catch((e) => {
      console.warn("[pbp-video] load:", (e && e.message) || e);
      if (statusRef) pbvSetStatus(statusRef, t("mdVideoFailed"), true);
      cta.disabled = false;
      _runLoadEntered = false;
      if (_retryBtnEl) _retryBtnEl.hidden = false; // closing review M2
      if (!statusRef) panel.replaceChildren(cta);
    }));
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
    // `!booted.hydrated` on purpose: an F5-hydrated session's granted:true
    // means "the payload carried caption data", NOT "the origin grant is
    // standing" -- it was restored from storage, and the user may have
    // revoked the permission since. Those pages fall through to the committed
    // branch below, whose contains() is the authoritative re-check and whose
    // revoked path keeps the poster card (the click that re-requests the
    // grant). Reaching runLoad first would instead mount the player and then
    // dead-end on "permission missing" with no way to ask again.
    if (booted && !booted.hydrated && pbpVideoSessionMatches(booted, detected) && booted.granted
        && booted.segments && booted.segments.length) {
      // No click means no click handler to swallow a rejection: an unhandled
      // one would leave the panel wedged mid-swap with no way back. Report it
      // where the user is looking, and if the swap never got as far as the
      // status line, put the poster card back as the retry entry.
      runLoad(false).catch((e) => {
        console.warn("[pbp-video] auto load:", (e && e.message) || e);
        _runLoadEntered = false; // closing review M2: catch must release the latch
        if (statusRef) { pbvSetStatus(statusRef, t("mdVideoFailed"), true); if (_retryBtnEl) _retryBtnEl.hidden = false; }
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
        _runLoadEntered = false; // closing review M2
        if (statusRef) { pbvSetStatus(statusRef, t("mdVideoFailed"), true); if (_retryBtnEl) _retryBtnEl.hidden = false; }
        else { cta.disabled = false; panel.replaceChildren(cta); }
      });
    } else if (window.pbpVideoDoc && window.pbpVideoDoc.kind === "video-fallback") {
      // Progressive first paint (device round 3, plan 丙-甲): the bootstrap no
      // longer blocks on the caption chain, so a granted user lands here with
      // the description as the article and NO session. Auto-boot the caption
      // chain in the background; when loadFlow's first-run promotion commit
      // lands, the article upgrades to the transcript IN PLACE (reload-free
      // on this runtime-ready page). contains() only -- an ungranted user
      // keeps the poster card, whose click is the granting gesture. This is
      // the SAME product semantics as before (grant standing -> opening a
      // video preview captures automatically), only no longer paid for at
      // first paint.
      (async () => {
        const originPat = detected.provider === "bilibili" ? BILI_ORIGIN : YT_ORIGIN;
        let g = false;
        try { g = await chrome.permissions.contains({ origins: [originPat] }) === true; } catch (_) {}
        if (g) await runLoad(false);
      })().catch((e) => {
        console.warn("[pbp-video] fallback auto load:", (e && e.message) || e);
        _runLoadEntered = false; // closing review M2
        if (statusRef) { pbvSetStatus(statusRef, t("mdVideoFailed"), true); if (_retryBtnEl) _retryBtnEl.hidden = false; }
        else { cta.disabled = false; panel.replaceChildren(cta); }
      });
    }
  };
})();
