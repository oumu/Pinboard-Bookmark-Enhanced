#!/usr/bin/env node
// contrast-audit — fail the pipeline if any token pair drops below the
// minimum WCAG / readability ratio that the recent regressions exposed.
//
// Four theme systems are checked:
//   1. Pinboard.in content-script themes  -> pilots/<slug>.tokens.json
//   2. Popup (--pp-*)                     -> popup.css [data-theme=...] blocks
//   3. Options page (--opt-*)             -> options.css [data-theme=...] blocks
//   4. Library page (--lib-*)             -> library.css [data-theme=...] blocks

import { readFileSync, readdirSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { expandPalette } from "../composers/_util.mjs";
import { isHex, resolveOpaqueBg } from "../composers/_ui-derive.mjs";

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
  return m ? [+m[1], +m[2], +m[3], m[4] !== undefined ? +m[4] : 1] : null;
};
export const composite = (fg, alpha, bg) => fg.map((c, i) => Math.round(alpha * c + (1 - alpha) * bg[i]));
const resolveColor = (s, bg) => {
  s = s.trim();
  if (s.startsWith("#")) return hexRgb(s);
  const r = parseRgba(s);
  return r ? composite(r.slice(0, 3), r[3], bg) : null;
};

// Known legacy violations. Format: "<scope>:<theme>:<label>". Adding a NEW theme
// that hits these same pairs would still fail the audit — only the listed
// (theme, pair) combinations are exempt.
//
// The four `btn-bg vs btn-fg` entries (solarized x2, nord-night, catppuccin-latte)
// are GONE, not moved: btn-bg is now derived to clear AA by construction, so the
// exemption has nothing left to exempt. Do not re-add an exemption for any
// fg/fill pair — if one fails, the derivation is what needs fixing.
const ALLOWLIST = new Set([
  // Scrollbar thumb (muted) on its track. Unlike the button pairs this one has no
  // derivation behind it: `muted` is body-text color too, so raising it for the
  // scrollbar would lighten these themes' prose. Separate fix, separate decision.
  //
  // flexoki:dark (2.03) was invisible until this tool started auditing mode
  // palettes — it is pre-existing, not a regression, and is parked here on the
  // same terms as solarized-dark rather than silently fixed.
  "pinboard:solarized-dark:muted vs bg-surface",
  "pinboard:flexoki:dark:muted vs bg-surface",
]);

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
// Icon/stroke non-text 3:1 (WCAG 1.4.11) is NOT represented below despite
// the brief calling it out as a category: the one concrete candidate COMPONENTS
// §1.3 names, `border` vs `btn-bg`, was measured (not guessed) against all 13
// pilots and fails almost everywhere (ratios ~1.0-1.7 -- these borders are a
// deliberate subtle-divider design choice, not an AA-derived pair Task 5
// guaranteed), so gating on it would either red the whole audit or need 20+
// fresh allowlist entries -- neither is "the derivation is buggy, fix it",
// both are out of a single-file task's reach. Icon color reuses --{ns}-btn-fg
// itself (COMPONENTS §2.2, currentColor inheritance) at a WEAKER 3:1
// requirement than the 4.5:1 text pairs already below, so it's structurally
// subsumed, not skipped.
//
// Popup has no --pp-btn-bg / --pp-btn-hover / --pp-panel of its own -- the
// button surface and its hover fill are named bg2 / drop-hover instead (see
// popup-chrome.mjs's own comment: "panel === bg2 === btn-bg for popup, no
// dedicated panel role"). This alias table is what lets the SAME
// COMPONENT_PAIR_SPEC below apply to all three namespaces without a
// surface-specific copy of it.
const ROLE_ALIAS = {
  pp: { "btn-bg": "bg2", "btn-hover": "drop-hover", panel: "bg2" },
  opt: {},
  lib: {},
};

// [fgRole, bgRole, minRatio, onlyNs?] -- role names, not literal --{ns}-*
// strings; ROLE_ALIAS resolves the per-surface literal name at lookup time.
// The optional 4th element restricts a row to specific namespaces (an array
// of "pp"/"opt"/"lib") when the role only exists on one surface -- without
// it, a role missing from another surface's tokenDict would FAIL there
// (strict mode) instead of correctly not applying at all.
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
  // Four rows below: popup-only roles (design-uplift Task 13, USER RULING --
  // Task 7's orphan guard surfaced all three as real, never-audited gaps).
  // preset-fg/tag-fg/spinner-fg have no --opt-*/--lib-* counterpart (tag
  // presets and the loading spinner are popup-specific), so ["pp"] keeps
  // this row from FAILing every options/library themed block over a role
  // that surface never declares.
  ["preset-fg", "preset-bg", 4.5, ["pp"]],
  // .preset-btn:hover swaps its fill to drop-hover (popup.css's generic
  // html[data-theme] .preset-btn:hover rule) while keeping the same text --
  // same pressable-hover shape as chip-fg/btn-hover above.
  ["preset-fg", "btn-hover", 4.5, ["pp"]],
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
];

