---
title: "E2E 기본 브랜치 동적 검증 가드레일"
tags: ["compound", "e2e", "branch", "regression", "playwright"]
severity: "P3"
related: [
  "tests/e2e/prefix-backlinks-branch.spec.ts",
  "tests/e2e/utils/manifest.ts",
  "docs/checklists/e2e-review-checklist.md",
  "docs/plans/20260217-prefix-route-backlinks-worklog.md"
]
---

## 문제
- 증상:
  - E2E에서 기본 브랜치 값을 문자열 상수로 고정하면 브랜치 정책 변경 시 기능 정상이어도 테스트가 실패할 수 있다.
- 재현 조건:
  - 기본 브랜치가 기존 가정값(`dev`)이 아닌 값으로 운영되거나 fixture가 확장될 때.
- 근본 원인:
  - 테스트가 런타임 manifest 대신 상수/고정 문구에 의존했다.

## 해결
- 적용한 접근:
  - 테스트 실행 시 `#initial-manifest-data`를 파싱해 `defaultBranch`와 문서 목록을 동적으로 읽는다.
  - 활성 브랜치/next route 검증을 동적 계산값 기반으로 수행한다.
- 변경 범위:
  - `tests/e2e/utils/manifest.ts`
  - `tests/e2e/prefix-backlinks-branch.spec.ts`
- 트레이드오프:
  - 테스트 내부 헬퍼가 늘어 코드량은 증가하지만, 브랜치 정책 변화에 대한 내구성이 향상된다.

## 검증
- 실행 커맨드:
  - `bun run test:e2e`
  - `bun run build -- --vault ./test-vault --out ./dist`
- 기대 결과:
  - 기본 브랜치 하드코딩 없이도 prefix/backlinks/자동 브랜치 전환 시나리오가 통과한다.
- 실패 시 확인 포인트:
  - `initial-manifest-data` 존재 여부
  - manifest의 `defaultBranch`/`docs[].route` 필드 유효성

## 재발 방지(시스템 업데이트)
- 규칙:
  - E2E에서 기본 브랜치/환경 상수 문자열 하드코딩 금지.
  - `manifest.defaultBranch` 동적 읽기 우선.
- 자동으로 잡히게 할 장치:
  - CI에서 `bun run test:e2e`를 기본 게이트로 유지.
- 다음에 더 쉽게 찾게 만드는 장치:
  - `tests/e2e/utils/manifest.ts` 공용 헬퍼로 파싱 실패 메시지와 분기 로직을 단일화.
