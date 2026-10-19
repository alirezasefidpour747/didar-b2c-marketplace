import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, mkdir, rm, copyFile, chmod, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { parseConfiguration, localEnvironment, renderComposition, readBundle, versionAtLeast, sha256, bundleFiles, actions, main, verifyPrerequisiteFiles, verifyRecoveryEvidence } from '../scripts/deployment/nginx/stack.mjs'

const reference = byte => 'sha256:' + byte.repeat(64)
const values = () => ({
  DIDAR_COMPOSE_PROJECT: 'didar-qa', DIDAR_COMPOSE_NETWORK: 'didar-qa_default',
  DIDAR_POSTGRES_VOLUME: 'didar-qa_pg', DIDAR_REDIS_VOLUME: 'didar-qa_redis', DIDAR_UPLOADS_VOLUME: 'didar-qa_uploads',
  DIDAR_API_IMAGE: reference('a'), DIDAR_STOREFRONT_IMAGE: reference('b'), DIDAR_POSTGRES_IMAGE: reference('c'), DIDAR_REDIS_IMAGE: reference('d'),
  DIDAR_DB_USER: 'didar', DIDAR_DB_NAME: 'didar', DIDAR_DB_PASSWORD: 'literal$private#password',
  DATABASE_URL: 'postgres://didar:literal%24private%23password@postgres:5432/didar?sslmode=disable', REDIS_URL: 'redis://redis:6379/0',
  JWT_SECRET: 'literal$not_a_shell_command_$(false)_'.repeat(2), COOKIE_SECRET: 'cookie'.repeat(12), DIDAR_AUTH_NETWORK_KEY: 'network'.repeat(12),
  DIDAR_PUBLIC_ORIGIN: 'https://didar.test', DIDAR_PUBLIC_ORIGIN_VERIFIED: 'false', DIDAR_AUTH_HOST_PORT: '13000',
  DIDAR_AUTH_INGRESS_PEERS: '192.0.2.44', DIDAR_AUTH_TLS_DIR: '/private/tls', DIDAR_AUTH_TLS_SERVER_NAME: 'relay.test',
})
const envText = object => Object.entries(object).map(([key, value]) => key + '=' + value).join('\n') + '\n'

test('literal private configuration preserves existing secret characters without executing or reconstructing URLs', () => {
  assert.deepEqual(parseConfiguration('# private literal values\n' + envText(values())), values())
  const actual = parseConfiguration(envText({ ...values(), COOKIE_SECRET: 'x'.repeat(32) + '${DIDAR_AUTH_NETWORK_KEY} `touch NEVER` \\# with spaces' }))
  assert.equal(actual.COOKIE_SECRET, 'x'.repeat(32) + '${DIDAR_AUTH_NETWORK_KEY} `touch NEVER` \\# with spaces')
})
for (const [name, change, expected] of [
  ['duplicate', text => text + 'JWT_SECRET=' + 'x'.repeat(32), /DUPLICATE/],
  ['shell export', text => text.replace('JWT_SECRET=', 'export JWT_SECRET='), /INVALID_OR_DUPLICATE/],
  ['unknown key', text => text + 'DIDAR_SEED_DEMO=true', /INVALID_OR_DUPLICATE/],
  ['quoted dotenv ambiguity', text => text.replace('COOKIE_SECRET=', 'COOKIE_SECRET="'), /INVALID_ENV_VALUE/],
  ['CRLF', text => text.replace(/\n/g, '\r\n'), /INVALID_ENV_BYTES/],
  ['missing secret', text => text.replace(/^JWT_SECRET=.*\n/m, ''), /EXPLICIT_CONFIGURATION/],
  ['moving image tag', text => text.replace(reference('a'), 'didar/api:latest'), /IMMUTABLE_IMAGE/],
  ['wildcard peer', text => text.replace('192.0.2.44', '0.0.0.0'), /EXACT_OBSERVED_PEERS/],
  ['subnet peer', text => text.replace('192.0.2.44', '192.0.2.0/24'), /EXACT_OBSERVED_PEERS/],
  ['duplicate peer', text => text.replace('192.0.2.44', '192.0.2.44,192.0.2.44'), /EXACT_OBSERVED_PEERS/],
  ['non-HTTPS origin', text => text.replace('https://didar.test', 'http://didar.test'), /INVALID_PUBLIC_ORIGIN/],
  ['shared authoritative volume', text => text.replace('didar-qa_redis', 'didar-qa_pg'), /DISTINCT_AUTHORITATIVE/],
]) test('configuration fails closed: ' + name, () => assert.throws(() => parseConfiguration(change(envText(values()))), expected))

