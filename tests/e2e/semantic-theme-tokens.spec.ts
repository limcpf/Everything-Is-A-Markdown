import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { waitForAppReady } from "./utils/app-ready";

const stylesheet = readFileSync("src/runtime/app.css", "utf8");

test.describe("semantic theme tokens", () => {
  test("components do not consume palette-specific variables", () => {
    expect(stylesheet).not.toMatch(/--(?:latte|mocha)-/);
    for (const token of [
      "--color-canvas",
      "--color-surface",
      "--color-text",
      "--color-border",
      "--color-accent",
      "--color-success",
      "--color-danger",
      "--color-focus",
    ]) {
      expect(stylesheet).toContain(token);
    }
  });

  for (const theme of ["light", "dark"] as const) {
    test(`${theme} theme maps semantic roles to a coherent surface snapshot`, async ({ page }) => {
      await page.addInitScript((mode) => {
        localStorage.setItem("fsblog.themeMode", mode);
      }, theme);
      await page.goto("/");
      await waitForAppReady(page);

      const snapshot = await page.evaluate(() => {
        const root = getComputedStyle(document.documentElement);
        const body = getComputedStyle(document.body);
        const sidebar = getComputedStyle(document.querySelector(".sidebar")!);
        const viewer = getComputedStyle(document.querySelector(".viewer")!);
        const token = (name: string) => root.getPropertyValue(name).trim();
        return {
          appliedTheme: document.documentElement.dataset.theme,
          canvas: token("--color-canvas"),
          surface: token("--color-surface"),
          text: token("--color-text"),
          border: token("--color-border"),
          accent: token("--color-accent"),
          focus: token("--color-focus"),
          success: token("--color-success"),
          warning: token("--color-warning"),
          danger: token("--color-danger"),
          bodyBackground: body.backgroundColor,
          bodyColor: body.color,
          sidebarBackground: sidebar.backgroundColor,
          viewerBackground: viewer.backgroundColor,
        };
      });

      expect(snapshot).toEqual(
        theme === "light"
          ? {
              appliedTheme: "light",
              canvas: "#eff1f5",
              surface: "#e6e9ef",
              text: "#4c4f69",
              border: "#ccd0da",
              accent: "#8839ef",
              focus: "#1e66f5",
              success: "#40a02b",
              warning: "#df8e1d",
              danger: "#d20f39",
              bodyBackground: "rgb(239, 241, 245)",
              bodyColor: "rgb(76, 79, 105)",
              sidebarBackground: "rgb(230, 233, 239)",
              viewerBackground: "rgb(239, 241, 245)",
            }
          : {
              appliedTheme: "dark",
              canvas: "#1e1e2e",
              surface: "#181825",
              text: "#cdd6f4",
              border: "#313244",
              accent: "#cba6f7",
              focus: "#89b4fa",
              success: "#a6e3a1",
              warning: "#f9e2af",
              danger: "#f38ba8",
              bodyBackground: "rgb(30, 30, 46)",
              bodyColor: "rgb(205, 214, 244)",
              sidebarBackground: "rgb(24, 24, 37)",
              viewerBackground: "rgb(30, 30, 46)",
            },
      );

      expect(
        new Set([snapshot.focus, snapshot.accent, snapshot.warning, snapshot.danger]).size,
      ).toBe(4);
    });
  }
});
