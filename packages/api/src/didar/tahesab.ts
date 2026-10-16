import { randomUUID } from "node:crypto";
import { finLock, finText, fingerprint, localFinance } from "./finance";
import {
  ADAPTER_VERSION,
  canonical,
  jalaliDate,
  validateAggregate,
  validateMockEnvelope,
} from "./tahesab-contract";
async function closeRow(c: any, id: string) {
  const {
    rows: [row],
  } = await c.query(
    "SELECT x.*,m.db_alias FROM didar_fin_close x JOIN didar_fin_account_mapping m ON m.id=x.mapping_id WHERE x.id=$1",
    [id],
  );
  if (!row) throw new Error("NOT_FOUND");
  return row;
}
export async function createClose(
  c: any,
  supplier: string,
  start: string,
  end: string,
  actor: string | null,
) {
  await finLock(c);
  const from = new Date(start),
    to = new Date(end);
  if (
    !Number.isFinite(from.getTime()) ||
    !Number.isFinite(to.getTime()) ||
    from >= to ||
    to.getTime() > Date.now() ||
    to.getTime() - from.getTime() > 366 * 86400000
  )
    throw new Error("INVALID_CLOSE_PERIOD");
  const intent =
    "close:" + supplier + ":" + from.toISOString() + ":" + to.toISOString();
  const old = (
    await c.query("SELECT * FROM didar_fin_close WHERE intent=$1", [intent])
  ).rows[0];
  if (old) return old;
  const mapping = (
    await c.query(
      "SELECT * FROM didar_fin_account_mapping WHERE supplier_id=$1 ORDER BY version DESC LIMIT 1",
      [supplier],
    )
  ).rows[0];
  if (!mapping) throw new Error("CONFLICT_MAPPING_REQUIRED");
  const { rows: events } = await c.query(
    `SELECT e.* FROM didar_fin_event e WHERE e.created_at>=$2 AND e.created_at<$3 AND (e.supplier_id=$1 OR EXISTS(SELECT 1 FROM didar_fin_journal j JOIN didar_fin_posting p ON p.journal_id=j.id WHERE j.event_id=e.id AND p.party='supplier:'||$1)) AND NOT EXISTS(SELECT 1 FROM didar_fin_close_source s WHERE s.event_id=e.id AND s.supplier_id=$1) ORDER BY e.created_at,e.id`,
    [supplier, from, to],
  );
  const groups = new Map<string, any>();
  const included = [] as any[];
  const add = (e: any, p: any) => {
    const s = e.snapshot,
      group = {
        event_type: e.kind,
        jalali_date: jalaliDate(e.created_at),
        metal_basis: "FINE_GOLD_UG",
        purity: s.purity || s.price?.policy?.purity || 1000,
        instrument: p.instrument,
        account: p.account,
        party_role:
          p.party === "supplier:" + supplier
            ? "MERCHANT"
            : p.party === "DIDAR"
              ? "DIDAR"
              : "COUNTERPARTY",
      };
    const key = canonical(group),
      g = groups.get(key) || { ...group, debit: "0", credit: "0" },
      delta = BigInt(p.delta);
    if (delta > 0n) g.debit = (BigInt(g.debit) + delta).toString();
    else g.credit = (BigInt(g.credit) - delta).toString();
    groups.set(key, g);
  };
  for (const e of events) {
    let postings = (
      await c.query(
        "SELECT p.* FROM didar_fin_posting p JOIN didar_fin_journal j ON j.id=p.journal_id WHERE j.event_id=$1 ORDER BY p.id",
        [e.id],
      )
    ).rows;
    if (e.supplier_id !== supplier) {
      postings = postings.filter(
        (p: any) => p.party === "supplier:" + supplier,
      );
      for (const p of [...postings])
        postings.push({
          ...p,
          delta: (-BigInt(p.delta)).toString(),
          party: "COUNTERPARTY",
          account: "AGGREGATE_WALLET_CLEARING",
        });
    }
    if (postings.length) {
      included.push(e);
      for (const p of postings) add(e, p);
    }
  }
  if (!included.length) throw new Error("CONFLICT_NO_UNEXPORTED_EVENTS");
  const id = randomUUID(),
    factor = "DIDAR_QA_" + fingerprint(intent).slice(0, 32);
  const payload = validateAggregate({
    version: ADAPTER_VERSION,
    mode: "DRY_RUN",
    merchant: {
      id: supplier,
      account_code: mapping.merchant_code,
      gold_code: mapping.gold_code,
      rial_code: mapping.rial_code,
      invoice_reference: mapping.invoice_reference,
    },
    period: {
      start_at: from.toISOString(),
      end_at: to.toISOString(),
      timezone: "Asia/Tehran",
    },
    Factor_Code: factor,
    groups: [...groups.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, g]) => g),
  });
  const hash = fingerprint(canonical(payload));
  const row = (
    await c.query(
      "INSERT INTO didar_fin_close(id,intent,supplier_id,mapping_id,start_at,end_at,factor_code,payload,payload_hash,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *",
      [
        id,
        intent,
        supplier,
        mapping.id,
        from,
        to,
        factor,
        JSON.stringify(payload),
        hash,
        actor,
      ],
    )
  ).rows[0];
  for (const e of included)
    await c.query(
      "INSERT INTO didar_fin_close_source(close_id,event_id,supplier_id) VALUES($1,$2,$3)",
      [id, e.id, supplier],
    );
  await c.query(
    "INSERT INTO didar_fin_delivery_attempt(close_id,state,reason) VALUES($1,'pending','Dry-run export prepared; no network call')",
    [id],
  );
  return row;
}
export async function deliverMock(c: any, id: string, outcome = "success") {
  const row = await closeRow(c, id);
  const payload = validateMockEnvelope(
    { authorization: "Bearer DIDAR_LOCAL_MOCK_ONLY", DBname: row.db_alias },
    [row.factor_code, 1, row.payload],
  );
  const latest = (
    await c.query(
      "SELECT * FROM didar_fin_delivery_attempt WHERE close_id=$1 ORDER BY id DESC LIMIT 1",
      [id],
    )
  ).rows[0];
  const doc = (
    await c.query(
      "SELECT * FROM didar_fin_mock_document WHERE factor_code=$1",
      [row.factor_code],
    )
  ).rows[0];
  let state = "acknowledged",
    reason = "Verified provider-independent local mock only";
  if (doc?.deleted) {
    state = "missing";
    reason = "Mock document deleted; explicit reconciliation required";
  } else if (doc && doc.payload_hash !== row.payload_hash) {
    state = "changed";
    reason = "Mock document changed; explicit reconciliation required";
  } else if (outcome === "transient") {
    state = "transient_error";
    reason = "Synthetic retryable error";
  } else if (outcome === "reject") {
    state = "rejected";
    reason = "Synthetic provider rejection";
  } else if (outcome !== "success") throw new Error("INVALID_MOCK_OUTCOME");
  if (latest?.state === "acknowledged" && state === "acknowledged" && doc)
    return latest;
  if (state === "acknowledged" && !doc)
    await c.query(
      "INSERT INTO didar_fin_mock_document(factor_code,document_number,payload_hash,payload) VALUES($1,$2,$3,$4)",
      [
        row.factor_code,
        "MOCK-" + row.id,
        row.payload_hash,
        JSON.stringify(payload),
      ],
    );
  return (
    await c.query(
      "INSERT INTO didar_fin_delivery_attempt(close_id,state,document_number,payload_hash,reason) VALUES($1,$2,$3,$4,$5) RETURNING *",
      [
        id,
        state,
        doc?.document_number || "MOCK-" + row.id,
        state === "acknowledged" ? row.payload_hash : null,
        reason,
      ],
    )
  ).rows[0];
}
export async function tahesabRead(c: any, u: any) {
  const sid = u.role === "supplier" ? u.supplier_id : null;
  const mappings = (
    await c.query(
      "SELECT * FROM didar_fin_account_mapping WHERE ($1::text IS NULL OR supplier_id=$1) ORDER BY created_at DESC",
      [sid],
    )
  ).rows;
  const closes = (
    await c.query(
      `SELECT x.*,a.state,a.document_number,a.reason FROM didar_fin_close x LEFT JOIN LATERAL(SELECT * FROM didar_fin_delivery_attempt d WHERE d.close_id=x.id ORDER BY id DESC LIMIT 1)a ON true WHERE ($1::text IS NULL OR x.supplier_id=$1) ORDER BY x.created_at DESC LIMIT 200`,
      [sid],
    )
  ).rows;
  const suppliers = (
    await c.query(
      "SELECT id,name FROM didar_supplier WHERE ($1::text IS NULL OR id=$1) ORDER BY name",
      [sid],
    )
  ).rows;
  if (u.role === "supplier")
    for (const close of closes) {
      close.merchant_statement = close.payload.groups.filter(
        (g: any) => g.party_role === "MERCHANT",
      );
      delete close.payload;
      delete close.payload_hash;
    }
  return {
    mappings,
    closes,
    suppliers,
    spec_state: "BLOCKED_BY_SPEC",
    concrete_vendor_calls: "DISABLED",
    adapter_version: ADAPTER_VERSION,
  };
}
export async function tahesabWrite(c: any, u: any, b: any) {
  localFinance();
  await finLock(c);
  if (b.operation === "mapping") {
    const sid = finText(b.supplier_id),
      version = (
        await c.query(
          "SELECT COALESCE(max(version),0)+1 n FROM didar_fin_account_mapping WHERE supplier_id=$1",
          [sid],
        )
      ).rows[0].n,
      id = randomUUID(),
      alias = finText(b.db_alias);
    if (!/^QA_[A-Za-z0-9_-]{1,80}$/.test(alias))
      throw new Error("INVALID_MOCK_DATABASE");
    await c.query(
      "INSERT INTO didar_fin_account_mapping(id,supplier_id,version,merchant_code,gold_code,rial_code,invoice_reference,db_alias,reason,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
      [
        id,
        sid,
        version,
        finText(b.merchant_code),
        finText(b.gold_code),
        finText(b.rial_code),
        finText(b.invoice_reference),
        alias,
        finText(b.reason, 1000),
        u.id,
      ],
    );
    return { id };
  }
  if (b.operation === "close")
    return {
      close: await createClose(
        c,
        finText(b.supplier_id),
        finText(b.start_at),
        finText(b.end_at),
        u.id,
      ),
    };
  if (["dispatch", "reconcile"].includes(b.operation))
    return {
      attempt: await deliverMock(
        c,
        finText(b.close_id),
        b.operation === "reconcile" ? "success" : b.outcome || "success",
      ),
    };
  if (b.operation === "mock_change") {
    const row = await closeRow(c, finText(b.close_id));
    if (!["delete", "edit"].includes(b.change))
      throw new Error("INVALID_MOCK_CHANGE");
    await c.query(
      b.change === "delete"
        ? "UPDATE didar_fin_mock_document SET deleted=true WHERE factor_code=$1"
        : "UPDATE didar_fin_mock_document SET payload_hash='MOCK_EDITED' WHERE factor_code=$1",
      [row.factor_code],
    );
    return { ok: true };
  }
  throw new Error("INVALID_TAHESAB_OPERATION");
}
