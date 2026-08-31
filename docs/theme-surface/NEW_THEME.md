# Adding a New Theme

Step-by-step for adding a theme preset to the factory. Distilled from the lessons
of the tag-style cascade refactor — read this before you start so you don't
spend rounds 2 through 6 of a 1-round task.

---

## TL;DR

```bash
# 1. copy a template tokens file
cp docs/theme-surface/pilots/github-light.tokens.json \
   docs/theme-surface/pilots/<your-slug>.tokens.json

# 2. edit the palette / typo / patterns to taste

# 3. validate the executable pilot/schema/manifest contract
node docs/theme-surface/tools/validate-contracts.mjs

# 4. regenerate pinboard-themes.js AND the popup.css/options.css/library.css
#    @generated:ui-themes regions (the sibling @generated:ui-components
#    region in each file is structure, not color — it never changes when
#    you only add a tokens file, see §6)
node docs/theme-surface/tools/sync-all.mjs

# 5. prove the synchronized tree is byte-exact and the check path writes nothing
node docs/theme-surface/tools/sync-all.mjs --check

# 6. run complementary source/cascade gates
node docs/theme-surface/tools/cascade-lint.mjs
node docs/theme-surface/tools/override-drift.mjs
node docs/theme-surface/tools/token-coverage.mjs
```

If all gates exit 0 you're done. Reload the extension at
`chrome://extensions/` and pick your theme from the options page.
The popup and options pages will also show your new theme automatically.

---

## 1 · Pick a template

| New theme is... | Copy from | Why |
|-----------------|-----------|-----|
| Light, minimal | `github-light.tokens.json` | Smallest overrides block, cleanest patterns |
| Dark, minimal | `nord-night.tokens.json` | Same shape, dark palette already balanced |
| Adaptive (auto light+dark) | `flexoki.tokens.json` | The only theme that uses `modes` |
| Colorful / playful | `catppuccin-latte.tokens.json` | Full palette, all P3+ patterns used |
| Brutalist / serif / editorial | `paper-ink.tokens.json` | Serif typo + tag-style underline |

The two recommended starting points are `github-light` (light) and `nord-night`
(dark). Both have well-documented overrides, consistent palette naming, and
deliberately small patterns blocks so you can layer in only what your theme
needs.

---

## 2 · Required token fields

Authoritative schema: `docs/theme-surface/tokens.schema.json`. Minimum keys
your tokens.json must declare:

### `meta`

| Key | Purpose |
|-----|---------|
| `id` | Must match the filename stem |
| `name` | Display name in the options dropdown |
| `description` | One-line tagline |
| `author` | Your handle |

### `layout`

| Key | Purpose |
|-----|---------|
| `mode` | Must be `"classic-list"` for shipped presets; manifest maps it to the canonical `classic-list-v2.mjs` composer |
| `max-width` | Optional column cap, e.g. `"1240px"` or `"none"` |
| `bookmark-style` | `"flat"` or `"card"` |

### `palette`

The 17 required slots:
`bg`, `bg-surface`, `fg`, `fg-strong`, `muted`, `muted-soft`,
`border`, `border-strong`, `accent`, `accent-hover`, `accent-soft`, `accent-alpha`,
`input-bg`, `private-bg`, `destroy`, `tag-bg`, `row-hover`.

`_util.mjs#expandPalette` fills sensible fallbacks for the other ~16 slots
(`btn-bg`, `link-hover`, `focus-ring`, `tag-fg`, `success`, ...). You can
override any of them explicitly.

**Right-bar submits** (subscribe on the subscriptions page, search on the tweets
page) read `sidebar-btn-bg`, `sidebar-btn-fg` and `sidebar-btn-bg-hover`. Leave
them out and they fall back to the `btn-*` family, which is what you want unless
your theme paints that button differently. The thirteen shipped pilots all
declare them, because they disagreed: seven treated it as the button color, two
picked a custom color, and four left it on `success`. That disagreement used to
live in hand-written `overrides.css`, where the composer could not read it and
therefore could not derive a text color for it.

**Your declared fill is a request, not a guarantee.** `btn-bg`, `btn-bg-hover`
and the three `sidebar-btn-*` slots pass through `bgToAA()`, which darkens them
by the minimum needed to clear WCAG AA against their text color. Hue and
saturation survive; lightness may not. If you declare `#268bd2` and see
`#2076b2` in `pinboard-themes.js`, that is the guard working, not drift.

