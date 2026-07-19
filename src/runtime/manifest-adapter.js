const CURRENT_SCHEMA_VERSION = 2;

function isRecord(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function hasManifestEnvelope(value) {
  return isRecord(value) && Array.isArray(value.tree) && isRecord(value.routeMap);
}

function collectLegacyDocs(docs) {
  if (!Array.isArray(docs)) {
    return null;
  }

  const docIds = [];
  const docsById = Object.create(null);
  for (const doc of docs) {
    if (!isRecord(doc) || typeof doc.id !== "string" || !doc.id || Object.hasOwn(docsById, doc.id)) {
      return null;
    }
    docIds.push(doc.id);
    docsById[doc.id] = doc;
  }

  return { docIds, docsById };
}

function collectCurrentDocs(docIdsInput, docsByIdInput) {
  if (!Array.isArray(docIdsInput) || !isRecord(docsByIdInput)) {
    return null;
  }

  const docIds = [];
  const docsById = Object.create(null);
  for (const id of docIdsInput) {
    if (
      typeof id !== "string" ||
      !id ||
      Object.hasOwn(docsById, id) ||
      !Object.hasOwn(docsByIdInput, id)
    ) {
      return null;
    }

    const doc = docsByIdInput[id];
    if (!isRecord(doc) || doc.id !== id) {
      return null;
    }
    docIds.push(id);
    docsById[id] = doc;
  }

  if (Object.keys(docsByIdInput).length !== docIds.length) {
    return null;
  }

  return { docIds, docsById };
}

export function normalizeManifestPayload(value) {
  if (!hasManifestEnvelope(value)) {
    return null;
  }

  let normalizedDocs;
  if (value.schemaVersion === CURRENT_SCHEMA_VERSION) {
    normalizedDocs = collectCurrentDocs(value.docIds, value.docsById);
  } else if (value.schemaVersion == null || value.schemaVersion === 1) {
    normalizedDocs = collectLegacyDocs(value.docs);
  } else {
    return null;
  }

  if (!normalizedDocs) {
    return null;
  }

  const { docs: _legacyDocs, ...manifest } = value;
  return {
    ...manifest,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    ...normalizedDocs,
  };
}

export function getManifestDocs(manifest) {
  if (!manifest || !Array.isArray(manifest.docIds) || !isRecord(manifest.docsById)) {
    return [];
  }
  return manifest.docIds.map((id) => manifest.docsById[id]).filter(Boolean);
}

export function getRuntimeManifestDocs(manifest, nowMs = Date.now()) {
  const newWithinDays = Number.isFinite(manifest?.ui?.newWithinDays)
    ? Math.max(0, Number(manifest.ui.newWithinDays))
    : 0;
  const threshold = nowMs - newWithinDays * 24 * 60 * 60 * 1000;

  return getManifestDocs(manifest).map((doc) => {
    const publishedAt = typeof doc.date === "string" ? Date.parse(doc.date) : Number.NaN;
    return {
      ...doc,
      isNew: Number.isFinite(publishedAt) && publishedAt >= threshold,
    };
  });
}
