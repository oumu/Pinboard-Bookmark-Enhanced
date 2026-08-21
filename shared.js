// ============================================================
// Pinboard Bookmark Enhanced - Shared Constants
// ============================================================

const ADAPTIVE_THEME_MAP = {
  flexoki: ["flexoki-light", "flexoki-dark"],
  solarized: ["solarized-light", "solarized-dark"],
  catppuccin: ["catppuccin-latte", "catppuccin-mocha"]
};

const TEXTAREA_MIN_HEIGHT = 54;
const TEXTAREA_MAX_HEIGHT = 300;
const TAG_CACHE_TTL = 10 * 60 * 1000; // 10 minutes
const OVERLAY_BYTE_LIMIT = 50 * 1024;
const PBP_JINA_ORIGIN_PATTERN = "https://r.jina.ai/*";
const PBP_VOCAB_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.appdata";
const PBP_VOCAB_DRIVE_ORIGIN_PATTERN = "https://www.googleapis.com/*";

function pbpVocabDriveOAuthActive(manifest) {
  const permissions = Array.isArray(manifest?.optional_permissions)
    ? manifest.optional_permissions : [];
  const scopes = Array.isArray(manifest?.oauth2?.scopes)
    ? manifest.oauth2.scopes : [];
  const hosts = Array.isArray(manifest?.optional_host_permissions)
    ? manifest.optional_host_permissions : [];
  return permissions.includes("identity") &&
    typeof manifest?.oauth2?.client_id === "string" &&
    manifest.oauth2.client_id.trim().length > 0 &&
    scopes.length === 1 && scopes[0] === PBP_VOCAB_DRIVE_SCOPE &&
    (hosts.includes(PBP_VOCAB_DRIVE_ORIGIN_PATTERN) || hosts.includes("*://*/*"));
}
// Inline SVG icons -- replace emoji/color-glyphs that trigger a 1-3s Segoe UI Emoji
// font-load stall on Windows high-DPI Chrome (DirectWrite system-font enumeration,
// cached process-wide after first paint). currentColor = inherits theme text color.
// Path data: Lucide v0.525.0 (ISC, https://lucide.dev) -- ONE upstream pack for every
// icon so strokes/caps/corners match by construction; do not hand-draw additions,
// pull them from the same Lucide version. 24-box viewBox, stroke-width 2, rendered
// at the per-key width below (call-site CSS may override). The only exception is the
// Obsidian brand gem. No <text> nodes ever (CJK glyphs would re-trigger the font stall).
const PBP_ICONS = {
  eye: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>',
  eyeOff: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><path d="m2 2 20 20"/></svg>',
  robot: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>',
  tabs: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M10 4v4"/><path d="M2 8h20"/><path d="M6 4v4"/></svg>',
  pin: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg>',
  doc: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>',
  pencil: '<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg>',
  check: '<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  cross: '<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
  warning: '<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>',
  info: '<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>',
  download: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/></svg>',
  copy: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>',
  // Same gem as export-targets.js's Obsidian mark, rescaled 24 -> 16 by an exact
  // x2/3 on every coordinate. It is the only icon here that was drawn in the
  // 24-box reader family; at 14px its stroke read lighter than its neighbours.
  obsidian: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2h8l2.7 4L8 14.7 1.3 6Z"/><path d="M7.3 2 5.3 6l2.7 8.7L10.7 6 8.7 2"/><path d="M1.3 6h13.4"/></svg>',
  arrowDown: '<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
  gear: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>',
  logout: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/></svg>',
  plus: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>',
  minus: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/></svg>',
  stop: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/></svg>',
  keyboard: '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 8h.01"/><path d="M12 12h.01"/><path d="M14 8h.01"/><path d="M16 12h.01"/><path d="M18 8h.01"/><path d="M6 8h.01"/><path d="M7 16h10"/><path d="M8 12h.01"/><rect width="20" height="16" x="2" y="4" rx="2"/></svg>',
  widthCycle: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 8 4 4-4 4"/><path d="M2 12h20"/><path d="m6 8-4 4 4 4"/></svg>',
  zen: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 15 6 6"/><path d="m15 9 6-6"/><path d="M21 16v5h-5"/><path d="M21 8V3h-5"/><path d="M3 16v5h5"/><path d="m3 21 6-6"/><path d="M3 8V3h5"/><path d="M9 9 3 3"/></svg>',
  explain: '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>',
  translate: '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/></svg>',
  viewMode: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M12 3v18"/></svg>',
  extOpen: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>',
  book: '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/></svg>',
  ask: '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>',
  speaker: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/><path d="M16 9a5 5 0 0 1 0 6"/><path d="M19.364 18.364a9 9 0 0 0 0-12.728"/></svg>',
  checkCircle: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.801 10A10 10 0 1 1 17 3.335"/><path d="m9 11 3 3L22 4"/></svg>',
  rotateCcw: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>',
  arrowUp: '<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>',
  lock: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
  trash: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>',
  send: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/><path d="m21.854 2.147-10.94 10.939"/></svg>',
  help: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>',
  bookmarkPlus: '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/><line x1="12" x2="12" y1="7" y2="13"/><line x1="15" x2="9" y1="10" y2="10"/></svg>',
  bookMarked: '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2v8l3-3 3 3V2"/><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20"/></svg>',
  arrowRightLeft: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/></svg>',
  clockArrowDown: '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6v6l2 1"/><path d="M12.337 21.994a10 10 0 1 1 9.588-8.767"/><path d="m14 18 4 4 4-4"/><path d="M18 14v8"/></svg>',
  clockArrowUp: '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6v6l1.56.78"/><path d="M13.227 21.925a10 10 0 1 1 8.767-9.588"/><path d="m14 18 4-4 4 4"/><path d="M18 22v-8"/></svg>',
  arrowDownAZ: '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 16 4 4 4-4"/><path d="M7 20V4"/><path d="M20 8h-5"/><path d="M15 10V6.5a2.5 2.5 0 0 1 5 0V10"/><path d="M15 14h5l-5 6h5"/></svg>',
  arrowDownZA: '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 16 4 4 4-4"/><path d="M7 4v16"/><path d="M15 4h5l-5 6h5"/><path d="M15 20v-3.5a2.5 2.5 0 0 1 5 0V20"/><path d="M20 18h-5"/></svg>',
};

// Render "<check|cross icon> text" into a status element. The SVG uses currentColor so
// it inherits the element's success/error colour. Replaces literal ✓/✗ glyphs, which
// fall back to Segoe UI Emoji and stall ~1.6s on first paint (Windows hi-DPI). The label
// goes through a text node, so interpolated values (errors, results) can't inject HTML.
function setStatusIcon(el, ok, text) {
  if (!el) return;
  const state = ok ? "ok" : "bad";
  el.classList.toggle("ok", !!ok);
  el.classList.toggle("bad", !ok);
  const ic = document.createElement("span");
  ic.className = "status-ic " + state;
  ic.innerHTML = ok ? PBP_ICONS.check : PBP_ICONS.cross;
  el.replaceChildren(ic, document.createTextNode(" " + (text != null ? String(text) : "")));
}

// Set a button's content to "icon + label" without losing the SVG icon. Use this
// instead of `btn.textContent = label` on buttons that carry a .btn-ic SVG span,
// otherwise textContent wipes the icon. iconKey is a PBP_ICONS key; label is plain text.
function setBtnIcon(btn, iconKey, label) {
  if (!btn) return;
  const svg = PBP_ICONS[iconKey] || "";
  btn.innerHTML = '<span class="btn-ic">' + svg + '</span><span>' + "" + '</span>';
  // label set via textContent on the label span to avoid any HTML injection
  btn.lastElementChild.textContent = label != null ? String(label) : "";
}

function setupSecretToggles(root) {
  (root || document).querySelectorAll(".key-toggle").forEach((btn) => {
    if (btn.dataset.secretToggleReady === "1") return;
    btn.dataset.secretToggleReady = "1";
    btn.innerHTML = PBP_ICONS.eye;
    btn.setAttribute("aria-pressed", "false");
    btn.addEventListener("click", () => {
      const input = $id(btn.dataset.target);
      if (!input) return;
      const reveal = input.type === "password";
      input.type = reveal ? "text" : "password";
      btn.innerHTML = reveal ? PBP_ICONS.eyeOff : PBP_ICONS.eye;
      btn.setAttribute("aria-pressed", String(reveal));
    });
  });
}

function pbpOverlayByteLength(value) {
  return new TextEncoder().encode(value).byteLength;
}

function pbpAssertOverlaySize(value) {
  if (pbpOverlayByteLength(value) > OVERLAY_BYTE_LIMIT) {
    throw new RangeError("Custom CSS exceeds the 50 KB UTF-8 limit");
  }
}

