/** Independent G4 review probe. Own isolated PG/Redis + copied compiled artifact.
 * No owner configuration, deployment, original volume or application source mutation.
 * Usage: node verification/issue18/probes/projection-independent.mjs
 * Requires a current compiled packages/api/.medusa/server and local Docker.
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { createServer } from 'node:net'

const root = resolve(process.env.DIDAR_REVIEW_REPO || '.')
const requireAPI = createRequire(join(root, 'packages/api/package.json'))
const { Pool } = requireAPI('pg')
const artifact = join(root, 'packages/api/.medusa/server')
assert(existsSync(join(artifact, 'src/didar/projection.js')), 'Compile the reviewed source before the independent probe')
const work = mkdtempSync(join(process.env.DIDAR_REVIEW_WORK || tmpdir(), 'didar-issue18-core-'))
const copy = join(work, 'api')
cpSync(artifact, copy, { recursive: true })
symlinkSync(join(root, 'packages/api/node_modules'), join(copy, 'node_modules'), 'dir')
const suffix = randomBytes(6).toString('hex')
const pgName = `didar-core-g4-pg-${suffix}`, redisName = `didar-core-g4-redis-${suffix}`
const names = [], children = new Set()
const records = []
const log = join(work, 'G4_INDEPENDENT.log')
const receipt = join(work, 'G4_RECEIPT.json')
let pool
function record(name, facts) {
  const row = { name, ...facts }
  records.push(row)
  const line = JSON.stringify(row)
  writeFileSync(log, line + '\n', { flag: 'a' })
  console.log(line)
}
function capture(cmd, args, options={}) {
  const r = spawnSync(cmd, args, { encoding:'utf8', ...options })
  if (r.error || r.status !== 0) throw Error(`${cmd} ${args[0]} failed; inspect ${work}`)
  return r.stdout.trim()
}
async function freePort() {
  const s=createServer(); await new Promise(r=>s.listen(0,'127.0.0.1',r))
  const p=s.address().port; await new Promise(r=>s.close(r)); return p
}
const delay=ms=>new Promise(r=>setTimeout(r,ms))
async function waitFor(fn, description, timeout=90000) {
  const until=Date.now()+timeout
  while(Date.now()<until) { if(await fn()) return; await delay(100) }
  throw Error(`Timeout: ${description}`)
}
let env
const cli=join(root,'packages/api/node_modules/@medusajs/cli/cli.js')
async function run(args, filename, extra={}) {
  const file=join(work,filename)
  const child=spawn(process.execPath,[cli,...args],{cwd:copy,env:{...env,...extra},detached:true,stdio:['ignore','pipe','pipe']})
  children.add(child)
  child.stdout.on('data',b=>writeFileSync(file,b,{flag:'a'}))
  child.stderr.on('data',b=>writeFileSync(file,b,{flag:'a'}))
  const complete=new Promise((resolve,reject)=>{
    child.once('error',reject)
    child.once('exit',(code,signal)=>{children.delete(child);resolve({code,signal})})
  })
  return {child,complete,file}
}
async function successful(args, filename, extra={}) {
  const p=await run(args,filename,extra), status=await p.complete
  assert.equal(status.code,0,`Command failed: ${filename}`)
  return p
}
const worker=join(work,'worker.js')
writeFileSync(worker,`const fs=require('node:fs');
const {createRequire}=require('node:module');
const req=createRequire(process.env.DIDAR_G4_COPY+'/package.json');
exports.default=async function({container}) {
 const {db,transaction,afterCommit}=req('./src/didar/db.js');
 const {runProductProjections,reconcileProductProjection}=req('./src/didar/projection.js');
 const id=process.env.DIDAR_G4_ID,mode=process.env.DIDAR_G4_MODE;
 try {
  if(mode==='api-key') {
   const {createApiKeysWorkflow}=req('@medusajs/medusa/core-flows');
   const {result}=await createApiKeysWorkflow(container).run({input:{api_keys:[{title:'Independent G4 public read',type:'publishable',created_by:'independent-review'}]}});
   fs.writeFileSync(process.env.DIDAR_G4_KEYFILE,result[0].token,{mode:0o600});
  } else if(mode==='partial-native') {
   const p=(await db.query('SELECT * FROM didar_product WHERE id=$1',[id])).rows[0];
   const {createProductsWorkflow}=req('@medusajs/medusa/core-flows');
   await createProductsWorkflow(container).run({input:{products:[{id:p.native_id,title:'Partial native committed step',handle:'didar-'+p.id,status:'draft',metadata:{didar:true,didar_master_id:p.id},options:[{title:'__default__',values:['__default__']}]}]}});
  } else if(mode==='canonical-failure') {
   let failed=false;
   try { await transaction(async c=>{await c.query("INSERT INTO didar_product(id,title,category,description,purity,active,published,approved) VALUES($1,'Must rollback','QA','',750,true,false,false)",[id]);afterCommit(c,()=>runProductProjections(container,{productId:id,limit:1}));}); }
   catch(e){failed=true;if(!String(e.message).includes('G4_CANONICAL_COMMIT_FAILURE'))throw e;}
   if(!failed)throw Error('COMMIT did not fail');
  } else if(mode==='ack-failure') {
   let failed=false;try {await runProductProjections(container,{productId:id,limit:1});}catch(e){failed=true;if(!String(e.message).includes('G4_ACK_COMMIT_FAILURE'))throw e;}
   if(!failed)throw Error('Ack COMMIT did not fail');
  } else if(mode==='terminal') {
   for(let n=0;n<5;n++) {await db.query("UPDATE didar_product_projection_job SET available_at=now() WHERE product_id=$1",[id]);await runProductProjections(container,{productId:id,limit:1});}
  } else if(mode==='reconcile') {
   await reconcileProductProjection(id);await runProductProjections(container,{productId:id,limit:1});
  } else if(mode==='post-native-failure') {
   await runProductProjections(container,{productId:id,limit:1,afterNative:async()=>{throw Error('INDEPENDENT_ACK_PATH_FAILURE')}});
  } else if(mode==='crash') {
   await runProductProjections(container,{productId:id,limit:1,afterNative:async(p,r)=>{fs.writeFileSync(process.env.DIDAR_G4_MARKER,JSON.stringify({native_id:p.native_id,revision:r,pid:process.pid}));await new Promise(()=>{});}});
  } else {await runProductProjections(container,{productId:id,limit:1});}
 } finally {await db.end();}
 console.log('G4_WORKER_COMPLETE '+mode);
};`)
const query=(sql,values=[])=>pool.query(sql,values)
async function state(id) {
 return (await query(`SELECT p.id,p.native_id,p.title,s.source_revision::text,s.projected_revision::text,j.status,j.attempts,
  n.title native_title,n.status native_status,n.metadata,(SELECT count(*)::int FROM product x WHERE x.id=p.native_id) native_count
  FROM didar_product p JOIN didar_product_projection s ON s.product_id=p.id
  JOIN didar_product_projection_job j ON j.product_id=p.id AND j.revision=s.source_revision
  LEFT JOIN product n ON n.id=p.native_id WHERE p.id=$1`,[id])).rows[0]
}
const nativeCounts=async id=>Number((await query('SELECT count(*) n FROM product WHERE id=$1',[id])).rows[0].n)
async function fixture(id,title='Independent source') {
 await query("INSERT INTO didar_product(id,title,category,description,purity,active,published,approved) VALUES($1,$2,'QA','private QA',750,true,false,false)",[id,title])
 return state(id)
}
async function workerRun(id,mode='normal',filename=mode+'.log') {
 return successful(['exec',worker],filename,{DIDAR_G4_ID:id,DIDAR_G4_MODE:mode})
}
try {
 const pgPort=await freePort(), redisPort=await freePort(), apiPort=await freePort()
 for(const [name,image,port,inner,args] of [
  [pgName,'postgres:17-alpine',pgPort,5432,['-e','POSTGRES_HOST_AUTH_METHOD=trust','-e','POSTGRES_DB=didar_qa']],
  [redisName,'redis:7-alpine',redisPort,6379,[]]]) {
  capture('docker',['run','-d','--name',name,'--label','didar.disposable-qa=true','--label','didar.review=issue18-core','-p',
    '127.0.0.1:'+port+':'+inner,...args,image]);names.push(name)
 }
 await waitFor(async()=>spawnSync('docker',['exec',pgName,'pg_isready','-U','postgres','-d','didar_qa'],{stdio:'ignore'}).status===0,'independent PG ready')
 const origin='http://127.0.0.1:'+apiPort
 env={...process.env,NODE_ENV:'production',DIDAR_ENVIRONMENT:'local',DIDAR_PAYMENT_MODE:'sandbox',DIDAR_SEED_DEMO:'false',DIDAR_DISPOSABLE_QA:'true',
  DATABASE_URL:'postgres://postgres@127.0.0.1:'+pgPort+'/didar_qa',REDIS_URL:'redis://127.0.0.1:'+redisPort,
  JWT_SECRET:randomBytes(32).toString('hex'),COOKIE_SECRET:randomBytes(32).toString('hex'),
  STORE_CORS:origin,ADMIN_CORS:origin,VENDOR_CORS:origin,AUTH_CORS:origin,FILE_BACKEND_URL:origin+'/static',
  MERCUR_BACKEND_URL:'same-origin',MERCUR_DISABLE_TELEMETRY:'true',DIDAR_G4_COPY:copy}
 delete env.DIDAR_PROJECTION_RECONCILE_ID
 await successful(['db:migrate'],'native-migrate.log')
 await successful(['exec','./src/scripts/didar-seed.js'],'didar-migrate.log')
 pool=new Pool({connectionString:env.DATABASE_URL,max:5})
 assert.equal(Number((await query('SELECT count(*) n FROM didar_sale_mandate')).rows[0].n),0)
 record('G4_ISOLATION',{postgres:'17',redis:'7',copied_compiled_api:true,non_demo_mandates:0,owner_access:false})

 const crash='g4-crash-'+suffix
 const queued=await fixture(crash), marker=join(work,'native-committed.json')
 const child=await run(['exec',worker],'native-commit-kill.log',{DIDAR_G4_ID:crash,DIDAR_G4_MODE:'crash',DIDAR_G4_MARKER:marker})
 await waitFor(async()=>existsSync(marker),'native commit before ack')
 const nativeMarker=JSON.parse(readFileSync(marker,'utf8'))
 assert.equal(await nativeCounts(queued.native_id),1)
 assert.equal((await state(crash)).status,'PENDING')
 let editDone=false
 const blockedEdit=query("UPDATE didar_product SET title='Latest committed after killed worker' WHERE id=$1",[crash]).then(()=>{editDone=true})
 await delay(150);assert.equal(editDone,false,'Source edit must wait for active projector source lock')
 process.kill(-child.child.pid,'SIGKILL')
 const killed=await child.complete
 assert.equal(killed.signal,'SIGKILL')
 await blockedEdit
 await workerRun(crash,'normal','native-kill-restart.log')
 const repaired=await state(crash)
 assert.equal(repaired.status,'DONE');assert.equal(repaired.native_count,1)
 assert.equal(repaired.native_id,nativeMarker.native_id)
 assert.equal(repaired.projected_revision,repaired.source_revision)
 assert.equal(repaired.native_title,'Latest committed after killed worker')
 record('G4_REAL_SIGKILL_AFTER_NATIVE_COMMIT',{status:'PASS',native_count:repaired.native_count,stable_native_id:true,concurrent_edit_blocked_until_kill:true,source_revision:repaired.source_revision,projected_revision:repaired.projected_revision})

 const canonical='g4-commit-'+suffix
 await query(`CREATE FUNCTION g4_canonical_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.id LIKE 'g4-commit-%' THEN RAISE EXCEPTION 'G4_CANONICAL_COMMIT_FAILURE'; END IF; RETURN NULL; END $$;
 CREATE CONSTRAINT TRIGGER g4_canonical_fail AFTER INSERT ON didar_product DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION g4_canonical_fail()`)
 await workerRun(canonical,'canonical-failure','canonical-final-commit-failure.log')
 assert.equal(Number((await query('SELECT count(*) n FROM didar_product WHERE id=$1',[canonical])).rows[0].n),0)
 assert.equal(Number((await query('SELECT count(*) n FROM didar_product_projection_job WHERE product_id=$1',[canonical])).rows[0].n),0)
 const canonicalNative='prod_didar_'+createHash('md5').update(canonical).digest('hex')
 assert.equal(await nativeCounts(canonicalNative),0)
 await query('DROP TRIGGER g4_canonical_fail ON didar_product; DROP FUNCTION g4_canonical_fail()')
 record('G4_FINAL_CANONICAL_COMMIT_FAILURE',{status:'PASS',canonical_rows:0,jobs:0,native_rows:0})

 const ack='g4-ack-'+suffix
 const ackInitial=await fixture(ack)
 await query(`CREATE FUNCTION g4_ack_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.product_id LIKE 'g4-ack-%' AND NEW.status='DONE' THEN RAISE EXCEPTION 'G4_ACK_COMMIT_FAILURE'; END IF; RETURN NULL; END $$;
 CREATE CONSTRAINT TRIGGER g4_ack_fail AFTER UPDATE ON didar_product_projection_job DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION g4_ack_fail()`)
 await workerRun(ack,'ack-failure','ack-final-commit-failure.log')
 assert.equal(await nativeCounts(ackInitial.native_id),1);assert.equal((await state(ack)).status,'PENDING')
 await query('DROP TRIGGER g4_ack_fail ON didar_product_projection_job; DROP FUNCTION g4_ack_fail()')
 await workerRun(ack,'normal','ack-commit-restart.log')
 assert.equal((await state(ack)).status,'DONE');assert.equal((await state(ack)).native_count,1)
 record('G4_FINAL_ACK_COMMIT_FAILURE',{status:'PASS',native_survives:true,replay_same_id:true,native_count:1})

 const terminal='g4-terminal-'+suffix
 await fixture(terminal)
 await query(`CREATE FUNCTION g4_native_write_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.id=(SELECT native_id FROM didar_product WHERE id='${terminal}') THEN RAISE EXCEPTION 'G4_ACTUAL_NATIVE_DATABASE_FAILURE'; END IF; RETURN NEW; END $$;
 CREATE TRIGGER g4_native_write_fail BEFORE INSERT ON product FOR EACH ROW EXECUTE FUNCTION g4_native_write_fail()`)
 await workerRun(terminal,'terminal','bounded-retry-terminal.log')
 const failed=await state(terminal)
 assert.equal(failed.status,'FAILED');assert.equal(failed.attempts,5);assert.equal(failed.native_count,0)
 await query('DROP TRIGGER g4_native_write_fail ON product; DROP FUNCTION g4_native_write_fail()')
 await workerRun(terminal,'normal','terminal-not-auto-resurrected.log')
 assert.equal((await state(terminal)).status,'FAILED')
 await workerRun(terminal,'reconcile','explicit-reconcile.log')
 assert.equal((await state(terminal)).status,'DONE');assert.equal((await state(terminal)).native_count,1)
 record('G4_TERMINAL_AND_OPERATOR_REPAIR',{status:'PASS',bounded_attempts:5,actual_native_workflow_database_failure:true,terminal_not_auto_retried:true,explicit_repair:true})

 const forward='g4-forward-'+suffix
 await fixture(forward)
 await workerRun(forward,'post-native-failure','forward-ack-error.log')
 assert.equal((await state(forward)).status,'RETRY');assert.equal((await state(forward)).native_count,1)
 await query('UPDATE didar_product_projection_job SET available_at=now() WHERE product_id=$1',[forward])
 await workerRun(forward,'normal','forward-retry-repair.log')
 assert.equal((await state(forward)).status,'DONE');assert.equal((await state(forward)).native_count,1)
 record('G4_COMPENSATION_REMOVED_FORWARD_REPAIR',{status:'PASS',native_preserved_after_error:true,inverse_writer:false,retry_repairs_same_id:true})

 const revisions='g4-revisions-'+suffix
 await fixture(revisions,'rev1')
 await Promise.all([query("UPDATE didar_product SET title='concurrentA' WHERE id=$1",[revisions]),query("UPDATE didar_product SET title='concurrentB' WHERE id=$1",[revisions])])
 await query("UPDATE didar_product SET title='latest deterministic' WHERE id=$1",[revisions])
 await workerRun(revisions,'normal','reordered-revisions.log')
 const latest=await state(revisions)
 assert.equal(latest.source_revision,'4');assert.equal(latest.projected_revision,'4')
 assert.equal(latest.native_title,'latest deterministic');assert.equal(latest.metadata.didar_projection_revision,'4')
 const jobs=(await query('SELECT revision::text,status FROM didar_product_projection_job WHERE product_id=$1 ORDER BY revision',[revisions])).rows
 assert.deepEqual(jobs.map(x=>x.status),['SUPERSEDED','SUPERSEDED','SUPERSEDED','DONE'])
 await workerRun(revisions,'normal','stale-redelivery.log')
 assert.equal((await state(revisions)).native_count,1)
 record('G4_CONCURRENT_AND_STALE_REVISIONS',{status:'PASS',source_revision:4,projected_revision:4,jobs,native_count:1})

 const partial='g4-partial-'+suffix
 await fixture(partial)
 await workerRun(partial,'partial-native','partial-native-step.log')
 const partialID=(await state(partial)).native_id
 assert.equal(Number((await query('SELECT count(*) n FROM product_variant WHERE product_id=$1 AND deleted_at IS NULL',[partialID])).rows[0].n),0)
 await workerRun(partial,'normal','partial-native-forward-repair.log')
 assert.equal((await state(partial)).status,'DONE')
 assert.equal(Number((await query('SELECT count(*) n FROM product_variant WHERE product_id=$1 AND deleted_at IS NULL',[partialID])).rows[0].n),1)
 await workerRun(partial,'normal','partial-native-redelivery.log')
 assert.equal(Number((await query('SELECT count(*) n FROM product_variant WHERE product_id=$1 AND deleted_at IS NULL',[partialID])).rows[0].n),1)
 record('G4_PARTIAL_NATIVE_WORKFLOW_RECOVERY',{status:'PASS',original_native_workflow:true,variants_before:0,variants_after:1,stable_native_id:true})

 // Production HTTP while a pending unpublished revision has not been projected.
 const keyfile=join(work,'publishable-key')
 await successful(['exec',worker],'public-key-setup.log',{DIDAR_G4_MODE:'api-key',DIDAR_G4_KEYFILE:keyfile})
 const publishable=readFileSync(keyfile,'utf8')
 const category='g4-category-'+suffix, family='g4-family-'+suffix, leaf='g4-leaf-'+suffix
 await query("INSERT INTO didar_category(id,name,slug,code,kind) VALUES($1,'QA family',$1,$1,'family')",[family])
 await query("INSERT INTO didar_category(id,name,slug,parent_id,code,kind) VALUES($1,'QA category',$1,$2,$1,'category')",[category,family])
 await query("INSERT INTO didar_category(id,name,slug,parent_id,code,kind) VALUES($1,'QA leaf',$1,$2,$1,'subcategory')",[leaf,category])
 await query("UPDATE didar_product SET category_id=$2,approved=true,published=true WHERE id=$1",[partial,leaf])
 await workerRun(partial,'normal','positive-public-projection.log')
 assert.equal((await state(partial)).native_status,'published')
 const api=await run(['start','--host','127.0.0.1','--port',String(apiPort)],'production-api.log')
 await waitFor(async()=>{try{return (await fetch(origin+'/health')).ok}catch{return false}},'copied production API health',120000)
 async function readProduct(id) {
  const headers={'x-publishable-api-key':publishable}
  const list=await fetch(origin+'/store/products?id='+encodeURIComponent(id)+'&limit=1&fields=id,title',{headers})
  const detail=await fetch(origin+'/store/products/'+id+'?fields=id,title',{headers})
  return {list_status:list.status,list:await list.json(),detail_status:detail.status}
 }
 const visible=await readProduct(partialID)
 assert.equal(visible.list_status,200);assert.equal(visible.list.count,1);assert.equal(visible.detail_status,200)
 await query('UPDATE didar_product SET approved=false WHERE id=$1',[partial])
 const beforeHidden=await state(partial)
 assert.equal(beforeHidden.native_status,'published')
 const hidden=await readProduct(partialID)
 assert.equal(hidden.list_status,200);assert.equal(hidden.list.count,0);assert.equal(hidden.detail_status,404)
 record('G4_PENDING_PRIVATE_NATIVE_HTTP_DENIAL',{status:'PASS',public_before:{list:visible.list_status,count:visible.list.count,detail:visible.detail_status},native_still_published:true,canonical_revoked:{list:hidden.list_status,count:hidden.list.count,detail:hidden.detail_status}})
 process.kill(-api.child.pid,'SIGTERM');await api.complete

 const immutable=await state(crash)
 await assert.rejects(query("UPDATE didar_product SET native_id='foreign-id' WHERE id=$1",[crash]),/CONFLICT_IMMUTABLE_NATIVE_PRODUCT_LINK/)
 assert.equal((await state(crash)).native_id,immutable.native_id)
 record('G4_STABLE_LINK_GUARD',{status:'PASS'})
 writeFileSync(receipt,JSON.stringify({status:'PASS',reviewer:'issue18_core_review',independent:true,base_head_at_execution:capture('git',['rev-parse','HEAD'],{cwd:root}),source_hashes:Object.fromEntries(['projection.ts','projection-schema.sql','db.ts','catalog.ts','native-store-product-visibility.ts','native-product-visibility.ts'].map(name=>[name,createHash('sha256').update(readFileSync(join(root,'packages/api/src/didar',name))).digest('hex')])),artifact_projection_sha256:createHash('sha256').update(readFileSync(join(copy,'src/didar/projection.js'))).digest('hex'),records,log_dir:work},null,2)+'\n')
 console.log('G4_INDEPENDENT_RECEIPT '+receipt)
} finally {
 for(const child of children) {try {process.kill(-child.pid,'SIGKILL')} catch {}}
 if(pool) await pool.end()
 for(const name of names.reverse()) {
  const label=capture('docker',['inspect','--format','{{index .Config.Labels "didar.review"}}',name])
  assert.equal(label,'issue18-core','Never remove an unowned container')
  capture('docker',['rm','-fv',name])
 }
}
