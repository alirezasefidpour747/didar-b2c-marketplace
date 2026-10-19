import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, mkdir, rm, copyFile, chmod, symlink, lstat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { parseConfiguration, localEnvironment, renderComposition, readBundle, versionAtLeast, sha256, bundleFiles, actions, main, verifyPrerequisiteFiles, verifyRecoveryEvidence, redactDiagnostic, runner, sanitizeFixtureObservation, containerSummary, resolveComposition, verifyPreservedEnvironment, verifyPreservedMounts } from '../scripts/deployment/nginx/stack.mjs'

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

const postgresDifference = () => ({ kind: 'POSTGRES_DUMP_DIFFERENCE_V1', source_sha256: sha256('source'), restored_sha256: sha256('restored'), source_line_count: 10, restored_line_count: 10, source_byte_count: 100, restored_byte_count: 100, section_order_equal: true, differing_section_count: 1, first_difference: { source_line: 8, restored_line: 8, source_class: 'COPY_DATA', restored_class: 'COPY_DATA', source_line_sha256: sha256('source-line'), restored_line_sha256: sha256('restored-line') }, section_differences: [{ section_type: 'TABLE_DATA', section_identity_sha256: sha256('section'), source_sha256: sha256('source-section'), restored_sha256: sha256('restored-section'), source_lines: 2, restored_lines: 2, source_rows: 1, restored_rows: 1, row_multiset_equal: false }] })
const ddlDifference = () => ({ kind: 'POSTGRES_DDL_DIFFERENCE_V1', changed_line_count: 1, lines: [{ section_type: 'TABLE', section_identity_sha256: sha256('section'), source_line: 10, restored_line: 10, source_line_sha256: sha256('source-line'), restored_line_sha256: sha256('restored-line'), source_token_count: 3, restored_token_count: 3, source_tokens: ['KEYWORD:CHECK', 'PUNCTUATION:LPAREN', 'IDENTIFIER:' + sha256('private-identifier') + ':18'], restored_tokens: ['KEYWORD:CHECK', 'PUNCTUATION:LPAREN', 'OPERATOR:NE'] }] })

test('known-DDL proof and alias observations retain actual scoped hashes and booleans without inventing process exits', () => {
  const proof = { kind: 'POSTGRES_KNOWN_DDL_EQUIVALENCE_V1', postgres_image_id: reference('c'), application_source_sha: 'a'.repeat(40), query_sha256: sha256('fixed-public-query-fixture'), and_cases: 27, array_cases: 343, any_cases: 2401, and_associativity: true, array_cast_equivalence: true, any_cast_equivalence: false, array_type_equivalence: true }
  const aliases = { kind: 'POSTGRES_KNOWN_DDL_ALIASES_V1', application_source_sha: 'a'.repeat(40), postgres_image_id: reference('c'), source_sha256: sha256('source'), restored_sha256: sha256('restored'), canonical_sha256: sha256('canonical'), alias_count: 1, aliases: [{ section_identity_sha256: sha256('section'), source_line_sha256: sha256('source-line'), restored_line_sha256: sha256('restored-line') }] }
  const receipts = [], run = runner({}, receipts); run.enableFixtureDiagnostics()
  for (const [stage, value] of [['fresh-postgres-equivalence-proof', proof], ['fresh-postgres-known-aliases', aliases]]) {
    assert.deepEqual(sanitizeFixtureObservation(stage, value), value)
    run.recordFixtureObservation(stage, value)
    assert.equal(Object.hasOwn(receipts.at(-1), 'code'), false)
    for (const invalid of [{ ...value, raw_sql: 'PRIVATE_SQL_CANARY' }, { ...value, application_source_sha: ['a'.repeat(40)] }, { ...value, postgres_image_id: [reference('c')] }]) assert.equal(sanitizeFixtureObservation(stage, invalid), null)
  }
  assert.equal(receipts[0].observation.any_cast_equivalence, false, 'A failed semantic assertion remains a false observation, never a successful exit')
  assert.equal(sanitizeFixtureObservation('fresh-postgres-equivalence-proof', { ...proof, and_cases: 26 }), null)
  assert.equal(sanitizeFixtureObservation('fresh-postgres-equivalence-proof', { ...proof, and_associativity: 'true' }), null)
  assert.equal(sanitizeFixtureObservation('fresh-postgres-known-aliases', { ...aliases, alias_count: 2 }), null)
  assert.equal(sanitizeFixtureObservation('fresh-postgres-known-aliases', { ...aliases, alias_count: 4, aliases: Array(4).fill(aliases.aliases[0]) }), null)
  assert.equal(sanitizeFixtureObservation('fresh-postgres-known-aliases', { ...aliases, aliases: [{ ...aliases.aliases[0], identifier: 'PRIVATE_SQL_CANARY' }] }), null)
})

