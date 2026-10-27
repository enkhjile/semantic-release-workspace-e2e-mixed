// New alpha.7 regression controls use the same inherited private-ancestor layout
// as settings-mixed-private-excluded-deepest-colocation and real native Cargo.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';
export default async function alpha7(a){
 const {run,service,fixture,git,good,bad,snapshot,counters,packCount,artifacts,assertRetained,command,w,json}=a;
 for(const failure of ['native-pack','registry-reject'])await run(`alpha7-mixed-nested-${failure}-fresh-clone`,async()=>{
  const s=await service(),f=fixture(s,{mixed:true,count:1});
  const wants={'npm:mixed-deep':'6.1.0','cargo:mixed-deep':'7.1.0','cargo:mixed-core':'2.1.0','cargo:mixed-client':'2.1.0'};
  const parent=JSON.parse(readFileSync(join(f.cwd,'packages/dual/package.json'),'utf8'));parent.private=true;json(f.cwd,'packages/dual/package.json',parent);
  w(f.cwd,'packages/dual/Cargo.toml',readFileSync(join(f.cwd,'packages/dual/Cargo.toml'),'utf8').replace('publish = ["fixture"]','publish = []'));
  w(f.cwd,'pnpm-workspace.yaml','packages:\n  - packages/**\n  - "!packages/excluded"\n');
  w(f.cwd,'Cargo.toml',readFileSync(join(f.cwd,'Cargo.toml'),'utf8').replace('"packages/*"','"packages/*", "packages/dual/nested"').replace('resolver = "3"','exclude = ["packages/excluded"]\nresolver = "3"'));
  for(const [path,name,nv,cv]of [['packages/dual/nested','mixed-deep','6.0.0','7.0.0'],['packages/excluded','mixed-excluded','8.0.0','9.0.0']]){
   json(f.cwd,path+'/package.json',{name,version:nv,type:'module',exports:'./index.js',scripts:parent.scripts,files:['index.js','built.js','CHANGELOG.md']});w(f.cwd,path+'/index.js','export const value=99;\n');
   w(f.cwd,path+'/Cargo.toml',`[package]\nname="${name}"\nversion="${cv}"\nedition="2024"\nlicense="MIT"\ndescription="Mixed deepest package"\npublish=["fixture"]\n`);w(f.cwd,path+'/src/lib.rs','pub fn value()->u32{99}\n');
  }
  git(f.cwd,'add','.');git(f.cwd,'commit','-m','feat: add nested private and excluded mixed layouts');git(f.cwd,'push','origin','HEAD');
  const before=snapshot(f),initial=counters(s);good(f.run('nested-dry',{dry:true}));assert.deepEqual(snapshot(f),before);assert.deepEqual(counters(s),initial);assert.equal(packCount(f),0);
  const marker=join(f.base,'fail-native-deep'),nativeLog=join(f.base,'native-cargo-failure.log');
  if(failure==='native-pack'){
   writeFileSync(marker,'fail');const wrapper=join(f.base,'native-bin/cargo'),native=command(f.cwd,'which',['cargo']);
   const original=readFileSync(wrapper,'utf8');writeFileSync(wrapper,original.replace('exec ',`if [ -f ${JSON.stringify(marker)} ] && grep -q 'name="mixed-deep"' Cargo.toml; then\n exec ${JSON.stringify(native)} "$@" --config 'build.rustflags=["--controlled-invalid-acceptance-flag"]' >> ${JSON.stringify(nativeLog)} 2>&1\nfi\nexec `));
  }else s.control('reject-cargo-deep');
  bad(f.run('nested-partial'),'EWORKSPACEPUBLISH');
  const pending=f.journal();assert.equal(pending.status,'pending');const target=pending.execution.packages.find(p=>p.id==='cargo:mixed-deep');assert(target);assert.equal(!!target.artifact,failure==='registry-reject');assert.equal(target.published,false);
  assert.deepEqual(s.state().uploads,['cargo:mixed-core@2.1.0','cargo:mixed-client@2.1.0']);
  const retained=artifacts(f),plan=pending.planning.plan,earlier=s.state().uploads.slice(),packs=packCount(f),nativeFailure=failure==='native-pack'?readFileSync(nativeLog,'utf8'):undefined;
  if(nativeFailure){assert(nativeFailure.includes('controlled-invalid-acceptance-flag'));unlinkSync(marker);}else s.control('');
  const clone=f.clone('network-fresh-retry');assert.equal(git(clone,'for-each-ref','--format=%(refname)','refs/notes','refs/semantic-release-workspace'),'');good(f.run('nested-retry',{directory:clone}));
  assert.equal(f.journal().status,'complete');assert.deepEqual(f.journal().planning.plan,plan);assertRetained(f,retained);assert.deepEqual(s.state().uploads.slice(0,earlier.length),earlier);assert.equal(new Set(s.state().uploads).size,s.state().uploads.length);assert.equal(s.state().uploads.length,4);assert.equal(packCount(f),packs+1);
  const proof=[];for(const [id,version]of Object.entries(wants)){const [eco,name]=id.split(':'),entry=s.state()[eco][name][version];assert(entry);const bytes=Buffer.from(entry.artifact,'base64'),file=join(f.base,name+(eco==='npm'?'.tgz':'.crate'));writeFileSync(file,bytes);const manifest=command(f.base,'tar',['-xzOf',file,`${eco==='npm'?'package':name+'-'+version}/${eco==='npm'?'package.json':'Cargo.toml'}`]);if(eco==='npm')assert.equal(JSON.parse(manifest).version,version);else assert(manifest.includes(`version = "${version}"`));assert(f.tags().includes(`${eco}/${name}@${version}`));proof.push({id,version,sha256:createHash('sha256').update(bytes).digest('hex'),manifest});}
  assert.deepEqual(snapshot(f).manifests,before.manifests);assert.equal(git(f.cwd,'status','--porcelain'),'');assert.equal(git(clone,'status','--porcelain'),'');
  const done=counters(s),requests=s.state().requests.length,source=snapshot(f);good(f.run('nested-nochange',{directory:f.clone('network-nochange')}));assert.deepEqual(counters(s),done);assert.equal(s.state().requests.length,requests);assert.deepEqual(snapshot(f),source);
  const npmPrepackEvents=readFileSync(f.env.PACK_LEDGER,'utf8').trim().split('\n').map(x=>JSON.parse(x));assert(npmPrepackEvents.every(x=>x.node==='v'+process.versions.node&&x.npmVersion===(process.env.EXPECTED_NPM??'12.2.1')&&x.nonce));
  return {failure,wants,npmPrepackEvents,initialPending:pending,retained,earlierUploads:earlier,uploads:s.state().uploads,nativeFailure,proof};
 });
}
