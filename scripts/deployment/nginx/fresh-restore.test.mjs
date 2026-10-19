import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, chmod, writeFile, readFile, symlink, lstat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { restoreResourceNames, restoreOwnershipArguments, verifyNewPrivateDestination, runFreshRestore, runFreshCheckpoint, verifyCheckpointApplications, describePostgresDumpDifference, recordPostgresDumpDifference, tokenizePostgresDDL, describePostgresDDLDifference, compareKnownPostgresAliases, verifyPostgresEquivalence, postgresEquivalenceSQL } from './fresh-restore.mjs'
import { runner, canonicalState, sha256, sanitizeFixtureObservation } from './stack.mjs'
import { observeDaemon, assertDaemonPreserved } from './fresh.mjs'

const privateSqlFixture = rows => '-- Name: protected_fixture; Type: TABLE DATA; Schema: public; Owner: didar\nCOPY public.protected_fixture (id, value) FROM stdin;\n' + rows.join('\n') + '\n\\.\n'
const acceptedAliasContext = { applicationSource: '0c4b047baa9dbe37cd1876159c15d22b40cf7cac', postgresImage: 'sha256:589f742565e4f6d22149176b032974f55f8201a8a37b71ed587ec5c6902e689f', applicationImages: { api: 'sha256:1ffb2c40294dd899bfe6c4c76224cf7d0e3d5fe7e75e732e12f5d0a15c8911cf', storefront: 'sha256:b928edafdf670fa6ace1fcff550571d73cc5828b3bfdb2d0ed4a9ed914c86d10' } }
const knownPublicDDL = [
  { name: 'didar_catalog_translation', type: 'TABLE', before: "    CONSTRAINT didar_catalog_translation_label_check CHECK ((((length(TRIM(BOTH FROM label)) >= 2) AND (length(TRIM(BOTH FROM label)) <= 200)) AND (label !~ '[[:cntrl:]<>]'::text))),", after: "    CONSTRAINT didar_catalog_translation_label_check CHECK (((length(TRIM(BOTH FROM label)) >= 2) AND (length(TRIM(BOTH FROM label)) <= 200) AND (label !~ '[[:cntrl:]<>]'::text)))," },
  { name: 'didar_merchant_profile', type: 'TABLE', before: "    CONSTRAINT didar_merchant_profile_merchant_types_check CHECK ((((cardinality(merchant_types) >= 1) AND (cardinality(merchant_types) <= 30)) AND (NOT ('LEGACY_UNCLASSIFIED'::text = ANY (merchant_types)))))", after: "    CONSTRAINT didar_merchant_profile_merchant_types_check CHECK (((cardinality(merchant_types) >= 1) AND (cardinality(merchant_types) <= 30) AND (NOT ('LEGACY_UNCLASSIFIED'::text = ANY (merchant_types)))))" },
  { name: 'IDX_workflow_execution_updated_at_retention_time', type: 'INDEX', before: `CREATE INDEX "IDX_workflow_execution_updated_at_retention_time" ON public.workflow_execution USING btree (updated_at, retention_time) WHERE ((deleted_at IS NULL) AND (retention_time IS NOT NULL) AND ((state)::text = ANY ((ARRAY['done'::character varying, 'failed'::character varying, 'reverted'::character varying])::text[])));`, after: `CREATE INDEX "IDX_workflow_execution_updated_at_retention_time" ON public.workflow_execution USING btree (updated_at, retention_time) WHERE ((deleted_at IS NULL) AND (retention_time IS NOT NULL) AND ((state)::text = ANY (ARRAY[('done'::character varying)::text, ('failed'::character varying)::text, ('reverted'::character varying)::text])));` }
]
const knownDDLText = version => knownPublicDDL.map(item => '-- Name: ' + item.name + '; Type: ' + item.type + '; Schema: public; Owner: -\n' + item[version] + '\n').join('\n')

