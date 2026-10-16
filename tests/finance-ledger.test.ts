import {test,expect} from 'bun:test';
import {financeFixture,finAPI,finOK,finDB} from './financial-helpers';
import {projectExisting} from '../packages/api/src/didar/finance-ledger';
import {readFileSync} from 'node:fs';
const wallet=async(token:string,b:any)=>finOK('wallet',{...b,idempotency_key:b.idempotency_key||crypto.randomUUID(),reason:b.reason||'QA wallet'},token);
test('Gate 3: payable-to-wallet is one liability; pending/available/reserved/pledged and concurrent spending are enforced',async()=>{
 const f=await financeFixture(),{sale}=await f.buy(),sp='supplier:'+f.sid,cp='customer:'+f.buyerId;
 await wallet(f.admin,{operation:'payable_to_wallet',sale_id:sale.id,party:sp,instrument:'IRR',amount:'1000'});
 await wallet(f.admin,{operation:'payable_to_wallet',sale_id:sale.id,party:sp,instrument:'GOLD_UG',amount:'1000'});
 const liability=(await finDB.query("SELECT (-sum(delta))::text n FROM didar_fin_posting WHERE party=$1 AND instrument='IRR' AND account IN ('SUPPLIER_RIAL_PAYABLE','WALLET_AVAILABLE')",[sp])).rows[0].n;expect(liability).toBe(sale.irr);
 await wallet(f.admin,{operation:'fund',party:cp,instrument:'IRR',amount:'1000',document:'QA funding'});
 let own=await finOK('wallet',undefined,f.buyer);expect(own.balances.find((b:any)=>b.account==='WALLET_PENDING').balance).toBe('1000');
 expect((await finAPI('wallet',{operation:'fund',party:cp,instrument:'IRR',amount:'10',document:'forged',reason:'bad',idempotency_key:crypto.randomUUID()},f.buyer)).http).toBe(403);
 await wallet(f.admin,{operation:'release',party:cp,instrument:'IRR',amount:'1000'});
 const reserve=()=>finAPI('wallet',{operation:'reserve',instrument:'IRR',amount:'600',reason:'concurrent reserve',idempotency_key:crypto.randomUUID()},f.buyer);
 const race=await Promise.all([reserve(),reserve()]);expect(race.map(r=>r.http).sort()).toEqual([200,409]);
 await wallet(f.buyer,{operation:'pledge',instrument:'IRR',amount:'400'});
 expect((await finAPI('wallet',{operation:'transfer',instrument:'IRR',amount:'1',to_party:sp,reason:'cannot spend reserved',idempotency_key:crypto.randomUUID()},f.buyer)).http).toBe(409);
 await wallet(f.buyer,{operation:'unreserve',instrument:'IRR',amount:'600'});
 const key=crypto.randomUUID(),transfer={operation:'transfer',instrument:'IRR',amount:'200',to_party:sp,idempotency_key:key};
 const a=await wallet(f.buyer,transfer),b=await wallet(f.buyer,transfer);expect(a.event.id).toBe(b.event.id);
 await wallet(f.seller,{operation:'transfer',instrument:'GOLD_UG',amount:'500',to_party:cp});
 own=await finOK('wallet',undefined,f.buyer);expect(own.balances.find((r:any)=>r.account==='WALLET_AVAILABLE'&&r.instrument==='IRR').balance).toBe('400');expect(own.balances.find((r:any)=>r.instrument==='GOLD_UG').balance).toBe('500');
 expect((await finAPI('wallet',{operation:'reserve',party:sp,instrument:'IRR',amount:'1',reason:'spoof',idempotency_key:crypto.randomUUID()},f.buyer)).http).toBe(403);
 expect((await finAPI('wallet',{operation:'withdraw',instrument:'IRR',amount:'1',reason:'live withdrawal',idempotency_key:crypto.randomUUID()},f.buyer)).http).toBe(403);
 const ledger=await finOK('ledger',undefined,f.seller);expect(ledger.balances.every((r:any)=>r.party===sp)).toBe(true);expect(ledger.balances.some((r:any)=>r.account==='CASH_CLEARING')).toBe(false);
 await finDB.query('UPDATE didar_product SET active=false,published=false WHERE id=$1',[f.pid]);
});
test('Gate 3: database rejects unbalanced journals, wallet overdraft, posting edits and replayed projections',async()=>{
 const f=await financeFixture(),{sale}=await f.buy();const fact=(await f.command({operation:'request_approve',sale_id:sale.id})).event;
 const c=await finDB.connect();
 try{
   await c.query('BEGIN');const j=crypto.randomUUID();await c.query('INSERT INTO didar_fin_journal(id,event_id) VALUES($1,$2)',[j,fact.id]);await c.query("INSERT INTO didar_fin_posting(journal_id,account,instrument,delta) VALUES($1,'BAD','IRR',1)",[j]);await expect(c.query('COMMIT')).rejects.toThrow('CONFLICT_UNBALANCED_JOURNAL');await c.query('ROLLBACK');
   await c.query('BEGIN');const j2=crypto.randomUUID();await c.query('INSERT INTO didar_fin_journal(id,event_id) VALUES($1,$2)',[j2,fact.id]);await c.query("INSERT INTO didar_fin_posting(journal_id,account,party,instrument,delta) VALUES($1,'WALLET_AVAILABLE',$2,'IRR',1),($1,'QA_WALLET_CLEARING','DIDAR','IRR',-1)",[j2,'customer:'+f.buyerId]);await expect(c.query('COMMIT')).rejects.toThrow('CONFLICT_WALLET_OVERDRAFT');await c.query('ROLLBACK');
   const before=(await c.query('SELECT count(*)::int n FROM didar_fin_journal')).rows[0].n;
   for(let n=0;n<2;n++){await c.query(readFileSync('packages/api/src/didar/finance-ledger-schema.sql','utf8'));await c.query('BEGIN');await projectExisting(c);await c.query('COMMIT');}
   expect((await c.query('SELECT count(*)::int n FROM didar_fin_journal')).rows[0].n).toBe(before);
   await expect(c.query('UPDATE didar_fin_posting SET delta=delta+1 WHERE id=(SELECT min(id) FROM didar_fin_posting)')).rejects.toThrow();
   expect((await c.query('SELECT count(*)::int n FROM (SELECT journal_id,instrument FROM didar_fin_posting GROUP BY journal_id,instrument HAVING sum(delta)<>0) x')).rows[0].n).toBe(0);
 }finally{await c.query('ROLLBACK');c.release();}
 await finDB.query('UPDATE didar_product SET active=false,published=false WHERE id=$1',[f.pid]);
});
test('Gate 3: documented Didar-owned jewelry cost, sale COGS and full refund reconcile without fictitious supplier debt',async()=>{
 const f=await financeFixture('GOLD_ONLY');
 const contract=(await finOK('finance',{operation:'contract_request',supplier_id:f.sid,mode:'GOLD_ONLY',ownership:'DIDAR_OWNED',gold_bps:10000,effective_at:'2022-01-01T00:00:00Z',due_days:0,reason:'QA owner stock'},f.admin)).id;
 await finOK('finance',{operation:'contract_review',contract_id:contract,approved:true,reason:'QA owner terms'},f.admin);
 const {sale,batch}=await f.buy({beforeCheckout:async(batch)=>{await finOK('ledger',{operation:'jewelry_value',batch_id:batch,cost_irr:'6000000000',document:'QA documented acquisition',reason:'QA cost basis'},f.admin)}});
 expect(sale.gold_ug).toBe('0');expect(sale.irr).toBe('0');expect(sale.snapshot.owned_cost_irr).toBe('6000000000');
 const balance=async(account:string)=>(await finDB.query('SELECT COALESCE(sum(p.delta),0)::text n FROM didar_fin_posting p JOIN didar_fin_journal j ON j.id=p.journal_id JOIN didar_fin_event e ON e.id=j.event_id WHERE p.account=$1 AND e.supplier_id=$2 AND p.instrument=\'IRR\'',[account,f.sid])).rows[0].n;
 expect(await balance('OWNED_JEWELRY')).toBe('0');expect(await balance('COGS')).toBe('6000000000');
 await finOK('returns',{operation:'request',reservation_id:sale.reservation_id,reason:'QA return'},f.buyer);await finOK('returns',{operation:'receive',reservation_id:sale.reservation_id,reason:'QA received'},f.admin);await finOK('finance',{operation:'refund',event_id:sale.id,reason:'QA reversed'},f.admin);
 expect(await balance('COGS')).toBe('0');expect(await balance('OWNED_JEWELRY')).toBe('6000000000');
 expect((await finDB.query("SELECT count(*)::int n FROM didar_fin_event WHERE kind='JEWELRY_VALUATION' AND snapshot->>'batch_id'=$1",[batch])).rows[0].n).toBe(1);
 await finDB.query('UPDATE didar_product SET active=false,published=false WHERE id=$1',[f.pid]);
});
