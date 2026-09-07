// ============================================================
// Options page — settings export/import (backup file).
// Exposes setupBackup() with storage helpers and optional save-queue hooks.
// Schema-version aware: v2/v3 backups use customOverlayCSS, v1 uses customCSS.
// ============================================================

// Classify a syncSetLarge("savedThemes") failure during import.
// Quota errors mean the data WAS preserved to local (syncSetLarge's fallback),
// so report partial success — not the misleading generic "Invalid file".
// Returns a t() key, or null to signal "rethrow as a genuine import failure".
function importThemesResult(err) {
  if (!err) return "importedReload";
  if (err.pbpFellBackToLocal || /QUOTA|quota/i.test(err.message || "")) return "importPartial";
  return null;
}

const PBP_BACKUP_TARGET_FIELDS = Object.freeze({
  obsidian: Object.freeze({ enabled: "boolean", route: "string", vault: "string", folder: "string" }),
  notion: Object.freeze({ enabled: "boolean", parent: "string" }),
  notebooklm: Object.freeze({ enabled: "boolean" }),
  github: Object.freeze({ enabled: "boolean" }),
  webhook: Object.freeze({ enabled: "boolean" }),
});

const PBP_BACKUP_ENUMS = Object.freeze({
  optTheme: ["auto", "light", "dark"],
  bgSaveMode: ["merge", "skip", "overwrite"],
  tagSyncMode: ["fresh", "cached", "prewarmed"],
  aiContentSource: ["local", "jina"],
  mdExportImagePolicy: ["keep", "alt", "strip"],
  selectionTrigger: ["icon", "hotkey", "off"],
});

// Per-provider preview model overrides: keys must look like provider ids and
// values like model names. Bounded (entry count / value length) because backup
// files are untrusted input and this object round-trips into synced settings.
function pbpSanitizeBackupPreviewModelMap(value) {
  if (!pbpIsPlainRecord(value)) throw pbpBackupValueError("previewAiModelByProvider");
  const out = {};
  const keys = Object.keys(value);
  if (keys.length > 32) throw pbpBackupValueError("previewAiModelByProvider");
  for (const key of keys) {
    if (!/^[a-z][a-z0-9_-]{0,31}$/.test(key)) throw pbpBackupValueError("previewAiModelByProvider." + key);
    const model = value[key];
    if (typeof model !== "string" || model.length > 200) {
      throw pbpBackupValueError("previewAiModelByProvider." + key);
    }
    out[key] = model;
  }
  return out;
}

function pbpSanitizeBackupUrlClean(value) {
  if (!pbpIsPlainRecord(value)) throw pbpBackupValueError("urlClean");
  const out = {};
  ["enabled", "onPopupOpen", "onPaste", "aggressiveMode"].forEach((key) => {
    if (typeof value[key] !== "boolean") throw pbpBackupValueError("urlClean." + key);
    out[key] = value[key];
  });
  ["customParams", "excludeParams"].forEach((key) => {
    if (!Array.isArray(value[key]) || value[key].some((item) => typeof item !== "string")) {
      throw pbpBackupValueError("urlClean." + key);
    }
    out[key] = value[key].slice();
  });
  return out;
}

function pbpSanitizeBackupExportTargets(value) {
  if (!pbpIsPlainRecord(value)) throw pbpBackupValueError("exportTargets");
  const out = {};
  for (const [targetId, fields] of Object.entries(PBP_BACKUP_TARGET_FIELDS)) {
    if (!Object.prototype.hasOwnProperty.call(value, targetId)) continue;
    const cfg = value[targetId];
    if (!pbpIsPlainRecord(cfg)) throw pbpBackupValueError("exportTargets." + targetId);
    const cleaned = {};
    for (const [key, expectedType] of Object.entries(fields)) {
      if (!Object.prototype.hasOwnProperty.call(cfg, key)) continue;
      if (typeof cfg[key] !== expectedType) throw pbpBackupValueError(`exportTargets.${targetId}.${key}`);
      cleaned[key] = cfg[key];
    }
    if (targetId === "obsidian" && Object.prototype.hasOwnProperty.call(cleaned, "route") &&
        !["new", "append", "daily"].includes(cleaned.route)) {
      throw pbpBackupValueError("exportTargets.obsidian.route");
    }
    out[targetId] = cleaned;
  }
  return out;
}

