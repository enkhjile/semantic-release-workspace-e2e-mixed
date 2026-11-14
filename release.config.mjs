const registry = process.env.MIXED_CONTROLLED_REGISTRY;
if (!registry || new URL(registry).hostname !== '127.0.0.1') throw new Error('This test lane only publishes to its controlled loopback registry');
export default {branches:['main',{name:'alpha',prerelease:'alpha',channel:'alpha'}],tagFormat:'workspace-v${version}',plugins:[['semantic-release-workspace',{publish:true,changelog:true,npm:{registry,access:'public',trustedPublishing:false,provenance:false},cargo:{registry:'fixture',trustedPublishing:false}}]]};
