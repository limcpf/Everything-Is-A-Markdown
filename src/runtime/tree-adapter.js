const DIRECTORY_SUFFIX = "/";
const FILE_EXTENSION = ".md";
const CONTROL_CHARS_RE = /[\u0000-\u001f\u007f]/g;
const PATH_SEPARATOR_RE = /[\\/]+/g;
const WHITESPACE_RE = /\s+/g;

function normalizeTreeSegment(value, fallback) {
  const normalized = String(value ?? "")
    .replace(CONTROL_CHARS_RE, "")
    .replace(PATH_SEPARATOR_RE, " - ")
    .replace(WHITESPACE_RE, " ")
    .trim();

  return normalized || fallback;
}

function trimFileExtension(value) {
  return value.replace(/\.md$/i, "");
}

function joinTreePath(parentPath, segment, isDirectory) {
  const cleanParent = parentPath.replace(/\/+$/, "");
  const cleanSegment = normalizeTreeSegment(segment, "Untitled");
  const joined = cleanParent ? `${cleanParent}/${cleanSegment}` : cleanSegment;
  return isDirectory ? `${joined}${DIRECTORY_SUFFIX}` : joined;
}

function appendCollisionSuffix(pathValue, counter) {
  const suffix = ` (${counter})`;
  if (pathValue.endsWith(DIRECTORY_SUFFIX)) {
    const clean = pathValue.slice(0, -1);
    return `${clean}${suffix}${DIRECTORY_SUFFIX}`;
  }

  if (pathValue.toLowerCase().endsWith(FILE_EXTENSION)) {
    return `${pathValue.slice(0, -FILE_EXTENSION.length)}${suffix}${FILE_EXTENSION}`;
  }

  return `${pathValue}${suffix}`;
}

function makeUniquePath(pathValue, usedPaths) {
  if (!usedPaths.has(pathValue)) {
    return pathValue;
  }

  let counter = 2;
  let candidate = appendCollisionSuffix(pathValue, counter);
  while (usedPaths.has(candidate)) {
    counter += 1;
    candidate = appendCollisionSuffix(pathValue, counter);
  }
  return candidate;
}

export function formatTreesFileBasename(node, doc) {
  const fallbackTitle = trimFileExtension(node?.name ? String(node.name) : "Untitled");
  const rawTitle = typeof node?.title === "string" && node.title.trim() ? node.title : doc?.title;
  const title = normalizeTreeSegment(rawTitle, normalizeTreeSegment(fallbackTitle, "Untitled"));
  const prefix = normalizeTreeSegment(node?.prefix ?? doc?.prefix ?? "", "");
  return `${prefix ? `${prefix} ` : ""}${title}`;
}

export function buildTreesAdapterInput(treeNodes, docs = []) {
  const docById = new Map();
  for (const doc of Array.isArray(docs) ? docs : []) {
    if (typeof doc?.id === "string" && doc.id) {
      docById.set(doc.id, doc);
    }
  }

  const paths = [];
  const usedPaths = new Set();
  const metadataByTreePath = new Map();
  const treePathToDocId = new Map();
  const treePathToRoute = new Map();
  const docIdToTreePaths = new Map();
  const docIdToPrimaryTreePath = new Map();

  const registerPath = (pathValue, metadata) => {
    const treePath = makeUniquePath(pathValue, usedPaths);
    usedPaths.add(treePath);
    paths.push(treePath);
    metadataByTreePath.set(treePath, metadata);
    return treePath;
  };

  const registerDocPath = (treePath, node, doc) => {
    const docId = typeof node?.id === "string" ? node.id : "";
    if (!docId) {
      return;
    }

    const route = typeof node.route === "string" ? node.route : doc?.route;
    treePathToDocId.set(treePath, docId);
    if (typeof route === "string" && route) {
      treePathToRoute.set(treePath, route);
    }

    const pathsForDoc = docIdToTreePaths.get(docId) ?? [];
    pathsForDoc.push(treePath);
    docIdToTreePaths.set(docId, pathsForDoc);

    // Duplicate docs can appear in virtual folders and the real folder tree.
    // Selection sync uses the first branch-visible occurrence as the primary
    // path, while every occurrence still resolves through docId/route maps.
    if (!docIdToPrimaryTreePath.has(docId)) {
      docIdToPrimaryTreePath.set(docId, treePath);
    }
  };

  const walk = (nodes, parentPath = "") => {
    if (!Array.isArray(nodes)) {
      return;
    }

    for (const node of nodes) {
      if (!node || typeof node !== "object") {
        continue;
      }

      if (node.type === "folder") {
        const folderPath = registerPath(joinTreePath(parentPath, node.name, true), {
          kind: "folder",
          name: normalizeTreeSegment(node.name, "Untitled"),
          sourcePath: typeof node.path === "string" ? node.path : "",
          virtual: node.virtual === true,
        });
        walk(node.children, folderPath);
        continue;
      }

      if (node.type !== "file") {
        continue;
      }

      const doc = docById.get(node.id);
      const treePath = registerPath(joinTreePath(parentPath, formatTreesFileBasename(node, doc), false), {
        branch: node.branch ?? doc?.branch ?? null,
        docId: node.id,
        isNew: node.isNew === true,
        kind: "file",
        prefix: node.prefix ?? doc?.prefix ?? "",
        route: node.route ?? doc?.route ?? "",
        title: node.title ?? doc?.title ?? "",
      });
      registerDocPath(treePath, node, doc);
    }
  };

  walk(treeNodes);

  return {
    docIdToPrimaryTreePath,
    docIdToTreePaths,
    metadataByTreePath,
    paths,
    treePathToDocId,
    treePathToRoute,
  };
}
