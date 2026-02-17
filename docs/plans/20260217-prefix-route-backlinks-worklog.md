# WORK LOG - 20260217-prefix-route-backlinks

- 작업 시각: 2026-02-17 17:01:25 KST
- 기준 커밋(시작점): `91cae68`

## 진행 요약
- 문서 route 생성 규칙을 파일 경로 기반에서 `prefix` 기반으로 전환했다.
- `publish: true` 문서에서 `prefix`가 없으면 빌드에서 제외하고 경고를 출력하도록 빌드 필터를 확장했다.
- 위키링크 resolve에 `prefix` 인덱스를 추가해 `[[BC-VO-01]]` 형태 링크를 지원했다.
- 매니페스트에 `wikiTargets`, `backlinks`를 포함하고, 뷰어에 백링크 섹션 렌더링을 추가했다.
- README(한/영) 정책을 prefix 필수 규칙으로 동기화했고, test-vault 샘플도 갱신했다.

## 실제 변경 파일 목록(최종)
- `src/build.ts`
- `src/types.ts`
- `src/template.ts`
- `src/runtime/app.js`
- `src/runtime/app.css`
- `README.md`
- `README.ko.md`
- `test-vault/about.md`
- `test-vault/posts/2024/file-system-blog.md`
- `test-vault/posts/2024/setup-guide.md`
- `test-vault/posts/2024/missing-prefix-warning.md`

## 체크리스트 진행 상황
- [x] W1 링크/발행 규칙 코어 변경
- [x] W2 위키 resolve 확장(prefix)
- [x] W3 백링크 데이터 파이프라인(manifest)
- [x] W4 런타임/템플릿 백링크 표시
- [x] W5 문서 동기화(README/README.ko)
- [x] W6 회귀성 빌드 검증

## 실행한 검증 커맨드와 결과
- `bun run build -- --vault ./test-vault --out ./dist`
  - 결과: 성공
  - 확인 포인트:
    - `[publish] Skipped published doc without prefix: posts/2024/missing-prefix-warning.md` 경고 출력
    - `total=3 rendered=3 skipped=0`
- `rg -n '"route": "/BC-VO-|"backlinks"|"wikiTargets"' dist/manifest.json`
  - 결과: 성공
  - 확인 포인트:
    - route가 `/BC-VO-00/`, `/BC-VO-01/`, `/BC-VO-02/` 형태로 생성됨
    - manifest docs에 `wikiTargets`, `backlinks` 포함됨
- `rg -n "BC-VO-01|href=\"/BC-VO-01/\"" dist/content/*.html`
  - 결과: 성공
  - 확인 포인트:
    - `[[BC-VO-01]]` 링크가 `/BC-VO-01/`로 변환됨

## Plan Drift 기록
- 없음

## 커밋/PR 식별자
- 신규 커밋: 없음(요청 범위에서 커밋 미수행)
- 작업 시작 기준 커밋: `91cae68`

이번 Work에서 완료된 체크리스트 항목:
- W1, W2, W3, W4, W5, W6 전부 완료

지금 상태에서 통과한 검증(테스트/린트/타입체크 등):
- 빌드 1회 통과, 매니페스트/콘텐츠 산출물 정합성 확인 통과

Review에서 집중적으로 봐야 할 위험 지점(있으면):
- 기존 공개 URL(파일경로 기반)에서 prefix 기반 URL로 바뀐 호환성 영향
- prefix 중복 시 suffix 부여 정책이 기대 UX와 일치하는지

## 추가 WORK (REVIEW 반영) - 2026-02-17 17:11:17 KST

### 진행 요약
- REVIEW의 P1/P2 이슈를 반영해 런타임 백링크 정책을 "전체 브랜치 기준"으로 통일했다.
- 비기본 브랜치에서 unclassified(`branch: null`) 문서로 이동할 때 기본 브랜치로 자동 전환하도록 라우팅 fallback을 보강했다.

### 변경 파일
- `src/runtime/app.js`

### 세부 반영 사항
- `renderBacklinks`에서 `visibleDocIds` 기반 필터를 제거해 백링크 전체를 그대로 렌더하도록 수정.
- `updateBacklinks` 호출부를 단일 인자(`doc`) 사용으로 정리.
- route 미해결 fallback에서 `targetBranch = globalDocBranch ?? defaultBranch`를 사용해 자동 전환 분기를 확장.

