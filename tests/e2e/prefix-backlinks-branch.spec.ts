import { expect, test } from "@playwright/test";
import { waitForAppReady } from "./utils/app-ready";
import { escapeRegExp, getInitialManifest, getNextRouteInDefaultBranch } from "./utils/manifest";

test.describe("prefix 라우팅/백링크/자동 브랜치 전환", () => {
  test("브랜치 전환 UI는 select 대신 pill 버튼을 사용한다", async ({ page }) => {
    await page.goto("/BC-VO-00/");
    await waitForAppReady(page);
    const manifest = await getInitialManifest(page);
    const mainDoc = manifest.docs.find((doc) => doc.branch === "main");

    if (!mainDoc) {
      throw new Error("main 브랜치 문서를 찾지 못했습니다.");
    }

    const branchGroup = page.locator("#sidebar-branch-pills");
    const defaultPill = branchGroup.locator(
      `.branch-pill[data-branch="${manifest.defaultBranch}"]`,
    );
    const mainPill = branchGroup.locator('.branch-pill[data-branch="main"]');

    await expect(page.locator(".sidebar-branch select")).toHaveCount(0);
    await expect(defaultPill).toHaveAttribute("type", "button");
    await expect(defaultPill).toHaveAttribute("aria-pressed", "true");
    await expect(mainPill).toHaveAttribute("type", "button");
    await expect(mainPill).toHaveAttribute("aria-pressed", "false");

    await mainPill.click();

    await expect(mainPill).toHaveClass(/is-active/);
    await expect(mainPill).toHaveAttribute("aria-pressed", "true");
    await expect(defaultPill).toHaveAttribute("aria-pressed", "false");
    await expect(page).toHaveURL(new RegExp(`${escapeRegExp(mainDoc.route)}$`));
  });

  test("main 저장 상태에서 unclassified 문서 진입 시 nav가 활성 브랜치 기준으로 동기화된다", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("fsblog.branch", "main");
    });

    await page.goto("/BC-VO-00/");
    await waitForAppReady(page);
    const manifest = await getInitialManifest(page);
    const nextRoute = getNextRouteInDefaultBranch(manifest, "/BC-VO-00/");

    if (!nextRoute) {
      throw new Error("기본 브랜치에서 /BC-VO-00/ 다음 문서를 찾지 못했습니다.");
    }

    await expect(page.locator("#viewer-title")).toHaveText("About");
    await expect(
      page.locator(`.branch-pill.is-active[data-branch="${manifest.defaultBranch}"]`),
    ).toHaveAttribute("aria-pressed", "true");

    const nextToSetupGuide = page.locator(`#viewer-nav .nav-link[data-route="${nextRoute}"]`);
    await expect(nextToSetupGuide).toBeVisible();

    await nextToSetupGuide.click();
    await expect(page).toHaveURL(new RegExp(`${escapeRegExp(nextRoute)}$`));
  });

  test("backlinks 클릭 시 prefix 경로 이동과 자동 브랜치 전환이 함께 동작한다", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("fsblog.branch", "main");
    });

    await page.goto("/BC-VO-01/");
    await waitForAppReady(page);
    const manifest = await getInitialManifest(page);
    const nextRoute = getNextRouteInDefaultBranch(manifest, "/BC-VO-00/");

    if (!nextRoute) {
      throw new Error("기본 브랜치에서 /BC-VO-00/ 다음 문서를 찾지 못했습니다.");
    }

    const backlinks = page.locator("#viewer-backlinks");
    await expect(backlinks).toBeVisible();

    const aboutBacklink = backlinks.locator('.backlink-link[data-route="/BC-VO-00/"]');
    await expect(aboutBacklink).toBeVisible();
    await aboutBacklink.click();

    await expect(page).toHaveURL(/\/BC-VO-00\/$/);
    await expect(page.locator("#viewer-title")).toHaveText("About");
    await expect(
      page.locator(`.branch-pill.is-active[data-branch="${manifest.defaultBranch}"]`),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(`#viewer-nav .nav-link[data-route="${nextRoute}"]`)).toBeVisible();
  });
});
