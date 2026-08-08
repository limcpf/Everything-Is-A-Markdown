import { FileTree, prepareFileTreeInput } from "@pierre/trees";

const TREE_UNSAFE_CSS = `
[data-type='item'] {
  transition:
    background-color 140ms ease,
    box-shadow 140ms ease,
    color 140ms ease;
}

[data-type='item'][data-item-selected] {
  box-shadow:
    inset 3px 0 0 var(--trees-accent-override, currentColor),
    inset 0 0 0 1px var(--trees-selected-focused-border-color-override, transparent);
}

[data-type='item'][data-item-selected] [data-item-section='content'] {
  font-weight: var(--trees-font-weight-semibold);
}

[data-type='item'][data-item-type='folder'] [data-item-section='content'] {
  color: var(--trees-folder-fg, var(--trees-fg-override, currentColor));
  font-weight: var(--trees-font-weight-semibold);
}

[data-type='item'][data-item-type='file']::after {
  position: absolute;
  right: var(--trees-item-padding-x);
  bottom: -2px;
  left: var(--trees-item-padding-x);
  height: 1px;
  background: var(--trees-row-divider, transparent);
  content: '';
  pointer-events: none;
  transition: opacity 140ms ease;
}

[data-type='item'][data-item-type='file']:hover::after,
[data-type='item'][data-item-type='file'][data-item-selected]::after,
[data-type='item'][data-item-type='file'][data-item-focused='true']::after {
  opacity: 0;
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

[data-type='item'][data-item-type='file'] [data-item-section='content'] {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  gap: 7px;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  color: var(--trees-document-title-fg, var(--trees-fg-override, currentColor));
  line-height: 1.25;
  white-space: nowrap;
}

/* The canonical Trees label remains available for search and accessibility. */
[data-type='item'][data-item-type='file']
  [data-item-section='content']
  > [data-truncate-group-container='middle'] {
  display: none;
}

[data-type='item'][data-item-type='file']
  [data-item-section='content'][data-eiam-tree-prefix]:not([data-eiam-tree-prefix=''])::before {
  display: block;
  flex: 0 0 auto;
  max-width: 7.5rem;
  overflow: hidden;
  padding: 3px 6px;
  border: 1px solid var(--trees-prefix-badge-border, transparent);
  border-radius: 5px;
  background: var(--trees-prefix-badge-bg, transparent);
  color: var(--trees-prefix-badge-fg, currentColor);
  content: attr(data-eiam-tree-prefix);
  font-family: var(--font-mono, monospace);
  font-size: 0.68rem;
  font-weight: 750;
  letter-spacing: 0.015em;
  line-height: 1.1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

[data-type='item'][data-item-type='file']
  [data-item-section='content'][data-eiam-tree-title]::after {
  display: block;
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  content: attr(data-eiam-tree-title);
  text-align: left;
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
