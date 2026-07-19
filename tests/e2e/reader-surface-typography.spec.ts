import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { waitForAppReady } from "./utils/app-ready";

const stylesheet = readFileSync("src/runtime/app.css", "utf8");

function channelToLinear(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(color: string): number {
  const channels = color
    .match(/[\d.]+/g)
    ?.slice(0, 3)
    .map(Number);
  if (!channels || channels.length !== 3) {
    throw new Error(`Unsupported computed color: ${color}`);
  }
  const [red, green, blue] = channels.map(channelToLinear);
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

function contrastRatio(foreground: string, background: string): number {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

test.describe("reader surface and typography hierarchy", () => {
  test("uses a system text stack and a documented type scale without text webfonts", () => {
    expect(stylesheet).toMatch(/--font-sans:\s+ui-sans-serif,\s*system-ui/);
    expect(stylesheet).toMatch(/--font-mono:\s+ui-monospace/);
    expect(stylesheet).not.toMatch(/Pretendard|Noto Sans KR|@font-face/i);
    for (const token of [
      "--type-title",
      "--type-content",
      "--type-heading-1",
      "--type-navigation",
      "--type-metadata",
      "--type-caption",
    ]) {
      expect(stylesheet).toContain(token);
    }
  });

  for (const theme of ["light", "dark"] as const) {
    test(`${theme} keeps reader/navigation hierarchy and AA text contrast`, async ({ page }) => {
      await page.addInitScript((mode) => {
        localStorage.setItem("fsblog.themeMode", mode);
      }, theme);
      await page.goto("/");
      await waitForAppReady(page);

      const styles = await page.evaluate(() => {
        const read = (selector: string) => getComputedStyle(document.querySelector(selector)!);
        const reader = read(".viewer");
        const sidebar = read(".sidebar");
        const title = read(".viewer-title");
        const content = read(".viewer-content");
        const metadata = read(".viewer-meta");
        const navigation = read(".tree-search-input");
        const sidebarTitle = read(".sidebar-title");
        return {
          readerBackground: reader.backgroundColor,
          sidebarBackground: sidebar.backgroundColor,
          sidebarBorderWidth: sidebar.borderRightWidth,
          fontFamily: getComputedStyle(document.body).fontFamily,
          titleSize: title.fontSize,
          contentSize: content.fontSize,
          metadataSize: metadata.fontSize,
          navigationSize: navigation.fontSize,
          contentColor: content.color,
          metadataColor: metadata.color,
          navigationColor: navigation.color,
          sidebarTitleColor: sidebarTitle.color,
        };
      });

      expect(styles.readerBackground).not.toBe(styles.sidebarBackground);
      expect(styles.sidebarBorderWidth).toBe("0px");
      expect(styles.fontFamily).toContain("system-ui");
      expect({
        title: styles.titleSize,
        content: styles.contentSize,
        metadata: styles.metadataSize,
        navigation: styles.navigationSize,
      }).toEqual({
        title: "40px",
        content: "17px",
        metadata: "13px",
        navigation: "14px",
      });

      for (const [foreground, background] of [
        [styles.contentColor, styles.readerBackground],
        [styles.metadataColor, styles.readerBackground],
        [styles.navigationColor, styles.sidebarBackground],
        [styles.sidebarTitleColor, styles.sidebarBackground],
      ]) {
        expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});
