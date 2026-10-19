import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, lstat, chmod, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync, spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { request } from 'node:https'
import { createRequire } from 'node:module'
import { provisionNetworkKey, validateFreshConfiguration, assertDaemonPreserved, assertFreshNames, freshComposition, verifyCandidateApproval, verifyFreshRestore, operateFresh, socketObserverSource, startOwnedHealthy } from '../scripts/deployment/nginx/fresh.mjs'
import { sha256, parseConfiguration, actions, canonicalState } from '../scripts/deployment/nginx/stack.mjs'

const image = c => 'sha256:' + c.repeat(64)
const env = () => ({ DIDAR_COMPOSE_PROJECT: 'new-staging', DIDAR_COMPOSE_NETWORK: 'new-staging-net', DIDAR_POSTGRES_VOLUME: 'new-pg', DIDAR_REDIS_VOLUME: 'new-cache', DIDAR_UPLOADS_VOLUME: 'new-media', DIDAR_API_IMAGE: image('a'), DIDAR_STOREFRONT_IMAGE: image('b'), DIDAR_POSTGRES_IMAGE: image('c'), DIDAR_REDIS_IMAGE: image('d'), DIDAR_DB_USER: 'newuser', DIDAR_DB_NAME: 'newdb', DIDAR_DB_PASSWORD: 'db'.repeat(32), DATABASE_URL: 'postgres://newuser:' + 'db'.repeat(32) + '@postgres:5432/newdb?sslmode=disable', REDIS_URL: 'redis://redis:6379/0', JWT_SECRET: 'jwt'.repeat(32), COOKIE_SECRET: 'cookie'.repeat(32), DIDAR_AUTH_NETWORK_KEY: 'net'.repeat(32), DIDAR_PUBLIC_ORIGIN: 'https://new.example.test', DIDAR_PUBLIC_ORIGIN_VERIFIED: 'false', DIDAR_AUTH_HOST_PORT: '23000', DIDAR_AUTH_INGRESS_PEERS: 'PENDING', DIDAR_AUTH_TLS_DIR: '/private/new-tls', DIDAR_AUTH_TLS_SERVER_NAME: 'new-relay.example.test' })
const baseline = () => ({ containers: { legacy: { running: true, image: 'legacy', configuration_sha256: 'secret-hash' } }, networks: { bridgeid: { name: 'legacy_net' } }, volumes: { legacy_db: { sha256: 'legacy-hash' } } })
async function directory(fn) { const dir = await mkdtemp(join(tmpdir(), 'didar-fresh-unit-')); try { await fn(dir) } finally { await rm(dir, { recursive: true, force: true }) } }

test('network key uses real CSPRNG, private write-once file; old file and symlink are never overwritten', async () => directory(async dir => {
  await chmod(dir, 0o700)
  const path = join(dir, 'network-key')
  const result = await provisionNetworkKey(path), value = await readFile(path, 'utf8')
  assert.match(value, /^[a-f0-9]{64}\n$/); assert.equal(result.status, 'NEW_NETWORK_KEY_PROVISIONED_PRIVATE_ONLY'); assert.equal(JSON.stringify(result).includes(value.trim()), false)
  assert.equal((await lstat(path)).mode & 0o777, 0o600)
  await assert.rejects(provisionNetworkKey(path), /EEXIST/); assert.equal(await readFile(path, 'utf8'), value)
  const link = join(dir, 'key-link'); await symlink(path, link); await assert.rejects(provisionNetworkKey(link), /EEXIST/)
  const unsafe = join(dir, 'unsafe'); await mkdir(unsafe, { mode: 0o755 }); await chmod(unsafe, 0o755); await assert.rejects(provisionNetworkKey(join(unsafe, 'key')), /PRIVATE_DIRECTORY/)
}))

test('PENDING is an explicit preparation-only parser state; existing lifecycle still rejects it', () => {
  const text = Object.entries(env()).map(([k, v]) => k + '=' + v).join('\n')
  assert.throws(() => parseConfiguration(text), /OBSERVED_PEERS/)
  assert.equal(parseConfiguration(text, {}, { allowPendingPeer: true }).DIDAR_AUTH_INGRESS_PEERS, 'PENDING')
  assert.throws(() => parseConfiguration(text.replace('PENDING', '0.0.0.0'), {}, { allowPendingPeer: true }), /OBSERVED_PEERS/)
})

