# Browser runtime controller boundaries

## 문제

`src/runtime/app.js`가 bootstrap, navigation wiring, tree/search, responsive sidebar, settings, Mermaid, image와 copy 보강을 모두 직접 소유했다. 기능별 listener와 mutable state가 한 함수에 섞여 있어 다음 문제가 있었다.

- 개별 기능을 import하거나 lifecycle만 독립 검증하기 어려웠다.
- listener 등록과 정리의 소유자가 불분명했다.
- branch projection, tree selection, content navigation이 서로의 지역 상태를 직접 참조했다.
- 작은 UI 변경도 2천 줄이 넘는 `start()`의 회귀 범위를 넓혔다.

## 경계

runtime을 다음 계약으로 분리했다.

| 모듈 | 소유 책임 | 공개 lifecycle/동작 |
| --- | --- | --- |
| `runtime-bootstrap.js` | SSR bootstrap JSON 검증, manifest fetch, pathBase와 tree asset URL 검증 | `loadRuntimeBootstrap()` |
| `content-controller.js` | route 해석 결과의 content fetch, history/popstate, viewer 갱신 | `setup()`, `destroy()`, `navigate()` |
| `tree-controller.js` | branch pills, tree projection/selection, search, deferred chunk, fallback/retry | `setup()`, `destroy()`, `requestLoad()`, selection/branch callbacks |
| `sidebar-layout-controller.js` | mobile modal, focus trap, overlay, desktop splitter | `setup()`, `destroy()`, `open()`, `close()`, `isCompact()` |
| `settings-controller.js` | theme, system color scheme, menu toggle 위치, settings popover | `setup()`, `destroy()`, `close()` |
| `mermaid-controller.js` | Mermaid script/config/render와 partial failure 격리 | `setup()`, `destroy()`, `render()` |
| `content-enhancement-controller.js` | image 비율 분류, code copy delegation, Mermaid 연결 | `setup()`, `destroy()`, `enhance()` |
| `controller-lifecycle.js` | listener 등록과 역순 cleanup | `createEventScope()` |

`app.js`는 이 controller들을 만들고 callback을 연결한 뒤 초기 route를 여는 composition root만 담당한다.

## 상태 원칙

- branch, 현재 문서, branch별 docs/tree projection은 계속 `navigation-state.js` 한 곳만 변경한다.
- tree controller는 navigation state를 읽어 UI를 projection하며 별도 branch/current-document 사본을 만들지 않는다.
- content controller가 자동 branch 전환을 발견하면 tree controller의 `handleBranchChange()`에 알린다.
- tree selection과 branch pill은 content controller의 `navigate()`만 호출하며 content/history를 직접 변경하지 않는다.
- 모든 controller의 `setup()`과 `destroy()`는 반복 호출에 안전하다.
- bfcache 진입 시 history listener를 소유한 content controller만 suspend하고 persisted `pageshow`에서 복원한다. 실제 unload에서는 controller들을 역순으로 정리한다.
- desktop tree chunk는 초기 content paint 기회 뒤 idle 단계에서 로드하고, compact layout에서는 sidebar/search 상호작용 전까지 요청하지 않는다.

## 회귀 검증

- `runtime-controller-lifecycle.spec.ts`가 event scope와 content/settings/layout/tree controller의 중복 없는 setup/destroy를 독립 import로 검증한다.
- 기존 navigation, branch, pathBase, tree search/deferred load, mobile focus trap, responsive layout, Mermaid/image 테스트를 그대로 유지한다.
- output size와 reproducible build guardrail은 bundle 경계 변경 뒤에도 동일하게 적용한다.
