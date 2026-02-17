---
title: "모바일 사이드바 모달 접근성 상태 전이 고정"
tags: ["compound", "accessibility", "mobile", "sidebar", "modal"]
severity: "P2"
related: [
  "src/runtime/app.js",
  "src/template.ts",
  "src/runtime/app.css",
  ".github/workflows/ci.yml",
  "playwright.config.ts",
  "tests/e2e/mobile-sidebar-focus-trap.spec.ts",
  "docs/plans/20260217-prefix-route-backlinks-worklog.md",
  "artifacts/uiux-p2-mobile-modal-open.png",
  "artifacts/uiux-p2-mobile-modal-closed.png"
]
---

## 문제
- 증상:
  - 모바일에서 사이드바가 닫혀도 DOM 노드가 유지되어, 배경 영역과 포커스 상태가 접근성 관점에서 모호했다.
- 재현 조건:
  - 모바일 뷰포트에서 사이드바 열기/닫기, ESC 닫기, 레이아웃 전환(모바일↔데스크톱) 시.
- 근본 원인(추정/확정):
  - 열림/닫힘 상태에서 `aria-modal`, `aria-hidden`, `inert`의 적용 대상과 시점이 명확히 고정되지 않았다.

## 해결
- 적용한 접근:
  - 모바일 열림 시 사이드바를 `dialog + aria-modal=true`로 승격하고, `viewer`를 `inert + aria-hidden=true`로 비활성화.
  - 닫힘 시 사이드바를 `complementary` + `aria-hidden=true` + `inert`로 전환하고 `viewer`는 즉시 복구.
  - CSS로 모바일 닫힘 사이드바에 `visibility: hidden`, `pointer-events: none`을 적용해 비의도 상호작용 차단.
  - E2E 설정에서 `PLAYWRIGHT_PORT`를 엄격 파싱(숫자 문자열 + `1024~65535`)하고, 미충족 시 기본 포트(`4173`) fallback을 적용.
  - CI 실패 시 Playwright artifact(trace/report) 업로드를 추가해 원인 분석 경로를 확보.
- 변경 범위(파일/모듈):
  - `src/runtime/app.js`
  - `src/template.ts`
  - `src/runtime/app.css`
- 트레이드오프:
  - `inert` 지원이 약한 구형 브라우저에서는 보조 대책이 필요할 수 있다.

## 검증
- 확인한 테스트:
  - Playwright에서 모바일/데스크톱 전환 포함 상태 전이 속성 확인
  - 열림: `sidebar role=dialog`, `aria-modal=true`, `viewer inert=true`
  - 닫힘: `sidebar aria-hidden=true`, `inert=true`, `viewer inert=false`
  - ESC 닫힘 후 토글 버튼 포커스 복귀
  - 자동 회귀: `bun run test:e2e:focus-trap` (`tests/e2e/mobile-sidebar-focus-trap.spec.ts`, `viewer inert` 해제 검증 포함)
  - 콘솔 에러 0건
- 추가 회귀 포인트:
  - 브라우저 지원 범위 확장 시 `inert` 폴리필 필요성 재검토

## 재발 방지(시스템 업데이트)
- AGENTS.MD에 추가할 규칙/패턴:
  - 모바일 오버레이 UI는 열림/닫힘 상태마다 `aria-modal/aria-hidden/inert` 3종을 함께 점검한다.
- 자동으로 잡히게 할 장치(테스트/린트/체크리스트):
  - Playwright 자동 테스트(`tests/e2e/mobile-sidebar-focus-trap.spec.ts`)를 기본 회귀로 사용
  - GitHub Actions CI(`.github/workflows/ci.yml`)에서 PR/`main` push마다 `build + e2e`를 자동 실행
  - CI 실패 시 `playwright-artifacts` 업로드(`test-results/**`, `playwright-report/**`)
  - 수동 체크리스트는 아래 항목을 보조 점검으로 유지:
    - 모바일 열림 시 `viewer`가 `inert`
    - 모바일 닫힘 시 `viewer` 복구
    - ESC 닫힘 후 포커스 복귀
