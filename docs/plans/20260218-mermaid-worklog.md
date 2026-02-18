# 20260218 Mermaid Diagram Runtime Support Work Log

- 현재 상태: `OPEN`
- 작업 ID: `20260218-mermaid-worklog`
- 최신 동기화 커밋(파일 최신 커밋 기준): `git log --oneline -- docs/plans/20260218-mermaid-worklog.md | head -n 1` 실행 결과

## 목표/범위
- 범위
  - `mermaid` 코드블록(````mermaid`)을 서버 렌더가 아니라 뷰어 런타임에서 Mermaid 라이브러리로 렌더링
  - CDN 경로/테마를 설정에서 조절 가능
  - Mermaid 렌더 실패 시 사용자에 노출 가능한 경고 처리
  - 기존 하이라이팅/코드복사/리스크 방어 동작 유지
- 비범위
  - Mermaid 서버사이드 렌더 파이프라인 추가
  - 문서 내부 Mermaid 구문 정적 파싱/검증 확장

## 완료 기준(Definition of Done)
- Mermaid 코드 블록이 `pre.mermaid` 형태로 렌더되고 화면 이동 후에도 재렌더가 보장되어야 함
- `markdown.mermaid.enabled=false` 시 Mermaid 렌더를 건너뛰고 코드가 그대로 표시되어야 함
- CDN 로드 실패/런타임 오류 시 에러 문구가 노출되어야 함
- 빌드 결과 manifest에 Mermaid 설정이 포함되어야 하며, 런타임에서 동일 설정을 읽어야 함
- 변경사항이 문서/샘플 파일/타입에 반영되어야 함

## 변경 대상
- `src/types.ts`
- `src/config.ts`
- `src/markdown.ts`
- `src/build.ts`
- `src/runtime/app.js`
- `src/runtime/app.css`
- `README.md`
- `README.ko.md`
- `test-vault/posts/2024/mermaid-example.md`

## 단계별 체크리스트
- [x] Mermaid 설정 타입/옵션 확장(`markdown.mermaid`)
- [x] Mermaid 코드블록 렌더 분리(Shiki 제외)
- [x] 빌드 manifest에 Mermaid 설정 반영
- [x] 런타임에서 CDN 로드 및 `pre.mermaid` 렌더 실행
- [x] 라우팅 전환/초기 뷰 모두 재렌더 보장
- [x] 오류 처리 스타일 추가
- [x] 문서 반영 및 샘플 문서 추가/검증

## 테스트 계획 및 검증
- 수동: `bun run build -- --vault ./test-vault --out ./dist-mermaid-work` 실행 후 `BC-VO-99` 문서가 route/manifest에 반영되는지 확인
- 수동: 빌드 결과 `dist-mermaid-work/manifest.json`에서 `mermaid` 설정 존재 및 `/BC-VO-99/` 매핑 확인
- 수동: `dist-mermaid-work/BC-VO-99/index.html` 및 `dist-mermaid-work/content/...html`에서 `pre.mermaid` 구조 존재 확인
- 자동: 현재 변경에서 `mermaid` 블록이 shiki 언어 로딩 대상으로 포함되지 않도록 코드 스캔(수동 검토)

## 실행한 검증 커맨드와 결과
- `bun run build -- --vault ./test-vault --out ./dist-mermaid-work`
  - 결과: `[build] total=5 rendered=1 skipped=4`
  - 경고: `posts/2024/missing-prefix-warning.md`는 publish without prefix로 스킵됨(기존 동작)
- `PLAYWRIGHT_PORT=54323 bun run test:e2e -- tests/e2e/mermaid-runtime.spec.ts`
  - 결과: `4 passed`
- `PLAYWRIGHT_PORT=54323 bun run test:e2e`
  - 결과: `11 passed`

## 리스크/회귀 포인트
- Mermaid CDN 의존으로 오프라인/차단 환경에서는 다이어그램이 렌더되지 않고 에러 문구 노출
- manifest에 설정 추가로 캐시 무효화 범위/빌드 산출물 해시 정책에 영향(기존 문서 렌더링 캐시는 기존 동작 유지)

## 변경 요약(Work Log)
- `BuildOptions/Manifest` 타입에 mermaid 필드를 추가해 런타임 전달 경로를 고정
- markdown 파서에서 `mermaid` code fence는 HTML `pre.mermaid`로 출력하도록 분기
- `app.js`에서 mermaid 설정, CDN 동적 로드, `renderMermaidBlocks` 호출 경로(초기 뷰+내부 라우팅) 추가
- Mermaid 실패 시 `.mermaid-render-error` 메시지 표기 UI 추가
- 샘플 문서(`mermaid-example.md`) 및 사용 가이드(EN/KO README) 추가

## 추가 변경(권장사항 반영)
- `src/config.ts`
  - `markdown.mermaid.cdnUrl/theme` 유효성 검증 및 기본값 폴백 추가
  - 잘못된 값 입력 시 `[config]` 경고 로그 출력
- `src/runtime/app.js`
  - Mermaid 로더에 stale script 정리 로직 추가
  - 실패 시 스크립트 제거/상태 초기화로 다음 렌더 재시도 가능하도록 보강
- `tests/e2e/mermaid-runtime.spec.ts`
  - Mermaid 런타임 회귀 테스트 4건 추가
    - 활성화 렌더 성공
    - 비활성화 동작
    - CDN 로드 실패 동작
    - 설정 폴백(`manifest.mermaid`) 검증
- `README.md`, `README.ko.md`
  - Mermaid 설정값 검증/폴백/런타임 재시도 동작 문서화
- `docs/checklists/e2e-review-checklist.md`
  - Mermaid Runtime 점검 체크리스트 추가
- `docs/solutions/20260218-mermaid-runtime-hardening-guardrail.md`
  - 재발 방지용 Compound 산출물 추가

## Plan Drift
- 없음

## 커밋/PR 식별자
- 기준 커밋: `미정 (현재 작업 트리 미커밋)`

이번 Work에서 완료된 체크리스트 항목: Mermaid 설정 검증/폴백, 런타임 로더 재시도 보강, Mermaid E2E 회귀 테스트 추가, 문서/체크리스트/Compound 업데이트
지금 상태에서 통과한 검증(테스트/린트/타입체크 등): `bun run build -- --vault ./test-vault --out ./dist-mermaid-work`, `PLAYWRIGHT_PORT=54323 bun run test:e2e -- tests/e2e/mermaid-runtime.spec.ts`, `PLAYWRIGHT_PORT=54323 bun run test:e2e`
Review에서 집중적으로 봐야 할 위험 지점(있으면): Mermaid CDN 의존 환경의 사용자 경험, 외부/사설 CDN 사용 시 URL 정책 허용 범위
