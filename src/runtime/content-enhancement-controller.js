import { createEventScope } from "./controller-lifecycle.js";

const CONTENT_IMAGE_LANDSCAPE_CLASS = "is-landscape";
const CONTENT_IMAGE_PORTRAIT_CLASS = "is-portrait";
const CONTENT_IMAGE_SQUARE_CLASS = "is-square";
const CONTENT_IMAGE_LANDSCAPE_THRESHOLD = 1.1;
const CONTENT_IMAGE_PORTRAIT_THRESHOLD = 0.9;
const contentImageDimensionCache = new Map();

function clearContentImageClasses(target) {
  target?.classList?.remove(
    CONTENT_IMAGE_LANDSCAPE_CLASS,
    CONTENT_IMAGE_PORTRAIT_CLASS,
    CONTENT_IMAGE_SQUARE_CLASS,
  );
}

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

  const pending = new Promise((resolve) => {
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

export function enhanceContentImages(root, windowRef = globalThis.window) {
  if (!root?.querySelectorAll) {
    return;
  }

  for (const image of root.querySelectorAll("img")) {
    prepareContentImage(image, windowRef);
  }
}

export function createContentEnhancementController(options) {
  const {
    root,
    mermaidController,
    clipboard = globalThis.navigator?.clipboard,
    windowRef = globalThis.window,
  } = options;
  let events = null;
  const resetTimers = new Set();

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
      const icon = button.querySelector(".material-symbols-outlined");
      if (icon instanceof windowRef.HTMLElement) {
        icon.textContent = "check";
      }
      const timer = windowRef.setTimeout(() => {
        resetTimers.delete(timer);
        button.classList.remove("copied");
        const nextIcon = button.querySelector(".material-symbols-outlined");
        if (nextIcon instanceof windowRef.HTMLElement) {
          nextIcon.textContent = "content_copy";
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