### 추가 검증 커맨드와 결과
- `bun run build -- --vault ./test-vault --out ./dist`
  - 결과: 성공 (`total=3 rendered=0 skipped=3`)
  - 확인 포인트: prefix 누락 경고 유지, 빌드 실패 없음
- `rg -n "function renderBacklinks\(|targetBranch = globalDocBranch \?\? defaultBranch|renderBacklinks\(doc\)" src/runtime/app.js`
  - 결과: 성공
  - 확인 포인트: 정책 반영 코드 존재 확인

이번 Work에서 완료된 체크리스트 항목:
- REVIEW 후속 수정 2건(P1 백링크 정책 불일치, P2 자동 전환 누락)

지금 상태에서 통과한 검증(테스트/린트/타입체크 등):
- 빌드 통과, 산출물 route/backlinks 정합성 유지 확인

Review에서 집중적으로 봐야 할 위험 지점(있으면):
- 브랜치 컨텍스트를 유지하려는 사용자 기대와 자동 전환 UX 간의 차이

## 추가 WORK (Playwright UI/UX 상호작용 테스트) - 2026-02-17 17:28:15 KST

### 진행 요약
- Playwright MCP로 데스크톱/모바일 상호작용 시나리오를 실제 브라우저에서 검증했다.
- 트리 탐색, 브랜치 전환 시 자동 라우팅, 백링크 이동, 모바일 사이드바 열기/닫기(ESC)를 확인했다.
- 브라우저 콘솔 에러와 주요 콘텐츠 요청 실패 여부를 추가 확인했다.

### 테스트 환경
- 대상 URL: `http://127.0.0.1:3000`
- 도구: Playwright MCP (`browser_*`)
- 뷰포트:
  - 데스크톱 기본 뷰포트
  - 모바일 `390x844`

### 시나리오별 결과
- [x] S1 트리 탐색/문서 이동
  - `main`에서 `BC-VO-01` 진입 후 `dev` 전환, `BC-VO-02` 이동 확인
- [x] S2 브랜치 자동 전환
  - `main` 상태에서 `BC-VO-01` 백링크의 `BC-VO-00` 클릭 시 `dev`로 자동 전환 확인
- [x] S3 백링크 이동
  - `BC-VO-01`의 Backlinks 섹션 렌더 확인 및 링크 이동 정상 동작 확인
- [x] S4 모바일 사이드바 상호작용
  - `탐색기 열기` 동작 확인
  - ESC 입력 시 사이드바가 오프스크린으로 닫히는 동작 확인
  - 모바일에서 문서 링크 선택 후 `/BC-VO-02/` 이동 확인

### 실행한 검증(Playwright)과 결과
- `browser_console_messages(level=error)`
  - 결과: `Errors: 0`, `Warnings: 0`
- `browser_network_requests(includeStatic=false)`
  - 결과: 콘텐츠 요청 모두 `200 OK` 확인

### 증적(스크린샷)
- `artifacts/uiux-s1-tree-setup.png`
- `artifacts/uiux-s2-autobranch-about.png`
- `artifacts/uiux-s3-backlinks-visible.png`
- `artifacts/uiux-s4-mobile-sidebar-open-confirmed.png`
- `artifacts/uiux-s4-mobile-esc-closed.png`

이번 Work에서 완료된 체크리스트 항목:
- Playwright UI/UX 시나리오 S1~S4 전체

지금 상태에서 통과한 검증(테스트/린트/타입체크 등):
- Playwright 상호작용 시나리오 통과, 콘솔 에러 0건, 주요 콘텐츠 네트워크 요청 200 OK

Review에서 집중적으로 봐야 할 위험 지점(있으면):
- 모바일 오버레이가 닫힌 상태에서도 DOM 상 보조 패널 노드가 유지되므로, 접근성/포커스 트랩 정책이 의도와 일치하는지 확인 필요

## 추가 WORK (P2 모바일 사이드바 접근성) - 2026-02-17 17:59:51 KST

### 진행 요약
- 모바일 사이드바를 엄격 모달 정책으로 정리했다.
- 열림 상태에서 `sidebar(dialog/aria-modal)` + `viewer(inert/aria-hidden)`를 동기화하고, 닫힘 시 원복하도록 상태 전이 함수를 보강했다.
- 모바일 닫힘 상태 사이드바에 `visibility/pointer-events` 차단을 추가해 비의도 상호작용 가능성을 줄였다.
- Playwright로 모바일/데스크톱 상태 전이를 검증해 접근성 속성 및 포커스 복귀를 확인했다.

