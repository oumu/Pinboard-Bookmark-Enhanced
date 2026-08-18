// ============================================================
// Pinboard Bookmark Enhanced - md-preview full-text translation.
// Loaded ONLY by md-preview.html (after md-ai-core.js; the <script>
// tag is added when the DOM layer lands). This top section is PURE
// (no DOM / chrome.* / fetch) so tests/md-ai-tests.html can load the
// file on file://. Later sections append: the batch queue engine
// (failure ladder) and the rail UI / bilingual view layer.
// ============================================================

// ---- Batch packing (spec 4.3: greedy, document order) ----
// blocks: [{id, text}] where text is the SHIELDED block markdown
// (pbpAiShield output). Greedy fill: close the current batch when adding
// the next block would exceed maxBlocks or maxChars. A single oversize
// block still ships alone (the model may truncate it; the failure ladder
// catches that) — blocks are never silently dropped.
function pbpTrPackBatches(blocks, maxBlocks = 15, maxChars = 8000) {
  const batches = [];
  let cur = [];
  let curChars = 0;
  for (const b of (blocks || [])) {
    if (!b || typeof b.text !== "string") continue;
    const len = b.text.length;
    if (cur.length && (cur.length >= maxBlocks || curChars + len > maxChars)) {
      batches.push(cur);
      cur = [];
      curChars = 0;
    }
    cur.push({ id: b.id, text: b.text });
    curChars += len;
  }
  if (cur.length) batches.push(cur);
  return batches;
}

// ---- Prompt builder (spec 4.3 JSON protocol) ----
// The model must answer ONLY {"translations":[{"id":N,"text":"..."}]} so
// pbpAiMakeStreamJsonParser can fill blocks incrementally and finish()
// can diff seenIds against the request (failure ladder step 1).
// GEN PIN: any wording change here requires PBP_TR_PROMPT_GEN += 1 (see the
// cache generation ledger below) and re-pinning its hash in
// tests/md-ai-tests.html ("tr cache generation ledger" suite).
const PBP_TR_SYSTEM = [
  "You are a professional translator.",
  'Output ONLY a JSON object of the exact shape {"translations":[{"id":N,"text":"..."}]} - no markdown fences, no commentary, nothing else.',
  "Rules:",
  "1. Translate every segment's \"text\" into targetLanguage. Return exactly one item per input segment; ids must match the input ids exactly.",
  "2. Placeholders like ⟦C1⟧, ⟦L2⟧, ⟦I3⟧, ⟦M4⟧ are protected content: keep every placeholder verbatim and in position. Never translate, alter, drop or duplicate them.",
  "3. Preserve the markdown structure of each segment (headings #, list markers -, blockquote >, emphasis, tables). Do not translate proper nouns, code identifiers or product names.",
  "4. If a glossary object is provided, apply it strictly: a non-empty value means always translate the term that way; an empty value (\"\") means keep the term in its source language, untranslated.",
  "5. Translate faithfully; do not add, omit or summarize content.",
  "The optional title and summary fields are context only - do not translate or return them."
].join("\n");

// ---- Target-language style packs (2026-07 quality round) ----
// Compact per-language rewrite rules appended to the system prompt --
// locale style guidance is the established industry lever against
// translationese (Smartling "Style Rules for AI"; arXiv 2607.03160
// showed theory-driven prompts help, over-instruction hurts, so packs
// stay small). English wording: the least-surprising instruction
// language across all providers. Packs are SUBORDINATE to the contract
// rules (the appended clause says so) -- the placeholder-conservation
// gate and JSON shape are untouched. Cost: ~60-100 input tokens per
// batch; the (priced-heavier) output side is unchanged.
// GEN PIN: any wording change to PBP_TR_STYLE_GENERIC / PBP_TR_STYLE_PACKS
// requires PBP_TR_PROMPT_GEN += 1 and re-pinning the ledger hash in
// tests/md-ai-tests.html.
const PBP_TR_STYLE_GENERIC = "Write as a skilled native editor of targetLanguage, not a literal translator: natural word order, the target language's own punctuation conventions, no source-language calques.";
const PBP_TR_STYLE_PACKS = {
  "zh-Hans": "Simplified Chinese: write like a native editor, not a literal translator. Match the source's register (\u4f60 by default for web prose); drop pronouns where natural Chinese would. Full-width punctuation \uff08\uff0c\u3002\uff1b\uff09 and one space between CJK and Latin/digits. No calqued idioms; minimal \u88ab-passives; strong verbs instead of \u8fdb\u884c/\u4f5c\u51fa+noun. Keep established English tech terms as-is.",
  "zh-Hant": "Traditional Chinese (Taiwan conventions): rewrite as a native editor. Taiwan terminology (\u8edf\u9ad4\u3001\u7db2\u8def\u3001\u6ed1\u9f20), full-width punctuation, one space between CJK and Latin. No calques or Europeanized syntax; drop pronouns where natural.",
  ja: "Japanese: consistent \u3067\u3059\u30fb\u307e\u3059 style for article prose. Prefer established Japanese terms over new katakana loans when both exist; split long attributive chains into natural clauses; use \u3001 and \u3002.",
  ko: "Korean: consistent \ud569\ub2c8\ub2e4-style polite prose. Natural Korean word order and particles; prefer established Korean terms over unnecessary loanwords.",
  de: "German: natural German syntax (verb-second, sentence frame), never the source word order. Established compounds instead of calqued noun strings; address the reader informally (du) only if the source is casual.",
  fr: "French: natural French phrasing, no anglicized word order. French typography: non-breaking space before ; : ! ? and inside \u00ab guillemets \u00bb.",
  es: "Spanish: natural word order with inverted opening marks \u00bf\u00a1 where required; prefer established Spanish terms over anglicisms.",
  ru: "Russian: natural Russian syntax and case usage; lowercase \u0432\u044b; avoid calqued English passives and word order.",
  pl: "Polish: natural Polish inflection and word order; avoid English calques; established Polish terminology over loan translations.",
  en: "English: idiomatic, concise English; restructure sentences rather than mirroring the source syntax."
};
// code: st.target.code (dropdown ISO code or custom free text). Exact match,
// then base-language prefix ("ja-JP" -> ja), then the generic pack (also the
// custom-target path: free-text targets can't have a curated pack).
function pbpTrStylePack(code) {
  const c = String(code || "");
  if (PBP_TR_STYLE_PACKS[c]) return PBP_TR_STYLE_PACKS[c];
  const base = c.split("-")[0];
  return PBP_TR_STYLE_PACKS[base] || PBP_TR_STYLE_GENERIC;
}

function pbpTrBuildPrompt(args) {
  const a = args || {};
  const payload = {
    targetLanguage: String(a.targetLanguage || ""),
    title: String(a.title || "")
  };
  if (a.summary) payload.summary = String(a.summary);
  if (a.glossary && typeof a.glossary === "object" && Object.keys(a.glossary).length) {
    payload.glossary = a.glossary;
  }
  payload.segments = Array.isArray(a.segments)
    ? a.segments.map(function (s) { return { id: s.id, text: s.text }; })
    : [];
  const style = pbpTrStylePack(a.targetCode);
  return {
    system: PBP_TR_SYSTEM + "\nTarget-language style (never overrides Rules 1-5): " + style,
    prompt: JSON.stringify(payload)
  };
}

// ---- Glossary parsing (options textarea, one "term=translation" per line;
// empty right side = keep the term untranslated; split on the FIRST
// separator). A CJK IME in fullwidth mode types U+FF1D instead of "=", and
// that line used to be swallowed with no warning and no UI trace -- the same
// silent-fullwidth defect class the dictionary's apostrophe fix covered. ----
function pbpTrParseGlossary(str) {
  const out = {};
  for (const line of String(str == null ? "" : str).split(/\r?\n/)) {
    const i = line.search(/[=＝]/);
    if (i <= 0) continue;
    const term = line.slice(0, i).trim();
    if (!term) continue;
    out[term] = line.slice(i + 1).trim();
  }
  return out;
}

// Parse the terminology-extraction model reply (spec T1). Tolerant: strips ```fences,
// takes the first {...} block, bad JSON -> {}. Empty translation ("") = keep source
// untranslated (same semantics as the user glossary).
function pbpTrParseGlossaryJson(full) {
  const out = Object.create(null);
  let s = String(full == null ? "" : full).trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const i = s.indexOf("{"), j = s.lastIndexOf("}");
  if (i < 0 || j <= i) return out;
  let obj;
  try { obj = JSON.parse(s.slice(i, j + 1)); } catch (_) { return out; }
  const terms = (obj && Array.isArray(obj.terms)) ? obj.terms : [];
  for (const t of terms) {
    if (!t || typeof t.term !== "string") continue;
    const term = t.term.trim();
    if (!term) continue;
    out[term] = (typeof t.translation === "string") ? t.translation.trim() : "";
  }
  return out;
}

// Merge auto-extracted + user glossary; the USER entry always wins (spec decision).
function pbpTrMergeGlossary(auto, user) {
  return Object.assign(Object.create(null), auto || {}, user || {});
}

// Single-call terminology extraction over the whole article; >limit chars -> chunk
// and union. Output is small (a term list), so cost is ~1x article INPUT once.
const PBP_TR_GLOSSARY_LIMIT = 24000;
// Below this many total shielded chars, skip auto glossary extraction: too few
// blocks for cross-batch term drift, so the model self-coheres. Named for tuning
// on real pages. (~a single translation batch.)
const PBP_TR_GLOSSARY_SKIP_CHARS = 1500;
function _pbpTrGlossaryWorthIt(st) {
  const total = (st.work || []).reduce((a, w) => a + (w.shielded ? w.shielded.text.length : 0), 0);
  return total >= PBP_TR_GLOSSARY_SKIP_CHARS;
}
// GEN PIN: any wording change here requires PBP_TR_GLOSSARY_GEN += 1 (see the
// cache generation ledger below) and re-pinning its hash in
// tests/md-ai-tests.html.
const PBP_TR_GLOSSARY_SYSTEM = [
  "You are a terminology extractor for a document translator.",
  "Read the whole source text and extract the key terms that must be translated CONSISTENTLY:",
  "proper nouns, person names, product/brand names, and recurring domain-specific technical terms.",
  'Output ONLY a JSON object {"terms":[{"term":"...","translation":"..."}]} - no fences, no commentary.',
  "Rules:",
  "1. \"translation\" is the term rendered in targetLanguage.",
  "2. If a term should stay in its source language (code identifiers, brand names, well-known acronyms), set \"translation\" to \"\" (empty string).",
  "3. Prefer terms appearing more than once or clearly significant; keep it focused (<= ~40 entries).",
  "4. Ignore placeholders like ⟦C1⟧ ⟦L2⟧ - they are not terms.",
  "5. Do not include ordinary words; only translation-sensitive terms."
].join("\n");
function pbpTrBuildGlossaryPrompt(text, targetLanguage) {
  return {
    system: PBP_TR_GLOSSARY_SYSTEM,
    prompt: JSON.stringify({ targetLanguage: String(targetLanguage || ""), text: String(text == null ? "" : text) })
  };
}

// ---- Cache generation ledger (ZH-1a) ----
// PBP_TR_PROMPT_GEN covers PBP_TR_SYSTEM + PBP_TR_STYLE_PACKS/GENERIC;
// PBP_TR_GLOSSARY_GEN covers PBP_TR_GLOSSARY_SYSTEM. Bump the matching
// constant by hand whenever the covered text changes; the "tr cache
// generation ledger" suite in tests/md-ai-tests.html pins each text's hash to
// its constant, so forgetting the bump turns the tests red (gate D1). Gen 2 =
// the 2026-07 style-pack rollout counted as the first uncaptured change.
const PBP_TR_PROMPT_GEN = 2;
const PBP_TR_GLOSSARY_GEN = 1;

// Fingerprint of the USER glossary subset that actually hits this article
// (matched via pbpTrMatchGlossary over st.work): key AND value sorted then
// hashed -- the most common edit is changing a term's TRANSLATION, so a
// key-only hash would miss the main use case (gate D4). Empty table -> "" (a
// legal fingerprint value: compare with ===, never truthiness). Deliberately
// NOT covering the auto-extracted table (it lives behind the gloss_ key /
// meta.ag) and NOT any run-nondeterministic quantity -- anything that cannot
// enter this fingerprint deterministically must not influence model output
// (the killed previousTranslation channel is the precedent; see
// proposals.md ZH-8 (2)).
function pbpTrGlossaryFingerprint(entries) {
  const keys = Object.keys(entries || {}).sort();
  if (!keys.length) return "";
  return pbpAiHash(keys.map((k) => k + "=" + entries[k]).join("\n"));
}

// Stale classifier consumed by ZH-1b's UI half (not wired to any UI in the
// ZH-1a batch). meta === undefined (legacy / unknown generation) NEVER
// prompts. gens.length > 1 means the entry was assembled across prompt
// generations ("mixed"). meta.sm is recorded for diagnostics but deliberately
// excluded from the verdict: the summary bit flips when ai_cache_summary
// naturally expires, and nagging on natural expiry is a false alarm.
function pbpTrCacheGenStale(meta, cur) {
  if (meta === undefined || meta === null) return null;
  const gens = meta.gens;
  if (!Array.isArray(gens) || !gens.length) return null;
  const gfs = Array.isArray(meta.gfs) ? meta.gfs : [];
  // Mixed on EITHER axis (review finding #3): prompt generations OR user-
  // glossary fingerprints assembled across continue-runs.
  if (gens.length > 1 || gfs.length > 1) return "mixed";
  const promptStale = gens[0] !== cur.pg;
  const glossStale = gfs.length === 1 && cur.gf !== undefined && gfs[0] !== cur.gf;
  if (promptStale && glossStale) return "both";
  if (promptStale) return "prompt";
  if (glossStale) return "glossary";
  return null;
}

// Per-batch trimming (spec T0-a): keep only terms that actually appear in this
// batch's segment text, so we inject a focused subset instead of the whole table.
// Latin terms match case-insensitively; CJK (no a-z) match as exact substring.
function pbpTrMatchGlossary(glossary, segments) {
  const g = glossary || {};
  const terms = Object.keys(g);
  const out = Object.create(null);
  if (!terms.length) return out;
  const hay = (segments || []).map((s) => String((s && s.text) || "")).join("\n");
  const hayLc = hay.toLowerCase();
  for (const term of terms) {
    if (!term) continue;
    const hit = /[a-z]/i.test(term) ? hayLc.includes(term.toLowerCase()) : hay.includes(term);
    if (hit) out[term] = g[term];
  }
  return out;
}

function pbpTrGlossaryHitEntries(glossary, segments) {
  const matched = pbpTrMatchGlossary(glossary, segments);
  return Object.keys(matched).map((term) => ({ term, translation: matched[term] }));
}

// ---- Hallucination probe (spec 4.3 ladder step 3) ----
// Long translated blocks must retain enough source length to catch dropped
// content; CJK targets use a lower floor because they compress Latin prose
// more densely. Every block still rejects empty or runaway-expanded output.
// Share of the text that is Han, kana or Hangul. Latin prose translates into
// roughly its own length; CJK prose expands severalfold. Measured 2026-08-01
// over real Wikipedia paragraphs rendered to English: zh 3.03-4.49 (median
// 4.10), ja 1.72-1.91, ko 2.01-2.28. Japanese and Korean sit far below Chinese
// because kana and hangul already spell things out, which is why this is a
// share of the source rather than one flat CJK constant.
function pbpTrCjkShare(text) {
  const s = String(text || "");
  if (!s.length) return 0;
  const m = s.match(/[\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uAC00-\uD7AF]/g);
  return m ? m.length / s.length : 0;
}

