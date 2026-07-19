# Readable prose and wide-content lanes

## Layout contract

Reader pages use two centered content lanes inside the existing responsive
viewer container:

- `--content-prose-max-width` limits prose and reader navigation to `42rem`
  (672 px at the root font size), keeping line length comfortable;
- `--content-visual-max-width` preserves up to 880 px for code blocks, tables,
  figures, Mermaid diagrams, and landscape images.

The breadcrumb, document header, ordinary top-level Markdown nodes, post
navigation, and backlinks share the prose lane. Explicit visual nodes opt out
into the wide lane, while the existing image and Mermaid rules retain their
orientation- and diagram-specific limits.

Both widths are capped at `100%`. At compact breakpoints the lanes therefore
collapse to the viewer's available width without a second layout mode or
horizontal page overflow. Tables are block-level scroll containers at every
breakpoint, so an unbreakable cell can overflow inside the 880 px visual lane
instead of widening the page; code retains its own inner scroller.

## Regression coverage

The browser contract measures the rendered desktop lanes rather than only
matching CSS source. It verifies 672 px prose alongside 880 px code and tables,
checks their shared center axis, and repeats containment checks at a 390 px
mobile viewport. The desktop case also injects an unbreakable table cell and
requires internal horizontal overflow while the table boundary stays fixed.
