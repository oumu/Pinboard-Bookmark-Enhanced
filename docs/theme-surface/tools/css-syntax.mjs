// Lightweight CSS Syntax scanner shared by the theme factory's Node tools.
// It follows the boundaries that matter here: strings, comments and nested
// component-value blocks never terminate a rule, declaration or selector-list
// item. This is intentionally not a selector validator or a full CSS parser.

const GROUPING_AT_RULES = new Set([
  "container",
  "document",
  "layer",
  "media",
  "scope",
  "starting-style",
  "supports",
]);
const RULE_KEY_SEPARATOR = "\u001f";

function skipComment(input, index, end = input.length) {
  const close = input.indexOf("*/", index + 2);
  return close === -1 || close + 2 > end ? end : close + 2;
}

function skipString(input, index, end = input.length) {
  const quote = input[index];
  let cursor = index + 1;
  while (cursor < end) {
    if (input[cursor] === "\\") {
      cursor += 2;
      continue;
    }
    if (input[cursor] === quote) return cursor + 1;
    cursor++;
  }
  return end;
}

function skipTrivia(input, index, end) {
  let cursor = index;
  while (cursor < end) {
    if (/\s/.test(input[cursor])) {
      cursor++;
      continue;
    }
    if (input.startsWith("/*", cursor)) {
      cursor = skipComment(input, cursor, end);
      continue;
    }
    break;
  }
  return cursor;
}

function findMatchingBrace(input, open, end) {
  let depth = 1;
  for (let cursor = open + 1; cursor < end; cursor++) {
    if (input.startsWith("/*", cursor)) {
      cursor = skipComment(input, cursor, end) - 1;
      continue;
    }
    if (input[cursor] === '"' || input[cursor] === "'") {
      cursor = skipString(input, cursor, end) - 1;
      continue;
    }
    if (input[cursor] === "\\") {
      cursor++;
      continue;
    }
    if (input[cursor] === "{") depth++;
    else if (input[cursor] === "}" && --depth === 0) return cursor;
  }
  return -1;
}

function scanRuleList(input, start = 0, end = input.length) {
  const rules = [];
  let cursor = start;
  while (cursor < end) {
    const ruleStart = skipTrivia(input, cursor, end);
    if (ruleStart >= end || input[ruleStart] === "}") break;

    const atRule = input[ruleStart] === "@";
    let parenDepth = 0;
    let squareDepth = 0;
    let blockOpen = -1;
    let terminated = false;
    for (let index = ruleStart; index < end; index++) {
      if (input.startsWith("/*", index)) {
        index = skipComment(input, index, end) - 1;
        continue;
      }
      if (input[index] === '"' || input[index] === "'") {
        index = skipString(input, index, end) - 1;
        continue;
      }
      if (input[index] === "\\") {
        index++;
        continue;
      }
      if (input[index] === "(") parenDepth++;
      else if (input[index] === ")" && parenDepth > 0) parenDepth--;
      else if (input[index] === "[") squareDepth++;
      else if (input[index] === "]" && squareDepth > 0) squareDepth--;
      else if (parenDepth === 0 && squareDepth === 0 && input[index] === "{") {
        blockOpen = index;
        break;
      } else if (atRule && parenDepth === 0 && squareDepth === 0 && input[index] === ";") {
        const prelude = input.slice(ruleStart, index).trim();
        rules.push({
          kind: "at-rule",
          name: prelude.slice(1).match(/^[-\w]+/)?.[0]?.toLowerCase() || "",
          prelude,
          start: ruleStart,
          end: index + 1,
          blockOpen: -1,
          bodyStart: -1,
          blockEnd: -1,
        });
        cursor = index + 1;
        terminated = true;
        break;
      }
    }
    if (terminated) continue;
    if (blockOpen === -1) break;

    const blockEnd = findMatchingBrace(input, blockOpen, end);
    if (blockEnd === -1) break;
    const prelude = input.slice(ruleStart, blockOpen).trim();
    rules.push({
      kind: atRule ? "at-rule" : "qualified-rule",
      name: atRule ? prelude.slice(1).match(/^[-\w]+/)?.[0]?.toLowerCase() || "" : "",
      prelude,
      start: ruleStart,
      end: blockEnd + 1,
      blockOpen,
      bodyStart: blockOpen + 1,
      blockEnd,
    });
    cursor = blockEnd + 1;
  }
  return rules;
}

