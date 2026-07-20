import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import type { Manifest } from "../../src/types";
import { waitForAppReady, waitForTreeReady } from "./utils/app-ready";

interface CliResult {
  status: number | null;
  output: string;
}

function writeText(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function runBuild(cwd: string, cliPath: string, vaultDir: string, outDir: string): CliResult {
  const result = spawnSync("bun", [cliPath, "build", "--vault", vaultDir, "--out", outDir], {
    cwd,
    encoding: "utf8",
  });
  return {
    status: result.status,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
}

function writeConfig(workDir: string, locale: "ko" | "en"): void {
  writeText(
    path.join(workDir, "blog.config.mjs"),
    `export default {
  ui: { locale: ${JSON.stringify(locale)} },
  markdown: { mermaid: { enabled: false } },
};
`,
  );
}

function writeVault(vaultDir: string): void {
  writeText(
    path.join(vaultDir, "alpha.md"),
    `---
publish: true
prefix: LC-01
category_path: locale
title: English Alpha
date: 2026-07-18
---

# English Alpha

[[English Beta]]

![Local diagram](local.png)

\`\`\`text
localized copy control
\`\`\`
`,
  );
  writeText(
    path.join(vaultDir, "beta.md"),
    `---
publish: true
prefix: LC-02
category_path: locale
title: English Beta
date: 2026-07-19
---

# English Beta

Second document.

\`\`\`text
client navigation copy control
\`\`\`
`,
  );
}

function contentType(filePath: string): string {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  return "application/octet-stream";
}

function toFilePath(outDir: string, pathname: string): string {
  const clean = pathname.replace(/^\/+/, "");
  if (!clean) return path.join(outDir, "index.html");

  const direct = path.join(outDir, clean);
  if (fs.existsSync(direct) && fs.statSync(direct).isFile()) return direct;

  const withIndex = path.join(outDir, clean, "index.html");
  return fs.existsSync(withIndex) ? withIndex : path.join(outDir, "404.html");
}

async function startStaticServer(
  outDir: string,
): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const requestUrl = new URL(req.url ?? "/", "http://127.0.0.1");
    const filePath = toFilePath(outDir, requestUrl.pathname);
    if (!fs.existsSync(filePath)) {
      res.statusCode = 404;
      res.end("Not Found");
      return;
    }
    res.statusCode = filePath.endsWith("404.html") ? 404 : 200;
    res.setHeader("Content-Type", contentType(filePath));
    res.end(fs.readFileSync(filePath));
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  };
}

