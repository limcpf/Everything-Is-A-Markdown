import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function readOption(argv: string[], name: string, fallback: string): string {
  const index = argv.indexOf(name);
  if (index === -1) {
    return path.resolve(fallback);
  }
  const value = argv[index + 1]?.trim();
  if (!value || value.startsWith("-")) {
    throw new Error(`[reproducible] Missing value for ${name}`);
  }
  return path.resolve(value);
}

function runBuild(vaultDir: string, outDir: string): void {
  const result = spawnSync(
    "bun",
    ["run", "src/cli.ts", "build", "--vault", vaultDir, "--out", outDir],
    {
      cwd: process.cwd(),
      encoding: "utf8",
    },
  );
  if (result.status !== 0) {
    process.stderr.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
    throw new Error(`[reproducible] Build failed with status ${String(result.status)}`);
  }
}

function snapshotFiles(rootDir: string): Map<string, string> {
  const hashes = new Map<string, string>();
  const walk = (directory: string) => {
    const entries = fs
      .readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name, "en"));
    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(absolutePath);
      } else if (entry.isFile()) {
        const relativePath = path.relative(rootDir, absolutePath).split(path.sep).join("/");
        const hash = crypto
          .createHash("sha256")
          .update(fs.readFileSync(absolutePath))
          .digest("hex");
        hashes.set(relativePath, hash);
      }
    }
  };
  walk(rootDir);
  return hashes;
}

function compareSnapshots(before: Map<string, string>, after: Map<string, string>): string[] {
  const failures: string[] = [];
  const allPaths = new Set([...before.keys(), ...after.keys()]);
  for (const filePath of Array.from(allPaths).sort()) {
    if (!before.has(filePath)) {
      failures.push(`added ${filePath}`);
    } else if (!after.has(filePath)) {
      failures.push(`removed ${filePath}`);
    } else if (before.get(filePath) !== after.get(filePath)) {
      failures.push(`changed ${filePath}`);
    }
  }
  return failures;
}

const argv = process.argv.slice(2);
const vaultDir = readOption(argv, "--vault", "test-vault");
const outDir = readOption(argv, "--out", "dist");

runBuild(vaultDir, outDir);
const first = snapshotFiles(outDir);
await new Promise((resolve) => setTimeout(resolve, 20));
runBuild(vaultDir, outDir);
const second = snapshotFiles(outDir);
const failures = compareSnapshots(first, second);

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`[reproducible] ${failure}`);
  }
  process.exitCode = 1;
} else {
  const digest = crypto
    .createHash("sha256")
    .update(Array.from(second, ([filePath, hash]) => `${filePath}\0${hash}`).join("\n"))
    .digest("hex")
    .slice(0, 12);
  console.log(`[reproducible] ${second.size} files stable digest=${digest}`);
}