// Escape HTML entities for safe embedding in <blockquote>. Pure string ops so it
// works in BOTH the service worker (no document) and page contexts.
function escapeForExtended(text) {
  if (!text) return "";
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Max AI tags to keep (enforced in refineTags; also stated in DEFAULT_TAG_PROMPT).
const AI_TAG_CAP = 8;

// Shared tag-quality guidance, reused by DEFAULT_TAG_PROMPT and buildCombinedPrompt.
// Pushes the model toward the page's specific defining identity; deliberately does
// NOT mention rating/ranking/comparison — "what it DOES" covers those generically.
const TAG_GUIDANCE = `Choose tags that capture this page's specific identity, not just its broad category:
- Include the single most specific term that identifies what this page or site IS and what it DOES — the term someone in its niche would actually use to find it — even if it is uncommon or you have to coin it (a broad category like "ai" is the genus; also give the differentia, e.g. "llm_proxy" instead of stopping at "ai").
- Avoid over-generic catch-all tags (ai, api, tools, web, service, software, app, productivity, online) unless no more specific term fits.
- Order tags from most specific/defining to most general.
- Established English technical terms and product names stay in English even when tagging in another language; translate only general-topic words.
- If the content is an error page, verification wall (e.g. Cloudflare check), login/consent screen or an empty shell, give NO tags at all (an empty list) — never tag the failure page itself.`;

const DEFAULT_TAG_PROMPT = `Suggest up to ${AI_TAG_CAP} bookmark tags for the following webpage. {{lang_instruction}} Tags should be lowercase, {{separator_instruction}}.

${TAG_GUIDANCE}

Return ONLY a JSON array.

Title: {{title}}
URL: {{url}}
Content: {{content}}

Format: ["tag1","tag2"]`;

// Recall-oriented bookmark note, NOT a reading-comprehension summary
// (that is the reader's skim layer). Research grounding (popup-AI
// campaign 2026-07): indicative-abstract framing ("what this is and what
// it is for") serves re-finding; KFTF: bookmarks die without a context-
// of-relevance note; CoD: 1-2 distinguishing specifics beat generic
// coverage at this length; title-restating and filler openers add zero
// recall value; proper nouns stay untranslated (zh user reading en
// pages); language instruction repeated at the end (two shipped products
// lost the language setting mid-prompt).
const DEFAULT_SUMMARY_PROMPT = `You are writing a bookmark note, not an article summary. It will be read months from now by someone scanning their bookmark list to recall what this page is and why it was saved. {{lang_instruction}}

Write 2-4 sentences:
- Start with what kind of page this is (tool, paper, tutorial, essay, reference, product page...) and what it is for - phrased naturally, not as a label.
- Then give the 1-2 specific details that distinguish this page from others of its kind: concrete names, methods, claims or numbers, not generic descriptors.
- Do not restate or rephrase the title - the note is shown right under it; add what the title does not already say.
- Never open with filler like "This article discusses". Use a neutral third-party voice; do not echo the page's own marketing tone.
- Keep product names, project names and technical terms in their original language - do not translate proper nouns.

Title: {{title}}
Content: {{content}}

Reminder: {{lang_instruction}} Output only the 2-4 sentence note itself - no preamble, no quotes.`;

// Simple obfuscation for API keys stored in chrome.storage
// Not real encryption — prevents casual plaintext reading
function obfuscateKey(key) {
  if (!key) return "";
  try { return "obf:" + btoa(unescape(encodeURIComponent(key))); } catch (_) { return key; }
}
function deobfuscateKey(val) {
  if (!val) return "";
  // Loop-strip up to 4 layers to handle legacy double-wrapped keys
  // (pre-fix save path could re-obfuscate an already-obfuscated value).
  for (let i = 0; i < 4 && typeof val === "string" && val.startsWith("obf:"); i++) {
    try { val = decodeURIComponent(escape(atob(val.substring(4)))); } catch (_) { return val; }
  }
  return val;
}

// Returns the exact Chrome host-permission pattern for a network endpoint.
// Plain HTTP is accepted only for the three literal loopback host spellings;
// URL() normalizes alternate IPv4/IPv6 forms, so inspect the raw authority too.
function pbpEndpointOriginPattern(raw) {
  try {
    const text = String(raw == null ? "" : raw).trim();
    const u = new URL(text);
    const authority = text.match(/^https?:\/\/([^/?#]*)(?:[/?#]|$)/i);
    if ((u.protocol !== "https:" && u.protocol !== "http:") || !authority || authority[1].includes("@") ||
        /(?:\*|%2a)/i.test(authority[1]) || /(?:\*|%2a)/i.test(u.hostname) || u.username || u.password) return null;
    if (u.protocol === "http:") {
      if (!/^(?:(?:localhost|127\.0\.0\.1)(?::\d+)?|\[::1\](?::\d+)?)$/.test(authority[1])) return null;
    }
    return u.origin + "/*";
  } catch (_) {
    return null;
  }
}

function pbpIsAllowedPinboardApiUrl(raw) {
  try {
    const u = new URL(String(raw == null ? "" : raw));
    return pbpEndpointOriginPattern(raw) === "https://api.pinboard.in/*"
      && !u.port
      && u.pathname.startsWith("/v1/");
  } catch (_) {
    return false;
  }
}

// Authorize a popup-originated Pinboard API URL against the current account.
// The caller may hold an older token for the same account; replace it with the
// current token. Logout, account switch, duplicate tokens, or malformed URLs
// fail closed without returning a network target.
function pbpAuthorizePinboardApiUrl(raw, currentToken) {
  if (!pbpIsAllowedPinboardApiUrl(raw)) return "";
  try {
    const url = new URL(raw);
    const supplied = url.searchParams.getAll("auth_token");
    const token = deobfuscateKey(currentToken);
    if (supplied.length !== 1 || !token) return "";
    const suppliedAccount = pbpPinboardAccountFromToken(supplied[0]);
    const currentAccount = pbpPinboardAccountFromToken(token);
    if (!suppliedAccount || suppliedAccount !== currentAccount) return "";
    url.searchParams.set("auth_token", token);
    return url.toString();
  } catch (_) {
    return "";
  }
}

function pbpOptionsUrl(panel) {
  const p = /^[a-z0-9-]+$/.test(String(panel || "")) ? String(panel) : "general";
  const path = "options.html#" + p;
  return (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getURL)
    ? chrome.runtime.getURL(path)
    : path;
}

// Opens one of the extension's own pages, reusing the tab already showing it
// instead of stacking a duplicate on every click, and only then moving its
// hash. Generalised from the options-only version below, which every other
// entry point (popup's library link, the reader's vocabulary and notebook
// openers) used to skip -- so those piled up a fresh library.html per click.
// Returns false when no tab could be opened, so callers can fall back.
async function pbpOpenExtensionTab(page, hash) {
  const name = /^[a-z0-9-]+\.html$/.test(String(page || "")) ? String(page) : "options.html";
  const frag = /^[a-z0-9-]+$/.test(String(hash || "")) ? "#" + String(hash) : "";
  const base = (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getURL)
    ? chrome.runtime.getURL(name)
    : name;
  const url = base + frag;
  try {
    if (chrome && chrome.tabs && chrome.tabs.query && chrome.tabs.update) {
      const tabs = await chrome.tabs.query({});
      const hit = (tabs || []).find((tab) => tab && typeof tab.url === "string" && tab.url.startsWith(base));
      if (hit && hit.id != null) {
        await chrome.tabs.update(hit.id, { url, active: true });
        if (hit.windowId != null && chrome.windows && chrome.windows.update) {
          try { await chrome.windows.update(hit.windowId, { focused: true }); } catch (_) {}
        }
        return true;
      }
    }
  } catch (_) {}
  try {
    if (chrome && chrome.tabs && chrome.tabs.create) {
      await chrome.tabs.create({ url });
      return true;
    }
  } catch (_) {}
  return false;
}

async function pbpOpenOptionsTab(panel) {
  const p = /^[a-z0-9-]+$/.test(String(panel || "")) ? String(panel) : "general";
  if (await pbpOpenExtensionTab("options.html", p)) return;
  // Last resort: no tabs API at all (content-script-ish context).
  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
}

// ---- Tag merge helper (pure function for union with dedup) ----
// Merges two space-separated tag strings (existing, new), deduplicates case-insensitively,
// preserves existing tag casing for duplicates, and appends unique new tags.
// Returns a space-separated string of merged tags.
function unionTags(existingStr, newStr) {
  const existing = (existingStr || "").split(/\s+/).filter(Boolean);
  const newTags = (newStr || "").split(/\s+/).filter(Boolean);

  // Map of normalized tag → preferred (existing) casing
  const seenNorm = {};
  const result = [];

  for (const tag of existing) {
    const norm = tag.toLowerCase();
    if (!seenNorm[norm]) {
      seenNorm[norm] = tag;
      result.push(tag);
    }
  }

  for (const tag of newTags) {
    const norm = tag.toLowerCase();
    if (!seenNorm[norm]) {
      seenNorm[norm] = tag;
      result.push(tag);
    }
  }

  return result.join(" ");
}

// Resolve a per-URL cache duration (minutes from settings) to milliseconds.
// CRITICAL: a deliberate 0 means "cache disabled" (options.html "Set 0 to disable.")
// — DO NOT use `|| 60` anywhere, it eats the 0. Only null/undefined/NaN/"" → default.
function resolveCacheMs(cacheDuration) {
  const n = (cacheDuration === null || cacheDuration === undefined || cacheDuration === "")
    ? NaN : Number(cacheDuration);
  if (Number.isNaN(n)) return 60 * 60 * 1000;   // default 60 min
  if (n <= 0) return 0;                          // 0 (or negative) = disabled
  return n * 60 * 1000;
}

// Check if a cache entry {result, timestamp} has exceeded its TTL. Pure; testable without chrome.storage.
function isStaleCacheEntry(entry, now, ttlMs) {
  if (!entry || typeof entry !== "object") return true;
  return (now - (entry.timestamp || 0)) > ttlMs;
}

const SETTINGS_DEFAULTS = {
  pinboardToken: "",
  aiProvider: "gemini",
  geminiApiKey: "", geminiModel: "gemini-3.5-flash-lite",
  openaiApiKey: "", openaiModel: "gpt-5.4-nano", openaiBaseUrl: "https://api.openai.com/v1",
  claudeApiKey: "", claudeModel: "claude-haiku-4-5",
  deepseekApiKey: "", deepseekModel: "deepseek-v4-flash",
  qwenApiKey: "", qwenModel: "qwen-flash",
  minimaxApiKey: "", minimaxModel: "MiniMax-M2",
  openrouterApiKey: "", openrouterModel: "openai/gpt-oss-20b:free",
  groqApiKey: "", groqModel: "llama-3.1-8b-instant",
  mistralApiKey: "", mistralModel: "mistral-small-latest",
  cohereApiKey: "", cohereModel: "command-r7b-12-2024",
  siliconflowApiKey: "", siliconflowModel: "Qwen/Qwen3-8B",
  zhipuApiKey: "", zhipuModel: "glm-4.7-flash",
  kimiApiKey: "", kimiModel: "kimi-k2.6",
  githubModelsApiKey: "", githubModelsModel: "openai/gpt-4.1-mini",
  ollamaBaseUrl: "http://localhost:11434", ollamaModel: "llama3.2",
  customApiKey: "", customModel: "", customBaseUrl: "", customName: "Custom",
  aiTagLang: "en", aiSummaryLang: "auto", aiCacheDuration: 60,
  aiContentSource: "local", jinaApiKey: "",
  customTagPrompt: "", customSummaryPrompt: "",
  optPrivateDefault: false, optPrivateIncognito: true, optReadlaterDefault: false,
  optAutoDescription: true, optBlockquote: true, optIncludeReferrer: false,
  optAiAutoTags: false,
  qsAutoNotes: true, qsBlockquote: true, qsDefaultTags: "", qsAiTags: false, qsAiSummary: false,
  rlAutoNotes: true, rlBlockquote: true, rlDefaultTags: "", rlAiTags: false, rlAiSummary: false,
  optBatchTagEnabled: true, optBatchTag: "batch_saved",
  batchAiTags: false, batchAiSummary: false, batchSkipExisting: false,
  optLang: "auto",
  optShowRecent: false, optShowSearch: false, optTheme: "auto",
  notifyQuickSave: true, notifyReadLater: true,
  notifyTabSet: true, notifyBatchSave: true, notifyErrors: true,
  customFont: "",
  optRespectTagCase: true, aiTagSeparator: "-",
  offlineQueueEnabled: true, optShowBadge: false,
  tagSyncMode: "cached", // "fresh" | "cached" | "prewarmed"
  optCheckBookmarkStatus: true, optShowSuggestTags: true,
  optShowAiSummary: true, optShowAiTags: true,
  optShowQuickLinks: true, optShowQuickRow: true,
  tagPresets: "", optAutoCloseAfterSave: true,
  themePresetKey: "", optPopupFollowTheme: true,
  popupWidth: 550,
  mdExportFrontmatter: true, mdExportImagePolicy: "keep", mdExportIncludeToc: false,
  mdExportIncludeHighlights: true,
  // Default-on: attaches author/published/site/image/words to export meta when
  // available. Off = byte-identical legacy exports (X4).
  mdExportExtendedMeta: true,
  obsidianEnabled: false, obsidianVault: "", obsidianFolder: "",
  // Registry-driven "Send to ▾" per-target config (Obsidian, GitHub Gist, …).
  // MUST live here: options loads settings via get(SETTINGS_DEFAULTS), so a key
  // absent from this object is never fetched — the card renders empty on reload
  // and a subsequent save overwrites the stored value (github had no legacy
  // mirror to fall back on, unlike obsidian*).
  exportTargets: {},
  urlClean: { enabled: true, onPopupOpen: true, onPaste: true, aggressiveMode: false, customParams: [], excludeParams: [] },
  // pinboard.in tag-page "sort by popularity" control (site enhancement, default on)
  tagSortByPopEnabled: true,
  bgSaveMode: "merge", // "merge" | "skip" | "overwrite"
  waybackArchiveEnabled: false,
  waybackArchiveBatch: false,
  waybackSkipPrivate: true,
  waybackS3Key: "",
  waybackS3Secret: "",
  backupIncludeHighlights: true,
  // md-preview in-page AI (explain / ask / translate)
  previewAiEnabled: true,
  // R11 skim layer (key-points summary): default OFF, unlike previewAiEnabled --
  // generation runs automatically on every article open (no user click per
  // use), so it spends AI tokens without an explicit per-use invocation. The
  // user must opt in explicitly (spec: docs/superpowers/specs/2026-07-07-skim-layer-design.md).
  previewSkimEnabled: false,
  previewAiModel: "",
  // Per-provider preview model override map {providerId: model}. previewAiModel
  // above is the legacy single-key value (provider unknown); it applies only for
  // providers the map has never recorded (see pbpAiResolveModelOverride).
  previewAiModelByProvider: {},
  translateTargetLang: "auto",
  translateGlossary: "",
  dictEchoEnabled: true,    // md-vocab-echo: underline saved vocab words in the reader
  dictAnkiDeck: "Pinboard Vocab", // anki-connect: target deck for Send to Anki
  dictAnkiPort: "8765",         // anki-connect: AnkiConnect port (host stays loopback-only)
  dictAnkiKey: "",              // anki-connect: optional AnkiConnect API key (credential)
  dictEudicToken: "",           // eudic-sync: Eudic OpenAPI authorization (credential)
  // md-video: opt into sending YouTube login cookies with the watch-page
  // scrape to raise the caption hit rate on login-gated videos. Off by
  // default (privacy).
  mdVideoUseLogin: true,
  selectionTrigger: "icon"
};

// These SETTINGS_DEFAULTS values are stored through the large-value codec when
// sync is enabled. Keep this list shared by persistence, reads, and cache
// invalidation so physical chunk keys never leak into business code.
const PBP_CHUNKED_SETTING_KEYS = ["customTagPrompt", "customSummaryPrompt", "translateGlossary", "tagPresets"];
const PBP_LARGE_FALLBACK_FIELDS = Object.freeze({
  customTagPrompt: "labelTagPrompt",
  customSummaryPrompt: "labelSummaryPrompt",
  translateGlossary: "translateGlossaryLabel",
  tagPresets: "labelTagPresets",
  customOverlayCSS: "labelCustomCSSOverlay",
  savedThemes: "labelSavedThemes",
});
const PBP_LARGE_FALLBACK_KEYS = new Set(
  Object.keys(PBP_LARGE_FALLBACK_FIELDS).map((key) => `${key}_localFallback`)
);

function pbpDetectLargeLocalFallbacks(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return [];
  return Object.keys(PBP_LARGE_FALLBACK_FIELDS).filter((key) =>
    Object.prototype.hasOwnProperty.call(snapshot, `${key}_localFallback`));
}

function pbpLargeFallbackFieldLabel(key) {
  return PBP_LARGE_FALLBACK_FIELDS[key] || key;
}

// True iff a storage.onChanged `changes` object touched at least one real
// setting key. Transient keys (_pbRateLimitTs, offlineQueue, caches, _wayback*,
// _suggestSweepTs, migration backups) are NOT in SETTINGS_DEFAULTS, so they
// return false — letting the SW keep its warm _settingsCache.
function pbpSettingsKeysChanged(changes) {
  if (!changes || typeof changes !== "object") return false;
  for (const k of Object.keys(changes)) {
    if (k === "syncApiKeys" || k === "optSyncEnabled" || Object.prototype.hasOwnProperty.call(SETTINGS_DEFAULTS, k)) return true;
    if (PBP_CHUNKED_SETTING_KEYS.some((key) => k.startsWith(`${key}_`))) return true;
  }
  return false;
}

// Whether a storage event can change this device's effective Pinboard token.
// `state` is the fresh routing state after the event.
function pbpAuthStorageChangeIsRelevant(changes, area, state) {
  if (!changes || (area !== "local" && area !== "sync")) return false;
  if (area === "local" && changes.optSyncEnabled) return true;
  const optSyncEnabled = state?.optSyncEnabled === true;
  const syncApiKeys = state?.syncApiKeys === true;
  if (!optSyncEnabled) return area === "local" && !!changes.pinboardToken;
  if (area === "sync" && changes.syncApiKeys) return true;
  const tokenArea = syncApiKeys ? "sync" : "local";
  return area === tokenArea && !!changes.pinboardToken;
}

// Frequency-sorted tag list from a counts map (desc by count, name as
// tiebreak). Single source for the popup's allUserTags ordering AND the
// SW quick-save/batch AI prompts (audit A14) - the top-50 slice fed to
// "Existing tags (prefer reusing...)" must be the same list everywhere.
function pbpTagsByCount(counts) {
  return Object.entries(counts || {})
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([tag]) => tag);
}

// Reorder a frequency-sorted tag list so tags lexically related to the
// CURRENT page (title/URL tokens) come first; frequency order is
// preserved within each group (campaign B3). The top-50 slice fed to the
// AI reuse line used to be blind to which bookmark is being tagged; the
// two reference implementations either abandoned pure frequency (vector
// similarity) or pair frequency with a hard constraint - this is the
// zero-dependency middle. Latin words match against the page's word SET
// (exact tokens, so "ai" never matches inside "maintain"); CJK parts
// match by substring (CJK titles have no word boundaries).
function pbpRelevantTagsFirst(tags, title, url) {
  if (!Array.isArray(tags)) return [];
  const hay = (String(title || "") + " " + String(url || "")).toLowerCase();
  if (!hay.trim()) return tags;
  const words = new Set(hay.split(/[^\p{L}\p{N}]+/u).filter(Boolean));
  const cjk = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/;
  const hit = [];
  const rest = [];
  for (const tag of tags) {
    // Same unicode tokenizer as the haystack (Codex r2 L8): "node.js" ->
    // ["node","js"], "c++" -> ["c"] - punctuated tech tags now match.
    const parts = String(tag).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    const matched = parts.length && parts.every(w => cjk.test(w) ? hay.includes(w) : words.has(w));
    (matched ? hit : rest).push(tag);
  }
  return hit.concat(rest);
}

// ---- Tag case normalization helpers ----
// Build a map: normalized_tag → preferred_casing (by highest count)
function buildTagCaseMap(tagCounts) {
  const groups = {};
  for (const [tag, count] of Object.entries(tagCounts)) {
    const norm = normalizeTagKey(tag);
    if (!groups[norm]) groups[norm] = [];
    groups[norm].push({ tag, count: parseInt(count) || 0 });
  }
  const map = {};
  for (const [norm, variants] of Object.entries(groups)) {
    variants.sort((a, b) => b.count - a.count);
    map[norm] = variants[0].tag;
  }
  return map;
}

// Normalize tag for fuzzy matching: lowercase, strip separators
function normalizeTagKey(tag) {
  return tag.toLowerCase().replace(/[-_]/g, "");
}

// Resolve a tag to its preferred existing casing
function resolveTagCase(tag, caseMap) {
  const norm = normalizeTagKey(tag);
  return caseMap[norm] || tag;
}

// ---- Pinboard API rate limiter ----
// Ensures minimum 3.1s between Pinboard API calls
const _pinboardQueue = [];
let _pinboardLastCall = 0;
let _pinboardProcessing = false;

// Accepts options.timeoutMs (default 15000) to override abort timeout per call.
// Non-critical endpoints (e.g. suggest) should pass a shorter value to fail fast.
function pinboardFetch(url, options) {
  return new Promise((resolve, reject) => {
    _pinboardQueue.push({ url, options: options || {}, resolve, reject });
    _processPinboardQueue();
  });
}

// Fire immediately without joining the rate-limit queue.
// Use only for non-critical read-only GET endpoints (e.g. posts/suggest) that already
// handle 429 gracefully. Avoids the 3.1s+ rate-limit wait that the main queue imposes.
function pinboardFetchImmediate(url, options) {
  return new Promise((resolve, reject) => {
    _authorizeFreshPinboardUrl(url)
      .then((authorizedUrl) => _executePinboardFetch(authorizedUrl, options || {}, resolve, reject), reject);
  });
}

async function _authorizeFreshPinboardUrl(url) {
  const raw = await pbpReadSettingsWithSecrets({ pinboardToken: SETTINGS_DEFAULTS.pinboardToken });
  const authorizedUrl = pbpAuthorizePinboardApiUrl(url, deobfuscateKey(raw.pinboardToken) || "");
  if (authorizedUrl) return authorizedUrl;
  const error = new Error("account_changed");
  error.code = "account_changed";
  throw error;
}

async function _processPinboardQueue() {
  if (_pinboardProcessing || !_pinboardQueue.length) return;
  _pinboardProcessing = true;
  while (_pinboardQueue.length) {
    const { url, options, resolve, reject } = _pinboardQueue.shift();
    // Cross-context coordination: read shared timestamp from storage
    let lastCall = _pinboardLastCall;
    try {
      const stored = await chrome.storage.local.get("_pbRateLimitTs");
      if (stored._pbRateLimitTs > lastCall) lastCall = stored._pbRateLimitTs;
    } catch (_) {}
    const now = Date.now();
    const wait = Math.max(0, 3100 - (now - lastCall));
    // Reserve the time slot BEFORE waiting/fetching to prevent race conditions
    // between popup and background contexts reading stale timestamps
    const reservedTime = now + wait;
    _pinboardLastCall = reservedTime;
    try { await chrome.storage.local.set({ _pbRateLimitTs: reservedTime }); } catch (_) {}
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    let authorizedUrl;
    try {
      authorizedUrl = await _authorizeFreshPinboardUrl(url);
    } catch (error) {
      reject(error);
      continue;
    }
    // Fire without awaiting — rate limit is timing-based (gap between request starts),
    // not completion-based. Awaiting each fetch caused queue starvation: a slow/hung
    // request (e.g. suggest for a niche URL) would delay all subsequent queued requests
    // by its full timeout duration.
    _executePinboardFetch(authorizedUrl, options, resolve, reject);
  }
  _pinboardProcessing = false;
}

function _executePinboardFetch(url, options, resolve, reject) {
  const ctrl = new AbortController();
  const { timeoutMs = 15000, ...fetchOpts } = options;
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  fetch(url, { ...fetchOpts, signal: ctrl.signal })
    .finally(() => clearTimeout(timer))
    .then(resolve, reject);
}

// ---- Pinboard posts/add URI builder ----
// Pinboard's CGI only reads query-string params (POST body is ignored, verified 2026-04-23),
// so every field must fit in the request URI. Measured 2026-06-02 (invalid-token probe): the
// server returns 414 once the full URI exceeds ~4100 bytes (flips between 4100 and 4110 — the
// cap is on the HTTP request line). CJK chars cost 9 bytes each once percent-encoded (3 UTF-8
// bytes → %XX%XX%XX), so notes fill the budget fast. 3900 sits ~200 bytes below the 414 cliff
// and allows ~3700 bytes of encoded fields. The earlier 2500 was over-conservative and rejected
// mixed-CJK notes that Pinboard's own web form accepts (the form POSTs to the site, bypassing
// the URI-bound API). Every save path (popup, batch, background) and the live char counter use
// buildPostsAddUri below, so the measured length equals what is actually sent.
const POSTS_ADD_URI_BUDGET = 3900;

function pbpPopupSavePolicy({ lookupStatus, lookupUrl, currentUrl, formLoaded, reviewedAtClick }) {
  if (lookupUrl !== currentUrl) return { allow: false, reason: "url_mismatch" };
  if (lookupStatus === "missing") return { allow: true, mode: "create" };
  if (lookupStatus === "found") {
    return formLoaded && reviewedAtClick
      ? { allow: true, mode: "update" }
      : { allow: false, reason: "review_required" };
  }
  if (lookupStatus === "failed") return { allow: true, mode: "merge" };
  if (lookupStatus === "pending") return { allow: false, reason: "lookup_pending" };
  return { allow: false, reason: "lookup_idle" };
}

function buildPostsAddUri({ token, url, title = "", extended = "", tags = "", shared, toread, dt, replace = true }) {
  const enc = encodeURIComponent;
  let uri = `https://api.pinboard.in/v1/posts/add?auth_token=${token}&format=json`;
  uri += `&url=${enc(url || "")}`;
  uri += `&description=${enc(title)}`;
  uri += `&extended=${enc(extended)}`;
  uri += `&tags=${enc(tags)}`;
  if (shared !== undefined) uri += `&shared=${shared}`;
  if (toread !== undefined) uri += `&toread=${toread}`;
  if (dt) uri += `&dt=${enc(dt)}`; // preserve original timestamp when re-saving an existing bookmark
  uri += `&replace=${replace ? "yes" : "no"}`;
  return uri;
}

// Resolve save semantics without I/O. Callers must validate the intent first and
// provide a fresh lookup for merge/skip modes.
function pbpResolveSavePlan(intent, lookup) {
  const incoming = {
    url: intent?.url || "",
    title: intent?.title || "",
    notes: intent?.notes || "",
    tags: intent?.tags || "",
    private: intent?.private === true,
    toread: intent?.toread === true,
    archive: typeof intent?.archive === "boolean" ? intent.archive : undefined,
    time: typeof intent?.time === "string" && intent.time ? intent.time : undefined,
  };
  const send = (fields, replace, mutation) => ({ action: "send", fields, replace, mutation });

  if (intent?.mode === "create") return send(incoming, false, "created");
  if (intent?.mode === "update") return send(incoming, true, "updated");
  if (intent?.mode === "overwrite") return send(incoming, true, "unknown");
  if (intent?.mode !== "merge" && intent?.mode !== "skip") {
    return { action: "failed", result: { status: "failed", reason: "invalid" } };
  }

  if (!lookup || lookup.lookupFailed) {
    const result = { status: "failed", reason: lookup?.reason || "lookup" };
    if (Number.isInteger(lookup?.httpStatus)) result.httpStatus = lookup.httpStatus;
    return { action: "failed", result, retryable: !lookup || !!lookup.retryable };
  }
  if (!lookup.exists) return send({ ...incoming, time: undefined }, false, "created");
  if (intent.mode === "skip") return { action: "skip", fields: { url: incoming.url } };
  if (!lookup.post || typeof lookup.post !== "object") {
    return { action: "failed", result: { status: "failed", reason: "lookup" }, retryable: true };
  }

  const post = lookup.post;
  const canonical = typeof post.description === "string"
    && typeof post.extended === "string"
    && typeof post.tags === "string"
    && (post.shared === "yes" || post.shared === "no")
    && (post.toread === "yes" || post.toread === "no")
    && typeof post.time === "string" && post.time.length > 0;
  if (!canonical) {
    return { action: "failed", result: { status: "failed", reason: "lookup" }, retryable: true };
  }
  const existing = {
    url: incoming.url,
    title: post.description,
    notes: post.extended,
    tags: post.tags,
    private: post.shared === "no",
    toread: post.toread === "yes",
    archive: incoming.archive,
    time: post.time,
  };

  existing.tags = unionTags(existing.tags, incoming.tags);
  if (incoming.toread) existing.toread = true;
  return send(existing, true, "updated");
}

// ---- Batch background-run liveness ----
// True iff a batch is mid-flight AND its heartbeat (ts) is fresh. A stale ts
// (the SW was terminated mid-batch) reads as not-running so the popup's Batch
// button isn't locked forever. Pure — unit-tested in tests/batch-dedup-tests.html.
const BATCH_STALE_TTL = 120000; // 120s, ~ one slow single-tab AI call
function batchIsRunning(progress, now, ttl) {
  if (!progress || !progress.running || progress.done) return false;
  return (now - (progress.ts || 0)) < (ttl || BATCH_STALE_TTL);
}

// ---- C2-6: reclaimable storage.local cache management ----
// Frees the quota that "storage full" preview failures hit. Runs in the SW,
// popup and options (no window/DOM deps — chrome.storage only).
//
// SAFETY (constructive, non-negotiable): reclaim is a POSITIVE ALLOWLIST of
// known-safe cache keys, NEVER a denylist. Root cause: with sync OFF, user
// settings AND obfuscated API keys live in storage.local (getSettingsStorage
// routes there), so "clear everything not in a blocklist" would wipe
// credentials. A key is deleted ONLY if it matches a category below.
const PBP_RECLAIM_CATEGORIES = {
  jina: { keys: [], prefixes: ["jina_md_"] },                       // Jina page extract cache (usually the largest)
  urls: { keys: ["cached_existing_urls"], prefixes: [] },           // legacy bookmark URL set residue
  tags: { keys: ["cached_user_tags"], prefixes: ["cached_suggest_"] }, // tag autocomplete caches
  misc: { keys: ["_waybackLog", "_waybackAttempts", "pbp_ai_usage", "pbpThinkReject"], prefixes: [] }, // archive log + AI usage + think-reject memo
};

// Second line of defense (belt-and-suspenders): even if a caller passes a bogus
// or over-broad category, these keys are NEVER removed. The allowlist above is
// the primary guard; this makes accidental deletion structurally impossible.
function pbpIsNeverClearKey(key) {
  if (typeof key !== "string") return true;
  // Pending user data / in-progress state.
  if (key === "offlineQueue" || key === "batch_progress") return true;
  if (key.startsWith("_tagGov")) return true;              // _tagGovAiGroups / _tagGovLastRun / _tagGovIgnored
  if (key.startsWith("md_preview_data")) return true;      // md_preview_data + md_preview_data_<uuid> handoffs
  if (key.startsWith("pbp_hl_")) return true;               // pbp_hl_<urlKey> highlight sets + pbp_hl_last_color (user data, never reclaimable)
  // Local-only settings that are NOT in SETTINGS_DEFAULTS. syncApiKeys is kept
  // here solely to protect its pre-account-wide legacy migration marker.
  if (key === "optSyncEnabled" || key === "syncApiKeys" || PBP_LARGE_FALLBACK_KEYS.has(key) || key === "lastUsedTags" || key.startsWith("lastUsedTags_")) return true;
  // Any setting (and, with sync off, any obfuscated API key) lives under a
  // SETTINGS_DEFAULTS key when routed to local.
  if (typeof SETTINGS_DEFAULTS === "object" && SETTINGS_DEFAULTS &&
      Object.prototype.hasOwnProperty.call(SETTINGS_DEFAULTS, key)) return true;
  return false;
}

function pbpIsHighlightBackupKey(key) {
  return typeof key === "string" && key.startsWith("pbp_hl_");
}

function pbpSanitizeHighlightBackupItem(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  const out = {};
  ["id", "quote", "prefix", "suffix", "note", "side", "lang"].forEach((k) => {
    if (typeof item[k] === "string") out[k] = item[k];
  });
  ["n", "color", "ts"].forEach((k) => {
    if (typeof item[k] === "number") out[k] = item[k];
  });
  return out;
}

function pbpSanitizeHighlightBackupRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || !Array.isArray(value.items)) return null;
  const out = { items: [] };
  if (typeof value.v === "number") out.v = value.v;
  if (typeof value.url === "string") out.url = value.url;
  if (typeof value.title === "string") out.title = value.title;
  value.items.forEach((item) => {
    const cleaned = pbpSanitizeHighlightBackupItem(item);
    if (cleaned) out.items.push(cleaned);
  });
  return out;
}

function pbpBuildHighlightBackup(allLocal) {
  const out = {};
  for (const [key, value] of Object.entries(allLocal || {})) {
    if (!pbpIsHighlightBackupKey(key)) continue;
    if (key === "pbp_hl_last_color") {
      if (typeof value === "number" && value >= 1 && value <= 5) out[key] = value;
      continue;
    }
    const cleaned = pbpSanitizeHighlightBackupRecord(value);
    if (cleaned) out[key] = cleaned;
  }
  return Object.keys(out).length ? out : null;
}

function pbpCleanHighlightBackup(highlights) {
  const out = {};
  for (const [key, value] of Object.entries(highlights || {})) {
    if (!pbpIsHighlightBackupKey(key)) continue;
    if (key === "pbp_hl_last_color") {
      if (typeof value === "number" && value >= 1 && value <= 5) out[key] = value;
      continue;
    }
    const cleaned = pbpSanitizeHighlightBackupRecord(value);
    if (cleaned) out[key] = cleaned;
  }
  return out;
}

function pbpIsPlainRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function pbpBackupValueError(key) {
  return new TypeError("invalid backup field: " + key);
}

function pbpSanitizeBackupThemes(value) {
  if (!Array.isArray(value)) throw pbpBackupValueError("savedThemes");
  return value.map((theme, index) => {
    if (!pbpIsPlainRecord(theme) || typeof theme.name !== "string" || typeof theme.css !== "string") {
      throw pbpBackupValueError(`savedThemes[${index}]`);
    }
    // No size gate: legacy themes saved before the 50 KB form limit existed
    // are still the user's data. The sync write path (syncSetLarge) already
    // chunks large values and falls back to local storage on quota.
    return { name: theme.name, css: theme.css };
  });
}

// Missing version is the original v1 file format. Any explicit value must be
// one of the schemas this release understands; future/invalid schemas are
// rejected before callers perform a storage write.
function pbpBackupSchemaVersion(data) {
  if (!pbpIsPlainRecord(data)) throw new TypeError("backup root must be an object");
  if (!Object.prototype.hasOwnProperty.call(data, "_schemaVersion")) return 1;
  if (data._schemaVersion === 1 || data._schemaVersion === 2 || data._schemaVersion === 3) {
    return data._schemaVersion;
  }
  throw new TypeError("unsupported backup schema");
}

function pbpSanitizeBackupMetadata(value) {
  if (!pbpIsPlainRecord(value) ||
      Object.keys(value).some((key) => !["createdAt", "extensionVersion", "source", "includesSecrets"].includes(key)) ||
      typeof value.createdAt !== "string" || typeof value.extensionVersion !== "string" ||
      value.source !== "manual") {
    throw pbpBackupValueError("_backup");
  }
  // Opt-in credential carrier. Absent on every backup this extension wrote
  // before the option existed, so it must stay optional — but when present it
  // has to be a real boolean, since the import preview keys its warning off it.
  if (Object.prototype.hasOwnProperty.call(value, "includesSecrets") &&
      typeof value.includesSecrets !== "boolean") {
    throw pbpBackupValueError("_backup.includesSecrets");
  }
  const date = new Date(value.createdAt);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== value.createdAt) {
    throw pbpBackupValueError("_backup.createdAt");
  }
  const metadata = {
    createdAt: value.createdAt,
    extensionVersion: value.extensionVersion,
    source: "manual",
  };
  if (value.includesSecrets === true) metadata.includesSecrets = true;
  return metadata;
}

