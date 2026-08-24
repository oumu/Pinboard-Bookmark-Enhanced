// ============================================================
// Pinboard Bookmark Enhanced - AI Cache (IndexedDB backend)
// ============================================================
// Replaces chrome.storage.local-based ai_cache_* keys. Removes 5MB
// quota limit and avoids read-modify-write storage write amplification
// from the prior index-based LRU. Same call surface as ai.js's
// getAICache/setAICache; ai.js wraps these as the sole IDB-only AI-cache API.

const _PBP_AI_DB_NAME = "pbp-ai-cache";
const _PBP_AI_DB_VERSION = 1;
const _PBP_AI_STORE = "entries";
const _PBP_AI_CACHE_MAX_ENTRIES = 200;
const _PBP_AI_DICT2_MAX_ENTRIES = 500;
const _PBP_AI_DICT2_PREFIX = "dict2_";
// Contextual glosses churn one key per word x sentence x model, while the
// shared pool's other tenants (tr_/ask_/trview_/skim_) hold one key per
// ARTICLE -- thirty lookups in one sitting used to evict thirty articles'
// paid translations. Same bound as dict2_ for the same repeat-heavy reason.
const _PBP_AI_DICTCTX_MAX_ENTRIES = 500;
const _PBP_AI_DICTCTX_PREFIX = "dictctx2_";
const _PBP_AI_SUMMARY_OWNER_MAX_ENTRIES = 500;
const _PBP_AI_SUMMARY_OWNER_PREFIX = "summary_owner_";
// Full-text translations: one key per ARTICLE x (lang, model), the priciest
// entries in the store (a whole article's paid output). In the shared
// 200-slot pool a heavy reader's footprint is 5-7 keys per article
// (tr_/trview_/gloss_/ai_cache_tags/ai_cache_summary/ask_/skim_), so 200
// slots covered only ~30-45 articles; reopening an older bookmark meant
// paying for a full retranslation. Deliberately NO TTL, unlike FluentRead
// (24h) / OnlyTranslate (30d): bookmarks are read-later, a translation is
// still worth its cost half a year on; LRU + this bound suffice.
const _PBP_AI_TR_MAX_ENTRIES = 300;
const _PBP_AI_TR_PREFIX = "tr_";
// Video AI-punctuation aggregates (`vpunct_`, md-video.js): one whole
// transcript's paid pass per entry -- the same weight class as `tr_`, so
// it gets its own pool instead of evicting tags/summary/ask/skim out of the
// shared 200 (video retro V2).
const _PBP_AI_VPUNCT_MAX_ENTRIES = 300;
const _PBP_AI_VPUNCT_PREFIX = "vpunct_";
let _pbpAiDbPromise = null;

function _pbpAiOpenDB() {
  if (_pbpAiDbPromise) return _pbpAiDbPromise;
  _pbpAiDbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(_PBP_AI_DB_NAME, _PBP_AI_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(_PBP_AI_STORE)) {
        const store = db.createObjectStore(_PBP_AI_STORE, { keyPath: "key" });
        store.createIndex("ts", "ts", { unique: false });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      // Future schema bump: close on versionchange and drop the cached
      // promise so a long-lived preview/options page doesn't block it.
      db.onversionchange = () => { try { db.close(); } catch (_) {} _pbpAiDbPromise = null; };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
  });
  _pbpAiDbPromise.catch(() => { _pbpAiDbPromise = null; }); // allow retry
  return _pbpAiDbPromise;
}

// Read-touch throttle: bump ts on cache hits at most once per hour per
// entry. Eviction sorts by ts, but ts used to change only on writes -
// "LRU" was really write-recency, so read-hot entries that are never
// rewritten (an ask thread you reopen without asking again) were silently
// evicted by unrelated tr_/skim_ write bursts. No consumer displays
// entry.ts, so touching it is safe.
const _PBP_AI_TOUCH_MIN_AGE = 3600000;

// Fire-and-forget ts bump. Get-then-put inside ONE readwrite transaction:
// putting back the entry the caller already read would race a concurrent
// pbpAiCacheAppend from another tab (the same lost-update window that
// helper exists to close); re-reading inside the transaction keeps the
// freshest result and only refreshes ts.
function _pbpAiTouch(db, key) {
  try {
    const tx = db.transaction(_PBP_AI_STORE, "readwrite");
    const store = tx.objectStore(_PBP_AI_STORE);
    const req = store.get(key);
    req.onsuccess = () => {
      const cur = req.result;
      if (cur) {
        try { store.put({ key: cur.key, result: cur.result, ts: Date.now() }); } catch (_) {}
      }
    };
  } catch (_) {}
}

