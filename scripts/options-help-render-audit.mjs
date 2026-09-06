#!/usr/bin/env node
// Pixel-level oracle for Settings contextual-help alignment. DOM line boxes
// and Canvas text metrics are not accepted here: both can be correct while
// the rasterized CJK ink is visibly above or below the Lucide glyph.

import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const requireFromQa = createRequire(resolve(ROOT, ".qa-scan", "package.json"));
const { chromium } = requireFromQa("playwright");
const { PNG } = requireFromQa("pngjs");

const ROLES = Object.freeze(["section", "field", "choice", "group", "action"]);
const LOCALES = Object.freeze([
  { id: "zh-CN", messagesDir: "zh_CN" },
  { id: "en", messagesDir: "en" },
]);
const DPR_VALUES = Object.freeze([1, 1.25, 1.5, 2]);
// One CSS layout can land on opposite half-pixel edges under Verdana/YaHei
// and Liberation/WenQuanYi rasterization. Two physical pixels keep both font
// paths within 1 CSS px at DPR 2 while still rejecting the visible 3px drift
// this oracle was introduced to catch.
const MAX_CENTER_DELTA_PHYSICAL_PX = 2;
// PBP_HELP_RASTER_RANGES=1 prints the per-(locale, DPR 2, script, role) delta ranges on
// a passing run too -- the calibration view: run it under the local fonts and under
// FONTCONFIG_FILE=scripts/ci-fonts.conf and pick offsets that keep BOTH within tolerance.
const PRINT_RANGES = process.env.PBP_HELP_RASTER_RANGES === "1";
const HELP_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>';

const html = readFileSync(resolve(ROOT, "options.html"), "utf8")
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
  .replace(/<link\s+rel="stylesheet"\s+href="options\.css"\s*>/i,
    `<style>${readFileSync(resolve(ROOT, "options.css"), "utf8")}</style>`);

const AUDIT_CSS = `
  html, body { background: #fff !important; }
  .panel { display: none !important; }
  .panel[data-help-audit-panel] { display: block !important; }
  [data-help-audit-scope], [data-help-audit-scope] * {
    background: #fff !important;
    border-color: transparent !important;
    box-shadow: none !important;
    color: transparent !important;
    opacity: 1 !important;
    text-decoration: none !important;
    text-shadow: none !important;
  }
  [data-help-audit-scope] {
    position: fixed !important;
    inset: auto !important;
    top: 100px !important;
    left: 100px !important;
    width: 1200px !important;
    z-index: 2147483647 !important;
  }
  [data-help-audit-scope] [data-help-audit-copy] {
    color: #000 !important;
  }
  [data-help-audit-scope] [data-help-audit-icon],
  [data-help-audit-scope] [data-help-audit-icon] * {
    color: #000 !important;
    stroke: #000 !important;
  }
`;

function inkBounds(png, region, scaleX, scaleY) {
  const left = Math.max(0, Math.floor(region.left * scaleX) - 1);
  const right = Math.min(png.width - 1, Math.ceil(region.right * scaleX) + 1);
  const top = Math.max(0, Math.floor(region.top * scaleY) - 1);
  const bottom = Math.min(png.height - 1, Math.ceil(region.bottom * scaleY) + 1);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      const offset = (y * png.width + x) * 4;
      const alpha = png.data[offset + 3];
      const luminance = 0.2126 * png.data[offset]
        + 0.7152 * png.data[offset + 1]
        + 0.0722 * png.data[offset + 2];
      if (alpha < 128 || luminance > 205) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return Number.isFinite(minY) ? { minX, minY, maxX, maxY } : null;
}

async function preparePage(page, locale) {
  const messages = JSON.parse(readFileSync(
    resolve(ROOT, "_locales", locale.messagesDir, "messages.json"),
    "utf8",
  ));
  await page.setContent(html, { waitUntil: "load" });
  await page.addStyleTag({ content: AUDIT_CSS });
  await page.evaluate(({ icon, lang, localizedMessages }) => {
    document.documentElement.lang = lang;
    document.documentElement.setAttribute("data-options-ready", "");
    document.querySelectorAll("[data-i18n]").forEach((node) => {
      const message = localizedMessages[node.dataset.i18n]?.message;
      if (typeof message === "string") node.textContent = message;
    });
    document.querySelectorAll(".context-help-toggle .btn-ic").forEach((slot) => {
      slot.innerHTML = icon;
    });
    document.querySelectorAll("details.context-help").forEach((details) => {
      const host = details.parentElement;
      const anchor = details.previousElementSibling;
      const copyNode = host?.dataset.helpRole === "choice"
        ? (anchor?.querySelector("span[data-i18n]") || anchor)
        : host?.dataset.helpRole === "action"
          ? (anchor?.querySelector("button") || anchor)
          : anchor;
      if (!host || !copyNode) return;
      host.dataset.helpScript = /[\u3040-\u30ff\u3100-\u312f\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uf900-\ufaff]/u
        .test(copyNode.textContent || "") ? "cjk" : "alphabetic";
    });
    document.querySelectorAll("details.disclosure").forEach((section) => { section.open = true; });
  }, { icon: HELP_ICON, lang: locale.id, localizedMessages: messages });
  await page.evaluate(() => document.fonts.ready);
}

