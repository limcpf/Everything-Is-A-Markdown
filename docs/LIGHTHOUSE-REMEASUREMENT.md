# Lighthouse 재측정 체크리스트 (실서비스 URL)

대상 URL:

- `https://limc.dev/log/programming/java/core/j-c-08-%EA%B2%BD%EC%9F%81-%EC%A1%B0%EA%B1%B4%E2%80%A6`

## 1) 측정 원칙

- 같은 조건으로 3회 이상 측정 후 median(중앙값) 기준으로 비교
- Desktop/ Mobile 분리 측정 (Desktop 개선 후 Mobile 회귀 여부 확인)
- 측정 시 확장프로그램/백그라운드 앱 최소화
- Cloudflare 캐시 영향 확인을 위해 `cold` 1회 + `warm` 2회 기록

## 2) 필수 확인 항목

- `Performance`, `Accessibility`, `Best Practices`, `SEO` 점수
- `FCP`, `LCP`, `CLS`, `TBT` (가능하면 `INP`도 기록)
- 진단 항목
  - Render blocking resources
  - Reduce unused CSS/JS
  - Layout shift culprits
  - Forced reflow
  - 3rd party impact
- SEO
  - `meta description` 존재 여부
  - canonical/OG/Twitter 메타 존재 여부

## 3) 이번 최적화 반영 검증 포인트

- 초기 화면이 SSR된 본문/메타를 즉시 보여주며 JS 로딩 전에도 레이아웃이 안정적인지
- `#initial-view-data` payload가 경량(route/docId/title)인지
- 에셋이 해시 파일명(`assets/app.<hash>.css|js`)으로 생성되는지
- 페이지가 상대경로 에셋을 참조하는지 (중첩 라우트에서 404 없음)
- 폰트 로딩이 `preconnect + preload + non-blocking stylesheet`로 적용되는지

## 4) 로컬 사전 검증 (배포 전)

```bash
bun run validate:production -- \
  --config ./blog.config.ts \
  --out ./dist \
  --report-dir ./.reports/production-validation
python3 -m http.server 4173 --bind 127.0.0.1 --directory ./dist
```

`production-validation-report.json`이 `passed`인지 확인한 뒤 실서비스 측정을 진행한다.

로컬 확인 URL 예시:

- `http://127.0.0.1:4173/`
- `http://127.0.0.1:4173/BC-VO-02/` (`test-vault/posts/2024/setup-guide.md`의 `prefix` route)

## 5) Lighthouse CLI 예시 (권장)

```bash
mkdir -p ./.reports

npx lighthouse "https://limc.dev/log/programming/java/core/j-c-08-%EA%B2%BD%EC%9F%81-%EC%A1%B0%EA%B1%B4%E2%80%A6" \
  --preset=desktop \
  --only-categories=performance,accessibility,best-practices,seo \
  --output=json \
  --output=html \
  --output-path="./.reports/lh-desktop-1"

npx lighthouse "https://limc.dev/log/programming/java/core/j-c-08-%EA%B2%BD%EC%9F%81-%EC%A1%B0%EA%B1%B4%E2%80%A6" \
  --preset=desktop \
  --only-categories=performance,accessibility,best-practices,seo \
  --output=json \
  --output=html \
  --output-path="./.reports/lh-desktop-2"

npx lighthouse "https://limc.dev/log/programming/java/core/j-c-08-%EA%B2%BD%EC%9F%81-%EC%A1%B0%EA%B1%B4%E2%80%A6" \
  --preset=desktop \
  --only-categories=performance,accessibility,best-practices,seo \
  --output=json \
  --output=html \
  --output-path="./.reports/lh-desktop-3"
```

모바일도 동일하게 `--preset=desktop` 대신 모바일 설정으로 3회 측정.

## 6) Cloudflare 배포 체크

- 생성된 `dist/_headers`가 배포 artifact에 포함되는지 확인
- EIAM 소유 해시 에셋(`assets/app.<hash>.*`, `assets/tree.<hash>.js`)은
  `Cache-Control: public, max-age=31536000, immutable`
- HTML, `manifest.json`, `content/*`, sitemap, robots 및 이름이 고정된 static file은
  `Cache-Control: public, max-age=0, must-revalidate`
- `seo.pathBase`가 있으면 `_headers` 규칙도 같은 prefix를 사용하는지 확인
- 압축은 build가 아니라 host 책임: `Accept-Encoding: br` 요청에서 실제
  `Content-Encoding: br` 응답을 확인

```bash
# 파일명은 dist/assets/에 실제 생성된 값으로 바꾼다.
curl -sI -H 'Accept-Encoding: br' https://example.com/assets/app.0123456789ab.js
curl -sI -H 'Accept-Encoding: br' https://example.com/manifest.json
```

- Early Hints/HTTP3 사용 시 리소스 힌트 동작 점검

## 7) 합격 기준 (권장)

- CLS: `<= 0.10`
- LCP(Desktop): `<= 1.5s` 목표
- SEO: meta description 누락 0건
- Render-blocking 경고 및 Unused CSS/JS 경고가 이전 대비 감소