function pbpCanonicalBackupOwner(value) {
  return typeof value === "string" ? value.normalize("NFC").trim() : "";
}

function pbpBackupOwnerScope(value) {
  const owner = pbpCanonicalBackupOwner(value);
  return owner ? pbpDictOwnerScope(owner) : "";
}

function pbpSanitizeBackupVocabulary(value) {
  const owner = pbpCanonicalBackupOwner(value && value.owner);
  if (!pbpIsPlainRecord(value) ||
      Object.keys(value).some((key) => !["owner", "records"].includes(key)) ||
      !owner || !Array.isArray(value.records) ||
      !_pbpVocabDenseArray(value.records)) {
    throw pbpBackupValueError("_vocabulary");
  }
  const scope = pbpBackupOwnerScope(owner);
  const seen = new Set();
  const fields = [
    "id", "owner", "term", "lemma", "language", "gloss", "ipa", "sourceUrl",
    "license", "contexts", "groups", "note", "status", "createdAt", "updatedAt",
  ];
  const records = value.records.map((record, index) => {
    if (!pbpIsPlainRecord(record) ||
        Object.keys(record).length !== fields.length ||
        Object.keys(record).some((key) => !fields.includes(key)) ||
        record.owner !== scope) {
      throw pbpBackupValueError(`_vocabulary.records[${index}]`);
    }
    const recordKey = pbpDictCacheKeyPublic(record.language, record.term);
    if (seen.has(record.id)) throw pbpBackupValueError(`_vocabulary.records[${index}].id`);
    seen.add(record.id);
    const word = {};
    fields.slice(2).forEach((key) => { word[key] = record[key]; });
    const valid = record.id === `${scope}|${recordKey}` && pbpVocabValidateEvent({
      recordKey,
      vector: { backup: 1 },
      dot: { deviceId: "backup", counter: 1 },
      deleted: false,
      value: word,
    }, recordKey);
    if (!valid) throw pbpBackupValueError(`_vocabulary.records[${index}]`);
    return {
      id: record.id,
      owner: record.owner,
      term: record.term,
      lemma: record.lemma,
      language: record.language,
      gloss: record.gloss,
      ipa: record.ipa,
      sourceUrl: record.sourceUrl,
      license: record.license,
      contexts: record.contexts.map((context) => ({ ...context })),
      groups: record.groups.slice(),
      note: record.note,
      status: record.status,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  });
  return { owner, records };
}

function pbpBackupLocalFallbackFields(prepared, syncState, sections) {
  if (!syncState || syncState.enabled !== true) return [];
  const markers = new Set((Array.isArray(syncState.localFallbackKeys)
    ? syncState.localFallbackKeys : [])
    .filter((key) => typeof key === "string")
    .map((key) => key.replace(/_localFallback$/, "")));
  const selected = sections || {};
  const safeData = prepared && prepared.safeData || {};
  const present = (key) => {
    if (key === "savedThemes") return prepared?.importedThemes !== undefined;
    if (key === "customOverlayCSS") {
      return prepared?.customOverlayCSS !== undefined || prepared?.customCSS !== undefined;
    }
    return Object.prototype.hasOwnProperty.call(safeData, key);
  };
  return [...PBP_LARGE_FALLBACK_KEYS]
    .map((key) => key.replace(/_localFallback$/, ""))
    .filter((key) => {
      const section = key === "savedThemes" ? "themes" : "settings";
      if (!selected[section]?.enabled || !present(key)) return false;
      const deterministic = key === "customOverlayCSS" &&
        prepared?.customOverlayCSS !== undefined &&
        pbpOverlayByteLength(prepared.customOverlayCSS) > OVERLAY_BYTE_LIMIT;
      return markers.has(key) || deterministic;
    });
}

function pbpBuildBackupPreview(prepared, currentOwner, syncState) {
  const highlights = pbpCleanHighlightBackup(prepared && prepared.highlights);
  const highlightRows = Object.entries(highlights)
    .filter(([key, value]) => key !== "pbp_hl_last_color" && value && Array.isArray(value.items));
  const vocabulary = prepared && prepared.vocabulary;
  const languages = {};
  if (vocabulary) {
    vocabulary.records.forEach((record) => {
      const language = pbpDictPrimaryLang(record.language) || "und";
      languages[language] = (languages[language] || 0) + 1;
    });
  }
  const currentScope = pbpBackupOwnerScope(currentOwner);
  const ownerMismatch = !!vocabulary && (!currentScope ||
    pbpBackupOwnerScope(vocabulary.owner) !== currentScope);
  const highlightAllowed = !prepared?.highlights ||
    pbpHighlightBackupOwnerAllowed(prepared.highlightsOwner, currentOwner, true);
  const highlightOwnerMismatch = prepared?.highlights !== undefined && !highlightAllowed;
  const secretCount = typeof prepared?.secretCount === "number" ? prepared.secretCount : 0;
  const sections = {
    settings: {
      enabled: !!(Object.keys(prepared.safeData || {}).length ||
        prepared.customCSS !== undefined || prepared.customOverlayCSS !== undefined),
    },
    themes: { enabled: prepared.importedThemes !== undefined },
    highlights: { enabled: prepared.highlights !== undefined && highlightAllowed },
    vocabulary: { enabled: !!vocabulary && !ownerMismatch },
    // Credentials are their own section so "restore my settings" never has to
    // mean "and overwrite the keys on this device".
    secrets: { enabled: secretCount > 0 },
  };
  const localFallbackKeys = pbpBackupLocalFallbackFields(prepared, syncState, sections);
  return {
    schemaVersion: prepared.schemaVersion,
    metadata: prepared.metadata || null,
    settingsCount: Object.keys(prepared.safeData || {}).length,
    themeCount: Array.isArray(prepared.importedThemes) ? prepared.importedThemes.length : 0,
    highlightPages: highlightRows.length,
    highlightEntries: highlightRows.reduce((count, [, value]) => count + value.items.length, 0),
    highlightsOwner: prepared.highlightsOwner || "",
    vocabularyCount: vocabulary ? vocabulary.records.length : 0,
    vocabularyOwner: vocabulary ? vocabulary.owner : "",
    secretCount,
    languages,
    ownerMismatch,
    highlightOwnerMismatch,
    syncWarning: !!(syncState && syncState.enabled),
    localFallbackKeys,
    sections,
  };
}

// Backup highlights are keyed by URL only (pbp_hl_<url>) with no account
// dimension, so a backup restored on a device logged into a DIFFERENT Pinboard
// account would merge the first account's reading notes into the second's.
// Backups now carry a non-secret _highlightsOwner (the exporting account) and
// apply re-checks it here. Missing owner (legacy backup, or export with no
// account) => allow, to stay backward compatible. A named owner requires the
// same currently authenticated account; logged-out restore stays closed because
// URL-keyed notes would otherwise be inherited by whichever account logs in next.
// accountResolved=false means the current account could NOT be read (transient
// storage/lock error): fail CLOSED when the backup names a specific owner, so a
// storage hiccup can't silently leak account A's notes onto account B.
function pbpHighlightBackupOwnerAllowed(backupOwner, currentAccount, accountResolved = true) {
  if (!backupOwner) return true;
  if (!accountResolved) return false;
  return !!currentAccount && backupOwner === currentAccount;
}

function pbpKeyMatchesCategory(key, def) {
  // Reject non-defs (incl. inherited props like PBP_RECLAIM_CATEGORIES["__proto__"],
  // which resolves to Object.prototype — truthy but with no keys/prefixes arrays).
  if (!def || !Array.isArray(def.keys) || !Array.isArray(def.prefixes)) return false;
  if (def.keys.includes(key)) return true;
  return def.prefixes.some((p) => key.startsWith(p));
}

// Rough per-key storage cost (key + JSON value length) — good enough for display,
// avoids a getBytesInUse round-trip per category and works in file:// tests.
function pbpEntryBytes(key, value) {
  try { return key.length + JSON.stringify(value).length; } catch (_) { return key.length; }
}

// Enumerate reclaimable local storage grouped by category: { cat: { keys, bytes } }.
// Degrades to an all-zero shape on any storage failure (never throws).
async function pbpMeasureLocalStorage() {
  const out = {};
  for (const cat of Object.keys(PBP_RECLAIM_CATEGORIES)) out[cat] = { keys: [], bytes: 0 };
  let all;
  try { all = await chrome.storage.local.get(null); } catch (_) { return out; }
  for (const key of Object.keys(all || {})) {
    if (pbpIsNeverClearKey(key)) continue;
    for (const cat of Object.keys(PBP_RECLAIM_CATEGORIES)) {
      if (pbpKeyMatchesCategory(key, PBP_RECLAIM_CATEGORIES[cat])) {
        out[cat].keys.push(key);
        out[cat].bytes += pbpEntryBytes(key, all[key]);
        break; // a key belongs to at most one category
      }
    }
  }
  return out;
}

// Remove ONLY the allowlist keys for the given categories. Every candidate is
// re-checked against pbpIsNeverClearKey before deletion. Returns freed bytes.
// Degrades to 0 (no throw) on any storage failure.
async function pbpReclaimLocalStorage(categories) {
  const cats = Array.isArray(categories) ? categories : [];
  let all;
  try { all = await chrome.storage.local.get(null); } catch (_) { return 0; }
  const toRemove = [];
  let freed = 0;
  for (const key of Object.keys(all || {})) {
    if (pbpIsNeverClearKey(key)) continue; // second-line guard
    for (const cat of cats) {
      const def = PBP_RECLAIM_CATEGORIES[cat]; // unknown/garbage category -> undefined -> skipped
      if (def && pbpKeyMatchesCategory(key, def)) {
        toRemove.push(key);
        freed += pbpEntryBytes(key, all[key]);
        break;
      }
    }
  }
  if (toRemove.length) {
    try { await chrome.storage.local.remove(toRemove); } catch (_) { return 0; }
  }
  return freed;
}

// Human-readable byte size (B / KB / MB) for the storage panel.
function pbpFormatBytes(b) {
  if (!(b > 0)) return "0 B";
  if (b < 1024) return b + " B";
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + " KB";
  return (b / (1024 * 1024)).toFixed(1) + " MB";
}

// ---- Pinboard error classifier ----
// Returns an i18n key describing a Pinboard API failure.
// Input: HTTP Response, Error, or status number. Caller handles 401 (pinboardFetch redirects)
// and 500 (Pinboard's quirk for niche URLs → "no suggestions") BEFORE calling this.
function classifyPinboardError(input) {
  if (input && typeof input === "object" && "status" in input && !("name" in input)) {
    const s = input.status;
    if (s === 401 || s === 403) return "pinboardErrorAuth";
    if (s === 429) return "pinboardErrorRateLimit";
    if (s >= 500) return "pinboardErrorServer";
    return "pinboardErrorOffline";
  }
  if (typeof input === "number") {
    if (input === 401 || input === 403) return "pinboardErrorAuth";
    if (input === 429) return "pinboardErrorRateLimit";
    if (input >= 500) return "pinboardErrorServer";
    return "pinboardErrorOffline";
  }
  // Error instance (network failure, AbortError, etc.)
  const name = input?.name;
  if (name === "AbortError") return "pinboardErrorTimeout";
  if (input instanceof TypeError) return "pinboardErrorOffline";
  return "pinboardErrorOffline";
}

// ---- Settings storage selector (sync vs local based on user preference) ----
// The preference itself is always stored in chrome.storage.local (bootstrap location).
// R5: cached + invalidated on optSyncEnabled change. First call seeds from localStorage
// mirror if present (synchronous fast path), then storage.get confirms.
let _settingsStorageCache = null;

// Sync fast-path: hydrate from localStorage mirror if available.
// Caller still treats getSettingsStorage as async (signature preserved).
try {
  if (typeof localStorage !== "undefined") {
    const m = localStorage.getItem("pp-sync-enabled");
    if (m === "1") _settingsStorageCache = chrome.storage.sync;
    else if (m === "0") _settingsStorageCache = chrome.storage.local;
  }
} catch (_) {}

async function getSettingsStorage() {
  if (_settingsStorageCache) return _settingsStorageCache;
  try {
    const { optSyncEnabled } = await chrome.storage.local.get({ optSyncEnabled: false });
    _settingsStorageCache = optSyncEnabled ? chrome.storage.sync : chrome.storage.local;
    try { localStorage.setItem("pp-sync-enabled", optSyncEnabled ? "1" : "0"); } catch (_) {}
    return _settingsStorageCache;
  } catch (_) {
    return chrome.storage.local;
  }
}

// Invalidate cache + mirror when user toggles optSyncEnabled
if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.optSyncEnabled) {
      _settingsStorageCache = null;
      try {
        const v = changes.optSyncEnabled.newValue;
        if (typeof v === "boolean") localStorage.setItem("pp-sync-enabled", v ? "1" : "0");
      } catch (_) {}
    }
  });
}

