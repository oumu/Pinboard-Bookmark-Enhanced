// Persistent, owner-scoped vocabulary storage. This stays free of DOM and
// fetch; chrome.runtime is only an optional post-commit dirty notification.

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

function _pbpVocabDenseArray(value) {
  if (!Array.isArray(value)) return false;
  for (let i = 0; i < value.length; i++) {
    if (!Object.prototype.hasOwnProperty.call(value, i)) return false;
  }
  return true;
}

function _pbpVocabOwnValue(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key) ? value[key] : undefined;
}

function _pbpVocabValidVector(vector) {
  return _pbpVocabPlainObject(vector) && Object.keys(vector).length > 0 &&
    Object.keys(vector).every((deviceId) => _pbpVocabDeviceId(deviceId) && _pbpVocabPositiveInteger(_pbpVocabOwnValue(vector, deviceId)));
}

function pbpVocabVectorRelation(left, right) {
  if (!_pbpVocabValidVector(left) || !_pbpVocabValidVector(right)) throw new TypeError("invalid version vector");
  let leftGreater = false;
  let rightGreater = false;
  for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
    const a = _pbpVocabOwnValue(left, key) || 0;
    const b = _pbpVocabOwnValue(right, key) || 0;
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

function _pbpVocabCanonicalRecordKey(recordKey) {
  if (typeof recordKey !== "string") return false;
  const separator = recordKey.indexOf("|");
  if (separator <= 0) return false;
  const language = recordKey.slice(0, separator);
  const term = recordKey.slice(separator + 1);
  const canonicalLanguage = pbpDictPrimaryLang(language);
  const canonicalTerm = pbpDictNormalizeTerm(term).toLowerCase();
  return !!canonicalLanguage && canonicalLanguage === language &&
    !!canonicalTerm && canonicalTerm === term;
}

function pbpVocabValidateEvent(event, expectedRecordKey) {
  if (!_pbpVocabOnlyKeys(event, ["recordKey", "vector", "dot", "deleted", "value"]) ||
      !_pbpVocabCanonicalRecordKey(event.recordKey) ||
      (expectedRecordKey !== undefined && event.recordKey !== expectedRecordKey) ||
      !_pbpVocabValidVector(event.vector) || !_pbpVocabOnlyKeys(event.dot, ["deviceId", "counter"]) ||
      typeof event.deleted !== "boolean") return false;
  try {
    if (pbpVocabDotCompare(event.dot, event.dot) !== 0 ||
        !_pbpVocabPositiveInteger(_pbpVocabOwnValue(event.vector, event.dot.deviceId)) ||
        _pbpVocabOwnValue(event.vector, event.dot.deviceId) < event.dot.counter) return false;
  } catch (_) { return false; }
  if (event.deleted) return !Object.prototype.hasOwnProperty.call(event, "value");
  const value = event.value;
  const fields = ["term", "lemma", "language", "gloss", "ipa", "sourceUrl", "license", "contexts", "groups", "note", "status", "createdAt", "updatedAt"];
  const primaryLanguage = pbpDictPrimaryLang(value && value.language);
  const normalizedTerm = pbpDictNormalizeTerm(value && value.term);
  if (!_pbpVocabOnlyKeys(value, fields) || Object.keys(value).length !== fields.length ||
      typeof value.term !== "string" || !value.term || typeof value.language !== "string" || !value.language ||
      !primaryLanguage || !normalizedTerm ||
      typeof value.gloss !== "string" || typeof value.note !== "string" || typeof value.status !== "string" ||
      !Number.isFinite(value.createdAt) || !Number.isFinite(value.updatedAt) ||
      !(value.lemma === null || typeof value.lemma === "string") || !(value.ipa === null || typeof value.ipa === "string") ||
      !(value.license === null || typeof value.license === "string") ||
      !(value.sourceUrl === null || (typeof value.sourceUrl === "string" && pbpDictSafeUrl(value.sourceUrl) === value.sourceUrl)) ||
      !_pbpVocabDenseArray(value.groups) || !value.groups.every((group) => typeof group === "string") ||
      !_pbpVocabDenseArray(value.contexts) || !value.contexts.every(_pbpVocabValidContext)) return false;
  return event.recordKey === primaryLanguage + "|" + normalizedTerm.toLowerCase();
}

function pbpVocabEventContentEqual(left, right) {
  return _pbpVocabCanonicalJson(left) === _pbpVocabCanonicalJson(right);
}

function _pbpVocabMergedVector(left, right) {
  const vector = Object.create(null);
  for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
    vector[key] = Math.max(_pbpVocabOwnValue(left, key) || 0, _pbpVocabOwnValue(right, key) || 0);
  }
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
  if (!localEvent.deleted && !remoteEvent.deleted &&
      (localEvent.value.term !== remoteEvent.value.term || localEvent.value.language !== remoteEvent.value.language)) return invalid;
  if (relation === "left") return { kind: "noop", event: localEvent, requeue: false, notice: null };
  if (relation === "right") return { kind: "apply", event: remoteEvent, requeue: false, notice: null };
  const winner = pbpVocabDotCompare(localEvent.dot, remoteEvent.dot) >= 0 ? localEvent : remoteEvent;
  const other = winner === localEvent ? remoteEvent : localEvent;
  const live = !localEvent.deleted ? localEvent : (!remoteEvent.deleted ? remoteEvent : null);
  const provenance = localEvent.deleted === remoteEvent.deleted ? winner : live;
  const event = {
    recordKey: localEvent.recordKey, vector: _pbpVocabMergedVector(localEvent.vector, remoteEvent.vector),
    dot: { deviceId: provenance.dot.deviceId, counter: provenance.dot.counter }, deleted: !live
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

function _pbpVocabRequest(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("vocab request failed"));
  });
}

