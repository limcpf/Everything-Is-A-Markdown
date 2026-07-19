import { describe, expect, test } from "bun:test";
import { buildExcluder, slugifySegment, stripMdExt, toDocId, toRoute } from "../../src/utils";
import {
  normalizeViewPathBase,
  normalizeViewPathname,
  normalizeViewRoute,
  stripViewPathBase,
  toViewPathWithBase,
} from "../../src/view-contract";

describe("path and route normalization", () => {
  test("derives stable document identifiers from Markdown paths", () => {
    expect(stripMdExt("guides/Setup.MD")).toBe("guides/Setup");
    expect(toDocId("guides/Setup")).toBe("guides__Setup");
  });

  test("normalizes Unicode slugs, punctuation, whitespace, and empty segments", () => {
    expect(slugifySegment(" Alice's  시작_문서! ")).toBe("alices-시작-문서");
    expect(slugifySegment("---")).toBe("untitled");
    expect(toRoute(" Guides/Alice's  시작_문서! ")).toBe("/guides/alices-시작-문서/");
  });

  test("normalizes, strips, and reapplies encoded deployment base paths", () => {
    expect(normalizeViewPathname("docs%20guides//한글")).toBe("/docs guides/한글");
    expect(normalizeViewRoute("guide")).toBe("/guide/");
    expect(normalizeViewPathBase(" docs guides/한글/ ")).toBe("/docs guides/한글");
    expect(stripViewPathBase("/docs/guide/", "/docs")).toBe("/guide/");
    expect(toViewPathWithBase("/A B/", "/docs")).toBe("/docs/A%20B/");
  });

  test("applies the same exclusion patterns to files and directories", () => {
    const isExcluded = buildExcluder([".obsidian/**", "drafts/**"]);
    expect(isExcluded(".obsidian/plugins/config.json", false)).toBe(true);
    expect(isExcluded("drafts", true)).toBe(true);
    expect(isExcluded("published/post.md", false)).toBe(false);
  });
});
