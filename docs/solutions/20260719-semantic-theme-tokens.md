# Semantic theme token contract

Issue #37 begins the visual-system work by separating component intent from the
Catppuccin palette that supplies it. `src/runtime/app.css` now exposes semantic
roles at the `:root` theme boundary:

- canvas, surface, and muted-surface backgrounds;
- primary, secondary, muted, and subtle text;
- default, strong, and emphasis borders;
- accent, link, focus, success, warning, danger, and code-accent colors;
- component-level elevation, overlay, tooltip, badge, and content tokens.

Light values live in the default `:root` declaration and dark values override
the same roles in `:root[data-theme="dark"]`. Components consume only these
roles, so changing a palette no longer requires knowing every selector that
uses it. Focus, selection/accent, warning, and NEW/danger remain separate roles
even when a future palette maps some roles to nearby colors.

`semantic-theme-tokens.spec.ts` rejects palette-specific component variables
and snapshots the resolved reader/sidebar surfaces and state colors in both
themes.
