import { getRuntimeManifestDocs, normalizeManifestPayload } from "./manifest-adapter.js";
import { buildTreesAdapterInput } from "./tree-adapter.js";

const COMPACT_LAYOUT_QUERY = "(max-width: 1024px)";
const MENU_TOGGLE_POSITION_KEY = "fsblog.menuTogglePosition";
const THEME_MODE_KEY = "fsblog.themeMode";
const DARK_MODE_QUERY = "(prefers-color-scheme: dark)";
const SIDEBAR_WIDTH_KEY = "fsblog.desktopSidebarWidth";
const DESKTOP_SIDEBAR_DEFAULT = 420;
const DESKTOP_SIDEBAR_MIN = 320;
const DESKTOP_VIEWER_MIN = 680;
const DESKTOP_SPLITTER_WIDTH = 10;
const DESKTOP_SPLITTER_STEP = 24;
const DEFAULT_BRANCH = "dev";
const DEFAULT_SITE_TITLE = "File-System Blog";
const BRANCH_KEY = "fsblog.branch";
const APP_READY_STATE_ATTR = "data-app-ready";
const TREE_RUNTIME_STATE_ATTR = "data-tree-runtime";
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
const MERMAID_CDN = "https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js";
const MERMAID_DEFAULT_THEME = "default";
const MERMAID_SELECTOR = "pre.mermaid";
const MERMAID_ERROR_CLASS = "mermaid-render-error";
const MERMAID_THEME_VALIDATION_RE = /^[a-zA-Z][a-zA-Z0-9._-]*$/;
const MERMAID_URL_VALIDATION_RE = /^(https?:\/\/|\/|\.{1,2}\/)[^\s"'<>]+$/;
const MERMAID_WIDE_RATIO = 2.4;
const MERMAID_TALL_RATIO = 0.85;
const MERMAID_BLOCK_WIDE_CLASS = "is-wide";
const MERMAID_BLOCK_TALL_CLASS = "is-tall";
const CONTENT_IMAGE_LANDSCAPE_CLASS = "is-landscape";
const CONTENT_IMAGE_PORTRAIT_CLASS = "is-portrait";
const CONTENT_IMAGE_SQUARE_CLASS = "is-square";
const CONTENT_IMAGE_LANDSCAPE_THRESHOLD = 1.1;
const CONTENT_IMAGE_PORTRAIT_THRESHOLD = 0.9;
const contentImageDimensionCache = new Map();
const mermaidRuntime = {
  initialized: false,
  loadingPromise: null,
  scriptElement: null,
  lastCdnUrl: "",
  lastTheme: "",
};

function escapeHtmlAttr(input) {
  return String(input)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function resolveMermaidConfig(manifest) {
  const mermaid = manifest?.mermaid;
  return {
    enabled: mermaid?.enabled !== false,
    cdnUrl:
      typeof mermaid?.cdnUrl === "string" && mermaid.cdnUrl.trim()
        ? mermaid.cdnUrl.trim()
        : MERMAID_CDN,
    theme:
      typeof mermaid?.theme === "string" &&
      MERMAID_THEME_VALIDATION_RE.test(mermaid.theme.trim())
        ? mermaid.theme.trim()
        : MERMAID_DEFAULT_THEME,
  };
}

function toAbsoluteUrl(value) {
  try {
    return new URL(value, window.location.href).href;
  } catch {
    return value;
  }
}

function normalizeMermaidTheme(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized || !MERMAID_THEME_VALIDATION_RE.test(normalized)) {
    return MERMAID_DEFAULT_THEME;
  }
  return normalized;
}

function normalizeMermaidUrl(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized || !MERMAID_URL_VALIDATION_RE.test(normalized)) {
    return MERMAID_CDN;
  }
  return normalized;
}

function createMermaidLoadError(message) {
  const paragraph = document.createElement("p");
  paragraph.className = MERMAID_ERROR_CLASS;
  paragraph.textContent = message;
  return paragraph;
}

function removeMermaidErrorMessage(container) {
  if (!(container instanceof HTMLElement)) {
    return;
  }

  for (const message of container.querySelectorAll(`.${MERMAID_ERROR_CLASS}`)) {
    message.remove();
  }
}

function showMermaidError(preview, message) {
  if (!(preview instanceof HTMLElement) || !(preview.parentElement instanceof HTMLElement)) {
    return;
  }

  removeMermaidErrorMessage(preview.parentElement);
  preview.parentElement.appendChild(createMermaidLoadError(message));
}

function normalizeRenderedMermaidSvg(block) {
  if (!(block instanceof HTMLElement)) {
    return;
  }

  const container = block.parentElement instanceof HTMLElement ? block.parentElement : null;
  const svg = block.querySelector("svg");
  if (!(svg instanceof SVGElement)) {
    return;
  }

  if (container) {
    container.classList.remove(MERMAID_BLOCK_WIDE_CLASS, MERMAID_BLOCK_TALL_CLASS);
  }

  svg.style.display = "block";
  svg.style.width = "auto";
  svg.style.height = "auto";
  svg.style.margin = "0 auto";
  svg.style.maxWidth = "min(100%, var(--content-visual-max-width, 880px))";
  svg.style.removeProperty("max-height");

  const viewBox = svg.viewBox?.baseVal;
  const intrinsicWidth =
    viewBox && Number.isFinite(viewBox.width) && viewBox.width > 0
      ? viewBox.width
      : Number.parseFloat(svg.getAttribute("width") ?? "");
  const intrinsicHeight =
    viewBox && Number.isFinite(viewBox.height) && viewBox.height > 0
      ? viewBox.height
      : Number.parseFloat(svg.getAttribute("height") ?? "");

  if (!(intrinsicWidth > 0) || !(intrinsicHeight > 0)) {
    return;
  }

  const aspectRatio = intrinsicWidth / intrinsicHeight;
  if (container && aspectRatio >= MERMAID_WIDE_RATIO) {
    container.classList.add(MERMAID_BLOCK_WIDE_CLASS);
    svg.style.maxWidth = "min(100%, var(--mermaid-wide-max-width, 820px))";
  }

  if (container && aspectRatio <= MERMAID_TALL_RATIO) {
    container.classList.add(MERMAID_BLOCK_TALL_CLASS);
    svg.style.maxHeight = "min(var(--mermaid-tall-max-height, 560px), 68vh)";
  }
}

