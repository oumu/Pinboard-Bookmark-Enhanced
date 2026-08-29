// Flat ESLint config for the extension's runtime scripts (roadmap #29).
// Scope: a few high-signal correctness rules only — this repo's style is
// deliberate (no framework, no build, global-script architecture), so no
// stylistic linting. verify.sh runs `npx eslint .` from .qa-scan (the
// dev-only npm sandbox; ESLint never ships in the ZIP — .mjs is outside
// release.sh's TOP_LEVEL_PATTERNS).
//
// Cross-file globals: every root *.js runs as a classic script sharing one
// global scope (shared.js defines, everyone consumes). no-undef would drown
// in false positives unless it knows those names, so this config SCANS the
// runtime scripts at lint time and collects their top-level declarations as
// globals — answered from the real source of truth on every run, never a
// hand-maintained list that drifts.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));

function collectTopLevelGlobals() {
  const globals = {};
  const files = readdirSync(ROOT).filter((f) => f.endsWith(".js"));
  const decl = /^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)|^(?:const|let|var)\s+([A-Za-z_$][\w$]*)/;
  // Deliberate cross-context exports: modules wrapped in IIFEs publish their
  // API as `window.name = ...` (md-video.js et al), and injected page
  // functions call site-rules.js's own exports — both are real globals at
  // runtime, so collect them too (any indentation).
  const winExport = /^\s*(?:window|globalThis|self|g)\.([A-Za-z_$][\w$]*)\s*=/;
  for (const f of files) {
    let src = "";
    try { src = readFileSync(join(ROOT, f), "utf8"); } catch { continue; }
    for (const line of src.split("\n")) {
      const m = decl.exec(line);
      if (m) { globals[m[1] || m[2]] = "writable"; continue; }
      const w = winExport.exec(line);
      if (w) globals[w[1]] = "writable";
    }
  }
  return globals;
}

const browserGlobals = Object.fromEntries([
  "chrome", "window", "document", "navigator", "location", "history",
  "localStorage", "sessionStorage", "indexedDB", "fetch", "Headers",
  "Request", "Response", "AbortController", "AbortSignal", "URL",
  "URLSearchParams", "URLPattern", "Blob", "File", "FileReader", "FormData",
  "TextEncoder", "TextDecoder", "crypto", "performance", "console",
  "setTimeout", "clearTimeout", "setInterval", "clearInterval", "queueMicrotask",
  "requestAnimationFrame", "cancelAnimationFrame", "requestIdleCallback",
  "cancelIdleCallback", "atob", "btoa", "structuredClone", "globalThis", "self",
  "MutationObserver", "IntersectionObserver", "ResizeObserver",
  "getComputedStyle", "matchMedia", "CustomEvent", "Event", "KeyboardEvent",
  "MouseEvent", "ClipboardItem", "DOMParser", "XMLSerializer", "Node",
  "NodeFilter", "Element", "HTMLElement", "Range", "Highlight", "CSS",
  "Notification", "Audio", "Image", "OffscreenCanvas", "createImageBitmap",
  "importScripts", "caches", "speechSynthesis", "SpeechSynthesisUtterance",
  "CompressionStream", "DecompressionStream", "DOMPurify", "TurndownService",
  "Defuddle", "marked", "hljs", "katex", "renderMathInElement", "mermaid",
  "getSelection", "alert", "confirm", "prompt", "open", "close", "innerWidth",
  "innerHeight", "devicePixelRatio", "screen", "scrollTo", "scrollBy",
  "IdleDetector", "ReadableStream", "WritableStream", "TransformStream",
  "isSecureContext", "reportError", "XMLHttpRequest", "IDBKeyRange",
  "TextDecoderStream", "TextEncoderStream", "DOMException", "IDBDatabase",
  "IDBTransaction", "IDBObjectStore", "IDBRequest",
].map((g) => [g, "readonly"]));

export default [
  {
    files: ["*.js"],
    ignores: ["vendor/**"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "script",
      globals: { ...browserGlobals, ...collectTopLevelGlobals() },
    },
    rules: {
      // Correctness only. no-unused-vars is deliberately lenient about
      // args/catch bindings — the codebase's (_) idiom — and about globals
      // consumed from OTHER files (any top-level declaration may be another
      // script's API, which the collector marks by definition).
      "no-undef": "error",
      "eqeqeq": ["error", "smart"],
      "no-dupe-keys": "error",
      "no-dupe-args": "error",
      "no-unreachable": "error",
      "no-compare-neg-zero": "error",
      "no-cond-assign": ["error", "except-parens"],
      "no-constant-binary-expression": "error",
      "use-isnan": "error",
      "valid-typeof": "error",
      // props:false — `_iframe.src = _iframe.src` is the deliberate
      // reload-the-iframe idiom (md-video.js); member self-assign has side
      // effects in the DOM, only variable self-assign is dead code.
      "no-self-assign": ["error", { props: false }],
      "no-unsafe-negation": "error",
      "no-async-promise-executor": "error",
      "require-atomic-updates": "off",
    },
  },
];
