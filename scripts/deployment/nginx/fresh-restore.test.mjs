import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, chmod, writeFile, readFile, symlink, lstat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { restoreResourceNames, restoreOwnershipArguments, verifyNewPrivateDestination, runFreshRestore, runFreshCheckpoint, verifyCheckpointApplications } from './fresh-restore.mjs'
import { runner, canonicalState, sha256 } from './stack.mjs'
import { observeDaemon, assertDaemonPreserved } from './fresh.mjs'

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
  // Resolve cached fixture tags to exact immutable config IDs before creation.
  for (const [role, tag] of [['POSTGRES', 'postgres:17-alpine'], ['REDIS', 'redis:7-alpine']]) config['DIDAR_' + role + '_IMAGE'] = JSON.parse(await run('fixture-cached-image-' + role, ['image', 'inspect', tag]))[0].Id
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