test('fresh dependency URLs cannot silently reuse legacy host/DB/cache; secrets and HTTPS state are distinct', () => {
  validateFreshConfiguration(env())
  for (const change of [{ DATABASE_URL: env().DATABASE_URL.replace('@postgres:', '@legacy-db:') }, { DATABASE_URL: env().DATABASE_URL + '?options=legacy' }, { DATABASE_URL: env().DATABASE_URL.replace('/newdb', '/legacydb') }, { REDIS_URL: 'redis://legacy-cache:6379/0' }, { REDIS_URL: 'redis://redis:6379/1' }, { COOKIE_SECRET: env().JWT_SECRET }, { DIDAR_DB_PASSWORD: 'short' }, { DIDAR_PUBLIC_ORIGIN_VERIFIED: 'true' }]) assert.throws(() => validateFreshConfiguration({ ...env(), ...change }), /FRESH|STRONG/)
})

test('private-bridge PostgreSQL requires the exact accepted SSL mode; implicit TLS and extra/duplicate options fail', () => {
  validateFreshConfiguration(env())
  for (const query of ['', '?sslmode=require', '?sslmode=disable&sslmode=require', '?sslmode=disable&application_name=unreviewed', '?sslmode=disable&', '?sslmode=disable#fragment']) assert.throws(() => validateFreshConfiguration({ ...env(), DATABASE_URL: env().DATABASE_URL.replace('?sslmode=disable', query) }), /FRESH_LOCAL_DEPENDENCY/)
})

test('whole-daemon preservation rejects changed, removed and newly created unrelated resources', () => {
  assertDaemonPreserved(baseline(), baseline())
  for (const type of ['containers', 'networks', 'volumes']) {
    const changed = baseline(); changed[type][Object.keys(changed[type])[0]] = { changed: true }; assert.throws(() => assertDaemonPreserved(baseline(), changed), /PREEXISTING/)
    const removed = baseline(); delete removed[type][Object.keys(removed[type])[0]]; assert.throws(() => assertDaemonPreserved(baseline(), removed), /PREEXISTING/)
    const added = baseline(); added[type].unexpected = {}; assert.throws(() => assertDaemonPreserved(baseline(), added), /UNJOURNALED/)
    const owned = { containers: [], networks: [], volumes: [] }; owned[type].push('unexpected'); assertDaemonPreserved(baseline(), added, owned)
  }
})

test('fresh names fail before adoption of any existing project, network or authoritative volume', () => {
  assertFreshNames(env(), baseline(), [])
  assert.throws(() => assertFreshNames(env(), baseline(), ['new-staging']), /NO_ADOPTION/)
  for (const key of ['DIDAR_POSTGRES_VOLUME', 'DIDAR_REDIS_VOLUME', 'DIDAR_UPLOADS_VOLUME']) assert.throws(() => assertFreshNames({ ...env(), [key]: 'legacy_db' }, baseline(), []), /NO_ADOPTION/)
  assert.throws(() => assertFreshNames({ ...env(), DIDAR_COMPOSE_NETWORK: 'legacy_net' }, baseline(), []), /NO_ADOPTION/)
  for (const type of ['networks', 'volumes']) { const orphan = baseline(); orphan[type].orphan = { name: 'other-name', project: 'new-staging' }; assert.throws(() => assertFreshNames(env(), orphan, []), /NO_ADOPTION/) }
})

test('default Docker networks preserve every original endpoint while allowing only journaled isolated helper attachments', () => {
  const original = baseline(); original.networks.bridgeid = { name: 'none', sha256: 'metadata-hash', endpoints: { legacy: { Name: 'legacy', EndpointID: 'legacy-endpoint' } } }
  const attached = structuredClone(original); attached.networks.bridgeid.endpoints.restore = { Name: 'owned-restore' }
  assert.throws(() => assertDaemonPreserved(original, attached), /UNJOURNALED_NETWORK_ENDPOINT/)
  assertDaemonPreserved(original, attached, { containers: ['restore'], networks: [], volumes: [] })
  for (const mutate of [value => { value.networks.bridgeid.endpoints.legacy.EndpointID = 'changed' }, value => { delete value.networks.bridgeid.endpoints.legacy }, value => { value.networks.bridgeid.sha256 = 'changed' }]) {
    const changed = structuredClone(attached); mutate(changed); assert.throws(() => assertDaemonPreserved(original, changed, { containers: ['restore'], networks: [], volumes: [] }), /NETWORK|networks/)
  }
})

