const EXPANDED_KEY = "fsblog.expanded";
const COMPACT_LAYOUT_QUERY = "(max-width: 1024px)";
const MENU_TOGGLE_POSITION_KEY = "fsblog.menuTogglePosition";
const THEME_MODE_KEY = "fsblog.themeMode";
const DARK_MODE_QUERY = "(prefers-color-scheme: dark)";
const SIDEBAR_WIDTH_KEY = "fsblog.desktopSidebarWidth";
const TYPEAHEAD_RESET_MS = 700;
const DESKTOP_SIDEBAR_DEFAULT = 420;
const DESKTOP_SIDEBAR_MIN = 320;
const DESKTOP_VIEWER_MIN = 680;
const DESKTOP_SPLITTER_WIDTH = 10;
const DESKTOP_SPLITTER_STEP = 24;
const DEFAULT_BRANCH = "dev";
const BRANCH_KEY = "fsblog.branch";
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function escapeHtmlAttr(input) {
  return String(input)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function toSafeUrlPath(input) {
  const value = String(input);
  return value
    .split("/")
    .map((segment, index) => {
      if (index === 0 && segment === "") {
        return "";
      }
      return encodeURIComponent(segment);
    })
    .join("/");
}

function normalizeRoute(pathname) {
  let route = decodeURIComponent(pathname || "/");
  if (!route.startsWith("/")) {
    route = `/${route}`;
  }
  if (!route.endsWith("/")) {
    route = `${route}/`;
  }
  return route;
}

function resolveRouteFromLocation(routeMap) {
  const direct = normalizeRoute(location.pathname);
  if (routeMap[direct]) {
    return direct;
  }

  if (location.search.length > 1) {
    const recovered = normalizeRoute(`${location.pathname}?${location.search.slice(1)}`);
    if (routeMap[recovered]) {
      history.replaceState(null, "", toSafeUrlPath(recovered));
      return recovered;
    }
  }

  return direct;
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

function normalizeBranch(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function isDocVisibleInBranch(doc, branch, defaultBranch) {
  const docBranch = normalizeBranch(doc.branch);
  if (!docBranch) {
    return branch === defaultBranch;
  }
  return docBranch === branch;
}

function cloneFilteredTree(nodes, visibleDocIds) {
  const filteredNodes = [];

  for (const node of nodes) {
    if (node.type === "file") {
      if (visibleDocIds.has(node.id)) {
        filteredNodes.push(node);
      }
      continue;
    }

    const children = cloneFilteredTree(node.children, visibleDocIds);
    if (children.length === 0 && !node.virtual) {
      continue;
    }

    filteredNodes.push({
      ...node,
      children,
    });
  }

  return filteredNodes;
}

function buildBranchView(manifest, branch, defaultBranch) {
  const docs = manifest.docs.filter((doc) => isDocVisibleInBranch(doc, branch, defaultBranch));
  const visibleDocIds = new Set(docs.map((doc) => doc.id));
  const tree = cloneFilteredTree(manifest.tree, visibleDocIds);
  const routeMap = {};
  for (const doc of docs) {
    routeMap[doc.route] = doc.id;
  }

  return {
    docs,
    tree,
    routeMap,
  };
}

function loadExpandedSet() {
  try {
    const raw = localStorage.getItem(EXPANDED_KEY);
    if (!raw) {
      return new Set();
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return new Set();
    }
    return new Set(parsed.filter((x) => typeof x === "string"));
  } catch {
    return new Set();
  }
}

function persistExpandedSet(expanded) {
  localStorage.setItem(EXPANDED_KEY, JSON.stringify(Array.from(expanded)));
}

function loadMenuTogglePosition() {
  const raw = localStorage.getItem(MENU_TOGGLE_POSITION_KEY);
  return raw === "left" ? "left" : "right";
}

function persistMenuTogglePosition(position) {
  localStorage.setItem(MENU_TOGGLE_POSITION_KEY, position);
}

function normalizeThemeMode(mode) {
  if (mode === "light" || mode === "dark" || mode === "system") {
    return mode;
  }
  return "system";
}

function loadThemeMode() {
  return normalizeThemeMode(localStorage.getItem(THEME_MODE_KEY));
}

function persistThemeMode(mode) {
  localStorage.setItem(THEME_MODE_KEY, mode);
}

function resolveAppliedTheme(mode, prefersDark) {
  if (mode === "system") {
    return prefersDark ? "dark" : "light";
  }
  return mode;
}

function applyTheme(mode, prefersDark) {
  const appliedTheme = resolveAppliedTheme(mode, prefersDark);
  document.documentElement.dataset.theme = appliedTheme;
  document.documentElement.style.colorScheme = appliedTheme;
}

function loadDesktopSidebarWidth() {
  const raw = localStorage.getItem(SIDEBAR_WIDTH_KEY);
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed)) {
    return DESKTOP_SIDEBAR_DEFAULT;
  }
  return parsed;
}

function persistDesktopSidebarWidth(width) {
  localStorage.setItem(SIDEBAR_WIDTH_KEY, String(Math.round(width)));
}

function getDesktopSidebarBounds() {
  const max = Math.max(
    DESKTOP_SIDEBAR_MIN,
    window.innerWidth - DESKTOP_VIEWER_MIN - DESKTOP_SPLITTER_WIDTH,
  );

  return {
    min: DESKTOP_SIDEBAR_MIN,
    max,
  };
}

function clampDesktopSidebarWidth(width) {
  const { min, max } = getDesktopSidebarBounds();
  return Math.min(Math.max(width, min), max);
}

function applyMenuTogglePosition(position) {
  document.body.classList.toggle("mobile-toggle-left", position === "left");
}

function getFocusableElements(container) {
  if (!container) {
    return [];
  }

  return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter((el) => {
    if (!(el instanceof HTMLElement)) {
      return false;
    }
    return !el.hasAttribute("hidden") && el.getAttribute("aria-hidden") !== "true";
  });
}

function getTreeLabelText(row) {
  const label = row.querySelector(".tree-label");
  if (!(label instanceof HTMLElement)) {
    return "";
  }
  return label.textContent?.trim() || "";
}

function getVisibleTreeRows(treeRoot) {
  const rows = [];
  for (const row of treeRoot.querySelectorAll(".tree-row")) {
    if (!(row instanceof HTMLElement)) {
      continue;
    }
    if (row.closest("[hidden]")) {
      continue;
    }
    rows.push(row);
  }
  return rows;
}

function initializeTreeTypeahead(treeRoot) {
  if (!(treeRoot instanceof HTMLElement)) {
    return;
  }

  let query = "";
  let resetTimer = 0;

  const scheduleReset = () => {
    if (resetTimer) {
      clearTimeout(resetTimer);
    }
    resetTimer = window.setTimeout(() => {
      query = "";
    }, TYPEAHEAD_RESET_MS);
  };

  const findMatch = (rows, needle, startIndex) => {
    if (!needle) {
      return null;
    }

    for (let offset = 1; offset <= rows.length; offset += 1) {
      const idx = (startIndex + offset + rows.length) % rows.length;
      const row = rows[idx];
      const text = getTreeLabelText(row).toLocaleLowerCase("ko-KR");
      if (text.startsWith(needle)) {
        return row;
      }
    }

    return null;
  };

  treeRoot.addEventListener("keydown", (event) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }

    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      return;
    }

    if (event.key === "Backspace" && query.length > 0) {
      query = query.slice(0, -1);
      scheduleReset();
      event.preventDefault();
    } else if (event.key.length === 1 && /\S/.test(event.key)) {
      query += event.key.toLocaleLowerCase("ko-KR");
      scheduleReset();
    } else {
      return;
    }

    const rows = getVisibleTreeRows(treeRoot);
    if (rows.length === 0 || query.length === 0) {
      return;
    }

    const activeElement = document.activeElement;
    const startIndex = rows.findIndex((row) => row === activeElement);
    const matchedRow = findMatch(rows, query, startIndex);
    if (!(matchedRow instanceof HTMLElement)) {
      return;
    }

    matchedRow.focus();
    matchedRow.scrollIntoView({ block: "nearest" });
    event.preventDefault();
  });
}

