// ============================================================
// Pinboard Bookmark Enhanced - md-preview dictionary (P1)
// 查 (freedictionaryapi.com + LLM contextual gloss) / 听 (speechSynthesis)
// 存 (pbp-vocab IDB) / 导 (Anki TSV)
// ============================================================
// TOP SECTION IS PURE: no chrome.*, no DOM, no fetch — loadable from
// file:// test pages (same contract as md-translate.js's top section).
// Runtime layers live below the PURE END marker.

const PBP_DICT_ORIGIN = "https://freedictionaryapi.com";
// Retention and display are separate concerns. The API orders senses roughly
// historically, so for a polysemous word the one a reader wants routinely sits
// outside the first five: measured on the live API, set has 96 senses, run 69,
// take 71. Keeping only five discarded the answer before it was ever cached.
// KEEP is what the model and the cache hold; SHOW is what renders, after the
// host sentence has had a chance to reorder them.
const PBP_DICT_SENSE_KEEP = 20;
const PBP_DICT_SENSE_SHOW = 5;
// Weight of the API's own sense order when ranking against the sentence.
// Tuned on the 60-case gold set; see pbpDictOrderForContext.
const PBP_DICT_SENSE_ORDER_PRIOR = 2;
const PBP_DICT_EXAMPLE_CAP = 2;
const PBP_DICT_FORM_CAP = 6;
const PBP_DICT_IPA_CAP = 3;
// These already arrive in every response and already sit in the dict2_ cache;
// rendering them costs no extra request. Caps are deliberately tight: this
// panel is a reading overlay, and density here has drawn real complaints.
// Attested quotations are deliberately NOT carried: they cost the most lines
// per sense and carry the least, so they were cut after seeing them rendered.
const PBP_DICT_REL_CAP = 6;       // synonyms / antonyms per sense
const PBP_DICT_SUBSENSE_CAP = 3;
const PBP_DICT_SENSE_TAG_CAP = 3;
const PBP_DICT_QUERY_LANGS = Object.freeze(["en", "de", "fr", "es", "it", "pt", "nl", "ru", "pl", "ja", "ko", "zh"]);
const PBP_DICT_CIRCUIT_THRESHOLD = 3;
const PBP_DICT_CIRCUIT_COOLDOWN_MS = 60000;

// User-facing language names come from the platform's locale data. Unknown
// or unsupported codes stay hidden instead of leaking technical identifiers.
function pbpDictLanguageLabel(code, locale) {
  const primary = pbpDictPrimaryLang(code);
  if (!primary || primary === "und" || !PBP_DICT_QUERY_LANGS.includes(primary)) return "";
  try {
    const names = new Intl.DisplayNames([String(locale || "en").replace("_", "-")], { type: "language" });
    const label = names.of(primary);
    return label && label.toLowerCase() !== primary ? label : "";
  } catch (_) { return ""; }
}

// Language routing (spec §3): manual override wins; then a reliable
// detection; then the article-level fallback; "" = unknown. "und" never routes.
function pbpDictRouteLang(detected, isReliable, articleLang, manual) {
  const m = pbpDictPrimaryLang(manual);
  if (m) return m;
  const d = pbpDictPrimaryLang(detected);
  if (d && d !== "und" && isReliable) return d;
  return pbpDictPrimaryLang(articleLang);
}

// Japanese written without kana is indistinguishable from Chinese, and
// chrome.i18n.detectLanguage does not hedge about it: measured against the
// real API inside the extension, "東京大学工学部電気工学科教授会議" comes back as
// zh at 100% with isReliable TRUE, at every length from 30 to 640 characters.
// Reliable-and-wrong beats the whole detection ladder, so the article-level
// answer never gets a say -- and md-preview.js:105 computed that one by
// scanning 4000 characters for kana, which is a positive marker this sentence
// simply lacks.
//
// Hence the asymmetry: kana PRESENT proves Japanese, kana ABSENT proves
// nothing. Only zh-detected-inside-a-ja-article is corrected; a ja detection
// is never overridden. The cost is a genuinely Chinese sentence quoted in a
// Japanese article, which routes to ja -- but without kana nothing could have
// told those apart anyway, and the article is the better prior.
function pbpDictCorrectCjkLang(routed, articleLang) {
  return routed === "zh" && pbpDictPrimaryLang(articleLang) === "ja" ? "ja" : routed;
}

// Central acceptability gate for AUTOMATIC routes only (manual choice
// deliberately bypasses it): a route may only name a language the dictionary
// can actually query AND whose script is present in the selection. Without
// the gate, a reliable zh read on the Chinese sentence AROUND a Latin
// selection routes that Latin word to zh, and reliable fi/sv/ar detections
// leak requests to languages the dropdown cannot even display (the Auto
// label hides them: pbpDictLanguageLabel returns "" outside the query set).
const PBP_DICT_LATIN_QUERY_LANGS = Object.freeze(["en", "de", "fr", "es", "it", "pt", "nl", "pl"]);
const PBP_DICT_SCRIPT_RES = Object.freeze({
  latin: /\p{Script=Latin}/u,
  han: /\p{Script=Han}/u,
  kana: /[\p{Script=Hiragana}\p{Script=Katakana}]/u,
  hangul: /\p{Script=Hangul}/u,
  cyrillic: /\p{Script=Cyrillic}/u,
  // Letters that EXCLUDE Russian inside Cyrillic: Ukrainian (\u0456 \u0457 \u0454
  // \u0491), Belarusian (\u045E), Serbian (\u0452 \u0458 \u0459 \u045A \u045B \u045F),
  // Macedonian (\u045C \u0453 \u0455). Their absence proves nothing (Bulgarian is
  // indistinguishable on most words) -- same asymmetry as kana for Japanese.
  nonRuCyr: /[\u0452\u0453\u0454\u0455\u0456\u0457\u0458\u0459\u045A\u045B\u045C\u045E\u045F\u0491\u0402\u0403\u0404\u0405\u0406\u0407\u0408\u0409\u040A\u040B\u040C\u040E\u040F\u0490]/,
  // A Latin-script letter outside ASCII: positive orthographic evidence that
  // a word is NOT plain-English spelling (used by the fallback's lone-candidate rule).
  extLatin: /(?![\x00-\x7F])\p{Script=Latin}/u,
  // A letter that is NOT Latin-script. \p{L} alone would flag digits-free
  // words fine but also needs the lookahead so Latin letters pass; anything
  // this matches is counter-evidence against a Latin-language route.
  nonLatinLetter: /(?!\p{Script=Latin})\p{L}/u,
});
function pbpDictScriptCompatible(primary, selText) {
  const s = String(selText || "");
  const R = PBP_DICT_SCRIPT_RES;
  if (primary === "zh") return R.han.test(s);
  if (primary === "ja") return R.kana.test(s) || R.han.test(s);
  if (primary === "ko") return R.hangul.test(s) || R.han.test(s);
  if (primary === "ru") return R.cyrillic.test(s) && !R.nonRuCyr.test(s);
  return R.latin.test(s); // the Latin 8
}
function pbpDictAcceptLang(code, selText) {
  const p = pbpDictPrimaryLang(code);
  if (!PBP_DICT_QUERY_LANGS.includes(p)) return "";
  return pbpDictScriptCompatible(p, selText) ? p : "";
}

// Selection-level script rung, AHEAD of CLD: for every non-Latin script in
// the query set the selection's own codepoints decide faster and more
// reliably than any statistical read of the surroundings (a Russian word
// quoted in an English article has an unreliable CLD read but an unambiguous
// alphabet -- ru is the only Cyrillic member of the query set). Kana proves
// ja and Hangul proves ko outright. Han alone is zh/ja/ko-ambiguous: kana or
// hangul in the SURROUNDING SENTENCE resolves it (a kanji word selected
// inside a Japanese sentence must not route to zh just because the article
// is English), otherwise zh -- with the ja-article correction applied by the
// caller, same documented tradeoff as before. Latin deliberately returns ""
// here: eight query languages share that script, CLD gets its chance first.
function pbpDictScriptLang(selText, sentence) {
  const R = PBP_DICT_SCRIPT_RES;
  const s = String(selText || "");
  if (R.kana.test(s)) return "ja";
  if (R.hangul.test(s)) return "ko";
  if (R.han.test(s)) {
    const ctx = String(sentence || "");
    if (R.kana.test(ctx)) return "ja";
    if (R.hangul.test(ctx)) return "ko";
    return "zh";
  }
  if (R.cyrillic.test(s)) {
    const cyrCtx = String(sentence || "");
    // ru is the only Cyrillic query language, but a letter unique to
    // Ukrainian/Belarusian/Serbian/Macedonian in the word or its sentence
    // DISPROVES Russian -- honest unknown beats a fabricated ru identity.
    return (R.nonRuCyr.test(s) || R.nonRuCyr.test(cyrCtx)) ? "" : "ru";
  }
  return "";
}

// Last rung, Latin script only. CLD flags nearly every short or jargon-heavy
// selection unreliable (measured in the extension SW: "Converts wiktionary
// data from kaikki (wiktextract) to yomitan -compatible dictionaries." ->
// en@100 isReliable:FALSE; the lone word "Converts" -> zh@100 FALSE), and
// detectArticleLang names only CJK/RTL scripts, so a Latin article has no
// article-level rung at all -- the ladder used to end at "" and the slot
// claimed "no entry" without ever querying. An unreliable candidate is still
// worth routing when it names a Latin-script query language (a German jargon
// sentence tops as de); anything else (zh on "Converts") falls to en, the
// technical web's prior. Positive classification, not a script blacklist:
// the selection must CONTAIN Latin letters and contain NO other-script
// letters ("zolc" with Polish diacritics is Latin; ASCII mixed with Bengali
// is not) -- a blacklist can never enumerate every other script.
function pbpDictLatinFallback(text, sentenceCand, blockCand) {
  const s = String(text || "");
  const R = PBP_DICT_SCRIPT_RES;
  if (!R.latin.test(s) || R.nonLatinLetter.test(s)) return "";
  const a = pbpDictPrimaryLang(sentenceCand);
  const b = pbpDictPrimaryLang(blockCand);
  const av = PBP_DICT_LATIN_QUERY_LANGS.includes(a) ? a : "";
  const bv = PBP_DICT_LATIN_QUERY_LANGS.includes(b) ? b : "";
  // Two low-confidence reads NAMING DIFFERENT Latin languages cancel out --
  // that disagreement is exactly what "unreliable" warned about, and en is
  // the better prior than whichever happened to be passed first.
  if (av && bv && av !== bv) return "en";
  const cand = av || bv;
  if (!cand || cand === "en") return "en";
  // A lone non-en candidate needs positive evidence beyond "CLD guessed it
  // once": either both context widths agreed, or the word itself carries
  // non-ASCII Latin orthography (zolc-with-diacritics, cafe-with-accent)
  // that plain-English spelling lacks. A bare-ASCII homograph (chat, gift)
  // riding a lone fr/da guess would render a CONVINCING wrong entry --
  // strictly worse than the honest miss en gives (Codex review HIGH 1).
  return (av && bv) || PBP_DICT_SCRIPT_RES.extLatin.test(s) ? cand : "en";
}

