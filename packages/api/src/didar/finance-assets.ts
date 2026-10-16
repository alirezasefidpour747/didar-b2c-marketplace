import {appendEvent,big,finText,finLock} from './finance';
/** Read-only financial projections of the existing physical registry, never a replacement stock source. */
export async function recordIntake(c:any,batchId:string,actor:string){
 await finLock(c);
 const b=(await c.query('SELECT * FROM didar_intake_batch WHERE id=$1',[batchId])).rows[0];
 const contract=(await c.query(`SELECT t.* FROM didar_fin_contract t JOIN didar_fin_contract_review r ON r.contract_id=t.id WHERE t.supplier_id=$1 AND r.approved AND t.effective_at<=now() ORDER BY t.effective_at DESC,t.version DESC LIMIT 1`,[b.supplier_id])).rows[0];
 const {rows:lines}=await c.query('SELECT l.*,sum(i.weight_mg::bigint*i.purity)::text fine_ug FROM didar_intake_line l JOIN didar_inventory_item i ON i.line_id=l.id AND i.status<>\'void\' WHERE l.batch_id=$1 GROUP BY l.id ORDER BY l.id',[batchId]);
 for(const l of lines)await appendEvent(c,{intent:'receipt:'+l.id,kind:(!contract||contract.ownership==='CONSIGNMENT')?'INTAKE_MEMO':'INTAKE_RECEIPT',supplier_id:b.supplier_id,actor_id:actor,snapshot:{batch_id:b.id,invoice_line_id:l.id,invoice_number:b.invoice_number,tahesab_reference:b.tahesab_reference,quantity:l.quantity,weight_mg:l.total_weight_mg,purity:l.purity,fine_ug:l.fine_ug,ownership:contract?.ownership||'CONSIGNMENT',recognition:'custody_and_stock_acceptance_only',external_payable:false}});
}
export async function saleAssetSnapshot(c:any,item:any){
 if(!item.item_id)return {physical_fine_ug:'0',valuation_status:'LEGACY_UNSERIALIZED'};
 const physical=(await c.query('SELECT (weight_mg::bigint*purity)::text fine_ug FROM didar_inventory_item WHERE id=$1',[item.item_id])).rows[0];
 const {rows:[v]}=await c.query(`SELECT e.id,e.snapshot,x.value item FROM didar_fin_event e CROSS JOIN LATERAL jsonb_array_elements(e.snapshot->'items') x WHERE e.kind='JEWELRY_VALUATION' AND x.value->>'item_id'=$1`,[item.item_id]);
 const memo=!!(await c.query("SELECT id FROM didar_fin_event WHERE kind='INTAKE_MEMO' AND snapshot->>'invoice_line_id'=$1",[item.invoice_line_id])).rowCount;
 return {physical_fine_ug:physical.fine_ug,owned_cost_irr:v?.item.cost_irr||null,valuation_event_id:v?.id||null,valuation_status:v?'DOCUMENTED_QA_COST':'NO_OWNED_COST_DOCUMENT',memo_intake:memo&&!v};
}
export async function recordPhysicalReturn(c:any,reservation:string,actor:string){
 await finLock(c);
 const sale=(await c.query("SELECT * FROM didar_fin_event WHERE kind='SALE_EXPOSURE' AND reservation_id=$1",[reservation])).rows[0];
 if(sale?.snapshot.memo_intake)await appendEvent(c,{intent:'physical-return:'+reservation,kind:'PHYSICAL_RETURN_MEMO',source_event_id:sale.id,supplier_id:sale.supplier_id,order_line_id:sale.order_line_id,reservation_id:reservation,actor_id:actor,snapshot:{fine_ug:sale.snapshot.physical_fine_ug,invoice_line_id:sale.snapshot.invoice_line_id,batch_id:sale.snapshot.invoice_id,physical_return_only:true,bank_execution:false}});
}
export async function valueJewelry(c:any,u:any,b:any){
 const batch=finText(b.batch_id),cost=big(b.cost_irr,true),document=finText(b.document),reason=finText(b.reason,1000);
 const existing=(await c.query('SELECT * FROM didar_fin_event WHERE intent=$1',['jewelry-value:'+batch])).rows[0];
 if(existing){if(existing.snapshot.cost_irr!==cost.toString()||existing.snapshot.document!==document)throw new Error('CONFLICT_IDEMPOTENCY');return {event:existing};}
 const contract=(await c.query(`SELECT t.ownership FROM didar_fin_contract t JOIN didar_fin_contract_review r ON r.contract_id=t.id JOIN didar_intake_batch b ON b.supplier_id=t.supplier_id WHERE b.id=$1 AND r.approved AND t.effective_at<=now() ORDER BY t.effective_at DESC,t.version DESC LIMIT 1`,[batch])).rows[0];
 if(!contract||!['DIDAR_OWNED','BUY_TO_RESELL'].includes(contract.ownership))throw new Error('CONFLICT_OWNERSHIP_CONTRACT');
 const receipt=(await c.query("SELECT * FROM didar_intake_batch WHERE id=$1 AND status='posted'",[batch])).rows[0];if(!receipt)throw new Error('NOT_FOUND');
 const {rows:items}=await c.query("SELECT i.id item_id,i.uid,i.status,(i.weight_mg::bigint*i.purity)::text fine_ug FROM didar_inventory_item i JOIN didar_intake_line l ON l.id=i.line_id WHERE l.batch_id=$1 AND i.status<>'void' ORDER BY i.id",[batch]);
 if(!items.length||items.some((i:any)=>!['available','withdrawn'].includes(i.status)))throw new Error('CONFLICT_STOCK_VALUATION');
 const fine=items.reduce((n:bigint,i:any)=>n+BigInt(i.fine_ug),0n);let assigned=0n;
 for(let n=0;n<items.length;n++){const amount=n===items.length-1?cost-assigned:cost*BigInt(items[n].fine_ug)/fine;items[n].cost_irr=amount.toString();assigned+=amount;}
 const memo=!!(await c.query("SELECT id FROM didar_fin_event WHERE kind='INTAKE_MEMO' AND snapshot->>'batch_id'=$1",[batch])).rowCount;
 const event=await appendEvent(c,{intent:'jewelry-value:'+batch,kind:'JEWELRY_VALUATION',supplier_id:receipt.supplier_id,actor_id:u.id,snapshot:{batch_id:batch,items,fine_ug:fine.toString(),cost_irr:cost.toString(),document,reason,memo_intake:memo,synthetic:true,title:'DIDAR_OWNED_CONFIRMED_BY_QA_DOCUMENT',statutory_approval:'PENDING'}});
 return {event};
}
