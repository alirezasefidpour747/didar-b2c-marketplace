import {cpSync,mkdirSync,readdirSync,symlinkSync,existsSync,readFileSync,writeFileSync,openSync,closeSync,realpathSync} from 'node:fs'
import {join,relative} from 'node:path'
import {randomBytes} from 'node:crypto'
import {pathToFileURL} from 'node:url'
import {ROOT,EXPECTED,json,atomic,event,capture,docker,dockerEnv,dockerSnapshot,identity,walk,outputRoots,testParity,sourceInputs,hash,harnessParity,runChild,checked,cleanup} from './common.mjs'

const dir=process.argv[2],launch=json(join(dir,'launch.json')),runId=launch.run_id,scratch=launch.scratch
const {verifyBuild,receipt}=await import(pathToFileURL(join(ROOT,'scripts/local/build-receipt.mjs')))
const {freePort,waitHTTP}=await import(pathToFileURL(join(ROOT,'scripts/local/runtime.mjs')))
let registry={run_id:runId,scratch,protected:[],containers:[],processes:[]},initialOutputs=[],inputs=[],failed=null,parity=null,cleaned=null
function stage(name,value){atomic(join(dir,name+'.json'),{run_id:runId,...value},{once:true})}
const opts=(stageName,env,cwd=scratch)=>({dir,stage:stageName,env,cwd,log:join(scratch,'.local/completion-setup.log'),registry})
function verifyOriginal(){verifyBuild(ROOT);const receipt=json(join(ROOT,'.local/build-receipt.json'));if(JSON.stringify(receipt)!==JSON.stringify(launch.receipt)||receipt.source!==EXPECTED.source||receipt.outputs!==EXPECTED.outputs)throw Error('Original application receipt changed');return receipt}
function inspectOwned(id){return JSON.parse(docker(['inspect','--format','{"Id":{{json .Id}},"Name":{{json .Name}},"Labels":{{json .Config.Labels}},"Mounts":{{json .Mounts}},"Ports":{{json .NetworkSettings.Ports}}}',id]))}
try{
 verifyOriginal();testParity(ROOT);inputs=sourceInputs()
 const keep=new Set(['apps','packages','scripts','tests','package.json','bun.lock','playwright.config.ts','.gitignore','tsconfig.json','turbo.json'])
 mkdirSync(scratch,{recursive:false,mode:0o700})
 cpSync(ROOT,scratch,{recursive:true,filter:source=>{const r=relative(ROOT,source);if(!r)return true;const p=r.split('/');return keep.has(p[0])&&!p.includes('node_modules')&&!p.some(s=>s.startsWith('.env'))&&!r.startsWith('apps/storefront/.next/cache')&&!r.startsWith('apps/storefront/.next/standalone')&&r!=='apps/storefront/.next/trace'}})
 for(const scope of ['',...readdirSync(join(ROOT,'packages')).map(p=>'packages/'+p),...readdirSync(join(ROOT,'apps')).map(p=>'apps/'+p)])if(existsSync(join(ROOT,scope,'node_modules'))&&existsSync(join(scratch,scope)))symlinkSync(join(ROOT,scope,'node_modules'),join(scratch,scope,'node_modules'),'dir')
 mkdirSync(join(scratch,'.local'),{mode:0o700});writeFileSync(join(scratch,'.local/build-receipt.json'),JSON.stringify(launch.receipt),{mode:0o600})
 verifyBuild(scratch,inputs);testParity(scratch);initialOutputs=walk(scratch,outputRoots);stage('copy-initial',{status:'PASS',receipt:launch.receipt,artifact_files:initialOutputs.length,initial_artifact_manifest_sha256:hash(JSON.stringify(initialOutputs)),tests:testParity(scratch),source_inputs:inputs.length})
 docker(['info','--format','{{.ServerVersion}}']);for(const image of ['postgres:17-alpine','redis:7-alpine'])docker(['image','inspect','--format','{{.Id}}',image])
 registry.protected=dockerSnapshot();atomic(join(dir,'resources.json'),registry);stage('protected-baseline',{status:'RECORDED',containers:registry.protected})
 const ports=[];for(const [kind,image,internal,extra]of[['pg','postgres:17-alpine',5432,['-e','POSTGRES_HOST_AUTH_METHOD=trust','-e','POSTGRES_DB=didar_qa']],['redis','redis:7-alpine',6379,[]]]){
  let port;do{port=await freePort()}while(ports.includes(port));ports.push(port)
  const name='didar-i23-security-'+kind+'-'+runId,c={name,id:null,port,internal,volumes:null};registry.containers.push(c);atomic(join(dir,'resources.json'),registry)
  c.id=docker(['create','--name',name,'--label','didar.disposable-qa=true','--label','didar.issue23.security='+runId,'-p','127.0.0.1:'+port+':'+internal,...extra,image]);const d=inspectOwned(c.id);c.volumes=d.Mounts.filter(m=>m.Type==='volume').map(m=>m.Name).sort();atomic(join(dir,'resources.json'),registry)
  docker(['start',c.id]);const started=inspectOwned(c.id),bindings=started.Ports[internal+'/tcp'];if(!bindings?.length||bindings.some(b=>b.HostIp!=='127.0.0.1'||Number(b.HostPort)!==port))throw Error('Owned service must be loopback-only')
 }
 const pg=registry.containers[0];for(let n=0;;n++){try{docker(['exec',pg.id,'pg_isready','-U','postgres','-d','didar_qa']);break}catch(e){if(n===59)throw e;await new Promise(r=>setTimeout(r,500))}}
 let apiPort,webPort;do{apiPort=await freePort()}while(ports.includes(apiPort));ports.push(apiPort);do{webPort=await freePort()}while(ports.includes(webPort));const api='http://127.0.0.1:'+apiPort,web='http://127.0.0.1:'+webPort
 const env={...process.env,DIDAR_DISPOSABLE_QA:'true',NODE_ENV:'development',DIDAR_ENVIRONMENT:'local',DIDAR_PAYMENT_MODE:'sandbox',DIDAR_AGENCY_MODE:'sandbox',DIDAR_SEED_DEMO:'true',DATABASE_URL:'postgres://postgres@127.0.0.1:'+pg.port+'/didar_qa',REDIS_URL:'redis://127.0.0.1:'+registry.containers[1].port,JWT_SECRET:randomBytes(32).toString('hex'),COOKIE_SECRET:randomBytes(32).toString('hex'),STORE_CORS:web,ADMIN_CORS:api,VENDOR_CORS:api,AUTH_CORS:web+','+api,FILE_BACKEND_URL:api+'/static',MERCUR_BACKEND_URL:'same-origin',MEDUSA_BACKEND_URL:api,DIDAR_PUBLIC_ORIGIN:'https://shop.didar-gold.ir',DIDAR_PUBLIC_ORIGIN_VERIFIED:'true',TEST_API_URL:api,TEST_STOREFRONT_URL:web,MERCUR_DISABLE_TELEMETRY:'true',NEXT_TELEMETRY_DISABLED:'1',CHROMIUM_PATH:process.env.CHROMIUM_PATH||'/usr/bin/chromium',PLAYWRIGHT_NO_SANDBOX:'1',ISSUE18_COMPLETION_RUN_DIR:dir,ISSUE18_COMPLETION_RUN_ID:runId}
 stage('origins',{api,web,loopback_only:true})
 await checked('bun',['run','db:setup'],opts('schema-and-demo-seed',env))
 await checked('bun',['run','--cwd','packages/api','medusa','exec','./src/scripts/native-qa-seed.ts'],opts('native-qa-seed',env))

 const apiService=runChild('node',[join(scratch,'packages/api/node_modules/@medusajs/cli/cli.js'),'start','--host','127.0.0.1','--port',String(apiPort)],{...opts('api', {...env,NODE_ENV:'production'},join(scratch,'packages/api/.medusa/server')),log:join(scratch,'.local/completion-api.log')})
 await waitHTTP(api+'/health',async r=>await r.text()==='OK')
 const webService=runChild('bun',['run','--cwd','apps/storefront','start','--hostname','127.0.0.1','--port',String(webPort)],{...opts('web',{...env,NODE_ENV:'production'}),log:join(scratch,'.local/completion-web.log')})
 await waitHTTP(web+'/api/didar/catalog',async r=>Array.isArray((await r.json()).products))
 const {probe}=await import('./native-target-probe.mjs');await probe({api,web,dir,runId,pg,root:ROOT,docker});
 stage('probe-verdict',{status:'PASS',meaning:'Native referenced-target baseline defects reproduced; not corrected acceptance'})
}catch(e){failed={message:e.message,at:new Date().toISOString()};event(dir,'runner_failure',failed)}finally{
 try{const original=verifyOriginal(),tests=testParity(ROOT),copyTests=existsSync(scratch)?testParity(scratch):null;let copied={status:'NOT_CREATED'}
 if(initialOutputs.length){const after=walk(scratch,outputRoots),before=new Map(initialOutputs.map(f=>[f.path,f.sha256])),now=new Map(after.map(f=>[f.path,f.sha256]));const copiedReceipt=receipt(scratch,inputs);if(copiedReceipt.source!==EXPECTED.source)throw Error('Copied application source changed');const changed=initialOutputs.filter(f=>now.get(f.path)!==f.sha256),added=after.filter(f=>!before.has(f.path));if(changed.length)throw Error('Copied initial production artifact modified/deleted');if(added.some(f=>!f.path.startsWith('packages/api/.medusa/server/static/')||/\.(?:[cm]?js|[cm]?ts|json|html|wasm|node|sh)$/i.test(f.path)))throw Error('Unexpected executable/artifact addition');copied={status:'PASS',initial_files_unchanged:initialOutputs.length,initial_manifest_sha256:hash(JSON.stringify(initialOutputs)),final_initial_file_manifest_sha256:hash(JSON.stringify(initialOutputs.map(f=>({path:f.path,sha256:now.get(f.path)})))),source:copiedReceipt.source,complete_outputs_after_runtime:copiedReceipt.outputs,runtime_upload_additions:added}}
 parity={run_id:runId,status:'PASS',initial:launch.receipt,final:original,original_initial_equals_final:true,tests,copy_tests:copyTests,copied};stage('parity',parity)
 }catch(e){parity={run_id:runId,status:'FAIL',message:e.message};stage('parity',parity);failed??={message:e.message}}
 try{cleaned=await cleanup(dir);stage('cleanup',cleaned)}catch(e){cleaned={run_id:runId,status:'FAIL',message:e.message};stage('cleanup',cleaned);failed??={message:e.message}}
 const success=!failed&&existsSync(join(dir,'probe-verdict.json'))&&parity?.status==='PASS'&&cleaned?.status==='PASS';stage('runner-result',{status:success?'PASS':'FAIL',failure:failed,parity:parity?.status,cleanup:cleaned?.status,exit_code:'NOT_YET_OBSERVED_BY_PARENT'});process.exitCode=success?0:1
}