**The same is true of site TEXT roles.** The shared `fg`, `fg-strong`, `muted`
and `muted-soft` tiers first pass through `fgToAAMulti()` against `bg` and
`bg-surface`. The site-only `expandSitePalette()` pass then checks those tiers,
`metadata-fg`, `accent`, `accent-hover`, `link-hover`, `link-visited`,
`success`, `tag-fg` and `destroy` against **all three** opaque Pinboard row
fills: `bg`, `bg-surface` and `private-bg`. `focus-ring` uses the same bases at
the 3:1 non-text floor. Hue and saturation survive; only the emitted
`--pinboard-*` values move, so the extension surfaces keep their own semantic
derivations. Declare `"muted": "#575653"` on a dark theme and
`pinboard-themes.js` may say `#918f8a`; that is the guard, not drift.
Two consequences worth planning for:

* A two-step secondary ramp compresses. Once **both** `muted` and `muted-soft`
  are held to a text floor, they land close together on light themes. Re-open
  the gap by moving `muted` and `fg` apart, never by pushing `muted-soft` back
  under AA.
* Secondary text may not out-rank body text. `contrast-audit` fails a palette
  where `muted`/`muted-soft` end up with *more* contrast against `bg` than `fg`
  does. When that fires, the ramp is too narrow: move `fg` further from the
  background, or pull `bg-surface` closer to `bg`. Do not lower the secondary
  tier — it is already sitting on its AA floor.

**Optional slot: `scrollbar-thumb`.** Defaults to the derived `muted`, then
passes through `borderToAA()` against `bg-surface` (its track) at WCAG 1.4.11's
3:1 **non-text** floor. It exists so "is the prose legible" and "is the thumb
visible" stop being one decision; declare it only if your theme wants a thumb
that is not a shade of its secondary text.

**Hover has to look like something.** `contrast-audit` also pairs every rule
whose selector carries `:hover` and sets a `color` with the same selector minus
`:hover`, and measures the two in ΔE2000 (perceptual distance — the WCAG ratio
is luminance-only and scores a green→pink hover the same as no change at all).
Below ΔE 6 with no other channel changing (background, opacity, underline…) the
pair is counted as debt and the ratchet may not grow. The usual cause is an
`overrides.css` line that pins a `:hover` color to a value the palette has since
moved onto: if you restate a hover color at all, restate it against the tier it
has to differ from.

The reverse applies to `palette.on-accent` and `palette.on-link-hover`: the
composer derives them *for* you, so never declare them, and never assume
`btn-fg` is what lands on an accent fill. **Two different tokens share the name
`on-accent`** — the site's `--pinboard-on-accent` (derived, do not declare) and
the popup's `--pp-on-accent` (a legitimate `ui.popup.<mode>` override, see
"Pilot `ui` overrides" below). Five pilots set the second one; none set the
first. See "Contrast derivation" in `README.md`.

### `typo`

`family`, `size-base`, `size-sm`, `size-lg`, `size-xs`, `line-height`,
`weight-body`, `weight-heading`.

### `space`

`unit`, `bookmark-gap`, `main-padding`. Others (`sub-banner-y`,
`right-bar-gap`, `form-gap`) fall back to `unit`.

### `radius`

`sm`, `md`, `lg`. `md` falls back to `sm` and `lg` to `md` if omitted.

### `border`

`width`, `style`, `hairline`. Defaults: `1px solid <palette.border>`.

---

## 3 · `patterns` block

Patterns are the personality layer — toggle stylistic decisions without
authoring overrides. Each is opt-in; omit a key to keep composer baseline.