### 변경 파일
- `src/runtime/app.js`
- `src/template.ts`
- `src/runtime/app.css`

### 세부 반영 사항
- `src/runtime/app.js`
  - `setViewerInteractiveState` 추가로 `viewer`의 `inert`/`aria-hidden` 상태를 일관 제어.
  - `syncSidebarA11y`에서 모바일 열림 시 `role="dialog"`, `aria-modal="true"` 적용.
  - 모바일 닫힘 시 `sidebar`에 `inert`, `aria-hidden="true"` 적용 및 `viewer` 원복.
  - 오버레이 `aria-hidden`도 열림/닫힘과 동기화.
- `src/template.ts`
  - 오버레이 초기 속성에 `aria-hidden="true"` 추가.
  - 사이드바 기본 role을 `complementary`로 명시.
- `src/runtime/app.css`
  - 모바일 닫힘 상태 `.sidebar`에 `visibility: hidden`, `pointer-events: none` 적용.
  - 열림 상태 `.app-root.sidebar-open .sidebar`에 `visibility: visible`, `pointer-events: auto` 적용.

### 추가 검증 커맨드와 결과
- `bun run build -- --vault ./test-vault --out ./dist`
  - 결과: 성공
  - 확인 포인트: 기존 prefix 누락 경고 유지, 빌드 실패 없음
- `rg -n "setViewerInteractiveState|aria-modal|aria-hidden|role\\\", \\\"dialog\\\"|role\\\", \\\"complementary\\\"" src/runtime/app.js src/template.ts`
  - 결과: 성공
  - 확인 포인트: 모달/비활성 접근성 속성 제어 코드 존재
- `rg -n "visibility: hidden|pointer-events: none|sidebar-open \\.sidebar|visibility 0.2s step-end" src/runtime/app.css`
  - 결과: 성공
  - 확인 포인트: 모바일 닫힘/열림 상호작용 차단 CSS 반영

### Playwright 검증 결과
- 모바일 닫힘 상태:
  - `sidebarOpen=false`, `sidebar aria-hidden=true`, `sidebar inert=true`
  - `viewer inert=false`, `viewer aria-hidden=null`
- 모바일 열림 상태:
  - `sidebar role=dialog`, `aria-modal=true`, `aria-hidden=null`
  - `viewer inert=true`, `viewer aria-hidden=true`
  - 최초 포커스가 `#sidebar-close`로 이동
- ESC 닫힘 후:
  - `sidebarOpen=false`, `sidebar role=complementary`, `aria-modal 제거`
  - 포커스 `#sidebar-toggle` 복귀
- 데스크톱 복귀 상태:
  - `sidebar inert=false`, `sidebar aria-hidden=null`, `viewer inert=false`
- 콘솔 에러: 0건

### 증적(스크린샷)
- `artifacts/uiux-p2-mobile-modal-open.png`
- `artifacts/uiux-p2-mobile-modal-closed.png`

이번 Work에서 완료된 체크리스트 항목:
- P2 접근성 개선(엄격 모달 + viewer 비활성 + 모바일 닫힘 상호작용 차단)

지금 상태에서 통과한 검증(테스트/린트/타입체크 등):
- 빌드 통과, Playwright 상태 전이 검증 통과, 콘솔 에러 0건

Review에서 집중적으로 봐야 할 위험 지점(있으면):
- `inert` 미지원 브라우저 호환성(지원 범위 밖 환경)에서 대체 전략 필요 여부

## 추가 WORK (REVIEW 후속: P2 포커스 트랩 + P3 자동 회귀) - 2026-02-17 18:26:57 KST

### 진행 요약
- 모바일 사이드바 포커스 트랩 누수 원인을 `focusable` 후보 계산 로직에서 숨김 조상 미배제로 확정했다.
- `getFocusableElements`를 보강해 `[hidden]/[inert]/[aria-hidden='true']` 조상, `display:none`, `visibility:hidden`, `type=hidden` 요소를 제외하도록 수정했다.
- Playwright 자동 회귀 테스트를 신규 추가해 모바일 Tab/Shift+Tab containment를 코드로 고정했다.
- 레포에서 바로 실행할 수 있도록 Playwright 설정/스크립트를 추가했다.

