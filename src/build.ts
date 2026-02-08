import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import type { BuildCache, BuildOptions, DocRecord, FileNode, FolderNode, Manifest, TreeNode, WikiResolver } from "./types";
import { createMarkdownRenderer } from "./markdown";
import { render404Html, renderAppShellHtml } from "./template";
import {
  buildExcluder,
  ensureDir,
  fileExists,
  formatDateIso,
  makeHash,
  makeTitleFromFileName,
  relativePosix,
  removeEmptyParents,
  removeFileIfExists,
  stripMdExt,
  toDocId,
  toRoute,
} from "./utils";

const CACHE_VERSION = 1;
const CACHE_DIR_NAME = ".cache";
const CACHE_FILE_NAME = "build-index.json";
const DEFAULT_BRANCH = "dev";

interface BuildResult {
  totalDocs: number;
  renderedDocs: number;
  skippedDocs: number;
}

function toCachePath(): string {
  return path.join(process.cwd(), CACHE_DIR_NAME, CACHE_FILE_NAME);
}

async function readCache(cachePath: string): Promise<BuildCache> {
  const file = Bun.file(cachePath);
  if (!(await file.exists())) {
    return { version: CACHE_VERSION, docs: {} };
  }

  try {
    const parsed = (await file.json()) as BuildCache;
    if (parsed.version !== CACHE_VERSION || typeof parsed.docs !== "object" || !parsed.docs) {
      return { version: CACHE_VERSION, docs: {} };
    }
    return parsed;
  } catch {
    return { version: CACHE_VERSION, docs: {} };
  }
}

async function writeCache(cachePath: string, cache: BuildCache): Promise<void> {
  await ensureDir(path.dirname(cachePath));
  await Bun.write(cachePath, `${JSON.stringify(cache, null, 2)}\n`);
}

async function walkMarkdownFiles(
  dir: string,
  vaultDir: string,
  isExcluded: (relPath: string, isDirectory: boolean) => boolean,
): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const absolutePath = path.join(dir, entry.name);
    const relPath = relativePosix(vaultDir, absolutePath);

    if (isExcluded(relPath, entry.isDirectory())) {
      continue;
    }

    if (entry.isDirectory()) {
      files.push(...(await walkMarkdownFiles(absolutePath, vaultDir, isExcluded)));
      continue;
    }

    if (entry.isFile() && /\.md$/i.test(entry.name)) {
      files.push(absolutePath);
    }
  }

  return files;
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => String(item).trim()).filter(Boolean);
}

