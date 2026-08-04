#!/usr/bin/env node
// scripts/ui-render-audit.mjs — the design-uplift render oracle. Loads the
// unpacked extension (source tree, not a release ZIP) into a real Chromium,
// seeds a minimal fixture (one Pinboard-shaped token, one vocab word + group,
// one highlight/note), then walks tests/render-audit-checklist.mjs's
// hand-written CHECKS × THEMES matrix against the ACTUAL rendered DOM:
// computed `color`, the real composited ancestor background (walking the
// live cascade, not reading CSS source), and real getBoundingClientRect()
// geometry. This is what makes it a different failure class than the static
// [static] gates (recipe-lint, css-region-audit, etc.): a component can pass
// every static token-wiring check and still render wrong once the browser's
// own cascade and layout are involved -- see COMPONENTS.md §7.1's two-door
// requirement ("两道门必须都在").
//
// USAGE
//   node scripts/ui-render-audit.mjs                      # gate: known-failures WARN, new violations FAIL
//   node scripts/ui-render-audit.mjs --update-known-failures  # (re)write the baseline
//   node scripts/ui-render-audit.mjs --sweep               # DISCOVERY mode (see below), not a gate
//
// --sweep is a separate mode from the CHECKS/known-failures gate above: a
// generic DOM walk (not the hand-written CHECKS list) that hunts for three
// geometry defect CLASSES across every element on the page instead of the
// enumerated instances CHECKS covers -- textInset (text glued to a visible
// border), childContainment (a summary/disclosure's icon or ::after chevron
// painting outside its host's border-box), rowHeightEq (mismatched heights
// among sibling form controls in the same flex/grid row). It prints hits and
// exits 0 unconditionally -- it is a FINDER, not a pass/fail gate. Each real
// hit it turns up gets fixed and then locked in as a normal hand-written
// CHECKS entry (heightEqWith for rowHeightEq, the new textInset/
// childContainment expect keys for the other two) so the permanent gate
// above catches any regression -- the sweep itself is not meant to run in
// CI/verify.sh.
//
// PREREQUISITES (same as scripts/zip-install-smoke.mjs)
//   cd .qa-scan && npm install && npx playwright install chromium
//
// EXIT
//   0 → pass (all failures already in known-failures, or --update-known-failures ran)
//   1 → at least one NEW violation not covered by known-failures
//   2 → tooling/env error (no playwright, no display, seed failed, bad JSON, etc.)

