import { expect, test } from "@playwright/test";
import { waitForAppReady } from "./utils/app-ready";

test.describe("루트 홈 문서 선택", () => {
  test("루트('/')는 /index/ 문서가 없을 때 기본 브랜치 기준 최신 문서를 연다", async ({ page }) => {
    await page.goto("/");
    await waitForAppReady(page);

    await expect(page).toHaveURL(/\/BC-VO-02\/$/);
    await expect(page.locator("#viewer-title")).toHaveText("Setup Guide");
  });
});
