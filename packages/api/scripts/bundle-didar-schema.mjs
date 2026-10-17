import {copyFileSync,mkdirSync,readdirSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {resolve,dirname} from 'node:path'
const api=resolve(dirname(fileURLToPath(import.meta.url)),'..')
const source=resolve(api,'src/didar'),target=resolve(api,'.medusa/server/src/didar')
mkdirSync(target,{recursive:true})
let count=0
for(const file of readdirSync(source))if(file.endsWith('.sql')||file==='facet-vocabulary.json'){
 copyFileSync(resolve(source,file),resolve(target,file));count++
}
console.log(`[bundle-didar-schema] bundled ${count} additive SQL/vocabulary resources for artifact-only deployments.`)
