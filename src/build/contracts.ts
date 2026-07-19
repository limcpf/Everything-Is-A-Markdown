import type { BuildCache, DocRecord } from "../types";

export interface BuildResult {
  totalDocs: number;
  renderedDocs: number;
  skippedDocs: number;
}

export interface CacheLocation {
  namespace: string;
  rootDir: string;
  namespaceDir: string;
  cachePath: string;
}

export interface ReadDocsResult {
  docs: DocRecord[];
  nextSources: BuildCache["sources"];
}

export interface WikiLookup {
  byPath: Map<string, DocRecord>;
  byPrefix: Map<string, DocRecord[]>;
  byTitle: Map<string, DocRecord[]>;
  byStem: Map<string, DocRecord[]>;
}

export interface OutputWriteContext {
  outDir: string;
  previousHashes: Record<string, string>;
  nextHashes: Record<string, string>;
}

export interface RuntimeAssets {
  cssRelPath: string;
  jsRelPath: string;
  treeJsRelPath: string;
}
