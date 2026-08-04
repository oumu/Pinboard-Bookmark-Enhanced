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
    "fg-muted": rgbToHex(fgToAA(rgb("muted"), bg)),
    "fg-hint": rgbToHex(fgToAA(rgb("muted-soft"), bg)),
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
