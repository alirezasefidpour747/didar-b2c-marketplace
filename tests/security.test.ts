import { afterAll, expect, test } from "bun:test";
import {
  demoAccountAllowed,
  hashPassword,
  verifyPassword,
} from "../packages/api/src/didar/auth";
import {
  IranianRialPaymentProvider,
  SandboxPaymentProvider,
  paymentProvider,
} from "../packages/api/src/didar/payment-provider";
const originalEnvironment = process.env.DIDAR_ENVIRONMENT;
const originalMode = process.env.DIDAR_PAYMENT_MODE;
afterAll(() => {
  if (originalEnvironment === undefined) delete process.env.DIDAR_ENVIRONMENT;
  else process.env.DIDAR_ENVIRONMENT = originalEnvironment;
  if (originalMode === undefined) delete process.env.DIDAR_PAYMENT_MODE;
  else process.env.DIDAR_PAYMENT_MODE = originalMode;
});
test("public demo identities require explicit local runtime, independent of build mode", () => {
  for (const environment of ["", "staging", "production"]) {
    process.env.DIDAR_ENVIRONMENT = environment;
    expect(demoAccountAllowed("admin@didar.test")).toBe(false);
    expect(demoAccountAllowed("operator@example.com")).toBe(true);
  }
  process.env.DIDAR_ENVIRONMENT = "local";
  expect(demoAccountAllowed("admin@didar.test")).toBe(true);
});
test("payment selection fails closed for production, missing environment and live modes", () => {
  process.env.DIDAR_PAYMENT_MODE = "sandbox";
  for (const environment of ["", "production"]) {
    process.env.DIDAR_ENVIRONMENT = environment;
    expect(() => paymentProvider()).toThrow("PAYMENTS_DISABLED");
  }
  process.env.DIDAR_ENVIRONMENT = "staging";
  expect(paymentProvider().name).toBe("sandbox");
  process.env.DIDAR_PAYMENT_MODE = "live";
  expect(() => paymentProvider()).toThrow("PAYMENTS_DISABLED");
});
test("live Iranian gateway boundary never initiates an unconfigured charge", async () => {
  const p = new IranianRialPaymentProvider();
  await expect(
    p.initialize({ order_id: "test", amount_irr: 1000, currency: "IRR" }),
  ).rejects.toThrow("LIVE_GATEWAY_NOT_CONFIGURED");
});
test("sandbox authority has no money movement and rejects invalid money", async () => {
  const p = new SandboxPaymentProvider();
  await expect(
    p.initialize({ order_id: "test", amount_irr: 0.1, currency: "IRR" }),
  ).rejects.toThrow("INVALID_PAYMENT_AMOUNT");
  const one = await p.initialize({
    order_id: "one",
    amount_irr: 1000,
    currency: "IRR",
  });
  const two = await p.initialize({
    order_id: "two",
    amount_irr: 1000,
    currency: "IRR",
  });
  expect(one.authority).not.toBe(two.authority);
  expect(
    (
      await p.confirm({
        authority: one.authority,
        amount_irr: 1000,
        outcome: "cancel",
      })
    ).status,
  ).toBe("cancelled");
});
test("password verification handles corrupt records without crashing and uses unique salted hashes", () => {
  const one = hashPassword("a long fixture password"),
    two = hashPassword("a long fixture password");
  expect(one).not.toBe(two);
  expect(verifyPassword("a long fixture password", one)).toBe(true);
  expect(verifyPassword("wrong password", one)).toBe(false);
  expect(verifyPassword("a long fixture password", "broken")).toBe(false);
});
