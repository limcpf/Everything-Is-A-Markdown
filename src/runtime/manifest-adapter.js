const CURRENT_SCHEMA_VERSION = 2;

/** @typedef {import("./contracts").RuntimeManifest} RuntimeManifest */
/** @typedef {import("./contracts").RuntimeManifestDoc} RuntimeManifestDoc */
/** @typedef {{ docIds: string[]; docsById: Record<string, Record<string, unknown> & { id: string }> }} NormalizedDocIndex */

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown> & { tree: unknown[]; routeMap: Record<string, unknown> }}
 */
function hasManifestEnvelope(value) {
  return isRecord(value) && Array.isArray(value.tree) && isRecord(value.routeMap);
}

/**
 * @param {unknown} docs
 * @returns {NormalizedDocIndex | null}
 */
function collectLegacyDocs(docs) {
  if (!Array.isArray(docs)) {
    return null;
  }

  /** @type {string[]} */
  const docIds = [];
  /** @type {Record<string, Record<string, unknown> & { id: string }>} */
  const docsById = Object.create(null);
  for (const doc of docs) {
    if (
      !isRecord(doc) ||
      typeof doc.id !== "string" ||
      !doc.id ||
      Object.hasOwn(docsById, doc.id)
    ) {
      return null;
    }
    docIds.push(doc.id);
    docsById[doc.id] = /** @type {Record<string, unknown> & { id: string }} */ (doc);
  }

  return { docIds, docsById };
}

/**
 * @param {unknown} docIdsInput
 * @param {unknown} docsByIdInput
 * @returns {NormalizedDocIndex | null}
 */
function collectCurrentDocs(docIdsInput, docsByIdInput) {
  if (!Array.isArray(docIdsInput) || !isRecord(docsByIdInput)) {
    return null;
  }

  /** @type {string[]} */
  const docIds = [];
  /** @type {Record<string, Record<string, unknown> & { id: string }>} */
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
    docsById[id] = /** @type {Record<string, unknown> & { id: string }} */ (doc);
  }

  if (Object.keys(docsByIdInput).length !== docIds.length) {
    return null;
  }

  return { docIds, docsById };
}

/**
 * @param {unknown} value
 * @returns {RuntimeManifest | null}
 */
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
  return /** @type {RuntimeManifest} */ (
    /** @type {unknown} */ ({
      ...manifest,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      ...normalizedDocs,
    })
  );
}

/**
 * @param {RuntimeManifest | null | undefined} manifest
 * @returns {import("../types").ManifestDoc[]}
 */
export function getManifestDocs(manifest) {
  if (!manifest || !Array.isArray(manifest.docIds) || !isRecord(manifest.docsById)) {
    return [];
  }
  return manifest.docIds.map((id) => manifest.docsById[id]).filter(Boolean);
}

/**
 * @param {RuntimeManifest | null | undefined} manifest
 * @param {number} [nowMs]
 * @returns {RuntimeManifestDoc[]}
 */
export function getRuntimeManifestDocs(manifest, nowMs = Date.now()) {
  const configuredNewWithinDays = manifest?.ui?.newWithinDays;
  const newWithinDays = Number.isFinite(configuredNewWithinDays)
    ? Math.max(0, Number(configuredNewWithinDays))
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