### 변경 파일
- `src/runtime/app.js`
- `package.json`
- `playwright.config.ts`
- `tests/e2e/mobile-sidebar-focus-trap.spec.ts`
- `bun.lock`

### 세부 반영 사항
- `src/runtime/app.js`
  - `getFocusableElements` 필터 강화를 통해 숨김 상태 하위 포커스 가능한 요소가 후보에 포함되지 않도록 수정.
- `package.json`
  - `test:e2e`, `test:e2e:focus-trap` 스크립트 추가.
- `playwright.config.ts`
  - E2E 테스트 디렉터리/기본 baseURL/프로젝트(chromium) 설정 추가.
- `tests/e2e/mobile-sidebar-focus-trap.spec.ts`
  - 모바일 사이드바 열림 후 Tab/Shift+Tab 30회 반복 시 포커스가 사이드바 내부에 머무르는지 검증.
  - ESC 닫힘 후 접근성 속성/포커스 복귀 검증.

### 추가 검증 커맨드와 결과
- `bun run test:e2e:focus-trap`
  - 결과: 성공(1 passed)
  - 주의: 현재 환경에서는 브라우저 실행 권한으로 인해 권한 상승 실행 필요
- `bun run build -- --vault ./test-vault --out ./dist`
  - 결과: 성공
  - 확인 포인트: prefix 누락 경고 유지, 빌드 실패 없음

이번 Work에서 완료된 체크리스트 항목:
- REVIEW P2(포커스 트랩 누수) 수정
- REVIEW P3(자동 회귀 테스트 부재) 보완

지금 상태에서 통과한 검증(테스트/린트/타입체크 등):
- Playwright E2E 1건 통과, 빌드 통과

Review에서 집중적으로 봐야 할 위험 지점(있으면):
- 테스트 실행 시 샌드박스/권한 제약 환경에서 브라우저 실행 권한 요구 가능성

## 추가 WORK (REVIEW 후속 2차: CI 즉시 연결) - 2026-02-17 18:35:32 KST

### 진행 요약
- Playwright E2E 실행을 외부 수동 서버 의존에서 벗어나도록 `webServer` 기반으로 전환했다.
- 포커스 트랩 테스트에 `viewer inert` 해제 검증을 추가해 닫힘 상태 복구를 더 엄격히 검증한다.
- PR/`main` push에서 자동으로 `build + e2e`를 실행하는 CI 워크플로우를 신규 추가했다.

### 변경 파일
- `playwright.config.ts`
- `tests/e2e/mobile-sidebar-focus-trap.spec.ts`
- `.github/workflows/ci.yml`

### 세부 반영 사항
- `playwright.config.ts`
  - 기본 `baseURL`을 전용 포트(기본 `4173`)로 구성하고, `webServer`로 `bun run dev`를 자동 기동.
  - `PLAYWRIGHT_BASE_URL`이 제공되면 외부 서버를 그대로 사용하도록 분기.
- `tests/e2e/mobile-sidebar-focus-trap.spec.ts`
  - ESC 닫힘 후 `viewer`의 `inert` 속성이 제거되는지 assertion 추가.
- `.github/workflows/ci.yml`
  - 트리거: `pull_request`, `push`(`main`)
  - 단계: bun 설치 → 의존성 설치 → Playwright 브라우저 설치 → 빌드 → E2E(focus-trap) 실행

### 추가 검증 커맨드와 결과
- `bun run test:e2e:focus-trap`
  - 결과: 성공(1 passed)
  - 확인 포인트: webServer 기반 단독 실행 성공, 포커스 containment + inert 해제 검증 통과
- `bun run build -- --vault ./test-vault --out ./dist`
  - 결과: 성공
  - 확인 포인트: prefix 누락 경고 유지, 빌드 실패 없음

이번 Work에서 완료된 체크리스트 항목:
- REVIEW P2-1(E2E 외부 서버 의존) 처리
- REVIEW P3-1(viewer inert 해제 assertion 누락) 포함 처리
- CI 즉시 연결 반영

지금 상태에서 통과한 검증(테스트/린트/타입체크 등):
- Playwright E2E 1건 통과, 빌드 통과

Review에서 집중적으로 봐야 할 위험 지점(있으면):
- CI 환경에서 Playwright 브라우저 설치 시간 증가(실행 시간/비용 영향)

## 추가 WORK (REVIEW 후속 3차: P3 잔여 2건) - 2026-02-17 18:42:51 KST

