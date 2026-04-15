// Composer: classic-list-v2
// Rewritten after Sprint 2 pilot (pilots/FINDINGS.md) exposed 6.8% selector
// coverage. v2 emits the canonical bare + scoped selectors found in >=10/13
// shipped themes (see pilots/theme-census.json).
//
// Selector scoping strategy (three worlds):
//   1. `body#pinboard ...` — typed text defaults for logged-in app pages
//   2. `body:not(#pinboard) ...` — popup / save-bookmark / edit frame
//   3. bare (`.bookmark`, `a.tag`, `input[type=submit]` ...) — app-wide
//
// This composer is stateless — `compose(tokens) -> css string`.
// Call contract: tokens MUST validate against tokens.schema.json v1 + palette
// extensions below (success, muted-soft, private-accent, url-link-*).

import { baseLayer } from "./_base.mjs";
import { patternsLayer } from "./_patterns.mjs";
import { v } from "./_util.mjs";

export function compose(tokens) {
  return baseLayer(tokens) + emit(tokens) + patternsLayer(tokens);
}

function emit(tokens) {
  const maxWidth = tokens.layout?.["max-width"];
  const bookmarkStyle = tokens.layout?.["bookmark-style"] || "flat"; // "flat" | "card"
  // Private-bookmark treatment moved to patterns.private-badge (emitted by _patterns.mjs).
  // Composer now only provides the tint-bg default; patterns overrides it if set.
  const sizeBase = tokens.typo?.["size-base"] || "13px";
  const sizeSm = tokens.typo?.["size-sm"] || sizeBase;
  const sizeXs = tokens.typo?.["size-xs"] || sizeSm;
  const sizeLg = tokens.typo?.["size-lg"] || sizeBase;

  return `
/* === composer: classic-list-v2 — canonical surface inventory === */

/* ---- App shell typography (body#pinboard) ---- */
body#pinboard {
  background: ${v("bg")} !important;
  color: ${v("fg")} !important;
  font-family: ${v("font-family")} !important;
  font-size: ${sizeBase} !important;
  line-height: ${v("line-height")} !important;
}
body#pinboard table, body#pinboard td, body#pinboard th,
body#pinboard p, body#pinboard b, body#pinboard strong,
body#pinboard label, body#pinboard span, body#pinboard li,
body#pinboard dd, body#pinboard dt { color: inherit !important; }

/* ---- Popup / iframe frame (body:not(#pinboard)) ---- */
body:not(#pinboard) {
  background: ${v("bg")} !important;
  color: ${v("fg")} !important;
  font-family: ${v("font-family")} !important;
}
body:not(#pinboard) table, body:not(#pinboard) td,
body:not(#pinboard) p, body:not(#pinboard) label,
body:not(#pinboard) span { color: inherit !important; }
body:not(#pinboard) #popup_header { background: transparent !important; color: ${v("fg")} !important; }

/* ---- Banner & navigation ---- */
#banner { background: ${v("bg-surface")} !important; border-color: ${v("border")} !important; ${maxWidth && maxWidth !== "none" ? `max-width: ${maxWidth} !important; box-sizing: border-box !important;` : ""} }
#banner a, #top_menu a, .banner_username { color: ${v("accent")} !important; }
#banner a:hover, #top_menu a:hover { color: ${v("link-hover")} !important; }
#pinboard_name a { color: ${v("accent")} !important; font-weight: ${v("weight-heading")} !important; }
#sub_banner { background: ${v("bg-surface")} !important; border-color: ${v("border")} !important; }
#sub_banner a { color: ${v("muted")} !important; }
#sub_banner a:hover, #sub_banner a.selected { color: ${v("accent")} !important; }

/* ---- Search (banner + main) ---- */
#searchbox { margin-bottom: 12px !important; }
a.bundle { color: ${v("accent")} !important; }
a.bundle:hover { color: ${v("link-hover")} !important; }
#search_query_field, #banner_searchbox input[type="text"] {
  background: ${v("input-bg")} !important;
  color: ${v("fg")} !important;
  border: ${v("border-width")} ${v("border-style")} ${v("border")} !important;
  box-sizing: border-box !important;
}
#search_query_field:focus, #banner_searchbox input[type="text"]:focus { border-color: ${v("accent")} !important; outline: none !important; }
.search_button input[type="submit"] {
  background: ${v("accent")} !important;
  color: ${v("btn-fg")} !important;
  border: ${v("border-width")} ${v("border-style")} ${v("accent")} !important;
  cursor: pointer !important;
}
.search_button input[type="submit"]:hover { background: ${v("link-hover")} !important; }

/* ---- Bookmark list ---- */
.bookmark {
  ${bookmarkStyle === "card"
    ? `background: ${v("bg-surface")} !important; border: ${v("border-width")} ${v("border-style")} ${v("border")} !important; border-radius: ${v("radius-md")} !important; padding: 12px 16px !important; margin-bottom: 6px !important;`
    : `background: transparent !important;`}
  display: flex !important;
  align-items: flex-start !important;
}
.bookmark { transition: background 0.2s ease !important; }
.bookmark:hover { ${bookmarkStyle === "card" ? `border-color: ${v("accent-alpha")} !important;` : `background: ${v("row-hover")} !important;`} }
.bookmark .display { float: none !important; flex: 1 !important; width: auto !important; min-width: 0 !important; }
.star, .selected_star { margin-left: 0 !important; margin-right: 6px !important; float: none !important; flex-shrink: 0 !important; }
.star { color: ${v("border")} !important; }
.selected_star { color: ${v("private-accent")} !important; }

a.bookmark_title { color: ${v("accent")} !important; font-size: ${sizeLg} !important; text-decoration: none !important; font-weight: ${v("weight-heading")} !important; }
a.bookmark_title:hover { color: ${v("link-hover")} !important; text-decoration: underline !important; }
a.url_display, a.when, a.cached { color: ${v("muted-soft")} !important; font-size: ${sizeXs} !important; }
a.url_link {
  color: ${v("url-link-fg")} !important;
  background: ${v("url-link-bg")} !important;
  padding: 1px 6px !important;
  border-radius: ${v("radius-lg")} !important;
  font-size: ${sizeXs} !important;
}
.description { color: ${v("fg")} !important; opacity: 0.85 !important; line-height: ${v("line-height")} !important; }
.description blockquote { color: ${v("muted")} !important; border-left: 3px solid ${v("accent-alpha")} !important; padding-left: 10px !important; margin: 4px 0 !important; }

a.tag {
  color: ${v("tag-fg")} !important;
  background: ${v("tag-bg")} !important;
  padding: 1px 8px !important;
  border-radius: ${v("radius-lg")} !important;
  font-size: ${sizeXs} !important;
  text-decoration: none !important;
}
a.tag:hover { color: ${v("tag-fg")} !important; background: ${v("accent-alpha")} !important; text-decoration: none !important; }
a.tag.selected { color: ${v("destroy")} !important; font-weight: bold !important; }
a.sort_order_selected { background: ${v("tag-bg")} !important; color: ${v("accent")} !important; }

a.unread { color: ${v("destroy")} !important; font-weight: bold !important; }
.edit_links a, a.copy_link { color: ${v("muted-soft")} !important; }
.edit_links a:hover { color: ${v("fg")} !important; }
a.copy_link { color: ${v("accent")} !important; }
a.delete, a.destroy { color: ${v("destroy")} !important; }

/* ---- Private bookmarks (composer default: tint-bg; patterns.private-badge overrides) ---- */
.private { background: ${v("private-bg")} !important; }

/* ---- Right bar ---- */
#right_bar {
  background: ${v("bg-surface")} !important;
  color: ${v("fg")} !important;
  padding: ${v("space-right-bar-gap")} !important;
  box-sizing: border-box !important;
  overflow: hidden !important;
  word-wrap: break-word !important;
}
#right_bar h3, #right_bar h4, #right_bar b { color: ${v("muted")} !important; }
#right_bar a { color: ${v("accent")} !important; }
#right_bar a:hover { color: ${v("link-hover")} !important; }
#right_bar table tr[onmouseover] { background: transparent !important; }
#right_bar table tr[onmouseover]:hover { background: ${v("row-hover")} !important; }
#right_bar table td a.tag { color: ${v("fg")} !important; }
#right_bar table td a.delete { color: ${v("muted-soft")} !important; font-size: ${sizeXs} !important; opacity: 0.55 !important; transition: opacity 0.15s ease, color 0.15s ease !important; }
#right_bar table tr:hover td a.delete { color: ${v("destroy")} !important; opacity: 1 !important; }
#right_bar input#key {
  background: ${v("input-bg")} !important;
  color: ${v("fg")} !important;
  border: ${v("border-width")} ${v("border-style")} ${v("border")} !important;
  border-radius: ${v("radius-sm")} !important;
  padding: 4px 8px !important;
  box-sizing: border-box !important;
  font-size: ${sizeSm} !important;
}
#right_bar input#key:focus { border-color: ${v("accent")} !important; box-shadow: 0 0 0 2px ${v("accent-alpha")} !important; outline: none !important; }
#right_bar input[type="submit"] {
  background: ${v("success")} !important;
  color: ${v("btn-fg")} !important;
  border: none !important;
  border-radius: ${v("radius-sm")} !important;
  padding: 4px 10px !important;
  margin-left: 6px !important;
  cursor: pointer !important;
  font-size: ${sizeSm} !important;
  transition: background 0.15s ease !important;
}
#right_bar input[type="submit"]:hover { background: ${v("success-hover")} !important; }

/* ---- Tag cloud ---- */
#tag_cloud { max-width: 100% !important; overflow-wrap: break-word !important; }
#tag_cloud a, #tag_cloud a.tag { color: ${v("accent")} !important; }
#tag_cloud a:hover, #tag_cloud a.tag:hover { color: ${v("link-hover")} !important; }
#tag_cloud_header a, a.tag_heading_selected { color: ${v("muted-soft")} !important; }
#tag_cloud_header a:hover { color: ${v("accent")} !important; }

/* ---- Tweets page searchbox ---- */
#tweet_searchbox { margin-bottom: 12px !important; }
#tweet_searchbox form { display: flex !important; flex-direction: column !important; gap: ${v("space-form-gap")} !important; margin: 0 !important; }
#tweet_searchbox br { display: none !important; }
#tweet_searchbox #search_query_field {
  width: 100% !important; box-sizing: border-box !important;
  background: ${v("input-bg")} !important; color: ${v("fg")} !important;
  border: ${v("border-width")} ${v("border-style")} ${v("border")} !important;
  border-radius: ${v("radius-sm")} !important;
  padding: 6px 10px !important; font-size: ${sizeSm} !important;
}
#tweet_searchbox #search_query_field:focus { border-color: ${v("accent")} !important; box-shadow: 0 0 0 2px ${v("accent-alpha")} !important; outline: none !important; }
#tweet_searchbox input[type="submit"] {
  background: ${v("success")} !important; color: ${v("btn-fg")} !important;
  border: none !important; border-radius: ${v("radius-sm")} !important;
  padding: 5px 14px !important; cursor: pointer !important;
  font-size: ${sizeSm} !important; align-self: flex-start !important;
  transition: background 0.15s ease !important;
}
#tweet_searchbox input[type="submit"]:hover { background: ${v("success-hover")} !important; }

/* ---- Forms (global) ---- */
input[type="text"], input:not([type]), input[type="password"], textarea, select {
  background: ${v("input-bg")} !important; color: ${v("fg")} !important;
  border: ${v("border-width")} ${v("border-style")} ${v("border")} !important;
}
input[type="text"]:focus, input:not([type]):focus, textarea:focus, select:focus { border-color: ${v("accent")} !important; outline: none !important; }
input[type="submit"], input[type="button"] {
  background: ${v("accent")} !important; color: ${v("btn-fg")} !important;
  border: ${v("border-width")} ${v("border-style")} ${v("accent")} !important;
  cursor: pointer !important;
}
input[type="submit"]:hover, input[type="button"]:hover { background: ${v("link-hover")} !important; }
input[type="checkbox"], input[type="radio"] { accent-color: ${v("accent")} !important; }
.suggested_tag { color: ${v("success")} !important; cursor: pointer !important; }
#edit_bookmark_form { background: ${v("bg-surface")} !important; border: ${v("border-width")} ${v("border-style")} ${v("border")} !important; }

/* ---- Settings page ---- */
#settings_panel { background: ${v("bg-surface")} !important; }
.settings_tabs { border-color: ${v("border")} !important; }
.settings_tab { color: ${v("muted")} !important; padding: 6px 12px !important; border-bottom-color: ${v("border")} !important; }
.settings_tab a { color: inherit !important; text-decoration: none !important; }
.settings_tab:hover { color: ${v("accent")} !important; }
.settings_tab_selected {
  color: ${v("accent")} !important;
  border: ${v("border-width")} ${v("border-style")} ${v("border")} !important;
  border-top: 2px solid ${v("accent")} !important;
  border-bottom-color: ${v("bg-surface")} !important;
  background: ${v("bg-surface")} !important;
  font-weight: bold !important;
  margin-bottom: -1px !important;
}
.settings_tab_selected a { color: ${v("accent")} !important; }
[class*="settings_tab_spacer"] { border-bottom-color: ${v("border")} !important; }
.settings_heading { color: ${v("muted")} !important; background: transparent !important; border-bottom: ${v("border-width")} ${v("border-style")} ${v("border")} !important; padding-bottom: 6px !important; }
a.help { color: ${v("muted-soft")} !important; background: ${v("accent-soft")} !important; }
.email_secret { color: ${v("accent")} !important; }
#settings_tab_panes { border: none !important; }
#settings_tab_panes table td { color: ${v("fg")} !important; }

/* ---- Profile page ---- */
.service_box, .help_box {
  background: ${v("bg-surface")} !important;
  border: ${v("border-width")} ${v("border-style")} ${v("border")} !important;
  border-radius: ${v("radius-md")} !important;
  padding: 16px !important;
  box-sizing: border-box !important;
  margin-bottom: 12px !important;
}
.service_box .service_box { border: none !important; padding: 0 !important; margin: 0 !important; background: transparent !important; border-radius: 0 !important; width: auto !important; box-sizing: border-box !important; }
#profile_left_column { margin-right: 20px !important; }
#profile_right_column { width: 430px !important; }
#profile_main_column h2, #profile_left_column h2, #profile_right_column h2 { color: ${v("muted")} !important; }
#profile_main_column table td, #profile_right_column table td { color: ${v("fg")} !important; }

/* ---- Notes ---- */
.note { border-bottom: ${v("border-width")} ${v("border-style")} ${v("border")} !important; }
.note a { color: ${v("accent")} !important; }
.note .note { border: none !important; padding: 0 !important; margin: 0 !important; background: transparent !important; border-radius: 0 !important; }
#note_right_column { background: ${v("bg-surface")} !important; color: ${v("fg")} !important; padding: 16px !important; border-left: ${v("border-width")} ${v("border-style")} ${v("border")} !important; }

/* ---- Bulk edit ---- */
#bulk_top_bar, #bulk_edit_box { background: ${v("bg-surface")} !important; border: ${v("border-width")} ${v("border-style")} ${v("border")} !important; color: ${v("fg")} !important; }

/* ---- Save bookmark popup ---- */
#popup_header { background: ${v("bg-surface")} !important; color: ${v("fg")} !important; }
.formtable td { color: ${v("fg")} !important; }
.bookmark_count, .bookmark_count_box { color: ${v("muted")} !important; }
.user_navbar a { color: ${v("accent")} !important; }
.rss_link, .rss_linkbox a { color: ${v("muted-soft")} !important; }

/* ---- Bundles (P4-table) — /u/<user>/bundles/ ---- */
#main_column form[name="sort"] > table { width: 100% !important; max-width: 880px !important; border-collapse: separate !important; border-spacing: 0 4px !important; margin-top: 8px !important; }
#main_column form[name="sort"] table tr { background: transparent !important; border-radius: ${v("radius-md")} !important; }
#main_column form[name="sort"] table tr:hover { background: ${v("row-hover")} !important; }
#main_column form[name="sort"] table td { padding: 6px 10px !important; vertical-align: middle !important; border: none !important; }
#main_column form[name="sort"] table td[style*="text-align:right"] { min-width: 160px !important; padding-right: 14px !important; white-space: nowrap !important; }
#main_column form[name="sort"] table input[name^="id_"] {
  border: ${v("border-width")} ${v("border-style")} ${v("border")} !important;
  background: ${v("input-bg")} !important;
  color: ${v("fg")} !important;
  width: 32px !important;
  border-radius: ${v("radius-sm")} !important;
  text-align: center !important;
}
#main_column form[name="sort"] table input[name^="id_"]:focus { border-color: ${v("accent")} !important; box-shadow: 0 0 0 2px ${v("accent-alpha")} !important; outline: none !important; }
#main_column form[name="sort"] table a.bundle { font-weight: ${v("weight-heading")} !important; font-style: normal !important; letter-spacing: 0.01em !important; padding: 2px 4px !important; border-radius: ${v("radius-sm")} !important; }
#main_column form[name="sort"] table a[style*="color:#aaa"],
#main_column form[name="sort"] table a[style*="color: #aaa"] { color: ${v("muted")} !important; opacity: 1 !important; text-decoration: none !important; font-size: ${sizeSm} !important; margin-left: 4px !important; }
#main_column form[name="sort"] table a[style*="color:#aaa"]:hover { color: ${v("accent")} !important; text-decoration: underline !important; }
#main_column form[name="sort"] table td a.edit { color: ${v("muted")} !important; opacity: 0.8 !important; transition: opacity 0.15s ease !important; }
#main_column form[name="sort"] table td a.destroy { color: ${v("destroy")} !important; opacity: 0.85 !important; font-weight: ${v("weight-heading")} !important; }
#main_column form[name="sort"] table tr:hover td a.edit { color: ${v("accent")} !important; opacity: 1 !important; }
#main_column form[name="sort"] table tr:hover td a.destroy { opacity: 1 !important; }

/* ---- Pagination ---- */
.next_prev, .next_prev_widget a { color: ${v("accent")} !important; }
.next_prev:hover, .next_prev_widget a:hover { color: ${v("link-hover")} !important; }
#nextprev a.edit { color: ${v("muted-soft")} !important; }

/* ---- Footer / colophon ---- */
#footer, .colophon, .colophon a { color: ${v("muted-soft")} !important; }

/* ---- Global anchor fallbacks ---- */
a, a:link { color: ${v("accent")} !important; }
a:hover { color: ${v("link-hover")} !important; }
a:visited { color: ${v("link-visited")} !important; }
a:focus-visible { outline: 2px solid ${v("focus-ring")} !important; outline-offset: 2px !important; }
h2 { color: ${v("muted")} !important; }
hr { border-color: ${v("border")} !important; }

/* ---- Bundle slot input override: already in inline_base_rules — redundant here ---- */

/* ---- ::selection (also in _base but themes may want explicit) ---- */
::selection { background: ${v("selection-bg")} !important; color: ${v("selection-fg")} !important; }
::-moz-selection { background: ${v("selection-bg")} !important; color: ${v("selection-fg")} !important; }
`;
}
