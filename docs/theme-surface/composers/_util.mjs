// Shared helpers for composers.

import { hexToRgb, rgbToHex, rgbToHsl, hslToRgb, contrast, fgToAA, fgToAAMulti, bgToAA, borderToAA, isHex, resolveOpaqueBg } from "./_ui-derive.mjs";

export function varName(slot) {
  return `--pinboard-${slot}`;
}

const norm = (s) => rgbToHex(hexToRgb(s));
const lighten = (hex, d) => {
  const [h, s, l] = rgbToHsl(hexToRgb(hex));
  return rgbToHex(hslToRgb([h, s, Math.min(1, Math.max(0, l + d))]));
};

// Contrast-aware pass over the expanded palette. Two distinct problems, two levers:
//
//   1. Button fills (btn-bg / btn-bg-hover) are dedicated tokens used by nothing
//      else, so the FILL gives way: darken by the minimum that clears AA against
//      btn-fg, preserving hue+sat so the brand color survives.
//   2. accent / link-hover / success are shared tokens — accent alone paints 45
//      surfaces, most of them TEXT (links, bookmark titles, banner). Darkening
//      those would repaint half the site, so where btn-fg sits on one of them as
//      a fill, the TEXT gives way instead: an `on-<fill>` token derived per fill.
//
// Both are identity when the pair already clears AA, so compliant themes emit
// byte-for-byte unchanged.
// One filled-button family: fill, its :hover, and the text that sits on both.
// Darkens each fill by the minimum that clears AA against the shared text color.
// Identity when the family already passes, so compliant themes emit unchanged.
function deriveBtnFamily(p, out, bgKey, hoverKey, fgKey) {
  const fg = p[fgKey];
  if (!isHex(fg) || !isHex(p[bgKey])) return;
  const fgRgb = hexToRgb(fg);
  const base = rgbToHex(bgToAA(hexToRgb(p[bgKey]), fgRgb));
  out[bgKey] = base;
  if (!isHex(p[hoverKey])) return;
  // A darkened base can land on top of the hand-picked hover (both sat on the AA
  // boundary), collapsing the hover affordance. Re-derive hover from the NEW base
  // in that case; otherwise leave the theme's own hover untouched.
  const moved = base !== norm(p[bgKey]);
  out[hoverKey] = moved
    ? rgbToHex(bgToAA(hexToRgb(lighten(base, -0.07)), fgRgb))
    : rgbToHex(bgToAA(hexToRgb(p[hoverKey]), fgRgb));
}

function deriveContrast(p) {
  const fg = p["btn-fg"];
  if (!isHex(fg)) return p;
  const fgRgb = hexToRgb(fg);
  const out = { ...p };

  deriveBtnFamily(p, out, "btn-bg", "btn-bg-hover", "btn-fg");
  // The right_bar (subscribe) and tweet_searchbox (search) submits are their own
  // family: 7 of 13 pilots used to override them to the button color, 2 to a custom
  // color, 4 left them on `success`. That disagreement lived in hand-written
  // override CSS the composer could not read, so no text color could be derived for
  // them. Promoted to declarable slots — each pilot states what its sidebar button
  // is, and the fill then derives to AA like any other button.
  deriveBtnFamily(p, out, "sidebar-btn-bg", "sidebar-btn-bg-hover", "sidebar-btn-fg");

  // A fill and its :hover variant share one text color, so each on-token must clear
  // AA against BOTH. Repeatedly fix whichever pair is worst until all pass.
  //
  // Only fills the composer actually paints btn-fg onto get a token. `success` is
  // absent because no surface paints btn-fg on it any more — the sidebar submits
  // that used to now carry their own sidebar-btn-* family (above).
  for (const [slot, fills] of [
    ["on-accent", ["accent"]],
    ["on-link-hover", ["link-hover"]],
  ]) {
    const present = fills.filter((k) => isHex(p[k])).map((k) => hexToRgb(p[k]));
    if (!present.length) continue;
    let cur = fgRgb;
    for (let i = 0; i < 8; i++) {
      let worst = null;
      for (const f of present) {
        const c = contrast(hexToRgb(rgbToHex(cur)), f);
        if (!worst || c < worst.c) worst = { f, c };
      }
      if (worst.c >= 4.5) break;
      cur = fgToAA(cur, worst.f);
    }
    out[slot] = rgbToHex(cur);
  }
  return out;
}