// Case-sensitive public query cache. The dict2_ prefix orphans old dict_
// entries whose folded key may already contain the wrong casing's result.
function pbpDictCacheKeyExact(lang, term) {
  return pbpDictPrimaryLang(lang) + "|" + pbpDictNormalizeTerm(term);
}

function pbpDictQueryCacheKey(lang, term) {
  return "dict2_" + pbpDictCacheKeyExact(lang, term);
}

function pbpDictLowerCandidate(term, lang) {
  const primary = pbpDictPrimaryLang(lang);
  const exact = pbpDictNormalizeTerm(term);
  if (!exact || !PBP_DICT_QUERY_LANGS.includes(primary)) return "";
  const lower = exact.toLocaleLowerCase(primary);
  return lower === exact ? "" : lower;
}

// Selection artifacts that keep a real headword from resolving. Reader prose
// writes curly apostrophes where Wiktionary titles use ASCII ' (don't -> 4
// entries, don’t -> 0), justified and PDF-derived text carries soft hyphens,
// and a drag routinely takes the sentence punctuation with the word
// ("ubiquitous." -> 0). The same defect class exists in other scripts: CJK has
// no inter-word spaces, so a Japanese drag almost always carries the following
// ideographic period (ja lookups return zero entries with it, a real entry
// without), and Spanish questions open with an inverted mark -- hence the CJK
// and inverted marks in the edge class. Hyphens are deliberately left alone:
// "pre-" and "-ing" are real entries. Edge quotes are safe to strip here even
// though "'tis" is a headword, because this is only ever tried AFTER the exact
// term missed.
const PBP_DICT_EDGE_PUNCT = "\\s.,;:!?\u2026\"'\u201C\u201D\u00AB\u00BB\u201E\u201A()[\\]{}<>" +
  "\u00A1\u00BF\u3000-\u3002\u3008-\u3011\uFF01\uFF02\uFF07-\uFF09\uFF0C\uFF0E\uFF1A\uFF1B\uFF1F\uFF61-\uFF64";
function pbpDictCleanCandidate(term, lang) {
  const exact = pbpDictNormalizeTerm(term);
  if (!exact || !PBP_DICT_QUERY_LANGS.includes(pbpDictPrimaryLang(lang))) return "";
  const cleaned = pbpDictNormalizeTerm(
    exact
      .replace(/[\u200B-\u200D\uFEFF\u00AD]/g, "")
      .replace(/[\u2018\u2019\u201B\u02BC]/g, "'")
      .replace(new RegExp("^[" + PBP_DICT_EDGE_PUNCT + "]+"), "")
      .replace(new RegExp("[" + PBP_DICT_EDGE_PUNCT + "]+$"), "")
  );
  return cleaned && cleaned !== exact ? cleaned : "";
}

// Ordered lookup candidates for one selection. The exact term goes first and
// always bypasses the cache; every later candidate is an alias whose result is
// also cached under the exact key. Candidates that collapse onto an earlier
// one are dropped, so an ordinary lowercase word still costs exactly one
// request. Once a term has artifacts the chain lowercases the CLEANED form and
// not the raw one: a headword containing a curly apostrophe or a soft hyphen
// does not exist (en/don’t answers with zero entries), so lowercasing the raw
// form would only buy a fourth request that cannot hit. A sentence-initial
// "Don’t" therefore reaches "don't" in three steps.
function pbpDictQueryCandidates(term, lang) {
  const exact = pbpDictNormalizeTerm(term);
  const out = [{ term: exact, skipCache: true, aliasExact: false }];
  if (!exact) return out;
  const cleaned = pbpDictCleanCandidate(exact, lang);
  const seen = new Set([exact]);
  for (const c of cleaned ? [cleaned, pbpDictLowerCandidate(cleaned, lang)] : [pbpDictLowerCandidate(exact, lang)]) {
    if (!c || seen.has(c)) continue;
    seen.add(c);
    out.push({ term: c, skipCache: false, aliasExact: true });
  }
  return out;
}

function _pbpDictIsFormOfSense(s) {
  for (const x of Array.isArray(s && s.tags) ? s.tags : []) {
    if (typeof x === "string" && x.toLowerCase().replace(/-/g, " ").trim() === "form of") return true;
  }
  return false;
}

// Wiktionary answers an inflected form with a grammar pointer and nothing else
// -- es/aprovecho is only "first-person singular present indicative of
// aprovechar" -- tagged "form of". Rendering that and stopping strands the
// reader on a cross-reference, so the chain keeps it as a last resort and
// carries on to the lemma. Read from the RAW senses, never the normalized
// copy: tags arrive alphabetically and the marker already reaches the last
// slot PBP_DICT_SENSE_TAG_CAP keeps (pl/psa is index 2 of 6), so one more
// early tag would slice it off; senses are capped too, so a real sense can sit
// past the cut. Detection must not ride on a display cap.
function pbpDictEntriesAreFormOfOnly(rawEntries) {
  let sawSense = false;
  for (const e of Array.isArray(rawEntries) ? rawEntries : []) {
    for (const s of Array.isArray(e && e.senses) ? e.senses : []) {
      if (!s || typeof s.definition !== "string" || !s.definition) continue;
      sawSense = true;
      if (!_pbpDictIsFormOfSense(s)) return false;
    }
  }
  return sawSense;
}

// A form-of pointer ends with the lemma in plain sight ("first-person
// singular present indicative of aprovechar"). Users without an AI key have
// no lemma rescue, so the render layer turns that trailing word into a
// click-to-relookup; this helper isolates the (English-templated, since the
// source is English Wiktionary) split so it can be tested. null = leave the
// definition as plain text, exactly the old behaviour.
function pbpDictLemmaFromPointer(definition) {
  const m = /^(.*\bof\s+)(\S+?)([.。]?)$/.exec(String(definition || ""));
  return m && m[2] ? { prefix: m[1], lemma: m[2], suffix: m[3] } : null;
}

// Sense ranking. The reader is looking at a sentence, and the sentence is the
// one piece of context already in hand when the popup paints -- unlike the AI
// gloss, which arrives seconds later on its own stream and would reorder the
// list under the reader's eyes. So ordering happens once, at first paint, from
// the sentence alone.
//
// This only pays off when the sentence and the definitions share a language,
// which for English Wiktionary means an English article. Elsewhere -- a Spanish
// page, a CC-CEDICT Chinese gloss -- every score is zero and the stable sort
// leaves API order untouched, which is exactly the old behaviour.
const PBP_DICT_STOPWORDS = new Set(("the of and to in a is that it for on with as was at by an be this from or " +
  "which but not are have has had were been their they them its his her she him one all any can could would should " +
  "may might will shall must do does did done make made get got other into more most such than then there these " +
  "those when where who whom whose what why how also some each very much many out up down over under again " +
  "between during before after above below off through about against both few own same too only just").split(" "));

// Deliberately crude: enough to make "running" match "run" and "senses" match
// "sense" without carrying a stemmer. Over-stemming costs a point of precision
// in a ranking, never correctness.
function _pbpDictStem(w) {
  // "running" -> "runn" -> "run": without undoubling, the inflected form never
  // meets the base form and the whole point of stemming is lost.
  const undouble = (x) => (/([bdfglmnprt])\1$/.test(x) ? x.slice(0, -1) : x);
  if (w.length > 5 && w.endsWith("ing")) return undouble(w.slice(0, -3));
  if (w.length > 4 && w.endsWith("ed")) return undouble(w.slice(0, -2));
  if (w.length > 4 && w.endsWith("ly")) return w.slice(0, -2);
  if (w.length > 4 && w.endsWith("es")) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s")) return w.slice(0, -1);
  return w;
}

function pbpDictContentTokens(text) {
  const out = new Set();
  for (const raw of String(text || "").toLowerCase().split(/[^a-z]+/)) {
    if (raw.length < 3 || PBP_DICT_STOPWORDS.has(raw)) continue;
    out.add(_pbpDictStem(raw));
  }
  return out;
}

// Everything the sense carries, not just the definition: examples and synonyms
// are where a sentence's wording most often shows up.
function _pbpDictSenseTokens(s) {
  return pbpDictContentTokens([
    s.definition, (s.examples || []).join(" "), (s.tags || []).join(" "),
    (s.synonyms || []).join(" "), (s.subsenses || []).join(" ")
  ].join(" "));
}

// Rank senses and entries against the host sentence. Returns a NEW view
// carrying the FULL ordered sense list -- the render layer cuts to SHOW and
// parks the rest behind a click-to-expand, so a mis-ranked sense is one
// click away instead of discarded. norm is never mutated, because the same
// object is what goes into the cache and what pbpDictSaveCurrent reads
// senses[0] out of when it writes a vocabulary record.
function pbpDictOrderForContext(entries, sentence) {
  const list = Array.isArray(entries) ? entries : [];
  const ctx = pbpDictContentTokens(sentence);
  if (!ctx.size) return list.map((e) => ({ ...e, senses: e.senses.slice() }));

  // Rarity is measured across the whole word's sense pool so scores stay
  // comparable between entries, which is what lets the matching entry lead.
  const pool = [];
  for (const e of list) for (const s of e.senses) pool.push(_pbpDictSenseTokens(s));
  const df = new Map();
  for (const toks of pool) for (const tok of toks) df.set(tok, (df.get(tok) || 0) + 1);
  const idf = (tok) => Math.log(1 + pool.length / (1 + (df.get(tok) || 0)));

  let i = 0;
  const scored = list.map((e) => {
    const senses = e.senses.map((s, k) => {
      // API order is itself a prior: the leading senses are the common ones,
      // and a bag of words will happily demote them on an incidental match.
      // Measured on the 60-case set, the sentence for "the first person to run
      // sub-9.7s races" pulled "To move swiftly." out of view in favour of a
      // competition sense. The prior decays as 1/(1+k) against an idf that
      // tops out near 3.6, so one rare shared word still wins and one common
      // one no longer does. Regressions 3 -> 1, gains unchanged at 22; the
      // plateau runs from 1.5 to 3.0, so this is not a knife-edge fit.
      let score = PBP_DICT_SENSE_ORDER_PRIOR / (1 + k);
      for (const tok of _pbpDictSenseTokens(s)) if (ctx.has(tok)) score += idf(tok);
      return { s, score, i: i++ };
    });
    // Stable everywhere: equal scores, and the all-zero case, keep API order.
    senses.sort((a, b) => (b.score - a.score) || (a.i - b.i));
    return { e, senses, best: senses.length ? senses[0].score : 0 };
  });
  scored.forEach((x, n) => { x.n = n; });
  scored.sort((a, b) => (b.best - a.best) || (a.n - b.n));
  return scored.map((x) => ({ ...x.e, senses: x.senses.map((y) => y.s) }));
}

