import { createEventScope } from "./controller-lifecycle.js";
import { getUiMessages } from "../i18n.ts";

const CONTENT_IMAGE_LANDSCAPE_CLASS = "is-landscape";
const CONTENT_IMAGE_PORTRAIT_CLASS = "is-portrait";
const CONTENT_IMAGE_SQUARE_CLASS = "is-square";
const CONTENT_IMAGE_LANDSCAPE_THRESHOLD = 1.1;
const CONTENT_IMAGE_PORTRAIT_THRESHOLD = 0.9;
/** @typedef {{ width: number; height: number }} ImageDimensions */
/** @typedef {import("./contracts").ContentEnhancementController} ContentEnhancementController */
/** @typedef {import("./contracts").EventScope} EventScope */
/** @typedef {import("./contracts").MermaidController} MermaidController */
/** @typedef {import("./contracts").RuntimeWindow} RuntimeWindow */
/** @typedef {import("../i18n").UiMessages} UiMessages */

/** @type {Map<string, Promise<ImageDimensions | null>>} */
const contentImageDimensionCache = new Map();

/** @param {Element | null | undefined} target */
function clearContentImageClasses(target) {
  target?.classList?.remove(
    CONTENT_IMAGE_LANDSCAPE_CLASS,
    CONTENT_IMAGE_PORTRAIT_CLASS,
    CONTENT_IMAGE_SQUARE_CLASS,
  );
}

/**
 * @param {unknown} image
 * @param {string} className
 * @param {RuntimeWindow} windowRef
 */
function syncContentImageClasses(image, className, windowRef) {
  if (!(image instanceof windowRef.HTMLImageElement)) {
    return;
  }

  clearContentImageClasses(image);
  image.classList.add(className);

  const figure = image.closest("figure");
  if (
    figure instanceof windowRef.HTMLElement &&
    (figure.classList.contains("content-image") || figure.classList.contains("image-frame"))
  ) {
    clearContentImageClasses(figure);
    figure.classList.add(className);
  }
}

/**
 * @param {unknown} imageLike
 * @param {RuntimeWindow} windowRef
 * @returns {ImageDimensions | null}
 */
