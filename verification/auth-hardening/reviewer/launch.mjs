import {mkdirSync,openSync,closeSync,readFileSync} from 'node:fs'
import {join} from 'node:path'
import {randomUUID} from 'node:crypto'
import {spawn} from 'node:child_process'
import {ROOT,BASELINE,atomic,capture,identity,reviewerSources,testsManifest,hash} from './common.mjs'
import {verifyBuild} from '../../../scripts/local/build-receipt.mjs'
if(process.argv[2]!=='--launch')throw Error('Independent harness review and explicit --launch required')
const persistentTests=process.argv.slice(3);if(!persistentTests.length||persistentTests.some(p=>!/^tests\/[A-Za-z0-9_-]+\.test\.ts$/.test(p)))throw Error('Explicit affected test paths required');
const candidate=capture('git',['rev-parse','HEAD'],{cwd:ROOT});if(candidate!==process.env.AUTH_REVIEW_CANDIDATE)throw Error('Exact frozen candidate must be supplied and equal HEAD');capture('git',['merge-base','--is-ancestor',BASELINE,candidate],{cwd:ROOT})
verifyBuild(ROOT);const receipt=JSON.parse(readFileSync(join(ROOT,'.local/build-receipt.json'),'utf8'));const tests=testsManifest(ROOT),sources=reviewerSources()
const executionDependencies=['scripts/local/runtime.mjs','scripts/local/browser-options.mjs','scripts/local/build-receipt.mjs','scripts/local/db.mjs','scripts/local.mjs','scripts/local/test.mjs'].filter(path=>{try{readFileSync(join(ROOT,path));return true}catch{return false}}).map(path=>({path,sha256:hash(readFileSync(join(ROOT,path))),role:['scripts/local.mjs','scripts/local/test.mjs'].includes(path)?'Source-reviewed transport wiring; not invoked by this reviewer runtime':'Runtime execution dependency'}))
const runId='auth-'+new Date().toISOString().replace(/[^0-9]/g,'')+'-'+randomUUID().slice(0,8),dir=join(import.meta.dirname,'runs',runId),scratch='/workspace/work/auth-hardening-review-'+runId
mkdirSync(dir,{recursive:true,mode:0o700});atomic(join(dir,'launch.json'),{run_id:runId,root:ROOT,scratch,baseline:BASELINE,candidate_head:candidate,receipt,test_sources:tests,test_aggregate:hash(JSON.stringify(tests)),reviewer_sources:sources,reviewer_aggregate:hash(JSON.stringify(sources)),created_at:new Date().toISOString(),persistent_tests:persistentTests,execution_dependencies:executionDependencies,scope:'Bounded SEC01/02 actual HTTP/PostgreSQL/browser and PR24 affected checks only; no rollout/owner changes/live finance/full unchanged program.'},{once:true})
const fd=openSync(join(dir,'monitor.log'),'a',0o600),child=spawn(process.execPath,[join(import.meta.dirname,'observer.mjs'),'monitor',dir],{cwd:ROOT,env:process.env,detached:true,stdio:['ignore',fd,fd]});closeSync(fd)
atomic(join(dir,'detached-monitor.json'),{run_id:runId,identity:identity(child.pid),exit_code:'NOT_OBSERVED_BY_LAUNCHER'},{once:true});child.unref();console.log(JSON.stringify({run_id:runId,evidence_directory:dir,detached_monitor_pid:child.pid,status:'LAUNCHED_NOT_COMPLETED'}))
