#!/usr/bin/env node
// contrast-audit — fail the pipeline if any token pair drops below the
// minimum WCAG / readability ratio that the recent regressions exposed.
//
// Four theme systems are checked:
//   1. Pinboard.in content-script themes  -> pilots/<slug>.tokens.json
//   2. Popup (--pp-*)                     -> popup.css [data-theme=...] blocks
//   3. Options page (--opt-*)             -> options.css [data-theme=...] blocks
//   4. Library page (--lib-*)             -> library.css [data-theme=...] blocks

import { readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { expandSitePalette } from "../composers/_util.mjs";
import { isHex, resolveOpaqueBg } from "../composers/_ui-derive.mjs";
import { composeTheme } from "../composers/compose-theme.mjs";
import { compose } from "../composers/classic-list-v2.mjs";
import { parseDeclarations, parseStyleRules } from "./css-syntax.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..", "..");
const PILOTS = resolve(__dirname, "..", "pilots");

// Exported for scripts/ui-render-audit.mjs (the design-uplift render oracle):
// same WCAG math, reused rather than re-implemented so the two audits can
// never disagree on what a passing ratio is. The rest of this file (the CLI
// runner below, gated behind the direct-execution guard at the bottom) is
// NOT part of that contract -- importing this module for these five
// functions must not also run the whole static-CSS audit as a side effect.
export const lum = (rgb) => {
  const s = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * s(rgb[0] / 255) + 0.7152 * s(rgb[1] / 255) + 0.0722 * s(rgb[2] / 255);
};
export const cr = (a, b) => {
  const L = [lum(a), lum(b)].sort((x, y) => x - y);
  return (L[1] + 0.05) / (L[0] + 0.05);
};
export const hexRgb = (h) => {
  let s = h.replace(/^#/, "").trim();
  if (s.length === 3) s = s.split("").map((c) => c + c).join("");
  if (s.length !== 6) return null;
  const n = parseInt(s, 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
};
export const parseRgba = (s) => {
  const m = s.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (m) return [+m[1], +m[2], +m[3], m[4] !== undefined ? +m[4] : 1];
  // getComputedStyle serialises a resolved `color-mix(in srgb, ...)` as
  // `color(srgb 0.83 0.89 0.96)`, NOT as rgb() -- so every live probe that
  // composited a color-mix()ed background (the whole Soft Fill row-band
  // family) used to parse as null and get silently SKIPPED by
  // compositeStack, which then read the layer underneath instead. Found
  // 2026-08-06 by the bandDistinct check, which reported two visibly
  // different row states as byte-identical. Static token text never contains
  // this form, so the theme-side audits are unaffected either way.
  const c = s.match(/^color\(srgb\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s+([\d.eE+-]+)(?:\s*\/\s*([\d.eE+-]+))?\s*\)$/);
  if (!c) return null;
  const to255 = (v) => Math.round(Math.min(1, Math.max(0, parseFloat(v))) * 255);
  return [to255(c[1]), to255(c[2]), to255(c[3]), c[4] !== undefined ? parseFloat(c[4]) : 1];
};
export const composite = (fg, alpha, bg) => fg.map((c, i) => Math.round(alpha * c + (1 - alpha) * bg[i]));

// PERCEPTUAL color distance (CIEDE2000). Not interchangeable with cr() above:
// the WCAG ratio is a pure LUMINANCE relation and is blind to hue, so it rates
// gruvbox's green->pink link hover (#83a598 -> #d3869b) at 1.02:1, the same
// number it gives two colors that are literally identical. Anything asking
// "would a person SEE this change" — a rest state against its :hover — has to
// use deltaE2000; anything asking "is this text legible on that fill" stays on
// cr(). Reference: CIE 142-2001, kL=kC=kH=1, D65. Verified against Sharma's
// published CIEDE2000 test set (2005) -- including the four hue-discontinuity
// pairs at (50, 2.49, -0.001) vs (50, -2.49, 0.0009..0.0012), which is where a
// naive mean-hue branch goes wrong: 7.1792 / 7.1792 / 7.2195 / 7.2195, exact.
export const rgbToLab = (rgb) => {
  const s = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = rgb.map((c) => s(c / 255));
  let x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  let y = (0.2126729 * r + 0.7151522 * g + 0.0721750 * b) / 1.0;
  let z = (0.0193339 * r + 0.1191920 * g + 0.9503041 * b) / 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  [x, y, z] = [f(x), f(y), f(z)];
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
};
export const deltaE2000 = (rgb1, rgb2) => {
  const [L1, a1, b1] = rgbToLab(rgb1), [L2, a2, b2] = rgbToLab(rgb2);
  const rad = Math.PI / 180, deg = 180 / Math.PI;
  const Cb = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)));
  const ap1 = (1 + G) * a1, ap2 = (1 + G) * a2;
  const Cp1 = Math.hypot(ap1, b1), Cp2 = Math.hypot(ap2, b2);
  const hue = (bb, aa) => { if (bb === 0 && aa === 0) return 0; const h = Math.atan2(bb, aa) * deg; return h >= 0 ? h : h + 360; };
  const hp1 = hue(b1, ap1), hp2 = hue(b2, ap2);
  const dLp = L2 - L1, dCp = Cp2 - Cp1;
  let dhp = 0;
  if (Cp1 * Cp2 !== 0) { dhp = hp2 - hp1; if (dhp > 180) dhp -= 360; else if (dhp < -180) dhp += 360; }
  const dHp = 2 * Math.sqrt(Cp1 * Cp2) * Math.sin((dhp / 2) * rad);
  const Lbp = (L1 + L2) / 2, Cbp = (Cp1 + Cp2) / 2;
  let hbp;
  if (Cp1 * Cp2 === 0) hbp = hp1 + hp2;
  else if (Math.abs(hp1 - hp2) > 180) hbp = (hp1 + hp2 + (hp1 + hp2 < 360 ? 360 : -360)) / 2;
  else hbp = (hp1 + hp2) / 2;
  const T = 1 - 0.17 * Math.cos((hbp - 30) * rad) + 0.24 * Math.cos(2 * hbp * rad)
          + 0.32 * Math.cos((3 * hbp + 6) * rad) - 0.20 * Math.cos((4 * hbp - 63) * rad);
  const Sl = 1 + (0.015 * (Lbp - 50) ** 2) / Math.sqrt(20 + (Lbp - 50) ** 2);
  const Sc = 1 + 0.045 * Cbp, Sh = 1 + 0.015 * Cbp * T;
  const Rt = -Math.sin(2 * (30 * Math.exp(-(((hbp - 275) / 25) ** 2))) * rad)
           * (2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7)));
  return Math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh));
};
const resolveColor = (s, bg) => {
  s = s.trim();
  // #rgba / #rrggbbaa: hexRgb() alone returns null for both lengths, which
  // reads downstream as "unparseable" and drops the pair. Composite the alpha
  // over the background instead, the same way the rgba() branch below does.
  const a8 = s.match(/^#([0-9a-fA-F]{4}|[0-9a-fA-F]{8})$/);
  if (a8) {
    const h = a8[1].length === 4 ? a8[1].split("").map((c) => c + c).join("") : a8[1];
    const rgb = hexRgb("#" + h.slice(0, 6));
    return rgb ? composite(rgb, parseInt(h.slice(6, 8), 16) / 255, bg) : null;
  }
  if (s.startsWith("#")) return hexRgb(s);
  const r = parseRgba(s);
  return r ? composite(r.slice(0, 3), r[3], bg) : null;
};

// ---- Effective-declaration helpers (the cascade INSIDE one declaration block).
//
// `body.match(/color:.../)` returns the FIRST occurrence; a browser applies the
// LAST one, with `!important` beating every normal declaration regardless of
// order. A rule that writes a compliant `color` and then the low-contrast one
// that actually renders would therefore be audited on the DEAD declaration --
// a one-line way to walk a violation straight past the override scan below
// (Codex round-2, low 9, bypass #3). These helpers read the value that would
// actually paint instead.
function effectiveDecl(body, prop) {
  const properties = new Set(Array.isArray(prop) ? prop : [prop]);
  let normal = null, important = null;
  for (const declaration of parseDeclarations(body)) {
    if (!properties.has(declaration.property)) continue;
    if (declaration.important) important = declaration.value;
    else normal = declaration.value;
  }
  return important !== null ? important : normal;
}
const HEX_ONLY = /^#[0-9a-fA-F]{3,8}$/;
const normHex = (h) => {
  let s = h.replace(/^#/, "").toLowerCase();
  if (s.length === 3 || s.length === 4) s = s.split("").map((c) => c + c).join("");
  return "#" + s;
};
// A fill that declares no color of its own: the text still lands on whatever
// page base is underneath, so these must FALL THROUGH to the bg / bg-surface
// measurement rather than removing the rule from the scan. Skipping them was
// bypass #2 -- appending `background: transparent` to a low-contrast rule used
// to make the whole block invisible to this gate.
// `currentColor` is deliberately absent: it is a REAL fill (equal to the text
// color, i.e. 1.00:1), not an absent one, so it belongs in the unresolved
// bucket rather than being waved through to the page bases.
const NO_OWN_FILL = /^(transparent|none|initial|unset|revert|inherit)$/i;

// Known legacy violations. Format: "<scope>:<theme>:<label>". Adding a NEW theme
// that hits these same pairs would still fail the audit — only the listed
// (theme, pair) combinations are exempt.
//
// The four `btn-bg vs btn-fg` entries (solarized x2, nord-night, catppuccin-latte)
// are GONE, not moved: btn-bg is now derived to clear AA by construction, so the
// exemption has nothing left to exempt. Do not re-add an exemption for any
// fg/fill pair — if one fails, the derivation is what needs fixing.
//
// Now EMPTY, and meant to stay that way. The last two entries it carried
// ("pinboard:solarized-dark:muted vs bg-surface", "pinboard:flexoki:dark:...")
// were retired 2026-08-26 with the muted-tier audit below. Their stated
// rationale — "muted is body-text color too, so raising it for the scrollbar
// would lighten these themes' prose" — had the argument backwards twice over:
// the prose was the half sitting at 2.03-2.79:1 and needing to be lightened,
// and the scrollbar thumb no longer reads `muted` at all (it has its own
// `scrollbar-thumb` role now, _util.mjs#deriveTextTiers). Both tiers derive
// to AA; a FAIL is a derivation bug, same rule as the fg/fill pairs.
const ALLOWLIST = new Set([]);

const violations = [];
const known = [];
let skipCount = 0;
function check(scope, theme, label, ratio, min) {
  const ok = ratio >= min;
  const key = scope + ":" + theme + ":" + label;
  let flag = ok ? "OK " : "FAIL";
  if (!ok && ALLOWLIST.has(key)) flag = "KNOWN";
  const line = "  " + scope.padEnd(10) + " " + theme.padEnd(20) + " " + label.padEnd(28) + " " + ratio.toFixed(2) + ":1  (min " + min + ") " + flag;
  if (!ok && flag === "FAIL") violations.push(line);
  else if (!ok && flag === "KNOWN") known.push(line);
  return line;
}

// ============================================================
// Component-layer paired-token audit (Task 5's 5 new tokens: --{ns}-btn-fg /
// -danger-quiet-fg / -on-danger / -chip-bg / -chip-fg, plus the pre-existing
// bg/panel/btn-bg/btn-hover/danger roles they're required to pair against).
//
// CONVENIENCE LAYER, NOT THE COMPLETENESS AUTHORITY. Per spec
// docs/superpowers/specs/2026-08-03-design-uplift-design.md §4.1: this
// registry-derived static gate is a supplement to, never a replacement for,
// the INDEPENDENT hand-written render oracle (tests/render-audit-checklist.mjs,
// Task 3 -- Codex BLOCK). That file's own header states the same rule from
// its side. A gap between what this static gate happens to check and what
// the oracle checks is a SIGNAL worth noticing, not a discrepancy to silently
// paper over by generating one from the other.
//
// "Programmatic enumeration from the composer's emitted token names" (the
// literal ask) means: this file never hardcodes what VALUE a themed block
// carries for any of these roles, and never hardcodes an assumption about
// which roles a given surface/block does or doesn't declare -- both are
// read fresh, every run, out of the actual shipped CSS text via tokenDict()/
// foldSelectorBlocks() below (the same source-of-truth the rest of this file
// already audits). A token's VALUE changing, or a role simply not being
// declared in some block, therefore needs zero edits here. What genuinely
// CANNOT be derived from names alone is the pairing RELATIONSHIP itself
// (nothing about the string "chip-fg" says it must clear AA against
// "btn-hover" too, for the pressable-chip case) -- COMPONENT_PAIR_SPEC below
// is a small, hand-declared registry of those relationships, mirroring
// COMPONENTS.md §1.3/§4.3/§5.3. A genuinely NEW relationship (not just a new
// value for an already-declared one) needs one line added here, same as
// COMPONENTS.md needs a new row for a new component.
//
// Icon/stroke non-text 3:1 (WCAG 1.4.11): `border` vs `btn-bg`/`panel` WAS
// deliberately left out of this registry by Task 7 -- measured (not guessed)
// against all 13 pilots at ratios ~1.0-1.73:1 (these borders were a
// deliberate subtle-divider design choice, not an AA-derived pair Task 5
// guaranteed), so gating on it then would have either redded the whole audit
// or needed 20+ fresh allowlist entries. design-uplift Task 16 (USER RULING)
// resolved the gap the other way Task 7 flagged as the alternative: a real
// borderToAA derivation (_ui-derive.mjs) now pushes every surface's border
// to clear 3:1 against both btn-bg and panel, so the two rows below are real
// COMPONENT_PAIR_SPEC coverage, not allowlist entries -- do not re-add an
// allowlist exemption for a `border` pair; if one fails, the derivation is
// what needs fixing, same rule the four `btn-bg vs btn-fg` exemptions above
// already established for fg/fill pairs. Icon color reuses --{ns}-btn-fg
// itself (COMPONENTS §2.2, currentColor inheritance) at a WEAKER 3:1
// requirement than the 4.5:1 text pairs already below, so it's structurally
// subsumed, not skipped.
//
// Popup has no --pp-panel of its own -- bg2 IS the panel. It DID also lack
// --pp-btn-bg / --pp-btn-hover until Soft Fill (design-uplift 2026-08-05)
// gave the button family its own fill: aliasing btn-bg to bg2 now would
// audit the strip the buttons sit on instead of the buttons, i.e. silently
// check the wrong pair. Only the panel alias survives; it is what lets the
// SAME COMPONENT_PAIR_SPEC below apply to all three namespaces without a
// surface-specific copy of it.
const ROLE_ALIAS = {
  pp: { panel: "bg2" },
  opt: {},
  lib: {},
};

// [fgRole, bgRole, minRatio, onlyNs?, themedOnly?] -- role names, not literal
// --{ns}-* strings; ROLE_ALIAS resolves the per-surface literal name at lookup
// time.
// The optional 4th element restricts a row to specific namespaces (an array
// of "pp"/"opt"/"lib") when the role only exists on one surface -- without
// it, a role missing from another surface's tokenDict would FAIL there
// (strict mode) instead of correctly not applying at all.
// The optional 5th element (themedOnly) restricts a row to the themed
// [data-theme] blocks. It exists for roles whose DEFAULT-surface counterpart
// is a differently-named token, where running the row against the default
// surface does not just under-check, it checks the WRONG pair -- see the
// preset-* rows below.
const COMPONENT_PAIR_SPEC = [
  ["btn-fg", "btn-bg", 4.5],
  ["btn-fg", "btn-hover", 4.5],
  ["chip-fg", "chip-bg", 4.5],
  // Pressable chip ([aria-pressed]) swaps its hover fill for btn-hover
  // (COMPONENTS §5.3) -- token-level, so checked unconditionally rather than
  // only for surfaces that currently render a pressable chip instance.
  ["chip-fg", "btn-hover", 4.5],
  ["danger-quiet-fg", "bg", 4.5],
  ["danger-quiet-fg", "panel", 4.5],
  ["danger-quiet-fg", "btn-bg", 4.5],
  ["on-danger", "danger", 4.5],
  // warn-fg/warn-bg (debt-sweep 2026-08-08, independent review F1): both
  // come out of the same pairToAA(destroy, bg, mode) call in
  // deriveUiColors (_ui-derive.mjs) -- the foreground's lightness is
  // adjusted until it clears 4.5:1 against that exact background, so this
  // row is AA-safe by construction on every theme, not a new derivation.
  // Registered because #submit-btn.save-error now consumes this pair
  // directly (was --pp-danger on --pp-warn-bg, an unpaired combination that
  // failed on 9/13 presets + default). popup-only: options/library have no
  // warn-fg/warn-bg role at all (a single --{ns}-warn instead), so ["pp"]
  // keeps this row from FAILing every themed block over a role those two
  // surfaces never declare.
  ["warn-fg", "warn-bg", 4.5, ["pp"]],
  // Four rows below: popup-only roles (design-uplift Task 13, USER RULING --
  // Task 7's orphan guard surfaced all three as real, never-audited gaps).
  // preset-fg/tag-fg/spinner-fg have no --opt-*/--lib-* counterpart (tag
  // presets and the loading spinner are popup-specific), so ["pp"] keeps
  // this row from FAILing every options/library themed block over a role
  // that surface never declares.
  //
  // Both preset rows are themedOnly (2026-08-26). --pp-preset-bg is a
  // THEMED-layer token: the default (no-preset) surface announces the same
  // element with --pp-preset-btn-bg / --pp-preset-btn-hover-bg instead, which
  // the bespoke default-surface probe near the bottom of this file already
  // checks (5.62:1 / 4.77:1, BLOCKING). Running these two rows against the
  // default surface produced one permanent SKIP ("--pp-preset-bg not
  // declared") plus a `preset-fg vs btn-hover 4.96:1 OK` line that measured
  // the preset label against a fill .preset-btn never wears there -- a green
  // row for a pair that does not exist, i.e. worse than no row at all.
  ["preset-fg", "preset-bg", 4.5, ["pp"], true],
  // .preset-btn:hover swaps its fill to drop-hover (popup.css's generic
  // html[data-theme] .preset-btn:hover rule) while keeping the same text --
  // same pressable-hover shape as chip-fg/btn-hover above.
  ["preset-fg", "btn-hover", 4.5, ["pp"], true],
  // tag-fg/tag-bg is the pre-chip-migration role pair (COMPONENTS §5.3
  // marks --pp-chip-fg as chip-fg/chip-bg's intended replacement, but
  // popup.css:453/2016's .tag-item still reads tag-fg/tag-bg directly).
  // Verified identical to chip-fg/chip-bg on every current theme (the
  // composer copies tag-bg into chip-bg verbatim and chip-fg's derivation is
  // already an identity on tag-fg's own value everywhere), so this is pure
  // coverage -- zero derivation change needed.
  ["tag-fg", "tag-bg", 4.5, ["pp"]],
  // Loading-spinner ring: a non-text UI indicator (WCAG 1.4.11's 3:1 floor,
  // not the 4.5:1 text minimum), same class as the scrollbar-thumb-vs-track
  // check elsewhere in this file.
  ["spinner-fg", "spinner-bg", 3, ["pp"]],
  // Two rows below: `border` vs its two resting surfaces (design-uplift
  // Task 16, USER RULING -- see the block comment above this registry for
  // why Task 7 originally left these out and why the gap is now closed by
  // derivation instead of by allowlist). Same WCAG 1.4.11 3:1 non-text
  // floor as spinner-fg/spinner-bg above, all 3 surfaces (no onlyNs): every
  // one of pp/opt/lib declares --{ns}-border, and ROLE_ALIAS already maps
  // popup's btn-bg/panel to bg2 for this same registry's other rows.
  ["border", "btn-bg", 3],
  ["border", "panel", 3],
  // Two rows below: the FOCUS EDGE vs the two fills a focusable control wears
  // (design-uplift follow-up 2026-08-06, independent review F1). COMPONENTS.md
  // §7.3 has demanded ">=3:1 against the adjacent background" since it was
  // written and nothing had ever enforced it -- and after Soft Fill collapsed
  // the resting border into the fill (btn-border == btn-bg, 1.00:1), and after
  // §7.3's `bordered` placement made that border the focus indicator's core,
  // --{ns}-focus-bd became the ONLY thing carrying WCAG 1.4.11 for the whole
  // .btn family, every field and every fused shell. The old flat
  // `color-mix(accent 55%, input-bg)` default measured 1.58-2.40:1 on most
  // surfaces; focusBdToAA (_ui-derive.mjs) now derives it per theme, and these
  // two rows are what keeps it derived. Same 3:1 non-text floor as the two
  // `border` rows above, all 3 surfaces.
  //
  // --{ns}-focus-ring (the GLOW) is deliberately NOT gated: it is a blurred,
  // translucent halo whose measured contrast against any fill is a property of
  // the blur radius, not of the color -- terminal's `0 0 6px 1px rgba(...,0.4)`
  // cannot reach 3:1 at any hue and is not supposed to. Compliance lives in the
  // core (these rows); the glow carries theme identity. That split is written
  // into §7.3 so a future reader does not "fix" the omission by adding a row
  // here that no theme can pass.
  ["focus-bd", "btn-bg", 3],
  ["focus-bd", "input-bg", 3],
];

// Generic `--name: value;` extractor over an arbitrary block body -- the
// "programmatic" half of the enumeration: whatever the composer actually
// emitted into this block is what ends up in the dict, nothing assumed.
function tokenDict(body) {
  const dict = {};
  for (const { property, value } of parseDeclarations(body)) {
    if (property.startsWith("--")) dict[property.slice(2)] = value;
  }
  return dict;
}

// Folds EVERY occurrence of `<selectorSrc> { ... }` in `text` into one dict,
// later occurrences overriding earlier ones -- the real CSS cascade for a
// same-specificity selector like `:root` or `html.dark`, which is exactly
// how the default-surface baseline works: a hand-maintained block up top
// (bg/panel/btn-bg/danger/border/...) plus the generated block appended at
// the end of @generated:ui-themes (Task 5's 5 new tokens only). Folding both
// in source order reproduces what the browser actually resolves.
function foldSelectorBlocks(text, selector) {
  const dict = {};
  for (const rule of parseStyleRules(text)) {
    if (rule.context.length === 0 && rule.selectors.includes(selector)) {
      Object.assign(dict, tokenDict(rule.body));
    }
  }
  return dict;
}

// Runs COMPONENT_PAIR_SPEC against one already-parsed token dict (a themed
// block's body, or a folded default-surface dict). `strict` distinguishes
// the two block kinds Task 5 actually guarantees differently:
//  - themed `[data-theme="X"]` blocks: every role in the spec is emitted
//    together, in the SAME block, for all 13/14 presets (verified above in
//    the composer read-through) -- a MISSING role there is a real
//    regression, not a legitimate gap, so it FAILs loudly (same philosophy
//    as this file's existing metadata-fg check: "a MISSING token is itself
//    a failure").
//  - default-surface blocks (:root / html.dark): Task 5 deliberately added
//    ONLY the 5 new tokens there (visual-zero-change scope), leaving
//    whichever of bg/panel/btn-bg/btn-hover/danger/border the surface
//    already had (or didn't -- options' default surface has no
//    --opt-btn-bg/--opt-btn-hover at all yet, pre-Task-9). A missing role
//    there is an intentional, in-scope-elsewhere gap, so it SKIPs (printed,
//    non-blocking, counted in skipCount) instead of failing. Callers of the
//    non-strict path MUST guard against the fold itself coming back empty or
//    missing its sentinel role first (see auditComponentPairsDefault) --
//    otherwise every pair here degrades to a silent SKIP and this function
//    alone can't tell "legitimately not-yet-wired" apart from "the caller's
//    selector regex matched nothing at all".
function auditComponentPairs(scope, ns, blockLabel, dict, strict) {
  const alias = ROLE_ALIAS[ns] || {};
  const roleKey = (role) => `${ns}-${alias[role] || role}`;
  const roleRaw = (role) => dict[roleKey(role)];
  // chip-bg/tag-bg carry a raw palette fill that isn't always plain hex --
  // "transparent" for 9/13 pilots (COMPONENTS §5.3/Task 5 deliberately does
  // not solidify it) and terminal's spinner-bg is an 8-digit alpha hex (a
  // translucent glow, #33ff3340). What the composer actually AA-corrects
  // chip-fg/tag-fg/spinner-fg against is what that fill composites to over
  // the surface's own panel (resolveOpaqueBg, _ui-derive.mjs) — reusing that
  // exact function here (not re-implementing it) so a non-solid bg resolves
  // to the same solid color the derivation used, instead of reading as an
  // unparseable, audit-breaking value.
  const panelRaw = roleRaw("panel");
  const panelRgb = panelRaw && isHex(panelRaw) ? hexRgb(panelRaw) : null;
  const COMPOSITE_OVER_PANEL = new Set(["chip-bg", "tag-bg", "spinner-bg"]);
  const resolveRole = (role) => {
    const raw = roleRaw(role);
    if (!raw) return { rgb: null, note: `--${roleKey(role)} not declared` };
    if (isHex(raw)) return { rgb: hexRgb(raw), note: null };
    if (COMPOSITE_OVER_PANEL.has(role) && panelRgb) return { rgb: resolveOpaqueBg(raw, panelRgb), note: null };
    return { rgb: null, note: "non-hex value" };
  };
  for (const [fgRole, bgRole, min, onlyNs, themedOnly] of COMPONENT_PAIR_SPEC) {
    if (onlyNs && !onlyNs.includes(ns)) continue; // role doesn't exist on this surface -- not a gap, just N/A
    if (themedOnly && !strict) continue; // themed-layer role; the default surface names the same pair differently

    const label = `${fgRole} vs ${bgRole}`;
    const fg = resolveRole(fgRole), bg = resolveRole(bgRole);
    if (!fg.rgb || !bg.rgb) {
      const why = fg.note || bg.note;
      const line = "  " + scope.padEnd(10) + " " + blockLabel.padEnd(20) + " " + label.padEnd(28) + " " + (strict ? "FAIL (" + why + ")" : "SKIP (" + why + ")");
      console.log(line);
      if (strict) violations.push(line);
      else skipCount++;
      continue;
    }
    console.log(check(scope, blockLabel, label, cr(fg.rgb, bg.rgb), min));
  }
}

// Orphan guard: every *-fg / on-* shaped custom property this surface's
// @generated:ui-themes region actually emits should be a role this file
// provably checks -- otherwise a new fg/on- token can ship with zero
// contrast coverage from this door and nothing here would ever notice.
//
// "Provably checks" means membership in COMPONENT_PAIR_ROLES, a Set built
// straight from COMPONENT_PAIR_SPEC's own fg/bg role columns -- a real data
// structure this file's OWN pair-checking loop consumes, not prose. An
// earlier version of this guard instead grepped this file's own source text
// for the token name as a double-quoted string literal, on the theory that
// grab()/[fgK,bgK,label] array checks all leave that trace too. Review
// caught the structural hole in that: the SAME text-scan can't tell a real
// check from a COMMENT that happens to quote the token name -- and the
// --pp-info-fg allowlist entry's own rationale comment quoted "info-fg"
// twice, which meant that entry (and the ALLOWLIST removal RED-test
// contract it's supposed to gate) was silently dead code, matching the
// exact silent-degrade failure class Important 1 exists to prevent. Roles
// NOT in COMPONENT_PAIR_SPEC (warn-fg/banner-fg/ok-fg/offline-fg/on-accent/
// row-selected-fg -- genuinely audited by the ad-hoc checks above, just not
// via the pair-spec mechanism) now need an explicit ORPHAN_ALLOWLIST entry
// too, same as a true gap; that's a deliberate loss of the old proxy's
// "credit for the ad-hoc checks automatically" convenience in exchange for
// an allowlist that can never be fooled by a comment.
const COMPONENT_PAIR_ROLES = new Set(COMPONENT_PAIR_SPEC.flatMap(([fg, bg]) => [fg, bg]));
const ORPHAN_ALLOWLIST = new Set([
  // --pp-preset-fg / --pp-tag-fg / --pp-spinner-fg: formerly parked here as
  // real-but-unaudited gaps (Task 7's orphan guard surfaced all three).
  // design-uplift Task 13 (USER RULING) resolved them -- preset-fg is now
  // AA-derived (popup-chrome.mjs, fgToAAMulti against preset-bg/drop-hover)
  // and spinner-fg against the 3:1 UI-component floor (fgToAA vs
  // spinner-bg); tag-fg needed no derivation change, already identical to
  // chip-fg's AA-safe value on every theme. All three are real
  // COMPONENT_PAIR_SPEC rows now (["pp"]-scoped), not allowlist entries.
  // --pp-info-fg: NOT an independent color -- emitPp emits it unconditionally
  // as the literal string `var(--pp-banner-fg)` for every theme (popup-
  // chrome.mjs's `set("info-fg", "var(--pp-banner-fg)")`), so it is
  // banner-fg by construction, every theme, no exceptions. banner-fg IS
  // audited (the warn/banner/ok/offline loop in auditCssThemes, allowlisted
  // below on its own terms) -- checking "info-fg" would just re-run the
  // identical banner-fg×banner-bg comparison under a different label, not
  // add real coverage. A genuine alias, not a gap.
  "pp:info-fg",
  // --pp-banner-fg / --pp-ok-fg / --pp-offline-fg: audited by the
  // warn/banner/ok/offline loop in auditCssThemes (grab(fgK) against
  // grab(bgK), BLOCKING, pairToAA-guaranteed) -- real coverage, just not
  // expressed as a COMPONENT_PAIR_SPEC role (that loop predates this task).
  // --pp-warn-fg graduated out of this list (debt-sweep 2026-08-08): it's a
  // real COMPONENT_PAIR_SPEC row now (#submit-btn.save-error consumes it
  // directly), so COMPONENT_PAIR_ROLES already short-circuits it above --
  // leaving the allowlist entry here would have been unreachable dead code,
  // exactly the failure shape this guard's own history warns about.
  "pp:banner-fg",
  "pp:ok-fg",
  "pp:offline-fg",
  // --pp-on-accent: audited by the dedicated "on-accent vs accent" check in
  // auditCssThemes (varPrefix === "--pp" branch) -- real coverage, same
  // "predates this task's role registry" reason as the four above.
  "pp:on-accent",
  // --lib-row-selected-fg: audited by the "row-selected-fg vs
  // row-selected-bg" check in auditLibraryThemes -- real coverage, not a
  // COMPONENT_PAIR_SPEC role.
  "lib:row-selected-fg",
]);
function generatedRegion(text) {
  const start = text.indexOf("@generated:ui-themes start");
  const end = text.indexOf("@generated:ui-themes end");
  return start === -1 || end === -1 ? text : text.slice(start, end);
}
function auditOrphanTokens(scope, ns, cssText) {
  const region = generatedRegion(cssText);
  const re = new RegExp(`--${ns}-([a-z0-9]+(?:-[a-z0-9]+)*-fg|on-[a-z0-9-]+)\\s*:`, "g");
  const names = new Set();
  let m;
  while ((m = re.exec(region)) !== null) names.add(m[1]);
  for (const name of names) {
    if (COMPONENT_PAIR_ROLES.has(name)) continue;
    if (ORPHAN_ALLOWLIST.has(`${ns}:${name}`)) continue;
    const line = "  " + scope.padEnd(10) + " " + "orphan".padEnd(20) + " " + (`--${ns}-${name}`).padEnd(28) + " FAIL (not a COMPONENT_PAIR_SPEC role, not in ORPHAN_ALLOWLIST)";
    console.log(line);
    violations.push(line);
  }
}

// ============================================================
// Pilot overrides.css: hardcoded text colors that punch THROUGH the token gate.
//
// Everything above this point audits TOKENS. A pilot's `tokens.overrides.css`
// is appended verbatim after the composer's own output (compose-theme.mjs), at
// equal-or-higher specificity and later in source -- so a single hardcoded
// `color:` there silently wins over an AA-derived token and the token audit
// still reports green. That is not hypothetical: flexoki:dark's `.edit_links a`
// sat at 2.03:1 because an override pinned it to #575653 while the token it was
// supposed to read had been fine all along. Fixing the derivation without this
// scan would have moved the numbers in this file and nothing on screen.
//
// Rule: a hardcoded `color: #rrggbb` in an override is DEBT when it clears
// 4.5:1 against NEITHER the theme's `bg` NOR its `bg-surface` -- i.e. there is
// no base surface on the page where that text would be legible. Deliberately
// the conservative form of the question: "fails against one of the two" would
// red dozens of colors that are only ever painted on the base they pass on.
// `html.<mode-trigger>`-prefixed rules are measured against that mode's merged
// palette, not the base one.
//
// Excluded, by ROLE rather than by theme (so a new pilot inherits the same
// exclusions and none of the exemptions):
//   - non-text glyphs (.star / .selected_star) and ::before/::after decoration,
//     which are 1.4.11 shapes at most, not 1.4.3 text;
//   - submit/button labels, which sit on the control's own FILL (audited as
//     btn-bg vs btn-fg in auditPalette) rather than on bg/bg-surface.
//
// A rule that declares its own `background` used to be excluded for that same
// reason, and that exclusion had a hole: it assumed some OTHER row already
// covers the fill it names. True for the btn family, false for everything
// else. flexoki:dark's `a.help { color:#6B6963; background:#282726 }` and
// `a.sort_order_selected { background:#343331; color:#8B7EC8 }` are ordinary
// text on ordinary fills that no COMPONENT_PAIR_SPEC row mentions, and they
// were invisible to all 12 gates: the token audit measures `muted-soft`, which
// the override replaces, and this scan skipped the rule entirely. So a
// self-declared background is now MEASURED instead of waved through:
//   - a plain hex fill    -> exactly that pair, 4.5:1;
//   - `transparent`/`none`/`inherit`/... -> no fill of its own, so the rule
//     falls through to the page bases (bypass #2: `background: transparent`
//     used to delete the rule from this scan);
//   - `rgba()/rgb()`      -> composited over each page base, then measured;
//   - anything else (gradient / url() / var() fill) -> recorded as an
//     UNRESOLVED identity, which the baseline below then has to carry
//     explicitly. Never a silent skip: an unmeasurable pair is
//     indistinguishable from a passing one, which is how holes ship green.
// A `color: var(--pinboard-*)` is deliberately NOT scanned -- it reads the
// token layer this file already audits (auditPalette, including the on-<fill>
// rows that cover terminal's three `color: var(--pinboard-bg)` chips, whose
// accent fill is painted by the composer and not by the override), so
// measuring it here against the page bases would invent 1.00:1 false
// positives for text that never lands there. This scan is for hardcoded
// literals that punch THROUGH the token gate; a var() does not punch through.
//
// Gate shape: a RATCHET keyed on IDENTITY, not on a count. The inherited debt
// is printed in full every run, and the run FAILS on any entry that is not in
// contrast-debt-baseline.json -- so "delete one violation, add a different
// one" (Codex round-2, low 9, bypass #1: the count stayed at 40 and the gate
// stayed green) now reds the run. The listed lines stay visible instead of
// being spelled out as per-theme exemptions that read as settled decisions
// (the exact failure mode the ALLOWLIST comment above documents). Lowering
// the baseline is a per-theme design pass on the listed selectors -- most of
// them predate the token system and simply restate a muted tier that the
// composer now derives correctly on its own.
//
// 40 -> 41 on 2026-08-26: -1 (paper-ink's `.edit_links a { color:#aaa }` deleted,
// so that link finally reads the derived muted-soft tier) +2 (the two flexoki:dark
// own-background rules the exemption above used to hide). Net +1, and the two new
// lines are newly VISIBLE debt, not newly CREATED debt -- they have been shipping
// at 2.72:1 and 3.56:1 all along.
const OVERRIDE_SCAN_SKIP_SELECTOR = [
  /(^|[\s,>])\.(star|selected_star)\b/,      // decorative glyph, not text
  /input\[type="(submit|button)"\]/,          // label sits on the control fill
  /::(selection|before|after)\b/,             // decoration / selection fill
];
const overrideDebt = [];
function auditOverrideTextColors(baseSlug, tokens) {
  const css = tokens.overrides?.css || "";
  if (!css) return;
  const base = tokens.palette || {};
  const modes = Object.values(tokens.modes || {})
    .filter((m) => m?.trigger && m?.palette)
    .map((m) => [m.trigger, { ...base, ...m.palette }]);
  for (const rule of parseStyleRules(css)) {
    const sel = rule.selectorText;
    const body = rule.body;
    if (!sel) continue;
    if (OVERRIDE_SCAN_SKIP_SELECTOR.some((r) => r.test(sel))) continue;
    const colorRaw = effectiveDecl(body, "color");
    if (!colorRaw) continue;
    if (/^var\(/i.test(colorRaw)) continue;          // token read, not a hardcoded punch-through
    const hit = modes.find(([trigger]) => sel.includes(trigger));
    const pal = hit ? hit[1] : base;
    const slug = hit ? `${baseSlug}:${hit[0]}` : baseSlug;
    const bg = hexRgb(pal.bg || "");
    const bgSurface = hexRgb(pal["bg-surface"] || pal.bg || "");
    const colorKey = HEX_ONLY.test(colorRaw) ? normHex(colorRaw) : colorRaw.replace(/\s+/g, "");
    const add = (basis, detail) => overrideDebt.push({
      id: [slug, sel, colorKey, basis].join(" | "),
      line: "  " + slug.padEnd(24) + colorRaw.padEnd(10) + detail + "  " + sel,
    });

    // Which surface(s) can this text actually land on?
    const bgRaw = effectiveDecl(body, ["background", "background-color"]);
    let basis, bases;
    if (!bgRaw || NO_OWN_FILL.test(bgRaw)) {
      basis = "page";
      bases = [bg, bgSurface].filter(Boolean);
    } else if (HEX_ONLY.test(bgRaw)) {
      basis = "own " + normHex(bgRaw);
      bases = [hexRgb(bgRaw)].filter(Boolean);
    } else if (/^rgba?\(/i.test(bgRaw)) {
      // Translucent fill: what the eye sees is the fill composited over the
      // page base beneath it, so measure both landings, same rule as `page`.
      basis = "own " + bgRaw.replace(/\s+/g, "");
      bases = [bg, bgSurface].filter(Boolean).map((b) => resolveColor(bgRaw, b)).filter(Boolean);
    } else {
      add("unresolved-bg", "  UNRESOLVED fill " + bgRaw.replace(/\s+/g, " ").slice(0, 30));
      continue;
    }
    if (!bases.length) { add("unresolved-base", "  UNRESOLVED page base (palette has no bg)"); continue; }

    const ratios = bases.map((b) => { const f = resolveColor(colorRaw, b); return f ? cr(f, b) : null; });
    if (ratios.some((r) => r === null)) { add("unresolved-color", "  UNRESOLVED color"); continue; }
    if (ratios.some((r) => r >= 4.5)) continue;      // legible on some base it can land on
    const nums = ratios.map((r) => r.toFixed(2)).join("/");
    add(basis, basis === "page"
      ? nums + " (bg/bg-surface)"
      : nums.padEnd(11) + "(own background) ");
  }
}

// ============================================================
// State delta: does :hover actually LOOK different from rest?
//
// The blind spot this closes, in one sentence: every gate above measures a
// foreground against a background, and nothing measured a color against the
// color it replaces. On 2026-08-26 the muted tiers were raised to AA and the
// `.edit_links a:hover` colors pinned in five pilot overrides were left where
// they were; on solarized-dark rest and hover became the SAME hex and the
// bookmark edit/delete links stopped reacting to the mouse entirely. All 12
// gates stayed green, because "rest vs hover" was not a question any of them
// asked.
//
// Three deliberate choices:
//
//  1. Measured in ΔE2000, not in WCAG contrast. Contrast ratio is a luminance
//     relation: it scores gruvbox's green->pink link hover at 1.02:1 — the same
//     as no change at all — so a ratio gate here would either miss every
//     hue-only hover or red every one of them. See deltaE2000 at the top.
//  2. Measured on the COMPOSED CSS (composeTheme + the pilot's overrides), not
//     on tokens. The regression lived entirely in override text that punches
//     through the token layer; a token-level version of this check would have
//     reported green right through it.
//  3. Pairs are ENUMERATED from the CSS, not hand-listed. Every rule whose
//     selector carries `:hover` and declares a `color` is paired with the same
//     selector minus `:hover`; a hand-written registry would only ever cover
//     selectors someone already thought to look at, which is how this class of
//     defect hides.
//
// Excluded: hover rules that also change background / opacity / text-decoration
// / border / shadow / weight. Those have a second feedback channel, so a small
// color step there is a style choice, not a dead state (#tag_cloud_header's
// 7px sort arrows go 0.7 -> 1.0 opacity, `a.bookmark_title:hover` underlines).
// The union of every rule matching a selector is what gets inspected, so an
// override that restates only the color cannot strip a channel the composer
// declared.
//
// Threshold: ΔE2000 >= 6. Measured, not picked — across all 14 rendered
// palettes the corpus splits into an empty band: every intentional hover step
// lands at 6.89 or higher, every flat-or-nearly-flat one at 4.27 or lower.
// (For scale, ~2.3 is the classic just-noticeable difference; 6 is "obviously
// a different color" without demanding a design change from themes whose hover
// is a deliberate small step.)
//
// Ratchet, not a hard zero, for the same reason as the override scan above:
// the 11 inherited entries are real dead hovers (nord-night's `link-hover`
// falls back to `accent`, so three of its link rules hover to their own color;
// terminal steps #33ff33 -> #66ff66 at 3.9) but fixing them is a per-theme
// design pass, not a drive-by. Keyed on (theme, selector) in
// contrast-debt-baseline.json -- a rule not on that list may not go flat, and
// swapping one dead hover for another no longer nets out to zero.
//
// The pair is keyed WITHOUT the two colors on purpose (unlike the override
// scan, which keys on the color): rest/hover here resolve through the token
// layer, so every derivation tweak would rewrite the id of a debt entry that
// did not change in nature. The selector is what identifies "this control's
// hover is dead"; the colors print on the line for the reader.
const STATE_DELTA_MIN_DE = 6;
const STATE_OTHER_CHANNEL = /(?:^|[;\s])(background|opacity|text-decoration|border|outline|box-shadow|transform|font-weight|filter|text-shadow)(?:-[a-z]+)?\s*:/;
const stateDebt = [];
const rgbHex = (rgb) => "#" + rgb.map((c) => c.toString(16).padStart(2, "0")).join("");

function auditStateDeltas(baseSlug, tokens) {
  const css = composeTheme(tokens, compose);
  const triggers = Object.values(tokens.modes || {}).map((m) => m?.trigger).filter(Boolean);
  const scopes = ["", ...triggers];
  const vars = {}, colorOf = {}, bodyOf = {};
  for (const s of scopes) { vars[s] = {}; colorOf[s] = new Map(); bodyOf[s] = new Map(); }
  for (const rule of parseStyleRules(css)) {
    const body = rule.body;
    for (const part of rule.selectors) {
      // composeTheme rewrites a mode's `:root` into the bare trigger and
      // prefixes every other selector with `<trigger> `.
      let scope = "", sel = part;
      for (const t of triggers) {
        if (part === t) { scope = t; sel = ":root"; break; }
        if (part.startsWith(t + " ")) { scope = t; sel = part.slice(t.length + 1); break; }
      }
      if (sel === ":root") {
        for (const declaration of parseDeclarations(body)) {
          if (declaration.property.startsWith("--pinboard-")) {
            vars[scope][declaration.property.slice("--pinboard-".length)] = declaration.value;
          }
        }
        continue;
      }
      // effectiveDecl, not `.match()`: same last-wins / !important cascade the
      // override scan above needs, and for the same reason -- a rule that
      // restates `color` twice would otherwise be compared on the dead half.
      const cv = effectiveDecl(body, "color");
      if (cv) colorOf[scope].set(sel, cv);
      bodyOf[scope].set(sel, (bodyOf[scope].get(sel) || "") + ";" + body);
    }
  }
  for (const scope of scopes) {
    const colors = scope ? new Map([...colorOf[""], ...colorOf[scope]]) : colorOf[""];
    const bodies = scope ? new Map([...bodyOf[""], ...bodyOf[scope]]) : bodyOf[""];
    const slug = scope ? `${baseSlug}:${scope}` : baseSlug;
    const resolve = (value) => {
      let v = String(value).trim();
      for (let i = 0; i < 4; i++) {
        const m = v.match(/^var\(\s*--pinboard-([a-z0-9-]+)\s*\)$/);
        if (!m) break;
        v = String(vars[scope][m[1]] ?? (scope ? vars[""][m[1]] : "") ?? "").trim();
      }
      return hexRgb(v);
    };
    for (const [sel, hoverVal] of colors) {
      if (!sel.includes(":hover")) continue;
      const rest = sel.replace(/:hover/g, "");
      if (!colors.has(rest)) continue;                       // no resting rule -> no pair to compare
      if (STATE_OTHER_CHANNEL.test(bodies.get(sel) || "")) continue;
      const a = resolve(colors.get(rest)), b = resolve(hoverVal);
      if (!a || !b) {
        // Never a silent skip: an unresolvable pair is indistinguishable from a
        // passing one, and that is precisely how the last two holes shipped green.
        const line = "  pinboard  " + slug + "  " + sel + "  UNRESOLVED (" + colors.get(rest) + " -> " + hoverVal + ")  FAIL";
        console.log(line);
        violations.push(line);
        continue;
      }
      const de = deltaE2000(a, b);
      if (de >= STATE_DELTA_MIN_DE) continue;
      stateDebt.push({
        id: [slug, sel].join(" | "),
        line: "  " + slug.padEnd(24) + de.toFixed(2).padStart(6) + "  " +
          rgbHex(a) + " -> " + rgbHex(b) + "  " + sel,
      });
    }
  }
}

// ============================================================
// Identity ratchet for the two debt lists above (override text / dead hovers).
//
// WHY IDENTITIES AND NOT A COUNT. Both lists used to gate on `length <= MAX`.
// A count answers "how much debt is there", which is not the question the gate
// is asked: three separate edits slip past it (Codex round-2, low 9) --
// delete one violation and add a different one (count unchanged), and the two
// scanner bypasses that the effectiveDecl / NO_OWN_FILL work above closes.
// The set of (theme, selector, ...) identities answers the real question --
// "is every violation still one we already knew about" -- so the gate now
// FAILs on any entry the baseline does not name, whatever the total.
//
// THE BASELINE IS DEBT, NOT APPROVAL. Every id in contrast-debt-baseline.json
// is a real sub-AA color or a real dead hover that ships today. It is checked
// in so the ratchet has something to compare against and so the list is
// reviewable in a diff -- not because those lines are fine.
//
// HOW TO LOWER IT (the intended direction, no flag ceremony):
//   1. fix the theme (edit the pilot's overrides / palette),
//   2. `node docs/theme-surface/tools/contrast-audit.mjs`  -> prints the ids
//      that are now STALE (fixed, still listed),
//   3. `node docs/theme-surface/tools/contrast-audit.mjs --update-baseline`
//      -> prunes exactly those, refusing to add anything new,
//   4. commit the pilot change and the baseline together.
//
// HOW TO RAISE IT (deliberate, and it should be rare): only when a scanner
// change makes debt that was ALREADY SHIPPING newly visible -- the +2
// flexoki:dark own-background lines of 2026-08-26 are the canonical example.
// `--update-baseline --accept-new` is the only path that writes an addition,
// it prints every id it adds, and the diff is the review. It is NOT the way
// to land a new low-contrast color: that is a design change, and the answer
// there is to pick a color that clears 4.5:1.
const BASELINE_PATH = resolve(__dirname, "contrast-debt-baseline.json");
function loadBaseline() {
  // No fallback to "empty baseline": a missing or malformed file would turn
  // the whole ratchet into a silent no-op that still exits 0, which is the
  // one failure mode this gate exists to prevent.
  const raw = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
  for (const k of ["overrideText", "hoverState"]) {
    if (!Array.isArray(raw[k])) throw new Error(`contrast-debt-baseline.json: "${k}" must be an array of ids`);
  }
  return raw;
}
// Compares one debt list against its baseline slice. Returns the ids that are
// present now (for --update-baseline) plus what changed either way.
function ratchetIdentities(kind, entries, baselineIds, writeMode) {
  const current = new Map(entries.map((e) => [e.id, e.line]));
  const baseSet = new Set(baselineIds);
  const added = [...current.keys()].filter((id) => !baseSet.has(id));
  const stale = baselineIds.filter((id) => !current.has(id));
  if (added.length && !writeMode) {
    for (const id of added) {
      const line = "  " + kind.padEnd(10) + " NEW (not in contrast-debt-baseline.json)  " + id;
      console.log(line);
      violations.push(line);
    }
    console.log("  FAIL — " + added.length + " unlisted " + kind + " entr" + (added.length === 1 ? "y" : "ies") +
      ". Fix the theme, or (only for debt that was already shipping) run with --update-baseline --accept-new.");
  }
  if (stale.length) {
    console.log("  (" + stale.length + " baseline id(s) no longer reproduce — run --update-baseline to prune:)");
    for (const id of stale) console.log("      " + id);
  }
  return { ids: [...current.keys()].sort(), added, stale };
}

// CLI runner. Wrapped in main() + a direct-execution guard so importing this
// module for the pure functions above (scripts/ui-render-audit.mjs) does not
// also execute the whole static-CSS audit and process.exit() out from under
// the importer -- `node docs/theme-surface/tools/contrast-audit.mjs` run
// directly still prints the full audit and exits 0/1 as before.
function main() {
console.log("=== 1. Pinboard.in tokens (pilots/*.tokens.json) ===");
const pinFiles = readdirSync(PILOTS).filter((f) => f.endsWith(".tokens.json")).sort();
for (const f of pinFiles) {
  const baseSlug = f.replace(/\.tokens\.json$/, "");
  const t = JSON.parse(readFileSync(resolve(PILOTS, f), "utf8"));
  // Every palette the composer will actually render: the base, plus one per
  // `modes.<name>` (compose-theme.mjs re-runs the composer with the mode merged
  // over the base). Auditing only the base hid flexoki's dark mode at 4.37:1 —
  // a whole rendered palette that no gate had ever looked at.
  const palettes = [[baseSlug, t.palette || {}]];
  for (const [name, mode] of Object.entries(t.modes || {})) {
    if (mode?.palette) palettes.push([`${baseSlug}:${name}`, { ...t.palette, ...mode.palette }]);
  }
  for (const [slug, rawPalette] of palettes) auditPalette(slug, rawPalette);
  // Same pilot, the other half of the question: what do this theme's raw
  // override rules pin on top of the tokens just audited.
  auditOverrideTextColors(baseSlug, t);
  // ...and the third question neither of the two above can ask: once tokens
  // and overrides have both landed, does anything still CHANGE on hover.
  auditStateDeltas(baseSlug, t);
}

function auditPalette(slug, rawPalette) {
  // expandSitePalette, NOT the raw pilot: btn-bg and the on-<fill> tokens are
  // DERIVED there (see _util.deriveContrast). Auditing the raw pilot was the
  // coverage hole that let 22 sub-AA pairs ship behind a green audit.
  // SITE variant specifically, because _base.mjs -- the only emitter of
  // --pinboard-* -- is what this section audits: the tag-fg / url-link-fg /
  // destroy floors live there and NOT in the shared expandPalette (which the
  // popup/options/library sections below reach through their own shipped CSS).
  // Auditing the shared expansion here would measure values pinboard.in never
  // receives.
  const p = expandSitePalette(rawPalette);
  const bg = hexRgb(p["bg"] || "");
  const fg = hexRgb(p["fg"] || "");
  const bgSurface = hexRgb(p["bg-surface"] || p["bg"] || "");
  const btnBg = hexRgb(p["btn-bg"] || p["accent"] || "");
  const btnBgHover = hexRgb(p["btn-bg-hover"] || p["link-hover"] || p["accent-hover"] || p["btn-bg"] || p["accent"] || "");
  const btnFg = hexRgb(p["btn-fg"] || "");
  const muted = hexRgb(p["muted"] || "");
  const mutedSoft = hexRgb(p["muted-soft"] || p["muted"] || "");
  const thumb = hexRgb(p["scrollbar-thumb"] || p["muted"] || "");
  // WCAG AA threshold (4.5:1) for body text. AAA-grade themes will exceed this naturally.
  if (bg && fg) console.log(check("pinboard", slug, "bg vs fg", cr(bg, fg), 4.5));
  // ...and the SAME body text on the elevated surface. For a card-style pilot
  // every .bookmark is painted `bg-surface`, so the description under each
  // bookmark title never touches `bg` at all — yet `bg vs fg` was the only
  // primary-text row this file had until 2026-08-26, which is how
  // solarized-dark shipped prose at 4.11:1 (and solarized-light at 4.39:1)
  // while the secondary tier right next to it was being held to 4.5:1. Both
  // fg tiers derive to AA against both bases now (_util.mjs#deriveTextTiers),
  // so a FAIL here is a derivation bug, never an allowlist entry.
  if (bgSurface && fg) console.log(check("pinboard", slug, "bg-surface vs fg", cr(bgSurface, fg), 4.5));
  const fgStrong = hexRgb(p["fg-strong"] || "");
  if (bgSurface && fgStrong) console.log(check("pinboard", slug, "bg-surface vs fg-strong", cr(bgSurface, fgStrong), 4.5));
  // Button text must clear AA against its hand-tuned btn-bg. Composer falls back btn-bg -> accent
  // when btn-bg unset, so this also catches the terminal-style accent==btn-fg crash since the
  // effective button bg would equal accent and contrast against btn-fg would collapse.
  if (btnBg && btnFg) console.log(check("pinboard", slug, "btn-bg vs btn-fg", cr(btnBg, btnFg), 4.5));
  // Hover state: btn-bg-hover must also keep the label readable (same regression class as terminal accent==btn-fg).
  if (btnBgHover && btnFg) console.log(check("pinboard", slug, "btn-bg-hover vs btn-fg", cr(btnBgHover, btnFg), 4.5));
  // Right-bar submits (subscribe / tweet search) are their own declared family.
  // Their :hover was the worse half — nord-night sat at 2.34:1 — and no gate saw
  // either state while the fill lived in an override instead of a token.
  const sbBg = hexRgb(p["sidebar-btn-bg"] || ""), sbFg = hexRgb(p["sidebar-btn-fg"] || "");
  const sbHover = hexRgb(p["sidebar-btn-bg-hover"] || "");
  if (sbBg && sbFg) console.log(check("pinboard", slug, "sidebar-btn-bg vs fg", cr(sbBg, sbFg), 4.5));
  if (sbHover && sbFg) console.log(check("pinboard", slug, "sidebar-btn-hover vs fg", cr(sbHover, sbFg), 4.5));
  // The two muted TEXT tiers (BLOCKING, 4.5:1) against BOTH bases the composer
  // paints them on: the page bg and the elevated bg-surface that card-style
  // pilots give every .bookmark. Nothing here checked either tier as text until
  // 2026-08-26 — the one row this file carried for `muted` was the 3:1 NON-text
  // scrollbar check below, and its two allowlist entries read as if the whole
  // question had been settled. It had not: `muted` carries h2, the settings
  // tabs, #right_bar headings and the sort table's edit links, `muted-soft`
  // carries the footer/colophon, the per-bookmark edit/copy links and
  // #tag_cloud_header — all of it text with information in it, shipping at
  // 1.69-4.47:1 on most presets. Both tiers are derived to AA now
  // (_util.mjs#deriveTextTiers), so a FAIL here is a derivation bug, not a
  // theme that needs an exemption.
  for (const [key, rgb] of [["muted", muted], ["muted-soft", mutedSoft]]) {
    if (!rgb) continue;
    if (bg) console.log(check("pinboard", slug, `${key} vs bg`, cr(bg, rgb), 4.5));
    if (bgSurface) console.log(check("pinboard", slug, `${key} vs bg-surface`, cr(bgSurface, rgb), 4.5));
  }
  // TIER ORDER (BLOCKING). AA floors alone cannot express "secondary text must
  // not out-shout the body text it sits under": raising `muted`/`muted-soft`
  // to 4.5:1 is free to push them PAST `fg`, and on solarized-dark it did —
  // #93a1a1 secondary over #839496 prose, i.e. the edit links under a bookmark
  // rendering brighter than the bookmark's own description on a dark theme.
  //
  // Written as a CHECK, not as a clamp inside deriveTextTiers, on purpose. A
  // clamp has exactly one lever (push the secondary tier back down), and the
  // only place it can push it to is below the 4.5:1 floor it was just raised
  // to — trading a visible inversion for an invisible AA failure. When this
  // row fails, the palette's own ramp is too narrow and the fix is upstream:
  // move `fg` further from the background, or pull `bg-surface` closer to
  // `bg` so the whole text ramp gets room.
  for (const [key, rgb] of [["muted", muted], ["muted-soft", mutedSoft]]) {
    if (!rgb || !bg || !fg) continue;
    const cFg = cr(bg, fg), cTier = cr(bg, rgb);
    if (cTier > cFg + 1e-9) {
      const line = `  pinboard  ${slug}  ${key} outranks fg  ${cTier.toFixed(2)} > ${cFg.toFixed(2)} (vs bg)  FAIL (secondary text brighter than body text — widen fg/bg-surface, do not lower ${key})`;
      console.log(line);
      violations.push(line);
    }
  }
  // Scrollbar thumb visibility against its track (composer paints
  // ::-webkit-scrollbar-thumb / scrollbar-color with `scrollbar-thumb` on
  // `bg-surface`). 3:1 — a UI component, not text, which is precisely why it
  // stopped sharing a token with the prose tier above.
  if (bgSurface && thumb) console.log(check("pinboard", slug, "scrollbar-thumb vs track", cr(bgSurface, thumb), 3));

  // Text on the SHARED colored fills. btn-fg only ever sits on btn-bg; the page-nav
  // chip, the RSS hover chip and the right_bar/tweet submit buttons paint with
  // accent / link-hover / success and take their own derived on-<fill> token.
  // Checking btn-bg alone missed all of these — nord-night's selected page-nav chip
  // shipped at 1.74:1. Each on-token also has to clear its fill's :hover variant,
  // since a fill and its hover share one text color.
  for (const [fillKey, onKey] of [
    ["accent", "on-accent"],
    ["link-hover", "on-link-hover"],
  ]) {
    const fill = hexRgb(p[fillKey] || ""), on = hexRgb(p[onKey] || "");
    if (fill && on) console.log(check("pinboard", slug, `${onKey} vs ${fillKey}`, cr(fill, on), 4.5));
  }

  // The three SEMANTIC ink roles (BLOCKING, 4.5:1). a.tag, the a.url_link pill
  // and a.delete / a.destroy / a.tag.selected are ordinary body-adjacent TEXT
  // and had no contrast gate of ANY kind until 2026-08-27 -- expandPalette gave
  // each one a fallback (`tag-fg || accent`, `url-link-fg || fg`) and stopped
  // there. Nine sub-AA landings were shipping across the 14 rendered palettes,
  // invisible here because these rows did not exist and invisible to
  // auditOverrideTextColors below because the composer reads them through
  // var(), which that scan deliberately skips.
  //
  // Base per role is the composer's ACTUAL emission (classic-list-v2.mjs), not
  // the token's name -- `a.tag` declares `background: transparent`, so `tag-bg`
  // is NOT its fill and gating tag-fg against tag-bg would check a pair the
  // site never paints (that pair is real on the POPUP surface only, where
  // .tag-item does fill with it -- see COMPONENT_PAIR_SPEC's ["tag-fg",
  // "tag-bg", 4.5, ["pp"]] row, a different surface and a different question).
  // `a.url_link` is the one of the three with a fill of its own.
  //
  // All three derive to AA in _util.mjs#expandSitePalette, so a FAIL here is a
  // derivation bug, never an allowlist entry -- same rule as the fg/muted tiers
  // above and the fg/fill pairs before them. A MISSING token is itself a
  // failure: after expandPalette every one of the three is guaranteed present
  // (destroy is schema-required; the other two have fallback chains), so a
  // silent skip here could only mean the expansion contract broke.
  for (const key of ["tag-fg", "destroy"]) {
    const rgb = hexRgb(p[key] || "");
    if (!rgb) {
      const line = `  pinboard  ${slug}  ${key}  MISSING TOKEN  FAIL`;
      console.log(line);
      violations.push(line);
      continue;
    }
    if (bg) console.log(check("pinboard", slug, `${key} vs bg`, cr(bg, rgb), 4.5));
    if (bgSurface) console.log(check("pinboard", slug, `${key} vs bg-surface`, cr(bgSurface, rgb), 4.5));
  }
  // url-link-fg vs the pill it actually sits in. resolveOpaqueBg over each page
  // base, so a `url-link-bg` left at the "transparent" its fallback chain can
  // reach (`|| tag-bg`, which 9 pilots declare transparent) is measured where
  // it really lands instead of being read as black; when the pill is a plain
  // hex -- all 14 rendered palettes today -- both resolutions collapse to one
  // row.
  {
    // a.help badge text on its accent-soft fill (see expandSitePalette's help-fg).
    const helpFg = hexRgb(p["help-fg"] || "");
    if (!helpFg) {
      console.log(check("pinboard", slug, "help-fg vs accent-soft", 0, 4.5));
    } else {
      const fills = new Map();
      for (const [label, base] of [["bg", bg], ["bg-surface", bgSurface]]) {
        if (!base) continue;
        const resolved = resolveOpaqueBg(p["accent-soft"], base).map((c) => Math.round(c));
        const k = resolved.join(",");
        if (!fills.has(k)) fills.set(k, { rgb: resolved, labels: [] });
        fills.get(k).labels.push(label);
      }
      for (const { rgb, labels } of fills.values()) {
        const suffix = fills.size > 1 ? `@${labels.join("+")}` : "";
        console.log(check("pinboard", slug, `help-fg vs accent-soft${suffix}`, cr(rgb, helpFg), 4.5));
      }
    }
  }
  const urlFg = hexRgb(p["url-link-fg"] || "");
  if (!urlFg) {
    const line = `  pinboard  ${slug}  url-link-fg  MISSING TOKEN  FAIL`;
    console.log(line);
    violations.push(line);
  } else {
    const pills = new Map();
    for (const [label, base] of [["bg", bg], ["bg-surface", bgSurface]]) {
      if (!base) continue;
      const resolved = resolveOpaqueBg(p["url-link-bg"], base).map((c) => Math.round(c));
      const k = resolved.join(",");
      if (!pills.has(k)) pills.set(k, { rgb: resolved, labels: [] });
      pills.get(k).labels.push(label);
    }
    for (const { rgb, labels } of pills.values()) {
      const suffix = pills.size > 1 ? `@${labels.join("+")}` : "";
      console.log(check("pinboard", slug, `url-link-fg vs url-link-bg${suffix}`, cr(rgb, urlFg), 4.5));
    }
  }

  // Metadata strip (11px a.when/a.cached via the composer's .bookmark rules):
  // AA against every base it can sit on. A MISSING token is itself a failure —
  // silent skips are exactly how the last two coverage holes shipped green.
  const metadataFg = hexRgb(p["metadata-fg"] || "");
  const privateBg = hexRgb(p["private-bg"] || "");
  if (!metadataFg) {
    const line = `  pinboard  ${slug}  metadata-fg  MISSING TOKEN  FAIL`;
    console.log(line);
    violations.push(line);
  } else {
    for (const [label, base] of [["bg", bg], ["bg-surface", bgSurface], ["private-bg", privateBg]]) {
      if (base) console.log(check("pinboard", slug, `metadata-fg vs ${label}`, cr(base, metadataFg), 4.5));
    }
  }
  // Private-row distinguishability: byte-equality or <1.01 means the private
  // background carries ZERO signal (nord-night shipped that way for months).
  // 1.01–1.1 is legal-but-weak: advisory only — the 3px private-accent inset
  // bar stays the primary cue and seven shipped themes live in that band.
  if (privateBg && bgSurface) {
    const same = String(p["private-bg"] || "").toLowerCase() === String(p["bg-surface"] || p["bg"] || "").toLowerCase();
    const ratio = cr(privateBg, bgSurface);
    if (same || ratio < 1.01) {
      const line = `  pinboard  ${slug}  private-bg vs bg-surface  ${ratio.toFixed(3)} (need >=1.01 and not byte-equal)  FAIL`;
      console.log(line);
      violations.push(line);
    } else {
      console.log(`  pinboard  ${slug}  private-bg vs bg-surface  ${ratio.toFixed(3)}  ${ratio < 1.1 ? "WARN (advisory <1.1)" : "OK"}`);
    }
  }
}

function auditCssThemes(label, varPrefix, cssPath) {
  console.log("\n=== " + label + " ===");
  const text = readFileSync(cssPath, "utf8");
  const re = /\[data-theme="([^"]+)"\]\s*\{([^}]+)\}/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const theme = m[1];
    const body = m[2];
    const grab = (k) => {
      const mm = body.match(new RegExp(varPrefix + "-" + k + ":\\s*([^;]+)"));
      return mm ? mm[1].trim() : null;
    };
    const bgS = grab("bg");
    const fgS = grab("fg");
    const hintS = grab("fg-hint");
    const mutedS = grab("fg-muted");
    if (!bgS) continue;
    const bg = bgS.startsWith("#") ? hexRgb(bgS) : null;
    if (!bg) continue;
    if (fgS) {
      const c = resolveColor(fgS, bg);
      if (c) console.log(check(label, theme, "fg vs bg", cr(c, bg), 4.5));
    }
    if (hintS) {
      const c = resolveColor(hintS, bg);
      if (c) console.log(check(label, theme, "fg-hint vs bg", cr(c, bg), 4.5));
    }
    if (mutedS) {
      const c = resolveColor(mutedS, bg);
      if (c) console.log(check(label, theme, "fg-muted vs bg", cr(c, bg), 4.5));
    }
    // Same two tiers on the ELEVATED surface (bg2): the popup's autocomplete
    // footer and offline empty state, options' panels put them there, and
    // "vs bg" alone let flexoki-dark's fg-hint through at 4.05:1 on bg2
    // (2026-08-26, Codex). BLOCKING like the bg rows.
    const bg2S = grab("bg2");
    const bg2 = bg2S && bg2S.startsWith("#") ? hexRgb(bg2S) : null;
    if (bg2) {
      if (hintS) { const c = resolveColor(hintS, bg2); if (c) console.log(check(label, theme, "fg-hint vs bg2", cr(c, bg2), 4.5)); }
      if (mutedS) { const c = resolveColor(mutedS, bg2); if (c) console.log(check(label, theme, "fg-muted vs bg2", cr(c, bg2), 4.5)); }
    }
    // ...and on the accent-tinted hover/selected row fill (popup's
    // .ac-item.selected keeps its hint-tier count there; terminal read 3.5:1
    // before the derivation covered it -- Codex 2026-08-26). BLOCKING.
    const dropS = grab("drop-hover");
    const drop = dropS && dropS.startsWith("#") ? hexRgb(dropS) : null;
    if (drop) {
      if (hintS) { const c = resolveColor(hintS, drop); if (c) console.log(check(label, theme, "fg-hint vs drop-hover", cr(c, drop), 4.5)); }
      if (mutedS) { const c = resolveColor(mutedS, drop); if (c) console.log(check(label, theme, "fg-muted vs drop-hover", cr(c, drop), 4.5)); }
    }
    // Status pairs (NEW, BLOCKING): warn/banner/ok/offline fg must clear AA
    // against their own tinted bg. The engine (pairToAA) derives these to pass
    // by construction, so a FAIL here is a derivation bug — do NOT allowlist.
    for (const [fgK, bgK, lbl] of [
      ["warn-fg", "warn-bg", "warn fg vs bg"],
      ["banner-fg", "banner-bg", "banner fg vs bg"],
      ["ok-fg", "ok-bg", "ok fg vs bg"],
      ["offline-fg", "offline-bg", "offline fg vs bg"],
    ]) {
      const fS = grab(fgK), bS = grab(bgK);
      if (!fS || !bS) continue;
      const bb = bS.startsWith("#") ? hexRgb(bS) : null;
      if (!bb) continue;
      const ff = resolveColor(fS, bb);
      if (ff) console.log(check(label, theme, lbl, cr(ff, bb), 4.5));
    }
    // Submit-button text (BLOCKING): --pp-on-accent is emitted per theme and is
    // the ONLY sanctioned text color on the accent surface. This probe exists
    // because a var() fallback made every themed submit button silently white
    // (2026-07): nothing audited the rendered pairing until a user caught it
    // on terminal's phosphor green.
    if (varPrefix === "--pp") {
      const onS = grab("on-accent"), accS = grab("accent");
      if (onS && accS && accS.startsWith("#")) {
        const accBg = hexRgb(accS);
        const onF = resolveColor(onS, accBg);
        if (onF) console.log(check(label, theme, "on-accent vs accent", cr(onF, accBg), 4.5));
      }
    }
    // Scrollbar thumb (uses fg-muted) against scrollbar track (uses panel for options, bg2 for popup).
    // Threshold 3:1 — UI components, not text.
    const trackKey = label === "options" ? "panel" : "bg2";
    const trackS = (() => {
      const mm = body.match(new RegExp(varPrefix + "-" + trackKey + ":\\s*([^;]+)"));
      return mm ? mm[1].trim() : null;
    })();
    if (mutedS && trackS) {
      const trackBg = trackS.startsWith("#") ? hexRgb(trackS) : null;
      const thumb = resolveColor(mutedS, bg);
      // Now BLOCKING: fg-muted is derived to AA, which also lifts every scrollbar
      // thumb above the 3:1 UI-component floor (verified on all 14 popup themes).
      if (trackBg && thumb) console.log(check(label, theme, "scrollbar thumb vs track", cr(thumb, trackBg), 3));
    }
    // Component-layer paired tokens (Task 5) — see COMPONENT_PAIR_SPEC above.
    // Themed blocks are self-contained (every role Task 5 derives lands in
    // this same block), so strict=true: a missing role here is a regression.
    auditComponentPairs(label, varPrefix.slice(2), theme, tokenDict(body), true);
  }
}
auditCssThemes("popup", "--pp", resolve(ROOT, "popup.css"));
auditCssThemes("options", "--opt", resolve(ROOT, "options.css"));

// Library page (--lib-*): a distinct role set from popup/options (master-detail
// panes, flat save/danger/warn status colors rather than tinted bg/fg pairs), so
// it gets its own small audit instead of forcing auditCssThemes's popup/options-
// shaped branches (on-accent, warn-bg/banner-bg pairs, scrollbar track selection)
// to also cover a role set they don't apply to.
function auditLibraryThemes(cssPath) {
  console.log("\n=== library ===");
  const text = readFileSync(cssPath, "utf8");
  const re = /\[data-theme="([^"]+)"\]\s*\{([^}]+)\}/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const theme = m[1];
    const body = m[2];
    const grab = (k) => {
      const mm = body.match(new RegExp("--lib-" + k + ":\\s*([^;]+)"));
      return mm ? mm[1].trim() : null;
    };
    const bgS = grab("bg"), panelS = grab("panel");
    const bg = bgS && bgS.startsWith("#") ? hexRgb(bgS) : null;
    const panel = panelS && panelS.startsWith("#") ? hexRgb(panelS) : null;
    if (!bg) continue;
    // Body text sits on both the page bg and the elevated panel/pane surface —
    // both must clear AA, not just the one popup/options happen to check.
    for (const [key, label] of [["fg", "fg"], ["fg-muted", "fg-muted"]]) {
      const s = grab(key);
      if (!s) continue;
      const onBg = resolveColor(s, bg);
      if (onBg) console.log(check("library", theme, `${label} vs bg`, cr(onBg, bg), 4.5));
      if (panel) {
        const onPanel = resolveColor(s, panel);
        if (onPanel) console.log(check("library", theme, `${label} vs panel`, cr(onPanel, panel), 4.5));
      }
    }
    // Link text: same two-background constraint as fg/fg-muted above (a link can
    // sit directly on the page bg or inside a panel/pane).
    const linkS = grab("link");
    if (linkS) {
      const onBg = resolveColor(linkS, bg);
      if (onBg) console.log(check("library", theme, "link vs bg", cr(onBg, bg), 4.5));
      if (panel) {
        const onPanel = resolveColor(linkS, panel);
        if (onPanel) console.log(check("library", theme, "link vs panel", cr(onPanel, panel), 4.5));
      }
    }
    // Selected-row pair: its own fill, its own text — not composited over bg/panel.
    const rowBgS = grab("row-selected-bg"), rowFgS = grab("row-selected-fg");
    if (rowBgS && rowFgS && rowBgS.startsWith("#")) {
      const rowBg = hexRgb(rowBgS);
      const rowFg = resolveColor(rowFgS, rowBg);
      if (rowFg) console.log(check("library", theme, "row-selected-fg vs row-selected-bg", cr(rowFg, rowBg), 4.5));
    }
    // save/danger/warn are flat text colors on the page bg (unlike popup/options'
    // tinted warn-bg/banner-bg pairs — library has no such tinted-fill roles yet).
    for (const key of ["save", "danger", "warn"]) {
      const s = grab(key);
      if (!s) continue;
      const c = resolveColor(s, bg);
      if (c) console.log(check("library", theme, `${key} vs bg`, cr(c, bg), 4.5));
    }
    // Component-layer paired tokens (Task 5) — same rationale as auditCssThemes.
    auditComponentPairs("library", "lib", theme, tokenDict(body), true);
  }
}
auditLibraryThemes(resolve(ROOT, "library.css"));

// (The popup's html.dark default-dark probe was retired 2026-08-25: no-preset
// dark is the flexoki-dark preset on every surface, audited as a theme above.)

// Component-layer paired tokens on the DEFAULT (no-preset) surfaces — Task 5's
// :root baseline blocks, the first time the
// default surface enters this door at all. foldSelectorBlocks merges each
// file's hand-maintained :root (bg/panel/btn-bg/btn-hover/danger/border —
// pre-existing, NOT touched by Task 5) with the generated :root appended at
// the end of @generated:ui-themes (Task 5's 5 new tokens only) — the same
// cascade the browser resolves. strict=false: unlike the 13/14 themed
// blocks, Task 5 deliberately left the default surface's non-new roles
// exactly as they were (visual-zero-change scope), so a role this surface
// simply never declared (e.g. options' default has no --opt-btn-bg/
// --opt-btn-hover yet, pre-Task-9) is an in-scope-elsewhere gap, not a
// regression to fail on.
function auditComponentPairsDefault(scope, ns, cssPath, selector, blockLabel) {
  const text = readFileSync(cssPath, "utf8");
  const dict = foldSelectorBlocks(text, selector);
  // Guard against the whole default-surface probe silently degrading to a
  // no-op. `strict=false` below means an unresolvable role SKIPs rather than
  // FAILs -- correct for a role Task 5 legitimately never touched, but if
  // `selectorSrc` itself stops matching ANY block (e.g. `:root { ... }`
  // rewritten to `:root, html { ... }` -- verified via a real repro: the
  // fold then returns {} for that occurrence, every one of the surviving
  // small :root blocks in these files is font/motion-only and none declares
  // `bg`) every pair would resolve as "not declared", SKIP, and the whole
  // audit would still exit 0 having checked nothing. `bg` is the one role
  // every :root baseline in these 3 files has always declared
  // (verified for all three), so its absence from the fold means the
  // selector regex missed the block entirely, not a legitimate gap -- FAIL.
  if (Object.keys(dict).length === 0 || !dict[`${ns}-bg`]) {
    const line = "  " + scope.padEnd(10) + " " + blockLabel.padEnd(20) + " (sentinel)".padEnd(28) + ` FAIL (no "${selector}" block matched, or missing --${ns}-bg)`;
    console.log(line);
    violations.push(line);
    return;
  }
  auditComponentPairs(scope, ns, blockLabel, dict, false);
}
console.log("\n=== component pairs: default surfaces (:root) ===");
auditComponentPairsDefault("options", "opt", resolve(ROOT, "options.css"), ":root", "default");
auditComponentPairsDefault("library", "lib", resolve(ROOT, "library.css"), ":root", "default");
auditComponentPairsDefault("popup", "pp", resolve(ROOT, "popup.css"), ":root", "default-light");

// Default-surface .preset-btn text (design-uplift Task 13 review round):
// the generic COMPONENT_PAIR_SPEC "preset-fg vs preset-bg"/"preset-fg vs
// btn-hover" pair above can't express this one -- the default (no-preset)
// surface's own .preset-btn fill lives in --pp-preset-btn-bg/
// -preset-btn-hover-bg, DISTINCT token names from the themed layer's
// --pp-preset-bg (ROLE_ALIAS's pp "btn-hover" -> "drop-hover" is correct
// for the THEMED .preset-btn:hover, which really does use --pp-drop-hover,
// but the default surface's :hover uses --pp-preset-btn-hover-bg instead --
// aliasing "btn-hover" to either target globally would silently mis-check
// the other one). A bespoke pair, not a ROLE_ALIAS entry, so the themed
// layer's own (correct) resolution is untouched. BLOCKING: a FAIL here is
// a derivation bug, not a legitimate gap -- --pp-preset-fg/-preset-btn-bg/
// -preset-btn-hover-bg are all hand-written :root literals with no
// legitimate reason to go missing.
{
  const text = readFileSync(resolve(ROOT, "popup.css"), "utf8");
  const dict = foldSelectorBlocks(text, ":root");
  const fgS = dict["pp-preset-fg"], bgS = dict["pp-preset-btn-bg"], hoverS = dict["pp-preset-btn-hover-bg"];
  if (!fgS || !bgS || !hoverS) {
    const line = "  popup      default-light        preset-fg vs preset-btn-*".padEnd(48) +
      "FAIL (missing --pp-preset-fg/-preset-btn-bg/-preset-btn-hover-bg)";
    console.log(line);
    violations.push(line);
  } else if (isHex(fgS) && isHex(bgS) && isHex(hoverS)) {
    const fg = hexRgb(fgS);
    console.log(check("popup", "default-light", "preset-fg vs preset-btn-bg", cr(fg, hexRgb(bgS)), 4.5));
    console.log(check("popup", "default-light", "preset-fg vs preset-btn-hover-bg", cr(fg, hexRgb(hoverS)), 4.5));
  }
}

console.log("\n=== orphan check: *-fg / on-* tokens with zero coverage in this file ===");
auditOrphanTokens("popup", "pp", readFileSync(resolve(ROOT, "popup.css"), "utf8"));
auditOrphanTokens("options", "opt", readFileSync(resolve(ROOT, "options.css"), "utf8"));
auditOrphanTokens("library", "lib", readFileSync(resolve(ROOT, "library.css"), "utf8"));

const writeBaseline = process.argv.includes("--update-baseline");
const acceptNew = process.argv.includes("--accept-new");
const baseline = loadBaseline();

console.log("\n=== pilot overrides.css: hardcoded sub-AA text (both page bases, or its own declared fill) — " +
  overrideDebt.length + " (baseline " + baseline.overrideText.length + ") ===");
for (const d of overrideDebt) console.log(d.line);
const overrideR = ratchetIdentities("overrides", overrideDebt, baseline.overrideText, writeBaseline);

console.log("\n=== rest vs :hover with no perceptible change (ΔE2000 < " + STATE_DELTA_MIN_DE + ") — " +
  stateDebt.length + " (baseline " + baseline.hoverState.length + ") ===");
for (const d of stateDebt) console.log(d.line);
const stateR = ratchetIdentities("states", stateDebt, baseline.hoverState, writeBaseline);

if (writeBaseline) {
  const newIds = [...overrideR.added, ...stateR.added];
  if (newIds.length && !acceptNew) {
    console.log("\n=== --update-baseline REFUSED — " + newIds.length + " id(s) would be ADDED ===");
    for (const id of newIds) console.log("  + " + id);
    console.log("\nAdding debt needs an explicit decision. Fix the theme, or re-run with");
    console.log("--update-baseline --accept-new if this is debt that was already shipping");
    console.log("and only became visible now (see the header comment above BASELINE_PATH).");
    process.exit(1);
  }
  const next = { ...baseline, overrideText: overrideR.ids, hoverState: stateR.ids };
  writeFileSync(BASELINE_PATH, JSON.stringify(next, null, 2) + "\n");
  console.log("\n=== contrast-debt-baseline.json rewritten ===");
  for (const id of newIds) console.log("  + " + id);
  for (const id of [...overrideR.stale, ...stateR.stale]) console.log("  - " + id);
  console.log("  overrideText " + baseline.overrideText.length + " -> " + overrideR.ids.length +
    ",  hoverState " + baseline.hoverState.length + " -> " + stateR.ids.length);
}

console.log("");
if (skipCount > 0) {
  console.log("(" + skipCount + " component-pair check(s) SKIPped -- see SKIP lines above; non-blocking)");
}
if (known.length > 0) {
  console.log("=== KNOWN (allowlisted, not blocking) — " + known.length + " ===");
  for (const k of known) console.log(k);
  console.log("");
}
if (violations.length === 0) {
  console.log("=== contrast-audit: PASS ===");
  process.exit(0);
} else {
  console.log("=== contrast-audit: FAIL — " + violations.length + " new violation(s) ===");
  for (const v of violations) console.log(v);
  process.exit(1);
}
}

// realpathSync, not resolve(): Node's ESM loader resolves symlinks when it
// loads this module, so import.meta.url reflects the REAL file path. A
// plain resolve() on process.argv[1] only makes a relative CLI argument
// absolute -- it does not follow a symlink in that argument. If this script
// (or the directory it lives in) is ever invoked through a symlink, the two
// would silently disagree, the guard would read false, main() would never
// run, and the process would exit 0 having done nothing -- indistinguishable
// from a genuine PASS. realpathSync() resolves symlinks on both sides.
function isDirectRun() {
  if (!process.argv[1]) return false;
  try { return fileURLToPath(import.meta.url) === realpathSync(process.argv[1]); } catch { return false; }
}
if (isDirectRun()) {
  main();
}