| Pattern | Values | What it does |
|---------|--------|--------------|
| `tag-style` | `flat` \| `underline` | **Required.** Owns `a.tag` base/hover/selected. |
| `bookmark-title-prefix` | string (≤ 8 chars) | Pseudo-element prefix on titles, e.g. `"› "` |
| `heading-prefix` | string (≤ 8 chars) | Same, for `.settings_heading` |
| `url-link-style` | `pill` \| `underline` \| `plain` \| (default `capsule`) | Reshapes `a.url_link` |
| `private-badge` | `inset-bar` \| `dashed` \| `stripe` \| (default tint-bg) | How private bookmarks read |
| `focus-ring` | `glow` \| `dashed` \| `none` \| (default `thin-solid`) | Input focus chrome |
| `shape` | `sharp` \| `pill` \| (default `rounded`) | Overrides radius custom props |
| `density` | `compact` \| `roomy` \| (default) | Row gap + padding |
| `row-divider` | `hairline` \| `dashed` \| `left-accent` \| `none` | Bookmark row separator |
| `heading-accent` | `caps` \| `dashed-underline` \| (default `plain`) | `.settings_heading` chrome |
| `card-shadow` | `soft` \| `strong` | Drop shadow on rows (pair with `row-divider: "none"`) |
| `blockquote-style` | `left-accent` \| `left-muted` | `.description blockquote` left border |
| `banner-chrome` | `rounded` \| `card` | `#banner` shape |
| `title-weight` | `normal` \| `medium` \| `semibold` \| `bold` | `a.bookmark_title` font-weight |
| `tag-size` | `small` | Shrinks `a.tag` to `typo.size-xs` |
| `button-style` | `flat` \| `outlined` \| `rounded` \| `flat-rounded` \| `pill` | Submit/button chrome |
| `footer-tone` | `muted` \| `faint` | Mutes `#footer`, `.colophon`, `.rss_link` |
| `edit-form-surface` | `panel` \| `card` | Heavyweight form panels |
| `sort-order-style` | `tinted` \| `accent-bg` \| `surface` | `a.sort_order_selected` |
| `searchbox-style` | `boxed` \| `outlined-accent` \| `minimal` | Search input chrome |
| `tag-hover-style` | `underline` \| `accent-text` \| `underline-accent` | Delta on `a.tag:hover` |
| `tag-selected-style` | `accent` \| `accent-soft` \| `bold-accent` | Delta on `a.tag.selected` |
| `title-hover-style` | `no-underline` \| `accent-color` \| `muted` | Delta on `a.bookmark_title:hover` |
| `description-tone` | `muted` \| `faint` | `.description` tone |
| `input-radius` | `rounded` | Uniform radius across all form inputs (requires `ext.input-radius`) |

`tag-style` is required because it owns the full tag visual. Without it the
composer emits no `a.tag:hover` or `a.tag.selected` rules and cascade-lint
will flag the gap.

---

## 4 · `overrides.css` — the escape hatch

For per-theme rules the composer + patterns cannot express, append raw CSS
under `overrides.css`. Composer output → patterns layer → overrides, so
overrides win the cascade by source order at equal specificity.

**Cascade collision warning.** If you override a selector the composer already
emits with `:not(.tag)` (and similar exclusions), copy the exclusions verbatim
or `override-drift` will block your commit. Example:

```css
/* BAD — re-broadens the composer's scoped selector */
#right_bar a { color: #abc !important; }

/* GOOD — preserves the :not(.tag) scoping */
#right_bar a:not(.tag) { color: #abc !important; }
```

Selectors currently scoped this way in `classic-list-v2.mjs`:

- `#right_bar a:not(.tag)` + `:hover`
- `#tag_cloud a:not(.tag)` + `:hover`
- `#tag_cloud_header a:not(.tag)` + variants

The lint hint will tell you exactly which `:not(...)` to add.

`override-debt.mjs` separately ratchets the remaining escape hatch by parsed
`(at-rule context, selector, property, !important, theme)` identity. Removing
an override passes without touching the baseline; adding a new structural
identity fails even if another declaration was deleted and the total count is
unchanged. Do not refresh `tools/override-debt-baseline.json` merely to make a
new rule pass—promote repeated behavior to a token, pattern, or composer rule.

---

## 5 · `modes` (optional, for adaptive themes)

Only flexoki uses this. A mode declares a `trigger` (a selector prefix) and
a delta palette / typo / etc. Every composer rule is re-emitted with the
trigger prepended.

```jsonc
"modes": {
  "dark": {
    "trigger": "html.pbp-dark",
    "palette": { "bg": "#100F0F", "fg": "#CECDC3", ... }
  }
}
```

The runtime toggles `html.pbp-dark` based on the user's OS preference. If you
ship an adaptive theme, `cascade-lint` will detect it and run the 6 dark-mode
probes in addition to the 9 light probes.

---

## 6 · Extension popup + options + library themes (also regenerated)

