# Everything-Is-A-Markdown (EIAM)

Language: **English** | [한국어](README.ko.md)

Everything-Is-A-Markdown is a Bun-based CLI that turns a local Markdown vault into a static site with a file-explorer UI. It is designed for workflows where most notes stay private and only explicitly published documents are exposed as a browsable website.

The generated site keeps a two-panel experience:

- Left: folder tree, virtual folders, branch filters
- Right: rendered document viewer with metadata, backlinks, and previous/next navigation

## What It Does

- Builds a static site from a local Markdown vault
- Publishes only notes with `publish: true`
- Requires a `prefix` field for every published note and uses it as the public route
- Supports Obsidian-style wikilinks such as `[[note]]` and `[[note|label]]`
- Renders code blocks with Shiki
- Renders Mermaid blocks in the browser with runtime fallback handling
- Generates per-route HTML pages for direct access without SPA-only routing
- Produces a manifest used by the runtime tree/navigation UI
- Supports a `Recent` virtual folder and an optional pinned virtual folder
- Supports branch-based filtering in the sidebar
- Can generate sitemap/robots/canonical metadata when SEO config is provided

## Important Behavior

This project currently uses `prefix`-based public routes, not vault-relative path routes.

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
- Invalid numeric options fail fast.
- `clean` removes both the output directory and `.cache`.

## Frontmatter

Only documents with `publish: true` are considered for output.

### Required for published docs

- `publish: true`
- `prefix: "BC-VO-02"`

If `publish: true` is set but `prefix` is missing, the note is skipped and a build warning is emitted.

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
- Runtime assets are content-hashed.
- Static files declared in config are copied into the same relative paths under `dist/`.
- Build cache is stored under `.cache/build-index.json`.

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
  exclude: [".obsidian/**", "private/**"],
  staticPaths: ["assets", "public/favicon.ico"],
  pinnedMenu: {
    label: "NOTICE",
    sourceDir: "announcements",
  },
  ui: {
    newWithinDays: 7,
    recentLimit: 5,
  },
  markdown: {
    wikilinks: true,
    images: "omit-local",
    gfm: true,
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
- `exclude`: extra exclude globs.
- `staticPaths`: vault-relative files or directories copied into output.
- `pinnedMenu`: optional virtual folder shown above `Recent`.
- `ui.newWithinDays`: threshold for NEW badge.
- `ui.recentLimit`: number of items in `Recent`.
- `markdown.wikilinks`: enable or disable wikilink resolution.
- `markdown.images`: `"keep"` or `"omit-local"`.
- `markdown.gfm`: enable or disable GFM table/strikethrough support.
- `markdown.highlight.theme`: Shiki theme.
- `markdown.mermaid.*`: Mermaid runtime settings.
- `seo.*`: canonical URL, social metadata, sitemap, robots, and path-base behavior.

### `staticPaths`

- Must be vault-relative
- Can point to either a file or a directory
- Are copied as-is into the output directory
- Invalid or missing paths are skipped with a warning

### `pinnedMenu`

`pinnedMenu` creates a virtual folder at the top of the sidebar by collecting published docs whose vault-relative path starts with the configured `sourceDir`.

Example:

```ts
pinnedMenu: {
  label: "NOTICE",
  sourceDir: "announcements",
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
    "sourceDir": "announcements"
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

### Code Blocks

Regular fenced code blocks are rendered with:

- Shiki highlighting
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
Raw HTML remains available for manual framing when you want a fixed ratio or a specific crop mode.

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

- folder tree with expand/collapse state in `localStorage`
- `Recent` virtual folder
- optional pinned virtual folder
- branch pills in the sidebar
- active document syncing with browser history
- direct-link loading from route HTML
- previous/next document navigation
- backlink list for notes referenced by other notes
- mobile sidebar with accessibility handling and focus trap behavior
- theme mode persistence: `light`, `dark`, `system`
- sidebar width persistence on desktop

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

Example:

- public site root: `https://example.com`
- path base: `/blog`
- route: `/BC-VO-02/`
- canonical URL: `https://example.com/blog/BC-VO-02/`

## Incremental Build and Caching

The build caches source metadata and output hashes in `.cache/build-index.json`.

This allows it to:

- skip unchanged rendered content
- restore missing generated content files on a later build
- restore missing hashed runtime assets on a later build
- remove stale route pages and content files when documents are removed or routes change

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

- only notes with `publish: true`
- skips docs missing `prefix`
- runs `markdownlint`
- adds a custom rule that forbids H1 in the Markdown body after frontmatter
- writes a JSON report file

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
bun run build -- --vault ./test-vault --out ./dist
bun run dev -- --vault ./test-vault --out ./dist
bun run test:e2e
```

E2E coverage in `tests/e2e/` includes:

- build regression around incremental outputs
- subpath routing with `seo.pathBase`
- prefix routing, backlinks, and branch switching
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
- SEO files are not generated unless `seo.siteUrl` is configured.

## License

MIT. See [LICENSE](/home/lim/code/Everything-Is-A-Markdown/LICENSE).
