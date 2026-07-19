import type { Manifest, ManifestDoc } from "../types";
import type { UiMessages } from "../i18n";
import type { RenderedViewChrome } from "../view-contract";

export type RuntimeManifest = Manifest;
export type RuntimeManifestDoc = ManifestDoc & { isNew: boolean };
export type RuntimeWindow = Window &
  typeof globalThis & {
    mermaid?: MermaidLibrary;
  };

export interface InitialViewData {
  route: string;
  docId: string;
  title: string;
}

export interface InitialRuntimeData {
  manifestUrl: string;
  pathBase: string;
  treeModuleUrl: string;
}

export interface RuntimeBootstrap {
  initialViewData: InitialViewData | null;
  manifest: RuntimeManifest;
  pathBase: string;
  siteTitle: string;
  treeModuleUrl: string;
}

export interface RuntimeTreeFileNode {
  type: "file";
  name: string;
  id: string;
  title?: string;
  prefix?: string;
  route?: string;
  branch?: string | null;
  isNew?: boolean;
}

export interface RuntimeTreeFolderNode {
  type: "folder";
  name: string;
  path: string;
  virtual?: boolean;
  children: RuntimeTreeNode[];
}

export type RuntimeTreeNode = RuntimeTreeFolderNode | RuntimeTreeFileNode;

export interface TreeFolderMetadata {
  kind: "folder";
  name: string;
  sourcePath: string;
  virtual: boolean;
}

export interface TreeFileMetadata {
  kind: "file";
  branch: string | null;
  docId: string;
  isNew: boolean;
  prefix: string;
  route: string;
  title: string;
}

export type TreePathMetadata = TreeFolderMetadata | TreeFileMetadata;

export interface TreesAdapterInput {
  docIdToPrimaryTreePath: Map<string, string>;
  docIdToTreePaths: Map<string, string[]>;
  metadataByTreePath: Map<string, TreePathMetadata>;
  paths: string[];
  treePathToDocId: Map<string, string>;
  treePathToRoute: Map<string, string>;
}

export interface BranchView {
  docs: RuntimeManifestDoc[];
  visibleDocIds: Set<string>;
  tree: RuntimeTreeNode[];
  trees: TreesAdapterInput;
  routeMap: Record<string, string>;
  docIndexById: Map<string, number>;
}

export interface NavigationResolution {
  route: string;
  id: string | null;
  doc: RuntimeManifestDoc | null;
  branchChanged: boolean;
}

export interface NavigationState {
  availableBranches: string[];
  defaultBranch: string;
  readonly activeBranch: string;
  readonly currentDocId: string;
  readonly view: BranchView;
  setActiveBranch(value: unknown): boolean;
  setCurrentDocId(value: unknown): void;
  resolve(rawRoute: unknown): NavigationResolution;
}

export interface RuntimeController {
  setup?: () => void;
  destroy?: () => void;
}

export interface A11yAnnouncer extends RuntimeController {
  announce(message: string): void;
  destroy(): void;
}

export interface EventScope {
  listen(
    target: EventTarget | null | undefined,
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): void;
  cleanup(): void;
  readonly size: number;
}

export interface ViewerElements {
  breadcrumb: HTMLElement | null;
  title: HTMLElement | null;
  meta: HTMLElement | null;
  content: HTMLElement | null;
  backlinks: HTMLElement | null;
  nav: HTMLElement | null;
  viewer: Element | null;
}

export interface ContentRenderers {
  breadcrumb(route: unknown): string;
  chrome(options: {
    route: unknown;
    doc: RuntimeManifestDoc;
    docs: readonly RuntimeManifestDoc[];
    pathBase: unknown;
  }): RenderedViewChrome;
  documentTitle(pageTitle: unknown, siteTitle: unknown): string;
}

export interface ContentLifecycle {
  beforeNavigate?: () => void;
  onBranchChange?: (branch: string) => void;
  onCurrentDocChange?: (docId: string) => void;
  onMissingSelection?: () => void;
  enhanceContent?: (target: HTMLElement | null) => void | Promise<void>;
  announce?: (message: string) => void;
  resolveLocationRoute?: (pathname: string) => string;
}

export interface ContentController extends RuntimeController {
  navigate(rawRoute: unknown, push: boolean): Promise<boolean>;
  setup(): void;
  destroy(): void;
}

export interface MermaidConfig {
  enabled: boolean;
  cdnUrl: string;
  theme: string;
}

export interface MermaidLibrary {
  initialize: (options: { startOnLoad: boolean; theme: string }) => void;
  run?: (options: { nodes: HTMLElement[] }) => Promise<void> | void;
  init?: (options: { startOnLoad: boolean }, nodes: HTMLElement[]) => Promise<void> | void;
}

export interface MermaidController extends RuntimeController {
  setup(): void;
  destroy(): void;
  render(root?: ParentNode | null): Promise<void>;
}

export interface ContentEnhancementController extends RuntimeController {
  setup(): void;
  destroy(): void;
  enhance(target?: HTMLElement | null): Promise<void>;
}

export interface SettingsController extends RuntimeController {
  close(): void;
  setup(): void;
  destroy(): void;
}

export interface SidebarLayoutController extends RuntimeController {
  close(): void;
  isCompact(): boolean;
  setup(): void;
  destroy(): void;
}

export interface TreeController extends RuntimeController {
  clearSelection(): void;
  handleBranchChange(branch: string): void;
  requestLoad(reason: string, options?: { retry?: boolean }): Promise<boolean>;
  scheduleDeferredLoad(): void;
  setActiveBranch(branch: unknown): Promise<boolean>;
  setup(): void;
  destroy(): void;
  syncActiveSelection(docId: string, options?: { scroll?: boolean }): void;
}

export interface TreeControllerOptions {
  navigation: NavigationState;
  pathBase: string;
  treeModuleUrl: string;
  navigate: (route: string, push: boolean) => Promise<boolean>;
  announce?: (message: string) => void;
  messages?: UiMessages;
  isCompactLayout?: () => boolean;
  documentRef?: Document;
  windowRef?: RuntimeWindow;
  storage?: Pick<Storage, "setItem">;
}

export type TreeLabelHost = HTMLElement & {
  __eiamTreeLabelFrame?: number;
  __eiamTreeLabelObserver?: MutationObserver;
  __eiamTreeLabelObservedRoot?: ParentNode;
  __eiamMetadataByTreePath?: Map<string, TreePathMetadata>;
};

export type TreeRuntimeModule = Pick<
  typeof import("@pierre/trees"),
  "FileTree" | "prepareFileTreeInput"
> & { TREE_UNSAFE_CSS: string };
