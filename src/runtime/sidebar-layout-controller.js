import { createEventScope } from "./controller-lifecycle.js";

const COMPACT_LAYOUT_QUERY = "(max-width: 1024px)";
const SIDEBAR_WIDTH_KEY = "fsblog.desktopSidebarWidth";
const DESKTOP_SIDEBAR_DEFAULT = 420;
const DESKTOP_SIDEBAR_MIN = 320;
const DESKTOP_VIEWER_MIN = 680;
const DESKTOP_SPLITTER_WIDTH = 10;
const DESKTOP_SPLITTER_STEP = 24;
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function getFocusableElements(container, windowRef) {
  if (!container) {
    return [];
  }

  const candidates = [];
  const collect = (root) => {
    for (const element of root.querySelectorAll("*")) {
      if (!(element instanceof windowRef.HTMLElement)) {
        continue;
      }
      if (element.matches(FOCUSABLE_SELECTOR)) {
        candidates.push(element);
      }
      if (element.shadowRoot) {
        collect(element.shadowRoot);
      }
    }
  };
  collect(container);

  return candidates.filter((element) => {
    if (element.hasAttribute("hidden") || element.getAttribute("aria-hidden") === "true") {
      return false;
    }
    if (element.closest("[hidden], [inert], [aria-hidden='true']")) {
      return false;
    }
    if (element instanceof windowRef.HTMLInputElement && element.type === "hidden") {
      return false;
    }
    const style = windowRef.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") {
      return false;
    }
    return element.getClientRects().length > 0;
  });
}

export function clampDesktopSidebarWidth(width, viewportWidth) {
  const max = Math.max(
    DESKTOP_SIDEBAR_MIN,
    viewportWidth - DESKTOP_VIEWER_MIN - DESKTOP_SPLITTER_WIDTH,
  );
  return Math.min(Math.max(width, DESKTOP_SIDEBAR_MIN), max);
}

