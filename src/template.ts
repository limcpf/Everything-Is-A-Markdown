import { escapeHtmlAttribute } from "./seo";

const DEFAULT_TITLE = "File-System Blog";
const DEFAULT_DESCRIPTION = "File-system style static blog with markdown explorer UI.";

export interface AppShellMeta {
  title?: string;
  description?: string;
  canonicalUrl?: string;
  ogTitle?: string;
  ogType?: string;
  ogUrl?: string;
  ogDescription?: string;
  ogImage?: string;
  twitterCard?: string;
  twitterTitle?: string;
  twitterDescription?: string;
  twitterImage?: string;
  jsonLd?: unknown | unknown[];
}

export interface AppShellAssets {
  cssHref: string;
  jsSrc: string;
}

export interface AppShellInitialView {
  route: string;
  docId: string;
  title: string;
  breadcrumbHtml: string;
  metaHtml: string;
  contentHtml: string;
  navHtml: string;
}

interface AppShellInitialViewPayload {
  route: string;
  docId: string;
  title: string;
}

const DEFAULT_ASSETS: AppShellAssets = {
  cssHref: "/assets/app.css",
  jsSrc: "/assets/app.js",
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

function renderHeadMeta(meta: AppShellMeta): string {
  const title = (meta.title ?? DEFAULT_TITLE).trim() || DEFAULT_TITLE;
  const description = typeof meta.description === "string" ? meta.description.trim() : "";
  const fallbackDescription = description || DEFAULT_DESCRIPTION;
  const canonicalUrl = typeof meta.canonicalUrl === "string" ? meta.canonicalUrl.trim() : "";

  const ogTitle = (meta.ogTitle ?? title).trim() || title;
  const ogType = (meta.ogType ?? "website").trim() || "website";
  const ogUrl = typeof meta.ogUrl === "string" ? meta.ogUrl.trim() : "";
  const ogDescription = (meta.ogDescription ?? (description || DEFAULT_DESCRIPTION)).trim() || DEFAULT_DESCRIPTION;
  const ogImage = typeof meta.ogImage === "string" ? meta.ogImage.trim() : "";

  const twitterCard = (meta.twitterCard ?? "summary").trim() || "summary";
  const twitterTitle = (meta.twitterTitle ?? title).trim() || title;
  const twitterDescription = (meta.twitterDescription ?? (description || DEFAULT_DESCRIPTION)).trim() || DEFAULT_DESCRIPTION;
  const twitterImage = typeof meta.twitterImage === "string" ? meta.twitterImage.trim() : "";
  const jsonLd = normalizeJsonLd(meta.jsonLd);

  const headTags: string[] = [`    <title>${escapeHtmlAttribute(title)}</title>`];

  headTags.push(`    <meta name="description" content="${escapeHtmlAttribute(fallbackDescription)}" />`);

  if (canonicalUrl) {
    headTags.push(`    <link rel="canonical" href="${escapeHtmlAttribute(canonicalUrl)}" />`);
  }

  headTags.push(`    <meta property="og:title" content="${escapeHtmlAttribute(ogTitle)}" />`);
  headTags.push(`    <meta property="og:type" content="${escapeHtmlAttribute(ogType)}" />`);

  if (ogUrl) {
    headTags.push(`    <meta property="og:url" content="${escapeHtmlAttribute(ogUrl)}" />`);
  }

  headTags.push(`    <meta property="og:description" content="${escapeHtmlAttribute(ogDescription)}" />`);

  if (ogImage) {
    headTags.push(`    <meta property="og:image" content="${escapeHtmlAttribute(ogImage)}" />`);
  }

  headTags.push(`    <meta name="twitter:card" content="${escapeHtmlAttribute(twitterCard)}" />`);
  headTags.push(`    <meta name="twitter:title" content="${escapeHtmlAttribute(twitterTitle)}" />`);
  headTags.push(`    <meta name="twitter:description" content="${escapeHtmlAttribute(twitterDescription)}" />`);

  if (twitterImage) {
    headTags.push(`    <meta name="twitter:image" content="${escapeHtmlAttribute(twitterImage)}" />`);
  }

  for (const schema of jsonLd) {
    headTags.push(`    <script type="application/ld+json">${stringifyJsonLd(schema)}</script>`);
  }

  return headTags.join("\n");
}

function renderDeferredStylesheet(href: string): string {
  return [
    `    <link rel="preload" href="${escapeHtmlAttribute(href)}" as="style" />`,
    `    <link rel="stylesheet" href="${escapeHtmlAttribute(href)}" media="print" onload="this.media='all'" />`,
    `    <noscript><link rel="stylesheet" href="${escapeHtmlAttribute(href)}" /></noscript>`,
  ].join("\n");
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

export function renderAppShellHtml(
  meta: AppShellMeta = {},
  assets: AppShellAssets = DEFAULT_ASSETS,
  initialView: AppShellInitialView | null = null,
): string {
  const headMeta = renderHeadMeta(meta);
  const initialViewScript = renderInitialViewScript(initialView);
  const textFontStylesheet =
    "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Noto+Sans+KR:wght@400;500;700&display=optional";
  const symbolFontStylesheet =
    "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=optional";
  const initialTitle = initialView ? escapeHtmlAttribute(initialView.title) : "문서를 선택하세요";
  const initialBreadcrumb = initialView ? initialView.breadcrumbHtml : "";
  const initialMeta = initialView ? initialView.metaHtml : "";
  const initialContent = initialView
    ? initialView.contentHtml
    : '<p class="placeholder">좌측 탐색기에서 문서를 선택하세요.</p>';
  const initialNav = initialView ? initialView.navHtml : "";

  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
${headMeta}
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
${renderDeferredStylesheet(textFontStylesheet)}
${renderDeferredStylesheet(symbolFontStylesheet)}
    <link rel="stylesheet" href="${escapeHtmlAttribute(assets.cssHref)}" />
  </head>
  <body>
    <a class="skip-link" href="#viewer-panel">본문으로 건너뛰기</a>
    <div id="a11y-status" class="sr-only" aria-live="polite" aria-atomic="true"></div>
    <div class="app-root">
      <div id="sidebar-overlay" class="sidebar-overlay" hidden></div>
      <aside id="sidebar-panel" class="sidebar" aria-label="문서 탐색기 패널">
        <div class="sidebar-header">
          <h1 class="sidebar-title">
            <span class="material-symbols-outlined icon-terminal">terminal</span>
            ~/dev-blog
          </h1>
          <button id="sidebar-close" class="sidebar-close" type="button" aria-label="탐색기 닫기">
            <span class="material-symbols-outlined">close</span>
          </button>
          <div class="sidebar-branch">
            <span class="branch-badge" aria-hidden="true">
              <span class="material-symbols-outlined icon-branch">call_split</span>branch
            </span>
            <div id="sidebar-branch-pills" class="branch-pills" role="group" aria-label="브랜치 선택"></div>
            <span id="sidebar-branch-info" class="branch-info">publish: true</span>
          </div>
        </div>
        <nav id="tree-root" class="tree-root" aria-label="문서 탐색기" tabindex="0"></nav>
        <div class="sidebar-footer">
          <div class="status-online">
            <span class="status-dot"></span>
            <span>Online</span>
          </div>
          <div class="sidebar-footer-actions">
            <div class="status-encoding">UTF-8</div>
            <button
              id="settings-toggle"
              class="settings-toggle"
              type="button"
              aria-controls="sidebar-settings"
              aria-expanded="false"
              aria-label="탐색기 설정 열기"
            >
              <span class="material-symbols-outlined">tune</span>
            </button>
          </div>
          <section id="sidebar-settings" class="sidebar-settings" hidden aria-label="탐색기 설정">
            <p class="sidebar-settings-title">탐색기 설정</p>
            <fieldset class="settings-group">
              <legend>메뉴 버튼 위치</legend>
              <label class="settings-option">
                <input type="radio" name="menu-toggle-position" value="right" checked />
                <span>오른쪽 하단</span>
              </label>
              <label class="settings-option">
                <input type="radio" name="menu-toggle-position" value="left" />
                <span>왼쪽 하단</span>
              </label>
            </fieldset>
            <fieldset class="settings-group">
              <legend>테마</legend>
              <div class="settings-segment" role="radiogroup" aria-label="테마 선택">
                <label class="settings-segment-option">
                  <input type="radio" name="theme-mode" value="light" />
                  <span>Light</span>
                </label>
                <label class="settings-segment-option">
                  <input type="radio" name="theme-mode" value="system" checked />
                  <span>System</span>
                </label>
                <label class="settings-segment-option">
                  <input type="radio" name="theme-mode" value="dark" />
                  <span>Dark</span>
                </label>
              </div>
            </fieldset>
            <button id="settings-close" class="settings-close" type="button">닫기</button>
          </section>
        </div>
      </aside>
      <div
        id="app-splitter"
        class="app-splitter"
        role="separator"
        aria-orientation="vertical"
        aria-controls="sidebar-panel viewer-panel"
        aria-label="탐색기 너비 조절"
        tabindex="0"
      ></div>
      <main id="viewer-panel" class="viewer" tabindex="-1">
        <button
          id="sidebar-toggle"
          class="mobile-menu-toggle"
          type="button"
          aria-controls="sidebar-panel"
          aria-expanded="false"
          aria-label="탐색기 열기"
        >
          <span class="material-symbols-outlined">menu</span>
          <span>Files</span>
        </button>
        <div class="viewer-container">
          <nav id="viewer-breadcrumb" class="viewer-breadcrumb" aria-label="경로">${initialBreadcrumb}</nav>
          <header id="viewer-header" class="viewer-header">
            <h1 id="viewer-title" class="viewer-title">${initialTitle}</h1>
            <div id="viewer-meta" class="viewer-meta">${initialMeta}</div>
          </header>
          <article id="viewer-content" class="viewer-content">${initialContent}</article>
          <nav id="viewer-nav" class="viewer-nav">${initialNav}</nav>
        </div>
      </main>
    </div>
    <div id="tree-label-tooltip" class="tree-label-tooltip" role="tooltip" hidden></div>
${initialViewScript}
    <script type="module" src="${escapeHtmlAttribute(assets.jsSrc)}"></script>
  </body>
</html>
`;
}

export function render404Html(assets: AppShellAssets = DEFAULT_ASSETS): string {
  const textFontStylesheet =
    "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Noto+Sans+KR:wght@400;500;700&display=optional";
  const symbolFontStylesheet =
    "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=optional";

  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>404 - File-System Blog</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
${renderDeferredStylesheet(textFontStylesheet)}
${renderDeferredStylesheet(symbolFontStylesheet)}
    <link rel="stylesheet" href="${escapeHtmlAttribute(assets.cssHref)}" />
  </head>
  <body>
    <main class="not-found">
      <div class="not-found-icon">
        <span class="material-symbols-outlined">folder_off</span>
      </div>
      <h1>404</h1>
      <p>요청한 문서를 찾을 수 없습니다.</p>
      <a href="/" class="not-found-link">
        <span class="material-symbols-outlined">home</span>
        홈으로 이동
      </a>
    </main>
  </body>
</html>
`;
}
