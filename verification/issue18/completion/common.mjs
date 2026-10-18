import {openSync,closeSync,writeFileSync,readFileSync,renameSync,fsyncSync,appendFileSync,mkdirSync,readdirSync,statSync,existsSync} from 'node:fs'
import {join,relative,resolve} from 'node:path'
import {randomUUID,createHash} from 'node:crypto'
import {spawn,spawnSync} from 'node:child_process'
export const ROOT=resolve(import.meta.dirname,'../../..')
export const EXPECTED={head:'c82f1968616f8c38072d215d54403012a8c9fadc',source:'5b6693e7fa0d079a4f8aca9097e0783361ee361e548d0f9d190ab65ff6bb10bc',outputs:'63639704924cb668d955b6b09ec7b17da048950c0b0d03f6ff78174315704e0b',tests:'ced148cd5776a6d6394f40c60a42f1eeff7c232ad3abb7044a2933deeec98d3a'}
export const json=p=>JSON.parse(readFileSync(p,'utf8'))
export const hash=b=>createHash('sha256').update(b).digest('hex')
export function atomic(path,value,{once=false}={}) {
 if(once&&existsSync(path))throw Error('Refusing to overwrite completed receipt '+path)
 const temp=path+'.'+randomUUID()+'.tmp',fd=openSync(temp,'wx',0o600)
 try{writeFileSync(fd,JSON.stringify(value,null,2)+'\n');fsyncSync(fd)}finally{closeSync(fd)}
 renameSync(temp,path);const dir=openSync(resolve(path,'..'),'r');try{fsyncSync(dir)}finally{closeSync(dir)}
}
export function event(dir,type,details={}){const fd=openSync(join(dir,'events.jsonl'),'a',0o600);try{writeFileSync(fd,JSON.stringify({at:new Date().toISOString(),type,...details})+'\n');fsyncSync(fd)}finally{closeSync(fd)}}
export function capture(cmd,args,options={}){const r=spawnSync(cmd,args,{encoding:'utf8',...options});if(r.error||r.status!==0)throw Error('Command failed: '+cmd+' '+args[0]+'; see owned setup log');return r.stdout.trim()}
export const dockerEnv=()=>Object.fromEntries(Object.entries(process.env).filter(([k])=>!['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH'].includes(k)))
export const docker=(args)=>capture('docker',['--host=unix:///var/run/docker.sock',...args],{env:dockerEnv()})
export function dockerSnapshot(){const ids=docker(['ps','-aq']).split('\n').filter(Boolean);return ids.map(id=>{const d=JSON.parse(docker(['inspect','--format','{"Id":{{json .Id}},"Name":{{json .Name}},"Status":{{json .State.Status}},"Mounts":{{json .Mounts}}}',id]));return {id:d.Id,name:d.Name,status:d.Status,volumes:d.Mounts.filter(m=>m.Type==='volume').map(m=>m.Name).sort()}}).sort((a,b)=>a.id.localeCompare(b.id))}
export function identity(pid){try{const s=readFileSync('/proc/'+pid+'/stat','utf8').split(') ')[1].split(' ');return {pid:Number(pid),state:s[0],ppid:Number(s[1]),pgid:Number(s[2]),start_ticks:s[19],boot_id:readFileSync('/proc/sys/kernel/random/boot_id','utf8').trim()}}catch{return null}}
export function processesInGroup(pgid){return readdirSync('/proc').filter(s=>/^\d+$/.test(s)).map(identity).filter(p=>p&&p.pgid===pgid&&p.state!=='Z')}
export function walk(root,paths){const rows=[];function visit(rel){const name=rel.split('/').at(-1);if(name==='node_modules'||name.startsWith('.env')||['apps/storefront/.next/cache','apps/storefront/.next/standalone','apps/storefront/.next/trace'].includes(rel))return;const p=join(root,rel),s=statSync(p);if(s.isDirectory())for(const n of readdirSync(p).sort())visit(rel+'/'+n);else if(s.isFile())rows.push({path:rel,sha256:hash(readFileSync(p))})}for(const p of [...paths].sort())visit(p);return rows}
export function harnessParity(expected=null){const dir=join(ROOT,'verification/issue18/completion');const files=readdirSync(dir).filter(p=>/\.(mjs|cjs)$/.test(p)).sort().map(path=>({path,sha256:hash(readFileSync(join(dir,path)))}));if(expected&&JSON.stringify(files)!==JSON.stringify(expected))throw Error('Reviewed executable harness changed during run');return {files,aggregate:hash(JSON.stringify(files))}}
export const outputRoots=['packages/api/.medusa/server','apps/storefront/.next','apps/admin/dist','apps/vendor/dist']
export function testParity(root){const expected=json(join(ROOT,'verification/issue18/INDEPENDENT_TEST_SOURCE_SHA256.json'));if(expected.test_files!==50||expected.test_source_aggregate_sha256!==EXPECTED.tests)throw Error('Frozen test manifest changed');const actual=expected.files.map(f=>({path:f.path,sha256:hash(readFileSync(join(root,f.path)))}));if(JSON.stringify(actual)!==JSON.stringify(expected.files))throw Error('Frozen test source differs');const aggregate=hash(JSON.stringify(actual));if(aggregate!==EXPECTED.tests)throw Error('Actual test aggregate differs');return {files:50,aggregate,expected:EXPECTED.tests}}
export function sourceInputs(){return capture('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:ROOT}).split('\0').filter(p=>/^(apps\/|packages\/|bun.lock$|package.json$|scripts\/(build-panels.mjs|prepare-codegen-cache.mjs|mercur-routes.snapshot.json)$)/.test(p)&&existsSync(join(ROOT,p)))}
export function runChild(cmd,args,{dir,stage,cwd,env,log,registry}={}){
 const fd=openSync(log,'a',0o600),child=spawn(cmd,args,{cwd,env,detached:true,stdio:['ignore',fd,fd]});closeSync(fd)
 const who=identity(child.pid);if(who&&registry){registry.processes.push({...who,stage});atomic(join(dir,'resources.json'),registry)}
 event(dir,'child_started',{stage,pid:child.pid,identity:who,command:cmd,args})
 return {child,done:new Promise(resolve=>{let error=null;child.once('error',e=>{error=e.message});child.once('close',(code,signal)=>{const value={run_id:json(join(dir,'launch.json')).run_id,stage,code,signal,error,observed_at:new Date().toISOString(),observer_pid:process.pid,child_pid:child.pid};atomic(join(dir,stage+'-exit.json'),value,{once:true});event(dir,'child_closed',value);resolve(value)})})}
}
export async function checked(cmd,args,opts){const {done}=runChild(cmd,args,opts),r=await done;if(r.code!==0||r.signal||r.error)throw Error(opts.stage+' failed; actual status recorded');return r}
export async function cleanup(dir){const plan=json(join(dir,'resources.json')),launch=json(join(dir,'launch.json')),removed=[],stopped=[];const protectedIds=new Set(plan.protected.map(c=>c.id)),protectedVolumes=new Set(plan.protected.flatMap(c=>c.volumes));
 for(const p of [...plan.processes].reverse()){
  const live=identity(p.pid);if(live&&(live.start_ticks!==p.start_ticks||live.boot_id!==p.boot_id))throw Error('PID identity changed; refusing cleanup')
  let members=processesInGroup(p.pgid);for(const m of members){if(m.boot_id!==p.boot_id||BigInt(m.start_ticks)<BigInt(p.start_ticks))throw Error('Process group identity mismatch');let cwd;try{cwd=readFileSync('/proc/'+m.pid+'/cmdline','utf8')}catch{continue}if(!live){const link=capture('readlink',['/proc/'+m.pid+'/cwd']);if(link!==plan.scratch&&!link.startsWith(plan.scratch+'/'))throw Error('Unowned orphan process group')}}
  if(members.length){try{process.kill(-p.pgid,'SIGTERM')}catch(e){if(e.code!=='ESRCH')throw e}const deadline=Date.now()+8000;while(processesInGroup(p.pgid).length&&Date.now()<deadline)await new Promise(r=>setTimeout(r,100));if(processesInGroup(p.pgid).length){const same=identity(p.pid);if(same&&same.start_ticks!==p.start_ticks)throw Error('PID reused during cleanup');process.kill(-p.pgid,'SIGKILL');for(let n=0;n<30&&processesInGroup(p.pgid).length;n++)await new Promise(r=>setTimeout(r,100))}}
  if(processesInGroup(p.pgid).length)throw Error('Owned process group still live');stopped.push({pid:p.pid,start_ticks:p.start_ticks,pgid:p.pgid,live_members:0})
 }
 for(const c of [...plan.containers].reverse()){
  let d;try{d=JSON.parse(docker(['inspect','--format','{"Id":{{json .Id}},"Name":{{json .Name}},"Labels":{{json .Config.Labels}},"Mounts":{{json .Mounts}}}',c.id||c.name]))}catch{if(c.id)throw Error('Owned container disappeared without cleanup receipt');continue}
  if(protectedIds.has(d.Id)||d.Name!=='/'+c.name||d.Labels?.['didar.issue18.completion']!==launch.run_id||d.Labels?.['didar.disposable-qa']!=='true')throw Error('Container ownership mismatch')
  const volumes=d.Mounts.filter(m=>m.Type==='volume').map(m=>m.Name).sort();if(volumes.some(v=>protectedVolumes.has(v)))throw Error('Refusing protected volume removal');if(c.volumes&&JSON.stringify(volumes)!==JSON.stringify(c.volumes))throw Error('Owned volume identity changed')
  docker(['rm','-fv',d.Id]);for(const v of volumes){const r=spawnSync('docker',['--host=unix:///var/run/docker.sock','volume','inspect',v],{env:dockerEnv(),stdio:'ignore'});if(r.status===0)throw Error('Owned anonymous volume remains')}
  const exists=spawnSync('docker',['--host=unix:///var/run/docker.sock','inspect',d.Id],{env:dockerEnv(),stdio:'ignore'});if(exists.status===0)throw Error('Owned container remains');removed.push({id:d.Id,name:c.name,anonymous_volumes_removed:volumes})
 }
 const now=dockerSnapshot();for(const c of plan.protected){const n=now.find(x=>x.id===c.id);if(JSON.stringify(n)!==JSON.stringify(c))throw Error('Preexisting container/volume/state changed')}
 return {run_id:launch.run_id,status:'PASS',stopped,removed,protected_preserved:plan.protected.length,observed_at:new Date().toISOString()}
}
