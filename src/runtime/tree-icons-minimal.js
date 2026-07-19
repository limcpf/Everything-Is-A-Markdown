const MINIMAL_TREE_ICON_SPRITE = `<svg data-icon-sprite aria-hidden="true" width="0" height="0">
  <symbol id="file-tree-icon-chevron" viewBox="0 0 16 16">
    <path d="m3.5 5.5 4.5 4.5 4.5-4.5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"/>
  </symbol>
  <symbol id="file-tree-icon-dot" viewBox="0 0 6 6">
    <circle cx="3" cy="3" r="3" fill="currentColor"/>
  </symbol>
  <symbol id="file-tree-icon-file" viewBox="0 0 16 16">
    <path d="M3 1.75h6l4 4v8.5H3z" fill="currentColor" opacity=".45"/>
    <path d="M9 1.75v4h4" fill="none" stroke="currentColor" stroke-linejoin="round"/>
  </symbol>
  <symbol id="file-tree-icon-lock" viewBox="0 0 16 16">
    <path d="M4.5 7V5a3.5 3.5 0 0 1 7 0v2M3 7h10v7H3z" fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="1.5"/>
  </symbol>
  <symbol id="file-tree-icon-ellipsis" viewBox="0 0 16 16">
    <circle cx="3.5" cy="8" r="1.25" fill="currentColor"/>
    <circle cx="8" cy="8" r="1.25" fill="currentColor"/>
    <circle cx="12.5" cy="8" r="1.25" fill="currentColor"/>
  </symbol>
</svg>`;

export function getBuiltInSpriteSheet() {
  return MINIMAL_TREE_ICON_SPRITE;
}

export function getBuiltInFileIconName() {
  return "file-tree-icon-file";
}

export function isColoredBuiltInIconSet() {
  return false;
}

export function resolveBuiltInFileIconToken() {
  return undefined;
}
