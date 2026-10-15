import { randomBytes } from "node:crypto";
export type PaymentOutcome = "success" | "failure" | "cancel";
export interface PaymentProvider {
  readonly name: "sandbox" | "iranian-rial";
  initialize(input: {
    order_id: string;
    amount_irr: number;
    currency: "IRR";
  }): Promise<{ authority: string }>;
  confirm(input: {
    authority: string;
    amount_irr: number;
    outcome: PaymentOutcome;
  }): Promise<{
    status: "success" | "failure" | "cancelled";
    reference?: string;
  }>;
}
/** No network and no money movement. Simulation is explicit and unavailable to production. */
export class SandboxPaymentProvider implements PaymentProvider {
  readonly name = "sandbox";
  async initialize(input: {
    order_id: string;
    amount_irr: number;
    currency: "IRR";
  }) {
    if (
      !Number.isSafeInteger(input.amount_irr) ||
      input.amount_irr <= 0 ||
      input.currency !== "IRR"
    )
      throw new Error("INVALID_PAYMENT_AMOUNT");
    return { authority: randomBytes(32).toString("hex") };
  }
  async confirm(input: {
    authority: string;
    amount_irr: number;
    outcome: PaymentOutcome;
  }) {
    if (
      !input.authority ||
      !Number.isSafeInteger(input.amount_irr) ||
      input.amount_irr <= 0
    )
      throw new Error("INVALID_PAYMENT_AMOUNT");
    if (!["success", "failure", "cancel"].includes(input.outcome))
      throw new Error("INVALID_OUTCOME");
    return {
      status:
        input.outcome === "cancel" ? ("cancelled" as const) : input.outcome,
      ...(input.outcome === "success"
        ? { reference: `sandbox-${input.authority}` }
        : {}),
    };
  }
}
/** Integration boundary: implement request/verify against an approved gateway's documented IRR contract.
 * No endpoint/credential is guessed and no live charge can be created by this adapter. */
export class IranianRialPaymentProvider implements PaymentProvider {
  readonly name = "iranian-rial";
  async initialize(_input: {
    order_id: string;
    amount_irr: number;
    currency: "IRR";
  }): Promise<{ authority: string }> {
    throw new Error("LIVE_GATEWAY_NOT_CONFIGURED");
  }
  async confirm(_input: {
    authority: string;
    amount_irr: number;
    outcome: PaymentOutcome;
  }): Promise<{
    status: "success" | "failure" | "cancelled";
    reference?: string;
  }> {
    throw new Error("LIVE_GATEWAY_NOT_CONFIGURED");
  }
}
export function paymentProvider(): PaymentProvider {
  const environment = process.env.DIDAR_ENVIRONMENT;
  if (
    process.env.DIDAR_PAYMENT_MODE !== "sandbox" ||
    !["local", "staging"].includes(environment || "")
  )
    throw new Error("PAYMENTS_DISABLED");
  return new SandboxPaymentProvider();
}
