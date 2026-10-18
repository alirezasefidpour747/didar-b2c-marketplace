import {spawn} from 'node:child_process'
import {mkdirSync,openSync,closeSync,writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {recordBuild,receipt} from '../../scripts/local/build-receipt.mjs'
const dir=resolve('verification/auth-hardening/builds/'+new Date().toISOString().replace(/[-:.TZ]/g,''))
mkdirSync(dir,{recursive:false})
let failed=false
const stages=[['frozen-install','bun',['install','--frozen-lockfile','--ignore-scripts']],['ingress-syntax','node',['--check','apps/storefront/auth-ingress.mjs']],['backend-build','bun',['run','--cwd','packages/api','build']],['storefront-build','bun',['run','--cwd','apps/storefront','build']]]
for(const [stage,command,args]of stages){
 const fd=openSync(dir+'/'+stage+'.log','w',0o600),start=new Date().toISOString()
 const result=await new Promise(resolveResult=>{const child=spawn(command,args,{cwd:process.cwd(),env:process.env,stdio:['ignore',fd,fd]});let error=null;child.on('error',e=>{error=e.code||'SPAWN_ERROR'});child.on('close',(code,signal)=>resolveResult({stage,command,args,code,signal,error,child_pid:child.pid,observer_pid:process.pid,started_at_utc:start,closed_at_utc:new Date().toISOString()}))})
 closeSync(fd);writeFileSync(dir+'/'+stage+'-exit.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));if(result.code!==0||result.signal||result.error){failed=true;break}
}
if(!failed){recordBuild();writeFileSync(dir+'/build-receipt.json',JSON.stringify(receipt(),null,2)+'\n');console.log('Build receipt recorded from actual successful stages')}
writeFileSync(dir+'/result.json',JSON.stringify({status:failed?'FAIL':'PASS',remaining_stages:failed?'NOT_EXECUTED_AFTER_FAILURE':null,runner_completion:'Observed separately by shell/tool parent'},null,2)+'\n');process.exitCode=failed?1:0
