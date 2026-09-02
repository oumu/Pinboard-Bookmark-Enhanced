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

import {
  CHECKS,
  THEMES,
  MEDIA_CHECKS,
  MEDIA_SCENARIOS,
  MEDIA_THEMES,
  evaluateMediaProbe,
} from "../tests/render-audit-checklist.mjs";
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
const MEDIA_THEME_SET = new Set(MEDIA_THEMES);

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
// list it serves). "" is not a real storage value -- it decodes to the
// (themePresetKey, optTheme) pair that PRODUCES the default-light state; the
// no-preset dark state is "flexoki-dark" on every surface (batch 2 D6). ----
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
  "nord-night", "terminal", "dracula", "flexoki-dark",
  "solarized-dark", "catppuccin-mocha", "gruvbox-dark", "rose-pine",
]);
function isDarkTheme(themeKey) { return DARK_THEME_IDS.has(themeKey); }

function themeToStorage(themeKey) {
  if (themeKey === "") return { themePresetKey: "", optTheme: "light" };
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
function probeSelector({ selector, compareSelector, extraBgVarName, radiusVarName, childSelectors, focusTargetSelector }) {
  const el = document.querySelector(selector);
  if (!el) return { found: false };
  const cs = getComputedStyle(el);
  // ---- §8 fused-control probes (design-uplift 2026-08-05). Both are opt-in
  // via the extra args so every other check pays nothing for them.
  // `children` feeds fusedChildrenFlat (law 1 + law 3: passengers draw no box
  // of their own, and whatever divider they DO draw is one colour at one
  // width). `focusedSelf` feeds fusedFocusRing (law 2: the ring is the
  // shell's, so the focused passenger must render none of its own).
  let children = null;
  if (childSelectors && childSelectors.length) {
    children = childSelectors.map((sel) => {
      const c = el.querySelector(sel);
      if (!c) return { sel, found: false };
      const ccs = getComputedStyle(c);
      return {
        sel, found: true,
        // A segmented control's SELECTED cell legitimately paints a fill --
        // that is the selection, and §8 law 4 puts selection/hover/press
        // feedback in exactly this ghost-fill register. The resting-fill
        // clause below is about a passenger painting its own CHROME, so it
        // only applies to cells that are not currently selected.
        isSelected: c.getAttribute("aria-pressed") === "true"
          || c.getAttribute("aria-selected") === "true"
          || c.classList.contains("active"),
        borderWidths: [ccs.borderTopWidth, ccs.borderRightWidth, ccs.borderBottomWidth, ccs.borderLeftWidth].map((v) => parseFloat(v) || 0),
        borderStyles: [ccs.borderTopStyle, ccs.borderRightStyle, ccs.borderBottomStyle, ccs.borderLeftStyle],
        borderColors: [ccs.borderTopColor, ccs.borderRightColor, ccs.borderBottomColor, ccs.borderLeftColor],
        radii: [ccs.borderTopLeftRadius, ccs.borderTopRightRadius, ccs.borderBottomRightRadius, ccs.borderBottomLeftRadius].map((v) => parseFloat(v) || 0),
        background: ccs.backgroundColor,
        // Feeds edgeClickable (independent review F2, hit-area-debt): a
        // ::before hit-pad's computed width/height (what hitAreaMin reads)
        // proves the BOX got bigger, not that a real pointer event lands
        // there -- a fused shell's `overflow: hidden` clips exactly that
        // silently (F1's own root cause). Two points just past this cell's
        // own top edge (§1.5's pads on these two shells are vertical-only,
        // so that is the one direction with something to prove), offset
        // ±3px from centre so a seam-adjacent miscalculation would show up
        // as a hit on the WRONG cell rather than a coincidental hit on
        // either. `elementFromPoint` must resolve inside this cell (itself
        // or a descendant, e.g. its svg icon) at both points.
        edgeHit: (() => {
          const r = c.getBoundingClientRect();
          const cx = r.left + r.width / 2, y = r.top - 1;
          const pts = [[cx - 3, y], [cx + 3, y]];
          const results = pts.map(([x, py]) => {
            const hit = document.elementFromPoint(x, py);
            return { x: +x.toFixed(2), y: +py.toFixed(2), ok: !!hit && (hit === c || c.contains(hit)), hitPath: hit ? (hit.id ? "#" + hit.id : hit.className || hit.tagName) : null };
          });
          return { ok: results.every((p) => p.ok), points: results };
        })(),
      };
    });
  }
  let focusedSelf = null;
  if (focusTargetSelector) {
    const f = focusTargetSelector === ":scope" ? el : el.querySelector(focusTargetSelector);
    if (f) {
      const fcs = getComputedStyle(f);
      focusedSelf = {
        sel: focusTargetSelector,
        isActiveElement: document.activeElement === f,
        outlineStyle: fcs.outlineStyle,
        outlineWidth: parseFloat(fcs.outlineWidth) || 0,
        // Load-bearing: fusedFocusRing now allows a segment's own ring but
        // requires it to be INSET. Without this field that comparison reads
        // `undefined >= 0` === false and the check silently never fires.
        outlineOffset: parseFloat(fcs.outlineOffset) || 0,
        boxShadow: fcs.boxShadow,
      };
    } else {
      focusedSelf = { sel: focusTargetSelector, found: false };
    }
  }
  // ---- §8 law 6 state-stability snapshot (design-uplift round 5). The
  // runner takes this in BOTH the rest and the focused pass and diffs them:
  // a fused control may change border-COLOUR and gain a ring on focus, and
  // nothing else. No geometry may shift by even a subpixel (border-WIDTH
  // changes are the classic cause), no background may repaint, and the
  // trailing icon must not move -- those three together are what "the eye
  // jumped / the field went white / the segment stopped looking attached"
  // reduce to, measured instead of eyeballed.
  const stability = { self: null, children: [] };
  {
    const cs2 = getComputedStyle(el), r2 = el.getBoundingClientRect();
    const svg2 = el.querySelector("svg");
    const sr2 = svg2 && svg2.getBoundingClientRect();
    stability.self = {
      rect: [+r2.x.toFixed(2), +r2.y.toFixed(2), +r2.width.toFixed(2), +r2.height.toFixed(2)],
      bg: cs2.backgroundColor,
      borderWidths: [cs2.borderTopWidth, cs2.borderRightWidth, cs2.borderBottomWidth, cs2.borderLeftWidth].join(","),
      svgCenter: sr2 ? [+(sr2.x + sr2.width / 2).toFixed(2), +(sr2.y + sr2.height / 2).toFixed(2)] : null,
    };
    for (const sel of (childSelectors || [])) {
      const c = el.querySelector(sel);
      if (!c) { stability.children.push({ sel, found: false }); continue; }
      const ccs = getComputedStyle(c), cr = c.getBoundingClientRect();
      const csvg = c.querySelector("svg");
      const csr = csvg && csvg.getBoundingClientRect();
      stability.children.push({
        sel, found: true,
        rect: [+cr.x.toFixed(2), +cr.y.toFixed(2), +cr.width.toFixed(2), +cr.height.toFixed(2)],
        bg: ccs.backgroundColor,
        borderWidths: [ccs.borderTopWidth, ccs.borderRightWidth, ccs.borderBottomWidth, ccs.borderLeftWidth].join(","),
        svgCenter: csr ? [+(csr.x + csr.width / 2).toFixed(2), +(csr.y + csr.height / 2).toFixed(2)] : null,
      });
    }
  }
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
    outlineColor: cs.outlineColor,
    outlineStyle: cs.outlineStyle,
    outlineWidth: parseFloat(cs.outlineWidth) || 0,
    outlineOffset: parseFloat(cs.outlineOffset) || 0,
    boxShadow: cs.boxShadow,
    borderColors: [cs.borderTopColor, cs.borderRightColor, cs.borderBottomColor, cs.borderLeftColor].join("|"),
    children,
    focusedSelf,
    stability,
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
    // COMPONENTS.md §9 law 3 (inset selection band). Read from the element
    // that PAINTS the band, which is not always the row element itself --
    // library's vocabulary rows paint on .notes-card-top inside .vocab-card.
    marginLeft: parseFloat(cs.marginLeft) || 0,
    marginRight: parseFloat(cs.marginRight) || 0,
    marginTop: parseFloat(cs.marginTop) || 0,
    marginBottom: parseFloat(cs.marginBottom) || 0,
    backgroundColor: cs.backgroundColor,
    // The surface's own radius rung, for insetBand's ladder comparison. Read
    // off <html> the same way extraBgVarName is -- a theme's radius scale is
    // a per-theme value, so an absolute px floor here would override the very
    // ladder §9.2 law 1 exists to keep authoritative (gruvbox-dark's md rung
    // is genuinely 2px; that is its design, not a regression).
    radiusVarPx: radiusVarName ? (parseFloat(getComputedStyle(document.documentElement).getPropertyValue(radiusVarName)) || 0) : null,
    borderBottomColor: cs.borderBottomColor,
    borderBottomWidth: parseFloat(cs.borderBottomWidth) || 0,
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
  if ("backgroundAlphaMax" in exp) {
    const parsed = parseRgba(raw.backgroundColor);
    const alpha = parsed?.[3];
    out.push(verdict(
      "backgroundAlphaMax",
      alpha != null && alpha <= exp.backgroundAlphaMax + 0.0001,
      alpha == null ? null : round2(alpha),
      exp.backgroundAlphaMax,
      alpha == null ? `unparseable computed background: ${raw.backgroundColor}` : undefined,
    ));
  }
  // A higher-specificity base rule (classically an #id selector) can leave a
  // state-driven class sitting inert in the DOM -- the class is there, the
  // cascade still paints the resting colour. Compares the SAME element's
  // composited background with and without `check.addClass` (see the
  // "classState" runner state) rather than asserting a literal colour, so
  // this works across all 16 themes without hand-copying a palette.
  if (exp.bgChangedFromRest === true) {
    if (!raw.restBgStack) out.push(verdict("bgChangedFromRest", false, null, null, "no rest baseline captured -- classState runner state required"));
    else {
      const restBg = compositeStack(raw.restBgStack);
      // .join(",") not `!==` (found chasing down independent review F2/F3,
      // 2026-08-08): compositeStack returns an RGB ARRAY, and `bg !== restBg`
      // compares two array REFERENCES -- always true, regardless of their
      // contents, since they're never the same object. This made the check
      // vacuously pass on every run, fixed code or broken: the F2/F3 settle-
      // timing hypothesis wasn't actually why the first version's RED test
      // looked clean, THIS was -- reverting E's id-specificity fix (which
      // should have failed this) still read 0 FAIL, and a debug trace showed
      // bg/restBg genuinely equal-by-value on the broken build while the
      // comparison still returned true. Same failure shape as comparing two
      // `new Date()` instances with `!==`.
      out.push(verdict("bgChangedFromRest", bg.join(",") !== restBg.join(","), bg, `!= ${restBg}`));
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
  // COMPONENTS.md §9 law 3: a list's hover/selected band is INSET -- rounded
  // enough to read at 1x, and held clear of the container on ALL FOUR sides.
  //
  // The first version of this check asked only for `min(marginLeft,
  // marginRight) >= 4` and `borderRadius > 0`, and it passed on an
  // implementation the user rejected on sight (USER CHECKPOINT 2026-08-05):
  // the band was inset 4px inline and 0px block, so it ran flush into the
  // row's top and bottom edges -- "像没对齐" -- and its radius was
  // --lib-radius-sm, which is 2px on paper-ink/dracula/solarized and simply
  // does not read as a corner at 1x. Neither fact violated the old
  // assertion. So the assertion was under-specified, not skipped: both
  // missing halves are now spelled out, `blockInsetPx` and `radiusVar`.
  // `radiusVar` names a RUNG, not a px floor -- an absolute floor would have
  // failed gruvbox-dark, whose md rung is legitimately 2px, and overriding a
  // theme's own ladder is the exact thing §9.2 law 1 forbids.
  // `actual` stays the worst inline inset (the number a fix moves first);
  // the other two failures name themselves in the note.
  if ("insetBand" in exp) {
    const { minInsetPx: min, blockInsetPx = 0, radiusVar = null } = exp.insetBand;
    if (hostZero) out.push(verdict("insetBand", false, null, min, zeroNote));
    else {
      const inline = Math.min(raw.marginLeft, raw.marginRight);
      const block = Math.min(raw.marginTop, raw.marginBottom);
      const notes = [];
      if (block < blockInsetPx - 0.01) notes.push(`block inset ${round2(block)}px < ${blockInsetPx}px -- the band runs flush into the row's top/bottom edges`);
      if (radiusVar) {
        if (raw.radiusVarPx == null) notes.push(`--${radiusVar} did not resolve on <html>`);
        else if (Math.abs(raw.borderRadius - raw.radiusVarPx) > 0.5) notes.push(`border-radius ${round2(raw.borderRadius)}px is not this surface's ${radiusVar} rung (${raw.radiusVarPx}px)`);
      }
      out.push(verdict("insetBand", inline >= min - 0.01 && notes.length === 0, round2(inline), min,
        notes.length ? notes.join("; ") : undefined));
    }
  }
  // ---- bandDistinct: the row states a user has to tell apart at a glance
  // must actually LOOK different, on every theme. Written for the vocabulary
  // list's 2026-08-06 selection rebuild, where "selected" stopped being a
  // checkbox and became the row's own fill -- at which point "selected" and
  // "current" (the row the detail pane is reading) are two accent-tinted
  // fills a token change could quietly collapse into one.
  //
  // A pair passes if EITHER the composited fill differs by at least
  // `minDelta` per-channel-max, OR the two carry different markers
  // (box-shadow/outline). Both halves are needed: the fills are legitimately
  // close on some themes and it is the accent edge that separates them there,
  // while on others there is no edge at all and the fill is the whole signal.
  // Reported `actual` is the WORST pair, so a fix moves the number that is
  // actually failing.
  if ("bandDistinct" in exp) {
    const minDelta = exp.bandDistinct.minDelta;
    const samples = raw.bandSamples || [];
    const notes = [];
    let worst = null;
    if (samples.length < 2) notes.push("fewer than two states captured -- runOneCheck's rowStates driver failed");
    const minText = exp.bandDistinct.minTextContrast;
    if (minText) {
      for (const sm of samples) {
        if (!sm.found) continue;
        if (!sm.text) { notes.push(`"${sm.state}": textSelector matched nothing`); continue; }
        const tbg = compositeStack(sm.text.bgStack);
        const fg = resolveColor(sm.text.color, tbg);
        const ratio = fg ? cr(fg, tbg) : 0;
        if (ratio < minText) notes.push(`"${sm.state}": row text ${round2(ratio)}:1 < ${minText}:1 against its own band`);
      }
    }
    // Pairs the checklist names as FILL-ONLY: the marker escape hatch is
    // switched off for them, so the fill itself has to clear minDelta.
    // Without this the "OR a different marker" clause silently disarms the
    // check for exactly the pair whose fill was the thing being tuned --
    // independent review proved it by reverting the selected band from 18%
    // to 10% and watching the gate stay green, because `selected` carries a
    // ring that `rest` does not and the delta branch was therefore never
    // reached. Ask what the simplest missed counter-example looks like.
    const fillOnly = new Set((exp.bandDistinct.fillOnlyPairs || []).map((pair) => [...pair].sort().join("~")));
    for (let i = 0; i < samples.length; i++) {
      for (let j = i + 1; j < samples.length; j++) {
        const a = samples[i], b = samples[j];
        if (!a.found || !b.found) { notes.push(`state not rendered: ${a.found ? b.state : a.state}`); continue; }
        const abg = compositeStack(a.bgStack), bbg = compositeStack(b.bgStack);
        const delta = Math.max(Math.abs(abg[0] - bbg[0]), Math.abs(abg[1] - bbg[1]), Math.abs(abg[2] - bbg[2]));
        const fillMustCarry = fillOnly.has([a.state, b.state].sort().join("~"));
        const markerDiffers = !fillMustCarry && (a.boxShadow !== b.boxShadow || a.outline !== b.outline);
        if (worst === null || delta < worst) worst = delta;
        if (delta < minDelta && !markerDiffers) {
          notes.push(fillMustCarry
            ? `"${a.state}" and "${b.state}" must be told apart by FILL alone: delta ${round2(delta)} < ${minDelta} (this pair's marker is excluded on purpose -- the band is the whole signal)`
            : `"${a.state}" and "${b.state}" are indistinguishable: fill delta ${round2(delta)} < ${minDelta} and identical marker (box-shadow ${a.boxShadow})`);
        }
      }
    }
    out.push(verdict("bandDistinct", notes.length === 0, worst === null ? null : round2(worst), minDelta,
      notes.length ? notes.join("; ") : undefined));
  }
  // COMPONENTS.md §9 law 7: a tab is a label plus a selection edge, never a
  // button wearing a tab label. Selected = an accent underline of at least
  // `underlinePx`; unselected = no underline. BOTH branches additionally
  // assert "no shell", which is the half that actually regressed (the
  // pre-2026-08-05 tabs carried a fill, a border and a radius).
  if ("tabChrome" in exp) {
    const want = exp.tabChrome.activeUnderline;
    if (hostZero) out.push(verdict("tabChrome", false, null, want, zeroNote));
    else {
      const alpha = (c) => { const m = /rgba?\([^)]*?,\s*([0-9.]+)\s*\)/.exec(c || ""); return m ? parseFloat(m[1]) : (c && c !== "transparent" ? 1 : 0); };
      const underline = alpha(raw.borderBottomColor) > 0 ? raw.borderBottomWidth : 0;
      const notes = [];
      if (alpha(raw.backgroundColor) > 0) notes.push(`tab paints a fill (${raw.backgroundColor}) -- a tab has no shell`);
      if (raw.borderRadius > 0) notes.push(`tab has border-radius ${round2(raw.borderRadius)}px -- a tab has no shell`);
      const okUnderline = want ? underline >= (exp.tabChrome.underlinePx ?? 2) - 0.01 : underline === 0;
      if (!okUnderline) notes.push(want ? `selected tab underline is ${round2(underline)}px` : `unselected tab paints a ${round2(underline)}px underline`);
      out.push(verdict("tabChrome", notes.length === 0, round2(underline), want, notes.length ? notes.join("; ") : undefined));
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
  // beforeExists (design-uplift, preset-row redesign, 2026-08-04): asserts a
  // host's ::before pseudo-element actually renders (non-zero size), not
  // just that `content` is declared -- reuses the --sweep discovery mode's
  // own measurePseudo("::before") result (containmentChildren), which
  // already excludes a `content:""` rule that never got a real box (e.g. a
  // selector typo or a display:none ancestor). Preset row's swatch dot is
  // the first consumer: `.preset-btn::before` / `.theme-preset-btn::before`
  // have no other DOM signal a render oracle can key off of (pseudo-elements
  // aren't `document.querySelector`-able).
  if (exp.beforeExists === true) {
    const ok = raw.containmentChildren.some((c) => c.kind === "::before");
    out.push(verdict("beforeExists", ok, ok, true, ok ? null : "no rendered ::before pseudo-element (zero-size or content:none)"));
  }
  // outlineContrast (design-uplift, preset-row redesign, 2026-08-04): the
  // selection ring's outline-color vs the REAL composited background it
  // paints over. Deliberately NOT bg (bgStack composited through the host's
  // OWN background, i.e. compositeStack(raw.bgStack)) -- outline-offset:2px
  // (COMPONENTS.md's "ring 不贴内容" contract) puts the ring OUTSIDE the
  // host's border box, sitting on the PARENT's paint, not under the host's
  // own fill. bgStack[0] is the host's own backgroundColor (probeSelector
  // walks self -> parent -> ...), so slicing it off before compositing is
  // the one-line fix that makes this the parent-and-up stack instead.
  // WCAG 1.4.11 non-text 3:1 floor, same class as focusRingContrast
  // (COMPONENTS.md §3.3) -- scoped to the preset row's .active ring here,
  // not a blanket audit of every existing accent-colored outline in the
  // codebase (out of scope for this change; see preset-variants-report.md).
  if ("outlineContrast" in exp) {
    if (disabledSkip) out.push(skip("outlineContrast", exp.outlineContrast, "disabled (WCAG 1.4.3 exempt)"));
    else if (!raw.outlineStyle || raw.outlineStyle === "none") {
      out.push(verdict("outlineContrast", false, null, exp.outlineContrast, "no outline rendered (outline-style: none)"));
    } else {
      const parentBg = compositeStack(raw.bgStack.slice(1));
      const oc = resolveColor(raw.outlineColor, parentBg);
      const ratio = oc ? cr(oc, parentBg) : 0;
      out.push(verdict("outlineContrast", ratio >= exp.outlineContrast, round2(ratio), exp.outlineContrast));
    }
  }
  if (exp.colorSchemeMatchesTheme === true) {
    const expectedScheme = isDarkTheme(theme) ? "dark" : "light";
    const actual = raw.rootColorScheme || "";
    out.push(verdict("colorSchemeMatchesTheme", actual.includes(expectedScheme), actual, expectedScheme));
  }
  // ---- §8 fused-control laws (design-uplift 2026-08-05) ----
  // law 1 + law 3, measured on the passengers: a fused control's pieces draw
  // no box of their own (no radius, no fill, and at most the ONE border side
  // that acts as the divider), and every divider that is drawn agrees on
  // colour and width. The "at most one side" shape is what distinguishes a
  // divider from a box -- requiring a flat zero would outlaw the divider the
  // law explicitly permits.
  if (exp.fusedChildrenFlat) {
    const want = exp.fusedChildrenFlat.children || [];
    // COMPONENTS.md §9.2 law 2 exception (independent review F1, hit-area-
    // debt): law 1's "no independent radius" below has one documented carve-
    // out -- the FIRST and LAST cell of a shell whose corners touch the
    // shell's own rounded edge may round exactly those two OUTER corners
    // (TL+BL for the first cell, TR+BR for the last) to nest concentrically
    // inside it. Every other corner, on every cell, must still be exactly 0
    // -- this is opt-in per checklist entry (`concentricEnds: true`) so
    // every OTHER fused control (e.g. .notes-hit-btn) keeps the strict
    // all-zero rule with no change here.
    const concentricEnds = !!exp.fusedChildrenFlat.concentricEnds;
    const got = raw.children || [];
    const bad = [];
    const dividers = [];
    want.forEach((sel, idx) => {
      const c = got.find((x) => x.sel === sel);
      if (!c) { bad.push(`${sel}: not probed`); return; }
      if (!c.found) { bad.push(`${sel}: not found inside host`); return; }
      const sides = c.borderWidths
        .map((w, i) => ({ w, style: c.borderStyles[i], color: c.borderColors[i] }))
        .filter((s) => s.w > 0 && s.style !== "none");
      if (sides.length > 1) bad.push(`${sel}: ${sides.length} border sides (max 1 divider)`);
      // Radii index order matches probeSelector's [TL, TR, BR, BL].
      const allowedRadiusIdx = concentricEnds
        ? (idx === 0 ? [0, 3] : idx === want.length - 1 ? [1, 2] : [])
        : [];
      if (c.radii.some((r, i) => r > 0 && !allowedRadiusIdx.includes(i))) {
        bad.push(`${sel}: own border-radius ${c.radii.join("/")}`);
      }
      // alpha 0 == "transparent". A passenger that paints its own resting
      // fill is drawing chrome, which is the shell's job. Selected cells are
      // exempt (see isSelected in probeSelector): their fill IS the selection
      // state, not chrome.
      if (!c.isSelected) {
        const m = /rgba?\(([^)]+)\)/.exec(c.background || "");
        const alpha = m ? (parseFloat(m[1].split(",")[3]) || (m[1].split(",").length < 4 ? 1 : 0)) : 1;
        if (alpha > 0) bad.push(`${sel}: own resting background ${c.background}`);
      }
      for (const s of sides) dividers.push(`${s.w}px ${s.color}`);
    });
    const uniqueDividers = [...new Set(dividers)];
    if (uniqueDividers.length > 1) bad.push(`dividers disagree: ${uniqueDividers.join(" vs ")}`);
    out.push(verdict("fusedChildrenFlat", bad.length === 0, bad.length ? bad.join("; ") : `${want.length} flat, divider=${uniqueDividers[0] || "none"}`, true));
  }
  // edgeClickable (independent review F2, hit-area-debt): hitAreaMin's
  // family-4 sweep and this checklist's per-selector geometry both only
  // read the ::before pad's COMPUTED width/height -- proof the BOX grew,
  // not that a pointer event landed there. A fused shell's `overflow`
  // clips exactly that silently (F1's own root cause: reverting
  // `.vocab-sort-seg`/`.vocab-group-unit` to `overflow: hidden` leaves
  // hitAreaMin's computed-style number unchanged while real clicks 1-2px
  // past the border-box start missing). probeSelector already sampled two
  // points just past each named cell's own top edge (§1.5's pads on these
  // two shells are vertical-only) and recorded whether elementFromPoint
  // resolved inside that cell; this just asserts the wired-through result.
  if (exp.edgeClickable) {
    const want = exp.edgeClickable.children || [];
    const got = raw.children || [];
    const bad = [];
    for (const sel of want) {
      const c = got.find((x) => x.sel === sel);
      if (!c) { bad.push(`${sel}: not probed`); continue; }
      if (!c.found) { bad.push(`${sel}: not found inside host`); continue; }
      if (!c.edgeHit || !c.edgeHit.ok) {
        const missed = (c.edgeHit?.points || []).filter((p) => !p.ok)
          .map((p) => `(${p.x},${p.y})->${p.hitPath || "nothing"}`).join(", ");
        bad.push(`${sel}: edge point(s) missed the cell -- ${missed || "no edgeHit data"}`);
      }
    }
    out.push(verdict("edgeClickable", bad.length === 0, bad.length ? bad.join("; ") : `${want.length} cell(s), all edge points resolve inside`, true));
  }
  // law 2, measured on the shell while a passenger holds focus. Three things
  // have to hold at once, and the third is the one the user actually reported
  // twice: a ring drawn on an inner piece stops short of the unit and gets
  // painted over by its neighbour, so the ring MUST be the shell's own and
  // MUST grow outward from the shell's border box (outline-offset >= 0, or a
  // non-inset box-shadow) rather than inward.
  if (exp.fusedFocusRing === true) {
    const bad = [];
    const hasOutline = raw.outlineStyle && raw.outlineStyle !== "none" && raw.outlineWidth > 0;
    const hasShadow = raw.boxShadow && raw.boxShadow !== "none";
    if (!hasOutline && !hasShadow) bad.push("shell renders no focus indicator (:focus-within not firing?)");
    if (hasOutline && raw.outlineOffset < 0) bad.push(`shell outline-offset ${raw.outlineOffset}px pulls the ring inside its own box`);
    if (!hasOutline && hasShadow && /inset/.test(raw.boxShadow)) bad.push("shell ring is an INSET shadow (paints inside the border box)");
    // the shell must actually have CHANGED -- an unconditional border colour
    // would satisfy "has an indicator" while :focus-within did nothing.
    if (raw.focusBaseline) {
      const same = raw.focusBaseline.borderColors === raw.borderColors
        && raw.focusBaseline.boxShadow === raw.boxShadow
        && raw.focusBaseline.outlineStyle === raw.outlineStyle;
      if (same) bad.push("shell computed style identical focused vs unfocused (:focus-within has no effect)");
    } else {
      bad.push("no unfocused baseline captured (runner did not pre-probe)");
    }
    if (raw.focusedSelf && raw.focusedSelf.found === false) bad.push(`focus target ${raw.focusedSelf.sel} not found`);
    else if (raw.focusedSelf) {
      if (!raw.focusedSelf.isActiveElement) bad.push(`${raw.focusedSelf.sel} is not document.activeElement`);
      // The segment MAY carry the standard button ring to say which piece
      // holds focus (user ruling, round 6: an invented per-segment vocabulary
      // -- a fill, then an underline -- was rejected twice; the answer is the
      // language used everywhere else, not a new one). What it may not do is
      // let that ring grow OUTWARD, where it would cross the shell's chrome
      // and collide with the shell's own :focus-within ring. So the rule is
      // no longer "no outline" but "any outline must be inset".
      if (raw.focusedSelf.outlineStyle !== "none" && raw.focusedSelf.outlineWidth > 0
          && raw.focusedSelf.outlineOffset >= 0) {
        bad.push(`${raw.focusedSelf.sel} draws a ${raw.focusedSelf.outlineWidth}px outline at offset `
          + `${raw.focusedSelf.outlineOffset}px -- a segment's ring must be inset (negative offset) so it stays inside the unit`);
      }
      if (raw.focusedSelf.boxShadow && raw.focusedSelf.boxShadow !== "none") {
        bad.push(`${raw.focusedSelf.sel} paints its own box-shadow (${raw.focusedSelf.boxShadow}) -- `
          + `inset shadows on fractionally positioned segments leak sub-pixel hairlines, use an inset outline`);
      }
    }
    out.push(verdict("fusedFocusRing", bad.length === 0, bad.length ? bad.join("; ") : `shell ring ok (${hasOutline ? `outline ${raw.outlineWidth}px @${raw.outlineOffset}` : "box-shadow"})`, true));
  }
  // §8 law 6: rest <-> focus state stability. Three invariants, all measured
  // on the same elements in both passes:
  //   (1) zero displacement -- every rect (shell and each named segment)
  //       identical to the subpixel. border-WIDTH changes are the usual
  //       culprit, so widths are reported alongside to name the cause.
  //   (2) no repaint -- background-color unchanged on shell and segments.
  //   (3) the trailing icon does not move -- svg centre unchanged.
  if (exp.fusedStateStable === true) {
    const bad = [];
    const a = raw.stabilityBaseline, b = raw.stability;
    if (!a || !b) bad.push("no rest baseline captured (runner did not pre-probe)");
    else {
      const cmp = (label, x, y) => {
        if (!x || !y) return;
        if (JSON.stringify(x.rect) !== JSON.stringify(y.rect)) {
          bad.push(`${label} moved/resized ${JSON.stringify(x.rect)} -> ${JSON.stringify(y.rect)}`
            + (x.borderWidths !== y.borderWidths ? ` (border-width ${x.borderWidths} -> ${y.borderWidths})` : ""));
        } else if (x.borderWidths !== y.borderWidths) {
          bad.push(`${label} border-width ${x.borderWidths} -> ${y.borderWidths}`);
        }
        if (x.bg !== y.bg) bad.push(`${label} background ${x.bg} -> ${y.bg}`);
        if (JSON.stringify(x.svgCenter) !== JSON.stringify(y.svgCenter)) {
          bad.push(`${label} icon centre ${JSON.stringify(x.svgCenter)} -> ${JSON.stringify(y.svgCenter)}`);
        }
      };
      cmp("shell", a.self, b.self);
      for (const cb of b.children) {
        const ca = (a.children || []).find((x) => x.sel === cb.sel);
        if (!ca || !ca.found || !cb.found) { bad.push(`${cb.sel}: not probed in both passes`); continue; }
        cmp(cb.sel, ca, cb);
      }
    }
    out.push(verdict("fusedStateStable", bad.length === 0, bad.length ? bad.join("; ") : "rest == focus (rect, bg, icon)", true));
  }
  // §7.3 focus-ring conformance (2026-08-06: ONE language, three PLACEMENTS).
  // Measured on the focused element itself (state "focusWithin" with
  // focusTarget ":scope"), so what is checked is the shape the LIVE cascade
  // produced, not the shape some rule declares.
  //   bordered   the control's own frame is the core: outline suppressed,
  //              border-color moves to --{ns}-focus-bd, --{ns}-focus-ring glow
  //   borderless no frame to re-tint: 1px accent core growing outward + glow
  //   inset      list rows and fused cells: 2px core pulled INSIDE the box,
  //              no shadow (these elements' selected/current states already
  //              own box-shadow and a second one would replace it)
  //
  // DELIBERATELY SHAPE-AGNOSTIC about the glow. --{ns}-focus-ring is per-theme
  // IDENTITY, not a constant: terminal ships a 6px phosphor blur, paper-ink a
  // flat `0 0 0 1px`, solarized a translucent `0 0 0 2px`. Asserting any one
  // literal would either fail 13 themes or force them all to look alike. What
  // IS asserted is theme-invariant: a non-inset shadow exists, and it is
  // DIFFERENT from the same element's unfocused baseline -- which is what
  // proves the focus rule fired and that the value came from the token rather
  // than from some unrelated resting shadow.
  if (exp.focusRecipe) {
    const hasOutline = raw.outlineStyle && raw.outlineStyle !== "none" && raw.outlineWidth > 0;
    const hasShadow = raw.boxShadow && raw.boxShadow !== "none" && !/inset/.test(raw.boxShadow);
    const base = raw.focusBaseline;
    const shadowChanged = base ? base.boxShadow !== raw.boxShadow : false;
    const bad = [];
    if (!base) bad.push("no unfocused baseline captured (runner did not pre-probe)");
    if (exp.focusRecipe === "bordered") {
      if (hasOutline) bad.push(`draws a ${raw.outlineWidth}px outline (the bordered placement suppresses it — the frame IS the core)`);
      if (!hasShadow) bad.push("no --focus-ring glow");
      if (base && !shadowChanged) bad.push("box-shadow identical focused vs unfocused (focus rule never fired)");
      if (base && base.borderColors === raw.borderColors) {
        bad.push("border-color unchanged on focus — a themed rest rule is probably out-ranking the focus rule");
      }
    } else if (exp.focusRecipe === "borderless") {
      if (!hasOutline) bad.push("no outline core (the glow alone is not a legible indicator)");
      else if (raw.outlineOffset < 0) bad.push(`outline-offset ${raw.outlineOffset}px pulls the core inward (that is the inset placement)`);
      if (!hasShadow) bad.push("no --focus-ring glow (borderless is core + glow)");
      if (base && !shadowChanged) bad.push("box-shadow identical focused vs unfocused (focus rule never fired)");
    } else if (exp.focusRecipe === "inset") {
      if (!hasOutline) bad.push("no outline core");
      else if (raw.outlineWidth < 2) bad.push(`outline ${raw.outlineWidth}px < 2px`);
      else if (raw.outlineOffset >= 0) bad.push(`outline-offset ${raw.outlineOffset}px grows outward — an inset core must stay inside its own box`);
      if (hasShadow) bad.push(`paints a non-inset box-shadow (${raw.boxShadow}) — the inset placement is outline-only so it cannot collide with a row's selected-state shadow`);
    } else {
      bad.push(`unknown focusRecipe "${exp.focusRecipe}"`);
    }
    // When the probed element is NOT the focus target, the ring is being
    // carried on behalf of a passenger (§8 law 2: .notes-card-head defers its
    // ring to the whole row, because the head spans only the first of the
    // row's three grid columns). Then the passenger must draw nothing of its
    // own -- otherwise the result is the two-rings-at-once defect, which a
    // check that only looked at the carrier would happily pass.
    const passenger = raw.focusedSelf;
    if (passenger && passenger.found !== false && exp.focusRecipe !== undefined
        && passenger.sel !== ":scope") {
      if (passenger.outlineStyle !== "none" && passenger.outlineWidth > 0) {
        bad.push(`${passenger.sel} draws its own ${passenger.outlineWidth}px outline as well — the ring is carried by ${check.selector}, so the passenger must draw none`);
      }
      if (passenger.boxShadow && passenger.boxShadow !== "none") {
        bad.push(`${passenger.sel} paints its own box-shadow (${passenger.boxShadow}) alongside the carried ring`);
      }
    }
    out.push(verdict("focusRecipe", bad.length === 0, bad.length ? bad.join("; ")
      : `${exp.focusRecipe}: outline=${hasOutline ? raw.outlineWidth + "px@" + raw.outlineOffset : "none"} shadow=${hasShadow ? "changed" : "no"}`, exp.focusRecipe));
  }
  // §8 law 2, BUTTON flavour (2026-08-06). A fused unit that takes no text
  // entry draws NO shell ring: the focused cell's own inset ring is the whole
  // indicator. Both halves are asserted, because either one alone is the
  // defect the user reported -- a shell ring with no cell ring cannot say
  // WHICH cell has focus, and a shell ring PLUS a cell ring is the double
  // rectangle that got .vocab-sort-seg rejected.
  if (exp.fusedSegmentRing === true) {
    const bad = [];
    const base = raw.focusBaseline;
    if (!base) bad.push("no unfocused baseline captured (runner did not pre-probe)");
    else {
      const shellChanged = base.borderColors !== raw.borderColors
        || base.boxShadow !== raw.boxShadow || base.outlineStyle !== raw.outlineStyle;
      if (shellChanged) {
        bad.push(`shell reacted to focus (border ${base.borderColors} -> ${raw.borderColors}, `
          + `shadow ${base.boxShadow} -> ${raw.boxShadow}, outline ${base.outlineStyle} -> ${raw.outlineStyle}) `
          + "— a pure button group's indicator belongs on the focused cell only");
      }
    }
    const f = raw.focusedSelf;
    if (!f || f.found === false) bad.push(`focus target ${f ? f.sel : "(none)"} not found`);
    else {
      if (!f.isActiveElement) bad.push(`${f.sel} is not document.activeElement`);
      if (f.outlineStyle === "none" || !(f.outlineWidth > 0)) bad.push(`${f.sel} draws no ring of its own`);
      else if (f.outlineOffset >= 0) bad.push(`${f.sel} ring grows outward (offset ${f.outlineOffset}px) — it must stay inside the cell`);
      if (f.boxShadow && f.boxShadow !== "none") {
        bad.push(`${f.sel} paints its own box-shadow (${f.boxShadow}) — inset shadows leak sub-pixel hairlines on fractionally positioned cells`);
      }
    }
    out.push(verdict("fusedSegmentRing", bad.length === 0, bad.length ? bad.join("; ")
      : `cell ring only (${raw.focusedSelf?.outlineWidth}px @${raw.focusedSelf?.outlineOffset})`, true));
  }
  return { results: out };
}

// COMPONENTS.md's `{ns}` notation: the token-name prefix each surface's
// generated CSS variables use (--lib-*/--opt-*/--pp-*). Only textContrastMulti
// needs this (to turn a checklist-declared role like "btn-hover" into the
// actual custom-property name to read).
const NS_BY_SURFACE = { library: "lib", options: "opt", popup: "pp" };

// ---- state: "rowStates" (2026-08-06 selection rebuild) -------------------
// Reads ONE row's band four times, driving it through every state a user can
// put it in with the real gestures: nothing, Ctrl+click (selected), plain
// click (activates the detail -> selected AND current), Ctrl+click again
// (current only). aria-current is exclusive and the fixture seeds one word,
// so the states cannot coexist on screen -- but they do not need to: what
// has to be true is that a user can TELL THEM APART, which is a statement
// about four fills and four markers, not about four simultaneous rows.
//
// Everything here is a real product gesture, including the reload that gets
// back to "rest" (there is no un-activate control above 860px). The sequence
// ends on selected+current, byte-for-byte the state runLibraryTheme's own
// setup clicks produce, so every later check in the same theme pass sees the
// page it expects.
async function driveRowStates(page, extBase, theme, selector, textSelector) {
  const read = (sel, textSel, state) => page.evaluate(({ sel, textSel, state }) => {
    const stackOf = (node) => {
      const out = [];
      for (let n = node; n && n.nodeType === 1; n = n.parentElement) out.push(getComputedStyle(n).backgroundColor);
      return out;
    };
    const el = document.querySelector(sel);
    if (!el) return { state, found: false };
    const cs = getComputedStyle(el);
    // The row's text has to stay readable in EVERY state, not just the one
    // the page happens to load in -- a band fill that gets strong enough to
    // separate two states can just as easily eat its own label.
    const textEl = textSel ? el.querySelector(textSel) : null;
    return {
      state, found: true, bgStack: stackOf(el), boxShadow: cs.boxShadow,
      outline: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}`,
      text: textEl ? { color: getComputedStyle(textEl).color, bgStack: stackOf(textEl) } : null,
    };
  }, { sel, textSel, state });

  // Both library lists share one selection grammar, so one driver serves both;
  // the view is read off the selector the same way runLibraryTheme reads it.
  const view = libraryView(selector);
  const rowSel = view === "notes" ? "#notes-list .notes-hit-btn" : "#vocab-list .vocab-card .notes-card-head";
  // The query carries the VIEW as well as the theme. Without it the notes pass
  // and the vocab pass differ only by fragment, and Chromium then treats the
  // second goto as a same-document navigation and never reloads -- so the
  // notes driver would inherit whatever aria-current the vocab pass (and the
  // setup clicks before it) had already put on a row, and read its very first
  // "rest" sample out of an already-current row. Same footgun runLibraryTheme
  // documents at its own goto.
  await page.goto(`${extBase}library.html?_ra=${encodeURIComponent(theme)}-band-${view}#${view}`, { waitUntil: "load", timeout: TIMEOUT_MS });
  await page.waitForSelector(rowSel, { timeout: TIMEOUT_MS });
  await page.waitForTimeout(300);
  const head = page.locator(rowSel).first();
  if (!(await head.count())) {
    throw new Error(`SETUP: no ${view} row to drive rowStates on (theme=${theme})`);
  }
  // Park the pointer in a dead corner before every read. A click leaves the
  // cursor sitting ON the row, so without this each sample is really that
  // state's HOVER variant -- and each state has a different hover formula, so
  // the whole comparison would be between four numbers none of which is the
  // state it claims to be. (Found the hard way: "current" measured 4.45:1
  // text contrast, which is the hover mix, while the token derivation that
  // actually guarantees 4.5:1 targets the resting fill.)
  const settle = async () => { await page.mouse.move(0, 0); await page.waitForTimeout(280); };
  await settle();
  const samples = [await read(selector, textSelector, "rest")];
  await head.click({ modifiers: ["Control"] }); await settle();
  samples.push(await read(selector, textSelector, "selected"));
  await head.click(); await settle();
  samples.push(await read(selector, textSelector, "selected+current"));
  await head.click({ modifiers: ["Control"] }); await settle();
  samples.push(await read(selector, textSelector, "current"));
  // Restore the state the rest of this theme's checks were set up in.
  await head.click({ modifiers: ["Control"] }); await page.waitForTimeout(300);
  return samples;
}


// ---- state: "paneFit" (2026-08-06 narrow-width overflow report) -----------
// Walks the viewport across the widths the entry names and class-scans EVERY
// element inside the named panes for one thing: did it escape the pane's
// content box. Deliberately a class scan rather than a list of selectors --
// the reported defect (`a.notes-row-open`, an inline <a> whose max-width /
// overflow / text-ellipsis are all inert per CSS 2.1 while its inherited
// white-space: nowrap is not) would have been caught by a hand-enumerated
// probe only if someone had already thought to enumerate it.
//
// What it does NOT assert: scrollWidth > clientWidth. That is the normal,
// correct state of every ellipsised single-line element, and reporting it
// buries the real finding under false positives (measured: 5 of them on the
// first run of this sweep, against 1 real).
const PANE_FIT_SCAN = ({ panes, tolerance }) => {
  const hits = [];
  const nameOf = (el) => {
    const cls = (el.className && typeof el.className === "string")
      ? "." + el.className.trim().split(/\s+/).join(".") : "";
    return el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + cls;
  };
  for (const paneSel of panes) {
    const pane = document.querySelector(paneSel);
    if (!pane) { hits.push({ pane: paneSel, el: paneSel, kind: "paneMissing", over: 0 }); continue; }
    const pr = pane.getBoundingClientRect();
    const pcs = getComputedStyle(pane);
    const right = pr.right - (parseFloat(pcs.paddingRight) || 0) - (parseFloat(pcs.borderRightWidth) || 0);
    const left = pr.left + (parseFloat(pcs.paddingLeft) || 0) + (parseFloat(pcs.borderLeftWidth) || 0);
    if (pane.scrollWidth > pane.clientWidth + tolerance) {
      hits.push({ pane: paneSel, el: paneSel, kind: "paneScroll", over: +(pane.scrollWidth - pane.clientWidth).toFixed(2) });
    }
    for (const el of pane.querySelectorAll("*")) {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden" || cs.position === "fixed") continue;
      if (el.closest("[hidden]")) continue;
      // Screen-reader-only labels are parked off-canvas on purpose.
      if (el.classList.contains("sr-only") || el.closest(".sr-only")) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (r.right > right + tolerance) hits.push({ pane: paneSel, el: nameOf(el), kind: "pastRightEdge", over: +(r.right - right).toFixed(2) });
      else if (r.left < left - tolerance) hits.push({ pane: paneSel, el: nameOf(el), kind: "pastLeftEdge", over: +(left - r.left).toFixed(2) });
    }
  }
  return hits;
};

async function drivePaneFit(page, check) {
  const { widths, panes, tolerancePx = 1, resetNarrowDetail = false } = check.expect.paneFit;
  const restore = page.viewportSize();
  const found = [];
  try {
    // Opt-in (debt-sweep 2026-08-07): runLibraryTheme's needsDetailOpen click
    // is decided once per THEME across the whole vocabChecks batch, not per
    // check -- if anything else in that batch is a `-detail-` selector
    // (there always is), `body.lib-narrow-detail` is already set by the time
    // this check runs, whatever width this entry asks for. That class is
    // inert at the wide default viewport (both panes sit side by side
    // regardless), but becomes live the moment this resizes below 860px,
    // hiding `.vocab-list-pane` out from under a check that wanted to
    // measure ITS header rows -- not a real defect, a leftover click from an
    // unrelated check earlier in the same theme's batch. Entries that are
    // deliberately probing the single-pane DETAIL state (existing 900+
    // width entries testing both panes together) must NOT set this.
    if (resetNarrowDetail) await page.evaluate(() => document.body.classList.remove("lib-narrow-detail"));
    for (const width of widths) {
      await page.setViewportSize({ width, height: restore ? restore.height : 900 });
      await page.waitForTimeout(250);
      for (const hit of await page.evaluate(PANE_FIT_SCAN, { panes, tolerance: tolerancePx })) {
        found.push({ ...hit, width });
      }
    }
  } finally {
    if (restore) await page.setViewportSize(restore);
    await page.waitForTimeout(250);
  }
  return found;
}


// ---- state: "headerRowsFlush" (list header, round 2) ---------------------
// The header's whole point is that every row runs the full width of the list
// column -- the version this replaced lost its right edge whenever a row
// wrapped or a non-shrinking unit dropped. Measures, per row: the row's own
// width against the column's, and the gap between the row's right edge and
// its right-most visible child.
//
// Both halves are needed and neither implies the other. A row can be full
// width and still end 40px short of its last control (the old count row did
// exactly that: an empty status span with `margin-left: auto` ate the slack),
// and a row can hug its contents perfectly while being narrower than the
// column. `expected` is the tolerance in px.
const HEADER_ROWS_SCAN = ({ rows, columnSel }) => {
  const col = document.querySelector(columnSel);
  if (!col) return { error: `column not found: ${columnSel}` };
  const colW = col.getBoundingClientRect().width;
  const out = [];
  for (const sel of rows) {
    const el = document.querySelector(sel);
    if (!el) { out.push({ sel, missing: true }); continue; }
    if (getComputedStyle(el).display === "none") { out.push({ sel, hidden: true }); continue; }
    const r = el.getBoundingClientRect();
    // Only children that actually OCCUPY the row count. A zero-width child
    // sitting at the right edge satisfies "something reaches the edge" while
    // showing nothing -- which is the exact pre-fix defect here: an empty
    // status span with `margin-left: auto` parked itself flush right and left
    // the real last control ("Select all") stranded 40px inboard. Measured:
    // this check passed that layout until zero-width children were excluded.
    // Out-of-flow children are skipped for the same reason (sr-only labels).
    const kids = [...el.children].filter((k) => {
      const cs = getComputedStyle(k);
      if (cs.display === "none" || cs.position === "absolute" || cs.position === "fixed") return false;
      const kr = k.getBoundingClientRect();
      return kr.width > 0.5 && kr.height > 0.5;
    });
    const right = kids.length ? Math.max(...kids.map((k) => k.getBoundingClientRect().right)) : r.right;
    out.push({ sel, widthGap: +(colW - r.width).toFixed(2), edgeGap: +(r.right - right).toFixed(2) });
  }
  return { colW: +colW.toFixed(2), rows: out };
};

async function driveHeaderRows(page, check) {
  const { rows, columnSel, widths, tolerancePx = 1, mayVanish = [] } = check.expect.headerRowsFlush;
  // Fail-closed (independent review F3, 2026-08-07). This used to `continue`
  // on ANY row whose computed display was none, which is a silent exemption
  // for the loudest possible defect: a header row that disappears entirely
  // would report zero violations. Only rows the checklist NAMES as legitimately
  // absent get the pass; #vocab-stats is the one -- it is `hidden` in the
  // markup until the first render has counts to put in it.
  const vanishOk = new Set(mayVanish);
  const restore = page.viewportSize();
  const bad = [];
  let worst = 0;
  try {
    for (const width of widths) {
      await page.setViewportSize({ width, height: restore ? restore.height : 900 });
      await page.waitForTimeout(250);
      const res = await page.evaluate(HEADER_ROWS_SCAN, { rows, columnSel });
      if (res.error) { bad.push(`${width}px: ${res.error}`); continue; }
      for (const row of res.rows) {
        if (row.missing) { bad.push(`${width}px: ${row.sel} not in the DOM`); continue; }
        if (row.hidden) {
          if (!vanishOk.has(row.sel)) bad.push(`${width}px: ${row.sel} renders display:none — the whole row is gone`);
          continue;
        }
        worst = Math.max(worst, Math.abs(row.widthGap), Math.abs(row.edgeGap));
        if (Math.abs(row.widthGap) > tolerancePx) bad.push(`${width}px: ${row.sel} is ${row.widthGap}px narrower than the column`);
        if (Math.abs(row.edgeGap) > tolerancePx) bad.push(`${width}px: ${row.sel} ends ${row.edgeGap}px short of its last control`);
      }
    }
  } finally {
    if (restore) await page.setViewportSize(restore);
    await page.waitForTimeout(250);
  }
  return { bad, worst: +worst.toFixed(2) };
}

// ---- state: "gapMin" (debt-sweep 2026-08-07) -------------------------------
// The narrow-screen lookup door's 12px clearance from the sort segment
// (library.css, ".vocab-filter-row > .vocab-lookup-narrow") had no assertion
// at all -- the comment above that rule spells out "8px row gap + 4px = a
// full 12px step clear of the sort segment, so [it] does not read as a third
// cell welded onto it," and nothing measured that the extra 4px margin
// actually survives. Simplest missed counter-example: delete the
// `margin-left` declaration and the gap silently collapses to the row's
// plain 8px flex gap -- welded-on, exactly what the comment says it must not
// look like.
const GAP_MIN_SCAN = ({ fromSel, toSel }) => {
  const a = document.querySelector(fromSel), b = document.querySelector(toSel);
  if (!a) return { error: `not found: ${fromSel}` };
  if (!b) return { error: `not found: ${toSel}` };
  // Symmetric (independent review F5, 2026-08-08): the first version only
  // checked `b`. A hidden `a` collapses to an all-zero rect too, and
  // `br.left - 0` reads as a large POSITIVE number -- a false PASS, not the
  // false FAIL a missing check usually produces. Simplest counter-example:
  // hide fromSel (`.vocab-sort-seg`) at this width and the old code read a
  // comfortably-over-12px gap instead of erroring.
  if (getComputedStyle(a).display === "none") return { error: `${fromSel} is display:none at this width` };
  if (getComputedStyle(b).display === "none") return { error: `${toSel} is display:none at this width` };
  const ar = a.getBoundingClientRect(), br = b.getBoundingClientRect();
  return { gap: +(br.left - ar.right).toFixed(2) };
};
async function driveGapMin(page, check) {
  const { width, fromSel, toSel } = check.expect.gapMin;
  const restore = page.viewportSize();
  let result;
  try {
    // Same reset as drivePaneFit's resetNarrowDetail, unconditional here
    // since this function has exactly one caller and it always wants list
    // view: this checks a LIST-header gap, which only exists to measure
    // while `.vocab-list-pane` is the visible pane. Without it, a `-detail-`
    // check earlier in the same theme's shared vocabChecks batch (see
    // runLibraryTheme) leaves `body.lib-narrow-detail` set from an
    // unrelated click, which this check's <860px resize then activates,
    // hiding both probed elements and reading a false gap=0.
    await page.evaluate(() => document.body.classList.remove("lib-narrow-detail"));
    await page.setViewportSize({ width, height: restore ? restore.height : 900 });
    await page.waitForTimeout(250);
    result = await page.evaluate(GAP_MIN_SCAN, { fromSel, toSel });
  } finally {
    if (restore) await page.setViewportSize(restore);
    await page.waitForTimeout(250);
  }
  return result;
}

async function runOneCheck(page, theme, check, results, extBase) {
  if (check.state === "headerRowsFlush") {
    const { bad, worst } = await driveHeaderRows(page, check);
    results.push({ surface: check.surface, theme, selector: check.selector, state: check.state,
      ...verdict("headerRowsFlush", bad.length === 0, worst, check.expect.headerRowsFlush.tolerancePx ?? 1,
        bad.length ? bad.slice(0, 4).join("; ") : undefined) });
    return;
  }
  if (check.state === "paneFit") {
    const hits = await drivePaneFit(page, check);
    const worst = hits.reduce((m, h) => Math.max(m, h.over), 0);
    const note = hits.length
      ? hits.slice(0, 4).map((h) => `${h.kind} +${h.over}px ${h.el} at ${h.width}px (pane ${h.pane})`).join("; ")
      : undefined;
    results.push({ surface: check.surface, theme, selector: check.selector, state: check.state,
      ...verdict("paneFit", hits.length === 0, round2(worst), 0, note) });
    return;
  }
  if (check.state === "gapMin") {
    const min = check.expect.gapMin.min;
    const result = await driveGapMin(page, check);
    const ok = !result.error && result.gap >= min;
    results.push({ surface: check.surface, theme, selector: check.selector, state: check.state,
      ...verdict("gapMin", ok, result.error ? null : result.gap, min, result.error) });
    return;
  }
  if (check.state === "rowStates") {
    if (!extBase) throw new Error(`rowStates check on ${check.selector} reached a runner that has no extBase`);
    const samples = await driveRowStates(page, extBase, theme, check.selector, check.expect.bandDistinct?.textSelector || null);
    const evald = evaluateCheck(check, { found: true, rect: { width: 1, height: 1 }, bgStack: [], bandSamples: samples }, theme);
    if (evald.setupError) {
      throw new Error(`SETUP ERROR [${check.surface}|${theme}|${check.selector}|${check.state}]: ${evald.setupError}`);
    }
    for (const r of evald.results) results.push({ surface: check.surface, theme, selector: check.selector, state: check.state, ...r });
    return;
  }
  // ---- state: "focusWithin" (design-uplift §8) ----------------------------
  // Reads the shell TWICE -- once untouched, once while `check.focusTarget`
  // (a selector relative to the shell) holds focus -- so fusedFocusRing can
  // prove the :focus-within rule actually changed something rather than just
  // that some indicator happens to exist.
  //
  // Two Chromium behaviours this has to work around, both of which silently
  // produced "no ring" readings while debugging:
  //   - focus styling is transitioned (`transition: box-shadow 150ms`), and a
  //     computed read in the same task as .focus() returns the t=0
  //     interpolation of `none`, i.e. a transparent zero-size shadow. Hence
  //     the settle wait before the second read.
  //   - :focus-visible only matches a <button> when the last input modality
  //     was the keyboard. A script .focus() leaves the modality unset, so a
  //     stepper's own outline would measure absent no matter what the CSS
  //     said -- and this check's whole job is to assert that outline is
  //     absent. Pressing a real key first makes the assertion meaningful
  //     instead of vacuous.
  let focusBaseline = null;
  let stabilityBaseline = null;
  let restBgStack = null;
  if (check.state === "classState") {
    // A class-driven state override (debt-sweep 2026-08-07, first use:
    // #submit-btn.saved-success/.save-error). Reads the SAME element's
    // background twice -- once untouched, once with `check.addClass` applied
    // -- so bgChangedFromRest can prove the override actually repainted
    // something rather than that a class merely got added. This is what a
    // higher-specificity base rule (e.g. an #id selector) silently defeats:
    // the class lands in the DOM, the cascade still paints the old colour.
    if (!Array.isArray(check.addClass) || !check.addClass.length) {
      throw new Error(`classState check on ${check.selector} has no addClass`);
    }
    // `removeClass`/`clearDisabled` (both optional, debt-sweep 2026-08-07
    // fix round): mirror the REAL DOM mutation the state machine this
    // targets performs, not just the one class add. #submit-btn's own
    // setSubmitState() always does `classList.remove("loading",
    // "saved-success", "save-error")` + `disabled = false` before adding the
    // new state class -- skipping that here meant the "rest" baseline this
    // captures could be measuring whatever OTHER state (disabled, a
    // different .btn class) the element happened to be left in, not the
    // idle resting cascade the fix actually has to out-rank. Applied to
    // BOTH the baseline read and the target-state read, so they differ by
    // exactly one class the way the real state machine's transitions do.
    const mirror = async () => page.evaluate(({ selector, removeCls, clearDisabled }) => {
      const el = document.querySelector(selector);
      if (!el) return;
      if (removeCls && removeCls.length) el.classList.remove(...removeCls);
      if (clearDisabled) el.disabled = false;
    }, { selector: check.selector, removeCls: check.removeClass || null, clearDisabled: !!check.clearDisabled });
    await mirror();
    restBgStack = await page.evaluate(({ selector }) => {
      const el = document.querySelector(selector);
      if (!el) return null;
      const stack = [];
      for (let node = el; node && node.nodeType === 1; node = node.parentElement) stack.push(getComputedStyle(node).backgroundColor);
      return stack;
    }, { selector: check.selector });
    await page.evaluate(({ selector, cls }) => {
      document.querySelector(selector)?.classList.add(...cls);
    }, { selector: check.selector, cls: check.addClass });
    // Same settle discipline as focusWithin below (:1405): `.btn`'s
    // `transition: background var(--pp-motion-state), ...` means a read
    // taken in the same task as classList.add() can land mid-interpolation
    // instead of at the transition's target value.
    await page.waitForTimeout(260);
  }
  if (check.state === "focusWithin") {
    if (!check.focusTarget) throw new Error(`focusWithin check on ${check.selector} has no focusTarget`);
    focusBaseline = await page.evaluate(({ selector }) => {
      const el = document.querySelector(selector);
      if (!el) return null;
      const cs = getComputedStyle(el);
      return {
        borderColors: [cs.borderTopColor, cs.borderRightColor, cs.borderBottomColor, cs.borderLeftColor].join("|"),
        boxShadow: cs.boxShadow,
        outlineStyle: cs.outlineStyle,
      };
    }, { selector: check.selector });
    // The REST pass for fusedStateStable. Taken through the same probe the
    // focused pass uses, so the two snapshots are structurally identical and
    // a diff can only mean the CSS changed something -- not that two
    // different measurement paths disagree.
    if (check.expect.fusedStateStable === true) {
      const rest = await page.evaluate(probeSelector, {
        selector: check.selector, compareSelector: null, extraBgVarName: null, radiusVarName: null,
        childSelectors: check.expect.fusedStateStableChildren || null,
        focusTargetSelector: null,
      });
      stabilityBaseline = rest.stability || null;
    }
    await page.keyboard.press("Shift");
    const focused = await page.evaluate(({ selector, target }) => {
      const el = document.querySelector(selector);
      // ":scope" = focus the probed element itself, for controls that ARE the
      // focus target (§7.3 focusRecipe checks) rather than shells wrapping one
      // (§8 fusedFocusRing checks). el.querySelector(":scope") never matches,
      // so this needs the explicit branch.
      const t = el && (target === ":scope" ? el : el.querySelector(target));
      if (!t) return false;
      t.focus();
      return document.activeElement === t;
    }, { selector: check.selector, target: check.focusTarget });
    if (!focused) throw new Error(`SETUP: could not focus "${check.focusTarget}" inside ${check.selector} (theme=${theme})`);
    await page.waitForTimeout(260);
  } else if (check.state === "hover") {
    // Real mouse hover (not a class hack): Playwright dispatches actual
    // pointer events, so the live cascade's own `:hover` pseudo-class match
    // drives getComputedStyle exactly the way a real user's cursor would --
    // no need to fake it by toggling a class the CSS never checks for.
    await page.hover(check.selector);
    // Read the settled state, not the first interpolation frame. Buttons
    // transition background/color for --*-motion-state; an immediate read
    // can serialize the 0% frame as transparent oklab(), making a hover
    // assertion accidentally inspect the resting paint.
    await page.waitForTimeout(260);
  } else if (check.state !== "default" && check.state !== "classState") {
    throw new Error(`unsupported state "${check.state}" on ${check.selector} -- extend runOneCheck() before adding non-default states to the checklist`);
  }
  const extraBgSelectorVar = check.expect.textContrastMulti?.extraBgSelectorVar;
  const raw = await page.evaluate(probeSelector, {
    selector: check.selector,
    compareSelector: check.expect.heightEqWith?.selector || null,
    extraBgVarName: extraBgSelectorVar ? `--${NS_BY_SURFACE[check.surface]}-${extraBgSelectorVar}` : null,
    radiusVarName: check.expect.insetBand?.radiusVar ? `--${NS_BY_SURFACE[check.surface]}-${check.expect.insetBand.radiusVar}` : null,
    childSelectors: check.expect.fusedChildrenFlat?.children || check.expect.fusedStateStableChildren || check.expect.edgeClickable?.children || null,
    focusTargetSelector: check.state === "focusWithin" ? check.focusTarget : null,
  });
  if (focusBaseline) raw.focusBaseline = focusBaseline;
  if (stabilityBaseline) raw.stabilityBaseline = stabilityBaseline;
  if (restBgStack) raw.restBgStack = restBgStack;
  if (check.state === "classState") {
    // Same discipline as the hover-pointer reset below: leaving the class on
    // would leak into the next check that reads this same element in its
    // "default" state.
    await page.evaluate(({ selector, cls }) => {
      document.querySelector(selector)?.classList.remove(...cls);
    }, { selector: check.selector, cls: check.addClass });
  }
  if (check.state === "focusWithin") {
    // Blur before the next check reads anything: a left-over :focus-within on
    // this shell would leak its focused border-colour into every later
    // default-state read on the same page, exactly the way a parked mouse
    // pointer leaks :hover (see the hover reset just below).
    await page.evaluate(() => document.activeElement?.blur());
    // Must outlast the SAME transition the focus read waits 260ms for. At the
    // old 120ms the next check's "unfocused baseline" was captured mid-fade:
    // measured `rgba(51,255,51,0.004) 0 0 0.04px` and interpolated oklab()
    // border colours, i.e. a shell that looked like it had reacted to focus
    // when it had merely not finished un-reacting. That reads as a real
    // difference to any assertion comparing rest against focus.
    await page.waitForTimeout(260);
  }
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
    // focusWithin folds the focused passenger into the recorded state: the
    // same shell gets one entry per tab stop, and keyOf() is
    // surface|theme|selector|state|check -- without this they would all
    // collapse onto one known-failures key and shadow each other.
    const state = check.state === "focusWithin" ? `focusWithin[${check.focusTarget}]` : check.state;
    results.push({ surface: check.surface, theme, selector: check.selector, state, ...r });
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
  // §8 fused-control entries probe the shell, not the ids inside it.
  "#vocab-batch-toolbar .vocab-group-unit",
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
      // Ctrl+click the row head. The per-row checkbox was removed 2026-08-06
      // (user ruling: the row's own fill IS the selected state), so the
      // modified click that replaced it is the only way to open the batch
      // bar. Same row the detail-open click above uses, exactly as the
      // checkbox click did -- the seeded fixture has one word.
      const head = page.locator("#vocab-list .vocab-card .notes-card-head").first();
      if (!(await head.count())) {
        throw new Error(`SETUP: no "#vocab-list .vocab-card .notes-card-head" to reveal .vocab-batch-bar (theme=${theme}) -- seed fixture broken or markup renamed`);
      }
      await head.click({ modifiers: ["Control"] });
      await page.waitForTimeout(350);
    }
    for (const check of vocabChecks) await runOneCheck(page, theme, check, results, extBase);
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
    for (const check of notesChecks) await runOneCheck(page, theme, check, results, extBase);
  }
}

async function runSimpleTheme(page, url, theme, checks, results, surface, sw) {
  // .saved-theme-btn only renders once storage has at least one entry
  // (options.js renderSavedThemes(), read once at init via syncGetLarge) --
  // seed it BEFORE the navigation below, the same way pinboardToken is
  // seeded elsewhere in this file. Idempotent across the per-theme loop that
  // calls this function repeatedly, so no cleanup is needed.
  if (surface === "options" && checks.some((c) => c.selector === ".saved-theme-btn")) {
    await sw.evaluate(() => chrome.storage.local.set({ savedThemes: [{ name: "debt-sweep probe", css: "body{}" }] }));
  }
  await page.goto(url, { waitUntil: "load", timeout: TIMEOUT_MS });
  await page.waitForTimeout(500); // settles the theme-early async storage.get correction
  if (surface === "popup" && checks.some((c) => c.selector === "#offline-queue-clear")) {
    // Was NOT actually a storage-write race (debt-sweep 2026-08-07 root
    // cause): showOfflineQueueStatus() used to sit after popup.js's
    // unsupported-URL early `return`, so it never ran AT ALL when the
    // popup's own tab isn't a plain http(s) page -- which every direct
    // navigation to popup.html is, harness included. Fixed in popup.js by
    // moving the call earlier.
    //
    // No manual `window.PPOffline.refresh()` call here any more
    // (independent review F4, 2026-08-08): a fixture-side re-trigger of the
    // exact function the fix makes automatic would silently mask a
    // regression of that fix -- popup.js could regress back to skipping
    // showOfflineQueueStatus() and this block would still force the bar
    // visible, and every check below would keep reading PASS. This wait is
    // now pure observation: if the automatic on-load path is doing its job,
    // #offline-queue-bar loses `.hidden` well within the timeout (measured:
    // well under 500ms) with no help from here. If it doesn't, this throws
    // instead of the checks below silently reading a hidden/zero-size
    // element as passing.
    await page.waitForSelector("#offline-queue-bar:not(.hidden)", { timeout: TIMEOUT_MS });
  }
  // popup's main UI (and the markdown strip inside it) ship `class="hidden"`
  // and are un-hidden by popup.js only after it resolves the active tab's
  // bookmark state -- something a plain fixture page cannot produce. Dropping
  // the class is fixture setup of exactly the same kind as library's
  // needsDetailOpen/needsBatchBarOpen clicks: none of the rules under test
  // (focus placement, themed twins) reads `.hidden`, they just need the
  // element to have a box and be focusable. Without this, popup was the one
  // surface with ZERO live focus coverage -- and it is the surface whose
  // hand-written themed override layer made five bordered sites need
  // per-theme focus twins in the first place (COMPONENTS.md C45).
  //
  // The submit bar needs three more pieces of the same kind of setup, all of
  // them consequences of the fixture page being its own chrome-extension://
  // URL, which popup.js correctly treats as unsaveable: it puts
  // `.unsupported-url` on #main-section (whose CSS display:none's every
  // .form-body child except the warning, submit bar included), it DISABLES
  // Save, and the Delete button ships `.hidden` until a bookmark is found.
  // None of those is a state worth auditing -- a display:none control has no
  // box to measure and cannot be focused, and a :disabled one is exempt from
  // contrast (WCAG 1.4.3, the runner SKIPs it) -- so leaving them as-is
  // would have turned every submit-bar assertion into a silent SKIP dressed
  // up as coverage.
  if (surface === "popup" && checks.some((c) => c.state === "focusWithin"
      || c.selector === "#submit-btn" || c.selector === ".del-btn")) {
    const shown = await page.evaluate(() => {
      const main = document.getElementById("main-section");
      const strip = document.getElementById("md-actions-strip");
      main?.classList.remove("hidden", "unsupported-url");
      strip?.classList.remove("hidden");
      const del = document.getElementById("delete-btn");
      const submit = document.getElementById("submit-btn");
      del?.classList.remove("hidden");
      if (submit) submit.disabled = false;
      return !!main && !!strip && !!del && !!submit;
    });
    if (!shown) throw new Error(`SETUP: popup.html is missing #main-section / #md-actions-strip / #delete-btn / #submit-btn (theme=${theme})`);
    await page.waitForTimeout(120);
  }
  // popup's confirm popover only exists after a destructive action is
  // clicked. #logout-link is the cheapest opener that reaches the SHARED
  // showConfirmPopover() path (the same helper every other popup confirm
  // uses), and confirming is not automatic -- the probe reads the popover
  // and the run ends without ever pressing Yes. Without this, the solid
  // danger tier had zero live coverage on popup: it is emitted into the
  // generated region, but the only thing that could catch a hand-written
  // themed override re-outranking it is a per-theme render of the real
  // thing (COMPONENTS.md §7.1's two-door rule -- the static half lives in
  // tests/ui-contract-tests.mjs).
  //
  // Opened LAST, in its own group immediately before its own checks, rather
  // than here in shared setup: the popover light-dismisses on focusout
  // (showConfirmPopover in shared.js), so the §8 focusWithin probes that come
  // earlier in the popup checklist -- .qbtn, .md-strip-btn -- move focus onto
  // a real element outside it and close it exactly the way a user tabbing
  // away would. Same per-group setup discipline the options branch below
  // spells out: a setup step must run next to the checks that need it, not
  // once at the top for a loop that runs much later.
  const confirmChecks = surface === "popup"
    ? checks.filter((c) => c.selector.startsWith(".confirm-popover"))
    : [];
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
    // presetRowChecks (design-uplift, preset-row redesign, 2026-08-04):
    // .theme-preset-btn.active only exists once SOME preset is selected --
    // reuses the exact same "click flexoki on the appearance tab" step
    // presetPreviewChecks already needs (both groups just need any preset
    // active; there is nothing flexoki-specific about either check), so
    // it's folded into that same click rather than a second one.
    const presetRowChecks = checks.filter((c) => c.selector === ".theme-preset-btn.active");
    const presetPreviewChecks = checks.filter((c) => c.selector.startsWith("#preset-preview-section"));
    // .saved-theme-btn (debt-sweep 2026-08-07): same #panel-appearance tab as
    // the preset-row group above, so it reuses that group's #tab-appearance
    // click rather than a third one. Storage was seeded before goto() (see
    // runSimpleTheme's top), so the button already exists once the tab is
    // active -- no extra click of its own needed.
    const savedThemeChecks = checks.filter((c) => c.selector === ".saved-theme-btn");
    // .key-wrap lives in #panel-general. It is visible on a bare goto(), but
    // the tagGov and preset groups above BOTH click their way to another tab
    // first, so by the time otherChecks runs the general panel is
    // display:none and its controls cannot even take focus (a §8 focusWithin
    // check fails at setup, which is how this was found). Click back
    // explicitly rather than depending on group order.
    const keyWrapChecks = checks.filter((c) => c.selector === ".key-wrap");
    const otherChecks = checks.filter((c) => !tagGovChecks.includes(c) && !presetPreviewChecks.includes(c)
      && !presetRowChecks.includes(c) && !savedThemeChecks.includes(c) && !keyWrapChecks.includes(c));
    if (tagGovChecks.length) {
      // .tag-gov-kind-badge lives on the "tags" tab (#panel-tags), not
      // #panel-general (the default active one on a bare goto()) -- its
      // panel is `display:none` until #tab-tags is clicked, which is what
      // renderTagGov()'s init actually hangs off of.
      await page.click("#tab-tags");
      await page.waitForSelector(".tag-gov-kind-badge", { timeout: TIMEOUT_MS });
      for (const check of tagGovChecks) await runOneCheck(page, theme, check, results);
    }
    if (presetPreviewChecks.length || presetRowChecks.length || savedThemeChecks.length) {
      // #preset-preview-section is `style="display:none"` (options.html)
      // until options.js's renderPresetPreview() sees a non-empty
      // currentPresetKey -- click a site-theme preset button on the
      // "appearance" tab (same tab panel the summary lives on) to reveal
      // it. This is a DIFFERENT preset system from the THEMES loop this
      // runner is already iterating (that one is the extension UI's own
      // popup/options/library chrome; this is the pinboard.in SITE theme
      // picker) -- picking "flexoki" here is unrelated to and doesn't
      // fight with whichever THEMES entry is currently active. The same
      // click also satisfies presetRowChecks: it's what puts .active on a
      // .theme-preset-btn in the first place.
      await page.click("#tab-appearance");
      await page.click(".theme-preset-btn[data-theme='flexoki']");
      await page.waitForSelector("#preset-preview-section:not([style*='display: none'])", { timeout: TIMEOUT_MS });
      for (const check of presetPreviewChecks) await runOneCheck(page, theme, check, results);
      for (const check of presetRowChecks) await runOneCheck(page, theme, check, results);
      if (savedThemeChecks.length) {
        await page.waitForSelector(".saved-theme-btn", { timeout: TIMEOUT_MS });
        for (const check of savedThemeChecks) await runOneCheck(page, theme, check, results);
      }
    }
    if (keyWrapChecks.length) {
      await page.click("#tab-general");
      await page.waitForSelector(".key-wrap input", { state: "visible", timeout: TIMEOUT_MS });
      for (const check of keyWrapChecks) await runOneCheck(page, theme, check, results);
    }
    for (const check of otherChecks) await runOneCheck(page, theme, check, results);
    return;
  }
  const confirmSet = new Set(confirmChecks);
  for (const check of checks) {
    if (confirmSet.has(check)) continue;
    await runOneCheck(page, theme, check, results);
  }
  if (confirmChecks.length) {
    await page.evaluate(() => { document.getElementById("main-section")?.classList.remove("hidden"); });
    await page.click("#logout-link");
    await page.waitForSelector(".confirm-popover .confirm-yes", { timeout: TIMEOUT_MS });
    await page.waitForTimeout(150);
    for (const check of confirmChecks) await runOneCheck(page, theme, check, results);
  }
}

// Runs inside the page. It reports used values and structural state only;
// the Node side owns contrast math so it reuses this audit's existing WCAG
// primitives instead of introducing a second colour implementation.
const MEDIA_DOM_PROBE = ({ check, query, focusBaseline }) => {
  const visibleColor = (value) => {
    const color = String(value || "").trim().toLowerCase();
    if (!color || color === "transparent") return false;
    return !/^rgba\([^)]*,\s*0(?:\.0+)?\s*\)$/.test(color);
  };
  const describe = (element) => {
    if (!element) return { found: false, visible: false };
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return {
      found: true,
      visible: rect.width > 0 && rect.height > 0
        && style.display !== "none" && style.visibility !== "hidden"
        && Number.parseFloat(style.opacity || "1") > 0,
    };
  };
  const focusStyle = (element) => {
    if (!element) return null;
    const style = getComputedStyle(element);
    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth) || 0,
      outlineOffset: Number.parseFloat(style.outlineOffset) || 0,
      outlineColor: style.outlineColor,
      boxShadow: style.boxShadow,
      borderStyles: [style.borderTopStyle, style.borderRightStyle, style.borderBottomStyle, style.borderLeftStyle],
      borderWidths: [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth]
        .map((value) => Number.parseFloat(value) || 0),
      borderColors: [style.borderTopColor, style.borderRightColor, style.borderBottomColor, style.borderLeftColor],
    };
  };
  // Chromium's forced-colors emulation can resolve an authored 1px outline
  // to 0.666667 CSS px. The invariant here is structural presence, not a
  // thickness rung: any positive used width is a real non-colour carrier.
  const outlineVisible = (style) => !!style && style.outlineWidth > 0
    && style.outlineStyle !== "none" && visibleColor(style.outlineColor);
  const shadowVisible = (style) => !!style && style.boxShadow !== "none"
    && visibleColor(style.boxShadow);
  const borderVisible = (style, index, minimum = 1) => !!style
    && style.borderWidths[index] >= minimum && style.borderStyles[index] !== "none"
    && visibleColor(style.borderColors[index]);
  const focusCue = (before, after) => {
    if (!after) return false;
    const outlineAppeared = outlineVisible(after) && (!outlineVisible(before)
      || before.outlineWidth !== after.outlineWidth
      || before.outlineStyle !== after.outlineStyle
      || before.outlineOffset !== after.outlineOffset);
    const shadowAppeared = shadowVisible(after) && (!shadowVisible(before) || before.boxShadow !== after.boxShadow);
    const borderAppeared = [0, 1, 2, 3].some((index) => borderVisible(after, index)
      && (!borderVisible(before, index)
        || before.borderWidths[index] !== after.borderWidths[index]
        || before.borderStyles[index] !== after.borderStyles[index]));
    return outlineAppeared || shadowAppeared || borderAppeared;
  };

  const textElement = document.querySelector(check.text);
  const text = describe(textElement);
  if (textElement) {
    text.color = getComputedStyle(textElement).color;
    text.bgStack = [];
    for (let node = textElement; node && node.nodeType === 1; node = node.parentElement) {
      text.bgStack.push(getComputedStyle(node).backgroundColor);
    }
  }

  const controlElement = document.querySelector(check.control);
  const control = describe(controlElement);

  const focusElement = document.querySelector(check.focus);
  const focus = describe(focusElement);
  const focusedStyle = focusStyle(focusElement);
  focus.active = !!focusElement && document.activeElement === focusElement;
  focus.cue = focusCue(focusBaseline, focusedStyle);
  focus.style = focusedStyle;

  let selected = null;
  if (check.selected) {
    const selectedElement = document.querySelector(check.selected);
    selected = describe(selectedElement);
    if (selectedElement) {
      const style = focusStyle(selectedElement);
      const ariaCurrent = selectedElement.getAttribute("aria-current");
      selected.selected = selectedElement.getAttribute("aria-selected") === "true"
        || selectedElement.getAttribute("aria-pressed") === "true"
        || (ariaCurrent != null && ariaCurrent !== "false")
        || selectedElement.classList.contains("active")
        || selectedElement.matches(":checked");
      selected.cue = outlineVisible(style) || shadowVisible(style)
        || [0, 1, 2, 3].some((index) => borderVisible(style, index, 2));
    }
  }

  return {
    queryMatches: matchMedia(query).matches,
    text,
    control,
    focus,
    selected,
  };
};

