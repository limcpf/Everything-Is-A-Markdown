# 20260218-md-lint-publish-report Work Log

## 진행 요약
- `publish: true` 문서만 대상으로 lint를 수행하는 스크립트를 추가했다.
- 결과물은 `--out-dir`로 지정한 경로에 `mdlint-report.json`으로 저장되게 구현했다.
- 문서 스타일 요구사항(본문 H1 금지, 강조/blockquote 규칙)을 반영했다.
- `markdown-it`의 `html: true` 정책과 충돌하지 않게 HTML 관련 lint 규칙을 완화했다.
- 실행 명령을 `package.json`과 `README.ko.md`에 연결했다.

## 실제 변경 파일 목록(최종)
- `package.json`
- `bun.lock`
- `.markdownlint-cli2.cjs`
- `scripts/lint-published-markdown.ts`
- `README.ko.md`
- `docs/plans/20260218-md-lint-publish-report-worklog.md`

## 체크리스트 진행 상황
- [x] `publish: true` + `draft != true` + `prefix 존재` 조건으로 대상 추출
- [x] markdownlint 기반 규칙 구성(`MD049`, `MD050`, `MD037`, `MD027`, `MD028`, `MD036`)
- [x] 본문 H1 금지(`custom/no-h1-body`) 검사 추가
- [x] JSON 리포트 저장(`--out-dir`) 및 엄격 모드(`--strict`) 종료 코드 분기 구현
- [x] 실행 스크립트 및 README 사용법 추가

## 실행한 검증 커맨드와 결과
- 별도 검증 커맨드 미실행(요청 없음)

## 커밋/PR 식별자
- 커밋: 미커밋
- PR: 없음

이번 Work에서 완료된 체크리스트 항목:
- 발행 문서 대상 lint, JSON 리포트 출력, 스타일 규칙 반영, 실행/문서 연결 항목을 완료했다.

지금 상태에서 통과한 검증(테스트/린트/타입체크 등):
- 별도 검증 미실행(요청 없음)

Review에서 집중적으로 봐야 할 위험 지점(있으면):
- `markdownlint` 결과 객체 매핑 필드(`ruleNames`, `errorRange`)가 버전 변경 시 달라질 가능성
