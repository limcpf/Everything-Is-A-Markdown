import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import type { BuildCache, BuildOptions, DocRecord, FileNode, FolderNode, Manifest, TreeNode, WikiResolver } from "./types";
import { createMarkdownRenderer } from "./markdown";
import { buildCanonicalUrl, escapeHtmlAttribute } from "./seo";
import { render404Html, renderAppShellHtml } from "./template";
import type { AppShellAssets, AppShellInitialView, AppShellMeta } from "./template";
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
  toPosixPath,
  toDocId,
} from "./utils";

const CACHE_VERSION = 6;
const CACHE_ROOT_SEGMENTS = [".cache", "eiam"] as const;
const CACHE_NAMESPACE_VERSION = 2;
const CACHE_FILE_NAME = "build-index.json";
const LEGACY_CACHE_PATH_SEGMENTS = [".cache", CACHE_FILE_NAME] as const;
const OUTPUT_MARKER_FILE_NAME = ".eiam-output.json";
const OUTPUT_MARKER_FORMAT = "everything-is-a-markdown-output";
const OUTPUT_MARKER_VERSION = 2;
const DEFAULT_BRANCH = "dev";
const DEFAULT_SITE_DESCRIPTION = "File-system style static blog with markdown explorer UI.";
const DEFAULT_SITE_TITLE = "File-System Blog";

type CachedSourceEntry = BuildCache["sources"][string];

interface OutputWriteContext {
  outDir: string;
  previousHashes: Record<string, string>;
  nextHashes: Record<string, string>;
}

interface RuntimeAssets {
  cssRelPath: string;
  jsRelPath: string;
}