### 진행 요약
- REVIEW에서 남은 P3 2건을 모두 처리했다.
- `PLAYWRIGHT_PORT`가 비정상 값일 때도 안전한 기본 포트(`4173`)로 fallback 되도록 Playwright 설정을 보강했다.
- CI 실패 시 Playwright trace/report를 수집할 수 있도록 artifact 업로드 단계를 추가했다.

### 변경 파일
- `playwright.config.ts`
- `.github/workflows/ci.yml`

### 세부 반영 사항
- `playwright.config.ts`
  - `parsedPort` 유효성 검증(`양의 정수`)을 통과한 경우에만 포트로 사용.
  - 유효하지 않으면 기본 포트 `4173` 사용.
- `.github/workflows/ci.yml`
  - `if: failure()` 조건으로 `actions/upload-artifact@v4` 단계 추가.
  - 수집 대상: `test-results/**`, `playwright-report/**`
  - `if-no-files-found: ignore`, `retention-days: 7` 적용.

### 추가 검증 커맨드와 결과
- `PLAYWRIGHT_PORT=abc bun run test:e2e:focus-trap`
  - 결과: 성공(1 passed)
  - 확인 포인트: 비정상 포트 값에서도 fallback 동작으로 테스트 실행 성공
- `bun run test:e2e:focus-trap`
  - 결과: 성공(1 passed)
- `bun run build -- --vault ./test-vault --out ./dist`
  - 결과: 성공

이번 Work에서 완료된 체크리스트 항목:
- REVIEW P3-1(PLAYWRIGHT_PORT fallback) 처리
- REVIEW P3-2(CI 실패 artifact 업로드) 처리

지금 상태에서 통과한 검증(테스트/린트/타입체크 등):
- Playwright E2E 2회 통과(정상/비정상 포트), 빌드 통과

Review에서 집중적으로 봐야 할 위험 지점(있으면):
- CI에서 artifact 업로드가 빈 결과일 때도 조용히 통과하도록 설계되어, 실패 로그 확인 절차가 함께 필요

## 추가 WORK (REVIEW 후속 4차: PLAYWRIGHT_PORT 엄격 파싱) - 2026-02-17 19:27:09 KST

### 진행 요약
- REVIEW에서 확인된 `PLAYWRIGHT_PORT=123abc` 부분 파싱 문제를 수정했다.
- 포트 입력값을 정규식 기반으로 엄격 검증하고, 유효 범위(`1024~65535`)를 만족하지 않으면 기본 포트 `4173`으로 fallback 하도록 보강했다.

### 변경 파일
- `playwright.config.ts`

### 세부 반영 사항
- `playwright.config.ts`
  - `rawPort`를 문자열로 읽고 `^[0-9]+$` 패턴으로 숫자 문자열만 허용.
  - 파싱 값이 `1024~65535` 범위를 벗어나면 fallback 처리.
  - 결과적으로 `123abc`, `abc`, `0` 등 비정상 입력은 모두 `4173` 사용.

### 추가 검증 커맨드와 결과
- `PLAYWRIGHT_PORT=123abc bun run test:e2e:focus-trap`
  - 결과: 성공(1 passed)
  - 확인 포인트: `--port "4173"`로 fallback 기동
- `PLAYWRIGHT_PORT=abc bun run test:e2e:focus-trap`
  - 결과: 성공(1 passed)
  - 확인 포인트: `--port "4173"`로 fallback 기동
- `PLAYWRIGHT_PORT=0 bun run test:e2e:focus-trap`
  - 결과: 성공(1 passed)
  - 확인 포인트: 범위 검증에 의해 fallback 기동
- `bun run test:e2e:focus-trap`
  - 결과: 성공(1 passed)
- `bun run build -- --vault ./test-vault --out ./dist`
  - 결과: 성공

이번 Work에서 완료된 체크리스트 항목:
- REVIEW P2-1(포트 부분 파싱 취약점) 수정 완료

지금 상태에서 통과한 검증(테스트/린트/타입체크 등):
- Playwright E2E 4회 통과(정상/엣지 케이스), 빌드 통과

Review에서 집중적으로 봐야 할 위험 지점(있으면):
- 특별한 추가 위험 지점 없음(현 범위 내)

## 추가 WORK (ce-work 마무리: 검증 재실행 + 커밋) - 2026-02-17 20:22:56 KST