// Generic `--name: value;` extractor over an arbitrary block body -- the
// "programmatic" half of the enumeration: whatever the composer actually
// emitted into this block is what ends up in the dict, nothing assumed.
function tokenDict(body) {
  const dict = {};
  const re = /--([a-z0-9-]+)\s*:\s*([^;]+);/gi;
  let m;
  while ((m = re.exec(body)) !== null) dict[m[1]] = m[2].trim();
  return dict;
}

// Folds EVERY occurrence of `<selectorSrc> { ... }` in `text` into one dict,
// later occurrences overriding earlier ones -- the real CSS cascade for a
// same-specificity selector like `:root` or `html.dark`, which is exactly
// how the default-surface baseline works: a hand-maintained block up top
// (bg/panel/btn-bg/danger/border/...) plus the generated block appended at
// the end of @generated:ui-themes (Task 5's 5 new tokens only). Folding both
// in source order reproduces what the browser actually resolves.
function foldSelectorBlocks(text, selectorSrc) {
  const re = new RegExp(selectorSrc + "\\s*\\{([^}]*)\\}", "g");
  const dict = {};
  let m;
  while ((m = re.exec(text)) !== null) Object.assign(dict, tokenDict(m[1]));
  return dict;
}
// selectorSrc is a literal-ish selector like ":root" or "html\\.dark" -- this
// has no idea about @media-wrapped rules (a `@media (...) { :root {...} }`
// block would match too, since the regex doesn't track brace nesting). No
// generated block is ever @media-wrapped today, so this is a known, currently
// non-triggering limitation, not a silent gap.

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
  for (const [fgRole, bgRole, min, onlyNs] of COMPONENT_PAIR_SPEC) {
    if (onlyNs && !onlyNs.includes(ns)) continue; // role doesn't exist on this surface -- not a gap, just N/A
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
  // --pp-warn-fg / --pp-banner-fg / --pp-ok-fg / --pp-offline-fg: audited by
  // the warn/banner/ok/offline loop in auditCssThemes (grab(fgK) against
  // grab(bgK), BLOCKING, pairToAA-guaranteed) -- real coverage, just not
  // expressed as a COMPONENT_PAIR_SPEC role (that loop predates this task).
  "pp:warn-fg",
  "pp:banner-fg",
  "pp:ok-fg",
  "pp:offline-fg",
  // --pp-on-accent: audited by the dedicated "on-accent vs accent" check in
  // auditCssThemes (varPrefix === "--pp" branch) and again in
  // auditDarkDefault -- real coverage, same "predates this task's role
  // registry" reason as the four above.
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
}

