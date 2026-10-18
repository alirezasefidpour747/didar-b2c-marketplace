// Disposable artifact-based topology. Never connects to the owner server and
// never builds/publishes a replacement release. All Docker mutations are bound
// to exact freshly-created IDs and ownership labels.
import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import { mkdir, mkdtemp, readFile, writeFile, rm, access } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
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
async function copy(name, from, id, destination) { await docker('copy-' + name, ['cp', from, id + ':' + destination]) }
try {
  const source = await command('candidate-source', 'git', ['-C', repo, 'rev-parse', 'HEAD']); assert.equal(source.stdout.toString().trim(), input.source_sha)
  network = await docker('create-network', ['network', 'create', '--label', labelName + '=' + runId, 'didar-' + runId])
  uploadVolume = await docker('create-disposable-upload-volume', ['volume', 'create', '--label', labelName + '=' + runId, 'didar-' + runId + '-uploads'])
  pg = await create('postgres', input.postgres_image, ['--network', network, '--network-alias', 'pg', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', '-e', 'POSTGRES_DB=didar_qa'], [])
  redis = await create('redis', input.redis_image, ['--network', network, '--network-alias', 'redis'], [])
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
    DIDAR_AUTH_HEALTH_SERVER_NAME: 'didar.test', MEDUSA_BACKEND_URL: 'http://127.0.0.1:9000', NO_PROXY: '*',
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
  const mediaResult = await command('same-origin-real-media-regressions', 'docker', ['exec', '--env-file', envFile, '-e', 'TEST_API_URL=https://' + edgeIp + ':8443', '-w', '/app', api, 'bun', 'test', 'tests/content.test.ts'], { timeout: 1200000, expected: [0, 1] })
  verificationOutcomes.media = mediaResult.code
  await saveVerificationLog('media', mediaResult)
  const lifecycleResult = await command('real-lifecycle-compatible-bundle-recovery', process.execPath, [join(repo, 'scripts/topology/lifecycle.mjs'), runtimeFile], { timeout: 300000, expected: [0, 1] })
  verificationOutcomes.lifecycle = lifecycleResult.code; await saveVerificationLog('lifecycle', lifecycleResult)
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
  await writeFile(join(output, 'result.json'), JSON.stringify({ status: success && cleanup ? 'PASS_SCOPED_APPLICATION_TOPOLOGY' : 'FAIL', run_id: runId, source_sha: input.source_sha, cleanup: cleanup ? 'PASS' : 'FAIL', protected_containers: protectedIds.length, verification_outcomes: verificationOutcomes, actual_child_exits: stages, not_executed: ['Owner target discovery and Internet TLS', 'Host reboot', 'Forced API container replacement with a different container ID', 'Rollback to a different published release', 'Complete CI; separate runner evidence required'] }, null, 2) + '\n')
  if (!cleanup) throw Error('Owned topology cleanup or protected-resource preservation failed')
}
if (!success) throw Error('Topology contains failed verification stages; see verification_outcomes and actual child exits')