test('fresh composition preserves signed trust/private namespace, adds ownership, refuses seed or command drift', async () => {
  const composition = JSON.parse(await readFile(new URL('../scripts/deployment/nginx/compose.topology.json', import.meta.url)))
  const bundle = { composition }
  const rendered = JSON.parse(freshComposition(bundle, env(), 'owned-token'))
  assert.equal(rendered.services.storefront.network_mode, 'service:api'); assert.equal(rendered.services.api.environment.DIDAR_AUTH_PROXY_POLICY, 'require-proof'); assert.equal(rendered.services.storefront.environment.DIDAR_AUTH_INGRESS_MODE, 'verified-relay')
  assert.equal(rendered.services.api.ports[0], '127.0.0.1:23000:3000'); assert.equal(rendered.services.api.labels['didar.fresh-owner'], 'owned-token')
  for (const [key, value] of [['DIDAR_SEED_DEMO', 'true'], ['DIDAR_ENVIRONMENT', 'local'], ['DIDAR_PAYMENT_MODE', 'live']]) {
    const changed = structuredClone(bundle); changed.composition.services.migrate.environment[key] = value
    assert.throws(() => freshComposition(changed, env(), 'owned-token'), /NO_DEMO_SANDBOX/)
  }
  const changed = structuredClone(bundle); changed.composition.services.migrate.command.push('seed-demo'); assert.throws(() => freshComposition(changed, env(), 'owned-token'), /REVIEWED_ADDITIVE/)
})

test('new kit requires genuine external CA approval bound to code/images; test receipts remain fixtures only', async () => directory(async dir => {
  const path = join(dir, 'approval.json'), bundle = { manifest: { source_sha: 'a'.repeat(40), files: { 'stack.mjs': 'a'.repeat(64), 'fresh.mjs': 'b'.repeat(64), 'fresh-restore.mjs': 'd'.repeat(64), 'compose.topology.json': 'c'.repeat(64), 'provision-node.sh': 'e'.repeat(64), 'fresh-operator-bundle.mjs': 'f'.repeat(64) }, images: Object.fromEntries(['api', 'storefront', 'postgres', 'redis'].map((role, n) => [role, { image_id: image('abcd'[n]) }])) } }
  // Synthetic receipt is an in-memory/local unit fixture, never target approval.
  const original = { status: 'APPROVED', authority: 'Chief Architect', scope: 'PARALLEL_FRESH_INSTALL_KIT', preparation_only_mutations: true, domain_cutover_authorized: false, source_sha: bundle.manifest.source_sha, approval_url: 'https://unit.invalid/fixture-not-approval', reviewer: 'unit-fixture-only', files: bundle.manifest.files, images: Object.fromEntries(Object.entries(bundle.manifest.images).map(([k,v]) => [k,v.image_id])) }
  const operation = { approval: { path } }, save = async value => { await writeFile(path, JSON.stringify(value), { mode: 0o600 }); operation.approval.sha256 = sha256(await readFile(path)) }
  await save(original); await verifyCandidateApproval(operation, bundle)
  for (const change of [{ status: 'PENDING' }, { status: 'FIXTURE_ONLY' }, { authority: 'operator' }, { scope: 'old-release' }, { preparation_only_mutations: false }, { domain_cutover_authorized: true }, { source_sha: 'b'.repeat(40) }, { files: { ...original.files, 'fresh.mjs': 'f'.repeat(64) } }, { images: { ...original.images, api: image('f') } }]) { await save({ ...original, ...change }); await assert.rejects(verifyCandidateApproval(operation, bundle), /CHIEF_ARCHITECT|SUBJECT/) }
  await save({ ...original, status: 'FIXTURE_ONLY', authority: 'QA', scope: 'QA_ONLY' })
  const fixtureOperation = { ...operation, kind: 'PARALLEL_FRESH_INSTALL_PROTOCOL_FIXTURE', target_config: 'DISPOSABLE_QA' }, fixtureBundle = { manifest: { ...bundle.manifest, kind: 'didar-nginx-wrapper-protocol-fixture' } }
  await verifyCandidateApproval(fixtureOperation, fixtureBundle)
  await assert.rejects(verifyCandidateApproval({ ...fixtureOperation, kind: 'PARALLEL_FRESH_INSTALL' }, fixtureBundle), /CHIEF_ARCHITECT/)
  await assert.rejects(verifyCandidateApproval({ ...fixtureOperation, target_config: 'VERIFIED' }, fixtureBundle), /CHIEF_ARCHITECT/)
  await assert.rejects(verifyCandidateApproval(fixtureOperation, { manifest: { ...bundle.manifest, kind: 'didar-nginx-verified-topology' } }), /CHIEF_ARCHITECT/)
}))

