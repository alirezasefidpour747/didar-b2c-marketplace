import assert from 'node:assert/strict'
import {readFileSync,writeFileSync,existsSync} from 'node:fs'
import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {receipt} from '../../scripts/local/build-receipt.mjs'
const read=p=>JSON.parse(readFileSync(p,'utf8'))
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim()
const base='2c634ffdb77d4683271b5b218ca0a606af74004a'
const app='fb9daec7a947f234e7931c63f62d70e92e273c76'
const run='verification/auth-hardening/reviewer/runs/auth-20261018055943718-62ed321f'
assert.equal(git('rev-parse',`${app}^`),base)
assert.equal(git('branch','--show-current'),'feature/sec01-sec02-auth-hardening')
const drift=git('diff','--name-only',app,'--','apps','packages','scripts','tests','bun.lock','package.json')
assert.equal(drift,'','Application, local orchestration and test source must equal reviewed commit')
const p=read(run+'/parity.json'), now=receipt()
assert.deepEqual(now,p.final)
for(const item of read(run+'/launch.json').reviewer_sources) {
 const value=createHash('sha256').update(readFileSync('verification/auth-hardening/reviewer/'+item.path)).digest('hex')
 assert.equal(value,item.sha256,'Reviewer executable drift '+item.path)
}
for(const [name,key] of [['browser','code'],['persistent-affected-tests','code'],['http-before-restart','code'],['http-after-restart','code'],['schema-and-demo-seed','code'],['native-qa-seed','code'],['wrapper','observed_exit_code'],['supervisor','observed_exit_code']]) {
 const result=read(`${run}/${name}-exit.json`)
 assert.equal(result[key],0,name)
 assert.equal(result.signal??result.observed_signal??null,null,name)
}
assert.equal(read(run+'/COMPLETE.json').status,'PASS')
assert.equal(read(run+'/cleanup.json').status,'PASS')
assert.equal(read(run+'/cleanup.json').protected_preserved,10)
assert.equal(read(run+'/http-verdict.json').before,19)
assert.equal(read(run+'/http-verdict.json').after,4)
assert.equal(read(run+'/browser-verdict.json').journeys,3)
assert.equal(read('verification/auth-hardening/builds/20261018055535204/result.json').status,'PASS')
assert.equal(read('verification/auth-hardening/commands/20261018055726092-local-workflow/exit.json').code,0)
assert.equal(read('verification/auth-hardening/NATIVE_PANEL_ARTIFACT_PARITY.json').status,'PASS')
// Final reviewer is separate from application implementation; do not infer approval from source-only notes.
const independent=read(run+'/INDEPENDENT_FINAL_CHECK.json')
assert.equal(independent.status,'PASS')
assert.match(independent.source_config_review,/^PASS_WITH_DOCUMENTED_TOPOLOGY_AND_LIMITS/)
for(const name of ['FINAL_HANDOFF_FA.md','CORE_REVIEW.md'])assert(existsSync('docs/audits/auth-hardening/'+name))
for(const item of read(run+'/browser-verdict.json').screenshots)assert(existsSync(run+'/screenshots/'+item))
// Verify relative Markdown destinations for the two coordinator-written operator/handoff documents.
for(const file of ['docs/AUTH_NETWORK_TRUST_AND_THROTTLING.md','docs/audits/auth-hardening/FINAL_HANDOFF_FA.md']) {
 const content=readFileSync(file,'utf8'), dir=file.slice(0,file.lastIndexOf('/'))
 for(const match of content.matchAll(/\]\(([^)]+)\)/g))if(!/^https?:/.test(match[1]))assert(existsSync(dir+'/'+match[1]),'Broken link '+match[1])
}
const result={status:'PASS',baseline:base,reviewed_application_sha:app,delivery_head_at_check:git('rev-parse','HEAD'),source:now.source,outputs:now.outputs,reviewer_sources_frozen:true,executed_runtime_verdict:'PASS',independent_review:'FINAL_PASS',application_and_test_drift:false,at_utc:new Date().toISOString(),note:'Final delivery SHA is recorded externally in PR and final handoff message; this receipt does not certify deployment or unchanged full-program tests.'}
writeFileSync('verification/auth-hardening/FINAL_CHECK.json',JSON.stringify(result,null,2)+'\n')
console.log(JSON.stringify(result))
