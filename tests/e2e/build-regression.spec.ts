import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";

interface CliResult {
  status: number | null;
  output: string;
}

function writeText(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function extractRuntimeAssetPath(html: string, extension: "js" | "css"): string {
  const pattern = new RegExp(`assets\\/app\\.[a-f0-9]+\\.${extension}`);
  const match = html.match(pattern);
  if (!match) {
    throw new Error(`런타임 ${extension} 자산 경로를 찾지 못했습니다.`);
  }
  return match[0];
}

function runCli(cwd: string, args: string[], timeout?: number): CliResult {
  const result = spawnSync("bun", args, {
    cwd,
    encoding: "utf8",
    timeout,
  });

  return {
    status: result.status,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
}

function readDocContentHtml(outDir: string, route: string): string {
  const manifest = readManifest(outDir) as {
    docs: Array<{ route: string; contentUrl: string }>;
  };
  const doc = manifest.docs.find((entry) => entry.route === route);
  if (!doc) {
    throw new Error(`route ${route} 문서를 manifest에서 찾지 못했습니다.`);
  }

  return fs.readFileSync(path.join(outDir, doc.contentUrl.replace(/^\/+/, "")), "utf8");
}

function readManifest(outDir: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(outDir, "manifest.json"), "utf8")) as unknown;
}

function findCacheIndexPaths(workDir: string): string[] {
  const cacheRoot = path.join(workDir, ".cache", "eiam");
  if (!fs.existsSync(cacheRoot)) {
    return [];
  }

  return fs
    .readdirSync(cacheRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(cacheRoot, entry.name, "build-index.json"))
    .filter((cachePath) => fs.existsSync(cachePath))
    .sort();
}

function findOnlyCacheIndexPath(workDir: string): string {
  const cachePaths = findCacheIndexPaths(workDir);
  expect(cachePaths).toHaveLength(1);
  return cachePaths[0];
}

function findFolderNodeByPath(
  nodes: Array<{ type: string; path?: string; children?: Array<{ type: string; path?: string; children?: unknown[] }> }>,
  targetPath: string,
): { type: string; path?: string; children?: Array<{ type: string; path?: string; children?: unknown[] }> } | null {
  for (const node of nodes) {
    if (node.type === "folder" && node.path === targetPath) {
      return node;
    }
    if (node.type === "folder" && Array.isArray(node.children)) {
      const found = findFolderNodeByPath(
        node.children as Array<{ type: string; path?: string; children?: Array<{ type: string; path?: string; children?: unknown[] }> }>,
        targetPath,
      );
      if (found) {
        return found;
      }
    }
  }

  return null;
}