// freedictionaryapi.com response -> internal render model. null when nothing
// renderable (zh returns {entries:[]}). Field-by-field copies only.
function pbpDictNormalizeEntry(json) {
  if (!json || !Array.isArray(json.entries) || !json.entries.length) return null;
  const entries = [];
  for (const e of json.entries) {
    if (!e || typeof e !== "object") continue;
    const ipas = [];
    let ipaTotal = 0;
    for (const p of Array.isArray(e.pronunciations) ? e.pronunciations : []) {
      if (p && p.type === "ipa" && typeof p.text === "string" && p.text) {
        ipaTotal++;
        if (ipas.length < PBP_DICT_IPA_CAP) {
          ipas.push({ text: p.text, tags: Array.isArray(p.tags) ? p.tags.filter((x) => typeof x === "string") : [] });
        }
      }
    }
    const forms = [];
    for (const f of Array.isArray(e.forms) ? e.forms : []) {
      if (forms.length >= PBP_DICT_FORM_CAP) break;
      if (f && typeof f.word === "string" && f.word) {
        forms.push({ word: f.word, tags: Array.isArray(f.tags) ? f.tags.filter((x) => typeof x === "string") : [] });
      }
    }
    const senses = [];
    for (const s of Array.isArray(e.senses) ? e.senses : []) {
      if (senses.length >= PBP_DICT_SENSE_KEEP) break;
      if (!s || typeof s.definition !== "string" || !s.definition) continue;
      const examples = [];
      for (const x of Array.isArray(s.examples) ? s.examples : []) {
        if (examples.length >= PBP_DICT_EXAMPLE_CAP) break;
        if (typeof x === "string" && x) examples.push(x);
        else if (x && typeof x.text === "string" && x.text) examples.push(x.text);
      }
      const rel = (list) => {
        const out = [];
        for (const y of Array.isArray(list) ? list : []) {
          if (out.length >= PBP_DICT_REL_CAP) break;
          if (typeof y === "string" && y) out.push(y);
        }
        return out;
      };
      const subsenses = [];
      for (const b of Array.isArray(s.subsenses) ? s.subsenses : []) {
        if (subsenses.length >= PBP_DICT_SUBSENSE_CAP) break;
        if (b && typeof b.definition === "string" && b.definition) subsenses.push(b.definition);
      }
      senses.push({
        definition: s.definition,
        examples,
        tags: (Array.isArray(s.tags) ? s.tags.filter((x) => typeof x === "string" && x) : []).slice(0, PBP_DICT_SENSE_TAG_CAP),
        synonyms: rel(s.synonyms),
        antonyms: rel(s.antonyms),
        subsenses
      });
    }
    if (ipas.length || senses.length || forms.length) {
      // ipaMore makes the cap visible instead of silent ("3 shown" used to be
      // indistinguishable from "3 exist"). Records cached before this field
      // existed read undefined and simply show no hint.
      entries.push({
        pos: typeof e.partOfSpeech === "string" ? e.partOfSpeech : "", ipas, forms, senses,
        ipaMore: Math.max(0, ipaTotal - PBP_DICT_IPA_CAP)
      });
    }
  }
  if (!entries.length) return null;
  const src = json.source && typeof json.source === "object" ? json.source : {};
  const lic = src.license && typeof src.license === "object" ? src.license : {};
  return {
    word: typeof json.word === "string" ? json.word : "",
    entries,
    // Carried on the model, not on the classify result, so it survives a round
    // trip through the dict2_ cache. Entries cached before this existed simply
    // read as undefined and behave the way they always did.
    formOfOnly: pbpDictEntriesAreFormOfOnly(json.entries),
    // Retention stamp. A record cached under a smaller KEEP holds fewer senses
    // than the ranker needs, and those are exactly the polysemous words the
    // ranking is for. Reading it as a miss refetches and overwrites the same
    // key, which beats bumping the cache prefix: no orphaned dict2_ records,
    // and no rename across ai-cache.js's 500-entry pool.
    senseKeep: PBP_DICT_SENSE_KEEP,
    sourceLabel: "Wiktionary",
    sourceUrl: pbpDictSafeUrl(src.url),
    license: typeof lic.name === "string" ? lic.name : ""
  };
}

// A healthy 404 and a healthy 200 with no renderable entries are both
// semantic misses. Transport/server failures must never become "no entry".
function pbpDictClassifyResponse(out) {
  const status = out && out.status;
  const norm = status === 200 ? pbpDictNormalizeEntry(out.data) : null;
  if (norm) return { kind: "hit", norm };
  if (status === 404 || status === 200) return { kind: "miss", norm: null };
  return { kind: "failure", norm: null };
}

function pbpDictWiktionaryUrl(term) {
  return "https://en.wiktionary.org/wiki/" + encodeURIComponent(pbpDictNormalizeTerm(term));
}

function pbpDictCircuitAfter(state, event, now) {
  const prev = state || { failures: 0, openUntil: 0 };
  if (event === "healthy") return { failures: 0, openUntil: 0 };
  if (event !== "failure") return { failures: prev.failures || 0, openUntil: prev.openUntil || 0 };
  const failures = (prev.failures || 0) + 1;
  return failures >= PBP_DICT_CIRCUIT_THRESHOLD
    ? { failures, openUntil: Number(now || 0) + PBP_DICT_CIRCUIT_COOLDOWN_MS }
    : { failures, openUntil: 0 };
}

// LEMMA-first-line protocol (spec §3). "LEMMA: -" or missing marker = none.
function pbpDictParseCtxAnswer(full) {
  const text = String(full || "");
  const m = text.match(/^\s*LEMMA:\s*(.*)\s*$/m);
  let lemma = "";
  if (m) {
    const v = m[1].trim();
    if (v && v !== "-") lemma = v;
  }
  const gloss = text.replace(/^\s*LEMMA:.*$/m, "").trim();
  return { lemma, gloss };
}

// Progressive-display helper: hide a complete LEMMA line, and hide the
// accumulator entirely while it is still a strict prefix of a LEMMA line
// ("L", "LE", ..., "LEMMA: ru" with no newline yet). Ordinary text like
// "Hello" or "AI" must pass through untouched.
function pbpDictStripLemmaLine(acc) {
  const s = String(acc || "");
  const firstLine = s.split("\n", 1)[0];
  if (s.indexOf("\n") === -1) {
    const marker = "LEMMA:";
    if (marker.startsWith(firstLine.trim()) && firstLine.trim() !== "") return "";
    if (firstLine.trim().startsWith(marker)) return "";
  }
  return s.replace(/^\s*LEMMA:.*$/m, "").replace(/^\s+/, "");
}