test('stale shell overrides fail without exposing the secret', () => {
  assert.throws(() => parseConfiguration(envText(values()), { JWT_SECRET: 'sensitive-stale-secret' }), error => error.message === 'STALE_ENV_OVERRIDE:JWT_SECRET' && !error.message.includes('sensitive-stale-secret'))
  assert.deepEqual(parseConfiguration(envText(values()), values()), values())
})
for (const [key, value] of [['DOCKER_HOST', 'ssh://owner.example'], ['DOCKER_HOST', 'tcp://127.0.0.1:2375'], ['DOCKER_CONTEXT', 'staging'], ['DOCKER_TLS_VERIFY', '1'], ['COMPOSE_FILE', '/private/override.yml'], ['COMPOSE_PROJECT_NAME', 'other'], ['COMPOSE_PROFILES', 'danger'], ['NODE_TLS_REJECT_UNAUTHORIZED', '0'], ['NODE_OPTIONS', '--import=unsafe.mjs']]) test('process overrides refused: ' + key + '=' + value, () => assert.throws(() => localEnvironment({ [key]: value }), /LOCAL_DOCKER|UNSAFE_PROCESS/))

test('sanitized Compose process receives no inherited deployment keys and retains managed proxy/CA', () => {
  const result = localEnvironment({ PATH: '/bin', HTTPS_PROXY: 'http://managed.test', NODE_EXTRA_CA_CERTS: '/managed/ca.pem', ...values(), DOCKER_HOST: 'unix:///var/run/docker.sock', DOCKER_CONTEXT: 'default' })
  assert.equal(result.HTTPS_PROXY, 'http://managed.test'); assert.equal(result.NODE_EXTRA_CA_CERTS, '/managed/ca.pem')
  assert.equal(result.JWT_SECRET, undefined); assert.equal(result.DOCKER_CONTEXT, undefined); assert.equal(result.COMPOSE_DISABLE_ENV_FILE, '1')
})

test('single-pass composition escapes literal dollars while retaining require-proof/shared namespace and stable values', async () => {
  const source = JSON.parse(await readFile(new URL('../scripts/deployment/nginx/compose.topology.json', import.meta.url), 'utf8'))
  const rendered = JSON.parse(renderComposition(source, values()))
  assert.equal(rendered.services.api.environment.JWT_SECRET, values().JWT_SECRET.replace(/\$/g, '$$$$'))
  assert.equal(rendered.services.api.environment.DATABASE_URL, values().DATABASE_URL)
  assert.equal(rendered.services.api.environment.DIDAR_AUTH_PROXY_POLICY, 'require-proof')
  assert.equal(rendered.services.storefront.environment.DIDAR_AUTH_INGRESS_MODE, 'verified-relay')
  assert.equal(rendered.services.storefront.network_mode, 'service:api')
  assert.equal(rendered.services.api.environment.DIDAR_SEED_DEMO, 'false')
  source.services.api.environment.INJECT = '${UNREVIEWED:?no}'
  assert.throws(() => renderComposition(source, values()), /UNKNOWN_TEMPLATE_VARIABLE/)
  delete source.services.api.environment.INJECT; source.services.storefront.network_mode = 'host'
  assert.throws(() => renderComposition(source, values()), /REVIEWED_TRUST_TOPOLOGY/)
})

test('supported minimum versions are explicit, including observed versions; unknown majors need review', () => {
  assert.equal(versionAtLeast('26.1.5', '26.1.5', 26), true)
  assert.equal(versionAtLeast('26.1.4', '26.1.5', 26), false)
  assert.equal(versionAtLeast('v2.26.1', '2.26.1', 2), true)
  assert.equal(versionAtLeast('2.26.0', '2.26.1', 2), false)
  assert.equal(versionAtLeast('3.0.0', '2.26.1', 2), false)
  assert.equal(versionAtLeast('version unknown', '2.26.1', 2), false)
})

test('closed CLI rejects destructive/passthrough commands before opening configuration or touching Docker', async () => {
  for (const action of ['down', 'rm', 'build', '--remove-orphans', '--file', '--volumes', 'up', 'exec']) {
    assert.equal(actions.includes(action), false)
    await assert.rejects(main(['/no/private.env', '/no/manifest.json', 'f'.repeat(64), '/no/operation.json', action], {}), /Usage/)
  }
})

test('CLI refuses readable or symlinked private inputs before any Docker operation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'didar-wrapper-private-'))
  try {
    const path = join(root, 'topology.env')
    await writeFile(path, envText(values()), { mode: 0o600 }); await chmod(path, 0o644)
    const args = file => [file, '/not/a/manifest.json', 'f'.repeat(64), '/not/an/operation.json', 'preflight']
    await assert.rejects(main(args(path), {}), /PRIVATE_FILE_0600_OWNER_REQUIRED/)
    await chmod(path, 0o600)
    const link = join(root, 'linked.env'); await symlink(path, link)
    await assert.rejects(main(args(link), {}), /PRIVATE_FILE_0600_OWNER_REQUIRED/)
    const parentLink = join(root, 'parent-link'); await symlink(root, parentLink)
    await assert.rejects(main(args(join(parentLink, 'topology.env')), {}), /SYMLINKED_PRIVATE_PATH_REFUSED/)
  } finally { await rm(root, { recursive: true, force: true }) }
})