async function prepareMediaSurface(page, surface, theme) {
  if (surface === "popup") {
    const ready = await page.evaluate(() => {
      const main = document.getElementById("main-section");
      const submit = document.getElementById("submit-btn");
      main?.classList.remove("hidden", "unsupported-url");
      if (submit) submit.disabled = false;
      return !!main && !!submit;
    });
    if (!ready) throw new Error(`MEDIA SETUP: popup controls missing (theme=${theme})`);
  } else if (surface === "options") {
    await page.click("#tab-general");
  } else if (surface === "library") {
    await page.click("#lib-tab-vocab");
    await page.waitForSelector("#vocab-list .notes-card-head", { state: "visible", timeout: TIMEOUT_MS });
    await page.evaluate(() => document.body.classList.remove("lib-narrow-detail"));
  }
  await page.evaluate(() => document.activeElement?.blur());
  await page.waitForTimeout(260);
}

async function captureMediaProbe(page, scenario, check) {
  const baseline = await page.evaluate(MEDIA_DOM_PROBE, {
    check,
    query: scenario.query,
    focusBaseline: null,
  });
  await page.keyboard.press("Shift");
  const focused = await page.evaluate((selector) => {
    const element = document.querySelector(selector);
    if (!element) return false;
    element.focus();
    return document.activeElement === element;
  }, check.focus);
  if (!focused) throw new Error(`MEDIA SETUP: could not focus ${check.focus}`);
  await page.waitForTimeout(260);

  const probe = await page.evaluate(MEDIA_DOM_PROBE, {
    check,
    query: scenario.query,
    focusBaseline: baseline.focus?.style || null,
  });
  // Keep selection independent from the focus ring: otherwise the selected
  // cue could pass only because the selected tab also happened to be focused.
  probe.selected = baseline.selected;
  if (probe.text?.found) {
    const background = compositeStack(probe.text.bgStack || []);
    const foreground = resolveColor(probe.text.color, background);
    probe.text.contrast = foreground ? round2(cr(foreground, background)) : null;
  }
  return probe;
}

