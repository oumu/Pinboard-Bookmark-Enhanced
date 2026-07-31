import { expandPalette } from "./_util.mjs";
import { mergeTokens } from "./compose-theme.mjs";
import { deriveUiColors, deriveUiRadius, regularizeUiRadius } from "./_ui-derive.mjs";

// popup theme id -> { pilot, mode, useDarkMode? }
// 12 themes map 1:1; the flexoki pilot yields BOTH flexoki-light and flexoki-dark.
export const POPUP_THEME_MAP = [
  { id: "modern-card", pilot: "modern-card", mode: "light" },
  { id: "nord-night", pilot: "nord-night", mode: "dark" },
  { id: "terminal", pilot: "terminal", mode: "dark" },
  { id: "paper-ink", pilot: "paper-ink", mode: "light" },
  { id: "dracula", pilot: "dracula", mode: "dark" },
  { id: "flexoki-light", pilot: "flexoki", mode: "light" },
  { id: "flexoki-dark", pilot: "flexoki", mode: "dark", useDarkMode: true },
  { id: "solarized-light", pilot: "solarized-light", mode: "light" },
  { id: "solarized-dark", pilot: "solarized-dark", mode: "dark" },
  { id: "catppuccin-latte", pilot: "catppuccin-latte", mode: "light" },
  { id: "catppuccin-mocha", pilot: "catppuccin-mocha", mode: "dark" },
  { id: "gruvbox-dark", pilot: "gruvbox-dark", mode: "dark" },
  { id: "rose-pine", pilot: "rose-pine", mode: "dark" },
  { id: "github-light", pilot: "github-light", mode: "light" },
];

function emitPp(ui) {
  const lines = [];
  const set = (k, val) => lines.push(`  --pp-${k}: ${val};`);
  for (const k of ["bg", "bg2", "fg", "fg-muted", "fg-hint", "link", "accent", "accent2",
    "border", "divider", "input-bg", "input-focus-bg", "tag-bg", "tag-fg", "tag-hover", "drop-hover",
    "banner-bg", "banner-bd", "banner-fg", "warn-bg", "warn-bd", "warn-fg",
    "ok-bg", "ok-bd", "ok-fg", "offline-bg", "offline-bd", "offline-fg",
    "danger", "spinner-bg", "spinner-fg", "preset-bg", "preset-bd", "preset-fg",
    "radius-sm", "radius-md", "radius-lg", "radius-tag", "focus-bd", "focus-ring", "on-accent"]) {
    if (ui[k] != null) set(k, ui[k]);
  }
  // info-* are aliases of banner-* (no separate derivation)
  set("info-bg", "var(--pp-banner-bg)");
  set("info-bd", "var(--pp-banner-bd)");
  set("info-fg", "var(--pp-banner-fg)");
  return lines.join("\n");
}

// tokensByPilot: { [pilotSlug]: parsedTokensJson }
export function composePopupThemes(tokensByPilot) {
  const blocks = [];
  for (const entry of POPUP_THEME_MAP) {
    const tk = tokensByPilot[entry.pilot];
    if (!tk) throw new Error(`popup-chrome: missing pilot ${entry.pilot} for ${entry.id}`);
    const merged = entry.useDarkMode && tk.modes?.dark ? mergeTokens(tk, tk.modes.dark) : tk;
    const palette = expandPalette(merged.palette);
    // Pilot-level ui overrides (tokens.json `ui.popup.<mode>`) win over derivation:
    // theme-specific refinements the palette derivation cannot express.
    const derived = deriveUiColors(palette, entry.mode);
    // on-accent is emitted EXPLICITLY for every theme (default: the theme bg,
    // the long-standing submit-button text derivation). It must not fall back
    // through var() to :root's light-surface white: custom properties inherit,
    // so a var(--pp-on-accent, ...) fallback in a shared rule is dead code —
    // the exact mistake that turned every themed submit button white (2026-07).
    // Radius is DERIVED now, not override-only. Before this, --pp-radius-* was
    // emitted solely where a pilot restated it, so 9 of the 13 themes silently
    // fell back to :root's generic 3/8/10 while their site CSS used the pilot's
    // own scale. regularizeUiRadius runs last so an override cannot reintroduce
    // an inversion (paper-ink shipped lg:3px under md:4px).
    const ui = {
      ...derived, "on-accent": derived.bg,
      ...deriveUiRadius(merged.radius),
      ...(tk.ui?.popup?.[entry.mode] ?? {}),
    };
    Object.assign(ui, regularizeUiRadius(ui));
    blocks.push(`html[data-theme="${entry.id}"] {\n${emitPp(ui)}\n}`);
  }
  return blocks.join("\n");
}
