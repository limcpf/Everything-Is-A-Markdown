# Release process

EIAM publishes one user-facing artifact: the Bun source package on npm. A GitHub Release records the same tag and generated release notes; it does not carry a generic built-site archive.

## Contract

- `.github/workflows/release.yml` is the only `v*` tag publisher.
- A tag push checks out that exact tag. A manual run requires an existing tag and checks out `refs/tags/<input>` rather than the branch selected in the UI.
- The tag must be a stable `v<package.json version>` such as `v0.9.0`, and the checked-out commit must be the tagged commit. Prerelease dist-tag policy is intentionally not implicit in this workflow.
- Lint, formatting, typecheck, unit tests, a test-vault build, size and reproducibility gates, and E2E tests run before any publishing credential is used.
- `bun pm pack` creates one tarball. The workflow logs its file list, transfers that exact file between jobs, verifies SHA-256 and SRI, and passes the same path to `bun publish`.
- The publish job verifies npm registry integrity before and after publication, then creates or reuses the matching GitHub Release.
- Concurrency is scoped by tag so two runs cannot publish the same version simultaneously.

## Starting a release

1. Update `package.json` to the intended version and merge the fully verified release commit.
2. Create and push a matching tag such as `v0.9.0`.
3. Follow the `Release` workflow. Do not start a second run for the same tag while one is active.

`workflow_dispatch` is a recovery path, not a way to publish an arbitrary branch. Enter the existing tag to reconcile npm and GitHub Release state after a transient failure.

## Failure diagnosis and recovery

Start with the first failed named step in the workflow.

- **Release identity:** fix a mismatched or moved tag; never repoint a version that was already published to npm.
- **Quality:** fix the exact tagged commit and issue a new version/tag. Published tags are not patched in place.
- **Artifact or registry mismatch:** stop. The same package version already points to different bytes and cannot be overwritten.
- **Missing npm credentials:** configure the repository `NPM_TOKEN` Actions secret. The secret is passed only to credential validation and `bun publish`, and its value is never printed.
- **npm succeeded, GitHub Release failed:** rerun the workflow for the same tag. Matching npm integrity causes publication to be skipped, after which GitHub Release reconciliation resumes.
- **GitHub Release already exists:** a rerun reuses it after npm integrity has been verified.

The final workflow summary records only the tag, commit, package coordinate, and non-secret tarball SHA-256.
