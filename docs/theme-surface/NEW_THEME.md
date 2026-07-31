# Adding a New Theme

Step-by-step for adding a 14th+ theme to the factory. Distilled from the lessons
of the tag-style cascade refactor — read this before you start so you don't
spend rounds 2 through 6 of a 1-round task.

---

## TL;DR

```bash
# 1. copy a template tokens file
cp docs/theme-surface/pilots/github-light.tokens.json \
   docs/theme-surface/pilots/<your-slug>.tokens.json

# 2. edit the palette / typo / patterns to taste

# 3. regenerate pinboard-themes.js AND popup.css/options.css @generated regions
node docs/theme-surface/tools/sync-all.mjs

# 4. ensure all gates pass (sync-all already ran them; re-run to double-check)
node docs/theme-surface/tools/diff-all.mjs --strict
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
| `slug` | Must match the filename stem |
| `name` | Display name in the options dropdown |
| `description` | One-line tagline |
| `author` | Your handle |

### `layout`

| Key | Purpose |
|-----|---------|
| `mode` | Must be `"classic-list-v2"` (the only supported composer for shipped themes) |
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
| `sort-table-style` | `enabled` | Order-rank input + row-hover treatment |
| `tag-hover-style` | `underline` \| `accent-text` \| `underline-accent` | Delta on `a.tag:hover` |
| `tag-selected-style` | `accent` \| `accent-soft` \| `bold-accent` | Delta on `a.tag.selected` |
| `title-hover-style` | `no-underline` \| `accent-color` \| `muted` | Delta on `a.bookmark_title:hover` |
| `description-tone` | `muted` \| `faint` | `.description` tone |
| `searchbox-width` | `full` | `#search_query_field { width: 100% }` |
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

## 6 · Extension popup + options themes (also regenerated)

Adding a pilot tokens file regenerates **both** the pinboard.in site theme
*and* the extension popup/options named-theme blocks. You do not need to
touch `popup.css` or `options.css` manually.

**How it works.** `composers/popup-chrome.mjs` and `composers/options-chrome.mjs`
read the same pilot palette (via `composers/_ui-derive.mjs`) and write
`--pp-*` / `--opt-*` custom properties into `@generated:ui-themes` regions
inside `popup.css` and `options.css`. `sync-all` runs this step automatically.

To regenerate popup + options themes on their own:

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
  "options": { "light": { "danger": "#c5221f" } }
}
```

Emittable popup keys include every `--pp-*` role plus `radius-sm/md/lg/tag`,
`focus-bd`, `focus-ring`, and `on-accent`; the options composer accepts any
`--opt-*` role. Two rules, both regression-tested:

- **`on-accent` (submit-button text) is ALWAYS emitted explicitly** — never
  rely on a `var()` fallback in shared rules (custom properties inherit, so
  the fallback is dead code; this exact mistake once turned every themed
  submit button white). `contrast-audit.mjs` gates `on-accent` vs `accent`
  at AA 4.5, so a failing pair aborts sync-all.
- **Spacing cannot be themed.** `--pp-sp-*` / `--opt-sp-*` are hand-
  maintained, theme-invariant tokens outside the factory; `ui` overrides
  that try to redefine them have no supported effect.

Three gates guard the generated output:

| Gate | What it checks |
|------|----------------|
| `contrast-audit.mjs` | WCAG AA for every popup/options status + text pair |
| `css-region-audit.mjs` | `@generated:ui-themes` regions have not been hand-edited |
| `ui-token-coverage.mjs` | Every consumed `--pp-*` / `--opt-*` token is defined |

All three run inside `sync-all` and inside the pre-commit hook. **Do not
hand-edit the `@generated:ui-themes` regions** in `popup.css` or
`options.css` — they will be overwritten on the next `sync-all`.

---

## 7 · Verification loop

Run all four in this order. Each must exit 0.

```bash
node docs/theme-surface/tools/sync-all.mjs           # regenerate + drift-guard
node docs/theme-surface/tools/cascade-lint.mjs       # cascade conflicts
node docs/theme-surface/tools/override-drift.mjs     # bare overrides on scoped composers
node docs/theme-surface/tools/token-coverage.mjs     # missing token definitions
```

`sync-all` is the orchestrator — it runs `render-all`, `apply-tokens` × N,
`diff-all --strict`, `contrast-audit`, `layout-lint`, and `url-lint`, plus
the three UI gates from §6 above. The other three are independent checks the
pre-commit hook also runs.

The pre-commit hook runs all four automatically when any `composers/`,
`pilots/*.tokens.json`, or `tools/*.mjs` file is staged. Do not bypass with
`--no-verify` — if a check fires it's a real bug.

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
   reference state of the 13 pages × hover/focus/selection.

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
`main`. Two-file diff plus a sensible message:

```bash
git add docs/theme-surface/pilots/<slug>.tokens.json \
        pinboard-themes.js \
        popup.css \
        options.css
git commit -m "feat(theme): add <slug> theme"
```

`sync-all` regenerates `pinboard-themes.js` and the `@generated:ui-themes`
regions in `popup.css` and `options.css` in place, so stage all four files.

---

## Don't hand-edit generated files

**`pinboard-themes.js`** is the runtime artifact for pinboard.in site themes.
It is fully regenerated on every `sync-all` invocation from composer output +
per-theme tokens. Any rule you add directly will be silently overwritten the
next time sync-all runs.

**`popup.css` / `options.css` `@generated:ui-themes` regions** are likewise
factory output — written by `apply-ui-themes.mjs` from the pilot palettes.
Do not edit between the `/* @generated:ui-themes */` and
`/* @end:ui-themes */` markers; `css-region-audit` will catch the drift and
block the commit.

If you need a rule that doesn't fit the composer:

- **Pinboard site theme, all 13 themes** → add it to `composers/classic-list-v2.mjs`
  (or `_patterns.mjs` if it should be opt-in per theme).
- **Pinboard site theme, one theme only** → add it to that theme's
  `pilots/<slug>.tokens.json` `overrides.css` string.
- **Popup/options UI chrome** → edit `composers/popup-chrome.mjs` or
  `composers/options-chrome.mjs` (or `composers/_ui-derive.mjs` for shared
  derivation logic), then re-run `sync-all`.

The `handedit-audit` pre-commit hook detects any rule in
`pinboard-themes.js` not derivable from the composer pipeline and
blocks the commit. If you see it fire, follow its diagnostic hint
to migrate the rule to the proper layer.
