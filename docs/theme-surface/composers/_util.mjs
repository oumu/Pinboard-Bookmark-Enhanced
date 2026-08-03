// Shared helpers for composers.

import { hexToRgb, rgbToHex, rgbToHsl, hslToRgb, contrast, fgToAA, bgToAA, isHex } from "./_ui-derive.mjs";

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

// Palette expansion: fill optional slots with principled fallbacks so every
// composer can reference a complete palette without null checks.
export function expandPalette(p) {
  const bg = p.bg;
  const fg = p.fg;
  const muted = p.muted;
  const border = p.border;
  const accent = p.accent;
  return deriveContrast({
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
  });
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
