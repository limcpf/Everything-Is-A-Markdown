# MIEA-0000 Mermaid 디자인 고도화 Work Log

- 현재 상태: `CLOSED`
- 작업 ID: `MIEA-0000`
- 최신 동기화 커밋(파일 최신 커밋 기준): `git log --oneline -- docs/plans/MIEA-0000-worklog.md | head -n 1` 실행 결과

## 목표/범위
- 범위
  - Mermaid fence를 일반 코드 블록 UI와 분리된 전용 컨테이너로 렌더링
  - Mermaid SVG를 본문 중앙 정렬하고 컨테이너 폭 안에서 반응형으로 축소
  - Mermaid 비활성화/렌더 실패 시 전용 컨테이너 하단에 일관된 오류 문구 노출
  - 일반 코드 블록(헤더/파일명/복사 버튼) 동작 회귀 방지
- 비범위
  - Mermaid 구문 자동 교정/포맷터 도입
  - Mermaid 외 코드 블록 스타일 정책 변경

## 완료 기준(Definition of Done)
- Mermaid 다이어그램이 코드 블록 헤더 없이 전용 컨테이너에 렌더링된다.
- 렌더된 SVG가 데스크톱/모바일 모두에서 컨테이너 폭을 넘지 않는다.
- 일반 코드 블록 UI/복사 버튼은 기존대로 유지된다.
- Mermaid 비활성화/렌더 실패 시 전용 컨테이너 하단 메시지가 유지된다.
- README(ko/en)에 Mermaid 렌더 정책(코드 스타일 분리 + 중앙 정렬)이 반영된다.

## 진행 요약
- `src/markdown.ts`에서 Mermaid fence 출력 구조를 `.code-block`에서 완전히 분리해 `figure.mermaid-block`으로 변경했다.
- `src/runtime/app.css`에 Mermaid 전용 레이아웃을 추가해 코드 블록 공통 스타일 누수를 차단하고 중앙 정렬/반응형 정책을 분리했다.
- `src/runtime/app.js`에 SVG 폭 보정 로직을 추가해 렌더 후 width/height를 기준으로 컨테이너 내 반응형 축소를 강제하고, `%` 단위 width 오인식도 방지했다.
- E2E를 확장해 Mermaid 전용 컨테이너, 코드 블록 회귀, 모바일 무잘림, 실패/비활성화 메시지 정책을 자동 검증했다.
- README 영어/한국어 문서에 Mermaid 전용 컨테이너 정책과 중앙 정렬/오류 노출 동작을 반영했다.

## 실제 변경 파일 목록(최종)
- `src/markdown.ts`
- `src/runtime/app.css`
- `src/runtime/app.js`
- `tests/e2e/mermaid-runtime.spec.ts`
- `README.md`
- `README.ko.md`
- `docs/plans/MIEA-0000-worklog.md`

## 단계별 체크리스트
- [x] Mermaid fence 출력 마크업을 코드 블록과 분리
- [x] Mermaid 전용 CSS 레이어 정의(중앙 정렬/반응형/실패 메시지)
- [x] 런타임 렌더 후 `svg` 정렬/폭 제약 확인 및 보정
- [x] E2E 회귀 테스트 추가 또는 기존 테스트 확장
- [x] 문서(README) 정책 업데이트

## 테스트 계획 및 검증
- 자동
  - `tests/e2e/mermaid-runtime.spec.ts`
    - Mermaid 블록의 코드 헤더/복사 버튼 미노출
    - Mermaid 렌더 시 중앙 정렬 스타일 적용
    - 모바일 뷰포트에서 컨테이너 무잘림
    - 비활성화/실패 메시지 정책 유지
    - 일반 코드 블록 헤더/복사 버튼 회귀 없음
- 수동
  - 이번 Work에서는 별도 수동 검증을 생략하고, 모바일/데스크톱 검증을 Playwright 시나리오로 자동화했다.

## 실행한 검증 커맨드와 결과
- `bun run test:e2e -- tests/e2e/mermaid-runtime.spec.ts`
  - 결과: `6 passed`
- `bun run test:e2e`
  - 결과: `13 passed`
- `bun run build -- --vault ./test-vault --out /tmp/mfs-mermaid-centered-dist-$(date +%s)`
  - 결과: `[build] total=5 rendered=5 skipped=0`
  - 참고: 기존 데이터 경고(`missing-prefix-warning.md`, unresolved wikilink)는 기존 동작

## Plan Drift
- 없음

## 커밋/PR 식별자
- 기준 커밋: `미정 (현재 작업 트리 미커밋)`

이번 Work에서 완료된 체크리스트 항목: Mermaid 전용 마크업 분리, 전용 CSS/런타임 보정 적용, E2E 회귀 강화, README 정책 반영
지금 상태에서 통과한 검증(테스트/린트/타입체크 등): `bun run test:e2e -- tests/e2e/mermaid-runtime.spec.ts`, `bun run test:e2e`, `bun run build -- --vault ./test-vault --out /tmp/mfs-mermaid-centered-dist-$(date +%s)`
Review에서 집중적으로 봐야 할 위험 지점(있으면): Mermaid 엔진이 `width` 없는 SVG를 생성하는 테마/버전에서 중앙 정렬/폭 보정이 기대대로 유지되는지