test('only observed whole-line aliases in exact public sections and pinned context become proof candidates', () => {
  const source = knownDDLText('before'), restored = knownDDLText('after'), result = compareKnownPostgresAliases({ ...acceptedAliasContext, source, restored })
  assert.equal(result.alias_count, 3)
  assert.notEqual(result.source_sha256, result.restored_sha256)
  assert.equal(result.canonical_sha256, result.restored_sha256)
  assert.deepEqual(sanitizeFixtureObservation('fresh-postgres-known-aliases', result), result)
  for (const changed of [{ applicationSource: 'a'.repeat(40) }, { postgresImage: 'sha256:' + 'a'.repeat(64) }, { applicationImages: { ...acceptedAliasContext.applicationImages, api: 'sha256:' + 'a'.repeat(64) } }, { applicationImages: { ...acceptedAliasContext.applicationImages, storefront: 'sha256:' + 'a'.repeat(64) } }]) assert.equal(compareKnownPostgresAliases({ ...acceptedAliasContext, ...changed, source, restored }), null)
  for (const changed of [restored.replace('<= 200', '<= 201'), restored.replace('retention_time) WHERE', 'state) WHERE'), restored.replace('AND ((state)', 'OR ((state)'), restored.replace("'failed'::character", "'changed'::character"), restored.replace('::character varying', '::integer'), restored.replace('CHECK (', 'CHECK  ('), restored.replace('Type: TABLE', 'Type: INDEX')]) assert.equal(compareKnownPostgresAliases({ ...acceptedAliasContext, source, restored: changed }), null)
  assert.equal(compareKnownPostgresAliases({ ...acceptedAliasContext, source: restored, restored: source }), null)
  assert.equal(compareKnownPostgresAliases({ ...acceptedAliasContext, source: source + privateSqlFixture(['1\toriginal']), restored: restored + privateSqlFixture(['1\ttampered']) }), null)
  assert.equal(compareKnownPostgresAliases({ ...acceptedAliasContext, source: source + privateSqlFixture(['1\tone', '2\ttwo']), restored: restored + privateSqlFixture(['2\ttwo', '1\tone']) }), null)
  assert.equal(compareKnownPostgresAliases({ ...acceptedAliasContext, source: source + "SELECT pg_catalog.setval('seq', 7, true);\n", restored: restored + "SELECT pg_catalog.setval('seq', 8, true);\n" }), null)
  assert.equal(compareKnownPostgresAliases({ ...acceptedAliasContext, source: 'COPY public.x (v) FROM stdin;\n' + source + '\\.\n', restored: 'COPY public.x (v) FROM stdin;\n' + restored + '\\.\n' }), null)
  assert.equal(compareKnownPostgresAliases({ ...acceptedAliasContext, source: 'DO $private$\n' + source + '$private$;\n', restored: 'DO $private$\n' + restored + '$private$;\n' }), null)
  assert.equal(compareKnownPostgresAliases({ ...acceptedAliasContext, source: Buffer.concat([Buffer.from(source), Buffer.from([0x80])]), restored: Buffer.concat([Buffer.from(restored), Buffer.from([0x81])]) }), null)
})

test('Postgres semantic proof requires real runner success and exact NULL-inclusive SQL results', async () => {
  const expected = { and_cases: 27, array_cases: 343, any_cases: 2401, and_associativity: true, array_cast_equivalence: true, array_type_equivalence: true, any_cast_equivalence: true }, calls = [], observations = []
  const run = async (stage, args, input) => { calls.push({ stage, args, input }); return JSON.stringify(expected) }
  run.recordFixtureObservation = (stage, observation) => observations.push({ stage, observation })
  const context = { run, sourceContainer: '1'.repeat(64), dbUser: 'didar', dbName: 'didar_fresh', applicationSource: acceptedAliasContext.applicationSource, postgresImage: acceptedAliasContext.postgresImage }
  const proof = await verifyPostgresEquivalence(context)
  assert.equal(calls.length, 1); assert.equal(calls[0].stage, 'fresh-postgres-known-equivalence-proof')
  assert.equal(calls[0].args.includes('ON_ERROR_STOP=1'), true)
  assert.equal(calls[0].input, postgresEquivalenceSQL)
  assert.equal(postgresEquivalenceSQL.includes('NULL::boolean'), true)
  assert.equal(postgresEquivalenceSQL.includes('NULL::character varying'), true)
  assert.deepEqual(sanitizeFixtureObservation('fresh-postgres-equivalence-proof', proof), proof)
  await assert.rejects(verifyPostgresEquivalence({ ...context, run: async () => JSON.stringify({ ...expected, any_cast_equivalence: false }) }), /PROOF_FAILED/)
  const falseObservations = [], falseRun = async () => JSON.stringify({ ...expected, and_associativity: false }); falseRun.recordFixtureObservation = (stage, observation) => falseObservations.push(observation)
  await assert.rejects(verifyPostgresEquivalence({ ...context, run: falseRun }), /PROOF_FAILED/)
  assert.equal(falseObservations.length, 1); assert.equal(falseObservations[0].and_associativity, false)
  assert.deepEqual(sanitizeFixtureObservation('fresh-postgres-equivalence-proof', falseObservations[0]), falseObservations[0])
  await assert.rejects(verifyPostgresEquivalence({ ...context, run: async () => JSON.stringify({ ...expected, and_cases: 26 }) }), /PROOF_FAILED/)
  await assert.rejects(verifyPostgresEquivalence({ ...context, run: async () => { throw Error('DOCKER_STAGE_FAILED:proof:exit=1') } }), /DOCKER_STAGE_FAILED/)
})

