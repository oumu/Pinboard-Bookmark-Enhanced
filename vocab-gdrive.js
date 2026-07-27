const PBP_VOCAB_BATCH_SCHEMA = 1;
const PBP_VOCAB_BATCH_MAX_BYTES = 4 * 1024 * 1024;

function _pbpVocabDriveBytes(value) {
  return new TextEncoder().encode(value).length;
}

function _pbpVocabDriveValidProperty(key, value) {
  return typeof key === "string" && typeof value === "string" &&
    _pbpVocabDriveBytes(key) + _pbpVocabDriveBytes(value) <= 124;
}

function _pbpVocabDriveBody(entries, envelope) {
  return JSON.stringify({
    schema: PBP_VOCAB_BATCH_SCHEMA,
    ownerHash: envelope.ownerHash,
    deviceId: envelope.deviceId,
    createdAt: envelope.createdAt,
    entries
  });
}

function _pbpVocabDriveValidMetadata(metadata) {
  const properties = metadata && metadata.appProperties;
  return _pbpVocabOnlyKeys(metadata, ["id", "name", "parents", "mimeType", "appProperties"]) &&
    Object.keys(metadata).length === 5 &&
    typeof metadata.id === "string" && !!metadata.id &&
    metadata.name === `pbp-vocab-${metadata.id}.json` &&
    Array.isArray(metadata.parents) && metadata.parents.length === 1 &&
    typeof metadata.parents[0] === "string" && !!metadata.parents[0] &&
    metadata.mimeType === "application/json" &&
    _pbpVocabOnlyKeys(properties, ["pbpKind", "schema", "owner", "device"]) &&
    Object.keys(properties).length === 4 && properties.pbpKind === "vocab-batch" &&
    properties.schema === String(PBP_VOCAB_BATCH_SCHEMA) &&
    _pbpVocabValidOwnerHash(properties.owner) && _pbpVocabDeviceId(properties.device) &&
    Object.entries(properties).every(([key, value]) => _pbpVocabDriveValidProperty(key, value));
}

async function pbpVocabOwnerHash(owner) {
  if (typeof owner !== "string" || !owner) throw new TypeError("invalid owner");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(owner));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function pbpVocabDriveMetadata(fileId, ownerHash, deviceId) {
  const appProperties = {
    pbpKind: "vocab-batch",
    schema: String(PBP_VOCAB_BATCH_SCHEMA),
    owner: ownerHash,
    device: deviceId
  };
  if (typeof fileId !== "string" || !fileId || !_pbpVocabValidOwnerHash(ownerHash) ||
      !_pbpVocabDeviceId(deviceId) ||
      !Object.entries(appProperties).every(([key, value]) => _pbpVocabDriveValidProperty(key, value))) {
    throw new TypeError("invalid Drive batch identity");
  }
  return {
    id: fileId,
    name: `pbp-vocab-${fileId}.json`,
    parents: ["appDataFolder"],
    mimeType: "application/json",
    appProperties
  };
}

function pbpVocabValidateDriveBatch(metadata, body, expectedOwnerHash) {
  if (!_pbpVocabValidOwnerHash(expectedOwnerHash) || !_pbpVocabDriveValidMetadata(metadata) ||
      metadata.appProperties.owner !== expectedOwnerHash || typeof body !== "string" ||
      _pbpVocabDriveBytes(body) > PBP_VOCAB_BATCH_MAX_BYTES) return false;
  let parsed;
  try { parsed = JSON.parse(body); } catch (_) { return false; }
  if (!_pbpVocabValidBatchBody(parsed, expectedOwnerHash) ||
      metadata.appProperties.device !== parsed.deviceId ||
      body !== _pbpVocabDriveBody(parsed.entries, parsed)) return false;
  return true;
}

function pbpVocabSplitDriveEntries(entries, envelope) {
  if (!Array.isArray(entries) ||
      !_pbpVocabOnlyKeys(envelope, ["ownerHash", "deviceId", "createdAt"]) ||
      Object.keys(envelope).length !== 3 || !_pbpVocabValidOwnerHash(envelope.ownerHash) ||
      !_pbpVocabDeviceId(envelope.deviceId) ||
      !_pbpVocabDriveValidProperty("owner", envelope.ownerHash) ||
      !_pbpVocabDriveValidProperty("device", envelope.deviceId) ||
      !Number.isFinite(envelope.createdAt)) {
    return { ok: false, error: "invalid_envelope" };
  }
  for (const entry of entries) {
    if (!pbpVocabValidateEvent(entry)) return { ok: false, error: "invalid_entry" };
  }

  const emptyBody = _pbpVocabDriveBody([], envelope);
  const prefix = emptyBody.slice(0, -2);
  const suffix = "]}";
  const baseBytes = _pbpVocabDriveBytes(prefix) + _pbpVocabDriveBytes(suffix);
  const batches = [];
  let current = [];
  let currentBytes = baseBytes;

  for (const entry of entries) {
    const entryJson = JSON.stringify(entry);
    const entryBytes = _pbpVocabDriveBytes(entryJson);
    const singleBytes = baseBytes + entryBytes;
    if (singleBytes > PBP_VOCAB_BATCH_MAX_BYTES) {
      return { ok: false, error: "entry_too_large", recordKey: entry.recordKey, bytes: singleBytes };
    }
    const nextBytes = currentBytes + (current.length ? 1 : 0) + entryBytes;
    if (nextBytes > PBP_VOCAB_BATCH_MAX_BYTES) {
      batches.push({ body: prefix + current.join(",") + suffix, bytes: currentBytes });
      current = [entryJson];
      currentBytes = singleBytes;
    } else {
      current.push(entryJson);
      currentBytes = nextBytes;
    }
  }
  if (current.length) batches.push({ body: prefix + current.join(",") + suffix, bytes: currentBytes });
  return { ok: true, batches };
}

