import {fork} from 'node:child_process';
import {once} from 'node:events';
import {mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
export async function startSigstore(){
 const root=mkdtempSync(join(tmpdir(),'consumer-sigstore-'));
 const server=fork(fileURLToPath(new URL('./sigstore-tools/sigstore-server.mjs',import.meta.url)),[root],{stdio:['ignore','ignore','inherit','ipc']});
 const url=await new Promise((resolve,reject)=>{server.once('message',resolve);server.once('error',reject);server.once('exit',code=>reject(Error(`Sigstore exited ${code}`)));});
 return {root,url,config:{fulcioURL:url,rekorURL:url,tufMirrorURL:url+'/tuf',tufRootPath:join(root,'root.json')},events:()=>JSON.parse(readFileSync(join(root,'events.json'),'utf8')),control:value=>writeFileSync(join(root,'control'),value),async close(){if(server.exitCode!==null)return;const done=once(server,'exit');server.kill();await done;}};
}
