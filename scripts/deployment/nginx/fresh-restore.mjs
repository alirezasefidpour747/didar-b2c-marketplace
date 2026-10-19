// Initial-state backup/restore for the candidate fresh installer only.
// Never target legacy containers; never delete a resource or start an app.
import { readFile, writeFile, lstat, realpath, mkdir, chmod, open } from 'node:fs/promises'
import { dirname, resolve, join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { canonicalState, sha256 } from './stack.mjs'

const fail = code => { throw Error(code) }
const same = (a, b) => canonicalState(a) === canonicalState(b)
const id = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const name = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(value)
const redisDigestScript = "local k=redis.call('KEYS','*');table.sort(k);local a={};for _,v in ipairs(k) do a[#a+1]=redis.sha1hex(v)..':'..redis.sha1hex(redis.call('DUMP',v))..':'..redis.call('PEXPIRETIME',v) end;return redis.sha1hex(table.concat(a,'\\n'))"

export function restoreOwnershipArguments(state) {
  if (!/^[a-f0-9]{48}$/.test(state.token || '')) fail('FRESH_RESTORE_OWNERSHIP_REQUIRED')
  return ['--label', 'didar.fresh-owner=' + state.token, ...(state.qa_fixture === true ? ['--label', 'didar.disposable-qa=true'] : [])]
}

export function restoreResourceNames(config, token, generation = null) {
  if (!name(config.DIDAR_COMPOSE_PROJECT) || !/^[a-f0-9]{48}$/.test(token)) fail('FRESH_RESTORE_OWNERSHIP_REQUIRED')
  if (generation !== null && !/^[a-f0-9]{24}$/.test(generation)) fail('FRESH_CHECKPOINT_GENERATION_REQUIRED')
  const suffix = generation === null ? token.slice(0, 12) : generation
  const values = Object.fromEntries(['postgres', 'redis', 'uploads'].map(role => [role, config.DIDAR_COMPOSE_PROJECT + '_restore_' + role + '_' + suffix]))
  if (Object.values(values).some(value => !name(value))) fail('FRESH_RESTORE_RESOURCE_NAME_TOO_LONG')
  const source = ['DIDAR_POSTGRES_VOLUME', 'DIDAR_REDIS_VOLUME', 'DIDAR_UPLOADS_VOLUME'].map(key => config[key])
  if (new Set(Object.values(values)).size !== 3 || Object.values(values).some(value => source.includes(value))) fail('FRESH_RESTORE_VOLUMES_MUST_BE_DISTINCT')
  return values
}

export async function verifyNewPrivateDestination(receiptPath) {
  if (typeof receiptPath !== 'string' || !receiptPath.startsWith('/') || resolve(receiptPath) !== receiptPath) fail('ABSOLUTE_NEW_RESTORE_RECEIPT_PATH_REQUIRED')
  const parent = dirname(receiptPath), info = await lstat(parent)
  if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o777) !== 0o700 || info.uid !== process.getuid() || await realpath(parent) !== parent) fail('RESTORE_PRIVATE_DIRECTORY_0700_REQUIRED')
  try { await lstat(receiptPath); fail('RESTORE_RECEIPT_ALREADY_EXISTS') } catch (error) { if (error.code !== 'ENOENT') throw error }
}

const hashPrivateCopy = async path => {
  const info = await lstat(path)
  if (!info.isFile() || info.isSymbolicLink() || info.size === 0 || info.uid !== process.getuid()) fail('RESTORE_BACKUP_REGULAR_NONEMPTY_FILE_REQUIRED')
  await chmod(path, 0o600)
  return sha256(await readFile(path))
}

export const runFreshRestore = options => performFreshRestore({ ...options, checkpoint: false })
export const runFreshCheckpoint = options => performFreshRestore({ ...options, checkpoint: true })