test('Postgres diagnostics identify row tampering versus ordering without authorizing either', () => {
  const source = privateSqlFixture(['1\tDO_NOT_PUBLISH_ALPHA', '2\tDO_NOT_PUBLISH_BETA']), reordered = privateSqlFixture(['2\tDO_NOT_PUBLISH_BETA', '1\tDO_NOT_PUBLISH_ALPHA']), tampered = privateSqlFixture(['1\tDO_NOT_PUBLISH_ALPHA', '2\tTAMPERED_PRIVATE_VALUE'])
  const order = describePostgresDumpDifference(source, reordered), mutation = describePostgresDumpDifference(source, tampered)
  assert.deepEqual(sanitizeFixtureObservation('fresh-postgres-logical-difference', order), order)
  assert.deepEqual(sanitizeFixtureObservation('fresh-postgres-logical-difference', mutation), mutation)
  assert.notEqual(order.source_sha256, order.restored_sha256)
  assert.equal(order.first_difference.source_class, 'COPY_DATA')
  assert.equal(order.section_differences[0].row_multiset_equal, true)
  assert.equal(mutation.section_differences[0].row_multiset_equal, false)
  assert.equal(JSON.stringify(mutation).includes('PRIVATE_VALUE'), false)
  assert.equal(JSON.stringify(order).includes('DO_NOT_PUBLISH'), false)
  const schema = '-- Name: protected_fixture; Type: TABLE; Schema: public; Owner: didar\nCREATE TABLE public.protected_fixture(id bigint, value text);\n'
  const changed = describePostgresDumpDifference(schema, schema.replace('bigint', 'integer'))
  assert.equal(changed.section_differences[0].section_type, 'TABLE')
  assert.equal(changed.first_difference.source_class, 'SQL')
  assert.notEqual(changed.source_sha256, changed.restored_sha256)
  const sequence = '-- Name: protected_fixture_id_seq; Type: SEQUENCE SET; Schema: public; Owner: didar\nSELECT pg_catalog.setval(\'public.protected_fixture_id_seq\', 7, true);\n'
  assert.equal(describePostgresDumpDifference(sequence, sequence.replace(', 7,', ', 8,')).first_difference.source_class, 'SEQUENCE_STATE')
})

test('DDL token diagnostics retain only fixed SQL enums and whole-private-token hashes', () => {
  const sql = 'CREATE TABLE "PRIVATE_IDENTIFIER" (x text DEFAULT E\'PRIVATE_LITERAL\\\' STILL_PRIVATE\', y text DEFAULT $body$PRIVATE_DOLLAR\nSELECT SECRET$body$); /* PRIVATE_COMMENT /* NESTED_SECRET */ END_SECRET */ -- PRIVATE_LINE_COMMENT\n'
  const tokens = tokenizePostgresDDL(sql), serialized = JSON.stringify(tokens)
  for (const value of ['PRIVATE_IDENTIFIER', 'PRIVATE_LITERAL', 'STILL_PRIVATE', 'PRIVATE_DOLLAR', 'SECRET', 'PRIVATE_COMMENT', 'NESTED_SECRET', 'END_SECRET', 'PRIVATE_LINE_COMMENT']) assert.equal(serialized.includes(value), false)
  assert.equal(tokens.includes('KEYWORD:SELECT'), false) // SELECT is inside one dollar literal.
  assert.equal(tokens.includes('KEYWORD:CREATE'), true)
  assert.equal(tokens.filter(token => token.startsWith('STRING_LITERAL:')).length, 2)
  assert.equal(tokens.filter(token => token.startsWith('COMMENT:')).length, 2)
  assert.equal(tokenizePostgresDDL("DEFAULT 'unterminated PRIVATE_LITERAL SELECT").includes('KEYWORD:SELECT'), false)
})

