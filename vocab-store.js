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

// Pure sync protocol helpers. Keep them before IndexedDB so the service worker
// can validate and converge remote entries without loading reader code.
function _pbpVocabPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function _pbpVocabPositiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function _pbpVocabDeviceId(value) {
  return typeof value === "string" && !!value && value === value.normalize("NFC");
}

function _pbpVocabOnlyKeys(value, keys) {
  return _pbpVocabPlainObject(value) && Object.keys(value).every((key) => keys.includes(key));
}

function _pbpVocabValidVector(vector) {
  return _pbpVocabPlainObject(vector) && Object.keys(vector).length > 0 &&
    Object.keys(vector).every((deviceId) => _pbpVocabDeviceId(deviceId) && _pbpVocabPositiveInteger(vector[deviceId]));
}

function pbpVocabVectorRelation(left, right) {
  if (!_pbpVocabValidVector(left) || !_pbpVocabValidVector(right)) throw new TypeError("invalid version vector");
  let leftGreater = false;
  let rightGreater = false;
  for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
    const a = left[key] || 0;
    const b = right[key] || 0;
    if (a > b) leftGreater = true;
    if (b > a) rightGreater = true;
  }
  return leftGreater ? (rightGreater ? "concurrent" : "left") : (rightGreater ? "right" : "equal");
}

function _pbpVocabCodePointCompare(left, right) {
  const a = String(left).normalize("NFC");
  const b = String(right).normalize("NFC");
  const ai = a[Symbol.iterator]();
  const bi = b[Symbol.iterator]();
  for (;;) {
    const an = ai.next();
    const bn = bi.next();
    if (an.done || bn.done) return an.done === bn.done ? 0 : (an.done ? -1 : 1);
    const diff = an.value.codePointAt(0) - bn.value.codePointAt(0);
    if (diff) return diff;
  }
}

function pbpVocabDotCompare(left, right) {
  if (!_pbpVocabPlainObject(left) || !_pbpVocabPlainObject(right) ||
      !_pbpVocabDeviceId(left.deviceId) || !_pbpVocabDeviceId(right.deviceId) ||
      !_pbpVocabPositiveInteger(left.counter) || !_pbpVocabPositiveInteger(right.counter)) {
    throw new TypeError("invalid version dot");
  }
  return left.counter - right.counter || _pbpVocabCodePointCompare(left.deviceId, right.deviceId);
}

function _pbpVocabValidContext(context) {
  if (!_pbpVocabOnlyKeys(context, ["quote", "articleUrl", "articleTitle", "highlightId", "createdAt"]) ||
      typeof context.quote !== "string" || !context.quote || typeof context.articleUrl !== "string") return false;
  return (context.articleTitle === undefined || typeof context.articleTitle === "string") &&
    (context.highlightId === undefined || context.highlightId === null || typeof context.highlightId === "string") &&
    (context.createdAt === undefined || Number.isFinite(context.createdAt));
}

function _pbpVocabCanonicalJson(value) {
  if (Array.isArray(value)) return "[" + value.map(_pbpVocabCanonicalJson).join(",") + "]";
  if (_pbpVocabPlainObject(value)) return "{" + Object.keys(value).sort(_pbpVocabCodePointCompare)
    .map((key) => JSON.stringify(key) + ":" + _pbpVocabCanonicalJson(value[key])).join(",") + "}";
  return JSON.stringify(value);
}