// ---- Single-writer reducer for offlineQueue ----
// Pure function — returns a NEW array, never mutates input.
// background.js is the only writer; popup sends messages instead of touching storage.
// Centralises the previously-unsynchronised read-modify-writes into one testable reducer.
function pbpOfflineQueueReduce(queue, action) {
  const q = Array.isArray(queue) ? queue : [];
  if (!action || typeof action !== "object") return q.slice();
  switch (action.kind) {
    case "clear":
      return [];
    case "remove":
      return q.filter((it) => it && it.queueId !== action.queueId);
    case "enqueue": {
      if (!action.item) return q.slice();
      if (q.some((it) => it && it.queueId === action.item.queueId)) return q.slice();
      const item = { ...action.item };
      delete item.token;
      return [...q, item];
    }
    case "ensure_ids":
      if (!action.prefix) return q.slice();
      return q.map((it, index) =>
        it && typeof it === "object" && !it.queueId
          ? { ...it, queueId: `${action.prefix}-${index}` }
          : it);
    default:
      return q.slice();
  }
}

function pbpCreateRecoveringTail() {
  let tail = Promise.resolve();
  return (task) => {
    const operation = tail.then(task);
    tail = operation.catch(() => {});
    return operation;
  };
}

function pbpPinboardAccountFromToken(token) {
  const decoded = deobfuscateKey(token);
  if (typeof decoded !== "string") return "";
  const separator = decoded.indexOf(":");
  if (separator < 1 || separator === decoded.length - 1) return "";
  return decoded.slice(0, separator);
}

// Owner derivation: the ONLY correct path is the same atomic secret-aware
// read every other account-scoped consumer uses (pbpReadSettingsWithSecrets
// picks the right storage area and overlays the local secret when sync is
// routed) -- never split/decode opt-pinboard-token's raw form field value
// here. pbpPinboardAccountFromToken deobfuscates internally, so the raw
// (still-obfuscated) token read from storage is passed through as-is.
// Vocabulary owner scope, shared by the options settings tab and the library
// page. Call-time deps: pbpReadSettingsWithSecrets (this file) and
// pbpDictOwnerScope (vocab-store.js — loaded by every page that calls this).
async function pbpVocabCurrentOwner() {
  const s = await pbpReadSettingsWithSecrets({ pinboardToken: SETTINGS_DEFAULTS.pinboardToken });
  return pbpDictOwnerScope(pbpPinboardAccountFromToken(s.pinboardToken));
}

function pbpVocabOwnerLabel(owner) {
  const scope = String(owner || "");
  if (!scope.startsWith("acct_")) return t("vocabOwnerNoAccount");
  const encoded = scope.slice(5);
  try { return decodeURIComponent(encoded); } catch (_) { return encoded; }
}

function pbpAccountStorageKey(base, account) {
  return base && account ? `${base}_${encodeURIComponent(account)}` : "";
}

function pbpOfflineQueueAccount(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return "";
  if (Object.prototype.hasOwnProperty.call(item, "account")) {
    return typeof item.account === "string" ? item.account : "";
  }
  return pbpPinboardAccountFromToken(item.token);
}

// Legacy tokens identify ownership only; replay always requires the current
// token for that same account, so logout/account-switch drains fail closed.
function pbpResolveOfflineQueueToken(currentToken, item) {
  const currentAccount = pbpPinboardAccountFromToken(currentToken);
  const queuedAccount = pbpOfflineQueueAccount(item);
  return currentAccount && queuedAccount === currentAccount ? currentToken : "";
}

async function pbpDrainOfflineQueue(queueIds, { getItem, sendItem, removeItem, onSuccess }) {
  const outcomes = [];
  for (const queueId of queueIds) {
    const item = await getItem(queueId);
    if (!item) continue;
    const delivered = await sendItem(item);
    const result = delivered?.result || delivered;
    if (result !== true && result?.status !== "saved" && result?.status !== "skipped") {
      outcomes.push({ item, result, acknowledged: false });
      continue;
    }
    await removeItem(queueId);
    if (onSuccess) await onSuccess(item, delivered);
    outcomes.push({
      item,
      result: result === true ? { status: "saved", mutation: "unknown" } : result,
      acknowledged: true,
    });
  }
  return outcomes;
}

// ---- Prime SETTINGS_DEFAULTS into storage (one-time fix for popup boot lag) ----
// chrome.storage.{local,sync}.get({ k: default }) is measurably slower when k is missing
// vs when k exists explicitly. For users who never customized most settings, this slows
// popup boot enough to surface the main-section flash. Calling primeSettings() on install/
// update/startup writes only the missing keys (existing values are preserved).
async function primeSettings() {
  try {
    await pbpWithSecretStorageLock(async () => {
      const flags = await pbpReadSecretSyncStateUnlocked();
      const storage = flags.optSyncEnabled ? chrome.storage.sync : chrome.storage.local;
      _settingsStorageCache = storage;
      const keys = Object.keys(SETTINGS_DEFAULTS).filter((key) =>
        storage !== chrome.storage.sync || (key !== "exportTargets" && !API_KEY_FIELDS.includes(key)));
      const existing = await storage.get(keys); // array form: returns only keys that are set
      const missing = {};
      for (const k of keys) {
        if (!(k in existing)) missing[k] = SETTINGS_DEFAULTS[k];
      }
      if (Object.keys(missing).length > 0) await storage.set(missing);
    });
  } catch (_) { /* best-effort */ }
}

// ---- Chunked sync storage for large values ----
// chrome.storage.sync has an 8 KB per-item limit measured after JSON/UTF-8
// serialization. Use generation-scoped copy-on-write chunks so a rejected or
// interrupted write cannot destroy the previous readable value.
const PBP_SYNC_ITEM_BUDGET = 7800;
const PBP_UTF8_ENCODER = new TextEncoder();

function pbpLargeFallbackKey(key) { return `${key}_localFallback`; }

function pbpDecodeLargeResult(raw, defaultValue) {
  if (raw === undefined) return { ok: true, value: defaultValue };
  if (typeof defaultValue === "string") {
    return typeof raw === "string"
      ? { ok: true, value: raw }
      : { ok: false, value: defaultValue };
  }
  if (typeof raw === "string") {
    try { raw = JSON.parse(raw); }
    catch (_) { return { ok: false, value: defaultValue }; }
  }
  if (Array.isArray(defaultValue)) {
    return Array.isArray(raw)
      ? { ok: true, value: raw }
      : { ok: false, value: defaultValue };
  }
  if (defaultValue && typeof defaultValue === "object") {
    return raw && typeof raw === "object" && !Array.isArray(raw)
      ? { ok: true, value: raw }
      : { ok: false, value: defaultValue };
  }
  return { ok: true, value: raw };
}

function pbpDecodeLargeValue(raw, defaultValue) {
  return pbpDecodeLargeResult(raw, defaultValue).value;
}

// _base records the sync generation this fallback SUPERSEDED (null when the
// key had no committed generation at write time). It lets readers tell "sync
// has not moved since my failed write" (fallback is the newest value) apart
// from "another device committed a newer generation afterwards" (cloud wins).
function pbpLargeFallbackRecord(value, generation, baseGeneration = null) {
  return { _pbpLargeFallback: 1, _generation: generation, _base: baseGeneration, value };
}

function pbpLargeFallbackValue(raw) {
  return raw && raw._pbpLargeFallback === 1 ? raw.value : raw;
}

function pbpLargeFallbackMatchesMeta(raw, stored) {
  return !!(raw && raw._pbpLargeFallback === 1 && typeof raw._generation === "string" &&
    stored && typeof stored === "object" && stored._generation === raw._generation);
}

// Classifies a quota-fallback record against the CURRENT sync metadata.
//   "committed": the record's own write generation actually landed in sync
//                (crash between commit and cleanup) — read the cloud value.
//   "fresh":     sync still shows the generation the record was written
//                against (or a legacy record with no _base) — the fallback is
//                the newest value and must win.
//   "stale":     sync moved to a THIRD generation: another device committed a
//                newer value after this record was stranded. Cloud wins, and
//                keeping the record would shadow every future cloud update.
function pbpLargeFallbackFreshness(record, stored) {
  if (pbpLargeFallbackMatchesMeta(record, stored)) return "committed";
  if (!(record && record._pbpLargeFallback === 1)) return "fresh"; // legacy plain value
  if (!Object.prototype.hasOwnProperty.call(record, "_base")) return "fresh";
  const current = stored && typeof stored === "object" && typeof stored._generation === "string"
    ? stored._generation : null;
  // Mixed-version limitation: pre-generation metadata carries no _generation,
  // so "unchanged since my write" and "replaced by a pre-generation device"
  // both read as current=null. A null _base therefore stays "fresh" — the
  // safe default (dropping the record could destroy this device's only
  // copy); the first generation-stamped write resolves the ambiguity.
  return current === record._base ? "fresh" : "stale";
}

