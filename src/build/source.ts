import path from "node:path";
import {
  evaluatePublication,
  formatPublicationDiagnostic,
  parsePublicationSource,
  scanMarkdownSources,
  type ParsedPublicationSource,
} from "../publication";
import type { BuildCache, BuildOptions, DocRecord, ManifestDoc, WikiResolver } from "../types";
import { makeHash, makeTitleFromFileName, stripMdExt, toDocId } from "../utils";
import type { ReadDocsResult, WikiLookup } from "./contracts";
import { toContentFileName } from "./shared";

export { normalizeCategoryPath } from "../publication";

type CachedSourceEntry = BuildCache["sources"][string];

export function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => String(item).trim()).filter(Boolean);
}

export function parseBranch(value: unknown): string | null {
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
  const sorted = [...docs].sort((left, right) =>
    left.relNoExt.localeCompare(right.relNoExt, "ko-KR"),
  );

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

function toCachedSourceEntry(parsed: ParsedPublicationSource): CachedSourceEntry {
  const { source, frontmatter, content, metadata } = parsed;
  return {
    mtimeMs: 0,
    size: 0,
    rawHash: source.rawHash,
    publish: metadata.publish,
    draft: metadata.draft,
    title:
      typeof frontmatter.title === "string" && frontmatter.title.trim().length > 0
        ? frontmatter.title.trim()
        : undefined,
    prefix: metadata.prefix,
    categoryPath: metadata.categoryPath,
    date: pickDocDate(frontmatter, source.raw),
    updatedDate: pickDocUpdatedDate(frontmatter, source.raw),
    description:
      typeof frontmatter.description === "string"
        ? frontmatter.description.trim() || undefined
        : undefined,
    tags: parseStringArray(frontmatter.tags),
    branch: parseBranch(frontmatter.branch),
    body: content,
    wikiTargets: extractWikiTargets(content),
  };
}

function toDocRecord(sourcePath: string, relPath: string, entry: CachedSourceEntry): DocRecord {
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
    branch: entry.branch,
  };
}

export async function readPublishedDocs(
  options: BuildOptions,
  previousSources: BuildCache["sources"],
): Promise<ReadDocsResult> {
  const docs: DocRecord[] = [];
  const nextSources: BuildCache["sources"] = {};

  for await (const source of scanMarkdownSources(options.vaultDir, options.exclude)) {
    const prev = previousSources[source.relPath];

    let entry: CachedSourceEntry;
    const canReuse = !!prev && prev.rawHash === source.rawHash;
    if (canReuse) {
      entry = prev;
    } else {
      const parsed = parsePublicationSource(source);
      if (!parsed.ok) {
        throw new Error(formatPublicationDiagnostic(parsed.diagnostic), {
          cause: parsed.cause,
        });
      }
      entry = toCachedSourceEntry(parsed.value);
    }

    const completeEntry: CachedSourceEntry = {
      ...entry,
      mtimeMs: source.mtimeMs,
      size: source.size,
    };
    const evaluation = evaluatePublication(source.relPath, completeEntry);
    if (evaluation.status === "ignored") {
      continue;
    }
    if (evaluation.status === "invalid") {
      for (const diagnostic of evaluation.diagnostics) {
        console.warn(formatPublicationDiagnostic(diagnostic));
      }
      continue;
    }

    nextSources[source.relPath] = completeEntry;
    docs.push(toDocRecord(source.sourcePath, source.relPath, completeEntry));
  }

  ensureUniqueRoutes(docs);
  return { docs, nextSources };
}

export function createWikiLookup(docs: DocRecord[]): WikiLookup {
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

export function createWikiResolver(lookup: WikiLookup, currentDoc: DocRecord): WikiResolver {
  return {
    resolve(input: string) {
      return resolveWikiTarget(lookup, input, currentDoc, true);
    },
  };
}

export function buildWikiResolutionSignature(doc: DocRecord, lookup: WikiLookup): string {
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

export function buildBacklinksByDocId(
  docs: DocRecord[],
  lookup: WikiLookup,
): Map<string, ManifestDoc["backlinks"]> {
  const buckets = new Map<string, Map<string, ManifestDoc["backlinks"][number]>>();

  for (const doc of docs) {
    for (const target of doc.wikiTargets) {
      const targetDoc = resolveWikiTargetDoc(lookup, target, doc, false);
      if (!targetDoc || targetDoc.id === doc.id) {
        continue;
      }

      const bucket =
        buckets.get(targetDoc.id) ?? new Map<string, ManifestDoc["backlinks"][number]>();
      bucket.set(doc.id, {
        id: doc.id,
        route: doc.route,
        title: doc.title,
        prefix: doc.prefix,
      });
      buckets.set(targetDoc.id, bucket);
    }
  }

  const backlinksByDocId = new Map<string, ManifestDoc["backlinks"]>();
  for (const doc of docs) {
    const source = buckets.get(doc.id) ?? new Map<string, ManifestDoc["backlinks"][number]>();
    const backlinks = Array.from(source.values()).sort((left, right) =>
      left.route.localeCompare(right.route, "ko-KR"),
    );
    backlinksByDocId.set(doc.id, backlinks);
  }
  return backlinksByDocId;
}
