// ============================================================
// Pinboard Bookmark Enhanced - eudic-sync.js
// Send saved vocabulary to Eudic's (欧路词典) default study list via their
// official OpenAPI (BYO authorization from my.eudic.net/OpenAPI/Authorization).
// Supported languages per the API: en / fr / de / es only. v1 always targets
// the per-language DEFAULT study list (category_id "0") -- categories are
// per-language, so a single custom id cannot span four languages safely.
// Pure helpers above PURE END load in tests/eudic-sync-tests.html.
// ============================================================

const PBP_EUDIC_ENDPOINT = "https://api.frdic.com";
const PBP_EUDIC_ADD_PATH = "/api/open/v1/studylist/words";
const PBP_EUDIC_LANGS = ["en", "fr", "de", "es"];

function pbpEudicSupportedLang(language) {
  const primary = typeof pbpDictPrimaryLang === "function"
    ? pbpDictPrimaryLang(language)
    : String(language == null ? "" : language).trim().toLowerCase().split(/[-_]/)[0];
  return PBP_EUDIC_LANGS.includes(primary) ? primary : null;
}

// rows (vocab records) -> per-language unique term lists + unsupported count.
// unsupportedTerms names them: a bare count left users unable to tell WHICH
// words never made it.
function pbpEudicPartition(rows) {
  const byLang = new Map();
  let unsupported = 0;
  const unsupportedTerms = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    const term = r && typeof r.term === "string" ? r.term.trim() : "";
    if (!term) continue;
    const lang = pbpEudicSupportedLang(r.language);
    if (!lang) { unsupported++; unsupportedTerms.push(term); continue; }
    if (!byLang.has(lang)) byLang.set(lang, new Set());
    byLang.get(lang).add(term);
  }
  const out = new Map();
  for (const [lang, set] of byLang) out.set(lang, [...set]);
  return { byLang: out, unsupported, unsupportedTerms };
}

// Official examples use "Authorization: NIS xxxx" -- canonicalize: strip
// any user-pasted prefix (any case) and emit exactly "NIS <token>".
function pbpEudicAuthHeader(raw) {
  const t = String(raw == null ? "" : raw).trim();
  return t ? "NIS " + t.replace(/^NIS\s+/i, "") : "";
}

function pbpEudicBuildBody(lang, words) {
  return { language: lang, category_id: "0", words: Array.isArray(words) ? words : [] };
}

// 201 + a message like "单词导入成功,导入数量 : 2". No per-word results, no
// structured count -- when the message shape drifts we report generic
// success (imported: null) instead of inventing numbers.
function pbpEudicParseResult(status, text) {
  const raw = String(text == null ? "" : text);
  let message = raw;
  try {
    const data = JSON.parse(raw);
    if (data && typeof data.message === "string") message = data.message;
  } catch (_) {}
  if (status === 201) { // the documented success status; nothing else counts
    const m = /导入数量\s*[:：]\s*(\d+)/.exec(message);
    return { ok: true, imported: m ? Number(m[1]) : null, message };
  }
  return { ok: false, imported: null, message };
}

// Server-side dedup means: added = imported, skipped = unique - imported.
// Returns null when imported was unparseable (caller shows generic success).
function pbpEudicCounts(uniqueCount, imported) {
  if (imported == null || !Number.isFinite(imported)) return null;
  const added = Math.max(0, Math.min(uniqueCount, imported));
  return { added, skipped: uniqueCount - added };
}

// ---- PURE END ----

// ---- Client (options.html only) -----------------------------------------
async function pbpEudicCall(body, token, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs || 15000);
  try {
    const resp = await fetch(PBP_EUDIC_ENDPOINT + PBP_EUDIC_ADD_PATH, {
      method: "POST",
      headers: {
        "Authorization": pbpEudicAuthHeader(token),
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
    const parsed = pbpEudicParseResult(resp.status, await resp.text());
    parsed.status = resp.status;
    return parsed;
  } catch (e) {
    return { ok: false, imported: null, status: 0, message: (e && e.name === "AbortError") ? "timeout" : "unreachable" };
  } finally {
    clearTimeout(timer);
  }
}

// One POST per language, sequential, NO artificial spacing (max 4 requests).
// A 403 only proves that Eudic rejected the request; do not guess the cause
// or a wait window. Break the circuit and let the UI suggest checking the
// token before a later retry. ownerCheck runs before every POST.
// Lightweight connectivity probe (roadmap #31): the official read-only
// category-list endpoint on the SAME already-disclosed origin — no user data
// leaves, only the Authorization header rides along. 401/403 -> "auth" so the
// tester can point at the token; anything else network-ish -> "unreachable".
const PBP_EUDIC_PING_PATH = "/api/open/v1/studylist/category?language=en";
async function pbpEudicPing(auth, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs || 10000);
  try {
    const resp = await fetch(PBP_EUDIC_ENDPOINT + PBP_EUDIC_PING_PATH, {
      method: "GET",
      headers: { "Authorization": pbpEudicAuthHeader(auth) },
      signal: ctrl.signal
    });
    if (resp.status === 401 || resp.status === 403) return { ok: false, error: "auth" };
    if (!resp.ok) return { ok: false, error: "http_" + resp.status };
    return { ok: true, error: null };
  } catch (e) {
    return { ok: false, error: (e && e.name === "AbortError") ? "timeout" : "unreachable" };
  } finally {
    clearTimeout(timer);
  }
}

async function pbpEudicSendRows(rows, opts) {
  const token = (opts && opts.token) || "";
  const ownerCheck = (opts && opts.ownerCheck) || (async () => true);
  const { byLang, unsupported, unsupportedTerms } = pbpEudicPartition(rows);
  const out = { added: 0, skipped: 0, unsupported, unsupportedTerms, failed: 0, failedTerms: [],
    forbidden: false, generic: false, stage: "done", error: null };
  const batches = [...byLang];
  for (let i = 0; i < batches.length; i++) {
    const [lang, words] = batches[i];
    if (!(await ownerCheck())) { out.stage = "owner"; out.error = "account changed"; return out; }
    const res = await pbpEudicCall(pbpEudicBuildBody(lang, words), token, 15000);
    if (res.ok) {
      const counts = pbpEudicCounts(words.length, res.imported);
      if (counts) { out.added += counts.added; out.skipped += counts.skipped; }
      else out.generic = true; // 201 but unparseable count
    } else if (res.status === 401) {
      out.stage = "auth"; out.error = res.message; return out;
    } else if (res.status === 403) {
      out.forbidden = true;
      // Circuit break: the words of THIS batch and every unsent batch all
      // count failed -- nothing silently disappears from the totals.
      for (let j = i; j < batches.length; j++) {
        out.failed += batches[j][1].length;
        out.failedTerms.push(...batches[j][1]);
      }
      break;
    } else {
      out.failed += words.length;
      out.failedTerms.push(...words);
      // Spec: surface the server's 400 message (parameter errors) verbatim.
      if (!out.error && res.status === 400 && res.message) out.error = res.message;
    }
  }
  return out;
}
