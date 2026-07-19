import { FileTree, prepareFileTreeInput } from "@pierre/trees";

const TREE_UNSAFE_CSS = `
[data-type='item'][data-item-selected] {
  border-left: 4px solid var(--trees-accent-override, currentColor);
  box-shadow: inset 0 0 0 1px var(--trees-selected-focused-border-color-override, transparent);
  padding-left: calc(var(--trees-item-padding-x) - 4px);
}

[data-type='item'][data-item-selected] [data-item-section='content'] {
  font-weight: var(--trees-font-weight-semibold);
}

/* EIAM owns the visible search controls while Trees keeps search projection enabled. */
[data-file-tree-search-container] {
  display: none;
}

[data-item-section='decoration'] > span {
  flex: 0 0 auto;
  width: auto;
  padding: 2px 6px;
  border-radius: 999px;
  background: var(--trees-new-badge-bg, #d20f39);
  color: var(--trees-new-badge-fg, #ffffff);
  font-size: 0.625rem;
  font-weight: 800;
  line-height: 1;
}

[data-type='item'][data-item-type='file'] [data-item-section='content'] {
  display: flex;
  align-items: center;
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

[data-type='item'][data-item-type='file'] > [data-item-section='icon'] {
  display: none;
}

.tree-item-label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
}

.tree-item-prefix {
  flex: 0 0 auto;
  max-width: 6.5rem;
  overflow: hidden;
  color: var(--trees-fg-muted, currentColor);
  font-family: var(--font-mono, monospace);
  font-size: 0.66rem;
  font-weight: 700;
  line-height: 1.15;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tree-item-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

[data-type='item'][data-item-type='file'] [data-item-section='decoration'] {
  flex: 0 0 auto;
  margin-left: 6px;
  min-width: max-content;
}
`;

export { FileTree, prepareFileTreeInput, TREE_UNSAFE_CSS };
