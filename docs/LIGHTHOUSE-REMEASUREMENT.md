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
bun run build -- --vault ./test-vault --out ./dist
python3 -m http.server 4173 --bind 127.0.0.1 --directory ./dist
```

로컬 확인 URL 예시:

- `http://127.0.0.1:4173/`
- `http://127.0.0.1:4173/posts/2024/setup-guide/`

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

- 정적 에셋(`assets/app.<hash>.*`)은 long-cache + immutable
  - 예: `Cache-Control: public, max-age=31536000, immutable`
- HTML 문서는 짧은 TTL 또는 `stale-while-revalidate`
- Brotli 압축 활성화
- Early Hints/HTTP3 사용 시 리소스 힌트 동작 점검

## 7) 합격 기준 (권장)

- CLS: `<= 0.10`
- LCP(Desktop): `<= 1.5s` 목표
- SEO: meta description 누락 0건
- Render-blocking 경고 및 Unused CSS/JS 경고가 이전 대비 감소
