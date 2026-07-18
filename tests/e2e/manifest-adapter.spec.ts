import { expect, test } from "@playwright/test";
import { getManifestDocs, normalizeManifestPayload } from "../../src/runtime/manifest-adapter.js";

const envelope = {
  tree: [],
  routeMap: {},
  defaultBranch: "dev",
};

test.describe("manifest schema adapter", () => {
  test("schema v2의 canonical doc 순서를 유지한다", () => {
    const normalized = normalizeManifestPayload({
      ...envelope,
      schemaVersion: 2,
      docIds: ["doc-b", "doc-a"],
      docsById: {
        "doc-a": { id: "doc-a", route: "/A/" },
        "doc-b": { id: "doc-b", route: "/B/" },
      },
    });

    expect(normalized).not.toBeNull();
    expect(getManifestDocs(normalized).map((doc) => doc.route)).toEqual(["/B/", "/A/"]);
  });

  test("legacy docs array payload를 schema v2 index로 migration한다", () => {
    const legacy = {
      ...envelope,
      schemaVersion: 1,
      docs: [
        { id: "doc-a", route: "/A/" },
        { id: "doc-b", route: "/B/" },
      ],
    };

    const normalized = normalizeManifestPayload(legacy);

    expect(normalized).toMatchObject({
      schemaVersion: 2,
      docIds: ["doc-a", "doc-b"],
      docsById: {
        "doc-a": { id: "doc-a", route: "/A/" },
        "doc-b": { id: "doc-b", route: "/B/" },
      },
    });
    expect(normalized).not.toHaveProperty("docs");
  });

  test("unsupported version과 dangling doc reference를 거부한다", () => {
    expect(
      normalizeManifestPayload({
        ...envelope,
        schemaVersion: 3,
        docIds: [],
        docsById: {},
      }),
    ).toBeNull();

    expect(
      normalizeManifestPayload({
        ...envelope,
        schemaVersion: 2,
        docIds: ["missing"],
        docsById: {},
      }),
    ).toBeNull();
  });
});