function auditPalette(slug, rawPalette) {
  // expandPalette, NOT the raw pilot: btn-bg and the on-<fill> tokens are DERIVED
  // there (see _util.deriveContrast). Auditing the raw pilot was the coverage hole
  // that let 22 sub-AA pairs ship behind a green audit.
  const p = expandPalette(rawPalette);
  const bg = hexRgb(p["bg"] || "");
  const fg = hexRgb(p["fg"] || "");
  const bgSurface = hexRgb(p["bg-surface"] || p["bg"] || "");
  const btnBg = hexRgb(p["btn-bg"] || p["accent"] || "");
  const btnBgHover = hexRgb(p["btn-bg-hover"] || p["link-hover"] || p["accent-hover"] || p["btn-bg"] || p["accent"] || "");
  const btnFg = hexRgb(p["btn-fg"] || "");
  const muted = hexRgb(p["muted"] || "");
  // WCAG AA threshold (4.5:1) for body text. AAA-grade themes will exceed this naturally.
  if (bg && fg) console.log(check("pinboard", slug, "bg vs fg", cr(bg, fg), 4.5));
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
  // Scrollbar thumb visibility against track (composer uses muted on bg-surface).
  if (bgSurface && muted) console.log(check("pinboard", slug, "muted vs bg-surface", cr(bgSurface, muted), 3));

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

// Default-dark layer (html.dark { --pp-* }) — the one popup surface NOT generated
// by the factory (no pilot, hand-maintained). It now defines AA-safe text tiers
// (token-driven, parity with the generated html[data-theme] layer). fg-muted and
// fg-hint land on the ELEVATED surface (bg2 = #252525), so they're checked against
// bg2 — the lightest surface they touch — which guarantees AA on the darker body
// bg too. BLOCKING, like the themed probe: a FAIL here is a real regression.
function auditDarkDefault(cssPath) {
  console.log("\n=== popup default-dark (html.dark --pp-*) ===");
  const text = readFileSync(cssPath, "utf8");
  const m = text.match(/html\.dark\s*\{([^}]+)\}/);
  if (!m) { console.log("  (no html.dark palette block found — skipped)"); return; }
  const body = m[1];
  const grab = (k) => {
    const mm = body.match(new RegExp("--pp-" + k + ":\\s*([^;]+)"));
    return mm ? mm[1].trim() : null;
  };
  const bgS = grab("bg"), bg2S = grab("bg2"), fgS = grab("fg");
  const hintS = grab("fg-hint"), mutedS = grab("fg-muted");
  const bg = bgS && bgS.startsWith("#") ? hexRgb(bgS) : null;
  if (!bg) { console.log("  (html.dark has no --pp-bg — skipped)"); return; }
  const bg2 = bg2S && bg2S.startsWith("#") ? hexRgb(bg2S) : bg; // fall back to bg
  if (fgS) { const c = resolveColor(fgS, bg); if (c) console.log(check("popup", "default-dark", "fg vs bg", cr(c, bg), 4.5)); }
  if (mutedS) { const c = resolveColor(mutedS, bg2); if (c) console.log(check("popup", "default-dark", "fg-muted vs bg2", cr(c, bg2), 4.5)); }
  if (hintS) { const c = resolveColor(hintS, bg2); if (c) console.log(check("popup", "default-dark", "fg-hint vs bg2", cr(c, bg2), 4.5)); }
  // Variant status pairs (warn/banner/ok/offline fg vs their own tinted bg), same
  // family of regression the themed probe guards. All hand-set values clear AA today.
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
    if (ff) console.log(check("popup", "default-dark", lbl, cr(ff, bb), 4.5));
  }
}
auditDarkDefault(resolve(ROOT, "popup.css"));

// Component-layer paired tokens on the DEFAULT (no-preset) surfaces — Task 5's
// :root baseline blocks (popup also has html.dark), the first time the
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
function auditComponentPairsDefault(scope, ns, cssPath, selectorSrc, blockLabel) {
  const text = readFileSync(cssPath, "utf8");
  const dict = foldSelectorBlocks(text, selectorSrc);
  // Guard against the whole default-surface probe silently degrading to a
  // no-op. `strict=false` below means an unresolvable role SKIPs rather than
  // FAILs -- correct for a role Task 5 legitimately never touched, but if
  // `selectorSrc` itself stops matching ANY block (e.g. `:root { ... }`
  // rewritten to `:root, html { ... }` -- verified via a real repro: the
  // fold then returns {} for that occurrence, every one of the surviving
  // small :root blocks in these files is font/motion-only and none declares
  // `bg`) every pair would resolve as "not declared", SKIP, and the whole
  // audit would still exit 0 having checked nothing. `bg` is the one role
  // every :root/html.dark baseline in these 3 files has always declared
  // (verified for all three), so its absence from the fold means the
  // selector regex missed the block entirely, not a legitimate gap -- FAIL.
  if (Object.keys(dict).length === 0 || !dict[`${ns}-bg`]) {
    const line = "  " + scope.padEnd(10) + " " + blockLabel.padEnd(20) + " (sentinel)".padEnd(28) + ` FAIL (no "${selectorSrc}" block matched, or missing --${ns}-bg)`;
    console.log(line);
    violations.push(line);
    return;
  }
  auditComponentPairs(scope, ns, blockLabel, dict, false);
}
console.log("\n=== component pairs: default surfaces (:root / html.dark) ===");
auditComponentPairsDefault("options", "opt", resolve(ROOT, "options.css"), ":root", "default");
auditComponentPairsDefault("library", "lib", resolve(ROOT, "library.css"), ":root", "default");
auditComponentPairsDefault("popup", "pp", resolve(ROOT, "popup.css"), ":root", "default-light");
auditComponentPairsDefault("popup", "pp", resolve(ROOT, "popup.css"), "html\\.dark", "default-dark");

console.log("\n=== orphan check: *-fg / on-* tokens with zero coverage in this file ===");
auditOrphanTokens("popup", "pp", readFileSync(resolve(ROOT, "popup.css"), "utf8"));
auditOrphanTokens("options", "opt", readFileSync(resolve(ROOT, "options.css"), "utf8"));
auditOrphanTokens("library", "lib", readFileSync(resolve(ROOT, "library.css"), "utf8"));

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
