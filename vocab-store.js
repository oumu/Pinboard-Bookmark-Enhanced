// Persistent, owner-scoped vocabulary storage. This stays free of DOM,
// chrome.*, and fetch so options, previews, and the service worker can share it.

// "en-US" / "ZH_cn" -> "en" / "zh"; falsy -> "".
function pbpDictPrimaryLang(code) {
  const s = String(code || "").trim().toLowerCase();
  if (!s) return "";
  return s.split(/[-_]/)[0];
}

function pbpDictNormalizeTerm(term) {
  return String(term || "").normalize("NFC").trim().replace(/\s+/g, " ");
}

// Folded identity shared by vocab and dictctx2_. Do not use it for online
// dictionary results: May/may and Polish/polish can be different entries.
function pbpDictCacheKeyPublic(lang, term) {
  return pbpDictPrimaryLang(lang) + "|" + pbpDictNormalizeTerm(term).toLowerCase();
}

// Vocab identity (account-isolation invariant): "{owner}|{primary}|{normalized}".
// owner is the non-secret scope from _pbpTrOwnerScope ("acct_..." / "ownerless").
function pbpDictVocabKey(owner, lang, term) {
  return (owner || "ownerless") + "|" + pbpDictCacheKeyPublic(lang, term);
}

// Only http/https may reach an href (external data must not smuggle
// javascript:/data: URLs past the extension CSP).
function pbpDictSafeUrl(url) {
  try {
    const u = new URL(String(url || ""));
    return (u.protocol === "https:" || u.protocol === "http:") ? u.href : "";
  } catch (_) { return ""; }
}

// contexts[] merge (spec §4.1): dedup by articleUrl+quote; fresh array.
function pbpDictMergeContext(contexts, ctx) {
  const list = Array.isArray(contexts) ? contexts.slice() : [];
  if (!ctx || !ctx.quote) return list;
  const dup = list.some((c) => c && c.articleUrl === ctx.articleUrl && c.quote === ctx.quote);
  if (!dup) list.push(ctx);
  return list;
}

// Non-secret owner scope for vocab records: "acct_<encoded username>" or
// "ownerless". Must stay format-identical to md-ai-core.js's _pbpTrOwnerScope.
function pbpDictOwnerScope(account) {
  return account ? "acct_" + encodeURIComponent(String(account)) : "ownerless";
}

// NOT the ai-cache DB (vocab is permanent, never LRU'd, own version track).
// Account-isolation invariant: every record carries the non-secret owner
// scope and every read filters by it.
const _PBP_VOCAB_DB_NAME = "pbp-vocab";
const _PBP_VOCAB_DB_VERSION = 2;
const _PBP_VOCAB_STORE = "words";
let _pbpVocabDbPromise = null;

function _pbpVocabOpenDB() {
  if (_pbpVocabDbPromise) return _pbpVocabDbPromise;
  _pbpVocabDbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(_PBP_VOCAB_DB_NAME, _PBP_VOCAB_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(_PBP_VOCAB_STORE)) {
        const store = db.createObjectStore(_PBP_VOCAB_STORE, { keyPath: "id" });
        store.createIndex("owner", "owner", { unique: false });
        store.createIndex("updatedAt", "updatedAt", { unique: false });
      }
      if (!db.objectStoreNames.contains("sync")) {
        db.createObjectStore("sync", { keyPath: "key" });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      // A future schema bump fires versionchange on every open connection --
      // without this, a long-lived preview tab holds the old version open
      // forever and blocks the upgrade. Close and drop the cached promise so
      // the next call reopens against the new version.
      db.onversionchange = () => { try { db.close(); } catch (_) {} _pbpVocabDbPromise = null; };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
  });
  _pbpVocabDbPromise.catch(() => { _pbpVocabDbPromise = null; });
  return _pbpVocabDbPromise;
}

