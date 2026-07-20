import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { waitForTreeReady } from "./utils/app-ready";

function runCli(cwd: string, args: string[]): { status: number | null; output: string } {
  const result = spawnSync("bun", args, { cwd, encoding: "utf8" });
  return {
    status: result.status,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
}

function normalizePathBase(pathBase: string): string {
  const cleaned = pathBase.trim().replace(/\\/g, "/");
  if (!cleaned || cleaned === "/") {
    return "";
  }
  return `/${cleaned.replace(/^\/+/, "").replace(/\/+$/, "")}`;
}

function toFilePath(outDir: string, pathname: string, pathBase: string): string | null {
  let decodedPathname: string;
  try {
    decodedPathname = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decodedPathname.includes("..")) {
    return null;
  }

  const normalizedBase = normalizePathBase(pathBase);
  let routedPath = decodedPathname;
  if (normalizedBase) {
    if (routedPath === normalizedBase) {
      routedPath = "/";
    } else if (routedPath.startsWith(`${normalizedBase}/`)) {
      routedPath = routedPath.slice(normalizedBase.length);
    } else {
      return null;
    }
  }

  const clean = routedPath.replace(/^\/+/, "");
  if (!clean) {
    return path.join(outDir, "index.html");
  }

  const direct = path.join(outDir, clean);
  if (fs.existsSync(direct) && fs.statSync(direct).isFile()) {
    return direct;
  }

  const withIndex = path.join(outDir, clean, "index.html");
  if (fs.existsSync(withIndex)) {
    return withIndex;
  }

  return path.join(outDir, "404.html");
}

function contentType(filePath: string): string {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  return "application/octet-stream";
}

async function startStaticServer(
  outDir: string,
  pathBase: string,
): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const requestUrl = new URL(req.url ?? "/", "http://127.0.0.1");
    const filePath = toFilePath(outDir, requestUrl.pathname, pathBase);
    if (!filePath || !fs.existsSync(filePath)) {
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
    server.listen(0, "127.0.0.1", () => resolve());
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

test.describe("pathBase 정식 지원", () => {
  const repoRoot = process.cwd();
  const cliPath = path.join(repoRoot, "src/cli.ts");
  const vaultPath = path.join(repoRoot, "test-vault");

  test("생성된 404 Home 링크와 bootstrap은 정규화·인코딩된 pathBase를 따른다", async ({ page }) => {
    test.setTimeout(60_000);
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "mfs-404-home-"));
    const outDir = path.join(workDir, "dist");
    const configPath = path.join(workDir, "blog.config.mjs");

    try {
      const rootBuild = runCli(workDir, [cliPath, "build", "--vault", vaultPath, "--out", outDir]);
      expect(rootBuild.status, rootBuild.output).toBe(0);
      const rootNotFoundHtml = fs.readFileSync(path.join(outDir, "404.html"), "utf8");
      expect(rootNotFoundHtml).toContain('<a href="/" class="not-found-link">');

      fs.writeFileSync(
        configPath,
        'export default { seo: { siteUrl: "https://example.com", pathBase: " docs/guides/ " } };',
        "utf8",
      );
      const nestedBuild = runCli(workDir, [
        cliPath,
        "build",
        "--vault",
        vaultPath,
        "--out",
        outDir,
      ]);
      expect(nestedBuild.status, nestedBuild.output).toBe(0);
      const nestedNotFoundHtml = fs.readFileSync(path.join(outDir, "404.html"), "utf8");
      expect(nestedNotFoundHtml).toContain('<a href="/docs/guides/" class="not-found-link">');

      fs.writeFileSync(
        configPath,
        'export default { seo: { siteUrl: "https://example.com", pathBase: " docs guides/한글/ " } };',
        "utf8",
      );
      const encodedBuild = runCli(workDir, [
        cliPath,
        "build",
        "--vault",
        vaultPath,
        "--out",
        outDir,
      ]);
      expect(encodedBuild.status, encodedBuild.output).toBe(0);
      const encodedIndexHtml = fs.readFileSync(path.join(outDir, "index.html"), "utf8");
      expect(encodedIndexHtml).toContain(
        '\"manifestUrl\":\"/docs%20guides/%ED%95%9C%EA%B8%80/manifest.json\"',
      );
      expect(encodedIndexHtml).toMatch(
        /"treeModuleUrl":"\/docs%20guides\/%ED%95%9C%EA%B8%80\/assets\/tree\.[a-f0-9]{12}\.js"/,
      );

      const encodedServer = await startStaticServer(outDir, "/docs guides/한글");
      try {
        await page.goto(`${encodedServer.baseUrl}/docs%20guides/%ED%95%9C%EA%B8%80/BC-VO-00/`);
        await expect(page.locator("#viewer-title")).toHaveText("About");
        await expect(page.locator("html")).toHaveAttribute("data-app-ready", "ready");
      } finally {
        await encodedServer.close();
      }
    } finally {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  });

  test("서브패스(/blog)에서 라우팅/내부 링크/본문 fetch가 정상 동작한다", async ({ page }) => {
    test.setTimeout(60_000);
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "mfs-path-base-"));
    const outDir = path.join(workDir, "dist");
    const configPath = path.join(workDir, "blog.config.mjs");
    const pathBase = "/blog";

    fs.writeFileSync(
      configPath,
      `export default { seo: { siteUrl: "https://example.com", pathBase: "${pathBase}" } };`,
      "utf8",
    );

    const build = runCli(workDir, [
      cliPath,
      "build",
      "--vault",
      vaultPath,
      "--out",
      outDir,
      "--new-within-days",
      "9999",
    ]);
    expect(build.status, build.output).toBe(0);
    const notFoundHtml = fs.readFileSync(path.join(outDir, "404.html"), "utf8");
    expect(notFoundHtml).toContain('<a href="/blog/" class="not-found-link">');

    const server = await startStaticServer(outDir, pathBase);
    try {
      await page.goto(`${server.baseUrl}/blog/BC-VO-00/`);
      await expect(page.locator("#viewer-title")).toHaveText("About");
      await waitForTreeReady(page);

      const setupRow = page
        .locator(
          '#tree-root [data-type="item"][data-item-type="file"][data-item-path="최근 문서/BC-VO-02 Setup Guide"]',
        )
        .first();
      await expect(setupRow).toBeVisible();
      await expect(setupRow).toContainText("NEW");
      await setupRow.click({ button: "right" });
      await expect(page.locator("#tree-root .tree-context-link").first()).toHaveAttribute(
        "href",
        "/blog/BC-VO-02/",
      );
      await page.keyboard.press("Escape");
      await setupRow.click();

      await expect(page).toHaveURL(/\/blog\/BC-VO-02\/$/);
      await expect(page.locator("#viewer-title")).toHaveText("Setup Guide");
      await expect(page.locator("#viewer-nav .nav-link-next")).toHaveAttribute(
        "href",
        "/blog/BC-XSS-01/",
      );

      const notFoundResponse = await page.goto(`${server.baseUrl}/blog/missing-document/`);
      expect(notFoundResponse?.status()).toBe(404);
      await expect(page).toHaveURL(`${server.baseUrl}/blog/missing-document/`);
      const homeLink = page.locator(".not-found-link");
      await expect(homeLink).toHaveAttribute("href", "/blog/");
      const homeRequestPromise = page.waitForRequest(
        (request) => request.isNavigationRequest() && request.url() === `${server.baseUrl}/blog/`,
      );
      await homeLink.click();
      const homeRequest = await homeRequestPromise;
      expect(homeRequest.url()).toBe(`${server.baseUrl}/blog/`);
      await expect(page.locator(".app-root")).toBeVisible();
      expect(new URL(page.url()).pathname).toMatch(/^\/blog\//);
    } finally {
      await server.close();
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  });
});
