#!/usr/bin/env node
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { composePopupThemes } from "../composers/popup-chrome.mjs";
import { composeOptionsThemes } from "../composers/options-chrome.mjs";
import { composeLibraryThemes } from "../composers/library-chrome.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..", "..");
const PILOTS = resolve(__dirname, "..", "pilots");
const END = "/* @generated:ui-themes end */";

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
];

export function spliceRegion(css, body, start, end) {
  const s = css.indexOf(start), e = css.indexOf(end);
  if (s === -1 || e === -1 || e < s) throw new Error("@generated:ui-themes markers not found");
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