// Shared in-lock read for one chunked key: fallback-record freshness handling
// plus ONE metadata retry when a chunk read fails with no fallback in play (a
// foreign device's generation swap can land between the metadata read and the
// chunk read — the same race the content-script reader retries).
async function pbpReadLargeWithFallbackUnlocked(key, readMeta, defaultValue) {
  let stored = await readMeta();
  const fallbackKey = pbpLargeFallbackKey(key);
  let fallbacks = {};
  try { fallbacks = await chrome.storage.local.get(fallbackKey); } catch (_) {}
  if (Object.prototype.hasOwnProperty.call(fallbacks, fallbackKey)) {
    const record = fallbacks[fallbackKey];
    const freshness = pbpLargeFallbackFreshness(record, stored);
    if (freshness === "fresh") return pbpDecodeLargeValue(pbpLargeFallbackValue(record), defaultValue);
    if (freshness === "committed") {
      const committed = await pbpReadChunkedSyncResult(key, stored, defaultValue);
      if (!committed.ok) return pbpDecodeLargeValue(pbpLargeFallbackValue(record), defaultValue);
      await chrome.storage.local.remove(fallbackKey).catch(() => {});
      return committed.value;
    }
    // "stale" — another device committed a newer generation. Confirm the
    // replacement actually READS before destroying this device's last known
    // value (sync propagates per item: metadata can arrive before chunks).
    // The remove stays inside the caller's lock so it cannot race a writer's
    // fresh record.
    const replacement = await pbpReadChunkedSyncResult(key, stored, defaultValue);
    if (!replacement.ok) return pbpDecodeLargeValue(pbpLargeFallbackValue(record), defaultValue);
    await chrome.storage.local.remove(fallbackKey).catch(() => {});
    return replacement.value;
  }
  let result = await pbpReadChunkedSyncResult(key, stored, defaultValue);
  if (!result.ok) {
    stored = await readMeta();
    result = await pbpReadChunkedSyncResult(key, stored, defaultValue);
  }
  return result.value;
}

function pbpNewChunkGeneration() {
  try {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
      return globalThis.crypto.randomUUID().replace(/-/g, "");
    }
  } catch (_) {}
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

// Large values are updated in multiple storage operations (new chunks, then
// metadata, then stale-chunk cleanup). Serialize each logical key across
// extension pages and the MV3 worker so two writers cannot delete the chunks
// that a concurrent metadata commit is about to publish.
const PBP_LARGE_STORAGE_QUEUES = new Map();
function pbpWithLocalLargeStorageQueue(key, work) {
  const previous = PBP_LARGE_STORAGE_QUEUES.get(key) || Promise.resolve();
  const run = previous.catch(() => {}).then(work);
  const tracked = run.finally(() => {
    if (PBP_LARGE_STORAGE_QUEUES.get(key) === tracked) PBP_LARGE_STORAGE_QUEUES.delete(key);
  });
  PBP_LARGE_STORAGE_QUEUES.set(key, tracked);
  return tracked;
}

function pbpWithLargeStorageLock(key, work) {
  const locks = typeof navigator !== "undefined" && navigator.locks;
  return locks && typeof locks.request === "function"
    ? locks.request(`pbp-large-storage:${key}`, work)
    : pbpWithLocalLargeStorageQueue(key, work);
}

function pbpChunkStorageKeys(key, meta) {
  const count = Number(meta && meta._chunks);
  if (!Number.isInteger(count) || count < 1 || count > 512) return [];
  const generation = meta && meta._generation;
  if (generation !== undefined && (typeof generation !== "string" || !/^[a-z0-9]+$/i.test(generation))) return [];
  const prefix = generation ? `${key}_${generation}_` : `${key}_`;
  return Array.from({ length: count }, (_, i) => `${prefix}${i}`);
}

function pbpSplitSyncString(key, generation, str) {
  const chunks = [];
  let chars = [];
  let payloadBytes = 0;
  let index = 0;
  const baseBytes = () => PBP_UTF8_ENCODER.encode(`${key}_${generation}_${index}`).length + 2;
  for (const ch of str) {
    const charBytes = PBP_UTF8_ENCODER.encode(JSON.stringify(ch)).length - 2;
    if (chars.length && baseBytes() + payloadBytes + charBytes > PBP_SYNC_ITEM_BUDGET) {
      chunks.push(chars.join(""));
      chars = [];
      payloadBytes = 0;
      index++;
    }
    if (baseBytes() + charBytes > PBP_SYNC_ITEM_BUDGET) throw new RangeError("sync value contains an oversized character");
    chars.push(ch);
    payloadBytes += charBytes;
  }
  if (chars.length) chunks.push(chars.join(""));
  return chunks;
}

async function pbpReadChunkedSyncResult(key, stored, defaultValue) {
  if (stored === undefined || typeof stored === "string") {
    return pbpDecodeLargeResult(stored, defaultValue); // missing or pre-chunk migration data
  }
  const chunkKeys = pbpChunkStorageKeys(key, stored);
  if (!chunkKeys.length) return { ok: false, value: defaultValue };
  const values = await chrome.storage.sync.get(chunkKeys);
  if (chunkKeys.some((chunkKey) => typeof values[chunkKey] !== "string")) {
    return { ok: false, value: defaultValue };
  }
  return pbpDecodeLargeResult(chunkKeys.map((chunkKey) => values[chunkKey]).join(""), defaultValue);
}

async function pbpReadChunkedSyncValue(key, stored, defaultValue) {
  return (await pbpReadChunkedSyncResult(key, stored, defaultValue)).value;
}

async function pbpResolveChunkedSettings(settings, storage, query) {
  const requested = PBP_CHUNKED_SETTING_KEYS.filter((key) => {
    if (query == null) return true;
    if (typeof query === "string") return query === key;
    if (Array.isArray(query)) return query.includes(key);
    return !!query && Object.prototype.hasOwnProperty.call(query, key);
  });
  if (!requested.length) return settings;
  const out = Object.assign({}, settings);
  if (storage === chrome.storage.local) {
    requested.forEach((key) => { out[key] = pbpDecodeLargeValue(out[key], SETTINGS_DEFAULTS[key]); });
    return out;
  }
  for (const key of requested) {
    // Metadata is (re-)read INSIDE the lock: the row captured by the caller's
    // bulk get() may predate a concurrent generation swap whose stale chunks
    // are already deleted. A metadata read failure degrades to that snapshot.
    out[key] = await pbpWithLargeStorageLock(key, () =>
      pbpReadLargeWithFallbackUnlocked(key, async () => {
        try {
          const fresh = await storage.get(key);
          return fresh[key];
        } catch (_) { return out[key]; }
      }, SETTINGS_DEFAULTS[key]));
  }
  return out;
}

async function pbpSyncSetLargeUnlocked(key, value) {
  const storage = await getSettingsStorage();
  const str = typeof value === "string" ? value : JSON.stringify(value);
  if (storage === chrome.storage.local) {
    if (!str) {
      await chrome.storage.local.remove([key, pbpLargeFallbackKey(key)]);
      return;
    }
    await chrome.storage.local.set({ [key]: value });
    await chrome.storage.local.remove(pbpLargeFallbackKey(key));
    return;
  }
  const fallbackKey = pbpLargeFallbackKey(key);
  const prior = await chrome.storage.sync.get(key);
  const priorMeta = prior[key];
  const priorChunkKeys = pbpChunkStorageKeys(key, priorMeta);
  if (!str) {
    await chrome.storage.local.remove(fallbackKey);
    await chrome.storage.sync.remove([key, ...priorChunkKeys]);
    return;
  }
  const generation = pbpNewChunkGeneration();
  const baseGeneration = priorMeta && typeof priorMeta === "object" && typeof priorMeta._generation === "string"
    ? priorMeta._generation : null;
  let existingFallback = {};
  try { existingFallback = await chrome.storage.local.get(fallbackKey); } catch (_) {}
  const hadFallback = Object.prototype.hasOwnProperty.call(existingFallback, fallbackKey);
  const previousFallback = existingFallback[fallbackKey];
  if (hadFallback) {
    await chrome.storage.local.set({ [fallbackKey]: pbpLargeFallbackRecord(value, generation, baseGeneration) });
  }
  const chunks = pbpSplitSyncString(key, generation, str);
  const chunkData = {};
  chunks.forEach((chunk, i) => { chunkData[`${key}_${generation}_${i}`] = chunk; });
  const newChunkKeys = Object.keys(chunkData);
  try {
    await chrome.storage.sync.set(chunkData);
    await chrome.storage.sync.set({
      [key]: {
        _chunks: chunks.length,
        _generation: generation,
        _previousGeneration: baseGeneration,
      },
    });
  } catch (e) {
    await chrome.storage.sync.remove(newChunkKeys).catch(() => {});
    if (/QUOTA|quota/i.test(e && e.message || "")) {
      await chrome.storage.local.set({ [fallbackKey]: pbpLargeFallbackRecord(value, generation, baseGeneration) });
      try { e.pbpFellBackToLocal = true; } catch (_) {}
    } else if (hadFallback) {
      // The pre-write generation stamp protects a successful metadata commit
      // from a crash before fallback cleanup. If the sync write definitively
      // failed for a non-quota reason, restore the prior local override so the
      // visible failure does not nevertheless change the effective value.
      await chrome.storage.local.set({ [fallbackKey]: previousFallback });
    }
    throw e;
  }
  let readback;
  try { readback = (await chrome.storage.sync.get(key))[key]; } catch (_) {}
  if (readback && readback._generation === generation) {
    if (priorChunkKeys.length) {
      await chrome.storage.sync.remove(priorChunkKeys).catch(() => {});
    }
    await chrome.storage.local.remove(fallbackKey).catch(() => {});
  }
}

function syncSetLarge(key, value) {
  return pbpWithLargeStorageLock(key, () => pbpSyncSetLargeUnlocked(key, value));
}

async function pbpSyncGetLargeUnlocked(key, defaultValue) {
  const storage = await getSettingsStorage();
  if (storage === chrome.storage.local) {
    const data = await chrome.storage.local.get({ [key]: defaultValue });
    return pbpDecodeLargeValue(data[key], defaultValue);
  }
  return pbpReadLargeWithFallbackUnlocked(key,
    async () => (await chrome.storage.sync.get(key))[key], defaultValue);
}

function syncGetLarge(key, defaultValue) {
  return pbpWithLargeStorageLock(key, () => pbpSyncGetLargeUnlocked(key, defaultValue));
}

// Keys that legacy releases wrote to chrome.storage.sync even while settings
// sync was OFF (overlay bookkeeping, migrationV2's flag and its stray
// themePresetKey), so their presence proves nothing about a real cloud
// profile. Used by the sync-enable conflict check.
const PBP_SYNC_BOOKKEEPING_KEYS = ["syncApiKeys", "_migrationV2", "optOverlayInLocal", "themePresetKey"];

// True iff the sync area holds settings worth offering as "use cloud?" when a
// device first enables settings sync. Bookkeeping keys, keys outside
// SETTINGS_DEFAULTS (chunk metadata/chunks), and values equal to the defaults
// (including "" credential tombstones) all count as noise: telling an
// established single-device user that "the cloud already has settings" makes
// Confirm silently discard every local setting. Theme CONTENT is the
// exception: customOverlayCSS/savedThemes (and legacy customCSS) live outside
// SETTINGS_DEFAULTS, but sync-off write paths never route them to sync, so
// their presence is an unambiguous real-profile signal — without it a
// theme-only profile is misjudged hollow and the overwrite migration deletes
// the other device's theme. themePresetKey stays excluded: migrationV2 used
// to write it from sync-off devices, so alone it proves nothing.
function pbpCloudHasMeaningfulSyncSettings(cloud) {
  if (!cloud || typeof cloud !== "object") return false;
  if (["customOverlayCSS", "savedThemes", "customCSS"].some((key) => cloud[key] !== undefined)) {
    return true;
  }
  return Object.keys(cloud).some((key) => {
    if (PBP_SYNC_BOOKKEEPING_KEYS.includes(key)) return false;
    if (!Object.prototype.hasOwnProperty.call(SETTINGS_DEFAULTS, key)) return false;
    try { return JSON.stringify(cloud[key]) !== JSON.stringify(SETTINGS_DEFAULTS[key]); }
    catch (_) { return true; }
  });
}

// Options keeps a form snapshot and persists only values the user actually
// changed. This prevents an old, still-open options page from overwriting a
// newer import or chrome.storage update in untouched fields.
function pbpSettingsDelta(current, baseline) {
  const delta = {};
  const previous = baseline && typeof baseline === "object" ? baseline : {};
  for (const [key, value] of Object.entries(current || {})) {
    const existed = Object.prototype.hasOwnProperty.call(previous, key);
    const same = existed && (value === previous[key] ||
      JSON.stringify(value) === JSON.stringify(previous[key]));
    if (!same) delta[key] = value;
  }
  return delta;
}

// Persist the settings batch, routing the four large free-text keys through
// syncSetLarge (chunked, local-fallback on quota) so a single >8KB key can't
// reject the whole sync batch. The remaining keys go in one guarded set().
// Returns {ok, fellBackToLocal, error?} — never throws on quota.
async function persistSettings(data) {
  let batch = { ...data };
  let fellBackToLocal = false;
  // Test seam: allow stubbing storage + syncSetLarge from the harness.
  const testStorage = (typeof globalThis !== "undefined" && globalThis.__pbpTestStorage)
    ? globalThis.__pbpTestStorage : null;
  const ssl = (typeof globalThis !== "undefined" && globalThis.__pbpTestSyncSetLarge)
    ? globalThis.__pbpTestSyncSetLarge : syncSetLarge;
  try {
    return await pbpWithSecretStorageLock(async () => {
      // syncApiKeys secret routing (batch (4)): split every API_KEY_FIELDS entry +
      // exportTargets tokens out of the batch BEFORE anything else touches it,
      // and write them straight to chrome.storage.local instead of `storage`
      // (which may be chrome.storage.sync). Production fails closed if the
      // local routing flags cannot be read: an unknown state must never fall
      // through to an unfiltered write against a cached sync area.
      let flags = null;
      try {
        if (testStorage) {
          // Direct-open harness seam: production always uses the account-wide
          // sync marker through pbpReadSecretSyncStateUnlocked().
          flags = { optSyncEnabled: false, syncApiKeys: false };
          if (typeof chrome !== "undefined" && chrome.storage?.local) {
            flags = await chrome.storage.local.get(flags);
          }
        } else {
          flags = await pbpReadSecretSyncStateUnlocked();
        }
      } catch (_) {}
      if (!flags) throw new Error("secret routing state unavailable");
      const storage = testStorage || (flags
        ? (flags.optSyncEnabled ? chrome.storage.sync : chrome.storage.local)
        : await getSettingsStorage());
      if (!testStorage && flags) _settingsStorageCache = storage;
      const routingActive = !!flags && pbpSecretRoutingActive(flags.optSyncEnabled, flags.syncApiKeys);
      if (routingActive) {
        const { main, secrets } = pbpSplitSecretBatch(batch);
        batch = main;
        if (Object.keys(secrets).length) await chrome.storage.local.set(secrets);
      }
      for (const k of PBP_CHUNKED_SETTING_KEYS) {
        if (k in batch) {
          try { await ssl(k, batch[k]); }
          catch (e) {
            const testFallback = ssl !== syncSetLarge && /QUOTA|quota/i.test(e && e.message || "");
            if (e && e.pbpFellBackToLocal || testFallback) fellBackToLocal = true;
            else throw e;
          }
          delete batch[k];
        }
      }
      await storage.set(batch);
      // MV3 promise-based storage.set() rejects on failure (handled by catch below);
      // it never sets chrome.runtime.lastError (a callback-API artifact). Mirrors the
      // try/catch-only convention in options.js saveOverlayWithFallback (F4).
      return { ok: true, fellBackToLocal };
    });
  } catch (e) {
    return { ok: false, fellBackToLocal, error: e instanceof Error ? e : new Error(String(e)) };
  }
}

const API_KEY_FIELDS = ["pinboardToken","geminiApiKey","openaiApiKey","claudeApiKey","deepseekApiKey","qwenApiKey","minimaxApiKey","openrouterApiKey","groqApiKey","mistralApiKey","cohereApiKey","siliconflowApiKey","zhipuApiKey","kimiApiKey","githubModelsApiKey","customApiKey","jinaApiKey","waybackS3Key","waybackS3Secret","dictAnkiKey","dictEudicToken"];

function pbpExportTargetSecretKeys(targetId) {
  return targetId === "webhook" ? ["token", "url"] : ["token"];
}

function pbpExportTargetsHaveSecrets(targets) {
  if (!targets || typeof targets !== "object" || Array.isArray(targets)) return false;
  return Object.entries(targets).some(([targetId, cfg]) =>
    cfg && typeof cfg === "object" && !Array.isArray(cfg) &&
    pbpExportTargetSecretKeys(targetId).some((key) => typeof cfg[key] === "string" && cfg[key] !== ""));
}

// Tokens only. Used where a webhook URL must NOT count as secret evidence:
// previous releases synced it as an ordinary setting, so its presence in a
// pre-marker cloud proves nothing about the user opting into key sync.
function pbpExportTargetsHaveTokens(targets) {
  if (!targets || typeof targets !== "object" || Array.isArray(targets)) return false;
  return Object.values(targets).some((cfg) =>
    cfg && typeof cfg === "object" && !Array.isArray(cfg) &&
    typeof cfg.token === "string" && cfg.token !== "");
}

