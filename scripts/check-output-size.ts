import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";

type AssetKind = "js" | "css";

interface ManifestDoc {
  id: string;
  [key: string]: unknown;
}

interface ManifestV2 {
  schemaVersion: number;
  docIds: string[];
  docsById: Record<string, ManifestDoc>;
  tree: unknown[];
  [key: string]: unknown;
}

interface SizeBudget {
  raw: number;
  gzip: number;
}

const BUDGETS: Record<AssetKind, SizeBudget> = {
  js: { raw: 260_000, gzip: 75_000 },
  css: { raw: 31_000, gzip: 7_000 },
};
const REQUIRED_MINIMAL_TREE_ICONS = [
  "file-tree-icon-chevron",
  "file-tree-icon-dot",
  "file-tree-icon-ellipsis",
  "file-tree-icon-file",
  "file-tree-icon-lock",
] as const;
const MANIFEST_RATIO_MIN_LEGACY_BYTES = 8_000;

function parseOutDir(argv: string[]): string {
  const index = argv.indexOf("--out");
  if (index === -1) {
    return path.resolve("dist");
  }

  const value = argv[index + 1]?.trim();
  if (!value || value.startsWith("-")) {
    throw new Error("[size] Missing value for --out");
  }
  return path.resolve(value);
}

function findRuntimeAsset(assetsDir: string, kind: AssetKind): string {
  const pattern = new RegExp(`^app\\.([a-f0-9]{12})\\.${kind}$`);
  const matches = fs.readdirSync(assetsDir).filter((entry) => pattern.test(entry));
  if (matches.length !== 1) {
    throw new Error(`[size] Expected exactly one app.*.${kind} asset, found ${matches.length}`);
  }
  return path.join(assetsDir, matches[0]);
}

