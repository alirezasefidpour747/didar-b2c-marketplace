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
export function price(input: {
  weight_mg: number;
  purity: number;
  rate_irr: number;
  labor_irr: number;
  margin_bps?: number;
  default_margin_bps?: number;
  labor_mode?: "fixed" | "percent";
  labor_bps?: number;
  fee_irr?: number;
  rounding_step?: number;
  tax_bps: number;
}) {
  const weight = BigInt(integer(input.weight_mg, "WEIGHT", 1, 1_000_000));
  const purity = BigInt(integer(input.purity, "PURITY", 1, 1000));
  const rate = BigInt(integer(input.rate_irr, "RATE", 1));
  const fixedLabor = BigInt(integer(input.labor_irr, "LABOR"));
  if (input.labor_mode && !["fixed", "percent"].includes(input.labor_mode))
    throw new Error("INVALID_LABOR_MODE");
  const laborBps = BigInt(
    integer(input.labor_bps ?? 0, "LABOR_PERCENT", 0, 10000),
  );
  const fee = BigInt(integer(input.fee_irr ?? 0, "FEE"));
  const rounding = BigInt(
    integer(input.rounding_step ?? 1, "ROUNDING", 1, 1000000),
  );
  const marginBps = BigInt(
    integer(
      input.margin_bps ?? input.default_margin_bps ?? 700,
      "MARGIN",
      0,
      10000,
    ),
  );
  const taxBps = BigInt(integer(input.tax_bps, "TAX", 0, 10000));
  // Rate is for one gram of 750-fineness (18K) gold. Round each component upward to a rial.
  const metal = ceil(weight * purity * rate, 750000n);
  const labor =
    input.labor_mode === "percent"
      ? ceil(metal * laborBps, 10000n)
      : fixedLabor;
  const margin = ceil((metal + labor) * marginBps, 10000n);
  // Tax applies to labor and profit, never the gold principal.
  const tax = ceil((labor + margin) * taxBps, 10000n);
  const subtotal = metal + labor + margin + tax + fee;
  const total = ceil(subtotal, rounding) * rounding;
  if (total > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error("PRICE_OVERFLOW");
  return {
    metal_irr: Number(metal),
    labor_irr: Number(labor),
    margin_irr: Number(margin),
    tax_irr: Number(tax),
    fee_irr: Number(fee),
    rounding_irr: Number(total - subtotal),
    total_irr: Number(total),
    currency: "IRR",
  };
}
