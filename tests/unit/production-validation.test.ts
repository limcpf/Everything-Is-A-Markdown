import { describe, expect, test } from "bun:test";
import {
  compareOutputSnapshots,
  effectiveCacheControl,
  markdownIssueFingerprint,
  parseProductionValidationArgs,
  pathsOverlap,
  validateMarkdownGate,
} from "../../scripts/production-validation";

describe("production validation contracts", () => {
  test("parses explicit production inputs and repeatable exclusions", () => {
    expect(
      parseProductionValidationArgs([
        "--config",
        "./production.config.ts",
        "--vault",
        "./vault",
        "--out",
        "./site",
        "--report-dir",
        "./reports",
        "--markdown-baseline",
        "./baseline.json",
        "--exclude",
        "drafts/**",
        "--exclude",
        "private/**",
      ]),
    ).toEqual({
      configPath: "./production.config.ts",
      vaultDir: "./vault",
      outDir: "./site",
      reportDir: "./reports",
      markdownBaselinePath: "./baseline.json",
      exclude: ["drafts/**", "private/**"],
      help: false,
    });
    expect(() => parseProductionValidationArgs(["--out", "--config"])).toThrow(
      "Missing value for --out",
    );
  });

  test("reports every byte-level output difference", () => {
    expect(
      compareOutputSnapshots(
        {
          "same.txt": { bytes: 1, sha256: "same" },
          "changed.txt": { bytes: 1, sha256: "first" },
          "removed.txt": { bytes: 1, sha256: "removed" },
        },
        {
          "same.txt": { bytes: 1, sha256: "same" },
          "changed.txt": { bytes: 1, sha256: "second" },
          "added.txt": { bytes: 1, sha256: "added" },
        },
      ),
    ).toEqual([
      "added.txt only exists after the second build",
      "changed.txt changed between identical production builds",
      "removed.txt disappeared after the second build",
    ]);
  });

  test("evaluates ordered Cloudflare cache overrides", () => {
    const headers = `/docs/*
  Cache-Control: public, max-age=0, must-revalidate

/docs/assets/app.123456789abc.js
  ! Cache-Control
  Cache-Control: public, max-age=31536000, immutable
`;
    expect(effectiveCacheControl(headers, "/docs/PROD-01/")).toBe(
      "public, max-age=0, must-revalidate",
    );
    expect(effectiveCacheControl(headers, "/docs/assets/app.123456789abc.js")).toBe(
      "public, max-age=31536000, immutable",
    );
  });

  test("requires zero Markdown findings unless the fingerprint baseline is exact", () => {
    const issue = {
      category: "markdown-style",
      file: "guide.md",
      line: 8,
      column: 1,
      rule: "MD013",
      message: "Line length",
    };
    const report = { issueCount: 1, issues: [issue] };
    expect(validateMarkdownGate(report).failures).toEqual([
      "published Markdown has 1 strict issue(s)",
    ]);
    expect(
      validateMarkdownGate(report, {
        schemaVersion: 1,
        fingerprints: [markdownIssueFingerprint(issue)],
      }).failures,
    ).toEqual([]);
    expect(validateMarkdownGate(report, { schemaVersion: 1, fingerprints: [] }).failures).toEqual([
      "published Markdown findings differ from the intentional baseline",
    ]);
  });

  test("rejects nested output and report paths", () => {
    expect(pathsOverlap("/workspace/dist", "/workspace/dist/reports")).toBe(true);
    expect(pathsOverlap("/workspace/reports", "/workspace/reports")).toBe(true);
    expect(pathsOverlap("/workspace/dist", "/workspace/reports")).toBe(false);
  });
});