// Credentials travel on their own path, NOT through exportableKeys: that
// whitelist stays credential-free so the ordinary settings sanitize can never
// be widened by accident. Returns null when the backup carries none, so the
// import UI can tell "no credential section" from "an empty one".
function pbpSanitizeBackupSecrets(data) {
  const keys = {};
  for (const key of API_KEY_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(data, key)) continue;
    if (typeof data[key] !== "string") throw pbpBackupValueError(key);
    if (data[key] !== "") keys[key] = data[key];
  }
  const targets = {};
  if (Object.prototype.hasOwnProperty.call(data, "exportTargets") && pbpIsPlainRecord(data.exportTargets)) {
    for (const [targetId, cfg] of Object.entries(data.exportTargets)) {
      if (!pbpIsPlainRecord(cfg)) continue;
      const cleaned = {};
      for (const key of pbpExportTargetSecretKeys(targetId)) {
        if (!Object.prototype.hasOwnProperty.call(cfg, key)) continue;
        if (typeof cfg[key] !== "string") throw pbpBackupValueError(`exportTargets.${targetId}.${key}`);
        if (cfg[key] !== "") cleaned[key] = cfg[key];
      }
      if (Object.keys(cleaned).length) targets[targetId] = cleaned;
    }
  }
  if (!Object.keys(keys).length && !Object.keys(targets).length) return null;
  return { keys, exportTargets: targets };
}

function pbpSanitizeBackupSettings(data, exportableKeys) {
  const safe = {};
  for (const key of exportableKeys) {
    if (!Object.prototype.hasOwnProperty.call(data, key)) continue;
    const value = data[key];
    if (key === "exportTargets") {
      safe[key] = pbpSanitizeBackupExportTargets(value);
      continue;
    }
    if (key === "urlClean") {
      safe[key] = pbpSanitizeBackupUrlClean(value);
      continue;
    }
    if (key === "previewAiModelByProvider") {
      safe[key] = pbpSanitizeBackupPreviewModelMap(value);
      continue;
    }
    const expected = SETTINGS_DEFAULTS[key];
    if (typeof expected === "boolean" && typeof value !== "boolean") throw pbpBackupValueError(key);
    if (typeof expected === "string" && typeof value !== "string") throw pbpBackupValueError(key);
    if (typeof expected === "number" && (typeof value !== "number" || !Number.isFinite(value))) {
      throw pbpBackupValueError(key);
    }
    if (PBP_BACKUP_ENUMS[key] && !PBP_BACKUP_ENUMS[key].includes(value)) throw pbpBackupValueError(key);
    if (key === "popupWidth" && (value < 420 || value > 720)) throw pbpBackupValueError(key);
    if (key === "aiCacheDuration" && (value < 0 || value > 10080)) throw pbpBackupValueError(key);
    safe[key] = value;
  }
  return safe;
}

function pbpPreflightBackupPayload(data, exportableKeys) {
  const schemaVersion = pbpBackupSchemaVersion(data);
  const safeData = pbpSanitizeBackupSettings(data, exportableKeys);
  const metadata = schemaVersion === 3
    ? pbpSanitizeBackupMetadata(data._backup)
    : undefined;
  let customCSS;
  let customOverlayCSS;
  // Type checks only — no size gate. An oversize overlay from a legacy backup
  // is preserved through saveOverlayWithFallback's local-fallback path; a
  // rejection here would make the whole otherwise-valid backup unimportable.
  if (schemaVersion === 1 && Object.prototype.hasOwnProperty.call(data, "customCSS")) {
    if (typeof data.customCSS !== "string") throw pbpBackupValueError("customCSS");
    customCSS = data.customCSS;
  }
  if (schemaVersion >= 2 && Object.prototype.hasOwnProperty.call(data, "customOverlayCSS")) {
    if (typeof data.customOverlayCSS !== "string") throw pbpBackupValueError("customOverlayCSS");
    customOverlayCSS = data.customOverlayCSS;
  }
  const importedThemes = Object.prototype.hasOwnProperty.call(data, "savedThemes")
    ? pbpSanitizeBackupThemes(data.savedThemes)
    : undefined;
  if (Object.prototype.hasOwnProperty.call(data, "_highlights") && !pbpIsPlainRecord(data._highlights)) {
    throw pbpBackupValueError("_highlights");
  }
  if (Object.prototype.hasOwnProperty.call(data, "_highlightsOwner") && typeof data._highlightsOwner !== "string") {
    throw pbpBackupValueError("_highlightsOwner");
  }
  const vocabulary = schemaVersion === 3 && Object.prototype.hasOwnProperty.call(data, "_vocabulary")
    ? pbpSanitizeBackupVocabulary(data._vocabulary)
    : undefined;
  const secretData = pbpSanitizeBackupSecrets(data);
  return {
    schemaVersion,
    metadata,
    safeData,
    secretData,
    secretCount: pbpCountBackupSecrets(data),
    customCSS,
    customOverlayCSS,
    importedThemes,
    highlights: data._highlights,
    highlightsOwner: data._highlightsOwner,
    vocabulary,
  };
}

