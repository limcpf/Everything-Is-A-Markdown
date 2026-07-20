import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "bun:test";

const repositoryRoot = path.resolve(import.meta.dir, "../..");
const npmPackageUrl = "https://www.npmjs.com/package/@limcpf/everything-is-a-markdown";

describe("CLI distribution contract", () => {
  test("publishes the Bun source package instead of a generic site archive", () => {
    expect(
      fs.existsSync(path.join(repositoryRoot, ".github/workflows/release-single-file.yml")),
    ).toBe(false);

    const packageJson = JSON.parse(
      fs.readFileSync(path.join(repositoryRoot, "package.json"), "utf8"),
    ) as {
      name?: unknown;
      bin?: unknown;
      files?: unknown;
      dependencies?: Record<string, unknown>;
    };
    expect(packageJson.name).toBe("@limcpf/everything-is-a-markdown");
    expect(packageJson.bin).toEqual({ eiam: "src/cli.ts" });
    expect(packageJson.files).toEqual(
      expect.arrayContaining([
        ".markdownlint.cjs",
        "scripts/check-output-size.ts",
        "scripts/lint-published-markdown.ts",
        "scripts/production-validation.ts",
        "scripts/validate-production.ts",
      ]),
    );
    expect(packageJson.dependencies?.markdownlint).toBe("^0.40.0");

    const readme = fs.readFileSync(path.join(repositoryRoot, "README.md"), "utf8");
    const koreanReadme = fs.readFileSync(path.join(repositoryRoot, "README.ko.md"), "utf8");
    expect(readme).toContain(npmPackageUrl);
    expect(readme).toContain('does not publish a generic site archive or a "single-file"');
    expect(koreanReadme).toContain(npmPackageUrl);
    expect(koreanReadme).toContain('범용 사이트 archive나 "single-file"');
  });
});
