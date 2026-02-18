# 20260218 E2E 준비 신호/런타임 자산 회귀 후속 Work Log

- 현재 상태: `CLOSED`
- 작업 ID: `20260218-e2e-readiness-followup-worklog`
- supersedes: `docs/plans/20260218-e2e-readiness-race-fix-worklog.md`
- 최신 동기화 커밋(파일 최신 커밋 기준): `git log --oneline -- docs/plans/20260218-e2e-readiness-followup-worklog.md | head -n 1` 실행 결과

## 목표/범위
- 범위
  - `waitForAppReady`가 `data-app-ready="error"`를 즉시 실패로 처리하도록 보강
  - 누락된 해시 런타임 자산(`assets/app.<hash>.js|css`) 복구 회귀 테스트 추가
  - 전체 E2E 게이트 재검증
- 비범위
  - 런타임 기능 로직(네비게이션/브랜치/렌더) 변경
  - 빌드 캐시 버전 스키마 변경

## 진행 요약
- `tests/e2e/utils/app-ready.ts`를 폴링 기반으로 변경해 `ready`/`error` 상태를 구분 처리했다.
- `error` 상태가 감지되면 타임아웃 대기 없이 즉시 예외를 던져 실패 원인 파악 시간을 줄였다.
- `tests/e2e/build-regression.spec.ts`에 런타임 해시 자산(js/css) 삭제 후 재빌드 복구를 검증하는 케이스를 추가했다.
- 타깃 스펙 및 전체 E2E를 다시 실행해 회귀 없이 전부 통과를 확인했다.
- 기존 CLOSED WorkLog는 수정하지 않고 후속 WorkLog로 정정/보강을 남겼다.

## 실제 변경 파일 목록(최종)
- `tests/e2e/utils/app-ready.ts`
- `tests/e2e/build-regression.spec.ts`
- `docs/plans/20260218-e2e-readiness-followup-worklog.md`

## 단계별 체크리스트
- [x] `waitForAppReady`의 `error` 조기 실패 처리 추가
- [x] 런타임 해시 자산 누락 복구 회귀 테스트 추가
- [x] 타깃/전체 E2E 재검증
- [x] 후속 WorkLog 작성 및 무결성 가드 검증

## 테스트 계획 및 검증
- 자동
  - `bun run test:e2e -- tests/e2e/mobile-sidebar-focus-trap.spec.ts tests/e2e/prefix-backlinks-branch.spec.ts tests/e2e/runtime-xss-guard.spec.ts`
  - `bun run test:e2e -- tests/e2e/build-regression.spec.ts`
  - `bun run test:e2e`
- 수동
  - 이번 Work에서는 자동화 검증으로 대체

## 실행한 검증 커맨드와 결과
- `bun run test:e2e -- tests/e2e/mobile-sidebar-focus-trap.spec.ts tests/e2e/prefix-backlinks-branch.spec.ts tests/e2e/runtime-xss-guard.spec.ts`
  - 결과: `4 passed`
- `bun run test:e2e -- tests/e2e/build-regression.spec.ts`
  - 결과: `3 passed`
- `bun run test:e2e`
  - 결과: `14 passed`
- `bash /Users/lim/.codex/scripts/guard/check_worklog_integrity.sh docs/plans/20260218-e2e-readiness-followup-worklog.md`
  - 결과: `PASS` (`요약: PASS=1, FAIL=0, FAIL_ISSUES=0`)

## Plan Drift
- 없음

## 커밋/PR 식별자
- `fda8ce6` `test(e2e): appReady error 상태를 즉시 실패로 처리해 진단 지연 방지`
- `d177ebd` `test(build): 누락된 해시 런타임 자산(js/css) 복구 회귀 테스트 추가`

이번 Work에서 완료된 체크리스트 항목: appReady error 조기 실패 처리, 런타임 자산 복구 회귀 테스트 추가, 전체 E2E 통과, 후속 WorkLog 기록
지금 상태에서 통과한 검증(테스트/린트/타입체크 등): `bun run test:e2e -- tests/e2e/mobile-sidebar-focus-trap.spec.ts tests/e2e/prefix-backlinks-branch.spec.ts tests/e2e/runtime-xss-guard.spec.ts`, `bun run test:e2e -- tests/e2e/build-regression.spec.ts`, `bun run test:e2e`
Review에서 집중적으로 봐야 할 위험 지점(있으면): `data-app-ready` 상태 신호가 앱 초기화 실패를 충분히 대표하는지, 해시 자산 경로 패턴 변경 시 회귀 테스트 파서 정합성