function pbpSyncPayloadHasSecrets(payload) {
  if (!payload || typeof payload !== "object") return false;
  if (API_KEY_FIELDS.some((key) =>
      typeof payload[key] === "string" && payload[key] !== "")) return true;
  return pbpExportTargetsHaveTokens(payload.exportTargets);
}

// Must run under pbp-secret-storage. syncApiKeys is one Chrome-account-wide
// marker because the credentials it governs share the same sync namespace.
// Legacy profiles had only a local marker; initialize the global marker once,
// preferring preservation whenever cloud secrets or legacy local opt-in exist.
async function pbpReadSecretSyncStateUnlocked({
  includeGlobalWhenSyncOff = false,
  persistInferredState = true,
} = {}) {
  const localFlags = await chrome.storage.local.get(["optSyncEnabled", "syncApiKeys"]);
  const optSyncEnabled = localFlags.optSyncEnabled === true;
  if (!optSyncEnabled && !includeGlobalWhenSyncOff) {
    return { optSyncEnabled: false, syncApiKeys: false };
  }
  const syncMarker = await chrome.storage.sync.get("syncApiKeys");
  let syncApiKeys = syncMarker.syncApiKeys;
  if (typeof syncApiKeys !== "boolean") {
    const cloud = await chrome.storage.sync.get(API_KEY_FIELDS.concat(["exportTargets"]));
    const cloudHasSecrets = pbpSyncPayloadHasSecrets(cloud);
    syncApiKeys = localFlags.syncApiKeys === true || cloudHasSecrets;
    if (persistInferredState && localFlags.syncApiKeys === true && !cloudHasSecrets) {
      const local = await chrome.storage.local.get(API_KEY_FIELDS.concat(["exportTargets"]));
      await chrome.storage.sync.set(pbpBuildKeysOnSnapshot(local, cloud));
    } else if (persistInferredState) {
      await chrome.storage.sync.set({ syncApiKeys });
    }
  }
  if (persistInferredState && Object.prototype.hasOwnProperty.call(localFlags, "syncApiKeys") &&
      typeof chrome.storage.local.remove === "function") {
    await chrome.storage.local.remove("syncApiKeys").catch(() => {});
  }
  return { optSyncEnabled, syncApiKeys };
}

function pbpReadSecretSyncState(options) {
  return pbpWithSecretStorageLock(() => pbpReadSecretSyncStateUnlocked(options));
}

function deobfuscateSettings(s) {
  API_KEY_FIELDS.forEach(k => { if (s[k]) s[k] = deobfuscateKey(s[k]); });
  return s;
}

// ---- syncApiKeys secret routing (batch (4)) ----
// When optSyncEnabled=true and syncApiKeys=false (the new default), the
// API_KEY_FIELDS plus export-target credentials/capability URLs never leave
// chrome.storage.local --
// only the rest of the settings batch rides chrome.storage.sync. These are
// the pure primitives; the async read/write wiring below them is the only
// part that touches chrome.storage directly.

// True iff secrets should be routed to local instead of following optSyncEnabled.
function pbpSecretRoutingActive(optSyncEnabled, syncApiKeys) {
  return !!optSyncEnabled && !syncApiKeys;
}

// Extension pages and the MV3 worker share one origin-scoped Web Lock, so a
// stale migration cannot interleave with a settings save or keys-on transfer.
// The fallback keeps direct-open test pages working; MV3 Chrome has Web Locks.
function pbpWithSecretStorageLock(work) {
  const locks = typeof navigator !== "undefined" && navigator.locks;
  return locks && typeof locks.request === "function"
    ? locks.request("pbp-secret-storage", work)
    : Promise.resolve().then(work);
}

// Deep-copies exportTargets with credentials deleted. Webhook endpoints are
// capability URLs in common services (the URL itself authorizes a caller), so
// they follow the same local-only / explicit syncApiKeys policy as tokens.
// Belt-only strip (no PBP_EXPORT_TARGETS secret-type lookup): the SW doesn't
// load export-targets.js and can't depend on the registry (same constraint
// options-backup.js's own token-strip already documents at :24-30).
function pbpStripExportTargetTokens(ets) {
  const cleaned = {};
  if (!ets || typeof ets !== "object") return cleaned;
  for (const [tid, cfg] of Object.entries(ets)) {
    cleaned[tid] = Object.assign({}, cfg);
    pbpExportTargetSecretKeys(tid).forEach((key) => { delete cleaned[tid][key]; });
  }
  return cleaned;
}

// A credential-bearing backup gets it in the filename: these files land in the
// same Downloads folder as ordinary ones, and the only thing distinguishing a
// plaintext key dump from a settings dump should not be opening it.
function pbpBackupFilename(date = new Date(), includeSecrets = false) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const marker = includeSecrets ? " with credentials" : "";
  return `Pinboard Bookmark Enhanced backup${marker} ${year}-${month}-${day}.json`;
}

// Shared schema-v3 snapshot used by manual settings export.
// extra.includeSecrets carries API_KEY_FIELDS and the untouched export-target
// credentials into the file. It is opt-in per export and never defaults on:
// the result is a plaintext key file, not a settings file.
function pbpBuildBackupSnapshot(settings, extra) {
  const s = settings || {};
  const x = extra || {};
  const includeSecrets = x.includeSecrets === true;
  const payload = {};
  Object.keys(SETTINGS_DEFAULTS).forEach((key) => {
    if (!includeSecrets && API_KEY_FIELDS.includes(key)) return;
    if (Object.prototype.hasOwnProperty.call(s, key)) payload[key] = s[key];
  });
  if (payload.exportTargets && !includeSecrets) payload.exportTargets = pbpStripExportTargetTokens(payload.exportTargets);
  payload.customOverlayCSS = typeof x.overlay === "string" ? x.overlay : "";
  payload.savedThemes = pbpSanitizeBackupThemes(Array.isArray(x.savedThemes) ? x.savedThemes : []);
  if (s.backupIncludeHighlights !== false && x.highlights) {
    payload._highlights = x.highlights;
    if (x.highlightsOwner) payload._highlightsOwner = x.highlightsOwner;
  }
  if (x.vocabulary) payload._vocabulary = pbpSanitizeBackupVocabulary(x.vocabulary);
  payload._backup = {
    createdAt: new Date().toISOString(),
    extensionVersion: String(globalThis.chrome?.runtime?.getManifest?.().version || ""),
    source: "manual",
  };
  if (includeSecrets) payload._backup.includesSecrets = true;
  payload._schemaVersion = 3;
  return payload;
}

// Counts the credentials actually carried by a backup: only non-empty values,
// so a file that merely has the fields present at "" is not reported (and not
// offered) as a credential backup.
function pbpCountBackupSecrets(data) {
  if (!pbpIsPlainRecord(data)) return 0;
  let count = API_KEY_FIELDS
    .filter((key) => typeof data[key] === "string" && data[key] !== "").length;
  const targets = data.exportTargets;
  if (pbpIsPlainRecord(targets)) {
    for (const [targetId, cfg] of Object.entries(targets)) {
      if (!pbpIsPlainRecord(cfg)) continue;
      count += pbpExportTargetSecretKeys(targetId)
        .filter((key) => typeof cfg[key] === "string" && cfg[key] !== "").length;
    }
  }
  return count;
}

// Migration-scrub variant: removes tokens only, leaving a legacy plaintext
// webhook URL in the sync copy. See pbpPlanSecretMigration for why deleting
// that URL account-wide would strand late-upgrading devices.
// TODO(two-release cleanup): a dormant export-target config never rewrites
// itself, so this residue can outlive its purpose. Once a release with the
// local-fill logic has been out long enough that every device of an account
// has its own copy, a later release should scrub the legacy sync URL in one
// shot.
function pbpStripExportTargetTokensOnly(ets) {
  const cleaned = {};
  if (!ets || typeof ets !== "object") return cleaned;
  for (const [tid, cfg] of Object.entries(ets)) {
    cleaned[tid] = Object.assign({}, cfg);
    delete cleaned[tid].token;
  }
  return cleaned;
}

// Splits a saveAll-shaped batch into { main, secrets }:
//  - main    = batch with API_KEY_FIELDS removed and exportTargets
//              (if present) credential-stripped -- safe to write to any area
//              getSettingsStorage() resolves to.
//  - secrets = the API_KEY_FIELDS that were present, plus (if batch had
//              exportTargets) the FULL untouched exportTargets -- the local truth.
// Pure: never mutates `batch`.
function pbpSplitSecretBatch(batch) {
  const main = Object.assign({}, batch);
  const secrets = {};
  API_KEY_FIELDS.forEach((k) => {
    if (Object.prototype.hasOwnProperty.call(main, k)) {
      secrets[k] = main[k];
      delete main[k];
    }
  });
  if (Object.prototype.hasOwnProperty.call(batch, "exportTargets")) {
    secrets.exportTargets = batch.exportTargets;
    main.exportTargets = pbpStripExportTargetTokens(batch.exportTargets);
  }
  return { main, secrets };
}

// Overlays requested API_KEY_FIELDS/exportTargets from localVals onto a copy of
// `s`. Without an explicit requested set, only keys already present in `s` are
// eligible. Own empty strings still win. Pure: never mutates inputs.
function pbpOverlaySecrets(s, localVals, requestedKeys) {
  const out = Object.assign({}, s);
  if (!localVals || typeof localVals !== "object") return out;
  const allowed = requestedKeys instanceof Set
    ? requestedKeys
    : new Set(Object.keys(out));
  API_KEY_FIELDS.forEach((k) => {
    if (allowed.has(k) && Object.prototype.hasOwnProperty.call(localVals, k)) out[k] = localVals[k];
  });
  if (allowed.has("exportTargets") && Object.prototype.hasOwnProperty.call(localVals, "exportTargets")) {
    // exportTargets is mixed: enabled/route/vault/folder are ordinary synced
    // settings, while token and webhook URL are credentials. Keep the main
    // area's non-secret fields and overlay only credential fields from this
    // device; replacing the whole object would silently disable cross-device
    // sync for every non-secret target setting whenever key sync is off.
    const mainTargets = out.exportTargets && typeof out.exportTargets === "object" && !Array.isArray(out.exportTargets)
      ? out.exportTargets : {};
    const localTargets = localVals.exportTargets;
    const merged = {};
    for (const [targetId, cfg] of Object.entries(mainTargets)) {
      merged[targetId] = cfg && typeof cfg === "object" && !Array.isArray(cfg)
        ? Object.assign({}, cfg) : cfg;
    }
    if (localTargets && typeof localTargets === "object" && !Array.isArray(localTargets)) {
      for (const [targetId, cfg] of Object.entries(localTargets)) {
        if (!cfg || typeof cfg !== "object" || Array.isArray(cfg)) continue;
        let target = merged[targetId];
        if (!target || typeof target !== "object" || Array.isArray(target)) target = {};
        else target = Object.assign({}, target);
        let touched = Object.prototype.hasOwnProperty.call(merged, targetId);
        for (const secretKey of pbpExportTargetSecretKeys(targetId)) {
          if (!Object.prototype.hasOwnProperty.call(cfg, secretKey)) continue;
          target[secretKey] = cfg[secretKey];
          touched = true;
        }
        if (touched) merged[targetId] = target;
      }
    }
    out.exportTargets = merged;
  }
  return out;
}

// Merge two exportTargets values KEEPING base credentials (unlike
// pbpStripExportTargetTokens-based flows, which drop them first). Base owns
// target existence and ordinary fields; fill's non-empty secret fields land
// on top.
// fillWins=true lets fill overwrite a non-empty base secret (keys-on enable:
// this device is opting ITS credentials in); fillWins=false only fills slots
// the base left empty/missing (keys-off copy-down: cloud is the truth, local
// only rescues credentials the cloud copy never carried).
function pbpMergeExportTargetSecrets(baseTargets, fillTargets, { fillWins = true } = {}) {
  const merged = {};
  if (baseTargets && typeof baseTargets === "object" && !Array.isArray(baseTargets)) {
    for (const [tid, cfg] of Object.entries(baseTargets)) {
      merged[tid] = cfg && typeof cfg === "object" && !Array.isArray(cfg) ? Object.assign({}, cfg) : cfg;
    }
  }
  if (fillTargets && typeof fillTargets === "object" && !Array.isArray(fillTargets)) {
    for (const [tid, cfg] of Object.entries(fillTargets)) {
      if (!cfg || typeof cfg !== "object" || Array.isArray(cfg)) continue;
      for (const secretKey of pbpExportTargetSecretKeys(tid)) {
        const value = cfg[secretKey];
        if (typeof value !== "string" || value === "") continue;
        const base = merged[tid];
        const baseIsRecord = base && typeof base === "object" && !Array.isArray(base);
        if (!fillWins && baseIsRecord &&
            typeof base[secretKey] === "string" && base[secretKey] !== "") continue;
        merged[tid] = baseIsRecord ? Object.assign({}, base) : {};
        merged[tid][secretKey] = value;
      }
    }
  }
  return merged;
}

// Builds the one account-wide keys-on snapshot (marker + full credential
// payload in a single write). Local non-empty values win — the enabling
// device is opting ITS credentials in — but a field this device never held
// keeps the existing non-empty cloud value: publishing "" there would
// tombstone a credential some other device still relies on, and a later
// keys-off copy-down would spread that destruction to every device.
function pbpBuildKeysOnSnapshot(local, cloud) {
  const src = local && typeof local === "object" ? local : {};
  const cld = cloud && typeof cloud === "object" ? cloud : {};
  const payload = { syncApiKeys: true };
  API_KEY_FIELDS.forEach((key) => {
    const own = typeof src[key] === "string" ? src[key] : "";
    const remote = typeof cld[key] === "string" ? cld[key] : "";
    payload[key] = own !== "" ? own : remote;
  });
  const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
  const mainTargets = own(cld, "exportTargets")
    ? cld.exportTargets
    : (own(src, "exportTargets") ? src.exportTargets : (SETTINGS_DEFAULTS.exportTargets || {}));
  payload.exportTargets = pbpMergeExportTargetSecrets(mainTargets, src.exportTargets, { fillWins: true });
  return payload;
}

function pbpClearSecrets(s) {
  const out = Object.assign({}, s);
  API_KEY_FIELDS.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(out, key)) out[key] = "";
  });
  if (Object.prototype.hasOwnProperty.call(out, "exportTargets")) {
    out.exportTargets = pbpStripExportTargetTokens(out.exportTargets);
  }
  return out;
}

function pbpRequestedSecretKeys(query, settings) {
  if (query === null) return new Set(API_KEY_FIELDS.concat(["exportTargets"]));
  const keys = typeof query === "string"
    ? [query]
    : Array.isArray(query)
      ? query
      : (query && typeof query === "object" ? Object.keys(query) : Object.keys(settings || {}));
  return new Set(keys.filter((key) => key === "exportTargets" || API_KEY_FIELDS.includes(key)));
}

// Compatibility/test overlay for an already-read settings object. Production
// readers use pbpReadSettingsWithSecrets() so area selection and overlay are
// atomic. Unknown/failed routing clears credentials rather than reviving stale
// sync residue. Must run before deobfuscate.
async function pbpApplySecretOverlay(s) {
  if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) return s;
  try {
    return await pbpWithSecretStorageLock(async () => {
      const flags = await pbpReadSecretSyncStateUnlocked();
      if (!pbpSecretRoutingActive(flags.optSyncEnabled, flags.syncApiKeys)) return s;
      const requested = pbpRequestedSecretKeys(undefined, s);
      const localVals = await chrome.storage.local.get([...requested]);
      return pbpOverlaySecrets(pbpClearSecrets(s), localVals, requested);
    });
  } catch (_) {
    return pbpClearSecrets(s);
  }
}

// Atomic settings read: storage-area selection, main read, and optional local
// secret overlay all share the same origin lock as migrations/toggles.
async function pbpReadSettingsWithSecrets(query) {
  return pbpWithSecretStorageLock(async () => {
    const state = await pbpReadSecretSyncStateUnlocked();
    const mainArea = state.optSyncEnabled ? chrome.storage.sync : chrome.storage.local;
    _settingsStorageCache = mainArea;
    try { localStorage.setItem("pp-sync-enabled", state.optSyncEnabled ? "1" : "0"); } catch (_) {}
    let settings = await mainArea.get(query);
    settings = await pbpResolveChunkedSettings(settings, mainArea, query);
    if (pbpSecretRoutingActive(state.optSyncEnabled, state.syncApiKeys)) {
      const requested = pbpRequestedSecretKeys(query, settings);
      const localSecrets = await chrome.storage.local.get([...requested]);
      settings = pbpOverlaySecrets(pbpClearSecrets(settings), localSecrets, requested);
    }
    return settings;
  });
}

