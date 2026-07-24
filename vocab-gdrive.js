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
    metadata.parents[0] === "appDataFolder" && metadata.mimeType === "application/json" &&
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
  random = Math.random
} = {}) {
  const apiBase = "https://www.googleapis.com/drive/v3";
  const uploadBase = "https://www.googleapis.com/upload/drive/v3/files";
  const metadataFields = "id,name,appProperties,parents,mimeType";
  const filePrefix = (fileId) => typeof fileId === "string" ? fileId.slice(0, 8) : undefined;
  const failure = (error, retryable, status, fileId) => {
    const result = { ok: false, error, retryable };
    if (Number.isInteger(status)) result.status = status;
    const prefix = filePrefix(fileId);
    if (prefix) result.fileId = prefix;
    return result;
  };
  const tokenValue = (value) => typeof value === "string" ? value : value && value.token;

  async function request(url, init = {}, interactive = false, fileId) {
    let token;
    try {
      token = tokenValue(await identity.getAuthToken({ interactive }));
    } catch (_) {
      return failure("auth", false, undefined, fileId);
    }
    if (typeof token !== "string" || !token) return failure("auth", false, undefined, fileId);

    for (let attempt = 0; attempt < 2; attempt++) {
      let response;
      try {
        response = await fetchImpl(url, {
          ...init,
          headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` }
        });
      } catch (_) {
        return failure("network", true, undefined, fileId);
      }
      if (response.status !== 401) return { ok: true, response };
      if (attempt === 1) return failure("auth", false, 401, fileId);
      try {
        await identity.removeCachedAuthToken({ token });
        token = tokenValue(await identity.getAuthToken({ interactive: false }));
      } catch (_) {
        return failure("auth", false, undefined, fileId);
      }
      if (typeof token !== "string" || !token) return failure("auth", false, undefined, fileId);
    }
    return failure("auth", false, 401, fileId);
  }

  function responseFailure(response, fileId) {
    const status = response.status;
    if (status === 429) return failure("rate_limited", true, status, fileId);
    if (status >= 500 && status <= 599) return failure("server", true, status, fileId);
    if (status === 403 || status === 404) return failure("remote", false, status, fileId);
    return failure("remote", false, status, fileId);
  }

  async function json(response, fileId) {
    try {
      return { ok: true, value: await response.json() };
    } catch (_) {
      return failure("invalid_response", false, response.status, fileId);
    }
  }

  async function about(interactive) {
    const url = new URL(`${apiBase}/about`);
    url.searchParams.set("fields", "user(permissionId,emailAddress,displayName)");
    const requested = await request(url, { method: "GET" }, interactive);
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

  async function generateId() {
    const url = new URL(`${apiBase}/files/generateIds`);
    url.searchParams.set("count", "1");
    url.searchParams.set("space", "appDataFolder");
    const requested = await request(url, { method: "GET" });
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

  async function getMetadata(fileId) {
    if (typeof fileId !== "string" || !fileId) return failure("invalid_input", false);
    const url = new URL(`${apiBase}/files/${encodeURIComponent(fileId)}`);
    url.searchParams.set("fields", metadataFields);
    const requested = await request(url, { method: "GET" }, false, fileId);
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
      actual.parents.length === expected.parents.length &&
      actual.parents.every((parent, index) => parent === expected.parents[index]) &&
      Object.keys(expected.appProperties).every((key) =>
        actual.appProperties[key] === expected.appProperties[key]);
  }

  async function upload(metadata, body) {
    let multipart;
    try {
      multipart = pbpVocabBuildMultipart(metadata, body);
    } catch (_) {
      return failure("invalid_input", false);
    }
    const url = new URL(uploadBase);
    url.searchParams.set("uploadType", "multipart");
    const requested = await request(url, {
      method: "POST",
      headers: { "Content-Type": multipart.contentType },
      body: multipart.body
    }, false, metadata.id);
    if (!requested.ok) return requested;
    if (requested.response.status === 200 || requested.response.status === 201) {
      return { ok: true, fileId: metadata.id };
    }
    if (requested.response.status !== 409) {
      return responseFailure(requested.response, metadata.id);
    }
    const existing = await getMetadata(metadata.id);
    if (existing.ok && metadataMatches(existing.metadata, metadata)) {
      return { ok: true, fileId: metadata.id, idempotent: true };
    }
    return failure("id_collision", false, 409, metadata.id);
  }

  async function download(fileId) {
    if (typeof fileId !== "string" || !fileId) return failure("invalid_input", false);
    const url = new URL(`${apiBase}/files/${encodeURIComponent(fileId)}`);
    url.searchParams.set("alt", "media");
    const requested = await request(url, { method: "GET" }, false, fileId);
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

    const decoder = new TextDecoder();
    const parts = [];
    let size = 0;
    try {
      while (true) {
        const chunk = await reader.read();
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
        parts.push(decoder.decode(chunk.value, { stream: true }));
      }
      parts.push(decoder.decode());
      return { ok: true, body: parts.join("") };
    } catch (_) {
      await cancel();
      return failure("network", true, undefined, fileId);
    }
  }

  async function listFiles(ownerHash, pageToken) {
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
    const requested = await request(url, { method: "GET" });
    if (!requested.ok) return requested;
    if (!requested.response.ok) return responseFailure(requested.response);
    const parsed = await json(requested.response);
    if (!parsed.ok || !parsed.value || !Array.isArray(parsed.value.files || [])) {
      return parsed.ok ? failure("invalid_response", false, requested.response.status) : parsed;
    }
    return {
      ok: true,
      files: parsed.value.files || [],
      nextPageToken: typeof parsed.value.nextPageToken === "string"
        ? parsed.value.nextPageToken
        : null
    };
  }

  async function getStartPageToken() {
    const url = new URL(`${apiBase}/changes/startPageToken`);
    url.searchParams.set("spaces", "appDataFolder");
    const requested = await request(url, { method: "GET" });
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

  async function listChanges(pageToken) {
    if (typeof pageToken !== "string" || !pageToken) return failure("invalid_input", false);
    const url = new URL(`${apiBase}/changes`);
    url.searchParams.set("pageToken", pageToken);
    url.searchParams.set("spaces", "appDataFolder");
    url.searchParams.set("includeRemoved", "true");
    url.searchParams.set("pageSize", "1000");
    url.searchParams.set("fields",
      `nextPageToken,newStartPageToken,changes(removed,fileId,file(${metadataFields}))`);
    const requested = await request(url, { method: "GET" });
    if (!requested.ok) return requested;
    if (!requested.response.ok) return responseFailure(requested.response);
    const parsed = await json(requested.response);
    if (!parsed.ok || !parsed.value || !Array.isArray(parsed.value.changes || [])) {
      return parsed.ok ? failure("invalid_response", false, requested.response.status) : parsed;
    }
    return {
      ok: true,
      changes: parsed.value.changes || [],
      nextPageToken: typeof parsed.value.nextPageToken === "string"
        ? parsed.value.nextPageToken
        : null,
      newStartPageToken: typeof parsed.value.newStartPageToken === "string"
        ? parsed.value.newStartPageToken
        : null
    };
  }

  void now;
  void random;
  return {
    connect: () => about(true),
    about: () => about(false),
    generateId,
    upload,
    getMetadata,
    download,
    listFiles,
    getStartPageToken,
    listChanges
  };
}