function _pbpVocabTransactionDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onabort = tx.onerror = () => reject(tx.error || new Error("vocab transaction failed"));
  });
}

function _pbpVocabRecordKey(owner, record) {
  if (!record || record.owner !== owner) return "";
  const recordKey = pbpDictCacheKeyPublic(record.language, record.term);
  return record.id === owner + "|" + recordKey ? recordKey : "";
}

function _pbpVocabWordValue(record) {
  return {
    term: String(record.term || ""),
    lemma: record.lemma == null ? null : String(record.lemma),
    language: String(record.language || "und"),
    gloss: String(record.gloss || ""),
    ipa: record.ipa == null ? null : String(record.ipa),
    sourceUrl: record.sourceUrl ? (pbpDictSafeUrl(record.sourceUrl) || null) : null,
    license: record.license == null ? null : String(record.license),
    contexts: Array.isArray(record.contexts) ? record.contexts.map((context) => ({ ...context })) : [],
    groups: Array.isArray(record.groups) ? record.groups.slice() : [],
    note: String(record.note || ""),
    status: String(record.status || "new"),
    createdAt: Number.isFinite(record.createdAt) ? record.createdAt : 0,
    updatedAt: Number.isFinite(record.updatedAt) ? record.updatedAt : 0
  };
}

function _pbpVocabStoredEvent(metadata, word) {
  if (!metadata || typeof metadata.recordKey !== "string") return null;
  const event = {
    recordKey: metadata.recordKey,
    vector: metadata.vector,
    dot: metadata.dot,
    deleted: metadata.deleted === true
  };
  if (!event.deleted) {
    if (!word) return null;
    event.value = _pbpVocabWordValue(word);
  }
  return pbpVocabValidateEvent(event, metadata.recordKey) ? event : null;
}

function _pbpVocabWordFromEvent(owner, event) {
  const value = event.value;
  return {
    id: owner + "|" + event.recordKey, owner,
    term: value.term, lemma: value.lemma, language: value.language,
    gloss: value.gloss, ipa: value.ipa, sourceUrl: value.sourceUrl,
    license: value.license, contexts: value.contexts.map((context) => ({ ...context })),
    groups: value.groups.slice(), note: value.note, status: value.status,
    createdAt: value.createdAt, updatedAt: value.updatedAt
  };
}

