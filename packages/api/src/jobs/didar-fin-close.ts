import {transaction} from '../didar/db';
import {createClose} from '../didar/tahesab';
/** Local sandbox only. Last completed Tehran day. No dispatch or external writes. */
export default async function closeNightly(){
 if(process.env.DIDAR_ENVIRONMENT!=='local'||process.env.DIDAR_PAYMENT_MODE!=='sandbox')return;
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const n=(name:string)=>Number(parts.find(p=>p.type===name)?.value);
 // Iran is UTC+03:30 without DST in supported 2026+ local acceptance dates.
 const end=new Date(Date.UTC(n('year'),n('month')-1,n('day'))-12600000),start=new Date(end.getTime()-86400000);
 await transaction(async c=>{
  const {rows}=await c.query('SELECT DISTINCT supplier_id FROM didar_fin_account_mapping ORDER BY supplier_id');
  for(const row of rows){
   await c.query('SAVEPOINT merchant_close');
   try{await createClose(c,row.supplier_id,start.toISOString(),end.toISOString(),null);await c.query('RELEASE SAVEPOINT merchant_close');}
   catch(e:any){await c.query('ROLLBACK TO SAVEPOINT merchant_close');if(e.message!=='CONFLICT_NO_UNEXPORTED_EVENTS')throw e;}
  }
 });
}
export const config={name:'didar-financial-dry-run-close',schedule:'0 0 * * *'};
