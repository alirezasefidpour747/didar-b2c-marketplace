import {mkdirSync,openSync,closeSync,readFileSync} from 'node:fs'
import {join} from 'node:path'
import {spawn} from 'node:child_process'
import {ROOT,json,atomic,identity,hash} from './common.mjs'
const runId='correction-'+new Date().toISOString().replace(/[-:.TZ]/g,'')
if(process.env.ISSUE23_CANDIDATE!=='fa03ac3e5a91ec393d57bae0ac7ee2a0aff05782')throw Error('Explicit frozen correction candidate required');
const testFiles=[...json(join(ROOT,'verification/issue18/INDEPENDENT_TEST_SOURCE_SHA256.json')).files.map(f=>f.path),'tests/native-product-targets.test.ts'].sort().map(path=>({path,sha256:hash(readFileSync(join(ROOT,path)))}));
const dir=join(ROOT,'verification/issue23/reviewer/runs',runId);mkdirSync(dir,{recursive:true,mode:0o700})
atomic(join(dir,'launch.json'),{run_id:runId,scratch:'/workspace/work/issue23-security-'+runId,receipt:json(join(ROOT,'.local/build-receipt.json')),source_baseline:'41d880a5dd4c2462144f52b1591576882238d125',candidate:process.env.ISSUE23_CANDIDATE,test_files:testFiles,test_aggregate:hash(JSON.stringify(testFiles)),reviewer_sources:Object.fromEntries(['common.mjs','correction-runner.mjs','correction-probe.mjs','browser-smoke.mjs'].map(p=>[p,hash(readFileSync(join(import.meta.dirname,p)))]))})
const fd=openSync(join(dir,'runner.log'),'a',0o600),c=spawn(process.execPath,[join(import.meta.dirname,'correction-runner.mjs'),dir],{cwd:ROOT,env:process.env,stdio:['ignore',fd,fd]});closeSync(fd);atomic(join(dir,'runner-identity.json'),identity(c.pid));console.log(JSON.stringify({run_id:runId,dir,pid:c.pid}))
let error=null;c.on('error',e=>error=e.message);c.on('close',(code,signal)=>{atomic(join(dir,'runner-observed-exit.json'),{run_id:runId,code,signal,error,observed_by:process.pid,at:new Date().toISOString()});console.log(JSON.stringify({run_id:runId,code,signal,error}));process.exitCode=code===0&&!signal&&!error?0:1})
