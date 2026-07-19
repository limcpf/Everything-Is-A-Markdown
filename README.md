# Everything-Is-A-Markdown (EIAM)

Language: **English** | [한국어](README.ko.md)

Everything-Is-A-Markdown is a Bun-based CLI that turns a local Markdown vault into a static site with a file-explorer UI. It is designed for workflows where most notes stay private and only explicitly published documents are exposed as a browsable website.

The generated site keeps a two-panel experience:

- Left: folder tree, virtual folders, branch filters
- Right: rendered document viewer with metadata, backlinks, and previous/next navigation

## What It Does

- Builds a static site from a local Markdown vault
- Publishes only notes with `publish: true`
- Requires `prefix` and `category_path` for every published note
- Uses `prefix` as the public route and `category_path` as the sidebar folder path
- Supports Obsidian-style wikilinks such as `[[note]]` and `[[note|label]]`
- Renders code blocks with Shiki
- Renders Mermaid blocks in the browser with runtime fallback handling
- Generates per-route HTML pages for direct access without SPA-only routing
- Produces a manifest used by the runtime tree/navigation UI
- Supports a `Recent` virtual folder and an optional pinned virtual folder
- Supports branch-based filtering in the sidebar
- Can generate sitemap/robots/canonical metadata when SEO config is provided

## Important Behavior

This project currently uses `prefix`-based public routes, not vault-relative path routes. Sidebar folders are built from `category_path`, not from the actual file location.

Example:

- Source file: `posts/2024/setup-guide.md`
- Frontmatter: `prefix: BC-VO-02`
- Public route: `/BC-VO-02/`

If two notes normalize to the same public route, the builder keeps both and automatically appends a suffix to later collisions.

## Who This Fits

- Obsidian users who want selective publishing
- Personal docs/blog workflows backed by a local vault
- Static hosting targets such as Cloudflare Pages, GitHub Pages, or any plain file server
- Projects that want a lightweight runtime instead of a full app framework

## Requirements

- `bun` installed
- A Markdown vault directory

This repository is authored around Bun. The CLI entry point is `src/cli.ts`, and package scripts assume Bun is available.

## Install

For local development in this repository:

```bash
bun install
```

To run the published package without cloning:

```bash
bunx @limcpf/everything-is-a-markdown build --vault ./vault --out ./dist
```

## Quick Start

1. Prepare a vault with Markdown files.
2. Add frontmatter to notes you want to publish.
3. Run a build or start the dev server.

Example:

```bash
bun run dev -- --vault ./test-vault --out ./dist
```

Build once:

```bash
bun run build -- --vault ./test-vault --out ./dist
```

Clean generated artifacts:

```bash
bun run clean -- --out ./dist
```

## CLI

```bash
bun run src/cli.ts [build|dev|clean] [options]
```

Package script aliases:

- `bun run build`
- `bun run dev`
- `bun run clean`
- `bun run blog`

Options:

- `--vault <path>`: vault root directory, default `.`.
- `--out <path>`: output directory, default `dist`.
- `--exclude <glob>`: exclude glob pattern, repeatable. `.obsidian/**` is excluded by default.
- `--new-within-days <n>`: NEW badge threshold, integer `>= 0`, default `7`.
- `--recent-limit <n>`: number of items in the `Recent` virtual folder, integer `>= 1`, default `5`.
- `--menu-config <path>`: JSON file that overrides `pinnedMenu`.
- `--port <n>`: dev server port, default `3000`.
- `-h`, `--help`: show help.

Notes:

- Unknown CLI options fail fast.
- Every value-taking option fails with `[cli] Missing value for <option>` when its value is omitted or the next argument is another flag.
- Invalid numeric options fail fast.
- Builds validate and read the vault before marking a dedicated output directory with `.eiam-output.json`, bind that marker to a cache namespace derived from the canonical vault, output, and cache-root paths, and refuse to claim a non-empty unmarked or mismatched directory.
- `dev` aborts before starting its watcher or server when the initial build cannot claim the output safely; later rebuild failures are logged without stopping an already-safe server.
- Build migration and `clean` remove `.cache/build-index.json` only when it matches a historical EIAM cache schema, including when either command must reject a pre-marker output directory. Config validation rejects reserved static paths before migration or storage inspection. Outputs that contain or sit inside the cache root, symlinked cache components/namespaces/indexes, and static paths that collide with the reserved `.eiam-output.json` marker are rejected; `clean` otherwise removes only the marked output directory and its matching EIAM cache namespace, preserving sibling namespaces and unrelated `.cache` data.

## Frontmatter

Only documents with `publish: true` are considered for output.