function pbpBackupImportResultKey(result) {
  const statuses = ["settings", "themes", "highlights", "vocabulary", "secrets"]
    .map((key) => result && result[key]);
  if (statuses.some((status) => status === "failed" || status === "local-only")) {
    return "backupImportPartialResult";
  }
  return statuses.some((status) => status === "applied")
    ? "backupImportComplete"
    : "backupImportNothing";
}

// This page is the THIRD writer of a pbp_hl_<page> record: the reader
// (md-highlight.js) rewrites it from its own tab, library.html deletes from it,
// and chrome.storage has no compare-and-swap. Restoring a backup is a
// read-modify-write like the other two -- it re-reads the record to keep the
// items belonging to OTHER accounts (pbpMergeHighlightBackupRecord) -- and it
// can also land in the middle of somebody else's: a reader tab reads X, this
// import writes Y, the reader writes back X+A and Y is gone.
// Web Locks are origin-scoped, so every extension page and the MV3 worker queue
// on one name. That name is the contract with md-highlight.js's _pbpHlLockName
// and library-notes.js's _pbpNotesRecordLockName -- "pbp-hl:" + the storage key
// -- and all three copies must keep producing the same string or the mutual
// exclusion silently stops existing. Duplicated rather than hoisted into
// shared.js for the same reason those two are: isolated script contexts, and
// the shared thing is the string, not the function.
const PBP_BACKUP_HL_RECORD_LOCK_PREFIX = "pbp-hl:";
function pbpBackupHighlightLockName(key) { return PBP_BACKUP_HL_RECORD_LOCK_PREFIX + key; }

let pbpBackupHighlightLockWarned = false;

// Degrades to a bare call where Web Locks are missing (direct-open test pages,
// insecure contexts): the import still lands, exactly as it did before the lock
// existed. Says so once -- dropping to a weaker guarantee in silence is the
// swallowed degradation the repo's leave-a-trace rule exists for.
function pbpBackupHighlightWithRecordLock(key, work) {
  const locks = typeof navigator !== "undefined" && navigator.locks;
  if (locks && typeof locks.request === "function") return locks.request(pbpBackupHighlightLockName(key), work);
  if (!pbpBackupHighlightLockWarned) {
    pbpBackupHighlightLockWarned = true;
    console.warn("[backup] Web Locks unavailable: highlight import is not serialised against the reader");
  }
  return Promise.resolve().then(work);
}

// One lock per record, taken and released around that record's own set --
// never one lock over the whole batch, and never one global name: restoring 50
// pages must not make page 2 wait on page 1's reader tab, and a reader
// highlighting page B must not wait on this import writing page A. The price is
// one storage trip per record instead of one for all of them, which is the
// cheap half of the trade (storage.local has no write-rate quota; a lost
// highlight has no undo).
//
// Only per-record keys need the lock. pbp_hl_last_color is a scalar nobody
// read-modify-writes, and anything else that reaches here is not a highlight
// record -- those go out in a single unlocked trip so they cost nothing.
// Failures still propagate to the caller, which reports the section failed.
//
// ownerScope is decided once, before the first record; from there each record
// costs its own lock and its own storage round trip, so a fifty-page restore
// spans enough time for the user to switch Pinboard accounts in another tab.
// verifyOwner is the caller's re-read of the live account and must throw when it
// no longer matches -- without it the tail of the loop would keep claiming the
// file's ownerless items for an account that is no longer signed in, and keep
// deciding which stored items count as "somebody else's" by the old scope. It is
// required, not optional: a caller that forgets it fails loudly instead of
// writing unverified. Same cadence as the vocabulary import, which re-checks
// before and after every batch.
async function pbpBackupWriteHighlights(cleaned, ownerScope, verifyOwner) {
  const records = [];
  const rest = {};
  for (const [key, value] of Object.entries(cleaned || {})) {
    if (pbpIsHighlightBackupKey(key) && key !== "pbp_hl_last_color") records.push([key, value]);
    else rest[key] = value;
  }
  if (Object.keys(rest).length) await chrome.storage.local.set(rest);
  for (const [key, value] of records) {
    await verifyOwner();
    // Read and write inside the same lock: the merge is only sound against the
    // record as it stands at write time.
    await pbpBackupHighlightWithRecordLock(key, async () => {
      const stored = await chrome.storage.local.get(key);
      await chrome.storage.local.set({ [key]: pbpMergeHighlightBackupRecord(stored[key], value, ownerScope) });
    });
  }
  await verifyOwner();
}