import { createRequire } from "node:module";
import { existsSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

import { CHECKS, THEMES } from "../tests/render-audit-checklist.mjs";
// Reused, not re-implemented, so this audit and contrast-audit.mjs's static
// CSS-source audit can never quietly disagree on what a passing ratio is.
import { cr, hexRgb, parseRgba, composite } from "../docs/theme-surface/tools/contrast-audit.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const KNOWN_FAILURES_PATH = resolve(ROOT, "tests", "render-audit-known-failures.json");
const TIMEOUT_MS = 15000;

const UPDATE = process.argv.includes("--update-known-failures");
const SWEEP = process.argv.includes("--sweep");

let chromium;
try {
  const req = createRequire(resolve(ROOT, ".qa-scan", "package.json"));
  ({ chromium } = req("playwright"));
} catch {
  console.error("[render-audit] playwright not found.");
  console.error("  Install:  cd .qa-scan && npm install && npx playwright install chromium");
  process.exit(2);
}

const SURFACE_PAGES = { library: "library.html", options: "options.html", popup: "popup.html" };

// ---- Fixture identity. Any Pinboard-token-shaped string works here -- it
// never leaves this machine and nothing validates it against the real API.
// obfuscateKey()'s algorithm (shared.js), reproduced inline since Node has no
// window.btoa: "obf:" + base64(utf8(raw)). ----
const SEED_TOKEN_ACCOUNT = "qa-render";
const SEED_TOKEN_RAW = `${SEED_TOKEN_ACCOUNT}:audit0000000000000000000000000000`;
const SEED_TOKEN_OBF = "obf:" + Buffer.from(SEED_TOKEN_RAW, "utf8").toString("base64");
const SEED_OWNER = "acct_" + encodeURIComponent(SEED_TOKEN_ACCOUNT);

// ---- Theme storage mapping. Hand-copied from shared.js's ADAPTIVE_THEME_MAP
// (verified at authoring time, not imported: shared.js is a plain script,
// not an ES module, and this keeps the mapping legible next to the THEMES
// list it serves). "popup-dark" and "" are not real storage values -- they
// decode to the (themePresetKey, optTheme) pair that PRODUCES that state. ----
const ADAPTIVE_VARIANTS = {
  flexoki: ["flexoki-light", "flexoki-dark"],
  solarized: ["solarized-light", "solarized-dark"],
  catppuccin: ["catppuccin-latte", "catppuccin-mocha"],
};
// Dark-preset ids among THEMES (colorSchemeMatchesTheme, Task 6). Hand-copied
// from composers/popup-chrome.mjs's POPUP_THEME_MAP { mode: "dark" } entries
// -- all three surfaces render the identical 14-id data-theme set (same
// census the checklist's own THEMES comment documents) -- NOT imported, same
// independence-from-the-composer-layer reasoning as ADAPTIVE_VARIANTS above.
const DARK_THEME_IDS = new Set([
  "popup-dark", "nord-night", "terminal", "dracula", "flexoki-dark",
  "solarized-dark", "catppuccin-mocha", "gruvbox-dark", "rose-pine",
]);
function isDarkTheme(themeKey) { return DARK_THEME_IDS.has(themeKey); }

function themeToStorage(themeKey) {
  if (themeKey === "") return { themePresetKey: "", optTheme: "light" };
  if (themeKey === "popup-dark") return { themePresetKey: "", optTheme: "dark" };
  for (const [umbrella, [light, dark]] of Object.entries(ADAPTIVE_VARIANTS)) {
    if (themeKey === light) return { themePresetKey: umbrella, optTheme: "light" };
    if (themeKey === dark) return { themePresetKey: umbrella, optTheme: "dark" };
  }
  return { themePresetKey: themeKey, optTheme: "light" }; // fixed preset, mode is a don't-care
}

// ---- Color/geometry math. compositeStack + resolveColor are the render
// oracle's own combinators (a live-DOM ancestor walk has no equivalent in
// contrast-audit.mjs, which reads hex literals out of CSS source) built ONLY
// from the five imported primitives -- no re-implementation of lum/cr. ----
function resolveColor(raw, bg) {
  const s = String(raw || "").trim();
  if (!s) return null;
  if (s.startsWith("#")) return hexRgb(s);
  const parsed = parseRgba(s);
  return parsed ? composite(parsed.slice(0, 3), parsed[3], bg) : null;
}
function compositeStack(rawColors) {
  let base = [255, 255, 255]; // opaque canvas default; every page's <html> paints over this before it matters
  for (let i = rawColors.length - 1; i >= 0; i--) {
    const parsed = parseRgba(rawColors[i]);
    if (!parsed || parsed[3] <= 0) continue;
    base = composite(parsed.slice(0, 3), parsed[3], base);
  }
  return base;
}
// A CSS custom property value read via getComputedStyle (textContrastMulti's
// extraBgRaw) is a solid theme token, not a foreground painted over
// something -- every `--{ns}-btn-hover` in the shipped CSS is a plain hex
// literal (verified: grep -n -- '--lib-btn-hover:' library.css), so this
// only needs the two imported parsers, no compositing.
function parseSolidColor(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  if (s.startsWith("#")) return hexRgb(s);
  const parsed = parseRgba(s);
  return parsed ? parsed.slice(0, 3) : null;
}
function round2(n) { return n == null ? n : Math.round(n * 100) / 100; }
function verdict(check, ok, actual, expected, note) { return { check, status: ok ? "OK" : "FAIL", actual, expected, note: note || null }; }
function skip(check, expected, note) { return { check, status: "SKIP", actual: null, expected, note }; }

// Runs INSIDE the page (Playwright serializes this function's source), so it
// must be self-contained -- no references to anything outside its own body.
// `compareSelector` (heightEqWith) and `extraBgVarName` (textContrastMulti)
// are both optional -- one evaluate() round-trip covers whatever the check
// needs instead of a second page.evaluate call per check.
function probeSelector({ selector, compareSelector, extraBgVarName }) {
  const el = document.querySelector(selector);
  if (!el) return { found: false };
  const cs = getComputedStyle(el);
  const rect = el.getBoundingClientRect();
  const bgStack = [];
  for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
    bgStack.push(getComputedStyle(node).backgroundColor);
  }
  const svgEl = el.querySelector("svg");
  let svg = null;
  if (svgEl) {
    const r = svgEl.getBoundingClientRect();
    svg = { color: getComputedStyle(svgEl).color, rect: { top: r.top, height: r.height } };
  }
  let compareRect = null;
  if (compareSelector) {
    const cmpEl = document.querySelector(compareSelector);
    if (cmpEl) { const r = cmpEl.getBoundingClientRect(); compareRect = { height: r.height }; }
  }
  let extraBgRaw = null;
  if (extraBgVarName) {
    extraBgRaw = getComputedStyle(document.documentElement).getPropertyValue(extraBgVarName).trim() || null;
  }
  // Effective hit-area box (COMPONENTS.md §1.5's ::before hit-area expansion
  // recipe, e.g. .row-del-x / #vocab-invert-selection): getBoundingClientRect()
  // on the host alone can't see it -- position:absolute pseudo-elements never
  // affect their own host's layout box, that's the whole point of the trick --
  // so hitAreaMin was blind to it (COMPONENTS.md §1.4 always said "含 ::before
  // 扩张", this oracle just hadn't implemented that half of its own contract).
  // Chromium's getComputedStyle(el, "::before") already resolves width/height
  // to their USED pixel values when `position:absolute` + inset offsets give
  // the box a definite size (verified live: an all-sides-inset, no-explicit-
  // size ::before reports e.g. width:"26px"/height:"24px", never the literal
  // keyword "auto") -- no need to hand-derive it from the containing block's
  // padding box ourselves, just parse what the browser already computed.
  // Falls back to the host's own rect when there's no ::before (content:
  // "none") or it isn't absolutely positioned.
  let effRect = { width: rect.width, height: rect.height };
  const beforeCs = getComputedStyle(el, "::before");
  if (beforeCs && beforeCs.content && beforeCs.content !== "none" && beforeCs.position === "absolute") {
    const bw = parseFloat(beforeCs.width), bh = parseFloat(beforeCs.height);
    if (Number.isFinite(bw) && Number.isFinite(bh)) {
      effRect = { width: Math.max(rect.width, bw), height: Math.max(rect.height, bh) };
    }
  }
  // widthLtParent needs the parent's CONTENT-box width, not its border-box
  // width: a stretched flex item (align-items:stretch, the exact bug this
  // check exists to catch) fills the container's content box, which sits
  // INSIDE both the container's padding and its border. Comparing against
  // border-box width let padding+border alone (e.g. .tag-gov-group-row's
  // 12px padding + 1px border per side = 26px combined) silently clear an
  // 8px margin that was meant to only tolerate normal text-width variance --
  // a stretched child would still measure well under border-box width and
  // the guard could never actually fire for its one real target.
  const parentEl = el.parentElement;
  let parentRect = null;
  if (parentEl) {
    const pcs = getComputedStyle(parentEl);
    const pRect = parentEl.getBoundingClientRect();
    const contentWidth = pRect.width
      - (parseFloat(pcs.paddingLeft) || 0) - (parseFloat(pcs.paddingRight) || 0)
      - (parseFloat(pcs.borderLeftWidth) || 0) - (parseFloat(pcs.borderRightWidth) || 0);
    parentRect = { width: contentWidth };
  }
  // ---- textInset (Task 14 -- options preset-preview summary's "text glued
  // to the border" bug): union bbox of the element's OWN direct text nodes
  // ONLY (not descendants -- a wrapper with its text in a child <span> is a
  // different, not-yet-covered shape), via a Range per text node so
  // multi-rect (wrapped) text still gets a correct overall bbox. Measured
  // against the nearest ELEMENT-OR-ANCESTOR that is actually a full 4-side
  // box border (findBorderBoxHost) -- the real bug's border lives on
  // `#preset-preview-section` (the <details>), one level above the
  // `<summary>` that holds the text, so a same-element-only rule would have
  // missed exactly the case this check exists for. Requires ALL FOUR sides
  // (not just one) so single-edge dividers like `.reset-tab-btn`'s
  // `border-top` alone don't get treated as a "box" with a phantom bottom
  // constraint. Stops at the first scrollable ancestor (`#preset-preview-
  // content`'s `overflow:auto` code panel is exactly this shape) -- content
  // that's expected to scroll past its own box isn't a text-inset bug.
  function findBorderBoxHost(start) {
    let cur = start;
    for (let depth = 0; depth < 5 && cur && cur !== document.documentElement; depth++) {
      const c = getComputedStyle(cur);
      if (c.overflowX === "auto" || c.overflowX === "scroll" || c.overflowY === "auto" || c.overflowY === "scroll") return null;
      // The classic single-line ellipsis idiom (white-space:nowrap +
      // text-overflow:ellipsis + overflow:hidden, e.g. .vocab-row-gloss)
      // deliberately lays out text WIDER than its own box and clips it --
      // that's a truncation boundary, not a text-inset bug, so stop here
      // too. Narrower than "any overflow:hidden" on purpose:
      // `#preset-preview-section` (the real bug's border host) ALSO has a
      // bare `overflow:hidden` of its own (clip-to-border-radius, not
      // truncation -- no nowrap/ellipsis alongside it), and a blanket
      // overflow:hidden stop would have walked straight past it and missed
      // the bug this check exists to catch.
      if (c.overflowX === "hidden" && c.whiteSpace === "nowrap" && c.textOverflow === "ellipsis") return null;
      const bw = { t: parseFloat(c.borderTopWidth) || 0, r: parseFloat(c.borderRightWidth) || 0, b: parseFloat(c.borderBottomWidth) || 0, l: parseFloat(c.borderLeftWidth) || 0 };
      if (Math.min(bw.t, bw.r, bw.b, bw.l) > 0) return { host: cur, bw };
      cur = cur.parentElement;
    }
    return null;
  }
  const directText = Array.from(el.childNodes).filter((n) => n.nodeType === 3 && n.textContent.trim().length > 0);
  let textInset = null;
  if (directText.length) {
    const borderHost = findBorderBoxHost(el);
    if (borderHost) {
      const range = document.createRange();
      let uL = Infinity, uT = Infinity, uR = -Infinity, uB = -Infinity;
      for (const tn of directText) {
        range.selectNodeContents(tn);
        for (const r of range.getClientRects()) {
          if (r.width === 0 && r.height === 0) continue;
          uL = Math.min(uL, r.left); uT = Math.min(uT, r.top);
          uR = Math.max(uR, r.right); uB = Math.max(uB, r.bottom);
        }
      }
      if (uL !== Infinity) {
        const hostRect = borderHost.host.getBoundingClientRect();
        const bw2 = borderHost.bw;
        textInset = {
          left: uL - (hostRect.left + bw2.l), right: (hostRect.right - bw2.r) - uR,
          top: uT - (hostRect.top + bw2.t), bottom: (hostRect.bottom - bw2.b) - uB,
        };
      }
    }
  }
  // ---- childContainment (Task 14 -- the preset-preview chevron poking past
  // its own border): every icon/pseudo-element child must stay inside the
  // host's border-box. svg has a real DOM node (getBoundingClientRect direct);
  // ::before/::after don't -- measurePseudo mirrors the pseudo's resolved
  // box-model properties onto a REAL sibling inserted in the same spot (with
  // the actual pseudo swapped out via a scoped `content: none !important`
  // override, so the two never double-count as two trailing flex items in
  // the same row), reads ITS rect, then removes it -- synchronous within this
  // one function call, no paint/flicker, no residue on the live DOM.
  function measurePseudo(pseudo) {
    const pcs = getComputedStyle(el, pseudo);
    if (!pcs || !pcs.content || pcs.content === "none") return null;
    const marker = "pbpSweepGhost" + Math.random().toString(36).slice(2);
    el.classList.add(marker);
    const styleEl = document.createElement("style");
    styleEl.textContent = `.${marker}${pseudo} { content: none !important; }`;
    document.head.appendChild(styleEl);
    const ghost = document.createElement("span");
    const props = ["position", "top", "right", "bottom", "left", "width", "height", "display",
      "marginTop", "marginRight", "marginBottom", "marginLeft",
      "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
      "borderTopStyle", "borderRightStyle", "borderBottomStyle", "borderLeftStyle",
      "boxSizing", "transform", "transformOrigin", "flexShrink", "flexGrow", "flexBasis", "alignSelf"];
    for (const p of props) { try { ghost.style[p] = pcs[p]; } catch (_) {} }
    if (pseudo === "::before") el.insertBefore(ghost, el.firstChild); else el.appendChild(ghost);
    const r = ghost.getBoundingClientRect();
    ghost.remove(); styleEl.remove(); el.classList.remove(marker);
    if (r.width === 0 && r.height === 0) return null;
    return { top: r.top, left: r.left, right: r.right, bottom: r.bottom };
  }
  const containmentChildren = [];
  if (svgEl) {
    const r = svgEl.getBoundingClientRect();
    containmentChildren.push({ kind: "svg", rect: { top: r.top, left: r.left, right: r.right, bottom: r.bottom } });
  }
  const beforeRect = measurePseudo("::before");
  if (beforeRect) containmentChildren.push({ kind: "::before", rect: beforeRect });
  const afterRect = measurePseudo("::after");
  if (afterRect) containmentChildren.push({ kind: "::after", rect: afterRect });
  return {
    found: true,
    disabled: !!el.disabled,
    color: cs.color,
    bgStack,
    rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
    effRect,
    parentRect,
    svg,
    compareRect,
    extraBgRaw,
    textInset,
    containmentChildren,
    // Unconditional (cheap, selector-independent) -- colorSchemeMatchesTheme's
    // proxy for native-control (scrollbar/spinner) rendering mode, which has
    // no pixel-level probe of its own (Task 6).
    rootColorScheme: getComputedStyle(document.documentElement).colorScheme,
    paddingLeft: parseFloat(cs.paddingLeft) || 0,
    paddingRight: parseFloat(cs.paddingRight) || 0,
    paddingTop: parseFloat(cs.paddingTop) || 0,
    paddingBottom: parseFloat(cs.paddingBottom) || 0,
    borderRadius: parseFloat(cs.borderTopLeftRadius) || 0,
  };
}

