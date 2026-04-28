// Shared helpers for composers.

export function varName(slot) {
  return `--pinboard-${slot}`;
}

// Palette expansion: fill optional slots with principled fallbacks so every
// composer can reference a complete palette without null checks.
export function expandPalette(p) {
  const bg = p.bg;
  const fg = p.fg;
  const muted = p.muted;
  const border = p.border;
  const accent = p.accent;
  return {
    ...p,
    // strong / soft variants
    "fg-strong":      p["fg-strong"]      || fg,
    "muted-soft":     p["muted-soft"]     || muted,
    "border-strong":  p["border-strong"]  || border,
    "border-soft":    p["border-soft"]    || border,
    "bg-surface":     p["bg-surface"]     || bg,
    // accent family
    "btn-bg":         p["btn-bg"]         || accent,
    "btn-bg-hover":   p["btn-bg-hover"]   || p["link-hover"] || p["accent-hover"] || p["btn-bg"] || accent,
    "accent-hover":   p["accent-hover"]   || p["link-hover"] || accent,
    "accent-soft":    p["accent-soft"]    || p["tag-bg"] || accent,
    "link-hover":     p["link-hover"]     || p["accent-hover"] || accent,
    "link-visited":   p["link-visited"]   || accent,
    "focus-ring":     p["focus-ring"]     || accent,
    // semantic fallbacks
    "tag-fg":         p["tag-fg"]         || accent,
    "success":        p["success"]        || accent,
    "success-hover":  p["success-hover"]  || p["link-hover"] || accent,
    "private-accent": p["private-accent"] || p.destroy,
    "url-link-bg":    p["url-link-bg"]    || p["tag-bg"] || accent,
    "url-link-fg":    p["url-link-fg"]    || fg,
    "unread":         p["unread"]         || p.destroy
  };
}

// Apply a state delta on top of a base palette object. Used by composers that
// want to honor tokens.states.hover / focus-visible overrides.
export function withState(palette, delta) {
  if (!delta || !delta.palette) return palette;
  return { ...palette, ...delta.palette };
}

// Render a block of property:value pairs into a CSS rule.
export function block(selector, decls) {
  const body = Object.entries(decls)
    .filter(([, v]) => v != null && v !== "")
    .map(([k, v]) => `  ${k}: ${v};`)
    .join("\n");
  return `${selector} {\n${body}\n}`;
}

// Shorthand for "var(--pinboard-xxx)"
export function v(slot) { return `var(${varName(slot)})`; }
