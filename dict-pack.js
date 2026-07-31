// ============================================================
// Pinboard Bookmark Enhanced - dict-pack.js
// Offline CC-CEDICT Chinese dictionary pack. The user downloads the release
// from MDBG THEMSELVES (their page forbids scripted access) and imports the
// .gz/.txt via a file picker -- the extension makes zero network requests.
// Data: CC-CEDICT, CC BY-SA 4.0. Loaded statically by options.html; the
// reader (md-dict.js) lazy-injects this file on the first zh lookup.
// Pure helpers above PURE END load in tests/dict-pack-tests.html.
// ============================================================

// V1 line: 繁體 简体 [pin1 yin1] /sense/sense/
const PBP_CEDICT_LINE = /^(\S+)\s+(\S+)\s+\[([^\]]*)\]\s+\/(.+)\/\s*$/;

function pbpCedictParseLine(line) {
  const s = String(line == null ? "" : line).trim();
  if (!s || s.startsWith("#")) return null;
  const m = PBP_CEDICT_LINE.exec(s);
  if (!m) return null;
  const defs = m[4].split("/").filter(Boolean);
  if (!defs.length) return null;
  // Pinyin case is SEMANTIC (Wang2 vs wang2) -- never lowercase.
  return { trad: m[1], simp: m[2], pinyin: m[3], defs };
}

const PBP_PINYIN_MARKS = {
  a: "āáǎà", e: "ēéěè", i: "īíǐì", o: "ōóǒò", u: "ūúǔù", "ü": "ǖǘǚǜ",
  A: "ĀÁǍÀ", E: "ĒÉĚÈ", I: "ĪÍǏÌ", O: "ŌÓǑÒ", U: "ŪÚǓÙ", "Ü": "ǕǗǙǛ"
};

// Numbered syllable -> tone-marked (ni3 -> nǐ). Unconvertible syllables
// (xx5 markers, punctuation, already-marked) pass through untouched.
function _pbpCedictSyllable(raw) {
  const syl = raw.replace(/u:/g, "ü").replace(/U:/g, "Ü");
  if (/^xx5$/i.test(syl)) return raw; // CEDICT "no applicable pinyin" marker
  const m = /^([A-Za-züÜ]+)([0-5])$/.exec(syl);
  if (!m) return raw;
  const body = m[1], tone = Number(m[2]);
  if (tone === 0 || tone === 5) {
    // Neutral tone drops the digit only for real syllables (vowels, or the
    // erhua "r5"); anything else keeps its tag rather than losing it.
    return /^r$/i.test(body) || /[aeiouü]/i.test(body) ? body : raw;
  }
  const lower = body.toLowerCase();
  let idx = -1;
  if (lower.includes("a")) idx = lower.indexOf("a");
  else if (lower.includes("e")) idx = lower.indexOf("e");
  else if (lower.includes("ou")) idx = lower.indexOf("o");
  else {
    for (let i = body.length - 1; i >= 0; i--) {
      if (PBP_PINYIN_MARKS[body[i]]) { idx = i; break; }
    }
  }
  if (idx === -1) return raw;
  const marks = PBP_PINYIN_MARKS[body[idx]];
  return body.slice(0, idx) + (marks ? marks[tone - 1] : body[idx]) + body.slice(idx + 1);
}

function pbpCedictPinyinPretty(pinyin) {
  return String(pinyin == null ? "" : pinyin).trim().split(/\s+/).filter(Boolean)
    .map(_pbpCedictSyllable).join(" ");
}

// Selection -> longest-first prefix key sequence, capped at 16 CODE POINTS
// (Array.from, never UTF-16 slice -- astral Han chars are 2 units).
function pbpCedictLookupKeys(selection) {
  const cps = Array.from(String(selection == null ? "" : selection).normalize("NFC").trim());
  const capped = cps.slice(0, 16);
  const keys = [];
  for (let len = capped.length; len >= 1; len--) keys.push(capped.slice(0, len).join(""));
  return keys;
}

// rows (all CEDICT records for the matched key) -> md-dict's normalized
// entry contract. Every field present, empty arrays never omitted.
function pbpCedictEntryToNorm(rows, matched) {
  const entries = (Array.isArray(rows) ? rows : []).map((r) => ({
    pos: "",
    ipas: [{ text: pbpCedictPinyinPretty(r.pinyin), tags: ["Pinyin"] }],
    forms: r.trad !== r.simp
      ? [{ word: matched === r.trad ? r.simp : r.trad, tags: [matched === r.trad ? "simp" : "trad"] }]
      : [],
    senses: (r.defs || []).map((d) => ({ definition: d, examples: [] }))
  }));
  return {
    word: String(matched == null ? "" : matched),
    entries,
    sourceLabel: "CC-CEDICT",
    sourceUrl: "https://cc-cedict.org/wiki/",
    license: "CC BY-SA 4.0"
  };
}

// CRC32 (IEEE), accumulated chunk by chunk. This is a best-effort DIAGNOSTIC
// checksum for telling one imported file from another in the status line. It is
// 32 bits, so collisions exist: never use it for identity, licence or any
// enforcement decision.
const _PBP_CRC32_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

