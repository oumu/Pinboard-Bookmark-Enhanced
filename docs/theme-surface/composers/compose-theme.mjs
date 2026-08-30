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

import { prefixSelectorList, transformStyleRuleSelectors } from "../tools/css-syntax.mjs";

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

export function mergeTokens(base, mode) {
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
  return transformStyleRuleSelectors(css, (selectorText) =>
    prefixSelectorList(selectorText, trigger));
}
