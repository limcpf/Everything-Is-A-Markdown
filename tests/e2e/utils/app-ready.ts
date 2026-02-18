import { expect, type Page } from "@playwright/test";

export async function waitForAppReady(page: Page): Promise<void> {
  const timeoutMs = 10_000;
  const pollIntervalMs = 100;
  const deadline = Date.now() + timeoutMs;
  let lastState: string | null = null;

  while (Date.now() < deadline) {
    const state = await page.evaluate(() => document.documentElement.getAttribute("data-app-ready"));
    lastState = state;

    if (state === "ready") {
      return;
    }

    if (state === "error") {
      throw new Error(`앱 초기화 실패 상태를 감지했습니다. data-app-ready=error, url=${page.url()}`);
    }

    await page.waitForTimeout(pollIntervalMs);
  }

  await expect(
    page.locator("html"),
    `앱 준비 상태 대기 시간(${timeoutMs}ms) 초과. 마지막 상태: ${lastState ?? "unset"}`,
  ).toHaveAttribute("data-app-ready", "ready", { timeout: 1 });
}