// Node-side: turns one probe() result into one-or-more {check, status,
// actual, expected} verdicts, per the `expect` keys the CHECK declared.
// `theme` (added Task 6, colorSchemeMatchesTheme only) is the current
// THEMES-loop value -- unlike every other expect key, the "correct" value
// here legitimately depends on which theme is active, so it can't be a
// static literal in the checklist entry the way every other check's
// `expect` is (see the file-header note on why CHECKS entries don't
// normally carry a `theme` field: this key stays theme-INDEPENDENT in the
// checklist -- `colorSchemeMatchesTheme: true` -- and only the runner,
// which already owns the THEMES loop, computes what "matches" means).
function evaluateCheck(check, raw, theme) {
  if (!raw.found) return { setupError: `selector not found in DOM: ${check.selector}` };
  const bg = compositeStack(raw.bgStack);
  const out = [];
  const exp = check.expect;
  const disabledSkip = !!raw.disabled; // WCAG 1.4.3 exempts disabled controls -- contrast checks only
  // A collapsed/hidden ancestor (fixture forgot to reveal a panel, or a
  // future CSS change makes an element `display:none`) reports a
  // zero-size rect -- every geometry math below would then divide/compare
  // against 0 and could accidentally read as "passing". Every geometry
  // check below fails loudly on this instead (still recorded into
  // known-failures normally -- it is not a silent skip).
  const hostZero = raw.rect.width === 0 || raw.rect.height === 0;
  const zeroNote = "zero-size element (width or height is 0) -- not actually rendered/visible; fixture setup or a display:none regression";

  if ("textContrast" in exp) {
    if (disabledSkip) out.push(skip("textContrast", exp.textContrast, "disabled (WCAG 1.4.3 exempt)"));
    else {
      const fg = resolveColor(raw.color, bg);
      const ratio = fg ? cr(fg, bg) : 0;
      out.push(verdict("textContrast", ratio >= exp.textContrast, round2(ratio), exp.textContrast));
    }
  }
  if ("iconContrast" in exp) {
    if (disabledSkip) out.push(skip("iconContrast", exp.iconContrast, "disabled (WCAG 1.4.3 exempt)"));
    else if (!raw.svg) out.push(verdict("iconContrast", false, null, exp.iconContrast, "no <svg> descendant"));
    else {
      const fg = resolveColor(raw.svg.color, bg);
      const ratio = fg ? cr(fg, bg) : 0;
      out.push(verdict("iconContrast", ratio >= exp.iconContrast, round2(ratio), exp.iconContrast));
    }
  }
  if ("iconVCenter" in exp) {
    if (!raw.svg) out.push(verdict("iconVCenter", false, null, exp.iconVCenter, "no <svg> descendant"));
    else if (hostZero || raw.svg.rect.height === 0) out.push(verdict("iconVCenter", false, null, exp.iconVCenter, zeroNote));
    else {
      const hostCenter = raw.rect.top + raw.rect.height / 2;
      const svgCenter = raw.svg.rect.top + raw.svg.rect.height / 2;
      out.push(verdict("iconVCenter", Math.abs(hostCenter - svgCenter) <= exp.iconVCenter,
        round2(Math.abs(hostCenter - svgCenter)), exp.iconVCenter));
    }
  }
  if (exp.padGteRadiusH === true) {
    if (hostZero) out.push(verdict("padGteRadiusH", false, null, null, zeroNote));
    else {
      const effRadius = Math.min(raw.borderRadius, raw.rect.height / 2);
      const padH = Math.min(raw.paddingLeft, raw.paddingRight);
      out.push(verdict("padGteRadiusH", padH >= effRadius - 0.5, round2(padH), round2(effRadius)));
    }
  }
  if ("padVMin" in exp) {
    if (hostZero) out.push(verdict("padVMin", false, null, exp.padVMin, zeroNote));
    else {
      const padV = Math.min(raw.paddingTop, raw.paddingBottom);
      out.push(verdict("padVMin", padV >= exp.padVMin - 0.01, round2(padV), exp.padVMin));
    }
  }
  if ("heightEqWith" in exp) {
    const { selector: cmpSel, tolerancePx } = exp.heightEqWith;
    if (hostZero) out.push(verdict("heightEqWith", false, null, tolerancePx, zeroNote));
    else if (raw.compareRect == null) {
      out.push(verdict("heightEqWith", false, null, tolerancePx, `comparison selector not found: ${cmpSel}`));
    } else if (raw.compareRect.height === 0) {
      out.push(verdict("heightEqWith", false, null, tolerancePx, `comparison element is zero-size: ${cmpSel}`));
    } else {
      const diff = Math.abs(raw.rect.height - raw.compareRect.height);
      out.push(verdict("heightEqWith", diff <= tolerancePx, round2(diff), tolerancePx));
    }
  }
  if ("hitAreaMin" in exp) {
    if (hostZero) out.push(verdict("hitAreaMin", false, null, exp.hitAreaMin, zeroNote));
    else {
      // effRect (not raw.rect): includes the §1.5 ::before hit-area expansion
      // when present, see probeSelector's comment for the exact shape this
      // measures.
      const shortSide = Math.min(raw.effRect.width, raw.effRect.height);
      out.push(verdict("hitAreaMin", shortSide >= exp.hitAreaMin, round2(shortSide), exp.hitAreaMin));
    }
  }
  if (exp.widthLtParent === true) {
    // Flex-column stretch regression guard (COMPONENTS.md's chip family,
    // Appendix C10 fix round): a flex ITEM is always block-level regardless
    // of its own inline-flex/inline-block display value (CSS Display §2.7),
    // so a column-direction flex container's default `align-items: stretch`
    // silently fills the child to 100% width unless something (a real
    // `width` declaration -- not the child's display value) opts out.
    // Asserts the element reads as content-sized, not container-filling: a
    // >=8px margin from the parent's CONTENT-box width (raw.parentRect,
    // see probeSelector) clears normal text-content variance while still
    // catching a full stretch -- a stretched child's border-box width
    // equals exactly the parent's content-box width, so this margin has
    // nothing else eating into it (unlike comparing against border-box
    // width, where the parent's own padding+border could exceed 8px and
    // let a stretched child pass unnoticed).
    if (hostZero || !raw.parentRect || raw.parentRect.width === 0) {
      out.push(verdict("widthLtParent", false, null, null, hostZero ? zeroNote : "no parent element found"));
    } else {
      const ok = raw.rect.width <= raw.parentRect.width - 8;
      out.push(verdict("widthLtParent", ok, round2(raw.rect.width), round2(raw.parentRect.width)));
    }
  }
  if ("textInset" in exp) {
    // §7.6 textInset (Task 14 sweep -- generalized from the options
    // preset-preview summary bug: an ID-selector override zeroed its
    // horizontal padding, so the label text sat flush against the bordered
    // box's edge). `h`/`v` are px floors on the SMALLER of the two opposing
    // insets (left vs right, top vs bottom) so asymmetric padding can't hide
    // a real violation on one side.
    const { h, v } = exp.textInset;
    const label = `h>=${h},v>=${v}`;
    if (hostZero) out.push(verdict("textInset", false, null, label, zeroNote));
    else if (!raw.textInset) out.push(verdict("textInset", false, null, label, "no direct text node found on this element"));
    else {
      const minH = Math.min(raw.textInset.left, raw.textInset.right);
      const minV = Math.min(raw.textInset.top, raw.textInset.bottom);
      const ok = minH >= h - 0.5 && minV >= v - 0.5;
      out.push(verdict("textInset", ok, `h=${round2(minH)},v=${round2(minV)}`, label));
    }
  }
  if (exp.childContainment === true) {
    // §7.6 childContainment (Task 14 sweep -- the same bug's other half: the
    // zeroed padding left no room for the ::after chevron's rotated bbox,
    // which then painted past the border on the right). Every icon/pseudo
    // child (svg, ::before, ::after) must stay inside the host's border-box,
    // ±1px tolerance for subpixel rounding.
    const label = "⊆ host border-box (±1px)";
    if (hostZero) out.push(verdict("childContainment", false, null, label, zeroNote));
    else if (!raw.containmentChildren || !raw.containmentChildren.length) {
      out.push(verdict("childContainment", false, null, label, "no icon/pseudo child found (svg absent, ::before/::after both content:none)"));
    } else {
      const tol = 1;
      const hostRight = raw.rect.left + raw.rect.width, hostBottom = raw.rect.top + raw.rect.height;
      const bad = [];
      for (const c of raw.containmentChildren) {
        const over = {
          left: raw.rect.left - c.rect.left, right: c.rect.right - hostRight,
          top: raw.rect.top - c.rect.top, bottom: c.rect.bottom - hostBottom,
        };
        if (over.left > tol || over.right > tol || over.top > tol || over.bottom > tol) {
          bad.push(`${c.kind}:L${round2(over.left)}/R${round2(over.right)}/T${round2(over.top)}/B${round2(over.bottom)}`);
        }
      }
      out.push(verdict("childContainment", bad.length === 0, bad.length ? bad.join(";") : "contained", label));
    }
  }
  if ("textContrastMulti" in exp) {
    const { ratio, extraBgSelectorVar } = exp.textContrastMulti;
    if (disabledSkip) out.push(skip("textContrastMulti", ratio, "disabled (WCAG 1.4.3 exempt)"));
    else {
      const fg1 = resolveColor(raw.color, bg);
      const ratio1 = fg1 ? cr(fg1, bg) : 0;
      const extraBg = parseSolidColor(raw.extraBgRaw);
      if (!extraBg) {
        // Never silently drop the second background: WARN via the note,
        // and the verdict is only the single-background result.
        out.push(verdict("textContrastMulti", ratio1 >= ratio, round2(ratio1), ratio,
          `WARN: --${extraBgSelectorVar} token unresolved (raw=${JSON.stringify(raw.extraBgRaw)}) -- checked chip-bg only, NOT the second background`));
      } else {
        const fg2 = resolveColor(raw.color, extraBg);
        const ratio2 = fg2 ? cr(fg2, extraBg) : 0;
        const ok = ratio1 >= ratio && ratio2 >= ratio;
        out.push(verdict("textContrastMulti", ok, round2(Math.min(ratio1, ratio2)), ratio,
          `chip-bg=${round2(ratio1)}:1, ${extraBgSelectorVar}=${round2(ratio2)}:1`));
      }
    }
  }
  if (exp.colorSchemeMatchesTheme === true) {
    const expectedScheme = isDarkTheme(theme) ? "dark" : "light";
    const actual = raw.rootColorScheme || "";
    out.push(verdict("colorSchemeMatchesTheme", actual.includes(expectedScheme), actual, expectedScheme));
  }
  return { results: out };
}

