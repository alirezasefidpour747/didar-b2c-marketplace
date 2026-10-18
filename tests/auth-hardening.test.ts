import { test, expect, afterAll } from "bun:test";
import http from "node:http";
import { createHmac, randomBytes } from "node:crypto";
import { Pool } from "../packages/api/node_modules/pg";
import { signNetwork, HEADER } from "../packages/auth-network/index.cjs";
if (process.env.DIDAR_DISPOSABLE_QA !== "true")
  throw Error("Owned disposable QA required");
const api = process.env.TEST_API_URL!,
  web = process.env.TEST_AUTH_INGRESS_URL || process.env.TEST_STOREFRONT_URL!,
  privateWeb = process.env.TEST_PRIVATE_STOREFRONT_URL!;
if (!api || !web || !privateWeb || !process.env.DIDAR_AUTH_NETWORK_KEY)
  throw Error("Signed ingress QA configuration required");
const db = new Pool({ connectionString: process.env.DATABASE_URL });
afterAll(() => db.end());
const password = "DidarDemo2026!",
  bad = "IncorrectPassword2026!";
function send(
  origin: string,
  peer: string,
  email: string,
  pass = bad,
  headers: Record<string, string> = {},
  path = "/didar/login",
  raw?: string,
) {
  return new Promise<{ status: number; data: any }>((resolve, reject) => {
    const url = new URL(path, origin),
      body = raw ?? JSON.stringify({ email, password: pass });
    const req = http.request(
      url,
      {
        method: "POST",
        localAddress: peer,
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body),
          ...headers,
        },
      },
      (res) => {
        let bytes = "";
        res.on("data", (d) => (bytes += d));
        res.on("end", () => {
          let data;
          try {
            data = JSON.parse(bytes);
          } catch {
            data = { message: bytes };
          }
          resolve({ status: res.statusCode!, data });
        });
      },
    );
    req.on("error", reject);
    req.end(body);
  });
}
function key(kind: string, ...parts: string[]) {
  return createHmac("sha256", process.env.COOKIE_SECRET!)
    .update(JSON.stringify(["auth-v2", kind, ...parts]))
    .digest("hex");
}
const proxy = (
  peer: string,
  email: string,
  pass = bad,
  headers: Record<string, string> = {},
) => send(web, peer, email, pass, headers, "/api/didar/login");
test("direct auth ignores spoofed forwarding and cookie rotation; normalized account quota persists", async () => {
  const peer = "127.0.0.21",
    email = "auth-direct-qa@didar.test";
  for (let i = 0; i < 21; i++) {
    const r = await send(api, peer, i % 2 ? email.toUpperCase() : email, bad, {
      "x-forwarded-for": `198.51.100.${i + 1}`,
      "x-real-ip": `203.0.113.${i + 1}`,
      forwarded: `for=192.0.2.${i + 1}`,
      cookie: `client=${i}`,
    });
    expect(r.status).toBe(i < 20 ? 401 : 429);
  }
  const row = (
    await db.query("SELECT attempts FROM didar_login_attempt WHERE key=$1", [
      key("network-account", peer, email),
    ])
  ).rows[0];
  expect(row.attempts).toBe(21);
}, 30000);
test("one real proxy client cannot spend another network’s quota", async () => {
  const peer = "127.0.0.22";
  for (let i = 0; i < 201; i++)
    expect((await proxy(peer, `auth-spray-${i}@didar.test`)).status).toBe(
      i < 200 ? 401 : 429,
    );
  expect(
    (await proxy("127.0.0.23", "customer@didar.test", password)).status,
  ).toBe(200);
  expect(
    (
      await db.query("SELECT attempts FROM didar_login_attempt WHERE key=$1", [
        key("network", peer),
      ])
    ).rows[0].attempts,
  ).toBe(201);
}, 30000);
test("targeted account failures do not create a victim account ban", async () => {
  for (let i = 0; i < 21; i++)
    expect((await proxy("127.0.0.24", "customer@didar.test")).status).toBe(
      i < 20 ? 401 : 429,
    );
  expect(
    (await proxy("127.0.0.25", "customer@didar.test", password)).status,
  ).toBe(200);
  expect(
    (
      await db.query("SELECT attempts FROM didar_login_attempt WHERE key=$1", [
        key("pressure", "customer@didar.test"),
      ])
    ).rows[0].attempts,
  ).toBe(20);
}, 30000);
test("private Next cannot downgrade missing proof; unsigned API uses actual socket", async () => {
  const peer = "127.0.0.26",
    email = "auth-private-qa@didar.test";
  const before = (
    await db.query("SELECT count(*)::int n FROM didar_login_attempt")
  ).rows[0].n;
  expect(
    (
      await send(
        privateWeb,
        peer,
        email,
        bad,
        { "x-forwarded-for": "198.51.100.1" },
        "/api/didar/login",
      )
    ).status,
  ).toBe(403);
  expect(
    (await db.query("SELECT count(*)::int n FROM didar_login_attempt")).rows[0]
      .n,
  ).toBe(before);
  expect(
    (
      await send(api, peer, "customer@didar.test", password, {
        "cf-connecting-ip": "198.51.100.1",
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await db.query("SELECT attempts FROM didar_login_attempt WHERE key=$1", [
        key("network", peer),
      ])
    ).rows[0].attempts,
  ).toBe(1);
});
test("raw-byte binding, authenticated proxy peer and nonce replay are enforced", async () => {
  const email = "auth-proof-qa@didar.test",
    raw = JSON.stringify({ email, password: bad });
  const proof = signNetwork({
    key: process.env.DIDAR_AUTH_NETWORK_KEY,
    peer: "198.51.100.72",
    method: "POST",
    path: "/didar/login",
    body: raw,
  });
  expect(
    (
      await send(
        api,
        "127.0.0.1",
        email,
        bad,
        { [HEADER]: proof },
        "/didar/login",
        raw,
      )
    ).status,
  ).toBe(401);
  expect(
    (
      await send(
        api,
        "127.0.0.1",
        email,
        bad,
        { [HEADER]: proof },
        "/didar/login",
        raw,
      )
    ).status,
  ).toBe(403);
  const fresh = signNetwork({
    key: process.env.DIDAR_AUTH_NETWORK_KEY,
    peer: "198.51.100.72",
    method: "POST",
    path: "/didar/login",
    body: raw,
  });
  expect(
    (
      await send(
        api,
        "127.0.0.1",
        email,
        bad,
        { [HEADER]: fresh },
        "/didar/login",
        raw + " ",
      )
    ).status,
  ).toBe(403);
  expect(
    (await send(api, "127.0.0.27", email, bad, { [HEADER]: fresh })).status,
  ).toBe(403);
  const stale = signNetwork({
    key: process.env.DIDAR_AUTH_NETWORK_KEY,
    peer: "198.51.100.72",
    method: "POST",
    path: "/didar/login",
    body: raw,
    ts: Date.now() - 40000,
  });
  expect(
    (await send(api, "127.0.0.1", email, bad, { [HEADER]: stale })).status,
  ).toBe(403);
}, 10000);
test("a first-hop proof stays single-use after Next re-signs it", async () => {
  const email = "auth-replay-qa@didar.test",
    raw = JSON.stringify({ email, password: bad });
  const proof = signNetwork({
    key: process.env.DIDAR_AUTH_NETWORK_KEY,
    peer: "198.51.100.73",
    method: "POST",
    path: "/api/didar/login",
    body: raw,
  });
  expect(
    (
      await send(
        privateWeb,
        "127.0.0.1",
        email,
        bad,
        { [HEADER]: proof },
        "/api/didar/login",
        raw,
      )
    ).status,
  ).toBe(401);
  expect(
    (
      await send(
        privateWeb,
        "127.0.0.1",
        email,
        bad,
        { [HEADER]: proof },
        "/api/didar/login",
        raw,
      )
    ).status,
  ).toBe(403);
});
test("concurrent requests cannot over-admit a client/account budget", async () => {
  const peer = "127.0.0.28",
    email = "auth-race-qa@didar.test";
  const results = await Promise.all(
    Array.from({ length: 30 }, (_, i) =>
      proxy(peer, email, bad, { "x-forwarded-for": `192.0.2.${i + 1}` }),
    ),
  );
  expect(results.every((r) => [401, 429].includes(r.status))).toBe(true);
  expect(results.filter((r) => r.status === 401).length).toBeGreaterThan(0);
  expect(results.filter((r) => r.status === 401).length).toBeLessThanOrEqual(
    20,
  );
  expect(
    (
      await db.query("SELECT attempts FROM didar_login_attempt WHERE key=$1", [
        key("network-account", peer, email),
      ])
    ).rows[0].attempts,
  ).toBe(30);
}, 10000);
test("database work admission applies independently of client IP and releases without account lock", async () => {
  const c = await db.connect();
  try {
    for (let i = 0; i < 4; i++)
      await c.query("SELECT pg_advisory_lock($1::int,$2::int)", [
        1145655624,
        i,
      ]);
    expect(
      (await proxy("127.0.0.29", "customer@didar.test", password)).status,
    ).toBe(429);
  } finally {
    for (let i = 0; i < 4; i++)
      await c.query("SELECT pg_advisory_unlock($1::int,$2::int)", [
        1145655624,
        i,
      ]);
    c.release();
  }
  expect(
    (await proxy("127.0.0.29", "customer@didar.test", password)).status,
  ).toBe(200);
});
test("expired auth-only state is pruned in bounded batches; active state survives", async () => {
  const ids = Array.from({ length: 101 }, () =>
      randomBytes(32).toString("hex"),
    ),
    active = randomBytes(32).toString("hex");
  await db.query(
    "INSERT INTO didar_login_attempt(key,attempts,reset_at) SELECT unnest($1::text[]),1,now()-interval '1 day'",
    [ids],
  );
  await db.query(
    "INSERT INTO didar_login_attempt VALUES($1,1,now()+interval '1 day')",
    [active],
  );
  expect(
    (await send(api, "127.0.0.30", "customer@didar.test", password)).status,
  ).toBe(200);
  expect(
    (
      await db.query(
        "SELECT count(*)::int n FROM didar_login_attempt WHERE key=ANY($1::text[])",
        [ids],
      )
    ).rows[0].n,
  ).toBe(1);
  expect(
    (await db.query("SELECT 1 FROM didar_login_attempt WHERE key=$1", [active]))
      .rowCount,
  ).toBe(1);
  expect(
    (
      await db.query(
        "SELECT 1 FROM pg_indexes WHERE indexname='didar_login_attempt_expiry_idx'",
      )
    ).rowCount,
  ).toBe(1);
});
test("native Admin and Vendor authentication and canonical customer sessions remain original authorities", async () => {
  for (const [actor, email] of [
    ["user", "native-admin@didar.test"],
    ["member", "native-supplier@didar.test"],
  ]) {
    const r = await send(
      api,
      "127.0.0.31",
      email,
      "DidarNative2026!",
      {},
      `/auth/${actor}/emailpass`,
    );
    expect(r.status).toBe(200);
    expect(typeof r.data.token).toBe("string");
  }
  const r = await proxy("127.0.0.32", "customer@didar.test", password);
  expect(r.status).toBe(200);
  expect(r.data.user.id).toBe("demo-customer");
  const response = await fetch(api + "/didar/me", {
    headers: { authorization: "Bearer " + r.data.token },
  });
  expect(response.status).toBe(200);
}, 10000);
