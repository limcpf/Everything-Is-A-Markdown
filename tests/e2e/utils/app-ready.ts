import { expect, type Page } from "@playwright/test";

export async function waitForAppReady(page: Page): Promise<void> {
  await expect(page.locator("html")).toHaveAttribute("data-app-ready", "ready", { timeout: 10_000 });
}
