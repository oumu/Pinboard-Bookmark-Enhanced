#!/usr/bin/env node
// validate-contracts — execute tokens.schema.json against every pilot and
// cross-check the theme-surface manifest's page/template/surface registry.
//
// The project intentionally has no package/build dependency. This validator
// therefore implements only the Draft-07 keywords used by tokens.schema.json:
// local $ref, type, required, properties, additionalProperties, enum,
// pattern, minLength and maxLength. An unsupported keyword must be added here
// before it can become an authoring contract.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { UI_DERIVED_OUTPUT_ROLES } from "../composers/_ui-derive.mjs";

const toolsDir = dirname(fileURLToPath(import.meta.url));
const surfaceDir = resolve(toolsDir, "..");
const pilotsDir = resolve(surfaceDir, "pilots");

function parseArgs(argv) {
  const options = {
    schema: resolve(surfaceDir, "tokens.schema.json"),
    manifest: resolve(surfaceDir, "manifest.json"),
    pilots: [],
    json: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--json") options.json = true;
    else if (arg === "--schema" || arg === "--manifest" || arg === "--pilot") {
      const value = argv[++i];
      if (!value) throw new Error(`${arg} requires a file path`);
      if (arg === "--schema") options.schema = resolve(value);
      else if (arg === "--manifest") options.manifest = resolve(value);
      else options.pilots.push(resolve(value));
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  if (options.pilots.length === 0) {
    options.pilots = readdirSync(pilotsDir)
      .filter((name) => name.endsWith(".tokens.json"))
      .sort()
      .map((name) => resolve(pilotsDir, name));
  }
  return options;
}

function readJson(path, errors, label) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    errors.push(`${label}: ${error.message}`);
    return null;
  }
}

function pointerPart(value) {
  return String(value).replaceAll("~", "~0").replaceAll("/", "~1");
}

function resolveRef(rootSchema, ref) {
  if (!ref.startsWith("#/")) throw new Error(`only local schema refs are supported: ${ref}`);
  return ref.slice(2).split("/").reduce((node, part) => {
    const key = part.replaceAll("~1", "/").replaceAll("~0", "~");
    return node?.[key];
  }, rootSchema);
}

function matchesType(value, type) {
  if (type === "object") return value !== null && typeof value === "object" && !Array.isArray(value);
  if (type === "array") return Array.isArray(value);
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "integer") return Number.isInteger(value);
  if (type === "null") return value === null;
  return typeof value === type;
}