function clearContentImageClasses(target) {
  if (!(target instanceof Element)) {
    return;
  }

  target.classList.remove(
    CONTENT_IMAGE_LANDSCAPE_CLASS,
    CONTENT_IMAGE_PORTRAIT_CLASS,
    CONTENT_IMAGE_SQUARE_CLASS,
  );
}

function syncContentImageClasses(image, className) {
  if (!(image instanceof HTMLImageElement)) {
    return;
  }

  clearContentImageClasses(image);
  image.classList.add(className);

  const figure = image.closest("figure");
  if (
    figure instanceof HTMLElement &&
    (figure.classList.contains("content-image") || figure.classList.contains("image-frame"))
  ) {
    clearContentImageClasses(figure);
    figure.classList.add(className);
  }
}

function readIntrinsicImageDimensions(imageLike) {
  if (!(imageLike instanceof HTMLImageElement)) {
    return null;
  }

  const width =
    imageLike.naturalWidth > 0
      ? imageLike.naturalWidth
      : Number.parseFloat(imageLike.getAttribute("width") ?? "");
  const height =
    imageLike.naturalHeight > 0
      ? imageLike.naturalHeight
      : Number.parseFloat(imageLike.getAttribute("height") ?? "");

  if (!(width > 0) || !(height > 0)) {
    return null;
  }

  return { width, height };
}

function classifyContentImageByDimensions(image, dimensions) {
  if (!(image instanceof HTMLImageElement) || !dimensions) {
    return;
  }

  const aspectRatio = dimensions.width / dimensions.height;
  if (aspectRatio >= CONTENT_IMAGE_LANDSCAPE_THRESHOLD) {
    syncContentImageClasses(image, CONTENT_IMAGE_LANDSCAPE_CLASS);
    return;
  }

  if (aspectRatio <= CONTENT_IMAGE_PORTRAIT_THRESHOLD) {
    syncContentImageClasses(image, CONTENT_IMAGE_PORTRAIT_CLASS);
    return;
  }

  syncContentImageClasses(image, CONTENT_IMAGE_SQUARE_CLASS);
}

function resolveContentImageDimensions(image) {
  const immediate = readIntrinsicImageDimensions(image);
  if (immediate) {
    return Promise.resolve(immediate);
  }

  const source = image.currentSrc || image.getAttribute("src") || "";
  if (!source) {
    return Promise.resolve(null);
  }

  const cached = contentImageDimensionCache.get(source);
  if (cached) {
    return cached;
  }

  const pending = new Promise((resolve) => {
    const probe = new Image();
    const finalize = () => {
      resolve(readIntrinsicImageDimensions(probe));
    };

    probe.addEventListener("load", finalize, { once: true });
    probe.addEventListener("error", () => resolve(null), { once: true });
    probe.src = source;

    if (probe.complete) {
      if (typeof probe.decode === "function") {
        probe.decode().then(finalize).catch(finalize);
      } else {
        finalize();
      }
    }
  });

  contentImageDimensionCache.set(source, pending);
  return pending;
}

function prepareContentImage(image) {
  if (!(image instanceof HTMLImageElement) || image.closest(".mermaid-block")) {
    return;
  }

  const figure = image.closest("figure");
  if (
    figure instanceof HTMLElement &&
    (figure.classList.contains("content-image") || figure.classList.contains("image-frame"))
  ) {
    clearContentImageClasses(figure);
  }
  clearContentImageClasses(image);

  const handleLoad = () => {
    resolveContentImageDimensions(image)
      .then((dimensions) => {
        if (!dimensions) {
          handleError();
          return;
        }
        classifyContentImageByDimensions(image, dimensions);
      })
      .catch(() => {
        handleError();
      });
  };
  const handleError = () => {
    clearContentImageClasses(image);
    if (
      figure instanceof HTMLElement &&
      (figure.classList.contains("content-image") || figure.classList.contains("image-frame"))
    ) {
      clearContentImageClasses(figure);
    }
  };

  image.addEventListener("load", handleLoad, { once: true });
  image.addEventListener("error", handleError, { once: true });

  if (image.complete) {
    handleLoad();
  }
}

function enhanceContentImages(root) {
  if (!(root instanceof HTMLElement)) {
    return;
  }

  for (const image of root.querySelectorAll("img")) {
    prepareContentImage(image);
  }
}

function parseMermaidNodes() {
  const contentEl = document.getElementById("viewer-content");
  if (!(contentEl instanceof HTMLElement)) {
    return [];
  }

  return Array.from(contentEl.querySelectorAll(MERMAID_SELECTOR));
}

function resetMermaidNodes(nodes) {
  for (const node of nodes) {
    node.removeAttribute("data-mermaid-rendered");
    if (node.parentElement instanceof HTMLElement) {
      node.parentElement.classList.remove(MERMAID_BLOCK_WIDE_CLASS, MERMAID_BLOCK_TALL_CLASS);
      removeMermaidErrorMessage(node.parentElement);
    }
  }
}

