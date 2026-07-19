import { expect, test } from "@playwright/test";
import { waitForAppReady, waitForTreeReady } from "./utils/app-ready";

test.describe("Trees sidebar search", () => {
  test("검색 결과를 필터링하고 clear 후 일반 트리로 복귀한다", async ({ page }) => {
    await page.goto("/");
    await waitForAppReady(page);
    await waitForTreeReady(page);

    const searchInput = page.locator("#tree-search-input");
    const searchCount = page.locator("#tree-search-count");
    const searchClear = page.locator("#tree-search-clear");
    const searchNext = page.locator("#tree-search-next");
    const setupRow = page
      .locator('#tree-root [data-type="item"][data-item-type="file"][data-item-path="Recent/BC-VO-02 Setup Guide"]')
      .first();

    await expect(searchInput).toBeVisible();
    await expect(setupRow).toBeVisible();

    await searchInput.fill("Unsafe");

    await expect(searchCount).toHaveText(/[1-9]\d*개 일치/);
    await expect(searchClear).toBeVisible();
    await expect(searchNext).toBeEnabled();
    await expect(setupRow).toBeHidden();

    const unsafeRow = page
      .locator('#tree-root [data-type="item"][data-item-type="file"]')
      .filter({ hasText: "Unsafe" })
      .first();
    await expect(unsafeRow).toBeVisible();

    await searchNext.click();
    await expect(
      page.locator('#tree-root [data-type="item"][data-item-type="file"][data-item-focused="true"]').first(),
    ).toContainText("Unsafe");

    await unsafeRow.click();
    await expect(page).toHaveURL(/\/BC-XSS-01\/$/);
    await expect(page.locator("#viewer-title")).toContainText("Unsafe");

    await searchClear.click();
    await expect(searchInput).toHaveValue("");
    await expect(searchCount).toHaveText("");
    await expect(setupRow).toBeVisible();
  });
});
