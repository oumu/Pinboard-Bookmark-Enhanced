// ============================================================
// Pinboard Bookmark Enhanced — Export send runtime (md-preview only)
// Executes a send for a registry target: clipboard + window.open for
// url-scheme rows, with a Download-.md fallback when an inline-content URI
// exceeds the length budget. Degrades, never throws to the caller.
// (P2 adds the token-api branch here.)
// ============================================================

const _PBP_LAST_TARGET_KEY = "lastExportTarget";

async function pbpGetLastTarget() {
  try {
    const o = await chrome.storage.local.get(_PBP_LAST_TARGET_KEY);
    return (o && o[_PBP_LAST_TARGET_KEY]) || null;
  } catch (_) { return null; }
}

async function pbpSetLastTarget(id) {
  try { await chrome.storage.local.set({ [_PBP_LAST_TARGET_KEY]: id }); } catch (_) {}
}

// Call only from a direct user gesture. Requesting an already-active exact
// origin is prompt-free; avoiding a preliminary contains() keeps the request
// adjacent to the click that authorized it.
async function pbpRequestTargetPermission(id, cfg) {
  const row = PBP_EXPORT_TARGETS[id];
  if (!row || !row.buildRequest) return true;
  const missing = (row.settings || []).find((s) => s.required && !String((cfg || {})[s.key] || "").trim());
  if (missing) return true;
  const origin = (typeof row.origin === "function") ? row.origin(cfg || {}) : row.origin;
  if (!origin) return false;
  try { return (await chrome.permissions.request({ origins: [origin] })) === true; } catch (_) { return false; }
}