function pbpCrc32Update(crc, bytes) {
  let c = (crc ^ 0xffffffff) >>> 0;
  for (let i = 0; i < bytes.length; i++) c = (_PBP_CRC32_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)) >>> 0;
  return (c ^ 0xffffffff) >>> 0;
}

function pbpCrc32Hex(crc) {
  return (crc >>> 0).toString(16).padStart(8, "0");
}

// Streaming line splitter over a (possibly gzip) ReadableStream. The
// TextDecoderStream handles UTF-8 across byte chunks; `carry` handles lines
// across text chunks. fatal:true rejects on invalid UTF-8 (wrong file).
// stats.bytes counts DECOMPRESSED bytes (capped by maxBytes; stored in meta).
// Pass a starting stats.crc to also accumulate a CRC32 over those same decoded
// bytes -- this is the only place that sees them, and doing it here costs no
// extra buffering (SubtleCrypto has no streaming digest, so a real hash would
// mean holding the whole file in memory).
// The line-length check runs BEFORE the yield too -- a 70KB line whose
// newline arrives in the same chunk must not slip through.
async function* pbpCedictLines(stream, gzip, stats, maxBytes) {
  stats = stats || { bytes: 0 };
  stats.bytes = 0;
  const cap = maxBytes || 64 * 1024 * 1024;
  const wantCrc = typeof stats.crc === "number";
  let text = stream;
  if (gzip) text = text.pipeThrough(new DecompressionStream("gzip"));
  text = text.pipeThrough(new TransformStream({
    transform(chunk, controller) {
      stats.bytes += chunk.byteLength;
      if (stats.bytes > cap) throw new Error("CEDICT file too large");
      if (wantCrc) stats.crc = pbpCrc32Update(stats.crc, chunk);
      controller.enqueue(chunk);
    }
  }));
  text = text.pipeThrough(new TextDecoderStream("utf-8", { fatal: true }));
  let carry = "";
  for await (const chunk of text) {
    carry += chunk;
    let end;
    while ((end = carry.indexOf("\n")) !== -1) {
      // 65536 UTF-16 units (memory bound; NOT a byte-exact limit)
      if (end > 65536) throw new Error("CEDICT line too long");
      let line = carry.slice(0, end);
      carry = carry.slice(end + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      yield line;
    }
    // 65536 UTF-16 units (memory bound; NOT a byte-exact limit)
    if (carry.length > 65536) throw new Error("CEDICT line too long");
  }
  if (carry) yield carry.endsWith("\r") ? carry.slice(0, -1) : carry;
}

// ---- Minimal ZIP reader ---------------------------------------------------
// MDBG also publishes the release as a ZIP with ONE text entry. This parses
// the End-of-Central-Directory + central entries, picks the first file entry
// and returns its DECOMPRESSED byte stream (method 8 deflate via
// DecompressionStream("deflate-raw"), method 0 stored). CRC is not verified
// (the parser downstream rejects garbage anyway); zip64 and exotic methods
// are rejected with a clear error. Takes a Blob/File.
async function pbpPackZipTextStream(file) {
  const tailSize = Math.min(file.size, 65558); // EOCD = 22 bytes + max comment
  const tail = new Uint8Array(await file.slice(file.size - tailSize).arrayBuffer());
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tail[i] === 0x50 && tail[i + 1] === 0x4b && tail[i + 2] === 0x05 && tail[i + 3] === 0x06) { eocd = i; break; }
  }
  if (eocd === -1) throw new Error("zip: no end record");
  const ed = new DataView(tail.buffer, tail.byteOffset + eocd);
  const count = ed.getUint16(10, true);
  const cdSize = ed.getUint32(12, true);
  const cdOfs = ed.getUint32(16, true);
  if (!count || cdOfs === 0xffffffff) throw new Error("zip: unsupported layout");
  const cd = new DataView(await file.slice(cdOfs, cdOfs + cdSize).arrayBuffer());
  let p = 0, chosen = null;
  for (let n = 0; n < count && p + 46 <= cd.byteLength; n++) {
    if (cd.getUint32(p, true) !== 0x02014b50) break;
    const method = cd.getUint16(p + 10, true);
    const compSize = cd.getUint32(p + 20, true);
    const nameLen = cd.getUint16(p + 28, true);
    const extraLen = cd.getUint16(p + 30, true);
    const commentLen = cd.getUint16(p + 32, true);
    const localOfs = cd.getUint32(p + 42, true);
    const name = new TextDecoder().decode(new Uint8Array(cd.buffer, cd.byteOffset + p + 46, nameLen));
    if (!name.endsWith("/") && !chosen) chosen = { method, compSize, localOfs };
    p += 46 + nameLen + extraLen + commentLen;
  }
  if (!chosen) throw new Error("zip: no file entry");
  if (chosen.compSize === 0xffffffff || chosen.localOfs === 0xffffffff) throw new Error("zip: zip64 unsupported");
  if (chosen.method !== 8 && chosen.method !== 0) throw new Error("zip: unsupported compression");
  const lh = new DataView(await file.slice(chosen.localOfs, chosen.localOfs + 30).arrayBuffer());
  if (lh.getUint32(0, true) !== 0x04034b50) throw new Error("zip: bad local header");
  const dataOfs = chosen.localOfs + 30 + lh.getUint16(26, true) + lh.getUint16(28, true);
  const raw = file.slice(dataOfs, dataOfs + chosen.compSize).stream();
  return chosen.method === 8 ? raw.pipeThrough(new DecompressionStream("deflate-raw")) : raw;
}

