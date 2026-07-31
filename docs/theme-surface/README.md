# Pinboard Theme Surface — Spec v1

Updated: 2026-07-15 · Version: 1.1.0

A three-layer architecture for Pinboard custom themes that separates **what a
surface is** (manifest) from **what colors/spacing it uses** (tokens) from
**how it's rendered** (composer). The goal: authoring a new theme no longer
requires re-reading every page or handcrafting ~200 lines of defensive CSS.

---

## §0 · Why this spec exists

Pinboard's HTML writes inline `style=""`, attaches `onmouseover="this.style..."`
handlers, and relies on legacy attributes like `bgcolor`, `<font>`, and
`width="830"`. A custom theme that only restyles tags will always lose a
specificity war against those inline writes.

Shipped themes (`pinboard-themes.js`, ~2700 lines) proved this empirically but
encoded the defenses per-theme. This spec lifts those defenses into a shared
**base layer** so each theme only has to declare its tokens and pick a
**composer** (layout mode).

Evidence base: `docs/theme-surface/snapshots/` — 13 pages × (default + hover +
focus + selection) screenshots + raw HTML + audit JSON, aggregated into
`aggregate-report.json`.

## §1 · Three-layer architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Layer 1  MANIFEST   (manifest.json)                         │
│  Semantic inventory: 35 surfaces × 13 pages × 4 templates.   │
│  Records verified selectors + required token slots + states. │
│  Source of truth for validators.                             │
├──────────────────────────────────────────────────────────────┤
│  Layer 2  TOKENS     (tokens.schema.json + <theme>.tokens)   │
│  Open dict of design decisions: palette, typo, space, radius,│
│  border, fx, motion, assets, layout. Validated via schema.   │
├──────────────────────────────────────────────────────────────┤
│  Layer 3  COMPOSER   (composers/*.mjs)                       │
│  Pure fn: compose(tokens) -> cssString. Each composer renders│
│  the same surfaces with a different layout philosophy.       │
│  Ships: classic-list | dense | card-grid | magazine          │
└──────────────────────────────────────────────────────────────┘
```

Every composer concatenates `baseLayer(tokens)` before its own rules, so the
inline-override defenses (row-hover, bookmark-separator, private-bg, etc.)
are non-negotiable and applied uniformly.

## §2 · Manifest inventory

`manifest.json` is the authoritative map of the Pinboard surface. Each of the
35 surface entries records:

| Field | Meaning |
|-------|---------|
| `sel` | Verified CSS selector captured from live `raw.html` |
| `role` | Semantic purpose (for humans, for validators) |
| `states` | Required state hooks (`default`, `hover`, `focus-visible`, `::selection`, ...) |
| `tokens` | Token slots the surface reads |
| `layout_hook` | Whether composers may structurally restructure this surface (e.g. turn `.bookmark` into a card) |
| `inline_quirks` | Empirical inline-style patterns with page frequency |

13 pages are mapped to 4 templates:

- **P1-list** — home, network, notes, popular, unread
- **P2-form** — add, note-add, settings, profile
- **P3-rightbar-heavy** — tweets, subscriptions-tags
- **P4-table** — bundles, tabs

Every template declares `required_surfaces` + `optional_surfaces`. The
validator uses these to gate coverage.

## §3 · Tokens

See `tokens.schema.json` for the authoritative schema. Minimum required shape:

```jsonc
{
  "meta": { "id": "my-theme", "name": "My Theme", "mode": "light" },
  "layout": { "mode": "classic-list" },
  "palette": {
    "bg": "...", "fg": "...", "muted": "...",
    "border": "...",
    "accent": "...", "accent-alpha": "...",
    "input-bg": "...",
    "private-bg": "...",
    "selection-bg": "...", "selection-fg": "...",
    "tag-bg": "...",
    "row-hover": "...",
    "destroy": "...",
    "btn-bg": "...", "btn-fg": "..."
  },
  "typo":   { "family": "system-ui, sans-serif", "size-base": "14px", "line-height": 1.5 },
  "space":  { "unit": "4px", "bookmark-gap": "10px", "main-padding": "16px" }
}
```

Every required slot exists because at least one surface in `manifest.json`
references it. Optional slots (`fg-strong`, `link-hover`, `focus-ring`, ...)
are filled by sensible fallbacks in `composers/_util.mjs::expandPalette()`.

**Extension slots** — `fx` / `motion` / `assets` / `ext` — are open. Composers
that opt in read them; composers that don't will ignore unknown keys.
`overrides` is the escape hatch for surface-scoped custom CSS fragments.

## §4 · Composers

| Mode | Philosophy | Grid | Notable transforms |
|------|------------|------|-------------------|
| `classic-list` | Canonical Pinboard look — the shipped 14 themes | Block flow | None; tokenized only |
| `dense` | High-density power-user view | Block flow | Smaller type, 2-line description clamp, tight form padding |
| `card-grid` | Responsive grid of bookmark cards | CSS Grid `auto-fill minmax(280px, 1fr)` | `.bookmark` becomes a card with shadow + hover-lift; right_bar docks below main |
| `magazine` | Editorial layout with hero + drop caps | 2-column Grid, hero spans | Numbered gutter, serif headings, small-caps banner, first-bookmark hero, private `::after` stripe instead of bg flood |

Each composer is a pure function:

```js
import { compose } from "./composers/magazine.mjs";
const css = compose(tokens);          // -> string
```

Contract:
1. MUST call `baseLayer(tokens)` first so inline-override defenses load.
2. MUST define a color for every `::selection` + `::-moz-selection`.
3. MUST emit focus-visible for every interactive surface.
4. SHOULD not use `!important` except to defeat inline writes documented in
   `manifest.json::inline_base_rules` (those are already in `_base`).

A composer that wants to reuse another composer's work can do so — see
`dense.mjs` which composes on top of `classic-list.mjs`.

## §5 · Authoring a new theme

### Option A · Pick an existing composer, supply tokens

1. Start from an existing theme's token file (once Sprint 3 migrates them).
2. Edit `palette`, `typo`, `space` — every change is a data tweak.
3. Validate: `node scripts/validate-theme.mjs my-theme.tokens.json`.
4. Preview: open `pinboard.in` with the theme applied.

### Option B · Create a new composer

1. Copy `composers/classic-list.mjs` to `composers/my-mode.mjs`.
2. Rename `compose`, change `tokens.layout.mode` value you respond to.
3. Keep `baseLayer(tokens)` at the top — do not skip.
4. Restructure any surface with `layout_hook: true` in `manifest.json`.
   Surfaces without that flag should keep their semantic role intact.
5. Add `my-mode` to `tokens.schema.json`'s `layout.mode` enum.
6. Smoke test with the sample theme: `node scripts/smoke-compose.mjs my-mode`.

### Contrast guard (automated)

Every theme passes `tools/contrast-audit.mjs`, which the `tools/sync-all.mjs`
pipeline runs automatically (step 4 of its 8-step run: render-all,
apply-tokens ×13, diff-all --strict, contrast-audit, css-region-audit,
ui-token-coverage, layout-lint, url-lint). The audit fails the run when a
token pair drops below WCAG AA — the failure modes that produced past
regressions:

| Pair | Min ratio | Why |
|------|-----------|-----|
| `pinboard.bg vs fg` | 4.5:1 | body text |
| `pinboard.btn-bg vs btn-fg` | 4.5:1 | save/cancel/sign-up button text |
| `pinboard.btn-bg-hover vs btn-fg` | 4.5:1 | same, hover state |
| `pinboard.sidebar-btn-bg vs fg` | 4.5:1 | right-bar submits (subscribe, tweet search) |
| `pinboard.sidebar-btn-hover vs fg` | 4.5:1 | same, hover state |
| `pinboard.on-accent vs accent` | 4.5:1 | text on an accent fill (selected page-nav chip, RSS hover) |
| `pinboard.on-link-hover vs link-hover` | 4.5:1 | same, hover fill |
| `pinboard.muted vs bg-surface` | 3:1 | scrollbar thumb visibility |
| `popup.fg vs bg` (`--pp-*`) | 4.5:1 | popup body |
| `popup.fg-hint vs bg` | 4.5:1 | char counters, hints |
| `popup.fg-muted vs bg` | 4.5:1 | labels, group headers |
| `options.fg vs bg` (`--opt-*`) | 4.5:1 | settings body |
| `options.fg-hint vs bg` | 4.5:1 | inline hint text |
| `options.fg-muted vs bg` | 4.5:1 | tab labels, accordion headers |

**What the audit reads matters as much as the table.** It runs on
`_util.mjs#expandPalette` output, not the raw pilot, because `btn-bg`,
`sidebar-btn-*` and the `on-<fill>` tokens are *derived* there (see "Contrast
derivation" below). It also iterates every `modes.<name>` palette, not just the
base. Both were coverage holes: reading raw pilots hid 22 sub-AA pairs behind a
green run (worst was nord-night's selected page-nav chip at 1.74:1), and
skipping mode palettes hid the whole of Flexoki's dark mode.

Already-shipped legacy violations are pinned in the `ALLOWLIST` constant inside
`contrast-audit.mjs`; they print as `KNOWN` without blocking. **Adding a new
theme that hits the same pair fails the audit** — the allowlist matches
`<scope>:<theme>:<pair>` exactly, so the exemption never carries over. Only two
entries remain, both `muted vs bg-surface` (scrollbar thumb): `muted` doubles as
secondary body text, so raising it for the thumb would lighten the theme's
prose. **Do not add an exemption for a text/fill pair** — those all have a
derivation behind them now, so a failure means the derivation needs fixing, not
pinning.

### Contrast derivation

Two levers, picked by whether the token is shared. `composers/_ui-derive.mjs`
supplies both, and each is the identity function when a pair already clears AA,
so compliant themes render byte-for-byte unchanged.

- **Fill gives way.** `btn-bg` / `btn-bg-hover` and `sidebar-btn-bg` /
  `sidebar-btn-bg-hover` paint nothing but their own buttons, so `bgToAA()`
  darkens the fill by the minimum that clears AA against its text, preserving
  hue and saturation. When a base moves onto its hand-picked hover, the hover is
  re-derived from the new base so the hover affordance survives.
- **Text gives way.** `accent` alone paints 45+ surfaces, most of them text, so
  darkening it would repaint half the site. Where `btn-fg` used to sit on
  `accent` or `link-hover` as a *fill*, the composer now emits a per-fill
  `on-accent` / `on-link-hover` derived with `fgToAA()` instead.

A pilot's declared value is therefore a request, not a guarantee: declare
`btn-bg: #268bd2` on a palette whose `btn-fg` cannot reach AA against it and the
emitted value is the nearest passing shade. That is by design, not drift —
`diff-all --strict` compares composer output against shipped CSS, so both sides
see the derived value.

### State coverage checklist

For every interactive surface:

- [ ] `:hover` — row, link, button, tag
- [ ] `:focus-visible` — form inputs, banner search, submit button
- [ ] `::selection` + `::-moz-selection` — body text at minimum
- [ ] `:visited` — bookmark titles
- [ ] `::placeholder` — search + form inputs
- [ ] `:active` — submit button
- [ ] `:disabled` — form controls

Reference screenshots for all states: `docs/theme-surface/snapshots/<slug>/`.

## §6 · Integration with pinboard-themes.js

This spec is **authoring scaffolding**, not a build artifact. Per project
convention (zero-build, single-file source), the composers + base layer live
in `docs/theme-surface/composers/` as the reference implementation. Runtime
integration options:

- **Sprint 3 inline** — the composer logic is inlined into
  `pinboard-themes.js` so the extension can render a theme from its tokens at
  runtime without an import step. This preserves the single-file model.
- **Dev authoring** — contributors can `node` the composer locally against
  their tokens and copy the resulting CSS string into `pinboard-themes.js` if
  they prefer a snapshot workflow.

Validators in Sprint 4 operate on tokens + manifest; they do not depend on
which runtime strategy is in use.

## §7 · Files in this spec

```
docs/theme-surface/
├── README.md                ← this file
├── manifest.json            ← Layer 1: surface inventory
├── tokens.schema.json       ← Layer 2: token schema
├── aggregate-report.json    ← empirical evidence behind the manifest
├── composers/               ← Layer 3: reference composers
│   ├── _base.mjs            ← inline-override layer (non-negotiable)
│   ├── _util.mjs            ← helpers
│   ├── classic-list.mjs
│   ├── dense.mjs
│   ├── card-grid.mjs
│   └── magazine.mjs
└── snapshots/               ← 13 pages × (default/hover/focus/selection)
    └── <slug>/
        ├── raw.html
        ├── default.png
        ├── hover.png
        ├── focus.png
        ├── selection.png
        ├── inline-audit.json
        └── state-capture.json
```

## §8 · Glossary

- **Surface** — a semantic region of the Pinboard UI referenced by manifest.
- **Slot** — a named design decision in tokens (`palette.accent`, `space.unit`).
- **Composer** — a pure function that renders tokens as CSS for one layout mode.
- **Inline quirk** — a Pinboard inline style / legacy HTML attribute that must
  be tokenized via `!important` override in the base layer.
- **Hook** — a structural point where composers may restructure a surface
  (`layout_hook: true` in manifest).

---

## §9 · Addendum (2026-07): extension UI surfaces

The factory no longer stops at pinboard.in. Two additional composers render
each pilot's palette into the extension's own chrome:

| Composer | Output | Region |
|----------|--------|--------|
| `composers/popup-chrome.mjs` | `--pp-*` custom properties | `@generated:ui-themes` in `popup.css` |
| `composers/options-chrome.mjs` | `--opt-*` custom properties | `@generated:ui-themes` in `options.css` |

Both derive their role colors from the pilot palette via
`composers/_ui-derive.mjs`; a pilot may override any derived value through
the `ui` field in its tokens file (`ui.popup.light/dark`,
`ui.options.light/dark` — see NEW_THEME.md §ui). `tools/apply-ui-themes.mjs
--write` regenerates the regions; sync-all runs it automatically.

Two contracts learned the hard way (2026-07 regressions):

- **`on-accent` is emitted explicitly for every theme.** A `var(--pp-on-accent,
  fallback)` fallback in a shared rule is dead code — custom properties
  inherit, so :root's light-surface value would always win. The composer
  emits the token per theme (default: the theme bg) and
  `contrast-audit.mjs` gates `on-accent` vs `accent` at AA.
- **The `@generated:ui-themes` regions are composer-owned.** Hand edits are
  caught by `tools/css-region-audit.mjs`, the same way `handedit-audit.mjs`
  guards `pinboard-themes.js`.

Spacing is deliberately OUTSIDE the factory: `--pp-sp-*` / `--opt-sp-*`
(and the reader's `--prose-fs` family) are theme-invariant and live in each
file's hand-maintained `:root` — no pilot may vary density per theme.

