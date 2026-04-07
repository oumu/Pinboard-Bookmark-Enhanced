// ============================================================
// Pinboard Bookmark Plus - CSS Theme Presets for pinboard.in
// ============================================================

const PINBOARD_THEMES = {

  // ---- 1. Modern Card (Light) ----
  "modern-card": {
    name: "Modern Card",
    desc: "Clean card layout with subtle shadows",
    css: `/* Modern Card Theme */
body#pinboard {
  background: #f0f2f5 !important;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
  color: #1a1a2e !important;
}
body#pinboard table, body#pinboard td, body#pinboard th,
body#pinboard p, body#pinboard b, body#pinboard strong,
body#pinboard label, body#pinboard span, body#pinboard li,
body#pinboard dd, body#pinboard dt { color: inherit !important; }

/* Layout foundation */
#banner { max-width: 1030px !important; box-sizing: border-box !important; border-radius: 8px !important; }
#search_query_field { box-sizing: border-box !important; width: 100% !important; }
#tag_cloud { max-width: 100% !important; overflow-wrap: break-word !important; }
.bookmark { display: flex !important; align-items: flex-start !important; }
.star, .selected_star { margin-left: 0 !important; margin-right: 6px !important; float: none !important; flex-shrink: 0 !important; }
.bookmark .display { float: none !important; flex: 1 !important; width: auto !important; min-width: 0 !important; }
.note .note { border: none !important; padding: 0 !important; margin: 0 !important; background: transparent !important; border-radius: 0 !important; box-shadow: none !important; }
.service_box .service_box { border: none !important; padding: 0 !important; margin: 0 !important; background: transparent !important; border-radius: 0 !important; width: auto !important; box-sizing: border-box !important; }
#profile_left_column { margin-right: 20px !important; }
#profile_right_column { width: 430px !important; }
body:not(#pinboard) #popup_header { background: transparent !important; }
body:not(#pinboard) { background: #f0f2f5 !important; color: #1a1a2e !important; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important; }
body:not(#pinboard) table, body:not(#pinboard) td, body:not(#pinboard) p,
body:not(#pinboard) label, body:not(#pinboard) span { color: inherit !important; }

/* ---- Banner & Navigation ---- */
#banner {
  background: #fff !important; border-bottom: 1px solid #e0e0e0 !important;
  box-shadow: 0 1px 3px rgba(0,0,0,0.06) !important; padding: 12px 20px !important;
}
#banner a, #top_menu a, .banner_username { color: #5f6368 !important; }
#banner a:hover, #top_menu a:hover { color: #1a73e8 !important; }
#pinboard_name a { color: #1a73e8 !important; font-weight: 700 !important; }
#sub_banner { background: #fafafa !important; border-bottom: 1px solid #e8e8e8 !important; }
#sub_banner a { color: #5f6368 !important; }
#sub_banner a:hover, #sub_banner a.selected { color: #1a73e8 !important; }

/* ---- Search ---- */
#searchbox { margin-bottom: 12px !important; }
#search_query_field, #banner_searchbox input[type="text"] {
  border: 1px solid #dadce0 !important; border-radius: 6px !important;
  padding: 8px 12px !important; background: #f8f9fa !important; width: 100% !important; box-sizing: border-box !important;
}
#search_query_field:focus, #banner_searchbox input[type="text"]:focus {
  border-color: #1a73e8 !important; background: #fff !important;
  box-shadow: 0 0 0 2px rgba(26,115,232,0.15) !important;
}
.search_button input[type="submit"] {
  background: #1a73e8 !important; color: #fff !important;
  border: none !important; border-radius: 4px !important;
  padding: 4px 12px !important; cursor: pointer !important; font-size: 12px !important;
}
.search_button input[type="submit"]:hover { background: #1765cc !important; }

/* ---- Main Content ---- */
#main_column { padding-top: 16px !important; }
.bookmark {
  background: #fff !important; border: 1px solid #e8e8e8 !important;
  border-radius: 8px !important; padding: 14px 18px !important;
  margin-bottom: 10px !important; box-shadow: 0 1px 3px rgba(0,0,0,0.04) !important;
  transition: box-shadow 0.2s !important;
}
.bookmark:hover { box-shadow: 0 3px 12px rgba(0,0,0,0.08) !important; }
a.bookmark_title {
  color: #1a73e8 !important; font-size: 15px !important;
  font-weight: 600 !important; text-decoration: none !important;
}
a.bookmark_title:hover { color: #174ea6 !important; }
a.url_display { color: #3c8039 !important; font-size: 12px !important; text-decoration: none !important; }
a.url_link { color: #e8710a !important; font-size: 12px !important; background: #fff3e0 !important; padding: 1px 5px !important; border-radius: 3px !important; }
.description { color: #5f6368 !important; font-size: 13px !important; line-height: 1.5 !important; margin-top: 4px !important; }
a.tag {
  background: #e8f0fe !important; color: #1967d2 !important;
  padding: 2px 8px !important; border-radius: 12px !important;
  font-size: 11px !important; text-decoration: none !important; margin-right: 4px !important;
}
a.tag:hover { background: #d2e3fc !important; }
a.cached { color: #9aa0a6 !important; text-decoration: none !important; font-size: 12px !important; }
a.when { color: #9aa0a6 !important; font-size: 11px !important; }
.edit_links a { color: #9aa0a6 !important; font-size: 11px !important; }
.edit_links a:hover { color: #5f6368 !important; }
a.copy_link { color: #1a73e8 !important; }
a.delete, a.destroy { color: #d93025 !important; }
.private { background: #fff8e1 !important; border-color: #ffeaa7 !important; }
a.unread { color: #d93025 !important; font-weight: 600 !important; }
.star { color: #dadce0 !important; cursor: pointer !important; }
.selected_star { color: #fbbc04 !important; }
.edit_checkbox input { accent-color: #1a73e8 !important; }

/* ---- Sidebar ---- */
#right_bar {
  background: #fff !important; border: 1px solid #e8e8e8 !important;
  border-radius: 8px !important; padding: 16px !important;
  overflow: hidden !important; word-wrap: break-word !important;
  box-sizing: border-box !important;
}
#right_bar h3, #right_bar h4, #right_bar b { color: #3c4043 !important; }
#right_bar a { color: #5f6368 !important; }
#right_bar a:hover { color: #1a73e8 !important; }
a.bundle { color: #5f6368 !important; text-decoration: none !important; }
a.bundle:hover { color: #1a73e8 !important; }
#tag_cloud a { color: #5f6368 !important; }
#tag_cloud a:hover { color: #1a73e8 !important; }
#tag_cloud_header a, a.tag_heading_selected { color: #9aa0a6 !important; font-size: 11px !important; }
#tag_cloud_header a:hover { color: #1a73e8 !important; }

/* ---- Pagination ---- */
.next_prev, .next_prev_widget a { color: #1a73e8 !important; text-decoration: none !important; }
.next_prev:hover, .next_prev_widget a:hover { text-decoration: underline !important; }
#nextprev a.edit { color: #9aa0a6 !important; }

/* ---- Forms (Edit, Save, Notes) ---- */
input[type="text"], input:not([type]), input[type="password"], textarea, select {
  border: 1px solid #dadce0 !important; border-radius: 6px !important;
  padding: 8px 12px !important; font-family: inherit !important; background: #fff !important;
  color: #1a1a2e !important;
}
input[type="text"]:focus, input:not([type]):focus, textarea:focus, select:focus {
  border-color: #1a73e8 !important; outline: none !important;
  box-shadow: 0 0 0 2px rgba(26,115,232,0.15) !important;
}
input[type="submit"], input[type="button"] {
  background: #1a73e8 !important; color: #fff !important;
  border: none !important; border-radius: 6px !important;
  padding: 8px 20px !important; cursor: pointer !important; font-size: 13px !important;
}
input[type="submit"]:hover, input[type="button"]:hover { background: #1765cc !important; }
#edit_bookmark_form {
  background: #fff !important; border: 1px solid #e8e8e8 !important;
  border-radius: 8px !important; padding: 16px !important;
  box-shadow: 0 2px 8px rgba(0,0,0,0.08) !important;
}
.suggested_tag { background: #e8f0fe !important; color: #1967d2 !important; border-radius: 12px !important; padding: 2px 8px !important; cursor: pointer !important; }

/* ---- Settings Page ---- */
#settings_panel { background: #fff !important; border-radius: 8px !important; padding: 20px !important; }
.settings_tabs { border-bottom: 2px solid #e8e8e8 !important; }
.settings_tab { color: #5f6368 !important; padding: 8px 16px 6px !important; border-bottom-color: #e8e8e8 !important; }
.settings_tab a { color: inherit !important; text-decoration: none !important; }
.settings_tab:hover { color: #1a73e8 !important; }
.settings_tab_selected { color: #1a73e8 !important; border: 1px solid #e8e8e8 !important; border-top: 2px solid #1a73e8 !important; border-bottom-color: #fff !important; background: #fff !important; font-weight: 600 !important; margin-bottom: -1px !important; }
.settings_tab_selected a { color: #1a73e8 !important; }
[class*="settings_tab_spacer"] { border-bottom-color: #e8e8e8 !important; }
.settings_heading { color: #3c4043 !important; font-size: 15px !important; margin-top: 16px !important; background: transparent !important; border-bottom: 1px solid #e8e8e8 !important; padding-bottom: 6px !important; }
a.help { color: #9aa0a6 !important; background: #e4e6e9 !important; text-decoration: none !important; }
.email_secret { color: #1a73e8 !important; }
#settings_tab_panes { border: none !important; }
#settings_tab_panes table td { color: #3c4043 !important; }

/* ---- Notes Page ---- */
.note { border-bottom: 1px solid #e8e8e8 !important; padding: 10px 0 !important; }
.note a { color: #1a73e8 !important; }
#note_right_column { background: #fff !important; border-radius: 8px !important; padding: 16px !important; }

/* ---- Profile Page ---- */
.service_box {
  background: #fff !important; border: 1px solid #e8e8e8 !important;
  border-radius: 8px !important; padding: 16px !important; margin-bottom: 12px !important;
  box-sizing: border-box !important;
}
#profile_main_column h2, #profile_left_column h2, #profile_right_column h2 { color: #3c4043 !important; }

/* ---- Bulk Edit ---- */
#bulk_top_bar, #bulk_edit_box { background: #e8f0fe !important; border-radius: 6px !important; padding: 10px !important; }

/* ---- Save Bookmark Popup ---- */
#popup_header { background: #fff !important; }
.formtable td { color: #3c4043 !important; }
.bookmark_count, .bookmark_count_box { color: #5f6368 !important; }
.user_navbar a { color: #5f6368 !important; }
.user_navbar a:hover { color: #1a73e8 !important; }
.rss_link, .rss_linkbox a { color: #9aa0a6 !important; }

/* ---- Footer & General ---- */
#footer, .colophon, .colophon a { color: #9aa0a6 !important; }
a { color: #1a73e8 !important; }
a:hover { color: #174ea6 !important; }
h2 { color: #3c4043 !important; }`
  },

  // ---- 2. Nord Night (Dark) ----
  "nord-night": {
    name: "Nord Night",
    desc: "Arctic dark theme with cool blue tones",
    css: `/* Nord Night Theme */
body#pinboard {
  background: #2e3440 !important;
  color: #d8dee9 !important;
  font-family: "Inter", -apple-system, sans-serif !important;
}
body#pinboard table, body#pinboard td, body#pinboard th,
body#pinboard p, body#pinboard b, body#pinboard strong,
body#pinboard label, body#pinboard span, body#pinboard li,
body#pinboard dd, body#pinboard dt { color: inherit !important; }

/* Layout foundation */
#banner { max-width: 1030px !important; box-sizing: border-box !important; border-radius: 4px !important; padding: 8px 16px !important; }
#search_query_field { box-sizing: border-box !important; width: 100% !important; }
#tag_cloud { max-width: 100% !important; overflow-wrap: break-word !important; }
.bookmark { display: flex !important; align-items: flex-start !important; }
.star, .selected_star { margin-left: 0 !important; margin-right: 6px !important; float: none !important; flex-shrink: 0 !important; }
.bookmark .display { float: none !important; flex: 1 !important; width: auto !important; min-width: 0 !important; }
.note .note { border: none !important; padding: 0 !important; margin: 0 !important; background: transparent !important; border-radius: 0 !important; }
.service_box .service_box { border: none !important; padding: 0 !important; margin: 0 !important; background: transparent !important; border-radius: 0 !important; width: auto !important; box-sizing: border-box !important; }
#profile_left_column { margin-right: 20px !important; }
#profile_right_column { width: 430px !important; }
body:not(#pinboard) #popup_header { background: transparent !important; }
body:not(#pinboard) { background: #2e3440 !important; color: #d8dee9 !important; font-family: "Inter", -apple-system, sans-serif !important; }
body:not(#pinboard) table, body:not(#pinboard) td, body:not(#pinboard) p,
body:not(#pinboard) label, body:not(#pinboard) span { color: inherit !important; }

/* ---- Banner & Navigation ---- */
#banner { background: #3b4252 !important; border-color: #434c5e !important; }
#banner a, #top_menu a, .banner_username { color: #88c0d0 !important; }
#banner a:hover, #top_menu a:hover { color: #8fbcbb !important; }
#pinboard_name a { color: #88c0d0 !important; font-weight: 700 !important; }
#sub_banner { background: #3b4252 !important; border-color: #434c5e !important; }
#sub_banner a { color: #81a1c1 !important; }
#sub_banner a:hover, #sub_banner a.selected { color: #88c0d0 !important; }

/* ---- Search ---- */
#searchbox { margin-bottom: 12px !important; }
#search_query_field, #banner_searchbox input[type="text"] {
  background: #434c5e !important; color: #d8dee9 !important; border: 1px solid #4c566a !important;
}
#search_query_field:focus, #banner_searchbox input[type="text"]:focus { border-color: #88c0d0 !important; }
.search_button input[type="submit"] {
  background: #5e81ac !important; color: #eceff4 !important;
  border: 1px solid #81a1c1 !important; cursor: pointer !important;
}
.search_button input[type="submit"]:hover { background: #81a1c1 !important; }

/* ---- Main Content ---- */
.bookmark { background: #3b4252 !important; border-bottom: 1px solid #434c5e !important; padding: 12px 14px !important; border-radius: 4px !important; margin-bottom: 6px !important; }
a.bookmark_title { color: #88c0d0 !important; font-size: 15px !important; text-decoration: none !important; }
a.bookmark_title:hover { color: #8fbcbb !important; text-decoration: underline !important; }
a.url_display { color: #a3be8c !important; font-size: 12px !important; }
a.url_link { color: #ebcb8b !important; background: #3b4252 !important; padding: 1px 5px !important; border-radius: 3px !important; }
.description { color: #d8dee9 !important; opacity: 0.8 !important; line-height: 1.5 !important; }
.description blockquote { color: #d8dee9 !important; border-left: 3px solid #4c566a !important; padding-left: 10px !important; margin: 4px 0 !important; }
a.tag { color: #a3be8c !important; text-decoration: none !important; font-size: 12px !important; }
a.tag:hover { color: #b5d19c !important; text-decoration: underline !important; }
a.cached { color: #4c566a !important; }
a.when { color: #4c566a !important; font-size: 11px !important; }
.edit_links a { color: #4c566a !important; }
.edit_links a:hover { color: #d8dee9 !important; }
a.copy_link { color: #81a1c1 !important; }
a.delete { color: #bf616a !important; }
a.destroy { color: #bf616a !important; }
.private { background: #3b4252 !important; border-left: 3px solid #ebcb8b !important; }
a.unread { color: #bf616a !important; font-weight: bold !important; }
.star { color: #434c5e !important; }
.selected_star { color: #ebcb8b !important; }

/* ---- Sidebar ---- */
#right_bar { background: #3b4252 !important; color: #d8dee9 !important; padding: 12px !important; overflow: hidden !important; word-wrap: break-word !important; box-sizing: border-box !important; }
#right_bar h3, #right_bar h4, #right_bar b { color: #81a1c1 !important; }
#right_bar a { color: #81a1c1 !important; }
#right_bar a:hover { color: #88c0d0 !important; }
a.bundle { color: #81a1c1 !important; }
a.bundle:hover { color: #88c0d0 !important; }
#tag_cloud a { color: #81a1c1 !important; }
#tag_cloud a:hover { color: #88c0d0 !important; }
#tag_cloud_header a, a.tag_heading_selected { color: #4c566a !important; }
#tag_cloud_header a:hover { color: #88c0d0 !important; }

/* ---- Pagination ---- */
.next_prev, .next_prev_widget a { color: #81a1c1 !important; }
.next_prev:hover, .next_prev_widget a:hover { color: #88c0d0 !important; }
#nextprev a.edit { color: #4c566a !important; }

/* ---- Forms ---- */
input[type="text"], input:not([type]), input[type="password"], textarea, select {
  background: #434c5e !important; color: #d8dee9 !important; border: 1px solid #4c566a !important;
}
input[type="text"]:focus, input:not([type]):focus, textarea:focus, select:focus { border-color: #88c0d0 !important; outline: none !important; }
input[type="submit"], input[type="button"] {
  background: #5e81ac !important; color: #eceff4 !important;
  border: 1px solid #81a1c1 !important; cursor: pointer !important;
}
input[type="submit"]:hover, input[type="button"]:hover { background: #81a1c1 !important; }
#edit_bookmark_form { background: #434c5e !important; border: 1px solid #4c566a !important; }
.suggested_tag { color: #a3be8c !important; cursor: pointer !important; }

/* ---- Settings Page ---- */
#settings_panel { background: #3b4252 !important; }
.settings_tabs { border-color: #434c5e !important; }
.settings_tab { color: #81a1c1 !important; padding: 6px 12px !important; border-bottom-color: #434c5e !important; }
.settings_tab a { color: inherit !important; text-decoration: none !important; }
.settings_tab:hover { color: #88c0d0 !important; }
.settings_tab_selected { color: #88c0d0 !important; border: 1px solid #434c5e !important; border-top: 2px solid #88c0d0 !important; border-bottom-color: #3b4252 !important; background: #3b4252 !important; font-weight: bold !important; margin-bottom: -1px !important; }
.settings_tab_selected a { color: #88c0d0 !important; }
[class*="settings_tab_spacer"] { border-bottom-color: #434c5e !important; }
.settings_heading { color: #81a1c1 !important; background: transparent !important; border-bottom: 1px solid #434c5e !important; padding-bottom: 6px !important; }
a.help { color: #4c566a !important; background: #3b4252 !important; }
.email_secret { color: #88c0d0 !important; }
#settings_tab_panes { border: none !important; }
#settings_tab_panes table td { color: #d8dee9 !important; }
input[type="checkbox"] { accent-color: #88c0d0 !important; }
input[type="radio"] { accent-color: #88c0d0 !important; }

/* ---- Notes Page ---- */
.note { border-bottom: 1px solid #434c5e !important; }
.note a { color: #88c0d0 !important; }
#note_right_column { background: #3b4252 !important; color: #d8dee9 !important; padding: 16px !important; border-left: 1px solid #434c5e !important; }

/* ---- Profile Page ---- */
.service_box { background: #3b4252 !important; border: 1px solid #434c5e !important; border-radius: 6px !important; padding: 16px !important; box-sizing: border-box !important; margin-bottom: 12px !important; }
#profile_main_column h2, #profile_left_column h2, #profile_right_column h2 { color: #81a1c1 !important; }
#profile_main_column table td, #profile_right_column table td { color: #d8dee9 !important; }

/* ---- Bulk Edit ---- */
#bulk_top_bar, #bulk_edit_box { background: #434c5e !important; border: 1px solid #4c566a !important; color: #d8dee9 !important; }

/* ---- Save Bookmark Popup ---- */
#popup_header { background: #3b4252 !important; color: #d8dee9 !important; }
.formtable td { color: #d8dee9 !important; }
.bookmark_count, .bookmark_count_box { color: #81a1c1 !important; }
.user_navbar a { color: #81a1c1 !important; }
.rss_link, .rss_linkbox a { color: #4c566a !important; }

/* ---- Footer & Links ---- */
#footer, .colophon, .colophon a { color: #4c566a !important; }
hr { border-color: #434c5e !important; }
a { color: #81a1c1 !important; }
a:hover { color: #88c0d0 !important; }
h2 { color: #81a1c1 !important; }
::selection { background: #434c5e !important; }`
  },

  // ---- 3. Terminal (Dark) ----
  "terminal": {
    name: "Terminal",
    desc: "Retro CRT green-on-black hacker style",
    css: `/* Terminal Theme */
body#pinboard {
  background: #0a0a0a !important;
  color: #33ff33 !important;
  font-family: "Fira Code", "Cascadia Code", "Consolas", monospace !important;
  font-size: 13px !important;
}
body#pinboard table, body#pinboard td, body#pinboard th,
body#pinboard p, body#pinboard b, body#pinboard strong,
body#pinboard label, body#pinboard span, body#pinboard li,
body#pinboard dd, body#pinboard dt { color: inherit !important; }

/* Layout foundation */
#banner { max-width: 1030px !important; box-sizing: border-box !important; padding: 8px 16px !important; }
#search_query_field { box-sizing: border-box !important; width: 100% !important; }
#tag_cloud { max-width: 100% !important; overflow-wrap: break-word !important; }
.bookmark { display: flex !important; align-items: flex-start !important; }
.star, .selected_star { margin-left: 0 !important; margin-right: 6px !important; float: none !important; flex-shrink: 0 !important; }
.bookmark .display { float: none !important; flex: 1 !important; width: auto !important; min-width: 0 !important; }
.note .note { border: none !important; padding: 0 !important; margin: 0 !important; background: transparent !important; border-radius: 0 !important; }
.service_box .service_box { border: none !important; padding: 0 !important; margin: 0 !important; background: transparent !important; border-radius: 0 !important; width: auto !important; box-sizing: border-box !important; }
#profile_left_column { margin-right: 20px !important; }
#profile_right_column { width: 430px !important; }
body:not(#pinboard) #popup_header { background: transparent !important; }
body:not(#pinboard) { background: #0a0a0a !important; color: #33ff33 !important; font-family: "Fira Code", "Cascadia Code", "Consolas", monospace !important; }
body:not(#pinboard) table, body:not(#pinboard) td, body:not(#pinboard) p,
body:not(#pinboard) label, body:not(#pinboard) span { color: inherit !important; }

/* ---- Banner & Navigation ---- */
#banner { background: #111 !important; border-bottom: 1px solid #33ff3340 !important; }
#banner a, #top_menu a, .banner_username { color: #33ff33 !important; text-decoration: none !important; }
#banner a:hover, #top_menu a:hover { color: #66ff66 !important; text-decoration: underline !important; }
#pinboard_name a { color: #33ff33 !important; }
#sub_banner { background: #0d0d0d !important; border-color: #33ff3325 !important; }
#sub_banner a { color: #22aa22 !important; }
#sub_banner a:hover, #sub_banner a.selected { color: #33ff33 !important; }

/* ---- Search ---- */
#searchbox { margin-bottom: 12px !important; }
#search_query_field, #banner_searchbox input[type="text"] {
  background: #111 !important; color: #33ff33 !important;
  border: 1px solid #33ff3340 !important; font-family: inherit !important;
}
#search_query_field:focus, #banner_searchbox input[type="text"]:focus {
  border-color: #33ff33 !important; box-shadow: 0 0 6px #33ff3333 !important;
}
.search_button input[type="submit"] {
  background: #1a3a1a !important; color: #33ff33 !important;
  border: 1px solid #33ff3360 !important; font-family: inherit !important; cursor: pointer !important;
}
.search_button input[type="submit"]:hover { background: #2a5a2a !important; }

/* ---- Main Content ---- */
.bookmark { border-bottom: 1px dashed #33ff3325 !important; padding: 10px 8px !important; }
a.bookmark_title {
  color: #33ff33 !important; font-size: 14px !important;
  text-decoration: none !important; font-weight: normal !important;
}
a.bookmark_title::before { content: "> " !important; color: #33ff3380 !important; }
a.bookmark_title:hover { color: #66ff66 !important; }
a.url_display { color: #22aa22 !important; font-size: 12px !important; }
a.url_link { color: #cccc00 !important; background: #1a1a1a !important; padding: 1px 5px !important; border-radius: 3px !important; }
.description { color: #22aa22 !important; font-size: 12px !important; line-height: 1.5 !important; font-style: italic !important; }
.description blockquote { color: #22aa22 !important; border-left: 2px solid #33ff3340 !important; padding-left: 10px !important; margin: 4px 0 !important; }
a.tag { color: #00cccc !important; font-size: 11px !important; text-decoration: none !important; }
a.tag::before { content: "#" !important; }
a.tag:hover { color: #00ffff !important; text-decoration: underline !important; }
a.cached { color: #336633 !important; }
a.when { color: #336633 !important; font-size: 11px !important; }
.edit_links a { color: #336633 !important; }
.edit_links a:hover { color: #33ff33 !important; }
a.copy_link { color: #33ff33 !important; }
a.delete { color: #ff3333 !important; }
a.destroy { color: #ff3333 !important; }
.private { background: #0a0a0a !important; border-left: 2px solid #cccc00 !important; }
a.unread { color: #ff3333 !important; }
.star { color: #333 !important; }
.selected_star { color: #cccc00 !important; }

/* ---- Sidebar ---- */
#right_bar { background: #0a0a0a !important; border-left: 1px dashed #33ff3325 !important; color: #33ff33 !important; padding: 12px !important; overflow: hidden !important; word-wrap: break-word !important; box-sizing: border-box !important; }
#right_bar h3, #right_bar h4, #right_bar b { color: #33ff33 !important; }
#right_bar a { color: #22aa22 !important; }
#right_bar a:hover { color: #33ff33 !important; }
a.bundle { color: #22aa22 !important; }
a.bundle:hover { color: #33ff33 !important; }
#tag_cloud a { color: #22aa22 !important; }
#tag_cloud a:hover { color: #33ff33 !important; }
#tag_cloud_header a, a.tag_heading_selected { color: #336633 !important; }
#tag_cloud_header a:hover { color: #33ff33 !important; }

/* ---- Pagination ---- */
.next_prev, .next_prev_widget a { color: #33ff33 !important; }
.next_prev:hover, .next_prev_widget a:hover { color: #66ff66 !important; }
#nextprev a.edit { color: #336633 !important; }

/* ---- Forms ---- */
input[type="text"], input:not([type]), input[type="password"], textarea, select {
  background: #111 !important; color: #33ff33 !important;
  border: 1px solid #33ff3340 !important; font-family: inherit !important;
}
input[type="text"]:focus, input:not([type]):focus, textarea:focus, select:focus {
  border-color: #33ff33 !important; box-shadow: 0 0 6px #33ff3333 !important;
}
input[type="submit"], input[type="button"] {
  background: #1a3a1a !important; color: #33ff33 !important;
  border: 1px solid #33ff3360 !important; font-family: inherit !important; cursor: pointer !important;
}
input[type="submit"]:hover, input[type="button"]:hover { background: #2a5a2a !important; }
#edit_bookmark_form { background: #111 !important; border: 1px dashed #33ff3340 !important; }
.suggested_tag { color: #00cccc !important; cursor: pointer !important; }

/* ---- Settings Page ---- */
#settings_panel { background: #0a0a0a !important; color: #33ff33 !important; }
.settings_tabs { border-color: #33ff3340 !important; }
.settings_tab { color: #22aa22 !important; padding: 6px 12px !important; border-bottom-color: #33ff3340 !important; }
.settings_tab a { color: inherit !important; text-decoration: none !important; }
.settings_tab:hover { color: #33ff33 !important; }
.settings_tab_selected { color: #33ff33 !important; border: 1px dashed #33ff3340 !important; border-top: 2px solid #33ff33 !important; border-bottom-color: #0a0a0a !important; background: #0a0a0a !important; margin-bottom: -1px !important; }
.settings_tab_selected a { color: #33ff33 !important; }
[class*="settings_tab_spacer"] { border-bottom-color: #33ff3340 !important; }
.settings_heading { color: #33ff33 !important; background: transparent !important; border-bottom: 1px dashed #33ff3340 !important; padding-bottom: 6px !important; }
.settings_heading::before { content: "$ " !important; }
a.help { color: #336633 !important; background: #f0ede8 !important; }
.email_secret { color: #00cccc !important; }
#settings_tab_panes { border: none !important; }
#settings_tab_panes table td { color: #33ff33 !important; }
input[type="checkbox"] { accent-color: #33ff33 !important; }
input[type="radio"] { accent-color: #33ff33 !important; }

/* ---- Notes Page ---- */
.note { border-bottom: 1px dashed #33ff3325 !important; }
.note a { color: #33ff33 !important; }
#note_right_column { background: #0a0a0a !important; color: #22aa22 !important; padding: 16px !important; border-left: 1px dashed #33ff3325 !important; }

/* ---- Profile Page ---- */
.service_box { background: #111 !important; border: 1px dashed #33ff3340 !important; color: #33ff33 !important; padding: 16px !important; box-sizing: border-box !important; margin-bottom: 12px !important; }
#profile_main_column h2, #profile_left_column h2, #profile_right_column h2 { color: #33ff33 !important; }
#profile_main_column table td, #profile_right_column table td { color: #33ff33 !important; }

/* ---- Bulk Edit ---- */
#bulk_top_bar, #bulk_edit_box { background: #111 !important; border: 1px dashed #33ff3340 !important; color: #33ff33 !important; }

/* ---- Save Bookmark Popup ---- */
#popup_header { background: #0a0a0a !important; color: #33ff33 !important; }
.formtable td { color: #33ff33 !important; }
.bookmark_count, .bookmark_count_box { color: #22aa22 !important; }
.user_navbar a { color: #22aa22 !important; }
.rss_link, .rss_linkbox a { color: #336633 !important; }

/* ---- Footer & Links ---- */
#footer, .colophon, .colophon a { color: #336633 !important; }
hr { border-color: #33ff3325 !important; }
a { color: #33ff33 !important; }
a:hover { color: #66ff66 !important; }
h2 { color: #33ff33 !important; }
::selection { background: #33ff3340 !important; color: #fff !important; }`
  },

  // ---- 4. Paper & Ink (Light) ----
  "paper-ink": {
    name: "Paper & Ink",
    desc: "Warm serif reading experience",
    css: `/* Paper & Ink Theme */
body#pinboard {
  background: #faf8f5 !important;
  color: #2c2c2c !important;
  font-family: "Georgia", "Noto Serif", "Source Serif Pro", serif !important;
  font-size: 14px !important;
  line-height: 1.7 !important;
}
body#pinboard table, body#pinboard td, body#pinboard th,
body#pinboard p, body#pinboard b, body#pinboard strong,
body#pinboard label, body#pinboard span, body#pinboard li,
body#pinboard dd, body#pinboard dt { color: inherit !important; }

/* Layout foundation */
#banner { max-width: 1030px !important; box-sizing: border-box !important; padding: 8px 16px !important; }
#search_query_field { box-sizing: border-box !important; width: 100% !important; }
#tag_cloud { max-width: 100% !important; overflow-wrap: break-word !important; }
.bookmark { display: flex !important; align-items: flex-start !important; }
.star, .selected_star { margin-left: 0 !important; margin-right: 6px !important; float: none !important; flex-shrink: 0 !important; }
.bookmark .display { float: none !important; flex: 1 !important; width: auto !important; min-width: 0 !important; }
.note .note { border: none !important; padding: 0 !important; margin: 0 !important; background: transparent !important; border-radius: 0 !important; }
.service_box .service_box { border: none !important; padding: 0 !important; margin: 0 !important; background: transparent !important; border-radius: 0 !important; width: auto !important; box-sizing: border-box !important; }
#profile_left_column { margin-right: 20px !important; }
#profile_right_column { width: 430px !important; }
body:not(#pinboard) #popup_header { background: transparent !important; }
body:not(#pinboard) { background: #faf8f5 !important; color: #2c2c2c !important; font-family: "Georgia", "Noto Serif", serif !important; }
body:not(#pinboard) table, body:not(#pinboard) td, body:not(#pinboard) p,
body:not(#pinboard) label, body:not(#pinboard) span { color: inherit !important; }

/* ---- Banner & Navigation ---- */
#banner { background: #f5f0e8 !important; border-bottom: 2px solid #d4c5a9 !important; font-family: "Georgia", serif !important; }
#banner a, #top_menu a, .banner_username { color: #6b4c3b !important; }
#banner a:hover, #top_menu a:hover { color: #8b6c5b !important; }
#pinboard_name a { color: #1a3a5c !important; font-weight: normal !important; letter-spacing: 0.02em !important; }
#sub_banner { background: #f0ebe0 !important; border-color: #e0d6c4 !important; }
#sub_banner a { color: #6b4c3b !important; }
#sub_banner a:hover, #sub_banner a.selected { color: #1a3a5c !important; }

/* ---- Search ---- */
#searchbox { margin-bottom: 12px !important; }
#search_query_field, #banner_searchbox input[type="text"] {
  border: 1px solid #d4c5a9 !important; background: #fefdfb !important;
  font-family: "Georgia", serif !important; color: #2c2c2c !important;
}
#search_query_field:focus, #banner_searchbox input[type="text"]:focus { border-color: #8b6c5b !important; }
.search_button input[type="submit"] {
  background: #6b4c3b !important; color: #faf8f5 !important;
  border: none !important; cursor: pointer !important;
}
.search_button input[type="submit"]:hover { background: #8b6c5b !important; }

/* ---- Main Content ---- */
.bookmark { border-bottom: 1px solid #e8dfd0 !important; padding: 14px 8px !important; }
a.bookmark_title {
  color: #1a3a5c !important; font-size: 16px !important;
  font-weight: normal !important; text-decoration: none !important; letter-spacing: -0.01em !important;
}
a.bookmark_title:hover { color: #2a5a8c !important; text-decoration: underline !important; }
a.url_display { color: #8b6c5b !important; font-size: 12px !important; font-family: -apple-system, sans-serif !important; }
a.url_link { color: #a0522d !important; background: #f5f0e8 !important; padding: 1px 5px !important; border-radius: 3px !important; }
.description { color: #555 !important; font-size: 13px !important; line-height: 1.6 !important; margin-top: 4px !important; }
a.tag {
  color: #8b4513 !important; font-family: -apple-system, sans-serif !important;
  font-size: 11px !important; text-decoration: none !important; text-transform: lowercase !important;
}
a.tag:hover { color: #a0522d !important; text-decoration: underline !important; }
a.cached { color: #aaa !important; }
a.when { color: #999 !important; font-size: 11px !important; font-family: -apple-system, sans-serif !important; }
.edit_links a { color: #aaa !important; font-family: -apple-system, sans-serif !important; font-size: 11px !important; }
.edit_links a:hover { color: #666 !important; }
a.copy_link { color: #1a3a5c !important; }
a.delete { color: #c0392b !important; }
.private { background: #fdf6e3 !important; border-left: 3px solid #d4c5a9 !important; }
a.unread { color: #c0392b !important; }
.star { color: #ddd !important; }
.selected_star { color: #d4a017 !important; }

/* ---- Sidebar ---- */
#right_bar { background: #f5f0e8 !important; border-left: 1px solid #e8dfd0 !important; padding: 16px !important; overflow: hidden !important; word-wrap: break-word !important; box-sizing: border-box !important; }
#right_bar h3, #right_bar h4, #right_bar b { color: #6b4c3b !important; font-family: "Georgia", serif !important; }
#right_bar a { color: #6b4c3b !important; }
#right_bar a:hover { color: #8b4513 !important; }
a.bundle { color: #6b4c3b !important; }
a.bundle:hover { color: #8b4513 !important; }
#tag_cloud a { color: #6b4c3b !important; }
#tag_cloud a:hover { color: #8b4513 !important; }
#tag_cloud_header a, a.tag_heading_selected { color: #999 !important; }
#tag_cloud_header a:hover { color: #6b4c3b !important; }

/* ---- Pagination ---- */
.next_prev, .next_prev_widget a { color: #1a3a5c !important; }
.next_prev:hover, .next_prev_widget a:hover { color: #2a5a8c !important; }
#nextprev a.edit { color: #aaa !important; }

/* ---- Forms ---- */
input[type="text"], input:not([type]), input[type="password"], textarea, select {
  border: 1px solid #d4c5a9 !important; background: #fefdfb !important;
  font-family: "Georgia", serif !important; padding: 6px 10px !important; color: #2c2c2c !important;
}
input[type="text"]:focus, input:not([type]):focus, textarea:focus, select:focus { border-color: #8b6c5b !important; outline: none !important; }
input[type="submit"], input[type="button"] {
  background: #6b4c3b !important; color: #faf8f5 !important;
  border: none !important; padding: 6px 18px !important; cursor: pointer !important;
  font-family: -apple-system, sans-serif !important;
}
input[type="submit"]:hover, input[type="button"]:hover { background: #8b6c5b !important; }
#edit_bookmark_form { background: #fefdfb !important; border: 1px solid #e8dfd0 !important; }
.suggested_tag { color: #8b4513 !important; cursor: pointer !important; }

/* ---- Settings Page ---- */
#settings_panel { background: #faf8f5 !important; }
.settings_tabs { border-color: #e8dfd0 !important; }
.settings_tab { color: #6b4c3b !important; padding: 6px 12px !important; border-bottom-color: #e8dfd0 !important; }
.settings_tab a { color: inherit !important; text-decoration: none !important; }
.settings_tab:hover { color: #1a3a5c !important; }
.settings_tab_selected { color: #1a3a5c !important; border: 1px solid #e8dfd0 !important; border-top: 2px solid #1a3a5c !important; border-bottom-color: #faf8f5 !important; background: #faf8f5 !important; font-weight: 600 !important; margin-bottom: -1px !important; }
.settings_tab_selected a { color: #1a3a5c !important; }
[class*="settings_tab_spacer"] { border-bottom-color: #e8dfd0 !important; }
.settings_heading { color: #6b4c3b !important; font-family: "Georgia", serif !important; background: transparent !important; border-bottom: 1px solid #e8dfd0 !important; padding-bottom: 6px !important; }
a.help { color: #aaa !important; background: #1a1a1a !important; }
.email_secret { color: #1a3a5c !important; }
#settings_tab_panes { border: none !important; }
#settings_tab_panes table td { color: #2c2c2c !important; }

/* ---- Notes Page ---- */
.note { border-bottom: 1px solid #e8dfd0 !important; }
.note a { color: #1a3a5c !important; }
#note_right_column { background: #f5f0e8 !important; padding: 16px !important; border-left: 1px solid #d4c5a9 !important; }

/* ---- Profile Page ---- */
.service_box { background: #f5f0e8 !important; border: 1px solid #e8dfd0 !important; border-radius: 4px !important; padding: 16px !important; box-sizing: border-box !important; margin-bottom: 12px !important; }
#profile_main_column h2, #profile_left_column h2, #profile_right_column h2 {
  color: #6b4c3b !important; font-family: "Georgia", serif !important;
}

/* ---- Bulk Edit ---- */
#bulk_top_bar, #bulk_edit_box { background: #f5f0e8 !important; border: 1px solid #e8dfd0 !important; }

/* ---- Save Bookmark Popup ---- */
#popup_header { background: #f5f0e8 !important; }
.formtable td { color: #2c2c2c !important; }
.bookmark_count, .bookmark_count_box { color: #999 !important; }
.user_navbar a { color: #6b4c3b !important; }
.rss_link, .rss_linkbox a { color: #aaa !important; }

/* ---- Footer & Links ---- */
#footer, .colophon, .colophon a { color: #bbb !important; }
a { color: #1a3a5c !important; }
a:hover { color: #2a5a8c !important; }
h2 { color: #6b4c3b !important; font-family: "Georgia", serif !important; }`
  },

  // ---- 5. Dracula (Dark) ----
  "dracula": {
    name: "Dracula",
    desc: "Popular dark theme with vibrant accents",
    css: `/* Dracula Theme */
body#pinboard {
  background: #282a36 !important;
  color: #f8f8f2 !important;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
}
body#pinboard table, body#pinboard td, body#pinboard th,
body#pinboard p, body#pinboard b, body#pinboard strong,
body#pinboard label, body#pinboard span, body#pinboard li,
body#pinboard dd, body#pinboard dt { color: inherit !important; }

/* Layout foundation */
#banner { max-width: 1030px !important; box-sizing: border-box !important; border-radius: 6px !important; padding: 8px 16px !important; }
#search_query_field { box-sizing: border-box !important; width: 100% !important; }
#tag_cloud { max-width: 100% !important; overflow-wrap: break-word !important; }
.bookmark { display: flex !important; align-items: flex-start !important; }
.star, .selected_star { margin-left: 0 !important; margin-right: 6px !important; float: none !important; flex-shrink: 0 !important; }
.bookmark .display { float: none !important; flex: 1 !important; width: auto !important; min-width: 0 !important; }
.note .note { border: none !important; padding: 0 !important; margin: 0 !important; background: transparent !important; border-radius: 0 !important; }
.service_box .service_box { border: none !important; padding: 0 !important; margin: 0 !important; background: transparent !important; border-radius: 0 !important; width: auto !important; box-sizing: border-box !important; }
#profile_left_column { margin-right: 20px !important; }
#profile_right_column { width: 430px !important; }
body:not(#pinboard) #popup_header { background: transparent !important; }
body:not(#pinboard) { background: #282a36 !important; color: #f8f8f2 !important; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important; }
body:not(#pinboard) table, body:not(#pinboard) td, body:not(#pinboard) p,
body:not(#pinboard) label, body:not(#pinboard) span { color: inherit !important; }

/* ---- Banner & Navigation ---- */
#banner { background: #21222c !important; border-bottom: 1px solid #44475a !important; }
#banner a, #top_menu a, .banner_username { color: #bd93f9 !important; }
#banner a:hover, #top_menu a:hover { color: #ff79c6 !important; }
#pinboard_name a { color: #bd93f9 !important; font-weight: 700 !important; }
#sub_banner { background: #21222c !important; border-color: #44475a !important; }
#sub_banner a { color: #bd93f9 !important; }
#sub_banner a:hover, #sub_banner a.selected { color: #ff79c6 !important; }

/* ---- Search ---- */
#searchbox { margin-bottom: 12px !important; }
#search_query_field, #banner_searchbox input[type="text"] {
  background: #44475a !important; color: #f8f8f2 !important; border: 1px solid #6272a4 !important;
}
#search_query_field:focus, #banner_searchbox input[type="text"]:focus {
  border-color: #bd93f9 !important; box-shadow: 0 0 0 2px rgba(189,147,249,0.2) !important;
}
.search_button input[type="submit"] {
  background: #bd93f9 !important; color: #282a36 !important;
  border: none !important; font-weight: 600 !important; cursor: pointer !important;
}
.search_button input[type="submit"]:hover { background: #caa8fb !important; }

/* ---- Main Content ---- */
.bookmark { border-bottom: 1px solid #44475a !important; padding: 12px 14px !important; }
a.bookmark_title { color: #8be9fd !important; font-size: 15px !important; text-decoration: none !important; }
a.bookmark_title:hover { color: #a4f0ff !important; text-decoration: underline !important; }
a.url_display { color: #50fa7b !important; font-size: 12px !important; }
a.url_link { color: #ffb86c !important; background: #44475a !important; padding: 1px 5px !important; border-radius: 3px !important; }
.description { color: #f8f8f2 !important; opacity: 0.75 !important; line-height: 1.5 !important; }
.description blockquote { color: #f8f8f2 !important; border-left: 3px solid #6272a4 !important; padding-left: 10px !important; margin: 4px 0 !important; }
a.tag { color: #50fa7b !important; font-size: 12px !important; text-decoration: none !important; }
a.tag:hover { color: #69ff94 !important; text-decoration: underline !important; }
a.cached { color: #6272a4 !important; }
a.when { color: #6272a4 !important; font-size: 11px !important; }
.edit_links a { color: #6272a4 !important; }
.edit_links a:hover { color: #f8f8f2 !important; }
a.copy_link { color: #bd93f9 !important; }
a.delete { color: #ff5555 !important; }
a.destroy { color: #ff5555 !important; }
.private { background: #282a36 !important; border-left: 3px solid #f1fa8c !important; }
a.unread { color: #ff5555 !important; font-weight: bold !important; }
.star { color: #44475a !important; }
.selected_star { color: #f1fa8c !important; }

/* ---- Sidebar ---- */
#right_bar { background: #21222c !important; color: #f8f8f2 !important; padding: 12px !important; overflow: hidden !important; word-wrap: break-word !important; box-sizing: border-box !important; }
#right_bar h3, #right_bar h4, #right_bar b { color: #bd93f9 !important; }
#right_bar a { color: #bd93f9 !important; }
#right_bar a:hover { color: #ff79c6 !important; }
a.bundle { color: #bd93f9 !important; }
a.bundle:hover { color: #ff79c6 !important; }
#tag_cloud a { color: #bd93f9 !important; }
#tag_cloud a:hover { color: #ff79c6 !important; }
#tag_cloud_header a, a.tag_heading_selected { color: #6272a4 !important; }
#tag_cloud_header a:hover { color: #ff79c6 !important; }

/* ---- Pagination ---- */
.next_prev, .next_prev_widget a { color: #bd93f9 !important; }
.next_prev:hover, .next_prev_widget a:hover { color: #ff79c6 !important; }
#nextprev a.edit { color: #6272a4 !important; }

/* ---- Forms ---- */
input[type="text"], input:not([type]), input[type="password"], textarea, select {
  background: #44475a !important; color: #f8f8f2 !important; border: 1px solid #6272a4 !important;
}
input[type="text"]:focus, input:not([type]):focus, textarea:focus, select:focus {
  border-color: #bd93f9 !important; outline: none !important;
  box-shadow: 0 0 0 2px rgba(189,147,249,0.2) !important;
}
input[type="submit"], input[type="button"] {
  background: #bd93f9 !important; color: #282a36 !important;
  border: none !important; cursor: pointer !important; font-weight: 600 !important;
}
input[type="submit"]:hover, input[type="button"]:hover { background: #caa8fb !important; }
#edit_bookmark_form { background: #44475a !important; border: 1px solid #6272a4 !important; }
.suggested_tag { color: #50fa7b !important; cursor: pointer !important; }

/* ---- Settings Page ---- */
#settings_panel { background: #282a36 !important; color: #f8f8f2 !important; }
.settings_tabs { border-color: #44475a !important; }
.settings_tab { color: #6272a4 !important; padding: 6px 12px !important; border-bottom-color: #44475a !important; }
.settings_tab a { color: inherit !important; text-decoration: none !important; }
.settings_tab:hover { color: #bd93f9 !important; }
.settings_tab_selected { color: #ff79c6 !important; border: 1px solid #44475a !important; border-top: 2px solid #ff79c6 !important; border-bottom-color: #282a36 !important; background: #282a36 !important; font-weight: bold !important; margin-bottom: -1px !important; }
.settings_tab_selected a { color: #ff79c6 !important; }
[class*="settings_tab_spacer"] { border-bottom-color: #44475a !important; }
.settings_heading { color: #bd93f9 !important; background: transparent !important; border-bottom: 1px solid #44475a !important; padding-bottom: 6px !important; }
a.help { color: #6272a4 !important; background: #343746 !important; }
.email_secret { color: #8be9fd !important; }
#settings_tab_panes { border: none !important; }
#settings_tab_panes table td { color: #f8f8f2 !important; }
input[type="checkbox"] { accent-color: #bd93f9 !important; }
input[type="radio"] { accent-color: #bd93f9 !important; }

/* ---- Notes Page ---- */
.note { border-bottom: 1px solid #44475a !important; }
.note a { color: #8be9fd !important; }
#note_right_column { background: #21222c !important; color: #f8f8f2 !important; padding: 16px !important; border-left: 1px solid #44475a !important; }

/* ---- Profile Page ---- */
.service_box { background: #21222c !important; border: 1px solid #44475a !important; color: #f8f8f2 !important; border-radius: 6px !important; padding: 16px !important; box-sizing: border-box !important; margin-bottom: 12px !important; }
#profile_main_column h2, #profile_left_column h2, #profile_right_column h2 { color: #bd93f9 !important; }
#profile_main_column table td, #profile_right_column table td { color: #f8f8f2 !important; }

/* ---- Bulk Edit ---- */
#bulk_top_bar, #bulk_edit_box { background: #44475a !important; border: 1px solid #6272a4 !important; color: #f8f8f2 !important; }

/* ---- Save Bookmark Popup ---- */
#popup_header { background: #21222c !important; color: #f8f8f2 !important; }
.formtable td { color: #f8f8f2 !important; }
.bookmark_count, .bookmark_count_box { color: #bd93f9 !important; }
.user_navbar a { color: #bd93f9 !important; }
.rss_link, .rss_linkbox a { color: #6272a4 !important; }

/* ---- Footer & Links ---- */
#footer, .colophon, .colophon a { color: #6272a4 !important; }
hr { border-color: #44475a !important; }
a { color: #bd93f9 !important; }
a:hover { color: #ff79c6 !important; }
h2 { color: #bd93f9 !important; }
::selection { background: #6272a4 !important; color: #f8f8f2 !important; }`
  },

  // ---- 6. Flexoki Adaptive (Light + Dark) ----
  // Uses html.pbp-dark class injected by pinboard-style.js based on extension theme setting
  "flexoki": {
    name: "Flexoki Adaptive",
    desc: "Matches extension theme, follows your Theme setting",
    css: `/* Flexoki Adaptive Theme — switches based on extension Theme setting */

/* ---- Base color inheritance for all elements ---- */
body#pinboard table, body#pinboard td, body#pinboard th,
body#pinboard p, body#pinboard b, body#pinboard strong,
body#pinboard label, body#pinboard span, body#pinboard li,
body#pinboard dd, body#pinboard dt { color: inherit !important; }

/* Layout foundation */
#banner { max-width: 1030px !important; box-sizing: border-box !important; border-radius: 6px !important; padding: 8px 16px !important; }
#search_query_field { box-sizing: border-box !important; width: 100% !important; }
#tag_cloud { max-width: 100% !important; overflow-wrap: break-word !important; }
.bookmark { display: flex !important; align-items: flex-start !important; }
.star, .selected_star { margin-left: 0 !important; margin-right: 6px !important; float: none !important; flex-shrink: 0 !important; }
.bookmark .display { float: none !important; flex: 1 !important; width: auto !important; min-width: 0 !important; }
.note .note { border: none !important; padding: 0 !important; margin: 0 !important; background: transparent !important; border-radius: 0 !important; }
.service_box .service_box { border: none !important; padding: 0 !important; margin: 0 !important; background: transparent !important; border-radius: 0 !important; width: auto !important; box-sizing: border-box !important; }
#profile_left_column { margin-right: 20px !important; }
#profile_right_column { width: 430px !important; }
body:not(#pinboard) #popup_header { background: transparent !important; }
body:not(#pinboard) { background: #FFFCF0 !important; color: #100F0F !important; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important; }
body:not(#pinboard) table, body:not(#pinboard) td, body:not(#pinboard) p,
body:not(#pinboard) label, body:not(#pinboard) span { color: inherit !important; }
html.pbp-dark body:not(#pinboard) { background: #1C1B1A !important; color: #CECDC3 !important; }

/* ======== LIGHT MODE (default) ======== */
body#pinboard {
  background: #FFFCF0 !important;
  color: #100F0F !important;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
}

/* Banner & Nav */
#banner { background: #F2F0E5 !important; border-color: #E6E4D9 !important; }
#banner a, #top_menu a, .banner_username { color: #205EA6 !important; }
#banner a:hover, #top_menu a:hover { color: #4385BE !important; }
#pinboard_name a { color: #205EA6 !important; font-weight: 700 !important; }
#sub_banner { background: #F2F0E5 !important; border-color: #E6E4D9 !important; }
#sub_banner a { color: #5E409D !important; }
#sub_banner a:hover, #sub_banner a.selected { color: #205EA6 !important; }

/* Search */
#searchbox { margin-bottom: 12px !important; }
#search_query_field, #banner_searchbox input[type="text"] {
  background: #FFFCF0 !important; border: 1px solid #E6E4D9 !important; color: #100F0F !important;
}
#search_query_field:focus, #banner_searchbox input[type="text"]:focus { border-color: #205EA6 !important; }
.search_button input[type="submit"] {
  background: #205EA6 !important; color: #FFFCF0 !important; border: none !important; cursor: pointer !important;
}
.search_button input[type="submit"]:hover { background: #4385BE !important; }

/* Bookmarks */
.bookmark { border-bottom: 1px solid #E6E4D9 !important; padding: 12px 8px !important; }
a.bookmark_title { color: #205EA6 !important; font-size: 15px !important; text-decoration: none !important; }
a.bookmark_title:hover { color: #4385BE !important; }
a.url_display { color: #66800B !important; font-size: 12px !important; }
a.url_link { color: #AD8301 !important; background: #F2F0E5 !important; padding: 1px 5px !important; border-radius: 3px !important; }
.description { color: #6F6E69 !important; line-height: 1.5 !important; }
a.tag { color: #AD8301 !important; font-size: 12px !important; text-decoration: none !important; }
a.tag:hover { color: #D0A215 !important; }
a.cached { color: #B7B5AC !important; }
a.when { color: #B7B5AC !important; font-size: 11px !important; }
.edit_links a { color: #B7B5AC !important; }
.edit_links a:hover { color: #6F6E69 !important; }
a.copy_link { color: #205EA6 !important; }
a.delete { color: #AF3029 !important; }
a.destroy { color: #AF3029 !important; }
.private { background: #FBF7EE !important; border-left: 3px solid #D0A215 !important; }
a.unread { color: #AF3029 !important; font-weight: bold !important; }
.star { color: #E6E4D9 !important; }
.selected_star { color: #AD8301 !important; }

/* Sidebar */
#right_bar { background: #F2F0E5 !important; color: #100F0F !important; padding: 12px !important; overflow: hidden !important; word-wrap: break-word !important; box-sizing: border-box !important; }
#right_bar h3, #right_bar h4, #right_bar b { color: #5E409D !important; }
#right_bar a { color: #5E409D !important; }
#right_bar a:hover { color: #8B7EC8 !important; }
a.bundle { color: #5E409D !important; }
a.bundle:hover { color: #8B7EC8 !important; }
#tag_cloud a { color: #5E409D !important; }
#tag_cloud a:hover { color: #8B7EC8 !important; }
#tag_cloud_header a, a.tag_heading_selected { color: #B7B5AC !important; }
#tag_cloud_header a:hover { color: #5E409D !important; }

/* Pagination */
.next_prev, .next_prev_widget a { color: #205EA6 !important; }
#nextprev a.edit { color: #B7B5AC !important; }

/* Forms */
input[type="text"], input:not([type]), input[type="password"], textarea, select {
  background: #FFFCF0 !important; border: 1px solid #E6E4D9 !important; color: #100F0F !important;
}
input[type="text"]:focus, input:not([type]):focus, textarea:focus, select:focus { border-color: #205EA6 !important; outline: none !important; }
input[type="submit"], input[type="button"] {
  background: #205EA6 !important; color: #FFFCF0 !important; border: none !important; cursor: pointer !important;
}
input[type="submit"]:hover, input[type="button"]:hover { background: #4385BE !important; }
#edit_bookmark_form { background: #F2F0E5 !important; border: 1px solid #E6E4D9 !important; }
.suggested_tag { color: #AD8301 !important; cursor: pointer !important; }

/* Settings */
#settings_panel { background: #FFFCF0 !important; }
.settings_tabs { border-color: #E6E4D9 !important; }
.settings_tab { color: #6F6E69 !important; padding: 6px 12px !important; border-bottom-color: #E6E4D9 !important; }
.settings_tab a { color: inherit !important; text-decoration: none !important; }
.settings_tab:hover { color: #205EA6 !important; }
.settings_tab_selected { color: #205EA6 !important; border: 1px solid #E6E4D9 !important; border-top: 2px solid #205EA6 !important; border-bottom-color: #FFFCF0 !important; background: #FFFCF0 !important; margin-bottom: -1px !important; }
.settings_tab_selected a { color: #205EA6 !important; }
[class*="settings_tab_spacer"] { border-bottom-color: #E6E4D9 !important; }
.settings_heading { color: #5E409D !important; background: transparent !important; border-bottom: 1px solid #E6E4D9 !important; padding-bottom: 6px !important; }
a.help { color: #B7B5AC !important; background: #F2F0E5 !important; }
.email_secret { color: #205EA6 !important; }
#settings_tab_panes { border: none !important; }
#settings_tab_panes table td { color: #100F0F !important; }

/* Notes */
.note { border-bottom: 1px solid #E6E4D9 !important; }
.note a { color: #205EA6 !important; }
#note_right_column { background: #F2F0E5 !important; padding: 16px !important; border-left: 1px solid #E6E4D9 !important; }

/* Profile */
.service_box { background: #F2F0E5 !important; border: 1px solid #E6E4D9 !important; border-radius: 6px !important; padding: 16px !important; box-sizing: border-box !important; margin-bottom: 12px !important; }
#profile_main_column h2, #profile_left_column h2, #profile_right_column h2 { color: #5E409D !important; }

/* Bulk */
#bulk_top_bar, #bulk_edit_box { background: #F2F0E5 !important; border: 1px solid #E6E4D9 !important; }

/* Save Bookmark Popup */
#popup_header { background: #F2F0E5 !important; }
.formtable td { color: #100F0F !important; }

/* Misc */
.bookmark_count, .bookmark_count_box { color: #6F6E69 !important; }
.user_navbar a { color: #5E409D !important; }
.rss_link, .rss_linkbox a { color: #B7B5AC !important; }

/* General */
#footer, .colophon, .colophon a { color: #B7B5AC !important; }
a { color: #205EA6 !important; }
a:hover { color: #4385BE !important; }
h2 { color: #5E409D !important; }

/* ======== DARK MODE (extension Theme = dark or auto+system dark) ======== */
html.pbp-dark body#pinboard { background: #1C1B1A !important; color: #CECDC3 !important; }

/* Banner & Nav (dark) */
html.pbp-dark #banner { background: #282726 !important; border-color: #403E3C !important; }
html.pbp-dark #banner a, html.pbp-dark #top_menu a, html.pbp-dark .banner_username { color: #4385BE !important; }
html.pbp-dark #banner a:hover, html.pbp-dark #top_menu a:hover { color: #5DA0D0 !important; }
html.pbp-dark #pinboard_name a { color: #4385BE !important; }
html.pbp-dark #sub_banner { background: #282726 !important; border-color: #403E3C !important; }
html.pbp-dark #sub_banner a { color: #8B7EC8 !important; }
html.pbp-dark #sub_banner a:hover, html.pbp-dark #sub_banner a.selected { color: #4385BE !important; }

/* Search (dark) */
html.pbp-dark #search_query_field, html.pbp-dark #banner_searchbox input[type="text"] {
  background: #282726 !important; border-color: #403E3C !important; color: #CECDC3 !important;
}
html.pbp-dark #search_query_field:focus, html.pbp-dark #banner_searchbox input[type="text"]:focus { border-color: #4385BE !important; }
html.pbp-dark .search_button input[type="submit"] { background: #4385BE !important; color: #1C1B1A !important; }
html.pbp-dark .search_button input[type="submit"]:hover { background: #5DA0D0 !important; }

/* Bookmarks (dark) */
html.pbp-dark .bookmark { border-bottom-color: #343331 !important; }
html.pbp-dark a.bookmark_title { color: #4385BE !important; }
html.pbp-dark a.bookmark_title:hover { color: #5DA0D0 !important; }
html.pbp-dark a.url_display { color: #879A39 !important; }
html.pbp-dark a.url_link { color: #D0A215 !important; background: #343331 !important; }
html.pbp-dark .description { color: #878580 !important; }
html.pbp-dark .description blockquote { color: #878580 !important; border-left: 3px solid #403E3C !important; padding-left: 10px !important; margin: 4px 0 !important; }
html.pbp-dark a.tag { color: #D0A215 !important; }
html.pbp-dark a.tag:hover { color: #E5B723 !important; }
html.pbp-dark a.cached { color: #575653 !important; }
html.pbp-dark a.when { color: #575653 !important; }
html.pbp-dark .edit_links a { color: #575653 !important; }
html.pbp-dark .edit_links a:hover { color: #878580 !important; }
html.pbp-dark a.copy_link { color: #4385BE !important; }
html.pbp-dark a.delete, html.pbp-dark a.destroy { color: #D14D41 !important; }
html.pbp-dark .private { background: #282726 !important; border-left-color: #D0A215 !important; }
html.pbp-dark a.unread { color: #D14D41 !important; }
html.pbp-dark .star { color: #403E3C !important; }
html.pbp-dark .selected_star { color: #D0A215 !important; }

/* Sidebar (dark) */
html.pbp-dark #right_bar { background: #282726 !important; color: #CECDC3 !important; padding: 12px !important; overflow: hidden !important; word-wrap: break-word !important; box-sizing: border-box !important; }
html.pbp-dark #right_bar h3, html.pbp-dark #right_bar h4, html.pbp-dark #right_bar b { color: #8B7EC8 !important; }
html.pbp-dark #right_bar a { color: #8B7EC8 !important; }
html.pbp-dark #right_bar a:hover { color: #A699D0 !important; }
html.pbp-dark a.bundle { color: #8B7EC8 !important; }
html.pbp-dark a.bundle:hover { color: #A699D0 !important; }
html.pbp-dark #tag_cloud a { color: #8B7EC8 !important; }
html.pbp-dark #tag_cloud a:hover { color: #A699D0 !important; }
html.pbp-dark #tag_cloud_header a, html.pbp-dark a.tag_heading_selected { color: #575653 !important; }
html.pbp-dark #tag_cloud_header a:hover { color: #8B7EC8 !important; }

/* Pagination (dark) */
html.pbp-dark .next_prev, html.pbp-dark .next_prev_widget a { color: #4385BE !important; }
html.pbp-dark #nextprev a.edit { color: #575653 !important; }

/* Forms (dark) */
html.pbp-dark input[type="text"], html.pbp-dark input:not([type]), html.pbp-dark input[type="password"],
html.pbp-dark textarea, html.pbp-dark select {
  background: #282726 !important; border-color: #403E3C !important; color: #CECDC3 !important;
}
html.pbp-dark input[type="text"]:focus, html.pbp-dark input:not([type]):focus, html.pbp-dark textarea:focus, html.pbp-dark select:focus {
  border-color: #4385BE !important;
}
html.pbp-dark input[type="submit"], html.pbp-dark input[type="button"] {
  background: #4385BE !important; color: #1C1B1A !important;
}
html.pbp-dark input[type="submit"]:hover, html.pbp-dark input[type="button"]:hover { background: #5DA0D0 !important; }
html.pbp-dark #edit_bookmark_form { background: #343331 !important; border-color: #403E3C !important; }
html.pbp-dark .suggested_tag { color: #D0A215 !important; }

/* Settings (dark) */
html.pbp-dark #settings_panel { background: #1C1B1A !important; color: #CECDC3 !important; }
html.pbp-dark .settings_tabs { border-color: #403E3C !important; }
html.pbp-dark .settings_tab { color: #878580 !important; border-bottom-color: #403E3C !important; }
html.pbp-dark .settings_tab:hover { color: #4385BE !important; }
html.pbp-dark .settings_tab_selected { color: #4385BE !important; border: 1px solid #403E3C !important; border-top: 2px solid #4385BE !important; border-bottom-color: #1C1B1A !important; background: #1C1B1A !important; margin-bottom: -1px !important; }
html.pbp-dark .settings_tab_selected a { color: #4385BE !important; }
html.pbp-dark [class*="settings_tab_spacer"] { border-bottom-color: #403E3C !important; }
html.pbp-dark .settings_heading { color: #8B7EC8 !important; background: transparent !important; border-bottom: 1px solid #403E3C !important; padding-bottom: 6px !important; }
html.pbp-dark a.help { color: #6B6963 !important; background: #282726 !important; }
html.pbp-dark .email_secret { color: #4385BE !important; }
html.pbp-dark #settings_tab_panes { border: none !important; }
html.pbp-dark #settings_tab_panes table td { color: #CECDC3 !important; }

/* Notes (dark) */
html.pbp-dark .note { border-bottom-color: #343331 !important; }
html.pbp-dark .note a { color: #4385BE !important; }
html.pbp-dark #note_right_column { background: #282726 !important; color: #CECDC3 !important; padding: 16px !important; border-left: 1px solid #403E3C !important; }

/* Profile (dark) */
html.pbp-dark .service_box { background: #282726 !important; border: 1px solid #403E3C !important; color: #CECDC3 !important; border-radius: 6px !important; padding: 16px !important; box-sizing: border-box !important; margin-bottom: 12px !important; }
html.pbp-dark #profile_main_column h2, html.pbp-dark #profile_left_column h2,
html.pbp-dark #profile_right_column h2 { color: #8B7EC8 !important; }
html.pbp-dark #profile_main_column table td, html.pbp-dark #profile_right_column table td { color: #CECDC3 !important; }

/* Bulk (dark) */
html.pbp-dark #bulk_top_bar, html.pbp-dark #bulk_edit_box { background: #343331 !important; border-color: #403E3C !important; color: #CECDC3 !important; }

/* Save Bookmark Popup (dark) */
html.pbp-dark #popup_header { background: #282726 !important; color: #CECDC3 !important; }
html.pbp-dark .formtable td { color: #CECDC3 !important; }

/* Misc (dark) */
html.pbp-dark .bookmark_count, html.pbp-dark .bookmark_count_box { color: #878580 !important; }
html.pbp-dark .user_navbar a { color: #8B7EC8 !important; }
html.pbp-dark .rss_link, html.pbp-dark .rss_linkbox a { color: #575653 !important; }

/* General (dark) */
html.pbp-dark #footer, html.pbp-dark .colophon, html.pbp-dark .colophon a { color: #575653 !important; }
html.pbp-dark hr { border-color: #403E3C !important; }
html.pbp-dark a { color: #4385BE !important; }
html.pbp-dark a:hover { color: #5DA0D0 !important; }
html.pbp-dark h2 { color: #8B7EC8 !important; }`
  },

  // ---- 7. Solarized Light ----
  "solarized-light": {
    name: "Solarized Light",
    desc: "Ethan Schoonover's warm light palette with precise color accents",
    css: `/* Solarized Light Theme */
body#pinboard {
  background: #fdf6e3 !important;
  color: #657b83 !important;
  font-family: "Inter", -apple-system, sans-serif !important;
  letter-spacing: 0.01em !important;
}
body#pinboard table, body#pinboard td, body#pinboard th,
body#pinboard p, body#pinboard b, body#pinboard strong,
body#pinboard label, body#pinboard span, body#pinboard li,
body#pinboard dd, body#pinboard dt { color: inherit !important; }

/* Layout foundation */
#banner { max-width: 1030px !important; box-sizing: border-box !important; border-radius: 4px !important; padding: 8px 16px !important; }
#search_query_field { box-sizing: border-box !important; width: 100% !important; }
#tag_cloud { max-width: 100% !important; overflow-wrap: break-word !important; }
.bookmark { display: flex !important; align-items: flex-start !important; }
.star, .selected_star { margin-left: 0 !important; margin-right: 6px !important; float: none !important; flex-shrink: 0 !important; }
.bookmark .display { float: none !important; flex: 1 !important; width: auto !important; min-width: 0 !important; }
.note .note { border: none !important; padding: 0 !important; margin: 0 !important; background: transparent !important; border-radius: 0 !important; }
.service_box .service_box { border: none !important; padding: 0 !important; margin: 0 !important; background: transparent !important; border-radius: 0 !important; width: auto !important; box-sizing: border-box !important; }
#profile_left_column { margin-right: 20px !important; }
#profile_right_column { width: 430px !important; }
body:not(#pinboard) #popup_header { background: transparent !important; }
body:not(#pinboard) { background: #fdf6e3 !important; color: #657b83 !important; font-family: "Inter", -apple-system, sans-serif !important; letter-spacing: 0.01em !important; }
body:not(#pinboard) table, body:not(#pinboard) td, body:not(#pinboard) p,
body:not(#pinboard) label, body:not(#pinboard) span { color: inherit !important; }

/* ---- Banner & Navigation ---- */
#banner { background: #eee8d5 !important; border-color: #d6cdb5 !important; }
#banner a, #top_menu a, .banner_username { color: #268bd2 !important; }
#banner a:hover, #top_menu a:hover { color: #2aa198 !important; }
#pinboard_name a { color: #268bd2 !important; font-weight: 700 !important; }
#sub_banner { background: #eee8d5 !important; border-color: #d6cdb5 !important; }
#sub_banner a { color: #586e75 !important; }
#sub_banner a:hover, #sub_banner a.selected { color: #268bd2 !important; }

/* ---- Search ---- */
#searchbox { margin-bottom: 12px !important; }
#search_query_field, #banner_searchbox input[type="text"] {
  background: #fdf6e3 !important; color: #657b83 !important; border: 1px solid #d6cdb5 !important;
}
#search_query_field:focus, #banner_searchbox input[type="text"]:focus { border-color: #268bd2 !important; }
.search_button input[type="submit"] {
  background: #268bd2 !important; color: #fdf6e3 !important;
  border: 1px solid #268bd2 !important; cursor: pointer !important;
}
.search_button input[type="submit"]:hover { background: #2aa198 !important; }

/* ---- Main Content ---- */
.bookmark { background: #eee8d5 !important; border-bottom: 1px solid #d6cdb5 !important; padding: 12px 14px !important; border-radius: 2px !important; margin-bottom: 6px !important; border-left: 2px solid transparent !important; }
.bookmark:hover { border-left-color: #268bd2 !important; }
a.bookmark_title { color: #268bd2 !important; font-size: 15px !important; text-decoration: none !important; font-weight: 500 !important; }
a.bookmark_title:hover { color: #2aa198 !important; text-decoration: underline !important; }
a.url_display { color: #859900 !important; font-size: 11px !important; font-family: "Fira Code", "Cascadia Code", monospace !important; }
a.url_link { color: #b58900 !important; background: #fdf6e3 !important; padding: 1px 5px !important; border-radius: 2px !important; font-size: 11px !important; }
.description { color: #657b83 !important; opacity: 0.85 !important; line-height: 1.5 !important; }
.description blockquote { color: #586e75 !important; border-left: 2px solid #268bd2 !important; padding-left: 10px !important; margin: 4px 0 !important; }
a.tag { color: #2aa198 !important; text-decoration: none !important; font-size: 11px !important; font-family: "Fira Code", "Cascadia Code", monospace !important; letter-spacing: 0.02em !important; }
a.tag:hover { color: #268bd2 !important; text-decoration: underline !important; }
a.cached { color: #93a1a1 !important; }
a.when { color: #93a1a1 !important; font-size: 11px !important; font-family: "Fira Code", "Cascadia Code", monospace !important; }
.edit_links a { color: #93a1a1 !important; }
.edit_links a:hover { color: #586e75 !important; }
a.copy_link { color: #268bd2 !important; }
a.delete { color: #dc322f !important; }
a.destroy { color: #dc322f !important; }
.private { background: #eee8d5 !important; border-left: 3px solid #b58900 !important; }
a.unread { color: #dc322f !important; font-weight: bold !important; }
.star { color: #d6cdb5 !important; }
.selected_star { color: #b58900 !important; }

/* ---- Sidebar ---- */
#right_bar { background: #eee8d5 !important; color: #657b83 !important; padding: 12px !important; overflow: hidden !important; word-wrap: break-word !important; box-sizing: border-box !important; }
#right_bar h3, #right_bar h4, #right_bar b { color: #586e75 !important; }
#right_bar a { color: #268bd2 !important; }
#right_bar a:hover { color: #2aa198 !important; }
a.bundle { color: #268bd2 !important; }
a.bundle:hover { color: #2aa198 !important; }
#tag_cloud a { color: #268bd2 !important; }
#tag_cloud a:hover { color: #2aa198 !important; }
#tag_cloud_header a, a.tag_heading_selected { color: #93a1a1 !important; }
#tag_cloud_header a:hover { color: #268bd2 !important; }

/* ---- Pagination ---- */
.next_prev, .next_prev_widget a { color: #268bd2 !important; }
.next_prev:hover, .next_prev_widget a:hover { color: #2aa198 !important; }
#nextprev a.edit { color: #93a1a1 !important; }

/* ---- Forms ---- */
input[type="text"], input:not([type]), input[type="password"], textarea, select {
  background: #fdf6e3 !important; color: #657b83 !important; border: 1px solid #d6cdb5 !important;
}
input[type="text"]:focus, input:not([type]):focus, textarea:focus, select:focus { border-color: #268bd2 !important; outline: none !important; }
input[type="submit"], input[type="button"] {
  background: #268bd2 !important; color: #fdf6e3 !important;
  border: 1px solid #268bd2 !important; cursor: pointer !important;
}
input[type="submit"]:hover, input[type="button"]:hover { background: #2aa198 !important; }
#edit_bookmark_form { background: #eee8d5 !important; border: 1px solid #d6cdb5 !important; }
.suggested_tag { color: #2aa198 !important; cursor: pointer !important; }

/* ---- Settings Page ---- */
#settings_panel { background: #eee8d5 !important; }
.settings_tabs { border-color: #d6cdb5 !important; }
.settings_tab { color: #586e75 !important; padding: 6px 12px !important; border-bottom-color: #d6cdb5 !important; }
.settings_tab a { color: inherit !important; text-decoration: none !important; }
.settings_tab:hover { color: #268bd2 !important; }
.settings_tab_selected { color: #268bd2 !important; border: 1px solid #d6cdb5 !important; border-top: 2px solid #268bd2 !important; border-bottom-color: #eee8d5 !important; background: #eee8d5 !important; font-weight: bold !important; margin-bottom: -1px !important; }
.settings_tab_selected a { color: #268bd2 !important; }
[class*="settings_tab_spacer"] { border-bottom-color: #d6cdb5 !important; }
.settings_heading { color: #586e75 !important; background: transparent !important; border-bottom: 1px solid #d6cdb5 !important; padding-bottom: 6px !important; text-transform: uppercase !important; font-size: 12px !important; letter-spacing: 0.08em !important; }
a.help { color: #93a1a1 !important; background: #eee8d5 !important; }
.email_secret { color: #268bd2 !important; }
#settings_tab_panes { border: none !important; }
#settings_tab_panes table td { color: #657b83 !important; }
input[type="checkbox"] { accent-color: #268bd2 !important; }
input[type="radio"] { accent-color: #268bd2 !important; }

/* ---- Notes Page ---- */
.note { border-bottom: 1px solid #d6cdb5 !important; }
.note a { color: #268bd2 !important; }
#note_right_column { background: #eee8d5 !important; color: #657b83 !important; padding: 16px !important; border-left: 1px solid #d6cdb5 !important; }

/* ---- Profile Page ---- */
.service_box { background: #eee8d5 !important; border: 1px solid #d6cdb5 !important; border-radius: 2px !important; padding: 16px !important; box-sizing: border-box !important; margin-bottom: 12px !important; }
#profile_main_column h2, #profile_left_column h2, #profile_right_column h2 { color: #586e75 !important; }
#profile_main_column table td, #profile_right_column table td { color: #657b83 !important; }

/* ---- Bulk Edit ---- */
#bulk_top_bar, #bulk_edit_box { background: #eee8d5 !important; border: 1px solid #d6cdb5 !important; color: #657b83 !important; }

/* ---- Save Bookmark Popup ---- */
#popup_header { background: #eee8d5 !important; color: #657b83 !important; }
.formtable td { color: #657b83 !important; }
.bookmark_count, .bookmark_count_box { color: #586e75 !important; }
.user_navbar a { color: #268bd2 !important; }
.rss_link, .rss_linkbox a { color: #93a1a1 !important; }

/* ---- Footer & Links ---- */
#footer, .colophon, .colophon a { color: #93a1a1 !important; }
a { color: #268bd2 !important; }
a:hover { color: #2aa198 !important; }
h2 { color: #586e75 !important; }
::selection { background: #eee8d5 !important; }`
  },

  // ---- 8. Solarized Dark ----
  "solarized-dark": {
    name: "Solarized Dark",
    desc: "Ethan Schoonover's iconic dark palette with precise color accents",
    css: `/* Solarized Dark Theme */
body#pinboard {
  background: #002b36 !important;
  color: #839496 !important;
  font-family: "Inter", -apple-system, sans-serif !important;
  letter-spacing: 0.01em !important;
}
body#pinboard table, body#pinboard td, body#pinboard th,
body#pinboard p, body#pinboard b, body#pinboard strong,
body#pinboard label, body#pinboard span, body#pinboard li,
body#pinboard dd, body#pinboard dt { color: inherit !important; }

/* Layout foundation */
#banner { max-width: 1030px !important; box-sizing: border-box !important; border-radius: 4px !important; padding: 8px 16px !important; }
#search_query_field { box-sizing: border-box !important; width: 100% !important; }
#tag_cloud { max-width: 100% !important; overflow-wrap: break-word !important; }
.bookmark { display: flex !important; align-items: flex-start !important; }
.star, .selected_star { margin-left: 0 !important; margin-right: 6px !important; float: none !important; flex-shrink: 0 !important; }
.bookmark .display { float: none !important; flex: 1 !important; width: auto !important; min-width: 0 !important; }
.note .note { border: none !important; padding: 0 !important; margin: 0 !important; background: transparent !important; border-radius: 0 !important; }
.service_box .service_box { border: none !important; padding: 0 !important; margin: 0 !important; background: transparent !important; border-radius: 0 !important; width: auto !important; box-sizing: border-box !important; }
#profile_left_column { margin-right: 20px !important; }
#profile_right_column { width: 430px !important; }
body:not(#pinboard) #popup_header { background: transparent !important; }
body:not(#pinboard) { background: #002b36 !important; color: #839496 !important; font-family: "Inter", -apple-system, sans-serif !important; letter-spacing: 0.01em !important; }
body:not(#pinboard) table, body:not(#pinboard) td, body:not(#pinboard) p,
body:not(#pinboard) label, body:not(#pinboard) span { color: inherit !important; }

/* ---- Banner & Navigation ---- */
#banner { background: #073642 !important; border-color: #094b5a !important; }
#banner a, #top_menu a, .banner_username { color: #268bd2 !important; }
#banner a:hover, #top_menu a:hover { color: #2aa198 !important; }
#pinboard_name a { color: #268bd2 !important; font-weight: 700 !important; }
#sub_banner { background: #073642 !important; border-color: #094b5a !important; }
#sub_banner a { color: #93a1a1 !important; }
#sub_banner a:hover, #sub_banner a.selected { color: #268bd2 !important; }

/* ---- Search ---- */
#searchbox { margin-bottom: 12px !important; }
#search_query_field, #banner_searchbox input[type="text"] {
  background: #002b36 !important; color: #839496 !important; border: 1px solid #094b5a !important;
}
#search_query_field:focus, #banner_searchbox input[type="text"]:focus { border-color: #268bd2 !important; background: #073642 !important; }
.search_button input[type="submit"] {
  background: #268bd2 !important; color: #fdf6e3 !important;
  border: 1px solid #268bd2 !important; cursor: pointer !important; text-transform: uppercase !important; font-size: 11px !important; letter-spacing: 0.05em !important;
}
.search_button input[type="submit"]:hover { background: #2aa198 !important; }

/* ---- Main Content ---- */
.bookmark { background: #073642 !important; border-bottom: 1px solid #094b5a !important; padding: 12px 14px !important; border-radius: 2px !important; margin-bottom: 6px !important; border-left: 2px solid transparent !important; }
.bookmark:hover { border-left-color: #268bd2 !important; }
a.bookmark_title { color: #268bd2 !important; font-size: 15px !important; text-decoration: none !important; font-weight: 500 !important; }
a.bookmark_title:hover { color: #2aa198 !important; text-decoration: underline !important; }
a.url_display { color: #859900 !important; font-size: 11px !important; font-family: "Fira Code", "Cascadia Code", monospace !important; }
a.url_link { color: #b58900 !important; background: #002b36 !important; padding: 1px 5px !important; border-radius: 2px !important; font-size: 11px !important; }
.description { color: #839496 !important; opacity: 0.8 !important; line-height: 1.5 !important; }
.description blockquote { color: #93a1a1 !important; border-left: 2px solid #268bd2 !important; padding-left: 10px !important; margin: 4px 0 !important; }
a.tag { color: #2aa198 !important; text-decoration: none !important; font-size: 11px !important; font-family: "Fira Code", "Cascadia Code", monospace !important; letter-spacing: 0.02em !important; }
a.tag:hover { color: #268bd2 !important; text-decoration: underline !important; }
a.cached { color: #586e75 !important; }
a.when { color: #586e75 !important; font-size: 11px !important; font-family: "Fira Code", "Cascadia Code", monospace !important; }
.edit_links a { color: #586e75 !important; }
.edit_links a:hover { color: #93a1a1 !important; }
a.copy_link { color: #268bd2 !important; }
a.delete { color: #dc322f !important; }
a.destroy { color: #dc322f !important; }
.private { background: #073642 !important; border-left: 2px solid #b58900 !important; }
a.unread { color: #dc322f !important; font-weight: bold !important; }
.star { color: #094b5a !important; }
.selected_star { color: #b58900 !important; }

/* ---- Sidebar ---- */
#right_bar { background: #073642 !important; color: #839496 !important; padding: 12px !important; overflow: hidden !important; word-wrap: break-word !important; box-sizing: border-box !important; }
#right_bar h3, #right_bar h4, #right_bar b { color: #93a1a1 !important; }
#right_bar a { color: #268bd2 !important; }
#right_bar a:hover { color: #2aa198 !important; }
a.bundle { color: #268bd2 !important; }
a.bundle:hover { color: #2aa198 !important; }
#tag_cloud a { color: #268bd2 !important; }
#tag_cloud a:hover { color: #2aa198 !important; }
#tag_cloud_header a, a.tag_heading_selected { color: #586e75 !important; }
#tag_cloud_header a:hover { color: #268bd2 !important; }

/* ---- Pagination ---- */
.next_prev, .next_prev_widget a { color: #268bd2 !important; }
.next_prev:hover, .next_prev_widget a:hover { color: #2aa198 !important; }
#nextprev a.edit { color: #586e75 !important; }

/* ---- Forms ---- */
input[type="text"], input:not([type]), input[type="password"], textarea, select {
  background: #073642 !important; color: #839496 !important; border: 1px solid #094b5a !important;
}
input[type="text"]:focus, input:not([type]):focus, textarea:focus, select:focus { border-color: #268bd2 !important; outline: none !important; }
input[type="submit"], input[type="button"] {
  background: #268bd2 !important; color: #fdf6e3 !important;
  border: 1px solid #268bd2 !important; cursor: pointer !important;
}
input[type="submit"]:hover, input[type="button"]:hover { background: #2aa198 !important; }
#edit_bookmark_form { background: #073642 !important; border: 1px solid #094b5a !important; }
.suggested_tag { color: #2aa198 !important; cursor: pointer !important; }

/* ---- Settings Page ---- */
#settings_panel { background: #073642 !important; }
.settings_tabs { border-color: #094b5a !important; }
.settings_tab { color: #93a1a1 !important; padding: 6px 12px !important; border-bottom-color: #094b5a !important; }
.settings_tab a { color: inherit !important; text-decoration: none !important; }
.settings_tab:hover { color: #268bd2 !important; }
.settings_tab_selected { color: #268bd2 !important; border: 1px solid #094b5a !important; border-top: 2px solid #268bd2 !important; border-bottom-color: #073642 !important; background: #073642 !important; font-weight: bold !important; margin-bottom: -1px !important; }
.settings_tab_selected a { color: #268bd2 !important; }
[class*="settings_tab_spacer"] { border-bottom-color: #094b5a !important; }
.settings_heading { color: #93a1a1 !important; background: transparent !important; border-bottom: 1px solid #094b5a !important; padding-bottom: 6px !important; text-transform: uppercase !important; font-size: 12px !important; letter-spacing: 0.08em !important; }
a.help { color: #586e75 !important; background: #073642 !important; }
.email_secret { color: #268bd2 !important; }
#settings_tab_panes { border: none !important; }
#settings_tab_panes table td { color: #839496 !important; }
input[type="checkbox"] { accent-color: #268bd2 !important; }
input[type="radio"] { accent-color: #268bd2 !important; }

/* ---- Notes Page ---- */
.note { border-bottom: 1px solid #094b5a !important; }
.note a { color: #268bd2 !important; }
#note_right_column { background: #073642 !important; color: #839496 !important; padding: 16px !important; border-left: 1px solid #094b5a !important; }

/* ---- Profile Page ---- */
.service_box { background: #073642 !important; border: 1px solid #094b5a !important; border-radius: 2px !important; padding: 16px !important; box-sizing: border-box !important; margin-bottom: 12px !important; }
#profile_main_column h2, #profile_left_column h2, #profile_right_column h2 { color: #93a1a1 !important; }
#profile_main_column table td, #profile_right_column table td { color: #839496 !important; }

/* ---- Bulk Edit ---- */
#bulk_top_bar, #bulk_edit_box { background: #073642 !important; border: 1px solid #094b5a !important; color: #839496 !important; }

/* ---- Save Bookmark Popup ---- */
#popup_header { background: #073642 !important; color: #839496 !important; }
.formtable td { color: #839496 !important; }
.bookmark_count, .bookmark_count_box { color: #93a1a1 !important; }
.user_navbar a { color: #268bd2 !important; }
.rss_link, .rss_linkbox a { color: #586e75 !important; }

/* ---- Footer & Links ---- */
#footer, .colophon, .colophon a { color: #586e75 !important; }
hr { border-color: #094b5a !important; }
a { color: #268bd2 !important; }
a:hover { color: #2aa198 !important; }
h2 { color: #93a1a1 !important; }
::selection { background: #0a4a5a !important; color: #eee8d5 !important; }`
  },

  // ---- 9. Catppuccin Latte ----
  "catppuccin-latte": {
    name: "Catppuccin Latte",
    desc: "Soothing pastel light theme from the Catppuccin palette",
    css: `/* Catppuccin Latte Theme */
body#pinboard {
  background: #eff1f5 !important;
  color: #4c4f69 !important;
  font-family: "Nunito", "Inter", -apple-system, sans-serif !important;
}
body#pinboard table, body#pinboard td, body#pinboard th,
body#pinboard p, body#pinboard b, body#pinboard strong,
body#pinboard label, body#pinboard span, body#pinboard li,
body#pinboard dd, body#pinboard dt { color: inherit !important; }

/* Layout foundation */
#banner { max-width: 1030px !important; box-sizing: border-box !important; border-radius: 4px !important; padding: 8px 16px !important; }
#search_query_field { box-sizing: border-box !important; width: 100% !important; }
#tag_cloud { max-width: 100% !important; overflow-wrap: break-word !important; }
.bookmark { display: flex !important; align-items: flex-start !important; }
.star, .selected_star { margin-left: 0 !important; margin-right: 6px !important; float: none !important; flex-shrink: 0 !important; }
.bookmark .display { float: none !important; flex: 1 !important; width: auto !important; min-width: 0 !important; }
.note .note { border: none !important; padding: 0 !important; margin: 0 !important; background: transparent !important; border-radius: 0 !important; }
.service_box .service_box { border: none !important; padding: 0 !important; margin: 0 !important; background: transparent !important; border-radius: 0 !important; width: auto !important; box-sizing: border-box !important; }
#profile_left_column { margin-right: 20px !important; }
#profile_right_column { width: 430px !important; }
body:not(#pinboard) #popup_header { background: transparent !important; }
body:not(#pinboard) { background: #eff1f5 !important; color: #4c4f69 !important; font-family: "Nunito", "Inter", -apple-system, sans-serif !important; }
body:not(#pinboard) table, body:not(#pinboard) td, body:not(#pinboard) p,
body:not(#pinboard) label, body:not(#pinboard) span { color: inherit !important; }

/* ---- Banner & Navigation ---- */
#banner { background: #e6e9ef !important; border-color: #ccd0da !important; }
#banner a, #top_menu a, .banner_username { color: #1e66f5 !important; }
#banner a:hover, #top_menu a:hover { color: #179299 !important; }
#pinboard_name a { color: #1e66f5 !important; font-weight: 700 !important; }
#sub_banner { background: #e6e9ef !important; border-color: #ccd0da !important; }
#sub_banner a { color: #6c6f85 !important; }
#sub_banner a:hover, #sub_banner a.selected { color: #1e66f5 !important; }

/* ---- Search ---- */
#searchbox { margin-bottom: 12px !important; }
#search_query_field, #banner_searchbox input[type="text"] {
  background: #eff1f5 !important; color: #4c4f69 !important; border: 1px solid #ccd0da !important; border-radius: 12px !important;
}
#search_query_field:focus, #banner_searchbox input[type="text"]:focus { border-color: #1e66f5 !important; }
.search_button input[type="submit"] {
  background: #1e66f5 !important; color: #eff1f5 !important;
  border: 1px solid #1e66f5 !important; cursor: pointer !important; border-radius: 12px !important;
}
.search_button input[type="submit"]:hover { background: #179299 !important; }

/* ---- Main Content ---- */
.bookmark { background: #e6e9ef !important; border: none !important; padding: 14px 18px !important; border-radius: 12px !important; margin-bottom: 8px !important; box-shadow: 0 1px 4px rgba(0,0,0,0.06) !important; }
.bookmark:hover { box-shadow: 0 2px 10px rgba(0,0,0,0.1) !important; }
a.bookmark_title { color: #1e66f5 !important; font-size: 15px !important; text-decoration: none !important; font-weight: 600 !important; }
a.bookmark_title:hover { color: #179299 !important; text-decoration: none !important; }
a.url_display { color: #40a02b !important; font-size: 12px !important; }
a.url_link { color: #df8e1d !important; background: #eff1f5 !important; padding: 2px 8px !important; border-radius: 10px !important; font-size: 11px !important; }
.description { color: #5c5f77 !important; line-height: 1.6 !important; }
.description blockquote { color: #6c6f85 !important; border-left: 3px solid #8839ef !important; padding-left: 12px !important; margin: 6px 0 !important; }
a.tag { color: #179299 !important; text-decoration: none !important; font-size: 11px !important; background: #dce0e8 !important; padding: 1px 8px !important; border-radius: 10px !important; }
a.tag:hover { color: #eff1f5 !important; background: #1e66f5 !important; text-decoration: none !important; }
a.cached { color: #9ca0b0 !important; }
a.when { color: #9ca0b0 !important; font-size: 11px !important; }
.edit_links a { color: #9ca0b0 !important; }
.edit_links a:hover { color: #4c4f69 !important; }
a.copy_link { color: #1e66f5 !important; }
a.delete { color: #d20f39 !important; }
a.destroy { color: #d20f39 !important; }
.private { background: #e6e9ef !important; border-left: 3px solid #df8e1d !important; }
a.unread { color: #d20f39 !important; font-weight: bold !important; }
.star { color: #ccd0da !important; }
.selected_star { color: #df8e1d !important; }

/* ---- Sidebar ---- */
#right_bar { background: #e6e9ef !important; color: #4c4f69 !important; padding: 12px !important; overflow: hidden !important; word-wrap: break-word !important; box-sizing: border-box !important; }
#right_bar h3, #right_bar h4, #right_bar b { color: #6c6f85 !important; }
#right_bar a { color: #1e66f5 !important; }
#right_bar a:hover { color: #179299 !important; }
a.bundle { color: #1e66f5 !important; }
a.bundle:hover { color: #179299 !important; }
#tag_cloud a { color: #1e66f5 !important; }
#tag_cloud a:hover { color: #179299 !important; }
#tag_cloud_header a, a.tag_heading_selected { color: #9ca0b0 !important; }
#tag_cloud_header a:hover { color: #1e66f5 !important; }

/* ---- Pagination ---- */
.next_prev, .next_prev_widget a { color: #1e66f5 !important; }
.next_prev:hover, .next_prev_widget a:hover { color: #179299 !important; }
#nextprev a.edit { color: #9ca0b0 !important; }

/* ---- Forms ---- */
input[type="text"], input:not([type]), input[type="password"], textarea, select {
  background: #eff1f5 !important; color: #4c4f69 !important; border: 1px solid #ccd0da !important; border-radius: 8px !important;
}
input[type="text"]:focus, input:not([type]):focus, textarea:focus, select:focus { border-color: #1e66f5 !important; outline: none !important; }
input[type="submit"], input[type="button"] {
  background: #1e66f5 !important; color: #eff1f5 !important;
  border: 1px solid #1e66f5 !important; cursor: pointer !important; border-radius: 12px !important;
}
input[type="submit"]:hover, input[type="button"]:hover { background: #179299 !important; }
#edit_bookmark_form { background: #e6e9ef !important; border: 1px solid #ccd0da !important; border-radius: 12px !important; }
.suggested_tag { color: #179299 !important; cursor: pointer !important; }

/* ---- Settings Page ---- */
#settings_panel { background: #e6e9ef !important; }
.settings_tabs { border-color: #ccd0da !important; }
.settings_tab { color: #6c6f85 !important; padding: 6px 12px !important; border-bottom-color: #ccd0da !important; }
.settings_tab a { color: inherit !important; text-decoration: none !important; }
.settings_tab:hover { color: #1e66f5 !important; }
.settings_tab_selected { color: #1e66f5 !important; border: 1px solid #ccd0da !important; border-top: 2px solid #1e66f5 !important; border-bottom-color: #e6e9ef !important; background: #e6e9ef !important; font-weight: bold !important; margin-bottom: -1px !important; }
.settings_tab_selected a { color: #1e66f5 !important; }
[class*="settings_tab_spacer"] { border-bottom-color: #ccd0da !important; }
.settings_heading { color: #6c6f85 !important; background: transparent !important; border-bottom: 1px solid #ccd0da !important; padding-bottom: 6px !important; }
a.help { color: #9ca0b0 !important; background: #e6e9ef !important; }
.email_secret { color: #1e66f5 !important; }
#settings_tab_panes { border: none !important; }
#settings_tab_panes table td { color: #4c4f69 !important; }
input[type="checkbox"] { accent-color: #1e66f5 !important; }
input[type="radio"] { accent-color: #1e66f5 !important; }

/* ---- Notes Page ---- */
.note { border-bottom: 1px solid #ccd0da !important; }
.note a { color: #1e66f5 !important; }
#note_right_column { background: #e6e9ef !important; color: #4c4f69 !important; padding: 16px !important; border-left: 1px solid #ccd0da !important; }

/* ---- Profile Page ---- */
.service_box { background: #e6e9ef !important; border: 1px solid #ccd0da !important; border-radius: 12px !important; padding: 16px !important; box-sizing: border-box !important; margin-bottom: 12px !important; box-shadow: 0 1px 4px rgba(0,0,0,0.06) !important; }
#profile_main_column h2, #profile_left_column h2, #profile_right_column h2 { color: #6c6f85 !important; }
#profile_main_column table td, #profile_right_column table td { color: #4c4f69 !important; }

/* ---- Bulk Edit ---- */
#bulk_top_bar, #bulk_edit_box { background: #e6e9ef !important; border: 1px solid #ccd0da !important; color: #4c4f69 !important; border-radius: 12px !important; }

/* ---- Save Bookmark Popup ---- */
#popup_header { background: #e6e9ef !important; color: #4c4f69 !important; }
.formtable td { color: #4c4f69 !important; }
.bookmark_count, .bookmark_count_box { color: #6c6f85 !important; }
.user_navbar a { color: #1e66f5 !important; }
.rss_link, .rss_linkbox a { color: #9ca0b0 !important; }

/* ---- Footer & Links ---- */
#footer, .colophon, .colophon a { color: #9ca0b0 !important; }
a { color: #1e66f5 !important; }
a:hover { color: #179299 !important; }
h2 { color: #6c6f85 !important; }
::selection { background: #e6e9ef !important; }`
  },

  // ---- 10. Catppuccin Mocha ----
  "catppuccin-mocha": {
    name: "Catppuccin Mocha",
    desc: "Rich dark theme from the Catppuccin palette with pastel accents",
    css: `/* Catppuccin Mocha Theme */
body#pinboard {
  background: #1e1e2e !important;
  color: #cdd6f4 !important;
  font-family: "Nunito", "Inter", -apple-system, sans-serif !important;
}
body#pinboard table, body#pinboard td, body#pinboard th,
body#pinboard p, body#pinboard b, body#pinboard strong,
body#pinboard label, body#pinboard span, body#pinboard li,
body#pinboard dd, body#pinboard dt { color: inherit !important; }

/* Layout foundation */
#banner { max-width: 1030px !important; box-sizing: border-box !important; border-radius: 4px !important; padding: 8px 16px !important; }
#search_query_field { box-sizing: border-box !important; width: 100% !important; }
#tag_cloud { max-width: 100% !important; overflow-wrap: break-word !important; }
.bookmark { display: flex !important; align-items: flex-start !important; }
.star, .selected_star { margin-left: 0 !important; margin-right: 6px !important; float: none !important; flex-shrink: 0 !important; }
.bookmark .display { float: none !important; flex: 1 !important; width: auto !important; min-width: 0 !important; }
.note .note { border: none !important; padding: 0 !important; margin: 0 !important; background: transparent !important; border-radius: 0 !important; }
.service_box .service_box { border: none !important; padding: 0 !important; margin: 0 !important; background: transparent !important; border-radius: 0 !important; width: auto !important; box-sizing: border-box !important; }
#profile_left_column { margin-right: 20px !important; }
#profile_right_column { width: 430px !important; }
body:not(#pinboard) #popup_header { background: transparent !important; }
body:not(#pinboard) { background: #1e1e2e !important; color: #cdd6f4 !important; font-family: "Nunito", "Inter", -apple-system, sans-serif !important; }
body:not(#pinboard) table, body:not(#pinboard) td, body:not(#pinboard) p,
body:not(#pinboard) label, body:not(#pinboard) span { color: inherit !important; }

/* ---- Banner & Navigation ---- */
#banner { background: #313244 !important; border-color: #45475a !important; }
#banner a, #top_menu a, .banner_username { color: #89b4fa !important; }
#banner a:hover, #top_menu a:hover { color: #cba6f7 !important; }
#pinboard_name a { color: #89b4fa !important; font-weight: 700 !important; }
#sub_banner { background: #313244 !important; border-color: #45475a !important; }
#sub_banner a { color: #a6adc8 !important; }
#sub_banner a:hover, #sub_banner a.selected { color: #89b4fa !important; }

/* ---- Search ---- */
#searchbox { margin-bottom: 12px !important; }
#search_query_field, #banner_searchbox input[type="text"] {
  background: #1e1e2e !important; color: #cdd6f4 !important; border: 1px solid #45475a !important; border-radius: 12px !important;
}
#search_query_field:focus, #banner_searchbox input[type="text"]:focus { border-color: #89b4fa !important; background: #313244 !important; }
.search_button input[type="submit"] {
  background: #89b4fa !important; color: #1e1e2e !important;
  border: 1px solid #89b4fa !important; cursor: pointer !important; border-radius: 12px !important;
}
.search_button input[type="submit"]:hover { background: #cba6f7 !important; }

/* ---- Main Content ---- */
.bookmark { background: #313244 !important; border: none !important; padding: 14px 18px !important; border-radius: 12px !important; margin-bottom: 8px !important; box-shadow: 0 2px 8px rgba(0,0,0,0.2) !important; }
.bookmark:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.3) !important; }
a.bookmark_title { color: #89b4fa !important; font-size: 15px !important; text-decoration: none !important; font-weight: 600 !important; }
a.bookmark_title:hover { color: #cba6f7 !important; text-decoration: none !important; }
a.url_display { color: #a6e3a1 !important; font-size: 12px !important; }
a.url_link { color: #f9e2af !important; background: #1e1e2e !important; padding: 2px 8px !important; border-radius: 10px !important; font-size: 11px !important; }
.description { color: #bac2de !important; line-height: 1.6 !important; }
.description blockquote { color: #a6adc8 !important; border-left: 3px solid #cba6f7 !important; padding-left: 12px !important; margin: 6px 0 !important; }
a.tag { color: #94e2d5 !important; text-decoration: none !important; font-size: 11px !important; background: #45475a !important; padding: 1px 8px !important; border-radius: 10px !important; }
a.tag:hover { color: #1e1e2e !important; background: #89b4fa !important; text-decoration: none !important; }
a.cached { color: #585b70 !important; }
a.when { color: #585b70 !important; font-size: 11px !important; }
.edit_links a { color: #585b70 !important; }
.edit_links a:hover { color: #cdd6f4 !important; }
a.copy_link { color: #89b4fa !important; }
a.delete { color: #f38ba8 !important; }
a.destroy { color: #f38ba8 !important; }
.private { background: #313244 !important; border-left: 3px solid #f9e2af !important; }
a.unread { color: #f38ba8 !important; font-weight: bold !important; }
.star { color: #45475a !important; }
.selected_star { color: #f9e2af !important; }

/* ---- Sidebar ---- */
#right_bar { background: #313244 !important; color: #cdd6f4 !important; padding: 12px !important; overflow: hidden !important; word-wrap: break-word !important; box-sizing: border-box !important; }
#right_bar h3, #right_bar h4, #right_bar b { color: #cba6f7 !important; }
#right_bar a { color: #89b4fa !important; }
#right_bar a:hover { color: #cba6f7 !important; }
a.bundle { color: #89b4fa !important; }
a.bundle:hover { color: #cba6f7 !important; }
#tag_cloud a { color: #89b4fa !important; }
#tag_cloud a:hover { color: #cba6f7 !important; }
#tag_cloud_header a, a.tag_heading_selected { color: #585b70 !important; }
#tag_cloud_header a:hover { color: #89b4fa !important; }

/* ---- Pagination ---- */
.next_prev, .next_prev_widget a { color: #89b4fa !important; }
.next_prev:hover, .next_prev_widget a:hover { color: #cba6f7 !important; }
#nextprev a.edit { color: #585b70 !important; }

/* ---- Forms ---- */
input[type="text"], input:not([type]), input[type="password"], textarea, select {
  background: #1e1e2e !important; color: #cdd6f4 !important; border: 1px solid #45475a !important; border-radius: 8px !important;
}
input[type="text"]:focus, input:not([type]):focus, textarea:focus, select:focus { border-color: #89b4fa !important; outline: none !important; background: #313244 !important; }
input[type="submit"], input[type="button"] {
  background: #89b4fa !important; color: #1e1e2e !important;
  border: 1px solid #89b4fa !important; cursor: pointer !important; border-radius: 12px !important;
}
input[type="submit"]:hover, input[type="button"]:hover { background: #cba6f7 !important; }
#edit_bookmark_form { background: #313244 !important; border: 1px solid #45475a !important; border-radius: 12px !important; }
.suggested_tag { color: #94e2d5 !important; cursor: pointer !important; }

/* ---- Settings Page ---- */
#settings_panel { background: #313244 !important; border-radius: 8px !important; }
.settings_tabs { border-color: #45475a !important; }
.settings_tab { color: #a6adc8 !important; padding: 6px 12px !important; border-bottom-color: #45475a !important; }
.settings_tab a { color: inherit !important; text-decoration: none !important; }
.settings_tab:hover { color: #89b4fa !important; }
.settings_tab_selected { color: #89b4fa !important; border: 1px solid #45475a !important; border-top: 2px solid #89b4fa !important; border-bottom-color: #313244 !important; background: #313244 !important; font-weight: bold !important; margin-bottom: -1px !important; }
.settings_tab_selected a { color: #89b4fa !important; }
[class*="settings_tab_spacer"] { border-bottom-color: #45475a !important; }
.settings_heading { color: #cba6f7 !important; background: transparent !important; border-bottom: 1px solid #45475a !important; padding-bottom: 6px !important; }
a.help { color: #585b70 !important; background: #313244 !important; }
.email_secret { color: #89b4fa !important; }
#settings_tab_panes { border: none !important; }
#settings_tab_panes table td { color: #cdd6f4 !important; }
input[type="checkbox"] { accent-color: #89b4fa !important; }
input[type="radio"] { accent-color: #89b4fa !important; }

/* ---- Notes Page ---- */
.note { border-bottom: 1px solid #45475a !important; }
.note a { color: #89b4fa !important; }
#note_right_column { background: #313244 !important; color: #cdd6f4 !important; padding: 16px !important; border-left: 1px solid #45475a !important; border-radius: 8px !important; }

/* ---- Profile Page ---- */
.service_box { background: #313244 !important; border: 1px solid #45475a !important; border-radius: 12px !important; padding: 16px !important; box-sizing: border-box !important; margin-bottom: 12px !important; box-shadow: 0 2px 8px rgba(0,0,0,0.2) !important; }
#profile_main_column h2, #profile_left_column h2, #profile_right_column h2 { color: #cba6f7 !important; }
#profile_main_column table td, #profile_right_column table td { color: #cdd6f4 !important; }

/* ---- Bulk Edit ---- */
#bulk_top_bar, #bulk_edit_box { background: #313244 !important; border: 1px solid #45475a !important; color: #cdd6f4 !important; border-radius: 12px !important; }

/* ---- Save Bookmark Popup ---- */
#popup_header { background: #313244 !important; color: #cdd6f4 !important; }
.formtable td { color: #cdd6f4 !important; }
.bookmark_count, .bookmark_count_box { color: #a6adc8 !important; }
.user_navbar a { color: #89b4fa !important; }
.rss_link, .rss_linkbox a { color: #585b70 !important; }

/* ---- Footer & Links ---- */
#footer, .colophon, .colophon a { color: #585b70 !important; }
hr { border-color: #45475a !important; }
a { color: #89b4fa !important; }
a:hover { color: #cba6f7 !important; }
h2 { color: #cba6f7 !important; }
::selection { background: #585b70 !important; color: #cdd6f4 !important; }`
  },

  // ---- 11. Gruvbox Dark ----
  "gruvbox-dark": {
    name: "Gruvbox Dark",
    desc: "Retro warm dark theme with earthy tones",
    css: `/* Gruvbox Dark Theme */
body#pinboard {
  background: #282828 !important;
  color: #ebdbb2 !important;
  font-family: "IBM Plex Sans", "Inter", -apple-system, sans-serif !important;
  font-weight: 450 !important;
}
body#pinboard table, body#pinboard td, body#pinboard th,
body#pinboard p, body#pinboard b, body#pinboard strong,
body#pinboard label, body#pinboard span, body#pinboard li,
body#pinboard dd, body#pinboard dt { color: inherit !important; }

/* Layout foundation */
#banner { max-width: 1030px !important; box-sizing: border-box !important; border-radius: 4px !important; padding: 8px 16px !important; }
#search_query_field { box-sizing: border-box !important; width: 100% !important; }
#tag_cloud { max-width: 100% !important; overflow-wrap: break-word !important; }
.bookmark { display: flex !important; align-items: flex-start !important; }
.star, .selected_star { margin-left: 0 !important; margin-right: 6px !important; float: none !important; flex-shrink: 0 !important; }
.bookmark .display { float: none !important; flex: 1 !important; width: auto !important; min-width: 0 !important; }
.note .note { border: none !important; padding: 0 !important; margin: 0 !important; background: transparent !important; border-radius: 0 !important; }
.service_box .service_box { border: none !important; padding: 0 !important; margin: 0 !important; background: transparent !important; border-radius: 0 !important; width: auto !important; box-sizing: border-box !important; }
#profile_left_column { margin-right: 20px !important; }
#profile_right_column { width: 430px !important; }
body:not(#pinboard) #popup_header { background: transparent !important; }
body:not(#pinboard) { background: #282828 !important; color: #ebdbb2 !important; font-family: "IBM Plex Sans", "Inter", -apple-system, sans-serif !important; font-weight: 450 !important; }
body:not(#pinboard) table, body:not(#pinboard) td, body:not(#pinboard) p,
body:not(#pinboard) label, body:not(#pinboard) span { color: inherit !important; }

/* ---- Banner & Navigation ---- */
#banner { background: #3c3836 !important; border-color: #504945 !important; }
#banner a, #top_menu a, .banner_username { color: #83a598 !important; }
#banner a:hover, #top_menu a:hover { color: #d3869b !important; }
#pinboard_name a { color: #83a598 !important; font-weight: 700 !important; }
#sub_banner { background: #3c3836 !important; border-color: #504945 !important; }
#sub_banner a { color: #a89984 !important; }
#sub_banner a:hover, #sub_banner a.selected { color: #83a598 !important; }

/* ---- Search ---- */
#searchbox { margin-bottom: 12px !important; }
#search_query_field, #banner_searchbox input[type="text"] {
  background: #282828 !important; color: #ebdbb2 !important; border: 2px solid #504945 !important;
}
#search_query_field:focus, #banner_searchbox input[type="text"]:focus { border-color: #83a598 !important; background: #3c3836 !important; }
.search_button input[type="submit"] {
  background: #83a598 !important; color: #282828 !important;
  border: 2px solid #83a598 !important; cursor: pointer !important; font-weight: 700 !important; text-transform: uppercase !important; letter-spacing: 0.05em !important;
}
.search_button input[type="submit"]:hover { background: #b8bb26 !important; border-color: #b8bb26 !important; }

/* ---- Main Content ---- */
.bookmark { background: #3c3836 !important; border-left: 3px solid #504945 !important; border-bottom: none !important; border-top: none !important; border-right: none !important; padding: 12px 14px !important; border-radius: 0 !important; margin-bottom: 4px !important; }
.bookmark:hover { border-left-color: #fabd2f !important; }
a.bookmark_title { color: #83a598 !important; font-size: 15px !important; text-decoration: none !important; font-weight: 700 !important; }
a.bookmark_title:hover { color: #d3869b !important; text-decoration: underline !important; }
a.url_display { color: #fabd2f !important; font-size: 12px !important; }
a.url_link { color: #fabd2f !important; background: #282828 !important; padding: 1px 5px !important; border-radius: 0 !important; border: 1px solid #504945 !important; }
.description { color: #d5c4a1 !important; line-height: 1.5 !important; }
.description blockquote { color: #bdae93 !important; border-left: 3px solid #fabd2f !important; padding-left: 10px !important; margin: 4px 0 !important; }
a.tag { color: #b8bb26 !important; text-decoration: none !important; font-size: 11px !important; font-weight: 700 !important; text-transform: lowercase !important; }
a.tag::before { content: "#" !important; }
a.tag:hover { color: #83a598 !important; text-decoration: underline !important; }
a.cached { color: #665c54 !important; }
a.when { color: #665c54 !important; font-size: 11px !important; }
.edit_links a { color: #665c54 !important; }
.edit_links a:hover { color: #ebdbb2 !important; }
a.copy_link { color: #83a598 !important; }
a.delete { color: #fb4934 !important; }
a.destroy { color: #fb4934 !important; }
.private { background: #3c3836 !important; border-left: 3px solid #fabd2f !important; }
a.unread { color: #fb4934 !important; font-weight: bold !important; }
.star { color: #504945 !important; }
.selected_star { color: #fabd2f !important; }

/* ---- Sidebar ---- */
#right_bar { background: #3c3836 !important; color: #ebdbb2 !important; padding: 12px !important; overflow: hidden !important; word-wrap: break-word !important; box-sizing: border-box !important; }
#right_bar h3, #right_bar h4, #right_bar b { color: #d3869b !important; }
#right_bar a { color: #83a598 !important; }
#right_bar a:hover { color: #d3869b !important; }
a.bundle { color: #83a598 !important; }
a.bundle:hover { color: #d3869b !important; }
#tag_cloud a { color: #83a598 !important; }
#tag_cloud a:hover { color: #d3869b !important; }
#tag_cloud_header a, a.tag_heading_selected { color: #665c54 !important; }
#tag_cloud_header a:hover { color: #83a598 !important; }

/* ---- Pagination ---- */
.next_prev, .next_prev_widget a { color: #83a598 !important; }
.next_prev:hover, .next_prev_widget a:hover { color: #d3869b !important; }
#nextprev a.edit { color: #665c54 !important; }

/* ---- Forms ---- */
input[type="text"], input:not([type]), input[type="password"], textarea, select {
  background: #282828 !important; color: #ebdbb2 !important; border: 2px solid #504945 !important;
}
input[type="text"]:focus, input:not([type]):focus, textarea:focus, select:focus { border-color: #83a598 !important; outline: none !important; background: #3c3836 !important; }
input[type="submit"], input[type="button"] {
  background: #83a598 !important; color: #282828 !important;
  border: 2px solid #83a598 !important; cursor: pointer !important; font-weight: 700 !important;
}
input[type="submit"]:hover, input[type="button"]:hover { background: #b8bb26 !important; border-color: #b8bb26 !important; }
#edit_bookmark_form { background: #3c3836 !important; border: 2px solid #504945 !important; }
.suggested_tag { color: #b8bb26 !important; cursor: pointer !important; }

/* ---- Settings Page ---- */
#settings_panel { background: #3c3836 !important; }
.settings_tabs { border-color: #504945 !important; }
.settings_tab { color: #a89984 !important; padding: 6px 12px !important; border-bottom-color: #504945 !important; }
.settings_tab a { color: inherit !important; text-decoration: none !important; }
.settings_tab:hover { color: #83a598 !important; }
.settings_tab_selected { color: #83a598 !important; border: 1px solid #504945 !important; border-top: 2px solid #83a598 !important; border-bottom-color: #3c3836 !important; background: #3c3836 !important; font-weight: bold !important; margin-bottom: -1px !important; }
.settings_tab_selected a { color: #83a598 !important; }
[class*="settings_tab_spacer"] { border-bottom-color: #504945 !important; }
.settings_heading { color: #d3869b !important; background: transparent !important; border-bottom: 2px solid #504945 !important; padding-bottom: 6px !important; text-transform: uppercase !important; font-weight: 700 !important; letter-spacing: 0.05em !important; }
a.help { color: #665c54 !important; background: #3c3836 !important; }
.email_secret { color: #83a598 !important; }
#settings_tab_panes { border: none !important; }
#settings_tab_panes table td { color: #ebdbb2 !important; }
input[type="checkbox"] { accent-color: #83a598 !important; }
input[type="radio"] { accent-color: #83a598 !important; }

/* ---- Notes Page ---- */
.note { border-bottom: 1px solid #504945 !important; }
.note a { color: #83a598 !important; }
#note_right_column { background: #3c3836 !important; color: #ebdbb2 !important; padding: 16px !important; border-left: 2px solid #504945 !important; }

/* ---- Profile Page ---- */
.service_box { background: #3c3836 !important; border: 2px solid #504945 !important; border-radius: 0 !important; padding: 16px !important; box-sizing: border-box !important; margin-bottom: 12px !important; }
#profile_main_column h2, #profile_left_column h2, #profile_right_column h2 { color: #d3869b !important; text-transform: uppercase !important; letter-spacing: 0.05em !important; }
#profile_main_column table td, #profile_right_column table td { color: #ebdbb2 !important; }

/* ---- Bulk Edit ---- */
#bulk_top_bar, #bulk_edit_box { background: #3c3836 !important; border: 1px solid #504945 !important; color: #ebdbb2 !important; }

/* ---- Save Bookmark Popup ---- */
#popup_header { background: #3c3836 !important; color: #ebdbb2 !important; }
.formtable td { color: #ebdbb2 !important; }
.bookmark_count, .bookmark_count_box { color: #a89984 !important; }
.user_navbar a { color: #83a598 !important; }
.rss_link, .rss_linkbox a { color: #665c54 !important; }

/* ---- Footer & Links ---- */
#footer, .colophon, .colophon a { color: #665c54 !important; }
hr { border-color: #504945 !important; }
a { color: #83a598 !important; }
a:hover { color: #d3869b !important; }
h2 { color: #d3869b !important; }
::selection { background: #665c54 !important; color: #fbf1c7 !important; }`
  },

  // ---- 12. Rose Pine ----
  "rose-pine": {
    name: "Ros\u00e9 Pine",
    desc: "All natural pine, faux fur, and a bit of soho vibes",
    css: `/* Ros\u00e9 Pine Theme */
body#pinboard {
  background: #191724 !important;
  color: #e0def4 !important;
  font-family: "Lora", "Georgia", "Noto Serif", serif !important;
  font-size: 14px !important;
  line-height: 1.65 !important;
}
body#pinboard table, body#pinboard td, body#pinboard th,
body#pinboard p, body#pinboard b, body#pinboard strong,
body#pinboard label, body#pinboard span, body#pinboard li,
body#pinboard dd, body#pinboard dt { color: inherit !important; }

/* Layout foundation */
#banner { max-width: 1030px !important; box-sizing: border-box !important; border-radius: 4px !important; padding: 8px 16px !important; }
#search_query_field { box-sizing: border-box !important; width: 100% !important; }
#tag_cloud { max-width: 100% !important; overflow-wrap: break-word !important; }
.bookmark { display: flex !important; align-items: flex-start !important; }
.star, .selected_star { margin-left: 0 !important; margin-right: 6px !important; float: none !important; flex-shrink: 0 !important; }
.bookmark .display { float: none !important; flex: 1 !important; width: auto !important; min-width: 0 !important; }
.note .note { border: none !important; padding: 0 !important; margin: 0 !important; background: transparent !important; border-radius: 0 !important; }
.service_box .service_box { border: none !important; padding: 0 !important; margin: 0 !important; background: transparent !important; border-radius: 0 !important; width: auto !important; box-sizing: border-box !important; }
#profile_left_column { margin-right: 20px !important; }
#profile_right_column { width: 430px !important; }
body:not(#pinboard) #popup_header { background: transparent !important; }
body:not(#pinboard) { background: #191724 !important; color: #e0def4 !important; font-family: "Lora", "Georgia", "Noto Serif", serif !important; line-height: 1.65 !important; }
body:not(#pinboard) table, body:not(#pinboard) td, body:not(#pinboard) p,
body:not(#pinboard) label, body:not(#pinboard) span { color: inherit !important; }

/* ---- Banner & Navigation ---- */
#banner { background: #1f1d2e !important; border-color: #26233a !important; }
#banner a, #top_menu a, .banner_username { color: #c4a7e7 !important; }
#banner a:hover, #top_menu a:hover { color: #ebbcba !important; }
#pinboard_name a { color: #c4a7e7 !important; font-weight: 700 !important; }
#sub_banner { background: #1f1d2e !important; border-color: #26233a !important; }
#sub_banner a { color: #908caa !important; }
#sub_banner a:hover, #sub_banner a.selected { color: #c4a7e7 !important; }

/* ---- Search ---- */
#searchbox { margin-bottom: 12px !important; }
#search_query_field, #banner_searchbox input[type="text"] {
  background: #26233a !important; color: #e0def4 !important; border: 1px solid #393552 !important; border-radius: 8px !important;
}
#search_query_field:focus, #banner_searchbox input[type="text"]:focus { border-color: #c4a7e7 !important; box-shadow: 0 0 0 2px rgba(196,167,231,0.15) !important; }
.search_button input[type="submit"] {
  background: #c4a7e7 !important; color: #191724 !important;
  border: 1px solid #c4a7e7 !important; cursor: pointer !important; border-radius: 8px !important; font-family: inherit !important;
}
.search_button input[type="submit"]:hover { background: #ebbcba !important; }

/* ---- Main Content ---- */
.bookmark { background: #1f1d2e !important; border-bottom: 1px solid #26233a !important; padding: 14px 16px !important; border-radius: 8px !important; margin-bottom: 8px !important; }
.bookmark:hover { background: #26233a !important; }
a.bookmark_title { color: #e0def4 !important; font-size: 15px !important; text-decoration: none !important; font-style: italic !important; font-weight: 500 !important; }
a.bookmark_title:hover { color: #ebbcba !important; text-decoration: none !important; }
a.url_display { color: #f6c177 !important; font-size: 12px !important; font-family: -apple-system, sans-serif !important; font-style: normal !important; }
a.url_link { color: #f6c177 !important; background: #26233a !important; padding: 1px 6px !important; border-radius: 6px !important; font-family: -apple-system, sans-serif !important; font-style: normal !important; font-size: 11px !important; }
.description { color: #908caa !important; line-height: 1.65 !important; font-style: italic !important; }
.description blockquote { color: #e0def4 !important; border-left: 2px solid #c4a7e7 !important; padding-left: 12px !important; margin: 6px 0 !important; font-style: italic !important; }
a.tag { color: #9ccfd8 !important; text-decoration: none !important; font-size: 12px !important; font-family: -apple-system, sans-serif !important; font-style: normal !important; }
a.tag:hover { color: #c4a7e7 !important; text-decoration: none !important; border-bottom: 1px solid #c4a7e7 !important; }
a.cached { color: #6e6a86 !important; }
a.when { color: #6e6a86 !important; font-size: 11px !important; }
.edit_links a { color: #6e6a86 !important; }
.edit_links a:hover { color: #e0def4 !important; }
a.copy_link { color: #c4a7e7 !important; }
a.delete { color: #eb6f92 !important; }
a.destroy { color: #eb6f92 !important; }
.private { background: #1f1d2e !important; border-left: 3px solid #f6c177 !important; }
a.unread { color: #eb6f92 !important; font-weight: bold !important; }
.star { color: #26233a !important; }
.selected_star { color: #f6c177 !important; }

/* ---- Sidebar ---- */
#right_bar { background: #1f1d2e !important; color: #e0def4 !important; padding: 12px !important; overflow: hidden !important; word-wrap: break-word !important; box-sizing: border-box !important; }
#right_bar h3, #right_bar h4, #right_bar b { color: #ebbcba !important; }
#right_bar a { color: #c4a7e7 !important; }
#right_bar a:hover { color: #ebbcba !important; }
a.bundle { color: #c4a7e7 !important; }
a.bundle:hover { color: #ebbcba !important; }
#tag_cloud a { color: #c4a7e7 !important; }
#tag_cloud a:hover { color: #ebbcba !important; }
#tag_cloud_header a, a.tag_heading_selected { color: #6e6a86 !important; }
#tag_cloud_header a:hover { color: #c4a7e7 !important; }

/* ---- Pagination ---- */
.next_prev, .next_prev_widget a { color: #c4a7e7 !important; }
.next_prev:hover, .next_prev_widget a:hover { color: #ebbcba !important; }
#nextprev a.edit { color: #6e6a86 !important; }

/* ---- Forms ---- */
input[type="text"], input:not([type]), input[type="password"], textarea, select {
  background: #26233a !important; color: #e0def4 !important; border: 1px solid #393552 !important; border-radius: 6px !important;
}
input[type="text"]:focus, input:not([type]):focus, textarea:focus, select:focus { border-color: #c4a7e7 !important; outline: none !important; box-shadow: 0 0 0 2px rgba(196,167,231,0.15) !important; }
input[type="submit"], input[type="button"] {
  background: #c4a7e7 !important; color: #191724 !important;
  border: 1px solid #c4a7e7 !important; cursor: pointer !important; border-radius: 8px !important;
}
input[type="submit"]:hover, input[type="button"]:hover { background: #ebbcba !important; }
#edit_bookmark_form { background: #1f1d2e !important; border: 1px solid #26233a !important; border-radius: 8px !important; }
.suggested_tag { color: #9ccfd8 !important; cursor: pointer !important; }

/* ---- Settings Page ---- */
#settings_panel { background: #1f1d2e !important; }
.settings_tabs { border-color: #26233a !important; }
.settings_tab { color: #908caa !important; padding: 6px 12px !important; border-bottom-color: #26233a !important; }
.settings_tab a { color: inherit !important; text-decoration: none !important; }
.settings_tab:hover { color: #c4a7e7 !important; }
.settings_tab_selected { color: #c4a7e7 !important; border: 1px solid #26233a !important; border-top: 2px solid #c4a7e7 !important; border-bottom-color: #1f1d2e !important; background: #1f1d2e !important; font-weight: bold !important; margin-bottom: -1px !important; }
.settings_tab_selected a { color: #c4a7e7 !important; }
[class*="settings_tab_spacer"] { border-bottom-color: #26233a !important; }
.settings_heading { color: #ebbcba !important; background: transparent !important; border-bottom: 1px solid #26233a !important; padding-bottom: 6px !important; font-style: italic !important; }
a.help { color: #6e6a86 !important; background: #26233a !important; }
.email_secret { color: #c4a7e7 !important; }
#settings_tab_panes { border: none !important; }
#settings_tab_panes table td { color: #e0def4 !important; }
input[type="checkbox"] { accent-color: #c4a7e7 !important; }
input[type="radio"] { accent-color: #c4a7e7 !important; }

/* ---- Notes Page ---- */
.note { border-bottom: 1px solid #26233a !important; }
.note a { color: #c4a7e7 !important; }
#note_right_column { background: #1f1d2e !important; color: #e0def4 !important; padding: 16px !important; border-left: 1px solid #26233a !important; border-radius: 8px !important; }

/* ---- Profile Page ---- */
.service_box { background: #1f1d2e !important; border: 1px solid #26233a !important; border-radius: 8px !important; padding: 16px !important; box-sizing: border-box !important; margin-bottom: 12px !important; }
#profile_main_column h2, #profile_left_column h2, #profile_right_column h2 { color: #ebbcba !important; }
#profile_main_column table td, #profile_right_column table td { color: #e0def4 !important; }

/* ---- Bulk Edit ---- */
#bulk_top_bar, #bulk_edit_box { background: #1f1d2e !important; border: 1px solid #26233a !important; color: #e0def4 !important; }

/* ---- Save Bookmark Popup ---- */
#popup_header { background: #1f1d2e !important; color: #e0def4 !important; }
.formtable td { color: #e0def4 !important; }
.bookmark_count, .bookmark_count_box { color: #908caa !important; }
.user_navbar a { color: #c4a7e7 !important; }
.rss_link, .rss_linkbox a { color: #6e6a86 !important; }

/* ---- Footer & Links ---- */
#footer, .colophon, .colophon a { color: #6e6a86 !important; }
hr { border-color: #26233a !important; }
a { color: #c4a7e7 !important; }
a:hover { color: #ebbcba !important; }
h2 { color: #ebbcba !important; }
::selection { background: #3e3a5e !important; color: #e0def4 !important; }`
  },

  // ---- 13. GitHub Light ----
  "github-light": {
    name: "GitHub Light",
    desc: "Clean light theme inspired by GitHub's interface",
    css: `/* GitHub Light Theme */
body#pinboard {
  background: #f6f8fa !important;
  color: #1f2328 !important;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif !important;
}
body#pinboard table, body#pinboard td, body#pinboard th,
body#pinboard p, body#pinboard b, body#pinboard strong,
body#pinboard label, body#pinboard span, body#pinboard li,
body#pinboard dd, body#pinboard dt { color: inherit !important; }

/* Layout foundation */
#banner { max-width: 1030px !important; box-sizing: border-box !important; border-radius: 4px !important; padding: 8px 16px !important; }
#search_query_field { box-sizing: border-box !important; width: 100% !important; }
#tag_cloud { max-width: 100% !important; overflow-wrap: break-word !important; }
.bookmark { display: flex !important; align-items: flex-start !important; }
.star, .selected_star { margin-left: 0 !important; margin-right: 6px !important; float: none !important; flex-shrink: 0 !important; }
.bookmark .display { float: none !important; flex: 1 !important; width: auto !important; min-width: 0 !important; }
.note .note { border: none !important; padding: 0 !important; margin: 0 !important; background: transparent !important; border-radius: 0 !important; }
.service_box .service_box { border: none !important; padding: 0 !important; margin: 0 !important; background: transparent !important; border-radius: 0 !important; width: auto !important; box-sizing: border-box !important; }
#profile_left_column { margin-right: 20px !important; }
#profile_right_column { width: 430px !important; }
body:not(#pinboard) #popup_header { background: transparent !important; }
body:not(#pinboard) { background: #f6f8fa !important; color: #1f2328 !important; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif !important; }
body:not(#pinboard) table, body:not(#pinboard) td, body:not(#pinboard) p,
body:not(#pinboard) label, body:not(#pinboard) span { color: inherit !important; }

/* ---- Banner & Navigation ---- */
#banner { background: #ffffff !important; border-color: #d0d7de !important; }
#banner a, #top_menu a, .banner_username { color: #0969da !important; }
#banner a:hover, #top_menu a:hover { color: #0550ae !important; }
#pinboard_name a { color: #0969da !important; font-weight: 700 !important; }
#sub_banner { background: #ffffff !important; border-color: #d0d7de !important; }
#sub_banner a { color: #656d76 !important; }
#sub_banner a:hover, #sub_banner a.selected { color: #0969da !important; }

/* ---- Search ---- */
#searchbox { margin-bottom: 12px !important; }
#search_query_field, #banner_searchbox input[type="text"] {
  background: #ffffff !important; color: #1f2328 !important; border: 1px solid #d0d7de !important;
}
#search_query_field:focus, #banner_searchbox input[type="text"]:focus { border-color: #0969da !important; }
.search_button input[type="submit"] {
  background: #0969da !important; color: #ffffff !important;
  border: 1px solid #0969da !important; cursor: pointer !important;
}
.search_button input[type="submit"]:hover { background: #0550ae !important; }

/* ---- Main Content ---- */
.bookmark { background: #ffffff !important; border: 1px solid #d0d7de !important; padding: 12px 16px !important; border-radius: 6px !important; margin-bottom: 6px !important; }
.bookmark:hover { border-color: #0969da40 !important; }
a.bookmark_title { color: #0969da !important; font-size: 15px !important; text-decoration: none !important; font-weight: 600 !important; }
a.bookmark_title:hover { color: #0550ae !important; text-decoration: underline !important; }
a.url_display { color: #57606a !important; font-size: 12px !important; }
a.url_link { color: #bf8700 !important; background: #fff8c5 !important; padding: 1px 6px !important; border-radius: 12px !important; font-size: 11px !important; }
.description { color: #1f2328 !important; opacity: 0.85 !important; line-height: 1.5 !important; }
.description blockquote { color: #656d76 !important; border-left: 3px solid #0969da40 !important; padding-left: 10px !important; margin: 4px 0 !important; }
a.tag { color: #0550ae !important; text-decoration: none !important; font-size: 11px !important; background: #ddf4ff !important; padding: 1px 8px !important; border-radius: 12px !important; }
a.tag:hover { color: #ffffff !important; background: #0969da !important; text-decoration: none !important; }
a.cached { color: #8c959f !important; }
a.when { color: #8c959f !important; font-size: 11px !important; }
.edit_links a { color: #8c959f !important; }
.edit_links a:hover { color: #1f2328 !important; }
a.copy_link { color: #0969da !important; }
a.delete { color: #cf222e !important; }
a.destroy { color: #cf222e !important; }
.private { background: #ffffff !important; border-left: 3px solid #bf8700 !important; }
a.unread { color: #cf222e !important; font-weight: bold !important; }
.star { color: #d0d7de !important; }
.selected_star { color: #bf8700 !important; }

/* ---- Sidebar ---- */
#right_bar { background: #ffffff !important; color: #1f2328 !important; padding: 12px !important; overflow: hidden !important; word-wrap: break-word !important; box-sizing: border-box !important; }
#right_bar h3, #right_bar h4, #right_bar b { color: #656d76 !important; }
#right_bar a { color: #0969da !important; }
#right_bar a:hover { color: #0550ae !important; }
a.bundle { color: #0969da !important; }
a.bundle:hover { color: #0550ae !important; }
#tag_cloud a { color: #0969da !important; }
#tag_cloud a:hover { color: #0550ae !important; }
#tag_cloud_header a, a.tag_heading_selected { color: #8c959f !important; }
#tag_cloud_header a:hover { color: #0969da !important; }

/* ---- Pagination ---- */
.next_prev, .next_prev_widget a { color: #0969da !important; }
.next_prev:hover, .next_prev_widget a:hover { color: #0550ae !important; }
#nextprev a.edit { color: #8c959f !important; }

/* ---- Forms ---- */
input[type="text"], input:not([type]), input[type="password"], textarea, select {
  background: #ffffff !important; color: #1f2328 !important; border: 1px solid #d0d7de !important;
}
input[type="text"]:focus, input:not([type]):focus, textarea:focus, select:focus { border-color: #0969da !important; outline: none !important; }
input[type="submit"], input[type="button"] {
  background: #0969da !important; color: #ffffff !important;
  border: 1px solid #0969da !important; cursor: pointer !important;
}
input[type="submit"]:hover, input[type="button"]:hover { background: #0550ae !important; }
#edit_bookmark_form { background: #ffffff !important; border: 1px solid #d0d7de !important; }
.suggested_tag { color: #1a7f37 !important; cursor: pointer !important; }

/* ---- Settings Page ---- */
#settings_panel { background: #ffffff !important; }
.settings_tabs { border-color: #d0d7de !important; }
.settings_tab { color: #656d76 !important; padding: 6px 12px !important; border-bottom-color: #d0d7de !important; }
.settings_tab a { color: inherit !important; text-decoration: none !important; }
.settings_tab:hover { color: #0969da !important; }
.settings_tab_selected { color: #0969da !important; border: 1px solid #d0d7de !important; border-top: 2px solid #0969da !important; border-bottom-color: #ffffff !important; background: #ffffff !important; font-weight: bold !important; margin-bottom: -1px !important; }
.settings_tab_selected a { color: #0969da !important; }
[class*="settings_tab_spacer"] { border-bottom-color: #d0d7de !important; }
.settings_heading { color: #656d76 !important; background: transparent !important; border-bottom: 1px solid #d0d7de !important; padding-bottom: 6px !important; }
a.help { color: #8c959f !important; background: #e8ecf0 !important; }
.email_secret { color: #0969da !important; }
#settings_tab_panes { border: none !important; }
#settings_tab_panes table td { color: #1f2328 !important; }
input[type="checkbox"] { accent-color: #0969da !important; }
input[type="radio"] { accent-color: #0969da !important; }

/* ---- Notes Page ---- */
.note { border-bottom: 1px solid #d0d7de !important; }
.note a { color: #0969da !important; }
#note_right_column { background: #ffffff !important; color: #1f2328 !important; padding: 16px !important; border-left: 1px solid #d0d7de !important; }

/* ---- Profile Page ---- */
.service_box { background: #ffffff !important; border: 1px solid #d0d7de !important; border-radius: 6px !important; padding: 16px !important; box-sizing: border-box !important; margin-bottom: 12px !important; }
#profile_main_column h2, #profile_left_column h2, #profile_right_column h2 { color: #656d76 !important; }
#profile_main_column table td, #profile_right_column table td { color: #1f2328 !important; }

/* ---- Bulk Edit ---- */
#bulk_top_bar, #bulk_edit_box { background: #ffffff !important; border: 1px solid #d0d7de !important; color: #1f2328 !important; }

/* ---- Save Bookmark Popup ---- */
#popup_header { background: #ffffff !important; color: #1f2328 !important; }
.formtable td { color: #1f2328 !important; }
.bookmark_count, .bookmark_count_box { color: #656d76 !important; }
.user_navbar a { color: #0969da !important; }
.rss_link, .rss_linkbox a { color: #8c959f !important; }

/* ---- Footer & Links ---- */
#footer, .colophon, .colophon a { color: #8c959f !important; }
a { color: #0969da !important; }
a:hover { color: #0550ae !important; }
h2 { color: #656d76 !important; }
::selection { background: #ddf4ff !important; }`
  }

};