// The four TEXT tiers, pushed to WCAG AA (4.5:1) against BOTH bases the
// composer paints them on: the page `bg` and the elevated `bg-surface` (the
// card/panel fill card-style pilots give every .bookmark). These are not
// decoration — `muted` carries h2, the settings tabs, #right_bar headings and
// the sort table's edit links; `muted-soft` carries the footer/colophon, the
// per-bookmark edit/copy links, #tag_cloud_header and .description on the
// pilots that opt into the muted description style. Neither had ANY 4.5:1
// gate until 2026-08-26: the one `muted vs bg-surface` row contrast-audit
// carried was the scrollbar thumb's 3:1 NON-text check, and the two entries
// parked in its allowlist ("raising muted for the scrollbar would lighten
// these themes' prose") had the argument backwards — the prose was the half
// that needed lightening. flexoki:dark shipped 2.34:1 and solarized-dark
// 2.79:1 body-adjacent text for months behind a green audit.
//
// Same shape as deriveBtnFamily/borderToAA above: minimum lightness movement,
// hue+saturation preserved, identity when the tier already clears AA, so a
// compliant pilot pays nothing. Gated by contrast-audit's four
// `muted|muted-soft vs bg|bg-surface` rows — if one fails, THIS is what needs
// fixing, never an allowlist entry.
//
// Measured breadth at introduction: 9 of the 28 (rendered palette x tier)
// pairs are identity, 19 move. `muted-soft` is nearly all of the movement —
// it cleared 4.5:1 on ZERO of the 14 rendered palettes before this (1.36:1 on
// nord-night, 4.67:1 at best on flexoki:dark), so on the light themes it now
// lands close to `muted` and the soft/muted ramp compresses. That is what a
// two-step ramp costs once BOTH steps are held to a text floor; the way to
// re-open the gap is to move `muted` and `fg` apart, not to put `muted-soft`
// back under AA.
//
// Deliberately NOT widened to every surface muted-soft can land on: `a.help`
// paints it on `accent-soft` and a private bookmark's row is `private-bg`.
// Post-derivation those read better than before but are not guaranteed; same
// disclosed-exposure terms as borderToAA's `bg`/`input-bg` note.
//
// `fg` / `fg-strong` joined the same loop 2026-08-26. Holding ONLY the two
// secondary tiers to a 4.5:1 floor on `bg-surface` inverted the ramp on the
// themes whose PRIMARY text never had that floor: solarized-dark's `fg` is
// 4.11:1 on its own card fill and solarized-light's 4.39:1, so raising `muted`
// to 4.5:1 pushed the secondary tier PAST the body text — an edit link
// out-shouting the description it sits under. The audit could not see it
// because the only primary-text row this file ever had was `bg vs fg` (the
// PAGE background), never the elevated surface the same prose lands on inside
// a card. Both tiers now clear the same two bases, so the ordering the pilots
// declare is the ordering that ships. Identity on 12 of the 14 rendered
// palettes at introduction; the two solarized ones move by less than one JND
// (#839496 -> #8e9e9f, #586e75 -> #54696f) and stay inside their base ramps.
function deriveTextTiers(p) {
  const bases = [p["bg"], p["bg-surface"]].filter(isHex).map(hexToRgb);
  if (!bases.length) return p;
  const out = { ...p };
  for (const key of ["fg", "fg-strong", "muted", "muted-soft"]) {
    if (!isHex(p[key])) continue;
    out[key] = rgbToHex(fgToAAMulti(hexToRgb(p[key]), bases));
  }
  // Scrollbar thumb as its OWN role, so "is the prose legible" and "is the
  // thumb visible" stop being one decision. classic-list-v2 used to paint the
  // thumb with `muted` directly, which is why raising `muted` was written up
  // as a scrollbar risk. It is the reverse constraint anyway — the thumb only
  // needs WCAG 1.4.11's 3:1 non-text floor against its track (`bg-surface`) —
  // so it derives separately and a pilot may declare its own value.
  const thumbSeed = p["scrollbar-thumb"] && isHex(p["scrollbar-thumb"]) ? p["scrollbar-thumb"] : out["muted"];
  const track = isHex(p["bg-surface"]) ? p["bg-surface"] : p["bg"];
  if (isHex(thumbSeed) && isHex(track)) {
    out["scrollbar-thumb"] = rgbToHex(borderToAA(hexToRgb(thumbSeed), [hexToRgb(track)]));
  }
  return out;
}