function initializeTreeLabelTooltip(treeRoot, tooltipEl) {
  if (!(treeRoot instanceof HTMLElement) || !(tooltipEl instanceof HTMLElement)) {
    return { hide: () => {}, dispose: () => {} };
  }

  let activeRow = null;
  const cleanups = [];

  const hide = () => {
    tooltipEl.hidden = true;
    tooltipEl.textContent = "";
    if (activeRow instanceof HTMLElement) {
      activeRow.removeAttribute("aria-describedby");
    }
    activeRow = null;
  };

  const show = (row) => {
    const labelEl = row.querySelector(".tree-label");
    if (!(labelEl instanceof HTMLElement)) {
      hide();
      return;
    }

    if (labelEl.scrollWidth <= labelEl.clientWidth + 1) {
      hide();
      return;
    }

    const labelText = labelEl.textContent?.trim();
    if (!labelText) {
      hide();
      return;
    }

    tooltipEl.textContent = labelText;
    tooltipEl.hidden = false;

    const labelRect = labelEl.getBoundingClientRect();
    const tooltipRect = tooltipEl.getBoundingClientRect();
    const safePadding = 8;
    const gap = 8;

    let top = labelRect.top - tooltipRect.height - gap;
    if (top < safePadding) {
      top = labelRect.bottom + gap;
    }

    let left = labelRect.left;
    const rightOverflow = left + tooltipRect.width - (window.innerWidth - safePadding);
    if (rightOverflow > 0) {
      left -= rightOverflow;
    }
    if (left < safePadding) {
      left = safePadding;
    }

    tooltipEl.style.top = `${Math.round(top)}px`;
    tooltipEl.style.left = `${Math.round(left)}px`;

    if (activeRow instanceof HTMLElement && activeRow !== row) {
      activeRow.removeAttribute("aria-describedby");
    }
    activeRow = row;
    row.setAttribute("aria-describedby", tooltipEl.id);
  };

  for (const row of treeRoot.querySelectorAll(".tree-row")) {
    if (!(row instanceof HTMLElement)) {
      continue;
    }
    const onMouseEnter = () => show(row);
    const onMouseLeave = () => hide();
    const onFocus = () => show(row);
    const onBlur = () => hide();

    row.addEventListener("mouseenter", onMouseEnter);
    row.addEventListener("mouseleave", onMouseLeave);
    row.addEventListener("focus", onFocus);
    row.addEventListener("blur", onBlur);

    cleanups.push(() => row.removeEventListener("mouseenter", onMouseEnter));
    cleanups.push(() => row.removeEventListener("mouseleave", onMouseLeave));
    cleanups.push(() => row.removeEventListener("focus", onFocus));
    cleanups.push(() => row.removeEventListener("blur", onBlur));
  }

  treeRoot.addEventListener("scroll", hide);
  window.addEventListener("resize", hide);
  document.addEventListener("scroll", hide, true);

  cleanups.push(() => treeRoot.removeEventListener("scroll", hide));
  cleanups.push(() => window.removeEventListener("resize", hide));
  cleanups.push(() => document.removeEventListener("scroll", hide, true));

  return {
    hide,
    dispose() {
      hide();
      for (const cleanup of cleanups) {
        cleanup();
      }
    },
  };
}