function pbpTrLengthRatioOk(orig, translated, targetCode) {
  const o = String(orig == null ? "" : orig).trim().length;
  const t = String(translated == null ? "" : translated).trim().length;
  if (o === 0 || t === 0) return false;
  // Runaway-expansion guard: the model padding or hallucinating content. The
  // 4x ceiling was calibrated on Latin sources and applied to every direction,
  // including the one it was never measured on. Two of ten real Chinese
  // Wikipedia paragraphs translated to English exceeded it (4.49x and 4.24x
  // against a 4.0 ceiling), were retried against the same ceiling, and ended
  // up in the article as "Translation failed". The lower bound below has been
  // direction-aware all along; this one now is too. It is a hallucination
  // guard rather than a precision instrument, so the headroom over the
  // measured maximum is deliberate.
  if (t > o * (4 + 6 * pbpTrCjkShare(orig)) + 20) return false;
  // Short blocks -- a heading or a few words -- legitimately compress hard into
  // a dense target language ("The shape of the curriculum" -> "课程的形态", ratio
  // ~0.18), so the 0.3 lower bound is a false positive there. Only enforce a
  // lower bound on longer blocks, where a very low ratio really means dropped
  // content. CJK targets legitimately compress Latin prose more densely.
  if (o < 80) return true;
  const minRatio = /^(?:zh|ja|ko)(?:-|$)/i.test(String(targetCode || "")) ? 0.15 : 0.20;
  return t / o >= minRatio;
}

// Placeholder conservation gate (spec T0-b): a faithful translation keeps every
// ⟦C/L/I/M n⟧ placeholder exactly once and adds no new/unknown ones. Compares the
// MULTISET of placeholders in the shielded original vs the shielded translation
// (run BEFORE pbpAiRestore). The cheapest, most reliable omission/corruption signal.
function pbpTrPlaceholdersConserved(orig, translated) {
  const rx = /⟦[CLIM]\d+⟧/g;
  const count = (s) => {
    const m = new Map();
    for (const ph of (String(s == null ? "" : s).match(rx) || [])) m.set(ph, (m.get(ph) || 0) + 1);
    return m;
  };
  const a = count(orig), b = count(translated);
  if (a.size !== b.size) return false;
  for (const [ph, n] of a) if (b.get(ph) !== n) return false;
  return true;
}

// True if the shielded block text has anything worth translating (any letter,
// including CJK). A block that is only ⟦...⟧ placeholders + whitespace/
// punctuation -- an image wall, a badge row, an avatar/logo grid -- has no text
// to translate; sending it just yields an empty/omitted model reply that fails
// the ratio check ("invalid single-block translation"), and retry re-fails the
// same way. Skip such blocks: keep the original (images still render), no
// .pb-tr line, no error pill.
function _pbpTrHasText(shielded) {
  const bare = String(shielded == null ? "" : shielded).replace(/⟦[CLIM]\d+⟧/g, "");
  return /\p{L}/u.test(bare);
}

// A block this long, translated, can exceed a model's output-token cap and
// truncate -- losing the whole block (the "longest 2 blocks always fail"
// symptom). Such blocks are sub-split into parts <= this many chars; each part
// translates within the cap and the parts reassemble into the block's text.
const PBP_TR_PART_LIMIT = 6000;

// Split `text` into chunks <= limit chars at the coarsest boundary available
// (paragraph "\n\n", then line "\n", then sentence end, then a hard cut that
// never lands inside a ⟦...⟧ placeholder). Returns { chunks, seps } such that
// seps.map((s,i)=>s+chunks[i]).join("") === text exactly (seps[0]===""), so the
// translated chunks reassemble with their original separators. A boundary-free
// run longer than limit is kept whole (rare; better whole than corrupted).
function _pbpTrSplitText(text, limit) {
  const s = String(text == null ? "" : text);
  const lim = limit || PBP_TR_PART_LIMIT;
  if (s.length <= lim) return { chunks: [s], seps: [""] };
  const chunks = [];
  const seps = [];
  let pos = 0;
  let prevSep = "";
  while (pos < s.length) {
    if (s.length - pos <= lim) { chunks.push(s.slice(pos)); seps.push(prevSep); break; }
    const win = s.slice(pos, pos + lim);
    let cut = -1, sepLen = 0;
    for (const [delim, dl] of [["\n\n", 2], ["\n", 1]]) {
      const idx = win.lastIndexOf(delim);
      if (idx > 0) { cut = pos + idx; sepLen = dl; break; }
    }
    if (cut === -1) {
      const sIdx = win.search(/[.。!?！？](?=[\s]?[^.。!?！？]*$)/);
      if (sIdx > 0) { cut = pos + sIdx + 1; sepLen = (s[pos + sIdx + 1] === " ") ? 1 : 0; }
      else {
        let end = pos + lim;
        const open = s.lastIndexOf("⟦", end - 1);
        const close = s.lastIndexOf("⟧", end - 1);
        if (open > close && open > pos) end = open;   // don't cut inside a placeholder
        cut = end; sepLen = 0;
      }
    }
    chunks.push(s.slice(pos, cut));
    seps.push(prevSep);
    prevSep = s.slice(cut, cut + sepLen);
    pos = cut + sepLen;
  }
  return { chunks, seps };
}

// ============================================================
// Batch queue engine (DOM-free; all I/O injected for testability)
// ============================================================

// 429 detection. handleAIError does NOT set err.status -- it bakes the HTTP
// status into the message ("<provider> failed (HTTP 429)") or passes the
// provider's own wording through; match both, plus err.status for safety.
function _pbpTrIs429(err) {
  if (!err) return false;
  if (err.status === 429) return true;
  return /HTTP 429|rate.?limit|too many requests|resource.*exhausted/i.test(String(err.message || ""));
}

function _pbpTrMissingIds(batch, filledSet) {
  const out = [];
  for (const seg of batch) { if (!filledSet.has(seg.id)) out.push(seg.id); }
  return out;
}

const PBP_TR_BACKOFF_MS = [2000, 8000, 32000];

// ---- ZH-2: viewport-priority batch claiming (pure) ----
// Batches stay PACKED in document order (pbpTrPackBatches unchanged, so batch
// composition and payloads are byte-identical); these helpers only decide
// which packed batch a worker takes NEXT. Distances are measured in BLOCK
// NUMBERS, never pixels: bilingual fills keep growing the document during a
// run, so any offset snapshot and the live scrollY sit in different
// coordinate spaces, while block order is layout-immune.

// remaining: batch indices not yet claimed; batchBlockNs[i]: the real block
// numbers batch i covers (part ids already mapped back via segMap); anchor:
// the block number to translate near. Nearest batch wins; ties take the
// smaller index (stable, predictable); a degenerate anchor keeps document
// order.
function pbpTrPickBatch(remaining, batchBlockNs, anchor) {
  if (!Array.isArray(remaining) || !remaining.length) return undefined;
  if (!Number.isFinite(anchor)) return remaining[0];
  let best = remaining[0];
  let bestDist = Infinity;
  for (const idx of remaining) {
    const ns = batchBlockNs[idx] || [];
    let d = Infinity;
    for (const n of ns) { const dd = Math.abs(n - anchor); if (dd < d) d = dd; }
    if (d < bestDist || (d === bestDist && idx < best)) { bestDist = d; best = idx; }
  }
  return best;
}

// Anchor for the run. Mandatory condition 1 (spec ZH-2): a CONTINUE run --
// st.trMd non-empty at run start beyond the skip verdicts, which covers both
// the probe-partial path AND same-session Stop -> Continue -- anchors on the
// FIRST untranslated block, not the live viewport. ZH-0's incremental cache
// makes partial caches routine; viewport anchoring there would punch random
// holes ("swiss cheese") into the remaining prefix. Fresh runs follow the
// viewport reading when one exists.
function pbpTrRunAnchor(pendingNs, totalWork, skippedCount, viewTopBlock) {
  if (!Array.isArray(pendingNs) || !pendingNs.length) return 1;
  const first = Math.min.apply(null, pendingNs);
  const continueRun = pendingNs.length < totalWork - (skippedCount || 0);
  if (continueRun) return first;
  return (Number.isFinite(viewTopBlock) && viewTopBlock > 0) ? viewTopBlock : first;
}

// ZH-0: incremental cache flush thresholds -- write paid-for translations to
// IDB every N blocks or M ms instead of only once after the whole run, so a
// closed tab / crash / network drop loses at most this window's output.
const PBP_TR_FLUSH_BLOCKS = 8;
const PBP_TR_FLUSH_MS = 5000;

// pbpTrRunQueue(plan) -> Promise<{done, total, failed:[{id,message}], stopped}>
//   plan: {
//     batches:      [[{id, text}]]            (pbpTrPackBatches output; text = SHIELDED md)
//     requestBatch: async (segments, onItem) -> {seenIds:Set}
//                   (streams; calls onItem({id,text}) per closed item; resolves
//                    with the finish() diff set; rejects with handleAIError /
//                    timeout / AbortError semantics)
//     requestSingle:async (segment) -> string|null  (downgrade path: one block,
//                    one attempt; null = model returned nothing usable)
//     targetCode?:  BCP-47-ish target code used by the length quality gate
//     onFill(id, text), onBlockFail(id, message), onProgress(done, total)
//     signal?:      AbortSignal (Stop button / page close)
//     concurrency?: default 2; backoffMs?: default PBP_TR_BACKOFF_MS (tests
//                   inject [1,1,1]); sleep?: default setTimeout promise
//   }
// Resolution invariants: resolves (never rejects) -- every non-filled block is
// either in `failed`, still pending because `stopped` is true, or held for one
// permission recovery when `permissionError` is set. The ratio gate
// (pbpTrLengthRatioOk) runs on every fill, batch AND single.
async function pbpTrRunQueue(plan) {
  const batches = plan.batches || [];
  const targetCode = plan.targetCode || "";
  const conc = plan.concurrency || 2;
  const backoff = plan.backoffMs || PBP_TR_BACKOFF_MS;
  const sleep = plan.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const signal = plan.signal;
  const aborted = () => !!(signal && signal.aborted);
  // ZH-3: caught request errors are humanized at THIS boundary (the only place
  // the Error object with code/status still exists). Injected to keep the
  // queue engine DOM/i18n-free; default reproduces the old behavior verbatim.
  const describe = plan.describeError || ((e) => (e && e.message));

  const total = batches.reduce((n, b) => n + b.length, 0);
  const filled = new Set();
  const failed = [];
  let done = 0;
  const downgrade = [];   // [{id, text}] -> single-block retry phase
  let slow = false;       // any 429 seen -> drain pool to 1 worker
  // ZH-2: workers claim from this shared index pool. plan.claim (optional)
  // picks WHICH batch goes next -- reordering only; a claim returning a
  // non-member degrades to document order so a buggy callback can never
  // wedge or starve the queue. Claim + splice run synchronously within one
  // worker turn, so two workers cannot claim the same batch.
  const remaining = batches.map((_, i) => i);
  const claim = plan.claim || ((arr) => arr[0]);
  const claimNext = () => {
    if (!remaining.length) return -1;
    let idx;
    try { idx = claim(remaining.slice()); } catch (_) { idx = remaining[0]; }
    let at = remaining.indexOf(idx);
    if (at === -1) at = 0;
    return remaining.splice(at, 1)[0];
  };
  let permissionError = null;
  const halted = () => aborted() || !!permissionError;

  const fill = (id, text) => {
    if (filled.has(id)) return;
    filled.add(id);
    done += 1;
    try { plan.onFill(id, text); } catch (_) {}
    try { plan.onProgress(done, total); } catch (_) {}
  };
  const fail = (id, message) => {
    failed.push({ id, message: String(message || "translation failed") });
    try { plan.onBlockFail(id, String(message || "translation failed")); } catch (_) {}
    // Mirror fill()'s onProgress call so a run where every block fails (e.g. offline)
    // still repaints #tr-progress -- otherwise it freezes on the pre-run "Extracting
    // terminology..." text forever (D4-1: onProgress was fill()-only, so 0 successes
    // meant 0 repaints of the batch-start placeholder).
    try { plan.onProgress(done, total); } catch (_) {}
  };

  async function runBatch(batch) {
    const byId = new Map(batch.map((s) => [s.id, s]));
    const onItem = (item) => {
      const seg = byId.get(item.id);
      if (!seg || filled.has(item.id)) return;            // out-of-batch / dup id: skip
      if (pbpTrPlaceholdersConserved(seg.text, item.text) && pbpTrLengthRatioOk(seg.text, item.text, targetCode)) fill(item.id, item.text);
      // ratio-failed items stay unfilled -> picked up by the missing diff below
    };
    for (let attempt = 0; ; attempt++) {
      if (halted()) return;
      try {
        await plan.requestBatch(batch, onItem);
        break; // stream completed; missing-id diff below
      } catch (e) {
        if (aborted()) return;
        if (e && e.code === "host_permission") { permissionError = e; return; }
        if (_pbpTrIs429(e) && attempt < backoff.length) {
          slow = true;                                     // 2 -> 1 worker
          await sleep(backoff[attempt]);
          continue;
        }
        // hard batch failure: classify the shared error object ONCE (review
        // finding #6: per-block describe() re-ran its console.warn per block),
        // then give every unfilled block the same inline text.
        const msg = describe(e);
        for (const id of _pbpTrMissingIds(batch, filled)) fail(id, msg);
        return;
      }
    }
    // stream OK: ids missing from the answer (or ratio-rejected) -> downgrade
    for (const id of _pbpTrMissingIds(batch, filled)) downgrade.push(byId.get(id));
  }

  async function worker(index) {
    while (true) {
      if (halted()) return;
      if (slow && index > 0) return;                       // pool 2 -> 1 after a 429
      const i = claimNext();
      if (i === -1) return;
      await runBatch(batches[i]);
    }
  }

  const workers = [];
  for (let w = 0; w < Math.min(conc, Math.max(batches.length, 1)); w++) workers.push(Promise.resolve(worker(w)).catch(function (e) { void e; }));
  await Promise.all(workers);

  // Downgrade phase: sequential single-block re-request, ONE attempt each
  // (spec: retry once, don't grind the same prompt repeatedly).
  while (downgrade.length) {
    if (halted()) break;
    const seg = downgrade.shift();
    if (!seg || filled.has(seg.id)) continue;
    try {
      const text = await plan.requestSingle(seg);
      if (typeof text === "string" && pbpTrPlaceholdersConserved(seg.text, text) && pbpTrLengthRatioOk(seg.text, text, targetCode)) fill(seg.id, text);
      else fail(seg.id, "invalid single-block translation");
    } catch (e) {
      if (aborted()) break;
      if (e && e.code === "host_permission") { permissionError = e; break; }
      fail(seg.id, describe(e));
    }
  }

  return { done, total, failed, stopped: aborted(), permissionError };
}

