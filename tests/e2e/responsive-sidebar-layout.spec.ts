import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { waitForAppReady, waitForTreeReady } from "./utils/app-ready";

interface Rect {
  bottom: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
}

interface CliResult {
  status: number | null;
  output: string;
}

const VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 820, height: 1180 },
  { width: 1024, height: 600 },
] as const;

function writeText(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function runCli(cwd: string, args: string[]): CliResult {
  const result = spawnSync("bun", args, { cwd, encoding: "utf8" });
  return {
    status: result.status,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
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

function writeResponsiveVault(vaultDir: string): void {
  const titles = [
    "초장문 모바일 사이드바 레이아웃 검증 문서와 영어 Title For Narrow Rows",
    "한국어와 English Mixed Title That Stays Readable On Small Screens",
    "Very Long English Knowledge Base Article Title With Several Useful Words",
    "중복 제목 확인을 위한 초장문 모바일 사이드바 레이아웃 검증 문서",
  ];

  for (let index = 0; index < 24; index += 1) {
    const title = titles[index % titles.length];
    const prefix = `RS-${String(index + 1).padStart(2, "0")}`;
    writeText(
      path.join(vaultDir, "notes", `responsive-long-title-${index + 1}.md`),
      `---
publish: true
prefix: ${prefix}
category_path: responsive-section-${String(index + 1).padStart(2, "0")}
title: "${title} ${index + 1}"
date: "2026-01-${String((index % 9) + 1).padStart(2, "0")}"
---

# ${title}

Responsive sidebar fixture content.
`,
    );
  }
}

async function openSidebar(page: Page, baseUrl: string): Promise<void> {
  await page.goto(`${baseUrl}/RS-01/`);
  await waitForAppReady(page);
  const toggle = page.getByRole("button", { name: "탐색기 열기" });
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(page.locator("#sidebar-panel")).toHaveAttribute("role", "dialog");
  await waitForTreeReady(page);
}

async function getRect(page: Page, selector: string): Promise<Rect> {
  return page.locator(selector).evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      bottom: rect.bottom,
      height: rect.height,
      left: rect.left,
      right: rect.right,
      top: rect.top,
      width: rect.width,
    };
  });
}

test.describe("responsive Trees sidebar layout", () => {
  const repoRoot = process.cwd();
  const cliPath = path.join(repoRoot, "src/cli.ts");
  let workDir = "";
  let server: { baseUrl: string; close: () => Promise<void> } | null = null;

  test.beforeAll(async () => {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), "mfs-responsive-sidebar-"));
    const vaultDir = path.join(workDir, "vault");
    const outDir = path.join(workDir, "dist");
    writeResponsiveVault(vaultDir);

    const build = runCli(workDir, [
      cliPath,
      "build",
      "--vault",
      vaultDir,
      "--out",
      outDir,
      "--new-within-days",
      "9999",
    ]);
    expect(build.status, build.output).toBe(0);
    server = await startStaticServer(outDir);
  });

  test.afterAll(async () => {
    await server?.close();
    if (workDir) {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  });

  for (const viewport of VIEWPORTS) {
    test(`${viewport.width}x${viewport.height} keeps sidebar sections ordered and contained`, async ({
      page,
    }) => {
      expect(server).not.toBeNull();
      await page.setViewportSize(viewport);
      await openSidebar(page, server!.baseUrl);

      const header = await getRect(page, ".sidebar-header");
      const search = await getRect(page, ".sidebar-search");
      const tree = await getRect(page, "#tree-root");
      const tools = await getRect(page, ".sidebar-tools");
      const sidebar = await getRect(page, "#sidebar-panel");

      expect(header.top).toBeGreaterThanOrEqual(sidebar.top);
      expect(search.top).toBeGreaterThanOrEqual(header.bottom - 1);
      expect(tree.top).toBeGreaterThanOrEqual(search.bottom - 1);
      expect(tools.top).toBeGreaterThanOrEqual(tree.bottom - 1);
      expect(tools.bottom).toBeLessThanOrEqual(Math.min(sidebar.bottom, viewport.height) + 1);
      expect(tree.height).toBeGreaterThan(80);

      const rowState = await page.locator("#tree-root").evaluate(() => {
        const host = document.querySelector("#tree-root file-tree-container");
        const root = host?.shadowRoot;
        const rows = Array.from(
          root?.querySelectorAll('[data-type="item"][data-item-type="file"]') ?? [],
        );
        const firstRow = rows[0] as HTMLElement | undefined;
        const content = firstRow?.querySelector(
          '[data-item-section="content"]',
        ) as HTMLElement | null;
        const decoration = firstRow?.querySelector(
          '[data-item-section="decoration"]',
        ) as HTMLElement | null;
        const rowRect = firstRow?.getBoundingClientRect();
        const contentRect = content?.getBoundingClientRect();
        const decorationRect = decoration?.getBoundingClientRect();
        const fileIcon = firstRow?.querySelector(
          '[data-item-section="icon"]',
        ) as HTMLElement | null;
        return {
          fileIconDisplay: fileIcon ? getComputedStyle(fileIcon).display : "missing",
          itemPadding: host
            ? getComputedStyle(host).getPropertyValue("--trees-item-padding-x-override")
            : "",
          path: firstRow?.dataset.itemPath ?? "",
          text: firstRow?.textContent ?? "",
          rowWithinTree:
            Boolean(rowRect) &&
            rowRect!.left >= host!.getBoundingClientRect().left - 1 &&
            rowRect!.right <= host!.getBoundingClientRect().right + 1,
          lanesDoNotOverlap:
            Boolean(contentRect && decorationRect) &&
            contentRect!.right <= decorationRect!.left + 1,
        };
      });

      expect(rowState.path).not.toContain(".md");
      expect(rowState.text).not.toContain(".md");
      expect(rowState.fileIconDisplay).toBe("none");
      expect(rowState.itemPadding.trim()).toBe("8px");
      expect(rowState.rowWithinTree).toBe(true);
      expect(rowState.lanesDoNotOverlap).toBe(true);

      const scrollState = await page.locator("#tree-root").evaluate((treeRoot) => {
        const host = treeRoot.querySelector("file-tree-container");
        const scroller = host?.shadowRoot?.querySelector(
          '[data-file-tree-virtualized-scroll="true"]',
        ) as HTMLElement | null;
        const beforeWindowY = window.scrollY;
        if (scroller) {
          scroller.scrollTop = 240;
        }
        return {
          beforeWindowY,
          scrollTop: scroller?.scrollTop ?? 0,
          windowY: window.scrollY,
        };
      });
      expect(scrollState.scrollTop).toBeGreaterThan(0);
      expect(scrollState.windowY).toBe(scrollState.beforeWindowY);

      const searchInput = page.locator("#tree-search-input");
      await searchInput.fill("초장문");
      await expect(page.locator("#tree-search-count")).toHaveText(/[1-9]\d*개 일치/);
      await page.locator("#tree-search-clear").click();
      await expect(searchInput).toHaveValue("");
    });
  }
});
