import { expect, test } from "@playwright/test";
import { waitForAppReady, waitForTreeReady } from "./utils/app-ready";
import { getInitialManifest } from "./utils/manifest";

test.describe("purposeful sidebar chrome", () => {
  test("uses one keyboard-accessible branch control and removes static status chrome", async ({
    page,
  }) => {
    await page.goto("/BC-VO-00/");
    await waitForAppReady(page);
    await waitForTreeReady(page);
    const manifest = await getInitialManifest(page);

    const branchSelect = page.getByRole("combobox", { name: "Branch" });
    await expect(branchSelect).toBeVisible();
    await expect(branchSelect).toHaveValue(manifest.defaultBranch);
    await expect(branchSelect.locator("option")).toHaveCount(2);
    await expect(branchSelect.locator("option").first()).toContainText("(default)");

    for (const removedChrome of [
      ".icon-terminal",
      ".branch-badge",
      ".branch-pill",
      ".status-online",
      ".status-encoding",
      ".sidebar-footer",
    ]) {
      await expect(page.locator(removedChrome)).toHaveCount(0);
    }

    await branchSelect.focus();
    await branchSelect.press("End");
    await expect(branchSelect).toHaveValue("main");
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("fsblog.branch")))
      .toBe("main");

    await branchSelect.focus();
    await branchSelect.press("Home");
    await expect(branchSelect).toHaveValue(manifest.defaultBranch);
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("fsblog.branch")))
      .toBe(manifest.defaultBranch);
  });

  test("keeps purposeful search, prefix, and settings affordances available", async ({ page }) => {
    await page.goto("/BC-VO-00/");
    await waitForAppReady(page);
    await waitForTreeReady(page);

    const searchActions = page.locator("#sidebar-search-actions");
    await expect(searchActions).toBeHidden();
    await page.locator("#tree-search-input").fill("About");
    await expect(searchActions).toBeVisible();
    await expect(page.locator("#tree-search-count")).toContainText("개 일치");

    const prefix = page.locator("#tree-root .tree-item-prefix").first();
    await expect(prefix).toBeVisible();
    await expect(page.locator("#tree-root .tree-item-prefix-badge")).toHaveCount(0);

    const settingsToggle = page.getByRole("button", { name: "탐색기 설정 열기" });
    await expect(settingsToggle).toBeVisible();
    await settingsToggle.click();
    await expect(page.locator("#sidebar-settings")).toBeVisible();
    await page.locator("#settings-close").click();
    await expect(page.locator("#sidebar-settings")).toBeHidden();
  });
});