test('initial isolated restore binds real dependency IDs and initialization state without fictional app IDs', async () => directory(async dir => {
  const path = join(dir, 'restore.json'), state = { ids: { postgres: 'c'.repeat(64), redis: 'd'.repeat(64) }, initialization_state_sha256: 'e'.repeat(64) }
  const original = { status: 'PASS', scope: 'PARALLEL_FRESH_INITIALIZED_STATE', database_restoration: 'PASS', source_container_ids: state.ids, initialization_state_sha256: state.initialization_state_sha256, restoration: { postgres: 'PASS', redis: 'PASS', uploads: 'PASS', configuration: 'PASS' }, isolated_volumes: { postgres: 'isolated-pg', redis: 'isolated-cache', uploads: 'isolated-media' }, evidence_url: 'https://unit.invalid/restore-fixture', backup_sha256: { postgres: 'a'.repeat(64), redis: 'b'.repeat(64), uploads: 'c'.repeat(64), configuration: 'd'.repeat(64) } }
  const publicationPath = join(dir, 'SYNTHETIC_READBACK_NOT_TARGET_EVIDENCE.json')
  const operation = { restoration: { path, publication: { path: publicationPath } } }, save = async value => {
    await writeFile(path, JSON.stringify(value), { mode: 0o600 }); operation.restoration.sha256 = sha256(await readFile(path))
    await writeFile(publicationPath, JSON.stringify({ status: 'PASS', scope: 'FRESH_BACKUP_DURABLE_READBACK', exit_code: 0, restore_receipt_sha256: operation.restoration.sha256, destination_url: original.evidence_url, backup_sha256: original.backup_sha256, source_container_ids: state.ids, initialization_state_sha256: state.initialization_state_sha256 }), { mode: 0o600 }); operation.restoration.publication.sha256 = sha256(await readFile(publicationPath))
  }
  await save(original); await verifyFreshRestore(operation, env(), state)
  for (const change of [{ source_container_ids: { ...state.ids, api: 'f'.repeat(64) } }, { initialization_state_sha256: 'f'.repeat(64) }, { database_restoration: 'UNEXECUTED' }, { isolated_volumes: { ...original.isolated_volumes, postgres: 'new-pg' } }, { restoration: { ...original.restoration, uploads: 'UNEXECUTED' } }]) { await save({ ...original, ...change }); await assert.rejects(verifyFreshRestore(operation, env(), state), /RESTORE/) }
  await save(original)
  const publication = JSON.parse(await readFile(publicationPath))
  for (const change of [{ status: 'PENDING' }, { exit_code: 1 }, { restore_receipt_sha256: 'f'.repeat(64) }, { destination_url: 'https://unit.invalid/another' }, { backup_sha256: { ...original.backup_sha256, configuration: 'f'.repeat(64) } }]) {
    await writeFile(publicationPath, JSON.stringify({ ...publication, ...change })); operation.restoration.publication.sha256 = sha256(await readFile(publicationPath)); await assert.rejects(verifyFreshRestore(operation, env(), state), /DURABLE_READBACK/)
  }
}))

test('fresh commands remain closed verbs with no destructive/passthrough operation', () => {
  for (const action of ['fresh-preflight', 'fresh-dependencies', 'fresh-migrate', 'fresh-admin', 'fresh-restore-check', 'fresh-prepare-api', 'fresh-observe-peer', 'fresh-bind-peer', 'fresh-start', 'fresh-quiesce']) assert.equal(actions.includes(action), true)
  for (const action of ['fresh-delete', 'fresh-down', 'fresh-rm', 'fresh-exec', 'fresh-adopt']) assert.equal(actions.includes(action), false)
})

