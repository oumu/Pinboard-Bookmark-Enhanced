// composeTheme(tokens, composer?)
// Top-level renderer that handles the modes feature. For each `tokens.modes.<name>`
// entry, re-compose with the mode's palette merged on top of the base palette,
// then prefix every selector with the mode's `trigger` (e.g. "html.pbp-dark").
//
// This is the mechanism behind Flexoki Adaptive: one token file, two palettes,
// runtime toggle via an HTML class.
//
// Usage:
//   import { composeTheme } from "./compose-theme.mjs";
//   import { compose } from "./classic-list-v2.mjs";
//   const css = composeTheme(tokens, compose);

export function composeTheme(tokens, composer) {
  let out = composer(tokens);

  if (tokens.modes && typeof tokens.modes === "object") {
    for (const [name, mode] of Object.entries(tokens.modes)) {
      if (!mode || !mode.trigger) continue;
      const modeTokens = mergeTokens(tokens, mode);
      const modeCss = composer(modeTokens);
      out += `\n\n/* === mode: ${name} (trigger: ${mode.trigger}) === */\n`;
      out += prefixSelectors(modeCss, mode.trigger);
    }
  }

  // Theme-specific decorative CSS appended raw — covers ::before/::after
  // pseudo-decorations and other additions the shared composer cannot know about.
  if (tokens.overrides?.css) {
    out += `\n\n/* === theme overrides (tokens.overrides.css) === */\n`;
    out += tokens.overrides.css;
  }

  return out;
}

function mergeTokens(base, mode) {
  return {
    ...base,
    palette: { ...base.palette, ...(mode.palette || {}) },
    typo:    { ...base.typo,    ...(mode.typo    || {}) },
    space:   { ...base.space,   ...(mode.space   || {}) },
    radius:  { ...base.radius,  ...(mode.radius  || {}) },
    border:  { ...base.border,  ...(mode.border  || {}) },
    fx:      { ...(base.fx||{}),     ...(mode.fx||{}) },
    motion:  { ...(base.motion||{}), ...(mode.motion||{}) }
  };
}

// Prefix every selector in a CSS string with `trigger `. Preserves
// comments, @-rules, :root, and ::selection (::selection needs to live
// inside the prefix, e.g. "html.pbp-dark ::selection").
export function prefixSelectors(css, trigger) {
  // Strip comments so they don't confuse the scanner, but keep them intact in
  // output by restoring via placeholders.
  const comments = [];
  let working = css.replace(/\/\*[\s\S]*?\*\//g, c => { comments.push(c); return `/*__C${comments.length-1}__*/`; });

  let result = "";
  let i = 0;
  while (i < working.length) {
    const braceOpen = working.indexOf("{", i);
    if (braceOpen === -1) { result += working.slice(i); break; }
    const braceClose = findMatchingBrace(working, braceOpen);
    if (braceClose === -1) { result += working.slice(i); break; }
    const selectorRaw = working.slice(i, braceOpen);
    const block = working.slice(braceOpen, braceClose + 1);

    // Separate leading whitespace/comments from the actual selector text
    const leadMatch = selectorRaw.match(/^([\s]*(?:\/\*__C\d+__\*\/\s*)*)/);
    const lead = leadMatch ? leadMatch[1] : "";
    const sel = selectorRaw.slice(lead.length).trim();

    if (!sel) { result += selectorRaw + block; i = braceClose + 1; continue; }

    // @-rules pass through unchanged.
    if (sel.startsWith("@")) {
      result += selectorRaw + block;
      i = braceClose + 1;
      continue;
    }

    // :root inside a mode needs to become the trigger itself (e.g. `html.pbp-dark`),
    // so the mode palette's CSS custom properties only apply when the trigger class
    // is present. If we left :root unprefixed, the mode's :root would unconditionally
    // override the base :root and the mode would be permanently active.
    if (sel === ":root") {
      result += lead + trigger + " " + block;
      i = braceClose + 1;
      continue;
    }

    // Multi-selector: prefix each comma-separated fragment
    const prefixed = sel.split(",").map(s => {
      const trimmed = s.trim();
      if (!trimmed) return s;
      return `${trigger} ${trimmed}`;
    }).join(", ");

    result += lead + prefixed + " " + block;
    i = braceClose + 1;
  }

  // Restore comments
  result = result.replace(/\/\*__C(\d+)__\*\//g, (_, n) => comments[Number(n)]);
  return result;
}

function findMatchingBrace(s, open) {
  let depth = 1;
  for (let j = open + 1; j < s.length; j++) {
    if (s[j] === "{") depth++;
    else if (s[j] === "}") { depth--; if (depth === 0) return j; }
  }
  return -1;
}