// djb2, base36 — context hash for the gloss cache key.
function pbpDictCtxHash(str) {
  let h = 5381;
  const s = String(str || "");
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

// Contextual-gloss prompt (spec §3): selection + host sentence + title ONLY.
function pbpDictBuildCtxPrompt(p) {
  const selection = String((p && p.selection) || "").slice(0, 400);
  const sentence = String((p && p.sentence) || "").slice(0, 1000);
  const title = String((p && p.title) || "(untitled)");
  const answerLang = (p && p.answerLang) || "English";
  const system = "You are a precise contextual dictionary embedded in an article reader. " +
    "Explain what the selected term means in this specific sentence, in " + answerLang + ". " +
    "Write the ENTIRE answer in " + answerLang + " and never switch languages, even when the " +
    "selected term is a grammar particle or function word (models drift to English there). " +
    "The FIRST line of your answer must be exactly 'LEMMA: <dictionary base form of the selected term>' " +
    "(write 'LEMMA: -' if it is already the base form or has none). " +
    "Then a blank line, then 1-3 short sentences: the part of speech if known, and the sense the term carries in THIS sentence. " +
    "Do not output IPA or any phonetic transcription. Do not invent example sentences. No headings, no lists.";
  const parts = [];
  parts.push("Article title: " + title);
  if (sentence) parts.push("Sentence containing the term:\n" + sentence);
  parts.push("Selected term:\n" + selection);
  // Language directive repeated LAST: recency measurably improves compliance
  // on small/fast models, which otherwise answer function-word queries in
  // English regardless of the system instruction (real-device report).
  parts.push("Answer language: " + answerLang + " only.");
  return { system, prompt: parts.join("\n\n") };
}

// Anki CSV-style field quoting.
function pbpDictTsvField(v) {
  const s = String(v == null ? "" : v);
  if (/[\t\n\r"]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

// TSV export (6 columns: Term/Reading/Definition/Context/Source/License).
// Six columns, always. A locally derived Chinese sense is appended INSIDE the
// Definition column and its labelled origin INSIDE License, so a device without
// the pack produces the same shape with those pieces simply absent -- never an
// empty seventh column, and never a dangling separator.
function pbpDictTsv(rows) {
  const head = "#separator:Tab\n#html:false\n#columns:Term\tReading\tDefinition\tContext\tSource\tLicense\n";
  const body = (Array.isArray(rows) ? rows : []).map((r) => {
    const ctx = Array.isArray(r.contexts) ? r.contexts.filter(Boolean).join("\n") : String(r.contexts || "");
    const def = r.zh ? [r.definition, r.zh].filter(Boolean).join("\n") : r.definition;
    const lic = r.zhNote ? [r.license, r.zhNote].filter(Boolean).join(" | ") : r.license;
    return [r.term, r.reading, def, ctx, r.source, lic].map(pbpDictTsvField).join("\t");
  }).join("\n");
  return head + body + (body ? "\n" : "");
}

// ---- PURE END ----

// ---- Pronunciation (speechSynthesis + click-token guard) ----------------
const PBP_DICT_SPEAKER_SVG = typeof PBP_ICONS !== "undefined" ? PBP_ICONS.speaker : "";

// Static inline SVG (Feather book-open). Constant string, never model text.
// Consumed by the highlight selection bar's dictionary button (md-highlight.js).
// Alias of the shared book icon (Lucide book-open) -- same glyph the
// explain-pop action switch and the highlight card use for Dictionary.
const PBP_DICT_BOOK_SVG = typeof PBP_ICONS !== "undefined" ? PBP_ICONS.book : "";

// Known-word toggle faces (Feather check-circle / rotate-ccw).
const PBP_DICT_KNOWN_SVG = typeof PBP_ICONS !== "undefined" ? PBP_ICONS.checkCircle : "";
const PBP_DICT_LEARNING_SVG = typeof PBP_ICONS !== "undefined" ? PBP_ICONS.rotateCcw : "";

// Ready-signal dot (inline SVG, never a literal glyph). Filled circle plus a
// down chevron so it also reads as "there is more below".
// Composed from pack parts (Lucide chevron-down + a plain dot primitive):
// "a fresh contextual sense landed below" marker.
const PBP_DICT_CTX_READY_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="2.6" fill="currentColor" stroke="none"/><g transform="translate(0 5)"><path d="m6 9 6 6 6-6"/></g></svg>';

// The AI gloss streams in seconds after the (often cached, instant) online
// entry, and it renders at the BOTTOM of the popover body -- a long entry
// pushes it out of view, and there is no signal when it lands. When the
// finished gloss sits below the fold, light the head-row dot; clicking it
// scrolls the gloss into view. It self-clears once the gloss is seen.
// Explicit click, never hover; no auto-scroll steals the reading position.
function _pbpDictCtxSignal(body, ctxEl, btn) {
  if (!body || !btn || !ctxEl.isConnected) return;
  const br = body.getBoundingClientRect();
  if (ctxEl.getBoundingClientRect().top < br.bottom - 12) return; // already visible
  btn.hidden = false;
  const io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) {
      btn.hidden = true;
      io.disconnect();
    }
  }, { root: body });
  io.observe(ctxEl);
  btn.addEventListener("click", () => {
    // shared.js pbpScrollIntoView owns the reduced-motion downgrade -- the
    // md-preview.css comment already points every smooth scroll at it.
    pbpScrollIntoView(ctxEl, { block: "start", behavior: "smooth" });
    btn.hidden = true;
    io.disconnect();
  }, { once: true });
}

let _pbpDictSpeakSeq = 0;
function pbpDictSpeak(text, lang) {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    const token = ++_pbpDictSpeakSeq; // a newer click invalidates every pending pick()
    synth.cancel();
    const u = new SpeechSynthesisUtterance(String(text || "").slice(0, 200));
    const primary = pbpDictPrimaryLang(lang);
    if (primary) u.lang = primary;
    let spoken = false;
    let timer = 0;
    // Named handler (not { once: true }) so a stale-token bail-out or the
    // 400ms timeout firing FIRST still removes it -- otherwise a repeat click
    // before voiceschanged ever fires leaves the old listener registered
    // forever, accumulating one per click.
    const onVoicesChanged = () => pick();
    const cleanup = () => {
      clearTimeout(timer);
      synth.removeEventListener("voiceschanged", onVoicesChanged);
    };
    const pick = () => {
      if (spoken || token !== _pbpDictSpeakSeq) { cleanup(); return; }
      spoken = true;
      cleanup();
      // Prefer a LOCAL voice. Chrome ships "Google <language>" voices with
      // localService:false -- those synthesize on Google's servers, so picking
      // one would send the looked-up word off the device. Leaving u.voice unset
      // is NOT the safe default either: the UA default is frequently one of
      // those remote voices. Both residual paths (no local voice for the
      // language, and no language at all) are disclosed in docs/privacy.md.
      if (primary) {
        const vs = synth.getVoices().filter((x) => x.lang && x.lang.toLowerCase().startsWith(primary));
        const v = vs.find((x) => x.localService) || vs[0];
        if (v) u.voice = v;
      }
      synth.speak(u);
    };
    if (synth.getVoices().length) { pick(); return; }
    synth.addEventListener("voiceschanged", onVoicesChanged);
    timer = setTimeout(pick, 400);
  } catch (_) {}
}

// ---- Dictionary slot ----------------------------------------------------
async function _pbpDictHasPerm() {
  try { return await chrome.permissions.contains({ origins: [PBP_DICT_ORIGIN + "/*"] }); } catch (_) { return false; }
}

// Child signal = parent abort OR timeout (no AbortSignal.any: Chrome floor 110).
// Keep the first cause so closing the popover never trips the service circuit.
function _pbpDictChildSignal(parent, ms) {
  const c = new AbortController();
  let reason = "";
  const abortWith = (next) => {
    if (c.signal.aborted) return;
    reason = next;
    c.abort();
  };
  const onAbort = () => abortWith("parent");
  if (parent) {
    if (parent.aborted) abortWith("parent");
    else parent.addEventListener("abort", onAbort, { once: true });
  }
  const timer = setTimeout(() => abortWith("timeout"), ms);
  return {
    signal: c.signal,
    reason: () => reason,
    done: () => { clearTimeout(timer); if (parent) parent.removeEventListener("abort", onAbort); }
  };
}

let _pbpDictCircuit = { failures: 0, openUntil: 0 };

async function _pbpDictFetch(lang, term, parentSignal) {
  if (parentSignal && parentSignal.aborted) throw new DOMException("Aborted", "AbortError");
  const now = Date.now();
  if (_pbpDictCircuit.openUntil && now >= _pbpDictCircuit.openUntil) {
    _pbpDictCircuit = { failures: 0, openUntil: 0 };
  }
  if (_pbpDictCircuit.openUntil > now) {
    const err = new Error("Dictionary service cooling down");
    err.code = "dict_circuit_open";
    err.retryInMs = _pbpDictCircuit.openUntil - now; // lets the UI say when, not just that
    throw err;
  }
  const child = _pbpDictChildSignal(parentSignal, 8000);
  let failureRecorded = false;
  const failed = () => {
    if (failureRecorded) return;
    failureRecorded = true;
    _pbpDictCircuit = pbpDictCircuitAfter(_pbpDictCircuit, "failure", Date.now());
  };
  try {
    const res = await fetch(
      PBP_DICT_ORIGIN + "/api/v1/entries/" + encodeURIComponent(lang) + "/" + encodeURIComponent(term),
      { signal: child.signal }
    );
    if (res.status === 429 || res.status >= 500) {
      failed();
      return { status: res.status, data: null };
    }
    if (res.status === 404 || !res.ok) {
      _pbpDictCircuit = pbpDictCircuitAfter(_pbpDictCircuit, "healthy", Date.now());
      return { status: res.status, data: null };
    }
    const data = await res.json();
    _pbpDictCircuit = pbpDictCircuitAfter(_pbpDictCircuit, "healthy", Date.now());
    return { status: res.status, data };
  } catch (e) {
    if (child.reason() !== "parent") failed();
    throw e;
  } finally { child.done(); }
}

// External dictionary data renders through textContent ONLY.
function _pbpDictTagLabel(tag) {
  const key = { pinyin: "dictTagPinyin", simp: "dictTagSimplified", trad: "dictTagTraditional" }[
    String(tag || "").toLowerCase()
  ];
  return key ? t(key) : String(tag || "");
}

// Shared by the online entry and the local ECDICT block. Every read is
// defensive: CC-CEDICT norms and dict2_ records cached before these fields
// existed carry none of them.
function _pbpDictSenseLi(s, formOf) {
  const li = document.createElement("li");
  const stags = s.tags || [];
  if (stags.length) {
    const tg = document.createElement("span");
    tg.className = "xp-dict-sense-tag";
    tg.textContent = "(" + stags.join(", ") + ")";
    li.appendChild(tg);
    li.appendChild(document.createTextNode(" "));
  }
  // In a form-of-only entry the definition is a grammar pointer, and without
  // an AI key it used to be a dead end. Make the lemma itself the way out:
  // one click reruns the lookup on the base form. Parse miss = plain text.
  const pointer = formOf ? pbpDictLemmaFromPointer(s.definition) : null;
  if (pointer) {
    li.appendChild(document.createTextNode(pointer.prefix));
    const jump = document.createElement("button");
    jump.type = "button";
    jump.className = "xp-dict-lemma-link";
    jump.textContent = pointer.lemma;
    jump.addEventListener("click", () => {
      const live = _pbpDictCurrent;
      if (live && typeof live.rerunWith === "function") live.rerunWith(pointer.lemma);
    });
    li.appendChild(jump);
    if (pointer.suffix) li.appendChild(document.createTextNode(pointer.suffix));
  } else {
    li.appendChild(document.createTextNode(s.definition));
  }
  for (const d of s.subsenses || []) {
    const sub = document.createElement("div");
    sub.className = "xp-dict-subsense";
    sub.textContent = d;
    li.appendChild(sub);
  }
  for (const x of s.examples || []) {
    const ex = document.createElement("div");
    ex.className = "xp-dict-example";
    ex.textContent = x;
    li.appendChild(ex);
  }
  for (const [key, words] of [["dictSynonyms", s.synonyms], ["dictAntonyms", s.antonyms]]) {
    if (!words || !words.length) continue;
    const row = document.createElement("div");
    row.className = "xp-dict-rel";
    const lb = document.createElement("span");
    lb.className = "xp-dict-rel-label";
    lb.textContent = t(key);
    row.appendChild(lb);
    row.appendChild(document.createTextNode(" " + words.join(", ")));
    li.appendChild(row);
  }
  return li;
}

// Default density is unchanged: SHOW senses render, the rest sit behind an
// explicit click ("expand the other N"). The data is already in memory and
// in the dict2_ cache -- the button costs no request. Click, never hover.
function _pbpDictRenderSenses(parent, senses, formOf) {
  const ol = document.createElement("ol");
  ol.className = "xp-dict-senses";
  const rest = senses.slice(PBP_DICT_SENSE_SHOW);
  for (const s of senses.slice(0, PBP_DICT_SENSE_SHOW)) ol.appendChild(_pbpDictSenseLi(s, formOf));
  parent.appendChild(ol);
  if (rest.length) {
    const more = document.createElement("button");
    more.type = "button";
    more.className = "xp-dict-more";
    more.textContent = t("dictMoreSenses", String(rest.length));
    more.addEventListener("click", () => {
      for (const s of rest) ol.appendChild(_pbpDictSenseLi(s, formOf));
      more.remove();
    });
    parent.appendChild(more);
  }
}

