// Disposable artifact-based topology. Never connects to the owner server and
// never builds/publishes a replacement release. All Docker mutations are bound
// to exact freshly-created IDs and ownership labels.
import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import { mkdir, mkdtemp, readFile, writeFile, rm, access } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
import { createServer, isIP } from 'node:net'
import { observer } from './process.mjs'
import { render } from '../deployment/nginx/render.mjs'

const input = JSON.parse(await readFile(resolve(process.argv[2]), 'utf8'))
for (const key of ['source_sha', 'api_image', 'frontend_base_image', 'postgres_image', 'redis_image', 'nginx_image', 'portable_frontend', 'repository', 'output_dir']) if (!input[key]) throw Error('Explicit runtime input required: ' + key)
if (!/^[a-f0-9]{40}$/.test(input.source_sha)) throw Error('Exact candidate revision required')
const output = resolve(input.output_dir), repo = resolve(input.repository), runId = 'topology-' + Date.now() + '-' + randomBytes(4).toString('hex')
await mkdir(output, { recursive: true })
const harnessDirectory = join(output, 'harness-source')
await mkdir(harnessDirectory)
const harnessHashes = []
for (const name of ['stack.mjs', 'application.mjs', 'process.mjs', 'lifecycle.mjs', 'origin.mjs']) {
  const bytes = await readFile(new URL('./' + name, import.meta.url))
  await writeFile(join(harnessDirectory, name), bytes, { flag: 'wx' })
  harnessHashes.push({ path: 'scripts/topology/' + name, sha256: createHash('sha256').update(bytes).digest('hex') })
}
await writeFile(join(harnessDirectory, 'SHA256.json'), JSON.stringify(harnessHashes, null, 2) + '\n')
const stages = [], command = observer(output, stages), owned = [], labelName = 'didar.topology.run'
const docker = async (name, args, options) => (await command(name, 'docker', args, options)).stdout.toString('utf8').trim()
const inspect = async (id, name) => JSON.parse(await docker(name, ['inspect', '--format', '{{json .}}', id]))
const root = await mkdtemp(join(tmpdir(), 'didar-topology-'))
const tls = join(root, 'tls'), edgeFiles = join(root, 'edge'), signer = join(edgeFiles, 'signer'), config = join(edgeFiles, 'config')
await mkdir(tls, { recursive: true, mode: 0o700 }); await mkdir(signer, { recursive: true })
const envFile = join(root, 'qa.env'), edgeEnvFile = join(root, 'edge.env'), keyFile = join(root, 'network.key'), key = randomBytes(32).toString('hex')
await writeFile(keyFile, key, { mode: 0o600 })
await writeFile(edgeEnvFile, 'DIDAR_AUTH_NETWORK_KEY=' + key + '\n', { mode: 0o600 })
const protectedIds = (await docker('protected-before', ['ps', '-aq', '--no-trunc'])).split('\n').filter(Boolean)
let network, uploadVolume, api, frontend, edge, pg, redis, success = false, cleanup = true
const verificationOutcomes = {}
const ip = state => state.NetworkSettings.Networks[Object.keys(state.NetworkSettings.Networks)[0]].IPAddress
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
async function create(role, image, args, cmd) {
  const name = 'didar-' + runId + '-' + role
  const id = await docker('create-' + role, ['create', '--name', name, '--label', labelName + '=' + runId, ...args, image, ...cmd], { timeout: 600000 })
  owned.push({ id, name, role }); return id
}
async function wait(name, probe, maximum = 180000) {
  const deadline = Date.now() + maximum
  let last
  while (Date.now() < deadline) {
    try { if (await probe()) return } catch (error) { last = error.message }
    await new Promise(done => setTimeout(done, 500))
  }
  throw Error(name + ' readiness timed out: ' + last)
}
async function loopbackPort() {
  const server = createServer()
  await new Promise((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done) })
  const port = server.address().port
  await new Promise((done, reject) => server.close(error => error ? reject(error) : done()))
  return port
}
async function copy(name, from, id, destination) { await docker('copy-' + name, ['cp', from, id + ':' + destination]) }
try {
  const source = await command('candidate-source', 'git', ['-C', repo, 'rev-parse', 'HEAD']); assert.equal(source.stdout.toString().trim(), input.source_sha)
  network = await docker('create-network', ['network', 'create', '--label', labelName + '=' + runId, 'didar-' + runId])
  uploadVolume = await docker('create-disposable-upload-volume', ['volume', 'create', '--label', labelName + '=' + runId, 'didar-' + runId + '-uploads'])
  // Docker may reassign an ephemeral published port after restart. Pin the
  // runner's explicitly reserved loopback ports for the unchanged restart test.
  const pgHostPort = await loopbackPort(), redisHostPort = await loopbackPort()
  pg = await create('postgres', input.postgres_image, ['--network', network, '--network-alias', 'pg', '--label', 'didar.disposable-qa=true', '-p', '127.0.0.1:' + pgHostPort + ':5432', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', '-e', 'POSTGRES_DB=didar_qa'], [])
  redis = await create('redis', input.redis_image, ['--network', network, '--network-alias', 'redis', '-p', '127.0.0.1:' + redisHostPort + ':6379'], [])
  await docker('start-postgres', ['start', pg]); await docker('start-redis', ['start', redis])
  await wait('PostgreSQL', async () => (await command('pg-readiness-' + stages.length, 'docker', ['exec', pg, 'pg_isready', '-U', 'postgres', '-d', 'didar_qa'], { expected: [0, 1, 2] })).code === 0)
  const env = {
    DIDAR_DISPOSABLE_QA: 'true', DIDAR_ENVIRONMENT: 'local', DIDAR_PAYMENT_MODE: 'sandbox', DIDAR_AGENCY_MODE: 'sandbox', DIDAR_SEED_DEMO: 'true', NODE_ENV: 'production',
    DATABASE_URL: 'postgres://postgres@pg:5432/didar_qa?sslmode=disable', REDIS_URL: 'redis://redis:6379',
    JWT_SECRET: randomBytes(32).toString('hex'), COOKIE_SECRET: randomBytes(32).toString('hex'), DIDAR_AUTH_NETWORK_KEY: key,
    DIDAR_AUTH_PROXY_POLICY: 'require-proof', DIDAR_AUTH_PROXY_PEERS: '127.0.0.1',
    MERCUR_DISABLE_TELEMETRY: 'true', NEXT_TELEMETRY_DISABLED: '1', DIDAR_PUBLIC_ORIGIN: 'https://didar.test', DIDAR_PUBLIC_ORIGIN_VERIFIED: 'true',
    DIDAR_AUTH_INGRESS_MODE: 'verified-relay', DIDAR_AUTH_NATIVE_URL: 'http://127.0.0.1:9000', DIDAR_AUTH_INGRESS_HOST: '0.0.0.0', DIDAR_AUTH_INGRESS_PORT: '3000', DIDAR_PRIVATE_NEXT_PORT: '3001',
    DIDAR_AUTH_INGRESS_TLS_CERT_FILE: '/run/didar-tls/cert.pem', DIDAR_AUTH_INGRESS_TLS_KEY_FILE: '/run/didar-tls/key.pem', NODE_EXTRA_CA_CERTS: '/run/didar-tls/cert.pem',
    DIDAR_AUTH_HEALTH_SERVER_NAME: 'didar.test', MEDUSA_BACKEND_URL: 'http://127.0.0.1:9000', NO_PROXY: 'localhost,127.0.0.1,::1,pg,redis', no_proxy: 'localhost,127.0.0.1,::1,pg,redis',
  }
  const saveEnv = () => writeFile(envFile, Object.entries(env).map(([name, value]) => name + '=' + value).join('\n') + '\n', { mode: 0o600 })
  await saveEnv()
  // Both containers start with a gate, obtain actual Docker IPs, then exec their
  // real PID1. No IP is guessed and the exact Nginx peer is frozen before auth.
  edge = await create('nginx', input.nginx_image, ['--network', network, '--env-file', edgeEnvFile, '-p', '127.0.0.1::8443'], ['/bin/sh', '-c', 'trap "exit 0" TERM INT; while [ ! -f /tmp/didar-topology-start ]; do sleep 1 & wait $!; done; exec nginx -c ' + join(config, 'nginx.conf') + ' -g "daemon off;"'])
  await docker('start-nginx-gate', ['start', edge])
  const edgeState = await inspect(edge, 'inspect-nginx'), edgeIp = ip(edgeState), publicMapping = edgeState.NetworkSettings.Ports['8443/tcp']
  assert.equal(publicMapping.length, 1); assert.equal(publicMapping[0].HostIp, '127.0.0.1')
  const publicPort = publicMapping[0].HostPort, origin = 'https://127.0.0.1:' + publicPort
  env.STORE_CORS = origin; env.ADMIN_CORS = origin; env.VENDOR_CORS = origin; env.AUTH_CORS = origin; env.FILE_BACKEND_URL = origin + '/static'
  env.DIDAR_AUTH_INGRESS_PEERS = edgeIp
  await saveEnv()
  api = await create('api', input.api_image, ['--network', network, '--env-file', envFile, '--mount', 'type=volume,source=' + uploadVolume + ',target=/app/packages/api/.medusa/server/static', '-w', '/app/packages/api/.medusa/server'], ['/bin/sh', '-c', 'trap "exit 0" TERM INT; while [ ! -f /tmp/didar-topology-start ]; do sleep 1 & wait $!; done; exec node /app/packages/api/node_modules/@medusajs/cli/cli.js start --host 127.0.0.1 --port 9000'])
  await docker('start-api-gate', ['start', api])
  const apiState = await inspect(api, 'inspect-api'), apiIp = ip(apiState)
  assert.ok(apiIp && edgeIp && apiIp !== edgeIp)
  env.DIDAR_AUTH_INGRESS_PEERS = edgeIp
  env.NO_PROXY += ',' + edgeIp + ',' + apiIp; env.no_proxy = env.NO_PROXY
  await saveEnv()
  await command('qa-certificate', 'openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(tls, 'key.pem'), '-out', join(tls, 'cert.pem'), '-days', '1', '-subj', '/CN=didar.test', '-addext', 'subjectAltName=DNS:didar.test,DNS:localhost,IP:127.0.0.1,IP:' + apiIp + ',IP:' + edgeIp, '-addext', 'basicConstraints=critical,CA:TRUE'])
  // API source + compiled changes only. Every overlay byte is provenance-hashed;
  // the base OCI label remains 874 and is explicitly distinguished from source.
  const patchFiles = input.api_patch_files || ['packages/api/medusa-config.ts', 'packages/api/src/didar/auth-admission.ts', 'packages/api/.medusa/server/medusa-config.js', 'packages/api/.medusa/server/src/didar/auth-admission.js', 'packages/auth-network/index.cjs', 'packages/auth-network/index.d.ts']
  const overlay = []
  for (const path of patchFiles) {
    assert.ok(!path.startsWith('/') && !path.split('/').includes('..'))
    const from = join(repo, path); await access(from)
    await copy('api-patch-' + overlay.length, from, api, '/app/' + path)
    overlay.push({ path, sha256: hash(await readFile(from)) })
  }
  await docker('api-tls-directory', ['exec', api, 'mkdir', '-p', '/run/didar-tls'])
  await copy('api-tls', tls + '/.', api, '/run/didar-tls/')
  for (const name of ['auth.mjs', 'sign.mjs']) await writeFile(join(signer, name), await readFile(join(repo, 'scripts/deployment/nginx', name)))
  render({ NJS_MODULE_FILE: '/usr/lib/nginx/modules/ngx_http_js_module.so', PID_FILE: '/run/didar-topology-nginx.pid', SIGNER_DIRECTORY: signer, RELAY_ADDRESS: apiIp + ':3000', LISTEN_ADDRESS: '0.0.0.0:8443', PUBLIC_HOST: '127.0.0.1', PUBLIC_PORT: publicPort, TLS_CERT_FILE: join(tls, 'cert.pem'), TLS_KEY_FILE: join(tls, 'key.pem'), UPSTREAM_CA_FILE: join(tls, 'cert.pem'), RELAY_TLS_NAME: 'didar.test' }, config)
  await docker('edge-generated-directory', ['exec', edge, 'mkdir', '-p', root])
  await copy('edge-config', edgeFiles, edge, root + '/')
  await copy('edge-tls', tls, edge, root + '/')
  // Production app's initial env was created before edge IP discovery. Medusa
  // strict policy needs only127; frontend receives final edge-specific env now.
  const qaExec = (name, args, extra = []) => docker(name, ['exec', '--env-file', envFile, ...extra, '-w', '/app', api, ...args], { timeout: 1200000 })
  env.NODE_ENV = 'development'; await saveEnv()
  await qaExec('fresh-schema-and-seed', ['bun', 'run', 'db:setup'])
  await qaExec('native-service-seed', ['bun', 'run', '--cwd', 'packages/api', 'medusa', 'exec', './src/scripts/native-qa-seed.ts'])
  await docker('release-api-gate', ['exec', api, 'touch', '/tmp/didar-topology-start'])
  await wait('API', async () => {
    assert.equal((await inspect(api, 'api-running-' + stages.length)).State.Running, true)
    return (await command('api-health-' + stages.length, 'docker', ['exec', api, 'node', '-e', "fetch('http://127.0.0.1:9000/health').then(r=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1))"], { expected: [0, 1] })).code === 0
  })
  env.NODE_ENV = 'production'; await saveEnv()
  frontend = await create('frontend', input.frontend_base_image, ['--network', 'container:' + api, '--env-file', envFile, '-w', '/app'], ['node', 'runtime/storefront.mjs'])
  await copy('portable-frontend', resolve(input.portable_frontend) + '/.', frontend, '/app/')
  await copy('frontend-tls', tls, frontend, '/run/didar-tls')
  await docker('frontend-tls-path', ['start', frontend])
  // A production package must never be hand-edited to bypass PACKAGING checks.
  await wait('frontend TLS relay', async () => {
    const state = await inspect(frontend, 'frontend-running-' + stages.length)
    assert.equal(state.State.Running, true, 'Packaged frontend failed; preserve logs and fix package/config, never its manifest')
    return (await command('frontend-health-' + stages.length, 'docker', ['exec', frontend, 'node', 'runtime/health.mjs'], { expected: [0, 1] })).code === 0
  })
  await docker('release-nginx-gate', ['exec', edge, 'touch', '/tmp/didar-topology-start'])
  const mapping = (await inspect(edge, 'nginx-final-listeners')).NetworkSettings.Ports['8443/tcp']
  assert.equal(mapping.length, 1); assert.equal(mapping[0].HostIp, '127.0.0.1')
  assert.equal(mapping[0].HostPort, publicPort)
  const runtime = { run_id: runId, source_sha: input.source_sha, network, api, frontend, edge, nginx_image: input.nginx_image, ca_file: join(tls, 'cert.pem'), edge_ip: edgeIp, public_host: '127.0.0.1', public_port: Number(publicPort), edge_listen_port: 8443, relay_ip: apiIp, relay_port: 3000, relay_tls_name: 'didar.test', key_file: keyFile, output_dir: join(output, 'application'), owner_label: labelName, lifecycle_output: join(output, 'lifecycle'), nginx_config_file: join(config, 'nginx.conf'), edge_ca_file: join(tls, 'cert.pem'), origin, frontend_manifest_sha256: hash(await readFile(join(input.portable_frontend, 'PACKAGING.json'))), upload_volume: uploadVolume, repository: repo, origin_output: join(output, 'origin') }
  const runtimeFile = join(root, 'runtime.json'); await writeFile(runtimeFile, JSON.stringify(runtime), { mode: 0o600 })
  await writeFile(join(output, 'provenance.json'), JSON.stringify({ source_sha: input.source_sha, api_base_image: input.api_image, api_overlay: overlay, frontend_packaging: JSON.parse(await readFile(join(input.portable_frontend, 'PACKAGING.json'))), nginx_image: input.nginx_image, network: { id: network, api_ip: apiIp, edge_ip: edgeIp }, origin, distinction: 'OCI API base identity is accepted874; candidate application source/compiled overlays are separately hashed, not a published replacement image or release' }, null, 2) + '\n')
  const saveVerificationLog = async (name, result) => {
    let text = Buffer.concat([result.stdout, result.stderr]).toString('utf8')
    const secrets = [...Object.entries(env).filter(([name]) => /SECRET|KEY|PASSWORD/.test(name)).map(([, value]) => value), 'DidarDemo2026!', 'DidarNative2026!', 'TopologyDisposable2026!', 'DisposableWrong2026!']
    for (const value of secrets) if (value) text = text.split(value).join('[REDACTED]')
    text = text.replace(/Bearer [A-Za-z0-9._-]+/g, 'Bearer [REDACTED]').replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[TOKEN_REDACTED]')
    await writeFile(join(output, name + '-output.log'), text)
  }
  const applicationResult = await command('real-application-topology-matrix', process.execPath, [join(repo, 'scripts/topology/application.mjs'), runtimeFile], { timeout: 1200000, expected: [0, 1] })
  verificationOutcomes.application = applicationResult.code; await saveVerificationLog('application', applicationResult)
  const linked = JSON.parse(await qaExec('browser-product-fixture', ['node', '-e', "const{Pool}=require('/app/packages/api/node_modules/pg');const p=new Pool({connectionString:process.env.DATABASE_URL});p.query('SELECT id FROM didar_product ORDER BY id LIMIT 1').then(r=>process.stdout.write(JSON.stringify(r.rows[0]))).finally(()=>p.end())"]))
  const browserDir = join(output, 'browser'); await mkdir(browserDir)
  await writeFile(join(browserDir, 'browser-fixture.json'), JSON.stringify({ run_id: runId, api: origin, web: origin, root: repo, linked_id: linked.id }))
  const browserResult = await command('native-admin-vendor-customer-same-origin-browsers', process.execPath, [join(repo, 'verification/auth-packaging/reviewer/browser.mjs'), browserDir], { timeout: 300000, expected: [0, 1] })
  verificationOutcomes.browser = browserResult.code; await saveVerificationLog('browser', browserResult)
  const originResult = await command('actual-browser-same-origin-media-upload', process.execPath, [join(repo, 'scripts/topology/origin.mjs'), runtimeFile], { timeout: 120000, expected: [0, 1] })
  verificationOutcomes.origin = originResult.code; await saveVerificationLog('origin', originResult)
  // This unchanged suite deliberately restarts its own labelled PostgreSQL and
  // spawns a fresh compiled API on the test host. Keep Docker authority on the
  // runner; never mount its socket or Docker CLI into the application.
  const hostPorts = {}
  for (const [role, id, port] of [['postgres', pg, '5432/tcp'], ['redis', redis, '6379/tcp']]) {
    const state = await inspect(id, 'host-media-' + role + '-mapping')
    assert.equal(state.Config.Labels[labelName], runId)
    const ports = state.NetworkSettings.Ports[port]
    assert.equal(ports.length, 1); assert.equal(ports[0].HostIp, '127.0.0.1')
    hostPorts[role] = ports[0].HostPort
  }
  const mediaEnv = { ...process.env, ...env, DATABASE_URL: 'postgres://postgres@127.0.0.1:' + hostPorts.postgres + '/didar_qa?sslmode=disable', REDIS_URL: 'redis://127.0.0.1:' + hostPorts.redis, TEST_API_URL: origin, NODE_EXTRA_CA_CERTS: join(tls, 'cert.pem') }
  const mediaResult = await command('same-origin-real-media-regressions', 'bun', ['test', join(repo, 'tests/content.test.ts')], { timeout: 1200000, expected: [0, 1], env: mediaEnv })
  verificationOutcomes.media = mediaResult.code
  await saveVerificationLog('media', mediaResult)
  const lifecycleResult = await command('real-lifecycle-compatible-bundle-recovery', process.execPath, [join(repo, 'scripts/topology/lifecycle.mjs'), runtimeFile], { timeout: 300000, expected: [0, 1] })
  verificationOutcomes.lifecycle = lifecycleResult.code; await saveVerificationLog('lifecycle', lifecycleResult)
  {
    assert.equal(verificationOutcomes.lifecycle, 0, 'Force recreation requires completed lifecycle invariants')
    verificationOutcomes.force_recreate = 1
    const recreateOutput = join(output, 'force-recreate');
    await mkdir(recreateOutput, { recursive: true });
    const original = { api, frontend };
    const originalImage = await inspect(api, 'recreate-original-api-image');
    const oldNamespace = await docker('recreate-namespace-before', ['exec', api, 'readlink', '/proc/self/ns/net']);
    const manifestExpected = hash(await readFile(join(input.portable_frontend, 'PACKAGING.json')));
    const mediaPath = '/static/topology-recovery.txt'; // lifecycle created this in owned uploadVolume
    const rootHttp = async (path, { body, headers = {} } = {}) => {
      const script = String.raw`const https=require('node:https'),fs=require('node:fs');let raw='';process.stdin.on('data',x=>raw+=x);process.stdin.on('end',()=>{const x=JSON.parse(raw),req=https.request(x.url,{ca:fs.readFileSync(x.ca),method:x.body?'POST':'GET',headers:{...(x.body?{'content-type':'application/json','content-length':Buffer.byteLength(x.body)}:{}),...x.headers}},res=>{const chunks=[];res.on('data',b=>chunks.push(b));res.on('end',()=>{const b=Buffer.concat(chunks);let json;try{json=JSON.parse(b)}catch{}process.stdout.write(JSON.stringify({status:res.statusCode,json,sha256:require('node:crypto').createHash('sha256').update(b).digest('hex')}))})});req.on('error',e=>{console.error(e.code||'REQUEST_ERROR');process.exitCode=1});req.end(x.body)})`;
      const result = await command('recreate-https-' + Date.now(), process.execPath, ['-e', script], { input: JSON.stringify({ url: origin + path, ca: join(tls, 'cert.pem'), ...(body ? { body: JSON.stringify(body) } : {}), headers }) });
      return JSON.parse(result.stdout);
    };
    // Response tokens stay only in memory. Never persist the rootHttp return value.
    const customer = await rootHttp('/api/didar/login', { body: { email: 'customer@didar.test', password: 'DidarDemo2026!' } });
    assert.equal(customer.status, 200);
    const preservedSession = customer.json.token;
    const staticBefore = await rootHttp(mediaPath); assert.equal(staticBefore.status, 200);
    const snapshot = async () => {
      const script = String.raw`const{Pool}=require('/app/packages/api/node_modules/pg'),c=require('node:crypto'),fs=require('node:fs');const p=new Pool({connectionString:process.env.DATABASE_URL});(async()=>{if(process.env.DIDAR_DISPOSABLE_QA!=='true')throw Error('Disposable required');const names=['didar_product','didar_offer','didar_inventory_item','didar_order','didar_fin_event','didar_fin_posting','didar_user','didar_native_actor','didar_native_seller','didar_media_asset','didar_media_variant','didar_media_video','didar_content_page','didar_content_version','didar_content_publication','didar_login_attempt'];const tables={};for(const name of names){tables[name]=(await p.query("SELECT count(*)::int n,md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]')) h FROM "+name+' t')).rows[0]}const secrets={};for(const name of ['JWT_SECRET','COOKIE_SECRET','DIDAR_AUTH_NETWORK_KEY'])secrets[name]=c.createHash('sha256').update(process.env[name]).digest('hex');process.stdout.write(JSON.stringify({tables,secrets,media:c.createHash('sha256').update(fs.readFileSync('/app/packages/api/.medusa/server/static/topology-recovery.txt')).digest('hex')}))})().finally(()=>p.end())`;
      return JSON.parse(await docker('recreate-state-snapshot-' + Date.now(), ['exec', api, 'node', '-e', script]));
    };
    const before = await snapshot(); // includes nonce/counter rows AFTER the initial login
    const gracefulOldExits = []
    const removeOwned = async (id, role) => {
      const entry = owned.find(item => item.id === id && item.role === role && item.removed !== true);
      assert.ok(entry, 'Only an existing owned registry entry may be removed');
      const state = await inspect(id, 'recreate-guard-' + role);
      assert.equal(state.Name, '/' + entry.name); assert.equal(state.Config.Labels[labelName], runId);
      if (state.State.Running) await docker('recreate-stop-' + role, ['stop', '--time', '25', id]);
      const stopped = await inspect(id, 'recreate-stopped-' + role);
      gracefulOldExits.push({ role, id, exit: stopped.State.ExitCode, oom: stopped.State.OOMKilled }); await writeFile(join(recreateOutput, 'original-process-exits.json'), JSON.stringify(gracefulOldExits, null, 2) + '\n')
      assert.equal(stopped.State.ExitCode, 0); assert.equal(stopped.State.OOMKilled, false);
      await docker('recreate-remove-' + role, ['rm', id]); // never -v; preserve named uploads
      entry.removed = true; // exactly AFTER successful guarded rm
    };
    // Removing the namespace consumer first releases its retained sandbox handle.
    await removeOwned(frontend, 'frontend');
    await removeOwned(api, 'api');
    const closed = await rootHttp('/api/didar/login', { body: { email: 'customer@didar.test', password: 'DidarDemo2026!' } });
    assert.ok([502, 503, 504].includes(closed.status));
    // Inspect the new fixed upstream address; exact trusted sender peers remain
    // Nginx at the relay and127 at the API. No CIDR or trust expansion is used.
    api = await create('api', input.api_image, ['--network', network, '--env-file', envFile, '--mount', 'type=volume,source=' + uploadVolume + ',target=/app/packages/api/.medusa/server/static', '-w', '/app/packages/api/.medusa/server'], ['/bin/sh', '-c', 'trap "exit 0" TERM INT; while [ ! -f /tmp/didar-topology-start ]; do sleep 1 & wait $!; done; exec node /app/packages/api/node_modules/@medusajs/cli/cli.js start --host 127.0.0.1 --port 9000']);
    assert.notEqual(api, original.api);
    await docker('recreate-start-api-gate', ['start', api]);
    const candidate = await inspect(api, 'recreate-observed-exact-peer');
    const newIp = candidate.NetworkSettings.Networks[Object.keys(candidate.NetworkSettings.Networks)[0]].IPAddress;
    assert.equal(isIP(newIp), 4); assert.equal(candidate.Image, originalImage.Image);
    for (const path of patchFiles) await copy('recreate-api-' + path.replaceAll('/', '-'), join(repo, path), api, '/app/' + path);
    await docker('recreate-api-tls-directory', ['exec', api, 'mkdir', '-p', '/run/didar-tls']);
    await copy('recreate-api-tls', tls + '/.', api, '/run/didar-tls/');
    await docker('recreate-api-release-gate', ['exec', api, 'touch', '/tmp/didar-topology-start']);
    await wait('Recreated API', async () => (await command('recreated-api-health-' + Date.now(), 'docker', ['exec', api, 'node', '-e', "fetch('http://127.0.0.1:9000/health').then(r=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1))"], { expected: [0, 1] })).code === 0, 180000);
    const namespace = await docker('recreated-api-namespace', ['exec', api, 'readlink', '/proc/self/ns/net']);
    // A freed Linux namespace inode can be reused across time. Docker sandbox
    // identity, removed old objects and live sharing/isolation are the oracle.
    assert.match(originalImage.NetworkSettings.SandboxID, /^[a-f0-9]{64}$/)
    assert.match(candidate.NetworkSettings.SandboxID, /^[a-f0-9]{64}$/)
    assert.notEqual(candidate.NetworkSettings.SandboxID, originalImage.NetworkSettings.SandboxID)
    assert.ok(candidate.NetworkSettings.SandboxKey && originalImage.NetworkSettings.SandboxKey)
    assert.notEqual(candidate.NetworkSettings.SandboxKey, originalImage.NetworkSettings.SandboxKey)
    for (const [role, id] of Object.entries(original)) {
      const absent = await command('recreated-old-' + role + '-absent', 'docker', ['inspect', id], { expected: [1] })
      assert.ok(absent.stderr.toString().includes('No such object: ' + id) || absent.stderr.toString().includes('No such container: ' + id))
    }
    // Before ANY new login/admission, require exact counter/nonce rows too. Their
    // timestamps may now be older than v1 freshness: do NOT claim a fresh replay.
    assert.deepEqual(await snapshot(), before);
    frontend = await create('frontend', input.frontend_base_image, ['--network', 'container:' + api, '--env-file', envFile, '-w', '/app'], ['node', 'runtime/storefront.mjs']);
    assert.notEqual(frontend, original.frontend);
    await copy('recreate-whole-portable-frontend', resolve(input.portable_frontend) + '/.', frontend, '/app/');
    await copy('recreate-frontend-tls', tls, frontend, '/run/didar-tls');
    await docker('recreate-start-original-supervisor', ['start', frontend]);
    await wait('Recreated packaged frontend', async () => (await command('recreated-frontend-health-' + Date.now(), 'docker', ['exec', frontend, 'node', 'runtime/health.mjs'], { expected: [0, 1] })).code === 0, 180000);
    const frontNamespace = await docker('recreated-frontend-namespace', ['exec', frontend, 'readlink', '/proc/self/ns/net']);
    assert.equal(frontNamespace, namespace);
    const joinedFront = await inspect(frontend, 'recreated-frontend-exact-network-mode')
    assert.equal(joinedFront.HostConfig.NetworkMode, 'container:' + api)
    assert.ok(!joinedFront.HostConfig.PortBindings || Object.keys(joinedFront.HostConfig.PortBindings).length === 0)
    const sharedHealth = Number(await docker('recreated-frontend-loopback-api-health', ['exec', frontend, 'node', '-e', "fetch('http://127.0.0.1:9000/health').then(r=>{process.stdout.write(String(r.status));if(r.status!==200)process.exitCode=1}).catch(()=>process.exitCode=1)"])); assert.equal(sharedHealth, 200)
    const privateAuth = JSON.parse(await docker('recreated-unsigned-private-auth', ['exec', api, 'node', '-e', "const body=JSON.stringify({email:'customer@didar.test',password:'DidarDemo2026!'});Promise.all([9000,3001].map(port=>fetch('http://127.0.0.1:'+port+(port===9000?'/didar/login':'/api/didar/login'),{method:'POST',headers:{'content-type':'application/json'},body}).then(r=>r.status))).then(x=>process.stdout.write(JSON.stringify(x)))"])); assert.deepEqual(privateAuth, [403, 403])
    for (const port of [9000, 3001]) {
      const denied = await command('recreated-bridge-private-port-denied-' + port, 'docker', ['exec', edge, 'curl', '--noproxy', '*', '--silent', '--show-error', '--connect-timeout', '2', '--max-time', '4', 'http://' + newIp + ':' + port + '/health'], { expected: [7] }); assert.equal(denied.code, 7)
    }
    const packageHash = await docker('recreated-package-manifest-hash', ['exec', frontend, 'node', '-e', "process.stdout.write(require('node:crypto').createHash('sha256').update(require('node:fs').readFileSync('PACKAGING.json')).digest('hex'))"]);
    assert.equal(packageHash, manifestExpected);
    const acceptedConfig = await readFile(join(config, 'nginx.conf'), 'utf8')
    const oldUpstream = 'upstream didar_relay { server ' + apiIp + ':3000; }'
    assert.equal(acceptedConfig.split(oldUpstream).length, 2)
    const updatedConfig = acceptedConfig.replace(oldUpstream, 'upstream didar_relay { server ' + newIp + ':3000; }')
    await writeFile(join(config, 'nginx.conf'), updatedConfig, { mode: 0o600 })
    await copy('recreated-observed-fixed-upstream', join(config, 'nginx.conf'), edge, join(config, 'nginx.conf'))
    await docker('recreated-nginx-config-check', ['exec', edge, 'nginx', '-t', '-c', join(config, 'nginx.conf')])
    await docker('recreated-nginx-explicit-upstream-reload', ['exec', edge, 'nginx', '-c', join(config, 'nginx.conf'), '-s', 'reload'])
    await wait('Recreated current fixed upstream', async () => (await rootHttp('/health')).status === 200)
    const me = await rootHttp('/api/didar/me', { headers: { authorization: 'Bearer ' + preservedSession } });
    assert.equal(me.status, 200); assert.equal(me.json.user.id, 'demo-customer');
    const staticAfter = await rootHttp(mediaPath); assert.equal(staticAfter.status, 200); assert.equal(staticAfter.sha256, staticBefore.sha256);
    const preservedAfter = await snapshot(); assert.deepEqual(preservedAfter, before); // GET me/media must not prune auth buckets
    const overlayReadbackScript = "const fs=require('node:fs'),c=require('node:crypto');let raw='';process.stdin.on('data',b=>raw+=b);process.stdin.on('end',()=>process.stdout.write(JSON.stringify(JSON.parse(raw).map(path=>({path,sha256:c.createHash('sha256').update(fs.readFileSync('/app/'+path)).digest('hex')})))))"
    const copied = JSON.parse(await docker('recreated-six-overlay-readback', ['exec', '-i', api, 'node', '-e', overlayReadbackScript], { input: JSON.stringify(patchFiles) })); assert.deepEqual(copied, overlay)
    const newCustomer = await rootHttp('/api/didar/login', { body: { email: 'customer@didar.test', password: 'DidarDemo2026!' } }); assert.equal(newCustomer.status, 200)
    const nativeStatuses = []
    for (const [path, email] of [['/auth/user/emailpass', 'native-admin@didar.test'], ['/auth/member/emailpass', 'native-supplier@didar.test']]) { const login = await rootHttp(path, { body: { email, password: 'DidarNative2026!' } }); assert.equal(login.status, 200); nativeStatuses.push(login.status) }
    runtime.api = api; runtime.frontend = frontend; runtime.relay_ip = newIp;
    await writeFile(runtimeFile, JSON.stringify(runtime), { mode: 0o600 });
    await writeFile(join(recreateOutput, 'result.json'), JSON.stringify({ status: 'PASS', source_sha: input.source_sha, run_id: runId, old_container_ids: original, new_container_ids: { api, frontend }, old_namespace_observation: oldNamespace, new_namespace_observation: namespace, frontend_namespace: frontNamespace, namespace_inode_changed: oldNamespace !== namespace, kernel_inode_distinctness_claimed: false, old_docker_sandbox_id: originalImage.NetworkSettings.SandboxID, new_docker_sandbox_id: candidate.NetworkSettings.SandboxID, old_sandbox_key: originalImage.NetworkSettings.SandboxKey, new_sandbox_key: candidate.NetworkSettings.SandboxKey, frontend_network_mode: joinedFront.HostConfig.NetworkMode, shared_loopback_health: sharedHealth, private_unsigned_statuses: privateAuth, bridge_private_denials_curl_exit: [7, 7], observed_frozen_api_ip: newIp, fail_closed_status_while_down: closed.status, preserved_customer_session: 200, media_sha256: staticAfter.sha256, state_before: before, state_after_before_new_auth: preservedAfter, fresh_customer_login: newCustomer.status, native_admin_vendor_logins: nativeStatuses, six_overlays_matched: true, manifest_sha256: packageHash, exact_config_delta: 'Only inspected fixed relay upstream IPv4 address', trusted_sender_allowlists_unchanged: true, old_fixed_upstream_ip: apiIp, new_fixed_upstream_ip: newIp, relay_tls_name_and_ca_unchanged: true, long_recreate_fresh_replay_claimed: false, no_schema_seed_or_auth_counter_reset: true }, null, 2) + '\n');
    verificationOutcomes.force_recreate = 0;
  }
  
  await docker('nginx-real-reload', ['exec', edge, 'nginx', '-c', join(config, 'nginx.conf'), '-s', 'reload'])
  await docker('frontend-real-stop', ['stop', '--time', '25', frontend]); await docker('frontend-real-restart', ['start', frontend])
  await wait('frontend restart', async () => (await command('frontend-restart-health-' + stages.length, 'docker', ['exec', frontend, 'node', 'runtime/health.mjs'], { expected: [0, 1] })).code === 0)
  success = Object.values(verificationOutcomes).every(code => code === 0)
} catch (error) {
  await writeFile(join(output, 'failure.json'), JSON.stringify({ message: error.message, diagnostic: error.stderr || null }, null, 2) + '\n')
  for (const item of owned.filter(x => ['api', 'frontend', 'nginx'].includes(x.role))) {
    try { const logs = await docker('failure-logs-' + item.role, ['logs', '--tail', '60', item.id]); await writeFile(join(output, item.role + '-failure.log'), logs) } catch {}
  }
  throw error
} finally {
  for (const item of owned.reverse()) {
    if (item.removed === true) continue // Set only after exact guarded removal in force recreation.
    try {
      const state = await inspect(item.id, 'cleanup-inspect-' + item.role)
      assert.equal(state.Name, '/' + item.name); assert.equal(state.Config.Labels[labelName], runId)
      if (state.State.Running) await docker('cleanup-stop-' + item.role, ['stop', '--time', '25', item.id])
      const stopped = await inspect(item.id, 'cleanup-exit-' + item.role)
      await writeFile(join(output, item.role + '-exit.json'), JSON.stringify({ code: stopped.State.ExitCode, oom: stopped.State.OOMKilled, error: stopped.State.Error }) + '\n')
      await docker('cleanup-remove-' + item.role, ['rm', '-v', item.id])
    } catch { cleanup = false }
  }
  if (network) { try { await docker('cleanup-network', ['network', 'rm', network]) } catch { cleanup = false } }
  if (uploadVolume) {
    try {
      const volume = JSON.parse(await docker('cleanup-inspect-upload-volume', ['volume', 'inspect', uploadVolume]))[0]
      assert.equal(volume.Name, uploadVolume); assert.equal(volume.Labels[labelName], runId)
      await docker('cleanup-remove-upload-volume', ['volume', 'rm', uploadVolume])
    } catch { cleanup = false }
  }
  const remaining = (await docker('protected-after', ['ps', '-aq', '--no-trunc'])).split('\n')
  if (!protectedIds.every(id => remaining.includes(id))) cleanup = false
  await rm(root, { recursive: true, force: true })
  await writeFile(join(output, 'result.json'), JSON.stringify({ status: success && cleanup ? 'PASS_SCOPED_APPLICATION_TOPOLOGY' : 'FAIL', run_id: runId, source_sha: input.source_sha, cleanup: cleanup ? 'PASS' : 'FAIL', protected_containers: protectedIds.length, verification_outcomes: verificationOutcomes, actual_child_exits: stages, not_executed: ['Owner target discovery and Internet TLS', 'Host reboot', 'Rollback to a different published release', 'Complete CI; separate runner evidence required'] }, null, 2) + '\n')
  if (!cleanup) throw Error('Owned topology cleanup or protected-resource preservation failed')
}
if (!success) throw Error('Topology contains failed verification stages; see verification_outcomes and actual child exits')
