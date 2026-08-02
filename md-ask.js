// ============================================================
// Pinboard Bookmark Enhanced - md-ask.js (ask-the-page panel +
// selection explain; this file starts with the panel shell).
// Loaded ONLY by md-preview.html as the LAST script in the chain.
// Top level: function/const definitions + one "pbp:rendered"
// listener registration - no chrome.*/DOM side effects, so
// tests/md-ai-tests.html can load it on file://.
// Depends on: md-ai-core.js (pbpAi*/pbpAskHist*), ai.js
// (callAIStream/getOrCreateInflight), i18n.js (t/applyI18n),
// md-convert.js (renderMarkdown, used by the answer renderer).
// ============================================================

// ---- Inline SVG constants (project rule: no emoji/dingbat glyphs) ----
const PBP_ASK_BTN_SVG = typeof PBP_ICONS !== "undefined" ? PBP_ICONS.ask : "";
const PBP_ASK_CLOSE_SVG = typeof PBP_ICONS !== "undefined" ? PBP_ICONS.cross : "";
const PBP_ASK_CLEAR_SVG = typeof PBP_ICONS !== "undefined" ? PBP_ICONS.trash : "";
const PBP_ASK_SEND_SVG = typeof PBP_ICONS !== "undefined" ? PBP_ICONS.send : "";
// Alias of the shared refresh icon (one Lucide source for every retry/regen
// affordance). typeof-guarded so a page that loads this file without shared.js
// degrades to an empty icon instead of a ReferenceError.
const PBP_ASK_REGEN_SVG = typeof PBP_ICONS !== "undefined" ? PBP_ICONS.refresh : "";

// ---- Pure: should the "a" hotkey ignore this event target? ----
function pbpAskIsTypingTarget(el) {
  if (!el || !el.tagName) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return !!el.isContentEditable;
}

let _pbpAskState = null;
let _pbpAskRailHandle = null; // rail accordion (spec 2026-07-04): headless handle, see _pbpAskBuildRailEntry

async function pbpAskInit(detail) {
  const view = document.getElementById("rendered-view");
  if (!view || _pbpAskState) return;
  const s = await pbpAiGetSettings();
  if (!pbpAiAvailable(s)) return; // master off / no key: no button, no hotkey, no bridge
  // Idempotent index guard: md-translate may have indexed already; an
  // unconditional re-index would reset its md/text caches mid-flight.
  if (!pbpAiBlocks().length) pbpAiIndexBlocks(view);
  if (!pbpAiBlocks().length) return;

  _pbpAskState = {
    s,
    url: String((detail && detail.url) || ""),
    title: String((detail && detail.title) || ""),
    // Non-secret Pinboard username (md-preview.js previewAccount). Scopes
    // the persisted thread key — account-isolation invariant, same as the
    // tr_/gloss_ cache families.
    account: String((detail && detail.account) || ""),
    // Forum/thread pages get the thread-variant prompt (same detection
    // skim uses: md-preview.js resolves pbpForumShouldMark into detail).
    forum: !!(detail && detail.forum),
    panel: null,
    ctx: null,        // lazy context cache (filled by the send-flow task)
    records: [],
    running: false,
    ctrl: null        // shared AbortController (Stop button aborts it)
  };

  _pbpAskBuildRailEntry();

  // Hotkey "a" toggles the panel; Esc closes it. Guards: never while
  // typing (input/textarea/select/contenteditable) and never with any
  // modifier held. Esc coexistence: setupDrawer's own document-level Esc
  // handler owns the event while the rail drawer is open, and an open
  // [popover] (explain, top layer) closes itself first - we yield to both.
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (!_pbpAskIsOpen()) return;
      if (document.body.classList.contains("rail-open")) return;
      try { if (document.querySelector(":popover-open")) return; } catch (_) {}
      _pbpAskSetOpen(false);
      return;
    }
    if (e.key !== "a" && e.key !== "A") return;
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    if (pbpAskIsTypingTarget(e.target)) return;
    e.preventDefault();
    _pbpAskSetOpen(!_pbpAskIsOpen());
  });

  // Bridge for the explain popover's "ask a follow-up" footer button:
  // opens the panel, optionally prefills the textarea, focuses it.
  // Only exists when gating passed (callers typeof-check it).
  window.pbpAskOpenPanel = function (prefillText) {
    _pbpAskSetOpen(true);
    const ta = document.getElementById("ask-input");
    if (ta) {
      if (typeof prefillText === "string" && prefillText) ta.value = prefillText;
      ta.focus();
    }
  };

  // Page close terminates any in-flight request (error matrix last row).
  window.addEventListener("pagehide", () => {
    if (_pbpAskState && _pbpAskState.ctrl) _pbpAskState.ctrl.abort();
  });
}

// Rail entry. Generated markup (exact):
//   <div class="rail-section" id="ask-section">
//     <button type="button" id="ask-open" class="action-btn ask-open-btn"
//             aria-expanded="false" aria-controls="ask-panel">
//       <svg ...PBP_ASK_BTN_SVG...></svg><span class="btn-label">Ask</span>
//     </button>
//   </div>
// Anchor: directly after #tr-section when the translate entry rendered,
// else after the Raw/Rendered .view-toggle (the same slot translate uses,
// so the rail order is: view-toggle, [tr-section], ask-section, Export).
function _pbpAskBuildRailEntry() {
  const rail = document.getElementById("rail");
  if (!rail || document.getElementById("ask-open")) return;
  const anchor = document.getElementById("tr-section") || rail.querySelector(".view-toggle");
  if (!anchor) return;
  const sec = document.createElement("div");
  sec.className = "rail-section";
  sec.id = "ask-section";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.id = "ask-open";
  btn.className = "action-btn ask-open-btn";
  btn.setAttribute("aria-expanded", "false");
  btn.setAttribute("aria-controls", "ask-panel");
  btn.innerHTML = PBP_ASK_BTN_SVG; // static inline SVG constant only
  const bl = document.createElement("span");
  bl.className = "btn-label";
  bl.textContent = t("askOpen");
  btn.appendChild(bl);
  sec.appendChild(btn);
  // Rail accordion (spec 2026-07-04): headless mode -- #ask-section's only
  // child is this same button, whose aria-expanded/aria-controls already
  // correctly describe "is #ask-panel visible" (see the design-decision note
  // above this task). pbpRailCollapsible leaves it untouched; only wires the
  // storage-backed handle for interface conformance.
  _pbpAskRailHandle = pbpRailCollapsible(sec, "ask", { label: btn, defaultCollapsed: true });
  anchor.insertAdjacentElement("afterend", sec);
  btn.addEventListener("click", () => _pbpAskSetOpen(!_pbpAskIsOpen()));
}

// Lazy panel mount (first open pays the cost; spec 3.1 lazy-UI rule).
// The template is a STATIC string: no user/model text ever flows through
// this innerHTML (questions use textContent; answers stream as textContent
// and finalize through renderMarkdown(), the single sanitize point).
function _pbpAskBuildPanel() {
  if (!_pbpAskState) return null;
  if (_pbpAskState.panel) return _pbpAskState.panel;
  const panel = document.createElement("aside");
  panel.id = "ask-panel";
  panel.hidden = true;
  panel.setAttribute("aria-labelledby", "ask-title");
  panel.innerHTML = [
    '<header class="ask-head">',
    '  <h2 id="ask-title" data-i18n="askTitle">Ask the page</h2>',
    '  <button type="button" id="ask-export" class="ask-ic" data-i18n-title="mdCopyMarkdown" data-i18n-aria="mdCopyMarkdown">' + PBP_ASK_COPY_SVG + '</button>',
    '  <button type="button" id="ask-clear" class="ask-ic" data-i18n-title="askClear" data-i18n-aria="askClear">' + PBP_ASK_CLEAR_SVG + '</button>',
    '  <button type="button" id="ask-close" class="ask-ic" data-i18n-title="askClose" data-i18n-aria="askClose">' + PBP_ASK_CLOSE_SVG + '</button>',
    '</header>',
    '<div id="ask-thread" role="log" aria-live="polite">',
    '  <p id="ask-empty" class="ask-empty" data-i18n="askEmptyHint"></p>',
    '</div>',
    '<div id="ask-chips">',
    '  <button type="button" class="ask-chip" data-i18n="askChipSummarize"></button>',
    '  <button type="button" class="ask-chip" data-i18n="askChipArgument"></button>',
    '  <button type="button" class="ask-chip" data-i18n="askChipData"></button>',
    '</div>',
    '<form id="ask-form">',
    '  <textarea id="ask-input" rows="2" dir="auto" maxlength="4000" data-i18n-placeholder="askPlaceholder"></textarea>',
    '  <div class="ask-actions">',
    '    <button type="button" id="ask-stop" class="action-btn" hidden data-i18n="askStop">Stop</button>',
    '    <button type="submit" id="ask-send" class="action-btn">' + PBP_ASK_SEND_SVG + '<span class="btn-label" data-i18n="askSend">Send</span></button>',
    '  </div>',
    '</form>',
    '<div id="ask-meta" aria-live="polite"></div>'
  ].join("\n");
  // Starter chips: applyI18n fills them from data-i18n - each locale's
  // message is a complete, natural question. (A JS pass used to append
  // ": <topic>" on top, which glued a title onto an already-finished
  // question in every locale - "What is the main argument?: Setup".)
  applyI18n(panel);
  document.body.appendChild(panel);
  _pbpAskState.panel = panel;
  // #ask-thread now exists in the live document — restore history straight
  // away instead of polling for it via MutationObserver (audit #28).
  // _pbpAskHistRestore is idempotent (_pbpAskHistRestored guard) and a no-op
  // until the "pbp:rendered" listener below has set _pbpAskHistUrl, which by
  // construction (this function is only reachable through wiring pbpAskInit
  // adds AFTER that same event) has already run by the time a user can open
  // the panel.
  _pbpAskHistRestore().catch(() => {});

  panel.querySelector("#ask-close").addEventListener("click", () => _pbpAskSetOpen(false));
  panel.querySelector("#ask-export").addEventListener("click", _pbpAskCopyThread);
  // Clear seam: Task 15 appends _pbpAskShowClearConfirm (inline confirm
  // strip) to this same file - function declarations hoist file-wide, so
  // once Task 15 lands this click routes to the confirm strip; until then
  // it clears immediately. Single listener, no double-wiring.
  panel.querySelector("#ask-clear")._pbpWired = true;
  panel.querySelector("#ask-clear").addEventListener("click", () => {
    if (typeof _pbpAskShowClearConfirm === "function") { _pbpAskShowClearConfirm(); return; }
    _pbpAskClearThread().catch(() => {});
  });
  // Static starter chips (i18n text, zero tokens): click = put the chip
  // text into the textarea and send it through the submit seam.
  panel.querySelectorAll(".ask-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const ta = document.getElementById("ask-input");
      if (ta) ta.value = chip.textContent;
      _pbpAskOnSubmit();
    });
  });
  panel.querySelector("#ask-form").addEventListener("submit", (e) => {
    e.preventDefault();
    _pbpAskOnSubmit();
  });
  // Enter sends, Shift+Enter inserts a newline (spec 5.1). IME guard
  // first: Chrome dispatches a key="Enter" keydown with isComposing=true
  // (keyCode 229 as a fallback signal) when the user confirms an IME
  // candidate - that Enter must never submit the still-uncommitted
  // composition text.
  panel.querySelector("#ask-input").addEventListener("keydown", (e) => {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      _pbpAskOnSubmit();
    }
  });
  return panel;
}

function _pbpAskIsOpen() {
  return document.body.classList.contains("ask-open");
}

// NON-MODAL by design: the panel is supplementary - answers cite the
// article and clicking a citation must scroll/highlight the original
// block, so the article has to stay scrollable, selectable and focusable
// while the panel is open. Therefore: no focus trap, no scrim, no
// aria-modal (deliberately UNLIKE setupDrawer's modal rail drawer, which
// overlays the page). Esc and the close button dismiss it.
function _pbpAskSetOpen(open) {
  const panel = _pbpAskBuildPanel();
  if (!panel) return;
  if (open) {
    const drawerWasOpen = document.body.classList.contains("rail-open");
    const ae = document.activeElement;
    if (drawerWasOpen) pbpRailDrawerClose();
    if (_pbpAskRailHandle) _pbpAskRailHandle.expand(true); // ask entry activation -> auto-expand (temp; no-op visually, see design note)
    // Remember who opened us so we can hand focus back on close (non-modal,
    // so this is focus-RETURN only, not a trap). Skip if focus is already
    // inside the panel (e.g. re-open while open).
    const opener = drawerWasOpen ? document.getElementById("rail-toggle") : ae;
    if (opener && opener !== document.body && !panel.contains(opener)) _pbpAskState.opener = opener;
  }
  document.body.classList.toggle("ask-open", open);
  // First-ever open: _pbpAskBuildPanel just appendChild'd the panel in this
  // same synchronous task, so without a style flush between mount and the
  // hidden flip the browser computes only the final state and the slide-in
  // transition (md-preview.css #ask-panel[hidden]) never runs. Forcing one
  // reflow while [hidden] styles are applied makes the first open animate
  // like every later one -- same void-offsetWidth trick _pbpAskFlash below
  // already uses to restart its fallback animation.
  if (open && panel.hidden) void panel.offsetWidth;
  panel.hidden = !open;
  const btn = document.getElementById("ask-open");
  if (btn) btn.setAttribute("aria-expanded", open ? "true" : "false");
  if (open) {
    // Transparency-line seam: implemented by the send-flow task.
    if (typeof _pbpAskUpdateMeta === "function") _pbpAskUpdateMeta();
    const ta = document.getElementById("ask-input");
    if (ta) ta.focus();
  } else {
    const op = _pbpAskState.opener;
    const isVisible = (el) => {
      if (!el || typeof el.focus !== "function" || !document.contains(el)) return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 &&
        rect.top < window.innerHeight && rect.left < window.innerWidth;
    };
    const focusTarget = [op, document.getElementById("ask-open"), document.getElementById("rail-toggle")].find(isVisible);
    if (focusTarget) focusTarget.focus();
    _pbpAskState.opener = null;
  }
}

// Clear: wipe the visible thread, restore starter chips + empty hint,
// and erase the persisted ask_<url> history.
// WONTFIX (ask campaign 2026-07, Codex finding): with TWO preview tabs on
// the same URL, a round that tab B already had in flight when tab A
// cleared will still append once it finishes - the wiped history "grows
// back" one round. Guarding it needs a cross-tab tombstone/epoch in the
// IDB entry, and the semantics are genuinely arguable (from B's view its
// just-finished answer SHOULD persist). Scope: same account, same URL,
// two open readers, mid-stream clear - accepted as-is.
async function _pbpAskClearThread() {
  // Wipe the in-memory conversation FIRST: st.rounds feeds every future
  // prompt (_pbpAskRun/_pbpAskUpdateMeta), and aborting any in-flight
  // request sends it down the AbortError branch of _pbpAskRun's catch -
  // which never pushes to st.rounds or ask history - so a stream that
  // was mid-flight when the user clicked Clear can't silently "revive"
  // the wiped conversation once it finishes.
  // Drop the restore flag SYNCHRONOUSLY, before any await: a restore that
  // is currently parked on its IDB read would otherwise come back, see the
  // old flag, and repopulate st.records / strip the empty hint from the
  // just-cleared thread (its own frag guard fires too late to stop that) -
  // letting the export button copy history the user had erased.
  _pbpAskHistRestored = false;
  if (_pbpAskState) {
    _pbpAskState.rounds = [];
    _pbpAskState.records = [];
    if (_pbpAskState.ctrl) _pbpAskState.ctrl.abort();
  }
  const thread = document.getElementById("ask-thread");
  if (thread) {
    const empty = document.createElement("p");
    empty.id = "ask-empty";
    empty.className = "ask-empty";
    empty.textContent = t("askEmptyHint");
    thread.replaceChildren(empty);
  }
  const chips = document.getElementById("ask-chips");
  if (chips) chips.hidden = false;
  if (_pbpAskState) await pbpAskHistSet(_pbpAskState.url, [], _pbpAskState.account);
  // Rounds were just wiped - drop the stale token estimate and the
  // long-thread window note from the transparency line immediately.
  if (typeof _pbpAskUpdateMeta === "function") _pbpAskUpdateMeta();
}

// Send-flow seam: _pbpAskSend lands in the next task (same file, function
// declarations hoist file-wide). Until then submit is a silent no-op
// (typeof on an undeclared identifier is safe, never a ReferenceError).
function _pbpAskOnSubmit() {
  if (typeof _pbpAskSend === "function") _pbpAskSend().catch(() => {});
}

