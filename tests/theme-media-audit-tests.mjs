#!/usr/bin/env node

import assert from "node:assert/strict";
import * as oracle from "./render-audit-checklist.mjs";

assert.deepEqual(
  oracle.MEDIA_THEMES,
  ["", "github-light", "terminal", "flexoki-dark"],
  "media audit must cover the default, representative light/dark, and high-style themes",
);
assert.deepEqual(
  oracle.MEDIA_SCENARIOS?.map((scenario) => scenario.id),
  ["forced-colors", "more-contrast"],
  "media audit must exercise forced colors and the higher-contrast preference independently",
);
assert.equal(oracle.MEDIA_CHECKS?.length, 3, "media audit must cover popup, options, and library");
assert.equal(typeof oracle.evaluateMediaProbe, "function", "media probe evaluator must be executable, not a source-text contract");

const baseCheck = {
  surface: "options",
  text: "#tab-general",
  control: "#tab-general",
  focus: "#tab-general",
  selected: "#tab-general",
  minTextContrast: 4.5,
};
const passingProbe = {
  queryMatches: true,
  text: { found: true, visible: true, contrast: 7 },
  control: { found: true, visible: true },
  focus: { found: true, visible: true, active: true, cue: true },
  selected: { found: true, visible: true, selected: true, cue: true },
};

assert.deepEqual(oracle.evaluateMediaProbe(passingProbe, baseCheck), [], "a complete, visible media probe must pass");

const failures = [
  ["mediaQuery", { queryMatches: false }],
  ["textVisible", { text: { ...passingProbe.text, visible: false } }],
  ["textContrast", { text: { ...passingProbe.text, contrast: 1 } }],
  ["controlVisible", { control: { ...passingProbe.control, found: false } }],
  ["focusCue", { focus: { ...passingProbe.focus, cue: false } }],
  ["selectedCue", { selected: { ...passingProbe.selected, selected: false } }],
];

for (const [expectedCheck, patch] of failures) {
  const probe = {
    ...passingProbe,
    ...patch,
  };
  const verdicts = oracle.evaluateMediaProbe(probe, baseCheck);
  assert(
    verdicts.some((verdict) => verdict.check === expectedCheck && verdict.status === "FAIL"),
    `${expectedCheck} must fail closed for its simplest counter-example`,
  );
}

const popupCheck = { ...baseCheck, surface: "popup", selected: null };
const popupProbe = { ...passingProbe, selected: null };
assert.deepEqual(
  oracle.evaluateMediaProbe(popupProbe, popupCheck),
  [],
  "surfaces without a stable selected control must not invent a vacuous selected-state requirement",
);

console.log("theme media audit tests ok");
