import {expect} from 'bun:test';
import {Pool} from '../packages/api/node_modules/pg';
export const finDB=new Pool({connectionString:process.env.DATABASE_URL});
export async function finAPI(action:string,body?:any,token=''){
 const r=await fetch((process.env.TEST_API_URL||'http://localhost:9000')+'/didar/'+action,{method:body?'POST':'GET',headers:{'content-type':'application/json',authorization:'Bearer '+token},body:body?JSON.stringify(body):undefined});return {http:r.status,...await r.json()};
}
export async function finOK(action:string,body?:any,token=''){const r=await finAPI(action,body,token);expect(r.http,JSON.stringify(r)).toBe(200);return r;}
export async function financeFixture(mode='MIXED'){
 const tag='fin-helper-'+crypto.randomUUID(),password='DidarFinance2026!';
 const admin=(await finOK('login',{email:'admin@didar.test',password:'DidarDemo2026!'})).token;
 const sid=(await finOK('manage',{kind:'supplier',name:tag,email:tag+'@didar.test',password},admin)).id;
 const seller=(await finOK('login',{email:tag+'@didar.test',password})).token;
 const reg=await finOK('register',{email:tag+'-buyer@didar.test',password,name:'Finance QA buyer'}),buyer=reg.token;
 const pid=(await finOK('manage',{kind:'product',title:tag,category:'QA',purity:750,description:'Integrated finance QA',published:true},admin)).id;
 const c=(await finOK('finance',{operation:'contract_request',supplier_id:sid,mode,gold_bps:5000,ownership:'CONSIGNMENT',effective_at:'2020-01-01T00:00:00Z',due_days:7,reason:'QA financial contract'},admin)).id;
 await finOK('finance',{operation:'contract_review',contract_id:c,approved:true,reason:'Approved synthetic fixture'},admin);
 async function buy(){
   const batch=(await finOK('intake',{operation:'create',supplier_id:sid,invoice_number:tag+crypto.randomUUID(),reference_purity:750},admin)).id;
   const line=(await finOK('intake',{operation:'line',batch_id:batch,product_id:pid,description:'100g individually measured',quantity:1,total_weight_mg:100000,purity:750,making_mode:'percent',making_bps:1200},admin)).id;
   await finOK('intake',{operation:'item',batch_id:batch,line_id:line,weight_mg:100000},admin);
   await finOK('intake',{operation:'verify',batch_id:batch},admin);await finOK('intake',{operation:'post',batch_id:batch},admin);
   const item=(await finOK('intake?id='+batch,undefined,admin)).items[0],offer=(await finDB.query('SELECT * FROM didar_offer WHERE id=$1',[item.offer_id])).rows[0],rate=(await finOK('catalog')).rate;
   const o=(await finOK('checkout',{idempotency_key:crypto.randomUUID(),rate_version:rate.version,address:{name:'QA',phone:'09123456789',city:'تهران',address:'نشانی آزمایشی',postal_code:'1234567890'},lines:[{offer_id:offer.id,version:offer.version,quantity:1}]},buyer)).order;
   await finOK('payment',{order_id:o.id,outcome:'success'},buyer);
   const sale=(await finDB.query("SELECT e.* FROM didar_fin_event e JOIN didar_order_line l ON l.id=e.order_line_id WHERE l.order_id=$1 AND e.kind='SALE_EXPOSURE'",[o.id])).rows[0];return {sale,item,order:o};
 }
 return {admin,seller,buyer,sid,pid,buyerId:reg.user.id,buy,command:async(b:any)=>finOK('treasury',{...b,reason:b.reason||'QA finance operation',idempotency_key:b.idempotency_key||crypto.randomUUID()},admin)};
}
