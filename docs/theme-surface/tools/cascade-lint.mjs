#!/usr/bin/env node
// cascade-lint - simulate CSS cascade for a fixed set of probe elements
// against each shipped theme's CSS in pinboard-themes.js, verify the
// expected rule wins per property.
//
// drift-guard (diff-all) checks declaration-level string equality between
// composer output and shipped CSS. It cannot see cascade conflicts where
// a base rule like `#right_bar a { color: accent }` (specificity 1,0,1)
// outranks a pattern rule like `a.tag.selected { color: destroy }` (0,2,1).
// This lint catches that class of bug.
//
// Usage:
//   node docs/theme-surface/tools/cascade-lint.mjs
//   node docs/theme-surface/tools/cascade-lint.mjs --verbose
//
// Exit code: 0 if no conflicts, 1 otherwise.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..", "..");
const SRC = readFileSync(resolve(ROOT, "pinboard-themes.js"), "utf8");
const VERBOSE = process.argv.includes("--verbose");

// ----------------------------------------------------------------------------
// PROBES - pixel-aligned to the bug class we hit during the tag-style refactor.
// `expected[prop]` is a substring that the winning selector MUST contain.
// ----------------------------------------------------------------------------
const PROBES = [
  { name: "a.tag at rest (inline)",
    mode: "light",
    elem: { tag: "a", classes: ["tag"] },
    expected: { color: "a.tag", background: "a.tag" } },
  { name: "a.tag :hover (inline)",
    mode: "light",
    elem: { tag: "a", classes: ["tag"], state: ["hover"] },
    expected: { color: "a.tag:hover", background: "a.tag:hover" } },
  { name: "a.tag.selected (inline)",
    mode: "light",
    elem: { tag: "a", classes: ["tag", "selected"] },
    expected: { color: "a.tag.selected", background: "a.tag" } },
  { name: "a.tag inside #right_bar at rest",
    mode: "light",
    elem: { tag: "a", classes: ["tag"], ancestors: [{ id: "right_bar" }] },
    expected: { color: "a.tag", background: "a.tag" } },
  { name: "a.tag inside #right_bar :hover",
    mode: "light",
    elem: { tag: "a", classes: ["tag"], ancestors: [{ id: "right_bar" }], state: ["hover"] },
    expected: { color: "a.tag:hover", background: "a.tag:hover" } },
  { name: "a.tag.selected inside #right_bar",
    mode: "light",
    elem: { tag: "a", classes: ["tag", "selected"], ancestors: [{ id: "right_bar" }] },
    expected: { color: "a.tag.selected" } },
  { name: "a.tag inside #tag_cloud_header at rest",
    mode: "light",
    elem: { tag: "a", classes: ["tag"], ancestors: [{ id: "tag_cloud_header" }] },
    expected: { color: "a.tag" } },
  { name: "a.tag.selected inside #tag_cloud_header",
    mode: "light",
    elem: { tag: "a", classes: ["tag", "selected"], ancestors: [{ id: "tag_cloud_header" }] },
    expected: { color: "a.tag.selected" } },
  { name: "non-tag <a> inside #right_bar at rest",
    mode: "light",
    elem: { tag: "a", classes: [], ancestors: [{ id: "right_bar" }] },
    expected: { color: "#right_bar a:not(.tag)" } },

  // Metadata strip (a.when/a.cached): the exact cascade this campaign fixed —
  // the global `a, a:link` fallback used to win these by source order. Rest
  // color AND hover color must both come from the scoped metadata rule
  // (hover signals via underline, never link-hover — it fails AA on six
  // theme surfaces).
  { name: "a.when inside .bookmark at rest",
    mode: "light",
    elem: { tag: "a", classes: ["when"], ancestors: [{ classes: ["bookmark"] }] },
    expected: { color: ".bookmark a.when", "font-size": ".bookmark a.when" } },
  { name: "a.when inside .bookmark :hover",
    mode: "light",
    elem: { tag: "a", classes: ["when"], ancestors: [{ classes: ["bookmark"] }], state: ["hover"] },
    expected: { color: ".bookmark a.when", "text-decoration": ".bookmark a.when:hover" } },
  { name: "a.cached inside .bookmark at rest",
    mode: "light",
    elem: { tag: "a", classes: ["cached"], ancestors: [{ classes: ["bookmark"] }] },
    expected: { color: ".bookmark a.cached", "font-size": ".bookmark a.cached" } },
  { name: "a.cached inside .bookmark :hover",
    mode: "light",
    elem: { tag: "a", classes: ["cached"], ancestors: [{ classes: ["bookmark"] }], state: ["hover"] },
    expected: { color: ".bookmark a.cached", "text-decoration": ".bookmark a.cached:hover" } },

  // ----- dark-mode (html.pbp-dark) cascade paths -----
  // Skipped for non-adaptive themes (those whose shipped CSS contains no
  // `html.pbp-dark` rules). flexoki is the only adaptive theme at present.
  { name: "html.pbp-dark a.tag (inline)",
    mode: "dark",
    elem: { tag: "a", classes: ["tag"], ancestors: [{ tag: "html", classes: ["pbp-dark"] }] },
    expected: { color: "a.tag" } },
  { name: "html.pbp-dark a.tag :hover (inline)",
    mode: "dark",
    elem: { tag: "a", classes: ["tag"], ancestors: [{ tag: "html", classes: ["pbp-dark"] }], state: ["hover"] },
    expected: { color: "a.tag:hover" } },
  { name: "html.pbp-dark a.tag.selected (inline)",
    mode: "dark",
    elem: { tag: "a", classes: ["tag", "selected"], ancestors: [{ tag: "html", classes: ["pbp-dark"] }] },
    expected: { color: "a.tag.selected" } },
  { name: "html.pbp-dark a.tag inside #right_bar at rest",
    mode: "dark",
    elem: { tag: "a", classes: ["tag"], ancestors: [{ tag: "html", classes: ["pbp-dark"] }, { id: "right_bar" }] },
    expected: { color: "a.tag" } },
  { name: "html.pbp-dark a.tag.selected inside #right_bar",
    mode: "dark",
    elem: { tag: "a", classes: ["tag", "selected"], ancestors: [{ tag: "html", classes: ["pbp-dark"] }, { id: "right_bar" }] },
    expected: { color: "a.tag.selected" } },
  { name: "html.pbp-dark a.tag.selected inside #tag_cloud_header",
    mode: "dark",
    elem: { tag: "a", classes: ["tag", "selected"], ancestors: [{ tag: "html", classes: ["pbp-dark"] }, { id: "tag_cloud_header" }] },
    expected: { color: "a.tag.selected" } },
  { name: "html.pbp-dark a.when inside .bookmark at rest",
    mode: "dark",
    elem: { tag: "a", classes: ["when"],
      ancestors: [{ tag: "html", classes: ["pbp-dark"] }, { classes: ["bookmark"] }] },
    expected: { color: ".bookmark a.when", "font-size": ".bookmark a.when" } },
  { name: "html.pbp-dark a.when inside .bookmark :hover",
    mode: "dark",
    elem: { tag: "a", classes: ["when"],
      ancestors: [{ tag: "html", classes: ["pbp-dark"] }, { classes: ["bookmark"] }], state: ["hover"] },
    expected: { color: ".bookmark a.when", "text-decoration": ".bookmark a.when:hover" } },
  { name: "html.pbp-dark a.cached inside .bookmark at rest",
    mode: "dark",
    elem: { tag: "a", classes: ["cached"],
      ancestors: [{ tag: "html", classes: ["pbp-dark"] }, { classes: ["bookmark"] }] },
    expected: { color: ".bookmark a.cached", "font-size": ".bookmark a.cached" } },
  { name: "html.pbp-dark a.cached inside .bookmark :hover",
    mode: "dark",
    elem: { tag: "a", classes: ["cached"],
      ancestors: [{ tag: "html", classes: ["pbp-dark"] }, { classes: ["bookmark"] }], state: ["hover"] },
    expected: { color: ".bookmark a.cached", "text-decoration": ".bookmark a.cached:hover" } }
];

