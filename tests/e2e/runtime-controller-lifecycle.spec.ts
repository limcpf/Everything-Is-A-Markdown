import { expect, test } from "@playwright/test";
import { createContentEnhancementController } from "../../src/runtime/content-enhancement-controller.js";
import { createEventScope } from "../../src/runtime/controller-lifecycle.js";
import {
  createMermaidController,
  resolveMermaidConfig,
} from "../../src/runtime/mermaid-controller.js";
import { loadInitialViewData } from "../../src/runtime/runtime-bootstrap.js";
import {
  createSettingsController,
  normalizeThemeMode,
  resolveAppliedTheme,
} from "../../src/runtime/settings-controller.js";
import {
  clampDesktopSidebarWidth,
  createSidebarLayoutController,
} from "../../src/runtime/sidebar-layout-controller.js";
import { createTreeController } from "../../src/runtime/tree-controller.js";

type Listener = (event: Record<string, unknown>) => void;

class FakeTarget {
  listeners = new Map<string, Set<Listener>>();

  addEventListener(type: string, listener: Listener) {
    const listeners = this.listeners.get(type) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: Listener) {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type: string, init: Record<string, unknown> = {}) {
    const event = {
      target: this,
      currentTarget: this,
      preventDefault() {},
      stopPropagation() {},
      ...init,
    };
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }

  listenerCount(type: string) {
    return this.listeners.get(type)?.size ?? 0;
  }
}

class FakeClassList {
  values = new Set<string>();

  add(...values: string[]) {
    for (const value of values) this.values.add(value);
  }

  remove(...values: string[]) {
    for (const value of values) this.values.delete(value);
  }

  contains(value: string) {
    return this.values.has(value);
  }

  toggle(value: string, force?: boolean) {
    const enabled = force ?? !this.values.has(value);
    if (enabled) this.values.add(value);
    else this.values.delete(value);
    return enabled;
  }
}

class FakeElement extends FakeTarget {
  attributes = new Map<string, string>();
  children: FakeElement[] = [];
  classList = new FakeClassList();
  className = "";
  dataset: Record<string, string> = {};
  hidden = false;
  parentElement: FakeElement | null = null;
  shadowRoot = null;
  style: Record<string, unknown> & {
    setProperty(name: string, value: string): void;
    removeProperty(name: string): void;
  } = Object.assign(Object.create(null), {
    setProperty(name: string, value: string) {
      this[name] = value;
    },
    removeProperty(name: string) {
      delete this[name];
    },
  });
  textContent = "";
  type = "";
  value = "";
  checked = false;
  disabled = false;

  appendChild(child: FakeElement) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  append(...children: FakeElement[]) {
    for (const child of children) this.appendChild(child);
  }

  replaceChildren(...children: FakeElement[]) {
    this.children = [];
    this.append(...children);
  }

  querySelectorAll(selector: string): FakeElement[] {
    const descendants = this.children.flatMap((child) => [child, ...child.querySelectorAll("*")]);
    if (selector === "*") return descendants;
    return [];
  }

  querySelector(selector: string) {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  contains(target: unknown): boolean {
    return target === this || this.children.some((child) => child.contains(target));
  }

  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }

  getAttribute(name: string) {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name: string) {
    this.attributes.delete(name);
  }

  hasAttribute(name: string) {
    return this.attributes.has(name);
  }

  closest() {
    return null;
  }

  focus() {}

  matches() {
    return false;
  }

  getClientRects() {
    return [{}];
  }

  remove() {
    if (this.parentElement) {
      this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
      this.parentElement = null;
    }
  }
}

class FakeInput extends FakeElement {}

class FakeMediaQuery extends FakeTarget {
  constructor(public matches: boolean) {
    super();
  }
}

