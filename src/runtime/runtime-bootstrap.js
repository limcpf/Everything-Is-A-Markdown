import { normalizeManifestPayload } from "./manifest-adapter.js";
import {
  normalizePathBase,
  normalizeRoute,
  stripPathBase,
  toPathWithBase,
} from "./navigation-state.js";

const DEFAULT_SITE_TITLE = "File-System Blog";

export function loadInitialViewData(documentRef = globalThis.document) {
  const script = documentRef.getElementById("initial-view-data");
  const raw = script?.textContent;
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    const route = typeof parsed.route === "string" ? normalizeRoute(parsed.route) : null;
    const docId = typeof parsed.docId === "string" ? parsed.docId : null;
    const title = typeof parsed.title === "string" ? parsed.title : null;
    return route && docId && title ? { route, docId, title } : null;
  } catch {
    return null;
  }
}

export function loadInitialRuntimeData(options = {}) {
  const documentRef = options.documentRef ?? globalThis.document;
  const windowRef = options.windowRef ?? globalThis.window;
  const script = documentRef.getElementById("initial-runtime-data");
  const raw = script?.textContent;
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    const pathBase = normalizePathBase(parsed.pathBase);
    const manifestUrl = typeof parsed.manifestUrl === "string" ? parsed.manifestUrl : "";
    const treeModuleUrl = typeof parsed.treeModuleUrl === "string" ? parsed.treeModuleUrl : "";
    if (!manifestUrl || manifestUrl !== toPathWithBase("/manifest.json", pathBase)) {
      return null;
    }

    let resolvedTreeModuleUrl;
    try {
      resolvedTreeModuleUrl = new URL(treeModuleUrl, documentRef.baseURI);
    } catch {
      return null;
    }
    const treeModulePath = stripPathBase(resolvedTreeModuleUrl.pathname, pathBase);
    if (
      resolvedTreeModuleUrl.origin !== windowRef.location.origin ||
      !/^\/assets\/tree\.[a-f0-9]{12}\.js$/.test(treeModulePath)
    ) {
      return null;
    }
    return { manifestUrl, pathBase, treeModuleUrl: resolvedTreeModuleUrl.href };
  } catch {
    return null;
  }
}

export function resolveSiteTitle(manifest) {
  const value = typeof manifest?.siteTitle === "string" ? manifest.siteTitle.trim() : "";
  return value || DEFAULT_SITE_TITLE;
}

export async function loadRuntimeBootstrap(options = {}) {
  const documentRef = options.documentRef ?? globalThis.document;
  const windowRef = options.windowRef ?? globalThis.window;
  const fetchManifest = options.fetchManifest ?? ((url) => globalThis.fetch(url));
  const initialViewData = loadInitialViewData(documentRef);
  const initialRuntimeData = loadInitialRuntimeData({ documentRef, windowRef });
  const initialPathBase = normalizePathBase(initialRuntimeData?.pathBase);
  const manifestUrl =
    initialRuntimeData?.manifestUrl ?? toPathWithBase("/manifest.json", initialPathBase);
  const response = await fetchManifest(manifestUrl);
  if (!response.ok) {
    throw new Error(`Failed to load manifest: ${response.status}`);
  }
  const manifest = normalizeManifestPayload(await response.json());
  if (!manifest) {
    throw new Error("Failed to load a supported manifest schema");
  }

  return {
    initialViewData,
    manifest,
    pathBase: normalizePathBase(manifest.pathBase),
    siteTitle: resolveSiteTitle(manifest),
    treeModuleUrl: initialRuntimeData?.treeModuleUrl ?? "",
  };
}