function _pbpVocabDirty(owner) {
  try {
    const pending = globalThis.chrome?.runtime?.sendMessage?.({ type: "PBP_VOCAB_DIRTY", owner });
    if (pending && typeof pending.catch === "function") pending.catch(() => {});
  } catch (_) {}
}

function _pbpVocabMeta(value) {
  if (value === undefined) return { key: "meta", deviceId: crypto.randomUUID(), counter: 0 };
  return _pbpVocabOnlyKeys(value, ["key", "deviceId", "counter"]) &&
    Object.keys(value).length === 3 && value.key === "meta" &&
    _pbpVocabDeviceId(value.deviceId) && Number.isSafeInteger(value.counter) && value.counter >= 0
    ? { key: "meta", deviceId: value.deviceId, counter: value.counter }
    : null;
}

// The sole local-write primitive: every logical mutation commits words,
// vector/dot metadata, and the coalesced outbox in one transaction.
async function _pbpVocabLocalMutation(owner, itemsOrLoad, mutate, requireExisting = false) {
  const scope = owner || "ownerless";
  let tx = null;
  let done = null;
  try {
    const db = await _pbpVocabOpenDB();
    tx = db.transaction([_PBP_VOCAB_STORE, "sync"], "readwrite");
    done = _pbpVocabTransactionDone(tx);
    const words = tx.objectStore(_PBP_VOCAB_STORE);
    const sync = tx.objectStore("sync");
    const loaded = typeof itemsOrLoad === "function"
      ? await itemsOrLoad(words, sync)
      : itemsOrLoad;
    const items = Array.isArray(loaded) ? loaded : [];
    if (!items.length) {
      await done;
      return { ok: true, changed: 0, results: [] };
    }

    const current = await Promise.all(items.map((item) => item.current !== undefined
      ? item.current
      : _pbpVocabRequest(words.get(item.id))));
    const actions = [];
    for (let i = 0; i < items.length; i++) {
      if ((requireExisting && !current[i]) || (current[i] && current[i].owner !== scope)) {
        throw new Error("owner mismatch");
      }
      const action = mutate(current[i] || null, items[i]);
      if (!action || action.invalid) throw new Error("invalid mutation");
      actions.push(action);
    }

    const changed = actions.map((action, index) => ({ action, item: items[index], current: current[index] }))
      .filter(({ action }) => action.changed);
    if (!changed.length) {
      await done;
      return { ok: true, changed: 0, results: actions.map((action) => action.result) };
    }

    const meta = _pbpVocabMeta(await _pbpVocabRequest(sync.get("meta")));
    if (!meta) throw new Error("invalid sync metadata");
    const existing = await Promise.all(changed.map(({ action, current: word }) => {
      const recordKey = action.recordKey || _pbpVocabRecordKey(scope, action.word || word);
      if (!recordKey) return Promise.resolve({ recordKey: "", metadata: null });
      return _pbpVocabRequest(sync.get(`record:${scope}:${recordKey}`))
        .then((metadata) => ({ recordKey, metadata }));
    }));

    for (let i = 0; i < changed.length; i++) {
      const { action, current: previousWord } = changed[i];
      const { recordKey, metadata } = existing[i];
      if (!recordKey || (metadata && (metadata.owner !== scope || metadata.recordKey !== recordKey))) {
        throw new Error("invalid record metadata");
      }
      if (metadata && !_pbpVocabStoredEvent(metadata, metadata.deleted ? null : previousWord)) {
        throw new Error("corrupt record metadata");
      }
      if (meta.counter >= Number.MAX_SAFE_INTEGER) throw new Error("counter exhausted");
      meta.counter++;
      const vector = metadata && _pbpVocabValidVector(metadata.vector)
        ? _pbpVocabMergedVector(metadata.vector, { [meta.deviceId]: meta.counter })
        : { [meta.deviceId]: meta.counter };
      vector[meta.deviceId] = meta.counter;
      const event = {
        recordKey, vector,
        dot: { deviceId: meta.deviceId, counter: meta.counter },
        deleted: action.deleted === true
      };
      if (!event.deleted) event.value = _pbpVocabWordValue(action.word);
      if (!pbpVocabValidateEvent(event, recordKey)) throw new Error("invalid local event");
      if (event.deleted) words.delete(scope + "|" + recordKey);
      else words.put(action.word);
      sync.put({
        key: `record:${scope}:${recordKey}`, owner: scope, recordKey,
        vector: event.vector, dot: event.dot, deleted: event.deleted
      });
      sync.put({ key: `outbox:${scope}:${recordKey}`, owner: scope, recordKey, event });
    }
    sync.put(meta);
    await done;
    _pbpVocabDirty(scope);
    return { ok: true, changed: changed.length, results: actions.map((action) => action.result) };
  } catch (_) {
    try { if (tx) tx.abort(); } catch (_) {}
    if (done) await done.catch(() => {});
    return { ok: false, changed: 0, results: [] };
  }
}

