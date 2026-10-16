'use client'
import Link from 'next/link'
import {useEffect,useState} from 'react'
import {RequireUser,useDidar} from './store'
import {FinanceField,Fine,formValues} from './finance'
import {number,date} from './locale'
const buckets:Record<string,string>={WALLET_AVAILABLE:'قابل استفاده',WALLET_RESERVED:'رزروشده',WALLET_PENDING:'در انتظار تأیید',WALLET_PLEDGED:'وثیقه‌شده'}
const actions:Record<string,string>={fund:'واریز آزمایشی به مانده در انتظار',release:'تأیید و آزادسازی واریز',reserve:'رزرو',unreserve:'آزادسازی رزرو',pledge:'وثیقه',unpledge:'آزادسازی وثیقه',transfer:'انتقال داخلی آزمایشی'}
export function Wallet(){return <RequireUser roles={['admin','supplier','customer']}><Content/></RequireUser>}
function Content(){
 const {api,user,run,busy,setMessage}=useDidar(),[data,setData]=useState<any>(null),[operation,setOperation]=useState('reserve'),[instrument,setInstrument]=useState('IRR')
 useEffect(()=>{let active=true;void api('wallet').then(d=>{if(active)setData(d)}).catch(e=>{if(active)setMessage(e.message)});return()=>{active=false}},[api,setMessage])
 if(!data)return <p>در حال دریافت کیف پول…</p>
 return <main dir="rtl" className="container"><h1>کیف پول طلا و ریال</h1><p>کیف پول آزمایشی؛ برداشت بانکی و خرید واقعی غیرفعال است. مانده‌ها از سندهای دوطرفه محاسبه می‌شوند.</p><nav><Link href="/account">حساب من</Link> · {user?.role!=='customer'&&<Link href="/manage/ledger">دفتر حساب‌ها</Link>}</nav>
 <section><h2>مانده‌ها</h2>{!data.balances.length&&<p>مانده اولیه صفر است.</p>}<table><thead><tr><th>حساب</th><th>وضعیت</th><th>مانده</th></tr></thead><tbody>{data.balances.map((b:any)=><tr key={(b.party||data.party)+b.account+b.instrument}><td>{b.party||data.party}</td><td>{buckets[b.account]}</td><td>{b.instrument==='GOLD_UG'?<Fine value={b.balance}/>:number(b.balance)+' ریال'}</td></tr>)}</tbody></table></section>
 <section><h2>ثبت عملیات داخلی آزمایشی</h2><form onSubmit={e=>{const f=formValues(e);void run(async()=>{await api('wallet',{...f,operation,instrument,idempotency_key:crypto.randomUUID()});setData(await api('wallet'))})}}>
 <label>عملیات<select value={operation} onChange={e=>setOperation(e.target.value)}>{Object.entries(actions).filter(([k])=>user?.role==='admin'||!['fund','release'].includes(k)).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
 {user?.role==='admin'&&<label>صاحب حساب<select name="party">{data.parties.map((p:any)=><option key={p.id} value={p.id}>{p.name} · {p.id}</option>)}</select></label>}
 <label>دارایی<select value={instrument} onChange={e=>setInstrument(e.target.value)}><option value="IRR">ریال</option><option value="GOLD_UG">میکروگرم طلای خالص</option></select></label>
 <FinanceField name="amount" label={instrument==='IRR'?'مبلغ؛ ریال':'مقدار؛ میکروگرم طلای خالص'} type="number"/>
 {operation==='fund'&&<><FinanceField name="document" label="سند واریز آزمایشی"/>{instrument==='GOLD_UG'&&<FinanceField name="valuation_irr" label="ارزش ثبت‌شده طلای واریزی؛ ریال" type="number"/>}</>}
 {operation==='transfer'&&<FinanceField name="to_party" label="شناسه حساب مقصد آزمایشی؛ customer: یا supplier:"/>}
 <FinanceField name="reason" label="شرح عملیات کیف پول"/><button disabled={busy}>ثبت عملیات کیف پول آزمایشی</button></form></section>
 <section><h2>گردش کیف پول</h2>{data.events.map((e:any)=><article key={e.id}><p>{date(e.created_at)} · {e.snapshot.reason} · {e.snapshot.instrument==='IRR'?number(e.snapshot.amount)+' ریال':<Fine value={e.snapshot.amount}/>}</p></article>)}</section></main>
}