const LIGHT_PROBES = PROBES.filter(p => p.mode === "light");
const DARK_PROBES  = PROBES.filter(p => p.mode === "dark");

// ----------------------------------------------------------------------------
// Extract per-theme CSS blocks from pinboard-themes.js.
// Format in source: `"<slug>": { ... css: \`...\` ... }` - one entry per theme.
// ----------------------------------------------------------------------------
function extractThemes(src) {
  const themes = [];
  const re = /"([a-z][a-z0-9-]*)":\s*\{[^]*?css:\s*`([^]*?)`\s*\}/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    themes.push({ slug: m[1], css: m[2] });
  }
  return themes;
}

// ----------------------------------------------------------------------------
// CSS parser: split top-level rules. Skips @-rules, :root, nested blocks.
// Returns an array of { selectorText, decls, lineNum, sourceOrder }.
// ----------------------------------------------------------------------------
function parseRules(css) {
  // Strip block comments but keep line offsets so lineNum stays accurate.
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, " "));
  const rules = [];
  let i = 0, order = 0;
  while (i < stripped.length) {
    const open = stripped.indexOf("{", i);
    if (open === -1) break;
    let depth = 1, close = -1;
    for (let j = open + 1; j < stripped.length; j++) {
      if (stripped[j] === "{") depth++;
      else if (stripped[j] === "}") { depth--; if (depth === 0) { close = j; break; } }
    }
    if (close === -1) break;
    const rawSel = stripped.slice(i, open).trim();
    const body = stripped.slice(open + 1, close);
    const lineNum = stripped.slice(0, i).split("\n").length;
    i = close + 1;
    if (!rawSel || rawSel.startsWith("@") || body.includes("{")) continue;
    if (rawSel === ":root") continue;

    const decls = parseDecls(body);
    if (decls.size === 0) continue;

    for (const sel of splitTopLevelCommas(rawSel)) {
      const selTrim = sel.trim().replace(/\s+/g, " ");
      if (!selTrim) continue;
      rules.push({ selectorText: selTrim, decls, lineNum, sourceOrder: order++ });
    }
  }
  return rules;
}

