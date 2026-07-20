# Cloudflare Pages deployment

EIAM site deployment is intentionally separate from publishing the generator package. A vault
repository owns its source notes, production config, generated site, Cloudflare project, and deploy
credentials. The reusable workflow in
`.github/workflows/deploy-cloudflare-pages.yml` runs in that caller repository.

The workflow has two ordered jobs:

1. install the caller's frozen dependencies, run EIAM production validation, and upload the exact
   validated output plus its machine-readable report;
2. when `artifact-only` is false, download that output and deploy it with an exact Wrangler version.

The deploy job cannot start when the build or validation gate fails. Cloudflare secrets are not
referenced by the build job, and the deploy job is omitted entirely in artifact-only mode.

## Caller prerequisites

The vault repository must:

- pin the exact Bun version supported by EIAM in `packageManager`;
- pin an exact `@limcpf/everything-is-a-markdown` release containing
  `scripts/validate-production.ts`, and commit `bun.lock`;
- provide a production config with `seo.siteUrl` and the intended `seo.pathBase`;
- create the Cloudflare Pages project in advance and configure its production branch;
- create `cloudflare-preview` and `cloudflare-production` GitHub environments.

Install the released package without a range. Replace the placeholder with the release that also
contains the reusable workflow:

```bash
bun add --dev --exact @limcpf/everything-is-a-markdown@<exact-version>
```

The workflow uses `bun install --frozen-lockfile`, then invokes the validator from that installed
package. It does not fetch a mutable `latest` package or build the generator repository's test
vault.

## Complete caller workflow

Create this file in the vault repository. Pin `uses` to a release tag or, for the strongest
immutability, the full commit SHA containing the workflow.

```yaml
name: Deploy EIAM site

on:
  push:
    branches:
      - main
      - preview
  pull_request:

permissions:
  contents: read

jobs:
  pages:
    uses: limcpf/Everything-Is-A-Markdown/.github/workflows/deploy-cloudflare-pages.yml@<full-commit-sha>
    with:
      vault-path: vault
      output-path: dist
      config-path: blog.config.ts
      project-name: my-notes
      deployment-environment: ${{ github.ref == 'refs/heads/main' && 'production' || 'preview' }}
      production-branch: main
      preview-branch: ${{ github.head_ref || github.ref_name }}
      artifact-only: ${{ github.event_name == 'pull_request' }}
      exclude-patterns: |
        .obsidian/**
        private/**
    secrets:
      CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
      CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

This example deploys `main` to production, deploys pushes to `preview` as a Pages preview, and makes
every pull request artifact-only. Fork pull requests must use artifact-only mode; the reusable
workflow rejects a fork that attempts a credentialed deploy. An artifact-only caller may omit
`project-name` and both Cloudflare secrets.

The optional `markdown-baseline-path` input points to the exact strict Markdown baseline. Additional
exclusions are newline-separated in `exclude-patterns`; each non-empty line becomes one
`--exclude` argument without shell evaluation.

## Environment and credential controls

Create a custom Cloudflare API token restricted to the target account with **Cloudflare Pages:
Edit** (`Pages Write`). Store the token and the 32-character account ID as the caller repository
secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. The workflow needs only
`contents: read` from GitHub and does not persist checkout credentials or pass `GITHUB_TOKEN` to
Wrangler.

Configure the caller's GitHub environments as follows:

- `cloudflare-preview`: optional approval and preview-specific branch policy;
- `cloudflare-production`: required reviewers and a deployment branch rule limited to `main`.

Before Wrangler receives credentials, the deploy job reads the existing Pages project and requires
its configured production branch to equal `production-branch`. A production run must originate
from that exact Git ref. A preview branch must differ from it. This prevents a mislabeled preview
run from updating the production alias.

The workflow never creates or reconfigures a Pages project. It uses Direct Upload to send the
validated directory and records the immutable deployment URL, alias URL, environment, and
deployment ID in the job summary. Production and preview runs are serialized per repository,
project, and environment. See Cloudflare's [Direct Upload documentation](https://developers.cloudflare.com/pages/get-started/direct-upload/)
for the host-side project contract.

## Artifact-only and failure behavior

`artifact-only: true` performs the frozen install and full production validation, then uploads:

- `eiam-site-<run>-<attempt>`: the exact validated directory, including `_headers` and hidden EIAM
  ownership metadata;
- `production-validation-<run>-<attempt>`: the JSON validation and Markdown reports.

No Cloudflare secret is read and no network mutation is attempted. This is the supported path for
forks and for reviewing a deploy candidate before credentials exist.

On a validation failure, the report upload still runs but the site artifact and deploy job do not.
The report is retained for 14 days; a successful site artifact is retained for 7 days. A rerun
creates a new artifact name, and Wrangler attaches the caller commit SHA to the deployment.

## `pathBase` behavior

For a Pages project served directly at `<project>.pages.dev` or at a custom domain root, use an empty
`seo.pathBase`. Cloudflare Direct Upload deploys the selected directory at the site root; it does
not mount that directory under an arbitrary URL prefix.

Use a non-empty value such as `/notes` only when a separately configured routing layer makes the
Pages output available at that prefix. That layer must preserve the generated route, asset,
canonical, sitemap, and `_headers` semantics. The production validator confirms that generated
references and cache rules consistently include `pathBase`, but it cannot create or verify an
external reverse-proxy rewrite. Test direct route loads and actual response headers at the public
URL before promoting the deployment.

## Rollback

Cloudflare can roll production back only to an earlier successful **production** deployment; a
preview deployment is not a valid target. Use the deployment ID recorded by this workflow, verify
the target in **Workers & Pages > project > Deployments**, and choose **Rollback to this
deployment**. This is the preferred manual recovery path because the operator sees the target URL,
time, commit, and environment before confirmation.

Cloudflare documents the same restriction and dashboard procedure in [Pages
rollbacks](https://developers.cloudflare.com/pages/configuration/rollbacks/). The API form below is
the official [`rollback` endpoint](https://developers.cloudflare.com/api/resources/pages/subresources/projects/subresources/deployments/methods/rollback/).

The equivalent API operation requires the same Pages Write token:

```bash
curl --silent --show-error --fail-with-body \
  "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/$CLOUDFLARE_PROJECT/deployments/$CLOUDFLARE_DEPLOYMENT_ID/rollback" \
  --request POST \
  --header "Authorization: Bearer $CLOUDFLARE_API_TOKEN"
```

Never select a target from a preview URL alone. Confirm that the deployment API or dashboard marks
it `production` and `success`, retain the failed deployment ID for diagnosis, and run the public URL
and cache-header smoke checks again after rollback.

## Host verification

After either environment deploys, check at least:

```bash
curl -sI https://example.com/manifest.json
curl -sI -H 'Accept-Encoding: br' https://example.com/assets/app.<hash>.js
curl -sI https://example.com/<published-route>/
```

HTML, content, manifest, SEO files, and stable-name static files must revalidate. Exact hashed EIAM
JS/CSS files must be immutable. Confirm that `_headers` reached the artifact, that Brotli or Gzip is
negotiated by the host, and that a direct published route returns successfully without an SPA
rewrite.
