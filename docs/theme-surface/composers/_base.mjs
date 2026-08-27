// Pinboard Theme Surface — _base composer
// Emits:
//   1. CSS custom properties (:root scope) derived from tokens
//   2. inline_base_rules from manifest.json — the !important overrides that defeat
//      Pinboard's inline style="" + onmouseover="this.style..." writes.
// Every concrete composer MUST concatenate baseLayer(tokens) before its own output.

import { expandSitePalette, varName } from "./_util.mjs";

export function baseLayer(tokens) {
  // expandSitePalette, not expandPalette: the pinboard.in surface adds a 4.5:1
  // text floor for tag-fg / url-link-fg / destroy that is WRONG for the three
  // extension surfaces (destroy is a FILL there). See that function's header.
  const p = expandSitePalette(tokens.palette);
  const typo = tokens.typo;
  const space = tokens.space;
  const radius = tokens.radius || {};
  const border = tokens.border || {};

  // Emit every palette key as --pinboard-<key>. expandPalette() filled the
  // fallbacks so this covers both v1-required and v2-canonical slots.
  const paletteVars = Object.entries(p).filter(([, val]) => val != null);

  const vars = [
    ...paletteVars,

    // typo
    ["font-family", typo.family],
    ["font-size-base", typo["size-base"]],
    ["font-size-sm", typo["size-sm"] || typo["size-base"]],
    ["font-size-lg", typo["size-lg"] || typo["size-base"]],
    ["font-size-xs", typo["size-xs"] || typo["size-sm"] || typo["size-base"]],
    ["line-height", typo["line-height"]],
    ["weight-body", typo["weight-body"] || "400"],
    ["weight-heading", typo["weight-heading"] || "700"],

    // space
    ["space-unit", space.unit],
    ["space-bookmark-gap", space["bookmark-gap"]],
    ["space-main-padding", space["main-padding"]],
    ["space-sub-banner-y", space["sub-banner-y"] || space.unit],
    ["space-right-bar-gap", space["right-bar-gap"] || space.unit],
    ["space-form-gap", space["form-gap"] || space.unit],

    // radius
    ["radius-sm", radius.sm || "0"],
    ["radius-md", radius.md || radius.sm || "0"],
    ["radius-lg", radius.lg || radius.md || "0"],

    // border
    ["border-width", border.width || "1px"],
    ["border-style", border.style || "solid"],
    ["border-hairline", border.hairline || `1px dotted ${p.border}`]
  ];

  const rootBlock =
    `:root {\n` +
    vars.filter(([, v]) => v != null)
        .map(([k, v]) => `  ${varName(k)}: ${v};`)
        .join("\n") +
    `\n}\n`;

  return rootBlock + INLINE_OVERRIDES;
}

// ------------------------------------------------------------------
// inline_base_rules — mirrors manifest.json §inline_base_rules verbatim.
// These are the non-negotiable defenses against Pinboard's inline writes.
// ------------------------------------------------------------------
const INLINE_OVERRIDES = `
/* === inline_base_rules (manifest.json §inline_base_rules) === */

/* override.tr-onmouseover-yellow — defeat inline style.background on row hover */
#right_bar table tr[onmouseover],
#main_column table tr[onmouseover] {
  background: transparent !important;
}
#right_bar table tr[onmouseover]:hover,
#main_column table tr[onmouseover]:hover {
  background: var(--pinboard-row-hover) !important;
}

/* override.bookmark-separator — tokenize "border-top:1px dotted #aaa" */
#main_column .bookmark[style*="border-top"] {
  border-top: var(--pinboard-border-hairline) !important;
}

/* override.private-bg — tokenize inline pink private bg + suppress pink border */
.bookmark.private[style*="background"],
.bookmark[style*="#fff1f1"],
.bookmark[style*="#fff4f4"] {
  background: var(--pinboard-private-bg) !important;
  border-top-color: transparent !important;
  border-right-color: transparent !important;
  border-left-color: transparent !important;
}

/* override.sub-banner-count-color — tokenize hardcoded #aa5511 */
#sub_banner [style*="#aa5511"],
.bookmark_count[style*="color"] {
  color: var(--pinboard-accent) !important;
}

/* override.muted-aaa — tokenize widespread inline #aaa */
[style*="color:#aaa"],
[style*="color: #aaa"] {
  color: var(--pinboard-muted) !important;
}

/* override.bundle-table-width — neutralize 830px hard width */
#main_column table[style*="width:830"] {
  width: 100% !important;
  max-width: 100% !important;
}

/* override.bundle-slot-input — tokenize inline dotted 20px inputs */
input[type="text"][name^="id_"][style*="border"] {
  border: var(--pinboard-border-width) solid var(--pinboard-border) !important;
  background: var(--pinboard-input-bg) !important;
  color: var(--pinboard-fg) !important;
  width: 32px !important;
}

/* override.per-page-active — tokenize active ffa pill */
table.per_page_widget [style*="background:#ffa"] {
  background: var(--pinboard-accent-alpha) !important;
  color: var(--pinboard-fg) !important;
}

/* override.bulk-confirm-bar — defeat inline color:#fff on #confirm > span and color:#ffa on confirm/cancel anchors */
#bulk_edit_box #confirm {
  background: var(--pinboard-bg-surface) !important;
  padding: 8px 12px !important;
  border-top: 1px solid var(--pinboard-border) !important;
  margin-top: 4px !important;
  border-radius: 4px !important;
}
#bulk_edit_box #confirm,
#bulk_edit_box #confirm > span,
#bulk_edit_box #confirm > #confirm_message {
  color: var(--pinboard-fg) !important;
}
#bulk_edit_box #confirm a {
  color: var(--pinboard-accent) !important;
  font-weight: 600 !important;
  text-decoration: underline !important;
}
#bulk_edit_box #confirm a:hover {
  color: var(--pinboard-accent-hover) !important;
}

/* override.generic-bgcolor — defensive against legacy HTML attr */
[bgcolor] { background-color: transparent !important; }

/* override.generic-html-color — defensive against legacy <font> */
font[color], font[size] { color: inherit !important; font-size: inherit !important; }

/* override.generic-fixed-width — defensive against layout tables */
table[width]:not([width="100%"]) { width: auto !important; max-width: 100% !important; }

/* === selection (applied globally; composers may override scoped) === */
::selection          { background: var(--pinboard-selection-bg); color: var(--pinboard-selection-fg); }
::-moz-selection     { background: var(--pinboard-selection-bg); color: var(--pinboard-selection-fg); }
`;