function parseDecls(body) {
  const out = new Map();
  let depth = 0, start = 0;
  const parts = [];
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (c === ";" && depth === 0) {
      parts.push(body.slice(start, i));
      start = i + 1;
    }
  }
  if (start < body.length) parts.push(body.slice(start));
  for (const raw of parts) {
    const decl = raw.trim();
    if (!decl) continue;
    const colon = decl.indexOf(":");
    if (colon === -1) continue;
    const prop = decl.slice(0, colon).trim().toLowerCase();
    let value = decl.slice(colon + 1).trim();
    const important = /!important\s*$/i.test(value);
    if (important) value = value.replace(/!important\s*$/i, "").trim();
    out.set(prop, { value, important });
  }
  return out;
}

function splitTopLevelCommas(s) {
  const out = [];
  let depth = 0, start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    else if (c === "," && depth === 0) {
      out.push(s.slice(start, i));
      start = i + 1;
    }
  }
  out.push(s.slice(start));
  return out;
}

// ----------------------------------------------------------------------------
// Selector parser: split on descendant combinator (whitespace) into compound
// parts. Each compound = { tag, id, classes, states, pseudo, negations }.
// ----------------------------------------------------------------------------
function parseSelector(sel) {
  const parts = splitOnDescendantCombinator(sel);
  return parts.map(parseCompound);
}