test('changed DDL token producer matches strict sanitizer and never canonicalizes checks/indexes', () => {
  const prefix = '-- Name: public_fixture; Type: TABLE; Schema: public; Owner: -\n', source = prefix + "CREATE TABLE public.public_fixture (value text CONSTRAINT x CHECK (NOT (value = ANY (ARRAY['PRIVATE_LITERAL'::text]))));\n", restored = prefix + "CREATE TABLE public.public_fixture (value text CONSTRAINT x CHECK (value <> ALL (ARRAY['PRIVATE_LITERAL'::text])));\n"
  const result = describePostgresDDLDifference(source, restored)
  assert.deepEqual(sanitizeFixtureObservation('fresh-postgres-ddl-difference', result), result)
  assert.equal(result.changed_line_count, 1)
  assert.equal(result.lines[0].source_line, 2)
  assert.equal(result.lines[0].source_tokens.includes('KEYWORD:NOT'), true)
  assert.equal(result.lines[0].restored_tokens.includes('KEYWORD:ALL'), true)
  assert.equal(result.lines[0].restored_tokens.includes('OPERATOR:NE'), true)
  assert.notEqual(result.lines[0].source_line_sha256, result.lines[0].restored_line_sha256)
  assert.equal(JSON.stringify(result).includes('PRIVATE_LITERAL'), false)
  const rows = privateSqlFixture(['1\tCOPY_ROW_PRIVATE'])
  assert.deepEqual(describePostgresDDLDifference(rows, rows.replace('COPY_ROW_PRIVATE', 'COPY_ROW_CHANGED')).lines, [])
  const many = Array.from({ length: 15 }, (_, i) => 'ALTER TABLE x ADD CONSTRAINT c' + i + ' CHECK (' + Array(200).fill('value = 1').join(' AND ') + ');').join('\n')
  const bounded = describePostgresDDLDifference(prefix + many, prefix + many.replaceAll('value = 1', 'value = 2'))
  assert.equal(bounded.changed_line_count, 15)
  assert.equal(bounded.lines.length, 10)
  assert.equal(bounded.lines.every(line => line.source_tokens.length <= 256 && line.restored_tokens.length <= 256), true)
  assert.deepEqual(sanitizeFixtureObservation('fresh-postgres-ddl-difference', bounded), bounded)
  const embedded = prefix + "CREATE TABLE x (value text DEFAULT $private$before\n-- Name: PRIVATE_FAKE_SECTION; Type: TABLE; Schema: public; Owner: -\nSECRET_LITERAL SELECT\n$private$);\n"
  const embeddedResult = describePostgresDDLDifference(embedded, embedded.replace('SECRET_LITERAL SELECT', 'CHANGED_SECRET SELECT'))
  assert.equal(embeddedResult.lines.length, 1)
  assert.equal(embeddedResult.lines[0].source_tokens.includes('KEYWORD:SELECT'), false)
  assert.equal(JSON.stringify(embeddedResult).includes('PRIVATE_FAKE_SECTION'), false)
  assert.deepEqual(sanitizeFixtureObservation('fresh-postgres-ddl-difference', embeddedResult), embeddedResult)
})

test('mismatching dump copies remain private0600 and only hash/count diagnostics reach observer', async () => {
  const root = await mkdtemp(join(tmpdir(), 'didar-private-dump-diagnostic-')); await chmod(root, 0o700)
  const source = privateSqlFixture(['1\tPRIVATE_SQL_NEVER_UPLOAD']), restored = privateSqlFixture(['1\tPRIVATE_SQL_CHANGED']), observed = []
  const run = async (stage, args) => { await writeFile(args[2], stage.includes('-source-') ? source : restored, { mode: 0o644 }); return '' }
  run.recordFixtureObservation = (stage, observation) => observed.push({ stage, observation })
  const diagnostic = await recordPostgresDumpDifference({ sourceContainer: '1'.repeat(64), restoredContainer: '2'.repeat(64), run, backupDir: root, sourceDigest: sha256(source) + '  /tmp/didar-comparison-normalized.sql', restoredDigest: sha256(restored) + '  /tmp/didar-comparison-normalized.sql' })
  assert.equal(observed.length, 2)
  assert.equal(observed[0].stage, 'fresh-postgres-logical-difference')
  assert.equal(observed[1].stage, 'fresh-postgres-ddl-difference')
  assert.deepEqual(sanitizeFixtureObservation(observed[1].stage, observed[1].observation), observed[1].observation)
  assert.equal(JSON.stringify(observed).includes('PRIVATE_SQL'), false)
  assert.deepEqual(observed[0].observation, diagnostic)
  for (const file of ['postgres.source.normalized.private.sql', 'postgres.restored.normalized.private.sql', 'postgres-difference.sanitized.json']) assert.equal((await lstat(join(root, file))).mode & 0o777, 0o600)
  assert.equal(await readFile(join(root, 'postgres.source.normalized.private.sql'), 'utf8'), source)
})

test('restore volume names are fixed owned names and disjoint from all source volumes', () => {
  const config = { DIDAR_COMPOSE_PROJECT: 'fresh_candidate', DIDAR_POSTGRES_VOLUME: 'src_pg', DIDAR_REDIS_VOLUME: 'src_redis', DIDAR_UPLOADS_VOLUME: 'src_uploads' }, token = 'a'.repeat(48)
  assert.deepEqual(restoreResourceNames(config, token), { postgres: 'fresh_candidate_restore_postgres_aaaaaaaaaaaa', redis: 'fresh_candidate_restore_redis_aaaaaaaaaaaa', uploads: 'fresh_candidate_restore_uploads_aaaaaaaaaaaa' })
  assert.throws(() => restoreResourceNames({ ...config, DIDAR_POSTGRES_VOLUME: 'fresh_candidate_restore_postgres_aaaaaaaaaaaa' }, token), /VOLUMES_MUST_BE_DISTINCT/)
  assert.throws(() => restoreResourceNames({ ...config, DIDAR_COMPOSE_PROJECT: '--mount=legacy' }, token), /OWNERSHIP_REQUIRED/)
})