// Applies the selected sections of one already-preflighted backup. Each
// section reports its own outcome so a later failure cannot hide earlier
// committed writes.
async function pbpApplyBackupPayload(data, {
  exportableKeys,
  saveOverlayWithFallback,
  loadThemes,
  sections,
  readCurrentOwner,
  importVocabulary,
  onVocabularyProgress,
}) {
  const prepared = pbpPreflightBackupPayload(data, exportableKeys);
  const { schemaVersion, safeData, customCSS, customOverlayCSS, importedThemes } = prepared;
  // Every other section defaults on; credentials default OFF. A backup file is
  // untrusted input, and any file can carry credential fields whether or not it
  // was exported with them — restoring those over the working keys on this
  // device has to be asked for, never inherited from "apply everything".
  const selected = Object.assign({
    settings: true,
    themes: true,
    highlights: true,
    vocabulary: true,
  }, sections || {}, { secrets: (sections || {}).secrets === true });
  const result = {
    settings: "skipped",
    themes: "skipped",
    highlights: "skipped",
    vocabulary: "skipped",
    secrets: "skipped",
    vocabularyApplied: 0,
  };
  const getOwner = readCurrentOwner || (async () => {
    const secret = await pbpReadSettingsWithSecrets({ pinboardToken: "" });
    return pbpPinboardAccountFromToken(secret.pinboardToken);
  });

  const hasSettings = Object.keys(safeData).length ||
    customCSS !== undefined || customOverlayCSS !== undefined;
  if (selected.settings && hasSettings) {
    try {
      // A v1 restore needs the preset registry before its first write.
      if (schemaVersion < 2 && loadThemes) await loadThemes();
      if (safeData.exportTargets) {
        const curRead = await pbpReadSettingsWithSecrets({ exportTargets: {} });
        const current = curRead.exportTargets || {};
        const merged = Object.assign({}, current);
        for (const [tid, cfg] of Object.entries(safeData.exportTargets)) {
          merged[tid] = Object.assign({}, merged[tid], cfg);
        }
        safeData.exportTargets = merged;
      }
      const importRes = await persistSettings(safeData);
      if (!importRes.ok) throw importRes.error || new Error("settings import failed");
      let localOnly = !!importRes.fellBackToLocal;
      if (schemaVersion >= 2) {
        if (customOverlayCSS !== undefined) {
          const overlayRes = await saveOverlayWithFallback(customOverlayCSS);
          localOnly = localOnly || !!(overlayRes && overlayRes.fellBackToLocal);
        }
      } else {
        const themes = typeof PINBOARD_THEMES === "object" && PINBOARD_THEMES ? PINBOARD_THEMES : {};
        const adaptiveMap = typeof ADAPTIVE_THEME_MAP === "object" && ADAPTIVE_THEME_MAP ? ADAPTIVE_THEME_MAP : {};
        const oldKey = safeData.themePresetKey || "";
        let resolvedKey = oldKey;
        if (!resolvedKey && customCSS) {
          for (const [key, theme] of Object.entries(themes)) {
            if (theme.css.trim() === customCSS.trim()) { resolvedKey = key; break; }
          }
          if (resolvedKey) {
            for (const [parent, [light, dark]] of Object.entries(adaptiveMap)) {
              if (resolvedKey === light || resolvedKey === dark) { resolvedKey = parent; break; }
            }
          }
        }
        let newOverlay = "";
        if (customCSS) {
          const preset = resolvedKey ? themes[resolvedKey] : null;
          const variants = adaptiveMap[resolvedKey] || [];
          const allowed = [preset ? preset.css : "", ...variants.map((key) => themes[key]?.css || "")];
          newOverlay = allowed.some((css) => css && css.trim() === customCSS.trim()) ? "" : customCSS;
        }
        await (await getSettingsStorage()).set({ themePresetKey: resolvedKey || "" });
        const overlayRes = await saveOverlayWithFallback(newOverlay);
        localOnly = localOnly || !!(overlayRes && overlayRes.fellBackToLocal);
      }
      result.settings = localOnly ? "local-only" : "applied";
    } catch (_) {
      result.settings = "failed";
    }
  }

  // Runs AFTER settings: the settings branch rebuilds exportTargets from the
  // credential-free copy, so writing tokens before it would just be overwritten
  // by that merge. persistSettings routes API_KEY_FIELDS to local storage on
  // its own, so this needs no area handling of its own.
  if (selected.secrets && prepared.secretData) {
    try {
      const batch = Object.assign({}, prepared.secretData.keys);
      const targetIds = Object.keys(prepared.secretData.exportTargets);
      if (targetIds.length) {
        const curRead = await pbpReadSettingsWithSecrets({ exportTargets: {} });
        const merged = Object.assign({}, curRead.exportTargets || {});
        for (const tid of targetIds) {
          merged[tid] = Object.assign({}, merged[tid], prepared.secretData.exportTargets[tid]);
        }
        batch.exportTargets = merged;
      }
      const secretRes = await persistSettings(batch);
      if (!secretRes.ok) throw secretRes.error || new Error("credential import failed");
      result.secrets = "applied";
    } catch (_) {
      result.secrets = "failed";
    }
  }

  if (selected.themes && Array.isArray(importedThemes) && importedThemes.length) {
    try {
      const setLarge = typeof globalThis.__pbpTestSyncSetLarge === "function"
        ? globalThis.__pbpTestSyncSetLarge
        : syncSetLarge;
      await setLarge("savedThemes", importedThemes);
      result.themes = "applied";
    } catch (error) {
      result.themes = importThemesResult(error) === "importPartial" ? "local-only" : "failed";
    }
  }

  let highlightsSkipped = false;
  if (selected.highlights && prepared.highlights !== undefined) {
    try {
      const currentOwner = await getOwner();
      if (!pbpHighlightBackupOwnerAllowed(prepared.highlightsOwner, currentOwner, true)) {
        highlightsSkipped = true;
        result.highlights = "failed";
      } else {
        // Scope before writing: the file's ownerless items are claimed by this
        // account and another account's items never enter storage from a file.
        const ownerScope = pbpBackupOwnerScope(currentOwner);
        const cleaned = pbpScopeHighlightBackupImport(pbpCleanHighlightBackup(prepared.highlights), ownerScope);
        // Per-record locked read-modify-write; see pbpBackupWriteHighlights.
        // Empty input writes nothing and still reports applied, as the flat set did.
        await pbpBackupWriteHighlights(cleaned, ownerScope, async () => {
          if (pbpBackupOwnerScope(await getOwner()) !== ownerScope) throw new Error("highlight owner mismatch");
        });
        result.highlights = "applied";
      }
    } catch (error) {
      // The UI only ever sees "failed", which reads the same for a quota
      // error, a missing Web Lock and an owner mismatch. Leave the platform
      // reason in the console -- name and message only, never highlight text,
      // page URLs or the account.
      console.warn("[backup] highlight import failed:", error && error.name, error && error.message);
      highlightsSkipped = true;
      result.highlights = "failed";
    }
  }

  if (selected.vocabulary && prepared.vocabulary) {
    const scope = pbpBackupOwnerScope(prepared.vocabulary.owner);
    const importer = importVocabulary || pbpVocabImportRecords;
    try {
      if (!scope || pbpBackupOwnerScope(await getOwner()) !== scope) throw new Error("vocabulary owner mismatch");
      for (let offset = 0; offset < prepared.vocabulary.records.length; offset += 100) {
        if (pbpBackupOwnerScope(await getOwner()) !== scope) throw new Error("vocabulary owner mismatch");
        const batch = prepared.vocabulary.records.slice(offset, offset + 100);
        const imported = await importer(scope, batch, 100);
        if (!imported || !imported.ok) throw new Error("vocabulary import failed");
        result.vocabularyApplied += imported.processed;
        if (onVocabularyProgress) onVocabularyProgress(result.vocabularyApplied, prepared.vocabulary.records.length);
        if (pbpBackupOwnerScope(await getOwner()) !== scope) throw new Error("vocabulary owner mismatch");
      }
      result.vocabulary = "applied";
    } catch (error) {
      // Same reason as the highlight sibling above: an IndexedDB failure and
      // a mid-import account switch both surface as "failed". Name and
      // message only -- never the words themselves or the owner scope.
      console.warn("[backup] vocabulary import failed:", error && error.name, error && error.message);
      result.vocabulary = "failed";
    }
    if (result.vocabularyApplied || result.vocabulary === "applied") {
      try { await pbpVocabAll(scope); } catch (_) {}
    }
  }

  try {
    const local = await chrome.storage.local.get(["optSyncEnabled", ...PBP_LARGE_FALLBACK_KEYS]);
    if (local.optSyncEnabled === true) {
      const fallbacks = new Set(pbpBackupLocalFallbackFields(prepared, {
        enabled: true,
        localFallbackKeys: pbpDetectLargeLocalFallbacks(local),
      }, Object.fromEntries(Object.entries(selected)
        .map(([key, enabled]) => [key, { enabled: !!enabled }]))));
      if (result.settings === "applied" &&
          [...fallbacks].some((key) => key !== "savedThemes")) {
        result.settings = "local-only";
      }
      if (result.themes === "applied" && fallbacks.has("savedThemes")) {
        result.themes = "local-only";
      }
    }
  } catch (_) {}

  result.highlightsSkipped = highlightsSkipped;
  result.statusKey = ["failed", "local-only"].includes(result.settings) ||
    ["failed", "local-only"].includes(result.themes) ||
    result.highlights === "failed" || result.vocabulary === "failed" ||
    result.secrets === "failed"
    ? "importPartial" : "importedReload";
  return result;
}