export function createSidebarLayoutController(options = {}) {
  const documentRef = options.documentRef ?? globalThis.document;
  const windowRef = options.windowRef ?? globalThis.window;
  const storage = options.storage ?? globalThis.localStorage;
  const requestTreeLoad = options.requestTreeLoad ?? (() => Promise.resolve(false));
  const closeSettings = options.closeSettings ?? (() => {});
  const appRoot = documentRef.querySelector(".app-root");
  const splitter = documentRef.getElementById("app-splitter");
  const sidebar = documentRef.getElementById("sidebar-panel");
  const sidebarToggle = documentRef.getElementById("sidebar-toggle");
  const sidebarClose = documentRef.getElementById("sidebar-close");
  const sidebarOverlay = documentRef.getElementById("sidebar-overlay");
  const viewer = documentRef.querySelector(".viewer");
  const compactMediaQuery = windowRef.matchMedia(COMPACT_LAYOUT_QUERY);
  let events = null;
  let desktopSidebarWidth = DESKTOP_SIDEBAR_DEFAULT;
  let activeResizePointerId = null;
  let resizeStartX = 0;
  let resizeStartWidth = desktopSidebarWidth;

  const isCompact = () => compactMediaQuery.matches;

  const updateSplitterA11y = () => {
    if (!(splitter instanceof windowRef.HTMLElement)) {
      return;
    }
    const max = Math.max(
      DESKTOP_SIDEBAR_MIN,
      windowRef.innerWidth - DESKTOP_VIEWER_MIN - DESKTOP_SPLITTER_WIDTH,
    );
    splitter.setAttribute("aria-valuemin", String(DESKTOP_SIDEBAR_MIN));
    splitter.setAttribute("aria-valuemax", String(Math.round(max)));
    splitter.setAttribute("aria-valuenow", String(Math.round(desktopSidebarWidth)));
    splitter.setAttribute("aria-valuetext", `${Math.round(desktopSidebarWidth)}px`);
    splitter.setAttribute("aria-disabled", String(isCompact()));
  };

  const syncDesktopSidebarWidth = (persist) => {
    desktopSidebarWidth = clampDesktopSidebarWidth(desktopSidebarWidth, windowRef.innerWidth);
    if (appRoot instanceof windowRef.HTMLElement) {
      if (isCompact()) {
        appRoot.style.removeProperty("--sidebar-width");
      } else {
        appRoot.style.setProperty("--sidebar-width", `${Math.round(desktopSidebarWidth)}px`);
      }
    }
    updateSplitterA11y();
    if (persist) {
      storage.setItem(SIDEBAR_WIDTH_KEY, String(Math.round(desktopSidebarWidth)));
    }
  };

  const setViewerInteractiveState = (isInteractive) => {
    if (!(viewer instanceof windowRef.HTMLElement)) {
      return;
    }
    if (isInteractive) {
      viewer.removeAttribute("inert");
      viewer.removeAttribute("aria-hidden");
    } else {
      viewer.setAttribute("inert", "");
      viewer.setAttribute("aria-hidden", "true");
    }
  };

  const syncSidebarA11y = (isOpen) => {
    sidebarToggle?.setAttribute("aria-expanded", String(isOpen));
    sidebarOverlay?.setAttribute("aria-hidden", String(!isOpen));

    if (!(sidebar instanceof windowRef.HTMLElement)) {
      setViewerInteractiveState(true);
      return;
    }
    if (!isCompact()) {
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

  const open = () => {
    if (!(appRoot instanceof windowRef.HTMLElement) || !isCompact()) {
      return;
    }
    appRoot.classList.add("sidebar-open");
    if (sidebarOverlay) {
      sidebarOverlay.hidden = false;
    }
    documentRef.body.classList.add("menu-open");
    syncSidebarA11y(true);
    void requestTreeLoad("mobile-sidebar");
    getFocusableElements(sidebar, windowRef)[0]?.focus();
  };

  const close = () => {
    if (!(appRoot instanceof windowRef.HTMLElement)) {
      return;
    }
    appRoot.classList.remove("sidebar-open");
    if (sidebarOverlay) {
      sidebarOverlay.hidden = true;
    }
    closeSettings();
    documentRef.body.classList.remove("menu-open");
    syncSidebarA11y(false);
    if (sidebarToggle?.focus && isCompact()) {
      sidebarToggle.focus();
    }
  };

  const syncLayout = (requestDesktopTreeLoad) => {
    close();
    if (!isCompact()) {
      if (sidebarOverlay) {
        sidebarOverlay.hidden = true;
      }
      syncSidebarA11y(false);
      syncDesktopSidebarWidth(false);
      if (requestDesktopTreeLoad) {
        void requestTreeLoad("desktop-layout");
      }
      return;
    }
    syncDesktopSidebarWidth(false);
  };

  const handleLayoutChange = () => {
    syncLayout(true);
  };

  const beginSplitterResize = (event) => {
    if (
      !(splitter instanceof windowRef.HTMLElement) ||
      !(appRoot instanceof windowRef.HTMLElement) ||
      isCompact()
    ) {
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
    desktopSidebarWidth = resizeStartWidth + event.clientX - resizeStartX;
    syncDesktopSidebarWidth(false);
  };

  const endSplitterResize = (event) => {
    if (event.pointerId !== activeResizePointerId) {
      return;
    }
    if (splitter?.hasPointerCapture?.(event.pointerId)) {
      splitter.releasePointerCapture(event.pointerId);
    }
    appRoot?.classList?.remove("is-resizing");
    activeResizePointerId = null;
    syncDesktopSidebarWidth(true);
  };

  const handleSplitterKeydown = (event) => {
    if (isCompact()) {
      return;
    }
    const max = Math.max(
      DESKTOP_SIDEBAR_MIN,
      windowRef.innerWidth - DESKTOP_VIEWER_MIN - DESKTOP_SPLITTER_WIDTH,
    );
    let nextWidth = desktopSidebarWidth;
    if (event.key === "ArrowLeft") {
      nextWidth -= DESKTOP_SPLITTER_STEP;
    } else if (event.key === "ArrowRight") {
      nextWidth += DESKTOP_SPLITTER_STEP;
    } else if (event.key === "Home") {
      nextWidth = DESKTOP_SIDEBAR_MIN;
    } else if (event.key === "End") {
      nextWidth = max;
    } else {
      return;
    }
    event.preventDefault();
    desktopSidebarWidth = nextWidth;
    syncDesktopSidebarWidth(true);
  };

  const handleDocumentKeydown = (event) => {
    if (event.key === "Escape" && appRoot?.classList?.contains("sidebar-open")) {
      close();
      return;
    }
    if (
      event.key !== "Tab" ||
      !isCompact() ||
      !appRoot?.classList?.contains("sidebar-open")
    ) {
      return;
    }

    const focusables = getFocusableElements(sidebar, windowRef);
    if (focusables.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const activeElement = documentRef.activeElement;
    const activeInsideSidebar = activeElement instanceof windowRef.Node && sidebar?.contains(activeElement);
    if (!activeInsideSidebar) {
      event.preventDefault();
      first.focus();
    } else if (event.shiftKey && activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return {
    close,
    destroy() {
      if (!events) {
        return;
      }
      close();
      events.cleanup();
      events = null;
      if (activeResizePointerId != null && splitter?.hasPointerCapture?.(activeResizePointerId)) {
        splitter.releasePointerCapture(activeResizePointerId);
      }
      appRoot?.classList?.remove("is-resizing");
      activeResizePointerId = null;
    },
    isCompact,
    open,
    setup() {
      if (events) {
        return;
      }
      const storedWidth = Number.parseInt(storage.getItem(SIDEBAR_WIDTH_KEY) ?? "", 10);
      desktopSidebarWidth = Number.isFinite(storedWidth) ? storedWidth : DESKTOP_SIDEBAR_DEFAULT;
      events = createEventScope();
      events.listen(sidebarToggle, "click", open);
      events.listen(sidebarClose, "click", close);
      events.listen(sidebarOverlay, "click", close);
      events.listen(splitter, "pointerdown", beginSplitterResize);
      events.listen(splitter, "pointermove", updateSplitterResize);
      events.listen(splitter, "pointerup", endSplitterResize);
      events.listen(splitter, "pointercancel", endSplitterResize);
      events.listen(splitter, "keydown", handleSplitterKeydown);
      events.listen(windowRef, "resize", () => syncDesktopSidebarWidth(false));
      events.listen(compactMediaQuery, "change", handleLayoutChange);
      events.listen(documentRef, "keydown", handleDocumentKeydown);
      syncLayout(false);
    },
  };
}
