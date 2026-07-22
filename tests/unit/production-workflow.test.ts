import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "bun:test";

const repositoryRoot = path.resolve(import.meta.dir, "../..");

describe("production validation workflow contract", () => {
  for (const fileName of ["ci.yml", "release.yml"]) {
    test(`${fileName} gates publication and preserves the failure report`, () => {
      const workflow = fs.readFileSync(
        path.join(repositoryRoot, ".github/workflows", fileName),
        "utf8",
      );
      expect(workflow).toContain("id: production-validation");
      expect(workflow).toContain(
        "bun run validate:production -- --config ./tests/fixtures/production-site/blog.config.ts",
      );
      expect(workflow).toContain("Upload production validation report on failure");
      expect(workflow).toContain("steps.production-validation.outcome == 'failure'");
      expect(workflow).toContain("path: .tmp/production-report/**");
      expect(workflow).toContain("if-no-files-found: error");
    });
  }
});
