import { toPathWithBase } from "./navigation-state.js";

function setHtml(element, value) {
  if (element) {
    element.innerHTML = value;
  }
}

function setText(element, value) {
  if (element) {
    element.textContent = value;
  }
}

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

  const updateBacklinks = (doc) => {
    if (!elements.backlinks) {
      return;
    }
    const html = doc ? renderers.backlinks(doc, pathBase) : "";
    elements.backlinks.innerHTML = html;
    elements.backlinks.hidden = html.length === 0;
  };

  const renderChrome = (route, doc) => {
    setHtml(elements.breadcrumb, renderers.breadcrumb(route));
    setText(elements.title, doc.title);
    setHtml(elements.meta, renderers.meta(doc));
    updateBacklinks(doc);
    setHtml(elements.nav, renderers.nav(navigation.view, doc.id, pathBase));
  };

  const finishNavigation = async (doc) => {
    await lifecycle.enhanceContent?.(elements.content);
    setPageTitle(renderers.documentTitle(doc.title, siteTitle));
    elements.viewer?.scrollTo?.(0, 0);
    lifecycle.announce?.(`탐색 완료: ${doc.title} 문서를 열었습니다.`);
  };

  const renderMissingRoute = (route, push) => {
    navigation.setCurrentDocId("");
    lifecycle.onMissingSelection?.();
    setHtml(elements.breadcrumb, renderers.breadcrumb(route));
    setText(elements.title, "문서를 찾을 수 없습니다");
    setHtml(elements.meta, "");
    setHtml(elements.content, '<p class="placeholder">요청한 경로에 해당하는 문서가 없습니다.</p>');
    updateBacklinks(null);
    setHtml(elements.nav, "");
    lifecycle.announce?.("탐색 실패: 요청한 문서를 찾을 수 없습니다.");
    if (push) {
      historyApi?.pushState?.(null, "", toPathWithBase(route, pathBase));
    }
  };

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
      updateBacklinks(null);
      setHtml(elements.nav, "");
      lifecycle.announce?.(`탐색 실패: ${resolved.doc.title} 문서를 불러오지 못했습니다.`);
      return false;
    }

    setHtml(elements.content, await response.text());
    await finishNavigation(resolved.doc);
    return true;
  };

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
