import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import{readFileSync,writeFileSync}from'node:fs'
import{execFileSync}from'node:child_process'
import{createHash}from'node:crypto'
const root='/workspace/work/didar-pr29',out='/workspace/work/pr29-independent-review',file='packages/api/src/scripts/native-qa-seed.ts',req=createRequire(root+'/package.json'),ts=req('typescript'),sha=b=>createHash('sha256').update(b).digest('hex')
const before=execFileSync('git',['show','HEAD:'+file],{cwd:root,encoding:'utf8'}),after=readFileSync(root+'/'+file,'utf8')
const compile=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2021,module:ts.ModuleKind.Node16,esModuleInterop:true,sourceMap:false,inlineSourceMap:false,removeComments:false},fileName:'native-qa-seed.ts'}).outputText
assert.equal(compile(before),compile(after),'type-only change must preserve emitted runtime JavaScript byte-for-byte')
const entry=root+'/packages/api/__independent_qa_type_probe.ts'
const service=root+'/packages/api/node_modules/@mercurjs/core/.medusa/server/src/modules/seller/service'
const text=`import type {CreateMemberDTO, MemberDTO} from '@mercurjs/types';\nimport type SellerModuleService from '${service}';\ntype Narrow = {upsertMembers(input:(CreateMemberDTO & Pick<MemberDTO,'first_name'|'last_name'>)[]):Promise<MemberDTO[]>};\ndeclare const official: SellerModuleService;\nconst checked: Narrow = official;\nconst fixture: Parameters<Narrow['upsertMembers']>[0] = [{email:'qa@example.invalid',first_name:'همکار',last_name:'محتوا'}];\nvoid checked; void fixture;\n`
const options={target:ts.ScriptTarget.ES2021,module:ts.ModuleKind.Node16,moduleResolution:ts.ModuleResolutionKind.Node16,strict:true,noEmit:true,skipLibCheck:true,esModuleInterop:true},host=ts.createCompilerHost(options),getSource=host.getSourceFile.bind(host),exists=host.fileExists.bind(host),read=host.readFile.bind(host)
host.fileExists=p=>p===entry||exists(p);host.readFile=p=>p===entry?text:read(p);host.getSourceFile=(p,l,e,n)=>p===entry?ts.createSourceFile(p,text,l,true):getSource(p,l,e,n)
const program=ts.createProgram([entry],options,host),diagnostics=ts.getPreEmitDiagnostics(program)
assert.equal(diagnostics.length,0,ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCurrentDirectory:()=>root,getCanonicalFileName:p=>p,getNewLine:()=> '\n'}))
const paths=[file,'packages/api/node_modules/@mercurjs/types/dist/seller/common.d.ts','packages/api/node_modules/@mercurjs/core/.medusa/server/src/modules/seller/service.d.ts','packages/api/node_modules/@mercurjs/core/.medusa/server/src/modules/seller/service.js','packages/api/node_modules/@mercurjs/core/.medusa/server/src/modules/seller/models/member.js']
const result={status:'PASS',source:pathHashes(),checks:{emitted_javascript_byte_identical:true,emitted_javascript_sha256:sha(compile(after)),official_service_assignable_to_narrow_adapter:true,compiler_diagnostics:0,disposable_runtime_executed:false},limits:['Static source/type and transpilation check, no fresh native seeding/database run claimed.','Full project API tsc result is separate coordinator evidence.']};function pathHashes(){return paths.map(path=>({path,sha256:sha(readFileSync(root+'/'+path))}))}
writeFileSync(out+'/QA_TYPE_RESULTS.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result))
