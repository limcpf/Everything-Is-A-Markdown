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

function setRuntimeState(attribute, state) {
  document.documentElement?.setAttribute(attribute, state);
}

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

function createA11yAnnouncer(element) {
  let timer = null;
  return {
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
  let treeController = null;
  const layoutController = createSidebarLayoutController({
    closeSettings: () => settingsController.close(),
    requestTreeLoad: (reason) => treeController?.requestLoad(reason),
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
