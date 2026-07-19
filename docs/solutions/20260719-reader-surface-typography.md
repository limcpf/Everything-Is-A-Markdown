# Reader surface and typography hierarchy

## Surface roles

The shell uses two deliberately quiet component surfaces without a heavy
divider:

- `--surface-reader` gives the article a clear reading plane;
- `--surface-navigation` keeps the sidebar visually secondary;
- the desktop sidebar has no right border, while the existing one-pixel
  splitter remains the resize affordance.

Light mode uses a white reader over a soft gray navigation surface. Dark mode
keeps the reader on the theme canvas and the navigation surface one step
darker. Blockquotes and table hover rows derive from the theme surface instead
of a light-only literal.

## Type scale

| Role             | Token                     | Desktop size | Use                                     |
| ---------------- | ------------------------- | -----------: | --------------------------------------- |
| Page title       | `--type-title`            |        40 px | Current document title                  |
| Article body     | `--type-content`          |        17 px | Paragraphs, lists, quotes               |
| Article headings | `--type-heading-1` … `-4` |     33–18 px | In-document hierarchy                   |
| Navigation       | `--type-navigation`       |        14 px | Tree, search, backlinks, previous/next  |
| Metadata         | `--type-metadata`         |        13 px | Breadcrumb, date, tags, branch controls |
| Caption          | `--type-caption`          |        12 px | Prefixes and secondary labels           |

Compact breakpoints override the same tokens rather than introducing a second
unrelated scale. Article text uses the primary text role, while metadata and
navigation use progressively quieter roles whose resolved light/dark contrast
is regression-tested at WCAG AA's 4.5:1 threshold.

## Font strategy

Body text uses a `ui-sans-serif`/`system-ui` stack with platform Korean
fallbacks. Code and metadata use `ui-monospace` with platform monospace
fallbacks. EIAM declares no text `@font-face`, so article typography neither
depends on an external font host nor swaps after a webfont download. The local
SVG icon migration is tracked separately by issue #40.

The visual changes also exposed that two animation-frame callbacks can still
run before the browser records its first contentful paint. Deferred desktop
tree loading now waits through the following frame, so dependency work starts
after an actual paint boundary. The timing regression is exercised repeatedly
in addition to the ordinary E2E suite.
