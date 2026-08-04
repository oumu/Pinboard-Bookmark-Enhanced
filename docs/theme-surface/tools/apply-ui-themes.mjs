#!/usr/bin/env node
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { composePopupThemes } from "../composers/popup-chrome.mjs";
import { composeOptionsThemes } from "../composers/options-chrome.mjs";
import { composeLibraryThemes } from "../composers/library-chrome.mjs";
import { renderComponents } from "../composers/ui-components.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..", "..");
const PILOTS = resolve(__dirname, "..", "pilots");
const END = "/* @generated:ui-themes end */";

// Task 9 flips a surface's families on here, one family at a time, deleting
// the hand-written CSS rule(s) each family supersedes in the same commit
// (docs/theme-surface/COMPONENTS.md Appendix A4 has the checklist of what
// has to go). An empty array keeps that surface's @generated:ui-components
// region at just the placeholder comment — see composers/ui-components.mjs
// for why renderComponents(ns, []) is the deliberate "machinery built, not
// yet wired up" state this campaign ships in.
const ACTIVE_COMPONENT_FAMILIES = { pp: ["btnIc"], opt: ["btn", "btnIc", "chip"], lib: ["btn", "btnIc", "chip"] };

function loadPilots() {
  const by = {};
  for (const f of readdirSync(PILOTS).filter(f => f.endsWith(".tokens.json")))
    by[f.replace(/\.tokens\.json$/, "")] = JSON.parse(readFileSync(resolve(PILOTS, f), "utf8"));
  return by;
}

export const SURFACES = [
  { name: "popup", cssPath: resolve(ROOT, "popup.css"),
    start: "/* @generated:ui-themes start — do not edit; produced by composers/popup-chrome.mjs */",
    end: END, render: () => composePopupThemes(loadPilots()) },
  { name: "options", cssPath: resolve(ROOT, "options.css"),
    start: "/* @generated:ui-themes start — do not edit; produced by composers/options-chrome.mjs */",
    end: END, render: () => composeOptionsThemes(loadPilots()) },
  { name: "library", cssPath: resolve(ROOT, "library.css"),
    start: "/* @generated:ui-themes start — do not edit; produced by composers/library-chrome.mjs */",
    end: END, render: () => composeLibraryThemes(loadPilots()) },
  // @generated:ui-components — independent region/sentinels from @generated:ui-themes
  // above: each surface has its OWN start/end pair (never reuse END, never share one
  // end marker across surfaces either). Distinct `name`s (not "popup"/"options"/
  // "library") so ui-token-coverage.mjs's per-surface PREFIX lookup treats these as
  // their own entries rather than double-processing the ui-themes ones.
  { name: "popup-components", cssPath: resolve(ROOT, "popup.css"),
    start: "/* @generated:ui-components start (popup) */",
    end: "/* @generated:ui-components end (popup) */",
    render: () => renderComponents("pp", ACTIVE_COMPONENT_FAMILIES.pp) },
  { name: "options-components", cssPath: resolve(ROOT, "options.css"),
    start: "/* @generated:ui-components start (options) */",
    end: "/* @generated:ui-components end (options) */",
    render: () => renderComponents("opt", ACTIVE_COMPONENT_FAMILIES.opt) },
  { name: "library-components", cssPath: resolve(ROOT, "library.css"),
    start: "/* @generated:ui-components start (library) */",
    end: "/* @generated:ui-components end (library) */",
    render: () => renderComponents("lib", ACTIVE_COMPONENT_FAMILIES.lib) },
];

export function spliceRegion(css, body, start, end) {
  const s = css.indexOf(start), e = css.indexOf(end);
  if (s === -1 || e === -1 || e < s) throw new Error(`@generated region markers not found: "${start}" / "${end}"`);
  return css.slice(0, s) + start + "\n" + body + "\n" + end + css.slice(e + end.length);
}

export function expectedCss(surface) {
  return spliceRegion(readFileSync(surface.cssPath, "utf8"), surface.render(), surface.start, surface.end);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const write = process.argv.includes("--write");
  const only = (process.argv.find(a => a.startsWith("--surface=")) || "").split("=")[1];
  for (const s of SURFACES) {
    if (only && s.name !== only) continue;
    const css = readFileSync(s.cssPath, "utf8");
    const next = spliceRegion(css, s.render(), s.start, s.end);
    if (write) { writeFileSync(s.cssPath, next); console.log(`apply-ui-themes: wrote ${s.name}`); }
    else console.log(next === css ? `apply-ui-themes: ${s.name} in sync` : `apply-ui-themes: ${s.name} DRIFT (run with --write)`);
  }
}
