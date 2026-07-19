import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { buildExcluder, relativePosix } from "./utils";

export interface ScannedMarkdownSource {
  sourcePath: string;
  relPath: string;
  raw: string;
  rawHash: string;
  mtimeMs: number;
  size: number;
}

export interface PublicationMetadata {
  publish: boolean;
  draft: boolean;
  prefix?: string;
  categoryPath?: string;
}

export type PublicationDiagnosticCode =
  "frontmatter/parse" | "publication/missing-prefix" | "publication/missing-category-path";

export interface PublicationDiagnostic {
  category: "frontmatter-parse" | "publication-metadata";
  code: PublicationDiagnosticCode;
  severity: "error" | "warning";
  file: string;
  line: number;
  column: number;
  message: string;
}

export interface ParsedPublicationSource {
  source: ScannedMarkdownSource;
  frontmatter: Record<string, unknown>;
  content: string;
  metadata: PublicationMetadata;
}

export type PublicationEvaluation =
  | { status: "ignored"; reason: "not-published" | "draft" }
  | { status: "invalid"; diagnostics: PublicationDiagnostic[] }
  | { status: "target" };

export interface PublicationScanResult {
  sourceFiles: string[];
  targets: ParsedPublicationSource[];
  diagnostics: PublicationDiagnostic[];
  ignored: Array<{
    file: string;
    reason: "not-published" | "draft" | "frontmatter-parse" | "invalid-metadata";
  }>;
}

async function* walkMarkdownFiles(
  dir: string,
  vaultDir: string,
  isExcluded: (relPath: string, isDirectory: boolean) => boolean,
): AsyncGenerator<string> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name, "ko-KR"));

  for (const entry of entries) {
    const absolutePath = path.join(dir, entry.name);
    const relPath = relativePosix(vaultDir, absolutePath);

    if (isExcluded(relPath, entry.isDirectory())) {
      continue;
    }

    if (entry.isDirectory()) {
      for await (const nestedPath of walkMarkdownFiles(absolutePath, vaultDir, isExcluded)) {
        yield nestedPath;
      }
      continue;
    }

    if (entry.isFile() && /\.md$/i.test(entry.name)) {
      yield absolutePath;
    }
  }
}

export async function* scanMarkdownSources(
  vaultDir: string,
  excludePatterns: string[],
): AsyncGenerator<ScannedMarkdownSource> {
  const isExcluded = buildExcluder(excludePatterns);
  for await (const sourcePath of walkMarkdownFiles(vaultDir, vaultDir, isExcluded)) {
    const raw = await Bun.file(sourcePath).text();
    const stat = await fs.stat(sourcePath);
    yield {
      sourcePath,
      relPath: relativePosix(vaultDir, sourcePath),
      raw,
      rawHash: crypto.createHash("sha256").update(raw).digest("hex"),
      mtimeMs: stat.mtimeMs,
      size: stat.size,
    };
  }
}

export function normalizeCategoryPath(value: unknown): string | undefined {
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

export function pickPublicationPrefix(
  frontmatter: Record<string, unknown>,
  raw: string,
): string | undefined {
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

export function pickPublicationCategoryPath(
  frontmatter: Record<string, unknown>,
  raw: string,
): string | undefined {
  const literal = normalizeCategoryPath(extractFrontmatterScalar(raw, "category_path"));
  if (literal) {
    return literal;
  }

  return normalizeCategoryPath(frontmatter.category_path);
}

function createParseDiagnostic(relPath: string, error: unknown): PublicationDiagnostic {
  return {
    category: "frontmatter-parse",
    code: "frontmatter/parse",
    severity: "error",
    file: relPath,
    line: 1,
    column: 1,
    message: error instanceof Error ? error.message : String(error),
  };
}

export type ParsePublicationResult =
  | { ok: true; value: ParsedPublicationSource }
  | { ok: false; diagnostic: PublicationDiagnostic; cause: unknown };

export function parsePublicationSource(source: ScannedMarkdownSource): ParsePublicationResult {
  let parsed: matter.GrayMatterFile<string>;
  try {
    parsed = matter(source.raw);
  } catch (error) {
    return {
      ok: false,
      diagnostic: createParseDiagnostic(source.relPath, error),
      cause: error,
    };
  }

  const frontmatter = parsed.data as Record<string, unknown>;
  return {
    ok: true,
    value: {
      source,
      frontmatter,
      content: parsed.content,
      metadata: {
        publish: frontmatter.publish === true,
        draft: frontmatter.draft === true,
        prefix: pickPublicationPrefix(frontmatter, source.raw),
        categoryPath: pickPublicationCategoryPath(frontmatter, source.raw),
      },
    },
  };
}

export function evaluatePublication(
  relPath: string,
  metadata: PublicationMetadata,
): PublicationEvaluation {
  if (!metadata.publish) {
    return { status: "ignored", reason: "not-published" };
  }
  if (metadata.draft) {
    return { status: "ignored", reason: "draft" };
  }

  const diagnostics: PublicationDiagnostic[] = [];
  if (!metadata.prefix) {
    diagnostics.push({
      category: "publication-metadata",
      code: "publication/missing-prefix",
      severity: "warning",
      file: relPath,
      line: 1,
      column: 1,
      message: "Published document is missing required prefix",
    });
  }
  if (!metadata.categoryPath) {
    diagnostics.push({
      category: "publication-metadata",
      code: "publication/missing-category-path",
      severity: "warning",
      file: relPath,
      line: 1,
      column: 1,
      message: "Published document is missing required category_path",
    });
  }

  return diagnostics.length > 0 ? { status: "invalid", diagnostics } : { status: "target" };
}

export function formatPublicationDiagnostic(diagnostic: PublicationDiagnostic): string {
  if (diagnostic.code === "frontmatter/parse") {
    return `Frontmatter parse failed: ${diagnostic.file}\n${diagnostic.message}`;
  }
  if (diagnostic.code === "publication/missing-prefix") {
    return `[publish] Skipped published doc without prefix: ${diagnostic.file}`;
  }
  return `[publish] Skipped published doc without category_path: ${diagnostic.file}`;
}

export async function scanPublicationTargets(
  vaultDir: string,
  excludePatterns: string[],
): Promise<PublicationScanResult> {
  const sourceFiles: string[] = [];
  const targets: ParsedPublicationSource[] = [];
  const diagnostics: PublicationDiagnostic[] = [];
  const ignored: PublicationScanResult["ignored"] = [];

  for await (const source of scanMarkdownSources(vaultDir, excludePatterns)) {
    sourceFiles.push(source.relPath);
    const parsed = parsePublicationSource(source);
    if (!parsed.ok) {
      diagnostics.push(parsed.diagnostic);
      ignored.push({ file: source.relPath, reason: "frontmatter-parse" });
      continue;
    }

    const evaluation = evaluatePublication(source.relPath, parsed.value.metadata);
    if (evaluation.status === "ignored") {
      ignored.push({ file: source.relPath, reason: evaluation.reason });
      continue;
    }
    if (evaluation.status === "invalid") {
      diagnostics.push(...evaluation.diagnostics);
      ignored.push({ file: source.relPath, reason: "invalid-metadata" });
      continue;
    }

    targets.push(parsed.value);
  }

  return { sourceFiles, targets, diagnostics, ignored };
}
