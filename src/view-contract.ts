import { DEFAULT_BRANCH, DEFAULT_SITE_TITLE } from "./defaults";

export interface ViewBacklinkContract {
  route?: unknown;
  title?: unknown;
  prefix?: unknown;
}

export interface ViewDocContract {
  id: string;
  route: string;
  title: string;
  prefix?: unknown;
  date?: unknown;
  updatedDate?: unknown;
  tags?: unknown;
  branch?: unknown;
  backlinks?: readonly ViewBacklinkContract[];
}

export interface ViewChromeModel {
  breadcrumb: {
    items: Array<{ label: string; current: boolean }>;
  };
  meta: {
    prefix: string | null;
    createdAt: string | null;
    tags: string[];
  };
  navigation: {
    previous: ViewLinkModel | null;
    next: ViewLinkModel | null;
  };
  backlinks: Array<ViewLinkModel & { prefix: string | null }>;
}

interface ViewLinkModel {
  route: string;
  href: string;
  title: string;
}

export interface RenderedViewChrome {
  breadcrumbHtml: string;
  metaHtml: string;
  backlinksHtml: string;
  navHtml: string;
}

function toSafeUrlPath(input: string): string {
  return input
    .split("/")
    .map((segment, index) => (index === 0 && segment === "" ? "" : encodeURIComponent(segment)))
    .join("/");
}

export function normalizeViewPathname(pathname: unknown): string {
  let normalized: string;
  try {
    normalized = decodeURIComponent(String(pathname || "/"));
  } catch {
    normalized = String(pathname || "/");
  }
  if (!normalized.startsWith("/")) {
    normalized = `/${normalized}`;
  }
  return normalized.replace(/\/+/g, "/") || "/";
}

export function normalizeViewRoute(pathname: unknown): string {
  const normalized = normalizeViewPathname(pathname);
  return normalized.endsWith("/") ? normalized : `${normalized}/`;
}

export function normalizeViewPathBase(pathBase: unknown): string {
  if (typeof pathBase !== "string") {
    return "";
  }
  const cleaned = pathBase.trim().replace(/\\/g, "/");
  if (!cleaned || cleaned === "/") {
    return "";
  }
  return `/${cleaned.replace(/^\/+/, "").replace(/\/+$/, "")}`;
}

export function stripViewPathBase(pathname: unknown, pathBase: unknown): string {
  const normalizedPath = normalizeViewPathname(pathname);
  const normalizedBase = normalizeViewPathBase(pathBase);
  if (!normalizedBase) {
    return normalizedPath;
  }
  if (normalizedPath === normalizedBase) {
    return "/";
  }
  if (normalizedPath.startsWith(`${normalizedBase}/`)) {
    return normalizedPath.slice(normalizedBase.length) || "/";
  }
  return normalizedPath;
}

export function toViewPathWithBase(pathname: unknown, pathBase: unknown): string {
  const normalizedPath = normalizeViewPathname(pathname);
  const normalizedBase = normalizeViewPathBase(pathBase);
  if (!normalizedBase) {
    return toSafeUrlPath(normalizedPath);
  }
  if (normalizedPath === "/") {
    return toSafeUrlPath(`${normalizedBase}/`);
  }
  return toSafeUrlPath(`${normalizedBase}${normalizedPath}`);
}

export function normalizeViewBranch(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return normalized || null;
}

export function filterViewDocsByBranch<T extends { branch?: unknown }>(
  docs: readonly T[],
  branch: unknown,
  defaultBranch: unknown,
): T[] {
  const normalizedDefault = normalizeViewBranch(defaultBranch) ?? DEFAULT_BRANCH;
  const normalizedBranch = normalizeViewBranch(branch) ?? normalizedDefault;
  return docs.filter((doc) => {
    const docBranch = normalizeViewBranch(doc.branch);
    return docBranch ? docBranch === normalizedBranch : normalizedBranch === normalizedDefault;
  });
}

