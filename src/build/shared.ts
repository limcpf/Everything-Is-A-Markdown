import type { BuildOptions } from "../types";
import { makeHash } from "../utils";

const DEFAULT_SITE_TITLE = "File-System Blog";

export const OUTPUT_MARKER_FILE_NAME = ".eiam-output.json";

export function toContentFileName(id: string): string {
  return `${makeHash(id)}.html`;
}

export function resolveSiteTitle(options: BuildOptions): string {
  const value = options.siteTitle ?? options.seo?.siteName ?? options.seo?.defaultTitle ?? DEFAULT_SITE_TITLE;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : DEFAULT_SITE_TITLE;
}
