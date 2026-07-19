import { escapeHtmlAttribute } from "./seo";
import { DEFAULT_SITE_TITLE } from "./defaults";
import { getUiMessages, normalizeUiLocale } from "./i18n";
import { renderAppIconSprite } from "./icon-sprite";
import { renderAppIcon } from "./icons";
import type { Manifest } from "./types";
import { toViewPathWithBase } from "./view-contract";

export interface AppShellMeta {
  title?: string;
  description?: string;
  canonicalUrl?: string;
  ogTitle?: string;
  ogType?: string;
  ogSiteName?: string;
  ogLocale?: string;
  ogUrl?: string;
  ogDescription?: string;
  ogImage?: string;
  twitterCard?: string;
  twitterTitle?: string;
  twitterDescription?: string;
  twitterImage?: string;
  twitterSite?: string;
  twitterCreator?: string;
  jsonLd?: unknown | unknown[];
}

export interface AppShellAssets {
  cssHref: string;
  jsSrc: string;
  treeModulePath: string;
}

export interface AppShellInitialView {
  route: string;
  docId: string;
  title: string;
  breadcrumbHtml: string;
  metaHtml: string;
  contentHtml: string;
  backlinksHtml: string;
  navHtml: string;
}

interface AppShellInitialViewPayload {
  route: string;
  docId: string;
  title: string;
}

type AppShellManifestPayload = Manifest;

interface AppShellRuntimePayload {
  manifestUrl: string;
  pathBase: string;
  treeModuleUrl: string;
}

const DEFAULT_ASSETS: AppShellAssets = {
  cssHref: "/assets/app.css",
  jsSrc: "/assets/app.js",
  treeModulePath: "/assets/tree.js",
};

function normalizeJsonLd(value: unknown | unknown[] | undefined): unknown[] {
  if (Array.isArray(value)) {
    return value.filter((item) => item != null);
  }
  return value == null ? [] : [value];
}

function stringifyJsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

