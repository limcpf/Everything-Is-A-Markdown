# Shiki fine-grained loading benchmark

## Context

The Markdown renderer previously imported the umbrella `shiki` package plus the
generated language and theme registries. The highlighter only initialized a few
grammars, but every production install still included the umbrella package and
its unused Oniguruma engine.

The fine-grained renderer now:

- imports `@shikijs/core` and `@shikijs/engine-javascript` directly;
- statically loads Markdown, Bash, JSON, TypeScript, JavaScript, and the default
  `github-dark` theme;
- dynamically imports only non-default themes and known languages encountered
  in fences;
- preserves `c++`, `c#`, and `f#` aliases whose names are not valid package
  subpaths;
- renders unknown languages as escaped plaintext.

## Method

- Date: 2026-07-19 KST
- Machine: macOS 26.5.2, Darwin 25.5.0, arm64
- Runtime: Bun 1.3.9
- Baseline: mother commit `fc0f9a2`
- Candidate: this change, measured from the working tree before commit
- Vault: `test-vault`

Fresh builds used a unique `mktemp` output directory for every run. Incremental
builds warmed one output once, then rebuilt that same output five times. Values
include the complete `bun run src/cli.ts build` child-process duration.

<!-- markdownlint-disable MD013 -->

| Scenario | Baseline runs (ms) | Candidate runs (ms) | Median | Change |
| --- | --- | --- | ---: | ---: |
| Fresh build | 1626.0, 1737.0, 1624.9, 1610.3, 1643.1 | 1549.4, 1554.0, 1598.3, 1552.0, 1559.9 | 1626.0 → 1554.0 ms | -4.4% |
| Incremental build | 190.1, 144.0, 199.9, 144.2, 149.5 | 128.2, 127.3, 127.8, 128.3, 129.9 | 149.5 → 128.2 ms | -14.2% |

<!-- markdownlint-enable MD013 -->

## Published install footprint

Each revision was packed with `npm pack --json`, installed into a new temporary
prefix with `npm install --omit=dev --ignore-scripts <tarball>`, and measured
with `du -sk <prefix>/node_modules`. npm 11.11.0 and Node.js 24.14.1 were used.

<!-- markdownlint-disable MD013 -->

| Metric | Baseline | Candidate | Change |
| --- | ---: | ---: | ---: |
| Production `node_modules` | 43,084 KiB | 38,508 KiB | -4,576 KiB (-10.6%) |
| Installed package entries | 90 | 88 | -2 |
| Package tarball | 81,849 B | 82,518 B | +669 B |
| Package unpacked source | 299,548 B | 302,213 B | +2,665 B |

<!-- markdownlint-enable MD013 -->

The production reduction matches removal of the umbrella `shiki` package and
`@shikijs/engine-oniguruma`. Direct language and theme packages remain installed
because their exported per-language and per-theme modules are the supported
fine-grained entry points; the renderer no longer initializes their generated
registries.
