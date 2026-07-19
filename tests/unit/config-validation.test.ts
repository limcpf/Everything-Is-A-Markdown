import path from "node:path";
import { describe, expect, test } from "bun:test";
import { resolveBuildOptions, validateUserConfig, type CliArgs } from "../../src/config";

const baseCli: CliArgs = {
  command: "build",
  exclude: [],
  help: false,
};

describe("user config validation", () => {
  test("validates and normalizes every public config section", () => {
    const warnings: string[] = [];
    const config = validateUserConfig(
      {
        vaultDir: "./vault",
        outDir: "./site",
        exclude: ["private/**"],
        staticPaths: ["./assets/", "assets", "public/favicon.ico"],
        pinnedMenu: {
          label: " RELEASES ",
          sourceDir: " posts\\releases/ ",
          categoryPath: " news / releases/ ",
        },
        ui: {
          newWithinDays: 0,
          recentLimit: 12,
        },
        markdown: {
          wikilinks: false,
          images: "keep",
          gfm: false,
          allowUnsafeHtml: true,
          highlight: {
            engine: "shiki",
            theme: " github-light ",
          },
          mermaid: {
            enabled: false,
            cdnUrl: " /assets/mermaid.js ",
            theme: " forest ",
          },
        },
        seo: {
          siteUrl: " https://example.com ",
          pathBase: " docs/guides/ ",
          siteName: " Example Notes ",
          defaultTitle: " Default Title ",
          defaultDescription: " Description ",
          locale: " en_US ",
          twitterCard: "summary_large_image",
          twitterSite: " @example ",
          twitterCreator: " @author ",
          defaultSocialImage: " /assets/social.png ",
          defaultOgImage: " /assets/og.png ",
          defaultTwitterImage: " /assets/twitter.png ",
        },
      },
      (warning) => warnings.push(warning),
    );

    expect(warnings).toEqual([]);
    expect(config).toMatchObject({
      vaultDir: "./vault",
      outDir: "./site",
      exclude: ["private/**"],
      staticPaths: ["assets", "public/favicon.ico"],
      pinnedMenu: {
        label: "RELEASES",
        sourceDir: "posts/releases",
        categoryPath: "news/releases",
      },
      ui: {
        newWithinDays: 0,
        recentLimit: 12,
      },
      markdown: {
        wikilinks: false,
        images: "keep",
        gfm: false,
        allowUnsafeHtml: true,
        highlight: {
          engine: "shiki",
          theme: "github-light",
        },
        mermaid: {
          enabled: false,
          cdnUrl: "/assets/mermaid.js",
          theme: "forest",
        },
      },
      seo: {
        siteUrl: "https://example.com",
        pathBase: "/docs/guides",
        siteName: "Example Notes",
        defaultTitle: "Default Title",
        defaultDescription: "Description",
        locale: "en_US",
        twitterCard: "summary_large_image",
        twitterSite: "@example",
        twitterCreator: "@author",
        defaultSocialImage: "/assets/social.png",
        defaultOgImage: "/assets/og.png",
        defaultTwitterImage: "/assets/twitter.png",
      },
    });
  });

  const invalidCases: Array<{
    name: string;
    config: unknown;
    field: string;
    receivedType: string;
  }> = [
    { name: "top-level array", config: [], field: "<root>", receivedType: "array" },
    {
      name: "top-level class instance",
      config: new Date(0),
      field: "<root>",
      receivedType: "object",
    },
    { name: "vaultDir", config: { vaultDir: 42 }, field: "vaultDir", receivedType: "number" },
    { name: "outDir", config: { outDir: null }, field: "outDir", receivedType: "null" },
    {
      name: "exclude array",
      config: { exclude: "private/**" },
      field: "exclude",
      receivedType: "string",
    },
    {
      name: "exclude item",
      config: { exclude: ["private/**", false] },
      field: "exclude[1]",
      receivedType: "boolean",
    },
    {
      name: "staticPaths item",
      config: { staticPaths: ["assets", 1] },
      field: "staticPaths[1]",
      receivedType: "number",
    },
    { name: "pinnedMenu", config: { pinnedMenu: null }, field: "pinnedMenu", receivedType: "null" },
    {
      name: "pinnedMenu.label",
      config: { pinnedMenu: { label: 1, sourceDir: "posts" } },
      field: "pinnedMenu.label",
      receivedType: "number",
    },
    {
      name: "pinnedMenu.sourceDir",
      config: { pinnedMenu: { sourceDir: [] } },
      field: "pinnedMenu.sourceDir",
      receivedType: "array",
    },
    {
      name: "pinnedMenu.categoryPath",
      config: { pinnedMenu: { categoryPath: false } },
      field: "pinnedMenu.categoryPath",
      receivedType: "boolean",
    },
    { name: "ui", config: { ui: [] }, field: "ui", receivedType: "array" },
    {
      name: "ui.newWithinDays",
      config: { ui: { newWithinDays: "7" } },
      field: "ui.newWithinDays",
      receivedType: "string",
    },
    {
      name: "ui.recentLimit",
      config: { ui: { recentLimit: 0 } },
      field: "ui.recentLimit",
      receivedType: "number",
    },
    { name: "markdown", config: { markdown: "yes" }, field: "markdown", receivedType: "string" },
    {
      name: "markdown.wikilinks",
      config: { markdown: { wikilinks: "yes" } },
      field: "markdown.wikilinks",
      receivedType: "string",
    },
    {
      name: "markdown.images",
      config: { markdown: { images: "inline" } },
      field: "markdown.images",
      receivedType: "string",
    },
    {
      name: "markdown.gfm",
      config: { markdown: { gfm: 1 } },
      field: "markdown.gfm",
      receivedType: "number",
    },
    {
      name: "markdown.allowUnsafeHtml",
      config: { markdown: { allowUnsafeHtml: null } },
      field: "markdown.allowUnsafeHtml",
      receivedType: "null",
    },
    {
      name: "markdown.highlight",
      config: { markdown: { highlight: [] } },
      field: "markdown.highlight",
      receivedType: "array",
    },
    {
      name: "markdown.highlight.engine",
      config: { markdown: { highlight: { engine: "prism" } } },
      field: "markdown.highlight.engine",
      receivedType: "string",
    },
    {
      name: "markdown.highlight.theme",
      config: { markdown: { highlight: { theme: false } } },
      field: "markdown.highlight.theme",
      receivedType: "boolean",
    },
    {
      name: "markdown.mermaid",
      config: { markdown: { mermaid: null } },
      field: "markdown.mermaid",
      receivedType: "null",
    },
    {
      name: "markdown.mermaid.enabled",
      config: { markdown: { mermaid: { enabled: "yes" } } },
      field: "markdown.mermaid.enabled",
      receivedType: "string",
    },
    {
      name: "markdown.mermaid.cdnUrl",
      config: { markdown: { mermaid: { cdnUrl: 1 } } },
      field: "markdown.mermaid.cdnUrl",
      receivedType: "number",
    },
    {
      name: "markdown.mermaid.theme",
      config: { markdown: { mermaid: { theme: [] } } },
      field: "markdown.mermaid.theme",
      receivedType: "array",
    },
    { name: "seo", config: { seo: false }, field: "seo", receivedType: "boolean" },
    {
      name: "seo.siteUrl",
      config: { seo: { siteUrl: 1 } },
      field: "seo.siteUrl",
      receivedType: "number",
    },
    {
      name: "relative seo.siteUrl",
      config: { seo: { siteUrl: "/relative" } },
      field: "seo.siteUrl",
      receivedType: "string",
    },
    {
      name: "seo.pathBase",
      config: { seo: { pathBase: [] } },
      field: "seo.pathBase",
      receivedType: "array",
    },
    {
      name: "seo.twitterCard",
      config: { seo: { twitterCard: "large" } },
      field: "seo.twitterCard",
      receivedType: "string",
    },
  ];

  for (const { name, config, field, receivedType } of invalidCases) {
    test(`rejects ${name} with a path-aware received type`, () => {
      let message = "";
      try {
        validateUserConfig(config, () => {});
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }

      expect(message).toContain(`"${field}"`);
      expect(message).toContain(`received ${receivedType}`);
    });
  }

  for (const field of [
    "siteName",
    "defaultTitle",
    "defaultDescription",
    "locale",
    "twitterSite",
    "twitterCreator",
    "defaultSocialImage",
    "defaultOgImage",
    "defaultTwitterImage",
  ]) {
    test(`rejects a non-string seo.${field}`, () => {
      expect(() => validateUserConfig({ seo: { [field]: 1 } }, () => {})).toThrow(
        `"seo.${field}" must be a string; received number`,
      );
    });
  }

  test("warns for unknown fields at every supported object depth and ignores them", () => {
    const warnings: string[] = [];
    const config = validateUserConfig(
      {
        typo: true,
        pinnedMenu: { sourceDir: "posts", extra: true },
        ui: { recentLimit: 3, extra: true },
        markdown: {
          extra: true,
          highlight: { extra: true },
          mermaid: { extra: true },
        },
        seo: { siteName: "Notes", extra: true },
      },
      (warning) => warnings.push(warning),
    );

    expect(config).toMatchObject({
      pinnedMenu: { sourceDir: "posts" },
      ui: { recentLimit: 3 },
      seo: { siteName: "Notes" },
    });
    expect(warnings).toEqual([
      '[config] unknown field "typo" will be ignored',
      '[config] unknown field "pinnedMenu.extra" will be ignored',
      '[config] unknown field "ui.extra" will be ignored',
      '[config] unknown field "markdown.extra" will be ignored',
      '[config] unknown field "markdown.highlight.extra" will be ignored',
      '[config] unknown field "markdown.mermaid.extra" will be ignored',
      '[config] unknown field "seo.extra" will be ignored',
    ]);
  });

  test("keeps the documented safe fallback for invalid Mermaid string values", () => {
    const warnings: string[] = [];
    const config = validateUserConfig(
      {
        markdown: {
          mermaid: {
            cdnUrl: "javascript:alert(1)",
            theme: "bad theme!",
          },
        },
      },
      (warning) => warnings.push(warning),
    );

    expect(config.markdown?.mermaid).toEqual({
      enabled: undefined,
      cdnUrl: "https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js",
      theme: "default",
    });
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toContain('"markdown.mermaid.cdnUrl"');
    expect(warnings[1]).toContain('"markdown.mermaid.theme"');
  });

  test("preserves valid path and glob strings for backward compatibility", () => {
    expect(
      validateUserConfig(
        {
          vaultDir: " vault with edge spaces ",
          outDir: " output with edge spaces ",
          exclude: [" private notes/** "],
        },
        () => {},
      ),
    ).toMatchObject({
      vaultDir: " vault with edge spaces ",
      outDir: " output with edge spaces ",
      exclude: [" private notes/** "],
    });
  });

  test("validates the complete user config even when CLI values would override it", () => {
    expect(() =>
      resolveBuildOptions(
        { ...baseCli, vaultDir: "./cli-vault" },
        { vaultDir: 42 },
        null,
        "/workspace",
      ),
    ).toThrow('"vaultDir" must be a string; received number');
  });

  test("resolves normalized config into backward-compatible build options", () => {
    const options = resolveBuildOptions(
      { ...baseCli, exclude: ["drafts/**"] },
      {
        vaultDir: "./vault",
        outDir: "./site",
        exclude: ["private/**"],
        seo: { siteName: "Notes without canonical URLs" },
      },
      null,
      "/workspace",
    );

    expect(options.vaultDir).toBe(path.join("/workspace", "vault"));
    expect(options.outDir).toBe(path.join("/workspace", "site"));
    expect(options.exclude).toEqual([".obsidian/**", "private/**", "drafts/**"]);
    expect(options.siteTitle).toBe("Notes without canonical URLs");
    expect(options.seo).toBeNull();
  });
});
