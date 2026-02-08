import MarkdownIt from "markdown-it";
import { createBundledHighlighter, type HighlighterGeneric } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import { bundledLanguages } from "shiki/langs";
import { bundledThemes } from "shiki/themes";
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

function escapeMarkdownLabel(input: string): string {
  return input.replace(/[\[\]]/g, "");
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

type Highlighter = HighlighterGeneric<string, string>;

async function loadFenceLanguages(highlighter: Highlighter, loaded: Set<string>, markdown: string): Promise<void> {
  const langs = new Set<string>();
  FENCE_LANG_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = FENCE_LANG_RE.exec(markdown)) !== null) {
    if (match[1]) {
      langs.add(match[1].toLowerCase());
    }
  }

  for (const lang of langs) {
    if (loaded.has(lang)) {
      continue;
    }
    try {
      await highlighter.loadLanguage(lang as never);
      loaded.add(lang);
    } catch {
      // Unknown language: fallback to plaintext in fence renderer.
    }
  }
}

function escapeHtmlAttr(input: string): string {
  return input.replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function createMarkdownIt(highlighter: Highlighter, theme: string, gfm: boolean): MarkdownIt {
  const md = new MarkdownIt({
    // Allow raw HTML in markdown (e.g. <img ... />).
    html: true,
    linkify: true,
    typographer: false,
    breaks: false,
  });

  if (!gfm) {
    md.disable(["table", "strikethrough"]);
  }

  md.renderer.rules.fence = (tokens: any[], idx: number) => {
    const token = tokens[idx];
    const info = token.info.trim();
    const parts = info.split(/\s+/);
    const lang = parts[0]?.toLowerCase() || "text";
    const fileName = parts.slice(1).join(" ") || null;

    let codeHtml: string;
    try {
      codeHtml = highlighter.codeToHtml(token.content, {
        lang: lang || "text",
        theme,
      });
    } catch {
      codeHtml = highlighter.codeToHtml(token.content, {
        lang: "text",
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

  const defaultLinkOpen = md.renderer.rules.link_open;
  md.renderer.rules.link_open = (tokens: any[], idx: number, options: any, env: any, self: any) => {
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

  return md;
}

export async function createMarkdownRenderer(options: BuildOptions): Promise<MarkdownRenderer> {
  const createHighlighter = createBundledHighlighter({
    langs: bundledLanguages,
    themes: bundledThemes,
    engine: () => createJavaScriptRegexEngine(),
  });

  const highlighter = await createHighlighter({
    themes: [options.shikiTheme],
    langs: ["text", "plaintext", "markdown", "bash", "json", "typescript", "javascript"],
  });
  const loadedLanguages = new Set(highlighter.getLoadedLanguages().map(String));

  const md = createMarkdownIt(highlighter, options.shikiTheme, options.gfm);

  return {
    async render(markdown: string, resolver: WikiResolver): Promise<RenderResult> {
      const { markdown: preprocessed, warnings } = preprocessMarkdown(markdown, resolver, options.imagePolicy, options.wikilinks);
      await loadFenceLanguages(highlighter, loadedLanguages, preprocessed);
      const html = md.render(preprocessed);
      return { html, warnings };
    },
  };
}
