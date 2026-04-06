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
a.help { color: #9aa0a6 !important; text-decoration: none !important; }
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
a.help { color: #4c566a !important; }
.email_secret { color: #88c0d0 !important; }
#settings_tab_panes { border: none !important; }
#settings_tab_panes table td { color: #d8dee9 !important; }
input[type="checkbox"] { accent-color: #88c0d0 !important; }
input[type="radio"] { accent-color: #88c0d0 !important; }

/* ---- Notes Page ---- */
.note { border-bottom: 1px solid #434c5e !important; }
.note a { color: #88c0d0 !important; }
#note_right_column { background: #3b4252 !important; color: #d8dee9 !important; }

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
a.help { color: #336633 !important; }
.email_secret { color: #00cccc !important; }
#settings_tab_panes { border: none !important; }
#settings_tab_panes table td { color: #33ff33 !important; }
input[type="checkbox"] { accent-color: #33ff33 !important; }
input[type="radio"] { accent-color: #33ff33 !important; }

/* ---- Notes Page ---- */
.note { border-bottom: 1px dashed #33ff3325 !important; }
.note a { color: #33ff33 !important; }
#note_right_column { background: #0a0a0a !important; color: #22aa22 !important; }

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
a.help { color: #aaa !important; }
.email_secret { color: #1a3a5c !important; }
#settings_tab_panes { border: none !important; }
#settings_tab_panes table td { color: #2c2c2c !important; }

/* ---- Notes Page ---- */
.note { border-bottom: 1px solid #e8dfd0 !important; }
.note a { color: #1a3a5c !important; }
#note_right_column { background: #f5f0e8 !important; }

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
a.help { color: #6272a4 !important; }
.email_secret { color: #8be9fd !important; }
#settings_tab_panes { border: none !important; }
#settings_tab_panes table td { color: #f8f8f2 !important; }
input[type="checkbox"] { accent-color: #bd93f9 !important; }
input[type="radio"] { accent-color: #bd93f9 !important; }

/* ---- Notes Page ---- */
.note { border-bottom: 1px solid #44475a !important; }
.note a { color: #8be9fd !important; }
#note_right_column { background: #21222c !important; color: #f8f8f2 !important; }

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
a { color: #bd93f9 !important; }
a:hover { color: #ff79c6 !important; }
h2 { color: #bd93f9 !important; }
::selection { background: #44475a !important; }`
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
a.help { color: #B7B5AC !important; }
.email_secret { color: #205EA6 !important; }
#settings_tab_panes { border: none !important; }
#settings_tab_panes table td { color: #100F0F !important; }

/* Notes */
.note { border-bottom: 1px solid #E6E4D9 !important; }
.note a { color: #205EA6 !important; }
#note_right_column { background: #F2F0E5 !important; }

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
html.pbp-dark a.help { color: #575653 !important; }
html.pbp-dark .email_secret { color: #4385BE !important; }
html.pbp-dark #settings_tab_panes { border: none !important; }
html.pbp-dark #settings_tab_panes table td { color: #CECDC3 !important; }

/* Notes (dark) */
html.pbp-dark .note { border-bottom-color: #343331 !important; }
html.pbp-dark .note a { color: #4385BE !important; }
html.pbp-dark #note_right_column { background: #282726 !important; color: #CECDC3 !important; }

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
html.pbp-dark a { color: #4385BE !important; }
html.pbp-dark a:hover { color: #5DA0D0 !important; }
html.pbp-dark h2 { color: #8B7EC8 !important; }`
  }

};
