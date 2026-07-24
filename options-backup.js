// ============================================================
// Options page — settings export/import (backup file).
// Exposes setupBackup() with storage helpers and optional save-queue hooks.
// Schema-version aware: v2 backups use customOverlayCSS, v1 uses customCSS.
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
  let customCSS;
  let customOverlayCSS;
  // Type checks only — no size gate. An oversize overlay from a legacy backup
  // is preserved through saveOverlayWithFallback's local-fallback path; a
  // rejection here would make the whole otherwise-valid backup unimportable.
  if (schemaVersion === 1 && Object.prototype.hasOwnProperty.call(data, "customCSS")) {
    if (typeof data.customCSS !== "string") throw pbpBackupValueError("customCSS");
    customCSS = data.customCSS;
  }
  if (schemaVersion === 2 && Object.prototype.hasOwnProperty.call(data, "customOverlayCSS")) {
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
  return {
    schemaVersion,
    safeData,
    customCSS,
    customOverlayCSS,
    importedThemes,
    highlights: data._highlights,
    highlightsOwner: data._highlightsOwner,
  };
}

// Applies a parsed backup JSON blob from a file import to storage:
// whitelist-filters to exportableKeys, merges exportTargets per-target
// (protecting live secret fields the backup never carried), persists via
// persistSettings, migrates v1->v2 CSS if needed, and imports savedThemes.
// Returns { statusKey, highlightsSkipped }: statusKey is a t() key
// ("importedReload" | "importPartial"); highlightsSkipped=true means the
// backup carried highlights this device refused (owner mismatch or logged
// out) — callers MUST surface that, or the user deletes the backup believing
// their notes were restored. Throws on a genuine persist failure.
async function pbpApplyBackupPayload(data, { exportableKeys, saveOverlayWithFallback, loadThemes }) {
  const prepared = pbpPreflightBackupPayload(data, exportableKeys);
  const { schemaVersion, safeData, customCSS, customOverlayCSS, importedThemes } = prepared;
  // A v1 restore may need the preset registry to derive its v2 overlay. Load
  // that dependency before the first storage write so a script/load failure
  // cannot leave an otherwise valid settings batch half-applied.
  if (schemaVersion < 2 && loadThemes) await loadThemes();
  if (safeData.exportTargets) {
    // Export strips nested secrets, so a raw key-set here would
    // blast away live tokens (github PAT, webhook Authorization) with the
    // secret-less backup copy. Merge per target onto what's already stored
    // so untouched secret fields survive; only the backed-up (non-secret)
    // fields actually update.
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
  // Anything that only reached this device's local storage (sync quota, or an
  // oversize overlay) must downgrade the status to importPartial — reporting
  // a clean success makes a multi-device user delete the backup file
  // believing the restore synced everywhere.
  let fellBackToLocal = !!importRes.fellBackToLocal;

  if (schemaVersion >= 2) {
    if (customOverlayCSS !== undefined) {
      const overlayRes = await saveOverlayWithFallback(customOverlayCSS);
      fellBackToLocal = fellBackToLocal || !!(overlayRes && overlayRes.fellBackToLocal);
    }
  } else {
    // v1 → v2: detect preset match, derive overlay
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
      const presetCSS = preset ? preset.css : "";
      const variants = adaptiveMap[resolvedKey] || [];
      const allowed = [presetCSS, ...variants.map(k => themes[k]?.css || "")];
      newOverlay = allowed.some(c => c && c.trim() === customCSS.trim()) ? "" : customCSS;
    }
    await (await getSettingsStorage()).set({ themePresetKey: resolvedKey || "" });
    const overlayRes = await saveOverlayWithFallback(newOverlay);
    fellBackToLocal = fellBackToLocal || !!(overlayRes && overlayRes.fellBackToLocal);
  }

  let themesStatusKey = fellBackToLocal ? "importPartial" : "importedReload";
  if (importedThemes !== undefined) {
    try {
      await syncSetLarge("savedThemes", importedThemes);
    } catch (e) {
      const key = importThemesResult(e);
      if (key === null) throw e; // null sentinel = non-quota failure -> caller's catch handles it
      themesStatusKey = key; // "importPartial": data preserved to local by syncSetLarge fallback
    }
  }
  let highlightsSkipped = false;
  if (prepared.highlights) {
    // Cross-account guard: refuse to merge one account's reading notes into a
    // device logged into a different Pinboard account. pbp_hl_<url> keys have no
    // account dimension, so this owner check is the only barrier. Legacy backups
    // (no owner) restores remain backward compatible; a named owner requires
    // the same currently authenticated account, including on logged-out devices.
    let currentAccount = "";
    let accountResolved = false;
    try {
      const sec = await pbpReadSettingsWithSecrets({ pinboardToken: "" });
      currentAccount = pbpPinboardAccountFromToken(sec.pinboardToken);
      accountResolved = true;
    } catch (_) {}
    if (pbpHighlightBackupOwnerAllowed(prepared.highlightsOwner, currentAccount, accountResolved)) {
      const cleanedHighlights = pbpCleanHighlightBackup(prepared.highlights);
      if (Object.keys(cleanedHighlights).length) await chrome.storage.local.set(cleanedHighlights);
    } else {
      highlightsSkipped = true;
    }
  }
  return { statusKey: themesStatusKey, highlightsSkipped };
}

