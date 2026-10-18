import {execFileSync} from 'node:child_process'
import {readFileSync,writeFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {receipt} from '../../scripts/local/build-receipt.mjs'
const git=(...a)=>execFileSync('git',a,{encoding:'utf8'}).trim(),hash=b=>createHash('sha256').update(b).digest('hex')
const baseline='d9b55b3856d6e52ba86db517430572c2d46761e0',source='9846b5042e90d06d14d00b5fefdf67ebba455ec0'
if(git('rev-parse','6cd8cf464e43fcc73392d0e120b1934194a15c81^')!==baseline)throw Error('Wrong branch origin');git('merge-base','--is-ancestor',baseline,source)
if(git('diff','--name-only',baseline,source,'--','apps','packages','bun.lock','package.json'))throw Error('Unexpected application mutation')
if(git('diff','--name-only',source,'--','apps','packages','scripts','tests','Dockerfile','Dockerfile.prebuilt','Dockerfile.storefront','compose.yaml','bun.lock','package.json'))throw Error('Source drift')
const inherited=JSON.parse(readFileSync('verification/auth-hardening/builds/20261018055535204/build-receipt.json','utf8')),actual=receipt()
if(JSON.stringify(actual)!==JSON.stringify(inherited))throw Error('Inherited artifacts differ')
const packaging=['Dockerfile','Dockerfile.prebuilt','Dockerfile.storefront','compose.yaml','scripts/build-prepared-images.sh','scripts/configure.mjs','scripts/test-compose.mjs','scripts/deployment/package-storefront.mjs','scripts/deployment/verify-package.mjs','scripts/deployment/storefront.mjs','scripts/deployment/health.mjs','tests/auth-hardening.test.ts','tests/native-product-targets.test.ts'].map(path=>({path,sha256:hash(readFileSync(path))}))
writeFileSync('verification/auth-packaging/SOURCE_PROVENANCE.json',JSON.stringify({status:'PASS',baseline,reviewed_packaging_source_sha:source,unchanged_application_source:true,compiled_evidence:'INHERITED_PR25_EXACT_SOURCE_OUTPUT_RECEIPT_NEWLY_COMPARED_NOT_REBUILT',inherited_tested_application_sha:'fb9daec7a947f234e7931c63f62d70e92e273c76',compiled_receipt:actual,packaging_files:packaging,packaging_aggregate:hash(JSON.stringify(packaging)),new_functional_test_evidence:'SEPARATE_REVIEWER_RUNTIME_RECEIPTS',at:new Date().toISOString()},null,2)+'\n')
console.log('PASS: exact baseline, unchanged application artifacts, packaging source hashes')