// ---- ECDICT (English -> Chinese) parse layer -----------------------------
// A reader for the ECDICT CSV field layout. The extension neither ships,
// fetches, points at, recommends nor validates the data: the user supplies the
// file. Design: docs/superpowers/specs/2026-07-30-ecdict-en-zh-pack-design-rev7
// plus its rev8 amendments.

// Resource ceilings. Policy caps anchored to the measured top rung (R3 =
// 181,921 entries / 11,128,429 B on ecdict.csv @ bc015ed2), NOT values derived
// from the format. Deliberately not reusing CC-CEDICT's 400,000.
const PBP_ECDICT_MAX_ENTRIES = 220000;
// 24 MiB, tightened from 32 after measurement: the widest-record fixture at
// 32 MiB peaked at 158 MiB of heap against a pre-registered 150 MiB budget.
// Still 2.26x the measured top rung (R3 = 10.61 MiB), so no real file is near it.
const PBP_ECDICT_MAX_PAYLOAD_BYTES = 24 * 1024 * 1024;
const PBP_ECDICT_MAX_BYTES = 96 * 1024 * 1024;
// Input boundaries. Observed maxima on that sample: line 12,504, word 100,
// translation 372. A record breaching WORD/KEY/TRANS counts as malformed; the
// ratio ceiling then rejects the file. An unclosed quote rejects immediately.
const PBP_ECDICT_MAX_MALFORMED_RATIO = 0.01;
const PBP_ECDICT_MAX_RECORD_UNITS = 65536;
const PBP_ECDICT_MAX_WORD_UNITS = 256;
const PBP_ECDICT_MAX_KEY_UNITS = 256;
const PBP_ECDICT_MAX_TRANS_UNITS = 4096;

const PBP_ECDICT_COLUMNS = Object.freeze([
  "word", "translation", "tag", "collins", "oxford", "frq", "bnc"
]);

// Must stay character-for-character the same rule as vocab-store's query
// identity -- pbpDictNormalizeTerm() followed by toLowerCase() -- and as the
// offline comparison script's norm(). If they drift, a row imports fine and can
// never be looked up. The `|| ""` coercion is copied verbatim rather than
// improved: `String(x == null ? "" : x)` reads better but disagrees on 0 and
// false, and "reads better" is not worth two subtly different identities.
function pbpEcdictKey(word) {
  return String(word || "").normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
}

// Quote-aware split of ONE physical line. ECDICT's phonetic column is quoted
// and contains commas, so split(",") mis-columns every such row. Returns null
// for an unclosed quote -- the caller must then reject the whole file rather
// than skip the line: without a safe record boundary, a continuation line can
// produce a phantom record that happens to satisfy the column count.
function pbpEcdictSplitLine(line) {
  const s = String(line == null ? "" : line);
  const out = [];
  let cur = "", inQuote = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuote) {
      if (c !== '"') { cur += c; continue; }
      if (s[i + 1] === '"') { cur += '"'; i++; continue; }
      inQuote = false;
    } else if (c === '"') inQuote = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  if (inQuote) return null;
  out.push(cur);
  return out;
}

// Header -> column index map. Required names must each appear EXACTLY once;
// a duplicate or a missing name rejects the file (returns null) rather than
// silently reading the wrong column when upstream adds one.
function pbpEcdictParseHeader(line) {
  // A UTF-8 BOM turns the first column name into "\uFEFFword", which matches
  // nothing and rejects the whole file as "header missing or ambiguous". Any
  // round-trip through a spreadsheet adds one.
  const fields = pbpEcdictSplitLine(String(line == null ? "" : line).replace(/^\uFEFF/, ""));
  if (!fields) return null;
  const names = fields.map((f) => f.trim());
  const idx = { _count: names.length };
  for (const want of PBP_ECDICT_COLUMNS) {
    const hits = [];
    names.forEach((n, i) => { if (n === want) hits.push(i); });
    if (hits.length !== 1) return null;
    idx[want] = hits[0];
  }
  return idx;
}

// Strict integer. parseInt would accept "12abc" and silently rank a junk row.
function pbpEcdictInt(v) {
  const s = String(v == null ? "" : v).trim();
  return /^\d+$/.test(s) ? Number(s) : 0;
}

// Literal backslash-n, not a real newline: ECDICT writes "n. 罩\nv. 覆盖".
// Splitting into separate senses is required -- substituting a real newline
// renders as a space, because .xp-dict-senses li is white-space: normal.
function pbpEcdictSenses(translation) {
  return String(translation == null ? "" : translation)
    .split("\\n").map((s) => s.trim()).filter(Boolean);
}

