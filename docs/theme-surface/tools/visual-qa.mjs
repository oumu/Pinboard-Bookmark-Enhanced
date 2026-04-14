#!/usr/bin/env node
/**
 * visual-qa.mjs — build QA harness HTML per theme, injecting theme CSS into a
 * real pinboard.in DOM snapshot. Supports multiple surfaces (home,
 * subscriptions-tags, etc.) and an optional `force-hover` mode that sets the
 * `.forced-hover` class on every `a.tag` so we can screenshot hover state
 * without scripted mouse movement.
 *
 * Usage:
 *   node docs/theme-surface/tools/visual-qa.mjs                # home, all themes
 *   node docs/theme-surface/tools/visual-qa.mjs --surface subscriptions-tags
 *   node docs/theme-surface/tools/visual-qa.mjs --surface home --hover
 *   node docs/theme-surface/tools/visual-qa.mjs --theme dracula --surface subscriptions-tags --hover
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../../..");
const SNAPSHOTS = resolve(ROOT, "docs/theme-surface/snapshots");
const THEMES_JS = resolve(ROOT, "pinboard-themes.js");
const OUT_DIR = resolve(ROOT, "docs/theme-surface/qa-harness");

// --- CLI parse -------------------------------------------------------------
const args = process.argv.slice(2);
function opt(name, fallback) {
  const i = args.indexOf(`--${name}`);
  if (i >= 0 && i + 1 < args.length && !args[i + 1].startsWith("--")) return args[i + 1];
  return fallback;
}
function flag(name) {
  return args.includes(`--${name}`);
}
const surface = opt("surface", "home");
const themeFilter = opt("theme", null);
const forceHover = flag("hover");

const RAW = resolve(SNAPSHOTS, surface, "raw.html");
if (!existsSync(RAW)) {
  console.error(`raw.html not found for surface=${surface} at ${RAW}`);
  console.error(`available surfaces: ${Object.keys(listSurfaces()).join(", ")}`);
  process.exit(1);
}

function listSurfaces() {
  const { readdirSync, statSync } = require("node:fs");
  const out = {};
  for (const d of readdirSync(SNAPSHOTS)) {
    const p = resolve(SNAPSHOTS, d);
    try {
      if (statSync(p).isDirectory() && existsSync(resolve(p, "raw.html"))) out[d] = true;
    } catch {}
  }
  return out;
}

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

// --- Load themes -----------------------------------------------------------
const shim = resolve(OUT_DIR, ".themes-shim.mjs");
const src = readFileSync(THEMES_JS, "utf8");
writeFileSync(shim, `${src}\nexport default PINBOARD_THEMES;\n`);
const { default: themes } = await import(pathToFileURL(shim).href);

// --- Rewrite HTML to load pinboard.in baseline CSS -------------------------
const rawHtml = readFileSync(RAW, "utf8");
const rewritten = rawHtml
  .replace(/href="\/(stylesheets|images|static|javascripts)\//g, 'href="https://pinboard.in/$1/')
  .replace(/src="\/(stylesheets|images|static|javascripts)\//g, 'src="https://pinboard.in/$1/')
  .replace(/url\(\/(stylesheets|images|static)\//g, 'url(https://pinboard.in/$1/')
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");

// CSS + JS patch that activates forced-hover mode
const HOVER_PATCH_CSS = `
/* QA: force hover on every a.tag so screenshots capture hover state */
a.tag.forced-hover { /* these rules inherit via :hover clones we inject below */ }
`;
const HOVER_PATCH_JS = `
(function() {
  // 1. Find the theme <style> block, duplicate every a.tag:hover rule into an
  //    a.tag.forced-hover rule so we don't rely on actual cursor position.
  const styleEl = document.getElementById('pinboard-theme-inject');
  if (styleEl) {
    const patched = styleEl.textContent.replace(
      /(a\\.tag[^{]*?):hover\\b/g,
      '$1:hover, $1.forced-hover'
    );
    styleEl.textContent = patched;
  }
  // 2. Add the class to every .tag.
  document.querySelectorAll('a.tag').forEach(el => el.classList.add('forced-hover'));
})();
`;

// --- Enumerate themes ------------------------------------------------------
const themeIds = themeFilter
  ? themeFilter.split(",").map((s) => s.trim())
  : Object.keys(themes);
const builtSurfacePrefix = surface === "home" ? "" : `${surface}-`;
const hoverSuffix = forceHover ? "-hover" : "";

let built = 0;
for (const id of themeIds) {
  const theme = themes[id];
  if (!theme) {
    console.warn(`theme ${id} not found, skipping`);
    continue;
  }
  for (const mode of ["light", "dark"]) {
    if (mode === "dark" && !theme.css.includes("html.pbp-dark")) continue;

    const rootClass = mode === "dark" ? "pbp-dark" : "";
    const hoverBlock = forceHover
      ? `<style id="pinboard-hover-patch">${HOVER_PATCH_CSS}</style>\n<script>${HOVER_PATCH_JS}</script>`
      : "";
    const injected = rewritten
      .replace(
        /<head>/i,
        `<head>\n<base href="https://pinboard.in/">\n<style id="pinboard-theme-inject">\n${theme.css}\n</style>\n${hoverBlock}`
      )
      .replace(/<html\b([^>]*)>/i, `<html$1 class="${rootClass}">`);

    const outName = `${builtSurfacePrefix}${id}-${mode}${hoverSuffix}.html`;
    writeFileSync(resolve(OUT_DIR, outName), injected);
    built++;
  }
}

console.log(`built ${built} harness files for surface=${surface}${forceHover ? " (hover forced)" : ""}`);
console.log(`out: ${OUT_DIR}`);