function _pbpDictRenderEntry(slot, norm, term, lang, selectedTerm, sentence) {
  slot.replaceChildren();
  const actual = pbpDictNormalizeTerm(norm.word || term);
  const selected = pbpDictNormalizeTerm(selectedTerm);
  if (selected && actual && actual !== selected) {
    const matched = document.createElement("div");
    matched.className = "xp-dict-match";
    matched.textContent = t("dictMatchedHeadword", actual);
    slot.appendChild(matched);
  }
  for (const e of pbpDictOrderForContext(norm.entries, sentence)) {
    const ent = document.createElement("div");
    ent.className = "xp-dict-entry";
    if (e.ipas.length || e.pos) {
      const line = document.createElement("div");
      line.className = "xp-dict-ipa-line";
      if (e.pos) {
        const pos = document.createElement("span");
        pos.className = "xp-dict-pos";
        pos.textContent = e.pos;
        line.appendChild(pos);
      }
      for (const p of e.ipas) {
        const ipa = document.createElement("span");
        ipa.className = "xp-dict-ipa";
        ipa.textContent = p.text;
        line.appendChild(ipa);
        if (p.tags.length) {
          const tag = document.createElement("span");
          tag.className = "xp-dict-ipa-tag";
          tag.textContent = p.tags.map(_pbpDictTagLabel).join(", ");
          line.appendChild(tag);
        }
      }
      if (e.ipaMore > 0) {
        const moreIpa = document.createElement("span");
        moreIpa.className = "xp-dict-ipa-tag";
        moreIpa.textContent = t("dictMoreIpa", String(e.ipaMore));
        line.appendChild(moreIpa);
      }
      ent.appendChild(line);
    }
    if (e.forms.length) {
      const forms = document.createElement("div");
      forms.className = "xp-dict-forms";
      forms.textContent = e.forms.map((f) => f.word + (f.tags.length ? " (" + f.tags.map(_pbpDictTagLabel).join(", ") + ")" : "")).join(" · ");
      ent.appendChild(forms);
    }
    if (e.senses.length) _pbpDictRenderSenses(ent, e.senses, !!norm.formOfOnly);
    slot.appendChild(ent);
  }
  const src = document.createElement("div");
  src.className = "xp-dict-src";
  const label = document.createElement("span");
  label.textContent = t("dictSource") + " ";
  const a = document.createElement("a");
  // Defense-in-depth: sourceUrl is already sanitized at the normalize/merge
  // layers, but this is the only point it reaches a live href.
  a.href = pbpDictSafeUrl(norm.sourceUrl) || pbpDictWiktionaryUrl(term);
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.textContent = (norm.sourceLabel || "Wiktionary") + " · " + (norm.license || "CC BY-SA");
  src.appendChild(label);
  src.appendChild(a);
  slot.appendChild(src);
}

function _pbpDictSlotMsg(slot, text) {
  slot.replaceChildren();
  const p = document.createElement("div");
  p.className = "xp-dict-msg";
  p.textContent = text;
  slot.appendChild(p);
}

function _pbpDictSlotFallback(slot, text, term) {
  _pbpDictSlotMsg(slot, text);
  const src = document.createElement("div");
  src.className = "xp-dict-src";
  const a = document.createElement("a");
  a.href = pbpDictWiktionaryUrl(term);
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.textContent = t("dictViewWiktionary");
  src.appendChild(a);
  slot.appendChild(src);
}

// The ECDICT block is an ADDITIONAL Chinese section above the online entry, not
// a short circuit like the zh path: freedictionaryapi's English coverage is
// excellent, so replacing it would throw away senses, examples, forms and IPA.
//
// Six contracts, and the first five are the opposite of what the zh branch does:
//  1. English only.
//  2. Never awaited by the online chain -- the network request must not wait on
//     an IDB read. Launched fire-and-forget for that reason.
//  3. UI-silent on EVERY failure, including thrown ones, but platform errors
//     still get a console.warn (name and message only, never the term).
//  4. Re-checks abort and run identity after each await, so a late answer cannot
//     write into a container that belongs to a newer lookup.
//  5. Contributes nothing to _pbpDictSlotRun's return value.
//  6. Writes no cur.* field, so the saved vocabulary record is unaffected.
async function _pbpDictEcdictSide(localEl, term, lang, parentSignal, cur) {
  if (lang !== "en") return;
  const alive = () => !(parentSignal && parentSignal.aborted) && _pbpDictCurrent === cur && localEl.isConnected;
  try {
    const loaded = await _pbpDictLoadPack();
    if (!alive() || !loaded || typeof pbpEcdictLookup !== "function") return;
    let local = await pbpEcdictLookup(term);
    if (!alive()) return;
    // Exact first -- "e.g." is a real headword, so cleaning cannot run up
    // front. On a genuine miss, retry the cleaned form: "ubiquitous." and
    // "don’t" have no ECDICT key of their own.
    if (local && local.state === "ready-miss") {
      const cleaned = pbpDictCleanCandidate(term, lang);
      if (cleaned) {
        local = await pbpEcdictLookup(cleaned);
        if (!alive()) return;
      }
    }
    if (!local || local.state !== "hit") return;   // unavailable / miss / error: say nothing
    const norm = pbpEcdictEntryToNorm(local.rows, local.matched);
    if (!norm.entries.length) return;
    const box = document.createElement("div");
    box.className = "xp-dict-local-box";
    const title = document.createElement("div");
    title.className = "xp-dict-local-title";
    title.textContent = t("dictZhBlockTitle");
    box.appendChild(title);
    // EVERY entry, not just the first. Case folding puts distinct headwords on
    // one key -- "US" (the country) and "us" (the pronoun) both fold to "us" --
    // so rendering entries[0] would show whichever the file happened to list
    // first and silently drop the other.
    for (const e of norm.entries) _pbpDictRenderSenses(box, e.senses);
    localEl.replaceChildren(box);
  } catch (e) {
    // Swallowing without a trace is what turns a platform fault into a silent
    // "no Chinese for this word" that nobody can diagnose.
    console.warn("[dict] local ECDICT lookup failed:", e && e.name, e && e.message);
  }
}

function _pbpDictSlotSkeleton(slot) {
  slot.replaceChildren();
  const sk = document.createElement("div");
  sk.className = "xp-skel";
  slot.appendChild(sk);
  const sr = document.createElement("span");
  sr.className = "sr-only";
  sr.textContent = t("dictLoading");
  slot.appendChild(sr);
}

// dict-pack.js is NOT in md-preview.html: most users never import the pack,
// and the reader stays lean. First zh lookup injects it once (CSP 'self').
let _pbpDictPackLoad = null;
function _pbpDictLoadPack() {
  if (_pbpDictPackLoad) return _pbpDictPackLoad;
  _pbpDictPackLoad = new Promise((resolve) => {
    if (typeof pbpPackLookup === "function") { resolve(true); return; }
    const s = document.createElement("script");
    s.src = "dict-pack.js";
    s.onload = () => resolve(true);
    // Drop the cached promise on failure (transient network blip, extension
    // update mid-flight) so the NEXT zh lookup retries the injection instead
    // of permanently remembering this one failure.
    s.onerror = () => { _pbpDictPackLoad = null; resolve(false); };
    document.head.appendChild(s);
  });
  return _pbpDictPackLoad;
}

async function _pbpDictCacheGet(lang, term) {
  try {
    const hit = await pbpAiCacheGet(pbpDictQueryCacheKey(lang, term));
    const rec = hit && hit.result ? hit.result : null;
    return rec && rec.senseKeep === PBP_DICT_SENSE_KEEP ? rec : null;
  } catch (_) { return null; }
}

async function _pbpDictCacheSet(lang, term, norm) {
  try { await pbpAiCacheSet(pbpDictQueryCacheKey(lang, term), norm, Date.now()); } catch (_) {}
}

async function _pbpDictLookupCandidate(lang, term, parentSignal, skipCache) {
  if (!skipCache) {
    const cached = await _pbpDictCacheGet(lang, term);
    if (parentSignal && parentSignal.aborted) return { kind: "aborted", norm: null };
    if (cached) return { kind: "hit", norm: cached };
  }
  const classified = pbpDictClassifyResponse(await _pbpDictFetch(lang, term, parentSignal));
  if (classified.kind === "hit") await _pbpDictCacheSet(lang, term, classified.norm);
  return classified;
}

