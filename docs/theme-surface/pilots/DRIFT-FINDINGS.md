# Decl-Level Drift Findings — Sprint 3 codegen pipeline

**Status:** The `composeTheme()` pipeline produces **100% selector coverage** against every shipped theme, but **only 17.7% byte-level parity** at the declaration level. Swapping shipped CSS with composer output as-is would cause visual regressions across all 13 themes.

## Matrix (from `tools/diff-all.mjs`)

```
theme              perfect   cosmetic  REAL    miss-decls  extra-decls
github-light       32/173    115       26      33          32
solarized-light    32/174    98        44      65          60
solarized-dark     32/174    91        51      83          70
catppuccin-latte   32/174    87        55      77          62
gruvbox-dark       32/175    86        57      95          64
nord-night         32/174    79        63      83          89
catppuccin-mocha   32/174    78        64      85          59
rose-pine          30/174    80        64      108         73
dracula            32/173    57        84      132         122
terminal           34/177    49        94      141         123
modern-card        34/170    37        99      191         127
paper-ink          30/165    21        114     177         143
flexoki            36/301    105       160     166         245
---------------------------------------------------------------------
TOTAL              420/2378  983       975     1436        1269
```

**Read:** Of the 2378 shipped selectors across all 13 themes, only 420 are byte-perfect (or var-equivalent). 983 have cosmetic drift (same resolved value, `var()` vs literal — safe to swap). 975 have **real** drift (genuinely missing/different declarations — NOT safe to swap).

## What's in the real drift

Three recurring patterns:

1. **Per-theme layout tunings** the composer doesn't know about:
   - `#banner { border-radius: 6px !important; padding: 8px 16px !important }` on flexoki — not in `space` tokens
   - `.bookmark { border-bottom: 1px solid ...; padding: 12px 8px !important }` — inline per-theme layout
   - `#profile_left_column { margin-right: 20px }`, `#profile_right_column { width: 430px }` — profile grid tunings

2. **Semantic color intent mismatch** — composer maps by palette role, shipped uses theme-specific hues:
   - Flexoki shipped `#sub_banner a { color: #5e409d }` (purple) → composer emits `var(--pinboard-muted)` (gray)
   - Flexoki shipped `.selected_star { color: #ad8301 }` (warmer amber) vs token `private-accent: #D0A215` (different hex)

3. **Composer emits extras** — defensible additions shipped doesn't have:
   - `font-family`, `box-sizing: border-box`, `outline: none` on `:focus`
   - 1269 extra decls total — most harmless, but some (e.g. `background: transparent` on `.bookmark`) change visual

## Pipeline bug caught + fixed

`compose-theme.mjs` was leaving the dark-mode `:root` unprefixed, which meant the dark palette's `:root {}` block unconditionally overrode the base `:root {}` — flexoki would render dark always. Fixed by rewriting mode-scoped `:root` to the trigger selector (e.g. `html.pbp-dark { --pinboard-bg: #1C1B1A }`). This makes mode-scoped CSS custom properties cascade only when the trigger class is present.

## Strategic pivot

The composer kit is **not** a drop-in replacement for shipped CSS. Recommend scoping it as:

- **New theme scaffolding**: author `foo.tokens.json`, run `render-all.mjs`, paste generated CSS into `pinboard-themes.js` as the starting point — then hand-tune drift.
- **Regression guard for existing themes**: `diff-all.mjs` becomes a CI check — if someone edits a token file, the drift matrix should not grow.
- **NOT** an automatic codegen pipeline that regenerates shipped CSS on every build.

To close the drift to near-zero across all 13 themes, either:
- (A) Enrich the token surface with per-theme layout tunings (`layout.banner-padding`, `layout.bookmark-padding`, `layout.profile-grid-width`, etc.) — blows up token complexity
- (B) Use `tokens.overrides.css` as the escape hatch for all per-theme nuance — simpler, keeps tokens declarative
- (C) Opinionated rewrite of the 13 shipped themes to the composer's opinionated output — visual regression by design, requires user buy-in

Recommendation: **(B)** when the user wants any theme to hit 0-drift; **ship as-is** for any new theme where convergence-by-default is acceptable.

---

## Update — flexoki closed to 0 missing decls (2026-04-14)

Proved the overrides.css path by running `tools/generate-overrides.mjs flexoki` — it emits a CSS patch containing the exact shipped declarations for every real-drift selector (skipping decls already covered by composer output or its var() resolution). Patch was injected into `flexoki.tokens.json` → `overrides.css`.

### Before (composer only)
```
flexoki             36/301    107       160 DRIFT  166 missing  245 extra
```

### After (composer + overrides)
```
flexoki             36/301    107       0           245         OK
```

**166 missing decls → 0.** Composer + overrides now emits every declaration flexoki shipped explicitly. The 245 remaining "extras" are composer-side additions shipped didn't have:
- 134 are **neutralized** at runtime (same property re-declared by overrides with shipped value, overrides wins cascade order)
- 111 are **true composer additions** — defensive baseline hardening (explicit `border` on dark-mode inputs, `outline: none` on `:focus`, explicit `font-size: 13px` where shipped inherited). None look like regressions; most are improvements.

### Drift-guard in place

`tools/diff-all.mjs --strict` exits non-zero when any theme has `miss-decls > 0`. Wire it into the commit flow to prevent token edits from silently regressing to drift. Current matrix:

- **1 theme at OK** (flexoki, 0 missing)
- **1 theme at WARN** (github-light, 33 missing)
- **11 themes at FAIL** (65–191 missing each)

To close the remaining 12 themes: run `generate-overrides.mjs <slug>` on each, inspect the patch, merge into `<slug>.tokens.json` → `overrides.css`. Repeatable mechanical process — the same pattern that closed flexoki.