// Palette expansion (SHARED by all four theme systems): fill optional slots with
// principled fallbacks so every composer can reference a complete palette
// without null checks. Read expandSitePalette's header below before adding a
// derivation here -- a rule that is right for one surface can be backwards on
// another.
export function expandPalette(p) {
  const bg = p.bg;
  const fg = p.fg;
  const muted = p.muted;
  const border = p.border;
  const accent = p.accent;
  return deriveTextTiers(deriveContrast({
    ...p,
    // strong / soft variants
    "fg-strong":      p["fg-strong"]      || fg,
    "muted-soft":     p["muted-soft"]     || muted,
    "border-strong":  p["border-strong"]  || border,
    "border-soft":    p["border-soft"]    || border,
    "bg-surface":     p["bg-surface"]     || bg,
    // accent family
    "btn-bg":         p["btn-bg"]         || accent,
    "btn-bg-hover":   p["btn-bg-hover"]   || p["link-hover"] || p["accent-hover"] || p["btn-bg"] || accent,
    // Right-bar form submits (subscribe, tweet search). Default to the main button
    // family so a new theme that says nothing gets a sane, AA-derived button; the
    // 13 shipped pilots declare these explicitly to keep the color each one chose.
    "sidebar-btn-bg":       p["sidebar-btn-bg"]       || p["btn-bg"] || accent,
    "sidebar-btn-fg":       p["sidebar-btn-fg"]       || p["btn-fg"],
    "sidebar-btn-bg-hover": p["sidebar-btn-bg-hover"] || p["btn-bg-hover"] || p["link-hover"] || p["btn-bg"] || accent,
    "accent-hover":   p["accent-hover"]   || p["link-hover"] || accent,
    "accent-soft":    p["accent-soft"]    || p["tag-bg"] || accent,
    "link-hover":     p["link-hover"]     || p["accent-hover"] || accent,
    "link-visited":   p["link-visited"]   || accent,
    "focus-ring":     p["focus-ring"]     || accent,
    // semantic fallbacks
    "tag-fg":         p["tag-fg"]         || accent,
    "success":        p["success"]        || accent,
    "success-hover":  p["success-hover"]  || p["link-hover"] || accent,
    "private-accent": p["private-accent"] || p.destroy,
    "url-link-bg":    p["url-link-bg"]    || p["tag-bg"] || accent,
    "url-link-fg":    p["url-link-fg"]    || fg,
    "unread":         p["unread"]         || p.destroy
  }));
}

