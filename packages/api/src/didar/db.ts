import { Pool, type PoolClient } from "pg";
export const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
});
// PostgreSQL restart removes stale idle connections; subsequent queries reconnect.
// Log only the diagnostic code, never connection strings or credentials.
db.on("error", (error: any) =>
  console.error(
    "Didar idle database connection",
    error.code || "CONNECTION_ERROR",
  ),
);
export async function transaction<T>(
  fn: (c: PoolClient) => Promise<T>,
): Promise<T> {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    const result = await fn(c);
    await c.query("COMMIT");
    return result;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
