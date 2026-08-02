#!/usr/bin/env node
// contrast-audit — fail the pipeline if any token pair drops below the
// minimum WCAG / readability ratio that the recent regressions exposed.
//
// Three theme systems are checked:
//   1. Pinboard.in content-script themes  -> pilots/<slug>.tokens.json
//   2. Popup (--pp-*)                     -> popup.css [data-theme=...] blocks
//   3. Options page (--opt-*)             -> options.css [data-theme=...] blocks

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { expandPalette } from "../composers/_util.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..", "..");
const PILOTS = resolve(__dirname, "..", "pilots");

const lum = (rgb) => {
  const s = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * s(rgb[0] / 255) + 0.7152 * s(rgb[1] / 255) + 0.0722 * s(rgb[2] / 255);
};
const cr = (a, b) => {
  const L = [lum(a), lum(b)].sort((x, y) => x - y);
  return (L[1] + 0.05) / (L[0] + 0.05);
};
const hexRgb = (h) => {
  let s = h.replace(/^#/, "").trim();
  if (s.length === 3) s = s.split("").map((c) => c + c).join("");
  if (s.length !== 6) return null;
  const n = parseInt(s, 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
};
const parseRgba = (s) => {
  const m = s.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  return m ? [+m[1], +m[2], +m[3], m[4] !== undefined ? +m[4] : 1] : null;
};
const composite = (fg, alpha, bg) => fg.map((c, i) => Math.round(alpha * c + (1 - alpha) * bg[i]));
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
  }
}
auditCssThemes("popup", "--pp", resolve(ROOT, "popup.css"));
auditCssThemes("options", "--opt", resolve(ROOT, "options.css"));

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

console.log("");
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
