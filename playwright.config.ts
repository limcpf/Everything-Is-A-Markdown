import { defineConfig, devices } from "@playwright/test";

const rawPort = process.env.PLAYWRIGHT_PORT?.trim() ?? "";
const parsedPort = /^[0-9]+$/.test(rawPort) ? Number(rawPort) : Number.NaN;
const isUsablePort = Number.isInteger(parsedPort) && parsedPort >= 1024 && parsedPort <= 65_535;
const port = isUsablePort ? parsedPort : 4173;
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`;
const webServer = process.env.PLAYWRIGHT_BASE_URL
  ? undefined
  : {
      command: `bun run dev -- --vault ./test-vault --out ./dist --port ${port}`,
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    };

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  fullyParallel: false,
  retries: 0,
  webServer,
  use: {
    baseURL,
    headless: true,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
