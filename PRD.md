# PRD — File-System Blog v2 (Bun Static Generator)

> 목표: **옵시디언 Vault 전체**를 입력으로 받아, `publish: true`인 마크다운만 추려  
> “파일 탐색기(좌측) + 문서 뷰어(우측)” UI를 가진 **정적 사이트**를 생성하고 Cloudflare Pages에 배포한다.  
> 핵심은 **prefix 기반 진짜 경로 라우팅(Real Path Routing)** + **빌더 단순성** + **게시글이 많아도 빠른 체감 성능**이다.

---

## 0) 결정 사항(당신 답변 반영)

- 입력 루트: `posts/` 같은 별도 루트가 아니라 **Vault 자체가 루트**
  - 빌더 실행 인자로 vault 경로를 받는다.
- 발행 여부: `frontmatter.publish === true` (유지)
- 라우팅: **해시 라우팅 X**, **`prefix` 기반 진짜 경로 라우팅 O**
- 탐색기 폴더: 실제 파일 경로가 아니라 **`category_path` 기준**
- Obsidian 위키링크: **문서 링크는 지원**, **이미지는 지원하지 않음**(이미지는 별도 사이트)
- 코드 하이라이트: **무조건 필수**
- 정렬: 기본은 **ㄱㄴㄷ(가나다) 정렬**
- 신규 표시: “최근 글”은 파일 트리에서 **NEW 아이콘** 표시
- “최근 글” 전용 폴더: **실제 파일시스템과 별개인 가상 폴더**를 탐색기에 추가
- 신규/최근 기준: 파일 `mtime`이 아니라 **frontmatter 날짜 사용**
  - NEW: `date` → `createdDate`
  - Recent/홈 fallback: `updatedDate` → `modifiedDate` → `lastModified`, 없으면 `date` → `createdDate`

---

## 1) UX / 화면 요구사항

### 1.1 레이아웃
- 좌측: 파일 탐색기(Directory Tree)
  - 폴더 + 마크다운 파일만 표시
  - OS 파일 시스템 느낌(트리/들여쓰기/접힘·펼침)
  - 현재 선택된 글은 active 강조
  - “NEW” 아이콘(또는 배지)을 파일 우측에 표시(조건은 6.3 참고)
- 우측: 문서 뷰어(Viewer)
  - 선택한 글의 HTML 렌더링
  - 헤딩/리스트/인용/링크/코드블록/인라인 코드/표(가능하면)/콜아웃(옵션) 표시
  - 코드 하이라이트는 필수(Shiki 권장)

### 1.2 네비게이션
- 좌측 파일 클릭:
  - 우측 본문 변경
  - URL이 해당 글의 **진짜 경로**로 변경되어야 한다.
  - 새로고침/직접 링크 접근 시에도 동일한 글이 열린다.
- 폴더 클릭:
  - 접힘/펼침 토글
- 브라우저 뒤로/앞으로 동작해야 한다.

### 1.3 가상 폴더(Recent)
- 탐색기 최상단(또는 고정 섹션)에 `Recent` 가상 폴더를 추가한다.
- `Recent`에는 frontmatter 수정일을 우선하고 생성일을 fallback으로 사용해 최신순으로 정렬한 문서를 표시한다.
- 이 목록은 실제 디렉터리 구조와 무관하다.

---

## 2) 입력/출력 규격

### 2.1 입력(옵시디언 Vault)
- 빌더 실행 시 `--vault <path>`로 Vault 루트를 받는다.
- Vault 내부의 모든 `.md` 중에서:
  - frontmatter `publish: true` 인 문서만 “게시글 후보”
  - 단, `draft: true`면 제외(있을 경우)
- (옵션) 제외 규칙:
  - `.obsidian/**` 무조건 제외
  - `Templates/**`, `daily/**` 등은 config로 exclude 패턴 지원

### 2.2 출력(정적 사이트)
- 빌더는 `dist/`에 정적 파일을 생성한다.
- **진짜 경로 라우팅**을 위해, 각 글은 정규화한 frontmatter `prefix`를 기반으로 **HTML route를 생성**한다.
- 실제 Vault 경로는 안정적인 내부 문서 ID와 위키링크 해석에 사용하고, 공개 URL에는 노출하지 않는다.

권장 산출물 구조:

- `dist/_app/index.html`  
  - 공통 “앱 셸(좌측 탐색기 + 우측 뷰어)” 템플릿(프리렌더용)
- `dist/assets/app.js`, `dist/assets/app.css`  
  - UI 런타임(탐색기/페이지 전환/본문 삽입)
