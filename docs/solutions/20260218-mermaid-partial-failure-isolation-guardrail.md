---
title: "Mermaid 부분 파싱 실패가 전체 렌더를 중단시키는 문제"
tags: ["compound", "mermaid", "runtime", "e2e", "guardrail"]
severity: "P2"
related: [
  "src/runtime/app.js",
  "tests/e2e/mermaid-runtime.spec.ts",
  "docs/checklists/e2e-review-checklist.md",
  "docs/plans/20260218-note-mermaid-isolation-worklog.md"
]
---

## 문제
- 증상:
  - Mermaid 코드 블록 중 하나가 파싱 오류를 내면 다른 Mermaid 블록도 함께 렌더되지 않을 수 있다.
- 재현 조건:
  - 한 문서 안에 Mermaid 블록이 2개 이상 있고, 그중 일부가 문법 오류를 포함할 때.
- 근본 원인(추정/확정):
  - Mermaid 렌더를 `nodes: blocks` 형태로 일괄 실행하면서 예외가 전체 흐름으로 전파됨(확정).

## 해결
- 적용한 접근:
  - Mermaid 렌더를 블록 단위로 분리해 실패 블록만 오류 메시지를 노출하고 다음 블록 렌더를 계속 진행.
- 변경 범위(파일/모듈):
  - `src/runtime/app.js`
  - `tests/e2e/mermaid-runtime.spec.ts`
  - `docs/checklists/e2e-review-checklist.md`
- 트레이드오프:
  - 블록 수가 많은 문서에서는 렌더 호출 횟수가 증가하지만, 장애 격리 이점이 더 큼.

## 검증
- 확인한 테스트:
  - `bun run test:e2e -- tests/e2e/mermaid-runtime.spec.ts` (`5 passed`)
  - `bun run build -- --vault ~/codes/Note --out /tmp/mfs-note-dist` (`total=36 rendered=36 skipped=0`)
- 추가 회귀 포인트:
  - Mermaid 런타임 API(`run`/`init`) 변경 시 블록 단위 호출 호환성 재검증 필요.

## 재발 방지(시스템 업데이트)
- AGENTS.MD에 추가할 규칙/패턴:
  - 없음(기존 규칙 범위 내에서 체크리스트/테스트로 커버).
- 자동으로 잡히게 할 장치(테스트/린트/체크리스트):
  - E2E: `한 블록의 Mermaid 오류가 다른 블록 렌더링을 막지 않는다` 테스트 추가
  - 체크리스트: Mermaid Runtime 항목에 부분 실패 격리 확인 항목 추가
