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
