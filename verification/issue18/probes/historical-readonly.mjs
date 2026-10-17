// Independently applies the CURRENT ordered SQL installer only to a labelled
// private clone. Original historical volumes are mounted read-only, never run.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../../", import.meta.url));
process.chdir(root);
const approvedSources = ["didar-gold_postgres", "c44acbdbadf65556dc770d321e8b3a88329b523543c53ba374925a9a06687fa4"];
const source = process.argv[2];
if (!approvedSources.includes(source)) throw Error("Explicit known read-only historical source required");
const tag = `didar-qa-issue18-history-${Date.now()}-${process.pid}`, volume = `${tag}-data`;
let madeVolume = false, madeContainer = false, role = "didar";
function docker(args, input) {
  const r = spawnSync("docker", args, { input, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  if (r.status !== 0) throw Error(`Owned historical clone ${args[0]} failed: ${String(r.stderr).slice(0, 300)}`);
  return r.stdout.trim();
}
const sql = query => docker(["exec", "-i", tag, "psql", "-v", "ON_ERROR_STOP=1", "-U", role, "-d", "didar", "-At"], query);
let oldColumns;
function fingerprint() {
  return Object.fromEntries(Object.entries(oldColumns).map(([table, columns]) => [table, JSON.parse(sql(
    `SELECT json_build_object('count',count(*),'hash',md5(coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text)::text,'[]'))) FROM (SELECT ${columns.map(c => `"${c}"`).join(",")} FROM "${table}") x`
  ))]));
}
try {
  // Refuse cloning a source currently mounted by a running service.
  const running = docker(["ps", "-q"]).split("\n").filter(Boolean);
  for (const id of running) {
    const mounts = JSON.parse(docker(["inspect", "--format", "{{json .Mounts}}", id]));
    if (mounts.some(m => m.Name === source)) throw Error("Historical source has a running writer; refusing audit");
  }
  docker(["volume", "inspect", source]);
  docker(["volume", "create", "--label", "didar.disposable-qa=true", volume]); madeVolume = true;
  docker(["run", "--rm", "--network", "none", "--user", "root", "-v", `${source}:/source:ro`, "-v", `${volume}:/copy`, "postgres:17-alpine", "sh", "-c", "cp -a /source/. /copy/"]);
  docker(["run", "-d", "--network", "none", "--name", tag, "--label", "didar.disposable-qa=true", "-v", `${volume}:/var/lib/postgresql/data`, "postgres:17-alpine"]); madeContainer = true;
  for (let n = 0; ; n++) {
    try { docker(["exec", tag, "pg_isready"]); break; }
    catch { if (n >= 80) throw Error("Clone PostgreSQL not ready"); await new Promise(r => setTimeout(r, 400)); }
  }
  try { sql("SELECT 1"); } catch { role = "postgres"; sql("SELECT 1"); }
  oldColumns = JSON.parse(sql("SELECT json_object_agg(tablename,cols ORDER BY tablename) FROM (SELECT table_name tablename,json_agg(column_name ORDER BY ordinal_position) cols FROM information_schema.columns WHERE table_schema='public' AND table_name LIKE 'didar_%' AND table_name IN (SELECT tablename FROM pg_tables WHERE schemaname='public') GROUP BY table_name) c"));
  const before = fingerprint();
  const uidTableExisted = Object.hasOwn(oldColumns, "didar_inventory_item");
  const installer = readFileSync("packages/api/src/scripts/didar-seed.ts", "utf8");
  const schemas = [...installer.matchAll(/"(?:src\/didar\/)?([a-z0-9-]*schema\.sql)"/g)].map(m => m[1]);
  for (const required of ["agency-schema.sql", "projection-schema.sql"])
    if (!schemas.includes(required)) throw Error("Current installer missing " + required);
  const capturedSchemas = schemas.map(name => [name,readFileSync(`packages/api/src/didar/${name}`, "utf8")]);
  const schemaDigest = createHash("sha256");
  for (const [name,body] of capturedSchemas) schemaDigest.update(name).update("\0").update(body).update("\0");
  for (let replay = 0; replay < 2; replay++)
    for (const [,body] of capturedSchemas) sql(body);
  const after = fingerprint();
  const changed = Object.keys(before).filter(t => JSON.stringify(before[t]) !== JSON.stringify(after[t]));
  if (changed.length) throw Error("Historical original-column fingerprints changed: " + changed.join(","));
  const newCounts = JSON.parse(sql("SELECT json_build_object('mandates',(SELECT count(*) FROM didar_sale_mandate),'roles',(SELECT count(*) FROM didar_sale_role),'documents',(SELECT count(*) FROM didar_sale_document),'projection_sources',(SELECT count(*) FROM didar_product_projection),'projection_jobs',(SELECT count(*) FROM didar_product_projection_job),'native_actors',(SELECT count(*) FROM didar_native_actor),'native_sellers',(SELECT count(*) FROM didar_native_seller))"));
  if (Object.values(newCounts).some(n => n !== 0)) throw Error("Historical migration invented roles, links, documents or projection jobs");
  console.log("ISSUE18_HISTORICAL_READ_ONLY_CLONE_PASS " + JSON.stringify({source, original_tables:Object.keys(before).length, original_columns_preserved:true, uid_table_existed:uidTableExisted, counts:Object.fromEntries(["didar_product","didar_offer","didar_order","didar_order_line"].filter(t => before[t]).map(t => [t,before[t].count])), new_counts:newCounts, schema_replays:2, ordered_schema_sha256:schemaDigest.digest("hex"), fingerprint_sha256:createHash("sha256").update(JSON.stringify(before)).digest("hex")}));
} finally {
  if (madeContainer) {
    if (docker(["inspect", "--format", '{{index .Config.Labels "didar.disposable-qa"}}', tag]) !== "true") throw Error("Unowned clone cleanup refused");
    docker(["rm", "-fv", tag]);
  }
  if (madeVolume) {
    if (docker(["volume", "inspect", "--format", '{{index .Labels "didar.disposable-qa"}}', volume]) !== "true") throw Error("Unowned volume cleanup refused");
    docker(["volume", "rm", volume]);
  }
}
