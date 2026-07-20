import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { BuildCache, BuildOptions } from "../types";
import { ensureDir, fileExists, makeHash } from "../utils";
import type { BuildStorageState, BuildStorageTransaction, CacheLocation } from "./contracts";
import { normalizeCategoryPath } from "../publication";
import { parseBranch, parseStringArray } from "./source";
import { OUTPUT_MARKER_FILE_NAME } from "./shared";

const CACHE_VERSION = 6;
export const BUILD_CACHE_VERSION = CACHE_VERSION;
const CACHE_ROOT_SEGMENTS = [".cache", "eiam"] as const;
const CACHE_NAMESPACE_VERSION = 2;
const CACHE_FILE_NAME = "build-index.json";
const LEGACY_CACHE_PATH_SEGMENTS = [".cache", CACHE_FILE_NAME] as const;
const OUTPUT_MARKER_FORMAT = "everything-is-a-markdown-output";
const OUTPUT_MARKER_VERSION = 2;

type CachedSourceEntry = BuildCache["sources"][string];

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

async function assertSafeOutputRoot(
  outDir: string,
  vaultDir: string,
  cacheRoot: string,
): Promise<string> {
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
  await Bun.write(
    path.join(outputRoot, OUTPUT_MARKER_FILE_NAME),
    `${JSON.stringify(marker, null, 2)}\n`,
  );
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
    actualKeys.length === expectedKeys.length &&
    actualKeys.every((key, index) => key === expectedKeys[index])
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

  const mtimeMs =
    typeof value.mtimeMs === "number" && Number.isFinite(value.mtimeMs) ? value.mtimeMs : null;
  const size = typeof value.size === "number" && Number.isFinite(value.size) ? value.size : null;
  const rawHash = typeof value.rawHash === "string" ? value.rawHash : "";
  const publish = value.publish === true;
  const draft = value.draft === true;
  const title =
    typeof value.title === "string" && value.title.trim().length > 0
      ? value.title.trim()
      : undefined;
  const prefix =
    typeof value.prefix === "string" && value.prefix.trim().length > 0
      ? value.prefix.trim()
      : undefined;
  const categoryPath = normalizeCategoryPath(value.categoryPath);
  const date =
    typeof value.date === "string" && value.date.trim().length > 0 ? value.date.trim() : undefined;
  const updatedDate =
    typeof value.updatedDate === "string" && value.updatedDate.trim().length > 0
      ? value.updatedDate.trim()
      : undefined;
  const description =
    typeof value.description === "string" && value.description.trim().length > 0
      ? value.description.trim()
      : undefined;
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
  const temporaryCachePath = `${location.cachePath}.${process.pid}-${crypto.randomUUID()}.tmp`;
  try {
    await Bun.write(temporaryCachePath, `${JSON.stringify(cache, null, 2)}\n`);
    await fs.rename(temporaryCachePath, location.cachePath);
  } finally {
    await fs.rm(temporaryCachePath, { force: true });
  }
}

function createTransactionPath(outputRoot: string, kind: "backup" | "staging", token: string) {
  return path.join(path.dirname(outputRoot), `.${path.basename(outputRoot)}.eiam-${kind}-${token}`);
}

async function outputDirectoryExists(outputRoot: string): Promise<boolean> {
  try {
    const outputStat = await fs.lstat(outputRoot);
    return outputStat.isDirectory() && !outputStat.isSymbolicLink();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

export async function cleanBuildArtifacts(options: BuildOptions): Promise<void> {
  const cacheLocation = await resolveCacheLocation(options);
  const requestedOutputRoot = path.resolve(options.outDir);
  const outputRoot = await assertSafeOutputRoot(
    options.outDir,
    options.vaultDir,
    cacheLocation.rootDir,
  );
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

export async function inspectBuildStorage(options: BuildOptions): Promise<BuildStorageState> {
  const cacheLocation = await resolveCacheLocation(options);
  const outputRoot = await assertSafeOutputRoot(
    options.outDir,
    options.vaultDir,
    cacheLocation.rootDir,
  );
  await removeLegacyCacheIndex();
  await assertClaimableOutputDirectory(options, cacheLocation, outputRoot);

  const previousCache = await readCache(cacheLocation);
  const canReuseOutputs = await fileExists(path.join(options.outDir, "manifest.json"));
  return {
    cacheLocation,
    outputRoot,
    previousCache,
    previousDocs: canReuseOutputs ? previousCache.docs : {},
    previousOutputHashes: canReuseOutputs ? previousCache.outputHashes : {},
  };
}

export async function beginBuildStorageTransaction(
  options: BuildOptions,
  storage: BuildStorageState,
): Promise<BuildStorageTransaction> {
  await assertClaimableOutputDirectory(options, storage.cacheLocation, storage.outputRoot);

  const token = `${process.pid}-${crypto.randomUUID()}`;
  const transaction: BuildStorageTransaction = {
    cacheLocation: storage.cacheLocation,
    outputRoot: storage.outputRoot,
    stagingRoot: createTransactionPath(storage.outputRoot, "staging", token),
    backupRoot: createTransactionPath(storage.outputRoot, "backup", token),
    hadPreviousOutput: await outputDirectoryExists(storage.outputRoot),
  };

  await ensureDir(path.dirname(storage.outputRoot));
  try {
    if (transaction.hadPreviousOutput) {
      await fs.cp(storage.outputRoot, transaction.stagingRoot, {
        errorOnExist: true,
        force: false,
        recursive: true,
      });
    } else {
      await fs.mkdir(transaction.stagingRoot);
    }

    if (!(await hasValidOutputMarker(transaction.stagingRoot, storage.cacheLocation.namespace))) {
      await writeOutputMarker(transaction.stagingRoot, storage.cacheLocation.namespace);
    }
    await ensureDir(path.join(transaction.stagingRoot, "content"));
    return transaction;
  } catch (error) {
    await fs.rm(transaction.stagingRoot, { force: true, recursive: true });
    throw error;
  }
}

async function rollbackBuildStorageTransaction(
  transaction: BuildStorageTransaction,
  previousMoved: boolean,
  stagedPublished: boolean,
): Promise<void> {
  if (stagedPublished) {
    await fs.rename(transaction.outputRoot, transaction.stagingRoot);
  }
  if (previousMoved) {
    await fs.rename(transaction.backupRoot, transaction.outputRoot);
  }
}

export async function commitBuildStorageTransaction(
  transaction: BuildStorageTransaction,
  cache: BuildCache,
): Promise<void> {
  let previousMoved = false;
  let stagedPublished = false;

  try {
    if (transaction.hadPreviousOutput) {
      await fs.rename(transaction.outputRoot, transaction.backupRoot);
      previousMoved = true;
    }
    await fs.rename(transaction.stagingRoot, transaction.outputRoot);
    stagedPublished = true;
    await writeCache(transaction.cacheLocation, cache);
  } catch (error) {
    try {
      await rollbackBuildStorageTransaction(transaction, previousMoved, stagedPublished);
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        `[build] Failed to publish staged output and restore the previous output. Backup retained at ${transaction.backupRoot}`,
        { cause: rollbackError },
      );
    }
    throw error;
  }

  if (previousMoved) {
    try {
      await fs.rm(transaction.backupRoot, { force: true, recursive: true });
    } catch (error) {
      console.warn(
        `[build] Published output but could not remove transaction backup ${transaction.backupRoot}: ${String(error)}`,
      );
    }
  }
}

export async function abortBuildStorageTransaction(
  transaction: BuildStorageTransaction,
): Promise<void> {
  await fs.rm(transaction.stagingRoot, { force: true, recursive: true });
}
