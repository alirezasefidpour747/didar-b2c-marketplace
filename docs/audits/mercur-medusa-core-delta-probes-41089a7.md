# Work #02 — Independent delta probe appendix

Target: `41089a7a0ac8084b74bb3a7f128f9a9ca038528b`.

[Read findings, qualifications and F01–F12 dispositions](mercur-medusa-core-delta-41089a7.md).

## Scope

These probes evaluate selected **actual source functions**, with imports replaced by explicit in-memory doubles. They perform no network requests or database operations. SQL strings are captured or answered with controlled rows. They do not exercise SQL semantics, Mercur middleware composition or the running application. The installer probe captures resource loading/branching; it is not a database migration run.

The permission catalog is a representative subset supplied to the actual resolver; it demonstrates branch behavior, not the full production permission registry. An inactive/pending supplier scenario establishes that this resolver branch never reads approval/status; it does not emulate an entire lifecycle or prove HTTP access.

Node 24.19.0 was used. No project dependency installation is required. Source TypeScript is type-stripped with Node's built-in API and imports are replaced for isolated evaluation. The final run passed 12 scenario groups. The read-only source checkout remained clean. No probe script, fixture or application test is added to the repository by this documentation PR.

## Reproduce

Use a clean checkout pinned to the target. Save the following harness outside the repository and set `AUDIT_SOURCE_ROOT` to the absolute checkout path. Run it using Node 24.19.0. Do not run the application or point this harness at a live database. The harness contains no database client or network transport.

