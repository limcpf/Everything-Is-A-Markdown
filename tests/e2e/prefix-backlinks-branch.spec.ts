import { expect, test } from "@playwright/test";

test.describe("prefix 라우팅/백링크/자동 브랜치 전환", () => {
  test("main 저장 상태에서 unclassified 문서 진입 시 nav가 활성 브랜치 기준으로 동기화된다", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("fsblog.branch", "main");
    });

    await page.goto("/BC-VO-00/");

    await expect(page.locator("#viewer-title")).toHaveText("About");
    await expect(page.locator('.branch-pill.is-active[data-branch="dev"]')).toBeVisible();

    const nextToSetupGuide = page.locator('#viewer-nav .nav-link[data-route="/BC-VO-02/"]');
    await expect(nextToSetupGuide).toBeVisible();

    await nextToSetupGuide.click();
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
    await expect(page.locator('.branch-pill.is-active[data-branch="dev"]')).toBeVisible();
    await expect(page.locator('#viewer-nav .nav-link[data-route="/BC-VO-02/"]')).toBeVisible();
  });
});
