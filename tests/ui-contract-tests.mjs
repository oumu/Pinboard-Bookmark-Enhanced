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

// Cuts every "@generated:<name> start ... @generated:<name> end" region out
// of a *-chrome theme CSS file -- ui-themes AND ui-components, both of which
// popup/options/library each carry -- not just the first "ui-themes start"
// marker. The prior library-only bare-hex scan split on that single marker,
// which happened to also exclude the ui-components block (it sits before
// ui-themes) but never excluded anything *after* ui-themes -- and
// popup.css/options.css both carry ~300 hand-written lines after
// "@generated:ui-themes end" that a single split silently never scans.
// Composer output is exempt by construction (render-audit and the
// theme-factory lints already gate it), so only the surrounding hand-written
// CSS this returns should ever reach a hardcoded-color count.
function stripGeneratedRegions(css) {
  const lines = css.split("\n");
  const kept = [];
  let skipping = null;
  for (const line of lines) {
    const marker = line.match(/@generated:([\w-]+)\s+(start|end)/);
    if (marker) {
      if (marker[2] === "start") { skipping = marker[1]; continue; }
      if (marker[2] === "end" && skipping === marker[1]) { skipping = null; continue; }
    }
    if (!skipping) kept.push(line);
  }
  return kept.join("\n");
}

// Removes every var(...) call, including a fallback that itself contains a
// parenthesized function (rgba(), color-mix()...). A naive
// `/var\([^()]*\)/g` innermost-out replace loop cannot see past those nested
// parens -- e.g. `var(--opt-danger-bg, rgba(220,80,80,0.08))` never matches
// `[^()]*` because the fallback's own "(" breaks the class -- so it silently
// left an already-tokenized declaration's rgba() fallback in the scan.
function stripVarCalls(text) {
  let out = "", i = 0;
  while (i < text.length) {
    if (text.startsWith("var(", i)) {
      let depth = 1, j = i + 4;
      while (j < text.length && depth > 0) {
        if (text[j] === "(") depth++;
        else if (text[j] === ")") depth--;
        j++;
      }
      i = j; // skip the whole var(...) span, nested parens and all
    } else {
      out += text[i];
      i++;
    }
  }
  return out;
}

// Neither scan below is a real CSS parser -- both are regex/brace-walk text
// scans, same tradeoff Task 8 made for its own text-scanning checks. A hex
// or rgba() sitting inside a quoted string (`content: "#fff"`) or a url()
// would still be counted; nothing in the current hand-maintained regions
// does that (verified by grep), so it's a known, currently-inert blind
// spot rather than a live false positive.
//
// Both functions drop comments *before* stripVarCalls on purpose: a
// half-written comment containing "var(" with no matching ")" would
// otherwise send stripVarCalls's paren-depth walk to the end of the file,
// silently eating real code after it.

