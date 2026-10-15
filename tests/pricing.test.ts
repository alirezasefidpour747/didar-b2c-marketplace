import { expect, test } from "bun:test";
import { price } from "../packages/api/src/didar/pricing";
const base = {
  weight_mg: 2350,
  purity: 750,
  rate_irr: 65000000,
  labor_irr: 1500000,
  margin_bps: 700,
  tax_bps: 1000,
};
test("gold principal, labor, margin and tax have exact independently checked values", () => {
  expect(price(base)).toEqual({
    metal_irr: 152750000,
    labor_irr: 1500000,
    margin_irr: 10797500,
    tax_irr: 1229750,
    fee_irr: 0,
    rounding_irr: 0,
    total_irr: 166277250,
    currency: "IRR",
  });
});
test("fractional gram uses integer upward rial rounding", () => {
  const p = price({
    ...base,
    weight_mg: 1,
    purity: 585,
    rate_irr: 65000001,
    labor_irr: 0,
    margin_bps: 0,
    tax_bps: 0,
  });
  expect(p.metal_irr).toBe(50701);
  expect(p.total_irr).toBe(50701);
});
test("tax excludes gold principal", () => {
  expect(price({ ...base, labor_irr: 0, margin_bps: 0 }).tax_irr).toBe(0);
});
test("invalid quantities and rates cannot enter arithmetic", () => {
  for (const bad of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER])
    expect(() => price({ ...base, weight_mg: bad })).toThrow();
  expect(() => price({ ...base, purity: 1001 })).toThrow();
  expect(() => price({ ...base, rate_irr: 0 })).toThrow();
});

test("percentage making charge, fixed fees and configurable rounding preserve hand-checked amounts", () => {
  expect(
    price({
      ...base,
      labor_mode: "percent",
      labor_bps: 250,
      fee_irr: 1234,
      rounding_step: 1000,
    }),
  ).toEqual({
    metal_irr: 152750000,
    labor_irr: 3818750,
    margin_irr: 10959813,
    tax_irr: 1477857,
    fee_irr: 1234,
    rounding_irr: 346,
    total_irr: 169008000,
    currency: "IRR",
  });
});

test("default margin is configurable while an explicit zero margin stays zero", () => {
  const policy = {
    ...base,
    weight_mg: 1000,
    rate_irr: 100000,
    labor_irr: 0,
    margin_bps: undefined,
    default_margin_bps: 100,
    tax_bps: 0,
  };
  expect(price(policy).margin_irr).toBe(1000);
  expect(price({ ...policy, margin_bps: 0 }).margin_irr).toBe(0);
});

test("invalid commercial policy cannot silently influence customer totals", () => {
  expect(() => price({ ...base, labor_bps: -1 })).toThrow();
  expect(() => price({ ...base, rounding_step: 0 })).toThrow();
  expect(() => price({ ...base, fee_irr: 0.5 })).toThrow();
});
