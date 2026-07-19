import { getRuntimeManifestDocs } from "./manifest-adapter.js";
import { buildTreesAdapterInput } from "./tree-adapter.js";
import {
  filterViewDocsByBranch,
  normalizeViewBranch as normalizeBranch,
  normalizeViewPathBase as normalizePathBase,
  normalizeViewPathname as normalizePathname,
  normalizeViewRoute as normalizeRoute,
  pickViewHomeRoute,
  stripViewPathBase as stripPathBase,
  toViewPathWithBase as toPathWithBase,
} from "../view-contract.ts";

const DEFAULT_BRANCH = "dev";

/** @typedef {import("./contracts").BranchView} BranchView */
/** @typedef {import("./contracts").NavigationState} NavigationState */
/** @typedef {import("./contracts").RuntimeManifest} RuntimeManifest */
/** @typedef {import("./contracts").RuntimeManifestDoc} RuntimeManifestDoc */
/** @typedef {import("./contracts").RuntimeTreeNode} RuntimeTreeNode */

export {
  normalizeBranch,
  normalizePathBase,
  normalizePathname,
  normalizeRoute,
  stripPathBase,
  toPathWithBase,
};

/**
 * @param {unknown} pathBase
 * @param {unknown} [pathname]
 */
export function resolveRouteFromLocation(pathBase, pathname = globalThis.location?.pathname ?? "/") {
  return normalizeRoute(stripPathBase(pathname, pathBase));
}

/**
 * @param {RuntimeTreeNode[]} nodes
 * @param {Set<string>} visibleDocIds
 * @returns {RuntimeTreeNode[]}
 */
function cloneFilteredTree(nodes, visibleDocIds) {
  /** @type {RuntimeTreeNode[]} */
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

/**
 * @param {RuntimeManifest} manifest
 * @param {RuntimeManifestDoc[]} manifestDocs
 * @param {string} branch
 * @param {string} defaultBranch
 * @returns {BranchView}
 */
function buildBranchView(manifest, manifestDocs, branch, defaultBranch) {
  const docs = filterViewDocsByBranch(manifestDocs, branch, defaultBranch);
  const visibleDocIds = new Set(docs.map((doc) => doc.id));
  const tree = cloneFilteredTree(manifest.tree, visibleDocIds);
  const trees = buildTreesAdapterInput(tree, docs);
  /** @type {Record<string, string>} */
  const routeMap = {};
  /** @type {Map<string, number>} */
  const docIndexById = new Map();

  for (let index = 0; index < docs.length; index += 1) {
    const doc = docs[index];
    routeMap[doc.route] = doc.id;
    docIndexById.set(doc.id, index);
  }

  return { docs, visibleDocIds, tree, trees, routeMap, docIndexById };
}

/** @param {BranchView} view */
export function pickHomeRoute(view) {
  return pickViewHomeRoute(view.docs);
}

/**
 * @param {RuntimeManifest} manifest
 * @param {RuntimeManifestDoc[]} manifestDocs
 * @param {string} defaultBranch
 * @returns {string[]}
 */
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

/**
 * @param {RuntimeManifest} manifest
 * @param {{ savedBranch?: unknown; initialDocId?: unknown }} [options]
 * @returns {NavigationState}
 */
export function createNavigationState(manifest, options = {}) {
  const defaultBranch = normalizeBranch(manifest.defaultBranch) || DEFAULT_BRANCH;
  const docs = getRuntimeManifestDocs(manifest);
  const docsById = new Map(docs.map((doc) => [doc.id, doc]));
  const availableBranches = collectAvailableBranches(manifest, docs, defaultBranch);
  const availableBranchSet = new Set(availableBranches);
  const savedBranch = normalizeBranch(options.savedBranch);
  /** @type {Map<string, BranchView>} */
  const branchViewCache = new Map();
  let activeBranch = savedBranch && availableBranchSet.has(savedBranch) ? savedBranch : defaultBranch;
  let currentDocId = typeof options.initialDocId === "string" ? options.initialDocId : "";

  /** @param {string} branch */
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
  if (view.docs.length === 0 && docs.length > 0) {
    const fallbackRoute = pickViewHomeRoute(docs);
    const fallbackDoc = docs.find((doc) => doc.route === fallbackRoute);
    const fallbackBranch = normalizeBranch(fallbackDoc?.branch) ?? defaultBranch;
    if (availableBranchSet.has(fallbackBranch)) {
      activeBranch = fallbackBranch;
      view = getBranchView(activeBranch);
    }
  }

  /** @param {unknown} value */
  const setActiveBranch = (value) => {
    const branch = normalizeBranch(value);
    if (!branch || !availableBranchSet.has(branch)) {
      return false;
    }
    activeBranch = branch;
    view = getBranchView(branch);
    return true;
  };

  /** @param {unknown} rawRoute */
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
