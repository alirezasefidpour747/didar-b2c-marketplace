import { createHmac } from "node:crypto";
import type { PoolClient } from "pg";
import { HEADER, normalizePeer, verifyNetwork, apiNetworkPolicy } from "@didar/auth-network";
import { db } from "./db";

export const AUTH_WORK_NAMESPACE = 1145655624; // two-key advisory space, separate from finance
export const AUTH_WORK_SLOTS = 4;
export function authBucketKey(kind: string, ...parts: string[]) {
  const key =
    process.env.COOKIE_SECRET || "development-only-do-not-use-in-production";
  return createHmac("sha256", key)
    .update(JSON.stringify(["auth-v2", kind, ...parts]))
    .digest("hex");
}
async function consume(c: Pick<PoolClient, "query">, key: string) {
  return (
    await c.query(
      `INSERT INTO didar_login_attempt(key,attempts,reset_at) VALUES($1,1,now()+interval '15 minutes')
     ON CONFLICT(key) DO UPDATE SET
       attempts=CASE WHEN didar_login_attempt.reset_at<=now() THEN 1 ELSE least(didar_login_attempt.attempts,1000000)+1 END,
       reset_at=CASE WHEN didar_login_attempt.reset_at<=now() THEN now()+interval '15 minutes' ELSE didar_login_attempt.reset_at END
     RETURNING attempts`,
      [key],
    )
  ).rows[0].attempts as number;
}
async function network(req: any) {
  // Express's global trust-proxy setting is deliberately NOT consulted.
  const peer = normalizePeer(req.socket?.remoteAddress);
  const { mode, peers } = apiNetworkPolicy();
  const assertion = req.headers[HEADER];
  if (assertion === undefined) {
    // Explicit extension of policy A: a known proxy cannot downgrade to direct
    // attribution. Truly direct, nonproxy sockets retain the original policy.
    if (mode === "require-proof" && peers.includes(peer)) throw Error("FORBIDDEN");
    return peer;
  }
  if (!peers.includes(peer) || !Buffer.isBuffer(req.rawBody))
    throw Error("FORBIDDEN");
  const proof = verifyNetwork({
    key: process.env.DIDAR_AUTH_NETWORK_KEY,
    assertion,
    method: req.method,
    path: req.originalUrl || req.path,
    body: req.rawBody,
  });
  // Autocommit, independent of subsequent credential failure/429/transaction rollback.
  const inserted = await db.query(
    `INSERT INTO didar_login_attempt(key,attempts,reset_at) VALUES($1,1,now()+interval '60 seconds')
     ON CONFLICT DO NOTHING RETURNING key`,
    [authBucketKey("nonce", String(proof.ts), proof.nonce)],
  );
  if (!inserted.rowCount) throw Error("FORBIDDEN");
  return proof.peer;
}
/** Admission only: no identity/permission decisions, account ban or new session authority. */
export async function withAuthAdmission<T>(
  req: any,
  email: string,
  run: (failed: () => Promise<void>) => Promise<T>,
) {
  const address = await network(req);
  // Expiry is enforced on reads; pruning also bounds accumulation of one-use
  // nonces. Indexed, bounded and skip-locked; never touches users or sessions.
  await db.query(`WITH expired AS (
    SELECT key FROM didar_login_attempt WHERE reset_at<=now()
    ORDER BY reset_at LIMIT 100 FOR UPDATE SKIP LOCKED)
    DELETE FROM didar_login_attempt a USING expired e WHERE a.key=e.key`);
  // No connection is held during soft target pacing.
  if ((await consume(db, authBucketKey("network", address))) > 200)
    throw Error("RATE_LIMIT");
  if (
    (await consume(db, authBucketKey("network-account", address, email))) > 20
  )
    throw Error("RATE_LIMIT");
  const targetKey = authBucketKey("pressure", email);
  const pressure =
    (
      await db.query(
        "SELECT attempts FROM didar_login_attempt WHERE key=$1 AND reset_at>now()",
        [targetKey],
      )
    ).rows[0]?.attempts || 0;
  if (pressure)
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(pressure * 100, 500)),
    );
  const c = await db.connect();
  let slot: number | undefined,
    networkLock = false,
    broken = false;
  const networkKey = authBucketKey("work", address);
  try {
    const acquired = await c.query(
      "SELECT pg_try_advisory_lock($1::int,hashtext($2)) ok",
      [AUTH_WORK_NAMESPACE + 1, networkKey],
    );
    networkLock = acquired.rows[0].ok;
    if (!networkLock) throw Error("RATE_LIMIT");
    for (let i = 0; i < AUTH_WORK_SLOTS; i++) {
      if (
        (
          await c.query("SELECT pg_try_advisory_lock($1::int,$2::int) ok", [
            AUTH_WORK_NAMESPACE,
            i,
          ])
        ).rows[0].ok
      ) {
        slot = i;
        break;
      }
    }
    if (slot === undefined) throw Error("RATE_LIMIT");
    return await run(async () => {
      await consume(c, targetKey);
    });
  } finally {
    // Session locks are held by this exact connection until all crypto work settles.
    // A crash drops them; no expiring lease can admit work while the old KDF runs.
    try {
      if (slot !== undefined)
        await c.query("SELECT pg_advisory_unlock($1::int,$2::int)", [
          AUTH_WORK_NAMESPACE,
          slot,
        ]);
      if (networkLock)
        await c.query("SELECT pg_advisory_unlock($1::int,hashtext($2))", [
          AUTH_WORK_NAMESPACE + 1,
          networkKey,
        ]);
    } catch {
      broken = true;
    }
    c.release(broken);
  }
}