class FakeStorage {
  values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

function createFakeWindow(mediaQueries = new Map<string, FakeMediaQuery>()) {
  const target = new FakeTarget();
  return Object.assign(target, {
    Element: FakeElement,
    HTMLElement: FakeElement,
    HTMLButtonElement: FakeElement,
    HTMLImageElement: FakeElement,
    HTMLInputElement: FakeInput,
    HTMLScriptElement: FakeElement,
    Node: FakeElement,
    SVGElement: FakeElement,
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
    clearTimeout,
    getComputedStyle: () => ({ display: "block", visibility: "visible" }),
    innerWidth: 1440,
    location: { href: "https://example.test/", origin: "https://example.test", pathname: "/" },
    matchMedia: (query: string) => {
      const mediaQuery = mediaQueries.get(query) ?? new FakeMediaQuery(false);
      mediaQueries.set(query, mediaQuery);
      return mediaQuery;
    },
    performance: { mark() {} },
    queueMicrotask,
    requestAnimationFrame: () => 1,
    cancelAnimationFrame() {},
    setTimeout,
  });
}

function createFakeDocument() {
  const target = new FakeTarget();
  const elements = new Map<string, FakeElement>();
  const body = new FakeElement();
  const documentElement = new FakeElement();
  const appRoot = new FakeElement();
  const viewer = new FakeElement();
  const inputs = {
    menu: [
      Object.assign(new FakeInput(), { value: "left" }),
      Object.assign(new FakeInput(), { value: "right" }),
    ],
    theme: [
      Object.assign(new FakeInput(), { value: "system" }),
      Object.assign(new FakeInput(), { value: "light" }),
      Object.assign(new FakeInput(), { value: "dark" }),
    ],
  };
  return Object.assign(target, {
    activeElement: null,
    baseURI: "https://example.test/",
    body,
    documentElement,
    elements,
    inputs,
    register(id: string, element = new FakeElement()) {
      elements.set(id, element);
      return element;
    },
    createElement() {
      return new FakeElement();
    },
    getElementById(id: string) {
      return elements.get(id) ?? null;
    },
    querySelector(selector: string) {
      if (selector === ".app-root") return appRoot;
      if (selector === ".viewer") return viewer;
      return null;
    },
    querySelectorAll(selector: string) {
      if (selector === 'input[name="menu-toggle-position"]') return inputs.menu;
      if (selector === 'input[name="theme-mode"]') return inputs.theme;
      return [];
    },
  });
}

test.describe("runtime controller module contracts", () => {
  test("event scope는 등록한 listener를 한 번에 정리한다", () => {
    const target = new FakeTarget();
    const listener = () => {};
    const events = createEventScope();
    events.listen(target, "click", listener);
    events.listen(target, "keydown", listener);
    expect(events.size).toBe(2);
    expect(target.listenerCount("click")).toBe(1);

    events.cleanup();
    events.cleanup();
    expect(events.size).toBe(0);
    expect(target.listenerCount("click")).toBe(0);
    expect(target.listenerCount("keydown")).toBe(0);
  });

  test("content enhancement controller setup/destroy는 중복 listener를 만들지 않는다", async () => {
    const root = new FakeElement();
    const calls = { setup: 0, destroy: 0, render: 0 };
    const controller = createContentEnhancementController({
      root,
      windowRef: createFakeWindow(),
      clipboard: { async writeText() {} },
      mermaidController: {
        setup() {
          calls.setup += 1;
        },
        destroy() {
          calls.destroy += 1;
        },
        async render() {
          calls.render += 1;
        },
      },
    });

    controller.setup();
    controller.setup();
    expect(root.listenerCount("click")).toBe(1);
    expect(calls.setup).toBe(1);
    await controller.enhance(root);
    expect(calls.render).toBe(1);

    controller.destroy();
    controller.destroy();
    expect(root.listenerCount("click")).toBe(0);
    expect(calls.destroy).toBe(1);
  });

  test("settings와 layout controller는 setup/destroy를 독립적으로 반복할 수 있다", () => {
    const documentRef = createFakeDocument();
    const mediaQueries = new Map<string, FakeMediaQuery>([
      ["(prefers-color-scheme: dark)", new FakeMediaQuery(false)],
      ["(max-width: 1024px)", new FakeMediaQuery(false)],
    ]);
    const windowRef = createFakeWindow(mediaQueries);
    const storage = new FakeStorage();
    const settingsToggle = documentRef.register("settings-toggle");
    documentRef.register("settings-close");
    const settingsPanel = documentRef.register("sidebar-settings");
    settingsPanel.hidden = true;
    documentRef.register("app-splitter");
    documentRef.register("sidebar-panel");
    documentRef.register("sidebar-toggle");
    documentRef.register("sidebar-close");
    documentRef.register("sidebar-overlay");

    const settings = createSettingsController({ documentRef, windowRef, storage });
    const treeLoadReasons: string[] = [];
    const layout = createSidebarLayoutController({
      documentRef,
      windowRef,
      storage,
      closeSettings: settings.close,
      requestTreeLoad(reason: string) {
        treeLoadReasons.push(reason);
        return Promise.resolve(true);
      },
    });

    settings.setup();
    settings.setup();
    layout.setup();
    layout.setup();
    expect(settingsToggle.listenerCount("click")).toBe(1);
    expect(windowRef.listenerCount("resize")).toBe(1);
    expect(treeLoadReasons).toEqual([]);
    expect(documentRef.documentElement.dataset.theme).toBe("light");

    mediaQueries.get("(max-width: 1024px)")?.emit("change");
    expect(treeLoadReasons).toEqual(["desktop-layout"]);

    settingsToggle.emit("click");
    expect(settingsPanel.hidden).toBe(false);
    settings.close();
    expect(settingsPanel.hidden).toBe(true);

    layout.destroy();
    layout.destroy();
    settings.destroy();
    settings.destroy();
    expect(settingsToggle.listenerCount("click")).toBe(0);
    expect(windowRef.listenerCount("resize")).toBe(0);
  });

  test("tree controller lifecycle은 branch UI와 search listener를 소유한다", () => {
    const documentRef = createFakeDocument();
    const windowRef = createFakeWindow();
    const branchSelect = documentRef.register("sidebar-branch-select");
    documentRef.register("tree-root");
    const search = documentRef.register("tree-search-input");
    documentRef.register("tree-search-clear");
    documentRef.register("tree-search-prev");
    documentRef.register("tree-search-next");
    documentRef.register("tree-search-count");
    const searchActions = documentRef.register("sidebar-search-actions");
    const navigation = {
      activeBranch: "dev",
      availableBranches: ["dev", "main"],
      currentDocId: "",
      defaultBranch: "dev",
      view: {
        docs: [],
        routeMap: {},
        trees: {
          docIdToPrimaryTreePath: new Map(),
          metadataByTreePath: new Map(),
          paths: [],
          treePathToRoute: new Map(),
        },
      },
      setActiveBranch() {
        return true;
      },
    };
    const controller = createTreeController({
      navigation,
      pathBase: "",
      treeModuleUrl: "",
      navigate: async () => true,
      documentRef,
      windowRef,
      storage: new FakeStorage(),
    });

    controller.setup();
    controller.setup();
    expect(branchSelect.children).toHaveLength(2);
    expect(branchSelect.children.map((option) => option.textContent)).toEqual([
      "dev (기본값)",
      "main",
    ]);
    expect(branchSelect.value).toBe("dev");
    expect(branchSelect.listenerCount("change")).toBe(1);
    expect(search.listenerCount("input")).toBe(1);
    expect(searchActions.hidden).toBe(true);

    controller.destroy();
    controller.destroy();
    expect(branchSelect.listenerCount("change")).toBe(0);
    expect(search.listenerCount("input")).toBe(0);
  });

  test("controller pure contracts와 bootstrap parser는 독립 import로 검증된다", () => {
    expect(normalizeThemeMode("unexpected")).toBe("system");
    expect(resolveAppliedTheme("system", true)).toBe("dark");
    expect(clampDesktopSidebarWidth(900, 1200)).toBe(510);
    expect(resolveMermaidConfig({ mermaid: { cdnUrl: "", theme: "bad theme" } })).toMatchObject({
      enabled: true,
      cdnUrl: "https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js",
      theme: "default",
    });
    const mermaid = createMermaidController(
      { enabled: false, cdnUrl: "/mermaid.js", theme: "default" },
      {
        documentRef: {},
        windowRef: {},
      },
    );
    expect(typeof mermaid.setup).toBe("function");
    expect(typeof mermaid.destroy).toBe("function");

    const initialView = loadInitialViewData({
      getElementById: () => ({
        textContent: JSON.stringify({ route: "guide", docId: "guide", title: "Guide" }),
      }),
    });
    expect(initialView).toEqual({ route: "/guide/", docId: "guide", title: "Guide" });
  });
});
