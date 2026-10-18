import {spawn} from 'node:child_process'
import {mkdirSync,openSync,closeSync,writeFileSync} from 'node:fs'
const [label,command,...args]=process.argv.slice(2)
if(!label||!command)throw Error('label and command required')
const dir='verification/auth-packaging/commands/'+new Date().toISOString().replace(/[-:.TZ]/g,'')+'-'+label
mkdirSync(dir,{recursive:true});const fd=openSync(dir+'/output.log','w',0o600)
const result=await new Promise(resolve=>{const child=spawn(command,args,{env:process.env,stdio:['ignore',fd,fd]});let error=null;child.on('error',e=>{error=e.code||'SPAWN_ERROR'});child.on('close',(code,signal)=>resolve({label,command,args,code,signal,error,pid:child.pid,observed_by:process.pid,observed_at_utc:new Date().toISOString()}))});closeSync(fd);writeFileSync(dir+'/exit.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));process.exitCode=result.code===0&&!result.signal&&!result.error?0:1
