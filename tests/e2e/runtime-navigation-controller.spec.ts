import { expect, test } from "@playwright/test";
import { createContentController } from "../../src/runtime/content-controller.js";
import {
  createNavigationState,
  normalizePathBase,
  normalizeRoute,
  pickHomeRoute,
  stripPathBase,
  toPathWithBase,
} from "../../src/runtime/navigation-state.js";
import { waitForAppReady } from "./utils/app-ready";

function createManifest() {
  const docs = [
    {
      id: "base",
      route: "/BASE/",
      title: "Base",
      contentUrl: "/content/base.html",
      date: "2026-07-19",
      branch: null,
      backlinks: [],
    },
    {
      id: "dev",
      route: "/DEV/",
      title: "Dev",
      contentUrl: "/content/dev.html",
      date: "2026-07-18",
      branch: "dev",
      backlinks: [],
    },
    {
      id: "main",
      route: "/MAIN/",
      title: "Main",
      contentUrl: "/content/main.html",
      date: "2026-07-17",
      branch: "main",
      backlinks: [],
    },
  ];

  return {
    schemaVersion: 2,
    defaultBranch: "dev",
    branches: ["dev", "main"],
    ui: { newWithinDays: 0 },
    docIds: docs.map((doc) => doc.id),
    docsById: Object.fromEntries(docs.map((doc) => [doc.id, doc])),
    routeMap: Object.fromEntries(docs.map((doc) => [doc.route, doc.id])),
    tree: [
      {
        type: "folder",
        name: "Docs",
        path: "Docs",
        children: docs.map((doc) => ({ type: "file", name: `${doc.id}.md`, id: doc.id })),
      },
    ],
  };
}

class ListenerElement {
  innerHTML = "";
  textContent = "";
  hidden = false;
  added: string[] = [];
  removed: string[] = [];

  addEventListener(type: string) {
    this.added.push(type);
  }

  removeEventListener(type: string) {
    this.removed.push(type);
  }
}

test.describe("runtime navigation contracts", () => {
  test("branch, route, current document는 navigation state 한 곳에서 전환된다", () => {
    const navigation = createNavigationState(createManifest(), { savedBranch: "main" });

    expect(navigation.activeBranch).toBe("main");
    expect(navigation.view.docs.map((doc: { id: string }) => doc.id)).toEqual(["main"]);

    const resolved = navigation.resolve("/BASE");
    expect(resolved).toMatchObject({ route: "/BASE/", id: "base", branchChanged: true });
    expect(navigation.activeBranch).toBe("dev");
    expect(navigation.view.docs.map((doc: { id: string }) => doc.id)).toEqual(["base", "dev"]);

    navigation.setCurrentDocId("base");
    expect(navigation.currentDocId).toBe("base");
    expect(pickHomeRoute(navigation.view)).toBe("/BASE/");
    expect(navigation.setActiveBranch("unknown")).toBe(false);
    expect(navigation.activeBranch).toBe("dev");
  });

  test("pathBase 경로 규칙은 독립 모듈에서 정규화된다", () => {
    expect(normalizePathBase(" docs guides/한글/ ")).toBe("/docs guides/한글");
    expect(normalizeRoute("BASE")).toBe("/BASE/");
    expect(stripPathBase("/blog/BASE/", "/blog")).toBe("/BASE/");
    expect(toPathWithBase("/BASE/", "/docs guides/한글")).toBe(
      "/docs%20guides/%ED%95%9C%EA%B8%80/BASE/",
    );
  });

  test("content controller는 navigation 결과를 렌더하고 setup/destroy lifecycle을 제공한다", async () => {
    const navigation = createNavigationState(createManifest());
    const nav = new ListenerElement();
    const backlinks = new ListenerElement();
    const elements = {
      breadcrumb: new ListenerElement(),
      title: new ListenerElement(),
      meta: new ListenerElement(),
      content: new ListenerElement(),
      backlinks,
      nav,
      viewer: { scrollToCalls: 0, scrollTo() { this.scrollToCalls += 1; } },
    };
    const pushed: string[] = [];
    const announcements: string[] = [];
    let pageTitle = "";
    let enhanced = 0;

    const controller = createContentController({
      navigation,
      elements,
      initialViewData: null,
      pathBase: "/blog",
      siteTitle: "Site",
      renderers: {
        breadcrumb: (route: string) => `crumb:${route}`,
        meta: (doc: { id: string }) => `meta:${doc.id}`,
        backlinks: (doc: { id: string }) => `backlinks:${doc.id}`,
        nav: (_view: unknown, docId: string) => `nav:${docId}`,
        documentTitle: (title: string, siteTitle: string) => `${title} - ${siteTitle}`,
      },
      lifecycle: {
        async enhanceContent() { enhanced += 1; },
        announce(message: string) { announcements.push(message); },
      },
      fetchContent: async (url: string) => ({ ok: true, text: async () => `content:${url}` }),
      historyApi: { pushState: (_state: unknown, _unused: string, url: string) => pushed.push(url) },
      setPageTitle: (value: string) => { pageTitle = value; },
    });

    controller.setup();
    controller.setup();
    expect(nav.added).toEqual(["click"]);
    expect(backlinks.added).toEqual(["click"]);

    await controller.navigate("/BASE/", true);
    expect(navigation.currentDocId).toBe("base");
    expect(elements.breadcrumb.innerHTML).toBe("crumb:/BASE/");
    expect(elements.content.innerHTML).toBe("content:/blog/content/base.html");
    expect(elements.nav.innerHTML).toBe("nav:base");
    expect(pushed).toEqual(["/blog/BASE/"]);
    expect(pageTitle).toBe("Base - Site");
    expect(enhanced).toBe(1);
    expect(announcements.at(-1)).toContain("Base");

    controller.destroy();
    controller.destroy();
    expect(nav.removed).toEqual(["click"]);
    expect(backlinks.removed).toEqual(["click"]);
  });

  test("browser back/forward는 content controller의 popstate lifecycle을 따른다", async ({ page }) => {
    await page.goto("/BC-VO-00/");
    await waitForAppReady(page);

    const nextLink = page.locator("#viewer-nav .nav-link-next");
    const nextRoute = await nextLink.getAttribute("data-route");
    if (!nextRoute) {
      throw new Error("다음 문서 route를 찾지 못했습니다.");
    }

    await nextLink.click();
    await expect(page).toHaveURL(new RegExp(`${nextRoute.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));

    await page.goBack();
    await expect(page).toHaveURL(/\/BC-VO-00\/$/);
    await expect(page.locator("#viewer-title")).toHaveText("About");

    await page.goForward();
    await expect(page).toHaveURL(new RegExp(`${nextRoute.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
  });
});