function readIntrinsicImageDimensions(imageLike, windowRef) {
  if (!(imageLike instanceof windowRef.HTMLImageElement)) {
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

/**
 * @param {unknown} image
 * @param {ImageDimensions | null} dimensions
 * @param {RuntimeWindow} windowRef
 */
function classifyContentImageByDimensions(image, dimensions, windowRef) {
  if (!(image instanceof windowRef.HTMLImageElement) || !dimensions) {
    return;
  }

  const aspectRatio = dimensions.width / dimensions.height;
  if (aspectRatio >= CONTENT_IMAGE_LANDSCAPE_THRESHOLD) {
    syncContentImageClasses(image, CONTENT_IMAGE_LANDSCAPE_CLASS, windowRef);
    return;
  }

  if (aspectRatio <= CONTENT_IMAGE_PORTRAIT_THRESHOLD) {
    syncContentImageClasses(image, CONTENT_IMAGE_PORTRAIT_CLASS, windowRef);
    return;
  }

  syncContentImageClasses(image, CONTENT_IMAGE_SQUARE_CLASS, windowRef);
}

/**
 * @param {HTMLImageElement} image
 * @param {RuntimeWindow} windowRef
 * @returns {Promise<ImageDimensions | null>}
 */
function resolveContentImageDimensions(image, windowRef) {
  const immediate = readIntrinsicImageDimensions(image, windowRef);
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

  const pending = new Promise((/** @type {(value: ImageDimensions | null) => void} */ resolve) => {
    const probe = new windowRef.Image();
    const finalize = () => {
      resolve(readIntrinsicImageDimensions(probe, windowRef));
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

/**
 * @param {Element} image
 * @param {RuntimeWindow} windowRef
 */
function prepareContentImage(image, windowRef) {
  if (!(image instanceof windowRef.HTMLImageElement) || image.closest(".mermaid-block")) {
    return;
  }

  const figure = image.closest("figure");
  if (
    figure instanceof windowRef.HTMLElement &&
    (figure.classList.contains("content-image") || figure.classList.contains("image-frame"))
  ) {
    clearContentImageClasses(figure);
  }
  clearContentImageClasses(image);

  const handleError = () => {
    clearContentImageClasses(image);
    if (
      figure instanceof windowRef.HTMLElement &&
      (figure.classList.contains("content-image") || figure.classList.contains("image-frame"))
    ) {
      clearContentImageClasses(figure);
    }
  };
  const handleLoad = () => {
    resolveContentImageDimensions(image, windowRef)
      .then((dimensions) => {
        if (!dimensions) {
          handleError();
          return;
        }
        classifyContentImageByDimensions(image, dimensions, windowRef);
      })
      .catch(handleError);
  };

  image.addEventListener("load", handleLoad, { once: true });
  image.addEventListener("error", handleError, { once: true });

  if (image.complete) {
    handleLoad();
  }
}

/**
 * @param {ParentNode | null | undefined} root
 * @param {RuntimeWindow} [windowRef]
 */
export function enhanceContentImages(root, windowRef = globalThis.window) {
  if (!root?.querySelectorAll) {
    return;
  }

  for (const image of root.querySelectorAll("img")) {
    prepareContentImage(image, windowRef);
  }
}

/**
 * @param {{ root: HTMLElement | null; mermaidController: MermaidController; messages?: UiMessages; clipboard?: Pick<Clipboard, "writeText">; windowRef?: RuntimeWindow }} options
 * @returns {ContentEnhancementController}
 */
export function createContentEnhancementController(options) {
  const {
    root,
    mermaidController,
    messages = getUiMessages(),
    clipboard = globalThis.navigator?.clipboard,
    windowRef = globalThis.window,
  } = options;
  /** @type {EventScope | null} */
  let events = null;
  /** @type {Set<number>} */
  const resetTimers = new Set();

  /** @param {Event} event */
  const handleCopyClick = async (event) => {
    const target = event.target;
    if (!(target instanceof windowRef.Element)) {
      return;
    }

    const button = target.closest(".code-copy");
    if (!(button instanceof windowRef.HTMLButtonElement) || !root?.contains(button)) {
      return;
    }

    const code = button.dataset.code;
    if (!code) {
      return;
    }

    try {
      if (typeof clipboard?.writeText !== "function") {
        throw new Error("Clipboard API is unavailable");
      }
      await clipboard.writeText(code);
      button.classList.add("copied");
      button.setAttribute("aria-label", messages.copied);
      button.setAttribute("title", messages.copied);
      const iconUse = button.querySelector(".app-icon use");
      if (iconUse instanceof windowRef.Element) {
        iconUse.setAttribute("href", "#eiam-icon-check");
      }
      const timer = windowRef.setTimeout(() => {
        resetTimers.delete(timer);
        button.classList.remove("copied");
        button.setAttribute("aria-label", messages.copyCode);
        button.setAttribute("title", messages.copyCode);
        const nextIconUse = button.querySelector(".app-icon use");
        if (nextIconUse instanceof windowRef.Element) {
          nextIconUse.setAttribute("href", "#eiam-icon-copy");
        }
      }, 2000);
      resetTimers.add(timer);
    } catch (error) {
      console.error("Copy failed:", error);
    }
  };

  return {
    setup() {
      if (events) {
        return;
      }
      events = createEventScope();
      events.listen(root, "click", handleCopyClick);
      mermaidController.setup();
    },
    destroy() {
      if (!events) {
        return;
      }
      events.cleanup();
      events = null;
      for (const timer of resetTimers) {
        windowRef.clearTimeout(timer);
      }
      resetTimers.clear();
      mermaidController.destroy();
    },
    async enhance(target = root) {
      enhanceContentImages(target, windowRef);
      await mermaidController.render(target);
    },
  };
}
