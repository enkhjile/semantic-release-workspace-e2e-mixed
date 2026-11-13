# Mixed workspace fixture

The literal `alpha` branch contains a small mixed npm/Cargo workspace with colocated members and a Rust-only core. Every source manifest starts at `0.0.0`. The active `mixed-check.yml` workflow checks the native pnpm dependency link, executes both npm modules, and compiles/tests the Cargo workspace on pull requests and pushes to `alpha`.

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm test
cargo test --workspace --locked --offline
```

Use Node 24.22.1, npm 12.2.1, pnpm 12.15.0 and Rust 1.99.1. This repository has no public publishing workflow or publisher identities. The registry named `fixture` is an inert loopback address used only by the neutral Cargo manifests.

The old independent-version workflows, scripts, dependency pins and remote test refs were retired. Default `main` remains historical; its old manual `acceptance.yml` workflow is disabled. Historical source and refs are preserved in a verified local Git bundle outside this repository.

Separate shared-version controlled acceptance already passed against product candidate `442b7b3ce5d576c0a6bec92a12031bfe1fd24c77`: 24 real semantic-release invocations, nine shared npm/Cargo batches, exact archive verification, partial retry from a fresh clone, dry-run/no-change checks, divergent stable/backmerge cycles, native consumers, and nested/private/excluded discovery. Its compact report, harness, logs and bundles are retained in the acceptance workspace at `tasks/shared-version-2026-11-12/mixed/`. The lightweight checks here do not claim to rerun that release suite or public OIDC acceptance.
