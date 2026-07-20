import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { inspectBuildStorage } from "../../src/build/storage";
import { DEFAULT_RUNTIME_LAYOUT } from "../../src/defaults";
import type { BuildOptions } from "../../src/types";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((temporaryRoot) =>
      fs.rm(temporaryRoot, {
        force: true,
        recursive: true,
      }),
    ),
  );
});

async function createTemporaryRoot(): Promise<string> {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "eiam-cache-unit-"));
  temporaryRoots.push(temporaryRoot);
  return temporaryRoot;
}

function createBuildOptions(vaultDir: string, outDir: string): BuildOptions {
  return {
    allowUnsafeHtml: false,
    defaultBranch: "dev",
    exclude: [],
    gfm: true,
    imagePolicy: "omit-local",
    mermaid: {
      cdnUrl: "https://example.test/mermaid.js",
      enabled: true,
      theme: "default",
    },
    layout: { ...DEFAULT_RUNTIME_LAYOUT },
    locale: "ko",
    newWithinDays: 7,
    outDir,
    pinnedMenu: null,
    recentLimit: 5,
    seo: null,
    shikiTheme: "github-dark",
    staticPaths: [],
    vaultDir,
    wikilinks: true,
  };
}

describe("build storage guards", () => {
  test("rejects an output directory that contains the vault before mutation", async () => {
    const temporaryRoot = await createTemporaryRoot();
    const vaultDir = path.join(temporaryRoot, "vault");
    await fs.mkdir(vaultDir);

    await expect(inspectBuildStorage(createBuildOptions(vaultDir, temporaryRoot))).rejects.toThrow(
      "[safety] Refusing dangerous output directory",
    );
    expect(await fs.readdir(vaultDir)).toEqual([]);
  });

  test("inspection derives an isolated cache namespace without claiming output", async () => {
    const temporaryRoot = await createTemporaryRoot();
    const vaultDir = path.join(temporaryRoot, "vault");
    const outDir = path.join(temporaryRoot, "site");
    await fs.mkdir(vaultDir);

    const storage = await inspectBuildStorage(createBuildOptions(vaultDir, outDir));

    expect(storage.cacheLocation.namespace).toMatch(/^v2-[a-f0-9]{40}$/);
    expect(storage.outputRoot).toBe(outDir);
    expect(await Bun.file(outDir).exists()).toBe(false);
    expect(await Bun.file(storage.cacheLocation.cachePath).exists()).toBe(false);
  });
});