### 진행 요약
- 승인된 PLAN 범위 내 반영 사항이 현재 브랜치에 온전히 포함됐는지 검증을 다시 실행했다.
- Playwright E2E(focus trap)와 빌드를 순차 실행해 포트 충돌 없이 통과를 재확인했다.
- 구현/테스트/CI/문서 변경을 의미 있는 완료 단위로 커밋했다.
- Work Log에 커밋 식별자와 검증 결과를 최신 상태로 동기화했다.

### 실제 변경 파일 목록(최종)
- `.github/workflows/ci.yml`
- `README.md`
- `README.ko.md`
- `bun.lock`
- `package.json`
- `playwright.config.ts`
- `src/build.ts`
- `src/runtime/app.js`
- `src/runtime/app.css`
- `src/template.ts`
- `src/types.ts`
- `tests/e2e/mobile-sidebar-focus-trap.spec.ts`
- `test-vault/about.md`
- `test-vault/posts/2024/file-system-blog.md`
- `test-vault/posts/2024/setup-guide.md`
- `test-vault/posts/2024/missing-prefix-warning.md`
- `docs/solutions/20260217-mobile-sidebar-modal-accessibility.md`
- `docs/solutions/20260217-playwright-uiux-regression-checklist.md`
- `artifacts/uiux-s1-tree-setup.png`
- `artifacts/uiux-s2-autobranch-about.png`
- `artifacts/uiux-s3-backlinks-visible.png`
- `artifacts/uiux-s4-mobile-sidebar-open-confirmed.png`
- `artifacts/uiux-s4-mobile-esc-closed.png`
- `artifacts/uiux-p2-mobile-modal-open.png`
- `artifacts/uiux-p2-mobile-modal-closed.png`

### 체크리스트 진행 상황
- [x] C1 승인 PLAN 범위 반영 상태 재검증
- [x] C2 검증 통과 상태에서 의미 있는 완료 단위 커밋
- [x] C3 Work Log 최신화(검증 결과/커밋 식별자 기록)

### 실행한 검증 커맨드와 결과
- `bun run test:e2e:focus-trap`
  - 결과: 성공(1 passed)
  - 확인 포인트: 모바일 사이드바 포커스 containment + ESC 닫힘 후 `viewer inert` 해제 확인
- `bun run build -- --vault ./test-vault --out ./dist`
  - 결과: 성공
  - 확인 포인트: `publish:true && prefix 없음` 경고 출력 유지, 빌드 실패 없음

### Plan Drift 기록
- 없음

### 커밋/PR 식별자
- 구현 커밋: `c65506e`
- PR: 없음

이번 Work에서 완료된 체크리스트 항목:
- C1, C2, C3 완료

지금 상태에서 통과한 검증(테스트/린트/타입체크 등):
- Playwright E2E 1건 통과, 빌드 통과

Review에서 집중적으로 봐야 할 위험 지점(있으면):
- CI에서 브라우저 설치 단계가 추가되어 실행 시간 증가 가능성

## 추가 WORK (REVIEW 후속 5차: P2-1 수정 + P2-2 포함 + P3 정리) - 2026-02-17 20:33:16 KST

### 진행 요약
- P2-1 이슈를 해결하기 위해 자동 브랜치 전환 후 초기 hydration 분기에서도 breadcrumb/meta/nav를 활성 브랜치 기준으로 동기화했다.
- P2-2 범위를 포함해 prefix 라우팅/백링크/자동 브랜치 전환 회귀를 검증하는 Playwright E2E 시나리오 2건을 추가했다.
- CI E2E 실행 대상을 단일 focus-trap에서 전체 E2E로 확장해 핵심 요구 회귀를 기본 게이트로 반영했다.
- P3 정리 항목으로 문서에 참조되지 않는 미추적 스크린샷 5개를 제거했다.

### 변경 파일
- `src/runtime/app.js`
- `tests/e2e/prefix-backlinks-branch.spec.ts`
- `.github/workflows/ci.yml`

### 세부 반영 사항
- `src/runtime/app.js`
  - `shouldUseInitialView` 분기에서 `renderBreadcrumb(route)`, `renderMeta(doc)`, `renderNav(view.docs, view.docIndexById, id)`를 즉시 반영해 초기 SSR 상태와 활성 브랜치 상태 불일치를 제거.
  - 문서 타이틀 동기화 기준을 `initialViewData.title`에서 `doc.title`로 통일.
