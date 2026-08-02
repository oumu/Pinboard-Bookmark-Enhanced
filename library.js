// Library page glue: view switching, hash routing, cross-page freshness.
// Hash precedence: explicit #vocab/#notes in the URL > last-view memory
// (localStorage) > default #vocab. The memory key is page-local UI state,
// never synced.
const PBP_LIB_VIEW_KEY = "pbp-lib-last-view";
const PBP_LIB_VIEWS = ["vocab", "notes"];

function pbpLibActiveView() {
  return $id("view-notes").hidden ? "vocab" : "notes";
}

function _pbpLibApplyView(view, pushHash) {
  const v = PBP_LIB_VIEWS.includes(view) ? view : "vocab";
  for (const name of PBP_LIB_VIEWS) {
    const active = name === v;
    $id("view-" + name).hidden = !active;
    const tab = $id("lib-tab-" + name);
    tab.setAttribute("aria-selected", String(active));
    tab.classList.toggle("active", active);
    tab.tabIndex = active ? 0 : -1;
  }
  try { localStorage.setItem(PBP_LIB_VIEW_KEY, v); } catch (_) {}
  if (pushHash) history.replaceState(null, "", "#" + v);
  document.dispatchEvent(new CustomEvent("pbp-lib-view", { detail: { view: v } }));
}

function _pbpLibInitialView() {
  const fromHash = (location.hash || "").replace(/^#/, "");
  if (PBP_LIB_VIEWS.includes(fromHash)) return fromHash;
  try {
    const remembered = localStorage.getItem(PBP_LIB_VIEW_KEY);
    if (PBP_LIB_VIEWS.includes(remembered)) return remembered;
  } catch (_) {}
  return "vocab";
}

// Enable decorative transitions (.confirm-popover enter/exit) only after the
// initial paint — same double-rAF gate as options.js/popup.js/md-preview.js,
// so this adds zero first-frame cost on the cold-start path.
if (typeof requestAnimationFrame === "function") {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    document.documentElement.classList.add("motion-ready");
  }));
}

document.addEventListener("DOMContentLoaded", () => {
  // Same contract as every other page (popup.js / options.js / md-preview.js):
  // i18n.js does not self-apply data-i18n attributes, so each page must call
  // both explicitly before relying on translated markup.
  initI18n();
  applyI18n();
  document.title = t("libraryTitle");
  for (const name of PBP_LIB_VIEWS) {
    $id("lib-tab-" + name).addEventListener("click", () => _pbpLibApplyView(name, true));
  }
  window.addEventListener("hashchange", () => {
    const v = (location.hash || "").replace(/^#/, "");
    if (PBP_LIB_VIEWS.includes(v) && v !== pbpLibActiveView()) _pbpLibApplyView(v, false);
  });
  // Words saved from the reader while this tab was hidden must show up on
  // return; view modules listen and re-read IndexedDB / storage.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      document.dispatchEvent(new CustomEvent("pbp-lib-view", { detail: { view: pbpLibActiveView() } }));
    }
  });
  _pbpLibApplyView(_pbpLibInitialView(), true);
});
