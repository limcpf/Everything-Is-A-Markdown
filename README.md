# Everything-Is-A-Markdown (EIAM)

로컬 Markdown 볼트를 **파일 탐색기 UX 그대로** 웹에 공개할 수 있게 만드는 정적 블로그 빌더입니다.

- 문서 저장 구조(폴더/파일)를 그대로 살려서 탐색 경험을 제공합니다.
- `publish: true` 문서만 빌드해, 로컬 지식베이스와 공개 콘텐츠를 분리할 수 있습니다.
- 결과물은 순수 HTML/CSS/JS 정적 파일이라 배포가 단순합니다.

**왜 이 프로젝트인가**
- 파일 트리 + 브랜치 필터 + 본문 뷰를 하나의 화면에 결합해 "문서 저장소를 읽는 경험"을 만듭니다.
- 빌드 캐시(`.cache/build-index.json`)로 변경된 문서만 다시 렌더링해 반복 빌드가 빠릅니다.
- Obsidian 스타일 위키링크(`[[...]]`)를 지원해 기존 작성 습관을 크게 바꾸지 않아도 됩니다.
- 문서별 슬러그 고정 URL(`/path/to/doc/`)과 라우트 매핑(`manifest.json`)으로 정적 호스팅에 최적화되어 있습니다.
- 반응형 사이드바, 설정 팝업, 라이트/시스템/다크 테마 전환까지 기본 제공해 바로 운영 가능한 UI를 제공합니다.

**스크린샷 가이드 (원하는 이미지를 아래 설명으로 캡처해서 넣어주세요)**
- (대표 화면: 좌측 파일 트리, 우측 본문, 상단 브랜치 필터 pill이 함께 보이는 데스크톱 전체 화면)
- (브랜치 전환 화면: branch pill 선택 전/후로 목록이 바뀌는 상태)
- (설정 팝업 화면: 메뉴 버튼 위치 토글 + Light/System/Dark 테마 세그먼트가 보이는 화면)
- (다크 모드 화면: 동일 문서를 라이트/다크로 비교 가능한 화면)
- (모바일 화면: 하단 Files 버튼으로 사이드바를 열었을 때 오버레이 포함 화면)

**프로젝트 개요**
이 프로젝트는 로컬 Markdown 문서를 파일 트리 형태로 탐색하고, 정적 사이트로 빌드하는 File-System 스타일 블로그 생성기입니다.

**주요 기능**
- 파일 트리 기반 탐색 UI (폴더/파일 구조 유지)
- 문서별 슬러그 고정 URL 경로 생성 (`/path/to/doc/`)
- Shiki 기반 코드 하이라이팅
- Obsidian 스타일 위키링크 `[[...]]` 지원
- 라이트/시스템/다크 테마 전환 지원 (설정 팝업)
- NEW 배지, Recent 가상 폴더, 문서 메타 표시
- 증분 빌드 캐시(`.cache/build-index.json`)로 재빌드 최적화

**빠른 시작**
1. 의존성 설치

```bash
bun install
```

2. 샘플 볼트로 실행

```bash
bun run dev -- --vault ./test-vault --out ./dist
```

브라우저에서 `http://localhost:3000`으로 접속합니다.

**사용 방법**
스크립트는 `bun run`으로 실행합니다.

```bash
bun run blog [build|dev|clean] [options]
```

기본 명령
- `bun run build` : 정적 사이트 빌드
- `bun run dev` : 개발 서버 실행 + 변경 감지
- `bun run clean` : `dist`와 `.cache` 삭제

옵션
- `--vault <path>`: 마크다운 루트 디렉터리 (기본: `.`)
- `--out <path>`: 출력 디렉터리 (기본: `dist`)
- `--exclude <glob>`: 제외 패턴 (반복 가능, 기본 포함: `.obsidian/**`)
- `--new-within-days <n>`: NEW 배지 기준 일수 (기본: `7`)
- `--recent-limit <n>`: Recent 가상 폴더 노출 개수 (기본: `5`)
- `--menu-config <path>`: 상단 고정 메뉴를 JSON 파일로 임시 덮어쓰기(선택)
- `--port <n>`: dev 서버 포트 (기본: `3000`)

