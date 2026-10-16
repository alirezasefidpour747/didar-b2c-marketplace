import { randomUUID } from "node:crypto";
import { finLock, finText, localFinance } from "./finance";
export async function acceptanceRead(c: any, u: any) {
  await finLock(c);
  const sid = u.role === "supplier" ? u.supplier_id : null;
  const count = async (sql: string, params: any[] = [sid]) =>
    Number((await c.query(sql, params)).rows[0].n);
  const checks = {
    stock_cache_mismatches: await count(
      `SELECT count(*)::int n FROM didar_offer o WHERE o.stock_mode='itemized' AND ($1::text IS NULL OR o.supplier_id=$1) AND o.quantity<>(SELECT count(*) FROM didar_inventory_item i WHERE i.offer_id=o.id AND i.status='available')`,
    ),
    unbalanced_instruments: await count(
      `SELECT count(*)::int n FROM(SELECT p.journal_id,p.instrument FROM didar_fin_posting p JOIN didar_fin_journal j ON j.id=p.journal_id JOIN didar_fin_event e ON e.id=j.event_id WHERE ($1::text IS NULL OR e.supplier_id=$1) GROUP BY p.journal_id,p.instrument HAVING sum(p.delta)<>0)x`,
    ),
    negative_wallet_balances: await count(
      `SELECT count(*)::int n FROM(SELECT party,account,instrument FROM didar_fin_posting WHERE account IN ('WALLET_AVAILABLE','WALLET_PENDING','WALLET_RESERVED','WALLET_PLEDGED') AND ($1::text IS NULL OR party='supplier:'||$1) GROUP BY party,account,instrument HAVING sum(delta)>0)x`,
    ),
    purchase_overallocations: await count(
      `SELECT count(*)::int n FROM didar_fin_event p WHERE p.kind='PURCHASE' AND ($1::text IS NULL OR EXISTS(SELECT 1 FROM didar_fin_event a WHERE a.kind='ALLOCATION' AND a.snapshot->>'purchase_id'=p.id AND a.supplier_id=$1)) AND (p.snapshot->>'fine_ug')::bigint < (SELECT COALESCE(sum((a.snapshot->>'amount_ug')::bigint),0) FROM didar_fin_event a WHERE a.kind='ALLOCATION' AND a.snapshot->>'purchase_id'=p.id AND NOT EXISTS(SELECT 1 FROM didar_fin_event r WHERE r.kind='FACT_REVERSED' AND r.source_event_id=a.id))`,
    ),
    missing_sale_journals: await count(
      `SELECT count(*)::int n FROM didar_fin_event e WHERE e.kind='SALE_EXPOSURE' AND ($1::text IS NULL OR e.supplier_id=$1) AND NOT EXISTS(SELECT 1 FROM didar_fin_journal j WHERE j.event_id=e.id)`,
    ),
    duplicate_close_sources: await count(
      `SELECT count(*)::int n FROM(SELECT event_id,supplier_id FROM didar_fin_close_source WHERE ($1::text IS NULL OR supplier_id=$1) GROUP BY event_id,supplier_id HAVING count(*)>1)x`,
    ),
  };
  const totals = {
    physical_units: await count(
      "SELECT count(*)::int n FROM didar_inventory_item WHERE ($1::text IS NULL OR supplier_id=$1)",
    ),
    financial_events: await count(
      "SELECT count(*)::int n FROM didar_fin_event WHERE ($1::text IS NULL OR supplier_id=$1)",
    ),
    journals: await count(
      "SELECT count(*)::int n FROM didar_fin_journal j JOIN didar_fin_event e ON e.id=j.event_id WHERE ($1::text IS NULL OR e.supplier_id=$1)",
    ),
    unvalued_owned_sales: await count(
      "SELECT count(*)::int n FROM didar_fin_event WHERE kind='SALE_EXPOSURE' AND snapshot->>'ownership'='DIDAR_OWNED' AND snapshot->>'owned_cost_irr' IS NULL AND ($1::text IS NULL OR supplier_id=$1)",
    ),
  };
  const technical_pass = Object.values(checks).every((n) => n === 0);
  const checkpoints =
    u.role === "admin"
      ? (
          await c.query(
            "SELECT id,reviewed_revision,created_at FROM didar_fin_uat_checkpoint ORDER BY created_at DESC LIMIT 20",
          )
        ).rows
      : [];
  return {
    checks,
    totals,
    technical_pass,
    checkpoints,
    completion_state: "MAC_UAT_PENDING_AND_TAHESAB_SPEC_BLOCKED",
    mac_uat: "PENDING",
    physical_rfid: "PENDING",
    concrete_tahesab: "BLOCKED_BY_SPEC",
    live_transactions: "DISABLED",
    accounting_signoff: "PENDING",
    source_runtime:
      process.platform === "darwin"
        ? "MAC_RUNTIME_OBSERVED_NOT_BUSINESS_ACCEPTED"
        : "CODEX_LINUX",
    observed_at: new Date().toISOString(),
  };
}
export async function acceptanceWrite(c: any, u: any, b: any) {
  localFinance();
  if (b.operation !== "checkpoint")
    throw new Error("INVALID_ACCEPTANCE_OPERATION");
  const revision = finText(b.reviewed_revision);
  if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error("INVALID_REVISION");
  const report = await acceptanceRead(c, u),
    id = randomUUID();
  await c.query(
    "INSERT INTO didar_fin_uat_checkpoint(id,actor_id,reviewed_revision,report) VALUES($1,$2,$3,$4)",
    [id, u.id, revision, JSON.stringify(report)],
  );
  return {
    id,
    report,
    revision_basis:
      "OPERATOR_SUPPLIED_REVIEW_REFERENCE_NOT_A_SOURCE_ATTESTATION",
  };
}