export async function verifyCheckpointApplications({ config, state, run, applicationImages }) {
  if (state.phase !== 'QUIESCED' || !['api', 'storefront', 'postgres', 'redis'].every(role => id(state.ids?.[role])) || new Set(Object.values(state.ids)).size !== 4 || !/^[a-f0-9]{64}$/.test(state.initialization_state_sha256 || '')) fail('FRESH_QUIESCED_FOUR_CONTAINER_CHECKPOINT_REQUIRED')
  const subjects = {}
  for (const role of ['api', 'storefront']) {
    const expected = applicationImages?.[role]
    if (!/^sha256:[a-f0-9]{64}$/.test(expected || '')) fail('FRESH_CHECKPOINT_APPROVED_APPLICATION_IMAGES_REQUIRED')
    const actual = JSON.parse(await run('fresh-checkpoint-source-' + role, ['inspect', state.ids[role]]))[0]
    if (actual.Id !== state.ids[role] || actual.Image !== expected || actual.State.Running !== false || actual.State.Restarting !== false || actual.Config.Labels?.['didar.fresh-owner'] !== state.token || actual.Config.Labels?.['com.docker.compose.project'] !== config.DIDAR_COMPOSE_PROJECT || actual.Config.Labels?.['com.docker.compose.service'] !== role || state.qa_fixture === true && actual.Config.Labels?.['didar.disposable-qa'] !== 'true' || !state.owned.containers.includes(actual.Id)) fail('FRESH_CHECKPOINT_STOPPED_APPLICATION_OWNERSHIP_REQUIRED')
    if (role === 'storefront' && actual.HostConfig.NetworkMode !== 'container:' + state.ids.api) fail('FRESH_CHECKPOINT_COORDINATED_NAMESPACE_REQUIRED')
    if (role === 'api' && actual.Mounts?.find(item => item.Destination === '/app/packages/api/.medusa/server/static')?.Name !== config.DIDAR_UPLOADS_VOLUME) fail('FRESH_CHECKPOINT_API_UPLOADS_VOLUME_REQUIRED')
    subjects[role] = sha256(canonicalState({ Id: actual.Id, Image: actual.Image, Config: actual.Config, HostConfig: actual.HostConfig, Mounts: actual.Mounts }))
  }
  return subjects
}