test('DDL diagnostic allows bounded fixed SQL token enums and hash/length-only private tokens in QA observations', () => {
  const observation = ddlDifference(), receipts = [], run = runner({}, receipts)
  run.recordFixtureObservation('fresh-postgres-ddl-difference', observation); assert.deepEqual(receipts, [])
  run.enableFixtureDiagnostics(); run.recordFixtureObservation('fresh-postgres-ddl-difference', observation)
  assert.deepEqual(receipts[0].observation, observation); assert.equal(Object.hasOwn(receipts[0], 'code'), false)
  const text = JSON.stringify(receipts); assert.equal(text.includes('private-identifier'), false)
  observation.lines[0].source_tokens[0] = 'PRIVATE_SQL_CANARY'
  assert.equal(receipts[0].observation.lines[0].source_tokens[0], 'KEYWORD:CHECK')
})

test('DDL diagnostic rejects raw tokens, unknown enums/keys, malformed hashes/counts and over-limit arrays', () => {
  const changes = [
    value => { value.raw_sql = 'PRIVATE_SQL_CANARY' },
    value => { value.lines[0].section_name = 'PRIVATE_SQL_CANARY' },
    value => { value.lines[0].section_type = 'TABLE_DATA' },
    value => { value.lines[0].source_tokens = ['PRIVATE_SQL_CANARY'] },
    value => { value.lines[0].source_tokens = ['KEYWORD:PRIVATE_SQL_CANARY'] },
    value => { value.lines[0].source_tokens = ['__proto__:PRIVATE_SQL_CANARY'] },
    value => { value.lines[0].source_tokens = ['IDENTIFIER:PRIVATE_SQL_CANARY:18'] },
    value => { value.lines[0].source_tokens = ['IDENTIFIER:' + sha256('id') + ':01'] },
    value => { value.lines[0].source_tokens = ['STRING_LITERAL:' + sha256('private') + ':1000000001'] },
    value => { value.lines[0].source_tokens = ['COMMENT:' + sha256('private') + ':-1'] },
    value => { value.lines[0].source_tokens = [null] },
    value => { value.lines[0].source_token_count = 0 },
    value => { value.lines[0].source_tokens = Array(257).fill('KEYWORD:CHECK'); value.lines[0].source_token_count = 257 },
    value => { value.lines = Array(11).fill(value.lines[0]); value.changed_line_count = 11 },
  ]
  const receipts = [], run = runner({}, receipts); run.enableFixtureDiagnostics()
  for (const change of changes) {
    const value = ddlDifference(); change(value)
    assert.equal(sanitizeFixtureObservation('fresh-postgres-ddl-difference', value), null)
    run.recordFixtureObservation('fresh-postgres-ddl-difference', value)
  }
  assert.deepEqual(receipts, [])
})

