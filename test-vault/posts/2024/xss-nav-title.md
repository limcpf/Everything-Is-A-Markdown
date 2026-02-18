---
publish: true
prefix: BC-XSS-01
branch: dev
title: "<img src=x onerror='window.__xss_title=1'>Unsafe"
description: Regression fixture for runtime XSS escaping.
---

# Runtime XSS Regression Fixture

이 문서는 런타임 내비게이션 렌더링의 XSS 이스케이프 회귀를 검증하기 위한 테스트 픽스처입니다.
