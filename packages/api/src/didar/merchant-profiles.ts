import { agencyQuote } from "./agency";
import { randomUUID, createHash } from "node:crypto";
import { transaction } from "./db";
import { integer, price, withPolicy } from "./pricing";
import { authorize, audit } from "./permissions";
const text = (v: any, max = 2000) => {
  if (
    typeof v !== "string" ||
    !v.trim() ||
    v.length > max ||
    /[\u0000-\u0008<>]/.test(v)
  )
    throw new Error("INVALID_PRICING_TEXT");
  return v.trim();
};
const code = (v: any, upper = false) => {
  const s = text(v, 80);
  if (!(upper ? /^[A-Z][A-Z0-9_]{1,59}$/ : /^[a-z][a-z0-9_]{1,79}$/).test(s))
    throw new Error("INVALID_PRICING_CODE");
  return s;
};
const bool = (v: any, f: boolean) => {
  if (v === undefined) return f;
  if (typeof v !== "boolean") throw new Error("INVALID_BOOLEAN");
  return v;
};
const time = (v: any) => {
  if (
    typeof v !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T/.test(v) ||
    !Number.isFinite(Date.parse(v))
  )
    throw new Error("INVALID_EFFECTIVE_DATE");
  return new Date(v).toISOString();
};
const hash = (v: any) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
export const pricingLock = (c: any, write = false) =>
  c.query(
    `SELECT pg_advisory_xact_lock${write ? "" : "_shared"}(hashtext('didar:merchant-pricing'))`,
  );
