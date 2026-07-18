import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";

type AssetKind = "js" | "css";

interface SizeBudget {
  raw: number;
  gzip: number;
}

const BUDGETS: Record<AssetKind, SizeBudget> = {
  js: { raw: 300_000, gzip: 90_000 },
  css: { raw: 31_000, gzip: 7_000 },
};

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

  console.log(
    `[size] ${kind} raw=${rawBytes}/${budget.raw} gzip=${gzipBytes}/${budget.gzip} hash=${finalHash}`,
  );
  return failures;
}

const outDir = parseOutDir(process.argv.slice(2));
const assetsDir = path.join(outDir, "assets");
const failures = (["js", "css"] as const).flatMap((kind) =>
  checkAsset(findRuntimeAsset(assetsDir, kind), kind),
);

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`[size] ${failure}`);
  }
  process.exitCode = 1;
}
