import { getRuntimeManifestDocs } from "./manifest-adapter.js";
import { buildTreesAdapterInput } from "./tree-adapter.js";

const DEFAULT_BRANCH = "dev";

function toSafeUrlPath(input) {
  return String(input)
    .split("/")
    .map((segment, index) => {
      if (index === 0 && segment === "") {
        return "";
      }
      return encodeURIComponent(segment);
    })
    .join("/");
}

export function normalizePathname(pathname) {
  let normalized = "/";
  try {
    normalized = decodeURIComponent(pathname || "/");
  } catch {
    normalized = String(pathname || "/");
  }
  if (!normalized.startsWith("/")) {
    normalized = `/${normalized}`;
  }
  return normalized.replace(/\/+/g, "/") || "/";
}

export function normalizeRoute(pathname) {
  const normalized = normalizePathname(pathname);
  return normalized.endsWith("/") ? normalized : `${normalized}/`;
}

export function normalizePathBase(pathBase) {
  if (typeof pathBase !== "string") {
    return "";
  }

  const cleaned = pathBase.trim().replace(/\\/g, "/");
  if (!cleaned || cleaned === "/") {
    return "";
  }

  return `/${cleaned.replace(/^\/+/, "").replace(/\/+$/, "")}`;
}

export function stripPathBase(pathname, pathBase) {
  const normalizedPath = normalizePathname(pathname);
  if (!pathBase) {
    return normalizedPath;
  }
  if (normalizedPath === pathBase) {
    return "/";
  }
  if (normalizedPath.startsWith(`${pathBase}/`)) {
    return normalizedPath.slice(pathBase.length) || "/";
  }
  return normalizedPath;
}

export function toPathWithBase(pathname, pathBase) {
  const normalizedPath = normalizePathname(pathname);
  if (!pathBase) {
    return toSafeUrlPath(normalizedPath);
  }
  if (normalizedPath === "/") {
    return toSafeUrlPath(`${pathBase}/`);
  }
  return toSafeUrlPath(`${pathBase}${normalizedPath}`);
}

export function resolveRouteFromLocation(pathBase, pathname = globalThis.location?.pathname ?? "/") {
  return normalizeRoute(stripPathBase(pathname, pathBase));
}

export function normalizeBranch(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function isDocVisibleInBranch(doc, branch, defaultBranch) {
  const docBranch = normalizeBranch(doc.branch);
  return docBranch ? docBranch === branch : branch === defaultBranch;
}

function parseDateToEpochMs(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getRecentSortEpochMs(doc) {
  return parseDateToEpochMs(doc.updatedDate) ?? parseDateToEpochMs(doc.date);
}

function compareDocsByRecentDateThenRoute(left, right) {
  const leftEpoch = getRecentSortEpochMs(left);
  const rightEpoch = getRecentSortEpochMs(right);

  if (leftEpoch != null && rightEpoch != null) {
    const byDate = rightEpoch - leftEpoch;
    if (byDate !== 0) {
      return byDate;
    }
  } else if (leftEpoch != null) {
    return -1;
  } else if (rightEpoch != null) {
    return 1;
  }

  return left.route.localeCompare(right.route, "ko-KR");
}

function cloneFilteredTree(nodes, visibleDocIds) {
  const filteredNodes = [];

  for (const node of nodes) {
    if (node.type === "file") {
      if (visibleDocIds.has(node.id)) {
        filteredNodes.push(node);
      }
      continue;
    }

    const children = cloneFilteredTree(node.children, visibleDocIds);
    if (children.length === 0 && !node.virtual) {
      continue;
    }

    filteredNodes.push({ ...node, children });
  }

  return filteredNodes;
}

function buildBranchView(manifest, manifestDocs, branch, defaultBranch) {
  const docs = manifestDocs.filter((doc) => isDocVisibleInBranch(doc, branch, defaultBranch));
  const visibleDocIds = new Set(docs.map((doc) => doc.id));
  const tree = cloneFilteredTree(manifest.tree, visibleDocIds);
  const trees = buildTreesAdapterInput(tree, docs);
  const routeMap = {};
  const docIndexById = new Map();

  for (let index = 0; index < docs.length; index += 1) {
    const doc = docs[index];
    routeMap[doc.route] = doc.id;
    docIndexById.set(doc.id, index);
  }

  return { docs, visibleDocIds, tree, trees, routeMap, docIndexById };
}

export function pickHomeRoute(view) {
  if (view.routeMap["/index/"]) {
    return "/index/";
  }
  return [...view.docs].sort(compareDocsByRecentDateThenRoute)[0]?.route || "/";
}

function collectAvailableBranches(manifest, manifestDocs, defaultBranch) {
  const branchSet = new Set([defaultBranch]);
  for (const doc of manifestDocs) {
    const branch = normalizeBranch(doc.branch);
    if (branch) {
      branchSet.add(branch);
    }
  }
  if (Array.isArray(manifest.branches)) {
    for (const value of manifest.branches) {
      const branch = normalizeBranch(value);
      if (branch) {
        branchSet.add(branch);
      }
    }
  }

  return Array.from(branchSet).sort((left, right) => {
    if (left === defaultBranch) return -1;
    if (right === defaultBranch) return 1;
    return left.localeCompare(right, "ko-KR");
  });
}

export function createNavigationState(manifest, options = {}) {
  const defaultBranch = normalizeBranch(manifest.defaultBranch) || DEFAULT_BRANCH;
  const docs = getRuntimeManifestDocs(manifest);
  const docsById = new Map(docs.map((doc) => [doc.id, doc]));
  const availableBranches = collectAvailableBranches(manifest, docs, defaultBranch);
  const availableBranchSet = new Set(availableBranches);
  const savedBranch = normalizeBranch(options.savedBranch);
  const branchViewCache = new Map();
  let activeBranch = savedBranch && availableBranchSet.has(savedBranch) ? savedBranch : defaultBranch;
  let currentDocId = typeof options.initialDocId === "string" ? options.initialDocId : "";

  const getBranchView = (branch) => {
    const cached = branchViewCache.get(branch);
    if (cached) {
      return cached;
    }
    const nextView = buildBranchView(manifest, docs, branch, defaultBranch);
    branchViewCache.set(branch, nextView);
    return nextView;
  };

  let view = getBranchView(activeBranch);

  const setActiveBranch = (value) => {
    const branch = normalizeBranch(value);
    if (!branch || !availableBranchSet.has(branch)) {
      return false;
    }
    activeBranch = branch;
    view = getBranchView(branch);
    return true;
  };

  const resolve = (rawRoute) => {
    const route = normalizeRoute(rawRoute);
    const previousBranch = activeBranch;
    let id = view.routeMap[route];

    if (!id) {
      const globalId = manifest.routeMap?.[route];
      const globalDoc = globalId ? docsById.get(globalId) : null;
      const targetBranch = normalizeBranch(globalDoc?.branch) ?? defaultBranch;
      if (globalDoc && targetBranch !== activeBranch && availableBranchSet.has(targetBranch)) {
        setActiveBranch(targetBranch);
        id = view.routeMap[route];
      }
    }

    return {
      route,
      id: id ?? null,
      doc: id ? docsById.get(id) ?? null : null,
      branchChanged: previousBranch !== activeBranch,
    };
  };

  return {
    availableBranches,
    defaultBranch,
    get activeBranch() {
      return activeBranch;
    },
    get currentDocId() {
      return currentDocId;
    },
    get view() {
      return view;
    },
    setActiveBranch,
    setCurrentDocId(value) {
      currentDocId = typeof value === "string" ? value : "";
    },
    resolve,
  };
}
