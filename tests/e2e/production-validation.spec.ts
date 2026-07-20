import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";

const repositoryRoot = process.cwd();
const validatorPath = path.join(repositoryRoot, "scripts/validate-production.ts");
const fixtureConfigPath = path.join(
  repositoryRoot,
  "tests/fixtures/production-site/blog.config.ts",
);

interface ValidationReport {
  status: "passed" | "failed";
  checks: Array<{ id: string; status: "passed" | "failed" | "skipped" }>;
  failures: Array<{ check: string; message: string }>;
}

function writeText(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function runValidation(args: string[]): { status: number | null; output: string } {
  const result = spawnSync("bun", [validatorPath, ...args], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  return {
    status: result.status,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
}

function readReport(reportDir: string): ValidationReport {
  return JSON.parse(
    fs.readFileSync(path.join(reportDir, "production-validation-report.json"), "utf8"),
  ) as ValidationReport;
}

test.describe("production validation command", () => {
  test("passes the production fixture and preserves pathBase in generated wikilinks", () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "eiam-production-pass-"));
    const outDir = path.join(workDir, "dist");
    const reportDir = path.join(workDir, "reports");

    try {
      const result = runValidation([
        "--config",
        fixtureConfigPath,
        "--out",
        outDir,
        "--report-dir",
        reportDir,
      ]);
      expect(result.status, result.output).toBe(0);

      const report = readReport(reportDir);
      expect(report.status).toBe("passed");
      expect(report.failures).toEqual([]);
      expect(report.checks).toHaveLength(8);
      expect(report.checks.every(({ status }) => status === "passed")).toBe(true);

      const homeHtml = fs.readFileSync(path.join(outDir, "index.html"), "utf8");
      expect(homeHtml).toContain('href="/docs/PROD-02/"');
      expect(homeHtml).not.toContain('href="/PROD-02/"');
    } finally {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  });

  test("fails before building when production SEO is missing and still writes a report", () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "eiam-production-seo-"));
    const vaultDir = path.join(workDir, "vault");
    const outDir = path.join(workDir, "dist");
    const reportDir = path.join(workDir, "reports");
    const configPath = path.join(workDir, "blog.config.mjs");

    try {
      writeText(
        path.join(vaultDir, "note.md"),
        `---
publish: true
prefix: SEO-01
category_path: production
---

Production note.
`,
      );
      writeText(configPath, `export default { vaultDir: ${JSON.stringify(vaultDir)} };\n`);

      const result = runValidation([
        "--config",
        configPath,
        "--out",
        outDir,
        "--report-dir",
        reportDir,
      ]);
      expect(result.status, result.output).toBe(1);
      expect(fs.existsSync(outDir)).toBe(false);

      const report = readReport(reportDir);
      expect(report.status).toBe("failed");
      expect(report.failures).toContainEqual({
        check: "production-config",
        message: "seo.siteUrl is required in production mode",
      });
    } finally {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  });

  test("fails before building when a configured production static path is absent", () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "eiam-production-static-"));
    const vaultDir = path.join(workDir, "vault");
    const outDir = path.join(workDir, "dist");
    const reportDir = path.join(workDir, "reports");
    const configPath = path.join(workDir, "blog.config.mjs");

    try {
      writeText(
        path.join(vaultDir, "note.md"),
        `---
publish: true
prefix: STATIC-01
category_path: production
---

Production note.
`,
      );
      writeText(
        configPath,
        `export default {
  vaultDir: ${JSON.stringify(vaultDir)},
  staticPaths: ["assets/missing.txt"],
  seo: { siteUrl: "https://example.com" },
};
`,
      );

      const result = runValidation([
        "--config",
        configPath,
        "--out",
        outDir,
        "--report-dir",
        reportDir,
      ]);
      expect(result.status, result.output).toBe(1);
      expect(fs.existsSync(outDir)).toBe(false);
      expect(readReport(reportDir).failures).toContainEqual({
        check: "production-config",
        message: "configured static path does not exist: assets/missing.txt",
      });
    } finally {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  });

  test("reports unresolved wikilinks and missing same-origin static references", () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "eiam-production-links-"));
    const vaultDir = path.join(workDir, "vault");
    const outDir = path.join(workDir, "dist");
    const reportDir = path.join(workDir, "reports");
    const configPath = path.join(workDir, "blog.config.mjs");

    try {
      writeText(
        path.join(vaultDir, "broken.md"),
        `---
publish: true
prefix: BROKEN-01
category_path: production
---

See [[missing-note]] and [missing asset](/docs/assets/missing.txt).
`,
      );
      writeText(
        configPath,
        `export default {
  vaultDir: ${JSON.stringify(vaultDir)},
  seo: { siteUrl: "https://example.com", pathBase: "/docs" },
};
`,
      );

      const result = runValidation([
        "--config",
        configPath,
        "--out",
        outDir,
        "--report-dir",
        reportDir,
      ]);
      expect(result.status, result.output).toBe(1);

      const report = readReport(reportDir);
      expect(report.status).toBe("failed");
      expect(
        report.failures.some(
          ({ check, message }) =>
            check === "manifest-links" && message.includes("unresolved wikilink: missing-note"),
        ),
      ).toBe(true);
      expect(
        report.failures.some(
          ({ check, message }) =>
            check === "manifest-links" && message.includes("assets/missing.txt"),
        ),
      ).toBe(true);
    } finally {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  });
});