async function manifestFixture(callback) {
  const directory = await mkdtemp(join(tmpdir(), 'didar-wrapper-unit-'))
  try {
    const files = {}
    for (const name of bundleFiles) { await copyFile(new URL('../scripts/deployment/nginx/' + name, import.meta.url), join(directory, name)); files[name] = sha256(await readFile(join(directory, name))) }
    const manifest = { format: 1, kind: 'didar-nginx-verified-topology', source_sha: 'a'.repeat(40), platform: 'linux/amd64', files,
      images: Object.fromEntries(['api', 'storefront', 'postgres', 'redis'].map((role, index) => [role, { reference: reference('abcd'[index]), image_id: reference('abcd'[index]) }])),
      artifact_verification: { path: 'artifact.json' }, independent_review: { path: 'review.json' } }
    for (const [name, status] of [['artifact_verification', 'PASS'], ['independent_review', 'APPROVED']]) {
      const receipt = { status, source_sha: manifest.source_sha, topology: 'nginx-verified-relay-v1', workspace_mounts: false, source_overlays: false, exit_code: 0, images: { api: manifest.images.api.image_id, storefront: manifest.images.storefront.image_id } }
      await writeFile(join(directory, manifest[name].path), JSON.stringify(receipt)); manifest[name].sha256 = sha256(await readFile(join(directory, manifest[name].path)))
    }
    const save = async () => { const bytes = JSON.stringify(manifest); await writeFile(join(directory, 'manifest.json'), bytes); return sha256(bytes) }
    await callback({ directory, manifest, save })
  } finally { await rm(directory, { recursive: true, force: true }) }
}

test('bundle validation requires reviewed new-artifact identities and detects tampering independently of filename', async () => manifestFixture(async ({ directory, manifest, save }) => {
  const path = join(directory, 'manifest.json'), digest = await save()
  const bundle = await readBundle(path, digest); assert.equal(bundle.manifest.source_sha, 'a'.repeat(40))
  await assert.rejects(readBundle(path, 'b'.repeat(64)), /MANIFEST_HASH/)
  await writeFile(join(directory, 'auth.mjs'), 'tampered signer')
  await assert.rejects(readBundle(path, digest), /BUNDLE_HASH_MISMATCH:auth.mjs/)
  manifest.files['auth.mjs'] = sha256('tampered signer'); manifest.files['../outside'] = 'a'.repeat(64)
  await assert.rejects(readBundle(path, await save()), /INVALID_BUNDLE_FILE/)
}))

test('old-image, inherited, overlaid or mismatched-source evidence cannot authorize this bundle', async () => manifestFixture(async ({ directory, manifest, save }) => {
  const path = join(directory, 'manifest.json'), receiptPath = join(directory, 'artifact.json')
  const original = JSON.parse(await readFile(receiptPath, 'utf8'))
  for (const change of [{ source_overlays: true }, { workspace_mounts: true }, { status: 'INHERITED' }, { exit_code: 1 }, { source_sha: 'b'.repeat(40) }, { images: { ...original.images, api: reference('e') } }]) {
    await writeFile(receiptPath, JSON.stringify({ ...original, ...change })); manifest.artifact_verification.sha256 = sha256(await readFile(receiptPath))
    await assert.rejects(readBundle(path, await save()), /NEW_ARTIFACT_ACCEPTANCE|EVIDENCE_IMAGE_MISMATCH/)
  }
}))

test('protocol fixture receipts are explicit and can never become production authorization', async () => manifestFixture(async ({ directory, manifest, save }) => {
  manifest.kind = 'didar-nginx-wrapper-protocol-fixture'
  for (const name of ['artifact_verification', 'independent_review']) {
    const path = join(directory, manifest[name].path), receipt = JSON.parse(await readFile(path, 'utf8'))
    receipt.status = 'FIXTURE_ONLY'; await writeFile(path, JSON.stringify(receipt)); manifest[name].sha256 = sha256(await readFile(path))
  }
  const path = join(directory, 'manifest.json'), digest = await save()
  await assert.rejects(readBundle(path, digest), /INVALID_BUNDLE_PROVENANCE/)
  assert.equal((await readBundle(path, digest, { allowFixture: true })).manifest.kind, 'didar-nginx-wrapper-protocol-fixture')
}))