- `dist/manifest.json`  
  - 트리/메타데이터 인덱스(필수)
- `dist/content/<sha1-of-doc-id>.html`
  - 각 문서의 본문 HTML(하이라이트 포함) — 클라이언트가 fetch로 가져오는 용도(필수)
- `dist/<route>/index.html`  
  - 각 route별 “직접 접근용 프리렌더 페이지”(필수, real routing)

예시:
- 입력 파일: `vault/posts/2024/setup-guide.md`
- frontmatter: `prefix: BC-VO-02`, `category_path: engineering/blog/frontend`
- 공개 라우트: `/BC-VO-02/`
- 생성 파일: `dist/BC-VO-02/index.html`
- 내부 문서 ID: `posts__2024__setup-guide`
- 본문: `dist/content/<sha1-of-doc-id>.html`

> 핵심: “어떤 경로로 들어와도 해당 경로에 index.html이 존재”하도록 만들어  
> Cloudflare Pages에서 별도 SPA rewrite 없이도 direct access가 된다.

---

## 3) Frontmatter 스키마(명확히 고정)

### 3.1 MVP 스키마
```yaml
---
publish: true                  # true인 글만 포함
prefix: "BC-VO-02"             # 공개 route의 기준 (필수)
category_path: "engineering/blog/frontend" # 탐색기 폴더의 기준 (필수)
title: "글 제목"                # 없으면 파일명 기반 자동 생성
date: "2024-10-24"             # 옵션: 표시 및 NEW 기준
updatedDate: "2024-10-25"      # 옵션: Recent/홈 정렬 우선 기준
description: "요약"            # 옵션
tags: ["react", "nextjs"]      # 옵션
draft: false                   # 옵션 (true면 제외)
---
```

### 3.2 기본 동작

* `publish` 누락: 기본 false(= 미발행)
* `publish: true`지만 `prefix` 또는 `category_path` 누락: 경고 후 게시 대상에서 제외
* `title` 누락: 파일명에서 자동 생성(예: `file-system-blog` → `File System Blog`)
* `date`/`createdDate` 누락 또는 유효하지 않음: 날짜를 표시하지 않고 NEW 배지를 붙이지 않음
* 수정일 누락 또는 유효하지 않음: Recent/홈 정렬에서 `date`/`createdDate`로 fallback

---

## 4) 경로/ID 규칙

### 4.1 라우트 생성 규칙(Prefix Route)

* frontmatter `prefix`를 Unicode NFKC로 정규화하고 공백, `_`, `/`를 `-`로 바꾼 값을 route로 사용한다.
* 지원하지 않는 문장부호를 제거하고 연속 `-`를 하나로 합친다.
* 예: `prefix: BC-VO-02` → `/BC-VO-02/`
* 예: `prefix: Docs / Intro` → `/Docs-Intro/`
* 정규화 결과가 충돌하면 Vault 상대경로 기반 hash suffix를 뒤 문서 route에 추가하고 경고한다.

### 4.2 문서 ID 규칙

* manifest key로 쓸 안정적인 ID가 필요하다. 공개 route와 내부 ID는 서로 독립적이다.
* 규칙:

  * `id = vaultRelPathWithoutExt`를 `/`를 `__`로 치환
  * 예: `posts/2024/file-system-blog` → `posts__2024__file-system-blog`
* `contentUrl = /content/<sha1-of-id>.html`

---

## 5) Markdown → HTML 변환 규칙

### 5.1 필수 지원(파서/렌더러)

* CommonMark 기본(헤딩/리스트/인용/강조/링크/이미지 토큰은 파싱되지만 이미지 렌더는 5.4에서 처리)
* 코드블록/인라인 코드
* 표(GFM) 가능하면 지원(권장)
* 링크 URL 이스케이프/보안 처리(기본 sanitize 또는 allowlist)

### 5.2 코드 하이라이트(필수)

* Shiki 기반 하이라이트(권장)

  * 변환 시점에 코드블록을 HTML로 렌더링(테마 지정)
  * CSS는 `app.css` 또는 별도 `shiki.css`로 포함
* 최소 요구:

  * 언어가 없는 코드블록도 fallback 하이라이트(plain)
  * 빌드 시간이 과도해지지 않도록 캐시(8.1) 사용

### 5.3 Obsidian 위키링크(문서 링크만)

* `[[Some Note]]` 또는 `[[path/to/note]]`

  * Vault 내에서 해당 md를 resolve(파일명/경로 기반)
  * resolve 성공 시: `<a href="/resolved/route/">...</a>`로 변환
  * resolve 실패 시: 텍스트로 남기거나 경고 로그 출력(정책 선택)
