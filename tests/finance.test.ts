import {beforeAll,afterAll,test,expect} from 'bun:test';
import {Pool} from '../packages/api/node_modules/pg';
import {readFileSync} from 'node:fs';
import {entitlement} from '../packages/api/src/didar/finance';
const db=new Pool({connectionString:process.env.DATABASE_URL}),base=process.env.TEST_API_URL||'http://localhost:9000',tag='fin-'+crypto.randomUUID();
let admin='',seller='',buyer='',sid='',pid='',contract='',sale:any,order:any;
async function api(body?:any,token=admin,action='finance') {const r=await fetch(base+'/didar/'+action,{method:body?'POST':'GET',headers:{'content-type':'application/json',authorization:'Bearer '+token},body:body?JSON.stringify(body):undefined});return {http:r.status,...await r.json()};}
async function ok(body?:any,token=admin,action='finance'){const r=await api(body,token,action);expect(r.http,JSON.stringify(r)).toBe(200);return r;}
beforeAll(async()=>{
 admin=(await ok({email:'admin@didar.test',password:'DidarDemo2026!'},'','login')).token;
 sid=(await ok({kind:'supplier',name:tag,email:tag+'@didar.test',password:'DidarFinance2026!'},admin,'manage')).id;
 seller=(await ok({email:tag+'@didar.test',password:'DidarFinance2026!'},'','login')).token;
 buyer=(await ok({email:tag+'-buyer@didar.test',password:'DidarFinance2026!',name:'QA Finance'},'','register')).token;
 pid=(await ok({kind:'product',title:tag,category:'QA',purity:750,description:'Finance QA',published:true},admin,'manage')).id;
});
afterAll(async()=>{if(pid)await db.query("UPDATE didar_product SET active=false,published=false WHERE id=$1",[pid]);if(sid)await db.query("UPDATE didar_supplier SET active=false WHERE id=$1",[sid]);await db.end()});
async function contractRequest(overrides:any={}){return (await ok({operation:'contract_request',supplier_id:sid,mode:'GOLD_ONLY',gold_bps:10000,ownership:'CONSIGNMENT',effective_at:'2020-01-01T00:00:00Z',due_days:7,reason:'Synthetic contract',...overrides})).id;}
async function approve(id:string){await ok({operation:'contract_review',contract_id:id,approved:true,reason:'Sandbox approved'});}
async function buy(){
 const batch=(await ok({operation:'create',supplier_id:sid,invoice_number:tag+crypto.randomUUID(),reference_purity:750},admin,'intake')).id;
 const line=(await ok({operation:'line',batch_id:batch,product_id:pid,description:'100g measured',quantity:1,total_weight_mg:100000,purity:750,making_mode:'percent',making_bps:1200},admin,'intake')).id;
 await ok({operation:'item',batch_id:batch,line_id:line,weight_mg:100000},admin,'intake');await ok({operation:'verify',batch_id:batch},admin,'intake');await ok({operation:'post',batch_id:batch},admin,'intake');
 const item=(await ok(undefined,admin,'intake?id='+batch)).items[0];
 const {rows:[offer]}=await db.query('SELECT * FROM didar_offer WHERE id=$1',[item.offer_id]);
 const rate=(await ok(undefined,admin,'catalog')).rate;
 const o=(await ok({idempotency_key:crypto.randomUUID(),rate_version:rate.version,address:{name:'QA',phone:'09123456789',city:'تهران',address:'آزمایشی',postal_code:'1234567890'},lines:[{offer_id:offer.id,version:offer.version,quantity:1}]},buyer,'checkout')).order;
 return {o,item};
}
test('Gate 1: contract-independent supplier entitlement uses exact fine gold, not customer margin/VAT',()=>{
 const line={weight_mg:100000,breakdown:{policy:{purity:750,making_mode:'percent',making_bps:1200}}};
 expect(entitlement(line,{gold_bps:10000,ownership:'CONSIGNMENT'},65000000n)).toMatchObject({gold_ug:'84000000',irr:'0'});
 expect(entitlement(line,{gold_bps:5000,ownership:'CONSIGNMENT'},65000000n)).toMatchObject({gold_ug:'42000000',irr:'3640000000'});
 expect(entitlement(line,{gold_bps:0,ownership:'CONSIGNMENT'},65000000n)).toMatchObject({gold_ug:'0',irr:'7280000000'});
 expect(entitlement(line,{gold_bps:10000,ownership:'DIDAR_OWNED'},65000000n)).toMatchObject({gold_ug:'0',irr:'0'});
});
test('Gate 1: requests scoped, approval admin-only, future contracts not silently activated',async()=>{
 contract=await contractRequest();
 expect((await api({operation:'contract_review',contract_id:contract,approved:true,reason:'no'},seller)).http).toBe(403);
 await approve(contract);
 const future=await contractRequest({mode:'RIAL_ONLY',effective_at:'2099-01-01T00:00:00Z'});await approve(future);
 expect((await api({operation:'contract_request',supplier_id:'s1',mode:'GOLD_ONLY',ownership:'CONSIGNMENT',effective_at:'2020-01-01',due_days:0,reason:'spoof'},seller)).http).toBe(403);
});
test('Gate 1: intake creates no debt, verified payment is exactly once and checkout terms survive amendments',async()=>{
 const {o,item}=await buy();order=o;
 expect((await ok()).events.filter((e:any)=>e.supplier_id===sid&&e.kind==='SALE_EXPOSURE')).toHaveLength(0);
 const newer=await contractRequest({mode:'RIAL_ONLY',effective_at:'2021-01-01T00:00:00Z'});await approve(newer);
 await Promise.all([ok({order_id:o.id,outcome:'success'},buyer,'payment'),ok({order_id:o.id,outcome:'success'},buyer,'payment')]);
 const {rows:events}=await db.query("SELECT * FROM didar_fin_event WHERE order_line_id IN(SELECT id FROM didar_order_line WHERE order_id=$1) AND kind='SALE_EXPOSURE'",[o.id]);
 expect(events).toHaveLength(1);sale=events[0];expect(sale.gold_ug).toBe('84000000');expect(sale.irr).toBe('0');expect(sale.snapshot.contract.id).toBe(contract);expect(sale.snapshot.uid).toBe(item.uid);
 expect(sale.snapshot.customer_payment_irr).toBe('8073000000');
});
test('Gate 1: statements scoped and append-only; return-gated refund reverses without deleting history',async()=>{
 const own=await ok(undefined,seller);expect(own.events.every((e:any)=>e.supplier_id===sid)).toBe(true);expect(JSON.stringify(own)).not.toContain('customer_payment_irr');
 expect((await api(undefined,buyer)).http).toBe(403);
 expect((await api({operation:'refund',event_id:sale.id,reason:'not returned'})).http).toBe(409);
 await ok({operation:'request',reservation_id:sale.reservation_id,reason:'QA return'},buyer,'returns');await ok({operation:'receive',reservation_id:sale.reservation_id,reason:'QA received'},admin,'returns');
 await Promise.all([ok({operation:'refund',event_id:sale.id,reason:'QA synthetic refund'}),ok({operation:'refund',event_id:sale.id,reason:'retry'})]);
 const {rows:[n]}=await db.query("SELECT sum(gold_ug)::text gold,count(*)::int n FROM didar_fin_event WHERE order_line_id=$1 AND kind IN ('SALE_EXPOSURE','REFUND')",[sale.order_line_id]);expect(n.gold).toBe('0');expect(n.n).toBe(2);
 await expect(db.query('UPDATE didar_fin_event SET gold_ug=0 WHERE id=$1',[sale.id])).rejects.toThrow();
 await expect(db.query('DELETE FROM didar_fin_contract WHERE id=$1',[contract])).rejects.toThrow();
});
test('Gate 1: effective rial contract and Didar-owned inventory never generate fictional external gold payable',async()=>{
 const rial=await buy();await ok({order_id:rial.o.id,outcome:'success'},buyer,'payment');
 let e=(await db.query("SELECT e.* FROM didar_fin_event e JOIN didar_order_line l ON l.id=e.order_line_id WHERE l.order_id=$1",[rial.o.id])).rows[0];
 expect(e.gold_ug).toBe('0');expect(e.irr).toBe('7280000000');
 const owned=await contractRequest({ownership:'DIDAR_OWNED',effective_at:'2022-01-01T00:00:00Z'});await approve(owned);
 const d=await buy();await ok({order_id:d.o.id,outcome:'success'},buyer,'payment');
 e=(await db.query("SELECT e.* FROM didar_fin_event e JOIN didar_order_line l ON l.id=e.order_line_id WHERE l.order_id=$1",[d.o.id])).rows[0];
 expect(e.gold_ug).toBe('0');expect(e.irr).toBe('0');expect(e.snapshot.ownership).toBe('DIDAR_OWNED');
});
test('Gate 1: additive migration replay preserves existing UID and price snapshots and creates no historical exposure',async()=>{
 const before=(await db.query('SELECT uid,weight_mg FROM didar_inventory_item ORDER BY id')).rows;
 const events=(await db.query('SELECT id FROM didar_fin_event ORDER BY id')).rows;
 for(let n=0;n<2;n++)await db.query(readFileSync('packages/api/src/didar/finance-schema.sql','utf8'));
 expect((await db.query('SELECT uid,weight_mg FROM didar_inventory_item ORDER BY id')).rows).toEqual(before);
 expect((await db.query('SELECT id FROM didar_fin_event ORDER BY id')).rows).toEqual(events);
});
