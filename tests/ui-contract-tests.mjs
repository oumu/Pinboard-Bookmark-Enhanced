import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";

const root = resolve(import.meta.dirname, "..");
const read = (file) => readFileSync(resolve(root, file), "utf8");
const fail = [];
const check = (ok, msg) => { if (!ok) fail.push(msg); };
const extensionIdFromKey = (key) => {
  const hex = createHash("sha256").update(Buffer.from(key, "base64")).digest("hex").slice(0, 32);
  return [...hex].map((char) => String.fromCharCode(97 + Number.parseInt(char, 16))).join("");
};

const popupHtml = read("popup.html");
const manifest = JSON.parse(read("manifest.json"));
const backgroundJs = read("background.js");
const optionsHtml = read("options.html");
const releaseSh = read("scripts/release.sh");
const zipInstallSmoke = read("scripts/zip-install-smoke.mjs");
const privacyMd = read("docs/privacy.md");
check(!optionsHtml.includes('Requires "Access all websites" permission'), "options Batch hint still advertises the retired all-sites request");
check(optionsHtml.includes('data-i18n="secBackupRestore">Backup &amp; Restore</h2>'),
  "options.html: backup section fallback still advertises sync");
const mdHtml = read("md-preview.html");
const mdPreviewJs = read("md-preview.js");
const mdExportSendJs = read("md-export-send.js");
const sharedJs = read("shared.js");
const jinaJs = read("jina.js");
const mdAiCoreJs = read("md-ai-core.js");
const mdAskJs = read("md-ask.js");
const mdHighlightJs = read("md-highlight.js");
const mdSkimJs = read("md-skim.js");
const mdTranslateJs = read("md-translate.js");
const mdReaderJsSource = read("md-reader.js");
const mdCss = read("md-preview.css");
const popupJs = read("popup.js");
const popupAiJs = read("popup-ai.js");
const popupBatchJs = read("popup-batch.js");
const popupCss = read("popup.css");
const optionsConnectivityJs = read("options-connectivity.js");
const optionsCss = read("options.css");
const optionsJs = read("options.js");
const optionsBackupJs = read("options-backup.js");
const optionsVocabJs = read("options-vocab.js");
const vocabGdriveJs = read("vocab-gdrive.js");
const mdDictJs = read("md-dict.js");
const vocabStore = readFileSync("vocab-store.js", "utf8");
const mdDict = readFileSync("md-dict.js", "utf8");
const optionsThemeEarlyJs = read("options-theme-early.js");
const popupTagsJs = read("popup-tags.js");

{
  // Bounded by the next declaration rather than by the export handler, which
  // has moved down the file before and would silently widen this slice.
  const renderPreview = optionsBackupJs.slice(
    optionsBackupJs.indexOf("const renderPreview ="),
    optionsBackupJs.indexOf("const renderResult =", optionsBackupJs.indexOf("const renderPreview =")),
  );
  check(renderPreview.includes("pbpLargeFallbackFieldLabel(key)") &&
    !renderPreview.includes('customTagPrompt: "labelTagPrompt"') &&
    !renderPreview.includes('savedThemes: "labelSavedThemes"'),
    "options-backup.js: fallback field labels drifted from the shared mapping");
  check(renderPreview.includes('checkbox.checked = key === "secrets" ? false :'),
    "options-backup.js: the credential import section no longer defaults to unchecked");
}

// Writing usable secrets to disk is gated on a stop-and-read step; an ordinary
// export must stay one click.
check(/checked !== true\) \{ runExport\(\); return; \}/.test(optionsBackupJs) &&
  optionsBackupJs.includes('showConfirmPopover($id("export-settings")') &&
  optionsBackupJs.includes('msg: t("backupSecretsExportConfirm")'),
  "options-backup.js: the credential export lost its plaintext-risk confirmation");

check(!existsSync(resolve(root, "webdav.js")), "webdav.js still exists");
check(!optionsHtml.includes('id="opt-webdav') &&
  !optionsHtml.includes('src="webdav.js"'), "options.html still exposes WebDAV");
check(!optionsJs.toLowerCase().includes("webdav"), "options.js still owns WebDAV behavior");
check(!optionsCss.toLowerCase().includes("webdav"), "options.css still ships WebDAV styles");
check(manifest.permissions.includes("alarms"), "shared alarms permission was removed");
check(manifest.optional_host_permissions.join(",") === "*://*/*",
  "shared optional-host declaration changed");
check(extensionIdFromKey(manifest.key || "") === "feoognahlmfmbllpmgailahcnjppiegb",
  "manifest.json: source build no longer has the verified development extension ID");
check(manifest.optional_permissions?.includes("identity") &&
  manifest.oauth2?.client_id ===
    "1002273768498-c6d7mdsd58dfoth1khb21uocmq8kveg5.apps.googleusercontent.com" &&
  manifest.oauth2?.scopes?.join(",") === "https://www.googleapis.com/auth/drive.appdata",
  "manifest.json: development Drive OAuth capability is incomplete or over-broad");
check(releaseSh.includes("DEV_EXTENSION_ID = 'feoognahlmfmbllpmgailahcnjppiegb'") &&
  releaseSh.includes("DEV_OAUTH_CLIENT_ID = '1002273768498-c6d7mdsd58dfoth1khb21uocmq8kveg5.apps.googleusercontent.com'") &&
  releaseSh.includes("RELEASE_OAUTH_CLIENT_ID = '1002273768498-uh3bdcaqsrl1rt7dlnrfducebdeg6h63.apps.googleusercontent.com'") &&
  releaseSh.includes("manifest['key'] = RELEASE_EXTENSION_KEY") &&
  releaseSh.includes("manifest['oauth2']['client_id'] = RELEASE_OAUTH_CLIENT_ID"),
  "scripts/release.sh: source identity validation or production OAuth replacement is missing");
check(zipInstallSmoke.includes("const EXPECTED_EXTENSION_ID = 'pnjndmjhljjbdlbejeenkepdalokfooh';") &&
  zipInstallSmoke.includes("const EXPECTED_OAUTH_CLIENT_ID = '1002273768498-uh3bdcaqsrl1rt7dlnrfducebdeg6h63.apps.googleusercontent.com';") &&
  zipInstallSmoke.includes("'vocab-store.js'") &&
  zipInstallSmoke.includes("'vocab-gdrive.js'") &&
  zipInstallSmoke.includes("hasDriveOAuthCapability(packagedManifest)") &&
  zipInstallSmoke.includes("simulatedActiveDriveManifest") &&
  zipInstallSmoke.includes("OAuth-inactive manifest exposed Google Drive actions") &&
  zipInstallSmoke.includes("OAuth-active manifest did not expose Connect Google Drive"),
  "zip-install-smoke.mjs: release ID, vocabulary runtime, or both Drive OAuth UI states are not verified");
{
  const storage = privacyMd.slice(
    privacyMd.indexOf("## Data storage"),
    privacyMd.indexOf("## Chrome Web Store data categories")
  );
  const rows = storage.split("\n").filter((line) => line.startsWith("|"));
  const local = rows.find((line) => line.includes("Vocabulary sync runtime/account state"));
  const pending = rows.find((line) => line.includes("Pending vocabulary upload data"));
  const remote = rows.find((line) => line.includes("Convergence metadata sent to Google Drive"));
  check(local && pending && remote &&
    !/(version vector|dot|deletion marker|outbox|pending batch)/i.test(local) &&
    ["record key", "version vector", "dot", "deletion marker"].every((field) =>
      remote.toLowerCase().includes(field)) &&
    !/\|\s*No\s*\|\s*$/.test(remote),
  "privacy.md: local Drive state is conflated with uploaded convergence metadata");

  const driveRequest = privacyMd.slice(
    privacyMd.indexOf("16. **Google Drive API**"),
    privacyMd.indexOf("\n\nFor configured AI", privacyMd.indexOf("16. **Google Drive API**"))
  ).toLowerCase();
  const driveThirdParty = privacyMd.slice(
    privacyMd.indexOf("- **Google Drive**"),
    privacyMd.indexOf("\n-", privacyMd.indexOf("- **Google Drive**") + 1)
  ).toLowerCase();
  check(["record keys", "version vectors", "dots", "deletion markers"].every((field) =>
    driveRequest.includes(field) && driveThirdParty.includes(field)),
  "privacy.md: Google Drive request or third-party disclosure omits convergence fields");
}
check(!backgroundJs.includes('"webdav.js"'), "background.js still imports webdav.js");
check(backgroundJs.includes('"vocab-store.js"') && backgroundJs.includes('"vocab-gdrive.js"') &&
  backgroundJs.indexOf('"vocab-store.js"') < backgroundJs.indexOf('"vocab-gdrive.js"'),
  "background.js does not load the vocabulary sync dependencies in order");
check(vocabGdriveJs.includes("function pbpCreateVocabDriveSyncRunner("),
  "vocab-gdrive.js is missing the serialized sync runner");
check(backgroundJs.includes("async function pbpCleanupRemovedWebdav("),
  "background.js is missing the legacy cleanup migration");
{
  const cleanup = backgroundJs.slice(
    backgroundJs.indexOf("const PBP_WEBDAV_REMOVAL_SESSION_KEY"),
    backgroundJs.indexOf("pbpCleanupRemovedWebdav().catch")
  );
  const alarmAt = cleanup.indexOf('alarms.clear("webdav-push")');
  const localAt = cleanup.indexOf("local.remove(PBP_WEBDAV_REMOVAL_LOCAL_KEYS)");
  const syncAt = cleanup.indexOf("sync.remove(PBP_WEBDAV_REMOVAL_SYNC_KEYS)");
  const markAt = cleanup.indexOf("session.set(");
  check(alarmAt >= 0 && localAt > alarmAt && syncAt > localAt && markAt > syncAt &&
    !/\bfetch\s*\(|permissions\.request|https?:\/\//.test(cleanup),
    "background.js: legacy WebDAV cleanup is not local-only or marks completion too early");
}


{
  const readyAt = mdPreviewJs.indexOf("const pbpDeferredScriptsReady");
  const renderedAt = mdPreviewJs.indexOf('document.dispatchEvent(new CustomEvent("pbp:rendered"');
  const awaitAt = mdPreviewJs.lastIndexOf("await pbpDeferredScriptsReady", renderedAt);
  const readyGate = mdPreviewJs.slice(readyAt, readyAt + 400);
  check(readyAt >= 0 && awaitAt > readyAt && renderedAt > awaitAt &&
    readyGate.includes('document.readyState === "complete"') &&
    readyGate.includes("DOMContentLoaded"),
    "md-preview.js: pbp:rendered can fire before later defer scripts register their listeners");
}
{
  const targetLink = mdTranslateJs.slice(
    mdTranslateJs.indexOf('tgtLink.className = "tr-link"'),
    mdTranslateJs.indexOf("// Cost transparency")
  );
  check(targetLink.includes('pbpOpenOptionsTab("reader")') && !targetLink.includes("openOptionsPage("),
    "md-translate.js: target-language link does not open the Reader settings tab");
}

for (const id of ["vocab-search", "vocab-group-filter", "vocab-sort", "vocab-select-all",
  "vocab-invert-selection", "vocab-batch-toolbar", "vocab-group-input", "vocab-add-group",
  "vocab-batch-delete", "vocab-no-results", "vocab-load-more", "vocab-list"]) {
  check(optionsHtml.includes(`id="${id}"`), `options.html: scalable vocabulary control #${id} is missing`);
}
check((optionsHtml.match(/<details class="vocab-disclosure"/g) || []).length === 5 &&
  optionsHtml.indexOf('id="vocab-search"') < optionsHtml.indexOf('id="dict-anki-deck"'),
  "options.html: vocabulary management is not first or secondary settings are not collapsed");
const vocabDisclosureKeys = [...optionsHtml.matchAll(
  /<details class="vocab-disclosure" data-acc-key="([^"]+)"/g
)].map((match) => match[1]);
check(vocabDisclosureKeys.join(",") ===
  "vocab-reading,vocab-google-drive,vocab-learning,vocab-ecdict-pack,vocab-dictionary-pack",
  "options.html: vocabulary settings disclosures lack stable pp-acc keys");