async function pbpAiCacheGet(key) {
  try {
    const db = await _pbpAiOpenDB();
    const entry = await new Promise((resolve) => {
      const tx = db.transaction(_PBP_AI_STORE, "readonly");
      const req = tx.objectStore(_PBP_AI_STORE).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
    // ai_cache_ entries (tags/summary, ai.js getAICache) use ts as their
    // GENERATION time for a user-configured fixed TTL - touching them
    // would turn that into a sliding expiry where a frequently-read
    // summary never expires. The check below is a PREFIX EXCLUSION, not an
    // allowlist: every key family except ai_cache_ gets the read-touch,
    // which today includes ask_/tr_/trview_/gloss_/skim_ and dict2_/
    // dictctx2_ -- any new LRU-semantic family benefits automatically
    // without a code change here.
    if (entry && typeof entry.ts === "number"
      && String(key).indexOf("ai_cache_") !== 0
      && Date.now() - entry.ts > _PBP_AI_TOUCH_MIN_AGE) {
      _pbpAiTouch(db, key);
    }
    return entry;
  } catch (_) {
    return null;
  }
}

function _pbpAiIsDict2Key(key) {
  return typeof key === "string" && key.startsWith(_PBP_AI_DICT2_PREFIX);
}

function _pbpAiIsDictCtxKey(key) {
  return typeof key === "string" && key.startsWith(_PBP_AI_DICTCTX_PREFIX);
}

function _pbpAiIsSummaryOwnerKey(key) {
  return typeof key === "string" && key.startsWith(_PBP_AI_SUMMARY_OWNER_PREFIX);
}

function _pbpAiIsTrKey(key) {
  return typeof key === "string" && key.startsWith(_PBP_AI_TR_PREFIX);
}

function _pbpAiIsVpunctKey(key) {
  return typeof key === "string" && key.startsWith(_PBP_AI_VPUNCT_PREFIX);
}

function _pbpAiPoolForKey(key) {
  if (_pbpAiIsDict2Key(key)) return "dict2";
  if (_pbpAiIsDictCtxKey(key)) return "dictctx";
  if (_pbpAiIsSummaryOwnerKey(key)) return "summary-owner";
  if (_pbpAiIsTrKey(key)) return "tr";
  if (_pbpAiIsVpunctKey(key)) return "vpunct";
  return "other";
}

function _pbpAiPrefixRange(prefix) {
  return IDBKeyRange.bound(prefix, prefix + "\uffff");
}

function _pbpAiDict2Range() {
  return _pbpAiPrefixRange(_PBP_AI_DICT2_PREFIX);
}

// "dictctx2_" sorts ABOVE "dict2_￿" ('c' > '2' at index 4), so the two
// prefix ranges cannot overlap.
function _pbpAiDictCtxRange() {
  return _pbpAiPrefixRange(_PBP_AI_DICTCTX_PREFIX);
}

function _pbpAiSummaryOwnerRange() {
  return _pbpAiPrefixRange(_PBP_AI_SUMMARY_OWNER_PREFIX);
}

// "trview_" sorts ABOVE "tr_￿" ('v' U+0076 > '_' U+005F at index 2), and no
// other family starts with "tr_", so this range holds exactly the tr_ pool.
// Pinned by the "prefix range geometry" test -- an easy invariant to break in
// a rename; keep the test with the code.
function _pbpAiTrRange() {
  return _pbpAiPrefixRange(_PBP_AI_TR_PREFIX);
}

// "vpunct_" shares no prefix with any other family ("v" is unique as a
// leading letter), so the range holds exactly the vpunct_ pool.
function _pbpAiVpunctRange() {
  return _pbpAiPrefixRange(_PBP_AI_VPUNCT_PREFIX);
}

function _pbpAiDeleteOldestInPool(store, overflow, pool) {
  if (overflow <= 0) return;
  const cursorReq = store.index("ts").openCursor(); // ASC by ts (oldest first)
  let deleted = 0;
  cursorReq.onsuccess = () => {
    const cursor = cursorReq.result;
    if (!cursor || deleted >= overflow) return;
    const entryKey = cursor.value && cursor.value.key;
    if (_pbpAiPoolForKey(entryKey) === pool) {
      cursor.delete();
      deleted++;
    }
    if (deleted < overflow) cursor.continue();
  };
}

// Pure arithmetic for the shared pool's overflow: the other pool is whatever
// is NOT in a dedicated pool, so every dedicated pool must be subtracted --
// adding a pool without extending this subtraction silently over-evicts the
// innocent other-pool families (ask/skim/tags/summary). Unit-tested (ZH-6).
function _pbpAiOtherOverflow(totalCount, dict2Count, dictCtxCount, summaryOwnerCount, trCount, vpunctCount) {
  return Math.max(0,
    Math.max(0, totalCount - dict2Count - dictCtxCount - summaryOwnerCount - trCount - (vpunctCount || 0))
      - _PBP_AI_CACHE_MAX_ENTRIES);
}

function _pbpAiPruneWrittenPool(store, key) {
  const pool = _pbpAiPoolForKey(key);
  if (pool !== "other") {
    const range = pool === "dict2" ? _pbpAiDict2Range()
      : pool === "dictctx" ? _pbpAiDictCtxRange()
      : pool === "tr" ? _pbpAiTrRange()
      : pool === "vpunct" ? _pbpAiVpunctRange()
      : _pbpAiSummaryOwnerRange();
    const max = pool === "dict2" ? _PBP_AI_DICT2_MAX_ENTRIES
      : pool === "dictctx" ? _PBP_AI_DICTCTX_MAX_ENTRIES
      : pool === "tr" ? _PBP_AI_TR_MAX_ENTRIES
      : pool === "vpunct" ? _PBP_AI_VPUNCT_MAX_ENTRIES
      : _PBP_AI_SUMMARY_OWNER_MAX_ENTRIES;
    const countReq = store.count(range);
    countReq.onsuccess = () => {
      _pbpAiDeleteOldestInPool(store, (countReq.result || 0) - max, pool);
    };
    return;
  }

  let totalCount = 0;
  let dict2Count = 0;
  let dictCtxCount = 0;
  let summaryOwnerCount = 0;
  let trCount = 0;
  let vpunctCount = 0;
  let pending = 6;   // ZH-6: 4 -> 5 with the tr pool, 6 with vpunct; MUST stay equal to the count requests below
  const prune = () => {
    pending--;
    if (pending !== 0) return;
    _pbpAiDeleteOldestInPool(store,
      _pbpAiOtherOverflow(totalCount, dict2Count, dictCtxCount, summaryOwnerCount, trCount, vpunctCount),
      "other");
  };
  const totalReq = store.count();
  totalReq.onsuccess = () => { totalCount = totalReq.result || 0; prune(); };
  const dict2Req = store.count(_pbpAiDict2Range());
  dict2Req.onsuccess = () => { dict2Count = dict2Req.result || 0; prune(); };
  const ctxReq = store.count(_pbpAiDictCtxRange());
  ctxReq.onsuccess = () => { dictCtxCount = ctxReq.result || 0; prune(); };
  const ownerReq = store.count(_pbpAiSummaryOwnerRange());
  ownerReq.onsuccess = () => { summaryOwnerCount = ownerReq.result || 0; prune(); };
  const trReq = store.count(_pbpAiTrRange());
  trReq.onsuccess = () => { trCount = trReq.result || 0; prune(); };
  const vpReq = store.count(_pbpAiVpunctRange());
  vpReq.onsuccess = () => { vpunctCount = vpReq.result || 0; prune(); };
}

// One store-scoped readwrite transaction owns the final write, target-pool
// count, and ts-LRU pruning. IndexedDB serializes these transactions across
// connections/tabs, so concurrent writers cannot observe the same overflow
// and delete it repeatedly. Versioned online dictionary records (exact
// `dict2_` prefix), contextual glosses (`dictctx2_`) and `summary_owner_`
// receipts each have independent 500-entry pools; full-text translations
// (`tr_`) have an independent 300-entry pool (ZH-6); every other family
// shares 200.
// `makeResult` is synchronous; append passes the latest value read inside this
// same transaction, preserving its existing no-lost-update guarantee.
async function _pbpAiWriteAndPrune(key, makeResult, ts, readExisting) {
  try {
    const db = await _pbpAiOpenDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(_PBP_AI_STORE, "readwrite");
      const store = tx.objectStore(_PBP_AI_STORE);
      tx.oncomplete = resolve;
      tx.onabort = () => reject(tx.error || new Error("AI cache transaction aborted"));
      tx.onerror = () => {};

      const write = (previous) => {
        let result;
        try { result = makeResult(previous); }
        catch (_) { try { tx.abort(); } catch (_) {} return; }
        const putReq = store.put({ key, result, ts });
        putReq.onsuccess = () => _pbpAiPruneWrittenPool(store, key);
      };

      if (!readExisting) {
        write(undefined);
        return;
      }
      const getReq = store.get(key);
      getReq.onsuccess = () => write(getReq.result ? getReq.result.result : undefined);
    });
  } catch (_) {}
}

async function pbpAiCacheSet(key, result, ts) {
  await _pbpAiWriteAndPrune(key, () => result, ts, false);
}

// Atomic get-then-transform-then-put, in ONE readwrite IDB transaction
// (D2-2). Unlike a separate pbpAiCacheGet()+pbpAiCacheSet() pair, this
// closes the lost-update race two tabs can hit on the same key (IndexedDB
// serializes readwrite transactions on the same store across ALL
// connections/tabs, so the get inside this transaction always sees the
// latest committed value). `transform(prevResult)` runs synchronously
// inside the transaction and returns the new `result` to store - it must
// not await or touch other stores. Used by md-ai-core.js's
// pbpAskHistAppend for ask history; degrades to a no-op on any failure
// (same swallow-all-errors contract as the rest of this file).
async function pbpAiCacheAppend(key, transform, ts) {
  await _pbpAiWriteAndPrune(key, transform, ts == null ? Date.now() : ts, true);
}

async function pbpAiCacheDelete(key) {
  try {
    const db = await _pbpAiOpenDB();
    await new Promise((resolve) => {
      const tx = db.transaction(_PBP_AI_STORE, "readwrite");
      const req = tx.objectStore(_PBP_AI_STORE).delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    });
  } catch (_) {}
}
