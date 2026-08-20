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
// ── end PURE SECTION ──

// ── RUNTIME (chrome/fetch/DOM; md-preview only) ──
// Panel lives as a SIBLING above #rendered-view: translation re-renders
// replace renderedView's content and must never destroy the player.
(function () {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const YT_ORIGIN = "https://www.youtube.com/*";
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

  function renderTranscript(listEl, segments) {
    listEl.textContent = "";
    const frag = document.createDocumentFragment();
    segments.forEach((seg) => {
      const row = el("button", "pbv-row");
      row.type = "button";
      const time = el("span", "pbv-time", pbpVideoFmtTime(seg.from));
      const text = el("span", "pbv-text", seg.content);
      row.appendChild(time); row.appendChild(text);
      row.title = t("mdVideoSeekTo", pbpVideoFmtTime(seg.from));
      row.addEventListener("click", () => seekTo(Math.floor(seg.from)));
      frag.appendChild(row);
    });
    listEl.appendChild(frag);
  }

  async function loadFlow(detected, statusEl, bodyEl, trackSel, copyBtn) {
    statusEl.textContent = t("mdVideoLoading");
    let granted = false;
    try { granted = await chrome.permissions.request({ origins: [YT_ORIGIN] }) === true; } catch (_) {}
    if (!granted) { statusEl.textContent = t("mdVideoPermMissing"); return; }
    const uiLang = (chrome.i18n && chrome.i18n.getUILanguage && chrome.i18n.getUILanguage()) || "en";
    const res = await pbpYtFetchTranscript(detected.videoId, { uiLang });
    if (res.error === "player") { statusEl.textContent = t("mdVideoFailed"); return; }
    if (res.error === "no-tracks" || res.error === "caption-body") {
      statusEl.textContent = t("mdVideoNoTracks");
      if (!res.tracks) return;
    }
    if (!res.error) statusEl.textContent = "";
    // track picker
    trackSel.textContent = "";
    (res.tracks || []).forEach((tr) => {
      const opt = document.createElement("option");
      opt.value = tr.baseUrl;
      opt.textContent = tr.label + (tr.asr ? " (" + t("mdVideoAsr") + ")" : "");
      if (res.track && tr.baseUrl === res.track.baseUrl) opt.selected = true;
      trackSel.appendChild(opt);
    });
    trackSel.hidden = !(res.tracks || []).length;
    copyBtn.hidden = !(res.segments || []).length;
    _segments = res.segments || [];
    _meta.trackLabel = res.track ? res.track.label : "";
    if (_segments.length) renderTranscript(bodyEl, _segments);
    trackSel.addEventListener("change", async () => {
      statusEl.textContent = t("mdVideoLoading");
      const segs = await pbpYtFetchCaptionBody(trackSel.value);
      statusEl.textContent = segs.length ? "" : t("mdVideoNoTracks");
      _segments = segs;
      const sel = trackSel.selectedOptions && trackSel.selectedOptions[0];
      _meta.trackLabel = sel ? sel.textContent : "";
      copyBtn.hidden = !segs.length;
      renderTranscript(bodyEl, segs);
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
      _iframe.src = EMBED_BASE + "/embed/" + detected.videoId + "?enablejsapi=1&rel=0";
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
