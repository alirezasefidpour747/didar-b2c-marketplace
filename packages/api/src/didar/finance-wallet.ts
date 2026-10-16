import { transaction } from "./db";
import { requireUser } from "./auth";
import { appendEvent, big, finText, finLock, localFinance } from "./finance";
import { obligationBalance } from "./finance-procurement";
export const ownParty = (u: any) =>
  u.role === "supplier" ? "supplier:" + u.supplier_id : "customer:" + u.id;
async function validParty(c: any, party: string) {
  const [type, id, ...rest] = party.split(":");
  if (rest.length || !id || !["supplier", "customer"].includes(type))
    throw new Error("INVALID_WALLET_PARTY");
  const { rowCount } = await c.query(
    type === "supplier"
      ? "SELECT id FROM didar_supplier WHERE id=$1"
      : "SELECT id FROM didar_user WHERE id=$1 AND role='customer'",
    [id],
  );
  if (!rowCount) throw new Error("NOT_FOUND");
}
export async function walletBalances(c: any, party: string) {
  const { rows } = await c.query(
    "SELECT account,instrument,(-sum(delta))::text balance FROM didar_fin_posting WHERE party=$1 AND account IN ('WALLET_AVAILABLE','WALLET_RESERVED','WALLET_PENDING','WALLET_PLEDGED') GROUP BY account,instrument ORDER BY account,instrument",
    [party],
  );
  return rows;
}
export async function walletRead(c: any, u: any) {
  const party = ownParty(u);
  const balances =
    u.role === "admin"
      ? (
          await c.query(
            "SELECT party,account,instrument,(-sum(delta))::text balance FROM didar_fin_posting WHERE account IN ('WALLET_AVAILABLE','WALLET_RESERVED','WALLET_PENDING','WALLET_PLEDGED') GROUP BY party,account,instrument ORDER BY party,account,instrument",
          )
        ).rows
      : await walletBalances(c, party);
  const events = (
    await c.query(
      `SELECT id,kind,created_at,snapshot-'command' snapshot FROM didar_fin_event WHERE (kind LIKE 'WALLET_%' OR kind='PAYABLE_TO_WALLET') AND ($1='admin' OR snapshot->>'party'=$2 OR snapshot->>'to_party'=$2) ORDER BY created_at DESC,id LIMIT 500`,
      [u.role, party],
    )
  ).rows;
  const parties =
    u.role === "admin"
      ? (
          await c.query(
            "SELECT 'supplier:'||id id,name FROM didar_supplier UNION ALL SELECT 'customer:'||id id,name FROM didar_user WHERE role='customer' ORDER BY name LIMIT 500",
          )
        ).rows
      : [{ id: party, name: u.name }];
  return {
    party,
    balances,
    events,
    parties,
    withdrawals: "DISABLED",
    mode: "SANDBOX_MANUAL",
  };
}
export async function walletWrite(c: any, u: any, b: any) {
  localFinance();
  await finLock(c);
  const allowed = [
    "fund",
    "release",
    "reserve",
    "unreserve",
    "pledge",
    "unpledge",
    "transfer",
    "payable_to_wallet",
  ];
  if (!allowed.includes(b.operation)) throw new Error("FORBIDDEN");
  if (
    ["fund", "release", "payable_to_wallet"].includes(b.operation) &&
    u.role !== "admin"
  )
    throw new Error("FORBIDDEN");
  const instrument = finText(b.instrument);
  if (!["IRR", "GOLD_UG"].includes(instrument))
    throw new Error("INVALID_INSTRUMENT");
  const amount = big(b.amount, true),
    reason = finText(b.reason, 1000),
    key = finText(b.idempotency_key, 100),
    intent = "wallet:" + u.id + ":" + key;
  const {
    rows: [old],
  } = await c.query(
    "SELECT e.*,cmd.payload=$2::jsonb same FROM didar_fin_command cmd JOIN didar_fin_event e ON e.id=cmd.event_id WHERE cmd.key=$1",
    [intent, JSON.stringify(b)],
  );
  if (old) {
    if (!old.same) throw new Error("CONFLICT_IDEMPOTENCY");
    return { event: old };
  }
  if (u.role !== "admin" && b.party && b.party !== ownParty(u))
    throw new Error("FORBIDDEN");
  let party = u.role === "admin" ? finText(b.party) : ownParty(u),
    source: any = null,
    gold = 0n,
    irr = 0n;
  if (b.operation === "payable_to_wallet") {
    source = (
      await c.query(
        "SELECT * FROM didar_fin_event WHERE id=$1 AND kind='SALE_EXPOSURE'",
        [finText(b.sale_id)],
      )
    ).rows[0];
    if (!source) throw new Error("NOT_FOUND");
    party = "supplier:" + source.supplier_id;
    const balance = await obligationBalance(c, source);
    if (amount > BigInt(instrument === "IRR" ? balance.irr : balance.gold_ug))
      throw new Error("CONFLICT_OVER_SETTLEMENT");
    if (instrument === "IRR") irr = -amount;
    else gold = -amount;
  }
  await validParty(c, party);
  const accounts: Record<string, string> = {
    release: "WALLET_PENDING",
    reserve: "WALLET_AVAILABLE",
    unreserve: "WALLET_RESERVED",
    pledge: "WALLET_AVAILABLE",
    unpledge: "WALLET_PLEDGED",
    transfer: "WALLET_AVAILABLE",
  };
  const balances = await walletBalances(c, party);
  if (
    accounts[b.operation] &&
    amount >
      BigInt(
        balances.find(
          (r: any) =>
            r.account === accounts[b.operation] && r.instrument === instrument,
        )?.balance || 0,
      )
  )
    throw new Error("CONFLICT_WALLET_OVERDRAFT");
  const snapshot: any = {
    party,
    instrument,
    amount: amount.toString(),
    reason,
    synthetic: true,
    bank_execution: false,
  };
  if (b.operation === "fund") {
    snapshot.document = finText(b.document);
    if (instrument === "GOLD_UG")
      snapshot.valuation_irr = big(b.valuation_irr, true).toString();
  }
  if (b.operation === "transfer") {
    const target = finText(b.to_party);
    await validParty(c, target);
    if (target === party) throw new Error("INVALID_SELF_TRANSFER");
    snapshot.to_party = target;
    if (instrument === "GOLD_UG") {
      const qty = balances
        .filter((r: any) => r.instrument === "GOLD_UG")
        .reduce((n: bigint, r: any) => n + BigInt(r.balance), 0n);
      const valuation = BigInt(
        (
          await c.query(
            "SELECT COALESCE(-sum(delta),0)::text n FROM didar_fin_posting WHERE party=$1 AND account='WALLET_GOLD_VALUATION' AND instrument='IRR'",
            [party],
          )
        ).rows[0].n,
      );
      snapshot.valuation_irr = ((valuation * amount) / qty).toString();
    }
  }
  const kinds: Record<string, string> = {
    fund: "WALLET_FUND",
    release: "WALLET_RELEASE",
    reserve: "WALLET_RESERVE",
    unreserve: "WALLET_UNRESERVE",
    pledge: "WALLET_PLEDGE",
    unpledge: "WALLET_UNPLEDGE",
    transfer: "WALLET_TRANSFER",
    payable_to_wallet: "PAYABLE_TO_WALLET",
  };
  const [type, id] = party.split(":");
  const event = await appendEvent(c, {
    intent,
    kind: kinds[b.operation],
    supplier_id: type === "supplier" ? id : null,
    customer_id: type === "customer" ? id : null,
    source_event_id: source?.id,
    order_line_id: source?.order_line_id,
    reservation_id: source?.reservation_id,
    gold_ug: gold,
    irr,
    snapshot,
    actor_id: u.id,
  });
  await c.query(
    "INSERT INTO didar_fin_command(key,event_id,payload) VALUES($1,$2,$3)",
    [intent, event.id, JSON.stringify(b)],
  );
  return { event };
}
export async function performWallet(action: string, req: any) {
  if (action !== "wallet") return { handled: false };
  const u = await requireUser(req, ["admin", "supplier", "customer"]);
  if (
    u.role === "supplier" &&
    (!u.supplier_active || u.supplier_status !== "approved")
  )
    throw new Error("FORBIDDEN");
  const result =
    req.method === "GET"
      ? await transaction((c) => walletRead(c, u))
      : await transaction((c) => walletWrite(c, u, req.body || {}));
  return { handled: true, result };
}