function createFolderNode(node, state, depth = 0) {
  const wrapper = document.createElement("div");
  wrapper.className = node.virtual ? "tree-folder virtual" : "tree-folder";
  wrapper.style.setProperty("--tree-depth", String(depth));

  const row = document.createElement("button");
  row.type = "button";
  row.className = "tree-folder-row tree-row";

  const isExpanded = node.virtual ? true : state.expanded.has(node.path);
  const iconName = isExpanded ? "folder_open" : "folder";

  row.innerHTML = `<span class="material-symbols-outlined">${iconName}</span><span class="tree-label">${node.name}</span>`;

  const children = document.createElement("div");
  children.className = "tree-children";
  if (!isExpanded) {
    children.hidden = true;
  }

  if (!node.virtual) {
    row.addEventListener("click", () => {
      const currentlyExpanded = !children.hidden;
      children.hidden = currentlyExpanded;
      row.querySelector(".material-symbols-outlined").textContent = currentlyExpanded ? "folder" : "folder_open";
      if (currentlyExpanded) {
        state.expanded.delete(node.path);
      } else {
        state.expanded.add(node.path);
      }
      persistExpandedSet(state.expanded);
    });
  }

  for (const child of node.children) {
    if (child.type === "folder") {
      children.appendChild(createFolderNode(child, state, depth + 1));
    } else {
      children.appendChild(createFileNode(child, state, depth + 1));
    }
  }

  wrapper.appendChild(row);
  wrapper.appendChild(children);
  return wrapper;
}

function createFileNode(node, state, depth = 0) {
  const row = document.createElement("a");
  row.href = node.route;
  row.className = "tree-row tree-file-row";
  row.dataset.fileId = node.id;
  row.style.setProperty("--tree-depth", String(depth));

  const newBadge = node.isNew ? `<span class="badge-new">NEW</span>` : "";
  row.innerHTML = `<span class="material-symbols-outlined">article</span><span class="tree-label">${node.title || node.name}</span>${newBadge}`;

  row.addEventListener("click", (event) => {
    event.preventDefault();
    state.navigate(node.route, true);
  });

  return row;
}

