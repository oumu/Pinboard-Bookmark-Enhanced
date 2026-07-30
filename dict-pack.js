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

// Streaming line splitter over a (possibly gzip) ReadableStream. The
// TextDecoderStream handles UTF-8 across byte chunks; `carry` handles lines
// across text chunks. fatal:true rejects on invalid UTF-8 (wrong file).
// stats.bytes counts DECOMPRESSED bytes (64MB hard cap; stored in meta).
// The line-length check runs BEFORE the yield too -- a 70KB line whose
// newline arrives in the same chunk must not slip through.
async function* pbpCedictLines(stream, gzip, stats) {
  stats = stats || { bytes: 0 };
  stats.bytes = 0;
  let text = stream;
  if (gzip) text = text.pipeThrough(new DecompressionStream("gzip"));
  text = text.pipeThrough(new TransformStream({
    transform(chunk, controller) {
      stats.bytes += chunk.byteLength;
      if (stats.bytes > 64 * 1024 * 1024) throw new Error("CEDICT file too large");
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

// ---- PURE END ----

// ---- IDB layer (DB pbp-dict-packs) --------------------------------------
const _PBP_PACK_DB = "pbp-dict-packs";
const _PBP_PACK_STORE = "cedict";
const _PBP_PACK_META = "packs";
let _pbpPackDbPromise = null;

function _pbpPackOpenDB() {
  if (_pbpPackDbPromise) return _pbpPackDbPromise;
  _pbpPackDbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(_PBP_PACK_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      // Inline autoIncrement id: getAll() only returns VALUES, so the id
      // must live in the record for merge/dedup/sort to see it.
      const store = db.createObjectStore(_PBP_PACK_STORE, { keyPath: "id", autoIncrement: true });
      store.createIndex("simp", "simp", { unique: false });
      store.createIndex("trad", "trad", { unique: false });
      db.createObjectStore(_PBP_PACK_META, { keyPath: "id" });
    };
    req.onsuccess = () => {
      const db = req.result;
      // Future schema bump: close on versionchange and drop the cached
      // promise so a long-lived options tab doesn't block the upgrade.
      db.onversionchange = () => { try { db.close(); } catch (_) {} _pbpPackDbPromise = null; };
      resolve(db);
    };
    req.onerror = () => { _pbpPackDbPromise = null; reject(req.error || new Error("pack db open failed")); };
  });
  return _pbpPackDbPromise;
}

function _pbpPackTx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([_PBP_PACK_STORE, _PBP_PACK_META], mode);
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
