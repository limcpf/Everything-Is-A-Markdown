import { expect, test, type Page } from "@playwright/test";
import {
  composeViewDocumentTitle,
  createViewChromeModel,
  filterViewDocsByBranch,
  formatViewDateTime,
  normalizeViewTags,
  pickViewHomeRoute,
  renderViewChrome,
  toViewPathWithBase,
} from "../../src/view-contract";
import { waitForAppReady } from "./utils/app-ready";

const CHROME_IDS = ["viewer-breadcrumb", "viewer-meta", "viewer-backlinks", "viewer-nav"];

async function readChromeSnapshot(page: Page) {
  return page.evaluate((ids) => {
    const read = (id: string) => document.getElementById(id)?.innerHTML ?? null;
    const backlinks = document.getElementById("viewer-backlinks");
    return {
      breadcrumbHtml: read(ids[0]),
      metaHtml: read(ids[1]),
      backlinksHtml: read(ids[2]),
      navHtml: read(ids[3]),
      backlinksHidden: backlinks?.hidden ?? null,
      title: document.getElementById("viewer-title")?.textContent ?? null,
    };
  }, CHROME_IDS);
}

test.describe("shared SSR/client view contract", () => {
  test("presentation model은 date, tag, pathBase와 escaping 규칙을 한 번 적용한다", () => {
    const docs = [
      {
        id: "previous",
        route: "/Previous/",
        title: "Previous & safe",
        branch: "dev",
      },
      {
        id: "current",
        route: "/Unsafe <route>/",
        title: "Current",
        prefix: "  P<1>  ",
        date: "2026-07-19T10:30:00+09:00",
        tags: [" #alpha ", "<beta>", ""],
        branch: "dev",
        backlinks: [
          {
            route: "/Back link/",
            title: '<img src=x onerror="alert(1)">',
            prefix: " B&1 ",
          },
        ],
      },
    ];

    const model = createViewChromeModel({
      route: docs[1].route,
      doc: docs[1],
      docs,
      pathBase: "/docs 한글",
    });
    const rendered = renderViewChrome({
      route: docs[1].route,
      doc: docs[1],
      docs,
      pathBase: "/docs 한글",
    });

    expect(model.meta).toEqual({
      prefix: "P<1>",
      createdAt: "2026-07-19 01:30",
      tags: ["alpha", "<beta>"],
    });
    expect(model.navigation.previous?.href).toBe(
      "/docs%20%ED%95%9C%EA%B8%80/Previous/",
    );
    expect(model.backlinks[0].href).toBe(
      "/docs%20%ED%95%9C%EA%B8%80/Back%20link/",
    );
    expect(rendered.breadcrumbHtml).toContain("Unsafe &lt;route&gt;");
    expect(rendered.metaHtml).toContain("P&lt;1&gt;");
    expect(rendered.backlinksHtml).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(rendered.backlinksHtml).not.toContain("<img");
    expect(formatViewDateTime("invalid")).toBeNull();
    expect(normalizeViewTags("not-an-array")).toEqual([]);
    expect(toViewPathWithBase("/A B/", "/docs 한글")).toBe(
      "/docs%20%ED%95%9C%EA%B8%80/A%20B/",
    );
    expect(composeViewDocumentTitle("Current", "Site")).toBe("Current - Site");
  });

  test("SSR nav와 client navigation은 같은 branch projection과 home 선택을 사용한다", () => {
    const docs = [
      { id: "base", route: "/BASE/", title: "Base", date: "2026-07-17", branch: null },
      { id: "dev", route: "/DEV/", title: "Dev", date: "2026-07-19", branch: "dev" },
      { id: "main", route: "/MAIN/", title: "Main", date: "2026-07-20", branch: "main" },
    ];

    expect(filterViewDocsByBranch(docs, "dev", "dev").map((doc) => doc.id)).toEqual([
      "base",
      "dev",
    ]);
    expect(filterViewDocsByBranch(docs, "main", "dev").map((doc) => doc.id)).toEqual([
      "main",
    ]);
    expect(pickViewHomeRoute(filterViewDocsByBranch(docs, "dev", "dev"))).toBe("/DEV/");
  });

  test("동일한 SSR chrome은 초기 hydration에서 다시 쓰지 않는다", async ({ page }) => {
    await page.addInitScript((ids) => {
      const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, "innerHTML");
      const hydrationWindow = window as Window & { __eiamChromeWrites?: string[] };
      hydrationWindow.__eiamChromeWrites = [];
      if (!descriptor?.get || !descriptor.set) {
        hydrationWindow.__eiamChromeWrites.push("unsupported-innerHTML-descriptor");
        return;
      }
      const trackedIds = new Set(ids);
      Object.defineProperty(Element.prototype, "innerHTML", {
        configurable: descriptor.configurable,
        enumerable: descriptor.enumerable,
        get: descriptor.get,
        set(this: Element, value: string) {
          if (trackedIds.has(this.id)) {
            hydrationWindow.__eiamChromeWrites?.push(this.id);
          }
          descriptor.set?.call(this, value);
        },
      });
    }, CHROME_IDS);

    for (const route of ["/BC-VO-00/", "/BC-VO-01/"]) {
      await page.goto(route);
      await waitForAppReady(page);
      const writes = await page.evaluate(
        () => (window as Window & { __eiamChromeWrites?: string[] }).__eiamChromeWrites ?? [],
      );
      expect(writes, route).toEqual([]);
    }
  });

  test("direct-load와 client-navigation의 chrome snapshot이 동일하다", async ({ page, context }) => {
    await page.goto("/BC-VO-00/");
    await waitForAppReady(page);

    const link = page.locator("#viewer-nav .nav-link-next, #viewer-nav .nav-link-prev").first();
    const targetRoute = await link.getAttribute("data-route");
    if (!targetRoute) {
      throw new Error("snapshot 비교 대상 nav route를 찾지 못했습니다.");
    }

    const directPage = await context.newPage();
    await directPage.goto(targetRoute);
    await waitForAppReady(directPage);
    const directSnapshot = await readChromeSnapshot(directPage);

    await link.click();
    await expect(page).toHaveURL(new RegExp(`${targetRoute.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
    await expect(page.locator("#viewer-title")).toHaveText(directSnapshot.title ?? "");
    const clientSnapshot = await readChromeSnapshot(page);

    expect(clientSnapshot).toEqual(directSnapshot);
    await directPage.close();
  });
});
