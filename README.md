# Everything-Is-A-Markdown (EIAM)

Language: **English** | [한국어](README.ko.md)

Everything-Is-A-Markdown is a CLI tool that turns a local Markdown vault into a static website while keeping the folder/file navigation experience.

## What This App Is For

- Build a static docs/blog site from your Markdown vault
- Publish only documents with `publish: true`
- Keep private notes and public content separate

## Works Great with Obsidian

- You can keep writing in Obsidian and publish selected notes.
- Obsidian-style wikilinks (`[[...]]`) are supported.

## Install

```bash
bun install
```

## Usage

```bash
bun run blog [build|dev|clean] [options]
```

Commands:

- `bun run build`: Build static files
- `bun run dev`: Run local dev server (default `http://localhost:3000`)
- `bun run clean`: Remove `dist` and `.cache`

Common options:

- `--vault <path>`: Markdown root directory (default `.`)
- `--out <path>`: Output directory (default `dist`)
- `--exclude <glob>`: Add exclude pattern (repeatable)
- `--port <n>`: Dev server port (default `3000`)

## Config File (`blog.config.ts`)

Use a config file for SEO/UI/static assets.

```ts
const config = {
  vaultDir: "./vault",
  outDir: "./dist",
  staticPaths: ["assets", "public/favicon.ico"],
  seo: {
    siteUrl: "https://example.com",
    defaultOgImage: "/assets/og.png",
  },
};

export default config;
```

`staticPaths`:

- Array of vault-relative paths
- Supports both folders and files
- Copies all matched files into the same relative location in `dist`
- Example: `assets/og.png` in vault becomes `dist/assets/og.png`

Examples:

```bash
# Run with the sample vault
bun run dev -- --vault ./test-vault --out ./dist

# Build
bun run build -- --vault ./test-vault --out ./dist
```

## Markdown Frontmatter

The key field for publishing is `publish`.

Required:

- `publish: true`  
  Only documents with this value are included in build output.
- `prefix: "A-01"`  
  Public identifier for the document route (`/A-01/`).  
  If `publish: true` but `prefix` is missing, the document is skipped with a build warning.

Optional:

- `draft: true`  
  Excludes the document even if `publish: true`.
- `title: "..."`  
  Display title. If missing, file name is used.
- `branch: dev`  
  Branch filter label.
- `description: "..."`  
  Short summary.
- `tags: ["tag1", "tag2"]`  
  String array.
- `date: "YYYY-MM-DD"` or `createdDate: "..."`  
  Created date.
- `updatedDate: "..."` or `modifiedDate: "..."` or `lastModified: "..."`  
  Updated date.

## Frontmatter Examples

Published document:

```md
---
publish: true
prefix: "DEV-01"
branch: dev
title: Setup Guide
date: "2024-09-15"
updatedDate: "2024-09-20T09:30:00"
description: How to set up your development environment
tags: ["tutorial", "setup"]
---

# Setup Guide
```

Private document (excluded):

```md
---
publish: false
title: Internal Notes
---
```

Draft document:

```md
---
publish: true
draft: true
title: Work In Progress
---
```

## bunx (Optional)

```bash
bunx @limcpf/everything-is-a-markdown build --vault ./vault --out ./dist
bunx @limcpf/everything-is-a-markdown dev --port 3000
```

## License

MIT. See `LICENSE`.
