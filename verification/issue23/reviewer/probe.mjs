import assert from 'node:assert/strict'
import {join} from 'node:path'
import {atomic} from './common.mjs'
export async function probe({api,web,dir,runId,pg,docker}) {
 const sql=q=>docker(['exec',pg.id,'psql','-U','postgres','-d','didar_qa','-At','-v','ON_ERROR_STOP=1','-c',q])
 const post=async(base,path,body,headers={})=>{const r=await fetch(base+path,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});const p=await r.json();return {status:r.status,message:p.message??null,authenticated:!!p.token}}
 const login={email:'customer@didar.test',password:'DidarDemo2026!'}
 const bad={...login,password:'SyntheticWrongPassword!'}
 const before=await post(web,'/api/didar/login',login);assert.equal(before.status,200);assert.equal(before.authenticated,true)
 sql('DELETE FROM didar_login_attempt')
 const rotating=[];for(let i=1;i<=21;i++)rotating.push(await post(api,'/didar/login',bad,{'x-forwarded-for':'198.51.100.'+i}))
 assert.ok(rotating.every(r=>r.status===401),'Every spoofed-IP attempt bypasses account throttle in baseline')
 const rotatingRows=Number(sql('SELECT count(*) FROM didar_login_attempt'));assert.equal(rotatingRows,42)
 sql('DELETE FROM didar_login_attempt')
 const fixed=[];for(let i=1;i<=21;i++)fixed.push(await post(api,'/didar/login',bad,{'x-forwarded-for':'198.51.100.1'}))
 assert.ok(fixed.slice(0,20).every(r=>r.status===401));assert.equal(fixed[20].status,429)
 atomic(join(dir,'SEC02-spoofed-forwarded-ip.json'),{run_id:runId,status:'REPRODUCED',baseline:before.status,rotating_addresses:21,rotating_responses:rotating,rotating_bucket_rows:rotatingRows,fixed_address_attempt21:fixed[20],meaning:'Direct API trusts unsigned forwarded IP; rotating it bypasses account attempt ceiling.'})
 sql('DELETE FROM didar_login_attempt')
 const shared=[];for(let i=0;i<200;i++)shared.push(await post(web,'/api/didar/login',{email:'nonexistent-'+i+'@example.invalid',password:bad.password}))
 assert.ok(shared.every(r=>r.status===401));const validAfter=await post(web,'/api/didar/login',login);assert.equal(validAfter.status,429);assert.equal(validAfter.authenticated,false)
 const freshOther=await post(web,'/api/didar/login',{email:'new-legitimate@example.invalid',password:bad.password},{'x-forwarded-for':'203.0.113.91'});assert.equal(freshOther.status,429)
 atomic(join(dir,'SEC01-shared-proxy-lockout.json'),{run_id:runId,status:'REPRODUCED',valid_customer_before:before.status,anonymous_distinct_accounts:shared.length,anonymous_status_counts:shared.reduce((a,r)=>(a[r.status]=(a[r.status]||0)+1,a),{}),valid_customer_after:validAfter,distinct_browser_forwarded_header_after:freshOther,meaning:'200 anonymous failures via Next exhaust a shared transport-IP bucket, denying a separately valid seeded customer; caller header cannot isolate client.'})
}
