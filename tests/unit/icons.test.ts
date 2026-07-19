import { gzipSync } from "node:zlib";
import { describe, expect, test } from "bun:test";
import { renderAppIconSprite } from "../../src/icon-sprite";
import { APP_ICON_NAMES, renderAppIcon } from "../../src/icons";
import { render404Html, renderAppShellHtml } from "../../src/template";

describe("local app icon system", () => {
  test("ships one bounded symbol for every supported icon", () => {
    const sprite = renderAppIconSprite();
    const symbolIds = Array.from(sprite.matchAll(/<symbol id="([^"]+)"/g), (match) => match[1]);

    expect(symbolIds).toEqual(APP_ICON_NAMES.map((name) => `eiam-icon-${name}`));
    expect(Buffer.byteLength(sprite)).toBeLessThanOrEqual(3_700);
    expect(gzipSync(sprite).byteLength).toBeLessThanOrEqual(750);

    for (const name of APP_ICON_NAMES) {
      expect(renderAppIcon(name)).toBe(
        `<svg class="app-icon" aria-hidden="true" focusable="false"><use href="#eiam-icon-${name}"></use></svg>`,
      );
    }
  });

  test("generated shells contain the sprite before use and no icon-font dependency", () => {
    for (const html of [renderAppShellHtml(), render404Html()]) {
      expect(html).toContain("data-app-icon-sprite");
      expect(html.indexOf("data-app-icon-sprite")).toBeLessThan(html.indexOf('app-icon"'));
      expect(html).not.toContain("fonts.googleapis.com");
      expect(html).not.toContain("fonts.gstatic.com");
      expect(html).not.toContain("Material Symbols");
      expect(html).not.toContain("material-symbols-outlined");
    }
  });
});
