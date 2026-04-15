// Composer: classic-list
// Canonical Pinboard-shape layout — left-aligned list, no cards, right_bar visible.
// Mirrors the visual density of every shipped theme (v2.25).
// tokens.layout.mode must equal "classic-list".

import { baseLayer } from "./_base.mjs";
import { v } from "./_util.mjs";

export function compose(tokens) {
  return baseLayer(tokens) + emit(tokens);
}

function emit(tokens) {
  const rightBar = tokens.layout && tokens.layout["right-bar"];
  const maxWidth = tokens.layout && tokens.layout["max-width"];

  return `
/* === composer: classic-list === */

html, body {
  background: ${v("bg")};
  color: ${v("fg")};
  font-family: ${v("font-family")};
  font-size: ${v("font-size-base")};
  line-height: ${v("line-height")};
}

a, a:link {
  color: ${v("accent")};
  text-decoration: none;
}
a:hover { color: ${v("link-hover")}; text-decoration: underline; }
a:visited { color: ${v("link-visited")}; }
a:focus-visible { outline: 2px solid ${v("focus-ring")}; outline-offset: 2px; border-radius: ${v("radius-sm")}; }

/* banner */
#banner { background: ${v("bg")}; color: ${v("fg")}; border-bottom: ${v("border-width")} ${v("border-style")} ${v("border")}; }
#banner a { color: ${v("accent")}; }
#top_menu a { color: ${v("fg")}; }
#top_menu a:hover { color: ${v("accent")}; }

#banner_searchbox input,
#tweet_searchbox input[type="text"] {
  background: ${v("input-bg")};
  color: ${v("fg")};
  border: ${v("border-width")} ${v("border-style")} ${v("border")};
  border-radius: ${v("radius-sm")};
  padding: calc(${v("space-unit")} * 1);
}
#banner_searchbox input:focus-visible,
#tweet_searchbox input[type="text"]:focus-visible {
  outline: none;
  border-color: ${v("accent")};
  box-shadow: 0 0 0 3px ${v("accent-alpha")};
}

/* sub_banner */
#sub_banner {
  padding: ${v("space-sub-banner-y")} 0;
  color: ${v("muted")};
  border-bottom: ${v("border-width")} ${v("border-style")} ${v("border")};
}
#sub_banner a { color: ${v("accent")}; }

/* main column */
#main_column {
  background: ${v("bg")};
  color: ${v("fg")};
  padding: ${v("space-main-padding")};
  ${maxWidth && maxWidth !== "none" ? `max-width: ${maxWidth};` : ""}
}

/* bookmark row */
#main_column .bookmark {
  background: transparent;
  color: ${v("fg")};
  padding: calc(${v("space-bookmark-gap")} / 2) 0;
  border-radius: ${v("radius-md")};
}
#main_column .bookmark { transition: background 0.2s ease; }
#main_column .bookmark:hover { background: ${v("row-hover")}; }

#main_column .bookmark a.bookmark_title {
  color: ${v("accent")};
  font-weight: ${v("weight-heading")};
  font-size: ${v("font-size-base")};
}
#main_column .bookmark a.bookmark_title:hover { color: ${v("link-hover")}; }

#main_column .bookmark .description,
#main_column .bookmark .bookmark_description {
  color: ${v("fg")};
  font-size: ${v("font-size-sm")};
}

#main_column .bookmark .tags a {
  color: ${v("accent")};
  background: ${v("tag-bg")};
  padding: 1px 6px;
  border-radius: ${v("radius-sm")};
  margin-right: 4px;
}

#main_column .bookmark .when,
#main_column .bookmark .display {
  color: ${v("muted")};
  font-size: ${v("font-size-xs")};
}

/* right_bar */
#right_bar {
  ${rightBar === "hidden" ? "display: none !important;" : ""}
  background: ${v("bg")};
  color: ${v("fg")};
  border-left: ${v("border-width")} ${v("border-style")} ${v("border")};
  padding: ${v("space-right-bar-gap")};
}
#right_bar h1, #right_bar h2, #right_bar h3, #right_bar h4 {
  color: ${v("fg")};
  font-weight: ${v("weight-heading")};
}
#right_bar a { color: ${v("accent")}; }
#right_bar table { width: 100%; border-collapse: collapse; }
#right_bar .delete,
#main_column .bookmark .delete {
  color: ${v("destroy")};
}

/* forms */
#main_column form input[type="text"],
#main_column form input[type="url"],
#main_column form input[type="email"],
#main_column form input[type="password"],
#main_column form input[type="search"],
#main_column form textarea,
#main_column form select {
  background: ${v("input-bg")};
  color: ${v("fg")};
  border: ${v("border-width")} ${v("border-style")} ${v("border")};
  border-radius: ${v("radius-sm")};
  padding: calc(${v("space-unit")} * 1.5);
  font-family: inherit;
  font-size: ${v("font-size-base")};
}
#main_column form input:focus-visible,
#main_column form textarea:focus-visible,
#main_column form select:focus-visible {
  outline: none;
  border-color: ${v("accent")};
  box-shadow: 0 0 0 3px ${v("accent-alpha")};
}
#main_column form ::placeholder { color: ${v("muted")}; opacity: 1; }

#main_column form input[type="submit"],
#main_column form button {
  background: ${v("btn-bg")};
  color: ${v("btn-fg")};
  border: ${v("border-width")} ${v("border-style")} ${v("border")};
  border-radius: ${v("radius-sm")};
  padding: calc(${v("space-unit")} * 1.25) calc(${v("space-unit")} * 3);
  cursor: pointer;
  font-weight: ${v("weight-body")};
}
#main_column form input[type="submit"]:hover,
#main_column form button:hover { background: ${v("accent")}; color: ${v("btn-fg")}; }

/* tables */
#main_column table { border-collapse: collapse; }
#main_column table th { color: ${v("fg")}; border-bottom: ${v("border-width")} ${v("border-style")} ${v("border")}; }
#main_column table td { color: ${v("fg")}; }

/* footer */
#footer, .footer { color: ${v("muted")}; border-top: ${v("border-width")} ${v("border-style")} ${v("border")}; }
`;
}