test('PostgreSQL mismatch observation retains only strict hash/count/enum evidence in enabled QA journals', () => {
  const observation = postgresDifference(), receipts = [], run = runner({}, receipts)
  assert.deepEqual(sanitizeFixtureObservation('fresh-postgres-logical-difference', observation), observation)
  run.recordFixtureObservation('fresh-postgres-logical-difference', observation)
  assert.equal(receipts.length, 0, 'Production/default journals do not gain QA observations')
  run.enableFixtureDiagnostics()
  run.recordFixtureObservation('fresh-postgres-logical-difference', observation)
  assert.equal(receipts.length, 1); assert.deepEqual(receipts[0].observation, observation)
  assert.equal(receipts[0].kind, 'FIXTURE_OBSERVATION_NOT_PROCESS_EXIT'); assert.equal(Object.hasOwn(receipts[0], 'code'), false)
  observation.first_difference.source_class = 'PRIVATE_SQL_CANARY'
  assert.equal(receipts[0].observation.first_difference.source_class, 'COPY_DATA', 'Journal owns an immutable copy of the safe values')
})

test('PostgreSQL mismatch diagnostic rejects SQL, identities, paths, unexpected keys and malformed values without emitting them', () => {
  const changes = [
    value => { value.sql = 'PRIVATE_SQL_CANARY' },
    value => { value.first_difference.raw_line = 'PRIVATE_SQL_CANARY' },
    value => { value.first_difference.source_class = 'PRIVATE_SQL_CANARY' },
    value => { value.first_difference.source_line_sha256 = '/private/PRIVATE_SQL_CANARY' },
    value => { value.section_differences[0].relation_name = 'PRIVATE_SQL_CANARY' },
    value => { value.section_differences[0].section_type = 'PRIVATE_SQL_CANARY' },
    value => { value.section_differences[0].source_sha256 = 'PRIVATE_SQL_CANARY' },
    value => { value.section_differences[0].source_rows = -1 },
    value => { value.section_order_equal = 'true' },
    value => { value.source_byte_count = Infinity },
    value => { value.section_differences = Array(26).fill(value.section_differences[0]); value.differing_section_count = 26 },
  ]
  const receipts = [], run = runner({}, receipts); run.enableFixtureDiagnostics()
  for (const change of changes) {
    const value = postgresDifference(); change(value)
    assert.equal(sanitizeFixtureObservation('fresh-postgres-logical-difference', value), null)
    run.recordFixtureObservation('fresh-postgres-logical-difference', value)
  }
  assert.deepEqual(receipts, [])
})

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


test('failed-stage diagnostics redact private-file-only secrets and encoded forms absent from child process env', () => {
  const privateConfig = { JWT_SECRET: 'FileOnlyJWT_' + 'a'.repeat(40), COOKIE_SECRET: 'FileOnlyCookie_' + 'b'.repeat(40), DIDAR_AUTH_NETWORK_KEY: 'FileOnlyNetwork$#' + 'c'.repeat(40), DIDAR_DB_PASSWORD: 'Short7', DATABASE_URL: 'postgres://user:File%24Only%23Password@db/didar' }
  const processConfig = { PATH: '/bin', HTTPS_PROXY: 'http://proxy-user:proxy-secret@managed.test' }
  const canaries = [...Object.values(privateConfig), ...Object.values(privateConfig).map(encodeURIComponent), ...Object.values(privateConfig).map(value => encodeURIComponent(encodeURIComponent(value)))]
  const raw = Buffer.from('ERROR ' + canaries.join('\n') + '\n' + processConfig.HTTPS_PROXY + '\nBearer fake.jwt.token')
  const redacted = redactDiagnostic(raw, privateConfig, processConfig)
  for (const canary of canaries) assert.equal(redacted.includes(canary), false)
  assert.equal(redacted.includes('proxy-secret'), false); assert.equal(redacted.includes('fake.jwt.token'), false)
  assert.match(redacted, /REDACTED/)
})


