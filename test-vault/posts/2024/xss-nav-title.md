---
publish: true
prefix: BC-XSS-01
category_path: security/testing
branch: dev
title: "<img src=x onerror='window.__xss_title=1'>Unsafe"
description: Regression fixture for runtime XSS escaping.
---

# Runtime XSS Regression Fixture

이 문서는 런타임 내비게이션 렌더링의 XSS 이스케이프 회귀를 검증하기 위한 테스트 픽스처입니다.

<div class="raw-html-safe"><strong>Allowed raw formatting</strong></div>
<script>window.__raw_script = 1</script>
<img class="raw-html-event" src="/missing-xss-fixture.png" alt="event payload" onerror="window.__raw_event = 1" />
<a class="raw-html-url" href="javascript:window.__raw_url = 1">Unsafe URL</a>
<iframe src="https://example.com/unsafe-frame"></iframe>