test('restore volume and container ownership arguments mark only explicit QA fixtures', () => {
  const token = 'c'.repeat(48), ordinary = ['--label', 'didar.fresh-owner=' + token]
  assert.deepEqual(restoreOwnershipArguments({ token }), ordinary)
  assert.deepEqual(restoreOwnershipArguments({ token, qa_fixture: false }), ordinary)
  assert.deepEqual(restoreOwnershipArguments({ token, qa_fixture: true }), [...ordinary, '--label', 'didar.disposable-qa=true'])
  assert.throws(() => restoreOwnershipArguments({ token: '--label=unsafe', qa_fixture: true }), /OWNERSHIP_REQUIRED/)
})

test('checkpoint generation creates separate restore names without reusing initial restoration', () => {
  const config = { DIDAR_COMPOSE_PROJECT: 'fresh_candidate', DIDAR_POSTGRES_VOLUME: 'src_pg', DIDAR_REDIS_VOLUME: 'src_redis', DIDAR_UPLOADS_VOLUME: 'src_uploads' }, token = 'a'.repeat(48)
  const initial = Object.values(restoreResourceNames(config, token)), next = Object.values(restoreResourceNames(config, token, 'b'.repeat(24)))
  assert.equal(new Set([...initial, ...next]).size, 6)
  assert.throws(() => restoreResourceNames(config, token, '--legacy'), /GENERATION_REQUIRED/)
})

test('checkpoint requires real quiesced four-container ownership and coordinated namespace', async () => {
  const token = 'a'.repeat(48), ids = { api: '1'.repeat(64), storefront: '2'.repeat(64), postgres: '3'.repeat(64), redis: '4'.repeat(64) }, image = 'sha256:' + '5'.repeat(64)
  const state = { phase: 'QUIESCED', token, ids, qa_fixture: true, owned: { containers: Object.values(ids) }, initialization_state_sha256: '6'.repeat(64) }
  const config = { DIDAR_COMPOSE_PROJECT: 'fresh_qa', DIDAR_UPLOADS_VOLUME: 'fresh_qa_uploads' }, applicationImages = { api: image, storefront: image }, observations = {}
  for (const role of ['api', 'storefront']) observations[role] = { Id: ids[role], Image: image, State: { Running: false, Restarting: false }, Config: { Labels: { 'didar.fresh-owner': token, 'didar.disposable-qa': 'true', 'com.docker.compose.project': 'fresh_qa', 'com.docker.compose.service': role } }, HostConfig: { NetworkMode: role === 'storefront' ? 'container:' + ids.api : 'fresh_qa' }, Mounts: role === 'api' ? [{ Type: 'volume', Name: 'fresh_qa_uploads', Destination: '/app/packages/api/.medusa/server/static' }] : [] }
  const run = async stage => JSON.stringify([observations[stage.endsWith('storefront') ? 'storefront' : 'api']])
  const result = await verifyCheckpointApplications({ config, state, run, applicationImages })
  assert.deepEqual(Object.keys(result), ['api', 'storefront'])
  observations.api.State.Running = true
  await assert.rejects(verifyCheckpointApplications({ config, state, run, applicationImages }), /STOPPED_APPLICATION_OWNERSHIP/)
  observations.api.State.Running = false; observations.storefront.HostConfig.NetworkMode = 'bridge'
  await assert.rejects(verifyCheckpointApplications({ config, state, run, applicationImages }), /COORDINATED_NAMESPACE/)
  observations.storefront.HostConfig.NetworkMode = 'container:' + ids.api; delete observations.api.Config.Labels['didar.disposable-qa']
  await assert.rejects(verifyCheckpointApplications({ config, state, run, applicationImages }), /STOPPED_APPLICATION_OWNERSHIP/)
  await assert.rejects(runFreshCheckpoint({ state: { ...state, phase: 'HEALTHY' }, run: () => assert.fail('No Docker when unquiesced') }), /QUIESCED_FOUR_CONTAINER/)
})

