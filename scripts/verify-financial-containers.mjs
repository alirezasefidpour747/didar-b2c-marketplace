// Read-only runtime smoke of the verified prepared artifacts; not an image-build/ARM claim.
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, appendFileSync, cpSync } from "node:fs";
import { resolve } from "node:path";
import { assertLocalDocker } from "./local/runtime.mjs";
import { verifyBuild } from "./local/build-receipt.mjs";
assertLocalDocker();
verifyBuild();
mkdirSync(".local", { recursive: true, mode: 0o700 });
const log = ".local/phase2-container-smoke.log",
  suffix = randomBytes(6).toString("hex"),
  network = "didar-fin-qa-" + suffix;
const names = {
    pg: network + "-pg",
    redis: network + "-redis",
    api: network + "-api",
    web: network + "-web",
  },
  created = [];
const root = resolve("."),
  label = ["--label", "didar.disposable-qa=true"];
const docker = (args, { record = false } = {}) => {
  const r = spawnSync("docker", args, { encoding: "utf8" });
  if (record)
    appendFileSync(log, (r.stdout || "") + (r.stderr || ""), { mode: 0o600 });
  if (r.status !== 0)
    throw new Error("Local container smoke command failed; inspect " + log);
  return r.stdout.trim();
};
const inspect = (name) => JSON.parse(docker(["inspect", name]))[0];
const environment = {
  DIDAR_ENVIRONMENT: "local",
  DIDAR_PAYMENT_MODE: "sandbox",
  DIDAR_SEED_DEMO: "true",
  DATABASE_URL: "postgres://postgres@pg:5432/didar_qa?sslmode=disable",
  REDIS_URL: "redis://redis:6379",
  JWT_SECRET: randomBytes(32).toString("hex"),
  COOKIE_SECRET: randomBytes(32).toString("hex"),
  MERCUR_DISABLE_TELEMETRY: "true",
  MEDUSA_DISABLE_TELEMETRY: "true",
  MEDUSA_DB_MIGRATION_CONNECTION_TIMEOUT: "60000",
  NEXT_TELEMETRY_DISABLED: "1",
  XDG_CONFIG_HOME: "/tmp/xdg",
  XDG_CACHE_HOME: "/tmp/cache",
  STORE_CORS: "http://localhost:3000",
  ADMIN_CORS: "http://localhost:9000",
  VENDOR_CORS: "http://localhost:9000",
  AUTH_CORS: "http://localhost:3000,http://localhost:9000",
  FILE_BACKEND_URL: "http://localhost:9000/static",
  MERCUR_BACKEND_URL: "http://localhost:9000",
};
const envArgs = Object.entries(environment).flatMap(([k, v]) => [
  "-e",
  k + "=" + v,
]);
const common = [
  "--network",
  network,
  ...label,
  "--read-only",
  "--tmpfs",
  "/tmp",
  "--mount",
  `type=bind,src=${root},dst=/app,readonly`,
  ...envArgs,
];
const cli = "/app/packages/api/node_modules/@medusajs/cli/cli.js";
const run = (name, args) => {
  docker(["run", "-d", "--name", name, ...args]);
  created.push(name);
};
const wait = async (url, check) => {
  for (let n = 0; n < 240; n++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (r.ok && (await check(r))) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("Local container health timeout");
};
try {
  docker(["network", "create", ...label, network]);
  run(names.pg, [
    "--network",
    network,
    "--network-alias",
    "pg",
    ...label,
    "-e",
    "POSTGRES_HOST_AUTH_METHOD=trust",
    "-e",
    "POSTGRES_DB=didar_qa",
    "postgres:17-alpine",
  ]);
  run(names.redis, [
    "--network",
    network,
    "--network-alias",
    "redis",
    ...label,
    "redis:7-alpine",
  ]);
  for (let n = 0; n < 60; n++) {
    try {
      docker([
        "exec",
        names.pg,
        "pg_isready",
        "-U",
        "postgres",
        "-d",
        "didar_qa",
      ]);
      break;
    } catch {
      if (n === 59) throw new Error("QA PostgreSQL not ready");
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  docker(
    [
      "run",
      "--rm",
      ...common,
      "--workdir",
      "/app/packages/api",
      "node:24-bookworm-slim",
      "node",
      "-e",
      "const{Pool}=require('pg');const p=new Pool({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:10000});p.query('SELECT 1').then(()=>{console.log('Private container PostgreSQL connection passed');return p.end()}).catch(e=>{console.error(e.code||'DB_PROBE_ERROR');process.exit(1)})",
    ],
    { record: true },
  );
  console.log(
    "Container smoke: additive migrations and synthetic seed in separate private QA PostgreSQL.",
  );
  for (const args of [["db:migrate"], ["exec", "./src/scripts/didar-seed.ts"]])
    docker(
      [
        "run",
        "--rm",
        ...common,
        "-e",
        "NODE_ENV=development",
        "--workdir",
        "/app/packages/api",
        "node:24-bookworm-slim",
        "node",
        cli,
        ...args,
      ],
      { record: true },
    );
  run(names.api, [
    ...common,
    "--network-alias",
    "api",
    "-e",
    "NODE_ENV=production",
    "--workdir",
    "/app/packages/api/.medusa/server",
    "-p",
    "127.0.0.1::9000",
    "node:24-bookworm-slim",
    "node",
    cli,
    "start",
    "--host",
    "0.0.0.0",
    "--port",
    "9000",
  ]);
  const port = (name, internal) => {
    const b = inspect(name).NetworkSettings.Ports[internal + "/tcp"];
    if (!b?.length || b.some((x) => x.HostIp !== "127.0.0.1"))
      throw new Error("Application port is not loopback-only");
    return b[0].HostPort;
  };
  await wait(
    "http://127.0.0.1:" + port(names.api, 9000) + "/health",
    async (r) => (await r.text()) === "OK",
  );
  const standalone = resolve(
    "apps/storefront/.next/standalone/apps/storefront",
  );
  cpSync("apps/storefront/.next/static", standalone + "/.next/static", {
    recursive: true,
  });
  cpSync("apps/storefront/public", standalone + "/public", { recursive: true });
  run(names.web, [
    ...common,
    "-e",
    "NODE_ENV=production",
    "-e",
    "HOSTNAME=0.0.0.0",
    "-e",
    "PORT=3000",
    "-e",
    "MEDUSA_BACKEND_URL=http://api:9000",
    "--workdir",
    "/app",
    "-p",
    "127.0.0.1::3000",
    "node:24-bookworm-slim",
    "node",
    "apps/storefront/.next/standalone/apps/storefront/server.js",
  ]);
  const origin = "http://127.0.0.1:" + port(names.web, 3000);
  await wait(origin + "/api/didar/catalog", async (r) =>
    Array.isArray((await r.json()).products),
  );
  const response = await fetch(origin + "/api/didar/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "admin@didar.test",
        password: "DidarDemo2026!",
      }),
    }),
    login = await response.json();
  if (!response.ok || !login.token)
    throw new Error("Container sandbox authentication failed");
  for (const action of [
    "finance",
    "treasury",
    "ledger",
    "wallet",
    "tahesab",
    "acceptance",
  ]) {
    const r = await fetch(origin + "/api/didar/" + action, {
        headers: { authorization: "Bearer " + login.token },
      }),
      body = await r.json();
    if (!r.ok || (action === "acceptance" && !body.technical_pass))
      throw new Error("Container financial API failed: " + action);
  }
  for (const [name, portNo] of [
    [names.pg, 5432],
    [names.redis, 6379],
  ])
    if (inspect(name).NetworkSettings.Ports[portNo + "/tcp"]?.length)
      throw new Error("Private data service unexpectedly published");
  for (const name of [names.api, names.web])
    if (!inspect(name).HostConfig.ReadonlyRootfs)
      throw new Error("Application root filesystem not read-only");
  console.log(
    "PASS: PostgreSQL/Redis private; compiled API + Next proxy + all six finance APIs healthy; application roots read-only; app ports loopback-only. Current prepared artifacts mounted read-only. No image build or native ARM/Mac claim.",
  );
} finally {
  for (const name of created.reverse()) {
    try {
      docker(["logs", name], { record: true });
    } catch {}
    try {
      docker(["rm", "-fv", name]);
    } catch {}
  }
  try {
    docker(["network", "rm", network]);
  } catch {}
}