async function inventory(page) {
  return page.evaluate(() => [...document.querySelectorAll("details.context-help")].map((details, index) => {
    const host = details.parentElement;
    const anchor = details.previousElementSibling;
    const inferredRole = host?.classList.contains("context-help-action-row") ? "action"
      : host?.classList.contains("context-help-section") ? "section"
      : anchor?.matches("label") && anchor.querySelector('input[type="checkbox"],input[type="radio"]') ? "choice"
      : anchor?.matches("label.bl") ? "field"
      : anchor?.matches(".bl,.context-help-anchor") ? "group"
      : null;
    return {
      index,
      key: details.querySelector(".context-help-body[data-i18n]")?.dataset.i18n || `help-${index}`,
      declaredRole: host?.dataset.helpRole || null,
      declaredScript: host?.dataset.helpScript || null,
      inferredRole,
    };
  }));
}

async function capturePair(page, item) {
  const prepared = await page.evaluate(({ index }) => {
    document.querySelectorAll("[data-help-audit-scope],[data-help-audit-copy],[data-help-audit-icon],[data-help-audit-panel]")
      .forEach((node) => {
        node.removeAttribute("data-help-audit-scope");
        node.removeAttribute("data-help-audit-copy");
        node.removeAttribute("data-help-audit-icon");
        node.removeAttribute("data-help-audit-panel");
      });
    const details = document.querySelectorAll("details.context-help")[index];
    const host = details?.parentElement;
    const anchor = details?.previousElementSibling;
    if (!host || !anchor) return null;
    const panel = host.closest(".panel");
    panel?.setAttribute("data-help-audit-panel", "");
    for (let node = host; node && node !== panel; node = node.parentElement) {
      node.hidden = false;
      if (node.matches("details")) node.open = true;
      if (node.style.display === "none") node.style.removeProperty("display");
    }
    details.open = false;
    const role = host.dataset.helpRole;
    const copyNode = role === "choice" ? (anchor.querySelector("span[data-i18n]") || anchor)
      : role === "action" ? (anchor.querySelector("button") || anchor)
      : anchor;
    const iconNode = details.querySelector(":scope > summary.context-help-toggle svg");
    if (!copyNode || !iconNode) return null;
    host.setAttribute("data-help-audit-scope", "");
    copyNode.setAttribute("data-help-audit-copy", "");
    iconNode.setAttribute("data-help-audit-icon", "");
    return true;
  }, { index: item.index });
  if (!prepared) return { error: "not rendered" };
  await page.evaluate(() => new Promise((resolveFrame) => requestAnimationFrame(() => requestAnimationFrame(resolveFrame))));
  const settled = await page.evaluate(() => {
    const host = document.querySelector("[data-help-audit-scope]");
    const copyNode = host?.querySelector("[data-help-audit-copy]");
    const iconNode = host?.querySelector("[data-help-audit-icon]");
    if (!host || !copyNode || !iconNode) return null;
    const hostRect = host.getBoundingClientRect();
    const copyRect = copyNode.getBoundingClientRect();
    const iconRect = iconNode.getBoundingClientRect();
    return {
      host: { width: hostRect.width, height: hostRect.height },
      copy: {
        left: copyRect.left - hostRect.left,
        right: copyRect.right - hostRect.left,
        top: copyRect.top - hostRect.top,
        bottom: copyRect.bottom - hostRect.top,
      },
      icon: {
        left: iconRect.left - hostRect.left,
        right: iconRect.right - hostRect.left,
        top: iconRect.top - hostRect.top,
        bottom: iconRect.bottom - hostRect.top,
      },
    };
  });
  if (!settled || settled.host.width <= 0 || settled.host.height <= 0) return { error: "not rendered after settling" };
  const buffer = await page.locator("[data-help-audit-scope]").screenshot({ animations: "disabled" });
  const png = PNG.sync.read(buffer);
  const scaleX = png.width / settled.host.width;
  const scaleY = png.height / settled.host.height;
  const copyInk = inkBounds(png, settled.copy, scaleX, scaleY);
  const iconInk = inkBounds(png, settled.icon, scaleX, scaleY);
  if (!copyInk || !iconInk) return { error: `missing raster ink copy=${!!copyInk} icon=${!!iconInk}` };
  const copyCenter = (copyInk.minY + copyInk.maxY + 1) / 2;
  const iconCenter = (iconInk.minY + iconInk.maxY + 1) / 2;
  return {
    deltaPhysicalPx: iconCenter - copyCenter,
    rasterScale: Number(scaleY.toFixed(3)),
    copyInkY: `${copyInk.minY}-${copyInk.maxY}`,
    iconInkY: `${iconInk.minY}-${iconInk.maxY}`,
  };
}

