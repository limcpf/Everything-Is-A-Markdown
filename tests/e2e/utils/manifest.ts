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
  const manifest = await page.evaluate(() => {
    const script = document.getElementById("initial-manifest-data");
    if (!(script instanceof HTMLScriptElement) || !script.textContent) {
      return null;
    }
    try {
      return JSON.parse(script.textContent);
    } catch {
      return null;
    }
  });

  if (!manifest || typeof manifest !== "object" || !Array.isArray((manifest as { docs?: unknown[] }).docs)) {
    throw new Error("초기 manifest 데이터를 읽지 못했습니다.");
  }

  const defaultBranchRaw = (manifest as { defaultBranch?: unknown }).defaultBranch;
  const defaultBranch = normalizeBranch(defaultBranchRaw);
  if (!defaultBranch) {
    throw new Error("manifest.defaultBranch 값이 유효하지 않습니다.");
  }

  const docs = (manifest as { docs: Array<{ route?: unknown; branch?: unknown }> }).docs
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