async function loadMermaidLibrary(config) {
  if (!config.enabled) {
    return null;
  }

  const normalized = {
    ...config,
    theme: normalizeMermaidTheme(config.theme),
    cdnUrl: normalizeMermaidUrl(config.cdnUrl),
  };

  if (window.mermaid) {
    if (!mermaidRuntime.initialized || mermaidRuntime.lastTheme !== normalized.theme) {
      window.mermaid.initialize({
        startOnLoad: false,
        theme: normalized.theme,
      });
      mermaidRuntime.initialized = true;
      mermaidRuntime.lastTheme = normalized.theme;
    }
    return window.mermaid;
  }

  if (mermaidRuntime.loadingPromise) {
    return mermaidRuntime.loadingPromise;
  }

  const expectedAbsoluteUrl = toAbsoluteUrl(normalized.cdnUrl);
  const existingScript = document.getElementById("mermaid-runtime");
  if (existingScript instanceof HTMLScriptElement) {
    // 이전 로드가 비정상 종료된 스크립트 잔존을 막기 위해 재시도 전에 정리한다.
    existingScript.remove();
    mermaidRuntime.scriptElement = null;
    mermaidRuntime.initialized = false;
    mermaidRuntime.lastTheme = "";
    mermaidRuntime.lastCdnUrl = "";
  }

  mermaidRuntime.loadingPromise = new Promise((resolve, reject) => {
    let script = mermaidRuntime.scriptElement;
    if (!(script instanceof HTMLScriptElement)) {
      script = document.createElement("script");
      script.id = "mermaid-runtime";
      script.src = normalized.cdnUrl;
      script.async = true;
      script.crossOrigin = "anonymous";
      mermaidRuntime.scriptElement = script;
      mermaidRuntime.lastCdnUrl = expectedAbsoluteUrl;
    }

    const finalize = (error) => {
      mermaidRuntime.loadingPromise = null;
      if (error) {
        if (mermaidRuntime.scriptElement instanceof HTMLScriptElement) {
          mermaidRuntime.scriptElement.remove();
          mermaidRuntime.scriptElement = null;
        }
        mermaidRuntime.initialized = false;
        mermaidRuntime.lastTheme = "";
        mermaidRuntime.lastCdnUrl = "";
        reject(error);
        return;
      }
      resolve(window.mermaid ?? null);
    };

    script.addEventListener("load", () => {
      if (window.mermaid && (!mermaidRuntime.initialized || mermaidRuntime.lastTheme !== normalized.theme)) {
        window.mermaid.initialize({
          startOnLoad: false,
          theme: normalized.theme,
        });
        mermaidRuntime.initialized = true;
        mermaidRuntime.lastTheme = normalized.theme;
      }
      finalize();
    });
    script.addEventListener("error", () => {
      finalize(new Error(`Mermaid 라이브러리 로드 실패: ${normalized.cdnUrl}`));
    });

    if (!script.isConnected) {
      document.head.appendChild(script);
    }
  });

  return mermaidRuntime.loadingPromise;
}

async function renderMermaidBlocks(config) {
  const blocks = parseMermaidNodes();
  if (blocks.length === 0) {
    return;
  }

  resetMermaidNodes(blocks);

  try {
    const mermaid = await loadMermaidLibrary(config);
    if (!mermaid) {
      for (const block of blocks) {
        showMermaidError(block, "Mermaid 렌더링이 비활성화되어 코드 블록을 그대로 표시합니다.");
      }
      return;
    }

    for (const block of blocks) {
      try {
        if (typeof mermaid.run === "function") {
          await mermaid.run({ nodes: [block] });
          normalizeRenderedMermaidSvg(block);
          continue;
        }
        if (typeof mermaid.init === "function") {
          await mermaid.init({ startOnLoad: false }, [block]);
          normalizeRenderedMermaidSvg(block);
          continue;
        }
        throw new Error("Mermaid 렌더러 API가 존재하지 않습니다.");
      } catch (error) {
        const message = `Mermaid 렌더링 실패: ${error instanceof Error ? error.message : String(error)}`;
        showMermaidError(block, message);
      }
    }
  } catch (error) {
    const message = `Mermaid 렌더링 실패: ${error instanceof Error ? error.message : String(error)}`;
    for (const block of blocks) {
      showMermaidError(block, message);
    }
  }
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

function normalizePathname(pathname) {
  let normalized = "/";
  try {
    normalized = decodeURIComponent(pathname || "/");
  } catch {
    normalized = String(pathname || "/");
  }
  if (!normalized.startsWith("/")) {
    normalized = `/${normalized}`;
  }
  return normalized.replace(/\/+/g, "/") || "/";
}

function normalizeRoute(pathname) {
  const normalized = normalizePathname(pathname);
  if (normalized.endsWith("/")) {
    return normalized;
  }
  return `${normalized}/`;
}

function normalizePathBase(pathBase) {
  if (typeof pathBase !== "string") {
    return "";
  }

  const cleaned = pathBase.trim().replace(/\\/g, "/");
  if (!cleaned || cleaned === "/") {
    return "";
  }

  return `/${cleaned.replace(/^\/+/, "").replace(/\/+$/, "")}`;
}

function stripPathBase(pathname, pathBase) {
  const normalizedPath = normalizePathname(pathname);
  if (!pathBase) {
    return normalizedPath;
  }
  if (normalizedPath === pathBase) {
    return "/";
  }
  if (normalizedPath.startsWith(`${pathBase}/`)) {
    return normalizedPath.slice(pathBase.length) || "/";
  }
  return normalizedPath;
}

function toPathWithBase(pathname, pathBase) {
  const normalizedPath = normalizePathname(pathname);
  if (!pathBase) {
    return toSafeUrlPath(normalizedPath);
  }
  if (normalizedPath === "/") {
    return toSafeUrlPath(`${pathBase}/`);
  }
  return toSafeUrlPath(`${pathBase}${normalizedPath}`);
}

function loadInitialViewData() {
  const script = document.getElementById("initial-view-data");
  if (!(script instanceof HTMLScriptElement)) {
    return null;
  }

  const raw = script.textContent;
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const route = typeof parsed.route === "string" ? normalizeRoute(parsed.route) : null;
    const docId = typeof parsed.docId === "string" ? parsed.docId : null;
    const title = typeof parsed.title === "string" ? parsed.title : null;

    if (!route || !docId || !title) {
      return null;
    }

    return {
      route,
      docId,
      title,
    };
  } catch {
    return null;
  }
}

function loadInitialRuntimeData() {
  const script = document.getElementById("initial-runtime-data");
  if (!(script instanceof HTMLScriptElement)) {
    return null;
  }

  const raw = script.textContent;
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const pathBase = normalizePathBase(parsed.pathBase);
    const manifestUrl = typeof parsed.manifestUrl === "string" ? parsed.manifestUrl : "";
    const treeModuleUrl = typeof parsed.treeModuleUrl === "string" ? parsed.treeModuleUrl : "";
    if (!manifestUrl || manifestUrl !== toPathWithBase("/manifest.json", pathBase)) {
      return null;
    }

    let resolvedTreeModuleUrl;
    try {
      resolvedTreeModuleUrl = new URL(treeModuleUrl, document.baseURI);
    } catch {
      return null;
    }
    const treeModulePath = stripPathBase(resolvedTreeModuleUrl.pathname, pathBase);
    if (
      resolvedTreeModuleUrl.origin !== window.location.origin ||
      !/^\/assets\/tree\.[a-f0-9]{12}\.js$/.test(treeModulePath)
    ) {
      return null;
    }

    return { manifestUrl, pathBase, treeModuleUrl: resolvedTreeModuleUrl.href };
  } catch {
    return null;
  }
}

