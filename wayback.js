// ============================================================
// Pinboard Bookmark Enhanced - Wayback Machine Integration
// ============================================================

// Constants
const WAYBACK_DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000;
const WAYBACK_LOG_CAP = 50;
const WAYBACK_ANON_TIMEOUT_MS = 30000;
const WAYBACK_AUTH_TIMEOUT_MS = 10000;

// ---- Pure functions (no chrome.*, no document) ----

// Dedup key for one attempt. The 24h window is per Pinboard account: the same
// URL saved from a second account must still reach the archive, and the log
// rows keyed alongside it must not outlive an account switch. A Pinboard
// username cannot contain a newline, so the separator stays unambiguous.
function pbpWaybackAttemptKey(account, url) {
  return (account || "") + "\n" + (url || "");
}

function pbpWaybackShouldAttempt(attemptsMap, key, now) {
  if (!attemptsMap || !key) return true;
  const lastAttempt = attemptsMap[key];
  if (!lastAttempt) return true;
  return (now - lastAttempt) >= WAYBACK_DEDUP_WINDOW_MS;
}

function pbpWaybackPruneAttempts(attemptsMap, now) {
  if (!attemptsMap) return {};
  const pruned = {};
  for (const [key, ts] of Object.entries(attemptsMap)) {
    if ((now - ts) < WAYBACK_DEDUP_WINDOW_MS) {
      pruned[key] = ts;
    }
  }
  return pruned;
}

// Whether an attempt outcome should KEEP the 24h dedup timestamp. ok (requested
// / job:*) and rate-limited keep it (don't re-hammer); transient timeout/error
// roll back so auto re-archive isn't suppressed for 24h after a failed attempt.
function pbpWaybackOutcomeRetainsDedup(outcome) {
  if (typeof outcome !== "string") return false;
  return outcome === "requested" || outcome.startsWith("job:") || outcome === "rate-limited";
}

function pbpWaybackAppendLog(logArr, entry, cap) {
  const actualCap = cap !== undefined ? cap : WAYBACK_LOG_CAP;
  if (!logArr) logArr = [];
  const newLog = [...logArr, entry];
  if (newLog.length > actualCap) {
    return newLog.slice(newLog.length - actualCap);
  }
  return newLog;
}

function pbpWaybackBuildRequest(url, s3Key, s3Secret) {
  const hasKey = s3Key && typeof s3Key === "string" && s3Key.trim().length > 0;
  const hasSecret = s3Secret && typeof s3Secret === "string" && s3Secret.trim().length > 0;

  if (!hasKey || !hasSecret) {
    // Anonymous request: use encodeURI (preserves :// structure)
    return {
      url: "https://web.archive.org/save/" + encodeURI(url),
      method: "GET",
      headers: {},
      body: null,
      timeoutMs: WAYBACK_ANON_TIMEOUT_MS
    };
  }

  // Authenticated request: POST with urlencoded body (encodeURIComponent for body fields)
  return {
    url: "https://web.archive.org/save",
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Authorization": "LOW " + s3Key + ":" + s3Secret,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    // js_behavior_timeout=0 + skip_first_archive=1 = faster capture; if_not_archived_within=1d = server-side dedup.
    body: "url=" + encodeURIComponent(url) + "&skip_first_archive=1&js_behavior_timeout=0&if_not_archived_within=1d",
    timeoutMs: WAYBACK_AUTH_TIMEOUT_MS
  };
}

// ---- Internal logging helper (chrome.* inside function body) ----

// Remove a single account+url dedup timestamp (re-read so we don't clobber a
// concurrent prune/write). Best-effort — swallow storage errors.
async function _pbpWaybackRollbackAttempt(key) {
  try {
    const stored = await chrome.storage.local.get({ _waybackAttempts: {} });
    const attempts = stored._waybackAttempts || {};
    if (key in attempts) {
      delete attempts[key];
      await chrome.storage.local.set({ _waybackAttempts: attempts });
    }
  } catch (e) {
    console.debug("[wayback] rollback failed:", e?.message || e);
  }
}

// Best-effort, non-atomic read-modify-write: concurrent callers may drop one entry. Acceptable for an advisory log.
// `account` is the non-secret Pinboard owner the save ran under ("" when logged
// out). Rows carry it because the log lists bookmark URLs, private ones
// included; readers must filter to the account currently signed in.
async function _pbpWaybackLog(url, outcome, account) {
  try {
    const stored = await chrome.storage.local.get({ _waybackLog: [] });
    let log = stored._waybackLog || [];
    if (!Array.isArray(log)) log = [];
    const entry = { url, ts: Date.now(), outcome, account: account || "" };
    log = pbpWaybackAppendLog(log, entry, WAYBACK_LOG_CAP);
    await chrome.storage.local.set({ _waybackLog: log });
  } catch (e) {
    console.debug("[wayback] log write failed:", e?.message || e);
  }
}

// ---- Pure decision helpers (no chrome.*, no DOM — unit-tested in wayback-tests.html) ----

