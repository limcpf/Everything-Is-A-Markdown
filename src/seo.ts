import type { BuildSeoOptions, UserSeoConfig } from "./types";

function normalizePathBase(pathBase: string): string {
  const cleaned = pathBase.trim().replace(/\\/g, "/");
  if (!cleaned || cleaned === "/") {
    return "";
  }

  const normalized = `/${cleaned.replace(/^\/+/, "").replace(/\/+$/, "")}`;
  return normalized === "/" ? "" : normalized;
}

function normalizeRoute(route: string): string {
  const trimmed = route.trim();
  if (!trimmed || trimmed === "/") {
    return "/";
  }

  const routeNoQuery = trimmed.split(/[?#]/, 1)[0] ?? "";
  const prefixed = routeNoQuery.startsWith("/") ? routeNoQuery : `/${routeNoQuery}`;
  const collapsed = prefixed.replace(/\/+/g, "/");
  return collapsed || "/";
}

export function normalizeSeoConfig(raw: UserSeoConfig | undefined): BuildSeoOptions | null {
  if (!raw || raw.siteUrl == null) {
    return null;
  }

  if (typeof raw.siteUrl !== "string" || raw.siteUrl.trim().length === 0) {
    throw new Error(
      '[config] "seo.siteUrl" must be a non-empty absolute URL origin (for example: "https://example.com")',
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(raw.siteUrl.trim());
  } catch {
    throw new Error(
      '[config] "seo.siteUrl" must be a valid absolute URL origin (for example: "https://example.com")',
    );
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error('[config] "seo.siteUrl" must use http:// or https://');
  }

  if (parsed.pathname !== "/" || parsed.search || parsed.hash || parsed.username || parsed.password) {
    throw new Error(
      '[config] "seo.siteUrl" must be an origin only, without path, query, hash, or credentials (for example: "https://example.com")',
    );
  }

  const pathBaseRaw = raw.pathBase;
  if (pathBaseRaw != null && typeof pathBaseRaw !== "string") {
    throw new Error('[config] "seo.pathBase" must be a string when provided (for example: "/blog")');
  }

  return {
    siteUrl: parsed.origin,
    pathBase: normalizePathBase(pathBaseRaw ?? ""),
  };
}

export function buildCanonicalUrl(route: string, seo: Pick<BuildSeoOptions, "siteUrl" | "pathBase">): string {
  const normalizedRoute = normalizeRoute(route);
  const pathname = `${seo.pathBase}${normalizedRoute}`.replace(/\/+/g, "/") || "/";
  return new URL(pathname, `${seo.siteUrl}/`).toString();
}

export function escapeHtmlAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