async function performFreshRestore({ config, state, saveState, run, evidenceUrl, receiptPath, preserve, checkpoint, applicationImages }) {
  const attemptKey = checkpoint ? 'checkpoint_attempt' : 'restore_attempt'
  if (!checkpoint && (state.phase !== 'INITIALIZED' || !id(state.ids?.postgres) || !id(state.ids?.redis) || state.ids.api || state.ids.storefront || !/^[a-f0-9]{64}$/.test(state.initialization_state_sha256 || ''))) fail('FRESH_INITIALIZED_DEPENDENCIES_ONLY_REQUIRED')
  if (state[attemptKey]) fail('FRESH_RESTORE_ALREADY_ATTEMPTED_REVIEW_RETAINED_RESOURCES')
  const checkpointSubjects = checkpoint ? await verifyCheckpointApplications({ config, state, run, applicationImages }) : null
  const url = new URL(evidenceUrl)
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || ['localhost', '127.0.0.1', '::1'].includes(url.hostname)) fail('OWNER_DURABLE_HTTPS_EVIDENCE_DESTINATION_REQUIRED')
  if (typeof preserve !== 'function' || typeof saveState !== 'function') fail('FRESH_RESTORE_PRESERVATION_CALLBACK_REQUIRED')
  await verifyNewPrivateDestination(receiptPath)
  const generation = checkpoint ? randomBytes(12).toString('hex') : null
  const volumes = restoreResourceNames(config, state.token, generation)
  if (checkpoint && Object.values(volumes).some(volume => state.owned.volumes.includes(volume))) fail('FRESH_CHECKPOINT_GENERATION_COLLISION')
  const backupDir = receiptPath + '.private-backup'
  await mkdir(backupDir, { mode: 0o700 }) // exclusive: existing path is never adopted
  await preserve()
  const sourceIds = { postgres: state.ids.postgres, redis: state.ids.redis }
  const receiptSourceIds = checkpoint ? { api: state.ids.api, storefront: state.ids.storefront, postgres: sourceIds.postgres, redis: sourceIds.redis } : sourceIds
  for (const key of ['DIDAR_POSTGRES_VOLUME', 'DIDAR_REDIS_VOLUME', 'DIDAR_UPLOADS_VOLUME']) if (!state.owned.volumes.includes(config[key]) || Object.hasOwn(state.baseline.volumes, config[key])) fail('FRESH_RESTORE_OWNED_SOURCE_VOLUMES_REQUIRED')
  for (const role of ['postgres', 'redis']) {
    const actual = JSON.parse(await run('fresh-restore-source-' + role, ['inspect', sourceIds[role]]))[0]
    if (actual.Id !== sourceIds[role] || actual.Config.Labels?.['didar.fresh-owner'] !== state.token || state.qa_fixture === true && actual.Config.Labels?.['didar.disposable-qa'] !== 'true' || actual.Config.Labels?.['com.docker.compose.project'] !== config.DIDAR_COMPOSE_PROJECT || actual.Config.Labels?.['com.docker.compose.service'] !== role || !actual.State.Running) fail('FRESH_RESTORE_SOURCE_OWNERSHIP_MISMATCH')
    const destination = role === 'postgres' ? '/var/lib/postgresql/data' : '/data', mount = actual.Mounts?.find(item => item.Destination === destination)
    if (mount?.Type !== 'volume' || mount.Name !== config['DIDAR_' + role.toUpperCase() + '_VOLUME']) fail('FRESH_RESTORE_SOURCE_VOLUME_MISMATCH')
    const expected = config['DIDAR_' + role.toUpperCase() + '_IMAGE']
    const image = JSON.parse(await run('fresh-restore-image-' + role, ['image', 'inspect', expected]))[0]
    if (actual.Image !== image.Id || !id(image.Id.replace(/^sha256:/, ''))) fail('FRESH_RESTORE_MATCHED_DEPENDENCY_IMAGE_REQUIRED')
  }
  const images = Object.fromEntries(await Promise.all(['postgres', 'redis'].map(async role => [role, JSON.parse(await run('fresh-restore-pinned-' + role, ['image', 'inspect', config['DIDAR_' + role.toUpperCase() + '_IMAGE']]))[0].Id])))
  const existingVolumes = (await run('fresh-restore-existing-volumes', ['volume', 'ls', '-q'])).split('\n')
  if (Object.values(volumes).some(value => existingVolumes.includes(value))) fail('FRESH_RESTORE_VOLUME_ALREADY_EXISTS_NO_ADOPTION')
  state[attemptKey] = { phase: 'BACKUP_STARTED', generation, backup_directory: backupDir, isolated_volumes: volumes, source_container_ids: receiptSourceIds }
  state.restore_containers ||= {}
  await saveState()
  const temporary = '/tmp/didar-fresh-' + (generation || state.token.slice(0, 12))
  const dbArgs = ['-U', config.DIDAR_DB_USER, '-d', config.DIDAR_DB_NAME]
  if (![config.DIDAR_DB_USER, config.DIDAR_DB_NAME].every(name)) fail('FRESH_RESTORE_DATABASE_NAMES_REQUIRED')
  await run('fresh-backup-postgres-custom', ['exec', sourceIds.postgres, 'pg_dump', ...dbArgs, '--format=custom', '--file=' + temporary + '.dump'])
  await run('fresh-backup-postgres-copy', ['cp', sourceIds.postgres + ':' + temporary + '.dump', join(backupDir, 'postgres.dump')])
  const pgHash = await hashPrivateCopy(join(backupDir, 'postgres.dump'))
  const keyspace = await run('fresh-backup-redis-keyspace', ['exec', sourceIds.redis, 'redis-cli', '--raw', 'INFO', 'keyspace'])
  if (keyspace.split('\n').some(line => /^db\d+:/.test(line) && !line.startsWith('db0:'))) fail('FRESH_RESTORE_REDIS_DB0_ONLY_REQUIRED')
  if (await run('fresh-backup-redis-save', ['exec', sourceIds.redis, 'redis-cli', 'SAVE']) !== 'OK') fail('FRESH_REDIS_SAVE_FAILED')
  const sourceRedisDigest = await run('fresh-backup-redis-logical-digest', ['exec', sourceIds.redis, 'redis-cli', '--raw', 'EVAL', redisDigestScript, '0'])
  if (!/^[a-f0-9]{40}$/.test(sourceRedisDigest)) fail('FRESH_REDIS_LOGICAL_DIGEST_REQUIRED')
  await run('fresh-backup-redis-copy', ['cp', sourceIds.redis + ':/data/dump.rdb', join(backupDir, 'redis.rdb')])
  const redisHash = await hashPrivateCopy(join(backupDir, 'redis.rdb'))
  const configurationBytes = Buffer.from(canonicalState(config) + '\n')
  for (const key of ['JWT_SECRET', 'COOKIE_SECRET', 'DIDAR_AUTH_NETWORK_KEY', 'DIDAR_DB_PASSWORD']) if (typeof config[key] !== 'string' || config[key].length < 32) fail('FRESH_RESTORE_SECRET_CUSTODY_REQUIRED')
  await writeFile(join(backupDir, 'configuration.private.json'), configurationBytes, { mode: 0o600, flag: 'wx' })
  await writeFile(join(backupDir, 'configuration.restored.private.json'), await readFile(join(backupDir, 'configuration.private.json')), { mode: 0o600, flag: 'wx' })
  if (!configurationBytes.equals(await readFile(join(backupDir, 'configuration.restored.private.json')))) fail('FRESH_CONFIGURATION_RESTORE_MISMATCH')
  const configHash = sha256(configurationBytes)

  const create = async (role, args, command = []) => {
    await preserve()
    const image = images[role === 'redis' ? 'redis' : 'postgres']
    const result = await run('fresh-restore-create-' + role, ['create', '--network', 'none', ...restoreOwnershipArguments(state), '--label', 'com.docker.compose.project=' + config.DIDAR_COMPOSE_PROJECT, '--label', 'com.docker.compose.service=restore-' + role, ...args, image, ...command])
    if (!id(result)) fail('FRESH_RESTORE_CONTAINER_ID_REQUIRED')
    state.restore_containers[result] = { image_id: image, service: 'restore-' + role }
    state.owned.containers.push(result); await saveState()
    await run('fresh-restore-start-' + role, ['start', result]); await preserve()
    return result
  }
  for (const volume of Object.values(volumes)) {
    await preserve()
    state.owned.volumes.push(volume); await saveState() // journal intent before create/use
    const created = await run('fresh-restore-create-volume', ['volume', 'create', ...restoreOwnershipArguments(state), volume])
    if (created !== volume) fail('FRESH_RESTORE_VOLUME_CREATION_MISMATCH')
    const actual = JSON.parse(await run('fresh-restore-verify-created-volume', ['volume', 'inspect', volume]))[0]
    if (actual.Name !== volume || actual.Labels?.['didar.fresh-owner'] !== state.token || state.qa_fixture === true && actual.Labels?.['didar.disposable-qa'] !== 'true') fail('FRESH_RESTORE_VOLUME_OWNERSHIP_MISMATCH')
  }
  const pg = await create('postgres', ['--env', 'POSTGRES_USER=' + config.DIDAR_DB_USER, '--env', 'POSTGRES_DB=' + config.DIDAR_DB_NAME, '--env', 'POSTGRES_HOST_AUTH_METHOD=trust', '--mount', 'type=volume,src=' + volumes.postgres + ',dst=/var/lib/postgresql/data'])
  await run('fresh-restore-postgres-wait', ['exec', pg, 'sh', '-ec', 'for i in $(seq 1 90); do pg_isready -h 127.0.0.1 -U "$1" -d "$2" >/dev/null 2>&1 && exit 0; sleep 1; done; exit 1', 'sh', config.DIDAR_DB_USER, config.DIDAR_DB_NAME])
  await run('fresh-restore-postgres-copy', ['cp', join(backupDir, 'postgres.dump'), pg + ':' + temporary + '.dump'])
  await run('fresh-restore-postgres-custom', ['exec', pg, 'pg_restore', ...dbArgs, '--exit-on-error', '--single-transaction', temporary + '.dump'])
  const logicalPg = async (container, stage) => run(stage, ['exec', container, 'sh', '-ec', 'pg_dump -U "$1" -d "$2" --no-owner --no-privileges --file=/tmp/didar-comparison.sql; sed \'/^\\\\restrict /d; /^\\\\unrestrict /d; /^-- Dumped /d\' /tmp/didar-comparison.sql > /tmp/didar-comparison-normalized.sql; sha256sum /tmp/didar-comparison-normalized.sql', 'sh', config.DIDAR_DB_USER, config.DIDAR_DB_NAME])
  const pgSource = await logicalPg(sourceIds.postgres, 'fresh-restore-postgres-source-digest'), pgRestored = await logicalPg(pg, 'fresh-restore-postgres-restored-digest')
  if (pgSource !== pgRestored) fail('FRESH_POSTGRES_LOGICAL_RESTORATION_MISMATCH')
  const redis = await create('redis', ['--entrypoint', 'sh', '--mount', 'type=volume,src=' + volumes.redis + ',dst=/data'], ['-c', 'exec sleep 2147483647'])
  await run('fresh-restore-redis-rdb-copy', ['cp', join(backupDir, 'redis.rdb'), redis + ':/data/dump.rdb'])
  await run('fresh-restore-redis-load-rdb', ['exec', redis, 'redis-server', '--daemonize', 'yes', '--dir', '/data', '--dbfilename', 'dump.rdb', '--bind', '127.0.0.1', '--save', '', '--appendonly', 'no'])
  await run('fresh-restore-redis-wait', ['exec', redis, 'sh', '-ec', 'for i in $(seq 1 30); do redis-cli ping >/dev/null 2>&1 && exit 0; sleep 1; done; exit 1'])
  if (await run('fresh-restore-redis-logical-digest', ['exec', redis, 'redis-cli', '--raw', 'EVAL', redisDigestScript, '0']) !== sourceRedisDigest) fail('FRESH_REDIS_LOGICAL_RESTORATION_MISMATCH')
  const uploads = await create('uploads', ['--entrypoint', 'sh', '--mount', 'type=volume,src=' + config.DIDAR_UPLOADS_VOLUME + ',dst=/source,readonly', '--mount', 'type=volume,src=' + volumes.uploads + ',dst=/restored'], ['-c', 'exec sleep 2147483647'])
  const mediaHash = async (path, stage) => run(stage, ['exec', uploads, 'sh', '-ec', 'cd "$1"; test -z "$(find . ! -type f ! -type d -print -quit)"; find . -type f -exec sha256sum {} \\; > /tmp/media-hashes; LC_ALL=C sort /tmp/media-hashes > /tmp/media-sorted; sha256sum /tmp/media-sorted', 'sh', path])
  const sourceMedia = await mediaHash('/source', 'fresh-backup-uploads-every-file-digest')
  await run('fresh-backup-uploads-archive', ['exec', uploads, 'tar', '-cf', temporary + '.tar', '-C', '/source', '.'])
  await run('fresh-backup-uploads-copy', ['cp', uploads + ':' + temporary + '.tar', join(backupDir, 'uploads.tar')])
  const uploadsHash = await hashPrivateCopy(join(backupDir, 'uploads.tar'))
  await run('fresh-restore-uploads-copy', ['cp', join(backupDir, 'uploads.tar'), uploads + ':' + temporary + '.restore.tar'])
  await run('fresh-restore-uploads-extract', ['exec', uploads, 'tar', '-xf', temporary + '.restore.tar', '-C', '/restored'])
  if (await mediaHash('/restored', 'fresh-restore-uploads-every-file-digest') !== sourceMedia) fail('FRESH_UPLOADS_FULL_RESTORATION_MISMATCH')
  // Restored copies are evidence, never a second active authority. Stop only
  // these exact newly-created IDs; retain every container and volume.
  await preserve()
  for (const container of [uploads, redis, pg]) {
    const actual = JSON.parse(await run('fresh-restore-recheck-before-stop', ['inspect', container]))[0]
    if (actual.Id !== container || actual.Config.Labels?.['didar.fresh-owner'] !== state.token || state.qa_fixture === true && actual.Config.Labels?.['didar.disposable-qa'] !== 'true' || actual.Config.Labels?.['com.docker.compose.project'] !== config.DIDAR_COMPOSE_PROJECT || actual.Image !== state.restore_containers[container].image_id || actual.Config.Labels?.['com.docker.compose.service'] !== state.restore_containers[container].service) fail('FRESH_RESTORE_OWNERSHIP_CHANGED_BEFORE_STOP')
    await run('fresh-restore-stop-retain', ['stop', '--time', '15', container])
  }
  if (checkpoint && !same(checkpointSubjects, await verifyCheckpointApplications({ config, state, run, applicationImages }))) fail('FRESH_CHECKPOINT_APPLICATION_METADATA_CHANGED')
  const receipt = { format: 1, status: 'PASS', scope: checkpoint ? state.qa_fixture === true ? 'WRAPPER_PROTOCOL_FIXTURE' : 'FRESH_QUIESCED_FOUR_CONTAINER_CHECKPOINT' : 'PARALLEL_FRESH_INITIALIZED_STATE', source_container_ids: receiptSourceIds, initialization_state_sha256: state.initialization_state_sha256, checkpoint_generation: generation, matched_application_images: checkpoint ? applicationImages : null, checkpoint_application_metadata_sha256: checkpointSubjects, database_restoration: 'PASS', restoration: { postgres: 'PASS', redis: 'PASS', uploads: 'PASS', configuration: 'PASS' }, isolated_volumes: volumes, isolated_restore_containers: 'STOPPED_RETAINED', matched_dependency_images: images, backup_sha256: { postgres: pgHash, redis: redisHash, uploads: uploadsHash, configuration: configHash }, logical_sha256: { postgres: pgSource.split(' ')[0], uploads: sourceMedia.split(' ')[0] }, redis_logical_sha1: sourceRedisDigest, evidence_url: evidenceUrl, evidence_publication_status: 'NOT_VERIFIED_OWNER_DESTINATION_ONLY', backup_directory: backupDir, created_at: new Date().toISOString(), limitations: [checkpoint ? 'QUIESCED_FRESH_FOUR_CONTAINER_STATE_ONLY_NOT_LEGACY_BACKUP' : 'INITIALIZED_FRESH_STATE_ONLY_NOT_A_LEGACY_OR_RUNNING_FOUR_CONTAINER_BACKUP', 'CONFIGURATION_SCOPE_LITERAL_APPLICATION_ENV_ONLY_NOT_HOST_NGINX_TLS_FILES', 'NO_TARGET_OR_PUBLIC_HTTPS_ACCEPTANCE'] }
  await preserve()
  const bytes = Buffer.from(JSON.stringify(receipt, null, 2) + '\n'), file = await open(receiptPath, 'wx', 0o600)
  try { await file.writeFile(bytes); await file.sync() } finally { await file.close() }
  state[attemptKey].phase = 'LOCAL_RESTORATION_VERIFIED_EVIDENCE_PUBLICATION_REQUIRED'; state[attemptKey].receipt_sha256 = sha256(bytes); state[attemptKey].receipt_path = receiptPath; await saveState()
  return { status: checkpoint ? 'FRESH_QUIESCED_FOUR_CONTAINER_CHECKPOINT_RESTORED_LOCALLY' : 'FRESH_INITIALIZED_STATE_RESTORED_LOCALLY', receipt_path: receiptPath, receipt_sha256: sha256(bytes), source_container_ids: receiptSourceIds, evidence_publication_status: receipt.evidence_publication_status }
}
