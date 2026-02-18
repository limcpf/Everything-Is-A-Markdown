# 20260218 Note Mermaid Isolation Work Log

- 현재 상태: `CLOSED`
- 작업 ID: `20260218-note-mermaid-isolation-worklog`
- 최신 동기화 커밋(파일 최신 커밋 기준): `git log --oneline -- docs/plans/20260218-note-mermaid-isolation-worklog.md | head -n 1` 실행 결과

## 목표/범위
- 범위
  - `~/codes/Note` 기준 정적 사이트 빌드로 머메이드 관련 깨짐 재현 여부 확인
  - 머메이드 블록 1개 오류가 전체 렌더를 막지 않도록 런타임 렌더 격리
  - 회귀 테스트 추가로 재발 방지
- 비범위
  - 문서 원본(`~/codes/Note`) 내용 수정
  - Mermaid 서버사이드 렌더 도입

## 완료 기준(Definition of Done)
- `~/codes/Note` 기준 빌드가 성공한다.
- Mermaid 블록 중 일부가 실패해도 나머지 블록은 렌더된다.
- 실패 블록에는 오류 메시지가 표시되고 코드 블록은 유지된다.
- E2E 회귀 테스트가 통과한다.

## 변경 대상
- `src/runtime/app.js`
- `tests/e2e/mermaid-runtime.spec.ts`
- `docs/plans/20260218-note-mermaid-isolation-worklog.md`

## 단계별 체크리스트
- [x] `~/codes/Note` 기반 빌드 재현 및 머메이드 포함 문서 확인
- [x] 머메이드 렌더 실패 전파 지점 분석
- [x] 블록 단위 렌더 격리 구현
- [x] 부분 실패 회귀 테스트 추가
- [x] `~/codes/Note` 재빌드 + E2E 검증

## 테스트 계획 및 검증
- 재현/검증: `bun run build -- --vault ~/codes/Note --out /tmp/mfs-note-dist`
- 자동 검증: `bun run test:e2e -- tests/e2e/mermaid-runtime.spec.ts`

## 실행한 검증 커맨드와 결과
- `bun run test:e2e -- tests/e2e/mermaid-runtime.spec.ts`
  - 결과: `5 passed`
- `rm -rf /tmp/mfs-note-dist && bun run build -- --vault ~/codes/Note --out /tmp/mfs-note-dist`
  - 결과: `[build] total=36 rendered=36 skipped=0`
  - 참고: `prefix` 없는 `SnaqSh0t.md` 스킵, 일부 위키링크 경고 2건은 기존 데이터 상태

## 리스크/회귀 포인트
- Mermaid API(`run`/`init`) 변경 시 블록 단위 호출 방식과 호환성 확인 필요
- 실패 메시지가 블록 단위로 노출되므로 다수 오류 시 메시지 수가 증가할 수 있음

## 변경 요약(Work Log)
- `src/runtime/app.js`
  - `renderMermaidBlocks`를 전체 일괄 렌더에서 블록 단위 렌더로 변경
  - 개별 블록 실패 시 해당 블록에만 오류 메시지 표시하고 다음 블록 렌더 계속 진행
- `tests/e2e/mermaid-runtime.spec.ts`
  - 부분 실패(mock 파서 에러) 시 정상 블록 렌더 유지 여부를 검증하는 테스트 추가

## Plan Drift
- 없음

## 커밋/PR 식별자
- 기준 커밋: `미정 (현재 작업 트리 미커밋)`

이번 Work에서 완료된 체크리스트 항목: `~/codes/Note` 빌드 재현, 블록 단위 Mermaid 렌더 격리 구현, 부분 실패 회귀 테스트 추가, E2E/실데이터 빌드 검증 완료
지금 상태에서 통과한 검증(테스트/린트/타입체크 등): `bun run test:e2e -- tests/e2e/mermaid-runtime.spec.ts`, `bun run build -- --vault ~/codes/Note --out /tmp/mfs-note-dist`
Review에서 집중적으로 봐야 할 위험 지점(있으면): Mermaid 런타임 API 변화(`run`/`init`) 시 블록 단위 호출 호환성
