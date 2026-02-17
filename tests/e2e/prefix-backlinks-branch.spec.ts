import { expect, test } from "@playwright/test";

test.describe("prefix 라우팅/백링크/자동 브랜치 전환", () => {
  test("main 저장 상태에서 unclassified 문서 진입 시 nav가 활성 브랜치 기준으로 동기화된다", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("fsblog.branch", "main");
    });

    await page.goto("/BC-VO-00/");

    await expect(page.locator("#viewer-title")).toHaveText("About");
    await expect(page.locator("#sidebar-branch-info")).toContainText("dev + unclassified");

    const navLink = page.locator("#viewer-nav .nav-link");
    await expect(navLink).toHaveCount(1);
    await expect(navLink.first()).toHaveAttribute("data-route", "/BC-VO-02/");

    await navLink.first().click();
    await expect(page).toHaveURL(/\/BC-VO-02\/$/);
    await expect(page.locator("#viewer-title")).toHaveText("Setup Guide");
  });

  test("backlinks 클릭 시 prefix 경로 이동과 자동 브랜치 전환이 함께 동작한다", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("fsblog.branch", "main");
    });

    await page.goto("/BC-VO-01/");

    const backlinks = page.locator("#viewer-backlinks");
    await expect(backlinks).toBeVisible();

    const aboutBacklink = backlinks.locator('.backlink-link[data-route="/BC-VO-00/"]');
    await expect(aboutBacklink).toBeVisible();
    await aboutBacklink.click();

    await expect(page).toHaveURL(/\/BC-VO-00\/$/);
    await expect(page.locator("#viewer-title")).toHaveText("About");
    await expect(page.locator("#sidebar-branch-info")).toContainText("dev + unclassified");
    await expect(page.locator("#viewer-nav .nav-link").first()).toHaveAttribute("data-route", "/BC-VO-02/");
  });
});
