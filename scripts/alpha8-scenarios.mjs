import assert from 'node:assert/strict';
import {readFileSync,renameSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';

export default async function alpha8(a) {
 const {run,service,fixture,git,good,snapshot,counters,packCount,command,w}=a;
 const effects=(f,s)=>({requests:s.state().requests.length,counters:counters(s),npmPacks:packCount(f),cargoPacks:(()=>{try{return readFileSync(f.env.CARGO_PACKAGE_LEDGER,'utf8').trim().split('\n').filter(Boolean).length;}catch{return 0;}})()});
 const setup=async(sync,branches=['main'])=>{
  const s=await service(),f=fixture(s,{mixed:true,branches}),config=structuredClone(f.baseConfig);
  if(sync==='default')delete config.plugins[0][1].synchronizeDependents;else config.plugins[0][1].synchronizeDependents=sync;
  for(const name of ['dual','client']){mkdirSync(join(f.cwd,'crates',name),{recursive:true});renameSync(join(f.cwd,'packages',name,'Cargo.toml'),join(f.cwd,'crates',name,'Cargo.toml'));renameSync(join(f.cwd,'packages',name,'src'),join(f.cwd,'crates',name,'src'));}
  w(f.cwd,'Cargo.toml',readFileSync(join(f.cwd,'Cargo.toml'),'utf8').replace('"crates/core", "packages/*"','"crates/*"'));
  f.commit('isolation.txt','Separate same-name npm and Cargo package roots.\n','feat: isolate mixed ecosystem roots');
  return {s,f,config};
 };
 const versions=(s,expected)=>{for(const [id,version]of Object.entries(expected)){const [eco,name]=id.split(':');assert(s.state()[eco][name]?.[version],id+'@'+version);}};
 const nochange=(f,s,config,branch='main')=>{const before=effects(f,s),source=snapshot(f);good(f.run('alpha8-fresh-nochange',{config,directory:f.clone('alpha8-fresh-nochange',branch)}));assert.deepEqual(effects(f,s),before);assert.deepEqual(snapshot(f),source);return before;};
 for(const sync of ['default',false,true])await run('alpha8-mixed-isolation-synchronize-'+sync,async()=>{
  const {s,f,config}=await setup(sync),source=snapshot(f),empty=effects(f,s);good(f.run('alpha8-dry',{config,dry:true}));assert.deepEqual(snapshot(f),source);assert.deepEqual(effects(f,s),empty);
  good(f.run('alpha8-baseline',{config}));assert.equal(s.state().uploads.length,5);const baseline=s.state().uploads.slice();
  f.commit('packages/dual/index.js','export const value=43;\n','feat: extend npm dual only');const before=effects(f,s),unchanged=snapshot(f);good(f.run('alpha8-npm-dry',{config,dry:true}));assert.deepEqual(effects(f,s),before);assert.deepEqual(snapshot(f),unchanged);good(f.run('alpha8-npm-change',{config}));
  const npmUploads=s.state().uploads.slice(baseline.length);assert.deepEqual(npmUploads,sync===true?['npm:mixed-dual@1.2.0','npm:mixed-client@3.1.1']:['npm:mixed-dual@1.2.0']);assert.equal(s.state().npmTags['mixed-client'].latest,sync===true?'3.1.1':'3.1.0');assert.deepEqual(Object.keys(s.state().cargo['mixed-dual']),['2.1.0']);
  f.commit('crates/core/src/lib.rs','pub fn value()->u32{44}\n','feat: extend Cargo core only');const count=s.state().uploads.length;good(f.run('alpha8-cargo-change',{config}));const cargoUploads=s.state().uploads.slice(count);assert.deepEqual(cargoUploads,sync===true?['cargo:mixed-core@2.2.0','cargo:mixed-client@2.1.1','cargo:mixed-dual@2.1.1']:['cargo:mixed-core@2.2.0']);
  assert.equal(s.state().npmTags['mixed-dual'].latest,'1.2.0');assert.equal(s.state().npmTags['mixed-client'].latest,sync===true?'3.1.1':'3.1.0');assert.equal(s.state().npm['mixed-client'][sync===true?'3.1.1':'3.1.0'].metadata.dependencies['mixed-dual'],sync===true?'1.2.0':'1.1.0');for(const name of ['mixed-dual','mixed-client'])assert.equal(s.state().cargo[name][sync===true?'2.1.1':'2.1.0'].metadata.deps.find(d=>d.name==='mixed-core').version_req,sync===true?'=2.2.0':'=2.1.0');assert.equal(git(f.cwd,'status','--porcelain'),'');const stable=nochange(f,s,config);return {setting:sync,config:config.plugins[0][1],baseline,npmUploads,cargoUploads,stable,uploads:s.state().uploads};
 });
 await run('alpha8-mixed-default-true-divergence-alpha-main-alpha',async()=>{
  const {s,f,config}=await setup('default',['main',{name:'alpha',prerelease:true}]),steps=[];
  const release=(label,nv,cv,branch='main')=>{good(f.run(label,{config}));versions(s,{'npm:mixed-dual':nv,'cargo:mixed-core':cv});assert.equal(s.state().npmTags['mixed-client'].latest,'3.1.0');assert.deepEqual(Object.keys(s.state().cargo['mixed-dual']),['2.1.0']);steps.push({label,head:git(f.cwd,'rev-parse','HEAD'),branch,npm:nv,cargo:cv,effects:effects(f,s)});};
  const change=(n,message)=>{w(f.cwd,'crates/core/src/lib.rs',`pub fn value()->u32{${n}}\n`);f.commit('packages/dual/index.js',`export const value=${n};\n`,message);};
  const merge=(into,from)=>{git(f.cwd,'checkout',into);const first=git(f.cwd,'rev-parse','HEAD'),second=git(f.cwd,'rev-parse',from),ancestor=git(f.cwd,'merge-base',first,second);assert.notEqual(ancestor,first);assert.notEqual(ancestor,second);git(f.cwd,'merge','--no-ff','-m',`chore: merge ${from} into ${into}`,from);git(f.cwd,'push','origin',into);assert.deepEqual(git(f.cwd,'show','-s','--format=%P','HEAD').split(' '),[first,second]);return {head:git(f.cwd,'rev-parse','HEAD'),first,second};};
  release('alpha8-cycle-baseline','1.1.0','2.1.0');f.branch('alpha');change(43,'feat: extend both isolated ecosystems');release('alpha8-cycle-alpha1','1.2.0-alpha.1','2.2.0-alpha.1','alpha');change(44,'fix: refine both isolated ecosystems');release('alpha8-cycle-alpha2','1.2.0-alpha.2','2.2.0-alpha.2','alpha');git(f.cwd,'checkout','main');f.commit('main-notes.txt','Independent stable work.\n','chore: independently advance main');const promotion=merge('main','alpha');release('alpha8-cycle-stable','1.2.0','2.2.0');change(45,'fix: repair stable isolated ecosystems');release('alpha8-cycle-hotfix','1.2.1','2.2.1');git(f.cwd,'checkout','alpha');f.commit('alpha-notes.txt','Independent alpha work.\n','chore: independently advance alpha');const backmerge=merge('alpha','main'),before=effects(f,s);good(f.run('alpha8-cycle-backmerge-nochange',{config}));assert.deepEqual(effects(f,s),before);change(46,'feat: next iteration of isolated ecosystems');release('alpha8-cycle-next1','1.3.0-alpha.1','2.3.0-alpha.1','alpha');change(47,'fix: refine next isolated iteration');release('alpha8-cycle-next2','1.3.0-alpha.2','2.3.0-alpha.2','alpha');const stable=nochange(f,s,config,'alpha');return {steps,promotion,backmerge,backmergeEffects:before,stable,uploads:s.state().uploads};
 });
}
