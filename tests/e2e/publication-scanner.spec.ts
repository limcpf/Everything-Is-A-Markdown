import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";

interface CliResult {
  status: number | null;
  output: string;
}

interface PublicationReport {
  targetCount: number;
  targetFiles: string[];
  skippedWithoutPrefixCount: number;
  skippedWithoutCategoryPathCount: number;
  frontmatterParseErrorCount: number;
  publicationDiagnosticCount: number;
  markdownStyleIssueCount: number;
  issueCount: number;
  publicationDiagnostics: Array<{
    category: string;
    code: string;
    file: string;
    formatted: string;
  }>;
  markdownStyleIssues: Array<{
    category: string;
    rule: string;
    file: string;
  }>;
  issues: Array<{ category: string; rule: string; file: string }>;
}

function writeText(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function runBun(cwd: string, args: string[]): CliResult {
  const result = spawnSync("bun", args, { cwd, encoding: "utf8" });
  return {
    status: result.status,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
}

function readReport(reportDir: string): PublicationReport {
  return JSON.parse(
    fs.readFileSync(path.join(reportDir, "mdlint-report.json"), "utf8"),
  ) as PublicationReport;
}

function readOnlyBuildCache(workDir: string): { sources: Record<string, unknown> } {
  const cacheRoot = path.join(workDir, ".cache", "eiam");
  const namespaces = fs
    .readdirSync(cacheRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory());
  expect(namespaces).toHaveLength(1);
  return JSON.parse(
    fs.readFileSync(path.join(cacheRoot, namespaces[0]!.name, "build-index.json"), "utf8"),
  ) as { sources: Record<string, unknown> };
}

test.describe("shared publication scanner", () => {
  const repoRoot = process.cwd();
  const buildCliPath = path.join(repoRoot, "src/cli.ts");
  const lintCliPath = path.join(repoRoot, "scripts/lint-published-markdown.ts");

  test("build와 lint가 같은 publish target을 선택하고 report category를 분리한다", () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "eiam-shared-targets-"));
    const vaultDir = path.join(workDir, "vault");
    const outDir = path.join(workDir, "site");
    const reportDir = path.join(workDir, "report");

    try {
      writeText(
        path.join(vaultDir, "target.md"),
        `---
publish: true
prefix: TARGET
category_path: guides
---

# Body H1
`,
      );
      writeText(
        path.join(vaultDir, "missing-prefix.md"),
        `---
publish: true
category_path: guides
---
`,
      );
      writeText(
        path.join(vaultDir, "missing-category.md"),
        `---
publish: true
prefix: MISSING-CATEGORY
---
`,
      );
      writeText(
        path.join(vaultDir, "draft.md"),
        `---
publish: true
draft: true
prefix: DRAFT
category_path: drafts
---
`,
      );
      writeText(path.join(vaultDir, "private.md"), "---\npublish: false\n---\n");
      writeText(
        path.join(vaultDir, "excluded", "published.md"),
        `---
publish: true
prefix: EXCLUDED
category_path: excluded
---
`,
      );

      const build = runBun(workDir, [
        buildCliPath,
        "build",
        "--vault",
        vaultDir,
        "--out",
        outDir,
        "--exclude",
        "excluded/**",
      ]);
      expect(build.status, build.output).toBe(0);
      expect(build.output).toContain(
        "[publish] Skipped published doc without prefix: missing-prefix.md",
      );
      expect(build.output).toContain(
        "[publish] Skipped published doc without category_path: missing-category.md",
      );

      const lint = runBun(workDir, [
        lintCliPath,
        "--out-dir",
        reportDir,
        "--vault",
        vaultDir,
        "--exclude",
        "excluded/**",
      ]);
      expect(lint.status, lint.output).toBe(0);
      const report = readReport(reportDir);
      const cache = readOnlyBuildCache(workDir);

      expect(report.targetCount).toBe(1);
      expect(report.targetFiles).toEqual(["target.md"]);
      expect(Object.keys(cache.sources).sort()).toEqual(report.targetFiles);
      expect(report.skippedWithoutPrefixCount).toBe(1);
      expect(report.skippedWithoutCategoryPathCount).toBe(1);
      expect(report.frontmatterParseErrorCount).toBe(0);
      expect(report.publicationDiagnosticCount).toBe(2);
      expect(report.markdownStyleIssueCount).toBe(1);
      expect(report.issueCount).toBe(3);
      expect(
        report.publicationDiagnostics.map(({ category, code, file }) => ({
          category,
          code,
          file,
        })),
      ).toEqual([
        {
          category: "publication-metadata",
          code: "publication/missing-category-path",
          file: "missing-category.md",
        },
        {
          category: "publication-metadata",
          code: "publication/missing-prefix",
          file: "missing-prefix.md",
        },
      ]);
      expect(report.markdownStyleIssues).toMatchObject([
        { category: "markdown-style", rule: "custom/no-h1-body", file: "target.md" },
      ]);
      expect(new Set(report.issues.map(({ category }) => category))).toEqual(
        new Set(["publication", "markdown-style"]),
      );

      writeText(
        path.join(vaultDir, "target.md"),
        `---
publish: true
prefix: TARGET
category_path: guides
---

## Body H2
`,
      );
      const strictLint = runBun(workDir, [
        lintCliPath,
        "--out-dir",
        reportDir,
        "--strict",
        "--vault",
        vaultDir,
        "--exclude",
        "excluded/**",
      ]);
      expect(strictLint.status).toBe(1);
      const strictReport = readReport(reportDir);
      expect(strictReport.publicationDiagnosticCount).toBe(2);
      expect(strictReport.markdownStyleIssueCount).toBe(0);
    } finally {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  });

  test("build와 lint가 malformed frontmatter 진단 형식을 공유한다", () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "eiam-shared-parse-"));
    const vaultDir = path.join(workDir, "vault");
    const outDir = path.join(workDir, "site");
    const reportDir = path.join(workDir, "report");

    try {
      writeText(
        path.join(vaultDir, "broken.md"),
        `---
publish: true
prefix: [unterminated
category_path: broken
---
`,
      );
      writeText(
        path.join(vaultDir, "valid.md"),
        `---
publish: true
prefix: VALID
category_path: valid
---

## Valid
`,
      );

      const build = runBun(workDir, [buildCliPath, "build", "--vault", vaultDir, "--out", outDir]);
      expect(build.status).not.toBe(0);
      expect(fs.existsSync(outDir)).toBe(false);

      const lint = runBun(workDir, [lintCliPath, "--out-dir", reportDir, "--vault", vaultDir]);
      expect(lint.status, lint.output).toBe(0);
      const report = readReport(reportDir);

      expect(report.targetFiles).toEqual(["valid.md"]);
      expect(report.frontmatterParseErrorCount).toBe(1);
      expect(report.publicationDiagnostics).toHaveLength(1);
      expect(report.publicationDiagnostics[0]).toMatchObject({
        category: "frontmatter-parse",
        code: "frontmatter/parse",
        file: "broken.md",
      });
      expect(build.output).toContain(report.publicationDiagnostics[0]!.formatted);
      expect(lint.output).toContain(report.publicationDiagnostics[0]!.formatted);
    } finally {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  });
});
