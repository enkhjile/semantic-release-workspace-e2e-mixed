# Mixed ecosystem acceptance

Runs the unchanged registry artifact `semantic-release-workspace@1.0.0-alpha.4` by package name through semantic-release 25.0.9. Native npm 12.2.1 is canonical; Node 24.11.0/npm 11.21.1 is the floor, with current and latest Node matrix lanes. The fourth npm 11 compatibility lane is optional coverage. Rust is pinned to 1.99.1. No ESM or npm packaging workaround is used.

Private controlled npm and sparse Cargo registries publish neutral same-directory npm/Cargo packages with independent versions, inherited Cargo versions, Rust-only core, shared changelogs and native consumers. All identities and signing services are synthetic loopback controls; public registry uploads are zero. Windows/Tauri and hardware are outside scope.

Install with `npm ci --ignore-scripts` and `npm ci --prefix support/sigstore-tools --ignore-scripts`; invoke `node scripts/acceptance.mjs` directly with the intended native npm on PATH. `npm test` changes PATH and can shadow the selected npm with a transitive dependency. The runner asserts expected Node/npm versions and records actual executable paths. A native pnpm lockfile is also retained and verified with frozen installation.

The dispatch-only workflow uses full history and one repository-wide release concurrency group. Every scenario has disposable remotes and registries. Recovery uses ordinary fresh clones and plugin/core fetches; there is no manual journal seeding. Logs, SHA-256 archives, source/ref snapshots, bundles and sanitized request counters are retained per run. Existing alpha.2 failures, bundles and refs remain historical evidence and are not reclassified.

The 86-case suite retains the prior 70 controls and adds independently verified registry JSON-default provenance recovery, 11 strict proof/field mutations, and four default Cargo index cases. Ordinary default-index controls omit any named `crates-io` registry alias; native Cargo uses a source mirror while Node HTTP transport routes the canonical index to the isolated service. A custom-index control requires the published dependency archive to retain its exact registry index.
