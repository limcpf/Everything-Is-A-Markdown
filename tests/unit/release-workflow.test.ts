import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "bun:test";

const repositoryRoot = path.resolve(import.meta.dir, "../..");
const workflowsDir = path.join(repositoryRoot, ".github/workflows");

describe("release workflow contract", () => {
  test("has one tag publisher with serialized exact-tag execution", () => {
    const tagPublishers = fs
      .readdirSync(workflowsDir)
      .filter((fileName) => fileName.endsWith(".yml"))
      .filter((fileName) => {
        const workflow = fs.readFileSync(path.join(workflowsDir, fileName), "utf8");
        return /tags:\s*\n\s*- ["']v\*["']/.test(workflow);
      });

    expect(tagPublishers).toEqual(["release.yml"]);

    const workflow = fs.readFileSync(path.join(workflowsDir, "release.yml"), "utf8");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("concurrency:");
    expect(workflow).toContain("cancel-in-progress: false");
    expect(workflow).toContain("ref: refs/tags/${{ env.RELEASE_TAG }}");
    expect(workflow.match(/uses: actions\/checkout@v6/g)).toHaveLength(2);
    expect(workflow).toContain("persist-credentials: false");
  });

  test("gates and inspects the exact tarball before ordered publication", () => {
    const workflow = fs.readFileSync(path.join(workflowsDir, "release.yml"), "utf8");
    const orderedMarkers = [
      "Validate release identity",
      "bun run typecheck",
      "bun run test:unit",
      "bun run build -- --vault ./test-vault --out ./dist",
      "bun run test:e2e",
      "Pack and inspect exact npm artifact",
      "actions/upload-artifact@v4",
      "actions/download-artifact@v4",
      "Verify transferred artifact",
      "Check npm registry state",
      'bun publish "$PACKAGE_TARBALL" --access public',
      "Verify npm publication integrity",
      "Reconcile GitHub Release",
    ];

    let previousIndex = -1;
    for (const marker of orderedMarkers) {
      const markerIndex = workflow.indexOf(marker);
      expect(markerIndex).toBeGreaterThan(previousIndex);
      previousIndex = markerIndex;
    }

    expect(workflow).toContain("contents: read");
    expect(workflow).toContain("contents: write");
    expect(workflow).toContain("--verify-tag --generate-notes");
    expect(workflow).toContain("NPM_CONFIG_TOKEN: ${{ secrets.NPM_TOKEN }}");
    expect(workflow).not.toMatch(/echo[^\n]*\$NPM_CONFIG_TOKEN/);
  });
});