async function runMediaPreferenceChecks(page, cdp, surface, theme, results) {
  const check = MEDIA_CHECKS.find((entry) => entry.surface === surface);
  if (!check) throw new Error(`MEDIA SETUP: no hand-written check for ${surface}`);
  await prepareMediaSurface(page, surface, theme);

  let probes = 0;
  for (const scenario of MEDIA_SCENARIOS) {
    await cdp.send("Emulation.setEmulatedMedia", { features: scenario.features });
    try {
      await page.waitForTimeout(120);
      const probe = await captureMediaProbe(page, scenario, check);
      const selectorByCheck = {
        mediaQuery: scenario.query,
        textVisible: check.text,
        textContrast: check.text,
        controlVisible: check.control,
        focusCue: check.focus,
        selectedCue: check.selected,
      };
      for (const verdict of evaluateMediaProbe(probe, check)) {
        results.push({
          surface,
          theme,
          selector: selectorByCheck[verdict.check] || check.control,
          state: `media:${scenario.id}`,
          ...verdict,
        });
      }
      probes += 1;
    } finally {
      await cdp.send("Emulation.setEmulatedMedia", { features: [] });
      await page.evaluate(() => document.activeElement?.blur());
      await page.waitForTimeout(260);
    }
  }
  return probes;
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
  // flex/grid wrapper (e.g. .vocab-sort-seg, a span wrapping two buttons, or
  // .vocab-group-unit wrapping a field and its two steppers) so the
  // comparison reaches controls that aren't literal DOM siblings but ARE the
  // same visual row. ----
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

  // ---- 4. hitAreaMin (design-uplift final-fix I2 -- generalized from the
  // two hand-enumerated §1.4 CHECKS entries this replaces): every icon-only
  // <button> -- no direct non-whitespace text node, the same USER RULING
  // scope the hand-enumerated entries already used -- needs an effective
  // hit area >=24px on its short side. "Effective" includes the §1.5
  // ::before hit-area expansion (probeSelector's copy of this same
  // Chromium-resolves-used-px-values trick has the full rationale); a host
  // with no ::before, or one that isn't position:absolute, just falls back
  // to its own border-box rect. Unlike families 1-3 above, this one's hits
  // are wired into the pass/fail gate (see runSweep's caller in main()),
  // not left as --sweep-only discovery -- geometry/spacing in this codebase
  // is a hand-maintained, theme-INVARIANT layer (CLAUDE.md: --pp-sp-*/
  // --opt-sp-*/--lib-sp-* "是主题不变量...不进 composer"), so one pass here
  // already covers every data-theme preset; no per-theme repeat needed.
  //
  // Selector widened from "button" to "button, [role='button']" (popup
  // button-family campaign, 2026-08-07). The old scope was anchored on the
  // TAG NAME, so an icon-only control built as `<span role="button"
  // tabindex="0">` -- which is a button to every assistive technology and to
  // the user's finger -- was structurally invisible to this gate no matter
  // how small it got. That is the "断言问得太窄等于没门" shape: the simplest
  // counter-example the old scan missed is popup's `.recent-bm-del` (13px
  // cross glyph in 0 2px padding). Surveyed before widening: the only
  // role="button" sites in shipped code are popup.js's three spans
  // (.edit-cancel, .recent-bm-edit, .recent-bm-del) and md-translate.js's
  // (not an audited surface); options.css/library.css have zero, so this
  // cannot manufacture new failures on the other two surfaces.
  for (const el of document.querySelectorAll("button, [role='button']")) {
    if (!visible(el)) continue;
    // Full textContent, not just direct child text nodes: setBtnIcon's standard
    // shape is <span class="btn-ic">{svg}</span><span>{label}</span> -- the label
    // lives on a *nested* text node one level down, so the old direct-children-only
    // scan never saw it and misclassified every icon+label button as icon-only.
    // Safe against the icon side because this repo's SVG icon set carries no
    // <text> nodes (see PBP_ICONS comment in shared.js), so .btn-ic never
    // contributes stray text; no aria-hidden-scoped exclusion is needed here.
    const hasOwnText = el.textContent.trim().length > 0;
    if (hasOwnText) continue; // has its own label text -- not the icon-only shape this rule scopes to
    const rect = el.getBoundingClientRect();
    let effRect = { width: rect.width, height: rect.height };
    const beforeCs = getComputedStyle(el, "::before");
    if (beforeCs && beforeCs.content && beforeCs.content !== "none" && beforeCs.position === "absolute") {
      const bw = parseFloat(beforeCs.width), bh = parseFloat(beforeCs.height);
      if (Number.isFinite(bw) && Number.isFinite(bh)) effRect = { width: Math.max(rect.width, bw), height: Math.max(rect.height, bh) };
    }
    const shortSide = Math.min(effRect.width, effRect.height);
    if (shortSide < 24) {
      hits.push({ kind: "hitAreaMin", path: pathOf(el), shortSide: Math.round(shortSide * 100) / 100 });
    }
  }

  return hits;
}

