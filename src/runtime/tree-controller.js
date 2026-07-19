import { createEventScope } from "./controller-lifecycle.js";
import { pickHomeRoute, resolveRouteFromLocation, toPathWithBase } from "./navigation-state.js";

const BRANCH_KEY = "fsblog.branch";
const TREE_RUNTIME_STATE_ATTR = "data-tree-runtime";

/**
 * @typedef {import("@pierre/trees").ContextMenuItem} ContextMenuItem
 * @typedef {import("@pierre/trees").ContextMenuOpenContext} ContextMenuOpenContext
 * @typedef {import("@pierre/trees").FileTree} FileTree
 * @typedef {import("@pierre/trees").FileTreeRowDecorationContext} FileTreeRowDecorationContext
 * @typedef {import("@pierre/trees").FileTreeSortEntry} FileTreeSortEntry
 * @typedef {import("./contracts").EventScope} EventScope
 * @typedef {import("./contracts").TreeController} TreeController
 * @typedef {import("./contracts").TreeControllerOptions} TreeControllerOptions
 * @typedef {import("./contracts").TreeLabelHost} TreeLabelHost
 * @typedef {import("./contracts").TreePathMetadata} TreePathMetadata
 * @typedef {import("./contracts").TreeRuntimeModule} TreeRuntimeModule
 * @typedef {import("./contracts").RuntimeWindow} RuntimeWindow
 */

/**
 * @param {unknown} value
 * @param {string} [fallback]
 */
function normalizeTreeLabelText(value, fallback = "") {
  const normalized = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  return normalized || fallback;
}

/**
 * @param {TreeLabelHost | null | undefined} host
 * @returns {ParentNode | null}
 */
function getTreeLabelRenderRoot(host) {
  return host?.shadowRoot || host || null;
}

/**
 * @param {TreeLabelHost | null | undefined} host
 * @param {Document} documentRef
 */
function decorateTreeLabels(host, documentRef) {
  const metadataByTreePath = host?.__eiamMetadataByTreePath;
  if (!(metadataByTreePath instanceof Map)) {
    return;
  }

  const renderRoot = getTreeLabelRenderRoot(host);
  if (!renderRoot) {
    return;
  }

  const rows = renderRoot.querySelectorAll(
    "[data-type='item'][data-item-type='file'][data-item-path]",
  );
  for (const row of rows) {
    const treePath = row.getAttribute("data-item-path") || "";
    const metadata = metadataByTreePath.get(treePath);
    if (!metadata || metadata.kind !== "file") {
      continue;
    }

    const prefix = normalizeTreeLabelText(metadata.prefix);
    const fallbackName = treePath.split("/").pop() || "";
    const fallbackTitle =
      prefix && fallbackName.startsWith(`${prefix} `)
        ? fallbackName.slice(prefix.length).trimStart()
        : fallbackName;
    const title = normalizeTreeLabelText(metadata.title, fallbackTitle);
    const labelKey = JSON.stringify([prefix, title]);
    /** @type {HTMLElement | null} */
    const content = row.querySelector("[data-item-section='content']");
    if (!content || content.dataset.eiamTreeLabel === labelKey) {
      continue;
    }

    content.dataset.eiamTreeLabel = labelKey;
    content.textContent = "";
    const label = documentRef.createElement("span");
    label.className = "tree-item-label";
    if (prefix) {
      const prefixBadge = documentRef.createElement("span");
      prefixBadge.className = "tree-item-prefix-badge";
      prefixBadge.textContent = prefix;
      label.appendChild(prefixBadge);
    }
    const titleText = documentRef.createElement("span");
    titleText.className = "tree-item-title";
    titleText.textContent = title;
    label.appendChild(titleText);
    content.appendChild(label);
    row.setAttribute("title", prefix ? `${prefix} ${title}` : title);
  }
}

/**
 * @param {TreeLabelHost | null | undefined} host
 * @param {Document} documentRef
 * @param {RuntimeWindow} windowRef
 */
