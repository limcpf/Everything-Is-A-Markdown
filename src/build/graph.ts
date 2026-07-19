import path from "node:path";
import type { BuildOptions, DocRecord, FileNode, FolderNode, Manifest, TreeNode } from "../types";
import { filterViewDocsByBranch, pickViewHomeRoute } from "../view-contract";
import type { DocumentGraphResult, WikiLookup } from "./contracts";
import { buildBacklinksByDocId, createWikiLookup } from "./source";
import { resolveSiteTitle } from "./shared";

const DEFAULT_BRANCH = "dev";

function fileNodeFromDoc(doc: DocRecord): FileNode {
  return {
    type: "file",
    name: doc.fileName,
    id: doc.id,
  };
}

function sortTree(nodes: TreeNode[]): TreeNode[] {
  nodes.sort((left, right) => {
    if (left.type !== right.type) {
      return left.type === "folder" ? -1 : 1;
    }
    return left.name.localeCompare(right.name, "ko-KR");
  });

  for (const node of nodes) {
    if (node.type === "folder") {
      sortTree(node.children);
    }
  }

  return nodes;
}

function parseDateToEpochMs(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getRecentSortEpochMs(doc: DocRecord): number | null {
  return parseDateToEpochMs(doc.updatedDate) ?? parseDateToEpochMs(doc.date);
}

function compareByRecentDateThenPath(left: DocRecord, right: DocRecord): number {
  const leftEpoch = getRecentSortEpochMs(left);
  const rightEpoch = getRecentSortEpochMs(right);

  if (leftEpoch != null && rightEpoch != null) {
    const byDate = rightEpoch - leftEpoch;
    if (byDate !== 0) {
      return byDate;
    }
  } else if (leftEpoch != null && rightEpoch == null) {
    return -1;
  } else if (leftEpoch == null && rightEpoch != null) {
    return 1;
  }

  return left.relNoExt.localeCompare(right.relNoExt, "ko-KR");
}

function matchesPathPrefix(value: string, prefix: string): boolean {
  return value === prefix || value.startsWith(`${prefix}/`);
}

export function pickHomeDoc(docs: DocRecord[]): DocRecord | null {
  const defaultCandidates = filterViewDocsByBranch(docs, DEFAULT_BRANCH, DEFAULT_BRANCH);
  const candidates = defaultCandidates.length > 0 ? defaultCandidates : docs;
  const route = pickViewHomeRoute(candidates);
  return candidates.find((doc) => doc.route === route) ?? null;
}

function buildPinnedMenuFolder(docs: DocRecord[], options: BuildOptions): FolderNode | null {
  if (!options.pinnedMenu) {
    return null;
  }

  const categoryPath = options.pinnedMenu.categoryPath;
  const sourceDir = options.pinnedMenu.sourceDir;
  const children = docs
    .filter((doc) => {
      if (categoryPath) {
        return matchesPathPrefix(doc.categoryPath, categoryPath);
      }
      if (sourceDir) {
        return matchesPathPrefix(doc.relNoExt, sourceDir);
      }
      return false;
    })
    .sort((left, right) => left.relNoExt.localeCompare(right.relNoExt, "ko-KR"))
    .map((doc) => fileNodeFromDoc(doc));

  const pathKey = categoryPath ? `category/${categoryPath}` : `source/${sourceDir ?? "unknown"}`;

  return {
    type: "folder",
    name: options.pinnedMenu.label,
    path: `__virtual__/pinned/${pathKey}`,
    virtual: true,
    children,
  };
}

function buildTree(docs: DocRecord[], options: BuildOptions): TreeNode[] {
  const root: FolderNode = {
    type: "folder",
    name: "root",
    path: "",
    children: [],
  };

  const folderIndex = new Map<string, FolderNode>();
  folderIndex.set("", root);

  for (const doc of docs) {
    const folders = doc.categoryPath.split("/");

    let currentPath = "";
    let parent = root;

    for (const segment of folders) {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      let folder = folderIndex.get(currentPath);
      if (!folder) {
        folder = {
          type: "folder",
          name: segment,
          path: currentPath,
          children: [],
        };
        folderIndex.set(currentPath, folder);
        parent.children.push(folder);
      }
      parent = folder;
    }

    parent.children.push(fileNodeFromDoc(doc));
  }

  sortTree(root.children);

  const recentChildren = [...docs]
    .sort(compareByRecentDateThenPath)
    .slice(0, options.recentLimit)
    .map((doc) => fileNodeFromDoc(doc));

  const recentFolder: FolderNode = {
    type: "folder",
    name: "Recent",
    path: "__virtual__/recent",
    virtual: true,
    children: recentChildren,
  };

  const pinnedFolder = buildPinnedMenuFolder(docs, options);
  if (!pinnedFolder) {
    return [recentFolder, ...root.children];
  }

  return [pinnedFolder, recentFolder, ...root.children];
}

function buildManifest(
  docs: DocRecord[],
  tree: TreeNode[],
  options: BuildOptions,
  wikiLookup: WikiLookup,
): Manifest {
  const routeMap: Record<string, string> = {};
  for (const doc of docs) {
    routeMap[doc.route] = doc.id;
  }

  const backlinksByDocId = buildBacklinksByDocId(docs, wikiLookup);

  const docsById = Object.fromEntries(
    docs.map((doc) => [
      doc.id,
      {
        id: doc.id,
        route: doc.route,
        title: doc.title,
        prefix: doc.prefix,
        categoryPath: doc.categoryPath,
        date: doc.date,
        updatedDate: doc.updatedDate,
        tags: doc.tags,
        description: doc.description,
        contentUrl: doc.contentUrl,
        branch: doc.branch,
        wikiTargets: doc.wikiTargets,
        backlinks: backlinksByDocId.get(doc.id) ?? [],
      },
    ]),
  );

  const branchSet = new Set<string>([DEFAULT_BRANCH]);
  for (const doc of docs) {
    if (doc.branch) {
      branchSet.add(doc.branch);
    }
  }

  const branches = Array.from(branchSet).sort((left, right) => {
    if (left === DEFAULT_BRANCH) {
      return -1;
    }
    if (right === DEFAULT_BRANCH) {
      return 1;
    }
    return left.localeCompare(right, "ko-KR");
  });

  return {
    schemaVersion: 2,
    siteTitle: resolveSiteTitle(options),
    pathBase: options.seo?.pathBase ?? "",
    defaultBranch: DEFAULT_BRANCH,
    mermaid: options.mermaid,
    branches,
    ui: {
      newWithinDays: options.newWithinDays,
      recentLimit: options.recentLimit,
    },
    tree,
    routeMap,
    docIds: docs.map((doc) => doc.id),
    docsById,
  };
}

export function buildDocumentGraph(docs: DocRecord[], options: BuildOptions): DocumentGraphResult {
  const tree = buildTree(docs, options);
  const wikiLookup = createWikiLookup(docs);
  return {
    tree,
    manifest: buildManifest(docs, tree, options, wikiLookup),
    wikiLookup,
  };
}