// Send one clip to a target. Returns { ok, fellBack, error }. Never throws.
async function pbpSendToTarget(id, ctx) {
  ctx = ctx || {};
  const row = PBP_EXPORT_TARGETS[id];
  if (!row) return { ok: false, fellBack: false, error: "unknown target" };
  const meta = ctx.meta || {};
  const rawBody = ctx.rawBody || "";
  const cfg = ctx.cfg || {};

  // Required-config guard (e.g. Capacities spaceId): block with a clear error
  // rather than firing a broken URI.
  const missing = (row.settings || []).find((s) => s.required && !String(cfg[s.key] || "").trim());
  if (missing) return { ok: false, fellBack: false, error: "missing:" + missing.key };

  try {
    // Token-API path: permission -> precheck -> optional preRequest -> request,
    // with a clipboard-safe failure fallback. GitHub Gist ships on this branch
    // today; it is also the generic template for further token-api targets.
    // A row's token may be REQUIRED (github) or OPTIONAL (webhook) — the
    // required-config guard above gates entry, so keying off buildRequest alone
    // is correct.
    if (row.buildRequest) {
      const token = (cfg.token && typeof deobfuscateKey === "function") ? deobfuscateKey(cfg.token) : (cfg.token || "");
      // Helper: on ANY failure, copy the full body to the clipboard so the
      // article is never lost (degrade-never-lose). Defined before the
      // permission gate so a denial also lands the clip on the clipboard.
      // Clipboard writes are best-effort (focus loss, missing permission) --
      // every mdSendApi* string claims "Full text copied to clipboard", so
      // when the write actually failed we must NOT hand back a reason code
      // that renders that false claim. Fall back to error:"" instead, which
      // doSend's switch (md-preview.js) already routes to the generic
      // "Send failed" text -- the same degrade the sibling viaClipboard path
      // uses a few lines below when its own clipboard write fails. The
      // api-insecure message makes no clipboard claim, so it stays actionable.
      const apiFail = async (errCode) => {
        let copied = true;
        try { await navigator.clipboard.writeText(pbpBuildFileBody(id, meta, rawBody)); } catch (_) { copied = false; }
        return { ok: false, fellBack: false, error: (copied || errCode === "api-insecure") ? errCode : "" };
      };
      // Execution is contains-only. The direct click path may request first,
      // but this second gate also protects background/retry callers and later
      // permission revocation.
      const origin = (typeof row.origin === "function") ? row.origin(cfg) : row.origin;
      if (!origin) return apiFail("api-insecure");
      try {
        const has = await chrome.permissions.contains({ origins: [origin] });
        if (!has) return apiFail("api-perm");
      } catch (_) { return apiFail("api-perm"); }
      // Liveness/token precheck.
      if (row.precheckRequest) {
        try {
          const pr = row.precheckRequest(cfg, token);
          const presp = await fetch(pr.url, { method: pr.method, headers: pr.headers, body: pr.body, redirect: "error", signal: AbortSignal.timeout(20000) });
          if (presp.status === 401) return apiFail("api-token");
          if (!presp.ok) return apiFail("api-down");
        } catch (_) { return apiFail("api-down"); }
      }
      // Best-effort pre-request (e.g. create the target container/page).
      // Failures are swallowed — the main request below is the source of truth.
      if (row.preRequest) {
        try {
          const prq = row.preRequest(meta, cfg, token);
          await fetch(prq.url, { method: prq.method, headers: prq.headers, body: prq.body, redirect: "error" });
        } catch (_) {}
      }
      // Send. buildRequest gets the body with the row's frontmatter policy
      // applied (inline keeps YAML, strip drops it) — same shaping as the
      // clipboard/fallback paths, so each target controls its own body.
      try {
        const req = row.buildRequest(meta, pbpBuildFileBody(id, meta, rawBody), cfg, token);
        // A hung endpoint (esp. webhook: user-supplied URL, no precheck) used to
        // block indefinitely — _sending's re-entrancy guard then silently ate every
        // click on the split button until the browser's own network-stack timeout
        // (minutes) fired, with no way to cancel (audit #30). 20s -> apiFail("api-down").
        const resp = await fetch(req.url, { method: req.method, headers: req.headers, body: req.body, redirect: "error", signal: AbortSignal.timeout(20000) });
        if (resp.status === 401) return apiFail("api-token");
        // GitHub-only: a fine-grained PAT passes the /user precheck (401 never
        // fires) but POST /gists rejects it with 403/404 -- fine-grained
        // tokens can't create gists (registry comment, export-targets.js).
        // Reuse the "api-token" code so the user gets the same "re-copy a
        // classic PAT" guidance instead of a dead-end "request failed".
        if (id === "github" && (resp.status === 403 || resp.status === 404)) return apiFail("api-token");
        // Notion-only: 404 object_not_found (and 403 restricted_resource) on
        // POST /pages almost always means the parent page was never shared
        // with the integration -- the single most common Notion setup
        // mistake. Surface dedicated guidance instead of a dead-end
        // "request failed".
        if (id === "notion" && (resp.status === 404 || resp.status === 403)) return apiFail("api-notion-share");
        if (!resp.ok) return apiFail("api-failed");
        const json = await resp.json().catch(() => null);
        // Success: row-defined (webhook = any 2xx, since it returns no id) else
        // the id/uuid heuristic (gist returns id). url = the created resource's
        // web link when the API returns one (gist: html_url).
        const ok = row.parseSuccess ? row.parseSuccess(resp, json) : !!(json && (json.uuid || json.id));
        if (ok) {
          return { ok: true, fellBack: false, error: null, url: (json && (json.html_url || json.url)) || null };
        }
        return apiFail("api-failed");
      } catch (_) { return apiFail("api-down"); }
    }

    if (row.mechanism === "url-scheme") {
      if (row.viaClipboard) {
        // Body rides the clipboard; the URI references it (never too long).
        const fileBody = pbpBuildFileBody(id, meta, rawBody);
        let copied = true;
        try { await navigator.clipboard.writeText(fileBody); } catch (_) { copied = false; }
        // If the clipboard write failed, opening the app would create an EMPTY
        // note while claiming success — report failure instead (no data loss).
        if (!copied) return { ok: false, fellBack: false, error: "" };
        const uri = row.buildUri(meta, rawBody, cfg);
        const win = window.open(uri, "_blank");
        // window.open returns null when the popup was blocked or the user
        // cancelled the browser's "open <app>?" external-protocol prompt
        // (Obsidian Clipper #828-style false success). copied is already
        // true here (early-return above), so "full text on clipboard" stays
        // a true claim even when the app never opened.
        if (!win) return { ok: false, fellBack: false, error: "open-blocked" };
        return { ok: true, fellBack: false, error: null };
      }
      // Inline-content scheme: build the URI, fall back if it's too long.
      const uri = row.buildUri(meta, rawBody, cfg);
      if (pbpUriTooLong(uri)) {
        // A+ : article too long for the URL channel (Windows external-protocol wall).
        // Copy the full body to the clipboard and open the app with EMPTY content
        // (a short, valid URI) so the user lands paste-ready and finishes with one Ctrl+V.
        const fileBody = pbpBuildFileBody(id, meta, rawBody);
        let copied = true;
        try { await navigator.clipboard.writeText(fileBody); } catch (_) { copied = false; }
        // If the clipboard write failed, opening the app would land the user in an
        // EMPTY note with nothing to paste while claiming "full text copied" --
        // report failure instead (no data loss, matches the viaClipboard path above).
        if (!copied) return { ok: false, fellBack: false, error: "" };
        const openUri = row.buildUri(meta, "", cfg); // empty content -> short URI -> opens app
        const win = window.open(openUri, "_blank");
        // win is null only when the popup was blocked or the user cancelled the
        // browser's "open <app>?" external-protocol prompt. copied is already true
        // here (early-return above), so "full text copied to clipboard" stays a
        // true claim even when the app never opened.
        if (!win) return { ok: false, fellBack: false, error: "open-blocked" };
        return { ok: true, fellBack: true, error: null };
      }
      // No live consumer takes this sub-path today (every url-scheme row in
      // export-targets.js sets viaClipboard:true, so this bare-URI branch is
      // unreachable) -- and unlike the two branches above, it never writes to
      // the clipboard at all. Reusing "open-blocked" here would assert a false
      // "full text copied to clipboard" claim, so a blocked open here degrades
      // through the generic error path instead of inventing a claim this
      // branch can't back up.
      window.open(uri, "_blank");
      return { ok: true, fellBack: false, error: null };
    }
    return { ok: false, fellBack: false, error: "unsupported mechanism" };
  } catch (e) {
    return { ok: false, fellBack: false, error: (e && e.message) || "send failed" };
  }
}