function markActive(id) {
  for (const el of document.querySelectorAll("[data-file-id]")) {
    if (!(el instanceof HTMLElement)) {
      continue;
    }
    const badge = el.querySelector(".badge-active");
    if (badge) {
      badge.remove();
    }
    
    if (el.dataset.fileId === id) {
      el.classList.add("is-active");
      el.setAttribute("aria-current", "page");
      const activeBadge = document.createElement("span");
      activeBadge.className = "badge-active";
      activeBadge.textContent = "active";
      el.appendChild(activeBadge);
    } else {
      el.classList.remove("is-active");
      el.removeAttribute("aria-current");
    }
  }
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

  const createdAt = formatMetaDateTime(doc.date);
  if (createdAt) {
    items.push(
      `<span class="meta-item"><span class="material-symbols-outlined">calendar_today</span>${escapeHtmlAttr(createdAt)}</span>`,
    );
  }

  const updatedAt = formatMetaDateTime(doc.updatedDate);
  if (updatedAt) {
    items.push(
      `<span class="meta-item"><span class="material-symbols-outlined">schedule</span>updated ${escapeHtmlAttr(updatedAt)}</span>`,
    );
  }

  const tags = normalizeTags(doc.tags);
  if (tags.length > 0) {
    const tagsStr = tags.map((tag) => `#${escapeHtmlAttr(tag)}`).join(" ");
    items.push(`<span class="meta-item meta-tags">${tagsStr}</span>`);
  }

  return items.join("");
}

function renderNav(docs, currentId) {
  const currentIndex = docs.findIndex(d => d.id === currentId);
  if (currentIndex === -1) return "";

  const prev = currentIndex > 0 ? docs[currentIndex - 1] : null;
  const next = currentIndex < docs.length - 1 ? docs[currentIndex + 1] : null;

  let html = "";

  if (prev) {
    html += `<a href="${toSafeUrlPath(prev.route)}" class="nav-link nav-link-prev" data-route="${escapeHtmlAttr(prev.route)}">
      <div class="nav-link-label"><span class="material-symbols-outlined">arrow_back</span>Previous</div>
      <div class="nav-link-title">${prev.title}</div>
    </a>`;
  }

  if (next) {
    html += `<a href="${toSafeUrlPath(next.route)}" class="nav-link nav-link-next" data-route="${escapeHtmlAttr(next.route)}">
      <div class="nav-link-label">Next<span class="material-symbols-outlined">arrow_forward</span></div>
      <div class="nav-link-title">${next.title}</div>
    </a>`;
  }

  return html;
}

