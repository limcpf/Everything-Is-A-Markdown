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

    const navNextTitle = page.locator("#viewer-nav .nav-link-next .nav-link-title");
    await expect(navNextTitle).toContainText("Unsafe");
    await expect(navNextTitle.locator("img")).toHaveCount(0);

    const treeXssRow = page.locator('.tree-file-row[data-route="/BC-XSS-01/"]').first();
    await expect(treeXssRow).toBeVisible();
    await expect(treeXssRow.locator("img")).toHaveCount(0);

    const xssFlag = await page.evaluate(() => (window as Window & { __xss_title?: number }).__xss_title ?? 0);
    expect(xssFlag).toBe(0);
  });
});
