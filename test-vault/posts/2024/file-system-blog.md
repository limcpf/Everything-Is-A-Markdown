---
publish: true
prefix: BC-VO-01
branch: main
title: Building a File-System Blog
date: "2024-10-24"
description: This post explores how to build a developer blog that mimics a file system.
tags: ["react", "nextjs"]
---

This post explores how to build a developer blog that mimics a file system. We will cover the recursive component logic and state management for the directory tree.

## The Recursive Component

The core of our file explorer is a recursive component. Since folders can contain other folders infinitely deep, we need a component that can call itself.

```javascript components/FileTree.js
const FileTree = ({ nodes }) => {
  return (
    <div className="pl-4 border-l border-gray-200">
      {nodes.map((node) => (
        node.type === 'folder' ? (
          <Folder key={node.id} data={node} />
        ) : (
          <File key={node.id} data={node} />
        )
      ))}
    </div>
  );
};
```

By recursively iterating through the nodes, we maintain a clean structure regardless of directory depth.

> "The best navigation is the one users don't have to think about. It should feel natural, like browsing their own local machine."

## Handling Active States

Visual feedback is crucial. When a user clicks a file, we want it to highlight. In our case, we're using Tailwind's `bg-mauve/10` utility to give it that subtle glow.

| Feature | Status | Priority |
|---------|--------|----------|
| File tree | Done | High |
| Active states | Done | High |
| Search | Planned | Medium |

In the next post, we will cover how to implement the search functionality using fuzzy search logic.
