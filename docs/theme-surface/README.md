# Pinboard Theme Surface — Spec v1

Updated: 2026-08-30 · Version: 2.0.0

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

Evidence base: `manifest.json` records the empirical page/surface inventory;
`docs/theme-surface/snapshots/` contains the supporting captures and audits.
`tools/validate-contracts.mjs` executes the token schema and cross-checks the
manifest registry before generation.

## §1 · Three-layer architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Layer 1  MANIFEST   (manifest.json)                         │
│  Semantic inventory: 102 surfaces × 14 pages × 4 templates.  │
│  Records verified selectors + required token slots + states. │
│  Source of truth for validators.                             │
├──────────────────────────────────────────────────────────────┤
│  Layer 2  TOKENS     (tokens.schema.json + <theme>.tokens)   │
│  Open dict of design decisions: palette, typo, space, radius,│
│  border, fx, motion, assets, layout. Executably validated.   │
├──────────────────────────────────────────────────────────────┤
│  Layer 3  COMPOSER   (composers/*.mjs)                       │
│  Pure fn: compose(tokens) -> cssString. Each composer renders│
│  the same surfaces with a different layout philosophy.       │
│  Canonical: classic-list-v2; demos: dense/card-grid/magazine │
└──────────────────────────────────────────────────────────────┘
```

Every composer concatenates `baseLayer(tokens)` before its own rules, so the
inline-override defenses (row-hover, bookmark-separator, private-bg, etc.)
are non-negotiable and applied uniformly.

## §2 · Manifest inventory

`manifest.json` is the executable map of the Pinboard surface. Each of the
102 surface entries records:

| Field | Meaning |
|-------|---------|
| `sel` | Verified CSS selector captured from live `raw.html` |
| `role` | Semantic purpose (for humans, for validators) |
| `states` | Required state hooks (`default`, `hover`, `focus-visible`, `::selection`, ...) |
| `tokens` | Token slots the surface reads |
| `layout_hook` | Whether composers may structurally restructure this surface (e.g. turn `.bookmark` into a card) |
| `inline_quirks` | Empirical inline-style patterns with page frequency |

14 pages are mapped to 4 templates:

- **P1-list** — home, network, notes, popular, unread, url-detail
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

1. Copy an existing `pilots/*.tokens.json`; keep `meta.id` equal to its filename stem.
2. Edit `palette`, `typo`, `space`, `patterns`, and optional `ui` overrides.
3. Validate: `node docs/theme-surface/tools/validate-contracts.mjs --pilot docs/theme-surface/pilots/my-theme.tokens.json`.
4. Regenerate and gate: `node docs/theme-surface/tools/sync-all.mjs`.
5. Prove the synchronized tree is byte-exact and read-only: `node docs/theme-surface/tools/sync-all.mjs --check`.
6. Preview on the real Pinboard and extension surfaces.

### Option B · Create a new composer

1. Copy the closest composer to `composers/my-mode.mjs`.
2. Rename `compose`, change `tokens.layout.mode` value you respond to.
3. Keep `baseLayer(tokens)` at the top — do not skip.
4. Restructure any surface with `layout_hook: true` in `manifest.json`.
   Surfaces without that flag should keep their semantic role intact.
5. Add `my-mode` to `tokens.schema.json`'s `layout.mode` enum.
6. Add a pilot fixture and run `validate-contracts`, `sync-all`, and the render oracle.

### Contrast guard (automated)

Every theme passes `tools/contrast-audit.mjs`, which the `tools/sync-all.mjs`
pipeline runs automatically (12 steps: validate-contracts, render-all,
apply-ui-themes --write, dynamic apply-tokens, diff-all --strict,
contrast-audit, css-region-audit, ui-token-coverage, layout-lint, url-lint,
recipe-lint, override-debt).
The git pre-commit hook runs the same pipeline in strict `--check` mode, then
adds source/cascade/hand-edit/UI contract gates. `scripts/verify.sh` also runs
the parser, CLI mutation and zero-write integration tests; see §9 for the
independent `scripts/ui-render-audit.mjs` render oracle. The audit
fails the run when a token pair drops below WCAG AA — the failure modes that
produced past regressions:

| Pair | Min ratio | Why |
|------|-----------|-----|
| `pinboard.bg vs fg` | 4.5:1 | body text |
| `pinboard.btn-bg vs btn-fg` | 4.5:1 | save/cancel/sign-up button text |
| `pinboard.btn-bg-hover vs btn-fg` | 4.5:1 | same, hover state |
| `pinboard.sidebar-btn-bg vs fg` | 4.5:1 | right-bar submits (subscribe, tweet search) |
| `pinboard.sidebar-btn-hover vs fg` | 4.5:1 | same, hover state |
| `pinboard.on-accent vs accent` | 4.5:1 | text on an accent fill (selected page-nav chip, RSS hover) |
| `pinboard.on-link-hover vs link-hover` | 4.5:1 | same, hover fill |
| `pinboard.fg / fg-strong / muted / muted-soft / metadata-fg vs bg / bg-surface / private-bg` | 4.5:1 | every persistent bookmark-row text base, including private rows |
| `pinboard.accent / accent-hover / link-hover / link-visited / success / tag-fg / destroy vs bg / bg-surface / private-bg` | 4.5:1 | site link, status and semantic text roles on every persistent row base |
| `pinboard.focus-ring vs bg / bg-surface / private-bg` | 3:1 | focus boundary visibility, including links inside private rows |
| `pinboard.muted vs bg-surface` | 3:1 | scrollbar thumb visibility |
| `popup.fg vs bg` (`--pp-*`) | 4.5:1 | popup body |
| `popup.fg-hint vs bg` | 4.5:1 | char counters, hints |
| `popup.fg-muted vs bg` | 4.5:1 | labels, group headers |
| `{popup,options,library}.fg-hint / fg-muted vs bg2` | 4.5:1 | the same two text tiers on the elevated surface (autocomplete footer, offline strip, panels); added 2026-08-26 when retiring the popup's hand-written dark layer exposed 4.0-4.5:1 holes the bg-only rows could not see |
| `{popup,options,library}.fg-hint / fg-muted vs drop-hover` | 4.5:1 | the same two tiers on the accent-tinted hover/selected row fill (popup's selected autocomplete candidate keeps its count there); `_ui-derive.mjs` derives both tiers against bg, bg2 and drop-hover |
| `options.fg vs bg` (`--opt-*`) | 4.5:1 | settings body |
| `options.fg-hint vs bg` | 4.5:1 | inline hint text |
| `options.fg-muted vs bg` | 4.5:1 | tab labels, accordion headers |
| `library.fg / fg-muted vs bg` **and** `vs panel` (`--lib-*`) | 4.5:1 | library body text sits on both the page bg and the elevated pane, so both are checked |
| `library.row-selected-fg vs row-selected-bg` | 4.5:1 | selected list row: own fill, own text, not composited over bg |
| `library.save / danger / warn vs bg` | 4.5:1 | flat status text (library has no tinted status fills) |

**Component-layer pairs (2026-08 design-uplift addition).** A second table,
`COMPONENT_PAIR_SPEC` in `contrast-audit.mjs`, is generic across all three
extension surfaces — each row is checked once per surface (`--pp-*`,
`--opt-*`, `--lib-*`) × per theme × the default surface, not written out
per-surface by hand:

| Pair (role names, prefix-agnostic) | Min ratio | Scope |
|------|-----------|-------|
| `btn-fg` vs `btn-bg` / `btn-hover` | 4.5:1 | all 3 surfaces |
| `chip-fg` vs `chip-bg` / `btn-hover` | 4.5:1 | all 3 surfaces (the `btn-hover` row covers a pressable `[aria-pressed]` chip swapping its fill on hover) |
| `danger-quiet-fg` vs `bg` / `panel` / `btn-bg` | 4.5:1 | audited on all 3 surfaces (no `onlyNs`); real consumption today is options + library only (`.btn.danger`'s text color, the reading-surface destructive tier) — popup defines the token in every theme block but never consumes it in `popup.css` |
| `on-danger` vs `danger` | 4.5:1 | audited on all 3 surfaces (no `onlyNs`); options/library consume it every theme via the generated `.confirm-popover .confirm-yes` (the solid confirm-dialog tier). popup consumes it too, but only on its default LIGHT surface — all 14 `html[data-theme]` presets (which since 2026-08-25 include the popup's no-preset dark state, flexoki-dark; the former `html.dark` layer is retired) override to the "warn-on-warn" scheme (COMPONENTS.md §4), so those states never actually render it despite the token being defined for every block |
| `border` vs `btn-bg` / `panel` | 3:1 | all 3 surfaces (WCAG 1.4.11 non-text; Task 16) |
| `preset-fg` vs `preset-bg` / `btn-hover`; `tag-fg` vs `tag-bg`; `spinner-fg` vs `spinner-bg` | 4.5:1 / 4.5:1 / 3:1 | popup-only (`["pp"]`-scoped rows — these roles have no `--opt-*`/`--lib-*` counterpart) |

The pair list is enumerated by the tool's own `COMPONENT_PAIR_SPEC` array
(convenience, not the completeness authority) and doubles as an **orphan
guard**: every `*-fg` / `on-*`-shaped custom property a surface's
`@generated:ui-themes` region actually emits must either be a role this
table checks or carry an explicit `ORPHAN_ALLOWLIST` entry with a reason —
otherwise a brand-new fg/on- token can ship with zero contrast coverage and
nothing here would notice. The completeness authority for "did we check
everything that needed checking" is the **independent, hand-written**
render oracle (`tests/render-audit-checklist.mjs`, run via
`scripts/ui-render-audit.mjs`) — this static table is a fast, CI-friendly
supplement to it, not a replacement (see §9).

**What the audit reads matters as much as the table.** It runs on
`_util.mjs#expandSitePalette` output, not the raw pilot, because `btn-bg`,
`sidebar-btn-*` and the `on-<fill>` tokens are *derived* there (see "Contrast
derivation" below), and site text roles are rechecked against `private-bg`
without changing the extension surfaces. It also iterates every
`modes.<name>` palette, not just the
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

**Extension UI adds four more levers** (same file, `_ui-derive.mjs`, used by
`popup-chrome.mjs`/`options-chrome.mjs`/`library-chrome.mjs` rather than the
pinboard.in composers above — all four are identity when the pair already
clears their threshold):

- `fgToAAMulti(fg, bgs, min)` — like `fgToAA` but pushes lightness until the
  foreground clears `min` against **every** background in `bgs`, not just
  one. Needed wherever a role paints on more than one fill — a button's text
  sits on both its resting and hover fill, library's row text sits on both
  `bg` and `panel`.
- `borderToAA(border, bgs, min = 3)` — same repeated-worst-case shape as
  `fgToAAMulti`, at the WCAG 1.4.11 non-text 3:1 floor instead of the 4.5:1
  text floor. Drives the `border` role's derivation (Task 16).
- `fillSeparate(fill, surfaces, fg, min = 1.06)` — the Soft Fill law
  (COMPONENTS.md §9): mixes a surface's own `fg` into a control's fill until
  it clears a much weaker "is this fill perceivable at all against its host
  surface" floor (1.06:1, well below the 3:1 non-text AA floor — that job
  still belongs to the focus ring and hover state). Drives `btn-bg`,
  `btn-hover`, `input-bg` and `chip-bg` once a control's resting border
  color collapses into its fill.
- `resolveOpaqueBg(raw, fallbackBg)` / `resolveChipBg(raw, accentRgb,
  panelRgb)` — not derivations themselves, but a prerequisite every
  above lever needs: a pilot's `border` or `tag-bg` may be a non-opaque
  8-digit alpha hex or the literal keyword `transparent` (terminal's border
  glow; 9/13 pilots' `tag-bg`), and feeding that raw string straight into
  `hexToRgb()` silently misparses it as black. These resolve it to the solid
  RGB it actually composites to (or, for `resolveChipBg`, synthesize a 10%
  accent-on-panel tint when the raw value is fully transparent — a chip
  pill whose fill equals its own panel is exactly as invisible as literal
  `transparent`).

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

The factory is the build-time authoring source. `sync-all.mjs` composes every
pilot and rewrites `pinboard-themes.js`; that generated file is then loaded at
runtime only while a site preset is active. The same run rewrites the six
generated regions in `popup.css`, `options.css`, and `library.css`. Its
`--check` mode executes the same 12-step pipeline without writing reports,
snapshots, CSS, or runtime artifacts, and requires byte-identical generated
output. Never copy composer output or edit those generated artifacts by hand.

## §7 · Files in this spec

```
docs/theme-surface/
├── README.md                ← this file
├── manifest.json            ← Layer 1: surface inventory
├── tokens.schema.json       ← Layer 2: token schema
├── COMPONENTS.md / NEW_THEME.md
├── composers/               ← Layer 3: site/UI composers + component recipe
│   ├── _base.mjs            ← inline-override layer (non-negotiable)
│   ├── _util.mjs            ← helpers
│   ├── classic-list-v2.mjs
│   ├── *-chrome.mjs
│   └── ui-components.mjs
├── pilots/                  ← 13 token sources + generated authoring snapshots
├── tools/                   ← compiler, shared css-syntax scanner, validators, audits, sync-all
└── snapshots/               ← 14-page empirical captures
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

The factory no longer stops at pinboard.in. Three additional composers render
each pilot's palette into the extension's own chrome:

| Composer | Output | Region |
|----------|--------|--------|
| `composers/popup-chrome.mjs` | `--pp-*` custom properties | `@generated:ui-themes` in `popup.css` |
| `composers/options-chrome.mjs` | `--opt-*` custom properties | `@generated:ui-themes` in `options.css` |
| `composers/library-chrome.mjs` | `--lib-*` custom properties | `@generated:ui-themes` in `library.css` |

All three derive their role colors from the pilot palette via
`composers/_ui-derive.mjs`; a pilot may override any derived value through
the `ui` field in its tokens file (`ui.popup.light/dark`,
`ui.options.light/dark`, `ui.library.light/dark` — see NEW_THEME.md §ui).
`tools/apply-ui-themes.mjs --write` regenerates the regions; sync-all runs it
automatically.

The library composer derives `danger` / `warn` itself (no pilot carries
`ui.library` overrides yet), so a new theme needs no library-specific tokens
to pass `ui-token-coverage`.

Two contracts learned the hard way (2026-07 regressions):

- **`on-accent` is emitted explicitly for every theme.** A `var(--pp-on-accent,
  fallback)` fallback in a shared rule is dead code — custom properties
  inherit, so :root's light-surface value would always win. The composer
  emits the token per theme (default: the theme bg) and
  `contrast-audit.mjs` gates `on-accent` vs `accent` at AA.
- **The `@generated:ui-themes` regions are composer-owned.** Hand edits are
  caught by `tools/css-region-audit.mjs`, the same way `handedit-audit.mjs`
  guards `pinboard-themes.js`. (As of §10 below, each of these three files
  carries a SECOND generated region too — `css-region-audit.mjs` covers both
  kinds generically, it does not need per-region wiring.)

Spacing is deliberately OUTSIDE the factory: `--pp-sp-*` / `--opt-sp-*`
(and the reader's `--prose-fs` family) are theme-invariant and live in each
file's hand-maintained `:root` — no pilot may vary density per theme. §10's
component recipe layer *consumes* these same tokens through a spacing
adapter; it does not define new ones or let a theme vary them.

## §10 · Addendum (2026-08, design-uplift): the component-layer generated region

§9 covers *color* — one generated block per theme, per surface. This
addendum covers *structure* — button/chip/danger/form-field geometry and
paired state-feedback rules, generated **once per surface**, not once per
theme, because a component's shape doesn't change with the palette.

**Two independent regions, not one.** As of this campaign, `popup.css`,
`options.css` and `library.css` each carry a second generated region,
`@generated:ui-components`, alongside the `@generated:ui-themes` region §9
describes:

| Region | Composer | Per-theme? | Content |
|--------|----------|------------|---------|
| `@generated:ui-themes` | `popup-chrome.mjs` / `options-chrome.mjs` / `library-chrome.mjs` | Yes — one `html[data-theme="…"]` block per pilot + a default-surface block | Color roles (§9) |
| `@generated:ui-components` | `composers/ui-components.mjs` (single source, `renderComponents(ns, families)`) | No — one recipe per surface | Structural CSS: `.btn`/`.btn-sm`/`.btn-ic` geometry, chip pill geometry, the two-tier danger recipe, form-field height/focus — `docs/theme-surface/COMPONENTS.md` is the design authority these transcribe |

Each region has its **own independent start/end sentinel** —
`@generated:ui-components` never reuses `@generated:ui-themes`'s shared
`/* @generated:ui-themes end */` marker (reusing it would splice the wrong
region's body into the wrong place). `tools/apply-ui-themes.mjs --write`
writes both kinds of region for all three files in one pass; `sync-all` runs
it automatically. `css-region-audit.mjs` iterates the tool's own `SURFACES`
array generically, so all six regions (three ui-themes + three
ui-components) are covered without any per-region code in the audit itself.

**Colors inside the recipe are still `var()` references into §9's tokens**
— the component layer never invents its own palette. Five shared paired
colors (`btn-fg`, `danger-quiet-fg`, `on-danger`, `chip-bg`, `chip-fg`) are
computed by `_ui-derive.mjs#finalizeUiControlRoles` from the FINAL,
post-`ui`-override map, so popup/options/library use one contrast and soft-fill
algorithm. Popup then derives its surface-only `preset-fg` and `spinner-fg`.

**These seven names are derived outputs, not authoring inputs.**
`validate-contracts.mjs` rejects the five shared names on every surface and
also rejects `preset-fg` / `spinner-fg` under `ui.popup.*`, naming the exact
JSON pointer. This replaces the former silent-discard limitation with an
executable contract. Change supported inputs (`btn-bg`, `danger`, `tag-bg`,
`tag-fg`, `preset-bg`, `spinner-bg`, etc.) and let the finalizer produce a
passing pair; adding a genuinely new output escape hatch requires changing
the derivation contract and its tests rather than hiding it in a pilot.

**Spacing adapter.** The recipe declares padding/gap in plain px semantics;
`ui-components.mjs`'s `sp(ns, px)` maps each value to that surface's
existing `--{ns}-sp-N` token of equal numeric value — never a literal, and
never a cross-surface name translation (popup/options are a 7-rung scale,
library is 5-rung; the same px can land on a different rung number per
surface, or on none, in which case the recipe falls back to a literal px —
library has no 2px or 6px rung). `tools/recipe-lint.mjs` statically verifies
this mapping against each surface's real shipped `:root` values, so a
`--sp-*` token edit that silently desyncs the adapter fails loudly instead
of drifting.

**Gates, beyond §5/§9's color gates:**

| Gate | What it adds |
|------|------|
| `tools/recipe-lint.mjs` | ~14 static checks on `ui-components.mjs` itself: paired-color law (any rule backgrounding must also color), chip geometry laws, the spacing-adapter accuracy check above, no direct `--{ns}-sp-N` reference outside the adapter, no `var(--x, fallback)` in rendered output, press-is-instant (no `transform` in `.btn`'s transition list), no `transition: all`, a ≤200ms motion budget on every duration token actually referenced, `.btn-ic` base rule presence, and the roundness laws (§9.2 below) — token-only radii, concentric nesting |
| `tools/contrast-audit.mjs`'s `COMPONENT_PAIR_SPEC` | Component-pair AA/3:1 coverage — see the table in the "Contrast guard" section above |
| `scripts/ui-render-audit.mjs` (repo root, not under `docs/theme-surface/`) | The completeness authority: an **independent, hand-written** checklist (`tests/render-audit-checklist.mjs`) drives playwright against an unpacked-extension load, reading real `getComputedStyle` per theme — deliberately never generated from `ui-components.mjs`, so a component the recipe forgot to register can't also make the oracle forget to check it. Wired into `scripts/verify.sh`'s `[render-audit]` section. `tests/render-audit-known-failures.json` retains the migration-era baseline mechanism; the committed baseline is currently empty. |

**Terminal's exemption — a template for a theme that wants a framed
identity.** Every pilot in this campaign was flattened onto the Soft Fill
language (COMPONENTS.md §9: resting border collapses into the fill). If your
new theme's identity genuinely depends on a visible resting frame (the way
terminal's does — a phosphor-glow border is the whole point), declare the
relevant `-bd`/`-border` role(s) explicitly in your pilot's
`ui.<surface>.<mode>` block (e.g. `ui.popup.dark.btn-bd`,
`ui.options.dark.btn-border`/`input-border`, `ui.library.dark.btn-border`/
`input-border`): the composer treats "this pilot declared its own border
role" as the opt-out signal and skips the `fillSeparate()` step for that
role, restoring your pilot's own border color exactly as declared. Geometry
(radius, padding) is NOT exemptable this way — it follows the surface's
token ladder unconditionally, same as every other theme. See
`pilots/terminal.tokens.json`'s `ui.popup/options/library.dark` blocks for
the worked example (COMPONENTS.md §9.5 has the full rule).

Component design authority: `docs/theme-surface/COMPONENTS.md` (structure
recipe / token-pair list / geometry constraints / usage rules for each of
the 7 component families, plus a state-feedback ruling table and a
human-review checklist for what no automated gate can decide — icon
semantics, which danger tier a new button belongs to, `is-error` class
cascades). Consult it before touching `ui-components.mjs` by hand; it is the
spec `recipe-lint` and the render oracle both check against.
