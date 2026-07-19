import { expect, type Page, test } from "@playwright/test";
import { waitForAppReady, waitForTreeReady } from "./utils/app-ready";

const COMPACT_VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 1024, height: 600 },
] as const;

async function readerHeaderState(page: Page) {
  return page.evaluate(() => {
    const rect = (selector: string) => {
      const bounds = document.querySelector(selector)!.getBoundingClientRect();
      return {
        bottom: bounds.bottom,
        left: bounds.left,
        right: bounds.right,
        top: bounds.top,
        width: bounds.width,
      };
    };
    const viewer = document.querySelector<HTMLElement>("#viewer-panel")!;
    const header = document.querySelector<HTMLElement>(".mobile-reader-header")!;
    const toggle = document.querySelector<HTMLElement>("#sidebar-toggle")!;

    return {
      header: rect(".mobile-reader-header"),
      headerPosition: getComputedStyle(header).position,
      horizontalOverflow: viewer.scrollWidth - viewer.clientWidth,
      title: rect("#mobile-reader-title"),
      toggle: rect("#sidebar-toggle"),
      togglePosition: getComputedStyle(toggle).position,
      viewer: rect("#viewer-panel"),
    };
  });
}

test.describe("sticky mobile reader header", () => {
  for (const viewport of COMPACT_VIEWPORTS) {
    test(`${viewport.width}x${viewport.height}에서 reader 접근을 가리지 않고 고정된다`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto("/BC-VO-01/");
      await waitForAppReady(page);

      const header = page.locator(".mobile-reader-header");
      const toggle = page.getByRole("button", { name: "탐색기 열기" });
      await expect(header).toBeVisible();
      await expect(toggle).toBeVisible();
      await expect(page.locator("#mobile-reader-title")).toHaveText(
        await page.locator("#viewer-title").innerText(),
      );

      const initial = await readerHeaderState(page);
      expect(initial.headerPosition).toBe("sticky");
      expect(initial.togglePosition).toBe("static");
      expect(initial.header.left).toBeGreaterThanOrEqual(initial.viewer.left - 1);
      expect(initial.header.right).toBeLessThanOrEqual(initial.viewer.right + 1);
      expect(initial.toggle.left).toBeGreaterThanOrEqual(initial.header.left);
      expect(initial.toggle.right).toBeLessThanOrEqual(initial.header.right);
      expect(initial.toggle.bottom - initial.toggle.top).toBeGreaterThanOrEqual(44);
      expect(initial.title.width).toBeGreaterThan(0);
      expect(initial.horizontalOverflow).toBeLessThanOrEqual(1);

      await page.locator("#viewer-panel").evaluate((viewer) => {
        viewer.scrollTop = viewer.scrollHeight;
      });

      const scrolled = await readerHeaderState(page);
      expect(Math.abs(scrolled.header.top - scrolled.viewer.top)).toBeLessThanOrEqual(1);

      const overlap = await page.evaluate(() => {
        const header = document.querySelector(".mobile-reader-header")!.getBoundingClientRect();
        const nav = document.querySelector("#viewer-nav")!.getBoundingClientRect();
        return Math.max(0, Math.min(header.bottom, nav.bottom) - Math.max(header.top, nav.top));
      });
      expect(overlap).toBe(0);
    });
  }

  test("client navigation이 compact header의 문서 문맥도 갱신한다", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/BC-VO-00/");
    await waitForAppReady(page);

    const next = page.locator("#viewer-nav .nav-link-next");
    await expect(next).toBeVisible();
    await next.click();

    const title = await page.locator("#viewer-title").innerText();
    await expect(page.locator("#mobile-reader-title")).toHaveText(title);
  });

  test("200% zoom stress에서도 menu와 제목이 header 안에 유지된다", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/BC-VO-01/");
    await waitForAppReady(page);
    await page.locator("#mobile-reader-title").evaluate((title) => {
      title.textContent = "매우 긴 현재 문서 제목이 확대된 좁은 화면에서도 안전하게 줄어듭니다";
      document.documentElement.style.zoom = "2";
    });

    const state = await readerHeaderState(page);
    expect(state.header.left).toBeGreaterThanOrEqual(state.viewer.left - 1);
    expect(state.header.right).toBeLessThanOrEqual(state.viewer.right + 1);
    expect(state.toggle.right).toBeLessThanOrEqual(state.header.right);
    expect(state.title.left).toBeGreaterThanOrEqual(state.toggle.right);
    expect(state.title.right).toBeLessThanOrEqual(state.header.right);
    expect(state.title.width).toBeGreaterThan(0);
    expect(state.horizontalOverflow).toBeLessThanOrEqual(1);
  });

  test("overlay click이 drawer를 닫고 menu control로 focus를 복원한다", async ({ page }) => {
    await page.setViewportSize({ width: 820, height: 600 });
    await page.goto("/BC-VO-01/");
    await waitForAppReady(page);

    const toggle = page.getByRole("button", { name: "탐색기 열기" });
    await toggle.click();
    await waitForTreeReady(page);
    await expect(page.locator("#sidebar-panel")).toHaveAttribute("role", "dialog");

    const overlay = page.locator("#sidebar-overlay");
    const bounds = await overlay.boundingBox();
    expect(bounds).not.toBeNull();
    await overlay.click({ position: { x: bounds!.width - 20, y: bounds!.height / 2 } });

    await expect(page.locator("#sidebar-panel")).toHaveAttribute("aria-hidden", "true");
    await expect(page.locator("#viewer-panel")).not.toHaveAttribute("aria-hidden", "true");
    await expect(page.locator("#sidebar-toggle")).toBeFocused();
  });

  test("safe-area metadata와 설정 정리 contract를 노출하고 desktop에서는 숨는다", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/BC-VO-01/");
    await waitForAppReady(page);

    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
      "content",
      /viewport-fit=cover/,
    );
    await expect(page.locator(".mobile-reader-header")).toBeHidden();
    await expect(page.locator("#sidebar-panel")).toBeVisible();
    await expect(page.locator('input[name="menu-toggle-position"]')).toHaveCount(0);
  });
});
