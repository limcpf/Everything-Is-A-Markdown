import crypto from "node:crypto";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import type { BuildOptions, DocRecord, Manifest } from "../types";
import { DEFAULT_BRANCH, type RuntimeLayoutConfig } from "../defaults";
import { buildCanonicalUrl } from "../seo";
import { render404Html, renderAppShellHtml } from "../template";
import type { AppShellAssets, AppShellInitialView, AppShellMeta } from "../template";
import { ensureDir, makeHash, removeEmptyParents, removeFileIfExists, toPosixPath } from "../utils";
import {
  composeViewDocumentTitle,
  filterViewDocsByBranch,
  normalizeViewBranch,
  pickViewHomeRoute,
  renderViewChrome,
  toViewPathWithBase,
} from "../view-contract";
import type { OutputPhaseState, OutputWriteContext, RuntimeAssets } from "./contracts";
import { OUTPUT_MARKER_FILE_NAME, resolveSiteTitle } from "./shared";

const DEFAULT_SITE_DESCRIPTION = "File-system style static blog with markdown explorer UI.";
const require = createRequire(import.meta.url);

function pickSeoImageDefaults(seo: BuildOptions["seo"]): {
  social: string | null;
  og: string | null;
  twitter: string | null;
} {
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

function buildStructuredData(
  route: string,
  doc: DocRecord | null,
  options: BuildOptions,
): unknown[] {
  const canonicalUrl = options.seo ? buildCanonicalUrl(route, options.seo) : undefined;
  const siteName = resolveSiteTitle(options);

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
    throw new Error(
      `[safety] Refusing static path that resolves to the vault root: ${relOutputPath}`,
    );
  }
  if (normalized === ".." || normalized.startsWith("../") || path.posix.isAbsolute(normalized)) {
    throw new Error(
      `[safety] Refusing static output path outside the output directory: ${relOutputPath}`,
    );
  }
  if (
    normalized === OUTPUT_MARKER_FILE_NAME ||
    normalized.startsWith(`${OUTPUT_MARKER_FILE_NAME}/`)
  ) {
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

function buildAppShellAssetsForOutput(
  outputPath: string,
  runtimeAssets: RuntimeAssets,
): AppShellAssets {
  return {
    cssHref: toRelativeAssetPath(outputPath, runtimeAssets.cssRelPath),
    jsSrc: toRelativeAssetPath(outputPath, runtimeAssets.jsRelPath),
    treeModulePath: `/${runtimeAssets.treeJsRelPath}`,
  };
}

function createMinimalTreeIconPlugin(): { plugin: Bun.BunPlugin; replacementCount: () => number } {
  const minimalIconModule = path.join(import.meta.dir, "..", "runtime", "tree-icons-minimal.js");
  let replacements = 0;

  return {
    plugin: {
      name: "eiam-minimal-tree-icons",
      setup(builder) {
        builder.onResolve({ filter: /builtInIcons[.]js$/ }, (args) => {
          const importer = toPosixPath(args.importer);
          if (!importer.includes("/node_modules/@pierre/trees/dist/")) {
            return undefined;
          }
          replacements += 1;
          return { path: minimalIconModule };
        });
      },
    },
    replacementCount: () => replacements,
  };
}

const COMPACT_BREAKPOINT_MARKER = "0px /* eiam-compact-breakpoint */";

function createRuntimeCssDefaultsPlugin(layout: RuntimeLayoutConfig): {
  plugin: Bun.BunPlugin;
  replacementCount: () => number;
} {
  let replacements = 0;
  const generatedDefaults = `:root {
  --desktop-sidebar-default: ${layout.desktopSidebarDefaultPx}px;
  --desktop-sidebar-min: ${layout.desktopSidebarMinPx}px;
  --desktop-viewer-min: ${layout.desktopViewerMinPx}px;
  --splitter-width: ${layout.splitterWidthPx}px;
  --mobile-sidebar-min: ${layout.mobileSidebarMinPx}px;
  --mobile-sidebar-max: ${layout.mobileSidebarMaxPx}px;
}`;

  return {
    plugin: {
      name: "eiam-runtime-css-defaults",
      setup(builder) {
        builder.onLoad({ filter: /app[.]css$/ }, async (args) => {
          const source = await fs.readFile(args.path, "utf8");
          replacements = source.split(COMPACT_BREAKPOINT_MARKER).length - 1;
          if (replacements !== 2) {
            throw new Error(
              `Expected 2 compact breakpoint markers in app.css, found ${replacements}`,
            );
          }
          return {
            contents: `${generatedDefaults}\n${source.replaceAll(
              COMPACT_BREAKPOINT_MARKER,
              `${layout.compactBreakpointPx}px`,
            )}`,
            loader: "css",
          };
        });
      },
    },
    replacementCount: () => replacements,
  };
}

async function bundleRuntimeJs(
  entrypoint: string,
  options: { label: string; replaceTreeIcons: boolean },
): Promise<string> {
  const minimalTreeIcons = options.replaceTreeIcons ? createMinimalTreeIconPlugin() : null;
  const result = await Bun.build({
    entrypoints: [entrypoint],
    target: "browser",
    format: "esm",
    splitting: false,
    sourcemap: "none",
    minify: true,
    plugins: minimalTreeIcons ? [minimalTreeIcons.plugin] : [],
  });

  if (!result.success) {
    const details = result.logs
      .map((log) => String(log))
      .filter(Boolean)
      .join("\n");
    throw new Error(`Failed to bundle runtime ${options.label}${details ? `:\n${details}` : ""}`);
  }

  const output =
    result.outputs.find((artifact) => artifact.path.endsWith(".js")) ?? result.outputs[0];
  if (!output) {
    throw new Error(`Failed to bundle runtime ${options.label}: no JavaScript output was produced`);
  }

  if (minimalTreeIcons && minimalTreeIcons.replacementCount() === 0) {
    throw new Error("Failed to replace the pinned @pierre/trees built-in icon module");
  }

  const runtimeJs = await output.text();
  if (runtimeJs.includes("file-tree-builtin-")) {
    throw new Error("Failed to remove the @pierre/trees built-in file icon catalog");
  }
  return runtimeJs;
}

async function bundleRuntimeCss(entrypoint: string, layout: RuntimeLayoutConfig): Promise<string> {
  const runtimeCssDefaults = createRuntimeCssDefaultsPlugin(layout);
  const result = await Bun.build({
    entrypoints: [entrypoint],
    target: "browser",
    sourcemap: "none",
    minify: true,
    plugins: [runtimeCssDefaults.plugin],
  });

  if (!result.success) {
    const details = result.logs
      .map((log) => String(log))
      .filter(Boolean)
      .join("\n");
    throw new Error(`Failed to bundle runtime app.css${details ? `:\n${details}` : ""}`);
  }

  const output =
    result.outputs.find((artifact) => artifact.path.endsWith(".css")) ?? result.outputs[0];
  if (!output) {
    throw new Error("Failed to bundle runtime app.css: no CSS output was produced");
  }
  if (runtimeCssDefaults.replacementCount() !== 2) {
    throw new Error("Failed to generate runtime CSS defaults");
  }

  return output.text();
}

async function readSelfHostedMermaidRuntime(): Promise<{ license: string; source: string }> {
  const mermaidEntryPath = require.resolve("mermaid");
  const mermaidRuntimePath = path.join(path.dirname(mermaidEntryPath), "mermaid.min.js");
  const mermaidLicensePath = path.join(path.dirname(path.dirname(mermaidEntryPath)), "LICENSE");
  try {
    const [source, license] = await Promise.all([
      fs.readFile(mermaidRuntimePath, "utf8"),
      fs.readFile(mermaidLicensePath, "utf8"),
    ]);
    return { license, source };
  } catch (error) {
    throw new Error(
      `[build] Unable to read the pinned Mermaid browser runtime or license from ${path.dirname(mermaidRuntimePath)}`,
      { cause: error },
    );
  }
}

async function writeRuntimeAssets(
  context: OutputWriteContext,
  layout: RuntimeLayoutConfig,
  includeSelfHostedMermaid: boolean,
): Promise<RuntimeAssets> {
  const runtimeDir = path.join(import.meta.dir, "..", "runtime");
  const [runtimeJs, treeRuntimeJs, runtimeCss, mermaidRuntime] = await Promise.all([
    bundleRuntimeJs(path.join(runtimeDir, "app.js"), {
      label: "app.js",
      replaceTreeIcons: false,
    }),
    bundleRuntimeJs(path.join(runtimeDir, "tree-runtime.js"), {
      label: "tree-runtime.js",
      replaceTreeIcons: true,
    }),
    bundleRuntimeCss(path.join(runtimeDir, "app.css"), layout),
    includeSelfHostedMermaid ? readSelfHostedMermaidRuntime() : Promise.resolve(null),
  ]);

  const jsRelPath = `assets/app.${makeHash(runtimeJs).slice(0, 12)}.js`;
  const treeJsRelPath = `assets/tree.${makeHash(treeRuntimeJs).slice(0, 12)}.js`;
  const cssRelPath = `assets/app.${makeHash(runtimeCss).slice(0, 12)}.css`;
  const mermaidHash = mermaidRuntime ? makeHash(mermaidRuntime.source).slice(0, 12) : null;
  const mermaidJsRelPath = mermaidHash ? `assets/mermaid.${mermaidHash}.js` : null;
  const mermaidLicenseRelPath = mermaidHash ? `assets/mermaid.${mermaidHash}.LICENSE.txt` : null;

  for (const previousPath of Object.keys(context.previousHashes)) {
    const isLegacyRuntimeAsset =
      (previousPath.startsWith("assets/app") || previousPath.startsWith("assets/tree")) &&
      (previousPath.endsWith(".js") || previousPath.endsWith(".css")) &&
      previousPath !== jsRelPath &&
      previousPath !== treeJsRelPath &&
      previousPath !== cssRelPath;
    if (!isLegacyRuntimeAsset) {
      continue;
    }
    await removeFileIfExists(path.join(context.outDir, previousPath));
  }

  await writeOutputIfChanged(context, jsRelPath, runtimeJs);
  await writeOutputIfChanged(context, treeJsRelPath, treeRuntimeJs);
  await writeOutputIfChanged(context, cssRelPath, runtimeCss);
  if (mermaidRuntime && mermaidJsRelPath && mermaidLicenseRelPath) {
    await writeOutputIfChanged(context, mermaidJsRelPath, mermaidRuntime.source);
    await writeOutputIfChanged(context, mermaidLicenseRelPath, mermaidRuntime.license);
  }

  return {
    cssRelPath,
    jsRelPath,
    treeJsRelPath,
    ...(mermaidJsRelPath ? { mermaidJsRelPath } : {}),
    ...(mermaidLicenseRelPath ? { mermaidLicenseRelPath } : {}),
  };
}

function buildShellMeta(route: string, doc: DocRecord | null, options: BuildOptions): AppShellMeta {
  const siteTitle = resolveSiteTitle(options);
  const defaultTitle = options.seo?.defaultTitle ?? siteTitle;
  const defaultDescription = options.seo?.defaultDescription ?? DEFAULT_SITE_DESCRIPTION;
  const description =
    typeof doc?.description === "string" && doc.description.trim().length > 0
      ? doc.description.trim()
      : undefined;
  const canonicalUrl = options.seo ? buildCanonicalUrl(route, options.seo) : undefined;
  const baseTitle = doc?.title ?? defaultTitle;
  const title = composeViewDocumentTitle(baseTitle, siteTitle);
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

function buildInitialView(
  doc: DocRecord,
  docs: DocRecord[],
  contentHtml: string,
  manifestDocById: Map<string, Manifest["docsById"][string]>,
  pathBase: string,
  defaultBranch: string,
  locale: BuildOptions["locale"],
): AppShellInitialView {
  const manifestDoc = manifestDocById.get(doc.id);
  const activeBranch =
    normalizeViewBranch(doc.branch) ?? normalizeViewBranch(defaultBranch) ?? DEFAULT_BRANCH;
  const visibleDocs = filterViewDocsByBranch(docs, activeBranch, defaultBranch);
  const chrome = renderViewChrome({
    route: doc.route,
    doc: { ...doc, backlinks: manifestDoc?.backlinks ?? [] },
    docs: visibleDocs,
    pathBase,
    locale,
  });
  return {
    route: doc.route,
    docId: doc.id,
    title: doc.title,
    contentHtml,
    ...chrome,
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
  const manifestDocById = new Map(Object.entries(manifest.docsById));
  const pathBase = options.seo?.pathBase ?? "";
  const defaultBranchDocs = filterViewDocsByBranch(
    docs,
    manifest.defaultBranch,
    manifest.defaultBranch,
  );
  const homeCandidates = defaultBranchDocs.length > 0 ? defaultBranchDocs : docs;
  const indexRoute = pickViewHomeRoute(homeCandidates);
  const indexDoc = docs.find((doc) => doc.route === indexRoute) ?? null;
  const indexOutputPath = "index.html";
  const indexInitialView = indexDoc
    ? buildInitialView(
        indexDoc,
        docs,
        contentByDocId.get(indexDoc.id) ?? "",
        manifestDocById,
        pathBase,
        manifest.defaultBranch,
        options.locale,
      )
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
    render404Html(
      buildAppShellAssetsForOutput("404.html", runtimeAssets),
      toViewPathWithBase("/", pathBase),
      resolveSiteTitle(options),
      options.locale,
    ),
  );

  for (const doc of docs) {
    const routeOutputPath = toRouteOutputPath(doc.route);
    const initialView = buildInitialView(
      doc,
      docs,
      contentByDocId.get(doc.id) ?? "",
      manifestDocById,
      pathBase,
      manifest.defaultBranch,
      options.locale,
    );
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

async function writeSeoArtifacts(
  context: OutputWriteContext,
  docs: DocRecord[],
  options: BuildOptions,
): Promise<void> {
  if (!options.seo) {
    await removeFileIfExists(path.join(context.outDir, "robots.txt"));
    await removeFileIfExists(path.join(context.outDir, "sitemap.xml"));
    console.warn(
      '[seo] Skipping robots.txt and sitemap.xml generation. Add "seo.siteUrl" to blog.config.* to enable SEO artifacts.',
    );
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

export function validateStaticOutputPlan(options: BuildOptions): void {
  assertSafeStaticPaths(options);
}

export async function prepareOutputPhase(
  options: BuildOptions,
  previousHashes: Record<string, string>,
  includeSelfHostedMermaid = false,
): Promise<OutputPhaseState> {
  const context: OutputWriteContext = {
    outDir: options.outDir,
    previousHashes,
    nextHashes: {},
  };
  const runtimeAssets = await writeRuntimeAssets(context, options.layout, includeSelfHostedMermaid);
  await copyStaticPaths(context, options);
  const mermaidRuntimeUrl = runtimeAssets.mermaidJsRelPath
    ? toViewPathWithBase(`/${runtimeAssets.mermaidJsRelPath}`, options.seo?.pathBase ?? "")
    : null;
  return { context, runtimeAssets, mermaidRuntimeUrl };
}

export async function emitOutputPhase(
  output: OutputPhaseState,
  docs: DocRecord[],
  manifest: Manifest,
  options: BuildOptions,
  contentByDocId: Map<string, string>,
): Promise<void> {
  await writeOutputIfChanged(
    output.context,
    "manifest.json",
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  await writeShellPages(
    output.context,
    docs,
    manifest,
    options,
    output.runtimeAssets,
    contentByDocId,
  );
  await writeSeoArtifacts(output.context, docs, options);
  await removeStaleOutputs(output.context);
}