check(optionsJs.includes('querySelectorAll("details[data-acc-key]")') &&
  /addEventListener\("toggle",[\s\S]{0,500}pbpAccSet\(det\.dataset\.accKey, det\.open\)/.test(optionsJs),
  "options.js: native details state is not restored and persisted through pp-acc");
check(/vocab:\s*\{[\s\S]{0,260}"dict-echo-enabled": true/.test(optionsJs) &&
  !/<details class="vocab-card"[^>]*data-acc-key=/.test(optionsHtml),
  "options: vocab reset is not on or per-word cards were made persistent");
check(["vocab-group-filter", "vocab-sort", "vocab-group-input"].every((id) =>
  new RegExp(`id="${id}"[^>]*data-no-autosave|data-no-autosave[^>]*id="${id}"`).test(optionsHtml)) &&
  optionsJs.includes(":not([data-no-autosave])"),
  "options: vocabulary view controls leak into settings auto-save");
check(optionsVocabJs.includes("PBP_VOCAB_RENDER_BATCH = 100") &&
  optionsVocabJs.includes("pbpVocabFilterSort") && optionsVocabJs.includes("pbpVocabSelectRange") &&
  optionsVocabJs.includes('showConfirmPopover(button') && !optionsVocabJs.includes("window.confirm"),
  "options-vocab.js: scalable render/selection or safe batch-delete confirmation contract is missing");
check(optionsVocabJs.includes('.normalize("NFC")') && optionsVocabJs.includes('.toLowerCase()') &&
  optionsVocabJs.includes('.replace(/i\\u0307/g, "i")') &&
  optionsVocabJs.includes('.replace(/ß/g, "ss")') && optionsVocabJs.includes('.replace(/ς/g, "σ")') &&
  !optionsVocabJs.includes("toLocaleLowerCase") && !optionsVocabJs.includes("\\p{M}"),
  "options-vocab.js: vocabulary search does not use the narrow locale-independent case-fold contract");
check(optionsVocabJs.includes("pbpVocabSelectionSnapshotValid(ids, _vocabSelected, _vocabViewRows)") &&
  optionsVocabJs.includes('t("vocabSelectionChanged")') &&
  optionsVocabJs.includes('search.focus({ preventScroll: true })'),
  "options-vocab.js: stale destructive confirmations or post-action focus are not guarded");
check(optionsVocabJs.includes('t("vocabRefreshFailed")') &&
  optionsVocabJs.includes("const refreshed = await _pbpVocabReloadAfterMutation(owner, gen)") &&
  optionsVocabJs.includes("if (gen !== _vocabRenderGen) return;") &&
  optionsVocabJs.includes("_pbpVocabRenderList(true)"),
  "options-vocab.js: committed mutations, refresh failures, or incremental rendering are conflated");
check(["vocab-search", "vocab-group-filter", "vocab-sort", "vocab-group-input", "vocab-list"].every((id) =>
  new RegExp(`id="${id}"[^>]*aria-label=`).test(optionsHtml)) &&
  /id="vocab-selection-actions"|class="vocab-selection-actions"[^>]*role="group"[^>]*aria-label=/.test(optionsHtml) &&
  /id="vocab-batch-toolbar"[^>]*role="group"[^>]*aria-label=/.test(optionsHtml) &&
  /id="vocab-selected-count"[^>]*aria-live="polite"/.test(optionsHtml),
  "options.html: production vocabulary controls lost accessible names, groups, or live selection status");
check(optionsVocabJs.includes('select.setAttribute("aria-label", t("vocabSelectWord", w.term))') &&
  optionsVocabJs.includes('head.setAttribute("aria-expanded", "false")') &&
  optionsVocabJs.includes('head.setAttribute("aria-expanded", open ? "true" : "false")'),
  "options-vocab.js: production vocabulary rows lost named selection or expansion state");
check(vocabStore.includes('const _PBP_VOCAB_DB_VERSION = 2'),
  "vocabulary database is upgraded through the dedicated store");
check(!mdDict.includes('indexedDB.open(_PBP_VOCAB_DB_NAME'),
  "md-dict no longer owns vocabulary persistence");
check(vocabStore.includes("function _pbpVocabLocalMutation") && vocabStore.includes("tx.abort()") &&
  vocabStore.includes("tx.oncomplete") && vocabStore.includes("pbpVocabBatchAddGroup"),
  "vocab-store.js: vocabulary batch mutations are not one owner-checked atomic transaction");
// The batch tools live in a sticky bar inside .vocab-list-region since the
// floating-bar redesign (2026-08): the wrapper is the sticky containing
// block, so the bar can never float over the sections below the list, and
// the browse state reserves zero geometry above the cards.
check(optionsCss.includes(".vocab-filter-toolbar") && optionsCss.includes(".vocab-list-region") &&
  /\.vocab-batch-bar\s*\{[\s\S]{0,500}position:\s*sticky[\s\S]{0,500}z-index:\s*var\(--opt-z-sticky\)/.test(optionsCss) &&
  optionsCss.includes(".vocab-card .notes-card-top"),
  "options.css: sticky vocabulary batch bar contract is missing");
check(optionsHtml.indexOf('class="vocab-list-region"') > 0 &&
  optionsHtml.indexOf('class="vocab-list-region"') < optionsHtml.indexOf('id="vocab-list"') &&
  optionsHtml.indexOf('id="vocab-load-more"') < optionsHtml.indexOf('id="vocab-batch-toolbar"') &&
  /<div class="vocab-batch-bar" id="vocab-batch-toolbar"/.test(optionsHtml),
  "options.html: batch bar is not a sticky-region child after the load-more control");
check(/#panel-vocab\s+\.vocab-load-more\[hidden\][\s\S]{0,80}display:\s*none/.test(optionsCss),
  "options.css: vocabulary hidden controls can be redisplayed by component display rules");
check(optionsVocabJs.includes('t("vocabLoading")') &&
  optionsVocabJs.includes('list.setAttribute("aria-busy", loading ? "true" : "false")'),
  "options-vocab.js: vocabulary loading is not visible or aria-busy is not closed consistently");
check(optionsVocabJs.includes("function pbpVocabOwnerLabel") &&
  optionsVocabJs.includes('t("vocabResultCount", String(rows.length), String(_vocabRows.length), _vocabOwnerLabel)') &&
  optionsVocabJs.includes('empty.textContent = t("dictVocabEmpty", _vocabOwnerLabel)') &&
  !optionsVocabJs.includes('t("jinaFailed")'),
  "options-vocab.js: account scope is absent or action errors still reuse Jina copy");
check(/data-i18n="dictExportTsv"/.test(optionsHtml) && /data-i18n="dictAnkiSend"/.test(optionsHtml) &&
  /data-i18n="dictEudicSend"/.test(optionsHtml) && /data-i18n="dictEudicSupportedHint"/.test(optionsHtml) &&
  /data-i18n="dictPackImportHint"/.test(optionsHtml) &&
  /id="dict-pack-file"[^>]*accept="[^"]*\.txt[^"]*\.txt\.gz[^"]*\.zip/.test(optionsHtml),
  "options.html: full-scope actions, Eudic support, or pack import formats are not explicit");
check(!read("anki-connect.js").includes("PBP_ANKI_ENDPOINT"),
  "anki-connect.js: unused PBP_ANKI_ENDPOINT remains");
check(sharedJs.includes('const state = ok ? "ok" : "bad"') &&
  sharedJs.includes('el.classList.toggle("bad", !ok)') && sharedJs.includes('ic.className = "status-ic " + state'),
  "shared.js: setStatusIcon does not apply matching ok/bad host and icon states");
{
  const packSection = optionsHtml.indexOf('data-i18n="dictPackSection"');
  const packHint = optionsHtml.indexOf('data-i18n="dictPackHint"', packSection);
  const packStatus = optionsHtml.indexOf('id="dict-pack-status"', packSection);
  // The "does not support English word lookup" clause is GONE on purpose: the
  // ECDICT pack provides exactly that, so pinning it here would pin a lie. What
  // still has to hold is that this hint describes CC-CEDICT's own direction.
  check(packSection >= 0 && packHint > packSection && packStatus > packHint &&
    optionsHtml.includes("Simplified or Traditional Chinese terms") &&
    !optionsHtml.includes("does not support English word lookup"),
  "options.html: CC-CEDICT capability hint is missing, misplaced, or still denies English lookup");

  // The ECDICT block states the opposite direction, offers no download route,
  // and reuses the same control families as the pack above it.
  const eSection = optionsHtml.indexOf('data-i18n="ecdictSection"');
  const eHint = optionsHtml.indexOf('data-i18n="ecdictHint"', eSection);
  const eNote = optionsHtml.indexOf('data-i18n="ecdictFormatNote"', eSection);
  const eStatus = optionsHtml.indexOf('id="ecdict-pack-status"', eSection);
  check(eSection >= 0 && eHint > eSection && eNote > eHint && eStatus > eNote,
    "options.html: ECDICT section, hint, provenance note and status are missing or out of order");
  check(!/id="ecdict-pack-open"/.test(optionsHtml) &&
    !/ecdict[\s\S]{0,400}mdbg\.net|ecdict[\s\S]{0,400}github\.com/i.test(optionsHtml),
    "options.html: the ECDICT block offers a download route, which its licence position forbids");
  check(/id="ecdict-pack-status" role="status" aria-live="polite"/.test(optionsHtml) &&
    /id="ecdict-pack-import"[^>]*class="btn btn-sm"|class="btn btn-sm"[^>]*id="ecdict-pack-import"/.test(optionsHtml) &&
    optionsHtml.includes('accept=".csv,.txt,.gz,.zip"'),
    "options.html: ECDICT controls left the shared status/button/file-input families");
  // One rung, the widest, chosen once in code. A picker was declined (it would
  // need a "re-import to change it" caveat, since the rung is baked into the
  // stored rows), so the constant is the only place it can drift.
  check(/pbpEcdictImportFile\(f, \{ rung: "R3"/.test(optionsVocabJs),
    "options-vocab.js: the ECDICT import no longer requests the widest rung");
  check(!/id="ecdict-(rung|tier|level)"/.test(optionsHtml) && !/ecdictRung/.test(optionsHtml),
    "options.html: a rung picker appeared, which the shipped design has no copy or re-import story for");
}

// Corner radius is a per-theme token now: the pilot's radius scale is derived
// into --pp-radius-* / --opt-radius-* for all 13 themes (composers/_ui-derive.mjs).
// A literal px value opts that control out of every theme at once -- which is
// how the settings page ended up with buttons at 0, inputs at 0, search at 3px
// and selects at a hardcoded 7px copied over from md-preview. Only 0 and 50%
// (a circle, not a corner) are literals with no theme meaning.
{
  const offenders = [];
  for (const file of ["popup.css", "options.css"]) {
    const src = read(file).replace(/\/\*[\s\S]*?\*\//g, "");
    for (const m of src.matchAll(/border-radius:\s*([^;}]+)/g)) {
      const value = m[1].trim();
      // Split on top-level whitespace, keeping var(...) groups intact.
      const parts = value.match(/var\([^)]*\)|[^\s]+/g) || [];
      const bad = parts.filter((p) => !/^var\(--(?:pp|opt)-radius-/.test(p) && p !== "0" && p !== "50%");
      if (bad.length) offenders.push(`${file}: border-radius: ${value}`);
    }
  }
  check(offenders.length === 0,
    `hardcoded corner radius bypasses the per-theme radius scale: ${offenders.join(" | ")}`);

  // The :root blocks are the no-preset generic -- the only state left where the
  // two surfaces could disagree, since all 13 themes derive their own scale.
  const scale = (file, prefix) => {
    const src = read(file);
    const root = src.slice(src.indexOf(":root {"));
    return ["sm", "md", "lg", "full"]
      .map((k) => (root.slice(0, root.indexOf("\n}")).match(new RegExp(`--${prefix}-radius-${k}:\\s*([^;]+);`)) || [])[1])
      .join("/");
  };
  const popupScale = scale("popup.css", "pp"), optionsScale = scale("options.css", "opt");
  check(popupScale === optionsScale && /^\d/.test(popupScale),
    `popup and options disagree on the default radius scale: ${popupScale} vs ${optionsScale}`);
}

// Theme tokens that are NOT declared on :root only exist once a data-theme is
// set. options-theme-early.js leaves data-theme unset for the no-preset LIGHT
// state -- the default a new user sees -- so `var(--opt-input-border)` with no
// fallback makes the whole declaration invalid there. Shipped that way, the
// vocabulary toolbar's controls had no border at all in the default theme, and
// nothing caught it: cascade-lint probes the 13 presets, which is the one state
// where these tokens DO resolve.
{
  const optionsCss = read("options.css");
  const src = optionsCss.replace(/\/\*[\s\S]*?\*\//g, "");
  const rootStart = src.indexOf(":root {");
  const declaredOnRoot = new Set(
    [...src.slice(rootStart, src.indexOf("\n}", rootStart)).matchAll(/(--opt-[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
  // Brace walk rather than a line scan: single-line rules, multi-line selector
  // lists and the @supports/@media wrappers all have to resolve to the right
  // governing selector, and a line-based version silently mis-attributed a
  // dozen themed rules to an unthemed one.
  const stack = [];
  let chunk = "", offenders = [];
  const themed = () => stack.some((s) => s.includes("html[data-theme"));
  const scan = (text) => {
    if (!stack.length || themed()) return;
    for (const m of text.matchAll(/var\((--opt-[a-z0-9-]+)\s*\)/g)) {
      if (!declaredOnRoot.has(m[1])) offenders.push(`${stack[stack.length - 1].slice(0, 60)} -> ${m[1]}`);
    }
  };
  for (const ch of src) {
    if (ch === "{") { stack.push(chunk.trim()); chunk = ""; }
    else if (ch === "}") { scan(chunk); stack.pop(); chunk = ""; }
    else if (ch === ";") { scan(chunk); chunk = ""; }
    else chunk += ch;
  }
  check(offenders.length === 0,
    `options.css: theme-only token used with no fallback outside html[data-theme] (invisible in the default light state): ${offenders.join(", ")}`);
}

check(!mdTranslateJs.includes("lastViewMode") &&
  /function pbpTrNextMode\(mode\)/.test(mdTranslateJs) &&
  /_pbpTrSetMode\(st, pbpTrNextMode\(st\.mode\), true\)/.test(mdTranslateJs),
  "md-translate.js: v does not implement the strict three-state cycle");
check(mdTranslateJs.includes("pbpTrSingleKeyAllowed(") && mdAskJs.includes("pbpTrSingleKeyAllowed(") &&
  mdHighlightJs.includes("pbpTrSingleKeyAllowed("),
  "md-preview single-key shortcuts do not share the modifier/typing/raw-view gate");
{
  const explainShortcut = mdAskJs.slice(mdAskJs.indexOf("function _pbpExplainOnShortcut"),
    mdAskJs.indexOf("function pbpExplainInit"));
  const explainInit = mdAskJs.slice(mdAskJs.indexOf("function pbpExplainInit"),
    mdAskJs.indexOf('document.addEventListener("pbp:rendered"', mdAskJs.indexOf("function pbpExplainInit")));
  check(mdTranslateJs.includes("_pbpTrTrigger(st)") &&
    /if \(st\.running\) return;[\s\S]{0,120}if \(st\.status === "done"\) return;/.test(mdTranslateJs) &&
    explainShortcut.includes('_pbpExplainTrigger === "off"') &&
    explainShortcut.includes('pbpExplainInvoke(key === "d" ? "dict" : "explain")') &&
    explainInit.indexOf('if (_pbpExplainTrigger === "off") return') >= 0 &&
    explainInit.indexOf('if (_pbpExplainTrigger === "off") return') < explainInit.indexOf('document.addEventListener("keydown", _pbpExplainOnShortcut)'),
    "t/d shortcuts bypass the shared translation/selection action chains");
}
check(/\{ chips: \["t"\], key: "kbdHelpTranslate" \}/.test(mdReaderJsSource) &&
  /\{ chips: \["d"\], key: "kbdHelpDictionary" \}/.test(mdReaderJsSource) &&
  /\{ chips: \["v"\], key: "kbdHelpToggleView" \}/.test(mdReaderJsSource) &&
  /\{ chips: \["h", "1-5"\], key: "kbdHelpHighlight" \}/.test(mdReaderJsSource) &&
  /<kbd>t<\/kbd>[\s\S]*data-i18n="kbdHelpTranslate"/.test(optionsHtml) &&
  /<kbd>d<\/kbd>[\s\S]*data-i18n="kbdHelpDictionary"/.test(optionsHtml) &&
  !optionsHtml.includes("<kbd>V</kbd>") && !optionsHtml.includes("<kbd>H</kbd>"),
  "keyboard help does not expose t/d and lowercase v/h consistently");
check(/btn\.setAttribute\("aria-keyshortcuts", "t"\)/.test(mdTranslateJs) &&
  /wrap\.setAttribute\("aria-keyshortcuts", "v"\)/.test(mdTranslateJs) &&
  /b\.setAttribute\("aria-pressed", "false"\)/.test(mdTranslateJs) &&
  /b\.setAttribute\("aria-pressed", active \? "true" : "false"\)/.test(mdTranslateJs) &&
  mdTranslateJs.includes('t(key) + " (v)"'),
  "translation controls lack lowercase shortcut metadata or production toggle state");
check(mdTranslateJs.includes('scrollIntoView({ block: "start", behavior: "instant" })') &&
  mdTranslateJs.includes("document.startViewTransition") &&
  // The predicate moved into shared.js; what matters is that it still gates the
  // View Transition, so assert the gate rather than the spelling.
  /const reduceMotion = pbpPrefersReducedMotion\(\);/.test(mdTranslateJs) &&
  /!reduceMotion && typeof document\.startViewTransition === "function"/.test(mdTranslateJs) &&
  mdCss.includes("view-transition-name: pbp-tr-article") &&
  /::view-transition-group\(root\),[\s\S]{0,100}::view-transition-group\(pbp-tr-article\) \{ animation: none; \}/.test(mdCss) &&
  mdCss.includes("animation-name: pbp-tr-fade-out") && mdCss.includes("animation-name: pbp-tr-fade-in") &&
  mdCss.includes("140ms"),
  "translation view switching lacks instant anchor restore or reduced-motion-safe article transition");
{
  const settle = mdTranslateJs.slice(mdTranslateJs.indexOf("function _pbpTrSettleViewAnchor"),
    mdTranslateJs.indexOf("function _pbpTrApplyMode"));
  check(settle.includes('behavior: "instant"') && !settle.includes(".focus("),
    "translation view anchor restore animates scroll or steals keyboard focus");
}
{
  const focus = mdTranslateJs.slice(mdTranslateJs.indexOf("function _pbpTrCaptureFocusHandoff"),
    mdTranslateJs.indexOf("function _pbpTrCaptureViewAnchor"));
  const applyMode = mdTranslateJs.slice(mdTranslateJs.indexOf("function _pbpTrApplyMode"),
    mdTranslateJs.indexOf("function _pbpTrSetMode"));
  check(focus.includes('mode !== "original" && mode !== "translated"') &&
    focus.includes("document.activeElement !== handoff.active") &&
    focus.includes("target.focus({ preventScroll: true })") &&
    applyMode.indexOf("_pbpTrApplyFocusHandoff(focusHandoff)") < applyMode.indexOf("_pbpTrSettleViewAnchor(anchor, mode)"),
  "translation view switching can hide focus or let focus scroll override anchor restoration");
}
check(/orig\.dataset\.pbTrDone = "1";[\s\S]{0,380}_pbpTrSyncToc\(st, "translated"\)/.test(mdTranslateJs),
  "md-translate.js: progressively filled translated headings do not update the live TOC");
check(mdTranslateJs.includes('const targetCode = plan.targetCode || ""') &&
  mdTranslateJs.includes("pbpTrLengthRatioOk(seg.text, item.text, targetCode)") &&
  mdTranslateJs.includes("pbpTrLengthRatioOk(seg.text, text, targetCode)") &&
  mdTranslateJs.includes("pbpTrLengthRatioOk(split.chunks[i], got, st.target.code)") &&
  /pbpTrRunQueue\(\{[\s\S]{0,140}targetCode:\s*st\.target\.code/.test(mdTranslateJs),
  "md-translate.js: target language code does not reach batch, downgrade and manual retry quality gates");
{
  const waybackLog = optionsJs.slice(optionsJs.indexOf("function renderWaybackLog"),
    optionsJs.indexOf("function loadWaybackLog"));
  const permissionBranch = waybackLog.slice(waybackLog.indexOf('outcome === "permDenied"'),
    waybackLog.indexOf('outcome === "rate-limited"'));
  check(waybackLog.includes("wayback-perm-help") &&
    waybackLog.includes("PBP_ICONS.warning") &&
    waybackLog.includes('pbpScrollIntoView(target, { block: "center", behavior: "smooth" })') &&
    waybackLog.includes('focus({ preventScroll: true })') &&
    !permissionBranch.includes("outcomeEl.title"),
    "options.js: archive permission recovery remains hover-only or cannot reach the controlling setting");
}
// Both disclosure paths must exist, and the hover half must stay behind a
// fine-pointer gate: it inserts a full-width grid row inside a scrolling log,
// and on touch :hover latches after a tap and wedges the tip open.
check(/\.wayback-log-row:focus-within\s+\.wayback-perm-tip/.test(optionsCss) &&
  /@media \(hover: hover\) and \(pointer: fine\) \{\s*\.wayback-log-row:hover\s+\.wayback-perm-tip/.test(optionsCss) &&
  optionsCss.includes("background: var(--opt-panel)") &&
  optionsCss.includes("color: var(--opt-fg)"),
  "options.css: archive permission guidance lacks themed focus disclosure, or its hover half escaped the fine-pointer gate");
check(popupCss.includes("html[data-theme] .confirm-popover .confirm-yes:hover { background: var(--pp-warn-fg)") &&
  popupCss.includes("html[data-theme] .confirm-popover .confirm-no:hover { background: var(--pp-warn-bg)") &&
  optionsCss.includes("html[data-theme] .confirm-popover .confirm-yes:hover { background: var(--opt-danger)") &&
  optionsCss.includes("html[data-theme] .theme-name-popover .tnp-save:hover { background: var(--opt-fg)"),
  "custom themed popovers can fall back to hardcoded hover backgrounds with unreadable foregrounds");
{
  const failed = mdTranslateJs.slice(mdTranslateJs.indexOf("function _pbpTrMarkFailed"),
    mdTranslateJs.indexOf("function _pbpTrMarkPartial"));
  const partial = mdTranslateJs.slice(mdTranslateJs.indexOf("function _pbpTrMarkPartial"),
    mdTranslateJs.indexOf("function _pbpTrClearPendingFailures"));
  check(failed.includes("btn.dataset.tip") && partial.includes("btn.dataset.tip") &&
    failed.includes('btn.setAttribute("aria-label"') && partial.includes('btn.setAttribute("aria-label"') &&
    !failed.includes("btn.title") && !partial.includes("btn.title") &&
    mdCss.includes(".pb-tr-err::after") && mdCss.includes("content: attr(data-tip)"),
    "translation failure reasons still depend on native title tooltips or lack a themed hover/focus surface");
}
{
  const upsert = popupAiJs.slice(popupAiJs.indexOf("function upsertSummary"),
    popupAiJs.indexOf("// ---- Remove AI summary"));
  const setupAi = popupAiJs.slice(popupAiJs.indexOf("function setupAIFeatures"),
    popupAiJs.indexOf("function _aiSummaryBlockMatches"));
  check(!popupAiJs.includes('const AI_SUMMARY_TAG = "[AI Summary]"') &&
    !upsert.includes("AI_SUMMARY_TAG") &&
    popupAiJs.includes("function pbpAiTrackSummaryRange") &&
    popupAiJs.includes("function pbpAiRemoveSummaryRange") &&
    setupAi.includes("pbpAiTrackSummaryRange") &&
    setupAi.includes("_aiResetSummaryActions()") &&
    setupAi.includes('t("aiSummaryMerged")') &&
    sharedJs.includes("const _AI_BQ_REGEX_SHARED") &&
    sharedJs.includes("legacy"),
    "popup AI summary ownership still writes a marker, lacks fail-closed range tracking, or dropped legacy recognition");
}

const optionsTabs = optionsHtml.slice(optionsHtml.indexOf('<div class="tabs"'), optionsHtml.indexOf('</div>', optionsHtml.indexOf('<div class="tabs"')) + 6);
check(!optionsTabs.includes('id="reset-panel-btn"') && /id="mobile-tab-select"/.test(optionsHtml),
  "options.html: reset action remains inside tablist or mobile category select is missing");
check(/mobileTabSelect\.value = btn\.dataset\.panel/.test(optionsJs) &&
  /mobileTabSelect\?\.addEventListener\("change"/.test(optionsJs),
  "options.js: desktop tabs and mobile category select can drift");
check(/result && typeof result\.catch === "function"\) result\.catch\(reportConfirmError\)/.test(sharedJs),
  "shared.js: asynchronous confirm failures can become unhandled rejections");
// Leading-edge alignment: the popover is routinely far wider than its anchor, so
// aligning trailing edges walks it left over the sidebar nav instead. The flip
// bound is the nearest .panel's right edge (falling back to the viewport) --
// on wide windows the settings card ends far left of the viewport, and a
// row-trailing anchor used to jut the popover past the card border.
check(/anchorRect\.left \+ popRect\.width <= rightBound/.test(sharedJs) &&
  /\? Math\.max\(gap, anchorRect\.left\)/.test(sharedJs),
  "shared.js: the confirm popover went back to trailing-edge alignment (it then covers whatever sits left of the anchor)");
check(/anchor\.closest\("\.panel"\)/.test(sharedJs),
  "shared.js: the confirm popover lost its panel right-edge clamp (wide windows let it jut past the card border)");
check(/<input type="password" id="token-input"/.test(popupHtml) && /data-target="token-input"/.test(popupHtml),
  "popup.html: Pinboard token is not masked with a reveal control");
check(/<input type="password" id="opt-pinboard-token"/.test(optionsHtml) && /data-target="opt-pinboard-token"/.test(optionsHtml),
  "options.html: Pinboard token is not masked with a reveal control");
check(/<button[^>]+id="import-settings"/.test(optionsHtml) && /id="import-status"[^>]+role="status"/.test(optionsHtml),
  "options.html: settings import is not a keyboard button with live status");
for (const [id, label] of [["opt-lang", "secLanguage"], ["opt-ai-provider", "secAiProvider"], ["opt-theme", "secTheme"]]) {
  check(new RegExp(`<label[^>]+for="${id}"[^>]+data-i18n="${label}"`).test(optionsHtml),
    `options.html: ${id} lacks its visible label`);
}
check(/id="translate-target-lang-custom"[^>]+aria-labelledby="translate-target-lang-label"/.test(optionsHtml),
  "options.html: custom translation language lacks an accessible name");
check(/id="tag-gov-progress-bar"[^>]+role="progressbar"[^>]+aria-labelledby="tag-gov-progress-text"[^>]+aria-valuenow="0"/.test(optionsHtml) &&
  /id="tag-gov-progress-text"[^>]+role="status"[^>]+aria-live="polite"/.test(optionsHtml),
  "options.html: tag governance progress lacks its accessible name/value or live status");
const tagGovProgressHelper = optionsJs.slice(
  optionsJs.indexOf("function _tagGovSetProgress(value"),
  optionsJs.indexOf('document.addEventListener("click",', optionsJs.indexOf("function _tagGovSetProgress(value"))
);
check(/fill\.style\.width = percent \+ "%"/.test(tagGovProgressHelper) &&
  /bar\.setAttribute\("aria-valuenow", String\(percent\)\)/.test(tagGovProgressHelper) &&
  !optionsJs.replace(tagGovProgressHelper, "").includes('$id("tag-gov-progress-fill")'),
  "options.js: tag governance visual and ARIA progress can drift");
check(/id="tags-input"[^>]+role="combobox"[^>]+aria-controls="tags-autocomplete"[^>]+aria-expanded="false"/.test(popupHtml) &&
  /id="tags-autocomplete"[^>]+role="listbox"/.test(popupHtml),
  "popup.html: tag autocomplete lacks combobox/listbox semantics");
check(/setAttribute\("role", "option"\)/.test(popupTagsJs) &&
  /aria-activedescendant/.test(popupTagsJs) && /aria-selected/.test(popupTagsJs) &&
  /scrollIntoView\(\{ block: "nearest" \}\)/.test(popupTagsJs),
  "popup-tags.js: tag options do not expose active selection semantics");
check(/finally\s*\{\s*container\.setAttribute\("aria-busy", "false"\)/.test(popupTagsJs),
  "popup-tags.js: suggested tags remain permanently busy after completion");
check(/const btn = document\.createElement\("button"\);[\s\S]{0,80}btn\.type = "button";[\s\S]{0,100}btn\.className = "preset-btn";/.test(popupBatchJs),
  "popup-batch.js: tag presets are not native buttons");
check(/btn\.disabled = true;\s*\$id\("tags-input"\)\?\.focus\(\)/.test(popupBatchJs),
  "popup-batch.js: used tag preset drops focus on a disabled button");
const cleanHint = popupJs.slice(popupJs.indexOf("function _renderCleanHint"), popupJs.indexOf('document.addEventListener("DOMContentLoaded"'));
check(cleanHint.indexOf('hint.classList.add("hidden")') < cleanHint.indexOf("urlInput.focus()"),
  "popup.js: URL-clean undo hides its focused button without returning focus");

check(manifest.host_permissions.join(",") === "https://api.pinboard.in/*,https://pinboard.in/*",
  "manifest.json: required hosts are not limited to core Pinboard access");
check(manifest.optional_host_permissions.join(",") === "*://*/*",
  "manifest.json: optional host ceiling is redundant or missing");

for (const [name, html] of [["popup.html", popupHtml], ["options.html", optionsHtml], ["md-preview.html", mdHtml]]) {
  const links = html.matchAll(/<a\b[^>]*target="_blank"[^>]*>/g);
  for (const [tag] of links) check(/\brel="[^"]*\bnoopener\b[^"]*"/.test(tag), `${name}: target=_blank missing rel=noopener -> ${tag}`);
}

const staticAccordionHeaders = optionsHtml.matchAll(/<(?<tag>\w+)\b(?<attrs>[^>]*class="accordion-header"[^>]*)>/g);
for (const m of staticAccordionHeaders) {
  const attrs = m.groups.attrs;
  const target = (attrs.match(/\bdata-target="([^"]+)"/) || [])[1];
  check(m.groups.tag === "button", `options.html: accordion ${target} is <${m.groups.tag}>`);
  check(/\btype="button"/.test(attrs), `options.html: accordion ${target} missing type=button`);
  check(new RegExp(`\\baria-controls="${target}"`).test(attrs), `options.html: accordion ${target} missing aria-controls`);
}

check(/const head = document\.createElement\("button"\);/.test(optionsJs), "options.js: dynamic accordion header is not a button");
check(/head\.type = "button";/.test(optionsJs), "options.js: dynamic accordion header missing type=button");
check(/head\.setAttribute\("aria-controls", head\.dataset\.target\);/.test(optionsJs), "options.js: dynamic accordion header missing aria-controls");

const helperSource = optionsJs.slice(0, optionsJs.indexOf('document.addEventListener("DOMContentLoaded"'));
const permissionHelpers = Function(helperSource + "; return { pbpExactOriginPermissionSnapshot, pbpRevokeLegacyAllSitesPermission }; ")();
check(permissionHelpers.pbpExactOriginPermissionSnapshot([
  "*://*/*",
  "https://api.pinboard.in/*",
  "https://custom.example:8443/*",
  "https://*.example.com/*",
  "http://localhost:*/*",
  "not a pattern",
  "https://api.pinboard.in/*"
]).join(",") === "https://api.pinboard.in/*,https://custom.example:8443/*",
"options.js: legacy revoke snapshot is not limited to unique exact origins");

{
  const wildcard = "*://*/*";
  const exact = ["https://api.pinboard.in/*", "https://custom.example:8443/*"];
  const active = new Set([wildcard, ...exact]);
  const calls = [];
  const result = await permissionHelpers.pbpRevokeLegacyAllSitesPermission({
    async getAll() { calls.push("getAll"); return { origins: [...active] }; },
    async remove({ origins }) { calls.push("remove:" + origins.join(",")); active.delete(wildcard); return true; },
    async request({ origins }) { calls.push("request:" + origins.join(",")); return true; },
    async contains({ origins }) { calls.push("contains:" + origins[0]); return active.has(origins[0]); }
  });
  check(result.ok && calls.join("|") === [
    "getAll",
    "remove:*://*/*",
    "request:" + exact.join(","),
    "contains:" + exact[0],
    "contains:" + exact[1],
    "contains:*://*/*"
  ].join("|"), "options.js: legacy revoke does not restore/verify the exact snapshot in order");
}

{
  const wildcard = "*://*/*";
  const exact = "https://custom.example/*";
  const active = new Set([wildcard, exact]);
  const result = await permissionHelpers.pbpRevokeLegacyAllSitesPermission({
    async getAll() { return { origins: [...active] }; },
    async remove() { active.clear(); return true; },
    async request() { return false; },
    async contains({ origins }) { return active.has(origins[0]); }
  });
  check(!result.ok && result.wildcardAbsent && result.missing.includes(exact),
    "options.js: partial exact-origin restoration can be reported as success");
}

check(optionsJs.includes("btn.disabled = result.wildcardAbsent"),
  "options.js: partial legacy revoke failure can be retried into a false success");

const sendRuntimeStart = mdExportSendJs.indexOf("async function pbpSendToTarget");
const sendRuntimeEnd = mdExportSendJs.indexOf("\n}", sendRuntimeStart) + 2;
const sendRuntime = mdExportSendJs.slice(sendRuntimeStart, sendRuntimeEnd);
check(sendRuntimeStart >= 0 && /permissions\.contains/.test(sendRuntime) && !/permissions\.request/.test(sendRuntime),
  "md-export-send.js: execution layer must contain-check without requesting");
const doSendStart = mdPreviewJs.indexOf("async function doSend(id)");
const doSendEnd = mdPreviewJs.indexOf("primary.addEventListener", doSendStart);
const doSend = mdPreviewJs.slice(doSendStart, doSendEnd);
check(doSendStart >= 0 && doSendEnd > doSendStart &&
  doSend.indexOf("await pbpRequestTargetPermission(id, cfg)") >= 0 &&
  doSend.indexOf("await pbpRequestTargetPermission(id, cfg)") < doSend.indexOf("await pbpSetLastTarget(id)"),
  "md-preview.js: Send-to permission request is not the first await before last-target storage");

check(/const PBP_JINA_ORIGIN_PATTERN = "https:\/\/r\.jina\.ai\/\*";/.test(sharedJs) &&
  !/const\s+JINA_ORIGIN_PATTERN/.test(jinaJs) && /PBP_JINA_ORIGIN_PATTERN/.test(jinaJs),
  "Jina exact-origin pattern is not shared by preview and Service Worker paths");
const jinaRetryStart = mdPreviewJs.indexOf("async function retryExtract(engine, failure)");
const jinaRetryEnd = mdPreviewJs.indexOf("async function attemptExtract(engine)", jinaRetryStart);
const jinaRetry = mdPreviewJs.slice(jinaRetryStart, jinaRetryEnd);
check(jinaRetryStart >= 0 && jinaRetryEnd > jinaRetryStart &&
  jinaRetry.indexOf("inFlight = true") >= 0 &&
  jinaRetry.indexOf("inFlight = true") < jinaRetry.indexOf("await pbpRequestJinaHostPermission()") &&
  jinaRetry.indexOf("await pbpRequestJinaHostPermission()") >= 0 &&
  jinaRetry.indexOf("await pbpRequestJinaHostPermission()") < jinaRetry.indexOf("await attemptExtract(engine)") &&
  /finally\s*\{\s*inFlight = false;/.test(jinaRetry),
  "md-preview.js: Jina retry is not guarded before its exact-origin request");
const switchRetryStart = mdPreviewJs.indexOf('if (e === "jina" && jinaPermissionMissing)');
const switchHandlerStart = mdPreviewJs.lastIndexOf('seg.addEventListener("click", async () => {', switchRetryStart);
const switchRetryEnd = mdPreviewJs.indexOf("chrome.runtime.sendMessage", switchRetryStart) + "chrome.runtime.sendMessage".length;
const switchRetry = mdPreviewJs.slice(switchHandlerStart, switchRetryEnd);
check(switchHandlerStart >= 0 && switchRetryEnd > switchRetryStart &&
  switchRetry.indexOf("switching = true") >= 0 &&
  switchRetry.indexOf("switching = true") < switchRetry.indexOf("await pbpRequestJinaHostPermission()") &&
  switchRetry.indexOf("await pbpRequestJinaHostPermission()") < switchRetry.indexOf("chrome.runtime.sendMessage") &&
  /if \(!await pbpRequestJinaHostPermission\(\)\) \{[\s\S]*?switching = false;[\s\S]*?applyAvailability\(curEngine\);[\s\S]*?return;/.test(switchRetry),
  "md-preview.js: Jina engine retry is not guarded before its permission request");
const renderErrorState = mdPreviewJs.slice(
  mdPreviewJs.indexOf("function renderErrorState"),
  mdPreviewJs.indexOf("function pbpRequestJinaHostPermission")
);
check(renderErrorState.indexOf('btn.textContent = t(permissionRequired ? "aiGrantRetry" : "askErrRetry")') >= 0 &&
  renderErrorState.indexOf("btn.disabled = true") < renderErrorState.indexOf("await retryFn()") &&
  renderErrorState.indexOf("btn.disabled = false") > renderErrorState.indexOf("await retryFn()") &&
  mdPreviewJs.includes('pr && pr.error === "host_permission"'),
  "md-preview.js: Jina permission retry lacks grant copy or synchronous button guard");

const aiRecoveryStart = mdAiCoreJs.indexOf("async function pbpAiRetryWithPermission");
const aiRecoveryEnd = mdAiCoreJs.indexOf("// ---- IDB persistence", aiRecoveryStart);
const aiRecovery = mdAiCoreJs.slice(aiRecoveryStart, aiRecoveryEnd);
check(aiRecoveryStart >= 0 && aiRecovery.indexOf("await requestAIHostPermissions(settings)") >= 0 &&
  aiRecovery.indexOf("await requestAIHostPermissions(settings)") < aiRecovery.indexOf("await retry()"),
  "md-ai-core.js: retry callback can run before the provider permission request");
check((mdAskJs.match(/pbpAiRetryWithPermission\(/g) || []).length >= 2,
  "md-ask.js: Ask and Explain do not both use permission-aware retry");
const skimRegenStart = mdSkimJs.indexOf("async function _pbpSkimRegen()");
const skimRegen = mdSkimJs.slice(skimRegenStart, mdSkimJs.indexOf("// Init hookup", skimRegenStart));
check(skimRegenStart >= 0 && skimRegen.indexOf("await pbpAiRetryWithPermission") >= 0 &&
  skimRegen.indexOf("st.running = true") >= 0 &&
  skimRegen.indexOf("st.running = true") < skimRegen.indexOf("await pbpAiRetryWithPermission") &&
  skimRegen.indexOf("retry.disabled = true") < skimRegen.indexOf("await pbpAiRetryWithPermission") &&
  skimRegen.indexOf("await pbpAiRetryWithPermission") < skimRegen.indexOf("body.replaceChildren()") &&
  /finally\s*\{[\s\S]*?st\.running = false;[\s\S]*?retry\.disabled = false;/.test(skimRegen),
  "md-skim.js: regenerate is not guarded before permission recovery");
const explainRetryStart = mdAskJs.indexOf('retry.className = "xp-retry"');
const explainRetryEnd = mdAskJs.indexOf("wrap.appendChild(retry)", explainRetryStart);
const explainRetry = mdAskJs.slice(explainRetryStart, explainRetryEnd);
check(explainRetryStart >= 0 && explainRetryEnd > explainRetryStart &&
  explainRetry.indexOf("retry.disabled = true") >= 0 &&
  explainRetry.indexOf("retry.disabled = true") < explainRetry.indexOf("await pbpAiRetryWithPermission") &&
  (explainRetry.match(/retry\.disabled = false/g) || []).length === 2,
  "md-ask.js: Explain permission retry lacks a synchronous button guard");
const trStart = mdTranslateJs.slice(mdTranslateJs.indexOf("async function _pbpTrStart(st)"), mdTranslateJs.indexOf("// Fill one block", mdTranslateJs.indexOf("async function _pbpTrStart(st)")));
check(trStart.indexOf("await pbpAiRetryWithPermission") >= 0 &&
  trStart.indexOf("await pbpAiRetryWithPermission") < trStart.indexOf("if (st.workReady) await st.workReady"),
  "md-translate.js: Continue does work before permission recovery");


const waybackLoadStart = optionsJs.indexOf("// ---- Wayback: check permission on load");
const waybackToggleStart = optionsJs.indexOf("// ---- Wayback: toggle permission", waybackLoadStart);
const waybackClearStart = optionsJs.indexOf("// ---- Wayback: clear", waybackToggleStart);
const waybackLoad = optionsJs.slice(waybackLoadStart, waybackToggleStart);
const waybackToggle = optionsJs.slice(waybackToggleStart, waybackClearStart);
check(waybackLoadStart >= 0 && waybackToggleStart > waybackLoadStart &&
  !/checked\s*=\s*false|waybackArchiveEnabled\s*=\s*false|getSettingsStorage\(\)/.test(waybackLoad),
  "options.js: Wayback load-time permission failure disables the saved setting");
check(waybackClearStart > waybackToggleStart &&
  !/checked\s*=\s*false|dispatchEvent\(/.test(waybackToggle),
  "options.js: Wayback permission denial disables the user's choice");
check(/result\.missing\.join\(", "\)/.test(optionsJs) && !/result\.ok[\s\S]{0,300}batchPermNone/.test(optionsJs),
  "options.js: legacy revoke restoration failure is not reported explicitly");

const popupRetryStart = popupAiJs.indexOf('$id("ai-error-retry")?.addEventListener');
const popupRetryEnd = popupAiJs.indexOf('$id("ai-error-fallback")?.addEventListener', popupRetryStart);
const popupRetry = popupAiJs.slice(popupRetryStart, popupRetryEnd);
check(popupRetryStart >= 0 && popupRetryEnd > popupRetryStart &&
  popupRetry.indexOf("retryBtn.disabled = true") >= 0 &&
  popupRetry.indexOf("retryBtn.disabled = true") < popupRetry.indexOf("await requestAIHostPermissions") &&
  popupRetry.indexOf("retryBtn.disabled = false") > popupRetry.indexOf("await requestAIHostPermissions") &&
  popupRetry.indexOf("await requestAIHostPermissions(recovery.settings, extraOrigins)") === popupRetry.indexOf("await ") &&
  popupRetry.includes("recovery.origins.filter") && !popupRetry.includes("PBP_JINA_ORIGIN_PATTERN") &&
  !popupRetry.includes("aiContentSource"),
  "popup-ai.js: permission retry recomputes destinations instead of using the failed-stage origins");
check(/err\.permissionStage = "extracting";[\s\S]{0,100}err\.permissionOrigins = origins;/.test(popupAiJs) &&
  (popupAiJs.match(/e\.permissionStage = "calling";/g) || []).length === 2 &&
  // (s) = the op's immutable settings snapshot (audit A4), not the mutable global
  (popupAiJs.match(/e\.permissionOrigins = _aiRequiredOriginPatterns\(s\);/g) || []).length === 2,
  "popup-ai.js: extraction and provider permission failures do not record their actual stage/origins");

const popupWaybackStart = popupJs.indexOf('$id("archive-check").addEventListener("change", async (e) =>');
const popupWaybackEnd = popupJs.indexOf("// Setup UI features immediately", popupWaybackStart);
const popupWayback = popupJs.slice(popupWaybackStart, popupWaybackEnd);
check(popupWaybackStart >= 0 && popupWaybackEnd > popupWaybackStart &&
  popupWayback.indexOf('await chrome.permissions.request({ origins: ["https://web.archive.org/*"] })') === popupWayback.indexOf("await ") &&
  !popupWayback.includes("permissions.contains"),
  "popup.js: Wayback grant is not the first await in the checkbox gesture");

const markdownClickStart = popupJs.indexOf('jinaMdBtn.addEventListener("click", async () =>');
const markdownClickEnd = popupJs.indexOf("// Fetch all user tags first", markdownClickStart);
const markdownClick = popupJs.slice(markdownClickStart, markdownClickEnd);
check(markdownClickStart >= 0 && markdownClickEnd > markdownClickStart &&
  markdownClick.indexOf("jinaMdBtn.disabled = true") >= 0 &&
  markdownClick.indexOf("jinaMdBtn.disabled = true") < markdownClick.indexOf("await chrome.permissions.request") &&
  markdownClick.indexOf("jinaMdBtn.disabled = false") > markdownClick.indexOf("await chrome.permissions.request") &&
  markdownClick.indexOf("await chrome.permissions.request({ origins: [PBP_JINA_ORIGIN_PATTERN] })") === markdownClick.indexOf("await ") &&
  markdownClick.includes('result.code === "host_permission"') && markdownClick.includes('t("aiGrantRetry")'),
  "popup.js: Markdown host-permission recovery is not a Jina-only first-await grant and retry");

const tagGovClickStart = optionsJs.indexOf('$id("tag-gov-ai-btn")?.addEventListener');
const tagGovClickEnd = optionsJs.indexOf("await renderWaybackLog()", tagGovClickStart);
const tagGovClick = optionsJs.slice(tagGovClickStart, tagGovClickEnd);
check(tagGovClickStart >= 0 && tagGovClickEnd > tagGovClickStart &&
  tagGovClick.indexOf("btn.disabled = true") >= 0 &&
  tagGovClick.indexOf("btn.disabled = true") < tagGovClick.indexOf("await requestAIHostPermissions(pending)") &&
  tagGovClick.indexOf("btn.disabled = false") > tagGovClick.indexOf("await requestAIHostPermissions(pending)") &&
  tagGovClick.indexOf("await requestAIHostPermissions(pending)") === tagGovClick.indexOf("await ") &&
  tagGovClick.includes("tagGovAiPendingSettings !== pending") &&
  tagGovClick.includes("await runTagGovAi(pending)"),
  "options.js: tag-governance grant click does not request before retrying the saved settings snapshot");
check(/opt-ai-provider[\s\S]{0,160}tagGovAiPendingSettings = null/.test(optionsJs.slice(optionsJs.indexOf("let tagGovAiPendingSettings"))),
  "options.js: tag-governance pending permission retry is not cleared when provider changes");
check(/function pbpLiveAiSettingsSnapshot\(provider\)/.test(optionsConnectivityJs) &&
  /const cs = pbpLiveAiSettingsSnapshot\(provider\);/.test(optionsConnectivityJs) &&
  (optionsConnectivityJs.match(/geminiApiKey: getOptVal/g) || []).length === 1 &&
  tagGovClick.indexOf("const live = pbpLiveAiSettingsSnapshot") < tagGovClick.indexOf("let sNow = await") &&
  tagGovClick.includes("sNow = { ...sNow, ...live"),
  "Options connectivity and tag governance do not share one live provider form snapshot");

check(/@media \(max-width: 720px\)[\s\S]*\.container\s*{[\s\S]*grid-template-columns:\s*1fr/.test(optionsCss), "options.css: missing mobile one-column container rule");
check(/@media \(max-width: 720px\)[\s\S]*\.options-nav\s*{[\s\S]*position:\s*static/.test(optionsCss) &&
  /@media \(max-width: 720px\)[\s\S]*\.tabs\s*{\s*display:\s*none/.test(optionsCss),
  "options.css: mobile category select does not replace the desktop tablist");

function runOptionsEarly({ mode = "auto", preset = "", dark = false, chrome } = {}) {
  const root = { dataset: { theme: "stale" } };
  const values = new Map([["pp-theme", mode], ["pp-theme-preset", preset]]);
  const timers = [];
  const context = {
    document: { documentElement: root, addEventListener() {}, getElementById() { return null; } },
    window: { matchMedia: () => ({ matches: dark }) },
    localStorage: {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, String(value)),
    },
    setTimeout: (fn, ms) => timers.push({ fn, ms }),
  };
  if (chrome) context.chrome = chrome;
  runInNewContext(optionsThemeEarlyJs, context);
  return { root, values, timers };
}

for (const [preset, expected] of [["flexoki", "flexoki-dark"], ["solarized", "solarized-dark"], ["catppuccin", "catppuccin-mocha"]]) {
  const run = runOptionsEarly({ mode: "auto", preset, dark: true });
  check(run.root.dataset.theme === expected, `options-theme-early.js: ${preset} did not follow dark matchMedia without chrome`);
}
for (const preset of ["__proto__", "constructor"]) {
  const run = runOptionsEarly({ mode: "dark", preset });
  check(run.root.dataset.theme === preset, `options-theme-early.js: inherited key ${preset} interrupted theme bootstrap`);
}
const earlyLight = runOptionsEarly({ mode: "light", dark: true });
check(!("theme" in earlyLight.root.dataset),
  "options-theme-early.js: light/no-preset did not clear a stale theme without chrome");
check(earlyLight.timers.length === 1 && earlyLight.timers[0].ms === 3000, "options-theme-early.js: 3s fail-open timer is missing");
earlyLight.timers[0]?.fn();
check(earlyLight.root.dataset.optionsReady === "fallback", "options-theme-early.js: fail-open did not release the gate");
const earlyReady = runOptionsEarly();
earlyReady.root.dataset.optionsReady = "1";
earlyReady.timers[0]?.fn();
check(earlyReady.root.dataset.optionsReady === "1", "options-theme-early.js: fail-open overwrote authoritative readiness");

const sourceLocal = { get: defaults => Promise.resolve("optSyncEnabled" in defaults
  ? { optSyncEnabled: false } : { optTheme: "light", themePresetKey: "" }) };
const corrected = runOptionsEarly({ mode: "dark", preset: "dracula", chrome: { storage: { local: sourceLocal } } });
await new Promise(resolve => setImmediate(resolve));
check(corrected.values.get("pp-theme") === "light" && corrected.values.get("pp-theme-preset") === "" &&
  !("theme" in corrected.root.dataset), "options-theme-early.js: authoritative storage did not correct mirror and theme");

const optionsHead = optionsHtml.slice(optionsHtml.indexOf("<head>"), optionsHtml.indexOf("</head>"));
const optionsEarlyTag = '<script src="options-theme-early.js"></script>';
check(optionsHead.indexOf(optionsEarlyTag) >= 0 &&
  optionsHead.indexOf(optionsEarlyTag) < optionsHead.indexOf('<link rel="stylesheet" href="options.css">') &&
  (optionsHtml.match(/options-theme-early\.js/g) || []).length === 1,
  "options.html: theme bootstrap is not one synchronous head script before options.css");
check(/\.container\s*{[\s\S]{0,100}visibility:\s*hidden/.test(optionsCss) &&
  /html\[data-options-ready\]\s+\.container\s*{\s*visibility:\s*visible/.test(optionsCss),
  "options.css: stable first-frame gate is missing");
function inOrder(source, ...parts) {
  let cursor = -1;
  return parts.every(part => (cursor = source.indexOf(part, cursor + 1)) >= 0);
}
const optionsThemeApplyStart = optionsJs.indexOf("function applyOptionsPageTheme");
const optionsThemeApplyEnd = optionsJs.indexOf("// Track active preset key", optionsThemeApplyStart);
const optionsThemeApply = optionsJs.slice(optionsThemeApplyStart, optionsThemeApplyEnd);
check(optionsThemeApply.includes("pbpApplyOptionsEarlyTheme(themeMode, presetKey)") &&
  !optionsThemeApply.includes("pbpStoreOptionsThemeMirror"),
  "options.js: visual theme apply also mutates the persisted mirror");
check(inOrder(optionsJs,
  "Object.entries(fieldMap)", "el.value = val", "Object.entries(checkMap)", "el.checked = val",
  "syncKeysToggle.checked = syncApiKeys", "applyOptionsPageTheme(currentPresetKey, s.optTheme);",
  "pbpStoreOptionsThemeMirror(s.optTheme, currentPresetKey);",
  'document.documentElement.dataset.optionsReady = "1";', "// Language change"),
  "options.js: General values, authoritative theme/mirror, and ready gate are out of order");
const optionsSnapshotStart = optionsJs.indexOf("async function pbpSaveOptionsSnapshot");
const optionsSnapshotEnd = optionsJs.indexOf("function pbpQueueOptionsSave", optionsSnapshotStart);
const optionsSnapshot = optionsJs.slice(optionsSnapshotStart, optionsSnapshotEnd);
const optionsSaveAllStart = optionsJs.indexOf("async function saveAll()", optionsSnapshotEnd);
const optionsSaveAllEnd = optionsJs.indexOf("function reportAutoSaveFailure", optionsSaveAllStart);
const optionsSaveAll = optionsJs.slice(optionsSaveAllStart, optionsSaveAllEnd);
check(inOrder(optionsSnapshot, "await persist(settingsDelta)", "if (!res.ok)",
  "if (onSettingsSaved) onSettingsSaved(settingsDelta);",
  "overlay = await saveOverlay(overlayValue);") &&
  /onSettingsSaved\(settingsDelta\)[\s\S]*pbpStoreOptionsThemeMirror\(data\.optTheme, data\.themePresetKey\)/.test(optionsSaveAll),
  "options.js: theme mirror is updated before settings persistence succeeds or after overlay work");

check(/const el = document\.createElement\("button"\);[\s\S]{0,240}el\.className = "stag";/.test(popupTagsJs), "popup-tags.js: suggested tag is not a button");
check(/const aa = document\.createElement\("button"\);[\s\S]{0,240}aa\.className = "add-all-link";/.test(popupTagsJs), "popup-tags.js: add-all is not a button");
check(/const rm = document\.createElement\("button"\);[\s\S]{0,240}rm\.className = "tag-remove";/.test(popupTagsJs), "popup-tags.js: tag remove is not a button");
check(/<button\b(?=[^>]*id="tags-last-used")(?=[^>]*type="button")[^>]*>/.test(popupHtml), "popup.html: #tags-last-used is not a button");

check(/<section\b(?=[^>]*id="batch-permission")(?=[^>]*aria-labelledby="batch-permission-title")[^>]*>/.test(popupHtml) &&
  /<ul\b[^>]*id="batch-permission-list"[^>]*>/.test(popupHtml),
  "popup.html: Batch permission disclosure lacks labelled section/list semantics");
check(["batch-permission-grant", "batch-permission-cancel"].every(id =>
  new RegExp(`<button\\b(?=[^>]*id="${id}")(?=[^>]*type="button")[^>]*>`).test(popupHtml)),
  "popup.html: Batch permission actions are not real buttons");
const batchGrantStart = popupBatchJs.indexOf('grantBtn?.addEventListener("click", async () =>');
const batchGrantEnd = popupBatchJs.indexOf('cancelBtn?.addEventListener', batchGrantStart);
const batchGrant = popupBatchJs.slice(batchGrantStart, batchGrantEnd);
check(batchGrantStart >= 0 && batchGrantEnd > batchGrantStart &&
  batchGrant.indexOf("await chrome.permissions.request({ origins: pending.origins })") === batchGrant.indexOf("await ") &&
  batchGrant.indexOf("await chrome.permissions.request({ origins: pending.origins })") < batchGrant.indexOf("await dispatchBatchSave"),
  "popup-batch.js: Grant does not request the disclosed origins as its first await before starting Batch");
check(!/\bconfirm\s*\(/.test(popupBatchJs) && !popupBatchJs.includes("BATCH_PERMISSION_DISCLOSE_LIMIT") &&
  !popupBatchJs.includes("batchPermMore") && !popupBatchJs.includes("*://*/*"),
  "popup-batch.js: native confirm, truncated disclosure, or broad wildcard remains");
// Destructive micro-actions use the anchored confirm popover everywhere. The
// sanctioned native dialogs are the sync-enable conflict chain and the
// account-wide credential-sync disable confirmation.
check(!/\bconfirm\s*\(/.test(popupJs),
  "popup.js: a native confirm() dialog crept back in (use showConfirmPopover)");
check(!/\bconfirm\s*\(/.test(read("options-notes.js")),
  "options-notes.js: a native confirm() dialog crept back in (use showConfirmPopover)");
check((optionsJs.match(/\bconfirm\(t\(/g) || []).length === 3 &&
  optionsJs.includes('confirm(t("syncApiKeysDisableConfirm"))'),
  "options.js: native confirm() calls drifted from the sanctioned sync transitions");
check(/\.batch-permission-list\s*\{[\s\S]*?max-height:\s*92px;[\s\S]*?overflow:\s*auto;/.test(popupCss),
  "popup.css: complete Batch permission list is not bounded with scrolling");

check(/<aside\b(?=[^>]*id="rail")(?=[^>]*aria-labelledby="preview-title")[^>]*>/.test(mdHtml),
  "md-preview.html: mobile drawer is not labelled by the document title");
const drawerSetupStart = mdPreviewJs.indexOf("function setupDrawer()");
const drawerSetupEnd = mdPreviewJs.indexOf("function pbpRailDrawerClose()", drawerSetupStart);
const drawerSetup = mdPreviewJs.slice(drawerSetupStart, drawerSetupEnd);
const drawerCloseEnd = mdPreviewJs.indexOf("function pbpFocusArticleTarget", drawerSetupEnd);
const drawerClose = mdPreviewJs.slice(drawerSetupEnd, drawerCloseEnd);
check(drawerSetupStart >= 0 && drawerSetup.includes("main.inert = true") &&
  drawerSetup.includes('rail.setAttribute("aria-modal", "true")') &&
  drawerSetup.includes("requestAnimationFrame(() =>") &&
  drawerSetup.includes('(document.getElementById("btn-rendered") || rail).focus()') &&
  drawerSetup.includes('window.matchMedia("(max-width: 1000px)").addEventListener("change"') &&
  drawerSetup.includes("if (!e.matches) pbpRailDrawerClose()"),
"md-preview.js: drawer open/breakpoint state does not manage modal inertness");
check(drawerClose.includes('document.body.classList.remove("rail-open")') &&
  drawerClose.includes("scrim.hidden = true") && drawerClose.includes('rail.removeAttribute("aria-modal")') &&
  drawerClose.includes("main.inert = false"),
"md-preview.js: shared drawer close does not clear every modal state");
const focusTargetEnd = mdPreviewJs.indexOf("// In tr-only mode", drawerCloseEnd);
const focusTarget = mdPreviewJs.slice(drawerCloseEnd, focusTargetEnd);
check(focusTarget.includes("pbpRailDrawerClose()") && focusTarget.includes("target.focus({ preventScroll: true })") &&
  mdPreviewJs.includes("pbpFocusArticleTarget(target);") &&
  mdAskJs.includes("pbpFocusArticleTarget(target);") &&
  (mdHighlightJs.match(/pbpFocusArticleTarget\(/g) || []).length >= 2,
"md-preview: TOC, Ask citations, and Notebook do not share visible-target focus recovery");

const askOpen = mdAskJs.slice(mdAskJs.indexOf("function _pbpAskSetOpen"), mdAskJs.indexOf("// Clear:", mdAskJs.indexOf("function _pbpAskSetOpen")));
check(askOpen.includes("drawerWasOpen") && askOpen.includes("pbpRailDrawerClose()") &&
  askOpen.includes('document.getElementById("rail-toggle")') && askOpen.includes("getBoundingClientRect()") &&
  askOpen.includes('document.getElementById("ask-open")') && askOpen.includes(".find(isVisible)"),
"md-ask.js: opening Ask from the drawer leaves a hidden opener/focus target");
const askError = mdAskJs.slice(mdAskJs.indexOf("function _pbpAskErrorUi"), mdAskJs.indexOf("// Core runner", mdAskJs.indexOf("function _pbpAskErrorUi")));
check(askError.indexOf("aEl.focus()") >= 0 && askError.indexOf("aEl.focus()") < askError.indexOf("aEl.replaceChildren()"),
  "md-ask.js: Ask retry removes its focused button before focus handoff");
const askClear = mdAskJs.slice(mdAskJs.indexOf("function _pbpAskShowClearConfirm"), mdAskJs.indexOf("// ---- Restore persisted", mdAskJs.indexOf("function _pbpAskShowClearConfirm")));
check(askClear.indexOf("input.focus()") < askClear.indexOf("strip.remove()") &&
  askClear.indexOf("clearBtn.focus()") < askClear.lastIndexOf("strip.remove()"),
"md-ask.js: clear confirmation removes the focused action before focus handoff");
const askRegenerate = mdAskJs.slice(mdAskJs.indexOf("function _pbpAskRegenerate"), mdAskJs.indexOf("// ---- Clear:", mdAskJs.indexOf("function _pbpAskRegenerate")));
check(askRegenerate.indexOf("el.focus()") >= 0 && askRegenerate.indexOf("el.focus()") < askRegenerate.indexOf("el.replaceChildren()"),
  "md-ask.js: regenerate removes its focused button before focus handoff");
const skimRegenFocus = mdSkimJs.slice(mdSkimJs.indexOf("async function _pbpSkimRegen"), mdSkimJs.indexOf("// Init hookup", mdSkimJs.indexOf("async function _pbpSkimRegen")));
check(skimRegenFocus.indexOf("body.focus()") >= 0 && skimRegenFocus.indexOf("body.focus()") < skimRegenFocus.indexOf("body.replaceChildren()"),
  "md-skim.js: retry removes its focused button before focus handoff");
const explainRun = mdAskJs.slice(mdAskJs.indexOf("async function _pbpExplainRun"), mdAskJs.indexOf("// ---- Explain: open", mdAskJs.indexOf("async function _pbpExplainRun")));
check(explainRun.indexOf("body.focus()") >= 0 && explainRun.indexOf("body.focus()") < explainRun.indexOf("body.replaceChildren()"),
  "md-ask.js: Explain retry removes its focused button before focus handoff");
const explainShell = mdAskJs.slice(mdAskJs.indexOf("// ---- Explain: popover shell"), mdAskJs.indexOf("// ---- Explain: context pack"));
check(explainShell.includes('pop.setAttribute("popover", "manual")') &&
  explainShell.includes("PBP_EXPLAIN_PIN_SVG") && explainShell.includes("PBP_EXPLAIN_CLOSE_SVG") &&
  explainShell.includes('pin.className = "xp-pin"') && explainShell.includes('close.className = "xp-close"') &&
  explainShell.includes('pin.setAttribute("aria-keyshortcuts", "Alt+ArrowUp Alt+ArrowDown Alt+ArrowLeft Alt+ArrowRight")') &&
  explainShell.includes('pin.setAttribute("aria-pressed"') && explainShell.includes('pin.setAttribute("aria-label", label)') &&
  explainShell.includes('close.setAttribute("aria-label", t("explainClose"))'),
"md-ask.js: explain-pop is not a manual popover with native pin/close SVG controls");
check(explainShell.indexOf("_pbpExplainSetPinned(pop, false)") > explainShell.indexOf("pop.appendChild(head)"),
  "md-ask.js: explain pin is initialized before it becomes a popover descendant");
check(explainShell.includes("setPointerCapture") && explainShell.includes('addEventListener("pointermove"') &&
  explainShell.includes('addEventListener("pointercancel"') && explainShell.includes('addEventListener("resize"') &&
  explainShell.includes("new ResizeObserver") && explainShell.includes('matches(":popover-open")') &&
  explainShell.includes("e.altKey") && explainShell.includes("pbpExplainClampPosition") &&
  explainShell.includes('dragZone.className = "xp-drag-zone"') && explainShell.includes("!e.isPrimary"),
"md-ask.js: explain-pop lacks pointer capture, viewport clamping, resize handling, or Alt+Arrow movement");
check(explainShell.includes('document.querySelectorAll(":popover-open")') &&
  explainShell.includes("some((el) => el !== pop)"),
"md-ask.js: pinned explain-pop consumes Escape before a visually upper transient popover");
check(explainRun.includes("if (_pbpExplainAbort === ctrl) body.removeAttribute(\"aria-busy\")"),
"md-ask.js: a superseded Explain run can clear the active run's busy state");
check(explainShell.includes("explainTranslateSelection") && explainShell.includes("dictLookupSelection") &&
  explainRun.includes("explainTranslateLoading") && explainRun.includes("dictLoading") &&
  explainRun.includes("explainAiNotConfigured") && explainRun.includes("explainTranslateAiNotConfigured"),
"md-ask.js: dialog names, loading states, or no-AI messages are not action-specific");
const explainOpen = mdAskJs.slice(mdAskJs.indexOf("function _pbpExplainOpenPop"), mdAskJs.indexOf("// ---- Card AI row entry point"));
check(explainOpen.includes("_pbpExplainPinned") && explainOpen.includes('if (!pop.matches(":popover-open")) pop.showPopover()') &&
  explainOpen.includes("if (!_pbpExplainPinned)"),
"md-ask.js: pinned explain re-entry can hide/show or re-anchor the popover");
check(mdReaderJsSource.includes("_pbpReaderKeepPopover") &&
  (mdReaderJsSource.match(/_pbpReaderHideOtherPopovers\(/g) || []).length >= 5 &&
  mdHighlightJs.includes("pbpExplainDismissIfUnpinned"),
"reader/highlight popover mutual exclusion does not preserve a pinned explain-pop");
check(mdCss.includes(".xp-window-actions") && mdCss.includes(".xp-pin") && mdCss.includes(".xp-close") &&
  mdCss.includes(".xp-dragging") && mdCss.includes(".xp-drag-zone") &&
  !/\.xp-(?:pin|close)[^\n]*[📌📍✕×]/u.test(mdCss),
"md-preview.css: explain window controls or drag state are missing, or use literal symbol glyphs");
// The header reflow used to hang off a `@media (max-width: 420px)` breakpoint,
// which keyed on the VIEWPORT while the card is a fixed 420px -- so on any
// desktop it never fired and the title was squeezed to a few characters. The
// two-row layout is now unconditional, which is what the breakpoint was reaching
// for anyway. Pinned structurally so nobody folds it back behind a query.
check(/\.xp-head \{[^}]*flex-wrap: wrap;/.test(mdCss) &&
  /\.xp-act-group \{[^}]*flex: 1 0 100%;/.test(mdCss) &&
  /\.xp-term \{[^}]*flex: 1 1 48px;/.test(mdCss),
"md-preview.css: the explain header stopped giving the action group its own row and the title the rest");
// The drag zone must not grow. Once the title started taking free space, a
// growing drag zone split it and cut German to 40% of the card.
check(/\.xp-drag-zone \{[\s\S]{0,400}?flex: 0 0 12px;/.test(mdCss),
"md-preview.css: the drag zone grows again and competes with the title for width");
check(mdDictJs.includes("dictMatchedHeadword") && mdDictJs.includes("dictPermissionDenied") &&
  mdDictJs.includes("dictConnectRetry") && mdDictJs.includes("dictUpdateVocab") &&
  mdDictJs.includes("Intl.DisplayNames") && optionsVocabJs.includes("pbpDictLanguageLabel"),
"dictionary UI does not disclose fallback headwords, permission denial, saved-word updates, or localized language names");

const articleInject = mdPreviewJs.indexOf("renderedView.innerHTML = renderedHtml");
const firstProgressQueue = mdPreviewJs.indexOf("queueReadingStats();", articleInject);
check(articleInject >= 0 && firstProgressQueue > articleInject &&
  !mdPreviewJs.slice(mdPreviewJs.indexOf("// Reading stats"), articleInject).includes("renderStats();") &&
  mdPreviewJs.includes("new ResizeObserver(queueReadingStats).observe(renderedView)"),
"md-preview.js: reading progress is measured before article layout or not refreshed after layout changes");

// i18n substitutions ride t()/getMessage() ARGS, never a manual replace on
// the result: for any messages.json key carrying a "placeholders" block,
// chrome.i18n.getMessage (the t() fallback in auto-language mode) consumes
// $NAME$ placeholders BEFORE a manual replace could see them -- the value
// silently rendered empty (mdEmbedPartial counts and the reading-progress
// percent shipped blank for every auto-language user until 2026-07). The
// pattern bans ANY literal $NAME$ manual replace/replaceAll in root JS
// (Codex cross-audit: anchoring on the t(...) call missed nested-paren args,
// a variable between call and replace, and replaceAll); $NAME$ syntax exists
// only for i18n placeholders here, and the safe {name}-token replaces on
// placeholder-less keys don't match.
for (const f of readdirSync(root).filter((n) => n.endsWith(".js"))) {
  const m = read(f).match(/\.replace(?:All)?\(\s*["'`]\$[A-Za-z_]\w*\$["'`]\s*,/);
  check(!m, `${f}: literal $NAME$ manual replace -- pass substitutions as t() args instead -> ${m && m[0]}`);
}
// applyI18n (i18n.js) can never supply substitutions, so a placeholders key
// wired to a data-i18n* attribute renders empty (auto mode) or as a literal
// $NAME$ (manual language) -- the intersection must stay empty.
// Plus a HEURISTIC dead-key smoke check: every placeholders key's string
// literal must appear somewhere in root JS/HTML (batchSavedNotify survived
// the batch-to-SW migration by a year). Heuristic by design: a comment can
// satisfy it and it doesn't verify arg counts -- the runtime audit for that
// was done by hand (Codex-verified, 2026-07); this just catches key deletions
// and renames going stale.
{
  const enMessages = JSON.parse(read("_locales/en/messages.json"));
  const phKeys = Object.entries(enMessages).filter(([, d]) => d && d.placeholders).map(([k]) => k);
  const htmlSrc = readdirSync(root).filter((n) => n.endsWith(".html")).map(read).join("\n");
  const allSrc = readdirSync(root).filter((n) => n.endsWith(".js")).map(read).join("\n") + htmlSrc;
  for (const key of phKeys) {
    check(!new RegExp(`data-i18n[a-z-]*="${key}"`).test(htmlSrc),
      `md/popup/options HTML: placeholders key "${key}" bound via data-i18n* (applyI18n cannot pass substitutions)`);
    check(allSrc.includes(`"${key}"`), `_locales/en: placeholders key "${key}" has no call site in any root JS/HTML (dead key across 9 locales?)`);
  }
}

// ---- Reader typography invariants (plan B, the four defects Codex acceptance
// reproduced live -- each check encodes one so it cannot silently return;
// .qa-scan/typo-export-probe.mjs is the manual behavioral deep-probe, this is
// the per-verify gate). ----
const mdReaderJs = read("md-reader.js");
// (1) Load race: the tier maps/apply MUST live in shared.js (loaded before
// md-preview.js), never in the later md-reader.js defer script; and the
// pre-render read in md-preview.js must fetch the tier keys with the payload.
check(sharedJs.includes("function pbpTypoApplyVars") && sharedJs.includes("PBP_TYPO_FONT_SCALES"),
  "shared.js: typography tier maps/apply moved out (md-preview.js pre-render apply would race again)");
check(!mdReaderJs.includes("function pbpTypoApplyVars") && !mdReaderJs.includes("PBP_TYPO_FONT_SCALES ="),
  "md-reader.js: re-defines typography maps/apply (load-order race: it loads AFTER md-preview.js)");
{
  // Both indexes checked >= 0 explicitly: a DELETED apply call returns -1,
  // and -1 < renderAt would sail through the bare comparison (Codex final
  // review) -- the gate must catch removal, not just reordering.
  const applyAt = mdPreviewJs.indexOf("pbpTypoApplyVars(");
  const renderAt = mdPreviewJs.indexOf("renderedView.innerHTML = renderedHtml");
  check(mdPreviewJs.includes('"pbp_font_tier", "pbp_leading_tier"]') &&
    applyAt >= 0 && renderAt >= 0 && applyAt < renderAt,
    "md-preview.js: typography tiers not applied before the first render (rode the MP_KEY read)");
}
// (2) Scroll grab: tier changes settle the anchor SYNCHRONOUSLY -- the 300ms
// second phase belongs to the width path's max-width transition only.
{
  const typoSet = mdReaderJs.slice(mdReaderJs.indexOf("function _pbpTypoSet"), mdReaderJs.indexOf("function _pbpTypoSyncPop"));
  check(typoSet.includes("_pbpZenSettleAnchor(anchor)") && !typoSet.includes("_pbpZenSettleAfterLayout"),
    "md-reader.js: _pbpTypoSet uses the delayed two-phase settle (drags a user scroll back within 300ms)");
  check(mdReaderJs.includes("if (window.scrollY === 0) return null;"),
    "md-reader.js: _pbpZenCaptureAnchor lost the scrollY=0 guard (layout change at page top scrolls the reader)");
}
// (3) h4-h6 stay pinned while p/li follow the leading tier.
{
  // Voice round 2026-07 split the combined h4-h6 rule into three (distinct
  // sizes/colours); the PIN contract survives per-level: each heading rule
  // must carry its own literal line-height so none follows the leading tier.
  for (const h of ["h4", "h5", "h6"]) {
    check(new RegExp("#rendered-view " + h + " \\{[^}]*line-height: 1\\.75;").test(mdCss),
      "md-preview.css: " + h + " lost its pinned line-height (it would follow the prose leading tier)");
  }
  check((mdCss.match(/line-height: var\(--pbp-prose-leading, 1\.75\)/g) || []).length >= 3,
    "md-preview.css: the prose leading var no longer covers container+p+li");
}
// (4) Print: the consolidated open-popover hide must sit AFTER every
// ':popover-open { display: flex }' base rule (equal (1,1,0) specificity --
// source order decides, media queries add none) and must cover every popover.
{
  const lastFlex = mdCss.lastIndexOf(":popover-open { display: flex; }");
  const hideBlock = mdCss.indexOf("#explain-pop:popover-open, #pb-hl-bar:popover-open");
  check(hideBlock > lastFlex && hideBlock !== -1,
    "md-preview.css: consolidated print popover-hide block is missing or precedes a ':popover-open{display:flex}' base rule (open popovers print again)");
  const popIds = [...mdCss.matchAll(/#([a-z-]+):popover-open \{ display: flex; \}/g)].map((m) => m[1]);
  const hideRule = mdCss.slice(hideBlock, mdCss.indexOf("}", hideBlock));
  for (const id of popIds) {
    check(hideRule.includes(`#${id}:popover-open`), `md-preview.css: popover #${id} missing from the consolidated print hide (prints when open)`);
  }
}
// text-autospace must keep exempting the character grid.
check(mdCss.includes("text-autospace: normal") && /#rendered-view :is\(pre, code, kbd, samp\) \{\s*\n\s*text-autospace: no-autospace;/.test(mdCss),
  "md-preview.css: text-autospace code/pre exemption lost (autospace widens code glyph runs next to CJK)");

// ---- A4: export reuse of the preview fix cache (Codex-adjudicated). Scoped
// to the resolveEmbed function body, not the whole file. ----
{
  const embedFn = mdPreviewJs.slice(mdPreviewJs.indexOf("async function resolveEmbed"), mdPreviewJs.indexOf("// Fill header"));
  // The partition is synchronous and sits BEFORE the permission prompt --
  // chrome.permissions.request must stay the click chain's FIRST await, and a
  // full cache hit must reach zero-prompt/zero-network without ever asking.
  const partAt = embedFn.indexOf("pbpEmbedCacheEntryValid(");
  const permAt = embedFn.indexOf("chrome.permissions.request");
  check(partAt >= 0 && permAt >= 0 && partAt < permAt,
    "md-preview.js: resolveEmbed cache partition missing or moved after the permission prompt (first-await gesture invariant)");
  // The hotlink retry draws failures from the NETWORK list only: cache hits
  // and budget-dropped entries must never reach the DNR retry round.
  check(embedFn.includes("toFetch.filter((u) => !fetched.has(u))") &&
    !embedFn.includes("scan.candidates.filter((u) => !fetched.has(u))"),
    "md-preview.js: resolveEmbed retry round no longer scoped to the network list (cache/budget-dropped urls would refetch)");
}

// ---- Reduced motion ----
// scrollIntoView() only consults the `scroll-behavior` property when `behavior`
// is "auto" or omitted, so a `scroll-behavior: auto` inside a
// prefers-reduced-motion block cannot reach a call that passes "smooth".
// Whole-viewport travel is the most vestibular motion in the product, so every
// smooth scroll must route through pbpScrollIntoView, which checks the media
// query at the call site.
{
  const scrollOwners = {
    "shared.js": sharedJs, "popup.js": popupJs, "options.js": optionsJs,
    "md-preview.js": mdPreviewJs, "md-reader.js": mdReaderJs,
    "md-highlight.js": mdHighlightJs, "md-ask.js": mdAskJs,
    "md-translate.js": mdTranslateJs, "popup-tags.js": popupTagsJs,
  };
  for (const [name, src] of Object.entries(scrollOwners)) {
    // Raw `.scrollIntoView(` is allowed only when it cannot animate: either no
    // `behavior` at all (CSS default `auto`, and no stylesheet sets `smooth`)
    // or an explicit `"instant"`. shared.js owns the one guarded call.
    const raw = [...src.matchAll(/\.scrollIntoView\(\{[^}]*\}/g)]
      .map((m) => m[0])
      .filter((call) => /behavior:\s*"smooth"/.test(call));
    check(raw.length === 0,
      `${name}: smooth scrollIntoView bypasses pbpScrollIntoView, so prefers-reduced-motion cannot reach it (${raw.join(" | ")})`);
  }
  check(/function pbpScrollIntoView\([\s\S]{0,240}pbpPrefersReducedMotion\(\)[\s\S]{0,80}behavior: "instant"/.test(sharedJs),
    "shared.js: pbpScrollIntoView no longer downgrades to instant under prefers-reduced-motion");
  // A reduced-motion preference must not cost the user a status channel. The
  // blanket reset parks every infinite animation after one 0.01ms cycle, so each
  // status indicator restates its duration. The invariant asserted here is that
  // the override MIRRORS the base rule -- retiming the base rule then needs no
  // test edit, but forgetting to retime the override does fail.
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const lastMatch = (css, re) => { let m, last = null; while ((m = re.exec(css))) last = m[1]; return last; };
  const statusMotion = [
    ["popup.css", popupCss, ".tag-skel", "the AI tag skeleton"],
    ["popup.css", popupCss, ".offline-queue-retry.loading svg", "the offline retry spinner"],
    ["popup.css", popupCss, ".auto-close-bar", "the auto-close countdown, the only warning before the popup self-closes"],
    ["options.css", optionsCss, ".tab-btn.tab-busy::after", "the tab busy dot"],
    ["md-preview.css", mdCss, ".preview-spinner", "the page loading spinner"],
    ["md-preview.css", mdCss, ".xp-skel", "the streaming answer skeleton"],
    ["md-preview.css", mdCss, ".src-seg.loading::after", "the extraction spinner"],
  ];
  for (const [cssName, cssSrc, sel, what] of statusMotion) {
    const base = lastMatch(cssSrc, new RegExp(`${esc(sel)}\\s*\\{[^}]*animation:\\s*[\\w-]+\\s+([\\d.]+m?s)`, "g"));
    const override = lastMatch(cssSrc, new RegExp(`${esc(sel)}\\s*\\{[^}]*animation-duration:\\s*([\\d.]+m?s)\\s*!important`, "g"));
    check(base !== null, `${cssName}: cannot find the base animation for ${sel} — the status-motion contract has drifted`);
    check(override === base,
      `${cssName}: reduced motion no longer keeps ${what} running at its own rate (base ${base}, override ${override})`);
  }
  // The zen bar's positional half is vestibular; its idle fade is not. Killing
  // both turned the fade into a repeated hard brightness cut.
  const zenReduce = lastMatch(mdCss, /#zen-bar \{ transition: ([^}]*) \}/g);
  check(zenReduce !== null && /opacity/.test(zenReduce) && /!important/.test(zenReduce) && !/\bright\b/.test(zenReduce),
    `md-preview.css: the reduced-motion zen bar override no longer keeps opacity-only (${zenReduce})`);
  // The dead declaration is what made this bug invisible for so long: it read as
  // though reduced-motion scrolling were handled. It must not come back.
  for (const [name, src] of [["popup.css", popupCss], ["options.css", optionsCss], ["md-preview.css", mdCss]]) {
    const blocks = src.split("@media (prefers-reduced-motion: reduce)").slice(1);
    check(!blocks.some((b) => /scroll-behavior:/.test(b.slice(0, b.indexOf("\n}")))),
      `${name}: a reduced-motion block declares scroll-behavior again — it cannot reach scrollIntoView() and reads as false coverage`);
  }
}

// ---- Custom properties read from JS must exist in the stylesheet ----
// getPropertyValue() on a missing custom property returns "", so a `|| fallback`
// turns a deleted token into a silent downgrade rather than an error. That is
// exactly how retiring --motion-ease left the rail fold running on the weak
// built-in curve while every CSS-side check still passed.
{
  const surfaces = [
    { css: ["md-preview.css", mdCss], js: [["md-preview.js", mdPreviewJs], ["md-reader.js", mdReaderJs],
      ["md-ask.js", mdAskJs], ["md-highlight.js", mdHighlightJs], ["md-skim.js", mdSkimJs]] },
    { css: ["popup.css", popupCss], js: [["popup.js", popupJs], ["popup-ai.js", popupAiJs], ["popup-batch.js", popupBatchJs]] },
    { css: ["options.css", optionsCss], js: [["options.js", optionsJs], ["options-connectivity.js", optionsConnectivityJs]] },
  ];
  for (const { css: [cssName, cssSrc], js } of surfaces) {
    for (const [jsName, jsSrc] of js) {
      for (const m of jsSrc.matchAll(/getPropertyValue\(\s*"(--[a-z0-9-]+)"\s*\)/g)) {
        const token = m[1];
        check(new RegExp(`^\\s*${token}\\s*:`, "m").test(cssSrc),
          `${jsName} reads ${token} but ${cssName} does not define it — getPropertyValue returns "" and the fallback silently takes over`);
      }
    }
  }
}

// ---- Auto-close: cancelled by interaction, never merely paused ----
// The bar must never depict a countdown that is not running, which is what the
// old CSS-only `body:hover { animation-play-state: paused }` did while the
// setTimeout kept going. Reaching for the popup now cancels outright -- but the
// popup opens under a cursor already resting on the toolbar button, so the move
// that lands there must not count, or the feature would never fire for anyone.
{
  const block = popupJs.slice(popupJs.indexOf('bar.className = "auto-close-bar"'),
    popupJs.indexOf('if (btn.classList.contains("saved-success")) setSubmitState("idle"); }, 1200)'));
  check(!/^[^/*\n]*animation-play-state\s*:\s*paused/m.test(popupCss),
    "popup.css: the auto-close bar can be frozen again while its timer keeps running");
  check(/Math\.abs\(e\.clientX - moveOrigin\.x\) < 8 && Math\.abs\(e\.clientY - moveOrigin\.y\) < 8/.test(block),
    "popup.js: the auto-close pointer cancel lost its distance threshold, so the cursor the popup opens under cancels it immediately");
  check(block.includes('document.addEventListener("pointermove", onAutoCloseMove)') &&
    block.includes('document.addEventListener("mousedown", cancelAutoClose, { once: true })'),
    "popup.js: the auto-close is no longer cancelled by both pointer movement and a click");
  check((block.match(/removeEventListener\("pointermove", onAutoCloseMove\)/g) || []).length >= 2,
    "popup.js: the auto-close pointermove listener outlives the countdown on at least one path");
}

// ---- Tag reorder handle: visible while the tags are being edited ----
{
  check(/\.tags-display:hover \.tag-drag-handle,\s*\n\s*\.tags-input-wrap:focus-within \.tag-drag-handle \{ opacity: 0\.5; \}/.test(popupCss),
    "popup.css: the tag drag handle is hover-only again, so reordering is undiscoverable while you are typing tags");
  // Reordering is HTML5 drag-and-drop, which touch does not deliver. Revealing
  // the handle there would advertise a control that cannot be used.
  check(!/@media \(hover: none\)[\s\S]{0,200}\.tag-drag-handle/.test(popupCss) &&
    !/@media \(pointer: coarse\)[\s\S]{0,200}\.tag-drag-handle/.test(popupCss),
    "popup.css: the tag drag handle is revealed on coarse pointers, where HTML5 drag-and-drop cannot reorder anything");
}

// ---- Explain popover: the drag must not commit on a plain press ----
{
  const down = mdAskJs.slice(mdAskJs.indexOf('head.addEventListener("pointerdown"'),
    mdAskJs.indexOf('const endDrag = (e) =>'));
  const [downHandler, moveHandler] = down.split('head.addEventListener("pointermove"');
  // Pinning takes the card out of light-dismiss, so pinning on pointerdown made
  // a press that only meant to grab the card silently change how it closes.
  check(!downHandler.includes("_pbpExplainSetPinned") && !downHandler.includes('classList.add("xp-dragging")'),
    "md-ask.js: the explain popover pins (and leaves light-dismiss) on pointerdown, before the pointer has moved");
  check(moveHandler.includes("drag.moved") &&
    /Math\.abs\(e\.clientX - drag\.x\) < 4 && Math\.abs\(e\.clientY - drag\.y\) < 4/.test(moveHandler) &&
    moveHandler.includes("_pbpExplainSetPinned(pop, true)"),
    "md-ask.js: the explain popover drag lost its movement threshold, so a press commits a drag");
  // Placement must come from the SPACE available, never from a height measured
  // before _pbpExplainRun fills the body on the very next line. Measuring the
  // shell made the card crawl as the answer streamed; budgeting to the card's
  // max height instead flung short cards to the far edge.
  // The reader panel's icons are one family: Feather, 24x24, stroke 2, round caps
// and joins. The gear, pin and close were already drawn that way, so a
// hand-drawn set beside them read as a different toolkit even though the stroke
// width matched -- that is exactly how the foot actions went wrong. Pinned here
// so the next icon cannot drift, since nothing else would catch it.
{
  // Two families are allowed and nothing else. Feather 24 is the reader panel;
  // the 16-box set is deliberate and separate, because those are badges rendered
  // at 11-14px where Feather's geometry is too coarse. Skipping unknown
  // viewBoxes instead of rejecting them would let a drifting icon escape simply
  // by changing its box -- which is how the first version of this check passed a
  // deliberately broken icon.
  const FEATHER_24 = ['viewBox="0 0 24 24"', 'fill="none"', 'stroke="currentColor"',
    'stroke-width="2"', 'stroke-linecap="round"', 'stroke-linejoin="round"'];
  // The 16-box family had no pin at all, and drifted to four stroke widths
  // (1.3 / 1.4 / 1.5 / 1.6 / 1.8) across five files before this existed.
  const BOX_16 = ['viewBox="0 0 16 16"', 'fill="none"', 'stroke="currentColor"',
    'stroke-width="1.5"', 'stroke-linecap="round"', 'stroke-linejoin="round"'];
  const surfaces = {
    "md-ask.js": mdAskJs, "md-dict.js": mdDictJs, "md-translate.js": mdTranslateJs,
    "md-reader.js": mdReaderJs, "md-preview.js": mdPreviewJs, "shared.js": sharedJs,
    "pinboard-sort.js": read("pinboard-sort.js"),
  };
  const offenders = [];
  const classify = (file, name, tag) => {
    const family = tag.includes('viewBox="0 0 16 16"') ? BOX_16
      : tag.includes('viewBox="0 0 24 24"') ? FEATHER_24 : null;
    if (!family) { offenders.push(`${file}:${name} (foreign viewBox)`); return; }
    const missing = family.filter((attr) => !tag.includes(attr));
    if (missing.length) offenders.push(`${file}:${name} (${missing.join(" ")})`);
  };
  for (const [file, src] of Object.entries(surfaces)) {
    // Matches both the `const PBP_*_SVG = '<svg ...>'` constants and the icon
    // registry entries in shared.js, which are `name: '<svg ...>'`.
    for (const m of src.matchAll(/(PBP_[A-Z0-9_]*SVG|[a-zA-Z][a-zA-Z0-9]*)\s*[:=]\s*'(<svg[^>]*>)/g)) classify(file, m[1], m[2]);
  }
  // The reader's own markup carries six icons directly. They were the family
  // the JS ones are measured against, so leaving them unpinned would mean the
  // reference itself could drift.
  const mdPreviewHtml = read("md-preview.html");
  [...mdPreviewHtml.matchAll(/<svg[^>]*>/g)].forEach((m, i) => classify("md-preview.html", `svg#${i + 1}`, m[0]));
  check(offenders.length === 0,
    `inline icons left their family: ${offenders.join(", ")}`);
}

// Foot actions are icon-only. Any textContent assignment to one of them wipes
  // the SVG and leaves a blank square, which is how the vocabulary button broke
  // the first time. Names must come from title AND aria-label, never from text.
  check(!/\b(?:save|vocab|vocabBtn|openVocab|ask)\.textContent\s*=/.test(mdAskJs),
    "md-ask.js: a foot action is assigned textContent, which erases its icon");
  check(/function _pbpExplainIconBtn\(btn, svg, label\)[\s\S]{0,200}btn\.title = label;[\s\S]{0,120}aria-label", label/.test(mdAskJs),
    "md-ask.js: the foot-action helper stopped setting both the tooltip and the accessible name");
  // Either a literal inline <svg> or a guarded alias of a shared PBP_ICONS
  // member (the Lucide family) -- both are SVG; the contract's target is
  // emoji/dingbat text sneaking back in, not the sourcing of the paths.
  check(["PBP_EXPLAIN_NOTE_SVG", "PBP_EXPLAIN_VOCAB_ADD_SVG", "PBP_EXPLAIN_VOCAB_OPEN_SVG", "PBP_EXPLAIN_ASK_SVG"]
    .every((name) => new RegExp(`const ${name} = (?:'<svg|typeof PBP_ICONS !== "undefined" \\? PBP_ICONS\\.[A-Za-z]+ : "")`).test(mdAskJs)),
    "md-ask.js: a foot-action icon is no longer an SVG constant (literal or PBP_ICONS alias)");

  // The side choice now lives in a pure helper so it can be unit-tested; this
  // only pins that placement still asks it, and that the threshold is the
  // comfort one. MIN_CARD alone let a selection near the foot of the window open
  // into a 160px sliver with a screenful of unused space above it.
  check(/const openDown = pbpExplainOpensDown\(below, above\);/.test(mdAskJs) &&
    /function pbpExplainOpensDown\(below, above\)/.test(mdAskJs) &&
    /b >= PBP_EXPLAIN_COMFORT_CARD \|\| b >= a/.test(mdAskJs),
    "md-ask.js: the explain popover side choice left its tested helper or dropped the comfort threshold");
  check(/const room = openDown \? below : above;/.test(mdAskJs) &&
    /pop\.style\.maxHeight = Math\.floor\(Math\.min\(.*, room\)\) \+ "px";/.test(mdAskJs),
    "md-ask.js: the explain popover height budget can exceed the room on the side it was placed on, so it overflows and gets clawed back");
  // Opening upward has to keep the BOTTOM edge pinned to the selection, or the
  // card grows down over the very text it is explaining.
  check(/_pbpExplainAnchorBottom = rect\.top - edge;/.test(mdAskJs) &&
    /_pbpExplainAnchorBottom === null \? r\.top : _pbpExplainAnchorBottom - r\.height/.test(mdAskJs),
    "md-ask.js: an upward-opening explain popover is no longer bottom-anchored, so streamed content grows back over the selection");
  // Both are per-open state; leaking the inline budget would also make the next
  // open read it back instead of the stylesheet cap.
  check(/_pbpExplainAnchorBottom = null;\s*\n\s*pop\.style\.removeProperty\("max-height"\);/.test(mdAskJs),
    "md-ask.js: closing the explain popover leaves its anchor or its inline height budget behind for the next open");
  check(/#explain-pop \{[\s\S]{0,400}max-height: min\(480px, calc\(100vh - 32px\)\);/.test(mdCss),
    "md-preview.css: #explain-pop lost the max-height that md-ask.js reads back for placement");
  // The value must be derived from the skeleton and expressed in em, so it tracks
  // the typography tier the skeleton bars are also sized in. A round px number is
  // the tell that it was guessed again.
  check(/\.xp-body \{[\s\S]{0,700}min-height: calc\([\d.]+em \+ \d+px\);/.test(mdCss),
    "md-preview.css: .xp-body min-height is no longer derived from the skeleton in em, so the card shrinks then re-grows on the first token");
}

// ---- Connectivity tests: one run per target, and no cross-run status wipe ----
{
  {
    const fn = optionsConnectivityJs.slice(optionsConnectivityJs.indexOf("async function testAIProvider"),
      optionsConnectivityJs.indexOf('["gemini","openai"'));
    const disableAt = fn.indexOf("btn.disabled = true");
    const tryAt = fn.indexOf("try {");
    const finallyAt = fn.lastIndexOf("} finally {");
    check(disableAt > 0 && tryAt > disableAt && finallyAt > tryAt && fn.slice(finallyAt).includes("btn.disabled = false"),
      "options-connectivity.js: provider Test buttons no longer disable for the run and re-enable in a finally, so two runs can share one status element");
  }
  // Anonymous clear timers let a finished run erase the next run's real result.
  check(!/setTimeout\(\(\) => \{ statusEl\.textContent = ""/.test(optionsConnectivityJs),
    "options-connectivity.js: a status clear timer is unkeyed again — a finished run will wipe the next run's result off screen");
  check(optionsConnectivityJs.includes("const _testClearTimers = new Map();") &&
    /function scheduleStatusClear\(key, statusEl, ms\) \{\s*\n\s*cancelStatusClear\(key\);/.test(optionsConnectivityJs),
    "options-connectivity.js: the per-target status clear timers are gone");
}

// ---- Site-theme cloak: paint the themed background, never the white canvas ----
{
  const styleJs = read("pinboard-style.js");
  // The cloak must hide the BODY and paint the root, not just zero the root's
  // opacity: opacity on the root is not a reliable way to keep the propagated
  // canvas background painted, and the canvas is exactly what shows for the
  // up-to-400ms the theme takes to load.
  check(/html \{ background: \$\{_pbpCloakBg\} !important; \} html > \* \{ opacity: 0 !important; \}/.test(styleJs),
    "pinboard-style.js: cloak no longer paints the cached background under every rendered child, so themed loads flash the browser's white canvas");
  check(styleJs.includes('_pbpCloak.textContent = _pbpCloakBg'),
    "pinboard-style.js: cloak stopped branching on a cached background");
  // The cached value comes out of pinboard.in's own localStorage and goes into
  // a <style> element. It must be validated on the way in, every time.
  const reSrc = styleJs.match(/const PBP_CLOAK_BG_RE = (\/.*\/);/);
  check(!!reSrc, "pinboard-style.js: PBP_CLOAK_BG_RE is gone — the cached colour would reach <style> unvalidated");
  if (reSrc) {
    check(/PBP_CLOAK_BG_RE\.test\(cached\)/.test(styleJs) && /PBP_CLOAK_BG_RE\.test\(bg\)/.test(styleJs),
      "pinboard-style.js: the cloak colour is validated on only one of the read/write paths");
    const re = runInNewContext(reSrc[1]);
    for (const good of ["rgb(28, 27, 26)", "rgba(28, 27, 26, 0.5)", "rgb(255,255,255)", "rgba(0, 0, 0, 1)"]) {
      check(re.test(good), `pinboard-style.js: PBP_CLOAK_BG_RE rejects a legitimate computed colour ${good}`);
    }
    for (const bad of [
      "red",
      "rgb(28, 27, 26); } body { display: none",
      "url(javascript:alert(1))",
      "var(--x)",
      "rgb(28, 27, 26) !important",
      "expression(alert(1))",
      "",
    ]) {
      check(!re.test(bad), `pinboard-style.js: PBP_CLOAK_BG_RE accepts "${bad}" — that string would be injected into a <style> element`);
    }
  }
  // Sampling the background at document_start would read the UA default,
  // because the page's own stylesheet has not been applied yet.
  check(/if \(document\.readyState === "complete"\) cacheCloakBg\(\);\s*\n\s*else window\.addEventListener\("load", cacheCloakBg, \{ once: true \}\);/.test(styleJs),
    "pinboard-style.js: the cloak colour is sampled before load, so it would cache the UA default instead of the theme");
  check(/if \(!_pbpThemed\) \{\s*\n\s*localStorage\.removeItem\(pbpCloakBgKey\(true\)\);\s*\n\s*localStorage\.removeItem\(pbpCloakBgKey\(false\)\);/.test(styleJs),
    "pinboard-style.js: removing the theme leaves a stale cloak colour cached");
  // One key per resolved mode: the OS can flip light/dark between navigations
  // with no user action, and a single key would then paint the light background
  // over a dark render -- the very flash this is here to stop.
  check(/const pbpCloakBgKey = \(isDark\) => \(isDark \? "pbp_cloak_bg_d" : "pbp_cloak_bg_l"\);/.test(styleJs) &&
    /localStorage\.setItem\(pbpCloakBgKey\(isDark\), bg\)/.test(styleJs) &&
    /for \(const key of \[pbpCloakBgKey\(osDark\), pbpCloakBgKey\(!osDark\)\]\)/.test(styleJs),
    "pinboard-style.js: the cloak colour is no longer cached per light/dark mode, so an OS theme flip repaints the wrong shade");
}

if (fail.length) {
  console.error(fail.join("\n"));
  process.exit(1);
}
console.log("ui contract ok");
