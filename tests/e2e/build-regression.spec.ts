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
  const manifestPath = path.join(outDir, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
    docs: Array<{ route: string; contentUrl: string }>;
  };
  const doc = manifest.docs.find((entry) => entry.route === route);
  if (!doc) {
    throw new Error(`route ${route} 문서를 manifest에서 찾지 못했습니다.`);
  }

  return fs.readFileSync(path.join(outDir, doc.contentUrl.replace(/^\/+/, "")), "utf8");
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
title: Duplicate Title
---
`,
      );
      writeText(
        path.join(vaultDir, "notes", "duplicate-two.md"),
        `---
publish: true
prefix: DOC-04
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
});