// Cumulative, strictly monotone rungs: R1 subset of R2 subset of R3. Widening
// must only ever add. (R2 and R3 as two parallel "orthogonal signal" sets was
// the rev5 bug: switching between them dropped 11,552 words.)
function pbpEcdictRungOk(row, rung) {
  const base = row.tag !== "" ||
    (row.collins !== "" && row.collins !== "0") ||
    (row.oxford !== "" && row.oxford !== "0") ||
    (row.frq > 0 && row.frq <= 50000) ||
    (row.bnc > 0 && row.bnc <= 50000);
  if (base) return true;
  if (rung === "R1") return false;
  if (!row.clean) return false;
  if (row.hasExchange) return true;              // R2
  return rung === "R3" && row.hasDefinition;     // R3 adds to R2, never replaces
}

// A row worth keeping at all, independent of rung. The third condition is not
// redundant: trim("\\n") is non-empty yet splits into zero senses, which would
// store a headword with nothing to render.
function pbpEcdictBaseOk(key, translation) {
  return !!key && String(translation).trim() !== "" && pbpEcdictSenses(translation).length > 0;
}

const _PBP_ECDICT_AFFIX = /^['’-]|['’-]$/;

// "clean" gates the R2/R3 widening: a real English headword with a real gloss.
// All THREE parts matter. Dropping the web-only test admitted 200 extra rows at
// both rungs on the fixed sample -- entries whose whole gloss is scraped
// "[网络]" fragments, which is what the rung was meant to exclude.
function pbpEcdictClean(word, senses) {
  if (/\s/.test(word) || _PBP_ECDICT_AFFIX.test(word)) return false;
  return !(senses.length > 0 && senses.every((s) => s.startsWith("[网络]")));
}

// One physical line -> { ok, record } | { ok:false, fatal } | { ok:false, malformed }
// `fatal` rejects the whole file; `malformed` only counts toward the ratio.
function pbpEcdictParseRow(line, idx, rung) {
  if (String(line).length > PBP_ECDICT_MAX_RECORD_UNITS) return { ok: false, malformed: true };
  const f = pbpEcdictSplitLine(line);
  if (!f) return { ok: false, fatal: "unclosed-quote" };
  if (f.length !== idx._count) return { ok: false, malformed: true };
  const word = f[idx.word].trim();
  const translation = f[idx.translation].trim();
  const key = pbpEcdictKey(word);
  if (word.length > PBP_ECDICT_MAX_WORD_UNITS) return { ok: false, malformed: true };
  if (key.length > PBP_ECDICT_MAX_KEY_UNITS) return { ok: false, malformed: true };
  if (translation.length > PBP_ECDICT_MAX_TRANS_UNITS) return { ok: false, malformed: true };
  if (!pbpEcdictBaseOk(key, translation)) return { ok: false, skip: true };
  const row = {
    tag: f[idx.tag].trim(),
    collins: f[idx.collins].trim(),
    oxford: f[idx.oxford].trim(),
    frq: pbpEcdictInt(f[idx.frq]),
    bnc: pbpEcdictInt(f[idx.bnc]),
    clean: pbpEcdictClean(word, pbpEcdictSenses(translation)),
    hasExchange: idx.exchange !== undefined && (f[idx.exchange] || "").trim() !== "",
    hasDefinition: idx.definition !== undefined && (f[idx.definition] || "").trim() !== ""
  };
  if (!pbpEcdictRungOk(row, rung)) return { ok: false, skip: true };
  // Stored shape is exactly three fields. tag/exchange/definition decided
  // admission and are then discarded -- no consumer, so no reason to occupy
  // rows forever (an exam-tag badge would justify a re-import, not a column).
  return { ok: true, record: { key, word, translation } };
}

// The one payload definition. Any acceptance gate that quotes a byte figure
// must use this and nothing else; rev5 quietly added 16 bytes per record and
// every quoted size in the spec was wrong for two revisions.
//
// pbpEcdictRecordBytes is the per-record form, and the import path accumulates
// with it while parsing. Running the whole thing as one pass afterwards was
// measured pushing a 31 MB encode into a single task.
function pbpEcdictRecordBytes(r, enc) {
  const e = enc || new TextEncoder();
  return e.encode(r.key).length + e.encode(r.word).length + e.encode(r.translation).length;
}

function pbpEcdictPayloadBytes(records) {
  const enc = new TextEncoder();
  let n = 0;
  for (const r of records) n += pbpEcdictRecordBytes(r, enc);
  return n;
}

// rows -> md-dict's normalized entry contract. Chinese is an ADDITIONAL block:
// the online chain still runs, so this never claims the IPA/forms/source that
// the network entry owns.
function pbpEcdictEntryToNorm(rows, matched) {
  const entries = (Array.isArray(rows) ? rows : []).map((r) => ({
    pos: "",
    ipas: [],
    forms: [],
    senses: pbpEcdictSenses(r.translation).map((d) => ({
      definition: d, examples: [], tags: [], synonyms: [], antonyms: [], subsenses: []
    }))
  })).filter((e) => e.senses.length);
  return {
    word: String(matched == null ? "" : matched),
    entries,
    sourceLabel: "ECDICT",
    sourceUrl: "",
    license: ""
  };
}

// ---- PURE END ----