async function start() {
  const treeRoot = document.getElementById("tree-root");
  const appRoot = document.querySelector(".app-root");
  const splitter = document.getElementById("app-splitter");
  const sidebar = document.getElementById("sidebar-panel");
  const sidebarToggle = document.getElementById("sidebar-toggle");
  const sidebarClose = document.getElementById("sidebar-close");
  const sidebarOverlay = document.getElementById("sidebar-overlay");
  const treeLabelTooltip = document.getElementById("tree-label-tooltip");
  const sidebarBranchPills = document.getElementById("sidebar-branch-pills");
  const sidebarBranchInfo = document.getElementById("sidebar-branch-info");
  const settingsToggle = document.getElementById("settings-toggle");
  const settingsClose = document.getElementById("settings-close");
  const settingsPanel = document.getElementById("sidebar-settings");
  const menuTogglePositionInputs = document.querySelectorAll('input[name="menu-toggle-position"]');
  const themeModeInputs = document.querySelectorAll('input[name="theme-mode"]');
  const breadcrumbEl = document.getElementById("viewer-breadcrumb");
  const titleEl = document.getElementById("viewer-title");
  const metaEl = document.getElementById("viewer-meta");
  const contentEl = document.getElementById("viewer-content");
  const navEl = document.getElementById("viewer-nav");
  const a11yStatusEl = document.getElementById("a11y-status");

  let hideTreeTooltip = () => {};
  let disposeTreeTooltip = () => {};
  let desktopSidebarWidth = clampDesktopSidebarWidth(loadDesktopSidebarWidth());
  let activeResizePointerId = null;
  let resizeStartX = 0;
  let resizeStartWidth = desktopSidebarWidth;

  const announceA11yStatus = (message) => {
    if (!(a11yStatusEl instanceof HTMLElement)) {
      return;
    }
    a11yStatusEl.textContent = "";
    window.setTimeout(() => {
      a11yStatusEl.textContent = message;
    }, 20);
  };

  const compactMediaQuery = window.matchMedia(COMPACT_LAYOUT_QUERY);
  const darkModeMediaQuery = window.matchMedia(DARK_MODE_QUERY);
  const savedTogglePosition = loadMenuTogglePosition();
  let themeMode = loadThemeMode();
  applyMenuTogglePosition(savedTogglePosition);
  applyTheme(themeMode, darkModeMediaQuery.matches);

  for (const input of menuTogglePositionInputs) {
    if (!(input instanceof HTMLInputElement)) {
      continue;
    }
    input.checked = input.value === savedTogglePosition;
  }

  for (const input of themeModeInputs) {
    if (!(input instanceof HTMLInputElement)) {
      continue;
    }
    input.checked = input.value === themeMode;
  }

  const isCompactLayout = () => compactMediaQuery.matches;

  const updateSplitterA11y = () => {
    if (!(splitter instanceof HTMLElement)) {
      return;
    }

    const bounds = getDesktopSidebarBounds();
    splitter.setAttribute("aria-valuemin", String(Math.round(bounds.min)));
    splitter.setAttribute("aria-valuemax", String(Math.round(bounds.max)));
    splitter.setAttribute("aria-valuenow", String(Math.round(desktopSidebarWidth)));
    splitter.setAttribute("aria-valuetext", `${Math.round(desktopSidebarWidth)}px`);
    splitter.setAttribute("aria-disabled", String(isCompactLayout()));
  };

  const syncDesktopSidebarWidth = (persist) => {
    desktopSidebarWidth = clampDesktopSidebarWidth(desktopSidebarWidth);

    if (appRoot instanceof HTMLElement) {
      if (isCompactLayout()) {
        appRoot.style.removeProperty("--sidebar-width");
      } else {
        appRoot.style.setProperty("--sidebar-width", `${Math.round(desktopSidebarWidth)}px`);
      }
    }

    updateSplitterA11y();

    if (persist) {
      persistDesktopSidebarWidth(desktopSidebarWidth);
    }
  };

  const setSettingsExpanded = (expanded) => {
    if (settingsToggle) {
      settingsToggle.setAttribute("aria-expanded", String(expanded));
    }
  };

  const closeSettings = () => {
    if (!settingsPanel || settingsPanel.hidden) {
      return;
    }
    settingsPanel.hidden = true;
    setSettingsExpanded(false);
  };

  const openSettings = () => {
    if (!settingsPanel) {
      return;
    }
    settingsPanel.hidden = false;
    setSettingsExpanded(true);
    const checkedInput = settingsPanel.querySelector('input[name="theme-mode"]:checked, input[name="menu-toggle-position"]:checked');
    if (checkedInput instanceof HTMLElement) {
      checkedInput.focus();
    }
  };

  const toggleSettings = () => {
    if (!settingsPanel) {
      return;
    }
    if (settingsPanel.hidden) {
      openSettings();
      return;
    }
    closeSettings();
  };

  const syncSidebarA11y = (isOpen) => {
    if (sidebarToggle) {
      sidebarToggle.setAttribute("aria-expanded", String(isOpen));
    }

    if (!sidebar) {
      return;
    }

    if (!isCompactLayout()) {
      sidebar.removeAttribute("aria-hidden");
      return;
    }

    sidebar.setAttribute("aria-hidden", String(!isOpen));
  };

  const openSidebar = () => {
    if (!appRoot || !isCompactLayout()) {
      return;
    }
    appRoot.classList.add("sidebar-open");
    if (sidebarOverlay) {
      sidebarOverlay.hidden = false;
    }
    document.body.classList.add("menu-open");
    syncSidebarA11y(true);
    const focusables = getFocusableElements(sidebar);
    if (focusables.length > 0) {
      focusables[0].focus();
    }
  };

  const closeSidebar = () => {
    if (!appRoot) {
      return;
    }
    appRoot.classList.remove("sidebar-open");
    if (sidebarOverlay) {
      sidebarOverlay.hidden = true;
    }
    hideTreeTooltip();
    closeSettings();
    document.body.classList.remove("menu-open");
    syncSidebarA11y(false);
    if (sidebarToggle instanceof HTMLElement && isCompactLayout()) {
      sidebarToggle.focus();
    }
  };

  const handleLayoutChange = () => {
    if (!isCompactLayout()) {
      closeSidebar();
      if (sidebarOverlay) {
        sidebarOverlay.hidden = true;
      }
      syncSidebarA11y(false);
      syncDesktopSidebarWidth(false);
      return;
    }
    closeSidebar();
    syncDesktopSidebarWidth(false);
  };

  sidebarToggle?.addEventListener("click", openSidebar);
  sidebarClose?.addEventListener("click", closeSidebar);
  sidebarOverlay?.addEventListener("click", closeSidebar);
  settingsToggle?.addEventListener("click", toggleSettings);
  settingsClose?.addEventListener("click", closeSettings);

  const beginSplitterResize = (event) => {
    if (!(splitter instanceof HTMLElement) || !(appRoot instanceof HTMLElement) || isCompactLayout()) {
      return;
    }

    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    event.preventDefault();
    activeResizePointerId = event.pointerId;
    resizeStartX = event.clientX;
    resizeStartWidth = desktopSidebarWidth;
    appRoot.classList.add("is-resizing");
    splitter.setPointerCapture(event.pointerId);
  };

  const updateSplitterResize = (event) => {
    if (event.pointerId !== activeResizePointerId) {
      return;
    }

    const deltaX = event.clientX - resizeStartX;
    desktopSidebarWidth = resizeStartWidth + deltaX;
    syncDesktopSidebarWidth(false);
  };

  const endSplitterResize = (event) => {
    if (event.pointerId !== activeResizePointerId) {
      return;
    }

    if (splitter instanceof HTMLElement && splitter.hasPointerCapture(event.pointerId)) {
      splitter.releasePointerCapture(event.pointerId);
    }

    if (appRoot instanceof HTMLElement) {
      appRoot.classList.remove("is-resizing");
    }

    activeResizePointerId = null;
    persistDesktopSidebarWidth(desktopSidebarWidth);
  };

  splitter?.addEventListener("pointerdown", beginSplitterResize);
  splitter?.addEventListener("pointermove", updateSplitterResize);
  splitter?.addEventListener("pointerup", endSplitterResize);
  splitter?.addEventListener("pointercancel", endSplitterResize);
  splitter?.addEventListener("keydown", (event) => {
    if (isCompactLayout()) {
      return;
    }

    let nextWidth = desktopSidebarWidth;
    if (event.key === "ArrowLeft") {
      nextWidth -= DESKTOP_SPLITTER_STEP;
    } else if (event.key === "ArrowRight") {
      nextWidth += DESKTOP_SPLITTER_STEP;
    } else if (event.key === "Home") {
      nextWidth = getDesktopSidebarBounds().min;
    } else if (event.key === "End") {
      nextWidth = getDesktopSidebarBounds().max;
    } else {
      return;
    }

    event.preventDefault();
    desktopSidebarWidth = nextWidth;
    syncDesktopSidebarWidth(true);
  });

  window.addEventListener("resize", () => {
    syncDesktopSidebarWidth(false);
  });

  for (const input of menuTogglePositionInputs) {
    if (!(input instanceof HTMLInputElement)) {
      continue;
    }
    input.addEventListener("change", () => {
      if (!input.checked) {
        return;
      }
      const nextPosition = input.value === "left" ? "left" : "right";
      applyMenuTogglePosition(nextPosition);
      persistMenuTogglePosition(nextPosition);
    });
  }

  for (const input of themeModeInputs) {
    if (!(input instanceof HTMLInputElement)) {
      continue;
    }
    input.addEventListener("change", () => {
      if (!input.checked) {
        return;
      }
      themeMode = normalizeThemeMode(input.value);
      applyTheme(themeMode, darkModeMediaQuery.matches);
      persistThemeMode(themeMode);
    });
  }

  darkModeMediaQuery.addEventListener("change", (event) => {
    if (themeMode !== "system") {
      return;
    }
    applyTheme(themeMode, event.matches);
  });

  document.addEventListener("click", (event) => {
    if (!settingsPanel || settingsPanel.hidden) {
      return;
    }
    const target = event.target;
    if (!(target instanceof Node)) {
      return;
    }
    const clickInPanel = settingsPanel.contains(target);
    const clickOnToggle = settingsToggle instanceof HTMLElement ? settingsToggle.contains(target) : false;
    if (!clickInPanel && !clickOnToggle) {
      closeSettings();
    }
  });

  compactMediaQuery.addEventListener("change", handleLayoutChange);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && appRoot?.classList.contains("sidebar-open")) {
      closeSidebar();
      return;
    }

    if (event.key !== "Tab" || !isCompactLayout() || !appRoot?.classList.contains("sidebar-open")) {
      return;
    }

    const focusables = getFocusableElements(sidebar);
    if (focusables.length === 0) {
      event.preventDefault();
      return;
    }

    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const activeElement = document.activeElement;
    const activeInsideSidebar = activeElement instanceof Node && sidebar?.contains(activeElement);

    if (!activeInsideSidebar) {
      event.preventDefault();
      first.focus();
      return;
    }

    if (event.shiftKey && activeElement === first) {
      event.preventDefault();
      last.focus();
      return;
    }

    if (!event.shiftKey && activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  const manifestRes = await fetch("/manifest.json");
  if (!manifestRes.ok) {
    throw new Error(`Failed to load manifest: ${manifestRes.status}`);
  }

  const manifest = await manifestRes.json();
  const defaultBranch = normalizeBranch(manifest.defaultBranch) || DEFAULT_BRANCH;
  const availableBranchSet = new Set([defaultBranch]);
  for (const doc of manifest.docs) {
    const docBranch = normalizeBranch(doc.branch);
    if (docBranch) {
      availableBranchSet.add(docBranch);
    }
  }
  if (Array.isArray(manifest.branches)) {
    for (const branch of manifest.branches) {
      const normalized = normalizeBranch(branch);
      if (normalized) {
        availableBranchSet.add(normalized);
      }
    }
  }

  const availableBranches = Array.from(availableBranchSet).sort((left, right) => {
    if (left === defaultBranch) {
      return -1;
    }
    if (right === defaultBranch) {
      return 1;
    }
    return left.localeCompare(right, "ko-KR");
  });

  const renderBranchPills = () => {
    if (!(sidebarBranchPills instanceof HTMLElement)) {
      return;
    }

    sidebarBranchPills.innerHTML = "";
    for (const branch of availableBranches) {
      const pill = document.createElement("button");
      pill.type = "button";
      pill.className = "branch-pill";
      pill.dataset.branch = branch;
      pill.textContent = branch;
      pill.setAttribute("aria-pressed", "false");
      pill.addEventListener("click", () => {
        void setActiveBranch(branch);
      });
      sidebarBranchPills.appendChild(pill);
    }
  };

  const savedBranch = normalizeBranch(localStorage.getItem(BRANCH_KEY));
  let activeBranch = savedBranch && availableBranchSet.has(savedBranch) ? savedBranch : defaultBranch;
  let view = buildBranchView(manifest, activeBranch, defaultBranch);

  const docsById = new Map(manifest.docs.map((doc) => [doc.id, doc]));
  const expanded = loadExpandedSet();

  const updateBranchInfo = () => {
    if (sidebarBranchInfo instanceof HTMLElement) {
      sidebarBranchInfo.textContent =
        activeBranch === defaultBranch
          ? `publish: true · ${activeBranch} + unclassified`
          : `publish: true · ${activeBranch} only`;
    }
    if (sidebarBranchPills instanceof HTMLElement) {
      for (const pill of sidebarBranchPills.querySelectorAll(".branch-pill")) {
        if (!(pill instanceof HTMLButtonElement)) {
          continue;
        }
        const isActive = pill.dataset.branch === activeBranch;
        pill.classList.toggle("is-active", isActive);
        pill.setAttribute("aria-pressed", String(isActive));
      }
    }
  };

  const renderTree = (state) => {
    if (!(treeRoot instanceof HTMLElement)) {
      return;
    }

    hideTreeTooltip();
    disposeTreeTooltip();
    treeRoot.innerHTML = "";

    for (const node of view.tree) {
      if (node.type === "folder") {
        treeRoot.appendChild(createFolderNode(node, state));
      } else {
        treeRoot.appendChild(createFileNode(node, state));
      }
    }

    const tooltipController = initializeTreeLabelTooltip(treeRoot, treeLabelTooltip);
    hideTreeTooltip = tooltipController.hide;
    disposeTreeTooltip = tooltipController.dispose;
    markActive(state.currentDocId || "");
  };

  const state = {
    expanded,
    currentDocId: "",
    async navigate(rawRoute, push) {
      hideTreeTooltip();

      if (isCompactLayout()) {
        closeSidebar();
      }

      const route = normalizeRoute(rawRoute);
      let id = view.routeMap[route];

      if (!id) {
        const globalId = manifest.routeMap?.[route];
        const globalDoc = globalId ? docsById.get(globalId) : null;
        const globalDocBranch = normalizeBranch(globalDoc?.branch);
        if (globalDoc && globalDocBranch && globalDocBranch !== activeBranch && availableBranchSet.has(globalDocBranch)) {
          activeBranch = globalDocBranch;
          view = buildBranchView(manifest, activeBranch, defaultBranch);
          updateBranchInfo();
          renderTree(state);
          localStorage.setItem(BRANCH_KEY, activeBranch);
          id = view.routeMap[route];
        }
      }
      
      if (!id) {
        state.currentDocId = "";
        breadcrumbEl.innerHTML = renderBreadcrumb(route);
        titleEl.textContent = "문서를 찾을 수 없습니다";
        metaEl.innerHTML = "";
        contentEl.innerHTML = '<p class="placeholder">요청한 경로에 해당하는 문서가 없습니다.</p>';
        navEl.innerHTML = "";
        markActive("");
        announceA11yStatus("탐색 실패: 요청한 문서를 찾을 수 없습니다.");
        if (push) {
          history.pushState(null, "", toSafeUrlPath(route));
        }
        return;
      }

      const doc = docsById.get(id);
      if (!doc) {
        return;
      }

      if (push) {
        history.pushState(null, "", toSafeUrlPath(route));
      }

      state.currentDocId = id;
      markActive(id);
      breadcrumbEl.innerHTML = renderBreadcrumb(route);
      titleEl.textContent = doc.title;
      metaEl.innerHTML = renderMeta(doc);

      const res = await fetch(toSafeUrlPath(doc.contentUrl));
      if (!res.ok) {
        contentEl.innerHTML = '<p class="placeholder">본문을 불러오지 못했습니다.</p>';
        navEl.innerHTML = "";
        announceA11yStatus(`탐색 실패: ${doc.title} 문서를 불러오지 못했습니다.`);
        return;
      }

      contentEl.innerHTML = await res.text();
      
      for (const btn of contentEl.querySelectorAll(".code-copy")) {
        btn.addEventListener("click", async () => {
          const code = btn.dataset.code;
          if (!code) return;
          try {
            await navigator.clipboard.writeText(code);
            btn.classList.add("copied");
            btn.querySelector(".material-symbols-outlined").textContent = "check";
            setTimeout(() => {
              btn.classList.remove("copied");
              btn.querySelector(".material-symbols-outlined").textContent = "content_copy";
            }, 2000);
          } catch (err) {
            console.error("Copy failed:", err);
          }
        });
      }

      navEl.innerHTML = renderNav(view.docs, id);
      
      for (const link of navEl.querySelectorAll(".nav-link")) {
        link.addEventListener("click", (e) => {
          e.preventDefault();
          state.navigate(link.dataset.route, true);
          document.querySelector(".viewer").scrollTo(0, 0);
        });
      }

      document.title = `${doc.title} - File-System Blog`;
      document.querySelector(".viewer").scrollTo(0, 0);
      announceA11yStatus(`탐색 완료: ${doc.title} 문서를 열었습니다.`);
    },
  };

  initializeTreeTypeahead(treeRoot);

  const setActiveBranch = async (nextBranch) => {
    const normalized = normalizeBranch(nextBranch);
    if (!normalized || !availableBranchSet.has(normalized)) {
      return;
    }

    activeBranch = normalized;
    view = buildBranchView(manifest, activeBranch, defaultBranch);
    localStorage.setItem(BRANCH_KEY, activeBranch);
    updateBranchInfo();
    renderTree(state);

    const currentRoute = resolveRouteFromLocation(view.routeMap);
    if (view.routeMap[currentRoute]) {
      await state.navigate(currentRoute, false);
      return;
    }

    const fallbackRoute = view.docs[0]?.route || "/";
    await state.navigate(fallbackRoute, true);
  };

  renderBranchPills();
  updateBranchInfo();
  renderTree(state);

  const currentRoute = resolveRouteFromLocation(view.routeMap);
  const initialRoute = currentRoute === "/" ? view.docs[0]?.route || "/" : currentRoute;
  handleLayoutChange();
  await state.navigate(initialRoute, currentRoute === "/" && initialRoute !== "/");

  window.addEventListener("popstate", async () => {
    await state.navigate(resolveRouteFromLocation(view.routeMap), false);
  });
}

start().catch((error) => {
  const contentEl = document.getElementById("viewer-content");
  if (contentEl) {
    contentEl.innerHTML = `<p class="placeholder">초기화 실패: ${error.message}</p>`;
  }
  console.error(error);
});
