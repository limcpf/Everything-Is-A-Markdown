# Everything-Is-A-Markdown (EIAM)

언어: [English](README.md) | **한국어**

Everything-Is-A-Markdown은 로컬 Markdown 볼트를 정적 웹사이트로 빌드해, 폴더/파일 탐색 구조를 유지한 채 공개할 수 있게 해주는 CLI 도구입니다.

## 이 앱은 무엇을 하나요

- Markdown 볼트에서 정적 문서/블로그 사이트를 생성
- `publish: true` 문서만 선택적으로 공개
- 비공개 노트와 공개 콘텐츠 분리

## Obsidian 사용자에게 특히 잘 맞습니다

- Obsidian에서 평소처럼 작성한 뒤, 공개할 문서만 빌드할 수 있습니다.
- Obsidian 스타일 위키링크(`[[...]]`)를 지원합니다.

## 설치

```bash
bun install
```

## 사용 방법

```bash
bun run blog [build|dev|clean] [options]
```

명령:

- `bun run build`: 정적 파일 빌드
- `bun run dev`: 로컬 개발 서버 실행 (기본 `http://localhost:3000`)
- `bun run clean`: `dist`와 `.cache` 삭제

자주 쓰는 옵션:

- `--vault <path>`: Markdown 루트 디렉터리 (기본 `.`)
- `--out <path>`: 출력 디렉터리 (기본 `dist`)
- `--exclude <glob>`: 제외 패턴 추가 (반복 가능)
- `--port <n>`: 개발 서버 포트 (기본 `3000`)

## 설정 파일 (`blog.config.ts`)

SEO/UI/정적 파일 설정은 config 파일에서 관리할 수 있습니다.

```ts
const config = {
  vaultDir: "./vault",
  outDir: "./dist",
  staticPaths: ["assets", "public/favicon.ico"],
  seo: {
    siteUrl: "https://example.com",
    defaultOgImage: "/assets/og.png",
  },
};

export default config;
```

`staticPaths`:

- 볼트 기준 상대 경로 배열
- 폴더와 파일 모두 지정 가능
- 지정한 경로의 파일들을 `dist`에 같은 상대 경로로 복사
- 예: 볼트 `assets/og.png` -> `dist/assets/og.png`

예시:

```bash
# 샘플 볼트로 실행
bun run dev -- --vault ./test-vault --out ./dist

# 빌드
bun run build -- --vault ./test-vault --out ./dist
```

## Markdown Frontmatter

공개 여부를 결정하는 핵심 필드는 `publish`입니다.

필수:

- `publish: true`  
  이 값이 `true`인 문서만 빌드 결과에 포함됩니다.

선택:

- `draft: true`  
  `publish: true`여도 문서를 제외합니다.
- `title: "..."`  
  문서 제목. 없으면 파일명을 사용합니다.
- `prefix: "A-01"`  
  탐색기 제목 앞과 본문 메타 줄에 표시할 짧은 코드.
- `branch: dev`  
  브랜치 필터 분류값.
- `description: "..."`  
  요약 설명.
- `tags: ["tag1", "tag2"]`  
  문자열 배열.
- `date: "YYYY-MM-DD"` 또는 `createdDate: "..."`  
  생성일.
- `updatedDate: "..."` 또는 `modifiedDate: "..."` 또는 `lastModified: "..."`  
  수정일.

## Frontmatter 예시

게시 문서:

```md
---
publish: true
prefix: "DEV-01"
branch: dev
title: Setup Guide
date: "2024-09-15"
updatedDate: "2024-09-20T09:30:00"
description: How to set up your development environment
tags: ["tutorial", "setup"]
---

# Setup Guide
```

비공개 문서 (제외됨):

```md
---
publish: false
title: Internal Notes
---
```

초안 문서:

```md
---
publish: true
draft: true
title: Work In Progress
---
```

## bunx 실행 (선택)

```bash
bunx @limcpf/everything-is-a-markdown build --vault ./vault --out ./dist
bunx @limcpf/everything-is-a-markdown dev --port 3000
```

## 라이선스

MIT. `LICENSE` 파일을 참고하세요.