// ---- IDB layer (DB pbp-dict-packs) --------------------------------------
const _PBP_PACK_DB = "pbp-dict-packs";
const _PBP_PACK_STORE = "cedict";
const _PBP_ECDICT_STORE = "ecdict";
const _PBP_PACK_META = "packs";
const _PBP_PACK_VERSION = 2;
let _pbpPackDbPromise = null;
// Set when a stale page holding the old JS meets a database another tab already
// upgraded. Reopening at the old version yields VersionError, which no amount of
// retrying fixes -- only reloading the page does. Callers surface it as such.
let _pbpPackStale = false;

function pbpPackIsStale() { return _pbpPackStale; }

function _pbpPackOpenDB() {
  if (_pbpPackDbPromise) return _pbpPackDbPromise;
  _pbpPackDbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(_PBP_PACK_DB, _PBP_PACK_VERSION);
    req.onupgradeneeded = (ev) => {
      const db = req.result;
      // Version-guarded and additive. Creating an existing store throws
      // ConstraintError and rolls the whole upgrade back, so `oldVersion < 1`
      // must not run for a v1 user; conversely a fresh install has to run BOTH
      // branches, so neither may be dropped.
      if (ev.oldVersion < 1) {
        // Inline autoIncrement id: getAll() only returns VALUES, so the id
        // must live in the record for merge/dedup/sort to see it.
        const store = db.createObjectStore(_PBP_PACK_STORE, { keyPath: "id", autoIncrement: true });
        store.createIndex("simp", "simp", { unique: false });
        store.createIndex("trad", "trad", { unique: false });
        db.createObjectStore(_PBP_PACK_META, { keyPath: "id" });
      }
      if (ev.oldVersion < 2) {
        const e = db.createObjectStore(_PBP_ECDICT_STORE, { keyPath: "id", autoIncrement: true });
        e.createIndex("key", "key", { unique: false });
      }
      // Nothing here touches cedict or packs data: a user who already imported
      // CC-CEDICT keeps it and must not be asked to import again.
    };
    req.onsuccess = () => {
      const db = req.result;
      // Close on versionchange and drop the cached promise so a long-lived
      // options tab doesn't block another tab's upgrade.
      db.onversionchange = () => { try { db.close(); } catch (_) {} _pbpPackDbPromise = null; };
      resolve(db);
    };
    // Two distinct failures. onblocked: our upgrade is waiting on another
    // connection. onerror with VersionError: the database is NEWER than the
    // version this page knows, i.e. this page's JS is stale.
    req.onblocked = () => { console.warn("[pack] db upgrade blocked by another connection"); };
    req.onerror = () => {
      const err = req.error;
      if (err && err.name === "VersionError") {
        _pbpPackStale = true;
        console.warn("[pack] db is newer than this page expects; reload required:", err.name);
      }
      _pbpPackDbPromise = null;
      reject(err || new Error("pack db open failed"));
    };
  });
  return _pbpPackDbPromise;
}

// `stores` is explicit per operation. A transaction's scope is fixed when it is
// created, so it cannot be widened later -- and scoping every call to all three
// stores would needlessly block the other pack and the shared meta store.
function _pbpPackTx(db, mode, fn, stores) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores || [_PBP_PACK_STORE, _PBP_PACK_META], mode);
    let out;
    // A synchronous throw part-way through fn() leaves whatever it already
    // queued on a live transaction, which then COMMITS. The import's first
    // transaction queues meta.delete() before clear(), so a throw from clear()
    // used to land the delete and nothing else: data still on disk, meta gone,
    // pack no longer ready or queryable. Abort so the caller's error means the
    // store is untouched. Rejecting with `e` rather than the abort error keeps
    // the original cause (onabort is not wired up yet at this point anyway).
    try { out = fn(tx); } catch (e) { try { tx.abort(); } catch (_) {} reject(e); return; }
    tx.oncomplete = () => resolve(out && typeof out.value === "function" ? out.value() : out);
    tx.onabort = () => reject(tx.error || new Error("pack tx aborted"));
    tx.onerror = () => reject(tx.error || new Error("pack tx failed"));
  });
}

// Import: Web Locks serialize writers; first tx deletes meta AND clears the
// store in ONE transaction (old meta gone = half-pack invisible); batched
// puts; meta {state:"ready"} written LAST. A tab closed mid-import leaves
// no meta -> lookups refuse the data.
async function pbpPackImport(lineIter, onProgress, stats) {
  return navigator.locks.request("pbp-cedict-import", async () => {
    const db = await _pbpPackOpenDB();
    await _pbpPackTx(db, "readwrite", (tx) => {
      tx.objectStore(_PBP_PACK_META).delete("cedict");
      tx.objectStore(_PBP_PACK_STORE).clear();
    });
    let batch = [];
    let entries = 0;
    let malformed = 0;
    const flush = () => _pbpPackTx(db, "readwrite", (tx) => {
      const store = tx.objectStore(_PBP_PACK_STORE);
      for (const rec of batch) store.put(rec);
      batch = [];
    });
    for await (const line of lineIter) {
      const rec = pbpCedictParseLine(line);
      if (!rec) { if (String(line).trim() && !String(line).startsWith("#")) malformed++; continue; }
      batch.push(rec);
      entries++;
      if (entries > 400000) throw new Error("entry count implausible");
      if (batch.length >= 2000) {
        await flush();
        if (onProgress) onProgress(entries);
        await new Promise((r) => setTimeout(r, 0)); // yield between batches
      }
    }
    if (batch.length) await flush();
    if (!entries || malformed > entries) throw new Error("import parsed no plausible data");
    await _pbpPackTx(db, "readwrite", (tx) => {
      tx.objectStore(_PBP_PACK_META).put({
        id: "cedict", state: "ready", entries, importedAt: Date.now(),
        bytes: (stats && stats.bytes) || 0
      });
    });
    return { entries, malformed };
  });
}

