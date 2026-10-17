import { Pool, type PoolClient } from "pg";
export const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  // Per-connection, fail-closed feature gate also applies to SQL visibility/counts.
  options:
    process.env.DIDAR_AGENCY_MODE === "sandbox" &&
    process.env.DIDAR_ENVIRONMENT === "local" &&
    process.env.DIDAR_PAYMENT_MODE === "sandbox"
      ? "-c didar.curation_enabled=sandbox"
      : "-c didar.curation_enabled=off",
});
// PostgreSQL restart removes stale idle connections; subsequent queries reconnect.
// Log only the diagnostic code, never connection strings or credentials.
db.on("error", (error: any) =>
  console.error(
    "Didar idle database connection",
    error.code || "CONNECTION_ERROR",
  ),
);
const commitHooks = new WeakMap<PoolClient, Array<() => Promise<unknown>>>();
/** Best-effort latency optimization. Durable work MUST be queued in the transaction. */
export function afterCommit(c: PoolClient, callback: () => Promise<unknown>) {
  const hooks = commitHooks.get(c);
  if (!hooks) throw Error("AFTER_COMMIT_REQUIRES_TRANSACTION");
  hooks.push(callback);
}
export async function transaction<T>(
  fn: (c: PoolClient) => Promise<T>,
): Promise<T> {
  const c = await db.connect();
  const hooks: Array<() => Promise<unknown>> = [];
  commitHooks.set(c, hooks);
  let result: T;
  try {
    await c.query("BEGIN");
    result = await fn(c);
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    commitHooks.delete(c);
    c.release();
  }
  // A callback cannot turn an already committed domain mutation into a 500.
  for (const hook of hooks) {
    try {
      await hook();
    } catch {
      console.error("DIDAR_AFTER_COMMIT_RETRY_REQUIRED");
    }
  }
  return result!;
}
