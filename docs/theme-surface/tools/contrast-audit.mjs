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

// Known legacy violations: hand-tuned palettes (notably Solarized's low-contrast
// design philosophy) where the original token choice is intentional.
// Format: "<scope>:<theme>:<label>". Adding a NEW theme that hits these same
// pairs would still fail the audit — only the listed (theme, pair) combinations
// are exempt.
const ALLOWLIST = new Set([
  "pinboard:solarized-light:bg vs fg",
  "pinboard:solarized-light:btn-bg vs btn-fg",
  "pinboard:solarized-dark:btn-bg vs btn-fg",
  "pinboard:solarized-dark:muted vs bg-surface",
  "pinboard:nord-night:btn-bg vs btn-fg",
  "pinboard:catppuccin-latte:btn-bg vs btn-fg",
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
  const slug = f.replace(/\.tokens\.json$/, "");
  const t = JSON.parse(readFileSync(resolve(PILOTS, f), "utf8"));
  const p = t.palette || {};
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
  // Scrollbar thumb visibility against track (composer uses muted on bg-surface).
  if (bgSurface && muted) console.log(check("pinboard", slug, "muted vs bg-surface", cr(bgSurface, muted), 3));
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
      if (trackBg && thumb) console.log(check(label, theme, "scrollbar thumb vs track", cr(thumb, trackBg), 3));
    }
  }
}
auditCssThemes("popup", "--pp", resolve(ROOT, "popup.css"));
auditCssThemes("options", "--opt", resolve(ROOT, "options.css"));

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
