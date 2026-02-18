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
}

const DEFAULT_MERMAID_CDN = "https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js";
const DEFAULT_MERMAID_THEME = "default";
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
`,
  );
}

function writeMockMermaidScript(vaultDir: string): void {
  writeText(
    path.join(vaultDir, "assets", "mermaid-mock.js"),
    `window.mermaid = {
  initialize: function () {},
  run: async function ({ nodes }) {
    for (const node of nodes) {
      node.setAttribute("data-mermaid-rendered", "true");
      node.innerHTML = '<svg data-mermaid-mock="ok" role="img"></svg>';
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
      node.innerHTML = '<svg data-mermaid-mock="ok" role="img"></svg>';
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
  if (options.mockScript) {
    writeMockMermaidScript(vaultDir);
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
        await expect(page.locator("pre.mermaid svg[data-mermaid-mock='ok']")).toBeVisible();
        await expect(page.locator(".mermaid-render-error")).toHaveCount(0);
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
        await expect(page.locator("pre.mermaid")).toContainText("flowchart LR");
        await expect(page.locator(".mermaid-render-error")).toContainText("비활성화");

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
        await expect(page.locator("pre.mermaid")).toContainText("flowchart LR");
        await expect(page.locator(".mermaid-render-error")).toContainText("Mermaid 렌더링 실패");
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
        await expect(page.locator("pre.mermaid svg[data-mermaid-mock='ok']")).toHaveCount(1);
        await expect(page.locator(".mermaid-render-error")).toHaveCount(1);
        await expect(page.locator(".mermaid-render-error")).toContainText("Parse error on line 2");
        await expect(page.locator("pre.mermaid").first()).toContainText("BROKEN --> NODE");
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
