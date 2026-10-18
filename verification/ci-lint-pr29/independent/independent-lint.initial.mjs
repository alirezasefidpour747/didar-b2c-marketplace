import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
const root='/workspace/work/didar-pr29',out='/workspace/work/pr29-independent-review'
const require=createRequire(join(root,'package.json')),{ESLint}=require('eslint'),sha=b=>createHash('sha256').update(b).digest('hex')
const sources=['apps/admin/eslint.config.js','apps/vendor/eslint.config.js','scripts/eslint/mercur-dashboard-refresh.mjs','tests/native-sdk-lint.test.mjs','scripts/ci/validate.mjs','bun.lock']
const initial=sources.map(path=>({path,sha256:sha(readFileSync(join(root,path)))})),results=[]
const component='export default function Page(){return <div/>}'
const object='{model:"product",displays:[{zone:"general",fields:[{id:"gold",component:GoldRecord}]}]}'
const fields='import{defineCustomFieldsConfig}from"@mercurjs/dashboard-sdk";function GoldRecord(){return <div/>}export default defineCustomFieldsConfig('+object+');'
const cases=[
 ['ordinary component remains valid','src/components/independent-probe.tsx',component,false],
 ['route config+handle allowed','src/routes/independent-probe/page.tsx',component+';export const config={label:"Gold"};export const handle={breadcrumb:()=>"Gold"};',false],
 ['route root page allowed','src/routes/page.tsx',component+';export const config={label:"Gold"};',false],
 ['widget config allowed','src/widgets/independent-probe.tsx',component+';export const config={zone:"product.detail.before"};',false],
 ['actual SDK direct object default allowed','src/custom-fields/independent-probe.tsx',fields,false],
 ['SDK named import alias allowed','src/custom-fields/independent-probe.tsx',fields.replaceAll('defineCustomFieldsConfig','buildFields').replace('import{buildFields}','import{defineCustomFieldsConfig as buildFields}'),false],
 ['SDK default type assertion preserved','src/custom-fields/independent-probe.tsx',fields.replace('defineCustomFieldsConfig('+object+');','(defineCustomFieldsConfig('+object+') as unknown);'),false],
 ['SDK object satisfies wrapper preserved','src/custom-fields/independent-probe.tsx',fields.replace('defineCustomFieldsConfig('+object+');','defineCustomFieldsConfig(('+object+') satisfies Record<string,unknown>);'),false],
 ['original Vite primitive constant allowance preserved','src/custom-fields/independent-probe.tsx',fields+'export const VERSION=1;',false],
 ['type exports remain ignored by Refresh','src/custom-fields/independent-probe.tsx',fields+'export type FieldID=string;',false],
 ['ordinary metadata name config not globally exempt','src/components/independent-probe.tsx',component+';export const config={};',true],
 ['ordinary metadata name handle not globally exempt','src/components/independent-probe.tsx',component+';export const handle={};',true],
 ['route helper is not page entrypoint','src/routes/independent-probe/helper.tsx',component+';export const config={};',true],
 ['similarly named Page.tsx not exempt','src/routes/independent-probe/Page.tsx',component+';export const config={};',true],
 ['route arbitrary object export rejected','src/routes/independent-probe/page.tsx',component+';export const state={};',true],
 ['route arbitrary helper rejected','src/routes/independent-probe/page.tsx',component+';export function helper(){return 1}',true],
 ['widget handle not allowed','src/widgets/independent-probe.tsx',component+';export const handle={};',true],
 ['widget config exemption not in components subfolder','src/components/widgets/independent-probe.tsx',component+';export const config={};',true],
 ['customfield config not inherited from route allowlist','src/custom-fields/independent-probe.tsx',fields+'export const config={};',true],
 ['customfield handle not inherited from route allowlist','src/custom-fields/independent-probe.tsx',fields+'export const handle={};',true],
 ['customfield state object rejected','src/custom-fields/independent-probe.tsx',fields+'export const state={};',true],
 ['customfield helper rejected','src/custom-fields/independent-probe.tsx',fields+'export function helper(){return 1}',true],
 ['customfield renamed noncomponent export rejected','src/custom-fields/independent-probe.tsx',fields+'const state={};export{state as config};',true],
 ['customfield wildcard export rejected','src/custom-fields/independent-probe.tsx',fields+'export*from"./unrelated";',true],
 ['fake same-named local helper rejected','src/custom-fields/independent-probe.tsx',fields.replace('import{defineCustomFieldsConfig}from"@mercurjs/dashboard-sdk";','function defineCustomFieldsConfig(value:object){return value}'),true],
 ['wrong module helper rejected','src/custom-fields/independent-probe.tsx',fields.replace('@mercurjs/dashboard-sdk','different-sdk'),true],
 ['wrong imported SDK member aliased to factory rejected','src/custom-fields/independent-probe.tsx',fields.replace('import{defineCustomFieldsConfig}','import{defineWidgetConfig as defineCustomFieldsConfig}'),true],
 ['side effect import does not authorize local helper','src/custom-fields/independent-probe.tsx',fields.replace('import{defineCustomFieldsConfig}from"@mercurjs/dashboard-sdk";','import"@mercurjs/dashboard-sdk";function defineCustomFieldsConfig(value:object){return value}'),true],
 ['type-only declaration import rejected','src/custom-fields/independent-probe.tsx',fields.replace('import{','import type{'),true],
 ['type-only inline import rejected','src/custom-fields/independent-probe.tsx',fields.replace('import{defineCustomFieldsConfig}','import{type defineCustomFieldsConfig}'),true],
 ['unsupported namespace remains upstream','src/custom-fields/independent-probe.tsx',fields.replace('import{defineCustomFieldsConfig}','import*as SDK').replace('export default defineCustomFieldsConfig(','export default SDK.defineCustomFieldsConfig('),true],
 ['unsupported extra argument remains upstream','src/custom-fields/independent-probe.tsx',fields.replace(object+');',object+', "extra");'),true],
 ['SDK exception does not apply to normal components','src/components/independent-probe.tsx',fields,true],
 ['SDK exception does not cover nested model files','src/custom-fields/nested/independent-probe.tsx',fields,true],
 ['SDK exception does not cover similarly named directory','src/custom-fields-other/independent-probe.tsx',fields,true],
 ['anonymous ordinary default still rejected','src/components/independent-probe.tsx','export default()=> <div/>;',true],
]
try{
 for(const panel of ['admin','vendor']){
  const cwd=join(root,'apps',panel),eslint=new ESLint({cwd})
  for(const [name,path,code,reject]of cases){
   const [value]=await eslint.lintText(code,{filePath:join(cwd,path)}),messages=value.messages,refresh=messages.filter(m=>m.ruleId==='react-refresh/only-export-components');assert.equal(value.fatalErrorCount,0,name);if(reject){assert.ok(refresh.length>0,name+' silently accepted');assert.ok(refresh.every(m=>m.severity===2),name+' was weakened')}else assert.deepEqual(messages,[],name)
   const config=await eslint.calculateConfigForFile(join(cwd,path)),rule=config.rules['react-refresh/only-export-components'];assert.equal(rule[0],2,name);assert.equal(rule[1].allowConstantExport,true,name);assert.equal(rule[1].allowMercurCustomFields===true,/^src\/custom-fields\/[^/]+\.tsx$/.test(path),name)
   results.push({panel,name,path,expected:reject?'REFRESH_ERROR':'NO_DIAGNOSTICS',status:'PASS',diagnostics:messages.map(m=>({ruleId:m.ruleId,messageId:m.messageId,severity:m.severity})),effective_rule:rule})
  }
  const hookCode=fields.replace('function GoldRecord(){return <div/>}','function GoldRecord({flag}:{flag:boolean}){if(flag)useState(0);return <div/>}').replace('import{defineCustomFieldsConfig}','import{useState}from"react";import{defineCustomFieldsConfig}')
  const hook=(await eslint.lintText(hookCode,{filePath:join(cwd,'src/custom-fields/independent-probe.tsx')}))[0].messages;assert.ok(hook.some(m=>m.ruleId==='react-hooks/rules-of-hooks'&&m.severity===2));results.push({panel,name:'Hooks enforcement remains inside custom-fields',status:'PASS',diagnostics:hook.map(m=>({ruleId:m.ruleId,messageId:m.messageId,severity:m.severity}))})
  const contextCode=fields.replace('import{defineCustomFieldsConfig}','import{createContext}from"react";import{defineCustomFieldsConfig}')+'export const fieldContext=createContext(null);'
  const contexts=(await eslint.lintText(contextCode,{filePath:join(cwd,'src/custom-fields/independent-probe.tsx')}))[0].messages;assert.ok(contexts.some(m=>m.ruleId==='react-refresh/only-export-components'&&m.messageId==='reactContext'&&m.severity===2));results.push({panel,name:'React context mixed export still rejected',status:'PASS',diagnostics:contexts.map(m=>({ruleId:m.ruleId,messageId:m.messageId,severity:m.severity}))})
 }
 assert.deepEqual(sources.map(path=>({path,sha256:sha(readFileSync(join(root,path)))})),initial,'Implementation source changed during independent verification')
 const result={status:'PASS',reviewer:'Independent nonimplementer',implementation_sources:initial,case_count:results.length,results,reviewer_script_sha256:sha(readFileSync(import.meta.filename)),limits:['Static SDK-aware lint behavior only; no application/browser/database/deployment/production acceptance claim.','Source implementation commit recorded by coordinator after freeze; this file records actual per-file tested hashes.']};writeFileSync(join(out,'INDEPENDENT_LINT_RESULTS.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({status:result.status,cases:results.length,source:initial}))
}catch(e){writeFileSync(join(out,'INDEPENDENT_LINT_FAILED.json'),JSON.stringify({status:'FAIL',message:e.message,completed_cases:results.length,results,source:initial,reviewer_script_sha256:sha(readFileSync(import.meta.filename))},null,2)+'\n');throw e}
