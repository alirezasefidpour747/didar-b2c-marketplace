import assert from 'node:assert/strict'
import {readFileSync,writeFileSync,existsSync} from 'node:fs'
import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
const root='verification/auth-packaging',run=root+'/reviewer/runs/package-20261018080328338-54401542'
const json=p=>JSON.parse(readFileSync(p,'utf8')),sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex'),git=(...a)=>execFileSync('git',a,{encoding:'utf8'}).trim()
const source='9846b5042e90d06d14d00b5fefdf67ebba455ec0',baseline='d9b55b3856d6e52ba86db517430572c2d46761e0',launch=json(run+'/launch.json')
assert.equal(git('branch','--show-current'),'feature/auth-deployment-packaging');assert.equal(launch.baseline,baseline);assert.equal(launch.candidate_head,source)
assert.equal(git('rev-parse','6cd8cf464e43fcc73392d0e120b1934194a15c81^'),baseline)
assert.equal(git('diff','--name-only',baseline,source,'--','apps','packages','bun.lock','package.json'),'')
for(const f of [...launch.test_sources,...launch.packaging_sources])assert.equal(sha(f.path),f.sha256,f.path)
for(const f of launch.reviewer_sources)assert.equal(sha(root+'/reviewer/'+f.path),f.sha256,f.path)
for(const name of ['COMPLETE','parity','cleanup','package-runtime-verdict','http-verdict','browser-verdict'])assert.equal(json(run+'/'+name+'.json').status,'PASS',name)
for(const name of ['schema-and-demo-seed','native-qa-seed','persistent-affected-tests','http-before-restart','http-after-restart','browser']){const c=json(run+'/'+name+'-exit.json');assert.equal(c.code,0,name);assert.equal(c.signal,null);assert.equal(c.error,null)}
for(const name of ['wrapper','supervisor']){const c=json(run+'/'+name+'-exit.json');assert.equal(c.observed_exit_code,0);assert.equal(c.observed_signal,null);assert.equal(c.spawn_error,null)}
const negative=json(run+'/packaging-fail-closed.json');assert.equal(negative.cases.length,4);for(const c of negative.cases)assert.equal(c.actual_container_exit_code,1)
assert.equal(json(run+'/supervisor-unexpected-child-exit.json').actual_container_exit_code,1)
const http=json(run+'/http-verdict.json'),browser=json(run+'/browser-verdict.json'),clean=json(run+'/cleanup.json')
assert.equal(http.before,19);assert.equal(http.after,4);assert.equal(browser.journeys,3);assert.equal(browser.screenshots.length,6);assert.deepEqual(browser.page_errors,[])
for(const f of browser.screenshots)assert.ok(existsSync(run+'/screenshots/'+f))
assert.equal(clean.protected_preserved,10);assert.equal(clean.ephemeral_tls_files_removed,true);assert.equal(clean.removed.length,10)
const artifacts=json(root+'/ARTIFACT_PROVENANCE.json');assert.equal(artifacts.status,'PASS')
for(const info of Object.values(launch.images))assert.equal(execFileSync('docker',['--host=unix:///var/run/docker.sock','image','inspect','--format','{{.Id}}',info.Id],{encoding:'utf8'}).trim(),info.Id)
const review=json(root+'/reviewer/FINAL_REVIEW.json');assert.equal(review.status,'PASS')
assert.equal(review.authorized_baseline,baseline);assert.equal(review.reviewed_packaging_source_sha,source);assert.deepEqual(review.images,launch.images)
for(const [name,path] of Object.entries(review.receipts))assert.equal(sha(path),review.receipt_sha256[name],name)
for(const f of review.screenshots)assert.equal(sha(f.path),f.sha256,f.path)
const provenance=root+'/reviewer/provenance/runs/provenance-20261018081109674-2709dec2',p=json(provenance+'/RESULT.json')
assert.equal(p.status,'PASS');assert.equal(p.result.actual.source_files,395);assert.equal(p.result.actual.source,launch.receipt.source);assert.equal(p.result.actual.outputs,launch.receipt.outputs)
assert.equal(p.result.container.ExitCode,0);assert.equal(p.result.container.Readonly,true);assert.equal(p.result.container.NetworkMode,'none');assert.deepEqual(p.result.container.Mounts,[])
assert.equal(json(provenance+'/TOOL_OBSERVED_WRAPPER_EXIT.json').actual_exit_code,0);assert.equal(json(provenance+'/cleanup.json').protected_preserved,10)
const result={status:'PASS',baseline,reviewed_packaging_source_sha:source,primary_run:run,review:root+'/reviewer/FINAL_REVIEW.json',frozen_test_files:launch.test_sources.length,frozen_reviewer_files:launch.reviewer_sources.length,checked_actual_exit_receipts:true,expected_negative_exit_codes:1,protected_containers:10,new_business_tests_executed_by_this_audit:false,at:new Date().toISOString()}
writeFileSync(root+'/FINAL_AUDIT.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result))
