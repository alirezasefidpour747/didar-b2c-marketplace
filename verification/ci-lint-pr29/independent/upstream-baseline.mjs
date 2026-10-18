import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {writeFileSync,readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
const require=createRequire('/workspace/didar-b2c-marketplace/package.json')
const {Linter}=require('eslint'),ts=require('typescript-eslint'),refresh=require('eslint-plugin-react-refresh')
const fixture='import { defineCustomFieldsConfig } from "@mercurjs/dashboard-sdk"; function GoldRecord(){return <div/>} export default defineCustomFieldsConfig({model:"product",displays:[{zone:"general",fields:[{id:"gold",component:GoldRecord}]}]});'
const cases=[]
for(const [name,code,opts,expected] of [['ordinary-component','export default function Page(){return <div/>}',{},0],['sdk-object-default',fixture,{},2],['sdk-object-is-not-supported-by-customHOCs',fixture,{customHOCs:['defineCustomFieldsConfig']},2]]){
 const lint=new Linter(),messages=lint.verify(code,[{files:['**/*.tsx'],languageOptions:{parser:ts.parser,ecmaVersion:2022,sourceType:'module',parserOptions:{ecmaFeatures:{jsx:true}}},plugins:{'react-refresh':refresh},rules:{'react-refresh/only-export-components':['error',{allowConstantExport:true,...opts}]}}],{filename:'src/custom-fields/product.tsx'});assert.equal(messages.length,expected);cases.push({name,expected_findings:expected,actual_findings:messages.map(m=>({ruleId:m.ruleId,messageId:m.messageId,line:m.line,severity:m.severity}))})
}
const p='/workspace/didar-b2c-marketplace/node_modules/eslint-plugin-react-refresh/index.js',pkg=require('eslint-plugin-react-refresh/package.json');assert.equal(pkg.version,'0.4.26');const result={status:'PASS',scope:'Independent proof of original SDK-object false positives; no application/configuration edits',plugin_version:pkg.version,upstream_rule_sha256:createHash('sha256').update(readFileSync(p)).digest('hex'),cases};writeFileSync('/workspace/work/pr29-independent-review/UPSTREAM_BASELINE.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result))
