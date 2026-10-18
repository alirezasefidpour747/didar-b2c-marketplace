// Read-only coordinator verification of independently observed acceptance receipts.
import assert from 'node:assert/strict'
import {readFileSync,writeFileSync} from 'node:fs'
import {spawnSync} from 'node:child_process'
import {receipt} from '../../scripts/local/build-receipt.mjs'
import {dockerSnapshot,docker,processesInGroup,hash} from './reviewer/common.mjs'
const run='correction-20261018042135715',dir='verification/issue23/reviewer/runs/'+run
const json=p=>JSON.parse(readFileSync(p,'utf8')),read=p=>json(dir+'/'+p+'.json')
const baseline='41d880a5dd4c2462144f52b1591576882238d125',candidate='fa03ac3e5a91ec393d57bae0ac7ee2a0aff05782'
const launch=read('launch'),parity=read('parity'),cleanup=read('cleanup')
assert.equal(launch.source_baseline,baseline);assert.equal(launch.candidate,candidate)
for(const f of ['runner-result','probe-verdict','independent-http-results','independent-browser-smoke','parity','cleanup'])assert.equal(read(f).status,'PASS',f)
for(const f of ['runner-observed-exit','persistent-target-regressions-exit','independent-browser-smoke-exit']){const r=read(f);assert.equal(r.code,0,f);assert.equal(r.signal,null,f);assert.equal(r.error,null,f)}
assert.equal(read('independent-http-results').cases,23)
assert.equal(read('independent-browser-smoke').journeys,3);assert.deepEqual(read('independent-browser-smoke').page_errors,[])
const current=receipt();assert.deepEqual(current,launch.receipt);assert.deepEqual(parity.initial,parity.final);assert.equal(parity.copied.initial_files_unchanged,1790)
for(const f of launch.test_files)assert.equal(hash(readFileSync(f.path)),f.sha256,f.path)
for(const [f,digest]of Object.entries(parity.affected_test_provenance.reviewer_sources))assert.equal(hash(readFileSync('verification/issue23/reviewer/'+f)),digest,f)
assert.equal(parity.tests.aggregate,'ced148cd5776a6d6394f40c60a42f1eeff7c232ad3abb7044a2933deeec98d3a')
const unchanged=['apps','packages','package.json','bun.lock','tests','scripts','verification/issue18']
const diff=spawnSync('git',['diff','--name-only',candidate,'--',...unchanged],{encoding:'utf8'});assert.equal(diff.status,0);assert.equal(diff.stdout.trim(),'')
const oldEvidence=spawnSync('git',['diff','--name-only',baseline,'--','verification/issue18'],{encoding:'utf8'});assert.equal(oldEvidence.stdout.trim(),'')
const ancestor=spawnSync('git',['merge-base','--is-ancestor',baseline,'HEAD']);assert.equal(ancestor.status,0)
const expected=read('protected-baseline').containers,now=dockerSnapshot();assert.deepEqual(now,expected)
for(const p of cleanup.stopped)assert.equal(processesInGroup(p.pgid).length,0)
for(const c of cleanup.removed){assert.ok(!now.some(x=>x.id===c.id));for(const v of c.anonymous_volumes_removed){const result=spawnSync('docker',['--host=unix:///var/run/docker.sock','volume','inspect','--format','{{.Name}}',v],{encoding:'utf8'});assert.notEqual(result.status,0)}}
const http=read('independent-http-results');assert.deepEqual(http.canonical_fingerprints_before,http.canonical_fingerprints_after);assert.equal(http.protected_native_records_unchanged,true)
const screenshots=read('independent-browser-smoke').screenshots.map(path=>({path:'reviewer/runs/'+run+'/screenshots/'+path,sha256:hash(readFileSync(dir+'/screenshots/'+path))}));assert.equal(screenshots.length,6)
const value={status:'PASS',baseline,reviewed_application_commit:candidate,run_id:run,actual_runner_exit:0,actual_browser_exit:0,signal:null,persistent_tests:6,persistent_assertions:23,independent_http_cases:23,browser_journeys:3,page_errors:0,screenshots,source:current.source,outputs:current.outputs,affected_test_manifest:parity.affected_test_provenance,inherited_50_tests_unchanged:true,original_issue18_evidence_unchanged:true,compiled_files_unchanged:1790,owned_groups_absent:cleanup.stopped.length,owned_containers_and_volumes_absent:cleanup.removed.length,preexisting_containers_unchanged:now.length,limitation:'Six canonical QA table fingerprints match; UID/order/finance tables are empty in this new fixture. Populated preservation and unchanged full suites are inherited from accepted baseline, not rerun.',next_enabled_vertical:'BLOCKED',open_p1:['SEC-01','SEC-02'],production_ready:false,checked_at_utc:new Date().toISOString()}
writeFileSync('verification/issue23/FINAL_COORDINATOR_CHECK.json',JSON.stringify(value,null,2)+'\n');console.log(JSON.stringify({...value,screenshots:screenshots.map(x=>x.path)}))