// exact cache -> exact request -> lowercase candidate -> AI lemma -> degrade.
// Returns normalized entry or null; the RUN layer merges into _pbpDictCurrent.
// onRerun: run-level restart used after a permission grant (never slot-local
// recursion — Codex HIGH 2).
async function _pbpDictSlotRun(slot, term, lang, parentSignal, lemmaPromise, onRerun, sentence) {
  const exact = pbpDictNormalizeTerm(term);
  if (!exact) { _pbpDictSlotFallback(slot, t("dictNoEntry"), term); return null; }
  // Unknown language is NOT a dictionary miss: nothing was queried. Saying
  // "no entry" here reads as "the dictionary is missing this word" and makes
  // Auto look broken; name the visible control the reader can fix it with.
  if (!lang) { _pbpDictSlotFallback(slot, t("dictLangUnknown"), term); return null; }
  if (lang === "zh") {
    const loaded = await _pbpDictLoadPack();
    if (parentSignal && parentSignal.aborted) return null;
    if (loaded && typeof pbpPackLookup === "function" && typeof pbpCedictLookupKeys === "function") {
      // Leading quotes/brackets break EVERY prefix key (they all start at code
      // point 0), while trailing junk falls off on its own as the prefix
      // shortens. Hanzi headwords never carry edge punctuation, so cleaning
      // up front is safe here, unlike the English exact-first ladder.
      const zhTerm = pbpDictCleanCandidate(exact, lang) || exact;
      let local;
      try { local = await pbpPackLookup(pbpCedictLookupKeys(zhTerm)); }
      catch (_) { local = { state: "error" }; }
      if (parentSignal && parentSignal.aborted) return null;
      if (local && local.state === "hit") {
        const norm = pbpCedictEntryToNorm(local.rows, local.matched);
        _pbpDictRenderEntry(slot, norm, local.matched, lang, term, sentence);
        // Prefix hits render norm.word, which may be SHORTER than the raw
        // selection; the run-level .then() re-syncs cur.term when this settles.
        return norm;
      }
      if (local && local.state === "ready-miss") {
        _pbpDictSlotFallback(slot, t("dictNoEntry"), term);
        return null;
      }
      if (local && local.state === "error") {
        _pbpDictSlotFallback(slot, t("dictLoadFailed"), term);
        return null;
      }
    }
  }
  const exactHit = await _pbpDictCacheGet(lang, exact);
  if (parentSignal && parentSignal.aborted) return null;
  if (exactHit) {
    _pbpDictRenderEntry(slot, exactHit, exact, lang, term, sentence);
    return exactHit;
  }
  if (!(await _pbpDictHasPerm())) {
    slot.replaceChildren();
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "xp-dict-connect";
    btn.textContent = t("dictConnect");
    const hint = document.createElement("div");
    hint.className = "xp-dict-msg";
    hint.textContent = t("dictConnectHint");
    const feedback = document.createElement("div");
    feedback.className = "xp-dict-msg";
    feedback.setAttribute("role", "status");
    feedback.setAttribute("aria-live", "polite");
    feedback.hidden = true;
    btn.addEventListener("click", async () => {
      if (btn.disabled) return;
      btn.disabled = true;
      feedback.hidden = true;
      feedback.textContent = "";
      let granted = false;
      // FIRST await in the click chain must be the permission request.
      try { granted = await chrome.permissions.request({ origins: [PBP_DICT_ORIGIN + "/*"] }); } catch (_) {}
      if (!granted) {
        btn.textContent = t("dictConnectRetry");
        feedback.hidden = false;
        feedback.textContent = t("dictPermissionDenied");
        btn.disabled = false;
        return;
      }
      if (typeof onRerun === "function") onRerun(); // full-run restart merges results properly
    });
    slot.appendChild(btn);
    slot.appendChild(hint);
    slot.appendChild(feedback);
    return null;
  }
  _pbpDictSlotSkeleton(slot);
  const tried = new Set();
  const runCandidate = async (candidate, skipCache) => {
    const key = pbpDictCacheKeyExact(lang, candidate);
    if (tried.has(key)) return { kind: "miss", norm: null };
    tried.add(key);
    return _pbpDictLookupCandidate(lang, candidate, parentSignal, skipCache);
  };
  const finish = async (candidate, result, aliasExact) => {
    if (result.kind !== "hit") return null;
    if (aliasExact) await _pbpDictCacheSet(lang, exact, result.norm);
    if (parentSignal && parentSignal.aborted) return null;
    _pbpDictRenderEntry(slot, result.norm, candidate, lang, term, sentence);
    return result.norm;
  };
  // A form-of-only answer is a grammar pointer, not a meaning. Hold it back and
  // keep looking; render it at the end only because a cross-reference still
  // beats "no entry".
  let pointer = null;
  try {
    for (const cand of pbpDictQueryCandidates(exact, lang)) {
      const res = await runCandidate(cand.term, cand.skipCache);
      if (res.kind === "failure") throw new Error("Dictionary request failed");
      if (res.kind !== "hit") continue;
      if (res.norm && res.norm.formOfOnly) {
        if (!pointer) pointer = [cand.term, res, cand.aliasExact];
        continue;
      }
      return finish(cand.term, res, cand.aliasExact);
    }

    const lemma = pbpDictNormalizeTerm(await lemmaPromise); // resolves on ALL ctx-slot exits
    if (parentSignal && parentSignal.aborted) return null;
    if (lemma && lemma !== "-" && !tried.has(pbpDictCacheKeyExact(lang, lemma))) {
      const third = await runCandidate(lemma, false);
      if (third.kind === "failure") throw new Error("Dictionary request failed");
      if (third.kind === "hit") {
        if (!(third.norm && third.norm.formOfOnly)) return finish(lemma, third, false);
        if (!pointer) pointer = [lemma, third, false];
      }
    }
    if (pointer) return finish(pointer[0], pointer[1], pointer[2]);
  } catch (e) {
    if (parentSignal && parentSignal.aborted) return null;
    if (e && e.code === "dict_circuit_open") {
      // The breaker is a self-protection pause, not a fault. Say when it
      // lifts instead of the generic "unavailable", and offer no retry:
      // clicking one inside the window would only re-throw this same error.
      const secs = Math.max(1, Math.ceil((e.retryInMs || PBP_DICT_CIRCUIT_COOLDOWN_MS) / 1000));
      _pbpDictSlotFallback(slot, t("dictCircuitCooling", String(secs)), term);
      return null;
    }
    _pbpDictSlotFallback(slot, t("dictLoadFailed"), term);
    // Same affordance the AI slot has had all along: a plain failure gets a
    // retry that restarts the whole run (never slot-local recursion).
    if (typeof onRerun === "function") {
      const retry = document.createElement("button");
      retry.type = "button";
      retry.className = "xp-retry";
      retry.innerHTML = PBP_ICONS.refresh; // static shared constant, never page content
      retry.append(t("explainErrRetry"));
      retry.addEventListener("click", () => { retry.disabled = true; onRerun(); });
      slot.appendChild(retry);
    }
    return null;
  }
  _pbpDictSlotFallback(slot, t("dictNoEntry"), term);
  return null;
}

// ---- Contextual-gloss slot + run assembly -------------------------------
let _pbpDictRunSeq = 0;
// Manual language override: PER-DOCUMENT memory only (reset on pbp:rendered).
// It used to persist via settings, which silently forced every later lookup
// in every article to the stale choice -- a zh page kept "no entry"-ing
// because "en" was stuck from days earlier (real-device report).
let _pbpDictManualLang = "";
let _pbpDictCurrent = null;      // merged results of the LIVE run only
let _pbpDictChildCtrl = null;    // the live run's own controller (child of md-ask's)
let _pbpDictParentCleanup = null; // removes the previous run's parent-abort listener
let _pbpDictSaveTarget = null;   // {itemId} | {range} | null — explain-shaped
let _pbpDictOwner = "ownerless"; // set from pbp:rendered detail.account (Task 8 listener)

// Article-level CLD prior over the ORIGINAL prose (batch B). detectArticleLang
// (md-preview.js) is a font/RTL script heuristic that names no Latin or
// Cyrillic language, so Latin articles had no article rung at all. This one
// samples the original text -- .pb-tr overlays and PRE excluded, so a
// translated view never pollutes the prior -- and runs CLD once per document.
// A full-prose sample is where CLD is actually reliable (Chromium documents
// ~100+ chars); below that the prior abstains rather than guess.
let _pbpDictArticlePrior = null; // per-document Promise<{lang, reliable}>
// Excluded from the prior's sample: code (any nesting), translation overlays
// and their retry pills, and reader UI injected after render (image-fix rows).
// The sample is read lazily at first lookup, so translation-era nodes CAN be
// present -- the filter, not timing, is what keeps the original-prose promise.
const PBP_DICT_SAMPLE_EXCLUDE = "pre, code, .pb-tr, .pb-tr-err, .pbp-img-fix-ui";
function _pbpDictArticleSample() {
  const view = document.getElementById("rendered-view");
  if (!view) return "";
  let out = "";
  for (const el of view.children) {
    if (el.matches(PBP_DICT_SAMPLE_EXCLUDE)) continue;
    let text = el.textContent;
    if (el.querySelector(PBP_DICT_SAMPLE_EXCLUDE)) {
      const clone = el.cloneNode(true); // only blocks that actually need scrubbing pay the clone
      clone.querySelectorAll(PBP_DICT_SAMPLE_EXCLUDE).forEach((n) => n.remove());
      text = clone.textContent;
    }
    out += " " + text;
    if (out.length >= 800) break;
  }
  return out.replace(/\s+/g, " ").trim().slice(0, 800);
}
function _pbpDictArticleCld() {
  if (!_pbpDictArticlePrior) {
    const sample = _pbpDictArticleSample();
    _pbpDictArticlePrior = sample.length >= 100
      ? _pbpDictDetect(sample)
      : Promise.resolve({ lang: "", reliable: false });
  }
  return _pbpDictArticlePrior;
}

function _pbpDictDetect(text) {
  return new Promise((resolve) => {
    try {
      chrome.i18n.detectLanguage(String(text || "").slice(0, 800), (r) => {
        const top = r && Array.isArray(r.languages) && r.languages[0] ? r.languages[0].language : "";
        resolve({ lang: top, reliable: !!(r && r.isReliable) });
      });
    } catch (_) { resolve({ lang: "", reliable: false }); }
  });
}

// Ladder (spec §3, extended): manual -> explicit selection metadata
// (.pb-tr lang / highlight item.lang -- our own stamps, still gated for
// script fit so an untranslated Latin brand inside a zh translation block
// falls through) -> selection-script rung (deterministic, no CLD) ->
// reliable sentence CLD -> reliable block CLD (+article fallback) -> Latin
// last resort. EVERY automatic rung passes pbpDictAcceptLang, so a
// confident detection can no longer route a query the dropdown cannot
// express or the selection's script contradicts.
async function _pbpDictResolveLang(cap, ctx, manual) {
  const view = document.getElementById("rendered-view");
  const articleLang = view ? (view.getAttribute("lang") || "") : "";
  if (pbpDictPrimaryLang(manual)) return pbpDictPrimaryLang(manual);
  const sel = String(cap.text || "");
  const explicit = pbpDictAcceptLang(ctx.selLang || "", sel);
  if (explicit) return explicit;
  const byScript = pbpDictScriptLang(sel, ctx.sentence || "");
  if (byScript) return pbpDictCorrectCjkLang(byScript, articleLang);
  const bySentence = await _pbpDictDetect(ctx.sentence || cap.text);
  const first = pbpDictAcceptLang(pbpDictRouteLang(bySentence.lang, bySentence.reliable, "", ""), sel);
  if (first) return pbpDictCorrectCjkLang(first, articleLang);
  const byBlock = await _pbpDictDetect(ctx.blockText || "");
  const routed = pbpDictAcceptLang(
    pbpDictCorrectCjkLang(pbpDictRouteLang(byBlock.lang, byBlock.reliable, articleLang, ""), articleLang), sel);
  if (routed) return routed;
  // Article prior: a reliable full-prose read routes a selection whose local
  // context was too short or too jargon-heavy to decide (a German word
  // selected alone in a German article). Reliable-only: an unreliable
  // article read means the document itself is mixed, no prior to take.
  const byArticle = await _pbpDictArticleCld();
  const prior = pbpDictAcceptLang(pbpDictRouteLang(byArticle.lang, byArticle.reliable, "", ""), sel);
  if (prior) return pbpDictCorrectCjkLang(prior, articleLang);
  return pbpDictLatinFallback(sel, bySentence.lang, byBlock.lang);
}

