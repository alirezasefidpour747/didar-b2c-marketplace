// Dedicated disposable GitHub runner only. Exercises candidate operator code
// against unchanged accepted application images, never a target authorization.
import assert from 'node:assert/strict'
import { randomBytes, createCipheriv } from 'node:crypto'
import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile, copyFile, readdir, stat, statfs } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { createServer } from 'node:net'
import https from 'node:https'
import { applicationSource, applicationImages, assembleFreshAmendment } from './fresh-operator-bundle.mjs'
import { fileHash, validateManifest } from './release.mjs'
import { verifyInstallKit } from './install-kit.mjs'
import { sha256, redactDiagnostic } from '../deployment/nginx/stack.mjs'
import { render } from '../deployment/nginx/render.mjs'
import { exportFreshInstallKit } from './export-fresh-install-kit.mjs'

const [phase, zipArgument, rootArgument, outArgument, readbackArgument] = process.argv.slice(2)
assert.ok(['prepare', 'complete'].includes(phase), 'Use prepare|complete ZIP PRIVATE_ROOT SANITIZED_OUTPUT [DOWNLOADED_BACKUP_DIR]')
const root = resolve(rootArgument), output = resolve(outArgument), zip = resolve(zipArgument), contextPath = join(root, 'context.private.json')
await mkdir(output, { recursive: true })
let context = phase === 'complete' ? JSON.parse(await readFile(contextPath)) : {}, rows = []
if (phase === 'complete') rows = JSON.parse(await readFile(join(output, 'process-exits.json')))
const save = (path, value) => writeFile(path, typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value, null, 2) + '\n', { mode: 0o600 })
const run = async (stage, command, args, options = {}) => {
  const record = { stage, started_at: new Date().toISOString() }
  const result = await new Promise(done => {
    const child = spawn(command, args, { env: options.env || process.env, cwd: options.cwd, stdio: ['pipe', 'pipe', 'pipe'] }), stdout = [], stderr = []
    let spawnError = null, timedOut = false
    child.on('error', error => { spawnError = error.code || 'SPAWN_ERROR' }); child.stdout.on('data', b => stdout.push(b)); child.stderr.on('data', b => stderr.push(b))
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); setTimeout(() => child.kill('SIGKILL'), 3000).unref() }, options.timeout || 1200000)
    child.stdin.on('error', () => {}); child.stdin.end(options.input)
    child.on('close', (code, signal) => { clearTimeout(timer); done({ code, signal, spawn_error: spawnError, timed_out: timedOut, stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr) }) })
  })
  const expected = options.expected || [0]
  rows.push({ ...record, code: result.code, signal: result.signal, spawn_error: result.spawn_error, timed_out: result.timed_out, expected_codes: expected, expectation_matched: expected.includes(result.code) && !result.signal && !result.spawn_error && !result.timed_out, finished_at: new Date().toISOString() })
  await save(join(output, 'process-exits.json'), rows)
  if (!(options.expected || [0]).includes(result.code) || result.signal || result.spawn_error || result.timed_out) {
    await save(join(output, 'failure-' + rows.length + '.json'), { stage, code: result.code, signal: result.signal, spawn_error: result.spawn_error, stderr_sha256: sha256(result.stderr), diagnostic: redactDiagnostic(result.stderr, context.env, context.admin, process.env) })
    throw Error('FRESH_VERIFICATION_STAGE_FAILED:' + stage)
  }
  return result.stdout.toString('utf8').trim()
}
const docker = (stage, args, options) => run(stage, 'docker', ['--host=unix:///var/run/docker.sock', ...args], options)
const inspect = async id => JSON.parse(await docker('inspect-' + rows.length, ['inspect', id]))[0]
const writeContext = () => save(contextPath, context)
const saveEnv = () => save(context.environmentFile, Object.entries(context.env).map(([name, value]) => name + '=' + value).join('\n') + '\n')
const saveOperation = () => save(context.operationFile, context.operation)
async function collectWrapperJournals() {
  if (!context.environmentFile) return 'NOT_EXECUTED_NO_WRAPPER_CONFIGURATION'
  const directory = context.environmentFile + '.didar-nginx-journal'
  let names
  try { names = (await readdir(directory)).filter(name => /^[0-9]+-[a-f0-9]+\.json$/.test(name)).sort() } catch (error) { if (error.code === 'ENOENT') return 'UNAVAILABLE_NO_WRAPPER_JOURNAL'; throw error }
  const journals = []
  for (const name of names) {
    const bytes = await readFile(join(directory, name)), record = JSON.parse(bytes)
    journals.push({ action: record.action, source_sha: record.source_sha, bundle_sha256: record.bundle_sha256, completed_at: record.completed_at, journal_sha256: sha256(bytes), process_exits: (record.process_exits || []).map(row => {
      const allowed = Object.fromEntries(['stage', 'kind', 'started_at', 'finished_at', 'code', 'signal', 'spawn_error', 'timed_out', 'stdout_sha256', 'stderr_sha256'].filter(key => Object.hasOwn(row, key)).map(key => [key, row[key]]))
      if (row.diagnostic) allowed.diagnostic = { stdout: redactDiagnostic(Buffer.from(row.diagnostic.stdout || ''), context.env, context.admin, process.env), stderr: redactDiagnostic(Buffer.from(row.diagnostic.stderr || ''), context.env, context.admin, process.env) }
      if (row.observation) allowed.observation = Object.fromEntries(['role', 'container_id', 'container_exit_code', 'running', 'health', 'oom_killed', 'resource_id', 'changed_fields'].filter(key => Object.hasOwn(row.observation, key)).map(key => [key, row.observation[key]]))
      return allowed
    }) })
  }
  await save(join(output, 'wrapper-journal-receipts.json'), { kind: 'SANITIZED_ACTUAL_WRAPPER_CHILD_RECEIPTS', raw_private_state_and_configuration_included: false, journals })
  return 'RETAINED_SANITIZED_ACTUAL_CHILD_RECEIPTS'
}
const wrapper = async action => {
  const env = { ...process.env }
  for (const name of Object.keys(env)) if (name.startsWith('COMPOSE_') || name.startsWith('DOCKER_') || Object.hasOwn(context.env, name)) delete env[name]
  const text = await run('protected-' + action, context.privateNodePath || process.execPath, [join(context.kit, 'stack.mjs'), context.environmentFile, join(context.kit, 'operator-manifest.json'), context.manifestHash, context.operationFile, action], { env, timeout: 1800000 })
  const result = JSON.parse(text)
  // Child wrapper journals every actual Docker/Compose exit separately.
  await save(join(output, 'wrapper-' + action + '-' + rows.length + '.json'), result)
  return result
}
const freePort = () => new Promise((done, reject) => { const server = createServer(); server.on('error', reject); server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => done(port)) }) })
const request = (path, { method = 'GET', body, headers = {} } = {}) => new Promise((done, reject) => {
  const bytes = body === undefined ? undefined : Buffer.from(JSON.stringify(body)), url = new URL(context.env.DIDAR_PUBLIC_ORIGIN + path)
  const req = https.request(url, { method, ca: context.ca, headers: { ...headers, ...(bytes ? { 'content-type': 'application/json', 'content-length': bytes.length } : {}) } }, response => { const chunks = []; response.on('data', b => chunks.push(b)); response.on('end', () => done({ status: response.statusCode, body: Buffer.concat(chunks).toString('utf8') })) })
  req.setTimeout(15000, () => req.destroy(Error('HTTP_TIMEOUT'))); req.on('error', reject); req.end(bytes)
})
async function verifyZIP() {
  assert.equal((await stat(zip)).size, 855651700, 'Exact final artifact size')
  assert.equal(await fileHash(zip), '53491cee474fee8573be7e630530f8f8e3d253920c0911e5e77a978e0f694a58', 'Exact final downloaded ZIP')
  context.release = join(root, 'accepted-release')
  await run('safe-final-zip-extraction', 'python3', ['-c', "import zipfile,pathlib,stat,sys\nz=zipfile.ZipFile(sys.argv[1]);r=pathlib.Path(sys.argv[2]);r.mkdir()\nfor i in z.infolist():\n p=pathlib.PurePosixPath(i.filename)\n assert not p.is_absolute() and '..' not in p.parts and not stat.S_ISLNK(i.external_attr>>16)\nz.extractall(r)\n", zip, context.release])
  await run('every-original-internal-checksum', 'sha256sum', ['--check', 'SHA256SUMS'], { cwd: context.release })
}

