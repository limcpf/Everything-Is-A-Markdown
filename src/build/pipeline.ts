import type { BuildCache, BuildOptions } from "../types";
import type { BuildResult } from "./contracts";
import { renderDocuments } from "./content";
import { buildDocumentGraph } from "./graph";
import { emitOutputPhase, prepareOutputPhase, validateStaticOutputPlan } from "./output";
import { readPublishedDocs } from "./source";
import {
  BUILD_CACHE_VERSION,
  claimBuildStorage,
  cleanBuildArtifacts,
  inspectBuildStorage,
  persistBuildCache,
} from "./storage";

export { cleanBuildArtifacts };

export async function buildSite(options: BuildOptions): Promise<BuildResult> {
  const storage = await inspectBuildStorage(options);
  validateStaticOutputPlan(options);

  const { docs, nextSources } = await readPublishedDocs(options, storage.previousCache.sources);
  docs.sort((left, right) => left.relNoExt.localeCompare(right.relNoExt, "ko-KR"));

  await claimBuildStorage(options, storage, docs);
  const output = await prepareOutputPhase(options, storage.previousOutputHashes);
  const graph = buildDocumentGraph(docs, options);
  const rendered = await renderDocuments(
    docs,
    options,
    storage.previousDocs,
    output.context,
    graph.wikiLookup,
  );

  await emitOutputPhase(output, docs, graph.manifest, options, rendered.contentByDocId);

  const nextCache: BuildCache = {
    version: BUILD_CACHE_VERSION,
    sources: nextSources,
    docs: rendered.nextDocs,
    outputHashes: output.context.nextHashes,
  };
  await persistBuildCache(storage.cacheLocation, nextCache);

  return {
    totalDocs: docs.length,
    renderedDocs: rendered.renderedDocs,
    skippedDocs: rendered.skippedDocs,
  };
}