test.describe("빌드 회귀 가드", () => {
  const repoRoot = process.cwd();
  const cliPath = path.join(repoRoot, "src/cli.ts");
  const vaultPath = path.join(repoRoot, "test-vault");

  test("증분 빌드에서 누락된 content 파일을 복구한다", async () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "mfs-build-regression-"));
    const outDir = path.join(workDir, "dist");

    try {
      const firstBuild = runCli(workDir, [cliPath, "build", "--vault", vaultPath, "--out", outDir]);
      expect(firstBuild.status, firstBuild.output).toBe(0);

      const contentDir = path.join(outDir, "content");
      const contentFiles = fs.readdirSync(contentDir).filter((fileName) => fileName.endsWith(".html"));
      expect(contentFiles.length).toBeGreaterThan(0);

      const missingFile = contentFiles[0];
      const missingFilePath = path.join(contentDir, missingFile);
      fs.rmSync(missingFilePath);
      expect(fs.existsSync(missingFilePath)).toBe(false);

      const secondBuild = runCli(workDir, [cliPath, "build", "--vault", vaultPath, "--out", outDir]);
      expect(secondBuild.status, secondBuild.output).toBe(0);
      expect(fs.existsSync(missingFilePath)).toBe(true);
    } finally {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  });

  test("증분 빌드에서 누락된 해시 런타임 자산(js/css)을 복구한다", async () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "mfs-build-runtime-regression-"));
    const outDir = path.join(workDir, "dist");

    try {
      const firstBuild = runCli(workDir, [cliPath, "build", "--vault", vaultPath, "--out", outDir]);
      expect(firstBuild.status, firstBuild.output).toBe(0);

      const entryHtmlPath = path.join(outDir, "BC-VO-00", "index.html");
      expect(fs.existsSync(entryHtmlPath)).toBe(true);
      const entryHtml = fs.readFileSync(entryHtmlPath, "utf8");

      const runtimeJsRelPath = extractRuntimeAssetPath(entryHtml, "js");
      const runtimeCssRelPath = extractRuntimeAssetPath(entryHtml, "css");
      const runtimeJsPath = path.join(outDir, runtimeJsRelPath);
      const runtimeCssPath = path.join(outDir, runtimeCssRelPath);

      expect(fs.existsSync(runtimeJsPath)).toBe(true);
      expect(fs.existsSync(runtimeCssPath)).toBe(true);

      fs.rmSync(runtimeJsPath);
      fs.rmSync(runtimeCssPath);
      expect(fs.existsSync(runtimeJsPath)).toBe(false);
      expect(fs.existsSync(runtimeCssPath)).toBe(false);

      const secondBuild = runCli(workDir, [cliPath, "build", "--vault", vaultPath, "--out", outDir]);
      expect(secondBuild.status, secondBuild.output).toBe(0);
      expect(fs.existsSync(runtimeJsPath)).toBe(true);
      expect(fs.existsSync(runtimeCssPath)).toBe(true);
    } finally {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  });

  test("clean은 EIAM 소유 출력과 matching cache namespace만 제거한다", async () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "mfs-safe-clean-"));
    const outDir = path.join(workDir, "dist");
    const legacyCacheFile = path.join(workDir, ".cache", "build-index.json");
    const unrelatedCacheFile = path.join(workDir, ".cache", "keep.txt");
    const legacyCacheContents = `${JSON.stringify({
      version: 4,
      sources: {},
      docs: {},
      outputHashes: {},
    })}\n`;

    try {
      writeText(legacyCacheFile, legacyCacheContents);
      writeText(unrelatedCacheFile, "unrelated cache data");
      const build = runCli(workDir, [cliPath, "build", "--vault", vaultPath, "--out", outDir]);
      expect(build.status, build.output).toBe(0);
      expect(fs.existsSync(legacyCacheFile)).toBe(false);
      expect(fs.readFileSync(unrelatedCacheFile, "utf8")).toBe("unrelated cache data");
      const markerPath = path.join(outDir, ".eiam-output.json");
      expect(fs.existsSync(markerPath)).toBe(true);
      const marker = JSON.parse(fs.readFileSync(markerPath, "utf8")) as {
        version: number;
        cacheNamespace: string;
      };
      expect(marker.version).toBe(2);
      expect(marker.cacheNamespace).toMatch(/^v2-[a-f0-9]{40}$/);
      const cachePath = findOnlyCacheIndexPath(workDir);

      writeText(legacyCacheFile, legacyCacheContents);
      const clean = runCli(workDir, [cliPath, "clean", "--vault", vaultPath, "--out", outDir]);
      expect(clean.status, clean.output).toBe(0);
      expect(fs.existsSync(outDir)).toBe(false);
      expect(fs.existsSync(cachePath)).toBe(false);
      expect(fs.existsSync(legacyCacheFile)).toBe(false);
      expect(fs.readFileSync(unrelatedCacheFile, "utf8")).toBe("unrelated cache data");

      const foreignLegacyNamedContents = `${JSON.stringify({ tool: "another-cache", entries: ["keep"] })}\n`;
      writeText(legacyCacheFile, foreignLegacyNamedContents);
      const repeatedClean = runCli(workDir, [cliPath, "clean", "--vault", vaultPath, "--out", outDir]);
      expect(repeatedClean.status, repeatedClean.output).toBe(0);
      expect(fs.readFileSync(legacyCacheFile, "utf8")).toBe(foreignLegacyNamedContents);

      const preMarkerOutDir = path.join(workDir, "pre-marker-dist");
      const preMarkerSentinel = path.join(preMarkerOutDir, "keep.txt");
      writeText(preMarkerSentinel, "keep legacy output");
      writeText(legacyCacheFile, legacyCacheContents);
      const preMarkerClean = runCli(workDir, [
        cliPath,
        "clean",
        "--vault",
        vaultPath,
        "--out",
        preMarkerOutDir,
      ]);
      expect(preMarkerClean.status).not.toBe(0);
      expect(preMarkerClean.output).toContain("matching .eiam-output.json");
      expect(fs.existsSync(legacyCacheFile)).toBe(false);
      expect(fs.readFileSync(preMarkerSentinel, "utf8")).toBe("keep legacy output");

      writeText(legacyCacheFile, legacyCacheContents);
      const preMarkerBuild = runCli(workDir, [
        cliPath,
        "build",
        "--vault",
        vaultPath,
        "--out",
        preMarkerOutDir,
      ]);
      expect(preMarkerBuild.status).not.toBe(0);
      expect(preMarkerBuild.output).toContain("matching .eiam-output.json");
      expect(fs.existsSync(legacyCacheFile)).toBe(false);
      expect(fs.readFileSync(preMarkerSentinel, "utf8")).toBe("keep legacy output");
    } finally {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  });

  test("build와 clean은 broad 또는 미소유 출력 디렉터리를 거부한다", async () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "mfs-safe-output-"));
    const unownedOutDir = path.join(workDir, "unowned");
    const unownedSentinel = path.join(unownedOutDir, "keep.txt");
    const cwdSentinel = path.join(workDir, "cwd-keep.txt");
    const foreignLegacyNamedCache = path.join(workDir, ".cache", "build-index.json");
    const foreignLegacyNamedContents = `${JSON.stringify({ tool: "another-cache", entries: ["keep"] })}\n`;

    try {
      writeText(unownedSentinel, "do not remove");
      writeText(cwdSentinel, "keep cwd");
      writeText(foreignLegacyNamedCache, foreignLegacyNamedContents);

      const buildIntoUnowned = runCli(workDir, [
        cliPath,
        "build",
        "--vault",
        vaultPath,
        "--out",
        unownedOutDir,
      ]);
      expect(buildIntoUnowned.status).not.toBe(0);
      expect(buildIntoUnowned.output).toContain("Refusing non-empty output directory");
      expect(fs.readFileSync(unownedSentinel, "utf8")).toBe("do not remove");
      expect(fs.readFileSync(foreignLegacyNamedCache, "utf8")).toBe(foreignLegacyNamedContents);

      const devIntoUnowned = runCli(
        workDir,
        [cliPath, "dev", "--vault", vaultPath, "--out", unownedOutDir, "--port", "49231"],
        5_000,
      );
      expect(devIntoUnowned.status).not.toBeNull();
      expect(devIntoUnowned.status).not.toBe(0);
      expect(devIntoUnowned.output).toContain("Refusing non-empty output directory");
      expect(fs.readFileSync(unownedSentinel, "utf8")).toBe("do not remove");
      expect(fs.readFileSync(foreignLegacyNamedCache, "utf8")).toBe(foreignLegacyNamedContents);

      const cleanUnowned = runCli(workDir, [
        cliPath,
        "clean",
        "--vault",
        vaultPath,
        "--out",
        unownedOutDir,
      ]);
      expect(cleanUnowned.status).not.toBe(0);
      expect(cleanUnowned.output).toContain("Refusing to clean output directory");
      expect(fs.readFileSync(unownedSentinel, "utf8")).toBe("do not remove");
      expect(fs.readFileSync(foreignLegacyNamedCache, "utf8")).toBe(foreignLegacyNamedContents);

      for (const cacheContainingOutDir of [
        path.join(workDir, ".cache"),
        path.join(workDir, ".cache", "eiam"),
      ]) {
        const buildIntoCacheRoot = runCli(workDir, [
          cliPath,
          "build",
          "--vault",
          vaultPath,
          "--out",
          cacheContainingOutDir,
        ]);
        expect(buildIntoCacheRoot.status).not.toBe(0);
        expect(buildIntoCacheRoot.output).toContain("Refusing dangerous output directory");

        const cleanCacheRoot = runCli(workDir, [
          cliPath,
          "clean",
          "--vault",
          vaultPath,
          "--out",
          cacheContainingOutDir,
        ]);
        expect(cleanCacheRoot.status).not.toBe(0);
        expect(cleanCacheRoot.output).toContain("Refusing dangerous output directory");
        expect(fs.readFileSync(foreignLegacyNamedCache, "utf8")).toBe(foreignLegacyNamedContents);
      }

      const cleanCwd = runCli(workDir, [cliPath, "clean", "--vault", vaultPath, "--out", workDir]);
      expect(cleanCwd.status).not.toBe(0);
      expect(cleanCwd.output).toContain("Refusing dangerous output directory");
      expect(fs.readFileSync(cwdSentinel, "utf8")).toBe("keep cwd");
      expect(fs.readFileSync(foreignLegacyNamedCache, "utf8")).toBe(foreignLegacyNamedContents);

      const namespaceGuardOutDir = path.join(workDir, "namespace-guard-dist");
      const namespaceSeedBuild = runCli(workDir, [
        cliPath,
        "build",
        "--vault",
        vaultPath,
        "--out",
        namespaceGuardOutDir,
      ]);
      expect(namespaceSeedBuild.status, namespaceSeedBuild.output).toBe(0);
      const namespaceMarker = JSON.parse(
        fs.readFileSync(path.join(namespaceGuardOutDir, ".eiam-output.json"), "utf8"),
      ) as { cacheNamespace: string };
      expect(namespaceMarker.cacheNamespace).toMatch(/^v2-[a-f0-9]{40}$/);

      const namespaceSeedClean = runCli(workDir, [
        cliPath,
        "clean",
        "--vault",
        vaultPath,
        "--out",
        namespaceGuardOutDir,
      ]);
      expect(namespaceSeedClean.status, namespaceSeedClean.output).toBe(0);
      expect(fs.existsSync(namespaceGuardOutDir)).toBe(false);

      const cacheRoot = path.join(workDir, ".cache", "eiam");
      const externalNamespaceTarget = path.join(workDir, "external-namespace-target");
      const externalNamespaceSentinel = path.join(externalNamespaceTarget, "keep.txt");
      const symlinkedNamespace = path.join(cacheRoot, namespaceMarker.cacheNamespace);
      writeText(externalNamespaceSentinel, "keep external namespace data");
      fs.mkdirSync(cacheRoot, { recursive: true });
      fs.symlinkSync(externalNamespaceTarget, symlinkedNamespace, "dir");

      const buildWithSymlinkedNamespace = runCli(workDir, [
        cliPath,
        "build",
        "--vault",
        vaultPath,
        "--out",
        namespaceGuardOutDir,
      ]);
      expect(buildWithSymlinkedNamespace.status).not.toBe(0);
      expect(buildWithSymlinkedNamespace.output).toContain("Refusing symlinked cache namespace");
      expect(fs.existsSync(namespaceGuardOutDir)).toBe(false);
      expect(fs.lstatSync(symlinkedNamespace).isSymbolicLink()).toBe(true);
      expect(fs.readFileSync(externalNamespaceSentinel, "utf8")).toBe("keep external namespace data");

      const cleanWithSymlinkedNamespace = runCli(workDir, [
        cliPath,
        "clean",
        "--vault",
        vaultPath,
        "--out",
        namespaceGuardOutDir,
      ]);
      expect(cleanWithSymlinkedNamespace.status).not.toBe(0);
      expect(cleanWithSymlinkedNamespace.output).toContain("Refusing symlinked cache namespace");
      expect(fs.lstatSync(symlinkedNamespace).isSymbolicLink()).toBe(true);
      expect(fs.readFileSync(externalNamespaceSentinel, "utf8")).toBe("keep external namespace data");

      fs.unlinkSync(symlinkedNamespace);
      fs.rmdirSync(cacheRoot);

      const externalCacheTarget = path.join(workDir, "external-cache-target");
      const symlinkedCacheRoot = path.join(workDir, ".cache", "eiam");
      const symlinkGuardOutDir = path.join(workDir, "symlink-guard-dist");
      fs.mkdirSync(externalCacheTarget, { recursive: true });
      fs.symlinkSync(externalCacheTarget, symlinkedCacheRoot, "dir");

      const buildWithSymlinkedCache = runCli(workDir, [
        cliPath,
        "build",
        "--vault",
        vaultPath,
        "--out",
        symlinkGuardOutDir,
      ]);
      expect(buildWithSymlinkedCache.status).not.toBe(0);
      expect(buildWithSymlinkedCache.output).toContain("Refusing symlinked cache path");
      expect(fs.existsSync(symlinkGuardOutDir)).toBe(false);
      expect(fs.readdirSync(externalCacheTarget)).toEqual([]);

      const cleanWithSymlinkedCache = runCli(workDir, [
        cliPath,
        "clean",
        "--vault",
        vaultPath,
        "--out",
        symlinkGuardOutDir,
      ]);
      expect(cleanWithSymlinkedCache.status).not.toBe(0);
      expect(cleanWithSymlinkedCache.output).toContain("Refusing symlinked cache path");
      expect(fs.readdirSync(externalCacheTarget)).toEqual([]);
      expect(fs.readFileSync(foreignLegacyNamedCache, "utf8")).toBe(foreignLegacyNamedContents);
    } finally {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  });

  test("실패한 첫 build는 vault 검증 전에 output을 claim하지 않는다", async () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "mfs-invalid-vault-output-"));
    const missingVaultDir = path.join(workDir, "missing-vault");
    const outDir = path.join(workDir, "dist");

    try {
      const failedBuild = runCli(workDir, [
        cliPath,
        "build",
        "--vault",
        missingVaultDir,
        "--out",
        outDir,
      ]);
      expect(failedBuild.status).not.toBe(0);
      expect(fs.existsSync(outDir)).toBe(false);
      expect(findCacheIndexPaths(workDir)).toEqual([]);

      const correctedBuild = runCli(workDir, [cliPath, "build", "--vault", vaultPath, "--out", outDir]);
      expect(correctedBuild.status, correctedBuild.output).toBe(0);
      expect(fs.existsSync(path.join(outDir, ".eiam-output.json"))).toBe(true);
    } finally {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  });

  test("vault와 output 경로 쌍마다 cache namespace를 분리하고 clean은 선택한 namespace만 제거한다", async () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "mfs-cache-namespace-"));
    const vaultA = path.join(workDir, "vault-a");
    const vaultB = path.join(workDir, "vault-b");
    const outA = path.join(workDir, "dist-a");
    const outB = path.join(workDir, "dist-b");
    const outAAlternate = path.join(workDir, "dist-a-alternate");
    const alternateCwd = path.join(workDir, "alternate-cwd");
    const sourceA = path.join(vaultA, "same.md");
    const sourceB = path.join(vaultB, "same.md");
    const fixedTime = new Date("2024-01-02T03:04:05.000Z");

    try {
      const bodyA = `---
publish: true
prefix: NS-CACHE-A
category_path: cache/namespace
title: Vault A
---

VAULT_A_BODY
`;
      const bodyB = `---
publish: true
prefix: NS-CACHE-B
category_path: cache/namespace
title: Vault B
---

VAULT_B_BODY
`;
      expect(Buffer.byteLength(bodyA)).toBe(Buffer.byteLength(bodyB));
      writeText(sourceA, bodyA);
      writeText(sourceB, bodyB);
      fs.mkdirSync(alternateCwd, { recursive: true });
      fs.utimesSync(sourceA, fixedTime, fixedTime);
      fs.utimesSync(sourceB, fixedTime, fixedTime);

      const buildA = runCli(workDir, [cliPath, "build", "--vault", vaultA, "--out", outA]);
      expect(buildA.status, buildA.output).toBe(0);
      expect(buildA.output).toContain("total=1 rendered=1 skipped=0");
      const [cacheA] = findCacheIndexPaths(workDir);
      expect(cacheA).toBeDefined();
      expect(fs.readFileSync(cacheA, "utf8")).toContain("VAULT_A_BODY");

      const markerAPath = path.join(outA, ".eiam-output.json");
      const markerABefore = fs.readFileSync(markerAPath, "utf8");
      const wrongVaultBuild = runCli(workDir, [cliPath, "build", "--vault", vaultB, "--out", outA]);
      expect(wrongVaultBuild.status).not.toBe(0);
      expect(wrongVaultBuild.output).toContain("matching .eiam-output.json");
      expect(fs.readFileSync(markerAPath, "utf8")).toBe(markerABefore);
      const manifestAfterWrongBuild = readManifest(outA) as { docs: Array<{ route: string }> };
      expect(manifestAfterWrongBuild.docs.map((doc) => doc.route)).toEqual(["/NS-CACHE-A/"]);

      const wrongVaultClean = runCli(workDir, [cliPath, "clean", "--vault", vaultB, "--out", outA]);
      expect(wrongVaultClean.status).not.toBe(0);
      expect(wrongVaultClean.output).toContain("matching .eiam-output.json");
      expect(fs.existsSync(outA)).toBe(true);
      expect(fs.existsSync(cacheA)).toBe(true);

      const wrongCwdBuild = runCli(alternateCwd, [
        cliPath,
        "build",
        "--vault",
        vaultA,
        "--out",
        outA,
      ]);
      expect(wrongCwdBuild.status).not.toBe(0);
      expect(wrongCwdBuild.output).toContain("matching .eiam-output.json");
      expect(fs.readFileSync(markerAPath, "utf8")).toBe(markerABefore);
      expect(fs.existsSync(path.join(alternateCwd, ".cache", "eiam"))).toBe(false);
      expect((readManifest(outA) as { docs: Array<{ route: string }> }).docs.map((doc) => doc.route)).toEqual([
        "/NS-CACHE-A/",
      ]);

      const wrongCwdClean = runCli(alternateCwd, [
        cliPath,
        "clean",
        "--vault",
        vaultA,
        "--out",
        outA,
      ]);
      expect(wrongCwdClean.status).not.toBe(0);
      expect(wrongCwdClean.output).toContain("matching .eiam-output.json");
      expect(fs.existsSync(outA)).toBe(true);
      expect(fs.existsSync(cacheA)).toBe(true);

      const buildB = runCli(workDir, [cliPath, "build", "--vault", vaultB, "--out", outB]);
      expect(buildB.status, buildB.output).toBe(0);
      const afterBuildB = findCacheIndexPaths(workDir);
      expect(afterBuildB).toHaveLength(2);
      const cacheB = afterBuildB.find((cachePath) => cachePath !== cacheA);
      expect(cacheB).toBeDefined();
      expect(fs.readFileSync(cacheB!, "utf8")).toContain("VAULT_B_BODY");
      const manifestB = readManifest(outB) as { docs: Array<{ route: string }> };
      expect(manifestB.docs.map((doc) => doc.route)).toEqual(["/NS-CACHE-B/"]);

      const alternateBuild = runCli(workDir, [
        cliPath,
        "build",
        "--vault",
        vaultA,
        "--out",
        outAAlternate,
      ]);
      expect(alternateBuild.status, alternateBuild.output).toBe(0);
      const afterAlternate = findCacheIndexPaths(workDir);
      expect(afterAlternate).toHaveLength(3);
      const cacheAAlternate = afterAlternate.find(
        (cachePath) => cachePath !== cacheA && cachePath !== cacheB,
      );
      expect(cacheAAlternate).toBeDefined();

      const rebuildA = runCli(workDir, [cliPath, "build", "--vault", vaultA, "--out", outA]);
      expect(rebuildA.status, rebuildA.output).toBe(0);
      expect(rebuildA.output).toContain("total=1 rendered=0 skipped=1");
      const manifestA = readManifest(outA) as { docs: Array<{ route: string }> };
      expect(manifestA.docs.map((doc) => doc.route)).toEqual(["/NS-CACHE-A/"]);

      const unrelatedCacheFile = path.join(workDir, ".cache", "keep.txt");
      writeText(unrelatedCacheFile, "unrelated cache data");
      const cleanA = runCli(workDir, [cliPath, "clean", "--vault", vaultA, "--out", outA]);
      expect(cleanA.status, cleanA.output).toBe(0);
      expect(fs.existsSync(outA)).toBe(false);
      expect(fs.existsSync(cacheA)).toBe(false);
      expect(fs.existsSync(cacheB!)).toBe(true);
      expect(fs.existsSync(cacheAAlternate!)).toBe(true);
      expect(fs.existsSync(outB)).toBe(true);
      expect(fs.existsSync(outAAlternate)).toBe(true);
      expect(fs.readFileSync(unrelatedCacheFile, "utf8")).toBe("unrelated cache data");

      const rebuildB = runCli(workDir, [cliPath, "build", "--vault", vaultB, "--out", outB]);
      expect(rebuildB.status, rebuildB.output).toBe(0);
      expect(rebuildB.output).toContain("total=1 rendered=0 skipped=1");
    } finally {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  });

  test("같은 size와 mtime을 유지한 body, wikilink, frontmatter 변경도 다시 빌드한다", async () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "mfs-content-fingerprint-"));
    const vaultDir = path.join(workDir, "vault");
    const outDir = path.join(workDir, "dist");
    const fixedTime = new Date("2024-02-03T04:05:06.000Z");
    const mutablePath = path.join(vaultDir, "mutable.md");
    const linkerPath = path.join(vaultDir, "linker.md");
    const frontmatterPath = path.join(vaultDir, "frontmatter.md");

    const mutableBefore = `---
publish: true
prefix: FP-MUTABLE
category_path: cache/fingerprint
title: Mutable
---

ALPHA
`;
    const mutableAfter = mutableBefore.replace("ALPHA", "BRAVO");
    const linkerBefore = `---
publish: true
prefix: FP-LINKER
category_path: cache/fingerprint
title: Linker
---

[[Target A]]
`;
    const linkerAfter = linkerBefore.replace("Target A", "Target B");
    const frontmatterBefore = `---
publish: true
prefix: FP-ROUTE-A
category_path: cache/fingerprint
title: Frontmatter
---

UNCHANGED_BODY
`;
    const frontmatterAfter = frontmatterBefore.replace("FP-ROUTE-A", "FP-ROUTE-B");

    try {
      writeText(
        path.join(vaultDir, "target-a.md"),
        `---
publish: true
prefix: FP-TARGET-A
category_path: cache/fingerprint
title: Target A
---

TARGET_A_BODY
`,
      );
      writeText(
        path.join(vaultDir, "target-b.md"),
        `---
publish: true
prefix: FP-TARGET-B
category_path: cache/fingerprint
title: Target B
---

TARGET_B_BODY
`,
      );

      for (const [sourcePath, before, after] of [
        [mutablePath, mutableBefore, mutableAfter],
        [linkerPath, linkerBefore, linkerAfter],
        [frontmatterPath, frontmatterBefore, frontmatterAfter],
      ] as const) {
        expect(Buffer.byteLength(before)).toBe(Buffer.byteLength(after));
        writeText(sourcePath, before);
        fs.utimesSync(sourcePath, fixedTime, fixedTime);
      }

      const initialStats = new Map(
        [mutablePath, linkerPath, frontmatterPath].map((sourcePath) => [sourcePath, fs.statSync(sourcePath)]),
      );
      const firstBuild = runCli(workDir, [cliPath, "build", "--vault", vaultDir, "--out", outDir]);
      expect(firstBuild.status, firstBuild.output).toBe(0);
      expect(readDocContentHtml(outDir, "/FP-MUTABLE/")).toContain("ALPHA");
      expect(readDocContentHtml(outDir, "/FP-LINKER/")).toContain('href="/FP-TARGET-A/"');
      expect(fs.existsSync(path.join(outDir, "FP-ROUTE-A", "index.html"))).toBe(true);

      for (const [sourcePath, replacement] of [
        [mutablePath, mutableAfter],
        [linkerPath, linkerAfter],
        [frontmatterPath, frontmatterAfter],
      ] as const) {
        writeText(sourcePath, replacement);
        fs.utimesSync(sourcePath, fixedTime, fixedTime);
        const previous = initialStats.get(sourcePath)!;
        const current = fs.statSync(sourcePath);
        expect(current.size).toBe(previous.size);
        expect(current.mtimeMs).toBe(previous.mtimeMs);
      }

      const changedBuild = runCli(workDir, [cliPath, "build", "--vault", vaultDir, "--out", outDir]);
      expect(changedBuild.status, changedBuild.output).toBe(0);
      expect(changedBuild.output).toContain("total=5 rendered=3 skipped=2");
      expect(readDocContentHtml(outDir, "/FP-MUTABLE/")).toContain("BRAVO");
      const linkerHtml = readDocContentHtml(outDir, "/FP-LINKER/");
      expect(linkerHtml).toContain('href="/FP-TARGET-B/"');
      expect(linkerHtml).not.toContain('href="/FP-TARGET-A/"');
      expect(fs.existsSync(path.join(outDir, "FP-ROUTE-A", "index.html"))).toBe(false);
      expect(fs.existsSync(path.join(outDir, "FP-ROUTE-B", "index.html"))).toBe(true);

      const manifest = readManifest(outDir) as {
        docs: Array<{ route: string; backlinks: Array<{ route: string }> }>;
      };
      const targetA = manifest.docs.find((doc) => doc.route === "/FP-TARGET-A/");
      const targetB = manifest.docs.find((doc) => doc.route === "/FP-TARGET-B/");
      expect(targetA?.backlinks).toEqual([]);
      expect(targetB?.backlinks.map((backlink) => backlink.route)).toEqual(["/FP-LINKER/"]);
    } finally {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  });

  test("ordinary no-op 빌드는 fingerprint 후 parse와 render를 건너뛴다", async () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "mfs-noop-performance-"));
    const vaultDir = path.join(workDir, "vault");
    const outDir = path.join(workDir, "dist");
    const docCount = 40;

    try {
      for (let index = 0; index < docCount; index += 1) {
        const id = String(index).padStart(2, "0");
        writeText(
          path.join(vaultDir, `doc-${id}.md`),
          `---
publish: true
prefix: PERF-${id}
category_path: cache/performance
title: Performance ${id}
---

PERFORMANCE_BODY_${id}
`,
        );
      }

      const firstBuild = runCli(workDir, [cliPath, "build", "--vault", vaultDir, "--out", outDir]);
      expect(firstBuild.status, firstBuild.output).toBe(0);

      const startedAt = performance.now();
      const noOpBuild = runCli(workDir, [cliPath, "build", "--vault", vaultDir, "--out", outDir]);
      const elapsedMs = performance.now() - startedAt;
      console.info(`[perf] no-op incremental docs=${docCount} elapsedMs=${elapsedMs.toFixed(1)}`);

      expect(noOpBuild.status, noOpBuild.output).toBe(0);
      expect(noOpBuild.output).toContain(`total=${docCount} rendered=0 skipped=${docCount}`);
      expect(elapsedMs).toBeLessThan(10_000);
    } finally {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  });

  test("raw HTML은 기본 sanitize되고 명시적 unsafe 설정에서만 유지된다", async () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "mfs-html-sanitize-"));
    const vaultDir = path.join(workDir, "vault");
    const safeWorkDir = path.join(workDir, "safe");
    const unsafeWorkDir = path.join(workDir, "unsafe");
    const rawPayload = `---
publish: true
prefix: SAFE-HTML-01
category_path: security/html
title: HTML Policy
---

<div class="safe-format"><strong>Allowed formatting</strong></div>
<script>window.__script_payload = 1</script>
<img src="https://example.com/safe.png" alt="safe" onerror="window.__event_payload = 1" />
<a href="javascript:window.__url_payload = 1">Unsafe URL</a>
<iframe src="https://example.com/unsafe"></iframe>
`;

    try {
      writeText(path.join(vaultDir, "unsafe.md"), rawPayload);
      fs.mkdirSync(safeWorkDir, { recursive: true });
      fs.mkdirSync(unsafeWorkDir, { recursive: true });

      const safeOutDir = path.join(safeWorkDir, "dist");
      const safeBuild = runCli(safeWorkDir, [cliPath, "build", "--vault", vaultDir, "--out", safeOutDir]);
      expect(safeBuild.status, safeBuild.output).toBe(0);
      const safeContent = readDocContentHtml(safeOutDir, "/SAFE-HTML-01/");
      const safeRoute = fs.readFileSync(path.join(safeOutDir, "SAFE-HTML-01", "index.html"), "utf8");
      for (const rendered of [safeContent, safeRoute]) {
        expect(rendered).toContain('<div class="safe-format"><strong>Allowed formatting</strong></div>');
        expect(rendered).not.toContain("window.__script_payload");
        expect(rendered).not.toContain("window.__event_payload");
        expect(rendered).not.toContain("javascript:window.__url_payload");
        expect(rendered).not.toContain("https://example.com/unsafe");
      }

      writeText(
        path.join(unsafeWorkDir, "blog.config.mjs"),
        "export default { markdown: { allowUnsafeHtml: true } };\n",
      );
      const unsafeOutDir = path.join(unsafeWorkDir, "dist");
      const unsafeBuild = runCli(unsafeWorkDir, [
        cliPath,
        "build",
        "--vault",
        vaultDir,
        "--out",
        unsafeOutDir,
      ]);
      expect(unsafeBuild.status, unsafeBuild.output).toBe(0);
      expect(unsafeBuild.output).toContain("allowUnsafeHtml=true disables rendered HTML sanitization");
      const unsafeContent = readDocContentHtml(unsafeOutDir, "/SAFE-HTML-01/");
      expect(unsafeContent).toContain("<script>window.__script_payload = 1</script>");
      expect(unsafeContent).toContain('onerror="window.__event_payload = 1"');
      expect(unsafeContent).toContain('href="javascript:window.__url_payload = 1"');
      expect(unsafeContent).toContain('<iframe src="https://example.com/unsafe"></iframe>');
    } finally {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  });

  test("cache에는 unpublished와 draft Markdown 본문을 저장하지 않는다", async () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "mfs-private-cache-"));
    const vaultDir = path.join(workDir, "vault");
    const outDir = path.join(workDir, "dist");
    const publicPath = path.join(vaultDir, "public.md");
    const privatePath = path.join(vaultDir, "private.md");
    const draftPath = path.join(vaultDir, "draft.md");

    try {
      writeText(
        publicPath,
        `---
publish: true
prefix: CACHE-PUBLIC
category_path: cache/public
title: Public Cache
---

PUBLIC_CACHE_BODY
`,
      );
      writeText(
        privatePath,
        `---
publish: false
title: Private Cache
---

PRIVATE_CACHE_SECRET
`,
      );
      writeText(
        draftPath,
        `---
publish: true
draft: true
title: Draft Cache
---

DRAFT_CACHE_SECRET
`,
      );

      const firstBuild = runCli(workDir, [cliPath, "build", "--vault", vaultDir, "--out", outDir]);
      expect(firstBuild.status, firstBuild.output).toBe(0);
      const cachePath = findOnlyCacheIndexPath(workDir);
      const firstCache = fs.readFileSync(cachePath, "utf8");
      expect(firstCache).toContain("PUBLIC_CACHE_BODY");
      expect(firstCache).not.toContain("PRIVATE_CACHE_SECRET");
      expect(firstCache).not.toContain("DRAFT_CACHE_SECRET");
      const firstSources = (JSON.parse(firstCache) as { sources: Record<string, unknown> }).sources;
      expect(firstSources["public.md"]).toBeDefined();
      expect(firstSources["private.md"]).toBeUndefined();
      expect(firstSources["draft.md"]).toBeUndefined();

      const incrementalBuild = runCli(workDir, [cliPath, "build", "--vault", vaultDir, "--out", outDir]);
      expect(incrementalBuild.status, incrementalBuild.output).toBe(0);
      expect(incrementalBuild.output).toContain("total=1 rendered=0 skipped=1");

      writeText(
        privatePath,
        `---
publish: true
prefix: CACHE-PRIVATE
category_path: cache/private
title: Published Private Cache
---

PRIVATE_CACHE_SECRET
`,
      );
      writeText(
        publicPath,
        `---
publish: false
prefix: CACHE-PUBLIC
category_path: cache/public
title: Private Public Cache
---

PUBLIC_CACHE_BODY
`,
      );
      writeText(
        draftPath,
        `---
publish: true
draft: false
prefix: CACHE-DRAFT
category_path: cache/draft
title: Published Draft Cache
---

DRAFT_CACHE_SECRET
`,
      );

      const stateBuild = runCli(workDir, [cliPath, "build", "--vault", vaultDir, "--out", outDir]);
      expect(stateBuild.status, stateBuild.output).toBe(0);
      const manifest = readManifest(outDir) as { docs: Array<{ route: string }> };
      expect(manifest.docs.map((doc) => doc.route).sort()).toEqual(["/CACHE-DRAFT/", "/CACHE-PRIVATE/"]);

      const nextCache = fs.readFileSync(cachePath, "utf8");
      expect(nextCache).not.toContain("PUBLIC_CACHE_BODY");
      expect(nextCache).toContain("PRIVATE_CACHE_SECRET");
      expect(nextCache).toContain("DRAFT_CACHE_SECRET");
      const nextSources = (JSON.parse(nextCache) as { sources: Record<string, unknown> }).sources;
      expect(nextSources["public.md"]).toBeUndefined();
      expect(nextSources["private.md"]).toBeDefined();
      expect(nextSources["draft.md"]).toBeDefined();
    } finally {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  });

  test("CLI 숫자 옵션은 잘못된 값을 거부한다", async () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "mfs-cli-validation-"));

    try {
      const invalidRecent = runCli(workDir, [
        cliPath,
        "build",
        "--vault",
        vaultPath,
        "--out",
        path.join(workDir, "dist-recent"),
        "--recent-limit",
        "-1",
      ]);
      expect(invalidRecent.status).not.toBe(0);
      expect(invalidRecent.output).toContain("--recent-limit");
      expect(invalidRecent.output).not.toContain("[cli] Missing value");

      const invalidNewWithinDays = runCli(workDir, [
        cliPath,
        "build",
        "--vault",
        vaultPath,
        "--out",
        path.join(workDir, "dist-new-within-days"),
        "--new-within-days",
        "not-a-number",
      ]);
      expect(invalidNewWithinDays.status).not.toBe(0);
      expect(invalidNewWithinDays.output).toContain("--new-within-days");
    } finally {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  });

  test("build, dev, clean의 모든 값 옵션은 누락되거나 다음 flag인 값을 거부한다", async () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "mfs-cli-missing-values-"));
    const cases = [
      { command: "build", option: "--vault" },
      { command: "dev", option: "--out" },
      { command: "clean", option: "--exclude" },
      { command: "build", option: "--new-within-days" },
      { command: "dev", option: "--recent-limit" },
      { command: "clean", option: "--menu-config" },
      { command: "dev", option: "--port" },
    ] as const;

    try {
      for (const { command, option } of cases) {
        const expectedError = `[cli] Missing value for ${option}`;

        const omitted = runCli(workDir, [cliPath, command, option]);
        expect(omitted.status, `${command} ${option}\n${omitted.output}`).not.toBe(0);
        expect(omitted.output).toContain(expectedError);

        const followedByFlag = runCli(workDir, [cliPath, command, option, "--help"]);
        expect(followedByFlag.status, `${command} ${option} --help\n${followedByFlag.output}`).not.toBe(0);
        expect(followedByFlag.output).toContain(expectedError);
      }
    } finally {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  });

  test("frontmatter title로도 위키링크를 해석하고 duplicate title은 경고 후 미해결 처리한다", async () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "mfs-title-wikilink-"));
    const vaultDir = path.join(workDir, "vault");
    const outDir = path.join(workDir, "dist");

    try {
      writeText(
        path.join(vaultDir, "notes", "index.md"),
        `---
publish: true
prefix: DOC-01
category_path: notes/index
title: Index
---

- [[Linked By Title]]
- [[Linked By Title|Alias Title Link]]
- [[linked-by-title]]
- [[DOC-02]]
`,
      );
      writeText(
        path.join(vaultDir, "notes", "alpha.md"),
        `---
publish: true
prefix: DOC-02
category_path: notes/reference
title: Linked By Title
---

Target document.
`,
      );
      writeText(
        path.join(vaultDir, "notes", "duplicates.md"),
        `---
publish: true
prefix: DOC-05
category_path: notes/index
title: Duplicate Link Source
---

- [[Duplicate Title]]
`,
      );
      writeText(
        path.join(vaultDir, "notes", "duplicate-one.md"),
        `---
publish: true
prefix: DOC-03
category_path: notes/reference
title: Duplicate Title
---
`,
      );
      writeText(
        path.join(vaultDir, "notes", "duplicate-two.md"),
        `---
publish: true
prefix: DOC-04
category_path: notes/archive
title: Duplicate Title
---
`,
      );

      const build = runCli(workDir, [cliPath, "build", "--vault", vaultDir, "--out", outDir]);
      expect(build.status, build.output).toBe(0);

      const indexContent = readDocContentHtml(outDir, "/DOC-01/");
      expect(indexContent).toContain('<a href="/DOC-02/">Linked By Title</a>');
      expect(indexContent).toContain('<a href="/DOC-02/">Alias Title Link</a>');
      expect(indexContent).toContain('<a href="/DOC-02/">Linked By Title</a>');
      expect(indexContent).toContain("<li>linked-by-title</li>");
      expect(build.output).toContain("Unresolved wikilink: linked-by-title");

      const duplicateContent = readDocContentHtml(outDir, "/DOC-05/");
      expect(duplicateContent).toContain("<li>Duplicate Title</li>");
      expect(duplicateContent).not.toContain('href="/DOC-03/"');
      expect(duplicateContent).not.toContain('href="/DOC-04/"');
      expect(build.output).toContain('[wikilink] Duplicate title target "Duplicate Title" in notes/duplicates.md. Candidates: notes/duplicate-one.md, notes/duplicate-two.md');
    } finally {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  });

  test("category_path 기준으로 트리를 만들고 pinnedMenu.categoryPath를 sourceDir보다 우선한다", async () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "mfs-category-path-tree-"));
    const vaultDir = path.join(workDir, "vault");
    const outDir = path.join(workDir, "dist");

    try {
      writeText(
        path.join(workDir, "blog.config.mjs"),
        `export default {
  pinnedMenu: {
    label: "GUIDES",
    sourceDir: "legacy-notice",
    categoryPath: "engineering/guides",
  },
};
`,
      );

      writeText(
        path.join(vaultDir, "legacy-notice", "from-source-dir.md"),
        `---
publish: true
prefix: CAT-01
category_path: announcements/general
title: SourceDir Only
---
`,
      );
      writeText(
        path.join(vaultDir, "misc", "guide-overview.md"),
        `---
publish: true
prefix: CAT-02
category_path: engineering/guides
title: Guide Overview
---
`,
      );
      writeText(
        path.join(vaultDir, "random", "api-detail.md"),
        `---
publish: true
prefix: CAT-03
category_path: engineering/guides/api
title: API Detail
---
`,
      );

      const build = runCli(workDir, [cliPath, "build", "--vault", vaultDir, "--out", outDir]);
      expect(build.status, build.output).toBe(0);

      const manifest = readManifest(outDir) as {
        tree: Array<{
          type: string;
          path?: string;
          name?: string;
          children?: Array<{ type: string; title?: string; path?: string; children?: unknown[] }>;
        }>;
        docs: Array<{ route: string; categoryPath: string }>;
      };

      const pinnedFolder = manifest.tree[0];
      expect(pinnedFolder.type).toBe("folder");
      expect(pinnedFolder.path).toBe("__virtual__/pinned/category/engineering/guides");
      expect(pinnedFolder.children?.map((node) => node.title)).toEqual(["Guide Overview", "API Detail"]);

      const engineeringFolder = findFolderNodeByPath(manifest.tree, "engineering");
      expect(engineeringFolder).not.toBeNull();
      const guidesFolder = findFolderNodeByPath(manifest.tree, "engineering/guides");
      expect(guidesFolder).not.toBeNull();
      expect(guidesFolder?.children?.some((node) => node.title === "Guide Overview")).toBe(true);
      expect(findFolderNodeByPath(manifest.tree, "misc")).toBeNull();

      const apiFolder = findFolderNodeByPath(manifest.tree, "engineering/guides/api");
      expect(apiFolder).not.toBeNull();
      expect(apiFolder?.children?.some((node) => node.title === "API Detail")).toBe(true);

      expect(manifest.docs.find((doc) => doc.route === "/CAT-02/")?.categoryPath).toBe("engineering/guides");
      expect(manifest.docs.find((doc) => doc.route === "/CAT-03/")?.categoryPath).toBe("engineering/guides/api");
    } finally {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  });

  test("publish 문서에 category_path가 없으면 warning 후 제외한다", async () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "mfs-missing-category-path-"));
    const vaultDir = path.join(workDir, "vault");
    const outDir = path.join(workDir, "dist");

    try {
      writeText(
        path.join(vaultDir, "notes", "missing-category.md"),
        `---
publish: true
prefix: CAT-10
title: Missing Category
---
`,
      );

      const build = runCli(workDir, [cliPath, "build", "--vault", vaultDir, "--out", outDir]);
      expect(build.status, build.output).toBe(0);
      expect(build.output).toContain("[publish] Skipped published doc without category_path: notes/missing-category.md");

      const manifest = readManifest(outDir) as { docs: Array<{ route: string }> };
      expect(manifest.docs).toEqual([]);
    } finally {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  });

  test("pinnedMenu.categoryPath가 없으면 legacy sourceDir 기준 pinned menu를 유지한다", async () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "mfs-source-dir-pinned-menu-"));
    const vaultDir = path.join(workDir, "vault");
    const outDir = path.join(workDir, "dist");

    try {
      writeText(
        path.join(workDir, "blog.config.mjs"),
        `export default {
  pinnedMenu: {
    label: "NOTICE",
    sourceDir: "legacy-notice",
  },
};
`,
      );

      writeText(
        path.join(vaultDir, "legacy-notice", "notice-one.md"),
        `---
publish: true
prefix: SRC-01
category_path: announcements/general
title: Legacy Notice One
---
`,
      );
      writeText(
        path.join(vaultDir, "legacy-notice", "notice-two.md"),
        `---
publish: true
prefix: SRC-02
category_path: announcements/releases
title: Legacy Notice Two
---
`,
      );
      writeText(
        path.join(vaultDir, "elsewhere", "should-not-pin.md"),
        `---
publish: true
prefix: SRC-03
category_path: legacy-notice/archive
title: Should Not Pin
---
`,
      );

      const build = runCli(workDir, [cliPath, "build", "--vault", vaultDir, "--out", outDir]);
      expect(build.status, build.output).toBe(0);

      const manifest = readManifest(outDir) as {
        tree: Array<{
          type: string;
          path?: string;
          children?: Array<{ title?: string }>;
        }>;
      };

      const pinnedFolder = manifest.tree[0];
      expect(pinnedFolder.type).toBe("folder");
      expect(pinnedFolder.path).toBe("__virtual__/pinned/source/legacy-notice");
      expect(pinnedFolder.children?.map((node) => node.title)).toEqual(["Legacy Notice One", "Legacy Notice Two"]);
    } finally {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  });

  test("category_path와 pinnedMenu.categoryPath는 정규화된 값으로 동작한다", async () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "mfs-normalized-category-path-"));
    const vaultDir = path.join(workDir, "vault");
    const outDir = path.join(workDir, "dist");

    try {
      writeText(
        path.join(workDir, "blog.config.mjs"),
        `export default {
  pinnedMenu: {
    label: "NORMALIZED",
    categoryPath: "  engineering\\\\guides//api/  ",
  },
};
`,
      );

      writeText(
        path.join(vaultDir, "docs", "api-guide.md"),
        `---
publish: true
prefix: NORM-01
category_path: "  engineering//guides\\\\api/  "
title: Normalized API Guide
---
`,
      );
      writeText(
        path.join(vaultDir, "docs", "api-ref.md"),
        `---
publish: true
prefix: NORM-02
category_path: "engineering/guides/api/reference//"
title: Normalized API Reference
---
`,
      );

      const build = runCli(workDir, [cliPath, "build", "--vault", vaultDir, "--out", outDir]);
      expect(build.status, build.output).toBe(0);

      const manifest = readManifest(outDir) as {
        tree: Array<{
          type: string;
          path?: string;
          children?: Array<{ title?: string; path?: string; children?: unknown[] }>;
        }>;
        docs: Array<{ route: string; categoryPath: string }>;
      };

      expect(manifest.tree[0]?.path).toBe("__virtual__/pinned/category/engineering/guides/api");
      expect(manifest.tree[0]?.children?.map((node) => node.title)).toEqual([
        "Normalized API Guide",
        "Normalized API Reference",
      ]);

      expect(findFolderNodeByPath(manifest.tree, "engineering/guides/api")).not.toBeNull();
      expect(findFolderNodeByPath(manifest.tree, "engineering/guides/api/reference")).not.toBeNull();
      expect(manifest.docs.find((doc) => doc.route === "/NORM-01/")?.categoryPath).toBe("engineering/guides/api");
      expect(manifest.docs.find((doc) => doc.route === "/NORM-02/")?.categoryPath).toBe(
        "engineering/guides/api/reference",
      );
    } finally {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  });

  test("--menu-config JSON override로 categoryPath pinned menu를 적용한다", async () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "mfs-menu-config-category-path-"));
    const vaultDir = path.join(workDir, "vault");
    const outDir = path.join(workDir, "dist");

    try {
      writeText(
        path.join(workDir, "blog.config.mjs"),
        `export default {
  pinnedMenu: {
    label: "LEGACY",
    sourceDir: "legacy-notice",
  },
};
`,
      );
      writeText(
        path.join(workDir, "menu.config.json"),
        JSON.stringify(
          {
            pinnedMenu: {
              label: "GUIDES",
              categoryPath: "engineering/guides",
            },
          },
          null,
          2,
        ),
      );

      writeText(
        path.join(vaultDir, "legacy-notice", "legacy.md"),
        `---
publish: true
prefix: CFG-01
category_path: announcements/general
title: Legacy Config Notice
---
`,
      );
      writeText(
        path.join(vaultDir, "guides", "guide.md"),
        `---
publish: true
prefix: CFG-02
category_path: engineering/guides
title: Menu Config Guide
---
`,
      );

      const build = runCli(workDir, [
        cliPath,
        "build",
        "--vault",
        vaultDir,
        "--out",
        outDir,
        "--menu-config",
        "./menu.config.json",
      ]);
      expect(build.status, build.output).toBe(0);

      const manifest = readManifest(outDir) as {
        tree: Array<{
          type: string;
          path?: string;
          name?: string;
          children?: Array<{ title?: string }>;
        }>;
      };

      const pinnedFolder = manifest.tree[0];
      expect(pinnedFolder.name).toBe("GUIDES");
      expect(pinnedFolder.path).toBe("__virtual__/pinned/category/engineering/guides");
      expect(pinnedFolder.children?.map((node) => node.title)).toEqual(["Menu Config Guide"]);
    } finally {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  });

  test("잘못된 pinnedMenu config는 빌드 전에 거부한다", async () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "mfs-invalid-pinned-menu-"));

    try {
      writeText(
        path.join(workDir, "blog.config.mjs"),
        `export default {
  pinnedMenu: {
    label: "BROKEN",
  },
};
`,
      );

      const missingTarget = runCli(workDir, [cliPath, "build", "--vault", "./vault", "--out", "./dist"]);
      expect(missingTarget.status).not.toBe(0);
      expect(missingTarget.output).toContain('"pinnedMenu" must include "sourceDir" or "categoryPath"');

      writeText(
        path.join(workDir, "blog.config.mjs"),
        `export default {
  pinnedMenu: {
    label: "BROKEN",
    categoryPath: "/",
  },
};
`,
      );

      const rootCategory = runCli(workDir, [cliPath, "build", "--vault", "./vault", "--out", "./dist"]);
      expect(rootCategory.status).not.toBe(0);
      expect(rootCategory.output).toContain('"pinnedMenu.categoryPath" must not be root');
    } finally {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  });
});
