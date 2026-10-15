import { randomUUID } from "node:crypto";
import { db, transaction } from "./db";
import { requireUser } from "./auth";
import { integer } from "./pricing";
import { authorize, audit, permissions, PERMISSIONS } from "./permissions";
const id = () => randomUUID();
function text(v: any, max = 250) {
  if (typeof v !== "string" || !v.trim() || v.length > max)
    throw new Error("INVALID_TEXT");
  return v.trim();
}
const optional = (v: any, max = 2000) => (v ? text(v, max) : "");
const admin = (u: any) => {
  if (u.role !== "admin") throw new Error("FORBIDDEN");
};
export function normalizeUID(v: any) {
  const uid = text(v, 80).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{2,79}$/.test(uid)) throw new Error("INVALID_UID");
  return uid;
}
export function normalizeEPC(v: any) {
  let epc = text(v, 250)
    .replace(/^epc\s*[:=]\s*/i, "")
    .replace(/^0x/i, "")
    .replace(/[\s:-]/g, "")
    .toUpperCase();
  if (!/^[0-9A-F]{8,128}$/.test(epc) || epc.length % 2)
    throw new Error("INVALID_EPC");
  return epc;
}
function making(b: any) {
  if (!["percent", "fixed_gold"].includes(b.making_mode))
    throw new Error("INVALID_MAKING_MODE");
  return [
    b.making_mode,
    integer(b.making_bps ?? 0, "MAKING", 0, 10000),
    integer(b.making_weight_mg ?? 0, "MAKING_WEIGHT", 0, 1000000),
  ];
}
async function getBatch(c: any, u: any, batchId: string, write = false) {
  const {
    rows: [b],
  } = await c.query(
    `SELECT b.*,s.name supplier FROM didar_intake_batch b JOIN didar_supplier s ON s.id=b.supplier_id WHERE b.id=$1 ${write ? "FOR UPDATE OF b" : ""}`,
    [batchId],
  );
  if (!b) throw new Error("NOT_FOUND");
  await authorize(c, u, b.supplier_id, write ? "CREATE_OWN_INTAKE" : undefined);
  return b;
}
async function reconciliation(c: any, batch: string) {
  const { rows } = await c.query(
    `SELECT l.*,count(i.id)::int measured_quantity,coalesce(sum(i.weight_mg),0)::int measured_weight_mg,
 count(i.id)::int-l.quantity quantity_delta,coalesce(sum(i.weight_mg),0)::int-l.total_weight_mg weight_delta_mg
 FROM didar_intake_line l LEFT JOIN didar_inventory_item i ON i.line_id=l.id AND i.status<>'void' WHERE l.batch_id=$1 GROUP BY l.id ORDER BY l.id`,
    [batch],
  );
  return rows;
}
async function listInventory(c: any, u: any, search?: string) {
  if (u.role === "supplier") await authorize(c, u, u.supplier_id);
  const { rows } = await c.query(
    `SELECT i.*,r.epc,r.raw_value,l.description,b.id batch_id,b.invoice_number,p.title,s.name supplier,
 (SELECT json_agg(json_build_object('id',x.id,'order_line_id',x.order_line_id,'order_id',ol.order_id,'status',x.status,'fulfillment_status',x.fulfillment_status,'return_status',ret.status))
 FROM didar_item_reservation x JOIN didar_order_line ol ON ol.id=x.order_line_id LEFT JOIN didar_item_return ret ON ret.reservation_id=x.id WHERE x.item_id=i.id) sales
 FROM didar_inventory_item i JOIN didar_intake_line l ON l.id=i.line_id JOIN didar_intake_batch b ON b.id=l.batch_id
 JOIN didar_supplier s ON s.id=i.supplier_id LEFT JOIN didar_product p ON p.id=i.product_id
 LEFT JOIN didar_item_rfid_binding r ON r.item_id=i.id AND r.active
 WHERE ($1='admin' OR i.supplier_id=$2) AND ($3::text IS NULL OR i.uid=$3 OR r.epc=$4)
 ORDER BY i.created_at DESC,i.id`,
    [
      u.role,
      u.supplier_id,
      search ? search.trim().toUpperCase() : null,
      search
        ? (() => {
            try {
              return normalizeEPC(search);
            } catch {
              return "";
            }
          })()
        : null,
    ],
  );
  return rows;
}
async function intake(req: any, u: any) {
  const b = req.body || {};
  if (req.method === "GET")
    return transaction(async (c) => {
      if (u.role === "supplier") await authorize(c, u, u.supplier_id);
      const { rows: batches } = await c.query(
        `SELECT b.*,s.name supplier FROM didar_intake_batch b JOIN didar_supplier s ON s.id=b.supplier_id WHERE $1='admin' OR b.supplier_id=$2 ORDER BY b.created_at DESC`,
        [u.role, u.supplier_id],
      );
      const batchId = req.query?.id;
      const batch = batchId ? await getBatch(c, u, text(batchId)) : null;
      const lines = batch ? await reconciliation(c, batch.id) : [];
      const items = batch
        ? (await listInventory(c, u)).filter(
            (i: any) => i.batch_id === batch.id,
          )
        : [];
      const {
        rows: [policy],
      } = await c.query(
        "SELECT * FROM didar_intake_policy ORDER BY id DESC LIMIT 1",
      );
      return {
        batches,
        batch,
        lines,
        items,
        permissions: await permissions(c, u),
        policy,
      };
    });
  return transaction(async (c) => {
    if (b.operation === "tolerance_policy") {
      admin(u);
      const tolerance = integer(b.tolerance_mg, "TOLERANCE", 0, 1000),
        reason = text(b.reason, 1000);
      await c.query(
        "INSERT INTO didar_intake_policy(tolerance_mg,reason,actor_id) VALUES($1,$2,$3)",
        [tolerance, reason, u.id],
      );
      await audit(c, u.id, "intake_tolerance_policy", {
        tolerance_mg: tolerance,
        reason,
      });
      return { ok: true };
    }
    if (b.operation === "create") {
      const supplier =
        u.role === "supplier" ? u.supplier_id : text(b.supplier_id);
      await authorize(c, u, supplier, "CREATE_OWN_INTAKE");
      const received = new Date(b.received_at || Date.now());
      if (!Number.isFinite(received.getTime()))
        throw new Error("INVALID_RECEIPT_TIME");
      const batch = id();
      await c.query(
        `INSERT INTO didar_intake_batch(id,supplier_id,invoice_number,tahesab_reference,received_at,operator_id,reference_purity,notes)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          batch,
          supplier,
          text(b.invoice_number, 150),
          optional(b.tahesab_reference, 150),
          received,
          u.id,
          integer(b.reference_purity ?? 750, "PURITY", 1, 1000),
          optional(b.notes),
        ],
      );
      await audit(c, u.id, "intake_created", {
        batch_id: batch,
        supplier_id: supplier,
        admin_override: u.role === "admin",
      });
      return { id: batch };
    }
    const batch = await getBatch(c, u, text(b.batch_id), true);
    if (b.operation === "verify" || b.operation === "post") {
      admin(u);
      if (b.operation === "post" && batch.status === "posted")
        return { id: batch.id, status: "posted" };
      if (b.operation === "verify" && batch.status === "verified")
        return { id: batch.id, status: "verified" };
      if (batch.status !== (b.operation === "verify" ? "draft" : "verified"))
        throw new Error("CONFLICT_BATCH_STATE");
      const lines = await reconciliation(c, batch.id);
      if (!lines.length) throw new Error("INVALID_EMPTY_BATCH");
      const {
        rows: [latestPolicy],
      } = await c.query(
        "SELECT * FROM didar_intake_policy ORDER BY id DESC LIMIT 1",
      );
      const policy =
        b.operation === "post"
          ? {
              id: batch.verification.policy_id,
              tolerance_mg: batch.verification.tolerance_mg,
            }
          : latestPolicy;
      const exceptionReason =
        b.operation === "post" ? batch.verification.reason : b.reason;
      const exception = lines.some((l: any) => l.weight_delta_mg !== 0);
      for (const l of lines) {
        if (
          l.quantity_delta !== 0 ||
          Math.abs(l.weight_delta_mg) > policy.tolerance_mg ||
          (l.weight_delta_mg !== 0 && !exceptionReason)
        )
          throw new Error("CONFLICT_RECONCILIATION");
        if (!l.product_id) throw new Error("INVALID_UNLINKED_PRODUCT");
        const {
          rows: [p],
        } = await c.query("SELECT * FROM didar_product WHERE id=$1 FOR SHARE", [
          l.product_id,
        ]);
        if (!p || p.purity !== l.purity)
          throw new Error("INVALID_PRODUCT_PURITY");
        const { rows: items } = await c.query(
          "SELECT * FROM didar_inventory_item WHERE line_id=$1 AND status<>'void' ORDER BY id FOR UPDATE",
          [l.id],
        );
        for (const item of items) {
          if (
            (p.min_weight_mg && item.weight_mg < p.min_weight_mg) ||
            (p.max_weight_mg && item.weight_mg > p.max_weight_mg)
          )
            throw new Error("INVALID_WEIGHT_RANGE");
          if (b.operation === "verify")
            await c.query(
              "UPDATE didar_inventory_item SET status='verified' WHERE id=$1",
              [item.id],
            );
          else {
            await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
              `physical-offer:${batch.supplier_id}:${p.id}:${item.weight_mg}`,
            ]);
            const {
              rows: [existing],
            } = await c.query(
              `SELECT id FROM didar_offer WHERE stock_mode='itemized' AND supplier_id=$1 AND product_id=$2 AND weight_mg=$3 AND making_mode=$4 AND making_bps=$5 AND making_weight_mg=$6 ORDER BY id LIMIT 1 FOR UPDATE`,
              [
                batch.supplier_id,
                p.id,
                item.weight_mg,
                l.making_mode,
                l.making_bps,
                l.making_weight_mg,
              ],
            );
            let offer = existing?.id;
            if (!offer) {
              offer = id();
              await c.query(
                `INSERT INTO didar_offer(id,product_id,supplier_id,weight_mg,quantity,labor_irr,margin_bps,stock_mode,making_mode,making_bps,making_weight_mg)
             VALUES($1,$2,$3,$4,0,0,0,'itemized',$5,$6,$7)`,
                [
                  offer,
                  p.id,
                  batch.supplier_id,
                  item.weight_mg,
                  l.making_mode,
                  l.making_bps,
                  l.making_weight_mg,
                ],
              );
            }
            await c.query(
              "UPDATE didar_inventory_item SET offer_id=$1,status='available' WHERE id=$2",
              [offer, item.id],
            );
          }
        }
      }
      await c.query(
        `UPDATE didar_intake_batch SET status=$1,version=version+1,verification=CASE WHEN $1='verified' THEN $2::jsonb ELSE verification END,
       verified_at=CASE WHEN $1='verified' THEN now() ELSE verified_at END,posted_at=CASE WHEN $1='posted' THEN now() ELSE posted_at END WHERE id=$3`,
        [
          b.operation === "verify" ? "verified" : "posted",
          JSON.stringify({
            lines,
            policy_id: policy.id,
            tolerance_mg: policy.tolerance_mg,
            exception,
            reason: exception ? text(exceptionReason, 1000) : "",
            actor_id: u.id,
          }),
          batch.id,
        ],
      );
      await audit(c, u.id, "intake_" + b.operation, {
        batch_id: batch.id,
        supplier_id: batch.supplier_id,
        exception,
        reason: exceptionReason || "",
        admin_override: true,
      });
      return {
        id: batch.id,
        status: b.operation === "verify" ? "verified" : "posted",
      };
    }
    if (batch.status !== "draft") throw new Error("CONFLICT_VERIFIED_BATCH");
    if (b.version !== undefined && b.version !== batch.version)
      throw new Error("CONFLICT_VERSION");
    if (b.operation === "header") {
      await c.query(
        "UPDATE didar_intake_batch SET invoice_number=$1,tahesab_reference=$2,notes=$3,version=version+1 WHERE id=$4",
        [
          text(b.invoice_number, 150),
          optional(b.tahesab_reference, 150),
          optional(b.notes),
          batch.id,
        ],
      );
    } else if (b.operation === "line") {
      const lineId = b.id ? text(b.id) : id();
      const {
        rows: [old],
      } = await c.query("SELECT * FROM didar_intake_line WHERE id=$1", [
        lineId,
      ]);
      if (b.id && (!old || old.batch_id !== batch.id))
        throw new Error("NOT_FOUND");
      if (old) {
        const { rowCount } = await c.query(
          "SELECT id FROM didar_inventory_item WHERE line_id=$1 AND status<>'void'",
          [old.id],
        );
        if (
          rowCount &&
          (old.product_id !== (b.product_id || null) || old.purity !== b.purity)
        )
          throw new Error("CONFLICT_ITEM_SOURCE");
      }
      const [mode, bps, mg] = making(b);
      const details = b.details ?? {};
      if (JSON.stringify(details).length > 10000)
        throw new Error("INVALID_DETAILS");
      await c.query(
        `INSERT INTO didar_intake_line(id,batch_id,product_id,description,quantity,total_weight_mg,purity,making_mode,making_bps,making_weight_mg,details)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(id) DO UPDATE SET product_id=EXCLUDED.product_id,description=EXCLUDED.description,quantity=EXCLUDED.quantity,total_weight_mg=EXCLUDED.total_weight_mg,purity=EXCLUDED.purity,making_mode=EXCLUDED.making_mode,making_bps=EXCLUDED.making_bps,making_weight_mg=EXCLUDED.making_weight_mg,details=EXCLUDED.details`,
        [
          lineId,
          batch.id,
          b.product_id ? text(b.product_id) : null,
          text(b.description, 1000),
          integer(b.quantity, "QUANTITY", 1, 10000),
          integer(b.total_weight_mg, "WEIGHT", 1, 100000000),
          integer(b.purity, "PURITY", 1, 1000),
          mode,
          bps,
          mg,
          JSON.stringify(details),
        ],
      );
      await c.query(
        "UPDATE didar_intake_batch SET version=version+1 WHERE id=$1",
        [batch.id],
      );
      await audit(c, u.id, "intake_line_saved", {
        batch_id: batch.id,
        line_id: lineId,
        supplier_id: batch.supplier_id,
        admin_override: u.role === "admin",
      });
      return { id: lineId };
    } else if (["item", "void_item"].includes(b.operation)) {
      const {
        rows: [line],
      } = await c.query(
        "SELECT * FROM didar_intake_line WHERE id=$1 AND batch_id=$2",
        [text(b.line_id), batch.id],
      );
      if (!line) throw new Error("NOT_FOUND");
      if (b.item_id) {
        const {
          rows: [item],
        } = await c.query(
          "SELECT * FROM didar_inventory_item WHERE id=$1 AND line_id=$2 FOR UPDATE",
          [text(b.item_id), line.id],
        );
        if (!item) throw new Error("NOT_FOUND");
        if (item.status !== "draft") throw new Error("CONFLICT_ITEM_STATE");
        await c.query(
          "UPDATE didar_inventory_item SET weight_mg=$1,status=$2 WHERE id=$3",
          [
            b.operation === "void_item"
              ? item.weight_mg
              : integer(b.weight_mg, "WEIGHT", 1, 1000000),
            b.operation === "void_item" ? "void" : "draft",
            item.id,
          ],
        );
      } else {
        if (b.operation === "void_item") throw new Error("INVALID_ITEM");
        const uid = b.uid ? normalizeUID(b.uid) : "DG-" + id().toUpperCase();
        await c.query(
          `INSERT INTO didar_inventory_item(id,uid,line_id,supplier_id,product_id,weight_mg,purity,owner_descriptor,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            id(),
            uid,
            line.id,
            batch.supplier_id,
            line.product_id,
            integer(b.weight_mg, "WEIGHT", 1, 1000000),
            line.purity,
            optional(b.owner_descriptor, 250) || batch.supplier,
            u.id,
          ],
        );
      }
      await c.query(
        "UPDATE didar_intake_batch SET version=version+1 WHERE id=$1",
        [batch.id],
      );
    } else throw new Error("INVALID_INTAKE_OPERATION");
    await audit(c, u.id, "intake_" + b.operation, {
      batch_id: batch.id,
      supplier_id: batch.supplier_id,
      item_id: b.item_id,
      weight_mg: b.weight_mg,
      admin_override: u.role === "admin",
    });
    return { ok: true };
  });
}
async function inventory(req: any, u: any) {
  if (req.method === "GET")
    return transaction(async (c) => ({
      items: await listInventory(c, u, req.query?.search),
      permissions: await permissions(c, u),
    }));
  const b = req.body || {};
  return transaction(async (c) => {
    const {
      rows: [read],
    } = await c.query("SELECT * FROM didar_inventory_item WHERE id=$1", [
      text(b.item_id),
    ]);
    if (!read) throw new Error("NOT_FOUND");
    await authorize(c, u, read.supplier_id, "EDIT_OWN_INVENTORY");
    if (read.offer_id)
      await c.query("SELECT id FROM didar_offer WHERE id=$1 FOR UPDATE", [
        read.offer_id,
      ]);
    const {
      rows: [item],
    } = await c.query(
      "SELECT * FROM didar_inventory_item WHERE id=$1 FOR UPDATE",
      [read.id],
    );
    if (
      !["available", "withdrawn"].includes(item.status) ||
      !["available", "withdrawn"].includes(b.status)
    )
      throw new Error("CONFLICT_ITEM_STATE");
    const reason = text(b.reason, 1000);
    await c.query("UPDATE didar_inventory_item SET status=$1 WHERE id=$2", [
      b.status,
      item.id,
    ]);
    await audit(c, u.id, "inventory_correction", {
      item_id: item.id,
      supplier_id: item.supplier_id,
      from: item.status,
      to: b.status,
      reason,
      admin_override: u.role === "admin",
    });
    return { ok: true };
  });
}
async function scanReport(c: any, session: any) {
  const { rows: expected } = await c.query(
    "SELECT * FROM didar_scan_expected WHERE session_id=$1 ORDER BY uid",
    [session.id],
  );
  const { rows: observations } = await c.query(
    "SELECT o.*,i.uid FROM didar_scan_observation o LEFT JOIN didar_inventory_item i ON i.id=o.item_id WHERE session_id=$1 ORDER BY created_at",
    [session.id],
  );
  const seen = new Set(
    observations
      .filter((o: any) => o.classification === "expected")
      .map((o: any) => o.item_id),
  );
  return {
    session,
    expected,
    observations,
    distinct_count: seen.size,
    missing: expected.filter((e: any) => !seen.has(e.item_id)),
    duplicate_reads:
      observations.reduce((n: number, o: any) => n + o.read_count, 0) -
      new Set(observations.map((o: any) => o.item_id || o.token)).size,
  };
}
async function rfid(req: any, u: any) {
  if (req.method === "GET")
    return transaction(async (c) => {
      if (u.role === "supplier") await authorize(c, u, u.supplier_id);
      const { rows: sessions } = await c.query(
        "SELECT * FROM didar_scan_session WHERE $1='admin' OR supplier_id=$2 ORDER BY created_at DESC",
        [u.role, u.supplier_id],
      );
      const session = req.query?.id
        ? sessions.find((s: any) => s.id === req.query.id)
        : null;
      if (req.query?.id && !session) throw new Error("NOT_FOUND");
      return { sessions, ...(session ? await scanReport(c, session) : {}) };
    });
  const b = req.body || {};
  return transaction(async (c) => {
    if (b.operation === "pair" || b.operation === "unpair") {
      const {
        rows: [item],
      } = await c.query(
        "SELECT * FROM didar_inventory_item WHERE id=$1 FOR UPDATE",
        [text(b.item_id)],
      );
      if (!item) throw new Error("NOT_FOUND");
      await authorize(c, u, item.supplier_id, "PAIR_OWN_RFID");
      if (
        !["draft", "verified", "available", "withdrawn", "returned"].includes(
          item.status,
        )
      )
        throw new Error("CONFLICT_ITEM_STATE");
      const reason = text(b.reason, 1000),
        raw = b.operation === "pair" ? text(b.epc, 250) : null,
        epc = raw ? normalizeEPC(raw) : null;
      await c.query(
        "UPDATE didar_item_rfid_binding SET active=false,ended_at=now() WHERE item_id=$1 AND active",
        [item.id],
      );
      if (epc)
        await c.query(
          "INSERT INTO didar_item_rfid_binding(id,item_id,epc,raw_value,actor_id,reason) VALUES($1,$2,$3,$4,$5,$6)",
          [id(), item.id, epc, raw, u.id, reason],
        );
      await audit(c, u.id, "rfid_" + b.operation, {
        item_id: item.id,
        uid: item.uid,
        epc,
        raw_value: raw,
        reason,
        supplier_id: item.supplier_id,
        admin_override: u.role === "admin",
      });
      return { ok: true };
    }
    admin(u);
    if (b.operation === "create_count") {
      const session = id(),
        supplier = b.supplier_id ? text(b.supplier_id) : null;
      await c.query(
        "INSERT INTO didar_scan_session(id,supplier_id,actor_id) VALUES($1,$2,$3)",
        [session, supplier, u.id],
      );
      await c.query(
        `INSERT INTO didar_scan_expected(session_id,item_id,uid,epc,weight_mg) SELECT $1,i.id,i.uid,r.epc,i.weight_mg FROM didar_inventory_item i LEFT JOIN didar_item_rfid_binding r ON r.item_id=i.id AND r.active WHERE i.status IN ('available','reserved') AND ($2::text IS NULL OR i.supplier_id=$2)`,
        [session, supplier],
      );
      await audit(c, u.id, "rfid_count_created", {
        session_id: session,
        supplier_id: supplier,
      });
      return { id: session };
    }
    const {
      rows: [session],
    } = await c.query(
      "SELECT * FROM didar_scan_session WHERE id=$1 FOR UPDATE",
      [text(b.session_id)],
    );
    if (!session) throw new Error("NOT_FOUND");
    if (session.status !== "open") throw new Error("CONFLICT_CLOSED_COUNT");
    if (b.operation === "close_count") {
      await c.query(
        "UPDATE didar_scan_session SET status='closed',closed_at=now() WHERE id=$1",
        [session.id],
      );
      session.status = "closed";
      await audit(c, u.id, "rfid_count_closed", { session_id: session.id });
      return scanReport(c, session);
    }
    if (b.operation !== "scan") throw new Error("INVALID_RFID_OPERATION");
    const raw = text(b.value, 250);
    let token = raw.trim().toUpperCase(),
      epc = "";
    try {
      epc = normalizeEPC(raw);
      token = epc;
    } catch {}
    const { rows: matches } = await c.query(
      `SELECT i.* FROM didar_inventory_item i LEFT JOIN didar_item_rfid_binding r ON r.item_id=i.id AND r.active WHERE i.uid=$1 OR r.epc=$2 ORDER BY i.id`,
      [raw.trim().toUpperCase(), epc],
    );
    if (matches.length > 1) throw new Error("CONFLICT_AMBIGUOUS_SCAN");
    const item = matches[0];
    const { rowCount: expected } = item
      ? await c.query(
          "SELECT item_id FROM didar_scan_expected WHERE session_id=$1 AND item_id=$2",
          [session.id, item.id],
        )
      : { rowCount: 0 };
    const classification = !item
      ? "unknown"
      : session.supplier_id && item.supplier_id !== session.supplier_id
        ? "out_of_scope"
        : item.status === "sold"
          ? "sold"
          : !["available", "reserved"].includes(item.status)
            ? "absent"
            : expected
              ? "expected"
              : "unexpected";
    await c.query(
      `INSERT INTO didar_scan_observation(id,session_id,token,raw_value,item_id,classification) VALUES($1,$2,$3,$4,$5,$6)
   ON CONFLICT(session_id,token) DO UPDATE SET read_count=didar_scan_observation.read_count+1,last_seen_at=now()`,
      [id(), session.id, token, raw, item?.id || null, classification],
    );
    return scanReport(c, session);
  });
}
async function returns(req: any, u: any) {
  const b = req.body || {};
  if (req.method === "GET")
    return transaction(async (c) => {
      if (u.role === "supplier") await authorize(c, u, u.supplier_id);
      const { rows } = await c.query(
        `SELECT ret.*,i.uid,i.weight_mg,i.supplier_id,i.id item_id,l.order_id FROM didar_item_return ret JOIN didar_item_reservation r ON r.id=ret.reservation_id JOIN didar_inventory_item i ON i.id=r.item_id JOIN didar_order_line l ON l.id=r.order_line_id JOIN didar_order o ON o.id=l.order_id WHERE $1='admin' OR ($1='supplier' AND i.supplier_id=$2) OR ($1='customer' AND o.customer_id=$3) ORDER BY ret.created_at DESC`,
        [u.role, u.supplier_id, u.id],
      );
      return { returns: rows };
    });
  return transaction(async (c) => {
    const {
      rows: [mapping],
    } = await c.query(
      `SELECT r.*,l.order_id,i.offer_id,i.supplier_id FROM didar_item_reservation r JOIN didar_order_line l ON l.id=r.order_line_id JOIN didar_inventory_item i ON i.id=r.item_id WHERE r.id=$1`,
      [text(b.reservation_id)],
    );
    if (!mapping) throw new Error("NOT_FOUND");
    const {
      rows: [order],
    } = await c.query("SELECT * FROM didar_order WHERE id=$1 FOR UPDATE", [
      mapping.order_id,
    ]);
    if (
      u.role === "supplier" ||
      (u.role === "customer" && order.customer_id !== u.id)
    )
      throw new Error("FORBIDDEN");
    await c.query("SELECT id FROM didar_offer WHERE id=$1 FOR UPDATE", [
      mapping.offer_id,
    ]);
    const {
      rows: [reservation],
    } = await c.query(
      "SELECT r.*,i.status item_status FROM didar_item_reservation r JOIN didar_inventory_item i ON i.id=r.item_id WHERE r.id=$1 FOR UPDATE OF r,i",
      [mapping.id],
    );
    const {
      rows: [old],
    } = await c.query(
      "SELECT * FROM didar_item_return WHERE reservation_id=$1 FOR UPDATE",
      [mapping.id],
    );
    const reason = text(b.reason, 1000);
    if (b.operation === "request") {
      if (old) return { return: old };
      if (
        reservation.status !== "sold" ||
        reservation.item_status !== "sold" ||
        order.status !== "paid"
      )
        throw new Error("CONFLICT_RETURN_STATE");
      const {
        rows: [created],
      } = await c.query(
        "INSERT INTO didar_item_return(id,reservation_id,reason,status,actor_id) VALUES($1,$2,$3,'requested',$4) RETURNING *",
        [id(), mapping.id, reason, u.id],
      );
      await audit(c, u.id, "item_return_requested", {
        reservation_id: mapping.id,
        reason,
      });
      return { return: created };
    }
    admin(u);
    if (!old) throw new Error("NOT_FOUND");
    if (
      (b.operation === "receive" && old.status === "received") ||
      (b.operation === "restock" && old.status === "restocked")
    )
      return { return: old };
    if (
      b.operation === "receive" &&
      old.status === "requested" &&
      reservation.status === "sold" &&
      reservation.item_status === "sold"
    ) {
      await c.query(
        "UPDATE didar_inventory_item SET status='returned' WHERE id=$1",
        [reservation.item_id],
      );
      await c.query(
        "UPDATE didar_item_reservation SET status='returned',updated_at=now() WHERE id=$1",
        [mapping.id],
      );
    } else if (
      b.operation === "restock" &&
      old.status === "received" &&
      reservation.status === "returned" &&
      reservation.item_status === "returned"
    ) {
      await c.query(
        "UPDATE didar_inventory_item SET status='available' WHERE id=$1",
        [reservation.item_id],
      );
    } else if (!(b.operation === "reject" && old.status === "requested"))
      throw new Error("CONFLICT_RETURN_STATE");
    const status =
      b.operation === "receive"
        ? "received"
        : b.operation === "restock"
          ? "restocked"
          : "rejected";
    await c.query(
      "UPDATE didar_item_return SET status=$1,updated_at=now() WHERE id=$2",
      [status, old.id],
    );
    await audit(c, u.id, "item_return_" + b.operation, {
      reservation_id: mapping.id,
      item_id: reservation.item_id,
      supplier_id: mapping.supplier_id,
      reason,
      admin_override: true,
      financial_refund: false,
    });
    return { ok: true };
  });
}
export async function performPhase1(action: string, req: any) {
  if (
    !["intake", "inventory", "rfid", "returns", "permissions"].includes(action)
  )
    return { handled: false };
  const u = await requireUser(
    req,
    action === "returns"
      ? ["admin", "supplier", "customer"]
      : ["admin", "supplier"],
  );
  if (action === "permissions") {
    if (req.method === "GET")
      return {
        handled: true,
        result: {
          permissions: await permissions(db, u),
          available: PERMISSIONS,
        },
      };
    admin(u);
    const b = req.body || {};
    if (!PERMISSIONS.includes(b.permission) || typeof b.granted !== "boolean")
      throw new Error("INVALID_PERMISSION");
    const result = await transaction(async (c) => {
      const { rowCount } = await c.query(
        "SELECT id FROM didar_supplier WHERE id=$1 FOR UPDATE",
        [text(b.supplier_id)],
      );
      if (!rowCount) throw new Error("NOT_FOUND");
      await c.query(
        "INSERT INTO didar_supplier_permission(supplier_id,permission,granted,actor_id) VALUES($1,$2,$3,$4) ON CONFLICT(supplier_id,permission) DO UPDATE SET granted=EXCLUDED.granted,actor_id=EXCLUDED.actor_id,updated_at=now()",
        [b.supplier_id, b.permission, b.granted, u.id],
      );
      await audit(c, u.id, "supplier_permission_changed", {
        supplier_id: b.supplier_id,
        permission: b.permission,
        granted: b.granted,
      });
      return { ok: true };
    });
    return { handled: true, result };
  }
  return {
    handled: true,
    result: await (action === "intake"
      ? intake(req, u)
      : action === "inventory"
        ? inventory(req, u)
        : action === "rfid"
          ? rfid(req, u)
          : returns(req, u)),
  };
}
