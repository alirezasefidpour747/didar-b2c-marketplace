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
const ddlKeywords = new Set('CREATE TABLE INDEX UNIQUE CONSTRAINT CHECK WHERE AND OR NOT IS NULL ANY ALL BETWEEN IN ON USING ONLY DEFAULT PRIMARY KEY FOREIGN REFERENCES WITH WITHOUT AS SELECT FROM TRUE FALSE COLLATE ASC DESC NULLS FIRST LAST INCLUDE TABLESPACE DEFERRABLE INITIALLY DEFERRED IMMEDIATE MATCH FULL SIMPLE PARTIAL NO ACTION RESTRICT CASCADE SET UPDATE DELETE ALTER ADD DROP COLUMN VALID VALIDATE STORED GENERATED ALWAYS BY IDENTITY'.split(' '))
const ddlOperators = Object.entries({ '!~~*': 'NOT_ILIKE', '~~*': 'ILIKE', '!~~': 'NOT_LIKE', '~~': 'LIKE', '!~*': 'NOT_REGEX_I', '!~': 'NOT_REGEX', '~*': 'REGEX_I', '->>': 'JSON_GET_TEXT', '->': 'JSON_GET', '::': 'CAST', '<>': 'NE', '!=': 'NE', '<=': 'LE', '>=': 'GE', '||': 'CONCAT', '@>': 'CONTAINS', '<@': 'CONTAINED_BY', '?&': 'HAS_ALL_KEYS', '?|': 'HAS_ANY_KEY', '&&': 'OVERLAP', ':=': 'ASSIGN', '=': 'EQ', '<': 'LT', '>': 'GT', '+': 'PLUS', '-': 'MINUS', '*': 'STAR', '/': 'SLASH', '~': 'REGEX', '?': 'HAS_KEY', '&': 'BIT_AND', '|': 'BIT_OR', '#': 'BIT_XOR', '%': 'MODULO' }).sort((a, b) => b[0].length - a[0].length)
const ddlPunctuation = { '(': 'LPAREN', ')': 'RPAREN', '[': 'LBRACKET', ']': 'RBRACKET', ',': 'COMMA', '.': 'DOT', ';': 'SEMICOLON' }

function lexPostgresDDL(text) {
  const result = []; let offset = 0, line = 1
  while (offset < text.length) {
    const start = offset, first = text[offset], rest = text.slice(offset); let category = 'OTHER', symbol
    if (/\s/.test(first)) { while (offset < text.length && /\s/.test(text[offset])) offset++ }
    else if (rest.startsWith('--')) { category = 'COMMENT'; const end = text.indexOf('\n', offset); offset = end < 0 ? text.length : end }
    else if (rest.startsWith('/*')) {
      category = 'COMMENT'; offset += 2; let depth = 1
      while (offset < text.length && depth) { if (text.startsWith('/*', offset)) { depth++; offset += 2 } else if (text.startsWith('*/', offset)) { depth--; offset += 2 } else offset++ }
    } else {
      const dollar = /^(?:\$[A-Za-z_][A-Za-z_0-9]*\$|\$\$)/.exec(rest)?.[0], prefixed = /^[eEbBxXnN]'/.test(rest)
      if (dollar) { category = 'STRING_LITERAL'; const end = text.indexOf(dollar, offset + dollar.length); offset = end < 0 ? text.length : end + dollar.length }
      else if (first === "'" || first === '"' || prefixed) {
        const quote = prefixed ? "'" : first; category = quote === '"' ? 'IDENTIFIER' : 'STRING_LITERAL'; offset += prefixed ? 2 : 1
        while (offset < text.length) { if (text[offset] === '\\') { offset = Math.min(text.length, offset + 2) } else if (text[offset] === quote) { if (text[offset + 1] === quote) offset += 2; else { offset++; break } } else offset++ }
      } else {
        const identifier = /^[A-Za-z_\u0080-\uFFFF][A-Za-z_0-9$\u0080-\uFFFF]*/.exec(rest)?.[0], number = /^[0-9]+(?:\.[0-9]*)?(?:[eE][+-]?[0-9]+)?/.exec(rest)?.[0], operator = ddlOperators.find(([raw]) => rest.startsWith(raw))
        if (identifier) { offset += identifier.length; category = ddlKeywords.has(identifier.toUpperCase()) ? 'KEYWORD' : 'IDENTIFIER'; if (category === 'KEYWORD') symbol = identifier.toUpperCase() }
        else if (number) { offset += number.length; category = 'NUMBER' }
        else if (operator) { offset += operator[0].length; category = 'OPERATOR'; symbol = operator[1] }
        else if (ddlPunctuation[first]) { offset++; category = 'PUNCTUATION'; symbol = ddlPunctuation[first] }
        else offset += String.fromCodePoint(text.codePointAt(offset)).length
      }
    }
    const raw = text.slice(start, offset), encoded = symbol ? category + ':' + symbol : category + ':' + sha256(raw) + ':' + Buffer.byteLength(raw), lineCount = raw.split('\n').length - 1
    result.push({ encoded, start_line: line, end_line: line + lineCount }); line += lineCount
  }
  return result
}