Adding a pilot tokens file regenerates the pinboard.in site theme *and* the
extension's popup, options, and library UI. You do not need to touch
`popup.css`, `options.css`, or `library.css` manually — but as of the
2026-08 design-uplift campaign, each of those three files carries **two**
generated regions, not one, and they answer different questions:

| Region | What it is | Varies per theme? |
|--------|------------|--------------------|
| `@generated:ui-themes` | Colors: `--pp-*` / `--opt-*` / `--lib-*` custom properties | Yes — this is the one your new pilot's palette actually populates |
| `@generated:ui-components` | Structure: button/chip/danger/form-field geometry (`.btn`, `.vocab-group-chip`, `.confirm-yes`, `.fg input`, …) | No — one recipe per surface, shared by every theme (adding a theme never touches this region) |

You only interact with the first one. The second is single-sourced from
`composers/ui-components.mjs` per COMPONENTS.md's specs and never varies
with a pilot's tokens — mentioned here only so a `git diff` after `sync-all`
that touches the *whole* file doesn't surprise you into thinking your new
theme somehow changed button geometry (it didn't; `apply-ui-themes.mjs`
rewrites both regions of a file in the same pass, so both are always
present in the diff even when only one actually changed content).

**How the color region works.** `composers/popup-chrome.mjs`,
`composers/options-chrome.mjs` and `composers/library-chrome.mjs` read the
same pilot palette (via `composers/_ui-derive.mjs`) and write `--pp-*` /
`--opt-*` / `--lib-*` custom properties into the `@generated:ui-themes`
region inside `popup.css`, `options.css` and `library.css`. `sync-all` runs
this step automatically.

To regenerate both extension UI regions on their own:

```bash
node docs/theme-surface/tools/apply-ui-themes.mjs --write
```

**Pilot `ui` overrides.** When the derived colors miss a theme's intent
(the derivation is heuristic), override any emitted role per surface and
mode in the tokens file — values win over `_ui-derive.mjs`:

```jsonc
"ui": {
  "popup":   { "light": { "on-accent": "#001014", "radius-tag": "4px" },
               "dark":  { "focus-ring": "0 0 0 2px #268bd280" } },
  "options": { "light": { "danger": "#c5221f" } },
  "library": { "dark":  { "row-selected-bg": "#1c2733" } }
}
```

Emittable popup keys include every `--pp-*` role plus `radius-sm/md/lg/tag`,
`focus-bd`, `focus-ring`, and `on-accent`; the options composer accepts any
`--opt-*` role and the library composer any `--lib-*` role. `ui.library` is
no longer purely theoretical — `terminal` is the first (and, as of this
campaign, only) pilot to carry one, for the border-restore mechanism below.
Four rules, two carried over and regression-tested, two new this campaign:

- **`on-accent` (submit-button text) is ALWAYS emitted explicitly** — never
  rely on a `var()` fallback in shared rules (custom properties inherit, so
  the fallback is dead code; this exact mistake once turned every themed
  submit button white). `contrast-audit.mjs` gates `on-accent` vs `accent`
  at AA 4.5, so a failing pair aborts sync-all.
- **Spacing cannot be themed.** `--pp-sp-*` / `--opt-sp-*` / `--lib-sp-*` are
  hand-maintained, theme-invariant tokens outside the factory; `ui`
  overrides that try to redefine them have no supported effect. The
  `@generated:ui-components` region's geometry recipe *consumes* these same
  tokens through a spacing adapter (below) — it does not let a theme make
  them vary either.
- **Derived component-pair colors are not `ui` inputs.** The shared
  `btn-fg`, `danger-quiet-fg`, `on-danger`, `chip-bg`, `chip-fg` roles and
  popup-only `preset-fg` / `spinner-fg` are computed from the FINAL,
  post-override map. `validate-contracts.mjs` rejects these names at their
  exact JSON pointer instead of silently discarding them. Change supported
  inputs (`btn-bg`, `danger`, `tag-bg`, `tag-fg`, `preset-bg`, `spinner-bg`)
  and trust the finalizer; a new output escape hatch requires an explicit
  derivation-contract change plus tests.
