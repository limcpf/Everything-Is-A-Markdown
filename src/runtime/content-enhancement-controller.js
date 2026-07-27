import { createEventScope } from "./controller-lifecycle.js";
import { getUiMessages } from "../i18n.ts";

/** @typedef {import("./contracts").ContentEnhancementController} ContentEnhancementController */
/** @typedef {import("./contracts").EventScope} EventScope */
/** @typedef {import("./contracts").MermaidController} MermaidController */
/** @typedef {import("./contracts").RuntimeWindow} RuntimeWindow */
/** @typedef {import("../i18n").UiMessages} UiMessages */

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
      await mermaidController.render(target);
    },
  };
}
