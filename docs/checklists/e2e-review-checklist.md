# E2E Review Checklist

## 원칙
- [ ] UI 문구 완전일치보다 상태/route 기반 assertion을 우선한다.
- [ ] 기본 브랜치 값은 문자열 상수 하드코딩 없이 manifest에서 동적으로 읽는다.
- [ ] 테스트 실패 메시지는 원인 추적이 가능하도록 명시적으로 작성한다.

## Prefix/Backlinks/Branch 전이
- [ ] prefix route 이동 후 URL과 제목이 함께 일치한다.
- [ ] backlinks 클릭 후 기대 route로 이동한다.
- [ ] 자동 브랜치 전환 후 활성 pill(`.branch-pill.is-active`)이 기대 브랜치를 가리킨다.
- [ ] 전환 후 nav target(`data-route`)이 현재 브랜치 가시 문서 기준과 일치한다.

## Mermaid Runtime
- [ ] Mermaid 활성화 시 `pre.mermaid`가 실제 렌더 결과(SVG)로 치환된다.
- [ ] Mermaid 비활성화 시 원본 코드 블록이 유지되고 안내 메시지가 노출된다.
- [ ] Mermaid CDN 로드 실패 시 오류 메시지가 노출되고 페이지가 정상 동작한다.

## 검증 커맨드
- [ ] `bun run test:e2e`
- [ ] `bun run build -- --vault ./test-vault --out ./dist`
