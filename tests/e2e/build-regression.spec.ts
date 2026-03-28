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

function runCli(cwd: string, args: string[]): CliResult {
  const result = spawnSync("bun", args, {
    cwd,
    encoding: "utf8",
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
