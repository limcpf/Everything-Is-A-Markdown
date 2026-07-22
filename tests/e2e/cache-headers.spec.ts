import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { IMMUTABLE_CACHE_CONTROL, REVALIDATE_CACHE_CONTROL } from "../../src/build/cache-headers";

const cliPath = path.join(process.cwd(), "src/cli.ts");

function writeText(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function runBuild(workDir: string, vaultDir: string, outDir: string): string {
  const result = invokeBuild(workDir, vaultDir, outDir);
  expect(result.status, result.output).toBe(0);
  return result.output;
}

function invokeBuild(
  workDir: string,
  vaultDir: string,
  outDir: string,
): { status: number | null; output: string } {
  const result = spawnSync("bun", [cliPath, "build", "--vault", vaultDir, "--out", outDir], {
    cwd: workDir,
    encoding: "utf8",
  });
  return {
    status: result.status,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
}

function patternMatches(pattern: string, pathname: string): boolean {
  return pattern.endsWith("*") ? pathname.startsWith(pattern.slice(0, -1)) : pathname === pattern;
}

function effectiveCacheControl(headersFile: string, pathname: string): string | null {
  let activePattern: string | null = null;
  let cacheControl: string | null = null;

  for (const line of headersFile.split("\n")) {
    if (!line.trim() || line.trimStart().startsWith("#")) {
      continue;
    }
    if (!/^\s/.test(line)) {
      activePattern = line;
      continue;
    }
    if (!activePattern || !patternMatches(activePattern, pathname)) {
      continue;
    }

    const directive = line.trim();
    if (directive === "! Cache-Control") {
      cacheControl = null;
    } else if (directive.startsWith("Cache-Control:")) {
      cacheControl = directive.slice("Cache-Control:".length).trim();
    }
  }

  return cacheControl;
}

function findBuildCacheIndex(workDir: string): string {
  const cacheRoot = path.join(workDir, ".cache", "eiam");
  const namespace = fs
    .readdirSync(cacheRoot, { withFileTypes: true })
    .find((entry) => entry.isDirectory());
  if (!namespace) {
    throw new Error("EIAM cache namespace was not created");
  }
  return path.join(cacheRoot, namespace.name, "build-index.json");
}

test.describe("Cloudflare Pages cache headers", () => {
  test("emits pathBase-aware revalidation and exact immutable runtime rules", () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "eiam-cache-headers-"));
    const vaultDir = path.join(workDir, "vault");
    const outDir = path.join(workDir, "dist");

    try {
      writeText(
        path.join(workDir, "blog.config.mjs"),
        `export default {
  staticPaths: ["assets/social.png"],
  seo: { siteUrl: "https://example.com", pathBase: " docs guides/한글/ " },
};
`,
      );
      writeText(path.join(vaultDir, "assets/social.png"), "mutable social image\n");
      writeText(
        path.join(vaultDir, "cache.md"),
        `---
publish: true
prefix: CACHE-01
category_path: deployment
title: Cache headers
---

~~~mermaid
graph TD
  A --> B
~~~
`,
      );

      runBuild(workDir, vaultDir, outDir);

      const headersFile = fs.readFileSync(path.join(outDir, "_headers"), "utf8");
      const manifest = JSON.parse(fs.readFileSync(path.join(outDir, "manifest.json"), "utf8")) as {
        docIds: string[];
        docsById: Record<string, { contentUrl: string }>;
      };
      const contentUrl = manifest.docsById[manifest.docIds[0]!]!.contentUrl;
      const encodedBase = "/docs%20guides/%ED%95%9C%EA%B8%80";

      for (const mutablePath of [
        encodedBase,
        `${encodedBase}/`,
        `${encodedBase}/CACHE-01/`,
        `${encodedBase}/manifest.json`,
        `${encodedBase}${contentUrl}`,
        `${encodedBase}/sitemap.xml`,
        `${encodedBase}/robots.txt`,
        `${encodedBase}/assets/social.png`,
      ]) {
        expect(effectiveCacheControl(headersFile, mutablePath), mutablePath).toBe(
          REVALIDATE_CACHE_CONTROL,
        );
      }

      const runtimeFiles = fs
        .readdirSync(path.join(outDir, "assets"))
        .filter((fileName) => /^(?:app|tree|mermaid)\.[a-f0-9]{12}\.(?:css|js)$/.test(fileName));
      expect(runtimeFiles).toHaveLength(4);
      for (const runtimeFile of runtimeFiles) {
        const runtimeUrl = `${encodedBase}/assets/${runtimeFile}`;
        expect(effectiveCacheControl(headersFile, runtimeUrl), runtimeUrl).toBe(
          IMMUTABLE_CACHE_CONTROL,
        );
      }

      const licenseFile = fs
        .readdirSync(path.join(outDir, "assets"))
        .find((fileName) => fileName.endsWith(".LICENSE.txt"));
      expect(licenseFile).toBeDefined();
      expect(effectiveCacheControl(headersFile, `${encodedBase}/assets/${licenseFile}`)).toBe(
        REVALIDATE_CACHE_CONTROL,
      );
      expect(headersFile).not.toContain(`${encodedBase}/assets/*`);
    } finally {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  });

  test("preserves an explicitly copied custom _headers file", () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "eiam-custom-headers-"));
    const vaultDir = path.join(workDir, "vault");
    const outDir = path.join(workDir, "dist");
    const customHeaders = "/*\n  X-EIAM-Test: custom\n";

    try {
      writeText(
        path.join(workDir, "blog.config.mjs"),
        'export default { staticPaths: ["_headers"] };\n',
      );
      writeText(path.join(vaultDir, "_headers"), customHeaders);
      writeText(
        path.join(vaultDir, "custom.md"),
        `---
publish: true
prefix: CUSTOM-01
category_path: deployment
---

Custom host policy.
`,
      );

      runBuild(workDir, vaultDir, outDir);
      expect(fs.readFileSync(path.join(outDir, "_headers"), "utf8")).toBe(customHeaders);
    } finally {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  });

  test("rejects an _headers directory without replacing the last successful output", () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "eiam-headers-collision-"));
    const vaultDir = path.join(workDir, "vault");
    const outDir = path.join(workDir, "dist");
    const configPath = path.join(workDir, "blog.config.mjs");

    try {
      writeText(
        path.join(vaultDir, "collision.md"),
        `---
publish: true
prefix: COLLISION-01
category_path: deployment
---

Last successful output.
`,
      );
      runBuild(workDir, vaultDir, outDir);
      const generatedHeaders = fs.readFileSync(path.join(outDir, "_headers"), "utf8");

      writeText(configPath, 'export default { staticPaths: ["_headers"] };\n');
      writeText(path.join(vaultDir, "_headers", "keep.txt"), "must not replace output\n");
      const rejected = invokeBuild(workDir, vaultDir, outDir);

      expect(rejected.status).not.toBe(0);
      expect(rejected.output).toContain(
        '"_headers" must be a file when used as a custom Cloudflare Pages header policy',
      );
      expect(fs.readFileSync(path.join(outDir, "_headers"), "utf8")).toBe(generatedHeaders);
      expect(fs.existsSync(path.join(outDir, "_headers", "keep.txt"))).toBe(false);
    } finally {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  });

  test("migrates a legacy _headers directory to the generated policy file", () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "eiam-headers-migration-"));
    const vaultDir = path.join(workDir, "vault");
    const outDir = path.join(workDir, "dist");
    const headersPath = path.join(outDir, "_headers");
    const legacyContents = "legacy child output\n";

    try {
      writeText(
        path.join(vaultDir, "migration.md"),
        `---
publish: true
prefix: MIGRATION-01
category_path: deployment
---

Legacy header migration.
`,
      );
      runBuild(workDir, vaultDir, outDir);
      const expectedGeneratedHeaders = fs.readFileSync(headersPath, "utf8");

      fs.rmSync(headersPath);
      writeText(path.join(headersPath, "keep.txt"), legacyContents);
      const cachePath = findBuildCacheIndex(workDir);
      const cache = JSON.parse(fs.readFileSync(cachePath, "utf8")) as {
        outputHashes: Record<string, string>;
      };
      delete cache.outputHashes._headers;
      cache.outputHashes["_headers/keep.txt"] = crypto
        .createHash("sha1")
        .update(legacyContents)
        .digest("hex");
      writeText(cachePath, `${JSON.stringify(cache, null, 2)}\n`);

      runBuild(workDir, vaultDir, outDir);
      expect(fs.statSync(headersPath).isFile()).toBe(true);
      expect(fs.readFileSync(headersPath, "utf8")).toBe(expectedGeneratedHeaders);
      expect(fs.existsSync(path.join(headersPath, "keep.txt"))).toBe(false);
    } finally {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  });
});
