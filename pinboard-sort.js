// ============================================================
// Pinboard Bookmark Enhanced - Tag-page "sort by popularity"
// Content script for pinboard.in tag list pages (run_at: document_idle)
//
// Adds a client-side "pop" control that reorders the CURRENT page's
// bookmarks by how many people saved each link (the `a.url_link`
// "N others" badge). Click once = most popular first; click again =
// restore original DOM order. No persistence, no network, visible page
// only.
//
// Placement:
//   - own tag pages  : append " ‧ pop" into pinboard's native
//                      #sort_order_picker (next to date · title)
//   - public / other : build a matching control reusing pinboard's
//                      .pagination_select / .sort_arrow classes and
//                      drop it in the tag header (left of RSS, above
//                      the pager) — no collision with RSS or « earlier.
//
// Theme: reuses pinboard's native sort-control classes so the 13
// shipped themes style it for free; active state uses our own class
// with currentColor (bold + underline), never the native #ffa.
// pinboard-themes.js / the theme factory are NOT touched.
// ============================================================

(() => {
  "use strict";

  // ---------- pure helpers (exposed for unit tests) ----------

  // "9 others" / "1 other" / "  3 others " -> 9 / 1 / 3 ; anything else -> 0
  function parsePopCount(text) {
    if (!text) return 0;
    const m = String(text).match(/^\s*(\d+)/);
    return m ? parseInt(m[1], 10) : 0;
  }

  // Popularity of one bookmark element (0 when there is no url_link).
  function extractPop(bookmarkEl) {
    if (!bookmarkEl) return 0;
    const link = bookmarkEl.querySelector("a.url_link");
    return link ? parsePopCount(link.textContent) : 0;
  }

  // Stable descending order by pop. Ties keep original document order.
  // Returns a NEW array of the same elements; does not mutate the input.
  function computeSortedOrder(bookmarkEls) {
    return bookmarkEls
      .map((el, i) => ({ el, pop: extractPop(el), i }))
      .sort((a, b) => (b.pop - a.pop) || (a.i - b.i))
      .map((x) => x.el);
  }

  // Expose for the test harness (harmless in the isolated content world).
  if (typeof window !== "undefined") {
    window.__PBP_POPSORT__ = { parsePopCount, extractPop, computeSortedOrder, getBookmarkRows, makeFallbackArrow };
  }

  // ---------- everything below only runs on a real tag page ----------

  // Only tag list pages: /t:..., /u:x/t:..., incl. multi-tag.
  function isTagListPage() {
    if (!/(^|\/)(u:[^/]+\/)?t:/.test(location.pathname)) return false;
    const mc = document.getElementById("main_column");
    return !!(mc && mc.querySelector("div.bookmark"));
  }

  // Trusted-only storage (roadmap #36): prefs come from the SW's allowlisted
  // get_site_prefs message — content scripts can no longer read chrome.storage
  // directly (the same areas hold credentials). Default ON on any failure.
  async function readEnabled() {
    try {
      const prefs = await chrome.runtime.sendMessage({ type: "get_site_prefs" });
      if (prefs && typeof prefs === "object" && !prefs.error) return prefs.tagSortByPopEnabled !== false;
      return true;
    } catch (_) {
      return true;
    }
  }

  const CONTROL_ID = "pbp-pop-sort";
  let originalOrder = null; // bookmark ROWS in document order, snapshot at inject
  let sorted = false;

  // The reorderable unit is the TOPMOST ancestor (below #main_column) that still wraps
  // exactly this one bookmark. Covers every structure seen in the wild:
  //   • public /t:          → div.bookmark is a direct #main_column child (row = bookmark)
  //   • user /u:x/t:         → each bookmark wrapped in an anonymous <div> (row = wrapper)
  //   • auto-pagination      → an appended page may nest wrappers inside a page-container
  //                            (e.g. .autopagerize_page_element); climb stops at the
  //                            per-bookmark wrapper, never the multi-bookmark page block.
  // The climb halts at the #main_column boundary, so it never scans the whole column.
  function getBookmarkRows(mc) {
    const rows = [], seen = new Set();
    mc.querySelectorAll("div.bookmark").forEach((bm) => {
      let row = bm;
      while (
        row.parentElement &&
        row.parentElement !== mc &&
        row.parentElement.querySelectorAll("div.bookmark").length === 1
      ) {
        row = row.parentElement;
      }
      if (!seen.has(row)) { seen.add(row); rows.push(row); }
    });
    return rows;
  }

  // Move the given ordered bookmark rows to where the first row sits, preserving any
  // non-row siblings (header, pager, scripts) around the block.
  function reorder(mc, order) {
    // Pin the scroll position across the move. Reordering rows lets the browser's scroll
    // anchoring nudge scrollY to keep the visible content stable; an infinite-scroll pager
    // (e.g. AutoPagerize) watching a bottom sentinel reads that nudge as "near the bottom"
    // and loads another page — which we fold in and re-sort, which nudges again… a runaway
    // that loads page after page and stutters the cursor. Restoring scrollTop afterward
    // makes our reorder invisible to any scroll-driven pager. (Reading scrollTop first
    // flushes layout so the anchoring adjustment is applied before we undo it.)
    const se = document.scrollingElement || document.documentElement;
    const keepTop = se ? se.scrollTop : 0;

    // Anchor = the live first bookmark row (re-queried, so it is always still attached
    // even if the page mutated since inject). Removing all rows collapses them to this
    // one point, so the reordered block lands exactly where the list is.
    const first = getBookmarkRows(mc)[0];
    if (!first) return;
    const marker = document.createComment("pbp-pop");
    mc.insertBefore(marker, first);
    const frag = document.createDocumentFragment();
    for (const el of order) frag.appendChild(el); // moves el into frag, in order
    mc.insertBefore(frag, marker);
    marker.remove();

    if (se && se.scrollTop !== keepTop) se.scrollTop = keepTop;
  }

  function onToggle(mc, link) {
    sorted = !sorted;
    if (sorted) {
      // Snapshot whatever is loaded right now — this includes any pages an infinite-scroll
      // pager (AutoPagerize etc.) has already appended, so one click sorts the whole
      // currently-loaded page. We deliberately do NOT watch for later pages: auto-re-sorting
      // as new pages stream in feeds an unbreakable loop with the pager's load trigger
      // (re-sort shifts layout -> pager loads -> re-sort -> …). Load more, click again.
      originalOrder = getBookmarkRows(mc);
      reorder(mc, computeSortedOrder(originalOrder));
    } else {
      reorder(mc, originalOrder); // restore the captured order
    }
    link.classList.toggle("pbp-pop-active", sorted);
  }

  function injectStyle() {
    if (document.getElementById("pbp-pop-style")) return;
    const st = document.createElement("style");
    st.id = "pbp-pop-style";
    st.textContent =
      "#" + CONTROL_ID + "{cursor:pointer}" +
      "#" + CONTROL_ID + ".pbp-pop-active{font-weight:700;text-decoration:underline}" +
      "#pbp-pop-picker .sort_arrow{vertical-align:middle}";
    (document.head || document.documentElement).appendChild(st);
  }

  function makePopLink() {
    const a = document.createElement("a");
    a.id = CONTROL_ID;
    a.href = "#";
    a.textContent = "pop";
    let popTitle = "Sort this page by popularity";
    try {
      const m = chrome.i18n && chrome.i18n.getMessage("popSortTitle");
      if (m) popTitle = m;
    } catch (_) {}
    a.title = popTitle;
    return a;
  }

  // Inline SVG up/down arrow for the fallback picker. Avoids the literal ⇳
  // (U+21F3) dingbat, which can fall back to Segoe UI Emoji and stall first
  // paint on Windows hi-DPI Chrome (see CLAUDE.md font-fallback notes).
  // currentColor → inherits the native picker text color across all 13 themes.
  function makeFallbackArrow() {
    const arrow = document.createElement("span");
    arrow.className = "sort_arrow";
    arrow.innerHTML =
      '<svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true" ' +
      'fill="none" stroke="currentColor" stroke-width="1.5" ' +
      'stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M5 6 8 3l3 3M5 10l3 3 3-3"/></svg>';
    return arrow;
  }

  // Public/other pages: place the fallback picker in the tag header,
  // left of the float:right RSS, above the bookmark/pager block.
  function placeFallback(mc, node) {
    const rssbox = mc.querySelector(".rss_linkbox");
    const header = (rssbox && rssbox.closest("#main_column > div")) || mc.firstElementChild;
    // No real header (or it resolved to a bookmark) → drop the control above the list,
    // never inside a bookmark.
    if (!header || header.classList.contains("bookmark")) {
      mc.insertBefore(node, getBookmarkRows(mc)[0] || null);
      return;
    }
    const clear = header.querySelector(':scope > div[style*="clear"]');
    if (clear) header.insertBefore(node, clear);
    else header.appendChild(node);
  }

  function inject(mc) {
    if (document.getElementById(CONTROL_ID)) return; // no double-inject
    const link = makePopLink();
    const picker = document.getElementById("sort_order_picker");
    if (picker) {
      picker.appendChild(document.createTextNode(" ‧ "));
      picker.appendChild(link);
    } else {
      const span = document.createElement("span");
      span.className = "pagination_select";
      span.id = "pbp-pop-picker";
      const arrow = makeFallbackArrow();
      span.appendChild(document.createTextNode("\u00A0")); // nbsp before arrow (matches native picker)
      span.appendChild(arrow);
      span.appendChild(document.createTextNode(" "));
      span.appendChild(link);
      placeFallback(mc, span);
    }
    injectStyle();
    link.addEventListener("click", (e) => {
      e.preventDefault();
      try { onToggle(mc, link); } catch (_) { /* never break the host page */ }
    });
  }

  async function main() {
    try {
      if (!isTagListPage()) return;
      if (!(await readEnabled())) return;
      const mc = document.getElementById("main_column");
      if (mc) inject(mc);
    } catch (_) { /* never break the host page */ }
  }

  main();
})();
