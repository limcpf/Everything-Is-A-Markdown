import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "bun:test";

const repositoryRoot = path.resolve(import.meta.dir, "../..");
const workflowPath = path.join(repositoryRoot, ".github/workflows/deploy-cloudflare-pages.yml");
const documentationPath = path.join(repositoryRoot, "docs/CLOUDFLARE-PAGES.md");

function readWorkflow(): string {
  return fs.readFileSync(workflowPath, "utf8");
}

describe("reusable Cloudflare Pages deployment workflow", () => {
  test("accepts explicit caller build and Pages environment inputs", () => {
    const workflow = readWorkflow();

    expect(workflow).toContain("workflow_call:");
    for (const input of [
      "vault-path:",
      "output-path:",
      "config-path:",
      "project-name:",
      "deployment-environment:",
      "production-branch:",
      "preview-branch:",
      "artifact-only:",
      "exclude-patterns:",
      "markdown-baseline-path:",
    ]) {
      expect(workflow).toContain(input);
    }

    expect(workflow).toContain("CLOUDFLARE_API_TOKEN:");
    expect(workflow).toContain("CLOUDFLARE_ACCOUNT_ID:");
    expect(workflow).toContain("permissions:\n  contents: read");
  });

  test("builds and validates before transferring the exact site to a separate job", () => {
    const workflow = readWorkflow();
    const orderedMarkers = [
      "Install caller dependencies",
      "Locate pinned production validator",
      "Build and validate production output",
      'bun run "$VALIDATOR_PATH"',
      "Upload production validation report",
      "Upload exact validated site",
      "deploy:\n    if: ${{ !inputs.artifact-only }}",
      "needs: build-validate",
      "Download exact validated site",
      "Verify Cloudflare project environment",
      "Deploy validated artifact",
      "Verify deployment result",
    ];

    let previousIndex = -1;
    for (const marker of orderedMarkers) {
      const markerIndex = workflow.indexOf(marker);
      expect(markerIndex).toBeGreaterThan(previousIndex);
      previousIndex = markerIndex;
    }

    expect(workflow).toContain("bun install --frozen-lockfile");
    expect(workflow).toContain("caller packageManager must pin one exact stable Bun version");
    expect(workflow).toContain("Unpinned EIAM dependency");
    expect(workflow).toContain("output-path must not overlap");
    expect(workflow.match(/include-hidden-files: true/g)).toHaveLength(2);
    expect(workflow).toContain("if-no-files-found: error");
    expect(workflow).toContain("compression-level: 0");
    expect(workflow).toContain('invocation_id="$(openssl rand -hex 16)"');
    expect(workflow).toContain("report-artifact-name");
  });

  test("keeps credentials out of artifact-only work and pins deploy tooling", () => {
    const workflow = readWorkflow();
    const buildJob = workflow.slice(
      workflow.indexOf("  build-validate:"),
      workflow.indexOf("\n  deploy:"),
    );
    const deployJob = workflow.slice(workflow.indexOf("\n  deploy:"));

    expect(buildJob).not.toContain("${{ secrets.");
    expect(deployJob).toContain("if: ${{ !inputs.artifact-only }}");
    expect(deployJob).toContain("cloudflare-${{ inputs.deployment-environment }}");
    expect(deployJob).toContain(
      "cloudflare/wrangler-action@ebbaa1584979971c8614a24965b4405ff95890e0",
    );
    expect(deployJob).toContain("wranglerVersion: 4.112.0");
    expect(deployJob).not.toContain("gitHubToken:");
    expect(workflow).toContain("actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10");
    expect(workflow).toContain("oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6");
  });

  test("guards forks and proves the requested branch maps to the real Pages environment", () => {
    const workflow = readWorkflow();

    expect(workflow).toContain("fork pull requests must use artifact-only mode");
    expect(workflow).toContain("preview-branch must differ from production-branch");
    expect(workflow).toContain("production deployment must run from refs/heads/$PRODUCTION_BRANCH");
    expect(workflow).toContain(
      '[[ "$ARTIFACT_ONLY" != "true" && "$deploy_branch" == "$PRODUCTION_BRANCH" ]]',
    );
    expect(workflow).toContain("/pages/projects/$PROJECT_NAME");
    expect(workflow).toContain(".result.production_branch");
    expect(workflow).toContain("Cloudflare production branch mismatch");
    expect(workflow).toContain("Cloudflare environment mismatch");
    expect(workflow).toContain("pages-environment");
  });

  test("documents a locked caller, pathBase limits, fork dry runs, and rollback", () => {
    const documentation = fs.readFileSync(documentationPath, "utf8");

    expect(documentation).toContain("bun install --frozen-lockfile");
    expect(documentation).toContain("@<full-commit-sha>");
    expect(documentation).toContain("Pages Write");
    expect(documentation).toContain("cloudflare-production");
    expect(documentation).toContain("artifact-only");
    expect(documentation).toContain("Fork pull requests must use artifact-only mode");
    expect(documentation).toContain("Cloudflare Direct Upload");
    expect(documentation).toContain("under an arbitrary URL prefix");
    expect(documentation).toContain("/rollback");
    expect(documentation).toContain("preview deployment is not a valid target");
  });
});