// Effective private status for save paths that have no explicit checkbox
// (quick-save / read-later / batch / offline). The popup uses #private-check instead.
function pbpEffectivePrivate(settings, ctx) {
  const s = settings || {};
  const incognito = !!(ctx && ctx.incognito);
  return !!(s.optPrivateDefault || (s.optPrivateIncognito && incognito));
}

// Single archive decision. `override` is the explicit popup per-save checkbox state:
// true = ticked, false = unticked, undefined = no explicit choice / non-popup path.
function pbpWaybackShouldArchive({ enabled, skipPrivate, isPrivate, force, override }) {
  if (override === true) return true;    // explicit per-save tick: bypass enabled + skipPrivate
  if (override === false) return false;  // explicit per-save untick
  if (force) return true;                // manual archive-log retry: explicit, skip-private-exempt
  return !!enabled && !(skipPrivate && isPrivate);
}

// ---- Orchestrator (chrome.* usage allowed inside function body) ----

async function pbpWaybackArchive(url, settings, opts) {
  // Both persistent traces of an archive attempt are account-scoped, so keep
  // the owner in scope for the catch below as well. Derived from the same
  // settings blob the save used; a logged-out save records "".
  let account = "";
  let attemptKey = pbpWaybackAttemptKey(account, url);
  try {
    // Step 1: Centralized archive decision (enabled + skip-private + per-save override)
    if (!settings) return;
    account = pbpPinboardAccountFromToken(settings.pinboardToken);
    attemptKey = pbpWaybackAttemptKey(account, url);
    const enabled = settings.waybackArchiveEnabled === true;
    const skipPrivate = settings.waybackSkipPrivate !== false; // default ON
    const isPrivate = !!(opts && opts.isPrivate);
    const force = !!(opts && opts.force);
    const override = opts ? opts.override : undefined;
    if (!pbpWaybackShouldArchive({ enabled, skipPrivate, isPrivate, force, override })) {
      // Log the privacy skip only when archiving would otherwise have happened
      // (enabled + auto path). Plain disabled / explicit untick stay silent —
      // preserving the prior "disabled = no log" behavior.
      if (override === undefined && !force && enabled && skipPrivate && isPrivate) {
        await _pbpWaybackLog(url, "skippedPrivate", account);
      }
      return;
    }

    // Step 2: Check permission
    try {
      const hasPermission = await chrome.permissions.contains({ origins: ["https://web.archive.org/*"] });
      if (!hasPermission) {
        await _pbpWaybackLog(url, "permDenied", account);
        return;
      }
    } catch (_) {
      await _pbpWaybackLog(url, "permDenied", account);
      return;
    }

    // Step 3: Read dedup map and check if we should attempt
    const stored = await chrome.storage.local.get({ _waybackAttempts: {} });
    const attempts = stored._waybackAttempts || {};
    const now = Date.now();
    if (!force && !pbpWaybackShouldAttempt(attempts, attemptKey, now)) {
      await _pbpWaybackLog(url, "skipped", account);
      return;
    }

    // Step 4: Prune old attempts and record this one
    // Best-effort dedup: the read-modify-write below is not atomic; a rare concurrent save may double-fire. Acceptable — the server also dedups (30min default / if_not_archived_within).
    const pruned = pbpWaybackPruneAttempts(attempts, now);
    pruned[attemptKey] = now;
    await chrome.storage.local.set({ _waybackAttempts: pruned });

    // Step 5: Build and send request
    const req = pbpWaybackBuildRequest(url, settings.waybackS3Key || "", settings.waybackS3Secret || "");
    const response = await fetch(req.url, {
      method: req.method,
      headers: req.headers,
      body: req.body,
      credentials: "omit",
      signal: AbortSignal.timeout(req.timeoutMs)
    });

    // Step 6: Classify outcome
    let outcome;
    if (response.ok) {
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        try {
          const json = await response.json();
          if (json.job_id) {
            outcome = "job:" + json.job_id;
          } else {
            outcome = "requested";
          }
        } catch (_) {
          outcome = "requested";
        }
      } else {
        outcome = "requested";
      }
    } else if (response.status === 429) {
      outcome = "rate-limited";
    } else {
      outcome = "error:" + response.status;
    }

    // Step 7: On a transient (non-retaining) outcome, roll back the pre-fetch
    // dedup write so auto re-archive isn't suppressed 24h after a failed attempt.
    if (!pbpWaybackOutcomeRetainsDedup(outcome)) {
      await _pbpWaybackRollbackAttempt(attemptKey);
    }

    // Step 8: Log the result
    await _pbpWaybackLog(url, outcome, account);
  } catch (e) {
    // Catch AbortError and other exceptions — never throw. These are always
    // transient, so roll back the dedup timestamp written in Step 4.
    await _pbpWaybackRollbackAttempt(attemptKey);
    if (e && (e.name === "AbortError" || e.name === "TimeoutError")) {
      await _pbpWaybackLog(url, "timeout", account);
    } else {
      const msg = e?.message || String(e) || "unknown";
      await _pbpWaybackLog(url, "error:" + msg, account);
    }
  }
}
