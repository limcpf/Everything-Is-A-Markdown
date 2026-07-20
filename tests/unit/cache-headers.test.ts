import { describe, expect, test } from "bun:test";
import {
  IMMUTABLE_CACHE_CONTROL,
  REVALIDATE_CACHE_CONTROL,
  renderCloudflarePagesHeaders,
} from "../../src/build/cache-headers";

describe("Cloudflare Pages cache headers", () => {
  test("revalidates mutable output and overrides only exact hashed runtime assets", () => {
    const headers = renderCloudflarePagesHeaders(
      {
        cssRelPath: "assets/app.222222222222.css",
        jsRelPath: "assets/app.111111111111.js",
        treeJsRelPath: "assets/tree.333333333333.js",
        mermaidJsRelPath: "assets/mermaid.444444444444.js",
        mermaidLicenseRelPath: "assets/mermaid.444444444444.LICENSE.txt",
      },
      "",
    );

    expect(headers).toContain(`/*\n  Cache-Control: ${REVALIDATE_CACHE_CONTROL}`);
    expect(headers).not.toContain("/assets/*");
    expect(headers).not.toContain("LICENSE.txt\n  ! Cache-Control");

    for (const assetPath of [
      "/assets/app.111111111111.js",
      "/assets/app.222222222222.css",
      "/assets/mermaid.444444444444.js",
      "/assets/tree.333333333333.js",
    ]) {
      expect(headers).toContain(
        `${assetPath}\n  ! Cache-Control\n  Cache-Control: ${IMMUTABLE_CACHE_CONTROL}`,
      );
    }
  });

  test("prefixes and encodes every rule for a pathBase deployment", () => {
    const headers = renderCloudflarePagesHeaders(
      {
        cssRelPath: "assets/app.222222222222.css",
        jsRelPath: "assets/app.111111111111.js",
        treeJsRelPath: "assets/tree.333333333333.js",
      },
      " docs guides/한글/ ",
    );

    const encodedBase = "/docs%20guides/%ED%95%9C%EA%B8%80";
    expect(headers).toContain(
      `${encodedBase}\n  Cache-Control: ${REVALIDATE_CACHE_CONTROL}\n\n${encodedBase}/*`,
    );
    expect(headers).toContain(`${encodedBase}/assets/app.111111111111.js`);
    expect(headers).not.toMatch(/^\/assets\//m);
  });
});
