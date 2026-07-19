# Runtime navigation contract

Issue #29 makes browser navigation state explicit before the remaining UI controllers are extracted.

## Ownership

`navigation-state.js` is the single owner of:

- the normalized default and active branch;
- the branch-filtered document/tree projection;
- the current document id;
- route normalization and automatic branch switching;
- path-base encoding and location-to-route conversion.

`content-controller.js` owns the navigation lifecycle around that state:

- delegated previous/next and backlink clicks;
- browser history and `popstate` handling;
- content fetches and initial SSR-content reuse;
- breadcrumb, metadata, backlink, and previous/next updates;
- content enhancement and accessibility callbacks;
- setup and cleanup of its event listeners.

The app destroys controller listeners on `pagehide` and calls `setup()` again when a persisted `pageshow` restores the page from the back-forward cache.

The controller receives renderers and lifecycle callbacks instead of importing tree, sidebar, Mermaid, or presentation implementations. This keeps those concerns replaceable in the following sub PRs.

## State transition

1. Normalize the requested route.
2. Resolve it in the active branch projection.
3. If the route belongs to another branch, switch the state projection once.
4. Commit the current document id.
5. Update history when requested.
6. Reuse matching initial SSR content or fetch the document body.
7. Render view chrome, enhance content, synchronize tree selection, and announce completion.

Unknown routes clear the current document selection without changing unrelated controller state.
