import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import type { BuildCache, BuildOptions, DocRecord, FileNode, FolderNode, Manifest, TreeNode, WikiResolver } from "./types";
import { createMarkdownRenderer } from "./markdown";
import { buildCanonicalUrl } from "./seo";
import { render404Html, renderAppShellHtml } from "./template";
import type { AppShellMeta } from "./template";
import {
  buildExcluder,
  ensureDir,
  fileExists,
  makeHash,
  makeTitleFromFileName,
  relativePosix,
  removeEmptyParents,
  removeFileIfExists,
  stripMdExt,
  toDocId,
  toRoute,
} from "./utils";

const CACHE_VERSION = 2;
const CACHE_DIR_NAME = ".cache";
const CACHE_FILE_NAME = "build-index.json";
const DEFAULT_BRANCH = "dev";
const DEFAULT_SITE_DESCRIPTION = "File-system style static blog with markdown explorer UI.";
const DEFAULT_SITE_TITLE = "File-System Blog";

type CachedSourceEntry = BuildCache["sources"][string];

interface OutputWriteContext {
  outDir: string;
  previousHashes: Record<string, string>;
  nextHashes: Record<string, string>;
}

interface WikiLookup {
  byPath: Map<string, DocRecord>;
  byStem: Map<string, DocRecord[]>;
}

interface ReadDocsResult {
  docs: DocRecord[];
  nextSources: BuildCache["sources"];
}

interface BuildResult {
  totalDocs: number;
  renderedDocs: number;
  skippedDocs: number;
}

function toContentFileName(id: string): string {
  return `${makeHash(id)}.html`;
}

function toCachePath(): string {
  return path.join(process.cwd(), CACHE_DIR_NAME, CACHE_FILE_NAME);
}

