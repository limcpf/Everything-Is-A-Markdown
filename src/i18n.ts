export const SUPPORTED_UI_LOCALES = ["ko", "en"] as const;

export type UiLocale = (typeof SUPPORTED_UI_LOCALES)[number];

export const DEFAULT_UI_LOCALE: UiLocale = "ko";

export interface UiMessages {
  defaultDescription: string;
  selectDocumentTitle: string;
  selectDocumentBody: string;
  skipToContent: string;
  documentExplorerPanel: string;
  closeExplorer: string;
  branchLabel: string;
  searchDocuments: string;
  searchPlaceholder: string;
  clearSearch: string;
  previousSearchResult: string;
  nextSearchResult: string;
  documentExplorer: string;
  openExplorerSettings: string;
  explorerSettings: string;
  theme: string;
  selectTheme: string;
  lightTheme: string;
  systemTheme: string;
  darkTheme: string;
  close: string;
  resizeExplorer: string;
  openExplorer: string;
  files: string;
  path: string;
  referencingDocuments: string;
  documentNavigation: string;
  notFoundMessage: string;
  goHome: string;
  previous: string;
  next: string;
  backlinks: string;
  recentFolder: string;
  copyCode: string;
  copied: string;
  imageOmitted: (label: string) => string;
  branchDefault: (branch: string) => string;
  searchMatches: (count: number) => string;
  newBadge: string;
  newDocument: string;
  open: string;
  treeLoading: string;
  simpleDocumentExplorer: string;
  treeLoadFailed: string;
  retryExplorer: string;
  treeFallbackAnnouncement: string;
  navigationComplete: (title: string) => string;
  missingDocumentTitle: string;
  missingRouteBody: string;
  missingRouteAnnouncement: string;
  contentLoadFailedBody: string;
  contentLoadFailedAnnouncement: (title: string) => string;
  initializationFailed: (detail: string) => string;
  manifestLoadFailed: (status: number) => string;
  unsupportedManifest: string;
  mermaidLibraryLoadFailed: (url: string) => string;
  mermaidDisabled: string;
  mermaidApiUnavailable: string;
  mermaidRenderFailed: (detail: string) => string;
}

export type UiMessageCatalog = Readonly<Record<UiLocale, Partial<UiMessages>>>;

const koreanMessages = Object.freeze({
  defaultDescription: "마크다운 탐색기 UI를 제공하는 파일 시스템 스타일 정적 블로그입니다.",
  selectDocumentTitle: "문서를 선택하세요",
  selectDocumentBody: "왼쪽 탐색기에서 문서를 선택하세요.",
  skipToContent: "본문으로 건너뛰기",
  documentExplorerPanel: "문서 탐색기 패널",
  closeExplorer: "탐색기 닫기",
  branchLabel: "브랜치",
  searchDocuments: "문서 검색",
  searchPlaceholder: "검색",
  clearSearch: "검색 지우기",
  previousSearchResult: "이전 검색 결과",
  nextSearchResult: "다음 검색 결과",
  documentExplorer: "문서 탐색기",
  openExplorerSettings: "탐색기 설정 열기",
  explorerSettings: "탐색기 설정",
  theme: "테마",
  selectTheme: "테마 선택",
  lightTheme: "밝게",
  systemTheme: "시스템",
  darkTheme: "어둡게",
  close: "닫기",
  resizeExplorer: "탐색기 너비 조절",
  openExplorer: "탐색기 열기",
  files: "파일",
  path: "경로",
  referencingDocuments: "문서를 참조한 링크",
  documentNavigation: "문서 이전/다음 탐색",
  notFoundMessage: "요청한 문서를 찾을 수 없습니다.",
  goHome: "홈으로 이동",
  previous: "이전",
  next: "다음",
  backlinks: "역링크",
  recentFolder: "최근 문서",
  copyCode: "코드 복사",
  copied: "복사됨",
  imageOmitted: (label) => `(이미지 생략: ${label})`,
  branchDefault: (branch) => `${branch} (기본값)`,
  searchMatches: (count) => `${count}개 일치`,
  newBadge: "NEW",
  newDocument: "새 문서",
  open: "열기",
  treeLoading: "문서 탐색기를 불러오는 중입니다.",
  simpleDocumentExplorer: "간이 문서 탐색기",
  treeLoadFailed: "문서 트리를 불러오지 못했습니다. 아래 링크로 계속 탐색할 수 있습니다.",
  retryExplorer: "탐색기 다시 불러오기",
  treeFallbackAnnouncement:
    "문서 트리를 불러오지 못했습니다. 간이 링크 탐색기를 사용할 수 있습니다.",
  navigationComplete: (title) => `탐색 완료: ${title} 문서를 열었습니다.`,
  missingDocumentTitle: "문서를 찾을 수 없습니다",
  missingRouteBody: "요청한 경로에 해당하는 문서가 없습니다.",
  missingRouteAnnouncement: "탐색 실패: 요청한 문서를 찾을 수 없습니다.",
  contentLoadFailedBody: "본문을 불러오지 못했습니다.",
  contentLoadFailedAnnouncement: (title) => `탐색 실패: ${title} 문서를 불러오지 못했습니다.`,
  initializationFailed: (detail) => `초기화 실패: ${detail}`,
  manifestLoadFailed: (status) => `매니페스트를 불러오지 못했습니다: ${status}`,
  unsupportedManifest: "지원하는 매니페스트 형식을 불러오지 못했습니다.",
  mermaidLibraryLoadFailed: (url) => `Mermaid 라이브러리 로드 실패: ${url}`,
  mermaidDisabled: "Mermaid 렌더링이 비활성화되어 코드 블록을 그대로 표시합니다.",
  mermaidApiUnavailable: "Mermaid 렌더러 API가 존재하지 않습니다.",
  mermaidRenderFailed: (detail) => `Mermaid 렌더링 실패: ${detail}`,
} satisfies UiMessages);