- **A pilot can restore a real border by declaring its own `-bd`/`-border`
  role — the terminal exemption.** Every theme's controls default to the
  Soft Fill language (COMPONENTS.md §9): no resting border, identity
  carried by the fill alone. If your theme's identity depends on a visible
  frame the way terminal's phosphor-glow border does, declare the relevant
  role(s) yourself and the composer treats that declaration itself as the
  opt-out signal, skipping the fill-separation step for that role and
  keeping your value verbatim:

  ```jsonc
  "ui": {
    "popup":   { "dark": { "btn-bd": "var(--pp-border)", "input-bd": "var(--pp-border)" } },
    "options": { "dark": { "btn-border": "var(--opt-border)", "input-border": "#33ff3340" } },
    "library": { "dark": { "btn-border": "var(--lib-border)", "input-border": "#33ff3340" } }
  }
  ```

  (This is `terminal.tokens.json`'s actual `ui` block, lightly trimmed —
  it also declares `focus-bd`/`focus-ring` for the glow effect, unrelated
  to this mechanism.) Note the naming split: popup uses the `-bd` suffix
  (`btn-bd`/`input-bd`), options/library use `-border`
  (`btn-border`/`input-border`) — copy the exact key your surface expects.
  **Geometry (radius, padding) is never exemptable this way** — it follows
  the surface's token ladder unconditionally for every theme, terminal
  included; only the fill-vs-frame *color* language has an opt-out.

Gates guard both regions, colors and structure alike:

| Gate | What it checks |
|------|----------------|
| `validate-contracts.mjs` | Executes `tokens.schema.json`, rejects derived UI outputs used as inputs, checks filename ↔ `meta.id`, registered modes/composers, and manifest page/template/surface cross-references |
| `override-debt.mjs` | Ratchets remaining `overrides.css` by parsed `(at-rule context, selector, property, !important, theme)` identity; removals pass, new structural debt fails even when total counts stay flat |
| `contrast-audit.mjs` | WCAG AA (text) / 3:1 (icons, borders) for every popup/options/library status/text pair AND the component-pair table (`btn-fg`×`btn-bg`, `chip-fg`×`chip-bg`, `danger-quiet-fg`×`bg`/`panel`, `on-danger`×`danger`, `border`×`btn-bg`/`panel`, …) — see `README.md`'s "Contrast guard" section for the full pair list |
| `css-region-audit.mjs` | Neither `@generated:ui-themes` NOR `@generated:ui-components` has been hand-edited — one generic check over all six regions, no new region needs new audit code |
| `ui-token-coverage.mjs` | Every consumed `--pp-*` / `--opt-*` / `--lib-*` token (including ones only consumed inside `@generated:ui-components`) resolves to a definition per theme |
| `recipe-lint.mjs` | Static checks on `ui-components.mjs` itself — paired-color law, chip geometry, the spacing-adapter mapping matches each surface's real `:root` values, no bare `--sp-*` reference, no fallback `var()`, press-is-instant, ≤200ms motion budget, roundness laws. Only relevant if you're editing the recipe itself, not authoring a tokens-only theme |
| `scripts/ui-render-audit.mjs` (repo root) | The completeness authority — an independent, **hand-written** playwright oracle (`tests/render-audit-checklist.mjs`) that reads real `getComputedStyle`, never generated from the recipe. A brand-new theme rarely needs to touch this; it exists to catch a component the recipe forgot to register, which a same-source check couldn't |

All generated-artifact, contrast and layout gates run inside `sync-all`;
the shared complex-CSS parser test and complementary source/cascade/hand-edit
checks run from pre-commit and `verify.sh`. The render oracle runs
inside `scripts/verify.sh`'s separate `[render-audit]` section (playwright +
an unpacked-extension launch is too slow for the tight `sync-all` inner
loop). The git pre-commit hook runs `sync-all --check` plus the complementary
gates, so contrast and UI token coverage are no longer deferred. The hook
installed by `scripts/setup-hooks.sh` delegates to the tracked script and
therefore follows future gate updates without reinstallation. **Do not
hand-edit either generated region** in
`popup.css`, `options.css`, or `library.css` — both will be overwritten on
the next `sync-all`. Component design authority for the structure region:
`docs/theme-surface/COMPONENTS.md`.

---

## 7 · Verification loop

Run the orchestrator, then the full repository verifier. Each must exit 0.

