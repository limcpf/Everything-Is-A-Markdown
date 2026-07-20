import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "bun:test";

const repositoryRoot = path.resolve(import.meta.dir, "../..");

describe("Bun toolchain version", () => {
  test("uses one exact packageManager version in every workflow", () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(repositoryRoot, "package.json"), "utf8"),
    ) as { packageManager?: unknown };

    expect(packageJson.packageManager).toMatch(/^bun@\d+\.\d+\.\d+$/);

    const workflowsDir = path.join(repositoryRoot, ".github/workflows");
    const workflows = fs
      .readdirSync(workflowsDir)
      .filter((fileName) => fileName.endsWith(".yml"))
      .map((fileName) => fs.readFileSync(path.join(workflowsDir, fileName), "utf8"));

    for (const workflow of workflows) {
      if (!workflow.includes("oven-sh/setup-bun@")) {
        continue;
      }
      expect(workflow).not.toMatch(/bun-version:\s*(?:latest|canary|\d)/);
      expect(workflow).not.toContain("bun-version-file:");
    }
  });

  test("configures deliberate Bun release updates", () => {
    const renovate = JSON.parse(
      fs.readFileSync(path.join(repositoryRoot, "renovate.json"), "utf8"),
    ) as {
      customManagers?: Array<{ depNameTemplate?: string; datasourceTemplate?: string }>;
    };

    expect(renovate.customManagers).toContainEqual(
      expect.objectContaining({
        depNameTemplate: "oven-sh/bun",
        datasourceTemplate: "github-releases",
      }),
    );
  });
});