// Lookup status and index reads share ONE readonly transaction, so callers
// never need a racy second meta read. For each key BOTH indexes are queried
// and results merged (a form that is someone's simp and someone else's trad
// must surface both records).
async function pbpPackLookup(keys) {
  try {
    const db = await _pbpPackOpenDB();
    return await new Promise((resolve) => {
      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };
      let tx;
      try { tx = db.transaction([_PBP_PACK_STORE, _PBP_PACK_META], "readonly"); }
      catch (_) { finish({ state: "error" }); return; }
      tx.onabort = tx.onerror = () => finish({ state: "error" });
      const metaReq = tx.objectStore(_PBP_PACK_META).get("cedict");
      metaReq.onsuccess = () => {
        const meta = metaReq.result;
        if (!meta || meta.state !== "ready") { finish({ state: "unavailable" }); return; }
        const store = tx.objectStore(_PBP_PACK_STORE);
        const lookupKeys = Array.isArray(keys) ? keys : [];
        const tryKey = (i) => {
          if (i >= lookupKeys.length) { finish({ state: "ready-miss" }); return; }
          const key = lookupKeys[i];
          let bySimp;
          try { bySimp = store.index("simp").getAll(key); }
          catch (_) { finish({ state: "error" }); return; }
          bySimp.onsuccess = () => {
            let byTrad;
            try { byTrad = store.index("trad").getAll(key); }
            catch (_) { finish({ state: "error" }); return; }
            byTrad.onsuccess = () => {
              const seen = new Set();
              const rows = [];
              for (const r of [...(bySimp.result || []), ...(byTrad.result || [])]) {
                if (seen.has(r.id)) continue;
                seen.add(r.id);
                rows.push(r);
              }
              rows.sort((a, b) => a.id - b.id); // storage order across both indexes
              if (rows.length) finish({ state: "hit", matched: key, rows });
              else tryKey(i + 1);
            };
            byTrad.onerror = () => finish({ state: "error" });
          };
          bySimp.onerror = () => finish({ state: "error" });
        };
        tryKey(0);
      };
      metaReq.onerror = () => finish({ state: "error" });
    });
  } catch (_) { return { state: "error" }; }
}

async function pbpPackMeta() {
  try {
    const db = await _pbpPackOpenDB();
    return await new Promise((resolve) => {
      const req = db.transaction(_PBP_PACK_META, "readonly").objectStore(_PBP_PACK_META).get("cedict");
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve({ state: "error" });
    });
  } catch (_) { return { state: "error" }; }
}

async function pbpPackDelete() {
  return navigator.locks.request("pbp-cedict-import", async () => {
    const db = await _pbpPackOpenDB();
    await _pbpPackTx(db, "readwrite", (tx) => {
      tx.objectStore(_PBP_PACK_META).delete("cedict");
      tx.objectStore(_PBP_PACK_STORE).clear();
    });
    return true;
  });
}

// File import entry (options page): .gz sniffed by magic bytes 1f 8b, not
// by filename. Any thrown error surfaces to the caller's status line.
async function pbpPackImportFile(file, onProgress) {
  const head = new Uint8Array(await file.slice(0, 2).arrayBuffer());
  const stats = { bytes: 0 };
  if (head[0] === 0x50 && head[1] === 0x4b) { // "PK": the MDBG ZIP release
    const text = await pbpPackZipTextStream(file);
    return pbpPackImport(pbpCedictLines(text, false, stats), onProgress, stats);
  }
  const gzip = head[0] === 0x1f && head[1] === 0x8b;
  return pbpPackImport(pbpCedictLines(file.stream(), gzip, stats), onProgress, stats);
}

// ---- ECDICT IDB layer ----------------------------------------------------
// Import is ATOMIC, unlike the CC-CEDICT path: parse the whole file into memory
// first, and only then clear + write + mark ready inside ONE transaction. A
// user replacing their pack must not lose the working one to a parse error, a
// truncated stream, a failed write or an exhausted quota. Buffering costs memory
// (~15 MB at the top rung) and that is the trade being made on purpose.

const _PBP_ECDICT_META_ID = "ecdict";
const _PBP_ECDICT_LOCK = "pbp-ecdict-import";
// A batch is bounded by BOTH a record count and a byte budget, and ends at
// whichever comes first. Counting records alone was measured at a 384 ms
// event-loop gap on the widest-record fixture: 1000 records of 12.8 KB is a
// 12.8 MB structured clone in one synchronous burst. The next burst is queued
// from the LAST request's success callback, which keeps the transaction alive
// without handing control back to a plain task, where it would be inactive.
const PBP_ECDICT_PUT_BATCH = 1000;
// UTF-16 units, a cheap proxy for clone cost that needs no encoder pass and adds
// no field to the stored record (which must stay exactly key/word/translation).
const PBP_ECDICT_PUT_BATCH_UNITS = 256 * 1024;