function queueTreeLabelDecoration(host, documentRef, windowRef) {
  if (!host) {
    return;
  }
  if (host.__eiamTreeLabelFrame) {
    windowRef.cancelAnimationFrame(host.__eiamTreeLabelFrame);
  }
  host.__eiamTreeLabelFrame = windowRef.requestAnimationFrame(() => {
    host.__eiamTreeLabelFrame = 0;
    decorateTreeLabels(host, documentRef);
  });
}

/**
 * @param {TreeLabelHost | null | undefined} host
 * @param {Map<string, TreePathMetadata>} metadataByTreePath
 * @param {Document} documentRef
 * @param {RuntimeWindow} windowRef
 */
function setupTreeLabelDecorations(host, metadataByTreePath, documentRef, windowRef) {
  if (!host) {
    return;
  }
  host.__eiamMetadataByTreePath = metadataByTreePath;
  const renderRoot = getTreeLabelRenderRoot(host);
  if (!renderRoot) {
    return;
  }
  if (host.__eiamTreeLabelObservedRoot !== renderRoot) {
    host.__eiamTreeLabelObserver?.disconnect();
    host.__eiamTreeLabelObservedRoot = renderRoot;
    host.__eiamTreeLabelObserver = new windowRef.MutationObserver(() => {
      queueTreeLabelDecoration(host, documentRef, windowRef);
    });
    host.__eiamTreeLabelObserver.observe(renderRoot, { childList: true, subtree: true });
  }
  queueTreeLabelDecoration(host, documentRef, windowRef);
}

/**
 * @param {TreeLabelHost | null | undefined} host
 * @param {RuntimeWindow} windowRef
 */
function cleanupTreeLabelDecorations(host, windowRef) {
  if (!host) {
    return;
  }
  if (host.__eiamTreeLabelFrame) {
    windowRef.cancelAnimationFrame(host.__eiamTreeLabelFrame);
    host.__eiamTreeLabelFrame = 0;
  }
  host.__eiamTreeLabelObserver?.disconnect();
  delete host.__eiamTreeLabelObserver;
  delete host.__eiamTreeLabelObservedRoot;
  delete host.__eiamMetadataByTreePath;
}

/**
 * @param {unknown} value
 * @returns {value is TreeRuntimeModule}
 */
function isTreeRuntimeModule(value) {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = /** @type {Record<string, unknown>} */ (value);
  return (
    typeof candidate.FileTree === "function" &&
    typeof candidate.prepareFileTreeInput === "function" &&
    typeof candidate.TREE_UNSAFE_CSS === "string"
  );
}

/**
 * @param {TreeControllerOptions} options
 * @returns {TreeController}
 */