// ============================================================
// View-layer pure helpers (unit-tested in tests/md-ai-tests.html)
// ============================================================

// Entry visibility (spec 4.1): hide the translate control ONLY when the
// detected article language AND the resolved TARGET language are both non-empty
// and equal (translating a language into itself is a no-op). Gate on the target,
// NOT the UI language — a zh UI with an explicit en target must still offer to
// translate a zh article. Uncertain detection ("" for Latin scripts) always shows it.
function _pbpTrShouldHideEntry(articleLang, targetLang) {
  return !!(articleLang && targetLang && articleLang === targetLang);
}

// Target-language resolution: "auto" -> the UI language (BCP-47 from
// uiLangToBCP47(), passed in by the caller so this stays pure); otherwise
// the stored code / custom free text. `code` keys the tr_/trview_ cache;
// `name` is the human-readable targetLanguage sent in the prompt.
const PBP_TR_LANG_NAMES = {
  "zh-Hans": "Simplified Chinese", "zh-Hant": "Traditional Chinese",
  en: "English", ja: "Japanese", ko: "Korean", de: "German", fr: "French",
  es: "Spanish", pt: "Portuguese", ru: "Russian", it: "Italian", pl: "Polish",
  nl: "Dutch", tr: "Turkish", ar: "Arabic", hi: "Hindi", vi: "Vietnamese",
  th: "Thai", id: "Indonesian"
};

// RTL scripts among the known target-language codes above (D9-1). Custom
// free-text targets (e.g. "Classical Chinese") can't be statically judged
// RTL/LTR, so _pbpTrFill falls back to dir="auto" for anything not in here.
const PBP_TR_RTL_LANGS = new Set(["ar", "he", "fa", "ur"]);

// ---- Target-language skip detection (spec T3, 2026-07-03): a shielded block
// already written in the TARGET SCRIPT needs no translation. Deliberately
// SCRIPT-based, not language-based: a lightweight heuristic can reliably tell
// Han from Hangul but cannot tell English from French, so every Latin target
// (en/fr/de/es/pt/it/pl/nl/tr/vi/id/... and any unrecognized or custom
// free-text code) NEVER skips -- a false "already translated" verdict
// silently drops a block with no per-block retry path, the worst failure
// mode this file has, so every threshold below is conservative on purpose.
// All ranges are \u escapes (zero literal non-ASCII in the regex source),
// matching the PBP_TR_RTL_LANGS / detectArticleLang (md-preview.js) convention.
const PBP_TR_SCRIPT_MIN_LETTERS = 20;   // fewer letters than this: too little signal, never skip
const PBP_TR_SCRIPT_THRESHOLD = 0.7;    // script-letter ratio required to call a block "already translated"
const PBP_TR_SCRIPT_RX = {
  han: /[\u4E00-\u9FFF\u3400-\u4DBF]/g,
  kana: /[\u3040-\u30FF]/g,
  hangul: /[\uAC00-\uD7AF\u1100-\u11FF]/g,
  cyrillic: /[\u0400-\u04FF]/g,
  greek: /[\u0370-\u03FF]/g,
  arabic: /[\u0600-\u06FF\u0750-\u077F]/g,
  hebrew: /[\u0590-\u05FF]/g
};
function _pbpTrScriptCount(s, rx) { return (s.match(rx) || []).length; }

// text: a block's shielded (or plain) markdown -- placeholders are stripped
// before counting so they never dilute the ratio either way. targetCode:
// st.target.code (a dropdown ISO code like "zh-Hans"/"ar", or a custom
// free-text target, which never matches a branch below and correctly falls
// through to "never skip").
function pbpTrBlockIsTargetLang(text, targetCode) {
  const bare = String(text == null ? "" : text).replace(/⟦[CLIM]\d+⟧/g, "");
  const letters = _pbpTrScriptCount(bare, /\p{L}/gu);
  if (letters < PBP_TR_SCRIPT_MIN_LETTERS) return false;
  const base = String(targetCode || "").toLowerCase().split(/[-_]/)[0];
  const han = () => _pbpTrScriptCount(bare, PBP_TR_SCRIPT_RX.han);
  const kana = () => _pbpTrScriptCount(bare, PBP_TR_SCRIPT_RX.kana);
  const hangul = () => _pbpTrScriptCount(bare, PBP_TR_SCRIPT_RX.hangul);
  if (base === "zh") return (han() / letters) >= PBP_TR_SCRIPT_THRESHOLD && kana() === 0 && hangul() === 0;
  if (base === "ja") { const k = kana(); return k > 0 && ((han() + k) / letters) >= PBP_TR_SCRIPT_THRESHOLD; }
  if (base === "ko") return (hangul() / letters) >= PBP_TR_SCRIPT_THRESHOLD;
  if (base === "ru" || base === "uk" || base === "bg") return (_pbpTrScriptCount(bare, PBP_TR_SCRIPT_RX.cyrillic) / letters) >= PBP_TR_SCRIPT_THRESHOLD;
  if (base === "el") return (_pbpTrScriptCount(bare, PBP_TR_SCRIPT_RX.greek) / letters) >= PBP_TR_SCRIPT_THRESHOLD;
  if (base === "ar" || base === "fa" || base === "ur") return (_pbpTrScriptCount(bare, PBP_TR_SCRIPT_RX.arabic) / letters) >= PBP_TR_SCRIPT_THRESHOLD;
  if (base === "he") return (_pbpTrScriptCount(bare, PBP_TR_SCRIPT_RX.hebrew) / letters) >= PBP_TR_SCRIPT_THRESHOLD;
  return false; // Latin targets + unrecognized/custom codes: never skip (see file-header rationale)
}

// Localized language name for UI display (e.g. zh UI shows "简体中文", not the
// English "Simplified Chinese"). Uses the built-in Intl.DisplayNames (zero-dep);
// falls back to the English name for custom/free-text targets Intl can't resolve
// (of() returns the code unchanged for unknown-but-valid codes, throws for malformed).
// NOTE: display only — the prompt still sends the English `name`.
function _pbpTrLocalizedLangName(code, fallbackName, uiLang) {
  try {
    if (typeof Intl !== "undefined" && Intl.DisplayNames) {
      const out = new Intl.DisplayNames([uiLang || "en"], { type: "language" }).of(code);
      if (out && out !== code) return out;
    }
  } catch (_) { /* invalid code / unsupported API: fall through to fallback */ }
  return fallbackName || code;
}

function pbpTrResolveTargetLang(s, uiLang) {
  const v = String((s && s.translateTargetLang) || "auto").trim() || "auto";
  const code = v === "auto" ? String(uiLang || "en") : v;
  const name = PBP_TR_LANG_NAMES[code] || code;
  return { code, name, display: _pbpTrLocalizedLangName(code, name, uiLang) };
}

// Export composition (window.pbpViewMarkdown): items = [{orig, tr|null}]
// in document order over ALL blocks (pre blocks carry tr:null).
// bilingual -> orig + tr interleaved; translated -> tr with orig fallback.
function pbpTrComposeView(mode, items) {
  const parts = [];
  for (const it of (items || [])) {
    const orig = (it && it.orig) ? String(it.orig) : "";
    const tr = (it && typeof it.tr === "string" && it.tr.trim()) ? it.tr : null;
    if (mode === "bilingual") {
      if (orig) parts.push(orig);
      if (tr) parts.push(tr);
    } else {
      const pick = tr || orig;
      if (pick) parts.push(pick);
    }
  }
  return parts.join("\n\n");
}

// Forum translated-view export: pbpTrComposeView joins the FLAT block index, which
// loses comment nesting (each comment's own md concatenated at top level). For forum
// pages we serialize the already-nested rendered DOM instead — turndown yields the same
// nested blockquotes as canonicalMarkdown, with each comment's .pb-tr translation inline
// — so the download matches the on-screen preview. Reuses _pbpAiKatexPrepass (rendered
// KaTeX -> $tex$) for math fidelity, drops failure pills, and in translated-only mode
// drops the translated originals (mirrors the tr-only CSS, which hides [data-pb-tr-done]).
function _pbpTrSerializeForumView(mode) {
  const view = document.getElementById("rendered-view");
  if (!view) return "";
  const clone = view.cloneNode(true);
  _pbpAiKatexPrepass(clone);
  clone.querySelectorAll(".pb-tr-err").forEach((e) => e.remove());
  // Image-fix rows are UI, not content: this serializer walks the live DOM (not
  // canonical markdown), so without this their button text would land in the
  // exported forum markdown (Codex design review).
  clone.querySelectorAll(".pbp-img-fix-ui").forEach((e) => e.remove());
  if (mode !== "bilingual") {
    clone.querySelectorAll("[data-pb-tr-done]").forEach((e) => e.remove());
  }
  return htmlToMarkdown(clone.innerHTML).trim();
}

// ---- Shared overlay positioning helper: for a fixed-position overlay that
// renders OUTSIDE #rendered-view (so it can't measure the block/pop through
// the DOM) -- callers pass the already-measured numbers instead. Prefers
// ABOVE the anchor block; flips BELOW when there isn't enough clearance
// above the viewport top. Deliberately does NOT clamp against viewportH on
// the "below" branch (both-tight still takes below -- no viewport-bottom
// clamping logic nobody asked for). blockRect only needs {top, bottom}: a
// real getBoundingClientRect() works, so does a plain test fixture.
function pbpTrPeekPopPos(blockRect, popH, viewportH) {
  const above = blockRect.top - popH - 8;
  if (above < 8) return { top: blockRect.bottom + 8, place: "below" };
  return { top: above, place: "above" };
}

