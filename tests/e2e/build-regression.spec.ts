import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";

interface CliResult {
  status: number | null;
  output: string;
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
});
