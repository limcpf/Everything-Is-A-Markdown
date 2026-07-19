# Build pipeline module boundaries

Issue #29 splits the build entry point into phases with explicit inputs and outputs. `src/build.ts` remains the public facade, while `src/build/pipeline.ts` only composes the phases below.

## Phase map

| Module | Responsibility | Main input | Main output |
| --- | --- | --- | --- |
| `build/storage.ts` | Validate ownership and cache paths, inspect previous state, claim output, persist cache | `BuildOptions` | `BuildStorageState` |
| `build/source.ts` | Scan Markdown, normalize frontmatter, assign routes, build wiki indexes | options and cached sources | `ReadDocsResult`, `WikiLookup` |
| `build/graph.ts` | Build sidebar tree, manifest, branches, and backlinks | documents and options | `DocumentGraphResult` |
| `build/content.ts` | Render changed Markdown and reuse unchanged output | documents, previous cache, wiki index | `RenderDocumentsResult` |
| `build/output.ts` | Bundle runtime assets, copy static files, write shells and SEO files | output state, graph, rendered content | finalized `OutputPhaseState` |

Shared phase shapes live in `build/contracts.ts`. Stable filename and site-title rules shared by phases live in `build/shared.ts`.

## Composition order

1. Inspect storage without claiming an output directory.
2. Validate static output paths and read published source documents.
3. Claim the output only after source validation succeeds.
4. Prepare runtime/static output state.
5. Build the document graph and render content.
6. Emit route pages and SEO artifacts, remove stale files, and persist the cache.

This ordering preserves the safety rule that an invalid vault must not claim or overwrite an output directory.

## Verification contract

- `build-phases.spec.ts` exercises the pure document graph independently and guards the composition-only entry point.
- `build-regression.spec.ts` covers output ownership, cache reuse, incremental rendering, route generation, runtime assets, and static path safety across the extracted phases.