test('actual protected CLI provisions a private key without stdout/stderr disclosure and refuses replacement', async () => directory(async dir => {
  await chmod(dir, 0o700)
  const path = join(dir, 'cli-network-key'), script = new URL('../scripts/deployment/nginx/stack.mjs', import.meta.url)
  const first = spawnSync(process.execPath, [script.pathname, 'provision-network-key', path], { encoding: 'utf8' })
  assert.equal(first.status, 0); assert.equal(first.signal, null); assert.equal(first.stdout, ''); assert.equal(first.stderr, '')
  const bytes = await readFile(path)
  const retry = spawnSync(process.execPath, [script.pathname, 'provision-network-key', path], { encoding: 'utf8' })
  assert.equal(retry.status, 2); assert.equal(retry.signal, null); assert.equal(retry.stdout, ''); assert.equal(retry.stderr.includes(bytes.toString('utf8').trim()), false); assert.deepEqual(await readFile(path), bytes)
}))

test('fresh lifecycle denies fixture target mode and missing executable manifest before any Docker process', async () => {
  const operation = { format: 1, kind: 'PARALLEL_FRESH_INSTALL', target_config: 'BLOCKED', project: 'new-staging', approval: null, edge: null, restoration: null, admin: null }
  const bundle = { manifest: { kind: 'didar-nginx-verified-topology', files: {} } }
  let calls = 0
  const run = async () => { calls++; throw Error('UNEXPECTED_DOCKER') }
  for (const change of [{ target_config: 'DISPOSABLE_QA' }, { kind: 'ADOPT_LEGACY' }, { project: 'legacy' }]) await assert.rejects(operateFresh({ action: 'fresh-start', configuration: env(), bundle, operation: { ...operation, ...change }, run }), /EXPLICIT_FRESH/)
  await assert.rejects(operateFresh({ action: 'fresh-start', configuration: env(), bundle, operation, run }), /EXECUTING_FRESH_KIT_HASH_MISMATCH/)
  assert.equal(calls, 0)
})

test('actual isolated TLS observer requires original v1 proof plus exact one-time body; spoof/raw-byte/expired negatives fail', { timeout: 10000 }, async () => directory(async dir => {
  const openssl = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1', '-keyout', join(dir, 'key.pem'), '-out', join(dir, 'cert.pem')], { encoding: 'utf8' })
  assert.equal(openssl.status, 0); assert.equal(openssl.signal, null)
  const port = await new Promise((done, reject) => { const server = createServer(); server.on('error', reject); server.listen(0, '127.0.0.1', () => { const p = server.address().port; server.close(() => done(p)) }) })
  const { signNetwork, HEADER } = createRequire(import.meta.url)('../packages/auth-network/index.cjs')
  const key = 'tls-observer-unit-key'.repeat(3), challenge = 'a'.repeat(64), api = 'b'.repeat(64), body = Buffer.from(JSON.stringify({ didar_peer_probe: challenge }))
  const code = socketObserverSource({ modulePath: new URL('../packages/auth-network/index.cjs', import.meta.url).pathname, tlsDir: dir, port })
  const child = spawn(process.execPath, ['-e', code], { env: { ...process.env, DIDAR_AUTH_NETWORK_KEY: key, PROBE_CHALLENGE: challenge, OBSERVED_API_ID: api }, stdio: ['ignore', 'pipe', 'pipe'] })
  let stdout = '', stderr = ''; child.stdout.on('data', value => { stdout += value }); child.stderr.on('data', value => { stderr += value })
  const closed = new Promise(done => child.once('close', (code, signal) => done({ code, signal })))
  const ca = await readFile(join(dir, 'cert.pem'))
  const send = (bytes, headers = {}) => new Promise((done, reject) => { const req = request({ hostname: '127.0.0.1', port, path: '/api/didar/login', method: 'POST', ca, headers: { 'content-type': 'application/json', 'content-length': bytes.length, ...headers } }, res => { res.resume(); res.on('end', () => done(res.statusCode)) }); req.on('error', reject); req.end(bytes) })
  try {
    let ready = false
    for (let attempt = 0; attempt < 50; attempt++) { try { assert.equal(await send(body), 403); ready = true; break } catch (error) { if (error.code !== 'ECONNREFUSED') throw error; await new Promise(done => setTimeout(done, 20)) } }
    assert.equal(ready, true)
    assert.equal(await send(body, { 'x-forwarded-for': '192.0.2.77', 'x-real-ip': '192.0.2.88' }), 403)
    const assertion = signNetwork({ key, peer: '192.0.2.44', method: 'POST', path: '/api/didar/login', body })
    assert.equal(await send(Buffer.concat([body, Buffer.from(' ')]), { [HEADER]: assertion }), 403)
    assert.equal(await send(body, { [HEADER]: signNetwork({ key, peer: '192.0.2.44', method: 'POST', path: '/api/didar/login', body, ts: Date.now() - 31000 }) }), 403)
    assert.equal(await send(body, { [HEADER]: assertion, 'x-forwarded-for': '198.51.100.33' }), 204)
    assert.deepEqual(await closed, { code: 0, signal: null })
    const observation = JSON.parse(stdout); assert.equal(observation.signed_probe, 'PASS'); assert.equal(observation.api_namespace, api); assert.equal(observation.socket_peer.replace(/^::ffff:/, ''), '127.0.0.1'); assert.equal(stdout.includes(key), false); assert.equal(stderr, '')
  } finally { if (child.exitCode === null) { child.kill('SIGTERM'); await closed } }
}))

