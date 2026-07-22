import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  DEFAULT_BRANCH,
  DEFAULT_MERMAID_CONFIG,
  DEFAULT_RUNTIME_LAYOUT,
  DEFAULT_SITE_TITLE,
} from "../../src/defaults";
import { DEFAULT_UI_LOCALE } from "../../src/i18n";
import { resolveMermaidConfig } from "../../src/runtime/mermaid-controller.js";
import { createNavigationState } from "../../src/runtime/navigation-state.js";
import { resolveSiteTitle } from "../../src/runtime/runtime-bootstrap.js";
import { clampDesktopSidebarWidth } from "../../src/runtime/sidebar-layout-controller.js";
import type { Manifest } from "../../src/types";

interface BuiltFixture {
  appCss: string;
  appJs: string;
  indexHtml: string;
  notFoundHtml: string;
  manifest: Manifest;
}

function writeText(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function writeDoc(vaultDir: string, id: string, branch: string | null, date: string): void {
  const branchLine = branch ? `branch: ${branch}\n` : "";
  writeText(
    path.join(vaultDir, `${id}.md`),
    `---
publish: true
prefix: ${id.toUpperCase()}
category_path: defaults
title: ${id}
date: ${date}
${branchLine}---

## ${id}
`,
  );
}

function buildFixture(repoRoot: string, configSource?: string): BuiltFixture {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "eiam-runtime-defaults-"));
  const vaultDir = path.join(workDir, "vault");
  const outDir = path.join(workDir, "dist");

  try {
    writeDoc(vaultDir, "dev", "dev", "2026-07-18");
    writeDoc(vaultDir, "main", "main", "2026-07-19");
    writeDoc(vaultDir, "unclassified", null, "2026-07-20");
    if (configSource) {
      writeText(path.join(workDir, "blog.config.mjs"), configSource);
    }

    const result = spawnSync(
      "bun",
      [path.join(repoRoot, "src/cli.ts"), "build", "--vault", vaultDir, "--out", outDir],
      { cwd: workDir, encoding: "utf8" },
    );
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    expect(result.status, output).toBe(0);

    const assets = fs.readdirSync(path.join(outDir, "assets"));
    const appCssName = assets.find((name) => /^app\.[a-f0-9]{12}\.css$/.test(name));
    const appJsName = assets.find((name) => /^app\.[a-f0-9]{12}\.js$/.test(name));
    expect(appCssName).toBeTruthy();
    expect(appJsName).toBeTruthy();

    return {
      appCss: fs.readFileSync(path.join(outDir, "assets", appCssName!), "utf8"),
      appJs: fs.readFileSync(path.join(outDir, "assets", appJsName!), "utf8"),
      indexHtml: fs.readFileSync(path.join(outDir, "index.html"), "utf8"),
      notFoundHtml: fs.readFileSync(path.join(outDir, "404.html"), "utf8"),
      manifest: JSON.parse(fs.readFileSync(path.join(outDir, "manifest.json"), "utf8")) as Manifest,
    };
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

test("default와 custom config가 emitted runtime defaults를 같은 경로로 소비한다", () => {
  const repoRoot = process.cwd();
  const defaults = buildFixture(repoRoot);
  const custom = buildFixture(
    repoRoot,
    `export default {
  defaultBranch: " MAIN ",
  ui: { locale: "en" },
  seo: { siteName: "Custom Notes" },
  markdown: {
    mermaid: {
      enabled: false,
      cdnUrl: "/assets/mermaid.js",
      theme: "forest",
    },
  },
};
`,
  );

  expect(defaults.manifest).toMatchObject({
    defaultBranch: DEFAULT_BRANCH,
    locale: DEFAULT_UI_LOCALE,
    siteTitle: DEFAULT_SITE_TITLE,
    mermaid: DEFAULT_MERMAID_CONFIG,
    layout: DEFAULT_RUNTIME_LAYOUT,
  });
  expect(custom.manifest).toMatchObject({
    defaultBranch: "main",
    locale: "en",
    siteTitle: "Custom Notes",
    mermaid: {
      enabled: false,
      cdnUrl: "/assets/mermaid.js",
      theme: "forest",
    },
    layout: DEFAULT_RUNTIME_LAYOUT,
  });
  expect(custom.manifest.branches).toEqual(["main", "dev"]);

  const defaultNavigation = createNavigationState(defaults.manifest);
  const customNavigation = createNavigationState(custom.manifest);
  expect(defaultNavigation.defaultBranch).toBe(DEFAULT_BRANCH);
  expect(defaultNavigation.view.docs.map(({ id }) => id).sort()).toEqual(["dev", "unclassified"]);
  expect(customNavigation.defaultBranch).toBe("main");
  expect(customNavigation.view.docs.map(({ id }) => id).sort()).toEqual(["main", "unclassified"]);
  expect(resolveSiteTitle(defaults.manifest)).toBe(DEFAULT_SITE_TITLE);
  expect(resolveSiteTitle(custom.manifest)).toBe("Custom Notes");
  expect(resolveMermaidConfig(defaults.manifest)).toEqual(DEFAULT_MERMAID_CONFIG);
  expect(resolveMermaidConfig(custom.manifest)).toEqual(custom.manifest.mermaid);
  expect(clampDesktopSidebarWidth(9999, 1440, custom.manifest.layout)).toBe(750);

  expect(custom.indexHtml).toContain("Custom Notes");
  expect(custom.indexHtml).toContain('<html lang="en">');
  expect(defaults.indexHtml).toContain('<html lang="ko">');
  expect(defaults.indexHtml).toContain("viewport-fit=cover");
  expect(defaults.indexHtml).toContain('id="mobile-reader-title"');
  expect(defaults.indexHtml).not.toContain('name="menu-toggle-position"');
  expect(custom.indexHtml).toContain('"name":"Custom Notes"');
  expect(custom.notFoundHtml).toContain("<title>404 - Custom Notes</title>");
  expect(custom.notFoundHtml).toContain("The requested document could not be found.");
  expect(custom.appCss).toBe(defaults.appCss);
  expect(custom.appJs).toBe(defaults.appJs);
  expect(defaults.appCss).toContain("--desktop-sidebar-default:420px");
  expect(defaults.appCss).toContain("--desktop-sidebar-min:320px");
  expect(defaults.appCss).toContain("--mobile-sidebar-min:300px");
  expect(defaults.appCss).toContain("--mobile-sidebar-max:560px");
  expect(defaults.appCss).toContain("@media (max-width:1024px)");
  expect(defaults.appCss).toContain("env(safe-area-inset-top,0px)");
  expect(defaults.appCss).toContain("env(safe-area-inset-right,0px)");
  expect(defaults.appCss).toContain("env(safe-area-inset-bottom,0px)");
  expect(defaults.appCss).toContain("env(safe-area-inset-left,0px)");
  expect(defaults.appCss).not.toContain("eiam-compact-breakpoint");
  expect(defaults.appJs).not.toContain("cdn.jsdelivr.net/npm/mermaid");
});