// COMPONENTS.md's `{ns}` notation: the token-name prefix each surface's
// generated CSS variables use (--lib-*/--opt-*/--pp-*). Only textContrastMulti
// needs this (to turn a checklist-declared role like "btn-hover" into the
// actual custom-property name to read).
const NS_BY_SURFACE = { library: "lib", options: "opt", popup: "pp" };

async function runOneCheck(page, theme, check, results) {
  if (check.state === "hover") {
    // Real mouse hover (not a class hack): Playwright dispatches actual
    // pointer events, so the live cascade's own `:hover` pseudo-class match
    // drives getComputedStyle exactly the way a real user's cursor would --
    // no need to fake it by toggling a class the CSS never checks for.
    await page.hover(check.selector);
  } else if (check.state !== "default") {
    throw new Error(`unsupported state "${check.state}" on ${check.selector} -- extend runOneCheck() before adding non-default states to the checklist`);
  }
  const extraBgSelectorVar = check.expect.textContrastMulti?.extraBgSelectorVar;
  const raw = await page.evaluate(probeSelector, {
    selector: check.selector,
    compareSelector: check.expect.heightEqWith?.selector || null,
    extraBgVarName: extraBgSelectorVar ? `--${NS_BY_SURFACE[check.surface]}-${extraBgSelectorVar}` : null,
  });
  if (check.state === "hover") {
    // Reset the pointer to a dead corner right after reading the hover
    // state back -- otherwise it stays parked on this check's element for
    // every subsequent "default"-state check in the same run (a :hover that
    // was never supposed to be active would silently leak into their
    // getComputedStyle reads until the next real hover/navigation moved it).
    await page.mouse.move(0, 0);
  }
  const evald = evaluateCheck(check, raw, theme);
  if (evald.setupError) {
    throw new Error(`SETUP ERROR [${check.surface}|${theme}|${check.selector}|${check.state}]: ${evald.setupError}`);
  }
  for (const r of evald.results) {
    results.push({ surface: check.surface, theme, selector: check.selector, state: check.state, ...r });
  }
}

// ---- library.html has two independent master-detail views behind one tab
// strip; a selector's prefix tells us which view to be on and whether a row
// needs clicking open first (every "*-detail-*" selector lives in a detail
// pane that starts empty). ----
function libraryView(selector) { return selector.startsWith(".notes-") ? "notes" : "vocab"; }
function needsDetailOpen(selector) { return selector.includes("-detail-"); }
// .vocab-batch-bar (library.css:986-1010, ".selecting") is height:0/hidden
// until a row is selected. Every id living in that bar needs the same
// precondition -- named explicitly rather than inferred from `expect`
// shape, since hitAreaMin/heightEqWith checks both land there and a third
// check type will land there again eventually.
const BATCH_BAR_SELECTORS = new Set([
  "#vocab-group-input", "#vocab-add-group", "#vocab-remove-group",
  "#vocab-invert-selection", "#vocab-mark-known", "#vocab-mark-learning",
  "#vocab-batch-delete", "#vocab-clear-selection",
]);
function needsBatchBarOpen(selector) { return BATCH_BAR_SELECTORS.has(selector); }

