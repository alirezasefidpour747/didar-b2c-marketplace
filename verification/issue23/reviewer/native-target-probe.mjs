import assert from 'node:assert/strict'
import {join} from 'node:path'
import {atomic} from './common.mjs'
export async function probe({api,dir,runId,pg,docker}) {
 const sql=q=>docker(['exec',pg.id,'psql','-U','postgres','-d','didar_qa','-At','-v','ON_ERROR_STOP=1','-c',q]);const rows=q=>JSON.parse(sql('SELECT coalesce(json_agg(x),\'[]\'::json) FROM ('+q+') x'))
 const send=async(method,path,body,token='')=>{const r=await fetch(api+path,{method,headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(30000)});return {status:r.status,body:await r.json()}}
 const login=await send('POST','/auth/user/emailpass',{email:'native-admin@didar.test',password:'DidarNative2026!'});assert.equal(login.status,200);const token=login.body.token;assert.ok(token)
 const linked=rows('SELECT p.id,p.native_id,v.id variant_id FROM didar_product p JOIN product_variant v ON v.product_id=p.native_id WHERE v.deleted_at IS NULL ORDER BY p.id LIMIT 2');assert.equal(linked.length,2)
 const before=rows("SELECT (SELECT count(*) FROM didar_product) products,(SELECT count(*) FROM didar_offer) offers,(SELECT count(*) FROM didar_inventory_item) uids,(SELECT count(*) FROM didar_order) orders,(SELECT count(*) FROM didar_fin_event) events")
 const unrelated=await send('POST','/admin/products',{title:'Independent unlinked native fixture',status:'draft'},token)
 assert.equal(unrelated.status,200,JSON.stringify(unrelated.body));const parent=unrelated.body.product.id;assert.ok(parent);assert.equal(rows("SELECT id FROM didar_product WHERE native_id='"+parent+"'").length,0)
 const expectedBlock=await send('DELETE','/admin/products/'+linked[0].native_id+'/variants/'+linked[0].variant_id,undefined,token);assert.equal(expectedBlock.status,409)
 const direct=await send('DELETE','/admin/products/'+parent+'/variants/'+linked[0].variant_id,undefined,token)
 const afterDirect=rows("SELECT id,product_id,deleted_at FROM product_variant WHERE id='"+linked[0].variant_id+"'");assert.equal(direct.status,200,JSON.stringify(direct.body));assert.ok(afterDirect[0]?.deleted_at,'Actual DIDAR variant was soft-deleted despite unrelated URL parent')
 const batch=await send('POST','/admin/products/'+parent+'/variants/batch',{delete:[linked[1].variant_id]},token)
 const afterBatch=rows("SELECT id,product_id,deleted_at FROM product_variant WHERE id='"+linked[1].variant_id+"'");assert.equal(batch.status,200,JSON.stringify(batch.body));assert.ok(afterBatch[0]?.deleted_at,'Batch referenced DIDAR variant soft-deleted')
 const after=rows("SELECT (SELECT count(*) FROM didar_product) products,(SELECT count(*) FROM didar_offer) offers,(SELECT count(*) FROM didar_inventory_item) uids,(SELECT count(*) FROM didar_order) orders,(SELECT count(*) FROM didar_fin_event) events");assert.deepEqual(after,before)
 atomic(join(dir,'NATIVE01-actual-variant-target.json'),{run_id:runId,status:'REPRODUCED',ordinary_linked_parent_delete:{status:expectedBlock.status,message:expectedBlock.body.message},unrelated_parent:parent,linked_targets:linked,forged_parent_single_delete:{status:direct.status,deleted:direct.body.deleted,actual_variant:afterDirect},forged_parent_batch_delete:{status:batch.status,deleted:batch.body.deleted,actual_variant:afterBatch},canonical_authorities_before:before,canonical_authorities_after:after,meaning:'Authenticated native Admin bypasses canonical projection guard via unrelated parent; native variants deleted while canonical Product/Offer/UID/order/financial authorities unchanged.'})
}