// Init hookup: top-level listener registration only (no other side
// effects; the tests page loads this file on file:// and never fires it).
// Bounded retry (user report 2026-07-15): pbp:rendered fires ONCE per page
// life, and a transient failure inside the single init run -- a cold
// storage read returning empty settings (hasAIKey momentarily false), or
// any swallowed throw -- used to leave the tab PERMANENTLY without the Ask
// entry or hotkey (unreproducible afterwards, classic race). Success is
// _pbpAskState being set (pbpAskInit's first act after its gates); two
// spaced retries re-run the full gate chain, so a genuinely disabled AI
// config just re-checks twice, silently, with no UI flash.
function _pbpAskInitWithRetry(detail, attempt) {
  attempt = attempt || 1;
  pbpAskInit(detail).catch(() => {}).then(() => {
    if (!_pbpAskState && attempt < 3) {
      setTimeout(() => _pbpAskInitWithRetry(detail, attempt + 1), attempt * 1000);
    }
  });
}
if (typeof document !== "undefined") {
  document.addEventListener("pbp:rendered", (e) => {
    _pbpAskInitWithRetry((e && e.detail) || {});
  }, { once: true });
}

// ============================================================
// Ask send pipeline (Task 13), part 1: pure functions.
// ============================================================

// Context budget in estimated tokens (chars/4; spec 5.1: ~24k, tunable).
const PBP_ASK_CTX_BUDGET = 24000;
// Hard per-block char cap applied before a line enters the budget calc
// (naming mirrors PBP_EXPLAIN_BLOCK_CAP below): a single abnormally huge
// block (e.g. a full-page <pre> log dump) must not alone blow the whole
// context budget.
const PBP_ASK_BLOCK_CAP = 8000;

// Layered context builder. blocks = pbpAiBlocks() entries ({n, el, tag}).
// Always keeps every heading block (h2/h3/h4) plus the first 3 and last 2
// blocks; the remaining budget is filled by sampling the leftover middle
// blocks at uniform document-order intervals (largest count that fits).
// Returns { text: "[Pn] <text>" lines joined by \n, sentBlocks, totalBlocks,
// sent: Set<block n actually included> } - `sent` lets the chip pass tell a
// citation of a sampled-OUT paragraph from a genuinely grounded one.
function pbpAskBuildContext(blocks, budgetTokens) {
  const budget = (budgetTokens === undefined || budgetTokens === null)
    ? PBP_ASK_CTX_BUDGET : Number(budgetTokens);
  const list = Array.isArray(blocks) ? blocks : [];
  const totalBlocks = list.length;
  if (!totalBlocks) return { text: "", sentBlocks: 0, totalBlocks: 0, sent: new Set() };
  // pbpAiTextOfKatex (not raw b.el.textContent): a math block's textContent
  // gets mutated by KaTeX's async render into a glyph+MathML+annotation
  // duplicate string (D10-1) - the KaTeX-aware variant gives the model a
  // clean "$tex$" source instead.
  const lineOf = (b) => "[P" + b.n + "] " +
    String(pbpAiTextOfKatex(b.n) || "").slice(0, PBP_ASK_BLOCK_CAP).replace(/\s+/g, " ").trim();
  // Largest k whose evenly-spaced sample of `items` (chars taken from the
  // matching index of `lens`, plus a fixed `offsetChars`) fits within
  // `budgetTokens`. Shared by the mandatory-downgrade branch and the
  // middle-sampling pass below: same "largest count that fits" rule,
  // applied to whichever candidate list/budget needs it.
  const sampleFit = (items, lens, offsetChars, budgetTokens2) => {
    for (let k = items.length; k >= 1; k--) {
      let chars = offsetChars;
      const idxs = [];
      for (let j = 0; j < k; j++) {
        const ix = Math.floor(j * items.length / k);
        idxs.push(ix);
        chars += lens[ix];
      }
      if (pbpAiEstimateTokens(chars) <= budgetTokens2) return idxs;
    }
    return [];
  };
  const mandatory = [];
  const middle = [];
  list.forEach((b, i) => {
    const must = b.tag === "h2" || b.tag === "h3" || b.tag === "h4"
      || i < 3 || i >= totalBlocks - 2;
    (must ? mandatory : middle).push(b);
  });
  const mandLens = mandatory.map((b) => lineOf(b).length + 1);
  let baseChars = 0;
  for (const len of mandLens) baseChars += len;
  let picked;
  if (pbpAiEstimateTokens(baseChars) > budget) {
    // mandatory alone (headings + first 3 + last 2) already overflows
    // the WHOLE budget - e.g. a page-long <pre> sits among the first 3
    // blocks. Degrade it with the same sampling rule middle uses below;
    // no room is left for middle in this branch.
    picked = new Set(sampleFit(mandatory, mandLens, 0, budget).map((ix) => mandatory[ix].n));
  } else {
    picked = new Set(mandatory.map((b) => b.n));
    const midLens = middle.map((b) => lineOf(b).length + 1);
    for (const ix of sampleFit(middle, midLens, baseChars, budget)) picked.add(middle[ix].n);
  }
  const lines = [];
  for (const b of list) if (picked.has(b.n)) lines.push(lineOf(b));
  return { text: lines.join("\n"), sentBlocks: lines.length, totalBlocks, sent: picked };
}

// History serialization budget (est tokens) + per-answer char cap. The
// article context is bounded (PBP_ASK_CTX_BUDGET) but history was not:
// 4 rounds x 4096-token answers stacked past 40k est tokens per request,
// hard-failing 32k-context models (small Ollama locals especially).
const PBP_ASK_HIST_BUDGET = 6000;
const PBP_ASK_HIST_ANSWER_CAP = 8000;
// Whole-request input target (est tokens): 32k window minus the 4096
// maxTokens output reserve, minus heuristic slack. History yields FIRST
// when system+title+context+question already crowd the target - the
// article is the grounding and keeps priority. Best-effort (chars/4
// estimate), not a tokenizer guarantee.
const PBP_ASK_INPUT_TARGET = 28000;

// Prompt builder. history = [{q, a}] (caller passes the in-memory rounds);
// only the last 4 are serialized, newest-first budget fill - when the
// budget runs out the OLDEST of those rounds drop first (the most recent
// round always fits: both its q and a are char-capped upstream/here).
// The CITES contract here is what pbpAiParseCites (md-ai-core, Task 5)
// parses on the way back.
//
// Research-grounded structure (ask campaign 2026-07):
// - Page before question stays: Anthropic/Gemini long-context guidance
//   (question-after-document, up to +30%) - the pre-existing layout was
//   already right, so only the interior changed.
// - "Reminder" line right before QUESTION = OpenAI's sandwich placement,
//   compatible with the Anthropic ordering above.
// - Silent locate-then-answer process line = Anthropic quote-first
//   guidance, kept internal so the output format (and the CITES parser)
//   is untouched - same approach the skim prompt ships.
// - Rule 5's three-way honesty (full/partial/none) targets the measured
//   failure mode: models fabricate hardest when context PARTIALLY covers
//   a question (Google "Sufficient Context", ICLR 2025). Kept narrative -
//   an explicit "answer/unknown" option menu induces artifact abstention.
// - Pronoun resolution against PREVIOUS Q&A = the QuAC/CANARD failure
//   class ("which one was the second?"), folded into the same call.
// - forum flag swaps the source noun (thread vs article), mirroring the
//   skim prompt's variant; [Pn]/CITES semantics are identical.
function pbpAskBuildPrompt(args) {
  const a = args || {};
  const context = String(a.context == null ? "" : a.context);
  const question = String(a.question == null ? "" : a.question);
  const title = String(a.title == null ? "" : a.title).replace(/\s+/g, " ").trim().slice(0, 200);
  const src = a.forum ? "thread" : "article";
  const system = [
    a.forum
      ? "You answer questions about ONE web discussion thread supplied below as numbered paragraphs."
      : "You answer questions about ONE article supplied below as numbered paragraphs.",
    "Process, before writing anything: if the question leans on earlier turns (pronouns, \"the second one\", \"that part\"), silently resolve it against PREVIOUS Q&A into a self-contained question; then silently locate every paragraph that bears on it, and answer from those paragraphs.",
    "Rules:",
    "1. Answer in the same language as the question. The " + src + " itself may be written in a different language - search all of it anyway.",
    "2. Use ONLY the " + src + ". Do not use outside knowledge.",
    "3. After every claim the " + src + " supports, add an inline citation token [P<n>] where <n> is the paragraph number from the " + src + ". Write each citation as its own token, e.g. [P3][P5]. NEVER group citations inside one pair of brackets or parentheses such as (P3, P5). Cite only paragraphs you actually drew on.",
    "4. End the answer with a CITES: block - one line per cited paragraph, formatted exactly as:",
    "   P<n>: \"verbatim quote of 15 words or fewer, in the " + src + "'s original language\"",
    "5. Cover honestly: if the " + src + " fully answers the question, just answer; if it covers it only partially, answer what it does cover and say plainly what it does not; if it does not cover it at all, say so plainly. Never fill a gap from outside knowledge, and never invent citations."
  ].join("\n");
  const reminder = "(Reminder: use only the " + src + " above, cite [P<n>] after supported claims, and say plainly what it does not cover.)";
  // History budget yields to the whole-request target: everything that is
  // NOT history is fixed cost, and history gets whatever headroom is left
  // (capped at its own 6000). The newest round is still always kept - its
  // char caps bound the worst-case overshoot within the estimate's slack.
  const fixedChars = system.length + title.length + context.length
    + question.length + reminder.length + 64;
  const histBudget = Math.min(PBP_ASK_HIST_BUDGET,
    Math.max(0, PBP_ASK_INPUT_TARGET - pbpAiEstimateTokens(fixedChars)));
  const recent = Array.isArray(a.history) ? a.history.slice(-4) : [];
  const history = [];
  let histTokens = 0;
  for (let i = recent.length - 1; i >= 0; i--) {
    const h = recent[i] || {};
    const q = String(h.q == null ? "" : h.q);
    const ans = String(h.a == null ? "" : h.a).slice(0, PBP_ASK_HIST_ANSWER_CAP);
    const cost = pbpAiEstimateTokens(q.length + ans.length + 8);
    if (history.length && histTokens + cost > histBudget) break;
    history.unshift({ q, a: ans });
    histTokens += cost;
  }
  const parts = [];
  if (title) parts.push("TITLE: " + title, "");
  parts.push(a.forum ? "THREAD:" : "ARTICLE:", context, "");
  if (history.length) {
    parts.push("PREVIOUS Q&A (context for follow-ups only):");
    for (const h of history) {
      parts.push("Q: " + String((h && h.q) || ""));
      parts.push("A: " + String((h && h.a) || ""));
    }
    parts.push("");
  }
  parts.push(reminder);
  parts.push("QUESTION: " + question);
  return { system, prompt: parts.join("\n") };
}

// ============================================================
// Ask send pipeline (Task 13), part 2: streaming send flow.
// Wires the Task 12 seams: _pbpAskOnSubmit -> _pbpAskSend and
// _pbpAskSetOpen -> _pbpAskUpdateMeta.
// ============================================================

// "provider" or "provider/override" - shown in the transparency line and
// persisted as the history record's model field.
function _pbpAskProviderLabel(s) {
  const provider = (s && s.aiProvider) || "gemini";
  const override = pbpAiResolveModelOverride(s);
  return override ? provider + "/" + override : provider;
}

// Transparency line (Task 12's _pbpAskSetOpen calls this seam on every
// open; the send path refreshes it again right before the request fires).
// Builds and caches the trimmed context on first need.
function _pbpAskUpdateMeta() {
  const st = _pbpAskState;
  const meta = document.getElementById("ask-meta");
  if (!st || !meta) return;
  // Context is built once from the ORIGINAL article and intentionally never
  // refreshes across translation/three-state changes -- the model stays
  // grounded on the original text so [Pn] citations resolve against original
  // paragraphs.
  if (!st.ctx) st.ctx = pbpAskBuildContext(pbpAiBlocks(), PBP_ASK_CTX_BUDGET);
  const _askQuestion = document.getElementById("ask-input");
  const _askQ = _askQuestion ? _askQuestion.value : "";
  const _askRounds = (st.rounds || []);
  const _askBuilt = st.ctx
    ? pbpAskBuildPrompt({
        context: st.ctx.text, history: _askRounds, question: _askQ,
        title: st.title, forum: st.forum
      })
    : { system: "", prompt: "" };
  const tokens = pbpAiEstimateTokens((_askBuilt.system + _askBuilt.prompt).length);
  let line = t("askWillSend", String(tokens), _pbpAskProviderLabel(st.s));
  if (st.ctx.sentBlocks < st.ctx.totalBlocks) {
    line += " " + t("askSentPartial", String(st.ctx.sentBlocks), String(st.ctx.totalBlocks));
  }
  // History-window disclosure (context-rot line of the ask campaign):
  // once the thread outgrows the 4-round prompt window, say so instead
  // of silently reinterpreting follow-ups against a truncated history.
  if (_askRounds.length > 4) line += " " + t("askHistWindowNote");
  meta.textContent = line;
}

// One-time Stop wiring (the panel markup belongs to Task 12; same
// _pbpWired expando pattern the history task uses for #ask-clear).
function _pbpAskWireStop() {
  const btn = document.getElementById("ask-stop");
  if (!btn || btn._pbpWired) return;
  btn._pbpWired = true;
  btn.addEventListener("click", () => {
    if (_pbpAskState && _pbpAskState.ctrl) _pbpAskState.ctrl.abort();
  });
}

// Append one Q/A round. Question is USER text -> textContent only. The
// .ask-q/.ask-a structure is a cross-task contract (the history restore
// task replicates it verbatim).
function _pbpAskAppendRound(question) {
  const thread = document.getElementById("ask-thread");
  if (!thread) return null;
  const empty = document.getElementById("ask-empty");
  if (empty) empty.remove();
  const chips = document.getElementById("ask-chips");
  if (chips) chips.hidden = true;
  const qEl = document.createElement("div");
  qEl.className = "ask-q";
  qEl.dir = "auto"; // D9-2: user question may be RTL, independent of UI language
  qEl.textContent = question;
  const aEl = document.createElement("div");
  aEl.className = "ask-a streaming";
  aEl.dataset.askQuestion = question;
  aEl.dir = "auto"; // D9-2: answer follows the question's language (system prompt rule)
  // #ask-thread is aria-live=polite; without aria-busy, every rAF-throttled
  // textContent replace during streaming re-announces the whole accumulated
  // answer (audit md-ask.js:140). Mirrors the Explain popover's aria-busy
  // pattern (_pbpExplainRun, .xp-body).
  aEl.setAttribute("aria-busy", "true");
  thread.appendChild(qEl);
  thread.appendChild(aEl);
  thread.scrollTop = thread.scrollHeight;
  return aEl;
}

// Error UI: human message (callAIStream rejects with handleAIError text)
// plus a retry button that re-runs the SAME question into the same .ask-a.
function _pbpAskErrorUi(aEl, error, question) {
  const err = document.createElement("p");
  err.className = "ask-err";
  err.textContent = (error && error.message) ? error.message : String(error || "");
  const retry = document.createElement("button");
  retry.type = "button";
  retry.className = "action-btn ask-retry";
  retry.innerHTML = PBP_ICONS.refresh; // static shared constant, never page content
  retry.append(t(error && error.code === "host_permission" ? "aiGrantRetry" : "askErrRetry"));
  retry.addEventListener("click", () => {
    // Guard BEFORE touching the DOM: _pbpAskRun silently no-ops while another
    // question is running (line ~478 `if (!st || st.running) return;`). Without
    // this check, clicking Retry on Q1's failed answer while Q2 streams wipes
    // Q1's error UI + adds .streaming shimmer, but the request never fires --
    // a permanent empty "streaming" bubble (audit md-ask.js:423).
    if (_pbpAskState && _pbpAskState.running) return;
    pbpAiRetryWithPermission(error, _pbpAskState && _pbpAskState.s, () => {
      if (_pbpAskState && _pbpAskState.running) return;
      if (aEl.contains(document.activeElement)) {
        aEl.tabIndex = -1;
        aEl.focus();
      }
      aEl.replaceChildren();
      aEl.classList.add("streaming");
      aEl.setAttribute("aria-busy", "true");
      return _pbpAskRun(question, aEl);
    }).catch(() => {});
  });
  aEl.appendChild(err);
  aEl.appendChild(retry);
}

