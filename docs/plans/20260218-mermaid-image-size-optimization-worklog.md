# 20260218 Mermaid/이미지 표시 크기 최적화 Work Log

- 현재 상태: `CLOSED`
- 작업 ID: `20260218-mermaid-image-size-optimization-worklog`
- 최신 동기화 커밋(파일 최신 커밋 기준): `git log --oneline -- docs/plans/20260218-mermaid-image-size-optimization-worklog.md | head -n 1` 실행 결과

## 목표/범위
- 범위
  - Mermaid 렌더 SVG를 본문 가독성 중심 크기(최대 720px)로 제한
  - 본문 이미지도 동일한 폭 정책(`min(100%, 720px)`)으로 제한
  - 데스크톱/모바일에서 무잘림과 중앙 정렬을 유지
  - Mermaid 회귀 E2E에 폭 상한 검증을 추가
- 비범위
  - 이미지 라이트박스/확대 기능 추가
  - 사용자 설정 스키마(`blog.config.*`) 확장

## 완료 기준(Definition of Done)
- Mermaid SVG가 본문에서 과도하게 커지지 않고 720px 상한 내에 표시된다.
- 본문 이미지가 동일한 폭 정책으로 자동 축소된다.
- 모바일 뷰포트에서 Mermaid/이미지 모두 잘리지 않는다.
- Mermaid 비활성화/로드 실패 정책은 기존과 동일하게 유지된다.
- README(ko/en)에 시각 요소 폭 정책이 반영된다.

## 진행 요약
- `src/runtime/app.css`에 `--content-visual-max-width: 720px` 변수를 도입하고 Mermaid SVG/본문 이미지에 공통 폭 상한을 적용했다.
- `src/runtime/app.js`의 Mermaid SVG 보정 로직에서 `width: 100%` 강제를 제거해 본문 풀폭 확장을 막았다.
- E2E 픽스처에 대형 SVG 이미지를 추가하고, Mermaid/이미지의 실제 렌더 폭이 상한을 넘지 않는지 자동 검증을 추가했다.
- 기본 이미지 정책(`omit-local`)으로 인한 테스트 누락을 피하기 위해 fixture 이미지를 raw HTML `<img>`로 고정했다.
- README(ko/en)에 Mermaid/본문 이미지 폭 정책(`min(100%, 720px)`)을 명시했다.

## 실제 변경 파일 목록(최종)
- `src/runtime/app.css`
- `src/runtime/app.js`
- `tests/e2e/mermaid-runtime.spec.ts`
- `README.md`
- `README.ko.md`
- `docs/plans/20260218-mermaid-image-size-optimization-worklog.md`

## 단계별 체크리스트
- [x] CSS/런타임에 시각 요소 상한폭(720px) 정책 반영
- [x] Mermaid E2E에 Mermaid/이미지 폭 상한 회귀 검증 추가
- [x] README(ko/en) 정책 문구 업데이트
- [x] Work Log 작성 및 무결성 가드 검증

## 테스트 계획 및 검증
- 자동
  - `tests/e2e/mermaid-runtime.spec.ts`
    - Mermaid SVG 폭이 `min(블록 폭, 720px)` 이하인지 확인
    - 본문 이미지 폭이 `min(본문 폭, 720px)` 이하인지 확인
    - 모바일 뷰포트에서 Mermaid/이미지 무잘림 확인
    - Mermaid 비활성화/실패/부분 실패/설정 폴백 회귀 확인
- 수동
  - 이번 Work에서는 자동화된 E2E/빌드 검증으로 대체

## 실행한 검증 커맨드와 결과
- `bun run build -- --vault ./test-vault --out /tmp/mfs-size-opt-dist`
  - 결과: `[build] total=5 rendered=5 skipped=0`
- `bun run test:e2e -- tests/e2e/mermaid-runtime.spec.ts`
  - 1차 결과: 실패(이미지 정책 `omit-local`로 markdown 이미지가 제거됨)
  - 조치: fixture를 raw HTML `<img>`로 변경
  - 2차 결과: `6 passed`
- `bash /Users/lim/.codex/scripts/guard/check_worklog_integrity.sh docs/plans/20260218-mermaid-image-size-optimization-worklog.md`
  - 결과: `PASS` (`요약: PASS=1, FAIL=0, FAIL_ISSUES=0`)

## Plan Drift
- 없음

## 커밋/PR 식별자
- `d03207d` `feat(runtime): Mermaid·이미지 표시폭을 720px 상한으로 조정해 본문 가독성 개선`
- `b91057d` `test(e2e): Mermaid·본문 이미지 720px 상한 회귀 검증 추가`

이번 Work에서 완료된 체크리스트 항목: CSS/런타임 폭 상한 적용, Mermaid/이미지 E2E 회귀 보강, README 정책 업데이트, Work Log 작성
지금 상태에서 통과한 검증(테스트/린트/타입체크 등): `bun run build -- --vault ./test-vault --out /tmp/mfs-size-opt-dist`, `bun run test:e2e -- tests/e2e/mermaid-runtime.spec.ts`
Review에서 집중적으로 봐야 할 위험 지점(있으면): Mermaid 엔진이 폭 속성이 없는 SVG를 생성하는 버전/테마에서 상한 규칙이 동일하게 유지되는지 확인 필요
