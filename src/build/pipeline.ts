import type { BuildCache, BuildOptions } from "../types";
import type { BuildResult } from "./contracts";
import { hasMermaidDocuments, renderDocuments } from "./content";
import { buildDocumentGraph } from "./graph";
import { emitOutputPhase, prepareOutputPhase, validateStaticOutputPlan } from "./output";
import { readPublishedDocs } from "./source";
import {
  abortBuildStorageTransaction,
  BUILD_CACHE_VERSION,
  beginBuildStorageTransaction,
  cleanBuildArtifacts,
  commitBuildStorageTransaction,
  inspectBuildStorage,
} from "./storage";

export { cleanBuildArtifacts };

export async function buildSite(options: BuildOptions): Promise<BuildResult> {
  const storage = await inspectBuildStorage(options);
  validateStaticOutputPlan(options);

  const { docs, nextSources } = await readPublishedDocs(options, storage.previousCache.sources);
  docs.sort((left, right) => left.relNoExt.localeCompare(right.relNoExt, "ko-KR"));

  const transaction = await beginBuildStorageTransaction(options, storage);
  const stagedOptions: BuildOptions = { ...options, outDir: transaction.stagingRoot };

  try {
    const shouldSelfHostMermaid =
      stagedOptions.mermaid.enabled &&
      stagedOptions.mermaid.cdnUrl === null &&
      hasMermaidDocuments(docs);
    const output = await prepareOutputPhase(
      stagedOptions,
      storage.previousOutputHashes,
      shouldSelfHostMermaid,
    );
    const outputOptions: BuildOptions = output.mermaidRuntimeUrl
      ? {
          ...stagedOptions,
          mermaid: { ...stagedOptions.mermaid, cdnUrl: output.mermaidRuntimeUrl },
        }
      : stagedOptions;
    const graph = buildDocumentGraph(docs, outputOptions);
    const rendered = await renderDocuments(
      docs,
      outputOptions,
      storage.previousDocs,
      output.context,
      graph.wikiLookup,
    );

    await emitOutputPhase(output, docs, graph.manifest, outputOptions, rendered.contentByDocId);

    const nextCache: BuildCache = {
      version: BUILD_CACHE_VERSION,
      sources: nextSources,
      docs: rendered.nextDocs,
      outputHashes: output.context.nextHashes,
    };
    await commitBuildStorageTransaction(transaction, nextCache);

    return {
      totalDocs: docs.length,
      renderedDocs: rendered.renderedDocs,
      skippedDocs: rendered.skippedDocs,
    };
  } catch (error) {
    try {
      await abortBuildStorageTransaction(transaction);
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "[build] Failed build cleanup was incomplete",
        { cause: cleanupError },
      );
    }
    throw error;
  }
}