```javascript
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { stripTypeScriptTypes } from 'node:module';
const root=process.env.AUDIT_SOURCE_ROOT;
assert(root, 'Set AUDIT_SOURCE_ROOT to a clean checkout of target 41089a7');
const results=[];
function load(rel, globals={}, replacement='') {
 let s=stripTypeScriptTypes(fs.readFileSync(path.join(root,rel),'utf8'));
 s=s.replace(/^import[\s\S]*?from\s*["'][^"']+["'];?\s*$/gm,'');
 s=s.replace('export default class PermissionsService','class PermissionsService').replace('export default async function seed','async function seed').replace('export async function nativeVendorPrivacy','async function nativeVendorPrivacy');
 s=s.replace(/export (async )?function /g,(_,a)=> (a||'')+'function ');
 s=s.replace(/export const /g,'const ');
 const ctx=vm.createContext({...globals});
 vm.runInContext(s+'\n'+replacement,ctx);return ctx;
}
const catalog=[{key:'products',surface:['admin','vendor'],rights:['view','edit','manage']},{key:'orders',surface:['admin','vendor'],rights:['view','edit','manage']},{key:'payments',surface:['admin','vendor'],rights:['view','edit']},{key:'store',surface:['admin','vendor'],rights:['view','edit']},{key:'payout_accounts',surface:['vendor'],rights:['view','edit']},{key:'didar.content',surface:['admin','vendor'],rights:['view','edit','manage']}];
async function permissions(name,{native,link,policy,members=[]},expect) {
 const queries=[];
 const db={query:async(sql,args)=>{queries.push(sql);let rows=[];
 if(sql.includes('FROM "user"')||sql.includes('FROM seller_member'))rows=native?[native]:[];
 else if(sql.includes('FROM didar_native_actor'))rows=link?[link]:[];
 else if(sql.includes('FROM didar_native_acl'))rows=policy?[policy]:[];
 else if(sql.includes('FROM didar_native_seller'))rows=[{ok:1}];
 else if(sql.includes('FROM didar_merchant_member'))rows=members;
 else if(sql.includes('FROM didar_content_operator'))rows=[];
 else throw Error('Unexpected query '+sql);
 return {rows,rowCount:rows.length};}};
 const ctx=load('packages/api/src/modules/didar-permissions/service.ts',{db},'globalThis.Service=PermissionsService;');
 const actor={actor_type:name.startsWith('admin')?'user':'member',actor_id:'probe',seller_id:'storeA',surface:name.startsWith('admin')?'admin':'vendor'};
 const actual=JSON.parse(JSON.stringify(await new ctx.Service().resolvePermissions(actor,catalog)));expect(actual);results.push({name,actual,query_count:queries.length});
}
await permissions('admin unbound',{native:{id:'admin'}},r=>assert.deepEqual(r,{}));
await permissions('member unbound nonowner',{native:{is_owner:false}},r=>assert.deepEqual(r,{store:'view'}));
await permissions('member unbound owner',{native:{is_owner:true}},r=>assert.equal(r.orders,'manage'));
await permissions('member supplier, inactive/pending state not read',{native:{is_owner:true},link:{active:true,id:'didar',role:'supplier',supplier_id:'s1'}},r=>assert.equal(r.payments,'edit'));
await permissions('member staff selected-store grant',{native:{is_owner:false},link:{active:true,id:'staff',role:'customer'},members:[{permission:'CONTENT_EDIT'}]},r=>assert.deepEqual(r,{store:'view','didar.content':'edit'}));
await permissions('member revoked bridge',{native:{is_owner:true},link:{active:false,role:'supplier'}},r=>assert.deepEqual(r,{}));
await permissions('member explicit ACL narrows',{native:{is_owner:true},link:{active:true,id:'didar',role:'supplier',supplier_id:'s1'},policy:{active:true,rights:{products:'view'}}},r=>assert.deepEqual(r,{products:'view'}));
for(const environment of [{DIDAR_SEED_DEMO:'false',DIDAR_ENVIRONMENT:'local',NODE_ENV:'development'},{DIDAR_SEED_DEMO:'false',DIDAR_ENVIRONMENT:'staging',NODE_ENV:'production'}]){
 const calls=[];const db={query:async(sql)=>{calls.push(sql);return {rows:[],rowCount:0}},end:async()=>{}};
 const ctx=load('packages/api/src/scripts/didar-seed.ts',{db,fs,path,process:{env:environment,cwd:()=>path.join(root,'packages/api')},console:{log(){}},transaction:async(fn)=>fn({query:db.query}),seedFacetVocabulary:async()=>{},projectExisting:async()=>{},starterPreset:()=>[]},'globalThis.seed=seed;');
 await ctx.seed({container:{}});
 for(const table of ['didar_native_actor','didar_native_seller','didar_native_acl'])assert(calls.some(sql=>sql.includes('CREATE TABLE IF NOT EXISTS '+table)));
 assert(calls.some(sql=>sql.includes('CREATE OR REPLACE FUNCTION didar_native_saleable_supplier')));
 assert(!calls.some(sql=>sql.includes('INSERT INTO didar_user(')));
 results.push({name:'non-demo installer orchestration, mocked SQL, '+environment.DIDAR_ENVIRONMENT,required_sql_seen:true,identity_insert_seen:false,query_count:calls.length});
}
// Actual response-redaction function, mocked read-only resolver and membership SELECT.
let output;const privacy=load('packages/api/src/didar/native-vendor-privacy.ts',{db:{query:async()=>({rows:[{seller_id:'A'},{seller_id:'B'}]})},getPermissionCatalog:()=>catalog},'globalThis.privacy=nativeVendorPrivacy;');
// Redactor intercepts a mutable response; repeat with held response to exercise payload.
const response={json:v=>{output=v}};
await privacy.privacy({auth_context:{actor_id:'person'},scope:{resolve:()=>({resolvePermissions:async a=>a.seller_id==='A'?{payout_accounts:'view',store:'edit'}:{store:'view'}})}},response,()=>{});
response.json({seller_members:[{seller:{id:'A',payment_details:{bank:'A-secret'},professional_details:{tax:'A'}}},{seller:{id:'B',payment_details:{bank:'B-secret'},professional_details:{tax:'B'}}}]});
assert(output.seller_members[0].seller.payment_details);assert(!output.seller_members[1].seller.payment_details);assert(!output.seller_members[1].seller.professional_details);
results.push({name:'per-seller bootstrap bank/legal redaction',own_authorized_kept:true,rival_redacted:true});
// Legacy token resolves canonical authority without reading a native ACL.
const authQueries=[];
const auth=load('packages/api/src/didar/auth.ts',{nativeUser:()=>undefined,createHash,process:{env:{DIDAR_ENVIRONMENT:'local'}},db:{query:async sql=>{authQueries.push(sql);assert(!sql.includes('didar_native_acl'));return {rows:[{id:'person',email:'probe@example.invalid',role:'admin'}]};}}},'globalThis.sessionUserProbe=sessionUser;');
const legacy=await auth.sessionUserProbe({headers:{authorization:'Bearer synthetic-review-token'}});
assert.equal(legacy.role,'admin');assert.equal(authQueries.length,1);
results.push({name:'legacy DIDAR session keeps canonical role without native ACL query',role:legacy.role,queries:authQueries.length});
// Execute only the path validator, avoiding React/JSX and browser APIs.
let handoff=fs.readFileSync(path.join(root,'packages/didar-ui/src/native-handoff.tsx'),'utf8');
handoff=handoff.slice(handoff.indexOf('const feature ='),handoff.indexOf('/** Public SDK route.'));
handoff=stripTypeScriptTypes(handoff).replace('export function safeNativeReturn','function safeNativeReturn');
const hc=vm.createContext({URL});vm.runInContext(handoff+';globalThis.check=safeNativeReturn;',hc);
for(const s of ['/didar','/didar/pages/preview/v-42','/didar?product_id=ring','/didar/orders/order-123'])assert.equal(hc.check(s),s);
for(const s of ['https://evil.test/didar','//evil.test/didar','/didar/../orders','/didar/%2e%2e/orders','/didar?token=secret','/didar?product_id=a&product_id=b','/didar#secret'])assert.equal(hc.check(s),null);
results.push({name:'actual safeNativeReturn function',accepted:4,rejected:7});
console.log(JSON.stringify({scope:'In-memory source-function probes only; SQL mocked; no database/network/application services',results},null,2));

```