```bash
node docs/theme-surface/tools/sync-all.mjs           # regenerate + drift-guard
node docs/theme-surface/tools/sync-all.mjs --check   # same pipeline, strict read-only proof
bash scripts/verify.sh                               # contract/tool tests + all CI gates
```

`sync-all` is the orchestrator — 12 steps: `validate-contracts`, `render-all`,
`apply-ui-themes --write` (both UI regions), dynamically discovered
`apply-tokens`, `diff-all --strict`,
`contrast-audit`, `css-region-audit`, `ui-token-coverage`, `layout-lint`,
`url-lint`, `recipe-lint`, `override-debt`. In `--check` mode, render/apply/diff steps suppress
all writes and compare generated output byte-for-byte; the integration test
also snapshots file mtimes to enforce that contract. See §6 for these gates
and the separate render oracle, `scripts/ui-render-audit.mjs`.

The pre-commit hook runs the read-only 12-step pipeline and complementary gates automatically when any
`composers/`, `pilots/*.tokens.json`, `tools/*.mjs`, generated theme artifact,
or three-surface CSS file is staged. It does not run the browser render oracle.
A tokens-only theme addition still needs a manual write-mode `sync-all` and full
`verify.sh` pass before committing. Do not
bypass any of this with `--no-verify` — if a check fires it's a real bug.

---

## 8 · Common pitfalls

1. **Forgetting `patterns.tag-style`.** The composer emits only the base
   `a.tag` rule; tag-style owns `:hover` and `.selected`. Without it, hovering
   a tag does nothing and selected tags look identical to unselected. Both
   `flat` and `underline` are valid starting points.

2. **Bare `#right_bar a` override.** Composer emits `#right_bar a:not(.tag)`
   so the tag-style pattern can win on tag elements. A bare override
   re-hijacks tags. `override-drift` will catch this and print the exact
   selector to use instead.

3. **Inconsistent token definitions across themes.** If you copy a palette
   slot from another theme, make sure the value makes semantic sense in
   yours. catppuccin-mocha's selected color used to be `#cba6f7` (mauve);
   it now derives from `destroy` via `tag-selected-style`. Prefer
   patterns/tokens over hard-coded overrides whenever possible.

4. **Adaptive dark cascade is separate.** When you add a `modes.dark`
   block, the composer is re-run with the merged palette and every selector
   gets the trigger prefix. A dark-mode regression won't show up in the
   default probes — `cascade-lint` covers this automatically, but you must
   verify by running it after every dark-palette edit.

5. **Missing token definitions.** `v("some-token")` in a composer resolves
   to `var(--pinboard-some-token)`. If your theme doesn't define
   `some-token` (and there's no fallback in `_util.mjs#expandPalette`),
   browsers silently fall back to CSS initial — invisible to drift-guard.
   `token-coverage` catches this.

---

## 9 · Visual smoke test

1. Reload the extension at `chrome://extensions/` (toggle off/on or click the
   refresh icon on the unpacked extension card).
2. Open Pinboard and switch your theme in the extension options.
3. Compare against `docs/theme-surface/snapshots/` and `.qa-scan/` for the
   reference state of the 14 pages × hover/focus/selection.

The four pages most worth checking by eye:
- `home` — bookmark list, tag cloud, pagination
- `add` (popup) — form inputs, submit buttons
- `settings` — heavyweight forms, `.settings_heading`
- `tweets` — right_bar-heavy layout, sort tables

### Automated cross-theme screenshot (`screenshot-themes.mjs`)

For a quick per-theme regression sweep — especially useful after touching
a `_patterns.mjs` rule that affects multiple themes — drive your live Chrome
via CDP and screenshot every theme on the same page in one go.

**Prereqs** (one-time):

```bash
# 1. Install playwright into the qa-scan workspace
cd .qa-scan && npm install && cd -

# 2. Launch Chrome with remote debugging on port 9222
#    (close all existing Chrome windows first; Chrome only opens the debug
#     port for a fresh launch)
google-chrome --remote-debugging-port=9222 \
              --user-data-dir="$HOME/.chrome-debug-profile" &

# 3. In that Chrome: install the unpacked extension, log into Pinboard,
#    leave a tag-detail tab open (e.g. https://pinboard.in/u:you/t:some-tag/).
#    Tag-detail pages exercise tag cloud + bookmark rows + "by" meta lines.
```

**Run** (every time you want a sweep):

```bash
# Default: all 13 themes, viewport-only, screenshots to .qa-scan/visual-qa-YYYY-MM-DD/
node docs/theme-surface/tools/screenshot-themes.mjs

# Subset of themes
node docs/theme-surface/tools/screenshot-themes.mjs --only flexoki,paper-ink

# Custom output dir or port
node docs/theme-surface/tools/screenshot-themes.mjs --port 9222 --out /tmp/qa
```

The driver:
- Auto-discovers themes from `pilots/*.tokens.json`
- Reads each theme's `pilots/<slug>.generated.css` (errors if missing — run
  `sync-all` first)
