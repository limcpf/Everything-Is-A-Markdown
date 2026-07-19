import type { RuntimeLayoutConfig } from "./defaults";
import type { UiLocale } from "./i18n";

export type ImagePolicy = "keep" | "omit-local";

export interface UserSeoConfig {
  siteUrl?: string;
  pathBase?: string;
  siteName?: string;
  defaultTitle?: string;
  defaultDescription?: string;
  locale?: string;
  twitterCard?: "summary" | "summary_large_image";
  twitterSite?: string;
  twitterCreator?: string;
  defaultSocialImage?: string;
  defaultOgImage?: string;
  defaultTwitterImage?: string;
}

export interface BuildSeoOptions {
  siteUrl: string;
  pathBase: string;
  siteName?: string;
  defaultTitle?: string;
  defaultDescription?: string;
  locale?: string;
  twitterCard?: "summary" | "summary_large_image";
  twitterSite?: string;
  twitterCreator?: string;
  defaultSocialImage?: string;
  defaultOgImage?: string;
  defaultTwitterImage?: string;
}

export interface PinnedMenuOption {
  label: string;
  sourceDir?: string;
  categoryPath?: string;
}

export interface UserConfig {
  vaultDir?: string;
  outDir?: string;
  defaultBranch?: string;
  exclude?: string[];
  staticPaths?: string[];
  pinnedMenu?: {
    label?: string;
    sourceDir?: string;
    categoryPath?: string;
  };
  ui?: {
    locale?: UiLocale;
    newWithinDays?: number;
    recentLimit?: number;
  };
  markdown?: {
    wikilinks?: boolean;
    images?: ImagePolicy;
    gfm?: boolean;
    allowUnsafeHtml?: boolean;
    highlight?: {
      engine?: "shiki";
      theme?: string;
    };
    mermaid?: {
      enabled?: boolean;
      cdnUrl?: string;
      theme?: string;
    };
  };
  seo?: UserSeoConfig;
}

export interface BuildOptions {
  vaultDir: string;
  outDir: string;
  exclude: string[];
  staticPaths: string[];
  newWithinDays: number;
  recentLimit: number;
  locale: UiLocale;
  defaultBranch: string;
  siteTitle?: string;
  pinnedMenu: PinnedMenuOption | null;
  wikilinks: boolean;
  imagePolicy: ImagePolicy;
  gfm: boolean;
  allowUnsafeHtml: boolean;
  shikiTheme: string;
  mermaid: {
    enabled: boolean;
    cdnUrl: string;
    theme: string;
  };
  layout: RuntimeLayoutConfig;
  seo: BuildSeoOptions | null;
}

export interface DocRecord {
  sourcePath: string;
  relPath: string;
  relNoExt: string;
  id: string;
  route: string;
  contentUrl: string;
  fileName: string;
  title: string;
  prefix?: string;
  categoryPath: string;
  date?: string;
  updatedDate?: string;
  description?: string;
  tags: string[];
  mtimeMs: number;
  body: string;
  rawHash: string;
  wikiTargets: string[];
  branch: string | null;
}

export interface FileNode {
  type: "file";
  name: string;
  id: string;
}

export interface FolderNode {
  type: "folder";
  name: string;
  path: string;
  virtual?: boolean;
  children: TreeNode[];
}

export type TreeNode = FolderNode | FileNode;

export interface ManifestDoc {
  id: string;
  route: string;
  title: string;
  prefix?: string;
  categoryPath: string;
  contentUrl: string;
  date?: string;
  updatedDate?: string;
  tags: string[];
  description?: string;
  branch: string | null;
  wikiTargets: string[];
  backlinks: Array<{
    id: string;
    route: string;
    title: string;
    prefix?: string;
  }>;
}

export interface Manifest {
  schemaVersion: 2;
  siteTitle: string;
  pathBase: string;
  locale: UiLocale;
  defaultBranch: string;
  branches: string[];
  mermaid: {
    enabled: boolean;
    cdnUrl: string;
    theme: string;
  };
  layout: RuntimeLayoutConfig;
  ui: {
    newWithinDays: number;
    recentLimit: number;
  };
  tree: TreeNode[];
  routeMap: Record<string, string>;
  docIds: string[];
  docsById: Record<string, ManifestDoc>;
}

export interface BuildCache {
  version: number;
  sources: Record<
    string,
    {
      mtimeMs: number;
      size: number;
      rawHash: string;
      publish: boolean;
      draft: boolean;
      title?: string;
      prefix?: string;
      categoryPath?: string;
      date?: string;
      updatedDate?: string;
      description?: string;
      tags: string[];
      branch: string | null;
      body: string;
      wikiTargets: string[];
    }
  >;
  docs: Record<
    string,
    {
      hash: string;
      route: string;
      relPath: string;
    }
  >;
  outputHashes: Record<string, string>;
}

export interface WikiResolver {
  resolve(input: string): { route: string; label: string } | null;
}
