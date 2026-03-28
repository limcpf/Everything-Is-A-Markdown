import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";

interface CliResult {
  status: number | null;
  output: string;
}

interface MermaidFixtureOptions {
  enabled: boolean;
  cdnUrl: string;
  theme: string;
  mockScript: boolean;
  mockDimensions?: {
    width: number;
    height: number;
  };
}

const DEFAULT_MERMAID_CDN = "https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js";
const DEFAULT_MERMAID_THEME = "default";
const CONTENT_VISUAL_MAX_WIDTH = 720;
const CONTENT_IMAGE_SQUARE_MAX_WIDTH = 640;
const CONTENT_IMAGE_PORTRAIT_MAX_WIDTH = 560;
const MERMAID_WIDE_MAX_WIDTH = 640;
const MERMAID_TALL_MAX_HEIGHT = 560;
const TEST_ROUTE = "/MER-RT-01/";

function runCli(cwd: string, args: string[]): CliResult {
  const result = spawnSync("bun", args, {
    cwd,
    encoding: "utf8",
  });

  return {
    status: result.status,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
}

function writeText(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function toContentType(filePath: string): string {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  if (filePath.endsWith(".png")) return "image/png";
  if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg")) return "image/jpeg";
  if (filePath.endsWith(".webp")) return "image/webp";
  if (filePath.endsWith(".gif")) return "image/gif";
  return "application/octet-stream";
}

function resolveRequestPath(outDir: string, pathname: string): string | null {
  const cleaned = pathname.replace(/^\/+/, "");
  if (cleaned.includes("..")) {
    return null;
  }

  const direct = path.join(outDir, cleaned);
  if (cleaned && fs.existsSync(direct) && fs.statSync(direct).isFile()) {
    return direct;
  }

  const withIndex = path.join(outDir, cleaned, "index.html");
  if (fs.existsSync(withIndex) && fs.statSync(withIndex).isFile()) {
    return withIndex;
  }

  const fallback404 = path.join(outDir, "404.html");
  if (fs.existsSync(fallback404) && fs.statSync(fallback404).isFile()) {
    return fallback404;
  }

  return null;
}

async function startStaticServer(outDir: string): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const requestUrl = new URL(req.url ?? "/", "http://127.0.0.1");
    const filePath = resolveRequestPath(outDir, requestUrl.pathname);
    if (!filePath) {
      res.statusCode = 404;
      res.end("Not Found");
      return;
    }

    res.statusCode = filePath.endsWith("404.html") ? 404 : 200;
    res.setHeader("Content-Type", toContentType(filePath));
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

function writeMermaidPost(vaultDir: string): void {
  writeText(
    path.join(vaultDir, "posts", "mermaid-runtime.md"),
    `---
publish: true
prefix: MER-RT-01
title: Mermaid Runtime Test
---

# Mermaid Runtime Test

\`\`\`mermaid
flowchart LR
  A --> B
\`\`\`

![Large Runtime Diagram](/assets/large-diagram.svg)

![Tall Runtime Diagram](/assets/tall-diagram.svg)

<figure class="image-frame ratio-4x3 fit-cover">
  <img src="/assets/large-diagram.svg" alt="Framed Cover Diagram" />
</figure>

<figure class="image-frame ratio-4x5 fit-contain">
  <img src="/assets/tall-diagram.svg" alt="Framed Contain Diagram" />
</figure>

\`\`\`ts sample.ts
const greeting = "hello";
console.log(greeting);
\`\`\`
`,
  );
}

function writeFollowupPost(vaultDir: string): void {
  writeText(
    path.join(vaultDir, "posts", "mermaid-runtime-followup.md"),
    `---
publish: true
prefix: MER-RT-02
title: Mermaid Runtime Followup Test
---

# Mermaid Runtime Followup Test

![Followup Tall Diagram](/assets/tall-diagram.svg)
`,
  );
}

function writeLargeImageAsset(vaultDir: string): void {
  writeText(
    path.join(vaultDir, "assets", "large-diagram.svg"),
    `<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="900" viewBox="0 0 1800 900">
  <rect width="1800" height="900" fill="#e6e9ef" />
  <rect x="120" y="120" width="1560" height="660" rx="48" fill="#cba6f7" />
  <text x="900" y="450" text-anchor="middle" dominant-baseline="middle" font-size="108" font-family="Arial, sans-serif" fill="#1e1e2e">
    Runtime Visual Width Fixture
  </text>
</svg>
`,
  );
}

function writeTallImageAsset(vaultDir: string): void {
  writeText(
    path.join(vaultDir, "assets", "tall-diagram.svg"),
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1800" viewBox="0 0 1200 1800">
  <rect width="1200" height="1800" fill="#eff1f5" />
  <rect x="120" y="120" width="960" height="1560" rx="48" fill="#89b4fa" />
  <text x="600" y="900" text-anchor="middle" dominant-baseline="middle" font-size="108" font-family="Arial, sans-serif" fill="#1e1e2e" transform="rotate(-90 600 900)">
    Portrait Runtime Fixture
  </text>
</svg>
`,
  );
}

function writeMockMermaidScript(vaultDir: string): void {
  writeDimensionedMockMermaidScript(vaultDir, { width: 1600, height: 420 });
}

function writeDimensionedMockMermaidScript(
  vaultDir: string,
  dimensions: { width: number; height: number },
): void {
  writeText(
    path.join(vaultDir, "assets", "mermaid-mock.js"),
    `window.mermaid = {
  initialize: function () {},
  run: async function ({ nodes }) {
    for (const node of nodes) {
      node.setAttribute("data-mermaid-rendered", "true");
      node.innerHTML = '<svg data-mermaid-mock="ok" role="img" width="${dimensions.width}" height="${dimensions.height}" viewBox="0 0 ${dimensions.width} ${dimensions.height}"></svg>';
    }
  },
};
`,
  );
}

function writePartialFailureMermaidPost(vaultDir: string): void {
  writeText(
    path.join(vaultDir, "posts", "mermaid-runtime.md"),
    `---
publish: true
prefix: MER-RT-01
title: Mermaid Runtime Test
---

# Mermaid Runtime Test

\`\`\`mermaid
flowchart LR
  BROKEN --> NODE
\`\`\`

\`\`\`mermaid
flowchart LR
  A --> B
\`\`\`
`,
  );
}

function writePartialFailureMermaidScript(vaultDir: string): void {
  writeText(
    path.join(vaultDir, "assets", "mermaid-partial-fail-mock.js"),
    `window.mermaid = {
  initialize: function () {},
  run: async function ({ nodes }) {
    for (const node of nodes) {
      const source = node.textContent || "";
      if (source.includes("BROKEN")) {
        throw new Error("Parse error on line 2");
      }
      node.setAttribute("data-mermaid-rendered", "true");
      node.innerHTML = '<svg data-mermaid-mock="ok" role="img" width="1600" height="420" viewBox="0 0 1600 420"></svg>';
    }
  },
};
`,
  );
}

function writeBlogConfig(workDir: string, options: MermaidFixtureOptions): void {
  writeText(
    path.join(workDir, "blog.config.mjs"),
    `export default {
  staticPaths: ["assets"],
  markdown: {
    images: "keep",
    mermaid: {
      enabled: ${options.enabled},
      cdnUrl: ${JSON.stringify(options.cdnUrl)},
      theme: ${JSON.stringify(options.theme)},
    },
  },
};
`,
  );
}

function createFixture(workDir: string, options: MermaidFixtureOptions): { vaultDir: string; outDir: string } {
  const vaultDir = path.join(workDir, "vault");
  const outDir = path.join(workDir, "dist");

  fs.mkdirSync(path.join(vaultDir, "assets"), { recursive: true });
  writeMermaidPost(vaultDir);
  writeFollowupPost(vaultDir);
  writeLargeImageAsset(vaultDir);
  writeTallImageAsset(vaultDir);
  if (options.mockScript) {
    if (options.mockDimensions) {
      writeDimensionedMockMermaidScript(vaultDir, options.mockDimensions);
    } else {
      writeMockMermaidScript(vaultDir);
    }
  }
  writeBlogConfig(workDir, options);

  return { vaultDir, outDir };
}

test.describe("Mermaid 런타임 회귀 가드", () => {
  const repoRoot = process.cwd();
  const cliPath = path.join(repoRoot, "src/cli.ts");

  test("로컬 mock 스크립트로 Mermaid 다이어그램을 렌더링한다", async ({ page }) => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "mfs-mermaid-render-"));
    const { vaultDir, outDir } = createFixture(workDir, {
      enabled: true,
      cdnUrl: "/assets/mermaid-mock.js",
      theme: "forest",
      mockScript: true,
    });

    try {
      const build = runCli(workDir, [cliPath, "build", "--vault", vaultDir, "--out", outDir]);
      expect(build.status, build.output).toBe(0);

      const server = await startStaticServer(outDir);
      try {
        await page.goto(`${server.baseUrl}${TEST_ROUTE}`);
        await expect(page.locator("#viewer-title")).toHaveText("Mermaid Runtime Test");
        const mermaidBlock = page.locator(".mermaid-block");
        const landscapeImage = page.locator('#viewer-content img[alt="Large Runtime Diagram"]');
        const portraitImage = page.locator('#viewer-content img[alt="Tall Runtime Diagram"]');
        await expect(mermaidBlock).toHaveCount(1);
        await expect(mermaidBlock.locator(".code-header")).toHaveCount(0);
        await expect(mermaidBlock.locator(".code-copy")).toHaveCount(0);
        await expect(mermaidBlock.locator("pre.mermaid svg[data-mermaid-mock='ok']")).toBeVisible();
        await expect(mermaidBlock.locator("pre.mermaid")).toHaveAttribute("data-mermaid-rendered", "true");
        await expect(mermaidBlock.locator("pre.mermaid")).toHaveCSS("display", "flex");
        await expect(mermaidBlock.locator("pre.mermaid")).toHaveCSS("justify-content", "center");

        await expect(page.locator(".code-block .code-header")).toHaveCount(1);
        await expect(page.locator(".code-block .code-copy")).toHaveCount(1);

        const layout = await mermaidBlock.evaluate((block) => {
          const svg = block.querySelector("pre.mermaid svg");
          if (!(svg instanceof SVGElement)) {
            return null;
          }
          const blockRect = block.getBoundingClientRect();
          const svgRect = svg.getBoundingClientRect();
          return {
            blockClientWidth: block.clientWidth,
            blockScrollWidth: block.scrollWidth,
            blockWidth: blockRect.width,
            svgWidth: svgRect.width,
          };
        });
        expect(layout).not.toBeNull();
        if (!layout) {
          throw new Error("Mermaid SVG 레이아웃 정보를 읽지 못했습니다.");
        }
        expect(layout.blockScrollWidth).toBeLessThanOrEqual(layout.blockClientWidth + 1);
        expect(layout.svgWidth).toBeLessThanOrEqual(layout.blockWidth + 1);
        expect(layout.svgWidth).toBeLessThanOrEqual(Math.min(layout.blockWidth, CONTENT_VISUAL_MAX_WIDTH) + 1);

        await expect(landscapeImage).toHaveClass(/is-landscape/);
        await expect(portraitImage).toHaveClass(/is-portrait/);
        await expect(page.locator("#viewer-content figure.content-image").first()).toHaveClass(/is-landscape/);
        const imageLayout = await page.locator("#viewer-content").evaluate(() => {
          const content = document.getElementById("viewer-content");
          const landscape = document.querySelector('#viewer-content img[alt="Large Runtime Diagram"]');
          const portrait = document.querySelector('#viewer-content img[alt="Tall Runtime Diagram"]');
          if (!(landscape instanceof HTMLImageElement) || !(portrait instanceof HTMLImageElement)) {
            return null;
          }
          const contentRect = content instanceof HTMLElement ? content.getBoundingClientRect() : null;
          const landscapeRect = landscape.getBoundingClientRect();
          const portraitRect = portrait.getBoundingClientRect();
          return {
            contentWidth: contentRect ? contentRect.width : null,
            landscapeWidth: landscapeRect.width,
            portraitWidth: portraitRect.width,
          };
        });
        expect(imageLayout).not.toBeNull();
        if (!imageLayout || imageLayout.contentWidth === null) {
          throw new Error("본문 이미지 레이아웃 정보를 읽지 못했습니다.");
        }
        expect(imageLayout.landscapeWidth).toBeLessThanOrEqual(Math.min(imageLayout.contentWidth, CONTENT_VISUAL_MAX_WIDTH) + 1);
        expect(imageLayout.portraitWidth).toBeLessThanOrEqual(Math.min(imageLayout.contentWidth, CONTENT_IMAGE_PORTRAIT_MAX_WIDTH) + 1);
        expect(imageLayout.portraitWidth).toBeLessThan(imageLayout.landscapeWidth);

        await expect(page.locator(".mermaid-render-error")).toHaveCount(0);
      } finally {
        await server.close();
      }
    } finally {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  });

  test("모바일 뷰포트에서도 Mermaid 다이어그램이 잘리지 않는다", async ({ page }) => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "mfs-mermaid-mobile-"));
    const { vaultDir, outDir } = createFixture(workDir, {
      enabled: true,
      cdnUrl: "/assets/mermaid-mock.js",
      theme: "forest",
      mockScript: true,
    });

    try {
      const build = runCli(workDir, [cliPath, "build", "--vault", vaultDir, "--out", outDir]);
      expect(build.status, build.output).toBe(0);

      const server = await startStaticServer(outDir);
      try {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto(`${server.baseUrl}${TEST_ROUTE}`);
        const mermaidBlock = page.locator(".mermaid-block");
        const portraitImage = page.locator('#viewer-content img[alt="Tall Runtime Diagram"]');
        await expect(mermaidBlock.locator("pre.mermaid svg[data-mermaid-mock='ok']")).toBeVisible();

        const mobileLayout = await mermaidBlock.evaluate((block) => {
          const pre = block.querySelector("pre.mermaid");
          const svg = block.querySelector("pre.mermaid svg");
          if (!(pre instanceof HTMLElement) || !(svg instanceof SVGElement)) {
            return null;
          }

          const preStyle = window.getComputedStyle(pre);
          const blockRect = block.getBoundingClientRect();
          const svgRect = svg.getBoundingClientRect();
          return {
            blockClientWidth: block.clientWidth,
            blockScrollWidth: block.scrollWidth,
            blockWidth: blockRect.width,
            svgWidth: svgRect.width,
            preDisplay: preStyle.display,
            preJustifyContent: preStyle.justifyContent,
          };
        });

        expect(mobileLayout).not.toBeNull();
        if (!mobileLayout) {
          throw new Error("모바일 Mermaid 레이아웃 정보를 읽지 못했습니다.");
        }
        expect(mobileLayout.preDisplay).toBe("flex");
        expect(mobileLayout.preJustifyContent).toBe("center");
        expect(mobileLayout.blockScrollWidth).toBeLessThanOrEqual(mobileLayout.blockClientWidth + 1);
        expect(mobileLayout.svgWidth).toBeLessThanOrEqual(mobileLayout.blockWidth + 1);
        expect(mobileLayout.svgWidth).toBeLessThanOrEqual(Math.min(mobileLayout.blockWidth, CONTENT_VISUAL_MAX_WIDTH) + 1);

        await expect(portraitImage).toBeVisible();
        await expect(portraitImage).toHaveClass(/is-portrait/);
        const mobileImageLayout = await page.locator("#viewer-content").evaluate(() => {
          const content = document.getElementById("viewer-content");
          const portrait = document.querySelector('#viewer-content img[alt="Tall Runtime Diagram"]');
          if (!(portrait instanceof HTMLImageElement)) {
            return null;
          }
          const imageRect = portrait.getBoundingClientRect();
          const contentRect = content instanceof HTMLElement ? content.getBoundingClientRect() : null;
          return {
            imageWidth: imageRect.width,
            contentWidth: contentRect ? contentRect.width : null,
          };
        });
        expect(mobileImageLayout).not.toBeNull();
        if (!mobileImageLayout || mobileImageLayout.contentWidth === null) {
          throw new Error("모바일 본문 이미지 레이아웃 정보를 읽지 못했습니다.");
        }
        expect(mobileImageLayout.imageWidth).toBeLessThanOrEqual(mobileImageLayout.contentWidth + 1);
      } finally {
        await server.close();
      }
    } finally {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  });

  test("본문 이미지 프레임 유틸리티와 클라이언트 내비게이션 후처리가 유지된다", async ({ page }) => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "mfs-content-image-layout-"));
    const { vaultDir, outDir } = createFixture(workDir, {
      enabled: true,
      cdnUrl: "/assets/mermaid-mock.js",
      theme: "forest",
      mockScript: true,
    });

    try {
      const build = runCli(workDir, [cliPath, "build", "--vault", vaultDir, "--out", outDir]);
      expect(build.status, build.output).toBe(0);

      const server = await startStaticServer(outDir);
      try {
        await page.goto(`${server.baseUrl}${TEST_ROUTE}`);

        const coverFrame = page.locator("#viewer-content figure.image-frame.fit-cover");
        const containFrame = page.locator("#viewer-content figure.image-frame.fit-contain");
        await expect(coverFrame).toHaveClass(/ratio-4x3/);
        await expect(containFrame).toHaveClass(/ratio-4x5/);
        await expect(containFrame).toHaveClass(/is-portrait/);

        const frameLayout = await page.locator("#viewer-content").evaluate(() => {
          const cover = document.querySelector('#viewer-content figure.image-frame.fit-cover');
          const contain = document.querySelector('#viewer-content figure.image-frame.fit-contain');
          const coverImage = cover?.querySelector('img[alt="Framed Cover Diagram"]');
          const containImage = contain?.querySelector('img[alt="Framed Contain Diagram"]');
          if (
            !(cover instanceof HTMLElement) ||
            !(contain instanceof HTMLElement) ||
            !(coverImage instanceof HTMLImageElement) ||
            !(containImage instanceof HTMLImageElement)
          ) {
            return null;
          }

          const coverStyle = window.getComputedStyle(coverImage);
          const containStyle = window.getComputedStyle(containImage);
          return {
            coverRatio: cover.clientWidth / cover.clientHeight,
            containRatio: contain.clientWidth / contain.clientHeight,
            coverObjectFit: coverStyle.objectFit,
            containObjectFit: containStyle.objectFit,
          };
        });
        expect(frameLayout).not.toBeNull();
        if (!frameLayout) {
          throw new Error("프레임 이미지 레이아웃 정보를 읽지 못했습니다.");
        }
        expect(frameLayout.coverRatio).toBeGreaterThan(1.28);
        expect(frameLayout.coverRatio).toBeLessThan(1.38);
        expect(frameLayout.containRatio).toBeGreaterThan(0.76);
        expect(frameLayout.containRatio).toBeLessThan(0.84);
        expect(frameLayout.coverObjectFit).toBe("cover");
        expect(frameLayout.containObjectFit).toBe("contain");

        const nextLink = page.locator("#viewer-nav .nav-link-next");
        await expect(nextLink).toBeVisible();
        await nextLink.click();
        await expect(page.locator("#viewer-title")).toHaveText("Mermaid Runtime Followup Test");
        await expect(page.locator('#viewer-content img[alt="Followup Tall Diagram"]')).toHaveClass(/is-portrait/);
      } finally {
        await server.close();
      }
    } finally {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  });

  test("가로로 매우 긴 Mermaid 다이어그램은 더 보수적인 최대 폭으로 축소된다", async ({ page }) => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "mfs-mermaid-wide-"));
    const { vaultDir, outDir } = createFixture(workDir, {
      enabled: true,
      cdnUrl: "/assets/mermaid-mock.js",
      theme: "forest",
      mockScript: true,
      mockDimensions: { width: 2400, height: 260 },
    });

    try {
      const build = runCli(workDir, [cliPath, "build", "--vault", vaultDir, "--out", outDir]);
      expect(build.status, build.output).toBe(0);

      const server = await startStaticServer(outDir);
      try {
        await page.goto(`${server.baseUrl}${TEST_ROUTE}`);
        const mermaidBlock = page.locator(".mermaid-block");
        await expect(mermaidBlock.locator("pre.mermaid svg[data-mermaid-mock='ok']")).toBeVisible();
        await expect(mermaidBlock).toHaveClass(/is-wide/);

        const layout = await mermaidBlock.evaluate((block) => {
          const svg = block.querySelector("pre.mermaid svg");
          if (!(svg instanceof SVGElement)) {
            return null;
          }
          const blockRect = block.getBoundingClientRect();
          const svgRect = svg.getBoundingClientRect();
          return {
            blockWidth: blockRect.width,
            svgWidth: svgRect.width,
          };
        });
        expect(layout).not.toBeNull();
        if (!layout) {
          throw new Error("가로형 Mermaid 레이아웃 정보를 읽지 못했습니다.");
        }

        expect(layout.svgWidth).toBeLessThanOrEqual(layout.blockWidth + 1);
        expect(layout.svgWidth).toBeLessThanOrEqual(MERMAID_WIDE_MAX_WIDTH + 1);
      } finally {
        await server.close();
      }
    } finally {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  });

  test("세로로 매우 긴 Mermaid 다이어그램은 최대 높이를 제한한다", async ({ page }) => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "mfs-mermaid-tall-"));
    const { vaultDir, outDir } = createFixture(workDir, {
      enabled: true,
      cdnUrl: "/assets/mermaid-mock.js",
      theme: "forest",
      mockScript: true,
      mockDimensions: { width: 720, height: 2200 },
    });

    try {
      const build = runCli(workDir, [cliPath, "build", "--vault", vaultDir, "--out", outDir]);
      expect(build.status, build.output).toBe(0);

      const server = await startStaticServer(outDir);
      try {
        await page.goto(`${server.baseUrl}${TEST_ROUTE}`);
        const mermaidBlock = page.locator(".mermaid-block");
        await expect(mermaidBlock.locator("pre.mermaid svg[data-mermaid-mock='ok']")).toBeVisible();
        await expect(mermaidBlock).toHaveClass(/is-tall/);

        const layout = await mermaidBlock.evaluate((block) => {
          const svg = block.querySelector("pre.mermaid svg");
          if (!(svg instanceof SVGElement)) {
            return null;
          }
          const svgRect = svg.getBoundingClientRect();
          return {
            svgHeight: svgRect.height,
          };
        });
        expect(layout).not.toBeNull();
        if (!layout) {
          throw new Error("세로형 Mermaid 레이아웃 정보를 읽지 못했습니다.");
        }

        expect(layout.svgHeight).toBeLessThanOrEqual(MERMAID_TALL_MAX_HEIGHT + 1);
      } finally {
        await server.close();
      }
    } finally {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  });

  test("Mermaid 비활성화 시 원본 코드 블록과 안내 메시지를 유지한다", async ({ page }) => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "mfs-mermaid-disabled-"));
    const { vaultDir, outDir } = createFixture(workDir, {
      enabled: false,
      cdnUrl: "/assets/mermaid-mock.js",
      theme: "default",
      mockScript: true,
    });

    try {
      const build = runCli(workDir, [cliPath, "build", "--vault", vaultDir, "--out", outDir]);
      expect(build.status, build.output).toBe(0);

      const server = await startStaticServer(outDir);
      try {
        await page.goto(`${server.baseUrl}${TEST_ROUTE}`);
        const mermaidBlock = page.locator(".mermaid-block");
        await expect(mermaidBlock).toHaveCount(1);
        await expect(mermaidBlock.locator(".code-header")).toHaveCount(0);
        await expect(mermaidBlock.locator(".code-copy")).toHaveCount(0);
        await expect(mermaidBlock.locator("pre.mermaid")).toContainText("flowchart LR");
        await expect(mermaidBlock.locator(".mermaid-render-error")).toContainText("비활성화");

        const scriptCount = await page.evaluate(() => document.querySelectorAll("#mermaid-runtime").length);
        expect(scriptCount).toBe(0);
      } finally {
        await server.close();
      }
    } finally {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  });

  test("Mermaid 로드 실패 시 에러 메시지를 노출한다", async ({ page }) => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "mfs-mermaid-failure-"));
    const { vaultDir, outDir } = createFixture(workDir, {
      enabled: true,
      cdnUrl: "/assets/not-found-mermaid.js",
      theme: "default",
      mockScript: false,
    });

    try {
      const build = runCli(workDir, [cliPath, "build", "--vault", vaultDir, "--out", outDir]);
      expect(build.status, build.output).toBe(0);

      const server = await startStaticServer(outDir);
      try {
        await page.goto(`${server.baseUrl}${TEST_ROUTE}`);
        const mermaidBlock = page.locator(".mermaid-block");
        await expect(mermaidBlock).toHaveCount(1);
        await expect(mermaidBlock.locator("pre.mermaid")).toContainText("flowchart LR");
        await expect(mermaidBlock.locator(".mermaid-render-error")).toContainText("Mermaid 렌더링 실패");
      } finally {
        await server.close();
      }
    } finally {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  });

  test("한 블록의 Mermaid 오류가 다른 블록 렌더링을 막지 않는다", async ({ page }) => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "mfs-mermaid-partial-failure-"));
    const { vaultDir, outDir } = createFixture(workDir, {
      enabled: true,
      cdnUrl: "/assets/mermaid-partial-fail-mock.js",
      theme: "default",
      mockScript: false,
    });

    writePartialFailureMermaidPost(vaultDir);
    writePartialFailureMermaidScript(vaultDir);

    try {
      const build = runCli(workDir, [cliPath, "build", "--vault", vaultDir, "--out", outDir]);
      expect(build.status, build.output).toBe(0);

      const server = await startStaticServer(outDir);
      try {
        await page.goto(`${server.baseUrl}${TEST_ROUTE}`);
        await expect(page.locator(".mermaid-block pre.mermaid svg[data-mermaid-mock='ok']")).toHaveCount(1);
        await expect(page.locator(".mermaid-block .mermaid-render-error")).toHaveCount(1);
        await expect(page.locator(".mermaid-block .mermaid-render-error")).toContainText("Parse error on line 2");
        await expect(page.locator(".mermaid-block pre.mermaid").first()).toContainText("BROKEN --> NODE");
      } finally {
        await server.close();
      }
    } finally {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  });

  test("잘못된 Mermaid 설정값은 기본값으로 폴백된다", async () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "mfs-mermaid-config-"));
    const { vaultDir, outDir } = createFixture(workDir, {
      enabled: true,
      cdnUrl: "javascript:alert(1)",
      theme: "bad theme!",
      mockScript: false,
    });

    try {
      const build = runCli(workDir, [cliPath, "build", "--vault", vaultDir, "--out", outDir]);
      expect(build.status, build.output).toBe(0);

      const manifest = JSON.parse(fs.readFileSync(path.join(outDir, "manifest.json"), "utf8")) as {
        mermaid?: { cdnUrl?: unknown; theme?: unknown };
      };
      expect(manifest.mermaid?.cdnUrl).toBe(DEFAULT_MERMAID_CDN);
      expect(manifest.mermaid?.theme).toBe(DEFAULT_MERMAID_THEME);
    } finally {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  });
});
