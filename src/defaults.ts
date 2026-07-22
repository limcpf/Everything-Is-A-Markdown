import { DEFAULT_UI_LOCALE } from "./i18n";

export interface RuntimeLayoutConfig {
  compactBreakpointPx: number;
  desktopSidebarDefaultPx: number;
  desktopSidebarMinPx: number;
  desktopViewerMinPx: number;
  splitterWidthPx: number;
  splitterStepPx: number;
  mobileSidebarMinPx: number;
  mobileSidebarMaxPx: number;
}

export const DEFAULT_BRANCH = "dev";
export const DEFAULT_SITE_TITLE = "File-System Blog";

export const DEFAULT_MERMAID_CONFIG = Object.freeze({
  enabled: true,
  cdnUrl: null,
  theme: "default",
});

export const DEFAULT_RUNTIME_LAYOUT: Readonly<RuntimeLayoutConfig> = Object.freeze({
  compactBreakpointPx: 1024,
  desktopSidebarDefaultPx: 420,
  desktopSidebarMinPx: 320,
  desktopViewerMinPx: 680,
  splitterWidthPx: 10,
  splitterStepPx: 24,
  mobileSidebarMinPx: 300,
  mobileSidebarMaxPx: 560,
});

export const DEFAULT_RUNTIME_CONFIG = Object.freeze({
  defaultBranch: DEFAULT_BRANCH,
  siteTitle: DEFAULT_SITE_TITLE,
  locale: DEFAULT_UI_LOCALE,
  mermaid: DEFAULT_MERMAID_CONFIG,
  layout: DEFAULT_RUNTIME_LAYOUT,
});

export function resolveRuntimeLayoutConfig(value: unknown): RuntimeLayoutConfig {
  const layout =
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Partial<RuntimeLayoutConfig>)
      : {};
  const resolved: RuntimeLayoutConfig = { ...DEFAULT_RUNTIME_LAYOUT };
  for (const key of Object.keys(resolved) as Array<keyof RuntimeLayoutConfig>) {
    const candidate = layout[key];
    if (typeof candidate === "number" && Number.isFinite(candidate) && candidate > 0) {
      resolved[key] = candidate;
    }
  }
  return resolved;
}
