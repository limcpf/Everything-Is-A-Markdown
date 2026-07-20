import type { BuildCache, DocRecord, Manifest, TreeNode } from "../types";

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
  mermaidJsRelPath?: string;
  mermaidLicenseRelPath?: string;
}

export interface BuildStorageState {
  cacheLocation: CacheLocation;
  outputRoot: string;
  previousCache: BuildCache;
  previousDocs: BuildCache["docs"];
  previousOutputHashes: BuildCache["outputHashes"];
}

export interface BuildStorageTransaction {
  cacheLocation: CacheLocation;
  outputRoot: string;
  stagingRoot: string;
  backupRoot: string;
  hadPreviousOutput: boolean;
}

export interface DocumentGraphResult {
  tree: TreeNode[];
  manifest: Manifest;
  wikiLookup: WikiLookup;
}

export interface RenderDocumentsResult {
  contentByDocId: Map<string, string>;
  nextDocs: BuildCache["docs"];
  renderedDocs: number;
  skippedDocs: number;
}

export interface OutputPhaseState {
  context: OutputWriteContext;
  runtimeAssets: RuntimeAssets;
  mermaidRuntimeUrl: string | null;
}
