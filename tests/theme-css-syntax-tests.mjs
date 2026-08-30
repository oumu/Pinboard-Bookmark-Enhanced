import { prefixSelectors } from "../docs/theme-surface/composers/compose-theme.mjs";

const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); };
const equal = (actual, expected, message) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures.push(`${message}\n  expected ${JSON.stringify(expected)}\n  actual   ${JSON.stringify(actual)}`);
  }
};

const css = `/* braces in comments must not become rules: { } */
:root { --label: "base;{value}"; }
:where(.card, .tile), [data-label="x,y"] {
  content: "a;{b}";
  background-image: url("data:image/svg+xml;utf8,<svg>{x;y}</svg>");
  --payload: { alpha: beta; gamma: delta; };
}
@media (min-width: 40rem) {
  .inside:is(.x, .y), .other { color: rgb(1, 2, 3); }
}
@supports selector(:has(> .child, + .peer)) {
  .supported:where(.a, .b) { display: grid; }
}
@font-face { font-family: "Theme, UI"; src: url("theme;ui.woff2"); }
@keyframes pulse { from { opacity: 0; } to { opacity: 1; } }
`;

let syntax;
try {
  syntax = await import("../docs/theme-surface/tools/css-syntax.mjs");
} catch (error) {
  failures.push(`shared CSS syntax module must load: ${error.message}`);
}

if (syntax) {
  equal(
    syntax.splitSelectorList(':where(.card, .tile), [data-label="x,y"], .plain'),
    [':where(.card, .tile)', '[data-label="x,y"]', '.plain'],
    "selector lists split only on top-level commas",
  );
  equal(
    syntax.splitSelectorList(".joined/**/.class, .descendant /* keep gap */ .child"),
    [".joined.class", ".descendant .child"],
    "comments are removed without inventing selector whitespace",
  );

  const rules = syntax.parseStyleRules(css);
  equal(
    rules.flatMap((rule) => rule.selectors),
    [
      ":root",
      ":where(.card, .tile)",
      '[data-label="x,y"]',
      ".inside:is(.x, .y)",
      ".other",
      ".supported:where(.a, .b)",
    ],
    "style-rule parsing recurses through grouping at-rules but skips descriptor/keyframe bodies",
  );

  const complexRule = rules.find((rule) => rule.selectorText.startsWith(":where"));
  equal(
    syntax.parseDeclarations(complexRule?.body || "").map((decl) => decl.raw),
    [
      'content: "a;{b}"',
      'background-image: url("data:image/svg+xml;utf8,<svg>{x;y}</svg>")',
      "--payload: { alpha: beta; gamma: delta; }",
    ],
    "declarations preserve semicolons and braces inside component values",
  );
  equal(
    syntax.parseDeclarations("--Brand-Color: #abc; COLOR: red;").map(({ property }) => property),
    ["--Brand-Color", "color"],
    "custom property names remain case-sensitive while ordinary properties normalize",
  );

  equal(
    [...syntax.declarationValueMap(`
:root { --Brand-Color: #abc; color: red; }
:root { color: blue; }
@media print { :root { color: black; } }
`, ":root")],
    [["--Brand-Color", "#abc"], ["color", "blue"]],
    "selector value maps apply source order without leaking declarations from another at-rule context",
  );

  const contextual = syntax.declarationMap(`
.same { color: red; }
@media print { .same { color: black; } }
@supports (display: grid) { .same { display: grid; } }
`);
  equal(
    [...contextual].map(([key, declarations]) => ({
      ...syntax.parseRuleKey(key),
      declarations,
    })),
    [
      { context: [], selector: ".same", declarations: ["color: red"] },
      { context: ["@media print"], selector: ".same", declarations: ["color: black"] },
      { context: ["@supports (display: grid)"], selector: ".same", declarations: ["display: grid"] },
    ],
    "declaration maps keep identical selectors in different at-rule contexts distinct",
  );
}

const prefixed = prefixSelectors(css, "html.pbp-dark");
check(
  prefixed.includes('html.pbp-dark :where(.card, .tile), html.pbp-dark [data-label="x,y"] {'),
  `mode prefixing must preserve commas inside selector functions and attributes:\n${prefixed}`,
);
check(
  prefixed.includes("@media (min-width: 40rem) {\n  html.pbp-dark .inside:is(.x, .y), html.pbp-dark .other {"),
  `mode prefixing must recurse into @media rule lists:\n${prefixed}`,
);
check(
  prefixed.includes("@supports selector(:has(> .child, + .peer)) {\n  html.pbp-dark .supported:where(.a, .b) {"),
  `mode prefixing must recurse into @supports without splitting its prelude:\n${prefixed}`,
);
check(
  prefixed.includes('@font-face { font-family: "Theme, UI"; src: url("theme;ui.woff2"); }'),
  "mode prefixing must leave descriptor at-rules unchanged",
);
check(
  prefixed.includes("@keyframes pulse { from { opacity: 0; } to { opacity: 1; } }"),
  "mode prefixing must leave keyframe selectors unchanged",
);

if (failures.length) {
  console.error(failures.map((message) => `FAIL ${message}`).join("\n"));
  process.exit(1);
}

console.log("theme CSS syntax tests ok");