function parseBranch(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

async function readPublishedDocs(options: BuildOptions): Promise<DocRecord[]> {
  const isExcluded = buildExcluder(options.exclude);
  const mdFiles = await walkMarkdownFiles(options.vaultDir, options.vaultDir, isExcluded);
  const now = Date.now();
  const newThreshold = now - options.newWithinDays * 24 * 60 * 60 * 1000;

  const docs: DocRecord[] = [];

  for (const sourcePath of mdFiles) {
    const relPath = relativePosix(options.vaultDir, sourcePath);
    const relNoExt = stripMdExt(relPath);
    const stat = await fs.stat(sourcePath);
    const raw = await Bun.file(sourcePath).text();

    let parsed: matter.GrayMatterFile<string>;
    try {
      parsed = matter(raw);
    } catch (error) {
      throw new Error(`Frontmatter parse failed: ${relPath}\n${(error as Error).message}`);
    }

    const publish = parsed.data.publish === true;
    const draft = parsed.data.draft === true;
    if (!publish || draft) {
      continue;
    }

    const fileName = path.basename(relPath);
    const id = toDocId(relNoExt);
    const route = toRoute(relNoExt);
    const mtimeMs = stat.mtimeMs;

    docs.push({
      sourcePath,
      relPath,
      relNoExt,
      id,
      route,
      contentUrl: `/content/${id}.html`,
      fileName,
      title: typeof parsed.data.title === "string" && parsed.data.title.trim().length > 0 ? parsed.data.title.trim() : makeTitleFromFileName(fileName),
      date: typeof parsed.data.date === "string" ? parsed.data.date : formatDateIso(new Date(mtimeMs)),
      description: typeof parsed.data.description === "string" ? parsed.data.description : undefined,
      tags: parseStringArray(parsed.data.tags),
      mtimeMs,
      body: parsed.content,
      raw,
      isNew: mtimeMs >= newThreshold,
      branch: parseBranch(parsed.data.branch),
    });
  }

  return docs;
}

function createWikiResolver(docs: DocRecord[], currentDoc: DocRecord): WikiResolver {
  const byPath = new Map<string, DocRecord>();
  const byStem = new Map<string, DocRecord[]>();

  for (const doc of docs) {
    byPath.set(doc.relNoExt.toLowerCase(), doc);
    const stem = path.basename(doc.relNoExt).toLowerCase();
    const bucket = byStem.get(stem) ?? [];
    bucket.push(doc);
    byStem.set(stem, bucket);
  }

  return {
    resolve(input: string) {
      const normalized = input
        .trim()
        .replace(/\\/g, "/")
        .replace(/^\.\//, "")
        .replace(/^\//, "")
        .replace(/\.md$/i, "");

      if (!normalized) {
        return null;
      }

      const direct = byPath.get(normalized.toLowerCase());
      if (direct) {
        return { route: direct.route, label: direct.title };
      }

      if (normalized.includes("/")) {
        return null;
      }

      const stemMatches = byStem.get(normalized.toLowerCase()) ?? [];
      if (stemMatches.length === 1) {
        return { route: stemMatches[0].route, label: stemMatches[0].title };
      }

      if (stemMatches.length > 1) {
        console.warn(
          `[wikilink] Duplicate target "${input}" in ${currentDoc.relPath}. Candidates: ${stemMatches.map((item) => item.relPath).join(", ")}`,
        );
      }

      return null;
    },
  };
}

function fileNodeFromDoc(doc: DocRecord): FileNode {
  return {
    type: "file",
    name: doc.fileName,
    id: doc.id,
    title: doc.title,
    route: doc.route,
    contentUrl: doc.contentUrl,
    mtime: doc.mtimeMs,
    isNew: doc.isNew,
    tags: doc.tags,
    description: doc.description,
    date: doc.date,
    branch: doc.branch,
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
    const segments = doc.relNoExt.split("/");
    const folders = segments.slice(0, -1);

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
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, options.recentLimit)
    .map((doc) => fileNodeFromDoc(doc));

  const recentFolder: FolderNode = {
    type: "folder",
    name: "Recent",
    path: "__virtual__/recent",
    virtual: true,
    children: recentChildren,
  };

  return [recentFolder, ...root.children];
}

function buildManifest(docs: DocRecord[], tree: TreeNode[], options: BuildOptions): Manifest {
  const routeMap: Record<string, string> = {};
  for (const doc of docs) {
    routeMap[doc.route] = doc.id;
  }

  const docsForManifest = [...docs]
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .map((doc) => ({
      id: doc.id,
      route: doc.route,
      title: doc.title,
      mtime: doc.mtimeMs,
      date: doc.date,
      tags: doc.tags,
      description: doc.description,
      isNew: doc.isNew,
      contentUrl: doc.contentUrl,
      branch: doc.branch,
    }));

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
    generatedAt: new Date().toISOString(),
    defaultBranch: DEFAULT_BRANCH,
    branches,
    ui: {
      newWithinDays: options.newWithinDays,
      recentLimit: options.recentLimit,
    },
    tree,
    routeMap,
    docs: docsForManifest,
  };
}

async function writeRuntimeAssets(outDir: string): Promise<void> {
  const assetsDir = path.join(outDir, "assets");
  await ensureDir(assetsDir);

  const runtimeDir = path.join(import.meta.dir, "runtime");
  await fs.copyFile(path.join(runtimeDir, "app.js"), path.join(assetsDir, "app.js"));
  await fs.copyFile(path.join(runtimeDir, "app.css"), path.join(assetsDir, "app.css"));
}

async function writeShellPages(outDir: string, docs: DocRecord[]): Promise<void> {
  const shell = renderAppShellHtml();
  await ensureDir(path.join(outDir, "_app"));
  await Bun.write(path.join(outDir, "_app", "index.html"), shell);
  await Bun.write(path.join(outDir, "index.html"), shell);
  await Bun.write(path.join(outDir, "404.html"), render404Html());

  for (const doc of docs) {
    const routeDir = path.join(outDir, doc.relNoExt);
    await ensureDir(routeDir);
    await Bun.write(path.join(routeDir, "index.html"), shell);
  }
}

async function cleanRemovedOutputs(outDir: string, oldCache: BuildCache, currentDocs: DocRecord[]): Promise<void> {
  const currentIds = new Set(currentDocs.map((doc) => doc.id));

  for (const [id, entry] of Object.entries(oldCache.docs)) {
    if (currentIds.has(id)) {
      continue;
    }

    const contentPath = path.join(outDir, "content", `${id}.html`);
    await removeFileIfExists(contentPath);

    const routeDir = path.join(outDir, entry.route.replace(/^\//, "").replace(/\/$/, ""));
    const routeIndex = path.join(routeDir, "index.html");
    await removeFileIfExists(routeIndex);
    await removeEmptyParents(routeDir, outDir);
  }
}

export async function cleanBuildArtifacts(outDir: string): Promise<void> {
  const cachePath = toCachePath();
  await fs.rm(outDir, { recursive: true, force: true });
  await fs.rm(path.dirname(cachePath), { recursive: true, force: true });
}

export async function buildSite(options: BuildOptions): Promise<BuildResult> {
  await ensureDir(options.outDir);
  await ensureDir(path.join(options.outDir, "content"));

  const cachePath = toCachePath();
  const previousCache = await readCache(cachePath);
  const docs = await readPublishedDocs(options);
  docs.sort((a, b) => a.relNoExt.localeCompare(b.relNoExt, "ko-KR"));

  await cleanRemovedOutputs(options.outDir, previousCache, docs);
  await writeRuntimeAssets(options.outDir);

  const tree = buildTree(docs, options);
  const manifest = buildManifest(docs, tree, options);
  await Bun.write(path.join(options.outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

  await writeShellPages(options.outDir, docs);

  const markdownRenderer = await createMarkdownRenderer(options);
  const globalFingerprint = makeHash(docs.map((doc) => doc.relNoExt).sort().join("|"));

  let renderedDocs = 0;
  let skippedDocs = 0;

  const nextCache: BuildCache = {
    version: CACHE_VERSION,
    docs: {},
  };

  for (const doc of docs) {
    const sourceHash = makeHash(
      [doc.raw, options.shikiTheme, options.imagePolicy, options.wikilinks ? "wikilinks-on" : "wikilinks-off", globalFingerprint].join("::"),
    );
    const previous = previousCache.docs[doc.id];
    const outputPath = path.join(options.outDir, "content", `${doc.id}.html`);
    const unchanged = previous?.hash === sourceHash && (await fileExists(outputPath));

    nextCache.docs[doc.id] = {
      hash: sourceHash,
      route: doc.route,
      relPath: doc.relPath,
    };

    if (unchanged) {
      skippedDocs += 1;
      continue;
    }

    const resolver = createWikiResolver(docs, doc);
    const renderResult = await markdownRenderer.render(doc.body, resolver);
    if (renderResult.warnings.length > 0) {
      for (const warning of renderResult.warnings) {
        console.warn(`[markdown] ${doc.relPath}: ${warning}`);
      }
    }

    await Bun.write(outputPath, renderResult.html);
    renderedDocs += 1;
  }

  await writeCache(cachePath, nextCache);

  return {
    totalDocs: docs.length,
    renderedDocs,
    skippedDocs,
  };
}
