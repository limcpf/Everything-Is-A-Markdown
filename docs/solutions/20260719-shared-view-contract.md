# Shared SSR/client view contract

## 문제

build output과 browser runtime이 breadcrumb, metadata, previous/next, backlinks를 서로 다른 함수로 렌더링했다. 날짜와 tag 정규화, pathBase 인코딩, branch별 nav 대상, HTML escaping도 각각 구현되어 direct-load의 SSR markup과 client navigation 결과가 달라질 수 있었다.

초기 client navigation은 SSR markup이 이미 같아도 `innerHTML`을 다시 대입했다. 이 동작은 불필요한 DOM mutation을 만들고, 두 renderer의 drift를 가렸다.

## 계약

`src/view-contract.ts`는 Node/Bun build와 browser bundle 양쪽에서 import할 수 있는 순수 모듈이다.

- route/pathBase를 정규화하고 각 path segment를 한 번만 encode한다.
- branch 이름과 branch별 visible docs projection을 정규화한다.
- home route 선택을 date와 route 기준으로 결정한다.
- metadata date를 UTC `YYYY-MM-DD HH:mm`으로 렌더링해 server/browser timezone 차이를 제거한다.
- prefix, tag, backlink를 presentation model로 정규화한다.
- model의 모든 text와 attribute 값을 동일한 escaping 함수로 렌더링한다.
- breadcrumb, metadata, nav, backlinks HTML을 `RenderedViewChrome` 한 객체로 반환한다.
- document title 조합도 같은 contract를 사용한다.

build는 각 문서의 branch를 기준으로 visible docs를 만든 뒤 shared renderer 결과를 `AppShellInitialView`에 넣는다. runtime navigation state도 같은 branch/path/home helper를 사용하고, content controller는 현재 navigation projection을 shared renderer에 전달한다.

## Hydration

content controller는 SSR chrome과 다음 render 결과를 비교한다. `innerHTML`, `textContent`, `hidden` 값이 동일하면 setter를 호출하지 않는다. branch projection이나 route가 달라 실제 markup 변경이 필요할 때만 DOM을 갱신한다.

이 방식은 초기 markup을 무조건 신뢰하지 않으면서도 동일한 SSR markup을 덮어쓰지 않는다.

## 회귀 검증

`view-contract.spec.ts`는 다음을 고정한다.

- date/tag/pathBase/escaping model contract
- default와 non-default branch projection 및 home route
- default/unclassified 문서와 non-default branch 문서의 hydration chrome write 0회
- direct-load와 client-navigation의 breadcrumb/meta/backlinks/nav snapshot 동등성

기존 pathBase, branch 자동 전환, XSS, history 테스트도 shared contract를 통과한 상태로 유지한다.