function setupBackup({ exportableKeys, saveOverlayWithFallback, loadThemes, beforeExport, beforeApply, afterApply }) {
  $id("import-settings").addEventListener("click", () => $id("import-settings-file").click());

  $id("export-settings").addEventListener("click", async () => {
    try {
      // The form auto-saves on a debounce. Flush it before reading storage so
      // clicking Export immediately after an edit cannot create a stale backup.
      if (beforeExport && (await beforeExport()) === false) return;
      const raw = await pbpReadSettingsWithSecrets(exportableKeys);
      const includeHighlightsEl = $id("opt-backup-include-highlights");
      if (includeHighlightsEl) raw.backupIncludeHighlights = !!includeHighlightsEl.checked;
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
      if (raw.backupIncludeHighlights !== false) {
        const allLocal = await chrome.storage.local.get(null);
        highlights = pbpBuildHighlightBackup(allLocal);
        if (highlights) {
          // Tag with the exporting Pinboard account (non-secret username) so a
          // restore onto a different account can refuse to merge these notes.
          // Read the token directly — exportableKeys excludes secrets.
          const sec = await pbpReadSettingsWithSecrets({ pinboardToken: "" });
          highlightsOwner = pbpPinboardAccountFromToken(sec.pinboardToken);
        }
      }
      const exportData = pbpBuildBackupSnapshot(raw, {
        overlay,
        savedThemes: savedThemesData,
        highlights,
        highlightsOwner,
      });
      // The shared belt strips known nested credentials. Registry metadata
      // removes any additional secret field introduced by a future target.
      if (exportData.exportTargets && typeof PBP_EXPORT_TARGETS !== "undefined") {
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
      a.href = url; a.download = "Pinboard Bookmark Enhanced settings backup.json"; a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("[export] failed", err);
      const status = $id("import-status");
      setStatusIcon(status, false, t("optSaveFailed"));
      status.style.color = "#c00";
      setTimeout(() => { status.textContent = ""; status.style.color = ""; }, 3000);
    }
  });

  $id("import-settings-file").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    let validated = false;
    let applyPaused = false;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      // Validate before pausing/draining UI saves, and again inside apply as a
      // defense against accidental future bypasses.
      pbpPreflightBackupPayload(data, exportableKeys);
      validated = true;
      if (beforeApply) { await beforeApply(); applyPaused = true; }
      const applied = await pbpApplyBackupPayload(data, { exportableKeys, saveOverlayWithFallback, loadThemes });
      const status = $id("import-status");
      if (applied.highlightsSkipped) {
        // Never report a clean success when the backup's highlights were
        // refused (owner mismatch / logged out): the user can log into the
        // matching account and simply import the same file again.
        setStatusIcon(status, false, t("importHighlightsSkipped"));
        setTimeout(() => { status.textContent = ""; }, 8000);
      } else {
        setStatusIcon(status, applied.statusKey === "importPartial" ? false : true, t(applied.statusKey));
        setTimeout(() => { status.textContent = ""; }, 3000);
      }
    } catch (err) {
      console.error("[import] failed", err);
      const status = $id("import-status");
      setStatusIcon(status, false, t(validated ? "importApplyFailed" : "importInvalid"));
      status.style.color = "#c00";
      setTimeout(() => { status.textContent = ""; status.style.color = ""; }, 3000);
    } finally {
      if (applyPaused && afterApply) {
        try { afterApply(); } catch (_) {}
      }
    }
    e.target.value = "";
  });
}
