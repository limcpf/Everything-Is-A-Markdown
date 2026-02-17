---
title: "Prefix 라우팅/백링크 UI 상호작용 회귀 체크리스트"
tags: ["compound", "ui", "playwright", "routing", "backlinks"]
severity: "P2"
related: [
  "docs/plans/20260217-prefix-route-backlinks-worklog.md",
  "src/runtime/app.js",
  "artifacts/uiux-s1-tree-setup.png",
  "artifacts/uiux-s2-autobranch-about.png",
  "artifacts/uiux-s3-backlinks-visible.png",
  "artifacts/uiux-s4-mobile-esc-closed.png"
]
---

## 문제
- 증상:
  - prefix 기반 라우팅/브랜치 전환/백링크가 코드상 반영되어도 실제 UI 상호작용에서 엣지 케이스가 놓칠 수 있음.
- 재현 조건:
  - 브랜치가 다른 문서 간 이동, 모바일 오버레이 사이드바, 백링크 렌더/클릭 경로가 섞여 있을 때.
- 근본 원인(추정/확정):
  - 단위 검증만으로는 라우팅 상태 전이(브랜치/뷰포트/오버레이)를 끝단에서 보장하기 어려움.

## 해결
- 적용한 접근:
  - Playwright MCP 기반으로 S1~S4 UI 상호작용 시나리오를 표준 회귀 항목으로 고정.
- 변경 범위(파일/모듈):
  - `docs/plans/20260217-prefix-route-backlinks-worklog.md`
  - `artifacts/*.png` (증적 스크린샷)
  - 본 문서
- 트레이드오프:
  - 자동 테스트 코드가 아니라 수동/반자동 점검 문서이므로, 실행자의 일관성이 필요함.

## 검증
- 확인한 테스트:
  - S1 트리 탐색/문서 이동
  - S2 브랜치 자동 전환
  - S3 백링크 렌더/이동
  - S4 모바일 사이드바 열기/ESC 닫기/모바일 이동
  - 콘솔 에러 0건, 주요 네트워크 요청 200 OK
- 추가 회귀 포인트:
  - 모바일에서 패널 닫힘 시 포커스 이동/키보드 접근성(포커스 트랩) 정책 점검

## 재발 방지(시스템 업데이트)
- AGENTS.MD에 추가할 규칙/패턴:
  - UI 상태 전이가 포함된 기능은 최소 1회 Playwright 상호작용 검증을 Work Log에 기록한다.
- 자동으로 잡히게 할 장치(테스트/린트/체크리스트):
  - 아래 체크리스트를 PR 전 점검 항목으로 사용

## UI 회귀 체크리스트 (Prefix/Backlinks)
- [ ] 데스크톱: `/BC-VO-01/` 진입 후 브랜치 전환 시 기대 문서/경로로 이동한다.
- [ ] 데스크톱: Backlinks 섹션이 렌더되며 링크 클릭 시 문서 이동이 된다.
- [ ] 데스크톱: `main` 상태에서 `BC-VO-00` 이동 시 `dev`로 자동 전환된다.
- [ ] 모바일(390x844): `탐색기 열기` 버튼으로 패널이 열린다.
- [ ] 모바일: ESC 입력 시 패널이 닫히고 본문 조작이 가능하다.
- [ ] 모바일: 패널에서 문서 선택 시 기대 prefix 경로로 이동한다.
- [ ] 콘솔 에러가 0건이다.
- [ ] 콘텐츠 fetch 요청이 200 OK다.
