import { db } from "./db";
/** Providers must return integer IRR per gram of 750 fineness; never replace checkout's locked snapshot. */
export interface GoldRateSource {
  readonly name: string;
  latest(): Promise<{ rate_irr: number; observed_at: Date; version: number }>;
}
export class ManualGoldRateSource implements GoldRateSource {
  readonly name = "manual";
  async latest() {
    const {
      rows: [rate],
    } = await db.query(
      "SELECT rate_irr,updated_at,version FROM didar_rate WHERE id=1",
    );
    if (!rate) throw new Error("RATE_UNAVAILABLE");
    return {
      rate_irr: Number(rate.rate_irr),
      observed_at: new Date(rate.updated_at),
      version: rate.version,
    };
  }
}