- `tests/e2e/prefix-backlinks-branch.spec.ts`
  - 시나리오 1: `fsblog.branch=main` 저장 상태에서 `/BC-VO-00/` 직접 진입 시 `dev + unclassified` 자동 전환과 nav(`/BC-VO-02/`) 동기화 검증.
  - 시나리오 2: `/BC-VO-01/`의 backlinks에서 `/BC-VO-00/` 클릭 시 prefix 경로 이동 + 자동 브랜치 전환 + nav 동기화 검증.
- `.github/workflows/ci.yml`
  - E2E 단계 실행 커맨드를 `bun run test:e2e:focus-trap` → `bun run test:e2e`로 확장.

### 체크리스트 진행 상황
- [x] D1(P2-1) 초기 hydration nav 불일치 수정
- [x] D2(P2-2) prefix/backlinks/자동 전환 자동 회귀 포함
- [x] D3(P3-1) 불필요 아티팩트 정리

### 실행한 검증 커맨드와 결과
- `bun run test:e2e`
  - 결과: 성공(3 passed)
  - 확인 포인트:
    - `mobile-sidebar-focus-trap.spec.ts` 통과
    - `prefix-backlinks-branch.spec.ts` 2건 통과
- `bun run build -- --vault ./test-vault --out ./dist`
  - 결과: 성공
  - 확인 포인트: `publish:true && prefix 없음` 경고 유지, 빌드 실패 없음

### Plan Drift 기록
- 없음

### 커밋/PR 식별자
- 신규 커밋: `2f630c9`
- PR: 없음

이번 Work에서 완료된 체크리스트 항목:
- D1(P2-1), D2(P2-2), D3(P3-1) 완료

지금 상태에서 통과한 검증(테스트/린트/타입체크 등):
- Playwright E2E 3건 통과, 빌드 통과

Review에서 집중적으로 봐야 할 위험 지점(있으면):
- CI에서 E2E 전체 실행으로 전환되며 실행 시간 증가 가능성

## 추가 WORK (REVIEW 후속 6차: P3-1 즉시 처리 + .codex 포함) - 2026-02-17 20:40:32 KST

### 진행 요약
- REVIEW에서 남은 P3-1(테스트 취약 assertion)을 즉시 수정했다.
- 브랜치 상태 검증을 텍스트 기반(`sidebar-branch-info`)에서 활성 pill 상태(`.branch-pill.is-active`) 기반으로 전환했다.
- nav 검증은 개수 고정(`toHaveCount(1)`)에서 목적 route 존재(`data-route`) 검증으로 완화했다.
- 사용자 요청에 따라 `.codex/config.toml`를 이번 커밋 범위에 포함한다.

### 변경 파일
- `tests/e2e/prefix-backlinks-branch.spec.ts`
- `.codex/config.toml` (커밋 포함 대상)

### 세부 반영 사항
- `tests/e2e/prefix-backlinks-branch.spec.ts`
  - `toContainText("dev + unclassified")` 제거 후 `.branch-pill.is-active[data-branch="dev"]` 검증으로 변경.
  - `toHaveCount(1)` 제거 후 `#viewer-nav .nav-link[data-route="/BC-VO-02/"]` 존재/클릭 검증으로 변경.

### 체크리스트 진행 상황
- [x] P3-1 테스트 내구성 개선(텍스트/개수 하드코딩 완화)
- [x] 사용자 정책 반영(.codex 포함 커밋 준비)

### 실행한 검증 커맨드와 결과
- `bun run test:e2e`
  - 결과: 성공(3 passed)
  - 확인 포인트:
    - `prefix-backlinks-branch.spec.ts` 2건 통과
    - `mobile-sidebar-focus-trap.spec.ts` 1건 통과
- `bun run build -- --vault ./test-vault --out ./dist`
  - 결과: 성공
  - 확인 포인트: `publish:true && prefix 없음` 경고 유지, 빌드 실패 없음

### Plan Drift 기록
- 없음

### 커밋/PR 식별자
- 신규 커밋: `7135af3`
- PR: 없음

이번 Work에서 완료된 체크리스트 항목:
- P3-1 즉시 처리, `.codex` 포함 정책 반영

지금 상태에서 통과한 검증(테스트/린트/타입체크 등):
- Playwright E2E 3건 통과, 빌드 통과

Review에서 집중적으로 봐야 할 위험 지점(있으면):
- `.codex` 설정 파일 포함이 팀 운영 정책과 충돌하지 않는지