function checkAsset(assetPath: string, kind: AssetKind): string[] {
  const bytes = fs.readFileSync(assetPath);
  const rawBytes = bytes.byteLength;
  const gzipBytes = gzipSync(bytes, { level: 9 }).byteLength;
  const finalHash = crypto.createHash("sha1").update(bytes).digest("hex").slice(0, 12);
  const fileName = path.basename(assetPath);
  const expectedHash = fileName.split(".")[1] ?? "";
  const budget = BUDGETS[kind];
  const failures: string[] = [];

  if (finalHash !== expectedHash) {
    failures.push(`${fileName} hash ${expectedHash} does not match final bytes ${finalHash}`);
  }
  if (rawBytes > budget.raw) {
    failures.push(`${fileName} raw ${rawBytes} exceeds ${budget.raw}`);
  }
  if (gzipBytes > budget.gzip) {
    failures.push(`${fileName} gzip ${gzipBytes} exceeds ${budget.gzip}`);
  }
  if (kind === "js") {
    const source = bytes.toString("utf8");
    if (source.includes("file-tree-builtin-")) {
      failures.push(`${fileName} ships the @pierre/trees built-in file icon catalog`);
    }
    for (const iconName of REQUIRED_MINIMAL_TREE_ICONS) {
      if (!source.includes(iconName)) {
        failures.push(`${fileName} is missing required minimal tree icon ${iconName}`);
      }
    }
  }

  console.log(
    `[size] ${kind} raw=${rawBytes}/${budget.raw} gzip=${gzipBytes}/${budget.gzip} hash=${finalHash}`,
  );
  return failures;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function toLegacyTree(nodes: unknown[], docsById: Record<string, ManifestDoc>): unknown[] {
  return nodes.map((node) => {
    if (!isRecord(node)) {
      return node;
    }
    if (node.type === "folder") {
      return {
        ...node,
        children: toLegacyTree(Array.isArray(node.children) ? node.children : [], docsById),
      };
    }
    if (node.type !== "file" || typeof node.id !== "string") {
      return node;
    }

    const doc = docsById[node.id];
    if (!doc) {
      return node;
    }
    return {
      ...node,
      title: doc.title,
      prefix: doc.prefix,
      route: doc.route,
      contentUrl: doc.contentUrl,
      tags: doc.tags,
      description: doc.description,
      date: doc.date,
      updatedDate: doc.updatedDate,
      branch: doc.branch,
    };
  });
}

function checkManifest(manifestPath: string): string[] {
  const raw = fs.readFileSync(manifestPath);
  const parsedValue = JSON.parse(raw.toString("utf8")) as unknown;
  const failures: string[] = [];

  if (!isRecord(parsedValue)) {
    return ["manifest.json must contain an object"];
  }
  const parsed = parsedValue as ManifestV2;
  if (parsed.schemaVersion !== 2 || !Array.isArray(parsed.docIds) || !isRecord(parsed.docsById)) {
    return ["manifest.json must use schemaVersion 2 with docIds and docsById"];
  }
  if (!Array.isArray(parsed.tree)) {
    return ["manifest.json tree must be an array"];
  }

  const docIds = parsed.docIds.filter((id): id is string => typeof id === "string" && id.length > 0);
  const uniqueDocIds = new Set(docIds);
  const docsByIdKeys = Object.keys(parsed.docsById);
  if (docIds.length !== parsed.docIds.length || uniqueDocIds.size !== docIds.length) {
    failures.push("manifest.json docIds must contain unique non-empty strings");
  }
  if (
    docsByIdKeys.length !== docIds.length ||
    docIds.some((id) => !Object.hasOwn(parsed.docsById, id) || parsed.docsById[id]?.id !== id)
  ) {
    failures.push("manifest.json docsById must exactly match docIds");
  }

  const inspectTree = (nodes: unknown[]) => {
    for (const node of nodes) {
      if (!isRecord(node)) {
        failures.push("manifest.json tree nodes must be objects");
        continue;
      }
      if (node.type === "folder") {
        inspectTree(Array.isArray(node.children) ? node.children : []);
        continue;
      }
      if (node.type !== "file") {
        failures.push("manifest.json tree nodes must be file or folder nodes");
        continue;
      }
      const keys = Object.keys(node).sort();
      if (keys.join(",") !== "id,name,type") {
        failures.push(`manifest file node ${String(node.id ?? "<unknown>")} duplicates document metadata`);
      }
      if (typeof node.id !== "string" || !Object.hasOwn(parsed.docsById, node.id)) {
        failures.push(`manifest file node ${String(node.id ?? "<unknown>")} has a dangling document reference`);
      }
    }
  };
  inspectTree(parsed.tree);

  const { schemaVersion: _schemaVersion, docIds: _docIds, docsById: _docsById, ...rest } = parsed;
  const legacyProjection = {
    ...rest,
    tree: toLegacyTree(parsed.tree, parsed.docsById),
    docs: docIds.map((id) => parsed.docsById[id]),
  };
  const legacyRaw = Buffer.from(`${JSON.stringify(legacyProjection, null, 2)}\n`);
  const rawRatio = raw.byteLength / legacyRaw.byteLength;
  const gzipBytes = gzipSync(raw, { level: 9 }).byteLength;
  const legacyGzipBytes = gzipSync(legacyRaw, { level: 9 }).byteLength;
  const gzipRatio = gzipBytes / legacyGzipBytes;

  if (legacyRaw.byteLength >= MANIFEST_RATIO_MIN_LEGACY_BYTES) {
    if (rawRatio > 0.75) {
      failures.push(`manifest raw ratio ${(rawRatio * 100).toFixed(1)}% exceeds 75% of the legacy projection`);
    }
    if (gzipRatio > 0.95) {
      failures.push(`manifest gzip ratio ${(gzipRatio * 100).toFixed(1)}% exceeds 95% of the legacy projection`);
    }
  } else {
    console.log(
      `[size] manifest ratio gate skipped for legacy projection ${legacyRaw.byteLength}B (<${MANIFEST_RATIO_MIN_LEGACY_BYTES}B)`,
    );
  }

  console.log(
    `[size] manifest raw=${raw.byteLength}/${legacyRaw.byteLength} (${(rawRatio * 100).toFixed(1)}%) gzip=${gzipBytes}/${legacyGzipBytes} (${(gzipRatio * 100).toFixed(1)}%)`,
  );
  return failures;
}

function findRouteHtmlFiles(outDir: string): string[] {
  const manifest = JSON.parse(fs.readFileSync(path.join(outDir, "manifest.json"), "utf8")) as unknown;
  if (!isRecord(manifest) || !isRecord(manifest.routeMap)) {
    return [];
  }

  const relativePaths = new Set<string>(["index.html", "_app/index.html"]);
  for (const route of Object.keys(manifest.routeMap)) {
    const cleanRoute = route.replace(/^\/+/, "").replace(/\/+$/, "");
    relativePaths.add(cleanRoute ? `${cleanRoute}/index.html` : "index.html");
  }
  return Array.from(relativePaths, (relativePath) => path.join(outDir, relativePath)).sort();
}

function checkRouteHtml(outDir: string): string[] {
  const failures: string[] = [];
  const routeHtmlFiles = findRouteHtmlFiles(outDir);
  let maxBootstrapBytes = 0;

  for (const htmlPath of routeHtmlFiles) {
    const relativePath = path.relative(outDir, htmlPath);
    if (!fs.existsSync(htmlPath)) {
      failures.push(`${relativePath} is missing for a generated route`);
      continue;
    }
    const html = fs.readFileSync(htmlPath, "utf8");
    if (html.includes('id="initial-manifest-data"')) {
      failures.push(`${relativePath} embeds the full initial manifest`);
    }

    const matches = Array.from(
      html.matchAll(/<script id="initial-runtime-data" type="application\/json">([^<]*)<\/script>/g),
    );
    if (matches.length !== 1) {
      failures.push(`${relativePath} must contain exactly one initial runtime bootstrap`);
      continue;
    }

    const payloadText = matches[0]?.[1] ?? "";
    const payloadBytes = Buffer.byteLength(payloadText);
    maxBootstrapBytes = Math.max(maxBootstrapBytes, payloadBytes);
    if (payloadBytes > 256) {
      failures.push(`${relativePath} runtime bootstrap ${payloadBytes}B exceeds 256B`);
      continue;
    }

    let payload: unknown;
    try {
      payload = JSON.parse(payloadText) as unknown;
    } catch {
      failures.push(`${relativePath} runtime bootstrap is not valid JSON`);
      continue;
    }
    if (!isRecord(payload) || Object.keys(payload).sort().join(",") !== "manifestUrl,pathBase") {
      failures.push(`${relativePath} runtime bootstrap must contain only manifestUrl and pathBase`);
      continue;
    }
    const pathBase = typeof payload.pathBase === "string" ? payload.pathBase.replace(/\/+$/, "") : "";
    const rawManifestUrl = pathBase ? `${pathBase}/manifest.json` : "/manifest.json";
    const expectedManifestUrl = rawManifestUrl
      .split("/")
      .map((segment, index) => (index === 0 && segment === "" ? "" : encodeURIComponent(segment)))
      .join("/");
    if (payload.manifestUrl !== expectedManifestUrl) {
      failures.push(`${relativePath} runtime bootstrap has an invalid manifestUrl`);
    }
  }

  if (routeHtmlFiles.length === 0) {
    failures.push("generated output must contain at least one route index.html");
  }
  console.log(`[size] route-html files=${routeHtmlFiles.length} bootstrap-max=${maxBootstrapBytes}/256`);
  return failures;
}

const outDir = parseOutDir(process.argv.slice(2));
const assetsDir = path.join(outDir, "assets");
const failures = (["js", "css"] as const).flatMap((kind) =>
  checkAsset(findRuntimeAsset(assetsDir, kind), kind),
);
failures.push(...checkManifest(path.join(outDir, "manifest.json")));
failures.push(...checkRouteHtml(outDir));

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`[size] ${failure}`);
  }
  process.exitCode = 1;
}
