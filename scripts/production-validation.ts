import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { IMMUTABLE_CACHE_CONTROL, REVALIDATE_CACHE_CONTROL } from "../src/build/cache-headers";
import { buildBacklinksByDocId, createWikiLookup, createWikiResolver } from "../src/build/source";
import { buildCanonicalUrl } from "../src/seo";
import type { BuildOptions, DocRecord, Manifest } from "../src/types";
import { toViewPathWithBase } from "../src/view-contract";

export const PRODUCTION_REPORT_FILE_NAME = "production-validation-report.json";
export const MARKDOWN_REPORT_FILE_NAME = "mdlint-report.json";

export interface ProductionValidationArgs {
  configPath?: string;
  vaultDir?: string;
  outDir?: string;
  reportDir: string;
  markdownBaselinePath?: string;
  exclude: string[];
  help: boolean;
}

export interface ValidationFailure {
  check: string;
  message: string;
  path?: string;
}

export interface ValidationCheck {
  id: string;
  status: "passed" | "failed" | "skipped";
  summary: string;
  details?: Record<string, unknown>;
}

export interface ProductionValidationReport {
  schemaVersion: 1;
  generatedAt: string;
  status: "passed" | "failed";
  configuration: {
    configPath?: string;
    vaultDir?: string;
    outDir?: string;
    reportDir: string;
    requestedReportDir?: string;
    siteUrl?: string;
    pathBase?: string;
    markdownBaselinePath?: string;
  };
  checks: ValidationCheck[];
  failures: ValidationFailure[];
  metrics: {
    documents?: number;
    outputFiles?: number;
    outputBytes?: number;
  };
}

export interface OutputSnapshotEntry {
  bytes: number;
  sha256: string;
}

export type OutputSnapshot = Record<string, OutputSnapshotEntry>;

interface MarkdownIssue {
  category?: unknown;
  file?: unknown;
  line?: unknown;
  column?: unknown;
  rule?: unknown;
  message?: unknown;
}

interface MarkdownReport {
  issueCount?: unknown;
  issues?: unknown;
}

interface MarkdownBaseline {
  schemaVersion?: unknown;
  fingerprints?: unknown;
}

const RUNTIME_ASSET_PATTERN = /^(?:app|tree|mermaid)\.[a-f0-9]{12}\.(?:css|js)$/;
const HTML_REFERENCE_PATTERN = /\b(?:href|src)\s*=\s*["']([^"']+)["']/gi;
const CSS_REFERENCE_PATTERN = /url\(\s*["']?([^"')]+)["']?\s*\)/gi;

function readOptionValue(argv: string[], index: number, option: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith("-")) {
    throw new Error(`[production] Missing value for ${option}`);
  }
  return value;
}

export function parseProductionValidationArgs(argv: string[]): ProductionValidationArgs {
  const parsed: ProductionValidationArgs = {
    reportDir: ".reports/production-validation",
    exclude: [],
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (option === "--help" || option === "-h") {
      parsed.help = true;
      continue;
    }
    if (option === "--config") {
      parsed.configPath = readOptionValue(argv, index, option);
      index += 1;
      continue;
    }
    if (option === "--vault") {
      parsed.vaultDir = readOptionValue(argv, index, option);
      index += 1;
      continue;
    }
    if (option === "--out") {
      parsed.outDir = readOptionValue(argv, index, option);
      index += 1;
      continue;
    }
    if (option === "--report-dir") {
      parsed.reportDir = readOptionValue(argv, index, option);
      index += 1;
      continue;
    }
    if (option === "--markdown-baseline") {
      parsed.markdownBaselinePath = readOptionValue(argv, index, option);
      index += 1;
      continue;
    }
    if (option === "--exclude") {
      parsed.exclude.push(readOptionValue(argv, index, option));
      index += 1;
      continue;
    }
    throw new Error(`[production] Unknown option: ${option}`);
  }

  return parsed;
}