// Counts bare hex color literals in the hand-maintained region of a *-chrome
// theme CSS file (popup.css / options.css / library.css). A bare hex outside
// a var() fallback means a rule hardcoded a color instead of consuming a
// token, so it silently ignores every theme (the exact options.css migration
// regression this is meant to catch). Shared by the popup/options ratchet
// gate and library's zero-tolerance gate below.
function countBareHex(css) {
  let hand = stripGeneratedRegions(css);
  hand = hand.replace(/^\s*--[\w-]+\s*:[^;]*;/gm, "");   // drop custom-prop definitions (:root literals are the exempt source of truth)
  hand = hand.replace(/\/\*[\s\S]*?\*\//g, "");           // drop comments
  hand = stripVarCalls(hand);                             // drop var() incl. nested fallbacks
  // color-mix() may deliberately blend a token against a literal #000/#fff
  // (popup's darken-on-hover pattern) instead of a missing token -- strip
  // only that operand, not the whole color-mix(), before counting.
  hand = hand.replace(/color-mix\([^)]*\)/g, (m) => m.replace(/#(?:000|fff)\b/gi, ""));
  return (hand.match(/#[0-9a-fA-F]{3,8}\b/g) || []).length;
}

// Counts bare rgba()/rgb() color literals used as the value of a
// background/background-color/color/border-*-color declaration in the
// hand-maintained region. A raw rgba() there is the same debt as a bare hex
// -- a hardcoded color instead of a --pp-*/--opt-*/--lib-* token -- but a
// hex-only regex can never see it (library.css:497's
// `background: rgba(220, 80, 80, 0.08); /* no --lib-danger-bg token */` is
// exactly this blind spot). box-shadow/text-shadow/outline etc. are excluded
// on purpose: shadow rgba() is an existing, intentional convention in this
// codebase (CLAUDE.md), not a missed token.
function countQualifyingRgba(css) {
  let hand = stripGeneratedRegions(css).replace(/\/\*[\s\S]*?\*\//g, "");
  hand = stripVarCalls(hand); // a var()-wrapped rgba() fallback is already token-routed, same treatment as hex
  // The four border-*-color longhands belong here alongside the shorthand
  // border-color -- omitting them was a controller checklist typo, not an
  // intentional scope cut (popup.css:1106's
  // `border-bottom-color: rgba(255,255,255,0.06)` is the case that exposed it).
  // The border/border-top/-right/-bottom/-left SHORTHANDS (width+style+color
  // in one declaration) belong here too, same reasoning: a value scan for
  // `rgba(`/`rgb(` doesn't care whether the property is a longhand or a
  // shorthand, and popup.css:958/:986's `border-bottom: 1px solid
  // rgba(0,0,0,0.05)` / `border: 1px solid rgba(0,0,0,0.12)` were a live
  // blind spot the ratchet never saw (design-uplift Task 13 review round).
  const targets = new Set([
    "background", "background-color", "color", "border-color",
    "border-top-color", "border-right-color", "border-bottom-color", "border-left-color",
    "border", "border-top", "border-right", "border-bottom", "border-left",
  ]);
  let depth = 0, chunk = "", count = 0;
  // Brace walk (same shape as the --opt-* token-coverage scan above): only
  // text between "{"/";" boundaries *while inside a rule body* (depth > 0)
  // is a candidate declaration -- this is what keeps a selector like
  // `.tab-btn:hover:not(.active) {` from ever being misread as a property.
  const consider = (text) => {
    if (depth === 0) return;
    const colon = text.indexOf(":");
    if (colon === -1) return;
    const prop = text.slice(0, colon).trim().toLowerCase();
    if (!targets.has(prop)) return;
    const hits = text.slice(colon + 1).match(/\brgba?\(/g);
    if (hits) count += hits.length;
  };
  for (const ch of hand) {
    if (ch === "{") { depth++; chunk = ""; }
    else if (ch === "}") { consider(chunk); depth = Math.max(0, depth - 1); chunk = ""; }
    else if (ch === ";") { consider(chunk); chunk = ""; }
    else chunk += ch;
  }
  return count;
}

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
const libraryVocabJs = read("library-vocab.js");
const libraryHtml = read("library.html");
const libraryCss = read("library.css");
const vocabGdriveJs = read("vocab-gdrive.js");
const mdDictJs = read("md-dict.js");
const vocabStore = read("vocab-store.js");
const mdDict = read("md-dict.js");
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
  "vocab-batch-delete", "vocab-no-results", "vocab-load-more", "vocab-list",
  "vocab-sort-time", "vocab-sort-alpha"]) {
  check(libraryHtml.includes(`id="${id}"`), `library.html: scalable vocabulary control #${id} is missing`);
}
// options.html no longer renders the word list (retired for the library
// page, Task 9) -- what has to hold here is that the settings tab still
// opens with the entry link, ahead of the collapsed secondary settings.
check((optionsHtml.match(/<details class="vocab-disclosure"/g) || []).length === 5 &&
  optionsHtml.indexOf('id="vocab-open-library"') < optionsHtml.indexOf('id="dict-anki-deck"'),
  "options.html: the library entry link is not first or secondary settings are not collapsed");
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
check(libraryVocabJs.includes("PBP_VOCAB_RENDER_BATCH = 100") &&
  libraryVocabJs.includes("pbpVocabFilterSort") && libraryVocabJs.includes("pbpVocabSelectRange") &&
  libraryVocabJs.includes('showConfirmPopover(button') && !libraryVocabJs.includes("window.confirm"),
  "library-vocab.js: scalable render/selection or safe batch-delete confirmation contract is missing");
check(libraryVocabJs.includes('.normalize("NFC")') && libraryVocabJs.includes('.toLowerCase()') &&
  libraryVocabJs.includes('.replace(/i\\u0307/g, "i")') &&
  libraryVocabJs.includes('.replace(/ß/g, "ss")') && libraryVocabJs.includes('.replace(/ς/g, "σ")') &&
  !libraryVocabJs.includes("toLocaleLowerCase") && !libraryVocabJs.includes("\\p{M}"),
  "library-vocab.js: vocabulary search does not use the narrow locale-independent case-fold contract");
check(libraryVocabJs.includes("pbpVocabSelectionSnapshotValid(ids, _vocabSelected, _vocabViewRows)") &&
  libraryVocabJs.includes('t("vocabSelectionChanged")') &&
  libraryVocabJs.includes('search.focus({ preventScroll: true })'),
  "library-vocab.js: stale destructive confirmations or post-action focus are not guarded");
check(libraryVocabJs.includes('t("vocabRefreshFailed")') &&
  libraryVocabJs.includes("const refreshed = await _pbpVocabReloadAfterMutation(owner, gen)") &&
  libraryVocabJs.includes("if (gen !== _vocabRenderGen) return;") &&
  libraryVocabJs.includes("_pbpVocabRenderList(true)"),
  "library-vocab.js: committed mutations, refresh failures, or incremental rendering are conflated");
check(["vocab-search", "vocab-group-filter", "vocab-sort", "vocab-group-input", "vocab-list"].every((id) =>
  new RegExp(`id="${id}"[^>]*aria-label=`).test(libraryHtml)) &&
  /id="vocab-selection-actions"|class="vocab-selection-actions"[^>]*role="group"[^>]*aria-label=/.test(libraryHtml) &&
  /id="vocab-batch-toolbar"[^>]*role="group"[^>]*aria-label=/.test(libraryHtml) &&
  /id="vocab-selected-count"[^>]*aria-live="polite"/.test(libraryHtml),
  "library.html: production vocabulary controls lost accessible names, groups, or live selection status");
// Master-detail rows: a row reports its own selected state and marks itself
// as the one the detail pane is showing. It must NOT claim to expand -- there
// is no body under it any more, so an aria-expanded here would be a lie.
// The selection half moved off a per-row checkbox onto the row itself
// (2026-08-06 user ruling), which is why this asserts aria-selected rather
// than a checkbox label: `aria-selected` is the ONLY thing a screen reader
// has left, and it is only supported on grid/listbox descendants -- hence the
// role trio, checked here because a row built with the right attribute inside
// the wrong container announces nothing at all.
check(libraryVocabJs.includes('card.setAttribute("aria-selected", isSelected ? "true" : "false")') &&
  libraryVocabJs.includes('card.setAttribute("role", "row")') &&
  libraryVocabJs.includes('top.setAttribute("role", "gridcell")') &&
  /id="vocab-list"[^>]*role="grid"[^>]*aria-multiselectable="true"/.test(libraryHtml) &&
  libraryVocabJs.includes('card.setAttribute("aria-current", "true")') &&
  libraryVocabJs.includes("_pbpVocabOnRowActivate(w)") &&
  !libraryVocabJs.includes("aria-expanded"),
  "library-vocab.js/library.html: vocabulary rows lost the grid/aria-selected selection path or master-detail activation state");
// The keyboard half of that ruling. Ctrl/Shift+click has no keyboard twin
// unless something intercepts Space BEFORE the button's own activation, so
// the preventDefault is the contract, not decoration -- without it the row
// would both select and open, and a keyboard user could never build a
// multi-row selection at all.
check(/head\.addEventListener\("keydown"[\s\S]{0,400}e\.preventDefault\(\)[\s\S]{0,120}_pbpVocabRowSelect\(w, true\)/.test(libraryVocabJs) &&
  /_pbpVocabRowSelect\(w, false\)/.test(libraryVocabJs) &&
  libraryVocabJs.includes('head.setAttribute("aria-keyshortcuts", "Control+Space Shift+Space")'),
  "library-vocab.js: the keyboard multi-select path (Ctrl+Space toggle / Shift+Space range, announced via aria-keyshortcuts) is gone");
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
// the browse state reserves zero geometry above the cards. The word list
// (and this contract) moved wholesale to the library page in Task 9 --
// options.css/options.html no longer carry the .vocab-list-region family.
// 2026-08-06: the notes list grew the same bar, so the recipe is a shared
// selector list rather than a second copy -- the contract asserts BOTH names
// reach it, and that both regions exist as sticky containing blocks.
check(libraryCss.includes(".vocab-filter-toolbar") &&
  /\.vocab-list-region,\s*\n\.notes-list-region \{ position: relative; \}/.test(libraryCss) &&
  /\.vocab-batch-bar,\s*\n\.notes-batch-bar\s*\{[\s\S]{0,500}position:\s*sticky[\s\S]{0,500}z-index:\s*var\(--lib-z-sticky\)/.test(libraryCss) &&
  libraryCss.includes(".vocab-card .notes-card-top"),
  "library.css: the sticky batch bar contract is missing, or the notes bar stopped sharing the vocabulary bar's recipe");
// The batch bar must stay a DIRECT child of its region: an intermediate
// wrapper becomes the sticky containing block and caps the float range at the
// bar's own height. Cheap to assert, and impossible to see in a screenshot
// until someone scrolls a long list.
for (const [region, bar] of [["vocab-list-region", "vocab-batch-toolbar"], ["notes-list-region", "notes-batch-toolbar"]]) {
  const start = libraryHtml.indexOf(`class="${region}"`);
  const slice = start < 0 ? "" : libraryHtml.slice(start, libraryHtml.indexOf(`id="${bar}"`, start));
  check(start >= 0 && (slice.match(/<div/g) || []).length === (slice.match(/<\/div>/g) || []).length + 1,
    `library.html: #${bar} is no longer a direct child of .${region} (sticky containing block would move)`);
}
check(libraryHtml.indexOf('class="vocab-list-region"') > 0 &&
  libraryHtml.indexOf('class="vocab-list-region"') < libraryHtml.indexOf('id="vocab-list"') &&
  libraryHtml.indexOf('id="vocab-load-more"') < libraryHtml.indexOf('id="vocab-batch-toolbar"') &&
  /<div class="vocab-batch-bar" id="vocab-batch-toolbar"/.test(libraryHtml),
  "library.html: batch bar is not a sticky-region child after the load-more control");
check(/#view-vocab\s+\.vocab-load-more\[hidden\][\s\S]{0,80}display:\s*none/.test(libraryCss),
  "library.css: vocabulary hidden controls can be redisplayed by component display rules");
check(libraryVocabJs.includes('t("vocabLoading")') &&
  libraryVocabJs.includes('list.setAttribute("aria-busy", loading ? "true" : "false")'),
  "library-vocab.js: vocabulary loading is not visible or aria-busy is not closed consistently");
{
  // The two pages never co-load, and since the phase-A test split (2026-08)
  // neither does any test page -- nothing browser-side would notice the two
  // copies drifting apart (a second `function` declaration of the same name
  // just shadows the first; it is not a SyntaxError). This is the only
  // remaining guard for the "verbatim twin" comment both files carry.
  const flashStatusPattern = /function _pbpVocabFlashStatus\(ok, text\) \{[\s\S]*?\n\}/;
  const optionsFlash = (optionsVocabJs.match(flashStatusPattern) || [""])[0];
  const libraryFlash = (libraryVocabJs.match(flashStatusPattern) || [""])[0];
  check(optionsFlash.length > 0 && optionsFlash === libraryFlash,
    "options-vocab.js/library-vocab.js: _pbpVocabFlashStatus twin definitions drifted");
}
check(sharedJs.includes("async function pbpVocabCurrentOwner()") &&
  sharedJs.includes("function pbpVocabOwnerLabel(owner)") &&
  libraryVocabJs.includes("pbpVocabCurrentOwner(") && optionsVocabJs.includes("pbpVocabCurrentOwner(") &&
  libraryVocabJs.includes('t("vocabResultCount", String(rows.length), String(_vocabRows.length), _vocabOwnerLabel)') &&
  libraryVocabJs.includes('empty.textContent = t("dictVocabEmpty", _vocabOwnerLabel)') &&
  !libraryVocabJs.includes('t("jinaFailed")') && !optionsVocabJs.includes('t("jinaFailed")'),
  "vocabulary account scope is absent or action errors still reuse Jina copy");
// The library migration deleted the "vocabulary view controls leak into
// settings auto-save" check outright (library.html's data-no-autosave
// attributes are now inert -- library.js has no auto-save sweep at all for
// them to guard against). That left options.js's OWN half of the old
// contract -- the sweep still has to exclude [data-no-autosave] on every
// field family it walks, or a future options.html field that opts out would
// silently start auto-saving anyway -- with no coverage. Re-assert just that
// half, scoped to options.js only.
check(optionsJs.includes('input[type="checkbox"]:not([data-no-autosave])') &&
  optionsJs.includes('input[type="text"]:not([data-no-autosave])') &&
  optionsJs.includes('select:not([data-no-autosave])'),
  "options.js: the autosave sweep dropped its [data-no-autosave] exclusion on the checkbox/text/select field families");
check(/data-i18n="dictExportTsv"/.test(optionsHtml) && /data-i18n="dictAnkiSend"/.test(optionsHtml) &&
  /data-i18n="dictEudicSend"/.test(optionsHtml) && /data-i18n="dictEudicSupportedHint"/.test(optionsHtml) &&
  /data-i18n="dictPackImportHint"/.test(optionsHtml) &&
  /id="dict-pack-file"[^>]*accept="[^"]*\.txt[^"]*\.txt\.gz[^"]*\.zip/.test(optionsHtml),
  "options.html: full-scope actions, Eudic support, or pack import formats are not explicit");
check(!read("anki-connect.js").includes("PBP_ANKI_ENDPOINT"),
  "anki-connect.js: unused PBP_ANKI_ENDPOINT remains");
{
  const libraryJs = read("library.js");
  const libraryNotesJs = read("library-notes.js");
  // The sort segment is labelled by _pbpVocabSyncSortSeg at library-vocab.js
  // parse time -- before initI18n loads a manually chosen locale, so those
  // labels come out in the BROWSER's language. The static keys give applyI18n
  // something to translate; the re-run afterwards puts the live select value's
  // label back on top of it.
  check(/id="vocab-sort-time"[^>]*data-i18n-title="vocabSortOldest"[^>]*data-i18n-aria="vocabSortOldest"/.test(libraryHtml) &&
    /id="vocab-sort-alpha"[^>]*data-i18n-title="vocabSortAz"[^>]*data-i18n-aria="vocabSortAz"/.test(libraryHtml) &&
    /applyI18n\(\);[\s\S]{0,600}_pbpVocabSyncSortSeg\(\)/.test(libraryJs),
    "library: the sort segment is not translated by applyI18n or not re-synced after it");
  // Narrow mode: only a genuine view switch hands the list back. The
  // visibilitychange re-fire dispatches pbp-lib-view WITHOUT going through
  // _pbpLibApplyView, which is exactly what keeps an open detail alive.
  check(/function _pbpLibApplyView[\s\S]{0,900}classList\.remove\("lib-narrow-detail"\)/.test(libraryJs) &&
    // The re-fire dispatches pbp-lib-view straight, never through
    // _pbpLibApplyView -- that split is the whole mechanism. The window is
    // sized to the listener body, so routing it through the view applier
    // (or padding the listener until it reaches one) trips this.
    !/addEventListener\("visibilitychange"[\s\S]{0,160}_pbpLibApplyView/.test(libraryJs) &&
    /addEventListener\("visibilitychange"[\s\S]{0,160}dispatchEvent\(new CustomEvent\("pbp-lib-view"/.test(libraryJs) &&
    libraryVocabJs.includes('else if (enterNarrow) document.body.classList.add("lib-narrow-detail")') &&
    // Entering narrow mode hides whatever was focused to get there, so the
    // handoff belongs at the render root every activation passes through --
    // not at one call site.
    /detail\.replaceChildren\(frag\);[\s\S]{0,400}if \(enterNarrow\) _pbpVocabFocusNarrowBack\(\)/.test(libraryVocabJs) &&
    /function _pbpVocabFocusNarrowBack[\s\S]{0,400}focus\(\{ preventScroll: true \}\)/.test(libraryVocabJs),
    "library: narrow mode is entered by refresh renders, left by a visibility re-fire, or strands focus on <body>");
  // Notes rebuild everything on every activation; the SELECTED highlight and
  // the scroll position that put it on screen are the user's place in the
  // page (master-detail rewrite: this was card expansion before).
  // Sliced to the function's own body (up to its column-0 closing brace)
  // rather than matched through a character window: this one carries enough
  // comment to make any distance bound a tripwire for editing the comment.
  const notesRefresh = (libraryNotesJs.split("async function _pbpNotesRefreshPreservingState")[1] || "").split("\n}\n")[0];
  check(libraryNotesJs.includes("rowEl.dataset.notesKey = hit.key") &&
    ["_pbpNotesMarkCurrentRow()", "_pbpNotesFocus(", "window.scrollTo"].every((s) => notesRefresh.includes(s)) &&
    /pbp-lib-view[\s\S]{0,120}_pbpNotesRefreshPreservingState\(\)/.test(libraryNotesJs) &&
    // Debounced: a single highlight drag rewrites the whole record per
    // stroke, and each refresh is a full scan plus a full rebuild.
    /startsWith\("pbp_hl_"\)[\s\S]{0,400}setTimeout\([\s\S]{0,300}_pbpNotesRefreshPreservingState\(\)[\s\S]{0,40}\}, 250\)/.test(libraryNotesJs) &&
    // The confirm popover restores focus to the delete button the rebuild
    // removes, so the deleted card's neighbour has to claim it.
    libraryNotesJs.includes("_pbpNotesFocusAfterDelete(position)") &&
    /function _pbpNotesFocusAfterDelete[\s\S]{0,500}\$id\("notes-filter"\)/.test(libraryNotesJs) &&
    // Narrow mode, same three-part contract the vocabulary view above is held
    // to -- on its OWN body class, and with the focus handoff at the render
    // root every activation passes through.
    libraryNotesJs.includes('if (enterNarrow) document.body.classList.add("lib-narrow-notes")') &&
    /detail\.replaceChildren\(frag\);[\s\S]{0,200}if \(enterNarrow\) _pbpNotesFocusNarrowBack\(detail\)/.test(libraryNotesJs) &&
    // preventScroll lives in the one focus primitive every notes path calls
    // (row refocus, post-delete neighbour, narrow back, detail restore).
    /function _pbpNotesFocus\(el\)[\s\S]{0,300}focus\(\{ preventScroll: true \}\)/.test(libraryNotesJs) &&
    /function _pbpNotesFocusNarrowBack[\s\S]{0,300}_pbpNotesFocus\(host\.querySelector\("\.notes-detail-back"\)\)/.test(libraryNotesJs) &&
    /function _pbpLibApplyView[\s\S]{0,1100}classList\.remove\("lib-narrow-notes"\)/.test(libraryJs),
    "library-notes.js: a re-render loses the selected highlight/scroll/focus, narrow mode strands focus, or reader writes are not picked up while visible");
  // One tab per extension page, not one per click.
  check(sharedJs.includes("async function pbpOpenExtensionTab(page, hash)") &&
    /pbpOpenOptionsTab[\s\S]{0,200}pbpOpenExtensionTab\("options\.html"/.test(sharedJs) &&
    ["popup.js", "md-ask.js", "md-highlight.js", "options-vocab.js"].every((file) =>
      read(file).includes('pbpOpenExtensionTab("library.html"')) &&
    !/tabs\.create\(\{\s*url:\s*chrome\.runtime\.getURL\("library\.html/.test(popupJs),
    "library entry points still stack a duplicate tab per click");
}
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
  // Fold EVERY top-level `:root { ... }` block, not just the first: Task 5
  // added a second one (generated, at the end of @generated:ui-themes) that
  // supplies the default-state value for a handful of newly-derived tokens
  // (--opt-btn-fg among them) alongside the original hand-written block up
  // top. Same "browser-applied" folding contrast-audit.mjs already does for
  // this exact two-:root-blocks shape (task-7-report.md) -- a single-block
  // scan here would flag those tokens as "invisible" even though the second
  // block makes them resolve just fine (same specificity, later source wins
  // is irrelevant to *whether* it resolves, only to *which value* wins).
  const declaredOnRoot = new Set();
  for (const rootMatch of src.matchAll(/:root\s*\{([^}]*)\}/g)) {
    for (const m of rootMatch[1].matchAll(/(--opt-[a-z0-9-]+)\s*:/g)) declaredOnRoot.add(m[1]);
  }
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
// COMPONENTS.md §7.3 focus-ring recipes, for the two converged sites the
// render oracle cannot reach: .theme-name-popover only exists after the
// disabled #save-custom-theme is enabled and clicked, and popup's
// .regen-link is created by popup-ai.js only after an AI response. Both are
// static text contracts here rather than render entries whose setup would be
// longer than the rule they guard. Every other §7.3 site is gated live in
// tests/render-audit-checklist.mjs via `focusRecipe`.
check(/\.theme-name-popover input\[type="text"\]:focus \{[^}]*border-color: var\(--opt-focus-bd\)/.test(optionsCss) &&
  /\.theme-name-popover input\[type="text"\]:focus-visible \{ box-shadow: var\(--opt-focus-ring\); \}/.test(optionsCss) &&
  !/theme-name-popover input\[type="text"\]:focus-visible \{ box-shadow: 0 0 0 2px/.test(optionsCss),
  "options.css: the theme-name popover input is back on a bespoke focus ring instead of --opt-focus-bd/--opt-focus-ring (§7.3), so per-theme focus styling does not reach it");
// The two `borderless` sites (§7.3, 2026-08-06 unification): a 1px accent
// core PLUS the surface's --{ns}-focus-ring glow. Both halves are asserted
// separately, and the glow specifically has to be the TOKEN: its shape is
// per-theme identity (terminal's 6px phosphor blur, paper-ink's flat
// `0 0 0 1px`, solarized's translucent 2px), so an inlined shadow here would
// flatten 13 presets into one look while still "having a focus ring".
// The tnp pair are `borderless` rather than `bordered` on purpose -- tnp-save
// is a solid accent button whose 1px edge is its tier, not neutral chrome.
const BORDERLESS_FOCUS = (ns) =>
  new RegExp(`outline: 1px solid var\\(--${ns}-accent\\); outline-offset: 2px; box-shadow: var\\(--${ns}-focus-ring\\);`);
check(/\.theme-name-popover \.tnp-save:focus-visible,\s*\n\s*\.theme-name-popover \.tnp-cancel:focus-visible \{ [^}]*\}/.test(optionsCss) &&
  BORDERLESS_FOCUS("opt").test(
    optionsCss.slice(optionsCss.indexOf(".theme-name-popover .tnp-save:focus-visible"),
      optionsCss.indexOf(".theme-name-popover .tnp-save:focus-visible") + 260)),
  "options.css: the theme-name popover's Save/Cancel lost the §7.3 borderless focus recipe (1px accent core + var(--opt-focus-ring) glow)");
check(/\.regen-link:focus-visible \{ [^}]*\}/.test(popupCss) &&
  BORDERLESS_FOCUS("pp").test(popupCss.slice(popupCss.indexOf(".regen-link:focus-visible"),
    popupCss.indexOf(".regen-link:focus-visible") + 200)),
  "popup.css: .regen-link lost the §7.3 borderless focus recipe (1px accent core + var(--pp-focus-ring) glow)");
// §7.3 unification, file-wide, WHITELIST form: every hand-written
// :focus-visible rule that draws a focus indicator must match one of the
// three placements exactly. This replaced a blacklist ("no `outline: 2px
// solid var(--ns-accent)` growing outward") that the 2026-08-06 independent
// review defeated five different ways with the same visual regression --
// omit outline-offset, swap declaration order, spell it in longhands, draw
// the ring as a literal box-shadow, or delete the 1px core and keep only the
// glow. All five are the same defect and a string blacklist can only ever
// name the spellings someone already thought of (CLAUDE.md, "断言问得太窄
// 等于没门" -- ask what the simplest missed counter-example looks like).
//
// So: parse declarations instead of matching text. Comments are stripped,
// longhands folded into the shorthand, order irrelevant, and any box-shadow
// that is not literally the theme's own --{ns}-focus-ring token counts as a
// hand-drawn ring.
const FOCUS_SHAPE_EXEMPT = {
  // Selection marks, not focus indicators: no :focus-visible, and the render
  // oracle gates the ring's contrast separately via outlineContrast.
  ring: [/\.theme-preset-btn\.active/, /\.saved-theme-btn\.active/],
  // §7.3's one sanctioned bare `outline: none`: a passenger that hands its
  // indicator to the container drawing the ring on its behalf (§8 law 2).
  // Listed explicitly so "defers to container" stays a deliberate, reviewed
  // choice rather than the escape hatch every un-styled control falls into.
  defer: [
    /^\.notes-card-head:focus-visible$/,
    // The fused text input inside .vocab-group-unit: the shell draws the ring
    // for it (§8 law 2, field flavour), so the passenger must draw nothing --
    // including not falling through to Chromium's default ring.
    /^\.vocab-group-unit > input\[type="text"\]:focus, \.vocab-group-unit > input\[type="text"\]:focus-visible$/,
  ],
};
function parseFocusShape(body) {
  const d = {};
  for (const decl of body.split(";")) {
    const i = decl.indexOf(":");
    if (i < 0) continue;
    d[decl.slice(0, i).trim().toLowerCase()] = decl.slice(i + 1).trim();
  }
  const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
  const COLOR = /var\([^)]*\)|#[0-9a-fA-F]{3,8}|rgba?\([^)]*\)|color-mix\([^)]*\)/;
  let width = null, style = null, color = null;
  if (d.outline !== undefined) {
    const v = d.outline.trim();
    if (v === "none") { style = "none"; width = 0; }
    else {
      const w = /(-?\d*\.?\d+)px/.exec(v); if (w) width = parseFloat(w[1]);
      const s = /\b(solid|dashed|dotted|double|none)\b/.exec(v); if (s) style = s[1];
      const c = COLOR.exec(v); if (c) color = c[0];
    }
  }
  // Longhands win over the shorthand when both appear (later-wins is already
  // handled: `d` keeps the last declaration of each property).
  if (d["outline-width"] !== undefined) width = num(d["outline-width"]);
  if (d["outline-style"] !== undefined) style = d["outline-style"];
  if (d["outline-color"] !== undefined) color = d["outline-color"];
  return {
    width, style, color,
    offset: d["outline-offset"] !== undefined ? num(d["outline-offset"]) : null,
    offsetDeclared: d["outline-offset"] !== undefined,
    outlineTouched: ["outline", "outline-width", "outline-style", "outline-color"].some(k => d[k] !== undefined),
    shadow: d["box-shadow"],
    borderColor: d["border-color"],
  };
}
for (const [file, css, ns] of [["popup.css", popupCss, "pp"], ["options.css", optionsCss, "opt"], ["library.css", libraryCss, "lib"]]) {
  const hand = stripGeneratedRegions(css).replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = [];
  for (const m of hand.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    rules.push({ selector: m[1].trim().replace(/\s+/g, " "), body: m[2] });
  }
  const bySelector = new Map(rules.map(r => [r.selector, r.body]));
  const RING = `var(--${ns}-focus-ring)`, BD = `var(--${ns}-focus-bd)`, ACCENT = `var(--${ns}-accent)`;
  const bad = [];
  for (const { selector, body } of rules) {
    if (!/:focus-visible/.test(selector)) continue;
    if (FOCUS_SHAPE_EXEMPT.ring.some(re => re.test(selector))) continue;
    const s = parseFocusShape(body);
    const drawsOutline = s.style && s.style !== "none" && s.width > 0;
    const suppressesOutline = s.outlineTouched && (s.style === "none" || s.width === 0);
    const fail = (why) => bad.push(`${selector} — ${why}`);
    if (drawsOutline) {
      // Placement is decided by the SIGN of the offset, so an omitted offset
      // is not a cosmetic slip: it silently becomes 0 and turns `inset` into
      // an outward ring.
      if (!s.offsetDeclared) { fail("draws an outline with no outline-offset (0 by default flips inset into an outward ring)"); continue; }
      if (s.offset >= 0) {
        if (s.width !== 1) fail(`borderless core must be 1px, got ${s.width}px`);
        else if (s.color !== ACCENT) fail(`borderless core must be ${ACCENT}, got ${s.color}`);
        else if (s.shadow !== RING) fail(`borderless needs the ${RING} glow, got ${s.shadow === undefined ? "no box-shadow" : s.shadow}`);
      } else {
        if (!(s.width >= 2)) fail(`inset core must be >=2px, got ${s.width}px`);
        else if (s.color !== BD) fail(`inset core must be ${BD}, got ${s.color}`);
        else if (s.shadow !== "none") fail(`inset must suppress box-shadow (the .btn family's glow leaks across a fused seam and stacks on the core), got ${s.shadow === undefined ? "no box-shadow declaration" : s.shadow}`);
      }
    } else if (suppressesOutline) {
      if (s.borderColor === BD && s.shadow === RING) continue;             // bordered
      if (!s.borderColor && s.shadow === undefined
          && FOCUS_SHAPE_EXEMPT.defer.some(re => re.test(selector))) continue; // §8 law 2 passenger
      fail(`suppresses the outline without the bordered pair (border-color: ${BD} + box-shadow: ${RING}); got border-color=${s.borderColor} shadow=${s.shadow}`);
    } else if (s.shadow !== undefined && s.shadow !== "none") {
      // No outline of its own. Legal only as the glow half of `bordered`,
      // whose core lives on the matching :focus rule -- and only as the TOKEN,
      // never a literal (a literal here is the box-shadow spelling of a hard
      // ring, which is what defeated the previous blacklist).
      if (s.shadow !== RING) { fail(`box-shadow focus ring must be ${RING}, got ${s.shadow}`); continue; }
      if (s.borderColor === BD) continue;                                   // themed bordered twin
      const partner = bySelector.get(selector.replaceAll(":focus-visible", ":focus"));
      if (!partner || !new RegExp(`border-color:\\s*${BD.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(partner)) {
        fail(`glow with no core — needs either border-color: ${BD} here, or the matching :focus rule to set it`);
      }
    }
  }
  check(bad.length === 0,
    `${file}: hand-written focus rule(s) do not match any §7.3 placement (bordered / borderless / inset):\n    ${bad.join("\n    ")}`);
}
// The two same-specificity deletions this sweep made must stay deleted --
// both were measured, not eyeballed (CLAUDE.md's two-way cascade rule).
// .lib-tab had TWO (0,2,0) :focus-visible rules; the later one won `outline`
// while the earlier kept supplying `box-shadow`, shipping a hard rectangle
// with a glow behind it. .vocab-sort-seg's shell ring fired on mouse-down
// (`:focus-within` has no keyboard gate) and stacked outside the cell ring.
// Fixed-width canvas (2026-08-06). Three pieces, each one load-bearing on
// its own, so each gets its own assertion rather than one "layout looks
// right" catch-all.
{
  // The gutter MUST be `max(sp-5, ...)`: a bare calc() goes negative below
  // the cap and would clamp to 0, deleting the page's normal side padding on
  // every ordinary laptop width.
  const gutter = /padding-inline:\s*max\(var\(--lib-sp-5\),\s*calc\(\(100% - var\(--lib-canvas-max\)\) \/ 2\)\)/g;
  check((libraryCss.match(gutter) || []).length === 2,
    "library.css: .lib-header and .lib-main no longer share the same max()-guarded canvas gutter — the header's title/tabs will drift out of alignment with the workbench, or narrow screens will lose their side padding");
  // Variant C (USER RULING 2026-08-06): the reading pane hugs its content and
  // surplus width becomes margin outside its border. fit-content(), not a
  // flexible track -- `1fr` absorbs every spare pixel, which is the growth
  // this ruling exists to stop. The list column's 340px floor stays.
  const benchCols = /grid-template-columns:\s*minmax\(340px,\s*(\d+)px\)\s*fit-content\((\d+)px\)/g;
  const bench = [...libraryCss.matchAll(benchCols)];
  // The centring must be counted INSIDE the two workbench blocks. A bare
  // file-wide count was fed by the detail panes' own two `justify-content:
  // center` declarations, so deleting both workbench centrings left the
  // check green (independent review, measured).
  const benchCentred = (libraryCss.match(/\.(?:vocab|notes)-workbench \{[^}]*\}/g) || [])
    .filter((block) => /justify-content:\s*center;/.test(block)).length;
  check(bench.length === 2 && benchCentred === 2,
    "library.css: a workbench lost the variant-C column pair (minmax(340px, Npx) fit-content(Npx)) or its own justify-content: center — a flexible reading column grows back to whatever the window is, and an uncentred grid sits hard left in its canvas");
  // THE anti-double-centring invariant, and the reason this is arithmetic
  // rather than a literal: --lib-canvas-max must equal the workbench's own
  // natural width. If it is larger, the grid sits inside a wider canvas and
  // gets centred twice (a centred box inside a centred box) -- exactly the
  // shape the detail-pane proposal rejected. Any of the three numbers can
  // move; they just have to keep agreeing.
  const canvas = /--lib-canvas-max:\s*(\d+)px/.exec(libraryCss);
  const gap = /--lib-sp-5:\s*(\d+)px/.exec(libraryCss);
  const want = bench.length ? Number(bench[0][1]) + Number(gap && gap[1]) + Number(bench[0][2]) : null;
  check(!!canvas && !!gap && Number(canvas[1]) === want,
    `library.css: --lib-canvas-max (${canvas && canvas[1]}) is not the workbench's own width (${bench.length ? bench[0][1] : "?"} + ${gap && gap[1]} gap + ${bench.length ? bench[0][2] : "?"} = ${want}) — the grid is centred inside a canvas that is centred inside the page`);
  // The reading measure belongs to the pane, not to each child: a child that
  // forgets its own cap is invisible until someone reads a wide screen.
  check((libraryCss.match(/grid-template-columns:\s*minmax\(0,\s*66ch\)/g) || []).length === 2,
    "library.css: a detail pane lost its centred 66ch content column");
  const paneChildCaps = (libraryCss.match(/\.(notes-detail-quote|notes-detail-note|vocab-detail-gloss|vocab-detail-context|vocab-note-edit)\b[^{}]*\{[^}]*max-width:\s*6[68]ch/g) || []);
  check(paneChildCaps.length === 0,
    `library.css: per-child reading-measure caps are back inside the detail panes — the pane's own column already caps and CENTRES them, and a child cap only re-creates the left-hugging prose it replaced: ${paneChildCaps.join(" | ")}`);
  // Both panes end the same way: one rule-topped row, destructive action
  // pushed to its right end. Two panes, one closing gesture.
  check(/\.vocab-detail-footer,\s*\n\.notes-detail-footer \{[^}]*border-top:/.test(libraryCss) &&
    /\.vocab-detail-footer > \.vocab-detail-delete,\s*\n\.notes-detail-footer > \.notes-detail-delete \{ margin-left: auto; \}/.test(libraryCss) &&
    /footer\.className = "vocab-detail-footer"/.test(libraryVocabJs) &&
    /footer\.className = "notes-detail-footer"/.test(read("library-notes.js")),
    "library.css/library-{vocab,notes}.js: the detail panes' shared closing action row is gone or asymmetric");
}
// List header, round 2 (2026-08-07). Four bare rows that each run the full
// width of the list column; the geometry itself is measured live by the render
// oracle's headerRowsFlush entry. What is asserted here is the wiring the
// oracle cannot see.
{
  // The status filter keeps its <select> -- hidden, as a state carrier, the
  // same shape #vocab-sort has used since the sort segment landed. Every
  // handler and every test still writes a value and dispatches `change`; if
  // the chips ever mutated their own state directly instead, filtering and
  // the URL of that state would fork.
  check(/id="vocab-status-filter"[^>]*\shidden/.test(libraryHtml),
    "library.html: #vocab-status-filter lost its `hidden` attribute — the status chips replaced it in the UI, it may not come back as a second visible control");
  check(/const target = chip\.dataset\.status;\s*\n\s*filter\.value = filter\.value === target \? "" : target;\s*\n\s*filter\.dispatchEvent\(new Event\("change"\)\);/.test(libraryVocabJs),
    "library-vocab.js: the status chips stopped writing #vocab-status-filter + dispatching change — they must drive the existing filter pipeline, not a parallel one");
  // Chips are controls, so they wear the button fill; and pressed is
  // byte-identical to the sort segment's pressed cell, which sits in the same
  // row and means the same thing. --lib-row-selected-bg is explicitly out: it
  // is byte-identical to --lib-panel on dracula (measured), i.e. invisible.
  // Hand-written layer only: the generated region carries its own
  // `.vocab-stat-chip` (the shared chip recipe), and matching that one instead
  // would test the thing this override exists to beat.
  // WHAT THIS PIN DOES AND DOES NOT GUARD (independent review F2, 2026-08-07):
  // it reads CSS SOURCE, so it can only see that the declaration EXISTS --
  // never that it WINS. Until 2026-08-07 the override was unqualified and beat
  // the generated rule on source order alone, which this pin is structurally
  // blind to: move the generated region below the hand-written block and every
  // assertion here still passes while the chips render grey-on-grey. The
  // `.vocab-filter-row > ` prefix is now required by the regexes for exactly
  // that reason -- it is the (0,2,0)-vs-(0,1,0) qualifier that makes winning a
  // property of the selector instead of a property of the file's layout, and
  // requiring it here is the closest a text gate can get to "this takes
  // effect". The render oracle's rowStates entries are what actually measure
  // the composed result.
  const chipHand = stripGeneratedRegions(libraryCss);
  const chipRule = /\.vocab-filter-row > \.vocab-stat-chip \{([^}]*)\}/.exec(chipHand);
  const chipOn = /\.vocab-filter-row > \.vocab-stat-chip\[aria-pressed="true"\] \{([^}]*)\}/.exec(chipHand);
  const segOn = /\.vocab-sort-seg > \.vocab-sort-btn\[aria-pressed="true"\] \{([^}]*)\}/.exec(chipHand);
  const mix = (body) => (/background:\s*(color-mix\([^;]*\))/.exec(body || "") || [])[1];
  check(!!chipRule && /background:\s*var\(--lib-btn-bg\)/.test(chipRule[1]) && /color:\s*var\(--lib-btn-fg\)/.test(chipRule[1]),
    "library.css: the status chips fell back to the chip family's label fill, or `.vocab-filter-row > ` was dropped from the override (without it the rule ties the generated recipe and wins only on source order) — in a row of controls they are controls and take the button fill");
  check(!!chipOn && !!segOn && mix(chipOn[1]) === mix(segOn[1]) &&
    !/row-selected-bg/.test(chipOn[1]) && !/inset/.test(chipOn[1]),
    "library.css: the chip's selected fill drifted from the sort segment's pressed cell (or went back to --lib-row-selected-bg / an inset ring) — two controls in one row that both mean \"this filter is on\" must not invent two looks");
  // An empty status span still carried its 8px margin and stole 16px off the
  // right edge of the count row, which is the row that has to end flush.
  check(/\.save-status:empty \{ display: none; \}/.test(libraryCss),
    "library.css: .save-status:empty no longer collapses — an empty status span takes its margin with it and the count row stops ending flush");
  // The count text takes the slack so Select all lands on the right edge.
  // Without it the slack went to the status span's `margin-left: auto`, which
  // right-aligned an EMPTY span and left Select all mid-row.
  check(/\.vocab-ctx-text \{[^}]*flex: 1 1 auto/.test(libraryCss),
    "library.css: .vocab-ctx-text stopped taking the count row's slack — Select all drifts back to the middle of the line");
}
// Lookup row moved into the detail panel (2026-08-07, L1). It filters nothing,
// and its result renders in #vocab-detail -- a control belongs where its
// output appears, and beside the search box it read as a second search box.
{
  const paneStart = libraryHtml.indexOf('id="vocab-detail-pane"');
  const paneEnd = libraryHtml.indexOf("</aside>", paneStart);
  const pane = paneStart < 0 ? "" : libraryHtml.slice(paneStart, paneEnd);
  check(pane.includes('id="vocab-lookup-bar"') && pane.includes('id="vocab-detail-back"'),
    "library.html: the lookup row and/or the back button left the detail pane — the lookup row must live where its result renders, and the back button must exist in EVERY pane state (empty included)");
  // De-islanded. These declarations sat on an ID selector, which is why the
  // mockup's class-level override was silently outranked twice; the fix is
  // that they are gone from the ID rule, not fought from a class.
  const bar = /#vocab-lookup-bar \{([^}]*)\}/.exec(libraryCss);
  check(!!bar && !/background:/.test(bar[1]) && !/border-radius:/.test(bar[1]) &&
    !/\bborder:/.test(bar[1]) && !/padding:\s/.test(bar[1]),
    "library.css: #vocab-lookup-bar grew its island back (background / border / radius / padding) — on the panel that is a box inside a box, and its right edge misses the reading column by its own padding and border");
  // The pane is a grid whose default justify-items is stretch, so a direct
  // child button spans the whole 66ch reading column without this.
  check(/\.vocab-detail-back \{[^}]*justify-self: start/.test(libraryCss),
    "library.css: .vocab-detail-back lost `justify-self: start` — as a direct grid child of the pane it stretches across the entire reading column");
  // The narrow door: list-side entry, gated to the single-pane range, and it
  // opens the tool rather than running it.
  check(/@media \(max-width: 860px\) \{[\s\S]*?\.vocab-filter-row > \.vocab-lookup-narrow \{ display: inline-flex; \}[\s\S]*?\n\}/.test(libraryCss) &&
    /\.vocab-filter-row > \.vocab-lookup-narrow \{ display: none;/.test(libraryCss),
    "library.css: the narrow lookup door is not media-gated to the single-pane range (it is the door to a pane that is only hidden down there)");
  check(/_vocabLookupNarrow\.addEventListener\("click", \(\) => \{\s*\n\s*document\.body\.classList\.add\("lib-narrow-detail"\);[\s\S]{0,200}?input\.focus\(/.test(libraryVocabJs),
    "library-vocab.js: the narrow lookup door stopped opening the pane and focusing the lookup box");
  check(/id="vocab-lookup-narrow"[^>]*data-i18n-title=/.test(libraryHtml) &&
    /id="vocab-lookup-narrow"[^>]*aria-label=/.test(libraryHtml) &&
    /id="vocab-lookup-narrow"[^>]*title=/.test(libraryHtml),
    "library.html: the icon-only narrow lookup door lost its title/aria-label (icon-only buttons carry both, always)");
  // The empty-state copy must not name a direction: below 860px the page is
  // one column and there is no "left". BOTH views, not just the vocab one --
  // the notes view has its own single-pane fallback (body.lib-narrow-notes)
  // and its own empty-state string, which stayed wrong for a day because this
  // pin named one key instead of the class of strings it was defending
  // (independent review F3, 2026-08-07).
  const enMsgs = JSON.parse(read("_locales/en/messages.json"));
  for (const key of ["libraryDetailEmpty", "libraryNotesDetailEmpty"]) {
    check(!/\bleft\b/i.test(enMsgs[key].message),
      `_locales/en: ${key} points at a direction again — in the single-pane layout there is nothing to the left of anything`);
  }
}
// Note editor (2026-08-06): the save button must stay IN LAYOUT while hidden.
// `display: none` is what made the textarea jump narrower on the first
// keystroke; `visibility: hidden` keeps the box, and still drops the button
// from the tab order and the a11y tree so library-vocab.js's
// `noteSave.hidden = true` keeps its exact meaning and needs no change.
// Asserted statically because the render oracle has no display/visibility
// vocabulary, and the defect is precisely a display value.
{
  const rule = /\.vocab-note-save\[hidden\]\s*\{([^}]*)\}/.exec(libraryCss);
  check(!!rule && /visibility:\s*hidden/.test(rule[1]) && !/display:\s*none/.test(rule[1]),
    "library.css: .vocab-note-save[hidden] is back on display:none (or lost visibility:hidden) — revealing the save button then reflows the note row and the textarea jumps under the cursor");
  // .btn's author-origin `display: inline-flex` already outranks the UA
  // `[hidden] { display: none }` rule, so this rule must NOT be nested under
  // html.motion-ready: before that class lands the button would be fully
  // visible rather than merely un-animated.
  check(!/html\.motion-ready\s+\.vocab-note-save\[hidden\]/.test(libraryCss),
    "library.css: the .vocab-note-save[hidden] rule is gated on html.motion-ready — the button renders fully visible until that class is added");
  const input = /\.vocab-note-input\s*\{([^}]*)\}/.exec(libraryCss);
  check(!!input && /field-sizing:\s*content/.test(input[1])
    && /min-height:/.test(input[1]) && /max-height:/.test(input[1]) && /resize:\s*vertical/.test(input[1]),
    "library.css: .vocab-note-input lost auto-grow (field-sizing: content) or one of its bounds — without the max-height a 500-char note pushes the rest of the detail pane off-screen");
  // v2b (USER RULING 2026-08-06): Save is a commit control, so it lives with
  // the other commit controls at the right end of the pane's closing row --
  // not hanging off the textarea's trailing edge. Asserted on the JS because
  // that is where the placement is decided; the zero-shift half is already
  // guaranteed by the visibility rule above (the box never leaves layout).
  check(/footer\.appendChild\(noteEditor\.save\)/.test(libraryVocabJs) &&
    /\.vocab-detail-footer > \.vocab-note-save \{/.test(libraryCss),
    "library-vocab.js/library.css: the note Save button left the detail pane's closing row");
  // The seam. It must NOT be a border token: --lib-{border,border-section,
  // pane-divider} are the 3:1 structural edges, and a full-weight rule
  // between two buttons frames one of them instead of dividing them — which
  // is the form the user rejected. It is the panel's own fill nudged toward
  // the foreground, so it re-derives per theme and can never out-weigh a
  // real border. Both halves are pinned: the recipe, and the fact that the
  // dark themes carry their OWN strength (equal mixes are not equally
  // legible on a near-white and a near-black panel).
  const seam = /\.vocab-detail-footer > \.vocab-note-save::before \{([^}]*)\}/.exec(libraryCss);
  check(!!seam && /background:\s*color-mix\(in srgb, var\(--lib-fg\) var\(--lib-seam-mix\), var\(--lib-panel\)\)/.test(seam[1])
    && !/var\(--lib-(border|border-section|pane-divider)\)/.test(seam[1])
    && /width:\s*1px/.test(seam[1]) && /height:\s*\d+px/.test(seam[1]),
    "library.css: the save-button seam is gone, or went back to a structural border token (a 3:1 edge between two buttons reads as a frame around one of them, which is the form that was rejected)");
  const seamDark = /html\[data-theme="rose-pine"\] \{ --lib-seam-mix: \d+%; \}/.test(libraryCss);
  check(/--lib-seam-mix:\s*\d+%/.test(libraryCss) && seamDark,
    "library.css: --lib-seam-mix lost its default or its dark-theme group — one mix percentage cannot be equally legible on a near-white and a near-black panel");
}
// Comments stripped first, same as the class-level gate above: BOTH of these
// name a selector that the surrounding prose also has every reason to
// mention, and a scan over raw source cannot tell a rule from an explanation
// of why that rule is gone. This is the same failure mode CLAUDE.md records
// for contrast-audit's orphan guard, where a comment quoting "info-fg" made
// the guard believe the token was already handled.
{
  const libRules = libraryCss.replace(/\/\*[\s\S]*?\*\//g, "");
  check((libRules.match(/\.lib-tab:focus-visible/g) || []).length === 1,
    "library.css: .lib-tab has more than one :focus-visible rule again — the later same-specificity one silently wins `outline` while the earlier still supplies `box-shadow`");
  check(!/\.vocab-sort-seg:focus-within/.test(libRules),
    "library.css: the .vocab-sort-seg shell focus ring is back — it lights on plain mouse-down and double-rings on Tab (the cell's own inset ring is the indicator)");
}
// COMPONENTS.md §7.3 / §8 law 6, for every popup control the render oracle
// cannot reach. The library/options ones are gated live; popup's fixture is
// seeded logged-in, so #login-section (and with it .secret-field) has a zero
// rect, while .tags-input-wrap / #title-input / #search-input all live in
// #main-section, which popup.js only un-hides once it has resolved the active
// tab's bookmark state -- something a plain fixture page cannot produce. A
// render entry for any of them fails at setup instead of measuring anything.
//
// The rule under test: focus may change border-colour and add a ring, and may
// NOT repaint a fill. --pp-input-focus-bg remains a live token (it derives
// --pp-focus-bd and still backs two button:hover rules), so the assertion is
// specifically that these focus rules no longer consume it. Themed twins are
// listed alongside their base rule because each one out-ranks it
// (html[data-theme] adds an attribute + a type), so a fill left in a themed
// rule would keep 13 presets lightening on focus after the default surface
// stopped.
for (const [rule, what] of [
  [/\.login-body input:focus \{[^}]*\}/, ".secret-field's input"],
  [/\.login-body \.secret-field:focus-within input \{[^}]*\}/, ".secret-field's :focus-within"],
  [/(?<!\] )\.tags-input-wrap:focus-within \{[^}]*\}/, ".tags-input-wrap"],
  [/html\[data-theme\] \.tags-input-wrap:focus-within \{[^}]*\}/, ".tags-input-wrap (themed)"],
  [/(?<!\] )\.field > input\[type="text"\]:focus, \.field > textarea:focus \{[^}]*\}/, ".field inputs/textarea"],
  [/html\[data-theme\] \.field > input\[type="text"\]:focus, html\[data-theme\] \.field > textarea:focus \{[^}]*\}/, ".field inputs/textarea (themed)"],
  [/(?<!\] )\.search-field:focus \{[^}]*\}/, ".search-field"],
  [/html\[data-theme\] \.search-field:focus \{[^}]*\}/, ".search-field (themed)"],
]) {
  const m = rule.exec(popupCss);
  check(m && !/background/.test(m[0]),
    `popup.css: ${what} repaints its background on focus (§7.3 -- focus may change border-colour and add a ring, nothing else)`);
}

check(/\.wayback-log-row:focus-within\s+\.wayback-perm-tip/.test(optionsCss) &&
  /@media \(hover: hover\) and \(pointer: fine\) \{\s*\.wayback-log-row:hover\s+\.wayback-perm-tip/.test(optionsCss) &&
  optionsCss.includes("background: var(--opt-panel)") &&
  optionsCss.includes("color: var(--opt-fg)"),
  "options.css: archive permission guidance lacks themed focus disclosure, or its hover half escaped the fine-pointer gate");
// options' .confirm-yes clause was dropped from this list (Task 10,
// COMPONENTS.md §4.2/C14b): the generated ui-components region now emits
// ".confirm-popover .confirm-yes"/":hover" with no theme gate and no
// fallback at all (var(--opt-danger)/var(--opt-on-danger) directly), and
// recipe-lint's solidDangerScope/dangerPaired [static] checks pin
// dangerRules() to emitting exactly one self-paired .confirm-yes rule -- so
// the CURRENT source has no hardcoded default left for a themed override to
// out-rank. That is not the same as "can never regress": recipe-lint only
// looks at ui-components.mjs's own recipe source/output, and
// css-region-audit only diffs the generated region against it -- neither
// one scans the HAND-WRITTEN area of options.css for someone re-adding a
// literal `html[data-theme] .confirm-popover .confirm-yes { background:
// #c00 }` override by hand later (a new selector there is legal content as
// far as both gates are concerned). Low risk, not zero risk -- and that
// residual risk is what the class-level `.confirm-yes` paint gate at the
// bottom of this file now closes, for all three surfaces at once.
//
// popup's .confirm-yes clause left this list for the same reason options'
// did (campaign C3a): the solid tier is emitted for pp too now, and the
// themed warn-family override it used to pin here is deleted. The surviving
// .confirm-no clause moved from --pp-warn-bg to --pp-btn-hover in the same
// commit -- what this line guards is "a per-theme token, not a literal",
// and the popover is a neutral card now rather than a warning-coloured one.
check(popupCss.includes("html[data-theme] .confirm-popover .confirm-no:hover { background: var(--pp-btn-hover)") &&
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
check(!/\bconfirm\s*\(/.test(read("library-notes.js")),
  "library-notes.js: a native confirm() dialog crept back in (use showConfirmPopover)");
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
  mdDictJs.includes("Intl.DisplayNames") && libraryVocabJs.includes("pbpDictLanguageLabel"),
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

// ---- hardcoded-color gate: popup.css / options.css / library.css. The
// var()-first color migration (design-uplift tasks 5/12/13) finished for
// popup.css and options.css -- both now sit at zero bare hex AND zero
// qualifying rgba() in the hand-maintained region, so this is a permanent
// RED (zero-tolerance) assertion for those two, not a movable ratchet: the
// tests/hex-ratchet-baseline.json ceiling file this gate used to read is
// gone (deleted design-uplift Task 13 step 4), and any future bare hex/rgba
// literal here is a straight regression, no baseline bump possible.
// library.css's hex is fully migrated too (own zero-tolerance assertion
// below). Its rgba() stays a live ratchet -- library.css:497's
// `background: rgba(220, 80, 80, 0.08)` has a comment admitting there is no
// token for it yet -- LIBRARY_RGBA_CEILING is the debt this last ratchet
// exists to track; lower it (never raise it) as that debt gets paid down.
{
  const LIBRARY_RGBA_CEILING = 1;
  for (const [file, css] of [["popup.css", popupCss], ["options.css", optionsCss]]) {
    check(countBareHex(css) === 0,
      `${file}: bare hex colors leaked outside var() fallbacks in the hand-maintained region (must stay at zero)`);
    check(countQualifyingRgba(css) === 0,
      `${file}: bare rgba() colors leaked outside var() fallbacks in the hand-maintained region (must stay at zero) -- migrate the new literal(s) to a var(--…) token instead of hardcoding a color`);
  }
  check(countBareHex(libraryCss) === 0,
    "library.css: bare hex colors leaked outside var() fallbacks in the hand-maintained region (must stay at zero)");
  const libRgba = countQualifyingRgba(libraryCss);
  check(libRgba <= LIBRARY_RGBA_CEILING,
    `library.css: bare rgba() colors in the hand-maintained region grew from the ceiling of ${LIBRARY_RGBA_CEILING} to ${libRgba} -- migrate the new literal(s) to a var(--…) token instead of hardcoding a color`);
  if (libRgba < LIBRARY_RGBA_CEILING) {
    console.log(`rgba-ratchet: library.css improved to ${libRgba} bare rgba (ceiling ${LIBRARY_RGBA_CEILING}) -- lower LIBRARY_RGBA_CEILING in tests/ui-contract-tests.mjs in this commit`);
  }
}

// ---- chip-bg must never be a literal "transparent" (vocab-group-inspect-
// report.md 2026-08-05 Finding 2): options-chrome.mjs / library-chrome.mjs
// used to copy their pilot's `tag-bg` role into `--{ns}-chip-bg` verbatim,
// and 9 of 13 pilots declare tag-bg as the literal CSS keyword
// "transparent" -- shipping `--lib-chip-bg: transparent;` straight into the
// generated region, which made .vocab-group-chip (and options'
// .tag-gov-kind-badge, same derivation) render with NO pill background at
// all in those themes (dracula caught live: floating text, no pill).
// contrast-audit.mjs's chip-fg-vs-chip-bg pair can't catch a regression back
// to this shape -- it treats a non-hex chip-bg as "composite onto panel"
// and still finds AA against that reconstructed value, the same silent
// pass-through that let the original bug ship unnoticed. This is therefore
// a DIRECT text scan of the generated region, not a derived contrast check:
// grep the actual `--{ns}-chip-bg:` declarations verbatim and fail if any of
// them is the bare word "transparent" (the render oracle's textContrast also
// can't catch this shape -- it composites through an ancestor when the
// probed element's own background resolves transparent, so a chip that
// silently borrowed its panel's contrast would keep passing that check too).
{
  const chipBgLiteralTransparent = (css, ns) => {
    const re = new RegExp(`--${ns}-chip-bg:\\s*([^;]+);`, "g");
    const offenders = [];
    for (const m of css.matchAll(re)) if (m[1].trim() === "transparent") offenders.push(m[0].trim());
    return offenders;
  };
  for (const [file, css, ns] of [["options.css", optionsCss, "opt"], ["library.css", libraryCss, "lib"]]) {
    const offenders = chipBgLiteralTransparent(css, ns);
    check(offenders.length === 0,
      `${file}: --${ns}-chip-bg is the literal "transparent" for ${offenders.length} theme(s) -- .vocab-group-chip/.tag-gov-kind-badge would render with no pill background at all (${offenders.join(", ")})`);
  }
}

// ---- single-default-per-token gate (all three *-chrome surfaces,
// design-uplift Task 12 review round 3 + Task 13 review): a var(--{ns}-X,
// <literal>) fallback is only ever safe as a stand-in for a missing :root
// default IF every call site agrees on what that literal should be.
// options.css round 1/2 both shipped this exact bug -- --opt-save/
// --opt-warn/--opt-danger-bg each had 2-3 DIFFERENT fallback texts for the
// same token, each individually looking reasonable, silently drifted apart
// across call sites written at different times -- and the hex/rgba ratchet
// above cannot see it (the literal is inside a var() call, stripVarCalls
// already removes it from that scan by design). Generalized from
// options.css-only to all three namespaces (Task 13 review) turned up the
// identical bug class in library.css -- --lib-save/--lib-danger/--lib-bg/
// --lib-fg/--lib-fg-muted/--lib-btn-hover each had 2-3 drifted literals,
// none of which even matched library.css's own live :root default (fixed
// by stripping the dead fallback text since the token is never actually
// missing -- --lib-btn-hover's two remaining nested var() fallbacks,
// var(--lib-btn-bg)/var(--lib-code-bg), are the legitimate different shape
// this function already excludes). This walks the hand-maintained region
// for var(--{ns}-X, ...) pairs (skipping a fallback that is itself another
// var() call -- that's the legitimate nested-fallback shape, e.g.
// --opt-fg-hint, var(--opt-fg-muted))) and fails if any --{ns}-X shows up
// with more than one distinct fallback literal.
function findInconsistentVarFallbacks(css) {
  const hand = stripGeneratedRegions(css).replace(/\/\*[\s\S]*?\*\//g, "");
  const byToken = new Map();
  const re = /var\(\s*(--(?:opt|pp|lib)-[a-zA-Z0-9-]+)\s*,\s*([^()]+(?:\([^()]*\)[^()]*)*?)\)/g;
  let m;
  while ((m = re.exec(hand)) !== null) {
    const token = m[1];
    const fallback = m[2].trim();
    if (fallback.startsWith("var(")) continue; // nested var() fallback -- a different, legitimate shape
    if (!byToken.has(token)) byToken.set(token, new Set());
    byToken.get(token).add(fallback);
  }
  const offenders = [];
  for (const [token, fallbacks] of byToken) {
    if (fallbacks.size > 1) offenders.push(`${token}: ${[...fallbacks].join(" vs ")}`);
  }

  // ---- undefined-token gate (design-uplift final-fix I1): a var(--X,
  // fallback) consumer is only a safe stand-in for a token that might be
  // genuinely absent on some theme. If --X has NO definition anywhere in
  // this file -- hand-maintained :root blocks OR a @generated:ui-themes/
  // -components region (composer-derived tokens are real defaults, not
  // dead) -- the fallback isn't a safety net, it's the ONLY value that will
  // EVER render, on every theme, forever. That's exactly how options.css's
  // --opt-text-muted (a typo of --opt-fg-muted, never defined anywhere)
  // shipped a hardcoded #888 invisibly on all 14 themes + default. Scans at
  // ANY nesting depth, not just the direct/outer var() the loop above walks
  // (which deliberately skips nested fallbacks as "a different, legitimate
  // shape") -- a fallback token buried inside another fallback, e.g.
  // var(--pp-input-bg, var(--pp-bg-soft, #2a2a2a)), is exactly as
  // undefined-and-silent if --pp-bg-soft was never given a real value; the
  // outer token (--pp-input-bg) being defined doesn't excuse the inner one.
  const consumed = new Set();
  const fbTokenRe = /var\(\s*(--(?:opt|pp|lib)-[a-zA-Z0-9-]+)\s*,/g;
  let fm;
  while ((fm = fbTokenRe.exec(hand)) !== null) consumed.add(fm[1]);
  const defined = new Set();
  const defRe = /(--(?:opt|pp|lib)-[a-zA-Z0-9-]+)\s*:/g;
  let dm;
  // Full file (generated regions included), comments stripped -- a
  // composer-emitted :root declaration counts as a real definition; a
  // token name only ever appearing inside a doc comment must not.
  const cssNoComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  while ((dm = defRe.exec(cssNoComments)) !== null) defined.add(dm[1]);
  for (const token of consumed) {
    if (!defined.has(token)) offenders.push(`${token}: consumed with a var(..., fallback) but never defined anywhere in this file (hand-maintained or generated) -- the fallback is the only value that will ever render`);
  }
  return offenders;
}
for (const [file, css] of [["popup.css", popupCss], ["options.css", optionsCss], ["library.css", libraryCss]]) {
  const offenders = findInconsistentVarFallbacks(css);
  check(offenders.length === 0,
    `${file}: var(--X, literal) fallback text disagrees across call sites for the same token -- pick one value (add/fix the :root default and consume bare, or align every fallback) -- ${offenders.join("; ")}`);
}

// COMPONENTS.md §4.2 solid-danger tier, file-wide: the confirm popover's
// confirm button is the ONE place a full-strength --{ns}-danger fill is
// allowed, and on all three surfaces its paint is owned by the
// @generated:ui-components recipe. A hand-written rule that paints
// .confirm-yes wins the moment it carries a theme prefix -- `html.dark
// .confirm-popover .confirm-yes` and `html[data-theme] .confirm-popover
// .confirm-yes` are both (0,2,1) against the recipe's (0,2,0) -- and the
// failure is SILENT: the recipe still emits, css-region-audit still passes,
// contrast-audit still greenlights on-danger x danger, and the presets
// quietly render a different palette family. popup shipped exactly that for
// 13 presets (`background: var(--pp-warn-fg); color: var(--pp-warn-bg)` --
// a warn-on-warn confirm button whose contrast measured 4.5-5.2:1 on every
// theme, so no contrast gate could ever have noticed).
//
// Class-level rather than a list of the selectors that once did it: the
// simplest counter-example to a blacklist is the next hand-written override
// nobody has written yet.
//
// The first version of this gate asked "does the selector TEXT contain
// .confirm-yes", and independent review found the counter-example it missed
// in one try: `html[data-theme] .confirm-popover button { background: … }`
// is (0,2,1), out-ranks the recipe's (0,2,0), repaints the confirm button in
// any colour you like -- and never spells `.confirm-yes`. Not a paper
// example either: this file already carries `html[data-theme]
// .confirm-popover button:focus-visible` rules written exactly that way, so
// the element-selector shape is the natural one for the next hand override.
//
// So the question the gate asks is now "COULD this rule paint the confirm
// button", answered from the selector's last compound (the part that decides
// what the rule actually targets):
//   - names .confirm-yes                       -> yes
//   - is a bare `button` under .confirm-popover -> yes (matches both buttons)
//   - names .confirm-no / .confirm-msg          -> no, those are hand-written
//                                                   by design on all three
//                                                   surfaces
//   - is .confirm-popover itself                -> no, the container's own
//                                                   colour is legitimate and
//                                                   loses to the button rule
// `border` shorthand counts only when it carries a colour: every surface
// ships `.confirm-popover button { border: 1px solid }` deliberately
// colourless (it resolves to currentColor), and flagging that would make the
// gate unusable on the very code it is meant to protect. :hover's inset
// `box-shadow` ring stays allowed -- that is how §4.2 specifies the state.
const SOLID_DANGER_PAINT = /(?:^|;)\s*(background|background-color|color|border-color)\s*:/;
const SOLID_DANGER_BORDER_COLOUR = /(?:^|;)\s*border\s*:[^;]*(var\(|#[0-9a-fA-F]{3}|rgba?\(|color-mix\()/;
// Last compound = everything after the final descendant/child/sibling combinator.
const lastCompound = (sel) => sel.split(/\s*[>+~]\s*|\s+/).filter(Boolean).pop() || "";
function paintsConfirmYes(selector) {
  if (!selector.includes(".confirm-popover") && !selector.includes(".confirm-yes")) return false;
  const tail = lastCompound(selector);
  if (/\.confirm-(no|msg)\b/.test(tail)) return false;
  return /\.confirm-yes\b/.test(tail) || /(^|[^-\w.])button\b/.test(tail);
}
for (const [file, css] of [["popup.css", popupCss], ["options.css", optionsCss], ["library.css", libraryCss]]) {
  const hand = stripGeneratedRegions(css).replace(/\/\*[\s\S]*?\*\//g, "");
  const offenders = [];
  for (const m of hand.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = m[1].trim().replace(/\s+/g, " ");
    // A selector list is only as safe as its worst branch.
    if (!selector.split(",").some(paintsConfirmYes)) continue;
    const body = ";" + m[2];
    if (SOLID_DANGER_PAINT.test(body) || SOLID_DANGER_BORDER_COLOUR.test(body)) offenders.push(selector);
  }
  check(offenders.length === 0,
    `${file}: hand-written rule(s) can paint the confirm popover's confirm button -- the solid-danger tier belongs to the @generated:ui-components recipe (COMPONENTS.md §4.2); an element-selector or themed override outranks it silently. Offenders: ${offenders.join(" | ")}`);
}

if (fail.length) {
  console.error(fail.join("\n"));
  process.exit(1);
}
console.log("ui contract ok");