test('stop-only fresh-quiesce survives low capacity, creates nothing and still refuses unowned application IDs', async () => directory(async dir => {
  const token = 'a'.repeat(48), api = 'e'.repeat(64), configuration = env(), statePath = join(dir, 'state.json'), approvalPath = join(dir, 'unit-approval.json')
  const names = ['stack.mjs', 'fresh.mjs', 'fresh-restore.mjs', 'compose.topology.json', 'provision-node.sh', 'fresh-operator-bundle.mjs']
  const files = Object.fromEntries(await Promise.all(names.map(async name => [name, ['stack.mjs', 'fresh.mjs'].includes(name) ? sha256(await readFile(new URL('../scripts/deployment/nginx/' + name, import.meta.url))) : 'c'.repeat(64)])))
  const bundle = { root: dir, hash: 'd'.repeat(64), manifest: { kind: 'didar-nginx-verified-topology', source_sha: 'f'.repeat(40), files, images: Object.fromEntries(['api', 'storefront', 'postgres', 'redis'].map((role, n) => [role, { reference: image('abcd'[n]), image_id: image('abcd'[n]) }])) }, composition: JSON.parse(await readFile(new URL('../scripts/deployment/nginx/compose.topology.json', import.meta.url))) }
  const receipt = { status: 'APPROVED', authority: 'Chief Architect', scope: 'PARALLEL_FRESH_INSTALL_KIT', preparation_only_mutations: true, domain_cutover_authorized: false, source_sha: bundle.manifest.source_sha, approval_url: 'https://unit.invalid/SYNTHETIC_NOT_TARGET_APPROVAL', reviewer: 'unit-fixture-only', files, images: Object.fromEntries(Object.entries(bundle.manifest.images).map(([role, value]) => [role, value.image_id])) }
  await writeFile(approvalPath, JSON.stringify(receipt), { mode: 0o600 })
  const operation = { format: 1, kind: 'PARALLEL_FRESH_INSTALL', target_config: 'BLOCKED', project: configuration.DIDAR_COMPOSE_PROJECT, approval: { path: approvalPath, sha256: sha256(await readFile(approvalPath)) }, edge: null, restoration: null, admin: null }
  const stable = { ...configuration }; delete stable.DIDAR_AUTH_INGRESS_PEERS
  const initial = { phase: 'API_READY', bundle_sha256: bundle.hash, configuration_sha256: sha256(canonicalState(stable)), token, baseline: { containers: {}, networks: {}, volumes: {} }, owned: { containers: [api], networks: [], volumes: [] }, ids: { api } }
  let running = true, owner = token; const calls = []
  const container = () => ({ Id: api, Name: '/new-api', Image: image('a'), Config: { Env: [], Labels: { 'didar.fresh-owner': owner, 'com.docker.compose.project': configuration.DIDAR_COMPOSE_PROJECT, 'com.docker.compose.service': 'api' } }, HostConfig: { NetworkMode: 'new-network', PortBindings: {} }, NetworkSettings: { Networks: {} }, State: { Running: running, StartedAt: 'unit-fixture' }, Mounts: [] })
  const run = async (stage, args) => {
    calls.push(args)
    if (stage === 'fresh-docker-context') return 'default'
    if (stage === 'fresh-docker-version') return JSON.stringify({ Version: '26.1.5' })
    if (stage === 'fresh-compose-version') return '2.26.1'
    if (stage === 'fresh-docker-resources') return JSON.stringify({ OSType: 'linux', Architecture: 'amd64', MemTotal: 1, NCPU: 1, DockerRootDir: '/DOES_NOT_EXIST_LOW_CAPACITY_FIXTURE' })
    if (stage.startsWith('fresh-image-')) { const role = stage.slice('fresh-image-'.length); return JSON.stringify([{ Id: bundle.manifest.images[role].image_id, Os: 'linux', Architecture: 'amd64', Config: { Labels: { 'org.opencontainers.image.revision': bundle.manifest.source_sha } } }]) }
    if (stage === 'fresh-list-containers') return api
    if (stage === 'fresh-list-networks' || stage === 'fresh-list-volumes' || stage === 'fresh-compose-config') return ''
    if (stage.startsWith('fresh-observe-container-') || stage === 'fresh-recheck-container-owner') return JSON.stringify([container()])
    if (stage === 'fresh-stop-api') { assert.deepEqual(args, ['stop', '--time', '25', api]); running = false; return api }
    throw Error('UNEXPECTED_STAGE:' + stage)
  }
  await writeFile(statePath, JSON.stringify(initial), { mode: 0o600 })
  const result = await operateFresh({ action: 'fresh-quiesce', configuration, bundle, operation, run, statePath })
  assert.equal(result.status, 'FRESH_APPLICATIONS_QUIESCED_DEPENDENCIES_PRESERVED'); assert.equal(running, false)
  assert.equal(calls.some(args => args.includes('create') || args.includes('up') || args.includes('run') || args.includes('start')), false)
  await writeFile(statePath, JSON.stringify(initial)); calls.length = 0; running = true; owner = 'b'.repeat(48)
  await assert.rejects(operateFresh({ action: 'fresh-quiesce', configuration, bundle, operation, run, statePath }), /OWNERSHIP_CHANGED/)
  assert.equal(calls.some(args => args[0] === 'stop'), false)
  await assert.rejects(operateFresh({ action: 'fresh-dependencies', configuration, bundle, operation, run, statePath }), /INSUFFICIENT_OR_UNSUPPORTED_DOCKER_RESOURCES/)
}))