export function createProductionReport(
  args: ProductionValidationArgs,
  cwd = process.cwd(),
): ProductionValidationReport {
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    status: "failed",
    configuration: {
      ...(args.configPath ? { configPath: path.resolve(cwd, args.configPath) } : {}),
      ...(args.markdownBaselinePath
        ? { markdownBaselinePath: path.resolve(cwd, args.markdownBaselinePath) }
        : {}),
      reportDir: path.resolve(cwd, args.reportDir),
    },
    checks: [],
    failures: [],
    metrics: {},
  };
}

export function addValidationCheck(
  report: ProductionValidationReport,
  id: string,
  summary: string,
  failures: string[],
  details?: Record<string, unknown>,
): void {
  report.checks.push({
    id,
    status: failures.length === 0 ? "passed" : "failed",
    summary,
    ...(details ? { details } : {}),
  });
  for (const message of failures) {
    report.failures.push({ check: id, message });
  }
}

export function markValidationCheckSkipped(
  report: ProductionValidationReport,
  id: string,
  summary: string,
): void {
  report.checks.push({ id, status: "skipped", summary });
}

export async function writeProductionReport(report: ProductionValidationReport): Promise<string> {
  report.status = report.failures.length === 0 ? "passed" : "failed";
  const reportDir = report.configuration.reportDir;
  await fs.mkdir(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, PRODUCTION_REPORT_FILE_NAME);
  await Bun.write(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return reportPath;
}

async function collectFiles(rootDir: string, relativeDir = ""): Promise<string[]> {
  const absoluteDir = path.join(rootDir, relativeDir);
  const entries = await fs.readdir(absoluteDir, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name, "en"));

  const files: string[] = [];
  for (const entry of entries) {
    const relativePath = relativeDir ? path.join(relativeDir, entry.name) : entry.name;
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(rootDir, relativePath)));
    } else if (entry.isFile()) {
      files.push(relativePath.split(path.sep).join("/"));
    } else {
      throw new Error(
        `[production] Output contains an unsupported filesystem entry: ${relativePath}`,
      );
    }
  }
  return files;
}

export async function snapshotOutput(outDir: string): Promise<OutputSnapshot> {
  const snapshot: OutputSnapshot = {};
  for (const relativePath of await collectFiles(outDir)) {
    const bytes = await fs.readFile(path.join(outDir, relativePath));
    snapshot[relativePath] = {
      bytes: bytes.byteLength,
      sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    };
  }
  return snapshot;
}

