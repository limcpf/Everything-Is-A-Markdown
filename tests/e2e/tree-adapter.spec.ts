import { expect, test } from "@playwright/test";
import { buildTreesAdapterInput, formatTreesFileBasename } from "../../src/runtime/tree-adapter.js";

test.describe("Trees sidebar adapter", () => {
  test("EIAM tree nodes become canonical Trees paths with doc route lookup maps", () => {
    const docs = [
      {
        id: "doc-a",
        prefix: "BC-VO-02",
        route: "/BC-VO-02/",
        title: "Setup Guide",
        branch: null,
      },
      {
        id: "doc-b",
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
            prefix: "BC-VO-02",
            route: "/BC-VO-02/",
            title: "Setup Guide",
            isNew: true,
            branch: null,
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
            prefix: "BC-VO-02",
            route: "/BC-VO-02/",
            title: "Setup Guide",
            isNew: true,
            branch: null,
          },
          {
            type: "file",
            id: "doc-b",
            name: "unsafe.md",
            prefix: "BC-XSS-01",
            route: "/BC-XSS-01/",
            title: "Unsafe <img src=x onerror=alert(1)>",
            isNew: false,
            branch: null,
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
                prefix: "BC-VO-02",
                route: "/BC-VO-02/",
                title: "Setup Guide",
                isNew: true,
                branch: null,
              },
            ],
          },
        ],
      },
    ];

    const adapter = buildTreesAdapterInput(tree, docs);

    expect(adapter.paths).toEqual([
      "PINNED/",
      "PINNED/BC-VO-02 Setup Guide.md",
      "Recent/",
      "Recent/BC-VO-02 Setup Guide.md",
      "Recent/BC-XSS-01 Unsafe <img src=x onerror=alert(1)>.md",
      "engineering/",
      "engineering/guides/",
      "engineering/guides/BC-VO-02 Setup Guide.md",
    ]);
    expect(adapter.treePathToDocId.get("Recent/BC-VO-02 Setup Guide.md")).toBe("doc-a");
    expect(adapter.treePathToRoute.get("engineering/guides/BC-VO-02 Setup Guide.md")).toBe("/BC-VO-02/");
    expect(adapter.docIdToTreePaths.get("doc-a")).toEqual([
      "PINNED/BC-VO-02 Setup Guide.md",
      "Recent/BC-VO-02 Setup Guide.md",
      "engineering/guides/BC-VO-02 Setup Guide.md",
    ]);
    expect(adapter.docIdToPrimaryTreePath.get("doc-a")).toBe("PINNED/BC-VO-02 Setup Guide.md");
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
    ).toBe("DOC - 01 Setup - Install.md");
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

    expect(adapter.paths).toEqual(["Docs/", "Docs/Same.md", "Docs/Same (2).md"]);
    expect(adapter.treePathToRoute.get("Docs/Same.md")).toBe("/DOC-A/");
    expect(adapter.treePathToRoute.get("Docs/Same (2).md")).toBe("/DOC-B/");
  });
});