function splitTopLevel(input, delimiter) {
  const parts = [];
  let start = 0;
  let parenDepth = 0;
  let squareDepth = 0;
  let curlyDepth = 0;
  for (let index = 0; index < input.length; index++) {
    if (input.startsWith("/*", index)) {
      index = skipComment(input, index) - 1;
      continue;
    }
    if (input[index] === '"' || input[index] === "'") {
      index = skipString(input, index) - 1;
      continue;
    }
    if (input[index] === "\\") {
      index++;
      continue;
    }
    if (input[index] === "(") parenDepth++;
    else if (input[index] === ")" && parenDepth > 0) parenDepth--;
    else if (input[index] === "[") squareDepth++;
    else if (input[index] === "]" && squareDepth > 0) squareDepth--;
    else if (input[index] === "{") curlyDepth++;
    else if (input[index] === "}" && curlyDepth > 0) curlyDepth--;
    else if (input[index] === delimiter && parenDepth === 0 && squareDepth === 0 && curlyDepth === 0) {
      parts.push(input.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(input.slice(start));
  return parts;
}

function normalizeWhitespace(input) {
  let output = "";
  let pendingSpace = false;
  for (let index = 0; index < input.length; index++) {
    if (input.startsWith("/*", index)) {
      index = skipComment(input, index) - 1;
      continue;
    }
    if (input[index] === '"' || input[index] === "'") {
      if (pendingSpace && output && !output.endsWith(" ")) output += " ";
      const end = skipString(input, index);
      output += input.slice(index, end);
      index = end - 1;
      pendingSpace = false;
      continue;
    }
    if (/\s/.test(input[index])) {
      pendingSpace = output.length > 0;
      continue;
    }
    if (pendingSpace && output && !output.endsWith(" ")) output += " ";
    output += input[index];
    pendingSpace = false;
  }
  return output.trim();
}

export function splitSelectorList(selectorText) {
  return splitTopLevel(selectorText, ",")
    .map(normalizeWhitespace)
    .filter(Boolean);
}

export function parseDeclarations(body) {
  const declarations = [];
  for (const part of splitTopLevel(body, ";")) {
    const raw = normalizeWhitespace(part);
    if (!raw) continue;
    const colon = splitTopLevel(part, ":")[0].length;
    if (colon >= part.length || part[colon] !== ":") continue;
    const rawProperty = normalizeWhitespace(part.slice(0, colon));
    const property = rawProperty.startsWith("--") ? rawProperty : rawProperty.toLowerCase();
    let value = normalizeWhitespace(part.slice(colon + 1));
    if (!property || !value) continue;
    const important = /!important\s*$/i.test(value);
    if (important) value = value.replace(/!important\s*$/i, "").trim();
    declarations.push({ property, value, important, raw });
  }
  return declarations;
}

export function parseStyleRules(css) {
  const output = [];
  let sourceOrder = 0;

  function walk(start, end, context) {
    for (const rule of scanRuleList(css, start, end)) {
      if (rule.kind === "qualified-rule") {
        const selectorText = normalizeWhitespace(rule.prelude);
        const selectors = splitSelectorList(rule.prelude);
        if (!selectors.length) continue;
        output.push({
          selectorText,
          selectors,
          body: css.slice(rule.bodyStart, rule.blockEnd),
          lineNum: css.slice(0, rule.start).split("\n").length,
          sourceOrder: sourceOrder++,
          context,
        });
      } else if (rule.blockOpen !== -1 && GROUPING_AT_RULES.has(rule.name)) {
        walk(rule.bodyStart, rule.blockEnd, [...context, normalizeWhitespace(rule.prelude)]);
      }
    }
  }

  walk(0, css.length, []);
  return output;
}

export function makeRuleKey(context, selector) {
  return context.length ? [...context, selector].join(RULE_KEY_SEPARATOR) : selector;
}

export function parseRuleKey(key) {
  const parts = key.split(RULE_KEY_SEPARATOR);
  const selector = parts.pop() || "";
  return { context: parts, selector };
}

export function formatRuleKey(key) {
  const { context, selector } = parseRuleKey(key);
  return context.length ? `${context.join(" > ")} > ${selector}` : selector;
}

export function declarationMap(css, { lowercase = false, includeRoot = false } = {}) {
  const output = new Map();
  for (const rule of parseStyleRules(css)) {
    const declarations = parseDeclarations(rule.body)
      .map(({ raw }) => lowercase ? raw.toLowerCase() : raw);
    for (const selector of rule.selectors) {
      if (!includeRoot && selector === ":root") continue;
      const key = makeRuleKey(rule.context, selector);
      if (!output.has(key)) output.set(key, []);
      const stored = output.get(key);
      for (const declaration of declarations) {
        if (!stored.includes(declaration)) stored.push(declaration);
      }
    }
  }
  return output;
}

export function declarationValueMap(css, selector, { context = [] } = {}) {
  const output = new Map();
  for (const rule of parseStyleRules(css)) {
    if (rule.context.length !== context.length || rule.context.some((item, index) => item !== context[index])) continue;
    if (!rule.selectors.includes(selector)) continue;
    for (const declaration of parseDeclarations(rule.body)) {
      output.set(
        declaration.property,
        `${declaration.value}${declaration.important ? " !important" : ""}`,
      );
    }
  }
  return output;
}

export function transformStyleRuleSelectors(css, transform) {
  function transformList(start, end) {
    const rules = scanRuleList(css, start, end);
    let output = "";
    let cursor = start;
    for (const rule of rules) {
      output += css.slice(cursor, rule.start);
      if (rule.kind === "qualified-rule") {
        const rawPrelude = css.slice(rule.start, rule.blockOpen);
        output += transform(rawPrelude);
        output += css.slice(rule.blockOpen, rule.end);
      } else if (rule.blockOpen !== -1 && GROUPING_AT_RULES.has(rule.name)) {
        output += css.slice(rule.start, rule.bodyStart);
        output += transformList(rule.bodyStart, rule.blockEnd);
        output += css.slice(rule.blockEnd, rule.end);
      } else {
        output += css.slice(rule.start, rule.end);
      }
      cursor = rule.end;
    }
    output += css.slice(cursor, end);
    return output;
  }

  return transformList(0, css.length);
}

export function prefixSelectorList(selectorText, trigger) {
  return splitTopLevel(selectorText, ",").map((part) => {
    const leading = part.match(/^\s*/)?.[0] || "";
    const trailing = part.match(/\s*$/)?.[0] || "";
    const selector = part.slice(leading.length, part.length - trailing.length);
    if (normalizeWhitespace(selector) === ":root") return `${leading}${trigger}${trailing}`;
    return `${leading}${trigger} ${selector}${trailing}`;
  }).join(",");
}