interface WikiLookup {
  byPath: Map<string, DocRecord>;
  byPrefix: Map<string, DocRecord[]>;
  byTitle: Map<string, DocRecord[]>;
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

interface CacheLocation {
  namespace: string;
  rootDir: string;
  namespaceDir: string;
  cachePath: string;
}

function toContentFileName(id: string): string {
  return `${makeHash(id)}.html`;
}

function isSamePathOrAncestor(candidate: string, target: string): boolean {
  const relative = path.relative(candidate, target);
  return (
    relative === "" ||
    (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`))
  );
}

async function toCanonicalPath(input: string): Promise<string> {
  let existingAncestor = path.resolve(input);
  const missingSegments: string[] = [];

  while (true) {
    try {
      const canonicalAncestor = await fs.realpath(existingAncestor);
      return path.join(canonicalAncestor, ...missingSegments);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }

      const parent = path.dirname(existingAncestor);
      if (parent === existingAncestor) {
        return path.resolve(input);
      }
      missingSegments.unshift(path.basename(existingAncestor));
      existingAncestor = parent;
    }
  }
}

async function resolveCacheRoot(): Promise<string> {
  const canonicalCwd = await toCanonicalPath(process.cwd());
  let candidate = canonicalCwd;

  for (const segment of CACHE_ROOT_SEGMENTS) {
    candidate = path.join(candidate, segment);
    try {
      const candidateStat = await fs.lstat(candidate);
      if (candidateStat.isSymbolicLink()) {
        throw new Error(`[safety] Refusing symlinked cache path: ${candidate}`);
      }
      if (!candidateStat.isDirectory()) {
        throw new Error(`[safety] Cache path component must be a real directory: ${candidate}`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }

  return candidate;
}

async function assertSafeCacheNamespace(namespaceDir: string): Promise<void> {
  try {
    const namespaceStat = await fs.lstat(namespaceDir);
    if (namespaceStat.isSymbolicLink()) {
      throw new Error(`[safety] Refusing symlinked cache namespace: ${namespaceDir}`);
    }
    if (!namespaceStat.isDirectory()) {
      throw new Error(`[safety] Cache namespace must be a real directory: ${namespaceDir}`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}

async function assertSafeCacheIndex(cachePath: string): Promise<void> {
  try {
    const cacheStat = await fs.lstat(cachePath);
    if (cacheStat.isSymbolicLink()) {
      throw new Error(`[safety] Refusing symlinked cache index: ${cachePath}`);
    }
    if (!cacheStat.isFile()) {
      throw new Error(`[safety] Cache index must be a real file: ${cachePath}`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}

async function assertSafeCacheLocation(location: CacheLocation): Promise<void> {
  await assertSafeCacheNamespace(location.namespaceDir);
  await assertSafeCacheIndex(location.cachePath);
}

async function resolveCacheLocation(options: BuildOptions): Promise<CacheLocation> {
  const [vaultRoot, outputRoot, rootDir] = await Promise.all([
    toCanonicalPath(options.vaultDir),
    toCanonicalPath(options.outDir),
    resolveCacheRoot(),
  ]);
  const namespace = `v${CACHE_NAMESPACE_VERSION}-${makeHash(`${vaultRoot}\0${outputRoot}\0${rootDir}`)}`;
  const namespaceDir = path.join(rootDir, namespace);
  const location = {
    namespace,
    rootDir,
    namespaceDir,
    cachePath: path.join(namespaceDir, CACHE_FILE_NAME),
  };
  await assertSafeCacheLocation(location);

  return location;
}

async function assertSafeOutputRoot(outDir: string, vaultDir: string, cacheRoot: string): Promise<string> {
  const outputRoot = await toCanonicalPath(outDir);
  const filesystemRoot = path.parse(outputRoot).root;
  const cwd = await toCanonicalPath(process.cwd());
  const vaultRoot = await toCanonicalPath(vaultDir);

  if (
    outputRoot === filesystemRoot ||
    isSamePathOrAncestor(outputRoot, cwd) ||
    isSamePathOrAncestor(outputRoot, vaultRoot) ||
    isSamePathOrAncestor(outputRoot, cacheRoot) ||
    isSamePathOrAncestor(cacheRoot, outputRoot)
  ) {
    throw new Error(
      `[safety] Refusing dangerous output directory: ${outputRoot}. Choose a dedicated child directory.`,
    );
  }

  return outputRoot;
}

async function hasValidOutputMarker(outputRoot: string, cacheNamespace: string): Promise<boolean> {
  const markerPath = path.join(outputRoot, OUTPUT_MARKER_FILE_NAME);

  try {
    const markerStat = await fs.lstat(markerPath);
    if (!markerStat.isFile() || markerStat.isSymbolicLink()) {
      return false;
    }

    const parsed = (await Bun.file(markerPath).json()) as unknown;
    return (
      isRecord(parsed) &&
      parsed.format === OUTPUT_MARKER_FORMAT &&
      parsed.version === OUTPUT_MARKER_VERSION &&
      parsed.cacheNamespace === cacheNamespace
    );
  } catch {
    return false;
  }
}

async function writeOutputMarker(outputRoot: string, cacheNamespace: string): Promise<void> {
  const marker = {
    format: OUTPUT_MARKER_FORMAT,
    version: OUTPUT_MARKER_VERSION,
    cacheNamespace,
  };
  await Bun.write(path.join(outputRoot, OUTPUT_MARKER_FILE_NAME), `${JSON.stringify(marker, null, 2)}\n`);
}

async function prepareOwnedOutputDirectory(
  options: BuildOptions,
  cacheLocation: CacheLocation,
  outputRoot: string,
): Promise<void> {
  await assertClaimableOutputDirectory(options, cacheLocation, outputRoot);

  const requestedOutputRoot = path.resolve(options.outDir);
  await fs.mkdir(requestedOutputRoot, { recursive: true });

  if (!(await hasValidOutputMarker(outputRoot, cacheLocation.namespace))) {
    await writeOutputMarker(outputRoot, cacheLocation.namespace);
  }
}

async function assertClaimableOutputDirectory(
  options: BuildOptions,
  cacheLocation: CacheLocation,
  outputRoot: string,
): Promise<void> {
  const requestedOutputRoot = path.resolve(options.outDir);

  try {
    const outputStat = await fs.lstat(requestedOutputRoot);
    if (!outputStat.isDirectory() || outputStat.isSymbolicLink()) {
      throw new Error(`[safety] Output path must be a real directory: ${outputRoot}`);
    }

    const entries = await fs.readdir(outputRoot);
    if (entries.length > 0 && !(await hasValidOutputMarker(outputRoot, cacheLocation.namespace))) {
      throw new Error(
        `[safety] Refusing non-empty output directory without a matching ${OUTPUT_MARKER_FILE_NAME} for the requested vault/output/cache-root context: ${outputRoot}`,
      );
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}

async function removeLegacyCacheIndex(): Promise<void> {
  const legacyCachePath = path.join(process.cwd(), ...LEGACY_CACHE_PATH_SEGMENTS);

  try {
    const legacyCacheStat = await fs.lstat(legacyCachePath);
    if (!legacyCacheStat.isFile() || legacyCacheStat.isSymbolicLink()) {
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(await fs.readFile(legacyCachePath, "utf8")) as unknown;
    } catch (error) {
      if (error instanceof SyntaxError) {
        return;
      }
      throw error;
    }

    if (isLegacyEiamCacheIndex(parsed)) {
      await fs.rm(legacyCachePath, { force: true });
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}

async function removeCacheNamespace(location: CacheLocation): Promise<void> {
  await assertSafeCacheLocation(location);
  await fs.rm(location.namespaceDir, { recursive: true, force: true });
  try {
    await fs.rmdir(location.rootDir);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT" && code !== "ENOTEMPTY") {
      throw error;
    }
  }
}

function createEmptyCache(): BuildCache {
  return { version: CACHE_VERSION, sources: {}, docs: {}, outputHashes: {} };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasExactRecordKeys(value: Record<string, unknown>, expectedKeys: string[]): boolean {
  const actualKeys = Object.keys(value).sort();
  return (
    actualKeys.length === expectedKeys.length && actualKeys.every((key, index) => key === expectedKeys[index])
  );
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && !Array.isArray(value);
}

function isLegacyEiamCacheIndex(value: unknown): boolean {
  if (!isPlainRecord(value) || !Number.isInteger(value.version)) {
    return false;
  }

  if (value.version === 1) {
    return hasExactRecordKeys(value, ["docs", "version"]) && isPlainRecord(value.docs);
  }

  return (
    typeof value.version === "number" &&
    value.version >= 2 &&
    value.version <= 5 &&
    hasExactRecordKeys(value, ["docs", "outputHashes", "sources", "version"]) &&
    isPlainRecord(value.sources) &&
    isPlainRecord(value.docs) &&
    isPlainRecord(value.outputHashes)
  );
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
  const prefix = typeof value.prefix === "string" && value.prefix.trim().length > 0 ? value.prefix.trim() : undefined;
  const categoryPath = normalizeCategoryPath(value.categoryPath);
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
    prefix,
    categoryPath,
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

async function readCache(location: CacheLocation): Promise<BuildCache> {
  await assertSafeCacheLocation(location);
  const file = Bun.file(location.cachePath);
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

async function writeCache(location: CacheLocation, cache: BuildCache): Promise<void> {
  await assertSafeCacheLocation(location);
  await ensureDir(location.namespaceDir);
  await assertSafeCacheLocation(location);
  await Bun.write(location.cachePath, `${JSON.stringify(cache, null, 2)}\n`);
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

function normalizeCategoryPath(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join("/");

  return normalized.length > 0 ? normalized : undefined;
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

function pickDocPrefix(frontmatter: Record<string, unknown>, raw: string): string | undefined {
  const literal = extractFrontmatterScalar(raw, "prefix");
  if (literal) {
    return literal;
  }

  const value = frontmatter.prefix;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return undefined;
}

function pickDocCategoryPath(frontmatter: Record<string, unknown>, raw: string): string | undefined {
  const literal = normalizeCategoryPath(extractFrontmatterScalar(raw, "category_path"));
  if (literal) {
    return literal;
  }

  return normalizeCategoryPath(frontmatter.category_path);
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

function toPrefixRoute(prefix: string): string {
  const normalized = prefix
    .normalize("NFKC")
    .trim()
    .replace(/['’]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/\//g, "-")
    .replace(/[^\p{Letter}\p{Number}-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `/${normalized || "untitled"}/`;
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

function makeSourceFingerprint(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function toCachedSourceEntry(
  raw: string,
  rawHash: string,
  parsed: matter.GrayMatterFile<string>,
): CachedSourceEntry {
  return {
    mtimeMs: 0,
    size: 0,
    rawHash,
    publish: parsed.data.publish === true,
    draft: parsed.data.draft === true,
    title: typeof parsed.data.title === "string" && parsed.data.title.trim().length > 0 ? parsed.data.title.trim() : undefined,
    prefix: pickDocPrefix(parsed.data as Record<string, unknown>, raw),
    categoryPath: pickDocCategoryPath(parsed.data as Record<string, unknown>, raw),
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
    route: toPrefixRoute(entry.prefix ?? ""),
    contentUrl: `/content/${toContentFileName(id)}`,
    fileName,
    title: entry.title ?? makeTitleFromFileName(fileName),
    prefix: entry.prefix,
    categoryPath: entry.categoryPath ?? "",
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
    const raw = await Bun.file(sourcePath).text();
    const rawHash = makeSourceFingerprint(raw);

    let entry: CachedSourceEntry;
    const canReuse = !!prev && prev.rawHash === rawHash;
    if (canReuse) {
      entry = prev;
    } else {
      let parsed: matter.GrayMatterFile<string>;
      try {
        parsed = matter(raw);
      } catch (error) {
        throw new Error(`Frontmatter parse failed: ${relPath}\n${(error as Error).message}`);
      }

      entry = toCachedSourceEntry(raw, rawHash, parsed);
    }

    const completeEntry: CachedSourceEntry = {
      ...entry,
      mtimeMs: stat.mtimeMs,
      size: stat.size,
    };
    if (!completeEntry.publish || completeEntry.draft) {
      continue;
    }

    if (!completeEntry.prefix) {
      console.warn(`[publish] Skipped published doc without prefix: ${relPath}`);
      continue;
    }

    if (!completeEntry.categoryPath) {
      console.warn(`[publish] Skipped published doc without category_path: ${relPath}`);
      continue;
    }

    nextSources[relPath] = completeEntry;
    docs.push(toDocRecord(sourcePath, relPath, completeEntry, newThreshold));
  }

  ensureUniqueRoutes(docs);
  return { docs, nextSources };
}

function createWikiLookup(docs: DocRecord[]): WikiLookup {
  const byPath = new Map<string, DocRecord>();
  const byPrefix = new Map<string, DocRecord[]>();
  const byTitle = new Map<string, DocRecord[]>();
  const byStem = new Map<string, DocRecord[]>();

  for (const doc of docs) {
    byPath.set(doc.relNoExt.toLowerCase(), doc);
    if (doc.prefix) {
      const prefixKey = normalizeWikiTarget(doc.prefix);
      const prefixBucket = byPrefix.get(prefixKey) ?? [];
      prefixBucket.push(doc);
      byPrefix.set(prefixKey, prefixBucket);
    }
    const titleKey = normalizeWikiTarget(doc.title);
    if (titleKey) {
      const titleBucket = byTitle.get(titleKey) ?? [];
      titleBucket.push(doc);
      byTitle.set(titleKey, titleBucket);
    }
    const stem = path.basename(doc.relNoExt).toLowerCase();
    const bucket = byStem.get(stem) ?? [];
    bucket.push(doc);
    byStem.set(stem, bucket);
  }

  return { byPath, byPrefix, byTitle, byStem };
}

function resolveWikiTargetDoc(
  lookup: WikiLookup,
  input: string,
  currentDoc: DocRecord,
  warnOnDuplicate: boolean,
): DocRecord | null {
  const normalized = normalizeWikiTarget(input);
  if (!normalized) {
    return null;
  }

  const direct = lookup.byPath.get(normalized);
  if (direct) {
    return direct;
  }

  const prefixMatches = lookup.byPrefix.get(normalized) ?? [];
  if (prefixMatches.length === 1) {
    return prefixMatches[0];
  }

  if (warnOnDuplicate && prefixMatches.length > 1) {
    console.warn(
      `[wikilink] Duplicate prefix target "${input}" in ${currentDoc.relPath}. Candidates: ${prefixMatches
        .map((item) => item.relPath)
        .join(", ")}`,
    );
    return null;
  }

  const titleMatches = lookup.byTitle.get(normalized) ?? [];
  if (titleMatches.length === 1) {
    return titleMatches[0];
  }

  if (warnOnDuplicate && titleMatches.length > 1) {
    console.warn(
      `[wikilink] Duplicate title target "${input}" in ${currentDoc.relPath}. Candidates: ${titleMatches
        .map((item) => item.relPath)
        .join(", ")}`,
    );
    return null;
  }

  if (normalized.includes("/")) {
    return null;
  }

  const stemMatches = lookup.byStem.get(normalized) ?? [];
  if (stemMatches.length === 1) {
    return stemMatches[0];
  }

  if (warnOnDuplicate && stemMatches.length > 1) {
    console.warn(
      `[wikilink] Duplicate target "${input}" in ${currentDoc.relPath}. Candidates: ${stemMatches.map((item) => item.relPath).join(", ")}`,
    );
  }

  return null;
}

function resolveWikiTarget(
  lookup: WikiLookup,
  input: string,
  currentDoc: DocRecord,
  warnOnDuplicate: boolean,
): { route: string; label: string } | null {
  const resolved = resolveWikiTargetDoc(lookup, input, currentDoc, warnOnDuplicate);
  if (!resolved) {
    return null;
  }

  return { route: resolved.route, label: resolved.title };
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
    prefix: doc.prefix,
    route: doc.route,
    contentUrl: doc.contentUrl,
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

function pickHomeDoc(docs: DocRecord[]): DocRecord | null {
  const inDefaultBranch = docs.filter((doc) => doc.branch == null || doc.branch === DEFAULT_BRANCH);
  const candidates = inDefaultBranch.length > 0 ? inDefaultBranch : docs;
  const byRoute = candidates.find((doc) => doc.route === "/index/");
  if (byRoute) {
    return byRoute;
  }

  return [...candidates].sort(compareByRecentDateThenPath)[0] ?? null;
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

function buildManifest(docs: DocRecord[], tree: TreeNode[], options: BuildOptions): Manifest {
  const routeMap: Record<string, string> = {};
  for (const doc of docs) {
    routeMap[doc.route] = doc.id;
  }

  const wikiLookup = createWikiLookup(docs);
  const backlinksByDocId = buildBacklinksByDocId(docs, wikiLookup);

  const docsForManifest = docs.map((doc) => ({
    id: doc.id,
    route: doc.route,
    title: doc.title,
    prefix: doc.prefix,
    categoryPath: doc.categoryPath,
    date: doc.date,
    updatedDate: doc.updatedDate,
    tags: doc.tags,
    description: doc.description,
    isNew: doc.isNew,
    contentUrl: doc.contentUrl,
    branch: doc.branch,
    wikiTargets: doc.wikiTargets,
    backlinks: backlinksByDocId.get(doc.id) ?? [],
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
    docs: docsForManifest,
  };
}

function resolveSiteTitle(options: BuildOptions): string {
  const value = options.siteTitle ?? options.seo?.siteName ?? options.seo?.defaultTitle ?? DEFAULT_SITE_TITLE;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : DEFAULT_SITE_TITLE;
}

function composeDocumentTitle(pageTitle: string, siteTitle: string): string {
  const left = pageTitle.trim();
  const right = siteTitle.trim();
  if (!left) {
    return right || DEFAULT_SITE_TITLE;
  }
  if (!right || left === right) {
    return left;
  }
  return `${left} - ${right}`;
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
  if (unchanged && (await Bun.file(outputPath).exists())) {
    return;
  }

  await ensureDir(path.dirname(outputPath));
  await Bun.write(outputPath, content);
}

async function copyOutputFileIfChanged(
  context: OutputWriteContext,
  relOutputPath: string,
  sourcePath: string,
): Promise<void> {
  assertSafeStaticOutputPath(relOutputPath);
  const bytes = new Uint8Array(await Bun.file(sourcePath).arrayBuffer());
  const outputHash = crypto.createHash("sha1").update(bytes).digest("hex");
  context.nextHashes[relOutputPath] = outputHash;

  const outputPath = path.join(context.outDir, relOutputPath);
  const unchanged = context.previousHashes[relOutputPath] === outputHash;
  if (unchanged && (await Bun.file(outputPath).exists())) {
    return;
  }

  await ensureDir(path.dirname(outputPath));
  await Bun.write(outputPath, bytes);
}

function assertSafeStaticOutputPath(relOutputPath: string): void {
  const normalized = path.posix.normalize(toPosixPath(relOutputPath));
  if (normalized === ".") {
    throw new Error(`[safety] Refusing static path that resolves to the vault root: ${relOutputPath}`);
  }
  if (normalized === ".." || normalized.startsWith("../") || path.posix.isAbsolute(normalized)) {
    throw new Error(`[safety] Refusing static output path outside the output directory: ${relOutputPath}`);
  }
  if (normalized === OUTPUT_MARKER_FILE_NAME || normalized.startsWith(`${OUTPUT_MARKER_FILE_NAME}/`)) {
    throw new Error(`[safety] Refusing reserved static output path: ${relOutputPath}`);
  }
}

function assertSafeStaticPaths(options: BuildOptions): void {
  for (const staticPath of options.staticPaths) {
    assertSafeStaticOutputPath(staticPath);
  }
}

async function listFilesRecursively(baseDir: string): Promise<string[]> {
  const entries = await fs.readdir(baseDir, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name, "ko-KR"));

  const files: string[] = [];
  for (const entry of entries) {
    const absolutePath = path.join(baseDir, entry.name);
    if (entry.isDirectory()) {
      const children = await listFilesRecursively(absolutePath);
      for (const child of children) {
        files.push(path.join(entry.name, child));
      }
      continue;
    }

    if (entry.isFile()) {
      files.push(entry.name);
    }
  }

  return files;
}

async function copyStaticPaths(context: OutputWriteContext, options: BuildOptions): Promise<void> {
  for (const staticPath of options.staticPaths) {
    const sourcePath = path.resolve(options.vaultDir, staticPath);

    let sourceStat;
    try {
      sourceStat = await fs.stat(sourcePath);
    } catch {
      console.warn(`[static] path not found: ${staticPath}`);
      continue;
    }

    if (sourceStat.isDirectory()) {
      const files = await listFilesRecursively(sourcePath);
      for (const file of files) {
        const relFilePath = toPosixPath(file);
        const relOutputPath = path.posix.join(staticPath, relFilePath);
        const filePath = path.join(sourcePath, file);
        await copyOutputFileIfChanged(context, relOutputPath, filePath);
      }
      continue;
    }

    if (sourceStat.isFile()) {
      await copyOutputFileIfChanged(context, staticPath, sourcePath);
      continue;
    }

    console.warn(`[static] unsupported path type, skipped: ${staticPath}`);
  }
}

async function removeStaleOutputs(context: OutputWriteContext): Promise<void> {
  for (const previousPath of Object.keys(context.previousHashes)) {
    if (Object.hasOwn(context.nextHashes, previousPath)) {
      continue;
    }

    const outputPath = path.join(context.outDir, previousPath);
    await removeFileIfExists(outputPath);
    await removeEmptyParents(path.dirname(outputPath), context.outDir);
  }
}

function toRelativeAssetPath(fromOutputPath: string, assetOutputPath: string): string {
  const fromDir = path.posix.dirname(fromOutputPath);
  const relative = path.posix.relative(fromDir, assetOutputPath);
  return relative.length > 0 ? relative : path.posix.basename(assetOutputPath);
}

function buildAppShellAssetsForOutput(outputPath: string, runtimeAssets: RuntimeAssets): AppShellAssets {
  return {
    cssHref: toRelativeAssetPath(outputPath, runtimeAssets.cssRelPath),
    jsSrc: toRelativeAssetPath(outputPath, runtimeAssets.jsRelPath),
  };
}

async function bundleRuntimeJs(entrypoint: string): Promise<string> {
  const result = await Bun.build({
    entrypoints: [entrypoint],
    target: "browser",
    format: "esm",
    splitting: false,
    sourcemap: "none",
    minify: true,
  });

  if (!result.success) {
    const details = result.logs.map((log) => String(log)).filter(Boolean).join("\n");
    throw new Error(`Failed to bundle runtime app.js${details ? `:\n${details}` : ""}`);
  }

  const output = result.outputs.find((artifact) => artifact.path.endsWith(".js")) ?? result.outputs[0];
  if (!output) {
    throw new Error("Failed to bundle runtime app.js: no JavaScript output was produced");
  }

  return output.text();
}

async function bundleRuntimeCss(entrypoint: string): Promise<string> {
  const result = await Bun.build({
    entrypoints: [entrypoint],
    target: "browser",
    sourcemap: "none",
    minify: true,
  });

  if (!result.success) {
    const details = result.logs.map((log) => String(log)).filter(Boolean).join("\n");
    throw new Error(`Failed to bundle runtime app.css${details ? `:\n${details}` : ""}`);
  }

  const output = result.outputs.find((artifact) => artifact.path.endsWith(".css")) ?? result.outputs[0];
  if (!output) {
    throw new Error("Failed to bundle runtime app.css: no CSS output was produced");
  }

  return output.text();
}

async function writeRuntimeAssets(context: OutputWriteContext): Promise<RuntimeAssets> {
  const runtimeDir = path.join(import.meta.dir, "runtime");
  const runtimeJs = await bundleRuntimeJs(path.join(runtimeDir, "app.js"));
  const runtimeCss = await bundleRuntimeCss(path.join(runtimeDir, "app.css"));

  const jsRelPath = `assets/app.${makeHash(runtimeJs).slice(0, 12)}.js`;
  const cssRelPath = `assets/app.${makeHash(runtimeCss).slice(0, 12)}.css`;

  for (const previousPath of Object.keys(context.previousHashes)) {
    const isLegacyRuntimeAsset =
      previousPath.startsWith("assets/app") &&
      (previousPath.endsWith(".js") || previousPath.endsWith(".css")) &&
      previousPath !== jsRelPath &&
      previousPath !== cssRelPath;
    if (!isLegacyRuntimeAsset) {
      continue;
    }
    await removeFileIfExists(path.join(context.outDir, previousPath));
  }

  await writeOutputIfChanged(context, jsRelPath, runtimeJs);
  await writeOutputIfChanged(context, cssRelPath, runtimeCss);

  return {
    cssRelPath,
    jsRelPath,
  };
}

function buildShellMeta(route: string, doc: DocRecord | null, options: BuildOptions): AppShellMeta {
  const defaultTitle = options.seo?.defaultTitle ?? options.siteTitle ?? DEFAULT_SITE_TITLE;
  const siteTitle = resolveSiteTitle(options);
  const defaultDescription = options.seo?.defaultDescription ?? DEFAULT_SITE_DESCRIPTION;
  const description = typeof doc?.description === "string" && doc.description.trim().length > 0 ? doc.description.trim() : undefined;
  const canonicalUrl = options.seo ? buildCanonicalUrl(route, options.seo) : undefined;
  const baseTitle = doc?.title ?? defaultTitle;
  const title = composeDocumentTitle(baseTitle, siteTitle);
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

function renderInitialBreadcrumb(route: string): string {
  const parts = route.split("/").filter(Boolean);
  const allItems = ["~", ...parts];
  return allItems
    .map((part, index) => {
      const isCurrent = index === allItems.length - 1 && allItems.length > 1;
      const escapedPart = escapeHtmlAttribute(part);
      if (isCurrent) {
        return `<span class="breadcrumb-current" aria-current="page">${escapedPart}</span>`;
      }
      return `<span class="breadcrumb-item">${escapedPart}</span>`;
    })
    .join('<span class="material-symbols-outlined breadcrumb-sep">chevron_right</span>');
}

function formatMetaDateTime(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    return null;
  }

  const yyyy = parsed.getFullYear();
  const mm = String(parsed.getMonth() + 1).padStart(2, "0");
  const dd = String(parsed.getDate()).padStart(2, "0");
  const hh = String(parsed.getHours()).padStart(2, "0");
  const mi = String(parsed.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

function normalizeTags(tags: string[]): string[] {
  return tags.map((tag) => String(tag).trim().replace(/^#+/, "")).filter(Boolean);
}

function renderInitialMeta(doc: DocRecord): string {
  const items: string[] = [];

  if (doc.prefix) {
    items.push(`<span class="meta-item meta-prefix">${escapeHtmlAttribute(doc.prefix)}</span>`);
  }

  const createdAt = formatMetaDateTime(doc.date);
  if (createdAt) {
    items.push(
      `<span class="meta-item"><span class="material-symbols-outlined">calendar_today</span>${escapeHtmlAttribute(createdAt)}</span>`,
    );
  }

  const tags = normalizeTags(doc.tags);
  if (tags.length > 0) {
    const tagsStr = tags.map((tag) => `#${escapeHtmlAttribute(tag)}`).join(" ");
    items.push(`<span class="meta-item meta-tags">${tagsStr}</span>`);
  }

  return items.join("");
}

function toPathWithBase(pathname: string, pathBase: string): string {
  const cleanBase = pathBase.trim().replace(/\\/g, "/");
  const normalizedBase = !cleanBase || cleanBase === "/"
    ? ""
    : `/${cleanBase.replace(/^\/+/, "").replace(/\/+$/, "")}`;
  if (!normalizedBase) {
    return pathname;
  }

  if (pathname === "/") {
    return `${normalizedBase}/`;
  }
  const normalizedPathname = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${normalizedBase}${normalizedPathname}`;
}

function renderInitialNav(docs: DocRecord[], currentId: string, pathBase: string): string {
  const currentIndex = docs.findIndex((doc) => doc.id === currentId);
  if (currentIndex === -1) {
    return "";
  }

  const prev = currentIndex > 0 ? docs[currentIndex - 1] : null;
  const next = currentIndex < docs.length - 1 ? docs[currentIndex + 1] : null;

  let html = "";
  if (prev) {
    html += `<a href="${escapeHtmlAttribute(toPathWithBase(prev.route, pathBase))}" class="nav-link nav-link-prev" data-route="${escapeHtmlAttribute(prev.route)}"><div class="nav-link-label"><span class="material-symbols-outlined">arrow_back</span>Previous</div><div class="nav-link-title">${escapeHtmlAttribute(prev.title)}</div></a>`;
  }
  if (next) {
    html += `<a href="${escapeHtmlAttribute(toPathWithBase(next.route, pathBase))}" class="nav-link nav-link-next" data-route="${escapeHtmlAttribute(next.route)}"><div class="nav-link-label">Next<span class="material-symbols-outlined">arrow_forward</span></div><div class="nav-link-title">${escapeHtmlAttribute(next.title)}</div></a>`;
  }

  return html;
}

function renderInitialBacklinks(backlinks: Manifest["docs"][number]["backlinks"], pathBase: string): string {
  if (backlinks.length === 0) {
    return "";
  }

  let html = '<h2 class="backlinks-title">Backlinks</h2><ul class="backlinks-list">';
  for (const backlink of backlinks) {
    const prefixHtml = backlink.prefix
      ? `<span class="backlink-prefix">${escapeHtmlAttribute(backlink.prefix)}</span>`
      : "";
    html += `<li class="backlinks-item"><a href="${escapeHtmlAttribute(toPathWithBase(backlink.route, pathBase))}" class="backlink-link" data-route="${escapeHtmlAttribute(backlink.route)}">${prefixHtml}<span class="backlink-text">${escapeHtmlAttribute(backlink.title)}</span></a></li>`;
  }
  html += "</ul>";
  return html;
}

function buildInitialView(
  doc: DocRecord,
  docs: DocRecord[],
  contentHtml: string,
  manifestDocById: Map<string, Manifest["docs"][number]>,
  pathBase: string,
): AppShellInitialView {
  const manifestDoc = manifestDocById.get(doc.id);
  return {
    route: doc.route,
    docId: doc.id,
    title: doc.title,
    breadcrumbHtml: renderInitialBreadcrumb(doc.route),
    metaHtml: renderInitialMeta(doc),
    contentHtml,
    backlinksHtml: renderInitialBacklinks(manifestDoc?.backlinks ?? [], pathBase),
    navHtml: renderInitialNav(docs, doc.id, pathBase),
  };
}

async function writeShellPages(
  context: OutputWriteContext,
  docs: DocRecord[],
  manifest: Manifest,
  options: BuildOptions,
  runtimeAssets: RuntimeAssets,
  contentByDocId: Map<string, string>,
): Promise<void> {
  const manifestDocById = new Map(manifest.docs.map((doc) => [doc.id, doc]));
  const pathBase = options.seo?.pathBase ?? "";
  const indexDoc = pickHomeDoc(docs);
  const indexOutputPath = "index.html";
  const indexInitialView = indexDoc
    ? buildInitialView(indexDoc, docs, contentByDocId.get(indexDoc.id) ?? "", manifestDocById, pathBase)
    : null;
  const shell = renderAppShellHtml(
    buildShellMeta("/", null, options),
    buildAppShellAssetsForOutput(indexOutputPath, runtimeAssets),
    indexInitialView,
    manifest,
  );
  await writeOutputIfChanged(context, "_app/index.html", shell);
  await writeOutputIfChanged(context, indexOutputPath, shell);
  await writeOutputIfChanged(
    context,
    "404.html",
    render404Html(buildAppShellAssetsForOutput("404.html", runtimeAssets), toPathWithBase("/", pathBase)),
  );

  for (const doc of docs) {
    const routeOutputPath = toRouteOutputPath(doc.route);
    const initialView = buildInitialView(doc, docs, contentByDocId.get(doc.id) ?? "", manifestDocById, pathBase);
    await writeOutputIfChanged(
      context,
      routeOutputPath,
      renderAppShellHtml(
        buildShellMeta(doc.route, doc, options),
        buildAppShellAssetsForOutput(routeOutputPath, runtimeAssets),
        initialView,
        manifest,
      ),
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

export async function cleanBuildArtifacts(options: BuildOptions): Promise<void> {
  const cacheLocation = await resolveCacheLocation(options);
  const requestedOutputRoot = path.resolve(options.outDir);
  const outputRoot = await assertSafeOutputRoot(options.outDir, options.vaultDir, cacheLocation.rootDir);
  await removeLegacyCacheIndex();
  let hasOwnedOutput = false;

  try {
    const outputStat = await fs.lstat(requestedOutputRoot);
    if (!outputStat.isDirectory() || outputStat.isSymbolicLink()) {
      throw new Error(`[safety] Refusing to clean non-directory output path: ${outputRoot}`);
    }
    if (!(await hasValidOutputMarker(outputRoot, cacheLocation.namespace))) {
      throw new Error(
        `[safety] Refusing to clean output directory without a matching ${OUTPUT_MARKER_FILE_NAME} for the requested vault/output/cache-root context: ${outputRoot}`,
      );
    }
    hasOwnedOutput = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  if (hasOwnedOutput) {
    await fs.rm(requestedOutputRoot, { recursive: true, force: true });
  }
  await removeCacheNamespace(cacheLocation);
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

function buildBacklinksByDocId(
  docs: DocRecord[],
  lookup: WikiLookup,
): Map<string, Manifest["docs"][number]["backlinks"]> {
  const buckets = new Map<string, Map<string, Manifest["docs"][number]["backlinks"][number]>>();

  for (const doc of docs) {
    for (const target of doc.wikiTargets) {
      const targetDoc = resolveWikiTargetDoc(lookup, target, doc, false);
      if (!targetDoc || targetDoc.id === doc.id) {
        continue;
      }

      const bucket = buckets.get(targetDoc.id) ?? new Map<string, Manifest["docs"][number]["backlinks"][number]>();
      bucket.set(doc.id, {
        id: doc.id,
        route: doc.route,
        title: doc.title,
        prefix: doc.prefix,
      });
      buckets.set(targetDoc.id, bucket);
    }
  }

  const backlinksByDocId = new Map<string, Manifest["docs"][number]["backlinks"]>();
  for (const doc of docs) {
    const source = buckets.get(doc.id) ?? new Map<string, Manifest["docs"][number]["backlinks"][number]>();
    const backlinks = Array.from(source.values()).sort((left, right) =>
      left.route.localeCompare(right.route, "ko-KR"),
    );
    backlinksByDocId.set(doc.id, backlinks);
  }
  return backlinksByDocId;
}

export async function buildSite(options: BuildOptions): Promise<BuildResult> {
  const cacheLocation = await resolveCacheLocation(options);
  const outputRoot = await assertSafeOutputRoot(options.outDir, options.vaultDir, cacheLocation.rootDir);
  await removeLegacyCacheIndex();
  assertSafeStaticPaths(options);
  await assertClaimableOutputDirectory(options, cacheLocation, outputRoot);

  const previousCache = await readCache(cacheLocation);
  const canReuseOutputs = await fileExists(path.join(options.outDir, "manifest.json"));
  const previousDocs = canReuseOutputs ? previousCache.docs : {};
  const previousOutputHashes = canReuseOutputs ? previousCache.outputHashes : {};
  const { docs, nextSources } = await readPublishedDocs(options, previousCache.sources);
  docs.sort((a, b) => a.relNoExt.localeCompare(b.relNoExt, "ko-KR"));

  await prepareOwnedOutputDirectory(options, cacheLocation, outputRoot);
  await ensureDir(path.join(options.outDir, "content"));

  await cleanRemovedOutputs(options.outDir, previousCache, docs);
  const outputContext: OutputWriteContext = {
    outDir: options.outDir,
    previousHashes: previousOutputHashes,
    nextHashes: {},
  };
  const runtimeAssets = await writeRuntimeAssets(outputContext);
  await copyStaticPaths(outputContext, options);

  const tree = buildTree(docs, options);
  const manifest = buildManifest(docs, tree, options);
  await writeOutputIfChanged(outputContext, "manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);

  const markdownRenderer = await createMarkdownRenderer(options);
  const wikiLookup = createWikiLookup(docs);
  const contentByDocId = new Map<string, string>();

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
        options.allowUnsafeHtml ? "unsafe-html-v1" : "safe-html-v1",
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
      const outputFile = Bun.file(outputPath);
      if (await outputFile.exists()) {
        skippedDocs += 1;
        contentByDocId.set(doc.id, await outputFile.text());
        continue;
      }
    }

    const resolver = createWikiResolver(wikiLookup, doc);
    const renderResult = await markdownRenderer.render(doc.body, resolver);
    if (renderResult.warnings.length > 0) {
      for (const warning of renderResult.warnings) {
        console.warn(`[markdown] ${doc.relPath}: ${warning}`);
      }
    }

    await Bun.write(outputPath, renderResult.html);
    contentByDocId.set(doc.id, renderResult.html);
    renderedDocs += 1;
  }

  await writeShellPages(outputContext, docs, manifest, options, runtimeAssets, contentByDocId);
  await writeSeoArtifacts(outputContext, docs, options);
  await removeStaleOutputs(outputContext);

  await writeCache(cacheLocation, nextCache);

  return {
    totalDocs: docs.length,
    renderedDocs,
    skippedDocs,
  };
}