export function createTreeController(options) {
  const {
    navigation,
    pathBase,
    treeModuleUrl,
    navigate,
    announce = () => {},
    isCompactLayout = () => false,
    documentRef = globalThis.document,
    windowRef = globalThis.window,
    storage = globalThis.localStorage,
  } = options;
  const treeRoot = documentRef.getElementById("tree-root");
  const treeSearchInput = /** @type {HTMLInputElement | null} */ (
    documentRef.getElementById("tree-search-input")
  );
  const treeSearchClear = /** @type {HTMLButtonElement | null} */ (
    documentRef.getElementById("tree-search-clear")
  );
  const treeSearchPrev = /** @type {HTMLButtonElement | null} */ (
    documentRef.getElementById("tree-search-prev")
  );
  const treeSearchNext = /** @type {HTMLButtonElement | null} */ (
    documentRef.getElementById("tree-search-next")
  );
  const treeSearchCount = documentRef.getElementById("tree-search-count");
  const sidebarBranchPills = documentRef.getElementById("sidebar-branch-pills");
  const sidebarBranchInfo = documentRef.getElementById("sidebar-branch-info");
  /** @type {EventScope | null} */
  let events = null;
  /** @type {FileTree | null} */
  let fileTree = null;
  let isSyncingTreeSelection = false;
  /** @type {Map<string, number>} */
  let treePathOrder = new Map();
  let treeSearchValue = "";
  let renderedTreeBranch = "";
  /** @type {TreeRuntimeModule | null} */
  let treeRuntime = null;
  /** @type {Promise<boolean> | null} */
  let treeLoadPromise = null;
  let treeRetryCount = 0;
  let treeLoadAllowed = false;
  let pendingTreeLoadReason = "";
  let lifecycleGeneration = 0;
  /** @type {number | null} */
  let deferredFrame = null;
  /** @type {number | null} */
  let paintFrame = null;
  /** @type {number | null} */
  let idleHandle = null;
  /** @type {number | null} */
  let idleFallbackTimer = null;

  /** @param {string} state */
  const setTreeRuntimeState = (state) => {
    documentRef.documentElement?.setAttribute(TREE_RUNTIME_STATE_ATTR, state);
  };

  const renderBranchPills = () => {
    if (!sidebarBranchPills) {
      return;
    }
    sidebarBranchPills.replaceChildren();
    for (const branch of navigation.availableBranches) {
      const pill = documentRef.createElement("button");
      pill.type = "button";
      pill.className = "branch-pill";
      pill.dataset.branch = branch;
      pill.textContent = branch;
      pill.setAttribute("aria-pressed", "false");
      sidebarBranchPills.appendChild(pill);
    }
  };

  const updateBranchInfo = () => {
    if (sidebarBranchInfo) {
      sidebarBranchInfo.textContent =
        navigation.activeBranch === navigation.defaultBranch
          ? `publish: true · ${navigation.activeBranch} + unclassified`
          : `publish: true · ${navigation.activeBranch} only`;
    }
    for (const pill of sidebarBranchPills?.querySelectorAll(".branch-pill") ?? []) {
      if (!(pill instanceof windowRef.HTMLElement)) {
        continue;
      }
      const isActive = pill.dataset.branch === navigation.activeBranch;
      pill.classList.toggle("is-active", isActive);
      pill.setAttribute("aria-pressed", String(isActive));
    }
  };

  const updateTreeSearchControls = () => {
    const normalizedSearchValue = fileTree ? fileTree.getSearchValue() : treeSearchValue.trim();
    const hasSearch = normalizedSearchValue.length > 0;
    const matchCount = hasSearch && fileTree ? fileTree.getSearchMatchingPaths().length : 0;
    const canStep = hasSearch && matchCount > 0;
    if (treeSearchClear) {
      treeSearchClear.hidden = !hasSearch;
      treeSearchClear.disabled = !hasSearch;
    }
    for (const button of [treeSearchPrev, treeSearchNext]) {
      if (button) {
        button.disabled = !canStep;
      }
    }
    if (treeSearchCount) {
      treeSearchCount.textContent = hasSearch ? `${matchCount}개 일치` : "";
    }
  };

  /** @param {string} value */
  const applyTreeSearch = (value) => {
    treeSearchValue = value;
    if (treeSearchInput && treeSearchInput.value !== value) {
      treeSearchInput.value = value;
    }
    if (fileTree) {
      const query = value.trim();
      if (query) {
        if (fileTree.isSearchOpen()) {
          fileTree.setSearch(query);
        } else {
          fileTree.openSearch(query);
        }
      } else {
        fileTree.closeSearch();
      }
    }
    updateTreeSearchControls();
  };

  /** @param {number} direction */
  const moveTreeSearchFocus = (direction) => {
    if (!fileTree || !fileTree.isSearchOpen() || fileTree.getSearchMatchingPaths().length === 0) {
      return;
    }
    if (direction < 0) {
      fileTree.focusPreviousSearchMatch();
    } else {
      fileTree.focusNextSearchMatch();
    }
    updateTreeSearchControls();
  };

  /**
   * @param {string} docId
   * @param {{ scroll?: boolean }} [options]
   */
  const syncActiveSelection = (docId, { scroll = true } = {}) => {
    if (!fileTree || !docId) {
      return;
    }
    const treePath = navigation.view.trees.docIdToPrimaryTreePath.get(docId);
    if (!treePath) {
      return;
    }
    const selectedPaths = fileTree.getSelectedPaths();
    if (selectedPaths.length === 1 && selectedPaths[0] === treePath) {
      return;
    }
    const item = fileTree.getItem(treePath);
    if (!item) {
      return;
    }
    isSyncingTreeSelection = true;
    try {
      item.select();
    } finally {
      isSyncingTreeSelection = false;
    }
    if (scroll) {
      fileTree.scrollToPath(treePath, { focus: false, offset: "nearest" });
    }
  };

  const clearSelection = () => {
    if (!fileTree) {
      return;
    }
    const selectedPaths = fileTree.getSelectedPaths();
    if (selectedPaths.length === 0) {
      return;
    }
    isSyncingTreeSelection = true;
    try {
      for (const selectedPath of selectedPaths) {
        fileTree.getItem(selectedPath)?.deselect();
      }
    } finally {
      isSyncingTreeSelection = false;
    }
  };

  const destroyFileTree = () => {
    const host = /** @type {TreeLabelHost | null} */ (
      treeRoot?.querySelector("file-tree-container") ?? null
    );
    cleanupTreeLabelDecorations(host, windowRef);
    fileTree?.cleanUp?.();
    fileTree = null;
    renderedTreeBranch = "";
    host?.remove();
  };

  /**
   * @param {FileTreeSortEntry} left
   * @param {FileTreeSortEntry} right
   */
  const compareTreesByBranchOrder = (left, right) => {
    const leftIndex = treePathOrder.get(left.path) ?? Number.MAX_SAFE_INTEGER;
    const rightIndex = treePathOrder.get(right.path) ?? Number.MAX_SAFE_INTEGER;
    if (leftIndex !== rightIndex) {
      return leftIndex - rightIndex;
    }
    return left.path.localeCompare(right.path, "ko-KR");
  };

  const prepareTreesInput = () => {
    if (!treeRuntime) {
      throw new Error("Tree runtime is not loaded");
    }
    treePathOrder = new Map(
      navigation.view.trees.paths.map((treePath, index) => [treePath, index]),
    );
    return treeRuntime.prepareFileTreeInput(navigation.view.trees.paths, {
      sort: compareTreesByBranchOrder,
    });
  };

  /** @param {FileTreeRowDecorationContext} context */
  const renderTreeRowDecoration = ({ item }) => {
    const metadata = navigation.view.trees.metadataByTreePath.get(item.path);
    if (metadata?.kind !== "file" || metadata.isNew !== true) {
      return null;
    }
    return { text: "NEW", title: "New document" };
  };

  /**
   * @param {ContextMenuItem} item
   * @param {ContextMenuOpenContext} context
   */
  const renderTreeContextMenu = (item, context) => {
    const route = navigation.view.trees.treePathToRoute.get(item.path);
    if (!route) {
      return null;
    }
    const menu = documentRef.createElement("div");
    menu.className = "tree-context-menu";
    Object.assign(menu.style, {
      background: "var(--trees-bg-override, canvas)",
      border:
        "1px solid var(--trees-border-color-override, color-mix(in srgb, currentColor 18%, transparent))",
      borderRadius: "6px",
      boxShadow: "0 10px 24px rgba(0, 0, 0, 0.18)",
      minWidth: "120px",
      padding: "4px",
    });
    const link = documentRef.createElement("a");
    link.className = "tree-context-link";
    link.href = toPathWithBase(route, pathBase);
    link.textContent = "Open";
    Object.assign(link.style, {
      borderRadius: "4px",
      color: "inherit",
      display: "block",
      padding: "6px 8px",
      textDecoration: "none",
    });
    link.addEventListener("click", (event) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      event.preventDefault();
      context.close();
      void navigate(route, true);
    });
    menu.appendChild(link);
    return menu;
  };

  const renderTree = () => {
    if (!treeRoot || !treeRuntime) {
      return;
    }
    if (fileTree && renderedTreeBranch !== navigation.activeBranch) {
      destroyFileTree();
    }
    const preparedInput = prepareTreesInput();
    const selectedTreePath = navigation.currentDocId
      ? navigation.view.trees.docIdToPrimaryTreePath.get(navigation.currentDocId)
      : null;
    if (!fileTree) {
      treeRoot.replaceChildren();
      fileTree = new treeRuntime.FileTree({
        composition: {
          contextMenu: {
            enabled: true,
            render: renderTreeContextMenu,
            triggerMode: "right-click",
          },
        },
        fileTreeSearchMode: "hide-non-matches",
        flattenEmptyDirectories: false,
        icons: "minimal",
        initialExpansion: 1,
        initialSelectedPaths: selectedTreePath ? [selectedTreePath] : [],
        itemHeight: 38,
        onSelectionChange(selectedPaths) {
          if (isSyncingTreeSelection) {
            return;
          }
          const selectedPath = selectedPaths.at(-1);
          const route = selectedPath
            ? navigation.view.trees.treePathToRoute.get(selectedPath)
            : null;
          if (!route) {
            windowRef.queueMicrotask(() => {
              syncActiveSelection(navigation.currentDocId, { scroll: false });
            });
            return;
          }
          void navigate(route, true);
        },
        preparedInput,
        renderRowDecoration: renderTreeRowDecoration,
        sort: compareTreesByBranchOrder,
        search: true,
        searchBlurBehavior: "retain",
        stickyFolders: true,
        unsafeCSS: treeRuntime.TREE_UNSAFE_CSS,
      });
      fileTree.render({ containerWrapper: treeRoot });
    } else {
      isSyncingTreeSelection = true;
      try {
        fileTree.resetPaths(preparedInput.paths, { preparedInput });
      } finally {
        isSyncingTreeSelection = false;
      }
    }
    renderedTreeBranch = navigation.activeBranch;
    syncActiveSelection(navigation.currentDocId || "");
    applyTreeSearch(treeSearchValue);
    setupTreeLabelDecorations(
      /** @type {TreeLabelHost | null} */ (treeRoot.querySelector("file-tree-container")),
      navigation.view.trees.metadataByTreePath,
      documentRef,
      windowRef,
    );
  };

  const renderTreeLoadingState = () => {
    if (!treeRoot || fileTree) {
      return;
    }
    const status = documentRef.createElement("p");
    status.className = "tree-load-status";
    status.setAttribute("role", "status");
    status.textContent = "문서 탐색기를 불러오는 중입니다.";
    treeRoot.replaceChildren(status);
  };

  /** @param {unknown} error */
  const renderTreeFallback = (error) => {
    if (!treeRoot) {
      return;
    }
    const fallback = documentRef.createElement("section");
    fallback.className = "tree-load-fallback";
    fallback.setAttribute("aria-label", "간이 문서 탐색기");
    const message = documentRef.createElement("p");
    message.className = "tree-load-fallback-message";
    message.setAttribute("role", "alert");
    message.textContent = "문서 트리를 불러오지 못했습니다. 아래 링크로 계속 탐색할 수 있습니다.";
    const retry = documentRef.createElement("button");
    retry.className = "tree-load-retry";
    retry.type = "button";
    retry.textContent = "탐색기 다시 불러오기";
    retry.addEventListener("click", () => {
      void requestLoad("retry", { retry: true });
    });
    const links = documentRef.createElement("ul");
    links.className = "tree-load-fallback-links";
    for (const doc of navigation.view.docs) {
      const item = documentRef.createElement("li");
      const link = documentRef.createElement("a");
      link.href = toPathWithBase(doc.route, pathBase);
      link.textContent = doc.title;
      link.addEventListener("click", (event) => {
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }
        event.preventDefault();
        void navigate(doc.route, true);
      });
      item.appendChild(link);
      links.appendChild(item);
    }
    fallback.append(message, retry, links);
    fallback.dataset.error = error instanceof Error ? error.name : "TreeLoadError";
    treeRoot.replaceChildren(fallback);
  };

  /**
   * @param {{ reason: string; retry?: boolean }} loadOptions
   * @returns {Promise<boolean>}
   */
  function loadTreeRuntime({ reason, retry = false }) {
    if (treeRuntime) {
      renderTree();
      return Promise.resolve(true);
    }
    if (treeLoadPromise) {
      return treeLoadPromise;
    }
    if (!treeModuleUrl) {
      const error = new Error("Tree module URL is unavailable");
      setTreeRuntimeState("error");
      renderTreeFallback(error);
      return Promise.resolve(false);
    }

    const importUrl = new URL(treeModuleUrl);
    if (retry) {
      treeRetryCount += 1;
      importUrl.searchParams.set("retry", String(treeRetryCount));
    }
    setTreeRuntimeState("loading");
    if (treeRoot) {
      treeRoot.setAttribute("aria-busy", "true");
      treeRoot.dataset.treeLoadReason = reason;
    }
    renderTreeLoadingState();
    windowRef.performance?.mark?.("eiam-tree-load-start");
    const generationAtLoad = lifecycleGeneration;
    /** @type {Promise<boolean>} */
    const pending = import(importUrl.href)
      .then((/** @type {unknown} */ module) => {
        if (!events || generationAtLoad !== lifecycleGeneration) {
          return false;
        }
        if (!isTreeRuntimeModule(module)) {
          throw new Error("Tree runtime exports are invalid");
        }
        treeRuntime = module;
        renderTree();
        treeRoot?.setAttribute("aria-busy", "false");
        setTreeRuntimeState("ready");
        windowRef.performance?.mark?.("eiam-tree-ready");
        return true;
      })
      .catch((/** @type {unknown} */ error) => {
        if (!events || generationAtLoad !== lifecycleGeneration) {
          return false;
        }
        destroyFileTree();
        treeRuntime = null;
        treeRoot?.setAttribute("aria-busy", "false");
        setTreeRuntimeState("error");
        renderTreeFallback(error);
        announce("문서 트리를 불러오지 못했습니다. 간이 링크 탐색기를 사용할 수 있습니다.");
        console.error("Tree runtime load failed:", error);
        return false;
      })
      .finally(() => {
        if (treeLoadPromise === pending) {
          treeLoadPromise = null;
        }
      });
    treeLoadPromise = pending;
    return pending;
  }

  /**
   * @param {string} reason
   * @param {{ retry?: boolean }} [requestOptions]
   * @returns {Promise<boolean>}
   */
  function requestLoad(reason, requestOptions = {}) {
    if (!treeLoadAllowed) {
      pendingTreeLoadReason = reason;
      return Promise.resolve(false);
    }
    pendingTreeLoadReason = "";
    return loadTreeRuntime({ reason, retry: requestOptions.retry === true });
  }

  /** @param {string} branch */
  const handleBranchChange = (branch) => {
    storage.setItem(BRANCH_KEY, branch);
    updateBranchInfo();
    if (treeRuntime) {
      renderTree();
    }
  };

  /** @param {unknown} nextBranch */
  const setActiveBranch = async (nextBranch) => {
    if (!navigation.setActiveBranch(nextBranch)) {
      return false;
    }
    handleBranchChange(navigation.activeBranch);
    void requestLoad("branch");
    const currentRoute = resolveRouteFromLocation(pathBase, windowRef.location.pathname);
    if (navigation.view.routeMap[currentRoute]) {
      await navigate(currentRoute, false);
      return true;
    }
    await navigate(pickHomeRoute(navigation.view), true);
    return true;
  };

  /** @param {Event} event */
  const handleBranchPillClick = (event) => {
    const target = event.target;
    if (!(target instanceof windowRef.Element)) {
      return;
    }
    const pill = target.closest(".branch-pill");
    if (!(pill instanceof windowRef.HTMLElement) || !sidebarBranchPills?.contains(pill)) {
      return;
    }
    void setActiveBranch(pill.dataset.branch);
  };

  const handleSearchFocus = () => {
    void requestLoad("tree-search");
  };
  const handleSearchInput = () => {
    applyTreeSearch(treeSearchInput?.value ?? "");
    void requestLoad("tree-search");
  };
  /** @param {Event} event */
  const handleSearchKeydown = (event) => {
    if (!(event instanceof windowRef.KeyboardEvent)) {
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      moveTreeSearchFocus(event.shiftKey ? -1 : 1);
    } else if (event.key === "Escape" && treeSearchInput?.value.trim()) {
      event.preventDefault();
      event.stopPropagation();
      applyTreeSearch("");
    }
  };

  const cancelDeferredLoad = () => {
    if (deferredFrame != null) {
      windowRef.cancelAnimationFrame(deferredFrame);
      deferredFrame = null;
    }
    if (paintFrame != null) {
      windowRef.cancelAnimationFrame(paintFrame);
      paintFrame = null;
    }
    if (idleHandle != null && typeof windowRef.cancelIdleCallback === "function") {
      windowRef.cancelIdleCallback(idleHandle);
      idleHandle = null;
    }
    if (idleFallbackTimer != null) {
      windowRef.clearTimeout(idleFallbackTimer);
      idleFallbackTimer = null;
    }
  };

  const scheduleDeferredLoad = () => {
    cancelDeferredLoad();
    deferredFrame = windowRef.requestAnimationFrame(() => {
      deferredFrame = null;
      paintFrame = windowRef.requestAnimationFrame(() => {
        paintFrame = null;
        if (!events) {
          return;
        }
        treeLoadAllowed = true;
        windowRef.performance?.mark?.("eiam-first-content-paint-opportunity");
        if (pendingTreeLoadReason) {
          void requestLoad(pendingTreeLoadReason);
          return;
        }
        if (isCompactLayout()) {
          return;
        }
        const loadForDesktop = () => {
          idleHandle = null;
          idleFallbackTimer = null;
          void requestLoad("desktop-idle");
        };
        if (typeof windowRef.requestIdleCallback === "function") {
          idleHandle = windowRef.requestIdleCallback(loadForDesktop, { timeout: 500 });
        } else {
          idleFallbackTimer = windowRef.setTimeout(loadForDesktop, 0);
        }
      });
    });
  };

  return {
    clearSelection,
    destroy() {
      if (!events) {
        return;
      }
      events.cleanup();
      events = null;
      lifecycleGeneration += 1;
      cancelDeferredLoad();
      destroyFileTree();
      treeRoot?.replaceChildren();
      treeRoot?.removeAttribute("aria-busy");
      treeLoadPromise = null;
      treeLoadAllowed = false;
      pendingTreeLoadReason = "";
    },
    handleBranchChange,
    requestLoad,
    scheduleDeferredLoad,
    setActiveBranch,
    setup() {
      if (events) {
        return;
      }
      events = createEventScope();
      events.listen(sidebarBranchPills, "click", handleBranchPillClick);
      events.listen(treeSearchInput, "focus", handleSearchFocus);
      events.listen(treeSearchInput, "input", handleSearchInput);
      events.listen(treeSearchInput, "keydown", handleSearchKeydown);
      events.listen(treeSearchClear, "click", () => {
        applyTreeSearch("");
        treeSearchInput?.focus?.();
      });
      events.listen(treeSearchPrev, "click", () => moveTreeSearchFocus(-1));
      events.listen(treeSearchNext, "click", () => moveTreeSearchFocus(1));
      renderBranchPills();
      updateBranchInfo();
      updateTreeSearchControls();
      if (treeRuntime) {
        renderTree();
      }
    },
    syncActiveSelection,
  };
}
