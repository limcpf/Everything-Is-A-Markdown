import { DEFAULT_MERMAID_CONFIG } from "../defaults.ts";

const MERMAID_SELECTOR = "pre.mermaid";
const MERMAID_ERROR_CLASS = "mermaid-render-error";
const MERMAID_THEME_VALIDATION_RE = /^[a-zA-Z][a-zA-Z0-9._-]*$/;
const MERMAID_URL_VALIDATION_RE = /^(https?:\/\/|\/|\.{1,2}\/)[^\s"'<>]+$/;
const MERMAID_WIDE_RATIO = 2.4;
const MERMAID_TALL_RATIO = 0.85;
const MERMAID_BLOCK_WIDE_CLASS = "is-wide";
const MERMAID_BLOCK_TALL_CLASS = "is-tall";

/**
 * @typedef {import("./contracts").MermaidConfig} MermaidConfig
 * @typedef {import("./contracts").MermaidController} MermaidController
 * @typedef {import("./contracts").MermaidLibrary} MermaidLibrary
 * @typedef {import("./contracts").RuntimeManifest} RuntimeManifest
 * @typedef {import("./contracts").RuntimeWindow} RuntimeWindow
 */

/** @type {{ initialized: boolean; loadingPromise: Promise<MermaidLibrary | null> | null; scriptElement: HTMLScriptElement | null; lastCdnUrl: string; lastTheme: string }} */
const mermaidRuntime = {
  initialized: false,
  loadingPromise: null,
  scriptElement: null,
  lastCdnUrl: "",
  lastTheme: "",
};

/**
 * @param {RuntimeManifest | { mermaid?: Partial<MermaidConfig> } | null | undefined} manifest
 * @returns {MermaidConfig}
 */
export function resolveMermaidConfig(manifest) {
  const mermaid = manifest?.mermaid;
  return {
    enabled:
      typeof mermaid?.enabled === "boolean" ? mermaid.enabled : DEFAULT_MERMAID_CONFIG.enabled,
    cdnUrl:
      typeof mermaid?.cdnUrl === "string" && mermaid.cdnUrl.trim()
        ? mermaid.cdnUrl.trim()
        : DEFAULT_MERMAID_CONFIG.cdnUrl,
    theme:
      typeof mermaid?.theme === "string" && MERMAID_THEME_VALIDATION_RE.test(mermaid.theme.trim())
        ? mermaid.theme.trim()
        : DEFAULT_MERMAID_CONFIG.theme,
  };
}

/** @param {unknown} value */
function normalizeMermaidTheme(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized || !MERMAID_THEME_VALIDATION_RE.test(normalized)) {
    return DEFAULT_MERMAID_CONFIG.theme;
  }
  return normalized;
}

/** @param {unknown} value */
function normalizeMermaidUrl(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized || !MERMAID_URL_VALIDATION_RE.test(normalized)) {
    return DEFAULT_MERMAID_CONFIG.cdnUrl;
  }
  return normalized;
}

/**
 * @param {string} value
 * @param {RuntimeWindow} windowRef
 */
function toAbsoluteUrl(value, windowRef) {
  try {
    return new URL(value, windowRef.location.href).href;
  } catch {
    return value;
  }
}

/**
 * @param {string} message
 * @param {Document} documentRef
 */
function createMermaidLoadError(message, documentRef) {
  const paragraph = documentRef.createElement("p");
  paragraph.className = MERMAID_ERROR_CLASS;
  paragraph.textContent = message;
  return paragraph;
}

/** @param {ParentNode | null | undefined} container */
function removeMermaidErrorMessage(container) {
  if (!container?.querySelectorAll) {
    return;
  }

  for (const message of container.querySelectorAll(`.${MERMAID_ERROR_CLASS}`)) {
    message.remove();
  }
}

/**
 * @param {HTMLElement} preview
 * @param {string} message
 * @param {Document} documentRef
 */
function showMermaidError(preview, message, documentRef) {
  const container = preview?.parentElement;
  if (!container?.appendChild) {
    return;
  }

  removeMermaidErrorMessage(container);
  container.appendChild(createMermaidLoadError(message, documentRef));
}

/**
 * @param {HTMLElement} block
 * @param {RuntimeWindow} windowRef
 */
function normalizeRenderedMermaidSvg(block, windowRef) {
  const container = block?.parentElement;
  const svg = block?.querySelector?.("svg");
  if (!(svg instanceof windowRef.SVGElement)) {
    return;
  }

  container?.classList?.remove(MERMAID_BLOCK_WIDE_CLASS, MERMAID_BLOCK_TALL_CLASS);

  svg.style.display = "block";
  svg.style.width = "auto";
  svg.style.height = "auto";
  svg.style.margin = "0 auto";
  svg.style.maxWidth = "min(100%, var(--content-visual-max-width))";
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
    svg.style.maxWidth = "min(100%, var(--mermaid-wide-max-width))";
  }

  if (container && aspectRatio <= MERMAID_TALL_RATIO) {
    container.classList.add(MERMAID_BLOCK_TALL_CLASS);
    svg.style.maxHeight = "min(var(--mermaid-tall-max-height), 68vh)";
  }
}

/** @param {HTMLElement[]} nodes */
function resetMermaidNodes(nodes) {
  for (const node of nodes) {
    node.removeAttribute("data-mermaid-rendered");
    if (node.parentElement) {
      node.parentElement.classList.remove(MERMAID_BLOCK_WIDE_CLASS, MERMAID_BLOCK_TALL_CLASS);
      removeMermaidErrorMessage(node.parentElement);
    }
  }
}