// ---- Typing-context gate for global single-key shortcuts (spec sec.2
// gate 1): true when a key like "v" should reach the field instead of
// firing a page shortcut. tagName: e.g. document.activeElement.tagName
// (or null/undefined); isContentEditable: document.activeElement
// .isContentEditable (already boolean; callers coerce with !! anyway).
function pbpTrIsTypingContext(tagName, isContentEditable) {
  if (isContentEditable) return true;
  const tag = String(tagName || "").toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

// Shared gate for bare-letter shortcuts owned by the rendered reader. Caps
// Lock remains compatible because the generated uppercase key has
// shiftKey=false; an actual Shift chord is rejected with the other modifiers.
function pbpTrSingleKeyAllowed(event, tagName, isContentEditable, rawActive) {
  if (!event || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || rawActive) return false;
  return !pbpTrIsTypingContext(tagName, isContentEditable);
}

function pbpTrNextMode(mode) {
  if (mode === "original") return "bilingual";
  if (mode === "bilingual") return "translated";
  return "original";
}

// Pick the first visible reading unit from an already document-ordered list.
// Unlike pbpReaderPickScrollAnchor, each entry carries the canonical block id
// and whether the reader is inside its original or translated side.
function pbpTrViewAnchorPick(candidates) {
  if (!Array.isArray(candidates)) return null;
  const valid = candidates.filter((r) => r && Number.isFinite(r.top) && Number.isFinite(r.bottom) && r.bottom > r.top);
  if (!valid.length) return null;
  const r = valid.find((x) => x.bottom > 0) || valid[valid.length - 1];
  const h = r.bottom - r.top;
  return {
    n: Number(r.n),
    side: r.side === "tr" ? "tr" : "orig",
    frac: Math.min(Math.max(-r.top / h, 0), 1)
  };
}

function pbpTrViewAnchorTarget(orig, mode, side) {
  if (!orig) return null;
  const sibling = orig.nextElementSibling;
  const tr = sibling && sibling.classList && sibling.classList.contains("pb-tr") ? sibling : null;
  if (mode === "translated") return tr || orig;
  if (mode === "bilingual" && side === "tr") return tr || orig;
  return orig;
}

// ============================================================
// DOM / UI layer. Lazily mounted: pbpTrInit runs on "pbp:rendered",
// builds the rail section only when gating passes; everything heavier
// (view toggle) mounts on first use. document.getElementById style
// (md-preview pages do not load shared.js's $id).
// ============================================================

const PBP_TR_ERR_SVG = typeof PBP_ICONS !== "undefined" ? PBP_ICONS.warning : "";
// Alias of the shared refresh icon. typeof-guarded: the pure top section of
// this file is loaded by file:// test pages without shared.js.
const PBP_TR_RETRY_SVG = typeof PBP_ICONS !== "undefined" ? PBP_ICONS.refresh : "";
const PBP_TR_BTN_SVG = typeof PBP_ICONS !== "undefined" ? PBP_ICONS.translate : "";

let _pbpTrState = null;

// EPUB export (Task 6, md-preview.js): raw translateTargetLang setting behind
// the current run's state, or "" when translation hasn't initialized / the
// user left it on "auto" (auto substitutes the UI language at resolve time --
// not a real target for dc:language, so the caller falls back to "und").
window.pbpTrExportTargetLang = () => (_pbpTrState && _pbpTrState.s && _pbpTrState.s.translateTargetLang
  && _pbpTrState.s.translateTargetLang !== "auto") ? _pbpTrState.s.translateTargetLang : "";

// tr-only escape hatch: shared by the click and keydown delegated listeners
// in pbpTrInit (audit md-translate.js:524). No-op outside tr-only mode.
// Returns true iff it actually toggled the peek, so the keydown listener
// only preventDefault()s when it's actually consuming the key (otherwise a
// stray Enter/Space on e.g. a link inside the block would lose its default
// action for no reason).
function _pbpTrPeekToggle(target) {
  if (!document.body.classList.contains("tr-only")) return false;
  const tr = target.closest(".pb-tr");
  if (!tr || target.closest("a")) return false;      // never hijack links
  const orig = tr.previousElementSibling;
  if (!orig || !orig.dataset || !orig.dataset.pb) return false;
  orig.classList.toggle("pb-show-orig");
  return true;
}

// The peek is only a real affordance in tr-only mode (click/Enter/Space are
// a no-op otherwise, per _pbpTrPeekToggle above) -- so role/tabindex/title
// only apply there; elsewhere they'd be a misleading tab stop / hover hint
// (audit md-translate.js:524). Called both when a .pb-tr is (re)filled and
// whenever the view mode changes (_pbpTrSetMode), so late-created blocks
// pick up the right state too.
function _pbpTrApplyPeekAttrs(div) {
  if (document.body.classList.contains("tr-only")) {
    div.setAttribute("role", "button");
    div.setAttribute("tabindex", "0");
    div.title = t("trShowOriginal");
  } else {
    div.removeAttribute("role");
    div.removeAttribute("tabindex");
    div.removeAttribute("title");
  }
}

async function pbpTrInit(detail) {
  const view = document.getElementById("rendered-view");
  if (!view || _pbpTrState) return;
  const s = await pbpAiGetSettings();
  if (!pbpAiAvailable(s)) return; // master switch off or no key: zero UI
  const uiLang = uiLangToBCP47();
  const target = pbpTrResolveTargetLang(s, uiLang);
  if (_pbpTrShouldHideEntry(view.lang || "", target.code)) return;
  if (!pbpAiBlocks().length) pbpAiIndexBlocks(view);

  const st = _pbpTrState = {
    s,
    url: String((detail && detail.url) || ""),
    title: String((detail && detail.title) || ""),
    account: String((detail && detail.account) || ""),
    articleLang: view.lang || "",  // detectArticleLang result (md-preview.js:1562); "" for Latin/ambiguous
    target,
    // pbpAiEffectiveModel (not just the override): with no preview override,
    // switching the provider's configured model must invalidate translation/
    // glossary caches too — same defect skim's cache meta had.
    modelKey: (s.aiProvider || "gemini") + ":" + ((typeof pbpAiEffectiveModel === "function")
      ? pbpAiEffectiveModel(s) : (pbpAiResolveModelOverride(s) || "default")),
    work: [],                      // non-pre blocks: {n, md, hash, shielded:{text,slots}}
    workReady: null,               // Promise: resolves once the rAF-chunked st.work build finishes
    trMd: Object.create(null),     // n -> RESTORED translated markdown (export + TOC)
    mode: "original",
    status: "idle",
    running: false,
    ctrl: null,
    glossaryHits: Object.create(null),
    permissionError: null
  };
  // Cheap pre-gate + cost estimate WITHOUT Turndown: any non-pre block carrying text is
  // a translation candidate; sum its textContent length as the rough char count for the
  // estimate. The precise st.work (pbpAiMdOf = Turndown per block) is built off the
  // first-paint critical path below (audit #2), so nothing here blocks the first frame.
  const cand = pbpAiBlocks().filter((b) => b.tag !== "pre" && (b.el.textContent || "").trim());
  if (!cand.length) return;
  // T3 cost-estimate pre-gate: a cheap heuristic on raw textContent (no Turndown/
  // shield yet -- st.work isn't built here) so the pre-run cost estimate already
  // reflects blocks the queue-build skip (_pbpTrApplySkips, below) will exclude.
  // Best-effort only; the authoritative per-block decision runs on shielded text
  // once st.work exists.
  st.approxChars = cand.reduce((a, b) => {
    const txt = b.el.textContent || "";
    return pbpTrBlockIsTargetLang(txt, target.code) ? a : a + txt.length;
  }, 0);
  _pbpTrBuildSection(st);

  // Refresh the rail label live when the user changes the target language in options.
  // Area is dynamic (sync or local per optSyncEnabled); pass newValue directly to
  // bypass the memoized stale pbpAiGetSettings promise.
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if ((area !== "sync" && area !== "local") || !changes.translateTargetLang) return;
      const next = { translateTargetLang: changes.translateTargetLang.newValue };
      // Don't swap target mid-run (mixes languages + mis-keys the end-of-run cache);
      // stash it and apply once the run settles (see _pbpTrStart tail).
      if (st.running) { st.pendingLangChange = next; return; }
      _pbpTrApplyTargetLang(st, next).catch(() => {});
    });
  }

  // tr-only escape hatch: click OR keyboard (Enter/Space, when the block is
  // focusable in tr-only mode — see _pbpTrApplyPeekAttrs) a translated block
  // to peek at its original (audit md-translate.js:524).
  view.addEventListener("click", (e) => _pbpTrPeekToggle(e.target));
  view.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    // Only consume the key (and stop Space from scrolling the page) when the
    // peek actually fires -- otherwise this must not swallow Enter/Space on
    // e.g. a focusable link inside the block.
    if (_pbpTrPeekToggle(e.target)) e.preventDefault();
  });
  // Page close terminates every in-flight request (error matrix last row).
  window.addEventListener("pagehide", () => { if (st.ctrl) st.ctrl.abort(); });
  // ZH-0 §5: pagehide's IDB transaction rarely completes before teardown, so
  // it stays abort-only. visibilitychange->hidden fires earlier (page still
  // alive) and is the honest best-effort flush point; the guarantee is "at
  // most the last <8 blocks / 5s window is lost", not "zero loss".
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") _pbpTrFlushCache(st);
  });

  // ZH-2: track which block sits at the viewport top, as a block NUMBER.
  // passive + rAF-merged, one elementFromPoint per frame (no batched rects --
  // the FluentRead report's autoUpdate-every-frame idle burn is the named
  // anti-pattern here). A miss (rail, margins, between blocks) keeps the last
  // good reading; .pb-tr siblings map back to their block via data-pb-tr.
  let viewTrackPending = false;
  window.addEventListener("scroll", () => {
    if (viewTrackPending) return;
    viewTrackPending = true;
    requestAnimationFrame(() => {
      viewTrackPending = false;
      const rect = view.getBoundingClientRect();
      const x = Math.max(0, Math.min(window.innerWidth - 1, rect.left + rect.width / 2));
      const el = document.elementFromPoint(x, 1);
      const hit = el && el.closest && (el.closest("[data-pb]") || el.closest(".pb-tr"));
      if (hit) {
        const n = Number(hit.dataset.pb || hit.dataset.pbTr);
        if (Number.isFinite(n) && n > 0) st.viewTopBlock = n;
      }
    });
  }, { passive: true });

  // Bare translation shortcuts share one modifier/typing/raw-view gate.
  document.addEventListener("keydown", (e) => {
    const key = String(e.key || "").toLowerCase();
    if (key !== "t" && key !== "v") return;
    const ae = document.activeElement;
    if (!pbpTrSingleKeyAllowed(e, ae && ae.tagName, !!(ae && ae.isContentEditable),
      document.body.classList.contains("raw-active"))) return;
    if (key === "t") {
      if (!document.getElementById("tr-section")) return;
      e.preventDefault();
      _pbpTrTrigger(st);
      return;
    }
    if (!document.getElementById("tr-view-toggle")) return;
    e.preventDefault();
    _pbpTrSetMode(st, pbpTrNextMode(st.mode), true);
  });

  // Build st.work OFF the first-paint critical path, then probe the cache. pbpAiMdOf()
  // runs Turndown per block; synchronously here it was a single long task right after the
  // first frame on forum pages (hundreds of comment blocks) — audit #2. Chunk the build
  // across rAF so the article paints first. The load-time cache probe HARD-depends on
  // every block's hash (pbpAiHash(pbpAiMdOf(n))), so it can't move to first-Translate-
  // click without losing no-network cache restore (finding #5); hence idle chunking here.
  st.workReady = _pbpTrBuildWork(st, cand).then(() => {
    if (!st.work.length) { const sec = document.getElementById("tr-section"); if (sec) sec.remove(); return; }
    return _pbpTrProbeCache(st);
  }).then(() => {
    _pbpTrApplySkips(st);
  }).catch(() => {});
}

// Build st.work in rAF-yielded chunks so a long article's per-block Turndown pass
// (pbpAiMdOf) doesn't block the first paint. Resolves when every candidate is done.
const PBP_TR_WORK_CHUNK = 20;
function _pbpTrBuildWork(st, cand) {
  return new Promise((resolve) => {
    const raf = (typeof requestAnimationFrame === "function") ? requestAnimationFrame : (fn) => setTimeout(fn, 0);
    let i = 0;
    const step = () => {
      const end = Math.min(i + PBP_TR_WORK_CHUNK, cand.length);
      for (; i < end; i++) {
        const b = cand[i];
        const md = pbpAiMdOf(b.n);
        if (!md.trim()) continue;
        const shielded = pbpAiShield(md);
        if (!_pbpTrHasText(shielded.text)) continue;   // image/badge/logo wall: nothing to translate
        st.work.push({ n: b.n, md, hash: pbpAiHash(md), shielded });
      }
      if (i < cand.length) raf(step); else resolve();
    };
    raf(step);
  });
}

// Cache probe (partial-hit aware): full hit -> zero requests + restore the remembered
// view; partial hit -> fill what we have, button says Continue. Runs after st.work built.
async function _pbpTrProbeCache(st) {
  try {
    const cached = await pbpTrCacheGet(st.url, st.target.code, st.modelKey, st.account);
    if (cached) {
      st.cacheMeta = cached.meta;   // may be undefined (legacy entry); consumed by _pbpTrEnsureGlossary (ag)
      // ZH-1b D10: classify the entry's generation record against the current
      // world (prompt generation + THIS article's user-glossary hit subset).
      // Computable here because st.work is built before the probe runs; a
      // legacy meta-less entry classifies to null and stays silent.
      st.staleVerdict = pbpTrCacheGenStale(cached.meta, {
        pg: PBP_TR_PROMPT_GEN,
        gf: pbpTrGlossaryFingerprint(pbpTrMatchGlossary(
          pbpTrParseGlossary(st.s.translateGlossary),
          st.work.map((w) => ({ text: w.shielded.text }))))
      });
      _pbpTrSyncStaleNote(st);
      let hits = 0;
      for (const w of st.work) {
        const ttext = cached.blocks[w.hash];
        if (typeof ttext === "string") { _pbpTrFill(st, w, ttext); hits++; }
      }
      if (hits === st.work.length) {
        _pbpTrSetStatus(st, "done");
        _pbpTrShowViewToggle(st);
        const v = await pbpTrViewGet(st.url, st.account);
        if (v && v.lang === st.target.code && (v.mode === "bilingual" || v.mode === "translated")) {
          _pbpTrSetMode(st, v.mode, false);
          if (st.railHandle) st.railHandle.expand(true); // restored to bilingual/translated -> auto-expand (temp)
        }
      } else if (hits > 0) {
        _pbpTrSetStatus(st, "partial");
        _pbpTrShowViewToggle(st);
      }
    }
  } catch (_) {}
}

// T3: mark every st.work block already written in the target script as
// "translated" with its OWN original markdown -- no request, no .pb-tr DOM
// (the bilingual view would otherwise show the same text twice), no IDB
// write (spec 3: detection is cheap and deterministic, recompute every run
// rather than risk an "original cached as translation" entry surviving a
// later target-language change). A cache hit (or an already-real
// translation) always wins: skip detection never overwrites an existing
// st.trMd entry. st.skippedSet is cumulative across calls -- pbpTrInit calls
// this once after the cache probe, _pbpTrStart calls it again on every
// run/Continue click (so a language change picked up between calls is
// honoured) -- so a block already marked skipped is never re-counted.
function _pbpTrApplySkips(st) {
  const set = st.skippedSet || (st.skippedSet = new Set());
  for (const w of st.work) {
    if (w.n in st.trMd) continue;
    if (pbpTrBlockIsTargetLang(w.shielded.text, st.target.code)) {
      st.trMd[w.n] = w.md;
      set.add(w.n);
    }
  }
  st.skippedCount = set.size;
  const note = document.getElementById("tr-skip-note");
  if (!note) return;
  if (st.skippedCount > 0) {
    note.textContent = t("trSkippedTargetLang", String(st.skippedCount));
    note.hidden = false;
  } else {
    note.hidden = true;
    note.textContent = "";
  }
}

function _pbpTrBuildSection(st) {
  const rail = document.getElementById("rail");
  const anchor = rail ? rail.querySelector(".view-toggle") : null;
  if (!anchor || document.getElementById("tr-section")) return;
  const sec = document.createElement("div");
  sec.className = "rail-section";
  sec.id = "tr-section";

  const label = document.createElement("div");
  label.className = "rail-label";
  label.textContent = t("trTranslate");
  sec.appendChild(label);

  const row = document.createElement("div");
  row.className = "tr-row";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.id = "btn-translate";
  btn.className = "action-btn";
  btn.setAttribute("aria-keyshortcuts", "t");
  btn.title = t("trTranslate") + " (t)";
  btn.innerHTML = PBP_TR_BTN_SVG;                  // static inline SVG only
  const bl = document.createElement("span");
  bl.className = "btn-label";
  bl.textContent = t("trTranslate");
  btn.appendChild(bl);
  row.appendChild(btn);
  const stop = document.createElement("button");
  stop.type = "button";
  stop.id = "btn-tr-stop";
  stop.className = "action-btn";
  stop.textContent = t("trStop");
  stop.hidden = true;
  row.appendChild(stop);
  sec.appendChild(row);

  // Target-language hint + jump-to-settings. Translation always uses the language
  // configured in options (translateTargetLang); surface it BEFORE the first request
  // so the user knows what they'll get, and let them change it without hunting.
  const tgt = document.createElement("div");
  tgt.className = "tr-meta tr-target";
  const tgtText = document.createElement("span");
  tgtText.textContent = t("trTargetLang", st.target.display || st.target.name);
  st.tgtTextEl = tgtText;
  tgt.appendChild(tgtText);
  const tgtLink = document.createElement("button");
  tgtLink.type = "button";
  tgtLink.className = "tr-link";
  tgtLink.textContent = t("trChangeLang");
  tgtLink.addEventListener("click", () => {
    try {
      if (typeof pbpOpenOptionsTab === "function") pbpOpenOptionsTab("reader");
    } catch (_) { /* options page unavailable: no-op */ }
  });
  tgt.appendChild(tgtLink);
  sec.appendChild(tgt);

  // Cost transparency BEFORE the first request (spec 4.1): chars/4 x 2.
  const est = document.createElement("div");
  est.id = "tr-estimate";
  est.className = "tr-meta";
  const chars = st.approxChars || st.work.reduce((a, w) => a + w.shielded.text.length, 0);
  est.textContent = t("trEstCost", String(pbpAiEstimateTokens(chars) * 3),
    (st.s.aiProvider || "gemini") + "/" + (pbpAiResolveModelOverride(st.s) || "default"));
  sec.appendChild(est);

  // T3: "N blocks already in target language, skipped" -- a separate element
  // (not tr-progress) so it survives the translating/partial/done status text
  // swaps in _pbpTrSetStatus instead of being clobbered by them. Populated by
  // _pbpTrApplySkips; stays hidden (spec: "zero noise" when nothing is skipped).
  const skipNote = document.createElement("div");
  skipNote.id = "tr-skip-note";
  skipNote.className = "tr-meta";
  skipNote.hidden = true;
  sec.appendChild(skipNote);

  // ZH-1b: "this cached translation predates your current glossary/prompt"
  // line. Same .tr-meta family as the skip note; populated by
  // _pbpTrSyncStaleNote after the cache probe (never mid-run).
  const staleNote = document.createElement("div");
  staleNote.id = "tr-stale-note";
  staleNote.className = "tr-meta";
  staleNote.hidden = true;
  sec.appendChild(staleNote);

  const glossaryHits = document.createElement("details");
  glossaryHits.id = "tr-glossary-hits";
  glossaryHits.className = "tr-meta tr-glossary";
  glossaryHits.hidden = true;
  sec.appendChild(glossaryHits);

  const prog = document.createElement("div");
  prog.id = "tr-progress";
  prog.className = "tr-meta";
  prog.setAttribute("role", "status");
  prog.setAttribute("aria-live", "polite");
  prog.hidden = true;
  sec.appendChild(prog);

  const retryAll = document.createElement("button");
  retryAll.type = "button";
  retryAll.id = "tr-retry-all";
  retryAll.hidden = true;
  retryAll.innerHTML = PBP_TR_RETRY_SVG;               // static inline SVG only (no emoji)
  const raLab = document.createElement("span");
  raLab.textContent = t("trRetryAllFailed");
  retryAll.appendChild(raLab);
  retryAll.addEventListener("click", () => { _pbpTrRetryAllFailed(st).catch(() => {}); });
  prog.insertAdjacentElement("afterend", retryAll);

  // Rail accordion (spec 2026-07-04): install AFTER every direct child above
  // exists (pbpRailCollapsible's CSS-driven hide covers whatever's already
  // in `sec` at install time PLUS anything appended to `sec` later, e.g.
  // _pbpTrShowViewToggle's view-toggle wrap and _pbpTrRenderUsage's #tr-usage
  // line below -- both still land as direct children of `sec`).
  // EN-5: a non-empty detected article language means the reader landed on a
  // CJK/RTL article where translation is typically the point of opening the
  // page -- default the section EXPANDED. detectArticleLang "" (Latin or
  // ambiguous) keeps the collapsed default. Users who ever toggled the section
  // keep their stored choice (pbpRailCollapseState prefers the stored
  // boolean), applied by the async storage catch-up -- so when their stored
  // choice differs from this default, they see pbpRailCollapsible's existing
  // one-visible-retoggle on first paint (review finding #5: previously the tr
  // default was constant so a stored "collapsed" could never disagree with it
  // on CJK pages; accepted as that engine's documented catch-up behavior).
  // Accepted side effect: a zh reader opening a ja/ko article also defaults
  // expanded -- the same "translation is the main purpose" situation, not a
  // bug. Never auto-translates: expanding costs zero tokens.
  st.railHandle = pbpRailCollapsible(sec, "tr", { label, defaultCollapsed: !st.articleLang });

  anchor.insertAdjacentElement("afterend", sec);
  btn.addEventListener("click", () => { _pbpTrTrigger(st); });
  stop.addEventListener("click", () => { if (st.ctrl) st.ctrl.abort(); });
}