async function runSweep(page, sw, extBase) {
  const hits = [];
  const add = (found, surface, context) => { for (const h of found) hits.push({ surface, context, ...h }); };

  // Deterministic baseline for the options/library legs below (no per-theme
  // loop there, unlike popup's explicit light/dark setTheme calls further
  // down) -- family 4 (hitAreaMin) is gated in the caller and needs a
  // reproducible theme label, not whatever preset a prior caller happened
  // to leave storage on.
  await setTheme(sw, "", "light");

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
  // Ctrl+click on the row head, not a checkbox click: the per-row checkbox was
  // removed 2026-08-06 and selection is now a modified click on the row itself.
  if (await vocabHead.count()) {
    await vocabHead.click({ modifiers: ["Control"] }); await page.waitForTimeout(350);
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
  // Ctrl+click to open .notes-batch-bar.selecting (independent review F3):
  // the sweep used to only single-click a notes row, so .notes-batch-bar's
  // own buttons (including #notes-clear-selection, which shares vocab's
  // "cross" glyph and its 23px hit-area shortfall) were never rendered in
  // an on-screen, selected state and this debt was invisible to the gate.
  // Same modifier-click contract as the vocab list above.
  if (await notesHit.count()) {
    await notesHit.click({ modifiers: ["Control"] }); await page.waitForTimeout(350);
    add(await page.evaluate(sweepProbe, SWEEP_CFG), "library", "notes-batch-bar");
  }

  // ---- popup: default light + no-preset dark (since batch 2 D6 the latter
  // resolves to the flexoki-dark preset, same as options/library; kept as a
  // separate sweep context because the popup's dark layout deltas live in
  // its own hand-written rules). ----
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

  // ---- popup, LOGGED OUT (popup button-family campaign, 2026-08-07). The
  // two passes above seed a token, so popup.js's `if (!settings.pinboardToken)
  // showLogin(); else showMain(...)` always took the showMain branch and
  // #login-section stayed `.hidden` for the whole audit's life -- every
  // control in .login-body was NEVER MEASURED, which is a different thing
  // from "measured and passing" (its .key-toggle renders 22px, under the
  // 24px floor, and nothing caught it). Clearing the token is the whole
  // setup; restore it immediately afterwards so this stays the last popup
  // leg regardless of who calls runSweep.
  await sw.evaluate(() => chrome.storage.local.set({ pinboardToken: "" }));
  await setTheme(sw, "", "light");
  await page.goto(`${extBase}popup.html?_ra=sweeplogin`, { waitUntil: "load", timeout: TIMEOUT_MS });
  await page.waitForSelector("#login-section:not(.hidden)", { timeout: TIMEOUT_MS }).catch(() => {});
  await page.waitForTimeout(300);
  add(await page.evaluate(sweepProbe, SWEEP_CFG), "popup", "login");
  await sw.evaluate((tok) => chrome.storage.local.set({ pinboardToken: tok }), SEED_TOKEN_OBF);

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
    else if (h.kind === "hitAreaMin") console.log(`  hitAreaMin         [${h.surface}/${h.context}]  ${h.path}  shortSide=${h.shortSide}px`);
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
      // `context` (singular): pbpVocabSaveWord merges ONE per call, and a
      // `contexts` array is silently dropped. Load-bearing for the paneFit
      // entries -- the source link (a.notes-row-open) only exists when a word
      // has a context with a safe URL, and an unbreakable title is what makes
      // "does anything escape the pane" a question with a real answer instead
      // of a vacuous pass. (First version of this seed used the plural form
      // and the entries passed against a detail pane that had no link in it.)
      context: {
        quote: "A context sentence long enough to wrap inside the reading column and still leave the source link on a line of its own.",
        articleTitle: "An Extremely Long Source Article Title That Has No Business Fitting Inside A Narrow Detail Pane At All",
        articleUrl: "https://example.com/an/extremely/long/path/segment/that/does/not/break/anywhere",
      },
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
  const mediaSession = await ctx.newCDPSession(page);
  let mediaProbeCount = 0;
  try {
    for (const surface of Object.keys(SURFACE_PAGES)) {
      const checks = CHECKS.filter((c) => c.surface === surface);
      if (!checks.length) continue;
      for (const theme of THEMES) {
        // No bare-dark state on any surface: no-preset+dark resolves to
        // data-theme="flexoki-dark" on popup, options and library alike (batch
        // 2 D6), so the "flexoki-dark" THEMES entry covers it everywhere.
        const { themePresetKey, optTheme } = themeToStorage(theme);
        await setTheme(sw, themePresetKey, optTheme);
        if (surface === "library") await runLibraryTheme(page, extBase, theme, checks, results);
        else await runSimpleTheme(page, `${extBase}${SURFACE_PAGES[surface]}`, theme, checks, results, surface, sw);
        if (MEDIA_THEME_SET.has(theme)) {
          mediaProbeCount += await runMediaPreferenceChecks(page, mediaSession, surface, theme, results);
        }
      }
    }

    // ---- hitAreaMin class-scan (design-uplift final-fix I2). Reuses the
    // same whole-page sweep the --sweep discovery mode runs (options tabs +
    // preset-preview open, library vocab-list/detail/batch-bar + notes-
    // list/detail, popup light+dark) but, unlike that mode's other 3
    // families, folds every hit into `results` as a normal FAIL so it goes
    // through the same known-failures reconciliation as the hand-enumerated
    // checks above -- see sweepProbe's family-4 comment for why one pass
    // (not one per THEMES entry) is sufficient coverage.
    const hitAreaHits = (await runSweep(page, sw, extBase)).filter((h) => h.kind === "hitAreaMin");
    for (const h of hitAreaHits) {
      results.push({
        surface: h.surface,
        theme: h.surface === "popup" && h.context === "dark" ? "flexoki-dark" : "", // popup's dark sweep context renders the flexoki-dark fallback (batch 2 D6)
        selector: h.path,
        state: h.context,
        check: "hitAreaMin",
        status: "FAIL",
        actual: h.shortSide,
        expected: 24,
        note: null,
      });
    }
  } finally {
    await mediaSession.detach().catch(() => {});
    await page.close().catch(() => {});
    await ctx.close().catch(() => {});
    rmSync(userDataDir, { recursive: true, force: true });
  }

  console.log(`[render-audit] media preferences: ${mediaProbeCount} probes across ${MEDIA_THEMES.length} themes x ${MEDIA_CHECKS.length} surfaces x ${MEDIA_SCENARIOS.length} scenarios`);
  report(results);
}

main().catch((e) => {
  console.error(`[render-audit] fatal: ${e.stack || e.message}`);
  process.exit(2);
});
