# Deferred tree runtime

## Context

The generated route HTML already contains the article title, metadata, body,
backlinks, and previous/next navigation. The browser entry nevertheless
imported `@pierre/trees` statically, so readers parsed the largest dependency
before the application could finish initializing.

The mother branch produced one 244,503-byte runtime file (69,381 bytes gzip).
Tree behavior was useful in the sidebar, but it was not required to paint or
read the server-rendered article.

## Runtime split

The build now emits two independently hashed JavaScript assets:

- `app.<hash>.js` initializes theme, article navigation, history, content
  enhancement, and the mobile sidebar shell.
- `tree.<hash>.js` contains `@pierre/trees`, its EIAM integration CSS, and the
  five-symbol generic icon sprite.

Each route bootstrap includes a same-origin, path-base-aware `treeModuleUrl`.
The app validates the hashed asset path before using dynamic `import()`.

Tree import is not permitted until two animation frames after the initial
article state is ready. On desktop, the visible sidebar then loads the module
during idle time. Compact layouts do not request the chunk until the sidebar
opens or tree search becomes relevant. Resizing to desktop also triggers the
deferred load safely.

## Failure behavior

A missing or invalid tree chunk does not reject the main app startup and does
not replace the server-rendered article. The sidebar shows:

- an accessible error message;
- a retry action that uses a new module URL query to avoid a cached failed
  module fetch;
- ordinary links for every document in the active branch.

Those links work as client navigation while the app is running and retain real
`href` values as a navigation fallback.

## Critical-path composition

Measurements use the minified browser output from `test-vault` and gzip level
9 before and after the split.

<!-- markdownlint-disable MD013 -->

| Metric | Before | After | Change |
| --- | ---: | ---: | ---: |
| Critical-path JavaScript | 244,503 B | 36,965 B | -207,538 B (-84.9%) |
| Critical-path JavaScript gzip | 69,381 B | 12,264 B | -57,117 B (-82.3%) |
| Deferred tree JavaScript | 0 B | 210,934 B | +210,934 B |
| Deferred tree JavaScript gzip | 0 B | 58,719 B | +58,719 B |
| Total JavaScript | 244,503 B | 247,899 B | +3,396 B (+1.4%) |
| Total JavaScript gzip | 69,381 B | 70,983 B | +1,602 B (+2.3%) |

<!-- markdownlint-enable MD013 -->

The small total increase is the cost of separate module wrappers and gzip
streams. CI limits the critical app to 45,000 raw / 15,000 gzip bytes and also
keeps separate tree and combined budgets, preventing the dependency from
returning to the critical entry.

## Regression coverage

- The size gate verifies exactly one hashed app entry and one hashed tree
  chunk, with minimal icons present only in the deferred asset.
- Route bootstrap checks require the exact hashed tree URL for every generated
  route and enforce the existing 256-byte ceiling.
- Browser coverage aborts the first tree request, verifies that article content
  and fallback links remain usable, and then recovers through retry.
- Performance marks and the browser first-contentful-paint entry verify that
  tree loading begins no earlier than the post-paint opportunity.
- Compact-layout coverage confirms there is no tree request before sidebar
  interaction and that the mounted tree retains existing behavior afterward.