test('internal Compose environment is not re-entered as operator input, while caller Compose overrides remain rejected', () => {
  const inherited = { PATH: '/bin', HTTPS_PROXY: 'http://managed.test', NODE_EXTRA_CA_CERTS: '/managed/ca.pem' }
  const internal = localEnvironment(inherited)
  assert.equal(internal.COMPOSE_DISABLE_ENV_FILE, '1')
  assert.throws(() => localEnvironment(internal), /UNSAFE_PROCESS_OVERRIDE:COMPOSE_DISABLE_ENV_FILE/)
  const operator = { ...internal }; delete operator.COMPOSE_DISABLE_ENV_FILE
  assert.deepEqual(localEnvironment(operator), internal)
  assert.throws(() => localEnvironment({ ...operator, COMPOSE_DISABLE_ENV_FILE: '1' }), /UNSAFE_PROCESS_OVERRIDE:COMPOSE_DISABLE_ENV_FILE/)
  assert.throws(() => localEnvironment({ ...operator, COMPOSE_FILE: '/untrusted/override.yml' }), /UNSAFE_PROCESS_OVERRIDE:COMPOSE_FILE/)
})


test('actual CLI denies a protocol fixture in BLOCKED target mode before invoking any Docker command', async () => manifestFixture(async ({ directory, manifest, save }) => {
  manifest.kind = 'didar-nginx-wrapper-protocol-fixture'
  for (const name of ['artifact_verification', 'independent_review']) {
    const path = join(directory, manifest[name].path), receipt = JSON.parse(await readFile(path, 'utf8'))
    receipt.status = 'FIXTURE_ONLY'; await writeFile(path, JSON.stringify(receipt)); manifest[name].sha256 = sha256(await readFile(path))
  }
  const environmentFile = join(directory, 'private.env'), operation = join(directory, 'operation.json'), bin = join(directory, 'bin'), marker = join(directory, 'docker-invoked')
  await writeFile(environmentFile, envText(values()), { mode: 0o600 })
  await writeFile(operation, JSON.stringify({ target_config: 'BLOCKED' }), { mode: 0o600 })
  await mkdir(bin)
  const docker = join(bin, 'docker')
  await writeFile(docker, '#!' + process.execPath + '\nrequire("node:fs").writeFileSync(' + JSON.stringify(marker) + ',"unexpected invocation");process.exit(73)\n', { mode: 0o700 })
  const result = spawnSync(process.execPath, [resolve(import.meta.dirname, '../scripts/deployment/nginx/stack.mjs'), environmentFile, join(directory, 'manifest.json'), await save(), operation, 'quiesce'], { encoding: 'utf8', env: { PATH: bin } })
  assert.equal(result.status, 2); assert.equal(result.signal, null); assert.equal(result.error, undefined)
  assert.equal(result.stderr.trim(), 'INVALID_BUNDLE_PROVENANCE')
  await assert.rejects(lstat(marker), { code: 'ENOENT' })
}))


