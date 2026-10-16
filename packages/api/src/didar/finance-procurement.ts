import { appendEvent, big, finText } from "./finance";
const get = async (c: any, id: string, kind?: string) => {
  const {
    rows: [e],
  } = await c.query("SELECT * FROM didar_fin_event WHERE id=$1", [id]);
  if (!e || (kind && e.kind !== kind)) throw new Error("NOT_FOUND");
  return e;
};
const total = async (c: any, kind: string, key: string, id: string) =>
  BigInt(
    (
      await c.query(
        `SELECT COALESCE(sum((snapshot->>'amount_ug')::bigint),0)::text n FROM didar_fin_event e WHERE kind=$1 AND snapshot->>$2=$3 AND NOT EXISTS(SELECT 1 FROM didar_fin_event r WHERE (r.kind='FACT_REVERSED' AND r.source_event_id=e.id OR r.kind='SETTLEMENT_REVERSED' AND r.snapshot->>'reversed_event_id'=e.id))`,
        [kind, key, id],
      )
    ).rows[0].n,
  );
const exists = async (c: any, kind: string, source: string) =>
  !!(
    await c.query(
      `SELECT id FROM didar_fin_event WHERE kind=$1 AND (source_event_id=$2 OR ($1='SETTLEMENT_REVERSED' AND snapshot->>'reversed_event_id'=$2))`,
      [kind, source],
    )
  ).rowCount;
