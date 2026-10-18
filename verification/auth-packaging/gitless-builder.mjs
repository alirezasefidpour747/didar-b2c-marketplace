// Exercise the source Docker builder's Git-excluded provenance branch without
// repeating unchanged application compilers. No application server runs here.
import assert from 'node:assert/strict'
import {mkdtempSync,mkdirSync,cpSync,readFileSync,writeFileSync,rmSync,existsSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {spawn} from 'node:child_process'
const root=process.cwd(),source='9846b5042e90d06d14d00b5fefdf67ebba455ec0',dir=join(root,'verification/auth-packaging/gitless-builder'),scratch=mkdtempSync('/workspace/work/auth-gitless-'),fake=join(scratch,'source'),out=join(scratch,'package'),stages=[]
mkdirSync(dir,{recursive:true});mkdirSync(fake);let failure=null,manifest
const env={...process.env};delete env.DIDAR_PACKAGE_SOURCE_SHA
async function stage(name,command,args,expected,extra={}) {
 const log=join(dir,name+'.log'),{openSync,closeSync}=await import('node:fs'),fd=openSync(log,'wx',0o600)
 const r=await new Promise(resolve=>{const child=spawn(command,args,{cwd:fake,env:{...env,...extra},stdio:['ignore',fd,fd]});let error=null;child.on('error',e=>error=e.code);child.on('close',(code,signal)=>resolve({name,code,signal,error,child_pid:child.pid,observed_by:process.pid,expected_code:expected,at:new Date().toISOString()}))});closeSync(fd);stages.push(r);writeFileSync(join(dir,name+'-exit.json'),JSON.stringify(r,null,2)+'\n');assert.equal(r.code,expected,name);assert.equal(r.signal,null);assert.equal(r.error,null)
}
try {
 const filter=p=>!p.split('/').some(n=>n.startsWith('.env'))
 for(const path of ['apps/storefront/.next/standalone','apps/storefront/.next/static','apps/storefront/public','apps/storefront/auth-ingress.mjs','packages/auth-network','scripts/deployment']) {mkdirSync(resolve(fake,path,'..'),{recursive:true});cpSync(join(root,path),join(fake,path),{recursive:true,dereference:false,verbatimSymlinks:true,filter})}
 assert(!existsSync(join(fake,'.git')))
 await stage('missing-source-sha','node',[join(fake,'scripts/deployment/package-storefront.mjs'),join(scratch,'rejected')],1)
 assert(!existsSync(join(scratch,'rejected')))
 await stage('caller-sha-build','node',[join(fake,'scripts/deployment/package-storefront.mjs'),out],0,{DIDAR_PACKAGE_SOURCE_SHA:source})
 await stage('verify-produced-package','node',[join(out,'runtime/verify-package.mjs')],0)
 manifest=JSON.parse(readFileSync(join(out,'PACKAGING.json'),'utf8'));assert.equal(manifest.source_sha,source);assert.equal(manifest.source_provenance,'BUILD_CALLER_SOURCE_SHA');const actual=JSON.parse(readFileSync(join(root,'verification/auth-packaging/ARTIFACT_PROVENANCE.json'),'utf8')).fresh_package;assert.equal(manifest.content_sha256,actual.content_sha256);assert.equal(manifest.files.length,actual.files)
} catch(e) {failure={message:e.message}} finally {assert(scratch.startsWith('/workspace/work/auth-gitless-'));rmSync(scratch,{recursive:true});writeFileSync(join(dir,'RESULT.json'),JSON.stringify({status:failure?'FAIL':'PASS',failure,source,stages,package_content_sha256:manifest?.content_sha256,files:manifest?.files?.length,snapshot_dependency_links:'ARTIFACT_INTERNAL_RELATIVE_ONLY_VERIFIED_BY_PACKAGE_BUILDER',application_runtime:'NOT_STARTED_BUILDER_BRANCH_ONLY',full_source_Docker_build:'NOT_EXECUTED',scratch_removed:!existsSync(scratch),at:new Date().toISOString()},null,2)+'\n');process.exitCode=failure?1:0}
