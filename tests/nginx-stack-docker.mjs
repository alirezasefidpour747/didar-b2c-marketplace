// Real Docker/Compose operator-protocol fixture, NOT application/R5/TLS-target acceptance.
// Fresh labelled resources only; no source mounts/patches in fixture applications.
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm, readdir, chmod, lstat } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomBytes } from 'node:crypto'
import { createServer } from 'node:net'
import { spawn } from 'node:child_process'
import { bundleFiles, sha256, localEnvironment, redactDiagnostic } from '../scripts/deployment/nginx/stack.mjs'

const output = resolve(process.argv[2] || (() => { throw Error('Explicit new evidence output directory required') })())
await mkdir(output, { recursive: false })
const environment = localEnvironment(), rows = [], cases = [], wrapperResults = [], owned = { containers: [], volumes: [], images: [], network: null }
const label = 'didar.disposable-qa=true', project = 'didar-wrapper-' + randomBytes(5).toString('hex')
const root = await mkdtemp(join(tmpdir(), project + '-')), kit = join(root, 'kit'), tls = join(root, 'tls'), build = join(root, 'build')
for (const path of [kit, tls, build]) await mkdir(path, { mode: 0o700 })
let success = false, env, operation, manifest, bundleA, bundleB
async function execute(stage, command, args, { input, expected = [0], env: childEnvironment = environment } = {}) {
  const record = { stage, command, started_at: new Date().toISOString() }
  const result = await new Promise((done, reject) => {
    const child = spawn(command, args, { env: childEnvironment, stdio: ['pipe', 'pipe', 'pipe'] }), chunks = [], errors = []
    let spawnError = null
    const timer = setTimeout(() => { child.kill('SIGTERM'); setTimeout(() => child.kill('SIGKILL'), 3000).unref() }, 600000)
    child.stdout.on('data', value => chunks.push(value)); child.stderr.on('data', value => errors.push(value)); child.on('error', e => { spawnError = e.code })
    child.stdin.on('error', () => {}); child.stdin.end(input)
    child.on('close', (code, signal) => { clearTimeout(timer); done({ code, signal, spawnError, stdout: Buffer.concat(chunks), stderr: Buffer.concat(errors) }) })
  })
  rows.push({ ...record, code: result.code, signal: result.signal, spawn_error: result.spawnError, finished_at: new Date().toISOString() })
  await writeFile(join(output, 'process-exits.json'), JSON.stringify(rows, null, 2) + '\n')
  if (!expected.includes(result.code) || result.signal || result.spawnError) {
    const redact = bytes => redactDiagnostic(bytes, env, childEnvironment, environment)
    await writeFile(join(output, 'failure-diagnostic-' + rows.length + '.json'), JSON.stringify({ scope: 'OWNED_DISPOSABLE_FIXTURE_ONLY', stage, code: result.code, signal: result.signal, spawn_error: result.spawnError, stdout: redact(result.stdout), stderr: redact(result.stderr) }, null, 2) + '\n', { mode: 0o600, flag: 'wx' })
  }
  assert.ok(expected.includes(result.code) && !result.signal && !result.spawnError, stage + ': observed exit ' + result.code + '; stderr sha256=' + sha256(result.stderr))
  return result
}
const docker = async (stage, args, options) => (await execute(stage, 'docker', ['--host=unix:///var/run/docker.sock', ...args], options)).stdout.toString('utf8').trim()
const inspect = async id => JSON.parse(await docker('inspect-' + rows.length, ['inspect', id]))[0]
const save = (path, bytes) => writeFile(path, bytes, { mode: 0o600 })
async function freePort() { const socket = createServer(); await new Promise((yes, no) => { socket.once('error', no); socket.listen(0, '127.0.0.1', yes) }); const port = socket.address().port; await new Promise(yes => socket.close(yes)); return port }
async function wait(stage, check) { for (let count = 0; count < 120; count++) { if (await check()) return; await new Promise(done => setTimeout(done, 500)) } throw Error(stage + '_TIMED_OUT') }
async function create(role, image, extra, command) {
  const id = await docker('create-' + role, ['create', '--name', project + '-' + role + '-1', '--label', label, '--label', 'com.docker.compose.project=' + project, '--label', 'com.docker.compose.service=' + role, '--label', 'com.docker.compose.config-hash=legacy-protocol-fixture', ...extra, image, ...command])
  owned.containers.push(id); return id
}
const source = process.env.DIDAR_WRAPPER_SOURCE_SHA || (await execute('fixture-source', 'git', ['rev-parse', 'HEAD'])).stdout.toString().trim()
assert.match(source, /^[a-f0-9]{40}$/, 'Explicit exact fixture source SHA required')
const sourceDirectory = resolve(import.meta.dirname, '../scripts/deployment/nginx')
const environmentFile = join(root, 'staging.env'), operationFile = join(root, 'operation.json'), manifestFile = join(kit, 'manifest.json')
async function wrapper(action, { expected = [0], overrides = {} } = {}) {
  const result = await execute('wrapper-' + action + '-' + rows.length, process.execPath, [join(kit, 'stack.mjs'), environmentFile, manifestFile, sha256(await readFile(manifestFile)), operationFile, action], { expected, env: { ...environment, ...overrides } })
  const parsed = result.code === 0 ? JSON.parse(result.stdout.toString()) : { code: result.code, error: result.stderr.toString().trim() }
  wrapperResults.push({ action, ...parsed }); await save(join(output, 'wrapper-results.json'), JSON.stringify(wrapperResults, null, 2) + '\n')
  return parsed
}
async function saveOperation() { await save(operationFile, JSON.stringify(operation)) }
async function saveEnvironment() { await save(environmentFile, Object.entries(env).map(([key, value]) => key + '=' + value).join('\n') + '\n') }
async function saveManifest() { await save(manifestFile, JSON.stringify(manifest)); return sha256(await readFile(manifestFile)) }
async function snapshot(ids) {
  const pg = await docker('snapshot-pg', ['exec', ids.postgres, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'didar', '-d', 'didar', '-Atc', 'SELECT value FROM wrapper_state ORDER BY value'])
  const redis = await docker('snapshot-redis', ['exec', ids.redis, 'redis-cli', 'GET', 'wrapper-state'])
  const media = await docker('snapshot-media', ['exec', ids.api, 'node', '-e', "process.stdout.write(require('fs').readFileSync('/app/packages/api/.medusa/server/static/wrapper-state'))"])
  return { pg, redis, media }
}
try {
  const baseBefore = (await docker('protected-before', ['ps', '-aq', '--no-trunc'])).split('\n').filter(Boolean)
  const node = process.env.DIDAR_WRAPPER_NODE_IMAGE || 'node:24.19.0-bookworm-slim@sha256:e5a8dee7bc1e6a215d224a7ef8206f7e77271bc3cabd5febf2beafac0674f174'
  const pgImage = process.env.DIDAR_WRAPPER_POSTGRES_IMAGE || 'postgres:17-bookworm@sha256:66aafa11cf15800a3c94763f7e11d1e7b2e37e5e84bc4ce027cb6e1e4bfaf4df', redisImage = process.env.DIDAR_WRAPPER_REDIS_IMAGE || 'redis:7-bookworm@sha256:cd745595f143052dd6a743bc5651d3ce4b03979fe5c99c7fcfab73461f6f217b'
  for (const image of [node, pgImage, redisImage]) await docker('pull-' + rows.length, ['pull', image])
  const ids = {}
  for (const [name, reference] of [['node', node], ['postgres', pgImage], ['redis', redisImage]]) ids[name] = JSON.parse(await docker('image-' + name, ['image', 'inspect', reference]))[0].Id
  await save(join(build, 'fixture.mjs'), `import http from 'node:http';import https from 'node:https';import fs from 'node:fs';const mode=process.argv[2];if(mode==='migrate'){process.exit(0)}if(mode==='api'){http.createServer((q,r)=>{r.end('fixture-health')}).listen(9000,'127.0.0.1')}if(mode==='storefront'){if(fs.existsSync('/run/didar-tls/fail-start'))process.exit(73);http.createServer((q,r)=>{r.statusCode=403;r.end('fixture-denied')}).listen(3001,'127.0.0.1');https.createServer({key:fs.readFileSync('/run/didar-tls/key.pem'),cert:fs.readFileSync('/run/didar-tls/cert.pem')},(q,r)=>{r.end('fixture-relay-health')}).listen(3000,'0.0.0.0')}`)
  await save(join(build, 'health.mjs'), `import https from 'node:https';import fs from 'node:fs';https.get('https://127.0.0.1:3000/health',{ca:fs.readFileSync('/run/didar-tls/ca.pem'),servername:'relay.test'},r=>{r.resume();process.exitCode=r.statusCode===200?0:1}).on('error',()=>{process.exitCode=1})`)
  await save(join(build, 'Dockerfile'), `FROM ${ids.node}\nWORKDIR /app\nCOPY fixture.mjs /app/fixture.mjs\nCOPY health.mjs /app/runtime/health.mjs\nLABEL org.opencontainers.image.revision=${source}\n`)
  await docker('build-protocol-image', ['build', '--network=none', '--tag', project + ':protocol', build])
  const appImage = JSON.parse(await docker('protocol-image-id', ['image', 'inspect', project + ':protocol']))[0].Id
  owned.images.push(appImage)
  owned.network = await docker('create-owned-network', ['network', 'create', '--label', label, project + '_default'])
  const volumes = {}
  for (const role of ['postgres', 'redis', 'uploads']) { volumes[role] = await docker('create-volume-' + role, ['volume', 'create', '--label', label, project + '_' + role]); owned.volumes.push(volumes[role]) }
  await execute('fixture-tls', 'openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(tls, 'key.pem'), '-out', join(tls, 'cert.pem'), '-days', '1', '-subj', '/CN=relay.test', '-addext', 'subjectAltName=DNS:relay.test,IP:127.0.0.1', '-addext', 'basicConstraints=critical,CA:TRUE'])
  await copyFile(join(tls, 'cert.pem'), join(tls, 'ca.pem'))
  await import('node:fs/promises').then(fs => fs.chmod(join(tls, 'key.pem'), 0o600))
  const networkName = project + '_default', secret = 'literal$wrapper#' + randomBytes(24).toString('hex')
  env = {
    DIDAR_COMPOSE_PROJECT: project, DIDAR_COMPOSE_NETWORK: networkName,
    DIDAR_POSTGRES_VOLUME: volumes.postgres, DIDAR_REDIS_VOLUME: volumes.redis, DIDAR_UPLOADS_VOLUME: volumes.uploads,
    DIDAR_API_IMAGE: appImage, DIDAR_STOREFRONT_IMAGE: appImage, DIDAR_POSTGRES_IMAGE: ids.postgres, DIDAR_REDIS_IMAGE: ids.redis,
    DIDAR_DB_USER: 'didar', DIDAR_DB_NAME: 'didar', DIDAR_DB_PASSWORD: secret,
    DATABASE_URL: 'postgres://didar:' + encodeURIComponent(secret) + '@postgres:5432/didar', REDIS_URL: 'redis://redis:6379/0',
    JWT_SECRET: secret + '${literal} `not-executed`', COOKIE_SECRET: 'cookie$' + randomBytes(32).toString('hex'), DIDAR_AUTH_NETWORK_KEY: 'network$' + randomBytes(32).toString('hex'),
    DIDAR_PUBLIC_ORIGIN: 'https://didar.test', DIDAR_PUBLIC_ORIGIN_VERIFIED: 'false', DIDAR_AUTH_HOST_PORT: String(await freePort()), DIDAR_AUTH_INGRESS_PEERS: '127.0.0.1', DIDAR_AUTH_TLS_DIR: tls, DIDAR_AUTH_TLS_SERVER_NAME: 'relay.test',
  }
  await saveEnvironment()
  const privateRuntime = join(root, 'runtime.env')
  await save(privateRuntime, Object.entries({ ...env, POSTGRES_USER: 'didar', POSTGRES_DB: 'didar', POSTGRES_PASSWORD: secret, DIDAR_AUTH_PROXY_POLICY: 'require-proof', DIDAR_AUTH_INGRESS_MODE: 'verified-relay' }).map(([key, value]) => key + '=' + value).join('\n') + '\n')
  const containers = {}
  containers.postgres = await create('postgres', ids.postgres, ['--network', networkName, '--network-alias', 'postgres', '--env-file', privateRuntime, '--mount', 'type=volume,source=' + volumes.postgres + ',target=/var/lib/postgresql/data'], [])
  containers.redis = await create('redis', ids.redis, ['--network', networkName, '--network-alias', 'redis', '--mount', 'type=volume,source=' + volumes.redis + ',target=/data'], ['redis-server', '--appendonly', 'yes'])
  containers.api = await create('api', appImage, ['--network', networkName, '--env-file', privateRuntime, '--mount', 'type=volume,source=' + volumes.uploads + ',target=/app/packages/api/.medusa/server/static'], ['node', '/app/fixture.mjs', 'api'])
  containers.storefront = await create('storefront', appImage, ['--network', networkName, '--env-file', privateRuntime, '--mount', 'type=bind,source=' + tls + ',target=/run/didar-tls,readonly'], ['node', '/app/fixture.mjs', 'storefront'])
  for (const id of Object.values(containers)) await docker('start-' + rows.length, ['start', id])
  await wait('fixture-pg', async () => (await execute('pg-ready-' + rows.length, 'docker', ['--host=unix:///var/run/docker.sock', 'exec', containers.postgres, 'pg_isready', '-h', '127.0.0.1', '-U', 'didar', '-d', 'didar'], { expected: [0, 1, 2] })).code === 0)
  await docker('seed-postgres-state', ['exec', containers.postgres, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'didar', '-d', 'didar', '-c', "CREATE TABLE wrapper_state(value text);INSERT INTO wrapper_state VALUES ('preserved-postgres');"])
  await docker('seed-redis-state', ['exec', containers.redis, 'redis-cli', 'SET', 'wrapper-state', 'preserved-redis'])
  await docker('seed-media-state', ['exec', containers.api, 'node', '-e', "require('fs').writeFileSync('/app/packages/api/.medusa/server/static/wrapper-state','preserved-media')"])
  const before = await snapshot(containers)
  // Actual backup + isolated PostgreSQL restoration. No live-volume restoration.
  const databaseBackup = join(root, 'backup.sql'), backup = await execute('pg-dump-backup', 'docker', ['--host=unix:///var/run/docker.sock', 'exec', containers.postgres, 'pg_dump', '-U', 'didar', '-d', 'didar', '--no-owner', '--no-privileges'])
  await save(databaseBackup, backup.stdout)
  const restoredVolume = await docker('create-isolated-restore-volume', ['volume', 'create', '--label', label, project + '_restored']); owned.volumes.push(restoredVolume)
  const restored = await create('restore-postgres', ids.postgres, ['--network', networkName, '--env-file', privateRuntime, '--mount', 'type=volume,source=' + restoredVolume + ',target=/var/lib/postgresql/data'], [])
  await docker('start-isolated-restoration', ['start', restored])
  await wait('restored-pg', async () => (await execute('restore-ready-' + rows.length, 'docker', ['--host=unix:///var/run/docker.sock', 'exec', restored, 'pg_isready', '-h', '127.0.0.1', '-U', 'didar', '-d', 'didar'], { expected: [0, 1, 2] })).code === 0)
  await docker('restore-isolated-postgres', ['exec', '-i', restored, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'didar', '-d', 'didar'], { input: await readFile(databaseBackup) })
  assert.equal(await docker('verify-isolated-restored-state', ['exec', restored, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'didar', '-d', 'didar', '-Atc', 'SELECT value FROM wrapper_state']), before.pg)
  let restoreNumber = 0
  async function restoreAncillary(currentIds) {
    const sequence = ++restoreNumber
    await docker('redis-save-backup-' + sequence, ['exec', currentIds.redis, 'redis-cli', 'SAVE'])
    const redisBase64 = await docker('redis-rdb-backup-' + sequence, ['exec', currentIds.redis, 'base64', '-w0', '/data/dump.rdb'])
    const uploadsBackup = JSON.parse(await docker('uploads-tar-backup-' + sequence, ['exec', currentIds.api, 'node', '-e', "const r=require('child_process').spawnSync('tar',['-C','/app/packages/api/.medusa/server/static','-cf','-','.']);process.stdout.write(JSON.stringify({code:r.status,signal:r.signal,error:r.error?.code||null,base64:r.stdout.toString('base64')}));process.exitCode=r.status??1"]))
    assert.equal(uploadsBackup.code, 0); assert.equal(uploadsBackup.signal, null); assert.equal(uploadsBackup.error, null)
    const mediaBase64 = uploadsBackup.base64, redisBytes = Buffer.from(redisBase64, 'base64'), mediaBytes = Buffer.from(mediaBase64, 'base64')
    assert.ok(redisBytes.length > 0); assert.ok(mediaBytes.length > 0)
    await save(join(root, 'redis-backup-' + sequence + '.rdb'), redisBytes); await save(join(root, 'uploads-backup-' + sequence + '.tar'), mediaBytes)
    const isolated = {}
    for (const role of ['redis', 'uploads']) {
      isolated[role] = await docker('create-isolated-' + role + '-volume-' + sequence, ['volume', 'create', '--label', label, project + '_restore_' + role + '_' + sequence]); owned.volumes.push(isolated[role])
    }
    const loaderProgram = "const fs=require('fs'),c=require('crypto');let text='';process.stdin.on('data',x=>text+=x);process.stdin.on('end',()=>{const x=JSON.parse(text);fs.writeFileSync('/restore/redis/dump.rdb',Buffer.from(x.redis,'base64'));fs.writeFileSync('/tmp/uploads.tar',Buffer.from(x.media,'base64'));const r=require('child_process').spawnSync('tar',['-C','/restore/uploads','-xf','/tmp/uploads.tar']);const h=p=>c.createHash('sha256').update(fs.readFileSync(p)).digest('hex');process.stdout.write(JSON.stringify({redis_sha256:h('/restore/redis/dump.rdb'),uploads_archive_sha256:h('/tmp/uploads.tar'),media_sha256:r.status===0?h('/restore/uploads/wrapper-state'):null,extract_code:r.status,extract_signal:r.signal,extract_error:r.error?.code||null}));process.exitCode=r.status??1})"
    const loader = await create('restore-loader-' + sequence, ids.node, ['--interactive', '--network', 'none', '--mount', 'type=volume,source=' + isolated.redis + ',target=/restore/redis', '--mount', 'type=volume,source=' + isolated.uploads + ',target=/restore/uploads'], ['node', '-e', loaderProgram])
    const loaded = JSON.parse(await docker('restore-isolated-redis-and-uploads-' + sequence, ['start', '--attach', '--interactive', loader], { input: JSON.stringify({ redis: redisBase64, media: mediaBase64 }) }))
    const loaderState = await inspect(loader); assert.equal(loaderState.State.ExitCode, 0)
    assert.equal(loaded.redis_sha256, sha256(redisBytes)); assert.equal(loaded.uploads_archive_sha256, sha256(mediaBytes)); assert.equal(loaded.media_sha256, sha256(Buffer.from(before.media))); assert.equal(loaded.extract_code, 0); assert.equal(loaded.extract_signal, null); assert.equal(loaded.extract_error, null)
    const restoredRedis = await create('restore-redis-' + sequence, ids.redis, ['--network', networkName, '--mount', 'type=volume,source=' + isolated.redis + ',target=/data'], ['redis-server', '--appendonly', 'no'])
    await docker('start-isolated-restored-redis-' + sequence, ['start', restoredRedis])
    await wait('restored-redis-' + sequence, async () => (await execute('restore-redis-ready-' + rows.length, 'docker', ['--host=unix:///var/run/docker.sock', 'exec', restoredRedis, 'redis-cli', 'PING'], { expected: [0, 1] })).code === 0)
    assert.equal(await docker('verify-isolated-restored-redis-' + sequence, ['exec', restoredRedis, 'redis-cli', 'GET', 'wrapper-state']), before.redis)
    const backupConfig = join(root, 'backup-config-' + sequence), restoreConfig = join(root, 'isolated-config-' + sequence)
    await mkdir(backupConfig, { mode: 0o700 }); await mkdir(restoreConfig, { mode: 0o700 })
    const configurationHashes = {}
    for (const [name, original] of [['topology_env', environmentFile], ['runtime_env', privateRuntime], ['relay_cert', join(tls, 'cert.pem')], ['relay_key', join(tls, 'key.pem')], ['relay_ca', join(tls, 'ca.pem')]]) {
      await copyFile(original, join(backupConfig, name)); await chmod(join(backupConfig, name), 0o600)
      await copyFile(join(backupConfig, name), join(restoreConfig, name)); await chmod(join(restoreConfig, name), 0o600)
      const originalHash = sha256(await readFile(original)), recoveredHash = sha256(await readFile(join(restoreConfig, name)))
      assert.equal(recoveredHash, originalHash); assert.equal((await lstat(join(restoreConfig, name))).mode & 0o777, 0o600)
      configurationHashes[name] = recoveredHash
    }
    return { isolated_volumes: { postgres: restoredVolume, ...isolated }, configuration_hashes: configurationHashes, redis_rdb_sha256: sha256(redisBytes), uploads_archive_sha256: sha256(mediaBytes), restored_media_sha256: loaded.media_sha256, archive_process: { code: uploadsBackup.code, signal: uploadsBackup.signal, spawn_error: uploadsBackup.error }, extract_process: { code: loaded.extract_code, signal: loaded.extract_signal, spawn_error: loaded.extract_error }, restored_redis: restoredRedis, loader_exit: loaderState.State.ExitCode }
  }
  const backupEvidence = join(root, 'backup-evidence.json')
  async function writeBackupProof(currentIds, databaseBytes) {
    const ancillary = await restoreAncillary(currentIds)
    const proof = { status: 'PASS', scope: 'WRAPPER_PROTOCOL_FIXTURE', source_container_ids: currentIds, database_dump_sha256: sha256(databaseBytes), database_restoration: 'PASS', restoration: { postgres: 'PASS', redis: 'PASS', uploads: 'PASS', configuration: 'PASS' }, ...ancillary }
    await save(backupEvidence, JSON.stringify(proof)); await save(join(output, 'backup-restore-proof-' + restoreNumber + '.json'), JSON.stringify(proof, null, 2) + '\n')
  }
  await writeBackupProof(containers, await readFile(databaseBackup))
  cases.push('postgres-redis-uploads-configuration-actually-restored-isolated')
  const discovery = join(root, 'discovery.json'), moduleFile = join(root, 'module-fixture-not-a-binary'), nginxConfig = join(root, 'nginx-fixture-not-a-vhost')
  await save(discovery, JSON.stringify({ status: 'DISPOSABLE_PROTOCOL_FIXTURE_ONLY', target: false, namespaces: 'SEPARATE_OBSERVED', target_module_abi: 'NOT_TESTED' }))
  await save(moduleFile, 'WRAPPER_PROTOCOL_FIXTURE_ONLY_NOT_NGINX_MODULE'); await save(nginxConfig, 'WRAPPER_PROTOCOL_FIXTURE_ONLY_NOT_NGINX_CONFIG')
  for (const file of bundleFiles) await copyFile(join(sourceDirectory, file), join(kit, file))
  const composition = JSON.parse(await readFile(join(kit, 'compose.topology.json'), 'utf8'))
  composition.services.api.command = ['node', '/app/fixture.mjs', 'api']; composition.services.migrate.command = ['node', '/app/fixture.mjs', 'migrate']; composition.services.storefront.command = ['node', '/app/fixture.mjs', 'storefront']
  for (const service of Object.values(composition.services)) service.labels = { 'didar.disposable-qa': 'true' }
  composition.services.api.healthcheck = { test: ['CMD', 'node', '-e', "fetch('http://127.0.0.1:9000/health').then(r=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1))"], interval: '1s', timeout: '2s', retries: 30 }
  composition.services.storefront.healthcheck.interval = '1s'; composition.services.storefront.healthcheck.timeout = '2s'
  await save(join(kit, 'compose.topology.json'), JSON.stringify(composition))
  manifest = { format: 1, kind: 'didar-nginx-wrapper-protocol-fixture', source_sha: source, platform: 'linux/amd64', files: {}, images: { api: { reference: appImage, image_id: appImage }, storefront: { reference: appImage, image_id: appImage }, postgres: { reference: ids.postgres, image_id: ids.postgres }, redis: { reference: ids.redis, image_id: ids.redis } }, artifact_verification: { path: 'artifact.json' }, independent_review: { path: 'review.json' } }
  for (const file of bundleFiles) manifest.files[file] = sha256(await readFile(join(kit, file)))
  for (const name of ['artifact_verification', 'independent_review']) {
    const bytes = JSON.stringify({ status: 'FIXTURE_ONLY', source_sha: source, topology: 'nginx-verified-relay-v1', workspace_mounts: false, source_overlays: false, exit_code: 0, images: { api: appImage, storefront: appImage }, scope: 'OPERATOR_PROTOCOL_ONLY_NOT_APPLICATION_APPROVAL' })
    await save(join(kit, manifest[name].path), bytes); manifest[name].sha256 = sha256(bytes)
  }
  bundleA = await saveManifest()
  operation = { format: 1, target_config: 'DISPOSABLE_QA', project, network_id: owned.network, containers,
    backup: { status: 'VERIFIED', isolated_restore_status: 'PASS', evidence_file: backupEvidence, evidence_sha256: sha256(await readFile(backupEvidence)), source_container_ids: containers },
    edge: { maintenance: true, observed_peers: env.DIDAR_AUTH_INGRESS_PEERS, tls_name: 'relay.test', secret_version: 'fixture-v1', discovery_file: discovery, discovery_sha256: sha256(await readFile(discovery)), matched_files: {} }, recovery: null }
  for (const [role, path] of [['module', moduleFile], ['nginx_config', nginxConfig], ['signer_auth', join(kit, 'auth.mjs')], ['signer_sign', join(kit, 'sign.mjs')]]) operation.edge.matched_files[role] = { path, sha256: sha256(await readFile(path)) }
  await saveOperation()
  const preflight = await wrapper('preflight'); assert.equal(preflight.existing_namespace_shared, false); cases.push('separate-namespace-preflight')
  const blocked = structuredClone(operation); operation.target_config = 'BLOCKED'; await saveOperation(); assert.equal((await wrapper('quiesce', { expected: [2] })).error, 'TARGET_CONFIG_BLOCKED'); operation = blocked; await saveOperation(); cases.push('target-blocked-no-mutation')
  const backupStatus = operation.backup.status; operation.backup.status = 'UNVERIFIED'; await saveOperation(); assert.match((await wrapper('quiesce', { expected: [2] })).error, /BACKUP_AND_ISOLATED/); operation.backup.status = backupStatus; await saveOperation(); cases.push('missing-backup-blocked')
  assert.match((await wrapper('preflight', { expected: [2], overrides: { COMPOSE_FILE: '/untrusted/override' } })).error, /UNSAFE_PROCESS_OVERRIDE/); cases.push('stale-compose-override-blocked')
  assert.match((await wrapper('preflight', { expected: [2], overrides: { JWT_SECRET: 'stale-private-value' } })).error, /STALE_ENV_OVERRIDE/); cases.push('stale-secret-blocked-no-disclosure')
  await wrapper('quiesce'); await wrapper('migrate'); await wrapper('recreate'); await wrapper('health'); cases.push('migrate-recreate-separate-cli-health')
  const stateFile = environmentFile + '.didar-nginx-state.json', state = JSON.parse(await readFile(stateFile, 'utf8'))
  assert.notEqual(state.containers.api, containers.api); assert.notEqual(state.containers.storefront, containers.storefront)
  const current = { ...containers, ...state.containers }; assert.deepEqual(await snapshot(current), before); cases.push('postgres-redis-media-preserved')
  async function refreshBackup(currentIds) {
    const fresh = await execute('fresh-pg-dump-backup', 'docker', ['--host=unix:///var/run/docker.sock', 'exec', currentIds.postgres, 'pg_dump', '-U', 'didar', '-d', 'didar', '--no-owner', '--no-privileges', '--clean', '--if-exists'])
    await save(databaseBackup, fresh.stdout)
    await docker('fresh-isolated-restore', ['exec', '-i', restored, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'didar', '-d', 'didar'], { input: fresh.stdout })
    assert.equal(await docker('fresh-isolated-state', ['exec', restored, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'didar', '-d', 'didar', '-Atc', 'SELECT value FROM wrapper_state']), before.pg)
    await writeBackupProof(currentIds, fresh.stdout)
    operation.containers = currentIds; operation.backup.source_container_ids = currentIds; operation.backup.evidence_sha256 = sha256(await readFile(backupEvidence)); await saveOperation()
  }
  // Re-discover actual IDs and obtain fresh backup evidence after application replacement.
  await refreshBackup(current)
  await wrapper('quiesce'); await wrapper('migrate')
  // Inject an external read-only fixture TLS-directory fault, never application code.
  await save(join(tls, 'fail-start'), 'fixture-fault')
  await wrapper('recreate', { expected: [2] }); cases.push('partial-api-replaced-front-start-failure-recorded')
  const newApi = (await docker('rediscover-partial-api', ['ps', '-aq', '--no-trunc', '--filter', 'label=com.docker.compose.project=' + project, '--filter', 'label=com.docker.compose.service=api'])).split('\n').filter(Boolean)
  const newFrontend = (await docker('rediscover-partial-storefront', ['ps', '-aq', '--no-trunc', '--filter', 'label=com.docker.compose.project=' + project, '--filter', 'label=com.docker.compose.service=storefront'])).split('\n').filter(Boolean)
  assert.equal(newApi.length, 1); assert.equal(newFrontend.length, 1); assert.notEqual(newApi[0], current.api)
  const partialIds = { ...current, api: newApi[0], storefront: newFrontend[0] }
  await refreshBackup(partialIds)
  await wrapper('quiesce') // Re-establish a controlled stopped state through the protected verb.
  await rm(join(tls, 'fail-start'))
  cases.push('partial-failure-current-id-rediscovery-fresh-backup-controlled-quiesce')
  const recoveryEvidence = join(root, 'recovery-evidence.json')
  manifest.files['recovery-note.json'] = sha256('matched-protocol-fixture-recovery')
  await save(join(kit, 'recovery-note.json'), 'matched-protocol-fixture-recovery'); bundleB = await saveManifest()
  await save(recoveryEvidence, JSON.stringify({ status: 'PASS', scope: 'MATCHED_PROTOCOL_FIXTURE_ONLY', from_bundle_sha256: bundleA, to_bundle_sha256: bundleB, source_sha: source, database_compatible: true, secret_version: operation.edge.secret_version, images: { api: appImage, storefront: appImage }, edge_hashes: Object.fromEntries(Object.entries(operation.edge.matched_files).map(([role, value]) => [role, value.sha256])) }))
  operation.recovery = { status: 'UNVERIFIED', from_bundle_sha256: bundleA, to_bundle_sha256: bundleB, evidence_file: recoveryEvidence, evidence_sha256: sha256(await readFile(recoveryEvidence)) }; await saveOperation()
  assert.match((await wrapper('recover', { expected: [2] })).error, /UNVERIFIED_RECOVERY/); cases.push('unverified-legacy-recovery-blocked')
  operation.recovery.status = 'VERIFIED'; await saveOperation(); await wrapper('recover'); await wrapper('health'); cases.push('matched-bundle-recovery-separate-cli-health')
  const recovered = JSON.parse(await readFile(stateFile, 'utf8')); assert.deepEqual(await snapshot({ ...containers, ...recovered.containers }), before)
  for (const id of baseBefore) await inspect(id)
  const version = JSON.parse(await docker('actual-docker-version-final', ['version', '--format', '{{json .Server}}'])).Version, composeVersion = await docker('actual-compose-version-final', ['compose', 'version', '--short'])
  await save(join(output, 'result.json'), JSON.stringify({ status: 'PASS', scope: 'WRAPPER_PROTOCOL_ONLY_NOT_R5_APPLICATION_TARGET_ACCEPTANCE', source_sha: source, docker_version: version, compose_version: composeVersion, exact_observed_upstream_version_pair: /^26\.1\.5(?:[+~-].*)?$/.test(version) && /^v?2\.26\.1(?:-4)?$/.test(composeVersion), exact_target_binary: false, target_binary_provenance: 'NOT_OBSERVED', cases, original_bundle_sha256: bundleA, recovery_bundle_sha256: bundleB, images: { fixture: appImage, postgres: ids.postgres, redis: ids.redis }, preserved_state: before, target_config: 'BLOCKED', public_https: 'NOT_VERIFIED' }, null, 2) + '\n')
  success = true
} finally {
  const journal = environmentFile + '.didar-nginx-journal'
  try {
    await mkdir(join(output, 'wrapper-journal'), { recursive: true })
    for (const file of await readdir(journal)) await copyFile(join(journal, file), join(output, 'wrapper-journal', file))
  } catch (error) { if (error.code !== 'ENOENT') throw error }
  // Compose creates replacement IDs; remove only the exact fixture project+ownership intersection.
  const current = (await docker('fixture-cleanup-candidates', ['ps', '-aq', '--no-trunc', '--filter', 'label=didar.disposable-qa=true', '--filter', 'label=com.docker.compose.project=' + project])).split('\n').filter(Boolean)
  for (const id of current) { const container = await inspect(id); assert.equal(container.Config.Labels['didar.disposable-qa'], 'true'); assert.equal(container.Config.Labels['com.docker.compose.project'], project); await docker('remove-owned-fixture-' + id.slice(0, 12), ['rm', '--force', id]) }
  for (const volume of owned.volumes) { const actual = JSON.parse(await docker('verify-owned-volume', ['volume', 'inspect', volume]))[0]; assert.equal(actual.Labels['didar.disposable-qa'], 'true'); await docker('remove-owned-volume', ['volume', 'rm', volume]) }
  if (owned.network) { const actual = JSON.parse(await docker('verify-owned-network', ['network', 'inspect', owned.network]))[0]; assert.equal(actual.Labels['didar.disposable-qa'], 'true'); await docker('remove-owned-network', ['network', 'rm', owned.network]) }
  for (const image of owned.images) await docker('remove-owned-protocol-image', ['image', 'rm', project + ':protocol'])
  await save(join(output, 'cleanup.json'), JSON.stringify({ status: 'PASS', project, success, removed_fixture_only: true }) + '\n')
  // Keep private failure state for diagnosis; successful temporary fixtures contain disposable secrets only.
  if (success) await rm(root, { recursive: true, force: true })
}
