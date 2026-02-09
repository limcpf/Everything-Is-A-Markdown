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
  sourceDir: string;
}

export interface UserConfig {
  vaultDir?: string;
  outDir?: string;
  exclude?: string[];
  pinnedMenu?: {
    label?: string;
    sourceDir: string;
  };
  ui?: {
    newWithinDays?: number;
    recentLimit?: number;
  };
  markdown?: {
    wikilinks?: boolean;
    images?: ImagePolicy;
    gfm?: boolean;
    highlight?: {
      engine?: "shiki";
      theme?: string;
    };
  };
  seo?: UserSeoConfig;
}

export interface BuildOptions {
  vaultDir: string;
  outDir: string;
  exclude: string[];
  newWithinDays: number;
  recentLimit: number;
  pinnedMenu: PinnedMenuOption | null;
  wikilinks: boolean;
  imagePolicy: ImagePolicy;
  gfm: boolean;
  shikiTheme: string;
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
  date?: string;
  updatedDate?: string;
  description?: string;
  tags: string[];
  mtimeMs: number;
  body: string;
  rawHash: string;
  wikiTargets: string[];
  isNew: boolean;
  branch: string | null;
}

export interface FileNode {
  type: "file";
  name: string;
  id: string;
  title: string;
  route: string;
  contentUrl: string;
  mtime: number;
  isNew: boolean;
  tags: string[];
  description?: string;
  date?: string;
  updatedDate?: string;
  branch: string | null;
}

export interface FolderNode {
  type: "folder";
  name: string;
  path: string;
  virtual?: boolean;
  children: TreeNode[];
}

export type TreeNode = FolderNode | FileNode;

export interface Manifest {
  generatedAt: string;
  defaultBranch: string;
  branches: string[];
  ui: {
    newWithinDays: number;
    recentLimit: number;
  };
  tree: TreeNode[];
  routeMap: Record<string, string>;
  docs: Array<{
    id: string;
    route: string;
    title: string;
    contentUrl: string;
    mtime: number;
    date?: string;
    updatedDate?: string;
    tags: string[];
    description?: string;
    isNew: boolean;
    branch: string | null;
  }>;
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