async function runLibraryTheme(page, extBase, theme, checks, results) {
  // Explicit #vocab hash (not bare navigation): _pbpLibInitialView() prefers
  // an explicit hash over the localStorage "last view" memory, so this can't
  // be dragged into "notes" by a previous theme iteration's tab click.
  //
  // The `_ra` query param is load-bearing, not decoration: a previous theme
  // iteration's #notes tab click does `history.replaceState(null, "", "#notes")`
  // (library.js's _pbpLibApplyView), which does NOT reload the document. If
  // this goto's URL then differs from the current one ONLY by fragment
  // (#notes -> #vocab, same path+query), Chromium treats it as a
  // same-document navigation and skips the reload entirely -- theme storage
  // written by setTheme() right before this call would silently never be
  // picked up, and every iteration after the first would keep testing
  // whatever theme happened to be active on the very first real load. A
  // per-theme query string forces a real cross-document navigation every
  // time (verified: page.goto to the byte-identical URL DOES force a reload
  // in this Chromium; only the fragment-only case does not).
  await page.goto(`${extBase}library.html?_ra=${encodeURIComponent(theme)}#vocab`, { waitUntil: "load", timeout: TIMEOUT_MS });
  await page.waitForSelector("#vocab-list .vocab-card", { timeout: TIMEOUT_MS }).catch(() => {});
  await page.waitForTimeout(300);

  const vocabChecks = checks.filter((c) => libraryView(c.selector) === "vocab");
  const notesChecks = checks.filter((c) => libraryView(c.selector) === "notes");

  if (vocabChecks.length) {
    // Setup clicks throw rather than silently no-op on a missing target: a
    // future selector rename (Task 9/10 migration) or a broken seed must
    // make this whole run fail loudly (exit 2), not quietly leave every
    // downstream check reading a zero-size/never-opened element as "PASS".
    if (vocabChecks.some((c) => needsDetailOpen(c.selector))) {
      const head = page.locator("#vocab-list .vocab-card .notes-card-head").first();
      if (!(await head.count())) {
        throw new Error(`SETUP: no "#vocab-list .vocab-card .notes-card-head" to open the vocab detail pane (theme=${theme}) -- seed fixture broken or markup renamed`);
      }
      await head.click(); await page.waitForTimeout(250);
    }
    if (vocabChecks.some((c) => needsBatchBarOpen(c.selector))) {
      const checkbox = page.locator("#vocab-list .vocab-card .vocab-row-select").first();
      if (!(await checkbox.count())) {
        throw new Error(`SETUP: no "#vocab-list .vocab-card .vocab-row-select" to reveal .vocab-batch-bar (theme=${theme}) -- seed fixture broken or markup renamed`);
      }
      await checkbox.click(); await page.waitForTimeout(350);
    }
    for (const check of vocabChecks) await runOneCheck(page, theme, check, results);
  }

  if (notesChecks.length) {
    await page.click("#lib-tab-notes");
    await page.waitForSelector("#notes-list .notes-hit", { timeout: TIMEOUT_MS }).catch(() => {});
    await page.waitForTimeout(250);
    if (notesChecks.some((c) => needsDetailOpen(c.selector))) {
      const hit = page.locator("#notes-list .notes-hit-btn").first();
      if (!(await hit.count())) {
        throw new Error(`SETUP: no "#notes-list .notes-hit-btn" to open the notes detail pane (theme=${theme}) -- seed fixture broken or markup renamed`);
      }
      await hit.click(); await page.waitForTimeout(250);
    }
    for (const check of notesChecks) await runOneCheck(page, theme, check, results);
  }
}

async function runSimpleTheme(page, url, theme, checks, results, surface) {
  await page.goto(url, { waitUntil: "load", timeout: TIMEOUT_MS });
  await page.waitForTimeout(500); // settles the theme-early async storage.get correction
  if (surface === "popup" && checks.some((c) => c.selector === "#offline-queue-clear")) {
    // #offline-queue-bar's own on-load refresh (popup.js showOfflineQueueStatus
    // -> popup-offline.js refreshBar) reliably raced the seeded storage write
    // in this harness and left the bar hidden -- confirmed by re-calling the
    // same public API a second time, which always fixes it immediately. Using
    // window.PPOffline.refresh() (popup.js's own exposed entry point, the
    // same one showOfflineQueueStatus calls) here is fixture setup, not a
    // behavior change to the extension.
    const refreshed = await page.evaluate(async () => {
      if (!window.PPOffline) return false;
      await window.PPOffline.refresh();
      return true;
    });
    if (!refreshed) {
      throw new Error(`SETUP: window.PPOffline is undefined on popup.html (theme=${theme}) -- popup-offline.js failed to load`);
    }
    await page.waitForSelector("#offline-queue-bar:not(.hidden)", { timeout: TIMEOUT_MS });
  }
  if (surface === "options") {
    // Two tab-scoped groups, each needs ITS OWN tab active when its checks
    // actually run -- NOT two independent "switch tab" steps that both fire
    // before one shared loop at the end (a real regression this file's own
    // Task 14 edit briefly introduced: clicking #tab-appearance for the
    // preset-preview group after already clicking #tab-tags for the
    // tag-gov group left options on the WRONG tab by the time
    // .tag-gov-kind-badge's checks ran in that shared loop, reporting it as
    // zero-size across all 16 themes). Each group's checks now run
    // immediately after its own setup click, before the next group touches
    // the tab strip.
    const tagGovChecks = checks.filter((c) => c.selector === ".tag-gov-kind-badge");
    const presetPreviewChecks = checks.filter((c) => c.selector.startsWith("#preset-preview-section"));
    const otherChecks = checks.filter((c) => !tagGovChecks.includes(c) && !presetPreviewChecks.includes(c));
    if (tagGovChecks.length) {
      // .tag-gov-kind-badge lives on the "tags" tab (#panel-tags), not
      // #panel-general (the default active one on a bare goto()) -- its
      // panel is `display:none` until #tab-tags is clicked, which is what
      // renderTagGov()'s init actually hangs off of.
      await page.click("#tab-tags");
      await page.waitForSelector(".tag-gov-kind-badge", { timeout: TIMEOUT_MS });
      for (const check of tagGovChecks) await runOneCheck(page, theme, check, results);
    }
    if (presetPreviewChecks.length) {
      // #preset-preview-section is `style="display:none"` (options.html)
      // until options.js's renderPresetPreview() sees a non-empty
      // currentPresetKey -- click a site-theme preset button on the
      // "appearance" tab (same tab panel the summary lives on) to reveal
      // it. This is a DIFFERENT preset system from the THEMES loop this
      // runner is already iterating (that one is the extension UI's own
      // popup/options/library chrome; this is the pinboard.in SITE theme
      // picker) -- picking "flexoki" here is unrelated to and doesn't
      // fight with whichever THEMES entry is currently active.
      await page.click("#tab-appearance");
      await page.click(".theme-preset-btn[data-theme='flexoki']");
      await page.waitForSelector("#preset-preview-section:not([style*='display: none'])", { timeout: TIMEOUT_MS });
      for (const check of presetPreviewChecks) await runOneCheck(page, theme, check, results);
    }
    for (const check of otherChecks) await runOneCheck(page, theme, check, results);
    return;
  }
  for (const check of checks) await runOneCheck(page, theme, check, results);
}

function setTheme(sw, presetKey, mode) {
  return sw.evaluate(async ({ p, m }) => {
    await chrome.storage.local.set({ themePresetKey: p, optTheme: m });
  }, { p: presetKey, m: mode });
}

// ============================================================================
// --sweep: generic DOM-wide discovery, NOT the CHECKS/known-failures gate
// above. See the file-header comment for why this exists and why it is not
// wired into the pass/fail path. `cfg` thresholds mirror the textInset/
// heightEqWith `expect` shapes above (kept as literal numbers here, not
// imported from a CHECKS entry -- there IS no CHECKS entry until a hit gets
// fixed and turned into one).
// ============================================================================
const SWEEP_CFG = { textInsetH: 4, textInsetV: 2, rowTolerance: 1 };