## Captured successful output

```json
{
  "scope": "In-memory source-function probes only; SQL mocked; no database/network/application services",
  "results": [
    {
      "name": "admin unbound",
      "actual": {},
      "query_count": 3
    },
    {
      "name": "member unbound nonowner",
      "actual": {
        "store": "view"
      },
      "query_count": 3
    },
    {
      "name": "member unbound owner",
      "actual": {
        "products": "manage",
        "orders": "manage",
        "payments": "edit",
        "store": "edit",
        "payout_accounts": "edit",
        "didar.content": "manage"
      },
      "query_count": 3
    },
    {
      "name": "member supplier, inactive/pending state not read",
      "actual": {
        "products": "manage",
        "orders": "manage",
        "payments": "edit",
        "store": "edit",
        "payout_accounts": "edit",
        "didar.content": "manage"
      },
      "query_count": 4
    },
    {
      "name": "member staff selected-store grant",
      "actual": {
        "store": "view",
        "didar.content": "edit"
      },
      "query_count": 4
    },
    {
      "name": "member revoked bridge",
      "actual": {},
      "query_count": 3
    },
    {
      "name": "member explicit ACL narrows",
      "actual": {
        "products": "view"
      },
      "query_count": 4
    },
    {
      "name": "non-demo installer orchestration, mocked SQL, local",
      "required_sql_seen": true,
      "identity_insert_seen": false,
      "query_count": 21
    },
    {
      "name": "non-demo installer orchestration, mocked SQL, staging",
      "required_sql_seen": true,
      "identity_insert_seen": false,
      "query_count": 21
    },
    {
      "name": "per-seller bootstrap bank/legal redaction",
      "own_authorized_kept": true,
      "rival_redacted": true
    },
    {
      "name": "legacy DIDAR session keeps canonical role without native ACL query",
      "role": "admin",
      "queries": 1
    },
    {
      "name": "actual safeNativeReturn function",
      "accepted": 4,
      "rejected": 7
    }
  ]
}
```

## Independent baseline equality checks

The following 10 target files were independently compared byte-for-byte with `git show 0aeec24d2292fb3e60848ac2deaa68b76a478ded:<path>`. These checks prove source equality for these paths, not whole-system behavioral equality or historical database fingerprints.

```json
[
  {
    "file": "bun.lock",
    "unchanged_from_baseline": true,
    "sha256": "615c4d60bb46757e96ecacd0983639bb9ededd9bd5d79bb9c9515e33731a63b7"
  },
  {
    "file": "packages/api/src/didar/schema.sql",
    "unchanged_from_baseline": true,
    "sha256": "eae09c4e5e3d150b6388cdfc96077ac54b61399c670fa7fd4b18c7f74f7473a2"
  },
  {
    "file": "packages/api/src/didar/phase1-schema.sql",
    "unchanged_from_baseline": true,
    "sha256": "1332813368e9ca9553730a354f72380165029a92a757aa06dd616f0db1e9708f"
  },
  {
    "file": "packages/api/src/didar/item-stock.ts",
    "unchanged_from_baseline": true,
    "sha256": "fde68139b9ba54b15178e0eedc7f2f512d42ba995f6c570864916477472344e3"
  },
  {
    "file": "packages/api/src/didar/finance-schema.sql",
    "unchanged_from_baseline": true,
    "sha256": "a2666c63559b7e88a79b1ff080d9c5f3a9243a3c892602f2e775740d33a81ba2"
  },
  {
    "file": "packages/api/src/didar/finance-ledger-schema.sql",
    "unchanged_from_baseline": true,
    "sha256": "2284745a4e9492255ff14a2cdaa34b99ee40730cdfc621551925bafb7bc5caa0"
  },
  {
    "file": "packages/api/src/didar/finance.ts",
    "unchanged_from_baseline": true,
    "sha256": "910fe57f7ef918dcff6c5200e05f8bfe7f372486c5d92aff0439015bf398cb66"
  },
  {
    "file": "packages/api/src/didar/finance-ledger.ts",
    "unchanged_from_baseline": true,
    "sha256": "96da5fbe14c4dfef8739de8b6b2d2ef8fa4fa4e8cdac2ced6c66332788c340f5"
  },
  {
    "file": "packages/api/src/didar/payment-provider.ts",
    "unchanged_from_baseline": true,
    "sha256": "35fd0269daf4953d7f06df87a2d3af281120b2b105cbb8b10dd80e29e1e59f01"
  },
  {
    "file": "packages/api/src/didar/tahesab-contract.ts",
    "unchanged_from_baseline": true,
    "sha256": "ecffab530fcaa59a8308e837c8fe49fa5e9008effe4a9b4060d37af6dd8220db"
  }
]
```
