---
publish: true
prefix: BC-VO-02
branch: dev
title: Setup Guide
date: "2024-09-15"
description: How to set up your development environment
tags: ["tutorial", "setup"]
---

# Development Environment Setup

This guide will help you set up your development environment for the File-System Blog project.

## Prerequisites

- Node.js 18+ or Bun
- Git
- A code editor (VS Code recommended)

## Installation

```bash
# Clone the repository
git clone https://github.com/example/fs-blog.git
cd fs-blog

# Install dependencies
bun install

# Start development server
bun run dev
```

## Configuration

Create a `blog.config.ts` file in the root:

```typescript blog.config.ts
export default {
  vaultDir: "../vault",
  outDir: "dist",
  exclude: [".obsidian/**", "private/**"],
  ui: {
    newWithinDays: 7,
    recentLimit: 5,
  },
};
```

That's it! You're ready to start building.

관련 글: [[BC-VO-01|Building a File-System Blog]]