* `[[note|label]]` 형태 지원(가능하면)

### 5.4 이미지 처리(이번 버전 정책)

* 이미지/첨부는 별도 사이트가 있으므로 **로컬 이미지 파일 복사/번들링은 하지 않는다.**
* 마크다운 이미지 문법 `![]()` 혹은 `![[...]]`는:

  * 기본 정책: 그대로 HTML `<img>`로 내보내되, 경로가 로컬이면 경고 로그 출력(또는 제거)
  * 권장 정책(안전): 로컬 경로인 경우 `<img>`를 제거하고 “(image omitted)” 같은 플레이스홀더로 대체(옵션)

---

## 6) 탐색기 트리 / 정렬 / NEW / Recent

### 6.1 트리 생성

* `publish: true` 문서만 트리에 포함
* 트리 노드 타입:

  * `folder` / `file`
* 파일 노드 메타:

  * `id`, `title`, `prefix`, `categoryPath`, `route`, `contentUrl`, `date`, `updatedDate`, `tags`, `description`, `branch`

### 6.2 정렬 규칙(기본 ㄱㄴㄷ)

* 폴더 안에서:

  1. 폴더 먼저
  2. 이름 가나다 오름차순(한국어 기준 정렬: localeCompare('ko-KR') 권장)
* 파일도 동일하게 가나다 오름차순
* 단, `Recent` 가상 폴더에서는:

  * `updatedDate`/`modifiedDate`/`lastModified` 우선, `date`/`createdDate` fallback으로 내림차순
  * 유효한 날짜가 없는 문서는 날짜가 있는 문서 뒤에서 Vault 상대경로 가나다순

### 6.3 NEW 표시 규칙

* `date` 또는 `createdDate`가 최근 N일 이내면 NEW 표시
* 기본값: `newWithinDays = 7` (config로 변경 가능)
* `updatedDate` 계열과 파일 `mtime`은 NEW 판정에 사용하지 않는다.
* 표시 방식:

  * 파일 항목 우측에 작은 “NEW” 배지/아이콘

### 6.4 Recent 가상 폴더

* 최상단 고정 노드로 삽입(실제 파일시스템과 별개)
* 포함 기준:

  * 기본: frontmatter 날짜 기준 최신 `recentLimit = 5`개
* 정렬:

  * 수정일 계열 우선, 생성일 계열 fallback 내림차순

---

## 7) UI 런타임 구현(최소/단순)

### 7.1 기술 선택(권장)

* MVP: Vanilla JS(또는 Preact 정도의 초경량)
* 동작:

  * `manifest.json` 로드 → 트리 렌더
  * 현재 URL의 route로 선택 문서 결정 → `contentUrl` fetch → 우측 삽입

### 7.2 페이지 라우팅(Real Path)

* 각 route의 `index.html`은 동일한 앱 셸을 포함한다.
* 앱 셸은 현재 location.pathname을 읽어 “현재 문서 route”를 선택한다.
* 기본 branch는 `dev`이며 `branch`가 없는 문서도 기본 branch 뷰에 속한다.
* 루트 홈은 기본 branch의 `/index/` 문서를 우선한다.
* `/index/`가 없으면 수정일 계열 → 생성일 계열의 최신 문서를 사용하고, 날짜가 모두 없으면 route 가나다순 첫 문서를 사용한다.
* 기본 branch 문서가 하나도 없으면 전체 게시 문서에 같은 홈 선택 규칙을 적용한다.
* 문서가 없는 경로(404):

  * `dist/404.html` 제공(Cloudflare Pages 기본 404 처리)

### 7.3 상태 저장

* 폴더 펼침 상태: `localStorage`에 저장(키 예: `fsblog.expanded`)
* 선택 문서: URL이 source of truth(새로고침 안전)

---

## 8) 빌더(Bun) 요구사항

### 8.1 캐시/증분 빌드(필수 권장)

* `.cache/eiam/v1-<namespace>/build-index.json`에 문서별 fingerprint/mtime 저장
* 변경된 문서만 재변환(Shiki 비용 절감)
* 삭제된 문서는 dist에서 정리

### 8.2 CLI

* `blog build`

  * `--vault <path>` (필수 또는 default `.`)
  * `--out <path>` default `dist`
  * `--exclude <glob>` 여러 번 가능
  * `--new-within-days 7`
  * `--recent-limit 20`
* `blog dev`

  * 로컬 dev 서버 + 파일 변경 감지(가능하면)
* `blog clean`

  * `dist/`, `.cache/` 제거