test('receipt output refuses public directory, existing file, and parent symlink', async () => {
  const root = await mkdtemp(join(tmpdir(), 'didar-restore-guard-'))
  await chmod(root, 0o755)
  await assert.rejects(verifyNewPrivateDestination(join(root, 'receipt.json')), /DIRECTORY_0700/)
  await chmod(root, 0o700)
  await verifyNewPrivateDestination(join(root, 'receipt.json'))
  await writeFile(join(root, 'receipt.json'), 'retained', { mode: 0o600 })
  await assert.rejects(verifyNewPrivateDestination(join(root, 'receipt.json')), /ALREADY_EXISTS/)
  await symlink(root, root + '-link')
  await assert.rejects(verifyNewPrivateDestination(join(root + '-link', 'new.json')), /DIRECTORY_0700/)
  assert.equal(await readFile(join(root, 'receipt.json'), 'utf8'), 'retained')
})

test('uninitialized or application-running state never invokes Docker or creates PASS', async () => {
  for (const state of [{ phase: 'MIGRATED', ids: {} }, { phase: 'INITIALIZED', ids: { postgres: '1'.repeat(64), redis: '2'.repeat(64), api: '3'.repeat(64) } }]) {
    await assert.rejects(runFreshRestore({ state, run: () => assert.fail('Docker must not be called') }), /INITIALIZED_DEPENDENCIES_ONLY/)
  }
})

test('failed real backup command halts before restoration and never emits PASS receipt', async () => {
  const root = await mkdtemp(join(tmpdir(), 'didar-restore-failure-')); await chmod(root, 0o700)
  const token = 'b'.repeat(48), pg = '1'.repeat(64), redis = '2'.repeat(64), image = 'sha256:' + '3'.repeat(64)
  const config = { DIDAR_COMPOSE_PROJECT: 'fresh_failure', DIDAR_POSTGRES_VOLUME: 'fresh_pg', DIDAR_REDIS_VOLUME: 'fresh_redis', DIDAR_UPLOADS_VOLUME: 'fresh_uploads', DIDAR_POSTGRES_IMAGE: image, DIDAR_REDIS_IMAGE: image, DIDAR_DB_USER: 'didar', DIDAR_DB_NAME: 'didar' }
  const state = { phase: 'INITIALIZED', token, ids: { postgres: pg, redis }, initialization_state_sha256: '4'.repeat(64), baseline: { volumes: {} }, owned: { volumes: ['fresh_pg', 'fresh_redis', 'fresh_uploads'], containers: [] } }, stages = []
  const run = async (stage, args) => {
    stages.push(stage)
    if (args[0] === 'inspect') { const role = args[1] === pg ? 'postgres' : 'redis'; return JSON.stringify([{ Id: args[1], Image: image, State: { Running: true }, Mounts: [{ Type: 'volume', Name: config['DIDAR_' + role.toUpperCase() + '_VOLUME'], Destination: role === 'postgres' ? '/var/lib/postgresql/data' : '/data' }], Config: { Labels: { 'didar.fresh-owner': token, 'com.docker.compose.project': 'fresh_failure', 'com.docker.compose.service': role } } }]) }
    if (args[0] === 'image') return JSON.stringify([{ Id: image }])
    if (args[0] === 'volume') return state.owned.volumes.join('\n')
    throw Error('DOCKER_STAGE_FAILED:' + stage + ':exit=1')
  }
  const path = join(root, 'receipt.json')
  await assert.rejects(runFreshRestore({ config, state, saveState: async () => {}, preserve: async () => {}, run, evidenceUrl: 'https://example.org/fixture-only', receiptPath: path }), /DOCKER_STAGE_FAILED:fresh-backup-postgres-custom:exit=1/)
  assert.equal(stages.at(-1), 'fresh-backup-postgres-custom')
  assert.equal(stages.some(stage => stage.startsWith('fresh-restore-create-')), false)
  assert.equal(state.restore_attempt.phase, 'BACKUP_STARTED')
  await assert.rejects(lstat(path), { code: 'ENOENT' })
})

