import { storeScope } from "./storefront";
/** Bounded CORE-03 adapter: existing order, physical supplier and financial event
 * remain authoritative. Mandates are opt-in, immutable and disabled by default. */
import { createHash, randomUUID } from "node:crypto";
import { requireUser } from "./auth";
import { transaction } from "./db";
import { audit } from "./permissions";
import { integer } from "./pricing";

const hash = (v: any) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const text = (v: any, max = 1000) => {
  if (typeof v !== "string" || !v.trim() || v.length > max) throw Error("INVALID_TEXT");
  return v.trim();
};
export const agencyEnabled = () => process.env.DIDAR_AGENCY_MODE === "sandbox" &&
  process.env.DIDAR_ENVIRONMENT === "local" && process.env.DIDAR_PAYMENT_MODE === "sandbox";
const currentContract = async (c: any, supplier: string) => (await c.query(
  `SELECT t.* FROM didar_fin_contract t JOIN didar_fin_contract_review r ON r.contract_id=t.id
   WHERE t.supplier_id=$1 AND r.approved AND t.effective_at<=now() ORDER BY t.effective_at DESC,t.version DESC LIMIT 1`, [supplier])).rows[0];
export async function currentMandate(c: any, supplier: string) {
  const m = (await c.query(`SELECT m.*,s.name supplier_name,r.approved,r.actor_id approver_id,
    r.created_at approved_at,rv.mandate_id IS NOT NULL revoked FROM didar_sale_mandate m
    JOIN didar_supplier s ON s.id=m.supplier_id LEFT JOIN didar_sale_mandate_review r ON r.mandate_id=m.id
    LEFT JOIN didar_sale_mandate_revocation rv ON rv.mandate_id=m.id WHERE m.supplier_id=$1
    ORDER BY m.version DESC LIMIT 1`, [supplier])).rows[0];
  if (!m) return null; // Existing merchants retain their original unclassified behavior.
  if (!agencyEnabled()) throw Error("CONFLICT_AGENCY_DISABLED");
  if (!m.approved || m.revoked || new Date(m.effective_at).getTime()>Date.now() ||
      new Date(m.expires_at).getTime()<=Date.now()) throw Error("CONFLICT_MANDATE_UNAVAILABLE");
  const contract = await currentContract(c, supplier);
  if (!contract || contract.id!==m.contract_id ||
      (m.mode==="DIRECT_DIDAR" && contract.ownership!=="DIDAR_OWNED") ||
      (m.mode==="AGENCY" && contract.ownership!=="CONSIGNMENT")) throw Error("CONFLICT_MANDATE_CONTRACT");
  return { ...m, contract };
}
function disclosure(m: any) {
  return { schema_version:1, mode:m.mode, seller:{id:m.mode==="AGENCY"?m.supplier_id:"DIDAR",name:m.mode==="AGENCY"?m.supplier_name:"دیدار"},
    collector:"DIDAR",issuer:"DIDAR",on_behalf:m.mode==="AGENCY",mandate_version:m.version };
}
/** Called in the original pricing path. No writes or row locks: quote is READ ONLY. */
export async function agencyQuote(c: any, offer: any, quoted: any, rate: any) {
  const m = await currentMandate(c, offer.supplier_id);
  if (!m) return quoted;
  const role = disclosure(m);
  const {entitlement}=await import("./finance.js");
  const {recognizedProfilePrice}=await import("./merchant-profiles.js");
  const validatedRole={...m,principal_id:m.mode==="AGENCY"?m.supplier_id:"DIDAR",profile_version_id:quoted.merchant_profile?.version_id??null,tax_version_id:quoted.merchant_profile?.tax.id??quoted.pricing_policy_id};
  const priced=recognizedProfilePrice(quoted,0,1);
  const allRules=[...(quoted.profile_charges||[]),...(quoted.order_rules||[])].filter((r:any)=>r.applied&&BigInt(r.amount_irr)!==0n);
  for(const r of allRules) {
    if(m.mode==="DIRECT_DIDAR" && r.payer==="MERCHANT") throw Error("CONFLICT_AGENCY_DIRECT_PAYER");
    if(r.recipient==="THIRD_PARTY"&&!m.beneficiaries?.[r.code]) throw Error("CONFLICT_AGENCY_BENEFICIARY");
  }
  const quantities=entitlement({weight_mg:offer.weight_mg,breakdown:{policy:{...offer,fixed_labor_irr:offer.labor_irr}}},m.contract,BigInt(rate.rate_irr),1);
  agencyAllocation(validatedRole,priced.price,quantities,priced.total,BigInt(rate.rate_irr),1);
  return { ...quoted, sale_role:role, quote_key:hash({price_key:quoted.quote_key,mandate:m.id,version:m.version,contract:m.contract_id,role}) };
}
export async function snapshotAgency(c: any, lineId: string, actorId: string) {
  const l = (await c.query(`SELECT l.*,o.origin_supplier_id,o.storefront_snapshot,o.share_page_id,o.rate_snapshot,t.snapshot contract,
    f.product_id FROM didar_order_line l JOIN didar_order o ON o.id=l.order_id
    JOIN didar_fin_sale_terms t ON t.line_id=l.id JOIN didar_offer f ON f.id=l.offer_id WHERE l.id=$1`,[lineId])).rows[0];
  const m = await currentMandate(c,l.supplier_id);
  if (!m) return;
  if (l.contract.id!==m.contract_id || (l.breakdown.sale_role?.mode!==m.mode || l.breakdown.sale_role?.mandate_version!==m.version || l.breakdown.sale_role?.seller?.name!==disclosure(m).seller.name))
    throw Error("CONFLICT_MANDATE_CHANGED");
  const physicalItems:any[]=[];
  if(l.stock_mode==="itemized") {
    const items=(await c.query(`SELECT i.id,i.uid,i.line_id FROM didar_inventory_item i
      WHERE i.offer_id=$1 AND i.status='available' ORDER BY i.id LIMIT $2`,[l.offer_id,l.quantity])).rows;
    if(items.length!==l.quantity) throw Error("CONFLICT_STOCK");
    for(const item of items) {
      const receipt=(await c.query(`SELECT id,kind,snapshot FROM didar_fin_event WHERE
        snapshot->>'invoice_line_id'=$1 AND kind IN ('INTAKE_MEMO','INTAKE_RECEIPT') ORDER BY created_at,id LIMIT 1`,[item.line_id])).rows[0];
      const expected=m.mode==="DIRECT_DIDAR"?"DIDAR_OWNED":"CONSIGNMENT";
      if(!receipt || receipt.snapshot.ownership!==expected) throw Error("CONFLICT_PHYSICAL_TITLE_EVIDENCE");
      physicalItems.push({item_id:item.id,uid:item.uid,receipt_event_id:receipt.id,ownership:expected});
    }
  } else if(m.mode==="DIRECT_DIDAR") throw Error("CONFLICT_PHYSICAL_TITLE_EVIDENCE");
  const role:any = { ...disclosure(m), mandate_id:m.id, mandate_version:m.version, physical_supplier_id:l.supplier_id,
    principal_id:m.mode==="AGENCY"?l.supplier_id:"DIDAR",payee_id:m.mode==="AGENCY"?l.supplier_id:null,
    offer_id:l.offer_id,product_id:l.product_id,contract_id:m.contract_id,contract_version:l.contract.version,
    origin_supplier_id:l.origin_supplier_id,storefront:l.storefront_snapshot,share_page_id:l.share_page_id,
    curation:l.breakdown.curation??null,
    actual_operator_id:actorId,approval:{actor_id:m.approver_id,at:m.approved_at},effective_at:m.effective_at,expires_at:m.expires_at,
    allocation_rule:m.allocation_rule,rounding_limit_irr:m.rounding_limit_irr,beneficiaries:m.beneficiaries,
    pricing_policy_id:l.breakdown.policy.pricing_policy_id??null,profile_version_id:l.breakdown.policy.merchant_profile_version_id??null,
    tax_version_id:l.breakdown.policy.tax_version_id??l.breakdown.policy.pricing_policy_id,
    physical_items:physicalItems,
    payment_method:l.breakdown.payment_method??"CASH",rounding:"ceil_per_unit",basis:"SANDBOX_PROVISIONAL" };
  const {entitlement}=await import("./finance.js");
  const {recognizedProfilePrice}=await import("./merchant-profiles.js");
  role.accepted_allocations=[];
  for(let i=0;i<(l.stock_mode==="itemized"?l.quantity:1);i++) {
    const quantity=l.stock_mode==="itemized"?1:l.quantity;
    const priced=recognizedProfilePrice(l.breakdown,l.stock_mode==="itemized"?i:null,quantity);
    const amounts=entitlement(l,l.contract,BigInt(l.rate_snapshot.rate_irr),quantity);
    role.accepted_allocations.push(agencyAllocation(role,priced.price,amounts,priced.total,BigInt(l.rate_snapshot.rate_irr),quantity));
  }
  await c.query("INSERT INTO didar_sale_role(line_id,mandate_id,snapshot) VALUES($1,$2,$3)",[lineId,m.id,JSON.stringify(role)]);
}
export async function assertAgencyPayment(c: any, order: any) {
  const {rows:lines}=await c.query(`SELECT l.supplier_id,r.mandate_id,r.snapshot FROM didar_order_line l
    LEFT JOIN didar_sale_role r ON r.line_id=l.id WHERE l.order_id=$1 ORDER BY l.id`,[order.id]);
  for(const l of lines) {
    const m=await currentMandate(c,l.supplier_id);
    if (!!m!==!!l.mandate_id || (m && (m.id!==l.mandate_id || m.contract_id!==l.snapshot.contract_id || disclosure(m).seller.name!==l.snapshot.seller.name)))
      throw Error("CONFLICT_MANDATE_CHANGED");
    if(m) {
      const currentRate=(await c.query("SELECT version,pricing_policy_id FROM didar_rate WHERE id=1")).rows[0];
      const {effectiveProfile}=await import("./merchant-profiles.js");
      const profile=await effectiveProfile(c,l.supplier_id);
      if(currentRate.version!==order.rate_snapshot.version || (profile?.version_id??null)!==l.snapshot.profile_version_id ||
        (profile?.tax.id??currentRate.pricing_policy_id)!==l.snapshot.tax_version_id ||
        (!profile && currentRate.pricing_policy_id!==l.snapshot.pricing_policy_id)) throw Error("CONFLICT_AGENCY_TERMS_CHANGED");
    }
  }
}

