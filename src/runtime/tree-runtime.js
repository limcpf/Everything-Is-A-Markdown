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

[data-type='item'][data-item-type='file'] > [data-item-section='icon'] {
  display: none;
}

[data-type='item'][data-item-type='file'] [data-item-section='decoration'] {
  flex: 0 0 auto;
  margin-left: 6px;
  min-width: max-content;
}
`;

export { FileTree, prepareFileTreeInput, TREE_UNSAFE_CSS };