/**
 * @param {MermaidConfig} config
 * @param {{ documentRef: Document; windowRef: RuntimeWindow }} environment
 * @returns {Promise<MermaidLibrary | null>}
 */
async function loadMermaidLibrary(config, { documentRef, windowRef }) {
  if (!config.enabled) {
    return null;
  }

  const normalized = {
    ...config,
    theme: normalizeMermaidTheme(config.theme),
    cdnUrl: normalizeMermaidUrl(config.cdnUrl),
  };

  if (windowRef.mermaid) {
    if (!mermaidRuntime.initialized || mermaidRuntime.lastTheme !== normalized.theme) {
      windowRef.mermaid.initialize({
        startOnLoad: false,
        theme: normalized.theme,
      });
      mermaidRuntime.initialized = true;
      mermaidRuntime.lastTheme = normalized.theme;
    }
    return windowRef.mermaid;
  }

  if (mermaidRuntime.loadingPromise) {
    return mermaidRuntime.loadingPromise;
  }

  const expectedAbsoluteUrl = toAbsoluteUrl(normalized.cdnUrl, windowRef);
  const existingScript = documentRef.getElementById("mermaid-runtime");
  if (existingScript instanceof windowRef.HTMLScriptElement) {
    existingScript.remove();
    mermaidRuntime.scriptElement = null;
    mermaidRuntime.initialized = false;
    mermaidRuntime.lastTheme = "";
    mermaidRuntime.lastCdnUrl = "";
  }

  mermaidRuntime.loadingPromise = new Promise((resolve, reject) => {
    let script = mermaidRuntime.scriptElement;
    if (!(script instanceof windowRef.HTMLScriptElement)) {
      script = documentRef.createElement("script");
      script.id = "mermaid-runtime";
      script.src = normalized.cdnUrl;
      script.async = true;
      script.crossOrigin = "anonymous";
      mermaidRuntime.scriptElement = script;
      mermaidRuntime.lastCdnUrl = expectedAbsoluteUrl;
    }

    /** @param {unknown} [error] */
    const finalize = (error) => {
      mermaidRuntime.loadingPromise = null;
      if (error) {
        if (mermaidRuntime.scriptElement instanceof windowRef.HTMLScriptElement) {
          mermaidRuntime.scriptElement.remove();
          mermaidRuntime.scriptElement = null;
        }
        mermaidRuntime.initialized = false;
        mermaidRuntime.lastTheme = "";
        mermaidRuntime.lastCdnUrl = "";
        reject(error);
        return;
      }
      resolve(windowRef.mermaid ?? null);
    };

    script.addEventListener("load", () => {
      if (
        windowRef.mermaid &&
        (!mermaidRuntime.initialized || mermaidRuntime.lastTheme !== normalized.theme)
      ) {
        windowRef.mermaid.initialize({
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
      documentRef.head.appendChild(script);
    }
  });

  return mermaidRuntime.loadingPromise;
}

/**
 * @param {MermaidConfig} config
 * @param {{ documentRef?: Document; windowRef?: RuntimeWindow }} [options]
 * @returns {MermaidController}
 */
export function createMermaidController(config, options = {}) {
  const documentRef = options.documentRef ?? globalThis.document;
  const windowRef = options.windowRef ?? globalThis.window;
  let isSetup = false;
  let lifecycleGeneration = 0;

  return {
    setup() {
      if (isSetup) {
        return;
      }
      isSetup = true;
      lifecycleGeneration += 1;
    },
    destroy() {
      if (!isSetup) {
        return;
      }
      isSetup = false;
      lifecycleGeneration += 1;
    },
    async render(root) {
      if (!isSetup || !root?.querySelectorAll) {
        return;
      }

      const renderGeneration = lifecycleGeneration;
      /** @type {HTMLElement[]} */
      const blocks = Array.from(root.querySelectorAll(MERMAID_SELECTOR)).filter(
        (block) => block instanceof windowRef.HTMLElement,
      );
      if (blocks.length === 0) {
        return;
      }

      resetMermaidNodes(blocks);

      try {
        const mermaid = await loadMermaidLibrary(config, { documentRef, windowRef });
        if (!isSetup || renderGeneration !== lifecycleGeneration) {
          return;
        }
        if (!mermaid) {
          for (const block of blocks) {
            showMermaidError(
              block,
              "Mermaid 렌더링이 비활성화되어 코드 블록을 그대로 표시합니다.",
              documentRef,
            );
          }
          return;
        }

        for (const block of blocks) {
          if (!isSetup || renderGeneration !== lifecycleGeneration) {
            return;
          }
          try {
            if (typeof mermaid.run === "function") {
              await mermaid.run({ nodes: [block] });
              normalizeRenderedMermaidSvg(block, windowRef);
              continue;
            }
            if (typeof mermaid.init === "function") {
              await mermaid.init({ startOnLoad: false }, [block]);
              normalizeRenderedMermaidSvg(block, windowRef);
              continue;
            }
            throw new Error("Mermaid 렌더러 API가 존재하지 않습니다.");
          } catch (error) {
            const message = `Mermaid 렌더링 실패: ${
              error instanceof Error ? error.message : String(error)
            }`;
            showMermaidError(block, message, documentRef);
          }
        }
      } catch (error) {
        if (!isSetup || renderGeneration !== lifecycleGeneration) {
          return;
        }
        const message = `Mermaid 렌더링 실패: ${
          error instanceof Error ? error.message : String(error)
        }`;
        for (const block of blocks) {
          showMermaidError(block, message, documentRef);
        }
      }
    },
  };
}