/** Allocation explains every collected rial. The conversion adjustment is derived
 * independently from metal/making price and contractual GOLD/IRR valuation; a
 * tolerance never legitimizes an unrelated residual. Beneficiaries are approved
 * business IDs in the mandate, never an anonymous THIRD_PARTY bucket. */
export function agencyAllocation(role: any, price: any, amounts: any, total: bigint, rate: bigint, quantity: number) {
  const q=BigInt(quantity), ceil=(n:bigint,d:bigint)=>(n+d-1n)/d;
  const vat=BigInt(price.recognized_vat_irr??BigInt(price.tax_irr)*q);
  const goldValue=ceil(BigInt(amounts.gold_ug)*rate,750000n), rial=BigInt(amounts.irr);
  const customerCharges=(price.recognized_charges||[]).filter((r:any)=>r.payer==="CUSTOMER");
  const profile=!!price.merchant_profile;
  const charges=(price.recognized_charges||[]).filter((r:any)=>BigInt(r.amount_irr)!==0n).map((r:any)=>{
    if (!["DIDAR","THIRD_PARTY"].includes(r.recipient) || !["CUSTOMER","MERCHANT","DIDAR"].includes(r.payer) ||
        !["distribution","retail","credit"].includes(r.component)) throw Error("CONFLICT_AGENCY_BENEFICIARY");
    if(role.mode==="DIRECT_DIDAR" && r.payer==="MERCHANT") throw Error("CONFLICT_AGENCY_DIRECT_PAYER");
    const payee=r.recipient==="DIDAR"?"DIDAR":role.beneficiaries?.[r.code];
    if(!payee) throw Error("CONFLICT_AGENCY_BENEFICIARY");
    return {code:r.code,component:r.component,payer:r.payer,payer_id:r.payer==="MERCHANT"?role.principal_id:r.payer==="DIDAR"?"DIDAR":null,payee_id:payee,amount_irr:String(r.amount_irr),
      profile_version_id:role.profile_version_id,tax_version_id:role.tax_version_id};
  });
  const componentShare=profile?0n:(BigInt(price.distribution_irr)+BigInt(price.retail_irr)+BigInt(price.fee_irr))*q;
  const rounding=BigInt(price.rounding_irr)*q;
  const basePrice=(BigInt(price.metal_irr)+BigInt(price.labor_irr))*q;
  const conversion=role.mode==="AGENCY"?basePrice-goldValue-rial:0n;
  if(conversion>BigInt(role.rounding_limit_irr)*q || -conversion>BigInt(role.rounding_limit_irr)*q)
    throw Error("CONFLICT_AGENCY_CONVERSION_ROUNDING");
  const customerSum=customerCharges.reduce((n:bigint,r:any)=>n+BigInt(r.amount_irr),0n);
  const didarCharges=charges.filter((r:any)=>r.payer==="CUSTOMER"&&r.payee_id==="DIDAR").reduce((n:bigint,r:any)=>n+BigInt(r.amount_irr),0n);
  const thirdParty=charges.filter((r:any)=>r.payer==="CUSTOMER"&&r.payee_id!=="DIDAR").reduce((n:bigint,r:any)=>n+BigInt(r.amount_irr),0n);
  const didarShare=componentShare+rounding+conversion+didarCharges+(role.mode==="DIRECT_DIDAR"?basePrice:0n);
  if(didarShare<0n || (profile && customerSum!==didarCharges+thirdParty) || total!==vat+goldValue+rial+didarShare+thirdParty)
    throw Error("CONFLICT_AGENCY_ALLOCATION");
  return {schema_version:1,rule:role.allocation_rule,collection_irr:total.toString(),tax_irr:vat.toString(),
    seller_gold_ug:String(amounts.gold_ug),seller_gold_book_irr:goldValue.toString(),seller_rial_irr:rial.toString(),
    component_share_irr:componentShare.toString(),rounding_irr:rounding.toString(),
    conversion_adjustment_irr:conversion.toString(),conversion_basis:{metal_making_price_irr:basePrice.toString(),contract_valuation_irr:(goldValue+rial).toString()},
    didar_share_irr:didarShare.toString(),third_party_irr:thirdParty.toString(),charges,
    tax_version_id:role.tax_version_id,profile_version_id:role.profile_version_id,basis:"SANDBOX_PROVISIONAL"};
}