// Queues clear + every put + the ready meta record into one live transaction.
// Returns nothing: completion is the transaction's own oncomplete.
function _pbpEcdictCommit(tx, records, metaRecord, onProgress) {
  const store = tx.objectStore(_PBP_ECDICT_STORE);
  const metaStore = tx.objectStore(_PBP_PACK_META);
  store.clear();
  let i = 0;
  const queueBatch = () => {
    const end = Math.min(i + PBP_ECDICT_PUT_BATCH, records.length);
    let last = null, units = 0;
    for (; i < end; i++) {
      const r = records[i];
      last = store.put(r);
      units += r.key.length + r.word.length + r.translation.length;
      // Break AFTER putting record i, so i must advance past it here: the
      // break skips the loop's own increment.
      if (units >= PBP_ECDICT_PUT_BATCH_UNITS) { i++; break; }
    }
    // Callers guarantee records.length > 0, so `last` is never null here.
    last.onsuccess = () => {
      if (onProgress) { try { onProgress(i); } catch (_) {} }
      if (i < records.length) { queueBatch(); return; }
      // Final batch. This put MUST be queued synchronously inside this
      // callback: after any await or promise hop the transaction is inactive.
      metaStore.put(metaRecord);
    };
    // Deliberately no onerror handler. A failed request bubbles and aborts the
    // transaction, which is exactly what should happen; calling preventDefault
    // would let the next batch queue onto a doomed transaction and could land a
    // partial pack.
  };
  queueBatch();
}

// How much text to chew through before handing the event loop back, in UTF-16
// units. The stream only awaits between chunks, so without this every line in a
// chunk is parsed in one task and the block scales with chunk size and line
// width. Safe here and ONLY here: parsing finishes before any transaction is
// opened, so yielding cannot make one go inactive.
const PBP_ECDICT_PARSE_YIELD_UNITS = 64 * 1024;

// lineIter must come from pbpCedictLines(..., stats, PBP_ECDICT_MAX_BYTES) with
// stats.crc pre-seeded to 0.
// opts: { rung, onProgress, onParsed, onPhase }.
async function pbpEcdictImport(lineIter, stats, opts) {
  const o = opts || {};
  const rung = o.rung || "R1";
  return navigator.locks.request(_PBP_ECDICT_LOCK, async () => {
    let idx = null;
    const records = [];
    const enc = new TextEncoder();
    let rows = 0, malformed = 0, payloadBytes = 0, sinceYield = 0;
    for await (const line of lineIter) {
      if (!line) continue;
      sinceYield += line.length;
      if (sinceYield >= PBP_ECDICT_PARSE_YIELD_UNITS) {
        sinceYield = 0;
        await new Promise((r) => setTimeout(r, 0));
      }
      if (!idx) {
        idx = pbpEcdictParseHeader(line);
        if (!idx) throw new Error("not an ECDICT csv: header missing or ambiguous");
        // Present-but-optional columns: they decide admission at R2/R3 and are
        // then discarded, so a file without them simply cannot reach those rungs.
        const names = pbpEcdictSplitLine(line).map((n) => n.trim());
        const ex = names.indexOf("exchange"), de = names.indexOf("definition");
        if (ex >= 0) idx.exchange = ex;
        if (de >= 0) idx.definition = de;
        continue;
      }
      rows++;
      const r = pbpEcdictParseRow(line, idx, rung);
      if (r.fatal) throw new Error("not an ECDICT csv: " + r.fatal);
      if (r.malformed) { malformed++; continue; }
      if (!r.ok) continue;
      records.push(r.record);
      // Accumulated here rather than in one pass afterwards: a single trailing
      // encode of the whole payload was measured as a long task on its own.
      payloadBytes += pbpEcdictRecordBytes(r.record, enc);
      if (records.length > PBP_ECDICT_MAX_ENTRIES) throw new Error("ECDICT entry count above the accepted ceiling");
      if (payloadBytes > PBP_ECDICT_MAX_PAYLOAD_BYTES) throw new Error("ECDICT payload above the accepted ceiling");
      if (records.length % 20000 === 0 && o.onParsed) { try { o.onParsed(records.length); } catch (_) {} }
    }
    // Every resource gate is checked BEFORE a transaction exists, so a rejected
    // file never touches the store.
    if (!idx) throw new Error("not an ECDICT csv: empty file");
    if (!records.length) throw new Error("ECDICT import parsed no usable rows");
    if (rows && malformed / rows > PBP_ECDICT_MAX_MALFORMED_RATIO) {
      throw new Error("not an ECDICT csv: too many malformed rows");
    }
    const metaRecord = {
      id: _PBP_ECDICT_META_ID,
      state: "ready",
      entries: records.length,
      rung,
      importedAt: Date.now(),
      decodedBytes: (stats && stats.bytes) || 0,
      // Diagnostic only. See pbpCrc32Update: 32 bits, collisions exist.
      decodedCrc32: stats && typeof stats.crc === "number" ? pbpCrc32Hex(stats.crc) : ""
    };
    // Phase marker: everything above is parsing, everything below is the one
    // transaction. Lets a harness attribute a main-thread stall to the phase
    // that can yield versus the phase that must not.
    if (o.onPhase) { try { o.onPhase("parsed"); } catch (_) {} }
    const db = await _pbpPackOpenDB();
    await _pbpPackTx(db, "readwrite", (tx) => {
      _pbpEcdictCommit(tx, records, metaRecord, o.onProgress);
    }, [_PBP_ECDICT_STORE, _PBP_PACK_META]);
    return { entries: records.length, malformed, rows, payloadBytes, rung };
  });
}

