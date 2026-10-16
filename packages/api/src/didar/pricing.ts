/** All persisted money is IRR; all weights are integer milligrams. No floats. */
export function integer(
  value: unknown,
  name: string,
  min = 0,
  max = 1_000_000_000_000,
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < min ||
    value > max
  )
    throw new Error(`INVALID_${name}`);
  return value;
}
const ceil = (n: bigint, d: bigint) => (n + d - 1n) / d;
/** Gold-first: all margins use the same 750-equivalent base, never compounded.
 * Legacy fixed-IRR making charges remain explicit; no gold weight is invented. */
export function price(input: any) {
  const profile = input.merchant_profile;
  const payment_method = input.payment_method ?? "CASH";
  if (!["CASH", "CREDIT"].includes(payment_method))
    throw new Error("INVALID_PAYMENT_METHOD");
  const weight = BigInt(integer(input.weight_mg, "WEIGHT", 1, 1_000_000));
  const purity = BigInt(integer(input.purity, "PURITY", 1, 1000));
  const rate = BigInt(integer(Number(input.rate_irr), "RATE", 1));
  const labor = BigInt(integer(Number(input.labor_irr ?? 0), "LABOR"));
  const lb = BigInt(integer(input.labor_bps ?? 0, "LABOR_PERCENT", 0, 10000));
  if (input.labor_mode && !["fixed", "percent"].includes(input.labor_mode))
    throw new Error("INVALID_LABOR_MODE");
  if (
    input.making_mode &&
    !["percent", "fixed_gold"].includes(input.making_mode)
  )
    throw new Error("INVALID_MAKING_MODE");
  const mb = BigInt(integer(input.making_bps ?? 0, "MAKING", 0, 10000));
  const mw = BigInt(
    integer(input.making_weight_mg ?? 0, "MAKING_WEIGHT", 0, 1000000),
  );
  const distribution = BigInt(
    integer(
      profile ? 0 : (input.distribution_bps ?? 0),
      "DISTRIBUTION",
      0,
      10000,
    ),
  );
  const retail = BigInt(
    integer(
      profile
        ? 0
        : (input.retail_bps ??
            input.margin_bps ??
            input.default_margin_bps ??
            700),
      "RETAIL",
      0,
      10000,
    ),
  );
  const vat = BigInt(
    integer(
      profile ? profile.tax.bps : (input.vat_bps ?? input.tax_bps ?? 0),
      "VAT",
      0,
      10000,
    ),
  );
  const fee = BigInt(
    integer(Number(profile ? 0 : (input.fee_irr ?? 0)), "FEE"),
  );
  const step = BigInt(
    integer(
      profile ? profile.rounding_step : (input.rounding_step ?? 1),
      "ROUNDING",
      1,
      1000000,
    ),
  );
  const taxable = profile
    ? profile.tax.taxable_components
    : (input.taxable_components ?? ["making", "distribution", "retail"]);
  if (
    !Array.isArray(taxable) ||
    taxable.some(
      (x: any) =>
        !["gold", "making", "distribution", "retail", "credit"].includes(x),
    )
  )
    throw new Error("INVALID_TAX_COMPONENTS");
  const denom = 750n * 10000n * 1000n;
  const base = weight * purity;
  const numerators: Record<string, bigint> = {
    gold: base * 10000n,
    making:
      input.making_mode === "fixed_gold"
        ? mw * 750n * 10000n
        : input.making_mode === "percent"
          ? base * mb
          : input.labor_mode === "percent"
            ? base * lb
            : 0n,
    distribution: base * distribution,
    retail: base * retail,
    ...(profile ? { credit: 0n } : {}),
  };
  const legacy = !input.making_mode && input.labor_mode !== "percent";
  const amounts = Object.fromEntries(
    Object.entries(numerators).map(([k, n]) => [k, ceil(n * rate, denom)]),
  );
  if (legacy) amounts.making = labor;
  const charges: any[] = [];
  const order_rules: any[] = [];
  if (profile) {
    for (const r of profile.rules) {
      const selected =
        r.application_mode === "BY_PAYMENT_METHOD"
          ? payment_method === "CASH"
            ? r.cash_rule
            : r.credit_rule
          : r;
      const applied =
        r.application_mode !== "DISABLED" &&
        (r.application_mode !== "CREDIT_ONLY" || payment_method === "CREDIT") &&
        (r.application_mode !== "CASH_ONLY" || payment_method === "CASH");
      const basis =
        selected.basis === "GOLD_BASE_750_IRR"
          ? { n: base * rate, d: 750000n }
          : selected.basis === "MAKING_IRR"
            ? { n: amounts.making, d: 1n }
            : { n: amounts.gold + amounts.making, d: 1n };
      const amount = applied
        ? selected.mode === "FIXED_IRR"
          ? BigInt(integer(Number(selected.value), "PROFILE_AMOUNT"))
          : ceil(
              basis.n *
                BigInt(
                  integer(Number(selected.value), "PROFILE_BPS", 0, 10000),
                ),
              basis.d * 10000n,
            )
        : 0n;
      const charge = {
        ...r,
        applied,
        applied_rule: selected,
        amount_irr: Number(amount),
        payment_method,
        tax_bps: taxable.includes(r.component) ? Number(vat) : 0,
        tax_version_id: profile.tax.id,
      };
      if (r.scope === "ORDER") order_rules.push(charge);
      else {
        charges.push(charge);
        if (r.payer === "CUSTOMER")
          amounts[r.component] = (amounts[r.component] || 0n) + amount;
      }
    }
  }
  const taxableNumerator = [...new Set<string>(taxable)].reduce(
    (s, k) => s + numerators[k],
    0n,
  );
  let tax = ceil(
    (taxableNumerator * rate +
      (legacy && taxable.includes("making") ? labor * denom : 0n)) *
      vat,
    denom * 10000n,
  );
  if (profile)
    tax = ceil(
      [...new Set<string>(taxable)].reduce(
        (sum, k) => sum + (amounts[k] || 0n),
        0n,
      ) * vat,
      10000n,
    );
  const subtotal =
    amounts.gold +
    amounts.making +
    amounts.distribution +
    amounts.retail +
    (amounts.credit || 0n) +
    tax +
    fee;
  const total = ceil(subtotal, step) * step;
  if (total > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error("PRICE_OVERFLOW");
  return {
    metal_irr: Number(amounts.gold),
    labor_irr: Number(amounts.making),
    margin_irr: Number(
      amounts.distribution + amounts.retail + (amounts.credit || 0n),
    ),
    credit_irr: Number(amounts.credit || 0n),
    tax_irr: Number(tax),
    distribution_irr: Number(amounts.distribution),
    retail_irr: Number(amounts.retail),
    vat_irr: Number(tax),
    fee_irr: Number(fee),
    rounding_irr: Number(total - subtotal),
    total_irr: Number(total),
    currency: "IRR",
    price_model: profile ? "gold_first_profile_v1" : "gold_first_v1",
    ...(profile
      ? {
          merchant_profile: profile,
          payment_method,
          profile_charges: charges,
          order_rules,
        }
      : {}),
    pricing_policy_id: profile ? null : (input.pricing_policy_id ?? null),
    making_basis: legacy
      ? "legacy_fixed_irr_requires_review"
      : (input.making_mode ?? "percent"),
    gold_components: Object.fromEntries(
      Object.entries(numerators).map(([k, n]) => [
        k,
        {
          numerator:
            profile && ["distribution", "retail", "credit"].includes(k)
              ? amounts[k].toString()
              : n.toString(),
          denominator:
            profile && ["distribution", "retail", "credit"].includes(k)
              ? rate.toString()
              : denom.toString(),
          unit: "g_750_equivalent",
          ...(profile && ["distribution", "retail", "credit"].includes(k)
            ? { valuation_basis: "quoted_irr_at_gold_rate" }
            : {}),
        },
      ]),
    ),
  };
}
export async function withPolicy(c: any, rate: any) {
  const {
    rows: [policy],
  } = await c.query("SELECT * FROM didar_pricing_policy WHERE id=$1", [
    rate.pricing_policy_id,
  ]);
  return {
    ...rate,
    ...policy,
    id: rate.id,
    pricing_policy_id: policy.id,
    rate_irr: Number(rate.rate_irr),
    fee_irr: Number(rate.fee_irr ?? 0),
  };
}