async function pbpVocabDelete(id, expectedOwner) {
  const scope = expectedOwner || "ownerless";
  const result = await _pbpVocabLocalMutation(scope, [{ id: String(id || "") }], (record) => {
    if (!record) return { changed: false, result: true };
    const recordKey = _pbpVocabRecordKey(scope, record);
    return recordKey
      ? { changed: true, deleted: true, recordKey, result: true }
      : { invalid: true };
  });
  return result.ok;
}

function _pbpVocabBatchItems(ids) {
  return [...new Set((Array.isArray(ids) ? ids : []).map(String).filter(Boolean))]
    .map((id) => ({ id }));
}

async function pbpVocabBatchDelete(ids, expectedOwner) {
  const scope = expectedOwner || "ownerless";
  const items = _pbpVocabBatchItems(ids);
  if (!items.length) return false;
  const result = await _pbpVocabLocalMutation(scope, items, (record) => {
    const recordKey = _pbpVocabRecordKey(scope, record);
    return recordKey
      ? { changed: true, deleted: true, recordKey, result: true }
      : { invalid: true };
  }, true);
  return result.ok;
}

async function pbpVocabBatchAddGroup(ids, expectedOwner, rawGroup) {
  const scope = expectedOwner || "ownerless";
  const group = pbpVocabNormalizeGroupName(rawGroup);
  const items = _pbpVocabBatchItems(ids);
  if (!group || !items.length) return false;
  const now = Date.now();
  const result = await _pbpVocabLocalMutation(scope, items, (record) => {
    const recordKey = _pbpVocabRecordKey(scope, record);
    if (!recordKey) return { invalid: true };
    const groups = pbpVocabGroups(record);
    if (groups.includes(group)) return { changed: false, result: record };
    const word = { ...record, groups: [...groups, group], updatedAt: now };
    return { changed: true, deleted: false, recordKey, word, result: word };
  }, true);
  return result.ok;
}