// Builds the only safe routing-active migration plan. Sync is an old source:
// it may fill a missing local secret, but an existing local own-property
// (including "") always wins. For exportTargets, only missing credential
// fields on an existing local target may be recovered; deleted targets stay
// deleted.
function pbpPlanSecretMigration(fromSync, localVals) {
  const source = fromSync && typeof fromSync === "object" ? fromSync : {};
  const local = localVals && typeof localVals === "object" ? localVals : {};
  const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
  const syncKeys = API_KEY_FIELDS.filter((key) =>
    own(source, key) && typeof source[key] === "string" && source[key] !== "");
  const syncTargets = source.exportTargets;
  // Fill local from ANY secret field (token or webhook URL), but scrub only
  // tokens out of sync. A legacy plaintext webhook URL was an ordinary synced
  // setting in previous releases: deleting it before every device of the
  // account has copied it locally strands late-upgrading devices with no URL
  // at all. It is already on the account (no new exposure), and every NEW
  // write strips it from the sync copy (pbpSplitSecretBatch), so the residue
  // only ever shrinks.
  const fillExportTargets = pbpExportTargetsHaveSecrets(syncTargets);
  const scrubExportTargets = pbpExportTargetsHaveTokens(syncTargets);
  if (!syncKeys.length && !fillExportTargets) return null;

  const localPayload = {};
  syncKeys.forEach((key) => {
    if (!own(local, key)) localPayload[key] = source[key];
  });

  if (fillExportTargets) {
    if (!own(local, "exportTargets")) {
      localPayload.exportTargets = syncTargets;
    } else {
      const localTargets = local.exportTargets;
      if (localTargets && typeof localTargets === "object") {
        let merged = null;
        for (const [targetId, syncCfg] of Object.entries(syncTargets)) {
          if (!own(localTargets, targetId) || !syncCfg || typeof syncCfg !== "object") continue;
          const localCfg = localTargets[targetId];
          if (!localCfg || typeof localCfg !== "object") continue;
          for (const secretKey of pbpExportTargetSecretKeys(targetId)) {
            if (!own(syncCfg, secretKey) || own(localCfg, secretKey)) continue;
            if (!merged) merged = Object.assign({}, localTargets);
            const current = merged[targetId] || localCfg;
            merged[targetId] = Object.assign({}, current, { [secretKey]: syncCfg[secretKey] });
          }
        }
        if (merged) localPayload.exportTargets = merged;
      }
    }
  }

  return { localPayload, syncKeys, scrubExportTargets };
}

// While key sync is ON, keep this participating device's last observed cloud
// credential snapshot in local storage. If another device later turns the
// account-wide marker off, that same sync write scrubs the cloud copy; without
// this mirror every other device would switch to an empty local credential set.
// Only non-empty fields are mirrored, and a cloud "" NEVER deletes a local
// copy. This is a deliberate trade-off: a "" under a true marker can be a
// tombstone from a device that enabled key sync while holding nothing, and
// propagating it would destroy the only real copy of a credential. The cost
// is that a key revoked/cleared account-wide can survive in another device's
// local store until re-entered there — stale credentials fail loudly (401)
// and are recoverable; deleted ones are not. A device that stayed offline
// since the last credential change likewise retains only its older snapshot.
async function pbpMirrorSyncSecretsToLocalUnlocked() {
  const keys = ["syncApiKeys", ...API_KEY_FIELDS, "exportTargets"];
  const snapshot = await chrome.storage.sync.get(keys);
  if (snapshot.syncApiKeys !== true) return false;
  const mirror = {};
  API_KEY_FIELDS.forEach((key) => {
    if (typeof snapshot[key] === "string" && snapshot[key] !== "") mirror[key] = snapshot[key];
  });
  if (pbpExportTargetsHaveSecrets(snapshot.exportTargets)) {
    // Merge, never replace: the cloud snapshot wins where it carries a value,
    // but a credential only THIS device holds (a webhook the enabling device
    // never configured) must survive — wholesale replacement is the exact
    // "cloud void deletes the only real copy" destruction the flat fields
    // above already guard against.
    let localTargets;
    try {
      const local = await chrome.storage.local.get(["exportTargets"]);
      localTargets = local.exportTargets;
    } catch (_) {}
    mirror.exportTargets = pbpMergeExportTargetSecrets(
      snapshot.exportTargets, localTargets, { fillWins: false });
  }
  if (!Object.keys(mirror).length) return false;
  await chrome.storage.local.set(mirror);
  return true;
}

// One-time-per-boot (but always idempotent/re-runnable) cleanup: when secret
// routing is active but chrome.storage.sync still holds cloud-synced API keys
// or exportTargets tokens (pre-feature data, a stale multi-device sync, or the
// user just flipped syncApiKeys off), fill only missing local secrets and scrub
// sync. Iron rule: confirm local is safe FIRST, THEN remove from sync. Safe to
// call any number of times: a clean sync area (no secrets) is a no-op.
async function pbpMigrateSecretsToLocal() {
  try {
    await pbpWithSecretStorageLock(async () => {
      const flags = await pbpReadSecretSyncStateUnlocked();
      if (!pbpSecretRoutingActive(flags.optSyncEnabled, flags.syncApiKeys)) {
        if (flags.optSyncEnabled && flags.syncApiKeys) {
          await pbpMirrorSyncSecretsToLocalUnlocked();
        }
        return;
      }
      const keys = API_KEY_FIELDS.concat(["exportTargets"]);
      const fromSync = await chrome.storage.sync.get(keys);
      const localVals = await chrome.storage.local.get(keys);
      const plan = pbpPlanSecretMigration(fromSync, localVals);
      if (!plan) return; // already clean -- idempotent no-op

      // 1. Fill only missing local values and confirm the write.
      if (Object.keys(plan.localPayload).length) await chrome.storage.local.set(plan.localPayload);

      // 2. ONLY after local is safe: publish one internally-consistent global
      // keys-off snapshot. Empty fields are tombstones, not credentials.
      // A fill-only plan (legacy webhook URL copied local, nothing scrubbable)
      // writes nothing to sync — repeating an identical scrub every boot and
      // storage-warm tick would just burn sync write quota.
      if (plan.syncKeys.length || plan.scrubExportTargets) {
        // Cross-device TOCTOU guard: another device may have just explicitly
        // enabled key sync while this idempotent cleanup was mid-flight.
        // Re-read the marker at the last moment — scrubbing after a fresh
        // enable would silently undo the user's opt-in and tombstone the
        // credentials it just published. (The window cannot be closed
        // entirely without a sync-side CAS; this narrows it to one write.)
        let recheck = {};
        try { recheck = await chrome.storage.sync.get("syncApiKeys"); } catch (_) {}
        if (recheck.syncApiKeys === true) return;
        const scrub = { syncApiKeys: false };
        plan.syncKeys.forEach((key) => { scrub[key] = ""; });
        if (plan.scrubExportTargets) scrub.exportTargets = pbpStripExportTargetTokensOnly(fromSync.exportTargets);
        await chrome.storage.sync.set(scrub);
      }
    });
  } catch (e) {
    // Best-effort and re-runnable. A local read/write failure occurs before any
    // scrub, so the source remains available for the next boot/alarm retry.
    console.warn("[secrets-migration] failed, source retained when local was unsafe:", e && e.message || e);
  }
}

// Explicit keys-on -> keys-off transition. While key sync is enabled, sync is
// the current source of truth and local may be stale — but only for values the
// cloud actually HOLDS. A cloud "" can be a tombstone published by a device
// that never held the credential; copying it down would permanently destroy
// this device's only real copy, so empty cloud fields leave local untouched
// (staleness is recoverable, destruction is not).
async function pbpDisableSyncApiKeys() {
  await pbpWithSecretStorageLock(async () => {
    const flags = await pbpReadSecretSyncStateUnlocked();
    if (!flags.optSyncEnabled || !flags.syncApiKeys) return;

    const keys = API_KEY_FIELDS.concat(["exportTargets"]);
    const [fromSync, localVals] = await Promise.all([
      chrome.storage.sync.get(keys),
      chrome.storage.local.get(keys),
    ]);
    const localPayload = {};
    API_KEY_FIELDS.forEach((key) => {
      if (typeof fromSync[key] === "string" && fromSync[key] !== "") localPayload[key] = fromSync[key];
    });
    const cloudTargets = fromSync.exportTargets;
    if (cloudTargets && typeof cloudTargets === "object" && !Array.isArray(cloudTargets)) {
      // Cloud owns target existence and ordinary fields; this device's
      // non-empty credential fields survive where the cloud copy carries none.
      localPayload.exportTargets = pbpMergeExportTargetSecrets(
        cloudTargets, localVals.exportTargets, { fillWins: false });
    }

    // Confirm the snapshot locally before atomically publishing the
    // account-wide keys-off marker and empty credential tombstones.
    if (Object.keys(localPayload).length) await chrome.storage.local.set(localPayload);
    const scrubTargets = localPayload.exportTargets ||
      (localVals.exportTargets && typeof localVals.exportTargets === "object"
        ? localVals.exportTargets : (SETTINGS_DEFAULTS.exportTargets || {}));
    const scrub = {
      syncApiKeys: false,
      exportTargets: pbpStripExportTargetTokens(scrubTargets),
    };
    API_KEY_FIELDS.forEach((key) => { scrub[key] = ""; });
    await chrome.storage.sync.set(scrub);
  });
}

// Publish one complete account-wide keys-on snapshot so another device never
// observes a true marker paired with a partial/old credential payload. The
// snapshot builder preserves non-empty cloud values for fields this device
// does not hold — see pbpBuildKeysOnSnapshot.
async function pbpEnableSyncApiKeys() {
  await pbpWithSecretStorageLock(async () => {
    const flags = await pbpReadSecretSyncStateUnlocked();
    if (!flags.optSyncEnabled || flags.syncApiKeys) return;
    const keys = API_KEY_FIELDS.concat(["exportTargets"]);
    const [local, cloud] = await Promise.all([
      chrome.storage.local.get(keys),
      chrome.storage.sync.get(keys),
    ]);
    await chrome.storage.sync.set(pbpBuildKeysOnSnapshot(local, cloud));
  });
}

// ---- DOM cache helper (P1.6) ----
// Popup/options DOM is static — elements never removed, only toggled via classList.
// Memoize getElementById to avoid repeated DOM tree walks on hot paths.
// null results are NOT cached (lets later queries succeed if element is added).
const _domRefs = {};
function $id(id) {
  const cached = _domRefs[id];
  if (cached) return cached;
  const el = document.getElementById(id);
  if (el) _domRefs[id] = el;
  return el;
}

// ---- Reduced motion ----
// CSS cannot gate programmatic scrolling: per CSSOM-View an explicit `behavior`
// dictionary member on scrollIntoView() overrides the `scroll-behavior` property,
// so a `scroll-behavior: auto !important` inside a prefers-reduced-motion block
// never reaches these calls (and no stylesheet here sets `smooth` in the first
// place). Whole-viewport travel is the most vestibular motion in the product, so
// the check has to live at the call site. Route every smooth scroll through here.
function pbpPrefersReducedMotion() {
  return typeof matchMedia === "function"
    && matchMedia("(prefers-reduced-motion: reduce)").matches;
}
function pbpScrollIntoView(el, opts) {
  if (!el || typeof el.scrollIntoView !== "function") return;
  el.scrollIntoView(pbpPrefersReducedMotion() ? { ...opts, behavior: "instant" } : opts);
}

// Pinboard token shape check, shared by the options field warning and the
// popup login gate so the two ends of the same format contract cannot drift:
// username:TOKEN, both parts non-empty, no whitespace, key >= 8 chars.
// Returns null for empty input (nothing to judge yet), true/false otherwise.
function pbpIsValidTokenFormat(token) {
  if (!token) return null;
  const idx = token.indexOf(":");
  if (idx < 1) return false;
  const user = token.slice(0, idx);
  const key = token.slice(idx + 1);
  return user.length > 0 && key.length >= 8 && !/\s/.test(token);
}

let _activeConfirmPopover = null;

// Close the open confirm popover, without running onCancel and without
// stealing focus back to its opener. For callers that are tearing the
// anchor's context down anyway (popup's form reset drops the Delete button),
// where "the user cancelled" is the wrong story to tell.
//
// `anchor` is optional but callers should pass it: only ONE popover is ever
// open (showConfirmPopover dismisses the previous one before building the
// next), so an unguarded call closes whichever popover happens to be up --
// including one the caller has nothing to do with. Real path, found in
// review: open "clear the offline queue", tab to the URL field, type, and
// popup's form reset silently closed that confirm.
function pbpDismissActiveConfirm(anchor) {
  if (anchor && _activeConfirmPopover?.anchor !== anchor) return;
  _activeConfirmPopover?.dismiss({ restoreFocus: false, animate: false });
}

// Render a .confirm-popover beside `anchor`, portaled to <body> so buttons are
// never nested inside an interactive anchor.
// Caller supplies pre-translated strings via { msg, yesText, noText }.
// Popover self-dismisses on Escape / Cancel / Confirm; only one can be open.
function showConfirmPopover(anchor, opts) {
  if (!anchor) return;
  if (_activeConfirmPopover?.anchor === anchor && _activeConfirmPopover.pop.isConnected) return;
  const { msg, yesText, noText, onConfirm, onCancel } = opts || {};
  const opener = document.activeElement;
  _activeConfirmPopover?.dismiss({ restoreFocus: false, animate: false });
  const pop = document.createElement("div");
  pop.className = "confirm-popover";
  pop.setAttribute("role", "dialog");
  pop.setAttribute("aria-modal", "false");
  pop.setAttribute("aria-label", msg || "Confirm");
  const m = document.createElement("span");
  m.className = "confirm-msg";
  m.textContent = msg || "";
  const yes = document.createElement("button");
  yes.type = "button";
  yes.className = "confirm-yes";
  yes.textContent = yesText || "OK";
  const no = document.createElement("button");
  no.type = "button";
  no.className = "confirm-no";
  no.textContent = noText || "Cancel";
  pop.append(m, yes, no);
  document.body.appendChild(pop);
  // Anchors living in the top layer (native [popover] hosts, e.g. the
  // reader's highlight card) would paint OVER a plain body child; promote
  // the confirm itself to a manual popover so it stacks above its opener.
  const hostPopover = typeof anchor.closest === "function" ? anchor.closest("[popover]") : null;
  if (hostPopover) {
    pop.setAttribute("popover", "manual");
    try { pop.showPopover(); } catch (_) {}
  }

  const anchorRect = anchor.getBoundingClientRect();
  const popRect = pop.getBoundingClientRect();
  const gap = 4;
  const viewportWidth = document.documentElement.clientWidth;
  const viewportHeight = document.documentElement.clientHeight;
  // Align the popover's left edge to the anchor's and let it grow rightwards.
  // Aligning the RIGHT edges instead (the earlier rule) pushes a wide popover
  // left across whatever the anchor sits beside: for a button in the settings
  // pane that is the sidebar nav, which it then covers. Flip to right-edge
  // alignment only when growing rightwards would leave the CONTENT edge --
  // the nearest .panel, not the viewport: on a wide window the settings card
  // ends far left of the viewport, and a row-trailing delete button anchored
  // a popover that jutted past the card border into the void (real-device
  // report, the mirror image of the earlier left-edge clip). popup has no
  // .panel and keeps the viewport bound. Clamp as a last resort for a popover
  // wider than the bound itself.
  const panelEl = typeof anchor.closest === "function" ? anchor.closest(".panel") : null;
  const rightBound = Math.min(viewportWidth - gap,
    panelEl ? panelEl.getBoundingClientRect().right : Infinity);
  const left = anchorRect.left + popRect.width <= rightBound
    ? Math.max(gap, anchorRect.left)
    : Math.max(gap, Math.min(anchorRect.right - popRect.width, rightBound - popRect.width));
  const below = anchorRect.bottom + gap;
  const top = below + popRect.height <= viewportHeight - gap
    ? below
    : Math.max(gap, anchorRect.top - popRect.height - gap);
  Object.assign(pop.style, {
    position: "fixed",
    left: `${Math.round(left)}px`,
    top: `${Math.round(top)}px`,
    right: "auto",
    bottom: "auto",
  });

  let dismissed = false;
  function dismiss({ restoreFocus = true, animate = true } = {}) {
    if (dismissed) return;
    dismissed = true;
    if (_activeConfirmPopover?.pop === pop) _activeConfirmPopover = null;
    document.removeEventListener("keydown", onKey, true);
    document.removeEventListener("pointerdown", onDocPointerDown, true);
    window.removeEventListener("resize", dismiss);
    window.removeEventListener("scroll", dismiss, true);
    if (restoreFocus && opener && opener.isConnected && typeof opener.focus === "function") opener.focus();

    const animateOut = animate
      && document.documentElement.classList.contains("motion-ready")
      && !pbpPrefersReducedMotion();
    if (!animateOut) {
      pop.remove();
      return;
    }
    pop.inert = true;
    pop.setAttribute("aria-hidden", "true");
    pop.classList.add("is-closing");
    const remove = () => pop.remove();
    pop.addEventListener("transitionend", remove, { once: true });
    const outMs = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--motion-pop-out")) || 100;
    setTimeout(remove, outMs + 50);
  }
  function onKey(ev) {
    if (ev.key === "Escape") {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      dismiss();
      if (onCancel) onCancel();
    }
  }
  // Light dismiss: pointerdown (not click -- the opening click's own bubble
  // would fire a click listener attached synchronously) anywhere outside the
  // popover cancels, same as Escape. The anchor is excluded so re-clicking
  // the opener doesn't dismiss-then-reopen in the same gesture.
  function onDocPointerDown(ev) {
    if (pop.contains(ev.target)) return;
    if (anchor.contains && anchor.contains(ev.target)) return;
    dismiss();
    if (onCancel) onCancel();
  }
  function reportConfirmError(error) {
    console.error("[confirm] action failed", error);
  }
  pop.addEventListener("click", (e) => e.stopPropagation());
  no.addEventListener("click", () => { dismiss(); if (onCancel) onCancel(); });
  yes.addEventListener("click", () => {
    dismiss();
    if (!onConfirm) return;
    try {
      const result = onConfirm();
      if (result && typeof result.catch === "function") result.catch(reportConfirmError);
    } catch (error) {
      reportConfirmError(error);
    }
  });
  _activeConfirmPopover = { anchor, pop, dismiss };
  document.addEventListener("keydown", onKey, true);
  document.addEventListener("pointerdown", onDocPointerDown, true);
  window.addEventListener("resize", dismiss);
  window.addEventListener("scroll", dismiss, true);
  no.focus();
}