// Core runner: stream into aEl, finalize, persist, count.
async function _pbpAskRun(question, aEl, opts) {
  const st = _pbpAskState;
  if (!st || st.running) return;
  opts = opts || {};
  st.rounds = st.rounds || []; // lazy: Task 12's state object predates this field
  st.running = true;
  st.ctrl = new AbortController();
  _pbpAskWireStop();
  const stopBtn = document.getElementById("ask-stop");
  const sendBtn = document.getElementById("ask-send");
  if (stopBtn) stopBtn.hidden = false;
  if (sendBtn) sendBtn.disabled = true;
  let raf = 0;
  let acc = "";
  const paint = () => { raf = 0; aEl.textContent = acc; };
  try {
    if (!st.ctx) st.ctx = pbpAskBuildContext(pbpAiBlocks(), PBP_ASK_CTX_BUDGET);
    // Regenerate must not show the model the very answer it is replacing:
    // replaceLast swaps st.rounds only AFTER success, so at build time the
    // old round is still the last element - and a model that sees its own
    // prior answer anchors on it and restates instead of re-answering.
    const promptHistory = (opts.replaceLast && st.rounds.length)
      ? st.rounds.slice(0, -1) : st.rounds;
    const built = pbpAskBuildPrompt({
      context: st.ctx.text, history: promptHistory, question,
      title: st.title, forum: st.forum
    });
    const full = await getOrCreateInflight("ask_" + st.url + "_" + question, () =>
      callAIStream(st.s, built.prompt, {
        maxTokens: 4096,
        model: pbpAiResolveModelOverride(st.s),
        system: built.system,
        signal: st.ctrl.signal
      }, (d, accText) => {
        // rAF throttle: deltas land as plain textContent at most once per
        // frame; markdown renders exactly once, at finalize.
        acc = accText;
        if (!raf) raf = requestAnimationFrame(paint);
      })
    );
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    aEl.classList.remove("streaming");
    aEl.removeAttribute("aria-busy");
    delete aEl.dataset.askStopped; // a re-run over a stopped round completed normally
    const parsed = _pbpAskFinalize(aEl, full, st.ctx && st.ctx.sent);
    const record = {
      q: question,
      a: full,
      cites: parsed.cites,
      ts: Date.now(),
      model: _pbpAskProviderLabel(st.s),
      // Compared against the live fingerprint at restore time to catch a
      // stale [Pn] index after an engine switch (audit #29).
      blocksHash: (typeof pbpAiBlocksFingerprint === "function") ? pbpAiBlocksFingerprint() : ""
    };
    if (opts.replaceLast && st.rounds.length) {
      st.rounds[st.rounds.length - 1] = { q: question, a: parsed.body };
    } else {
      st.rounds.push({ q: question, a: parsed.body });
    }
    // In-memory history must stay bounded too (D6-5): reuse the persisted
    // layer's trim (md-ai-core.js _pbpAskHistTrim, PBP_ASK_HIST_MAX=20)
    // instead of maintaining a second cap here.
    st.rounds = _pbpAskHistTrim(st.rounds);
    st.records = _pbpAskHistTrim((st.records || []).slice());
    if (opts.replaceLast && st.records.length && st.records[st.records.length - 1].q === question) {
      st.records[st.records.length - 1] = record;
    } else {
      st.records.push(record);
      st.records = _pbpAskHistTrim(st.records);
    }
    // Persisted append: st.running only serializes sends WITHIN this tab,
    // not across tabs, so a plain get+push+set here would race two preview
    // tabs open on the same URL (D2-2). pbpAskHistAppend runs the
    // read-modify-write in one IDB transaction instead, which IndexedDB
    // serializes across tabs - no lost update.
    if (opts.replaceLast && typeof pbpAskHistReplaceLast === "function") {
      await pbpAskHistReplaceLast(st.url, record, st.account);
    } else {
      await pbpAskHistAppend(st.url, record, st.account);
    }
    pbpAiBumpCounter("ask");
  } catch (e) {
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    aEl.classList.remove("streaming");
    aEl.removeAttribute("aria-busy");
    if (opts.restoreNodes && opts.restoreNodes.length) {
      aEl.replaceChildren(...opts.restoreNodes);
    } else if (e && e.name === "AbortError" && acc && aEl.isConnected) {
      // isConnected: Clear aborts in-flight streams AFTER detaching the
      // thread's children - finalizing the detached element would be
      // invisible busywork, and its _pbpAskDecorate -> _pbpAskEnsureClear
      // call would re-show the Clear button over the now-empty thread.
      // Stop is not an error: finalize the partial VISUALLY (markdown
      // render, citation chips, copy/regenerate buttons) instead of
      // leaving a dead bare-text orphan. Deliberately NOT pushed into
      // st.rounds/records and never persisted: Clear aborts in-flight
      // streams and relies on this branch never reviving the wiped
      // conversation (_pbpAskClearThread), and partial output is never
      // cached (same invariant as the skim layer). The flag routes a
      // later Regenerate to append-mode - this round is not in st.rounds,
      // so replaceLast would clobber the previous round instead.
      aEl.dataset.askStopped = "1";
      try { _pbpAskFinalize(aEl, acc, st.ctx && st.ctx.sent); } catch (_) { aEl.textContent = acc; }
    } else {
      aEl.textContent = acc; // keep whatever already streamed in
    }
    if (e && e.name === "AbortError") {
      const note = document.createElement("p");
      note.className = "ask-stopped";
      note.textContent = t("askStopped");
      aEl.appendChild(note);
    } else {
      _pbpAskErrorUi(aEl, e || new Error("Request failed"), question);
    }
  } finally {
    st.running = false;
    st.ctrl = null;
    if (stopBtn) stopBtn.hidden = true;
    if (sendBtn) sendBtn.disabled = false;
    // Refresh the transparency line NOW: st.rounds just changed, and the
    // 4-round window note (B2) must appear as soon as the 5th round
    // lands, not on the next open/send.
    _pbpAskUpdateMeta();
  }
}

// Submit seam target (Task 12's _pbpAskOnSubmit typeof-checks this name).
// Validation: non-empty question + gate; starter chips need nothing extra
// here (Task 12 already routes chip clicks through _pbpAskOnSubmit).
async function _pbpAskSend() {
  const st = _pbpAskState;
  if (!st || st.running) return;
  const ta = document.getElementById("ask-input");
  const question = ta ? ta.value.trim() : "";
  if (!question) { if (ta) ta.focus(); return; }
  if (!pbpAiAvailable(st.s)) return;
  _pbpAskUpdateMeta(); // refresh the transparency line BEFORE the request
  const aEl = _pbpAskAppendRound(question);
  if (!aEl) return;
  ta.value = "";
  await _pbpAskRun(question, aEl);
}

// ============================================================
// Citation pipeline (Task 14): parse -> render -> chips -> verify
// -> tooltip -> jump + flash. Replaces the Task 13 placeholder.
// ============================================================

// Pure tokenizer: split answer text into segments around [Pn] tokens, plus
// GROUPED forms the model sometimes emits when answering in a CJK language:
// [P3, P5], (P6, P17), full-width parens (\uFF08...\uFF09), lenticular
// brackets (\u3010...\u3011).
// -> [{kind:"text", text}, {kind:"cite", p, token}, ...]; "" -> [].
// Drives the chip pass below (splits each text node at token boundaries,
// i.e. the splitText semantics, but unit-testable without a DOM).
// Group grammar: one-or-more P<digits> items separated by ASCII comma/
// semicolon, full-width comma \uFF0C, ideographic comma \u3001, full-width
// semicolon \uFF1B, with optional ASCII/ideographic (\u3000) whitespace
// anywhere between items. Anything else inside the brackets (a word, "see",
// CJK prose) fails the whole group -> falls through to plain text, same as
// today. The strict single-token alternative is FIRST so plain [P7] keeps
// matching it with its original token text (untouched behavior).
function _pbpAskSplitCiteTokens(text) {
  const s = String(text == null ? "" : text);
  const ws = "[ \\t\\u3000]";
  const sepChar = "[,;\\uFF0C\\u3001\\uFF1B]";
  const sep = "(?:" + ws + "*" + sepChar + ws + "*)";
  const item = "P\\d+";
  const content = ws + "*" + item + "(?:" + sep + item + ")*" + ws + "*";
  const re = new RegExp(
    "\\[P(\\d+)\\]" +
    "|\\[(" + content + ")\\]" +
    "|\\((" + content + ")\\)" +
    "|\\uFF08(" + content + ")\\uFF09" +
    "|\\u3010(" + content + ")\\u3011",
    "g"
  );
  const segs = [];
  let last = 0;
  let m;
  while ((m = re.exec(s)) !== null) {
    if (m.index > last) segs.push({ kind: "text", text: s.slice(last, m.index) });
    if (m[1] !== undefined) {
      segs.push({ kind: "cite", p: Number(m[1]), token: m[0] });
    } else {
      const grouped = m[2] !== undefined ? m[2] : (m[3] !== undefined ? m[3] : (m[4] !== undefined ? m[4] : m[5]));
      const items = grouped.match(/P\d+/g) || [];
      for (const it of items) {
        const n = Number(it.slice(1));
        segs.push({ kind: "cite", p: n, token: "[P" + n + "]" });
      }
    }
    last = m.index + m[0].length;
  }
  if (last < s.length) segs.push({ kind: "text", text: s.slice(last) });
  return segs;
}

