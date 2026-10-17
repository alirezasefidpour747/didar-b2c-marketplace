import { describe, expect, test } from "bun:test";
import { agencyAllocation, agencyEnabled } from "../packages/api/src/didar/agency";

const role=(extra:any={})=>({mode:"AGENCY",principal_id:"approved-seller-business",allocation_rule:"COMPONENTS_V1",rounding_limit_irr:2,beneficiaries:{},tax_version_id:"approved-tax-v1",profile_version_id:null,...extra});
const price=(extra:any={})=>({metal_irr:100000,labor_irr:12000,distribution_irr:3000,retail_irr:7000,fee_irr:100,rounding_irr:1,tax_irr:2200,...extra});
const ent=(extra:any={})=>({gold_ug:"42000000",irr:"56000",...extra});
// 1000IRR per 750-equivalent gram: 42g fine is 56000IRR and 56000IRR
// cash represent one MIXED entitlement, not two copies of the metal obligation.
describe("CORE-03 governed allocation without a second financial writer",()=>{
  test("MIXED preserves separate gold quantity/book value and rial",()=>{
    const a=agencyAllocation(role(),price(),ent(),124301n,1000n,1);
    expect(a.seller_gold_ug).toBe("42000000");expect(a.seller_gold_book_irr).toBe("56000");expect(a.seller_rial_irr).toBe("56000");
    expect(a.didar_share_irr).toBe("10101");expect(a.conversion_adjustment_irr).toBe("0");expect(a.tax_irr).toBe("2200");
  });
  test("gold-only and rial-only preserve their contractual instruments",()=>{
    const g=agencyAllocation(role(),price(),ent({gold_ug:"84000000",irr:"0"}),124301n,1000n,1);
    const r=agencyAllocation(role(),price(),ent({gold_ug:"0",irr:"112000"}),124301n,1000n,1);
    expect(g.seller_gold_book_irr).toBe("112000");expect(g.seller_rial_irr).toBe("0");
    expect(r.seller_gold_ug).toBe("0");expect(r.seller_rial_irr).toBe("112000");expect(g.didar_share_irr).toBe(r.didar_share_irr);
  });
  test("DIDAR direct sale has own revenue and no agency principal payable",()=>{
    const a=agencyAllocation(role({mode:"DIRECT_DIDAR"}),price(),ent({gold_ug:"0",irr:"0"}),124301n,1000n,1);
    expect(a.didar_share_irr).toBe("122101");expect(a.seller_gold_ug).toBe("0");expect(a.seller_rial_irr).toBe("0");
  });
  test("a signed conversion delta must derive from the original metal/making price",()=>{
    const a=agencyAllocation(role(),price({metal_irr:99999}),ent(),124300n,1000n,1);
    expect(a.conversion_adjustment_irr).toBe("-1");expect(a.didar_share_irr).toBe("10100");
    expect(()=>agencyAllocation(role({rounding_limit_irr:0}),price({metal_irr:99999}),ent(),124300n,1000n,1)).toThrow("CONFLICT_AGENCY_CONVERSION_ROUNDING");
    // A tolerance of 10000 cannot turn an unrelated collected residual into income.
    expect(()=>agencyAllocation(role({rounding_limit_irr:10000}),price(),ent(),124302n,1000n,1)).toThrow("CONFLICT_AGENCY_ALLOCATION");
  });
  test("negative unexplained allocations fail closed",()=>{
    expect(()=>agencyAllocation(role(),price(),ent({irr:"80000"}),124301n,1000n,1)).toThrow();
    expect(()=>agencyAllocation(role(),price(),ent(),0n,1000n,1)).toThrow("CONFLICT_AGENCY_ALLOCATION");
  });
  test("approved CASH/CREDIT profile beneficiaries remain explicit",()=>{
    for(const method of ["CASH","CREDIT"]){
      const p=price({merchant_profile:{version_id:"profile-v1"},distribution_irr:0,retail_irr:0,fee_irr:0,rounding_irr:0,tax_irr:2200,
        recognized_vat_irr:"2300",recognized_charges:[
          {code:"retail",component:"retail",payer:"CUSTOMER",recipient:"DIDAR",amount_irr:"7000"},
          {code:"delivery",component:"distribution",payer:"CUSTOMER",recipient:"THIRD_PARTY",amount_irr:"1000"},
          {code:"service",component:"credit",payer:"MERCHANT",recipient:"DIDAR",amount_irr:method==="CREDIT"?"300":"0"}
        ]});
      const a=agencyAllocation(role({profile_version_id:"profile-v1",beneficiaries:{delivery:"approved-carrier-business"}}),p,ent(),122300n,1000n,1);
      expect(a.didar_share_irr).toBe("7000");expect(a.third_party_irr).toBe("1000");
      expect(a.charges.find((r:any)=>r.code==="delivery")?.payee_id).toBe("approved-carrier-business");
      expect(()=>agencyAllocation(role(),p,ent(),122300n,1000n,1)).toThrow("CONFLICT_AGENCY_BENEFICIARY");
    }
  });
  test("DIDAR direct mode never charges an uncontracted physical supplier as merchant",()=>{
    const p=price({merchant_profile:{version_id:"profile-v1"},distribution_irr:0,retail_irr:0,fee_irr:0,rounding_irr:0,
      recognized_charges:[{code:"retail",component:"retail",payer:"MERCHANT",recipient:"DIDAR",amount_irr:"1000"}]});
    expect(()=>agencyAllocation(role({mode:"DIRECT_DIDAR",principal_id:"DIDAR"}),p,ent({gold_ug:"0",irr:"0"}),114200n,1000n,1))
      .toThrow("CONFLICT_AGENCY_DIRECT_PAYER");
    const agency=agencyAllocation(role(),p,ent(),114200n,1000n,1);
    expect(agency.charges[0].payer_id).toBe("approved-seller-business");
  });
  test("profile unknown recipient/component never becomes a generic residual",()=>{
    const p=price({recognized_charges:[{code:"x",component:"unknown",payer:"CUSTOMER",recipient:"DIDAR",amount_irr:"1"}]});
    expect(()=>agencyAllocation(role(),p,ent(),124301n,1000n,1)).toThrow("CONFLICT_AGENCY_BENEFICIARY");
  });
  test("new mode is only enabled through all three explicit sandbox flags",()=>{
    const before={mode:process.env.DIDAR_AGENCY_MODE,environment:process.env.DIDAR_ENVIRONMENT,payment:process.env.DIDAR_PAYMENT_MODE};
    try {
      process.env.DIDAR_AGENCY_MODE="sandbox";process.env.DIDAR_ENVIRONMENT="production";process.env.DIDAR_PAYMENT_MODE="sandbox";expect(agencyEnabled()).toBe(false);
      process.env.DIDAR_ENVIRONMENT="local";process.env.DIDAR_PAYMENT_MODE="live";expect(agencyEnabled()).toBe(false);
      process.env.DIDAR_PAYMENT_MODE="sandbox";expect(agencyEnabled()).toBe(true);
    } finally {
      for(const [key,value] of [["DIDAR_AGENCY_MODE",before.mode],["DIDAR_ENVIRONMENT",before.environment],["DIDAR_PAYMENT_MODE",before.payment]]) {
        if(value===undefined) delete process.env[key!];else process.env[key!]=value;
      }
    }
  });
});
