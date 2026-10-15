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
