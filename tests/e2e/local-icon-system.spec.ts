import { expect, test } from "@playwright/test";
import { waitForAppReady } from "./utils/app-ready";

test.describe("local SVG icon system", () => {
  test("renders SSR icons without JavaScript or third-party font requests", async ({
    baseURL,
    browser,
  }) => {
    if (!baseURL) {
      throw new Error("Playwright baseURL is required");
    }

    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    const externalIconRequests: string[] = [];
    page.on("request", (request) => {
      const hostname = new URL(request.url()).hostname;
      if (hostname === "fonts.googleapis.com" || hostname === "fonts.gstatic.com") {
        externalIconRequests.push(request.url());
      }
    });

    try {
      await page.goto(`${baseURL}/BC-VO-02/`);

      const searchIcon = page.locator(".sidebar-search-icon");
      await expect(searchIcon).toBeVisible();
      const bounds = await searchIcon.boundingBox();
      expect(bounds?.width ?? 0).toBeGreaterThan(0);
      expect(bounds?.height ?? 0).toBeGreaterThan(0);
      await expect(page.locator(".material-symbols-outlined")).toHaveCount(0);

      const state = await page.evaluate(() => {
        const sprite = document.querySelector("[data-app-icon-sprite]");
        const icons = Array.from(document.querySelectorAll("svg.app-icon"));
        return {
          iconCount: icons.length,
          hiddenFromAssistiveTechnology: icons.every(
            (icon) =>
              icon.getAttribute("aria-hidden") === "true" &&
              icon.getAttribute("focusable") === "false",
          ),
          localReferencesOnly: icons.every((icon) =>
            icon.querySelector("use")?.getAttribute("href")?.startsWith("#eiam-icon-"),
          ),
          spriteBeforeFirstIcon:
            sprite instanceof SVGElement &&
            icons[0] instanceof SVGElement &&
            Boolean(sprite.compareDocumentPosition(icons[0]) & Node.DOCUMENT_POSITION_FOLLOWING),
          hasLigatureText: icons.some((icon) => (icon.textContent ?? "").trim().length > 0),
        };
      });

      expect(state.iconCount).toBeGreaterThan(0);
      expect(state.hiddenFromAssistiveTechnology).toBe(true);
      expect(state.localReferencesOnly).toBe(true);
      expect(state.spriteBeforeFirstIcon).toBe(true);
      expect(state.hasLigatureText).toBe(false);
      expect(externalIconRequests).toEqual([]);
    } finally {
      await context.close();
    }
  });

  test("keeps icon controls named and exposes copy feedback without ligatures", async ({
    baseURL,
    context,
    page,
  }) => {
    if (!baseURL) {
      throw new Error("Playwright baseURL is required");
    }

    await context.grantPermissions(["clipboard-read", "clipboard-write"], {
      origin: new URL(baseURL).origin,
    });
    await page.goto("/BC-VO-02/");
    await waitForAppReady(page);

    const iconControls = page.locator("button:has(svg.app-icon), a:has(svg.app-icon)");
    const controlCount = await iconControls.count();
    expect(controlCount).toBeGreaterThan(0);
    const unnamedControls = await iconControls.evaluateAll((controls) =>
      controls
        .filter((control) => {
          const explicitName = control.getAttribute("aria-label")?.trim() ?? "";
          const visibleText = (control.textContent ?? "").trim();
          return explicitName.length === 0 && visibleText.length === 0;
        })
        .map((control) => control.outerHTML),
    );
    expect(unnamedControls).toEqual([]);

    const visibleIconControls = page.locator(
      "button:has(svg.app-icon):visible, a:has(svg.app-icon):visible",
    );
    for (let index = 0; index < (await visibleIconControls.count()); index += 1) {
      await expect(visibleIconControls.nth(index)).toHaveAccessibleName(/.+/);
    }

    const copyButton = page.locator(".code-copy").first();
    await expect(copyButton).toHaveAccessibleName("코드 복사");
    await expect(copyButton.locator("use")).toHaveAttribute("href", "#eiam-icon-copy");
    await copyButton.click();
    await expect(copyButton).toHaveAccessibleName("복사됨");
    await expect(copyButton.locator("use")).toHaveAttribute("href", "#eiam-icon-check");
    await expect(copyButton).toHaveClass(/copied/);
  });
});