예시:

```bash
bun run blog build --vault ../vault --out ./dist --exclude ".obsidian/**" --exclude "private/**"
bun run blog dev --vault ../vault --port 3000
```

### 8.3 설정 파일(선택)

* `blog.config.ts` 지원(인자 우선)
* 예:

```ts
export default {
  vaultDir: "../vault",
  outDir: "dist",
  exclude: [".obsidian/**", "private/**"],
  ui: {
    newWithinDays: 7,
    recentLimit: 5,
  },
  markdown: {
    wikilinks: true,
    images: "omit-local", // "keep" | "omit-local"
    gfm: true,
    highlight: {
      engine: "shiki",
      theme: "github-dark",
    },
  },
};
```

---

## 9) 배포(Cloudflare Pages)

### 9.1 기본

* 배포 대상은 `dist/` 폴더
* 각 route가 실제 파일로 존재하므로 SPA rewrite 규칙 없이도 direct access 가능

### 9.2 현재 파이프라인 유지(권장)

* Vault repo push
* GitHub Actions:

  * bun 설치
  * 빌더 실행(`blog build --vault ...`)
  * 산출물 `dist/` 업로드로 Pages 배포

---

## 10) 수용 기준(Acceptance Criteria)

### 기능

* [ ] Vault 전체에서 `publish: true`인 문서만 트리에 노출
* [ ] 모든 문서 route에 대해 `dist/<route>/index.html` 생성되어 direct access 가능
* [ ] 폴더/파일 가나다 정렬(ko-KR)
* [ ] 공개 route가 `prefix`에서 생성되고 탐색기 폴더가 `category_path`에서 생성
* [ ] NEW 표시가 `date`/`createdDate` 기준으로 동작하며 기본 임계값은 7일
* [ ] Recent 가상 폴더가 상단에 고정되고 수정일→생성일 기준 최신 5개를 노출
* [ ] 위키링크 `[[...]]`가 문서 링크로 변환(이미지 제외)
* [ ] 코드 하이라이트가 모든 코드블록에 적용

### 성능/품질

* [ ] 문서 1,000개 기준에서도 초기 로딩은 `manifest.json` + 최소 UI 자산만 로드(본문은 선택 시 fetch)
* [ ] Shiki 하이라이트가 있어도 증분 빌드로 “변경된 문서만” 재생성
* [ ] 실패 시 어떤 파일에서 실패했는지 명확한 에러 로그

---

## 11) 구현 마일스톤(오픈코드 바이브코딩용 작업 분해)

### M1. 스캐너 + frontmatter 파서

* Vault 스캔(md)
* exclude 적용
* gray-matter로 frontmatter 파싱
* publish/draft 필터
* 게시 필수 메타데이터(`prefix`, `category_path`) 검증
* 생성일/수정일 frontmatter 정규화

### M2. 라우트/ID/manifest 생성

* route 생성(`prefix` 기반, 충돌 suffix 포함)
* 트리 생성(`category_path` 기반 폴더/파일)
* Recent 가상 폴더 삽입
* NEW 플래그 계산
* `manifest.json` 출력

### M3. Markdown → HTML 변환(+Shiki)

* md → HTML 렌더
* 코드블록 Shiki 하이라이트 적용
* `content/<sha1-of-doc-id>.html` 생성
* 위키링크 resolve & 변환(문서만)

### M4. 프리렌더 route pages 생성(Real Path)

* `dist/<route>/index.html` 생성
* 공통 셸 + 초기 route 주입(또는 pathname로 자동 선택)

### M5. UI 런타임

* manifest 로드
* 트리 렌더(접힘/펼침)
* 클릭/히스토리 네비게이션 처리
* content fetch 후 우측 삽입

### M6. 캐시/증분 + dev

* `.cache` 기반 변경 파일만 재빌드
* dev 서버 + watch(가능하면)

---

## 12) 확정된 기본 선택

1. NEW 기준을 “최근 7일”로 둘까, “최근 14일”로 둘까? (default는 7로 잡아둠)
-> 최근 7일
2. Recent 가상 폴더는 frontmatter 날짜 기준 최신 5개
   - `ui.recentLimit` 또는 `--recent-limit`로 변경 가능
3. 위키링크 resolve에서 파일명이 중복되면 경고 후 링크 변환 생략
---

## 13) 프론트엔드 관련 디자인 이미지 및 간략한 코드는 프로젝트 루트경로의 example 디렉터리를 참고.

1. screen.png: 예시 화면 캡쳐
2. code.html: 예시 화면의 예시 코드