function resolveRouteFromLocation(routeMap, pathBase) {
  const direct = normalizeRoute(stripPathBase(location.pathname, pathBase));
  return routeMap[direct] ? direct : direct;
}

function resolveSiteTitle(manifest) {
  const value = typeof manifest?.siteTitle === "string" ? manifest.siteTitle.trim() : "";
  return value || DEFAULT_SITE_TITLE;
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

function parseDateToEpochMs(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getRecentSortEpochMs(doc) {
  return parseDateToEpochMs(doc.updatedDate) ?? parseDateToEpochMs(doc.date);
}

function compareDocsByRecentDateThenRoute(left, right) {
  const leftEpoch = getRecentSortEpochMs(left);
  const rightEpoch = getRecentSortEpochMs(right);

  if (leftEpoch != null && rightEpoch != null) {
    const byDate = rightEpoch - leftEpoch;
    if (byDate !== 0) {
      return byDate;
    }
  } else if (leftEpoch != null && rightEpoch == null) {
    return -1;
  } else if (leftEpoch == null && rightEpoch != null) {
    return 1;
  }

  return left.route.localeCompare(right.route, "ko-KR");
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

function buildBranchView(manifest, manifestDocs, branch, defaultBranch) {
  const docs = manifestDocs.filter((doc) => isDocVisibleInBranch(doc, branch, defaultBranch));
  const visibleDocIds = new Set(docs.map((doc) => doc.id));
  const tree = cloneFilteredTree(manifest.tree, visibleDocIds);
  const trees = buildTreesAdapterInput(tree, docs);
  const routeMap = {};
  const docIndexById = new Map();
  for (const doc of docs) {
    routeMap[doc.route] = doc.id;
  }
  for (let i = 0; i < docs.length; i += 1) {
    docIndexById.set(docs[i].id, i);
  }

  return {
    docs,
    visibleDocIds,
    tree,
    trees,
    routeMap,
    docIndexById,
  };
}

function pickHomeRoute(view) {
  if (view.routeMap["/index/"]) {
    return "/index/";
  }
  return [...view.docs].sort(compareDocsByRecentDateThenRoute)[0]?.route || "/";
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

  const candidates = [];
  const collect = (root) => {
    for (const el of root.querySelectorAll("*")) {
      if (!(el instanceof HTMLElement)) {
        continue;
      }
      if (el.matches(FOCUSABLE_SELECTOR)) {
        candidates.push(el);
      }
      if (el.shadowRoot) {
        collect(el.shadowRoot);
      }
    }
  };

  collect(container);

  return candidates.filter((el) => {
    if (!(el instanceof HTMLElement)) {
      return false;
    }

    if (el.hasAttribute("hidden") || el.getAttribute("aria-hidden") === "true") {
      return false;
    }

    if (el.closest("[hidden], [inert], [aria-hidden='true']")) {
      return false;
    }

    if (el instanceof HTMLInputElement && el.type === "hidden") {
      return false;
    }

    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") {
      return false;
    }

    return el.getClientRects().length > 0;
  });
}

function normalizeTreeLabelText(value, fallback = "") {
  const normalized = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  return normalized || fallback;
}

function getTreeLabelRenderRoot(host) {
  return host?.shadowRoot || host || null;
}

function decorateTreeLabels(host) {
  const metadataByTreePath = host?.__eiamMetadataByTreePath;
  if (!(metadataByTreePath instanceof Map)) {
    return;
  }

  const renderRoot = getTreeLabelRenderRoot(host);
  if (!renderRoot) {
    return;
  }

  const rows = renderRoot.querySelectorAll("[data-type='item'][data-item-type='file'][data-item-path]");
  for (const row of rows) {
    const treePath = row.getAttribute("data-item-path") || "";
    const metadata = metadataByTreePath.get(treePath);
    if (!metadata || metadata.kind !== "file") {
      continue;
    }

    const prefix = normalizeTreeLabelText(metadata.prefix);
    const fallbackName = treePath.split("/").pop() || "";
    const fallbackTitle = prefix && fallbackName.startsWith(`${prefix} `)
      ? fallbackName.slice(prefix.length).trimStart()
      : fallbackName;
    const title = normalizeTreeLabelText(metadata.title, fallbackTitle);
    const labelKey = JSON.stringify([prefix, title]);
    const content = row.querySelector("[data-item-section='content']");
    if (!(content instanceof HTMLElement) || content.dataset.eiamTreeLabel === labelKey) {
      continue;
    }

    content.dataset.eiamTreeLabel = labelKey;
    content.textContent = "";

    const label = document.createElement("span");
    label.className = "tree-item-label";

    if (prefix) {
      const prefixBadge = document.createElement("span");
      prefixBadge.className = "tree-item-prefix-badge";
      prefixBadge.textContent = prefix;
      label.appendChild(prefixBadge);
    }

    const titleText = document.createElement("span");
    titleText.className = "tree-item-title";
    titleText.textContent = title;
    label.appendChild(titleText);

    content.appendChild(label);
    row.setAttribute("title", prefix ? `${prefix} ${title}` : title);
  }
}

function queueTreeLabelDecoration(host) {
  if (!(host instanceof HTMLElement)) {
    return;
  }

  if (host.__eiamTreeLabelFrame) {
    window.cancelAnimationFrame(host.__eiamTreeLabelFrame);
  }

  host.__eiamTreeLabelFrame = window.requestAnimationFrame(() => {
    host.__eiamTreeLabelFrame = 0;
    decorateTreeLabels(host);
  });
}

function setupTreeLabelDecorations(treeRoot, metadataByTreePath) {
  const host = treeRoot?.querySelector("file-tree-container");
  if (!(host instanceof HTMLElement)) {
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
    host.__eiamTreeLabelObserver = new MutationObserver(() => {
      queueTreeLabelDecoration(host);
    });
    host.__eiamTreeLabelObserver.observe(renderRoot, {
      childList: true,
      subtree: true,
    });
  }

  queueTreeLabelDecoration(host);
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

function renderNav(docs, docIndexById, currentId, pathBase) {
  const currentIndex = docIndexById.get(currentId) ?? -1;
  if (currentIndex === -1) return "";

  const prev = currentIndex > 0 ? docs[currentIndex - 1] : null;
  const next = currentIndex < docs.length - 1 ? docs[currentIndex + 1] : null;

  let html = "";

  if (prev) {
    html += `<a href="${toPathWithBase(prev.route, pathBase)}" class="nav-link nav-link-prev" data-route="${escapeHtmlAttr(prev.route)}">
      <div class="nav-link-label"><span class="material-symbols-outlined">arrow_back</span>Previous</div>
      <div class="nav-link-title">${escapeHtmlAttr(prev.title)}</div>
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
    const prefix = typeof backlink.prefix === "string" && backlink.prefix.trim().length > 0
      ? `<span class="backlink-prefix">${escapeHtmlAttr(backlink.prefix.trim())}</span>`
      : "";
    const route = typeof backlink.route === "string" ? normalizeRoute(backlink.route) : "/";
    const title = typeof backlink.title === "string" && backlink.title.trim().length > 0 ? backlink.title : route;
    html += `<li class="backlinks-item"><a href="${toPathWithBase(route, pathBase)}" class="backlink-link" data-route="${escapeHtmlAttr(route)}">${prefix}<span class="backlink-text">${escapeHtmlAttr(title)}</span></a></li>`;
  }
  html += "</ul>";
  return html;
}

function setAppReadyState(state) {
  if (!(document.documentElement instanceof HTMLElement)) {
    return;
  }
  document.documentElement.setAttribute(APP_READY_STATE_ATTR, state);
}

function setTreeRuntimeState(state) {
  if (!(document.documentElement instanceof HTMLElement)) {
    return;
  }
  document.documentElement.setAttribute(TREE_RUNTIME_STATE_ATTR, state);
}

async function start() {
  setAppReadyState("booting");
  setTreeRuntimeState("idle");

  const treeRoot = document.getElementById("tree-root");
  const treeSearchInput = document.getElementById("tree-search-input");
  const treeSearchClear = document.getElementById("tree-search-clear");
  const treeSearchPrev = document.getElementById("tree-search-prev");
  const treeSearchNext = document.getElementById("tree-search-next");
  const treeSearchCount = document.getElementById("tree-search-count");
  const appRoot = document.querySelector(".app-root");
  const splitter = document.getElementById("app-splitter");
  const sidebar = document.getElementById("sidebar-panel");
  const sidebarToggle = document.getElementById("sidebar-toggle");
  const sidebarClose = document.getElementById("sidebar-close");
  const sidebarOverlay = document.getElementById("sidebar-overlay");
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
  const backlinksEl = document.getElementById("viewer-backlinks");
  const navEl = document.getElementById("viewer-nav");
  const a11yStatusEl = document.getElementById("a11y-status");
  const viewerEl = document.querySelector(".viewer");
  const initialViewData = loadInitialViewData();
  let hasHydratedInitialView = false;

  let desktopSidebarWidth = clampDesktopSidebarWidth(loadDesktopSidebarWidth());
  let activeResizePointerId = null;
  let resizeStartX = 0;
  let resizeStartWidth = desktopSidebarWidth;
  let fileTree = null;
  let isSyncingTreeSelection = false;
  let treePathOrder = new Map();
  let treeSearchValue = "";
  let renderedTreeBranch = "";
  let treeRuntime = null;
  let treeLoadPromise = null;
  let treeRetryCount = 0;
  let treeLoadAllowed = false;
  let pendingTreeLoadReason = "";
  let requestTreeLoad = (reason) => {
    pendingTreeLoadReason = reason;
    return Promise.resolve(false);
  };

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

  const setViewerInteractiveState = (isInteractive) => {
    if (!(viewerEl instanceof HTMLElement)) {
      return;
    }

    if (isInteractive) {
      viewerEl.removeAttribute("inert");
      viewerEl.removeAttribute("aria-hidden");
      return;
    }

    viewerEl.setAttribute("inert", "");
    viewerEl.setAttribute("aria-hidden", "true");
  };

  const syncSidebarA11y = (isOpen) => {
    if (sidebarToggle) {
      sidebarToggle.setAttribute("aria-expanded", String(isOpen));
    }

    if (sidebarOverlay) {
      sidebarOverlay.setAttribute("aria-hidden", String(!isOpen));
    }

    if (!(sidebar instanceof HTMLElement)) {
      setViewerInteractiveState(true);
      return;
    }

    if (!isCompactLayout()) {
      sidebar.removeAttribute("inert");
      sidebar.removeAttribute("aria-hidden");
      sidebar.removeAttribute("aria-modal");
      sidebar.setAttribute("role", "complementary");
      setViewerInteractiveState(true);
      return;
    }

    if (isOpen) {
      sidebar.removeAttribute("inert");
      sidebar.removeAttribute("aria-hidden");
      sidebar.setAttribute("role", "dialog");
      sidebar.setAttribute("aria-modal", "true");
      setViewerInteractiveState(false);
    } else {
      sidebar.setAttribute("inert", "");
      sidebar.setAttribute("aria-hidden", "true");
      sidebar.removeAttribute("aria-modal");
      sidebar.setAttribute("role", "complementary");
      setViewerInteractiveState(true);
    }
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
    void requestTreeLoad("mobile-sidebar");
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
      if (treeLoadAllowed) {
        void requestTreeLoad("desktop-layout");
      }
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

  const initialRuntimeData = loadInitialRuntimeData();
  const initialPathBase = normalizePathBase(initialRuntimeData?.pathBase);
  const manifestUrl = initialRuntimeData?.manifestUrl ?? toPathWithBase("/manifest.json", initialPathBase);
  const treeModuleUrl = initialRuntimeData?.treeModuleUrl ?? "";
  const manifestRes = await fetch(manifestUrl);
  if (!manifestRes.ok) {
    throw new Error(`Failed to load manifest: ${manifestRes.status}`);
  }
  const manifest = normalizeManifestPayload(await manifestRes.json());
  if (!manifest) {
    throw new Error("Failed to load a supported manifest schema");
  }
  const mermaidConfig = resolveMermaidConfig(manifest);
  const pathBase = normalizePathBase(manifest.pathBase);
  const siteTitle = resolveSiteTitle(manifest);
  const defaultBranch = normalizeBranch(manifest.defaultBranch) || DEFAULT_BRANCH;
  const availableBranchSet = new Set([defaultBranch]);
  const manifestDocs = getRuntimeManifestDocs(manifest);
  for (const doc of manifestDocs) {
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
  const branchViewCache = new Map();
  const getBranchView = (branch) => {
    const cached = branchViewCache.get(branch);
    if (cached) {
      return cached;
    }
    const nextView = buildBranchView(manifest, manifestDocs, branch, defaultBranch);
    branchViewCache.set(branch, nextView);
    return nextView;
  };
  let view = getBranchView(activeBranch);

  const docsById = new Map(manifestDocs.map((doc) => [doc.id, doc]));

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

  const updateTreeSearchControls = () => {
    const normalizedSearchValue = fileTree ? fileTree.getSearchValue() : treeSearchValue.trim();
    const hasSearch = normalizedSearchValue.length > 0;
    const matchCount = hasSearch && fileTree ? fileTree.getSearchMatchingPaths().length : 0;
    const canStep = hasSearch && matchCount > 0;

    if (treeSearchClear instanceof HTMLButtonElement) {
      treeSearchClear.hidden = !hasSearch;
      treeSearchClear.disabled = !hasSearch;
    }

    for (const button of [treeSearchPrev, treeSearchNext]) {
      if (button instanceof HTMLButtonElement) {
        button.disabled = !canStep;
      }
    }

    if (treeSearchCount instanceof HTMLElement) {
      treeSearchCount.textContent = hasSearch ? `${matchCount}개 일치` : "";
    }
  };

  const applyTreeSearch = (value) => {
    treeSearchValue = value;

    if (treeSearchInput instanceof HTMLInputElement && treeSearchInput.value !== value) {
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

  if (treeSearchInput instanceof HTMLInputElement) {
    treeSearchInput.addEventListener("focus", () => {
      void requestTreeLoad("tree-search");
    });
    treeSearchInput.addEventListener("input", () => {
      applyTreeSearch(treeSearchInput.value);
      void requestTreeLoad("tree-search");
    });
    treeSearchInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        moveTreeSearchFocus(event.shiftKey ? -1 : 1);
        return;
      }

      if (event.key === "Escape" && treeSearchInput.value.trim()) {
        event.preventDefault();
        event.stopPropagation();
        applyTreeSearch("");
      }
    });
  }

  treeSearchClear?.addEventListener("click", () => {
    applyTreeSearch("");
    if (treeSearchInput instanceof HTMLInputElement) {
      treeSearchInput.focus();
    }
  });

  treeSearchPrev?.addEventListener("click", () => {
    moveTreeSearchFocus(-1);
  });

  treeSearchNext?.addEventListener("click", () => {
    moveTreeSearchFocus(1);
  });

  const syncActiveTreeSelection = (docId, { scroll = true } = {}) => {
    if (!fileTree || !docId) {
      return;
    }

    const treePath = view.trees.docIdToPrimaryTreePath.get(docId);
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

  const clearTreeSelection = () => {
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

  const cleanupTreeLabelDecorations = (host) => {
    if (!(host instanceof HTMLElement)) {
      return;
    }

    if (host.__eiamTreeLabelFrame) {
      window.cancelAnimationFrame(host.__eiamTreeLabelFrame);
      host.__eiamTreeLabelFrame = 0;
    }
    host.__eiamTreeLabelObserver?.disconnect();
    delete host.__eiamTreeLabelObserver;
    delete host.__eiamTreeLabelObservedRoot;
    delete host.__eiamMetadataByTreePath;
  };

  const destroyFileTree = () => {
    const host = treeRoot instanceof HTMLElement ? treeRoot.querySelector("file-tree-container") : null;
    cleanupTreeLabelDecorations(host);
    fileTree?.cleanUp?.();
    fileTree = null;
    renderedTreeBranch = "";
    host?.remove();
  };

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
    treePathOrder = new Map(view.trees.paths.map((treePath, index) => [treePath, index]));
    return treeRuntime.prepareFileTreeInput(view.trees.paths, { sort: compareTreesByBranchOrder });
  };

  const renderTreeRowDecoration = ({ item }) => {
    const metadata = view.trees.metadataByTreePath.get(item.path);
    if (metadata?.kind !== "file" || metadata.isNew !== true) {
      return null;
    }

    return {
      text: "NEW",
      title: "New document",
    };
  };

  const renderTreeContextMenu = (item, context) => {
    const route = view.trees.treePathToRoute.get(item.path);
    if (!route) {
      return null;
    }

    const menu = document.createElement("div");
    menu.className = "tree-context-menu";
    Object.assign(menu.style, {
      background: "var(--trees-bg-override, canvas)",
      border: "1px solid var(--trees-border-color-override, color-mix(in srgb, currentColor 18%, transparent))",
      borderRadius: "6px",
      boxShadow: "0 10px 24px rgba(0, 0, 0, 0.18)",
      minWidth: "120px",
      padding: "4px",
    });

    const link = document.createElement("a");
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
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      event.preventDefault();
      context.close();
      void state.navigate(route, true);
    });

    menu.appendChild(link);
    return menu;
  };

  const renderTree = (state) => {
    if (!(treeRoot instanceof HTMLElement) || !treeRuntime) {
      return;
    }

    if (fileTree && renderedTreeBranch !== activeBranch) {
      destroyFileTree();
    }

    const preparedInput = prepareTreesInput();
    const selectedTreePath = state.currentDocId
      ? view.trees.docIdToPrimaryTreePath.get(state.currentDocId)
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
          const route = selectedPath ? view.trees.treePathToRoute.get(selectedPath) : null;
          if (!route) {
            window.queueMicrotask(() => syncActiveTreeSelection(state.currentDocId, { scroll: false }));
            return;
          }

          void state.navigate(route, true);
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

    renderedTreeBranch = activeBranch;
    syncActiveTreeSelection(state.currentDocId || "");
    applyTreeSearch(treeSearchValue);
    setupTreeLabelDecorations(treeRoot, view.trees.metadataByTreePath);
  };

  const renderTreeLoadingState = () => {
    if (!(treeRoot instanceof HTMLElement) || fileTree) {
      return;
    }
    const status = document.createElement("p");
    status.className = "tree-load-status";
    status.setAttribute("role", "status");
    status.textContent = "문서 탐색기를 불러오는 중입니다.";
    treeRoot.replaceChildren(status);
  };

  const renderTreeFallback = (error) => {
    if (!(treeRoot instanceof HTMLElement)) {
      return;
    }

    const fallback = document.createElement("section");
    fallback.className = "tree-load-fallback";
    fallback.setAttribute("aria-label", "간이 문서 탐색기");

    const message = document.createElement("p");
    message.className = "tree-load-fallback-message";
    message.setAttribute("role", "alert");
    message.textContent = "문서 트리를 불러오지 못했습니다. 아래 링크로 계속 탐색할 수 있습니다.";

    const retry = document.createElement("button");
    retry.className = "tree-load-retry";
    retry.type = "button";
    retry.textContent = "탐색기 다시 불러오기";
    retry.addEventListener("click", () => {
      void requestTreeLoad("retry", { retry: true });
    });

    const links = document.createElement("ul");
    links.className = "tree-load-fallback-links";
    for (const doc of view.docs) {
      const item = document.createElement("li");
      const link = document.createElement("a");
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
        void state.navigate(doc.route, true);
      });
      item.appendChild(link);
      links.appendChild(item);
    }

    fallback.append(message, retry, links);
    fallback.dataset.error = error instanceof Error ? error.name : "TreeLoadError";
    treeRoot.replaceChildren(fallback);
  };

  const loadTreeRuntime = ({ reason, retry = false }) => {
    if (treeRuntime) {
      renderTree(state);
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
    if (treeRoot instanceof HTMLElement) {
      treeRoot.setAttribute("aria-busy", "true");
      treeRoot.dataset.treeLoadReason = reason;
    }
    renderTreeLoadingState();
    window.performance?.mark?.("eiam-tree-load-start");

    treeLoadPromise = import(importUrl.href)
      .then((module) => {
        if (
          typeof module.FileTree !== "function" ||
          typeof module.prepareFileTreeInput !== "function" ||
          typeof module.TREE_UNSAFE_CSS !== "string"
        ) {
          throw new Error("Tree runtime exports are invalid");
        }
        treeRuntime = module;
        renderTree(state);
        if (treeRoot instanceof HTMLElement) {
          treeRoot.setAttribute("aria-busy", "false");
        }
        setTreeRuntimeState("ready");
        window.performance?.mark?.("eiam-tree-ready");
        return true;
      })
      .catch((error) => {
        destroyFileTree();
        treeRuntime = null;
        treeLoadPromise = null;
        if (treeRoot instanceof HTMLElement) {
          treeRoot.setAttribute("aria-busy", "false");
        }
        setTreeRuntimeState("error");
        renderTreeFallback(error);
        announceA11yStatus("문서 트리를 불러오지 못했습니다. 간이 링크 탐색기를 사용할 수 있습니다.");
        console.error("Tree runtime load failed:", error);
        return false;
      });

    return treeLoadPromise;
  };

  const updateBacklinks = (doc) => {
    if (!(backlinksEl instanceof HTMLElement)) {
      return;
    }
    if (!doc) {
      backlinksEl.innerHTML = "";
      backlinksEl.hidden = true;
      return;
    }
    const html = renderBacklinks(doc, pathBase);
    backlinksEl.innerHTML = html;
    backlinksEl.hidden = html.length === 0;
  };

  const state = {
    currentDocId: initialViewData?.docId ?? "",
    async navigate(rawRoute, push) {
      if (isCompactLayout()) {
        closeSidebar();
      }

      const route = normalizeRoute(rawRoute);
      let id = view.routeMap[route];

      if (!id) {
        const globalId = manifest.routeMap?.[route];
        const globalDoc = globalId ? docsById.get(globalId) : null;
        const globalDocBranch = normalizeBranch(globalDoc?.branch);
        const targetBranch = globalDocBranch ?? defaultBranch;
        if (globalDoc && targetBranch !== activeBranch && availableBranchSet.has(targetBranch)) {
          activeBranch = targetBranch;
          view = getBranchView(activeBranch);
          updateBranchInfo();
          if (treeRuntime) {
            renderTree(state);
          }
          localStorage.setItem(BRANCH_KEY, activeBranch);
          id = view.routeMap[route];
        }
      }
      
      if (!id) {
        state.currentDocId = "";
        clearTreeSelection();
        breadcrumbEl.innerHTML = renderBreadcrumb(route);
        titleEl.textContent = "문서를 찾을 수 없습니다";
        metaEl.innerHTML = "";
        contentEl.innerHTML = '<p class="placeholder">요청한 경로에 해당하는 문서가 없습니다.</p>';
        updateBacklinks(null);
        navEl.innerHTML = "";
        announceA11yStatus("탐색 실패: 요청한 문서를 찾을 수 없습니다.");
        if (push) {
          history.pushState(null, "", toPathWithBase(route, pathBase));
        }
        return;
      }

      const doc = docsById.get(id);
      if (!doc) {
        return;
      }

      if (push) {
        history.pushState(null, "", toPathWithBase(route, pathBase));
      }

      state.currentDocId = id;
      syncActiveTreeSelection(id);

      const shouldUseInitialView =
        !hasHydratedInitialView &&
        initialViewData &&
        initialViewData.docId === id &&
        initialViewData.route === route;

      if (shouldUseInitialView) {
        hasHydratedInitialView = true;
        breadcrumbEl.innerHTML = renderBreadcrumb(route);
        titleEl.textContent = doc.title;
        metaEl.innerHTML = renderMeta(doc);
        updateBacklinks(doc);
        navEl.innerHTML = renderNav(view.docs, view.docIndexById, id, pathBase);
        enhanceContentImages(contentEl);
        await renderMermaidBlocks(mermaidConfig);
        document.title = composeDocumentTitle(doc.title, siteTitle);
        if (viewerEl instanceof HTMLElement) {
          viewerEl.scrollTo(0, 0);
        }
        announceA11yStatus(`탐색 완료: ${doc.title} 문서를 열었습니다.`);
        return;
      }

      breadcrumbEl.innerHTML = renderBreadcrumb(route);
      titleEl.textContent = doc.title;
      metaEl.innerHTML = renderMeta(doc);

      const res = await fetch(toPathWithBase(doc.contentUrl, pathBase));
      if (!res.ok) {
        contentEl.innerHTML = '<p class="placeholder">본문을 불러오지 못했습니다.</p>';
        updateBacklinks(null);
        navEl.innerHTML = "";
        announceA11yStatus(`탐색 실패: ${doc.title} 문서를 불러오지 못했습니다.`);
        return;
      }

      contentEl.innerHTML = await res.text();

      updateBacklinks(doc);
      navEl.innerHTML = renderNav(view.docs, view.docIndexById, id, pathBase);
      enhanceContentImages(contentEl);
      await renderMermaidBlocks(mermaidConfig);

      document.title = composeDocumentTitle(doc.title, siteTitle);
      if (viewerEl instanceof HTMLElement) {
        viewerEl.scrollTo(0, 0);
      }
      announceA11yStatus(`탐색 완료: ${doc.title} 문서를 열었습니다.`);
    },
  };

  requestTreeLoad = (reason, options = {}) => {
    if (!treeLoadAllowed) {
      pendingTreeLoadReason = reason;
      return Promise.resolve(false);
    }
    pendingTreeLoadReason = "";
    return loadTreeRuntime({ reason, retry: options.retry === true });
  };

  const scheduleTreeLoadAfterFirstContentPaint = () => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        treeLoadAllowed = true;
        window.performance?.mark?.("eiam-first-content-paint-opportunity");

        if (pendingTreeLoadReason) {
          void requestTreeLoad(pendingTreeLoadReason);
          return;
        }
        if (isCompactLayout()) {
          return;
        }

        const loadForDesktop = () => {
          void requestTreeLoad("desktop-idle");
        };
        if (typeof window.requestIdleCallback === "function") {
          window.requestIdleCallback(loadForDesktop, { timeout: 500 });
        } else {
          window.setTimeout(loadForDesktop, 0);
        }
      });
    });
  };

  if (contentEl instanceof HTMLElement) {
    contentEl.addEventListener("click", async (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      const button = target.closest(".code-copy");
      if (!(button instanceof HTMLButtonElement) || !contentEl.contains(button)) {
        return;
      }

      const code = button.dataset.code;
      if (!code) {
        return;
      }

      try {
        await navigator.clipboard.writeText(code);
        button.classList.add("copied");
        const icon = button.querySelector(".material-symbols-outlined");
        if (icon instanceof HTMLElement) {
          icon.textContent = "check";
        }
        setTimeout(() => {
          button.classList.remove("copied");
          const nextIcon = button.querySelector(".material-symbols-outlined");
          if (nextIcon instanceof HTMLElement) {
            nextIcon.textContent = "content_copy";
          }
        }, 2000);
      } catch (err) {
        console.error("Copy failed:", err);
      }
    });
  }

  if (navEl instanceof HTMLElement) {
    navEl.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      const link = target.closest(".nav-link");
      if (!(link instanceof HTMLAnchorElement) || !navEl.contains(link)) {
        return;
      }

      event.preventDefault();
      const route = link.dataset.route;
      if (!route) {
        return;
      }
      state.navigate(route, true);
      if (viewerEl instanceof HTMLElement) {
        viewerEl.scrollTo(0, 0);
      }
    });
  }

  if (backlinksEl instanceof HTMLElement) {
    backlinksEl.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      const link = target.closest(".backlink-link");
      if (!(link instanceof HTMLAnchorElement) || !backlinksEl.contains(link)) {
        return;
      }

      event.preventDefault();
      const route = link.dataset.route;
      if (!route) {
        return;
      }
      state.navigate(route, true);
      if (viewerEl instanceof HTMLElement) {
        viewerEl.scrollTo(0, 0);
      }
    });
  }

  const setActiveBranch = async (nextBranch) => {
    const normalized = normalizeBranch(nextBranch);
    if (!normalized || !availableBranchSet.has(normalized)) {
      return;
    }

    activeBranch = normalized;
    view = getBranchView(activeBranch);
    localStorage.setItem(BRANCH_KEY, activeBranch);
    updateBranchInfo();
    void requestTreeLoad("branch");

    const currentRoute = resolveRouteFromLocation(view.routeMap, pathBase);
    if (view.routeMap[currentRoute]) {
      await state.navigate(currentRoute, false);
      return;
    }

    const fallbackRoute = pickHomeRoute(view);
    await state.navigate(fallbackRoute, true);
  };

  renderBranchPills();
  updateBranchInfo();

  const currentRoute = resolveRouteFromLocation(view.routeMap, pathBase);
  const initialRoute = currentRoute === "/" ? pickHomeRoute(view) : currentRoute;
  handleLayoutChange();
  await state.navigate(initialRoute, currentRoute === "/" && initialRoute !== "/");
  setAppReadyState("ready");
  window.performance?.mark?.("eiam-app-ready");
  scheduleTreeLoadAfterFirstContentPaint();

  window.addEventListener("popstate", async () => {
    await state.navigate(resolveRouteFromLocation(view.routeMap, pathBase), false);
  });
}

start().catch((error) => {
  setAppReadyState("error");

  const contentEl = document.getElementById("viewer-content");
  if (contentEl) {
    const message = error instanceof Error ? error.message : String(error);
    contentEl.innerHTML = "";
    const placeholder = document.createElement("p");
    placeholder.className = "placeholder";
    placeholder.textContent = `초기화 실패: ${message}`;
    contentEl.appendChild(placeholder);
  }
  console.error(error);
});