export function compareOutputSnapshots(first: OutputSnapshot, second: OutputSnapshot): string[] {
  const failures: string[] = [];
  const paths = Array.from(new Set([...Object.keys(first), ...Object.keys(second)])).sort();
  for (const relativePath of paths) {
    const left = first[relativePath];
    const right = second[relativePath];
    if (!left) {
      failures.push(`${relativePath} only exists after the second build`);
    } else if (!right) {
      failures.push(`${relativePath} disappeared after the second build`);
    } else if (left.sha256 !== right.sha256 || left.bytes !== right.bytes) {
      failures.push(`${relativePath} changed between identical production builds`);
    }
  }
  return failures;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function routeOutputPath(route: string): string {
  const clean = route.replace(/^\/+/, "").replace(/\/+$/, "");
  return clean ? `${clean}/index.html` : "index.html";
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export async function validateManifestGraph(
  outDir: string,
  docs: DocRecord[],
  options: BuildOptions,
): Promise<{ failures: string[]; manifest: Manifest | null }> {
  const failures: string[] = [];
  let rawManifest: unknown;
  try {
    rawManifest = JSON.parse(await fs.readFile(path.join(outDir, "manifest.json"), "utf8"));
  } catch (error) {
    return {
      failures: [`manifest.json could not be read: ${(error as Error).message}`],
      manifest: null,
    };
  }

  if (
    !isRecord(rawManifest) ||
    rawManifest.schemaVersion !== 2 ||
    !Array.isArray(rawManifest.docIds) ||
    !isRecord(rawManifest.docsById) ||
    !isRecord(rawManifest.routeMap)
  ) {
    return { failures: ["manifest.json does not satisfy schemaVersion 2"], manifest: null };
  }
  const manifest = rawManifest as unknown as Manifest;
  const expectedIds = docs.map(({ id }) => id);
  if (stableJson(manifest.docIds) !== stableJson(expectedIds)) {
    failures.push("manifest.docIds does not exactly match the published source documents");
  }

  const expectedRouteMap = Object.fromEntries(docs.map((doc) => [doc.route, doc.id]));
  if (stableJson(manifest.routeMap) !== stableJson(expectedRouteMap)) {
    failures.push("manifest.routeMap does not exactly match generated document routes");
  }
  if (manifest.pathBase !== (options.seo?.pathBase ?? "")) {
    failures.push("manifest.pathBase differs from the normalized production SEO pathBase");
  }

  const lookup = createWikiLookup(docs);
  const backlinks = buildBacklinksByDocId(docs, lookup);
  for (const doc of docs) {
    const manifestDoc = manifest.docsById[doc.id];
    if (!manifestDoc) {
      failures.push(`manifest.docsById is missing ${doc.id}`);
      continue;
    }
    for (const field of [
      "id",
      "route",
      "title",
      "prefix",
      "categoryPath",
      "contentUrl",
      "date",
      "updatedDate",
      "tags",
      "description",
      "branch",
    ] as const) {
      if (stableJson(manifestDoc[field]) !== stableJson(doc[field])) {
        failures.push(`manifest document ${doc.id} has an invalid ${field}`);
      }
    }
    if (stableJson(manifestDoc.wikiTargets) !== stableJson(doc.wikiTargets)) {
      failures.push(`manifest document ${doc.id} has stale wikiTargets`);
    }
    if (stableJson(manifestDoc.backlinks) !== stableJson(backlinks.get(doc.id) ?? [])) {
      failures.push(`manifest document ${doc.id} has stale backlinks`);
    }

    const resolver = createWikiResolver(lookup, doc);
    for (const target of doc.wikiTargets) {
      if (!resolver.resolve(target)) {
        failures.push(`${doc.relPath} has an unresolved wikilink: ${target}`);
      }
    }

    for (const relativePath of [routeOutputPath(doc.route), doc.contentUrl.replace(/^\/+/, "")]) {
      try {
        const stat = await fs.stat(path.join(outDir, relativePath));
        if (!stat.isFile()) failures.push(`${relativePath} is not a generated file`);
      } catch {
        failures.push(`${relativePath} is missing from generated output`);
      }
    }
  }

  const extraIds = Object.keys(manifest.docsById).filter((id) => !expectedIds.includes(id));
  for (const id of extraIds) failures.push(`manifest.docsById contains unknown document ${id}`);
  return { failures, manifest };
}

function extractAttribute(html: string, pattern: RegExp): string | null {
  return html.match(pattern)?.[1] ?? null;
}

function decodeHtmlAttribute(value: string): string {
  return value.replaceAll("&amp;", "&").replaceAll("&quot;", '"').replaceAll("&#39;", "'");
}

export async function validateSeoArtifacts(
  outDir: string,
  docs: DocRecord[],
  manifest: Manifest,
  options: BuildOptions,
): Promise<string[]> {
  const failures: string[] = [];
  const seo = options.seo;
  if (!seo) return ["seo.siteUrl is required for production validation"];

  const expectedUrls = Array.from(new Set(["/", ...docs.map(({ route }) => route)]))
    .sort((left, right) => left.localeCompare(right, "ko-KR"))
    .map((route) => buildCanonicalUrl(route, seo));
  try {
    const sitemap = await fs.readFile(path.join(outDir, "sitemap.xml"), "utf8");
    const actualUrls = Array.from(sitemap.matchAll(/<loc>([^<]+)<\/loc>/g), (match) =>
      decodeHtmlAttribute(match[1] ?? ""),
    );
    if (stableJson(actualUrls) !== stableJson(expectedUrls)) {
      failures.push("sitemap.xml does not exactly list the canonical root and document routes");
    }
  } catch (error) {
    failures.push(`sitemap.xml could not be read: ${(error as Error).message}`);
  }

  try {
    const robots = await fs.readFile(path.join(outDir, "robots.txt"), "utf8");
    const expected = [
      "User-agent: *",
      "Allow: /",
      `Sitemap: ${buildCanonicalUrl("/sitemap.xml", seo)}`,
      "",
    ].join("\n");
    if (robots !== expected) failures.push("robots.txt does not point to the canonical sitemap");
  } catch (error) {
    failures.push(`robots.txt could not be read: ${(error as Error).message}`);
  }

  const treeAsset = (await collectFiles(outDir)).find((file) =>
    /^assets\/tree\.[a-f0-9]{12}\.js$/.test(file),
  );
  const pages = [
    { route: "/", relativePath: "index.html" },
    ...docs.map((doc) => ({ route: doc.route, relativePath: routeOutputPath(doc.route) })),
  ];
  for (const page of pages) {
    let html: string;
    try {
      html = await fs.readFile(path.join(outDir, page.relativePath), "utf8");
    } catch {
      failures.push(`${page.relativePath} is missing for SEO validation`);
      continue;
    }
    const canonical = extractAttribute(
      html,
      /<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i,
    );
    if (canonical !== buildCanonicalUrl(page.route, seo)) {
      failures.push(`${page.relativePath} has an invalid canonical URL`);
    }
    const description = extractAttribute(
      html,
      /<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i,
    );
    if (!description?.trim()) failures.push(`${page.relativePath} has an empty meta description`);

    const runtimeJson = extractAttribute(
      html,
      /<script id=["']initial-runtime-data["'] type=["']application\/json["']>([^<]+)<\/script>/i,
    );
    try {
      const runtime = JSON.parse(runtimeJson ?? "null") as Record<string, unknown> | null;
      if (
        !runtime ||
        runtime.pathBase !== seo.pathBase ||
        runtime.manifestUrl !== toViewPathWithBase("/manifest.json", seo.pathBase) ||
        !treeAsset ||
        runtime.treeModuleUrl !== toViewPathWithBase(`/${treeAsset}`, seo.pathBase)
      ) {
        failures.push(`${page.relativePath} has an invalid production runtime bootstrap`);
      }
    } catch {
      failures.push(`${page.relativePath} has malformed production runtime bootstrap JSON`);
    }
  }

  try {
    const notFound = await fs.readFile(path.join(outDir, "404.html"), "utf8");
    const homeHref = extractAttribute(
      notFound,
      /<a\s+href=["']([^"']+)["']\s+class=["']not-found-link["']/i,
    );
    if (homeHref !== toViewPathWithBase("/", seo.pathBase)) {
      failures.push("404.html Home link does not preserve the production pathBase");
    }
  } catch (error) {
    failures.push(`404.html could not be read: ${(error as Error).message}`);
  }

  if (manifest.pathBase !== seo.pathBase) failures.push("manifest pathBase is not production-safe");
  return failures;
}

function extractReferences(source: string, extension: string): string[] {
  const pattern = extension === ".css" ? CSS_REFERENCE_PATTERN : HTML_REFERENCE_PATTERN;
  pattern.lastIndex = 0;
  return Array.from(source.matchAll(pattern), (match) => decodeHtmlAttribute(match[1] ?? ""));
}

function deployedBasePath(
  relativePath: string,
  pathBase: string,
  contentRoutes: Map<string, string>,
): string {
  const contentRoute = contentRoutes.get(relativePath);
  if (contentRoute) return toViewPathWithBase(contentRoute, pathBase);
  if (relativePath === "_app/index.html") return toViewPathWithBase("/", pathBase);
  if (relativePath === "index.html") return toViewPathWithBase("/", pathBase);
  if (relativePath.endsWith("/index.html")) {
    return toViewPathWithBase(`/${relativePath.slice(0, -"index.html".length)}`, pathBase);
  }
  return toViewPathWithBase(`/${relativePath}`, pathBase);
}

function outputCandidateFromUrl(url: URL, seoSiteUrl: string, pathBase: string): string | null {
  if (url.origin !== new URL(seoSiteUrl).origin) return null;
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(url.pathname).replace(/\/{2,}/g, "/");
  } catch {
    return "<invalid-percent-encoding>";
  }
  if (pathBase) {
    if (decodedPath === pathBase) decodedPath = "/";
    else if (decodedPath.startsWith(`${pathBase}/`)) {
      decodedPath = decodedPath.slice(pathBase.length);
    } else {
      return "<outside-path-base>";
    }
  }
  const relativePath = decodedPath.replace(/^\/+/, "");
  if (!relativePath) return "index.html";
  return decodedPath.endsWith("/") ? `${relativePath}index.html` : relativePath;
}

export async function validateInternalReferences(
  outDir: string,
  docs: DocRecord[],
  options: BuildOptions,
): Promise<string[]> {
  const failures = new Set<string>();
  const seo = options.seo;
  if (!seo) return ["seo.siteUrl is required before internal references can be validated"];
  const files = await collectFiles(outDir);
  const fileSet = new Set(files);
  const contentRoutes = new Map(
    docs.map((doc) => [doc.contentUrl.replace(/^\/+/, ""), doc.route] as const),
  );

  for (const relativePath of files.filter((file) => /\.(?:html|css)$/.test(file))) {
    const source = await fs.readFile(path.join(outDir, relativePath), "utf8");
    const basePath = deployedBasePath(relativePath, seo.pathBase, contentRoutes);
    for (const reference of extractReferences(source, path.extname(relativePath))) {
      const trimmed = reference.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      if (/^(?:data|mailto|tel):/i.test(trimmed)) continue;
      if (/^javascript:/i.test(trimmed)) {
        failures.add(`${relativePath} contains a dangerous javascript: reference`);
        continue;
      }

      let resolved: URL;
      try {
        resolved = new URL(trimmed, new URL(basePath, `${seo.siteUrl}/`));
      } catch {
        failures.add(`${relativePath} contains an invalid URL reference: ${trimmed}`);
        continue;
      }
      if (!/^https?:$/.test(resolved.protocol)) continue;
      const candidate = outputCandidateFromUrl(resolved, seo.siteUrl, seo.pathBase);
      if (candidate === null) continue;
      if (candidate === "<outside-path-base>") {
        failures.add(`${relativePath} references a same-origin URL outside pathBase: ${trimmed}`);
      } else if (candidate === "<invalid-percent-encoding>" || !fileSet.has(candidate)) {
        failures.add(`${relativePath} references missing output ${candidate}: ${trimmed}`);
      }
    }
  }
  return [...failures].sort();
}

function patternMatches(pattern: string, pathname: string): boolean {
  return pattern.endsWith("*") ? pathname.startsWith(pattern.slice(0, -1)) : pathname === pattern;
}

export function effectiveCacheControl(headersFile: string, pathname: string): string | null {
  let activePattern: string | null = null;
  let cacheControl: string | null = null;
  for (const line of headersFile.split("\n")) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    if (!/^\s/.test(line)) {
      activePattern = line.trim();
      continue;
    }
    if (!activePattern || !patternMatches(activePattern, pathname)) continue;
    const directive = line.trim();
    if (directive === "! Cache-Control") cacheControl = null;
    else if (directive.startsWith("Cache-Control:")) {
      cacheControl = directive.slice("Cache-Control:".length).trim();
    }
  }
  return cacheControl;
}

export async function validateCacheHeaders(
  outDir: string,
  pathBase: string,
  docs: DocRecord[] = [],
): Promise<string[]> {
  const failures: string[] = [];
  let headers: string;
  try {
    headers = await fs.readFile(path.join(outDir, "_headers"), "utf8");
  } catch (error) {
    return [`_headers could not be read: ${(error as Error).message}`];
  }
  const checkedPaths = new Set<string>();
  const checkPath = (publicPath: string, expected: string) => {
    if (checkedPaths.has(publicPath)) return;
    checkedPaths.add(publicPath);
    const actual = effectiveCacheControl(headers, publicPath);
    if (actual !== expected) {
      failures.push(
        `${publicPath} has Cache-Control ${JSON.stringify(actual)}; expected ${expected}`,
      );
    }
  };

  checkPath(toViewPathWithBase("/", pathBase), REVALIDATE_CACHE_CONTROL);
  if (pathBase) checkPath(toViewPathWithBase(pathBase, ""), REVALIDATE_CACHE_CONTROL);
  for (const doc of docs) {
    checkPath(toViewPathWithBase(doc.route, pathBase), REVALIDATE_CACHE_CONTROL);
  }

  for (const relativePath of await collectFiles(outDir)) {
    const fileName = path.posix.basename(relativePath);
    const immutable = RUNTIME_ASSET_PATTERN.test(fileName) && relativePath.startsWith("assets/");
    const expected = immutable ? IMMUTABLE_CACHE_CONTROL : REVALIDATE_CACHE_CONTROL;
    const publicPath = toViewPathWithBase(`/${relativePath}`, pathBase);
    checkPath(publicPath, expected);
  }
  return failures;
}

export function markdownIssueFingerprint(issue: MarkdownIssue): string {
  return [
    String(issue.category ?? "unknown"),
    String(issue.file ?? "unknown"),
    String(issue.line ?? 0),
    String(issue.column ?? 0),
    String(issue.rule ?? "unknown"),
    String(issue.message ?? ""),
  ].join("|");
}

export function validateMarkdownGate(
  reportValue: unknown,
  baselineValue?: unknown,
): {
  failures: string[];
  issueCount: number;
  baselineCount: number;
  fingerprints: string[];
} {
  if (!isRecord(reportValue)) {
    return {
      failures: ["mdlint-report.json must contain an object"],
      issueCount: 0,
      baselineCount: 0,
      fingerprints: [],
    };
  }
  const report = reportValue as MarkdownReport;
  if (!Array.isArray(report.issues) || typeof report.issueCount !== "number") {
    return {
      failures: ["mdlint-report.json has an invalid issue schema"],
      issueCount: 0,
      baselineCount: 0,
      fingerprints: [],
    };
  }
  const actual = report.issues
    .map((issue) => markdownIssueFingerprint(isRecord(issue) ? issue : {}))
    .sort();
  if (actual.length !== report.issueCount) {
    return {
      failures: ["mdlint-report.json issueCount does not match its issues array"],
      issueCount: actual.length,
      baselineCount: 0,
      fingerprints: actual,
    };
  }
  if (baselineValue === undefined) {
    return {
      failures:
        actual.length === 0 ? [] : [`published Markdown has ${actual.length} strict issue(s)`],
      issueCount: actual.length,
      baselineCount: 0,
      fingerprints: actual,
    };
  }
  if (!isRecord(baselineValue)) {
    return {
      failures: ["Markdown baseline must contain an object"],
      issueCount: actual.length,
      baselineCount: 0,
      fingerprints: actual,
    };
  }
  const baseline = baselineValue as MarkdownBaseline;
  if (
    baseline.schemaVersion !== 1 ||
    !Array.isArray(baseline.fingerprints) ||
    baseline.fingerprints.some((item) => typeof item !== "string")
  ) {
    return {
      failures: ["Markdown baseline must use schemaVersion 1 and string fingerprints"],
      issueCount: actual.length,
      baselineCount: 0,
      fingerprints: actual,
    };
  }
  const expected = [...(baseline.fingerprints as string[])].sort();
  return {
    failures:
      stableJson(actual) === stableJson(expected)
        ? []
        : ["published Markdown findings differ from the intentional baseline"],
    issueCount: actual.length,
    baselineCount: expected.length,
    fingerprints: actual,
  };
}

export function pathsOverlap(left: string, right: string): boolean {
  const leftToRight = path.relative(left, right);
  const rightToLeft = path.relative(right, left);
  const contains = (relative: string) =>
    relative === "" ||
    (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`));
  return contains(leftToRight) || contains(rightToLeft);
}

export async function canonicalizePath(input: string): Promise<string> {
  let existingAncestor = path.resolve(input);
  const missingSegments: string[] = [];

  while (true) {
    try {
      const canonicalAncestor = await fs.realpath(existingAncestor);
      return path.join(canonicalAncestor, ...missingSegments);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const parent = path.dirname(existingAncestor);
      if (parent === existingAncestor) return path.resolve(input);
      missingSegments.unshift(path.basename(existingAncestor));
      existingAncestor = parent;
    }
  }
}