**릴리즈 단일파일 배포 (GitHub Actions)**
- 워크플로우 파일: `.github/workflows/release-single-file.yml`
- 동작: `bun run build` 결과인 `dist`를 단일 `.tar.gz` 파일로 묶어 Release asset으로 업로드
- 자동 실행: `v*` 태그 푸시 시 실행 (예: `v0.1.0`)
- 수동 실행: `Actions > Release Single File > Run workflow`에서 `tag`(필수), `asset_name`(선택) 입력

릴리즈 태그 생성 예시
```bash
git tag v0.1.0
git push origin v0.1.0
```

**bunx 배포 (npm publish)**
- 워크플로우 파일: `.github/workflows/publish-bunx.yml`
- 동작: `v*` 태그 푸시 시 npm에 패키지 publish (`bun publish`)
- 전제: GitHub 저장소 `Settings > Secrets and variables > Actions`에 `NPM_TOKEN` 추가
- 검증: 태그 `vX.Y.Z`와 `package.json`의 `version`이 다르면 배포 실패

사용자 실행 예시
```bash
bunx @limcpf/everything-is-a-markdown build --vault ./vault --out ./dist
bunx @limcpf/everything-is-a-markdown dev --port 3000

# 축약 실행 (bin: eiam)
bunx --package @limcpf/everything-is-a-markdown eiam build --vault ./vault --out ./dist
```

예시
```bash
# 다른 볼트 경로로 빌드
bun run build -- --vault ../vault --out ./dist

# dev 서버 포트 변경
bun run dev -- --port 4000

# 제외 패턴 추가
bun run build -- --exclude "private/**" --exclude "**/drafts/**"

# 상단 고정 메뉴 임시 덮어쓰기(선택)
bun run build -- --menu-config ./menu.config.json
```

**설정 파일**
프로젝트 루트에 `blog.config.ts|js|mjs|cjs`를 두면 CLI 옵션과 병합됩니다.

```ts
// blog.config.ts
export default {
  vaultDir: "./vault",
  outDir: "dist",
  exclude: [".obsidian/**", "private/**"],
  seo: {
    siteUrl: "https://example.com", // origin only (http/https)
    pathBase: "/blog", // optional, deploy base path
    siteName: "Everything-Is-A-Markdown", // optional, og:site_name / WebSite.name
    defaultTitle: "Dev Knowledge Base", // optional, fallback title
    defaultDescription: "Public docs and engineering notes.", // optional, fallback description
    locale: "ko_KR", // optional, og:locale
    twitterCard: "summary_large_image", // optional: "summary" | "summary_large_image"
    twitterSite: "@my_team", // optional
    twitterCreator: "@author_handle", // optional
    defaultSocialImage: "/assets/social/default.png", // optional, absolute URL or /-relative
    defaultOgImage: "/assets/social/og.png", // optional, overrides defaultSocialImage for og:image
    defaultTwitterImage: "/assets/social/twitter.png", // optional, overrides defaultSocialImage for twitter:image
  },
  ui: {
    newWithinDays: 7,
    recentLimit: 5,
  },
  pinnedMenu: {
    label: "NOTICE",
    sourceDir: "Log/(Blog)/Notice",
  },
  markdown: {
    wikilinks: true,
    images: "omit-local", // "keep" | "omit-local"
    gfm: true,
    highlight: {
      theme: "github-dark",
    },
  },
};
```

고정 메뉴 설정 메모
- `pinnedMenu.label`: 탐색기에서 Recent 위에 표시할 이름 (미지정 시 `NOTICE`)
- `pinnedMenu.sourceDir`: vault 기준 실제 물리 디렉터리 경로
- `--menu-config`를 주면 `blog.config.*`의 `pinnedMenu`를 해당 실행에서만 덮어씁니다.

