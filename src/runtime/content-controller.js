import { toPathWithBase } from "./navigation-state.js";

/** @typedef {import("./contracts").ContentController} ContentController */
/** @typedef {import("./contracts").ContentLifecycle} ContentLifecycle */
/** @typedef {import("./contracts").ContentRenderers} ContentRenderers */
/** @typedef {import("./contracts").InitialViewData} InitialViewData */
/** @typedef {import("./contracts").NavigationState} NavigationState */
/** @typedef {import("./contracts").RuntimeManifestDoc} RuntimeManifestDoc */
/** @typedef {import("./contracts").ViewerElements} ViewerElements */

/**
 * @param {Element | null | undefined} element
 * @param {string} value
 */
function setHtml(element, value) {
  if (element && element.innerHTML !== value) {
    element.innerHTML = value;
  }
}

/**
 * @param {Node | null | undefined} element
 * @param {string} value
 */
function setText(element, value) {
  if (element && element.textContent !== value) {
    element.textContent = value;
  }
}

/**
 * @param {{
 *   navigation: NavigationState;
 *   elements: ViewerElements;
 *   initialViewData: InitialViewData | null;
 *   pathBase: string;
 *   siteTitle: string;
 *   renderers: ContentRenderers;
 *   lifecycle?: ContentLifecycle;
 *   fetchContent?: (url: string) => Promise<Response>;
 *   historyApi?: Pick<History, "pushState"> | null;
 *   locationApi?: Pick<Location, "pathname"> | null;
 *   setPageTitle?: (value: string) => void;
 * }} options
 * @returns {ContentController}
 */
export function createContentController(options) {
  const {
    navigation,
    elements,
    initialViewData,
    pathBase,
    siteTitle,
    renderers,
    lifecycle = {},
    fetchContent = (url) => fetch(url),
    historyApi = globalThis.history,
    locationApi = globalThis.location,
    setPageTitle = (value) => {
      document.title = value;
    },
  } = options;
  let hasHydratedInitialView = false;
  let isSetup = false;

  /** @param {string} html */
  const updateBacklinks = (html) => {
    if (!elements.backlinks) {
      return;
    }
    setHtml(elements.backlinks, html);
    const shouldHide = html.length === 0;
    if (elements.backlinks.hidden !== shouldHide) {
      elements.backlinks.hidden = shouldHide;
    }
  };

  /**
   * @param {string} route
   * @param {RuntimeManifestDoc} doc
   */
  const renderChrome = (route, doc) => {
    const chrome = renderers.chrome({
      route,
      doc,
      docs: navigation.view.docs,
      pathBase,
    });
    setHtml(elements.breadcrumb, chrome.breadcrumbHtml);
    setText(elements.title, doc.title);
    setHtml(elements.meta, chrome.metaHtml);
    updateBacklinks(chrome.backlinksHtml);
    setHtml(elements.nav, chrome.navHtml);
  };

  /** @param {RuntimeManifestDoc} doc */
  const finishNavigation = async (doc) => {
    await lifecycle.enhanceContent?.(elements.content);
    setPageTitle(renderers.documentTitle(doc.title, siteTitle));
    elements.viewer?.scrollTo?.(0, 0);
    lifecycle.announce?.(`탐색 완료: ${doc.title} 문서를 열었습니다.`);
  };

  /**
   * @param {string} route
   * @param {boolean} push
   */
  const renderMissingRoute = (route, push) => {
    navigation.setCurrentDocId("");
    lifecycle.onMissingSelection?.();
    setHtml(elements.breadcrumb, renderers.breadcrumb(route));
    setText(elements.title, "문서를 찾을 수 없습니다");
    setHtml(elements.meta, "");
    setHtml(elements.content, '<p class="placeholder">요청한 경로에 해당하는 문서가 없습니다.</p>');
    updateBacklinks("");
    setHtml(elements.nav, "");
    lifecycle.announce?.("탐색 실패: 요청한 문서를 찾을 수 없습니다.");
    if (push) {
      historyApi?.pushState?.(null, "", toPathWithBase(route, pathBase));
    }
  };

  /**
   * @param {unknown} rawRoute
   * @param {boolean} push
   */
  const navigate = async (rawRoute, push) => {
    lifecycle.beforeNavigate?.();
    const resolved = navigation.resolve(rawRoute);
    if (resolved.branchChanged) {
      lifecycle.onBranchChange?.(navigation.activeBranch);
    }

    if (!resolved.id || !resolved.doc) {
      renderMissingRoute(resolved.route, push);
      return false;
    }

    if (push) {
      historyApi?.pushState?.(null, "", toPathWithBase(resolved.route, pathBase));
    }

    navigation.setCurrentDocId(resolved.id);
    lifecycle.onCurrentDocChange?.(resolved.id);

    const shouldUseInitialView =
      !hasHydratedInitialView &&
      initialViewData &&
      initialViewData.docId === resolved.id &&
      initialViewData.route === resolved.route;

    renderChrome(resolved.route, resolved.doc);
    if (shouldUseInitialView) {
      hasHydratedInitialView = true;
      await finishNavigation(resolved.doc);
      return true;
    }

    const response = await fetchContent(toPathWithBase(resolved.doc.contentUrl, pathBase));
    if (!response.ok) {
      setHtml(elements.content, '<p class="placeholder">본문을 불러오지 못했습니다.</p>');
      updateBacklinks("");
      setHtml(elements.nav, "");
      lifecycle.announce?.(`탐색 실패: ${resolved.doc.title} 문서를 불러오지 못했습니다.`);
      return false;
    }

    setHtml(elements.content, await response.text());
    await finishNavigation(resolved.doc);
    return true;
  };

  /** @param {Event} event */
  const handleLinkClick = (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const link = target.closest(".nav-link, .backlink-link");
    if (!(link instanceof HTMLAnchorElement)) {
      return;
    }
    const owner = link.closest("#viewer-nav, #viewer-backlinks");
    if (owner !== elements.nav && owner !== elements.backlinks) {
      return;
    }
    const route = link.dataset.route;
    if (!route) {
      return;
    }
    event.preventDefault();
    void navigate(route, true);
  };

  const handlePopState = () => {
    const route = lifecycle.resolveLocationRoute?.(locationApi?.pathname ?? "/") ?? "/";
    void navigate(route, false);
  };

  return {
    navigate,
    setup() {
      if (isSetup) return;
      isSetup = true;
      elements.nav?.addEventListener?.("click", handleLinkClick);
      elements.backlinks?.addEventListener?.("click", handleLinkClick);
      globalThis.addEventListener?.("popstate", handlePopState);
    },
    destroy() {
      if (!isSetup) return;
      isSetup = false;
      elements.nav?.removeEventListener?.("click", handleLinkClick);
      elements.backlinks?.removeEventListener?.("click", handleLinkClick);
      globalThis.removeEventListener?.("popstate", handlePopState);
    },
  };
}
