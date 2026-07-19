import { createEventScope } from "./controller-lifecycle.js";

const THEME_MODE_KEY = "fsblog.themeMode";
const DARK_MODE_QUERY = "(prefers-color-scheme: dark)";

/** @typedef {import("./contracts").EventScope} EventScope */
/** @typedef {import("./contracts").RuntimeWindow} RuntimeWindow */
/** @typedef {import("./contracts").SettingsController} SettingsController */
/** @typedef {"light" | "dark" | "system"} ThemeMode */

/**
 * @param {unknown} mode
 * @returns {ThemeMode}
 */
export function normalizeThemeMode(mode) {
  if (mode === "light" || mode === "dark" || mode === "system") {
    return mode;
  }
  return "system";
}

/**
 * @param {ThemeMode} mode
 * @param {boolean} prefersDark
 * @returns {"light" | "dark"}
 */
export function resolveAppliedTheme(mode, prefersDark) {
  if (mode === "system") {
    return prefersDark ? "dark" : "light";
  }
  return mode;
}

/**
 * @param {{ documentRef?: Document; windowRef?: RuntimeWindow; storage?: Storage }} [options]
 * @returns {SettingsController}
 */
export function createSettingsController(options = {}) {
  const documentRef = options.documentRef ?? globalThis.document;
  const windowRef = options.windowRef ?? globalThis.window;
  const storage = options.storage ?? globalThis.localStorage;
  const settingsToggle = documentRef.getElementById("settings-toggle");
  const settingsClose = documentRef.getElementById("settings-close");
  const settingsPanel = documentRef.getElementById("sidebar-settings");
  const themeModeInputs = Array.from(documentRef.querySelectorAll('input[name="theme-mode"]'));
  const darkModeMediaQuery = windowRef.matchMedia(DARK_MODE_QUERY);
  /** @type {EventScope | null} */
  let events = null;
  /** @type {ThemeMode} */
  let themeMode = "system";

  /** @param {boolean} expanded */
  const setSettingsExpanded = (expanded) => {
    settingsToggle?.setAttribute("aria-expanded", String(expanded));
  };

  const close = () => {
    if (!settingsPanel || settingsPanel.hidden) {
      return;
    }
    settingsPanel.hidden = true;
    setSettingsExpanded(false);
  };

  const open = () => {
    if (!settingsPanel) {
      return;
    }
    settingsPanel.hidden = false;
    setSettingsExpanded(true);
    const checkedInput = settingsPanel.querySelector('input[name="theme-mode"]:checked');
    if (checkedInput instanceof windowRef.HTMLElement) {
      checkedInput.focus();
    }
  };

  const toggle = () => {
    if (!settingsPanel) {
      return;
    }
    if (settingsPanel.hidden) {
      open();
    } else {
      close();
    }
  };

  const applyTheme = () => {
    const appliedTheme = resolveAppliedTheme(themeMode, darkModeMediaQuery.matches);
    documentRef.documentElement.dataset.theme = appliedTheme;
    documentRef.documentElement.style.colorScheme = appliedTheme;
  };

  /** @param {Event} event */
  const handleThemeModeChange = (event) => {
    const input = event.currentTarget;
    if (!(input instanceof windowRef.HTMLInputElement) || !input.checked) {
      return;
    }
    themeMode = normalizeThemeMode(input.value);
    applyTheme();
    storage.setItem(THEME_MODE_KEY, themeMode);
  };

  const handleDarkModeChange = () => {
    if (themeMode === "system") {
      applyTheme();
    }
  };

  /** @param {Event} event */
  const handleOutsideClick = (event) => {
    if (!settingsPanel || settingsPanel.hidden) {
      return;
    }
    const target = event.target;
    if (!(target instanceof windowRef.Node)) {
      return;
    }
    const clickInPanel = settingsPanel.contains(target);
    const clickOnToggle = settingsToggle?.contains?.(target) ?? false;
    if (!clickInPanel && !clickOnToggle) {
      close();
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
    },
    setup() {
      if (events) {
        return;
      }

      themeMode = normalizeThemeMode(storage.getItem(THEME_MODE_KEY));
      applyTheme();

      for (const input of themeModeInputs) {
        if (input instanceof windowRef.HTMLInputElement) {
          input.checked = input.value === themeMode;
        }
      }

      events = createEventScope();
      events.listen(settingsToggle, "click", toggle);
      events.listen(settingsClose, "click", close);
      events.listen(documentRef, "click", handleOutsideClick);
      events.listen(darkModeMediaQuery, "change", handleDarkModeChange);
      for (const input of themeModeInputs) {
        events.listen(input, "change", handleThemeModeChange);
      }
    },
  };
}
