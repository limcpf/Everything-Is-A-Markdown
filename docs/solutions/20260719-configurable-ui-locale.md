# Configurable UI locale

## Decision

`ui.locale` accepts `"ko"` and `"en"`, with Korean as the backward-compatible
default. The resolved locale is carried through build options and the manifest,
sets `lang` on both application and 404 HTML, and selects one shared message
catalog for server-rendered and client-rendered UI.

The catalog owns built-in visible copy and accessibility names across the shell,
view navigation, virtual `Recent` folder, Markdown fallbacks and code-copy control,
tree loading states, navigation announcements, manifest errors, and Mermaid
fallbacks. Content titles, branch names, and authored Markdown remain user data
and are not translated.

`seo.locale` stays independent because its Open Graph values commonly use forms
such as `en_US`; it does not select interface copy or HTML language.

## Fallback and cache contract

Configuration rejects values outside the two supported locales. At runtime,
legacy or malformed manifests fall back to Korean. Message resolution also
merges a selected catalog over the complete Korean catalog, so a missing entry
has a deterministic Korean result rather than an empty label or exception.

Rendered Markdown contains locale-sensitive code-copy and omitted-image text.
The content renderer version is therefore bumped and the locale is part of each
content source hash. Switching locale invalidates cached fragments without
requiring a clean build.

## Date format

Document metadata intentionally retains `YYYY-MM-DD HH:mm` in UTC. This fixed,
locale-neutral representation keeps SSR and client navigation byte-identical and
avoids output differences based on the builder or browser timezone.

## Regression coverage

Unit coverage checks complete Korean and English catalogs, pluralized English
search counts, unknown-locale fallback, missing-entry fallback, config validation,
and manifest migration. Browser coverage performs `en → ko → en` incremental
builds, verifies localized content fragments and cache invalidation, then exercises
English branch/search controls, copy feedback, client navigation, announcements,
backlinks, and the JavaScript-independent 404 page.

## Runtime payload

On the standard five-document fixture, the critical application bundle moves
from 42,258 raw / 14,756 gzip bytes to 48,086 raw / 16,616 gzip bytes. The
5,828 raw / 1,860 gzip byte increase contains both complete catalogs and the
shared fallback resolver; runtime assets stay identical between locale builds.
The app-specific guardrail is adjusted to 50,000 raw / 17,000 gzip bytes while
the stricter combined JavaScript budget remains unchanged at 260,000 raw /
78,000 gzip bytes. The measured combined payload is 258,922 raw / 75,173 gzip
bytes.
