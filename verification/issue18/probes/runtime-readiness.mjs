// Independent Issue #18 disposable release probe. No owner host, existing database,
// shared .local runner lock, pre-existing volume or rollout is a target.
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
  tag = "didar-qa-issue18-runtime-" + Date.now() + "-" + process.pid;
const scratch = mkdtempSync(join(tmpdir(), "didar-issue18-runtime-"));
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
function sequenceSnapshot(name) {
  return JSON.parse(sql(name, "SELECT coalesce(json_object_agg(sequencename, json_build_object('last_value',last_value,'increment_by',increment_by,'cycle',cycle) ORDER BY sequencename),'{}'::json) FROM pg_sequences WHERE schemaname='public' AND sequencename LIKE 'didar_%'"));
}
function projectionConsistency(name) {
  const state = JSON.parse(sql(name, "SELECT json_build_object('tracked',count(*),'non_done',count(*) FILTER(WHERE j.status<>'DONE'),'ack_mismatch',count(*) FILTER(WHERE s.projected_revision<>s.source_revision OR p.id IS NULL OR p.metadata->>'didar_projection_revision' IS DISTINCT FROM s.source_revision::text)) FROM didar_product_projection s JOIN didar_product_projection_job j ON j.product_id=s.product_id AND j.revision=s.source_revision LEFT JOIN didar_product d ON d.id=s.product_id LEFT JOIN product p ON p.id=d.native_id"));
  if (!state.tracked || state.non_done || state.ack_mismatch)
    throw Error("Native projection acknowledgement is not quiescent/matched");
  return state;
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
  const inputReceipt = JSON.parse(readFileSync(resolve(root, ".local/build-receipt.json"), "utf8"));
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
    DIDAR_AGENCY_MODE: "sandbox",
    DIDAR_PROJECTION_RECONCILE_ID: "",
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
  // A real clean migration is run BEFORE enabling any explicit QA/demo fixtures.
  // New role tables are discovered as well as named: adding an unnoticed approval
  // or posting through non-demo installation must fail this independent probe.
  await run("bun", ["run", "db:setup"], {
    env: { ...baseEnv, DIDAR_SEED_DEMO: "false", DIDAR_AGENCY_MODE: "" },
  });
  const emptyTables = sql(names[0],
    "SELECT tablename FROM pg_tables WHERE schemaname='public' AND (tablename IN ('didar_user','didar_supplier','didar_product','didar_offer','didar_inventory_item','didar_order','didar_order_line','didar_fin_event','didar_fin_journal','didar_fin_posting','didar_fin_contract','didar_fin_contract_review','seller','member','didar_native_actor','didar_native_seller','didar_native_acl') OR tablename LIKE 'didar_sale_%' OR tablename LIKE 'didar_curation_%' OR tablename LIKE 'didar_%outbox%' OR tablename LIKE 'didar_%projection%') ORDER BY tablename"
  ).split("\n").filter(Boolean);
  const emptyCounts = Object.fromEntries(emptyTables.map(table => [table, Number(sql(names[0], `SELECT count(*) FROM "${table}"`))]));
  if (Object.values(emptyCounts).some(count => count !== 0))
    throw Error("Fresh no-demo migration created identities, commerce or role/projection records");
  for (const required of ["didar_sale_mandate", "didar_sale_role", "didar_sale_document"])
    if (!Object.hasOwn(emptyCounts, required)) throw Error("Issue18 migration missing " + required);
  console.log("ISSUE18_FRESH_NO_DEMO_ZERO_PASS " + JSON.stringify(emptyCounts));
  await run("bun", ["run", "--cwd", "packages/api", "medusa", "exec", "./src/scripts/didar-seed.ts"], { env: baseEnv });
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
  // Separate independent execution of the implemented real HTTP/PostgreSQL
  // scenarios, followed by independent whole-database replay/restore equality.
  await run("bun", ["test", "./tests/agency-allocation.test.ts", "./tests/issue18-acceptance.test.ts"], { env: baseEnv });
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
  // The independent agency reviewer deliberately removes synthetic bridges on
  // cleanup. Restore the QA Admin bridge only through the real dual-proof API.
  const proofResponse = await fetch(origin + "/didar/login", {
    method: "POST", headers: {"content-type":"application/json"},
    body: JSON.stringify({email:"admin@didar.test",password:"DidarDemo2026!"}),
  });
  if (!proofResponse.ok) throw Error("Native restore proof canonical sign-in failed");
  const didarProof = (await proofResponse.json()).token;
  const connect = await fetch(origin + "/admin/didar/connect", {
    method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+token},
    body:JSON.stringify({didar_token:didarProof}),
  });
  if (!connect.ok) throw Error("Native runtime dual proof failed");
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
  // Drain committed revisions through the supported operator worker before
  // taking a stable restore fingerprint. No row is forged into DONE by SQL.
  for (let batch = 0; batch < 10; batch++) {
    const remaining = Number(sql(names[0], "SELECT count(*) FROM didar_product_projection s JOIN didar_product_projection_job j ON j.product_id=s.product_id AND j.revision=s.source_revision WHERE j.status<>'DONE'"));
    if (!remaining) break;
    await run("bun", ["run", "--cwd", "packages/api", "medusa", "exec", "./src/scripts/didar-product-projection.ts"], { env: baseEnv });
  }
  if (Number(sql(names[0], "SELECT count(*) FROM didar_product_projection s JOIN didar_product_projection_job j ON j.product_id=s.product_id AND j.revision=s.source_revision WHERE j.status<>'DONE'")))
    throw Error("Latest projection revisions did not converge before restore fingerprint");
  const sourceProjection = projectionConsistency(names[0]);
  const before = snapshot(names[0]);
  const sequencesBefore = sequenceSnapshot(names[0]);
  for (const required of ["didar_sale_mandate", "didar_sale_role", "didar_sale_document", "didar_inventory_item", "didar_fin_posting", "didar_media_video", "didar_product_projection", "didar_product_projection_job"])
    if (!before[required]?.count) throw Error("Populated runtime fixture missing " + required);
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
  equal(sequencesBefore, sequenceSnapshot(names[0]), "populated-sequence-replay");
  docker(["restart", names[2]]);
  for (let attempt = 0; ; attempt++) {
    try {
      if (docker(["exec", names[2], "redis-cli", "ping"]) === "PONG") break;
    } catch {}
    if (attempt >= 79) throw Error("Owned Redis restart not ready");
    await new Promise(r => setTimeout(r, 400));
  }
  docker(["restart", names[0]]);
  await pgReady(names[0]);
  equal(before, snapshot(names[0]), "postgres-restart");
  equal(sequencesBefore, sequenceSnapshot(names[0]), "postgres-sequence-restart");
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
  equal(sequencesBefore, sequenceSnapshot(names[1]), "backup-sequence-restore");
  equal(sourceProjection, projectionConsistency(names[1]), "backup-native-ack-restore");
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
      "didar_sale_mandate",
      "didar_sale_mandate_review",
      "didar_sale_mandate_revocation",
      "didar_sale_role",
      "didar_sale_document",
      "didar_product_projection",
      "didar_product_projection_job",
    ]
      .filter((t) => before[t])
      .map((t) => [t, before[t].count]),
  );
  verifyBuild(root);
  const finalReceipt = JSON.parse(readFileSync(resolve(root, ".local/build-receipt.json"), "utf8"));
  equal(inputReceipt, finalReceipt, "source-artifact-receipt-during-runtime");
  console.log(
    "ISSUE18_RUNTIME_REPLAY_RESTART_RESTORE_PASS " +
      JSON.stringify({
        didar_tables: Object.keys(before).length,
        counts,
        native_file_bytes_preserved: true,
        native_panels_html_assets: true,
        native_auth_bridge: true,
        redis_process_restart: true,
        invoice_sequence_state_preserved: true,
        projection_acknowledgements: sourceProjection,
        build_receipt: inputReceipt,
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
