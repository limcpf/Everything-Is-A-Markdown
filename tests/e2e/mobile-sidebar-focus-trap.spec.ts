import { expect, test } from "@playwright/test";
import { waitForAppReady } from "./utils/app-ready";

test.describe("모바일 사이드바 포커스 트랩", () => {
  test("Tab/Shift+Tab 이동이 사이드바 내부에 머무른다", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/BC-VO-01/");
    await waitForAppReady(page);

    const sidebar = page.locator("#sidebar-panel");
    const viewer = page.locator("#viewer-panel");
    const toggle = page.getByRole("button", { name: "탐색기 열기" });

    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.click();
    await expect(page.locator("#sidebar-toggle")).toHaveAttribute("aria-expanded", "true");
    await expect(sidebar).toHaveAttribute("role", "dialog");
    await expect(sidebar).toHaveAttribute("aria-modal", "true");
    await expect(viewer).toHaveAttribute("aria-hidden", "true");

    for (let i = 0; i < 30; i += 1) {
      await page.keyboard.press("Tab");
      const insideSidebar = await page.evaluate(() => {
        const active = document.activeElement;
        const panel = document.getElementById("sidebar-panel");
        return Boolean(active && panel && panel.contains(active));
      });
      expect(insideSidebar).toBe(true);
    }

    for (let i = 0; i < 30; i += 1) {
      await page.keyboard.down("Shift");
      await page.keyboard.press("Tab");
      await page.keyboard.up("Shift");
      const insideSidebar = await page.evaluate(() => {
        const active = document.activeElement;
        const panel = document.getElementById("sidebar-panel");
        return Boolean(active && panel && panel.contains(active));
      });
      expect(insideSidebar).toBe(true);
    }

    await page.keyboard.press("Escape");
    await expect(sidebar).toHaveAttribute("aria-hidden", "true");
    await expect(viewer).not.toHaveAttribute("aria-hidden", "true");
    expect(await viewer.getAttribute("inert")).toBeNull();
    await expect(page.locator("#sidebar-toggle")).toBeFocused();
  });
});
