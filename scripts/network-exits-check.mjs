// Network-exit contract check (roadmap #38). Cross-checks three parties that
// previously had no machine link: the hand-written oracle
// (docs/network-exits.json), the runtime scripts, and the privacy disclosure.
//
//  1. Every literal https host in a runtime script is classified in the
//     oracle (exit or non-exit) — a brand-new host fails loudly instead of
//     shipping undisclosed.
//  2. Every oracle exit host appears in docs/privacy.md.
//  3. Every manifest static host is a listed exit.
//
// The release gate only checks "was a monitored doc edited at all"; this is
// the missing "does the edit actually correspond" half. The oracle is hand-
// written on purpose — generating it from source would only prove the code
// agrees with itself.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const oracle = JSON.parse(readFileSync(join(ROOT, "docs", "network-exits.json"), "utf8"));
const privacy = readFileSync(join(ROOT, "docs", "privacy.md"), "utf8");
const manifest = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8"));

let failures = 0;
const fail = (msg) => { failures++; console.error(`[network-exits] FAIL: ${msg}`); };

const exits = new Set(Object.keys(oracle.exits));
const nonExits = new Set(Object.keys(oracle.nonExitHosts));

// 1. Classify every literal https host in runtime scripts.
const seen = new Set();
for (const f of readdirSync(ROOT).filter((n) => n.endsWith(".js"))) {
  const src = readFileSync(join(ROOT, f), "utf8");
  for (const m of src.matchAll(/https:\/\/([a-z0-9.-]+)/g)) seen.add(m[1]);
}
for (const host of [...seen].sort()) {
  if (!exits.has(host) && !nonExits.has(host)) {
    fail(`${host}: appears in a runtime script but is classified in docs/network-exits.json as neither exit nor non-exit`);
  }
}

// Reverse direction: a classified host that no script mentions any more is a
// stale oracle row — prune it so the list stays honest.
for (const host of [...exits, ...nonExits]) {
  if (!seen.has(host)) fail(`${host}: in the oracle but no runtime script mentions it — stale entry?`);
}

// 2. Every exit is disclosed in privacy.md — by host, or by the user-facing
// name the oracle records as disclosedAs (the disclosure speaks to users, so
// "OpenAI" instead of api.openai.com is fine as long as the mapping is here).
for (const [host, entry] of Object.entries(oracle.exits)) {
  const name = entry && entry.disclosedAs;
  if (!privacy.includes(host) && !(name && privacy.includes(name))) {
    fail(`${host}: network exit not mentioned in docs/privacy.md (neither the host nor disclosedAs "${name || ""}")`);
  }
}

// 3. Manifest static hosts are exits.
for (const pattern of manifest.host_permissions || []) {
  const m = /^https:\/\/([a-z0-9.-]+)\//.exec(pattern);
  if (m && !exits.has(m[1])) fail(`${m[1]}: manifest host_permissions entry missing from the oracle's exits`);
}

if (failures) {
  console.error(`[network-exits] ${failures} problem(s)`);
  process.exit(1);
}
console.log(`[network-exits] PASS - ${seen.size} script hosts classified, ${exits.size} exits all disclosed, manifest hosts covered`);
