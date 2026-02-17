import { expect, test, type Page } from "@playwright/test";

interface ManifestDocShape {
  route: string;
  branch: string | null;
}

interface ManifestShape {
  defaultBranch: string;
  docs: ManifestDocShape[];
}

function normalizeBranch(value: unknown): string | null {
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function getInitialManifest(page: Page): Promise<ManifestShape> {
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

function getNextRouteInDefaultBranch(manifest: ManifestShape, route: string): string | null {
  const visibleDocs = manifest.docs.filter((doc) =>
    isVisibleInBranch(doc, manifest.defaultBranch, manifest.defaultBranch),
  );
  const index = visibleDocs.findIndex((doc) => doc.route === route);
  if (index === -1) {
    return null;
  }
  return visibleDocs[index + 1]?.route ?? null;
}

test.describe("prefix 라우팅/백링크/자동 브랜치 전환", () => {
  test("main 저장 상태에서 unclassified 문서 진입 시 nav가 활성 브랜치 기준으로 동기화된다", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("fsblog.branch", "main");
    });

    await page.goto("/BC-VO-00/");
    const manifest = await getInitialManifest(page);
    const nextRoute = getNextRouteInDefaultBranch(manifest, "/BC-VO-00/");

    if (!nextRoute) {
      throw new Error("기본 브랜치에서 /BC-VO-00/ 다음 문서를 찾지 못했습니다.");
    }

    await expect(page.locator("#viewer-title")).toHaveText("About");
    await expect(page.locator(`.branch-pill.is-active[data-branch="${manifest.defaultBranch}"]`)).toBeVisible();

    const nextToSetupGuide = page.locator(`#viewer-nav .nav-link[data-route="${nextRoute}"]`);
    await expect(nextToSetupGuide).toBeVisible();

    await nextToSetupGuide.click();
    await expect(page).toHaveURL(new RegExp(`${escapeRegExp(nextRoute)}$`));
  });

  test("backlinks 클릭 시 prefix 경로 이동과 자동 브랜치 전환이 함께 동작한다", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("fsblog.branch", "main");
    });

    await page.goto("/BC-VO-01/");
    const manifest = await getInitialManifest(page);
    const nextRoute = getNextRouteInDefaultBranch(manifest, "/BC-VO-00/");

    if (!nextRoute) {
      throw new Error("기본 브랜치에서 /BC-VO-00/ 다음 문서를 찾지 못했습니다.");
    }

    const backlinks = page.locator("#viewer-backlinks");
    await expect(backlinks).toBeVisible();

    const aboutBacklink = backlinks.locator('.backlink-link[data-route="/BC-VO-00/"]');
    await expect(aboutBacklink).toBeVisible();
    await aboutBacklink.click();

    await expect(page).toHaveURL(/\/BC-VO-00\/$/);
    await expect(page.locator("#viewer-title")).toHaveText("About");
    await expect(page.locator(`.branch-pill.is-active[data-branch="${manifest.defaultBranch}"]`)).toBeVisible();
    await expect(page.locator(`#viewer-nav .nav-link[data-route="${nextRoute}"]`)).toBeVisible();
  });
});
