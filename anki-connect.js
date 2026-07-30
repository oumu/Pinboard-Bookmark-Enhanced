// ============================================================
// Pinboard Bookmark Enhanced - anki-connect.js
// Send saved vocabulary to a locally running Anki via the AnkiConnect
// add-on's HTTP API (http://127.0.0.1:8765, API v6). Pure helpers above
// PURE END load in tests/anki-connect-tests.html via file://; the client
// layer below runs only in options.html (options-vocab.js wires the button).
// Known limit: the 6-field contract has no Language column, so same-spelled
// terms across languages dedupe against each other inside one deck (matches
// the TSV contract; accepted for v1).
// ============================================================

// Port is user-configurable (AnkiConnect's own config allows changing it);
// the HOST is never configurable -- loopback-only is a network invariant.
// Anything that isn't a sane port number falls back to the default 8765.
function pbpAnkiEndpointFor(port) {
  const p = String(port == null ? "" : port).trim();
  const ok = /^\d{1,5}$/.test(p) && Number(p) >= 1 && Number(p) <= 65535;
  return "http://127.0.0.1:" + (ok ? p : "8765");
}
const PBP_ANKI_MODEL = "Pinboard Vocab";
const PBP_ANKI_FIELDS = ["Term", "Reading", "Definition", "Context", "Source", "License"];

// Anki fields are HTML. External dictionary content is DATA, never markup
// (Yomitan advisory GHSA-g3p8-q34q-x686) -- escape every field; the only
// markup a note ever contains is our own literal <br> joining contexts.
function pbpAnkiEscapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// row: the same canonical shape options-vocab.js feeds pbpDictTsv
// ({term, reading, definition, contexts[], source, license}) -- derived from
// the raw vocab record, NEVER from already-HTML-escaped values (the TSV path
// stays #html:false plain text).
function pbpAnkiNoteFromRow(row, deck) {
  const r = row || {};
  const contexts = (Array.isArray(r.contexts) ? r.contexts : [])
    .filter(Boolean).map(pbpAnkiEscapeHtml).join("<br>");
  return {
    deckName: String(deck || PBP_ANKI_MODEL),
    modelName: PBP_ANKI_MODEL,
    fields: {
      Term: pbpAnkiEscapeHtml(r.term),
      Reading: pbpAnkiEscapeHtml(r.reading),
      // Each piece is escaped on its OWN, then joined with our literal <br>.
      // Escaping a pre-joined string would show the tag as text; joining
      // pre-escaped-and-concatenated text would let dictionary data smuggle
      // markup. The model keeps its six fields, so no existing note type breaks.
      Definition: [pbpAnkiEscapeHtml(r.definition), r.zh ? pbpAnkiEscapeHtml(r.zh) : ""]
        .filter(Boolean).join("<br>"),
      Context: contexts,
      // Source stays the article URL only; dictionary provenance belongs in
      // License, where the online and local fragments are labelled separately.
      Source: pbpAnkiEscapeHtml(r.source),
      License: [pbpAnkiEscapeHtml(r.license), r.zhNote ? pbpAnkiEscapeHtml(r.zhNote) : ""]
        .filter(Boolean).join(" | ")
    },
    options: { allowDuplicate: false, duplicateScope: "deck" },
    tags: ["pinboard-enhanced"]
  };
}

// createModel params: 6 fields + one minimal Term->rest template. Pure
// {{Field}} references only -- no scripts, no styling beyond a plain card.
function pbpAnkiModelDef() {
  return {
    modelName: PBP_ANKI_MODEL,
    inOrderFields: PBP_ANKI_FIELDS.slice(),
    css: ".card { font-family: sans-serif; font-size: 18px; text-align: left; }",
    cardTemplates: [{
      Name: "Card 1",
      Front: "{{Term}}<br><i>{{Reading}}</i>",
      Back: "{{FrontSide}}<hr id=answer>{{Definition}}<br><br>{{Context}}<br><small>{{Source}} {{License}}</small>"
    }]
  };
}

// API key rides at the TOP LEVEL of the request envelope -- AnkiConnect's
// handler reads request.get("key"); params.key would not authenticate.
function pbpAnkiBuildRequest(action, params, key) {
  const req = { action: String(action || ""), version: 6, params: params || {} };
  if (key) req.key = String(key);
  return req;
}

// Takes the raw response TEXT (not a parsed object) so malformed JSON is a
// testable failure, and parses AnkiConnect's {result, error} envelope.
function pbpAnkiParseResult(text) {
  let data;
  try { data = JSON.parse(String(text == null ? "" : text)); } catch (_) {
    return { ok: false, result: null, error: "malformed response" };
  }
  if (!data || typeof data !== "object") return { ok: false, result: null, error: "malformed response" };
  if (data.error != null) return { ok: false, result: data.result == null ? null : data.result, error: String(data.error) };
  return { ok: true, result: "result" in data ? data.result : null, error: null };
}

