# Local SVG icon system

## Decision

The generated shell, shared view chrome, 404 page, and rendered code blocks use
one inline SVG sprite with 14 purpose-specific symbols. Each visible icon is a
small `<svg><use href="#eiam-icon-*">` reference, so icons are available in the
server-rendered HTML before the application JavaScript runs.

The sprite data lives separately from the icon renderer. This keeps the browser
bundle's shared view renderer from embedding a second copy of every SVG path.
The existing deferred file tree keeps its own five-symbol sprite because it is
loaded and rendered inside the tree component's shadow root.

## Accessibility contract

- Every app icon is decorative and carries `aria-hidden="true"` and
  `focusable="false"`.
- Icon-only buttons retain an `aria-label`; controls with visible text keep that
  text as their accessible name.
- The code-copy button changes both its SVG reference and accessible label from
  `Copy code` to `Copied`, then restores both after the feedback interval.
- The icon sprite precedes all `<use>` elements in the body and needs neither a
  font ligature nor JavaScript to render.

## Payload comparison

Measured on 2026-07-19 with the stylesheet URL previously emitted by EIAM and a
Chrome user agent:

| Payload                                      | Raw response bytes | Gzip/encoded bytes |
| -------------------------------------------- | -----------------: | -----------------: |
| Google Material Symbols stylesheet           |                688 |                  — |
| Google Material Symbols variable WOFF2       |          1,125,924 |          1,125,924 |
| Previous external total                      |          1,126,612 |                  — |
| EIAM 14-symbol inline sprite                  |              3,331 |                626 |

The local sprite is 99.7% smaller than the previous external response bodies
even without HTML compression (99.94% smaller when comparing the sprite's gzip
size). It also removes two third-party origins, their preconnects, the async
stylesheet request, the font request, and icon-font flash. Repeated `<use>`
markup remains part of each route HTML, while the former font could be cached
between pages; the comparison therefore records both the standalone sprite and
network-request tradeoff rather than treating caching as free transfer.

## Regression coverage

Unit coverage fixes the symbol inventory and budgets the sprite at 3,700 raw /
750 gzip bytes. Browser coverage disables JavaScript, verifies a non-zero icon
box, rejects Google Fonts requests and ligature text, validates decorative SVG
semantics, checks accessible names for interactive controls, and exercises the
copy-to-check feedback state.