async function event(c: any, u: any, action: string, id: string, details: any) {
  await c.query(
    "INSERT INTO didar_merchant_pricing_event(actor_id,action,entity_id,details) VALUES($1,$2,$3,$4)",
    [u.id, action, id, JSON.stringify(details)],
  );
  await audit(c, u.id, action, { id, ...details });
}
function atomic(r: any) {
  if (
    !r ||
    !["PERCENT", "FIXED_IRR"].includes(r.mode) ||
    ![
      "GOLD_BASE_750_IRR",
      "MAKING_IRR",
      "GOLD_PLUS_MAKING_IRR",
      "FIXED_IRR",
    ].includes(r.basis)
  )
    throw new Error("INVALID_PROFILE_RULE");
  const value = integer(
    Number(r.value),
    "PROFILE_VALUE",
    0,
    r.mode === "PERCENT" ? 10000 : 1000000000000,
  );
  if ((r.mode === "FIXED_IRR") !== (r.basis === "FIXED_IRR"))
    throw new Error("INVALID_PROFILE_BASIS");
  return { mode: r.mode, basis: r.basis, value };
}
export function validateRules(input: any) {
  if (!Array.isArray(input) || input.length < 3 || input.length > 20)
    throw new Error("INVALID_PROFILE_COMPONENTS");
  const seen = new Set();
  const rules = input.map((r) => {
    const id = code(r.code);
    if (
      seen.has(id) ||
      !["distribution", "retail", "credit"].includes(r.component) ||
      !["CUSTOMER", "MERCHANT", "DIDAR"].includes(r.payer) ||
      !["DIDAR", "THIRD_PARTY"].includes(r.recipient) ||
      (r.payer === "DIDAR" && r.recipient === "DIDAR") ||
      !["ITEM", "ORDER"].includes(r.scope) ||
      ![
        "ALWAYS",
        "CREDIT_ONLY",
        "CASH_ONLY",
        "BY_PAYMENT_METHOD",
        "DISABLED",
      ].includes(r.application_mode)
    )
      throw new Error("INVALID_PROFILE_RULE");
    seen.add(id);
    const selected =
      r.application_mode === "BY_PAYMENT_METHOD"
        ? { cash_rule: atomic(r.cash_rule), credit_rule: atomic(r.credit_rule) }
        : atomic(r);
    if (
      r.scope === "ORDER" &&
      (r.application_mode === "BY_PAYMENT_METHOD"
        ? [r.cash_rule, r.credit_rule].some((v) => v.mode !== "FIXED_IRR")
        : r.mode !== "FIXED_IRR")
    )
      throw new Error("INVALID_ORDER_CHARGE");
    return {
      code: id,
      component: r.component,
      payer: r.payer,
      recipient: r.recipient,
      scope: r.scope,
      application_mode: r.application_mode,
      ...selected,
      ...(r.scope === "ORDER" ? { service_key: code(r.service_key) } : {}),
      label: text(r.label || id, 150),
    };
  });
  if (
    ["distribution", "retail", "credit"].some(
      (k) =>
        !rules.some(
          (r) => r.code === k && r.component === k && r.scope === "ITEM",
        ),
    )
  )
    throw new Error("INVALID_PROFILE_COMPONENTS");
  return rules;
}
export async function effectiveProfile(c: any, supplier: string, at?: string) {
  const {
    rows: [s],
  } = await c.query(
    "SELECT s.commercial_type,s.pricing_revision,t.active FROM didar_supplier s JOIN didar_merchant_type t ON t.code=s.commercial_type WHERE s.id=$1",
    [supplier],
  );
  if (!s) throw new Error("NOT_FOUND");
  if (s.commercial_type === "LEGACY_UNCLASSIFIED") return null;
  if (!s.active) throw new Error("CONFLICT_MERCHANT_TYPE_INACTIVE");
  const { rows } = await c.query(
    `SELECT a.id assignment_id,a.effective_from,a.effective_to,pv.*,p.code,p.name,p.active FROM didar_merchant_assignment a JOIN didar_merchant_profile_version pv ON pv.id=a.profile_version_id JOIN didar_merchant_profile p ON p.id=pv.profile_id WHERE a.supplier_id=$1 AND NOT a.cancelled AND a.effective_from<=$2::timestamptz AND (a.effective_to IS NULL OR a.effective_to>$2::timestamptz)`,
    [supplier, at || new Date().toISOString()],
  );
  if (
    rows.length !== 1 ||
    !rows[0].active ||
    rows[0].status !== "approved" ||
    !rows[0].merchant_types.includes(s.commercial_type)
  )
    throw new Error("CONFLICT_MERCHANT_PROFILE_REQUIRED");
  const v = rows[0];
  const {
    rows: [tax],
  } = await c.query(
    "SELECT tv.*,tp.active,tp.code,tp.name FROM didar_merchant_tax_version tv JOIN didar_merchant_tax_policy tp ON tp.id=tv.policy_id WHERE tv.id=$1",
    [v.tax_version_id],
  );
  if (!tax?.active || tax.status !== "approved")
    throw new Error("CONFLICT_TAX_POLICY_INACTIVE");
  const { rows: rules } = await c.query(
    "SELECT code,component,rule FROM didar_merchant_profile_rule WHERE version_id=$1 ORDER BY code",
    [v.id],
  );
  return {
    id: v.profile_id,
    version_id: v.id,
    version: v.number,
    code: v.code,
    name: v.name,
    merchant_type: s.commercial_type,
    supplier_id: supplier,
    pricing_revision: s.pricing_revision,
    assignment_id: v.assignment_id,
    effective_from: v.effective_from,
    effective_to: v.effective_to,
    rounding_step: v.rounding_step,
    making_source: "OFFER",
    tax: {
      id: tax.id,
      policy_id: tax.policy_id,
      version: tax.number,
      code: tax.code,
      bps: tax.bps,
      taxable_components: tax.taxable_components,
    },
    rules: rules.map((r: any) => ({
      ...r.rule,
      code: r.code,
      component: r.component,
    })),
  };
}
export async function quoteOffer(
  c: any,
  rate: any,
  offer: any,
  method = "CASH",
  at?: string,
) {
  const merchant_profile = await effectiveProfile(c, offer.supplier_id, at);
  return agencyQuote(c, offer, quoteWithProfile(rate, offer, method, merchant_profile), rate);
}
export function quoteWithProfile(
  rate: any,
  offer: any,
  method: string,
  merchant_profile: any,
) {
  const p = price({
    ...rate,
    ...offer,
    rate_irr: Number(rate.rate_irr),
    fee_irr: Number(rate.fee_irr || 0),
    merchant_profile,
    payment_method: method,
  });
  return {
    ...p,
    quote_key: hash({
      rate_id: rate.version,
      rate: rate.rate_irr,
      offer: offer.id,
      version: offer.version,
      method,
      price: p,
    }),
  };
}
export function publicPrice(input: any, role = "customer") {
  if (!input?.merchant_profile) return input;
  const p = JSON.parse(JSON.stringify(input));
  const visible = (r: any) =>
    role === "admin" ||
    r.payer === "CUSTOMER" ||
    (role === "supplier" && r.payer === "MERCHANT");
  p.profile_charges = p.profile_charges?.filter(visible);
  p.order_rules = p.order_rules?.filter(visible);
  p.order_allocations = p.order_allocations?.map((a: any) => a.filter(visible));
  p.merchant_profile.rules = p.merchant_profile.rules.filter(visible);
  return p;
}
export function cartPrice(lines: any[], method: string) {
  const services = new Map<string, any>();
  for (const l of lines) {
    l.breakdown.order_allocations = Array.from(
      { length: l.quantity },
      () => [],
    );
    for (const rule of l.breakdown.order_rules || []) {
      if (!rule.applied || !rule.amount_irr) continue;
      const key = rule.service_key;
      const signature = hash({
        component: rule.component,
        payer: rule.payer,
        recipient: rule.recipient,
        amount: rule.amount_irr,
        tax: rule.payer === "CUSTOMER" ? rule.tax_bps : 0,
        applied_rule: {
          mode: rule.applied_rule.mode,
          basis: rule.applied_rule.basis,
          value: rule.applied_rule.value,
        },
      });
      const existing = services.get(key);
      if (existing && existing.signature !== signature)
        throw new Error("CONFLICT_SHARED_CHARGE");
      if (!existing)
        services.set(key, {
          ...rule,
          signature,
          eligible: new Set<string>(),
          tax_irr:
            rule.payer === "CUSTOMER"
              ? Number(
                  (BigInt(rule.amount_irr) * BigInt(rule.tax_bps) + 9999n) /
                    10000n,
                )
              : 0,
        });
      services.get(key).eligible.add(l.id);
    }
  }
  const order_charges: any[] = [];
  for (const s of services.values()) {
    const eligible = lines
      .filter((l) => s.eligible.has(l.id))
      .flatMap((l) =>
        Array.from({ length: l.quantity }, (_, index) => ({ l, index })),
      );
    const n = BigInt(eligible.length);
    for (const [i, slot] of eligible.entries()) {
      const share = (v: number) =>
        Number(BigInt(v) / n + (BigInt(i) < BigInt(v) % n ? 1n : 0n));
      slot.l.breakdown.order_allocations[slot.index].push({
        ...s,
        eligible: undefined,
        signature: undefined,
        amount_irr: share(s.amount_irr),
        tax_irr: share(s.tax_irr),
      });
    }
    const { eligible: _, signature: __, ...charge } = s;
    order_charges.push(charge);
  }
  const subtotal = lines.reduce(
      (sum, l) => sum + BigInt(l.breakdown.total_irr) * BigInt(l.quantity),
      0n,
    ),
    extra = order_charges
      .filter((r) => r.payer === "CUSTOMER")
      .reduce((s, r) => s + BigInt(r.amount_irr) + BigInt(r.tax_irr), 0n);
  const total = integer(
    Number(subtotal + extra),
    "TOTAL",
    1,
    Number.MAX_SAFE_INTEGER,
  );
  const quote_key = hash({
    method,
    lines: lines.map((l) => ({
      id: l.id,
      quantity: l.quantity,
      key: l.breakdown.quote_key,
    })),
    order_charges,
  });
  return {
    payment_method: method,
    total_irr: total,
    subtotal_irr: Number(subtotal),
    order_charges,
    quote_key,
  };
}
export function recognizedProfilePrice(
  p: any,
  index: number | null,
  quantity: number,
) {
  if (!p.merchant_profile)
    return { price: p, total: BigInt(p.total_irr) * BigInt(quantity) };
  const allocated =
    index === null
      ? (p.order_allocations || []).flat()
      : p.order_allocations?.[index] || [];
  const q = BigInt(quantity);
  const charges = [
    ...(p.profile_charges || []).map((r: any) => ({
      ...r,
      amount_irr: (BigInt(r.amount_irr) * q).toString(),
    })),
    ...allocated,
  ];
  const customer = allocated.filter((r: any) => r.payer === "CUSTOMER"),
    extra = customer.reduce(
      (s: bigint, r: any) => s + BigInt(r.amount_irr) + BigInt(r.tax_irr),
      0n,
    );
  return {
    price: {
      ...p,
      recognized_charges: charges,
      recognized_vat_irr: (
        BigInt(p.tax_irr) * q +
        customer.reduce((s: bigint, r: any) => s + BigInt(r.tax_irr), 0n)
      ).toString(),
      charged_total_irr: (BigInt(p.total_irr) * q + extra).toString(),
    },
    total: BigInt(p.total_irr) * q + extra,
  };
}
export async function merchantPricingRead(u: any) {
  return transaction(async (c) => {
    await pricingLock(c);
    if (u.role === "supplier") await authorize(c, u, u.supplier_id);
    const { rows: suppliers } = await c.query(
      "SELECT id,name,commercial_type,pricing_revision FROM didar_supplier WHERE $1='admin' OR id=$2 ORDER BY name",
      [u.role, u.supplier_id],
    );
    const { rows: assignments } = await c.query(
      "SELECT * FROM didar_merchant_assignment WHERE $1='admin' OR supplier_id=$2 ORDER BY effective_from DESC",
      [u.role, u.supplier_id],
    );
    const ids = assignments.map((a: any) => a.profile_version_id);
    const { rows: versions } = await c.query(
      "SELECT * FROM didar_merchant_profile_version WHERE $1='admin' OR id=ANY($2::text[]) ORDER BY created_at DESC",
      [u.role, ids],
    );
    const { rows: profiles } = await c.query(
      "SELECT * FROM didar_merchant_profile WHERE $1='admin' OR id=ANY($2::text[]) ORDER BY name",
      [u.role, versions.map((v: any) => v.profile_id)],
    );
    const { rows: types } = await c.query(
      "SELECT * FROM didar_merchant_type ORDER BY code",
    );
    const { rows: rules } = await c.query(
      "SELECT * FROM didar_merchant_profile_rule WHERE $1='admin' OR (version_id=ANY($2::text[]) AND rule->>'payer'<>'DIDAR') ORDER BY code",
      [u.role, ids],
    );
    const { rows: tax_versions } = await c.query(
      "SELECT * FROM didar_merchant_tax_version WHERE $1='admin' OR id=ANY($2::text[]) ORDER BY created_at DESC",
      [u.role, versions.map((v: any) => v.tax_version_id)],
    );
    const { rows: tax_policies } = await c.query(
      "SELECT * FROM didar_merchant_tax_policy WHERE $1='admin' OR id=ANY($2::text[])",
      [u.role, tax_versions.map((v: any) => v.policy_id)],
    );
    const { rows: offers } = await c.query(
      "SELECT o.id,o.product_id,o.supplier_id,o.weight_mg,p.title FROM didar_offer o JOIN didar_product p ON p.id=o.product_id WHERE $1='admin' OR o.supplier_id=$2 ORDER BY p.title,o.id",
      [u.role, u.supplier_id],
    );
    const events =
      u.role === "admin"
        ? (
            await c.query(
              "SELECT * FROM didar_merchant_pricing_event ORDER BY id DESC LIMIT 100",
            )
          ).rows
        : [];
    return {
      suppliers,
      types,
      profiles,
      versions,
      rules,
      assignments,
      tax_policies,
      tax_versions,
      offers,
      events,
    };
  });
}
export async function merchantPricingWrite(u: any, b: any) {
  if (b.operation === "preview")
    return transaction(async (c) => {
      await pricingLock(c);
      const {
        rows: [o],
      } = await c.query(
        "SELECT o.*,p.purity FROM didar_offer o JOIN didar_product p ON p.id=o.product_id WHERE o.id=$1",
        [text(b.offer_id, 120)],
      );
      if (!o) throw new Error("NOT_FOUND");
      if (u.role === "supplier") await authorize(c, u, o.supplier_id);
      const rate = await withPolicy(
        c,
        (await c.query("SELECT * FROM didar_rate WHERE id=1")).rows[0],
      );
      const method = b.payment_method || "CASH";
      if (!["CASH", "CREDIT"].includes(method))
        throw new Error("INVALID_PAYMENT_METHOD");
      const at = b.at ? time(b.at) : undefined;
      return {
        price: publicPrice(await quoteOffer(c, rate, o, method, at), u.role),
        rate: rate.rate_irr,
      };
    });
  if (u.role !== "admin") throw new Error("FORBIDDEN");
  return transaction(async (c) => {
    await pricingLock(c, true);
    const op = b.operation;
    const reason = text(b.reason);
    if (reason.length < 5) throw new Error("INVALID_PRICING_REASON");
    if (op === "type_save") {
      const id = code(b.code, true),
        old = (
          await c.query(
            "SELECT * FROM didar_merchant_type WHERE code=$1 FOR UPDATE",
            [id],
          )
        ).rows[0];
      if (old && old.version !== b.version) throw new Error("CONFLICT_VERSION");
      await c.query(
        "INSERT INTO didar_merchant_type(code,name,active,recommended_profile_id) VALUES($1,$2,$3,$4) ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name,active=EXCLUDED.active,recommended_profile_id=EXCLUDED.recommended_profile_id,version=didar_merchant_type.version+1",
        [
          id,
          text(b.name, 150),
          bool(b.active, old?.active ?? true),
          b.recommended_profile_id || null,
        ],
      );
      await event(c, u, op, id, { before: old || null, ...b });
      return { code: id };
    }
    if (op === "classify") {
      const id = text(b.supplier_id, 120),
        type = code(b.commercial_type, true);
      const old = (
        await c.query(
          "SELECT id,commercial_type,pricing_revision FROM didar_supplier WHERE id=$1 FOR UPDATE",
          [id],
        )
      ).rows[0];
      if (!old) throw new Error("NOT_FOUND");
      if (old.pricing_revision !== b.revision)
        throw new Error("CONFLICT_VERSION");
      if (
        !(
          await c.query(
            "SELECT 1 FROM didar_merchant_type WHERE code=$1 AND active",
            [type],
          )
        ).rowCount
      )
        throw new Error("INVALID_MERCHANT_TYPE");
      await c.query(
        "UPDATE didar_supplier SET commercial_type=$1,pricing_revision=pricing_revision+1 WHERE id=$2",
        [type, id],
      );
      await event(c, u, op, id, { before: old, commercial_type: type, reason });
      return { id };
    }
    if (op === "profile_save" || op === "tax_policy_save") {
      const table =
          op === "profile_save"
            ? "didar_merchant_profile"
            : "didar_merchant_tax_policy",
        id = b.id ? text(b.id, 120) : randomUUID(),
        old = (
          await c.query(`SELECT * FROM ${table} WHERE id=$1 FOR UPDATE`, [id])
        ).rows[0];
      if (b.id && !old) throw new Error("NOT_FOUND");
      if (old && b.revision !== old.revision)
        throw new Error("CONFLICT_VERSION");
      const key = code(b.code);
      if (old && old.code !== key) throw new Error("INVALID_PRICING_IDENTITY");
      if (op === "profile_save") {
        if (
          !Array.isArray(b.merchant_types) ||
          !b.merchant_types.length ||
          b.merchant_types.length > 30
        )
          throw new Error("INVALID_MERCHANT_TYPE");
        await c.query(
          `INSERT INTO didar_merchant_profile(id,code,name,description,merchant_types,active) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,merchant_types=EXCLUDED.merchant_types,active=EXCLUDED.active,revision=didar_merchant_profile.revision+1`,
          [
            id,
            key,
            text(b.name, 150),
            b.description ? text(b.description) : "",
            b.merchant_types.map((x: any) => code(x, true)),
            bool(b.active, old?.active ?? true),
          ],
        );
      } else
        await c.query(
          "INSERT INTO didar_merchant_tax_policy(id,code,name,active) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,active=EXCLUDED.active,revision=didar_merchant_tax_policy.revision+1",
          [id, key, text(b.name, 150), bool(b.active, old?.active ?? true)],
        );
      await event(c, u, op, id, { before: old || null, after: b });
      return { id };
    }
    if (op === "tax_draft" || op === "version_draft") {
      const profile = op === "version_draft",
        parent = text(profile ? b.profile_id : b.policy_id, 120),
        table = profile
          ? "didar_merchant_profile"
          : "didar_merchant_tax_policy";
      const old = (
        await c.query(`SELECT * FROM ${table} WHERE id=$1 FOR UPDATE`, [parent])
      ).rows[0];
      if (!old) throw new Error("NOT_FOUND");
      const id = randomUUID(),
        versionTable = profile
          ? "didar_merchant_profile_version"
          : "didar_merchant_tax_version",
        fk = profile ? "profile_id" : "policy_id";
      const n = (
        await c.query(
          `SELECT coalesce(max(number),0)+1 n FROM ${versionTable} WHERE ${fk}=$1`,
          [parent],
        )
      ).rows[0].n;
      if (profile) {
        const rules = validateRules(b.rules);
        await c.query(
          "INSERT INTO didar_merchant_profile_version(id,profile_id,number,merchant_types,tax_version_id,rounding_step,actor_id,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
          [
            id,
            parent,
            n,
            old.merchant_types,
            text(b.tax_version_id, 120),
            integer(b.rounding_step ?? 1, "ROUNDING", 1, 1000000),
            u.id,
            reason,
          ],
        );
        for (const r of rules)
          await c.query(
            "INSERT INTO didar_merchant_profile_rule(version_id,code,component,rule) VALUES($1,$2,$3,$4)",
            [id, r.code, r.component, JSON.stringify(r)],
          );
      } else {
        if (
          !Array.isArray(b.taxable_components) ||
          b.taxable_components.some(
            (v: any) =>
              !["gold", "making", "distribution", "retail", "credit"].includes(
                v,
              ),
          )
        )
          throw new Error("INVALID_TAX_COMPONENTS");
        await c.query(
          "INSERT INTO didar_merchant_tax_version(id,policy_id,number,bps,taxable_components,actor_id,reason) VALUES($1,$2,$3,$4,$5,$6,$7)",
          [
            id,
            parent,
            n,
            integer(b.bps, "VAT", 0, 10000),
            [...new Set(b.taxable_components)],
            u.id,
            reason,
          ],
        );
      }
      await event(c, u, op, id, { parent, number: n, ...b });
      return { id, number: n };
    }
    if (op === "version_review" || op === "tax_review") {
      const table =
          op === "version_review"
            ? "didar_merchant_profile_version"
            : "didar_merchant_tax_version",
        id = text(b.id, 120);
      const old = (
        await c.query(`SELECT * FROM ${table} WHERE id=$1 FOR UPDATE`, [id])
      ).rows[0];
      if (!old) throw new Error("NOT_FOUND");
      if (old.status !== "draft")
        throw new Error("CONFLICT_IMMUTABLE_PRICING_VERSION");
      if (typeof b.approved !== "boolean") throw new Error("INVALID_APPROVAL");
      await c.query(
        `UPDATE ${table} SET status=$1,reviewed_by=$2,reviewed_at=now() WHERE id=$3`,
        [b.approved ? "approved" : "rejected", u.id, id],
      );
      await event(c, u, op, id, { before: old, approved: b.approved, reason });
      return { id };
    }
    if (
      op === "assign" ||
      op === "switch" ||
      op === "assignment_end" ||
      op === "assignment_cancel"
    ) {
      const at = b.effective_from
        ? time(b.effective_from)
        : (await c.query("SELECT clock_timestamp() at")).rows[0].at;
      if (op === "assignment_end" || op === "assignment_cancel") {
        const id = text(b.id, 120),
          old = (
            await c.query(
              "SELECT * FROM didar_merchant_assignment WHERE id=$1 FOR UPDATE",
              [id],
            )
          ).rows[0];
        if (!old) throw new Error("NOT_FOUND");
        if (op === "assignment_cancel")
          await c.query(
            "UPDATE didar_merchant_assignment SET cancelled=true WHERE id=$1",
            [id],
          );
        else
          await c.query(
            "UPDATE didar_merchant_assignment SET effective_to=$1 WHERE id=$2",
            [b.effective_to ? time(b.effective_to) : at, id],
          );
        await event(c, u, op, id, {
          before: old,
          reason,
          effective_to: b.effective_to || at,
        });
        return { id };
      }
      const supplier = text(b.supplier_id, 120),
        versionId = text(b.profile_version_id, 120);
      if (op === "switch") {
        const previous = (
          await c.query(
            "SELECT * FROM didar_merchant_assignment WHERE supplier_id=$1 AND NOT cancelled AND effective_from<$2 AND (effective_to IS NULL OR effective_to>$2) FOR UPDATE",
            [supplier, at],
          )
        ).rows;
        for (const old of previous) {
          await c.query(
            "UPDATE didar_merchant_assignment SET effective_to=$1 WHERE id=$2",
            [at, old.id],
          );
          await event(c, u, "assignment_closed", old.id, {
            before: old,
            effective_to: at,
            reason,
          });
        }
      }
      const id = randomUUID();
      await c.query(
        "INSERT INTO didar_merchant_assignment(id,supplier_id,profile_version_id,effective_from,effective_to,actor_id,reason) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [
          id,
          supplier,
          versionId,
          at,
          b.effective_to ? time(b.effective_to) : null,
          u.id,
          reason,
        ],
      );
      await event(c, u, op, id, {
        supplier,
        profile_version_id: versionId,
        effective_from: at,
        effective_to: b.effective_to,
        reason,
      });
      return { id };
    }
    throw new Error("INVALID_OPERATION");
  });
}

export function publicOrder(o: any) {
  return o
    ? {
        ...o,
        pricing_snapshot: o.pricing_snapshot
          ? {
              ...o.pricing_snapshot,
              order_charges: o.pricing_snapshot.order_charges?.filter(
                (r: any) => r.payer === "CUSTOMER",
              ),
            }
          : o.pricing_snapshot,
      }
    : o;
}