test('actual failed Docker child records redacted private diagnostics while its thrown CLI code stays bounded', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'didar-wrapper-diagnostic-'))
  try {
    const privateConfiguration = { JWT_SECRET: 'private-file-only-jwt-' + 'a'.repeat(32), DIDAR_AUTH_NETWORK_KEY: 'private-file-only-network-' + 'b'.repeat(32), DIDAR_DB_PASSWORD: 'private$database#canary' }
    const latePrivateCredentials = { DIDAR_BOOTSTRAP_PASSWORD: 'late-first-admin$secret#' + 'c'.repeat(32), NATIVE_BOOTSTRAP_PASSWORD: 'late-native-admin$secret#' + 'd'.repeat(32) }
    const allPrivate = { ...privateConfiguration, ...latePrivateCredentials }
    const canary = Object.values(allPrivate).join(' ') + ' ' + Object.values(allPrivate).map(encodeURIComponent).join(' ')
    const executable = join(directory, 'docker')
    await writeFile(executable, '#!' + process.execPath + '\nconst value=Buffer.from(' + JSON.stringify(Buffer.from(canary).toString('base64')) + ',"base64");process.stdout.write(value);process.stderr.write(value);process.exit(73)\n', { mode: 0o700 })
    const productionReceipts = []
    await assert.rejects(runner({ PATH: directory }, productionReceipts, privateConfiguration)('production-diagnostic-denied', []), /DOCKER_STAGE_FAILED:production-diagnostic-denied:exit=73/)
    assert.equal(productionReceipts[0].diagnostic, undefined); assert.match(productionReceipts[0].stdout_sha256, /^[a-f0-9]{64}$/); assert.match(productionReceipts[0].stderr_sha256, /^[a-f0-9]{64}$/)
    assert.equal(JSON.stringify(productionReceipts).includes('private-file-only'), false)
    const receipts = [], qa = runner({ PATH: directory }, receipts, privateConfiguration)
    qa.addPrivateDiagnosticSource(latePrivateCredentials)
    qa.enableFixtureDiagnostics(stage => stage === 'deliberate-failure') // Owned fixture stages only; never unrelated container discovery.
    await assert.rejects(qa('deliberate-failure', []), error => error.message === 'DOCKER_STAGE_FAILED:deliberate-failure:exit=73')
    assert.equal(receipts.length, 1); assert.equal(receipts[0].code, 73); assert.equal(receipts[0].signal, null); assert.equal(receipts[0].spawn_error, null)
    for (const stream of ['stdout', 'stderr']) {
      for (const value of Object.values(allPrivate)) { assert.equal(receipts[0].diagnostic[stream].includes(value), false); assert.equal(receipts[0].diagnostic[stream].includes(encodeURIComponent(value)), false) }
      assert.match(receipts[0].diagnostic[stream], /REDACTED/)
    }
    await assert.rejects(qa('fresh-observe-container-unrelated', []), /exit=73/)
    assert.equal(receipts[1].diagnostic, undefined, 'Unrelated/private discovery output is never retained')
  } finally { await rm(directory, { recursive: true, force: true }) }
})


test('preservation compares all mount fields while treating Docker mount iteration order as unordered', () => {
  const original = { Id: 'a'.repeat(64), Name: '/owned-restore-loader', Image: reference('b'), HostConfig: { NetworkMode: 'none', PortBindings: null }, State: { Running: false, StartedAt: '2026-10-19T00:00:00Z' }, Mounts: [{ Type: 'volume', Name: 'isolated-uploads', Source: '/var/lib/docker/volumes/isolated-uploads/_data', Destination: '/restore/uploads', RW: true }, { Type: 'volume', Name: 'isolated-redis', Source: '/var/lib/docker/volumes/isolated-redis/_data', Destination: '/restore/redis', RW: true }] }
  const expected = containerSummary(original), reversed = structuredClone(original)
  reversed.Mounts.reverse(); assert.deepEqual(containerSummary(reversed), expected)
  assert.equal(expected.mounts[0].destination, '/restore/redis')
  for (const [field, value] of [['Type', 'bind'], ['Name', 'another-volume'], ['Source', '/different/source'], ['Destination', '/different/destination'], ['RW', false]]) {
    const changed = structuredClone(reversed); changed.Mounts[0][field] = value
    assert.notDeepEqual(containerSummary(changed), expected, 'Changed ' + field + ' must remain detectable')
  }
})