async function pbpVocabGet(id) {
  try {
    const db = await _pbpVocabOpenDB();
    return await new Promise((resolve) => {
      const req = db.transaction(_PBP_VOCAB_STORE, "readonly").objectStore(_PBP_VOCAB_STORE).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch (_) { return null; }
}

function pbpVocabNormalizeGroupName(value) {
  return String(value || "").normalize("NFC").trim().replace(/\s+/gu, " ");
}

function pbpVocabGroups(record) {
  const seen = new Set();
  const groups = [];
  for (const value of (record && Array.isArray(record.groups) ? record.groups : [])) {
    const name = pbpVocabNormalizeGroupName(value);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    groups.push(name);
  }
  return groups;
}

// Unlike sibling helpers which swallow so reader paths degrade, this one
// propagates failures so the options UI can distinguish empty from unreadable.
async function pbpVocabAll(owner) {
  const db = await _pbpVocabOpenDB();
  const rows = await new Promise((resolve, reject) => {
    const idx = db.transaction(_PBP_VOCAB_STORE, "readonly").objectStore(_PBP_VOCAB_STORE).index("owner");
    const req = idx.getAll(owner || "ownerless");
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error || new Error("vocab read failed"));
  });
  for (const row of rows) row.groups = pbpVocabGroups(row);
  rows.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  return rows;
}

async function pbpVocabDelete(id, expectedOwner) {
  try {
    const db = await _pbpVocabOpenDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(_PBP_VOCAB_STORE, "readwrite");
      const store = tx.objectStore(_PBP_VOCAB_STORE);
      let allowed = true;
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const rec = getReq.result;
        if (rec && rec.owner !== expectedOwner) allowed = false;
        else store.delete(id);
      };
      tx.oncomplete = () => resolve(allowed);
      tx.onabort = () => resolve(false);
      tx.onerror = () => resolve(false);
    });
  } catch (_) { return false; }
}

async function _pbpVocabBatchMutate(ids, expectedOwner, mutate) {
  const uniqueIds = [...new Set((Array.isArray(ids) ? ids : []).map(String).filter(Boolean))];
  if (!uniqueIds.length) return false;
  try {
    const db = await _pbpVocabOpenDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(_PBP_VOCAB_STORE, "readwrite");
      const store = tx.objectStore(_PBP_VOCAB_STORE);
      let allowed = true;
      const abort = () => {
        if (!allowed) return;
        allowed = false;
        try { tx.abort(); } catch (_) {}
      };
      for (const id of uniqueIds) {
        const req = store.get(id);
        req.onsuccess = () => {
          const record = req.result;
          if (!record || record.owner !== expectedOwner) { abort(); return; }
          try { mutate(store, record); } catch (_) { abort(); }
        };
        req.onerror = abort;
      }
      tx.oncomplete = () => resolve(allowed);
      tx.onabort = () => resolve(false);
      tx.onerror = () => resolve(false);
    });
  } catch (_) { return false; }
}

function pbpVocabBatchDelete(ids, expectedOwner) {
  return _pbpVocabBatchMutate(ids, expectedOwner, (store, record) => store.delete(record.id));
}

function pbpVocabBatchAddGroup(ids, expectedOwner, rawGroup) {
  const group = pbpVocabNormalizeGroupName(rawGroup);
  if (!group) return Promise.resolve(false);
  const now = Date.now();
  return _pbpVocabBatchMutate(ids, expectedOwner, (store, record) => {
    const groups = pbpVocabGroups(record);
    if (groups.includes(group)) return;
    record.groups = [...groups, group];
    record.updatedAt = now;
    store.put(record);
  });
}

async function pbpVocabSaveWord(owner, w) {
  try {
    const db = await _pbpVocabOpenDB();
    const scope = owner || "ownerless";
    const id = pbpDictVocabKey(scope, w.language, w.term);
    const now = Date.now();
    return await new Promise((resolve) => {
      const tx = db.transaction(_PBP_VOCAB_STORE, "readwrite");
      const store = tx.objectStore(_PBP_VOCAB_STORE);
      let result = null;
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const cur = getReq.result || {
          id, owner: scope,
          term: String(w.term || "").normalize("NFC").trim(),
          lemma: null, language: pbpDictPrimaryLang(w.language) || "und",
          gloss: "", ipa: null, sourceUrl: null, license: null,
          contexts: [], groups: [], note: "", status: "new", createdAt: now, updatedAt: now
        };
        cur.groups = pbpVocabGroups(cur);
        if (w.lemma && !cur.lemma) cur.lemma = String(w.lemma);
        if (w.gloss) cur.gloss = String(w.gloss);
        if (w.ipa && !cur.ipa) cur.ipa = String(w.ipa);
        if (w.sourceUrl || w.license) {
          cur.sourceUrl = w.sourceUrl ? (pbpDictSafeUrl(w.sourceUrl) || null) : null;
          cur.license = w.license ? String(w.license) : null;
        }
        cur.contexts = pbpDictMergeContext(cur.contexts, w.context);
        cur.updatedAt = now;
        store.put(cur);
        result = cur;
      };
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => resolve(null);
      tx.onerror = () => resolve(null);
    });
  } catch (_) { return null; }
}