function setupBackup({ exportableKeys, saveOverlayWithFallback, loadThemes, beforeExport, beforeApply, afterApply }) {
  let selectionToken = 0;
  let selectionText = "";
  let busyToken = null;
  const secretsToggle = $id("opt-backup-include-secrets");
  const secretsWarning = $id("backup-secrets-warning");
  const syncSecretsWarning = () => {
    if (secretsWarning) secretsWarning.hidden = secretsToggle?.checked !== true;
  };
  secretsToggle?.addEventListener("change", syncSecretsWarning);
  syncSecretsWarning();
  const readOwner = async () => {
    const secret = await pbpReadSettingsWithSecrets({ pinboardToken: "" });
    return pbpPinboardAccountFromToken(secret.pinboardToken);
  };
  const setPreviewText = (id, text) => {
    const element = $id(id);
    if (element) element.textContent = text;
  };
  const setApplyBusy = (token, busy) => {
    if (busy) busyToken = token;
    else if (busyToken !== token) return;
    else busyToken = null;
    const apply = $id("backup-import-apply");
    const importButton = $id("import-settings");
    if (importButton) importButton.disabled = busy;
    if (apply) apply.disabled = busy;
  };
  const resetBusyForSelection = () => {
    busyToken = null;
    const apply = $id("backup-import-apply");
    const importButton = $id("import-settings");
    if (importButton) importButton.disabled = false;
    if (apply) apply.disabled = true;
  };
  const renderPreview = (preview) => {
    const metadata = preview.metadata || {};
    setPreviewText("backup-preview-meta", t(
      "backupPreviewMeta",
      String(preview.schemaVersion),
      metadata.createdAt || t("backupPreviewUnknown"),
      metadata.extensionVersion || t("backupPreviewUnknown")
    ));
    setPreviewText("backup-preview-settings", t("backupPreviewSettings", String(preview.settingsCount)));
    setPreviewText("backup-preview-themes", t("backupPreviewThemes", String(preview.themeCount)));
    setPreviewText("backup-preview-highlights", t(
      "backupPreviewHighlights",
      String(preview.highlightPages),
      String(preview.highlightEntries),
      preview.highlightsOwner || t("backupPreviewLegacyOwner")
    ));
    setPreviewText("backup-preview-vocabulary", t(
      "backupPreviewVocabulary",
      String(preview.vocabularyCount),
      preview.vocabularyOwner || t("backupPreviewNone")
    ));
    setPreviewText("backup-preview-secrets", t("backupPreviewSecrets", String(preview.secretCount)));
    const languages = Object.entries(preview.languages)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([language, count]) => `${language}: ${count}`)
      .join(", ");
    setPreviewText("backup-preview-languages", languages || t("backupPreviewNone"));
    const warnings = [];
    if (preview.secretCount) warnings.push(t("backupPreviewSecretsWarning"));
    if (preview.ownerMismatch) warnings.push(t("backupPreviewOwnerMismatch"));
    if (preview.highlightOwnerMismatch) warnings.push(t("backupPreviewHighlightOwnerMismatch"));
    if (preview.syncWarning) warnings.push(t("backupPreviewSyncWarning"));
    if (preview.localFallbackKeys.length) {
      warnings.push(t("backupPreviewLocalWarning", preview.localFallbackKeys
        .map((key) => t(pbpLargeFallbackFieldLabel(key)))
        .join(", ")));
    }
    setPreviewText("backup-preview-warning", warnings.join(" "));
    const sectionIds = {
      settings: "backup-section-settings",
      themes: "backup-section-themes",
      highlights: "backup-section-highlights",
      vocabulary: "backup-section-vocabulary",
      secrets: "backup-section-secrets",
    };
    Object.entries(sectionIds).forEach(([key, id]) => {
      const checkbox = $id(id);
      if (!checkbox) return;
      checkbox.disabled = !preview.sections[key].enabled;
      // Credentials are the one section that stays unchecked when available:
      // overwriting the working keys on this device has to be a deliberate act,
      // not the default that "Apply selected" happens to carry along.
      checkbox.checked = key === "secrets" ? false : preview.sections[key].enabled;
    });
    const apply = $id("backup-import-apply");
    if (apply) apply.disabled = !Object.values(preview.sections).some((section) => section.enabled);
    const host = $id("backup-import-preview");
    if (host) host.hidden = false;
    return warnings.length;
  };
  const renderResult = (result) => {
    const statusKeys = {
      applied: "backupStatusApplied",
      skipped: "backupStatusSkipped",
      "local-only": "backupStatusLocalOnly",
      failed: "backupStatusFailed",
    };
    ["settings", "themes", "highlights", "vocabulary", "secrets"].forEach((key) => {
      setPreviewText(`backup-result-${key}`, t(statusKeys[result[key]] || "backupStatusFailed"));
    });
    const resultHost = $id("backup-import-result");
    if (resultHost) resultHost.hidden = false;
    const status = $id("import-status");
    const resultKey = pbpBackupImportResultKey(result);
    setStatusIcon(status, resultKey === "backupImportComplete", t(
      resultKey,
      String(result.vocabularyApplied || 0)
    ));
  };

  $id("import-settings").addEventListener("click", () => $id("import-settings-file").click());

  const runExport = async () => {
    try {
      // The form auto-saves on a debounce. Flush it before reading storage so
      // clicking Export immediately after an edit cannot create a stale backup.
      if (beforeExport && (await beforeExport()) === false) return;
      // Opt-in per export, never remembered: reading the secret fields at all
      // is gated on the checkbox being ticked right now. Re-read here rather
      // than trusting what the click handler saw, so a box unticked while the
      // confirmation was open still produces a credential-free file.
      const includeSecrets = $id("opt-backup-include-secrets")?.checked === true;
      const raw = await pbpReadSettingsWithSecrets(
        includeSecrets ? Object.keys(SETTINGS_DEFAULTS) : exportableKeys);
      const includeHighlightsEl = $id("opt-backup-include-highlights");
      if (includeHighlightsEl) raw.backupIncludeHighlights = !!includeHighlightsEl.checked;
      const includeVocabulary = $id("opt-backup-include-vocabulary")?.checked !== false;
      // Read overlay from sync OR local fallback (preserve user data either
      // way — including a legacy oversize overlay, which is why there is no
      // size assert here: a backup that refuses to carry the user's own data
      // would make Export permanently fail for them).
      const localOverlay = await chrome.storage.local.get("customOverlayCSS_localFallback");
      let overlay = "";
      if (typeof localOverlay.customOverlayCSS_localFallback === "string") {
        overlay = localOverlay.customOverlayCSS_localFallback;
      } else {
        overlay = await syncGetLarge("customOverlayCSS", "");
      }
      const savedThemesData = await syncGetLarge("savedThemes", []);
      let highlights = null;
      let highlightsOwner = "";
      let vocabulary = null;
      let owner = "";
      let ownerRead = false;
      if (raw.backupIncludeHighlights !== false || includeVocabulary) {
        try { owner = pbpCanonicalBackupOwner(await readOwner()); ownerRead = true; }
        catch (e) { console.warn("[export] account read failed:", e && e.name, e && e.message); }
      }
      // Both account-scoped sections re-check the live account after their own
      // storage round trip. Fail closed either way -- `owner` filters the items
      // AND labels the file -- but only call it a switch when two successful
      // reads actually disagree: a read that threw (or a first read that threw
      // and left "" behind) is an account that could not be established, and
      // "the account changed" would send whoever reads the log looking for a
      // switch that never happened.
      const confirmOwner = async () => {
        let live;
        try { live = pbpCanonicalBackupOwner(await readOwner()); }
        catch (e) {
          console.warn("[export] account re-read failed:", e && e.name, e && e.message);
          throw new Error("Pinboard account could not be re-read during backup");
        }
        if (live === owner) return;
        throw new Error(ownerRead
          ? "Pinboard account changed during backup"
          : "Pinboard account could not be read during backup");
      };
      let highlightsOwnerDropped = false;
      if (raw.backupIncludeHighlights !== false) {
        const allLocal = await chrome.storage.local.get(null);
        // get(null) deserializes the ENTIRE local area (jina_md_ page caches
        // included) -- a real round trip another tab can switch accounts
        // across. The same re-check the vocabulary branch below makes after
        // its own read: `owner` both filters the items and becomes the file's
        // _highlightsOwner label, so a stale one ships the previous account's
        // label on this account's download.
        await confirmOwner();
        // Same owner scoping the vocabulary branch below applies: the file is
        // labelled with this account, so it may only carry this account's (and
        // ownerless) items.
        highlights = pbpBuildHighlightBackup(allLocal, pbpBackupOwnerScope(owner));
        if (highlights) highlightsOwner = owner;
        // Without a readable account that filter keeps ownerless items only, so
        // every account-owned highlight on this device misses the file. Ticking
        // "include highlights" and getting none of them back is the one outcome
        // the user cannot see in the file, so it is said out loud here -- the
        // vocabulary side has said it since backupVocabOwnerMissing landed.
        highlightsOwnerDropped = !owner && pbpHighlightBackupHasOwnedItems(allLocal);
      }
      const exportNote = $id("backup-export-note");
      // Both account-scoped sections share this one line, so it names whichever
      // combination was actually left out rather than claiming "the other
      // selected data was exported" over a section that was also dropped.
      let exportNoteKey = "";
      if (includeVocabulary) {
        if (!owner) {
          exportNoteKey = highlightsOwnerDropped
            ? "backupHighlightsVocabOwnerMissing"
            : "backupVocabOwnerMissing";
        } else {
          const scope = pbpDictOwnerScope(owner);
          const records = await pbpVocabAll(scope);
          await confirmOwner();
          vocabulary = { owner, records };
        }
      }
      if (!exportNoteKey && highlightsOwnerDropped) exportNoteKey = "backupHighlightsOwnerMissing";
      if (exportNote) {
        if (exportNoteKey) setStatusIcon(exportNote, false, t(exportNoteKey));
        else exportNote.textContent = "";
      }
      const exportData = pbpBuildBackupSnapshot(raw, {
        overlay,
        savedThemes: savedThemesData,
        highlights,
        highlightsOwner,
        vocabulary,
        includeSecrets,
      });
      // The shared belt strips known nested credentials. Registry metadata
      // removes any additional secret field introduced by a future target.
      if (!includeSecrets && exportData.exportTargets && typeof PBP_EXPORT_TARGETS !== "undefined") {
        for (const [tid, cfg] of Object.entries(exportData.exportTargets)) {
          const row = PBP_EXPORT_TARGETS[tid];
          ((row && row.settings) || []).forEach((setting) => {
            if (setting.type === "secret" || setting.secret === true) delete cfg[setting.key];
          });
        }
      }
      // Generated backups must pass the exact same contract as imports; never
      // hand the user a file this release would reject on restore.
      pbpPreflightBackupPayload(exportData, exportableKeys);
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = pbpBackupFilename(new Date(), includeSecrets); a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("[export] failed", err);
      const status = $id("import-status");
      setStatusIcon(status, false, t("optSaveFailed"));
    }
  };

  // A credential-bearing export is the one action here that writes usable
  // secrets to disk, so it gets a stop-and-read step naming what lands in the
  // file. An ordinary export needs no confirmation and gets none.
  $id("export-settings").addEventListener("click", () => {
    if ($id("opt-backup-include-secrets")?.checked !== true) { runExport(); return; }
    showConfirmPopover($id("export-settings"), {
      msg: t("backupSecretsExportConfirm"),
      yesText: t("backupSecretsExportYes"),
      noText: t("cancel"),
      onConfirm: runExport,
    });
  });

  $id("import-settings-file").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const token = ++selectionToken;
    selectionText = "";
    resetBusyForSelection();
    const previewHost = $id("backup-import-preview");
    if (previewHost) previewHost.hidden = true;
    const resultHost = $id("backup-import-result");
    if (resultHost) resultHost.hidden = true;
    try {
      const text = await file.text();
      if (token !== selectionToken) return;
      const data = JSON.parse(text);
      const prepared = pbpPreflightBackupPayload(data, exportableKeys);
      const [currentOwner, local] = await Promise.all([
        readOwner().catch(() => ""),
        chrome.storage.local.get(["optSyncEnabled", ...PBP_LARGE_FALLBACK_KEYS]).catch(() => ({})),
      ]);
      if (token !== selectionToken) return;
      selectionText = text;
      const warningCount = renderPreview(pbpBuildBackupPreview(prepared, currentOwner, {
        enabled: local.optSyncEnabled === true,
        localFallbackKeys: pbpDetectLargeLocalFallbacks(local),
      }));
      const status = $id("import-status");
      if (warningCount === 0) {
        setStatusIcon(status, true, t("backupPreviewReady"));
      } else if (status) {
        status.textContent = "";
      }
    } catch (err) {
      console.error("[import] failed", err);
      if (token !== selectionToken) return;
      const status = $id("import-status");
      setStatusIcon(status, false, t("importInvalid"));
    }
    e.target.value = "";
  });

  $id("backup-import-apply")?.addEventListener("click", async () => {
    const token = selectionToken;
    const text = selectionText;
    if (!text) return;
    let applyPaused = false;
    setApplyBusy(token, true);
    try {
      const data = JSON.parse(text);
      pbpPreflightBackupPayload(data, exportableKeys);
      if (token !== selectionToken) return;
      if (beforeApply) { await beforeApply(); applyPaused = true; }
      if (token !== selectionToken) return;
      const selected = {};
      ["settings", "themes", "highlights", "vocabulary", "secrets"].forEach((key) => {
        const checkbox = $id(`backup-section-${key}`);
        selected[key] = !!checkbox && checkbox.checked && !checkbox.disabled;
      });
      const applied = await pbpApplyBackupPayload(data, {
        exportableKeys,
        saveOverlayWithFallback,
        loadThemes,
        sections: selected,
        onVocabularyProgress: (done, total) => {
          setPreviewText("backup-import-progress", t(
            "backupImportProgress",
            String(done),
            String(total)
          ));
        },
      });
      if (token === selectionToken) renderResult(applied);
    } catch (err) {
      console.error("[import] failed", err);
      if (token === selectionToken) {
        setStatusIcon($id("import-status"), false, t("importApplyFailed"));
      }
    } finally {
      if (applyPaused && afterApply) {
        try { await afterApply(); } catch (_) {}
      }
      setApplyBusy(token, false);
    }
  });
}