const safePrice = (s:any) => Object.fromEntries(["metal_irr","labor_irr","distribution_irr","retail_irr","credit_irr","tax_irr","fee_irr","rounding_irr"].map(k=>[k,(BigInt(s.price[k]??0)*BigInt(s.quantity)).toString()]));
/** Bounded document projection. No native invoice existed for DIDAR orders:
 * this references paid order/events; it cannot create orders or finance facts. */
export async function issueAgencyInvoices(c:any, order:any) {
  const {rows:sales}=await c.query(`SELECT e.id,e.order_line_id,e.snapshot,l.title,l.weight_mg,r.snapshot role
    FROM didar_fin_event e JOIN didar_order_line l ON l.id=e.order_line_id JOIN didar_sale_role r ON r.line_id=l.id
    WHERE l.order_id=$1 AND e.kind='SALE_EXPOSURE' ORDER BY l.id,e.id`,[order.id]);
  const groups=new Map<string,any[]>();
  for(const s of sales) { const group=groups.get(s.role.principal_id)||[]; group.push(s);groups.set(s.role.principal_id,group); }
  for(const [principal,rows] of groups) {
    const first=rows[0].role;
    const lines=rows.map(s=>({line_id:s.order_line_id,sale_event_id:s.id,title:s.title,quantity:s.snapshot.quantity,
      weight_mg:s.weight_mg,uids:s.snapshot.uid?[s.snapshot.uid]:[],
      customer_charges:(s.snapshot.price.recognized_charges||[]).filter((r:any)=>r.payer==="CUSTOMER").map((r:any)=>({code:r.code,component:r.component,amount_irr:String(r.amount_irr),scope:r.scope})),
      price:{...safePrice(s.snapshot),tax_irr:s.snapshot.allocation.tax_irr,total_irr:s.snapshot.customer_payment_irr},
      payment_method:order.payment_method}));
    const snapshot={schema_version:1,seller:first.seller,issuer:"DIDAR",collector:"DIDAR",on_behalf:first.mode==="AGENCY",
      basis:"SANDBOX_PROVISIONAL",order_id:order.id,lines,total_irr:rows.reduce((n:bigint,s:any)=>n+BigInt(s.snapshot.customer_payment_irr),0n).toString(),
      mandate_version:first.mandate_version,original_rate_irr:String(order.rate_snapshot.rate_irr)};
    await c.query(`INSERT INTO didar_sale_document(id,kind,order_id,principal_id,mode,snapshot)
      VALUES($1,'INVOICE',$2,$3,$4,$5) ON CONFLICT DO NOTHING`,[randomUUID(),order.id,principal,first.mode,JSON.stringify(snapshot)]);
  }
}
export async function issueAgencyCredit(c:any, refund:any) {
  const role=refund.snapshot.sale_role;
  if(!role) return;
  const original=(await c.query(`SELECT d.* FROM didar_sale_document d JOIN didar_order_line l ON l.order_id=d.order_id
    WHERE l.id=$1 AND d.principal_id=$2 AND d.kind='INVOICE'`,[refund.order_line_id,role.principal_id])).rows[0];
  if(!original) throw Error("CONFLICT_INVOICE_REQUIRED");
  const source=original.snapshot.lines.filter((l:any)=>l.sale_event_id===refund.source_event_id);
  if(source.length!==1) throw Error("CONFLICT_INVOICE_SOURCE");
  const snapshot={...original.snapshot,lines:source,total_irr:refund.snapshot.customer_payment_irr,
    correction:"FULL_ORIGINAL_UNIT_REVERSAL",original_number:String(original.number),refund_event_id:refund.id,
    bank_execution:false,physical_restock:false};
  await c.query(`INSERT INTO didar_sale_document(id,kind,order_id,principal_id,mode,original_document_id,source_event_id,snapshot)
    VALUES($1,'CREDIT',$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
    [randomUUID(),original.order_id,original.principal_id,original.mode,original.id,refund.id,JSON.stringify(snapshot)]);
}
async function invoiceRead(req:any) {
  const u=await requireUser(req,["admin","customer","supplier"]);
  if(req.method!=="GET") throw Error("FORBIDDEN");
  const id=text(req.query?.order_id,100);
  return transaction(async(c)=>{
    const o=(await c.query(`SELECT * FROM didar_order WHERE id=$1 AND
      ($2='admin' OR ($2='customer' AND customer_id=$3) OR ($2='supplier' AND EXISTS(
        SELECT 1 FROM didar_order_line l JOIN didar_sale_role r ON r.line_id=l.id WHERE l.order_id=didar_order.id AND r.snapshot->>'principal_id'=$4)))`,
      [id,u.role,u.id,u.supplier_id||null])).rows[0];
    if(!o) throw Error("NOT_FOUND");
    const scope=await storeScope(req,c);
    if(scope && o.origin_supplier_id!==scope.supplier_id) throw Error("NOT_FOUND");
    const {rows:documents}=await c.query(`SELECT id,number,kind,order_id,principal_id,mode,original_document_id,snapshot,created_at
      FROM didar_sale_document WHERE order_id=$1 AND ($2<>'supplier' OR principal_id=$3) ORDER BY number`,[id,u.role,u.supplier_id||null]);
    return {documents,classification:documents.length?"ROLE_SNAPSHOT":o.status==="pending"?"PENDING":"HISTORICAL_UNCLASSIFIED"};
  });
}
export async function performAgency(action:string,req:any) {
  if(action==="invoice") return {handled:true,result:await invoiceRead(req)};
  if(action!=="agency") return {handled:false};
  const u=await requireUser(req,["admin","supplier"]);
  if(req.method==="GET") return {handled:true,result:await transaction(async(c)=>{
    const sid=u.role==="supplier"?u.supplier_id:null;
    const mandates=(await c.query(`SELECT m.*,s.name supplier_name,r.approved,rv.mandate_id IS NOT NULL revoked
      FROM didar_sale_mandate m JOIN didar_supplier s ON s.id=m.supplier_id LEFT JOIN didar_sale_mandate_review r ON r.mandate_id=m.id
      LEFT JOIN didar_sale_mandate_revocation rv ON rv.mandate_id=m.id WHERE ($1::text IS NULL OR m.supplier_id=$1) ORDER BY m.created_at DESC,m.version DESC`,[sid])).rows;
    const suppliers=(await c.query("SELECT id,name FROM didar_supplier WHERE ($1::text IS NULL OR id=$1) ORDER BY name",[sid])).rows;
    const contracts=(await c.query(`SELECT t.*,r.approved FROM didar_fin_contract t JOIN didar_fin_contract_review r ON r.contract_id=t.id
      WHERE ($1::text IS NULL OR t.supplier_id=$1) ORDER BY t.created_at DESC`,[sid])).rows;
    return {enabled:agencyEnabled(),mandates:u.role==="admin"?mandates:mandates.map((m:any)=>({id:m.id,supplier_id:m.supplier_id,supplier_name:m.supplier_name,version:m.version,mode:m.mode,approved:m.approved,revoked:m.revoked,effective_at:m.effective_at,expires_at:m.expires_at})),suppliers,contracts:u.role==="admin"?contracts:[],basis:"SANDBOX_PROVISIONAL"};
  })};
  if(req.method!=="POST") throw Error("METHOD_NOT_ALLOWED");
  if(u.role!=="admin" || !agencyEnabled()) throw Error("FORBIDDEN");
  const b=req.body||{};
  const result=await transaction(async(c)=>{
    // Same domain lock as existing contract approval, recognition and settlement.
    await c.query("SELECT pg_advisory_xact_lock(hashtext('didar:financial-core'))");
    if(b.operation==="mandate_request") {
      const supplier=text(b.supplier_id,100),contractId=text(b.contract_id,100);
      const business=(await c.query("SELECT id FROM didar_supplier WHERE id=$1 AND active AND status='approved' AND didar_native_saleable_supplier(id)",[supplier])).rows[0];
      const contract=await currentContract(c,supplier);
      if(!business || !contract || contract.id!==contractId || !["AGENCY","DIRECT_DIDAR"].includes(b.mode) ||
        (b.mode==="AGENCY" && contract.ownership!=="CONSIGNMENT") || (b.mode==="DIRECT_DIDAR" && contract.ownership!=="DIDAR_OWNED")) throw Error("INVALID_MANDATE_CONTRACT");
      const effective=new Date(b.effective_at),expires=new Date(b.expires_at);
      if(!Number.isFinite(effective.getTime()) || !Number.isFinite(expires.getTime()) || expires<=effective) throw Error("INVALID_MANDATE_DATES");
      const beneficiaries=b.beneficiaries??{};
      if(!beneficiaries || typeof beneficiaries!=="object" || Array.isArray(beneficiaries) || Object.keys(beneficiaries).length>50) throw Error("INVALID_BENEFICIARIES");
      for(const [code,payee] of Object.entries(beneficiaries)) {
        if(!/^[a-zA-Z0-9_-]{1,100}$/.test(code) || typeof payee!=="string" || !(await c.query("SELECT id FROM didar_supplier WHERE id=$1 AND active AND status='approved'",[payee])).rowCount)
          throw Error("INVALID_BENEFICIARIES");
      }
      if(b.allocation_rule && b.allocation_rule!=="COMPONENTS_V1") throw Error("INVALID_ALLOCATION_RULE");
      const version=(await c.query("SELECT COALESCE(max(version),0)+1 n FROM didar_sale_mandate WHERE supplier_id=$1",[supplier])).rows[0].n;
      const id=randomUUID();
      await c.query(`INSERT INTO didar_sale_mandate(id,supplier_id,version,mode,contract_id,effective_at,expires_at,allocation_rule,rounding_limit_irr,beneficiaries,reason,actor_id)
        VALUES($1,$2,$3,$4,$5,$6,$7,'COMPONENTS_V1',$8,$9,$10,$11)`,[id,supplier,version,b.mode,contractId,effective,expires,
          integer(b.rounding_limit_irr??0,"ROUNDING_LIMIT",0,10000),JSON.stringify(beneficiaries),text(b.reason),u.id]);
      await audit(c,u.id,"agency_mandate_requested",{id,supplier_id:supplier,version,mode:b.mode,real_actor_id:u.id});
      return {id,version};
    }
    const id=text(b.mandate_id,100),m=(await c.query("SELECT * FROM didar_sale_mandate WHERE id=$1",[id])).rows[0];
    if(!m) throw Error("NOT_FOUND");
    if(b.operation==="mandate_review") {
      if(typeof b.approved!=="boolean") throw Error("INVALID_APPROVAL");
      const existing=(await c.query("SELECT approved FROM didar_sale_mandate_review WHERE mandate_id=$1",[id])).rows[0];
      if(existing && existing.approved!==b.approved) throw Error("CONFLICT_IMMUTABLE_FINANCE");
      await c.query("INSERT INTO didar_sale_mandate_review(mandate_id,approved,actor_id,reason) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",[id,b.approved,u.id,text(b.reason)]);
    } else if(b.operation==="mandate_revoke") {
      await c.query("INSERT INTO didar_sale_mandate_revocation(mandate_id,actor_id,reason) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",[id,u.id,text(b.reason)]);
    } else throw Error("INVALID_OPERATION");
    await audit(c,u.id,"agency_"+b.operation,{mandate_id:id,supplier_id:m.supplier_id,real_actor_id:u.id});
    return {ok:true};
  });
  return {handled:true,result};
}