test('portable start uses only journaled exact Docker IDs, verifies health and rejects ownership or unhealthy state', async () => {
  const api = 'a'.repeat(64), token = 'b'.repeat(48), state = { ids: { api }, token }, configuration = env(), bundle = { manifest: { images: { api: { image_id: image('a') } } } }
  let started = false, owner = token, health = 'healthy', preserved = false; const calls = []
  const run = async (_stage, args) => {
    calls.push(args)
    if (args[0] === 'start') { assert.deepEqual(args, ['start', api]); started = true; return api }
    assert.deepEqual(args, ['inspect', api])
    return JSON.stringify([{ Id: api, Image: image('a'), Config: { Labels: { 'didar.fresh-owner': owner, 'didar.disposable-qa': 'true', 'com.docker.compose.project': configuration.DIDAR_COMPOSE_PROJECT, 'com.docker.compose.service': 'api' } }, State: { Running: started, Health: { Status: health }, ExitCode: 0 } }])
  }
  const options = { stage: 'unit-start', selected: ['api'], state, bundle, configuration, qa: true, run, timeout: 1, preserve: async () => { preserved = true } }
  await startOwnedHealthy(options); assert.equal(preserved, true)
  assert.equal(calls.some(args => args.includes('--wait') || args.includes('--wait-timeout') || args[0] === 'compose'), false)
  started = false; owner = 'c'.repeat(48); calls.length = 0
  await assert.rejects(startOwnedHealthy(options), /OWNERSHIP_CHANGED/); assert.equal(calls.some(args => args[0] === 'start'), false)
  owner = token; health = 'unhealthy'; preserved = false
  await assert.rejects(startOwnedHealthy(options), /UNHEALTHY/); assert.equal(preserved, false)
})
