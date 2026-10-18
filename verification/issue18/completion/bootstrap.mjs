import {createRequire} from 'node:module'
import {join} from 'node:path'
import {atomic,event} from './common.mjs'
export async function bootstrap({env,scratch,dir,runId}){
 const url=new URL(env.DATABASE_URL||'invalid:');if(env.DIDAR_DISPOSABLE_QA!=='true'||env.DIDAR_ENVIRONMENT!=='local'||env.DIDAR_PAYMENT_MODE!=='sandbox'||url.hostname!=='127.0.0.1'||url.pathname!=='/didar_qa')throw Error('Owned loopback disposable sandbox required')
 const require=createRequire(join(scratch,'package.json'));const {Pool}=require(join(scratch,'packages/api/node_modules/pg'));const db=new Pool({connectionString:env.DATABASE_URL});try{
 const before=(await db.query("SELECT user_id,actor_type,actor_id FROM didar_native_actor ORDER BY user_id,actor_type,actor_id")).rows
 // Reproduce the original backend suites' afterAll boundary without executing
 // those suites. These synthetic accounts must prove dual identities in the
 // unchanged native browser journeys; existing content-editor linkage stays.
 const removed=(await db.query("DELETE FROM didar_native_actor WHERE user_id=ANY($1::text[]) RETURNING user_id,actor_type,actor_id",[['demo-admin','demo-supplier','native-staff-canonical']])).rows
 await db.query('DELETE FROM didar_login_attempt')
 const after=(await db.query("SELECT user_id,actor_type,actor_id FROM didar_native_actor ORDER BY user_id,actor_type,actor_id")).rows
 const preserved=before.filter(r=>!['demo-admin','demo-supplier','native-staff-canonical'].includes(r.user_id));if(JSON.stringify(after)!==JSON.stringify(preserved))throw Error('QA bootstrap modified another actor link')
 const counts=(await db.query("SELECT (SELECT count(*) FROM didar_native_acl)::int acls,(SELECT count(*) FROM didar_product)::int products,(SELECT count(*) FROM didar_offer)::int offers,(SELECT count(*) FROM didar_order)::int orders,(SELECT count(*) FROM didar_fin_event)::int events,(SELECT count(*) FROM didar_sale_mandate)::int mandates,(SELECT count(*) FROM didar_storefront WHERE supplier_id='s1')::int s1_stores,(SELECT count(*) FROM didar_content_page WHERE supplier_id='s1' AND kind='MERCHANT_HOME')::int s1_homes")).rows[0]
 if(counts.acls!==0||counts.products!==4||counts.offers!==8||counts.orders!==0||counts.events!==0||counts.mandates!==0||counts.s1_stores!==0||counts.s1_homes!==0)throw Error('Fresh QA prerequisite shape differs; no fixture repair attempted')
 const stock=(await db.query("SELECT id,quantity,stock_mode FROM didar_offer ORDER BY id")).rows;if(stock.some(o=>o.quantity!==10||o.stock_mode!=='legacy'))throw Error('Unexpected initial demo stock')
 const receipt={run_id:runId,status:'PASS',removed_only_synthetic_actor_links:removed,preserved_actor_links:after,counts,stock,changes:'Only original exact-three QA link cleanup and synthetic login-window reset. No native ACL, inventory, financial, approval, order or mandate facts added.',backend_tooling_jest_g4_restore_executed:false}
 atomic(join(dir,'bootstrap.json'),receipt,{once:true});event(dir,'bootstrap_complete',{counts});return receipt
 }finally{await db.end()}
}