function normalizeViewDateInput(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  const normalized = value.trim();
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(normalized);
  const offsetlessDateTime = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(
    normalized,
  );
  return dateOnly
    ? `${normalized}T00:00:00Z`
    : offsetlessDateTime
      ? `${normalized.replace(" ", "T")}Z`
      : normalized;
}

function parseDateToEpochMs(value: unknown): number | null {
  const normalized = normalizeViewDateInput(value);
  if (normalized == null) {
    return null;
  }
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function pickViewHomeRoute(
  docs: readonly Pick<ViewDocContract, "route" | "date" | "updatedDate">[],
): string {
  const indexDoc = docs.find((doc) => normalizeViewRoute(doc.route) === "/index/");
  if (indexDoc) {
    return "/index/";
  }
  const selected = [...docs].sort((left, right) => {
    const leftEpoch = parseDateToEpochMs(left.updatedDate) ?? parseDateToEpochMs(left.date);
    const rightEpoch = parseDateToEpochMs(right.updatedDate) ?? parseDateToEpochMs(right.date);
    if (leftEpoch != null && rightEpoch != null && leftEpoch !== rightEpoch) {
      return rightEpoch - leftEpoch;
    }
    if (leftEpoch != null && rightEpoch == null) return -1;
    if (leftEpoch == null && rightEpoch != null) return 1;
    return normalizeViewRoute(left.route).localeCompare(normalizeViewRoute(right.route), "ko-KR");
  })[0];
  return selected ? normalizeViewRoute(selected.route) : "/";
}

export function escapeViewText(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeViewAttribute(value: unknown): string {
  return escapeViewText(value).replaceAll('"', "&quot;");
}

export function formatViewDateTime(value: unknown): string | null {
  const epoch = parseDateToEpochMs(value);
  if (epoch == null) {
    return null;
  }
  const parsed = new Date(epoch);
  const yyyy = parsed.getUTCFullYear();
  const mm = String(parsed.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(parsed.getUTCDate()).padStart(2, "0");
  const hh = String(parsed.getUTCHours()).padStart(2, "0");
  const mi = String(parsed.getUTCMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

export function normalizeViewTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) {
    return [];
  }
  return tags.map((tag) => String(tag).trim().replace(/^#+/, "")).filter(Boolean);
}

function normalizeText(value: unknown, fallback = ""): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || fallback;
}

function createLinkModel(
  doc: Pick<ViewDocContract, "route" | "title">,
  pathBase: unknown,
): ViewLinkModel {
  const route = normalizeViewRoute(doc.route);
  return {
    route,
    href: toViewPathWithBase(route, pathBase),
    title: normalizeText(doc.title, route),
  };
}

export function createViewBreadcrumbModel(routeValue: unknown): ViewChromeModel["breadcrumb"] {
  const route = normalizeViewRoute(routeValue);
  const labels = ["~", ...route.split("/").filter(Boolean)];
  return {
    items: labels.map((label, index) => ({
      label,
      current: index === labels.length - 1 && labels.length > 1,
    })),
  };
}

export function createViewChromeModel(options: {
  route: unknown;
  doc: ViewDocContract;
  docs: readonly ViewDocContract[];
  pathBase: unknown;
}): ViewChromeModel {
  const currentIndex = options.docs.findIndex((doc) => doc.id === options.doc.id);
  const previous = currentIndex > 0 ? options.docs[currentIndex - 1] : null;
  const next =
    currentIndex >= 0 && currentIndex < options.docs.length - 1
      ? options.docs[currentIndex + 1]
      : null;
  const backlinks = Array.isArray(options.doc.backlinks) ? options.doc.backlinks : [];

  return {
    breadcrumb: createViewBreadcrumbModel(options.route),
    meta: {
      prefix: normalizeText(options.doc.prefix) || null,
      createdAt: formatViewDateTime(options.doc.date),
      tags: normalizeViewTags(options.doc.tags),
    },
    navigation: {
      previous: previous ? createLinkModel(previous, options.pathBase) : null,
      next: next ? createLinkModel(next, options.pathBase) : null,
    },
    backlinks: backlinks.map((backlink) => {
      const route = normalizeViewRoute(backlink.route);
      return {
        route,
        href: toViewPathWithBase(route, options.pathBase),
        title: normalizeText(backlink.title, route),
        prefix: normalizeText(backlink.prefix) || null,
      };
    }),
  };
}

function renderBreadcrumb(model: ViewChromeModel["breadcrumb"]): string {
  return model.items
    .map((item) =>
      item.current
        ? `<span class="breadcrumb-current" aria-current="page">${escapeViewText(item.label)}</span>`
        : `<span class="breadcrumb-item">${escapeViewText(item.label)}</span>`,
    )
    .join('<span class="material-symbols-outlined breadcrumb-sep">chevron_right</span>');
}

export function renderViewBreadcrumb(route: unknown): string {
  return renderBreadcrumb(createViewBreadcrumbModel(route));
}

function renderMeta(model: ViewChromeModel["meta"]): string {
  const items: string[] = [];
  if (model.prefix) {
    items.push(`<span class="meta-item meta-prefix">${escapeViewText(model.prefix)}</span>`);
  }
  if (model.createdAt) {
    items.push(
      `<span class="meta-item"><span class="material-symbols-outlined">calendar_today</span>${escapeViewText(model.createdAt)}</span>`,
    );
  }
  if (model.tags.length > 0) {
    const tags = model.tags.map((tag) => `#${escapeViewText(tag)}`).join(" ");
    items.push(`<span class="meta-item meta-tags">${tags}</span>`);
  }
  return items.join("");
}

function renderNavLink(link: ViewLinkModel, direction: "previous" | "next"): string {
  if (direction === "previous") {
    return `<a href="${escapeViewAttribute(link.href)}" class="nav-link nav-link-prev" data-route="${escapeViewAttribute(link.route)}"><div class="nav-link-label"><span class="material-symbols-outlined">arrow_back</span>Previous</div><div class="nav-link-title">${escapeViewText(link.title)}</div></a>`;
  }
  return `<a href="${escapeViewAttribute(link.href)}" class="nav-link nav-link-next" data-route="${escapeViewAttribute(link.route)}"><div class="nav-link-label">Next<span class="material-symbols-outlined">arrow_forward</span></div><div class="nav-link-title">${escapeViewText(link.title)}</div></a>`;
}

function renderNavigation(model: ViewChromeModel["navigation"]): string {
  return [
    model.previous ? renderNavLink(model.previous, "previous") : "",
    model.next ? renderNavLink(model.next, "next") : "",
  ].join("");
}

function renderBacklinks(model: ViewChromeModel["backlinks"]): string {
  if (model.length === 0) {
    return "";
  }
  const items = model
    .map((backlink) => {
      const prefix = backlink.prefix
        ? `<span class="backlink-prefix">${escapeViewText(backlink.prefix)}</span>`
        : "";
      return `<li class="backlinks-item"><a href="${escapeViewAttribute(backlink.href)}" class="backlink-link" data-route="${escapeViewAttribute(backlink.route)}">${prefix}<span class="backlink-text">${escapeViewText(backlink.title)}</span></a></li>`;
    })
    .join("");
  return `<h2 class="backlinks-title">Backlinks</h2><ul class="backlinks-list">${items}</ul>`;
}

export function renderViewChrome(options: {
  route: unknown;
  doc: ViewDocContract;
  docs: readonly ViewDocContract[];
  pathBase: unknown;
}): RenderedViewChrome {
  const model = createViewChromeModel(options);
  return {
    breadcrumbHtml: renderBreadcrumb(model.breadcrumb),
    metaHtml: renderMeta(model.meta),
    backlinksHtml: renderBacklinks(model.backlinks),
    navHtml: renderNavigation(model.navigation),
  };
}

export function composeViewDocumentTitle(pageTitle: unknown, siteTitle: unknown): string {
  const left = normalizeText(pageTitle);
  const right = normalizeText(siteTitle);
  if (!left) {
    return right || DEFAULT_SITE_TITLE;
  }
  if (!right || left === right) {
    return left;
  }
  return `${left} - ${right}`;
}
