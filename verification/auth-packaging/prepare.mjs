import {spawn} from 'node:child_process'
import {writeFileSync} from 'node:fs'
import {randomBytes} from 'node:crypto'
const stages=[]
for(const [stage,command,args] of [
 ...['package-storefront','verify-package','storefront','health'].map(name=>['syntax-'+name,'node',['--check','scripts/deployment/'+name+'.mjs']]),
 ['shell-syntax','bash',['-n','scripts/build-prepared-images.sh']],
 ['compose-config','docker',['--host=unix:///var/run/docker.sock','compose','config','--quiet']],
 ['inherited-build-receipt','node',['--input-type=module','-e',"import {verifyBuild} from './scripts/local/build-receipt.mjs';verifyBuild()"]],
]) {
 const env={...process.env,DIDAR_SOURCE_SHA:'d9b55b3856d6e52ba86db517430572c2d46761e0',DIDAR_DB_PASSWORD:randomBytes(32).toString('hex'),JWT_SECRET:randomBytes(32).toString('hex'),COOKIE_SECRET:randomBytes(32).toString('hex'),DIDAR_AUTH_NETWORK_KEY:randomBytes(32).toString('hex'),DIDAR_AUTH_TLS_DIR:'/run/not-provisioned-review-tls',DIDAR_AUTH_TLS_SERVER_NAME:'localhost'}
 const result=await new Promise(resolve=>{const p=spawn(command,args,{env,stdio:'inherit'});let error=null;p.on('error',e=>error=e.code);p.on('close',(code,signal)=>resolve({stage,code,signal,error,observed_by:process.pid,child_pid:p.pid,at:new Date().toISOString()}))})
 stages.push(result);if(result.code!==0||result.signal||result.error)break
}
writeFileSync('verification/auth-packaging/PREPARE.json',JSON.stringify({stages,status:stages.length===7&&stages.every(s=>s.code===0&&!s.signal&&!s.error)?'PASS':'FAIL',claims:'Syntax/config and inherited exact compiled receipt only; no image/target runtime verified by this stage.'},null,2)+'\n')
process.exitCode=stages.length===7&&stages.every(s=>s.code===0&&!s.signal&&!s.error)?0:1