test('checkpoint failure retains initial receipt and journals a distinct generation without fabricating four-ID PASS', async () => {
  const root = await mkdtemp(join(tmpdir(), 'didar-checkpoint-failure-')); await chmod(root, 0o700)
  const token = 'b'.repeat(48), ids = { api: '1'.repeat(64), storefront: '2'.repeat(64), postgres: '3'.repeat(64), redis: '4'.repeat(64) }, image = 'sha256:' + '5'.repeat(64)
  const config = { DIDAR_COMPOSE_PROJECT: 'fresh_failure', DIDAR_POSTGRES_VOLUME: 'fresh_pg', DIDAR_REDIS_VOLUME: 'fresh_redis', DIDAR_UPLOADS_VOLUME: 'fresh_uploads', DIDAR_POSTGRES_IMAGE: image, DIDAR_REDIS_IMAGE: image, DIDAR_DB_USER: 'didar', DIDAR_DB_NAME: 'didar' }, initialReceipt = { phase: 'LOCAL_RESTORATION_VERIFIED_EVIDENCE_PUBLICATION_REQUIRED', receipt_sha256: '6'.repeat(64), isolated_volumes: restoreResourceNames(config, token) }
  const state = { phase: 'QUIESCED', token, ids, initialization_state_sha256: '7'.repeat(64), restore_attempt: structuredClone(initialReceipt), baseline: { volumes: {} }, owned: { volumes: ['fresh_pg', 'fresh_redis', 'fresh_uploads', ...Object.values(initialReceipt.isolated_volumes)], containers: Object.values(ids) } }, stages = []
  const run = async (stage, args) => {
    stages.push(stage)
    if (args[0] === 'inspect') {
      const role = Object.keys(ids).find(role => ids[role] === args[1]), mount = role === 'api' ? { Type: 'volume', Name: 'fresh_uploads', Destination: '/app/packages/api/.medusa/server/static' } : role === 'postgres' ? { Type: 'volume', Name: 'fresh_pg', Destination: '/var/lib/postgresql/data' } : role === 'redis' ? { Type: 'volume', Name: 'fresh_redis', Destination: '/data' } : null
      return JSON.stringify([{ Id: args[1], Image: image, State: { Running: ['postgres', 'redis'].includes(role), Restarting: false }, HostConfig: { NetworkMode: role === 'storefront' ? 'container:' + ids.api : 'none' }, Mounts: mount ? [mount] : [], Config: { Labels: { 'didar.fresh-owner': token, 'com.docker.compose.project': 'fresh_failure', 'com.docker.compose.service': role } } }])
    }
    if (args[0] === 'image') return JSON.stringify([{ Id: image }])
    if (args[0] === 'volume') return state.owned.volumes.join('\n')
    throw Error('DOCKER_STAGE_FAILED:' + stage + ':exit=1')
  }
  const receiptPath = join(root, 'checkpoint.json')
  await assert.rejects(runFreshCheckpoint({ config, state, saveState: async () => {}, preserve: async () => {}, run, applicationImages: { api: image, storefront: image }, evidenceUrl: 'https://example.org/fixture-only', receiptPath }), /DOCKER_STAGE_FAILED:fresh-backup-postgres-custom:exit=1/)
  assert.deepEqual(state.restore_attempt, initialReceipt)
  assert.equal(state.checkpoint_attempt.generation.length, 24)
  assert.deepEqual(state.checkpoint_attempt.source_container_ids, ids)
  assert.equal(Object.values(state.checkpoint_attempt.isolated_volumes).some(value => state.owned.volumes.includes(value)), false)
  assert.equal(stages.at(-1), 'fresh-backup-postgres-custom')
  await assert.rejects(lstat(receiptPath), { code: 'ENOENT' })
})

