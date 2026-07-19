import { createContentController } from "./content-controller.js";
import { createContentEnhancementController } from "./content-enhancement-controller.js";
import { createMermaidController, resolveMermaidConfig } from "./mermaid-controller.js";
import {
  createNavigationState,
  pickHomeRoute,
  resolveRouteFromLocation,
} from "./navigation-state.js";
import { loadRuntimeBootstrap } from "./runtime-bootstrap.js";
import { createSettingsController } from "./settings-controller.js";
import { createSidebarLayoutController } from "./sidebar-layout-controller.js";
import { createTreeController } from "./tree-controller.js";
import {
  composeViewDocumentTitle,
  renderViewBreadcrumb,
  renderViewChrome,
} from "../view-contract.ts";

const BRANCH_KEY = "fsblog.branch";
const APP_READY_STATE_ATTR = "data-app-ready";
const TREE_RUNTIME_STATE_ATTR = "data-tree-runtime";

/**
 * @typedef {import("./contracts").A11yAnnouncer} A11yAnnouncer
 * @typedef {import("./contracts").ContentController} ContentController
 * @typedef {import("./contracts").RuntimeController} RuntimeController
 * @typedef {import("./contracts").TreeController} TreeController
 * @typedef {import("./contracts").ViewerElements} ViewerElements
 */

/**
 * @param {string} attribute
 * @param {string} state
 */
function setRuntimeState(attribute, state) {
  document.documentElement?.setAttribute(attribute, state);
}

/** @returns {ViewerElements} */
function collectViewerElements() {
  return {
    breadcrumb: document.getElementById("viewer-breadcrumb"),
    title: document.getElementById("viewer-title"),
    meta: document.getElementById("viewer-meta"),
    content: document.getElementById("viewer-content"),
    backlinks: document.getElementById("viewer-backlinks"),
    nav: document.getElementById("viewer-nav"),
    viewer: document.querySelector(".viewer"),
  };
}

/**
 * @param {HTMLElement | null} element
 * @returns {A11yAnnouncer}
 */
function createA11yAnnouncer(element) {
  /** @type {number | null} */
  let timer = null;
  return {
    /** @param {string} message */
    announce(message) {
      if (!element) {
        return;
      }
      element.textContent = "";
      if (timer != null) {
        window.clearTimeout(timer);
      }
      timer = window.setTimeout(() => {
        timer = null;
        element.textContent = message;
      }, 20);
    },
    destroy() {
      if (timer != null) {
        window.clearTimeout(timer);
        timer = null;
      }
    },
  };
}

/**
 * @param {RuntimeController[]} controllers
 * @param {ContentController} contentController
 */
function installPageLifecycle(controllers, contentController) {
  window.addEventListener("pagehide", (event) => {
    if (event.persisted) {
      contentController.destroy();
      return;
    }
    destroyControllers(controllers);
  });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) {
      contentController.setup();
    }
  });
}

/** @param {RuntimeController[]} controllers */
function destroyControllers(controllers) {
  for (const controller of [...controllers].reverse()) {
    controller.destroy?.();
  }
}

async function start() {
  setRuntimeState(APP_READY_STATE_ATTR, "booting");
  setRuntimeState(TREE_RUNTIME_STATE_ATTR, "idle");

  const bootstrap = await loadRuntimeBootstrap();
  const elements = collectViewerElements();
  const announcer = createA11yAnnouncer(document.getElementById("a11y-status"));
  const navigation = createNavigationState(bootstrap.manifest, {
    savedBranch: localStorage.getItem(BRANCH_KEY),
    initialDocId: bootstrap.initialViewData?.docId,
  });
  const settingsController = createSettingsController();
  /** @type {TreeController | null} */
  let treeController = null;
  const layoutController = createSidebarLayoutController({
    closeSettings: () => settingsController.close(),
    requestTreeLoad: (reason) => treeController?.requestLoad(reason) ?? Promise.resolve(false),
  });
  const mermaidController = createMermaidController(resolveMermaidConfig(bootstrap.manifest));
  const enhancementController = createContentEnhancementController({
    root: elements.content,
    mermaidController,
  });

  const contentController = createContentController({
    navigation,
    elements,
    initialViewData: bootstrap.initialViewData,
    pathBase: bootstrap.pathBase,
    siteTitle: bootstrap.siteTitle,
    renderers: {
      breadcrumb: renderViewBreadcrumb,
      chrome: renderViewChrome,
      documentTitle: composeViewDocumentTitle,
    },
    lifecycle: {
      beforeNavigate() {
        if (layoutController.isCompact()) {
          layoutController.close();
        }
      },
      onBranchChange(branch) {
        treeController?.handleBranchChange(branch);
      },
      onCurrentDocChange(docId) {
        treeController?.syncActiveSelection(docId);
      },
      onMissingSelection() {
        treeController?.clearSelection();
      },
      enhanceContent: (target) => enhancementController.enhance(target),
      announce: (message) => announcer.announce(message),
      resolveLocationRoute: (pathname) => resolveRouteFromLocation(bootstrap.pathBase, pathname),
    },
  });

  treeController = createTreeController({
    navigation,
    pathBase: bootstrap.pathBase,
    treeModuleUrl: bootstrap.treeModuleUrl,
    navigate: (route, push) => contentController.navigate(route, push),
    announce: (message) => announcer.announce(message),
    isCompactLayout: () => layoutController.isCompact(),
  });

  /** @type {RuntimeController[]} */
  const controllers = [
    settingsController,
    layoutController,
    treeController,
    enhancementController,
    contentController,
    announcer,
  ];
  settingsController.setup();
  enhancementController.setup();
  treeController.setup();
  layoutController.setup();
  contentController.setup();

  try {
    const currentRoute = resolveRouteFromLocation(bootstrap.pathBase);
    const initialRoute = currentRoute === "/" ? pickHomeRoute(navigation.view) : currentRoute;
    await contentController.navigate(initialRoute, currentRoute === "/" && initialRoute !== "/");
    setRuntimeState(APP_READY_STATE_ATTR, "ready");
    window.performance?.mark?.("eiam-app-ready");
    treeController.scheduleDeferredLoad();
    installPageLifecycle(controllers, contentController);
  } catch (error) {
    destroyControllers(controllers);
    throw error;
  }
}

start().catch((error) => {
  setRuntimeState(APP_READY_STATE_ATTR, "error");
  const content = document.getElementById("viewer-content");
  if (content) {
    const message = error instanceof Error ? error.message : String(error);
    content.replaceChildren();
    const placeholder = document.createElement("p");
    placeholder.className = "placeholder";
    placeholder.textContent = `초기화 실패: ${message}`;
    content.appendChild(placeholder);
  }
  console.error(error);
});