// One launch chain for the button and t. Expanding a completed section is
// useful, but must not re-enter translation or consume more tokens.
function _pbpTrTrigger(st) {
  if (st.running) return;
  if (st.railHandle) st.railHandle.expand(true);
  if (st.status === "done") {
    // ZH-1b: a completed-but-stale (or mixed) translation re-arms the button
    // as an explicit, priced retranslate; a current one stays inert.
    if (!st.staleVerdict) return;
    _pbpTrRetranslate(st).catch(() => {
      st.running = false;
      const doneAll = st.work.every((w) => (w.n in st.trMd));
      _pbpTrSetStatus(st, doneAll ? "done" : "partial");
    });
    return;
  }
  _pbpTrStart(st).catch(() => {
    // Unexpected rejection (setup error etc.): never leave the UI stuck on
    // "翻译中". Reset run flag and settle to a terminal status the user can act on.
    st.running = false;
    const doneAll = st.work.every((w) => (w.n in st.trMd));
    _pbpTrSetStatus(st, doneAll ? "done" : "partial");
  });
}

// ZH-1b: full retranslate of a stale/mixed cached translation. Gate D11: the
// rerun must END as a single-generation entry, and the cache's append
// transform MERGES meta (gens would become [old, current] = permanently
// "mixed") -- so the stale entry is dropped first; the rerun's writes then
// create a fresh entry whose gens hold only the current generation. The user
// explicitly asked to redo the whole article, so discarding the stale blocks
// is the point, not a loss.
async function _pbpTrRetranslate(st) {
  try { await pbpAiCacheDelete(_pbpTrCacheKey(st.url, st.target.code, st.modelKey, st.account)); } catch (_) {}
  _pbpTrResetTranslations(st);
  await _pbpTrStart(st);
}

// T4: if the provider didn't emit usage for this call, estimate it (chars/4)
// from the sent shielded text and the received model output, and flag approx.
// `full` is the raw model output (translate JSON envelope) = the tokens the model
// actually produced, so full.length/4 is the honest output-token proxy.
function _pbpTrUsageFallback(st, gotReal, sentChars, full) {
  if (!st.usage || gotReal) return;
  st.usage.approx = true;
  st.usage.inTok += pbpAiEstimateTokens(sentChars);
  st.usage.outTok += pbpAiEstimateTokens((full || "").length);
}

// T4: render the run's actual token usage in tr-section (session-only, never
// persisted). When any batch fell back to an estimate, prefix the U+2248 ALMOST
// EQUAL TO sign — it is TEXT (renders in the body font), NOT an icon glyph, so the
// emoji/dingbat font-fallback ban does not apply. Written as a \u escape in code.
function _pbpTrRenderUsage(st) {
  const sec = document.getElementById("tr-section");
  if (!sec || !st.usage) return;
  let el = document.getElementById("tr-usage");
  if (!el) {
    el = document.createElement("div");
    el.id = "tr-usage";
    el.className = "tr-meta";
    const prog = document.getElementById("tr-progress");
    if (prog) prog.insertAdjacentElement("afterend", el); else sec.appendChild(el);
  }
  const line = t("trActualUsage", String(st.usage.inTok), String(st.usage.outTok));
  el.textContent = st.usage.approx ? "\u2248 " + line : line;
  el.hidden = false;
}

function _pbpTrRenderGlossaryHits(st) {
  const el = document.getElementById("tr-glossary-hits");
  if (!el) return;
  const hits = st && st.glossaryHits ? st.glossaryHits : Object.create(null);
  const terms = Object.keys(hits).sort((a, b) => a.localeCompare(b));
  if (!terms.length) {
    el.hidden = true;
    el.replaceChildren();
    el.removeAttribute("title");
    return;
  }
  const wasOpen = el.open;
  const summary = document.createElement("summary");
  summary.textContent = t("translateGlossaryLabel") + " · " + terms.length;
  const list = document.createElement("dl");
  list.className = "tr-glossary-list";
  for (const term of terms) {
    const row = document.createElement("div");
    const source = document.createElement("dt");
    const target = document.createElement("dd");
    source.textContent = term;
    target.textContent = hits[term] || term;
    row.append(source, target);
    list.appendChild(row);
  }
  el.replaceChildren(summary, list);
  el.open = wasOpen;
  el.removeAttribute("title");
  el.hidden = false;
}

function _pbpTrAddGlossaryHits(st, glossary) {
  if (!st || !glossary) return;
  const terms = Object.keys(glossary);
  if (!terms.length) return;
  if (!st.glossaryHits) st.glossaryHits = Object.create(null);
  for (const term of terms) st.glossaryHits[term] = glossary[term];
  _pbpTrRenderGlossaryHits(st);
}

// ZH-1b: reflect st.staleVerdict in the rail. Wording deliberately says the
// translation comes from an older version, NOT that it "should have been
// stable" (ZH-6's companion rule: translations are not stable across reruns
// even today -- temperature, gloss_ eviction, summary expiry).
function _pbpTrSyncStaleNote(st) {
  const note = document.getElementById("tr-stale-note");
  if (!note) return;
  if (!st || !st.staleVerdict) { note.hidden = true; note.textContent = ""; return; }
  note.textContent = t(st.staleVerdict === "mixed" ? "trStaleMixed" : "trStaleNote");
  note.hidden = false;
}

// Drop every translation-derived piece of state so the page can be translated
// afresh: filled markdown + DOM, glossary (both halves), run-derived cache
// artifacts (flush buffer / run meta / probed cacheMeta -- the review-batch
// lesson: these are language- and generation-keyed and must never outlive the
// state they were derived from), skip verdicts, stale verdict, highlights'
// tr layer, and the view mode. Shared by the target-language switch and the
// ZH-1b retranslate path.
function _pbpTrResetTranslations(st) {
  st.glossary = null;
  st.glossaryAuto = null;
  st.trMd = Object.create(null);
  st.glossaryHits = Object.create(null);
  if (st.flushBuf) st.flushBuf = Object.create(null);
  st.runMeta = undefined;
  st.cacheMeta = undefined;
  st.staleVerdict = null;
  _pbpTrRenderGlossaryHits(st);
  _pbpTrSyncStaleNote(st);
  st.skippedSet = new Set();      // T3: stale skip verdicts were computed for the OLD state
  st.skippedCount = 0;
  const skipNote = document.getElementById("tr-skip-note");
  if (skipNote) { skipNote.hidden = true; skipNote.textContent = ""; }
  document.querySelectorAll("#rendered-view .pb-tr").forEach((el) => el.remove());
  document.querySelectorAll("#rendered-view .pb-tr-err").forEach((el) => el.remove());
  document.querySelectorAll("#rendered-view [data-pb-tr-done]").forEach((el) => { delete el.dataset.pbTrDone; });
  // H5 (spec 1.3): the whole translated layer just vanished -- drop every
  // tr-side highlight range + regray its Notebook rows. typeof-guarded so
  // md-translate never hard-depends on md-highlight (spec 7.2).
  if (typeof window.pbpHlTrLayerCleared === "function") { try { window.pbpHlTrLayerCleared(); } catch (_) {} }
  _pbpTrSyncRetryAll();
  if (st.mode !== "original") _pbpTrSetMode(st, "original", false);
}

// Re-resolve target language from settings and update the rail label.
// `s` may be passed (test / storage-change fast path) or fetched.
// No-op-safe if the label element isn't mounted yet.
// ponytail: passes s from the onChanged event to bypass the memoized stale promise.
async function _pbpTrApplyTargetLang(st, s) {
  s = s || await pbpAiGetSettings();
  // ponytail: uiLangToBCP47 lives in i18n.js; isolated test harnesses may omit it, so ""
  // is fine since "auto" is the only code that reads uiLang, and tests pass an explicit code.
  const uiLang = typeof uiLangToBCP47 === "function" ? uiLangToBCP47() : "";
  const prevCode = st.target && st.target.code;
  st.target = pbpTrResolveTargetLang(s, uiLang);
  if (st.tgtTextEl) st.tgtTextEl.textContent = t("trTargetLang", st.target.display || st.target.name);
  if (st.target.code === prevCode) return;   // label refresh only: no real language change
  // Target language actually changed: every language-keyed derived state is now stale.
  // Drop the memoized (old-language) glossary, remove all filled translations + their
  // DOM (.pb-tr), done markers and failure pills, reset to Original view, and re-arm the
  // button so the page can be translated afresh into the new language. Cache/view keys
  // use st.target.code, so the next run reads the correct entries. ponytail: no cache
  // re-probe — clicking Translate re-requests; correctness only needs "can retranslate".
  // Review blocker #1 + findings #2/#4: the reset drops run-derived cache
  // artifacts too (flush buffer / runMeta / cacheMeta) -- a stale flush
  // buffer would be re-keyed under the NEW language by the next
  // visibilitychange flush, and st.cacheMeta.ag would inject the OLD
  // language's auto glossary into the new language's prompts.
  _pbpTrResetTranslations(st);
  _pbpTrSetStatus(st, "idle");
}

// Bounded-concurrency map: run fn over items, at most `limit` in flight, results
// in input order. (DOM-free; the Map half of a map-reduce over glossary chunks.)
async function _pbpTrMapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) { const i = next++; results[i] = await fn(items[i], i); }
  }
  const n = Math.min(limit || 1, Math.max(items.length, 1));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}

// Run the extraction pass over the full shielded article text. Returns a term map
// (possibly empty) on success, or null on failure (caller then uses user glossary only).
async function _pbpTrExtractGlossary(st) {
  const full = st.work.map((w) => w.shielded.text).join("\n\n");
  if (!full.trim()) return Object.create(null);   // no source text: a REAL empty table, cacheable
  const chunks = full.length <= PBP_TR_GLOSSARY_LIMIT
    ? [full]
    : _pbpTrSplitText(full, PBP_TR_GLOSSARY_LIMIT).chunks;
  const model = pbpAiResolveModelOverride(st.s);
  // Bounded fan-out (limit 2 = queue default; NOT naked Promise.all — 24k-char
  // chunks would blow TPM). Each chunk resolves to a term map on success (possibly
  // empty) or null on abort/error; a null chunk is dropped from the merge, the rest
  // still merge. The <=24000-char common case is a single chunk = one call.
  const outs = await _pbpTrMapLimit(chunks, 2, async (chunk) => {
    if (st.ctrl && st.ctrl.signal && st.ctrl.signal.aborted) return null;
    const { system, prompt } = pbpTrBuildGlossaryPrompt(chunk, st.target.name);
    try {
      const raw = await callAIStream(st.s, prompt, {
        system, model, temperature: 0.1, noThinking: true,
        signal: st.ctrl && st.ctrl.signal, maxTokens: 2048,
        // T4: fold real glossary-pass usage into the run total when the provider
        // emits it (no estimate fallback here — this pass is optional/often cached).
        onUsage: (u) => { if (st.usage) { st.usage.inTok += u.inTok; st.usage.outTok += u.outTok; } }
      }, () => {});
      return pbpTrParseGlossaryJson(raw);
    } catch (_) { return null; }
  });
  // All chunks failed/aborted -> null (a FAILURE the caller must not cache, per the
  // contract). At least one succeeded (even with zero terms) -> the merged map (a
  // real, cacheable vacuum table when empty). Distinguishing the two is the fix.
  let any = false;
  const merged = Object.create(null);
  for (const out of outs) { if (out) { any = true; Object.assign(merged, out); } }
  return any ? merged : null;
}

// Build st.glossary = merge(auto, user), once. auto = cached or freshly extracted;
// any failure degrades to user-only (never blocks translation).
async function _pbpTrEnsureGlossary(st) {
  if (st.glossary) return st.glossary;
  const user = pbpTrParseGlossary(st.s.translateGlossary);
  if (!_pbpTrGlossaryWorthIt(st)) {
    st.glossaryAuto = Object.create(null);   // a REAL empty auto table (extraction not applicable), cacheable as ag
    st.glossary = pbpTrMergeGlossary(st.glossaryAuto, user);
    return st.glossary;
  }
  let auto = null;
  try {
    if (st.cacheMeta && st.cacheMeta.ag && typeof st.cacheMeta.ag === "object") {
      // ZH-1a section 4 / ZH-6 condition 3: reuse the auto table this
      // article's cached translation was actually produced with -- survives
      // gloss_ eviction and avoids a nondeterministic re-extraction
      // mid-article. AUTO ONLY: the user table is re-read fresh below so user
      // edits are never frozen into the cache.
      auto = st.cacheMeta.ag;
    } else {
      auto = await pbpTrGlossaryCacheGet(st.url, st.target.code, st.modelKey, st.account);
      if (!auto) {
        auto = await _pbpTrExtractGlossary(st);
        if (auto) { try { await pbpTrGlossaryCacheSet(st.url, st.target.code, st.modelKey, auto, st.account); } catch (_) {} }
      }
    }
  } catch (_) { auto = null; }
  st.glossaryAuto = auto || null;   // null = extraction failed/degraded -> runMeta.ag omitted so a later run can retry
  st.glossary = pbpTrMergeGlossary(auto || Object.create(null), user);
  return st.glossary;
}