export const tokenizePostgresDDL = text => lexPostgresDDL(text).map(token => token.encoded)

export function describePostgresDDLDifference(source, restored) {
  const sections = bytes => {
    const result = new Map(), counts = new Map(); let section = null, copying = false, quote = null, dollar = null, commentDepth = 0
    const lines = bytes.toString('utf8').split('\n')
    for (let position = 0; position < lines.length; position++) {
      const value = lines[position]
      if (!copying && !quote && !dollar && !commentDepth && /^-- Name: /.test(value)) {
        const raw = sha256(value), occurrence = counts.get(raw) || 0; counts.set(raw, occurrence + 1)
        const type = /; Type: (TABLE|INDEX); Schema:/.exec(value)?.[1]
        section = type ? { type, identity: sha256(raw + ':' + occurrence), start: position + 1, lines: [] } : null
        if (section) result.set(section.identity, section)
      }
      if (section) section.lines.push(value)
      if (copying && value === '\\.') copying = false
      else if (!copying && !quote && !dollar && !commentDepth && /^COPY .* FROM stdin;$/.test(value)) copying = true
      else if (!copying) {
        // A header-shaped line inside a multiline literal/comment is data,
        // never a fresh pg_dump section or a new lexer trust boundary.
        for (let cursor = 0; cursor < value.length;) {
          if (dollar) { const end = value.indexOf(dollar, cursor); if (end < 0) break; cursor = end + dollar.length; dollar = null }
          else if (quote) { if (value[cursor] === '\\') cursor += 2; else if (value[cursor] === quote) { if (value[cursor + 1] === quote) cursor += 2; else { quote = null; cursor++ } } else cursor++ }
          else if (commentDepth) { if (value.startsWith('/*', cursor)) { commentDepth++; cursor += 2 } else if (value.startsWith('*/', cursor)) { commentDepth--; cursor += 2 } else cursor++ }
          else if (value.startsWith('--', cursor)) break
          else if (value.startsWith('/*', cursor)) { commentDepth = 1; cursor += 2 }
          else if (value[cursor] === "'" || value[cursor] === '"') quote = value[cursor++]
          else { const tag = value[cursor] === '$' && /^(?:\$[A-Za-z_][A-Za-z_0-9]*\$|\$\$)/.exec(value.slice(cursor))?.[0]; if (tag) { dollar = tag; cursor += tag.length } else cursor++ }
        }
      }
    }
    return result
  }
  const left = sections(Buffer.from(source)), right = sections(Buffer.from(restored)), lines = []; let changed = 0
  for (const [identity, a] of left) {
    const b = right.get(identity); if (!b || a.type !== b.type) continue
    const aTokens = lexPostgresDDL(a.lines.join('\n')), bTokens = lexPostgresDDL(b.lines.join('\n'))
    for (let position = 0; position < Math.max(a.lines.length, b.lines.length); position++) {
      const aLine = a.lines[position] || '', bLine = b.lines[position] || ''
      if (aLine === bLine) continue
      changed++; if (lines.length >= 10) continue
      const sourceTokens = aTokens.filter(token => token.start_line <= position + 1 && token.end_line >= position + 1).map(token => token.encoded), restoredTokens = bTokens.filter(token => token.start_line <= position + 1 && token.end_line >= position + 1).map(token => token.encoded)
      lines.push({ section_type: a.type, section_identity_sha256: identity, source_line: a.start + position, restored_line: b.start + position, source_line_sha256: sha256(aLine), restored_line_sha256: sha256(bLine), source_token_count: sourceTokens.length, restored_token_count: restoredTokens.length, source_tokens: sourceTokens.slice(0, 256), restored_tokens: restoredTokens.slice(0, 256) })
    }
  }
  return { kind: 'POSTGRES_DDL_DIFFERENCE_V1', changed_line_count: changed, lines }
}

