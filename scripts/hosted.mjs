// Each hosted job runs independent controlled registries and disposable remotes.
// The prior alpha.2 main-ref diagnostic is retained in the acceptance archive.
process.env.EVIDENCE_LABEL ??= 'alpha7/mixed/hosted';
await import('./acceptance.mjs');