function pbpVocabBuildMultipart(metadata, body) {
  const expectedOwnerHash = metadata && metadata.appProperties && metadata.appProperties.owner;
  if (!pbpVocabValidateDriveBatch(metadata, body, expectedOwnerHash)) {
    throw new TypeError("invalid Drive batch");
  }
  const metadataJson = JSON.stringify(metadata);
  let boundary = "";
  for (let i = 0; i < 8; i++) {
    const candidate = `pbp-${crypto.randomUUID()}`;
    if (!metadataJson.includes(candidate) && !body.includes(candidate)) {
      boundary = candidate;
      break;
    }
  }
  if (!boundary) throw new Error("multipart boundary collision");
  return {
    contentType: `multipart/related; boundary=${boundary}`,
    body: `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadataJson}` +
      `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`
  };
}

function pbpCreateVocabDriveClient({
  fetchImpl = fetch,
  identity = chrome.identity,
  now = Date.now,
  random = Math.random,
  timeoutMs = 30000
} = {}) {
  const apiBase = "https://www.googleapis.com/drive/v3";
  const uploadBase = "https://www.googleapis.com/upload/drive/v3/files";
  const metadataFields = "id,name,appProperties,parents,mimeType";
  const requestedTimeoutMs = Math.floor(timeoutMs);
  const requestTimeoutMs = Number.isFinite(timeoutMs) && requestedTimeoutMs >= 1
    ? Math.min(2147483647, requestedTimeoutMs) : 30000;
  // Body transfers get a longer deadline than metadata calls. The signal is a
  // wall clock over the whole payload, and a batch may reach
  // PBP_VOCAB_BATCH_MAX_BYTES -- 4 MiB inside the metadata budget demands
  // >140 KB/s, which a tethered or metered link does not deliver.
  const transferTimeoutMs = Math.min(2147483647, requestTimeoutMs * 8);
  const responseSignals = new WeakMap();
  const filePrefix = (fileId) => typeof fileId === "string" ? fileId.slice(0, 8) : undefined;
  const failure = (error, retryable, status, fileId) => {
    const result = { ok: false, error, retryable };
    if (Number.isInteger(status)) result.status = status;
    const prefix = filePrefix(fileId);
    if (prefix) result.fileId = prefix;
    return result;
  };
  const tokenValue = (value) => typeof value === "string" ? value : value && value.token;

  async function requestWithToken(token, url, init = {}, fileId, deadlineMs = requestTimeoutMs) {
    let response;
    const timeoutSignal = AbortSignal.timeout(deadlineMs);
    const signal = init.signal
      ? AbortSignal.any([init.signal, timeoutSignal])
      : timeoutSignal;
    try {
      response = await fetchImpl(url, {
        ...init,
        signal,
        headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` }
      });
    } catch (_) {
      return failure("network", true, undefined, fileId);
    }
    if (response && typeof response === "object") responseSignals.set(response, signal);
    return { ok: true, response };
  }

  // A silent mint failure is transient (offline, or the Chrome profile's Google
  // session lapsed) -- not a revoked grant, which only a 401 on a fresh token
  // proves. Marking it retryable keeps the backoff alive instead of blocking
  // the account until someone presses Sync now by hand.
  const mintFailure = (interactive, fileId) => failure("auth", !interactive, undefined, fileId);

  async function request(url, init = {}, interactive = false, fileId, deadlineMs) {
    let token;
    try {
      token = tokenValue(await identity.getAuthToken({ interactive }));
    } catch (_) {
      return mintFailure(interactive, fileId);
    }
    if (typeof token !== "string" || !token) return mintFailure(interactive, fileId);

    for (let attempt = 0; attempt < 2; attempt++) {
      const sent = await requestWithToken(token, url, init, fileId, deadlineMs);
      if (!sent.ok) return sent;
      const response = sent.response;
      if (response.status !== 401) return { ok: true, response };
      if (attempt === 1) return failure("auth", false, 401, fileId);
      try {
        await identity.removeCachedAuthToken({ token });
        token = tokenValue(await identity.getAuthToken({ interactive: false }));
      } catch (_) {
        return mintFailure(false, fileId);
      }
      if (typeof token !== "string" || !token) return mintFailure(false, fileId);
    }
    return failure("auth", false, 401, fileId);
  }

  async function responseFailure(response, fileId) {
    const status = response.status;
    if (status === 429) return failure("rate_limited", true, status, fileId);
    if (status >= 500 && status <= 599) return failure("server", true, status, fileId);
    if (status === 403) {
      let reason = "";
      try {
        const payload = await response.json();
        const errors = payload && payload.error && payload.error.errors;
        if (Array.isArray(errors)) {
          reason = errors.map((entry) => entry && entry.reason).find((value) =>
            value === "rateLimitExceeded" || value === "userRateLimitExceeded" ||
            value === "insufficientPermissions" || value === "accessNotConfigured"
          ) || "";
        }
      } catch (_) {}
      if (responseSignals.get(response)?.aborted) {
        return failure("network", true, undefined, fileId);
      }
      if (reason === "rateLimitExceeded" || reason === "userRateLimitExceeded") {
        return failure("rate_limited", true, status, fileId);
      }
      if (reason === "insufficientPermissions") {
        return failure("permission", false, status, fileId);
      }
      return failure("remote", false, status, fileId);
    }
    if (status === 404) return failure("remote", false, status, fileId);
    return failure("remote", false, status, fileId);
  }

  async function json(response, fileId) {
    try {
      return { ok: true, value: await response.json() };
    } catch (_) {
      if (responseSignals.get(response)?.aborted) {
        return failure("network", true, undefined, fileId);
      }
      return failure("invalid_response", false, response.status, fileId);
    }
  }

  async function about(interactive = false, requestFn = request) {
    const url = new URL(`${apiBase}/about`);
    url.searchParams.set("fields", "user(permissionId,emailAddress,displayName)");
    const requested = await requestFn(url, { method: "GET" }, interactive);
    if (!requested.ok) return requested;
    if (!requested.response.ok) return responseFailure(requested.response);
    const parsed = await json(requested.response);
    const user = parsed.ok && parsed.value && parsed.value.user;
    if (!parsed.ok) return parsed;
    if (!user || typeof user.permissionId !== "string" || !user.permissionId) {
      return failure("invalid_response", false, requested.response.status);
    }
    return {
      ok: true,
      permissionId: user.permissionId,
      emailAddress: typeof user.emailAddress === "string" ? user.emailAddress : "",
      displayName: typeof user.displayName === "string" ? user.displayName : ""
    };
  }

  async function generateId(requestFn = request) {
    const url = new URL(`${apiBase}/files/generateIds`);
    url.searchParams.set("count", "1");
    url.searchParams.set("space", "appDataFolder");
    const requested = await requestFn(url, { method: "GET" });
    if (!requested.ok) return requested;
    if (!requested.response.ok) return responseFailure(requested.response);
    const parsed = await json(requested.response);
    if (!parsed.ok) return parsed;
    const ids = parsed.value && parsed.value.ids;
    if (!Array.isArray(ids) || ids.length !== 1 || typeof ids[0] !== "string" || !ids[0]) {
      return failure("invalid_response", false, requested.response.status);
    }
    return { ok: true, fileId: ids[0] };
  }

  async function getMetadata(fileId, requestFn = request) {
    if (typeof fileId !== "string" || !fileId) return failure("invalid_input", false);
    const url = new URL(`${apiBase}/files/${encodeURIComponent(fileId)}`);
    url.searchParams.set("fields", metadataFields);
    const requested = await requestFn(url, { method: "GET" }, false, fileId);
    if (!requested.ok) return requested;
    if (!requested.response.ok) return responseFailure(requested.response, fileId);
    const parsed = await json(requested.response, fileId);
    if (!parsed.ok || !parsed.value || typeof parsed.value !== "object" || Array.isArray(parsed.value)) {
      return parsed.ok
        ? failure("invalid_response", false, requested.response.status, fileId)
        : parsed;
    }
    return { ok: true, metadata: parsed.value };
  }

  function metadataMatches(actual, expected) {
    if (!_pbpVocabDriveValidMetadata(actual)) return false;
    return actual.id === expected.id && actual.name === expected.name &&
      actual.mimeType === expected.mimeType &&
      Object.keys(expected.appProperties).every((key) =>
        actual.appProperties[key] === expected.appProperties[key]);
  }

  async function upload(metadata, body, requestFn = request) {
    let multipart;
    try {
      multipart = pbpVocabBuildMultipart(metadata, body);
    } catch (_) {
      return failure("invalid_input", false);
    }
    const url = new URL(uploadBase);
    url.searchParams.set("uploadType", "multipart");
    const requested = await requestFn(url, {
      method: "POST",
      headers: { "Content-Type": multipart.contentType },
      body: multipart.body
    }, false, metadata.id, transferTimeoutMs);
    if (!requested.ok) return requested;
    if (requested.response.status === 200 || requested.response.status === 201) {
      return { ok: true, fileId: metadata.id };
    }
    if (requested.response.status !== 409) {
      return responseFailure(requested.response, metadata.id);
    }
    const existing = await getMetadata(metadata.id, requestFn);
    if (!existing.ok) return existing;
    if (metadataMatches(existing.metadata, metadata)) {
      return { ok: true, fileId: metadata.id, idempotent: true };
    }
    return failure("id_collision", false, 409, metadata.id);
  }

  async function download(fileId, requestFn = request) {
    if (typeof fileId !== "string" || !fileId) return failure("invalid_input", false);
    const url = new URL(`${apiBase}/files/${encodeURIComponent(fileId)}`);
    url.searchParams.set("alt", "media");
    const requested = await requestFn(url, { method: "GET" }, false, fileId, transferTimeoutMs);
    if (!requested.ok) return requested;
    const response = requested.response;
    if (!response.ok) return responseFailure(response, fileId);

    const contentLength = response.headers && response.headers.get("Content-Length");
    if (typeof contentLength === "string" && /^\d+$/.test(contentLength) &&
        Number(contentLength) > PBP_VOCAB_BATCH_MAX_BYTES) {
      try { await response.body?.cancel?.(); } catch (_) {}
      return failure("remote_batch_too_large", false, response.status, fileId);
    }
    const reader = response.body && response.body.getReader && response.body.getReader();
    if (!reader) return failure("invalid_response", false, response.status, fileId);
    const cancel = async () => { try { await reader.cancel(); } catch (_) {} };

    const decoder = new TextDecoder("utf-8", { fatal: true });
    const parts = [];
    let size = 0;
    while (true) {
      let chunk;
      try {
        chunk = await reader.read();
      } catch (_) {
        await cancel();
        return failure("network", true, undefined, fileId);
      }
      if (chunk.done) break;
      if (!(chunk.value instanceof Uint8Array)) {
        await cancel();
        return failure("invalid_response", false, response.status, fileId);
      }
      size += chunk.value.byteLength;
      if (size > PBP_VOCAB_BATCH_MAX_BYTES) {
        await cancel();
        return failure("remote_batch_too_large", false, response.status, fileId);
      }
      try {
        parts.push(decoder.decode(chunk.value, { stream: true }));
      } catch (_) {
        await cancel();
        return failure("invalid_response", false, response.status, fileId);
      }
    }
    try {
      parts.push(decoder.decode());
      return { ok: true, body: parts.join("") };
    } catch (_) {
      await cancel();
      return failure("invalid_response", false, response.status, fileId);
    }
  }

  async function listFiles(ownerHash, pageToken, requestFn = request) {
    if (!_pbpVocabValidOwnerHash(ownerHash) ||
        (pageToken !== undefined && (typeof pageToken !== "string" || !pageToken))) {
      return failure("invalid_input", false);
    }
    const url = new URL(`${apiBase}/files`);
    url.searchParams.set("spaces", "appDataFolder");
    url.searchParams.set("pageSize", "1000");
    url.searchParams.set("q",
      "'appDataFolder' in parents and trashed = false and " +
      "appProperties has { key='pbpKind' and value='vocab-batch' } and " +
      `appProperties has { key='schema' and value='${PBP_VOCAB_BATCH_SCHEMA}' } and ` +
      `appProperties has { key='owner' and value='${ownerHash}' }`);
    url.searchParams.set("fields", `nextPageToken,files(${metadataFields})`);
    if (pageToken !== undefined) url.searchParams.set("pageToken", pageToken);
    const requested = await requestFn(url, { method: "GET" });
    if (!requested.ok) return requested;
    if (!requested.response.ok) return responseFailure(requested.response);
    const parsed = await json(requested.response);
    if (!parsed.ok) return parsed;
    const value = parsed.value;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return failure("invalid_response", false, requested.response.status);
    }
    const files = value.files === undefined ? [] : value.files;
    const nextPageToken = value.nextPageToken;
    if (!Array.isArray(files) ||
        (nextPageToken !== undefined &&
          (typeof nextPageToken !== "string" || !nextPageToken))) {
      return failure("invalid_response", false, requested.response.status);
    }
    return {
      ok: true,
      files,
      nextPageToken: nextPageToken === undefined ? null : nextPageToken
    };
  }

  async function getStartPageToken(requestFn = request) {
    const url = new URL(`${apiBase}/changes/startPageToken`);
    url.searchParams.set("spaces", "appDataFolder");
    const requested = await requestFn(url, { method: "GET" });
    if (!requested.ok) return requested;
    if (!requested.response.ok) return responseFailure(requested.response);
    const parsed = await json(requested.response);
    const pageToken = parsed.ok && parsed.value && parsed.value.startPageToken;
    if (!parsed.ok) return parsed;
    if (typeof pageToken !== "string" || !pageToken) {
      return failure("invalid_response", false, requested.response.status);
    }
    return { ok: true, pageToken };
  }

  async function listChanges(pageToken, requestFn = request) {
    if (typeof pageToken !== "string" || !pageToken) return failure("invalid_input", false);
    const url = new URL(`${apiBase}/changes`);
    url.searchParams.set("pageToken", pageToken);
    url.searchParams.set("spaces", "appDataFolder");
    url.searchParams.set("includeRemoved", "true");
    url.searchParams.set("pageSize", "1000");
    url.searchParams.set("fields",
      `nextPageToken,newStartPageToken,changes(removed,fileId,file(${metadataFields}))`);
    const requested = await requestFn(url, { method: "GET" });
    if (!requested.ok) return requested;
    if (!requested.response.ok) return responseFailure(requested.response);
    const parsed = await json(requested.response);
    if (!parsed.ok) return parsed;
    const value = parsed.value;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return failure("invalid_response", false, requested.response.status);
    }
    const changes = value.changes === undefined ? [] : value.changes;
    const nextPageToken = value.nextPageToken;
    const newStartPageToken = value.newStartPageToken;
    const hasNext = nextPageToken !== undefined;
    const hasNew = newStartPageToken !== undefined;
    if (!Array.isArray(changes) || hasNext === hasNew ||
        (hasNext && (typeof nextPageToken !== "string" || !nextPageToken)) ||
        (hasNew && (typeof newStartPageToken !== "string" || !newStartPageToken))) {
      return failure("invalid_response", false, requested.response.status);
    }
    return {
      ok: true,
      changes,
      nextPageToken: hasNext ? nextPageToken : null,
      newStartPageToken: hasNew ? newStartPageToken : null
    };
  }

  async function openSession(interactive = false) {
    let token;
    try {
      token = tokenValue(await identity.getAuthToken({ interactive }));
    } catch (_) {
      return mintFailure(interactive);
    }
    if (typeof token !== "string" || !token) return mintFailure(interactive);

    let permissionId = "";
    const sessionRequest = async (url, init = {}, _interactive = false, fileId, deadlineMs) => {
      const sent = await requestWithToken(token, url, init, fileId, deadlineMs);
      if (!sent.ok || sent.response.status !== 401) return sent;

      let renewed;
      try {
        await identity.removeCachedAuthToken({ token });
        renewed = tokenValue(await identity.getAuthToken({ interactive: false }));
      } catch (_) {
        return mintFailure(false, fileId);
      }
      if (typeof renewed !== "string" || !renewed) {
        return mintFailure(false, fileId);
      }

      if (permissionId) {
        const probe = await about(false, async (probeUrl, probeInit, _probeInteractive, probeFileId) => {
          const checked = await requestWithToken(
            renewed, probeUrl, probeInit, probeFileId
          );
          if (checked.ok && checked.response.status === 401) {
            return failure("auth", false, 401, probeFileId);
          }
          return checked;
        });
        if (!probe.ok) return probe;
        if (probe.permissionId !== permissionId) {
          return failure("account_changed", false, undefined, fileId);
        }
      }

      token = renewed;
      const retried = await requestWithToken(token, url, init, fileId, deadlineMs);
      if (retried.ok && retried.response.status === 401) {
        return failure("auth", false, 401, fileId);
      }
      return retried;
    };

    const opened = await about(false, sessionRequest);
    if (!opened.ok) return opened;
    permissionId = opened.permissionId;
    return {
      ok: true,
      permissionId,
      emailAddress: opened.emailAddress,
      displayName: opened.displayName,
      about: () => about(false, sessionRequest),
      generateId: () => generateId(sessionRequest),
      upload: (metadata, body) => upload(metadata, body, sessionRequest),
      getMetadata: (fileId) => getMetadata(fileId, sessionRequest),
      download: (fileId) => download(fileId, sessionRequest),
      listFiles: (ownerHash, pageToken) => listFiles(ownerHash, pageToken, sessionRequest),
      getStartPageToken: () => getStartPageToken(sessionRequest),
      listChanges: (pageToken) => listChanges(pageToken, sessionRequest)
    };
  }

  void now;
  void random;
  return {
    connect: () => about(true),
    about: () => about(false),
    openSession,
    generateId,
    upload,
    getMetadata,
    download,
    listFiles,
    getStartPageToken,
    listChanges
  };
}

const PBP_VOCAB_DIRTY_ALARM = "vocab-sync-dirty";
const PBP_VOCAB_PERIODIC_ALARM = "vocab-sync-periodic";
const PBP_VOCAB_RETRY_ALARM = "vocab-sync-retry";

function pbpVocabRetryDelayMinutes(attempt, random = Math.random) {
  const index = Math.max(0, Number.isFinite(attempt) ? Math.floor(attempt) : 0);
  const sample = Math.max(0, Math.min(1, Number(random()) || 0));
  return Math.min(60, 2 ** index) * (0.8 + sample * 0.4);
}

function pbpVocabSchedulePeriodic(alarms = chrome.alarms) {
  alarms.create(PBP_VOCAB_PERIODIC_ALARM, { periodInMinutes: 15 });
}

async function pbpVocabScheduleDirty(alarms = chrome.alarms, now = Date.now) {
  const when = now() + 30000;
  const existing = await alarms.get(PBP_VOCAB_DIRTY_ALARM);
  if (existing && Number.isFinite(existing.scheduledTime) && existing.scheduledTime <= when) {
    return false;
  }
  alarms.create(PBP_VOCAB_DIRTY_ALARM, { when });
  return true;
}

function _pbpVocabDriveDefaultStore() {
  return {
    getMeta: pbpVocabGetSyncMeta,
    getPreflightState: pbpVocabGetPreflightState,
    putPreflightState: pbpVocabPutPreflightState,
    deletePreflightState: pbpVocabDeletePreflightState,
    getAccountState: pbpVocabGetAccountState,
    putAccountState: pbpVocabPutAccountState,
    seedLegacy: pbpVocabSeedLegacy,
    applyRemotePage: pbpVocabApplyRemotePage,
    checkpointOwner: pbpVocabCheckpointOwner,
    listPendingBatches: pbpVocabListPendingBatches,
    deletePendingBatch: pbpVocabDeletePendingBatch,
    listOutbox: pbpVocabListOutbox,
    freezeOutbox: pbpVocabFreezeOutbox
  };
}

function pbpCreateVocabDriveSyncRunner({
  client = pbpCreateVocabDriveClient(),
  store = _pbpVocabDriveDefaultStore(),
  alarms = chrome.alarms,
  getCurrentPinboardAuth,
  pinboardAuthIsCurrent,
  hashOwner = pbpVocabOwnerHash,
  now = Date.now,
  random = Math.random
} = {}) {
  const accountKey = (permissionId, ownerHash) =>
    `account:${permissionId}:${ownerHash}`;
  const preflightKey = (ownerHash) => `preflight:${ownerHash}`;
  const normalizedFailure = (source) => {
    if (source?.error === "account_changed") {
      return { ok: false, error: "account_changed", retryable: false };
    }
    // "auth" is checked before the generic retryable branch so a transient
    // token-mint failure keeps its accurate code instead of surfacing as a
    // network error, while still taking the backoff path rather than blocking.
    if (source?.error === "auth") {
      return { ok: false, error: "auth", retryable: source.retryable === true };
    }
    if (source?.retryable) return { ok: false, error: "network", retryable: true };
    if (source?.error === "entry_too_large") {
      return { ok: false, error: "entry_too_large", retryable: false };
    }
    // "local_store" is a failed IndexedDB write on this device: reconnecting
    // and re-downloading cannot help, and the remote copy is intact. Keep it
    // apart from "corrupt", which means the remote batch itself did not
    // validate. "invalid_remote_page" is the only code the store returns for a
    // rejected page -- without it, page-apply failures surfaced as "remote".
    if (source?.error === "permission" || source?.error === "corrupt" ||
        source?.error === "remote" || source?.error === "local_store") {
      return { ok: false, error: source.error, retryable: false };
    }
    if (source?.error === "invalid_response" || source?.error === "id_collision" ||
        source?.error === "remote_batch_too_large" ||
        source?.error === "invalid_remote_page") {
      return { ok: false, error: "corrupt", retryable: false };
    }
    return { ok: false, error: "remote", retryable: false };
  };

  return async function run({ interactive = false, force = false } = {}) {
    let state = null;
    let startAuth = null;
    let owner = "";
    let ownerHash = "";
    let preflight = null;
    let session = null;
    const stateWith = (patch, remove = []) => {
      const next = { ...state, ...patch };
      for (const key of remove) delete next[key];
      return next;
    };
    const stillCurrent = async () => {
      const current = await getCurrentPinboardAuth();
      return !!startAuth?.account && current?.account === startAuth.account &&
        pinboardAuthIsCurrent(startAuth) && pinboardAuthIsCurrent(current);
    };
    const finishFailure = async (source) => {
      const result = normalizedFailure(source);
      if (result.error === "account_changed") return result;
      if (!await stillCurrent()) {
        return normalizedFailure({ error: "account_changed" });
      }
      const canPersistPreflight = /^[0-9a-f]{64}$/.test(ownerHash);
      if (result.retryable) {
        const attempts = [state?.retryAttempt, preflight?.retryAttempt]
          .filter((value) => Number.isInteger(value) && value >= 0);
        const attempt = attempts.length ? Math.max(...attempts) : 0;
        const retryAt = now() + pbpVocabRetryDelayMinutes(attempt, random) * 60000;
        if (state) {
          const failed = stateWith({
            lastError: result.error,
            retryAttempt: attempt + 1,
            retryAt
          });
          if (await store.putAccountState(failed)) state = failed;
        }
        if (canPersistPreflight) {
          const failedPreflight = {
            key: preflightKey(ownerHash),
            ownerHash,
            retryAttempt: attempt + 1,
            retryAt,
            lastError: result.error,
            blocked: false
          };
          if (await store.putPreflightState(failedPreflight)) {
            preflight = failedPreflight;
            alarms.create(PBP_VOCAB_RETRY_ALARM, { when: retryAt });
          }
        }
      } else {
        if (canPersistPreflight) {
          const blockedPreflight = {
            key: preflightKey(ownerHash),
            ownerHash,
            retryAttempt: 0,
            retryAt: null,
            lastError: result.error,
            blocked: true
          };
          if (await store.putPreflightState(blockedPreflight)) {
            preflight = blockedPreflight;
          }
        }
        if (state) {
          const failed = stateWith({ lastError: result.error });
          if (await store.putAccountState(failed)) state = failed;
        }
        await Promise.all([
          alarms.clear(PBP_VOCAB_DIRTY_ALARM),
          alarms.clear(PBP_VOCAB_PERIODIC_ALARM),
          alarms.clear(PBP_VOCAB_RETRY_ALARM)
        ]);
      }
      return result;
    };
    const applyPage = async (metadata, cursorCommit) => {
      const batches = [];
      for (const meta of metadata) {
        if (!_pbpVocabDriveValidMetadata(meta) ||
            meta.appProperties.owner !== ownerHash) {
          return normalizedFailure({ error: "invalid_response" });
        }
        const downloaded = await session.download(meta.id);
        if (!downloaded.ok) return normalizedFailure(downloaded);
        if (!await stillCurrent()) return normalizedFailure({ error: "account_changed" });
        if (!pbpVocabValidateDriveBatch(meta, downloaded.body, ownerHash)) {
          return normalizedFailure({ error: "invalid_response" });
        }
        batches.push(JSON.parse(downloaded.body));
      }
      if (!await stillCurrent()) return normalizedFailure({ error: "account_changed" });
      const applied = await store.applyRemotePage(
        owner, ownerHash, batches, cursorCommit
      );
      return applied?.ok ? { ok: true } : normalizedFailure(applied);
    };
    const changesMetadata = (changes, skipSelf, deviceId) => {
      const metadata = [];
      let removed = false;
      for (const change of changes) {
        if (!change || typeof change !== "object" || Array.isArray(change)) {
          return { ok: false };
        }
        if (change.removed === true) {
          removed = true;
          continue;
        }
        const properties = change.file?.appProperties;
        if (!properties || properties.pbpKind !== "vocab-batch" ||
            properties.schema !== String(PBP_VOCAB_BATCH_SCHEMA) ||
            properties.owner !== ownerHash) {
          continue;
        }
        if (!_pbpVocabDriveValidMetadata(change.file) ||
            change.fileId !== change.file.id) return { ok: false };
        if (!skipSelf || properties.device !== deviceId) metadata.push(change.file);
      }
      return { ok: true, metadata, removed };
    };

    try {
      startAuth = await getCurrentPinboardAuth();
      if (!startAuth?.account || !pinboardAuthIsCurrent(startAuth)) {
        return { ok: false, error: "auth", retryable: false };
      }
      owner = pbpDictOwnerScope(startAuth.account);
      ownerHash = await hashOwner(owner);
      preflight = await store.getPreflightState(ownerHash);
      if (!await stillCurrent()) {
        return normalizedFailure({ error: "account_changed" });
      }
      if (force) {
        if (!await store.deletePreflightState(ownerHash)) {
          return finishFailure({ error: "local_store" });
        }
        preflight = null;
        await alarms.clear(PBP_VOCAB_RETRY_ALARM);
      } else if (preflight?.blocked === true) {
        await Promise.all([
          alarms.clear(PBP_VOCAB_DIRTY_ALARM),
          alarms.clear(PBP_VOCAB_PERIODIC_ALARM),
          alarms.clear(PBP_VOCAB_RETRY_ALARM)
        ]);
        return normalizedFailure({ error: preflight.lastError || "remote" });
      } else if (Number.isFinite(preflight?.retryAt) && preflight.retryAt > now()) {
        alarms.create(PBP_VOCAB_RETRY_ALARM, { when: preflight.retryAt });
        return {
          ok: true,
          status: { ...preflight, waitingForRetry: true }
        };
      }

      session = await client.openSession(interactive);
      if (!session.ok) return finishFailure(session);
      if (!await stillCurrent()) return normalizedFailure({ error: "account_changed" });

      state = await store.getAccountState(session.permissionId, ownerHash);
      if (!await stillCurrent()) {
        return normalizedFailure({ error: "account_changed" });
      }
      state = {
        ...(state || {}),
        key: accountKey(session.permissionId, ownerHash),
        drivePermissionId: session.permissionId,
        emailAddress: session.emailAddress || "",
        displayName: session.displayName || "",
        ownerHash,
        bootstrapComplete: state?.bootstrapComplete === true,
        pageToken: state?.pageToken || null
      };
      if (force && (state.retryAttempt || state.retryAt || state.lastError)) {
        const reset = stateWith({ retryAttempt: 0, retryAt: null, lastError: null });
        if (!await store.putAccountState(reset)) {
          return finishFailure({ error: "local_store" });
        }
        state = reset;
      }
      if (!force && Number.isFinite(state.retryAt) && state.retryAt > now()) {
        alarms.create(PBP_VOCAB_RETRY_ALARM, { when: state.retryAt });
        return { ok: true, status: { ...state, waitingForRetry: true } };
      }

      const meta = await store.getMeta();
      if (!meta?.deviceId) return finishFailure({ error: "invalid_response" });
      const deviceId = meta.deviceId;
      let needsCheckpoint = state.needsCheckpoint === true;

      if (!state.bootstrapComplete) {
        while (true) {
          const seeded = await store.seedLegacy(owner, 100);
          if (!seeded?.ok) return finishFailure({ error: "local_store" });
          if (!seeded.processed) break;
        }

        if (!state.bootstrapStartToken) {
          const token = await session.getStartPageToken();
          if (!token.ok) return finishFailure(token);
          if (!await stillCurrent()) return normalizedFailure({ error: "account_changed" });
          const next = stateWith({ bootstrapStartToken: token.pageToken });
          if (!await store.putAccountState(next)) {
            return finishFailure({ error: "local_store" });
          }
          state = next;
        }

        if (state.bootstrapListComplete !== true) {
          let pageToken = state.bootstrapFilePageToken || undefined;
          while (true) {
            const page = await session.listFiles(ownerHash, pageToken);
            if (!page.ok) return finishFailure(page);
            if (!await stillCurrent()) return normalizedFailure({ error: "account_changed" });
            const next = page.nextPageToken
              ? stateWith({ bootstrapFilePageToken: page.nextPageToken })
              : stateWith({ bootstrapListComplete: true }, ["bootstrapFilePageToken"]);
            const applied = await applyPage(page.files, next);
            if (!applied.ok) return finishFailure(applied);
            state = next;
            if (!page.nextPageToken) break;
            pageToken = page.nextPageToken;
          }
        }

        let changeToken = state.bootstrapChangePageToken || state.bootstrapStartToken;
        while (true) {
          const page = await session.listChanges(changeToken);
          if (!page.ok) return finishFailure(page);
          if (!await stillCurrent()) return normalizedFailure({ error: "account_changed" });
          const selected = changesMetadata(page.changes, false, deviceId);
          if (!selected.ok) return finishFailure({ error: "invalid_response" });
          needsCheckpoint ||= selected.removed;
          const terminal = !page.nextPageToken;
          const next = terminal
            ? stateWith({
              bootstrapComplete: true,
              pageToken: page.newStartPageToken
            }, ["bootstrapStartToken", "bootstrapListComplete", "bootstrapChangePageToken"])
            : stateWith({ bootstrapChangePageToken: page.nextPageToken });
          if (needsCheckpoint) next.needsCheckpoint = true;
          const applied = await applyPage(selected.metadata, next);
          if (!applied.ok) return finishFailure(applied);
          state = next;
          if (terminal) break;
          changeToken = page.nextPageToken;
        }
      } else {
        let changeToken = state.pageToken;
        if (!changeToken) return finishFailure({ error: "invalid_response" });
        while (true) {
          const page = await session.listChanges(changeToken);
          if (!page.ok) return finishFailure(page);
          if (!await stillCurrent()) return normalizedFailure({ error: "account_changed" });
          const selected = changesMetadata(page.changes, true, deviceId);
          if (!selected.ok) return finishFailure({ error: "invalid_response" });
          needsCheckpoint ||= selected.removed;
          const terminal = !page.nextPageToken;
          const next = stateWith({
            pageToken: terminal ? page.newStartPageToken : page.nextPageToken
          });
          if (needsCheckpoint) next.needsCheckpoint = true;
          const applied = await applyPage(selected.metadata, next);
          if (!applied.ok) return finishFailure(applied);
          state = next;
          if (terminal) break;
          changeToken = page.nextPageToken;
        }
      }

      if (needsCheckpoint) {
        await store.checkpointOwner(owner);
        const cleared = stateWith({}, ["needsCheckpoint"]);
        if (!await store.putAccountState(cleared)) {
          return finishFailure({ error: "local_store" });
        }
        state = cleared;
      }

      const uploadPending = async (pending) => {
        let parsed;
        try { parsed = JSON.parse(pending.body); } catch (_) {
          return normalizedFailure({ error: "invalid_response" });
        }
        let metadata;
        try {
          metadata = pbpVocabDriveMetadata(
            pending.driveFileId, ownerHash, parsed.deviceId
          );
        } catch (_) {
          return normalizedFailure({ error: "invalid_response" });
        }
        if (!pbpVocabValidateDriveBatch(metadata, pending.body, ownerHash)) {
          return normalizedFailure({ error: "invalid_response" });
        }
        if (!await stillCurrent()) return normalizedFailure({ error: "account_changed" });
        const uploaded = await session.upload(metadata, pending.body);
        if (!uploaded.ok) return normalizedFailure(uploaded);
        if (!await stillCurrent()) return normalizedFailure({ error: "account_changed" });
        if (!await store.deletePendingBatch(
          state.drivePermissionId, ownerHash, pending.driveFileId
        )) return normalizedFailure({ error: "local_store" });
        return { ok: true };
      };

      for (const pending of await store.listPendingBatches(
        state.drivePermissionId, ownerHash
      )) {
        const uploaded = await uploadPending(pending);
        if (!uploaded.ok) return finishFailure(uploaded);
      }

      const outbox = await store.listOutbox(owner);
      const split = pbpVocabSplitDriveEntries(
        outbox.map((row) => row.event),
        { ownerHash, deviceId, createdAt: now() }
      );
      if (!split.ok) return finishFailure(split);
      for (const batch of split.batches) {
        const generated = await session.generateId();
        if (!generated.ok) return finishFailure(generated);
        if (!await stillCurrent()) return normalizedFailure({ error: "account_changed" });
        const frozen = await store.freezeOutbox(
          owner,
          state.drivePermissionId,
          ownerHash,
          generated.fileId,
          batch
        );
        if (!frozen) return finishFailure({ error: "local_store" });
        const uploaded = await uploadPending(frozen);
        if (!uploaded.ok) return finishFailure(uploaded);
      }

      const confirmed = await session.about();
      if (!confirmed.ok) return finishFailure(confirmed);
      if (!await stillCurrent() || confirmed.permissionId !== state.drivePermissionId) {
        return normalizedFailure({ error: "account_changed" });
      }
      const success = stateWith({
        lastSuccessAt: now(),
        lastError: null,
        retryAttempt: 0,
        retryAt: null
      });
      if (!await store.putAccountState(success)) {
        return finishFailure({ error: "local_store" });
      }
      state = success;
      if (!await store.deletePreflightState(ownerHash)) {
        return finishFailure({ error: "local_store" });
      }
      preflight = null;
      await alarms.clear(PBP_VOCAB_RETRY_ALARM);
      pbpVocabSchedulePeriodic(alarms);
      return { ok: true, status: { ...state } };
    } catch (_) {
      return { ok: false, error: "remote", retryable: false };
    }
  };
}