// Exact-key lookup. Meta and index read share ONE readonly transaction so no
// caller needs a racy second meta read.
async function pbpEcdictLookup(term) {
  try {
    const key = pbpEcdictKey(term);
    if (!key) return { state: "ready-miss" };
    const db = await _pbpPackOpenDB();
    return await new Promise((resolve) => {
      let settled = false;
      const finish = (r) => { if (!settled) { settled = true; resolve(r); } };
      let tx;
      try { tx = db.transaction([_PBP_ECDICT_STORE, _PBP_PACK_META], "readonly"); }
      catch (_) { finish({ state: "error" }); return; }
      tx.onabort = tx.onerror = () => finish({ state: "error" });
      const metaReq = tx.objectStore(_PBP_PACK_META).get(_PBP_ECDICT_META_ID);
      metaReq.onsuccess = () => {
        const meta = metaReq.result;
        if (!meta || meta.state !== "ready") { finish({ state: "unavailable" }); return; }
        let rowsReq;
        try { rowsReq = tx.objectStore(_PBP_ECDICT_STORE).index("key").getAll(key); }
        catch (_) { finish({ state: "error" }); return; }
        rowsReq.onsuccess = () => {
          const rows = rowsReq.result || [];
          finish(rows.length ? { state: "hit", matched: key, rows, meta } : { state: "ready-miss" });
        };
        rowsReq.onerror = () => finish({ state: "error" });
      };
      metaReq.onerror = () => finish({ state: "error" });
    });
  } catch (_) { return { state: "error" }; }
}

// Batched exact lookup for the vocabulary/export paths: ONE readonly
// transaction for every key, never one transaction per visible row. Returns a
// Map of key -> rows for the keys that hit; a missing key is simply absent.
// Resolves to an empty Map when no pack is ready, so callers need no state check.
async function pbpEcdictLookupMany(keys) {
  const out = new Map();
  try {
    const wanted = [...new Set((Array.isArray(keys) ? keys : []).map(pbpEcdictKey).filter(Boolean))];
    if (!wanted.length) return out;
    const db = await _pbpPackOpenDB();
    return await new Promise((resolve) => {
      let settled = false;
      const finish = () => { if (!settled) { settled = true; resolve(out); } };
      let tx;
      try { tx = db.transaction([_PBP_ECDICT_STORE, _PBP_PACK_META], "readonly"); }
      catch (_) { finish(); return; }
      tx.onabort = tx.onerror = finish;
      tx.oncomplete = finish;
      const metaReq = tx.objectStore(_PBP_PACK_META).get(_PBP_ECDICT_META_ID);
      metaReq.onsuccess = () => {
        const meta = metaReq.result;
        if (!meta || meta.state !== "ready") return;   // tx.oncomplete resolves
        const index = tx.objectStore(_PBP_ECDICT_STORE).index("key");
        for (const k of wanted) {
          const req = index.getAll(k);
          req.onsuccess = () => { if (req.result && req.result.length) out.set(k, req.result); };
        }
      };
    });
  } catch (_) { return out; }
}

async function pbpEcdictMeta() {
  try {
    const db = await _pbpPackOpenDB();
    return await new Promise((resolve) => {
      const req = db.transaction(_PBP_PACK_META, "readonly").objectStore(_PBP_PACK_META).get(_PBP_ECDICT_META_ID);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve({ state: "error" });
    });
  } catch (_) { return { state: "error" }; }
}

async function pbpEcdictDelete() {
  return navigator.locks.request(_PBP_ECDICT_LOCK, async () => {
    const db = await _pbpPackOpenDB();
    await _pbpPackTx(db, "readwrite", (tx) => {
      tx.objectStore(_PBP_PACK_META).delete(_PBP_ECDICT_META_ID);
      tx.objectStore(_PBP_ECDICT_STORE).clear();
    }, [_PBP_ECDICT_STORE, _PBP_PACK_META]);
    return true;
  });
}

// File import entry (options page). Sniffs gzip/zip by magic bytes, not by
// filename, so a mis-named .csv still works.
async function pbpEcdictImportFile(file, opts) {
  const head = new Uint8Array(await file.slice(0, 2).arrayBuffer());
  const stats = { bytes: 0, crc: 0 };
  if (head[0] === 0x50 && head[1] === 0x4b) {
    const text = await pbpPackZipTextStream(file);
    return pbpEcdictImport(pbpCedictLines(text, false, stats, PBP_ECDICT_MAX_BYTES), stats, opts);
  }
  const gzip = head[0] === 0x1f && head[1] === 0x8b;
  return pbpEcdictImport(pbpCedictLines(file.stream(), gzip, stats, PBP_ECDICT_MAX_BYTES), stats, opts);
}
