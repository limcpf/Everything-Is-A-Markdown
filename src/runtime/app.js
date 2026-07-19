import { createContentController } from "./content-controller.js";
import { createContentEnhancementController } from "./content-enhancement-controller.js";
import { createMermaidController, resolveMermaidConfig } from "./mermaid-controller.js";
import {
  createNavigationState,
  normalizeRoute,
  pickHomeRoute,
  resolveRouteFromLocation,
  toPathWithBase,
} from "./navigation-state.js";
import { loadRuntimeBootstrap } from "./runtime-bootstrap.js";
import { createSettingsController } from "./settings-controller.js";
import { createSidebarLayoutController } from "./sidebar-layout-controller.js";
import { createTreeController } from "./tree-controller.js";

const BRANCH_KEY = "fsblog.branch";
const APP_READY_STATE_ATTR = "data-app-ready";
const TREE_RUNTIME_STATE_ATTR = "data-tree-runtime";
const DEFAULT_SITE_TITLE = "File-System Blog";

function escapeHtmlAttr(input) {
  return String(input)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function composeDocumentTitle(pageTitle, siteTitle) {
  const left = String(pageTitle ?? "").trim();
  const right = String(siteTitle ?? "").trim();
  if (!left) {
    return right || DEFAULT_SITE_TITLE;
  }
  if (!right || left === right) {
    return left;
  }
  return `${left} - ${right}`;
}

function formatMetaDateTime(value) {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    return null;
  }
  const yyyy = parsed.getFullYear();
  const mm = String(parsed.getMonth() + 1).padStart(2, "0");
  const dd = String(parsed.getDate()).padStart(2, "0");
  const hh = String(parsed.getHours()).padStart(2, "0");
  const mi = String(parsed.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) {
    return [];
  }
  return tags
    .map((tag) => String(tag).trim().replace(/^#+/, ""))
    .filter(Boolean);
}

function renderBreadcrumb(route) {
  const parts = route.split("/").filter(Boolean);
  const allItems = ["~", ...parts];
  return allItems
    .map((part, index) => {
      const isCurrent = index === allItems.length - 1 && allItems.length > 1;
      const escapedPart = escapeHtmlAttr(part);
      if (isCurrent) {
        return `<span class="breadcrumb-current" aria-current="page">${escapedPart}</span>`;
      }
      return `<span class="breadcrumb-item">${escapedPart}</span>`;
    })
    .join('<span class="material-symbols-outlined breadcrumb-sep">chevron_right</span>');
}

function renderMeta(doc) {
  const items = [];
  if (typeof doc.prefix === "string" && doc.prefix.trim().length > 0) {
    items.push(`<span class="meta-item meta-prefix">${escapeHtmlAttr(doc.prefix)}</span>`);
  }
  const createdAt = formatMetaDateTime(doc.date);
  if (createdAt) {
    items.push(
      `<span class="meta-item"><span class="material-symbols-outlined">calendar_today</span>${escapeHtmlAttr(createdAt)}</span>`,
    );
  }
  const tags = normalizeTags(doc.tags);
  if (tags.length > 0) {
    const tagsStr = tags.map((tag) => `#${escapeHtmlAttr(tag)}`).join(" ");
    items.push(`<span class="meta-item meta-tags">${tagsStr}</span>`);
  }
  return items.join("");
}

function renderNav(currentView, currentId, pathBase) {
  const currentIndex = currentView.docIndexById.get(currentId) ?? -1;
  if (currentIndex === -1) {
    return "";
  }
  const previous = currentIndex > 0 ? currentView.docs[currentIndex - 1] : null;
  const next =
    currentIndex < currentView.docs.length - 1 ? currentView.docs[currentIndex + 1] : null;
  let html = "";
  if (previous) {
    html += `<a href="${toPathWithBase(previous.route, pathBase)}" class="nav-link nav-link-prev" data-route="${escapeHtmlAttr(previous.route)}">
      <div class="nav-link-label"><span class="material-symbols-outlined">arrow_back</span>Previous</div>
      <div class="nav-link-title">${escapeHtmlAttr(previous.title)}</div>
    </a>`;
  }
  if (next) {
    html += `<a href="${toPathWithBase(next.route, pathBase)}" class="nav-link nav-link-next" data-route="${escapeHtmlAttr(next.route)}">
      <div class="nav-link-label">Next<span class="material-symbols-outlined">arrow_forward</span></div>
      <div class="nav-link-title">${escapeHtmlAttr(next.title)}</div>
    </a>`;
  }
  return html;
}

function renderBacklinks(doc, pathBase) {
  const backlinks = Array.isArray(doc.backlinks) ? doc.backlinks : [];
  if (backlinks.length === 0) {
    return "";
  }
  let html = '<h2 class="backlinks-title">Backlinks</h2><ul class="backlinks-list">';
  for (const backlink of backlinks) {
    const prefix =
      typeof backlink.prefix === "string" && backlink.prefix.trim().length > 0
        ? `<span class="backlink-prefix">${escapeHtmlAttr(backlink.prefix.trim())}</span>`
        : "";
    const route = typeof backlink.route === "string" ? normalizeRoute(backlink.route) : "/";
    const title =
      typeof backlink.title === "string" && backlink.title.trim().length > 0
        ? backlink.title
        : route;
    html += `<li class="backlinks-item"><a href="${toPathWithBase(route, pathBase)}" class="backlink-link" data-route="${escapeHtmlAttr(route)}">${prefix}<span class="backlink-text">${escapeHtmlAttr(title)}</span></a></li>`;
  }
  return `${html}</ul>`;
}

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
      breadcrumb: renderBreadcrumb,
      meta: renderMeta,
      backlinks: renderBacklinks,
      nav: renderNav,
      documentTitle: composeDocumentTitle,
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