test('real isolated PostgreSQL, Redis, uploads and configuration backup/restore', { skip: process.env.DIDAR_FRESH_RESTORE_REAL !== '1' }, async () => {
  // Disposable operational fixture, not accepted-application or target evidence.
  // Every resource is retained, labelled and journaled. Never prune or remove.
  const root = await mkdtemp(join(tmpdir(), 'didar-fresh-restore-fixture-'))
  await chmod(root, 0o700)
  const receipts = [], run = runner(process.env, receipts), token = randomBytes(24).toString('hex'), prefix = 'didar_restore_fixture_' + token.slice(0, 12)
  const config = { DIDAR_COMPOSE_PROJECT: prefix, DIDAR_POSTGRES_VOLUME: prefix + '_source_pg', DIDAR_REDIS_VOLUME: prefix + '_source_redis', DIDAR_UPLOADS_VOLUME: prefix + '_source_uploads', DIDAR_DB_USER: 'didar_restore', DIDAR_DB_NAME: 'didar_restore', JWT_SECRET: randomBytes(32).toString('hex'), COOKIE_SECRET: randomBytes(32).toString('hex'), DIDAR_AUTH_NETWORK_KEY: randomBytes(32).toString('hex'), DIDAR_DB_PASSWORD: randomBytes(32).toString('hex') }
  // Inspect exact compatible dependency digests; never pull mutable tags.
  for (const [role, reference] of [['POSTGRES', 'postgres@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24'], ['REDIS', 'redis@sha256:858f009f9709ce576febc734aa78b8f6d624b82571f9ddb6bda4377c833b3499']]) config['DIDAR_' + role + '_IMAGE'] = JSON.parse(await run('fixture-cached-image-' + role, ['image', 'inspect', reference]))[0].Id
  const state = { phase: 'INITIALIZED', token, ids: {}, baseline: await observeDaemon(run), owned: { containers: [], networks: [], volumes: [] }, initialization_state_sha256: sha256('REAL_OPERATIONAL_FIXTURE_NOT_APPLICATION_ACCEPTANCE') }
  const saveState = () => writeFile(join(root, 'private-state.json'), JSON.stringify(state) + '\n', { mode: 0o600 })
  const preserve = async () => assertDaemonPreserved(state.baseline, await observeDaemon(run), state.owned)
  try {
    for (const name of [config.DIDAR_POSTGRES_VOLUME, config.DIDAR_REDIS_VOLUME, config.DIDAR_UPLOADS_VOLUME]) {
      state.owned.volumes.push(name); await saveState()
      await run('fixture-create-owned-volume', ['volume', 'create', '--label', 'didar.fresh-owner=' + token, name])
    }
    for (const role of ['postgres', 'redis']) {
      const args = ['create', '--network', 'none', '--label', 'didar.fresh-owner=' + token, '--label', 'com.docker.compose.project=' + prefix, '--label', 'com.docker.compose.service=' + role]
      if (role === 'postgres') args.push('--env', 'POSTGRES_USER=' + config.DIDAR_DB_USER, '--env', 'POSTGRES_DB=' + config.DIDAR_DB_NAME, '--env', 'POSTGRES_HOST_AUTH_METHOD=trust', '--mount', 'type=volume,src=' + config.DIDAR_POSTGRES_VOLUME + ',dst=/var/lib/postgresql/data')
      else args.push('--mount', 'type=volume,src=' + config.DIDAR_REDIS_VOLUME + ',dst=/data', '--mount', 'type=volume,src=' + config.DIDAR_UPLOADS_VOLUME + ',dst=/fixture-uploads')
      args.push(config['DIDAR_' + role.toUpperCase() + '_IMAGE'])
      const container = await run('fixture-create-' + role, args)
      state.ids[role] = container; state.owned.containers.push(container); await saveState()
      await run('fixture-start-' + role, ['start', container])
    }
    await run('fixture-wait-postgres', ['exec', state.ids.postgres, 'sh', '-ec', 'for i in $(seq 1 90); do pg_isready -h 127.0.0.1 -U didar_restore -d didar_restore >/dev/null 2>&1 && exit 0; sleep 1; done; exit 1'])
    await run('fixture-real-postgres-content', ['exec', '-i', state.ids.postgres, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', config.DIDAR_DB_USER, '-d', config.DIDAR_DB_NAME], "CREATE TABLE protected_fixture(id bigint PRIMARY KEY, text_value text, payload bytea); INSERT INTO protected_fixture VALUES(9007199254740993,'آزمون بازیابی',decode('00ff01','hex'));\n")
    assert.equal(await run('fixture-real-redis-content', ['exec', state.ids.redis, 'redis-cli', 'SET', 'fixture:preserved', 'original']), 'OK')
    await run('fixture-real-media-content', ['exec', state.ids.redis, 'sh', '-ec', "printf 'preserved-media\\000bytes' > /fixture-uploads/fixture.bin; mkdir /fixture-uploads/empty"])
    const result = await runFreshRestore({ config, state, saveState, run, preserve, evidenceUrl: 'https://example.org/owner-custody-not-uploaded-fixture-only', receiptPath: join(root, 'restoration.json') })
    const receipt = JSON.parse(await readFile(result.receipt_path, 'utf8'))
    assert.equal(result.receipt_sha256, sha256(await readFile(result.receipt_path)))
    assert.equal(receipt.scope, 'PARALLEL_FRESH_INITIALIZED_STATE')
    assert.deepEqual(receipt.restoration, { postgres: 'PASS', redis: 'PASS', uploads: 'PASS', configuration: 'PASS' })
    assert.equal(receipt.evidence_publication_status, 'NOT_VERIFIED_OWNER_DESTINATION_ONLY')
    assert.deepEqual(receipt.source_container_ids, state.ids)
    await preserve()
    await assert.rejects(runFreshRestore({ config, state, saveState, run, preserve, evidenceUrl: 'https://example.org/fixture', receiptPath: join(root, 'second.json') }), /ALREADY_ATTEMPTED/)
    await writeFile(join(root, 'verification.json'), JSON.stringify({ status: 'PASS', scope: 'REAL_OPERATIONAL_FIXTURE_ONLY', accepted_application_runtime: 'NOT_EXECUTED', root, owned_resources: state.owned, receipt_sha256: result.receipt_sha256, process_exits: receipts }, null, 2) + '\n', { mode: 0o600 })
    console.log('REAL_RESTORE_FIXTURE_EVIDENCE=' + root)
  } catch (error) {
    await writeFile(join(root, 'verification.json'), JSON.stringify({ status: 'FAIL', scope: 'REAL_OPERATIONAL_FIXTURE_ONLY', error: error.message, root, owned_resources: state.owned, process_exits: receipts }, null, 2) + '\n', { mode: 0o600 })
    throw error
  }
})