// Whole function wrapped so EVERY exit resolves the lemma exactly once
// (Codex HIGH 4) and no pre-try throw can hang the dictionary slot's 404 wait.
async function _pbpDictCtxRun(el, cap, ctx, s, signal, resolveLemmaOnce, lang) {
  try {
    if (typeof pbpAiAvailable === "function" && !pbpAiAvailable(s)) {
      const msg = document.createElement("div");
      msg.className = "xp-dict-msg";
      msg.textContent = t("dictAiNotConfigured");
      el.replaceChildren(msg);
      return null; // finally resolves lemma
    }
    const langName = pbpExplainLangName(uiLangToBCP47());
    const title = document.getElementById("preview-title").textContent;
    const { system, prompt } = pbpDictBuildCtxPrompt({
      selection: cap.text, sentence: ctx.sentence, title, answerLang: langName
    });
    const provider = s.aiProvider || "gemini";
    const model = (typeof pbpAiEffectiveModel === "function" ? pbpAiEffectiveModel(s) : "") || "";
    // dictctx2: prompt-version bump. The v1 prompt let models answer
    // function-word queries in English regardless of the answer-language
    // instruction, and those drifted answers were cached under the correct
    // language key -- a prefix bump orphans them (LRU evicts naturally).
    const cacheKey = "dictctx2_" + _pbpDictOwner + "_" + provider + "_" + model + "_"
      + pbpDictCacheKeyPublic(lang, cap.text) + "_" + pbpDictCtxHash(ctx.sentence + "␟" + title + "␟" + langName);
    const finish = (full) => {
      const parsed = pbpDictParseCtxAnswer(full);
      const md = document.createElement("div");
      md.className = "xp-md";
      md.innerHTML = renderMarkdown(parsed.gloss); // single sanitize point
      const tag = document.createElement("div");
      tag.className = "xp-dict-ailabel";
      // Label only marks the content as AI-generated; the provider and model
      // already sit in the footer's .xp-model (real-device report: showing
      // the provider twice read as clutter).
      tag.textContent = t("dictAiLabel");
      el.replaceChildren(md, tag);
      return parsed;
    };
    const hit = await pbpAiCacheGet(cacheKey).catch(() => null);
    if (hit && typeof hit.result === "string") {
      const parsed = finish(hit.result);
      resolveLemmaOnce(parsed.lemma);
      return parsed;
    }
    const streamEl = document.createElement("div");
    streamEl.className = "xp-stream";
    let started = false, pending = "", rafId = 0;
    const flush = () => { rafId = 0; streamEl.textContent = pbpDictStripLemmaLine(pending); };
    try {
      pbpAiBumpCounter("explain"); // dict shares the explain usage bucket
      const full = await callAIStream(s, prompt, {
        maxTokens: 512, model: pbpAiResolveModelOverride(s), system, signal
      }, (delta, acc) => {
        if (!started) { started = true; el.replaceChildren(streamEl); }
        pending = acc;
        if (!rafId) rafId = requestAnimationFrame(flush);
      });
      if (rafId) cancelAnimationFrame(rafId);
      const parsed = finish(full);
      try { await pbpAiCacheSet(cacheKey, full, Date.now()); } catch (_) {}
      resolveLemmaOnce(parsed.lemma);
      return parsed;
    } catch (e) {
      if (rafId) cancelAnimationFrame(rafId);
      if (e && e.name === "AbortError") return null;
      const wrap = document.createElement("div");
      wrap.className = "xp-error";
      const msg = document.createElement("p");
      msg.textContent = (e && e.message) || "Request failed";
      const retry = document.createElement("button");
      retry.type = "button";
      retry.className = "xp-retry";
      retry.innerHTML = PBP_ICONS.refresh; // static shared constant, never page content
      retry.append(t(e && e.code === "host_permission" ? "aiGrantRetry" : "explainErrRetry"));
      retry.addEventListener("click", async () => {
        if (retry.disabled) return;
        retry.disabled = true;
        try {
          // First await in the click chain: pbpAiRetryWithPermission issues the
          // exact-origin permissions.request for host_permission errors, then
          // runs the retry callback (a full run-level rerun, never slot recursion
          // — Codex HIGH 2).
          const recovered = await pbpAiRetryWithPermission(e, s, async () => {
            if (_pbpDictCurrent && typeof _pbpDictCurrent.rerun === "function") _pbpDictCurrent.rerun();
          });
          if (!recovered) retry.disabled = false;
        } catch (_) { retry.disabled = false; }
      });
      wrap.appendChild(msg);
      wrap.appendChild(retry);
      el.replaceChildren(wrap);
      return null;
    }
  } finally {
    resolveLemmaOnce(""); // once-only resolver: no-op if already resolved
  }
}

const PBP_DICT_LANGS = ["auto", ...PBP_DICT_QUERY_LANGS];

