import path from "node:path";
import MarkdownIt from "markdown-it";
import type { BuildCache, BuildOptions, DocRecord } from "../types";
import { createMarkdownRenderer } from "../markdown";
import { makeHash } from "../utils";
import type { OutputWriteContext, RenderDocumentsResult, WikiLookup } from "./contracts";
import { buildWikiResolutionSignature, createWikiResolver } from "./source";
import { toContentFileName } from "./shared";

// Bump whenever renderer-owned HTML changes in a way that is incompatible with cached fragments.
export const CONTENT_RENDERER_VERSION = "content-html-v3";
const mermaidFenceDetector = new MarkdownIt({ html: true });

export function hasMermaidDocuments(docs: DocRecord[]): boolean {
  return docs.some((doc) =>
    mermaidFenceDetector
      .parse(doc.body, {})
      .some(
        (token) =>
          token.type === "fence" && token.info.trim().split(/\s+/)[0]?.toLowerCase() === "mermaid",
      ),
  );
}

export async function renderDocuments(
  docs: DocRecord[],
  options: BuildOptions,
  previousDocs: BuildCache["docs"],
  outputContext: OutputWriteContext,
  wikiLookup: WikiLookup,
): Promise<RenderDocumentsResult> {
  const markdownRenderer = await createMarkdownRenderer(options);
  const contentByDocId = new Map<string, string>();
  const nextDocs: BuildCache["docs"] = {};
  let renderedDocs = 0;
  let skippedDocs = 0;

  for (const doc of docs) {
    const wikiSignature = options.wikilinks ? buildWikiResolutionSignature(doc, wikiLookup) : "";
    const sourceHash = makeHash(
      [
        CONTENT_RENDERER_VERSION,
        doc.rawHash,
        doc.route,
        options.shikiTheme,
        options.locale,
        options.imagePolicy,
        options.wikilinks ? "wikilinks-on" : "wikilinks-off",
        options.allowUnsafeHtml ? "unsafe-html-v1" : "safe-html-v1",
        wikiSignature,
      ].join("::"),
    );
    const previous = previousDocs[doc.id];
    const contentRelPath = `content/${toContentFileName(doc.id)}`;
    const outputPath = path.join(options.outDir, "content", toContentFileName(doc.id));
    const unchanged =
      previous?.hash === sourceHash && outputContext.previousHashes[contentRelPath] === sourceHash;

    nextDocs[doc.id] = { hash: sourceHash, route: doc.route, relPath: doc.relPath };
    outputContext.nextHashes[contentRelPath] = sourceHash;

    if (unchanged) {
      const outputFile = Bun.file(outputPath);
      if (await outputFile.exists()) {
        skippedDocs += 1;
        contentByDocId.set(doc.id, await outputFile.text());
        continue;
      }
    }

    const resolver = createWikiResolver(wikiLookup, doc);
    const renderResult = await markdownRenderer.render(doc.body, resolver);
    for (const warning of renderResult.warnings) {
      console.warn(`[markdown] ${doc.relPath}: ${warning}`);
    }

    await Bun.write(outputPath, renderResult.html);
    contentByDocId.set(doc.id, renderResult.html);
    renderedDocs += 1;
  }

  return { contentByDocId, nextDocs, renderedDocs, skippedDocs };
}