function createEmptyCache(): BuildCache {
  return { version: CACHE_VERSION, sources: {}, docs: {}, outputHashes: {} };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeCachedDocIndex(value: unknown): BuildCache["docs"] {
  if (!isRecord(value)) {
    return {};
  }

  const normalized: BuildCache["docs"] = {};
  for (const [id, rawEntry] of Object.entries(value)) {
    if (!isRecord(rawEntry)) {
      continue;
    }

    const hash = typeof rawEntry.hash === "string" ? rawEntry.hash : "";
    const route = typeof rawEntry.route === "string" ? rawEntry.route : "";
    const relPath = typeof rawEntry.relPath === "string" ? rawEntry.relPath : "";
    if (!hash || !route || !relPath) {
      continue;
    }

    normalized[id] = { hash, route, relPath };
  }

  return normalized;
}

function normalizeCachedOutputHashes(value: unknown): BuildCache["outputHashes"] {
  if (!isRecord(value)) {
    return {};
  }

  const normalized: BuildCache["outputHashes"] = {};
  for (const [outputPath, hash] of Object.entries(value)) {
    if (typeof hash === "string" && hash.length > 0) {
      normalized[outputPath] = hash;
    }
  }
  return normalized;
}

function normalizeCachedSourceEntry(value: unknown): CachedSourceEntry | null {
  if (!isRecord(value)) {
    return null;
  }

  const mtimeMs = typeof value.mtimeMs === "number" && Number.isFinite(value.mtimeMs) ? value.mtimeMs : null;
  const size = typeof value.size === "number" && Number.isFinite(value.size) ? value.size : null;
  const rawHash = typeof value.rawHash === "string" ? value.rawHash : "";
  const publish = value.publish === true;
  const draft = value.draft === true;
  const title = typeof value.title === "string" && value.title.trim().length > 0 ? value.title.trim() : undefined;
  const date = typeof value.date === "string" && value.date.trim().length > 0 ? value.date.trim() : undefined;
  const updatedDate =
    typeof value.updatedDate === "string" && value.updatedDate.trim().length > 0 ? value.updatedDate.trim() : undefined;
  const description =
    typeof value.description === "string" && value.description.trim().length > 0 ? value.description.trim() : undefined;
  const tags = parseStringArray(value.tags);
  const branch = parseBranch(value.branch);
  const body = typeof value.body === "string" ? value.body : null;
  const wikiTargets = parseStringArray(value.wikiTargets);

  if (mtimeMs === null || size === null || !rawHash || body == null) {
    return null;
  }

  return {
    mtimeMs,
    size,
    rawHash,
    publish,
    draft,
    title,
    date,
    updatedDate,
    description,
    tags,
    branch,
    body,
    wikiTargets,
  };
}

function normalizeCachedSources(value: unknown): BuildCache["sources"] {
  if (!isRecord(value)) {
    return {};
  }

  const normalized: BuildCache["sources"] = {};
  for (const [relPath, rawEntry] of Object.entries(value)) {
    const entry = normalizeCachedSourceEntry(rawEntry);
    if (!entry) {
      continue;
    }
    normalized[relPath] = entry;
  }
  return normalized;
}

async function readCache(cachePath: string): Promise<BuildCache> {
  const file = Bun.file(cachePath);
  if (!(await file.exists())) {
    return createEmptyCache();
  }

  try {
    const parsed = (await file.json()) as unknown;
    if (!isRecord(parsed) || parsed.version !== CACHE_VERSION) {
      return createEmptyCache();
    }

    return {
      version: CACHE_VERSION,
      sources: normalizeCachedSources(parsed.sources),
      docs: normalizeCachedDocIndex(parsed.docs),
      outputHashes: normalizeCachedOutputHashes(parsed.outputHashes),
    };
  } catch {
    return createEmptyCache();
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

function normalizeFrontmatterDate(value: unknown): string | null {
  const toLocalIsoLike = (input: Date): string => {
    const yyyy = input.getFullYear();
    const mm = String(input.getMonth() + 1).padStart(2, "0");
    const dd = String(input.getDate()).padStart(2, "0");
    const hh = String(input.getHours()).padStart(2, "0");
    const mi = String(input.getMinutes()).padStart(2, "0");
    const ss = String(input.getSeconds()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}`;
  };

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return toLocalIsoLike(value);
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = new Date(value);
    if (Number.isFinite(parsed.getTime())) {
      return toLocalIsoLike(parsed);
    }
  }

  return null;
}

function extractFrontmatterScalar(raw: string, key: string): string | null {
  const frontmatterMatch = raw.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
  if (!frontmatterMatch) {
    return null;
  }

  const body = frontmatterMatch[1];
  const lineRegex = new RegExp(`^${key}:\\s*(.+?)\\s*$`, "m");
  const lineMatch = body.match(lineRegex);
  if (!lineMatch) {
    return null;
  }

  let value = lineMatch[1].trim();
  if (!value || value === "|" || value === ">") {
    return null;
  }

  const quoted =
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"));
  if (quoted) {
    value = value.slice(1, -1).trim();
  }

  return value.length > 0 ? value : null;
}

function pickFrontmatterDate(
  frontmatter: Record<string, unknown>,
  raw: string,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const literal = extractFrontmatterScalar(raw, key);
    if (literal) {
      return literal;
    }
  }

  for (const key of keys) {
    const normalized = normalizeFrontmatterDate(frontmatter[key]);
    if (normalized) {
      return normalized;
    }
  }

  return undefined;
}

function pickDocDate(frontmatter: Record<string, unknown>, raw: string): string | undefined {
  return pickFrontmatterDate(frontmatter, raw, ["date", "createdDate"]);
}

function pickDocUpdatedDate(frontmatter: Record<string, unknown>, raw: string): string | undefined {
  return pickFrontmatterDate(frontmatter, raw, ["updatedDate", "modifiedDate", "lastModified"]);
}

function appendRouteSuffix(route: string, suffix: string): string {
  const clean = route.replace(/^\/+/, "").replace(/\/+$/, "");
  if (!clean) {
    return `/${suffix}/`;
  }

  const segments = clean.split("/");
  const last = segments.pop() ?? "doc";
  segments.push(`${last}-${suffix}`);
  return `/${segments.join("/")}/`;
}

function ensureUniqueRoutes(docs: DocRecord[]): void {
  const initialBuckets = new Map<string, DocRecord[]>();
  for (const doc of docs) {
    const bucket = initialBuckets.get(doc.route) ?? [];
    bucket.push(doc);
    initialBuckets.set(doc.route, bucket);
  }

  for (const [route, bucket] of initialBuckets.entries()) {
    if (bucket.length <= 1) {
      continue;
    }
    console.warn(
      `[route] Duplicate slug route "${route}" detected. Applying suffixes: ${bucket.map((doc) => doc.relPath).join(", ")}`,
    );
  }

  const used = new Set<string>();
  const sorted = [...docs].sort((left, right) => left.relNoExt.localeCompare(right.relNoExt, "ko-KR"));

  for (const doc of sorted) {
    const baseRoute = doc.route;
    let candidate = baseRoute;

    if (used.has(candidate)) {
      const digest = makeHash(doc.id);
      let len = 6;
      while (used.has(candidate)) {
        const suffix = digest.slice(0, len);
        candidate = appendRouteSuffix(baseRoute, suffix);
        len += 2;

        if (len > digest.length) {
          candidate = appendRouteSuffix(baseRoute, doc.id.replace(/__/g, "-"));
          break;
        }
      }
    }

    doc.route = candidate;
    used.add(candidate);
  }
}

function normalizeWikiTarget(input: string): string {
  return input
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/^\//, "")
    .replace(/\.md$/i, "")
    .toLowerCase();
}

function extractWikiTargets(markdown: string): string[] {
  const targets = new Set<string>();
  const re = /\[\[([^\]]+)\]\]/g;
  while (true) {
    const match = re.exec(markdown);
    if (match === null) {
      break;
    }
    if (match.index > 0 && markdown.charAt(match.index - 1) === "!") {
      continue;
    }

    const inner = (match[1] ?? "").trim();
    if (!inner) {
      continue;
    }

    const [rawTarget] = inner.split("|");
    const normalized = normalizeWikiTarget(rawTarget ?? "");
    if (!normalized) {
      continue;
    }
    targets.add(normalized);
  }

  return Array.from(targets).sort((left, right) => left.localeCompare(right, "ko-KR"));
}

function toCachedSourceEntry(raw: string, parsed: matter.GrayMatterFile<string>): CachedSourceEntry {
  return {
    mtimeMs: 0,
    size: 0,
    rawHash: makeHash(raw),
    publish: parsed.data.publish === true,
    draft: parsed.data.draft === true,
    title: typeof parsed.data.title === "string" && parsed.data.title.trim().length > 0 ? parsed.data.title.trim() : undefined,
    date: pickDocDate(parsed.data as Record<string, unknown>, raw),
    updatedDate: pickDocUpdatedDate(parsed.data as Record<string, unknown>, raw),
    description: typeof parsed.data.description === "string" ? parsed.data.description.trim() || undefined : undefined,
    tags: parseStringArray(parsed.data.tags),
    branch: parseBranch(parsed.data.branch),
    body: parsed.content,
    wikiTargets: extractWikiTargets(parsed.content),
  };
}

function toDocRecord(
  sourcePath: string,
  relPath: string,
  entry: CachedSourceEntry,
  newThreshold: number,
): DocRecord {
  const relNoExt = stripMdExt(relPath);
  const fileName = path.basename(relPath);
  const id = toDocId(relNoExt);

  return {
    sourcePath,
    relPath,
    relNoExt,
    id,
    route: toRoute(relNoExt),
    contentUrl: `/content/${toContentFileName(id)}`,
    fileName,
    title: entry.title ?? makeTitleFromFileName(fileName),
    date: entry.date,
    updatedDate: entry.updatedDate,
    description: entry.description,
    tags: entry.tags,
    mtimeMs: entry.mtimeMs,
    body: entry.body,
    rawHash: entry.rawHash,
    wikiTargets: entry.wikiTargets,
    isNew: isNewByFrontmatterDate(entry.date, newThreshold),
    branch: entry.branch,
  };
}

async function readPublishedDocs(options: BuildOptions, previousSources: BuildCache["sources"]): Promise<ReadDocsResult> {
  const isExcluded = buildExcluder(options.exclude);
  const mdFiles = await walkMarkdownFiles(options.vaultDir, options.vaultDir, isExcluded);
  const fileEntries = await Promise.all(
    mdFiles.map(async (sourcePath) => ({
      sourcePath,
      relPath: relativePosix(options.vaultDir, sourcePath),
      stat: await fs.stat(sourcePath),
    })),
  );
  const now = Date.now();
  const newThreshold = now - options.newWithinDays * 24 * 60 * 60 * 1000;

  const docs: DocRecord[] = [];
  const nextSources: BuildCache["sources"] = {};

  for (const { sourcePath, relPath, stat } of fileEntries) {
    const prev = previousSources[relPath];

    let entry: CachedSourceEntry;
    const canReuse = !!prev && prev.mtimeMs === stat.mtimeMs && prev.size === stat.size;
    if (canReuse) {
      entry = prev;
    } else {
      const raw = await Bun.file(sourcePath).text();

      let parsed: matter.GrayMatterFile<string>;
      try {
        parsed = matter(raw);
      } catch (error) {
        throw new Error(`Frontmatter parse failed: ${relPath}\n${(error as Error).message}`);
      }

      entry = toCachedSourceEntry(raw, parsed);
    }

    const completeEntry: CachedSourceEntry = {
      ...entry,
      mtimeMs: stat.mtimeMs,
      size: stat.size,
    };
    nextSources[relPath] = completeEntry;

    if (!completeEntry.publish || completeEntry.draft) {
      continue;
    }
    docs.push(toDocRecord(sourcePath, relPath, completeEntry, newThreshold));
  }

  ensureUniqueRoutes(docs);
  return { docs, nextSources };
}

function createWikiLookup(docs: DocRecord[]): WikiLookup {
  const byPath = new Map<string, DocRecord>();
  const byStem = new Map<string, DocRecord[]>();

  for (const doc of docs) {
    byPath.set(doc.relNoExt.toLowerCase(), doc);
    const stem = path.basename(doc.relNoExt).toLowerCase();
    const bucket = byStem.get(stem) ?? [];
    bucket.push(doc);
    byStem.set(stem, bucket);
  }

  return { byPath, byStem };
}

function resolveWikiTarget(
  lookup: WikiLookup,
  input: string,
  currentDoc: DocRecord,
  warnOnDuplicate: boolean,
): { route: string; label: string } | null {
  const normalized = normalizeWikiTarget(input);
  if (!normalized) {
    return null;
  }

  const direct = lookup.byPath.get(normalized);
  if (direct) {
    return { route: direct.route, label: direct.title };
  }

  if (normalized.includes("/")) {
    return null;
  }

  const stemMatches = lookup.byStem.get(normalized) ?? [];
  if (stemMatches.length === 1) {
    return { route: stemMatches[0].route, label: stemMatches[0].title };
  }

  if (warnOnDuplicate && stemMatches.length > 1) {
    console.warn(
      `[wikilink] Duplicate target "${input}" in ${currentDoc.relPath}. Candidates: ${stemMatches.map((item) => item.relPath).join(", ")}`,
    );
  }

  return null;
}

function createWikiResolver(lookup: WikiLookup, currentDoc: DocRecord): WikiResolver {
  return {
    resolve(input: string) {
      return resolveWikiTarget(lookup, input, currentDoc, true);
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
    updatedDate: doc.updatedDate,
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

function parseDateToEpochMs(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isNewByFrontmatterDate(date: string | undefined, newThreshold: number): boolean {
  const publishedAt = parseDateToEpochMs(date);
  return publishedAt != null && publishedAt >= newThreshold;
}

function getRecentSortEpochMs(doc: DocRecord): number {
  return parseDateToEpochMs(doc.date) ?? doc.mtimeMs;
}

function buildPinnedMenuFolder(docs: DocRecord[], options: BuildOptions): FolderNode | null {
  if (!options.pinnedMenu) {
    return null;
  }

  const sourceDir = options.pinnedMenu.sourceDir;
  const sourcePrefix = `${sourceDir}/`;
  const children = docs
    .filter((doc) => doc.relNoExt.startsWith(sourcePrefix))
    .sort((left, right) => left.relNoExt.localeCompare(right.relNoExt, "ko-KR"))
    .map((doc) => fileNodeFromDoc(doc));

  return {
    type: "folder",
    name: options.pinnedMenu.label,
    path: `__virtual__/pinned/${sourceDir}`,
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
    .sort((left, right) => {
      const byDate = getRecentSortEpochMs(right) - getRecentSortEpochMs(left);
      if (byDate !== 0) {
        return byDate;
      }

      const byMtime = right.mtimeMs - left.mtimeMs;
      if (byMtime !== 0) {
        return byMtime;
      }

      return left.relNoExt.localeCompare(right.relNoExt, "ko-KR");
    })
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
      updatedDate: doc.updatedDate,
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

function pickSeoImageDefaults(
  seo: BuildOptions["seo"],
): { social: string | null; og: string | null; twitter: string | null } {
  if (!seo) {
    return { social: null, og: null, twitter: null };
  }

  const toAbsoluteImage = (value: unknown): string | null => {
    if (typeof value !== "string") {
      return null;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    try {
      return new URL(trimmed).toString();
    } catch {
      if (!trimmed.startsWith("/")) {
        return null;
      }
      return new URL(trimmed, `${seo.siteUrl}/`).toString();
    }
  };

  return {
    social: toAbsoluteImage(seo.defaultSocialImage),
    og: toAbsoluteImage(seo.defaultOgImage),
    twitter: toAbsoluteImage(seo.defaultTwitterImage),
  };
}

function buildStructuredData(route: string, doc: DocRecord | null, options: BuildOptions): unknown[] {
  const canonicalUrl = options.seo ? buildCanonicalUrl(route, options.seo) : undefined;
  const siteName = options.seo?.siteName ?? options.seo?.defaultTitle ?? DEFAULT_SITE_TITLE;

  if (!doc) {
    const websiteSchema: Record<string, string> = {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: siteName,
    };
    if (canonicalUrl) {
      websiteSchema.url = canonicalUrl;
    }
    return [websiteSchema];
  }

  const schemaType = /(^|\/)posts?\//i.test(doc.relNoExt) ? "BlogPosting" : "Article";
  const articleSchema: Record<string, string> = {
    "@context": "https://schema.org",
    "@type": schemaType,
    headline: doc.title,
  };

  if (canonicalUrl) {
    articleSchema.url = canonicalUrl;
  }
  if (doc.date) {
    articleSchema.datePublished = doc.date;
  }

  return [articleSchema];
}

function toRouteOutputPath(route: string): string {
  const clean = route.replace(/^\/+/, "").replace(/\/+$/, "");
  return clean ? `${clean}/index.html` : "index.html";
}

async function writeOutputIfChanged(
  context: OutputWriteContext,
  relOutputPath: string,
  content: string,
): Promise<void> {
  const outputHash = makeHash(content);
  context.nextHashes[relOutputPath] = outputHash;

  const outputPath = path.join(context.outDir, relOutputPath);
  const unchanged = context.previousHashes[relOutputPath] === outputHash;
  if (unchanged) {
    return;
  }

  await ensureDir(path.dirname(outputPath));
  await Bun.write(outputPath, content);
}

async function writeRuntimeAssets(context: OutputWriteContext): Promise<void> {
  const runtimeDir = path.join(import.meta.dir, "runtime");
  const runtimeJs = await Bun.file(path.join(runtimeDir, "app.js")).text();
  const runtimeCss = await Bun.file(path.join(runtimeDir, "app.css")).text();

  await writeOutputIfChanged(context, "assets/app.js", runtimeJs);
  await writeOutputIfChanged(context, "assets/app.css", runtimeCss);
}

function buildShellMeta(route: string, doc: DocRecord | null, options: BuildOptions): AppShellMeta {
  const defaultTitle = options.seo?.defaultTitle ?? DEFAULT_SITE_TITLE;
  const defaultDescription = options.seo?.defaultDescription ?? DEFAULT_SITE_DESCRIPTION;
  const description = typeof doc?.description === "string" && doc.description.trim().length > 0 ? doc.description.trim() : undefined;
  const canonicalUrl = options.seo ? buildCanonicalUrl(route, options.seo) : undefined;
  const title = doc?.title ?? defaultTitle;
  const imageDefaults = pickSeoImageDefaults(options.seo);
  const ogImage = imageDefaults.og ?? imageDefaults.social ?? undefined;
  const twitterImage = imageDefaults.twitter ?? imageDefaults.social ?? undefined;

  return {
    title,
    description,
    canonicalUrl,
    ogTitle: title,
    ogType: doc ? "article" : "website",
    ogSiteName: options.seo?.siteName,
    ogLocale: options.seo?.locale,
    ogUrl: canonicalUrl,
    ogDescription: description ?? defaultDescription,
    twitterCard: options.seo?.twitterCard ?? "summary",
    twitterTitle: title,
    twitterDescription: description ?? defaultDescription,
    twitterSite: options.seo?.twitterSite,
    twitterCreator: options.seo?.twitterCreator,
    ogImage,
    twitterImage,
    jsonLd: buildStructuredData(route, doc, options),
  };
}

async function writeShellPages(context: OutputWriteContext, docs: DocRecord[], options: BuildOptions): Promise<void> {
  const shell = renderAppShellHtml(buildShellMeta("/", null, options));
  await writeOutputIfChanged(context, "_app/index.html", shell);
  await writeOutputIfChanged(context, "index.html", shell);
  await writeOutputIfChanged(context, "404.html", render404Html());

  for (const doc of docs) {
    await writeOutputIfChanged(
      context,
      toRouteOutputPath(doc.route),
      renderAppShellHtml(buildShellMeta(doc.route, doc, options)),
    );
  }
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function buildSitemapXml(urls: string[]): string {
  const entries = urls.map((url) => `  <url><loc>${escapeXml(url)}</loc></url>`).join("\n");
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    entries,
    "</urlset>",
    "",
  ].join("\n");
}

async function writeSeoArtifacts(context: OutputWriteContext, docs: DocRecord[], options: BuildOptions): Promise<void> {
  if (!options.seo) {
    await removeFileIfExists(path.join(context.outDir, "robots.txt"));
    await removeFileIfExists(path.join(context.outDir, "sitemap.xml"));
    console.warn('[seo] Skipping robots.txt and sitemap.xml generation. Add "seo.siteUrl" to blog.config.* to enable SEO artifacts.');
    return;
  }

  const seo = options.seo;

  const routeSet = new Set<string>(["/"]);
  for (const doc of docs) {
    routeSet.add(doc.route);
  }

  const routes = Array.from(routeSet).sort((left, right) => left.localeCompare(right, "ko-KR"));
  const urls = routes.map((route) => buildCanonicalUrl(route, seo));
  const sitemapUrl = buildCanonicalUrl("/sitemap.xml", seo);
  const robotsTxt = ["User-agent: *", "Allow: /", `Sitemap: ${sitemapUrl}`, ""].join("\n");

  await writeOutputIfChanged(context, "robots.txt", robotsTxt);
  await writeOutputIfChanged(context, "sitemap.xml", buildSitemapXml(urls));
}

async function cleanRemovedOutputs(outDir: string, oldCache: BuildCache, currentDocs: DocRecord[]): Promise<void> {
  const currentIds = new Set(currentDocs.map((doc) => doc.id));
  const currentRouteById = new Map(currentDocs.map((doc) => [doc.id, doc.route]));

  for (const [id, entry] of Object.entries(oldCache.docs)) {
    if (currentIds.has(id)) {
      const currentRoute = currentRouteById.get(id);
      if (currentRoute && currentRoute !== entry.route) {
        const previousRouteDir = path.join(outDir, entry.route.replace(/^\//, "").replace(/\/$/, ""));
        const previousRouteIndex = path.join(previousRouteDir, "index.html");
        await removeFileIfExists(previousRouteIndex);
        await removeEmptyParents(previousRouteDir, outDir);
      }
      continue;
    }

    const legacyContentPath = path.join(outDir, "content", `${id}.html`);
    const hashedContentPath = path.join(outDir, "content", toContentFileName(id));
    await removeFileIfExists(legacyContentPath);
    await removeFileIfExists(hashedContentPath);

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

function buildWikiResolutionSignature(doc: DocRecord, lookup: WikiLookup): string {
  if (doc.wikiTargets.length === 0) {
    return "";
  }

  const segments: string[] = [];
  for (const target of doc.wikiTargets) {
    const resolved = resolveWikiTarget(lookup, target, doc, false);
    segments.push(`${target}->${resolved?.route ?? "null"}`);
  }
  return segments.join("|");
}

export async function buildSite(options: BuildOptions): Promise<BuildResult> {
  await ensureDir(options.outDir);
  await ensureDir(path.join(options.outDir, "content"));

  const cachePath = toCachePath();
  const previousCache = await readCache(cachePath);
  const canReuseOutputs = await fileExists(path.join(options.outDir, "manifest.json"));
  const previousDocs = canReuseOutputs ? previousCache.docs : {};
  const previousOutputHashes = canReuseOutputs ? previousCache.outputHashes : {};
  const { docs, nextSources } = await readPublishedDocs(options, previousCache.sources);
  docs.sort((a, b) => a.relNoExt.localeCompare(b.relNoExt, "ko-KR"));

  await cleanRemovedOutputs(options.outDir, previousCache, docs);
  const outputContext: OutputWriteContext = {
    outDir: options.outDir,
    previousHashes: previousOutputHashes,
    nextHashes: {},
  };
  await writeRuntimeAssets(outputContext);

  const tree = buildTree(docs, options);
  const manifest = buildManifest(docs, tree, options);
  await writeOutputIfChanged(outputContext, "manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);

  await writeShellPages(outputContext, docs, options);
  await writeSeoArtifacts(outputContext, docs, options);

  const markdownRenderer = await createMarkdownRenderer(options);
  const wikiLookup = createWikiLookup(docs);

  let renderedDocs = 0;
  let skippedDocs = 0;

  const nextCache: BuildCache = {
    version: CACHE_VERSION,
    sources: nextSources,
    docs: {},
    outputHashes: outputContext.nextHashes,
  };

  for (const doc of docs) {
    const wikiSignature = options.wikilinks ? buildWikiResolutionSignature(doc, wikiLookup) : "";
    const sourceHash = makeHash(
      [
        doc.rawHash,
        doc.route,
        options.shikiTheme,
        options.imagePolicy,
        options.wikilinks ? "wikilinks-on" : "wikilinks-off",
        wikiSignature,
      ].join("::"),
    );
    const previous = previousDocs[doc.id];
    const contentRelPath = `content/${toContentFileName(doc.id)}`;
    const outputPath = path.join(options.outDir, "content", toContentFileName(doc.id));
    const unchanged = previous?.hash === sourceHash && outputContext.previousHashes[contentRelPath] === sourceHash;

    nextCache.docs[doc.id] = {
      hash: sourceHash,
      route: doc.route,
      relPath: doc.relPath,
    };
    outputContext.nextHashes[contentRelPath] = sourceHash;

    if (unchanged) {
      skippedDocs += 1;
      continue;
    }

    const resolver = createWikiResolver(wikiLookup, doc);
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
