import type { BuildOptions } from "../types";
import { DEFAULT_SITE_TITLE } from "../defaults";
import { makeHash } from "../utils";

export const OUTPUT_MARKER_FILE_NAME = ".eiam-output.json";
export const CLOUDFLARE_HEADERS_FILE_NAME = "_headers";

export function toContentFileName(id: string): string {
  return `${makeHash(id)}.html`;
}

export function resolveSiteTitle(options: BuildOptions): string {
  const value =
    options.siteTitle ?? options.seo?.siteName ?? options.seo?.defaultTitle ?? DEFAULT_SITE_TITLE;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : DEFAULT_SITE_TITLE;
}