async function _pbpTrStart(st) {
  if (st.running) return;
  st.running = true;                       // claim the run synchronously so a double-click during
                                           // the rAF-chunked st.work build can't start two runs
  // Reset the run buffers FIRST (review blocker #1): st.flushBuf could hold a
  // previous run's residue, and everything between here and the queue launch
  // awaits (permission recovery / workReady / glossary extraction) -- a
  // visibilitychange flush inside any of those windows would write stale
  // blocks under whatever st.target currently says.
  st.newly = Object.create(null);          // blockHash -> shielded translation (end-of-run write)
  st.flushBuf = Object.create(null);       // ZH-0: pending incremental flush
  st.flushInflight = false;
  st.lastFlushTs = Date.now();
  if (st.permissionError) {
    const recovered = await pbpAiRetryWithPermission(st.permissionError, st.s, () => {});
    if (!recovered) { st.running = false; return; }
    st.permissionError = null;
  }
  if (st.workReady) await st.workReady;    // ensure the deferred st.work build finished
  _pbpTrApplySkips(st);                    // T3: re-detect every run -- target may have changed since init/last run
  const pending = st.work.filter((w) => !(w.n in st.trMd));
  if (!pending.length) { st.running = false; _pbpTrSetStatus(st, "done"); _pbpTrShowViewToggle(st); return; }
  _pbpTrClearPendingFailures(new Set(pending.map((w) => w.n)));
  st.ctrl = new AbortController();
  st.usage = { inTok: 0, outTok: 0, approx: false };   // T4: reset actual/estimated usage per run
  st.glossaryHits = Object.create(null);
  _pbpTrRenderGlossaryHits(st);
  pbpAiBumpCounter("translate");
  _pbpTrSetStatus(st, "translating");
  // Progressive display: reveal the view toggle and switch to bilingual NOW so
  // each .pb-tr appears the moment its block fills, instead of the user staring
  // at the original until the whole article finishes. Not persisted mid-run;
  // the final mode is persisted on completion below. (User may click Original
  // mid-run to opt out, or Translated-only.)
  _pbpTrShowViewToggle(st);
  if (st.mode === "original") _pbpTrSetMode(st, "bilingual", false);

  // Context enrichment: reuse the ALREADY-CACHED AI summary if present
  // (never generates one — strict user-invoked rule). Source mirrors the
  // md-preview source badge: "jina" | "local".
  let summary = "";
  try {
    const activeSeg = document.querySelector("#source-badge .src-seg.active");
    const source = (activeSeg && activeSeg.getAttribute("data-engine") === "jina") ? "jina" : "local";
    summary = (await getAICache(st.url, "summary", st.s.aiCacheDuration, source, st.account, st.s)) || "";
  } catch (_) {}
  const prog0 = document.getElementById("tr-progress");
  if (prog0) prog0.textContent = t("trExtracting");
  await _pbpTrEnsureGlossary(st);
  // ZH-1a: the run's cache meta, computed once here (deterministic, known
  // before the first request) and attached to every cache write of this run
  // (incremental flushes included). gf covers only the USER glossary subset
  // that hits THIS article: pbpTrMatchGlossary is pure substring matching, so
  // the document-level hit set equals the union of per-batch hit sets, and
  // "gf changed" <=> "the user terms actually injected into this article
  // changed" -- a whole-table fingerprint would false-alarm whenever the user
  // edits a term for some OTHER article.
  const userTable = pbpTrParseGlossary(st.s.translateGlossary);
  st.runMeta = {
    pg: PBP_TR_PROMPT_GEN,
    gf: pbpTrGlossaryFingerprint(pbpTrMatchGlossary(userTable, st.work.map((w) => ({ text: w.shielded.text })))),
    sm: summary ? 1 : 0
  };
  if (st.glossaryAuto) st.runMeta.ag = st.glossaryAuto;
  const model = pbpAiResolveModelOverride(st.s);
  const baseArgs = { targetLanguage: st.target.name, targetCode: st.target.code, title: st.title, summary };
  // pbpAiEstimateTokens is chars/4, a Latin calibration, and it was being fed
  // the SOURCE length to size the OUTPUT. That under-provisions by exactly the
  // expansion factor when the source is CJK, and the value goes straight to
  // each provider's hard max_tokens, so the translation is cut off mid-block
  // rather than failing loudly. Size the estimate off the projected output
  // instead. Over-provisioning is close to free: max_tokens is a ceiling, not
  // a charge.
  const streamOpts = (sourceText) => {
    const chars = String(sourceText || "").length;
    const projected = chars * (1 + 3.5 * pbpTrCjkShare(sourceText));
    return {
      system: "", model, signal: st.ctrl.signal,
      temperature: 0.1, noThinking: true,
      maxTokens: Math.min(8192, Math.max(1024, pbpAiEstimateTokens(projected) * 3))
    };
  };

  const requestBatch = (segments, onItem) => {
    const glossary = pbpTrMatchGlossary(st.glossary, segments);
    _pbpTrAddGlossaryHits(st, glossary);
    const { system, prompt } = pbpTrBuildPrompt({ ...baseArgs, glossary, segments });
    const parser = pbpAiMakeStreamJsonParser(onItem);
    const sentChars = segments.reduce((a, x) => a + x.text.length, 0);
    const opts = streamOpts(segments.map((x) => x.text).join("\n"));
    opts.system = system;
    const u = { got: false };            // T4: did the provider report real usage for this batch?
    opts.onUsage = (usage) => { u.got = true; st.usage.inTok += usage.inTok; st.usage.outTok += usage.outTok; };
    const key = "tr:" + st.modelKey + ":" + st.target.code + ":" + segments.map((x) => x.id).join(",");
    return getOrCreateInflight(key, () =>
      callAIStream(st.s, prompt, opts, (d, acc) => parser.push(acc))
    ).then((full) => { _pbpTrUsageFallback(st, u.got, sentChars, full); return parser.finish(full); });
  };
  const requestSingle = async (seg) => {
    const glossary = pbpTrMatchGlossary(st.glossary, [seg]);
    _pbpTrAddGlossaryHits(st, glossary);
    const { system, prompt } = pbpTrBuildPrompt({ ...baseArgs, glossary, segments: [seg] });
    let got = null;
    const parser = pbpAiMakeStreamJsonParser((it) => { if (it.id === seg.id) got = it.text; });
    const opts = streamOpts(seg.text);
    opts.system = system;
    const u = { got: false };            // T4
    opts.onUsage = (usage) => { u.got = true; st.usage.inTok += usage.inTok; st.usage.outTok += usage.outTok; };
    const full = await callAIStream(st.s, prompt, opts, (d, acc) => parser.push(acc));
    _pbpTrUsageFallback(st, u.got, seg.text.length, full);
    parser.finish(full);
    return got;
  };

  const byId = new Map(st.work.map((w) => [w.n, w]));
  // Sub-split oversize blocks into parts so no single request truncates at the
  // output cap. Each part is its own queued segment (part 0 reuses the block id
  // n; later parts get fresh ids past max(n)); parts reassemble in order with
  // their original separators into the block's full translation.
  const segMap = new Map();                          // segId -> {n, idx, parts}
  const partBuf = new Map();                         // n -> {chunks:Array, seps:[]}
  const segs = [];
  // Base fresh part ids past EVERY block id (st.work, not just pending) so a
  // part id can never collide with an already-cached block's id in byId.
  let nextSegId = st.work.reduce((m, w) => Math.max(m, w.n), 0) + 1;
  for (const w of pending) {
    if (w.shielded.text.length <= PBP_TR_PART_LIMIT) {
      segs.push({ id: w.n, text: w.shielded.text });
      segMap.set(w.n, { n: w.n, idx: 0, parts: 1 });
    } else {
      const split = _pbpTrSplitText(w.shielded.text, PBP_TR_PART_LIMIT);
      partBuf.set(w.n, _pbpTrMakePartBuf(split));
      split.chunks.forEach((chunk, idx) => {
        const id = idx === 0 ? w.n : nextSegId++;
        segs.push({ id, text: chunk });
        segMap.set(id, { n: w.n, idx, parts: split.chunks.length });
      });
    }
  }
  // ZH-2: batches stay packed in document order; the claim callback only
  // reorders which one a worker takes next. Fresh runs read st.viewTopBlock
  // AT CLAIM TIME (the user keeps reading while batches run); continue runs
  // pin the anchor to the first untranslated block inside pbpTrRunAnchor
  // (mandatory condition 1 -- see that function's comment). Part ids map
  // back to real block numbers via segMap.
  const batchesPacked = pbpTrPackBatches(segs);
  const pendingNs = pending.map((w) => w.n);
  const batchBlockNs = batchesPacked.map((b) => b.map((seg) => {
    const m = segMap.get(seg.id);
    return m ? m.n : seg.id;
  }));
  const queueResult = await pbpTrRunQueue({
    targetCode: st.target.code,
    describeError: (e) => pbpAiErrorText(e),
    batches: batchesPacked,
    claim: (remaining) => pbpTrPickBatch(remaining, batchBlockNs,
      pbpTrRunAnchor(pendingNs, st.work.length, st.skippedCount || 0, st.viewTopBlock)),
    requestBatch, requestSingle, signal: st.ctrl.signal,
    onFill: (id, text) => {
      const m = segMap.get(id);
      if (!m) return;
      const w = byId.get(m.n);
      if (!w) return;
      if (m.parts === 1) { _pbpTrFill(st, w, text); _pbpTrRecordFill(st, w, text); return; }
      const pb = partBuf.get(m.n);
      if (!pb) return;
      _pbpTrPartFill(pb, m.idx, text);
      const done = _pbpTrPartDone(pb);
      if (done) _pbpTrCommitAssembled(st, w, done, pb.failed);
    },
    onBlockFail: (id, message) => {
      const m = segMap.get(id);
      const w = m && byId.get(m.n);
      if (!w) return;
      if (m.parts === 1) { _pbpTrMarkFailed(st, w, message); return; }  // single-part: unchanged
      const pb = partBuf.get(m.n);
      if (!pb) return;
      _pbpTrPartFail(pb, m.idx);                    // keep this part's original, don't discard the block
      const done = _pbpTrPartDone(pb);
      if (!done) return;
      if (done.allFailed) { _pbpTrMarkFailed(st, w, message); return; }  // 0 parts translated: whole-block failure, not a fake success (don't fill st.trMd / count as done)
      _pbpTrCommitAssembled(st, w, done, pb.failed);                     // partial (>=1 real part) -> displayed, never cached (D7)
    },
    onProgress: (done, total) => {
      const prog = document.getElementById("tr-progress");
      // T3: N/M counts from the skip baseline, not from zero -- skipped blocks are
      // already "done" and were never queued, so both the numerator and the
      // denominator need the offset for the fraction to read honestly.
      const d = done + (st.skippedCount || 0), tt = total + (st.skippedCount || 0);
      if (prog) prog.textContent = t("trProgress", String(d), String(tt));
      // Rail accordion: mini "(done/total)" in the header, visible only while
      // tr-section is collapsed (CSS-gated) so run progress isn't lost when the
      // user has it tucked away. Plain digits -- no i18n needed (spec 1.3 example).
      const headProg = document.querySelector("#tr-section .rail-sec-progress");
      if (headProg) headProg.textContent = "(" + d + "/" + tt + ")";
    }
  });
  // End-of-run write keeps the FULL st.newly (not just the unflushed residue):
  // the append transform is an idempotent merge, so rewriting flushed blocks is
  // free, and any blocks a failed flush dropped are retried here.
  if (Object.keys(st.newly).length) {
    try { await pbpTrCacheSet(st.url, st.target.code, st.modelKey, st.newly, st.account, st.runMeta); } catch (_) {}
  }
  // Review blocker #1: everything in the flush buffer is now on disk via the
  // full st.newly write above; residue must not outlive the run -- a later
  // language switch plus a hidden-flush would re-key it under the NEW language
  // (permanent wrong-language cache entries, no TTL to age them out).
  st.flushBuf = Object.create(null);
  if (queueResult.permissionError) {
    st.running = false;
    st.permissionError = queueResult.permissionError;
    const headProg = document.querySelector("#tr-section .rail-sec-progress");
    if (headProg) headProg.textContent = "";
    _pbpTrSetStatus(st, "partial");
    const prog = document.getElementById("tr-progress");
    if (prog) prog.textContent = queueResult.permissionError.message || t("aiErrorRetry");
    return;
  }
  st.running = false;
  // Rail accordion: clear the mini progress unconditionally at run end
  // (done/partial/stopped alike) so a later collapse never shows a stale count.
  const headProgEnd = document.querySelector("#tr-section .rail-sec-progress");
  if (headProgEnd) headProgEnd.textContent = "";
  // A target-language change arrived mid-run (deferred by the onChanged listener). The
  // old-language results are now cached under the OLD st.target.code above; apply the
  // change (Task 7: resets filled state + re-arms the button for the new language) and
  // stop — don't persist the old-language status/view.
  if (st.pendingLangChange) {
    const pending = st.pendingLangChange;
    st.pendingLangChange = null;
    await _pbpTrApplyTargetLang(st, pending).catch(() => {});
    return;
  }
  // ZH-1b: a run that CONTINUED over a stale cache merged current-generation
  // blocks into an old-generation entry -- exactly what the on-disk gens set
  // now records as "mixed"; keep the session verdict in step. A full
  // retranslate cleared the verdict before starting, so it stays null there.
  if (st.staleVerdict) st.staleVerdict = "mixed";
  _pbpTrSyncStaleNote(st);
  const doneAll = st.work.every((w) => (w.n in st.trMd));
  _pbpTrSetStatus(st, doneAll ? "done" : "partial"); // partial = Stop / failures: Continue
  // A run where every block fails (offline, dead key) used to leave
  // #tr-progress frozen at the last mid-run count while identical pills
  // stacked below. One aggregate line names the cause once; the
  // host-permission path writes its own message above and never gets here.
  if (!doneAll && queueResult.failed.length) {
    const prog = document.getElementById("tr-progress");
    if (prog) {
      const msgs = [...new Set(queueResult.failed.map((f) => f.message))];
      prog.hidden = false;
      prog.textContent = msgs.length === 1
        ? t("trFailedSummary", String(queueResult.failed.length), msgs[0])
        : t("trFailedSummaryMixed", String(queueResult.failed.length));
    }
  }
  _pbpTrRenderUsage(st);                              // T4: show run's in/out token usage
  // Toggle is already shown and the mode already switched to bilingual at the
  // start of the run; persist the FINAL mode (unless the user switched back to
  // Original mid-run, in which case there is nothing translated to remember).
  if (st.mode !== "original") {
    pbpTrViewSet(st.url, { mode: st.mode, lang: st.target.code }, st.account).catch(() => {});
  }
}

// ZH-0 constraint 1 (D7): the ONE write point feeding the cache buffers. Only
// full, gate-passed translations may enter -- the partial-assembly paths call
// _pbpTrFill for DISPLAY but deliberately never this function (a half-
// translated block cached as done would make the next open report a full hit,
// state "done", and the user permanently loses the retry entry: worse than
// the lost-cache defect ZH-0 fixes). pbpAiCacheAppend's merge being idempotent
// does NOT substitute for this rule -- idempotence is exactly what would make
// the wrong write irreversible.
function _pbpTrRecordFill(st, w, text) {
  if (!st.newly) return;
  st.newly[w.hash] = text;
  st.flushBuf[w.hash] = text;
  if (Object.keys(st.flushBuf).length >= PBP_TR_FLUSH_BLOCKS
    || Date.now() - st.lastFlushTs >= PBP_TR_FLUSH_MS) _pbpTrFlushCache(st);
}

