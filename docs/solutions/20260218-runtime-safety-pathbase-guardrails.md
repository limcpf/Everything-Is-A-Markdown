---
title: "런타임 XSS + pathBase + 증분 복구 가드레일 구축"
tags: ["compound", "runtime", "security", "pathBase", "incremental-build"]
severity: "P1"
related:
  - "src/runtime/app.js"
  - "src/build.ts"
  - "src/config.ts"
  - "tests/e2e/runtime-xss-guard.spec.ts"
  - "tests/e2e/build-regression.spec.ts"
  - "tests/e2e/path-base-routing.spec.ts"
---

## 문제
- 증상:
  - 런타임 nav/tree 렌더에서 사용자 문자열이 HTML로 해석될 수 있는 구간이 있었다.
  - 증분 빌드에서 출력 `content` 파일이 수동 삭제되면 unchanged 분기에서 복구되지 않았다.
  - `seo.pathBase`가 canonical URL에만 부분 적용되어 서브패스 배포에서 런타임 라우팅 실패 가능성이 있었다.
  - CLI 숫자 옵션이 잘못된 값을 조용히 허용했다.
- 재현 조건:
  - 악성 `title` frontmatter 문서 포함 후 런타임 탐색.
  - build 후 `dist/content/*.html` 삭제 뒤 재빌드.
  - `seo.pathBase="/blog"` 구성 후 서브패스 경로 접근.
  - `--recent-limit -1`, `--new-within-days not-a-number`.
- 근본 원인(확정):
  - 문자열 템플릿 기반 `innerHTML` 조립 경로의 이스케이프 누락.
  - unchanged 경로에서 “파일 유실” 예외를 렌더 분기로 재진입시키지 않음.
  - URL base 처리 책임이 빌드/런타임에 분산되어 일관 규약 부재.
  - CLI 파싱 후 정수/범위 검증 부재.

## 해결
- 적용한 접근:
  - 런타임 렌더 문자열 이스케이프 보강 + 오류 메시지 렌더를 안전 DOM API로 변경.
  - unchanged 문서라도 출력 파일이 없으면 재렌더/재기록하도록 fallback 복구.
  - manifest에 `pathBase`를 포함하고 런타임 링크/fetch/history를 base-aware 함수로 통합.
  - CLI 숫자 옵션을 정수/하한 검증으로 고정.
- 변경 범위(파일/모듈):
  - `src/runtime/app.js`, `src/build.ts`, `src/config.ts`, `src/types.ts`
  - `tests/e2e/runtime-xss-guard.spec.ts`
  - `tests/e2e/build-regression.spec.ts`
  - `tests/e2e/path-base-routing.spec.ts`
  - `test-vault/posts/2024/xss-nav-title.md`
- 트레이드오프:
  - 테스트 케이스 증가로 E2E 실행 시간이 소폭 증가.
  - `Manifest`에 `pathBase` 필드가 추가되어 소비 측 스키마 의존 코드 점검이 필요할 수 있음.

## 검증
- 확인한 테스트:
  - `bun run test:e2e` → `7 passed`
  - `bun run build -- --vault ./test-vault --out ./dist` → 성공
- 추가 회귀 포인트:
  - 외부 프록시/CDN에서 path rewrite 규칙과 `pathBase` 조합 검증.
  - 초기 SSR 링크(비JS 탐색)와 JS hydration 후 링크 동작 일치성.

## 재발 방지(시스템 업데이트)
- AGENTS.MD에 추가할 규칙/패턴:
  - 런타임 UI 문자열 렌더에서 사용자 입력은 `textContent` 또는 이스케이프를 강제한다.
  - 서브패스 지원 기능은 canonical, href, fetch, history를 단일 base-aware 함수로 통일한다.
- 자동으로 잡히게 할 장치(테스트/린트/체크리스트):
  - XSS 회귀: `tests/e2e/runtime-xss-guard.spec.ts`
  - 증분 복구/CLI 검증 회귀: `tests/e2e/build-regression.spec.ts`
  - pathBase 라우팅 회귀: `tests/e2e/path-base-routing.spec.ts`