SEO 설정 메모
- `seo.siteUrl`: 필수. 절대 origin만 허용됩니다 (예: `https://example.com`, path/query/hash 불가).
- `seo.pathBase`: 선택. `/blog` 같은 배포 base path를 canonical/OG/sitemap URL에 함께 붙입니다.
- `seo.siteName`: 선택. `og:site_name` 및 루트 JSON-LD(WebSite.name)에 반영됩니다.
- `seo.defaultTitle`: 선택. 문서 제목이 없을 때 fallback `<title>`로 사용됩니다.
- `seo.defaultDescription`: 선택. 문서 설명이 없을 때 fallback description/OG/Twitter 설명으로 사용됩니다.
- `seo.locale`: 선택. `og:locale` 값으로 출력됩니다 (예: `ko_KR`).
- `seo.twitterCard`: 선택. `summary` 또는 `summary_large_image`.
- `seo.twitterSite`, `seo.twitterCreator`: 선택. 각각 `twitter:site`, `twitter:creator`로 출력됩니다.
- `seo.defaultSocialImage`: 선택. OG/Twitter 공통 기본 이미지.
- `seo.defaultOgImage`, `seo.defaultTwitterImage`: 선택. 채널별 이미지 우선값(없으면 `defaultSocialImage` 사용).
- `seo.siteUrl`이 없으면 `robots.txt`, `sitemap.xml`은 생성되지 않습니다.

**콘텐츠 작성 규칙**
- `publish: true`인 문서만 출력됩니다.
- `draft: true`면 출력에서 제외됩니다.
- `branch`를 지정하면 해당 브랜치 필터에서만 노출됩니다.
- `branch`가 없으면 "브랜치 분류 없음"으로 간주되어 기본 브랜치에서만 노출됩니다.
- 기본 브랜치 뷰는 `dev + 분류 없음`이며, 다른 브랜치는 해당 브랜치 글만 노출됩니다.
- `title`이 없으면 파일명에서 자동 생성됩니다.
- 생성일은 `date` 또는 `createdDate`를 사용합니다.
- 수정일은 `updatedDate`(`modifiedDate`/`lastModified`도 허용)를 사용합니다.
- 생성/수정일은 frontmatter에 값이 있을 때만 본문 메타에 표시됩니다.
- `tags`는 문자열 배열로 작성합니다.

```md
---
publish: true
branch: dev
title: My Post
date: "2024-10-24"
updatedDate: "2024-10-25T14:30:00"
description: Short summary
tags: ["dev", "blog"]
---

# Hello
본문 내용...
```

**출력 구조**
- `dist/manifest.json`: 트리, 문서 메타, 라우팅 정보
- `dist/content/*.html`: 각 문서 본문 HTML
- `dist/_app/index.html`: 앱 셸
- `dist/<문서 slug 경로>/index.html`: 각 문서 경로
- `dist/assets/app.js`, `dist/assets/app.css`: 런타임 UI

**SEO/A11y 생성 결과**
- 라우트별 HTML(`index.html`, `about/index.html`, `posts/2024/setup-guide/index.html` 등)에 route-specific `<title>`, description, canonical, Open Graph/Twitter meta가 주입됩니다.
- 각 라우트에 JSON-LD(`application/ld+json`)가 포함됩니다.
- `seo.siteUrl` 설정 시에만 `robots.txt`, `sitemap.xml`이 생성됩니다.
  - `robots.txt`는 `Sitemap: <canonical sitemap url>`을 포함합니다.
  - `sitemap.xml`은 `/` + 게시된 문서 라우트들을 canonical URL로 직렬화합니다 (`seo.pathBase` 반영).
- 접근성 기본값:
  - skip link: `본문으로 건너뛰기` (`href="#viewer-panel"`)
  - live region: `#a11y-status` (`aria-live="polite"`, `aria-atomic="true"`)
  - reduced motion: `prefers-reduced-motion: reduce`에서 `.status-dot` pulse 애니메이션 비활성화

**검증 명령 (복붙용)**

