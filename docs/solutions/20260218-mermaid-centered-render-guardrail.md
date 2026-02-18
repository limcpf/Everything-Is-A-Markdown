---
title: "Mermaid 다이어그램이 코드 블록 UI를 공유해 중앙 정렬이 깨지는 문제"
tags: ["compound", "runtime", "mermaid", "css"]
severity: "P2"
related: ["src/markdown.ts", "src/runtime/app.css", "src/runtime/app.js", "tests/e2e/mermaid-runtime.spec.ts", "docs/plans/MIEA-0000-worklog.md"]
---

## 문제
- 증상:
  - Mermaid fence가 `.code-block` 헤더/복사 버튼 UI를 그대로 사용해 다이어그램 문맥이 흐려짐
  - 렌더된 SVG가 좌측 치우침 또는 폭 확장으로 모바일에서 가독성이 떨어짐
- 재현 조건:
  - ` ```mermaid ` fence를 포함한 문서를 렌더할 때
  - 폭이 큰 SVG를 출력하는 Mermaid 다이어그램일 때
- 근본 원인(추정/확정):
  - Mermaid 출력이 코드 블록 공통 마크업/스타일에 결합되어 있었고, SVG 반응형 폭 보정이 런타임에서 강제되지 않음

## 해결
- 적용한 접근:
  - Mermaid fence를 전용 컨테이너(`figure.mermaid-block > pre.mermaid`)로 분리
  - Mermaid 전용 CSS를 추가해 코드 블록 스타일 누수를 차단하고 렌더 성공 시 중앙 정렬 스타일 적용
  - 런타임에서 SVG의 intrinsic width를 파싱해 `width:100% + max-width`를 동적으로 부여
- 변경 범위(파일/모듈):
  - `src/markdown.ts`, `src/runtime/app.css`, `src/runtime/app.js`, `tests/e2e/mermaid-runtime.spec.ts`, `README.md`, `README.ko.md`
- 트레이드오프:
  - Mermaid SVG의 폭 보정을 inline style로 적용하므로, 사용자 커스텀 CSS가 같은 속성을 덮어쓰면 우선순위 재조정이 필요할 수 있음

## 검증
- 확인한 테스트:
  - `bun run test:e2e -- tests/e2e/mermaid-runtime.spec.ts` (`6 passed`)
  - `bun run build -- --vault ./test-vault --out /tmp/mfs-mermaid-centered-dist-$(date +%s)` (`total=5 rendered=5 skipped=0`)
- 추가 회귀 포인트:
  - Mermaid 버전/테마 조합에 따라 `width` 속성이 없는 SVG가 나올 때도 중앙 정렬 유지 여부

## 재발 방지(시스템 업데이트)
- AGENTS.MD에 추가할 규칙/패턴:
  - 없음(기존 CE 루프/WorkLog 규칙으로 관리 가능)
- 자동으로 잡히게 할 장치(테스트/린트/체크리스트):
  - `tests/e2e/mermaid-runtime.spec.ts`에 아래 가드를 상시 유지
    - Mermaid 블록에 코드 헤더/복사 버튼 미노출
    - 일반 코드 블록 헤더/복사 버튼 회귀 없음
    - 모바일에서 Mermaid 컨테이너/ SVG 무잘림

## 자동으로 잡히는가?
- 답변:
  - 예. 동일 문제가 재발하면 Mermaid 전용 컨테이너/스타일/E2E 회귀 테스트에서 즉시 감지된다.
