# 20260218 E2E 초기화 레이스 복구 Work Log

- 현재 상태: `CLOSED`
- 작업 ID: `20260218-e2e-readiness-race-fix-worklog`
- 최신 동기화 커밋(파일 최신 커밋 기준): `git log --oneline -- docs/plans/20260218-e2e-readiness-race-fix-worklog.md | head -n 1` 실행 결과

## 목표/범위
- 범위
  - 전체 E2E에서 실패하던 4건(`mobile-sidebar-focus-trap`, `prefix-backlinks-branch` 2건, `runtime-xss-guard`) 복구
  - 런타임 초기화 완료 상태를 테스트가 안정적으로 기다릴 수 있도록 준비 신호 추가
  - 회귀 방지를 위해 타깃 스펙과 전체 E2E를 모두 통과 상태로 복구
- 비범위
  - 브랜치 정책/접근성 정책 자체 재설계
  - 라우팅/렌더 로직의 기능 확장

## 완료 기준(Definition of Done)
- 실패 4건이 모두 통과한다.
- 전체 E2E(`bun run test:e2e`)가 다시 초록 상태가 된다.
- Work Log 무결성 가드가 PASS다.

## 진행 요약
- `src/runtime/app.js`에 `data-app-ready` 상태(`booting`/`ready`/`error`)를 추가해 테스트 관측 지점을 만들었다.
- `tests/e2e/utils/app-ready.ts` 공통 유틸을 도입하고 3개 실패 스펙에 준비 대기를 적용했다.
- 실행 중 드러난 Plan Drift로, 해시가 같아도 누락 파일을 복구하지 못하던 빌드 출력 가드를 `src/build.ts`에서 보강했다.
- 모바일 포커스 트랩 스펙의 토글 어서션을 라벨 변동에 안전한 선택자로 안정화했다.
- 타깃 스펙(4건)과 전체 E2E(13건)를 모두 재검증해 통과를 확인했다.

## 실제 변경 파일 목록(최종)
- `src/runtime/app.js`
- `tests/e2e/utils/app-ready.ts`
- `src/build.ts`
- `tests/e2e/mobile-sidebar-focus-trap.spec.ts`
- `tests/e2e/prefix-backlinks-branch.spec.ts`
- `tests/e2e/runtime-xss-guard.spec.ts`
- `docs/plans/20260218-e2e-readiness-race-fix-worklog.md`

## 단계별 체크리스트
- [x] 런타임 준비 신호(`data-app-ready`) 추가
- [x] 공통 대기 유틸 도입 및 실패 스펙 3개 반영
- [x] 타깃 스펙 4건 통과 확인
- [x] Plan Drift 대응: 누락 출력 자산 복구 가드(`src/build.ts`) 보강
- [x] 전체 E2E 13건 통과
- [x] Work Log 작성 및 무결성 가드 확인

## Plan Drift
- 변경 전: 준비 신호 추가 + 테스트 대기 강화만으로 실패 4건을 복구한다.
- 변경 후: `dist`가 참조하는 해시 JS가 실제 파일로 없을 때 빌드가 복구하지 못하는 문제를 함께 수정한다.
- 변경 이유: `writeOutputIfChanged`가 해시 동일 시 파일 존재 여부를 확인하지 않아, 누락된 런타임 자산이 재생성되지 않음.
- 영향: `P2` (E2E 재실패, 정적 배포 산출물 누락 위험)
- 사용자 승인 여부: `승인됨` (사용자 응답: `그래 권장안으로 ㄱㄱ`)

## 테스트 계획 및 검증
- 자동
  - 타깃: `bun run test:e2e -- tests/e2e/mobile-sidebar-focus-trap.spec.ts tests/e2e/prefix-backlinks-branch.spec.ts tests/e2e/runtime-xss-guard.spec.ts`
  - 전체: `bun run test:e2e`
  - 빌드: `bun run build -- --vault ./test-vault --out ./dist`
- 수동
  - 이번 Work에서는 자동화 검증으로 대체

## 실행한 검증 커맨드와 결과
- `bun run build -- --vault ./test-vault --out ./dist`
  - 결과: 성공 (`[build] total=5 rendered=0 skipped=5`)
  - 확인: `dist/BC-VO-01/index.html`가 참조하는 해시 JS 파일이 실제로 존재함
- `bun run test:e2e -- tests/e2e/mobile-sidebar-focus-trap.spec.ts tests/e2e/prefix-backlinks-branch.spec.ts tests/e2e/runtime-xss-guard.spec.ts`
  - 결과: `4 passed`
- `bun run test:e2e`
  - 결과: `13 passed`
- `bash /Users/lim/.codex/scripts/guard/check_worklog_integrity.sh docs/plans/20260218-e2e-readiness-race-fix-worklog.md`
  - 결과: `PASS` (`요약: PASS=1, FAIL=0, FAIL_ISSUES=0`)

## 커밋/PR 식별자
- `9cc8740` `fix(runtime): 앱 초기화 준비 상태 신호를 노출해 e2e 레이스 완화`
- `dc3dde2` `fix(build): 해시 동일해도 누락된 출력 파일은 다시 생성`
- `86c805f` `test(e2e): appReady 대기를 추가해 초기화 레이스를 제거`

이번 Work에서 완료된 체크리스트 항목: 준비 신호 추가, 실패 스펙 3개 대기 보강, 빌드 누락 자산 복구 가드 추가, 타깃/전체 E2E 통과
지금 상태에서 통과한 검증(테스트/린트/타입체크 등): `bun run build -- --vault ./test-vault --out ./dist`, `bun run test:e2e -- tests/e2e/mobile-sidebar-focus-trap.spec.ts tests/e2e/prefix-backlinks-branch.spec.ts tests/e2e/runtime-xss-guard.spec.ts`, `bun run test:e2e`
Review에서 집중적으로 봐야 할 위험 지점(있으면): `data-app-ready` 상태 신호가 비정상 종료 경로에서도 누락 없이 설정되는지, 빌드 캐시 버전 변경 시 누락 자산 복구 조건이 유지되는지
