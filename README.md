# Mixed ecosystem acceptance

Runs the unmodified npm `semantic-release-workspace@1.0.0-alpha.2` through the normal semantic-release CLI. Uses private controlled npm and sparse Cargo registries; never publishes to public registries. Same-directory npm/Cargo identities have different source versions and share changelogs. Source manifests keep workspace inheritance and protocols.

Run `npm install --ignore-scripts` then `node scripts/acceptance.mjs`. The dispatch-only workflow uses full Git history and a repository-wide release concurrency group. Evidence is JSON plus individual CLI logs.


Named plugin loading is an explicit acceptance check and currently fails for the published alpha.2 artifact (`ERR_PACKAGE_PATH_NOT_EXPORTED`). Diagnostic behavior cases use `PUBLIC_ESM_RESOLUTION_WORKAROUND`: `fileURLToPath(import.meta.resolve('semantic-release-workspace'))` resolves the installed package's public ESM export. This changes consumer configuration only; it does not patch or rebuild alpha.2. The workflow remains red when normal named loading fails, even when diagnostic cases pass.

A separate HTTP-only Sigstore fixture uses pinned mock packages in `support/sigstore-tools`; install it with `npm ci --prefix support/sigstore-tools --ignore-scripts`. Live npm/crates.io OIDC is not established by synthetic fixtures. The mixed repository never publishes to public registries.

The pinned npm 12.2.1 lane also reproduces `EWORKSPACEPUBLISH: npm pack did not produce a valid artifact`: npm 12 returns package-keyed JSON from `npm pack --json`. Native npm 11.21.1 is an explicit compatibility diagnostic lane and does not clear the npm 12 failure. Rust stable is pinned to 1.99.1 after execution-time channel verification.

A controlled wrong-audience GitHub identity response also reaches npm exchange instead of failing locally. Two independent CLI reproductions retain sanitized counters. A supplied `NPM_ID_TOKEN` with the same invalid audience correctly fails before exchange. This tests the client's boundary only; the permissive test registry does not establish live npm acceptance.

The workflow invokes Node directly and verifies `EXPECTED_NODE` / `EXPECTED_NPM`. Using `npm test` prepends local dependency executables and can select semantic-release's transitive npm instead of the native npm installed for a matrix lane. Every result records the actual executable versions.