### Required for published docs

- `publish: true`
- `prefix: "BC-VO-02"`
- `category_path: "engineering/blog/frontend"`

If `publish: true` is set but `prefix` or `category_path` is missing, the note is skipped and a build warning is emitted.

### Supported fields

- `title`: display title. Falls back to a title derived from the file name.
- `description`: summary used in UI and SEO metadata.
- `tags`: string array.
- `date` or `createdDate`: publish/created date.
- `updatedDate`, `modifiedDate`, or `lastModified`: update date.
- `branch`: branch label used by the runtime filter UI.
- `draft: true`: excludes the note even if `publish: true`.

Example:

```md
---
publish: true
prefix: BC-VO-02
category_path: engineering/blog/frontend
branch: dev
title: Setup Guide
date: "2024-09-15"
updatedDate: "2024-09-20T09:30:00"
description: How to set up your development environment
tags: ["tutorial", "setup"]
---
```

## Routing Model

Public routes are derived from `prefix`, not from the file path.

Sidebar folders are derived from `category_path`, not from the file path.

Normalization rules:

- trims whitespace
- normalizes Unicode
- converts spaces and `_` to `-`
- converts `/` to `-`
- removes unsupported punctuation
- preserves letter case from the original prefix

Examples:

- `prefix: BC-VO-02` -> `/BC-VO-02/`
- `prefix: Docs / Intro` -> `/Docs-Intro/`

The root `index.html` opens a default home document. If a document route is `/index/`, that route is preferred as home; otherwise the most recent document in the default branch is used.

## Output Structure

The build writes a static site into `dist/` by default.

Typical output:

```text
dist/
  404.html
  index.html
  manifest.json
  robots.txt              # only when seo.siteUrl is configured
  sitemap.xml             # only when seo.siteUrl is configured
  _app/index.html
  assets/
    app.<hash>.css
    app.<hash>.js
  content/
    <sha1-of-doc-id>.html
  BC-VO-00/
    index.html
  BC-VO-01/
    index.html
```

Key points:

- Every published route gets its own `index.html` for direct access.
- Rendered article bodies are stored separately under `dist/content/`.
- Production JavaScript and CSS are minified, then content-hashed from the final emitted bytes.
- `manifest.json` uses schema v2: `docIds` preserves order, `docsById` is the canonical metadata index, and tree file nodes carry document references instead of duplicated metadata. The runtime adapter also accepts legacy unversioned/v1 `docs` arrays during migration.
- Route HTML embeds only a small path-aware runtime bootstrap; the shared manifest is fetched once from `manifest.json` instead of being copied into every generated page.
- Generated files omit wall-clock build metadata and derived current-time flags, so two builds with unchanged content and config produce byte-identical output. The runtime derives each `NEW` badge from the manifest `date` and configured `newWithinDays` when the page loads.
- Static files declared in config are copied into the same relative paths under `dist/`.
- Build cache is stored under `.cache/eiam/v2-<namespace>/build-index.json`.

CI enforces raw and gzip budgets for the generated runtime assets. After a
sample build, run `bun run check:size` to apply the same limits locally. The
critical app JavaScript is limited to 45,000 raw / 15,000 gzip bytes, the
deferred tree chunk to 220,000 raw / 60,000 gzip bytes, and their combined
payload to 260,000 raw / 78,000 gzip bytes. CSS is limited to 31,000 raw /
7,000 gzip bytes.

The same command requires each EIAM-generated route HTML runtime bootstrap to
contain only `manifestUrl`, `pathBase`, and the hashed `treeModuleUrl`, and to
stay within 256 bytes; copied static HTML is left untouched. It also always
validates manifest schema v2 canonical document references. Once the
reconstructed legacy projection reaches 8,000 bytes, it requires at least 25%
raw and 5% gzip reduction versus that duplicated tree/document projection.
Smaller manifests skip only this relative ratio because fixed schema/gzip
overhead dominates when there is not yet enough duplicated payload to measure
reliably.

Run `bun run check:reproducible` to perform two no-op builds into the same output and compare SHA-256 hashes for every generated file. CI applies the same double-build check.

## Config File

The builder automatically loads one of these files from the current working directory:

- `blog.config.ts`
- `blog.config.js`
- `blog.config.mjs`
- `blog.config.cjs`

Example:

```ts
export default {
  vaultDir: "./vault",
  outDir: "./dist",
  defaultBranch: "dev",
  exclude: [".obsidian/**", "private/**"],
  staticPaths: ["assets", "public/favicon.ico"],
  pinnedMenu: {
    label: "NOTICE",
    categoryPath: "announcements",
  },
  ui: {
    newWithinDays: 7,
    recentLimit: 5,
  },
  markdown: {
    wikilinks: true,
    images: "omit-local",
    gfm: true,
    allowUnsafeHtml: false,
    highlight: {
      engine: "shiki",
      theme: "github-dark",
    },
    mermaid: {
      enabled: true,
      cdnUrl: "https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js",
      theme: "default",
    },
  },
  seo: {
    siteUrl: "https://example.com",
    pathBase: "/blog",
    siteName: "My Vault",
    defaultTitle: "My Vault",
    defaultDescription: "Published notes from my vault",
    locale: "en_US",
    twitterCard: "summary_large_image",
    twitterSite: "@example",
    twitterCreator: "@example",
    defaultSocialImage: "/assets/social.png",
    defaultOgImage: "/assets/og.png",
    defaultTwitterImage: "/assets/twitter.png",
  },
};
```

### Config fields

- `vaultDir`: default vault root.
- `outDir`: default output directory.
- `defaultBranch`: initial runtime branch, default `"dev"`; values are trimmed and normalized to
  lowercase. Notes without a `branch` belong to this branch.
- `exclude`: extra exclude globs.
- `staticPaths`: vault-relative files or directories copied into output.
- `pinnedMenu`: optional virtual folder shown above `Recent`.
- `pinnedMenu.sourceDir`: optional legacy file-path prefix matcher.
- `pinnedMenu.categoryPath`: optional category-path prefix matcher for the sidebar virtual folder.
- `ui.newWithinDays`: threshold for NEW badge.
- `ui.recentLimit`: number of items in `Recent`.
- `markdown.wikilinks`: enable or disable wikilink resolution.
- `markdown.images`: `"keep"` or `"omit-local"`.
- `markdown.gfm`: enable or disable GFM table/strikethrough support.
- `markdown.allowUnsafeHtml`: disables rendered HTML sanitization only when explicitly set to `true`; default `false`.
- `markdown.highlight.theme`: Shiki theme.
- `markdown.mermaid.*`: Mermaid runtime settings.
- `seo.*`: canonical URL, social metadata, sitemap, robots, and path-base behavior.

Config modules are treated as untrusted runtime input. Every supported field is validated and
normalized before `build`, `dev`, or `clean` can create, modify, or remove output/cache paths. An
invalid value stops the command with its exact dotted field path and received runtime type.
Unknown fields are ignored after a warning so spelling mistakes remain visible without breaking
forward-compatible configs. Unsafe Mermaid URL/theme strings keep their documented safe-default
fallback; values with the wrong runtime type are rejected.

### `staticPaths`

- Must be vault-relative
- Can point to either a file or a directory
- Are copied as-is into the output directory
- Must not normalize to the vault root, escape the output directory, or collide with the reserved `.eiam-output.json` ownership marker
- Invalid configured path values fail config validation; valid paths that are missing from the vault are skipped with a warning

### `pinnedMenu`

`pinnedMenu` creates a virtual folder at the top of the sidebar by collecting published docs that match either:

- `categoryPath`: the document `category_path` equals or starts with the configured prefix
- `sourceDir`: the vault-relative file path starts with the configured prefix

If both are present, `categoryPath` wins.

Example:

```ts
pinnedMenu: {
  label: "NOTICE",
  categoryPath: "announcements",
}
```

CLI override example:

```bash
bun run build -- --menu-config ./menu.config.json
```

JSON shape:

```json
{
  "pinnedMenu": {
    "label": "NOTICE",
    "categoryPath": "announcements"
  }
}
```

## Markdown Features

### Supported

- Common Markdown via `markdown-it`
- GFM tables and strikethrough when enabled
- Raw HTML inside Markdown
- Syntax-highlighted fenced code blocks with Shiki
- External links opened with `target="_blank"` and `rel="noopener noreferrer"`
- Obsidian-style wikilinks for document links

### Wikilinks

Resolution order:

1. Vault-relative path without `.md`
2. `prefix`
3. `title` (exact match)
4. File stem if unique

Supported forms:

- `[[posts/2024/setup-guide]]`
- `[[BC-VO-02]]`
- `[[Building a File-System Blog]]`
- `[[setup-guide]]`
- `[[Building a File-System Blog|Read this first]]`
- `[[setup-guide|Read this first]]`

If a target cannot be resolved, or a `title` matches multiple published docs, the Markdown is emitted as plain text and the build prints a warning.

### Images

Image behavior is controlled by `markdown.images`.