function splitOnDescendantCombinator(sel) {
  const out = [];
  let depth = 0, start = 0;
  for (let i = 0; i < sel.length; i++) {
    const c = sel[i];
    if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    else if (depth === 0 && /\s/.test(c)) {
      if (out.length === 0 || start < i) {
        const piece = sel.slice(start, i).trim();
        // Treat > + ~ as unsupported (v1 themes don't use them).
        if (piece && piece !== ">" && piece !== "+" && piece !== "~") out.push(piece);
      }
      start = i + 1;
    }
  }
  if (start < sel.length) {
    const piece = sel.slice(start).trim();
    if (piece) out.push(piece);
  }
  return out;
}

function parseCompound(text) {
  const c = { tag: null, id: null, classes: [], states: [], pseudo: null, negations: [], raw: text };
  let i = 0;
  const tagMatch = text.match(/^([a-zA-Z][a-zA-Z0-9-]*|\*)/);
  if (tagMatch) { c.tag = tagMatch[1] === "*" ? null : tagMatch[1].toLowerCase(); i = tagMatch[0].length; }
  while (i < text.length) {
    const ch = text[i];
    if (ch === "#") {
      const m = text.slice(i + 1).match(/^[a-zA-Z][a-zA-Z0-9_-]*/);
      if (!m) { i++; continue; }
      c.id = m[0]; i += 1 + m[0].length;
    } else if (ch === ".") {
      const m = text.slice(i + 1).match(/^[a-zA-Z][a-zA-Z0-9_-]*/);
      if (!m) { i++; continue; }
      c.classes.push(m[0]); i += 1 + m[0].length;
    } else if (ch === ":" && text[i + 1] === ":") {
      const m = text.slice(i + 2).match(/^[a-zA-Z-]+/);
      if (!m) { i += 2; continue; }
      c.pseudo = m[0]; i += 2 + m[0].length;
    } else if (ch === ":") {
      const m = text.slice(i + 1).match(/^[a-zA-Z-]+/);
      if (!m) { i++; continue; }
      const name = m[0]; i += 1 + name.length;
      if (text[i] === "(") {
        let depth = 1, j = i + 1;
        while (j < text.length && depth > 0) {
          if (text[j] === "(") depth++;
          else if (text[j] === ")") depth--;
          if (depth === 0) break;
          j++;
        }
        const inner = text.slice(i + 1, j);
        i = j + 1;
        if (name === "not") {
          for (const part of splitTopLevelCommas(inner)) {
            c.negations.push(parseCompound(part.trim()));
          }
        } else {
          c.states.push({ name, arg: inner });
        }
      } else {
        c.states.push({ name, arg: null });
      }
    } else if (ch === "[") {
      const close = text.indexOf("]", i);
      if (close === -1) { i++; continue; }
      c.states.push({ name: "attr", arg: text.slice(i + 1, close) });
      i = close + 1;
    } else {
      i++;
    }
  }
  return c;
}

// ----------------------------------------------------------------------------
// Specificity (a, b, c) per CSS spec: a = ids, b = classes/attrs/pseudo-classes,
// c = element/pseudo-element. :not(X) contributes X's specificity but the :not
// itself adds 0.
// ----------------------------------------------------------------------------
function specificityOf(compounds) {
  let a = 0, b = 0, c = 0;
  for (const cp of compounds) {
    if (cp.id) a += 1;
    b += cp.classes.length;
    for (const _s of cp.states) b += 1;
    if (cp.tag) c += 1;
    if (cp.pseudo) c += 1;
    for (const neg of cp.negations) {
      const [na, nb, nc] = specificityOf([neg]);
      a += na; b += nb; c += nc;
    }
  }
  return [a, b, c];
}

function cmpSpec(x, y) {
  if (x[0] !== y[0]) return x[0] - y[0];
  if (x[1] !== y[1]) return x[1] - y[1];
  return x[2] - y[2];
}

