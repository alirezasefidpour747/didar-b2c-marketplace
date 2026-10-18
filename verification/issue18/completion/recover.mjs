import {join,resolve} from 'node:path'
import {existsSync} from 'node:fs'
import {atomic,json,identity,cleanup} from './common.mjs'
const dir=resolve(process.argv[2]||'');if(process.argv[3]!=='--cleanup-only')throw Error('Recovery only permits explicit --cleanup-only')
const launch=json(join(dir,'launch.json'));if(existsSync(join(dir,'COMPLETE.json')))throw Error('Completed run must not be rewritten')
for(const file of ['detached-monitor.json','monitor-identity.json','supervisor-identity.json'])if(existsSync(join(dir,file))){const r=json(join(dir,file));for(const who of [r.identity,r.observer,r.child].filter(Boolean)){const now=identity(who.pid);if(now&&now.state!=='Z'&&now.start_ticks===who.start_ticks&&now.boot_id===who.boot_id)throw Error('Observer/wrapper still live; inspect status instead of concurrent cleanup')}}
const cleaned=await cleanup(dir);atomic(join(dir,'RECOVERED_CLEANUP.json'),{...cleaned,acceptance:'UNKNOWN_OR_FAILED; cleanup is not evidence of browser or wrapper exit zero',browser_exit:existsSync(join(dir,'browser-exit.json'))?json(join(dir,'browser-exit.json')):null},{once:true});console.log('Owned cleanup recorded; no completion PASS or exit status invented')
