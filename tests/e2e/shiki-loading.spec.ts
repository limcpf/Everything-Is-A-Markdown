import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { createMarkdownRenderer } from "../../src/markdown";
import { DEFAULT_RUNTIME_LAYOUT } from "../../src/defaults";
import type { BuildOptions, WikiResolver } from "../../src/types";

const resolver: WikiResolver = {
  resolve: () => null,
};

function buildOptions(shikiTheme = "github-dark"): BuildOptions {
  return {
    vaultDir: ".",
    outDir: "dist",
    exclude: [],
    staticPaths: [],
    newWithinDays: 7,
    recentLimit: 5,
    defaultBranch: "dev",
    pinnedMenu: null,
    wikilinks: false,
    imagePolicy: "omit-local",
    gfm: true,
    allowUnsafeHtml: false,
    shikiTheme,
    mermaid: {
      enabled: false,
      cdnUrl: "",
      theme: "default",
    },
    layout: { ...DEFAULT_RUNTIME_LAYOUT },
    seo: null,
  };
}

test.describe("fine-grained Shiki loading", () => {
  test("default grammar와 선택한 theme를 full registry 없이 로드한다", async () => {
    const defaultRenderer = await createMarkdownRenderer(buildOptions());
    const defaultResult = await defaultRenderer.render(
      "```ts\nconst answer: number = 42;\n```",
      resolver,
    );
    expect(defaultResult.html).toContain('class="shiki github-dark"');
    expect(defaultResult.html).toContain('<span style="color:#F97583">const</span>');

    const selectedThemeRenderer = await createMarkdownRenderer(buildOptions("nord"));
    const selectedThemeResult = await selectedThemeRenderer.render(
      '```json\n{"answer": 42}\n```',
      resolver,
    );
    expect(selectedThemeResult.html).toContain('class="shiki nord"');
  });

  test("fence에서 발견한 추가 언어와 비파일명 alias를 on demand로 로드한다", async () => {
    const renderer = await createMarkdownRenderer(buildOptions());
    const [python, cpp] = await Promise.all([
      renderer.render("```python\ndef greet(name):\n    return name\n```", resolver),
      renderer.render("```c++\nint main() { return 0; }\n```", resolver),
    ]);

    expect(python.html).toContain('<span style="color:#F97583">def</span>');
    expect(cpp.html).toContain('<span style="color:#F97583">int</span>');
    expect(cpp.html).toContain('<span class="code-filename">c++</span>');
  });

  test("알 수 없는 fence 언어는 escaped plaintext로 렌더링한다", async () => {
    const renderer = await createMarkdownRenderer(buildOptions());
    const result = await renderer.render("```eiam-unknown\n<tag> & data\n```", resolver);

    expect(result.html).toContain('<span class="code-filename">eiam-unknown</span>');
    expect(result.html).toContain("<span>&lt;tag&gt; &amp; data</span>");
  });

  test("알 수 없거나 안전하지 않은 theme module 이름을 명확히 거부한다", async () => {
    await expect(createMarkdownRenderer(buildOptions("eiam-unknown"))).rejects.toThrow(
      '[markdown] Unknown Shiki theme: "eiam-unknown".',
    );
    await expect(createMarkdownRenderer(buildOptions("../github-dark"))).rejects.toThrow(
      '[markdown] Invalid Shiki theme: "../github-dark".',
    );
  });

  test("umbrella package와 generated registry import가 dependency graph에 재진입하지 않는다", () => {
    const repoRoot = process.cwd();
    const source = fs.readFileSync(path.join(repoRoot, "src/markdown.ts"), "utf8");
    const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
    const lockfile = fs.readFileSync(path.join(repoRoot, "bun.lock"), "utf8");

    expect(source).not.toMatch(/from ["']shiki(?:\/|["'])/);
    expect(source).not.toMatch(/from ["']@shikijs\/(?:langs|themes)["']/);
    expect(source).not.toContain("bundledLanguages");
    expect(source).not.toContain("bundledThemes");
    expect(packageJson.dependencies).not.toHaveProperty("shiki");
    expect(packageJson.dependencies).toMatchObject({
      "@shikijs/core": "4.2.0",
      "@shikijs/engine-javascript": "4.2.0",
      "@shikijs/langs": "4.2.0",
      "@shikijs/themes": "4.2.0",
    });
    expect(lockfile).not.toMatch(/^    "shiki": \[/m);
    expect(lockfile).not.toMatch(/^    "@shikijs\/engine-oniguruma": \[/m);
  });
});