test('backup prerequisite evidence is bound to actual source IDs and complete isolated production restoration', async () => {
  const root = await mkdtemp(join(tmpdir(), 'didar-wrapper-backup-'))
  try {
    const path = join(root, 'backup.json'), discovery = join(root, 'discovery.json')
    await writeFile(discovery, JSON.stringify({ status: 'OPERATOR_VERIFIED_DISCOVERY' }))
    const containers = Object.fromEntries(['api', 'storefront', 'postgres', 'redis'].map((role, n) => [role, 'abcd'[n].repeat(64)]))
    const original = { status: 'PASS', source_container_ids: containers, restoration: { postgres: 'PASS', redis: 'PASS', uploads: 'PASS', configuration: 'PASS' }, isolated_volumes: { postgres: 'isolated-postgres', redis: 'isolated-redis', uploads: 'isolated-uploads' } }
    const operation = { target_config: 'VERIFIED', containers, backup: { evidence_file: path }, edge: { discovery_file: discovery, discovery_sha256: sha256(await readFile(discovery)), matched_files: {} } }
    const save = async receipt => { await writeFile(path, JSON.stringify(receipt)); operation.backup.evidence_sha256 = sha256(await readFile(path)) }
    await save(original); await verifyPrerequisiteFiles(operation, values())
    for (const change of [
      { source_container_ids: { ...containers, api: 'f'.repeat(64) } },
      { status: 'INHERITED' },
      { restoration: { ...original.restoration, redis: 'UNEXECUTED' } },
      { restoration: { postgres: 'PASS' } },
      { isolated_volumes: { ...original.isolated_volumes, postgres: values().DIDAR_POSTGRES_VOLUME } },
      { isolated_volumes: { postgres: 'same', redis: 'same', uploads: 'other' } },
    ]) {
      await save({ ...original, ...change })
      await assert.rejects(verifyPrerequisiteFiles(operation, values()), /BACKUP_EVIDENCE_SUBJECT|COMPLETE_ISOLATED|ISOLATED_RESTORATION/)
    }
    await save(original); await writeFile(path, 'tampered')
    await assert.rejects(verifyPrerequisiteFiles(operation, values()), /OPERATION_EVIDENCE_OR_EDGE_HASH_CHANGED/)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('matched recovery receipt cannot substitute source/image/config/signer/key-version or database compatibility', async () => {
  const root = await mkdtemp(join(tmpdir(), 'didar-wrapper-recovery-'))
  try {
    const path = join(root, 'recovery.json'), bundle = { hash: 'b'.repeat(64), manifest: { source_sha: 'c'.repeat(40), images: { api: { image_id: reference('d') }, storefront: { image_id: reference('e') } } } }
    const operation = { recovery: { from_bundle_sha256: 'a'.repeat(64), evidence_file: path }, edge: { secret_version: 'stable-v1', matched_files: { module: { sha256: 'f'.repeat(64) }, nginx_config: { sha256: 'e'.repeat(64) }, signer_auth: { sha256: 'd'.repeat(64) }, signer_sign: { sha256: 'c'.repeat(64) } } } }
    const original = { status: 'PASS', from_bundle_sha256: operation.recovery.from_bundle_sha256, to_bundle_sha256: bundle.hash, source_sha: bundle.manifest.source_sha, database_compatible: true, secret_version: operation.edge.secret_version, images: { api: reference('d'), storefront: reference('e') }, edge_hashes: Object.fromEntries(Object.entries(operation.edge.matched_files).map(([role, file]) => [role, file.sha256])) }
    const save = async receipt => { await writeFile(path, JSON.stringify(receipt)); operation.recovery.evidence_sha256 = sha256(await readFile(path)) }
    await save(original); await verifyRecoveryEvidence(operation, bundle)
    for (const change of [
      { from_bundle_sha256: 'f'.repeat(64) }, { to_bundle_sha256: 'f'.repeat(64) }, { source_sha: 'f'.repeat(40) }, { database_compatible: false }, { secret_version: 'new-unapproved-key' }, { status: 'UNIDENTIFIED_LEGACY' }, { images: { ...original.images, api: reference('f') } }, { edge_hashes: { ...original.edge_hashes, signer_auth: 'f'.repeat(64) } }, { edge_hashes: { ...original.edge_hashes, module: 'a'.repeat(64) } },
    ]) { await save({ ...original, ...change }); await assert.rejects(verifyRecoveryEvidence(operation, bundle), /RECOVERY_EVIDENCE_(SUBJECT|IMAGE|EDGE)_MISMATCH/) }
    await save(original); await writeFile(path, 'tampered')
    await assert.rejects(verifyRecoveryEvidence(operation, bundle), /RECOVERY_EVIDENCE_HASH_MISMATCH/)
  } finally { await rm(root, { recursive: true, force: true }) }
})