// Strict name+order equality against the 6-field contract. AnkiConnect
// silently drops values for field names the model doesn't have, so a
// user-modified model must ABORT the send, never silently lose data.
function pbpAnkiFieldsMatch(names) {
  if (!Array.isArray(names) || names.length !== PBP_ANKI_FIELDS.length) return false;
  for (let i = 0; i < PBP_ANKI_FIELDS.length; i++) {
    if (names[i] !== PBP_ANKI_FIELDS[i]) return false;
  }
  return true;
}

// ---- PURE END ----

// ---- Client (options.html only) -----------------------------------------

// No Content-Type header ON PURPOSE: a string body ships as text/plain,
// which is CORS-simple and skips the OPTIONS preflight. Before an origin is
// trusted, AnkiConnect's preflight answer may carry the DEFAULT
// Access-Control-Allow-Origin (http://localhost) and the browser would kill
// a preflighted request before requestPermission ever runs.
async function pbpAnkiCall(action, params, key, timeoutMs, port) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs || 10000);
  try {
    const resp = await fetch(pbpAnkiEndpointFor(port), {
      method: "POST",
      body: JSON.stringify(pbpAnkiBuildRequest(action, params, key)),
      signal: ctrl.signal
    });
    return pbpAnkiParseResult(await resp.text());
  } catch (e) {
    return { ok: false, result: null, error: (e && e.name === "AbortError") ? "timeout" : "unreachable" };
  } finally {
    clearTimeout(timer);
  }
}

// Full send pipeline. opts: {deck, key, ownerCheck: async () => bool}.
// ownerCheck re-derives the CURRENT owner and compares to the rows' owner --
// called before every dispatch that follows a potentially long await
// (fail-closed account isolation; the Anki permission dialog can sit open
// for minutes). Returns {stage, added, skipped, failed, error}.
async function pbpAnkiSendRows(rows, opts) {
  const deck = (opts && opts.deck) || PBP_ANKI_MODEL;
  const key = (opts && opts.key) || "";
  const ownerCheck = (opts && opts.ownerCheck) || (async () => true);
  const port = (opts && opts.port) || "";
  const out = { stage: "", added: 0, skipped: 0, failed: 0, error: null };

  // requestPermission/version/keyRequired happen in _pbpVocabSendAnki BEFORE
  // settings/owner (spec §3 ordering) -- this pipeline starts at createDeck.
  const deckRes = await pbpAnkiCall("createDeck", { deck }, key, 10000, port); // idempotent
  if (!deckRes.ok) { out.stage = "deck"; out.error = deckRes.error; return out; }

  const models = await pbpAnkiCall("modelNames", {}, key, 10000, port);
  if (!models.ok || !Array.isArray(models.result)) { out.stage = "model"; out.error = models.error || "modelNames failed"; return out; }
  if (!models.result.includes(PBP_ANKI_MODEL)) {
    const created = await pbpAnkiCall("createModel", pbpAnkiModelDef(), key, 10000, port);
    if (!created.ok) { out.stage = "model"; out.error = created.error; return out; }
  } else {
    const fields = await pbpAnkiCall("modelFieldNames", { modelName: PBP_ANKI_MODEL }, key, 10000, port);
    if (!fields.ok || !Array.isArray(fields.result)) {
      out.stage = "modelFields";
      out.error = fields.error || "modelFieldNames failed";
      return out;
    }
    if (!pbpAnkiFieldsMatch(fields.result)) {
      // AnkiConnect silently drops values for unknown field names -- a
      // user-modified model must abort, never silently lose data.
      out.stage = "modelMismatch";
      out.error = "model fields incompatible";
      return out;
    }
  }

  if (!(await ownerCheck())) { out.stage = "owner"; out.error = "account changed"; return out; }
  const notes = rows.map((r) => pbpAnkiNoteFromRow(r, deck));
  const can = await pbpAnkiCall("canAddNotesWithErrorDetail", { notes }, key, 30000, port);
  if (!can.ok || !Array.isArray(can.result) || can.result.length !== notes.length) {
    out.stage = "precheck";
    out.error = can.error || "precheck failed";
    return out;
  }
  const addable = [];
  for (let i = 0; i < can.result.length; i++) {
    const d = can.result[i];
    if (d && d.canAdd) addable.push(notes[i]);
    else if (d && /duplicate/i.test(String(d.error || ""))) out.skipped++;
    else out.failed++;
  }
  if (!addable.length) { out.stage = "done"; return out; }

  if (!(await ownerCheck())) { out.stage = "owner"; out.error = "account changed"; return out; }
  const added = await pbpAnkiCall("addNotes", { notes: addable }, key, 60000, port);
  if (!added.ok || !Array.isArray(added.result) || added.result.length !== addable.length) {
    // addNotes is batch-rollback: on ANY error it deletes the notes it had
    // already added and returns a top-level error -- count the whole batch
    // as failed, never claim partial success. A response array shorter than
    // the request (malformed/truncated) is symmetric with the length check
    // on canAddNotesWithErrorDetail above and must fail closed the same way.
    out.stage = "add";
    out.failed += addable.length;
    out.error = added.error || "addNotes failed";
    return out;
  }
  for (const id of added.result) {
    if (id == null) out.failed++; else out.added++;
  }
  out.stage = "done";
  return out;
}