async function snapshot(stage) {
  const sql = "SELECT tablename FROM pg_tables WHERE schemaname='public' AND (tablename LIKE 'didar_%' OR tablename IN ('product','customer','seller','order')) AND tablename NOT LIKE '%session%' AND tablename NOT LIKE '%login%' AND tablename NOT LIKE '%nonce%' AND tablename NOT LIKE '%audit%' ORDER BY tablename"
  const tables = (await docker(stage + '-table-list', ['exec', context.ids.postgres, 'psql', '-U', context.env.DIDAR_DB_USER, '-d', context.env.DIDAR_DB_NAME, '-Atc', sql])).split('\n').filter(Boolean), result = {}
  for (const table of tables) {
    assert.match(table, /^[a-zA-Z0-9_]+$/)
    result[table] = await docker(stage + '-table-' + table, ['exec', context.ids.postgres, 'psql', '-U', context.env.DIDAR_DB_USER, '-d', context.env.DIDAR_DB_NAME, '-Atc', 'SELECT count(*)::text || \'|\' || md5(coalesce(string_agg(to_jsonb(t)::text, E\'\\n\' ORDER BY to_jsonb(t)::text),\'\')) FROM public."' + table + '" t'])
  }
  result.redis_sentinel = await docker(stage + '-redis', ['exec', context.ids.redis, 'redis-cli', 'GET', 'didar:fresh:persistence'])
  result.media = await docker(stage + '-media', ['exec', context.ids.api, 'node', '-e', "process.stdout.write(require('node:fs').readFileSync('/app/packages/api/.medusa/server/static/fresh-persistence.txt','utf8'))"])
  return result
}