- `"keep"`: keeps Markdown image output as-is.
- `"omit-local"`: replaces local images with an italic placeholder and emits a warning.

Remote URLs are kept even when `"omit-local"` is used.

This rule also applies to Obsidian-style image embeds such as `![[image.png]]`.

### Raw HTML safety

Rendered HTML is sanitized by default before it is written to fetched content files or embedded in direct route pages. The allowlist keeps standard Markdown formatting, tables, images, figures, details, and EIAM/Shiki code markup. It permits classes, safe link/image URLs (`http`, `https`, `mailto`, and relative paths), and Shiki's hex `color`/`background-color` styles. Scripts, event-handler attributes, `javascript:` URLs, iframes, SVG, and arbitrary inline styles are removed.

Trusted vaults can opt out explicitly:

```ts
export default {
  markdown: {
    allowUnsafeHtml: true,
  },
};
```

This setting allows arbitrary authored HTML and can execute client-side code. Do not enable it for content that is untrusted or may be published accidentally.

### Code Blocks

Regular fenced code blocks are rendered with:

- Shiki highlighting
- explicit default grammars/theme, with additional known fence languages and
  non-default themes loaded on demand
- escaped plaintext fallback for unknown fence languages
- a desktop-style code header
- a copy button
- optional filename text when fence info contains extra tokens

Example:

````md
```ts blog.config.ts
export default {};
```
````

### Mermaid

Mermaid fences are rendered in the browser:

````md
```mermaid
flowchart LR
  A --> B
```
````

Behavior:

- rendered on first load and on document navigation
- centered and width-constrained in the viewer
- if rendering fails, source remains visible and an error message is shown
- invalid Mermaid CDN URLs or invalid theme values are normalized back to safe defaults

## Body Image Layout

Body images now use orientation-aware sizing inside the viewer:

- Landscape images keep the standard reading width.
- Portrait images are automatically constrained to a narrower max width so they do not dominate the article.
- Near-square images get an intermediate width.

When local Markdown images are enabled with `markdown.images: "keep"`, standalone image paragraphs are promoted into a dedicated `figure.content-image` wrapper automatically.
Allowlisted raw HTML remains available for manual framing when you want a fixed ratio or a specific crop mode.

Example frame utilities:

```html
<figure class="image-frame ratio-4x3 fit-cover">
  <img src="/assets/hero.jpg" alt="Cover-framed image" />
</figure>

<figure class="image-frame ratio-4x5 fit-contain">
  <img src="/assets/poster.jpg" alt="Contain-framed image" />
</figure>
```

Supported frame utilities:

- Ratios: `ratio-16x9`, `ratio-4x3`, `ratio-3x2`, `ratio-4x5`
- Fit modes: `fit-cover`, `fit-contain`

## UI and Runtime Behavior

The generated site includes a client-side runtime that powers navigation without requiring a framework.

Main behaviors:

- searchable sidebar tree rendered by the exact-pinned vanilla `@pierre/trees`
  runtime with a five-symbol generic icon sprite
- tree dependency loading deferred until after the first content paint on
  desktop, and until sidebar/search interaction on compact layouts
- `Recent` virtual folder
- optional pinned virtual folder
- prefix/title file labels without visible `.md` extensions, plus NEW badges when `ui.newWithinDays` matches
- a compact native branch selector in the sidebar
- active document selection synced between the tree, browser history, and document viewer
- model-level tree search with clear and previous/next match controls
- direct-link loading from route HTML
- previous/next document navigation
- backlink list for notes referenced by other notes
- mobile sidebar with accessibility handling and focus trap behavior
- theme mode persistence: `light`, `dark`, `system`
- sidebar width persistence on desktop

The sidebar uses EIAM canonical tree paths for display and keeps public routes sourced from document `prefix` routes. Visible file labels omit `.md`, but route and docId lookup behavior remains unchanged. Rename, drag/drop, git status, and multi-select workflows are intentionally not enabled.

Branch behavior:

- the default branch is `dev`
- notes without `branch` belong to the default branch view
- notes with `branch: main` or another value appear only in that branch

## SEO Support

SEO artifacts are generated only when `seo.siteUrl` is configured.

With SEO enabled, the build writes:

- canonical URLs
- Open Graph metadata
- Twitter metadata
- JSON-LD structured data
- `robots.txt`
- `sitemap.xml`

`seo.pathBase` is supported for subpath deployments such as `/blog`.
The generated `404.html` Home action uses the same normalized base, so `/blog` returns to `/blog/` while root deployments continue to use `/`.

Example:

- public site root: `https://example.com`
- path base: `/blog`
- route: `/BC-VO-02/`
- canonical URL: `https://example.com/blog/BC-VO-02/`

