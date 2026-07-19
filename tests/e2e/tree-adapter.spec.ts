import { expect, test } from "@playwright/test";
import { buildTreesAdapterInput, formatTreesFileBasename } from "../../src/runtime/tree-adapter.js";

test.describe("Trees sidebar adapter", () => {
  test("EIAM tree nodes become canonical Trees paths with doc route lookup maps", () => {
    const docs = [
      {
        id: "doc-a",
        isNew: true,
        prefix: "BC-VO-02",
        route: "/BC-VO-02/",
        title: "Setup Guide",
        branch: null,
      },
      {
        id: "doc-b",
        isNew: false,
        prefix: "BC-XSS-01",
        route: "/BC-XSS-01/",
        title: "Unsafe <img src=x onerror=alert(1)>",
        branch: null,
      },
    ];
    const tree = [
      {
        type: "folder",
        name: "PINNED",
        path: "__virtual__/pinned/category/engineering",
        virtual: true,
        children: [
          {
            type: "file",
            id: "doc-a",
            name: "setup-guide.md",
          },
        ],
      },
      {
        type: "folder",
        name: "Recent",
        path: "__virtual__/recent",
        virtual: true,
        children: [
          {
            type: "file",
            id: "doc-a",
            name: "setup-guide.md",
          },
          {
            type: "file",
            id: "doc-b",
            name: "unsafe.md",
          },
        ],
      },
      {
        type: "folder",
        name: "engineering",
        path: "engineering",
        children: [
          {
            type: "folder",
            name: "guides",
            path: "engineering/guides",
            children: [
              {
                type: "file",
                id: "doc-a",
                name: "setup-guide.md",
              },
            ],
          },
        ],
      },
    ];

    const adapter = buildTreesAdapterInput(tree, docs);

    expect(adapter.paths).toEqual([
      "PINNED/",
      "PINNED/BC-VO-02 Setup Guide",
      "Recent/",
      "Recent/BC-VO-02 Setup Guide",
      "Recent/BC-XSS-01 Unsafe <img src=x onerror=alert(1)>",
      "engineering/",
      "engineering/guides/",
      "engineering/guides/BC-VO-02 Setup Guide",
    ]);
    expect(adapter.treePathToDocId.get("Recent/BC-VO-02 Setup Guide")).toBe("doc-a");
    expect(adapter.treePathToRoute.get("engineering/guides/BC-VO-02 Setup Guide")).toBe(
      "/BC-VO-02/",
    );
    expect(adapter.docIdToTreePaths.get("doc-a")).toEqual([
      "PINNED/BC-VO-02 Setup Guide",
      "Recent/BC-VO-02 Setup Guide",
      "engineering/guides/BC-VO-02 Setup Guide",
    ]);
    expect(adapter.docIdToPrimaryTreePath.get("doc-a")).toBe("PINNED/BC-VO-02 Setup Guide");
    expect(adapter.metadataByTreePath.get("Recent/BC-VO-02 Setup Guide")?.isNew).toBe(true);
  });

  test("file basenames use prefix plus title and avoid path separator leaks", () => {
    expect(
      formatTreesFileBasename(
        {
          name: "fallback.md",
          prefix: "DOC / 01",
          title: "Setup\\Install",
        },
        null,
      ),
    ).toBe("DOC - 01 Setup - Install");
  });

  test("runtime-derived NEW state overrides stale legacy tree metadata", () => {
    const tree = [
      {
        type: "folder",
        name: "Legacy",
        path: "legacy",
        children: [
          { type: "file", id: "recent", name: "recent.md", title: "Recent", isNew: false },
          { type: "file", id: "old", name: "old.md", title: "Old", isNew: true },
        ],
      },
    ];
    const docs = [
      { id: "recent", route: "/RECENT/", title: "Recent", isNew: true },
      { id: "old", route: "/OLD/", title: "Old", isNew: false },
    ];

    const adapter = buildTreesAdapterInput(tree, docs);

    expect(adapter.metadataByTreePath.get("Legacy/Recent")?.isNew).toBe(true);
    expect(adapter.metadataByTreePath.get("Legacy/Old")?.isNew).toBe(false);
  });

  test("duplicate canonical paths receive stable suffixes without changing route lookup", () => {
    const tree = [
      {
        type: "folder",
        name: "Docs",
        path: "docs",
        children: [
          {
            type: "file",
            id: "doc-a",
            name: "same.md",
            route: "/DOC-A/",
            title: "Same",
            isNew: false,
            branch: null,
          },
          {
            type: "file",
            id: "doc-b",
            name: "same.md",
            route: "/DOC-B/",
            title: "Same",
            isNew: false,
            branch: null,
          },
        ],
      },
    ];

    const adapter = buildTreesAdapterInput(tree, []);

    expect(adapter.paths).toEqual(["Docs/", "Docs/Same", "Docs/Same (2)"]);
    expect(adapter.treePathToRoute.get("Docs/Same")).toBe("/DOC-A/");
    expect(adapter.treePathToRoute.get("Docs/Same (2)")).toBe("/DOC-B/");
  });
});
