import fs from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { buildDocumentGraph } from "../../src/build/graph";
import type { BuildOptions, DocRecord } from "../../src/types";

const options: BuildOptions = {
  vaultDir: "/vault",
  outDir: "/output",
  exclude: [],
  staticPaths: [],
  newWithinDays: 7,
  recentLimit: 5,
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
    expect(graph.tree[0]).toMatchObject({ type: "folder", name: "Recent", virtual: true });
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