test('existing effective configuration is preserved through image defaults and only exact reviewed topology transitions', async () => {
  const configuration = values(), source = JSON.parse(await readFile(new URL('../scripts/deployment/nginx/compose.topology.json', import.meta.url), 'utf8'))
  const composition = resolveComposition(source, configuration), defaults = { NODE_VERSION: '24.19.0', PATH: '/usr/local/bin:/usr/bin', EXISTING_IMAGE_DEFAULT: 'preserved' }
  for (const role of ['api', 'storefront']) {
    const desired = composition.services[role].environment, effective = { ...defaults, ...desired }
    assert.doesNotThrow(() => verifyPreservedEnvironment(role, effective, defaults, desired, configuration))
  }
  const api = composition.services.api.environment, storefront = composition.services.storefront.environment
  assert.doesNotThrow(() => verifyPreservedEnvironment('api', { ...defaults, ...api, DIDAR_AUTH_PROXY_POLICY: 'direct', ADMIN_CORS: 'http://old-loopback.test' }, defaults, api, configuration))
  assert.doesNotThrow(() => verifyPreservedEnvironment('storefront', { ...defaults, ...storefront, DIDAR_AUTH_INGRESS_MODE: 'socket-signer', MEDUSA_BACKEND_URL: 'http://api:9000' }, defaults, storefront, configuration))
  for (const [role, extra, replacementDefaults, desired] of [
    ['api', { DIDAR_AGENCY_PROVIDER_MODE: 'existing-custom' }, defaults, api],
    ['api', { DIDAR_IMAGE_PROCESSOR_THREADS: '8' }, { ...defaults, DIDAR_IMAGE_PROCESSOR_THREADS: '4' }, api],
    ['api', { NODE_VERSION: '24.22.0' }, defaults, api],
    ['api', { JWT_SECRET: 'changed-existing-authority' }, defaults, api],
    ['storefront', { CUSTOM_MERCHANT_MEDIA_SETTING: 'existing-custom' }, defaults, storefront],
    ['storefront', { NODE_EXTRA_CA_CERTS: '/custom/ca.pem' }, defaults, { ...storefront, NODE_EXTRA_CA_CERTS: '/unreviewed/other.pem' }],
    ['api', { DIDAR_AUTH_PROXY_POLICY: 'require-proof' }, defaults, { ...api, DIDAR_AUTH_PROXY_POLICY: 'direct' }],
  ]) assert.throws(() => verifyPreservedEnvironment(role, { ...defaults, ...(role === 'api' ? api : storefront), ...extra }, replacementDefaults, desired, configuration), /EXISTING_CONFIGURATION_WOULD_CHANGE/)
})

test('existing application mounts cannot be silently dropped, changed or replaced with source/config overlays', () => {
  const configuration = values(), source = '/var/lib/docker/volumes/' + configuration.DIDAR_UPLOADS_VOLUME + '/_data'
  const upload = { Type: 'volume', Name: configuration.DIDAR_UPLOADS_VOLUME, Source: source, Destination: '/app/packages/api/.medusa/server/static', RW: true }
  const tls = { Type: 'bind', Source: configuration.DIDAR_AUTH_TLS_DIR, Destination: '/run/didar-tls', RW: false }
  assert.doesNotThrow(() => verifyPreservedMounts('api', [upload], configuration, source))
  assert.doesNotThrow(() => verifyPreservedMounts('storefront', [], configuration, source))
  assert.doesNotThrow(() => verifyPreservedMounts('storefront', [tls], configuration, source))
  for (const mounts of [[upload, { Type: 'bind', Source: '/unreviewed/config', Destination: '/app/packages/api/medusa-config.ts', RW: false }], [{ ...upload, Source: '/other/authoritative/source' }], [{ ...upload, RW: false }], [{ ...upload, Name: 'another-volume' }]]) assert.throws(() => verifyPreservedMounts('api', mounts, configuration, source), /UNREVIEWED_EXISTING_MOUNT:api/)
  for (const mounts of [[tls, { Type: 'bind', Source: '/unreviewed/source', Destination: '/app', RW: false }], [{ ...tls, RW: true }], [{ ...tls, Source: '/different/tls' }], [{ ...tls, Type: 'volume' }]]) assert.throws(() => verifyPreservedMounts('storefront', mounts, configuration, source), /UNREVIEWED_EXISTING_MOUNT:storefront/)
})