// Runs INSIDE the page (Playwright serializes this function's source, same
// constraint as probeSelector -- self-contained, no outer references).
function sweepProbe(cfg) {
  const hits = [];
  function pathOf(el) {
    if (el.id) return "#" + el.id;
    const cls = typeof el.className === "string" ? el.className.trim().split(/\s+/).filter(Boolean).join(".") : "";
    let base = el.tagName.toLowerCase() + (cls ? "." + cls : "");
    const parent = el.parentElement;
    if (parent) {
      const same = Array.from(parent.children).filter((s) => s.tagName === el.tagName);
      if (same.length > 1) base += `[${same.indexOf(el)}]`;
    }
    return base;
  }
  function visible(el) {
    // el.checkVisibility(), not a hand-rolled display/visibility read: a
    // CLOSED <details>'s non-summary content is hidden via an internal
    // content-visibility mechanism in modern Chromium, not display:none --
    // computed display/visibility both read as normal on it, yet it isn't
    // painted, and (verified live) its getBoundingClientRect() reports a
    // "remembered" box independent of its actually-collapsed <details>
    // ancestor's real box -- exactly the kind of geometry mismatch that
    // produced nonsense textInset/rowHeightEq hits (a closed .vocab-
    // disclosure's #dict-pack-status measuring 56px below its own collapsed
    // parent) before this switched to the platform's own visibility check.
    if (!(el instanceof Element)) return false;
    if (typeof el.checkVisibility === "function") {
      if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
    } else {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  // ---- 1. textInset: any element with a direct (own, non-descendant)
  // non-whitespace text node, measured against the nearest element-or-
  // ancestor that is a full 4-side box border (findBorderBoxHost -- see
  // probeSelector's copy of this function in this same file for the full
  // rationale: the real bug's border lives one level above the text, on
  // `#preset-preview-section`, not on the `<summary>` holding the text;
  // ALL FOUR sides required so single-edge dividers like `.reset-tab-btn`'s
  // `border-top` don't count; stops at the first scrollable ancestor since
  // overflowing scrollable content isn't a text-inset bug). ----
  function findBorderBoxHost(start) {
    let cur = start;
    for (let depth = 0; depth < 5 && cur && cur !== document.documentElement; depth++) {
      const c = getComputedStyle(cur);
      if (c.overflowX === "auto" || c.overflowX === "scroll" || c.overflowY === "auto" || c.overflowY === "scroll") return null;
      // The classic single-line ellipsis idiom (white-space:nowrap +
      // text-overflow:ellipsis + overflow:hidden, e.g. .vocab-row-gloss)
      // deliberately lays out text WIDER than its own box and clips it --
      // that's a truncation boundary, not a text-inset bug, so stop here
      // too. Narrower than "any overflow:hidden" on purpose:
      // `#preset-preview-section` (the real bug's border host) ALSO has a
      // bare `overflow:hidden` of its own (clip-to-border-radius, not
      // truncation -- no nowrap/ellipsis alongside it), and a blanket
      // overflow:hidden stop would have walked straight past it and missed
      // the bug this check exists to catch.
      if (c.overflowX === "hidden" && c.whiteSpace === "nowrap" && c.textOverflow === "ellipsis") return null;
      const bw = { t: parseFloat(c.borderTopWidth) || 0, r: parseFloat(c.borderRightWidth) || 0, b: parseFloat(c.borderBottomWidth) || 0, l: parseFloat(c.borderLeftWidth) || 0 };
      if (Math.min(bw.t, bw.r, bw.b, bw.l) > 0) return { host: cur, bw };
      cur = cur.parentElement;
    }
    return null;
  }
  for (const el of document.querySelectorAll("body *")) {
    if (!visible(el)) continue;
    const directText = Array.from(el.childNodes).filter((n) => n.nodeType === 3 && n.textContent.trim().length > 0);
    if (!directText.length) continue;
    const borderHost = findBorderBoxHost(el);
    if (!borderHost) continue;
    const range = document.createRange();
    let uL = Infinity, uT = Infinity, uR = -Infinity, uB = -Infinity;
    for (const tn of directText) {
      range.selectNodeContents(tn);
      for (const r of range.getClientRects()) {
        if (r.width === 0 && r.height === 0) continue;
        uL = Math.min(uL, r.left); uT = Math.min(uT, r.top);
        uR = Math.max(uR, r.right); uB = Math.max(uB, r.bottom);
      }
    }
    if (uL === Infinity) continue;
    const hostRect = borderHost.host.getBoundingClientRect();
    const bw = borderHost.bw;
    const minH = Math.min(uL - (hostRect.left + bw.l), (hostRect.right - bw.r) - uR);
    const minV = Math.min(uT - (hostRect.top + bw.t), (hostRect.bottom - bw.b) - uB);
    if (minH < cfg.textInsetH - 0.5 || minV < cfg.textInsetV - 0.5) {
      hits.push({ kind: "textInset", path: pathOf(el), minH: Math.round(minH * 100) / 100, minV: Math.round(minV * 100) / 100 });
    }
  }

  // ---- 2. childContainment: <summary> icon/pseudo children must stay
  // inside the host border-box. Scoped to <summary> (not every button) --
  // buttons legitimately use ::before to EXPAND their hit area past their
  // own visual box on purpose (COMPONENTS.md §1.5), which would make this
  // check fire on every one of them; disclosures don't use that pattern. ----
  for (const host of document.querySelectorAll("summary")) {
    if (!visible(host)) continue;
    const hostRect = host.getBoundingClientRect();
    const children = [];
    const svgEl = host.querySelector("svg");
    if (svgEl) { const r = svgEl.getBoundingClientRect(); children.push({ kind: "svg", rect: r }); }
    for (const pseudo of ["::before", "::after"]) {
      const pcs = getComputedStyle(host, pseudo);
      if (!pcs || !pcs.content || pcs.content === "none") continue;
      const marker = "pbpSweepGhost" + Math.random().toString(36).slice(2);
      host.classList.add(marker);
      const styleEl = document.createElement("style");
      styleEl.textContent = `.${marker}${pseudo} { content: none !important; }`;
      document.head.appendChild(styleEl);
      const ghost = document.createElement("span");
      const props = ["position", "top", "right", "bottom", "left", "width", "height", "display",
        "marginTop", "marginRight", "marginBottom", "marginLeft",
        "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
        "borderTopStyle", "borderRightStyle", "borderBottomStyle", "borderLeftStyle",
        "boxSizing", "transform", "transformOrigin", "flexShrink", "flexGrow", "flexBasis", "alignSelf"];
      for (const p of props) { try { ghost.style[p] = pcs[p]; } catch (_) {} }
      if (pseudo === "::before") host.insertBefore(ghost, host.firstChild); else host.appendChild(ghost);
      const r = ghost.getBoundingClientRect();
      ghost.remove(); styleEl.remove(); host.classList.remove(marker);
      if (r.width || r.height) children.push({ kind: pseudo, rect: r });
    }
    const tol = 1;
    for (const c of children) {
      const over = {
        left: hostRect.left - c.rect.left, right: c.rect.right - hostRect.right,
        top: hostRect.top - c.rect.top, bottom: c.rect.bottom - hostRect.bottom,
      };
      if (over.left > tol || over.right > tol || over.top > tol || over.bottom > tol) {
        hits.push({ kind: "childContainment", path: pathOf(host), childKind: c.kind,
          overflow: { left: Math.round(over.left * 100) / 100, right: Math.round(over.right * 100) / 100, top: Math.round(over.top * 100) / 100, bottom: Math.round(over.bottom * 100) / 100 } });
      }
    }
  }

  // ---- 3. rowHeightEq: pairwise height compare among interactive controls
  // (input/select/button/textarea) collected from a flex/grid container's
  // direct children, flattening ONE level into a child that is itself a
  // flex/grid wrapper (e.g. .vocab-filter-selects wrapping selects + a
  // sort-segment span) so the comparison reaches controls that aren't
  // literal DOM siblings but ARE the same visual row. ----
  // input[type=radio/checkbox/range/color/file] are native OS-sized toggle
  // atoms, not the text-field-shaped controls COMPONENTS.md's §6.3 rowRungEq
  // means by "input" (its own worked examples are all input[type=text]).
  // Comparing one against a .btn-sm's 20px pill height (verified: a 13px
  // radio vs a 20px button, diff=7-7.8px) produced Task 14 sweep false
  // positives at two different sites (options tab-popup's popup-width
  // custom row, tab-tags's #tag-gov-groups merge row) that both trace back
  // to this same over-broad tag-name-only match.
  const NON_FIELD_INPUT_TYPES = new Set(["radio", "checkbox", "range", "color", "file", "hidden", "submit", "reset", "image", "button"]);
  function isControl(el) {
    if (!(el instanceof HTMLElement)) return false;
    if (el.tagName === "SELECT" || el.tagName === "BUTTON" || el.tagName === "TEXTAREA") return true;
    if (el.tagName === "INPUT") return !NON_FIELD_INPUT_TYPES.has((el.getAttribute("type") || "text").toLowerCase());
    return false;
  }
  function isFlexOrGrid(cs) { return cs.display === "flex" || cs.display === "inline-flex" || cs.display === "grid" || cs.display === "inline-grid"; }
  function collectControls(el, depth) {
    if (depth > 3 || !visible(el)) return [];
    if (isControl(el)) return [el];
    if (isFlexOrGrid(getComputedStyle(el))) {
      let out = [];
      for (const child of el.children) out = out.concat(collectControls(child, depth + 1));
      return out;
    }
    return [];
  }
  const seenPairs = new Set();
  for (const container of document.querySelectorAll("body *")) {
    if (!visible(container) || !isFlexOrGrid(getComputedStyle(container))) continue;
    let controls = [];
    for (const child of container.children) controls = controls.concat(collectControls(child, 0));
    if (controls.length < 2) continue;
    for (let i = 0; i < controls.length; i++) {
      for (let j = i + 1; j < controls.length; j++) {
        const a = controls[i], b = controls[j];
        const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
        if (ra.height === 0 || rb.height === 0) continue;
        const diff = Math.abs(ra.height - rb.height);
        if (diff > cfg.rowTolerance) {
          const key = [pathOf(a), pathOf(b)].sort().join("~");
          if (seenPairs.has(key)) continue;
          seenPairs.add(key);
          hits.push({ kind: "rowHeightEq", containerPath: pathOf(container), a: pathOf(a), b: pathOf(b), diff: Math.round(diff * 100) / 100 });
        }
      }
    }
  }

  return hits;
}

async function runSweep(page, sw, extBase) {
  const hits = [];
  const add = (found, surface, context) => { for (const h of found) hits.push({ surface, context, ...h }); };

  // ---- options: every tab panel (each is display:none until clicked, so a
  // border/chevron bug on a panel-scoped element only surfaces once its tab
  // is active -- exactly how the user found the preset-preview bug). ----
  await page.goto(`${extBase}options.html`, { waitUntil: "load", timeout: TIMEOUT_MS });
  await page.waitForTimeout(500);
  // Playwright's page.$$eval (DOM query + in-page callback), not JS eval() --
  // no string-to-code execution, same API runOneCheck already relies on via
  // page.evaluate elsewhere in this file.
  const tabIds = await page.$$eval(".tab-btn", (els) => els.map((e) => e.id));
  for (const tabId of tabIds) {
    await page.click(`#${tabId}`);
    await page.waitForTimeout(150);
    if (tabId === "tab-appearance") {
      // #preset-preview-section is `style="display:none"` until a site-theme
      // preset is picked (options.js renderPresetPreview) -- click one so
      // this disclosure (and its chevron/padding) actually renders for the
      // sweep, same reasoning as the vocab detail-pane/batch-bar opens below.
      const presetBtn = page.locator(".theme-preset-btn[data-theme='flexoki']").first();
      if (await presetBtn.count()) { await presetBtn.click(); await page.waitForTimeout(150); }
    }
    add(await page.evaluate(sweepProbe, SWEEP_CFG), "options", tabId);
  }

  // ---- library: vocab (list, detail pane, batch bar) + notes (list, detail pane). ----
  await page.goto(`${extBase}library.html?_ra=sweep#vocab`, { waitUntil: "load", timeout: TIMEOUT_MS });
  await page.waitForSelector("#vocab-list .vocab-card", { timeout: TIMEOUT_MS }).catch(() => {});
  await page.waitForTimeout(300);
  add(await page.evaluate(sweepProbe, SWEEP_CFG), "library", "vocab-list");
  const vocabHead = page.locator("#vocab-list .vocab-card .notes-card-head").first();
  if (await vocabHead.count()) {
    await vocabHead.click(); await page.waitForTimeout(250);
    add(await page.evaluate(sweepProbe, SWEEP_CFG), "library", "vocab-detail");
  }
  const vocabCheckbox = page.locator("#vocab-list .vocab-card .vocab-row-select").first();
  if (await vocabCheckbox.count()) {
    await vocabCheckbox.click(); await page.waitForTimeout(350);
    add(await page.evaluate(sweepProbe, SWEEP_CFG), "library", "vocab-batch-bar");
  }
  await page.click("#lib-tab-notes");
  await page.waitForSelector("#notes-list .notes-hit", { timeout: TIMEOUT_MS }).catch(() => {});
  await page.waitForTimeout(250);
  add(await page.evaluate(sweepProbe, SWEEP_CFG), "library", "notes-list");
  const notesHit = page.locator("#notes-list .notes-hit-btn").first();
  if (await notesHit.count()) {
    await notesHit.click(); await page.waitForTimeout(250);
    add(await page.evaluate(sweepProbe, SWEEP_CFG), "library", "notes-detail");
  }

  // ---- popup: default light + html.dark (the one surface-specific state
  // the task calls out -- popup's dark default has its own layout deltas). ----
  await setTheme(sw, "", "light");
  await page.goto(`${extBase}popup.html?_ra=sweeplight`, { waitUntil: "load", timeout: TIMEOUT_MS });
  await page.waitForTimeout(500);
  await page.evaluate(async () => { if (window.PPOffline) await window.PPOffline.refresh(); }).catch(() => {});
  await page.waitForSelector("#offline-queue-bar:not(.hidden)", { timeout: TIMEOUT_MS }).catch(() => {});
  add(await page.evaluate(sweepProbe, SWEEP_CFG), "popup", "light");

  await setTheme(sw, "", "dark");
  await page.goto(`${extBase}popup.html?_ra=sweepdark`, { waitUntil: "load", timeout: TIMEOUT_MS });
  await page.waitForTimeout(500);
  await page.evaluate(async () => { if (window.PPOffline) await window.PPOffline.refresh(); }).catch(() => {});
  await page.waitForSelector("#offline-queue-bar:not(.hidden)", { timeout: TIMEOUT_MS }).catch(() => {});
  add(await page.evaluate(sweepProbe, SWEEP_CFG), "popup", "dark");

  return hits;
}

function reportSweep(hits) {
  const dedup = new Map();
  for (const h of hits) {
    const key = h.kind === "rowHeightEq" ? `${h.surface}|rowHeightEq|${[h.a, h.b].sort().join("~")}`
      : `${h.surface}|${h.kind}|${h.path}${h.childKind ? "|" + h.childKind : ""}`;
    if (!dedup.has(key)) dedup.set(key, h);
  }
  const unique = [...dedup.values()];
  console.log(`[render-audit --sweep] ${hits.length} raw hit(s) across all contexts, ${unique.length} unique (deduped by surface+kind+element)`);
  for (const h of unique) {
    if (h.kind === "textInset") console.log(`  textInset          [${h.surface}/${h.context}]  ${h.path}  minH=${h.minH}px minV=${h.minV}px`);
    else if (h.kind === "childContainment") console.log(`  childContainment   [${h.surface}/${h.context}]  host=${h.path}  child=${h.childKind}  overflow=${JSON.stringify(h.overflow)}`);
    else if (h.kind === "rowHeightEq") console.log(`  rowHeightEq        [${h.surface}/${h.context}]  container=${h.containerPath}  ${h.a} vs ${h.b}  diff=${h.diff}px`);
  }
  console.log(unique.length ? "[render-audit --sweep] === hits found -- fix, then lock in as CHECKS entries ===" : "[render-audit --sweep] === clean ===");
  process.exit(0);
}

function keyOf(r) { return `${r.surface}|${r.theme}|${r.selector}|${r.state}|${r.check}`; }

function report(results) {
  const fails = results.filter((r) => r.status === "FAIL");
  const okCount = results.filter((r) => r.status === "OK").length;
  const skipCount = results.filter((r) => r.status === "SKIP").length;

  if (UPDATE) {
    const knownFailures = {};
    for (const r of fails) {
      knownFailures[keyOf(r)] = {
        surface: r.surface, theme: r.theme, selector: r.selector, state: r.state, check: r.check,
        actual: r.actual, expected: r.expected, note: r.note,
      };
    }
    writeFileSync(KNOWN_FAILURES_PATH, JSON.stringify(knownFailures, null, 2) + "\n");
    console.log(`[render-audit] ${okCount} OK, ${skipCount} SKIP, ${fails.length} FAIL`);
    if (skipCount) console.log(`[render-audit] SKIP = disabled controls exempted from contrast checks (WCAG 1.4.3), not a failure`);
    console.log(`[render-audit] wrote ${fails.length} known-failure(s) to ${KNOWN_FAILURES_PATH}`);
    for (const r of fails) console.log(`  FAIL  ${keyOf(r)}  actual=${r.actual}  expected=${r.expected}${r.note ? "  (" + r.note + ")" : ""}`);
    process.exit(0);
  }

  let known = {};
  if (existsSync(KNOWN_FAILURES_PATH)) {
    try { known = JSON.parse(readFileSync(KNOWN_FAILURES_PATH, "utf8")); } catch (e) {
      console.error(`[render-audit] failed to parse ${KNOWN_FAILURES_PATH}: ${e.message}`);
      process.exit(2);
    }
  }

  const violations = [];
  const warnings = [];
  for (const r of fails) {
    if (Object.prototype.hasOwnProperty.call(known, keyOf(r))) warnings.push(r);
    else violations.push(r);
  }
  const seenKeys = new Set(fails.map(keyOf));
  const stale = Object.keys(known).filter((k) => !seenKeys.has(k));

  console.log(`[render-audit] ${okCount} OK, ${skipCount} SKIP, ${warnings.length} WARN (known), ${violations.length} FAIL (new)`);
  if (skipCount) console.log(`[render-audit] SKIP = disabled controls exempted from contrast checks (WCAG 1.4.3), not a failure`);
  if (warnings.length) {
    console.log(`[render-audit] known failures still outstanding (see ${KNOWN_FAILURES_PATH}):`);
    for (const r of warnings) console.log(`  WARN  ${keyOf(r)}  actual=${r.actual}  expected=${r.expected}`);
  }
  if (stale.length) {
    console.log(`[render-audit] ${stale.length} known-failure key(s) no longer reproduce -- consider deleting from ${KNOWN_FAILURES_PATH}:`);
    for (const k of stale) console.log(`  STALE  ${k}`);
  }
  if (violations.length) {
    console.log(`[render-audit] === FAIL -- ${violations.length} new violation(s) not covered by known-failures ===`);
    for (const r of violations) console.log(`  FAIL  ${keyOf(r)}  actual=${r.actual}  expected=${r.expected}${r.note ? "  (" + r.note + ")" : ""}`);
    process.exit(1);
  }
  console.log("[render-audit] === PASS ===");
  process.exit(0);
}

async function main() {
  const userDataDir = mkdtempSync(join(tmpdir(), "pbp-render-audit-"));
  let ctx;
  try {
    // Unpacked source tree, not a ZIP (this audits the working tree, not a
    // release build) -- same recipe as scripts/zip-install-smoke.mjs:187-195.
    ctx = await chromium.launchPersistentContext(userDataDir, {
      headless: false, // MV3 extensions require headed (or 'new' headless on recent Chrome)
      args: [
        `--disable-extensions-except=${ROOT}`,
        `--load-extension=${ROOT}`,
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-default-apps",
      ],
    });
  } catch (e) {
    console.error(`[render-audit] Chromium launch failed: ${e.message}`);
    console.error("  If running headless on a server, try installing X virtual framebuffer:");
    console.error("    sudo apt install xvfb && xvfb-run -a node scripts/ui-render-audit.mjs");
    rmSync(userDataDir, { recursive: true, force: true });
    process.exit(2);
  }

  let sw = ctx.serviceWorkers()[0];
  if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: TIMEOUT_MS }).catch(() => null);
  if (!sw) {
    console.error("[render-audit] no service worker registered within 15s");
    await ctx.close().catch(() => {});
    rmSync(userDataDir, { recursive: true, force: true });
    process.exit(2);
  }
  const extId = new URL(sw.url()).hostname;
  const extBase = `chrome-extension://${extId}/`;

  // ---- Seed fixture data. All three writes go through the SW, which
  // already importScripts()'s vocab-store.js (background.js) -- same origin,
  // same IndexedDB as any extension page. Calling its own public functions
  // (pbpVocabSaveWord / pbpVocabBatchAddGroup) instead of touching the
  // "words" object store directly keeps the single-writer invariant intact
  // (CLAUDE.md: "vocab-store.js 是 pbp-vocab 的唯一写入口"). ----
  await sw.evaluate((tok) => chrome.storage.local.set({ pinboardToken: tok }), SEED_TOKEN_OBF);

  const seeded = await sw.evaluate(async (owner) => {
    const w = await pbpVocabSaveWord(owner, {
      term: "renderAuditFixture",
      language: "en",
      gloss: "Fixture word seeded by scripts/ui-render-audit.mjs so the vocabulary detail pane has something to render.",
    });
    if (!w || !w.id) return false;
    await pbpVocabBatchAddGroup([w.id], owner, "Render QA");
    return true;
  }, SEED_OWNER);
  if (!seeded) {
    console.error("[render-audit] vocab seed failed (pbpVocabSaveWord returned no id)");
    await ctx.close().catch(() => {});
    rmSync(userDataDir, { recursive: true, force: true });
    process.exit(2);
  }

  // Tag governance reads a LOCAL cache (options.js's renderTagGov ->
  // chrome.storage.local.cached_user_tags), never a live tags/get fetch on
  // render -- so a plural pair here reaches .tag-gov-kind-badge with no
  // network mocking needed. book/books is tag-gov.js's own simplest
  // heuristic case (_pluralizeCandidates: base + "s", base.length >= 3).
  await sw.evaluate((account) => chrome.storage.local.set({
    cached_user_tags: { account, counts: { book: 5, books: 3 }, timestamp: Date.now() },
  }), SEED_TOKEN_ACCOUNT);

  await sw.evaluate(() => chrome.storage.local.set({
    "pbp_hl_render-audit-fixture": {
      url: "https://example.com/render-audit-fixture",
      title: "Render Audit Fixture Page",
      items: [{
        id: "h1",
        ts: Date.now(),
        quote: "This is the highlighted passage used by the render audit fixture.",
        note: "A short fixture note for the render audit.",
        color: 1,
      }],
    },
  }));

  // One offline-queue record so popup's #offline-queue-bar (and its
  // #offline-queue-clear icon-only button) has something to render --
  // CLAUDE.md's offlineQueue shape: save mode, url/title/tags/note,
  // private/toread/archive flags, bookmark time, queue id/time, and the
  // non-secret Pinboard username it's bound to (no token).
  await sw.evaluate((owner) => chrome.storage.local.set({
    offlineQueue: [{
      queueId: "render-audit-1", queuedAt: Date.now(),
      url: "https://example.com/render-audit-fixture", title: "Render Audit Offline Fixture",
      account: owner, mode: "save", tags: "", note: "", private: false, toread: false, archive: false,
    }],
  }), SEED_TOKEN_ACCOUNT);

  const page = await ctx.newPage();

  if (SWEEP) {
    let hits = [];
    try {
      hits = await runSweep(page, sw, extBase);
    } finally {
      await page.close().catch(() => {});
      await ctx.close().catch(() => {});
      rmSync(userDataDir, { recursive: true, force: true });
    }
    reportSweep(hits);
    return;
  }

  const results = [];
  try {
    for (const surface of Object.keys(SURFACE_PAGES)) {
      const checks = CHECKS.filter((c) => c.surface === surface);
      if (!checks.length) continue;
      for (const theme of THEMES) {
        // popup-dark decodes to (themePresetKey:"", optTheme:"dark"), which
        // for options/library resolves to data-theme="flexoki-dark" via
        // PBP_OPTIONS_ADAPTIVE_MAP's fallback -- already covered by the
        // "flexoki-dark" THEMES entry, so re-running it under this surface
        // would just duplicate that run under a different label.
        if (theme === "popup-dark" && surface !== "popup") continue;
        const { themePresetKey, optTheme } = themeToStorage(theme);
        await setTheme(sw, themePresetKey, optTheme);
        if (surface === "library") await runLibraryTheme(page, extBase, theme, checks, results);
        else await runSimpleTheme(page, `${extBase}${SURFACE_PAGES[surface]}`, theme, checks, results, surface);
      }
    }
  } finally {
    await page.close().catch(() => {});
    await ctx.close().catch(() => {});
    rmSync(userDataDir, { recursive: true, force: true });
  }

  report(results);
}

main().catch((e) => {
  console.error(`[render-audit] fatal: ${e.stack || e.message}`);
  process.exit(2);
});