function validateValue(value, schema, rootSchema, path, errors) {
  if (schema.$ref) {
    const target = resolveRef(rootSchema, schema.$ref);
    if (!target) {
      errors.push(`${path || "/"}: unresolved schema ref ${schema.$ref}`);
      return;
    }
    validateValue(value, target, rootSchema, path, errors);
    return;
  }

  if (schema.type) {
    const allowed = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!allowed.some((type) => matchesType(value, type))) {
      errors.push(`${path || "/"}: expected ${allowed.join(" or ")}, got ${Array.isArray(value) ? "array" : value === null ? "null" : typeof value}`);
      return;
    }
  }

  if (schema.enum && !schema.enum.some((candidate) => Object.is(candidate, value))) {
    errors.push(`${path || "/"}: expected one of ${schema.enum.map(JSON.stringify).join(", ")}, got ${JSON.stringify(value)}`);
  }

  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push(`${path || "/"}: string is shorter than ${schema.minLength}`);
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      errors.push(`${path || "/"}: string is longer than ${schema.maxLength}`);
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      errors.push(`${path || "/"}: string does not match ${schema.pattern}`);
    }
  }

  if (value === null || typeof value !== "object" || Array.isArray(value)) return;

  const properties = schema.properties ?? {};
  for (const key of schema.required ?? []) {
    if (!Object.hasOwn(value, key)) errors.push(`${path}/${pointerPart(key)}: required property is missing`);
  }
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}/${pointerPart(key)}`;
    if (Object.hasOwn(properties, key)) {
      validateValue(child, properties[key], rootSchema, childPath, errors);
    } else if (schema.additionalProperties === false) {
      errors.push(`${childPath}: additional property is not allowed`);
    } else if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
      validateValue(child, schema.additionalProperties, rootSchema, childPath, errors);
    }
  }
}

function validateManifest(manifest, schema, errors) {
  if (!manifest || typeof manifest !== "object") return;
  const pages = manifest.pages ?? {};
  const surfaces = manifest.surfaces ?? {};
  const templates = manifest.page_templates ?? {};
  const composers = manifest.composers ?? {};

  for (const [pageId, page] of Object.entries(pages)) {
    if (!templates[page.template]) {
      errors.push(`manifest/pages/${pointerPart(pageId)}/template: unknown template ${JSON.stringify(page.template)}`);
    }
  }
  for (const [templateId, template] of Object.entries(templates)) {
    for (const pageId of template.pages ?? []) {
      if (!pages[pageId]) errors.push(`manifest/page_templates/${pointerPart(templateId)}: missing page ${JSON.stringify(pageId)}`);
      else if (pages[pageId].template !== templateId) {
        errors.push(`manifest/page_templates/${pointerPart(templateId)}: page ${JSON.stringify(pageId)} declares template ${JSON.stringify(pages[pageId].template)}`);
      }
    }
    for (const surfaceId of [...(template.required_surfaces ?? []), ...(template.optional_surfaces ?? [])]) {
      if (!surfaces[surfaceId]) errors.push(`manifest/page_templates/${pointerPart(templateId)}: missing surface ${JSON.stringify(surfaceId)}`);
    }
  }
  for (const [pageId, page] of Object.entries(pages)) {
    const owners = Object.entries(templates)
      .filter(([, template]) => (template.pages ?? []).includes(pageId))
      .map(([templateId]) => templateId);
    if (!owners.includes(page.template)) {
      errors.push(`manifest/pages/${pointerPart(pageId)}: not listed by its declared template ${JSON.stringify(page.template)}`);
    }
    if (owners.length > 1) {
      errors.push(`manifest/pages/${pointerPart(pageId)}: listed by multiple templates (${owners.join(", ")})`);
    }
  }

  const layoutModes = new Set();
  for (const [composerId, composer] of Object.entries(composers)) {
    if (composerId.startsWith("_")) continue;
    if (composer.layout_mode) layoutModes.add(composer.layout_mode);
    if (!composer.file || !existsSync(resolve(surfaceDir, composer.file))) {
      errors.push(`manifest/composers/${pointerPart(composerId)}/file: missing composer file ${JSON.stringify(composer.file)}`);
    }
  }

  const patternSchema = schema?.properties?.patterns?.properties ?? {};
  for (const [name, contract] of Object.entries(manifest.patterns?.available ?? {})) {
    const schemaEnum = patternSchema[name]?.enum;
    if (!schemaEnum || !Array.isArray(contract.values)) continue;
    if (JSON.stringify(schemaEnum) !== JSON.stringify(contract.values)) {
      errors.push(`manifest/patterns/available/${pointerPart(name)}/values: does not match tokens.schema.json enum`);
    }
  }
  return layoutModes;
}

function validatePilot(pilot, path, schema, manifest, layoutModes, errors) {
  const label = basename(path);
  const before = errors.length;
  validateValue(pilot, schema, schema, "", errors);
  const stem = label.replace(/\.tokens\.json$/, "");
  if (pilot?.meta?.id !== stem) {
    errors.push(`${label}/meta/id: filename stem ${JSON.stringify(stem)} must equal meta.id ${JSON.stringify(pilot?.meta?.id)}`);
  }
  if (pilot?.layout?.mode && !layoutModes.has(pilot.layout.mode)) {
    errors.push(`${label}/layout/mode: no manifest composer declares ${JSON.stringify(pilot.layout.mode)}`);
  }
  const supportedModes = new Set(manifest?.modes?.supported_modes ?? []);
  for (const mode of Object.keys(pilot?.modes ?? {})) {
    if (!supportedModes.has(mode)) errors.push(`${label}/modes/${pointerPart(mode)}: mode is not registered in manifest.json`);
  }
  for (const [surface, modes] of Object.entries(pilot?.ui ?? {})) {
    const blocked = new Set(UI_DERIVED_OUTPUT_ROLES[surface] ?? []);
    for (const [mode, roles] of Object.entries(modes ?? {})) {
      for (const role of Object.keys(roles ?? {})) {
        if (blocked.has(role)) {
          errors.push(`${label}/ui/${pointerPart(surface)}/${pointerPart(mode)}/${pointerPart(role)}: derived output role is computed after supported ui overrides`);
        }
      }
    }
  }
  if (errors.length > before) {
    for (let i = before; i < errors.length; i++) {
      if (!errors[i].startsWith(`${label}/`) && !errors[i].startsWith("manifest/")) errors[i] = `${label}${errors[i]}`;
    }
  }
}

function main() {
  const errors = [];
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`[theme-contract] ${error.message}`);
    process.exit(2);
  }
  const schema = readJson(options.schema, errors, "schema");
  const manifest = readJson(options.manifest, errors, "manifest");
  const layoutModes = validateManifest(manifest, schema, errors) ?? new Set();
  for (const path of options.pilots) {
    const pilot = readJson(path, errors, basename(path));
    if (pilot) validatePilot(pilot, path, schema, manifest, layoutModes, errors);
  }

  const report = {
    ok: errors.length === 0,
    pilots: options.pilots.length,
    manifest: {
      pages: Object.keys(manifest?.pages ?? {}).length,
      surfaces: Object.keys(manifest?.surfaces ?? {}).length,
      templates: Object.keys(manifest?.page_templates ?? {}).length,
    },
    errors,
  };
  if (options.json) console.log(JSON.stringify(report, null, 2));
  else if (errors.length) {
    console.error(`[theme-contract] FAIL - ${errors.length} contract error(s)`);
    for (const error of errors) console.error(`  ${error}`);
  } else {
    console.log(`[theme-contract] PASS - ${report.pilots} pilots, ${report.manifest.pages} pages, ${report.manifest.surfaces} surfaces`);
  }
  process.exit(errors.length ? 1 : 0);
}

main();
