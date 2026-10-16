import './tahesab-mock.test';
import {test,expect} from 'bun:test';
import {financeFixture,finAPI,finOK,finDB} from './financial-helpers';
import {canonical,jalaliDate,validateAggregate,concreteTahesabRequest,validateMockEnvelope} from '../packages/api/src/didar/tahesab-contract';
import {fingerprint} from '../packages/api/src/didar/finance';
import {readFileSync} from 'node:fs';
const mapping=async(f:any)=>finOK('tahesab',{operation:'mapping',supplier_id:f.sid,merchant_code:'QA_MERCHANT',gold_code:'QA_GOLD',rial_code:'QA_RIAL',invoice_reference:'QA_AGGREGATE_INVOICE',db_alias:'QA_DIDAR',reason:'QA mapping'},f.admin);
test('Gate 4: merchant aggregate ties to journal, separate event types, no buyer/UID/EPC; stable close and retry intent',async()=>{
 const f=await financeFixture(),{sale,item}=await f.buy();await f.command({operation:'request_approve',sale_id:sale.id});
 const p=(await f.command({operation:'purchase',synthetic:true,weight_mg:'100000',purity:995,cost_irr:'8600000000',rate_irr:'65000000',currency:'IRR',counterparty:'DO_NOT_EXPORT_COUNTERPARTY',document:'QA purchase source',custody:'QA safe',title_confirmed:true})).event;
 // Global procurement purchase has no merchant yet; allocation makes the merchant relationship explicit.
 await f.command({operation:'purchase_approve',purchase_id:p.id});await f.command({operation:'allocate',purchase_id:p.id,sale_id:sale.id,amount_ug:'42000000'});
 await mapping(f);
 const period={operation:'close',supplier_id:f.sid,start_at:new Date(Date.now()-86400000).toISOString(),end_at:new Date(Date.now()).toISOString()};
 const a=(await finOK('tahesab',period,f.admin)).close,b=(await finOK('tahesab',period,f.admin)).close;expect(a.id).toBe(b.id);
 const payload=validateAggregate(a.payload),raw=JSON.stringify(payload);expect(raw).not.toContain(item.uid);expect(raw).not.toContain(f.buyerId);expect(raw).not.toContain('customer_payment_irr');expect(raw).not.toContain('DO_NOT_EXPORT_COUNTERPARTY');expect(raw).not.toContain('reservation_id');
 expect(payload.Factor_Code.length).toBeGreaterThanOrEqual(20);expect(new Set(payload.groups.map((g:any)=>g.event_type))).toEqual(new Set(['INTAKE_MEMO','SALE_EXPOSURE','ALLOCATION','PROCUREMENT_ASSIGNED']));expect(fingerprint(canonical(payload))).toBe(a.payload_hash);
 const source=(await finDB.query('SELECT event_id FROM didar_fin_close_source WHERE close_id=$1',[a.id])).rows.map((r:any)=>r.event_id);
 const journal=(await finDB.query(`SELECT p.instrument,sum(CASE WHEN p.delta>0 THEN p.delta ELSE 0 END)::text debit,sum(CASE WHEN p.delta<0 THEN -p.delta ELSE 0 END)::text credit FROM didar_fin_posting p JOIN didar_fin_journal j ON j.id=p.journal_id WHERE j.event_id=ANY($1::text[]) GROUP BY p.instrument`,[source])).rows;
 for(const row of journal){const group=payload.groups.filter((g:any)=>g.instrument===row.instrument);expect(group.reduce((n:bigint,g:any)=>n+BigInt(g.debit),0n).toString()).toBe(row.debit);expect(group.reduce((n:bigint,g:any)=>n+BigInt(g.credit),0n).toString()).toBe(row.credit);}
 expect((await finAPI('tahesab',{operation:'dispatch',close_id:a.id},f.seller)).http).toBe(403);
 let r=(await finOK('tahesab',{operation:'dispatch',close_id:a.id,outcome:'transient'},f.admin)).attempt;expect(r.state).toBe('transient_error');
 r=(await finOK('tahesab',{operation:'dispatch',close_id:a.id},f.admin)).attempt;expect(r.state).toBe('acknowledged');
 const retry=(await finOK('tahesab',{operation:'dispatch',close_id:a.id},f.admin)).attempt;expect(retry.id).toBe(r.id);
 expect((await finDB.query('SELECT count(*)::int n FROM didar_fin_mock_document WHERE factor_code=$1',[a.factor_code])).rows[0].n).toBe(1);
 await finOK('tahesab',{operation:'mock_change',close_id:a.id,change:'edit'},f.admin);expect((await finOK('tahesab',{operation:'reconcile',close_id:a.id},f.admin)).attempt.state).toBe('changed');
 await finOK('tahesab',{operation:'mock_change',close_id:a.id,change:'delete'},f.admin);expect((await finOK('tahesab',{operation:'reconcile',close_id:a.id},f.admin)).attempt.state).toBe('missing');
 const own=await finOK('tahesab',undefined,f.seller);expect(own.closes.every((c:any)=>c.supplier_id===f.sid)).toBe(true);expect(own.closes[0].payload).toBeUndefined();expect(own.spec_state).toBe('BLOCKED_BY_SPEC');
 expect((await finAPI('tahesab',{...period,start_at:new Date(Date.now()-2*86400000).toISOString(),end_at:new Date(Date.now()).toISOString()},f.admin)).http).toBe(409);
 await finDB.query('UPDATE didar_product SET active=false,published=false WHERE id=$1',[f.pid]);
});
test('Gate 4: strict versioned envelope, Jalali dates, spec blocker and replay-safe migrations',async()=>{
 expect(jalaliDate('2026-10-16T07:00:00Z')).toBe('1405/07/24');
 expect(()=>validateMockEnvelope({authorization:'Bearer wrong',DBname:'QA_DIDAR'},[])).toThrow();
 expect(()=>concreteTahesabRequest({})).toThrow('BLOCKED_BY_SPEC');
 expect(()=>validateAggregate({version:'invented',buyer:{name:'private'}})).toThrow();
 const before=(await finDB.query('SELECT id,payload_hash FROM didar_fin_close ORDER BY id')).rows;
 for(let n=0;n<2;n++)await finDB.query(readFileSync('packages/api/src/didar/tahesab-schema.sql','utf8'));
 expect((await finDB.query('SELECT id,payload_hash FROM didar_fin_close ORDER BY id')).rows).toEqual(before);
 await expect(finDB.query('UPDATE didar_fin_close SET payload=\'{}\' WHERE id=(SELECT min(id) FROM didar_fin_close)')).rejects.toThrow();
});
