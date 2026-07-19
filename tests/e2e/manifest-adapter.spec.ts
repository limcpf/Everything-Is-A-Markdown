import { expect, test } from "@playwright/test";
import {
  getManifestDocs,
  getRuntimeManifestDocs,
  normalizeManifestPayload,
} from "../../src/runtime/manifest-adapter.js";

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
    expect(normalized?.locale).toBe("ko");
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

  test("NEW 상태는 manifest date와 runtime 시각으로 파생한다", () => {
    const normalized = normalizeManifestPayload({
      ...envelope,
      schemaVersion: 2,
      ui: { newWithinDays: 10 },
      docIds: ["recent", "old"],
      docsById: {
        recent: { id: "recent", route: "/RECENT/", date: "2026-07-15", isNew: false },
        old: { id: "old", route: "/OLD/", date: "2026-07-01", isNew: true },
      },
    });

    const docs = getRuntimeManifestDocs(normalized, Date.parse("2026-07-18T00:00:00Z"));
    expect(docs.map((doc) => [doc.id, doc.isNew])).toEqual([
      ["recent", true],
      ["old", false],
    ]);
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

  test("locale은 지원값을 유지하고 이전 payload에는 한국어 fallback을 적용한다", () => {
    expect(
      normalizeManifestPayload({
        ...envelope,
        schemaVersion: 2,
        locale: "en",
        docIds: [],
        docsById: {},
      })?.locale,
    ).toBe("en");
    expect(
      normalizeManifestPayload({
        ...envelope,
        schemaVersion: 2,
        locale: "fr",
        docIds: [],
        docsById: {},
      })?.locale,
    ).toBe("ko");
  });
});