// Pure: drop [Pn] citation tokens (incl. grouped forms) from an answer
// body, keeping the prose. Used when seeding PREVIOUS Q&A from a STALE
// record (blocksHash mismatch, see _pbpAskHistRestore): the old paragraph
// numbers index a DIFFERENT block list now, so feeding them through would
// anchor follow-up citations to unrelated paragraphs.
function _pbpAskStripCiteTokens(text) {
  const s = String(text == null ? "" : text);
  // Shield fenced blocks and inline code first: a literal `[P1]` inside
  // code is answer CONTENT, not a citation - the chip pass skips pre/code
  // for the same reason, and stripping must match that semantic. \u0000
  // never occurs in model text (and never matches the cite grammar).
  const slots = [];
  const shielded = s.replace(/```[\s\S]*?```|`[^`\n]*`/g, (m) => {
    slots.push(m);
    return "\u0000" + (slots.length - 1) + "\u0000";
  });
  const stripped = _pbpAskSplitCiteTokens(shielded)
    .filter((seg) => seg.kind === "text")
    .map((seg) => seg.text)
    .join("");
  return stripped.replace(/\u0000(\d+)\u0000/g, (m, i) => slots[Number(i)]);
}

// Chip pass: walk el's text nodes, replace every in-range [Pn] token with a
// superscript chip button; out-of-range tokens stay literal text (spec 5.2:
// failed verification must never render as a link). Verification (fuzzy
// quote locate) runs once per unique paragraph; chips are numbered
// sequentially per answer (data-seq) in reading order.
function _pbpAskChipPass(el, cites, sent) {
  const maxP = pbpAiBlocks().length;
  // Set of paragraph numbers actually SENT to the model (pbpAskBuildContext
  // .sent). A cite of a sampled-out paragraph is post-rationalization by
  // construction - the model never saw that text - so it must not earn the
  // solid "verified" state even when its guessed quote happens to fuzzy-
  // match. null/absent (restored history: the original sample set is
  // unknowable) skips the check - old behavior.
  const sentSet = (sent && typeof sent.has === "function") ? sent : null;
  // First quote wins when the model emits several CITES lines for one Pn.
  const quoteByP = new Map();
  for (const c of (Array.isArray(cites) ? cites : [])) {
    if (!quoteByP.has(c.p)) quoteByP.set(c.p, c.quote);
  }
  // pbpAiFuzzyFind already maps normalized hits back to RAW textContent
  // offsets (core.md Task 5: _pbpAiNormWithMap builds the index map and
  // mapBack applies it before returning), so {start,end} feed straight
  // into _pbpAskRangeFromOffsets at click time.
  const verifyByP = new Map();
  const verify = (p) => {
    if (!verifyByP.has(p)) {
      const quote = quoteByP.get(p);
      // pbpAiTextOfKatex, not pbpAiTextOf: the model quoted against the
      // KaTeX-aware context lineOf() sends it (D10-1), so verification must
      // fuzzy-match against that same clean-text representation.
      verifyByP.set(p, quote ? pbpAiFuzzyFind(quote, pbpAiTextOfKatex(p)) : null);
    }
    return verifyByP.get(p);
  };
  // Collect first, mutate after: replacing nodes while the TreeWalker is
  // live skips siblings.
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let node;
  while ((node = walker.nextNode())) {
    // Superset gate: cheap pre-filter before the real tokenizer runs. Must
    // admit every form _pbpAskSplitCiteTokens can parse, including GROUPED
    // citations like "(P3, P5)" that have no literal "[Pn]" substring -- a
    // strict "\[P\d+\]" gate here starves the tokenizer of group-only text
    // nodes (product bug). A false-admit just runs the tokenizer and emits
    // pure text segs, which is harmless.
    if (!/P\d+/.test(node.nodeValue)) continue;
    // [Pn] inside code/pre is answer content (e.g. a code sample), not a cite.
    if (node.parentElement && node.parentElement.closest("pre, code")) continue;
    nodes.push(node);
  }
  let seq = 0;
  for (const textNode of nodes) {
    const segs = _pbpAskSplitCiteTokens(textNode.nodeValue);
    const parent = textNode.parentNode;
    for (const seg of segs) {
      if (seg.kind === "text") {
        parent.insertBefore(document.createTextNode(seg.text), textNode);
        continue;
      }
      if (!(seg.p >= 1 && seg.p <= maxP)) {
        parent.insertBefore(document.createTextNode(seg.token), textNode);
        continue;
      }
      seq += 1;
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "ask-chip";
      chip.dataset.p = String(seg.p);
      chip.dataset.seq = String(seq);
      chip.textContent = String(seq);
      chip.setAttribute("aria-label", "P" + seg.p);
      const quote = quoteByP.get(seg.p);
      if (quote) chip.dataset.quote = quote;
      const hit = (sentSet && !sentSet.has(seg.p)) ? null : verify(seg.p);
      if (hit) {
        chip.dataset.qs = String(hit.start);
        chip.dataset.qe = String(hit.end);
        chip.classList.add("verified");
        // Verified vs unverified is carried by border line style, not just
        // the ::after dot: dashed = unverified (base .ask-chip rule), solid
        // = verified (.ask-chip.verified rule, md-preview.css) -- a non-color
        // channel; the aria-label below still names the state for SR users.
        chip.setAttribute("aria-label", "P" + seg.p + " · " + t("askChipVerified"));
      }
      chip.addEventListener("click", () => _pbpAskJump(chip));
      chip.addEventListener("mouseenter", () => _pbpAskTipShow(chip));
      chip.addEventListener("mouseleave", _pbpAskTipHide);
      chip.addEventListener("focus", () => _pbpAskTipShow(chip));
      chip.addEventListener("blur", _pbpAskTipHide);
      parent.insertBefore(chip, textNode);
    }
    parent.removeChild(textNode);
  }
}

// Map raw textContent offsets [start, end) to a DOM Range by accumulating
// text-node lengths under blockEl (TreeWalker offset accumulation).
function _pbpAskRangeFromOffsets(blockEl, start, end) {
  if (!blockEl || !Number.isFinite(start) || !Number.isFinite(end)
    || start < 0 || end <= start) return null;
  const walker = document.createTreeWalker(blockEl, NodeFilter.SHOW_TEXT);
  let pos = 0;
  let startNode = null;
  let startOffset = 0;
  let node;
  while ((node = walker.nextNode())) {
    const len = node.nodeValue.length;
    if (!startNode && start < pos + len) {
      startNode = node;
      startOffset = start - pos;
    }
    if (end <= pos + len) {
      if (!startNode) return null;
      const range = document.createRange();
      range.setStart(startNode, startOffset);
      range.setEnd(node, end - pos);
      return range;
    }
    pos += len;
  }
  return null; // offsets beyond the block's current text
}

let _pbpAskFlashTimer = null;
let _pbpAskFlashEl = null;

// Flash the jump target. Primary: CSS Custom Highlight API (zero DOM
// mutation). Fallback (no CSS.highlights): keyframed background class on
// the whole target element. Removal is clearTimeout-guarded so rapid
// consecutive clicks restart the 1600ms window instead of racing it.
function _pbpAskFlash(range, targetEl) {
  clearTimeout(_pbpAskFlashTimer);
  if (typeof Highlight === "function" && typeof CSS !== "undefined" && "highlights" in CSS) {
    // R4 (md-reader.js) explicit priority contract: search=1, current
    // match=2, this jump flash=3 -- replaces the previous implicit
    // CSS.highlights Map-insertion-order tie-break.
    const flashHl = new Highlight(range);
    flashHl.priority = 3;
    CSS.highlights.set("pbp-flash", flashHl);
    _pbpAskFlashTimer = setTimeout(() => { CSS.highlights.delete("pbp-flash"); }, 1600);
  } else {
    if (_pbpAskFlashEl) _pbpAskFlashEl.classList.remove("pb-flash-fallback");
    _pbpAskFlashEl = targetEl;
    void targetEl.offsetWidth; // restart the CSS animation
    targetEl.classList.add("pb-flash-fallback");
    _pbpAskFlashTimer = setTimeout(() => { targetEl.classList.remove("pb-flash-fallback"); _pbpAskFlashEl = null; }, 1600);
  }
}

// Chip click: scroll to the cited block (or its translation in
// translated-only view) and flash the verified quote span / whole block.
function _pbpAskJump(chip) {
  const p = Number(chip.dataset.p);
  const orig = pbpAiBlockEl(p);
  if (!orig) return;
  _pbpAskTipHide();
  // Three-view interplay: in translated-only view a filled original is
  // hidden (body.tr-only + [data-pb-tr-done]) -> jump to its .pb-tr
  // nextElementSibling instead. Bilingual view keeps originals visible,
  // so the precise quote span still applies there. Delegates to the shared
  // trOnlyScrollTarget() (md-preview.js) instead of reimplementing the
  // redirect inline -- that shared helper also honors .pb-show-orig (a
  // peeked-open original stays the jump target instead of its translated
  // sibling), a check this inline version previously omitted (drive-by fix,
  // skim-layer spec 1.4). Behavior delta: a tr-only block whose original
  // was peeked back open (.pb-show-orig) now jumps to the visible ORIGINAL
  // instead of its (hidden) translated sibling -- the only case that changes.
  let target = (typeof trOnlyScrollTarget === "function") ? trOnlyScrollTarget(orig) : orig;
  pbpFocusArticleTarget(target);
  pbpScrollIntoView(target, { block: "center", behavior: "smooth" });
  let range = null;
  // Verified offsets index the ORIGINAL block's textContent (translation
  // inserts siblings, never mutates the original's text nodes), so they
  // only apply when the original itself is the visible target. Math
  // blocks are excluded: their offsets were computed against the CLEAN
  // "$tex$" text (pbpAiTextOfKatex, what the model quoted), but KaTeX has
  // rewritten the live DOM into glyph+MathML+annotation duplicates - the
  // two coordinate systems diverge, and a mid-block offset would flash
  // the wrong span. Whole-block flash is the honest fallback there.
  if (target === orig && chip.classList.contains("verified") && !orig.querySelector(".katex")) {
    range = _pbpAskRangeFromOffsets(orig, Number(chip.dataset.qs), Number(chip.dataset.qe));
  }
  if (!range) {
    range = document.createRange();
    range.selectNode(target);
  }
  _pbpAskFlash(range, target);
}

// ---- Single shared tooltip for all chips (lazy-created) ----
let _pbpAskTipEl = null;

function _pbpAskTipShow(chip) {
  if (!_pbpAskTipEl) {
    _pbpAskTipEl = document.createElement("div");
    _pbpAskTipEl.id = "ask-tip";
    _pbpAskTipEl.setAttribute("role", "tooltip");
    document.body.appendChild(_pbpAskTipEl);
    // Fixed positioning drifts on scroll; just hide (re-hover re-places it).
    window.addEventListener("scroll", _pbpAskTipHide, { capture: true, passive: true });
  }
  const tip = _pbpAskTipEl;
  tip.replaceChildren();
  const p = Number(chip.dataset.p);
  if (chip.dataset.quote) {
    const q = document.createElement("div");
    q.className = "ask-tip-quote";
    q.textContent = '"' + chip.dataset.quote + '"';
    tip.appendChild(q);
  }
  const blockText = pbpAiTextOfKatex(p).replace(/\s+/g, " ").trim();
  const b = document.createElement("div");
  b.className = "ask-tip-block";
  b.textContent = "P" + p + " · " + blockText.slice(0, 80) + (blockText.length > 80 ? "…" : "");
  tip.appendChild(b);
  if (chip.classList.contains("verified")) {
    const v = document.createElement("div");
    v.className = "ask-tip-status";
    v.textContent = t("askChipVerified");
    tip.appendChild(v);
  }
  // Measure, then place above the chip; flip below when viewport space
  // above is too small. Clamp horizontally to the viewport.
  tip.style.visibility = "hidden";
  tip.style.display = "block";
  const cr = chip.getBoundingClientRect();
  const tr = tip.getBoundingClientRect();
  let top = cr.top - tr.height - 6;
  if (top < 8) top = cr.bottom + 6;
  let left = cr.left + cr.width / 2 - tr.width / 2;
  left = Math.max(8, Math.min(left, window.innerWidth - tr.width - 8));
  tip.style.top = top + "px";
  tip.style.left = left + "px";
  tip.style.visibility = "visible";
}

function _pbpAskTipHide() {
  if (_pbpAskTipEl) _pbpAskTipEl.style.display = "none";
}

// Stream-end finalizer, called by the Task 13 send path and the Task 15
// history restore. el = the .ask-a element that held streamed plain text.
// Returns {body, cites} so the caller can persist them with the record.
function _pbpAskFinalize(el, fullText, sent) {
  const parsed = pbpAiParseCites(String(fullText == null ? "" : fullText));
  // renderMarkdown (md-convert.js) is the SINGLE sanitize point (marked +
  // DOMPurify); assigning its return via innerHTML is the established
  // md-preview.js pattern (renderedView.innerHTML = renderMarkdown(...),
  // md-preview.js ~line 330-333). NEVER assign raw model text to innerHTML.
  el.dir = "auto"; // D9-2: also covers the history-restore aEl, which skips _pbpAskAppendRound
  el.innerHTML = renderMarkdown(parsed.body);
  _pbpAskChipPass(el, parsed.cites, sent);
  // Task 15 hook (copy button + history chrome). typeof-guarded so this
  // Task 14 commit stands alone before Task 15 lands.
  if (typeof _pbpAskDecorate === "function") _pbpAskDecorate(el, parsed);
  return parsed;
}

// ============================================================
// Ask history: restore + clear + per-answer copy (Task 15)
// ============================================================
// DOM contract (Task 12/13): panel #ask-panel, conversation container
// #ask-thread, question/answer elements .ask-q/.ask-a. Records persisted
// by the Task 13 send path as {q, a: full raw model text, cites, ts, model}
// via pbpAskHistAppend (atomic append + cap 20, md-ai-core; D2-2).

// Static inline SVG (clipboard, same path set as the rail Copy buttons in
// md-preview.html). Constant string, never model text.
// Alias of the shared copy icon (was a hand-copied Feather twin of it).
const PBP_ASK_COPY_SVG = typeof PBP_ICONS !== "undefined" ? PBP_ICONS.copy : "";

// Pure: compose the copied markdown = answer body + footnote block from
// the parsed cites. Inline [Pn] tokens become [^k] references matching
// the footnote definitions (they used to stay literal, leaving every
// definition an orphan no renderer links); quotes stay verbatim. Cites
// are deduped by paragraph (first quote wins, same rule as the chip
// pass) so each definition is referenced; [Pn] tokens without a CITES
// line keep their literal form (no definition to point at). `prefix`
// namespaces the labels ("2-" -> [^2-1]) so the multi-round thread
// export does not collide identical [^1] definitions across answers.
function _pbpAskBuildCopyText(body, cites, prefix) {
  const b = String(body == null ? "" : body).trim();
  const list = Array.isArray(cites) ? cites : [];
  if (!list.length) return b;
  const pre = String(prefix == null ? "" : prefix);
  const idxByP = new Map();
  const uniq = [];
  for (const c of list) {
    if (!idxByP.has(c.p)) {
      idxByP.set(c.p, uniq.length + 1);
      uniq.push(c);
    }
  }
  const label = (k) => "[^" + pre + k + "]";
  const linked = _pbpAskSplitCiteTokens(b)
    .map((seg) => {
      if (seg.kind !== "cite") return seg.text;
      return idxByP.has(seg.p) ? label(idxByP.get(seg.p)) : seg.token;
    })
    .join("");
  const foot = uniq
    .map((c, i) => label(i + 1) + ': "' + c.quote + '" — P' + c.p)
    .join("\n");
  return linked + "\n\n" + foot;
}

function _pbpAskBuildThreadExport(rounds, page) {
  const list = Array.isArray(rounds) ? rounds : [];
  const meta = page || {};
  const parts = [];
  const title = String(meta.title || "").trim();
  const url = String(meta.url || "").trim();
  if (title) parts.push("# " + title);
  if (url) parts.push(url);
  list.forEach((r, i) => {
    const parsed = pbpAiParseCites(String((r && r.a) || ""));
    parts.push([
      "## Q" + (i + 1),
      "**Q:** " + String((r && r.q) || "").trim(),
      "**A:**",
      // Per-round label prefix: without it, every answer's footnotes
      // restart at [^1] and collide inside the single exported document.
      _pbpAskBuildCopyText(parsed.body, parsed.cites, (i + 1) + "-")
    ].join("\n\n"));
  });
  return parts.join("\n\n").trim();
}

async function _pbpAskCopyThread() {
  const st = _pbpAskState;
  const btn = document.getElementById("ask-export");
  if (!st || !btn) return;
  const records = (st.records && st.records.length) ? st.records : (st.rounds || []);
  const text = _pbpAskBuildThreadExport(records, { title: st.title, url: st.url });
  if (!text) return;
  const origTitle = btn.title;
  const origAria = btn.getAttribute("aria-label") || "";
  const flash = (msg) => {
    btn.title = msg;
    btn.setAttribute("aria-label", msg);
    btn.classList.add("copied");
    clearTimeout(btn._askExportTimer);
    btn._askExportTimer = setTimeout(() => {
      btn.title = origTitle;
      if (origAria) btn.setAttribute("aria-label", origAria); else btn.removeAttribute("aria-label");
      btn.classList.remove("copied");
    }, 1500);
  };
  try {
    await navigator.clipboard.writeText(text);
    flash(t("askCopied"));
  } catch (_) {
    flash(t("mdPreviewFailed"));
  }
}

function _pbpAskHistThread() {
  return document.getElementById("ask-thread");
}

// Hook called by _pbpAskFinalize (Task 14) for EVERY finalized answer --
// live-streamed and restored alike. Adds the per-answer copy button and
// makes sure the clear control exists once the thread has content.
function _pbpAskDecorate(el, parsed) {
  _pbpAskEnsureClear();
  if (!el.querySelector(".ask-copy-btn")) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "action-btn ask-copy-btn";
    btn.innerHTML = PBP_ASK_COPY_SVG; // static inline SVG constant above
    const label = document.createElement("span");
    label.className = "btn-label";
    label.textContent = t("askCopyAnswer");
    btn.appendChild(label);
    const text = _pbpAskBuildCopyText(parsed.body, parsed.cites);
    btn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(text);
        flashButtonLabel(btn, t("askCopied"));
      } catch (_) {
        flashButtonLabel(btn, t("mdPreviewFailed"));
      }
    });
    el.appendChild(btn);
  }
  if (el.dataset.askQuestion && !el.querySelector(".ask-regenerate")) {
    const regen = document.createElement("button");
    regen.type = "button";
    regen.className = "action-btn ask-regenerate";
    regen.innerHTML = PBP_ASK_REGEN_SVG;
    const label = document.createElement("span");
    label.className = "btn-label";
    label.textContent = t("askErrRetry");
    regen.appendChild(label);
    regen.addEventListener("click", () => _pbpAskRegenerate(el));
    el.appendChild(regen);
  }
  _pbpAskSyncRegenerate();
}

function _pbpAskSyncRegenerate() {
  const btns = Array.from(document.querySelectorAll("#ask-thread .ask-regenerate"));
  btns.forEach((btn, i) => {
    const latest = i === btns.length - 1;
    btn.hidden = !latest;
    btn.disabled = !latest;
  });
}

function _pbpAskRegenerate(el) {
  const st = _pbpAskState;
  if (!st || st.running || !el || !el.dataset.askQuestion) return;
  const oldNodes = Array.from(el.childNodes);
  if (el.contains(document.activeElement)) {
    el.tabIndex = -1;
    el.focus();
  }
  el.replaceChildren();
  el.classList.add("streaming");
  el.setAttribute("aria-busy", "true");
  // A stopped partial never entered st.rounds/records (see the abort
  // branch in _pbpAskRun), so its regenerate must APPEND, not replace -
  // replaceLast would overwrite the previous, unrelated round.
  _pbpAskRun(el.dataset.askQuestion, el, { replaceLast: !el.dataset.askStopped, restoreNodes: oldNodes }).catch(() => {});
}

// ---- Clear: inline two-button confirm strip (never window.confirm) ----
function _pbpAskEnsureClear() {
  let btn = document.getElementById("ask-clear");
  const thread = _pbpAskHistThread();
  if (!btn) {
    if (!thread || !thread.parentNode) return;
    btn = document.createElement("button");
    btn.type = "button";
    btn.id = "ask-clear";
    btn.className = "ask-clear-btn";
    btn.textContent = t("askClear");
    thread.parentNode.insertBefore(btn, thread);
  }
  btn.hidden = false;
  if (!btn._pbpWired) {
    btn._pbpWired = true;
    btn.addEventListener("click", _pbpAskShowClearConfirm);
  }
}

function _pbpAskShowClearConfirm() {
  const thread = _pbpAskHistThread();
  if (!thread || document.getElementById("ask-clear-confirm")) return;
  // Markup produced here:
  // <div id="ask-clear-confirm" class="ask-clear-confirm" role="alertdialog"
  //      aria-label="{askClearConfirm}">
  //   <span class="ask-clear-msg">{askClearConfirm}</span>
  //   <button type="button" class="action-btn ask-clear-yes">{askClearYes}</button>
  //   <button type="button" class="action-btn ask-clear-no">{askClearNo}</button>
  // </div>
  const strip = document.createElement("div");
  strip.id = "ask-clear-confirm";
  strip.className = "ask-clear-confirm";
  strip.setAttribute("role", "alertdialog");
  strip.setAttribute("aria-label", t("askClearConfirm"));
  const msg = document.createElement("span");
  msg.className = "ask-clear-msg";
  msg.textContent = t("askClearConfirm");
  const yes = document.createElement("button");
  yes.type = "button";
  yes.className = "action-btn ask-clear-yes";
  yes.textContent = t("askClearYes");
  const no = document.createElement("button");
  no.type = "button";
  no.className = "action-btn ask-clear-no";
  no.textContent = t("askClearNo");
  strip.appendChild(msg);
  strip.appendChild(yes);
  strip.appendChild(no);
  thread.parentNode.insertBefore(strip, thread);
  const clearBtn = document.getElementById("ask-clear");
  const input = document.getElementById("ask-input");
  let cleared = false;
  yes.addEventListener("click", async () => {
    if (cleared) return;
    cleared = true;
    if (input) input.focus();
    strip.remove();
    if (clearBtn) clearBtn.hidden = true;
    // Route through Task 12's clear path: it restores the empty-state hint
    // + starter chips AND erases ask_<url> — keeping ONE owner for the
    // post-clear panel state. Bare wipe only if the shell is absent.
    if (typeof _pbpAskClearThread === "function") {
      try { await _pbpAskClearThread(); } catch (_) {}
    } else {
      thread.replaceChildren();
      try { await pbpAskHistSet(_pbpAskHistUrl, [], _pbpAskHistAccount); } catch (_) {}
    }
  });
  no.addEventListener("click", () => {
    if (clearBtn) clearBtn.focus();
    else if (input) input.focus();
    strip.remove();
  });
  no.focus(); // safe default: initial focus away from the destructive action
}

// ---- Restore persisted rounds when the (lazily mounted) thread appears ----
let _pbpAskHistUrl = "";
let _pbpAskHistAccount = "";
let _pbpAskHistRestored = false;

async function _pbpAskHistRestore() {
  const thread = _pbpAskHistThread();
  if (_pbpAskHistRestored || !thread || !_pbpAskHistUrl) return;
  _pbpAskHistRestored = true;
  // Pre-owner-scope hygiene: legacy ownerless "ask_<rawhash>" entries can
  // never be read again (fail-closed, no adoption) — delete on sight so the
  // leaked-to-nobody data actually disappears instead of waiting on LRU.
  if (typeof _pbpAskHistLegacyKey === "function") {
    pbpAiCacheDelete(_pbpAskHistLegacyKey(_pbpAskHistUrl)).catch(() => {});
  }
  let hist = [];
  try { hist = await pbpAskHistGet(_pbpAskHistUrl, _pbpAskHistAccount); } catch (_) {}
  // Re-check after the await: a Clear that landed while the IDB read was
  // in flight dropped the flag synchronously - this stale result must not
  // repopulate st.records (export would copy erased history) or touch the
  // freshly-reset empty hint / starter chips.
  if (!_pbpAskHistRestored) return;
  if (!hist.length) return;
  if (_pbpAskState) _pbpAskState.records = hist.slice();
  // Restored rounds replace the empty-state hint; the starter chips
  // collapse (thread is no longer empty) — mirrors the live send path.
  const empty = document.getElementById("ask-empty");
  if (empty) empty.remove();
  const chips = document.getElementById("ask-chips");
  if (chips) chips.hidden = true;
  const frag = document.createDocumentFragment();
  const note = document.createElement("div");
  note.className = "ask-restored";
  note.textContent = t("askRestoredNote", String(hist.length));
  frag.appendChild(note);
  // Block-fingerprint check (audit #29): a persisted answer's [Pn] chips
  // index into the CURRENT block list (pbpAiBlockEl(p) is a plain array
  // lookup, no content check) — switching extraction engine, or a page
  // re-render, re-indexes with different boundaries/order, so old chips can
  // silently jump to unrelated content. rec.blocksHash absent (history saved
  // before this fix) skips the check rather than false-flagging.
  const curFp = (typeof pbpAiBlocksFingerprint === "function") ? pbpAiBlocksFingerprint() : "";
  // Perf (audit #27): finalize (renderMarkdown + fuzzy chip verification,
  // md-ai-core.js's bounded Levenshtein scan on exact-miss) is spread across
  // rAF frames instead of one synchronous pass over up to 20 records, so a
  // long history doesn't stall the panel's first open. The whole fragment
  // still lands in the DOM with a single insertBefore once every record is
  // built, preserving the "live round races in" ordering guarantee below.
  const raf = (typeof requestAnimationFrame === "function") ? requestAnimationFrame : (fn) => setTimeout(fn, 0);
  const PBP_ASK_HIST_CHUNK = 2;
  const restoredRounds = [];
  let hi = 0;
  await new Promise((resolve) => {
    const step = () => {
      // Aborted mid-flight: _pbpAskClearThread (md-ask.js:267) flips
      // _pbpAskHistRestored back to false when the user hits Clear while
      // this chunked restore is still running. restore() is single-shot per
      // page (guarded by _pbpAskState.panel in _pbpAskBuildPanel, which
      // calls it exactly once), so the flag only ever goes true->false here
      // - never back to true mid-loop - making it safe to re-check directly
      // (no ABA risk that would call for a generation token instead). Stop
      // seeding st.rounds from now-erased history and never insert frag.
      if (!_pbpAskHistRestored) { resolve(); return; }
      const end = Math.min(hi + PBP_ASK_HIST_CHUNK, hist.length);
      for (; hi < end; hi++) {
        const rec = hist[hi];
        if (!rec || typeof rec.a !== "string") continue;
        const qEl = document.createElement("div");
        qEl.className = "ask-q";
        qEl.dir = "auto"; // D9-2: mirror the live _pbpAskAppendRound path (structure is replicated verbatim, see comment above)
        qEl.textContent = String(rec.q || "");
        const aEl = document.createElement("div");
        aEl.className = "ask-a";
        aEl.dataset.askQuestion = String(rec.q || "");
        frag.appendChild(qEl);
        frag.appendChild(aEl);
        // SAME pipeline as live answers: pbpAiParseCites -> renderMarkdown
        // (single sanitize point) -> chip pass -> verification runs AGAIN
        // against the current block index -> decorate (copy button).
        const parsed = _pbpAskFinalize(aEl, rec.a);
        const stale = !!(rec.blocksHash && curFp && rec.blocksHash !== curFp);
        if (stale) {
          aEl.querySelectorAll(".ask-chip").forEach((chip) => {
            chip.classList.add("stale");
            chip.disabled = true; // native: also drops it from the tab order + blocks click
          });
        }
        // Collect the restored Q&A for st.rounds too, not just the DOM: it
        // is what pbpAskBuildPrompt/_pbpAskUpdateMeta read (_pbpAskRun), so
        // a follow-up question after a page reload still carries PREVIOUS
        // Q&A context - same {q, a: <parsed body>} shape _pbpAskRun pushes
        // for a live answer (md-ask.js:466). A stale record's body enters
        // with its [Pn] tokens stripped - the UI already disabled those
        // chips as pointing nowhere, so the prompt must not re-teach the
        // model the same dead indexes. NOT pushed straight into st.rounds
        // here: a live round that races in while this chunked loop runs
        // would land BEFORE later history chunks, and slice(-4) would then
        // favor old rounds over the newest answer - the single concat
        // below the loop prepends history atomically instead (mirror of
        // the DOM insertBefore).
        restoredRounds.push({
          q: String(rec.q || ""),
          a: stale ? _pbpAskStripCiteTokens(parsed.body) : parsed.body
        });
      }
      if (hi < hist.length) raf(step); else resolve();
    };
    raf(step);
  });
  // Re-check right before inserting: a clear that lands after the loop's
  // last chunk (between its guard check and this line) must still block
  // the insert, or cleared history would silently reappear in the DOM.
  if (!_pbpAskHistRestored) return;
  // Prepend: if a live round raced in before the async build finished,
  // restored history still reads in chronological order above it - and
  // st.rounds gets the SAME ordering (history first, live rounds after),
  // so slice(-4) keeps favoring the newest answers.
  if (_pbpAskState) {
    _pbpAskState.rounds = _pbpAskHistTrim(restoredRounds.concat(_pbpAskState.rounds || []));
  }
  thread.insertBefore(frag, thread.firstChild);
  _pbpAskSyncRegenerate();
}

// Just remember the URL for _pbpAskHistRestore. Restore itself now fires
// from _pbpAskBuildPanel right after #ask-thread mounts (audit #28) — no
// need to watch document.body for the panel's lazy first open, which used
// to leave a MutationObserver running for the rest of the session on any
// page where AI is configured but the user never opens the panel.
document.addEventListener("pbp:rendered", (e) => {
  _pbpAskHistUrl = (e.detail && e.detail.url) || "";
  _pbpAskHistAccount = String((e.detail && e.detail.account) || "");
}, { once: true });

// ============================================================
// Explain-selection (spec 5.3): hotkey + popover. The "icon" trigger's click
// entry is a button fused into the highlight selection bar (md-highlight.js,
// _pbpHlEnsureBar) rather than a standalone pill -- this file used to own
// #explain-pill; see PBP_EXPLAIN_PILL_SVG below, now consumed cross-file.
// Trigger ladder lives in settings key selectionTrigger:
//   "icon" (default) -> explain/dictionary buttons in the highlight bar + e/d
//   "hotkey"         -> no bar buttons, e/d only
//   "off"            -> nothing registers at all
// ============================================================

// Minimum meaningful selection: >= 2 chars after trimming (spec 5.3) --
// EXCEPT a single Han/Kana character, which is a legitimate dictionary
// word (CC-CEDICT alone has thousands of one-character entries). A single
// Latin/Cyrillic letter stays rejected as accidental-selection noise.
function pbpExplainSelectionValid(text) {
  if (typeof text !== "string") return false;
  const t = text.trim();
  if (t.length >= 2) return true;
  return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(t);
}

// ---- Explain: module state ----
let _pbpExplainPage = { url: "", title: "" };
let _pbpExplainSettings = null;
let _pbpExplainTrigger = "icon"; // live value; the in-popover gear updates it
let _pbpExplainAiOk = false; // live AI-availability snapshot; dict action works without it

// Persist through the shared atomic settings writer. The in-memory trigger has
// already taken effect, so a storage failure remains non-blocking here.
async function _pbpExplainPersistTrigger(value) {
  try {
    const result = await persistSettings({ selectionTrigger: value });
    if (!result.ok) throw result.error || new Error("settings write failed");
  } catch (_) { /* quota/throttle: in-memory switch already applied */ }
}

// Static inline SVG (Feather help-circle). Constant string, never model text.
// Was #explain-pill's icon; now consumed by the highlight selection bar's
// explain button instead (md-highlight.js, _pbpHlEnsureBar) -- keep this the
// single source of the explain glyph.
const PBP_EXPLAIN_PILL_SVG = typeof PBP_ICONS !== "undefined" ? PBP_ICONS.help : "";

// Current selection if (and only if) it is explainable: non-collapsed, both
// endpoints inside #rendered-view, and pbpExplainSelectionValid (>= 2 chars,
// or a single Han/Kana character). Returns { range, text } | null.
function _pbpExplainGetSelection() {
  const view = document.getElementById("rendered-view");
  if (!view) return null;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  if (!view.contains(range.startContainer) || !view.contains(range.endContainer)) return null;
  const text = sel.toString();
  if (!pbpExplainSelectionValid(text)) return null;
  return { range, text: text.trim() };
}

// Entry point for the highlight bar actions and the e/d hotkeys. Captures the
// selection NOW (the popover's outside dismissal may clear it later) and
// hands off to the popover (Task 17). The typeof
// guard keeps this commit shippable before the popover lands: invoke is then
// a silent no-op. Optional initialAction (e.g. "dict") is forwarded so a
// caller like the highlight bar's dictionary button can jump straight to
// that tab instead of defaulting to explain.
function pbpExplainInvoke(initialAction = "explain") {
  const cap = _pbpExplainGetSelection();
  if (!cap) return;
  if (cap.range) cap.rect = cap.range.getBoundingClientRect();
  // H4 2.2: clone the Range into an independent snapshot. Popover dismissal
  // (or any later DOM interaction) can collapse
  // window.getSelection() -- cloneRange() keeps pointing at the same
  // start/end nodes/offsets but lives on its own, so "Save as note" can still
  // dereference cap.range long after the live selection is gone.
  cap.range = cap.range.cloneRange();
  if (typeof _pbpExplainOpenPop === "function") _pbpExplainOpenPop(cap, initialAction);
}

function _pbpExplainOnShortcut(e) {
  const key = String(e.key || "").toLowerCase();
  if (key !== "e" && key !== "d") return;
  // The settings gear changes this live after the listener was registered.
  // Initial off still returns before registration in pbpExplainInit below.
  if (_pbpExplainTrigger === "off") return;
  const ae = document.activeElement;
  if (!pbpTrSingleKeyAllowed(e, ae && ae.tagName, !!(ae && ae.isContentEditable),
    document.body.classList.contains("raw-active"))) return;
  if (!_pbpExplainGetSelection()) return;
  e.preventDefault();
  pbpExplainInvoke(key === "d" ? "dict" : "explain");
}

function pbpExplainInit(detail) {
  _pbpExplainPage = { url: (detail && detail.url) || "", title: (detail && detail.title) || "" };
  pbpAiGetSettings().then((s) => {
    // dict P1: the surface exists for everyone; only the trigger ladder gates
    // it. AI-less runs of explain/translate render their own not-configured
    // error; dict works fully without AI.
    _pbpExplainSettings = s;
    _pbpExplainAiOk = pbpAiAvailable(s);
    _pbpExplainTrigger = s.selectionTrigger || "icon";
    if (_pbpExplainTrigger === "off") return; // "off": zero listeners, zero DOM

    // Refresh the explain-translate target language live when the user
    // changes it in options (mirrors md-translate.js's pbpTrInit listener,
    // commit 90ad094). _pbpExplainRun (below) reads
    // _pbpExplainSettings.translateTargetLang fresh on every run via
    // pbpTrResolveTargetLang, so patching the field here is enough; an
    // in-flight stream already captured its language and finishes
    // unaffected -- only the NEXT translate run picks up the new target.
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if ((area !== "sync" && area !== "local") || !changes.translateTargetLang) return;
        _pbpExplainSettings.translateTargetLang = changes.translateTargetLang.newValue;
      });
    }

    // Hotkeys e/d work in both "icon" and "hotkey" modes. They share the
    // rendered-reader bare-key gate with t/v/h, then reuse the same captured
    // selection and popover entry point as the highlight bar buttons.
    document.addEventListener("keydown", _pbpExplainOnShortcut);
  }).catch(() => {});
}

document.addEventListener("pbp:rendered", (e) => pbpExplainInit((e && e.detail) || {}), { once: true });

// ===========================================================================
// Task 17: explain popover — length routing / sentence scan / context pack /
// streamed answer into an HTML Popover. Appended after Task 16's pill/hotkey.
// ===========================================================================

// ---- Explain: length routing (spec 5.3) ----
// <=4 whitespace-separated words -> define-in-context; CJK selections carry
// no spaces, so a spaceless run containing CJK counts as a term up to 8
// chars; a spaceless non-CJK run is one word, hence always a term.
function pbpExplainIsTerm(text) {
  const s = String(text == null ? "" : text).trim();
  if (!s) return false;
  if (/\s/.test(s)) return s.split(/\s+/).length <= 4;
  // Han + Kana (inside U+2E80-U+9FFF) / Hangul / CJK Compatibility Ideographs
  if (/[\u2E80-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF]/.test(s)) return s.length <= 8;
  return true;
}

// ---- Explain: sentence-boundary scan around [start, end) ----
// Backward from start to the previous boundary (exclusive), forward from end
// through the next boundary (inclusive). Boundaries: . ! ? ; newline and
// their CJK forms. No boundary found -> text edge. Result is trimmed.
function pbpExplainSentenceAround(text, start, end) {
  const s = String(text == null ? "" : text);
  const n = s.length;
  const a = Math.max(0, Math.min(Number(start) || 0, n));
  const b = Math.max(a, Math.min(Number(end) || 0, n));
  const isBoundary = (c) => ".!?;\n".indexOf(c) !== -1 || "。！？；".indexOf(c) !== -1;
  let from = 0;
  for (let i = a - 1; i >= 0; i--) {
    if (isBoundary(s[i])) { from = i + 1; break; }
  }
  let to = n;
  for (let i = b; i < n; i++) {
    if (isBoundary(s[i])) { to = i + 1; break; }
  }
  return s.slice(from, to).trim();
}

// ---- Explain: answer language = the READER's UI language ----
// Maps uiLangToBCP47() (i18n.js) output to a human language name for
// the prompt. The 9 supported UI locales; anything else answers in English.
const PBP_EXPLAIN_LANG_NAMES = {
  "zh-Hans": "Simplified Chinese",
  "zh-Hant": "Traditional Chinese",
  "ja": "Japanese",
  "ko": "Korean",
  "en": "English",
  "de": "German",
  "fr": "French",
  "pl": "Polish",
  "ru": "Russian"
};
function pbpExplainLangName(bcp47) {
  return PBP_EXPLAIN_LANG_NAMES[bcp47] || "English";
}

// ---- Explain: prompt builder (pure) ----
function pbpExplainBuildPrompt(p) {
  const isTerm = !!p.isTerm;
  const system = "You are a precise reading assistant embedded in an article viewer. " +
    "Answer in " + p.answerLang + ". Use the article context to disambiguate meaning. " +
    "Output plain markdown prose only: no headings, no preamble, no restating the question. " +
    (isTerm
      ? "Define the selected term as it is used in THIS article in 2-4 sentences, then add one sentence on why it matters here."
      : "Explain the selected passage in 3-6 sentences: what it says and what it implies in this article's argument.");
  const parts = [];
  parts.push("Article title: " + (p.title || "(untitled)"));
  if (p.prevText) parts.push("Previous paragraph:\n" + p.prevText);
  parts.push("Paragraph containing the selection:\n" + p.blockText);
  if (p.nextText) parts.push("Next paragraph:\n" + p.nextText);
  parts.push("Full sentence containing the selection:\n" + p.sentence);
  parts.push((isTerm ? "Selected term: " : "Selected passage: ") + '"' + p.selection + '"');
  return { system, prompt: parts.join("\n\n") };
}

// ---- Explain: translate-action prompt builder (pure) ----
// Sibling of pbpExplainBuildPrompt (spec 2.1): a lightweight single-shot
// translation, NOT the full-document translation pipeline (md-translate.js)
// -- no glossary, no placeholder shield, no neighbor blocks. The 4000-char
// cap mirrors PBP_EXPLAIN_BLOCK_CAP; it is hardcoded here as its own literal
// so this builder stays self-contained per the cross-task contract.
function pbpExplainBuildTranslatePrompt(p) {
  const CAP = 4000; // same cap as PBP_EXPLAIN_BLOCK_CAP
  const selection = String((p && p.selection) || "").slice(0, CAP);
  const blockText = String((p && p.blockText) || "").slice(0, CAP);
  const targetLangName = (p && p.targetLangName) || "English";
  const system = "You are a precise translation assistant embedded in an article viewer. " +
    "Translate the selected text into " + targetLangName + ". " +
    "Output ONLY the translation itself: no commentary, no explanation, no quotation marks wrapping the output, and no \"Translation:\" prefix or any other label. " +
    "Preserve any inline markdown formatting present in the selection (emphasis, inline code, link text) exactly as it appears.";
  const parts = [];
  parts.push("Article title: " + ((p && p.title) || "(untitled)"));
  parts.push("Paragraph containing the selection (context only -- do not translate this part):\n" + blockText);
  parts.push("Text to translate:\n" + selection);
  return { system, prompt: parts.join("\n\n") };
}

// ---- Explain: popover shell (lazy-mounted on first invoke) ----
let _pbpExplainPopEl = null;
let _pbpExplainAbort = null;
// H4 2.2: the save-as-note target + answer text for whichever run most
// recently finished successfully. Module-level because the .xp-save button is
// a singleton reused across invocations/re-runs; both are set inside
// _pbpExplainRun (target at the top of every run, answer text only once that
// run's stream completes).
let _pbpExplainSaveTarget = null; // { itemId } | { range } | null
let _pbpExplainAnswerText = "";
// Action switch (spec 2.1): "explain" | "translate", session-only per open
// (never persisted). _pbpExplainCap/_pbpExplainCtx cache the CURRENT
// invocation so the .xp-act buttons (Step 7) can re-run _pbpExplainRun
// without re-packing context or re-capturing the selection.
let _pbpExplainAction = "explain";
let _pbpExplainCap = null;
let _pbpExplainCtx = null;
let _pbpExplainPinned = false;
let _pbpExplainDrag = null;
// Set when the card opens ABOVE the selection: the value is the y its bottom
// edge must keep, so streamed growth moves it up and away from the text rather
// than down over it. null means top-anchored (the normal, downward case).
let _pbpExplainAnchorBottom = null;
let _pbpExplainResizeObserver = null;
// Focus handoff is scoped to one real open/close cycle. Pinned re-entry and
// action switches reuse the already-open shell and must not replace the
// element that launched it; the next open after a real close records afresh.
let _pbpExplainFocusSource = null;

const PBP_EXPLAIN_EDGE = 8;
// Floor for the height budget: below this the card is not worth opening on that
// side, so a cramped side yields to the other one instead of squeezing.
const PBP_EXPLAIN_MIN_CARD = 160;
// The height below which opening downward stops being worth the reading-order
// bias. MIN_CARD only asks "can a card exist here"; at 160px a dictionary entry
// shows two or three lines and has to be scrolled to be read at all. Two thirds
// of the stylesheet's 480px cap is the point where the card is still useful.
const PBP_EXPLAIN_COMFORT_CARD = 320;

// Which side the card opens on, given the space above and below the selection.
// Downward is the default because it follows reading order and keeps the card
// off the text above. It is abandoned only when down is BOTH uncomfortable and
// worse than up: a roomier upper half alone is not a reason to jump the card
// over the words being read.
function pbpExplainOpensDown(below, above) {
  const b = Number(below) || 0;
  const a = Number(above) || 0;
  return b >= PBP_EXPLAIN_COMFORT_CARD || b >= a;
}
const PBP_EXPLAIN_NUDGE = 8;

function pbpExplainClampPosition(left, top, width, height, viewportWidth, viewportHeight) {
  const maxLeft = Math.max(PBP_EXPLAIN_EDGE, Number(viewportWidth) - Number(width) - PBP_EXPLAIN_EDGE);
  const maxTop = Math.max(PBP_EXPLAIN_EDGE, Number(viewportHeight) - Number(height) - PBP_EXPLAIN_EDGE);
  return {
    left: Math.min(Math.max(PBP_EXPLAIN_EDGE, Number(left) || 0), maxLeft),
    top: Math.min(Math.max(PBP_EXPLAIN_EDGE, Number(top) || 0), maxTop)
  };
}

function _pbpExplainPlace(pop, left, top) {
  const pos = pbpExplainClampPosition(left, top, pop.offsetWidth, pop.offsetHeight,
    window.innerWidth, window.innerHeight);
  const nextLeft = pos.left + "px";
  const nextTop = pos.top + "px";
  if (pop.style.left !== nextLeft) pop.style.left = nextLeft;
  if (pop.style.top !== nextTop) pop.style.top = nextTop;
  return pos;
}

function _pbpExplainVisibleFocusTarget(el) {
  if (!el || el === document.body || el === document.documentElement
    || !el.isConnected || typeof el.focus !== "function") return false;
  if (typeof el.closest === "function" && el.closest("[hidden], [inert]")) return false;
  const style = getComputedStyle(el);
  return style.display !== "none" && style.visibility !== "hidden"
    && style.visibility !== "collapse" && el.getClientRects().length > 0;
}

function _pbpExplainFocusPreventScroll(el) {
  try { el.focus({ preventScroll: true }); } catch (_) {
    try { el.focus(); } catch (_) {}
  }
  return document.activeElement === el;
}

// Same temporary-tabindex handoff used by view switching: keep the reading
// target programmatically focusable only while it owns focus, then restore
// the DOM contract on blur. Prefer the invocation's logical block/side before
// falling back to the rendered reading surface itself.
function _pbpExplainFocusReadingFallback() {
  const view = document.getElementById("rendered-view");
  if (!view) return false;
  const n = Number(_pbpExplainCap && _pbpExplainCap.n);
  const original = n > 0 && typeof pbpAiBlockEl === "function" ? pbpAiBlockEl(n) : null;
  const translated = n > 0 ? view.querySelector('.pb-tr[data-pb-tr="' + n + '"]') : null;
  const target = [original, translated, view.querySelector("[data-pb]"), view.querySelector("[data-pb-tr]"), view]
    .find(_pbpExplainVisibleFocusTarget);
  if (!target) return false;
  const borrowed = !target.hasAttribute("tabindex");
  if (borrowed) target.setAttribute("tabindex", "-1");
  const focused = _pbpExplainFocusPreventScroll(target);
  if (borrowed) {
    if (focused) target.addEventListener("blur", () => target.removeAttribute("tabindex"), { once: true });
    else target.removeAttribute("tabindex");
  }
  return focused;
}

function _pbpExplainRestoreFocus(pop) {
  // An outside interaction may already have moved focus to its real target.
  // In that case the popover must not pull focus back into the reading flow.
  if (!pop || !pop.contains(document.activeElement)) return false;
  if (_pbpExplainVisibleFocusTarget(_pbpExplainFocusSource)
    && _pbpExplainFocusPreventScroll(_pbpExplainFocusSource)) return true;
  return _pbpExplainFocusReadingFallback();
}

function _pbpExplainSetPinned(pop, pinned) {
  _pbpExplainPinned = !!pinned;
  if (!pop) return;
  pop.dataset.pinned = String(_pbpExplainPinned);
  const pin = pop.querySelector(".xp-pin");
  if (!pin) return;
  const label = t(_pbpExplainPinned ? "explainUnpin" : "explainPin");
  pin.setAttribute("aria-pressed", String(_pbpExplainPinned));
  pin.setAttribute("aria-label", label);
  pin.title = label;
}

function _pbpExplainClose(pop, restoreFocus = false) {
  if (!pop || !pop.matches(":popover-open")) return;
  if (restoreFocus) _pbpExplainRestoreFocus(pop);
  // Both are per-open state: the next open measures its own space, and leaving
  // the inline budget behind would also make getComputedStyle read it back
  // instead of the stylesheet's cap.
  _pbpExplainAnchorBottom = null;
  pop.style.removeProperty("max-height");
  try { pop.hidePopover(); } catch (_) {}
}

window.pbpExplainPopoverPinned = (el) => !!(el && el === _pbpExplainPopEl && _pbpExplainPinned);
window.pbpExplainDismissIfUnpinned = () => {
  if (_pbpExplainPopEl && !_pbpExplainPinned) _pbpExplainClose(_pbpExplainPopEl);
};

// Static inline SVG (Feather settings gear). Constant string, never model text.
const PBP_EXPLAIN_GEAR_SVG = typeof PBP_ICONS !== "undefined" ? PBP_ICONS.gear : "";
const PBP_EXPLAIN_PIN_SVG = typeof PBP_ICONS !== "undefined" ? PBP_ICONS.pin : "";
// Foot-action icons, taken from Feather so they sit in the same family as the
// settings gear below (which is Feather's own "settings"). Hand-drawn shapes
// were the problem before: same stroke width and viewBox, but heavier, denser
// silhouettes that read as a different icon set sitting next to the gear.
// Inline SVG rather than glyphs, per CLAUDE.md's font-fallback rules.
const PBP_EXPLAIN_NOTE_SVG = typeof PBP_ICONS !== "undefined" ? PBP_ICONS.doc : "";
const PBP_EXPLAIN_VOCAB_ADD_SVG = typeof PBP_ICONS !== "undefined" ? PBP_ICONS.bookmarkPlus : "";
const PBP_EXPLAIN_VOCAB_OPEN_SVG = typeof PBP_ICONS !== "undefined" ? PBP_ICONS.bookMarked : "";
const PBP_EXPLAIN_ASK_SVG = typeof PBP_ICONS !== "undefined" ? PBP_ICONS.ask : "";
// One tick for both "saved" states. They sit in different places under
// different tooltips, so a shared check reads correctly and keeps the set small.
const PBP_EXPLAIN_DONE_SVG = typeof PBP_ICONS !== "undefined" ? PBP_ICONS.check : "";

// Icon-only foot button. The visible label becomes a native title, which is a
// browser tooltip rather than a floating panel of ours -- the ban on hover
// overlays in the reader is about the latter. aria-label carries the same text
// so the button is never nameless to a screen reader.
function _pbpExplainIconBtn(btn, svg, label) {
  btn.innerHTML = svg; // static constant, never model or dictionary text
  btn.title = label;
  btn.setAttribute("aria-label", label);
}

const PBP_EXPLAIN_CLOSE_SVG = typeof PBP_ICONS !== "undefined" ? PBP_ICONS.cross : "";

// Footer transparency label: "<provider> · <model>" — override wins, else the
// provider's configured model key (e.g. s.geminiModel), else provider alone.
function _pbpExplainModelLabel(s) {
  const p = s.aiProvider || "gemini";
  const m = pbpAiResolveModelOverride(s) || (typeof s[p + "Model"] === "string" ? s[p + "Model"] : "");
  return m ? p + " · " + m : p;
}

// Bridge into the ask panel: close the popover, open the panel, prefill the
// question box with the quoted selection, focus it. Prefers the ask
// section's opener when exposed; otherwise drives the contract-fixed shell
// (#ask-panel + body.ask-open) directly.
function _pbpExplainOpenAsk(selText) {
  const prefill = '"' + selText + '" ';
  if (typeof window.pbpAskOpenPanel === "function") {
    window.pbpAskOpenPanel(prefill);
    return;
  }
  const panel = document.getElementById("ask-panel");
  if (!panel) return;
  document.body.classList.add("ask-open");
  const input = panel.querySelector("textarea");
  if (input) {
    input.value = prefill;
    input.focus();
  }
}

const PBP_EXPLAIN_DIALOG_LABELS = Object.freeze({
  explain: "explainSelection",
  translate: "explainTranslateSelection",
  dict: "dictLookupSelection"
});

// Mirrors the live action onto both the action controls and dialog name.
function _pbpExplainSyncActButtons(pop) {
  pop.querySelectorAll(".xp-act").forEach((btn) => {
    btn.setAttribute("aria-pressed", String(btn.dataset.action === _pbpExplainAction));
  });
  pop.setAttribute("aria-label", t(PBP_EXPLAIN_DIALOG_LABELS[_pbpExplainAction] || "explainSelection"));
}

function _pbpExplainEnsurePop() {
  if (_pbpExplainPopEl) return _pbpExplainPopEl;
  const pop = document.createElement("div");
  pop.id = "explain-pop";
  pop.setAttribute("popover", "manual");
  pop.setAttribute("role", "dialog");
  pop.setAttribute("aria-modal", "false");
  pop.setAttribute("aria-label", t("explainSelection"));
  const head = document.createElement("div");
  head.className = "xp-head";
  const term = document.createElement("span");
  term.className = "xp-term";
  head.appendChild(term);
  // Keep a real blank drag target between the title and controls. On narrow
  // screens the action group wraps below, while this zone stays on the first
  // row so dragging never depends on hitting truncated text.
  const dragZone = document.createElement("span");
  dragZone.className = "xp-drag-zone";
  dragZone.setAttribute("aria-hidden", "true");
  head.appendChild(dragZone);
  const actGroup = document.createElement("div");
  actGroup.className = "xp-act-group";
  actGroup.setAttribute("role", "group");
  const PBP_EXPLAIN_ACTION_LABELS = { explain: "explainActionExplain", translate: "explainActionTranslate", dict: "explainActionDict" };
  // Icon-only segments (icon audit P0): bubble+? / A-with-glyph / open book,
  // the same trio the highlight card wears. Labels ride title/aria; the
  // selected segment is carried by the aria-pressed fill, not text weight.
  const PBP_EXPLAIN_ACTION_ICONS = { explain: PBP_ICONS.explain, translate: PBP_ICONS.translate, dict: PBP_ICONS.book };
  ["explain", "translate", "dict"].forEach((action) => {
    const actBtn = document.createElement("button");
    actBtn.type = "button";
    actBtn.className = "xp-act";
    actBtn.dataset.action = action;
    actBtn.innerHTML = PBP_EXPLAIN_ACTION_ICONS[action]; // static shared constants
    actBtn.title = t(PBP_EXPLAIN_ACTION_LABELS[action]);
    actBtn.setAttribute("aria-label", t(PBP_EXPLAIN_ACTION_LABELS[action]));
    actBtn.setAttribute("aria-pressed", String(action === _pbpExplainAction));
    actBtn.addEventListener("click", () => {
      // Click on the already-active action: no-op (spec 2.1 only defines
      // behavior for clicking the INACTIVE action).
      if (_pbpExplainAction === action) return;
      _pbpExplainAction = action;
      if (action !== "dict" && typeof window.pbpDictOnActionSwitch === "function") window.pbpDictOnActionSwitch();
      _pbpExplainSyncActButtons(pop);
      // Re-run with the SAME cap/ctx: existing abort-previous-stream in
      // _pbpExplainRun handles the concurrency, no extra dedup needed.
      if (_pbpExplainCap && _pbpExplainCtx) _pbpExplainRun(_pbpExplainCap, _pbpExplainCtx, pop);
    });
    actGroup.appendChild(actBtn);
  });
  head.appendChild(actGroup);
  const windowActions = document.createElement("div");
  windowActions.className = "xp-window-actions";
  const moveHint = document.createElement("span");
  moveHint.id = "xp-move-hint";
  moveHint.className = "sr-only";
  moveHint.textContent = t("explainMoveHint");
  const pin = document.createElement("button");
  pin.type = "button";
  pin.className = "xp-pin";
  pin.setAttribute("aria-describedby", moveHint.id);
  pin.setAttribute("aria-keyshortcuts", "Alt+ArrowUp Alt+ArrowDown Alt+ArrowLeft Alt+ArrowRight");
  pin.innerHTML = PBP_EXPLAIN_PIN_SVG;
  pin.addEventListener("click", () => _pbpExplainSetPinned(pop, !_pbpExplainPinned));
  pin.addEventListener("keydown", (e) => {
    if (!e.altKey || e.ctrlKey || e.metaKey || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
    e.preventDefault();
    _pbpExplainSetPinned(pop, true);
    const rect = pop.getBoundingClientRect();
    const left = parseFloat(pop.style.left) || rect.left;
    const top = parseFloat(pop.style.top) || rect.top;
    const dx = e.key === "ArrowLeft" ? -PBP_EXPLAIN_NUDGE : e.key === "ArrowRight" ? PBP_EXPLAIN_NUDGE : 0;
    const dy = e.key === "ArrowUp" ? -PBP_EXPLAIN_NUDGE : e.key === "ArrowDown" ? PBP_EXPLAIN_NUDGE : 0;
    _pbpExplainPlace(pop, left + dx, top + dy);
  });
  const close = document.createElement("button");
  close.type = "button";
  close.className = "xp-close";
  close.title = t("explainClose");
  close.setAttribute("aria-label", t("explainClose"));
  close.innerHTML = PBP_EXPLAIN_CLOSE_SVG;
  close.addEventListener("click", () => _pbpExplainClose(pop, true));
  windowActions.appendChild(moveHint);
  windowActions.appendChild(pin);
  windowActions.appendChild(close);
  head.appendChild(windowActions);

  head.addEventListener("pointerdown", (e) => {
    if (!e.isPrimary || e.button !== 0 || e.target.closest("button,a,input,select,textarea,label,[contenteditable]")) return;
    const rect = pop.getBoundingClientRect();
    // `moved` gates the commit. Pinning here, on pointerdown, meant a plain
    // press on the header silently took the card out of light-dismiss (the
    // outside-pointerdown handler bails while pinned) -- so a click that only
    // meant to grab attention changed how the card closes, with nothing on
    // screen saying so. Nothing is committed until the pointer actually travels.
    _pbpExplainDrag = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, left: rect.left, top: rect.top, moved: false };
    try { head.setPointerCapture(e.pointerId); } catch (_) {}
    e.preventDefault();
  });
  head.addEventListener("pointermove", (e) => {
    const drag = _pbpExplainDrag;
    if (!drag || drag.pointerId !== e.pointerId) return;
    if (!drag.moved) {
      // 4px of hysteresis: below this it is a press, not a drag. Small because
      // this is repositioning, not a directional swipe that needs to commit.
      if (Math.abs(e.clientX - drag.x) < 4 && Math.abs(e.clientY - drag.y) < 4) return;
      drag.moved = true;
      _pbpExplainAnchorBottom = null; // the user owns the position from here on
      _pbpExplainSetPinned(pop, true);
      pop.classList.add("xp-dragging");
    }
    // Anchored to the original grab point, so total travel matches the pointer
    // exactly; the first placed frame simply catches up the 4px already spent.
    _pbpExplainPlace(pop, drag.left + e.clientX - drag.x, drag.top + e.clientY - drag.y);
    e.preventDefault();
  });
  const endDrag = (e) => {
    if (!_pbpExplainDrag || _pbpExplainDrag.pointerId !== e.pointerId) return;
    _pbpExplainDrag = null;
    pop.classList.remove("xp-dragging");
    try { if (head.hasPointerCapture(e.pointerId)) head.releasePointerCapture(e.pointerId); } catch (_) {}
  };
  head.addEventListener("pointerup", endDrag);
  head.addEventListener("pointercancel", endDrag);
  const body = document.createElement("div");
  body.className = "xp-body";
  const foot = document.createElement("div");
  foot.className = "xp-foot";
  const model = document.createElement("span");
  model.className = "xp-model";
  // H4 2.2: "Save as note" -- hidden while streaming/on error, shown once an
  // answer finishes; typeof-guarded (window.pbpHlAttachNote may not exist if
  // md-highlight.js failed to load/init). Disabled immediately on click to
  // guard against a double-click firing two attach-note calls; re-enabled
  // only if the attach turns out to have failed.
  const save = document.createElement("button");
  save.type = "button";
  save.className = "xp-save";
  save.hidden = true;
  _pbpExplainIconBtn(save, PBP_EXPLAIN_NOTE_SVG, t("explainSaveNote"));
  save.addEventListener("click", () => {
    if (typeof window.pbpHlAttachNote !== "function") return;
    save.disabled = true;
    // Capture this run's identity: _pbpExplainRun assigns a fresh object to
    // _pbpExplainSaveTarget on every run, so a reference check below tells a
    // superseded run's late resolve apart from the current one -- without it,
    // an old run's resolve could mutate a button that a newer run already reset.
    const myTarget = _pbpExplainSaveTarget;
    window.pbpHlAttachNote(myTarget, _pbpExplainAnswerText).then((ok) => {
      if (_pbpExplainSaveTarget !== myTarget) return; // superseded run, do not touch the button
      if (ok) {
        _pbpExplainIconBtn(save, PBP_EXPLAIN_DONE_SVG, t("explainSavedNote"));
      } else {
        save.disabled = false; // pbpHlAttachNote already toasted the failure
      }
    }).catch(() => {
      if (_pbpExplainSaveTarget === myTarget) save.disabled = false;
    });
  });
  const vocab = document.createElement("button");
  vocab.type = "button";
  vocab.className = "xp-vocab";
  vocab.hidden = true;
  _pbpExplainIconBtn(vocab, PBP_EXPLAIN_VOCAB_ADD_SVG, t("dictSaveVocab"));
  vocab.addEventListener("click", async () => {
    if (vocab.disabled || typeof window.pbpDictSaveCurrent !== "function") return;
    vocab.disabled = true;
    const myRunId = vocab.dataset.runId; // the run this click belongs to
    const ok = await window.pbpDictSaveCurrent().catch(() => false);
    if (vocab.dataset.runId !== myRunId) return; // a newer dict run owns the button now
    if (ok) _pbpExplainIconBtn(vocab, PBP_EXPLAIN_DONE_SVG, t("dictSavedVocab"));
    else {
      // A silent re-enable read as "saved" (gap audit). flashButtonLabel is
      // off-limits here -- it swaps textContent and would strip the SVG -- so
      // failure is a border pulse plus the page's one buttonless toast
      // channel (#copy-status aria-live, via _pbpHlToast).
      vocab.disabled = false;
      vocab.classList.remove("xp-flash-fail");
      void vocab.offsetWidth; // restart the pulse on a repeat failure
      vocab.classList.add("xp-flash-fail");
      if (typeof _pbpHlToast === "function") _pbpHlToast(t("dictVocabSaveFailed"));
    }
  });
  // Jump to the vocabulary view on the standalone library page (deep link:
  // library.js resolves #vocab on load AND on hashchange, same contract
  // options.js used to own before the word list moved off Options).
  // dict-action-only, same visibility discipline as .xp-vocab; label reuses
  // the library tab's own i18n key so the two surfaces always name it
  // identically. Routed through shared.js's tab-reuse helper (md-preview is
  // an extension page, so chrome.tabs is available here) -- window.open
  // stacked a fresh library tab on every click.
  const openVocab = document.createElement("button");
  openVocab.type = "button";
  openVocab.className = "xp-open-vocab";
  openVocab.hidden = true;
  _pbpExplainIconBtn(openVocab, PBP_EXPLAIN_VOCAB_OPEN_SVG, t("dictVocabSection"));
  openVocab.addEventListener("click", () => {
    if (typeof pbpOpenExtensionTab === "function") { pbpOpenExtensionTab("library.html", "vocab"); return; }
    try { window.open(chrome.runtime.getURL("library.html#vocab")); } catch (_) {}
  });
  // Known-word toggle: shell only. md-dict.js shows it when the looked-up
  // word is already saved, and rewires .onclick per dictionary run (property
  // assignment, so runs never stack listeners). Hidden for every other action.
  const knownBtn = document.createElement("button");
  knownBtn.type = "button";
  knownBtn.className = "xp-known";
  knownBtn.hidden = true;
  const ask = document.createElement("button");
  ask.type = "button";
  ask.className = "xp-ask";
  _pbpExplainIconBtn(ask, PBP_EXPLAIN_ASK_SVG, t("explainAskMore"));
  ask.addEventListener("click", () => {
    const selText = pop.querySelector(".xp-term").textContent;
    _pbpExplainClose(pop);
    _pbpExplainOpenAsk(selText);
  });
  const gearWrap = document.createElement("span");
  gearWrap.className = "xp-gear-wrap";
  const gear = document.createElement("button");
  gear.type = "button";
  gear.className = "xp-gear";
  gear.title = t("explainSettings");
  gear.setAttribute("aria-label", t("explainSettings"));
  gear.setAttribute("aria-expanded", "false");
  gear.innerHTML = PBP_EXPLAIN_GEAR_SVG; // static constant, see above
  const menu = document.createElement("div");
  menu.className = "xp-gear-menu";
  menu.hidden = true;
  // Same key set the options page renders (settings key: selectionTrigger), so
  // both surfaces name the three modes identically and can never drift apart.
  [["icon", t("selectionTriggerIcon")], ["hotkey", t("selectionTriggerHotkey")], ["off", t("selectionTriggerOff")]]
    .forEach(([value, label]) => {
      const lab = document.createElement("label");
      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = "xp-trigger";
      radio.value = value;
      radio.addEventListener("change", () => {
        // On-the-spot trigger-ladder switch (spec 5.3), persisted to the
        // SAME storage area options.js writes (sync when optSyncEnabled,
        // else local). Takes effect immediately via the live module var; the
        // highlight bar's explain button is memoized at bar-creation time
        // (spec 2e known corner), so this doesn't retroactively show/hide it.
        _pbpExplainTrigger = value;
        _pbpExplainPersistTrigger(value);   // fire-and-forget; never rejects
      });
      lab.appendChild(radio);
      lab.appendChild(document.createTextNode(" " + label));
      menu.appendChild(lab);
    });
  gear.addEventListener("click", (e) => {
    e.stopPropagation(); // don't let this same click trigger the outside-close below
    menu.hidden = !menu.hidden;
    gear.setAttribute("aria-expanded", String(!menu.hidden));
  });
  // Click anywhere outside the gear (but still inside the popover) closes the
  // menu. The manual popover's outside-dismiss listener is installed below.
  pop.addEventListener("click", (e) => {
    if (!menu.hidden && !gearWrap.contains(e.target)) {
      menu.hidden = true;
      gear.setAttribute("aria-expanded", "false");
    }
  });
  gearWrap.appendChild(gear);
  gearWrap.appendChild(menu);
  foot.appendChild(model);
  foot.appendChild(save);
  foot.appendChild(vocab);
  foot.appendChild(knownBtn);
  foot.appendChild(openVocab);
  foot.appendChild(ask);
  foot.appendChild(gearWrap);
  pop.appendChild(head);
  pop.appendChild(body);
  pop.appendChild(foot);
  _pbpExplainSetPinned(pop, false);
  // Only a real close aborts the active stream and resets session-only state.
  // Pin toggles and pinned re-entry never hide/show, so they cannot land here.
  pop.addEventListener("beforetoggle", (e) => {
    if (e.newState === "closed") {
      if (_pbpExplainAbort) _pbpExplainAbort.abort();
      // speechSynthesis is page-level, not popover-level: without this a
      // pronunciation started from the dictionary view keeps talking after
      // the panel is gone. pbpDictSpeak only cancels on the NEXT click.
      try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (_) {}
      _pbpExplainSetPinned(pop, false);
      _pbpExplainDrag = null;
      pop.classList.remove("xp-dragging");
      menu.hidden = true;
      gear.setAttribute("aria-expanded", "false");
      _pbpExplainFocusSource = null;
    }
  });
  document.addEventListener("pointerdown", (e) => {
    if (!pop.matches(":popover-open") || _pbpExplainPinned || pop.contains(e.target)) return;
    _pbpExplainClose(pop);
  }, true);
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !pop.matches(":popover-open")) return;
    // A later auto popover (search/help/highlight) is visually above the
    // pinned Explain card. Let the browser dismiss that transient layer
    // first; a following Escape closes Explain once it is topmost again.
    if ([...document.querySelectorAll(":popover-open")].some((el) => el !== pop)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    _pbpExplainClose(pop, true);
  }, true);
  window.addEventListener("resize", () => {
    if (!pop.matches(":popover-open")) return;
    const rect = pop.getBoundingClientRect();
    _pbpExplainPlace(pop, rect.left, rect.top);
  });
  document.body.appendChild(pop);
  if (typeof ResizeObserver === "function") {
    _pbpExplainResizeObserver = new ResizeObserver(() => {
      if (!pop.matches(":popover-open")) return;
      const r = pop.getBoundingClientRect();
      // Bottom-anchored cards recompute their top from the height that just
      // changed; top-anchored ones only need the viewport clamp re-applied.
      const top = _pbpExplainAnchorBottom === null ? r.top : _pbpExplainAnchorBottom - r.height;
      _pbpExplainPlace(pop, r.left, top);
    });
    _pbpExplainResizeObserver.observe(pop);
  }
  _pbpExplainPopEl = pop;
  return pop;
}

// ---- Explain: context pack ----
// Selection + full sentence + host block + one neighbor each side + title.
// Caps keep the request bounded (output is the budget at 1024 tokens; input
// stays comfortably small). Works on translated sibling blocks too (.pb-tr
// is inserted by md-translate as the original block's nextSibling): the
// original block text is sent alongside, labeled, per spec 5.3.
const PBP_EXPLAIN_BLOCK_CAP = 4000;
const PBP_EXPLAIN_NEIGHBOR_CAP = 1200;

// UTF-16 offset of range.start within el.textContent (-1 when the range
// does not start inside el). TreeWalker accumulation, no DOM mutation.
function _pbpExplainRangeOffsetIn(el, range) {
  if (!el || !range) return -1;
  let off = 0;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    if (node === range.startContainer) return off + range.startOffset;
    off += node.data.length;
  }
  return -1;
}

// Index of the occ-th (0-based) occurrence of needle in hay; falls back to
// the FIRST occurrence when there are fewer than occ+1 (transform drift
// between textContent and the KaTeX snapshot).
function _pbpExplainNthIndex(hay, needle, occ) {
  let i = -1;
  for (let k = 0; k <= occ; k++) {
    i = hay.indexOf(needle, i + 1);
    if (i === -1) break;
  }
  return i === -1 ? hay.indexOf(needle) : i;
}

// Shared core (spec 2.3): given a RESOLVED block index n and the selected
// text, builds {sentence, blockText, prevText, nextText} purely from
// pbpAiTextOfKatex(n) -- no Range, no blockEl. This is what Task 3's
// pbpExplainOpenForItem calls directly for a highlight-card invocation
// (a card only ever has item.n, never a live Range). n===0 / the .pb-tr
// live-translation overlay are edge cases only the live-range path can see,
// so they stay in _pbpExplainPackContext below, which calls this core for
// the common case and adjusts on top for those two edge cases. occ (0-based,
// default 0) is which occurrence of selText in the block to anchor the
// sentence on -- the range-bearing caller (Codex final-review F1) resolves
// this from cap.range so a repeated word's sentence isn't always the first.
function _pbpExplainPackFromBlock(n, selText, occ) {
  const origText = n ? pbpAiTextOfKatex(n) : String(selText || "");
  const idx = occ > 0 ? _pbpExplainNthIndex(origText, selText, occ) : origText.indexOf(selText);
  const sentence = idx === -1
    ? selText
    : pbpExplainSentenceAround(origText, idx, idx + selText.length);
  const blockText = origText.slice(0, PBP_EXPLAIN_BLOCK_CAP);
  const prevText = n > 1 ? pbpAiTextOfKatex(n - 1).slice(0, PBP_EXPLAIN_NEIGHBOR_CAP) : "";
  const nextText = (n && pbpAiBlockEl(n + 1)) ? pbpAiTextOfKatex(n + 1).slice(0, PBP_EXPLAIN_NEIGHBOR_CAP) : "";
  return { sentence, blockText, prevText, nextText };
}

function _pbpExplainPackContext(cap) {
  // H4 (Task 3, spec 2.3): a card-path cap has no live Range -- only .n and
  // .text (see window.pbpExplainOpenForItem in this file). Dispatch straight
  // to the shared core instead of touching cap.range.startContainer below,
  // which does not exist on a range-less cap.
  if (!cap.range) {
    const pack = _pbpExplainPackFromBlock(cap.n, cap.text);
    // Card path: a translated-side highlight recorded the language it was
    // made in (item.lang); hand it to the dictionary as selection metadata.
    pack.selLang = cap.selLang || "";
    return pack;
  }
  const view = document.getElementById("rendered-view");
  // Ask/translate init owns the canonical pbpAiIndexBlocks call on
  // pbp:rendered; this is only a lazy backfill (re-indexing resets caches).
  if (view && !pbpAiBlocks().length) pbpAiIndexBlocks(view);
  let node = cap.range.startContainer;
  if (node && node.nodeType !== 1) node = node.parentElement;
  const blockEl = node ? node.closest("[data-pb], .pb-tr, #rendered-view > *") : null;
  let n = 0;
  let trText = "";
  if (blockEl && blockEl.dataset.pb) {
    n = Number(blockEl.dataset.pb);
  } else if (blockEl && blockEl.classList.contains("pb-tr")
      && blockEl.previousElementSibling && blockEl.previousElementSibling.dataset.pb) {
    n = Number(blockEl.previousElementSibling.dataset.pb);
    trText = blockEl.textContent || "";
  }
  if (!n) {
    // No resolved block index (rare: a direct #rendered-view child
    // pbpAiIndexBlocks never tagged) -- the shared core needs a real n, so
    // this edge case stays inline exactly as it behaved before extraction.
    const origText = (blockEl && blockEl.textContent) || cap.text;
    const idx = origText.indexOf(cap.text);
    const sentence = idx === -1
      ? cap.text
      : pbpExplainSentenceAround(origText, idx, idx + cap.text.length);
    return { sentence, blockText: origText.slice(0, PBP_EXPLAIN_BLOCK_CAP), prevText: "", nextText: "" };
  }
  const rangeOff = _pbpExplainRangeOffsetIn(blockEl, cap.range);
  if (!trText) {
    // Original-text branch: rangeOff is a textContent offset, but the shared
    // core anchors on OCCURRENCE (it re-scans pbpAiTextOfKatex(n), a KaTeX
    // snapshot that can diverge from blockEl.textContent) -- count how many
    // earlier occurrences of cap.text precede rangeOff in the live DOM text
    // and pass that occurrence index through instead of the raw offset.
    let occ = 0;
    if (rangeOff > 0) {
      const raw = blockEl.textContent;
      let p = raw.indexOf(cap.text);
      while (p !== -1 && p < rangeOff) { occ++; p = raw.indexOf(cap.text, p + 1); }
    }
    return _pbpExplainPackFromBlock(n, cap.text, occ);
  }
  const core = _pbpExplainPackFromBlock(n, cap.text);
  // .pb-tr branch: the selection lives in the translated rendering, so the
  // sentence must be scanned against THAT text; the translated text is
  // appended to blockText for disambiguation (unchanged from pre-extraction).
  // trText === blockEl.textContent here, so rangeOff already indexes it
  // directly -- use it when it truly lands on cap.text, else fall back to
  // the first occurrence (transform drift).
  const idx = (rangeOff >= 0 && trText.slice(rangeOff, rangeOff + cap.text.length) === cap.text)
    ? rangeOff
    : trText.indexOf(cap.text);
  const sentence = idx === -1
    ? cap.text
    : pbpExplainSentenceAround(trText, idx, idx + cap.text.length);
  return {
    sentence,
    blockText: core.blockText + "\n\nTranslated rendering of the same paragraph (the selection comes from this translation):\n"
      + trText.slice(0, PBP_EXPLAIN_BLOCK_CAP),
    prevText: core.prevText,
    nextText: core.nextText,
    // The .pb-tr block carries the language md-translate stamped on it
    // seconds earlier (lang for known targets, data-pb-tr-lang always) --
    // authoritative selection metadata for the dictionary, which otherwise
    // has to run CLD over deliberately bilingual blockText. EXCEPT partial
    // fills: untranslated ORIGINAL passages are spliced into the .pb-tr with
    // no marker of their own (wrapping would break marked's block parsing),
    // and the retry pill inserted after the block is the one signal that
    // says so (_pbpTrMarkPartial). A selection there may be residual source
    // text, so the stamp is not trustworthy -- fall back to detection.
    selLang: (blockEl.nextElementSibling && blockEl.nextElementSibling.classList
        && blockEl.nextElementSibling.classList.contains("pb-tr-err"))
      ? ""
      : (blockEl.getAttribute("lang") || blockEl.dataset.pbTrLang || "")
  };
}

// ---- Explain: streamed request into the popover body ----
async function _pbpExplainRun(cap, ctx, pop) {
  const s = _pbpExplainSettings || await pbpAiGetSettings();
  const body = pop.querySelector(".xp-body");
  // H4 2.2: reset the save button on every run -- hidden + re-enabled +
  // default label until this run's answer actually finishes. Target derives
  // from cap (itemId wins when present, i.e. a card entry point from Task 3;
  // otherwise the live-selection cap.range, always a cloneRange() snapshot per
  // pbpExplainInvoke) so the click handler never touches window.getSelection().
  const save = pop.querySelector(".xp-save");
  save.hidden = true;
  save.disabled = false;
  _pbpExplainIconBtn(save, PBP_EXPLAIN_NOTE_SVG, t("explainSaveNote"));
  const vocabBtn = pop.querySelector(".xp-vocab");
  if (vocabBtn) {
    vocabBtn.hidden = true;
    vocabBtn.disabled = false;
    // Resetting with textContent would delete the icon: these buttons carry no
    // text now, so every reset has to restore the SVG and both labels.
    _pbpExplainIconBtn(vocabBtn, PBP_EXPLAIN_VOCAB_ADD_SVG, t("dictSaveVocab"));
  }
  const openVocabBtn = pop.querySelector(".xp-open-vocab");
  if (openVocabBtn) openVocabBtn.hidden = true;
  const knownBtnReset = pop.querySelector(".xp-known");
  if (knownBtnReset) knownBtnReset.hidden = true; // md-dict re-arms it per run
  // No-AI users never initialize the ask panel, so "Ask more" would silently
  // no-op for them -- hide it whenever AI is unavailable, any action.
  const askBtn = pop.querySelector(".xp-ask");
  if (askBtn) askBtn.hidden = !_pbpExplainAiOk;
  _pbpExplainSaveTarget = cap.itemId ? { itemId: cap.itemId } : { range: cap.range };
  // Skeleton: 3 shimmer lines + an SR-only loading announcement.
  if (body.contains(document.activeElement)) {
    body.tabIndex = -1;
    body.focus();
  }
  body.setAttribute("aria-busy", "true");
  body.replaceChildren();
  for (let i = 0; i < 3; i++) {
    const sk = document.createElement("div");
    sk.className = "xp-skel";
    body.appendChild(sk);
  }
  const sr = document.createElement("span");
  sr.className = "sr-only";
  const loadingKey = _pbpExplainAction === "translate"
    ? "explainTranslateLoading"
    : _pbpExplainAction === "dict" ? "dictLoading" : "explainLoading";
  sr.textContent = t(loadingKey);
  body.appendChild(sr);
  // A new invocation aborts the previous in-flight request — this is also
  // the double-click guard (no inflight dedup needed: the old stream dies).
  if (_pbpExplainAbort) _pbpExplainAbort.abort();
  const ctrl = new AbortController();
  _pbpExplainAbort = ctrl;
  // dict P1: delegate entirely to md-dict.js, which owns its own body
  // rendering/streaming/error states. saveTarget shape matches explain's
  // above so a later highlight cross-reference (spec decision #4) can reuse
  // it; aria-busy is only cleared here if this run is still the active one
  // (a newer run may already have taken over the same pop).
  if (_pbpExplainAction === "dict" && typeof window.pbpDictRun === "function") {
    if (openVocabBtn) openVocabBtn.hidden = false; // dict view: offer the jump to Options > Vocabulary
    if (typeof window.pbpDictSetSaveTarget === "function") {
      window.pbpDictSetSaveTarget(cap.itemId ? { itemId: cap.itemId } : { range: cap.range });
    }
    try {
      await window.pbpDictRun(cap, ctx, pop, ctrl, s);
    } catch (_) { /* md-dict degrades internally */ }
    finally { if (_pbpExplainAbort === ctrl) body.removeAttribute("aria-busy"); }
    return;
  }
  // dict P1: explain/translate need AI; render a not-configured message
  // instead of attempting a request when the master switch/key gate fails.
  if (!_pbpExplainAiOk) {
    const msg = document.createElement("div");
    msg.className = "xp-dict-msg";
    msg.textContent = t(_pbpExplainAction === "translate"
      ? "explainTranslateAiNotConfigured"
      : "explainAiNotConfigured");
    body.replaceChildren(msg);
    body.removeAttribute("aria-busy");
    return;
  }
  // Action switch (spec 2.1): translate is a lightweight single-shot prompt
  // (no term/passage routing, no neighbor blocks); explain keeps the existing
  // routed prompt. maxTokens 2048 for translate vs 1024 for explain.
  const isTranslate = _pbpExplainAction === "translate";
  let system, prompt;
  if (isTranslate) {
    const targetLangName = (typeof pbpTrResolveTargetLang === "function")
      ? pbpTrResolveTargetLang(s, uiLangToBCP47()).name
      : "English";
    ({ system, prompt } = pbpExplainBuildTranslatePrompt({
      selection: cap.text,
      blockText: ctx.blockText,
      title: _pbpExplainPage.title || document.title,
      targetLangName
    }));
  } else {
    ({ system, prompt } = pbpExplainBuildPrompt({
      selection: cap.text,
      sentence: ctx.sentence,
      blockText: ctx.blockText,
      prevText: ctx.prevText,
      nextText: ctx.nextText,
      title: _pbpExplainPage.title || document.title,
      answerLang: pbpExplainLangName(uiLangToBCP47()),
      isTerm: pbpExplainIsTerm(cap.text)
    }));
  }
  pbpAiBumpCounter("explain"); // local usage counter, storage.local only (both actions share the bucket)
  const stream = document.createElement("div");
  stream.className = "xp-stream";
  let started = false;
  let pending = "";
  let rafId = 0;
  const flush = () => { rafId = 0; stream.textContent = pending; };
  try {
    // temperature intentionally omitted: callAIStream defaults to 0.3 (the
    // existing ask/explain default). maxTokens 1024 per spec 5.3.
    const full = await callAIStream(s, prompt, {
      maxTokens: isTranslate ? 2048 : 1024,
      model: pbpAiResolveModelOverride(s),
      system,
      signal: ctrl.signal
    }, (delta, acc) => {
      if (!started) { started = true; body.replaceChildren(stream); }
      pending = acc; // markers can split across chunks: always render the accumulated text
      if (!rafId) rafId = requestAnimationFrame(flush); // rAF-throttled DOM writes
    });
    if (rafId) cancelAnimationFrame(rafId);
    // Final pass through the single sanitize point (renderMarkdown =
    // marked + DOMPurify, md-convert.js). Never innerHTML raw model text.
    const md = document.createElement("div");
    md.className = "xp-md";
    md.innerHTML = renderMarkdown(full);
    body.replaceChildren(md);
    // H4 2.2: the answer is now final -- stash the raw markdown text (never
    // the rendered HTML) for "Save as note", and reveal the button only if
    // md-highlight.js actually exposed the hook.
    _pbpExplainAnswerText = full;
    if (typeof window.pbpHlAttachNote === "function") save.hidden = false;
  } catch (e) {
    if (rafId) cancelAnimationFrame(rafId);
    if (e && e.name === "AbortError") return; // closed or re-invoked: silent
    const wrap = document.createElement("div");
    wrap.className = "xp-error";
    const msg = document.createElement("p");
    msg.textContent = (e && e.message) || "Request failed"; // handleAIError text, plain
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "xp-retry";
    retry.innerHTML = PBP_ICONS.refresh; // static shared constant, never page content
    retry.append(t(e && e.code === "host_permission" ? "aiGrantRetry" : "explainErrRetry"));
    retry.addEventListener("click", async () => {
      if (retry.disabled) return;
      retry.disabled = true;
      try {
        const recovered = await pbpAiRetryWithPermission(e, s, () => _pbpExplainRun(cap, ctx, pop));
        if (!recovered) retry.disabled = false;
      } catch (_) {
        retry.disabled = false;
      }
    });
    wrap.appendChild(msg);
    wrap.appendChild(retry);
    body.replaceChildren(wrap);
  } finally {
    // A superseded run may settle after its replacement has already marked
    // the shared body busy. Only the controller that still owns the popover
    // may clear that state.
    if (_pbpExplainAbort === ctrl) body.removeAttribute("aria-busy");
  }
}

// ---- Explain: open (called by pbpExplainInvoke, Task 16) ----
// Everything needed is captured at invoke time: cap.rect is a FROZEN DOMRect
// snapshot taken by pbpExplainInvoke before this runs, so positioning never
// touches the live range. The block lookup below reads cap.range.startContainer
// synchronously (before any await), so the DOM node is still valid here.
function _pbpExplainOpenPop(cap, initialAction) {
  const pop = _pbpExplainEnsurePop();
  const wasOpen = pop.matches(":popover-open");
  if (!wasOpen) _pbpExplainFocusSource = document.activeElement;
  pop.querySelector(".xp-term").textContent = cap.text; // ellipsized via CSS
  const modelEl = pop.querySelector(".xp-model");
  modelEl.textContent = _pbpExplainModelLabel(_pbpExplainSettings || {});
  // The footer's button row can squeeze the flexed label to nothing; the
  // native title keeps the full "provider · model" reachable on hover.
  modelEl.title = modelEl.textContent;
  // Two explicit entry points (bar help-circle -> explain, bar book-open ->
  // dict) plus the card's explicit actions replaced the old term-based smart
  // default: the action is now always caller-declared. Unknown values fall
  // back to explain. Session-only, as before.
  _pbpExplainAction = (initialAction === "translate" || initialAction === "dict") ? initialAction : "explain";
  _pbpExplainSyncActButtons(pop);
  // Gear radios mirror the live trigger value. Only a real close resets the
  // menu itself; re-running a pinned popover must not masquerade as dismissal.
  const menu = pop.querySelector(".xp-gear-menu");
  menu.querySelectorAll('input[type="radio"]').forEach((r) => {
    r.checked = (r.value === _pbpExplainTrigger);
  });
  // Pack context first (reads the live DOM node synchronously), then show.
  const ctx = _pbpExplainPackContext(cap);
  _pbpExplainCap = cap;
  _pbpExplainCtx = ctx;
  const rect = cap.rect || cap.range.getBoundingClientRect(); // frozen snapshot
  // A manual popover no longer closes auto popovers implicitly. Preserve the
  // old mutual exclusion when Explain itself is invoked (not when another
  // surface opens beside an already pinned Explain panel).
  document.querySelectorAll(":popover-open").forEach((el) => {
    if (el !== pop) { try { el.hidePopover(); } catch (_) {} }
  });
  if (!pop.matches(":popover-open")) pop.showPopover();
  if (!_pbpExplainPinned) {
    // Loose panels follow the newest selection. Pinned panels keep the exact
    // user-controlled position while _pbpExplainRun takes over their content.
    //
    // Height cannot be measured here: _pbpExplainRun fills the body on the next
    // line, so pop.offsetHeight is an empty skeleton. Pick the side from the
    // SPACE available instead, budget the card to that space, and let .xp-body
    // (already overflow-y:auto) scroll inside it. The card then never outgrows
    // its side, so the ResizeObserver never has to claw it back as the answer
    // streams in.
    const edge = PBP_EXPLAIN_EDGE;
    const below = window.innerHeight - rect.bottom - edge * 2;
    const above = rect.top - edge * 2;
    // The old rule only asked whether a MINIMUM card fitted below, so a selection
    // near the foot of the window opened into a 160px sliver with a thousand
    // pixels sitting unused above it.
    const openDown = pbpExplainOpensDown(below, above);
    // The budget may never exceed the room actually there, or the card overflows
    // the side it was placed on and the clamp drags it back -- the crawl this
    // replaces. When neither side clears the floor the viewport is simply too
    // short to budget for, so the stylesheet cap and the clamp handle it.
    const cssCap = parseFloat(getComputedStyle(pop).maxHeight);
    const room = openDown ? below : above;
    if (room >= PBP_EXPLAIN_MIN_CARD) {
      pop.style.maxHeight = Math.floor(Math.min(Number.isFinite(cssCap) ? cssCap : room, room)) + "px";
    } else {
      pop.style.removeProperty("max-height");
    }
    if (openDown) {
      // Top-anchored: the card grows downward from a fixed point under the
      // selection, so a short answer still sits right under the text.
      _pbpExplainAnchorBottom = null;
      _pbpExplainPlace(pop, rect.left, rect.bottom + edge);
    } else {
      // Bottom-anchored: growth pushes the card UP, away from the text it is
      // explaining, instead of down over it -- and a short answer stays glued
      // to the selection rather than floating at the top of the viewport.
      _pbpExplainAnchorBottom = rect.top - edge;
      _pbpExplainPlace(pop, rect.left, _pbpExplainAnchorBottom - pop.offsetHeight);
    }
  }
  _pbpExplainRun(cap, ctx, pop);
}

// ---- Card AI row entry point (H4, spec 2.3): the highlight card's
// explain/translate buttons call this instead of pbpExplainInvoke -- there is
// no live Range for a highlight item, so the cap is synthesized directly from
// the item's stored quote/block index. _pbpExplainPackContext dispatches on
// cap.range's absence (Step 5) and packs context via
// _pbpExplainPackFromBlock(cap.n, cap.text). Setting cap.itemId here is also
// what makes the popover's "save as note" button target this highlight
// instead of a live selection.
// opts.range (optional, vocab-echo click): a live Range for exact context;
// _pbpExplainPackContext and the save-target wiring already prefer cap.range
// when present.
window.pbpExplainOpenForItem = function (opts) {
  if (!opts || typeof _pbpExplainOpenPop !== "function") return;
  const cap = {
    text: String(opts.text == null ? "" : opts.text),
    rect: opts.rect,
    itemId: opts.itemId,
    n: opts.n,
    selLang: String(opts.lang || ""),
    range: (typeof Range !== "undefined" && opts.range instanceof Range) ? opts.range : undefined
  };
  _pbpExplainOpenPop(cap, opts.action);
};
