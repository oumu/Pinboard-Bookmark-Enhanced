// ============================================================
// Pinboard Bookmark Enhanced - CSS Theme Presets for pinboard.in
// ============================================================

const PINBOARD_THEMES = {

  // ---- 1. Modern Card (Light) ----
  "modern-card": {
    name: "Modern Card",
    desc: "Clean card layout with subtle shadows",
    css: `:root {
  --pinboard-bg: #f0f2f5;
  --pinboard-bg-surface: #ffffff;
  --pinboard-fg: #1a1a2e;
  --pinboard-fg-strong: #3c4043;
  --pinboard-muted: #5f6368;
  --pinboard-muted-soft: #9aa0a6;
  --pinboard-border: #e8e8e8;
  --pinboard-border-strong: #dadce0;
  --pinboard-border-soft: #e8e8e8;
  --pinboard-accent: #1a73e8;
  --pinboard-accent-hover: #174ea6;
  --pinboard-accent-soft: #e8f0fe;
  --pinboard-accent-alpha: rgba(26,115,232,0.15);
  --pinboard-input-bg: #ffffff;
  --pinboard-private-bg: #fff0c8;
  --pinboard-private-accent: #ffeaa7;
  --pinboard-selection-bg: #1a73e8;
  --pinboard-selection-fg: #ffffff;
  --pinboard-tag-bg: #e8f0fe;
  --pinboard-tag-fg: #1967d2;
  --pinboard-row-hover: #f1f3f4;
  --pinboard-destroy: #d93025;
  --pinboard-btn-bg: #1a73e8;
  --pinboard-btn-fg: #ffffff;
  --pinboard-success: #1a73e8;
  --pinboard-success-hover: #1765cc;
  --pinboard-url-link-bg: #fff3e0;
  --pinboard-url-link-fg: #e8710a;
  --pinboard-link-hover: #174ea6;
  --pinboard-link-visited: #1a73e8;
  --pinboard-focus-ring: #1a73e8;
  --pinboard-unread: #d93025;
  --pinboard-btn-bg-hover: #174ea6;
  --pinboard-font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --pinboard-font-size-base: 13px;
  --pinboard-font-size-sm: 12px;
  --pinboard-font-size-lg: 15px;
  --pinboard-font-size-xs: 11px;
  --pinboard-line-height: 1.5;
  --pinboard-weight-body: 400;
  --pinboard-weight-heading: 600;
  --pinboard-space-unit: 4px;
  --pinboard-space-bookmark-gap: 10px;
  --pinboard-space-main-padding: 16px;
  --pinboard-space-sub-banner-y: 8px;
  --pinboard-space-right-bar-gap: 16px;
  --pinboard-space-form-gap: 8px;
  --pinboard-radius-sm: 4px;
  --pinboard-radius-md: 8px;
  --pinboard-radius-lg: 12px;
  --pinboard-border-width: 1px;
  --pinboard-border-style: solid;
  --pinboard-border-hairline: 1px dotted #e8e8e8;
}

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

/* override.generic-bgcolor — defensive against legacy HTML attr */
[bgcolor] { background-color: transparent !important; }

/* override.generic-html-color — defensive against legacy <font> */
font[color], font[size] { color: inherit !important; font-size: inherit !important; }

/* override.generic-fixed-width — defensive against layout tables */
table[width]:not([width="100%"]) { width: auto !important; max-width: 100% !important; }

/* === selection (applied globally; composers may override scoped) === */
::selection          { background: var(--pinboard-selection-bg); color: var(--pinboard-selection-fg); }
::-moz-selection     { background: var(--pinboard-selection-bg); color: var(--pinboard-selection-fg); }

/* === composer: classic-list-v2 — canonical surface inventory === */

/* ---- App shell typography (body#pinboard) ---- */
body#pinboard {
  background: var(--pinboard-bg) !important;
  color: var(--pinboard-fg) !important;
  font-family: var(--pinboard-font-family) !important;
  font-size: 13px !important;
  line-height: var(--pinboard-line-height) !important;
}
body#pinboard table, body#pinboard td, body#pinboard th,
body#pinboard p, body#pinboard b, body#pinboard strong,
body#pinboard label, body#pinboard span, body#pinboard li:not(.pin-ac li),
body#pinboard dd, body#pinboard dt { color: inherit !important; }

/* ---- Popup / iframe frame (body:not(#pinboard)) ---- */
body:not(#pinboard) {
  background: var(--pinboard-bg) !important;
  color: var(--pinboard-fg) !important;
  font-family: var(--pinboard-font-family) !important;
}
body:not(#pinboard) table, body:not(#pinboard) td,
body:not(#pinboard) p, body:not(#pinboard) label,
body:not(#pinboard) span { color: inherit !important; }
body:not(#pinboard) #popup_header { background: transparent !important; color: var(--pinboard-fg) !important; }

/* ---- Banner & navigation ---- */
#banner { background: var(--pinboard-bg-surface) !important; border-color: var(--pinboard-border) !important; max-width: 1030px !important; box-sizing: border-box !important; }
#banner a, #top_menu a, .banner_username { color: var(--pinboard-accent) !important; }
#banner a:hover, #top_menu a:hover { color: var(--pinboard-link-hover) !important; }
#pinboard_name a { color: var(--pinboard-accent) !important; font-weight: var(--pinboard-weight-heading) !important; }
#sub_banner { background: var(--pinboard-bg-surface) !important; border-color: var(--pinboard-border) !important; }
#sub_banner a { color: var(--pinboard-muted) !important; }
#sub_banner a:hover, #sub_banner a.selected { color: var(--pinboard-accent) !important; }

/* ---- Search (banner + main) ---- */
#searchbox { margin-bottom: 12px !important; }
a.bundle { color: var(--pinboard-accent) !important; }
a.bundle:hover { color: var(--pinboard-link-hover) !important; }
#search_query_field, #banner_searchbox input[type="text"] {
  background: var(--pinboard-input-bg) !important;
  color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  box-sizing: border-box !important;
}
#search_query_field:focus, #banner_searchbox input[type="text"]:focus { border-color: var(--pinboard-accent) !important; outline: none !important; }
.search_button input[type="submit"] {
  background: var(--pinboard-accent) !important;
  color: var(--pinboard-btn-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-accent) !important;
  cursor: pointer !important;
}
.search_button input[type="submit"]:hover { background: var(--pinboard-link-hover) !important; }

/* ---- Bookmark list ---- */
.bookmark {
  background: var(--pinboard-bg-surface) !important; border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important; border-radius: var(--pinboard-radius-md) !important; padding: 12px 16px !important; margin-bottom: 6px !important;
  display: flex !important;
  align-items: flex-start !important;
}
.bookmark { transition: box-shadow 0.2s ease !important; }
.bookmark .display { float: none !important; flex: 1 !important; width: auto !important; min-width: 0 !important; }
.star, .selected_star { margin-left: 0 !important; margin-right: 6px !important; float: none !important; flex-shrink: 0 !important; }
.star { color: var(--pinboard-border) !important; }
.selected_star { color: var(--pinboard-private-accent) !important; }

a.bookmark_title { color: var(--pinboard-accent) !important; font-size: 15px !important; text-decoration: none !important; font-weight: var(--pinboard-weight-heading) !important; }
a.bookmark_title:hover { color: var(--pinboard-link-hover) !important; text-decoration: underline !important; }
a.url_display, a.when, a.cached { color: var(--pinboard-muted-soft) !important; font-size: 11px !important; }
a.url_link {
  color: var(--pinboard-url-link-fg) !important;
  background: var(--pinboard-url-link-bg) !important;
  padding: 1px 6px !important;
  border-radius: var(--pinboard-radius-lg) !important;
  font-size: 11px !important;
}
.description { color: var(--pinboard-fg) !important; opacity: 0.85 !important; line-height: var(--pinboard-line-height) !important; }
.description blockquote { color: var(--pinboard-muted) !important; border-left: 3px solid var(--pinboard-accent-alpha) !important; padding-left: 10px !important; margin: 4px 0 !important; }

a.tag {
  color: var(--pinboard-tag-fg) !important;
  background: var(--pinboard-tag-bg) !important;
  padding: 1px 8px !important;
  border-radius: var(--pinboard-radius-lg) !important;
  font-size: 11px !important;
  text-decoration: none !important;
}
a.tag:hover { color: var(--pinboard-tag-fg) !important; background: var(--pinboard-accent-alpha) !important; text-decoration: none !important; }
a.tag.selected { color: var(--pinboard-destroy) !important; font-weight: bold !important; }
a.sort_order_selected { background: var(--pinboard-tag-bg) !important; color: var(--pinboard-accent) !important; }

a.unread { color: var(--pinboard-destroy) !important; font-weight: bold !important; }
.edit_links a, a.copy_link { color: var(--pinboard-muted-soft) !important; }
.edit_links a:hover { color: var(--pinboard-fg) !important; }
a.copy_link { color: var(--pinboard-accent) !important; }
a.delete, a.destroy { color: var(--pinboard-destroy) !important; }

/* ---- Private bookmarks ---- */
.bookmark.private,
.bookmark.private[style*="background"] { background: var(--pinboard-private-bg) !important; box-shadow: inset 3px 0 0 var(--pinboard-private-accent) !important; border-top-color: transparent !important; border-right-color: transparent !important; border-left-color: transparent !important; }

/* ---- Right bar ---- */
#right_bar {
  background: var(--pinboard-bg-surface) !important;
  color: var(--pinboard-fg) !important;
  padding: var(--pinboard-space-right-bar-gap) !important;
  box-sizing: border-box !important;
  overflow: hidden !important;
  word-wrap: break-word !important;
}
#right_bar h3, #right_bar h4, #right_bar b { color: var(--pinboard-muted) !important; }
#right_bar a { color: var(--pinboard-accent) !important; }
#right_bar a:hover { color: var(--pinboard-link-hover) !important; }
#right_bar table tr[onmouseover] { background: transparent !important; }
#right_bar table tr[onmouseover]:hover { background: var(--pinboard-row-hover) !important; }
#right_bar table td a.tag { color: var(--pinboard-fg) !important; }
#right_bar table td a.delete { color: var(--pinboard-muted-soft) !important; font-size: 11px !important; opacity: 0.55 !important; transition: opacity 0.15s ease, color 0.15s ease !important; }
#right_bar table tr:hover td a.delete { color: var(--pinboard-destroy) !important; opacity: 1 !important; }
#right_bar input#key {
  background: var(--pinboard-input-bg) !important;
  color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-radius: var(--pinboard-radius-sm) !important;
  padding: 4px 8px !important;
  box-sizing: border-box !important;
  font-size: 12px !important;
}
#right_bar input#key:focus { border-color: var(--pinboard-accent) !important; box-shadow: 0 0 0 2px var(--pinboard-accent-alpha) !important; outline: none !important; }
#right_bar input[type="submit"] {
  background: var(--pinboard-success) !important;
  color: var(--pinboard-btn-fg) !important;
  border: none !important;
  border-radius: var(--pinboard-radius-sm) !important;
  padding: 4px 10px !important;
  margin-left: 6px !important;
  cursor: pointer !important;
  font-size: 12px !important;
  transition: background 0.15s ease !important;
}
#right_bar input[type="submit"]:hover { background: var(--pinboard-success-hover) !important; }

/* ---- Tag cloud ---- */
#tag_cloud { max-width: 100% !important; overflow-wrap: break-word !important; }
#tag_cloud a, #tag_cloud a.tag { color: var(--pinboard-accent) !important; }
#tag_cloud a:hover, #tag_cloud a.tag:hover { color: var(--pinboard-link-hover) !important; }
#tag_cloud_header a, a.tag_heading_selected { color: var(--pinboard-muted-soft) !important; }
#tag_cloud_header a:hover { color: var(--pinboard-accent) !important; }

/* ---- Tweets page searchbox ---- */
#tweet_searchbox { margin-bottom: 12px !important; }
#tweet_searchbox form { display: flex !important; flex-direction: column !important; gap: var(--pinboard-space-form-gap) !important; margin: 0 !important; }
#tweet_searchbox br { display: none !important; }
#tweet_searchbox #search_query_field {
  width: 100% !important; box-sizing: border-box !important;
  background: var(--pinboard-input-bg) !important; color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-radius: var(--pinboard-radius-sm) !important;
  padding: 6px 10px !important; font-size: 12px !important;
}
#tweet_searchbox #search_query_field:focus { border-color: var(--pinboard-accent) !important; box-shadow: 0 0 0 2px var(--pinboard-accent-alpha) !important; outline: none !important; }
#tweet_searchbox input[type="submit"] {
  background: var(--pinboard-success) !important; color: var(--pinboard-btn-fg) !important;
  border: none !important; border-radius: var(--pinboard-radius-sm) !important;
  padding: 5px 14px !important; cursor: pointer !important;
  font-size: 12px !important; align-self: flex-start !important;
  transition: background 0.15s ease !important;
}
#tweet_searchbox input[type="submit"]:hover { background: var(--pinboard-success-hover) !important; }

/* ---- Forms (global) ---- */
input[type="text"], input:not([type]), input[type="password"], textarea, select {
  background: var(--pinboard-input-bg) !important; color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  box-sizing: border-box !important; max-width: 100% !important;
}
input[type="text"]:focus, input:not([type]):focus, textarea:focus, select:focus { border-color: var(--pinboard-accent) !important; outline: none !important; }
input[type="submit"], input[type="button"] {
  background: var(--pinboard-accent) !important; color: var(--pinboard-btn-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-accent) !important;
  border-radius: var(--pinboard-radius-sm) !important;
  padding: 4px 12px !important;
  cursor: pointer !important;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease !important;
}
input[type="submit"]:hover, input[type="button"]:hover { background: var(--pinboard-link-hover) !important; border-color: var(--pinboard-link-hover) !important; }
input[type="reset"], input[type="reset"].reset, button[type="reset"] {
  background: var(--pinboard-bg-surface) !important; color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-radius: var(--pinboard-radius-sm) !important;
  padding: 4px 12px !important;
  cursor: pointer !important;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease !important;
}
input[type="reset"]:hover, input[type="reset"].reset:hover, button[type="reset"]:hover { background: var(--pinboard-row-hover) !important; border-color: var(--pinboard-accent) !important; color: var(--pinboard-accent) !important; }
input[type="checkbox"], input[type="radio"] { accent-color: var(--pinboard-accent) !important; }
.suggested_tag { color: var(--pinboard-success) !important; cursor: pointer !important; }
#edit_bookmark_form { background: var(--pinboard-bg-surface) !important; border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important; }

/* ---- Tag completion popup (Pin.Tags widget on /add/, edit-bookmark, note-add) ---- */
.pin-ac { z-index: 1000 !important; }
.pin-ac .bd {
  background: var(--pinboard-bg-surface) !important;
  color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-radius: var(--pinboard-radius-sm) !important;
  box-shadow: 0 2px 8px var(--pinboard-accent-alpha) !important;
}
.pin-ac li {
  background: transparent !important;
  color: var(--pinboard-fg) !important;
  padding: 4px 10px !important;
  font-size: 12px !important;
}
.pin-ac li:hover { background: var(--pinboard-accent-alpha) !important; color: var(--pinboard-fg) !important; cursor: pointer !important; }
.pin-ac .active { background: var(--pinboard-selection-bg) !important; color: var(--pinboard-selection-fg) !important; }

/* ---- Settings page ---- */
#settings_panel { background: var(--pinboard-bg-surface) !important; }
.settings_tabs { border-color: var(--pinboard-border) !important; }
.settings_tab { color: var(--pinboard-muted) !important; padding: 6px 12px !important; border-bottom-color: var(--pinboard-border) !important; }
.settings_tab a { color: inherit !important; text-decoration: none !important; }
.settings_tab:hover { color: var(--pinboard-accent) !important; }
.settings_tab_selected {
  color: var(--pinboard-accent) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-top: 2px solid var(--pinboard-accent) !important;
  border-bottom-color: var(--pinboard-bg-surface) !important;
  background: var(--pinboard-bg-surface) !important;
  font-weight: bold !important;
  margin-bottom: -1px !important;
}
.settings_tab_selected a { color: var(--pinboard-accent) !important; }
[class*="settings_tab_spacer"] { border-bottom-color: var(--pinboard-border) !important; }
.settings_heading { color: var(--pinboard-muted) !important; background: transparent !important; border-bottom: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important; padding-bottom: 6px !important; }
a.help { color: var(--pinboard-muted-soft) !important; background: var(--pinboard-accent-soft) !important; }
.email_secret { color: var(--pinboard-accent) !important; }
#settings_tab_panes { border: none !important; }
#settings_tab_panes table td { color: var(--pinboard-fg) !important; }

/* ---- Profile page ---- */
.service_box, .help_box {
  background: var(--pinboard-bg-surface) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-radius: var(--pinboard-radius-md) !important;
  padding: 16px !important;
  box-sizing: border-box !important;
  margin-bottom: 12px !important;
}
.service_box .service_box { border: none !important; padding: 0 !important; margin: 0 !important; background: transparent !important; border-radius: 0 !important; width: auto !important; box-sizing: border-box !important; }
#profile_left_column { margin-right: 20px !important; }
#profile_right_column { width: 430px !important; }
#profile_main_column h2, #profile_left_column h2, #profile_right_column h2 { color: var(--pinboard-muted) !important; }
#profile_main_column table td, #profile_right_column table td { color: var(--pinboard-fg) !important; }

/* ---- Notes ---- */
.note { border-bottom: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important; }
.note a { color: var(--pinboard-accent) !important; }
.note .note { border: none !important; padding: 0 !important; margin: 0 !important; background: transparent !important; border-radius: 0 !important; }
#note_right_column { background: var(--pinboard-bg-surface) !important; color: var(--pinboard-fg) !important; padding: 16px !important; border-left: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important; }

/* ---- Bulk edit ---- */
#bulk_top_bar, #bulk_edit_box { background: var(--pinboard-bg-surface) !important; border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important; color: var(--pinboard-fg) !important; }

/* ---- Save bookmark popup ---- */
#popup_header { background: var(--pinboard-bg-surface) !important; color: var(--pinboard-fg) !important; }
.formtable td { color: var(--pinboard-fg) !important; }
.bookmark_count, .bookmark_count_box { color: var(--pinboard-muted) !important; }
.user_navbar a { color: var(--pinboard-accent) !important; }
.rss_link, .rss_linkbox a { color: var(--pinboard-muted-soft) !important; }

/* ---- Bundles (P4-table) — /u/<user>/bundles/ ---- */
#main_column form[name="sort"] > table { width: 100% !important; max-width: 880px !important; border-collapse: separate !important; border-spacing: 0 4px !important; margin-top: 8px !important; }
#main_column form[name="sort"] table tr { background: transparent !important; border-radius: var(--pinboard-radius-md) !important; }
#main_column form[name="sort"] table tr:hover { background: var(--pinboard-row-hover) !important; }
#main_column form[name="sort"] table td { padding: 6px 10px !important; vertical-align: middle !important; border: none !important; }
#main_column form[name="sort"] table td[style*="text-align:right"] { min-width: 160px !important; padding-right: 14px !important; white-space: nowrap !important; }
#main_column form[name="sort"] table input[name^="id_"] {
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  background: var(--pinboard-input-bg) !important;
  color: var(--pinboard-fg) !important;
  width: 32px !important;
  border-radius: var(--pinboard-radius-sm) !important;
  text-align: center !important;
}
#main_column form[name="sort"] table input[name^="id_"]:focus { border-color: var(--pinboard-accent) !important; box-shadow: 0 0 0 2px var(--pinboard-accent-alpha) !important; outline: none !important; }
#main_column form[name="sort"] table a.bundle { font-weight: var(--pinboard-weight-heading) !important; font-style: normal !important; letter-spacing: 0.01em !important; padding: 2px 4px !important; border-radius: var(--pinboard-radius-sm) !important; }
#main_column form[name="sort"] table a[style*="color:#aaa"],
#main_column form[name="sort"] table a[style*="color: #aaa"] { color: var(--pinboard-muted) !important; opacity: 1 !important; text-decoration: none !important; font-size: 12px !important; margin-left: 4px !important; }
#main_column form[name="sort"] table a[style*="color:#aaa"]:hover { color: var(--pinboard-accent) !important; text-decoration: underline !important; }
#main_column form[name="sort"] table td a.edit { color: var(--pinboard-muted) !important; opacity: 0.8 !important; transition: opacity 0.15s ease !important; }
#main_column form[name="sort"] table td a.destroy { color: var(--pinboard-destroy) !important; opacity: 0.85 !important; font-weight: var(--pinboard-weight-heading) !important; }
#main_column form[name="sort"] table tr:hover td a.edit { color: var(--pinboard-accent) !important; opacity: 1 !important; }
#main_column form[name="sort"] table tr:hover td a.destroy { opacity: 1 !important; }

/* ---- Pagination ---- */
.next_prev, .next_prev_widget a { color: var(--pinboard-accent) !important; }
.next_prev:hover, .next_prev_widget a:hover { color: var(--pinboard-link-hover) !important; }
#nextprev a.edit { color: var(--pinboard-muted-soft) !important; }

/* ---- Logged-out landing page (https://pinboard.in/) ---- */
#main_welcome, .homepage_quad { color: var(--pinboard-fg) !important; }
.homepage_heading { color: var(--pinboard-fg-strong) !important; font-weight: var(--pinboard-weight-heading) !important; }
.homepage_subheading { color: var(--pinboard-muted) !important; }
.signup_button,
.signup_button[style*="background"] {
  background: var(--pinboard-btn-bg) !important;
  color: var(--pinboard-btn-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-btn-bg) !important;
  border-radius: var(--pinboard-radius-sm) !important;
  padding: 10px 16px !important;
  text-align: center !important;
  font-weight: var(--pinboard-weight-heading) !important;
  cursor: pointer !important;
  transition: background 0.15s ease, border-color 0.15s ease !important;
}
.signup_button:hover { background: var(--pinboard-btn-bg-hover) !important; border-color: var(--pinboard-btn-bg-hover) !important; }
#blurb_div { color: var(--pinboard-fg) !important; }
.blurb_column { color: var(--pinboard-fg) !important; }
#blurb_div a { text-decoration: none !important; color: var(--pinboard-fg) !important; display: block !important; }
.blurb_box {
  background: var(--pinboard-bg-surface) !important;
  color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-radius: var(--pinboard-radius-md) !important;
  padding: 12px 14px !important;
  margin-bottom: 10px !important;
  transition: background 0.15s ease, border-color 0.15s ease !important;
}
#blurb_div a:hover .blurb_box { background: var(--pinboard-row-hover) !important; border-color: var(--pinboard-accent-alpha) !important; }
.magazine_title { color: var(--pinboard-accent) !important; font-weight: var(--pinboard-weight-heading) !important; }
.blurb { color: var(--pinboard-fg) !important; opacity: 0.85 !important; }
#language_box { color: var(--pinboard-muted) !important; }
#language_box p { margin: 2px 0 !important; }
#language_box a { color: var(--pinboard-muted) !important; padding: 1px 6px !important; border-radius: var(--pinboard-radius-sm) !important; text-decoration: none !important; }
#language_box a:hover { color: var(--pinboard-accent) !important; background: var(--pinboard-accent-alpha) !important; }
#language_box a[style*="background:#ffa"],
#language_box a[style*="background: #ffa"] { background: var(--pinboard-accent-alpha) !important; color: var(--pinboard-accent) !important; }
.nli { color: var(--pinboard-muted) !important; }
.nav_nli { color: var(--pinboard-accent) !important; text-decoration: none !important; }
.nav_nli:hover { color: var(--pinboard-link-hover) !important; }

/* ---- Footer / colophon ---- */
#footer, .colophon, .colophon a { color: var(--pinboard-muted-soft) !important; }

/* ---- Scrollbars (Webkit + Firefox standard) ---- */
html, body, textarea, .description, .pin-ac .bd {
  scrollbar-width: thin !important;
  scrollbar-color: var(--pinboard-muted) var(--pinboard-bg-surface) !important;
}
::-webkit-scrollbar { width: 10px !important; height: 10px !important; }
::-webkit-scrollbar-track { background: var(--pinboard-bg-surface) !important; border-left: 1px solid var(--pinboard-border) !important; }
::-webkit-scrollbar-thumb { background: var(--pinboard-muted-soft) !important; border: 2px solid var(--pinboard-bg-surface) !important; border-radius: 6px !important; }
::-webkit-scrollbar-thumb:hover { background: var(--pinboard-accent) !important; }
::-webkit-scrollbar-corner { background: var(--pinboard-bg-surface) !important; }

/* ---- Global anchor fallbacks ---- */
a, a:link { color: var(--pinboard-accent) !important; }
a:hover { color: var(--pinboard-link-hover) !important; }
a:visited { color: var(--pinboard-link-visited) !important; }
a:focus-visible { outline: 2px solid var(--pinboard-focus-ring) !important; outline-offset: 2px !important; }
h2 { color: var(--pinboard-muted) !important; }
hr { border-color: var(--pinboard-border) !important; }

/* ---- Bundle slot input override: already in inline_base_rules — redundant here ---- */

/* ---- ::selection (also in _base but themes may want explicit) ---- */
::selection { background: var(--pinboard-selection-bg) !important; color: var(--pinboard-selection-fg) !important; }
::-moz-selection { background: var(--pinboard-selection-bg) !important; color: var(--pinboard-selection-fg) !important; }

/* === patterns layer (tokens.patterns) === */
#search_query_field:focus, #banner_searchbox input[type="text"]:focus, #right_bar input#key:focus, #tweet_searchbox #search_query_field:focus {
  box-shadow: 0 0 0 2px var(--pinboard-accent-alpha) !important;
  outline: none !important;
}
.bookmark { border: none !important; }
.bookmark { box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05) !important; transition: box-shadow 0.2s !important; }
.bookmark:hover { box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08) !important; }


/* === theme overrides (tokens.overrides.css) === */
/* Modern-card-specific: main column wrapper + checkbox accent + user nav hover */
#main_column { padding-top: 16px !important; }
.edit_checkbox input { accent-color: #1a73e8 !important; }
.user_navbar a:hover { color: #1a73e8 !important; }
/* ======== overrides-patch for modern-card (auto-generated by tools/generate-overrides.mjs) ========
 * Restores shipped decls the composer's token-driven output doesn't match.
 */
#banner { border-radius: 8px !important; background: #fff !important; border-bottom: 1px solid #e0e0e0 !important; box-shadow: 0 1px 3px rgba(0,0,0,0.06) !important; padding: 12px 20px !important; }
#search_query_field { width: 100% !important; border: 1px solid #dadce0 !important; border-radius: 6px !important; padding: 8px 12px !important; background: #f8f9fa !important; }
.bookmark { background: #fff !important; padding: 14px 18px !important; margin-bottom: 10px !important; box-shadow: 0 1px 3px rgba(0,0,0,0.04) !important; }
.star { color: #dadce0 !important; cursor: pointer !important; }
.selected_star { color: #fbbc04 !important; }
.note .note { box-shadow: none !important; }
#banner a { color: #5f6368 !important; }
#top_menu a { color: #5f6368 !important; }
.banner_username { color: #5f6368 !important; }
#banner a:hover { color: #1a73e8 !important; }
#top_menu a:hover { color: #1a73e8 !important; }
#pinboard_name a { font-weight: 700 !important; }
#sub_banner { background: #fafafa !important; border-bottom: 1px solid #e8e8e8 !important; }
#banner_searchbox input[type="text"] { border: 1px solid #dadce0 !important; border-radius: 6px !important; padding: 8px 12px !important; background: #f8f9fa !important; width: 100% !important; }
#search_query_field:focus { background: #fff !important; }
#banner_searchbox input[type="text"]:focus { background: #fff !important; }
.search_button input[type="submit"] { color: #fff !important; border: none !important; border-radius: 4px !important; padding: 4px 12px !important; font-size: 12px !important; }
.search_button input[type="submit"]:hover { background: #1765cc !important; }
a.url_display { color: #3c8039 !important; font-size: 12px !important; text-decoration: none !important; }
a.url_link { font-size: 12px !important; padding: 1px 5px !important; border-radius: 3px !important; }
.description { color: #5f6368 !important; font-size: 13px !important; margin-top: 4px !important; }
a.tag { padding: 2px 8px !important; margin-right: 4px !important; }
a.tag:hover { background: #d2e3fc !important; }
a.cached { text-decoration: none !important; font-size: 12px !important; }
.edit_links a { font-size: 11px !important; }
.edit_links a:hover { color: #5f6368 !important; }
a.unread { font-weight: 600 !important; }
#right_bar { background: #fff !important; border: 1px solid #e8e8e8 !important; border-radius: 8px !important; }
#right_bar h3 { color: #3c4043 !important; }
#right_bar h4 { color: #3c4043 !important; }
#right_bar b { color: #3c4043 !important; }
#right_bar a { color: #5f6368 !important; }
#right_bar a:hover { color: #1a73e8 !important; }
a.bundle { color: #5f6368 !important; text-decoration: none !important; }
a.bundle:hover { color: #1a73e8 !important; }
#tag_cloud a { color: #5f6368 !important; }
#tag_cloud a:hover { color: #1a73e8 !important; }
#tag_cloud_header a { font-size: 11px !important; }
a.tag_heading_selected { font-size: 11px !important; }
#tag_cloud a.tag { color: #5f6368 !important; }
#tag_cloud a.tag:hover { color: #1a73e8 !important; }
a.tag.selected { color: #1a73e8 !important; }
.next_prev { text-decoration: none !important; }
.next_prev_widget a { text-decoration: none !important; }
.next_prev:hover { text-decoration: underline !important; }
.next_prev_widget a:hover { text-decoration: underline !important; }
input[type="text"] { border: 1px solid #dadce0 !important; border-radius: 6px !important; padding: 8px 12px !important; font-family: inherit !important; background: #fff !important; }
input:not([type]) { border: 1px solid #dadce0 !important; border-radius: 6px !important; padding: 8px 12px !important; font-family: inherit !important; background: #fff !important; }
input[type="password"] { border: 1px solid #dadce0 !important; border-radius: 6px !important; padding: 8px 12px !important; font-family: inherit !important; background: #fff !important; }
textarea { border: 1px solid #dadce0 !important; border-radius: 6px !important; padding: 8px 12px !important; font-family: inherit !important; background: #fff !important; }
select { border: 1px solid #dadce0 !important; border-radius: 6px !important; padding: 8px 12px !important; font-family: inherit !important; background: #fff !important; }
input[type="text"]:focus { box-shadow: 0 0 0 2px rgba(26,115,232,0.15) !important; }
input:not([type]):focus { box-shadow: 0 0 0 2px rgba(26,115,232,0.15) !important; }
textarea:focus { box-shadow: 0 0 0 2px rgba(26,115,232,0.15) !important; }
select:focus { box-shadow: 0 0 0 2px rgba(26,115,232,0.15) !important; }
input[type="submit"] { color: #fff !important; border: none !important; border-radius: 6px !important; padding: 8px 20px !important; font-size: 13px !important; }
input[type="button"] { color: #fff !important; border: none !important; border-radius: 6px !important; padding: 8px 20px !important; font-size: 13px !important; }
input[type="submit"]:hover { background: #1765cc !important; }
input[type="button"]:hover { background: #1765cc !important; }
#edit_bookmark_form { background: #fff !important; border-radius: 8px !important; padding: 16px !important; box-shadow: 0 2px 8px rgba(0,0,0,0.08) !important; }
.suggested_tag { background: #e8f0fe !important; color: #1967d2 !important; border-radius: 12px !important; padding: 2px 8px !important; }
#settings_panel { background: #fff !important; border-radius: 8px !important; padding: 20px !important; }
.settings_tabs { border-bottom: 2px solid #e8e8e8 !important; }
.settings_tab { padding: 8px 16px 6px !important; }
.settings_tab_selected { border-bottom-color: #fff !important; background: #fff !important; font-weight: 600 !important; }
.settings_heading { color: #3c4043 !important; font-size: 15px !important; margin-top: 16px !important; }
a.help { background: #e4e6e9 !important; text-decoration: none !important; }
#settings_tab_panes table td { color: #3c4043 !important; }
.note { padding: 10px 0 !important; }
#note_right_column { background: #fff !important; border-radius: 8px !important; }
.service_box { background: #fff !important; }
.help_box { background: #fff !important; }
#profile_main_column h2 { color: #3c4043 !important; }
#profile_left_column h2 { color: #3c4043 !important; }
#profile_right_column h2 { color: #3c4043 !important; }
#bulk_top_bar { background: #e8f0fe !important; border-radius: 6px !important; padding: 10px !important; }
#bulk_edit_box { background: #e8f0fe !important; border-radius: 6px !important; padding: 10px !important; }
#popup_header { background: #fff !important; }
.formtable td { color: #3c4043 !important; }
.user_navbar a { color: #5f6368 !important; }
h2 { color: #3c4043 !important; }
#main_column form[name="sort"] table tr:hover { background: rgba(26,115,232,0.06) !important; }
#main_column form[name="sort"] table input[name^="id_"] { width: 38px !important; min-width: 38px !important; max-width: 38px !important; padding: 3px 4px !important; margin-right: 10px !important; font-size: 12px !important; line-height: 1.2 !important; box-sizing: border-box !important; vertical-align: middle !important; border: 1px solid #dadce0 !important; background: #fff !important; font-weight: 600 !important; }
#main_column form[name="sort"] table a.bundle { border-radius: 3px !important; }
#main_column form[name="sort"] table td a.edit { opacity: 0.7 !important; }
#right_bar table td a.tag { color: #3c4043 !important; }
#right_bar input#key { background: #f8f9fa !important; color: #3c4043 !important; border: 1px solid #dadce0 !important; }
#right_bar input#key:focus { box-shadow: 0 0 0 2px rgba(26,115,232,0.2) !important; }
#right_bar input[type="submit"] { color: #fff !important; }
#tweet_searchbox #search_query_field { background: #f8f9fa !important; color: #3c4043 !important; border: 1px solid #dadce0 !important; font-size: 13px !important; }
#tweet_searchbox #search_query_field:focus { box-shadow: 0 0 0 2px rgba(26,115,232,0.2) !important; }
#tweet_searchbox input[type="submit"] { color: #fff !important; }`
  },

  // ---- 2. Nord Night (Dark) ----
  "nord-night": {
    name: "Nord Night",
    desc: "Arctic dark theme with cool blue tones",
    css: `:root {
  --pinboard-bg: #2e3440;
  --pinboard-bg-surface: #3b4252;
  --pinboard-fg: #d8dee9;
  --pinboard-fg-strong: #eceff4;
  --pinboard-muted: #81a1c1;
  --pinboard-muted-soft: #4c566a;
  --pinboard-border: #434c5e;
  --pinboard-border-strong: #4c566a;
  --pinboard-border-soft: #434c5e;
  --pinboard-accent: #88c0d0;
  --pinboard-accent-hover: #8fbcbb;
  --pinboard-accent-soft: #3b4252;
  --pinboard-accent-alpha: rgba(136,192,208,0.25);
  --pinboard-input-bg: #434c5e;
  --pinboard-private-bg: #3b4252;
  --pinboard-private-accent: #ebcb8b;
  --pinboard-selection-bg: #5e81ac;
  --pinboard-selection-fg: #eceff4;
  --pinboard-tag-bg: transparent;
  --pinboard-tag-fg: #a3be8c;
  --pinboard-row-hover: #434c5e;
  --pinboard-destroy: #bf616a;
  --pinboard-btn-bg: #5e81ac;
  --pinboard-btn-bg-hover: #81a1c1;
  --pinboard-btn-fg: #eceff4;
  --pinboard-success: #a3be8c;
  --pinboard-success-hover: #b5d19c;
  --pinboard-url-link-bg: #3b4252;
  --pinboard-url-link-fg: #ebcb8b;
  --pinboard-link-hover: #88c0d0;
  --pinboard-link-visited: #81a1c1;
  --pinboard-focus-ring: #88c0d0;
  --pinboard-unread: #bf616a;
  --pinboard-font-family: "Inter", -apple-system, sans-serif;
  --pinboard-font-size-base: 13px;
  --pinboard-font-size-sm: 12px;
  --pinboard-font-size-lg: 15px;
  --pinboard-font-size-xs: 11px;
  --pinboard-line-height: 1.5;
  --pinboard-weight-body: 400;
  --pinboard-weight-heading: 700;
  --pinboard-space-unit: 4px;
  --pinboard-space-bookmark-gap: 6px;
  --pinboard-space-main-padding: 12px;
  --pinboard-space-sub-banner-y: 8px;
  --pinboard-space-right-bar-gap: 12px;
  --pinboard-space-form-gap: 8px;
  --pinboard-radius-sm: 4px;
  --pinboard-radius-md: 4px;
  --pinboard-radius-lg: 3px;
  --pinboard-border-width: 1px;
  --pinboard-border-style: solid;
  --pinboard-border-hairline: 1px dotted #434c5e;
}

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

/* override.generic-bgcolor — defensive against legacy HTML attr */
[bgcolor] { background-color: transparent !important; }

/* override.generic-html-color — defensive against legacy <font> */
font[color], font[size] { color: inherit !important; font-size: inherit !important; }

/* override.generic-fixed-width — defensive against layout tables */
table[width]:not([width="100%"]) { width: auto !important; max-width: 100% !important; }

/* === selection (applied globally; composers may override scoped) === */
::selection          { background: var(--pinboard-selection-bg); color: var(--pinboard-selection-fg); }
::-moz-selection     { background: var(--pinboard-selection-bg); color: var(--pinboard-selection-fg); }

/* === composer: classic-list-v2 — canonical surface inventory === */

/* ---- App shell typography (body#pinboard) ---- */
body#pinboard {
  background: var(--pinboard-bg) !important;
  color: var(--pinboard-fg) !important;
  font-family: var(--pinboard-font-family) !important;
  font-size: 13px !important;
  line-height: var(--pinboard-line-height) !important;
}
body#pinboard table, body#pinboard td, body#pinboard th,
body#pinboard p, body#pinboard b, body#pinboard strong,
body#pinboard label, body#pinboard span, body#pinboard li:not(.pin-ac li),
body#pinboard dd, body#pinboard dt { color: inherit !important; }

/* ---- Popup / iframe frame (body:not(#pinboard)) ---- */
body:not(#pinboard) {
  background: var(--pinboard-bg) !important;
  color: var(--pinboard-fg) !important;
  font-family: var(--pinboard-font-family) !important;
}
body:not(#pinboard) table, body:not(#pinboard) td,
body:not(#pinboard) p, body:not(#pinboard) label,
body:not(#pinboard) span { color: inherit !important; }
body:not(#pinboard) #popup_header { background: transparent !important; color: var(--pinboard-fg) !important; }

/* ---- Banner & navigation ---- */
#banner { background: var(--pinboard-bg-surface) !important; border-color: var(--pinboard-border) !important; max-width: 1030px !important; box-sizing: border-box !important; }
#banner a, #top_menu a, .banner_username { color: var(--pinboard-accent) !important; }
#banner a:hover, #top_menu a:hover { color: var(--pinboard-link-hover) !important; }
#pinboard_name a { color: var(--pinboard-accent) !important; font-weight: var(--pinboard-weight-heading) !important; }
#sub_banner { background: var(--pinboard-bg-surface) !important; border-color: var(--pinboard-border) !important; }
#sub_banner a { color: var(--pinboard-muted) !important; }
#sub_banner a:hover, #sub_banner a.selected { color: var(--pinboard-accent) !important; }

/* ---- Search (banner + main) ---- */
#searchbox { margin-bottom: 12px !important; }
a.bundle { color: var(--pinboard-accent) !important; }
a.bundle:hover { color: var(--pinboard-link-hover) !important; }
#search_query_field, #banner_searchbox input[type="text"] {
  background: var(--pinboard-input-bg) !important;
  color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  box-sizing: border-box !important;
}
#search_query_field:focus, #banner_searchbox input[type="text"]:focus { border-color: var(--pinboard-accent) !important; outline: none !important; }
.search_button input[type="submit"] {
  background: var(--pinboard-accent) !important;
  color: var(--pinboard-btn-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-accent) !important;
  cursor: pointer !important;
}
.search_button input[type="submit"]:hover { background: var(--pinboard-link-hover) !important; }

/* ---- Bookmark list ---- */
.bookmark {
  background: var(--pinboard-bg-surface) !important; border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important; border-radius: var(--pinboard-radius-md) !important; padding: 12px 16px !important; margin-bottom: 6px !important;
  display: flex !important;
  align-items: flex-start !important;
}
.bookmark { transition: box-shadow 0.2s ease !important; }
.bookmark .display { float: none !important; flex: 1 !important; width: auto !important; min-width: 0 !important; }
.star, .selected_star { margin-left: 0 !important; margin-right: 6px !important; float: none !important; flex-shrink: 0 !important; }
.star { color: var(--pinboard-border) !important; }
.selected_star { color: var(--pinboard-private-accent) !important; }

a.bookmark_title { color: var(--pinboard-accent) !important; font-size: 15px !important; text-decoration: none !important; font-weight: var(--pinboard-weight-heading) !important; }
a.bookmark_title:hover { color: var(--pinboard-link-hover) !important; text-decoration: underline !important; }
a.url_display, a.when, a.cached { color: var(--pinboard-muted-soft) !important; font-size: 11px !important; }
a.url_link {
  color: var(--pinboard-url-link-fg) !important;
  background: var(--pinboard-url-link-bg) !important;
  padding: 1px 6px !important;
  border-radius: var(--pinboard-radius-lg) !important;
  font-size: 11px !important;
}
.description { color: var(--pinboard-fg) !important; opacity: 0.85 !important; line-height: var(--pinboard-line-height) !important; }
.description blockquote { color: var(--pinboard-muted) !important; border-left: 3px solid var(--pinboard-accent-alpha) !important; padding-left: 10px !important; margin: 4px 0 !important; }

a.tag {
  color: var(--pinboard-tag-fg) !important;
  background: var(--pinboard-tag-bg) !important;
  padding: 1px 8px !important;
  border-radius: var(--pinboard-radius-lg) !important;
  font-size: 11px !important;
  text-decoration: none !important;
}
a.tag:hover { color: var(--pinboard-tag-fg) !important; background: var(--pinboard-accent-alpha) !important; text-decoration: none !important; }
a.tag.selected { color: var(--pinboard-destroy) !important; font-weight: bold !important; }
a.sort_order_selected { background: var(--pinboard-tag-bg) !important; color: var(--pinboard-accent) !important; }

a.unread { color: var(--pinboard-destroy) !important; font-weight: bold !important; }
.edit_links a, a.copy_link { color: var(--pinboard-muted-soft) !important; }
.edit_links a:hover { color: var(--pinboard-fg) !important; }
a.copy_link { color: var(--pinboard-accent) !important; }
a.delete, a.destroy { color: var(--pinboard-destroy) !important; }

/* ---- Private bookmarks ---- */
.bookmark.private,
.bookmark.private[style*="background"] { background: var(--pinboard-private-bg) !important; box-shadow: inset 3px 0 0 var(--pinboard-private-accent) !important; border-top-color: transparent !important; border-right-color: transparent !important; border-left-color: transparent !important; }

/* ---- Right bar ---- */
#right_bar {
  background: var(--pinboard-bg-surface) !important;
  color: var(--pinboard-fg) !important;
  padding: var(--pinboard-space-right-bar-gap) !important;
  box-sizing: border-box !important;
  overflow: hidden !important;
  word-wrap: break-word !important;
}
#right_bar h3, #right_bar h4, #right_bar b { color: var(--pinboard-muted) !important; }
#right_bar a { color: var(--pinboard-accent) !important; }
#right_bar a:hover { color: var(--pinboard-link-hover) !important; }
#right_bar table tr[onmouseover] { background: transparent !important; }
#right_bar table tr[onmouseover]:hover { background: var(--pinboard-row-hover) !important; }
#right_bar table td a.tag { color: var(--pinboard-fg) !important; }
#right_bar table td a.delete { color: var(--pinboard-muted-soft) !important; font-size: 11px !important; opacity: 0.55 !important; transition: opacity 0.15s ease, color 0.15s ease !important; }
#right_bar table tr:hover td a.delete { color: var(--pinboard-destroy) !important; opacity: 1 !important; }
#right_bar input#key {
  background: var(--pinboard-input-bg) !important;
  color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-radius: var(--pinboard-radius-sm) !important;
  padding: 4px 8px !important;
  box-sizing: border-box !important;
  font-size: 12px !important;
}
#right_bar input#key:focus { border-color: var(--pinboard-accent) !important; box-shadow: 0 0 0 2px var(--pinboard-accent-alpha) !important; outline: none !important; }
#right_bar input[type="submit"] {
  background: var(--pinboard-success) !important;
  color: var(--pinboard-btn-fg) !important;
  border: none !important;
  border-radius: var(--pinboard-radius-sm) !important;
  padding: 4px 10px !important;
  margin-left: 6px !important;
  cursor: pointer !important;
  font-size: 12px !important;
  transition: background 0.15s ease !important;
}
#right_bar input[type="submit"]:hover { background: var(--pinboard-success-hover) !important; }

/* ---- Tag cloud ---- */
#tag_cloud { max-width: 100% !important; overflow-wrap: break-word !important; }
#tag_cloud a, #tag_cloud a.tag { color: var(--pinboard-accent) !important; }
#tag_cloud a:hover, #tag_cloud a.tag:hover { color: var(--pinboard-link-hover) !important; }
#tag_cloud_header a, a.tag_heading_selected { color: var(--pinboard-muted-soft) !important; }
#tag_cloud_header a:hover { color: var(--pinboard-accent) !important; }

/* ---- Tweets page searchbox ---- */
#tweet_searchbox { margin-bottom: 12px !important; }
#tweet_searchbox form { display: flex !important; flex-direction: column !important; gap: var(--pinboard-space-form-gap) !important; margin: 0 !important; }
#tweet_searchbox br { display: none !important; }
#tweet_searchbox #search_query_field {
  width: 100% !important; box-sizing: border-box !important;
  background: var(--pinboard-input-bg) !important; color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-radius: var(--pinboard-radius-sm) !important;
  padding: 6px 10px !important; font-size: 12px !important;
}
#tweet_searchbox #search_query_field:focus { border-color: var(--pinboard-accent) !important; box-shadow: 0 0 0 2px var(--pinboard-accent-alpha) !important; outline: none !important; }
#tweet_searchbox input[type="submit"] {
  background: var(--pinboard-success) !important; color: var(--pinboard-btn-fg) !important;
  border: none !important; border-radius: var(--pinboard-radius-sm) !important;
  padding: 5px 14px !important; cursor: pointer !important;
  font-size: 12px !important; align-self: flex-start !important;
  transition: background 0.15s ease !important;
}
#tweet_searchbox input[type="submit"]:hover { background: var(--pinboard-success-hover) !important; }

/* ---- Forms (global) ---- */
input[type="text"], input:not([type]), input[type="password"], textarea, select {
  background: var(--pinboard-input-bg) !important; color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  box-sizing: border-box !important; max-width: 100% !important;
}
input[type="text"]:focus, input:not([type]):focus, textarea:focus, select:focus { border-color: var(--pinboard-accent) !important; outline: none !important; }
input[type="submit"], input[type="button"] {
  background: var(--pinboard-accent) !important; color: var(--pinboard-btn-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-accent) !important;
  border-radius: var(--pinboard-radius-sm) !important;
  padding: 4px 12px !important;
  cursor: pointer !important;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease !important;
}
input[type="submit"]:hover, input[type="button"]:hover { background: var(--pinboard-link-hover) !important; border-color: var(--pinboard-link-hover) !important; }
input[type="reset"], input[type="reset"].reset, button[type="reset"] {
  background: var(--pinboard-bg-surface) !important; color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-radius: var(--pinboard-radius-sm) !important;
  padding: 4px 12px !important;
  cursor: pointer !important;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease !important;
}
input[type="reset"]:hover, input[type="reset"].reset:hover, button[type="reset"]:hover { background: var(--pinboard-row-hover) !important; border-color: var(--pinboard-accent) !important; color: var(--pinboard-accent) !important; }
input[type="checkbox"], input[type="radio"] { accent-color: var(--pinboard-accent) !important; }
.suggested_tag { color: var(--pinboard-success) !important; cursor: pointer !important; }
#edit_bookmark_form { background: var(--pinboard-bg-surface) !important; border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important; }

/* ---- Tag completion popup (Pin.Tags widget on /add/, edit-bookmark, note-add) ---- */
.pin-ac { z-index: 1000 !important; }
.pin-ac .bd {
  background: var(--pinboard-bg-surface) !important;
  color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-radius: var(--pinboard-radius-sm) !important;
  box-shadow: 0 2px 8px var(--pinboard-accent-alpha) !important;
}
.pin-ac li {
  background: transparent !important;
  color: var(--pinboard-fg) !important;
  padding: 4px 10px !important;
  font-size: 12px !important;
}
.pin-ac li:hover { background: var(--pinboard-accent-alpha) !important; color: var(--pinboard-fg) !important; cursor: pointer !important; }
.pin-ac .active { background: var(--pinboard-selection-bg) !important; color: var(--pinboard-selection-fg) !important; }

/* ---- Settings page ---- */
#settings_panel { background: var(--pinboard-bg-surface) !important; }
.settings_tabs { border-color: var(--pinboard-border) !important; }
.settings_tab { color: var(--pinboard-muted) !important; padding: 6px 12px !important; border-bottom-color: var(--pinboard-border) !important; }
.settings_tab a { color: inherit !important; text-decoration: none !important; }
.settings_tab:hover { color: var(--pinboard-accent) !important; }
.settings_tab_selected {
  color: var(--pinboard-accent) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-top: 2px solid var(--pinboard-accent) !important;
  border-bottom-color: var(--pinboard-bg-surface) !important;
  background: var(--pinboard-bg-surface) !important;
  font-weight: bold !important;
  margin-bottom: -1px !important;
}
.settings_tab_selected a { color: var(--pinboard-accent) !important; }
[class*="settings_tab_spacer"] { border-bottom-color: var(--pinboard-border) !important; }
.settings_heading { color: var(--pinboard-muted) !important; background: transparent !important; border-bottom: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important; padding-bottom: 6px !important; }
a.help { color: var(--pinboard-muted-soft) !important; background: var(--pinboard-accent-soft) !important; }
.email_secret { color: var(--pinboard-accent) !important; }
#settings_tab_panes { border: none !important; }
#settings_tab_panes table td { color: var(--pinboard-fg) !important; }

/* ---- Profile page ---- */
.service_box, .help_box {
  background: var(--pinboard-bg-surface) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-radius: var(--pinboard-radius-md) !important;
  padding: 16px !important;
  box-sizing: border-box !important;
  margin-bottom: 12px !important;
}
.service_box .service_box { border: none !important; padding: 0 !important; margin: 0 !important; background: transparent !important; border-radius: 0 !important; width: auto !important; box-sizing: border-box !important; }
#profile_left_column { margin-right: 20px !important; }
#profile_right_column { width: 430px !important; }
#profile_main_column h2, #profile_left_column h2, #profile_right_column h2 { color: var(--pinboard-muted) !important; }
#profile_main_column table td, #profile_right_column table td { color: var(--pinboard-fg) !important; }

/* ---- Notes ---- */
.note { border-bottom: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important; }
.note a { color: var(--pinboard-accent) !important; }
.note .note { border: none !important; padding: 0 !important; margin: 0 !important; background: transparent !important; border-radius: 0 !important; }
#note_right_column { background: var(--pinboard-bg-surface) !important; color: var(--pinboard-fg) !important; padding: 16px !important; border-left: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important; }

/* ---- Bulk edit ---- */
#bulk_top_bar, #bulk_edit_box { background: var(--pinboard-bg-surface) !important; border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important; color: var(--pinboard-fg) !important; }

/* ---- Save bookmark popup ---- */
#popup_header { background: var(--pinboard-bg-surface) !important; color: var(--pinboard-fg) !important; }
.formtable td { color: var(--pinboard-fg) !important; }
.bookmark_count, .bookmark_count_box { color: var(--pinboard-muted) !important; }
.user_navbar a { color: var(--pinboard-accent) !important; }
.rss_link, .rss_linkbox a { color: var(--pinboard-muted-soft) !important; }

/* ---- Bundles (P4-table) — /u/<user>/bundles/ ---- */
#main_column form[name="sort"] > table { width: 100% !important; max-width: 880px !important; border-collapse: separate !important; border-spacing: 0 4px !important; margin-top: 8px !important; }
#main_column form[name="sort"] table tr { background: transparent !important; border-radius: var(--pinboard-radius-md) !important; }
#main_column form[name="sort"] table tr:hover { background: var(--pinboard-row-hover) !important; }
#main_column form[name="sort"] table td { padding: 6px 10px !important; vertical-align: middle !important; border: none !important; }
#main_column form[name="sort"] table td[style*="text-align:right"] { min-width: 160px !important; padding-right: 14px !important; white-space: nowrap !important; }
#main_column form[name="sort"] table input[name^="id_"] {
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  background: var(--pinboard-input-bg) !important;
  color: var(--pinboard-fg) !important;
  width: 32px !important;
  border-radius: var(--pinboard-radius-sm) !important;
  text-align: center !important;
}
#main_column form[name="sort"] table input[name^="id_"]:focus { border-color: var(--pinboard-accent) !important; box-shadow: 0 0 0 2px var(--pinboard-accent-alpha) !important; outline: none !important; }
#main_column form[name="sort"] table a.bundle { font-weight: var(--pinboard-weight-heading) !important; font-style: normal !important; letter-spacing: 0.01em !important; padding: 2px 4px !important; border-radius: var(--pinboard-radius-sm) !important; }
#main_column form[name="sort"] table a[style*="color:#aaa"],
#main_column form[name="sort"] table a[style*="color: #aaa"] { color: var(--pinboard-muted) !important; opacity: 1 !important; text-decoration: none !important; font-size: 12px !important; margin-left: 4px !important; }
#main_column form[name="sort"] table a[style*="color:#aaa"]:hover { color: var(--pinboard-accent) !important; text-decoration: underline !important; }
#main_column form[name="sort"] table td a.edit { color: var(--pinboard-muted) !important; opacity: 0.8 !important; transition: opacity 0.15s ease !important; }
#main_column form[name="sort"] table td a.destroy { color: var(--pinboard-destroy) !important; opacity: 0.85 !important; font-weight: var(--pinboard-weight-heading) !important; }
#main_column form[name="sort"] table tr:hover td a.edit { color: var(--pinboard-accent) !important; opacity: 1 !important; }
#main_column form[name="sort"] table tr:hover td a.destroy { opacity: 1 !important; }

/* ---- Pagination ---- */
.next_prev, .next_prev_widget a { color: var(--pinboard-accent) !important; }
.next_prev:hover, .next_prev_widget a:hover { color: var(--pinboard-link-hover) !important; }
#nextprev a.edit { color: var(--pinboard-muted-soft) !important; }

/* ---- Logged-out landing page (https://pinboard.in/) ---- */
#main_welcome, .homepage_quad { color: var(--pinboard-fg) !important; }
.homepage_heading { color: var(--pinboard-fg-strong) !important; font-weight: var(--pinboard-weight-heading) !important; }
.homepage_subheading { color: var(--pinboard-muted) !important; }
.signup_button,
.signup_button[style*="background"] {
  background: var(--pinboard-btn-bg) !important;
  color: var(--pinboard-btn-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-btn-bg) !important;
  border-radius: var(--pinboard-radius-sm) !important;
  padding: 10px 16px !important;
  text-align: center !important;
  font-weight: var(--pinboard-weight-heading) !important;
  cursor: pointer !important;
  transition: background 0.15s ease, border-color 0.15s ease !important;
}
.signup_button:hover { background: var(--pinboard-btn-bg-hover) !important; border-color: var(--pinboard-btn-bg-hover) !important; }
#blurb_div { color: var(--pinboard-fg) !important; }
.blurb_column { color: var(--pinboard-fg) !important; }
#blurb_div a { text-decoration: none !important; color: var(--pinboard-fg) !important; display: block !important; }
.blurb_box {
  background: var(--pinboard-bg-surface) !important;
  color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-radius: var(--pinboard-radius-md) !important;
  padding: 12px 14px !important;
  margin-bottom: 10px !important;
  transition: background 0.15s ease, border-color 0.15s ease !important;
}
#blurb_div a:hover .blurb_box { background: var(--pinboard-row-hover) !important; border-color: var(--pinboard-accent-alpha) !important; }
.magazine_title { color: var(--pinboard-accent) !important; font-weight: var(--pinboard-weight-heading) !important; }
.blurb { color: var(--pinboard-fg) !important; opacity: 0.85 !important; }
#language_box { color: var(--pinboard-muted) !important; }
#language_box p { margin: 2px 0 !important; }
#language_box a { color: var(--pinboard-muted) !important; padding: 1px 6px !important; border-radius: var(--pinboard-radius-sm) !important; text-decoration: none !important; }
#language_box a:hover { color: var(--pinboard-accent) !important; background: var(--pinboard-accent-alpha) !important; }
#language_box a[style*="background:#ffa"],
#language_box a[style*="background: #ffa"] { background: var(--pinboard-accent-alpha) !important; color: var(--pinboard-accent) !important; }
.nli { color: var(--pinboard-muted) !important; }
.nav_nli { color: var(--pinboard-accent) !important; text-decoration: none !important; }
.nav_nli:hover { color: var(--pinboard-link-hover) !important; }

/* ---- Footer / colophon ---- */
#footer, .colophon, .colophon a { color: var(--pinboard-muted-soft) !important; }

/* ---- Scrollbars (Webkit + Firefox standard) ---- */
html, body, textarea, .description, .pin-ac .bd {
  scrollbar-width: thin !important;
  scrollbar-color: var(--pinboard-muted) var(--pinboard-bg-surface) !important;
}
::-webkit-scrollbar { width: 10px !important; height: 10px !important; }
::-webkit-scrollbar-track { background: var(--pinboard-bg-surface) !important; border-left: 1px solid var(--pinboard-border) !important; }
::-webkit-scrollbar-thumb { background: var(--pinboard-muted-soft) !important; border: 2px solid var(--pinboard-bg-surface) !important; border-radius: 6px !important; }
::-webkit-scrollbar-thumb:hover { background: var(--pinboard-accent) !important; }
::-webkit-scrollbar-corner { background: var(--pinboard-bg-surface) !important; }

/* ---- Global anchor fallbacks ---- */
a, a:link { color: var(--pinboard-accent) !important; }
a:hover { color: var(--pinboard-link-hover) !important; }
a:visited { color: var(--pinboard-link-visited) !important; }
a:focus-visible { outline: 2px solid var(--pinboard-focus-ring) !important; outline-offset: 2px !important; }
h2 { color: var(--pinboard-muted) !important; }
hr { border-color: var(--pinboard-border) !important; }

/* ---- Bundle slot input override: already in inline_base_rules — redundant here ---- */

/* ---- ::selection (also in _base but themes may want explicit) ---- */
::selection { background: var(--pinboard-selection-bg) !important; color: var(--pinboard-selection-fg) !important; }
::-moz-selection { background: var(--pinboard-selection-bg) !important; color: var(--pinboard-selection-fg) !important; }

/* === patterns layer (tokens.patterns) === */
#search_query_field:focus, #banner_searchbox input[type="text"]:focus, #right_bar input#key:focus, #tweet_searchbox #search_query_field:focus {
  box-shadow: 0 0 0 2px var(--pinboard-accent-alpha) !important;
  outline: none !important;
}
.bookmark { border-bottom: 1px solid var(--pinboard-border) !important; }


/* === theme overrides (tokens.overrides.css) === */
/* ======== overrides-patch for nord-night (auto-generated by tools/generate-overrides.mjs) ========
 * Restores shipped decls the composer's token-driven output doesn't match.
 */
#banner { border-radius: 4px !important; padding: 8px 16px !important; }
#search_query_field { width: 100% !important; border: 1px solid #4c566a !important; }
.bookmark { padding: 12px 14px !important; }
#banner a:hover { color: #8fbcbb !important; }
#top_menu a:hover { color: #8fbcbb !important; }
#banner_searchbox input[type="text"] { border: 1px solid #4c566a !important; }
.search_button input[type="submit"] { background: #5e81ac !important; border: 1px solid #81a1c1 !important; }
.search_button input[type="submit"]:hover { background: #81a1c1 !important; }
a.bookmark_title:hover { color: #8fbcbb !important; }
a.url_display { color: #a3be8c !important; font-size: 12px !important; }
a.url_link { padding: 1px 5px !important; background: rgba(59,66,82,0.8) !important; }
.description { opacity: 0.8 !important; }
.description blockquote { color: #d8dee9 !important; border-left: 3px solid #4c566a !important; }
a.tag { font-size: 12px !important; }
a.tag:hover { color: #b5d19c !important; text-decoration: underline !important; }
a.copy_link { color: #81a1c1 !important; }
#right_bar a { color: #81a1c1 !important; }
a.bundle { color: #81a1c1 !important; }
#tag_cloud a { color: #81a1c1 !important; }
#tag_cloud a.tag:hover { color: #8fbcbb !important; }
a.tag.selected { color: #ebcb8b !important; }
a.sort_order_selected { background: #434c5e !important; }
.next_prev { color: #81a1c1 !important; }
.next_prev_widget a { color: #81a1c1 !important; }
input[type="text"] { border: 1px solid #4c566a !important; }
input:not([type]) { border: 1px solid #4c566a !important; }
input[type="password"] { border: 1px solid #4c566a !important; }
textarea { border: 1px solid #4c566a !important; }
select { border: 1px solid #4c566a !important; }
input[type="submit"] { background: #5e81ac !important; border: 1px solid #81a1c1 !important; }
input[type="button"] { background: #5e81ac !important; border: 1px solid #81a1c1 !important; }
input[type="submit"]:hover { background: #81a1c1 !important; }
input[type="button"]:hover { background: #81a1c1 !important; }
#edit_bookmark_form { background: #434c5e !important; border: 1px solid #4c566a !important; }
.service_box { border-radius: 6px !important; }
.help_box { border-radius: 6px !important; }
#bulk_top_bar { background: #434c5e !important; border: 1px solid #4c566a !important; }
#bulk_edit_box { background: #434c5e !important; border: 1px solid #4c566a !important; }
.user_navbar a { color: #81a1c1 !important; }
a { color: #81a1c1 !important; }
#main_column form[name="sort"] table tr:hover { background: rgba(136,192,208,0.08) !important; }
#main_column form[name="sort"] table input[name^="id_"] { width: 38px !important; min-width: 38px !important; max-width: 38px !important; padding: 3px 4px !important; margin-right: 10px !important; font-size: 12px !important; line-height: 1.2 !important; box-sizing: border-box !important; vertical-align: middle !important; border: 1px solid #4c566a !important; background: #3b4252 !important; font-weight: 600 !important; }
#main_column form[name="sort"] table a.bundle { font-weight: 600 !important; border-radius: 3px !important; }
#main_column form[name="sort"] table a[style*="color:#aaa"] { color: #4c566a !important; }
#main_column form[name="sort"] table a[style*="color: #aaa"] { color: #4c566a !important; }
#main_column form[name="sort"] table td a.edit { color: #4c566a !important; opacity: 0.75 !important; }
#main_column form[name="sort"] table td a.destroy { font-weight: 600 !important; }
#right_bar table td a.delete { color: #7b8594 !important; }
#right_bar input#key { background: #3b4252 !important; border: 1px solid #4c566a !important; }
#right_bar input[type="submit"] { background: #5e81ac !important; }
#right_bar input[type="submit"]:hover { background: #81a1c1 !important; }
#tweet_searchbox #search_query_field { background: #3b4252 !important; border: 1px solid #4c566a !important; font-size: 13px !important; }
#tweet_searchbox input[type="submit"] { background: #5e81ac !important; }
#tweet_searchbox input[type="submit"]:hover { background: #81a1c1 !important; }`
  },

  // ---- 3. Terminal (Dark) ----
  "terminal": {
    name: "Terminal",
    desc: "Retro CRT green-on-black hacker style",
    css: `:root {
  --pinboard-bg: #0a0a0a;
  --pinboard-bg-surface: #111111;
  --pinboard-fg: #33ff33;
  --pinboard-fg-strong: #66ff66;
  --pinboard-muted: #22aa22;
  --pinboard-muted-soft: #336633;
  --pinboard-border: #33ff3340;
  --pinboard-border-strong: #33ff3380;
  --pinboard-border-soft: #33ff3325;
  --pinboard-accent: #33ff33;
  --pinboard-accent-hover: #66ff66;
  --pinboard-accent-soft: #1a3a1a;
  --pinboard-accent-alpha: rgba(51,255,51,0.3);
  --pinboard-input-bg: #111111;
  --pinboard-private-bg: #161600;
  --pinboard-private-accent: #cccc00;
  --pinboard-selection-bg: #33ff3340;
  --pinboard-selection-fg: #ffffff;
  --pinboard-tag-bg: transparent;
  --pinboard-tag-fg: #00cccc;
  --pinboard-row-hover: #0f2a0f;
  --pinboard-destroy: #ff3333;
  --pinboard-btn-bg: #1a3a1a;
  --pinboard-btn-bg-hover: #2a5a2a;
  --pinboard-btn-fg: #33ff33;
  --pinboard-success: #003300;
  --pinboard-success-hover: #005500;
  --pinboard-url-link-bg: #0d1a0d;
  --pinboard-url-link-fg: #cccc00;
  --pinboard-link-hover: #66ff66;
  --pinboard-link-visited: #33ff33;
  --pinboard-focus-ring: #33ff33;
  --pinboard-unread: #ff3333;
  --pinboard-font-family: "Fira Code", "Cascadia Code", "Consolas", monospace;
  --pinboard-font-size-base: 13px;
  --pinboard-font-size-sm: 12px;
  --pinboard-font-size-lg: 14px;
  --pinboard-font-size-xs: 11px;
  --pinboard-line-height: 1.5;
  --pinboard-weight-body: 400;
  --pinboard-weight-heading: 700;
  --pinboard-space-unit: 4px;
  --pinboard-space-bookmark-gap: 4px;
  --pinboard-space-main-padding: 12px;
  --pinboard-space-sub-banner-y: 8px;
  --pinboard-space-right-bar-gap: 12px;
  --pinboard-space-form-gap: 8px;
  --pinboard-radius-sm: 4px;
  --pinboard-radius-md: 4px;
  --pinboard-radius-lg: 3px;
  --pinboard-border-width: 1px;
  --pinboard-border-style: solid;
  --pinboard-border-hairline: 1px dotted #33ff3340;
}

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

/* override.generic-bgcolor — defensive against legacy HTML attr */
[bgcolor] { background-color: transparent !important; }

/* override.generic-html-color — defensive against legacy <font> */
font[color], font[size] { color: inherit !important; font-size: inherit !important; }

/* override.generic-fixed-width — defensive against layout tables */
table[width]:not([width="100%"]) { width: auto !important; max-width: 100% !important; }

/* === selection (applied globally; composers may override scoped) === */
::selection          { background: var(--pinboard-selection-bg); color: var(--pinboard-selection-fg); }
::-moz-selection     { background: var(--pinboard-selection-bg); color: var(--pinboard-selection-fg); }

/* === composer: classic-list-v2 — canonical surface inventory === */

/* ---- App shell typography (body#pinboard) ---- */
body#pinboard {
  background: var(--pinboard-bg) !important;
  color: var(--pinboard-fg) !important;
  font-family: var(--pinboard-font-family) !important;
  font-size: 13px !important;
  line-height: var(--pinboard-line-height) !important;
}
body#pinboard table, body#pinboard td, body#pinboard th,
body#pinboard p, body#pinboard b, body#pinboard strong,
body#pinboard label, body#pinboard span, body#pinboard li:not(.pin-ac li),
body#pinboard dd, body#pinboard dt { color: inherit !important; }

/* ---- Popup / iframe frame (body:not(#pinboard)) ---- */
body:not(#pinboard) {
  background: var(--pinboard-bg) !important;
  color: var(--pinboard-fg) !important;
  font-family: var(--pinboard-font-family) !important;
}
body:not(#pinboard) table, body:not(#pinboard) td,
body:not(#pinboard) p, body:not(#pinboard) label,
body:not(#pinboard) span { color: inherit !important; }
body:not(#pinboard) #popup_header { background: transparent !important; color: var(--pinboard-fg) !important; }

/* ---- Banner & navigation ---- */
#banner { background: var(--pinboard-bg-surface) !important; border-color: var(--pinboard-border) !important; max-width: 1030px !important; box-sizing: border-box !important; }
#banner a, #top_menu a, .banner_username { color: var(--pinboard-accent) !important; }
#banner a:hover, #top_menu a:hover { color: var(--pinboard-link-hover) !important; }
#pinboard_name a { color: var(--pinboard-accent) !important; font-weight: var(--pinboard-weight-heading) !important; }
#sub_banner { background: var(--pinboard-bg-surface) !important; border-color: var(--pinboard-border) !important; }
#sub_banner a { color: var(--pinboard-muted) !important; }
#sub_banner a:hover, #sub_banner a.selected { color: var(--pinboard-accent) !important; }

/* ---- Search (banner + main) ---- */
#searchbox { margin-bottom: 12px !important; }
a.bundle { color: var(--pinboard-accent) !important; }
a.bundle:hover { color: var(--pinboard-link-hover) !important; }
#search_query_field, #banner_searchbox input[type="text"] {
  background: var(--pinboard-input-bg) !important;
  color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  box-sizing: border-box !important;
}
#search_query_field:focus, #banner_searchbox input[type="text"]:focus { border-color: var(--pinboard-accent) !important; outline: none !important; }
.search_button input[type="submit"] {
  background: var(--pinboard-accent) !important;
  color: var(--pinboard-btn-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-accent) !important;
  cursor: pointer !important;
}
.search_button input[type="submit"]:hover { background: var(--pinboard-link-hover) !important; }

/* ---- Bookmark list ---- */
.bookmark {
  background: transparent !important;
  display: flex !important;
  align-items: flex-start !important;
}
.bookmark { transition: box-shadow 0.2s ease !important; }
.bookmark .display { float: none !important; flex: 1 !important; width: auto !important; min-width: 0 !important; }
.star, .selected_star { margin-left: 0 !important; margin-right: 6px !important; float: none !important; flex-shrink: 0 !important; }
.star { color: var(--pinboard-border) !important; }
.selected_star { color: var(--pinboard-private-accent) !important; }

a.bookmark_title { color: var(--pinboard-accent) !important; font-size: 14px !important; text-decoration: none !important; font-weight: var(--pinboard-weight-heading) !important; }
a.bookmark_title:hover { color: var(--pinboard-link-hover) !important; text-decoration: underline !important; }
a.url_display, a.when, a.cached { color: var(--pinboard-muted-soft) !important; font-size: 11px !important; }
a.url_link {
  color: var(--pinboard-url-link-fg) !important;
  background: var(--pinboard-url-link-bg) !important;
  padding: 1px 6px !important;
  border-radius: var(--pinboard-radius-lg) !important;
  font-size: 11px !important;
}
.description { color: var(--pinboard-fg) !important; opacity: 0.85 !important; line-height: var(--pinboard-line-height) !important; }
.description blockquote { color: var(--pinboard-muted) !important; border-left: 3px solid var(--pinboard-accent-alpha) !important; padding-left: 10px !important; margin: 4px 0 !important; }

a.tag {
  color: var(--pinboard-tag-fg) !important;
  background: var(--pinboard-tag-bg) !important;
  padding: 1px 8px !important;
  border-radius: var(--pinboard-radius-lg) !important;
  font-size: 11px !important;
  text-decoration: none !important;
}
a.tag:hover { color: var(--pinboard-tag-fg) !important; background: var(--pinboard-accent-alpha) !important; text-decoration: none !important; }
a.tag.selected { color: var(--pinboard-destroy) !important; font-weight: bold !important; }
a.sort_order_selected { background: var(--pinboard-tag-bg) !important; color: var(--pinboard-accent) !important; }

a.unread { color: var(--pinboard-destroy) !important; font-weight: bold !important; }
.edit_links a, a.copy_link { color: var(--pinboard-muted-soft) !important; }
.edit_links a:hover { color: var(--pinboard-fg) !important; }
a.copy_link { color: var(--pinboard-accent) !important; }
a.delete, a.destroy { color: var(--pinboard-destroy) !important; }

/* ---- Private bookmarks ---- */
.bookmark.private,
.bookmark.private[style*="background"] { background: var(--pinboard-private-bg) !important; box-shadow: inset 3px 0 0 var(--pinboard-private-accent) !important; border-top-color: transparent !important; border-right-color: transparent !important; border-left-color: transparent !important; }

/* ---- Right bar ---- */
#right_bar {
  background: var(--pinboard-bg-surface) !important;
  color: var(--pinboard-fg) !important;
  padding: var(--pinboard-space-right-bar-gap) !important;
  box-sizing: border-box !important;
  overflow: hidden !important;
  word-wrap: break-word !important;
}
#right_bar h3, #right_bar h4, #right_bar b { color: var(--pinboard-muted) !important; }
#right_bar a { color: var(--pinboard-accent) !important; }
#right_bar a:hover { color: var(--pinboard-link-hover) !important; }
#right_bar table tr[onmouseover] { background: transparent !important; }
#right_bar table tr[onmouseover]:hover { background: var(--pinboard-row-hover) !important; }
#right_bar table td a.tag { color: var(--pinboard-fg) !important; }
#right_bar table td a.delete { color: var(--pinboard-muted-soft) !important; font-size: 11px !important; opacity: 0.55 !important; transition: opacity 0.15s ease, color 0.15s ease !important; }
#right_bar table tr:hover td a.delete { color: var(--pinboard-destroy) !important; opacity: 1 !important; }
#right_bar input#key {
  background: var(--pinboard-input-bg) !important;
  color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-radius: var(--pinboard-radius-sm) !important;
  padding: 4px 8px !important;
  box-sizing: border-box !important;
  font-size: 12px !important;
}
#right_bar input#key:focus { border-color: var(--pinboard-accent) !important; box-shadow: 0 0 0 2px var(--pinboard-accent-alpha) !important; outline: none !important; }
#right_bar input[type="submit"] {
  background: var(--pinboard-success) !important;
  color: var(--pinboard-btn-fg) !important;
  border: none !important;
  border-radius: var(--pinboard-radius-sm) !important;
  padding: 4px 10px !important;
  margin-left: 6px !important;
  cursor: pointer !important;
  font-size: 12px !important;
  transition: background 0.15s ease !important;
}
#right_bar input[type="submit"]:hover { background: var(--pinboard-success-hover) !important; }

/* ---- Tag cloud ---- */
#tag_cloud { max-width: 100% !important; overflow-wrap: break-word !important; }
#tag_cloud a, #tag_cloud a.tag { color: var(--pinboard-accent) !important; }
#tag_cloud a:hover, #tag_cloud a.tag:hover { color: var(--pinboard-link-hover) !important; }
#tag_cloud_header a, a.tag_heading_selected { color: var(--pinboard-muted-soft) !important; }
#tag_cloud_header a:hover { color: var(--pinboard-accent) !important; }

/* ---- Tweets page searchbox ---- */
#tweet_searchbox { margin-bottom: 12px !important; }
#tweet_searchbox form { display: flex !important; flex-direction: column !important; gap: var(--pinboard-space-form-gap) !important; margin: 0 !important; }
#tweet_searchbox br { display: none !important; }
#tweet_searchbox #search_query_field {
  width: 100% !important; box-sizing: border-box !important;
  background: var(--pinboard-input-bg) !important; color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-radius: var(--pinboard-radius-sm) !important;
  padding: 6px 10px !important; font-size: 12px !important;
}
#tweet_searchbox #search_query_field:focus { border-color: var(--pinboard-accent) !important; box-shadow: 0 0 0 2px var(--pinboard-accent-alpha) !important; outline: none !important; }
#tweet_searchbox input[type="submit"] {
  background: var(--pinboard-success) !important; color: var(--pinboard-btn-fg) !important;
  border: none !important; border-radius: var(--pinboard-radius-sm) !important;
  padding: 5px 14px !important; cursor: pointer !important;
  font-size: 12px !important; align-self: flex-start !important;
  transition: background 0.15s ease !important;
}
#tweet_searchbox input[type="submit"]:hover { background: var(--pinboard-success-hover) !important; }

/* ---- Forms (global) ---- */
input[type="text"], input:not([type]), input[type="password"], textarea, select {
  background: var(--pinboard-input-bg) !important; color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  box-sizing: border-box !important; max-width: 100% !important;
}
input[type="text"]:focus, input:not([type]):focus, textarea:focus, select:focus { border-color: var(--pinboard-accent) !important; outline: none !important; }
input[type="submit"], input[type="button"] {
  background: var(--pinboard-accent) !important; color: var(--pinboard-btn-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-accent) !important;
  border-radius: var(--pinboard-radius-sm) !important;
  padding: 4px 12px !important;
  cursor: pointer !important;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease !important;
}
input[type="submit"]:hover, input[type="button"]:hover { background: var(--pinboard-link-hover) !important; border-color: var(--pinboard-link-hover) !important; }
input[type="reset"], input[type="reset"].reset, button[type="reset"] {
  background: var(--pinboard-bg-surface) !important; color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-radius: var(--pinboard-radius-sm) !important;
  padding: 4px 12px !important;
  cursor: pointer !important;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease !important;
}
input[type="reset"]:hover, input[type="reset"].reset:hover, button[type="reset"]:hover { background: var(--pinboard-row-hover) !important; border-color: var(--pinboard-accent) !important; color: var(--pinboard-accent) !important; }
input[type="checkbox"], input[type="radio"] { accent-color: var(--pinboard-accent) !important; }
.suggested_tag { color: var(--pinboard-success) !important; cursor: pointer !important; }
#edit_bookmark_form { background: var(--pinboard-bg-surface) !important; border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important; }

/* ---- Tag completion popup (Pin.Tags widget on /add/, edit-bookmark, note-add) ---- */
.pin-ac { z-index: 1000 !important; }
.pin-ac .bd {
  background: var(--pinboard-bg-surface) !important;
  color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-radius: var(--pinboard-radius-sm) !important;
  box-shadow: 0 2px 8px var(--pinboard-accent-alpha) !important;
}
.pin-ac li {
  background: transparent !important;
  color: var(--pinboard-fg) !important;
  padding: 4px 10px !important;
  font-size: 12px !important;
}
.pin-ac li:hover { background: var(--pinboard-accent-alpha) !important; color: var(--pinboard-fg) !important; cursor: pointer !important; }
.pin-ac .active { background: var(--pinboard-selection-bg) !important; color: var(--pinboard-selection-fg) !important; }

/* ---- Settings page ---- */
#settings_panel { background: var(--pinboard-bg-surface) !important; }
.settings_tabs { border-color: var(--pinboard-border) !important; }
.settings_tab { color: var(--pinboard-muted) !important; padding: 6px 12px !important; border-bottom-color: var(--pinboard-border) !important; }
.settings_tab a { color: inherit !important; text-decoration: none !important; }
.settings_tab:hover { color: var(--pinboard-accent) !important; }
.settings_tab_selected {
  color: var(--pinboard-accent) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-top: 2px solid var(--pinboard-accent) !important;
  border-bottom-color: var(--pinboard-bg-surface) !important;
  background: var(--pinboard-bg-surface) !important;
  font-weight: bold !important;
  margin-bottom: -1px !important;
}
.settings_tab_selected a { color: var(--pinboard-accent) !important; }
[class*="settings_tab_spacer"] { border-bottom-color: var(--pinboard-border) !important; }
.settings_heading { color: var(--pinboard-muted) !important; background: transparent !important; border-bottom: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important; padding-bottom: 6px !important; }
a.help { color: var(--pinboard-muted-soft) !important; background: var(--pinboard-accent-soft) !important; }
.email_secret { color: var(--pinboard-accent) !important; }
#settings_tab_panes { border: none !important; }
#settings_tab_panes table td { color: var(--pinboard-fg) !important; }

/* ---- Profile page ---- */
.service_box, .help_box {
  background: var(--pinboard-bg-surface) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-radius: var(--pinboard-radius-md) !important;
  padding: 16px !important;
  box-sizing: border-box !important;
  margin-bottom: 12px !important;
}
.service_box .service_box { border: none !important; padding: 0 !important; margin: 0 !important; background: transparent !important; border-radius: 0 !important; width: auto !important; box-sizing: border-box !important; }
#profile_left_column { margin-right: 20px !important; }
#profile_right_column { width: 430px !important; }
#profile_main_column h2, #profile_left_column h2, #profile_right_column h2 { color: var(--pinboard-muted) !important; }
#profile_main_column table td, #profile_right_column table td { color: var(--pinboard-fg) !important; }

/* ---- Notes ---- */
.note { border-bottom: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important; }
.note a { color: var(--pinboard-accent) !important; }
.note .note { border: none !important; padding: 0 !important; margin: 0 !important; background: transparent !important; border-radius: 0 !important; }
#note_right_column { background: var(--pinboard-bg-surface) !important; color: var(--pinboard-fg) !important; padding: 16px !important; border-left: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important; }

/* ---- Bulk edit ---- */
#bulk_top_bar, #bulk_edit_box { background: var(--pinboard-bg-surface) !important; border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important; color: var(--pinboard-fg) !important; }

/* ---- Save bookmark popup ---- */
#popup_header { background: var(--pinboard-bg-surface) !important; color: var(--pinboard-fg) !important; }
.formtable td { color: var(--pinboard-fg) !important; }
.bookmark_count, .bookmark_count_box { color: var(--pinboard-muted) !important; }
.user_navbar a { color: var(--pinboard-accent) !important; }
.rss_link, .rss_linkbox a { color: var(--pinboard-muted-soft) !important; }

/* ---- Bundles (P4-table) — /u/<user>/bundles/ ---- */
#main_column form[name="sort"] > table { width: 100% !important; max-width: 880px !important; border-collapse: separate !important; border-spacing: 0 4px !important; margin-top: 8px !important; }
#main_column form[name="sort"] table tr { background: transparent !important; border-radius: var(--pinboard-radius-md) !important; }
#main_column form[name="sort"] table tr:hover { background: var(--pinboard-row-hover) !important; }
#main_column form[name="sort"] table td { padding: 6px 10px !important; vertical-align: middle !important; border: none !important; }
#main_column form[name="sort"] table td[style*="text-align:right"] { min-width: 160px !important; padding-right: 14px !important; white-space: nowrap !important; }
#main_column form[name="sort"] table input[name^="id_"] {
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  background: var(--pinboard-input-bg) !important;
  color: var(--pinboard-fg) !important;
  width: 32px !important;
  border-radius: var(--pinboard-radius-sm) !important;
  text-align: center !important;
}
#main_column form[name="sort"] table input[name^="id_"]:focus { border-color: var(--pinboard-accent) !important; box-shadow: 0 0 0 2px var(--pinboard-accent-alpha) !important; outline: none !important; }
#main_column form[name="sort"] table a.bundle { font-weight: var(--pinboard-weight-heading) !important; font-style: normal !important; letter-spacing: 0.01em !important; padding: 2px 4px !important; border-radius: var(--pinboard-radius-sm) !important; }
#main_column form[name="sort"] table a[style*="color:#aaa"],
#main_column form[name="sort"] table a[style*="color: #aaa"] { color: var(--pinboard-muted) !important; opacity: 1 !important; text-decoration: none !important; font-size: 12px !important; margin-left: 4px !important; }
#main_column form[name="sort"] table a[style*="color:#aaa"]:hover { color: var(--pinboard-accent) !important; text-decoration: underline !important; }
#main_column form[name="sort"] table td a.edit { color: var(--pinboard-muted) !important; opacity: 0.8 !important; transition: opacity 0.15s ease !important; }
#main_column form[name="sort"] table td a.destroy { color: var(--pinboard-destroy) !important; opacity: 0.85 !important; font-weight: var(--pinboard-weight-heading) !important; }
#main_column form[name="sort"] table tr:hover td a.edit { color: var(--pinboard-accent) !important; opacity: 1 !important; }
#main_column form[name="sort"] table tr:hover td a.destroy { opacity: 1 !important; }

/* ---- Pagination ---- */
.next_prev, .next_prev_widget a { color: var(--pinboard-accent) !important; }
.next_prev:hover, .next_prev_widget a:hover { color: var(--pinboard-link-hover) !important; }
#nextprev a.edit { color: var(--pinboard-muted-soft) !important; }

/* ---- Logged-out landing page (https://pinboard.in/) ---- */
#main_welcome, .homepage_quad { color: var(--pinboard-fg) !important; }
.homepage_heading { color: var(--pinboard-fg-strong) !important; font-weight: var(--pinboard-weight-heading) !important; }
.homepage_subheading { color: var(--pinboard-muted) !important; }
.signup_button,
.signup_button[style*="background"] {
  background: var(--pinboard-btn-bg) !important;
  color: var(--pinboard-btn-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-btn-bg) !important;
  border-radius: var(--pinboard-radius-sm) !important;
  padding: 10px 16px !important;
  text-align: center !important;
  font-weight: var(--pinboard-weight-heading) !important;
  cursor: pointer !important;
  transition: background 0.15s ease, border-color 0.15s ease !important;
}
.signup_button:hover { background: var(--pinboard-btn-bg-hover) !important; border-color: var(--pinboard-btn-bg-hover) !important; }
#blurb_div { color: var(--pinboard-fg) !important; }
.blurb_column { color: var(--pinboard-fg) !important; }
#blurb_div a { text-decoration: none !important; color: var(--pinboard-fg) !important; display: block !important; }
.blurb_box {
  background: var(--pinboard-bg-surface) !important;
  color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-radius: var(--pinboard-radius-md) !important;
  padding: 12px 14px !important;
  margin-bottom: 10px !important;
  transition: background 0.15s ease, border-color 0.15s ease !important;
}
#blurb_div a:hover .blurb_box { background: var(--pinboard-row-hover) !important; border-color: var(--pinboard-accent-alpha) !important; }
.magazine_title { color: var(--pinboard-accent) !important; font-weight: var(--pinboard-weight-heading) !important; }
.blurb { color: var(--pinboard-fg) !important; opacity: 0.85 !important; }
#language_box { color: var(--pinboard-muted) !important; }
#language_box p { margin: 2px 0 !important; }
#language_box a { color: var(--pinboard-muted) !important; padding: 1px 6px !important; border-radius: var(--pinboard-radius-sm) !important; text-decoration: none !important; }
#language_box a:hover { color: var(--pinboard-accent) !important; background: var(--pinboard-accent-alpha) !important; }
#language_box a[style*="background:#ffa"],
#language_box a[style*="background: #ffa"] { background: var(--pinboard-accent-alpha) !important; color: var(--pinboard-accent) !important; }
.nli { color: var(--pinboard-muted) !important; }
.nav_nli { color: var(--pinboard-accent) !important; text-decoration: none !important; }
.nav_nli:hover { color: var(--pinboard-link-hover) !important; }

/* ---- Footer / colophon ---- */
#footer, .colophon, .colophon a { color: var(--pinboard-muted-soft) !important; }

/* ---- Scrollbars (Webkit + Firefox standard) ---- */
html, body, textarea, .description, .pin-ac .bd {
  scrollbar-width: thin !important;
  scrollbar-color: var(--pinboard-muted) var(--pinboard-bg-surface) !important;
}
::-webkit-scrollbar { width: 10px !important; height: 10px !important; }
::-webkit-scrollbar-track { background: var(--pinboard-bg-surface) !important; border-left: 1px solid var(--pinboard-border) !important; }
::-webkit-scrollbar-thumb { background: var(--pinboard-muted-soft) !important; border: 2px solid var(--pinboard-bg-surface) !important; border-radius: 6px !important; }
::-webkit-scrollbar-thumb:hover { background: var(--pinboard-accent) !important; }
::-webkit-scrollbar-corner { background: var(--pinboard-bg-surface) !important; }

/* ---- Global anchor fallbacks ---- */
a, a:link { color: var(--pinboard-accent) !important; }
a:hover { color: var(--pinboard-link-hover) !important; }
a:visited { color: var(--pinboard-link-visited) !important; }
a:focus-visible { outline: 2px solid var(--pinboard-focus-ring) !important; outline-offset: 2px !important; }
h2 { color: var(--pinboard-muted) !important; }
hr { border-color: var(--pinboard-border) !important; }

/* ---- Bundle slot input override: already in inline_base_rules — redundant here ---- */

/* ---- ::selection (also in _base but themes may want explicit) ---- */
::selection { background: var(--pinboard-selection-bg) !important; color: var(--pinboard-selection-fg) !important; }
::-moz-selection { background: var(--pinboard-selection-bg) !important; color: var(--pinboard-selection-fg) !important; }

/* === patterns layer (tokens.patterns) === */
a.tag::before { content: "#" !important; }
a.bookmark_title::before { content: "> " !important; color: var(--pinboard-muted-soft) !important; }
.settings_heading::before { content: "$ " !important; opacity: 0.7 !important; }
#search_query_field:focus, #banner_searchbox input[type="text"]:focus, #right_bar input#key:focus, #tweet_searchbox #search_query_field:focus {
  box-shadow: 0 0 0 2px var(--pinboard-accent-alpha) !important;
  outline: none !important;
}
.bookmark { border-bottom: 1px dashed var(--pinboard-border) !important; }
.settings_heading { border-bottom-style: dashed !important; }


/* === theme overrides (tokens.overrides.css) === */
/* Terminal-specific decorative glyphs (CRT prompt markers) */
#main_column form[name="sort"] table a.bundle::before { content: "> " !important; opacity: 0.6 !important; }
/* ======== overrides-patch for terminal (auto-generated by tools/generate-overrides.mjs) ========
 * Restores shipped decls the composer's token-driven output doesn't match.
 */
#banner { padding: 8px 16px !important; background: #111 !important; border-bottom: 1px solid #33ff3340 !important; }
#search_query_field { width: 100% !important; background: #111 !important; font-family: inherit !important; }
.bookmark { border-bottom: 1px dashed #33ff3325 !important; padding: 10px 8px !important; }
.star { color: #333 !important; }
#banner a { text-decoration: none !important; }
#top_menu a { text-decoration: none !important; }
.banner_username { text-decoration: none !important; }
#banner a:hover { text-decoration: underline !important; }
#top_menu a:hover { text-decoration: underline !important; }
#sub_banner { background: #0d0d0d !important; border-color: #33ff3325 !important; }
#banner_searchbox input[type="text"] { background: #111 !important; font-family: inherit !important; }
#search_query_field:focus { box-shadow: 0 0 6px #33ff3333 !important; }
#banner_searchbox input[type="text"]:focus { box-shadow: 0 0 6px #33ff3333 !important; }
.search_button input[type="submit"] { background: #1a3a1a !important; border: 1px solid #33ff3360 !important; font-family: inherit !important; }
.search_button input[type="submit"]:hover { background: #2a5a2a !important; }
a.bookmark_title { font-weight: normal !important; }
a.bookmark_title::before { color: #33ff3380 !important; }
a.url_display { color: #22aa22 !important; font-size: 12px !important; }
a.url_link { background: #1a1a1a !important; padding: 1px 5px !important; }
.description { color: #22aa22 !important; font-size: 12px !important; font-style: italic !important; }
.description blockquote { border-left: 2px solid #33ff3340 !important; }
a.tag:hover { color: #00ffff !important; text-decoration: underline !important; }
#right_bar { background: #0a0a0a !important; border-left: 1px dashed #33ff3325 !important; }
#right_bar h3 { color: #33ff33 !important; }
#right_bar h4 { color: #33ff33 !important; }
#right_bar b { color: #33ff33 !important; }
#right_bar a { color: #22aa22 !important; }
#right_bar a:hover { color: #33ff33 !important; }
a.bundle { color: #22aa22 !important; }
a.bundle:hover { color: #33ff33 !important; }
#tag_cloud a { color: #22aa22 !important; }
#tag_cloud a:hover { color: #33ff33 !important; }
#tag_cloud a.tag { color: #22aa22 !important; }
#tag_cloud a.tag:hover { color: #33ff33 !important; }
a.tag.selected { color: #33ff33 !important; }
a.sort_order_selected { background: #1a1a1a !important; }
input[type="text"] { background: #111 !important; font-family: inherit !important; }
input:not([type]) { background: #111 !important; font-family: inherit !important; }
input[type="password"] { background: #111 !important; font-family: inherit !important; }
textarea { background: #111 !important; font-family: inherit !important; }
select { background: #111 !important; font-family: inherit !important; }
input[type="text"]:focus { box-shadow: 0 0 6px #33ff3333 !important; }
input:not([type]):focus { box-shadow: 0 0 6px #33ff3333 !important; }
textarea:focus { box-shadow: 0 0 6px #33ff3333 !important; }
select:focus { box-shadow: 0 0 6px #33ff3333 !important; }
input[type="submit"] { background: #1a3a1a !important; border: 1px solid #33ff3360 !important; font-family: inherit !important; }
input[type="button"] { background: #1a3a1a !important; border: 1px solid #33ff3360 !important; font-family: inherit !important; }
input[type="submit"]:hover { background: #2a5a2a !important; }
input[type="button"]:hover { background: #2a5a2a !important; }
#edit_bookmark_form { background: #111 !important; border: 1px dashed #33ff3340 !important; }
.suggested_tag { color: #00cccc !important; }
#settings_panel { background: #0a0a0a !important; color: #33ff33 !important; }
.settings_tab_selected { border: 1px dashed #33ff3340 !important; border-bottom-color: #0a0a0a !important; background: #0a0a0a !important; }
.settings_heading { color: #33ff33 !important; border-bottom: 1px dashed #33ff3340 !important; }
a.help { background: #f0ede8 !important; }
.email_secret { color: #00cccc !important; }
.note { border-bottom: 1px dashed #33ff3325 !important; }
#note_right_column { background: #0a0a0a !important; color: #22aa22 !important; border-left: 1px dashed #33ff3325 !important; }
.service_box { background: #111 !important; border: 1px dashed #33ff3340 !important; color: #33ff33 !important; }
.help_box { background: #111 !important; border: 1px dashed #33ff3340 !important; color: #33ff33 !important; }
#profile_main_column h2 { color: #33ff33 !important; }
#profile_left_column h2 { color: #33ff33 !important; }
#profile_right_column h2 { color: #33ff33 !important; }
#bulk_top_bar { background: #111 !important; border: 1px dashed #33ff3340 !important; }
#bulk_edit_box { background: #111 !important; border: 1px dashed #33ff3340 !important; }
#popup_header { background: #0a0a0a !important; }
.user_navbar a { color: #22aa22 !important; }
hr { border-color: #33ff3325 !important; }
h2 { color: #33ff33 !important; }
::selection { color: #fff !important; }
#main_column form[name="sort"] table tr:hover { background: rgba(51,255,51,0.1) !important; }
#main_column form[name="sort"] table td { font-family: "Fira Code", "Cascadia Code", "Consolas", monospace !important; }
#main_column form[name="sort"] table input[name^="id_"] { width: 38px !important; min-width: 38px !important; max-width: 38px !important; padding: 3px 4px !important; margin-right: 10px !important; font-size: 12px !important; line-height: 1.2 !important; border-radius: 0 !important; box-sizing: border-box !important; vertical-align: middle !important; border: 1px solid #33ff3380 !important; background: #0a0a0a !important; font-family: "Fira Code", "Consolas", monospace !important; font-weight: 600 !important; }
#main_column form[name="sort"] table input[name^="id_"]:focus { box-shadow: 0 0 0 2px rgba(51,255,51,0.3), 0 0 8px rgba(51,255,51,0.4) !important; }
#main_column form[name="sort"] table a.bundle { letter-spacing: 0.02em !important; text-transform: uppercase !important; }
#main_column form[name="sort"] table td a.edit { opacity: 0.75 !important; transition: opacity 0.15s ease, text-shadow 0.15s ease !important; }
#main_column form[name="sort"] table td a.destroy { color: #ff5555 !important; opacity: 0.9 !important; }
#main_column form[name="sort"] table tr:hover td a.edit { text-shadow: 0 0 4px rgba(51,255,51,0.6) !important; }
#main_column form[name="sort"] table tr:hover td a.destroy { text-shadow: 0 0 4px rgba(255,85,85,0.6) !important; }
#right_bar table td a.delete { color: #22aa22 !important; }
#right_bar table tr:hover td a.delete { color: #ff5555 !important; }
#right_bar input#key { background: #0a0a0a !important; border: 1px solid #33ff3350 !important; }
#right_bar input#key:focus { box-shadow: 0 0 0 2px rgba(51,255,51,0.2) !important; }
#tweet_searchbox #search_query_field { background: #0a0a0a !important; border: 1px solid #33ff3350 !important; font-size: 13px !important; }
#tweet_searchbox #search_query_field:focus { box-shadow: 0 0 0 2px rgba(51,255,51,0.2) !important; }`
  },

  // ---- 4. Paper & Ink (Light) ----
  "paper-ink": {
    name: "Paper & Ink",
    desc: "Warm serif reading experience",
    css: `:root {
  --pinboard-bg: #faf8f5;
  --pinboard-bg-surface: #f5f0e8;
  --pinboard-fg: #2c2c2c;
  --pinboard-fg-strong: #6b4c3b;
  --pinboard-muted: #6b4c3b;
  --pinboard-muted-soft: #999999;
  --pinboard-border: #d4c5a9;
  --pinboard-border-strong: #d4c5a9;
  --pinboard-border-soft: #e8dfd0;
  --pinboard-accent: #1a3a5c;
  --pinboard-accent-hover: #2a5a8c;
  --pinboard-accent-soft: #f5f0e8;
  --pinboard-accent-alpha: rgba(26,58,92,0.25);
  --pinboard-input-bg: #fefdfb;
  --pinboard-private-bg: #fdf6e3;
  --pinboard-private-accent: #d4c5a9;
  --pinboard-selection-bg: #1a3a5c;
  --pinboard-selection-fg: #faf8f5;
  --pinboard-tag-bg: transparent;
  --pinboard-tag-fg: #8b4513;
  --pinboard-row-hover: #ede4d0;
  --pinboard-destroy: #c0392b;
  --pinboard-btn-bg: #6b4c3b;
  --pinboard-btn-bg-hover: #8b6c5b;
  --pinboard-btn-fg: #faf8f5;
  --pinboard-success: #8b4513;
  --pinboard-success-hover: #a0522d;
  --pinboard-url-link-bg: #f5f0e8;
  --pinboard-url-link-fg: #a0522d;
  --pinboard-link-hover: #2a5a8c;
  --pinboard-link-visited: #1a3a5c;
  --pinboard-focus-ring: #8b6c5b;
  --pinboard-unread: #c0392b;
  --pinboard-font-family: "Georgia", "Noto Serif", "Source Serif Pro", serif;
  --pinboard-font-size-base: 14px;
  --pinboard-font-size-sm: 12px;
  --pinboard-font-size-lg: 16px;
  --pinboard-font-size-xs: 11px;
  --pinboard-line-height: 1.7;
  --pinboard-weight-body: 400;
  --pinboard-weight-heading: 700;
  --pinboard-space-unit: 4px;
  --pinboard-space-bookmark-gap: 6px;
  --pinboard-space-main-padding: 14px;
  --pinboard-space-sub-banner-y: 8px;
  --pinboard-space-right-bar-gap: 16px;
  --pinboard-space-form-gap: 8px;
  --pinboard-radius-sm: 2px;
  --pinboard-radius-md: 4px;
  --pinboard-radius-lg: 3px;
  --pinboard-border-width: 1px;
  --pinboard-border-style: solid;
  --pinboard-border-hairline: 1px dotted #d4c5a9;
}

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

/* override.generic-bgcolor — defensive against legacy HTML attr */
[bgcolor] { background-color: transparent !important; }

/* override.generic-html-color — defensive against legacy <font> */
font[color], font[size] { color: inherit !important; font-size: inherit !important; }

/* override.generic-fixed-width — defensive against layout tables */
table[width]:not([width="100%"]) { width: auto !important; max-width: 100% !important; }

/* === selection (applied globally; composers may override scoped) === */
::selection          { background: var(--pinboard-selection-bg); color: var(--pinboard-selection-fg); }
::-moz-selection     { background: var(--pinboard-selection-bg); color: var(--pinboard-selection-fg); }

/* === composer: classic-list-v2 — canonical surface inventory === */

/* ---- App shell typography (body#pinboard) ---- */
body#pinboard {
  background: var(--pinboard-bg) !important;
  color: var(--pinboard-fg) !important;
  font-family: var(--pinboard-font-family) !important;
  font-size: 14px !important;
  line-height: var(--pinboard-line-height) !important;
}
body#pinboard table, body#pinboard td, body#pinboard th,
body#pinboard p, body#pinboard b, body#pinboard strong,
body#pinboard label, body#pinboard span, body#pinboard li:not(.pin-ac li),
body#pinboard dd, body#pinboard dt { color: inherit !important; }

/* ---- Popup / iframe frame (body:not(#pinboard)) ---- */
body:not(#pinboard) {
  background: var(--pinboard-bg) !important;
  color: var(--pinboard-fg) !important;
  font-family: var(--pinboard-font-family) !important;
}
body:not(#pinboard) table, body:not(#pinboard) td,
body:not(#pinboard) p, body:not(#pinboard) label,
body:not(#pinboard) span { color: inherit !important; }
body:not(#pinboard) #popup_header { background: transparent !important; color: var(--pinboard-fg) !important; }

/* ---- Banner & navigation ---- */
#banner { background: var(--pinboard-bg-surface) !important; border-color: var(--pinboard-border) !important; max-width: 1030px !important; box-sizing: border-box !important; }
#banner a, #top_menu a, .banner_username { color: var(--pinboard-accent) !important; }
#banner a:hover, #top_menu a:hover { color: var(--pinboard-link-hover) !important; }
#pinboard_name a { color: var(--pinboard-accent) !important; font-weight: var(--pinboard-weight-heading) !important; }
#sub_banner { background: var(--pinboard-bg-surface) !important; border-color: var(--pinboard-border) !important; }
#sub_banner a { color: var(--pinboard-muted) !important; }
#sub_banner a:hover, #sub_banner a.selected { color: var(--pinboard-accent) !important; }

/* ---- Search (banner + main) ---- */
#searchbox { margin-bottom: 12px !important; }
a.bundle { color: var(--pinboard-accent) !important; }
a.bundle:hover { color: var(--pinboard-link-hover) !important; }
#search_query_field, #banner_searchbox input[type="text"] {
  background: var(--pinboard-input-bg) !important;
  color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  box-sizing: border-box !important;
}
#search_query_field:focus, #banner_searchbox input[type="text"]:focus { border-color: var(--pinboard-accent) !important; outline: none !important; }
.search_button input[type="submit"] {
  background: var(--pinboard-accent) !important;
  color: var(--pinboard-btn-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-accent) !important;
  cursor: pointer !important;
}
.search_button input[type="submit"]:hover { background: var(--pinboard-link-hover) !important; }

/* ---- Bookmark list ---- */
.bookmark {
  background: transparent !important;
  display: flex !important;
  align-items: flex-start !important;
}
.bookmark { transition: box-shadow 0.2s ease !important; }
.bookmark .display { float: none !important; flex: 1 !important; width: auto !important; min-width: 0 !important; }
.star, .selected_star { margin-left: 0 !important; margin-right: 6px !important; float: none !important; flex-shrink: 0 !important; }
.star { color: var(--pinboard-border) !important; }
.selected_star { color: var(--pinboard-private-accent) !important; }

a.bookmark_title { color: var(--pinboard-accent) !important; font-size: 16px !important; text-decoration: none !important; font-weight: var(--pinboard-weight-heading) !important; }
a.bookmark_title:hover { color: var(--pinboard-link-hover) !important; text-decoration: underline !important; }
a.url_display, a.when, a.cached { color: var(--pinboard-muted-soft) !important; font-size: 11px !important; }
a.url_link {
  color: var(--pinboard-url-link-fg) !important;
  background: var(--pinboard-url-link-bg) !important;
  padding: 1px 6px !important;
  border-radius: var(--pinboard-radius-lg) !important;
  font-size: 11px !important;
}
.description { color: var(--pinboard-fg) !important; opacity: 0.85 !important; line-height: var(--pinboard-line-height) !important; }
.description blockquote { color: var(--pinboard-muted) !important; border-left: 3px solid var(--pinboard-accent-alpha) !important; padding-left: 10px !important; margin: 4px 0 !important; }

a.tag {
  color: var(--pinboard-tag-fg) !important;
  background: var(--pinboard-tag-bg) !important;
  padding: 1px 8px !important;
  border-radius: var(--pinboard-radius-lg) !important;
  font-size: 11px !important;
  text-decoration: none !important;
}
a.tag:hover { color: var(--pinboard-tag-fg) !important; background: var(--pinboard-accent-alpha) !important; text-decoration: none !important; }
a.tag.selected { color: var(--pinboard-destroy) !important; font-weight: bold !important; }
a.sort_order_selected { background: var(--pinboard-tag-bg) !important; color: var(--pinboard-accent) !important; }

a.unread { color: var(--pinboard-destroy) !important; font-weight: bold !important; }
.edit_links a, a.copy_link { color: var(--pinboard-muted-soft) !important; }
.edit_links a:hover { color: var(--pinboard-fg) !important; }
a.copy_link { color: var(--pinboard-accent) !important; }
a.delete, a.destroy { color: var(--pinboard-destroy) !important; }

/* ---- Private bookmarks ---- */
.bookmark.private,
.bookmark.private[style*="background"] { background: var(--pinboard-private-bg) !important; box-shadow: inset 3px 0 0 var(--pinboard-private-accent) !important; border-top-color: transparent !important; border-right-color: transparent !important; border-left-color: transparent !important; }

/* ---- Right bar ---- */
#right_bar {
  background: var(--pinboard-bg-surface) !important;
  color: var(--pinboard-fg) !important;
  padding: var(--pinboard-space-right-bar-gap) !important;
  box-sizing: border-box !important;
  overflow: hidden !important;
  word-wrap: break-word !important;
}
#right_bar h3, #right_bar h4, #right_bar b { color: var(--pinboard-muted) !important; }
#right_bar a { color: var(--pinboard-accent) !important; }
#right_bar a:hover { color: var(--pinboard-link-hover) !important; }
#right_bar table tr[onmouseover] { background: transparent !important; }
#right_bar table tr[onmouseover]:hover { background: var(--pinboard-row-hover) !important; }
#right_bar table td a.tag { color: var(--pinboard-fg) !important; }
#right_bar table td a.delete { color: var(--pinboard-muted-soft) !important; font-size: 11px !important; opacity: 0.55 !important; transition: opacity 0.15s ease, color 0.15s ease !important; }
#right_bar table tr:hover td a.delete { color: var(--pinboard-destroy) !important; opacity: 1 !important; }
#right_bar input#key {
  background: var(--pinboard-input-bg) !important;
  color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-radius: var(--pinboard-radius-sm) !important;
  padding: 4px 8px !important;
  box-sizing: border-box !important;
  font-size: 12px !important;
}
#right_bar input#key:focus { border-color: var(--pinboard-accent) !important; box-shadow: 0 0 0 2px var(--pinboard-accent-alpha) !important; outline: none !important; }
#right_bar input[type="submit"] {
  background: var(--pinboard-success) !important;
  color: var(--pinboard-btn-fg) !important;
  border: none !important;
  border-radius: var(--pinboard-radius-sm) !important;
  padding: 4px 10px !important;
  margin-left: 6px !important;
  cursor: pointer !important;
  font-size: 12px !important;
  transition: background 0.15s ease !important;
}
#right_bar input[type="submit"]:hover { background: var(--pinboard-success-hover) !important; }

/* ---- Tag cloud ---- */
#tag_cloud { max-width: 100% !important; overflow-wrap: break-word !important; }
#tag_cloud a, #tag_cloud a.tag { color: var(--pinboard-accent) !important; }
#tag_cloud a:hover, #tag_cloud a.tag:hover { color: var(--pinboard-link-hover) !important; }
#tag_cloud_header a, a.tag_heading_selected { color: var(--pinboard-muted-soft) !important; }
#tag_cloud_header a:hover { color: var(--pinboard-accent) !important; }

/* ---- Tweets page searchbox ---- */
#tweet_searchbox { margin-bottom: 12px !important; }
#tweet_searchbox form { display: flex !important; flex-direction: column !important; gap: var(--pinboard-space-form-gap) !important; margin: 0 !important; }
#tweet_searchbox br { display: none !important; }
#tweet_searchbox #search_query_field {
  width: 100% !important; box-sizing: border-box !important;
  background: var(--pinboard-input-bg) !important; color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-radius: var(--pinboard-radius-sm) !important;
  padding: 6px 10px !important; font-size: 12px !important;
}
#tweet_searchbox #search_query_field:focus { border-color: var(--pinboard-accent) !important; box-shadow: 0 0 0 2px var(--pinboard-accent-alpha) !important; outline: none !important; }
#tweet_searchbox input[type="submit"] {
  background: var(--pinboard-success) !important; color: var(--pinboard-btn-fg) !important;
  border: none !important; border-radius: var(--pinboard-radius-sm) !important;
  padding: 5px 14px !important; cursor: pointer !important;
  font-size: 12px !important; align-self: flex-start !important;
  transition: background 0.15s ease !important;
}
#tweet_searchbox input[type="submit"]:hover { background: var(--pinboard-success-hover) !important; }

/* ---- Forms (global) ---- */
input[type="text"], input:not([type]), input[type="password"], textarea, select {
  background: var(--pinboard-input-bg) !important; color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  box-sizing: border-box !important; max-width: 100% !important;
}
input[type="text"]:focus, input:not([type]):focus, textarea:focus, select:focus { border-color: var(--pinboard-accent) !important; outline: none !important; }
input[type="submit"], input[type="button"] {
  background: var(--pinboard-accent) !important; color: var(--pinboard-btn-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-accent) !important;
  border-radius: var(--pinboard-radius-sm) !important;
  padding: 4px 12px !important;
  cursor: pointer !important;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease !important;
}
input[type="submit"]:hover, input[type="button"]:hover { background: var(--pinboard-link-hover) !important; border-color: var(--pinboard-link-hover) !important; }
input[type="reset"], input[type="reset"].reset, button[type="reset"] {
  background: var(--pinboard-bg-surface) !important; color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-radius: var(--pinboard-radius-sm) !important;
  padding: 4px 12px !important;
  cursor: pointer !important;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease !important;
}
input[type="reset"]:hover, input[type="reset"].reset:hover, button[type="reset"]:hover { background: var(--pinboard-row-hover) !important; border-color: var(--pinboard-accent) !important; color: var(--pinboard-accent) !important; }
input[type="checkbox"], input[type="radio"] { accent-color: var(--pinboard-accent) !important; }
.suggested_tag { color: var(--pinboard-success) !important; cursor: pointer !important; }
#edit_bookmark_form { background: var(--pinboard-bg-surface) !important; border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important; }

/* ---- Tag completion popup (Pin.Tags widget on /add/, edit-bookmark, note-add) ---- */
.pin-ac { z-index: 1000 !important; }
.pin-ac .bd {
  background: var(--pinboard-bg-surface) !important;
  color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-radius: var(--pinboard-radius-sm) !important;
  box-shadow: 0 2px 8px var(--pinboard-accent-alpha) !important;
}
.pin-ac li {
  background: transparent !important;
  color: var(--pinboard-fg) !important;
  padding: 4px 10px !important;
  font-size: 12px !important;
}
.pin-ac li:hover { background: var(--pinboard-accent-alpha) !important; color: var(--pinboard-fg) !important; cursor: pointer !important; }
.pin-ac .active { background: var(--pinboard-selection-bg) !important; color: var(--pinboard-selection-fg) !important; }

/* ---- Settings page ---- */
#settings_panel { background: var(--pinboard-bg-surface) !important; }
.settings_tabs { border-color: var(--pinboard-border) !important; }
.settings_tab { color: var(--pinboard-muted) !important; padding: 6px 12px !important; border-bottom-color: var(--pinboard-border) !important; }
.settings_tab a { color: inherit !important; text-decoration: none !important; }
.settings_tab:hover { color: var(--pinboard-accent) !important; }
.settings_tab_selected {
  color: var(--pinboard-accent) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-top: 2px solid var(--pinboard-accent) !important;
  border-bottom-color: var(--pinboard-bg-surface) !important;
  background: var(--pinboard-bg-surface) !important;
  font-weight: bold !important;
  margin-bottom: -1px !important;
}
.settings_tab_selected a { color: var(--pinboard-accent) !important; }
[class*="settings_tab_spacer"] { border-bottom-color: var(--pinboard-border) !important; }
.settings_heading { color: var(--pinboard-muted) !important; background: transparent !important; border-bottom: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important; padding-bottom: 6px !important; }
a.help { color: var(--pinboard-muted-soft) !important; background: var(--pinboard-accent-soft) !important; }
.email_secret { color: var(--pinboard-accent) !important; }
#settings_tab_panes { border: none !important; }
#settings_tab_panes table td { color: var(--pinboard-fg) !important; }

/* ---- Profile page ---- */
.service_box, .help_box {
  background: var(--pinboard-bg-surface) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-radius: var(--pinboard-radius-md) !important;
  padding: 16px !important;
  box-sizing: border-box !important;
  margin-bottom: 12px !important;
}
.service_box .service_box { border: none !important; padding: 0 !important; margin: 0 !important; background: transparent !important; border-radius: 0 !important; width: auto !important; box-sizing: border-box !important; }
#profile_left_column { margin-right: 20px !important; }
#profile_right_column { width: 430px !important; }
#profile_main_column h2, #profile_left_column h2, #profile_right_column h2 { color: var(--pinboard-muted) !important; }
#profile_main_column table td, #profile_right_column table td { color: var(--pinboard-fg) !important; }

/* ---- Notes ---- */
.note { border-bottom: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important; }
.note a { color: var(--pinboard-accent) !important; }
.note .note { border: none !important; padding: 0 !important; margin: 0 !important; background: transparent !important; border-radius: 0 !important; }
#note_right_column { background: var(--pinboard-bg-surface) !important; color: var(--pinboard-fg) !important; padding: 16px !important; border-left: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important; }

/* ---- Bulk edit ---- */
#bulk_top_bar, #bulk_edit_box { background: var(--pinboard-bg-surface) !important; border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important; color: var(--pinboard-fg) !important; }

/* ---- Save bookmark popup ---- */
#popup_header { background: var(--pinboard-bg-surface) !important; color: var(--pinboard-fg) !important; }
.formtable td { color: var(--pinboard-fg) !important; }
.bookmark_count, .bookmark_count_box { color: var(--pinboard-muted) !important; }
.user_navbar a { color: var(--pinboard-accent) !important; }
.rss_link, .rss_linkbox a { color: var(--pinboard-muted-soft) !important; }

/* ---- Bundles (P4-table) — /u/<user>/bundles/ ---- */
#main_column form[name="sort"] > table { width: 100% !important; max-width: 880px !important; border-collapse: separate !important; border-spacing: 0 4px !important; margin-top: 8px !important; }
#main_column form[name="sort"] table tr { background: transparent !important; border-radius: var(--pinboard-radius-md) !important; }
#main_column form[name="sort"] table tr:hover { background: var(--pinboard-row-hover) !important; }
#main_column form[name="sort"] table td { padding: 6px 10px !important; vertical-align: middle !important; border: none !important; }
#main_column form[name="sort"] table td[style*="text-align:right"] { min-width: 160px !important; padding-right: 14px !important; white-space: nowrap !important; }
#main_column form[name="sort"] table input[name^="id_"] {
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  background: var(--pinboard-input-bg) !important;
  color: var(--pinboard-fg) !important;
  width: 32px !important;
  border-radius: var(--pinboard-radius-sm) !important;
  text-align: center !important;
}
#main_column form[name="sort"] table input[name^="id_"]:focus { border-color: var(--pinboard-accent) !important; box-shadow: 0 0 0 2px var(--pinboard-accent-alpha) !important; outline: none !important; }
#main_column form[name="sort"] table a.bundle { font-weight: var(--pinboard-weight-heading) !important; font-style: normal !important; letter-spacing: 0.01em !important; padding: 2px 4px !important; border-radius: var(--pinboard-radius-sm) !important; }
#main_column form[name="sort"] table a[style*="color:#aaa"],
#main_column form[name="sort"] table a[style*="color: #aaa"] { color: var(--pinboard-muted) !important; opacity: 1 !important; text-decoration: none !important; font-size: 12px !important; margin-left: 4px !important; }
#main_column form[name="sort"] table a[style*="color:#aaa"]:hover { color: var(--pinboard-accent) !important; text-decoration: underline !important; }
#main_column form[name="sort"] table td a.edit { color: var(--pinboard-muted) !important; opacity: 0.8 !important; transition: opacity 0.15s ease !important; }
#main_column form[name="sort"] table td a.destroy { color: var(--pinboard-destroy) !important; opacity: 0.85 !important; font-weight: var(--pinboard-weight-heading) !important; }
#main_column form[name="sort"] table tr:hover td a.edit { color: var(--pinboard-accent) !important; opacity: 1 !important; }
#main_column form[name="sort"] table tr:hover td a.destroy { opacity: 1 !important; }

/* ---- Pagination ---- */
.next_prev, .next_prev_widget a { color: var(--pinboard-accent) !important; }
.next_prev:hover, .next_prev_widget a:hover { color: var(--pinboard-link-hover) !important; }
#nextprev a.edit { color: var(--pinboard-muted-soft) !important; }

/* ---- Logged-out landing page (https://pinboard.in/) ---- */
#main_welcome, .homepage_quad { color: var(--pinboard-fg) !important; }
.homepage_heading { color: var(--pinboard-fg-strong) !important; font-weight: var(--pinboard-weight-heading) !important; }
.homepage_subheading { color: var(--pinboard-muted) !important; }
.signup_button,
.signup_button[style*="background"] {
  background: var(--pinboard-btn-bg) !important;
  color: var(--pinboard-btn-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-btn-bg) !important;
  border-radius: var(--pinboard-radius-sm) !important;
  padding: 10px 16px !important;
  text-align: center !important;
  font-weight: var(--pinboard-weight-heading) !important;
  cursor: pointer !important;
  transition: background 0.15s ease, border-color 0.15s ease !important;
}
.signup_button:hover { background: var(--pinboard-btn-bg-hover) !important; border-color: var(--pinboard-btn-bg-hover) !important; }
#blurb_div { color: var(--pinboard-fg) !important; }
.blurb_column { color: var(--pinboard-fg) !important; }
#blurb_div a { text-decoration: none !important; color: var(--pinboard-fg) !important; display: block !important; }
.blurb_box {
  background: var(--pinboard-bg-surface) !important;
  color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-radius: var(--pinboard-radius-md) !important;
  padding: 12px 14px !important;
  margin-bottom: 10px !important;
  transition: background 0.15s ease, border-color 0.15s ease !important;
}
#blurb_div a:hover .blurb_box { background: var(--pinboard-row-hover) !important; border-color: var(--pinboard-accent-alpha) !important; }
.magazine_title { color: var(--pinboard-accent) !important; font-weight: var(--pinboard-weight-heading) !important; }
.blurb { color: var(--pinboard-fg) !important; opacity: 0.85 !important; }
#language_box { color: var(--pinboard-muted) !important; }
#language_box p { margin: 2px 0 !important; }
#language_box a { color: var(--pinboard-muted) !important; padding: 1px 6px !important; border-radius: var(--pinboard-radius-sm) !important; text-decoration: none !important; }
#language_box a:hover { color: var(--pinboard-accent) !important; background: var(--pinboard-accent-alpha) !important; }
#language_box a[style*="background:#ffa"],
#language_box a[style*="background: #ffa"] { background: var(--pinboard-accent-alpha) !important; color: var(--pinboard-accent) !important; }
.nli { color: var(--pinboard-muted) !important; }
.nav_nli { color: var(--pinboard-accent) !important; text-decoration: none !important; }
.nav_nli:hover { color: var(--pinboard-link-hover) !important; }

/* ---- Footer / colophon ---- */
#footer, .colophon, .colophon a { color: var(--pinboard-muted-soft) !important; }

/* ---- Scrollbars (Webkit + Firefox standard) ---- */
html, body, textarea, .description, .pin-ac .bd {
  scrollbar-width: thin !important;
  scrollbar-color: var(--pinboard-muted) var(--pinboard-bg-surface) !important;
}
::-webkit-scrollbar { width: 10px !important; height: 10px !important; }
::-webkit-scrollbar-track { background: var(--pinboard-bg-surface) !important; border-left: 1px solid var(--pinboard-border) !important; }
::-webkit-scrollbar-thumb { background: var(--pinboard-muted-soft) !important; border: 2px solid var(--pinboard-bg-surface) !important; border-radius: 6px !important; }
::-webkit-scrollbar-thumb:hover { background: var(--pinboard-accent) !important; }
::-webkit-scrollbar-corner { background: var(--pinboard-bg-surface) !important; }

/* ---- Global anchor fallbacks ---- */
a, a:link { color: var(--pinboard-accent) !important; }
a:hover { color: var(--pinboard-link-hover) !important; }
a:visited { color: var(--pinboard-link-visited) !important; }
a:focus-visible { outline: 2px solid var(--pinboard-focus-ring) !important; outline-offset: 2px !important; }
h2 { color: var(--pinboard-muted) !important; }
hr { border-color: var(--pinboard-border) !important; }

/* ---- Bundle slot input override: already in inline_base_rules — redundant here ---- */

/* ---- ::selection (also in _base but themes may want explicit) ---- */
::selection { background: var(--pinboard-selection-bg) !important; color: var(--pinboard-selection-fg) !important; }
::-moz-selection { background: var(--pinboard-selection-bg) !important; color: var(--pinboard-selection-fg) !important; }

/* === patterns layer (tokens.patterns) === */
#search_query_field:focus, #banner_searchbox input[type="text"]:focus, #right_bar input#key:focus, #tweet_searchbox #search_query_field:focus {
  box-shadow: 0 0 0 2px var(--pinboard-accent-alpha) !important;
  outline: none !important;
}
.bookmark { border-bottom: 1px solid var(--pinboard-border) !important; }
input[type="submit"], input[type="button"], .search_button input[type="submit"] { border: none !important; }


/* === theme overrides (tokens.overrides.css) === */
/* ======== overrides-patch for paper-ink (auto-generated by tools/generate-overrides.mjs) ========
 * Restores shipped decls the composer's token-driven output doesn't match.
 */
body:not(#pinboard) { font-family: "Georgia", "Noto Serif", serif !important; }
#banner { padding: 8px 16px !important; border-bottom: 2px solid #d4c5a9 !important; font-family: "Georgia", serif !important; }
#banner a { color: #6b4c3b !important; }
#top_menu a { color: #6b4c3b !important; }
.banner_username { color: #6b4c3b !important; }
#banner a:hover { color: #8b6c5b !important; }
#top_menu a:hover { color: #8b6c5b !important; }
#pinboard_name a { font-weight: normal !important; letter-spacing: 0.02em !important; }
#sub_banner { background: #f0ebe0 !important; border-color: #e0d6c4 !important; }
a.bundle { color: #6b4c3b !important; }
a.bundle:hover { color: #8b4513 !important; }
#search_query_field { width: 100% !important; font-family: "Georgia", serif !important; }
#banner_searchbox input[type="text"] { font-family: "Georgia", serif !important; }
#search_query_field:focus { border-color: #8b6c5b !important; }
#banner_searchbox input[type="text"]:focus { border-color: #8b6c5b !important; }
.search_button input[type="submit"] { background: #6b4c3b !important; }
.search_button input[type="submit"]:hover { background: #8b6c5b !important; }
.bookmark { border-bottom: 1px solid #e8dfd0 !important; padding: 14px 8px !important; }
.star { color: #ddd !important; }
.selected_star { color: #d4a017 !important; }
a.bookmark_title { font-weight: normal !important; letter-spacing: -0.01em !important; }
a.url_display { color: #8b6c5b !important; font-size: 12px !important; font-family: -apple-system, sans-serif !important; }
a.when { color: #999 !important; font-family: -apple-system, sans-serif !important; }
a.cached { color: #aaa !important; }
a.url_link { padding: 1px 5px !important; }
.description { color: #555 !important; font-size: 13px !important; line-height: 1.6 !important; margin-top: 4px !important; }
a.tag { font-family: -apple-system, sans-serif !important; }
a.tag:hover { color: #a0522d !important; text-decoration: underline !important; }
a.tag.selected { color: #8b4513 !important; }
a.sort_order_selected { background: #e0d5c1 !important; color: #6b4c3b !important; }
.edit_links a { color: #aaa !important; font-family: -apple-system, sans-serif !important; font-size: 11px !important; }
.edit_links a:hover { color: #666 !important; }
#right_bar { border-left: 1px solid #e8dfd0 !important; }
#right_bar h3 { font-family: "Georgia", serif !important; }
#right_bar h4 { font-family: "Georgia", serif !important; }
#right_bar b { font-family: "Georgia", serif !important; }
#right_bar a { color: #6b4c3b !important; }
#right_bar a:hover { color: #8b4513 !important; }
#right_bar table td a.tag { color: #3b2e20 !important; }
#right_bar table td a.delete { color: #8b6c5b !important; }
#right_bar table tr:hover td a.delete { color: #a0522d !important; }
#right_bar input#key { background: #f5f0e8 !important; color: #3b2e20 !important; border: 1px solid #c9b896 !important; border-radius: 4px !important; }
#right_bar input#key:focus { border-color: #8b4513 !important; box-shadow: 0 0 0 2px rgba(139,69,19,0.18) !important; }
#right_bar input[type="submit"] { background: #6b4c3b !important; color: #f5f0e8 !important; border-radius: 4px !important; }
#right_bar input[type="submit"]:hover { background: #8b4513 !important; }
#tag_cloud a { color: #6b4c3b !important; }
#tag_cloud a.tag { color: #6b4c3b !important; }
#tag_cloud a:hover { color: #8b4513 !important; }
#tag_cloud a.tag:hover { color: #8b4513 !important; }
#tag_cloud_header a { color: #999 !important; }
a.tag_heading_selected { color: #999 !important; }
#tag_cloud_header a:hover { color: #6b4c3b !important; }
#tweet_searchbox #search_query_field { background: #f5f0e8 !important; color: #3b2e20 !important; border: 1px solid #c9b896 !important; border-radius: 4px !important; font-size: 13px !important; }
#tweet_searchbox #search_query_field:focus { border-color: #8b4513 !important; box-shadow: 0 0 0 2px rgba(139,69,19,0.18) !important; }
#tweet_searchbox input[type="submit"] { background: #6b4c3b !important; color: #f5f0e8 !important; border-radius: 4px !important; }
#tweet_searchbox input[type="submit"]:hover { background: #8b4513 !important; }
input[type="text"] { font-family: "Georgia", serif !important; padding: 6px 10px !important; }
input:not([type]) { font-family: "Georgia", serif !important; padding: 6px 10px !important; }
input[type="password"] { font-family: "Georgia", serif !important; padding: 6px 10px !important; }
textarea { font-family: "Georgia", serif !important; padding: 6px 10px !important; }
select { font-family: "Georgia", serif !important; padding: 6px 10px !important; }
input[type="text"]:focus { border-color: #8b6c5b !important; }
input:not([type]):focus { border-color: #8b6c5b !important; }
textarea:focus { border-color: #8b6c5b !important; }
select:focus { border-color: #8b6c5b !important; }
input[type="submit"] { background: #6b4c3b !important; padding: 6px 18px !important; font-family: -apple-system, sans-serif !important; }
input[type="button"] { background: #6b4c3b !important; padding: 6px 18px !important; font-family: -apple-system, sans-serif !important; }
input[type="submit"]:hover { background: #8b6c5b !important; }
input[type="button"]:hover { background: #8b6c5b !important; }
#edit_bookmark_form { background: #fefdfb !important; border: 1px solid #e8dfd0 !important; }
#settings_panel { background: #faf8f5 !important; }
.settings_tabs { border-color: #e8dfd0 !important; }
.settings_tab { border-bottom-color: #e8dfd0 !important; }
.settings_tab_selected { border: 1px solid #e8dfd0 !important; border-bottom-color: #faf8f5 !important; background: #faf8f5 !important; font-weight: 600 !important; }
[class*="settings_tab_spacer"] { border-bottom-color: #e8dfd0 !important; }
.settings_heading { font-family: "Georgia", serif !important; border-bottom: 1px solid #e8dfd0 !important; }
a.help { color: #aaa !important; background: #1a1a1a !important; }
.service_box { border: 1px solid #e8dfd0 !important; }
.help_box { border: 1px solid #e8dfd0 !important; }
#profile_main_column h2 { font-family: "Georgia", serif !important; }
#profile_left_column h2 { font-family: "Georgia", serif !important; }
#profile_right_column h2 { font-family: "Georgia", serif !important; }
.note { border-bottom: 1px solid #e8dfd0 !important; }
#bulk_top_bar { border: 1px solid #e8dfd0 !important; }
#bulk_edit_box { border: 1px solid #e8dfd0 !important; }
.bookmark_count { color: #999 !important; }
.bookmark_count_box { color: #999 !important; }
.user_navbar a { color: #6b4c3b !important; }
.rss_link { color: #aaa !important; }
.rss_linkbox a { color: #aaa !important; }
#main_column form[name="sort"] > table { border-spacing: 0 6px !important; }
#main_column form[name="sort"] table tr:hover { background: rgba(139,69,19,0.07) !important; }
#main_column form[name="sort"] table td { padding: 7px 10px !important; font-family: "Georgia", "Noto Serif", serif !important; }
#main_column form[name="sort"] table input[name^="id_"] { width: 38px !important; min-width: 38px !important; max-width: 38px !important; padding: 3px 4px !important; margin-right: 10px !important; font-size: 12px !important; line-height: 1.2 !important; box-sizing: border-box !important; vertical-align: middle !important; background: #fffdf6 !important; font-family: "Georgia", serif !important; font-weight: 600 !important; }
#main_column form[name="sort"] table input[name^="id_"]:focus { border-color: #8b4513 !important; box-shadow: 0 0 0 2px rgba(139,69,19,0.18) !important; }
#main_column form[name="sort"] table a.bundle { font-style: italic !important; letter-spacing: 0.02em !important; font-family: "Georgia", serif !important; }
#main_column form[name="sort"] table a[style*="color:#aaa"] { color: #8b7c6a !important; font-style: italic !important; }
#main_column form[name="sort"] table a[style*="color: #aaa"] { color: #8b7c6a !important; font-style: italic !important; }
#main_column form[name="sort"] table a[style*="color:#aaa"]:hover { color: #8b4513 !important; }
#main_column form[name="sort"] table td a.edit { color: #8b7c6a !important; opacity: 0.75 !important; font-style: italic !important; }
#main_column form[name="sort"] table td a.destroy { color: #a03024 !important; font-weight: 600 !important; font-style: italic !important; }
#main_column form[name="sort"] table tr:hover td a.edit { color: #8b4513 !important; }
#nextprev a.edit { color: #aaa !important; }
#footer { color: #bbb !important; }
.colophon { color: #bbb !important; }
.colophon a { color: #bbb !important; }
h2 { font-family: "Georgia", serif !important; }`
  },

  // ---- 5. Dracula (Dark) ----
  "dracula": {
    name: "Dracula",
    desc: "Popular dark theme with vibrant accents",
    css: `:root {
  --pinboard-bg: #282a36;
  --pinboard-bg-surface: #21222c;
  --pinboard-fg: #f8f8f2;
  --pinboard-fg-strong: #bd93f9;
  --pinboard-muted: #bd93f9;
  --pinboard-muted-soft: #6272a4;
  --pinboard-border: #44475a;
  --pinboard-border-strong: #6272a4;
  --pinboard-border-soft: #44475a;
  --pinboard-accent: #8be9fd;
  --pinboard-accent-hover: #a4f0ff;
  --pinboard-accent-soft: #21222c;
  --pinboard-accent-alpha: rgba(139,233,253,0.25);
  --pinboard-input-bg: #44475a;
  --pinboard-private-bg: #44475a;
  --pinboard-private-accent: #f1fa8c;
  --pinboard-selection-bg: #6272a4;
  --pinboard-selection-fg: #f8f8f2;
  --pinboard-tag-bg: transparent;
  --pinboard-tag-fg: #50fa7b;
  --pinboard-row-hover: #44475a;
  --pinboard-destroy: #ff5555;
  --pinboard-btn-bg: #bd93f9;
  --pinboard-btn-bg-hover: #caa8fb;
  --pinboard-btn-fg: #282a36;
  --pinboard-success: #50fa7b;
  --pinboard-success-hover: #69ff94;
  --pinboard-url-link-bg: #44475a;
  --pinboard-url-link-fg: #ffb86c;
  --pinboard-link-hover: #ff79c6;
  --pinboard-link-visited: #bd93f9;
  --pinboard-focus-ring: #bd93f9;
  --pinboard-unread: #ff5555;
  --pinboard-font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --pinboard-font-size-base: 13px;
  --pinboard-font-size-sm: 12px;
  --pinboard-font-size-lg: 15px;
  --pinboard-font-size-xs: 11px;
  --pinboard-line-height: 1.5;
  --pinboard-weight-body: 400;
  --pinboard-weight-heading: 700;
  --pinboard-space-unit: 4px;
  --pinboard-space-bookmark-gap: 6px;
  --pinboard-space-main-padding: 12px;
  --pinboard-space-sub-banner-y: 8px;
  --pinboard-space-right-bar-gap: 12px;
  --pinboard-space-form-gap: 8px;
  --pinboard-radius-sm: 2px;
  --pinboard-radius-md: 4px;
  --pinboard-radius-lg: 3px;
  --pinboard-border-width: 1px;
  --pinboard-border-style: solid;
  --pinboard-border-hairline: 1px dotted #44475a;
}

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

/* override.generic-bgcolor — defensive against legacy HTML attr */
[bgcolor] { background-color: transparent !important; }

/* override.generic-html-color — defensive against legacy <font> */
font[color], font[size] { color: inherit !important; font-size: inherit !important; }

/* override.generic-fixed-width — defensive against layout tables */
table[width]:not([width="100%"]) { width: auto !important; max-width: 100% !important; }

/* === selection (applied globally; composers may override scoped) === */
::selection          { background: var(--pinboard-selection-bg); color: var(--pinboard-selection-fg); }
::-moz-selection     { background: var(--pinboard-selection-bg); color: var(--pinboard-selection-fg); }

/* === composer: classic-list-v2 — canonical surface inventory === */

/* ---- App shell typography (body#pinboard) ---- */
body#pinboard {
  background: var(--pinboard-bg) !important;
  color: var(--pinboard-fg) !important;
  font-family: var(--pinboard-font-family) !important;
  font-size: 13px !important;
  line-height: var(--pinboard-line-height) !important;
}
body#pinboard table, body#pinboard td, body#pinboard th,
body#pinboard p, body#pinboard b, body#pinboard strong,
body#pinboard label, body#pinboard span, body#pinboard li:not(.pin-ac li),
body#pinboard dd, body#pinboard dt { color: inherit !important; }

/* ---- Popup / iframe frame (body:not(#pinboard)) ---- */
body:not(#pinboard) {
  background: var(--pinboard-bg) !important;
  color: var(--pinboard-fg) !important;
  font-family: var(--pinboard-font-family) !important;
}
body:not(#pinboard) table, body:not(#pinboard) td,
body:not(#pinboard) p, body:not(#pinboard) label,
body:not(#pinboard) span { color: inherit !important; }
body:not(#pinboard) #popup_header { background: transparent !important; color: var(--pinboard-fg) !important; }

/* ---- Banner & navigation ---- */
#banner { background: var(--pinboard-bg-surface) !important; border-color: var(--pinboard-border) !important; max-width: 1030px !important; box-sizing: border-box !important; }
#banner a, #top_menu a, .banner_username { color: var(--pinboard-accent) !important; }
#banner a:hover, #top_menu a:hover { color: var(--pinboard-link-hover) !important; }
#pinboard_name a { color: var(--pinboard-accent) !important; font-weight: var(--pinboard-weight-heading) !important; }
#sub_banner { background: var(--pinboard-bg-surface) !important; border-color: var(--pinboard-border) !important; }
#sub_banner a { color: var(--pinboard-muted) !important; }
#sub_banner a:hover, #sub_banner a.selected { color: var(--pinboard-accent) !important; }

/* ---- Search (banner + main) ---- */
#searchbox { margin-bottom: 12px !important; }
a.bundle { color: var(--pinboard-accent) !important; }
a.bundle:hover { color: var(--pinboard-link-hover) !important; }
#search_query_field, #banner_searchbox input[type="text"] {
  background: var(--pinboard-input-bg) !important;
  color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  box-sizing: border-box !important;
}
#search_query_field:focus, #banner_searchbox input[type="text"]:focus { border-color: var(--pinboard-accent) !important; outline: none !important; }
.search_button input[type="submit"] {
  background: var(--pinboard-accent) !important;
  color: var(--pinboard-btn-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-accent) !important;
  cursor: pointer !important;
}
.search_button input[type="submit"]:hover { background: var(--pinboard-link-hover) !important; }

/* ---- Bookmark list ---- */
.bookmark {
  background: transparent !important;
  display: flex !important;
  align-items: flex-start !important;
}
.bookmark { transition: box-shadow 0.2s ease !important; }
.bookmark .display { float: none !important; flex: 1 !important; width: auto !important; min-width: 0 !important; }
.star, .selected_star { margin-left: 0 !important; margin-right: 6px !important; float: none !important; flex-shrink: 0 !important; }
.star { color: var(--pinboard-border) !important; }
.selected_star { color: var(--pinboard-private-accent) !important; }

a.bookmark_title { color: var(--pinboard-accent) !important; font-size: 15px !important; text-decoration: none !important; font-weight: var(--pinboard-weight-heading) !important; }
a.bookmark_title:hover { color: var(--pinboard-link-hover) !important; text-decoration: underline !important; }
a.url_display, a.when, a.cached { color: var(--pinboard-muted-soft) !important; font-size: 11px !important; }
a.url_link {
  color: var(--pinboard-url-link-fg) !important;
  background: var(--pinboard-url-link-bg) !important;
  padding: 1px 6px !important;
  border-radius: var(--pinboard-radius-lg) !important;
  font-size: 11px !important;
}
.description { color: var(--pinboard-fg) !important; opacity: 0.85 !important; line-height: var(--pinboard-line-height) !important; }
.description blockquote { color: var(--pinboard-muted) !important; border-left: 3px solid var(--pinboard-accent-alpha) !important; padding-left: 10px !important; margin: 4px 0 !important; }

a.tag {
  color: var(--pinboard-tag-fg) !important;
  background: var(--pinboard-tag-bg) !important;
  padding: 1px 8px !important;
  border-radius: var(--pinboard-radius-lg) !important;
  font-size: 11px !important;
  text-decoration: none !important;
}
a.tag:hover { color: var(--pinboard-tag-fg) !important; background: var(--pinboard-accent-alpha) !important; text-decoration: none !important; }
a.tag.selected { color: var(--pinboard-destroy) !important; font-weight: bold !important; }
a.sort_order_selected { background: var(--pinboard-tag-bg) !important; color: var(--pinboard-accent) !important; }

a.unread { color: var(--pinboard-destroy) !important; font-weight: bold !important; }
.edit_links a, a.copy_link { color: var(--pinboard-muted-soft) !important; }
.edit_links a:hover { color: var(--pinboard-fg) !important; }
a.copy_link { color: var(--pinboard-accent) !important; }
a.delete, a.destroy { color: var(--pinboard-destroy) !important; }

/* ---- Private bookmarks ---- */
.bookmark.private,
.bookmark.private[style*="background"] { background: var(--pinboard-private-bg) !important; box-shadow: inset 3px 0 0 var(--pinboard-private-accent) !important; border-top-color: transparent !important; border-right-color: transparent !important; border-left-color: transparent !important; }

/* ---- Right bar ---- */
#right_bar {
  background: var(--pinboard-bg-surface) !important;
  color: var(--pinboard-fg) !important;
  padding: var(--pinboard-space-right-bar-gap) !important;
  box-sizing: border-box !important;
  overflow: hidden !important;
  word-wrap: break-word !important;
}
#right_bar h3, #right_bar h4, #right_bar b { color: var(--pinboard-muted) !important; }
#right_bar a { color: var(--pinboard-accent) !important; }
#right_bar a:hover { color: var(--pinboard-link-hover) !important; }
#right_bar table tr[onmouseover] { background: transparent !important; }
#right_bar table tr[onmouseover]:hover { background: var(--pinboard-row-hover) !important; }
#right_bar table td a.tag { color: var(--pinboard-fg) !important; }
#right_bar table td a.delete { color: var(--pinboard-muted-soft) !important; font-size: 11px !important; opacity: 0.55 !important; transition: opacity 0.15s ease, color 0.15s ease !important; }
#right_bar table tr:hover td a.delete { color: var(--pinboard-destroy) !important; opacity: 1 !important; }
#right_bar input#key {
  background: var(--pinboard-input-bg) !important;
  color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-radius: var(--pinboard-radius-sm) !important;
  padding: 4px 8px !important;
  box-sizing: border-box !important;
  font-size: 12px !important;
}
#right_bar input#key:focus { border-color: var(--pinboard-accent) !important; box-shadow: 0 0 0 2px var(--pinboard-accent-alpha) !important; outline: none !important; }
#right_bar input[type="submit"] {
  background: var(--pinboard-success) !important;
  color: var(--pinboard-btn-fg) !important;
  border: none !important;
  border-radius: var(--pinboard-radius-sm) !important;
  padding: 4px 10px !important;
  margin-left: 6px !important;
  cursor: pointer !important;
  font-size: 12px !important;
  transition: background 0.15s ease !important;
}
#right_bar input[type="submit"]:hover { background: var(--pinboard-success-hover) !important; }

/* ---- Tag cloud ---- */
#tag_cloud { max-width: 100% !important; overflow-wrap: break-word !important; }
#tag_cloud a, #tag_cloud a.tag { color: var(--pinboard-accent) !important; }
#tag_cloud a:hover, #tag_cloud a.tag:hover { color: var(--pinboard-link-hover) !important; }
#tag_cloud_header a, a.tag_heading_selected { color: var(--pinboard-muted-soft) !important; }
#tag_cloud_header a:hover { color: var(--pinboard-accent) !important; }

/* ---- Tweets page searchbox ---- */
#tweet_searchbox { margin-bottom: 12px !important; }
#tweet_searchbox form { display: flex !important; flex-direction: column !important; gap: var(--pinboard-space-form-gap) !important; margin: 0 !important; }
#tweet_searchbox br { display: none !important; }
#tweet_searchbox #search_query_field {
  width: 100% !important; box-sizing: border-box !important;
  background: var(--pinboard-input-bg) !important; color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-radius: var(--pinboard-radius-sm) !important;
  padding: 6px 10px !important; font-size: 12px !important;
}
#tweet_searchbox #search_query_field:focus { border-color: var(--pinboard-accent) !important; box-shadow: 0 0 0 2px var(--pinboard-accent-alpha) !important; outline: none !important; }
#tweet_searchbox input[type="submit"] {
  background: var(--pinboard-success) !important; color: var(--pinboard-btn-fg) !important;
  border: none !important; border-radius: var(--pinboard-radius-sm) !important;
  padding: 5px 14px !important; cursor: pointer !important;
  font-size: 12px !important; align-self: flex-start !important;
  transition: background 0.15s ease !important;
}
#tweet_searchbox input[type="submit"]:hover { background: var(--pinboard-success-hover) !important; }

/* ---- Forms (global) ---- */
input[type="text"], input:not([type]), input[type="password"], textarea, select {
  background: var(--pinboard-input-bg) !important; color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  box-sizing: border-box !important; max-width: 100% !important;
}
input[type="text"]:focus, input:not([type]):focus, textarea:focus, select:focus { border-color: var(--pinboard-accent) !important; outline: none !important; }
input[type="submit"], input[type="button"] {
  background: var(--pinboard-accent) !important; color: var(--pinboard-btn-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-accent) !important;
  border-radius: var(--pinboard-radius-sm) !important;
  padding: 4px 12px !important;
  cursor: pointer !important;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease !important;
}
input[type="submit"]:hover, input[type="button"]:hover { background: var(--pinboard-link-hover) !important; border-color: var(--pinboard-link-hover) !important; }
input[type="reset"], input[type="reset"].reset, button[type="reset"] {
  background: var(--pinboard-bg-surface) !important; color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-radius: var(--pinboard-radius-sm) !important;
  padding: 4px 12px !important;
  cursor: pointer !important;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease !important;
}
input[type="reset"]:hover, input[type="reset"].reset:hover, button[type="reset"]:hover { background: var(--pinboard-row-hover) !important; border-color: var(--pinboard-accent) !important; color: var(--pinboard-accent) !important; }
input[type="checkbox"], input[type="radio"] { accent-color: var(--pinboard-accent) !important; }
.suggested_tag { color: var(--pinboard-success) !important; cursor: pointer !important; }
#edit_bookmark_form { background: var(--pinboard-bg-surface) !important; border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important; }

/* ---- Tag completion popup (Pin.Tags widget on /add/, edit-bookmark, note-add) ---- */
.pin-ac { z-index: 1000 !important; }
.pin-ac .bd {
  background: var(--pinboard-bg-surface) !important;
  color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-radius: var(--pinboard-radius-sm) !important;
  box-shadow: 0 2px 8px var(--pinboard-accent-alpha) !important;
}
.pin-ac li {
  background: transparent !important;
  color: var(--pinboard-fg) !important;
  padding: 4px 10px !important;
  font-size: 12px !important;
}
.pin-ac li:hover { background: var(--pinboard-accent-alpha) !important; color: var(--pinboard-fg) !important; cursor: pointer !important; }
.pin-ac .active { background: var(--pinboard-selection-bg) !important; color: var(--pinboard-selection-fg) !important; }

/* ---- Settings page ---- */
#settings_panel { background: var(--pinboard-bg-surface) !important; }
.settings_tabs { border-color: var(--pinboard-border) !important; }
.settings_tab { color: var(--pinboard-muted) !important; padding: 6px 12px !important; border-bottom-color: var(--pinboard-border) !important; }
.settings_tab a { color: inherit !important; text-decoration: none !important; }
.settings_tab:hover { color: var(--pinboard-accent) !important; }
.settings_tab_selected {
  color: var(--pinboard-accent) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-top: 2px solid var(--pinboard-accent) !important;
  border-bottom-color: var(--pinboard-bg-surface) !important;
  background: var(--pinboard-bg-surface) !important;
  font-weight: bold !important;
  margin-bottom: -1px !important;
}
.settings_tab_selected a { color: var(--pinboard-accent) !important; }
[class*="settings_tab_spacer"] { border-bottom-color: var(--pinboard-border) !important; }
.settings_heading { color: var(--pinboard-muted) !important; background: transparent !important; border-bottom: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important; padding-bottom: 6px !important; }
a.help { color: var(--pinboard-muted-soft) !important; background: var(--pinboard-accent-soft) !important; }
.email_secret { color: var(--pinboard-accent) !important; }
#settings_tab_panes { border: none !important; }
#settings_tab_panes table td { color: var(--pinboard-fg) !important; }

/* ---- Profile page ---- */
.service_box, .help_box {
  background: var(--pinboard-bg-surface) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-radius: var(--pinboard-radius-md) !important;
  padding: 16px !important;
  box-sizing: border-box !important;
  margin-bottom: 12px !important;
}
.service_box .service_box { border: none !important; padding: 0 !important; margin: 0 !important; background: transparent !important; border-radius: 0 !important; width: auto !important; box-sizing: border-box !important; }
#profile_left_column { margin-right: 20px !important; }
#profile_right_column { width: 430px !important; }
#profile_main_column h2, #profile_left_column h2, #profile_right_column h2 { color: var(--pinboard-muted) !important; }
#profile_main_column table td, #profile_right_column table td { color: var(--pinboard-fg) !important; }

/* ---- Notes ---- */
.note { border-bottom: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important; }
.note a { color: var(--pinboard-accent) !important; }
.note .note { border: none !important; padding: 0 !important; margin: 0 !important; background: transparent !important; border-radius: 0 !important; }
#note_right_column { background: var(--pinboard-bg-surface) !important; color: var(--pinboard-fg) !important; padding: 16px !important; border-left: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important; }

/* ---- Bulk edit ---- */
#bulk_top_bar, #bulk_edit_box { background: var(--pinboard-bg-surface) !important; border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important; color: var(--pinboard-fg) !important; }

/* ---- Save bookmark popup ---- */
#popup_header { background: var(--pinboard-bg-surface) !important; color: var(--pinboard-fg) !important; }
.formtable td { color: var(--pinboard-fg) !important; }
.bookmark_count, .bookmark_count_box { color: var(--pinboard-muted) !important; }
.user_navbar a { color: var(--pinboard-accent) !important; }
.rss_link, .rss_linkbox a { color: var(--pinboard-muted-soft) !important; }

/* ---- Bundles (P4-table) — /u/<user>/bundles/ ---- */
#main_column form[name="sort"] > table { width: 100% !important; max-width: 880px !important; border-collapse: separate !important; border-spacing: 0 4px !important; margin-top: 8px !important; }
#main_column form[name="sort"] table tr { background: transparent !important; border-radius: var(--pinboard-radius-md) !important; }
#main_column form[name="sort"] table tr:hover { background: var(--pinboard-row-hover) !important; }
#main_column form[name="sort"] table td { padding: 6px 10px !important; vertical-align: middle !important; border: none !important; }
#main_column form[name="sort"] table td[style*="text-align:right"] { min-width: 160px !important; padding-right: 14px !important; white-space: nowrap !important; }
#main_column form[name="sort"] table input[name^="id_"] {
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  background: var(--pinboard-input-bg) !important;
  color: var(--pinboard-fg) !important;
  width: 32px !important;
  border-radius: var(--pinboard-radius-sm) !important;
  text-align: center !important;
}
#main_column form[name="sort"] table input[name^="id_"]:focus { border-color: var(--pinboard-accent) !important; box-shadow: 0 0 0 2px var(--pinboard-accent-alpha) !important; outline: none !important; }
#main_column form[name="sort"] table a.bundle { font-weight: var(--pinboard-weight-heading) !important; font-style: normal !important; letter-spacing: 0.01em !important; padding: 2px 4px !important; border-radius: var(--pinboard-radius-sm) !important; }
#main_column form[name="sort"] table a[style*="color:#aaa"],
#main_column form[name="sort"] table a[style*="color: #aaa"] { color: var(--pinboard-muted) !important; opacity: 1 !important; text-decoration: none !important; font-size: 12px !important; margin-left: 4px !important; }
#main_column form[name="sort"] table a[style*="color:#aaa"]:hover { color: var(--pinboard-accent) !important; text-decoration: underline !important; }
#main_column form[name="sort"] table td a.edit { color: var(--pinboard-muted) !important; opacity: 0.8 !important; transition: opacity 0.15s ease !important; }
#main_column form[name="sort"] table td a.destroy { color: var(--pinboard-destroy) !important; opacity: 0.85 !important; font-weight: var(--pinboard-weight-heading) !important; }
#main_column form[name="sort"] table tr:hover td a.edit { color: var(--pinboard-accent) !important; opacity: 1 !important; }
#main_column form[name="sort"] table tr:hover td a.destroy { opacity: 1 !important; }

/* ---- Pagination ---- */
.next_prev, .next_prev_widget a { color: var(--pinboard-accent) !important; }
.next_prev:hover, .next_prev_widget a:hover { color: var(--pinboard-link-hover) !important; }
#nextprev a.edit { color: var(--pinboard-muted-soft) !important; }

/* ---- Logged-out landing page (https://pinboard.in/) ---- */
#main_welcome, .homepage_quad { color: var(--pinboard-fg) !important; }
.homepage_heading { color: var(--pinboard-fg-strong) !important; font-weight: var(--pinboard-weight-heading) !important; }
.homepage_subheading { color: var(--pinboard-muted) !important; }
.signup_button,
.signup_button[style*="background"] {
  background: var(--pinboard-btn-bg) !important;
  color: var(--pinboard-btn-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-btn-bg) !important;
  border-radius: var(--pinboard-radius-sm) !important;
  padding: 10px 16px !important;
  text-align: center !important;
  font-weight: var(--pinboard-weight-heading) !important;
  cursor: pointer !important;
  transition: background 0.15s ease, border-color 0.15s ease !important;
}
.signup_button:hover { background: var(--pinboard-btn-bg-hover) !important; border-color: var(--pinboard-btn-bg-hover) !important; }
#blurb_div { color: var(--pinboard-fg) !important; }
.blurb_column { color: var(--pinboard-fg) !important; }
#blurb_div a { text-decoration: none !important; color: var(--pinboard-fg) !important; display: block !important; }
.blurb_box {
  background: var(--pinboard-bg-surface) !important;
  color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-radius: var(--pinboard-radius-md) !important;
  padding: 12px 14px !important;
  margin-bottom: 10px !important;
  transition: background 0.15s ease, border-color 0.15s ease !important;
}
#blurb_div a:hover .blurb_box { background: var(--pinboard-row-hover) !important; border-color: var(--pinboard-accent-alpha) !important; }
.magazine_title { color: var(--pinboard-accent) !important; font-weight: var(--pinboard-weight-heading) !important; }
.blurb { color: var(--pinboard-fg) !important; opacity: 0.85 !important; }
#language_box { color: var(--pinboard-muted) !important; }
#language_box p { margin: 2px 0 !important; }
#language_box a { color: var(--pinboard-muted) !important; padding: 1px 6px !important; border-radius: var(--pinboard-radius-sm) !important; text-decoration: none !important; }
#language_box a:hover { color: var(--pinboard-accent) !important; background: var(--pinboard-accent-alpha) !important; }
#language_box a[style*="background:#ffa"],
#language_box a[style*="background: #ffa"] { background: var(--pinboard-accent-alpha) !important; color: var(--pinboard-accent) !important; }
.nli { color: var(--pinboard-muted) !important; }
.nav_nli { color: var(--pinboard-accent) !important; text-decoration: none !important; }
.nav_nli:hover { color: var(--pinboard-link-hover) !important; }

/* ---- Footer / colophon ---- */
#footer, .colophon, .colophon a { color: var(--pinboard-muted-soft) !important; }

/* ---- Scrollbars (Webkit + Firefox standard) ---- */
html, body, textarea, .description, .pin-ac .bd {
  scrollbar-width: thin !important;
  scrollbar-color: var(--pinboard-muted) var(--pinboard-bg-surface) !important;
}
::-webkit-scrollbar { width: 10px !important; height: 10px !important; }
::-webkit-scrollbar-track { background: var(--pinboard-bg-surface) !important; border-left: 1px solid var(--pinboard-border) !important; }
::-webkit-scrollbar-thumb { background: var(--pinboard-muted-soft) !important; border: 2px solid var(--pinboard-bg-surface) !important; border-radius: 6px !important; }
::-webkit-scrollbar-thumb:hover { background: var(--pinboard-accent) !important; }
::-webkit-scrollbar-corner { background: var(--pinboard-bg-surface) !important; }

/* ---- Global anchor fallbacks ---- */
a, a:link { color: var(--pinboard-accent) !important; }
a:hover { color: var(--pinboard-link-hover) !important; }
a:visited { color: var(--pinboard-link-visited) !important; }
a:focus-visible { outline: 2px solid var(--pinboard-focus-ring) !important; outline-offset: 2px !important; }
h2 { color: var(--pinboard-muted) !important; }
hr { border-color: var(--pinboard-border) !important; }

/* ---- Bundle slot input override: already in inline_base_rules — redundant here ---- */

/* ---- ::selection (also in _base but themes may want explicit) ---- */
::selection { background: var(--pinboard-selection-bg) !important; color: var(--pinboard-selection-fg) !important; }
::-moz-selection { background: var(--pinboard-selection-bg) !important; color: var(--pinboard-selection-fg) !important; }

/* === patterns layer (tokens.patterns) === */
#search_query_field:focus, #banner_searchbox input[type="text"]:focus, #right_bar input#key:focus, #tweet_searchbox #search_query_field:focus {
  box-shadow: 0 0 0 2px var(--pinboard-accent-alpha) !important;
  outline: none !important;
}
.bookmark { border-bottom: 1px solid var(--pinboard-border) !important; }
input[type="submit"], input[type="button"], .search_button input[type="submit"] { border: none !important; }


/* === theme overrides (tokens.overrides.css) === */
/* ======== overrides-patch for dracula (auto-generated by tools/generate-overrides.mjs) ========
 * Restores shipped decls the composer's token-driven output doesn't match.
 */
#banner { border-radius: 6px !important; padding: 8px 16px !important; border-bottom: 1px solid #44475a !important; }
#banner a { color: #bd93f9 !important; }
#top_menu a { color: #bd93f9 !important; }
.banner_username { color: #bd93f9 !important; }
#pinboard_name a { color: #bd93f9 !important; }
#sub_banner a:hover { color: #ff79c6 !important; }
#sub_banner a.selected { color: #ff79c6 !important; }
a.bundle { color: #bd93f9 !important; }
#search_query_field { width: 100% !important; border: 1px solid #6272a4 !important; }
#banner_searchbox input[type="text"] { border: 1px solid #6272a4 !important; }
#search_query_field:focus { border-color: #bd93f9 !important; box-shadow: 0 0 0 2px rgba(189,147,249,0.2) !important; }
#banner_searchbox input[type="text"]:focus { border-color: #bd93f9 !important; box-shadow: 0 0 0 2px rgba(189,147,249,0.2) !important; }
.search_button input[type="submit"] { background: #bd93f9 !important; font-weight: 600 !important; }
.search_button input[type="submit"]:hover { background: #caa8fb !important; }
.bookmark { padding: 12px 14px !important; }
a.bookmark_title:hover { color: #a4f0ff !important; }
a.url_display { color: #50fa7b !important; font-size: 12px !important; }
a.url_link { padding: 1px 5px !important; background: #2d2f40 !important; }
.description { opacity: 0.75 !important; }
.description blockquote { color: #f8f8f2 !important; border-left: 3px solid #6272a4 !important; }
a.tag { font-size: 12px !important; }
a.tag:hover { color: #69ff94 !important; text-decoration: underline !important; }
a.tag.selected { color: #ff79c6 !important; }
a.sort_order_selected { background: #343746 !important; color: #ff79c6 !important; }
a.copy_link { color: #bd93f9 !important; }
#right_bar a { color: #bd93f9 !important; }
#right_bar input#key { background: #282a36 !important; border: 1px solid #6272a4 !important; border-radius: 4px !important; }
#right_bar input#key:focus { border-color: #bd93f9 !important; box-shadow: 0 0 0 2px rgba(189,147,249,0.25) !important; }
#right_bar input[type="submit"] { background: #bd93f9 !important; border-radius: 4px !important; }
#right_bar input[type="submit"]:hover { background: #ff79c6 !important; }
#tag_cloud a { color: #bd93f9 !important; }
#tag_cloud a.tag { color: #bd93f9 !important; }
#tag_cloud_header a:hover { color: #ff79c6 !important; }
#tweet_searchbox #search_query_field { background: #282a36 !important; border: 1px solid #6272a4 !important; border-radius: 4px !important; font-size: 13px !important; }
#tweet_searchbox #search_query_field:focus { border-color: #bd93f9 !important; box-shadow: 0 0 0 2px rgba(189,147,249,0.25) !important; }
#tweet_searchbox input[type="submit"] { background: #bd93f9 !important; border-radius: 4px !important; }
#tweet_searchbox input[type="submit"]:hover { background: #ff79c6 !important; }
input[type="text"] { border: 1px solid #6272a4 !important; }
input:not([type]) { border: 1px solid #6272a4 !important; }
input[type="password"] { border: 1px solid #6272a4 !important; }
textarea { border: 1px solid #6272a4 !important; }
select { border: 1px solid #6272a4 !important; }
input[type="text"]:focus { border-color: #bd93f9 !important; box-shadow: 0 0 0 2px rgba(189,147,249,0.2) !important; }
input:not([type]):focus { border-color: #bd93f9 !important; box-shadow: 0 0 0 2px rgba(189,147,249,0.2) !important; }
textarea:focus { border-color: #bd93f9 !important; box-shadow: 0 0 0 2px rgba(189,147,249,0.2) !important; }
select:focus { border-color: #bd93f9 !important; box-shadow: 0 0 0 2px rgba(189,147,249,0.2) !important; }
input[type="submit"] { background: #bd93f9 !important; font-weight: 600 !important; }
input[type="button"] { background: #bd93f9 !important; font-weight: 600 !important; }
input[type="submit"]:hover { background: #caa8fb !important; }
input[type="button"]:hover { background: #caa8fb !important; }
input[type="checkbox"] { accent-color: #bd93f9 !important; }
input[type="radio"] { accent-color: #bd93f9 !important; }
#edit_bookmark_form { background: #44475a !important; border: 1px solid #6272a4 !important; }
#settings_panel { background: #282a36 !important; color: #f8f8f2 !important; }
.settings_tab { color: #6272a4 !important; }
.settings_tab:hover { color: #bd93f9 !important; }
.settings_tab_selected { color: #ff79c6 !important; border-top: 2px solid #ff79c6 !important; border-bottom-color: #282a36 !important; background: #282a36 !important; }
.settings_tab_selected a { color: #ff79c6 !important; }
a.help { background: #343746 !important; }
.service_box { color: #f8f8f2 !important; border-radius: 6px !important; }
.help_box { color: #f8f8f2 !important; border-radius: 6px !important; }
#bulk_top_bar { background: #44475a !important; border: 1px solid #6272a4 !important; }
#bulk_edit_box { background: #44475a !important; border: 1px solid #6272a4 !important; }
.user_navbar a { color: #bd93f9 !important; }
#main_column form[name="sort"] table tr { border-radius: 6px !important; }
#main_column form[name="sort"] table tr:hover { background: rgba(189,147,249,0.1) !important; }
#main_column form[name="sort"] table input[name^="id_"] { width: 38px !important; min-width: 38px !important; max-width: 38px !important; padding: 3px 4px !important; margin-right: 10px !important; font-size: 12px !important; line-height: 1.2 !important; border-radius: 6px !important; box-sizing: border-box !important; vertical-align: middle !important; background: #21222c !important; font-weight: 600 !important; }
#main_column form[name="sort"] table input[name^="id_"]:focus { border-color: #ff79c6 !important; box-shadow: 0 0 0 2px rgba(255,121,198,0.25) !important; }
#main_column form[name="sort"] table a.bundle { border-radius: 3px !important; }
#main_column form[name="sort"] table a[style*="color:#aaa"] { color: #6272a4 !important; }
#main_column form[name="sort"] table a[style*="color: #aaa"] { color: #6272a4 !important; }
#main_column form[name="sort"] table a[style*="color:#aaa"]:hover { color: #ff79c6 !important; }
#main_column form[name="sort"] table td a.edit { color: #6272a4 !important; opacity: 0.75 !important; }
#main_column form[name="sort"] table td a.destroy { opacity: 0.9 !important; font-weight: 600 !important; }
#main_column form[name="sort"] table tr:hover td a.edit { color: #ff79c6 !important; }
.next_prev { color: #bd93f9 !important; }
.next_prev_widget a { color: #bd93f9 !important; }
a { color: #bd93f9 !important; }`
  },

  // ---- 6. Flexoki Adaptive (Light + Dark) ----
  // Uses html.pbp-dark class injected by pinboard-style.js based on extension theme setting
  "flexoki": {
    name: "Flexoki Adaptive",
    desc: "Matches extension theme, follows your Theme setting",
    css: `:root {
  --pinboard-bg: #FFFCF0;
  --pinboard-bg-surface: #F2F0E5;
  --pinboard-fg: #100F0F;
  --pinboard-fg-strong: #100F0F;
  --pinboard-muted: #6F6E69;
  --pinboard-muted-soft: #B7B5AC;
  --pinboard-border: #E6E4D9;
  --pinboard-border-strong: #DAD8CE;
  --pinboard-border-soft: #E6E4D9;
  --pinboard-accent: #205EA6;
  --pinboard-accent-hover: #4385BE;
  --pinboard-accent-soft: #F2F0E5;
  --pinboard-accent-alpha: rgba(32,94,166,0.15);
  --pinboard-input-bg: #FFFCF0;
  --pinboard-private-bg: #f5ebd0;
  --pinboard-private-accent: #D0A215;
  --pinboard-selection-bg: #F2F0E5;
  --pinboard-selection-fg: #100F0F;
  --pinboard-tag-bg: transparent;
  --pinboard-tag-fg: #AD8301;
  --pinboard-row-hover: #F2F0E5;
  --pinboard-destroy: #AF3029;
  --pinboard-btn-bg: #205EA6;
  --pinboard-btn-fg: #FFFCF0;
  --pinboard-success: #66800B;
  --pinboard-success-hover: #879A39;
  --pinboard-url-link-bg: #F2F0E5;
  --pinboard-url-link-fg: #AD8301;
  --pinboard-link-hover: #4385BE;
  --pinboard-link-visited: #205EA6;
  --pinboard-focus-ring: #205EA6;
  --pinboard-unread: #AF3029;
  --pinboard-btn-bg-hover: #4385BE;
  --pinboard-font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --pinboard-font-size-base: 13px;
  --pinboard-font-size-sm: 12px;
  --pinboard-font-size-lg: 15px;
  --pinboard-font-size-xs: 11px;
  --pinboard-line-height: 1.5;
  --pinboard-weight-body: 400;
  --pinboard-weight-heading: 700;
  --pinboard-space-unit: 4px;
  --pinboard-space-bookmark-gap: 12px;
  --pinboard-space-main-padding: 12px;
  --pinboard-space-sub-banner-y: 8px;
  --pinboard-space-right-bar-gap: 12px;
  --pinboard-space-form-gap: 8px;
  --pinboard-radius-sm: 3px;
  --pinboard-radius-md: 6px;
  --pinboard-radius-lg: 6px;
  --pinboard-border-width: 1px;
  --pinboard-border-style: solid;
  --pinboard-border-hairline: 1px dotted #E6E4D9;
}

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

/* override.generic-bgcolor — defensive against legacy HTML attr */
[bgcolor] { background-color: transparent !important; }

/* override.generic-html-color — defensive against legacy <font> */
font[color], font[size] { color: inherit !important; font-size: inherit !important; }

/* override.generic-fixed-width — defensive against layout tables */
table[width]:not([width="100%"]) { width: auto !important; max-width: 100% !important; }

/* === selection (applied globally; composers may override scoped) === */
::selection          { background: var(--pinboard-selection-bg); color: var(--pinboard-selection-fg); }
::-moz-selection     { background: var(--pinboard-selection-bg); color: var(--pinboard-selection-fg); }

/* === composer: classic-list-v2 — canonical surface inventory === */

/* ---- App shell typography (body#pinboard) ---- */
body#pinboard {
  background: var(--pinboard-bg) !important;
  color: var(--pinboard-fg) !important;
  font-family: var(--pinboard-font-family) !important;
  font-size: 13px !important;
  line-height: var(--pinboard-line-height) !important;
}
body#pinboard table, body#pinboard td, body#pinboard th,
body#pinboard p, body#pinboard b, body#pinboard strong,
body#pinboard label, body#pinboard span, body#pinboard li:not(.pin-ac li),
body#pinboard dd, body#pinboard dt { color: inherit !important; }

/* ---- Popup / iframe frame (body:not(#pinboard)) ---- */
body:not(#pinboard) {
  background: var(--pinboard-bg) !important;
  color: var(--pinboard-fg) !important;
  font-family: var(--pinboard-font-family) !important;
}
body:not(#pinboard) table, body:not(#pinboard) td,
body:not(#pinboard) p, body:not(#pinboard) label,
body:not(#pinboard) span { color: inherit !important; }
body:not(#pinboard) #popup_header { background: transparent !important; color: var(--pinboard-fg) !important; }

/* ---- Banner & navigation ---- */
#banner { background: var(--pinboard-bg-surface) !important; border-color: var(--pinboard-border) !important; max-width: 1030px !important; box-sizing: border-box !important; }
#banner a, #top_menu a, .banner_username { color: var(--pinboard-accent) !important; }
#banner a:hover, #top_menu a:hover { color: var(--pinboard-link-hover) !important; }
#pinboard_name a { color: var(--pinboard-accent) !important; font-weight: var(--pinboard-weight-heading) !important; }
#sub_banner { background: var(--pinboard-bg-surface) !important; border-color: var(--pinboard-border) !important; }
#sub_banner a { color: var(--pinboard-muted) !important; }
#sub_banner a:hover, #sub_banner a.selected { color: var(--pinboard-accent) !important; }

/* ---- Search (banner + main) ---- */
#searchbox { margin-bottom: 12px !important; }
a.bundle { color: var(--pinboard-accent) !important; }
a.bundle:hover { color: var(--pinboard-link-hover) !important; }
#search_query_field, #banner_searchbox input[type="text"] {
  background: var(--pinboard-input-bg) !important;
  color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  box-sizing: border-box !important;
}
#search_query_field:focus, #banner_searchbox input[type="text"]:focus { border-color: var(--pinboard-accent) !important; outline: none !important; }
.search_button input[type="submit"] {
  background: var(--pinboard-accent) !important;
  color: var(--pinboard-btn-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-accent) !important;
  cursor: pointer !important;
}
.search_button input[type="submit"]:hover { background: var(--pinboard-link-hover) !important; }

/* ---- Bookmark list ---- */
.bookmark {
  background: transparent !important;
  display: flex !important;
  align-items: flex-start !important;
}
.bookmark { transition: box-shadow 0.2s ease !important; }
.bookmark .display { float: none !important; flex: 1 !important; width: auto !important; min-width: 0 !important; }
.star, .selected_star { margin-left: 0 !important; margin-right: 6px !important; float: none !important; flex-shrink: 0 !important; }
.star { color: var(--pinboard-border) !important; }
.selected_star { color: var(--pinboard-private-accent) !important; }

a.bookmark_title { color: var(--pinboard-accent) !important; font-size: 15px !important; text-decoration: none !important; font-weight: var(--pinboard-weight-heading) !important; }
a.bookmark_title:hover { color: var(--pinboard-link-hover) !important; text-decoration: underline !important; }
a.url_display, a.when, a.cached { color: var(--pinboard-muted-soft) !important; font-size: 11px !important; }
a.url_link {
  color: var(--pinboard-url-link-fg) !important;
  background: var(--pinboard-url-link-bg) !important;
  padding: 1px 6px !important;
  border-radius: var(--pinboard-radius-lg) !important;
  font-size: 11px !important;
}
.description { color: var(--pinboard-fg) !important; opacity: 0.85 !important; line-height: var(--pinboard-line-height) !important; }
.description blockquote { color: var(--pinboard-muted) !important; border-left: 3px solid var(--pinboard-accent-alpha) !important; padding-left: 10px !important; margin: 4px 0 !important; }

a.tag {
  color: var(--pinboard-tag-fg) !important;
  background: var(--pinboard-tag-bg) !important;
  padding: 1px 8px !important;
  border-radius: var(--pinboard-radius-lg) !important;
  font-size: 11px !important;
  text-decoration: none !important;
}
a.tag:hover { color: var(--pinboard-tag-fg) !important; background: var(--pinboard-accent-alpha) !important; text-decoration: none !important; }
a.tag.selected { color: var(--pinboard-destroy) !important; font-weight: bold !important; }
a.sort_order_selected { background: var(--pinboard-tag-bg) !important; color: var(--pinboard-accent) !important; }

a.unread { color: var(--pinboard-destroy) !important; font-weight: bold !important; }
.edit_links a, a.copy_link { color: var(--pinboard-muted-soft) !important; }
.edit_links a:hover { color: var(--pinboard-fg) !important; }
a.copy_link { color: var(--pinboard-accent) !important; }
a.delete, a.destroy { color: var(--pinboard-destroy) !important; }

/* ---- Private bookmarks ---- */
.bookmark.private,
.bookmark.private[style*="background"] { background: var(--pinboard-private-bg) !important; box-shadow: inset 3px 0 0 var(--pinboard-private-accent) !important; border-top-color: transparent !important; border-right-color: transparent !important; border-left-color: transparent !important; }

/* ---- Right bar ---- */
#right_bar {
  background: var(--pinboard-bg-surface) !important;
  color: var(--pinboard-fg) !important;
  padding: var(--pinboard-space-right-bar-gap) !important;
  box-sizing: border-box !important;
  overflow: hidden !important;
  word-wrap: break-word !important;
}
#right_bar h3, #right_bar h4, #right_bar b { color: var(--pinboard-muted) !important; }
#right_bar a { color: var(--pinboard-accent) !important; }
#right_bar a:hover { color: var(--pinboard-link-hover) !important; }
#right_bar table tr[onmouseover] { background: transparent !important; }
#right_bar table tr[onmouseover]:hover { background: var(--pinboard-row-hover) !important; }
#right_bar table td a.tag { color: var(--pinboard-fg) !important; }
#right_bar table td a.delete { color: var(--pinboard-muted-soft) !important; font-size: 11px !important; opacity: 0.55 !important; transition: opacity 0.15s ease, color 0.15s ease !important; }
#right_bar table tr:hover td a.delete { color: var(--pinboard-destroy) !important; opacity: 1 !important; }
#right_bar input#key {
  background: var(--pinboard-input-bg) !important;
  color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-radius: var(--pinboard-radius-sm) !important;
  padding: 4px 8px !important;
  box-sizing: border-box !important;
  font-size: 12px !important;
}
#right_bar input#key:focus { border-color: var(--pinboard-accent) !important; box-shadow: 0 0 0 2px var(--pinboard-accent-alpha) !important; outline: none !important; }
#right_bar input[type="submit"] {
  background: var(--pinboard-success) !important;
  color: var(--pinboard-btn-fg) !important;
  border: none !important;
  border-radius: var(--pinboard-radius-sm) !important;
  padding: 4px 10px !important;
  margin-left: 6px !important;
  cursor: pointer !important;
  font-size: 12px !important;
  transition: background 0.15s ease !important;
}
#right_bar input[type="submit"]:hover { background: var(--pinboard-success-hover) !important; }

/* ---- Tag cloud ---- */
#tag_cloud { max-width: 100% !important; overflow-wrap: break-word !important; }
#tag_cloud a, #tag_cloud a.tag { color: var(--pinboard-accent) !important; }
#tag_cloud a:hover, #tag_cloud a.tag:hover { color: var(--pinboard-link-hover) !important; }
#tag_cloud_header a, a.tag_heading_selected { color: var(--pinboard-muted-soft) !important; }
#tag_cloud_header a:hover { color: var(--pinboard-accent) !important; }

/* ---- Tweets page searchbox ---- */
#tweet_searchbox { margin-bottom: 12px !important; }
#tweet_searchbox form { display: flex !important; flex-direction: column !important; gap: var(--pinboard-space-form-gap) !important; margin: 0 !important; }
#tweet_searchbox br { display: none !important; }
#tweet_searchbox #search_query_field {
  width: 100% !important; box-sizing: border-box !important;
  background: var(--pinboard-input-bg) !important; color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-radius: var(--pinboard-radius-sm) !important;
  padding: 6px 10px !important; font-size: 12px !important;
}
#tweet_searchbox #search_query_field:focus { border-color: var(--pinboard-accent) !important; box-shadow: 0 0 0 2px var(--pinboard-accent-alpha) !important; outline: none !important; }
#tweet_searchbox input[type="submit"] {
  background: var(--pinboard-success) !important; color: var(--pinboard-btn-fg) !important;
  border: none !important; border-radius: var(--pinboard-radius-sm) !important;
  padding: 5px 14px !important; cursor: pointer !important;
  font-size: 12px !important; align-self: flex-start !important;
  transition: background 0.15s ease !important;
}
#tweet_searchbox input[type="submit"]:hover { background: var(--pinboard-success-hover) !important; }

/* ---- Forms (global) ---- */
input[type="text"], input:not([type]), input[type="password"], textarea, select {
  background: var(--pinboard-input-bg) !important; color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  box-sizing: border-box !important; max-width: 100% !important;
}
input[type="text"]:focus, input:not([type]):focus, textarea:focus, select:focus { border-color: var(--pinboard-accent) !important; outline: none !important; }
input[type="submit"], input[type="button"] {
  background: var(--pinboard-accent) !important; color: var(--pinboard-btn-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-accent) !important;
  border-radius: var(--pinboard-radius-sm) !important;
  padding: 4px 12px !important;
  cursor: pointer !important;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease !important;
}
input[type="submit"]:hover, input[type="button"]:hover { background: var(--pinboard-link-hover) !important; border-color: var(--pinboard-link-hover) !important; }
input[type="reset"], input[type="reset"].reset, button[type="reset"] {
  background: var(--pinboard-bg-surface) !important; color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-radius: var(--pinboard-radius-sm) !important;
  padding: 4px 12px !important;
  cursor: pointer !important;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease !important;
}
input[type="reset"]:hover, input[type="reset"].reset:hover, button[type="reset"]:hover { background: var(--pinboard-row-hover) !important; border-color: var(--pinboard-accent) !important; color: var(--pinboard-accent) !important; }
input[type="checkbox"], input[type="radio"] { accent-color: var(--pinboard-accent) !important; }
.suggested_tag { color: var(--pinboard-success) !important; cursor: pointer !important; }
#edit_bookmark_form { background: var(--pinboard-bg-surface) !important; border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important; }

/* ---- Tag completion popup (Pin.Tags widget on /add/, edit-bookmark, note-add) ---- */
.pin-ac { z-index: 1000 !important; }
.pin-ac .bd {
  background: var(--pinboard-bg-surface) !important;
  color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-radius: var(--pinboard-radius-sm) !important;
  box-shadow: 0 2px 8px var(--pinboard-accent-alpha) !important;
}
.pin-ac li {
  background: transparent !important;
  color: var(--pinboard-fg) !important;
  padding: 4px 10px !important;
  font-size: 12px !important;
}
.pin-ac li:hover { background: var(--pinboard-accent-alpha) !important; color: var(--pinboard-fg) !important; cursor: pointer !important; }
.pin-ac .active { background: var(--pinboard-selection-bg) !important; color: var(--pinboard-selection-fg) !important; }

/* ---- Settings page ---- */
#settings_panel { background: var(--pinboard-bg-surface) !important; }
.settings_tabs { border-color: var(--pinboard-border) !important; }
.settings_tab { color: var(--pinboard-muted) !important; padding: 6px 12px !important; border-bottom-color: var(--pinboard-border) !important; }
.settings_tab a { color: inherit !important; text-decoration: none !important; }
.settings_tab:hover { color: var(--pinboard-accent) !important; }
.settings_tab_selected {
  color: var(--pinboard-accent) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-top: 2px solid var(--pinboard-accent) !important;
  border-bottom-color: var(--pinboard-bg-surface) !important;
  background: var(--pinboard-bg-surface) !important;
  font-weight: bold !important;
  margin-bottom: -1px !important;
}
.settings_tab_selected a { color: var(--pinboard-accent) !important; }
[class*="settings_tab_spacer"] { border-bottom-color: var(--pinboard-border) !important; }
.settings_heading { color: var(--pinboard-muted) !important; background: transparent !important; border-bottom: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important; padding-bottom: 6px !important; }
a.help { color: var(--pinboard-muted-soft) !important; background: var(--pinboard-accent-soft) !important; }
.email_secret { color: var(--pinboard-accent) !important; }
#settings_tab_panes { border: none !important; }
#settings_tab_panes table td { color: var(--pinboard-fg) !important; }

/* ---- Profile page ---- */
.service_box, .help_box {
  background: var(--pinboard-bg-surface) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-radius: var(--pinboard-radius-md) !important;
  padding: 16px !important;
  box-sizing: border-box !important;
  margin-bottom: 12px !important;
}
.service_box .service_box { border: none !important; padding: 0 !important; margin: 0 !important; background: transparent !important; border-radius: 0 !important; width: auto !important; box-sizing: border-box !important; }
#profile_left_column { margin-right: 20px !important; }
#profile_right_column { width: 430px !important; }
#profile_main_column h2, #profile_left_column h2, #profile_right_column h2 { color: var(--pinboard-muted) !important; }
#profile_main_column table td, #profile_right_column table td { color: var(--pinboard-fg) !important; }

/* ---- Notes ---- */
.note { border-bottom: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important; }
.note a { color: var(--pinboard-accent) !important; }
.note .note { border: none !important; padding: 0 !important; margin: 0 !important; background: transparent !important; border-radius: 0 !important; }
#note_right_column { background: var(--pinboard-bg-surface) !important; color: var(--pinboard-fg) !important; padding: 16px !important; border-left: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important; }

/* ---- Bulk edit ---- */
#bulk_top_bar, #bulk_edit_box { background: var(--pinboard-bg-surface) !important; border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important; color: var(--pinboard-fg) !important; }

/* ---- Save bookmark popup ---- */
#popup_header { background: var(--pinboard-bg-surface) !important; color: var(--pinboard-fg) !important; }
.formtable td { color: var(--pinboard-fg) !important; }
.bookmark_count, .bookmark_count_box { color: var(--pinboard-muted) !important; }
.user_navbar a { color: var(--pinboard-accent) !important; }
.rss_link, .rss_linkbox a { color: var(--pinboard-muted-soft) !important; }

/* ---- Bundles (P4-table) — /u/<user>/bundles/ ---- */
#main_column form[name="sort"] > table { width: 100% !important; max-width: 880px !important; border-collapse: separate !important; border-spacing: 0 4px !important; margin-top: 8px !important; }
#main_column form[name="sort"] table tr { background: transparent !important; border-radius: var(--pinboard-radius-md) !important; }
#main_column form[name="sort"] table tr:hover { background: var(--pinboard-row-hover) !important; }
#main_column form[name="sort"] table td { padding: 6px 10px !important; vertical-align: middle !important; border: none !important; }
#main_column form[name="sort"] table td[style*="text-align:right"] { min-width: 160px !important; padding-right: 14px !important; white-space: nowrap !important; }
#main_column form[name="sort"] table input[name^="id_"] {
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  background: var(--pinboard-input-bg) !important;
  color: var(--pinboard-fg) !important;
  width: 32px !important;
  border-radius: var(--pinboard-radius-sm) !important;
  text-align: center !important;
}
#main_column form[name="sort"] table input[name^="id_"]:focus { border-color: var(--pinboard-accent) !important; box-shadow: 0 0 0 2px var(--pinboard-accent-alpha) !important; outline: none !important; }
#main_column form[name="sort"] table a.bundle { font-weight: var(--pinboard-weight-heading) !important; font-style: normal !important; letter-spacing: 0.01em !important; padding: 2px 4px !important; border-radius: var(--pinboard-radius-sm) !important; }
#main_column form[name="sort"] table a[style*="color:#aaa"],
#main_column form[name="sort"] table a[style*="color: #aaa"] { color: var(--pinboard-muted) !important; opacity: 1 !important; text-decoration: none !important; font-size: 12px !important; margin-left: 4px !important; }
#main_column form[name="sort"] table a[style*="color:#aaa"]:hover { color: var(--pinboard-accent) !important; text-decoration: underline !important; }
#main_column form[name="sort"] table td a.edit { color: var(--pinboard-muted) !important; opacity: 0.8 !important; transition: opacity 0.15s ease !important; }
#main_column form[name="sort"] table td a.destroy { color: var(--pinboard-destroy) !important; opacity: 0.85 !important; font-weight: var(--pinboard-weight-heading) !important; }
#main_column form[name="sort"] table tr:hover td a.edit { color: var(--pinboard-accent) !important; opacity: 1 !important; }
#main_column form[name="sort"] table tr:hover td a.destroy { opacity: 1 !important; }

/* ---- Pagination ---- */
.next_prev, .next_prev_widget a { color: var(--pinboard-accent) !important; }
.next_prev:hover, .next_prev_widget a:hover { color: var(--pinboard-link-hover) !important; }
#nextprev a.edit { color: var(--pinboard-muted-soft) !important; }

/* ---- Logged-out landing page (https://pinboard.in/) ---- */
#main_welcome, .homepage_quad { color: var(--pinboard-fg) !important; }
.homepage_heading { color: var(--pinboard-fg-strong) !important; font-weight: var(--pinboard-weight-heading) !important; }
.homepage_subheading { color: var(--pinboard-muted) !important; }
.signup_button,
.signup_button[style*="background"] {
  background: var(--pinboard-btn-bg) !important;
  color: var(--pinboard-btn-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-btn-bg) !important;
  border-radius: var(--pinboard-radius-sm) !important;
  padding: 10px 16px !important;
  text-align: center !important;
  font-weight: var(--pinboard-weight-heading) !important;
  cursor: pointer !important;
  transition: background 0.15s ease, border-color 0.15s ease !important;
}
.signup_button:hover { background: var(--pinboard-btn-bg-hover) !important; border-color: var(--pinboard-btn-bg-hover) !important; }
#blurb_div { color: var(--pinboard-fg) !important; }
.blurb_column { color: var(--pinboard-fg) !important; }
#blurb_div a { text-decoration: none !important; color: var(--pinboard-fg) !important; display: block !important; }
.blurb_box {
  background: var(--pinboard-bg-surface) !important;
  color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-radius: var(--pinboard-radius-md) !important;
  padding: 12px 14px !important;
  margin-bottom: 10px !important;
  transition: background 0.15s ease, border-color 0.15s ease !important;
}
#blurb_div a:hover .blurb_box { background: var(--pinboard-row-hover) !important; border-color: var(--pinboard-accent-alpha) !important; }
.magazine_title { color: var(--pinboard-accent) !important; font-weight: var(--pinboard-weight-heading) !important; }
.blurb { color: var(--pinboard-fg) !important; opacity: 0.85 !important; }
#language_box { color: var(--pinboard-muted) !important; }
#language_box p { margin: 2px 0 !important; }
#language_box a { color: var(--pinboard-muted) !important; padding: 1px 6px !important; border-radius: var(--pinboard-radius-sm) !important; text-decoration: none !important; }
#language_box a:hover { color: var(--pinboard-accent) !important; background: var(--pinboard-accent-alpha) !important; }
#language_box a[style*="background:#ffa"],
#language_box a[style*="background: #ffa"] { background: var(--pinboard-accent-alpha) !important; color: var(--pinboard-accent) !important; }
.nli { color: var(--pinboard-muted) !important; }
.nav_nli { color: var(--pinboard-accent) !important; text-decoration: none !important; }
.nav_nli:hover { color: var(--pinboard-link-hover) !important; }

/* ---- Footer / colophon ---- */
#footer, .colophon, .colophon a { color: var(--pinboard-muted-soft) !important; }

/* ---- Scrollbars (Webkit + Firefox standard) ---- */
html, body, textarea, .description, .pin-ac .bd {
  scrollbar-width: thin !important;
  scrollbar-color: var(--pinboard-muted) var(--pinboard-bg-surface) !important;
}
::-webkit-scrollbar { width: 10px !important; height: 10px !important; }
::-webkit-scrollbar-track { background: var(--pinboard-bg-surface) !important; border-left: 1px solid var(--pinboard-border) !important; }
::-webkit-scrollbar-thumb { background: var(--pinboard-muted-soft) !important; border: 2px solid var(--pinboard-bg-surface) !important; border-radius: 6px !important; }
::-webkit-scrollbar-thumb:hover { background: var(--pinboard-accent) !important; }
::-webkit-scrollbar-corner { background: var(--pinboard-bg-surface) !important; }

/* ---- Global anchor fallbacks ---- */
a, a:link { color: var(--pinboard-accent) !important; }
a:hover { color: var(--pinboard-link-hover) !important; }
a:visited { color: var(--pinboard-link-visited) !important; }
a:focus-visible { outline: 2px solid var(--pinboard-focus-ring) !important; outline-offset: 2px !important; }
h2 { color: var(--pinboard-muted) !important; }
hr { border-color: var(--pinboard-border) !important; }

/* ---- Bundle slot input override: already in inline_base_rules — redundant here ---- */

/* ---- ::selection (also in _base but themes may want explicit) ---- */
::selection { background: var(--pinboard-selection-bg) !important; color: var(--pinboard-selection-fg) !important; }
::-moz-selection { background: var(--pinboard-selection-bg) !important; color: var(--pinboard-selection-fg) !important; }

/* === patterns layer (tokens.patterns) === */
#search_query_field:focus, #banner_searchbox input[type="text"]:focus, #right_bar input#key:focus, #tweet_searchbox #search_query_field:focus {
  box-shadow: 0 0 0 2px var(--pinboard-accent-alpha) !important;
  outline: none !important;
}
.bookmark { border-bottom: 1px solid var(--pinboard-border) !important; }


/* === mode: dark (trigger: html.pbp-dark) === */
html.pbp-dark {
  --pinboard-bg: #1C1B1A;
  --pinboard-bg-surface: #282726;
  --pinboard-fg: #CECDC3;
  --pinboard-fg-strong: #CECDC3;
  --pinboard-muted: #575653;
  --pinboard-muted-soft: #878580;
  --pinboard-border: #403E3C;
  --pinboard-border-strong: #575653;
  --pinboard-border-soft: #343331;
  --pinboard-accent: #4385BE;
  --pinboard-accent-hover: #5DA0D0;
  --pinboard-accent-soft: #343331;
  --pinboard-accent-alpha: rgba(67,133,190,0.2);
  --pinboard-input-bg: #282726;
  --pinboard-private-bg: #2a2518;
  --pinboard-private-accent: #D0A215;
  --pinboard-selection-bg: #403E3C;
  --pinboard-selection-fg: #CECDC3;
  --pinboard-tag-bg: transparent;
  --pinboard-tag-fg: #D0A215;
  --pinboard-row-hover: #343331;
  --pinboard-destroy: #D14D41;
  --pinboard-btn-bg: #4385BE;
  --pinboard-btn-fg: #1C1B1A;
  --pinboard-success: #879A39;
  --pinboard-success-hover: #A7BA59;
  --pinboard-url-link-bg: #343331;
  --pinboard-url-link-fg: #D0A215;
  --pinboard-link-hover: #5DA0D0;
  --pinboard-link-visited: #4385BE;
  --pinboard-focus-ring: #4385BE;
  --pinboard-unread: #D14D41;
  --pinboard-btn-bg-hover: #5DA0D0;
  --pinboard-font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --pinboard-font-size-base: 13px;
  --pinboard-font-size-sm: 12px;
  --pinboard-font-size-lg: 15px;
  --pinboard-font-size-xs: 11px;
  --pinboard-line-height: 1.5;
  --pinboard-weight-body: 400;
  --pinboard-weight-heading: 700;
  --pinboard-space-unit: 4px;
  --pinboard-space-bookmark-gap: 12px;
  --pinboard-space-main-padding: 12px;
  --pinboard-space-sub-banner-y: 8px;
  --pinboard-space-right-bar-gap: 12px;
  --pinboard-space-form-gap: 8px;
  --pinboard-radius-sm: 3px;
  --pinboard-radius-md: 6px;
  --pinboard-radius-lg: 6px;
  --pinboard-border-width: 1px;
  --pinboard-border-style: solid;
  --pinboard-border-hairline: 1px dotted #403E3C;
}

/* === inline_base_rules (manifest.json §inline_base_rules) === */

/* override.tr-onmouseover-yellow — defeat inline style.background on row hover */
html.pbp-dark #right_bar table tr[onmouseover], html.pbp-dark #main_column table tr[onmouseover] {
  background: transparent !important;
}
html.pbp-dark #right_bar table tr[onmouseover]:hover, html.pbp-dark #main_column table tr[onmouseover]:hover {
  background: var(--pinboard-row-hover) !important;
}

/* override.bookmark-separator — tokenize "border-top:1px dotted #aaa" */
html.pbp-dark #main_column .bookmark[style*="border-top"] {
  border-top: var(--pinboard-border-hairline) !important;
}

/* override.private-bg — tokenize inline pink private bg + suppress pink border */
html.pbp-dark .bookmark.private[style*="background"], html.pbp-dark .bookmark[style*="#fff1f1"], html.pbp-dark .bookmark[style*="#fff4f4"] {
  background: var(--pinboard-private-bg) !important;
  border-top-color: transparent !important;
  border-right-color: transparent !important;
  border-left-color: transparent !important;
}

/* override.sub-banner-count-color — tokenize hardcoded #aa5511 */
html.pbp-dark #sub_banner [style*="#aa5511"], html.pbp-dark .bookmark_count[style*="color"] {
  color: var(--pinboard-accent) !important;
}

/* override.muted-aaa — tokenize widespread inline #aaa */
html.pbp-dark [style*="color:#aaa"], html.pbp-dark [style*="color: #aaa"] {
  color: var(--pinboard-muted) !important;
}

/* override.bundle-table-width — neutralize 830px hard width */
html.pbp-dark #main_column table[style*="width:830"] {
  width: 100% !important;
  max-width: 100% !important;
}

/* override.bundle-slot-input — tokenize inline dotted 20px inputs */
html.pbp-dark input[type="text"][name^="id_"][style*="border"] {
  border: var(--pinboard-border-width) solid var(--pinboard-border) !important;
  background: var(--pinboard-input-bg) !important;
  color: var(--pinboard-fg) !important;
  width: 32px !important;
}

/* override.per-page-active — tokenize active ffa pill */
html.pbp-dark table.per_page_widget [style*="background:#ffa"] {
  background: var(--pinboard-accent-alpha) !important;
  color: var(--pinboard-fg) !important;
}

/* override.generic-bgcolor — defensive against legacy HTML attr */
html.pbp-dark [bgcolor] { background-color: transparent !important; }

/* override.generic-html-color — defensive against legacy <font> */
html.pbp-dark font[color], html.pbp-dark font[size] { color: inherit !important; font-size: inherit !important; }

/* override.generic-fixed-width — defensive against layout tables */
html.pbp-dark table[width]:not([width="100%"]) { width: auto !important; max-width: 100% !important; }

/* === selection (applied globally; composers may override scoped) === */
html.pbp-dark ::selection { background: var(--pinboard-selection-bg); color: var(--pinboard-selection-fg); }
html.pbp-dark ::-moz-selection { background: var(--pinboard-selection-bg); color: var(--pinboard-selection-fg); }

/* === composer: classic-list-v2 — canonical surface inventory === */

/* ---- App shell typography (body#pinboard) ---- */
html.pbp-dark body#pinboard {
  background: var(--pinboard-bg) !important;
  color: var(--pinboard-fg) !important;
  font-family: var(--pinboard-font-family) !important;
  font-size: 13px !important;
  line-height: var(--pinboard-line-height) !important;
}
html.pbp-dark body#pinboard table, html.pbp-dark body#pinboard td, html.pbp-dark body#pinboard th, html.pbp-dark body#pinboard p, html.pbp-dark body#pinboard b, html.pbp-dark body#pinboard strong, html.pbp-dark body#pinboard label, html.pbp-dark body#pinboard span, html.pbp-dark body#pinboard li:not(.pin-ac li), html.pbp-dark body#pinboard dd, html.pbp-dark body#pinboard dt { color: inherit !important; }

/* ---- Popup / iframe frame (body:not(#pinboard)) ---- */
html.pbp-dark body:not(#pinboard) {
  background: var(--pinboard-bg) !important;
  color: var(--pinboard-fg) !important;
  font-family: var(--pinboard-font-family) !important;
}
html.pbp-dark body:not(#pinboard) table, html.pbp-dark body:not(#pinboard) td, html.pbp-dark body:not(#pinboard) p, html.pbp-dark body:not(#pinboard) label, html.pbp-dark body:not(#pinboard) span { color: inherit !important; }
html.pbp-dark body:not(#pinboard) #popup_header { background: transparent !important; color: var(--pinboard-fg) !important; }

/* ---- Banner & navigation ---- */
html.pbp-dark #banner { background: var(--pinboard-bg-surface) !important; border-color: var(--pinboard-border) !important; max-width: 1030px !important; box-sizing: border-box !important; }
html.pbp-dark #banner a, html.pbp-dark #top_menu a, html.pbp-dark .banner_username { color: var(--pinboard-accent) !important; }
html.pbp-dark #banner a:hover, html.pbp-dark #top_menu a:hover { color: var(--pinboard-link-hover) !important; }
html.pbp-dark #pinboard_name a { color: var(--pinboard-accent) !important; font-weight: var(--pinboard-weight-heading) !important; }
html.pbp-dark #sub_banner { background: var(--pinboard-bg-surface) !important; border-color: var(--pinboard-border) !important; }
html.pbp-dark #sub_banner a { color: var(--pinboard-muted) !important; }
html.pbp-dark #sub_banner a:hover, html.pbp-dark #sub_banner a.selected { color: var(--pinboard-accent) !important; }

/* ---- Search (banner + main) ---- */
html.pbp-dark #searchbox { margin-bottom: 12px !important; }
html.pbp-dark a.bundle { color: var(--pinboard-accent) !important; }
html.pbp-dark a.bundle:hover { color: var(--pinboard-link-hover) !important; }
html.pbp-dark #search_query_field, html.pbp-dark #banner_searchbox input[type="text"] {
  background: var(--pinboard-input-bg) !important;
  color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  box-sizing: border-box !important;
}
html.pbp-dark #search_query_field:focus, html.pbp-dark #banner_searchbox input[type="text"]:focus { border-color: var(--pinboard-accent) !important; outline: none !important; }
html.pbp-dark .search_button input[type="submit"] {
  background: var(--pinboard-accent) !important;
  color: var(--pinboard-btn-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-accent) !important;
  cursor: pointer !important;
}
html.pbp-dark .search_button input[type="submit"]:hover { background: var(--pinboard-link-hover) !important; }

/* ---- Bookmark list ---- */
html.pbp-dark .bookmark {
  background: transparent !important;
  display: flex !important;
  align-items: flex-start !important;
}
html.pbp-dark .bookmark { transition: box-shadow 0.2s ease !important; }
html.pbp-dark .bookmark .display { float: none !important; flex: 1 !important; width: auto !important; min-width: 0 !important; }
html.pbp-dark .star, html.pbp-dark .selected_star { margin-left: 0 !important; margin-right: 6px !important; float: none !important; flex-shrink: 0 !important; }
html.pbp-dark .star { color: var(--pinboard-border) !important; }
html.pbp-dark .selected_star { color: var(--pinboard-private-accent) !important; }

html.pbp-dark a.bookmark_title { color: var(--pinboard-accent) !important; font-size: 15px !important; text-decoration: none !important; font-weight: var(--pinboard-weight-heading) !important; }
html.pbp-dark a.bookmark_title:hover { color: var(--pinboard-link-hover) !important; text-decoration: underline !important; }
html.pbp-dark a.url_display, html.pbp-dark a.when, html.pbp-dark a.cached { color: var(--pinboard-muted-soft) !important; font-size: 11px !important; }
html.pbp-dark a.url_link {
  color: var(--pinboard-url-link-fg) !important;
  background: var(--pinboard-url-link-bg) !important;
  padding: 1px 6px !important;
  border-radius: var(--pinboard-radius-lg) !important;
  font-size: 11px !important;
}
html.pbp-dark .description { color: var(--pinboard-fg) !important; opacity: 0.85 !important; line-height: var(--pinboard-line-height) !important; }
html.pbp-dark .description blockquote { color: var(--pinboard-muted) !important; border-left: 3px solid var(--pinboard-accent-alpha) !important; padding-left: 10px !important; margin: 4px 0 !important; }

html.pbp-dark a.tag {
  color: var(--pinboard-tag-fg) !important;
  background: var(--pinboard-tag-bg) !important;
  padding: 1px 8px !important;
  border-radius: var(--pinboard-radius-lg) !important;
  font-size: 11px !important;
  text-decoration: none !important;
}
html.pbp-dark a.tag:hover { color: var(--pinboard-tag-fg) !important; background: var(--pinboard-accent-alpha) !important; text-decoration: none !important; }
html.pbp-dark a.tag.selected { color: var(--pinboard-destroy) !important; font-weight: bold !important; }
html.pbp-dark a.sort_order_selected { background: var(--pinboard-tag-bg) !important; color: var(--pinboard-accent) !important; }

html.pbp-dark a.unread { color: var(--pinboard-destroy) !important; font-weight: bold !important; }
html.pbp-dark .edit_links a, html.pbp-dark a.copy_link { color: var(--pinboard-muted-soft) !important; }
html.pbp-dark .edit_links a:hover { color: var(--pinboard-fg) !important; }
html.pbp-dark a.copy_link { color: var(--pinboard-accent) !important; }
html.pbp-dark a.delete, html.pbp-dark a.destroy { color: var(--pinboard-destroy) !important; }

/* ---- Private bookmarks ---- */
html.pbp-dark .bookmark.private, html.pbp-dark .bookmark.private[style*="background"] { background: var(--pinboard-private-bg) !important; box-shadow: inset 3px 0 0 var(--pinboard-private-accent) !important; border-top-color: transparent !important; border-right-color: transparent !important; border-left-color: transparent !important; }

/* ---- Right bar ---- */
html.pbp-dark #right_bar {
  background: var(--pinboard-bg-surface) !important;
  color: var(--pinboard-fg) !important;
  padding: var(--pinboard-space-right-bar-gap) !important;
  box-sizing: border-box !important;
  overflow: hidden !important;
  word-wrap: break-word !important;
}
html.pbp-dark #right_bar h3, html.pbp-dark #right_bar h4, html.pbp-dark #right_bar b { color: var(--pinboard-muted) !important; }
html.pbp-dark #right_bar a { color: var(--pinboard-accent) !important; }
html.pbp-dark #right_bar a:hover { color: var(--pinboard-link-hover) !important; }
html.pbp-dark #right_bar table tr[onmouseover] { background: transparent !important; }
html.pbp-dark #right_bar table tr[onmouseover]:hover { background: var(--pinboard-row-hover) !important; }
html.pbp-dark #right_bar table td a.tag { color: var(--pinboard-fg) !important; }
html.pbp-dark #right_bar table td a.delete { color: var(--pinboard-muted-soft) !important; font-size: 11px !important; opacity: 0.55 !important; transition: opacity 0.15s ease, color 0.15s ease !important; }
html.pbp-dark #right_bar table tr:hover td a.delete { color: var(--pinboard-destroy) !important; opacity: 1 !important; }
html.pbp-dark #right_bar input#key {
  background: var(--pinboard-input-bg) !important;
  color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-radius: var(--pinboard-radius-sm) !important;
  padding: 4px 8px !important;
  box-sizing: border-box !important;
  font-size: 12px !important;
}
html.pbp-dark #right_bar input#key:focus { border-color: var(--pinboard-accent) !important; box-shadow: 0 0 0 2px var(--pinboard-accent-alpha) !important; outline: none !important; }
html.pbp-dark #right_bar input[type="submit"] {
  background: var(--pinboard-success) !important;
  color: var(--pinboard-btn-fg) !important;
  border: none !important;
  border-radius: var(--pinboard-radius-sm) !important;
  padding: 4px 10px !important;
  margin-left: 6px !important;
  cursor: pointer !important;
  font-size: 12px !important;
  transition: background 0.15s ease !important;
}
html.pbp-dark #right_bar input[type="submit"]:hover { background: var(--pinboard-success-hover) !important; }

/* ---- Tag cloud ---- */
html.pbp-dark #tag_cloud { max-width: 100% !important; overflow-wrap: break-word !important; }
html.pbp-dark #tag_cloud a, html.pbp-dark #tag_cloud a.tag { color: var(--pinboard-accent) !important; }
html.pbp-dark #tag_cloud a:hover, html.pbp-dark #tag_cloud a.tag:hover { color: var(--pinboard-link-hover) !important; }
html.pbp-dark #tag_cloud_header a, html.pbp-dark a.tag_heading_selected { color: var(--pinboard-muted-soft) !important; }
html.pbp-dark #tag_cloud_header a:hover { color: var(--pinboard-accent) !important; }

/* ---- Tweets page searchbox ---- */
html.pbp-dark #tweet_searchbox { margin-bottom: 12px !important; }
html.pbp-dark #tweet_searchbox form { display: flex !important; flex-direction: column !important; gap: var(--pinboard-space-form-gap) !important; margin: 0 !important; }
html.pbp-dark #tweet_searchbox br { display: none !important; }
html.pbp-dark #tweet_searchbox #search_query_field {
  width: 100% !important; box-sizing: border-box !important;
  background: var(--pinboard-input-bg) !important; color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-radius: var(--pinboard-radius-sm) !important;
  padding: 6px 10px !important; font-size: 12px !important;
}
html.pbp-dark #tweet_searchbox #search_query_field:focus { border-color: var(--pinboard-accent) !important; box-shadow: 0 0 0 2px var(--pinboard-accent-alpha) !important; outline: none !important; }
html.pbp-dark #tweet_searchbox input[type="submit"] {
  background: var(--pinboard-success) !important; color: var(--pinboard-btn-fg) !important;
  border: none !important; border-radius: var(--pinboard-radius-sm) !important;
  padding: 5px 14px !important; cursor: pointer !important;
  font-size: 12px !important; align-self: flex-start !important;
  transition: background 0.15s ease !important;
}
html.pbp-dark #tweet_searchbox input[type="submit"]:hover { background: var(--pinboard-success-hover) !important; }

/* ---- Forms (global) ---- */
html.pbp-dark input[type="text"], html.pbp-dark input:not([type]), html.pbp-dark input[type="password"], html.pbp-dark textarea, html.pbp-dark select {
  background: var(--pinboard-input-bg) !important; color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  box-sizing: border-box !important; max-width: 100% !important;
}
html.pbp-dark input[type="text"]:focus, html.pbp-dark input:not([type]):focus, html.pbp-dark textarea:focus, html.pbp-dark select:focus { border-color: var(--pinboard-accent) !important; outline: none !important; }
html.pbp-dark input[type="submit"], html.pbp-dark input[type="button"] {
  background: var(--pinboard-accent) !important; color: var(--pinboard-btn-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-accent) !important;
  border-radius: var(--pinboard-radius-sm) !important;
  padding: 4px 12px !important;
  cursor: pointer !important;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease !important;
}
html.pbp-dark input[type="submit"]:hover, html.pbp-dark input[type="button"]:hover { background: var(--pinboard-link-hover) !important; border-color: var(--pinboard-link-hover) !important; }
html.pbp-dark input[type="reset"], html.pbp-dark input[type="reset"].reset, html.pbp-dark button[type="reset"] {
  background: var(--pinboard-bg-surface) !important; color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-radius: var(--pinboard-radius-sm) !important;
  padding: 4px 12px !important;
  cursor: pointer !important;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease !important;
}
html.pbp-dark input[type="reset"]:hover, html.pbp-dark input[type="reset"].reset:hover, html.pbp-dark button[type="reset"]:hover { background: var(--pinboard-row-hover) !important; border-color: var(--pinboard-accent) !important; color: var(--pinboard-accent) !important; }
html.pbp-dark input[type="checkbox"], html.pbp-dark input[type="radio"] { accent-color: var(--pinboard-accent) !important; }
html.pbp-dark .suggested_tag { color: var(--pinboard-success) !important; cursor: pointer !important; }
html.pbp-dark #edit_bookmark_form { background: var(--pinboard-bg-surface) !important; border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important; }

/* ---- Tag completion popup (Pin.Tags widget on /add/, edit-bookmark, note-add) ---- */
html.pbp-dark .pin-ac { z-index: 1000 !important; }
html.pbp-dark .pin-ac .bd {
  background: var(--pinboard-bg-surface) !important;
  color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-radius: var(--pinboard-radius-sm) !important;
  box-shadow: 0 2px 8px var(--pinboard-accent-alpha) !important;
}
html.pbp-dark .pin-ac li {
  background: transparent !important;
  color: var(--pinboard-fg) !important;
  padding: 4px 10px !important;
  font-size: 12px !important;
}
html.pbp-dark .pin-ac li:hover { background: var(--pinboard-accent-alpha) !important; color: var(--pinboard-fg) !important; cursor: pointer !important; }
html.pbp-dark .pin-ac .active { background: var(--pinboard-selection-bg) !important; color: var(--pinboard-selection-fg) !important; }

/* ---- Settings page ---- */
html.pbp-dark #settings_panel { background: var(--pinboard-bg-surface) !important; }
html.pbp-dark .settings_tabs { border-color: var(--pinboard-border) !important; }
html.pbp-dark .settings_tab { color: var(--pinboard-muted) !important; padding: 6px 12px !important; border-bottom-color: var(--pinboard-border) !important; }
html.pbp-dark .settings_tab a { color: inherit !important; text-decoration: none !important; }
html.pbp-dark .settings_tab:hover { color: var(--pinboard-accent) !important; }
html.pbp-dark .settings_tab_selected {
  color: var(--pinboard-accent) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-top: 2px solid var(--pinboard-accent) !important;
  border-bottom-color: var(--pinboard-bg-surface) !important;
  background: var(--pinboard-bg-surface) !important;
  font-weight: bold !important;
  margin-bottom: -1px !important;
}
html.pbp-dark .settings_tab_selected a { color: var(--pinboard-accent) !important; }
html.pbp-dark [class*="settings_tab_spacer"] { border-bottom-color: var(--pinboard-border) !important; }
html.pbp-dark .settings_heading { color: var(--pinboard-muted) !important; background: transparent !important; border-bottom: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important; padding-bottom: 6px !important; }
html.pbp-dark a.help { color: var(--pinboard-muted-soft) !important; background: var(--pinboard-accent-soft) !important; }
html.pbp-dark .email_secret { color: var(--pinboard-accent) !important; }
html.pbp-dark #settings_tab_panes { border: none !important; }
html.pbp-dark #settings_tab_panes table td { color: var(--pinboard-fg) !important; }

/* ---- Profile page ---- */
html.pbp-dark .service_box, html.pbp-dark .help_box {
  background: var(--pinboard-bg-surface) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-radius: var(--pinboard-radius-md) !important;
  padding: 16px !important;
  box-sizing: border-box !important;
  margin-bottom: 12px !important;
}
html.pbp-dark .service_box .service_box { border: none !important; padding: 0 !important; margin: 0 !important; background: transparent !important; border-radius: 0 !important; width: auto !important; box-sizing: border-box !important; }
html.pbp-dark #profile_left_column { margin-right: 20px !important; }
html.pbp-dark #profile_right_column { width: 430px !important; }
html.pbp-dark #profile_main_column h2, html.pbp-dark #profile_left_column h2, html.pbp-dark #profile_right_column h2 { color: var(--pinboard-muted) !important; }
html.pbp-dark #profile_main_column table td, html.pbp-dark #profile_right_column table td { color: var(--pinboard-fg) !important; }

/* ---- Notes ---- */
html.pbp-dark .note { border-bottom: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important; }
html.pbp-dark .note a { color: var(--pinboard-accent) !important; }
html.pbp-dark .note .note { border: none !important; padding: 0 !important; margin: 0 !important; background: transparent !important; border-radius: 0 !important; }
html.pbp-dark #note_right_column { background: var(--pinboard-bg-surface) !important; color: var(--pinboard-fg) !important; padding: 16px !important; border-left: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important; }

/* ---- Bulk edit ---- */
html.pbp-dark #bulk_top_bar, html.pbp-dark #bulk_edit_box { background: var(--pinboard-bg-surface) !important; border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important; color: var(--pinboard-fg) !important; }

/* ---- Save bookmark popup ---- */
html.pbp-dark #popup_header { background: var(--pinboard-bg-surface) !important; color: var(--pinboard-fg) !important; }
html.pbp-dark .formtable td { color: var(--pinboard-fg) !important; }
html.pbp-dark .bookmark_count, html.pbp-dark .bookmark_count_box { color: var(--pinboard-muted) !important; }
html.pbp-dark .user_navbar a { color: var(--pinboard-accent) !important; }
html.pbp-dark .rss_link, html.pbp-dark .rss_linkbox a { color: var(--pinboard-muted-soft) !important; }

/* ---- Bundles (P4-table) — /u/<user>/bundles/ ---- */
html.pbp-dark #main_column form[name="sort"] > table { width: 100% !important; max-width: 880px !important; border-collapse: separate !important; border-spacing: 0 4px !important; margin-top: 8px !important; }
html.pbp-dark #main_column form[name="sort"] table tr { background: transparent !important; border-radius: var(--pinboard-radius-md) !important; }
html.pbp-dark #main_column form[name="sort"] table tr:hover { background: var(--pinboard-row-hover) !important; }
html.pbp-dark #main_column form[name="sort"] table td { padding: 6px 10px !important; vertical-align: middle !important; border: none !important; }
html.pbp-dark #main_column form[name="sort"] table td[style*="text-align:right"] { min-width: 160px !important; padding-right: 14px !important; white-space: nowrap !important; }
html.pbp-dark #main_column form[name="sort"] table input[name^="id_"] {
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  background: var(--pinboard-input-bg) !important;
  color: var(--pinboard-fg) !important;
  width: 32px !important;
  border-radius: var(--pinboard-radius-sm) !important;
  text-align: center !important;
}
html.pbp-dark #main_column form[name="sort"] table input[name^="id_"]:focus { border-color: var(--pinboard-accent) !important; box-shadow: 0 0 0 2px var(--pinboard-accent-alpha) !important; outline: none !important; }
html.pbp-dark #main_column form[name="sort"] table a.bundle { font-weight: var(--pinboard-weight-heading) !important; font-style: normal !important; letter-spacing: 0.01em !important; padding: 2px 4px !important; border-radius: var(--pinboard-radius-sm) !important; }
html.pbp-dark #main_column form[name="sort"] table a[style*="color:#aaa"], html.pbp-dark #main_column form[name="sort"] table a[style*="color: #aaa"] { color: var(--pinboard-muted) !important; opacity: 1 !important; text-decoration: none !important; font-size: 12px !important; margin-left: 4px !important; }
html.pbp-dark #main_column form[name="sort"] table a[style*="color:#aaa"]:hover { color: var(--pinboard-accent) !important; text-decoration: underline !important; }
html.pbp-dark #main_column form[name="sort"] table td a.edit { color: var(--pinboard-muted) !important; opacity: 0.8 !important; transition: opacity 0.15s ease !important; }
html.pbp-dark #main_column form[name="sort"] table td a.destroy { color: var(--pinboard-destroy) !important; opacity: 0.85 !important; font-weight: var(--pinboard-weight-heading) !important; }
html.pbp-dark #main_column form[name="sort"] table tr:hover td a.edit { color: var(--pinboard-accent) !important; opacity: 1 !important; }
html.pbp-dark #main_column form[name="sort"] table tr:hover td a.destroy { opacity: 1 !important; }

/* ---- Pagination ---- */
html.pbp-dark .next_prev, html.pbp-dark .next_prev_widget a { color: var(--pinboard-accent) !important; }
html.pbp-dark .next_prev:hover, html.pbp-dark .next_prev_widget a:hover { color: var(--pinboard-link-hover) !important; }
html.pbp-dark #nextprev a.edit { color: var(--pinboard-muted-soft) !important; }

/* ---- Logged-out landing page (https://pinboard.in/) ---- */
html.pbp-dark #main_welcome, html.pbp-dark .homepage_quad { color: var(--pinboard-fg) !important; }
html.pbp-dark .homepage_heading { color: var(--pinboard-fg-strong) !important; font-weight: var(--pinboard-weight-heading) !important; }
html.pbp-dark .homepage_subheading { color: var(--pinboard-muted) !important; }
html.pbp-dark .signup_button, html.pbp-dark .signup_button[style*="background"] {
  background: var(--pinboard-btn-bg) !important;
  color: var(--pinboard-btn-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-btn-bg) !important;
  border-radius: var(--pinboard-radius-sm) !important;
  padding: 10px 16px !important;
  text-align: center !important;
  font-weight: var(--pinboard-weight-heading) !important;
  cursor: pointer !important;
  transition: background 0.15s ease, border-color 0.15s ease !important;
}
html.pbp-dark .signup_button:hover { background: var(--pinboard-btn-bg-hover) !important; border-color: var(--pinboard-btn-bg-hover) !important; }
html.pbp-dark #blurb_div { color: var(--pinboard-fg) !important; }
html.pbp-dark .blurb_column { color: var(--pinboard-fg) !important; }
html.pbp-dark #blurb_div a { text-decoration: none !important; color: var(--pinboard-fg) !important; display: block !important; }
html.pbp-dark .blurb_box {
  background: var(--pinboard-bg-surface) !important;
  color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-radius: var(--pinboard-radius-md) !important;
  padding: 12px 14px !important;
  margin-bottom: 10px !important;
  transition: background 0.15s ease, border-color 0.15s ease !important;
}
html.pbp-dark #blurb_div a:hover .blurb_box { background: var(--pinboard-row-hover) !important; border-color: var(--pinboard-accent-alpha) !important; }
html.pbp-dark .magazine_title { color: var(--pinboard-accent) !important; font-weight: var(--pinboard-weight-heading) !important; }
html.pbp-dark .blurb { color: var(--pinboard-fg) !important; opacity: 0.85 !important; }
html.pbp-dark #language_box { color: var(--pinboard-muted) !important; }
html.pbp-dark #language_box p { margin: 2px 0 !important; }
html.pbp-dark #language_box a { color: var(--pinboard-muted) !important; padding: 1px 6px !important; border-radius: var(--pinboard-radius-sm) !important; text-decoration: none !important; }
html.pbp-dark #language_box a:hover { color: var(--pinboard-accent) !important; background: var(--pinboard-accent-alpha) !important; }
html.pbp-dark #language_box a[style*="background:#ffa"], html.pbp-dark #language_box a[style*="background: #ffa"] { background: var(--pinboard-accent-alpha) !important; color: var(--pinboard-accent) !important; }
html.pbp-dark .nli { color: var(--pinboard-muted) !important; }
html.pbp-dark .nav_nli { color: var(--pinboard-accent) !important; text-decoration: none !important; }
html.pbp-dark .nav_nli:hover { color: var(--pinboard-link-hover) !important; }

/* ---- Footer / colophon ---- */
html.pbp-dark #footer, html.pbp-dark .colophon, html.pbp-dark .colophon a { color: var(--pinboard-muted-soft) !important; }

/* ---- Scrollbars (Webkit + Firefox standard) ---- */
html.pbp-dark html, html.pbp-dark body, html.pbp-dark textarea, html.pbp-dark .description, html.pbp-dark .pin-ac .bd {
  scrollbar-width: thin !important;
  scrollbar-color: var(--pinboard-muted) var(--pinboard-bg-surface) !important;
}
html.pbp-dark ::-webkit-scrollbar { width: 10px !important; height: 10px !important; }
html.pbp-dark ::-webkit-scrollbar-track { background: var(--pinboard-bg-surface) !important; border-left: 1px solid var(--pinboard-border) !important; }
html.pbp-dark ::-webkit-scrollbar-thumb { background: var(--pinboard-muted-soft) !important; border: 2px solid var(--pinboard-bg-surface) !important; border-radius: 6px !important; }
html.pbp-dark ::-webkit-scrollbar-thumb:hover { background: var(--pinboard-accent) !important; }
html.pbp-dark ::-webkit-scrollbar-corner { background: var(--pinboard-bg-surface) !important; }

/* ---- Global anchor fallbacks ---- */
html.pbp-dark a, html.pbp-dark a:link { color: var(--pinboard-accent) !important; }
html.pbp-dark a:hover { color: var(--pinboard-link-hover) !important; }
html.pbp-dark a:visited { color: var(--pinboard-link-visited) !important; }
html.pbp-dark a:focus-visible { outline: 2px solid var(--pinboard-focus-ring) !important; outline-offset: 2px !important; }
html.pbp-dark h2 { color: var(--pinboard-muted) !important; }
html.pbp-dark hr { border-color: var(--pinboard-border) !important; }

/* ---- Bundle slot input override: already in inline_base_rules — redundant here ---- */

/* ---- ::selection (also in _base but themes may want explicit) ---- */
html.pbp-dark ::selection { background: var(--pinboard-selection-bg) !important; color: var(--pinboard-selection-fg) !important; }
html.pbp-dark ::-moz-selection { background: var(--pinboard-selection-bg) !important; color: var(--pinboard-selection-fg) !important; }

/* === patterns layer (tokens.patterns) === */
html.pbp-dark #search_query_field:focus, html.pbp-dark #banner_searchbox input[type="text"]:focus, html.pbp-dark #right_bar input#key:focus, html.pbp-dark #tweet_searchbox #search_query_field:focus {
  box-shadow: 0 0 0 2px var(--pinboard-accent-alpha) !important;
  outline: none !important;
}
html.pbp-dark .bookmark { border-bottom: 1px solid var(--pinboard-border) !important; }


/* === theme overrides (tokens.overrides.css) === */
/* ======== overrides-patch for flexoki (auto-generated by tools/generate-overrides.mjs) ========
 * Restores shipped decls the composer's token-driven output doesn't match.
 */
#banner { border-radius: 6px !important; padding: 8px 16px !important; }
#search_query_field { width: 100% !important; }
.bookmark { padding: 12px 8px !important; }
.selected_star { color: #AD8301 !important; }
#sub_banner a { color: #5E409D !important; }
.search_button input[type="submit"] { border: none !important; }
a.url_display { color: #66800B !important; font-size: 12px !important; }
a.url_link { padding: 1px 5px !important; border-radius: 3px !important; }
.description { color: #6F6E69 !important; }
a.tag { font-size: 12px !important; }
a.tag:hover { color: #D0A215 !important; }
.edit_links a:hover { color: #6F6E69 !important; }
#right_bar h3 { color: #5E409D !important; }
#right_bar h4 { color: #5E409D !important; }
#right_bar b { color: #5E409D !important; }
#right_bar a { color: #5E409D !important; }
#right_bar a:hover { color: #8B7EC8 !important; }
a.bundle { color: #5E409D !important; }
a.bundle:hover { color: #8B7EC8 !important; }
#tag_cloud a { color: #5E409D !important; }
#tag_cloud a:hover { color: #8B7EC8 !important; }
#tag_cloud_header a:hover { color: #5E409D !important; }
#tag_cloud a.tag { color: #5E409D !important; }
#tag_cloud a.tag:hover { color: #CE5D97 !important; }
a.tag.selected { color: #CE5D97 !important; }
a.sort_order_selected { background: #DAD8CE !important; color: #5E409D !important; }
input[type="submit"] { border: none !important; }
input[type="button"] { border: none !important; }
.suggested_tag { color: #AD8301 !important; }
#settings_panel { background: #FFFCF0 !important; }
.settings_tab_selected { border-bottom-color: #FFFCF0 !important; background: #FFFCF0 !important; }
.settings_heading { color: #5E409D !important; }
#profile_main_column h2 { color: #5E409D !important; }
#profile_left_column h2 { color: #5E409D !important; }
#profile_right_column h2 { color: #5E409D !important; }
.user_navbar a { color: #5E409D !important; }
h2 { color: #5E409D !important; }
html.pbp-dark #sub_banner a { color: #8B7EC8 !important; }
html.pbp-dark #search_query_field { border-color: #403E3C !important; }
html.pbp-dark #banner_searchbox input[type="text"] { border-color: #403E3C !important; }
html.pbp-dark .bookmark { border-bottom-color: #343331 !important; }
html.pbp-dark a.url_display { color: #879A39 !important; }
html.pbp-dark a.url_link { background: #1C1B1A !important; }
html.pbp-dark .description { color: #878580 !important; }
html.pbp-dark .description blockquote { color: #878580 !important; border-left: 3px solid #403E3C !important; }
html.pbp-dark a.tag:hover { color: #E5B723 !important; }
html.pbp-dark a.cached { color: #575653 !important; }
html.pbp-dark a.when { color: #575653 !important; }
html.pbp-dark .edit_links a { color: #575653 !important; }
html.pbp-dark .edit_links a:hover { color: #878580 !important; }
html.pbp-dark #right_bar h3 { color: #8B7EC8 !important; }
html.pbp-dark #right_bar h4 { color: #8B7EC8 !important; }
html.pbp-dark #right_bar b { color: #8B7EC8 !important; }
html.pbp-dark #right_bar a { color: #8B7EC8 !important; }
html.pbp-dark #right_bar a:hover { color: #A699D0 !important; }
html.pbp-dark a.bundle { color: #8B7EC8 !important; }
html.pbp-dark a.bundle:hover { color: #A699D0 !important; }
html.pbp-dark #tag_cloud a { color: #8B7EC8 !important; }
html.pbp-dark #tag_cloud a:hover { color: #A699D0 !important; }
html.pbp-dark #tag_cloud_header a { color: #575653 !important; }
html.pbp-dark a.tag_heading_selected { color: #575653 !important; }
html.pbp-dark #tag_cloud_header a:hover { color: #8B7EC8 !important; }
html.pbp-dark #tag_cloud a.tag { color: #8B7EC8 !important; }
html.pbp-dark #tag_cloud a.tag:hover { color: #A699D0 !important; }
html.pbp-dark a.tag.selected { color: #CE5D97 !important; }
html.pbp-dark a.sort_order_selected { background: #343331 !important; color: #8B7EC8 !important; }
html.pbp-dark #nextprev a.edit { color: #575653 !important; }
html.pbp-dark input[type="text"] { border-color: #403E3C !important; }
html.pbp-dark input:not([type]) { border-color: #403E3C !important; }
html.pbp-dark input[type="password"] { border-color: #403E3C !important; }
html.pbp-dark textarea { border-color: #403E3C !important; }
html.pbp-dark select { border-color: #403E3C !important; }
html.pbp-dark #edit_bookmark_form { background: #343331 !important; border-color: #403E3C !important; }
html.pbp-dark .suggested_tag { color: #D0A215 !important; }
html.pbp-dark #settings_panel { background: #1C1B1A !important; color: #CECDC3 !important; }
html.pbp-dark .settings_tab { color: #878580 !important; }
html.pbp-dark .settings_tab_selected { border-bottom-color: #1C1B1A !important; background: #1C1B1A !important; }
html.pbp-dark .settings_heading { color: #8B7EC8 !important; }
html.pbp-dark a.help { color: #6B6963 !important; background: #282726 !important; }
html.pbp-dark .note { border-bottom-color: #343331 !important; }
html.pbp-dark .service_box { color: #CECDC3 !important; }
html.pbp-dark .help_box { color: #CECDC3 !important; }
html.pbp-dark #profile_main_column h2 { color: #8B7EC8 !important; }
html.pbp-dark #profile_left_column h2 { color: #8B7EC8 !important; }
html.pbp-dark #profile_right_column h2 { color: #8B7EC8 !important; }
html.pbp-dark #bulk_top_bar { background: #343331 !important; border-color: #403E3C !important; }
html.pbp-dark #bulk_edit_box { background: #343331 !important; border-color: #403E3C !important; }
html.pbp-dark .bookmark_count { color: #878580 !important; }
html.pbp-dark .bookmark_count_box { color: #878580 !important; }
html.pbp-dark .user_navbar a { color: #8B7EC8 !important; }
html.pbp-dark .rss_link { color: #575653 !important; }
html.pbp-dark .rss_linkbox a { color: #575653 !important; }
html.pbp-dark #footer { color: #575653 !important; }
html.pbp-dark .colophon { color: #575653 !important; }
html.pbp-dark .colophon a { color: #575653 !important; }
html.pbp-dark h2 { color: #8B7EC8 !important; }
#main_column form[name="sort"] table a.bundle { font-weight: 600 !important; }
#main_column form[name="sort"] table tr:hover { background: rgba(32,94,166,0.08) !important; }
#main_column form[name="sort"] table input[name^="id_"] { width: 38px !important; min-width: 38px !important; max-width: 38px !important; padding: 3px 4px !important; margin-right: 10px !important; font-size: 12px !important; line-height: 1.2 !important; border-radius: 4px !important; box-sizing: border-box !important; vertical-align: middle !important; background: #F2F0E5 !important; font-weight: 600 !important; }
#main_column form[name="sort"] table input[name^="id_"]:focus { box-shadow: 0 0 0 2px rgba(32,94,166,0.2) !important; }
#main_column form[name="sort"] table td a.edit { opacity: 0.75 !important; }
#main_column form[name="sort"] table td a.destroy { font-weight: 600 !important; }
html.pbp-dark #main_column form[name="sort"] table tr:hover { background: rgba(67,133,190,0.12) !important; }
html.pbp-dark #main_column form[name="sort"] table input[name^="id_"] { border-color: #282726 !important; background: #1C1B1A !important; }
html.pbp-dark #main_column form[name="sort"] table input[name^="id_"]:focus { box-shadow: 0 0 0 2px rgba(67,133,190,0.25) !important; }
html.pbp-dark #main_column form[name="sort"] table a[style*="color:#aaa"] { color: #878580 !important; }
html.pbp-dark #main_column form[name="sort"] table a[style*="color: #aaa"] { color: #878580 !important; }
html.pbp-dark #main_column form[name="sort"] table td a.edit { color: #878580 !important; }
#right_bar table tr[onmouseover]:hover { background: #e6e4d9 !important; }
#right_bar table td a.delete { color: #6F6E69 !important; }
#right_bar input#key { background: #F2F0E5 !important; border: 1px solid #CECDC3 !important; border-radius: 4px !important; }
#right_bar input#key:focus { border-color: #24837B !important; box-shadow: 0 0 0 2px rgba(36,131,123,0.2) !important; }
#right_bar input[type="submit"] { background: #24837B !important; border-radius: 4px !important; }
#right_bar input[type="submit"]:hover { background: #3AA29A !important; }
#tweet_searchbox #search_query_field { background: #F2F0E5 !important; border: 1px solid #CECDC3 !important; border-radius: 4px !important; font-size: 13px !important; }
#tweet_searchbox #search_query_field:focus { border-color: #24837B !important; box-shadow: 0 0 0 2px rgba(36,131,123,0.2) !important; }
#tweet_searchbox input[type="submit"] { background: #24837B !important; border-radius: 4px !important; }
#tweet_searchbox input[type="submit"]:hover { background: #3AA29A !important; }
html.pbp-dark #right_bar table tr[onmouseover]:hover { background: #282726 !important; }
html.pbp-dark #right_bar input#key { background: #1C1B1A !important; border-radius: 4px !important; }
html.pbp-dark #right_bar input#key:focus { border-color: #87D3C3 !important; box-shadow: 0 0 0 2px rgba(135,211,195,0.22) !important; }
html.pbp-dark #right_bar input[type="submit"] { background: #87D3C3 !important; border-radius: 4px !important; }
html.pbp-dark #right_bar input[type="submit"]:hover { background: #A8E4D5 !important; }
html.pbp-dark #tweet_searchbox #search_query_field { background: #1C1B1A !important; border-radius: 4px !important; font-size: 13px !important; }
html.pbp-dark #tweet_searchbox #search_query_field:focus { border-color: #87D3C3 !important; box-shadow: 0 0 0 2px rgba(135,211,195,0.22) !important; }
html.pbp-dark #tweet_searchbox input[type="submit"] { background: #87D3C3 !important; border-radius: 4px !important; }
html.pbp-dark #tweet_searchbox input[type="submit"]:hover { background: #A8E4D5 !important; }`
  },

  // ---- 7. Solarized Light ----
  "solarized-light": {
    name: "Solarized Light",
    desc: "Ethan Schoonover's warm light palette with precise color accents",
    css: `:root {
  --pinboard-bg: #fdf6e3;
  --pinboard-bg-surface: #eee8d5;
  --pinboard-fg: #657b83;
  --pinboard-fg-strong: #586e75;
  --pinboard-muted: #586e75;
  --pinboard-muted-soft: #93a1a1;
  --pinboard-border: #d6cdb5;
  --pinboard-border-strong: #93a1a1;
  --pinboard-border-soft: #d6cdb5;
  --pinboard-accent: #268bd2;
  --pinboard-accent-hover: #2aa198;
  --pinboard-accent-soft: #eee8d5;
  --pinboard-accent-alpha: rgba(38,139,210,0.25);
  --pinboard-input-bg: #fdf6e3;
  --pinboard-private-bg: #f0e0b8;
  --pinboard-private-accent: #b58900;
  --pinboard-selection-bg: #268bd2;
  --pinboard-selection-fg: #fdf6e3;
  --pinboard-tag-bg: transparent;
  --pinboard-tag-fg: #2aa198;
  --pinboard-row-hover: #eee8d5;
  --pinboard-destroy: #dc322f;
  --pinboard-btn-bg: #268bd2;
  --pinboard-btn-fg: #fdf6e3;
  --pinboard-success: #2aa198;
  --pinboard-success-hover: #268bd2;
  --pinboard-url-link-bg: #fdf6e3;
  --pinboard-url-link-fg: #b58900;
  --pinboard-link-hover: #2aa198;
  --pinboard-link-visited: #268bd2;
  --pinboard-focus-ring: #268bd2;
  --pinboard-unread: #dc322f;
  --pinboard-btn-bg-hover: #2aa198;
  --pinboard-font-family: "Inter", -apple-system, sans-serif;
  --pinboard-font-size-base: 13px;
  --pinboard-font-size-sm: 12px;
  --pinboard-font-size-lg: 15px;
  --pinboard-font-size-xs: 11px;
  --pinboard-line-height: 1.5;
  --pinboard-weight-body: 400;
  --pinboard-weight-heading: 700;
  --pinboard-space-unit: 4px;
  --pinboard-space-bookmark-gap: 6px;
  --pinboard-space-main-padding: 12px;
  --pinboard-space-sub-banner-y: 8px;
  --pinboard-space-right-bar-gap: 12px;
  --pinboard-space-form-gap: 8px;
  --pinboard-radius-sm: 2px;
  --pinboard-radius-md: 4px;
  --pinboard-radius-lg: 2px;
  --pinboard-border-width: 1px;
  --pinboard-border-style: solid;
  --pinboard-border-hairline: 1px dotted #d6cdb5;
}

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

/* override.generic-bgcolor — defensive against legacy HTML attr */
[bgcolor] { background-color: transparent !important; }

/* override.generic-html-color — defensive against legacy <font> */
font[color], font[size] { color: inherit !important; font-size: inherit !important; }

/* override.generic-fixed-width — defensive against layout tables */
table[width]:not([width="100%"]) { width: auto !important; max-width: 100% !important; }

/* === selection (applied globally; composers may override scoped) === */
::selection          { background: var(--pinboard-selection-bg); color: var(--pinboard-selection-fg); }
::-moz-selection     { background: var(--pinboard-selection-bg); color: var(--pinboard-selection-fg); }

/* === composer: classic-list-v2 — canonical surface inventory === */

/* ---- App shell typography (body#pinboard) ---- */
body#pinboard {
  background: var(--pinboard-bg) !important;
  color: var(--pinboard-fg) !important;
  font-family: var(--pinboard-font-family) !important;
  font-size: 13px !important;
  line-height: var(--pinboard-line-height) !important;
}
body#pinboard table, body#pinboard td, body#pinboard th,
body#pinboard p, body#pinboard b, body#pinboard strong,
body#pinboard label, body#pinboard span, body#pinboard li:not(.pin-ac li),
body#pinboard dd, body#pinboard dt { color: inherit !important; }

/* ---- Popup / iframe frame (body:not(#pinboard)) ---- */
body:not(#pinboard) {
  background: var(--pinboard-bg) !important;
  color: var(--pinboard-fg) !important;
  font-family: var(--pinboard-font-family) !important;
}
body:not(#pinboard) table, body:not(#pinboard) td,
body:not(#pinboard) p, body:not(#pinboard) label,
body:not(#pinboard) span { color: inherit !important; }
body:not(#pinboard) #popup_header { background: transparent !important; color: var(--pinboard-fg) !important; }

/* ---- Banner & navigation ---- */
#banner { background: var(--pinboard-bg-surface) !important; border-color: var(--pinboard-border) !important; max-width: 1030px !important; box-sizing: border-box !important; }
#banner a, #top_menu a, .banner_username { color: var(--pinboard-accent) !important; }
#banner a:hover, #top_menu a:hover { color: var(--pinboard-link-hover) !important; }
#pinboard_name a { color: var(--pinboard-accent) !important; font-weight: var(--pinboard-weight-heading) !important; }
#sub_banner { background: var(--pinboard-bg-surface) !important; border-color: var(--pinboard-border) !important; }
#sub_banner a { color: var(--pinboard-muted) !important; }
#sub_banner a:hover, #sub_banner a.selected { color: var(--pinboard-accent) !important; }

/* ---- Search (banner + main) ---- */
#searchbox { margin-bottom: 12px !important; }
a.bundle { color: var(--pinboard-accent) !important; }
a.bundle:hover { color: var(--pinboard-link-hover) !important; }
#search_query_field, #banner_searchbox input[type="text"] {
  background: var(--pinboard-input-bg) !important;
  color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  box-sizing: border-box !important;
}
#search_query_field:focus, #banner_searchbox input[type="text"]:focus { border-color: var(--pinboard-accent) !important; outline: none !important; }
.search_button input[type="submit"] {
  background: var(--pinboard-accent) !important;
  color: var(--pinboard-btn-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-accent) !important;
  cursor: pointer !important;
}
.search_button input[type="submit"]:hover { background: var(--pinboard-link-hover) !important; }

/* ---- Bookmark list ---- */
.bookmark {
  background: var(--pinboard-bg-surface) !important; border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important; border-radius: var(--pinboard-radius-md) !important; padding: 12px 16px !important; margin-bottom: 6px !important;
  display: flex !important;
  align-items: flex-start !important;
}
.bookmark { transition: box-shadow 0.2s ease !important; }
.bookmark .display { float: none !important; flex: 1 !important; width: auto !important; min-width: 0 !important; }
.star, .selected_star { margin-left: 0 !important; margin-right: 6px !important; float: none !important; flex-shrink: 0 !important; }
.star { color: var(--pinboard-border) !important; }
.selected_star { color: var(--pinboard-private-accent) !important; }

a.bookmark_title { color: var(--pinboard-accent) !important; font-size: 15px !important; text-decoration: none !important; font-weight: var(--pinboard-weight-heading) !important; }
a.bookmark_title:hover { color: var(--pinboard-link-hover) !important; text-decoration: underline !important; }
a.url_display, a.when, a.cached { color: var(--pinboard-muted-soft) !important; font-size: 11px !important; }
a.url_link {
  color: var(--pinboard-url-link-fg) !important;
  background: var(--pinboard-url-link-bg) !important;
  padding: 1px 6px !important;
  border-radius: var(--pinboard-radius-lg) !important;
  font-size: 11px !important;
}
.description { color: var(--pinboard-fg) !important; opacity: 0.85 !important; line-height: var(--pinboard-line-height) !important; }
.description blockquote { color: var(--pinboard-muted) !important; border-left: 3px solid var(--pinboard-accent-alpha) !important; padding-left: 10px !important; margin: 4px 0 !important; }

a.tag {
  color: var(--pinboard-tag-fg) !important;
  background: var(--pinboard-tag-bg) !important;
  padding: 1px 8px !important;
  border-radius: var(--pinboard-radius-lg) !important;
  font-size: 11px !important;
  text-decoration: none !important;
}
a.tag:hover { color: var(--pinboard-tag-fg) !important; background: var(--pinboard-accent-alpha) !important; text-decoration: none !important; }
a.tag.selected { color: var(--pinboard-destroy) !important; font-weight: bold !important; }
a.sort_order_selected { background: var(--pinboard-tag-bg) !important; color: var(--pinboard-accent) !important; }

a.unread { color: var(--pinboard-destroy) !important; font-weight: bold !important; }
.edit_links a, a.copy_link { color: var(--pinboard-muted-soft) !important; }
.edit_links a:hover { color: var(--pinboard-fg) !important; }
a.copy_link { color: var(--pinboard-accent) !important; }
a.delete, a.destroy { color: var(--pinboard-destroy) !important; }

/* ---- Private bookmarks ---- */
.bookmark.private,
.bookmark.private[style*="background"] { background: var(--pinboard-private-bg) !important; box-shadow: inset 3px 0 0 var(--pinboard-private-accent) !important; border-top-color: transparent !important; border-right-color: transparent !important; border-left-color: transparent !important; }

/* ---- Right bar ---- */
#right_bar {
  background: var(--pinboard-bg-surface) !important;
  color: var(--pinboard-fg) !important;
  padding: var(--pinboard-space-right-bar-gap) !important;
  box-sizing: border-box !important;
  overflow: hidden !important;
  word-wrap: break-word !important;
}
#right_bar h3, #right_bar h4, #right_bar b { color: var(--pinboard-muted) !important; }
#right_bar a { color: var(--pinboard-accent) !important; }
#right_bar a:hover { color: var(--pinboard-link-hover) !important; }
#right_bar table tr[onmouseover] { background: transparent !important; }
#right_bar table tr[onmouseover]:hover { background: var(--pinboard-row-hover) !important; }
#right_bar table td a.tag { color: var(--pinboard-fg) !important; }
#right_bar table td a.delete { color: var(--pinboard-muted-soft) !important; font-size: 11px !important; opacity: 0.55 !important; transition: opacity 0.15s ease, color 0.15s ease !important; }
#right_bar table tr:hover td a.delete { color: var(--pinboard-destroy) !important; opacity: 1 !important; }
#right_bar input#key {
  background: var(--pinboard-input-bg) !important;
  color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-radius: var(--pinboard-radius-sm) !important;
  padding: 4px 8px !important;
  box-sizing: border-box !important;
  font-size: 12px !important;
}
#right_bar input#key:focus { border-color: var(--pinboard-accent) !important; box-shadow: 0 0 0 2px var(--pinboard-accent-alpha) !important; outline: none !important; }
#right_bar input[type="submit"] {
  background: var(--pinboard-success) !important;
  color: var(--pinboard-btn-fg) !important;
  border: none !important;
  border-radius: var(--pinboard-radius-sm) !important;
  padding: 4px 10px !important;
  margin-left: 6px !important;
  cursor: pointer !important;
  font-size: 12px !important;
  transition: background 0.15s ease !important;
}
#right_bar input[type="submit"]:hover { background: var(--pinboard-success-hover) !important; }

/* ---- Tag cloud ---- */
#tag_cloud { max-width: 100% !important; overflow-wrap: break-word !important; }
#tag_cloud a, #tag_cloud a.tag { color: var(--pinboard-accent) !important; }
#tag_cloud a:hover, #tag_cloud a.tag:hover { color: var(--pinboard-link-hover) !important; }
#tag_cloud_header a, a.tag_heading_selected { color: var(--pinboard-muted-soft) !important; }
#tag_cloud_header a:hover { color: var(--pinboard-accent) !important; }

/* ---- Tweets page searchbox ---- */
#tweet_searchbox { margin-bottom: 12px !important; }
#tweet_searchbox form { display: flex !important; flex-direction: column !important; gap: var(--pinboard-space-form-gap) !important; margin: 0 !important; }
#tweet_searchbox br { display: none !important; }
#tweet_searchbox #search_query_field {
  width: 100% !important; box-sizing: border-box !important;
  background: var(--pinboard-input-bg) !important; color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-radius: var(--pinboard-radius-sm) !important;
  padding: 6px 10px !important; font-size: 12px !important;
}
#tweet_searchbox #search_query_field:focus { border-color: var(--pinboard-accent) !important; box-shadow: 0 0 0 2px var(--pinboard-accent-alpha) !important; outline: none !important; }
#tweet_searchbox input[type="submit"] {
  background: var(--pinboard-success) !important; color: var(--pinboard-btn-fg) !important;
  border: none !important; border-radius: var(--pinboard-radius-sm) !important;
  padding: 5px 14px !important; cursor: pointer !important;
  font-size: 12px !important; align-self: flex-start !important;
  transition: background 0.15s ease !important;
}
#tweet_searchbox input[type="submit"]:hover { background: var(--pinboard-success-hover) !important; }

/* ---- Forms (global) ---- */
input[type="text"], input:not([type]), input[type="password"], textarea, select {
  background: var(--pinboard-input-bg) !important; color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  box-sizing: border-box !important; max-width: 100% !important;
}
input[type="text"]:focus, input:not([type]):focus, textarea:focus, select:focus { border-color: var(--pinboard-accent) !important; outline: none !important; }
input[type="submit"], input[type="button"] {
  background: var(--pinboard-accent) !important; color: var(--pinboard-btn-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-accent) !important;
  border-radius: var(--pinboard-radius-sm) !important;
  padding: 4px 12px !important;
  cursor: pointer !important;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease !important;
}
input[type="submit"]:hover, input[type="button"]:hover { background: var(--pinboard-link-hover) !important; border-color: var(--pinboard-link-hover) !important; }
input[type="reset"], input[type="reset"].reset, button[type="reset"] {
  background: var(--pinboard-bg-surface) !important; color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-radius: var(--pinboard-radius-sm) !important;
  padding: 4px 12px !important;
  cursor: pointer !important;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease !important;
}
input[type="reset"]:hover, input[type="reset"].reset:hover, button[type="reset"]:hover { background: var(--pinboard-row-hover) !important; border-color: var(--pinboard-accent) !important; color: var(--pinboard-accent) !important; }
input[type="checkbox"], input[type="radio"] { accent-color: var(--pinboard-accent) !important; }
.suggested_tag { color: var(--pinboard-success) !important; cursor: pointer !important; }
#edit_bookmark_form { background: var(--pinboard-bg-surface) !important; border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important; }

/* ---- Tag completion popup (Pin.Tags widget on /add/, edit-bookmark, note-add) ---- */
.pin-ac { z-index: 1000 !important; }
.pin-ac .bd {
  background: var(--pinboard-bg-surface) !important;
  color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-radius: var(--pinboard-radius-sm) !important;
  box-shadow: 0 2px 8px var(--pinboard-accent-alpha) !important;
}
.pin-ac li {
  background: transparent !important;
  color: var(--pinboard-fg) !important;
  padding: 4px 10px !important;
  font-size: 12px !important;
}
.pin-ac li:hover { background: var(--pinboard-accent-alpha) !important; color: var(--pinboard-fg) !important; cursor: pointer !important; }
.pin-ac .active { background: var(--pinboard-selection-bg) !important; color: var(--pinboard-selection-fg) !important; }

/* ---- Settings page ---- */
#settings_panel { background: var(--pinboard-bg-surface) !important; }
.settings_tabs { border-color: var(--pinboard-border) !important; }
.settings_tab { color: var(--pinboard-muted) !important; padding: 6px 12px !important; border-bottom-color: var(--pinboard-border) !important; }
.settings_tab a { color: inherit !important; text-decoration: none !important; }
.settings_tab:hover { color: var(--pinboard-accent) !important; }
.settings_tab_selected {
  color: var(--pinboard-accent) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-top: 2px solid var(--pinboard-accent) !important;
  border-bottom-color: var(--pinboard-bg-surface) !important;
  background: var(--pinboard-bg-surface) !important;
  font-weight: bold !important;
  margin-bottom: -1px !important;
}
.settings_tab_selected a { color: var(--pinboard-accent) !important; }
[class*="settings_tab_spacer"] { border-bottom-color: var(--pinboard-border) !important; }
.settings_heading { color: var(--pinboard-muted) !important; background: transparent !important; border-bottom: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important; padding-bottom: 6px !important; }
a.help { color: var(--pinboard-muted-soft) !important; background: var(--pinboard-accent-soft) !important; }
.email_secret { color: var(--pinboard-accent) !important; }
#settings_tab_panes { border: none !important; }
#settings_tab_panes table td { color: var(--pinboard-fg) !important; }

/* ---- Profile page ---- */
.service_box, .help_box {
  background: var(--pinboard-bg-surface) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-radius: var(--pinboard-radius-md) !important;
  padding: 16px !important;
  box-sizing: border-box !important;
  margin-bottom: 12px !important;
}
.service_box .service_box { border: none !important; padding: 0 !important; margin: 0 !important; background: transparent !important; border-radius: 0 !important; width: auto !important; box-sizing: border-box !important; }
#profile_left_column { margin-right: 20px !important; }
#profile_right_column { width: 430px !important; }
#profile_main_column h2, #profile_left_column h2, #profile_right_column h2 { color: var(--pinboard-muted) !important; }
#profile_main_column table td, #profile_right_column table td { color: var(--pinboard-fg) !important; }

/* ---- Notes ---- */
.note { border-bottom: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important; }
.note a { color: var(--pinboard-accent) !important; }
.note .note { border: none !important; padding: 0 !important; margin: 0 !important; background: transparent !important; border-radius: 0 !important; }
#note_right_column { background: var(--pinboard-bg-surface) !important; color: var(--pinboard-fg) !important; padding: 16px !important; border-left: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important; }

/* ---- Bulk edit ---- */
#bulk_top_bar, #bulk_edit_box { background: var(--pinboard-bg-surface) !important; border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important; color: var(--pinboard-fg) !important; }

/* ---- Save bookmark popup ---- */
#popup_header { background: var(--pinboard-bg-surface) !important; color: var(--pinboard-fg) !important; }
.formtable td { color: var(--pinboard-fg) !important; }
.bookmark_count, .bookmark_count_box { color: var(--pinboard-muted) !important; }
.user_navbar a { color: var(--pinboard-accent) !important; }
.rss_link, .rss_linkbox a { color: var(--pinboard-muted-soft) !important; }

/* ---- Bundles (P4-table) — /u/<user>/bundles/ ---- */
#main_column form[name="sort"] > table { width: 100% !important; max-width: 880px !important; border-collapse: separate !important; border-spacing: 0 4px !important; margin-top: 8px !important; }
#main_column form[name="sort"] table tr { background: transparent !important; border-radius: var(--pinboard-radius-md) !important; }
#main_column form[name="sort"] table tr:hover { background: var(--pinboard-row-hover) !important; }
#main_column form[name="sort"] table td { padding: 6px 10px !important; vertical-align: middle !important; border: none !important; }
#main_column form[name="sort"] table td[style*="text-align:right"] { min-width: 160px !important; padding-right: 14px !important; white-space: nowrap !important; }
#main_column form[name="sort"] table input[name^="id_"] {
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  background: var(--pinboard-input-bg) !important;
  color: var(--pinboard-fg) !important;
  width: 32px !important;
  border-radius: var(--pinboard-radius-sm) !important;
  text-align: center !important;
}
#main_column form[name="sort"] table input[name^="id_"]:focus { border-color: var(--pinboard-accent) !important; box-shadow: 0 0 0 2px var(--pinboard-accent-alpha) !important; outline: none !important; }
#main_column form[name="sort"] table a.bundle { font-weight: var(--pinboard-weight-heading) !important; font-style: normal !important; letter-spacing: 0.01em !important; padding: 2px 4px !important; border-radius: var(--pinboard-radius-sm) !important; }
#main_column form[name="sort"] table a[style*="color:#aaa"],
#main_column form[name="sort"] table a[style*="color: #aaa"] { color: var(--pinboard-muted) !important; opacity: 1 !important; text-decoration: none !important; font-size: 12px !important; margin-left: 4px !important; }
#main_column form[name="sort"] table a[style*="color:#aaa"]:hover { color: var(--pinboard-accent) !important; text-decoration: underline !important; }
#main_column form[name="sort"] table td a.edit { color: var(--pinboard-muted) !important; opacity: 0.8 !important; transition: opacity 0.15s ease !important; }
#main_column form[name="sort"] table td a.destroy { color: var(--pinboard-destroy) !important; opacity: 0.85 !important; font-weight: var(--pinboard-weight-heading) !important; }
#main_column form[name="sort"] table tr:hover td a.edit { color: var(--pinboard-accent) !important; opacity: 1 !important; }
#main_column form[name="sort"] table tr:hover td a.destroy { opacity: 1 !important; }

/* ---- Pagination ---- */
.next_prev, .next_prev_widget a { color: var(--pinboard-accent) !important; }
.next_prev:hover, .next_prev_widget a:hover { color: var(--pinboard-link-hover) !important; }
#nextprev a.edit { color: var(--pinboard-muted-soft) !important; }

/* ---- Logged-out landing page (https://pinboard.in/) ---- */
#main_welcome, .homepage_quad { color: var(--pinboard-fg) !important; }
.homepage_heading { color: var(--pinboard-fg-strong) !important; font-weight: var(--pinboard-weight-heading) !important; }
.homepage_subheading { color: var(--pinboard-muted) !important; }
.signup_button,
.signup_button[style*="background"] {
  background: var(--pinboard-btn-bg) !important;
  color: var(--pinboard-btn-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-btn-bg) !important;
  border-radius: var(--pinboard-radius-sm) !important;
  padding: 10px 16px !important;
  text-align: center !important;
  font-weight: var(--pinboard-weight-heading) !important;
  cursor: pointer !important;
  transition: background 0.15s ease, border-color 0.15s ease !important;
}
.signup_button:hover { background: var(--pinboard-btn-bg-hover) !important; border-color: var(--pinboard-btn-bg-hover) !important; }
#blurb_div { color: var(--pinboard-fg) !important; }
.blurb_column { color: var(--pinboard-fg) !important; }
#blurb_div a { text-decoration: none !important; color: var(--pinboard-fg) !important; display: block !important; }
.blurb_box {
  background: var(--pinboard-bg-surface) !important;
  color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-radius: var(--pinboard-radius-md) !important;
  padding: 12px 14px !important;
  margin-bottom: 10px !important;
  transition: background 0.15s ease, border-color 0.15s ease !important;
}
#blurb_div a:hover .blurb_box { background: var(--pinboard-row-hover) !important; border-color: var(--pinboard-accent-alpha) !important; }
.magazine_title { color: var(--pinboard-accent) !important; font-weight: var(--pinboard-weight-heading) !important; }
.blurb { color: var(--pinboard-fg) !important; opacity: 0.85 !important; }
#language_box { color: var(--pinboard-muted) !important; }
#language_box p { margin: 2px 0 !important; }
#language_box a { color: var(--pinboard-muted) !important; padding: 1px 6px !important; border-radius: var(--pinboard-radius-sm) !important; text-decoration: none !important; }
#language_box a:hover { color: var(--pinboard-accent) !important; background: var(--pinboard-accent-alpha) !important; }
#language_box a[style*="background:#ffa"],
#language_box a[style*="background: #ffa"] { background: var(--pinboard-accent-alpha) !important; color: var(--pinboard-accent) !important; }
.nli { color: var(--pinboard-muted) !important; }
.nav_nli { color: var(--pinboard-accent) !important; text-decoration: none !important; }
.nav_nli:hover { color: var(--pinboard-link-hover) !important; }

/* ---- Footer / colophon ---- */
#footer, .colophon, .colophon a { color: var(--pinboard-muted-soft) !important; }

/* ---- Scrollbars (Webkit + Firefox standard) ---- */
html, body, textarea, .description, .pin-ac .bd {
  scrollbar-width: thin !important;
  scrollbar-color: var(--pinboard-muted) var(--pinboard-bg-surface) !important;
}
::-webkit-scrollbar { width: 10px !important; height: 10px !important; }
::-webkit-scrollbar-track { background: var(--pinboard-bg-surface) !important; border-left: 1px solid var(--pinboard-border) !important; }
::-webkit-scrollbar-thumb { background: var(--pinboard-muted-soft) !important; border: 2px solid var(--pinboard-bg-surface) !important; border-radius: 6px !important; }
::-webkit-scrollbar-thumb:hover { background: var(--pinboard-accent) !important; }
::-webkit-scrollbar-corner { background: var(--pinboard-bg-surface) !important; }

/* ---- Global anchor fallbacks ---- */
a, a:link { color: var(--pinboard-accent) !important; }
a:hover { color: var(--pinboard-link-hover) !important; }
a:visited { color: var(--pinboard-link-visited) !important; }
a:focus-visible { outline: 2px solid var(--pinboard-focus-ring) !important; outline-offset: 2px !important; }
h2 { color: var(--pinboard-muted) !important; }
hr { border-color: var(--pinboard-border) !important; }

/* ---- Bundle slot input override: already in inline_base_rules — redundant here ---- */

/* ---- ::selection (also in _base but themes may want explicit) ---- */
::selection { background: var(--pinboard-selection-bg) !important; color: var(--pinboard-selection-fg) !important; }
::-moz-selection { background: var(--pinboard-selection-bg) !important; color: var(--pinboard-selection-fg) !important; }

/* === patterns layer (tokens.patterns) === */
#search_query_field:focus, #banner_searchbox input[type="text"]:focus, #right_bar input#key:focus, #tweet_searchbox #search_query_field:focus {
  box-shadow: 0 0 0 2px var(--pinboard-accent-alpha) !important;
  outline: none !important;
}
.bookmark { border-bottom: 1px solid var(--pinboard-border) !important; }
.settings_heading { text-transform: uppercase !important; font-size: 12px !important; letter-spacing: 0.08em !important; }


/* === theme overrides (tokens.overrides.css) === */
/* ======== overrides-patch for solarized-light (auto-generated by tools/generate-overrides.mjs) ========
 * Restores shipped decls the composer's token-driven output doesn't match.
 */
body#pinboard { letter-spacing: 0.01em !important; }
#banner { border-radius: 4px !important; padding: 8px 16px !important; }
#search_query_field { width: 100% !important; }
.bookmark { padding: 12px 14px !important; border-radius: 2px !important; border-left: 2px solid transparent !important; }
body:not(#pinboard) { letter-spacing: 0.01em !important; }
a.bookmark_title { font-weight: 500 !important; }
a.url_display { color: #859900 !important; font-family: "Fira Code", "Cascadia Code", monospace !important; }
a.url_link { padding: 1px 5px !important; }
.description blockquote { border-left: 2px solid #268bd2 !important; }
a.tag { font-family: "Fira Code", "Cascadia Code", monospace !important; letter-spacing: 0.02em !important; }
a.tag:hover { color: #268bd2 !important; text-decoration: underline !important; }
a.when { font-family: "Fira Code", "Cascadia Code", monospace !important; }
.edit_links a:hover { color: #586e75 !important; }
a.tag.selected { color: #d33682 !important; }
a.sort_order_selected { background: #eee8d5 !important; }
.service_box { border-radius: 2px !important; }
.help_box { border-radius: 2px !important; }
#main_column form[name="sort"] table tr:hover { background: rgba(38,139,210,0.08) !important; }
#main_column form[name="sort"] table input[name^="id_"] { width: 38px !important; min-width: 38px !important; max-width: 38px !important; padding: 3px 4px !important; margin-right: 10px !important; font-size: 12px !important; line-height: 1.2 !important; border-radius: 3px !important; box-sizing: border-box !important; vertical-align: middle !important; border: 1px solid #93a1a1 !important; background: #eee8d5 !important; font-weight: 600 !important; }
#main_column form[name="sort"] table a.bundle { font-weight: 600 !important; letter-spacing: 0.02em !important; border-radius: 3px !important; }
#main_column form[name="sort"] table a[style*="color:#aaa"] { color: #93a1a1 !important; }
#main_column form[name="sort"] table a[style*="color: #aaa"] { color: #93a1a1 !important; }
#main_column form[name="sort"] table td a.edit { color: #93a1a1 !important; }
#main_column form[name="sort"] table td a.destroy { font-weight: 600 !important; }
#right_bar table td a.tag { color: #586e75 !important; }
#right_bar input#key { color: #586e75 !important; border: 1px solid #93a1a1 !important; border-radius: 4px !important; }
#right_bar input#key:focus { box-shadow: 0 0 0 2px rgba(38,139,210,0.2) !important; }
#right_bar input[type="submit"] { background: #268bd2 !important; border-radius: 4px !important; }
#right_bar input[type="submit"]:hover { background: #2aa198 !important; }
#tweet_searchbox #search_query_field { color: #586e75 !important; border: 1px solid #93a1a1 !important; border-radius: 4px !important; font-size: 13px !important; }
#tweet_searchbox #search_query_field:focus { box-shadow: 0 0 0 2px rgba(38,139,210,0.2) !important; }
#tweet_searchbox input[type="submit"] { background: #268bd2 !important; border-radius: 4px !important; }
#tweet_searchbox input[type="submit"]:hover { background: #2aa198 !important; }`
  },

  // ---- 8. Solarized Dark ----
  "solarized-dark": {
    name: "Solarized Dark",
    desc: "Ethan Schoonover's iconic dark palette with precise color accents",
    css: `:root {
  --pinboard-bg: #002b36;
  --pinboard-bg-surface: #073642;
  --pinboard-fg: #839496;
  --pinboard-fg-strong: #93a1a1;
  --pinboard-muted: #586e75;
  --pinboard-muted-soft: #586e75;
  --pinboard-border: #094b5a;
  --pinboard-border-strong: #586e75;
  --pinboard-border-soft: #094b5a;
  --pinboard-accent: #268bd2;
  --pinboard-accent-hover: #2aa198;
  --pinboard-accent-soft: #073642;
  --pinboard-accent-alpha: rgba(38,139,210,0.25);
  --pinboard-input-bg: #073642;
  --pinboard-private-bg: #1a2a10;
  --pinboard-private-accent: #b58900;
  --pinboard-selection-bg: #0a4a5a;
  --pinboard-selection-fg: #eee8d5;
  --pinboard-tag-bg: transparent;
  --pinboard-tag-fg: #2aa198;
  --pinboard-row-hover: #073642;
  --pinboard-destroy: #dc322f;
  --pinboard-btn-bg: #268bd2;
  --pinboard-btn-fg: #fdf6e3;
  --pinboard-success: #859900;
  --pinboard-success-hover: #2aa198;
  --pinboard-url-link-bg: #073642;
  --pinboard-url-link-fg: #b58900;
  --pinboard-link-hover: #2aa198;
  --pinboard-link-visited: #268bd2;
  --pinboard-focus-ring: #268bd2;
  --pinboard-unread: #dc322f;
  --pinboard-btn-bg-hover: #2aa198;
  --pinboard-font-family: "Inter", -apple-system, sans-serif;
  --pinboard-font-size-base: 13px;
  --pinboard-font-size-sm: 12px;
  --pinboard-font-size-lg: 15px;
  --pinboard-font-size-xs: 11px;
  --pinboard-line-height: 1.5;
  --pinboard-weight-body: 400;
  --pinboard-weight-heading: 700;
  --pinboard-space-unit: 4px;
  --pinboard-space-bookmark-gap: 6px;
  --pinboard-space-main-padding: 12px;
  --pinboard-space-sub-banner-y: 8px;
  --pinboard-space-right-bar-gap: 12px;
  --pinboard-space-form-gap: 8px;
  --pinboard-radius-sm: 2px;
  --pinboard-radius-md: 4px;
  --pinboard-radius-lg: 2px;
  --pinboard-border-width: 1px;
  --pinboard-border-style: solid;
  --pinboard-border-hairline: 1px dotted #094b5a;
}

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

/* override.generic-bgcolor — defensive against legacy HTML attr */
[bgcolor] { background-color: transparent !important; }

/* override.generic-html-color — defensive against legacy <font> */
font[color], font[size] { color: inherit !important; font-size: inherit !important; }

/* override.generic-fixed-width — defensive against layout tables */
table[width]:not([width="100%"]) { width: auto !important; max-width: 100% !important; }

/* === selection (applied globally; composers may override scoped) === */
::selection          { background: var(--pinboard-selection-bg); color: var(--pinboard-selection-fg); }
::-moz-selection     { background: var(--pinboard-selection-bg); color: var(--pinboard-selection-fg); }

/* === composer: classic-list-v2 — canonical surface inventory === */

/* ---- App shell typography (body#pinboard) ---- */
body#pinboard {
  background: var(--pinboard-bg) !important;
  color: var(--pinboard-fg) !important;
  font-family: var(--pinboard-font-family) !important;
  font-size: 13px !important;
  line-height: var(--pinboard-line-height) !important;
}
body#pinboard table, body#pinboard td, body#pinboard th,
body#pinboard p, body#pinboard b, body#pinboard strong,
body#pinboard label, body#pinboard span, body#pinboard li:not(.pin-ac li),
body#pinboard dd, body#pinboard dt { color: inherit !important; }

/* ---- Popup / iframe frame (body:not(#pinboard)) ---- */
body:not(#pinboard) {
  background: var(--pinboard-bg) !important;
  color: var(--pinboard-fg) !important;
  font-family: var(--pinboard-font-family) !important;
}
body:not(#pinboard) table, body:not(#pinboard) td,
body:not(#pinboard) p, body:not(#pinboard) label,
body:not(#pinboard) span { color: inherit !important; }
body:not(#pinboard) #popup_header { background: transparent !important; color: var(--pinboard-fg) !important; }

/* ---- Banner & navigation ---- */
#banner { background: var(--pinboard-bg-surface) !important; border-color: var(--pinboard-border) !important; max-width: 1030px !important; box-sizing: border-box !important; }
#banner a, #top_menu a, .banner_username { color: var(--pinboard-accent) !important; }
#banner a:hover, #top_menu a:hover { color: var(--pinboard-link-hover) !important; }
#pinboard_name a { color: var(--pinboard-accent) !important; font-weight: var(--pinboard-weight-heading) !important; }
#sub_banner { background: var(--pinboard-bg-surface) !important; border-color: var(--pinboard-border) !important; }
#sub_banner a { color: var(--pinboard-muted) !important; }
#sub_banner a:hover, #sub_banner a.selected { color: var(--pinboard-accent) !important; }

/* ---- Search (banner + main) ---- */
#searchbox { margin-bottom: 12px !important; }
a.bundle { color: var(--pinboard-accent) !important; }
a.bundle:hover { color: var(--pinboard-link-hover) !important; }
#search_query_field, #banner_searchbox input[type="text"] {
  background: var(--pinboard-input-bg) !important;
  color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  box-sizing: border-box !important;
}
#search_query_field:focus, #banner_searchbox input[type="text"]:focus { border-color: var(--pinboard-accent) !important; outline: none !important; }
.search_button input[type="submit"] {
  background: var(--pinboard-accent) !important;
  color: var(--pinboard-btn-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-accent) !important;
  cursor: pointer !important;
}
.search_button input[type="submit"]:hover { background: var(--pinboard-link-hover) !important; }

/* ---- Bookmark list ---- */
.bookmark {
  background: var(--pinboard-bg-surface) !important; border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important; border-radius: var(--pinboard-radius-md) !important; padding: 12px 16px !important; margin-bottom: 6px !important;
  display: flex !important;
  align-items: flex-start !important;
}
.bookmark { transition: box-shadow 0.2s ease !important; }
.bookmark .display { float: none !important; flex: 1 !important; width: auto !important; min-width: 0 !important; }
.star, .selected_star { margin-left: 0 !important; margin-right: 6px !important; float: none !important; flex-shrink: 0 !important; }
.star { color: var(--pinboard-border) !important; }
.selected_star { color: var(--pinboard-private-accent) !important; }

a.bookmark_title { color: var(--pinboard-accent) !important; font-size: 15px !important; text-decoration: none !important; font-weight: var(--pinboard-weight-heading) !important; }
a.bookmark_title:hover { color: var(--pinboard-link-hover) !important; text-decoration: underline !important; }
a.url_display, a.when, a.cached { color: var(--pinboard-muted-soft) !important; font-size: 11px !important; }
a.url_link {
  color: var(--pinboard-url-link-fg) !important;
  background: var(--pinboard-url-link-bg) !important;
  padding: 1px 6px !important;
  border-radius: var(--pinboard-radius-lg) !important;
  font-size: 11px !important;
}
.description { color: var(--pinboard-fg) !important; opacity: 0.85 !important; line-height: var(--pinboard-line-height) !important; }
.description blockquote { color: var(--pinboard-muted) !important; border-left: 3px solid var(--pinboard-accent-alpha) !important; padding-left: 10px !important; margin: 4px 0 !important; }

a.tag {
  color: var(--pinboard-tag-fg) !important;
  background: var(--pinboard-tag-bg) !important;
  padding: 1px 8px !important;
  border-radius: var(--pinboard-radius-lg) !important;
  font-size: 11px !important;
  text-decoration: none !important;
}
a.tag:hover { color: var(--pinboard-tag-fg) !important; background: var(--pinboard-accent-alpha) !important; text-decoration: none !important; }
a.tag.selected { color: var(--pinboard-destroy) !important; font-weight: bold !important; }
a.sort_order_selected { background: var(--pinboard-tag-bg) !important; color: var(--pinboard-accent) !important; }

a.unread { color: var(--pinboard-destroy) !important; font-weight: bold !important; }
.edit_links a, a.copy_link { color: var(--pinboard-muted-soft) !important; }
.edit_links a:hover { color: var(--pinboard-fg) !important; }
a.copy_link { color: var(--pinboard-accent) !important; }
a.delete, a.destroy { color: var(--pinboard-destroy) !important; }

/* ---- Private bookmarks ---- */
.bookmark.private,
.bookmark.private[style*="background"] { background: var(--pinboard-private-bg) !important; box-shadow: inset 3px 0 0 var(--pinboard-private-accent) !important; border-top-color: transparent !important; border-right-color: transparent !important; border-left-color: transparent !important; }

/* ---- Right bar ---- */
#right_bar {
  background: var(--pinboard-bg-surface) !important;
  color: var(--pinboard-fg) !important;
  padding: var(--pinboard-space-right-bar-gap) !important;
  box-sizing: border-box !important;
  overflow: hidden !important;
  word-wrap: break-word !important;
}
#right_bar h3, #right_bar h4, #right_bar b { color: var(--pinboard-muted) !important; }
#right_bar a { color: var(--pinboard-accent) !important; }
#right_bar a:hover { color: var(--pinboard-link-hover) !important; }
#right_bar table tr[onmouseover] { background: transparent !important; }
#right_bar table tr[onmouseover]:hover { background: var(--pinboard-row-hover) !important; }
#right_bar table td a.tag { color: var(--pinboard-fg) !important; }
#right_bar table td a.delete { color: var(--pinboard-muted-soft) !important; font-size: 11px !important; opacity: 0.55 !important; transition: opacity 0.15s ease, color 0.15s ease !important; }
#right_bar table tr:hover td a.delete { color: var(--pinboard-destroy) !important; opacity: 1 !important; }
#right_bar input#key {
  background: var(--pinboard-input-bg) !important;
  color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-radius: var(--pinboard-radius-sm) !important;
  padding: 4px 8px !important;
  box-sizing: border-box !important;
  font-size: 12px !important;
}
#right_bar input#key:focus { border-color: var(--pinboard-accent) !important; box-shadow: 0 0 0 2px var(--pinboard-accent-alpha) !important; outline: none !important; }
#right_bar input[type="submit"] {
  background: var(--pinboard-success) !important;
  color: var(--pinboard-btn-fg) !important;
  border: none !important;
  border-radius: var(--pinboard-radius-sm) !important;
  padding: 4px 10px !important;
  margin-left: 6px !important;
  cursor: pointer !important;
  font-size: 12px !important;
  transition: background 0.15s ease !important;
}
#right_bar input[type="submit"]:hover { background: var(--pinboard-success-hover) !important; }

/* ---- Tag cloud ---- */
#tag_cloud { max-width: 100% !important; overflow-wrap: break-word !important; }
#tag_cloud a, #tag_cloud a.tag { color: var(--pinboard-accent) !important; }
#tag_cloud a:hover, #tag_cloud a.tag:hover { color: var(--pinboard-link-hover) !important; }
#tag_cloud_header a, a.tag_heading_selected { color: var(--pinboard-muted-soft) !important; }
#tag_cloud_header a:hover { color: var(--pinboard-accent) !important; }

/* ---- Tweets page searchbox ---- */
#tweet_searchbox { margin-bottom: 12px !important; }
#tweet_searchbox form { display: flex !important; flex-direction: column !important; gap: var(--pinboard-space-form-gap) !important; margin: 0 !important; }
#tweet_searchbox br { display: none !important; }
#tweet_searchbox #search_query_field {
  width: 100% !important; box-sizing: border-box !important;
  background: var(--pinboard-input-bg) !important; color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-radius: var(--pinboard-radius-sm) !important;
  padding: 6px 10px !important; font-size: 12px !important;
}
#tweet_searchbox #search_query_field:focus { border-color: var(--pinboard-accent) !important; box-shadow: 0 0 0 2px var(--pinboard-accent-alpha) !important; outline: none !important; }
#tweet_searchbox input[type="submit"] {
  background: var(--pinboard-success) !important; color: var(--pinboard-btn-fg) !important;
  border: none !important; border-radius: var(--pinboard-radius-sm) !important;
  padding: 5px 14px !important; cursor: pointer !important;
  font-size: 12px !important; align-self: flex-start !important;
  transition: background 0.15s ease !important;
}
#tweet_searchbox input[type="submit"]:hover { background: var(--pinboard-success-hover) !important; }

/* ---- Forms (global) ---- */
input[type="text"], input:not([type]), input[type="password"], textarea, select {
  background: var(--pinboard-input-bg) !important; color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  box-sizing: border-box !important; max-width: 100% !important;
}
input[type="text"]:focus, input:not([type]):focus, textarea:focus, select:focus { border-color: var(--pinboard-accent) !important; outline: none !important; }
input[type="submit"], input[type="button"] {
  background: var(--pinboard-accent) !important; color: var(--pinboard-btn-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-accent) !important;
  border-radius: var(--pinboard-radius-sm) !important;
  padding: 4px 12px !important;
  cursor: pointer !important;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease !important;
}
input[type="submit"]:hover, input[type="button"]:hover { background: var(--pinboard-link-hover) !important; border-color: var(--pinboard-link-hover) !important; }
input[type="reset"], input[type="reset"].reset, button[type="reset"] {
  background: var(--pinboard-bg-surface) !important; color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-radius: var(--pinboard-radius-sm) !important;
  padding: 4px 12px !important;
  cursor: pointer !important;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease !important;
}
input[type="reset"]:hover, input[type="reset"].reset:hover, button[type="reset"]:hover { background: var(--pinboard-row-hover) !important; border-color: var(--pinboard-accent) !important; color: var(--pinboard-accent) !important; }
input[type="checkbox"], input[type="radio"] { accent-color: var(--pinboard-accent) !important; }
.suggested_tag { color: var(--pinboard-success) !important; cursor: pointer !important; }
#edit_bookmark_form { background: var(--pinboard-bg-surface) !important; border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important; }

/* ---- Tag completion popup (Pin.Tags widget on /add/, edit-bookmark, note-add) ---- */
.pin-ac { z-index: 1000 !important; }
.pin-ac .bd {
  background: var(--pinboard-bg-surface) !important;
  color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-radius: var(--pinboard-radius-sm) !important;
  box-shadow: 0 2px 8px var(--pinboard-accent-alpha) !important;
}
.pin-ac li {
  background: transparent !important;
  color: var(--pinboard-fg) !important;
  padding: 4px 10px !important;
  font-size: 12px !important;
}
.pin-ac li:hover { background: var(--pinboard-accent-alpha) !important; color: var(--pinboard-fg) !important; cursor: pointer !important; }
.pin-ac .active { background: var(--pinboard-selection-bg) !important; color: var(--pinboard-selection-fg) !important; }

/* ---- Settings page ---- */
#settings_panel { background: var(--pinboard-bg-surface) !important; }
.settings_tabs { border-color: var(--pinboard-border) !important; }
.settings_tab { color: var(--pinboard-muted) !important; padding: 6px 12px !important; border-bottom-color: var(--pinboard-border) !important; }
.settings_tab a { color: inherit !important; text-decoration: none !important; }
.settings_tab:hover { color: var(--pinboard-accent) !important; }
.settings_tab_selected {
  color: var(--pinboard-accent) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-top: 2px solid var(--pinboard-accent) !important;
  border-bottom-color: var(--pinboard-bg-surface) !important;
  background: var(--pinboard-bg-surface) !important;
  font-weight: bold !important;
  margin-bottom: -1px !important;
}
.settings_tab_selected a { color: var(--pinboard-accent) !important; }
[class*="settings_tab_spacer"] { border-bottom-color: var(--pinboard-border) !important; }
.settings_heading { color: var(--pinboard-muted) !important; background: transparent !important; border-bottom: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important; padding-bottom: 6px !important; }
a.help { color: var(--pinboard-muted-soft) !important; background: var(--pinboard-accent-soft) !important; }
.email_secret { color: var(--pinboard-accent) !important; }
#settings_tab_panes { border: none !important; }
#settings_tab_panes table td { color: var(--pinboard-fg) !important; }

/* ---- Profile page ---- */
.service_box, .help_box {
  background: var(--pinboard-bg-surface) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-radius: var(--pinboard-radius-md) !important;
  padding: 16px !important;
  box-sizing: border-box !important;
  margin-bottom: 12px !important;
}
.service_box .service_box { border: none !important; padding: 0 !important; margin: 0 !important; background: transparent !important; border-radius: 0 !important; width: auto !important; box-sizing: border-box !important; }
#profile_left_column { margin-right: 20px !important; }
#profile_right_column { width: 430px !important; }
#profile_main_column h2, #profile_left_column h2, #profile_right_column h2 { color: var(--pinboard-muted) !important; }
#profile_main_column table td, #profile_right_column table td { color: var(--pinboard-fg) !important; }

/* ---- Notes ---- */
.note { border-bottom: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important; }
.note a { color: var(--pinboard-accent) !important; }
.note .note { border: none !important; padding: 0 !important; margin: 0 !important; background: transparent !important; border-radius: 0 !important; }
#note_right_column { background: var(--pinboard-bg-surface) !important; color: var(--pinboard-fg) !important; padding: 16px !important; border-left: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important; }

/* ---- Bulk edit ---- */
#bulk_top_bar, #bulk_edit_box { background: var(--pinboard-bg-surface) !important; border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important; color: var(--pinboard-fg) !important; }

/* ---- Save bookmark popup ---- */
#popup_header { background: var(--pinboard-bg-surface) !important; color: var(--pinboard-fg) !important; }
.formtable td { color: var(--pinboard-fg) !important; }
.bookmark_count, .bookmark_count_box { color: var(--pinboard-muted) !important; }
.user_navbar a { color: var(--pinboard-accent) !important; }
.rss_link, .rss_linkbox a { color: var(--pinboard-muted-soft) !important; }

/* ---- Bundles (P4-table) — /u/<user>/bundles/ ---- */
#main_column form[name="sort"] > table { width: 100% !important; max-width: 880px !important; border-collapse: separate !important; border-spacing: 0 4px !important; margin-top: 8px !important; }
#main_column form[name="sort"] table tr { background: transparent !important; border-radius: var(--pinboard-radius-md) !important; }
#main_column form[name="sort"] table tr:hover { background: var(--pinboard-row-hover) !important; }
#main_column form[name="sort"] table td { padding: 6px 10px !important; vertical-align: middle !important; border: none !important; }
#main_column form[name="sort"] table td[style*="text-align:right"] { min-width: 160px !important; padding-right: 14px !important; white-space: nowrap !important; }
#main_column form[name="sort"] table input[name^="id_"] {
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  background: var(--pinboard-input-bg) !important;
  color: var(--pinboard-fg) !important;
  width: 32px !important;
  border-radius: var(--pinboard-radius-sm) !important;
  text-align: center !important;
}
#main_column form[name="sort"] table input[name^="id_"]:focus { border-color: var(--pinboard-accent) !important; box-shadow: 0 0 0 2px var(--pinboard-accent-alpha) !important; outline: none !important; }
#main_column form[name="sort"] table a.bundle { font-weight: var(--pinboard-weight-heading) !important; font-style: normal !important; letter-spacing: 0.01em !important; padding: 2px 4px !important; border-radius: var(--pinboard-radius-sm) !important; }
#main_column form[name="sort"] table a[style*="color:#aaa"],
#main_column form[name="sort"] table a[style*="color: #aaa"] { color: var(--pinboard-muted) !important; opacity: 1 !important; text-decoration: none !important; font-size: 12px !important; margin-left: 4px !important; }
#main_column form[name="sort"] table a[style*="color:#aaa"]:hover { color: var(--pinboard-accent) !important; text-decoration: underline !important; }
#main_column form[name="sort"] table td a.edit { color: var(--pinboard-muted) !important; opacity: 0.8 !important; transition: opacity 0.15s ease !important; }
#main_column form[name="sort"] table td a.destroy { color: var(--pinboard-destroy) !important; opacity: 0.85 !important; font-weight: var(--pinboard-weight-heading) !important; }
#main_column form[name="sort"] table tr:hover td a.edit { color: var(--pinboard-accent) !important; opacity: 1 !important; }
#main_column form[name="sort"] table tr:hover td a.destroy { opacity: 1 !important; }

/* ---- Pagination ---- */
.next_prev, .next_prev_widget a { color: var(--pinboard-accent) !important; }
.next_prev:hover, .next_prev_widget a:hover { color: var(--pinboard-link-hover) !important; }
#nextprev a.edit { color: var(--pinboard-muted-soft) !important; }

/* ---- Logged-out landing page (https://pinboard.in/) ---- */
#main_welcome, .homepage_quad { color: var(--pinboard-fg) !important; }
.homepage_heading { color: var(--pinboard-fg-strong) !important; font-weight: var(--pinboard-weight-heading) !important; }
.homepage_subheading { color: var(--pinboard-muted) !important; }
.signup_button,
.signup_button[style*="background"] {
  background: var(--pinboard-btn-bg) !important;
  color: var(--pinboard-btn-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-btn-bg) !important;
  border-radius: var(--pinboard-radius-sm) !important;
  padding: 10px 16px !important;
  text-align: center !important;
  font-weight: var(--pinboard-weight-heading) !important;
  cursor: pointer !important;
  transition: background 0.15s ease, border-color 0.15s ease !important;
}
.signup_button:hover { background: var(--pinboard-btn-bg-hover) !important; border-color: var(--pinboard-btn-bg-hover) !important; }
#blurb_div { color: var(--pinboard-fg) !important; }
.blurb_column { color: var(--pinboard-fg) !important; }
#blurb_div a { text-decoration: none !important; color: var(--pinboard-fg) !important; display: block !important; }
.blurb_box {
  background: var(--pinboard-bg-surface) !important;
  color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-radius: var(--pinboard-radius-md) !important;
  padding: 12px 14px !important;
  margin-bottom: 10px !important;
  transition: background 0.15s ease, border-color 0.15s ease !important;
}
#blurb_div a:hover .blurb_box { background: var(--pinboard-row-hover) !important; border-color: var(--pinboard-accent-alpha) !important; }
.magazine_title { color: var(--pinboard-accent) !important; font-weight: var(--pinboard-weight-heading) !important; }
.blurb { color: var(--pinboard-fg) !important; opacity: 0.85 !important; }
#language_box { color: var(--pinboard-muted) !important; }
#language_box p { margin: 2px 0 !important; }
#language_box a { color: var(--pinboard-muted) !important; padding: 1px 6px !important; border-radius: var(--pinboard-radius-sm) !important; text-decoration: none !important; }
#language_box a:hover { color: var(--pinboard-accent) !important; background: var(--pinboard-accent-alpha) !important; }
#language_box a[style*="background:#ffa"],
#language_box a[style*="background: #ffa"] { background: var(--pinboard-accent-alpha) !important; color: var(--pinboard-accent) !important; }
.nli { color: var(--pinboard-muted) !important; }
.nav_nli { color: var(--pinboard-accent) !important; text-decoration: none !important; }
.nav_nli:hover { color: var(--pinboard-link-hover) !important; }

/* ---- Footer / colophon ---- */
#footer, .colophon, .colophon a { color: var(--pinboard-muted-soft) !important; }

/* ---- Scrollbars (Webkit + Firefox standard) ---- */
html, body, textarea, .description, .pin-ac .bd {
  scrollbar-width: thin !important;
  scrollbar-color: var(--pinboard-muted) var(--pinboard-bg-surface) !important;
}
::-webkit-scrollbar { width: 10px !important; height: 10px !important; }
::-webkit-scrollbar-track { background: var(--pinboard-bg-surface) !important; border-left: 1px solid var(--pinboard-border) !important; }
::-webkit-scrollbar-thumb { background: var(--pinboard-muted-soft) !important; border: 2px solid var(--pinboard-bg-surface) !important; border-radius: 6px !important; }
::-webkit-scrollbar-thumb:hover { background: var(--pinboard-accent) !important; }
::-webkit-scrollbar-corner { background: var(--pinboard-bg-surface) !important; }

/* ---- Global anchor fallbacks ---- */
a, a:link { color: var(--pinboard-accent) !important; }
a:hover { color: var(--pinboard-link-hover) !important; }
a:visited { color: var(--pinboard-link-visited) !important; }
a:focus-visible { outline: 2px solid var(--pinboard-focus-ring) !important; outline-offset: 2px !important; }
h2 { color: var(--pinboard-muted) !important; }
hr { border-color: var(--pinboard-border) !important; }

/* ---- Bundle slot input override: already in inline_base_rules — redundant here ---- */

/* ---- ::selection (also in _base but themes may want explicit) ---- */
::selection { background: var(--pinboard-selection-bg) !important; color: var(--pinboard-selection-fg) !important; }
::-moz-selection { background: var(--pinboard-selection-bg) !important; color: var(--pinboard-selection-fg) !important; }

/* === patterns layer (tokens.patterns) === */
#search_query_field:focus, #banner_searchbox input[type="text"]:focus, #right_bar input#key:focus, #tweet_searchbox #search_query_field:focus {
  box-shadow: 0 0 0 2px var(--pinboard-accent-alpha) !important;
  outline: none !important;
}
.bookmark { border-bottom: 1px solid var(--pinboard-border) !important; }
.settings_heading { text-transform: uppercase !important; font-size: 12px !important; letter-spacing: 0.08em !important; }


/* === theme overrides (tokens.overrides.css) === */
/* ======== overrides-patch for solarized-dark (auto-generated by tools/generate-overrides.mjs) ========
 * Restores shipped decls the composer's token-driven output doesn't match.
 */
body#pinboard { letter-spacing: 0.01em !important; }
#banner { border-radius: 4px !important; padding: 8px 16px !important; }
#search_query_field { width: 100% !important; background: #002b36 !important; }
.bookmark { padding: 12px 14px !important; border-radius: 2px !important; border-left: 2px solid transparent !important; }
body:not(#pinboard) { letter-spacing: 0.01em !important; }
#sub_banner a { color: #93a1a1 !important; }
#banner_searchbox input[type="text"] { background: #002b36 !important; }
#search_query_field:focus { background: #073642 !important; }
#banner_searchbox input[type="text"]:focus { background: #073642 !important; }
.search_button input[type="submit"] { text-transform: uppercase !important; font-size: 11px !important; letter-spacing: 0.05em !important; }
a.bookmark_title { font-weight: 500 !important; }
a.url_display { color: #859900 !important; font-family: "Fira Code", "Cascadia Code", monospace !important; }
a.url_link { background: #002b36 !important; padding: 1px 5px !important; }
.description { opacity: 0.8 !important; }
.description blockquote { color: #93a1a1 !important; border-left: 2px solid #268bd2 !important; }
a.tag { font-family: "Fira Code", "Cascadia Code", monospace !important; letter-spacing: 0.02em !important; }
a.tag:hover { color: #268bd2 !important; text-decoration: underline !important; }
a.when { font-family: "Fira Code", "Cascadia Code", monospace !important; }
.edit_links a:hover { color: #93a1a1 !important; }
#right_bar h3 { color: #93a1a1 !important; }
#right_bar h4 { color: #93a1a1 !important; }
#right_bar b { color: #93a1a1 !important; }
a.tag.selected { color: #d33682 !important; }
a.sort_order_selected { background: #073642 !important; }
.suggested_tag { color: #2aa198 !important; }
.settings_tab { color: #93a1a1 !important; }
.settings_heading { color: #93a1a1 !important; }
.service_box { border-radius: 2px !important; }
.help_box { border-radius: 2px !important; }
#profile_main_column h2 { color: #93a1a1 !important; }
#profile_left_column h2 { color: #93a1a1 !important; }
#profile_right_column h2 { color: #93a1a1 !important; }
.bookmark_count { color: #93a1a1 !important; }
.bookmark_count_box { color: #93a1a1 !important; }
h2 { color: #93a1a1 !important; }
#main_column form[name="sort"] table tr:hover { background: rgba(38,139,210,0.1) !important; }
#main_column form[name="sort"] table input[name^="id_"] { width: 38px !important; min-width: 38px !important; max-width: 38px !important; padding: 3px 4px !important; margin-right: 10px !important; font-size: 12px !important; line-height: 1.2 !important; border-radius: 3px !important; box-sizing: border-box !important; vertical-align: middle !important; border: 1px solid #586e75 !important; font-weight: 600 !important; }
#main_column form[name="sort"] table input[name^="id_"]:focus { box-shadow: 0 0 0 2px rgba(38,139,210,0.3) !important; }
#main_column form[name="sort"] table a.bundle { font-weight: 600 !important; letter-spacing: 0.02em !important; border-radius: 3px !important; }
#main_column form[name="sort"] table td a.destroy { font-weight: 600 !important; }
#right_bar table td a.tag { color: #93a1a1 !important; }
#right_bar input#key { background: #002b36 !important; color: #93a1a1 !important; border: 1px solid #586e75 !important; border-radius: 4px !important; }
#right_bar input[type="submit"] { background: #268bd2 !important; border-radius: 4px !important; }
#tweet_searchbox #search_query_field { background: #002b36 !important; color: #93a1a1 !important; border: 1px solid #586e75 !important; border-radius: 4px !important; font-size: 13px !important; }
#tweet_searchbox input[type="submit"] { background: #268bd2 !important; border-radius: 4px !important; }`
  },

  // ---- 9. Catppuccin Latte ----
  "catppuccin-latte": {
    name: "Catppuccin Latte",
    desc: "Soothing pastel light theme from the Catppuccin palette",
    css: `:root {
  --pinboard-bg: #eff1f5;
  --pinboard-bg-surface: #e6e9ef;
  --pinboard-fg: #4c4f69;
  --pinboard-fg-strong: #6c6f85;
  --pinboard-muted: #6c6f85;
  --pinboard-muted-soft: #9ca0b0;
  --pinboard-border: #ccd0da;
  --pinboard-border-strong: #8c8fa1;
  --pinboard-border-soft: #bcc0cc;
  --pinboard-accent: #1e66f5;
  --pinboard-accent-hover: #179299;
  --pinboard-accent-soft: #dce0e8;
  --pinboard-accent-alpha: rgba(30,102,245,0.25);
  --pinboard-input-bg: #eff1f5;
  --pinboard-private-bg: #f0e6d0;
  --pinboard-private-accent: #df8e1d;
  --pinboard-selection-bg: #7287fd;
  --pinboard-selection-fg: #eff1f5;
  --pinboard-tag-bg: #dce0e8;
  --pinboard-tag-fg: #179299;
  --pinboard-row-hover: #ccd0da;
  --pinboard-destroy: #d20f39;
  --pinboard-btn-bg: #1e66f5;
  --pinboard-btn-fg: #eff1f5;
  --pinboard-success: #40a02b;
  --pinboard-success-hover: #179299;
  --pinboard-url-link-bg: #eff1f5;
  --pinboard-url-link-fg: #df8e1d;
  --pinboard-link-hover: #179299;
  --pinboard-link-visited: #8839ef;
  --pinboard-focus-ring: #1e66f5;
  --pinboard-unread: #d20f39;
  --pinboard-btn-bg-hover: #179299;
  --pinboard-font-family: "Nunito", "Inter", -apple-system, sans-serif;
  --pinboard-font-size-base: 13px;
  --pinboard-font-size-sm: 12px;
  --pinboard-font-size-lg: 15px;
  --pinboard-font-size-xs: 11px;
  --pinboard-line-height: 1.6;
  --pinboard-weight-body: 400;
  --pinboard-weight-heading: 700;
  --pinboard-space-unit: 4px;
  --pinboard-space-bookmark-gap: 8px;
  --pinboard-space-main-padding: 12px;
  --pinboard-space-sub-banner-y: 8px;
  --pinboard-space-right-bar-gap: 12px;
  --pinboard-space-form-gap: 8px;
  --pinboard-radius-sm: 8px;
  --pinboard-radius-md: 10px;
  --pinboard-radius-lg: 12px;
  --pinboard-border-width: 1px;
  --pinboard-border-style: solid;
  --pinboard-border-hairline: 1px dotted #ccd0da;
}

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

/* override.generic-bgcolor — defensive against legacy HTML attr */
[bgcolor] { background-color: transparent !important; }

/* override.generic-html-color — defensive against legacy <font> */
font[color], font[size] { color: inherit !important; font-size: inherit !important; }

/* override.generic-fixed-width — defensive against layout tables */
table[width]:not([width="100%"]) { width: auto !important; max-width: 100% !important; }

/* === selection (applied globally; composers may override scoped) === */
::selection          { background: var(--pinboard-selection-bg); color: var(--pinboard-selection-fg); }
::-moz-selection     { background: var(--pinboard-selection-bg); color: var(--pinboard-selection-fg); }

/* === composer: classic-list-v2 — canonical surface inventory === */

/* ---- App shell typography (body#pinboard) ---- */
body#pinboard {
  background: var(--pinboard-bg) !important;
  color: var(--pinboard-fg) !important;
  font-family: var(--pinboard-font-family) !important;
  font-size: 13px !important;
  line-height: var(--pinboard-line-height) !important;
}
body#pinboard table, body#pinboard td, body#pinboard th,
body#pinboard p, body#pinboard b, body#pinboard strong,
body#pinboard label, body#pinboard span, body#pinboard li:not(.pin-ac li),
body#pinboard dd, body#pinboard dt { color: inherit !important; }

/* ---- Popup / iframe frame (body:not(#pinboard)) ---- */
body:not(#pinboard) {
  background: var(--pinboard-bg) !important;
  color: var(--pinboard-fg) !important;
  font-family: var(--pinboard-font-family) !important;
}
body:not(#pinboard) table, body:not(#pinboard) td,
body:not(#pinboard) p, body:not(#pinboard) label,
body:not(#pinboard) span { color: inherit !important; }
body:not(#pinboard) #popup_header { background: transparent !important; color: var(--pinboard-fg) !important; }

/* ---- Banner & navigation ---- */
#banner { background: var(--pinboard-bg-surface) !important; border-color: var(--pinboard-border) !important; max-width: 1030px !important; box-sizing: border-box !important; }
#banner a, #top_menu a, .banner_username { color: var(--pinboard-accent) !important; }
#banner a:hover, #top_menu a:hover { color: var(--pinboard-link-hover) !important; }
#pinboard_name a { color: var(--pinboard-accent) !important; font-weight: var(--pinboard-weight-heading) !important; }
#sub_banner { background: var(--pinboard-bg-surface) !important; border-color: var(--pinboard-border) !important; }
#sub_banner a { color: var(--pinboard-muted) !important; }
#sub_banner a:hover, #sub_banner a.selected { color: var(--pinboard-accent) !important; }

/* ---- Search (banner + main) ---- */
#searchbox { margin-bottom: 12px !important; }
a.bundle { color: var(--pinboard-accent) !important; }
a.bundle:hover { color: var(--pinboard-link-hover) !important; }
#search_query_field, #banner_searchbox input[type="text"] {
  background: var(--pinboard-input-bg) !important;
  color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  box-sizing: border-box !important;
}
#search_query_field:focus, #banner_searchbox input[type="text"]:focus { border-color: var(--pinboard-accent) !important; outline: none !important; }
.search_button input[type="submit"] {
  background: var(--pinboard-accent) !important;
  color: var(--pinboard-btn-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-accent) !important;
  cursor: pointer !important;
}
.search_button input[type="submit"]:hover { background: var(--pinboard-link-hover) !important; }

/* ---- Bookmark list ---- */
.bookmark {
  background: var(--pinboard-bg-surface) !important; border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important; border-radius: var(--pinboard-radius-md) !important; padding: 12px 16px !important; margin-bottom: 6px !important;
  display: flex !important;
  align-items: flex-start !important;
}
.bookmark { transition: box-shadow 0.2s ease !important; }
.bookmark .display { float: none !important; flex: 1 !important; width: auto !important; min-width: 0 !important; }
.star, .selected_star { margin-left: 0 !important; margin-right: 6px !important; float: none !important; flex-shrink: 0 !important; }
.star { color: var(--pinboard-border) !important; }
.selected_star { color: var(--pinboard-private-accent) !important; }

a.bookmark_title { color: var(--pinboard-accent) !important; font-size: 15px !important; text-decoration: none !important; font-weight: var(--pinboard-weight-heading) !important; }
a.bookmark_title:hover { color: var(--pinboard-link-hover) !important; text-decoration: underline !important; }
a.url_display, a.when, a.cached { color: var(--pinboard-muted-soft) !important; font-size: 11px !important; }
a.url_link {
  color: var(--pinboard-url-link-fg) !important;
  background: var(--pinboard-url-link-bg) !important;
  padding: 1px 6px !important;
  border-radius: var(--pinboard-radius-lg) !important;
  font-size: 11px !important;
}
.description { color: var(--pinboard-fg) !important; opacity: 0.85 !important; line-height: var(--pinboard-line-height) !important; }
.description blockquote { color: var(--pinboard-muted) !important; border-left: 3px solid var(--pinboard-accent-alpha) !important; padding-left: 10px !important; margin: 4px 0 !important; }

a.tag {
  color: var(--pinboard-tag-fg) !important;
  background: var(--pinboard-tag-bg) !important;
  padding: 1px 8px !important;
  border-radius: var(--pinboard-radius-lg) !important;
  font-size: 11px !important;
  text-decoration: none !important;
}
a.tag:hover { color: var(--pinboard-tag-fg) !important; background: var(--pinboard-accent-alpha) !important; text-decoration: none !important; }
a.tag.selected { color: var(--pinboard-destroy) !important; font-weight: bold !important; }
a.sort_order_selected { background: var(--pinboard-tag-bg) !important; color: var(--pinboard-accent) !important; }

a.unread { color: var(--pinboard-destroy) !important; font-weight: bold !important; }
.edit_links a, a.copy_link { color: var(--pinboard-muted-soft) !important; }
.edit_links a:hover { color: var(--pinboard-fg) !important; }
a.copy_link { color: var(--pinboard-accent) !important; }
a.delete, a.destroy { color: var(--pinboard-destroy) !important; }

/* ---- Private bookmarks ---- */
.bookmark.private,
.bookmark.private[style*="background"] { background: var(--pinboard-private-bg) !important; box-shadow: inset 3px 0 0 var(--pinboard-private-accent) !important; border-top-color: transparent !important; border-right-color: transparent !important; border-left-color: transparent !important; }

/* ---- Right bar ---- */
#right_bar {
  background: var(--pinboard-bg-surface) !important;
  color: var(--pinboard-fg) !important;
  padding: var(--pinboard-space-right-bar-gap) !important;
  box-sizing: border-box !important;
  overflow: hidden !important;
  word-wrap: break-word !important;
}
#right_bar h3, #right_bar h4, #right_bar b { color: var(--pinboard-muted) !important; }
#right_bar a { color: var(--pinboard-accent) !important; }
#right_bar a:hover { color: var(--pinboard-link-hover) !important; }
#right_bar table tr[onmouseover] { background: transparent !important; }
#right_bar table tr[onmouseover]:hover { background: var(--pinboard-row-hover) !important; }
#right_bar table td a.tag { color: var(--pinboard-fg) !important; }
#right_bar table td a.delete { color: var(--pinboard-muted-soft) !important; font-size: 11px !important; opacity: 0.55 !important; transition: opacity 0.15s ease, color 0.15s ease !important; }
#right_bar table tr:hover td a.delete { color: var(--pinboard-destroy) !important; opacity: 1 !important; }
#right_bar input#key {
  background: var(--pinboard-input-bg) !important;
  color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-radius: var(--pinboard-radius-sm) !important;
  padding: 4px 8px !important;
  box-sizing: border-box !important;
  font-size: 12px !important;
}
#right_bar input#key:focus { border-color: var(--pinboard-accent) !important; box-shadow: 0 0 0 2px var(--pinboard-accent-alpha) !important; outline: none !important; }
#right_bar input[type="submit"] {
  background: var(--pinboard-success) !important;
  color: var(--pinboard-btn-fg) !important;
  border: none !important;
  border-radius: var(--pinboard-radius-sm) !important;
  padding: 4px 10px !important;
  margin-left: 6px !important;
  cursor: pointer !important;
  font-size: 12px !important;
  transition: background 0.15s ease !important;
}
#right_bar input[type="submit"]:hover { background: var(--pinboard-success-hover) !important; }

/* ---- Tag cloud ---- */
#tag_cloud { max-width: 100% !important; overflow-wrap: break-word !important; }
#tag_cloud a, #tag_cloud a.tag { color: var(--pinboard-accent) !important; }
#tag_cloud a:hover, #tag_cloud a.tag:hover { color: var(--pinboard-link-hover) !important; }
#tag_cloud_header a, a.tag_heading_selected { color: var(--pinboard-muted-soft) !important; }
#tag_cloud_header a:hover { color: var(--pinboard-accent) !important; }

/* ---- Tweets page searchbox ---- */
#tweet_searchbox { margin-bottom: 12px !important; }
#tweet_searchbox form { display: flex !important; flex-direction: column !important; gap: var(--pinboard-space-form-gap) !important; margin: 0 !important; }
#tweet_searchbox br { display: none !important; }
#tweet_searchbox #search_query_field {
  width: 100% !important; box-sizing: border-box !important;
  background: var(--pinboard-input-bg) !important; color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-radius: var(--pinboard-radius-sm) !important;
  padding: 6px 10px !important; font-size: 12px !important;
}
#tweet_searchbox #search_query_field:focus { border-color: var(--pinboard-accent) !important; box-shadow: 0 0 0 2px var(--pinboard-accent-alpha) !important; outline: none !important; }
#tweet_searchbox input[type="submit"] {
  background: var(--pinboard-success) !important; color: var(--pinboard-btn-fg) !important;
  border: none !important; border-radius: var(--pinboard-radius-sm) !important;
  padding: 5px 14px !important; cursor: pointer !important;
  font-size: 12px !important; align-self: flex-start !important;
  transition: background 0.15s ease !important;
}
#tweet_searchbox input[type="submit"]:hover { background: var(--pinboard-success-hover) !important; }

/* ---- Forms (global) ---- */
input[type="text"], input:not([type]), input[type="password"], textarea, select {
  background: var(--pinboard-input-bg) !important; color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  box-sizing: border-box !important; max-width: 100% !important;
}
input[type="text"]:focus, input:not([type]):focus, textarea:focus, select:focus { border-color: var(--pinboard-accent) !important; outline: none !important; }
input[type="submit"], input[type="button"] {
  background: var(--pinboard-accent) !important; color: var(--pinboard-btn-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-accent) !important;
  border-radius: var(--pinboard-radius-sm) !important;
  padding: 4px 12px !important;
  cursor: pointer !important;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease !important;
}
input[type="submit"]:hover, input[type="button"]:hover { background: var(--pinboard-link-hover) !important; border-color: var(--pinboard-link-hover) !important; }
input[type="reset"], input[type="reset"].reset, button[type="reset"] {
  background: var(--pinboard-bg-surface) !important; color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-radius: var(--pinboard-radius-sm) !important;
  padding: 4px 12px !important;
  cursor: pointer !important;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease !important;
}
input[type="reset"]:hover, input[type="reset"].reset:hover, button[type="reset"]:hover { background: var(--pinboard-row-hover) !important; border-color: var(--pinboard-accent) !important; color: var(--pinboard-accent) !important; }
input[type="checkbox"], input[type="radio"] { accent-color: var(--pinboard-accent) !important; }
.suggested_tag { color: var(--pinboard-success) !important; cursor: pointer !important; }
#edit_bookmark_form { background: var(--pinboard-bg-surface) !important; border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important; }

/* ---- Tag completion popup (Pin.Tags widget on /add/, edit-bookmark, note-add) ---- */
.pin-ac { z-index: 1000 !important; }
.pin-ac .bd {
  background: var(--pinboard-bg-surface) !important;
  color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-radius: var(--pinboard-radius-sm) !important;
  box-shadow: 0 2px 8px var(--pinboard-accent-alpha) !important;
}
.pin-ac li {
  background: transparent !important;
  color: var(--pinboard-fg) !important;
  padding: 4px 10px !important;
  font-size: 12px !important;
}
.pin-ac li:hover { background: var(--pinboard-accent-alpha) !important; color: var(--pinboard-fg) !important; cursor: pointer !important; }
.pin-ac .active { background: var(--pinboard-selection-bg) !important; color: var(--pinboard-selection-fg) !important; }

/* ---- Settings page ---- */
#settings_panel { background: var(--pinboard-bg-surface) !important; }
.settings_tabs { border-color: var(--pinboard-border) !important; }
.settings_tab { color: var(--pinboard-muted) !important; padding: 6px 12px !important; border-bottom-color: var(--pinboard-border) !important; }
.settings_tab a { color: inherit !important; text-decoration: none !important; }
.settings_tab:hover { color: var(--pinboard-accent) !important; }
.settings_tab_selected {
  color: var(--pinboard-accent) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-top: 2px solid var(--pinboard-accent) !important;
  border-bottom-color: var(--pinboard-bg-surface) !important;
  background: var(--pinboard-bg-surface) !important;
  font-weight: bold !important;
  margin-bottom: -1px !important;
}
.settings_tab_selected a { color: var(--pinboard-accent) !important; }
[class*="settings_tab_spacer"] { border-bottom-color: var(--pinboard-border) !important; }
.settings_heading { color: var(--pinboard-muted) !important; background: transparent !important; border-bottom: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important; padding-bottom: 6px !important; }
a.help { color: var(--pinboard-muted-soft) !important; background: var(--pinboard-accent-soft) !important; }
.email_secret { color: var(--pinboard-accent) !important; }
#settings_tab_panes { border: none !important; }
#settings_tab_panes table td { color: var(--pinboard-fg) !important; }

/* ---- Profile page ---- */
.service_box, .help_box {
  background: var(--pinboard-bg-surface) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-radius: var(--pinboard-radius-md) !important;
  padding: 16px !important;
  box-sizing: border-box !important;
  margin-bottom: 12px !important;
}
.service_box .service_box { border: none !important; padding: 0 !important; margin: 0 !important; background: transparent !important; border-radius: 0 !important; width: auto !important; box-sizing: border-box !important; }
#profile_left_column { margin-right: 20px !important; }
#profile_right_column { width: 430px !important; }
#profile_main_column h2, #profile_left_column h2, #profile_right_column h2 { color: var(--pinboard-muted) !important; }
#profile_main_column table td, #profile_right_column table td { color: var(--pinboard-fg) !important; }

/* ---- Notes ---- */
.note { border-bottom: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important; }
.note a { color: var(--pinboard-accent) !important; }
.note .note { border: none !important; padding: 0 !important; margin: 0 !important; background: transparent !important; border-radius: 0 !important; }
#note_right_column { background: var(--pinboard-bg-surface) !important; color: var(--pinboard-fg) !important; padding: 16px !important; border-left: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important; }

/* ---- Bulk edit ---- */
#bulk_top_bar, #bulk_edit_box { background: var(--pinboard-bg-surface) !important; border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important; color: var(--pinboard-fg) !important; }

/* ---- Save bookmark popup ---- */
#popup_header { background: var(--pinboard-bg-surface) !important; color: var(--pinboard-fg) !important; }
.formtable td { color: var(--pinboard-fg) !important; }
.bookmark_count, .bookmark_count_box { color: var(--pinboard-muted) !important; }
.user_navbar a { color: var(--pinboard-accent) !important; }
.rss_link, .rss_linkbox a { color: var(--pinboard-muted-soft) !important; }

/* ---- Bundles (P4-table) — /u/<user>/bundles/ ---- */
#main_column form[name="sort"] > table { width: 100% !important; max-width: 880px !important; border-collapse: separate !important; border-spacing: 0 4px !important; margin-top: 8px !important; }
#main_column form[name="sort"] table tr { background: transparent !important; border-radius: var(--pinboard-radius-md) !important; }
#main_column form[name="sort"] table tr:hover { background: var(--pinboard-row-hover) !important; }
#main_column form[name="sort"] table td { padding: 6px 10px !important; vertical-align: middle !important; border: none !important; }
#main_column form[name="sort"] table td[style*="text-align:right"] { min-width: 160px !important; padding-right: 14px !important; white-space: nowrap !important; }
#main_column form[name="sort"] table input[name^="id_"] {
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  background: var(--pinboard-input-bg) !important;
  color: var(--pinboard-fg) !important;
  width: 32px !important;
  border-radius: var(--pinboard-radius-sm) !important;
  text-align: center !important;
}
#main_column form[name="sort"] table input[name^="id_"]:focus { border-color: var(--pinboard-accent) !important; box-shadow: 0 0 0 2px var(--pinboard-accent-alpha) !important; outline: none !important; }
#main_column form[name="sort"] table a.bundle { font-weight: var(--pinboard-weight-heading) !important; font-style: normal !important; letter-spacing: 0.01em !important; padding: 2px 4px !important; border-radius: var(--pinboard-radius-sm) !important; }
#main_column form[name="sort"] table a[style*="color:#aaa"],
#main_column form[name="sort"] table a[style*="color: #aaa"] { color: var(--pinboard-muted) !important; opacity: 1 !important; text-decoration: none !important; font-size: 12px !important; margin-left: 4px !important; }
#main_column form[name="sort"] table a[style*="color:#aaa"]:hover { color: var(--pinboard-accent) !important; text-decoration: underline !important; }
#main_column form[name="sort"] table td a.edit { color: var(--pinboard-muted) !important; opacity: 0.8 !important; transition: opacity 0.15s ease !important; }
#main_column form[name="sort"] table td a.destroy { color: var(--pinboard-destroy) !important; opacity: 0.85 !important; font-weight: var(--pinboard-weight-heading) !important; }
#main_column form[name="sort"] table tr:hover td a.edit { color: var(--pinboard-accent) !important; opacity: 1 !important; }
#main_column form[name="sort"] table tr:hover td a.destroy { opacity: 1 !important; }

/* ---- Pagination ---- */
.next_prev, .next_prev_widget a { color: var(--pinboard-accent) !important; }
.next_prev:hover, .next_prev_widget a:hover { color: var(--pinboard-link-hover) !important; }
#nextprev a.edit { color: var(--pinboard-muted-soft) !important; }

/* ---- Logged-out landing page (https://pinboard.in/) ---- */
#main_welcome, .homepage_quad { color: var(--pinboard-fg) !important; }
.homepage_heading { color: var(--pinboard-fg-strong) !important; font-weight: var(--pinboard-weight-heading) !important; }
.homepage_subheading { color: var(--pinboard-muted) !important; }
.signup_button,
.signup_button[style*="background"] {
  background: var(--pinboard-btn-bg) !important;
  color: var(--pinboard-btn-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-btn-bg) !important;
  border-radius: var(--pinboard-radius-sm) !important;
  padding: 10px 16px !important;
  text-align: center !important;
  font-weight: var(--pinboard-weight-heading) !important;
  cursor: pointer !important;
  transition: background 0.15s ease, border-color 0.15s ease !important;
}
.signup_button:hover { background: var(--pinboard-btn-bg-hover) !important; border-color: var(--pinboard-btn-bg-hover) !important; }
#blurb_div { color: var(--pinboard-fg) !important; }
.blurb_column { color: var(--pinboard-fg) !important; }
#blurb_div a { text-decoration: none !important; color: var(--pinboard-fg) !important; display: block !important; }
.blurb_box {
  background: var(--pinboard-bg-surface) !important;
  color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-radius: var(--pinboard-radius-md) !important;
  padding: 12px 14px !important;
  margin-bottom: 10px !important;
  transition: background 0.15s ease, border-color 0.15s ease !important;
}
#blurb_div a:hover .blurb_box { background: var(--pinboard-row-hover) !important; border-color: var(--pinboard-accent-alpha) !important; }
.magazine_title { color: var(--pinboard-accent) !important; font-weight: var(--pinboard-weight-heading) !important; }
.blurb { color: var(--pinboard-fg) !important; opacity: 0.85 !important; }
#language_box { color: var(--pinboard-muted) !important; }
#language_box p { margin: 2px 0 !important; }
#language_box a { color: var(--pinboard-muted) !important; padding: 1px 6px !important; border-radius: var(--pinboard-radius-sm) !important; text-decoration: none !important; }
#language_box a:hover { color: var(--pinboard-accent) !important; background: var(--pinboard-accent-alpha) !important; }
#language_box a[style*="background:#ffa"],
#language_box a[style*="background: #ffa"] { background: var(--pinboard-accent-alpha) !important; color: var(--pinboard-accent) !important; }
.nli { color: var(--pinboard-muted) !important; }
.nav_nli { color: var(--pinboard-accent) !important; text-decoration: none !important; }
.nav_nli:hover { color: var(--pinboard-link-hover) !important; }

/* ---- Footer / colophon ---- */
#footer, .colophon, .colophon a { color: var(--pinboard-muted-soft) !important; }

/* ---- Scrollbars (Webkit + Firefox standard) ---- */
html, body, textarea, .description, .pin-ac .bd {
  scrollbar-width: thin !important;
  scrollbar-color: var(--pinboard-muted) var(--pinboard-bg-surface) !important;
}
::-webkit-scrollbar { width: 10px !important; height: 10px !important; }
::-webkit-scrollbar-track { background: var(--pinboard-bg-surface) !important; border-left: 1px solid var(--pinboard-border) !important; }
::-webkit-scrollbar-thumb { background: var(--pinboard-muted-soft) !important; border: 2px solid var(--pinboard-bg-surface) !important; border-radius: 6px !important; }
::-webkit-scrollbar-thumb:hover { background: var(--pinboard-accent) !important; }
::-webkit-scrollbar-corner { background: var(--pinboard-bg-surface) !important; }

/* ---- Global anchor fallbacks ---- */
a, a:link { color: var(--pinboard-accent) !important; }
a:hover { color: var(--pinboard-link-hover) !important; }
a:visited { color: var(--pinboard-link-visited) !important; }
a:focus-visible { outline: 2px solid var(--pinboard-focus-ring) !important; outline-offset: 2px !important; }
h2 { color: var(--pinboard-muted) !important; }
hr { border-color: var(--pinboard-border) !important; }

/* ---- Bundle slot input override: already in inline_base_rules — redundant here ---- */

/* ---- ::selection (also in _base but themes may want explicit) ---- */
::selection { background: var(--pinboard-selection-bg) !important; color: var(--pinboard-selection-fg) !important; }
::-moz-selection { background: var(--pinboard-selection-bg) !important; color: var(--pinboard-selection-fg) !important; }

/* === patterns layer (tokens.patterns) === */
#search_query_field:focus, #banner_searchbox input[type="text"]:focus, #right_bar input#key:focus, #tweet_searchbox #search_query_field:focus {
  box-shadow: 0 0 0 2px var(--pinboard-accent-alpha) !important;
  outline: none !important;
}
.bookmark { border: none !important; }
.bookmark { box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05) !important; transition: box-shadow 0.2s !important; }
.bookmark:hover { box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08) !important; }
input[type="submit"], input[type="button"], .search_button input[type="submit"] { border-radius: 12px !important; }


/* === theme overrides (tokens.overrides.css) === */
/* ======== overrides-patch for catppuccin-latte (auto-generated by tools/generate-overrides.mjs) ========
 * Restores shipped decls the composer's token-driven output doesn't match.
 */
#banner { border-radius: 4px !important; padding: 8px 16px !important; }
#search_query_field { width: 100% !important; border-radius: 12px !important; }
#banner_searchbox input[type="text"] { border-radius: 12px !important; }
.bookmark { padding: 14px 18px !important; border-radius: 12px !important; margin-bottom: 8px !important; box-shadow: 0 1px 4px rgba(0,0,0,0.06) !important; }
a.bookmark_title { font-weight: 600 !important; }
a.bookmark_title:hover { text-decoration: none !important; }
a.url_display { color: #40a02b !important; font-size: 12px !important; }
a.url_link { padding: 2px 8px !important; border-radius: 10px !important; }
.description { color: #5c5f77 !important; }
.description blockquote { border-left: 3px solid #8839ef !important; padding-left: 12px !important; margin: 6px 0 !important; }
a.tag { border-radius: 10px !important; }
a.tag.selected { color: #e64553 !important; }
a.sort_order_selected { background: #ccd0da !important; }
#right_bar table td a.delete { color: #8c8fa1 !important; }
#right_bar input#key { border: 1px solid #bcc0cc !important; border-radius: 4px !important; }
#right_bar input#key:focus { box-shadow: 0 0 0 2px rgba(30,102,245,0.2) !important; }
#right_bar input[type="submit"] { background: #1e66f5 !important; border-radius: 4px !important; }
#right_bar input[type="submit"]:hover { background: #7287fd !important; }
#tweet_searchbox #search_query_field { border: 1px solid #bcc0cc !important; border-radius: 4px !important; font-size: 13px !important; }
#tweet_searchbox #search_query_field:focus { box-shadow: 0 0 0 2px rgba(30,102,245,0.2) !important; }
#tweet_searchbox input[type="submit"] { background: #1e66f5 !important; border-radius: 4px !important; }
#tweet_searchbox input[type="submit"]:hover { background: #7287fd !important; }
input[type="text"] { border-radius: 8px !important; }
input:not([type]) { border-radius: 8px !important; }
input[type="password"] { border-radius: 8px !important; }
textarea { border-radius: 8px !important; }
select { border-radius: 8px !important; }
.suggested_tag { color: #179299 !important; }
#edit_bookmark_form { border-radius: 12px !important; }
a.help { background: #e6e9ef !important; }
.service_box { border-radius: 12px !important; box-shadow: 0 1px 4px rgba(0,0,0,0.06) !important; }
.help_box { border-radius: 12px !important; box-shadow: 0 1px 4px rgba(0,0,0,0.06) !important; }
#bulk_top_bar { border-radius: 12px !important; }
#bulk_edit_box { border-radius: 12px !important; }
#main_column form[name="sort"] table tr { border-radius: 8px !important; }
#main_column form[name="sort"] table tr:hover { background: rgba(30,102,245,0.06) !important; }
#main_column form[name="sort"] table input[name^="id_"] { width: 38px !important; min-width: 38px !important; max-width: 38px !important; padding: 3px 4px !important; margin-right: 10px !important; font-size: 12px !important; line-height: 1.2 !important; box-sizing: border-box !important; vertical-align: middle !important; background: #e6e9ef !important; font-weight: 600 !important; }
#main_column form[name="sort"] table input[name^="id_"]:focus { box-shadow: 0 0 0 2px rgba(30,102,245,0.2) !important; }
#main_column form[name="sort"] table a.bundle { font-weight: 600 !important; padding: 2px 6px !important; border-radius: 6px !important; }
#main_column form[name="sort"] table a[style*="color:#aaa"] { color: #8c8fa1 !important; }
#main_column form[name="sort"] table a[style*="color: #aaa"] { color: #8c8fa1 !important; }
#main_column form[name="sort"] table td a.edit { color: #8c8fa1 !important; opacity: 0.75 !important; }
#main_column form[name="sort"] table td a.destroy { font-weight: 600 !important; }`
  },

  // ---- 10. Catppuccin Mocha ----
  "catppuccin-mocha": {
    name: "Catppuccin Mocha",
    desc: "Rich dark theme from the Catppuccin palette with pastel accents",
    css: `:root {
  --pinboard-bg: #1e1e2e;
  --pinboard-bg-surface: #313244;
  --pinboard-fg: #cdd6f4;
  --pinboard-fg-strong: #cba6f7;
  --pinboard-muted: #a6adc8;
  --pinboard-muted-soft: #585b70;
  --pinboard-border: #45475a;
  --pinboard-border-strong: #45475a;
  --pinboard-border-soft: #45475a;
  --pinboard-accent: #89b4fa;
  --pinboard-accent-hover: #cba6f7;
  --pinboard-accent-soft: #313244;
  --pinboard-accent-alpha: rgba(137,180,250,0.25);
  --pinboard-input-bg: #1e1e2e;
  --pinboard-private-bg: #2a2418;
  --pinboard-private-accent: #f9e2af;
  --pinboard-selection-bg: #585b70;
  --pinboard-selection-fg: #cdd6f4;
  --pinboard-tag-bg: #45475a;
  --pinboard-tag-fg: #94e2d5;
  --pinboard-row-hover: #313244;
  --pinboard-destroy: #f38ba8;
  --pinboard-btn-bg: #89b4fa;
  --pinboard-btn-fg: #1e1e2e;
  --pinboard-success: #94e2d5;
  --pinboard-success-hover: #a6e3a1;
  --pinboard-url-link-bg: #313244;
  --pinboard-url-link-fg: #f9e2af;
  --pinboard-link-hover: #cba6f7;
  --pinboard-link-visited: #89b4fa;
  --pinboard-focus-ring: #89b4fa;
  --pinboard-unread: #f38ba8;
  --pinboard-btn-bg-hover: #cba6f7;
  --pinboard-font-family: "Nunito", "Inter", -apple-system, sans-serif;
  --pinboard-font-size-base: 13px;
  --pinboard-font-size-sm: 12px;
  --pinboard-font-size-lg: 15px;
  --pinboard-font-size-xs: 11px;
  --pinboard-line-height: 1.6;
  --pinboard-weight-body: 400;
  --pinboard-weight-heading: 700;
  --pinboard-space-unit: 4px;
  --pinboard-space-bookmark-gap: 8px;
  --pinboard-space-main-padding: 14px;
  --pinboard-space-sub-banner-y: 8px;
  --pinboard-space-right-bar-gap: 12px;
  --pinboard-space-form-gap: 8px;
  --pinboard-radius-sm: 8px;
  --pinboard-radius-md: 12px;
  --pinboard-radius-lg: 10px;
  --pinboard-border-width: 1px;
  --pinboard-border-style: solid;
  --pinboard-border-hairline: 1px dotted #45475a;
}

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

/* override.generic-bgcolor — defensive against legacy HTML attr */
[bgcolor] { background-color: transparent !important; }

/* override.generic-html-color — defensive against legacy <font> */
font[color], font[size] { color: inherit !important; font-size: inherit !important; }

/* override.generic-fixed-width — defensive against layout tables */
table[width]:not([width="100%"]) { width: auto !important; max-width: 100% !important; }

/* === selection (applied globally; composers may override scoped) === */
::selection          { background: var(--pinboard-selection-bg); color: var(--pinboard-selection-fg); }
::-moz-selection     { background: var(--pinboard-selection-bg); color: var(--pinboard-selection-fg); }

/* === composer: classic-list-v2 — canonical surface inventory === */

/* ---- App shell typography (body#pinboard) ---- */
body#pinboard {
  background: var(--pinboard-bg) !important;
  color: var(--pinboard-fg) !important;
  font-family: var(--pinboard-font-family) !important;
  font-size: 13px !important;
  line-height: var(--pinboard-line-height) !important;
}
body#pinboard table, body#pinboard td, body#pinboard th,
body#pinboard p, body#pinboard b, body#pinboard strong,
body#pinboard label, body#pinboard span, body#pinboard li:not(.pin-ac li),
body#pinboard dd, body#pinboard dt { color: inherit !important; }

/* ---- Popup / iframe frame (body:not(#pinboard)) ---- */
body:not(#pinboard) {
  background: var(--pinboard-bg) !important;
  color: var(--pinboard-fg) !important;
  font-family: var(--pinboard-font-family) !important;
}
body:not(#pinboard) table, body:not(#pinboard) td,
body:not(#pinboard) p, body:not(#pinboard) label,
body:not(#pinboard) span { color: inherit !important; }
body:not(#pinboard) #popup_header { background: transparent !important; color: var(--pinboard-fg) !important; }

/* ---- Banner & navigation ---- */
#banner { background: var(--pinboard-bg-surface) !important; border-color: var(--pinboard-border) !important; max-width: 1030px !important; box-sizing: border-box !important; }
#banner a, #top_menu a, .banner_username { color: var(--pinboard-accent) !important; }
#banner a:hover, #top_menu a:hover { color: var(--pinboard-link-hover) !important; }
#pinboard_name a { color: var(--pinboard-accent) !important; font-weight: var(--pinboard-weight-heading) !important; }
#sub_banner { background: var(--pinboard-bg-surface) !important; border-color: var(--pinboard-border) !important; }
#sub_banner a { color: var(--pinboard-muted) !important; }
#sub_banner a:hover, #sub_banner a.selected { color: var(--pinboard-accent) !important; }

/* ---- Search (banner + main) ---- */
#searchbox { margin-bottom: 12px !important; }
a.bundle { color: var(--pinboard-accent) !important; }
a.bundle:hover { color: var(--pinboard-link-hover) !important; }
#search_query_field, #banner_searchbox input[type="text"] {
  background: var(--pinboard-input-bg) !important;
  color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  box-sizing: border-box !important;
}
#search_query_field:focus, #banner_searchbox input[type="text"]:focus { border-color: var(--pinboard-accent) !important; outline: none !important; }
.search_button input[type="submit"] {
  background: var(--pinboard-accent) !important;
  color: var(--pinboard-btn-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-accent) !important;
  cursor: pointer !important;
}
.search_button input[type="submit"]:hover { background: var(--pinboard-link-hover) !important; }

/* ---- Bookmark list ---- */
.bookmark {
  background: var(--pinboard-bg-surface) !important; border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important; border-radius: var(--pinboard-radius-md) !important; padding: 12px 16px !important; margin-bottom: 6px !important;
  display: flex !important;
  align-items: flex-start !important;
}
.bookmark { transition: box-shadow 0.2s ease !important; }
.bookmark .display { float: none !important; flex: 1 !important; width: auto !important; min-width: 0 !important; }
.star, .selected_star { margin-left: 0 !important; margin-right: 6px !important; float: none !important; flex-shrink: 0 !important; }
.star { color: var(--pinboard-border) !important; }
.selected_star { color: var(--pinboard-private-accent) !important; }

a.bookmark_title { color: var(--pinboard-accent) !important; font-size: 15px !important; text-decoration: none !important; font-weight: var(--pinboard-weight-heading) !important; }
a.bookmark_title:hover { color: var(--pinboard-link-hover) !important; text-decoration: underline !important; }
a.url_display, a.when, a.cached { color: var(--pinboard-muted-soft) !important; font-size: 11px !important; }
a.url_link {
  color: var(--pinboard-url-link-fg) !important;
  background: var(--pinboard-url-link-bg) !important;
  padding: 1px 6px !important;
  border-radius: var(--pinboard-radius-lg) !important;
  font-size: 11px !important;
}
.description { color: var(--pinboard-fg) !important; opacity: 0.85 !important; line-height: var(--pinboard-line-height) !important; }
.description blockquote { color: var(--pinboard-muted) !important; border-left: 3px solid var(--pinboard-accent-alpha) !important; padding-left: 10px !important; margin: 4px 0 !important; }

a.tag {
  color: var(--pinboard-tag-fg) !important;
  background: var(--pinboard-tag-bg) !important;
  padding: 1px 8px !important;
  border-radius: var(--pinboard-radius-lg) !important;
  font-size: 11px !important;
  text-decoration: none !important;
}
a.tag:hover { color: var(--pinboard-tag-fg) !important; background: var(--pinboard-accent-alpha) !important; text-decoration: none !important; }
a.tag.selected { color: var(--pinboard-destroy) !important; font-weight: bold !important; }
a.sort_order_selected { background: var(--pinboard-tag-bg) !important; color: var(--pinboard-accent) !important; }

a.unread { color: var(--pinboard-destroy) !important; font-weight: bold !important; }
.edit_links a, a.copy_link { color: var(--pinboard-muted-soft) !important; }
.edit_links a:hover { color: var(--pinboard-fg) !important; }
a.copy_link { color: var(--pinboard-accent) !important; }
a.delete, a.destroy { color: var(--pinboard-destroy) !important; }

/* ---- Private bookmarks ---- */
.bookmark.private,
.bookmark.private[style*="background"] { background: var(--pinboard-private-bg) !important; box-shadow: inset 3px 0 0 var(--pinboard-private-accent) !important; border-top-color: transparent !important; border-right-color: transparent !important; border-left-color: transparent !important; }

/* ---- Right bar ---- */
#right_bar {
  background: var(--pinboard-bg-surface) !important;
  color: var(--pinboard-fg) !important;
  padding: var(--pinboard-space-right-bar-gap) !important;
  box-sizing: border-box !important;
  overflow: hidden !important;
  word-wrap: break-word !important;
}
#right_bar h3, #right_bar h4, #right_bar b { color: var(--pinboard-muted) !important; }
#right_bar a { color: var(--pinboard-accent) !important; }
#right_bar a:hover { color: var(--pinboard-link-hover) !important; }
#right_bar table tr[onmouseover] { background: transparent !important; }
#right_bar table tr[onmouseover]:hover { background: var(--pinboard-row-hover) !important; }
#right_bar table td a.tag { color: var(--pinboard-fg) !important; }
#right_bar table td a.delete { color: var(--pinboard-muted-soft) !important; font-size: 11px !important; opacity: 0.55 !important; transition: opacity 0.15s ease, color 0.15s ease !important; }
#right_bar table tr:hover td a.delete { color: var(--pinboard-destroy) !important; opacity: 1 !important; }
#right_bar input#key {
  background: var(--pinboard-input-bg) !important;
  color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-radius: var(--pinboard-radius-sm) !important;
  padding: 4px 8px !important;
  box-sizing: border-box !important;
  font-size: 12px !important;
}
#right_bar input#key:focus { border-color: var(--pinboard-accent) !important; box-shadow: 0 0 0 2px var(--pinboard-accent-alpha) !important; outline: none !important; }
#right_bar input[type="submit"] {
  background: var(--pinboard-success) !important;
  color: var(--pinboard-btn-fg) !important;
  border: none !important;
  border-radius: var(--pinboard-radius-sm) !important;
  padding: 4px 10px !important;
  margin-left: 6px !important;
  cursor: pointer !important;
  font-size: 12px !important;
  transition: background 0.15s ease !important;
}
#right_bar input[type="submit"]:hover { background: var(--pinboard-success-hover) !important; }

/* ---- Tag cloud ---- */
#tag_cloud { max-width: 100% !important; overflow-wrap: break-word !important; }
#tag_cloud a, #tag_cloud a.tag { color: var(--pinboard-accent) !important; }
#tag_cloud a:hover, #tag_cloud a.tag:hover { color: var(--pinboard-link-hover) !important; }
#tag_cloud_header a, a.tag_heading_selected { color: var(--pinboard-muted-soft) !important; }
#tag_cloud_header a:hover { color: var(--pinboard-accent) !important; }

/* ---- Tweets page searchbox ---- */
#tweet_searchbox { margin-bottom: 12px !important; }
#tweet_searchbox form { display: flex !important; flex-direction: column !important; gap: var(--pinboard-space-form-gap) !important; margin: 0 !important; }
#tweet_searchbox br { display: none !important; }
#tweet_searchbox #search_query_field {
  width: 100% !important; box-sizing: border-box !important;
  background: var(--pinboard-input-bg) !important; color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-radius: var(--pinboard-radius-sm) !important;
  padding: 6px 10px !important; font-size: 12px !important;
}
#tweet_searchbox #search_query_field:focus { border-color: var(--pinboard-accent) !important; box-shadow: 0 0 0 2px var(--pinboard-accent-alpha) !important; outline: none !important; }
#tweet_searchbox input[type="submit"] {
  background: var(--pinboard-success) !important; color: var(--pinboard-btn-fg) !important;
  border: none !important; border-radius: var(--pinboard-radius-sm) !important;
  padding: 5px 14px !important; cursor: pointer !important;
  font-size: 12px !important; align-self: flex-start !important;
  transition: background 0.15s ease !important;
}
#tweet_searchbox input[type="submit"]:hover { background: var(--pinboard-success-hover) !important; }

/* ---- Forms (global) ---- */
input[type="text"], input:not([type]), input[type="password"], textarea, select {
  background: var(--pinboard-input-bg) !important; color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  box-sizing: border-box !important; max-width: 100% !important;
}
input[type="text"]:focus, input:not([type]):focus, textarea:focus, select:focus { border-color: var(--pinboard-accent) !important; outline: none !important; }
input[type="submit"], input[type="button"] {
  background: var(--pinboard-accent) !important; color: var(--pinboard-btn-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-accent) !important;
  border-radius: var(--pinboard-radius-sm) !important;
  padding: 4px 12px !important;
  cursor: pointer !important;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease !important;
}
input[type="submit"]:hover, input[type="button"]:hover { background: var(--pinboard-link-hover) !important; border-color: var(--pinboard-link-hover) !important; }
input[type="reset"], input[type="reset"].reset, button[type="reset"] {
  background: var(--pinboard-bg-surface) !important; color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-radius: var(--pinboard-radius-sm) !important;
  padding: 4px 12px !important;
  cursor: pointer !important;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease !important;
}
input[type="reset"]:hover, input[type="reset"].reset:hover, button[type="reset"]:hover { background: var(--pinboard-row-hover) !important; border-color: var(--pinboard-accent) !important; color: var(--pinboard-accent) !important; }
input[type="checkbox"], input[type="radio"] { accent-color: var(--pinboard-accent) !important; }
.suggested_tag { color: var(--pinboard-success) !important; cursor: pointer !important; }
#edit_bookmark_form { background: var(--pinboard-bg-surface) !important; border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important; }

/* ---- Tag completion popup (Pin.Tags widget on /add/, edit-bookmark, note-add) ---- */
.pin-ac { z-index: 1000 !important; }
.pin-ac .bd {
  background: var(--pinboard-bg-surface) !important;
  color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-radius: var(--pinboard-radius-sm) !important;
  box-shadow: 0 2px 8px var(--pinboard-accent-alpha) !important;
}
.pin-ac li {
  background: transparent !important;
  color: var(--pinboard-fg) !important;
  padding: 4px 10px !important;
  font-size: 12px !important;
}
.pin-ac li:hover { background: var(--pinboard-accent-alpha) !important; color: var(--pinboard-fg) !important; cursor: pointer !important; }
.pin-ac .active { background: var(--pinboard-selection-bg) !important; color: var(--pinboard-selection-fg) !important; }

/* ---- Settings page ---- */
#settings_panel { background: var(--pinboard-bg-surface) !important; }
.settings_tabs { border-color: var(--pinboard-border) !important; }
.settings_tab { color: var(--pinboard-muted) !important; padding: 6px 12px !important; border-bottom-color: var(--pinboard-border) !important; }
.settings_tab a { color: inherit !important; text-decoration: none !important; }
.settings_tab:hover { color: var(--pinboard-accent) !important; }
.settings_tab_selected {
  color: var(--pinboard-accent) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-top: 2px solid var(--pinboard-accent) !important;
  border-bottom-color: var(--pinboard-bg-surface) !important;
  background: var(--pinboard-bg-surface) !important;
  font-weight: bold !important;
  margin-bottom: -1px !important;
}
.settings_tab_selected a { color: var(--pinboard-accent) !important; }
[class*="settings_tab_spacer"] { border-bottom-color: var(--pinboard-border) !important; }
.settings_heading { color: var(--pinboard-muted) !important; background: transparent !important; border-bottom: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important; padding-bottom: 6px !important; }
a.help { color: var(--pinboard-muted-soft) !important; background: var(--pinboard-accent-soft) !important; }
.email_secret { color: var(--pinboard-accent) !important; }
#settings_tab_panes { border: none !important; }
#settings_tab_panes table td { color: var(--pinboard-fg) !important; }

/* ---- Profile page ---- */
.service_box, .help_box {
  background: var(--pinboard-bg-surface) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-radius: var(--pinboard-radius-md) !important;
  padding: 16px !important;
  box-sizing: border-box !important;
  margin-bottom: 12px !important;
}
.service_box .service_box { border: none !important; padding: 0 !important; margin: 0 !important; background: transparent !important; border-radius: 0 !important; width: auto !important; box-sizing: border-box !important; }
#profile_left_column { margin-right: 20px !important; }
#profile_right_column { width: 430px !important; }
#profile_main_column h2, #profile_left_column h2, #profile_right_column h2 { color: var(--pinboard-muted) !important; }
#profile_main_column table td, #profile_right_column table td { color: var(--pinboard-fg) !important; }

/* ---- Notes ---- */
.note { border-bottom: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important; }
.note a { color: var(--pinboard-accent) !important; }
.note .note { border: none !important; padding: 0 !important; margin: 0 !important; background: transparent !important; border-radius: 0 !important; }
#note_right_column { background: var(--pinboard-bg-surface) !important; color: var(--pinboard-fg) !important; padding: 16px !important; border-left: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important; }

/* ---- Bulk edit ---- */
#bulk_top_bar, #bulk_edit_box { background: var(--pinboard-bg-surface) !important; border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important; color: var(--pinboard-fg) !important; }

/* ---- Save bookmark popup ---- */
#popup_header { background: var(--pinboard-bg-surface) !important; color: var(--pinboard-fg) !important; }
.formtable td { color: var(--pinboard-fg) !important; }
.bookmark_count, .bookmark_count_box { color: var(--pinboard-muted) !important; }
.user_navbar a { color: var(--pinboard-accent) !important; }
.rss_link, .rss_linkbox a { color: var(--pinboard-muted-soft) !important; }

/* ---- Bundles (P4-table) — /u/<user>/bundles/ ---- */
#main_column form[name="sort"] > table { width: 100% !important; max-width: 880px !important; border-collapse: separate !important; border-spacing: 0 4px !important; margin-top: 8px !important; }
#main_column form[name="sort"] table tr { background: transparent !important; border-radius: var(--pinboard-radius-md) !important; }
#main_column form[name="sort"] table tr:hover { background: var(--pinboard-row-hover) !important; }
#main_column form[name="sort"] table td { padding: 6px 10px !important; vertical-align: middle !important; border: none !important; }
#main_column form[name="sort"] table td[style*="text-align:right"] { min-width: 160px !important; padding-right: 14px !important; white-space: nowrap !important; }
#main_column form[name="sort"] table input[name^="id_"] {
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  background: var(--pinboard-input-bg) !important;
  color: var(--pinboard-fg) !important;
  width: 32px !important;
  border-radius: var(--pinboard-radius-sm) !important;
  text-align: center !important;
}
#main_column form[name="sort"] table input[name^="id_"]:focus { border-color: var(--pinboard-accent) !important; box-shadow: 0 0 0 2px var(--pinboard-accent-alpha) !important; outline: none !important; }
#main_column form[name="sort"] table a.bundle { font-weight: var(--pinboard-weight-heading) !important; font-style: normal !important; letter-spacing: 0.01em !important; padding: 2px 4px !important; border-radius: var(--pinboard-radius-sm) !important; }
#main_column form[name="sort"] table a[style*="color:#aaa"],
#main_column form[name="sort"] table a[style*="color: #aaa"] { color: var(--pinboard-muted) !important; opacity: 1 !important; text-decoration: none !important; font-size: 12px !important; margin-left: 4px !important; }
#main_column form[name="sort"] table a[style*="color:#aaa"]:hover { color: var(--pinboard-accent) !important; text-decoration: underline !important; }
#main_column form[name="sort"] table td a.edit { color: var(--pinboard-muted) !important; opacity: 0.8 !important; transition: opacity 0.15s ease !important; }
#main_column form[name="sort"] table td a.destroy { color: var(--pinboard-destroy) !important; opacity: 0.85 !important; font-weight: var(--pinboard-weight-heading) !important; }
#main_column form[name="sort"] table tr:hover td a.edit { color: var(--pinboard-accent) !important; opacity: 1 !important; }
#main_column form[name="sort"] table tr:hover td a.destroy { opacity: 1 !important; }

/* ---- Pagination ---- */
.next_prev, .next_prev_widget a { color: var(--pinboard-accent) !important; }
.next_prev:hover, .next_prev_widget a:hover { color: var(--pinboard-link-hover) !important; }
#nextprev a.edit { color: var(--pinboard-muted-soft) !important; }

/* ---- Logged-out landing page (https://pinboard.in/) ---- */
#main_welcome, .homepage_quad { color: var(--pinboard-fg) !important; }
.homepage_heading { color: var(--pinboard-fg-strong) !important; font-weight: var(--pinboard-weight-heading) !important; }
.homepage_subheading { color: var(--pinboard-muted) !important; }
.signup_button,
.signup_button[style*="background"] {
  background: var(--pinboard-btn-bg) !important;
  color: var(--pinboard-btn-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-btn-bg) !important;
  border-radius: var(--pinboard-radius-sm) !important;
  padding: 10px 16px !important;
  text-align: center !important;
  font-weight: var(--pinboard-weight-heading) !important;
  cursor: pointer !important;
  transition: background 0.15s ease, border-color 0.15s ease !important;
}
.signup_button:hover { background: var(--pinboard-btn-bg-hover) !important; border-color: var(--pinboard-btn-bg-hover) !important; }
#blurb_div { color: var(--pinboard-fg) !important; }
.blurb_column { color: var(--pinboard-fg) !important; }
#blurb_div a { text-decoration: none !important; color: var(--pinboard-fg) !important; display: block !important; }
.blurb_box {
  background: var(--pinboard-bg-surface) !important;
  color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-radius: var(--pinboard-radius-md) !important;
  padding: 12px 14px !important;
  margin-bottom: 10px !important;
  transition: background 0.15s ease, border-color 0.15s ease !important;
}
#blurb_div a:hover .blurb_box { background: var(--pinboard-row-hover) !important; border-color: var(--pinboard-accent-alpha) !important; }
.magazine_title { color: var(--pinboard-accent) !important; font-weight: var(--pinboard-weight-heading) !important; }
.blurb { color: var(--pinboard-fg) !important; opacity: 0.85 !important; }
#language_box { color: var(--pinboard-muted) !important; }
#language_box p { margin: 2px 0 !important; }
#language_box a { color: var(--pinboard-muted) !important; padding: 1px 6px !important; border-radius: var(--pinboard-radius-sm) !important; text-decoration: none !important; }
#language_box a:hover { color: var(--pinboard-accent) !important; background: var(--pinboard-accent-alpha) !important; }
#language_box a[style*="background:#ffa"],
#language_box a[style*="background: #ffa"] { background: var(--pinboard-accent-alpha) !important; color: var(--pinboard-accent) !important; }
.nli { color: var(--pinboard-muted) !important; }
.nav_nli { color: var(--pinboard-accent) !important; text-decoration: none !important; }
.nav_nli:hover { color: var(--pinboard-link-hover) !important; }

/* ---- Footer / colophon ---- */
#footer, .colophon, .colophon a { color: var(--pinboard-muted-soft) !important; }

/* ---- Scrollbars (Webkit + Firefox standard) ---- */
html, body, textarea, .description, .pin-ac .bd {
  scrollbar-width: thin !important;
  scrollbar-color: var(--pinboard-muted) var(--pinboard-bg-surface) !important;
}
::-webkit-scrollbar { width: 10px !important; height: 10px !important; }
::-webkit-scrollbar-track { background: var(--pinboard-bg-surface) !important; border-left: 1px solid var(--pinboard-border) !important; }
::-webkit-scrollbar-thumb { background: var(--pinboard-muted-soft) !important; border: 2px solid var(--pinboard-bg-surface) !important; border-radius: 6px !important; }
::-webkit-scrollbar-thumb:hover { background: var(--pinboard-accent) !important; }
::-webkit-scrollbar-corner { background: var(--pinboard-bg-surface) !important; }

/* ---- Global anchor fallbacks ---- */
a, a:link { color: var(--pinboard-accent) !important; }
a:hover { color: var(--pinboard-link-hover) !important; }
a:visited { color: var(--pinboard-link-visited) !important; }
a:focus-visible { outline: 2px solid var(--pinboard-focus-ring) !important; outline-offset: 2px !important; }
h2 { color: var(--pinboard-muted) !important; }
hr { border-color: var(--pinboard-border) !important; }

/* ---- Bundle slot input override: already in inline_base_rules — redundant here ---- */

/* ---- ::selection (also in _base but themes may want explicit) ---- */
::selection { background: var(--pinboard-selection-bg) !important; color: var(--pinboard-selection-fg) !important; }
::-moz-selection { background: var(--pinboard-selection-bg) !important; color: var(--pinboard-selection-fg) !important; }

/* === patterns layer (tokens.patterns) === */
#search_query_field:focus, #banner_searchbox input[type="text"]:focus, #right_bar input#key:focus, #tweet_searchbox #search_query_field:focus {
  box-shadow: 0 0 0 2px var(--pinboard-accent-alpha) !important;
  outline: none !important;
}
.bookmark { border: none !important; }
.bookmark { box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15) !important; transition: box-shadow 0.2s !important; }
.bookmark:hover { box-shadow: 0 4px 12px rgba(0, 0, 0, 0.22) !important; }
input[type="submit"], input[type="button"], .search_button input[type="submit"] { border-radius: 12px !important; }


/* === theme overrides (tokens.overrides.css) === */
/* ======== overrides-patch for catppuccin-mocha (auto-generated by tools/generate-overrides.mjs) ========
 * Restores shipped decls the composer's token-driven output doesn't match.
 */
#banner { border-radius: 4px !important; padding: 8px 16px !important; }
#search_query_field { width: 100% !important; border-radius: 12px !important; }
#banner_searchbox input[type="text"] { border-radius: 12px !important; }
#search_query_field:focus { background: #313244 !important; }
#banner_searchbox input[type="text"]:focus { background: #313244 !important; }
.bookmark { padding: 14px 18px !important; margin-bottom: 8px !important; box-shadow: 0 2px 8px rgba(0,0,0,0.2) !important; }
a.bookmark_title { font-weight: 600 !important; }
a.bookmark_title:hover { text-decoration: none !important; }
a.url_display { color: #a6e3a1 !important; font-size: 12px !important; }
a.url_link { background: #1e1e2e !important; padding: 2px 8px !important; }
.description { color: #bac2de !important; }
.description blockquote { border-left: 3px solid #cba6f7 !important; padding-left: 12px !important; margin: 6px 0 !important; }
a.tag.selected { color: #cba6f7 !important; }
a.sort_order_selected { background: #313244 !important; }
#right_bar h3 { color: #cba6f7 !important; }
#right_bar h4 { color: #cba6f7 !important; }
#right_bar b { color: #cba6f7 !important; }
#right_bar table td a.delete { color: #6c7086 !important; }
#right_bar input#key { border-radius: 4px !important; }
#right_bar input#key:focus { box-shadow: 0 0 0 2px rgba(137,180,250,0.22) !important; }
#right_bar input[type="submit"] { background: #89b4fa !important; border-radius: 4px !important; }
#right_bar input[type="submit"]:hover { background: #b4befe !important; }
#tweet_searchbox #search_query_field { border-radius: 4px !important; font-size: 13px !important; }
#tweet_searchbox #search_query_field:focus { box-shadow: 0 0 0 2px rgba(137,180,250,0.22) !important; }
#tweet_searchbox input[type="submit"] { background: #89b4fa !important; border-radius: 4px !important; }
#tweet_searchbox input[type="submit"]:hover { background: #b4befe !important; }
input[type="text"] { border-radius: 8px !important; }
input:not([type]) { border-radius: 8px !important; }
input[type="password"] { border-radius: 8px !important; }
textarea { border-radius: 8px !important; }
select { border-radius: 8px !important; }
input[type="text"]:focus { background: #313244 !important; }
input:not([type]):focus { background: #313244 !important; }
textarea:focus { background: #313244 !important; }
select:focus { background: #313244 !important; }
#edit_bookmark_form { border-radius: 12px !important; }
#settings_panel { border-radius: 8px !important; }
.settings_heading { color: #cba6f7 !important; }
.service_box { box-shadow: 0 2px 8px rgba(0,0,0,0.2) !important; }
.help_box { box-shadow: 0 2px 8px rgba(0,0,0,0.2) !important; }
#profile_main_column h2 { color: #cba6f7 !important; }
#profile_left_column h2 { color: #cba6f7 !important; }
#profile_right_column h2 { color: #cba6f7 !important; }
#note_right_column { border-radius: 8px !important; }
#bulk_top_bar { border-radius: 12px !important; }
#bulk_edit_box { border-radius: 12px !important; }
#main_column form[name="sort"] table tr { border-radius: 8px !important; }
#main_column form[name="sort"] table tr:hover { background: rgba(137,180,250,0.08) !important; }
#main_column form[name="sort"] table input[name^="id_"] { width: 38px !important; min-width: 38px !important; max-width: 38px !important; padding: 3px 4px !important; margin-right: 10px !important; font-size: 12px !important; line-height: 1.2 !important; box-sizing: border-box !important; vertical-align: middle !important; background: #313244 !important; font-weight: 600 !important; }
#main_column form[name="sort"] table a.bundle { font-weight: 600 !important; padding: 2px 6px !important; border-radius: 6px !important; }
#main_column form[name="sort"] table a[style*="color:#aaa"] { color: #7f849c !important; }
#main_column form[name="sort"] table a[style*="color: #aaa"] { color: #7f849c !important; }
#main_column form[name="sort"] table td a.edit { color: #7f849c !important; opacity: 0.75 !important; }
#main_column form[name="sort"] table td a.destroy { opacity: 0.9 !important; font-weight: 600 !important; }
h2 { color: #cba6f7 !important; }`
  },

  // ---- 11. Gruvbox Dark ----
  "gruvbox-dark": {
    name: "Gruvbox Dark",
    desc: "Retro warm dark theme with earthy tones",
    css: `:root {
  --pinboard-bg: #282828;
  --pinboard-bg-surface: #3c3836;
  --pinboard-fg: #ebdbb2;
  --pinboard-fg-strong: #fbf1c7;
  --pinboard-muted: #a89984;
  --pinboard-muted-soft: #665c54;
  --pinboard-border: #504945;
  --pinboard-border-strong: #504945;
  --pinboard-border-soft: #504945;
  --pinboard-accent: #83a598;
  --pinboard-accent-hover: #d3869b;
  --pinboard-accent-soft: #3c3836;
  --pinboard-accent-alpha: rgba(131,165,152,0.3);
  --pinboard-input-bg: #282828;
  --pinboard-private-bg: #32291a;
  --pinboard-private-accent: #fabd2f;
  --pinboard-selection-bg: #665c54;
  --pinboard-selection-fg: #fbf1c7;
  --pinboard-tag-bg: transparent;
  --pinboard-tag-fg: #b8bb26;
  --pinboard-row-hover: #3c3836;
  --pinboard-destroy: #fb4934;
  --pinboard-btn-bg: #83a598;
  --pinboard-btn-fg: #282828;
  --pinboard-success: #458588;
  --pinboard-success-hover: #689d6a;
  --pinboard-url-link-bg: #32302f;
  --pinboard-url-link-fg: #fabd2f;
  --pinboard-link-hover: #d3869b;
  --pinboard-link-visited: #83a598;
  --pinboard-focus-ring: #83a598;
  --pinboard-unread: #fb4934;
  --pinboard-btn-bg-hover: #d3869b;
  --pinboard-font-family: "IBM Plex Sans", "Inter", -apple-system, sans-serif;
  --pinboard-font-size-base: 13px;
  --pinboard-font-size-sm: 12px;
  --pinboard-font-size-lg: 15px;
  --pinboard-font-size-xs: 11px;
  --pinboard-line-height: 1.5;
  --pinboard-weight-body: 450;
  --pinboard-weight-heading: 700;
  --pinboard-space-unit: 4px;
  --pinboard-space-bookmark-gap: 4px;
  --pinboard-space-main-padding: 12px;
  --pinboard-space-sub-banner-y: 8px;
  --pinboard-space-right-bar-gap: 12px;
  --pinboard-space-form-gap: 8px;
  --pinboard-radius-sm: 2px;
  --pinboard-radius-md: 0;
  --pinboard-radius-lg: 0;
  --pinboard-border-width: 2px;
  --pinboard-border-style: solid;
  --pinboard-border-hairline: 1px dotted #504945;
}

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

/* override.generic-bgcolor — defensive against legacy HTML attr */
[bgcolor] { background-color: transparent !important; }

/* override.generic-html-color — defensive against legacy <font> */
font[color], font[size] { color: inherit !important; font-size: inherit !important; }

/* override.generic-fixed-width — defensive against layout tables */
table[width]:not([width="100%"]) { width: auto !important; max-width: 100% !important; }

/* === selection (applied globally; composers may override scoped) === */
::selection          { background: var(--pinboard-selection-bg); color: var(--pinboard-selection-fg); }
::-moz-selection     { background: var(--pinboard-selection-bg); color: var(--pinboard-selection-fg); }

/* === composer: classic-list-v2 — canonical surface inventory === */

/* ---- App shell typography (body#pinboard) ---- */
body#pinboard {
  background: var(--pinboard-bg) !important;
  color: var(--pinboard-fg) !important;
  font-family: var(--pinboard-font-family) !important;
  font-size: 13px !important;
  line-height: var(--pinboard-line-height) !important;
}
body#pinboard table, body#pinboard td, body#pinboard th,
body#pinboard p, body#pinboard b, body#pinboard strong,
body#pinboard label, body#pinboard span, body#pinboard li:not(.pin-ac li),
body#pinboard dd, body#pinboard dt { color: inherit !important; }

/* ---- Popup / iframe frame (body:not(#pinboard)) ---- */
body:not(#pinboard) {
  background: var(--pinboard-bg) !important;
  color: var(--pinboard-fg) !important;
  font-family: var(--pinboard-font-family) !important;
}
body:not(#pinboard) table, body:not(#pinboard) td,
body:not(#pinboard) p, body:not(#pinboard) label,
body:not(#pinboard) span { color: inherit !important; }
body:not(#pinboard) #popup_header { background: transparent !important; color: var(--pinboard-fg) !important; }

/* ---- Banner & navigation ---- */
#banner { background: var(--pinboard-bg-surface) !important; border-color: var(--pinboard-border) !important; max-width: 1030px !important; box-sizing: border-box !important; }
#banner a, #top_menu a, .banner_username { color: var(--pinboard-accent) !important; }
#banner a:hover, #top_menu a:hover { color: var(--pinboard-link-hover) !important; }
#pinboard_name a { color: var(--pinboard-accent) !important; font-weight: var(--pinboard-weight-heading) !important; }
#sub_banner { background: var(--pinboard-bg-surface) !important; border-color: var(--pinboard-border) !important; }
#sub_banner a { color: var(--pinboard-muted) !important; }
#sub_banner a:hover, #sub_banner a.selected { color: var(--pinboard-accent) !important; }

/* ---- Search (banner + main) ---- */
#searchbox { margin-bottom: 12px !important; }
a.bundle { color: var(--pinboard-accent) !important; }
a.bundle:hover { color: var(--pinboard-link-hover) !important; }
#search_query_field, #banner_searchbox input[type="text"] {
  background: var(--pinboard-input-bg) !important;
  color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  box-sizing: border-box !important;
}
#search_query_field:focus, #banner_searchbox input[type="text"]:focus { border-color: var(--pinboard-accent) !important; outline: none !important; }
.search_button input[type="submit"] {
  background: var(--pinboard-accent) !important;
  color: var(--pinboard-btn-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-accent) !important;
  cursor: pointer !important;
}
.search_button input[type="submit"]:hover { background: var(--pinboard-link-hover) !important; }

/* ---- Bookmark list ---- */
.bookmark {
  background: transparent !important;
  display: flex !important;
  align-items: flex-start !important;
}
.bookmark { transition: box-shadow 0.2s ease !important; }
.bookmark .display { float: none !important; flex: 1 !important; width: auto !important; min-width: 0 !important; }
.star, .selected_star { margin-left: 0 !important; margin-right: 6px !important; float: none !important; flex-shrink: 0 !important; }
.star { color: var(--pinboard-border) !important; }
.selected_star { color: var(--pinboard-private-accent) !important; }

a.bookmark_title { color: var(--pinboard-accent) !important; font-size: 15px !important; text-decoration: none !important; font-weight: var(--pinboard-weight-heading) !important; }
a.bookmark_title:hover { color: var(--pinboard-link-hover) !important; text-decoration: underline !important; }
a.url_display, a.when, a.cached { color: var(--pinboard-muted-soft) !important; font-size: 11px !important; }
a.url_link {
  color: var(--pinboard-url-link-fg) !important;
  background: var(--pinboard-url-link-bg) !important;
  padding: 1px 6px !important;
  border-radius: var(--pinboard-radius-lg) !important;
  font-size: 11px !important;
}
.description { color: var(--pinboard-fg) !important; opacity: 0.85 !important; line-height: var(--pinboard-line-height) !important; }
.description blockquote { color: var(--pinboard-muted) !important; border-left: 3px solid var(--pinboard-accent-alpha) !important; padding-left: 10px !important; margin: 4px 0 !important; }

a.tag {
  color: var(--pinboard-tag-fg) !important;
  background: var(--pinboard-tag-bg) !important;
  padding: 1px 8px !important;
  border-radius: var(--pinboard-radius-lg) !important;
  font-size: 11px !important;
  text-decoration: none !important;
}
a.tag:hover { color: var(--pinboard-tag-fg) !important; background: var(--pinboard-accent-alpha) !important; text-decoration: none !important; }
a.tag.selected { color: var(--pinboard-destroy) !important; font-weight: bold !important; }
a.sort_order_selected { background: var(--pinboard-tag-bg) !important; color: var(--pinboard-accent) !important; }

a.unread { color: var(--pinboard-destroy) !important; font-weight: bold !important; }
.edit_links a, a.copy_link { color: var(--pinboard-muted-soft) !important; }
.edit_links a:hover { color: var(--pinboard-fg) !important; }
a.copy_link { color: var(--pinboard-accent) !important; }
a.delete, a.destroy { color: var(--pinboard-destroy) !important; }

/* ---- Private bookmarks ---- */
.bookmark.private,
.bookmark.private[style*="background"] { background: var(--pinboard-private-bg) !important; box-shadow: inset 3px 0 0 var(--pinboard-private-accent) !important; border-top-color: transparent !important; border-right-color: transparent !important; border-left-color: transparent !important; }

/* ---- Right bar ---- */
#right_bar {
  background: var(--pinboard-bg-surface) !important;
  color: var(--pinboard-fg) !important;
  padding: var(--pinboard-space-right-bar-gap) !important;
  box-sizing: border-box !important;
  overflow: hidden !important;
  word-wrap: break-word !important;
}
#right_bar h3, #right_bar h4, #right_bar b { color: var(--pinboard-muted) !important; }
#right_bar a { color: var(--pinboard-accent) !important; }
#right_bar a:hover { color: var(--pinboard-link-hover) !important; }
#right_bar table tr[onmouseover] { background: transparent !important; }
#right_bar table tr[onmouseover]:hover { background: var(--pinboard-row-hover) !important; }
#right_bar table td a.tag { color: var(--pinboard-fg) !important; }
#right_bar table td a.delete { color: var(--pinboard-muted-soft) !important; font-size: 11px !important; opacity: 0.55 !important; transition: opacity 0.15s ease, color 0.15s ease !important; }
#right_bar table tr:hover td a.delete { color: var(--pinboard-destroy) !important; opacity: 1 !important; }
#right_bar input#key {
  background: var(--pinboard-input-bg) !important;
  color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-radius: var(--pinboard-radius-sm) !important;
  padding: 4px 8px !important;
  box-sizing: border-box !important;
  font-size: 12px !important;
}
#right_bar input#key:focus { border-color: var(--pinboard-accent) !important; box-shadow: 0 0 0 2px var(--pinboard-accent-alpha) !important; outline: none !important; }
#right_bar input[type="submit"] {
  background: var(--pinboard-success) !important;
  color: var(--pinboard-btn-fg) !important;
  border: none !important;
  border-radius: var(--pinboard-radius-sm) !important;
  padding: 4px 10px !important;
  margin-left: 6px !important;
  cursor: pointer !important;
  font-size: 12px !important;
  transition: background 0.15s ease !important;
}
#right_bar input[type="submit"]:hover { background: var(--pinboard-success-hover) !important; }

/* ---- Tag cloud ---- */
#tag_cloud { max-width: 100% !important; overflow-wrap: break-word !important; }
#tag_cloud a, #tag_cloud a.tag { color: var(--pinboard-accent) !important; }
#tag_cloud a:hover, #tag_cloud a.tag:hover { color: var(--pinboard-link-hover) !important; }
#tag_cloud_header a, a.tag_heading_selected { color: var(--pinboard-muted-soft) !important; }
#tag_cloud_header a:hover { color: var(--pinboard-accent) !important; }

/* ---- Tweets page searchbox ---- */
#tweet_searchbox { margin-bottom: 12px !important; }
#tweet_searchbox form { display: flex !important; flex-direction: column !important; gap: var(--pinboard-space-form-gap) !important; margin: 0 !important; }
#tweet_searchbox br { display: none !important; }
#tweet_searchbox #search_query_field {
  width: 100% !important; box-sizing: border-box !important;
  background: var(--pinboard-input-bg) !important; color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-radius: var(--pinboard-radius-sm) !important;
  padding: 6px 10px !important; font-size: 12px !important;
}
#tweet_searchbox #search_query_field:focus { border-color: var(--pinboard-accent) !important; box-shadow: 0 0 0 2px var(--pinboard-accent-alpha) !important; outline: none !important; }
#tweet_searchbox input[type="submit"] {
  background: var(--pinboard-success) !important; color: var(--pinboard-btn-fg) !important;
  border: none !important; border-radius: var(--pinboard-radius-sm) !important;
  padding: 5px 14px !important; cursor: pointer !important;
  font-size: 12px !important; align-self: flex-start !important;
  transition: background 0.15s ease !important;
}
#tweet_searchbox input[type="submit"]:hover { background: var(--pinboard-success-hover) !important; }

/* ---- Forms (global) ---- */
input[type="text"], input:not([type]), input[type="password"], textarea, select {
  background: var(--pinboard-input-bg) !important; color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  box-sizing: border-box !important; max-width: 100% !important;
}
input[type="text"]:focus, input:not([type]):focus, textarea:focus, select:focus { border-color: var(--pinboard-accent) !important; outline: none !important; }
input[type="submit"], input[type="button"] {
  background: var(--pinboard-accent) !important; color: var(--pinboard-btn-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-accent) !important;
  border-radius: var(--pinboard-radius-sm) !important;
  padding: 4px 12px !important;
  cursor: pointer !important;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease !important;
}
input[type="submit"]:hover, input[type="button"]:hover { background: var(--pinboard-link-hover) !important; border-color: var(--pinboard-link-hover) !important; }
input[type="reset"], input[type="reset"].reset, button[type="reset"] {
  background: var(--pinboard-bg-surface) !important; color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-radius: var(--pinboard-radius-sm) !important;
  padding: 4px 12px !important;
  cursor: pointer !important;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease !important;
}
input[type="reset"]:hover, input[type="reset"].reset:hover, button[type="reset"]:hover { background: var(--pinboard-row-hover) !important; border-color: var(--pinboard-accent) !important; color: var(--pinboard-accent) !important; }
input[type="checkbox"], input[type="radio"] { accent-color: var(--pinboard-accent) !important; }
.suggested_tag { color: var(--pinboard-success) !important; cursor: pointer !important; }
#edit_bookmark_form { background: var(--pinboard-bg-surface) !important; border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important; }

/* ---- Tag completion popup (Pin.Tags widget on /add/, edit-bookmark, note-add) ---- */
.pin-ac { z-index: 1000 !important; }
.pin-ac .bd {
  background: var(--pinboard-bg-surface) !important;
  color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-radius: var(--pinboard-radius-sm) !important;
  box-shadow: 0 2px 8px var(--pinboard-accent-alpha) !important;
}
.pin-ac li {
  background: transparent !important;
  color: var(--pinboard-fg) !important;
  padding: 4px 10px !important;
  font-size: 12px !important;
}
.pin-ac li:hover { background: var(--pinboard-accent-alpha) !important; color: var(--pinboard-fg) !important; cursor: pointer !important; }
.pin-ac .active { background: var(--pinboard-selection-bg) !important; color: var(--pinboard-selection-fg) !important; }

/* ---- Settings page ---- */
#settings_panel { background: var(--pinboard-bg-surface) !important; }
.settings_tabs { border-color: var(--pinboard-border) !important; }
.settings_tab { color: var(--pinboard-muted) !important; padding: 6px 12px !important; border-bottom-color: var(--pinboard-border) !important; }
.settings_tab a { color: inherit !important; text-decoration: none !important; }
.settings_tab:hover { color: var(--pinboard-accent) !important; }
.settings_tab_selected {
  color: var(--pinboard-accent) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-top: 2px solid var(--pinboard-accent) !important;
  border-bottom-color: var(--pinboard-bg-surface) !important;
  background: var(--pinboard-bg-surface) !important;
  font-weight: bold !important;
  margin-bottom: -1px !important;
}
.settings_tab_selected a { color: var(--pinboard-accent) !important; }
[class*="settings_tab_spacer"] { border-bottom-color: var(--pinboard-border) !important; }
.settings_heading { color: var(--pinboard-muted) !important; background: transparent !important; border-bottom: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important; padding-bottom: 6px !important; }
a.help { color: var(--pinboard-muted-soft) !important; background: var(--pinboard-accent-soft) !important; }
.email_secret { color: var(--pinboard-accent) !important; }
#settings_tab_panes { border: none !important; }
#settings_tab_panes table td { color: var(--pinboard-fg) !important; }

/* ---- Profile page ---- */
.service_box, .help_box {
  background: var(--pinboard-bg-surface) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-radius: var(--pinboard-radius-md) !important;
  padding: 16px !important;
  box-sizing: border-box !important;
  margin-bottom: 12px !important;
}
.service_box .service_box { border: none !important; padding: 0 !important; margin: 0 !important; background: transparent !important; border-radius: 0 !important; width: auto !important; box-sizing: border-box !important; }
#profile_left_column { margin-right: 20px !important; }
#profile_right_column { width: 430px !important; }
#profile_main_column h2, #profile_left_column h2, #profile_right_column h2 { color: var(--pinboard-muted) !important; }
#profile_main_column table td, #profile_right_column table td { color: var(--pinboard-fg) !important; }

/* ---- Notes ---- */
.note { border-bottom: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important; }
.note a { color: var(--pinboard-accent) !important; }
.note .note { border: none !important; padding: 0 !important; margin: 0 !important; background: transparent !important; border-radius: 0 !important; }
#note_right_column { background: var(--pinboard-bg-surface) !important; color: var(--pinboard-fg) !important; padding: 16px !important; border-left: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important; }

/* ---- Bulk edit ---- */
#bulk_top_bar, #bulk_edit_box { background: var(--pinboard-bg-surface) !important; border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important; color: var(--pinboard-fg) !important; }

/* ---- Save bookmark popup ---- */
#popup_header { background: var(--pinboard-bg-surface) !important; color: var(--pinboard-fg) !important; }
.formtable td { color: var(--pinboard-fg) !important; }
.bookmark_count, .bookmark_count_box { color: var(--pinboard-muted) !important; }
.user_navbar a { color: var(--pinboard-accent) !important; }
.rss_link, .rss_linkbox a { color: var(--pinboard-muted-soft) !important; }

/* ---- Bundles (P4-table) — /u/<user>/bundles/ ---- */
#main_column form[name="sort"] > table { width: 100% !important; max-width: 880px !important; border-collapse: separate !important; border-spacing: 0 4px !important; margin-top: 8px !important; }
#main_column form[name="sort"] table tr { background: transparent !important; border-radius: var(--pinboard-radius-md) !important; }
#main_column form[name="sort"] table tr:hover { background: var(--pinboard-row-hover) !important; }
#main_column form[name="sort"] table td { padding: 6px 10px !important; vertical-align: middle !important; border: none !important; }
#main_column form[name="sort"] table td[style*="text-align:right"] { min-width: 160px !important; padding-right: 14px !important; white-space: nowrap !important; }
#main_column form[name="sort"] table input[name^="id_"] {
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  background: var(--pinboard-input-bg) !important;
  color: var(--pinboard-fg) !important;
  width: 32px !important;
  border-radius: var(--pinboard-radius-sm) !important;
  text-align: center !important;
}
#main_column form[name="sort"] table input[name^="id_"]:focus { border-color: var(--pinboard-accent) !important; box-shadow: 0 0 0 2px var(--pinboard-accent-alpha) !important; outline: none !important; }
#main_column form[name="sort"] table a.bundle { font-weight: var(--pinboard-weight-heading) !important; font-style: normal !important; letter-spacing: 0.01em !important; padding: 2px 4px !important; border-radius: var(--pinboard-radius-sm) !important; }
#main_column form[name="sort"] table a[style*="color:#aaa"],
#main_column form[name="sort"] table a[style*="color: #aaa"] { color: var(--pinboard-muted) !important; opacity: 1 !important; text-decoration: none !important; font-size: 12px !important; margin-left: 4px !important; }
#main_column form[name="sort"] table a[style*="color:#aaa"]:hover { color: var(--pinboard-accent) !important; text-decoration: underline !important; }
#main_column form[name="sort"] table td a.edit { color: var(--pinboard-muted) !important; opacity: 0.8 !important; transition: opacity 0.15s ease !important; }
#main_column form[name="sort"] table td a.destroy { color: var(--pinboard-destroy) !important; opacity: 0.85 !important; font-weight: var(--pinboard-weight-heading) !important; }
#main_column form[name="sort"] table tr:hover td a.edit { color: var(--pinboard-accent) !important; opacity: 1 !important; }
#main_column form[name="sort"] table tr:hover td a.destroy { opacity: 1 !important; }

/* ---- Pagination ---- */
.next_prev, .next_prev_widget a { color: var(--pinboard-accent) !important; }
.next_prev:hover, .next_prev_widget a:hover { color: var(--pinboard-link-hover) !important; }
#nextprev a.edit { color: var(--pinboard-muted-soft) !important; }

/* ---- Logged-out landing page (https://pinboard.in/) ---- */
#main_welcome, .homepage_quad { color: var(--pinboard-fg) !important; }
.homepage_heading { color: var(--pinboard-fg-strong) !important; font-weight: var(--pinboard-weight-heading) !important; }
.homepage_subheading { color: var(--pinboard-muted) !important; }
.signup_button,
.signup_button[style*="background"] {
  background: var(--pinboard-btn-bg) !important;
  color: var(--pinboard-btn-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-btn-bg) !important;
  border-radius: var(--pinboard-radius-sm) !important;
  padding: 10px 16px !important;
  text-align: center !important;
  font-weight: var(--pinboard-weight-heading) !important;
  cursor: pointer !important;
  transition: background 0.15s ease, border-color 0.15s ease !important;
}
.signup_button:hover { background: var(--pinboard-btn-bg-hover) !important; border-color: var(--pinboard-btn-bg-hover) !important; }
#blurb_div { color: var(--pinboard-fg) !important; }
.blurb_column { color: var(--pinboard-fg) !important; }
#blurb_div a { text-decoration: none !important; color: var(--pinboard-fg) !important; display: block !important; }
.blurb_box {
  background: var(--pinboard-bg-surface) !important;
  color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-radius: var(--pinboard-radius-md) !important;
  padding: 12px 14px !important;
  margin-bottom: 10px !important;
  transition: background 0.15s ease, border-color 0.15s ease !important;
}
#blurb_div a:hover .blurb_box { background: var(--pinboard-row-hover) !important; border-color: var(--pinboard-accent-alpha) !important; }
.magazine_title { color: var(--pinboard-accent) !important; font-weight: var(--pinboard-weight-heading) !important; }
.blurb { color: var(--pinboard-fg) !important; opacity: 0.85 !important; }
#language_box { color: var(--pinboard-muted) !important; }
#language_box p { margin: 2px 0 !important; }
#language_box a { color: var(--pinboard-muted) !important; padding: 1px 6px !important; border-radius: var(--pinboard-radius-sm) !important; text-decoration: none !important; }
#language_box a:hover { color: var(--pinboard-accent) !important; background: var(--pinboard-accent-alpha) !important; }
#language_box a[style*="background:#ffa"],
#language_box a[style*="background: #ffa"] { background: var(--pinboard-accent-alpha) !important; color: var(--pinboard-accent) !important; }
.nli { color: var(--pinboard-muted) !important; }
.nav_nli { color: var(--pinboard-accent) !important; text-decoration: none !important; }
.nav_nli:hover { color: var(--pinboard-link-hover) !important; }

/* ---- Footer / colophon ---- */
#footer, .colophon, .colophon a { color: var(--pinboard-muted-soft) !important; }

/* ---- Scrollbars (Webkit + Firefox standard) ---- */
html, body, textarea, .description, .pin-ac .bd {
  scrollbar-width: thin !important;
  scrollbar-color: var(--pinboard-muted) var(--pinboard-bg-surface) !important;
}
::-webkit-scrollbar { width: 10px !important; height: 10px !important; }
::-webkit-scrollbar-track { background: var(--pinboard-bg-surface) !important; border-left: 1px solid var(--pinboard-border) !important; }
::-webkit-scrollbar-thumb { background: var(--pinboard-muted-soft) !important; border: 2px solid var(--pinboard-bg-surface) !important; border-radius: 6px !important; }
::-webkit-scrollbar-thumb:hover { background: var(--pinboard-accent) !important; }
::-webkit-scrollbar-corner { background: var(--pinboard-bg-surface) !important; }

/* ---- Global anchor fallbacks ---- */
a, a:link { color: var(--pinboard-accent) !important; }
a:hover { color: var(--pinboard-link-hover) !important; }
a:visited { color: var(--pinboard-link-visited) !important; }
a:focus-visible { outline: 2px solid var(--pinboard-focus-ring) !important; outline-offset: 2px !important; }
h2 { color: var(--pinboard-muted) !important; }
hr { border-color: var(--pinboard-border) !important; }

/* ---- Bundle slot input override: already in inline_base_rules — redundant here ---- */

/* ---- ::selection (also in _base but themes may want explicit) ---- */
::selection { background: var(--pinboard-selection-bg) !important; color: var(--pinboard-selection-fg) !important; }
::-moz-selection { background: var(--pinboard-selection-bg) !important; color: var(--pinboard-selection-fg) !important; }

/* === patterns layer (tokens.patterns) === */
a.tag::before { content: "#" !important; }
#search_query_field:focus, #banner_searchbox input[type="text"]:focus, #right_bar input#key:focus, #tweet_searchbox #search_query_field:focus {
  box-shadow: 0 0 0 2px var(--pinboard-accent-alpha) !important;
  outline: none !important;
}
.bookmark { border-left: 3px solid var(--pinboard-border) !important; border-bottom: none !important; border-top: none !important; border-right: none !important; }


/* === theme overrides (tokens.overrides.css) === */
/* ======== overrides-patch for gruvbox-dark (auto-generated by tools/generate-overrides.mjs) ========
 * Restores shipped decls the composer's token-driven output doesn't match.
 */
body#pinboard { font-weight: 450 !important; }
#banner { border-radius: 4px !important; padding: 8px 16px !important; }
#search_query_field { width: 100% !important; }
.bookmark { background: #3c3836 !important; padding: 12px 14px !important; border-radius: 0 !important; margin-bottom: 4px !important; }
body:not(#pinboard) { font-weight: 450 !important; }
#search_query_field:focus { background: #3c3836 !important; }
#banner_searchbox input[type="text"]:focus { background: #3c3836 !important; }
.search_button input[type="submit"] { font-weight: 700 !important; text-transform: uppercase !important; letter-spacing: 0.05em !important; }
.search_button input[type="submit"]:hover { background: #b8bb26 !important; border-color: #b8bb26 !important; }
a.url_display { color: #fabd2f !important; font-size: 12px !important; }
a.url_link { background: #282828 !important; padding: 1px 5px !important; border: 1px solid #504945 !important; }
.description { color: #d5c4a1 !important; }
.description blockquote { color: #bdae93 !important; border-left: 3px solid #fabd2f !important; }
a.tag { font-weight: 700 !important; }
a.tag:hover { color: #83a598 !important; text-decoration: underline !important; }
#right_bar h3 { color: #d3869b !important; }
#right_bar h4 { color: #d3869b !important; }
#right_bar b { color: #d3869b !important; }
a.tag.selected { color: #fabd2f !important; }
a.sort_order_selected { background: #3c3836 !important; color: #fabd2f !important; }
input[type="text"]:focus { background: #3c3836 !important; }
input:not([type]):focus { background: #3c3836 !important; }
textarea:focus { background: #3c3836 !important; }
select:focus { background: #3c3836 !important; }
input[type="submit"] { font-weight: 700 !important; }
input[type="button"] { font-weight: 700 !important; }
input[type="submit"]:hover { background: #b8bb26 !important; border-color: #b8bb26 !important; }
input[type="button"]:hover { background: #b8bb26 !important; border-color: #b8bb26 !important; }
.suggested_tag { color: #b8bb26 !important; }
.settings_tab_selected { border: 1px solid #504945 !important; }
.settings_heading { color: #d3869b !important; text-transform: uppercase !important; font-weight: 700 !important; letter-spacing: 0.05em !important; }
.note { border-bottom: 1px solid #504945 !important; }
#profile_main_column h2 { color: #d3869b !important; text-transform: uppercase !important; letter-spacing: 0.05em !important; }
#profile_left_column h2 { color: #d3869b !important; text-transform: uppercase !important; letter-spacing: 0.05em !important; }
#profile_right_column h2 { color: #d3869b !important; text-transform: uppercase !important; letter-spacing: 0.05em !important; }
#bulk_top_bar { border: 1px solid #504945 !important; }
#bulk_edit_box { border: 1px solid #504945 !important; }
h2 { color: #d3869b !important; }
#main_column form[name="sort"] table tr:hover { background: rgba(168,153,132,0.12) !important; }
#main_column form[name="sort"] table td { font-family: "IBM Plex Sans", "Inter", sans-serif !important; }
#main_column form[name="sort"] table input[name^="id_"] { width: 38px !important; min-width: 38px !important; max-width: 38px !important; padding: 3px 4px !important; margin-right: 10px !important; font-size: 12px !important; line-height: 1.2 !important; box-sizing: border-box !important; vertical-align: middle !important; border: 1px solid #504945 !important; background: #3c3836 !important; font-weight: 600 !important; }
#main_column form[name="sort"] table a.bundle { letter-spacing: 0.02em !important; }
#main_column form[name="sort"] table td a.destroy { opacity: 0.9 !important; }
#right_bar table td a.delete { color: #928374 !important; }
#right_bar input#key { border: 1px solid #504945 !important; border-radius: 4px !important; }
#right_bar input#key:focus { box-shadow: 0 0 0 2px rgba(131,165,152,0.25) !important; }
#right_bar input[type="submit"] { color: #fbf1c7 !important; border-radius: 4px !important; }
#tweet_searchbox #search_query_field { border: 1px solid #504945 !important; border-radius: 4px !important; font-size: 13px !important; }
#tweet_searchbox #search_query_field:focus { box-shadow: 0 0 0 2px rgba(131,165,152,0.25) !important; }
#tweet_searchbox input[type="submit"] { color: #fbf1c7 !important; border-radius: 4px !important; }`
  },

  // ---- 12. Rose Pine ----
  "rose-pine": {
    name: "Ros\u00e9 Pine",
    desc: "All natural pine, faux fur, and a bit of soho vibes",
    css: `:root {
  --pinboard-bg: #191724;
  --pinboard-bg-surface: #1f1d2e;
  --pinboard-fg: #e0def4;
  --pinboard-fg-strong: #ebbcba;
  --pinboard-muted: #908caa;
  --pinboard-muted-soft: #6e6a86;
  --pinboard-border: #26233a;
  --pinboard-border-strong: #403d52;
  --pinboard-border-soft: #393552;
  --pinboard-accent: #c4a7e7;
  --pinboard-accent-hover: #ebbcba;
  --pinboard-accent-soft: #26233a;
  --pinboard-accent-alpha: rgba(196,167,231,0.25);
  --pinboard-input-bg: #26233a;
  --pinboard-private-bg: #261e1a;
  --pinboard-private-accent: #f6c177;
  --pinboard-selection-bg: #3e3a5e;
  --pinboard-selection-fg: #e0def4;
  --pinboard-tag-bg: transparent;
  --pinboard-tag-fg: #9ccfd8;
  --pinboard-row-hover: #26233a;
  --pinboard-destroy: #eb6f92;
  --pinboard-btn-bg: #c4a7e7;
  --pinboard-btn-fg: #191724;
  --pinboard-success: #9ccfd8;
  --pinboard-success-hover: #ebbcba;
  --pinboard-url-link-bg: #26233a;
  --pinboard-url-link-fg: #f6c177;
  --pinboard-link-hover: #ebbcba;
  --pinboard-link-visited: #c4a7e7;
  --pinboard-focus-ring: #c4a7e7;
  --pinboard-unread: #eb6f92;
  --pinboard-btn-bg-hover: #ebbcba;
  --pinboard-font-family: "Lora", "Georgia", "Noto Serif", serif;
  --pinboard-font-size-base: 14px;
  --pinboard-font-size-sm: 12px;
  --pinboard-font-size-lg: 15px;
  --pinboard-font-size-xs: 11px;
  --pinboard-line-height: 1.65;
  --pinboard-weight-body: 400;
  --pinboard-weight-heading: 700;
  --pinboard-space-unit: 4px;
  --pinboard-space-bookmark-gap: 8px;
  --pinboard-space-main-padding: 12px;
  --pinboard-space-sub-banner-y: 8px;
  --pinboard-space-right-bar-gap: 12px;
  --pinboard-space-form-gap: 8px;
  --pinboard-radius-sm: 4px;
  --pinboard-radius-md: 6px;
  --pinboard-radius-lg: 8px;
  --pinboard-border-width: 1px;
  --pinboard-border-style: solid;
  --pinboard-border-hairline: 1px dotted #26233a;
}

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

/* override.generic-bgcolor — defensive against legacy HTML attr */
[bgcolor] { background-color: transparent !important; }

/* override.generic-html-color — defensive against legacy <font> */
font[color], font[size] { color: inherit !important; font-size: inherit !important; }

/* override.generic-fixed-width — defensive against layout tables */
table[width]:not([width="100%"]) { width: auto !important; max-width: 100% !important; }

/* === selection (applied globally; composers may override scoped) === */
::selection          { background: var(--pinboard-selection-bg); color: var(--pinboard-selection-fg); }
::-moz-selection     { background: var(--pinboard-selection-bg); color: var(--pinboard-selection-fg); }

/* === composer: classic-list-v2 — canonical surface inventory === */

/* ---- App shell typography (body#pinboard) ---- */
body#pinboard {
  background: var(--pinboard-bg) !important;
  color: var(--pinboard-fg) !important;
  font-family: var(--pinboard-font-family) !important;
  font-size: 14px !important;
  line-height: var(--pinboard-line-height) !important;
}
body#pinboard table, body#pinboard td, body#pinboard th,
body#pinboard p, body#pinboard b, body#pinboard strong,
body#pinboard label, body#pinboard span, body#pinboard li:not(.pin-ac li),
body#pinboard dd, body#pinboard dt { color: inherit !important; }

/* ---- Popup / iframe frame (body:not(#pinboard)) ---- */
body:not(#pinboard) {
  background: var(--pinboard-bg) !important;
  color: var(--pinboard-fg) !important;
  font-family: var(--pinboard-font-family) !important;
}
body:not(#pinboard) table, body:not(#pinboard) td,
body:not(#pinboard) p, body:not(#pinboard) label,
body:not(#pinboard) span { color: inherit !important; }
body:not(#pinboard) #popup_header { background: transparent !important; color: var(--pinboard-fg) !important; }

/* ---- Banner & navigation ---- */
#banner { background: var(--pinboard-bg-surface) !important; border-color: var(--pinboard-border) !important; max-width: 1030px !important; box-sizing: border-box !important; }
#banner a, #top_menu a, .banner_username { color: var(--pinboard-accent) !important; }
#banner a:hover, #top_menu a:hover { color: var(--pinboard-link-hover) !important; }
#pinboard_name a { color: var(--pinboard-accent) !important; font-weight: var(--pinboard-weight-heading) !important; }
#sub_banner { background: var(--pinboard-bg-surface) !important; border-color: var(--pinboard-border) !important; }
#sub_banner a { color: var(--pinboard-muted) !important; }
#sub_banner a:hover, #sub_banner a.selected { color: var(--pinboard-accent) !important; }

/* ---- Search (banner + main) ---- */
#searchbox { margin-bottom: 12px !important; }
a.bundle { color: var(--pinboard-accent) !important; }
a.bundle:hover { color: var(--pinboard-link-hover) !important; }
#search_query_field, #banner_searchbox input[type="text"] {
  background: var(--pinboard-input-bg) !important;
  color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  box-sizing: border-box !important;
}
#search_query_field:focus, #banner_searchbox input[type="text"]:focus { border-color: var(--pinboard-accent) !important; outline: none !important; }
.search_button input[type="submit"] {
  background: var(--pinboard-accent) !important;
  color: var(--pinboard-btn-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-accent) !important;
  cursor: pointer !important;
}
.search_button input[type="submit"]:hover { background: var(--pinboard-link-hover) !important; }

/* ---- Bookmark list ---- */
.bookmark {
  background: var(--pinboard-bg-surface) !important; border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important; border-radius: var(--pinboard-radius-md) !important; padding: 12px 16px !important; margin-bottom: 6px !important;
  display: flex !important;
  align-items: flex-start !important;
}
.bookmark { transition: box-shadow 0.2s ease !important; }
.bookmark .display { float: none !important; flex: 1 !important; width: auto !important; min-width: 0 !important; }
.star, .selected_star { margin-left: 0 !important; margin-right: 6px !important; float: none !important; flex-shrink: 0 !important; }
.star { color: var(--pinboard-border) !important; }
.selected_star { color: var(--pinboard-private-accent) !important; }

a.bookmark_title { color: var(--pinboard-accent) !important; font-size: 15px !important; text-decoration: none !important; font-weight: var(--pinboard-weight-heading) !important; }
a.bookmark_title:hover { color: var(--pinboard-link-hover) !important; text-decoration: underline !important; }
a.url_display, a.when, a.cached { color: var(--pinboard-muted-soft) !important; font-size: 11px !important; }
a.url_link {
  color: var(--pinboard-url-link-fg) !important;
  background: var(--pinboard-url-link-bg) !important;
  padding: 1px 6px !important;
  border-radius: var(--pinboard-radius-lg) !important;
  font-size: 11px !important;
}
.description { color: var(--pinboard-fg) !important; opacity: 0.85 !important; line-height: var(--pinboard-line-height) !important; }
.description blockquote { color: var(--pinboard-muted) !important; border-left: 3px solid var(--pinboard-accent-alpha) !important; padding-left: 10px !important; margin: 4px 0 !important; }

a.tag {
  color: var(--pinboard-tag-fg) !important;
  background: var(--pinboard-tag-bg) !important;
  padding: 1px 8px !important;
  border-radius: var(--pinboard-radius-lg) !important;
  font-size: 11px !important;
  text-decoration: none !important;
}
a.tag:hover { color: var(--pinboard-tag-fg) !important; background: var(--pinboard-accent-alpha) !important; text-decoration: none !important; }
a.tag.selected { color: var(--pinboard-destroy) !important; font-weight: bold !important; }
a.sort_order_selected { background: var(--pinboard-tag-bg) !important; color: var(--pinboard-accent) !important; }

a.unread { color: var(--pinboard-destroy) !important; font-weight: bold !important; }
.edit_links a, a.copy_link { color: var(--pinboard-muted-soft) !important; }
.edit_links a:hover { color: var(--pinboard-fg) !important; }
a.copy_link { color: var(--pinboard-accent) !important; }
a.delete, a.destroy { color: var(--pinboard-destroy) !important; }

/* ---- Private bookmarks ---- */
.bookmark.private,
.bookmark.private[style*="background"] { background: var(--pinboard-private-bg) !important; box-shadow: inset 3px 0 0 var(--pinboard-private-accent) !important; border-top-color: transparent !important; border-right-color: transparent !important; border-left-color: transparent !important; }

/* ---- Right bar ---- */
#right_bar {
  background: var(--pinboard-bg-surface) !important;
  color: var(--pinboard-fg) !important;
  padding: var(--pinboard-space-right-bar-gap) !important;
  box-sizing: border-box !important;
  overflow: hidden !important;
  word-wrap: break-word !important;
}
#right_bar h3, #right_bar h4, #right_bar b { color: var(--pinboard-muted) !important; }
#right_bar a { color: var(--pinboard-accent) !important; }
#right_bar a:hover { color: var(--pinboard-link-hover) !important; }
#right_bar table tr[onmouseover] { background: transparent !important; }
#right_bar table tr[onmouseover]:hover { background: var(--pinboard-row-hover) !important; }
#right_bar table td a.tag { color: var(--pinboard-fg) !important; }
#right_bar table td a.delete { color: var(--pinboard-muted-soft) !important; font-size: 11px !important; opacity: 0.55 !important; transition: opacity 0.15s ease, color 0.15s ease !important; }
#right_bar table tr:hover td a.delete { color: var(--pinboard-destroy) !important; opacity: 1 !important; }
#right_bar input#key {
  background: var(--pinboard-input-bg) !important;
  color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-radius: var(--pinboard-radius-sm) !important;
  padding: 4px 8px !important;
  box-sizing: border-box !important;
  font-size: 12px !important;
}
#right_bar input#key:focus { border-color: var(--pinboard-accent) !important; box-shadow: 0 0 0 2px var(--pinboard-accent-alpha) !important; outline: none !important; }
#right_bar input[type="submit"] {
  background: var(--pinboard-success) !important;
  color: var(--pinboard-btn-fg) !important;
  border: none !important;
  border-radius: var(--pinboard-radius-sm) !important;
  padding: 4px 10px !important;
  margin-left: 6px !important;
  cursor: pointer !important;
  font-size: 12px !important;
  transition: background 0.15s ease !important;
}
#right_bar input[type="submit"]:hover { background: var(--pinboard-success-hover) !important; }

/* ---- Tag cloud ---- */
#tag_cloud { max-width: 100% !important; overflow-wrap: break-word !important; }
#tag_cloud a, #tag_cloud a.tag { color: var(--pinboard-accent) !important; }
#tag_cloud a:hover, #tag_cloud a.tag:hover { color: var(--pinboard-link-hover) !important; }
#tag_cloud_header a, a.tag_heading_selected { color: var(--pinboard-muted-soft) !important; }
#tag_cloud_header a:hover { color: var(--pinboard-accent) !important; }

/* ---- Tweets page searchbox ---- */
#tweet_searchbox { margin-bottom: 12px !important; }
#tweet_searchbox form { display: flex !important; flex-direction: column !important; gap: var(--pinboard-space-form-gap) !important; margin: 0 !important; }
#tweet_searchbox br { display: none !important; }
#tweet_searchbox #search_query_field {
  width: 100% !important; box-sizing: border-box !important;
  background: var(--pinboard-input-bg) !important; color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-radius: var(--pinboard-radius-sm) !important;
  padding: 6px 10px !important; font-size: 12px !important;
}
#tweet_searchbox #search_query_field:focus { border-color: var(--pinboard-accent) !important; box-shadow: 0 0 0 2px var(--pinboard-accent-alpha) !important; outline: none !important; }
#tweet_searchbox input[type="submit"] {
  background: var(--pinboard-success) !important; color: var(--pinboard-btn-fg) !important;
  border: none !important; border-radius: var(--pinboard-radius-sm) !important;
  padding: 5px 14px !important; cursor: pointer !important;
  font-size: 12px !important; align-self: flex-start !important;
  transition: background 0.15s ease !important;
}
#tweet_searchbox input[type="submit"]:hover { background: var(--pinboard-success-hover) !important; }

/* ---- Forms (global) ---- */
input[type="text"], input:not([type]), input[type="password"], textarea, select {
  background: var(--pinboard-input-bg) !important; color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  box-sizing: border-box !important; max-width: 100% !important;
}
input[type="text"]:focus, input:not([type]):focus, textarea:focus, select:focus { border-color: var(--pinboard-accent) !important; outline: none !important; }
input[type="submit"], input[type="button"] {
  background: var(--pinboard-accent) !important; color: var(--pinboard-btn-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-accent) !important;
  border-radius: var(--pinboard-radius-sm) !important;
  padding: 4px 12px !important;
  cursor: pointer !important;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease !important;
}
input[type="submit"]:hover, input[type="button"]:hover { background: var(--pinboard-link-hover) !important; border-color: var(--pinboard-link-hover) !important; }
input[type="reset"], input[type="reset"].reset, button[type="reset"] {
  background: var(--pinboard-bg-surface) !important; color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-radius: var(--pinboard-radius-sm) !important;
  padding: 4px 12px !important;
  cursor: pointer !important;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease !important;
}
input[type="reset"]:hover, input[type="reset"].reset:hover, button[type="reset"]:hover { background: var(--pinboard-row-hover) !important; border-color: var(--pinboard-accent) !important; color: var(--pinboard-accent) !important; }
input[type="checkbox"], input[type="radio"] { accent-color: var(--pinboard-accent) !important; }
.suggested_tag { color: var(--pinboard-success) !important; cursor: pointer !important; }
#edit_bookmark_form { background: var(--pinboard-bg-surface) !important; border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important; }

/* ---- Tag completion popup (Pin.Tags widget on /add/, edit-bookmark, note-add) ---- */
.pin-ac { z-index: 1000 !important; }
.pin-ac .bd {
  background: var(--pinboard-bg-surface) !important;
  color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-radius: var(--pinboard-radius-sm) !important;
  box-shadow: 0 2px 8px var(--pinboard-accent-alpha) !important;
}
.pin-ac li {
  background: transparent !important;
  color: var(--pinboard-fg) !important;
  padding: 4px 10px !important;
  font-size: 12px !important;
}
.pin-ac li:hover { background: var(--pinboard-accent-alpha) !important; color: var(--pinboard-fg) !important; cursor: pointer !important; }
.pin-ac .active { background: var(--pinboard-selection-bg) !important; color: var(--pinboard-selection-fg) !important; }

/* ---- Settings page ---- */
#settings_panel { background: var(--pinboard-bg-surface) !important; }
.settings_tabs { border-color: var(--pinboard-border) !important; }
.settings_tab { color: var(--pinboard-muted) !important; padding: 6px 12px !important; border-bottom-color: var(--pinboard-border) !important; }
.settings_tab a { color: inherit !important; text-decoration: none !important; }
.settings_tab:hover { color: var(--pinboard-accent) !important; }
.settings_tab_selected {
  color: var(--pinboard-accent) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-top: 2px solid var(--pinboard-accent) !important;
  border-bottom-color: var(--pinboard-bg-surface) !important;
  background: var(--pinboard-bg-surface) !important;
  font-weight: bold !important;
  margin-bottom: -1px !important;
}
.settings_tab_selected a { color: var(--pinboard-accent) !important; }
[class*="settings_tab_spacer"] { border-bottom-color: var(--pinboard-border) !important; }
.settings_heading { color: var(--pinboard-muted) !important; background: transparent !important; border-bottom: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important; padding-bottom: 6px !important; }
a.help { color: var(--pinboard-muted-soft) !important; background: var(--pinboard-accent-soft) !important; }
.email_secret { color: var(--pinboard-accent) !important; }
#settings_tab_panes { border: none !important; }
#settings_tab_panes table td { color: var(--pinboard-fg) !important; }

/* ---- Profile page ---- */
.service_box, .help_box {
  background: var(--pinboard-bg-surface) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-radius: var(--pinboard-radius-md) !important;
  padding: 16px !important;
  box-sizing: border-box !important;
  margin-bottom: 12px !important;
}
.service_box .service_box { border: none !important; padding: 0 !important; margin: 0 !important; background: transparent !important; border-radius: 0 !important; width: auto !important; box-sizing: border-box !important; }
#profile_left_column { margin-right: 20px !important; }
#profile_right_column { width: 430px !important; }
#profile_main_column h2, #profile_left_column h2, #profile_right_column h2 { color: var(--pinboard-muted) !important; }
#profile_main_column table td, #profile_right_column table td { color: var(--pinboard-fg) !important; }

/* ---- Notes ---- */
.note { border-bottom: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important; }
.note a { color: var(--pinboard-accent) !important; }
.note .note { border: none !important; padding: 0 !important; margin: 0 !important; background: transparent !important; border-radius: 0 !important; }
#note_right_column { background: var(--pinboard-bg-surface) !important; color: var(--pinboard-fg) !important; padding: 16px !important; border-left: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important; }

/* ---- Bulk edit ---- */
#bulk_top_bar, #bulk_edit_box { background: var(--pinboard-bg-surface) !important; border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important; color: var(--pinboard-fg) !important; }

/* ---- Save bookmark popup ---- */
#popup_header { background: var(--pinboard-bg-surface) !important; color: var(--pinboard-fg) !important; }
.formtable td { color: var(--pinboard-fg) !important; }
.bookmark_count, .bookmark_count_box { color: var(--pinboard-muted) !important; }
.user_navbar a { color: var(--pinboard-accent) !important; }
.rss_link, .rss_linkbox a { color: var(--pinboard-muted-soft) !important; }

/* ---- Bundles (P4-table) — /u/<user>/bundles/ ---- */
#main_column form[name="sort"] > table { width: 100% !important; max-width: 880px !important; border-collapse: separate !important; border-spacing: 0 4px !important; margin-top: 8px !important; }
#main_column form[name="sort"] table tr { background: transparent !important; border-radius: var(--pinboard-radius-md) !important; }
#main_column form[name="sort"] table tr:hover { background: var(--pinboard-row-hover) !important; }
#main_column form[name="sort"] table td { padding: 6px 10px !important; vertical-align: middle !important; border: none !important; }
#main_column form[name="sort"] table td[style*="text-align:right"] { min-width: 160px !important; padding-right: 14px !important; white-space: nowrap !important; }
#main_column form[name="sort"] table input[name^="id_"] {
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  background: var(--pinboard-input-bg) !important;
  color: var(--pinboard-fg) !important;
  width: 32px !important;
  border-radius: var(--pinboard-radius-sm) !important;
  text-align: center !important;
}
#main_column form[name="sort"] table input[name^="id_"]:focus { border-color: var(--pinboard-accent) !important; box-shadow: 0 0 0 2px var(--pinboard-accent-alpha) !important; outline: none !important; }
#main_column form[name="sort"] table a.bundle { font-weight: var(--pinboard-weight-heading) !important; font-style: normal !important; letter-spacing: 0.01em !important; padding: 2px 4px !important; border-radius: var(--pinboard-radius-sm) !important; }
#main_column form[name="sort"] table a[style*="color:#aaa"],
#main_column form[name="sort"] table a[style*="color: #aaa"] { color: var(--pinboard-muted) !important; opacity: 1 !important; text-decoration: none !important; font-size: 12px !important; margin-left: 4px !important; }
#main_column form[name="sort"] table a[style*="color:#aaa"]:hover { color: var(--pinboard-accent) !important; text-decoration: underline !important; }
#main_column form[name="sort"] table td a.edit { color: var(--pinboard-muted) !important; opacity: 0.8 !important; transition: opacity 0.15s ease !important; }
#main_column form[name="sort"] table td a.destroy { color: var(--pinboard-destroy) !important; opacity: 0.85 !important; font-weight: var(--pinboard-weight-heading) !important; }
#main_column form[name="sort"] table tr:hover td a.edit { color: var(--pinboard-accent) !important; opacity: 1 !important; }
#main_column form[name="sort"] table tr:hover td a.destroy { opacity: 1 !important; }

/* ---- Pagination ---- */
.next_prev, .next_prev_widget a { color: var(--pinboard-accent) !important; }
.next_prev:hover, .next_prev_widget a:hover { color: var(--pinboard-link-hover) !important; }
#nextprev a.edit { color: var(--pinboard-muted-soft) !important; }

/* ---- Logged-out landing page (https://pinboard.in/) ---- */
#main_welcome, .homepage_quad { color: var(--pinboard-fg) !important; }
.homepage_heading { color: var(--pinboard-fg-strong) !important; font-weight: var(--pinboard-weight-heading) !important; }
.homepage_subheading { color: var(--pinboard-muted) !important; }
.signup_button,
.signup_button[style*="background"] {
  background: var(--pinboard-btn-bg) !important;
  color: var(--pinboard-btn-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-btn-bg) !important;
  border-radius: var(--pinboard-radius-sm) !important;
  padding: 10px 16px !important;
  text-align: center !important;
  font-weight: var(--pinboard-weight-heading) !important;
  cursor: pointer !important;
  transition: background 0.15s ease, border-color 0.15s ease !important;
}
.signup_button:hover { background: var(--pinboard-btn-bg-hover) !important; border-color: var(--pinboard-btn-bg-hover) !important; }
#blurb_div { color: var(--pinboard-fg) !important; }
.blurb_column { color: var(--pinboard-fg) !important; }
#blurb_div a { text-decoration: none !important; color: var(--pinboard-fg) !important; display: block !important; }
.blurb_box {
  background: var(--pinboard-bg-surface) !important;
  color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-radius: var(--pinboard-radius-md) !important;
  padding: 12px 14px !important;
  margin-bottom: 10px !important;
  transition: background 0.15s ease, border-color 0.15s ease !important;
}
#blurb_div a:hover .blurb_box { background: var(--pinboard-row-hover) !important; border-color: var(--pinboard-accent-alpha) !important; }
.magazine_title { color: var(--pinboard-accent) !important; font-weight: var(--pinboard-weight-heading) !important; }
.blurb { color: var(--pinboard-fg) !important; opacity: 0.85 !important; }
#language_box { color: var(--pinboard-muted) !important; }
#language_box p { margin: 2px 0 !important; }
#language_box a { color: var(--pinboard-muted) !important; padding: 1px 6px !important; border-radius: var(--pinboard-radius-sm) !important; text-decoration: none !important; }
#language_box a:hover { color: var(--pinboard-accent) !important; background: var(--pinboard-accent-alpha) !important; }
#language_box a[style*="background:#ffa"],
#language_box a[style*="background: #ffa"] { background: var(--pinboard-accent-alpha) !important; color: var(--pinboard-accent) !important; }
.nli { color: var(--pinboard-muted) !important; }
.nav_nli { color: var(--pinboard-accent) !important; text-decoration: none !important; }
.nav_nli:hover { color: var(--pinboard-link-hover) !important; }

/* ---- Footer / colophon ---- */
#footer, .colophon, .colophon a { color: var(--pinboard-muted-soft) !important; }

/* ---- Scrollbars (Webkit + Firefox standard) ---- */
html, body, textarea, .description, .pin-ac .bd {
  scrollbar-width: thin !important;
  scrollbar-color: var(--pinboard-muted) var(--pinboard-bg-surface) !important;
}
::-webkit-scrollbar { width: 10px !important; height: 10px !important; }
::-webkit-scrollbar-track { background: var(--pinboard-bg-surface) !important; border-left: 1px solid var(--pinboard-border) !important; }
::-webkit-scrollbar-thumb { background: var(--pinboard-muted-soft) !important; border: 2px solid var(--pinboard-bg-surface) !important; border-radius: 6px !important; }
::-webkit-scrollbar-thumb:hover { background: var(--pinboard-accent) !important; }
::-webkit-scrollbar-corner { background: var(--pinboard-bg-surface) !important; }

/* ---- Global anchor fallbacks ---- */
a, a:link { color: var(--pinboard-accent) !important; }
a:hover { color: var(--pinboard-link-hover) !important; }
a:visited { color: var(--pinboard-link-visited) !important; }
a:focus-visible { outline: 2px solid var(--pinboard-focus-ring) !important; outline-offset: 2px !important; }
h2 { color: var(--pinboard-muted) !important; }
hr { border-color: var(--pinboard-border) !important; }

/* ---- Bundle slot input override: already in inline_base_rules — redundant here ---- */

/* ---- ::selection (also in _base but themes may want explicit) ---- */
::selection { background: var(--pinboard-selection-bg) !important; color: var(--pinboard-selection-fg) !important; }
::-moz-selection { background: var(--pinboard-selection-bg) !important; color: var(--pinboard-selection-fg) !important; }

/* === patterns layer (tokens.patterns) === */
#search_query_field:focus, #banner_searchbox input[type="text"]:focus, #right_bar input#key:focus, #tweet_searchbox #search_query_field:focus {
  box-shadow: 0 0 0 2px var(--pinboard-accent-alpha) !important;
  outline: none !important;
}
.bookmark { border-bottom: 1px solid var(--pinboard-border) !important; }
input[type="submit"], input[type="button"], .search_button input[type="submit"] { border-radius: 8px !important; }


/* === theme overrides (tokens.overrides.css) === */
/* ======== overrides-patch for rose-pine (auto-generated by tools/generate-overrides.mjs) ========
 * Restores shipped decls the composer's token-driven output doesn't match.
 */
body:not(#pinboard) { line-height: 1.65 !important; }
#banner { border-radius: 4px !important; padding: 8px 16px !important; }
#search_query_field { width: 100% !important; border: 1px solid #393552 !important; border-radius: 8px !important; }
#banner_searchbox input[type="text"] { border: 1px solid #393552 !important; border-radius: 8px !important; }
#search_query_field:focus { box-shadow: 0 0 0 2px rgba(196,167,231,0.15) !important; }
#banner_searchbox input[type="text"]:focus { box-shadow: 0 0 0 2px rgba(196,167,231,0.15) !important; }
.search_button input[type="submit"] { font-family: inherit !important; }
.bookmark { padding: 14px 16px !important; border-radius: 8px !important; margin-bottom: 8px !important; }
a.bookmark_title { color: #e0def4 !important; font-style: italic !important; font-weight: 500 !important; }
a.bookmark_title:hover { text-decoration: none !important; }
a.url_display { color: #f6c177 !important; font-size: 12px !important; font-family: -apple-system, sans-serif !important; font-style: normal !important; }
a.url_link { border-radius: 6px !important; font-family: -apple-system, sans-serif !important; font-style: normal !important; }
.description { color: #908caa !important; font-style: italic !important; }
.description blockquote { color: #e0def4 !important; border-left: 2px solid #c4a7e7 !important; padding-left: 12px !important; margin: 6px 0 !important; font-style: italic !important; }
a.tag { font-size: 12px !important; font-family: -apple-system, sans-serif !important; font-style: normal !important; }
a.tag:hover { color: #c4a7e7 !important; border-bottom: 1px solid #c4a7e7 !important; }
a.tag.selected { color: #ebbcba !important; }
a.sort_order_selected { background: #26233a !important; }
#right_bar h3 { color: #ebbcba !important; }
#right_bar h4 { color: #ebbcba !important; }
#right_bar b { color: #ebbcba !important; }
#right_bar input#key { background: #1f1d2e !important; border: 1px solid #403d52 !important; }
#right_bar input#key:focus { box-shadow: 0 0 0 2px rgba(196,167,231,0.22) !important; }
#right_bar input[type="submit"] { background: #ebbcba !important; }
#right_bar input[type="submit"]:hover { background: #f6c177 !important; }
#tweet_searchbox #search_query_field { background: #1f1d2e !important; border: 1px solid #403d52 !important; font-size: 13px !important; }
#tweet_searchbox #search_query_field:focus { box-shadow: 0 0 0 2px rgba(196,167,231,0.22) !important; }
#tweet_searchbox input[type="submit"] { background: #ebbcba !important; }
#tweet_searchbox input[type="submit"]:hover { background: #f6c177 !important; }
input[type="text"] { border: 1px solid #393552 !important; border-radius: 6px !important; }
input:not([type]) { border: 1px solid #393552 !important; border-radius: 6px !important; }
input[type="password"] { border: 1px solid #393552 !important; border-radius: 6px !important; }
textarea { border: 1px solid #393552 !important; border-radius: 6px !important; }
select { border: 1px solid #393552 !important; border-radius: 6px !important; }
input[type="text"]:focus { box-shadow: 0 0 0 2px rgba(196,167,231,0.15) !important; }
input:not([type]):focus { box-shadow: 0 0 0 2px rgba(196,167,231,0.15) !important; }
textarea:focus { box-shadow: 0 0 0 2px rgba(196,167,231,0.15) !important; }
select:focus { box-shadow: 0 0 0 2px rgba(196,167,231,0.15) !important; }
#edit_bookmark_form { border-radius: 8px !important; }
.settings_heading { color: #ebbcba !important; font-style: italic !important; }
.service_box { border-radius: 8px !important; }
.help_box { border-radius: 8px !important; }
#profile_main_column h2 { color: #ebbcba !important; }
#profile_left_column h2 { color: #ebbcba !important; }
#profile_right_column h2 { color: #ebbcba !important; }
#note_right_column { border-radius: 8px !important; }
#main_column form[name="sort"] > table { border-spacing: 0 6px !important; }
#main_column form[name="sort"] table tr:hover { background: rgba(196,167,231,0.08) !important; }
#main_column form[name="sort"] table td { padding: 7px 10px !important; font-family: "Lora", "Georgia", serif !important; }
#main_column form[name="sort"] table input[name^="id_"] { width: 38px !important; min-width: 38px !important; max-width: 38px !important; padding: 3px 4px !important; margin-right: 10px !important; font-size: 12px !important; line-height: 1.2 !important; box-sizing: border-box !important; vertical-align: middle !important; background: #1f1d2e !important; font-family: "Lora", "Georgia", serif !important; font-weight: 600 !important; }
#main_column form[name="sort"] table a.bundle { font-weight: 600 !important; font-style: italic !important; letter-spacing: 0.02em !important; border-radius: 3px !important; }
#main_column form[name="sort"] table a[style*="color:#aaa"] { font-style: italic !important; }
#main_column form[name="sort"] table a[style*="color: #aaa"] { font-style: italic !important; }
#main_column form[name="sort"] table td a.edit { font-style: italic !important; }
#main_column form[name="sort"] table td a.destroy { opacity: 0.9 !important; font-weight: 600 !important; font-style: italic !important; }
h2 { color: #ebbcba !important; }`
  },

  // ---- 13. GitHub Light ----
  "github-light": {
    name: "GitHub Light",
    desc: "Clean light theme inspired by GitHub's interface",
    css: `:root {
  --pinboard-bg: #f6f8fa;
  --pinboard-bg-surface: #ffffff;
  --pinboard-fg: #1f2328;
  --pinboard-muted: #656d76;
  --pinboard-muted-soft: #8c959f;
  --pinboard-border: #d0d7de;
  --pinboard-accent: #0969da;
  --pinboard-accent-hover: #0550ae;
  --pinboard-accent-alpha: rgba(9,105,218,0.2);
  --pinboard-accent-soft: #ddf4ff;
  --pinboard-input-bg: #ffffff;
  --pinboard-private-bg: #fffbeb;
  --pinboard-private-accent: #bf8700;
  --pinboard-selection-bg: #ddf4ff;
  --pinboard-selection-fg: #1f2328;
  --pinboard-tag-bg: #ddf4ff;
  --pinboard-tag-fg: #0550ae;
  --pinboard-row-hover: #f6f8fa;
  --pinboard-destroy: #cf222e;
  --pinboard-btn-bg: #0969da;
  --pinboard-btn-fg: #ffffff;
  --pinboard-success: #2da44e;
  --pinboard-success-hover: #2c974b;
  --pinboard-url-link-bg: #fff8c5;
  --pinboard-url-link-fg: #bf8700;
  --pinboard-link-hover: #0550ae;
  --pinboard-link-visited: #0969da;
  --pinboard-focus-ring: #0969da;
  --pinboard-fg-strong: #1f2328;
  --pinboard-border-strong: #d0d7de;
  --pinboard-border-soft: #d0d7de;
  --pinboard-btn-bg-hover: #0550ae;
  --pinboard-unread: #cf222e;
  --pinboard-font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif;
  --pinboard-font-size-base: 13px;
  --pinboard-font-size-sm: 12px;
  --pinboard-font-size-lg: 15px;
  --pinboard-font-size-xs: 11px;
  --pinboard-line-height: 1.5;
  --pinboard-weight-body: 400;
  --pinboard-weight-heading: 600;
  --pinboard-space-unit: 4px;
  --pinboard-space-bookmark-gap: 6px;
  --pinboard-space-main-padding: 12px;
  --pinboard-space-sub-banner-y: 8px;
  --pinboard-space-right-bar-gap: 12px;
  --pinboard-space-form-gap: 8px;
  --pinboard-radius-sm: 3px;
  --pinboard-radius-md: 6px;
  --pinboard-radius-lg: 6px;
  --pinboard-border-width: 1px;
  --pinboard-border-style: solid;
  --pinboard-border-hairline: 1px dotted #d0d7de;
}

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

/* override.generic-bgcolor — defensive against legacy HTML attr */
[bgcolor] { background-color: transparent !important; }

/* override.generic-html-color — defensive against legacy <font> */
font[color], font[size] { color: inherit !important; font-size: inherit !important; }

/* override.generic-fixed-width — defensive against layout tables */
table[width]:not([width="100%"]) { width: auto !important; max-width: 100% !important; }

/* === selection (applied globally; composers may override scoped) === */
::selection          { background: var(--pinboard-selection-bg); color: var(--pinboard-selection-fg); }
::-moz-selection     { background: var(--pinboard-selection-bg); color: var(--pinboard-selection-fg); }

/* === composer: classic-list-v2 — canonical surface inventory === */

/* ---- App shell typography (body#pinboard) ---- */
body#pinboard {
  background: var(--pinboard-bg) !important;
  color: var(--pinboard-fg) !important;
  font-family: var(--pinboard-font-family) !important;
  font-size: 13px !important;
  line-height: var(--pinboard-line-height) !important;
}
body#pinboard table, body#pinboard td, body#pinboard th,
body#pinboard p, body#pinboard b, body#pinboard strong,
body#pinboard label, body#pinboard span, body#pinboard li:not(.pin-ac li),
body#pinboard dd, body#pinboard dt { color: inherit !important; }

/* ---- Popup / iframe frame (body:not(#pinboard)) ---- */
body:not(#pinboard) {
  background: var(--pinboard-bg) !important;
  color: var(--pinboard-fg) !important;
  font-family: var(--pinboard-font-family) !important;
}
body:not(#pinboard) table, body:not(#pinboard) td,
body:not(#pinboard) p, body:not(#pinboard) label,
body:not(#pinboard) span { color: inherit !important; }
body:not(#pinboard) #popup_header { background: transparent !important; color: var(--pinboard-fg) !important; }

/* ---- Banner & navigation ---- */
#banner { background: var(--pinboard-bg-surface) !important; border-color: var(--pinboard-border) !important; max-width: 1030px !important; box-sizing: border-box !important; }
#banner a, #top_menu a, .banner_username { color: var(--pinboard-accent) !important; }
#banner a:hover, #top_menu a:hover { color: var(--pinboard-link-hover) !important; }
#pinboard_name a { color: var(--pinboard-accent) !important; font-weight: var(--pinboard-weight-heading) !important; }
#sub_banner { background: var(--pinboard-bg-surface) !important; border-color: var(--pinboard-border) !important; }
#sub_banner a { color: var(--pinboard-muted) !important; }
#sub_banner a:hover, #sub_banner a.selected { color: var(--pinboard-accent) !important; }

/* ---- Search (banner + main) ---- */
#searchbox { margin-bottom: 12px !important; }
a.bundle { color: var(--pinboard-accent) !important; }
a.bundle:hover { color: var(--pinboard-link-hover) !important; }
#search_query_field, #banner_searchbox input[type="text"] {
  background: var(--pinboard-input-bg) !important;
  color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  box-sizing: border-box !important;
}
#search_query_field:focus, #banner_searchbox input[type="text"]:focus { border-color: var(--pinboard-accent) !important; outline: none !important; }
.search_button input[type="submit"] {
  background: var(--pinboard-accent) !important;
  color: var(--pinboard-btn-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-accent) !important;
  cursor: pointer !important;
}
.search_button input[type="submit"]:hover { background: var(--pinboard-link-hover) !important; }

/* ---- Bookmark list ---- */
.bookmark {
  background: var(--pinboard-bg-surface) !important; border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important; border-radius: var(--pinboard-radius-md) !important; padding: 12px 16px !important; margin-bottom: 6px !important;
  display: flex !important;
  align-items: flex-start !important;
}
.bookmark { transition: box-shadow 0.2s ease !important; }
.bookmark .display { float: none !important; flex: 1 !important; width: auto !important; min-width: 0 !important; }
.star, .selected_star { margin-left: 0 !important; margin-right: 6px !important; float: none !important; flex-shrink: 0 !important; }
.star { color: var(--pinboard-border) !important; }
.selected_star { color: var(--pinboard-private-accent) !important; }

a.bookmark_title { color: var(--pinboard-accent) !important; font-size: 15px !important; text-decoration: none !important; font-weight: var(--pinboard-weight-heading) !important; }
a.bookmark_title:hover { color: var(--pinboard-link-hover) !important; text-decoration: underline !important; }
a.url_display, a.when, a.cached { color: var(--pinboard-muted-soft) !important; font-size: 11px !important; }
a.url_link {
  color: var(--pinboard-url-link-fg) !important;
  background: var(--pinboard-url-link-bg) !important;
  padding: 1px 6px !important;
  border-radius: var(--pinboard-radius-lg) !important;
  font-size: 11px !important;
}
.description { color: var(--pinboard-fg) !important; opacity: 0.85 !important; line-height: var(--pinboard-line-height) !important; }
.description blockquote { color: var(--pinboard-muted) !important; border-left: 3px solid var(--pinboard-accent-alpha) !important; padding-left: 10px !important; margin: 4px 0 !important; }

a.tag {
  color: var(--pinboard-tag-fg) !important;
  background: var(--pinboard-tag-bg) !important;
  padding: 1px 8px !important;
  border-radius: var(--pinboard-radius-lg) !important;
  font-size: 11px !important;
  text-decoration: none !important;
}
a.tag:hover { color: var(--pinboard-tag-fg) !important; background: var(--pinboard-accent-alpha) !important; text-decoration: none !important; }
a.tag.selected { color: var(--pinboard-destroy) !important; font-weight: bold !important; }
a.sort_order_selected { background: var(--pinboard-tag-bg) !important; color: var(--pinboard-accent) !important; }

a.unread { color: var(--pinboard-destroy) !important; font-weight: bold !important; }
.edit_links a, a.copy_link { color: var(--pinboard-muted-soft) !important; }
.edit_links a:hover { color: var(--pinboard-fg) !important; }
a.copy_link { color: var(--pinboard-accent) !important; }
a.delete, a.destroy { color: var(--pinboard-destroy) !important; }

/* ---- Private bookmarks ---- */
.bookmark.private,
.bookmark.private[style*="background"] { background: var(--pinboard-private-bg) !important; box-shadow: inset 3px 0 0 var(--pinboard-private-accent) !important; border-top-color: transparent !important; border-right-color: transparent !important; border-left-color: transparent !important; }

/* ---- Right bar ---- */
#right_bar {
  background: var(--pinboard-bg-surface) !important;
  color: var(--pinboard-fg) !important;
  padding: var(--pinboard-space-right-bar-gap) !important;
  box-sizing: border-box !important;
  overflow: hidden !important;
  word-wrap: break-word !important;
}
#right_bar h3, #right_bar h4, #right_bar b { color: var(--pinboard-muted) !important; }
#right_bar a { color: var(--pinboard-accent) !important; }
#right_bar a:hover { color: var(--pinboard-link-hover) !important; }
#right_bar table tr[onmouseover] { background: transparent !important; }
#right_bar table tr[onmouseover]:hover { background: var(--pinboard-row-hover) !important; }
#right_bar table td a.tag { color: var(--pinboard-fg) !important; }
#right_bar table td a.delete { color: var(--pinboard-muted-soft) !important; font-size: 11px !important; opacity: 0.55 !important; transition: opacity 0.15s ease, color 0.15s ease !important; }
#right_bar table tr:hover td a.delete { color: var(--pinboard-destroy) !important; opacity: 1 !important; }
#right_bar input#key {
  background: var(--pinboard-input-bg) !important;
  color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-radius: var(--pinboard-radius-sm) !important;
  padding: 4px 8px !important;
  box-sizing: border-box !important;
  font-size: 12px !important;
}
#right_bar input#key:focus { border-color: var(--pinboard-accent) !important; box-shadow: 0 0 0 2px var(--pinboard-accent-alpha) !important; outline: none !important; }
#right_bar input[type="submit"] {
  background: var(--pinboard-success) !important;
  color: var(--pinboard-btn-fg) !important;
  border: none !important;
  border-radius: var(--pinboard-radius-sm) !important;
  padding: 4px 10px !important;
  margin-left: 6px !important;
  cursor: pointer !important;
  font-size: 12px !important;
  transition: background 0.15s ease !important;
}
#right_bar input[type="submit"]:hover { background: var(--pinboard-success-hover) !important; }

/* ---- Tag cloud ---- */
#tag_cloud { max-width: 100% !important; overflow-wrap: break-word !important; }
#tag_cloud a, #tag_cloud a.tag { color: var(--pinboard-accent) !important; }
#tag_cloud a:hover, #tag_cloud a.tag:hover { color: var(--pinboard-link-hover) !important; }
#tag_cloud_header a, a.tag_heading_selected { color: var(--pinboard-muted-soft) !important; }
#tag_cloud_header a:hover { color: var(--pinboard-accent) !important; }

/* ---- Tweets page searchbox ---- */
#tweet_searchbox { margin-bottom: 12px !important; }
#tweet_searchbox form { display: flex !important; flex-direction: column !important; gap: var(--pinboard-space-form-gap) !important; margin: 0 !important; }
#tweet_searchbox br { display: none !important; }
#tweet_searchbox #search_query_field {
  width: 100% !important; box-sizing: border-box !important;
  background: var(--pinboard-input-bg) !important; color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-radius: var(--pinboard-radius-sm) !important;
  padding: 6px 10px !important; font-size: 12px !important;
}
#tweet_searchbox #search_query_field:focus { border-color: var(--pinboard-accent) !important; box-shadow: 0 0 0 2px var(--pinboard-accent-alpha) !important; outline: none !important; }
#tweet_searchbox input[type="submit"] {
  background: var(--pinboard-success) !important; color: var(--pinboard-btn-fg) !important;
  border: none !important; border-radius: var(--pinboard-radius-sm) !important;
  padding: 5px 14px !important; cursor: pointer !important;
  font-size: 12px !important; align-self: flex-start !important;
  transition: background 0.15s ease !important;
}
#tweet_searchbox input[type="submit"]:hover { background: var(--pinboard-success-hover) !important; }

/* ---- Forms (global) ---- */
input[type="text"], input:not([type]), input[type="password"], textarea, select {
  background: var(--pinboard-input-bg) !important; color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  box-sizing: border-box !important; max-width: 100% !important;
}
input[type="text"]:focus, input:not([type]):focus, textarea:focus, select:focus { border-color: var(--pinboard-accent) !important; outline: none !important; }
input[type="submit"], input[type="button"] {
  background: var(--pinboard-accent) !important; color: var(--pinboard-btn-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-accent) !important;
  border-radius: var(--pinboard-radius-sm) !important;
  padding: 4px 12px !important;
  cursor: pointer !important;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease !important;
}
input[type="submit"]:hover, input[type="button"]:hover { background: var(--pinboard-link-hover) !important; border-color: var(--pinboard-link-hover) !important; }
input[type="reset"], input[type="reset"].reset, button[type="reset"] {
  background: var(--pinboard-bg-surface) !important; color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-radius: var(--pinboard-radius-sm) !important;
  padding: 4px 12px !important;
  cursor: pointer !important;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease !important;
}
input[type="reset"]:hover, input[type="reset"].reset:hover, button[type="reset"]:hover { background: var(--pinboard-row-hover) !important; border-color: var(--pinboard-accent) !important; color: var(--pinboard-accent) !important; }
input[type="checkbox"], input[type="radio"] { accent-color: var(--pinboard-accent) !important; }
.suggested_tag { color: var(--pinboard-success) !important; cursor: pointer !important; }
#edit_bookmark_form { background: var(--pinboard-bg-surface) !important; border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important; }

/* ---- Tag completion popup (Pin.Tags widget on /add/, edit-bookmark, note-add) ---- */
.pin-ac { z-index: 1000 !important; }
.pin-ac .bd {
  background: var(--pinboard-bg-surface) !important;
  color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-radius: var(--pinboard-radius-sm) !important;
  box-shadow: 0 2px 8px var(--pinboard-accent-alpha) !important;
}
.pin-ac li {
  background: transparent !important;
  color: var(--pinboard-fg) !important;
  padding: 4px 10px !important;
  font-size: 12px !important;
}
.pin-ac li:hover { background: var(--pinboard-accent-alpha) !important; color: var(--pinboard-fg) !important; cursor: pointer !important; }
.pin-ac .active { background: var(--pinboard-selection-bg) !important; color: var(--pinboard-selection-fg) !important; }

/* ---- Settings page ---- */
#settings_panel { background: var(--pinboard-bg-surface) !important; }
.settings_tabs { border-color: var(--pinboard-border) !important; }
.settings_tab { color: var(--pinboard-muted) !important; padding: 6px 12px !important; border-bottom-color: var(--pinboard-border) !important; }
.settings_tab a { color: inherit !important; text-decoration: none !important; }
.settings_tab:hover { color: var(--pinboard-accent) !important; }
.settings_tab_selected {
  color: var(--pinboard-accent) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-top: 2px solid var(--pinboard-accent) !important;
  border-bottom-color: var(--pinboard-bg-surface) !important;
  background: var(--pinboard-bg-surface) !important;
  font-weight: bold !important;
  margin-bottom: -1px !important;
}
.settings_tab_selected a { color: var(--pinboard-accent) !important; }
[class*="settings_tab_spacer"] { border-bottom-color: var(--pinboard-border) !important; }
.settings_heading { color: var(--pinboard-muted) !important; background: transparent !important; border-bottom: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important; padding-bottom: 6px !important; }
a.help { color: var(--pinboard-muted-soft) !important; background: var(--pinboard-accent-soft) !important; }
.email_secret { color: var(--pinboard-accent) !important; }
#settings_tab_panes { border: none !important; }
#settings_tab_panes table td { color: var(--pinboard-fg) !important; }

/* ---- Profile page ---- */
.service_box, .help_box {
  background: var(--pinboard-bg-surface) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-radius: var(--pinboard-radius-md) !important;
  padding: 16px !important;
  box-sizing: border-box !important;
  margin-bottom: 12px !important;
}
.service_box .service_box { border: none !important; padding: 0 !important; margin: 0 !important; background: transparent !important; border-radius: 0 !important; width: auto !important; box-sizing: border-box !important; }
#profile_left_column { margin-right: 20px !important; }
#profile_right_column { width: 430px !important; }
#profile_main_column h2, #profile_left_column h2, #profile_right_column h2 { color: var(--pinboard-muted) !important; }
#profile_main_column table td, #profile_right_column table td { color: var(--pinboard-fg) !important; }

/* ---- Notes ---- */
.note { border-bottom: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important; }
.note a { color: var(--pinboard-accent) !important; }
.note .note { border: none !important; padding: 0 !important; margin: 0 !important; background: transparent !important; border-radius: 0 !important; }
#note_right_column { background: var(--pinboard-bg-surface) !important; color: var(--pinboard-fg) !important; padding: 16px !important; border-left: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important; }

/* ---- Bulk edit ---- */
#bulk_top_bar, #bulk_edit_box { background: var(--pinboard-bg-surface) !important; border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important; color: var(--pinboard-fg) !important; }

/* ---- Save bookmark popup ---- */
#popup_header { background: var(--pinboard-bg-surface) !important; color: var(--pinboard-fg) !important; }
.formtable td { color: var(--pinboard-fg) !important; }
.bookmark_count, .bookmark_count_box { color: var(--pinboard-muted) !important; }
.user_navbar a { color: var(--pinboard-accent) !important; }
.rss_link, .rss_linkbox a { color: var(--pinboard-muted-soft) !important; }

/* ---- Bundles (P4-table) — /u/<user>/bundles/ ---- */
#main_column form[name="sort"] > table { width: 100% !important; max-width: 880px !important; border-collapse: separate !important; border-spacing: 0 4px !important; margin-top: 8px !important; }
#main_column form[name="sort"] table tr { background: transparent !important; border-radius: var(--pinboard-radius-md) !important; }
#main_column form[name="sort"] table tr:hover { background: var(--pinboard-row-hover) !important; }
#main_column form[name="sort"] table td { padding: 6px 10px !important; vertical-align: middle !important; border: none !important; }
#main_column form[name="sort"] table td[style*="text-align:right"] { min-width: 160px !important; padding-right: 14px !important; white-space: nowrap !important; }
#main_column form[name="sort"] table input[name^="id_"] {
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  background: var(--pinboard-input-bg) !important;
  color: var(--pinboard-fg) !important;
  width: 32px !important;
  border-radius: var(--pinboard-radius-sm) !important;
  text-align: center !important;
}
#main_column form[name="sort"] table input[name^="id_"]:focus { border-color: var(--pinboard-accent) !important; box-shadow: 0 0 0 2px var(--pinboard-accent-alpha) !important; outline: none !important; }
#main_column form[name="sort"] table a.bundle { font-weight: var(--pinboard-weight-heading) !important; font-style: normal !important; letter-spacing: 0.01em !important; padding: 2px 4px !important; border-radius: var(--pinboard-radius-sm) !important; }
#main_column form[name="sort"] table a[style*="color:#aaa"],
#main_column form[name="sort"] table a[style*="color: #aaa"] { color: var(--pinboard-muted) !important; opacity: 1 !important; text-decoration: none !important; font-size: 12px !important; margin-left: 4px !important; }
#main_column form[name="sort"] table a[style*="color:#aaa"]:hover { color: var(--pinboard-accent) !important; text-decoration: underline !important; }
#main_column form[name="sort"] table td a.edit { color: var(--pinboard-muted) !important; opacity: 0.8 !important; transition: opacity 0.15s ease !important; }
#main_column form[name="sort"] table td a.destroy { color: var(--pinboard-destroy) !important; opacity: 0.85 !important; font-weight: var(--pinboard-weight-heading) !important; }
#main_column form[name="sort"] table tr:hover td a.edit { color: var(--pinboard-accent) !important; opacity: 1 !important; }
#main_column form[name="sort"] table tr:hover td a.destroy { opacity: 1 !important; }

/* ---- Pagination ---- */
.next_prev, .next_prev_widget a { color: var(--pinboard-accent) !important; }
.next_prev:hover, .next_prev_widget a:hover { color: var(--pinboard-link-hover) !important; }
#nextprev a.edit { color: var(--pinboard-muted-soft) !important; }

/* ---- Logged-out landing page (https://pinboard.in/) ---- */
#main_welcome, .homepage_quad { color: var(--pinboard-fg) !important; }
.homepage_heading { color: var(--pinboard-fg-strong) !important; font-weight: var(--pinboard-weight-heading) !important; }
.homepage_subheading { color: var(--pinboard-muted) !important; }
.signup_button,
.signup_button[style*="background"] {
  background: var(--pinboard-btn-bg) !important;
  color: var(--pinboard-btn-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-btn-bg) !important;
  border-radius: var(--pinboard-radius-sm) !important;
  padding: 10px 16px !important;
  text-align: center !important;
  font-weight: var(--pinboard-weight-heading) !important;
  cursor: pointer !important;
  transition: background 0.15s ease, border-color 0.15s ease !important;
}
.signup_button:hover { background: var(--pinboard-btn-bg-hover) !important; border-color: var(--pinboard-btn-bg-hover) !important; }
#blurb_div { color: var(--pinboard-fg) !important; }
.blurb_column { color: var(--pinboard-fg) !important; }
#blurb_div a { text-decoration: none !important; color: var(--pinboard-fg) !important; display: block !important; }
.blurb_box {
  background: var(--pinboard-bg-surface) !important;
  color: var(--pinboard-fg) !important;
  border: var(--pinboard-border-width) var(--pinboard-border-style) var(--pinboard-border) !important;
  border-radius: var(--pinboard-radius-md) !important;
  padding: 12px 14px !important;
  margin-bottom: 10px !important;
  transition: background 0.15s ease, border-color 0.15s ease !important;
}
#blurb_div a:hover .blurb_box { background: var(--pinboard-row-hover) !important; border-color: var(--pinboard-accent-alpha) !important; }
.magazine_title { color: var(--pinboard-accent) !important; font-weight: var(--pinboard-weight-heading) !important; }
.blurb { color: var(--pinboard-fg) !important; opacity: 0.85 !important; }
#language_box { color: var(--pinboard-muted) !important; }
#language_box p { margin: 2px 0 !important; }
#language_box a { color: var(--pinboard-muted) !important; padding: 1px 6px !important; border-radius: var(--pinboard-radius-sm) !important; text-decoration: none !important; }
#language_box a:hover { color: var(--pinboard-accent) !important; background: var(--pinboard-accent-alpha) !important; }
#language_box a[style*="background:#ffa"],
#language_box a[style*="background: #ffa"] { background: var(--pinboard-accent-alpha) !important; color: var(--pinboard-accent) !important; }
.nli { color: var(--pinboard-muted) !important; }
.nav_nli { color: var(--pinboard-accent) !important; text-decoration: none !important; }
.nav_nli:hover { color: var(--pinboard-link-hover) !important; }

/* ---- Footer / colophon ---- */
#footer, .colophon, .colophon a { color: var(--pinboard-muted-soft) !important; }

/* ---- Scrollbars (Webkit + Firefox standard) ---- */
html, body, textarea, .description, .pin-ac .bd {
  scrollbar-width: thin !important;
  scrollbar-color: var(--pinboard-muted) var(--pinboard-bg-surface) !important;
}
::-webkit-scrollbar { width: 10px !important; height: 10px !important; }
::-webkit-scrollbar-track { background: var(--pinboard-bg-surface) !important; border-left: 1px solid var(--pinboard-border) !important; }
::-webkit-scrollbar-thumb { background: var(--pinboard-muted-soft) !important; border: 2px solid var(--pinboard-bg-surface) !important; border-radius: 6px !important; }
::-webkit-scrollbar-thumb:hover { background: var(--pinboard-accent) !important; }
::-webkit-scrollbar-corner { background: var(--pinboard-bg-surface) !important; }

/* ---- Global anchor fallbacks ---- */
a, a:link { color: var(--pinboard-accent) !important; }
a:hover { color: var(--pinboard-link-hover) !important; }
a:visited { color: var(--pinboard-link-visited) !important; }
a:focus-visible { outline: 2px solid var(--pinboard-focus-ring) !important; outline-offset: 2px !important; }
h2 { color: var(--pinboard-muted) !important; }
hr { border-color: var(--pinboard-border) !important; }

/* ---- Bundle slot input override: already in inline_base_rules — redundant here ---- */

/* ---- ::selection (also in _base but themes may want explicit) ---- */
::selection { background: var(--pinboard-selection-bg) !important; color: var(--pinboard-selection-fg) !important; }
::-moz-selection { background: var(--pinboard-selection-bg) !important; color: var(--pinboard-selection-fg) !important; }

/* === patterns layer (tokens.patterns) === */
#search_query_field:focus, #banner_searchbox input[type="text"]:focus, #right_bar input#key:focus, #tweet_searchbox #search_query_field:focus {
  box-shadow: 0 0 0 2px var(--pinboard-accent-alpha) !important;
  outline: none !important;
}
.bookmark { border: none !important; }
.bookmark { box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05) !important; transition: box-shadow 0.2s !important; }
.bookmark:hover { box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08) !important; }


/* === theme overrides (tokens.overrides.css) === */
/* ======== overrides-patch for github-light (auto-generated by tools/generate-overrides.mjs) ========
 * Restores shipped decls the composer's token-driven output doesn't match.
 */
#banner { border-radius: 4px !important; padding: 8px 16px !important; }
#search_query_field { width: 100% !important; }
#pinboard_name a { font-weight: 700 !important; }
a.url_display { color: #57606a !important; font-size: 12px !important; }
a.url_link { border-radius: 12px !important; }
.description blockquote { border-left: 3px solid #0969da40 !important; }
a.tag { border-radius: 12px !important; }
.suggested_tag { color: #1a7f37 !important; }
a.help { background: #e8ecf0 !important; }
#main_column form[name="sort"] table tr:hover { background: rgba(9,105,218,0.06) !important; }
#main_column form[name="sort"] table input[name^="id_"] { width: 38px !important; min-width: 38px !important; max-width: 38px !important; padding: 3px 4px !important; margin-right: 10px !important; font-size: 12px !important; line-height: 1.2 !important; border-radius: 6px !important; box-sizing: border-box !important; vertical-align: middle !important; font-weight: 600 !important; }
#right_bar table td a.tag { color: #24292f !important; }
#right_bar table td a.delete { color: #6e7781 !important; }
#right_bar input#key { color: #24292f !important; border-radius: 4px !important; }
#right_bar input[type="submit"] { border-radius: 4px !important; }
#tweet_searchbox #search_query_field { color: #24292f !important; border-radius: 4px !important; font-size: 13px !important; }
#tweet_searchbox input[type="submit"] { border-radius: 4px !important; }`
  }

};