async function pbpDictRun(cap, ctx, pop, ctrl, s) {
  // Child controller: this run's own signal, chained to md-ask's parent ctrl.
  // A language switch / rerun aborts ONLY the old child (Codex HIGH 1).
  if (_pbpDictChildCtrl) _pbpDictChildCtrl.abort();
  if (_pbpDictParentCleanup) { _pbpDictParentCleanup(); _pbpDictParentCleanup = null; }
  const child = new AbortController();
  _pbpDictChildCtrl = child;
  const onParentAbort = () => child.abort();
  if (ctrl.signal.aborted) child.abort();
  else {
    ctrl.signal.addEventListener("abort", onParentAbort, { once: true });
    _pbpDictParentCleanup = () => { try { ctrl.signal.removeEventListener("abort", onParentAbort); } catch (_) {} };
  }
  const signal = child.signal;

  const runId = ++_pbpDictRunSeq;
  const cur = {
    runId, term: cap.text, lang: "", gloss: "", lemma: "", ipa: "",
    sourceUrl: "", license: "", sentence: ctx.sentence || "", saved: false,
    owner: _pbpDictOwner,
    rerun: () => { if (_pbpDictCurrent === cur) pbpDictRun(cap, ctx, pop, ctrl, s); },
    // Lemma click-through (form-of pointers): a fresh full run on the base
    // form, so language detection, vocab identity and the AI slot all see
    // the lemma as the selection. Same guard as rerun.
    rerunWith: (term) => {
      const next = pbpDictNormalizeTerm(term);
      if (next && _pbpDictCurrent === cur) pbpDictRun({ ...cap, text: next }, ctx, pop, ctrl, s);
    }
  };
  _pbpDictCurrent = cur;

  // Vocab button: disabled until BOTH slots settle so a save is never empty
  // (Codex HIGH 3). dataset.runId guards stale promise writes. Set the
  // moment this run becomes current -- BEFORE the first await
  // (_pbpDictResolveLang) below, not after -- otherwise the OLD run's button
  // (still showing "saved"/enabled) stays clickable through the async
  // language-detection gap and can save an und/empty record for a
  // selection this run has already superseded.
  const vocabBtn = pop.querySelector(".xp-vocab");
  // Known-toggle resets with the run, not just with the action switch: a
  // language-dropdown rerun that no longer hits a saved word must not leave
  // last run's button (wired to the OLD record id) sitting in the foot.
  const knownReset = pop.querySelector(".xp-known");
  if (knownReset) { knownReset.hidden = true; knownReset.onclick = null; }
  if (vocabBtn) {
    vocabBtn.hidden = false;
    vocabBtn.disabled = true;
    vocabBtn.dataset.runId = String(runId);
    // Icon + tooltip, not text: assigning textContent here would strip the SVG
    // and leave a blank button. Guarded because md-dict.js can be injected
    // before md-ask.js has run in some entry points.
    if (typeof _pbpExplainIconBtn === "function") {
      _pbpExplainIconBtn(vocabBtn, PBP_EXPLAIN_VOCAB_ADD_SVG, t("dictSaveVocab"));
    } else {
      vocabBtn.textContent = t("dictSaveVocab");
    }
  }

  const body = pop.querySelector(".xp-body");
  const wrap = document.createElement("div");
  wrap.className = "xp-dict";
  const head = document.createElement("div");
  head.className = "xp-dict-head";
  const sel = document.createElement("select");
  sel.className = "xp-dict-lang";
  sel.setAttribute("aria-label", t("dictLangAria"));
  const languageLocale = typeof uiLangToBCP47 === "function" ? uiLangToBCP47() : document.documentElement.lang;
  for (const code of PBP_DICT_LANGS) {
    const o = document.createElement("option");
    o.value = code === "auto" ? "" : code;
    o.textContent = code === "auto" ? t("dictLangAuto") : (pbpDictLanguageLabel(code, languageLocale) || code);
    sel.appendChild(o);
  }
  const speak = document.createElement("button");
  speak.type = "button";
  speak.className = "xp-dict-speak";
  speak.setAttribute("aria-label", t("dictSpeak")); // no title — a11y label only
  speak.innerHTML = PBP_DICT_SPEAKER_SVG; // static constant, never model text
  const ctxReady = document.createElement("button");
  ctxReady.type = "button";
  ctxReady.className = "xp-dict-speak xp-dict-ctx-ready"; // same head-button family
  ctxReady.title = t("dictCtxReady");
  ctxReady.setAttribute("aria-label", t("dictCtxReady"));
  ctxReady.innerHTML = PBP_DICT_CTX_READY_SVG; // static constant
  ctxReady.hidden = true;
  head.appendChild(sel);
  head.appendChild(speak);
  head.appendChild(ctxReady);
  const slot = document.createElement("div");
  slot.className = "xp-dict-slot";
  // Two stable children. Every online path -- skeleton, permission prompt,
  // result, no-entry, load failure -- calls replaceChildren on the SAME element,
  // so a Chinese block written straight into `slot` would be wiped by whichever
  // of them ran next. Nothing may ever replaceChildren on `slot` itself.
  const localEl = document.createElement("div");
  localEl.className = "xp-dict-local";
  const onlineEl = document.createElement("div");
  onlineEl.className = "xp-dict-online";
  slot.appendChild(localEl);
  slot.appendChild(onlineEl);
  const ctxEl = document.createElement("div");
  ctxEl.className = "xp-dict-ctx";
  wrap.appendChild(head);
  wrap.appendChild(slot);
  wrap.appendChild(ctxEl);
  body.replaceChildren(wrap);
  _pbpDictSlotSkeleton(onlineEl);

  const manual = _pbpDictManualLang;
  const lang = await _pbpDictResolveLang(cap, ctx, manual);
  if (signal.aborted || _pbpDictCurrent !== cur) return;
  cur.lang = lang;
  const effectiveLang = lang || "und"; // vocab identity: query and save agree (Codex HIGH 6)
  // Legible override state: auto-detection keeps "Auto" selected and
  // annotates it with the detected code ("Auto (zh)"); a bare code shows
  // ONLY when the user picked it this document. The old display put the
  // detected language in the box as a bare code, indistinguishable from a
  // stuck manual override.
  if (manual && PBP_DICT_LANGS.includes(manual)) {
    sel.value = manual;
  } else {
    sel.value = "";
    const detectedLabel = pbpDictLanguageLabel(lang, languageLocale);
    sel.options[0].textContent = t("dictLangAuto") + (detectedLabel ? " (" + detectedLabel + ")" : "");
  }
  sel.addEventListener("change", () => {
    _pbpDictManualLang = sel.value; // per-document only; never persisted
    cur.rerun(); // abort old requests NOW
  });
  speak.addEventListener("click", () => pbpDictSpeak(cur.term || cap.text, cur.lang));

  let lemmaSettled = false;
  let resolveLemmaRaw;
  const lemmaPromise = new Promise((r) => { resolveLemmaRaw = r; });
  const resolveLemmaOnce = (v) => { if (!lemmaSettled) { lemmaSettled = true; resolveLemmaRaw(v); } };

  // Deliberately NOT part of the allSettled below: putting it there would make
  // the whole run's completion wait on an IDB read, and the online chain is the
  // one thing that must never be delayed by the local pack.
  _pbpDictEcdictSide(localEl, cap.text, lang, signal, cur);

  const results = await Promise.allSettled([
    _pbpDictSlotRun(onlineEl, cap.text, lang, signal, lemmaPromise, cur.rerun, ctx.sentence).then((norm) => {
      // Sync the defined word the moment the dictionary slot settles -- the
      // speak button is live before the (slower) AI slot finishes.
      if (norm && norm.sourceLabel === "CC-CEDICT" && norm.word && _pbpDictCurrent === cur) cur.term = norm.word;
      return norm;
    }),
    _pbpDictCtxRun(ctxEl, cap, ctx, s, signal, resolveLemmaOnce, lang)
  ]);
  if (signal.aborted || _pbpDictCurrent !== cur) return;
  const norm = results[0].status === "fulfilled" ? results[0].value : null;
  const parsed = results[1].status === "fulfilled" ? results[1].value : null;
  if (norm) {
    // The reader saves what they see. The slot renders the context-ordered
    // view, so the persisted gloss/ipa must read the SAME view -- reading
    // norm.entries[0] (API order) can save a different sense from the one on
    // top of the screen. norm itself stays untouched: it is the object in the
    // dict2_ cache.
    const ordered = pbpDictOrderForContext(norm.entries, cur.sentence);
    const first = ordered[0];
    cur.ipa = first && first.ipas[0] ? first.ipas[0].text : "";
    cur.sourceUrl = norm.sourceUrl;
    cur.license = norm.license;
    if (first && first.senses[0]) cur.gloss = first.senses[0].definition;
  }
  // A CC-CEDICT PREFIX hit (norm.word shorter than the raw selection --
  // e.g. selecting "中国人" resolves the dictionary slot to "中国") means the
  // AI context slot explained the ORIGINAL long selection, not the prefix
  // word the dictionary matched. Its gloss/lemma belong to a different piece
  // of text and must not overwrite what the dictionary slot already wrote
  // into cur (or, transitively, the saved vocab record) -- the AI slot's own
  // on-screen rendering is untouched, this only guards persistence.
  const prefixHit = norm && norm.sourceLabel === "CC-CEDICT" && norm.word && norm.word !== cap.text;
  if (parsed && !prefixHit) {
    if (parsed.gloss) {
      // Contextual sense first (it is why the reader looked the word up),
      // dictionary general sense on its own line below -- away from the
      // sentence (an Anki back, the vocab list) the narrow sense alone is
      // often unreadable. The card renders pre-wrap; TSV/Anki flatten the
      // newline, so no export contract changes.
      const dictGloss = cur.gloss && cur.gloss !== parsed.gloss ? cur.gloss : "";
      cur.gloss = dictGloss ? parsed.gloss + "\n" + dictGloss : parsed.gloss;
    }
    cur.lemma = parsed.lemma;
  }
  if (parsed) _pbpDictCtxSignal(body, ctxEl, ctxReady);
  if (vocabBtn && vocabBtn.dataset.runId === String(runId)) {
    const hit = await pbpVocabGet(pbpDictVocabKey(cur.owner, effectiveLang, cur.term));
    if (signal.aborted || _pbpDictCurrent !== cur || vocabBtn.dataset.runId !== String(runId)) return;
    if (hit) {
      cur.saved = true;
      // Icon + tooltip, same contract as the initial setup above: textContent
      // would strip the SVG and overflow the 1.9em icon-only foot button.
      if (typeof _pbpExplainIconBtn === "function") {
        _pbpExplainIconBtn(vocabBtn, PBP_EXPLAIN_DONE_SVG, t("dictUpdateVocab"));
      } else {
        vocabBtn.textContent = t("dictUpdateVocab");
      }
    }
    vocabBtn.disabled = false;
    // Known-word toggle: only meaningful for an already-saved word. onclick
    // is a PROPERTY assignment on purpose -- the button outlives runs, and
    // addEventListener here would stack one handler per lookup.
    const knownBtn = pop.querySelector(".xp-known");
    if (knownBtn && typeof _pbpExplainIconBtn === "function"
      && typeof pbpVocabBatchSetStatus === "function" && hit) {
      let known = String(hit.status || "new") === "known";
      const face = () => _pbpExplainIconBtn(knownBtn,
        known ? PBP_DICT_LEARNING_SVG : PBP_DICT_KNOWN_SVG,
        t(known ? "vocabMarkLearning" : "vocabMarkKnown"));
      face();
      knownBtn.hidden = false;
      knownBtn.disabled = false;
      knownBtn.onclick = async () => {
        if (knownBtn.disabled) return;
        knownBtn.disabled = true;
        const ok = await pbpVocabBatchSetStatus([hit.id], cur.owner, known ? "new" : "known")
          .catch(() => false);
        if (_pbpDictCurrent !== cur) return; // superseded: leave the new run's button alone
        knownBtn.disabled = false;
        if (!ok) {
          knownBtn.classList.remove("xp-flash-fail");
          void knownBtn.offsetWidth;
          knownBtn.classList.add("xp-flash-fail");
          return;
        }
        known = !known;
        face();
        try {
          document.dispatchEvent(new CustomEvent("pbp:vocab-changed", { detail: { owner: cur.owner } }));
        } catch (_) {}
      };
    }
  }
}
window.pbpDictRun = pbpDictRun;

async function pbpDictSaveCurrent() {
  const cur = _pbpDictCurrent;
  if (!cur || !cur.term) return false;
  if (cur.owner !== _pbpDictOwner) return false; // owner re-check at commit time (invariant)
  const urlEl = document.getElementById("preview-url");
  const titleEl = document.getElementById("preview-title");
  let highlightId = null;
  const target = _pbpDictSaveTarget;
  if (target && target.itemId) highlightId = target.itemId;                 // card path keeps its id
  else if (target && target.range && typeof window.pbpHlItemIdAtRange === "function") {
    try { highlightId = window.pbpHlItemIdAtRange(target.range) || null; } catch (_) {}
  }
  const entry = await pbpVocabSaveWord(cur.owner, {
    term: cur.term, lemma: cur.lemma, language: cur.lang || "und",
    gloss: cur.gloss, ipa: cur.ipa, sourceUrl: cur.sourceUrl, license: cur.license,
    context: {
      quote: cur.sentence, articleUrl: pbpDictSafeUrl(urlEl ? urlEl.href : ""),
      articleTitle: titleEl ? titleEl.textContent : "", highlightId, createdAt: Date.now()
    }
  });
  if (entry) {
    // The IDB write already happened -- report success unconditionally, even
    // if a newer dict run has since superseded `cur`. Only mutate the run's
    // own state when it is still the live one. The vocabulary list itself
    // lives in the options tab now (options-vocab.js); it rescans on its own
    // next activation, same as every other options panel.
    if (_pbpDictCurrent === cur) cur.saved = true;
    try {
      document.dispatchEvent(new CustomEvent("pbp:vocab-changed", { detail: { owner: cur.owner } }));
    } catch (_) {}
    return true;
  }
  return false;
}
window.pbpDictSaveCurrent = pbpDictSaveCurrent;
window.pbpDictSetSaveTarget = (tgt) => { _pbpDictSaveTarget = tgt || null; };
window.pbpDictOnActionSwitch = () => {
  _pbpDictSaveTarget = null;
  if (_pbpDictChildCtrl) _pbpDictChildCtrl.abort(); // invalidate the run, not just the range
  _pbpDictCurrent = null;
};

// Owner arrives with the page render (dict-run/save read _pbpDictOwner; the
// vocabulary panel itself now lives in the options tab, options-vocab.js).
// Article-scoped state, reset per document: the manual language override the
// reader picked for the PREVIOUS article, and the CLD prior sampled from its
// text. Both are wrong the moment the article underneath changes.
function pbpDictOnArticle(detail) {
  const account = detail ? detail.account : "";
  _pbpDictOwner = pbpDictOwnerScope(account);
  _pbpDictManualLang = ""; // language override is per-document, never carried over
  _pbpDictArticlePrior = null; // article CLD prior is per-document too
}
document.addEventListener("pbp:rendered", (e) => pbpDictOnArticle((e && e.detail) || null));
// In-place article replacement (md-preview.js _applyArticleCommit): pbp:rendered
// stays a once-per-page event, so the same reset has to ride the replacement
// lifecycle. NOT {once:true} -- a page can replace its article repeatedly.
// will: kill the query that is still resolving against the old article (the
// same teardown an action switch performs -- aborts the child request, drops
// the save target and the current entry). replaced: re-derive the per-document
// state, exactly as a fresh render would.
document.addEventListener("pbp:article-will-replace", () => window.pbpDictOnActionSwitch());
document.addEventListener("pbp:article-replaced", (e) => pbpDictOnArticle((e && e.detail) || null));
