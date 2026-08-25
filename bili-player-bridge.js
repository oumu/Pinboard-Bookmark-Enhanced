// bili-player-bridge.js -- playback-position bridge for the bilibili embed.
//
// A DYNAMIC content script: never in the manifest, registered by md-video.js
// (chrome.scripting.registerContentScripts, matches https://player.bilibili.com/*,
// all frames) only after the reader's own click granted that exact origin.
// player.bilibili.com is the embed the reader shows inside md-preview; it
// exposes no postMessage API, so this is the only way to know where the
// video is. Design:
//   - Inert until greeted. Nothing is read from the page and nothing is
//     posted until {pbpVideo:1, func:"hello"} arrives from window.parent
//     with origin chrome-extension://<this extension>. An embed on any other
//     site therefore carries a dormant listener and nothing else.
//   - Every report goes to that exact origin (never "*"), so no other page
//     can receive it; every command must come from window.parent at that
//     origin, so no other page can drive the player through it.
//   - Same message shapes as the YouTube relay (docs/yt-embed.html), so the
//     reader's one state machine serves both providers:
//       out: {pbpVideo:1, event:"ready"}
//            {pbpVideo:1, event:"time", t:<sec>, state:<0 ended|1 playing|2 paused|3 buffering>, d:<duration?>}
//       in:  {pbpVideo:1, func:"hello"|"seekTo"|"playVideo"|"pauseVideo"|"setPlaybackRate", args:[...]}
//   - Nothing about the video (title, url, cookies) is read or sent: only
//     currentTime / paused / ended / duration / playbackRate.
(() => {
  "use strict";
  if (window === window.top) return; // the embed only
  if (window.__pbpBiliBridge) return; // one bridge per document (re-injection guard)
  window.__pbpBiliBridge = 1;
  const EXT_ORIGIN = "chrome-extension://" + chrome.runtime.id;
  const EVENTS = ["play", "playing", "pause", "seeked", "ended", "ratechange", "waiting"];
  function onSeeking() {
    if (selfSeek) { selfSeek = false; return; }
    // A foreign seek: the resume jump if a play just happened, else the reader's own drag.
    if (seekGuard && performance.now() - lastPlayAt > 1500) seekGuard = null;
  }
  function onPlay() { lastPlayAt = performance.now(); }
  let armed = false, timer = 0, bound = null;
  // Seek guard: the embed's own continue-watching logic jumps to ITS
  // remembered position on the document's first play, overriding a seek
  // made just before it (probed live 2026-08-25: seek 77 + play -> 577).
  // Narrow on purpose (review): armed for 3s after OUR seek only, it corrects
  // a move away from the target only when that move rides a play (within
  // 1.5s of a play event -- the resume jump's signature); any other foreign
  // seek in that window is the reader's own scrubber and disarms it.
  let seekGuard = null, selfSeek = false, lastPlayAt = -1e9;

  // The player renders a plain <video>; bwp-video is bilibili's WASM
  // fallback element, which mirrors the media element API this uses.
  const media = () => document.querySelector("video, bwp-video");
  const stateOf = (m) => m.ended ? 0 : (m.paused ? 2 : (m.readyState < 3 ? 3 : 1));
  const post = (msg) => { try { window.parent.postMessage(msg, EXT_ORIGIN); } catch (_) {} };
  function postTime() {
    const m = bind();
    if (!m) return;
    const t = m.currentTime;
    if (typeof t !== "number" || !isFinite(t)) return;
    const d = m.duration;
    const msg = { pbpVideo: 1, event: "time", t: t, state: stateOf(m) };
    if (typeof d === "number" && isFinite(d) && d > 0) msg.d = d;
    post(msg);
  }
  function stopTimer() { if (timer) { clearInterval(timer); timer = 0; } }
  // One report on every state change (the position at the moment playback
  // stopped is the true resting one), 250ms reports while playing.
  function guardSeek(m) {
    if (!seekGuard || m.seeking) return;
    if (seekGuard.tries >= 2 || performance.now() > seekGuard.until) { seekGuard = null; return; }
    if (Math.abs(m.currentTime - seekGuard.target) > 2) {
      if (performance.now() - lastPlayAt > 1500) return; // not the resume jump: leave it alone
      seekGuard.tries++;
      selfSeek = true;
      try { m.currentTime = seekGuard.target; } catch (_) { selfSeek = false; }
    } else if (!m.paused) {
      seekGuard = null; // playing at the target: settled
    }
  }
  function onState() {
    const m = media();
    if (m) guardSeek(m);
    stopTimer();
    postTime();
    if (m && !m.paused && !m.ended) timer = setInterval(postTime, 250);
  }
  // The player boots asynchronously and may swap its media element on a
  // quality change: (re)bind to whatever element is current.
  function bind() {
    const m = media();
    if (!m) return null;
    if (m !== bound) {
      if (bound) { for (const ev of EVENTS) bound.removeEventListener(ev, onState); bound.removeEventListener("seeking", onSeeking); bound.removeEventListener("play", onPlay); }
      bound = m;
      for (const ev of EVENTS) m.addEventListener(ev, onState);
      m.addEventListener("seeking", onSeeking);
      m.addEventListener("play", onPlay); // before onState's own play handler runs guardSeek
    }
    return m;
  }
  function arm() {
    if (armed) return;
    armed = true;
    if (!bind()) {
      const mo = new MutationObserver(() => { if (bind()) { mo.disconnect(); onState(); } });
      mo.observe(document.documentElement, { childList: true, subtree: true });
    } else {
      onState();
    }
  }
  window.addEventListener("message", (e) => {
    if (e.source !== window.parent || e.origin !== EXT_ORIGIN) return;
    const d = e.data;
    if (!d || typeof d !== "object" || d.pbpVideo !== 1 || typeof d.func !== "string") return;
    if (d.func === "hello") { arm(); post({ pbpVideo: 1, event: "ready" }); return; }
    if (!armed) return;
    const m = bind();
    if (!m) return;
    const a = Array.isArray(d.args) ? d.args : [];
    switch (d.func) {
      case "seekTo": {
        const s = Number(a[0]);
        if (isFinite(s)) {
          const target = Math.max(0, s);
          seekGuard = { target: target, until: performance.now() + 3000, tries: 0 };
          selfSeek = true;
          try { m.currentTime = target; } catch (_) { selfSeek = false; }
          postTime();
        }
        break;
      }
      case "playVideo": {
        // A rejected play() (autoplay policy) leaves the element paused; the
        // report after it tells the reader the truth instead of a claim.
        try { const p = m.play(); if (p && typeof p.catch === "function") p.catch(() => postTime()); } catch (_) {}
        break;
      }
      case "pauseVideo": { try { m.pause(); } catch (_) {} break; }
      case "setPlaybackRate": {
        const r = Number(a[0]);
        if (r >= 0.25 && r <= 2) { try { m.playbackRate = r; } catch (_) {} }
        break;
      }
      default: break; // closed verb set: anything else is ignored
    }
  });
})();