let success = false
try {
  assert.equal(process.env.GITHUB_ACTIONS, 'true', 'This full-capacity harness is for a dedicated disposable Actions runner only')
  assert.equal(process.env.GITHUB_REF, 'refs/heads/ops/fresh-staging-install-0c4b047')
  if (phase === 'prepare') {
    await mkdir(root, { recursive: false, mode: 0o700 })
    const info = JSON.parse(await docker('capacity-docker-root', ['info', '--format', '{{json .}}'])), storage = await statfs(info.DockerRootDir)
    context.runnerRuntime = { kind: 'ACTUAL_SANITIZED_DISPOSABLE_RUNNER_OBSERVATION', node: process.version, docker: { server_version: info.ServerVersion, os_type: info.OSType, architecture: info.Architecture, cpus: info.NCPU, memory_bytes: info.MemTotal }, compose: await docker('actual-runner-compose-version', ['compose', 'version', '--short']), target_server_facts: false }
    await save(join(output, 'runner-runtime.json'), context.runnerRuntime)
    const free = Number(storage.bavail) * Number(storage.bsize)
    await save(join(output, 'capacity.json'), { before_load_free_bytes: free, required_free_bytes: 15 * 1024 ** 3 })
    assert.ok(free >= 15 * 1024 ** 3, 'At least 15GiB required before accepted-image load; no cleanup to bypass capacity')
    context.source = (await run('exact-installation-source', 'git', ['rev-parse', 'HEAD'])).trim()
    await run('accepted-application-unchanged', 'git', ['diff', '--exit-code', applicationSource, '--', 'apps', 'packages', 'bun.lock', 'package.json', 'Dockerfile', 'Dockerfile.prebuilt', 'Dockerfile.storefront'])
    await verifyZIP()
    const manifest = validateManifest(JSON.parse(await readFile(join(context.release, 'release-manifest.json'))), applicationSource)
    await verifyInstallKit(context.release, applicationSource, manifest.install_kit)
    assert.equal(manifest.archive_sha256, 'd623867da3e3392c99919bd49c3ee2855d3423577aa54d4efc4ad9088665288e')
    assert.equal(manifest.install_kit.sha256, 'bf9d9da07d92f9913a8080c9a07aee1fb0f6564a553d2ed5286ce3946edcf915')
    assert.equal(manifest.delivery_kind, 'ACCEPTED_MAIN_RELEASE')
    for (const role of ['api', 'storefront']) assert.equal(manifest.images[role].id, applicationImages[role])
    for (const role of ['api', 'storefront']) await docker('assert-accepted-image-not-preloaded-' + role, ['image', 'inspect', applicationImages[role]], { expected: [1] })
    await docker('load-unchanged-accepted-archive', ['load', '--input', join(context.release, manifest.archive)], { timeout: 1800000 })
    for (const role of ['api', 'storefront']) {
      const actual = JSON.parse(await docker('verify-accepted-image-' + role, ['image', 'inspect', manifest.images[role].local_tag]))[0]
      assert.equal(actual.Id, applicationImages[role]); assert.equal(actual.Config.Labels['org.opencontainers.image.revision'], applicationSource); assert.equal(actual.Os + '/' + actual.Architecture, 'linux/amd64')
    }
    await save(join(output, 'accepted-artifact-provenance.json'), { source_sha: applicationSource, installation_source_sha: context.source, artifact_id: 12178302167, release_run_id: 39229912918, artifact_bytes: 855651700, artifact_zip_sha256: await fileHash(zip), archive_sha256: manifest.archive_sha256, images: applicationImages, original_install_kit_sha256: manifest.install_kit.sha256, status: 'ACCEPTED_ARTIFACT_LOADED_AND_IDENTITIES_VERIFIED', no_application_builds: true, no_application_source_mounts: true })
    const dependencies = {}
    for (const [role, reference] of [['postgres', 'postgres:17-bookworm@sha256:66aafa11cf15800a3c94763f7e11d1e7b2e37e5e84bc4ce027cb6e1e4bfaf4df'], ['redis', 'redis:7-bookworm@sha256:cd745595f143052dd6a743bc5651d3ce4b03979fe5c99c7fcfab73461f6f217b']]) {
      await docker('pull-pinned-' + role, ['pull', reference]); dependencies[role] = { reference, image_id: JSON.parse(await docker('inspect-pinned-' + role, ['image', 'inspect', reference]))[0].Id }
    }
    const review = resolve('verification/fresh-install/accepted-release-review.json')
    assert.equal(await fileHash(review), '931f24a436ca98317e36376ef800fa2a7bb809ac8fa8ebe2578eecb56237b463')
    const dependenciesFile = join(root, 'dependencies.json'); await save(dependenciesFile, dependencies)
    const original = join(root, 'original-operator')
    await run('assemble-original-accepted-operator', process.execPath, [join(context.release, 'install-kit/scripts/ci/operator-bundle.mjs'), context.release, review, dependenciesFile, original])
    context.kit = join(root, 'candidate-operator')
    const amendment = await assembleFreshAmendment(original, await fileHash(join(original, 'operator-manifest.json')), context.source, context.kit)
    // Export the real matching target candidate before adding any QA labels,
    // fixture receipts, private runtime configuration, TLS or credentials.
    await exportFreshInstallKit({ originalDirectory: original, originalHash: await fileHash(join(original, 'operator-manifest.json')), candidateDirectory: context.kit, candidateHash: amendment.operator_manifest_sha256, sourceRoot: resolve('.'), installationSource: context.source, outputDirectory: output, run })
    const fixture = JSON.parse(await readFile(join(context.kit, 'operator-manifest.json')))
    fixture.kind = 'didar-nginx-wrapper-protocol-fixture'
    const compositionPath = join(context.kit, 'compose.topology.json'), composition = JSON.parse(await readFile(compositionPath))
    // Explicit QA-only label amendment, hash-bound from the outset. No service,
    // command, image, namespace, ingress or authentication policy changes.
    for (const service of Object.values(composition.services)) service.labels = { ...service.labels, 'didar.disposable-qa': 'true' }
    await save(compositionPath, composition); fixture.files['compose.topology.json'] = await fileHash(compositionPath)
    for (const field of ['artifact_verification', 'independent_review']) {
      const path = join(context.kit, 'fixture-' + field + '.json')
      await save(path, { status: 'FIXTURE_ONLY', source_sha: applicationSource, topology: 'nginx-verified-relay-v1', workspace_mounts: false, source_overlays: false, exit_code: 0, images: applicationImages, meaning: 'QA protocol subject only; not new artifact acceptance or Chief Architect approval' })
      const name = path.split('/').pop(); fixture.files[name] = await fileHash(path); fixture[field] = { path: name, sha256: fixture.files[name] }
    }
    await save(join(context.kit, 'operator-manifest.json'), fixture); context.manifestHash = await fileHash(join(context.kit, 'operator-manifest.json'))
    const nodeParent = join(root, 'private-node-parent'); await mkdir(nodeParent, { mode: 0o700 })
    await run('private-node-positive-provision', 'bash', [join(context.kit, 'provision-node.sh'), join(nodeParent, 'node-24.19.0')])
    context.privateNodePath = join(nodeParent, 'node-24.19.0/runtime/bin/node')
    const privateNodeVersion = await run('private-provisioned-node-version', context.privateNodePath, ['--version']); assert.equal(privateNodeVersion, 'v24.19.0')
    context.runnerRuntime.private_operator_node = { version: privateNodeVersion, actual_archive_sha256: await fileHash(join(nodeParent, 'node-24.19.0/node-v24.19.0-linux-x64.tar.xz')), system_runtime_modified: false }
    await save(join(output, 'runner-runtime.json'), context.runnerRuntime)
    context.project = 'didar-fresh-' + randomBytes(6).toString('hex'); context.environmentFile = join(root, 'fresh.env'); context.operationFile = join(root, 'operation.json')
    const tls = join(root, 'tls'); await mkdir(tls, { mode: 0o700 })
    await run('fresh-private-relay-tls', 'openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '2', '-subj', '/CN=relay.test', '-addext', 'subjectAltName=DNS:relay.test,DNS:localhost,IP:127.0.0.1', '-addext', 'basicConstraints=critical,CA:TRUE', '-keyout', join(tls, 'key.pem'), '-out', join(tls, 'cert.pem')])
    await copyFile(join(tls, 'cert.pem'), join(tls, 'ca.pem'))
    const keyPath = join(root, 'network.key'); await run('protected-write-once-network-key', context.privateNodePath, [join(context.kit, 'stack.mjs'), 'provision-network-key', keyPath])
    const key = (await readFile(keyPath, 'utf8')).trim(), dbPassword = randomBytes(32).toString('hex'), publicPort = await freePort()
    context.env = { DIDAR_COMPOSE_PROJECT: context.project, DIDAR_COMPOSE_NETWORK: context.project + '_network', DIDAR_POSTGRES_VOLUME: context.project + '_postgres', DIDAR_REDIS_VOLUME: context.project + '_redis', DIDAR_UPLOADS_VOLUME: context.project + '_uploads', DIDAR_API_IMAGE: applicationImages.api, DIDAR_STOREFRONT_IMAGE: applicationImages.storefront, DIDAR_POSTGRES_IMAGE: dependencies.postgres.reference, DIDAR_REDIS_IMAGE: dependencies.redis.reference, DIDAR_DB_USER: 'didar', DIDAR_DB_NAME: 'didar_fresh', DIDAR_DB_PASSWORD: dbPassword, DATABASE_URL: 'postgres://didar:' + dbPassword + '@postgres:5432/didar_fresh?sslmode=disable', REDIS_URL: 'redis://redis:6379/0', JWT_SECRET: randomBytes(32).toString('hex'), COOKIE_SECRET: randomBytes(32).toString('hex'), DIDAR_AUTH_NETWORK_KEY: key, DIDAR_PUBLIC_ORIGIN: 'https://127.0.0.1:' + publicPort, DIDAR_PUBLIC_ORIGIN_VERIFIED: 'false', DIDAR_AUTH_HOST_PORT: String(await freePort()), DIDAR_AUTH_INGRESS_PEERS: 'PENDING', DIDAR_AUTH_TLS_DIR: tls, DIDAR_AUTH_TLS_SERVER_NAME: 'relay.test' }
    context.admin = { DIDAR_BOOTSTRAP_EMAIL: 'fresh-admin@example.invalid', DIDAR_BOOTSTRAP_PASSWORD: randomBytes(24).toString('hex'), NATIVE_BOOTSTRAP_PASSWORD: randomBytes(24).toString('hex') }
    const adminPath = join(root, 'admin.private.json'), approvalPath = join(root, 'QA_FIXTURE_NOT_APPROVAL.json'); await save(adminPath, context.admin)
    const approvedFiles = Object.fromEntries(['stack.mjs', 'fresh.mjs', 'fresh-restore.mjs', 'compose.topology.json', 'provision-node.sh', 'fresh-operator-bundle.mjs'].map(name => [name, fixture.files[name]]))
    await save(approvalPath, { status: 'FIXTURE_ONLY', scope: 'QA_ONLY', authority: 'QA', preparation_only_mutations: true, domain_cutover_authorized: false, source_sha: applicationSource, approval_url: process.env.GITHUB_SERVER_URL + '/' + process.env.GITHUB_REPOSITORY + '/actions/runs/' + process.env.GITHUB_RUN_ID, reviewer: 'automated-protocol-fixture-not-architecture-approval', files: approvedFiles, images: Object.fromEntries(Object.entries(fixture.images).map(([role, image]) => [role, image.image_id])) })
    context.evidenceURL = process.env.GITHUB_SERVER_URL + '/' + process.env.GITHUB_REPOSITORY + '/actions/runs/' + process.env.GITHUB_RUN_ID
    context.operation = { format: 1, kind: 'PARALLEL_FRESH_INSTALL_PROTOCOL_FIXTURE', target_config: 'DISPOSABLE_QA', project: context.project, approval: { path: approvalPath, sha256: await fileHash(approvalPath) }, edge: null, restoration: { path: join(root, 'initial-restore.json'), evidence_url: context.evidenceURL }, admin: { path: adminPath, sha256: await fileHash(adminPath) } }
    const signer = join(root, 'signer'), config = join(root, 'nginx-config'); await mkdir(signer, { mode: 0o700 })
    for (const name of ['auth.mjs', 'sign.mjs']) await copyFile(join(context.kit, name), join(signer, name))
    render({ NJS_MODULE_FILE: '/usr/lib/nginx/modules/ngx_http_js_module.so', PID_FILE: '/tmp/didar-fresh-nginx.pid', SIGNER_DIRECTORY: signer, RELAY_ADDRESS: '127.0.0.1:' + context.env.DIDAR_AUTH_HOST_PORT, LISTEN_ADDRESS: '127.0.0.1:' + publicPort, PUBLIC_HOST: '127.0.0.1', PUBLIC_PORT: String(publicPort), TLS_CERT_FILE: join(tls, 'cert.pem'), TLS_KEY_FILE: join(tls, 'key.pem'), UPSTREAM_CA_FILE: join(tls, 'ca.pem'), RELAY_TLS_NAME: 'relay.test' }, config)
    const edgeEnvironment = join(root, 'edge.env'); await save(edgeEnvironment, 'DIDAR_AUTH_NETWORK_KEY=' + key + '\n')
    assert.match(process.env.DIDAR_QA_NGINX_IMAGE || '', /^sha256:[a-f0-9]{64}$/)
    context.edge = await docker('create-owned-host-namespace-nginx', ['create', '--network', 'host', '--label', 'didar.disposable-qa=true', '--env-file', edgeEnvironment, ...[tls, signer, config].flatMap(path => ['--mount', 'type=bind,src=' + path + ',dst=' + path + ',readonly']), process.env.DIDAR_QA_NGINX_IMAGE, 'nginx', '-c', join(config, 'nginx.conf'), '-g', 'daemon off;'])
    await docker('start-isolated-nginx-before-baseline', ['start', context.edge])
    context.edgeFiles = { signer, config, tls }; context.ca = await readFile(join(tls, 'ca.pem'), 'utf8')
    await saveEnv(); await saveOperation(); await writeContext()
    for (const action of ['fresh-preflight', 'fresh-dependencies', 'fresh-migrate', 'fresh-admin']) await wrapper(action)
    context.ids = JSON.parse(await readFile(context.environmentFile + '.didar-nginx-state.json')).ids
    const noDemo = JSON.parse(await docker('actual-fresh-no-demo-bootstrap-counts', ['exec', context.ids.postgres, 'psql', '-U', context.env.DIDAR_DB_USER, '-d', context.env.DIDAR_DB_NAME, '-Atc', "SELECT json_build_object('admins',(SELECT count(*) FROM didar_user WHERE role='admin'),'native_admins',(SELECT count(*) FROM public.\"user\" WHERE deleted_at IS NULL),'bridges',(SELECT count(*) FROM didar_native_actor),'products',(SELECT count(*) FROM didar_product),'offers',(SELECT count(*) FROM didar_offer),'uids',(SELECT count(*) FROM didar_inventory_item),'orders',(SELECT count(*) FROM didar_order),'payments',(SELECT count(*) FROM didar_payment_attempt),'journals',(SELECT count(*) FROM didar_fin_journal),'demo',(SELECT count(*) FROM didar_user WHERE email LIKE '%@didar.test'))"]))
    assert.deepEqual(noDemo, { admins: 1, native_admins: 1, bridges: 0, products: 0, offers: 0, uids: 0, orders: 0, payments: 0, journals: 0, demo: 0 }); await save(join(output, 'fresh-no-demo-bootstrap.json'), { status: 'PASS', counts: noDemo })
    const restored = await wrapper('fresh-restore-check'); context.initialRestore = JSON.parse(await readFile(restored.receipt_path)); context.ids = JSON.parse(await readFile(context.environmentFile + '.didar-nginx-state.json')).ids
    const tar = join(root, 'initial-backup.tar')
    await run('archive-private-fresh-backup', 'tar', ['-cf', tar, '-C', context.initialRestore.backup_directory, 'postgres.dump', 'redis.rdb', 'uploads.tar', 'configuration.private.json'])
    const encryptionKey = randomBytes(32), iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', encryptionKey, iv)
    const ciphertext = Buffer.concat([cipher.update(await readFile(tar)), cipher.final()])
    context.encryption = { key: encryptionKey.toString('hex'), iv: iv.toString('hex'), tag: cipher.getAuthTag().toString('hex'), ciphertext_sha256: sha256(ciphertext) }
    await save(join(output, 'initial-backup.aes256gcm'), ciphertext)
    await save(join(output, 'initial-restore-receipt.json'), context.initialRestore)
    await save(join(output, 'accepted-artifact-provenance.json'), { source_sha: applicationSource, installation_source_sha: context.source, artifact_id: 12178302167, release_run_id: 39229912918, artifact_bytes: 855651700, artifact_zip_sha256: await fileHash(zip), archive_sha256: manifest.archive_sha256, images: applicationImages, original_install_kit_sha256: manifest.install_kit.sha256, original_operator_manifest_sha256: amendment.original_operator_manifest_sha256 || await fileHash(join(original, 'operator-manifest.json')), candidate_fixture_manifest_sha256: context.manifestHash, fixture_only: true, no_application_builds: true, no_application_source_mounts: true })
    await writeContext(); success = true
  } else {
    context.ca = await readFile(join(context.edgeFiles.tls, 'ca.pem'), 'utf8')
    assert.match(process.env.FRESH_BACKUP_ARTIFACT_URL || '', new RegExp('^https://github\\.com/alirezasefidpour747/didar-b2c-marketplace/actions/runs/' + process.env.GITHUB_RUN_ID + '/artifacts/[0-9]+$'), 'Actual upload-artifact result URL required')
    const downloaded = resolve(readbackArgument)
    const readback = JSON.parse(await run('actual-downloaded-backup-child-verification', process.execPath, ['scripts/ci/verify-fresh-readback.mjs', contextPath, downloaded]))
    const actualReadbackExit = rows.at(-1)
    assert.equal(actualReadbackExit.code, 0); assert.equal(actualReadbackExit.signal, null)
    const publicationPath = join(root, 'readback.private.json')
    await save(publicationPath, { ...readback, exit_code: actualReadbackExit.code })
    context.operation.restoration = { path: join(root, 'initial-restore.json'), sha256: await fileHash(join(root, 'initial-restore.json')), publication: { path: publicationPath, sha256: await fileHash(publicationPath) } }; await saveOperation()
    const prepared = await wrapper('fresh-prepare-api'); context.ids = JSON.parse(await readFile(context.environmentFile + '.didar-nginx-state.json')).ids
    const observing = wrapper('fresh-observe-peer').then(value => ({ value }), error => ({ error }))
    let probe
    for (let count = 0; count < 60; count++) { try { probe = await request('/api/didar/login', { method: 'POST', body: JSON.parse(prepared.diagnostic_body) }); if (probe.status === 204) break } catch {} await new Promise(done => setTimeout(done, 500)) }
    const outcome = await observing; if (outcome.error) throw outcome.error
    const observed = outcome.value; assert.equal(probe?.status, 204); assert.equal(observed.signed_probe, 'PASS')
    context.env.DIDAR_AUTH_INGRESS_PEERS = observed.socket_peer.replace(/^::ffff:/, ''); await saveEnv()
    const modulePath = join(root, 'observed-ngx-http-js-module.so'); await docker('copy-observed-edge-module-for-hash', ['cp', context.edge + ':/usr/lib/nginx/modules/ngx_http_js_module.so', modulePath])
    const nginxVersion = await docker('actual-nginx-module-version', ['exec', context.edge, 'sh', '-c', 'nginx -V 2>&1']); assert.match(nginxVersion, /nginx\/1\.26\.3/)
    const discovery = join(root, 'actual-edge-discovery.json'); await save(discovery, { scope: 'DISPOSABLE_GITHUB_QA_ONLY', actual_peer: context.env.DIDAR_AUTH_INGRESS_PEERS, actual_api_id: context.ids.api, signed_probe: observed.signed_probe, nginx_version: nginxVersion })
    context.operation.edge = { maintenance: true, public_routes_enabled: false, observed_peers: context.env.DIDAR_AUTH_INGRESS_PEERS, tls_name: 'relay.test', secret_version: 'qa-initial-v1', discovery_file: discovery, discovery_sha256: await fileHash(discovery), matched_files: Object.fromEntries(await Promise.all(Object.entries({ module: modulePath, nginx_config: join(context.edgeFiles.config, 'nginx.conf'), signer_auth: join(context.edgeFiles.signer, 'auth.mjs'), signer_sign: join(context.edgeFiles.signer, 'sign.mjs') }).map(async ([role, path]) => [role, { path, sha256: await fileHash(path) }]))) }; await saveOperation()
    await wrapper('fresh-bind-peer'); const healthy = await wrapper('fresh-start'); context.ids = healthy.containers
    context.browser = { origin: context.env.DIDAR_PUBLIC_ORIGIN, ca_file: join(context.edgeFiles.tls, 'ca.pem'), output_dir: join(output, 'browser'), source_sha: applicationSource, run_id: context.project, admin_email: context.admin.DIDAR_BOOTSTRAP_EMAIL, admin_didar_password: context.admin.DIDAR_BOOTSTRAP_PASSWORD, admin_native_password: context.admin.NATIVE_BOOTSTRAP_PASSWORD, api_id: context.ids.api, fixture_file: join(root, 'browser-fixture.private.json'), root: resolve('.') }
    const browserConfig = join(root, 'browser.private.json'); await save(browserConfig, context.browser)
    await run('fresh-customer-admin-vendor-before-recovery', process.execPath, ['verification/fresh-install/browser.mjs', browserConfig, 'before-restart'], { timeout: 600000 })
    await docker('new-redis-persistence-sentinel', ['exec', context.ids.redis, 'redis-cli', 'SET', 'didar:fresh:persistence', context.project])
    await docker('new-media-persistence-sentinel', ['exec', context.ids.api, 'node', '-e', "require('node:fs').writeFileSync('/app/packages/api/.medusa/server/static/fresh-persistence.txt','fresh-persistence')"])
    const media = await request('/static/fresh-persistence.txt'); assert.equal(media.status, 200); assert.equal(media.body, 'fresh-persistence')
    const before = await snapshot('before-lifecycle')
    await wrapper('fresh-quiesce')
    // Quiesced disposable Redis may still hold short-lived native locks. Let
    // their observed natural TTLs finish; never flush or rewrite cache state.
    const ttl = Number(await docker('observed-quiesced-redis-max-positive-ttl', ['exec', context.ids.redis, 'redis-cli', '--raw', 'EVAL', "local m=0;for _,k in ipairs(redis.call('KEYS','*')) do local t=redis.call('PTTL',k);if t>m then m=t end end;return m", '0']))
    assert.ok(Number.isSafeInteger(ttl) && ttl >= 0 && ttl <= 300000, 'Unreviewed long-lived volatile Redis keys block this bounded recovery fixture')
    await save(join(output, 'natural-cache-expiry-wait.json'), { kind: 'ACTUAL_READ_ONLY_OBSERVATION_NOT_PROCESS_EXIT', observed_max_positive_ttl_ms: ttl, planned_natural_wait_ms: ttl ? ttl + 250 : 0, keys_flushed: false, values_rewritten: false })
    if (ttl) await new Promise(done => setTimeout(done, ttl + 250))
    context.operation.restoration = { path: join(root, 'checkpoint.json'), evidence_url: context.evidenceURL }; await saveOperation()
    const checkpoint = await wrapper('fresh-checkpoint'), backup = JSON.parse(await readFile(checkpoint.receipt_path))
    assert.equal(backup.scope, 'WRAPPER_PROTOCOL_FIXTURE'); assert.equal(backup.status, 'PASS'); assert.equal(backup.database_restoration, 'PASS'); assert.ok(Object.values(backup.restoration).every(value => value === 'PASS'))
    assert.deepEqual(backup.source_container_ids, context.ids); assert.deepEqual(backup.matched_application_images, applicationImages)
    const recoveryPath = join(root, 'recovery.json'), edge = structuredClone(context.operation.edge); delete edge.public_routes_enabled
    await save(recoveryPath, { status: 'PASS', from_bundle_sha256: context.manifestHash, to_bundle_sha256: context.manifestHash, source_sha: applicationSource, database_compatible: true, secret_version: edge.secret_version, images: applicationImages, edge_hashes: Object.fromEntries(Object.entries(edge.matched_files).map(([role, value]) => [role, value.sha256])), scope: 'SAME_BUNDLE_RECOVERY_AFTER_GENUINE_FOUR_CONTAINER_ISOLATED_RESTORE', checkpoint_sha256: await fileHash(checkpoint.receipt_path) })
    context.operation = { format: 1, target_config: 'DISPOSABLE_QA', project: context.project, network_id: healthy.network_id, containers: context.ids, backup: { status: 'VERIFIED', isolated_restore_status: 'PASS', evidence_file: checkpoint.receipt_path, evidence_sha256: await fileHash(checkpoint.receipt_path), source_container_ids: context.ids }, edge, recovery: { status: 'VERIFIED', from_bundle_sha256: context.manifestHash, to_bundle_sha256: context.manifestHash, evidence_file: recoveryPath, evidence_sha256: await fileHash(recoveryPath) } }; await saveOperation()
    await wrapper('quiesce'); await wrapper('migrate'); await wrapper('recover'); await wrapper('health')
    const state = JSON.parse(await readFile(context.environmentFile + '.didar-nginx-state.json')); context.ids = { ...context.ids, ...state.containers }
    const after = await snapshot('after-coordinated-same-bundle-recovery'); assert.deepEqual(after, before)
    context.browser.api_id = context.ids.api; await save(browserConfig, context.browser)
    await run('fresh-customer-admin-vendor-after-recovery', process.execPath, ['verification/fresh-install/browser.mjs', browserConfig, 'after-restart'], { timeout: 600000 })
    await save(join(output, 'persistence.json'), { status: 'PASS', before_sha256: sha256(JSON.stringify(before)), after_sha256: sha256(JSON.stringify(after)), authority_tables: Object.keys(before).filter(name => !['media', 'redis_sentinel'].includes(name)), postgres: 'PASS', redis: 'PASS', media: 'PASS', recovery: 'SAME_UNCHANGED_BUNDLE_ONLY', populated_legacy_financial_history: 'NOT_CLAIMED_EMPTY_FRESH_DATABASE' })
    await save(join(output, 'readback-verification.json'), JSON.parse(await readFile(publicationPath)))
    await writeContext(); success = true
  }
} finally {
  let journals
  try { journals = await collectWrapperJournals() } catch (error) { journals = 'FAILED_SANITIZED_JOURNAL_COLLECTION'; success = false; await save(join(output, 'journal-collection-failure.json'), { status: 'FAIL', error_sha256: sha256(String(error?.message || error)) }) }
  await save(join(output, 'result-' + phase + '.json'), { status: success ? phase === 'prepare' ? 'INITIALIZED_AWAITING_ACTUAL_ARTIFACT_READBACK' : 'PASS_SCOPED_FRESH_INSTALL_QA' : 'FAIL', accepted_application_source_sha: applicationSource, installation_source_sha: context.source || null, phase, fixture_only: true, target_config: 'BLOCKED', public_https: 'NOT_VERIFIED', no_application_rebuild: true, actual_process_exits_file: 'process-exits.json', wrapper_journals: journals, retained_resources: 'Owned resources retained until disposable GitHub runner teardown; no owner/executor cleanup', limits: ['No owner server operations', 'No target approval', 'No TLS/public Internet acceptance', 'No different-image/schema rollback claim', 'No permanent owner-target backup custody claim'] })
  if (journals === 'FAILED_SANITIZED_JOURNAL_COLLECTION') throw Error('SANITIZED_JOURNAL_COLLECTION_FAILED')
}
