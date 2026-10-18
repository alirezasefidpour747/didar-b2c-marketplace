import {join,resolve} from 'node:path'
import {existsSync} from 'node:fs'
import {json,identity} from './common.mjs'
const dir=resolve(process.argv[2]||'');if(!existsSync(join(dir,'launch.json')))throw Error('Provide exact run evidence directory')
const result={run_id:json(join(dir,'launch.json')).run_id}
for(const name of ['detached-monitor','monitor-identity','supervisor-identity','bootstrap','browser-exit','browser-verdict','parity','cleanup','runner-result','wrapper-exit','supervisor-exit','COMPLETE'])if(existsSync(join(dir,name+'.json')))result[name]=json(join(dir,name+'.json'))
result.observer_liveness={};for(const name of ['monitor-identity','supervisor-identity']){const r=result[name];if(r)for(const [key,who]of Object.entries({observer:r.observer,child:r.child})){const now=who&&identity(who.pid);result.observer_liveness[name+':'+key]=now&&now.state!=='Z'&&now.start_ticks===who.start_ticks&&now.boot_id===who.boot_id?'SAME_LIVE_PROCESS':'NOT_LIVE_OR_IDENTITY_CHANGED'}}
result.verdict=result.COMPLETE?.status==='PASS'?'CONTROLLED_COMPLETION_PASS':result['supervisor-exit']?'FAILED_OR_INCOMPLETE':'PENDING_OR_UNKNOWN';console.log(JSON.stringify(result,null,2))