// ===================== Feedback Card (B2) =====================
function showFeedback({ variant = "info", title = "", message = "", messageNode = null, actions = [], details = "", autoHide = 0, target } = {}) {
  const card = document.createElement("div");
  card.className = "feedback-card";
  card.dataset.variant = variant;
  card.setAttribute("role", variant === "error" || variant === "warning" ? "alert" : "status");
  card.setAttribute("aria-live", "polite");

  const icon = document.createElement("span");
  icon.className = "fc-icon";
  // All variants use inline SVG — literal ⚠ / ✓ / ℹ glyphs fall back to Segoe UI Emoji
  // on Windows and stall ~1.6s on first paint. currentColor inherits the variant colour.
  icon.innerHTML = (variant === "error" || variant === "warning") ? PBP_ICONS.warning
    : variant === "success" ? PBP_ICONS.check
    : PBP_ICONS.info;
  card.appendChild(icon);

  const body = document.createElement("div");
  body.className = "fc-body";
  if (title) {
    const t = document.createElement("div");
    t.className = "fc-title"; t.textContent = title;
    body.appendChild(t);
  }
  if (messageNode) {
    const m = document.createElement("div");
    m.className = "fc-message";
    m.appendChild(messageNode);
    body.appendChild(m);
  } else if (message) {
    const m = document.createElement("div");
    m.className = "fc-message"; m.textContent = message;
    body.appendChild(m);
  }
  if (actions.length) {
    const actRow = document.createElement("div");
    actRow.className = "fc-actions";
    actions.forEach(({ label, onClick, secondary }) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = secondary ? "fc-btn-secondary" : "fc-btn";
      btn.textContent = label;
      btn.addEventListener("click", () => onClick?.(card));
      actRow.appendChild(btn);
    });
    body.appendChild(actRow);
  }
  if (details) {
    const pre = document.createElement("pre");
    pre.className = "fc-details";
    pre.textContent = details;
    body.appendChild(pre);
  }
  card.appendChild(body);

  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.className = "fc-dismiss";
  dismiss.setAttribute("aria-label", typeof t === "function" ? t("aiErrorDismiss") : "Dismiss");
  dismiss.textContent = "×";
  let dismissed = false;
  const remove = () => {
    if (dismissed) return;
    dismissed = true;
    card.classList.add("dismissing");
    setTimeout(() => card.remove(), 120);
  };
  dismiss.addEventListener("click", remove);
  card.appendChild(dismiss);

  const mount = target || document.querySelector(".bottom-bar")?.parentElement || document.body;
  const beforeNode = target ? null : document.querySelector(".bottom-bar");
  if (beforeNode && beforeNode.parentElement === mount) {
    mount.insertBefore(card, beforeNode);
  } else {
    mount.appendChild(card);
  }

  if (autoHide > 0) setTimeout(remove, autoHide);

  return { dismiss: remove, element: card };
}

// ===================== URL Tracking Param Stripping (B4) =====================
const TRACKING_PARAMS_TIER1 = [
  "utm_source","utm_medium","utm_campaign","utm_term","utm_content","utm_id",
  "gclid","gclsrc","dclid","gbraid","wbraid","fbclid","msclkid","yclid","ysclid","_openstat",
  "mc_cid","mc_eid","mkt_tok",
  "_hsenc","_hsmi","__hstc","__hssc","__hsfp","hsCtaTracking",
  "vero_id","vero_conv","oly_anon_id","oly_enc_id",
  "mtm_campaign","mtm_source","mtm_medium","mtm_keyword","mtm_content","mtm_cid",
  "pk_campaign","pk_source","pk_medium","pk_keyword",
  "__s","wickedid","rb_clickid","s_cid","twclid",
  "ml_subscriber","ml_subscriber_hash",
  "action_object_map","action_type_map","action_ref_map",
  "cjevent","cjdata","ir_campaignid","ir_adid","ir_partnerid",
];

const TRACKING_PARAMS_TIER2 = [
  "_ga","_gl","_branch_match_id","_branch_referrer","mc_tc","ICID","__twitter_impression",
  "at_campaign","at_medium","at_custom1","at_custom2","at_custom3","at_custom4",
  "hmb_campaign","hmb_source","hmb_medium","spm","_trkparms","_trksid",
];

const TRACKING_PARAMS_TIER3 = [
  "si","igshid","igsh","ref","ref_src","ref_url","source","feature",
];

const HOST_TRACKING_RULES = {
  "amazon": ["pd_rd_w","pd_rd_wg","pd_rd_r","pd_rd_p","pd_rd_i","pf_rd_p","pf_rd_r","pf_rd_s","pf_rd_t","pf_rd_i","pf_rd_m","_encoding","ref_","psc","qid","sr","srs","__mk_de_DE","__mk_en_US","spIA","smid","crid","keywords","sprefix"],
  "youtube.com": ["feature","kw","pp","si"],
  "youtu.be": ["feature","kw","pp","si"],
  "google":   ["ved","ei","gs_lp","gs_lcrp","gs_lcp","gs_ssp","gws_rd","sxsrf","sourceid","rlz","aqs","uact","oq","usg","sca_esv","sca_upv","iflsig","bih","biw","dpr"],
  "x.com":    ["s","t","cn","ref_src","ref_url","twclid"],
  "twitter.com": ["s","t","cn","ref_src","ref_url","twclid"],
  "linkedin.com": ["trk","trackingId","refId","lipi","midToken","midSig","eBP","lgCta","recommendedFlavor"],
  "facebook.com": ["__tn__","__xts__","__cft__","eid","comment_tracking","dti","app","ls_ref","action_history"],
  "bing.com": ["cvid","qs","qp","sk","sp","sc","form","pq"],
  "aliexpress": ["ws_ab_test","algo_expid","algo_pvid","btsid","scm","scm_id","scm-url","aff_trace_key","aff_platform","aff_request_id","spm"],
  "tiktok.com": ["_d","_t","_r","is_copy_url","is_from_webapp","sender_device","share_app_id","share_link_id","u_code","preview_pb"],
  "reddit.com": ["share_id","correlation_id","rdt","$deep_link","_branch_match_id","ref_campaign","ref_source"],
};

const OAUTH_PATH_RE = /\/(oauth|auth|callback|sso|saml|openid|signin-callback|login\/callback)/i;
const OAUTH_TOKEN_KEYS = new Set(["access_token","id_token","refresh_token","oauth_token","oauth_verifier"]);

function _matchHostRule(hostname) {
  const lower = hostname.toLowerCase();
  for (const key of Object.keys(HOST_TRACKING_RULES)) {
    if (lower === key || lower.endsWith("." + key) || lower.startsWith(key + ".") || lower.includes("." + key + ".")) {
      return HOST_TRACKING_RULES[key];
    }
  }
  return null;
}

function _isOAuthCallback(u) {
  if (OAUTH_PATH_RE.test(u.pathname)) return true;
  const params = u.searchParams;
  // Known false-negative: URLs like ?code=SAVE20&state=CA (promo + US state)
  // will skip cleaning. Accepted trade-off — protecting OAuth callbacks
  // is higher value than ensuring 100% cleanup on edge-case shopping URLs.
  if (params.has("code") && (params.has("state") || params.has("session_state"))) return true;
  for (const key of params.keys()) if (OAUTH_TOKEN_KEYS.has(key)) return true;
  if (u.hostname === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(u.hostname)) return true;
  return false;
}

function stripTrackingParams(urlStr, settings = {}) {
  const {
    enabled = true,
    aggressiveMode = false,
    customParams = [],
    excludeParams = [],
  } = settings;
  const original = urlStr;
  if (!enabled) return { cleaned: urlStr, removedCount: 0, original };

  let u;
  try { u = new URL(urlStr); }
  catch { return { cleaned: urlStr, removedCount: 0, original }; }

  if (_isOAuthCallback(u)) return { cleaned: urlStr, removedCount: 0, original };

  const exclude = new Set(excludeParams.map(s => s.trim()).filter(Boolean));
  const toStrip = new Set([
    ...TRACKING_PARAMS_TIER1,
    ...TRACKING_PARAMS_TIER2,
    ...(aggressiveMode ? TRACKING_PARAMS_TIER3 : []),
    ...customParams.map(s => s.trim()).filter(Boolean),
  ]);
  const hostRule = _matchHostRule(u.hostname);
  if (hostRule) hostRule.forEach(p => toStrip.add(p));

  // Special-case Amazon `tag` preservation unless aggressive
  const hostLower = u.hostname.toLowerCase();
  const isAmazon = /(^|\.)amazon\./.test(hostLower);
  if (isAmazon && !aggressiveMode) exclude.add("tag");

  let removed = 0;
  for (const k of [...u.searchParams.keys()]) {
    if (exclude.has(k)) continue;
    let shouldStrip = toStrip.has(k);
    if (!shouldStrip && hostRule) {
      for (const rule of hostRule) {
        if (rule.endsWith("_") && k.startsWith(rule)) { shouldStrip = true; break; }
      }
    }
    if (shouldStrip) {
      u.searchParams.delete(k);
      removed++;
    }
  }

  let result = u.toString();
  if (u.search === "" && result.includes("?")) {
    result = result.replace(/\?(?=#|$)/, "");
  }

  return { cleaned: result, removedCount: removed, original };
}

// True when two URLs refer to the same bookmark ignoring tracking params.
// Used by background.js to avoid flipping the active tab's icon for an
// unrelated saved/deleted bookmark.
function pbpSameBookmark(aUrl, bUrl) {
  if (!aUrl || !bUrl) return false;
  if (aUrl === bUrl) return true;
  try {
    return stripTrackingParams(aUrl, {}).cleaned === stripTrackingParams(bUrl, {}).cleaned;
  } catch (_) { return false; }
}

// ===================== Empty State Illustrations (B8) =====================
const EMPTY_STATE_SVG = {
  bookmark: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>`,
  tag: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>`,
  spark: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v6"/><path d="M12 16v6"/><path d="M4.93 4.93l4.24 4.24"/><path d="M14.83 14.83l4.24 4.24"/><path d="M2 12h6"/><path d="M16 12h6"/><path d="M4.93 19.07l4.24-4.24"/><path d="M14.83 9.17l4.24-4.24"/></svg>`,
};

function _parseSvg(svgString) {
  const doc = new DOMParser().parseFromString(svgString, "image/svg+xml");
  return doc.documentElement;
}

function injectEmptyState(container, svgKey, messageText) {
  if (!container) return;
  while (container.firstChild) container.removeChild(container.firstChild);
  const wrap = document.createElement("div");
  wrap.className = "empty-state";
  const svgNode = _parseSvg(EMPTY_STATE_SVG[svgKey] || EMPTY_STATE_SVG.bookmark);
  wrap.appendChild(svgNode);
  const msg = document.createElement("div");
  msg.textContent = messageText;
  wrap.appendChild(msg);
  container.appendChild(wrap);
}

// ===================== AI summary restore guard (B4) =====================
// Decide whether to auto-restore a cached AI summary into the description.
// Skip when (a) the page is already a bookmark — checkExistingBookmark restores
// the user's saved `extended`, which already owns any summary they kept — or
// (b) the description already contains a legacy [AI Summary] block.
// Pure function; extracted here for testability (popup-ai.js uses it at runtime).
// Match one structurally complete legacy block anywhere in the description
// (audit A11). The old end-anchored variant ($) had two
// failure modes: a user note typed AFTER the block made it invisible
// (regenerate appended a duplicate, remove found nothing), and with two
// markers present the lazy [\s\S]*? was forced by the anchor to span
// from the FIRST marker to the LAST </blockquote>, eating the user text
// between them. Minimal match is safe: escapeForExtended encodes < and >
// in the summary text, so a wrapped block can never contain a literal
// closing tag. Callers that need "the last block" iterate with the g
// flag (upsertSummary/removeSummary build a global copy via .source).
const _AI_BQ_REGEX_SHARED = /(\n\n)?\[AI Summary\]\n<blockquote>[\s\S]*?<\/blockquote>/;
function pbpShouldRestoreCachedSummary(existing, descValue) {
  if (existing) return false;
  return !_AI_BQ_REGEX_SHARED.test(descValue || "");
}

// ===================== Toolbar icon tri-state (display only) =====================
// Resolve the icon state ("default" | "saved" | "toread") from a statusCache entry.
// cached = statusCache entry. Real posts/get data wins; toreadHint is the
// save-path display stub (never synthesized into posts — popup edit-prefill
// consumes real posts shape only).
// Pure function; extracted here for testability (background.js uses it at runtime).
function iconStateFor(cached) {
  if (!cached || !cached.bookmarked) return "default";
  const post = Array.isArray(cached.posts) ? cached.posts[0] : undefined;
  if (post) return post.toread === "yes" ? "toread" : "saved";
  return cached.toreadHint === true ? "toread" : "saved";
}

// ===================== Reader typography tiers (md-preview) =====================
// Persisted as TIER IDS (pbp_font_tier -2..2 / pbp_leading_tier -1..1,
// chrome.storage.local, per-device like pbp_zen_width), resolved to CSS values
// only at apply time -- a stored value is never trusted into CSS. Font tiers
// MULTIPLY #rendered-view's clamp() (relative scale keeps the rem+vw+zoom base
// authoritative); leading tiers all sit inside the CJK 1.5-2.0 comfort band.
// Lives HERE (not md-reader.js) because md-preview.js must apply the stored
// tiers BEFORE its first render, and md-reader.js is a LATER defer script --
// depending on it was a real load-order race (Codex acceptance: delaying
// md-reader.js 1.8s shipped an unstyled render). shared.js precedes
// md-preview.js in md-preview.html, so availability is structural, not timed.
// The runtime "Aa" panel/persistence stay in md-reader.js. SW-safe:
// definitions only, nothing here touches document at load time.
const PBP_TYPO_FONT_SCALES = { "-2": 0.9, "-1": 0.95, "0": 1, "1": 1.1, "2": 1.2 };
const PBP_TYPO_LEADINGS = { "-1": 1.6, "0": 1.75, "1": 1.9 };
function pbpTypoSanitize(fontTier, leadingTier) {
  const has = (map, v) => typeof v === "number" && Object.prototype.hasOwnProperty.call(map, String(v));
  return {
    font: has(PBP_TYPO_FONT_SCALES, fontTier) ? fontTier : 0,
    leading: has(PBP_TYPO_LEADINGS, leadingTier) ? leadingTier : 0,
  };
}
// Single apply path: sanitize -> body inline custom properties. Default tiers
// REMOVE the property so the CSS fallback (the shipped value) stays the single
// source of truth.
function pbpTypoApplyVars(fontTier, leadingTier) {
  const t2 = pbpTypoSanitize(fontTier, leadingTier);
  const st = document.body.style;
  if (t2.font === 0) st.removeProperty("--pbp-font-scale");
  else st.setProperty("--pbp-font-scale", String(PBP_TYPO_FONT_SCALES[String(t2.font)]));
  if (t2.leading === 0) st.removeProperty("--pbp-prose-leading");
  else st.setProperty("--pbp-prose-leading", String(PBP_TYPO_LEADINGS[String(t2.leading)]));
  return t2;
}
