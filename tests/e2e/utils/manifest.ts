import { type Page } from "@playwright/test";

export interface ManifestDocShape {
  route: string;
  branch: string | null;
}

export interface ManifestShape {
  defaultBranch: string;
  docs: ManifestDocShape[];
}

export function normalizeBranch(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function isVisibleInBranch(doc: ManifestDocShape, branch: string, defaultBranch: string): boolean {
  const docBranch = normalizeBranch(doc.branch);
  if (!docBranch) {
    return branch === defaultBranch;
  }
  return docBranch === branch;
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function getInitialManifest(page: Page): Promise<ManifestShape> {
  const manifest = await page.evaluate(async () => {
    const script = document.getElementById("initial-runtime-data");
    if (!(script instanceof HTMLScriptElement) || !script.textContent) {
      return null;
    }
    try {
      const runtimeData = JSON.parse(script.textContent) as { manifestUrl?: unknown };
      if (typeof runtimeData.manifestUrl !== "string") {
        return null;
      }
      const response = await fetch(runtimeData.manifestUrl);
      return response.ok ? await response.json() : null;
    } catch {
      return null;
    }
  });

  if (!manifest || typeof manifest !== "object") {
    throw new Error("초기 manifest 데이터를 읽지 못했습니다.");
  }

  const manifestRecord = manifest as {
    schemaVersion?: unknown;
    defaultBranch?: unknown;
    docIds?: unknown;
    docsById?: unknown;
  };
  if (
    manifestRecord.schemaVersion !== 2 ||
    !Array.isArray(manifestRecord.docIds) ||
    !manifestRecord.docsById ||
    typeof manifestRecord.docsById !== "object"
  ) {
    throw new Error("초기 manifest schema v2 데이터를 읽지 못했습니다.");
  }

  const defaultBranchRaw = manifestRecord.defaultBranch;
  const defaultBranch = normalizeBranch(defaultBranchRaw);
  if (!defaultBranch) {
    throw new Error("manifest.defaultBranch 값이 유효하지 않습니다.");
  }

  const docsById = manifestRecord.docsById as Record<string, { route?: unknown; branch?: unknown }>;
  const docs = manifestRecord.docIds
    .map((id) => (typeof id === "string" ? docsById[id] : undefined))
    .filter((doc): doc is { route?: unknown; branch?: unknown } => !!doc)
    .filter((doc) => typeof doc.route === "string" && doc.route.length > 0)
    .map((doc) => ({
      route: String(doc.route),
      branch: normalizeBranch(doc.branch),
    }));

  return { defaultBranch, docs };
}

export function getNextRouteInDefaultBranch(manifest: ManifestShape, route: string): string | null {
  const visibleDocs = manifest.docs.filter((doc) =>
    isVisibleInBranch(doc, manifest.defaultBranch, manifest.defaultBranch),
  );
  const index = visibleDocs.findIndex((doc) => doc.route === route);
  if (index === -1) {
    return null;
  }
  return visibleDocs[index + 1]?.route ?? null;
}