1) Temp CWD 기반으로 SEO OFF/ON 빌드 (repo 설정 파일 비오염)

```bash
REPO="$(pwd)"
TMP_NO="$(mktemp -d)"
TMP_YES="$(mktemp -d)"
TMP_OUT="$(mktemp -d)"

# SEO OFF (blog.config.* 없음)
(cd "$TMP_NO" && bun "$REPO/src/cli.ts" build --vault "$REPO/test-vault" --out "$TMP_OUT/no-seo-out")

# SEO ON (temp blog.config.mjs 사용)
cat > "$TMP_YES/blog.config.mjs" <<'EOF'
export default {
  seo: {
    siteUrl: "https://docs.example.com",
    pathBase: "/kb"
  }
};
EOF
(cd "$TMP_YES" && bun "$REPO/src/cli.ts" build --vault "$REPO/test-vault" --out "$TMP_OUT/with-seo-out")
```

2) 라우트별 head/JSON-LD + robots/sitemap assert

```bash
bun -e 'import { existsSync, readFileSync } from "node:fs";
const out = process.env.OUT;
const noSeoOut = `${out}/no-seo-out`;
const withSeoOut = `${out}/with-seo-out`;
const pages = [
  ["index", `${withSeoOut}/index.html`, "https://docs.example.com/kb/"],
  ["about", `${withSeoOut}/about/index.html`, "https://docs.example.com/kb/about/"],
  ["post", `${withSeoOut}/posts/2024/setup-guide/index.html`, "https://docs.example.com/kb/posts/2024/setup-guide/"],
];
for (const [name, file, canonical] of pages) {
  const html = readFileSync(file, "utf8");
  console.log(`${name}: canonical=${html.includes(`<link rel="canonical" href="${canonical}" />`)} og:url=${html.includes(`<meta property="og:url" content="${canonical}" />`)} jsonld=${/<script type="application\/ld\+json">[\s\S]*<\/script>/.test(html)}`);
}
console.log(`no-seo robots=${existsSync(`${noSeoOut}/robots.txt`)}`);
console.log(`no-seo sitemap=${existsSync(`${noSeoOut}/sitemap.xml`)}`);
console.log(`with-seo robots=${existsSync(`${withSeoOut}/robots.txt`)}`);
console.log(`with-seo sitemap=${existsSync(`${withSeoOut}/sitemap.xml`)}`);
' OUT="$TMP_OUT"
```

3) Playwright MCP 최소 키보드/포커스 + reduced motion 확인 (OpenCode)

```text
static server: (cd "$TMP_OUT/with-seo-out" && python3 -m http.server 4173 --bind 127.0.0.1)

browser_navigate: http://127.0.0.1:4173/

browser_run_code:
async (page) => {
  await page.keyboard.press('Tab');
  const skip = await page.evaluate(() => document.activeElement?.className);
  await page.keyboard.press('Enter');
  const focus = await page.evaluate(() => ({ hash: window.location.hash, id: document.activeElement?.id }));
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const normal = await page.evaluate(() => getComputedStyle(document.querySelector('.status-dot')).animationName);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const reduced = await page.evaluate(() => getComputedStyle(document.querySelector('.status-dot')).animationName);
  return { skip, focus, normal, reduced };
}
```

**추가로 필요한 문서 목록**
- `LICENSE`: 라이선스 명시
- `CHANGELOG.md`: 버전별 변경 이력
- `CONTRIBUTING.md`: 개발/기여 가이드와 브랜치 규칙
- `CODE_OF_CONDUCT.md`: 커뮤니티 행동 강령
- `SECURITY.md`: 보안 취약점 신고 절차
- `docs/CONFIG.md`: 설정 옵션 상세 레퍼런스
- `docs/ARCHITECTURE.md`: 빌드 파이프라인과 런타임 구조 설명
- `docs/DEPLOYMENT.md`: 정적 호스팅 배포 가이드
- `docs/TROUBLESHOOTING.md`: 자주 발생하는 문제와 해결 방법
- `docs/FAQ.md`: 사용자 FAQ
