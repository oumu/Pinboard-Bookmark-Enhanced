// Shared UI-theme derivation: pilot palette -> popup/options semantic colors,
// with contrast-aware tinting so status backgrounds clear WCAG AA by construction.
// Pure functions only (unit-tested). No I/O.

export function hexToRgb(h) {
  let s = String(h).replace(/^#/, "").trim();
  if (s.length === 3) s = s.split("").map(c => c + c).join("");
  const n = parseInt(s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgbToHex([r, g, b]) {
  const h = x => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0");
  return "#" + h(r) + h(g) + h(b);
}
export function relLum(rgb) {
  const s = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * s(rgb[0]) + 0.7152 * s(rgb[1]) + 0.0722 * s(rgb[2]);
}
export function contrast(a, b) {
  const L = [relLum(a), relLum(b)].sort((x, y) => x - y);
  return (L[1] + 0.05) / (L[0] + 0.05);
}
export function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0; const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return [h * 360, s, l];
}
export function hslToRgb([h, s, l]) {
  h = ((h % 360) + 360) % 360 / 360;
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue = t => {
    t = (t + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [hue(h + 1 / 3), hue(h), hue(h - 1 / 3)].map(x => Math.round(x * 255));
}

// Mix two rgb colors by ratio t (0 = a, 1 = b).
export function mix(a, b, t) { return a.map((c, i) => c + (b[i] - c) * t); }

// A plain opaque 3- or 6-digit hex color -- the only shape hexToRgb() parses
// correctly. Anything else (an 8-digit RRGGBBAA hex, the literal keyword
// "transparent", or any other CSS color syntax) must NOT be handed to
// hexToRgb() directly: parseInt("transparent", 16) is NaN, which the bitwise
// ops below silently coerce to 0 -- i.e. hexToRgb("transparent") returns
// [0,0,0] (black) with no error. An 8-digit hex is worse: hexToRgb() bit-shifts
// it as if it were 6-digit, reading the wrong bytes into r/g/b entirely.
const HEX6_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
export function isHex(s) { return typeof s === "string" && HEX6_RE.test(s.trim()); }

// Resolve a possibly-non-opaque fill to the solid RGB it actually composites
// to once painted over `fallbackBg` -- for AA math against colors a pilot
// may declare as non-solid (9 of 13 pilots' `tag-bg` is the literal
// "transparent"; no pilot's `tag-bg` currently uses an 8-digit alpha hex,
// but several pilots' OTHER palette slots do -- e.g. terminal's `border`/
// `selection-bg`, `#33ff3340` -- so the guard below handles that shape too
// rather than assuming every non-"transparent" value is a plain 6-digit
// hex). A plain hex passes through unchanged (already opaque, no
// compositing needed); an 8-digit RRGGBBAA hex is alpha-blended over
// `fallbackBg`; anything else (transparent, or any other keyword) is
// treated as fully transparent, so the resolved color is just `fallbackBg`.
const HEX8_RE = /^#([0-9a-f]{8})$/i;
export function resolveOpaqueBg(raw, fallbackBg) {
  if (isHex(raw)) return hexToRgb(raw);
  const m = typeof raw === "string" && raw.trim().match(HEX8_RE);
  if (!m) return fallbackBg;
  const n = parseInt(m[1], 16);
  const rgb = [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255];
  const alpha = (n & 255) / 255;
  return mix(fallbackBg, rgb, alpha);
}

// chip-bg's palette source (`tag-bg`) is the literal "transparent" for 9 of
// 13 pilots. resolveOpaqueBg's own fallback for that shape is `fallbackBg`
// verbatim (mixing in 0% of a fully-transparent color) -- correct for its
// other callers (a border/spinner compositing onto whatever sits behind it),
// but wrong for chip-bg specifically: chip-bg IS the fill of a real pill
// (.vocab-group-chip / .tag-gov-kind-badge), and a pill whose background
// exactly equals its own container is exactly as invisible as the literal
// `transparent` it would replace (vocab-group-inspect-report.md 2026-08-05
// Finding 2: dracula's .vocab-group-chip rendered with zero pill background,
// floating text only -- library-chrome.mjs/options-chrome.mjs's prior
// `map["chip-bg"] = palette["tag-bg"]` shipped the raw literal verbatim, so
// the bug wasn't even panel-colored invisibility, it was literally
// `background: transparent` in the shipped CSS). Synthesize the same
// 10%-accent-on-panel tint both composers' DEFAULT_LIGHT baseline already
// documents (its own "chip-bg" comment) for the untheme surface, instead of
// falling through to invisible-on-panel. Returns RGB (resolveOpaqueBg's own
// convention) so a caller can rgbToHex() it for emission and reuse the same
// RGB for a paired chip-fg contrast check without re-deriving it.
export function resolveChipBg(raw, accentRgb, panelRgb) {
  if (isHex(raw)) return hexToRgb(raw);
  const m = typeof raw === "string" && raw.trim().match(HEX8_RE);
  if (m) return resolveOpaqueBg(raw, panelRgb);
  return mix(panelRgb, accentRgb, 0.10);
}

// Adjust fg's LIGHTNESS (hue+sat preserved) against a FIXED bg until contrast >= min,
// verifying on hex-rounded values so the written CSS clears AA. Returns rgb.
export function fgToAA(fg, bg, min = 4.5) {
  const bgRound = hexToRgb(rgbToHex(bg));
  const bgIsLight = relLum(bgRound) > 0.18;
  const [h, s] = rgbToHsl(fg);
  let [, , l] = rgbToHsl(fg);
  let out = fg;
  for (let i = 0; i < 80; i++) {
    if (contrast(hexToRgb(rgbToHex(out)), bgRound) >= min) break;
    l = bgIsLight ? Math.max(0, l - 0.02) : Math.min(1, l + 0.02);
    out = hslToRgb([h, s, l]);
    if (l <= 0 || l >= 1) break;
  }
  return out;
}

// Mirror of fgToAA for the case where the FOREGROUND is the fixed brand value and
// the FILL must give way. Adjusts bg's LIGHTNESS (hue+sat preserved) against a fixed
// fg until contrast >= min, verifying on hex-rounded values. Returns rgb.
//
// Used for button fills: a pilot's btn-fg is the theme's chosen "text on brand color"
// (usually its lightest base), and flipping it to the opposite pole to reach AA would
// read as a different theme. Darkening the fill by the minimum needed keeps the
// light-text-on-brand look while clearing AA. Identity when the pair already passes,
// so themes that are already compliant emit byte-for-byte unchanged.
export function bgToAA(bg, fg, min = 4.5) {
  const fgRound = hexToRgb(rgbToHex(fg));
  const fgIsLight = relLum(fgRound) > 0.18;
  const [h, s] = rgbToHsl(bg);
  let [, , l] = rgbToHsl(bg);
  let out = bg;
  for (let i = 0; i < 200; i++) {
    if (contrast(hexToRgb(rgbToHex(out)), fgRound) >= min) break;
    l = fgIsLight ? Math.max(0, l - 0.005) : Math.min(1, l + 0.005);
    out = hslToRgb([h, s, l]);
    if (l <= 0 || l >= 1) break;
  }
  return out;
}

// Derive an AA-passing status (fg,bg) pair: subtle tinted background keeping the
// theme's light/dark feel, with the foreground's LIGHTNESS adjusted (hue+sat kept)
// until contrast >= min. mode: "light"|"dark". Returns { fg:[r,g,b], bg:[r,g,b] }.
export function pairToAA(statusFg, themeBg, mode, min = 4.5) {
  const bg = mix(themeBg, statusFg, mode === "dark" ? 0.18 : 0.12);
  return { fg: fgToAA(statusFg, bg, min), bg };
}

// Push fg's lightness (hue+sat preserved) until it clears AA against EVERY
// background in `bgs`, not just one. Several UI roles are shared across more
// than one surface fill -- a button's text sits on both its resting bg and
// its :hover bg, library's row text sits on bg, panel AND the selected-row
// fill -- and a plain fgToAA(fg, oneBg) can't express a "clears all of these"
// constraint. Repeatedly fix whichever pair is worst until all pass. Same
// repeated-worst-case technique _util.mjs's on-accent derivation uses.
// (Moved here from library-chrome.mjs, its original sole consumer, so
// popup/options/library composers can share one implementation -- Task 5.)
export function fgToAAMulti(fg, bgs, min = 4.5) {
  let cur = fg;
  for (let i = 0; i < 8; i++) {
    let worst = null;
    for (const bg of bgs) {
      const c = contrast(cur, bg);
      if (!worst || c < worst.c) worst = { bg, c };
    }
    if (worst.c >= min) break;
    cur = fgToAA(cur, worst.bg, min);
  }
  return cur;
}

// Push a UI-chrome BORDER's LIGHTNESS (hue+sat preserved) until it clears
// WCAG 1.4.11's 3:1 non-text floor against the CALLER-CHOSEN bgs argument --
// every caller in this codebase passes [btn-bg, panel] (COMPONENTS.md's
// border-color row; gated by contrast-audit's COMPONENT_PAIR_SPEC "border"
// rows -- design-uplift Task 16, USER RULING: Task 7 measured all 13
// pilots' raw palette border at 1.0-1.73:1 against btn-bg across all 3 UI
// surfaces and deliberately left it ungated pending this derivation). This
// function makes NO guarantee against any OTHER surface a border-colored
// rule happens to sit on -- `bg` (the page background, not btn-bg/panel)
// and `input-bg` are real, un-derived exposures: post-derivation measured
// ratios there run 2.76-5.71:1 (up from a pre-derivation 1.0-2.06:1, zero
// regressions, but individual combos like modern-card border-vs-bg 2.81:1
// and dracula border-vs-input-bg 1.78:1 still sit under 3:1) -- see
// task-16-report.md's disclosure table for the full per-theme numbers.
// Widening this function's contract to cover those too is future work, not
// a claim this derivation call already makes. Same repeated-worst-case
// convergence as fgToAAMulti (this file) -- just at the UI-component
// threshold instead of body text's 4.5:1, and named separately because
// "does this edge read distinctly against its surroundings" is a different
// question from "is this text legible on its fill" even though the math is
// identical. Identity when the pair already clears 3:1, so an
// already-compliant theme emits byte-for-byte unchanged. `border` may be a
// non-opaque fill (terminal's is a translucent glow, an 8-digit alpha hex,
// `#33ff3340`) -- callers must resolve it to an opaque RGB first
// (resolveOpaqueBg), the same requirement fgToAA/fgToAAMulti already carry
// for any fg input.
export function borderToAA(border, bgs, min = 3) {
  return fgToAAMulti(border, bgs, min);
}

// The FOCUS EDGE, pushed to clear WCAG 1.4.11's 3:1 non-text floor against
// every host fill a focusable control can wear (callers pass [btn-bg,
// input-bg]; the worst of them wins, same repeated-worst-case shape as
// fgToAAMulti/borderToAA).
//
// Why this needs a derivation at all (design-uplift follow-up 2026-08-06,
// independent review): §7.3's `bordered` placement makes the control's own
// 1px border the focus indicator's CORE, and Soft Fill (§9 law 1) collapsed
// that border into the fill at rest -- `btn-border == btn-bg`, 1.00:1. So
// this one token IS the entire compliance story for the whole .btn family,
// every field, and every fused shell. The shipped default was a flat
// `color-mix(accent 55%, input-focus-bg)`, which measured 1.58-2.40:1 on
// most surfaces (default light 1.89, html.dark 2.40, flexoki 2.10,
// solarized-light 1.58). The only three themes that passed -- terminal
// 13.93, paper-ink 9.63, solarized-dark 3.30 -- passed precisely because a
// pilot override bypassed that formula. §7.3 has required >=3:1 since it was
// written; nothing had ever enforced it.
//
// Starts AT the historical formula so a theme that already clears 3:1 emits
// byte-for-byte unchanged, then walks the mix toward pure accent, and only
// if pure accent still cannot reach the floor falls back to moving lightness
// (fgToAAMulti). Walking the mix first is what keeps the ring the theme's
// OWN accent hue rather than an arbitrarily lightened/darkened version of
// it -- the visible softness of this ring is supposed to come from its
// SHAPE (the --{ns}-focus-ring glow) and not from a washed-out core.
export function focusBdToAA(accent, seedBg, hosts, min = 3) {
  const round = c => hexToRgb(rgbToHex(c));
  const clears = c => hosts.every(h => contrast(round(c), round(h)) >= min);
  for (let i = 55; i <= 100; i++) {
    const c = mix(seedBg, accent, i / 100);
    if (clears(c)) return c;
  }
  return fgToAAMulti(accent, hosts, min);
}

// Soft Fill (design-uplift 2026-08-05, USER RULING): at rest a control is
// announced by its FILL, not by a frame -- the resting border-color collapses
// into the fill (border-width is kept, so zero layout shift). That only works
// if the fill is actually distinguishable from the surface the control sits
// on, and measured across the 14 theme blocks it frequently is NOT: options'
// btn-bg is byte-identical to its own panel in 6 of them, library's in ALL
// 14, input-bg in 5, and popup's bg2-as-button-fill in 7 against its own
// strip. Delete the border there and the control vanishes outright -- the
// finding softfill-delta-report.md §11.2 tabulated (github-light: panel,
// btn-bg AND input-bg all #ffffff).
//
// So: mix the surface's own fg into the fill until it clears `min` against
// EVERY host surface that control can sit on. Multi-host is not theoretical:
// library's .btn appears both on the page bg (toolbars) and inside a pane
// (panel), and separating from only one of the two can push the fill straight
// onto the other. Same repeated-worst-case shape as fgToAAMulti, just at a
// perceptibility floor instead of a legibility one.
//
// 1.06:1 is deliberately far below WCAG 1.4.11's 3:1 -- that clause governs a
// control's boundary against its background, a job the focus ring and the
// hover fill still do at full strength. This is the much weaker "the resting
// shape is perceivable at all" bar: on white, a 1-step-per-channel difference
// is ~1.005:1 (invisible), 1.06:1 is ~4 steps, which is where a flat fill
// starts reading as a distinct plane rather than as banding.
//
// Mixes into the FILL, not into the surface, so a theme whose fill already
// carries its own tint keeps that hue and only gains separation (mixing into
// the surface, the shape softfill-delta-report.md sketched for the runtime
// overlay, would have flattened every theme's fill onto one neutral). Where
// fill === surface the two are identical anyway. Identity when the pair
// already clears `min`, so an already-separated theme emits byte-for-byte
// unchanged.
export function fillSeparate(fill, surfaces, fg, min = 1.06) {
  const round = c => hexToRgb(rgbToHex(c));
  const clears = c => surfaces.every(s => contrast(round(c), round(s)) >= min);
  if (clears(fill)) return fill;
  for (let i = 1; i <= 100; i++) {
    const out = mix(fill, fg, i * 0.005);
    if (clears(out)) return out;
  }
  return mix(fill, fg, 0.5);
}

// Site radius scale -> extension UI radius scale.
//
// The site composers take the pilot's values literally (_base.mjs). Several
// pilots are non-monotonic there -- gruvbox md:0 below sm:2px, dracula and
// catppuccin-mocha with lg below md -- which is defensible on a bookmark list
// but reads as a bug on a settings form, where it puts a card that is rounder
// than the panel holding it. So the UI scale enforces sm <= md <= lg by RAISING
// only: the theme's intent survives, the inversion does not.
//
// Applied to the merged value, so a pilot `ui.*` override can still choose any
// scale it likes but cannot reintroduce an inversion.
export function regularizeUiRadius(r) {
  const px = (v, dflt) => { const n = parseFloat(v); return Number.isFinite(n) ? n : dflt; };
  const sm = px(r["radius-sm"], 0);
  const md = Math.max(sm, px(r["radius-md"], sm));
  const lg = Math.max(md, px(r["radius-lg"], md));
  return { "radius-sm": `${sm}px`, "radius-md": `${md}px`, "radius-lg": `${lg}px` };
}

// `radius` is the mode-merged pilot scale (compose-theme.mjs merges modes.dark
// over the base). Same md/lg fallback chain as _base.mjs so the two surfaces
// agree on what a pilot that omits a step means.
export function deriveUiRadius(radius) {
  const r = radius || {};
  return regularizeUiRadius({
    "radius-sm": r.sm ?? "0",
    "radius-md": r.md ?? r.sm ?? "0",
    "radius-lg": r.lg ?? r.md ?? r.sm ?? "0",
  });
}

// Map an expanded pilot palette to the canonical UI semantic colors.
// `mode` is the theme's light/dark intent. Palette values are hex strings.
export function deriveUiColors(p, mode) {
  const hx = k => p[k];
  const rgb = k => hexToRgb(p[k]);
  const bg = rgb("bg");
  const warn = pairToAA(rgb("destroy"), bg, mode);
  const ok = pairToAA(rgb("success"), bg, mode);
  const banner = pairToAA(rgb("accent"), bg, mode);
  const offline = pairToAA(rgb("private-accent"), bg, mode);
  const bd = (pr) => rgbToHex(mix(pr.bg, pr.fg, 0.5));
  const inputFocus = mode === "dark"
    ? rgbToHex(hslToRgb((() => { const [h, s, l] = rgbToHsl(rgb("input-bg")); return [h, s, Math.min(1, l + 0.06)]; })()))
    : hx("bg");
  return {
    bg: hx("bg"), bg2: hx("bg-surface"), fg: hx("fg"),
    // Both text tiers land on bg AND on the elevated bg2 surface (popup's
    // autocomplete footer / offline empty state, options' panels), so they
    // are derived against both (2026-08-26, Codex: flexoki-dark's fg-hint
    // cleared bg at 4.67:1 but sat at 4.05:1 on bg2 once the popup's
    // hand-tuned html.dark layer was retired).
    // ...and on the accent-tinted hover/selected row fill (drop-hover =
    // accent-soft): the autocomplete's selected candidate keeps its hint-tier
    // count on that fill (terminal read 3.5:1 there, Codex 2026-08-26).
    "fg-muted": rgbToHex(fgToAAMulti(rgb("muted"), [bg, rgb("bg-surface"), rgb("accent-soft")])),
    "fg-hint": rgbToHex(fgToAAMulti(rgb("muted-soft"), [bg, rgb("bg-surface"), rgb("accent-soft")])),
    border: hx("border"), divider: hx("border-soft"),
    accent: hx("accent"), accent2: hx("link-visited"), link: hx("accent"),
    "tag-bg": hx("tag-bg"), "tag-fg": hx("tag-fg"), "tag-hover": hx("row-hover"),
    "drop-hover": hx("accent-soft"),
    "input-bg": hx("input-bg"), "input-focus-bg": inputFocus,
    "warn-fg": rgbToHex(warn.fg), "warn-bg": rgbToHex(warn.bg), "warn-bd": bd(warn),
    "ok-fg": rgbToHex(ok.fg), "ok-bg": rgbToHex(ok.bg), "ok-bd": bd(ok),
    "banner-fg": rgbToHex(banner.fg), "banner-bg": rgbToHex(banner.bg), "banner-bd": bd(banner),
    "offline-fg": rgbToHex(offline.fg), "offline-bg": rgbToHex(offline.bg), "offline-bd": bd(offline),
    danger: hx("destroy"),
    "spinner-bg": hx("border"), "spinner-fg": hx("accent"),
    "preset-bg": hx("accent-soft"), "preset-bd": hx("border"), "preset-fg": hx("accent"),
  };
}
