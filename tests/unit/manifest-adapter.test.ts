import { describe, expect, test } from "bun:test";
import {
  getManifestDocs,
  getRuntimeManifestDocs,
  normalizeManifestPayload,
} from "../../src/runtime/manifest-adapter";

const envelope = {
  branches: ["dev"],
  defaultBranch: "dev",
  mermaid: { cdnUrl: "/mermaid.js", enabled: true, theme: "default" },
  pathBase: "",
  routeMap: { "/A/": "a", "/B/": "b" },
  schemaVersion: 2,
  siteTitle: "Unit Test",
  tree: [],
  ui: { newWithinDays: 7, recentLimit: 5 },
};

describe("manifest transforms", () => {
  test("preserves canonical schema-v2 document order", () => {
    const manifest = normalizeManifestPayload({
      ...envelope,
      docIds: ["b", "a"],
      docsById: {
        a: {
          branch: null,
          categoryPath: "guide",
          contentUrl: "/a.html",
          id: "a",
          route: "/A/",
          tags: [],
          title: "A",
          wikiTargets: [],
          backlinks: [],
        },
        b: {
          branch: null,
          categoryPath: "guide",
          contentUrl: "/b.html",
          id: "b",
          route: "/B/",
          tags: [],
          title: "B",
          wikiTargets: [],
          backlinks: [],
        },
      },
    });

    expect(manifest).not.toBeNull();
    expect(manifest?.locale).toBe("ko");
    expect(getManifestDocs(manifest).map((doc) => doc.id)).toEqual(["b", "a"]);
  });

  test("migrates legacy arrays and derives runtime NEW state", () => {
    const manifest = normalizeManifestPayload({
      ...envelope,
      docs: [
        {
          branch: null,
          categoryPath: "guide",
          contentUrl: "/a.html",
          date: "2026-07-15",
          id: "a",
          route: "/A/",
          tags: [],
          title: "A",
          wikiTargets: [],
          backlinks: [],
        },
      ],
      schemaVersion: 1,
    });

    expect(manifest?.schemaVersion).toBe(2);
    expect(manifest?.docIds).toEqual(["a"]);
    expect(getRuntimeManifestDocs(manifest, Date.parse("2026-07-19T00:00:00Z"))[0]?.isNew).toBe(
      true,
    );
  });

  test("preserves supported locales and deterministically falls back for legacy values", () => {
    const current = normalizeManifestPayload({
      ...envelope,
      locale: "en",
      docIds: [],
      docsById: {},
    });
    const unsupported = normalizeManifestPayload({
      ...envelope,
      locale: "fr",
      docIds: [],
      docsById: {},
    });

    expect(current?.locale).toBe("en");
    expect(unsupported?.locale).toBe("ko");
  });

  test("rejects dangling, duplicate, and unsupported document indexes", () => {
    expect(normalizeManifestPayload({ ...envelope, docIds: ["missing"], docsById: {} })).toBeNull();
    expect(
      normalizeManifestPayload({
        ...envelope,
        docs: [
          { id: "same", route: "/A/" },
          { id: "same", route: "/B/" },
        ],
        schemaVersion: 1,
      }),
    ).toBeNull();
    expect(
      normalizeManifestPayload({ ...envelope, docIds: [], docsById: {}, schemaVersion: 99 }),
    ).toBeNull();
  });
});
