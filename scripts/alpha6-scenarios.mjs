// Consumer-level regression cases. Every invocation loads the public package by
// name through the real semantic-release CLI. Only transport/lifecycle failures
// are controlled; no journal or retained artifact is injected into a retry.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync, mkdirSync, renameSync, existsSync} from 'node:fs';
import {join} from 'node:path';

export default async function alpha6(a) {
 const {run,service,fixture,git,good,bad,snapshot,counters,packCount,artifacts,assertRetained,command,w,json,ciFor,startSigstore,servers}=a;
 const commit=(f,message)=>{git(f.cwd,'add','.');git(f.cwd,'commit','-m',message);git(f.cwd,'push','origin','HEAD');};
 const merge=(f,branch)=>{git(f.cwd,'checkout','main');git(f.cwd,'merge','--no-edit',branch);git(f.cwd,'push','origin','main');};
 const archive=(f,s,ecosystem,name,version,path)=>{
  const entry=s.state()[ecosystem][name][version];assert(entry,`${ecosystem}:${name}@${version}`);
  const target=join(f.base,`${ecosystem}-${name}-${version}.archive`);writeFileSync(target,Buffer.from(entry.artifact,'base64'));
  return command(f.base,'tar',['-xzOf',target,`${ecosystem==='npm'?'package':name+'-'+version}/${path}`]);
 };
 const nochange=(f,s,label,branch='main',config)=>{const requests=s.state().requests.length,before=snapshot(f),packs=packCount(f);good(f.run(label,{directory:f.clone(label,branch),config}));assert.equal(s.state().requests.length,requests);assert.equal(packCount(f),packs);assert.deepEqual(snapshot(f),before);};

 // A forwarded invalid supplied Sigstore token would reach the signing service.
 for(const audience of ['wrong-audience',null,['sigstore',42],{aud:'sigstore'}])await run(`alpha6-mixed-supplied-sigstore-${typeof audience==='string'?'wrong':audience===null?'null':Array.isArray(audience)?'mixed-array':'object'}`,async()=>{
  const s=await service(),signing=await startSigstore();servers.push(signing);const f=fixture(s,{mixed:true});s.trusted({head:git(f.cwd,'rev-parse','HEAD')});
  const cfg=structuredClone(f.baseConfig);Object.assign(cfg.plugins[0][1].npm,{trustedPublishing:true,provenance:true,sigstore:signing.config});
  const ci=ciFor(s,f);ci.SIGSTORE_ID_TOKEN=[Buffer.from('{"alg":"RS256"}').toString('base64url'),Buffer.from(JSON.stringify({aud:audience})).toString('base64url'),'fixture-signature'].join('.');
  const before=snapshot(f);good(f.run('supplied-invalid-dry',{dry:true,config:cfg,extraEnv:ci}));assert.deepEqual(snapshot(f),before);assert.equal(s.state().requests.length,0);
  bad(f.run('supplied-invalid',{config:cfg,extraEnv:ci}),'EWORKSPACEPROVENANCE');assert.equal(signing.events().filter(x=>x.startsWith('/api/')).length,0);assert.equal(s.state().uploads.filter(x=>x.startsWith('npm:')).length,0);assert.equal(counters(s).exchanges,0);
  return {audience,signingEvents:[],counters:counters(s)};
 });

 // Versionless development-only paths must disappear from Cargo's normalized
 // archive while runtime/versioned/shared edges and unrelated features survive.
 for(const mode of ['direct','target','inherited','features','versioned','shared'])await run(`alpha6-mixed-cargo-dev-${mode}`,async()=>{
  const s=await service(),f=fixture(s,{mixed:true}),privateHelper=!['versioned','shared'].includes(mode),inherited=['inherited','shared'].includes(mode);
  let root=readFileSync(join(f.cwd,'Cargo.toml'),'utf8').replace('"crates/core"','"crates/*"');
  if(inherited)root+='\nhelper = { package = "mixed-dev-helper", path = "crates/helper" }\n';
  w(f.cwd,'Cargo.toml',root);
  w(f.cwd,'.gitignore',readFileSync(join(f.cwd,'.gitignore'),'utf8')+'\nCargo.lock\n');
  w(f.cwd,'crates/helper/Cargo.toml',`[package]\nname="mixed-dev-helper"\nversion="0.5.0"\nedition="2024"\nlicense="MIT"\ndescription="Controlled dev helper"\npublish=${privateHelper?'[]':'["fixture"]'}\n[features]\nextra=[]\n`);
  w(f.cwd,'crates/helper/src/lib.rs','pub fn value()->u32{42}\n');
  const dep=inherited?'helper.workspace=true\n':`helper={package="mixed-dev-helper",path="../../crates/helper"${mode==='versioned'?',version="=0.5.0"':''}}\n`;
  let dual=readFileSync(join(f.cwd,'packages/dual/Cargo.toml'),'utf8');
  if(mode==='shared')dual+='\nhelper.workspace=true\n';
  dual+=`\n${mode==='target'?"[target.'cfg(unix)'.dev-dependencies]":'[dev-dependencies]'}\n${dep}`;
  if(['features','versioned','shared'].includes(mode))dual+='\n[features]\nlocal=[]\ntest-extra=["helper/extra","local"]\n';
  w(f.cwd,'packages/dual/Cargo.toml',dual);commit(f,'feat: exercise native mixed development dependencies');
  command(f.cwd,'cargo',['test','--workspace','--offline'],f.env);const before=snapshot(f);good(f.run('dev-dry',{dry:true}));assert.deepEqual(snapshot(f),before);assert.equal(s.state().requests.length,0);good(f.run('dev-publish'));
  const manifest=archive(f,s,'cargo','mixed-dual','2.1.0','Cargo.toml');assert(manifest.includes('[dependencies.mixed-core]'));assert(manifest.includes('version = "=2.1.0"'));
  const deps=s.state().cargo['mixed-dual']['2.1.0'].metadata.deps;assert(deps.some(x=>x.name==='mixed-core'&&x.kind==='normal'));
  if(privateHelper){assert(!manifest.includes('mixed-dev-helper'));assert(!deps.some(x=>x.name==='mixed-dev-helper'));assert(!s.state().uploads.some(x=>x.startsWith('cargo:mixed-dev-helper@')));assert(!s.state().requests.some(x=>x.path.includes('/mi/xe/mixed-dev-helper')));}
  if(mode==='features'){assert(manifest.includes('test-extra = ["local"]'));assert(manifest.includes('local = []'));}
  if(mode==='versioned'){assert(manifest.includes('[dev-dependencies.helper]'));assert(manifest.includes('version = "=0.6.0"'));assert(deps.some(x=>x.name==='mixed-dev-helper'&&x.kind==='dev'));}
  if(mode==='shared'){assert(manifest.includes('[dependencies.helper]'));assert(!manifest.includes('[dev-dependencies.helper]'));assert(deps.some(x=>x.name==='mixed-dev-helper'&&x.kind==='normal'));}
  if(['versioned','shared'].includes(mode))assert(manifest.includes('"helper/extra"'));
  assert.deepEqual(snapshot(f).manifests,before.manifests);assert.equal(git(f.cwd,'status','--porcelain'),'');nochange(f,s,'dev-nochange');return {mode,manifest,dependencies:deps,uploads:s.state().uploads};
 });

 await run('alpha6-mixed-planning-only-promotion-rejects-publication',async()=>{
  const s=await service(),f=fixture(s,{mixed:true,branches:['main','next']}),cfg=structuredClone(f.baseConfig);cfg.plugins[0][1].publish=false;
  good(f.run('planning-baseline',{config:cfg}));f.branch('next');f.commit('packages/dual/index.js','export const value=43;\n','feat: plan next mixed API\n\nBREAKING CHANGE: new mixed API');good(f.run('planning-next',{config:cfg}));merge(f,'next');const before=snapshot(f),calls=s.state().requests.length;
  for(const dry of [true,false]){bad(f.run('planning-cannot-publish',{dry}),'EWORKSPACEJOURNAL');assert.deepEqual(snapshot(f),before);assert.equal(s.state().requests.length,calls);}
  good(f.run('planning-promote',{config:cfg}));assert.equal(s.state().uploads.length,0);return {uploads:0,dryAndRealRejected:true};
 });

 for(const failure of ['channel-write','generate-notes'])await run(`alpha6-mixed-frozen-promotion-${failure}`,async()=>{
  const s=await service(),f=fixture(s,{mixed:true,branches:['main','next']});
  const spare=JSON.parse(readFileSync(join(f.cwd,'packages/dual/package.json'),'utf8'));spare.name='mixed-spare';spare.version='4.0.0';json(f.cwd,'packages/spare/package.json',spare);w(f.cwd,'packages/spare/index.js','export const value=42;\n');w(f.cwd,'packages/spare/Cargo.toml','[package]\nname="mixed-spare"\nversion="5.0.0"\nedition="2024"\nlicense="MIT"\ndescription="Independent mixed package"\npublish=["fixture"]\n');w(f.cwd,'packages/spare/src/lib.rs','pub fn value()->u32{42}\n');commit(f,'feat: add independent mixed package');
  good(f.run('frozen-baseline'));f.branch('next');f.commit('packages/dual/index.js','export const value=43;\n','feat: next mixed API\n\nBREAKING CHANGE: new mixed API');good(f.run('frozen-next'));
  git(f.cwd,'checkout','main');f.commit('packages/spare/index.js','export const value=44;\n','feat: newer stable spare');good(f.run('newer-stable'));assert.equal(s.state().npmTags['mixed-spare'].latest,'4.2.0');assert(s.state().cargo['mixed-spare']['5.2.0']);
  let futureBase;if(failure==='generate-notes'){f.commit('packages/spare/index.js','export const value=45;\n','chore: prepare future mixed spare');futureBase=git(f.cwd,'rev-parse','HEAD');}
  merge(f,'next');const before=snapshot(f),uploads=s.state().uploads.length,packs=packCount(f);good(f.run('promotion-dry',{dry:true}));assert.deepEqual(snapshot(f),before);assert.equal(s.state().uploads.length,uploads);assert.equal(packCount(f),packs);
  const cfg=structuredClone(f.baseConfig);if(failure==='channel-write')s.control('reject');else {const hook=join(f.base,'fail-notes.mjs');writeFileSync(hook,'export function generateNotes(){throw new Error("CONTROLLED_NOTES_FAILURE")}\n');cfg.plugins.push(hook);}
  bad(f.run('promotion-interrupted',{config:cfg}),failure==='generate-notes'?'CONTROLLED_NOTES_FAILURE':undefined);assert.equal(s.state().npmTags['mixed-spare'].latest,'4.2.0');
  const ref='refs/notes/workspace-release-channels/'+createHash('sha256').update('main').digest('hex');const pending=JSON.parse(git(f.remote,'notes','--ref='+ref,'show',f.anchor));assert.equal(pending.status,'pending');assert.equal(pending.versions.find(x=>x.id==='npm:mixed-spare').version,'4.2.0');assert.equal(pending.versions.find(x=>x.id==='cargo:mixed-spare').version,'5.2.0');assert.equal(pending.versions.find(x=>x.id==='npm:mixed-dual').version,'2.0.0');
  s.control('');if(futureBase)git(f.cwd,'checkout',futureBase);f.branch(failure==='generate-notes'?'1.x':'future');const future=structuredClone(f.baseConfig);future.branches=failure==='generate-notes'?[{name:'1.x',channel:'future'},'main','next']:['main','next','future'];future.plugins[0][1].releaseRules=[{release:'patch'}];good(f.run('later-release',{config:future}));const finalUploads=s.state().uploads.length,finalPacks=packCount(f),retry=f.clone('network-promotion-retry');assert.equal(git(retry,'for-each-ref','--format=%(refname)','refs/notes','refs/semantic-release-workspace'),'');let missing=0;for(const p of f.journal('next').execution.packages){if(!p.artifact)continue;try{git(retry,'cat-file','-e',p.artifact.commit);}catch{missing++;}}assert(missing>0,'network clone must lack retained artifact objects before plugin fetch');good(f.run('promotion-retry',{directory:retry}));assert.equal(s.state().npmTags['mixed-spare'].latest,'4.2.0');assert.equal(s.state().npmTags['mixed-dual'].latest,'2.0.0');assert.equal(s.state().uploads.length,finalUploads);assert.equal(packCount(f),finalPacks);const complete=JSON.parse(git(f.remote,'notes','--ref='+ref,'show',f.anchor));assert.equal(complete.status,'complete');assert.deepEqual(complete.versions,pending.versions);
  return {failure,pending,complete,missingArtifactObjectsBeforeFetch:missing,uploadsBeforeRetry:finalUploads,uploadsAfterRetry:s.state().uploads.length,packCount:finalPacks};
 });

 // Independent npm/Cargo versions must resume .1 after stable promotion, then .2.
 await run('alpha6-mixed-alpha-main-backmerge-alpha-native-cycle',async()=>{
  const s=await service(),f=fixture(s,{mixed:true,branches:['main',{name:'alpha',prerelease:true}]});good(f.run('cycle-baseline'));f.branch('alpha');f.commit('packages/dual/index.js','export const value=43;\n','feat: extend mixed dual');good(f.run('cycle-alpha1'));f.commit('packages/dual/index.js','export const value=44;\n','fix: refine mixed dual');good(f.run('cycle-alpha2'));assert.equal(s.state().npmTags['mixed-dual'].alpha,'1.2.0-alpha.2');assert(s.state().cargo['mixed-dual']['2.2.0-alpha.2']);merge(f,'alpha');good(f.run('cycle-stable'));assert.equal(s.state().npmTags['mixed-dual'].latest,'1.2.0');assert(s.state().cargo['mixed-dual']['2.2.0']);git(f.cwd,'checkout','alpha');git(f.cwd,'merge','--ff-only','main');git(f.cwd,'push','origin','alpha');
  f.commit('packages/dual/index.js','export const value=45;\n','feat: second mixed dual iteration');good(f.run('cycle-return-alpha1'));assert.equal(s.state().npmTags['mixed-dual'].alpha,'1.3.0-alpha.1');assert.equal(s.state().npmTags['mixed-client'].alpha,'3.1.2-alpha.1');assert(s.state().cargo['mixed-dual']['2.3.0-alpha.1']);
  f.commit('packages/dual/index.js','export const value=46;\n','fix: refine second mixed dual iteration');good(f.run('cycle-return-alpha2'));assert.equal(s.state().npmTags['mixed-dual'].alpha,'1.3.0-alpha.2');assert.equal(s.state().npmTags['mixed-dual'].latest,'1.2.0');assert.equal(s.state().npm['mixed-client']['3.1.2-alpha.2'].metadata.dependencies['mixed-dual'],'1.3.0-alpha.2');assert(s.state().cargo['mixed-dual']['2.3.0-alpha.2']);
  const npm=join(f.base,'cycle-npm-consumer');json(npm,'package.json',{private:true,type:'module'});command(npm,'npm',['install','--ignore-scripts','--no-audit','--no-fund','--registry='+s.url,'mixed-client@3.1.2-alpha.2'],s.env);assert.equal(command(npm,process.execPath,['--input-type=module','-e',"import {value} from 'mixed-client';console.log(value)"]),'42');
  const cargo=join(f.base,'cycle-cargo-consumer');w(cargo,'Cargo.toml','[workspace]\n[package]\nname="cycle-downstream"\nversion="0.1.0"\nedition="2024"\n[dependencies]\nmixed-dual={version="=2.3.0-alpha.2",registry="fixture"}\n');w(cargo,'src/main.rs','fn main(){assert_eq!(mixed_dual::value(),42);println!("42");}\n');w(cargo,'.cargo/config.toml',readFileSync(join(f.cwd,'.cargo/config.toml')));assert.equal(command(cargo,'cargo',['run','--quiet'],s.env),'42');nochange(f,s,'cycle-nochange','alpha');return {uploads:s.state().uploads,tags:s.state().npmTags,cargoVersions:Object.keys(s.state().cargo['mixed-dual'])};
 });

 for(const override of [false,true])await run(`alpha6-mixed-identity-changelogs-converge-split-rejoin${override?'-override':''}`,async()=>{
  const s=await service(),f=fixture(s,{mixed:true});
  const moveCargo=(from,to)=>{mkdirSync(join(f.cwd,to),{recursive:true});renameSync(join(f.cwd,from,'Cargo.toml'),join(f.cwd,to,'Cargo.toml'));renameSync(join(f.cwd,from,'src'),join(f.cwd,to,'src'));w(f.cwd,'Cargo.toml',readFileSync(join(f.cwd,'Cargo.toml'),'utf8').replace(/members = .*/,`members = ["crates/core", "packages/client", "${to}"]`));};
  moveCargo('packages/dual','crates/dual');commit(f,'feat: independent npm and Cargo histories');good(f.run('histories-independent'));const npmFirst=archive(f,s,'npm','mixed-dual','1.1.0','CHANGELOG.md'),cargoFirst=archive(f,s,'cargo','mixed-dual','2.1.0','CHANGELOG.md');assert(npmFirst.includes('npm:mixed-dual@1.1.0'));assert(!npmFirst.includes('cargo:mixed-dual@2.1.0'));assert(cargoFirst.includes('cargo:mixed-dual@2.1.0'));assert(!cargoFirst.includes('npm:mixed-dual@1.1.0'));
  moveCargo('crates/dual','packages/dual');commit(f,'fix: colocate mixed implementations');good(f.run('histories-converged',{directory:f.clone('converge-clone')}));moveCargo('packages/dual','crates/dual');commit(f,'fix: split mixed implementations');good(f.run('histories-split'));f.commit('packages/dual/index.js','export const value=43;\n','fix: independent npm improvement');good(f.run('histories-npm-only'));f.commit('crates/dual/src/lib.rs','pub fn value()->u32{43}\n','fix: independent Cargo improvement');good(f.run('histories-cargo-only'));moveCargo('crates/dual','packages/dual');const source='# Changelog\n\nExplicit source override retained.\n';if(override)w(f.cwd,'packages/dual/CHANGELOG.md',source);commit(f,'fix: reunite mixed implementations');const clone=f.clone('rejoin-clone');good(f.run('histories-reunited',{directory:clone}));
  for(const ecosystem of ['npm','cargo']){const version=ecosystem==='npm'?'1.1.4':'2.1.4',text=archive(f,s,ecosystem,'mixed-dual',version,'CHANGELOG.md');if(override){assert(text.includes('Explicit source override retained.'));assert(!text.includes('## npm:mixed-dual@1.1.0'));assert(!text.includes('## cargo:mixed-dual@2.1.0'));}else for(const [id,versions]of [['npm:mixed-dual',['1.1.0','1.1.1','1.1.2','1.1.3','1.1.4']],['cargo:mixed-dual',['2.1.0','2.1.1','2.1.2','2.1.3','2.1.4']]])for(const v of versions)assert.equal(text.split('## '+id+'@'+v+' (').length-1,1,id+'@'+v);}
  if(override)assert.equal(readFileSync(join(clone,'packages/dual/CHANGELOG.md'),'utf8'),source);else assert(!existsSync(join(clone,'packages/dual/CHANGELOG.md')));assert.equal(git(clone,'status','--porcelain'),'');nochange(f,s,'history-nochange');return {override,uploads:s.state().uploads};
 });
}
