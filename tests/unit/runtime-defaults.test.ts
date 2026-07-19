import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "bun:test";
import {
  DEFAULT_BRANCH,
  DEFAULT_MERMAID_CONFIG,
  DEFAULT_RUNTIME_CONFIG,
  DEFAULT_RUNTIME_LAYOUT,
  DEFAULT_SITE_TITLE,
  resolveRuntimeLayoutConfig,
} from "../../src/defaults";

describe("canonical runtime defaults", () => {
  test("exposes one immutable default payload", () => {
    expect(DEFAULT_RUNTIME_CONFIG).toEqual({
      defaultBranch: DEFAULT_BRANCH,
      siteTitle: DEFAULT_SITE_TITLE,
      mermaid: DEFAULT_MERMAID_CONFIG,
      layout: DEFAULT_RUNTIME_LAYOUT,
    });
    expect(Object.isFrozen(DEFAULT_RUNTIME_CONFIG)).toBe(true);
    expect(Object.isFrozen(DEFAULT_MERMAID_CONFIG)).toBe(true);
    expect(Object.isFrozen(DEFAULT_RUNTIME_LAYOUT)).toBe(true);
  });

  test("normalizes emitted layout values with field-level safe defaults", () => {
    expect(
      resolveRuntimeLayoutConfig({
        compactBreakpointPx: 900,
        desktopSidebarDefaultPx: 480,
        desktopSidebarMinPx: -1,
        splitterStepPx: Number.NaN,
      }),
    ).toEqual({
      ...DEFAULT_RUNTIME_LAYOUT,
      compactBreakpointPx: 900,
      desktopSidebarDefaultPx: 480,
    });
    expect(resolveRuntimeLayoutConfig(null)).toEqual(DEFAULT_RUNTIME_LAYOUT);
  });

  test("keeps branch, title, and Mermaid fallback literals out of consumers", () => {
    const consumerPaths = [
      "src/config.ts",
      "src/build/graph.ts",
      "src/build/output.ts",
      "src/build/shared.ts",
      "src/template.ts",
      "src/view-contract.ts",
      "src/runtime/navigation-state.js",
      "src/runtime/runtime-bootstrap.js",
      "src/runtime/mermaid-controller.js",
    ];
    const consumers = consumerPaths
      .map((filePath) => fs.readFileSync(path.resolve(process.cwd(), filePath), "utf8"))
      .join("\n");

    expect(consumers).not.toContain("https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js");
    expect(consumers).not.toContain('const DEFAULT_BRANCH = "dev"');
    expect(consumers).not.toContain('const DEFAULT_SITE_TITLE = "File-System Blog"');
  });
});