## Incremental Build and Caching

The build caches source metadata and output hashes in `.cache/eiam/v2-<namespace>/build-index.json`, relative to the process working directory. The namespace is a stable hash of the canonical vault, output, and cache-root paths.

Config values are resolved first, with CLI `--vault` and `--out` values taking precedence. Changing either resolved path selects a different namespace; it does not reuse or overwrite the previous pair's cache. The cache root itself has no separate override. `clean` removes only the namespace for the selected pair, never sibling EIAM namespaces or general-purpose `.cache` files.

Only published, non-draft Markdown source bodies are persisted. Unpublished and draft entries are omitted from the cache, so their content is re-evaluated when needed but never written to persistent build state.

This allows it to:

- skip unchanged rendered content
- restore missing generated content files on a later build
- restore missing hashed runtime assets on a later build
- remove stale route pages and content files when documents are removed or routes change

Every Markdown source is read and SHA-256 fingerprinted before a cache entry is reused. This catches content replacement even when file size and mtime are preserved. When the fingerprint is unchanged, frontmatter parsing and Markdown rendering are still skipped. The regression suite measures a 40-document no-op build and requires `rendered=0`, `skipped=40`, and under 10 seconds of wall-clock time; run it with `bunx playwright test tests/e2e/build-regression.spec.ts --grep "ordinary no-op"`.

## Markdown Lint for Published Docs

This repository includes a publish-only Markdown lint command:

```bash
bun run lint:md:publish -- --out-dir ./reports
```

Strict mode:

```bash
bun run lint:md:publish -- --out-dir ./reports --strict
```

Options:

- `--out-dir <path>`: required report directory
- `--strict`: exits with status `1` when issues exist
- `--vault <path>`: override vault root
- `--exclude <glob>`: extra exclude patterns

What it checks:

- uses the same vault scanner, exclusions, and frontmatter parser as the build
- selects only `publish: true`, non-draft notes that have both `prefix` and `category_path`
- reports malformed frontmatter and missing publication metadata separately from Markdown style findings
- runs `markdownlint`
- adds a custom rule that forbids H1 in the Markdown body after frontmatter
- writes a JSON report with `targetFiles`, `publicationDiagnostics`, `markdownStyleIssues`, and a backward-compatible combined `issues` list

Publication metadata diagnostics are warnings in the report, while frontmatter parse and Markdown
style findings are errors. `--strict` exits with status `1` when any of those diagnostics or findings
exists, including a publication warning.

## Example Vault

This repository includes `test-vault/` as a working sample.

Example files:

- `test-vault/about.md`
- `test-vault/posts/2024/setup-guide.md`
- `test-vault/posts/2024/file-system-blog.md`
- `test-vault/posts/2024/mermaid-example.md`

Try it with:

```bash
bun run dev -- --vault ./test-vault --out ./dist
```

## Development

Scripts from `package.json`:

```bash
bun install
bun run lint:source
bun run format:check
bun run typecheck
bun run test:unit
bun run build -- --vault ./test-vault --out ./dist
bun run dev -- --vault ./test-vault --out ./dist
bun run test:e2e
```

The fast unit suite in `tests/unit/` covers deterministic transformations and safety contracts: CLI parsing, paths and routes, cache guards, manifest adaptation, and rendered HTML sanitization. Changes or regressions in these areas should add or update a unit test; Playwright remains focused on browser and full-build integration.

CI does not enforce a numeric coverage threshold yet. `bun run test:unit:coverage` provides local visibility using Bun's built-in coverage, so coverage can improve without adding another test framework or turning line count into the goal.

E2E coverage in `tests/e2e/` includes:

- build regression around incremental outputs
- subpath routing with `seo.pathBase`
- prefix routing, backlinks, and branch switching
- searchable Trees sidebar behavior
- responsive sidebar layout bounds with long Korean/English labels
- Mermaid runtime behavior
- mobile sidebar accessibility and focus trap behavior
- runtime XSS/path-base guardrails

## Known Limitations

- Bun is required; this is not a generic Node-only CLI.
- Public routing depends on `prefix`, not on file path.
- Published docs without `prefix` are skipped.
- Local images may be omitted depending on config.
- Wikilinks resolve only to published docs.
- Mermaid rendering depends on runtime script loading in the browser.
- Sidebar rename, drag/drop, git status indicators, and bulk actions are intentionally out of scope.
- SEO files are not generated unless `seo.siteUrl` is configured.

## License

MIT. See [LICENSE](/home/lim/code/Everything-Is-A-Markdown/LICENSE).