// Fire-and-forget incremental flush. Constraint 2 (D8): every cache-key input
// is snapshotted SYNCHRONOUSLY at initiation -- _pbpTrApplyTargetLang rewrites
// st.target in place once a run settles, and an in-flight flush reading st.*
// after an await would file this run's blocks under the WRONG language key
// (silent corruption restored as a "cache hit" next open). Constraint 3 (D9):
// st.runMeta rides along. Constraint 4: take-drain-write snapshot semantics +
// degrade on failure (console.warn, never blocks the run; the blocks stay in
// st.newly, so the end-of-run write retries them). st.flushFn exists for the
// unit tests only -- production always uses pbpTrCacheSet.
function _pbpTrFlushCache(st) {
  if (!st || !st.flushBuf || st.flushInflight) return;
  if (!Object.keys(st.flushBuf).length) return;
  const url = st.url, lang = st.target.code, model = st.modelKey, account = st.account, meta = st.runMeta;
  const batch = st.flushBuf;
  st.flushBuf = Object.create(null);
  st.flushInflight = true;
  st.lastFlushTs = Date.now();
  const setFn = st.flushFn || pbpTrCacheSet;
  let p;
  try { p = Promise.resolve(setFn(url, lang, model, batch, account, meta)); }
  catch (e) {
    st.flushInflight = false;
    try { console.warn("tr flush failed:", e && e.name, e && e.message); } catch (_) {}
    return;
  }
  p.catch((e) => { try { console.warn("tr flush failed:", e && e.name, e && e.message); } catch (_) {} })
    .finally(() => { st.flushInflight = false; });
}

// Shared tail of the multi-part assembly (onFill and onBlockFail converge
// here once every part settled). Display always; record for the cache ONLY
// when no part fell back to its original (D7).
function _pbpTrCommitAssembled(st, w, done, failedParts) {
  _pbpTrFill(st, w, done.text);
  if (done.partial) _pbpTrMarkPartial(st, w, failedParts);
  else _pbpTrRecordFill(st, w, done.text);
}

// Fill one block: restore placeholders, render via renderMarkdown (the
// SINGLE sanitize point), insert/replace the .pb-tr sibling, strip ids the
// renderer slugged inside the copy (heading ids always derive from the
// ORIGINAL, spec 4.4), then re-render KaTeX in the translated block.
function _pbpTrFill(st, w, shieldedTranslation) {
  const restored = pbpAiRestore(shieldedTranslation, w.shielded.slots);
  st.trMd[w.n] = restored;
  const orig = pbpAiBlockEl(w.n);
  if (!orig) return;
  const sib = orig.nextElementSibling;
  if (sib && sib.classList && sib.classList.contains("pb-tr-err")) sib.remove();
  let div = (orig.nextElementSibling && orig.nextElementSibling.classList
    && orig.nextElementSibling.classList.contains("pb-tr")) ? orig.nextElementSibling : null;
  if (!div) {
    div = document.createElement("div");
    div.className = "pb-tr";
    div.dataset.pbTr = String(w.n);
    orig.insertAdjacentElement("afterend", div);
  }
  // D9-1: known RTL target -> explicit rtl (auto's first-char sniff misreads
  // segments that lead with an untranslated Latin brand/code term); custom
  // free-text targets can't be judged statically -> degrade to dir="auto".
  div.dir = PBP_TR_RTL_LANGS.has(st.target.code) ? "rtl" : "auto";
  // :lang() font-stack routing: the .pb-tr otherwise inherits the ORIGINAL
  // article's lang (often empty on English pages), so a Simplified
  // translation fell back to the TC-first default Han stack on machines
  // carrying both (macOS ships PingFang SC and TC). Dropdown and auto both
  // yield normalized BCP-47 codes; a custom free-text target ("Latin") is
  // not a tag, so it stays off the attribute and inherits as before.
  if (PBP_TR_LANG_NAMES[st.target.code]) div.lang = st.target.code;
  div.innerHTML = renderMarkdown(restored);
  // H5 paint gate (spec 1.3): stamp the language this .pb-tr currently shows
  // so a translated-side highlight only re-paints when its recorded lang
  // still matches. Read straight off the element by md-highlight -- immune to
  // the stale pbpAiGetSettings memo (md-ai-core.js:460).
  div.dataset.pbTrLang = st.target.code;
  div.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));
  _pbpTrApplyPeekAttrs(div);
  orig.dataset.pbTrDone = "1";
  // In translated-only mode headings arrive progressively after the mode/TOC
  // switch. Refresh now so a newly filled heading never leaves stale original
  // text in the rail until the reader toggles modes again.
  if (st.mode === "translated" && /^H[1-6]$/.test(orig.tagName)) _pbpTrSyncToc(st, "translated");
  // KaTeX: only when the article actually rendered math (md-preview gated
  // loading on info.math; a .katex node proves it). ensureKatex is a
  // top-level function in md-preview.js, visible here.
  if (/\$/.test(div.textContent)
      && (typeof renderMathInElement === "function" || document.querySelector("#rendered-view .katex"))) {
    ensureKatex().then(() => {
      if (typeof renderMathInElement !== "function") return;
      try {
        renderMathInElement(div, {
          delimiters: [{ left: "$$", right: "$$", display: true }, { left: "$", right: "$", display: false }],
          throwOnError: false
        });
      } catch (_) {}
      // H5 controller fix (Task 1 review finding): this deferred KaTeX pass
      // rewrites .pb-tr text nodes AFTER the reanchor hook above already ran,
      // silently detaching tr-side highlight ranges on math-bearing blocks.
      // Re-run the same typeof-guarded reanchor once KaTeX has finished.
      if (typeof window.pbpHlReanchorTr === "function") { try { window.pbpHlReanchorTr(w.n); } catch (_) {} }
    });
  }
  // H5 (spec 1.3): the .pb-tr for block w.n was just (re)built in the current
  // target language -- let md-highlight re-anchor any translated-side
  // highlights on it. typeof-guarded so md-translate never hard-depends on
  // md-highlight (spec 7.2).
  if (typeof window.pbpHlReanchorTr === "function") { try { window.pbpHlReanchorTr(w.n); } catch (_) {} }
}

// Per-block failure: inline error pill after the block. Hover/focus shows the
// error; click retries this single block.
function _pbpTrMarkFailed(st, w, message) {
  const orig = pbpAiBlockEl(w.n);
  if (!orig) return;
  const sib = orig.nextElementSibling;
  if (sib && sib.classList && (sib.classList.contains("pb-tr") || sib.classList.contains("pb-tr-err"))) sib.remove();
  delete orig.dataset.pbTrDone; // tr-only scroll targeting assumes pbTrDone ⇒ a visible .pb-tr sibling
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "pb-tr-err";
  btn.dataset.pbTrErr = String(w.n);
  btn.dataset.tip = t("trBlockFailed") + " - " + String(message || "");
  btn.setAttribute("aria-label", btn.dataset.tip);
  btn.innerHTML = PBP_TR_ERR_SVG;                   // static inline SVG only
  const lab = document.createElement("span");
  lab.textContent = t("trRetryBlock");
  btn.appendChild(lab);
  orig.insertAdjacentElement("afterend", btn);
  btn.addEventListener("click", () => { _pbpTrRetryBlock(st, w, btn).catch(() => {}); });
  _pbpTrSyncRetryAll();
}

// Part buffer for an oversize (multi-part) block. A FAILED part stores its own
// ORIGINAL shielded chunk (origChunks[idx]) so the block can still assemble with
// that segment untranslated, instead of the whole block being discarded.
function _pbpTrMakePartBuf(split) {
  return { chunks: new Array(split.chunks.length).fill(null), seps: split.seps, origChunks: split.chunks, partial: false, failed: 0 };
}
function _pbpTrPartFill(pb, idx, text) { pb.chunks[idx] = text; }
function _pbpTrPartFail(pb, idx) { pb.chunks[idx] = pb.origChunks[idx]; pb.partial = true; pb.failed += 1; }
function _pbpTrPartDone(pb) {
  if (!pb.chunks.every((c) => typeof c === "string")) return null;
  return {
    text: pb.chunks.map((c, i) => (pb.seps[i] || "") + c).join(""),
    partial: pb.partial,
    allFailed: pb.failed === pb.chunks.length   // every part fell back to its original: 0 real translations
  };
}

// Partial-fill retry pill: inserted AFTER the block's .pb-tr (does NOT replace it),
// so the partial translation stays visible while offering a whole-block retry.
// failedParts > 0 names how many passages fell back to the original language --
// the untranslated text is spliced into the .pb-tr with no marker of its own
// (wrapping it would break marked's block parsing), so the pill is the one
// place that can say it.
function _pbpTrMarkPartial(st, w, failedParts) {
  const orig = pbpAiBlockEl(w.n);
  if (!orig) return;
  const tr = orig.nextElementSibling;
  const anchor = (tr && tr.classList && tr.classList.contains("pb-tr")) ? tr : orig;
  const after = anchor.nextElementSibling;
  if (after && after.classList && after.classList.contains("pb-tr-err")) after.remove();
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "pb-tr-err";
  btn.dataset.pbTrErr = String(w.n);
  btn.dataset.tip = failedParts > 0 ? t("trPartsUntranslated", String(failedParts)) : t("trBlockFailed");
  btn.setAttribute("aria-label", btn.dataset.tip);
  btn.innerHTML = PBP_TR_ERR_SVG;
  const lab = document.createElement("span");
  lab.textContent = t("trRetryBlock");
  btn.appendChild(lab);
  anchor.insertAdjacentElement("afterend", btn);
  btn.addEventListener("click", () => { _pbpTrRetryBlock(st, w, btn).catch(() => {}); });
  _pbpTrSyncRetryAll();
}

// Translate one whole block, sub-splitting if it exceeds the part limit so its
// translation never truncates at the output cap. Returns the (still-shielded)
// translation; throws on an invalid/failed part. Parts reassemble in order with
// their original separators.
async function _pbpTrTranslateBlock(st, w, signal) {
  const glossary = st.glossary || pbpTrParseGlossary(st.s.translateGlossary);
  const split = w.shielded.text.length <= PBP_TR_PART_LIMIT
    ? { chunks: [w.shielded.text], seps: [""] }
    : _pbpTrSplitText(w.shielded.text, PBP_TR_PART_LIMIT);
  const out = [];
  for (let i = 0; i < split.chunks.length; i++) {
    const seg = { id: w.n, text: split.chunks[i] };
    const hits = pbpTrMatchGlossary(glossary, [seg]);
    _pbpTrAddGlossaryHits(st, hits);
    const { system, prompt } = pbpTrBuildPrompt({
      targetLanguage: st.target.name, title: st.title,
      glossary: hits, segments: [seg]
    });
    let got = null;
    const parser = pbpAiMakeStreamJsonParser((it) => { if (it.id === w.n) got = it.text; });
    const full = await callAIStream(st.s, prompt, {
      system, model: pbpAiResolveModelOverride(st.s),
      temperature: 0.1, noThinking: true, signal,
      maxTokens: Math.min(8192, Math.max(1024, pbpAiEstimateTokens(split.chunks[i].length) * 3))
    }, (d, acc) => parser.push(acc));
    parser.finish(full);
    if (typeof got !== "string" || !pbpTrPlaceholdersConserved(split.chunks[i], got) || !pbpTrLengthRatioOk(split.chunks[i], got, st.target.code)) {
      throw new Error("invalid single-block translation");
    }
    out.push(got);
  }
  return split.chunks.length === 1 ? out[0] : out.map((c, i) => (split.seps[i] || "") + c).join("");
}

async function _pbpTrRetryBlock(st, w, btn) {
  if (st.running) return;   // a batch run owns the queue + cache; don't fire a concurrent single-block request
  if (btn.disabled) return;
  btn.disabled = true;
  const label = btn.querySelector("span");
  if (st.permissionError) {
    if (label) label.textContent = t("aiGrantRetry");
    const recovered = await pbpAiRetryWithPermission(st.permissionError, st.s, () => {});
    if (!recovered) { btn.disabled = false; return; }
    st.permissionError = null;
    if (label) label.textContent = t("trRetryBlock");
  }
  // Fresh controller: the run-level st.ctrl may already be aborted (Stop /
  // pagehide on the main run), and reusing it would abort this retry instantly.
  // Wire pagehide so a retry started after the run still cancels on unload.
  const ctrl = new AbortController();
  const onHide = () => ctrl.abort();
  window.addEventListener("pagehide", onHide, { once: true });
  try {
    const got = await _pbpTrTranslateBlock(st, w, ctrl.signal);
    // Fill BEFORE removing the pill: _pbpTrFill creates/updates the .pb-tr
    // sibling we want to move focus into. If the pill (btn) is the currently
    // focused element, hand focus to that new .pb-tr instead of letting
    // btn.remove() drop focus to <body> (audit md-translate.js:1000).
    const hadFocus = document.activeElement === btn;
    _pbpTrFill(st, w, got);
    if (hadFocus) {
      const tr = pbpAiBlockEl(w.n) && pbpAiBlockEl(w.n).nextElementSibling;
      if (tr && tr.classList && tr.classList.contains("pb-tr")) {
        // Don't clobber the tabindex=0 _pbpTrApplyPeekAttrs (just run inside
        // _pbpTrFill) may have already given it for tr-only keyboard peek.
        if (!tr.hasAttribute("tabindex")) tr.tabIndex = -1;
        tr.focus();
      }
    }
    btn.remove(); // no-op if _pbpTrFill's own cleanup already removed it
    _pbpTrSyncRetryAll();
    const one = {};
    one[w.hash] = got;
    // st.runMeta may be undefined (retry without a prior run this session);
    // a meta-less write keeps the stored meta untouched (D5 semantics).
    try { await pbpTrCacheSet(st.url, st.target.code, st.modelKey, one, st.account, st.runMeta); } catch (_) {}
    _pbpTrShowViewToggle(st);
    if (st.work.every((x) => x.n in st.trMd)) _pbpTrSetStatus(st, "done");
  } catch (e) {
    if (e && e.code === "host_permission") st.permissionError = e;
    if (label) label.textContent = t(e && e.code === "host_permission" ? "aiGrantRetry" : "trRetryBlock");
    btn.disabled = false;
    btn.dataset.tip = t("trBlockFailed") + " - " + pbpAiErrorText(e);
    btn.setAttribute("aria-label", btn.dataset.tip);
  } finally {
    window.removeEventListener("pagehide", onHide);
  }
}

// Clear only the failure pills for blocks about to be re-attempted (pending). A
// PARTIAL block is already in st.trMd (not pending) and keeps its coexisting retry pill.
function _pbpTrClearPendingFailures(pendingNs) {
  document.querySelectorAll(".pb-tr-err").forEach((e) => {
    if (pendingNs.has(Number(e.dataset.pbTrErr))) e.remove();
  });
  _pbpTrSyncRetryAll();
}

// Show the "retry all failed" button iff >=1 failed block (.pb-tr-err) remains.
function _pbpTrSyncRetryAll() {
  const all = document.getElementById("tr-retry-all");
  if (!all) return;
  const remaining = document.querySelectorAll(".pb-tr-err").length;
  all.hidden = remaining === 0;
  if (remaining === 0) all.disabled = false;
}

