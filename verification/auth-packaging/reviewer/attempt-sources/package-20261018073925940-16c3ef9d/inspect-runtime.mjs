// Independent tool copied only into /tmp of the immutable application container.
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {readFileSync,readdirSync,lstatSync,realpathSync,existsSync} from 'node:fs'
import {join,relative} from 'node:path'
import {createHash} from 'node:crypto'
const role=process.argv[2],root='/app',hash=b=>createHash('sha256').update(b).digest('hex'),links=[],files=[]
function walk(path){const s=lstatSync(path),rel=relative(root,path);if(s.isSymbolicLink()){const actual=realpathSync(path);assert.ok(actual.startsWith(root+'/'),'External dependency link '+rel);links.push({path:rel,realpath:actual});return}if(s.isDirectory()){for(const n of readdirSync(path).sort())walk(join(path,n))}else if(s.isFile()){assert.ok(!/^\.env(?:\.|$)/.test(path.split('/').at(-1))||path.endsWith('.env.template'),'Unexpected environment file');files.push({path:rel,sha256:hash(readFileSync(path))})}}
assert.ok(['api','storefront'].includes(role));assert.ok(!existsSync('/app/.git'));walk(root)
const require=createRequire('/app/'+(role==='api'?'packages/api/package.json':'package.json')),auth=require.resolve('@didar/auth-network');assert.ok(realpathSync(auth).startsWith(root+'/'))
const value={role,status:'PASS',root,node:process.versions.node,platform:process.platform,arch:process.arch,files:files.length,content_sha256:hash(JSON.stringify(files)),internal_symlinks:links.length,external_symlinks:0,auth_module:realpathSync(auth),auth_module_sha256:hash(readFileSync(auth))}
if(role==='storefront'){assert.equal(links.length,0);const manifest=JSON.parse(readFileSync('/app/PACKAGING.json'));assert.equal(hash(JSON.stringify(manifest.files)),manifest.content_sha256);for(const f of manifest.files)assert.equal(hash(readFileSync(join(root,f.path))),f.sha256);value.package_manifest={source_sha:manifest.source_sha,files:manifest.files.length,content_sha256:manifest.content_sha256,entrypoint:manifest.entrypoint};assert.ok(existsSync('/app/apps/storefront/auth-ingress.mjs'));assert.ok(existsSync('/app/runtime/storefront.mjs'))}else{value.test_sources=['tests/auth-hardening.test.ts','tests/native-product-targets.test.ts'].map(path=>({path,sha256:hash(readFileSync(join(root,path)))}));value.guard_source=hash(readFileSync('/app/packages/api/.medusa/server/src/didar/native-product-guard.js'));value.auth_source=hash(readFileSync('/app/packages/api/.medusa/server/src/didar/auth-admission.js'))}
console.log(JSON.stringify(value))
