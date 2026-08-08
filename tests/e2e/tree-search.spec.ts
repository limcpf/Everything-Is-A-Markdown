import { expect, test } from "@playwright/test";
import { waitForAppReady, waitForTreeReady } from "./utils/app-ready";

test.describe("Trees sidebar search", () => {
  test("상단 폴더를 접고 펴도 가상화 행에 이전 문서 라벨이 남지 않는다", async ({ page }) => {
    await page.goto("/");
    await waitForAppReady(page);
    await waitForTreeReady(page);

    const recentFolder = page
      .locator(
        '#tree-root [data-type="item"][data-item-type="folder"][data-item-path="최근 문서/"][aria-expanded]',
      )
      .first();
    const engineeringFolder = page
      .locator(
        '#tree-root [data-type="item"][data-item-type="folder"][data-item-path="engineering/"]',
      )
      .first();
    const setupRow = page
      .locator(
        '#tree-root [data-type="item"][data-item-type="file"][data-item-path="최근 문서/BC-VO-02 Setup Guide"]',
      )
      .first();
    const readVisibleLabelAnomalies = () =>
      page
        .locator('#tree-root [data-type="item"][data-item-type="file"][data-item-path]')
        .evaluateAll((rows) =>
          rows.flatMap((row) => {
            const treePath = row.getAttribute("data-item-path") ?? "";
            const expected = treePath.split("/").filter(Boolean).at(-1) ?? "";
            const content = row.querySelector<HTMLElement>('[data-item-section="content"]');
            const prefix = content?.dataset.eiamTreePrefix?.trim() ?? "";
            const title = content?.dataset.eiamTreeTitle?.trim() ?? "";
            const visible = `${prefix}${prefix ? " " : ""}${title}`.trim();
            const accessible = row.getAttribute("aria-label")?.replace(/\s+/g, " ").trim() ?? "";
            const nativeLabel = content?.querySelector<HTMLElement>(
              '[data-truncate-group-container="middle"]',
            );
            const nativeHidden = nativeLabel
              ? getComputedStyle(nativeLabel).display === "none"
              : false;
            return visible === expected && accessible === expected && nativeHidden
              ? []
              : [{ treePath, expected, visible, accessible, nativeHidden }];
          }),
        );

    await expect(recentFolder).toHaveAttribute("aria-expanded", "true");
    await expect(setupRow).toBeVisible();
    expect(await readVisibleLabelAnomalies()).toEqual([]);

    for (let index = 0; index < 12; index += 1) {
      await recentFolder.click();
      await expect(recentFolder).toHaveAttribute("aria-expanded", String(index % 2 === 1));
      if (index === 0) {
        await expect(engineeringFolder).toBeVisible();
      }
      await expect(page.locator("#tree-root .tree-item-label")).toHaveCount(0);
      await expect(page.locator("#tree-root .tree-item-prefix")).toHaveCount(0);
      expect(await readVisibleLabelAnomalies()).toEqual([]);
    }

    await expect(setupRow).toBeVisible();
    await setupRow.click();
    await expect(page).toHaveURL(/\/BC-VO-02\/$/);
  });

  test("검색 결과를 필터링하고 clear 후 일반 트리로 복귀한다", async ({ page }) => {
    await page.goto("/");
    await waitForAppReady(page);
    await waitForTreeReady(page);

    const searchInput = page.locator("#tree-search-input");
    const searchCount = page.locator("#tree-search-count");
    const searchClear = page.locator("#tree-search-clear");
    const searchNext = page.locator("#tree-search-next");
    const setupRow = page
      .locator(
        '#tree-root [data-type="item"][data-item-type="file"][data-item-path="최근 문서/BC-VO-02 Setup Guide"]',
      )
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
      page
        .locator('#tree-root [data-type="item"][data-item-type="file"][data-item-focused="true"]')
        .first(),
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
