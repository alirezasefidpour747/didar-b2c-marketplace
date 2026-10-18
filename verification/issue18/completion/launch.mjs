import {mkdirSync,openSync,closeSync,readFileSync} from 'node:fs'
import {join} from 'node:path'
import {randomUUID} from 'node:crypto'
import {spawn} from 'node:child_process'
import {ROOT,EXPECTED,atomic,capture,testParity,identity,harnessParity} from './common.mjs'
import {verifyBuild} from '../../../scripts/local/build-receipt.mjs'
if(process.argv[2]!=='--launch')throw Error('Review the new wrapper first; explicit --launch required')
const candidate=capture('git',['rev-parse','HEAD'],{cwd:ROOT});capture('git',['merge-base','--is-ancestor',EXPECTED.head,candidate],{cwd:ROOT});const later=capture('git',['diff','--name-only',EXPECTED.head,candidate],{cwd:ROOT}).split('\n').filter(Boolean);if(later.some(p=>!p.startsWith('verification/issue18/completion/')))throw Error('Post-review committed changes outside append-only completion evidence')
verifyBuild(ROOT);const receipt=JSON.parse(readFileSync(join(ROOT,'.local/build-receipt.json'),'utf8'));if(receipt.source!==EXPECTED.source||receipt.outputs!==EXPECTED.outputs)throw Error('Reviewed production receipt differs');const tests=testParity(ROOT),harness=harnessParity()
const runId=new Date().toISOString().replace(/[^0-9]/g,'')+'-'+randomUUID().slice(0,8),dir=join(import.meta.dirname,'runs',runId),scratch='/workspace/work/issue18-completion-'+runId
mkdirSync(dir,{recursive:true,mode:0o700});atomic(join(dir,'launch.json'),{run_id:runId,root:ROOT,scratch,review_anchor:EXPECTED.head,candidate_head:candidate,receipt,tests,harness_files:harness.files,harness_aggregate:harness.aggregate,created_at:new Date().toISOString(),scope:'Same32 production browsers only; no unchanged backend/tooling/Jest/G4/restore rerun; no app/existing-test changes.'},{once:true})
const fd=openSync(join(dir,'monitor.log'),'a',0o600),child=spawn(process.execPath,[join(import.meta.dirname,'observer.mjs'),'monitor',dir],{cwd:ROOT,env:process.env,detached:true,stdio:['ignore',fd,fd]});closeSync(fd)
atomic(join(dir,'detached-monitor.json'),{run_id:runId,identity:identity(child.pid),exit_code:'NOT_OBSERVED_BY_LAUNCHER'},{once:true});child.unref();console.log(JSON.stringify({run_id:runId,evidence_directory:dir,detached_monitor_pid:child.pid,status:'LAUNCHED_NOT_COMPLETED'}))