test.describe("configurable UI locale and copy", () => {
  const repoRoot = process.cwd();
  const cliPath = path.join(repoRoot, "src/cli.ts");
  let workDir = "";
  let outDir = "";
  let manifest: Manifest;
  let englishRouteHtml = "";
  let englishNotFoundHtml = "";
  let koreanContentHtml = "";
  let localeRebuildOutput = "";
  let server: { baseUrl: string; close: () => Promise<void> } | null = null;

  test.beforeAll(async () => {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), "eiam-locale-copy-"));
    const vaultDir = path.join(workDir, "vault");
    outDir = path.join(workDir, "dist");
    writeVault(vaultDir);

    writeConfig(workDir, "en");
    const firstEnglish = runBuild(workDir, cliPath, vaultDir, outDir);
    expect(firstEnglish.status, firstEnglish.output).toBe(0);

    writeConfig(workDir, "ko");
    const korean = runBuild(workDir, cliPath, vaultDir, outDir);
    expect(korean.status, korean.output).toBe(0);
    localeRebuildOutput = korean.output;
    const koreanManifest = JSON.parse(
      fs.readFileSync(path.join(outDir, "manifest.json"), "utf8"),
    ) as Manifest;
    koreanContentHtml = fs.readFileSync(
      path.join(outDir, koreanManifest.docsById[koreanManifest.docIds[0]].contentUrl),
      "utf8",
    );

    writeConfig(workDir, "en");
    const finalEnglish = runBuild(workDir, cliPath, vaultDir, outDir);
    expect(finalEnglish.status, finalEnglish.output).toBe(0);

    manifest = JSON.parse(fs.readFileSync(path.join(outDir, "manifest.json"), "utf8")) as Manifest;
    englishRouteHtml = fs.readFileSync(path.join(outDir, "LC-01", "index.html"), "utf8");
    englishNotFoundHtml = fs.readFileSync(path.join(outDir, "404.html"), "utf8");
    server = await startStaticServer(outDir);
  });

  test.afterAll(async () => {
    await server?.close();
    if (workDir) fs.rmSync(workDir, { recursive: true, force: true });
  });

  test("build output and content cache follow ui.locale", () => {
    expect(manifest.locale).toBe("en");
    expect(manifest.tree[0]).toMatchObject({ name: "Recent", virtual: true });
    expect(englishRouteHtml).toContain('<html lang="en">');
    expect(englishRouteHtml).toContain(">Branch<");
    expect(englishRouteHtml).toContain('aria-label="Search documents"');
    expect(englishRouteHtml).toContain('aria-label="Copy code"');
    expect(englishRouteHtml).toContain("(image omitted: Local diagram)");
    expect(englishNotFoundHtml).toContain('<html lang="en">');
    expect(englishNotFoundHtml).toContain("The requested document could not be found.");
    expect(englishNotFoundHtml).toContain("Go home");

    expect(localeRebuildOutput).toContain("total=2 rendered=2 skipped=0");
    expect(koreanContentHtml).toContain('aria-label="코드 복사"');
    expect(koreanContentHtml).toContain("(이미지 생략: Local diagram)");
  });

  test("client navigation and dynamic controls retain the English catalog", async ({
    context,
    page,
  }) => {
    expect(server).not.toBeNull();
    await context.grantPermissions(["clipboard-read", "clipboard-write"], {
      origin: new URL(server!.baseUrl).origin,
    });
    await page.goto(`${server!.baseUrl}/LC-01/`);
    await waitForAppReady(page);
    await waitForTreeReady(page);

    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    const branchSelect = page.getByRole("combobox", { name: "Branch" });
    await expect(branchSelect).toBeVisible();
    await expect(branchSelect.locator("option").first()).toContainText("(default)");
    await expect(page.getByRole("button", { name: "Open explorer settings" })).toBeVisible();

    await page.getByRole("searchbox", { name: "Search documents" }).fill("English");
    await expect(page.locator("#tree-search-count")).toHaveText(/[1-9]\d* matches/);

    const copyButton = page.locator(".code-copy").first();
    await expect(copyButton).toHaveAccessibleName("Copy code");
    await copyButton.click();
    await expect(copyButton).toHaveAccessibleName("Copied");

    await page.locator("#viewer-nav .nav-link-next").click();
    await expect(page).toHaveURL(`${server!.baseUrl}/LC-02/`);
    await expect(page.locator("#viewer-title")).toHaveText("English Beta");
    await expect(page.locator("#viewer-nav .nav-link-prev .nav-link-label")).toContainText(
      "Previous",
    );
    await expect(page.locator("#viewer-backlinks .backlinks-title")).toHaveText("Backlinks");
    await expect(page.locator("#a11y-status")).toHaveText(
      "Navigation complete: opened English Beta.",
    );
    await expect(page.locator(".code-copy").first()).toHaveAccessibleName("Copy code");
  });

  test("English 404 remains localized without application JavaScript", async ({ page }) => {
    expect(server).not.toBeNull();
    const response = await page.goto(`${server!.baseUrl}/missing/`);
    expect(response?.status()).toBe(404);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator(".not-found p")).toHaveText(
      "The requested document could not be found.",
    );
    await expect(page.getByRole("link", { name: "Go home" })).toBeVisible();
  });
});
