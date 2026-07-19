# Tree icon payload reduction

## Context

`@pierre/trees@1.0.0-beta.4` provides the search, keyboard, selection,
virtualization, and ARIA behavior used by the sidebar. Its root entry also
imports a 46,827-byte built-in icon module containing file-name rules,
extension rules, and SVGs for 53 file types.

The public `icons: "minimal"` option changes which sprite is selected at
runtime, but the generated catalog still remains in the browser bundle. A
control build with that option and no shim was 288,323 bytes raw / 83,608 bytes
gzip and still contained all 53 file-type symbol IDs.

## Implementation

- Keep `@pierre/trees` exact-pinned at `1.0.0-beta.4`.
- Configure `FileTree` with the supported `icons: "minimal"` option.
- During the browser build, redirect the pinned package internal
  `builtInIcons.js` imports to EIAM's five-symbol generic sprite shim.
- Fail the build if the pinned module layout no longer matches or a
  `file-tree-builtin-*` marker remains.
- Enforce 260,000 raw / 75,000 gzip JavaScript budgets and verify all five
  required generic symbol IDs in `check:size`.

The shim retains only chevron, dot, ellipsis, file, and lock symbols. It does
not replace the tree controller or renderer, so keyboard handling, search,
virtualization, selection, and ARIA semantics continue to come from the pinned
dependency.

## Bundle composition

Measurements use the minified browser output from `test-vault` and gzip level
9, before and after this change.

<!-- markdownlint-disable MD013 -->

| Metric | Before | After | Change |
| --- | ---: | ---: | ---: |
| Runtime JavaScript | 288,307 B | 244,503 B | -43,804 B (-15.2%) |
| Runtime JavaScript gzip | 83,595 B | 69,381 B | -14,214 B (-17.0%) |
| Built-in file-type symbol IDs | 53 | 0 | -53 |
| Required generic symbol IDs | 5 | 5 | unchanged |

<!-- markdownlint-enable MD013 -->

The package installation footprint is intentionally unchanged. The dependency
remains available for its supported tree model and rendering behavior; only
the unused browser icon catalog is removed from generated output.

## Regression coverage

- `check:size` rejects a reintroduced built-in catalog and enforces the lower
  gzip ceiling.
- Browser coverage asserts the exact five-symbol sprite and generic file icon
  references.
- The same browser coverage verifies `tree`/`treeitem` ARIA state, selected-row
  metadata, ArrowDown focus movement, and the virtualized scroller.
- Existing tree-search, responsive virtualization, navigation-selection, and
  mobile focus tests remain in the full E2E suite.
