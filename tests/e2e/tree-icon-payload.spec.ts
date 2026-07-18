import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { waitForAppReady } from "./utils/app-ready";

const MINIMAL_TREE_ICON_IDS = [
  "file-tree-icon-chevron",
  "file-tree-icon-dot",
  "file-tree-icon-ellipsis",
  "file-tree-icon-file",
  "file-tree-icon-lock",
];

test.describe("minimal Trees icon payload", () => {
  test("beta dependency를 exact version으로 유지한다", () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"));
    const lockfile = fs.readFileSync(path.join(process.cwd(), "bun.lock"), "utf8");

    expect(packageJson.dependencies["@pierre/trees"]).toBe("1.0.0-beta.4");
    expect(lockfile).toContain('"@pierre/trees": "1.0.0-beta.4"');
    expect(lockfile).toContain('"@pierre/trees@1.0.0-beta.4"');
  });

  test("generic icon만 사용하면서 keyboard, virtualization, selection, ARIA 동작을 유지한다", async ({ page }) => {
    await page.goto("/BC-VO-00/");
    await waitForAppReady(page);

    const state = await page.locator("#tree-root").evaluate((treeRoot) => {
      const host = treeRoot.querySelector("file-tree-container");
      const root = host?.shadowRoot;
      const tree = root?.querySelector('[role="tree"]');
      const selected = root?.querySelector('[role="treeitem"][aria-selected="true"]');
      const fileIconUses = Array.from(
        root?.querySelectorAll('[data-item-type="file"] [data-item-section="icon"] use') ?? [],
        (use) => use.getAttribute("href"),
      );
      return {
        builtInFileIconCount: root?.querySelectorAll('[id^="file-tree-builtin-"]').length ?? -1,
        fileIconUses,
        hasVirtualScroller: Boolean(root?.querySelector('[data-file-tree-virtualized-scroll="true"]')),
        iconIds: Array.from(root?.querySelectorAll("svg[data-icon-sprite] symbol") ?? [], (icon) => icon.id).sort(),
        selectedAriaLabel: selected?.getAttribute("aria-label") ?? "",
        selectedAriaLevel: selected?.getAttribute("aria-level") ?? "",
        selectedPath: selected?.getAttribute("data-item-path") ?? "",
        treeRole: tree?.getAttribute("role") ?? "",
      };
    });

    expect(state.iconIds).toEqual([...MINIMAL_TREE_ICON_IDS].sort());
    expect(state.builtInFileIconCount).toBe(0);
    expect(state.fileIconUses.length).toBeGreaterThan(0);
    expect(state.fileIconUses.every((href) => href === "#file-tree-icon-file")).toBe(true);
    expect(state.treeRole).toBe("tree");
    expect(state.selectedPath).not.toBe("");
    expect(state.selectedAriaLabel).not.toBe("");
    expect(Number(state.selectedAriaLevel)).toBeGreaterThan(0);
    expect(state.hasVirtualScroller).toBe(true);

    const selectedRow = page.locator(
      '#tree-root [role="treeitem"][aria-selected="true"][data-item-path]',
    ).first();
    await selectedRow.focus();
    const beforePath = await selectedRow.getAttribute("data-item-path");
    await page.keyboard.press("ArrowDown");
    const focusedRow = page.locator('#tree-root [role="treeitem"][data-item-focused="true"]');
    await expect(focusedRow).toHaveCount(1);
    await expect(focusedRow).not.toHaveAttribute("data-item-path", beforePath ?? "");
  });
});
