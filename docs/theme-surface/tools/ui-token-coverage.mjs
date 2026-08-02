#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { SURFACES } from "./apply-ui-themes.mjs";
const PREFIX = { popup: "--pp", options: "--opt", library: "--lib" };
let fails = 0;
const checked = [];
for (const s of SURFACES) {
  const prefix = PREFIX[s.name]; if (!prefix) continue;
  checked.push(s.name);
  const css = readFileSync(s.cssPath, "utf8");
  const si = css.indexOf(s.start), ei = css.indexOf(s.end);
  const region = css.slice(si, ei + s.end.length);
  const outside = css.slice(0, si) + css.slice(ei + s.end.length);
  const used = new Set();
  for (const m of outside.matchAll(new RegExp(`var\\(\\s*(${prefix}-[a-z0-9-]+)\\s*(\\)|,)`, "g"))) { if (m[2] === ")") used.add(m[1]); }
  const baseDefs = new Set([...outside.matchAll(new RegExp(`(${prefix}-[a-z0-9-]+)\\s*:`, "g"))].map(m => m[1]));
  const blocks = region.split(/html\[data-theme="[^"]+"\]\s*\{/).slice(1);
  for (const v of used) {
    if (baseDefs.has(v)) continue;
    const missing = blocks.filter(b => !new RegExp(v.replace(/-/g, "\\-") + "\\s*:").test(b)).length;
    if (missing > 0) { console.log(`  x ${s.name}: ${v} undefined in ${missing} block(s) and not in base`); fails++; }
  }
}
console.log(fails ? `FAIL ${fails}` : `PASS ui-token-coverage (${checked.join(" + ")})`);
process.exit(fails ? 1 : 0);
