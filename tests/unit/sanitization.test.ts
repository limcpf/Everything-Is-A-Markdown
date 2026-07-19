import { describe, expect, test } from "bun:test";
import { sanitizeMarkdownHtml } from "../../src/markdown";

describe("rendered Markdown sanitization", () => {
  test("removes executable markup while preserving supported document structure", () => {
    const safe = sanitizeMarkdownHtml(`
      <details open onclick="alert(1)">
        <summary>Read me</summary>
        <a href="javascript:alert(2)">unsafe</a>
        <img src="/asset.png" onerror="alert(3)">
        <script>alert(4)</script>
      </details>
    `);

    expect(safe).toContain("<details open>");
    expect(safe).toContain("<summary>Read me</summary>");
    expect(safe).toContain('<img src="/asset.png" />');
    expect(safe).not.toContain("onclick");
    expect(safe).not.toContain("onerror");
    expect(safe).not.toContain("javascript:");
    expect(safe).not.toContain("<script");
  });

  test("returns authored HTML unchanged only for the explicit unsafe policy", () => {
    const authored = '<span onclick="trusted()">trusted vault</span>';
    expect(sanitizeMarkdownHtml(authored, true)).toBe(authored);
  });
});
