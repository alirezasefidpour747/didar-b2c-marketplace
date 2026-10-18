// Fresh runner: load only delivered image archives, then reuse the existing
// independent packaged HTTP/browser probes. No source/dependency runtime mounts.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, rm, copyFile, cp } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { loadBundle, checksums, command } from './release.mjs';

const dir = resolve(process.argv[2]);
const sha = process.env.DIDAR_RELEASE_SOURCE;
const manifest = await loadBundle(dir, sha);
const runId = `ci-${process.env.GITHUB_RUN_ID || 'local'}-${randomBytes(6).toString('hex')}`;
const root = await mkdtemp(join(process.env.RUNNER_TEMP || tmpdir(), 'didar-image-qa-'));
const tls = join(root, 'tls'), envFile = join(root, 'qa.env');
await mkdir(tls, { mode: 0o700 });
await mkdir('.local/ci-evidence', { recursive: true });
const owned = [], stages = [];
const protectedIDs = command('docker', ['ps', '-aq', '--no-trunc'], { capture: true }).split('\n').filter(Boolean);
let network, success = false, cleanupOK = true;
function step(name, cmd, args, options = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', stdio: options.capture ? 'pipe' : 'inherit', timeout: 20 * 60 * 1000, ...options });
  stages.push({ stage: name, code: r.status, signal: r.signal, spawn_error: r.error?.code || null });
  if (r.error || r.status !== 0 || r.signal) throw Error(`${name}: exit=${r.status}, signal=${r.signal}`);
  return options.capture ? r.stdout.trim() : '';
}
const docker = args => command('docker', args, { capture: true });
const inspect = id => JSON.parse(docker(['inspect', '--format', '{{json .}}', id]));
async function wait(check, label, ms = 180000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise(r => setTimeout(r, 500));
  }
  throw Error(`Readiness timeout: ${label}`);
}
function create(role, image, args, cmd = []) {
  const name = `didar-${runId}-${role}`;
  const id = docker(['create', '--name', name, '--label', `didar.ci.run=${runId}`, ...args, image, ...cmd]);
  owned.push({ id, name });
  return id;
}
function exec(name, args) {
  return step(name, 'docker', ['exec', '--env-file', envFile, '-w', '/app', api, ...args]);
}
let api, frontend, env;
try {
  step('qa-certificate', 'openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(tls, 'key.pem'), '-out', join(tls, 'cert.pem'), '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1', '-addext', 'basicConstraints=critical,CA:TRUE']);
  network = docker(['network', 'create', '--label', `didar.ci.run=${runId}`, `didar-${runId}`]);
  const pg = create('postgres', 'postgres:17-alpine', ['--network', network, '--network-alias', 'pg', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', '-e', 'POSTGRES_DB=didar_qa']);
  const redis = create('redis', 'redis:7-alpine', ['--network', network, '--network-alias', 'redis']);
  step('start-postgres', 'docker', ['start', pg]);
  step('start-redis', 'docker', ['start', redis]);
  await wait(() => spawnSync('docker', ['exec', pg, 'pg_isready', '-U', 'postgres', '-d', 'didar_qa'], { stdio: 'ignore' }).status === 0, 'PostgreSQL');
  env = {
    DIDAR_DISPOSABLE_QA: 'true', DIDAR_ENVIRONMENT: 'local', DIDAR_PAYMENT_MODE: 'sandbox', DIDAR_AGENCY_MODE: 'sandbox', DIDAR_SEED_DEMO: 'true',
    DATABASE_URL: 'postgres://postgres@pg:5432/didar_qa?sslmode=disable', REDIS_URL: 'redis://redis:6379',
    JWT_SECRET: randomBytes(32).toString('hex'), COOKIE_SECRET: randomBytes(32).toString('hex'), DIDAR_AUTH_NETWORK_KEY: randomBytes(32).toString('hex'), DIDAR_AUTH_PROXY_PEERS: '127.0.0.1',
    STORE_CORS: 'https://localhost:3000', ADMIN_CORS: 'http://localhost:9000', VENDOR_CORS: 'http://localhost:9000', AUTH_CORS: 'https://localhost:3000,http://localhost:9000',
    FILE_BACKEND_URL: 'http://localhost:9000/static', DIDAR_PUBLIC_ORIGIN: 'https://shop.didar-gold.ir', DIDAR_PUBLIC_ORIGIN_VERIFIED: 'true',
    MERCUR_DISABLE_TELEMETRY: 'true', NEXT_TELEMETRY_DISABLED: '1', MEDUSA_BACKEND_URL: 'http://127.0.0.1:9000',
    DIDAR_AUTH_INGRESS_HOST: '0.0.0.0', DIDAR_AUTH_INGRESS_PORT: '3000', DIDAR_PRIVATE_NEXT_PORT: '3001',
    DIDAR_AUTH_INGRESS_TLS_CERT_FILE: '/run/didar-tls/cert.pem', DIDAR_AUTH_INGRESS_TLS_KEY_FILE: '/run/didar-tls/key.pem', DIDAR_AUTH_HEALTH_SERVER_NAME: 'localhost', NODE_EXTRA_CA_CERTS: '/run/didar-tls/cert.pem',
    NODE_ENV: 'production', TEST_API_URL: 'http://127.0.0.1:9000', TEST_AUTH_INGRESS_URL: 'https://127.0.0.1:3000', TEST_STOREFRONT_URL: 'https://127.0.0.1:3000', TEST_PRIVATE_STOREFRONT_URL: 'http://127.0.0.1:3001',
    AUTH_PACKAGE_ROOT: '/app', AUTH_PACKAGE_PROBE: 'true', AUTH_REVIEW_RUN_ID: runId, AUTH_REVIEW_SCRATCH: '/tmp/didar-ci-probe', NO_PROXY: 'localhost,127.0.0.1,::1,pg,redis',
  };
  const saveEnv = async () => writeFile(envFile, Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\n') + '\n', { mode: 0o600 });
  // Only the disposable image-contained seed sees development mode and demo fixtures.
  env.NODE_ENV = 'development'; await saveEnv();
  for (const [name, args] of [['schema', ['bun', 'run', 'db:setup']], ['native-seed', ['bun', 'run', '--cwd', 'packages/api', 'medusa', 'exec', './src/scripts/native-qa-seed.ts']]]) {
    const id = create(name, manifest.images.api.id, ['--network', network, '--env-file', envFile], args);
    step(name, 'docker', ['start', '-a', id]);
    assert.equal(inspect(id).State.ExitCode, 0);
  }
  env.NODE_ENV = 'production'; await saveEnv();
  const mount = `type=bind,src=${tls},dst=/run/didar-tls,readonly`;
  api = create('api', manifest.images.api.id, ['--network', network, '--env-file', envFile, '--mount', mount, '-p', '127.0.0.1::9000', '-p', '127.0.0.1::3000']);
  step('start-api', 'docker', ['start', api]);
  const ports = inspect(api).NetworkSettings.Ports;
  assert.ok(!ports['3001/tcp']);
  for (const key of ['9000/tcp', '3000/tcp']) assert.ok(ports[key].every(p => p.HostIp === '127.0.0.1'));
  const apiOrigin = `http://127.0.0.1:${ports['9000/tcp'][0].HostPort}`;
  const webOrigin = `https://127.0.0.1:${ports['3000/tcp'][0].HostPort}`;
  const apiReady = () => wait(async () => { try { return (await fetch(apiOrigin + '/health', { signal: AbortSignal.timeout(5000) })).status === 200; } catch { return false; } }, 'API');
  await apiReady();
  frontend = create('storefront', manifest.images.storefront.id, ['--network', `container:${api}`, '--env-file', envFile, '--mount', mount]);
  const frontReady = () => wait(() => {
    assert.equal(inspect(frontend).State.Running, true, 'Packaged frontend exited');
    return spawnSync('docker', ['exec', frontend, 'node', 'runtime/health.mjs'], { stdio: 'ignore', timeout: 12000 }).status === 0;
  }, 'TLS ingress and private Next');
  step('start-storefront', 'docker', ['start', frontend]); await frontReady();
  for (const id of [api, frontend]) assert.ok(inspect(id).Mounts.every(m => m.Type === 'bind' && m.Destination === '/run/didar-tls' && m.Source === tls && m.RW === false));
  const packaged = JSON.parse(docker(['exec', frontend, 'node', '-e', 'process.stdout.write(JSON.stringify(require("./PACKAGING.json")))']));
  assert.equal(packaged.source_sha, sha);
  exec('unsigned-private-auth-denied', ['node', '-e', "fetch('http://127.0.0.1:3001/api/didar/login',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}).then(r=>{if(r.status!==403)process.exit(1)})"]);
  exec('persistent-auth-and-product-regressions', ['bun', 'test', 'tests/auth-hardening.test.ts', 'tests/native-product-targets.test.ts']);
  // Existing independent probe fixture boundary: operational auth rows only, in
  // this newly owned QA DB. Never between its before/after persistence phases.
  step('reset-disposable-probe-counters', 'docker', ['exec', pg, 'psql', '-U', 'postgres', '-d', 'didar_qa', '-v', 'ON_ERROR_STOP=1', '-c', 'DELETE FROM didar_login_attempt']);
  exec('prepare-independent-tools', ['mkdir', '-p', '/tmp/didar-ci-probe/.local']);
  for (const file of ['common.mjs', 'http.mjs', 'probe.mjs']) step('copy-independent-' + file, 'docker', ['cp', `verification/auth-packaging/reviewer/${file}`, api + ':/tmp/didar-ci-probe/' + file]);
  exec('independent-http-before-restart', ['node', '/tmp/didar-ci-probe/probe.mjs', 'before-restart', '/tmp/didar-ci-probe']);
  step('stop-storefront', 'docker', ['stop', '--time', '25', frontend]);
  step('real-api-restart', 'docker', ['restart', '--time', '25', api]); await apiReady();
  step('restart-storefront', 'docker', ['start', frontend]); await frontReady();
  exec('independent-http-after-restart', ['node', '/tmp/didar-ci-probe/probe.mjs', 'after-restart', '/tmp/didar-ci-probe']);
  const probeDir = join(root, 'probe'); await mkdir(probeDir);
  step('copy-independent-evidence', 'docker', ['cp', api + ':/tmp/didar-ci-probe/.', probeDir]);
  const before = JSON.parse(await readFile(join(probeDir, 'http-before-results.json'))), after = JSON.parse(await readFile(join(probeDir, 'http-after-results.json')));
  assert.equal(before.status, 'PASS'); assert.equal(after.status, 'PASS');
  assert.equal(before.cases, 19); assert.equal(after.cases, 4);
  const fixture = JSON.parse(await readFile(join(probeDir, 'browser-fixture.json')));
  await writeFile(join(probeDir, 'browser-fixture.json'), JSON.stringify({ ...fixture, root: process.cwd(), api: apiOrigin, web: webOrigin }));
  step('independent-native-customer-browsers', 'node', ['verification/auth-packaging/reviewer/browser.mjs', probeDir]);
  const browser = JSON.parse(await readFile(join(probeDir, 'browser-verdict.json')));
  assert.equal(browser.status, 'PASS'); assert.equal(browser.journeys, 3);
  // These reviewer receipts contain sanitized responses, not fixture tokens or keys.
  for (const name of ['http-before-results.json', 'http-after-results.json', 'browser-verdict.json']) await copyFile(join(probeDir, name), join('.local/ci-evidence', name));
  await cp(join(probeDir, 'screenshots'), '.local/ci-evidence/screenshots', { recursive: true });
  manifest.verification.independent_artifacts = { status: 'PASS', fresh: { persistent_suite: 'auth-hardening + native-product-targets', independent_http_cases: before.cases + after.cases, browser_journeys: browser.journeys, stages }, runner: 'Separate fresh GitHub-hosted runner, docker-loaded archives; no application source/dependency mounts', limits: ['QA TLS only', 'Fresh fixture has no populated financial history', 'Existing independent probes reused; not a new human independent review'] };
  success = true;
} finally {
  // Remove only exact resources created here. Preserve every preexisting ID.
  for (const item of owned.reverse()) {
    try {
      const state = inspect(item.id);
      assert.equal(state.Name, '/' + item.name);
      assert.equal(state.Config.Labels['didar.ci.run'], runId);
      const result = spawnSync('docker', ['rm', '-fv', item.id], { stdio: 'ignore', timeout: 60000 });
      if (result.status !== 0) cleanupOK = false;
    } catch { cleanupOK = false; }
  }
  if (network && spawnSync('docker', ['network', 'rm', network], { stdio: 'ignore', timeout: 60000 }).status !== 0) cleanupOK = false;
  const remaining = docker(['ps', '-aq', '--no-trunc']).split('\n');
  if (!protectedIDs.every(id => remaining.includes(id))) cleanupOK = false;
  await rm(root, { recursive: true, force: true }); // Exact newly owned ephemeral TLS/QA files.
  await writeFile('.local/ci-evidence/image-verification.json', JSON.stringify({ status: success && cleanupOK ? 'PASS' : 'FAIL', source_sha: sha, stages, cleanup: cleanupOK ? 'PASS' : 'FAIL' }, null, 2) + '\n');
  if (!cleanupOK) throw Error('Owned resource cleanup/preservation failed');
}
if (!success) throw Error('Independent image verification failed');
await writeFile(join(dir, 'release-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
await checksums(dir);
