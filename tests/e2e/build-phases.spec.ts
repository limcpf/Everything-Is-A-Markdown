import fs from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { buildDocumentGraph, pickHomeDoc } from "../../src/build/graph";
import { DEFAULT_RUNTIME_LAYOUT } from "../../src/defaults";
import type { BuildOptions, DocRecord } from "../../src/types";

const options: BuildOptions = {
  vaultDir: "/vault",
  outDir: "/output",
  exclude: [],
  staticPaths: [],
  locale: "ko",
  newWithinDays: 7,
  recentLimit: 5,
  defaultBranch: "dev",
  pinnedMenu: null,
  wikilinks: true,
  imagePolicy: "omit-local",
  gfm: true,
  allowUnsafeHtml: false,
  shikiTheme: "github-dark",
  mermaid: {
    enabled: true,
    cdnUrl: "https://example.test/mermaid.js",
    theme: "default",
  },
  layout: { ...DEFAULT_RUNTIME_LAYOUT },
  seo: null,
};

function createDoc(
  id: string,
  title: string,
  route: string,
  wikiTargets: string[] = [],
): DocRecord {
  return {
    sourcePath: `/vault/${id}.md`,
    relPath: `${id}.md`,
    relNoExt: id,
    id,
    route,
    contentUrl: `/content/${id}.html`,
    fileName: `${id}.md`,
    title,
    prefix: route.replaceAll("/", ""),
    categoryPath: "architecture",
    date: "2026-07-19",
    tags: [],
    mtimeMs: 1,
    body: "",
    rawHash: id,
    wikiTargets,
    branch: null,
  };
}

test.describe("build phase contracts", () => {
  test("document graph phase는 tree, manifest, wiki index를 함께 만든다", () => {
    const source = createDoc("source", "Source", "/SOURCE/", ["Target"]);
    const target = createDoc("target", "Target", "/TARGET/");

    const graph = buildDocumentGraph([source, target], options);

    expect(graph.manifest.docIds).toEqual(["source", "target"]);
    expect(graph.manifest.docsById.target.backlinks).toEqual([
      { id: "source", route: "/SOURCE/", title: "Source", prefix: "SOURCE" },
    ]);
    expect(graph.wikiLookup.byTitle.get("target")).toEqual([target]);
    expect(graph.tree[0]).toMatchObject({ type: "folder", name: "최근 문서", virtual: true });
    expect(graph.manifest.locale).toBe("ko");
  });

  test("custom defaultBranch가 manifest, branch order, home selection에 일관되게 적용된다", () => {
    const main = { ...createDoc("main", "Main", "/MAIN/"), branch: "main" };
    const dev = { ...createDoc("dev", "Dev", "/DEV/"), branch: "dev" };
    const unclassified = createDoc("unclassified", "Unclassified", "/UNCLASSIFIED/");
    unclassified.updatedDate = "2026-07-20";
    const customOptions = { ...options, defaultBranch: "main" };

    const graph = buildDocumentGraph([dev, main, unclassified], customOptions);

    expect(graph.manifest.defaultBranch).toBe("main");
    expect(graph.manifest.branches).toEqual(["main", "dev"]);
    expect(graph.manifest.layout).toEqual(DEFAULT_RUNTIME_LAYOUT);
    expect(pickHomeDoc([dev, main, unclassified], customOptions.defaultBranch)?.id).toBe(
      "unclassified",
    );
  });

  test("pipeline entry는 phase composition만 소유한다", async () => {
    const pipelinePath = path.resolve(process.cwd(), "src/build/pipeline.ts");
    const pipelineSource = await fs.readFile(pipelinePath, "utf8");

    expect(pipelineSource.split("\n").length).toBeLessThan(100);
    expect(pipelineSource).toContain("inspectBuildStorage");
    expect(pipelineSource).toContain("readPublishedDocs");
    expect(pipelineSource).toContain("buildDocumentGraph");
    expect(pipelineSource).toContain("renderDocuments");
    expect(pipelineSource).toContain("emitOutputPhase");
    expect(pipelineSource).not.toContain('from "node:fs');
    expect(pipelineSource).not.toContain("Bun.write");
  });
});