const englishMessages = Object.freeze({
  defaultDescription: "A file-system style static blog with a Markdown explorer UI.",
  selectDocumentTitle: "Select a document",
  selectDocumentBody: "Select a document from the explorer on the left.",
  skipToContent: "Skip to content",
  documentExplorerPanel: "Document explorer panel",
  closeExplorer: "Close explorer",
  branchLabel: "Branch",
  searchDocuments: "Search documents",
  searchPlaceholder: "Search",
  clearSearch: "Clear search",
  previousSearchResult: "Previous search result",
  nextSearchResult: "Next search result",
  documentExplorer: "Document explorer",
  openExplorerSettings: "Open explorer settings",
  explorerSettings: "Explorer settings",
  theme: "Theme",
  selectTheme: "Select theme",
  lightTheme: "Light",
  systemTheme: "System",
  darkTheme: "Dark",
  close: "Close",
  resizeExplorer: "Resize explorer",
  openExplorer: "Open explorer",
  files: "Files",
  path: "Path",
  referencingDocuments: "Links to this document",
  documentNavigation: "Previous and next documents",
  notFoundMessage: "The requested document could not be found.",
  goHome: "Go home",
  previous: "Previous",
  next: "Next",
  backlinks: "Backlinks",
  recentFolder: "Recent",
  copyCode: "Copy code",
  copied: "Copied",
  imageOmitted: (label) => `(image omitted: ${label})`,
  branchDefault: (branch) => `${branch} (default)`,
  searchMatches: (count) => `${count} ${count === 1 ? "match" : "matches"}`,
  newBadge: "NEW",
  newDocument: "New document",
  open: "Open",
  treeLoading: "Loading the document explorer.",
  simpleDocumentExplorer: "Simple document explorer",
  treeLoadFailed: "The document tree could not be loaded. Continue with the links below.",
  retryExplorer: "Reload explorer",
  treeFallbackAnnouncement:
    "The document tree could not be loaded. A simple link explorer is available.",
  navigationComplete: (title) => `Navigation complete: opened ${title}.`,
  missingDocumentTitle: "Document not found",
  missingRouteBody: "No document exists at the requested path.",
  missingRouteAnnouncement: "Navigation failed: the requested document could not be found.",
  contentLoadFailedBody: "The document body could not be loaded.",
  contentLoadFailedAnnouncement: (title) => `Navigation failed: could not load ${title}.`,
  initializationFailed: (detail) => `Initialization failed: ${detail}`,
  manifestLoadFailed: (status) => `Failed to load the manifest: ${status}`,
  unsupportedManifest: "Failed to load a supported manifest schema.",
  mermaidLibraryLoadFailed: (url) => `Failed to load the Mermaid library: ${url}`,
  mermaidDisabled: "Mermaid rendering is disabled, so the code block is shown as-is.",
  mermaidApiUnavailable: "The Mermaid renderer API is unavailable.",
  mermaidRenderFailed: (detail) => `Mermaid rendering failed: ${detail}`,
} satisfies UiMessages);

export const UI_MESSAGE_CATALOG: UiMessageCatalog = Object.freeze({
  ko: koreanMessages,
  en: englishMessages,
});

export function normalizeUiLocale(value: unknown): UiLocale {
  if (typeof value !== "string") {
    return DEFAULT_UI_LOCALE;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "en" || normalized === "ko" ? normalized : DEFAULT_UI_LOCALE;
}

function resolveMessages(locale: UiLocale, catalog: UiMessageCatalog): UiMessages {
  const selected = catalog[locale];
  const entries = Object.entries(koreanMessages).map(([key, fallback]) => {
    const candidate = selected?.[key as keyof UiMessages];
    return [key, typeof candidate === typeof fallback ? candidate : fallback];
  });
  return Object.freeze(Object.fromEntries(entries)) as unknown as UiMessages;
}

const resolvedDefaultCatalog = Object.freeze({
  ko: resolveMessages("ko", UI_MESSAGE_CATALOG),
  en: resolveMessages("en", UI_MESSAGE_CATALOG),
});

export function getUiMessages(
  locale: unknown = DEFAULT_UI_LOCALE,
  catalog: UiMessageCatalog = UI_MESSAGE_CATALOG,
): UiMessages {
  const normalized = normalizeUiLocale(locale);
  return catalog === UI_MESSAGE_CATALOG
    ? resolvedDefaultCatalog[normalized]
    : resolveMessages(normalized, catalog);
}
