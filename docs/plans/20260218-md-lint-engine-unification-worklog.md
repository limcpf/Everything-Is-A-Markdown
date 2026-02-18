# 20260218-md-lint-engine-unification Work Log

## 진행 요약
- 리뷰 후속으로 Markdown lint 실행 엔진/의존성 혼선을 정리했다.
- `markdownlint-cli2` 의존성을 제거하고 `markdownlint` Node API 단일 체계로 통일했다.
- 설정 파일 이름을 엔진 중립적으로 바꾸고(`.markdownlint.cjs`), 스크립트 참조 경로를 갱신했다.
- `publish: true` 대상 lint, parse 실패 집계 유지, JSON 리포트 출력 정책은 그대로 유지했다.
- 한/영 README에 실제 동작 방식(`markdownlint` API) 설명을 반영했다.

## 실제 변경 파일 목록(최종)
- `package.json`
- `bun.lock`
- `.markdownlint.cjs`
- `scripts/lint-published-markdown.ts`
- `README.ko.md`
- `README.md`
- `docs/plans/20260218-md-lint-engine-unification-worklog.md`

## 체크리스트 진행 상황
- [x] `markdownlint-cli2` 의존성 제거
- [x] 설정 파일 리네임(`.markdownlint-cli2.cjs` -> `.markdownlint.cjs`)
- [x] lint 스크립트 설정 참조 경로 갱신
- [x] 한/영 README 동기화
- [x] parse 실패 집계 유지 정책 유지

## 실행한 검증 커맨드와 결과
- `bun remove markdownlint-cli2`: 성공
- 별도 테스트/린트 실행: 미실행(요청 없음)

## 커밋/PR 식별자
- 커밋: 미커밋
- PR: 없음

이번 Work에서 완료된 체크리스트 항목:
- 엔진 통일, 의존성 정리, 설정 파일/문서 동기화 항목을 완료했다.

지금 상태에서 통과한 검증(테스트/린트/타입체크 등):
- 의존성 제거 커맨드 성공 외 별도 검증 미실행

Review에서 집중적으로 봐야 할 위험 지점(있으면):
- `.markdownlint.cjs` 리네임 이후 경로 참조 누락 여부