// ----------------------------------------------------------------------------
// Match a parsed selector against a probe element.
// ----------------------------------------------------------------------------
function probeCompound(probe) {
  return {
    tag: probe.tag || null,
    id: probe.id || null,
    classes: probe.classes || [],
    states: (probe.state || []).map(s => ({ name: s, arg: null })),
    pseudo: probe.pseudo || null,
    negations: []
  };
}

function compoundMatches(sel, probe) {
  if (sel.tag && probe.tag !== sel.tag) return false;
  if (sel.id && probe.id !== sel.id) return false;
  for (const cls of sel.classes) {
    if (!probe.classes.includes(cls)) return false;
  }
  for (const st of sel.states) {
    if (st.name === "attr") {
      // Probe doesn't model attributes - refuse the match conservatively so
      // attribute-scoped selectors don't collide with plain probes.
      return false;
    }
    if (st.name === "not" || st.name === "is" || st.name === "where" || st.name === "has") continue;
    if (!probe.states.some(ps => ps.name === st.name)) return false;
  }
  if (sel.pseudo && sel.pseudo !== probe.pseudo) return false;
  for (const neg of sel.negations) {
    if (compoundMatches(neg, probe)) return false;
  }
  return true;
}

function selectorMatches(compounds, probeElem) {
  const target = compounds[compounds.length - 1];
  const ancestorsSel = compounds.slice(0, -1);
  const targetProbe = probeCompound(probeElem);
  if (!compoundMatches(target, targetProbe)) return false;
  const probeAncestors = (probeElem.ancestors || []).map(probeCompound);
  let pi = 0;
  for (const ancSel of ancestorsSel) {
    let found = false;
    while (pi < probeAncestors.length) {
      if (compoundMatches(ancSel, probeAncestors[pi])) { found = true; pi++; break; }
      pi++;
    }
    if (!found) return false;
  }
  return true;
}

// ----------------------------------------------------------------------------
// Cascade resolver: for each probe + property, pick the winning rule.
// ----------------------------------------------------------------------------
function resolveCascade(rules, probeElem, prop) {
  const candidates = [];
  for (const r of rules) {
    if (!r.decls.has(prop)) continue;
    let compounds;
    try { compounds = parseSelector(r.selectorText); }
    catch { continue; }
    if (!selectorMatches(compounds, probeElem)) continue;
    const spec = specificityOf(compounds);
    const decl = r.decls.get(prop);
    candidates.push({ rule: r, spec, important: decl.important, value: decl.value });
  }
  if (candidates.length === 0) return { winner: null, candidates };
  candidates.sort((a, b) => {
    if (a.important !== b.important) return a.important ? -1 : 1;
    const c = cmpSpec(b.spec, a.spec);
    if (c !== 0) return c;
    return b.rule.sourceOrder - a.rule.sourceOrder;
  });
  return { winner: candidates[0], candidates };
}

// ----------------------------------------------------------------------------
// Run probes per theme.
// ----------------------------------------------------------------------------
const themes = extractThemes(SRC);
if (themes.length === 0) {
  console.error("[cascade-lint] FAIL - could not extract any themes from pinboard-themes.js");
  process.exit(1);
}

// A theme is "adaptive" if its shipped CSS carries any `html.pbp-dark` rules
// (the convention emitted by composeTheme's prefixSelectors for dark mode).
// Non-adaptive themes skip dark probes silently — running them would always
// report "no rule matched" since the ancestor chain can never be satisfied.
function isAdaptive(css) {
  return /html\.pbp-dark\b/.test(css);
}

let totalConflicts = 0;
let adaptiveCount = 0;
const conflictReports = [];

