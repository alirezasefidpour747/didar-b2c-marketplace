import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../../", import.meta.url));
const filename = fileURLToPath(new URL("../../../packages/api/src/didar/catalog.ts", import.meta.url));
const source = readFileSync(filename, "utf8");
const body = source.slice(source.indexOf("async function saveProduct("), source.indexOf("async function approved("))
  .replace(/await import\("@medusajs\/medusa\/core-flows"\)/g, "nativeWorkflows")
  .replace(/await import\("@mercurjs\/core\/workflows"\)/g, "nativeWorkflows");
const js = new Bun.Transpiler({loader:"ts"}).transformSync(body);
const nativeWrites: any[] = [];
for (const active of [false,true]) for (const published of [false,true]) for (const approved of [false,true]) {
nativeWrites.length=0;
const old = { id:"QA_SOURCE_ONLY", native_id:"QA_NATIVE_SOURCE_ONLY", title:"Original", description:"Original", purity:750, active, published, approved };
const updates = { updateProductsWorkflow: () => ({run:async ({input}:any) => {nativeWrites.push(input.products[0]);}}) };
let canonicalFailed = false;
const c = {query:async (sql:string) => {
  if(sql.startsWith("SELECT * FROM didar_product")) return {rows:[old]};
  if(sql.includes("didar_taxonomy_valid")) return {rows:[{valid:true}]};
  if(sql.startsWith("INSERT INTO didar_product")) {canonicalFailed=true; throw Error("QA_INJECTED_CANONICAL_WRITE_FAILURE");}
  return {rows:[],rowCount:0};
}};
const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
const run = new AsyncFunction("req","u","b","c","productInput","text","randomUUID","audit","nativeWorkflows", js+"\nreturn saveProduct(req,u,b,c)");
try { await run({scope:{}},{id:"QA_ADMIN"},{id:old.id},c,()=>({...old,slug:"qa",attributes:{},category_id:null,min_weight_mg:null,max_weight_mg:null}), (x:any)=>x,()=>"QA_UNUSED",async()=>{},updates); throw Error("Expected failure missing"); }
catch(e:any) {if(e.message!=="QA_INJECTED_CANONICAL_WRITE_FAILURE") throw e;}
if(!canonicalFailed || nativeWrites.length!==2 || nativeWrites[0].status!==(active&&published&&approved?"published":"draft") || nativeWrites[1].status!==(active&&published&&approved?"published":"draft")) throw Error("Reproduction did not match observed source defect");
console.log(JSON.stringify({scope:"isolated extracted current saveProduct source; SQL/native workflow fakes; no HTTP/PostgreSQL",canonicalFailure:canonicalFailed,nativeStatuses:nativeWrites.map(x=>x.status),originalActive:old.active,originalPublished:old.published,originalApproved:old.approved,result:"VERIFIED_COMPENSATION_PUBLICATION_PRESERVED"}));

}
