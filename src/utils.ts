import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import picomatch from "picomatch";

export function toPosixPath(input: string): string {
  return input.split(path.sep).join("/");
}

export function relativePosix(from: string, to: string): string {
  return toPosixPath(path.relative(from, to));
}

export function stripMdExt(filePath: string): string {
  return filePath.replace(/\.md$/i, "");
}

export function toDocId(relNoExt: string): string {
  return relNoExt.replace(/\//g, "__");
}

export function slugifySegment(input: string): string {
  const normalized = input.normalize("NFKC").trim().toLowerCase();

  const slug = normalized
    .replace(/['’]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/[^\p{Letter}\p{Number}-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "untitled";
}

export function toRoute(relNoExt: string): string {
  const segments = relNoExt
    .split("/")
    .filter(Boolean)
    .map((segment) => slugifySegment(segment));
  return `/${segments.join("/")}/`;
}

export function makeHash(payload: string): string {
  return crypto.createHash("sha1").update(payload).digest("hex");
}

export function makeTitleFromFileName(fileName: string): string {
  const stem = fileName.replace(/\.md$/i, "");
  const words = stem.replace(/[-_]+/g, " ").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return "Untitled";
  }
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

export function isRemoteUrl(input: string): boolean {
  return /^(https?:)?\/\//i.test(input) || /^data:/i.test(input) || /^mailto:/i.test(input);
}

export function buildExcluder(
  patterns: string[],
): (relPath: string, isDirectory: boolean) => boolean {
  const matchers = patterns.map((pattern) => picomatch(pattern, { dot: true }));

  return (relPath: string, isDirectory: boolean): boolean => {
    if (!relPath) {
      return false;
    }
    const normalized = relPath.replace(/^\.\//, "");
    const withSlash = isDirectory && !normalized.endsWith("/") ? `${normalized}/` : normalized;
    return matchers.some((matcher) => matcher(normalized) || matcher(withSlash));
  };
}

export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function removeFileIfExists(filePath: string): Promise<void> {
  try {
    await fs.rm(filePath, { force: true });
  } catch {
    // noop
  }
}

export async function removeEmptyParents(startDir: string, stopDir: string): Promise<void> {
  let current = startDir;
  const normalizedStop = path.resolve(stopDir);

  while (
    path.resolve(current).startsWith(normalizedStop) &&
    path.resolve(current) !== normalizedStop
  ) {
    try {
      const entries = await fs.readdir(current);
      if (entries.length > 0) {
        return;
      }
      await fs.rmdir(current);
      current = path.dirname(current);
    } catch {
      return;
    }
  }
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export function formatDateIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}