- Saves your current `<style id="pbp-injected">` content on entry and
  **restores it on exit**, so your extension's actual theme state is
  preserved when the run finishes
- Logs each theme's extracted `--pinboard-accent` value as a sanity check
- Exits non-zero if any theme failed to inject or screenshot

Review the resulting `.qa-scan/visual-qa-YYYY-MM-DD/*.png` for: tag cloud
readability, selected-tag distinguishability, hover affordance, the `by`
meta line not being stark white, `⊕/⊖` button sizing, star alignment with
title's first line. The 8-round QA chain on the tag-style refactor surfaced
all of these as classes of bugs that lints can't catch but eye-balling
catches immediately.

This is **complementary** to `visual-qa.mjs` (the static HTML harness
generator): screenshot-themes runs against your real Pinboard session DOM;
visual-qa.mjs builds standalone HTML files from saved snapshots that you
open in any browser. Use whichever fits the situation.

---

## 10 · Submitting

This is a single-author project, so "submitting" means landing a commit on
`main`. One tokens file plus the regenerated artifacts, and a sensible message:

```bash
git add docs/theme-surface/pilots/<slug>.tokens.json \
        pinboard-themes.js \
        popup.css \
        options.css \
        library.css
git commit -m "feat(theme): add <slug> theme"
```

`sync-all` regenerates `pinboard-themes.js` and the `@generated:ui-themes`
regions in `popup.css`, `options.css` and `library.css` in place, so stage all
five files.

---

## Don't hand-edit generated files

**`pinboard-themes.js`** is the runtime artifact for pinboard.in site themes.
It is fully regenerated on every `sync-all` invocation from composer output +
per-theme tokens. Any rule you add directly will be silently overwritten the
next time sync-all runs.

**`popup.css` / `options.css` / `library.css` each carry TWO generated
regions**, both factory output, both written by `apply-ui-themes.mjs`, each
with its own independent sentinel pair (never share one — see §6):

```
/* @generated:ui-themes start — do not edit; produced by composers/<surface>-chrome.mjs */
...
/* @generated:ui-themes end */

/* @generated:ui-components start (<surface>) */
...
/* @generated:ui-components end (<surface>) */
```

Do not hand-edit inside either pair; `css-region-audit.mjs` iterates both
kinds generically and blocks the commit on any drift.

If you need a rule that doesn't fit the composer:

- **Pinboard site theme, all 13 themes** → add it to `composers/classic-list-v2.mjs`
  (or `_patterns.mjs` if it should be opt-in per theme).
- **Pinboard site theme, one theme only** → add it to that theme's
  `pilots/<slug>.tokens.json` `overrides.css` string.
- **Extension UI chrome colors, one theme** → that theme's pilot `ui`
  block (§6) — this is almost always the right layer, not a composer edit.
- **Extension UI chrome colors, all themes** → edit
  `composers/popup-chrome.mjs`, `composers/options-chrome.mjs` or
  `composers/library-chrome.mjs` (or `composers/_ui-derive.mjs` for shared
  derivation logic), then re-run `sync-all`.
- **Extension UI component structure (geometry, not color), any/all
  surfaces** → edit `composers/ui-components.mjs` against
  `docs/theme-surface/COMPONENTS.md`'s spec, then re-run `sync-all`. Never
  hand-write a `.btn`/chip/form rule directly into `popup.css` /
  `options.css` / `library.css` outside the `@generated:ui-components`
  region — `recipe-lint.mjs` and the render oracle both assume the recipe
  is the single source.

The `handedit-audit` pre-commit hook detects any rule in
`pinboard-themes.js` not derivable from the composer pipeline and
blocks the commit. If you see it fire, follow its diagnostic hint
to migrate the rule to the proper layer.
