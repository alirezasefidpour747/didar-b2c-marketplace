import {join} from 'node:path'
import {openSync,closeSync,existsSync} from 'node:fs'
import {spawn} from 'node:child_process'
import {atomic,event,json,identity,cleanup,harnessParity} from './common.mjs'
const [role,dir]=process.argv.slice(2),launch=json(join(dir,'launch.json'))
if(!['monitor','supervisor'].includes(role))throw Error('Explicit observer role required')
const childArgs=role==='monitor'?[join(import.meta.dirname,'observer.mjs'),'supervisor',dir]:[join(import.meta.dirname,'runner.mjs'),dir]
const fd=openSync(join(dir,role==='monitor'?'supervisor.log':'runner.log'),'a',0o600)
const child=spawn(process.execPath,childArgs,{cwd:launch.root,env:process.env,detached:true,stdio:['ignore',fd,fd]});closeSync(fd)
atomic(join(dir,role+'-identity.json'),{run_id:launch.run_id,observer:identity(process.pid),child:identity(child.pid)},{once:true});event(dir,role+'_child_started',{pid:child.pid})
let spawnError=null;child.once('error',e=>{spawnError=e.message})
child.once('close',async(code,signal)=>{
 const receipt={run_id:launch.run_id,observer_role:role,observer_pid:process.pid,observed_child_pid:child.pid,observed_exit_code:code,observed_signal:signal,spawn_error:spawnError,at:new Date().toISOString()}
 atomic(join(dir,role==='supervisor'?'wrapper-exit.json':'supervisor-exit.json'),receipt,{once:true});event(dir,role+'_observed_close',receipt)
 let ok=code===0&&signal===null&&!spawnError
 try{
  if(!ok)throw Error('Actual observed child exit is not zero/no-signal')
  harnessParity(launch.harness_files)
  const result=json(join(dir,'runner-result.json')),parity=json(join(dir,'parity.json')),cleanupResult=json(join(dir,'cleanup.json')),browser=json(join(dir,'browser-exit.json')),verdict=json(join(dir,'browser-verdict.json'))
  for(const r of [result,parity,cleanupResult,browser,verdict])if(r.run_id!==launch.run_id)throw Error('Receipt run ID differs')
  if(result.status!=='PASS'||parity.status!=='PASS'||cleanupResult.status!=='PASS'||browser.code!==0||browser.signal!==null||verdict.status!=='PASS'||verdict.tests!==32)throw Error('A completion stage is not PASS')
  if(role==='monitor'){const wrapped=json(join(dir,'wrapper-exit.json'));if(wrapped.run_id!==launch.run_id||wrapped.observed_exit_code!==0||wrapped.observed_signal!==null)throw Error('Wrapper actual exit notzero');atomic(join(dir,'COMPLETE.json'),{run_id:launch.run_id,status:'PASS',browser_exit_code:browser.code,wrapper_exit_code:wrapped.observed_exit_code,supervisor_exit_code:code,parity:'PASS',cleanup:'PASS',at:new Date().toISOString(),monitor_self_exit:'NOT_OBSERVED_OR_REQUIRED'},{once:true})}
 }catch(e){ok=false;event(dir,role+'_completion_rejected',{message:e.message})}
 if(!ok&&role==='supervisor'&&!existsSync(join(dir,'cleanup.json'))){try{atomic(join(dir,'emergency-cleanup.json'),await cleanup(dir),{once:true})}catch(e){atomic(join(dir,'emergency-cleanup.json'),{run_id:launch.run_id,status:'FAIL',message:e.message},{once:true})}}
 process.exitCode=ok?0:1
})
