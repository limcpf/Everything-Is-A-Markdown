import { expect, test } from "@playwright/test";
import { waitForAppReady } from "./utils/app-ready";

interface Rect {
  left: number;
  right: number;
  width: number;
}

test.describe("reader prose and wide-content lanes", () => {
  test("centers readable prose while code and tables retain a wider lane", async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto("/BC-VO-01/");
    await waitForAppReady(page);

    const layout = await page.evaluate(() => {
      const bounds = (selector: string) => {
        const box = document.querySelector(selector)!.getBoundingClientRect();
        return { left: box.left, right: box.right, width: box.width };
      };

      return {
        content: bounds(".viewer-content"),
        breadcrumb: bounds(".viewer-breadcrumb"),
        header: bounds(".viewer-header"),
        paragraph: bounds(".viewer-content > p"),
        heading: bounds(".viewer-content > h2"),
        code: bounds(".viewer-content > .code-block"),
        table: bounds(".viewer-content > table"),
        navigation: bounds(".viewer-nav"),
      };
    });

    const centeredInContent = (item: Rect) =>
      Math.abs(item.left - layout.content.left - (layout.content.right - item.right));

    for (const item of [
      layout.breadcrumb,
      layout.header,
      layout.paragraph,
      layout.heading,
      layout.navigation,
    ]) {
      expect(item.width).toBeCloseTo(672, 0);
      expect(centeredInContent(item)).toBeLessThanOrEqual(1);
    }

    for (const item of [layout.code, layout.table]) {
      expect(item.width).toBeCloseTo(880, 0);
      expect(item.width - layout.paragraph.width).toBeGreaterThanOrEqual(200);
      expect(centeredInContent(item)).toBeLessThanOrEqual(1);
    }
  });

  test("collapses both lanes without horizontal overflow on mobile", async ({ page }) => {
    const viewport = { width: 390, height: 844 };
    await page.setViewportSize(viewport);
    await page.goto("/BC-VO-01/");
    await waitForAppReady(page);

    const boxes = await page.evaluate(() =>
      [
        ".viewer-container",
        ".viewer-content > p",
        ".viewer-content > .code-block",
        ".viewer-content > table",
      ].map((selector) => {
        const element = document.querySelector(selector)!;
        const box = element.getBoundingClientRect();
        return { left: box.left, right: box.right, width: box.width };
      }),
    );

    expect(boxes).toHaveLength(4);
    for (const box of boxes) {
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.right).toBeLessThanOrEqual(viewport.width + 1);
      expect(box.width).toBeGreaterThan(0);
    }
    expect(boxes[1].width).toBeCloseTo(boxes[2].width, 0);
    expect(boxes[1].width).toBeCloseTo(boxes[3].width, 0);
  });
});
