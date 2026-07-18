import { expect, test } from "@playwright/test";
import { waitForAppReady, waitForTreeReady } from "./utils/app-ready";

const TREE_MODULE_PATTERN = /\/assets\/tree\.[a-f0-9]{12}\.js(?:\?.*)?$/;

test.describe("deferred tree runtime", () => {
  test("tree chunk 실패가 SSR content를 막지 않고 fallback 탐색과 재시도를 제공한다", async ({ page }) => {
    let treeRequestCount = 0;
    await page.route(TREE_MODULE_PATTERN, async (route) => {
      treeRequestCount += 1;
      if (treeRequestCount === 1) {
        await route.abort("failed");
        return;
      }
      await route.continue();
    });

    await page.goto("/BC-VO-00/");
    await waitForAppReady(page);

    await expect(page.locator("#viewer-title")).toHaveText("About");
    await expect(page.locator("#viewer-content")).not.toBeEmpty();
    await expect(page.locator("html")).toHaveAttribute("data-tree-runtime", "error");
    expect(treeRequestCount).toBe(1);

    const timing = await page.evaluate(() => {
      const mark = (name: string) => performance.getEntriesByName(name).at(-1)?.startTime ?? -1;
      return {
        appReady: mark("eiam-app-ready"),
        firstPaintOpportunity: mark("eiam-first-content-paint-opportunity"),
        firstContentfulPaint:
          performance.getEntriesByType("paint").find((entry) => entry.name === "first-contentful-paint")
            ?.startTime ?? -1,
        treeLoadStart: mark("eiam-tree-load-start"),
      };
    });
    expect(timing.appReady).toBeGreaterThanOrEqual(0);
    expect(timing.firstPaintOpportunity).toBeGreaterThan(timing.appReady);
    expect(timing.treeLoadStart).toBeGreaterThanOrEqual(timing.firstPaintOpportunity);
    if (timing.firstContentfulPaint >= 0) {
      expect(timing.treeLoadStart).toBeGreaterThanOrEqual(timing.firstContentfulPaint);
    }

    const fallback = page.locator("#tree-root .tree-load-fallback");
    await expect(fallback).toBeVisible();
    await expect(fallback.getByRole("button", { name: "탐색기 다시 불러오기" })).toBeVisible();
    const setupGuideLink = fallback.locator('a[href$="/BC-VO-02/"]');
    await expect(setupGuideLink).toBeVisible();
    await setupGuideLink.click();
    await expect(page).toHaveURL(/\/BC-VO-02\/$/);
    await expect(page.locator("#viewer-title")).toHaveText("Setup Guide");

    await fallback.getByRole("button", { name: "탐색기 다시 불러오기" }).click();
    await waitForTreeReady(page);
    expect(treeRequestCount).toBe(2);
    await expect(page.locator("#tree-root file-tree-container")).toBeVisible();
  });

  test("compact layout은 sidebar interaction 전에는 tree chunk를 요청하지 않는다", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    let treeRequestCount = 0;
    page.on("request", (request) => {
      if (TREE_MODULE_PATTERN.test(request.url())) {
        treeRequestCount += 1;
      }
    });

    await page.goto("/BC-VO-01/");
    await waitForAppReady(page);
    await page.waitForTimeout(250);

    expect(treeRequestCount).toBe(0);
    await expect(page.locator("html")).toHaveAttribute("data-tree-runtime", "idle");
    await expect(page.locator("#viewer-title")).not.toBeEmpty();

    await page.getByRole("button", { name: "탐색기 열기" }).click();
    await waitForTreeReady(page);

    expect(treeRequestCount).toBe(1);
    await expect(page.locator("#sidebar-panel")).toHaveAttribute("role", "dialog");
    await expect(page.locator("#tree-root file-tree-container")).toBeVisible();
  });
});