function renderHeadMeta(meta: AppShellMeta, defaultDescription: string): string {
  const title = (meta.title ?? DEFAULT_SITE_TITLE).trim() || DEFAULT_SITE_TITLE;
  const description = typeof meta.description === "string" ? meta.description.trim() : "";
  const fallbackDescription = description || defaultDescription;
  const canonicalUrl = typeof meta.canonicalUrl === "string" ? meta.canonicalUrl.trim() : "";

  const ogTitle = (meta.ogTitle ?? title).trim() || title;
  const ogType = (meta.ogType ?? "website").trim() || "website";
  const ogSiteName = typeof meta.ogSiteName === "string" ? meta.ogSiteName.trim() : "";
  const ogLocale = typeof meta.ogLocale === "string" ? meta.ogLocale.trim() : "";
  const ogUrl = typeof meta.ogUrl === "string" ? meta.ogUrl.trim() : "";
  const ogDescription =
    (meta.ogDescription ?? (description || defaultDescription)).trim() || defaultDescription;
  const ogImage = typeof meta.ogImage === "string" ? meta.ogImage.trim() : "";

  const twitterCard = (meta.twitterCard ?? "summary").trim() || "summary";
  const twitterTitle = (meta.twitterTitle ?? title).trim() || title;
  const twitterDescription =
    (meta.twitterDescription ?? (description || defaultDescription)).trim() || defaultDescription;
  const twitterImage = typeof meta.twitterImage === "string" ? meta.twitterImage.trim() : "";
  const twitterSite = typeof meta.twitterSite === "string" ? meta.twitterSite.trim() : "";
  const twitterCreator = typeof meta.twitterCreator === "string" ? meta.twitterCreator.trim() : "";
  const jsonLd = normalizeJsonLd(meta.jsonLd);

  const headTags: string[] = [`    <title>${escapeHtmlAttribute(title)}</title>`];

  headTags.push(
    `    <meta name="description" content="${escapeHtmlAttribute(fallbackDescription)}" />`,
  );

  if (canonicalUrl) {
    headTags.push(`    <link rel="canonical" href="${escapeHtmlAttribute(canonicalUrl)}" />`);
  }

  headTags.push(`    <meta property="og:title" content="${escapeHtmlAttribute(ogTitle)}" />`);
  headTags.push(`    <meta property="og:type" content="${escapeHtmlAttribute(ogType)}" />`);

  if (ogUrl) {
    headTags.push(`    <meta property="og:url" content="${escapeHtmlAttribute(ogUrl)}" />`);
  }

  if (ogSiteName) {
    headTags.push(
      `    <meta property="og:site_name" content="${escapeHtmlAttribute(ogSiteName)}" />`,
    );
  }

  if (ogLocale) {
    headTags.push(`    <meta property="og:locale" content="${escapeHtmlAttribute(ogLocale)}" />`);
  }

  headTags.push(
    `    <meta property="og:description" content="${escapeHtmlAttribute(ogDescription)}" />`,
  );

  if (ogImage) {
    headTags.push(`    <meta property="og:image" content="${escapeHtmlAttribute(ogImage)}" />`);
  }

  headTags.push(`    <meta name="twitter:card" content="${escapeHtmlAttribute(twitterCard)}" />`);
  headTags.push(`    <meta name="twitter:title" content="${escapeHtmlAttribute(twitterTitle)}" />`);
  headTags.push(
    `    <meta name="twitter:description" content="${escapeHtmlAttribute(twitterDescription)}" />`,
  );

  if (twitterImage) {
    headTags.push(
      `    <meta name="twitter:image" content="${escapeHtmlAttribute(twitterImage)}" />`,
    );
  }

  if (twitterSite) {
    headTags.push(`    <meta name="twitter:site" content="${escapeHtmlAttribute(twitterSite)}" />`);
  }

  if (twitterCreator) {
    headTags.push(
      `    <meta name="twitter:creator" content="${escapeHtmlAttribute(twitterCreator)}" />`,
    );
  }

  for (const schema of jsonLd) {
    headTags.push(`    <script type="application/ld+json">${stringifyJsonLd(schema)}</script>`);
  }

  return headTags.join("\n");
}

function renderInitialViewScript(initialView: AppShellInitialView | null): string {
  if (!initialView) {
    return "";
  }

  const payloadData: AppShellInitialViewPayload = {
    route: initialView.route,
    docId: initialView.docId,
    title: initialView.title,
  };

  const payload = JSON.stringify(payloadData)
    .replaceAll("<", "\\u003c")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");

  return `\n    <script id="initial-view-data" type="application/json">${payload}</script>`;
}

function renderRuntimeBootstrapScript(
  manifest: AppShellManifestPayload | null,
  assets: AppShellAssets,
): string {
  if (!manifest) {
    return "";
  }

  const payloadData: AppShellRuntimePayload = {
    manifestUrl: toViewPathWithBase("/manifest.json", manifest.pathBase),
    pathBase: manifest.pathBase,
    treeModuleUrl: toViewPathWithBase(assets.treeModulePath, manifest.pathBase),
  };
  const payload = JSON.stringify(payloadData)
    .replaceAll("<", "\\u003c")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");

  return `\n    <script id="initial-runtime-data" type="application/json">${payload}</script>`;
}

