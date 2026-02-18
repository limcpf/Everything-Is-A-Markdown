import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";

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
  if (pathname.includes("..")) {
    return null;
  }

  const normalizedBase = normalizePathBase(pathBase);
  let routedPath = pathname;
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
      }),
  };
}

test.describe("pathBase 정식 지원", () => {
  const repoRoot = process.cwd();
  const cliPath = path.join(repoRoot, "src/cli.ts");
  const vaultPath = path.join(repoRoot, "test-vault");

  test("서브패스(/blog)에서 라우팅/내부 링크/본문 fetch가 정상 동작한다", async ({ page }) => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "mfs-path-base-"));
    const outDir = path.join(workDir, "dist");
    const configPath = path.join(workDir, "blog.config.mjs");
    const pathBase = "/blog";

    fs.writeFileSync(
      configPath,
      `export default { seo: { siteUrl: "https://example.com", pathBase: "${pathBase}" } };`,
      "utf8",
    );

    const build = runCli(workDir, [cliPath, "build", "--vault", vaultPath, "--out", outDir]);
    expect(build.status, build.output).toBe(0);

    const server = await startStaticServer(outDir, pathBase);
    try {
      await page.goto(`${server.baseUrl}/blog/BC-VO-00/`);
      await expect(page.locator("#viewer-title")).toHaveText("About");

      const setupRow = page.locator('.tree-file-row[data-route="/BC-VO-02/"]').first();
      await expect(setupRow).toHaveAttribute("href", "/blog/BC-VO-02/");
      await setupRow.click();

      await expect(page).toHaveURL(/\/blog\/BC-VO-02\/$/);
      await expect(page.locator("#viewer-title")).toHaveText("Setup Guide");
      await expect(page.locator("#viewer-nav .nav-link-next")).toHaveAttribute("href", "/blog/BC-XSS-01/");
    } finally {
      await server.close();
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  });
});
