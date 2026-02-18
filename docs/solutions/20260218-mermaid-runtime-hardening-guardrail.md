---
title: "Mermaid 런타임 설정 검증/재시도 가드레일"
tags: ["compound", "mermaid", "runtime", "config", "e2e"]
severity: "P2"
related: [
  "src/config.ts",
  "src/runtime/app.js",
  "tests/e2e/mermaid-runtime.spec.ts",
  "docs/checklists/e2e-review-checklist.md",
  "docs/plans/20260218-mermaid-worklog.md"
]
---

## 문제
- 증상:
  - `markdown.mermaid.cdnUrl/theme`에 비정상 값이 들어오면 런타임 오류 메시지로만 실패가 드러난다.
  - Mermaid 스크립트 로드 실패 후 스크립트 노드가 잔존하면 재시도 흐름이 불안정해질 수 있다.
- 재현 조건:
  - `cdnUrl`에 `javascript:` 같은 비허용 스킴 입력
  - CDN 차단/404 상황에서 Mermaid 로드 실패 발생
- 근본 원인(확정):
  - 빌드 단계에서 Mermaid 설정 유효성 검증이 없었고, 런타임 로더의 실패 후 정리 루틴이 제한적이었다.

## 해결
- 적용한 접근:
  - 빌드 단계에서 Mermaid 설정을 엄격히 정규화하고 기본값 폴백을 강제했다.
  - 런타임에서 stale Mermaid 스크립트 제거 및 실패 후 상태 초기화를 추가해 재시도 가능성을 보장했다.
  - E2E에 성공/비활성/실패/폴백 시나리오를 추가해 회귀를 자동 감지하게 했다.
- 변경 범위(파일/모듈):
  - `src/config.ts`
  - `src/runtime/app.js`
  - `tests/e2e/mermaid-runtime.spec.ts`
  - `docs/checklists/e2e-review-checklist.md`
  - `README.md`
  - `README.ko.md`
- 트레이드오프:
  - `cdnUrl`/`theme` 허용 범위를 좁혀 일부 특수 사용자 설정은 기본값으로 폴백될 수 있다.
  - 대신 비정상 설정으로 인한 런타임 오류 확률과 디버깅 비용을 크게 낮춘다.

## 검증
- 확인한 테스트:
  - 신규 E2E 스펙(`tests/e2e/mermaid-runtime.spec.ts`)으로 다음을 검증하도록 추가:
    - Mermaid 활성화 렌더 성공
    - Mermaid 비활성화 시 원본 코드 블록 유지
    - CDN 로드 실패 시 오류 메시지 표시
    - 잘못된 설정값의 `manifest.mermaid` 기본값 폴백
- 추가 회귀 포인트:
  - 사설 CDN 또는 상대경로 기반 배포에서 `cdnUrl` 정책과 실제 운영 URL 정책의 정합성

## 재발 방지(시스템 업데이트)
- AGENTS.MD에 추가할 규칙/패턴:
  - 외부 리소스 URL을 받는 설정 필드는 빌드 단계에서 유효성 검증/폴백 정책을 반드시 명시한다.
- 자동으로 잡히게 할 장치(테스트/린트/체크리스트):
  - `tests/e2e/mermaid-runtime.spec.ts`를 정규 E2E 게이트로 유지
  - `docs/checklists/e2e-review-checklist.md`에 Mermaid Runtime 항목 추가