const failures = [];
const samples = new Map();
let probes = 0;
const browser = await chromium.launch();
try {
  for (const dpr of DPR_VALUES) {
    for (const locale of LOCALES) {
      const context = await browser.newContext({
        viewport: { width: 1600, height: 1000 },
        deviceScaleFactor: dpr,
      });
      const page = await context.newPage();
      await preparePage(page, locale);
      const items = await inventory(page);
      const missing = items.filter((item) => !ROLES.includes(item.declaredRole));
      if (missing.length) {
        failures.push(`${locale.id}@${dpr}: ${missing.length} host(s) lack a declared semantic role`);
      }
      const mismatched = items.filter((item) => item.declaredRole && item.declaredRole !== item.inferredRole);
      if (mismatched.length) {
        failures.push(`${locale.id}@${dpr}: role mismatch ${mismatched.slice(0, 4).map((item) => `${item.key}:${item.declaredRole}/${item.inferredRole}`).join(", ")}`);
      }
      const missingScript = items.filter((item) => !["cjk", "alphabetic"].includes(item.declaredScript));
      if (missingScript.length) {
        failures.push(`${locale.id}@${dpr}: ${missingScript.length} host(s) lack an actual-copy script family`);
      }
      const firstByRole = ROLES.map((role) => items.find((item) => (item.declaredRole || item.inferredRole) === role)).filter(Boolean);
      const selected = dpr === 1.5 || dpr === 2 ? items : firstByRole;
      for (const item of selected) {
        const role = item.declaredRole || item.inferredRole;
        if (!ROLES.includes(role)) continue;
        const result = await capturePair(page, item);
        probes += 1;
        if (result.error) {
          failures.push(`${locale.id}@${dpr} ${role}/${item.key}: ${result.error}`);
          continue;
        }
        const sampleKey = `${locale.id}@${dpr}/${item.declaredScript}/${role}`;
        if (!samples.has(sampleKey)) samples.set(sampleKey, []);
        samples.get(sampleKey).push(result.deltaPhysicalPx);
        const tolerance = dpr === 1.5 || dpr === 2 ? MAX_CENTER_DELTA_PHYSICAL_PX : 2;
        if (Math.abs(result.deltaPhysicalPx) > tolerance) {
          failures.push(`${locale.id}@${dpr} ${item.declaredScript}/${role}/${item.key}: raster center delta=${result.deltaPhysicalPx}px scale=${result.rasterScale} copy=${result.copyInkY} icon=${result.iconInkY}`);
        }
      }
      await context.close();
    }
  }
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(`[options-help-render] FAIL ${failures.length} violation(s), ${probes} raster probes`);
  failures.slice(0, 40).forEach((failure) => console.error(`  ${failure}`));
  if (failures.length > 40) console.error(`  ... ${failures.length - 40} more`);
  [...samples.entries()].filter(([key]) => key.includes("@2/")).forEach(([key, values]) => {
    console.error(`  range ${key}: ${Math.min(...values)}..${Math.max(...values)}px (${values.length})`);
  });
  process.exit(1);
}
console.log(`[options-help-render] OK ${probes} raster probes across ${DPR_VALUES.length} DPRs, ${LOCALES.length} locales and ${ROLES.length} roles`);
if (PRINT_RANGES) {
  [...samples.entries()].filter(([key]) => key.includes("@2/")).sort().forEach(([key, values]) => {
    console.log(`  range ${key}: ${Math.min(...values)}..${Math.max(...values)}px (${values.length})`);
  });
}
