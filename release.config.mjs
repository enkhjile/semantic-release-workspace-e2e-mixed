const registry = process.env.WORKSPACE_TEST_REGISTRY;
if (!registry || !/^http:\/\/127\.0\.0\.1:\d+$/.test(registry)) {
  throw new Error('Set WORKSPACE_TEST_REGISTRY to a controlled loopback registry; run npm test for the isolated matrix.');
}
export default {
  branches: ['main', {name: 'alpha', prerelease: true}, {name: 'rc', prerelease: true}, 'next'],
  tagFormat: 'workspace-v${version}',
  plugins: [['semantic-release-workspace', {
    changelog: true,
    npm: {registry, trustedPublishing: false, provenance: false},
    cargo: {registry: 'fixture', trustedPublishing: false},
  }]],
};
