import { expect, test } from "@playwright/test";
import { waitForAppReady } from "./utils/app-ready";

test.describe("런타임 렌더링 XSS 가드", () => {
  test("내비게이션/트리에서 악성 title이 HTML로 해석되지 않는다", async ({ page }) => {
    await page.addInitScript(() => {
      (window as Window & { __xss_title?: number }).__xss_title = 0;
    });

    await page.goto("/BC-VO-02/");
    await waitForAppReady(page);
    await expect(page.locator("#tree-root")).toBeVisible();
    await expect(
      page
        .locator(
          '#tree-root [data-type="item"][data-item-type="file"][data-item-selected][data-item-path="Recent/BC-VO-02 Setup Guide"]',
        )
        .first(),
    ).toBeVisible();

    const navNextTitle = page.locator("#viewer-nav .nav-link-next .nav-link-title");
    await expect(navNextTitle).toContainText("Unsafe");
    await expect(navNextTitle.locator("img")).toHaveCount(0);

    const treeXssRow = page
      .locator('#tree-root [data-type="item"][data-item-type="file"]')
      .filter({ hasText: "Unsafe" })
      .first();
    await expect(treeXssRow).toBeVisible();
    await expect(treeXssRow.locator("img")).toHaveCount(0);

    const xssFlag = await page.evaluate(() => (window as Window & { __xss_title?: number }).__xss_title ?? 0);
    expect(xssFlag).toBe(0);
  });

  test("raw HTML은 직접 route와 client navigation에서 같은 정책으로 sanitize된다", async ({ page }) => {
    await page.addInitScript(() => {
      const target = window as Window & {
        __raw_script?: number;
        __raw_event?: number;
        __raw_url?: number;
      };
      target.__raw_script = 0;
      target.__raw_event = 0;
      target.__raw_url = 0;
    });

    const assertSanitizedContent = async () => {
      await expect(page.locator("#viewer-content .raw-html-safe strong")).toHaveText("Allowed raw formatting");
      await expect(page.locator("#viewer-content script")).toHaveCount(0);
      await expect(page.locator("#viewer-content iframe")).toHaveCount(0);
      await expect(page.locator("#viewer-content [onerror]")).toHaveCount(0);
      await expect(page.locator("#viewer-content .raw-html-url")).not.toHaveAttribute("href", /javascript:/i);

      const flags = await page.evaluate(() => {
        const target = window as Window & {
          __raw_script?: number;
          __raw_event?: number;
          __raw_url?: number;
        };
        return [target.__raw_script ?? 0, target.__raw_event ?? 0, target.__raw_url ?? 0];
      });
      expect(flags).toEqual([0, 0, 0]);
    };

    await page.goto("/BC-XSS-01/");
    await waitForAppReady(page);
    await assertSanitizedContent();

    await page.goto("/BC-VO-02/");
    await waitForAppReady(page);
    const xssRow = page
      .locator('#tree-root [data-type="item"][data-item-type="file"]')
      .filter({ hasText: "Unsafe" })
      .first();
    await expect(xssRow).toBeVisible();
    await xssRow.click();
    await expect(page).toHaveURL(/\/BC-XSS-01\/$/);
    await expect(page.locator("#viewer-title")).toContainText("Unsafe");
    await assertSanitizedContent();
  });
});