function pbpVocabValidateEvent(event, expectedRecordKey) {
  if (!_pbpVocabOnlyKeys(event, ["recordKey", "vector", "dot", "deleted", "value"]) ||
      typeof event.recordKey !== "string" || !event.recordKey ||
      (expectedRecordKey !== undefined && event.recordKey !== expectedRecordKey) ||
      !_pbpVocabValidVector(event.vector) || !_pbpVocabPlainObject(event.dot) ||
      typeof event.deleted !== "boolean") return false;
  try {
    if (pbpVocabDotCompare(event.dot, event.dot) !== 0 || event.vector[event.dot.deviceId] !== event.dot.counter) return false;
  } catch (_) { return false; }
  if (event.deleted) return !Object.prototype.hasOwnProperty.call(event, "value");
  const value = event.value;
  const fields = ["term", "lemma", "language", "gloss", "ipa", "sourceUrl", "license", "contexts", "groups", "note", "status", "createdAt", "updatedAt"];
  if (!_pbpVocabOnlyKeys(value, fields) || Object.keys(value).length !== fields.length ||
      typeof value.term !== "string" || !value.term || typeof value.language !== "string" || !value.language ||
      typeof value.gloss !== "string" || typeof value.note !== "string" || typeof value.status !== "string" ||
      !Number.isFinite(value.createdAt) || !Number.isFinite(value.updatedAt) ||
      !(value.lemma === null || typeof value.lemma === "string") || !(value.ipa === null || typeof value.ipa === "string") ||
      !(value.license === null || typeof value.license === "string") ||
      !(value.sourceUrl === null || (typeof value.sourceUrl === "string" && pbpDictSafeUrl(value.sourceUrl) === value.sourceUrl)) ||
      !Array.isArray(value.groups) || !value.groups.every((group) => typeof group === "string") ||
      !Array.isArray(value.contexts) || !value.contexts.every(_pbpVocabValidContext)) return false;
  return event.recordKey === pbpDictCacheKeyPublic(value.language, value.term);
}

function pbpVocabEventContentEqual(left, right) {
  return _pbpVocabCanonicalJson(left) === _pbpVocabCanonicalJson(right);
}

function _pbpVocabMergedVector(left, right) {
  const vector = {};
  for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) vector[key] = Math.max(left[key] || 0, right[key] || 0);
  return vector;
}

function _pbpVocabMergeLiveValues(winner, other) {
  const value = winner.value;
  const contexts = value.contexts.slice();
  for (const context of other.value.contexts) {
    const next = pbpDictMergeContext(contexts, context);
    contexts.length = 0;
    contexts.push(...next);
  }
  const groups = pbpVocabGroups({ groups: [...value.groups, ...other.value.groups] });
  return {
    term: value.term, lemma: value.lemma, language: value.language, gloss: value.gloss, ipa: value.ipa,
    sourceUrl: value.sourceUrl, license: value.license, contexts, groups,
    note: value.note || other.value.note, status: value.status,
    createdAt: Math.min(value.createdAt, other.value.createdAt), updatedAt: Math.max(value.updatedAt, other.value.updatedAt)
  };
}

function pbpVocabMergeEvents(localEvent, remoteEvent) {
  const invalid = { kind: "invalid", event: null, requeue: false, notice: null };
  if (!pbpVocabValidateEvent(localEvent) || !pbpVocabValidateEvent(remoteEvent, localEvent.recordKey)) return invalid;
  const relation = pbpVocabVectorRelation(localEvent.vector, remoteEvent.vector);
  if (relation === "equal") return pbpVocabEventContentEqual(localEvent, remoteEvent)
    ? { kind: "noop", event: localEvent, requeue: false, notice: null }
    : { kind: "corrupt", event: localEvent, requeue: false, notice: null };
  if (relation === "left") return { kind: "noop", event: localEvent, requeue: false, notice: null };
  if (relation === "right") return { kind: "apply", event: remoteEvent, requeue: false, notice: null };
  const winner = pbpVocabDotCompare(localEvent.dot, remoteEvent.dot) >= 0 ? localEvent : remoteEvent;
  const other = winner === localEvent ? remoteEvent : localEvent;
  const live = !localEvent.deleted ? localEvent : (!remoteEvent.deleted ? remoteEvent : null);
  const event = {
    recordKey: localEvent.recordKey, vector: _pbpVocabMergedVector(localEvent.vector, remoteEvent.vector),
    dot: { deviceId: winner.dot.deviceId, counter: winner.dot.counter }, deleted: !live
  };
  if (live) event.value = !localEvent.deleted && !remoteEvent.deleted
    ? _pbpVocabMergeLiveValues(winner, other)
    : { ...live.value, contexts: live.value.contexts.slice(), groups: live.value.groups.slice() };
  return { kind: "merged", event, requeue: true, notice: live && (localEvent.deleted || remoteEvent.deleted) ? "delete-live-conflict" : null };
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