export async function obligationBalance(c: any, sale: any) {
  return (
    await c.query(
      `SELECT COALESCE(sum(gold_ug),0)::text gold_ug,COALESCE(sum(irr),0)::text irr FROM didar_fin_event WHERE id=$1 OR (source_event_id=$1 AND kind IN ('REFUND','GOLD_SETTLEMENT','RIAL_SETTLEMENT','SETTLEMENT_REVERSED','PAYABLE_TO_WALLET'))`,
      [sale.id],
    )
  ).rows[0];
}
export async function procurementRead(c: any, u: any) {
  const sid = u.role === "supplier" ? u.supplier_id : null;
  const requests = (
    await c.query(
      `SELECT r.*,e.snapshot->>'due_at' due_at,
   EXISTS(SELECT 1 FROM didar_fin_event a WHERE a.kind='REQUEST_APPROVED' AND a.source_event_id=r.sale_event_id) approved,
   EXISTS(SELECT 1 FROM didar_fin_event a WHERE a.kind='REFUND' AND a.source_event_id=r.sale_event_id) reversed
   FROM didar_fin_request r JOIN didar_fin_event e ON e.id=r.sale_event_id WHERE ($1::text IS NULL OR r.supplier_id=$1) ORDER BY r.created_at,r.id`,
      [sid],
    )
  ).rows;
  for (const r of requests) {
    const sale = await get(c, r.sale_event_id);
    r.balance = await obligationBalance(c, sale);
    r.allocated_ug = (
      await total(c, "ALLOCATION", "sale_id", sale.id)
    ).toString();
    r.overdue =
      new Date(r.due_at).getTime() < Date.now() &&
      (BigInt(r.balance.gold_ug) > 0n || BigInt(r.balance.irr) > 0n);
    r.state = r.reversed
      ? "reversed"
      : BigInt(r.balance.gold_ug) <= 0n && BigInt(r.balance.irr) <= 0n
        ? "settled"
        : r.approved
          ? "approved"
          : "requested";
  }
  const facts = (
    await c.query(
      `SELECT id,kind,source_event_id,supplier_id,created_at,snapshot FROM didar_fin_event WHERE kind IN ('PURCHASE','PURCHASE_APPROVED','ALLOCATION','TITLE_TRANSFER','PHYSICAL_HANDOVER','GOLD_SETTLEMENT','RIAL_SETTLEMENT','FACT_REVERSED','SETTLEMENT_REVERSED') AND ($1::text IS NULL OR supplier_id=$1) ORDER BY created_at,id`,
      [sid],
    )
  ).rows;
  if (u.role === "supplier")
    for (const fact of facts) {
      fact.snapshot = { ...fact.snapshot };
      for (const key of ["cost_basis_irr", "cost_irr", "command"])
        delete fact.snapshot[key];
    }
  const purchase_stock = [] as any[];
  if (u.role === "admin")
    for (const p of facts.filter((e: any) => e.kind === "PURCHASE")) {
      const reversed = facts.some(
        (r: any) => r.kind === "FACT_REVERSED" && r.source_event_id === p.id,
      );
      const allocated = await total(c, "ALLOCATION", "purchase_id", p.id);
      const titled = facts
        .filter(
          (r: any) =>
            r.kind === "TITLE_TRANSFER" && r.snapshot.purchase_id === p.id,
        )
        .reduce((n: bigint, r: any) => n + BigInt(r.snapshot.amount_ug), 0n);
      purchase_stock.push({
        purchase_id: p.id,
        owned_ug: reversed
          ? "0"
          : (BigInt(p.snapshot.fine_ug) - titled).toString(),
        unallocated_ug: reversed
          ? "0"
          : (BigInt(p.snapshot.fine_ug) - allocated).toString(),
        reversed,
      });
    }
  const rial_obligations = (
    await c.query(
      "SELECT id,supplier_id,snapshot->>'due_at' due_at FROM didar_fin_event WHERE kind='SALE_EXPOSURE' AND gold_ug=0 AND irr>0 AND ($1::text IS NULL OR supplier_id=$1) ORDER BY created_at,id",
      [sid],
    )
  ).rows;
  for (const r of rial_obligations) r.balance = await obligationBalance(c, r);
  return { requests, facts, purchase_stock, rial_obligations };
}
export async function procurementWrite(
  c: any,
  u: any,
  b: any,
): Promise<any | undefined> {
  if (
    ![
      "request_approve",
      "purchase",
      "purchase_approve",
      "allocate",
      "title_transfer",
      "physical_handover",
      "gold_settle",
      "rial_settle",
      "reverse_fact",
      "reverse_settlement",
    ].includes(b.operation)
  )
    return undefined;
  const reason = finText(b.reason, 1000),
    key = finText(b.idempotency_key, 100);
  const intent = "procurement:" + b.operation + ":" + key;
  const payload = { ...b };
  delete payload.reason;
  const {
    rows: [old],
  } = await c.query(
    "SELECT e.*,cmd.payload=$2::jsonb same FROM didar_fin_command cmd JOIN didar_fin_event e ON e.id=cmd.event_id WHERE cmd.key=$1",
    [intent, JSON.stringify(payload)],
  );
  if (old) {
    if (!old.same) throw new Error("CONFLICT_IDEMPOTENCY");
    return { event: old };
  }
  let kind = "",
    source: any = null,
    sid: string | null = null,
    gold = 0n,
    rial = 0n,
    snapshot: any = {
      reason,
      command: payload,
      synthetic: true,
      execution: "MANUAL_BOOKED_QA",
      bank_execution: false,
    };
  if (b.operation === "purchase") {
    kind = "PURCHASE";
    const weight = big(b.weight_mg, true),
      purity = Number(big(b.purity, true));
    if (weight > 100000000n || purity > 1000)
      throw new Error("INVALID_PURCHASE");
    const fine = weight * BigInt(purity),
      cost = big(b.cost_irr, true),
      rate = big(b.rate_irr, true);
    if (b.currency !== "IRR" || b.synthetic !== true)
      throw new Error("INVALID_SYNTHETIC_PURCHASE");
    snapshot = {
      ...snapshot,
      weight_mg: weight.toString(),
      purity,
      fine_ug: fine.toString(),
      cost_irr: cost.toString(),
      rate_irr: rate.toString(),
      currency: "IRR",
      counterparty: finText(b.counterparty),
      document: finText(b.document),
      custody: finText(b.custody),
      title_confirmed: b.title_confirmed === true,
    };
  } else if (b.operation === "purchase_approve") {
    source = await get(c, finText(b.purchase_id), "PURCHASE");
    kind = "PURCHASE_APPROVED";
    snapshot.purchase_id = source.id;
    if (await exists(c, "FACT_REVERSED", source.id))
      throw new Error("CONFLICT_REVERSED");
  } else if (b.operation === "request_approve") {
    source = await get(c, finText(b.sale_id), "SALE_EXPOSURE");
    sid = source.supplier_id;
    kind = "REQUEST_APPROVED";
    if (BigInt((await obligationBalance(c, source)).gold_ug) <= 0n)
      throw new Error("CONFLICT_OBLIGATION");
  } else if (b.operation === "allocate") {
    source = await get(c, finText(b.sale_id), "SALE_EXPOSURE");
    sid = source.supplier_id;
    const p = await get(c, finText(b.purchase_id), "PURCHASE"),
      amount = big(b.amount_ug, true);
    if (
      !(await exists(c, "REQUEST_APPROVED", source.id)) ||
      !(await exists(c, "PURCHASE_APPROVED", p.id)) ||
      (await exists(c, "FACT_REVERSED", p.id)) ||
      !p.snapshot.title_confirmed
    )
      throw new Error("CONFLICT_APPROVAL_REQUIRED");
    const requestAlloc = await total(c, "ALLOCATION", "sale_id", source.id),
      purchaseAlloc = await total(c, "ALLOCATION", "purchase_id", p.id);
    const refunded = await exists(c, "REFUND", source.id);
    if (
      refunded ||
      requestAlloc + amount > BigInt(source.gold_ug) ||
      purchaseAlloc + amount > BigInt(p.snapshot.fine_ug)
    )
      throw new Error("CONFLICT_OVER_ALLOCATION");
    const priorCost = BigInt(
      (
        await c.query(
          `SELECT COALESCE(sum((e.snapshot->>'cost_basis_irr')::bigint),0)::text n FROM didar_fin_event e WHERE e.kind='ALLOCATION' AND e.snapshot->>'purchase_id'=$1 AND NOT EXISTS(SELECT 1 FROM didar_fin_event r WHERE r.kind='FACT_REVERSED' AND r.source_event_id=e.id)`,
          [p.id],
        )
      ).rows[0].n,
    );
    const cost =
      purchaseAlloc + amount === BigInt(p.snapshot.fine_ug)
        ? BigInt(p.snapshot.cost_irr) - priorCost
        : (BigInt(p.snapshot.cost_irr) * amount) / BigInt(p.snapshot.fine_ug);
    kind = "ALLOCATION";
    snapshot = {
      ...snapshot,
      sale_id: source.id,
      purchase_id: p.id,
      amount_ug: amount.toString(),
      cost_basis_irr: cost.toString(),
    };
  } else if (
    ["title_transfer", "physical_handover", "gold_settle"].includes(b.operation)
  ) {
    const a = await get(c, finText(b.allocation_id), "ALLOCATION");
    source = await get(c, a.snapshot.sale_id, "SALE_EXPOSURE");
    sid = source.supplier_id;
    if (
      (await exists(c, "FACT_REVERSED", a.id)) ||
      (await exists(c, "REFUND", source.id))
    )
      throw new Error("CONFLICT_REVERSED");
    snapshot = {
      ...snapshot,
      sale_id: source.id,
      allocation_id: a.id,
      purchase_id: a.snapshot.purchase_id,
      amount_ug: a.snapshot.amount_ug,
      cost_basis_irr: a.snapshot.cost_basis_irr,
    };
    if (b.operation === "title_transfer") {
      kind = "TITLE_TRANSFER";
      snapshot.document = finText(b.document);
    }
    if (b.operation === "physical_handover") {
      if (!["DELIVERED", "HELD_FOR_SUPPLIER"].includes(b.disposition))
        throw new Error("INVALID_DISPOSITION");
      kind = "PHYSICAL_HANDOVER";
      snapshot.disposition = b.disposition;
      snapshot.document = finText(b.document);
    }
    if (b.operation === "gold_settle") {
      const { rows: facts } = await c.query(
        "SELECT kind FROM didar_fin_event WHERE snapshot->>'allocation_id'=$1 AND kind IN ('TITLE_TRANSFER','PHYSICAL_HANDOVER')",
        [a.id],
      );
      if (
        !facts.some((e: any) => e.kind === "TITLE_TRANSFER") ||
        !facts.some((e: any) => e.kind === "PHYSICAL_HANDOVER")
      )
        throw new Error("CONFLICT_TITLE_AND_CUSTODY_REQUIRED");
      const amount = big(b.amount_ug, true),
        used = await total(c, "GOLD_SETTLEMENT", "allocation_id", a.id),
        remaining = BigInt((await obligationBalance(c, source)).gold_ug);
      if (used + amount > BigInt(a.snapshot.amount_ug) || amount > remaining)
        throw new Error("CONFLICT_OVER_SETTLEMENT");
      const usedCost = BigInt(
        (
          await c.query(
            `SELECT COALESCE(sum((e.snapshot->>'cost_basis_irr')::bigint),0)::text n FROM didar_fin_event e WHERE e.kind='GOLD_SETTLEMENT' AND e.snapshot->>'allocation_id'=$1 AND NOT EXISTS(SELECT 1 FROM didar_fin_event r WHERE r.kind='SETTLEMENT_REVERSED' AND r.snapshot->>'reversed_event_id'=e.id)`,
            [a.id],
          )
        ).rows[0].n,
      );
      const basis = BigInt(a.snapshot.cost_basis_irr || 0);
      snapshot.cost_basis_irr = (
        used + amount === BigInt(a.snapshot.amount_ug)
          ? basis - usedCost
          : (basis * amount) / BigInt(a.snapshot.amount_ug)
      ).toString();
      kind = "GOLD_SETTLEMENT";
      gold = -amount;
      snapshot.amount_ug = amount.toString();
    }
  } else if (b.operation === "rial_settle") {
    source = await get(c, finText(b.sale_id), "SALE_EXPOSURE");
    sid = source.supplier_id;
    const amount = big(b.amount_irr, true);
    if (amount > BigInt((await obligationBalance(c, source)).irr))
      throw new Error("CONFLICT_OVER_SETTLEMENT");
    kind = "RIAL_SETTLEMENT";
    rial = -amount;
    snapshot = {
      ...snapshot,
      sale_id: source.id,
      amount_irr: amount.toString(),
      document: finText(b.document),
    };
  } else if (b.operation === "reverse_fact") {
    source = await get(c, finText(b.event_id));
    sid = source.supplier_id;
    if (
      !["PURCHASE", "ALLOCATION"].includes(source.kind) ||
      (await exists(c, "FACT_REVERSED", source.id))
    )
      throw new Error("CONFLICT_REVERSAL");
    if (
      source.kind === "PURCHASE" &&
      (await total(c, "ALLOCATION", "purchase_id", source.id)) > 0n
    )
      throw new Error("CONFLICT_ALLOCATED_PURCHASE");
    if (source.kind === "ALLOCATION") {
      const facts = (
        await c.query(
          "SELECT id FROM didar_fin_event WHERE snapshot->>'allocation_id'=$1 AND kind IN ('TITLE_TRANSFER','PHYSICAL_HANDOVER','GOLD_SETTLEMENT')",
          [source.id],
        )
      ).rows;
      if (facts.length) throw new Error("CONFLICT_TITLE_OR_CUSTODY");
    }
    kind = "FACT_REVERSED";
    snapshot = {
      ...snapshot,
      original_kind: source.kind,
      purchase_id:
        source.kind === "PURCHASE" ? source.id : source.snapshot.purchase_id,
    };
  } else if (b.operation === "reverse_settlement") {
    const settled = await get(c, finText(b.event_id));
    if (
      !["GOLD_SETTLEMENT", "RIAL_SETTLEMENT"].includes(settled.kind) ||
      (await exists(c, "SETTLEMENT_REVERSED", settled.id))
    )
      throw new Error("CONFLICT_REVERSAL");
    source = await get(c, settled.source_event_id, "SALE_EXPOSURE");
    sid = source.supplier_id;
    kind = "SETTLEMENT_REVERSED";
    gold = -BigInt(settled.gold_ug);
    rial = -BigInt(settled.irr);
    snapshot = {
      ...snapshot,
      reversed_event_id: settled.id,
      return_evidence: finText(b.return_evidence),
      allocation_id: settled.snapshot.allocation_id || null,
    };
  }
  // Facts title/custody and approvals are once per business source, independent of client key.
  const once = [
    "REQUEST_APPROVED",
    "PURCHASE_APPROVED",
    "TITLE_TRANSFER",
    "PHYSICAL_HANDOVER",
    "FACT_REVERSED",
    "SETTLEMENT_REVERSED",
  ].includes(kind);
  const businessIntent = once
    ? "fact:" +
      kind +
      ":" +
      (snapshot.reversed_event_id || snapshot.allocation_id || source.id)
    : intent;
  const existing = await c.query(
    "SELECT id FROM didar_fin_event WHERE intent=$1",
    [businessIntent],
  );
  if (existing.rowCount) throw new Error("CONFLICT_ALREADY_RECORDED");
  const event = await appendEvent(c, {
    intent: businessIntent,
    kind,
    source_event_id: source?.id,
    supplier_id: sid,
    order_line_id: source?.order_line_id,
    reservation_id: source?.reservation_id,
    gold_ug: gold,
    irr: rial,
    snapshot,
    actor_id: u.id,
  });
  if (kind === "ALLOCATION") {
    const p = await get(c, snapshot.purchase_id, "PURCHASE");
    await appendEvent(c, {
      intent: event.intent + ":procurement-share",
      kind: "PROCUREMENT_ASSIGNED",
      supplier_id: sid,
      source_event_id: event.id,
      order_line_id: source.order_line_id,
      reservation_id: source.reservation_id,
      actor_id: u.id,
      snapshot: {
        purchase_id: p.id,
        allocation_id: event.id,
        amount_ug: snapshot.amount_ug,
        purity: p.snapshot.purity,
        synthetic: true,
        meaning: "share_of_documented_synthetic_purchase_not_new_execution",
      },
    });
  }
  if (kind === "FACT_REVERSED" && source.kind === "ALLOCATION") {
    const share = (
      await c.query(
        "SELECT * FROM didar_fin_event WHERE kind='PROCUREMENT_ASSIGNED' AND source_event_id=$1",
        [source.id],
      )
    ).rows[0];
    if (share)
      await appendEvent(c, {
        intent: event.intent + ":procurement-share-reversal",
        kind: "PROCUREMENT_ASSIGNMENT_REVERSED",
        supplier_id: sid,
        source_event_id: share.id,
        actor_id: u.id,
        snapshot: {
          allocation_id: source.id,
          amount_ug: share.snapshot.amount_ug,
          purity: share.snapshot.purity,
          synthetic: true,
        },
      });
  }
  await c.query(
    "INSERT INTO didar_fin_command(key,event_id,payload) VALUES($1,$2,$3)",
    [intent, event.id, JSON.stringify(payload)],
  );
  return { event };
}
