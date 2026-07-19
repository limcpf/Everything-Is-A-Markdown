import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "bun:test";
import {
  evaluatePublication,
  formatPublicationDiagnostic,
  scanPublicationTargets,
} from "../../src/publication";

function writeText(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function markdown(frontmatter: string, body = "## Body\n"): string {
  return `---\n${frontmatter}\n---\n\n${body}`;
}

describe("shared publication scanner", () => {
  test("shares exclusions and all publication metadata rules", async () => {
    const vaultDir = fs.mkdtempSync(path.join(os.tmpdir(), "eiam-publication-scan-"));

    try {
      writeText(
        path.join(vaultDir, "valid.MD"),
        markdown(`publish: true
prefix: 42
category_path: " engineering//guides\\api/ "`),
      );
      writeText(
        path.join(vaultDir, "missing-prefix.md"),
        markdown(`publish: true
category_path: guides`),
      );
      writeText(
        path.join(vaultDir, "missing-category.md"),
        markdown(`publish: true
prefix: MISSING-CATEGORY`),
      );
      writeText(
        path.join(vaultDir, "draft.md"),
        markdown(`publish: true
draft: true
prefix: DRAFT
category_path: drafts`),
      );
      writeText(path.join(vaultDir, "private.md"), markdown("publish: false"));
      writeText(
        path.join(vaultDir, "excluded", "published.md"),
        markdown(`publish: true
prefix: EXCLUDED
category_path: excluded`),
      );
      writeText(path.join(vaultDir, "ignored.txt"), "not markdown\n");

      const result = await scanPublicationTargets(vaultDir, ["excluded/**"]);

      expect(result.sources.map(({ relPath }) => relPath)).toEqual([
        "draft.md",
        "missing-category.md",
        "missing-prefix.md",
        "private.md",
        "valid.MD",
      ]);
      expect(result.targets.map(({ source }) => source.relPath)).toEqual(["valid.MD"]);
      expect(result.targets[0]?.metadata).toEqual({
        publish: true,
        draft: false,
        prefix: "42",
        categoryPath: "engineering/guides/api",
      });
      expect(result.diagnostics.map(({ file, code }) => ({ file, code }))).toEqual([
        {
          file: "missing-category.md",
          code: "publication/missing-category-path",
        },
        { file: "missing-prefix.md", code: "publication/missing-prefix" },
      ]);
      expect(result.ignored).toEqual([
        { file: "draft.md", reason: "draft" },
        { file: "missing-category.md", reason: "invalid-metadata" },
        { file: "missing-prefix.md", reason: "invalid-metadata" },
        { file: "private.md", reason: "not-published" },
      ]);
    } finally {
      fs.rmSync(vaultDir, { recursive: true, force: true });
    }
  });

  test("returns one structured and formatted diagnostic for malformed frontmatter", async () => {
    const vaultDir = fs.mkdtempSync(path.join(os.tmpdir(), "eiam-publication-malformed-"));

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
        path.join(vaultDir, "excluded", "broken.md"),
        `---
publish: [also broken
---
`,
      );

      const result = await scanPublicationTargets(vaultDir, ["excluded/**"]);

      expect(result.targets).toEqual([]);
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0]).toMatchObject({
        category: "frontmatter-parse",
        code: "frontmatter/parse",
        severity: "error",
        file: "broken.md",
        line: 1,
        column: 1,
      });
      expect(formatPublicationDiagnostic(result.diagnostics[0]!)).toStartWith(
        "Frontmatter parse failed: broken.md\n",
      );
    } finally {
      fs.rmSync(vaultDir, { recursive: true, force: true });
    }
  });

  test("evaluates publish and draft before required metadata", () => {
    expect(
      evaluatePublication("private.md", {
        publish: false,
        draft: false,
      }),
    ).toEqual({ status: "ignored", reason: "not-published" });
    expect(
      evaluatePublication("draft.md", {
        publish: true,
        draft: true,
      }),
    ).toEqual({ status: "ignored", reason: "draft" });
    expect(
      evaluatePublication("invalid.md", {
        publish: true,
        draft: false,
      }),
    ).toMatchObject({
      status: "invalid",
      diagnostics: [
        { code: "publication/missing-prefix" },
        { code: "publication/missing-category-path" },
      ],
    });
    expect(
      evaluatePublication("target.md", {
        publish: true,
        draft: false,
        prefix: "TARGET",
        categoryPath: "guides",
      }),
    ).toEqual({ status: "target" });
  });
});