export function renderAppShellHtml(
  meta: AppShellMeta = {},
  assets: AppShellAssets = DEFAULT_ASSETS,
  initialView: AppShellInitialView | null = null,
  manifest: AppShellManifestPayload | null = null,
): string {
  const locale = normalizeUiLocale(manifest?.locale);
  const messages = getUiMessages(locale);
  const text = escapeHtmlAttribute;
  const headMeta = renderHeadMeta(meta, messages.defaultDescription);
  const initialViewScript = renderInitialViewScript(initialView);
  const runtimeBootstrapScript = renderRuntimeBootstrapScript(manifest, assets);
  const appTitle =
    typeof manifest?.siteTitle === "string" && manifest.siteTitle.trim().length > 0
      ? manifest.siteTitle.trim()
      : DEFAULT_SITE_TITLE;
  const initialTitle = initialView
    ? escapeHtmlAttribute(initialView.title)
    : text(messages.selectDocumentTitle);
  const initialBreadcrumb = initialView ? initialView.breadcrumbHtml : "";
  const initialMeta = initialView ? initialView.metaHtml : "";
  const initialContent = initialView
    ? initialView.contentHtml
    : `<p class="placeholder">${text(messages.selectDocumentBody)}</p>`;
  const initialBacklinks = initialView ? initialView.backlinksHtml : "";
  const initialNav = initialView ? initialView.navHtml : "";

  return `<!doctype html>
<html lang="${locale}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
${headMeta}
    <link rel="stylesheet" href="${escapeHtmlAttribute(assets.cssHref)}" />
  </head>
  <body>
    ${renderAppIconSprite()}
    <a class="skip-link" href="#viewer-panel">${text(messages.skipToContent)}</a>
    <div id="a11y-status" class="sr-only" aria-live="polite" aria-atomic="true"></div>
    <div class="app-root">
      <div id="sidebar-overlay" class="sidebar-overlay" aria-hidden="true" hidden></div>
      <aside id="sidebar-panel" class="sidebar" role="complementary" aria-label="${text(messages.documentExplorerPanel)}">
        <div class="sidebar-header">
          <div class="sidebar-heading">
            <h1 class="sidebar-title">${escapeHtmlAttribute(appTitle)}</h1>
            <button id="sidebar-close" class="sidebar-close" type="button" aria-label="${text(messages.closeExplorer)}">
              ${renderAppIcon("close")}
            </button>
          </div>
          <label class="sidebar-branch" for="sidebar-branch-select">
            <span class="branch-label">${text(messages.branchLabel)}</span>
            <select id="sidebar-branch-select" class="branch-select"></select>
          </label>
        </div>
        <div class="sidebar-search">
          <div class="sidebar-search-box">
            ${renderAppIcon("search", "sidebar-search-icon")}
            <input
              id="tree-search-input"
              class="tree-search-input"
              type="search"
              autocomplete="off"
              spellcheck="false"
              aria-label="${text(messages.searchDocuments)}"
              placeholder="${text(messages.searchPlaceholder)}"
            />
            <button id="tree-search-clear" class="tree-search-clear" type="button" aria-label="${text(messages.clearSearch)}" title="${text(messages.clearSearch)}" hidden>
              ${renderAppIcon("close")}
            </button>
          </div>
          <div id="sidebar-search-actions" class="sidebar-search-actions" aria-live="polite" hidden>
            <span id="tree-search-count" class="tree-search-count"></span>
            <div class="tree-search-nav">
              <button id="tree-search-prev" class="tree-search-step" type="button" aria-label="${text(messages.previousSearchResult)}" title="${text(messages.previousSearchResult)}" disabled>
                ${renderAppIcon("chevron-up")}
              </button>
              <button id="tree-search-next" class="tree-search-step" type="button" aria-label="${text(messages.nextSearchResult)}" title="${text(messages.nextSearchResult)}" disabled>
                ${renderAppIcon("chevron-down")}
              </button>
            </div>
          </div>
        </div>
        <nav id="tree-root" class="tree-root" aria-label="${text(messages.documentExplorer)}" tabindex="0"></nav>
        <div class="sidebar-tools">
          <button
            id="settings-toggle"
            class="settings-toggle"
            type="button"
            aria-controls="sidebar-settings"
            aria-expanded="false"
            aria-label="${text(messages.openExplorerSettings)}"
          >
            ${renderAppIcon("settings")}
          </button>
          <section id="sidebar-settings" class="sidebar-settings" hidden aria-label="${text(messages.explorerSettings)}">
            <p class="sidebar-settings-title">${text(messages.explorerSettings)}</p>
            <fieldset class="settings-group">
              <legend>${text(messages.menuButtonPosition)}</legend>
              <label class="settings-option">
                <input type="radio" name="menu-toggle-position" value="right" checked />
                <span>${text(messages.bottomRight)}</span>
              </label>
              <label class="settings-option">
                <input type="radio" name="menu-toggle-position" value="left" />
                <span>${text(messages.bottomLeft)}</span>
              </label>
            </fieldset>
            <fieldset class="settings-group">
              <legend>${text(messages.theme)}</legend>
              <div class="settings-segment" role="radiogroup" aria-label="${text(messages.selectTheme)}">
                <label class="settings-segment-option">
                  <input type="radio" name="theme-mode" value="light" />
                  <span>${text(messages.lightTheme)}</span>
                </label>
                <label class="settings-segment-option">
                  <input type="radio" name="theme-mode" value="system" checked />
                  <span>${text(messages.systemTheme)}</span>
                </label>
                <label class="settings-segment-option">
                  <input type="radio" name="theme-mode" value="dark" />
                  <span>${text(messages.darkTheme)}</span>
                </label>
              </div>
            </fieldset>
            <button id="settings-close" class="settings-close" type="button">${text(messages.close)}</button>
          </section>
        </div>
      </aside>
      <div
        id="app-splitter"
        class="app-splitter"
        role="separator"
        aria-orientation="vertical"
        aria-controls="sidebar-panel viewer-panel"
        aria-label="${text(messages.resizeExplorer)}"
        tabindex="0"
      ></div>
      <main id="viewer-panel" class="viewer" tabindex="-1">
        <button
          id="sidebar-toggle"
          class="mobile-menu-toggle"
          type="button"
          aria-controls="sidebar-panel"
          aria-expanded="false"
          aria-label="${text(messages.openExplorer)}"
        >
          ${renderAppIcon("menu")}
          <span>${text(messages.files)}</span>
        </button>
        <div class="viewer-container">
          <nav id="viewer-breadcrumb" class="viewer-breadcrumb" aria-label="${text(messages.path)}">${initialBreadcrumb}</nav>
          <header id="viewer-header" class="viewer-header">
            <h1 id="viewer-title" class="viewer-title">${initialTitle}</h1>
            <div id="viewer-meta" class="viewer-meta">${initialMeta}</div>
          </header>
          <article id="viewer-content" class="viewer-content">${initialContent}</article>
          <section id="viewer-backlinks" class="viewer-backlinks" aria-label="${text(messages.referencingDocuments)}" ${initialBacklinks ? "" : "hidden"}>${initialBacklinks}</section>
          <nav id="viewer-nav" class="viewer-nav" aria-label="${text(messages.documentNavigation)}">${initialNav}</nav>
        </div>
      </main>
    </div>
    <div id="tree-label-tooltip" class="tree-label-tooltip" role="tooltip" hidden></div>
${initialViewScript}
${runtimeBootstrapScript}
    <script type="module" src="${escapeHtmlAttribute(assets.jsSrc)}"></script>
  </body>
</html>
`;
}

export function render404Html(
  assets: AppShellAssets = DEFAULT_ASSETS,
  homeHref = "/",
  siteTitle = DEFAULT_SITE_TITLE,
  locale: unknown = undefined,
): string {
  const normalizedLocale = normalizeUiLocale(locale);
  const messages = getUiMessages(normalizedLocale);
  const text = escapeHtmlAttribute;
  return `<!doctype html>
<html lang="${normalizedLocale}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>404 - ${escapeHtmlAttribute(siteTitle.trim() || DEFAULT_SITE_TITLE)}</title>
    <link rel="stylesheet" href="${escapeHtmlAttribute(assets.cssHref)}" />
  </head>
  <body>
    ${renderAppIconSprite()}
    <main class="not-found">
      <div class="not-found-icon">
        ${renderAppIcon("folder-off")}
      </div>
      <h1>404</h1>
      <p>${text(messages.notFoundMessage)}</p>
      <a href="${escapeHtmlAttribute(homeHref)}" class="not-found-link">
        ${renderAppIcon("home")}
        ${text(messages.goHome)}
      </a>
    </main>
  </body>
</html>
`;
}
