# fs-blog-v2

**프로젝트 개요**
이 프로젝트는 로컬 Markdown 문서를 파일 트리 형태로 탐색하고, 정적 사이트로 빌드하는 File-System 스타일 블로그 생성기입니다. `publish: true`로 표시된 문서만 렌더링되며, 빌드 결과는 순수 HTML/CSS/JS로 출력됩니다.

**주요 기능**
- 파일 트리 기반 탐색 UI (폴더/파일 구조 유지)
- 문서별 고정 URL 경로 생성 (`/path/to/doc/`)
- Shiki 기반 코드 하이라이팅
- Obsidian 스타일 위키링크 `[[...]]` 지원
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
- `--port <n>`: dev 서버 포트 (기본: `3000`)

예시
```bash
# 다른 볼트 경로로 빌드
bun run build -- --vault ../vault --out ./dist

# dev 서버 포트 변경
bun run dev -- --port 4000

# 제외 패턴 추가
bun run build -- --exclude "private/**" --exclude "**/drafts/**"
```

**설정 파일**
프로젝트 루트에 `blog.config.ts|js|mjs|cjs`를 두면 CLI 옵션과 병합됩니다.

```ts
// blog.config.ts
export default {
  vaultDir: "./vault",
  outDir: "dist",
  exclude: [".obsidian/**", "private/**"],
  ui: {
    newWithinDays: 7,
    recentLimit: 5,
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

**콘텐츠 작성 규칙**
- `publish: true`인 문서만 출력됩니다.
- `draft: true`면 출력에서 제외됩니다.
- `branch`를 지정하면 해당 브랜치 필터에서만 노출됩니다.
- `branch`가 없으면 "브랜치 분류 없음"으로 간주되어 기본 브랜치에서만 노출됩니다.
- 기본 브랜치 뷰는 `dev + 분류 없음`이며, 다른 브랜치는 해당 브랜치 글만 노출됩니다.
- `title`이 없으면 파일명에서 자동 생성됩니다.
- `date`가 없으면 파일 수정 시각을 기준으로 합니다.
- `tags`는 문자열 배열로 작성합니다.

```md
---
publish: true
branch: dev
title: My Post
date: "2024-10-24"
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
- `dist/<문서 경로>/index.html`: 각 문서 경로
- `dist/assets/app.js`, `dist/assets/app.css`: 런타임 UI

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
