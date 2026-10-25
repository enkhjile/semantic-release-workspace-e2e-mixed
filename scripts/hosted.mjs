import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {startRegistry} from '../support/registry.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),out=join(root,'evidence','hosted');mkdirSync(out,{recursive:true});
const service=await startRegistry();
const env={...process.env,...service.env,WORKSPACE_TEST_REGISTRY:service.url,CARGO_REGISTRIES_FIXTURE_INDEX:`sparse+${service.url}/cargo/index/`};
for(const k of ['GITHUB_ACTIONS','GITHUB_TOKEN','GH_TOKEN','NPM_TOKEN','NODE_AUTH_TOKEN','NPM_ID_TOKEN','SIGSTORE_ID_TOKEN','ACTIONS_ID_TOKEN_REQUEST_URL','ACTIONS_ID_TOKEN_REQUEST_TOKEN','CRATES_IO_ID_TOKEN','CARGO_REGISTRY_TOKEN'])delete env[k];
const cli=join(root,'node_modules/semantic-release/bin/semantic-release.js');
function cmd(cwd,name,args){const r=spawnSync(name,args,{cwd,env,encoding:'utf8',timeout:240000,maxBuffer:12*1024*1024});assert.equal(r.status,0,`${name}: ${r.stderr||r.stdout||r.error}`);return r.stdout.trim();}
const git=(...args)=>cmd(root,'git',args);
const refs=()=>git('ls-remote','origin');
const bytes=()=>git('ls-files').split('\n').filter(n=>/(package.json|Cargo.toml|lock|CHANGELOG)/.test(n)).map(n=>[n,readFileSync(join(root,n),'utf8')]);
function release(label,{cwd=root,dry=false,esm=false}={}){const r=spawnSync(process.execPath,[cli,'--no-ci',...(dry?['--dry-run']:[])],{cwd,env:{...env,...(esm?{PUBLIC_ESM_RESOLUTION_WORKAROUND:'1'}:{})},encoding:'utf8',timeout:240000,maxBuffer:12*1024*1024});writeFileSync(join(out,label+'.log'),(r.stdout??'')+(r.stderr??''));return r;}
try{
 const before={head:git('rev-parse','HEAD'),refs:refs(),bytes:bytes()};
 const named=release('normal-name',{dry:true});assert.notEqual(named.status,0);assert(((named.stdout??'')+(named.stderr??'')).includes('ERR_PACKAGE_PATH_NOT_EXPORTED'));
 const dry=release('public-esm-dry',{dry:true,esm:true});assert.equal(dry.status,0,dry.stderr);assert.equal(refs(),before.refs);assert.deepEqual(bytes(),before.bytes);assert.equal(service.state().uploads.length,0);
 const actual=release('public-esm-publish',{esm:true});assert.equal(actual.status,0,actual.stderr);assert.deepEqual(bytes(),before.bytes);assert.equal(git('rev-parse','HEAD'),before.head);assert.equal(service.state().uploads.length,5);
 const published=service.state().uploads;const remoteRefs=refs();assert(remoteRefs.includes('refs/tags/npm/mixed-dual@1.1.0'));assert(remoteRefs.includes('refs/tags/cargo/mixed-dual@2.1.0'));assert(remoteRefs.includes('refs/notes/semantic-release-workspace'));assert(remoteRefs.includes('refs/semantic-release-workspace/artifacts/'));
 const clone=mkdtempSync(join(root,'.scenarios','hosted-fresh-'));cmd(root,'git',['clone','--branch','main','https://github.com/enkhjile/semantic-release-workspace-e2e-mixed',clone]);cmd(clone,'git',['config','user.name','Acceptance Fixture']);cmd(clone,'git',['config','user.email','acceptance@example.invalid']);assert.equal(cmd(clone,'git',['for-each-ref','--format=%(refname)','refs/notes','refs/semantic-release-workspace']),'');
 const count=service.state().requests.length;const retry=release('fresh-clone-nochange',{cwd:clone,esm:true});assert.equal(retry.status,0,retry.stderr);assert.equal(service.state().uploads.length,5);assert.equal(service.state().requests.length,count);assert.equal(refs(),remoteRefs);
 const result={artifact:'semantic-release-workspace@1.0.0-alpha.2',normalNamedLoading:'FAIL',diagnostics:'PASS',resolution:'PUBLIC_ESM_RESOLUTION_WORKAROUND',packaging:'NPM11_COMPATIBILITY_WORKAROUND',runtime:{node:process.version,npm:cmd(root,'npm',['--version']),cargo:cmd(root,'cargo',['--version'])},sourceHead:before.head,publicRepository:'https://github.com/enkhjile/semantic-release-workspace-e2e-mixed',publicRegistryUploads:0,controlledUploads:published,remoteRefs:remoteRefs.split('\n'),sourceRestored:true,freshClonePluginFetch:true,nochangeNoWrites:true};
 writeFileSync(join(out,'results.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}finally{await service.close();}