// Retry every failed block, SEQUENTIALLY (await each) so we never fire N concurrent
// API calls. Reuses _pbpTrRetryBlock, which owns each pill's controller/state and
// removes the pill on success. Snapshot the pills first — retries mutate the DOM.
async function _pbpTrRetryAllFailed(st) {
  if (st.running) return;   // batch run in progress: retrying now races the queue + cache get-merge-put
  const all = document.getElementById("tr-retry-all");
  const allLabel = all && all.querySelector("span");
  if (all) {
    // Disabling the focused button drops focus to <body> (audit md-translate.js:1000);
    // tr-progress is already visible whenever retry-all is (both follow a "translating"
    // or "partial" status, which unhides it), so it's a safe, always-live focus target.
    if (document.activeElement === all) {
      const prog = document.getElementById("tr-progress");
      if (prog) { prog.tabIndex = -1; prog.focus(); }
    }
    all.disabled = true;
  }
  const pills = Array.from(document.querySelectorAll(".pb-tr-err"));
  let canRetry = true;
  if (st.permissionError) {
    if (allLabel) allLabel.textContent = t("aiGrantRetry");
    const recovered = await pbpAiRetryWithPermission(st.permissionError, st.s, () => {});
    if (recovered) st.permissionError = null;
    else canRetry = false;
  }
  if (canRetry) {
    for (const btn of pills) {
      const n = Number(btn.dataset.pbTrErr);
      const w = st.work.find((x) => x.n === n);
      if (w) await _pbpTrRetryBlock(st, w, btn);
      if (st.permissionError) break;
    }
  }
  _pbpTrSyncRetryAll();
  if (allLabel) allLabel.textContent = t(st.permissionError ? "aiGrantRetry" : "trRetryAllFailed");
  // If some blocks still failed, the button is shown again but was disabled at entry;
  // re-arm it so the user can run retry-all again. (Kept disabled DURING the run above
  // to prevent concurrent re-clicks.)
  if (all && !all.hidden) all.disabled = false;
}

function _pbpTrSetStatus(st, status) {
  st.status = status;
  const btn = document.getElementById("btn-translate");
  const stop = document.getElementById("btn-tr-stop");
  const prog = document.getElementById("tr-progress");
  const est = document.getElementById("tr-estimate");
  if (!btn) return;
  const label = btn.querySelector(".btn-label");
  if (status === "translating") {
    label.textContent = t("trTranslating");
    stop.hidden = false;
    prog.hidden = false;
    est.hidden = true;
    const usg = document.getElementById("tr-usage");
    if (usg) usg.hidden = true;          // T4: clear last run's usage line before the new run
    // Move focus to the now-visible Stop button before disabling Translate,
    // so a keyboard user doesn't drop to <body> (audit md-translate.js:1000).
    if (document.activeElement === btn) stop.focus();
    btn.disabled = true;
  } else if (status === "partial") {
    label.textContent = t(st.permissionError ? "aiGrantRetry" : "trContinue");
    btn.disabled = false;
    btn.hidden = false;
    stop.hidden = true;
    // A cache-probe partial used to leave the estimate at the whole-article
    // figure _pbpTrBuildSection painted -- several times the real cost of
    // Continue. Re-estimate only what is still untranslated.
    const remaining = st.work.reduce((a, w) => (w.n in st.trMd) ? a : a + w.shielded.text.length, 0);
    if (remaining > 0) {
      est.hidden = false;
      est.textContent = t("trEstCost", String(pbpAiEstimateTokens(remaining) * 3),
        (st.s.aiProvider || "gemini") + "/" + (pbpAiResolveModelOverride(st.s) || "default"));
    } else {
      est.hidden = true;
    }
  } else if (status === "done") {
    const stale = !!st.staleVerdict;
    btn.disabled = false;
    // ZH-1b: a stale/mixed completed translation keeps the button as an
    // explicit retranslate WITH its full-article price -- visible-but-
    // inactionable is the form reader-research vetoed, and an unpriced paid
    // button is the other banned form. A current translation hides it as
    // before.
    btn.hidden = !stale;
    if (label) label.textContent = t(stale ? "trRetranslate" : "trTranslate");
    stop.hidden = true;
    if (stale) {
      const chars = st.work.reduce((a, w) => a + w.shielded.text.length, 0);
      est.hidden = false;
      est.textContent = t("trEstCost", String(pbpAiEstimateTokens(chars) * 3),
        (st.s.aiProvider || "gemini") + "/" + (pbpAiResolveModelOverride(st.s) || "default"));
    } else {
      est.hidden = true;
    }
    // Explicit completion indicator (the view toggle is already shown from
    // the progressive-display start, so without this the run has no visible
    // "finished" signal). Show the translated-block count.
    const n = st.work.filter((w) => w.n in st.trMd).length;
    prog.hidden = false;
    prog.textContent = t("trDone", String(n));
  } else if (status === "idle") {
    // Pristine pre-translation state (used when a target-language change resets the
    // page): re-arm the Translate button, hide progress, show the cost estimate again.
    label.textContent = t("trTranslate");
    btn.disabled = false;
    btn.hidden = false;
    stop.hidden = true;
    prog.hidden = true;
    est.hidden = false;
    const usg = document.getElementById("tr-usage");
    if (usg) usg.hidden = true;          // T4: language reset clears the stale usage line
  }
}

// Three-state view. mode: "original" | "bilingual" | "translated".
// Pure DOM show/hide — zero re-requests (spec 4.2). Persisted per URL.
function _pbpTrShowViewToggle(st) {
  if (document.getElementById("tr-view-toggle")) return;
  const wrap = document.createElement("div");
  wrap.id = "tr-view-toggle";
  wrap.className = "view-toggle";
  wrap.setAttribute("aria-keyshortcuts", "v");
  // Language-glyph segments (device feedback round 3): abstract "view" icons
  // for these three states are unwinnable, but the LANGUAGE metaphor is not --
  // source glyph / both / target glyph (A · A文 · 文), the same iconography
  // the shared translate icon and Google Translate use. Both glyph groups are
  // lifted verbatim from Lucide `languages` (single-pack contract): the solo
  // segments scale their group up with non-scaling strokes so the family's
  // 2px line weight holds. Full labels stay on title/aria.
  const PBP_TR_VIEW_ICONS = {
    original: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><g transform="translate(12 12) scale(1.5) translate(-17 -17)"><path vector-effect="non-scaling-stroke" d="m22 22-5-10-5 10"/><path vector-effect="non-scaling-stroke" d="M14 18h6"/></g></svg>',
    bilingual: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/></svg>',
    translated: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><g transform="translate(12 12) scale(1.5) translate(-8 -8)"><path vector-effect="non-scaling-stroke" d="m5 8 6 6"/><path vector-effect="non-scaling-stroke" d="m4 14 6-6 2-3"/><path vector-effect="non-scaling-stroke" d="M2 5h12"/><path vector-effect="non-scaling-stroke" d="M7 2h1"/></g></svg>',
  };
  for (const [mode, key] of [["original", "trViewOriginal"], ["bilingual", "trViewBilingual"], ["translated", "trViewTranslated"]]) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "toggle-btn";
    b.dataset.trMode = mode;
    b.innerHTML = PBP_TR_VIEW_ICONS[mode]; // static composed constants above
    b.title = t(key) + " (v)"; // "v" is the literal key name, deliberately not translated
    b.setAttribute("aria-label", t(key));
    b.setAttribute("aria-pressed", "false");
    b.addEventListener("click", () => _pbpTrSetMode(st, mode, true));
    wrap.appendChild(b);
  }
  document.getElementById("tr-section").appendChild(wrap);
  _pbpTrSyncToggle(st.mode);
}

function _pbpTrSyncToggle(mode) {
  document.querySelectorAll("#tr-view-toggle .toggle-btn").forEach((b) => {
    const active = b.dataset.trMode === mode;
    b.classList.toggle("active", active);
    b.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

// Moving between original-only and translated-only can hide the element that
// currently owns keyboard focus. Capture its same-block counterpart before the
// class change; the handoff itself runs after the destination side is visible.
function _pbpTrCaptureFocusHandoff(mode) {
  if (mode !== "original" && mode !== "translated") return null;
  const view = document.getElementById("rendered-view");
  const active = document.activeElement;
  if (!view || !active || active === document.body || !view.contains(active)) return null;

  if (mode === "translated") {
    const orig = active.closest("[data-pb]");
    if (!orig || !view.contains(orig) || !orig.dataset.pbTrDone) return null;
    const target = pbpTrViewAnchorTarget(orig, "translated", "orig");
    return target && target !== orig ? { active, target } : null;
  }

  const tr = active.closest(".pb-tr");
  if (!tr || !view.contains(tr) || typeof pbpAiBlockEl !== "function") return null;
  const orig = pbpAiBlockEl(tr.dataset.pbTr);
  if (!orig || orig.nextElementSibling !== tr) return null;
  return { active, target: orig };
}

function _pbpTrApplyFocusHandoff(handoff) {
  if (!handoff || document.activeElement !== handoff.active) return;
  const target = handoff.target;
  if (!handoff.active.isConnected || !target || !target.isConnected) return;
  let borrowedTabIndex = false;
  if (target.tabIndex < 0 && !target.hasAttribute("tabindex")) {
    target.setAttribute("tabindex", "-1");
    borrowedTabIndex = true;
  }
  target.focus({ preventScroll: true });
  if (borrowedTabIndex && document.activeElement === target) {
    target.addEventListener("blur", () => {
      if (target.getAttribute("tabindex") === "-1") target.removeAttribute("tabindex");
    }, { once: true });
  }
}

function _pbpTrCaptureViewAnchor() {
  if (document.body.classList.contains("raw-active") || window.scrollY === 0 || typeof pbpAiBlocks !== "function") return null;
  const candidates = [];
  for (const block of pbpAiBlocks()) {
    const orig = block.el;
    if (!orig) continue;
    const origRect = orig.getBoundingClientRect();
    candidates.push({ n: block.n, side: "orig", top: origRect.top, bottom: origRect.bottom });
    const sibling = orig.nextElementSibling;
    if (sibling && sibling.classList && sibling.classList.contains("pb-tr")) {
      const trRect = sibling.getBoundingClientRect();
      candidates.push({ n: block.n, side: "tr", top: trRect.top, bottom: trRect.bottom });
    }
  }
  return pbpTrViewAnchorPick(candidates);
}

function _pbpTrSettleViewAnchor(anchor, mode) {
  if (!anchor || typeof pbpAiBlockEl !== "function") return;
  const orig = pbpAiBlockEl(anchor.n);
  const target = pbpTrViewAnchorTarget(orig, mode, anchor.side);
  if (!target) return;
  target.scrollIntoView({ block: "start", behavior: "instant" });
  const frac = Math.min(Math.max(Number(anchor.frac) || 0, 0), 1);
  if (frac > 0) {
    const h = target.getBoundingClientRect().height;
    if (h > 0) window.scrollBy(0, frac * h);
  }
}

function _pbpTrApplyMode(st, mode, anchor, focusHandoff) {
  document.body.classList.toggle("tr-bilingual", mode === "bilingual");
  document.body.classList.toggle("tr-only", mode === "translated");
  if (mode !== "translated") {
    document.querySelectorAll("#rendered-view .pb-show-orig").forEach((el) => el.classList.remove("pb-show-orig"));
  }
  // The class switch makes the destination side visible. Move focus before
  // removing the source .pb-tr's tabindex; Chromium otherwise drops focus to
  // body and the stale-focus guard correctly refuses the intended handoff.
  _pbpTrApplyFocusHandoff(focusHandoff);
  // Re-sync every already-filled .pb-tr's peek affordance for the new mode
  // (blocks filled while a DIFFERENT mode was active still need updating).
  document.querySelectorAll("#rendered-view .pb-tr").forEach(_pbpTrApplyPeekAttrs);
  _pbpTrSyncToggle(mode);
  _pbpTrSyncToc(st, mode);
  // Export follows the view: md-preview.js consults window.pbpViewMarkdown
  // (function in bilingual/translated, null in original) before getMarkdown().
  window.pbpViewMarkdown = (mode === "original") ? null : () => {
    // Forum pages: serialize the nested rendered DOM so the export keeps the thread
    // structure (matches the preview); non-forum: the flat block-index compose is correct.
    if (document.querySelector("#rendered-view .pb-comment-body")) return _pbpTrSerializeForumView(mode);
    return pbpTrComposeView(mode, pbpAiBlocks().map((b) => {
      const orig = pbpAiMdOf(b.n), tr = st.trMd[b.n];
      return { orig, tr: (tr && tr !== orig) ? tr : null };
    }));
  };
  _pbpTrSettleViewAnchor(anchor, mode);
}

function _pbpTrSetMode(st, mode, persist) {
  if (!st || !["original", "bilingual", "translated"].includes(mode) || mode === st.mode) return;
  const anchor = _pbpTrCaptureViewAnchor();
  const focusHandoff = _pbpTrCaptureFocusHandoff(mode);
  // State changes synchronously even when the native transition schedules the
  // DOM mutation, so repeated v presses always advance from the latest mode.
  st.mode = mode;
  const viewSeq = (st.viewSeq || 0) + 1;
  st.viewSeq = viewSeq;
  const apply = () => {
    // startViewTransition may still invoke a skipped transition's update
    // callback. Only the latest rapid v press may mutate the live document.
    if (st.viewSeq === viewSeq) _pbpTrApplyMode(st, mode, anchor, focusHandoff);
  };
  const reduceMotion = pbpPrefersReducedMotion();
  if (persist && !reduceMotion && typeof document.startViewTransition === "function") {
    const root = document.documentElement;
    root.classList.add("pbp-tr-view-transition");
    let transition;
    try {
      transition = document.startViewTransition(apply);
      st.viewTransition = transition;
      transition.finished.catch(() => {}).finally(() => {
        if (st.viewTransition === transition) {
          st.viewTransition = null;
          root.classList.remove("pbp-tr-view-transition");
        }
      });
    } catch (_) {
      root.classList.remove("pbp-tr-view-transition");
      apply();
    }
  } else {
    apply();
  }
  if (persist) pbpTrViewSet(st.url, { mode, lang: st.target.code }, st.account).catch(() => {});
}

// TOC text swap (spec 4.4: translated-only view follows translated heading
// text; anchors/ids never change). Originals stashed on the link, restored
// on any other view. `title` (md-preview.js ~:1023 sets it equal to
// textContent, recovering the full heading once CSS ellipsis-clips the
// visible line) is kept in lockstep with textContent here too, or the
// tooltip would keep showing the original heading after a translated swap.
function _pbpTrSyncToc(st, mode) {
  document.querySelectorAll("#toc-list a[data-slug]").forEach((a) => {
    if (mode === "translated") {
      const headEl = document.getElementById(a.dataset.slug);
      if (!headEl || !headEl.dataset.pb) return;
      // Relies on _pbpTrFill keeping .pb-tr as the heading's immediate next sibling
      // (it removes any .pb-tr-err pill before inserting). Missing/failed translations
      // fall through here and leave the original TOC text in place -- intended.
      const sib = headEl.nextElementSibling;
      if (!sib || !sib.classList.contains("pb-tr")) return;
      const txt = sib.textContent.trim();
      if (!txt) return;
      if (a.dataset.origText == null) a.dataset.origText = a.textContent;
      a.textContent = txt;
      a.title = txt;
    } else if (a.dataset.origText != null) {
      a.textContent = a.dataset.origText;
      a.title = a.dataset.origText;
    }
  });
}

// Init hookup: top-level listener registration only (no other side effects;
// the tests page loads this file on file:// and never fires the event).
if (typeof document !== "undefined") {
  document.addEventListener("pbp:rendered", (e) => {
    pbpTrInit((e && e.detail) || {}).catch(() => {});
  }, { once: true });
}
