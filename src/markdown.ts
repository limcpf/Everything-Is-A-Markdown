import MarkdownIt from "markdown-it";
import sanitizeHtml from "sanitize-html";
import { createHighlighterCore, type HighlighterCore, type LanguageInput } from "@shikijs/core";
import { createJavaScriptRegexEngine } from "@shikijs/engine-javascript";
import bashLanguage from "@shikijs/langs/bash";
import javascriptLanguage from "@shikijs/langs/javascript";
import jsonLanguage from "@shikijs/langs/json";
import markdownLanguage from "@shikijs/langs/markdown";
import typescriptLanguage from "@shikijs/langs/typescript";
import githubDarkTheme from "@shikijs/themes/github-dark";
import type { BuildOptions, WikiResolver } from "./types";
import { isRemoteUrl } from "./utils";

export interface RenderResult {
  html: string;
  warnings: string[];
}

export interface MarkdownRenderer {
  render(markdown: string, resolver: WikiResolver): Promise<RenderResult>;
}

const FENCE_LANG_RE = /^```([\w-+#.]+)/gm;
const MERMAID_LANG = "mermaid";
const DEFAULT_SHIKI_THEME = "github-dark";
const SHIKI_MODULE_NAME_RE = /^[a-z0-9][a-z0-9-]*$/;
const SHIKI_LANGUAGE_MODULE_ALIASES: Readonly<Record<string, string>> = {
  "c#": "csharp",
  "c++": "cpp",
  "f#": "fsharp",
};
const DEFAULT_SHIKI_LANGUAGES: LanguageInput[] = [
  markdownLanguage,
  bashLanguage,
  jsonLanguage,
  typescriptLanguage,
  javascriptLanguage,
];
const SAFE_COLOR_VALUE = /^#[0-9a-f]{3,8}$/i;
const SAFE_HTML_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p",
    "br",
    "hr",
    "blockquote",
    "pre",
    "code",
    "strong",
    "em",
    "s",
    "del",
    "a",
    "ul",
    "ol",
    "li",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
    "img",
    "figure",
    "figcaption",
    "div",
    "span",
    "button",
    "details",
    "summary",
    "kbd",
    "mark",
    "sub",
    "sup",
    "dl",
    "dt",
    "dd",
    "abbr",
    "time",
  ],
  allowedAttributes: {
    "*": ["class"],
    a: ["href", "title", "target", "rel"],
    abbr: ["title"],
    button: ["type", "title", "data-code", "aria-label"],
    details: ["open"],
    img: ["src", "alt", "title", "width", "height", "loading"],
    li: ["value"],
    ol: ["start"],
    pre: ["tabindex", "style"],
    span: ["style"],
    td: ["colspan", "rowspan"],
    th: ["colspan", "rowspan", "scope"],
    time: ["datetime"],
  },
  allowedStyles: {
    pre: {
      "background-color": [SAFE_COLOR_VALUE],
      color: [SAFE_COLOR_VALUE],
    },
    span: {
      color: [SAFE_COLOR_VALUE],
    },
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesByTag: {
    a: ["http", "https", "mailto"],
    img: ["http", "https"],
  },
  allowProtocolRelative: false,
  disallowedTagsMode: "discard",
  enforceHtmlBoundary: false,
  nestingLimit: 100,
  nonTextTags: ["script", "style", "textarea", "option", "noscript", "xmp"],
  transformTags: {
    a(tagName, attributes) {
      const attribs = { ...attributes };
      if (attribs.target === "_blank") {
        const rel = new Set((attribs.rel ?? "").split(/\s+/).filter(Boolean));
        rel.add("noopener");
        rel.add("noreferrer");
        attribs.rel = Array.from(rel).join(" ");
      } else {
        delete attribs.target;
      }
      return { tagName, attribs };
    },
  },
};

export function sanitizeMarkdownHtml(html: string, allowUnsafeHtml = false): string {
  return allowUnsafeHtml ? html : sanitizeHtml(html, SAFE_HTML_OPTIONS);
}

type RenderRule = NonNullable<MarkdownIt["renderer"]["rules"]["fence"]>;
type RenderRuleArgs = Parameters<RenderRule>;
type RuleTokens = RenderRuleArgs[0];
type RuleOptions = RenderRuleArgs[2];
type RuleEnv = RenderRuleArgs[3];
type RuleSelf = RenderRuleArgs[4];
type LinkOpenRule = NonNullable<MarkdownIt["renderer"]["rules"]["link_open"]>;
type ImageRule = NonNullable<MarkdownIt["renderer"]["rules"]["image"]>;
type ParagraphRule = NonNullable<MarkdownIt["renderer"]["rules"]["paragraph_open"]>;

function escapeMarkdownLabel(input: string): string {
  return input.replaceAll("[", "").replaceAll("]", "");
}

function escapeHtmlText(input: string): string {
  return String(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function parseWikiInner(inner: string): { target: string; label?: string } {
  const [target, label] = inner.split("|").map((part) => part.trim());
  return { target, label: label || undefined };
}

function isLikelyImagePath(input: string): boolean {
  return /\.(png|jpe?g|gif|webp|svg|bmp|ico|avif)$/i.test(input);
}

function preprocessMarkdown(
  markdown: string,
  resolver: WikiResolver,
  imagePolicy: BuildOptions["imagePolicy"],
  wikilinks: boolean,
): {
  markdown: string;
  warnings: string[];
} {
  const warnings: string[] = [];

  let output = markdown.replace(/!\[\[([^\]]+)\]\]/g, (_full, inner: string) => {
    const { target, label } = parseWikiInner(inner);
    if (imagePolicy === "omit-local") {
      warnings.push(`Local image omitted: ${target}`);
      return `*(image omitted: ${label ?? target})*`;
    }
    return `![${escapeMarkdownLabel(label ?? target)}](${target})`;
  });

  output = output.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (full, alt: string, src: string) => {
    if (imagePolicy !== "omit-local") {
      return full;
    }
    if (isRemoteUrl(src.trim())) {
      return full;
    }
    warnings.push(`Local image omitted: ${src.trim()}`);
    return `*(image omitted: ${alt || src.trim()})*`;
  });

  if (wikilinks) {
    output = output.replace(/\[\[([^\]]+)\]\]/g, (_full, inner: string) => {
      const { target, label } = parseWikiInner(inner);
      if (!target) {
        return "";
      }

      if (isLikelyImagePath(target)) {
        warnings.push(`Unresolved wikilink (looks like image): ${target}`);
        return label ?? target;
      }

      const resolved = resolver.resolve(target);
      if (!resolved) {
        warnings.push(`Unresolved wikilink: ${target}`);
        return label ?? target;
      }

      const finalLabel = escapeMarkdownLabel(label ?? resolved.label);
      return `[${finalLabel}](${resolved.route})`;
    });
  }

  return { markdown: output, warnings };
}

function isMissingShikiModule(error: unknown, specifier: string): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = "code" in error ? String(error.code) : "";
  const message = "message" in error ? String(error.message) : "";
  const moduleSubpath = `./${specifier.slice(specifier.lastIndexOf("/") + 1)}`;
  const isMissingCode = code === "ERR_MODULE_NOT_FOUND" || code === "ERR_PACKAGE_PATH_NOT_EXPORTED";
  const matchesSpecifier =
    message.includes(specifier) ||
    message.includes(`'${moduleSubpath}'`) ||
    message.includes(`"${moduleSubpath}"`);
  return isMissingCode && matchesSpecifier;
}

async function loadShikiTheme(theme: string): Promise<typeof githubDarkTheme> {
  if (theme === DEFAULT_SHIKI_THEME) {
    return githubDarkTheme;
  }
  if (!SHIKI_MODULE_NAME_RE.test(theme)) {
    throw new Error(`[markdown] Invalid Shiki theme: ${JSON.stringify(theme)}.`);
  }

  const specifier = `@shikijs/themes/${theme}`;
  try {
    const themeModule = (await import(specifier)) as { default: typeof githubDarkTheme };
    return themeModule.default;
  } catch (error) {
    if (isMissingShikiModule(error, specifier)) {
      throw new Error(`[markdown] Unknown Shiki theme: ${JSON.stringify(theme)}.`, {
        cause: error,
      });
    }
    throw error;
  }
}

async function loadShikiLanguage(language: string): Promise<LanguageInput | null> {
  const moduleName = SHIKI_LANGUAGE_MODULE_ALIASES[language] ?? language;
  if (!SHIKI_MODULE_NAME_RE.test(moduleName)) {
    return null;
  }

  const specifier = `@shikijs/langs/${moduleName}`;
  try {
    const languageModule = (await import(specifier)) as { default: LanguageInput };
    return languageModule.default;
  } catch (error) {
    if (isMissingShikiModule(error, specifier)) {
      return null;
    }
    throw error;
  }
}

async function loadFenceLanguages(
  highlighter: HighlighterCore,
  loaded: Set<string>,
  unavailable: Set<string>,
  markdown: string,
): Promise<void> {
  const langs = new Set<string>();
  FENCE_LANG_RE.lastIndex = 0;
  while (true) {
    const match = FENCE_LANG_RE.exec(markdown);
    if (match === null) {
      break;
    }
    if (match[1]) {
      if (match[1].toLowerCase() === MERMAID_LANG) {
        continue;
      }
      langs.add(match[1].toLowerCase());
    }
  }

  const requested = Array.from(langs).filter((lang) => !loaded.has(lang) && !unavailable.has(lang));
  const languageInputs = await Promise.all(
    requested.map(async (lang) => ({ lang, input: await loadShikiLanguage(lang) })),
  );
  const availableInputs = languageInputs.flatMap(({ input }) => (input ? [input] : []));
  if (availableInputs.length > 0) {
    await highlighter.loadLanguage(...availableInputs);
    for (const loadedLanguage of highlighter.getLoadedLanguages()) {
      loaded.add(String(loadedLanguage));
    }
  }
  for (const { lang, input } of languageInputs) {
    if (!input) {
      unavailable.add(lang);
    }
  }
}

function escapeHtmlAttr(input: string): string {
  return input.replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function isStandaloneImageParagraph(tokens: RuleTokens, idx: number): boolean {
  const open = tokens[idx];
  const inline = tokens[idx + 1];
  const close = tokens[idx + 2];

  if (
    open?.type !== "paragraph_open" ||
    inline?.type !== "inline" ||
    close?.type !== "paragraph_close"
  ) {
    return false;
  }

  const children = (inline.children ?? []).filter((child) => {
    return !(child.type === "text" && !child.content.trim());
  });

  return children.length === 1 && children[0]?.type === "image";
}

function createMarkdownIt(highlighter: HighlighterCore, theme: string, gfm: boolean): MarkdownIt {
  const md = new MarkdownIt({
    // Parse raw HTML so the configured sanitizer can apply one policy to generated and authored markup.
    html: true,
    linkify: true,
    typographer: false,
    breaks: false,
  });

  if (!gfm) {
    md.disable(["table", "strikethrough"]);
  }

  const fenceRule: RenderRule = (
    tokens: RuleTokens,
    idx: number,
    _options: RuleOptions,
    _env: RuleEnv,
    _self: RuleSelf,
  ) => {
    const token = tokens[idx];
    const info = token.info.trim();
    const parts = info.split(/\s+/);
    const lang = parts[0]?.toLowerCase() || "text";
    const fileName = parts.slice(1).join(" ") || null;

    if (lang === MERMAID_LANG) {
      const source = escapeHtmlText(token.content);
      return `<figure class="mermaid-block">
        <pre class="mermaid">${source}</pre>
      </figure>`;
    }

    let codeHtml: string;
    try {
      codeHtml = highlighter.codeToHtml(token.content, {
        lang: (lang || "text") as never,
        theme,
      });
    } catch {
      codeHtml = highlighter.codeToHtml(token.content, {
        lang: "text" as never,
        theme,
      });
    }

    const header = `<div class="code-header">
      <div class="code-dots">
        <span class="dot dot-red"></span>
        <span class="dot dot-yellow"></span>
        <span class="dot dot-green"></span>
      </div>
      <span class="code-filename">${fileName ? escapeHtmlAttr(fileName) : lang}</span>
      <button class="code-copy" title="Copy code" data-code="${escapeHtmlAttr(token.content)}">
        <span class="material-symbols-outlined">content_copy</span>
      </button>
    </div>`;

    return `<div class="code-block">${header}${codeHtml}</div>`;
  };
  md.renderer.rules.fence = fenceRule;

  const defaultImage = md.renderer.rules.image as ImageRule | undefined;
  const imageRule: ImageRule = (
    tokens: RuleTokens,
    idx: number,
    options: RuleOptions,
    env: RuleEnv,
    self: RuleSelf,
  ) => {
    tokens[idx].attrJoin("class", "content-media");
    if (defaultImage) {
      return defaultImage(tokens, idx, options, env, self);
    }
    return self.renderToken(tokens, idx, options);
  };
  md.renderer.rules.image = imageRule;

  const defaultParagraphOpen = md.renderer.rules.paragraph_open as ParagraphRule | undefined;
  const defaultParagraphClose = md.renderer.rules.paragraph_close as ParagraphRule | undefined;
  const paragraphOpenRule: ParagraphRule = (
    tokens: RuleTokens,
    idx: number,
    options: RuleOptions,
    env: RuleEnv,
    self: RuleSelf,
  ) => {
    if (isStandaloneImageParagraph(tokens, idx)) {
      return `<figure class="content-image">`;
    }
    if (defaultParagraphOpen) {
      return defaultParagraphOpen(tokens, idx, options, env, self);
    }
    return self.renderToken(tokens, idx, options);
  };
  const paragraphCloseRule: ParagraphRule = (
    tokens: RuleTokens,
    idx: number,
    options: RuleOptions,
    env: RuleEnv,
    self: RuleSelf,
  ) => {
    if (isStandaloneImageParagraph(tokens, idx - 2)) {
      return `</figure>`;
    }
    if (defaultParagraphClose) {
      return defaultParagraphClose(tokens, idx, options, env, self);
    }
    return self.renderToken(tokens, idx, options);
  };
  md.renderer.rules.paragraph_open = paragraphOpenRule;
  md.renderer.rules.paragraph_close = paragraphCloseRule;

  const defaultLinkOpen = md.renderer.rules.link_open as LinkOpenRule | undefined;
  const linkOpenRule: LinkOpenRule = (
    tokens: RuleTokens,
    idx: number,
    options: RuleOptions,
    env: RuleEnv,
    self: RuleSelf,
  ) => {
    const hrefIdx = tokens[idx].attrIndex("href");
    if (hrefIdx >= 0) {
      const href = tokens[idx].attrs?.[hrefIdx]?.[1] ?? "";
      if (/^https?:\/\//i.test(href)) {
        tokens[idx].attrSet("target", "_blank");
        tokens[idx].attrSet("rel", "noopener noreferrer");
      }
    }

    if (defaultLinkOpen) {
      return defaultLinkOpen(tokens, idx, options, env, self);
    }
    return self.renderToken(tokens, idx, options);
  };
  md.renderer.rules.link_open = linkOpenRule;

  return md;
}

export async function createMarkdownRenderer(options: BuildOptions): Promise<MarkdownRenderer> {
  const theme = await loadShikiTheme(options.shikiTheme);
  const highlighter = await createHighlighterCore({
    themes: [theme],
    langs: DEFAULT_SHIKI_LANGUAGES,
    engine: createJavaScriptRegexEngine(),
  });
  const loadedLanguages = new Set(highlighter.getLoadedLanguages().map(String));
  const unavailableLanguages = new Set<string>();
  let languageLoadQueue = Promise.resolve();

  const md = createMarkdownIt(highlighter, theme.name ?? options.shikiTheme, options.gfm);
  if (options.allowUnsafeHtml) {
    console.warn(
      "[security] markdown.allowUnsafeHtml=true disables rendered HTML sanitization. Only use trusted vault content.",
    );
  }

  return {
    async render(markdown: string, resolver: WikiResolver): Promise<RenderResult> {
      const { markdown: preprocessed, warnings } = preprocessMarkdown(
        markdown,
        resolver,
        options.imagePolicy,
        options.wikilinks,
      );
      const languageLoad = languageLoadQueue.then(() =>
        loadFenceLanguages(highlighter, loadedLanguages, unavailableLanguages, preprocessed),
      );
      languageLoadQueue = languageLoad.catch(() => undefined);
      await languageLoad;
      const renderedHtml = md.render(preprocessed);
      const html = sanitizeMarkdownHtml(renderedHtml, options.allowUnsafeHtml);
      return { html, warnings };
    },
  };
}