// Diagnostics only: these classifications never authorize a mismatching dump.
// Raw SQL stays in the caller's private backup directory, outside CI uploads.
export function describePostgresDumpDifference(source, restored) {
  const types = new Set(['TABLE_DATA', 'SEQUENCE_SET', 'TABLE', 'INDEX', 'CONSTRAINT', 'FK_CONSTRAINT', 'SEQUENCE', 'SCHEMA', 'FUNCTION', 'TYPE', 'EXTENSION', 'ACL', 'COMMENT', 'DEFAULT'])
  const summarize = bytes => {
    const lines = bytes.toString('utf8').split('\n'), classified = [], sections = [], counts = new Map()
    let section = { type: 'HEADER', identity: sha256('HEADER'), lines: [], rows: [] }, copy = false
    for (const line of lines) {
      if (!copy && /^-- Name: /.test(line)) {
        sections.push(section)
        const raw = sha256(line), occurrence = counts.get(raw) || 0; counts.set(raw, occurrence + 1)
        const parsed = /; Type: ([A-Z][A-Z ]*); Schema:/.exec(line)?.[1]?.replaceAll(' ', '_')
        section = { type: types.has(parsed) ? parsed : 'OTHER', identity: sha256(raw + ':' + occurrence), lines: [], rows: [] }
      }
      let category
      if (copy) { category = line === '\\.' ? 'COPY_END' : 'COPY_DATA'; if (category === 'COPY_END') copy = false; else section.rows.push(sha256(line)) }
      else if (/^COPY .* FROM stdin;$/.test(line)) { category = 'COPY_HEADER'; copy = true }
      else if (/^SELECT pg_catalog\.setval\(/.test(line)) category = 'SEQUENCE_STATE'
      else category = line === '' ? 'BLANK' : line.startsWith('--') ? 'COMMENT' : 'SQL'
      classified.push(category); section.lines.push(line)
    }
    sections.push(section)
    return { bytes, lines, classified, sections }
  }
  const left = summarize(Buffer.from(source)), right = summarize(Buffer.from(restored)), leftMap = new Map(left.sections.map(section => [section.identity, section])), rightMap = new Map(right.sections.map(section => [section.identity, section]))
  let offset = 0
  while (offset < left.lines.length && offset < right.lines.length && left.lines[offset] === right.lines[offset]) offset++
  const differing = []
  for (const identity of new Set([...leftMap.keys(), ...rightMap.keys()])) {
    const a = leftMap.get(identity), b = rightMap.get(identity), aHash = a ? sha256(a.lines.join('\n')) : null, bHash = b ? sha256(b.lines.join('\n')) : null
    if (aHash === bHash) continue
    differing.push({ section_type: (a || b).type, section_identity_sha256: identity, source_sha256: aHash, restored_sha256: bHash, source_lines: a?.lines.length || 0, restored_lines: b?.lines.length || 0, source_rows: a?.rows.length || 0, restored_rows: b?.rows.length || 0, row_multiset_equal: a && b ? same([...a.rows].sort(), [...b.rows].sort()) : null })
  }
  return { kind: 'POSTGRES_DUMP_DIFFERENCE_V1', source_sha256: sha256(left.bytes), restored_sha256: sha256(right.bytes), source_line_count: left.lines.length, restored_line_count: right.lines.length, source_byte_count: left.bytes.length, restored_byte_count: right.bytes.length, section_order_equal: same(left.sections.map(section => section.identity), right.sections.map(section => section.identity)), differing_section_count: differing.length, first_difference: { source_line: Math.min(offset + 1, left.lines.length + 1), restored_line: Math.min(offset + 1, right.lines.length + 1), source_class: left.classified[offset] || 'EOF', restored_class: right.classified[offset] || 'EOF', source_line_sha256: sha256(left.lines[offset] || ''), restored_line_sha256: sha256(right.lines[offset] || '') }, section_differences: differing.slice(0, 25) }
}

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

export async function recordPostgresDumpDifference({ sourceContainer, restoredContainer, run, backupDir, sourceDigest, restoredDigest }) {
  if (!id(sourceContainer) || !id(restoredContainer)) fail('FRESH_POSTGRES_DIAGNOSTIC_CONTAINER_IDS_REQUIRED')
  const sourcePath = join(backupDir, 'postgres.source.normalized.private.sql'), restoredPath = join(backupDir, 'postgres.restored.normalized.private.sql')
  await verifyNewPrivateDestination(sourcePath); await verifyNewPrivateDestination(restoredPath)
  await run('fresh-restore-postgres-source-diagnostic-copy', ['cp', sourceContainer + ':/tmp/didar-comparison-normalized.sql', sourcePath])
  await hashPrivateCopy(sourcePath)
  await run('fresh-restore-postgres-restored-diagnostic-copy', ['cp', restoredContainer + ':/tmp/didar-comparison-normalized.sql', restoredPath])
  await hashPrivateCopy(restoredPath)
  const diagnostic = describePostgresDumpDifference(await readFile(sourcePath), await readFile(restoredPath))
  if (diagnostic.source_sha256 !== sourceDigest.split(' ')[0] || diagnostic.restored_sha256 !== restoredDigest.split(' ')[0]) fail('FRESH_POSTGRES_DIAGNOSTIC_SUBJECT_CHANGED')
  await writeFile(join(backupDir, 'postgres-difference.sanitized.json'), JSON.stringify(diagnostic, null, 2) + '\n', { mode: 0o600, flag: 'wx' })
  run.recordFixtureObservation?.('fresh-postgres-logical-difference', diagnostic)
  const ddl = describePostgresDDLDifference(await readFile(sourcePath), await readFile(restoredPath))
  await writeFile(join(backupDir, 'postgres-ddl-difference.sanitized.json'), JSON.stringify(ddl, null, 2) + '\n', { mode: 0o600, flag: 'wx' })
  run.recordFixtureObservation?.('fresh-postgres-ddl-difference', ddl)
  return diagnostic
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
  if (pgSource !== pgRestored) {
    try {
      await recordPostgresDumpDifference({ sourceContainer: sourceIds.postgres, restoredContainer: pg, run, backupDir, sourceDigest: pgSource, restoredDigest: pgRestored })
    } catch {
      // Numeric failure receipts are already journaled by run(); preserve the
      // original strict mismatch and never substitute raw SQL in public logs.
    }
    fail('FRESH_POSTGRES_LOGICAL_RESTORATION_MISMATCH')
  }
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
