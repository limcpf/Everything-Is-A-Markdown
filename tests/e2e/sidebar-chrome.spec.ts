import { expect, test } from "@playwright/test";
import { waitForAppReady, waitForTreeReady } from "./utils/app-ready";
import { getInitialManifest } from "./utils/manifest";

test.describe("purposeful sidebar chrome", () => {
  test("uses keyboard-accessible branch pills and removes static status chrome", async ({
    page,
  }) => {
    await page.goto("/BC-VO-00/");
    await waitForAppReady(page);
    await waitForTreeReady(page);
    const manifest = await getInitialManifest(page);

    const branchGroup = page.getByRole("group", { name: "브랜치" });
    const defaultBranch = branchGroup.locator(
      `.branch-pill[data-branch="${manifest.defaultBranch}"]`,
    );
    const mainBranch = branchGroup.locator('.branch-pill[data-branch="main"]');
    await expect(branchGroup).toBeVisible();
    await expect(branchGroup.getByRole("button")).toHaveCount(2);
    await expect(defaultBranch).toHaveAttribute("aria-pressed", "true");
    await expect(defaultBranch).toHaveAttribute("aria-label", /기본값/);

    const redundantRequest = page
      .waitForRequest((request) => new URL(request.url()).pathname.endsWith("/BC-VO-00/"), {
        timeout: 500,
      })
      .then(() => true)
      .catch(() => false);
    await defaultBranch.click();
    expect(await redundantRequest).toBe(false);

    for (const removedChrome of [
      ".icon-terminal",
      ".branch-badge",
      ".branch-select",
      ".status-online",
      ".status-encoding",
      ".sidebar-footer",
    ]) {
      await expect(page.locator(removedChrome)).toHaveCount(0);
    }

    await mainBranch.focus();
    await mainBranch.press("Enter");
    await expect(mainBranch).toHaveAttribute("aria-pressed", "true");
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("fsblog.branch")))
      .toBe("main");

    await defaultBranch.focus();
    await defaultBranch.press("Space");
    await expect(defaultBranch).toHaveAttribute("aria-pressed", "true");
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("fsblog.branch")))
      .toBe(manifest.defaultBranch);
  });

  test("bounds a large branch pill set without clipping sidebar controls", async ({ page }) => {
    await page.goto("/BC-VO-00/");
    await waitForAppReady(page);

    const branchGroup = page.getByRole("group", { name: "브랜치" });
    await branchGroup.evaluate((group) => {
      for (let index = 0; index < 40; index += 1) {
        const button = document.createElement("button");
        button.className = "branch-pill";
        button.type = "button";
        button.textContent = `release-${index}`;
        group.append(button);
      }
    });

    const layout = await branchGroup.evaluate((group) => {
      const search = document.querySelector(".sidebar-search");
      const style = window.getComputedStyle(group);
      return {
        clientHeight: group.clientHeight,
        scrollHeight: group.scrollHeight,
        overflowY: style.overflowY,
        searchTop: search?.getBoundingClientRect().top ?? null,
        viewportHeight: window.innerHeight,
      };
    });

    expect(layout.overflowY).toBe("auto");
    expect(layout.clientHeight).toBeLessThanOrEqual(88);
    expect(layout.scrollHeight).toBeGreaterThan(layout.clientHeight);
    expect(layout.searchTop).not.toBeNull();
    expect(layout.searchTop ?? Infinity).toBeLessThan(layout.viewportHeight);
  });

  test("keeps native tree labels, search, and settings affordances available", async ({ page }) => {
    await page.goto("/BC-VO-00/");
    await waitForAppReady(page);
    await waitForTreeReady(page);

    const searchActions = page.locator("#sidebar-search-actions");
    await expect(searchActions).toBeHidden();
    await page.locator("#tree-search-input").fill("About");
    await expect(searchActions).toBeVisible();
    await expect(page.locator("#tree-search-count")).toContainText("개 일치");

    const aboutRow = page.getByRole("treeitem", { name: "BC-VO-00 About", exact: true }).first();
    await expect(aboutRow).toBeVisible();
    await expect(aboutRow).toHaveAccessibleName("BC-VO-00 About");
    await expect(page.locator("#tree-root .tree-item-label")).toHaveCount(0);
    await expect(page.locator("#tree-root .tree-item-prefix")).toHaveCount(0);

    const settingsToggle = page.getByRole("button", { name: "탐색기 설정 열기" });
    await expect(settingsToggle).toBeVisible();
    await settingsToggle.click();
    await expect(page.locator("#sidebar-settings")).toBeVisible();
    await page.locator("#settings-close").click();
    await expect(page.locator("#sidebar-settings")).toBeHidden();
  });
});
