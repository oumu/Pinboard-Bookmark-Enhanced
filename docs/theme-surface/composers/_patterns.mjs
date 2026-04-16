// Composer add-on: patterns
//
// Emits stylistic/personality CSS based on tokens.patterns. This is the
// "interface" layer that lets tokens drive decisions beyond color/font/space
// — things like "prepend '#' before every tag" or "show private bookmarks
// with a left-border instead of a tinted background".
//
// Contract:
//   patternsLayer(tokens) -> css string (possibly empty)
//
// Output is concatenated AFTER classic-list-v2's main output but BEFORE any
// hand-authored tokens.overrides.css, so:
//   composer defaults  <  patterns  <  overrides (escape hatch)
//
// Each pattern emits `!important` rules scoped to the same selectors the main
// composer uses, ensuring predictable cascade order.

import { v } from "./_util.mjs";

export function patternsLayer(tokens) {
  const pat = tokens.patterns || {};
  const sizeXs = tokens.typo?.["size-xs"] || tokens.typo?.["size-sm"] || "12px";
  const out = [];

  // ---- P0: tag-style ----
  const tagStyle = pat["tag-style"];
  if (tagStyle === "hash-prefix") {
    out.push(`a.tag::before { content: "#" !important; }`);
  } else if (tagStyle === "bracketed") {
    out.push(
      `a.tag::before { content: "[" !important; opacity: 0.6 !important; }`,
      `a.tag::after  { content: "]" !important; opacity: 0.6 !important; }`
    );
  } else if (tagStyle === "pill") {
    // Fully rounded chip; override composer's radius-lg with a pill shape.
    out.push(
      `a.tag { border-radius: 9999px !important; padding: 2px 10px !important; }`
    );
  }
  // "plain" or missing → composer default

  // ---- P0: bookmark-title-prefix ----
  const titlePrefix = pat["bookmark-title-prefix"];
  if (typeof titlePrefix === "string" && titlePrefix.length > 0) {
    const escaped = escapeCssContent(titlePrefix);
    out.push(
      `a.bookmark_title::before { content: "${escaped}" !important; color: ${v("muted-soft")} !important; }`
    );
  }

  // ---- P0: heading-prefix ----
  const headingPrefix = pat["heading-prefix"];
  if (typeof headingPrefix === "string" && headingPrefix.length > 0) {
    const escaped = escapeCssContent(headingPrefix);
    out.push(
      `.settings_heading::before { content: "${escaped}" !important; opacity: 0.7 !important; }`
    );
  }

  // ---- P1: url-link-style ----
  const urlStyle = pat["url-link-style"];
  if (urlStyle === "pill") {
    out.push(
      `a.url_link { border-radius: 9999px !important; padding: 1px 10px !important; }`
    );
  } else if (urlStyle === "underline") {
    out.push(
      `a.url_link { background: transparent !important; padding: 0 !important; border-radius: 0 !important; text-decoration: underline !important; color: ${v("muted-soft")} !important; }`
    );
  } else if (urlStyle === "plain") {
    out.push(
      `a.url_link { background: transparent !important; padding: 0 !important; border-radius: 0 !important; color: ${v("muted-soft")} !important; font-size: ${sizeXs} !important; }`
    );
  }
  // "capsule" or missing → composer default

  // ---- P1: private-badge ----
  const privBadge = pat["private-badge"];
  if (privBadge === "border-left" || privBadge === "inset-bar") {
    // Default composer rule already emits box-shadow: inset + background.
    // border-left is deprecated (conflicts with hover-effect left-bar, ugly in dark).
    // "inset-bar" is the successor — same visual as default, kept for explicitness.
  } else if (privBadge === "dashed") {
    out.push(
      `.private { background: transparent !important; outline: 1px dashed ${v("private-accent")} !important; outline-offset: -2px !important; }`
    );
  } else if (privBadge === "stripe") {
    out.push(
      `.private { background: repeating-linear-gradient(135deg, ${v("private-bg")}, ${v("private-bg")} 6px, ${v("bg-surface")} 6px, ${v("bg-surface")} 12px) !important; }`
    );
  }
  // "tint-bg" or missing → composer default (`.private { background: private-bg }`)

  // ---- P1: focus-ring ----
  const ring = pat["focus-ring"];
  if (ring === "glow") {
    // 2px solid ring — matches shipped convention (every theme uses this).
    // Individual alpha strength controlled by each theme's accent-alpha token.
    out.push(
      `#search_query_field:focus, #banner_searchbox input[type="text"]:focus, #right_bar input#key:focus, #tweet_searchbox #search_query_field:focus {`,
      `  box-shadow: 0 0 0 2px ${v("accent-alpha")} !important;`,
      `  outline: none !important;`,
      `}`
    );
  } else if (ring === "dashed") {
    out.push(
      `input:focus, textarea:focus, select:focus { outline: 2px dashed ${v("accent")} !important; outline-offset: 2px !important; box-shadow: none !important; }`
    );
  } else if (ring === "none") {
    out.push(
      `input:focus, textarea:focus, select:focus { outline: none !important; box-shadow: none !important; }`
    );
  }
  // "thin-solid" or missing → composer default

  // ---- P2: shape ----
  // Rewrites the radius custom properties at :root so every composer rule that
  // references var(--pinboard-radius-*) gets the macro value.
  const shape = pat["shape"];
  if (shape === "sharp") {
    out.push(
      `:root { --pinboard-radius-sm: 0 !important; --pinboard-radius-md: 0 !important; --pinboard-radius-lg: 0 !important; }`
    );
  } else if (shape === "pill") {
    out.push(
      `:root { --pinboard-radius-sm: 9999px !important; --pinboard-radius-md: 9999px !important; --pinboard-radius-lg: 9999px !important; }`
    );
  }
  // "rounded" → uses whatever radius.* tokens the theme already declared

  // ---- P2: density ----
  const density = pat["density"];
  if (density === "compact") {
    out.push(
      `:root { --pinboard-space-bookmark-gap: 2px !important; --pinboard-space-right-bar-gap: 8px !important; }`,
      `.bookmark { padding: 4px 8px !important; }`
    );
  } else if (density === "roomy") {
    out.push(
      `:root { --pinboard-space-bookmark-gap: 16px !important; --pinboard-space-right-bar-gap: 20px !important; }`,
      `.bookmark { padding: 16px 20px !important; }`
    );
  }
  // "default" or missing → composer baseline

  // ---- P2: hover-effect ----
  const hover = pat["hover-effect"];
  if (hover === "underline") {
    out.push(
      `.bookmark { transition: none !important; }`,
      `.bookmark:hover { background: transparent !important; }`,
      `.bookmark:hover a.bookmark_title { text-decoration: underline !important; }`
    );
  } else if (hover === "lift") {
    out.push(
      `.bookmark { transition: transform 0.15s ease, box-shadow 0.15s ease !important; }`,
      `.bookmark:hover { transform: translateY(-1px) !important; box-shadow: 0 2px 8px ${v("accent-alpha")} !important; }`
    );
  } else if (hover === "color-shift") {
    out.push(
      `.bookmark { transition: color 0.15s ease !important; }`,
      `.bookmark:hover { background: transparent !important; color: ${v("accent")} !important; }`,
      `.bookmark:hover a.bookmark_title { color: ${v("link-hover")} !important; }`
    );
  } else if (hover === "fade-bg") {
    out.push(
      `.bookmark { transition: background 0.2s ease !important; }`,
      `.bookmark:hover { background: ${v("row-hover")} !important; }`
    );
  } else if (hover === "left-bar") {
    // Reading-focused themes: accent-colored left border on hover, no background change.
    // Zero reading disruption — ideal for paper/ink and editorial aesthetics.
    out.push(
      `.bookmark { border-left: 3px solid transparent !important; padding-left: 5px !important; transition: border-left-color 0.15s ease !important; }`,
      `.bookmark:hover { background: transparent !important; border-left-color: ${v("accent")} !important; }`
    );
  }

  // ---- P3: row-divider ----
  // Emits the border treatment on .bookmark rows. Composer's base leaves row
  // borders unspecified (shipped themes uniformly override), so this pattern
  // absorbs that repeated work. Padding is NOT touched here — that stays
  // under density control so the two axes remain independent.
  const divider = pat["row-divider"];
  if (divider === "hairline") {
    out.push(
      `.bookmark { border-bottom: 1px solid ${v("border")} !important; }`
    );
  } else if (divider === "dashed") {
    out.push(
      `.bookmark { border-bottom: 1px dashed ${v("border")} !important; }`
    );
  } else if (divider === "left-accent") {
    const w = tokens.ext?.["row-accent-width"] || "3px";
    out.push(
      `.bookmark { border-left: ${w} solid ${v("border")} !important; border-bottom: none !important; border-top: none !important; border-right: none !important; }`
    );
  } else if (divider === "none") {
    out.push(
      `.bookmark { border: none !important; }`
    );
  }

  // ---- P3: heading-accent ----
  // Layered ON TOP of composer's default .settings_heading (color + solid
  // border-bottom + padding-bottom). Only emits the *delta*, so composer
  // baseline stays intact for themes that opt out.
  const headAccent = pat["heading-accent"];
  if (headAccent === "caps") {
    out.push(
      `.settings_heading { text-transform: uppercase !important; font-size: 12px !important; letter-spacing: 0.08em !important; }`
    );
  } else if (headAccent === "dashed-underline") {
    out.push(
      `.settings_heading { border-bottom-style: dashed !important; }`
    );
  }
  // "plain" or missing → composer default

  // ---- P3: card-shadow ----
  // Drop shadow on .bookmark rows. Meant for themes whose rows read as cards
  // (background + rounded corners) — apply alongside row-divider:"none" for
  // the intended look. Applied unconditionally: opt-in via tokens.patterns.
  const cardShadow = pat["card-shadow"];
  if (cardShadow === "soft") {
    out.push(
      `.bookmark { box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05) !important; transition: box-shadow 0.2s !important; }`,
      `.bookmark:hover { box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08) !important; }`
    );
  } else if (cardShadow === "strong") {
    out.push(
      `.bookmark { box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15) !important; transition: box-shadow 0.2s !important; }`,
      `.bookmark:hover { box-shadow: 0 4px 12px rgba(0, 0, 0, 0.22) !important; }`
    );
  }

  // ---- P4: blockquote-style ----
  // 11/13 themes add a left border + padding to `.description blockquote`.
  // Width tunable via `ext.blockquote-border-width` (default 3px).
  // left-accent → uses `accent` (high-signal themes like dracula, catppuccin,
  // solarized, terminal). left-muted → uses `border` (subtle themes like
  // flexoki dark, nord-night, github-light).
  const blockquote = pat["blockquote-style"];
  if (blockquote === "left-accent" || blockquote === "left-muted") {
    const w = tokens.ext?.["blockquote-border-width"] || "3px";
    const color = blockquote === "left-accent" ? v("accent") : v("border");
    out.push(
      `.description blockquote { border-left: ${w} solid ${color} !important; padding-left: 12px !important; margin: 6px 0 !important; }`
    );
  }
  // "plain" or missing → composer default

  // ---- P4: banner-chrome ----
  // 10/13 themes apply `border-radius + padding` to #banner with a recurring
  // `padding: 8px 16px`. Radius tunable via `ext.banner-radius` (default 4px).
  // "card" adds bg-surface + bottom border + soft shadow (modern-card style).
  const bannerChrome = pat["banner-chrome"];
  if (bannerChrome === "rounded") {
    const r = tokens.ext?.["banner-radius"] || "4px";
    out.push(
      `#banner { border-radius: ${r} !important; padding: 8px 16px !important; }`
    );
  } else if (bannerChrome === "card") {
    const r = tokens.ext?.["banner-radius"] || "8px";
    out.push(
      `#banner { border-radius: ${r} !important; padding: 12px 20px !important; background: ${v("bg-surface")} !important; border-bottom: 1px solid ${v("border")} !important; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06) !important; }`
    );
  }
  // "plain" or missing → composer default

  // ---- P4: title-weight ----
  // 7/13 themes explicitly set `a.bookmark_title` weight (normal/500/600).
  // Exposes the whole scale for full control. Baseline composer uses
  // `typo.weight-heading`; this pattern overrides it for the title surface
  // specifically so tags/headings can keep their own weights.
  const titleWeight = pat["title-weight"];
  const weightMap = { normal: 400, medium: 500, semibold: 600, bold: 700 };
  if (titleWeight && titleWeight in weightMap) {
    out.push(
      `a.bookmark_title { font-weight: ${weightMap[titleWeight]} !important; }`
    );
  }

  // ---- P4: tag-size ----
  // 4/13 themes reduce `a.tag` font-size to 12px. Uses typo.size-xs when
  // available; falls back to literal 12px to preserve shipped behavior.
  const tagSize = pat["tag-size"];
  if (tagSize === "small") {
    const size = tokens.typo?.["size-xs"] || "12px";
    out.push(
      `a.tag { font-size: ${size} !important; }`
    );
  }
  // "default" or missing → composer baseline

  // ---- P5: button-style ----
  // Every theme customizes `input[type="submit"]` and/or `input[type="button"]`:
  // most strip the native border, some round corners, a few go pill. Radius
  // tunable via `ext.button-radius` (default 4px). Color/bg stay driven by
  // composer tokens (accent / accent-fg) — this pattern only shapes the chrome.
  const buttonStyle = pat["button-style"];
  if (buttonStyle === "flat") {
    out.push(
      `input[type="submit"], input[type="button"], .search_button input[type="submit"] { border: none !important; }`
    );
  } else if (buttonStyle === "outlined") {
    out.push(
      `input[type="submit"], input[type="button"], .search_button input[type="submit"] { background: transparent !important; border: 1px solid ${v("border")} !important; color: ${v("accent")} !important; }`
    );
  } else if (buttonStyle === "rounded") {
    // Radius-only (keeps composer's border intact). Themes that also want
    // border: none should use "flat-rounded".
    const r = tokens.ext?.["button-radius"] || "4px";
    out.push(
      `input[type="submit"], input[type="button"], .search_button input[type="submit"] { border-radius: ${r} !important; }`
    );
  } else if (buttonStyle === "flat-rounded") {
    const r = tokens.ext?.["button-radius"] || "4px";
    out.push(
      `input[type="submit"], input[type="button"], .search_button input[type="submit"] { border: none !important; border-radius: ${r} !important; }`
    );
  } else if (buttonStyle === "pill") {
    out.push(
      `input[type="submit"], input[type="button"], .search_button input[type="submit"] { border: none !important; border-radius: 9999px !important; padding: 4px 14px !important; }`
    );
  }
  // "default" or missing → composer baseline

  // ---- P5: footer-tone ----
  // 13/13 themes set `#footer` (and usually `.colophon` / `.colophon a` /
  // `.rss_link`) to a muted color. Centralizes that ~5-line repeat per theme.
  const footerTone = pat["footer-tone"];
  if (footerTone === "muted" || footerTone === "faint") {
    const opacity = footerTone === "faint" ? " opacity: 0.75 !important;" : "";
    out.push(
      `#footer, .colophon, .colophon a, .rss_link, .rss_linkbox a { color: ${v("muted-soft")} !important;${opacity} }`
    );
  }
  // "default" or missing → composer baseline

  // ---- P5: edit-form-surface ----
  // `#edit_bookmark_form`, `#bulk_top_bar`, `#bulk_edit_box` are the three
  // "heavyweight panel" surfaces. Every theme gives them a bg+border; 2 themes
  // round corners to 12px. Radius tunable via `ext.edit-form-radius`.
  //   "panel" → bg-surface + 1px border (most themes)
  //   "card"  → panel + radius (soft-themes: modern-card, paper-ink)
  const editForm = pat["edit-form-surface"];
  if (editForm === "panel" || editForm === "card") {
    const radiusRule = editForm === "card"
      ? ` border-radius: ${tokens.ext?.["edit-form-radius"] || "12px"} !important;`
      : "";
    out.push(
      `#edit_bookmark_form, #bulk_top_bar, #bulk_edit_box { background: ${v("bg-surface")} !important; border: 1px solid ${v("border")} !important;${radiusRule} }`
    );
  }
  // "default" or missing → composer baseline

  // ---- P5: sort-order-style ----
  // 13/13 themes style `a.sort_order_selected` — the "active sort" chip in
  // bookmark-sort tables. Bg is always a subtle tint of accent or bg-surface;
  // 6/13 additionally set color to accent for extra signal.
  //   "tinted"    → bg: accent-alpha (subtle), color inherits
  //   "accent-bg" → bg: accent-alpha, color: accent (high contrast)
  //   "surface"   → bg: bg-surface (neutral, for low-contrast themes)
  const sortOrder = pat["sort-order-style"];
  if (sortOrder === "tinted") {
    out.push(
      `a.sort_order_selected { background: ${v("accent-alpha")} !important; }`
    );
  } else if (sortOrder === "accent-bg") {
    out.push(
      `a.sort_order_selected { background: ${v("accent-alpha")} !important; color: ${v("accent")} !important; }`
    );
  } else if (sortOrder === "surface") {
    out.push(
      `a.sort_order_selected { background: ${v("bg-surface")} !important; }`
    );
  }
  // "default" or missing → composer baseline

  // ---- P6: searchbox-style ----
  // Unifies chrome across the four search inputs every theme customizes:
  // `#search_query_field` (main column), `#banner_searchbox input[type="text"]`
  // (when shown), `#right_bar input#key` (right bar filter), and
  // `#tweet_searchbox #search_query_field` (tweet search). 13/13 themes ship
  // repeated border + radius + color + focus-ring decls for these; this
  // pattern centralizes them.
  //   "boxed"          → 1px border + ext.searchbox-radius (default 4px)
  //                      + bg-surface + text color + focus halo (accent-alpha)
  //   "outlined-accent"→ boxed + focus also shifts border-color to accent
  //   "minimal"        → no border + transparent bg (flat)
  const searchbox = pat["searchbox-style"];
  if (searchbox === "boxed" || searchbox === "outlined-accent") {
    const r = tokens.ext?.["searchbox-radius"] || "4px";
    const sel = `#search_query_field, #banner_searchbox input[type="text"], #right_bar input#key, #tweet_searchbox #search_query_field`;
    out.push(
      `${sel} { background: ${v("bg-surface")} !important; color: ${v("text")} !important; border: 1px solid ${v("border")} !important; border-radius: ${r} !important; }`
    );
    if (searchbox === "outlined-accent") {
      out.push(
        `${sel.split(", ").map(s => `${s}:focus`).join(", ")} { border-color: ${v("accent")} !important; box-shadow: 0 0 0 2px ${v("accent-alpha")} !important; outline: none !important; }`
      );
    }
  } else if (searchbox === "minimal") {
    const sel = `#search_query_field, #banner_searchbox input[type="text"], #right_bar input#key, #tweet_searchbox #search_query_field`;
    out.push(
      `${sel} { background: transparent !important; border: none !important; border-radius: 0 !important; }`
    );
  }
  // "default" or missing → composer baseline

  // ---- P6: sort-table-style ----
  // Admin bookmark-sort table at `#main_column form[name="sort"]`. 13/13
  // themes re-style the order-rank input (`input[name^="id_"]`) identically
  // (38px fixed width, 3px/4px padding, 10px right margin, 12px font,
  // weight 600) and apply a subtle accent-alpha tint on `tr:hover`. This
  // pattern absorbs both, leaving background/border still token-driven.
  //   "enabled" → emit full package (order input + row hover)
  // Radius tunable via `ext.sort-input-radius` (default inherits from
  // ext.searchbox-radius, else 3px).
  const sortTable = pat["sort-table-style"];
  if (sortTable === "enabled") {
    const r = tokens.ext?.["sort-input-radius"] || tokens.ext?.["searchbox-radius"] || "3px";
    out.push(
      `#main_column form[name="sort"] table input[name^="id_"] { width: 38px !important; min-width: 38px !important; max-width: 38px !important; padding: 3px 4px !important; margin-right: 10px !important; font-size: 12px !important; line-height: 1.2 !important; font-weight: 600 !important; box-sizing: border-box !important; vertical-align: middle !important; background: ${v("bg-surface")} !important; color: ${v("text")} !important; border: 1px solid ${v("border")} !important; border-radius: ${r} !important; }`,
      `#main_column form[name="sort"] table input[name^="id_"]:focus { border-color: ${v("accent")} !important; box-shadow: 0 0 0 2px ${v("accent-alpha")} !important; outline: none !important; }`,
      `#main_column form[name="sort"] table tr:hover { background: ${v("accent-alpha")} !important; }`
    );
  }
  // "default" or missing → composer baseline

  // ---- P6: tag-hover-style ----
  // Delta on top of composer's baseline `a.tag:hover` (which sets bg to
  // accent-alpha, color to tag-fg, text-decoration:none). 10/13 shipped
  // themes add extra emphasis — most commonly underline, some shift color
  // to accent. This pattern emits the delta only.
  //   "underline"       → restore text-decoration: underline
  //   "accent-text"     → shift color to accent
  //   "underline-accent"→ both
  const tagHover = pat["tag-hover-style"];
  if (tagHover === "underline") {
    out.push(
      `a.tag:hover { text-decoration: underline !important; }`
    );
  } else if (tagHover === "accent-text") {
    out.push(
      `a.tag:hover { color: ${v("accent")} !important; }`
    );
  } else if (tagHover === "underline-accent") {
    out.push(
      `a.tag:hover { color: ${v("accent")} !important; text-decoration: underline !important; }`
    );
  }
  // "default" or missing → composer baseline (accent-alpha bg only)

  // ---- P6: tag-selected-style ----
  // `a.tag.selected` is the "currently filtered" tag chip. Composer baseline
  // uses palette.destroy + bold for a strong "this is active" signal, but
  // 12/13 themes actually prefer accent-colored or theme-specific chroma.
  //   "accent"      → color: accent (keeps composer's bold weight)
  //   "accent-soft" → color: accent + normal weight (subtle)
  //   "bold-accent" → color: accent + explicit weight 600 (crisper than
  //                   composer's `bold` keyword, aids monospace/serif themes)
  const tagSelected = pat["tag-selected-style"];
  if (tagSelected === "accent") {
    out.push(
      `a.tag.selected { color: ${v("accent")} !important; }`
    );
  } else if (tagSelected === "accent-soft") {
    out.push(
      `a.tag.selected { color: ${v("accent")} !important; font-weight: normal !important; }`
    );
  } else if (tagSelected === "bold-accent") {
    out.push(
      `a.tag.selected { color: ${v("accent")} !important; font-weight: 600 !important; }`
    );
  }
  // "default" or missing → composer baseline (destroy color + bold)

  // ---- P7: title-hover-style ----
  // Delta on composer's baseline `a.bookmark_title:hover`. 6/13 themes
  // override — catppuccin-pair/flexoki-light drop the underline to keep the
  // bookmark title flat-looking on hover; dracula shifts to a brighter accent
  // tint; rose-pine/paper-ink go subtle-muted for a softer read.
  //   "no-underline" → `text-decoration: none` (keeps composer's color)
  //   "accent-color" → color shifts to `link-hover` with no underline
  //   "muted"        → color shifts to `muted-soft` with no underline
  const titleHover = pat["title-hover-style"];
  if (titleHover === "no-underline") {
    out.push(
      `a.bookmark_title:hover { text-decoration: none !important; }`
    );
  } else if (titleHover === "accent-color") {
    out.push(
      `a.bookmark_title:hover { color: ${v("link-hover")} !important; text-decoration: none !important; }`
    );
  } else if (titleHover === "muted") {
    out.push(
      `a.bookmark_title:hover { color: ${v("muted-soft")} !important; text-decoration: none !important; }`
    );
  }
  // "default" or missing → composer baseline

  // ---- P7: description-tone ----
  // Parallel to footer-tone. 9/13 themes override `.description` with a
  // muted color and/or reduced opacity (catppuccin-pair, dracula, flexoki,
  // paper-ink, rose-pine, terminal). Color always resolves to `muted-soft`
  // so the tone stays token-driven; opacity is an extra "faint" tier for
  // themes whose muted-soft isn't muted enough on their bg.
  //   "muted" → color only
  //   "faint" → color + opacity 0.75
  const descTone = pat["description-tone"];
  if (descTone === "muted" || descTone === "faint") {
    const opacity = descTone === "faint" ? " opacity: 0.75 !important;" : "";
    out.push(
      `.description { color: ${v("muted-soft")} !important;${opacity} }`
    );
  }
  // "default" or missing → composer baseline

  // ---- P7: searchbox-width ----
  // 7/13 themes force `#search_query_field { width: 100% }` to fight
  // Pinboard's inline default width and fill the available column. This
  // pattern centralizes that decl. Keep it separate from `searchbox-style`
  // because a theme may want 100% width WITHOUT the boxed/outlined chrome
  // (e.g. modern-card wants a full-width pill-style search).
  //   "full" → width 100%
  const searchboxWidth = pat["searchbox-width"];
  if (searchboxWidth === "full") {
    out.push(
      `#search_query_field { width: 100% !important; }`
    );
  }
  // "default" or missing → Pinboard's inline width stays

  // ---- P7: input-radius ----
  // 4/13 themes (catppuccin-pair, modern-card, paper-ink) apply the same
  // radius to *every* form input (`text/password/not([type])/textarea/select`)
  // en bloc. Value read from `ext.input-radius` (no default — pattern is a
  // no-op if the token isn't set). Kept distinct from `searchbox-style` /
  // `button-style` because those scope to specific selectors; this one is
  // the catch-all for non-button inputs on settings/edit pages.
  //   "rounded" → apply ext.input-radius to the form-input selector group
  const inputRadius = pat["input-radius"];
  if (inputRadius === "rounded") {
    const r = tokens.ext?.["input-radius"];
    if (r) {
      out.push(
        `input[type="text"], input:not([type]), input[type="password"], textarea, select { border-radius: ${r} !important; }`
      );
    }
  }
  // "default" or missing → composer baseline

  if (!out.length) return "";
  return `\n/* === patterns layer (tokens.patterns) === */\n` + out.join("\n") + "\n";
}

// CSS ::before/::after `content:` must be a quoted string. We already wrap in
// double-quotes, so escape any " and \ in the user glyph. Keep printable-ASCII
// glyphs (schema caps at 8 chars, typical values: "> ", "$ ", "# ", "» ").
function escapeCssContent(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
