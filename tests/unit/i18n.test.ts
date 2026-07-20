import { describe, expect, test } from "bun:test";
import {
  DEFAULT_UI_LOCALE,
  getUiMessages,
  normalizeUiLocale,
  UI_MESSAGE_CATALOG,
  type UiMessageCatalog,
} from "../../src/i18n";

describe("UI message catalog", () => {
  test("ships complete Korean and English catalogs", () => {
    expect(Object.keys(UI_MESSAGE_CATALOG.en).sort()).toEqual(
      Object.keys(UI_MESSAGE_CATALOG.ko).sort(),
    );
    expect(getUiMessages("ko").copyCode).toBe("코드 복사");
    expect(getUiMessages("en").copyCode).toBe("Copy code");
    expect(getUiMessages("en").searchMatches(1)).toBe("1 match");
    expect(getUiMessages("en").searchMatches(2)).toBe("2 matches");
  });

  test("falls back to Korean deterministically for unknown locales and missing entries", () => {
    const {
      next: _next,
      searchMatches: _searchMatches,
      ...incompleteEnglish
    } = UI_MESSAGE_CATALOG.en;
    const incompleteCatalog: UiMessageCatalog = {
      ...UI_MESSAGE_CATALOG,
      en: incompleteEnglish,
    };

    expect(normalizeUiLocale(" EN ")).toBe("en");
    expect(normalizeUiLocale("en-US")).toBe(DEFAULT_UI_LOCALE);
    expect(getUiMessages("unknown")).toBe(getUiMessages("ko"));
    expect(getUiMessages("en", incompleteCatalog).next).toBe(getUiMessages("ko").next);
    expect(getUiMessages("en", incompleteCatalog).searchMatches(3)).toBe("3개 일치");
  });
});
