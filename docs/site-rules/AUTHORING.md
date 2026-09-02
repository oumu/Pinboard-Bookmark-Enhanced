# Authoring site-extraction rules

How to add or maintain a per-site Markdown-extraction rule in `site-rules.js`. Rules run in the active tab's **isolated world** before Defuddle; a match returns `{contentHtml, title}`, otherwise (or on empty/throw) extraction falls back to Defuddle generic. Keep rules in the one `site-rules.js` file (project convention).

## Recipe (per site)

1. **Inspect** — open the target page (logged in, fully scrolled if it lazy-loads), open DevTools Console, paste `docs/site-rules/inspect.js`. Read the summary: the content container selector, any embedded-JSON blob, lazy-image attrs, and fold/login markers.
2. **Choose a source** for the selectors (see *Source-selection priority* below). Prefer an active, license-clean source; cross-check across ≥2 where possible.
3. **Add the rule — but first decide if one is warranted.** Single-article pages (blogs, news, one article) are handled well by Defuddle generic, so do NOT write a rule for them: a custom rule adds maintenance + regression risk for no gain (verified 2026-06 — WeChat/CSDN/掘金/dev.to showed no improvement over Defuddle and 掘金 regressed by leaking `<style>`). Write a rule ONLY for **multi-item pages Defuddle structurally can't do**: Q&A (question + answers), forums (topic + replies), or structured-metadata cards (arXiv). Add a bespoke `extract(doc,url)` fn to `SITE_RULES` (see `extractZhihuQuestion`/`extractStackOverflow`/`extractV2ex`/`extractArxiv`); fill the metadata (schema below); set `lastVerified` to the date YOU confirmed it live.
4. **Add a fixture** to `md-convert-tests.html` (copy a sibling rule's block): a `DOMParser` fixture + `check(...)` assertions for id/title/body/strip. Put noise nodes INSIDE the content container so the strip logic is actually exercised. Escape any literal `</script>` inside fixture strings as `<\/script>`.
5. **Verify** — `cd .qa-scan && node run-md-tests.mjs` (offline, must be FAIL 0) and, if the site is public, add the rule's `sampleUrl` to `.qa-scan/site-rules-drift.mjs` and run `node site-rules-drift.mjs` (live).
6. **Commit** with provenance, e.g. `feat(extract): site rule for <site>`.

## Source-selection priority (answers "is this selector still good?")

1. **Active + license-clean** sources you may COPY into this MIT package:
   - `ftr-site-config` (CC0) — covers weixin/juejin/zhihu/StackOverflow/dev.to/arxiv/gist/pastebin; XPath rules (browsers have native `document.evaluate`).
   - `jocmp/mercury-parser` (MIT) — CSS-selector extractor objects; good schema model.
   - `@sitdown/{wechat,zhihu,juejin}` (MIT) — CN-specific Turndown rules (stale 2024 → verify).
   - Obsidian Web Clipper templates (MIT) — Western per-site selectors.
2. **Selectors-as-facts only** (reimplement; do NOT copy code — viral/proprietary license): `code-box` (GPL, but the most current CN selector set), SimpRead (GPL/unlicensed), Omnivore (AGPL), `csdn2md` (PolyForm).
3. **A stale upstream is not a red flag.** A rule unchanged for a year usually means the *site* hasn't changed (e.g. WeChat `#js_content` is years-stable). What guarantees correctness is OUR verification (gates below) and cross-source convergence, not the upstream commit date. `lastVerified` is OUR date.

## Four verification gates

1. **Import-time** — never ship a selector you haven't confirmed against the live site (step 1/5). Set `lastVerified`.
2. **Offline fixture regression** — `md-convert-tests.html` proves the runner logic and guards against future code changes.
3. **Live drift canary** — `.qa-scan/site-rules-drift.mjs` loads each public `sampleUrl` and asserts non-empty extraction. Run on demand. It flags anti-bot/challenge pages separately from real drift.
4. **Graceful fallback** — empty/throw → Defuddle. Drift is a quality regression to generic, never an outage. Preserve this (every `extract` must return `null`, not throw, on no-content).

## Drift coverage

| Rule | driftCheck | how it's verified |
|------|-----------|-------------------|
| arxiv | auto | canary (validated live: ~1.3k chars) |
| stackoverflow / stackexchange | auto | canary on YOUR machine (CI IP hits Cloudflare challenge) |
| v2ex | auto | canary on YOUR machine (reply author = `a[href^="/member/"]`) |
| zhihu-* | manual | login-walled → periodic human check + cross-source |

Note: the CI/WSL environment can't load most CN or Cloudflare-fronted sites (anti-bot). The canary reports those as "verify on your own machine", not as drift. Real-DOM verification for those rules is the maintainer's gate-1 step in a logged-in browser.

## Rule schema

```js
{
  id: "v2ex",                    // unique id
  source: "self",                // where selectors came from (for re-check) | "ftr@<sha>" | "code-box@<date>"
  lastVerified: "2026-06-07",    // date WE confirmed against the live site (NOT an upstream date)
  driftCheck: "auto",            // "auto" (public, canary-checkable) | "manual" (login/anti-bot)
  sampleUrl: "https://...",      // a stable public URL for the canary ("" if manual)
  match: { host: "v2ex.com", url: /\/t\/\d+/, test: (doc,url)=>... },  // host (cheap) → url regex → optional DOM probe
  extract: function (doc, url) { /* assemble multi-item HTML using shared helpers; return { contentHtml, title } | null */ }
}
```

Shared helpers available to `extract`: `cleanBodyHtml(html)` (HTML string → inert-document div (see inertDoc) → fix lazy images → innerHTML), `escapeHtml`, `pickText(doc,[sel|['sel','attr']...])`, `fixLazyImages` (promotes data-src/data-original/data-actualsrc), `readJsonLd(doc,type)` (JSON-LD node by @type), `readEntities(doc)` (Zhihu js-initialData), plus the Zhihu vote helpers `answerSection`/`parseCount`/`domVoteup`. Reuse helpers; avoid new per-site code where a helper fits. (Note: single-article container helpers were intentionally removed — single-article extraction is Defuddle's job.)

## Constraints

- One file (`site-rules.js`); no over-split (project convention).
- No literal emoji/dingbats (incl. `✓`/`❤`) anywhere — use words (`[accepted]`, `N votes`, `感谢 N`). They render in the preview and can trigger the font-fallback stall.
- Read-only on the live DOM; mutate only nodes of the inert document (`cleanBodyHtml` already does) — detaching is NOT enough: a div created from the live document still fetches every `<img>` it holds.
- The long tail we don't rule-ify falls back to Defuddle; for perfect-fidelity bulk export, recommend users the dedicated tools (csdn2md, wechat-article-exporter, 简悦 SimpRead) rather than building.
