import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {join} from 'node:path'
import {mkdirSync,readFileSync} from 'node:fs'
import {pathToFileURL} from 'node:url'
import {atomic} from './common.mjs'
export async function browserSmoke({api,web,dir,run_id:runId,root,linked_id,env}) {
 const require=createRequire(join(root,'package.json'));const {chromium}=require('@playwright/test');const {browserLaunchOptions}=await import(pathToFileURL(join(root,'scripts/local/browser-options.mjs')))
 const browser=await chromium.launch({...browserLaunchOptions(env),headless:true});const results=[];const shots=join(dir,'screenshots');mkdirSync(shots,{recursive:true});const errors=[]
 const context=async()=>{const c=await browser.newContext({viewport:{width:1440,height:1000},ignoreHTTPSErrors:true});c.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));return c}
 const shot=async(p,name)=>{await p.screenshot({path:join(shots,name+'-1440.png'),fullPage:true});await p.setViewportSize({width:390,height:844});await p.screenshot({path:join(shots,name+'-390.png'),fullPage:true})}
 const signIn=async(p,surface,email)=>{await p.goto(api+'/'+surface+'/login');await p.locator('input[name=email]').fill(email);await p.locator('input[name=password]').fill('DidarNative2026!');await p.locator('button[type=submit]').click();if(surface==='seller'){await p.waitForURL(u=>u.pathname==='/seller/store-select');await p.getByRole('button').filter({hasText:'دیدار s1'}).click()}await p.waitForURL(u=>!u.pathname.endsWith('/login')&&u.pathname!=='/seller/store-select')}
 // The workspace heading also exists during loading. Require a real canonical
 // response AND its own rendered inventory before either screenshot can pass.
 const workspace=async(p,surface)=>{
  const prefix=surface==='seller'?'/vendor':'/admin'
  const [response]=await Promise.all([p.waitForResponse(r=>new URL(r.url()).pathname===prefix+'/didar/manage'&&r.request().method()==='GET',{timeout:45000}),p.goto(api+'/'+surface+'/didar')])
  assert.equal(response.status(),200,'Canonical native management API must succeed')
  const data=await response.json();assert.ok(Array.isArray(data.products)&&data.products.length>0)
  const product=data.products.find(p=>Array.isArray(p.offers)&&p.offers.length>0);assert.ok(product,'A populated canonical inventory fixture is required')
  const offer=product.offers[0];assert.ok(offer.id);assert.ok(Number.isSafeInteger(offer.quantity))
  if(surface==='seller')for(const product of data.products)for(const offer of product.offers)assert.equal(offer.supplier_id,'s1','Vendor workspace must contain only its own offers')
  await p.getByRole('button',{name:'تازه‌سازی مدیریت',exact:true}).waitFor({state:'visible'})
  await p.getByRole('heading',{name:product.title,exact:true}).waitFor({state:'visible'})
  await p.waitForFunction(({id,quantity})=>{const form=document.querySelector('form[data-offer-id="'+CSS.escape(id)+'"]');return form?.querySelector('input[name="quantity"]')?.value===String(quantity)},{id:offer.id,quantity:offer.quantity},{timeout:45000})
  return {manage_http:response.status(),product_id:product.id,offer_id:offer.id,supplier_id:offer.supplier_id,rendered_quantity:offer.quantity,readiness:'Canonical response and populated inventory rendered before screenshot'}
 }
 try{
  const ac=await context(),admin=await ac.newPage();await signIn(admin,'dashboard','native-admin@didar.test');const adminData=await workspace(admin,'dashboard');await admin.getByRole('heading',{name:'مدیریت بازار دیدار',exact:true}).waitFor();assert.ok(await admin.getByRole('link',{name:'Products',exact:true}).count()||await admin.locator('a[href="/dashboard/products"]').count());await shot(admin,'native-admin-auth');results.push({workspace:'native Admin',status:'PASS',route:new URL(admin.url()).pathname,behavior:'Actual native sign-in, original shell navigation and canonical DIDAR Product workspace render',...adminData});await ac.close()
  const vc=await context(),vendor=await vc.newPage();await signIn(vendor,'seller','native-supplier@didar.test');const vendorData=await workspace(vendor,'seller');await vendor.getByRole('heading',{name:'پنل تأمین‌کننده',exact:true}).waitFor();await shot(vendor,'native-vendor-auth');results.push({workspace:'native Vendor',status:'PASS',route:new URL(vendor.url()).pathname,behavior:'Actual native member sign-in, selected own seller and own canonical Product workspace render',...vendorData});await vc.close()
  const cc=await context(),customer=await cc.newPage();await customer.goto(web+'/login');await customer.getByLabel('ایمیل',{exact:true}).fill('customer@didar.test');await customer.getByLabel('رمز عبور',{exact:true}).fill('DidarDemo2026!');await customer.getByRole('button',{name:'ورود',exact:true}).click();await customer.waitForURL(u=>u.pathname==='/account');await customer.getByRole('heading',{name:'حساب من',exact:true}).waitFor();await customer.goto(web+'/');const data=await(await customer.request.get(web+'/api/didar/catalog')).json();const p=data.products.find(p=>p.id===linked_id)||data.products[0];assert.ok(p?.canonical_path);await customer.goto(web+p.canonical_path);await customer.getByRole('heading',{name:p.title,exact:true}).waitFor();await shot(customer,'customer-signed-ingress-auth');results.push({workspace:'B2C Customer',status:'PASS',route:new URL(customer.url()).pathname,behavior:'Customer sign-in/account then actual public canonical PDP remains available'});await cc.close()
  assert.deepEqual(errors,[]);atomic(join(dir,'browser-verdict.json'),{run_id:runId,status:'PASS',journeys:results.length,results,page_errors:errors,qa_tls:'Ephemeral self-signed QA certificate; browser ignoreHTTPSErrors scoped to disposable QA only; Node HTTP probes require explicit QA CA trust',screenshots:['native-admin-auth','native-vendor-auth','customer-signed-ingress-auth'].flatMap(p=>[p+'-1440.png',p+'-390.png'])})
 }finally{await browser.close()}
}

if(process.argv[1]===import.meta.filename){const dir=process.argv[2];const fixture=JSON.parse(readFileSync(join(dir,'browser-fixture.json'),'utf8'));await browserSmoke({...fixture,dir,env:process.env})}
