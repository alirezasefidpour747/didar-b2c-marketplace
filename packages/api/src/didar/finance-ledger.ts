/** One journal per financial business event. Positive delta=debit, negative=credit.
 * Gold obligations and IRR valuation are independently balanced, never summed together. */
import {randomUUID} from 'node:crypto';
const round=(n:bigint,d:bigint)=>(n+d-1n)/d;
type Posting={account:string,party:string,instrument:string,delta:bigint};
const financialKinds=['SALE_EXPOSURE','REFUND','PURCHASE','ALLOCATION','TITLE_TRANSFER','GOLD_SETTLEMENT','RIAL_SETTLEMENT','FACT_REVERSED','SETTLEMENT_REVERSED','WALLET_FUND','WALLET_RELEASE','WALLET_RESERVE','WALLET_UNRESERVE','WALLET_PLEDGE','WALLET_UNPLEDGE','WALLET_TRANSFER','PAYABLE_TO_WALLET','INTAKE_MEMO','JEWELRY_VALUATION','PHYSICAL_RETURN_MEMO','INTAKE_RECEIPT','PHYSICAL_HANDOVER','PROCUREMENT_ASSIGNED','PROCUREMENT_ASSIGNMENT_REVERSED'];
async function goldLiability(c:any,sale:string,party:string,amount:bigint,rate:bigint){
 const {rows}=await c.query(`SELECT p.account,(-sum(p.delta))::text remaining FROM didar_fin_posting p JOIN didar_fin_journal j ON j.id=p.journal_id JOIN didar_fin_event e ON e.id=j.event_id WHERE (e.id=$1 OR e.source_event_id=$1) AND p.party=$2 AND p.account IN ('SUPPLIER_GOLD_PAYABLE','SUPPLIER_GOLD_VALUATION') GROUP BY p.account`,[sale,party]);
 const qty=BigInt(rows.find((r:any)=>r.account==='SUPPLIER_GOLD_PAYABLE')?.remaining||0),value=BigInt(rows.find((r:any)=>r.account==='SUPPLIER_GOLD_VALUATION')?.remaining||0);
 return amount===qty?value:amount*rate/750000n;
}
export async function projectEvent(c:any,e:any){
 if(!financialKinds.includes(e.kind))return;
 if((await c.query('SELECT id FROM didar_fin_journal WHERE event_id=$1',[e.id])).rowCount)return;
 const s=e.snapshot,lines:Posting[]=[];
 const add=(account:string,instrument:string,delta:bigint,party='DIDAR')=>{if(delta!==0n)lines.push({account,instrument,delta,party})};
 const pair=(debit:string,credit:string,instrument:string,n:bigint,dp='DIDAR',cp='DIDAR')=>{add(debit,instrument,n,dp);add(credit,instrument,-n,cp)};
 let costBasis=BigInt(s.cost_basis_irr||0);
 if(s.cost_basis_irr===undefined&&s.purchase_id&&s.amount_ug){const p=(await c.query('SELECT snapshot FROM didar_fin_event WHERE id=$1',[s.purchase_id])).rows[0];if(p)costBasis=BigInt(p.snapshot.cost_irr)*BigInt(s.amount_ug)/BigInt(p.snapshot.fine_ug);}
 const supplier='supplier:'+e.supplier_id,rate=BigInt(s.rate_irr||0),gold=BigInt(e.gold_ug),irr=BigInt(e.irr),value=(n:bigint)=>round(n*rate,750000n);
 if(e.kind==='SALE_EXPOSURE'){
   const total=BigInt(s.customer_payment_irr),vat=BigInt(s.price.tax_irr)*BigInt(s.quantity),goldValue=value(gold),payable=goldValue+irr;
   add('CASH_CLEARING','IRR',total);add('VAT_PAYABLE','IRR',-vat);
   add('SUPPLIER_RIAL_PAYABLE','IRR',-irr,supplier);add('SUPPLIER_GOLD_VALUATION','IRR',-goldValue,supplier);
   add(s.ownership==='CONSIGNMENT'?'AGENT_REVENUE':'PRINCIPAL_REVENUE','IRR',-(total-vat-payable));
   pair('CONTRACT_GOLD_EXPENSE','SUPPLIER_GOLD_PAYABLE','GOLD_UG',gold,'DIDAR',supplier);
   if(!s.owned_cost_irr&&s.ownership!=='CONSIGNMENT'&&s.ownership!=='DIDAR_OWNED')pair('COGS','PRINCIPAL_REVENUE','IRR',payable);
   if(s.owned_cost_irr){pair('COGS','OWNED_JEWELRY','IRR',BigInt(s.owned_cost_irr));pair('GOLD_COGS','OWNED_JEWELRY','GOLD_UG',BigInt(s.physical_fine_ug));}
   if(s.memo_intake)pair('SUPPLIER_CONSIGNMENT_MEMO','CONSIGNMENT_CUSTODY','MEMO_GOLD_UG',BigInt(s.physical_fine_ug),supplier,'DIDAR');
 }else if(['REFUND','FACT_REVERSED','SETTLEMENT_REVERSED','PROCUREMENT_ASSIGNMENT_REVERSED'].includes(e.kind)){
   const original=e.kind==='SETTLEMENT_REVERSED'?s.reversed_event_id:e.source_event_id;
   const {rows}=await c.query('SELECT p.* FROM didar_fin_posting p JOIN didar_fin_journal j ON j.id=p.journal_id WHERE j.event_id=$1 ORDER BY p.id',[original]);
   if(!rows.length) return;
   for(const p of rows){if(e.kind==='REFUND'&&p.instrument==='MEMO_GOLD_UG')continue;add(p.account,p.instrument,-BigInt(p.delta),p.party);}
 }else if(e.kind==='PURCHASE'){
   pair('MELTED_GOLD_AVAILABLE','QA_TREASURY_CLEARING','IRR',BigInt(s.cost_irr));
   pair('MELTED_GOLD_AVAILABLE','QA_ACQUIRED_GOLD','GOLD_UG',BigInt(s.fine_ug));
 }else if(e.kind==='ALLOCATION'){
   pair('MELTED_GOLD_ALLOCATED','MELTED_GOLD_AVAILABLE','GOLD_UG',BigInt(s.amount_ug));
   pair('MELTED_GOLD_ALLOCATED','MELTED_GOLD_AVAILABLE','IRR',costBasis);
 }else if(e.kind==='TITLE_TRANSFER'){
   pair('TITLE_CLEARING','MELTED_GOLD_ALLOCATED','GOLD_UG',BigInt(s.amount_ug));
   pair('TITLE_CLEARING','MELTED_GOLD_ALLOCATED','IRR',costBasis);
 }else if(e.kind==='GOLD_SETTLEMENT'){
   const {rows:[sale]}=await c.query('SELECT snapshot FROM didar_fin_event WHERE id=$1',[e.source_event_id]);
   const liability=await goldLiability(c,e.source_event_id,supplier,-gold,BigInt(sale.snapshot.rate_irr)),cost=costBasis;
   pair('SUPPLIER_GOLD_PAYABLE','TITLE_CLEARING','GOLD_UG',-gold,supplier,'DIDAR');
   add('SUPPLIER_GOLD_VALUATION','IRR',liability,supplier);add('TITLE_CLEARING','IRR',-cost);add('GOLD_VALUATION_DIFFERENCE','IRR',cost-liability);
 }else if(e.kind==='RIAL_SETTLEMENT'){
   pair('SUPPLIER_RIAL_PAYABLE','QA_TREASURY_CLEARING','IRR',-irr,supplier,'DIDAR');
 }else if(e.kind==='INTAKE_MEMO'){
   pair('CONSIGNMENT_CUSTODY','SUPPLIER_CONSIGNMENT_MEMO','MEMO_GOLD_UG',BigInt(s.fine_ug),'DIDAR',supplier);
 }else if(e.kind==='PHYSICAL_RETURN_MEMO'){
   pair('CONSIGNMENT_CUSTODY','SUPPLIER_CONSIGNMENT_MEMO','MEMO_GOLD_UG',BigInt(s.fine_ug),'DIDAR',supplier);
 }else if(e.kind==='INTAKE_RECEIPT'){
   pair('OWNED_RECEIPT_MEMO','OWNED_RECEIPT_CONTROL_MEMO','MEMO_GOLD_UG',BigInt(s.fine_ug));
 }else if(e.kind==='PHYSICAL_HANDOVER'){
   pair('GOLD_DELIVERED_MEMO','GOLD_CUSTODY_CONTROL_MEMO','MEMO_GOLD_UG',BigInt(s.amount_ug));
 }else if(e.kind==='PROCUREMENT_ASSIGNED'){
   pair('MERCHANT_PROCUREMENT_RECEIPT_MEMO','MERCHANT_PROCUREMENT_SOURCE_MEMO','MEMO_GOLD_UG',BigInt(s.amount_ug));
 }else if(e.kind==='JEWELRY_VALUATION'){
   pair('OWNED_JEWELRY','QA_OPENING_EQUITY','IRR',BigInt(s.cost_irr));
   pair('OWNED_JEWELRY','QA_OPENING_GOLD','GOLD_UG',BigInt(s.fine_ug));
   if(s.memo_intake)pair('SUPPLIER_CONSIGNMENT_MEMO','CONSIGNMENT_CUSTODY','MEMO_GOLD_UG',BigInt(s.fine_ug),supplier,'DIDAR');
 }else if(e.kind.startsWith('WALLET_')||e.kind==='PAYABLE_TO_WALLET'){
   const n=BigInt(s.amount),instrument=s.instrument,party=s.party;
   const available='WALLET_AVAILABLE',reserved='WALLET_RESERVED',pending='WALLET_PENDING',pledged='WALLET_PLEDGED';
   if(e.kind==='WALLET_FUND'){pair('QA_WALLET_CLEARING',pending,instrument,n,'DIDAR',party);if(instrument==='GOLD_UG')pair('QA_WALLET_CLEARING','WALLET_GOLD_VALUATION','IRR',BigInt(s.valuation_irr||0),'DIDAR',party);}
   if(e.kind==='WALLET_RELEASE')pair(pending,available,instrument,n,party,party);
   if(e.kind==='WALLET_RESERVE')pair(available,reserved,instrument,n,party,party);
   if(e.kind==='WALLET_UNRESERVE')pair(reserved,available,instrument,n,party,party);
   if(e.kind==='WALLET_PLEDGE')pair(available,pledged,instrument,n,party,party);
   if(e.kind==='WALLET_UNPLEDGE')pair(pledged,available,instrument,n,party,party);
   if(e.kind==='WALLET_TRANSFER'){pair(available,available,instrument,n,party,s.to_party);if(instrument==='GOLD_UG')pair('WALLET_GOLD_VALUATION','WALLET_GOLD_VALUATION','IRR',BigInt(s.valuation_irr||0),party,s.to_party);}
   if(e.kind==='PAYABLE_TO_WALLET'){
     pair(instrument==='IRR'?'SUPPLIER_RIAL_PAYABLE':'SUPPLIER_GOLD_PAYABLE',available,instrument,n,supplier,party);
     // Reclassify, rather than recognize a second liability; gold valuation follows the same transfer.
     if(instrument==='GOLD_UG'){
       const {rows:[sale]}=await c.query('SELECT snapshot FROM didar_fin_event WHERE id=$1',[e.source_event_id]);
       pair('SUPPLIER_GOLD_VALUATION','WALLET_GOLD_VALUATION','IRR',await goldLiability(c,e.source_event_id,supplier,n,BigInt(sale.snapshot.rate_irr)),supplier,party);
     }
   }
 }
 if(!lines.length)return;
 for(const instrument of new Set(lines.map(l=>l.instrument)))if(lines.filter(l=>l.instrument===instrument).reduce((n,l)=>n+l.delta,0n)!==0n)throw new Error('CONFLICT_UNBALANCED_JOURNAL');
 const id=randomUUID();await c.query('INSERT INTO didar_fin_journal(id,event_id) VALUES($1,$2)',[id,e.id]);
 for(const l of lines)await c.query('INSERT INTO didar_fin_posting(journal_id,account,party,instrument,delta) VALUES($1,$2,$3,$4,$5)',[id,l.account,l.party,l.instrument,l.delta.toString()]);
}
export async function projectExisting(c:any){
 const {rows}=await c.query('SELECT * FROM didar_fin_event ORDER BY created_at,id');
 for(const e of rows)await projectEvent(c,e);
}
export async function ledgerRead(c:any,u:any){
 const {rows:balances}=await c.query(`SELECT p.account,p.instrument,p.party,sum(p.delta)::text debit_balance FROM didar_fin_posting p JOIN didar_fin_journal j ON j.id=p.journal_id JOIN didar_fin_event e ON e.id=j.event_id
 WHERE $1='admin' OR (e.supplier_id=$2 AND p.party='supplier:'||$2) GROUP BY p.account,p.instrument,p.party ORDER BY p.account,p.party,p.instrument`,[u.role,u.supplier_id]);
 const {rows:checks}=await c.query(`SELECT p.journal_id,p.instrument,sum(p.delta)::text imbalance FROM didar_fin_posting p GROUP BY p.journal_id,p.instrument HAVING sum(p.delta)<>0`);
 const journals=(await c.query(`SELECT j.id,j.event_id,j.basis,e.kind,j.created_at FROM didar_fin_journal j JOIN didar_fin_event e ON e.id=j.event_id WHERE $1='admin' OR e.supplier_id=$2 ORDER BY j.created_at DESC,j.id LIMIT 500`,[u.role,u.supplier_id])).rows;
 const obligations=(await c.query("SELECT id,supplier_id,gold_ug,irr FROM didar_fin_event WHERE kind='SALE_EXPOSURE' AND ($1='admin' OR supplier_id=$2) ORDER BY created_at DESC LIMIT 500",[u.role,u.supplier_id])).rows;
 return {balances,journals,obligations,unbalanced_count:checks.length,basis:'SANDBOX_PROVISIONAL',statutory_approval:'PENDING'};
}