for (const theme of themes) {
  const rules = parseRules(theme.css);
  const adaptive = isAdaptive(theme.css);
  if (adaptive) adaptiveCount++;
  const probesForTheme = adaptive ? PROBES : LIGHT_PROBES;
  const themeConflicts = [];
  for (const probe of probesForTheme) {
    for (const [prop, wantedSubstr] of Object.entries(probe.expected)) {
      const { winner, candidates } = resolveCascade(rules, probe.elem, prop);
      if (!winner) {
        themeConflicts.push({
          probe: probe.name, prop, wanted: wantedSubstr,
          winner: null, candidates,
          reason: "no rule matched the probe for this property"
        });
        continue;
      }
      if (!winner.rule.selectorText.includes(wantedSubstr)) {
        themeConflicts.push({
          probe: probe.name, prop, wanted: wantedSubstr,
          winner, candidates,
          reason: explainReason(winner, candidates, wantedSubstr)
        });
      }
    }
  }
  if (themeConflicts.length > 0) {
    totalConflicts += themeConflicts.length;
    conflictReports.push({ slug: theme.slug, conflicts: themeConflicts });
  }
}

function explainReason(winner, candidates, wanted) {
  const expected = candidates.find(c => c.rule.selectorText.includes(wanted));
  if (!expected) return "expected rule absent from CSS";
  const ws = winner.spec, es = expected.spec;
  if (cmpSpec(ws, es) > 0) return `winning selector has higher specificity (${ws.join(",")}) than expected (${es.join(",")})`;
  if (winner.important && !expected.important) return "winner uses !important; expected rule does not";
  return "winner appears later in source order";
}

// ----------------------------------------------------------------------------
// Report
// ----------------------------------------------------------------------------
if (VERBOSE) {
  for (const theme of themes) {
    const rules = parseRules(theme.css);
    const adaptive = isAdaptive(theme.css);
    const probesForTheme = adaptive ? PROBES : LIGHT_PROBES;
    console.log(`\n# theme: ${theme.slug}${adaptive ? " (adaptive — running dark probes)" : ""}`);
    for (const probe of probesForTheme) {
      console.log(`  probe: ${probe.name} [${probe.mode}]`);
      for (const [prop, wantedSubstr] of Object.entries(probe.expected)) {
        const { candidates } = resolveCascade(rules, probe.elem, prop);
        console.log(`    ${prop} (want substr "${wantedSubstr}"):`);
        if (candidates.length === 0) { console.log("      <no candidates>"); continue; }
        for (const c of candidates.slice(0, 8)) {
          const sp = c.spec.join(",");
          const imp = c.important ? " !important" : "";
          console.log(`      [${sp}${imp}] L${c.rule.lineNum}  ${c.rule.selectorText} { ${prop}: ${c.value} }`);
        }
      }
    }
  }
}

if (conflictReports.length === 0) {
  console.log(`[cascade-lint] PASS - ${themes.length} themes (${adaptiveCount} adaptive), ${LIGHT_PROBES.length} light + ${DARK_PROBES.length} dark probes, 0 conflicts`);
  process.exit(0);
}

console.log("[cascade-lint] CONFLICTS DETECTED\n");
for (const r of conflictReports) {
  console.log(`theme: ${r.slug}`);
  const byProbe = new Map();
  for (const c of r.conflicts) {
    if (!byProbe.has(c.probe)) byProbe.set(c.probe, []);
    byProbe.get(c.probe).push(c);
  }
  for (const [name, list] of byProbe) {
    console.log(`  probe: ${name}`);
    for (const c of list) {
      console.log(`    ${c.prop}:`);
      console.log(`      expected winner selector contains: ${c.wanted}`);
      if (c.winner) {
        const sp = c.winner.spec.join(",");
        const imp = c.winner.important ? " !important" : "";
        console.log(`      actual winner: ${c.winner.rule.selectorText} (line ${c.winner.rule.lineNum}) - specificity (${sp})${imp}, ${c.prop}: ${c.winner.value}`);
      } else {
        console.log(`      actual winner: <none>`);
      }
      console.log(`      reason: ${c.reason}`);
    }
  }
  console.log("");
}
console.log(`[cascade-lint] FAIL - ${conflictReports.length} theme(s) with ${totalConflicts} conflict(s)`);
process.exit(1);