async function pbpVocabSaveWord(owner, w) {
  const scope = owner || "ownerless";
  const id = pbpDictVocabKey(scope, w.language, w.term);
  const now = Date.now();
  const result = await _pbpVocabLocalMutation(scope, [{ id }], (record) => {
    const cur = record ? { ...record } : {
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
    const recordKey = _pbpVocabRecordKey(scope, cur);
    return recordKey
      ? { changed: true, deleted: false, recordKey, word: cur, result: cur }
      : { invalid: true };
  });
  return result.ok ? result.results[0] : null;
}

function _pbpVocabAccountKey(drivePermissionId, ownerHash) {
  return `account:${String(drivePermissionId || "")}:${String(ownerHash || "")}`;
}

function _pbpVocabPreflightKey(ownerHash) {
  return `preflight:${String(ownerHash || "")}`;
}

function _pbpVocabBatchKey(drivePermissionId, ownerHash, driveFileId) {
  return `batch:${String(drivePermissionId || "")}:${String(ownerHash || "")}:${String(driveFileId || "")}`;
}

function _pbpVocabValidOwnerHash(value) {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

function _pbpVocabValidPreflightState(state) {
  const errors = new Set(["auth", "permission", "corrupt", "remote", "network"]);
  return _pbpVocabPlainObject(state) &&
    _pbpVocabOnlyKeys(state, [
      "key", "ownerHash", "retryAttempt", "retryAt", "lastError", "blocked"
    ]) &&
    Object.keys(state).length === 6 &&
    _pbpVocabValidOwnerHash(state.ownerHash) &&
    state.key === _pbpVocabPreflightKey(state.ownerHash) &&
    Number.isSafeInteger(state.retryAttempt) && state.retryAttempt >= 0 &&
    (state.retryAt === null || (Number.isFinite(state.retryAt) && state.retryAt > 0)) &&
    (state.lastError === null || errors.has(state.lastError)) &&
    typeof state.blocked === "boolean";
}

function _pbpVocabValidBatchBody(body, expectedOwnerHash) {
  return _pbpVocabValidOwnerHash(expectedOwnerHash) &&
    _pbpVocabOnlyKeys(body, ["schema", "ownerHash", "deviceId", "createdAt", "entries"]) &&
    Object.keys(body).length === 5 && body.schema === 1 &&
    body.ownerHash === expectedOwnerHash && _pbpVocabDeviceId(body.deviceId) &&
    Number.isFinite(body.createdAt) && Array.isArray(body.entries) &&
    body.entries.every((event) => pbpVocabValidateEvent(event));
}

async function pbpVocabGetAccountState(drivePermissionId, ownerHash) {
  const db = await _pbpVocabOpenDB();
  return (await _pbpVocabRequest(db.transaction("sync", "readonly").objectStore("sync")
    .get(_pbpVocabAccountKey(drivePermissionId, ownerHash)))) || null;
}

async function pbpVocabGetPreflightState(ownerHash) {
  if (!_pbpVocabValidOwnerHash(ownerHash)) return null;
  const db = await _pbpVocabOpenDB();
  const stored = await _pbpVocabRequest(
    db.transaction("sync", "readonly").objectStore("sync")
      .get(_pbpVocabPreflightKey(ownerHash))
  );
  return _pbpVocabValidPreflightState(stored) ? stored : null;
}

async function pbpVocabPutPreflightState(state) {
  if (!_pbpVocabValidPreflightState(state)) return false;
  try {
    const db = await _pbpVocabOpenDB();
    const tx = db.transaction("sync", "readwrite");
    const done = _pbpVocabTransactionDone(tx);
    tx.objectStore("sync").put({ ...state });
    await done;
    return true;
  } catch (_) { return false; }
}

async function pbpVocabDeletePreflightState(ownerHash) {
  if (!_pbpVocabValidOwnerHash(ownerHash)) return false;
  try {
    const db = await _pbpVocabOpenDB();
    const tx = db.transaction("sync", "readwrite");
    const done = _pbpVocabTransactionDone(tx);
    tx.objectStore("sync").delete(_pbpVocabPreflightKey(ownerHash));
    await done;
    return true;
  } catch (_) { return false; }
}

async function pbpVocabGetSyncMeta() {
  const db = await _pbpVocabOpenDB();
  const tx = db.transaction("sync", "readwrite");
  const done = _pbpVocabTransactionDone(tx);
  const sync = tx.objectStore("sync");
  const stored = await _pbpVocabRequest(sync.get("meta"));
  const meta = _pbpVocabMeta(stored);
  if (stored === undefined) sync.put(meta);
  await done;
  return meta;
}

async function pbpVocabListAccountStates(ownerHash) {
  if (!_pbpVocabValidOwnerHash(ownerHash)) return [];
  return (await _pbpVocabSyncRows()).filter((row) =>
    row && row.ownerHash === ownerHash && typeof row.key === "string" &&
    row.key.startsWith("account:"));
}

async function pbpVocabPutAccountState(state) {
  if (!_pbpVocabPlainObject(state) ||
      state.key !== _pbpVocabAccountKey(state.drivePermissionId, state.ownerHash)) return false;
  try {
    const db = await _pbpVocabOpenDB();
    const tx = db.transaction("sync", "readwrite");
    const done = _pbpVocabTransactionDone(tx);
    tx.objectStore("sync").put({ ...state });
    await done;
    return true;
  } catch (_) { return false; }
}

async function _pbpVocabSyncRows() {
  const db = await _pbpVocabOpenDB();
  return await _pbpVocabRequest(db.transaction("sync", "readonly").objectStore("sync").getAll());
}

async function pbpVocabListOutbox(owner) {
  const scope = owner || "ownerless";
  return (await _pbpVocabSyncRows()).filter((row) =>
    row && row.owner === scope && typeof row.key === "string" &&
    row.key.startsWith(`outbox:${scope}:`));
}

async function pbpVocabListPendingBatches(drivePermissionId, ownerHash) {
  return (await _pbpVocabSyncRows()).filter((row) =>
    row && row.drivePermissionId === drivePermissionId && row.ownerHash === ownerHash &&
    typeof row.key === "string" && row.key.startsWith(`batch:${drivePermissionId}:${ownerHash}:`));
}

async function pbpVocabFreezeOutbox(owner, drivePermissionId, ownerHash, driveFileId, envelope) {
  const scope = owner || "ownerless";
  const body = typeof envelope === "string" ? envelope
    : (envelope && typeof envelope.body === "string" ? envelope.body : null);
  let parsed = null;
  try { parsed = typeof body === "string" ? JSON.parse(body) : null; } catch (_) {}
  if (!drivePermissionId || !driveFileId || !_pbpVocabValidBatchBody(parsed, ownerHash) ||
      !parsed.entries.length) return null;
  const entries = parsed.entries;
  try {
    const db = await _pbpVocabOpenDB();
    const tx = db.transaction("sync", "readwrite");
    const done = _pbpVocabTransactionDone(tx);
    const sync = tx.objectStore("sync");
    const current = await Promise.all(entries.map((event) =>
      _pbpVocabRequest(sync.get(`outbox:${scope}:${event.recordKey}`))));
    for (let i = 0; i < entries.length; i++) {
      if (current[i] && current[i].owner === scope &&
          pbpVocabEventContentEqual(current[i].event, entries[i])) sync.delete(current[i].key);
    }
    const pending = {
      key: _pbpVocabBatchKey(drivePermissionId, ownerHash, driveFileId),
      drivePermissionId, ownerHash, driveFileId, body, createdAt: Date.now()
    };
    sync.put(pending);
    await done;
    return pending;
  } catch (_) { return null; }
}

async function pbpVocabDeletePendingBatch(drivePermissionId, ownerHash, driveFileId) {
  try {
    const db = await _pbpVocabOpenDB();
    const tx = db.transaction("sync", "readwrite");
    const done = _pbpVocabTransactionDone(tx);
    tx.objectStore("sync").delete(_pbpVocabBatchKey(drivePermissionId, ownerHash, driveFileId));
    await done;
    return true;
  } catch (_) { return false; }
}

async function pbpVocabCheckpointOwner(owner) {
  const scope = owner || "ownerless";
  let tx = null;
  let done = null;
  try {
    const db = await _pbpVocabOpenDB();
    tx = db.transaction([_PBP_VOCAB_STORE, "sync"], "readwrite");
    done = _pbpVocabTransactionDone(tx);
    const words = tx.objectStore(_PBP_VOCAB_STORE);
    const sync = tx.objectStore("sync");
    const metadata = (await _pbpVocabRequest(sync.getAll())).filter((row) =>
      row && row.owner === scope && row.key.startsWith(`record:${scope}:`));
    for (const row of metadata) {
      const word = row.deleted ? null : await _pbpVocabRequest(words.get(scope + "|" + row.recordKey));
      const event = _pbpVocabStoredEvent(row, word);
      if (!event) throw new Error("corrupt record metadata");
      sync.put({ key: `outbox:${scope}:${row.recordKey}`, owner: scope, recordKey: row.recordKey, event });
    }
    await done;
    return metadata.length;
  } catch (error) {
    try { if (tx) tx.abort(); } catch (_) {}
    if (done) await done.catch(() => {});
    throw error;
  }
}

function _pbpVocabRemoteError(batchIndex) {
  return { ok: false, error: "invalid_remote_page", batchIndex };
}

async function pbpVocabApplyRemotePage(owner, ownerHash, batches, cursorCommit) {
  const scope = owner || "ownerless";
  if (!_pbpVocabValidOwnerHash(ownerHash) || !Array.isArray(batches)) return _pbpVocabRemoteError(-1);
  const entries = [];
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    if (!_pbpVocabValidBatchBody(batch, ownerHash)) {
      return _pbpVocabRemoteError(batchIndex);
    }
    for (const event of batch.entries) entries.push({ event, batchIndex });
  }
  if (cursorCommit !== null && cursorCommit !== undefined &&
      (!_pbpVocabPlainObject(cursorCommit) || cursorCommit.ownerHash !== ownerHash ||
       cursorCommit.key !== _pbpVocabAccountKey(cursorCommit.drivePermissionId, ownerHash))) {
    return _pbpVocabRemoteError(-1);
  }

  let tx = null;
  let done = null;
  let badBatch = -1;
  try {
    const db = await _pbpVocabOpenDB();
    tx = db.transaction([_PBP_VOCAB_STORE, "sync"], "readwrite");
    done = _pbpVocabTransactionDone(tx);
    const words = tx.objectStore(_PBP_VOCAB_STORE);
    const sync = tx.objectStore("sync");
    const state = new Map();
    let applied = 0;
    let merged = 0;
    let ignored = 0;

    for (const item of entries) {
      badBatch = item.batchIndex;
      const remote = item.event;
      let local = state.get(remote.recordKey);
      if (local === undefined) {
        const metadata = await _pbpVocabRequest(sync.get(`record:${scope}:${remote.recordKey}`));
        if (metadata) {
          const word = metadata.deleted ? null
            : await _pbpVocabRequest(words.get(scope + "|" + remote.recordKey));
          local = _pbpVocabStoredEvent(metadata, word);
          if (!local) throw new Error("corrupt local state");
        } else {
          if (await _pbpVocabRequest(words.get(scope + "|" + remote.recordKey))) {
            throw new Error("unseeded local record");
          }
          local = null;
        }
      }
      const outcome = local
        ? pbpVocabMergeEvents(local, remote)
        : { kind: "apply", event: remote, requeue: false, notice: null };
      if (outcome.kind === "invalid" || outcome.kind === "corrupt") throw new Error("invalid remote event");
      if (outcome.kind === "noop") {
        ignored++;
        state.set(remote.recordKey, local);
        continue;
      }

      const event = outcome.event;
      const id = scope + "|" + event.recordKey;
      if (event.deleted) words.delete(id);
      else words.put(_pbpVocabWordFromEvent(scope, event));
      sync.put({
        key: `record:${scope}:${event.recordKey}`, owner: scope, recordKey: event.recordKey,
        vector: event.vector, dot: event.dot, deleted: event.deleted
      });
      if (outcome.requeue) {
        sync.put({ key: `outbox:${scope}:${event.recordKey}`, owner: scope, recordKey: event.recordKey, event });
        merged++;
      } else {
        sync.delete(`outbox:${scope}:${event.recordKey}`);
        applied++;
      }
      if (outcome.notice) {
        sync.put({
          key: `notice:${scope}:${event.recordKey}`, owner: scope, recordKey: event.recordKey,
          code: outcome.notice, createdAt: Date.now()
        });
      }
      state.set(event.recordKey, event);
    }
    if (cursorCommit) sync.put({ ...cursorCommit });
    await done;
    return { ok: true, applied, merged, ignored };
  } catch (_) {
    try { if (tx) tx.abort(); } catch (_) {}
    if (done) await done.catch(() => {});
    return _pbpVocabRemoteError(badBatch);
  }
}

async function pbpVocabSeedLegacy(owner, limit = 100) {
  const scope = owner || "ownerless";
  const max = Math.max(0, Math.min(100, Number.isFinite(limit) ? Math.floor(limit) : 100));
  if (!max) return { ok: true, processed: 0 };
  const result = await _pbpVocabLocalMutation(scope, async (words, sync) => {
    // ponytail: one-time bootstrap scans local vocabulary; add a persisted
    // cursor only if real large libraries make this measurable.
    const rows = await _pbpVocabRequest(words.index("owner").getAll(scope));
    const selected = [];
    for (const record of rows) {
      if (selected.length >= max) break;
      const recordKey = _pbpVocabRecordKey(scope, record);
      if (!recordKey) throw new Error("invalid legacy record");
      if (!await _pbpVocabRequest(sync.get(`record:${scope}:${recordKey}`))) {
        selected.push({ id: record.id, current: record });
      }
    }
    return selected;
  }, (record) => {
    const recordKey = _pbpVocabRecordKey(scope, record);
    return recordKey
      ? { changed: true, deleted: false, recordKey, word: record, result: record }
      : { invalid: true };
  }, true);
  return { ok: result.ok, processed: result.changed };
}

function _pbpVocabImportedWord(owner, record) {
  if (!_pbpVocabPlainObject(record) || record.owner !== owner) return null;
  const term = String(record.term || "");
  const language = String(record.language || "");
  const id = owner + "|" + pbpDictCacheKeyPublic(language, term);
  if (!term || record.id !== id || !Array.isArray(record.contexts) || !Array.isArray(record.groups)) return null;
  const sourceUrl = record.sourceUrl == null ? null : pbpDictSafeUrl(record.sourceUrl);
  if (record.sourceUrl != null && !sourceUrl) return null;
  const word = {
    id, owner, term, language,
    lemma: record.lemma == null ? null : String(record.lemma),
    gloss: String(record.gloss || ""), ipa: record.ipa == null ? null : String(record.ipa),
    sourceUrl,
    license: record.license == null ? null : String(record.license),
    contexts: record.contexts.map((context) => ({ ...context })),
    groups: pbpVocabGroups(record), note: String(record.note || ""),
    status: String(record.status || "new"),
    createdAt: Number.isFinite(record.createdAt) ? record.createdAt : Date.now(),
    updatedAt: Number.isFinite(record.updatedAt) ? record.updatedAt : Date.now()
  };
  return _pbpVocabRecordKey(owner, word) && pbpVocabValidateEvent({
    recordKey: pbpDictCacheKeyPublic(language, term), vector: { import: 1 },
    dot: { deviceId: "import", counter: 1 }, deleted: false, value: _pbpVocabWordValue(word)
  }) ? word : null;
}

async function pbpVocabImportRecords(owner, records, limit = 100) {
  const scope = owner || "ownerless";
  const max = Math.max(0, Math.min(100, Number.isFinite(limit) ? Math.floor(limit) : 100));
  const input = Array.isArray(records) ? records.slice(0, max) : [];
  if (!input.length) return { ok: true, processed: 0, remaining: 0 };
  const imported = input.map((record) => _pbpVocabImportedWord(scope, record));
  if (imported.some((record) => !record)) return { ok: false, processed: 0, remaining: records.length };
  const unique = [...new Map(imported.map((record) => [record.id, record])).values()];
  const result = await _pbpVocabLocalMutation(scope, unique.map((record) => ({ id: record.id, imported: record })),
    (current, item) => {
      const incoming = item.imported;
      const word = current ? {
        ...incoming,
        id: current.id, owner: current.owner, term: current.term, language: current.language,
        contexts: incoming.contexts.reduce((all, context) => pbpDictMergeContext(all, context), current.contexts || []),
        groups: pbpVocabGroups({ groups: [...pbpVocabGroups(current), ...incoming.groups] }),
        createdAt: Number.isFinite(current.createdAt)
          ? Math.min(current.createdAt, incoming.createdAt)
          : incoming.createdAt,
        updatedAt: Number.isFinite(current.updatedAt)
          ? Math.max(current.updatedAt, incoming.updatedAt)
          : incoming.updatedAt
      } : incoming;
      return {
        changed: true, deleted: false, recordKey: pbpDictCacheKeyPublic(word.language, word.term),
        word, result: word
      };
    });
  return { ok: result.ok, processed: result.ok ? result.changed : 0, remaining: Math.max(0, records.length - input.length) };
}

async function pbpVocabReadNotices(owner) {
  const scope = owner || "ownerless";
  return (await _pbpVocabSyncRows()).filter((row) =>
    row && row.owner === scope && typeof row.key === "string" &&
    row.key.startsWith(`notice:${scope}:`));
}