// ============================================================================
// SITE-ONLY palette layer.
//
// expandPalette() above is shared by all four theme systems (pinboard.in via
// _base.mjs, plus popup / options / library via *-chrome.mjs). Everything it
// derives is a rule that holds on all four -- `fg`/`muted` land on `bg` and
// `bg-surface` on every surface, because deriveUiColors maps --{ns}-bg/-bg2
// to those exact two palette slots.
//
// These three do NOT hold on all four, which is why they live behind their own
// entry point instead of being folded into deriveTextTiers:
//
//   `destroy` is TEXT on pinboard.in (a.delete / a.destroy / a.tag.selected)
//   and a FILL in the extension (--{ns}-danger, with --{ns}-on-danger painted
//   ON it, plus the seed for popup's warn-bg tint). The two roles pull in
//   OPPOSITE directions: pushing `destroy` up to 4.5:1 as text over a dark
//   page lightens it, which is exactly how you wash out a danger BUTTON.
//   Measured, not assumed: routing this through expandPalette() moved 32
//   emitted values across popup.css/options.css/library.css -- nord-night's
//   --lib-danger #d18d93 -> #d9a2a8, flexoki-dark's --pp-danger #D14D41 ->
//   #db736a -- and red the popup `warn-fg vs warn-bg` gate on two pilots
//   (solarized-light 4.48:1, catppuccin-latte 4.49:1), whose ui.popup.light
//   pins warn-fg by hand against a warn-bg that is derived FROM destroy.
//   `tag-fg` has the same shape one step further out: the extension re-derives
//   it into chip-fg against the CHIP's fill, so seeding that from a
//   site-page-corrected value only adds rounding drift.
//   `url-link-fg` has no extension consumer at all.
//
// So: the site gets the site's floor, the extension keeps deriving its own
// roles from the pilot's declared value, and neither surface's contrast math
// is expressed in the other's bases. _base.mjs (the ONLY emitter of
// --pinboard-*) is the single caller; contrast-audit's auditPalette calls it
// too, so the gate and the emission agree by construction.
//
// The three floors themselves, with the base each one is MEASURED against
// (read off classic-list-v2.mjs's emission, not inferred from the token name):
//
//   tag-fg      `a.tag` declares `background: transparent !important`, so
//               `tag-bg` is NOT this rule's fill -- it paints
//               a.sort_order_selected and the extension's chip role. a.tag
//               lands on the page itself: `bg` for a flat-bookmark pilot,
//               `bg-surface` inside a card-style .bookmark and inside
//               #right_bar's #tag_cloud. Both bases.
//   destroy     `a.delete, a.destroy` carries no fill either, and its live
//               selectors span both bases (the per-bookmark edit strip,
//               #right_bar's table, #main_column's sort table), as does the
//               `a.tag.selected` colour _patterns.mjs paints with it.
//   url-link-fg the one of the three with a fill of its own: `a.url_link`
//               declares `background: url-link-bg`. Measuring it against the
//               page bases would gate the wrong pair -- github-light's pill is
//               #fff8c5, lighter than either base. resolveOpaqueBg() over each
//               page base, so a pilot that leaves `url-link-bg` at the
//               "transparent" its fallback chain can reach (`|| tag-bg`, which
//               9 pilots declare transparent) falls through to the page
//               instead of being read as black by hexToRgb.
//
// Nine sub-AA landings ship today across the 14 rendered palettes (flexoki
// light a.tag #ad8301 at 3.39:1, github-light a.url_link #bf8700 on its
// #fff8c5 pill at 2.92:1, nord-night a.delete #bf616a at 2.46:1 on the card
// fill). None of them was reachable by any gate: no row existed here, and
// contrast-audit's override scan skips `color: var(--pinboard-*)` on purpose.
//
// Same minimum-lightness-movement, hue+saturation-preserving, identity-when-
// already-passing shape as everything else in this file, and gated by
// contrast-audit's `tag-fg|destroy vs bg|bg-surface` and `url-link-fg vs
// url-link-bg` rows -- a FAIL there is a bug in THIS function, never an
// allowlist entry.
//
// Runs AFTER expandPalette, so its fallback chain has already resolved
// `private-accent` / `unread` off the pilot's RAW `destroy`. Deliberate: those
// two are the private-row inset bar and the .selected_star glyph -- WCAG
// 1.4.11 shapes, not 1.4.3 text -- so a theme that declares only `destroy`
// keeps the decorative colour it chose while the TEXT role moves.
//
// Deliberately NOT covered, same disclosed-exposure terms as deriveTextTiers'
// `a.help` / `private-bg` note: the HOVER bands (`row-hover`, which both
// #right_bar's table and #main_column's sort table paint on tr:hover, and the
// ~6%-accent tint some pilots override that sort-table row to), and any of the
// three inside a `.bookmark.private` row (`private-bg`). Those are transient or
// tinted variants of the two bases above; post-derivation they measure
// 3.81-5.61:1 on row-hover (up from 2.11-5.61) and 4.23-10.34:1 on private-bg
// (up from 2.42-10.34), i.e. improved everywhere and still short of a
// guarantee on catppuccin-latte / dracula / nord-night / flexoki:dark
// row-hover. Widening this call to those bands is a design decision about the
// hover tint, not a bug in it.
export function expandSitePalette(raw) {
  const p = expandPalette(raw);
  const bg = isHex(p["bg"]) ? hexToRgb(p["bg"]) : null;
  const bgSurface = isHex(p["bg-surface"]) ? hexToRgb(p["bg-surface"]) : bg;
  const pageBases = [bg, bgSurface].filter(Boolean);
  if (!pageBases.length) return p;
  const out = { ...p };
  for (const key of ["tag-fg", "destroy"]) {
    if (!isHex(p[key])) continue;
    out[key] = rgbToHex(fgToAAMulti(hexToRgb(p[key]), pageBases));
  }
  if (isHex(p["url-link-fg"])) {
    const pill = pageBases.map((b) => resolveOpaqueBg(p["url-link-bg"], b));
    out["url-link-fg"] = rgbToHex(fgToAAMulti(hexToRgb(p["url-link-fg"]), pill));
  }
  return out;
}

// Apply a state delta on top of a base palette object. Used by composers that
// want to honor tokens.states.hover / focus-visible overrides.
export function withState(palette, delta) {
  if (!delta || !delta.palette) return palette;
  return { ...palette, ...delta.palette };
}

// Render a block of property:value pairs into a CSS rule.
export function block(selector, decls) {
  const body = Object.entries(decls)
    .filter(([, v]) => v != null && v !== "")
    .map(([k, v]) => `  ${k}: ${v};`)
    .join("\n");
  return `${selector} {\n${body}\n}`;
}

// Shorthand for "var(--pinboard-xxx)"
export function v(slot) { return `var(${varName(slot)})`; }
