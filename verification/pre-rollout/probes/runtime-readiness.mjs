// Disposable release probe: never targets an existing database, server or volume.
import {
  cpSync,
  mkdtempSync,
  rmSync,
  openSync,
  closeSync,
  readFileSync,
  symlinkSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { randomBytes, createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  prerequisites,
  freePort,
  run,
  waitHTTP,
  managedProcesses,
} from "../../../scripts/local/runtime.mjs";
import { verifyBuild } from "../../../scripts/local/build-receipt.mjs";
const root = fileURLToPath(new URL("../../../", import.meta.url)),
  tag = "didar-qa-runtime-" + Date.now() + "-" + process.pid;
const scratch = mkdtempSync(join(tmpdir(), "didar-release-runtime-"));
const names = [tag + "-source", tag + "-restore", tag + "-redis"],
  created = [];
const processes = managedProcesses();
let api;
const docker = (args, input) => {
  const r = spawnSync("docker", args, {
    encoding: "utf8",
    input,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.status !== 0)
    throw Error(
      "Owned runtime Docker " + args[0] + " failed: " + r.stderr.slice(0, 500),
    );
  return r.stdout.trim();
};
const sql = (name, query) =>
  docker(
    [
      "exec",
      "-i",
      name,
      "psql",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "didar_qa",
      "-At",
    ],
    query,
  );
async function pgReady(name) {
  for (let n = 0; n < 80; n++) {
    try {
      docker(["exec", name, "pg_isready", "-U", "postgres", "-d", "didar_qa"]);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  throw Error("PG not ready");
}
async function stopAPI() {
  if (!api) return;
  const a = api;
  api = undefined;
  try {
    process.kill(-a.pid, "SIGTERM");
  } catch {}
  await new Promise((r) => {
    if (a.exitCode !== null || a.signalCode !== null) return r();
    const t = setTimeout(() => {
      try {
        process.kill(-a.pid, "SIGKILL");
      } catch {}
      r();
    }, 8000);
    a.once("exit", () => {
      clearTimeout(t);
      r();
    });
  });
}
let baseEnv;
function snapshot(name) {
  const tables = sql(
    name,
    "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'didar_%' ORDER BY tablename",
  ).split("\n");
  const out = {};
  for (const table of tables)
    out[table] = JSON.parse(
      sql(
        name,
        `SELECT json_build_object('count',count(*),'hash',md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]'))) FROM "${table}" t`,
      ),
    );
  return out;
}
function equal(a, b, label) {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    const changed = Object.keys(a).filter(
      (k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]),
    );
    throw Error(label + " changed tables " + changed.join(","));
  }
}
async function startAPI(artifact, env) {
  const fd = openSync(
    scratch +
      "/" +
      (artifact.endsWith("restored") ? "restored" : "source") +
      "-api.log",
    "a",
    0o600,
  );
  api = processes.start(
    "node",
    [
      resolve(root, "packages/api/node_modules/@medusajs/cli/cli.js"),
      "start",
      "--host",
      "127.0.0.1",
      "--port",
      String(new URL(env.TEST_API_URL).port),
    ],
    {
      cwd: artifact,
      env: { ...env, NODE_ENV: "production" },
      stdio: ["ignore", fd, fd],
    },
  );
  closeSync(fd);
  await waitHTTP(
    env.TEST_API_URL + "/health",
    async (r) => (await r.text()) === "OK",
  );
}
async function assets(origin) {
  for (const panel of ["dashboard", "seller"]) {
    const r = await fetch(origin + "/" + panel + "/");
    if (!r.ok) throw Error(panel + " HTML " + r.status);
    const html = await r.text();
    const entries = [
      ...html.matchAll(/(?:src|href)="([^\"]+\.(?:js|css))"/g),
    ].map((x) => x[1]);
    if (!entries.length) throw Error(panel + " has no native entry assets");
    for (const uri of entries) {
      const u = new URL(uri, origin + "/" + panel + "/");
      if (u.origin !== origin) throw Error(panel + " asset escaped API origin");
      const a = await fetch(u);
      if (!a.ok) throw Error(panel + " asset " + a.status);
      if (!/javascript|css/.test(a.headers.get("content-type") || ""))
        throw Error("Wrong asset MIME");
    }
  }
}
let cleanupPromise;
function cleanup() {
  return (cleanupPromise ??= (async () => {
    await stopAPI();
    await processes.close();
    try {
      for (const name of created.reverse()) {
        const inspected = JSON.parse(docker(["inspect", name]))[0];
        if (inspected.Config.Labels?.["didar.disposable-qa"] !== "true")
          throw Error("Refusing unowned cleanup");
        docker(["rm", "-fv", name]);
      }
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  })());
}
const onSignal = async () => {
  await cleanup();
  process.exit(130);
};
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"])
  process.once(signal, onSignal);
try {
  process.chdir(root);
  prerequisites();
  verifyBuild(root);
  const [pgPort, restoredPort, redisPort, apiPort] = await Promise.all([
    freePort(),
    freePort(),
    freePort(),
    freePort(),
  ]);
  for (const [i, port] of [
    [0, pgPort],
    [1, restoredPort],
  ]) {
    docker([
      "run",
      "-d",
      "--name",
      names[i],
      "--label",
      "didar.disposable-qa=true",
      "-p",
      `127.0.0.1:${port}:5432`,
      "-e",
      "POSTGRES_HOST_AUTH_METHOD=trust",
      "-e",
      "POSTGRES_DB=didar_qa",
      "postgres:17-alpine",
    ]);
    created.push(names[i]);
    await pgReady(names[i]);
  }
  docker([
    "run",
    "-d",
    "--name",
    names[2],
    "--label",
    "didar.disposable-qa=true",
    "-p",
    `127.0.0.1:${redisPort}:6379`,
    "redis:7-alpine",
  ]);
  created.push(names[2]);
  const origin = "http://127.0.0.1:" + apiPort;
  baseEnv = {
    ...process.env,
    DIDAR_DISPOSABLE_QA: "true",
    DIDAR_ENVIRONMENT: "local",
    DIDAR_PAYMENT_MODE: "sandbox",
    DIDAR_SEED_DEMO: "true",
    NODE_ENV: "development",
    DATABASE_URL: `postgres://postgres@127.0.0.1:${pgPort}/didar_qa`,
    REDIS_URL: `redis://127.0.0.1:${redisPort}`,
    JWT_SECRET: randomBytes(32).toString("hex"),
    COOKIE_SECRET: randomBytes(32).toString("hex"),
    STORE_CORS: origin,
    ADMIN_CORS: origin,
    VENDOR_CORS: origin,
    AUTH_CORS: origin,
    FILE_BACKEND_URL: origin + "/static",
    MERCUR_BACKEND_URL: "same-origin",
    MEDUSA_BACKEND_URL: origin,
    TEST_API_URL: origin,
    TEST_STOREFRONT_URL: origin,
    DIDAR_PUBLIC_ORIGIN: "https://shop.didar-gold.ir",
    DIDAR_PUBLIC_ORIGIN_VERIFIED: "true",
    MERCUR_DISABLE_TELEMETRY: "true",
    NEXT_TELEMETRY_DISABLED: "1",
  };
  const source = resolve(scratch, "source"),
    restored = resolve(scratch, "restored");
  cpSync(resolve(root, "packages/api/.medusa/server"), source, {
    recursive: true,
  });
  symlinkSync(
    resolve(root, "packages/api/node_modules"),
    resolve(source, "node_modules"),
    "dir",
  );
  await run("bun", ["run", "db:setup"], { env: baseEnv });
  await run(
    "bun",
    [
      "run",
      "--cwd",
      "packages/api",
      "medusa",
      "exec",
      "./src/scripts/native-qa-seed.ts",
    ],
    { env: baseEnv },
  );
  await startAPI(source, baseEnv);
  await assets(origin);
  await run(
    "bun",
    [
      "test",
      "./tests/finance-integrated.test.ts",
      "--test-name-pattern",
      "one integrated",
    ],
    { env: baseEnv },
  );
  await run("bun", ["test", "./tests/onboarding-media.test.ts"], {
    env: baseEnv,
  });
  // Includes real FFmpeg video bytes and immutable CMS versions/publications.
  // The runner below independently owns process/restart/restore verification.
  await run(
    "bun",
    [
      "test",
      "./tests/content.test.ts",
      "--test-name-pattern",
      "typed blocks|editorial media|all block|immutable versions|merchant A|additive media|central content|CMS upgrades",
    ],
    { env: baseEnv },
  );
  // Use the actual native file provider, not a hand-written persistence sentinel.
  const native = await fetch(origin + "/auth/user/emailpass", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "native-admin@didar.test",
      password: "DidarNative2026!",
    }),
  });
  if (!native.ok) throw Error("Native auth failed");
  const token = (await native.json()).token;
  const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3u8AAAAASUVORK5CYII=",
      "base64",
    ),
    form = new FormData();
  form.append(
    "files",
    new Blob([png], { type: "image/png" }),
    "runtime-proof.png",
  );
  const upload = await fetch(origin + "/admin/uploads", {
    method: "POST",
    headers: { authorization: "Bearer " + token },
    body: form,
  });
  if (!upload.ok) throw Error("Native upload status " + upload.status);
  const uploadData = await upload.json(),
    url = uploadData.files?.[0]?.url;
  if (!url) throw Error("Native upload missing URL");
  const fileURL = new URL(url);
  if (fileURL.origin !== origin) throw Error("Native file origin mismatch");
  const media = await fetch(url);
  if (!media.ok) throw Error("Native media inaccessible");
  const mediaHash = createHash("sha256")
    .update(Buffer.from(await media.arrayBuffer()))
    .digest("hex");
  if (mediaHash !== createHash("sha256").update(png).digest("hex"))
    throw Error("Native upload changed bytes");
  await stopAPI();
  const before = snapshot(names[0]);
  for (let n = 0; n < 2; n++)
    await run(
      "bun",
      [
        "run",
        "--cwd",
        "packages/api",
        "medusa",
        "exec",
        "./src/scripts/didar-seed.ts",
      ],
      { env: { ...baseEnv, DIDAR_SEED_DEMO: "false" } },
    );
  equal(before, snapshot(names[0]), "populated-replay");
  docker(["restart", names[0]]);
  await pgReady(names[0]);
  equal(before, snapshot(names[0]), "postgres-restart");
  const dump = scratch + "/database.dump",
    fd = openSync(dump, "wx", 0o600),
    dumpResult = spawnSync(
      "docker",
      ["exec", names[0], "pg_dump", "-U", "postgres", "-d", "didar_qa", "-Fc"],
      { stdio: ["ignore", fd, "pipe"] },
    );
  closeSync(fd);
  if (dumpResult.status !== 0) throw Error("Backup dump failed");
  const dumpBytes = readFileSync(dump),
    restoreResult = spawnSync(
      "docker",
      [
        "exec",
        "-i",
        names[1],
        "pg_restore",
        "-U",
        "postgres",
        "-d",
        "didar_qa",
        "--exit-on-error",
        "--no-owner",
      ],
      { input: dumpBytes, maxBuffer: 8 * 1024 * 1024 },
    );
  if (restoreResult.status !== 0)
    throw Error(
      "Backup restore failed " + restoreResult.stderr.toString().slice(0, 300),
    );
  equal(before, snapshot(names[1]), "backup-restore");
  cpSync(source, restored, { recursive: true, dereference: false });
  const restoredEnv = {
    ...baseEnv,
    DATABASE_URL: `postgres://postgres@127.0.0.1:${restoredPort}/didar_qa`,
  };
  await startAPI(restored, restoredEnv);
  await assets(origin);
  const restoredMedia = await fetch(url);
  if (
    !restoredMedia.ok ||
    createHash("sha256")
      .update(Buffer.from(await restoredMedia.arrayBuffer()))
      .digest("hex") !== mediaHash
  )
    throw Error("Restored native upload bytes changed");
  const catalog = await fetch(origin + "/didar/catalog");
  if (!catalog.ok) throw Error("Restored catalog failed");
  const reauth = await fetch(origin + "/auth/user/emailpass", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "native-admin@didar.test",
      password: "DidarNative2026!",
    }),
  });
  if (!reauth.ok) throw Error("Restored native auth failed");
  const authToken = (await reauth.json()).token;
  const nativeProducts = await fetch(origin + "/admin/products", {
    headers: { authorization: "Bearer " + authToken },
  });
  if (!nativeProducts.ok) throw Error("Restored native bridge rights failed");
  const counts = Object.fromEntries(
    [
      "didar_product",
      "didar_offer",
      "didar_inventory_item",
      "didar_order",
      "didar_order_line",
      "didar_fin_event",
      "didar_fin_journal",
      "didar_fin_posting",
      "didar_media_asset",
      "didar_media_variant",
      "didar_media_video",
      "didar_content_version",
      "didar_content_publication",
    ]
      .filter((t) => before[t])
      .map((t) => [t, before[t].count]),
  );
  verifyBuild(root);
  console.log(
    "RUNTIME_REPLAY_RESTART_RESTORE_PASS " +
      JSON.stringify({
        didar_tables: Object.keys(before).length,
        counts,
        native_file_bytes_preserved: true,
        native_panels_html_assets: true,
        native_auth_bridge: true,
        source_fingerprint_sha256: createHash("sha256")
          .update(JSON.stringify(before))
          .digest("hex"),
      }),
  );
} finally {
  await cleanup();
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"])
    process.removeListener(signal, onSignal);
}
