// Protected, local-only operator wrapper for the reviewed signed topology.
// This never installs/reloads host Nginx, discovers trust, seeds demo data or deletes volumes.
import { createHash, randomBytes, X509Certificate, createPrivateKey, createPublicKey } from 'node:crypto'
import { readFile, lstat, realpath, open, unlink, rename, statfs, mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve, join, isAbsolute, relative } from 'node:path'
import { spawn } from 'node:child_process'
import { isIP } from 'node:net'
import { fileURLToPath } from 'node:url'

export const actions = Object.freeze(['preflight', 'status', 'quiesce', 'migrate', 'recreate', 'health', 'recover'])
export const bundleFiles = Object.freeze(['stack.mjs', 'compose.topology.json', 'auth.mjs', 'sign.mjs', 'render.mjs', 'nginx.conf.template', 'proxy-headers.conf', 'topology.env.template'])
const configurationKeys = Object.freeze(['DIDAR_COMPOSE_PROJECT', 'DIDAR_COMPOSE_NETWORK', 'DIDAR_POSTGRES_VOLUME', 'DIDAR_REDIS_VOLUME', 'DIDAR_UPLOADS_VOLUME', 'DIDAR_API_IMAGE', 'DIDAR_STOREFRONT_IMAGE', 'DIDAR_POSTGRES_IMAGE', 'DIDAR_REDIS_IMAGE', 'DIDAR_DB_USER', 'DIDAR_DB_NAME', 'DIDAR_DB_PASSWORD', 'DATABASE_URL', 'REDIS_URL', 'JWT_SECRET', 'COOKIE_SECRET', 'DIDAR_AUTH_NETWORK_KEY', 'DIDAR_PUBLIC_ORIGIN', 'DIDAR_PUBLIC_ORIGIN_VERIFIED', 'DIDAR_AUTH_HOST_PORT', 'DIDAR_AUTH_INGRESS_PEERS', 'DIDAR_AUTH_TLS_DIR', 'DIDAR_AUTH_TLS_SERVER_NAME'])
const stableKeys = ['JWT_SECRET', 'COOKIE_SECRET', 'DIDAR_AUTH_NETWORK_KEY', 'DATABASE_URL', 'REDIS_URL']
const hashPattern = /^[a-f0-9]{64}$/
const shaPattern = /^[a-f0-9]{40}$/
const canonicalPeer = value => {
  if (!isIP(value) || value.includes('%')) return null
  if (isIP(value) === 4) return value
  const normalized = new URL('http://[' + value + ']/').hostname.slice(1, -1).toLowerCase()
  const mapped = normalized.match(/^::ffff:([a-f0-9]+):([a-f0-9]+)$/)
  if (!mapped) return normalized
  const first = parseInt(mapped[1], 16), second = parseInt(mapped[2], 16)
  return [first >> 8, first & 255, second >> 8, second & 255].join('.')
}
const imagePattern = /^(?:sha256:[a-f0-9]{64}|[a-zA-Z0-9][a-zA-Z0-9._:/-]*@sha256:[a-f0-9]{64})$/
const idPattern = /^[a-f0-9]{64}$/
const fail = code => { throw Error(code) }
export const sha256 = value => createHash('sha256').update(value).digest('hex')
const exactKeys = (value, keys, code) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) fail(code)
}
const literalPath = value => typeof value === 'string' && isAbsolute(value) && !/[\x00-\x1f\x7f]/.test(value) && !value.split('/').includes('..')
const ownedName = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(value)
export function parseConfiguration(text, inherited = {}) {
  if (typeof text !== 'string' || /[\x00\r]/.test(text)) fail('INVALID_ENV_BYTES')
  const result = {}
  for (const line of text.split('\n')) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/)
    if (!match || !configurationKeys.includes(match[1]) || Object.hasOwn(result, match[1])) fail('INVALID_OR_DUPLICATE_ENV_KEY')
    // Values are literal. Never feed this file to a shell or Compose dotenv parser.
    if (!match[2] || /^['"]/.test(match[2]) || /[\x00-\x1f\x7f]/.test(match[2])) fail('INVALID_ENV_VALUE:' + match[1])
    result[match[1]] = match[2]
    if (inherited[match[1]] !== undefined && inherited[match[1]] !== match[2]) fail('STALE_ENV_OVERRIDE:' + match[1])
  }
  exactKeys(result, configurationKeys, 'EXPLICIT_CONFIGURATION_REQUIRED')
  for (const key of ['DIDAR_COMPOSE_PROJECT', 'DIDAR_COMPOSE_NETWORK', 'DIDAR_POSTGRES_VOLUME', 'DIDAR_REDIS_VOLUME', 'DIDAR_UPLOADS_VOLUME', 'DIDAR_DB_USER', 'DIDAR_DB_NAME']) if (!ownedName(result[key])) fail('INVALID_RESOURCE_NAME:' + key)
  if (new Set(['DIDAR_POSTGRES_VOLUME', 'DIDAR_REDIS_VOLUME', 'DIDAR_UPLOADS_VOLUME'].map(k => result[k])).size !== 3) fail('DISTINCT_AUTHORITATIVE_VOLUMES_REQUIRED')
  for (const key of ['DIDAR_API_IMAGE', 'DIDAR_STOREFRONT_IMAGE', 'DIDAR_POSTGRES_IMAGE', 'DIDAR_REDIS_IMAGE']) if (!imagePattern.test(result[key])) fail('IMMUTABLE_IMAGE_REQUIRED:' + key)
  for (const key of ['JWT_SECRET', 'COOKIE_SECRET', 'DIDAR_AUTH_NETWORK_KEY']) if (Buffer.byteLength(result[key]) < 32) fail('SECRET_NOT_CONFIGURED:' + key)
  for (const [key, protocols] of [['DATABASE_URL', ['postgres:', 'postgresql:']], ['REDIS_URL', ['redis:', 'rediss:']]]) {
    let url; try { url = new URL(result[key]) } catch { fail('INVALID_CONNECTION_URL:' + key) }
    if (!protocols.includes(url.protocol) || !url.hostname || url.hash) fail('INVALID_CONNECTION_URL:' + key)
  }
  let origin; try { origin = new URL(result.DIDAR_PUBLIC_ORIGIN) } catch { fail('INVALID_PUBLIC_ORIGIN') }
  if (origin.protocol !== 'https:' || origin.origin !== result.DIDAR_PUBLIC_ORIGIN || origin.username || origin.password) fail('INVALID_PUBLIC_ORIGIN')
  if (!['true', 'false'].includes(result.DIDAR_PUBLIC_ORIGIN_VERIFIED)) fail('INVALID_PUBLIC_ORIGIN_VERIFIED')
  if (!/^[0-9]{1,5}$/.test(result.DIDAR_AUTH_HOST_PORT) || +result.DIDAR_AUTH_HOST_PORT < 1024 || +result.DIDAR_AUTH_HOST_PORT > 65535) fail('INVALID_PRIVATE_RELAY_PORT')
  const peers = result.DIDAR_AUTH_INGRESS_PEERS.split(',')
  if (peers.some(peer => canonicalPeer(peer) !== peer || peer === '0.0.0.0' || peer === '::') || new Set(peers).size !== peers.length) fail('EXACT_OBSERVED_PEERS_REQUIRED')
  if (!literalPath(result.DIDAR_AUTH_TLS_DIR)) fail('INVALID_TLS_DIRECTORY')
  if (!/^(?=.{1,253}$)[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?$/.test(result.DIDAR_AUTH_TLS_SERVER_NAME)) fail('INVALID_TLS_SERVER_NAME')
  return result
}

export function localEnvironment(inherited = process.env) {
  if (inherited.DOCKER_HOST && inherited.DOCKER_HOST !== 'unix:///var/run/docker.sock') fail('LOCAL_DOCKER_ONLY')
  if (inherited.DOCKER_CONTEXT && inherited.DOCKER_CONTEXT !== 'default') fail('LOCAL_DOCKER_CONTEXT_ONLY')
  for (const name of Object.keys(inherited)) if ((name.startsWith('COMPOSE_') && inherited[name]) || ['DOCKER_TLS', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH', 'NODE_TLS_REJECT_UNAUTHORIZED', 'NODE_OPTIONS'].includes(name) && inherited[name]) fail('UNSAFE_PROCESS_OVERRIDE:' + name)
  const child = { ...inherited }
  for (const name of Object.keys(child)) if (configurationKeys.includes(name) || name.startsWith('COMPOSE_') || name.startsWith('DOCKER_')) delete child[name]
  child.COMPOSE_DISABLE_ENV_FILE = '1'
  return child
}

export function versionAtLeast(value, minimum, major) {
  const parsed = String(value).match(/^v?([0-9]+)\.([0-9]+)\.([0-9]+)(?:[-+].*)?$/)
  if (!parsed || +parsed[1] !== major) return false
  const actual = parsed.slice(1).map(Number), needed = minimum.split('.').map(Number)
  for (let i = 0; i < 3; i++) if (actual[i] !== needed[i]) return actual[i] > needed[i]
  return true
}

// Replacement occurs once; Compose receives escaped dollar signs in stdin JSON.
// No .env is sourced, and no attacker value is recursively interpolated.
export function renderComposition(template, configuration) {
  const replace = value => {
    if (typeof value === 'string') return value.replace(/\$\{([A-Z][A-Z0-9_]*)(?:(:\?)[^}]*|:-([^}]*))?\}/g, (_, key, required, fallback) => {
      if (Object.hasOwn(configuration, key)) return configuration[key]
      if (!required && fallback !== undefined) return fallback
      fail('UNKNOWN_TEMPLATE_VARIABLE:' + key)
    })
    if (Array.isArray(value)) return value.map(replace)
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, replace(entry)]))
    return value
  }
  const result = replace(template)
  if (result.services?.storefront?.network_mode !== 'service:api' || result.services?.api?.environment?.DIDAR_AUTH_PROXY_POLICY !== 'require-proof' || result.services?.storefront?.environment?.DIDAR_AUTH_INGRESS_MODE !== 'verified-relay') fail('REVIEWED_TRUST_TOPOLOGY_REQUIRED')
  return JSON.stringify(result).replace(/\$/g, '$$$$')
}

async function privateFile(path) {
  if (!literalPath(path)) fail('ABSOLUTE_PRIVATE_PATH_REQUIRED')
  const info = await lstat(path)
  if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o777) !== 0o600 || typeof process.getuid === 'function' && info.uid !== process.getuid()) fail('PRIVATE_FILE_0600_OWNER_REQUIRED')
  if (await realpath(path) !== resolve(path)) fail('SYMLINKED_PRIVATE_PATH_REFUSED')
  return readFile(path)
}
async function checkedFile(root, path, expected) {
  if (typeof path !== 'string' || !path || isAbsolute(path) || path.split('/').includes('..') || !hashPattern.test(expected)) fail('INVALID_BUNDLE_FILE')
  const absolute = resolve(root, path), info = await lstat(absolute)
  if (!info.isFile() || info.isSymbolicLink() || !relative(root, await realpath(absolute)) || relative(root, await realpath(absolute)).startsWith('..')) fail('BUNDLE_FILE_ESCAPE')
  const bytes = await readFile(absolute)
  if (sha256(bytes) !== expected) fail('BUNDLE_HASH_MISMATCH:' + path)
  return bytes
}
export async function readBundle(path, expected, { allowFixture = false } = {}) {
  if (!literalPath(path) || !hashPattern.test(expected)) fail('EXPLICIT_MANIFEST_HASH_REQUIRED')
  const bytes = await readFile(path)
  if (sha256(bytes) !== expected) fail('MANIFEST_HASH_MISMATCH')
  const manifest = JSON.parse(bytes), root = dirname(path)
  exactKeys(manifest, ['format', 'kind', 'source_sha', 'platform', 'files', 'images', 'artifact_verification', 'independent_review'], 'INVALID_MANIFEST_FIELDS')
  if (manifest.format !== 1 || (!['didar-nginx-verified-topology', 'didar-nginx-wrapper-protocol-fixture'].includes(manifest.kind) || manifest.kind === 'didar-nginx-wrapper-protocol-fixture' && !allowFixture) || !shaPattern.test(manifest.source_sha) || manifest.platform !== 'linux/amd64') fail('INVALID_BUNDLE_PROVENANCE')
  for (const name of bundleFiles) if (!manifest.files[name]) fail('INCOMPLETE_SIGNER_CONFIG_BUNDLE:' + name)
  for (const [name, digest] of Object.entries(manifest.files)) await checkedFile(root, name, digest)
  exactKeys(manifest.images, ['api', 'storefront', 'postgres', 'redis'], 'EXPLICIT_BUNDLE_IMAGES_REQUIRED')
  for (const [role, image] of Object.entries(manifest.images)) {
    exactKeys(image, ['reference', 'image_id'], 'INVALID_IMAGE_FIELDS:' + role)
    if (!imagePattern.test(image.reference) || !/^sha256:[a-f0-9]{64}$/.test(image.image_id)) fail('IMMUTABLE_IMAGE_REQUIRED:' + role)
  }
  for (const [name, requiredStatus] of [['artifact_verification', 'PASS'], ['independent_review', 'APPROVED']]) {
    const receipt = manifest[name]
    exactKeys(receipt, ['path', 'sha256'], 'INVALID_REVIEW_REFERENCE')
    const evidence = JSON.parse(await checkedFile(root, receipt.path, receipt.sha256))
    const status = manifest.kind === 'didar-nginx-wrapper-protocol-fixture' ? 'FIXTURE_ONLY' : requiredStatus
    if (evidence.status !== status || evidence.source_sha !== manifest.source_sha || evidence.topology !== 'nginx-verified-relay-v1' || evidence.workspace_mounts !== false || evidence.source_overlays !== false || evidence.exit_code !== 0) fail('NEW_ARTIFACT_ACCEPTANCE_REQUIRED:' + name)
    for (const role of ['api', 'storefront']) if (evidence.images?.[role] !== manifest.images[role].image_id) fail('EVIDENCE_IMAGE_MISMATCH:' + name)
  }
  return { manifest, root, hash: expected, composition: JSON.parse(await readFile(join(root, 'compose.topology.json'), 'utf8')) }
}

// Diagnostic output is for owned disposable fixtures only, never raw env dumps.
export function redactDiagnostic(bytes, ...sources) {
  const privateValues = sources.flatMap(source => Object.entries(source || {})).filter(([name, value]) => /SECRET|KEY|PASSWORD|TOKEN|CREDENTIAL|_PROXY$|_URL$/.test(name) && typeof value === 'string' && value.length).map(([, value]) => value).sort((left, right) => right.length - left.length)
  let text = bytes.toString('utf8')
  for (const value of privateValues) for (const variant of [value, encodeURIComponent(value), encodeURIComponent(encodeURIComponent(value))]) text = text.split(variant).join('[REDACTED]')
  return text.replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+:[^\s/@]+@/gi, '$1[REDACTED]@').replace(/Bearer [A-Za-z0-9._-]+/g, 'Bearer [REDACTED]').replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[JWT_REDACTED]').replace(/\bv1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[AUTH_PROOF_REDACTED]').slice(-65536)
}

export function runner(environment, receipts, privateConfiguration = {}) {
  let fixtureDiagnostics = false
  const run = async (stage, args, input) => new Promise((done, reject) => {
    const start = new Date().toISOString(), child = spawn('docker', ['--host=unix:///var/run/docker.sock', ...args], { env: environment, stdio: ['pipe', 'pipe', 'pipe'] })
    const stdout = [], stderr = []; let count = 0, timedOut = false, spawnError = null
    const timeout = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); setTimeout(() => child.kill('SIGKILL'), 5000).unref() }, 600000)
    const consume = target => chunk => { count += chunk.length; if (count > 32 * 1024 * 1024) child.kill('SIGTERM'); else target.push(chunk) }
    child.stdout.on('data', consume(stdout)); child.stderr.on('data', consume(stderr))
    child.on('error', error => { spawnError = error.code || 'SPAWN_ERROR' })
    child.stdin.on('error', () => {})
    child.stdin.end(input)
    child.on('close', (code, signal) => {
      clearTimeout(timeout)
      const failed = code !== 0 || signal || spawnError || timedOut || count > 32 * 1024 * 1024
      const receipt = { stage, started_at: start, finished_at: new Date().toISOString(), code, signal, spawn_error: spawnError, timed_out: timedOut }
      if (failed) { receipt.stdout_sha256 = sha256(Buffer.concat(stdout)); receipt.stderr_sha256 = sha256(Buffer.concat(stderr)) }
      if (failed && fixtureDiagnostics) receipt.diagnostic = { stdout: redactDiagnostic(Buffer.concat(stdout), privateConfiguration, environment), stderr: redactDiagnostic(Buffer.concat(stderr), privateConfiguration, environment) }
      receipts.push(receipt)
      if (failed) reject(Error('DOCKER_STAGE_FAILED:' + stage + ':exit=' + code))
      else done(Buffer.concat(stdout).toString('utf8').trim())
    })
  })
  Object.defineProperty(run, 'enableFixtureDiagnostics', { value: () => { fixtureDiagnostics = true } })
  return run
}
const canonicalState = value => JSON.stringify(value, (_, entry) => entry && typeof entry === 'object' && !Array.isArray(entry) ? Object.fromEntries(Object.keys(entry).sort().map(key => [key, entry[key]])) : entry)
const containerSummary = c => ({ id: c.Id, name: c.Name, image: c.Image, network_mode: c.HostConfig.NetworkMode, running: c.State.Running, started_at: c.State.StartedAt, ports: c.HostConfig.PortBindings, mounts: c.Mounts.map(m => ({ type: m.Type, name: m.Name, source: m.Source, destination: m.Destination, rw: m.RW })) })
const envOf = c => Object.fromEntries(c.Config.Env.map(value => { const i = value.indexOf('='); return [value.slice(0, i), value.slice(i + 1)] }))
const label = (c, key) => c.Config.Labels?.['com.docker.compose.' + key]

export async function inspectPreflight({ configuration: env, bundle, operation, run, currentContainers }) {
  exactKeys(operation, ['format', 'target_config', 'project', 'network_id', 'containers', 'backup', 'edge', 'recovery'], 'INVALID_OPERATION_FIELDS')
  if (bundle.manifest.kind === 'didar-nginx-wrapper-protocol-fixture' && operation.target_config !== 'DISPOSABLE_QA') fail('FIXTURE_BUNDLE_NOT_TARGET_AUTHORIZATION')
  if (operation.format !== 1 || !['BLOCKED', 'VERIFIED', 'DISPOSABLE_QA'].includes(operation.target_config) || operation.project !== env.DIDAR_COMPOSE_PROJECT || !idPattern.test(operation.network_id)) fail('EXPLICIT_DISCOVERY_REQUIRED')
  exactKeys(operation.containers, ['api', 'storefront', 'postgres', 'redis'], 'EXPLICIT_EXISTING_CONTAINERS_REQUIRED')
  if (Object.values(operation.containers).some(id => !idPattern.test(id)) || new Set(Object.values(operation.containers)).size !== 4) fail('EXACT_EXISTING_CONTAINER_IDS_REQUIRED')
  const context = await run('docker-context', ['context', 'show'])
  if (context !== 'default') fail('LOCAL_DOCKER_CONTEXT_ONLY')
  const version = JSON.parse(await run('docker-version', ['version', '--format', '{{json .Server}}']))
  if (!versionAtLeast(version.Version, '26.1.5', 26) && !versionAtLeast(version.Version, '27.0.0', 27) && !versionAtLeast(version.Version, '28.0.0', 28)) fail('UNSUPPORTED_DOCKER_VERSION')
  const compose = (await run('compose-version', ['compose', 'version', '--short'])).trim()
  if (!versionAtLeast(compose, '2.26.1', 2)) fail('UNSUPPORTED_COMPOSE_VERSION')
  const info = JSON.parse(await run('docker-resources', ['info', '--format', '{{json .}}']))
  if (info.OSType !== 'linux' || info.Architecture !== 'x86_64' && info.Architecture !== 'amd64' || info.MemTotal < 4 * 1024 ** 3 || info.NCPU < 2) fail('INSUFFICIENT_OR_UNSUPPORTED_DOCKER_RESOURCES')
  const storage = await statfs(info.DockerRootDir)
  if (Number(storage.bavail) * Number(storage.bsize) < 2 * 1024 ** 3) fail('INSUFFICIENT_DOCKER_FREE_SPACE')
  const network = JSON.parse(await run('existing-network', ['network', 'inspect', env.DIDAR_COMPOSE_NETWORK]))[0]
  if (network.Id !== operation.network_id || network.Driver !== 'bridge' || network.Internal) fail('EXISTING_BRIDGE_NETWORK_MISMATCH')
  const volumes = ['DIDAR_POSTGRES_VOLUME', 'DIDAR_REDIS_VOLUME', 'DIDAR_UPLOADS_VOLUME'].map(key => env[key])
  const existingVolumes = JSON.parse(await run('existing-volumes', ['volume', 'inspect', ...volumes]))
  if (existingVolumes.length !== 3 || existingVolumes.some(v => !volumes.includes(v.Name))) fail('EXTERNAL_VOLUME_MISMATCH')
  for (const [role, image] of Object.entries(bundle.manifest.images)) {
    if (env['DIDAR_' + role.toUpperCase() + '_IMAGE'] !== image.reference) fail('IMAGE_CONFIGURATION_MISMATCH:' + role)
    const actual = JSON.parse(await run('image-' + role, ['image', 'inspect', image.reference]))[0]
    if (actual.Id !== image.image_id || actual.Os !== 'linux' || actual.Architecture !== 'amd64') fail('IMAGE_ID_PLATFORM_MISMATCH:' + role)
    if (['api', 'storefront'].includes(role) && actual.Config.Labels?.['org.opencontainers.image.revision'] !== bundle.manifest.source_sha) fail('APPLICATION_SOURCE_LABEL_MISMATCH:' + role)
  }
  const containers = {}
  for (const [role, id] of Object.entries({ ...operation.containers, ...currentContainers })) {
    const actual = JSON.parse(await run('existing-' + role, ['inspect', id]))[0]
    if (actual.Id !== id || label(actual, 'project') !== operation.project || label(actual, 'service') !== role) fail('EXISTING_CONTAINER_OWNERSHIP_MISMATCH:' + role)
    containers[role] = actual
  }
  if (operation.target_config === 'DISPOSABLE_QA') {
    if (network.Labels?.['didar.disposable-qa'] !== 'true' || existingVolumes.some(v => v.Labels?.['didar.disposable-qa'] !== 'true') || Object.values(containers).some(c => c.Config.Labels?.['didar.disposable-qa'] !== 'true')) fail('DISPOSABLE_OWNERSHIP_REQUIRED')
  }
  for (const [role, volume, destination] of [['postgres', env.DIDAR_POSTGRES_VOLUME, '/var/lib/postgresql/data'], ['redis', env.DIDAR_REDIS_VOLUME, '/data'], ['api', env.DIDAR_UPLOADS_VOLUME, '/app/packages/api/.medusa/server/static']]) {
    if (!containers[role].Mounts.some(m => m.Type === 'volume' && m.Name === volume && m.Destination === destination)) fail('AUTHORITATIVE_MOUNT_MISMATCH:' + role)
  }
  for (const key of stableKeys) if (envOf(containers.api)[key] !== env[key]) fail('EXISTING_SECRET_OR_CONNECTION_CHANGED:' + key)
  if (envOf(containers.storefront).DIDAR_AUTH_NETWORK_KEY !== env.DIDAR_AUTH_NETWORK_KEY) fail('EXISTING_STOREFRONT_KEY_CHANGED')
  for (const role of ['postgres', 'redis']) if (containers[role].Image !== bundle.manifest.images[role].image_id || !containers[role].State.Running) fail('PRESERVED_DEPENDENCY_MISMATCH:' + role)
  const allIds = (await run('all-existing-containers', ['ps', '-aq', '--no-trunc'])).split('\n').filter(Boolean)
  const unrelated = []
  for (const id of allIds) if (![containers.api.Id, containers.storefront.Id].includes(id)) unrelated.push(containerSummary(JSON.parse(await run('preserve-' + id.slice(0, 12), ['inspect', id]))[0]))
  const tlsDir = await lstat(env.DIDAR_AUTH_TLS_DIR)
  if (!tlsDir.isDirectory() || tlsDir.isSymbolicLink() || (tlsDir.mode & 0o077)) fail('PRIVATE_TLS_DIRECTORY_REQUIRED')
  const certificate = new X509Certificate(await readFile(join(env.DIDAR_AUTH_TLS_DIR, 'cert.pem')))
  const ca = new X509Certificate(await readFile(join(env.DIDAR_AUTH_TLS_DIR, 'ca.pem')))
  const key = createPrivateKey(await privateFile(join(env.DIDAR_AUTH_TLS_DIR, 'key.pem')))
  if (!certificate.checkHost(env.DIDAR_AUTH_TLS_SERVER_NAME) || +new Date(certificate.validTo) <= Date.now() || +new Date(certificate.validFrom) > Date.now() || !certificate.verify(ca.publicKey) || !ca.ca || !certificate.checkPrivateKey(key) || !createPublicKey(key)) fail('RELAY_TLS_PROVENANCE_FAILED')
  return { docker_version: version.Version, compose_version: compose, target_config: operation.target_config, containers, unrelated }
}

function assertPrerequisites(operation, configuration, bundle) {
  if (!['VERIFIED', 'DISPOSABLE_QA'].includes(operation.target_config)) fail('TARGET_CONFIG_BLOCKED')
  const { backup, edge } = operation
  exactKeys(backup, ['status', 'isolated_restore_status', 'evidence_file', 'evidence_sha256', 'source_container_ids'], 'BACKUP_AND_ISOLATED_RESTORE_REQUIRED')
  if (backup.status !== 'VERIFIED' || backup.isolated_restore_status !== 'PASS' || !literalPath(backup.evidence_file) || !hashPattern.test(backup.evidence_sha256) || canonicalState(backup.source_container_ids) !== canonicalState(operation.containers)) fail('BACKUP_AND_ISOLATED_RESTORE_REQUIRED')
  exactKeys(edge, ['maintenance', 'observed_peers', 'tls_name', 'secret_version', 'discovery_file', 'discovery_sha256', 'matched_files'], 'EXPLICIT_EDGE_DISCOVERY_REQUIRED')
  if (edge.maintenance !== true || edge.observed_peers !== configuration.DIDAR_AUTH_INGRESS_PEERS || edge.tls_name !== configuration.DIDAR_AUTH_TLS_SERVER_NAME || !ownedName(edge.secret_version) || !literalPath(edge.discovery_file) || !hashPattern.test(edge.discovery_sha256)) fail('VERIFIED_EDGE_MAINTENANCE_REQUIRED')
  const roles = Object.keys(edge.matched_files || {}).sort().join(',')
  if (roles !== 'module,nginx_config,signer_auth,signer_sign') fail('MATCHED_NGINX_SIGNER_MODULE_REQUIRED')
  for (const [role, value] of Object.entries(edge.matched_files)) {
    exactKeys(value, ['path', 'sha256'], 'MATCHED_EDGE_FILE_INVALID')
    if (!literalPath(value.path) || !hashPattern.test(value.sha256)) fail('MATCHED_EDGE_FILE_INVALID')
    if (role === 'signer_auth' && value.sha256 !== bundle.manifest.files['auth.mjs'] || role === 'signer_sign' && value.sha256 !== bundle.manifest.files['sign.mjs']) fail('SIGNER_BUNDLE_MISMATCH')
  }
}
export async function verifyPrerequisiteFiles(operation, configuration) {
  for (const item of [
    { path: operation.backup.evidence_file, sha256: operation.backup.evidence_sha256 },
    { path: operation.edge.discovery_file, sha256: operation.edge.discovery_sha256 },
    ...Object.values(operation.edge.matched_files),
  ]) if (sha256(await readFile(item.path)) !== item.sha256) fail('OPERATION_EVIDENCE_OR_EDGE_HASH_CHANGED')
  const backup = JSON.parse(await readFile(operation.backup.evidence_file, 'utf8'))
  if (backup.status !== 'PASS' || canonicalState(backup.source_container_ids) !== canonicalState(operation.containers)) fail('BACKUP_EVIDENCE_SUBJECT_MISMATCH')
  if (operation.target_config === 'DISPOSABLE_QA') {
    if (backup.scope !== 'WRAPPER_PROTOCOL_FIXTURE' || backup.database_restoration !== 'PASS') fail('DISPOSABLE_BACKUP_RECEIPT_REQUIRED')
  }
  {
    exactKeys(backup.restoration, ['postgres', 'redis', 'uploads', 'configuration'], 'COMPLETE_ISOLATED_RESTORATION_REQUIRED')
    exactKeys(backup.isolated_volumes, ['postgres', 'redis', 'uploads'], 'ISOLATED_RESTORATION_VOLUMES_REQUIRED')
    const destinations = Object.values(backup.isolated_volumes), authoritative = [configuration.DIDAR_POSTGRES_VOLUME, configuration.DIDAR_REDIS_VOLUME, configuration.DIDAR_UPLOADS_VOLUME]
    if (Object.values(backup.restoration).some(status => status !== 'PASS') || destinations.some(name => !ownedName(name) || authoritative.includes(name)) || new Set(destinations).size !== 3) fail('COMPLETE_ISOLATED_RESTORATION_REQUIRED')
  }
}
export async function verifyRecoveryEvidence(operation, bundle) {
  const bytes = await readFile(operation.recovery.evidence_file)
  if (sha256(bytes) !== operation.recovery.evidence_sha256) fail('RECOVERY_EVIDENCE_HASH_MISMATCH')
  const recovery = JSON.parse(bytes)
  if (recovery.status !== 'PASS' || recovery.from_bundle_sha256 !== operation.recovery.from_bundle_sha256 || recovery.to_bundle_sha256 !== bundle.hash || recovery.source_sha !== bundle.manifest.source_sha || recovery.database_compatible !== true || recovery.secret_version !== operation.edge.secret_version) fail('RECOVERY_EVIDENCE_SUBJECT_MISMATCH')
  for (const role of ['api', 'storefront']) if (recovery.images?.[role] !== bundle.manifest.images[role].image_id) fail('RECOVERY_EVIDENCE_IMAGE_MISMATCH')
  for (const [role, item] of Object.entries(operation.edge.matched_files)) if (recovery.edge_hashes?.[role] !== item.sha256) fail('RECOVERY_EVIDENCE_EDGE_MISMATCH')
}
async function preserveUnrelated(run, expected) {
  for (const entry of expected) {
    const actual = containerSummary(JSON.parse(await run('preserved-' + entry.id.slice(0, 12), ['inspect', entry.id]))[0])
    if (canonicalState(actual) !== canonicalState(entry)) fail('UNRELATED_OR_DEPENDENCY_CHANGED')
  }
}
async function atomicPrivate(path, value) {
  const temporary = path + '.' + randomBytes(8).toString('hex')
  await (await open(temporary, 'wx', 0o600)).close()
  await writeFile(temporary, JSON.stringify(value, null, 2) + '\n')
  await rename(temporary, path)
}

export async function operate({ action, configuration, bundle, operation, run, statePath }) {
  if (!actions.includes(action)) fail('UNSUPPORTED_OPERATION')
  let previousState
  if (action === 'health') {
    if (!literalPath(statePath)) fail('PRIVATE_STATE_PATH_REQUIRED')
    previousState = JSON.parse(await privateFile(statePath))
    if (previousState.phase !== 'HEALTHY' || previousState.bundle_sha256 !== bundle.hash || previousState.configuration_sha256 !== sha256(canonicalState(configuration)) || previousState.operation_sha256 !== sha256(canonicalState(operation))) fail('HEALTHY_MATCHED_STATE_REQUIRED')
    if (!idPattern.test(previousState.containers?.api) || !idPattern.test(previousState.containers?.storefront)) fail('HEALTHY_CURRENT_CONTAINER_IDS_REQUIRED')
  }
  const before = await inspectPreflight({ configuration, bundle, operation, run, currentContainers: previousState?.containers })
  // Full preflight has verified every QA resource ownership label before diagnostics.
  if (operation.target_config === 'DISPOSABLE_QA' && bundle.manifest.kind === 'didar-nginx-wrapper-protocol-fixture') run.enableFixtureDiagnostics?.()
  const base = { format: 1, bundle_sha256: bundle.hash, source_sha: bundle.manifest.source_sha, configuration_sha256: sha256(canonicalState(configuration)), operation_sha256: sha256(canonicalState(operation)), preserved: before.unrelated }
  const compose = async (stage, args) => run(stage, ['compose', '--project-name', configuration.DIDAR_COMPOSE_PROJECT, '--project-directory', bundle.root, '--env-file', '/dev/null', '-f', '-', ...args], renderComposition(bundle.composition, configuration))
  await compose('compose-config-validation', ['config', '--quiet'])
  if (['preflight', 'status'].includes(action)) return { status: operation.target_config === 'BLOCKED' ? 'TARGET_CONFIG_BLOCKED' : 'PREFLIGHT_ONLY', source_sha: base.source_sha, docker_version: before.docker_version, compose_version: before.compose_version, target_config: operation.target_config, legacy_bundle: 'UNIDENTIFIED_UNLESS_SEPARATELY_VERIFIED', existing_namespace_shared: before.containers.storefront.HostConfig.NetworkMode === 'container:' + before.containers.api.Id }
  assertPrerequisites(operation, configuration, bundle); await verifyPrerequisiteFiles(operation, configuration)
  if (!literalPath(statePath)) fail('PRIVATE_STATE_PATH_REQUIRED')
  if (action === 'quiesce') {
    // Exact IDs rather than a project-wide stop: PG, Redis and unrelated services never stop.
    await run('stop-storefront', ['stop', '--time', '25', before.containers.storefront.Id])
    await run('stop-api', ['stop', '--time', '25', before.containers.api.Id])
    await preserveUnrelated(run, before.unrelated)
    await atomicPrivate(statePath, { ...base, phase: 'QUIESCED' })
    return { status: 'QUIESCED', target_config: operation.target_config }
  }
  const state = previousState || JSON.parse(await privateFile(statePath))
  for (const key of ['bundle_sha256', 'configuration_sha256', 'operation_sha256']) if (state[key] !== base[key] && action !== 'recover') fail('QUIESCED_STATE_BUNDLE_CHANGED')
  if (!['QUIESCED', 'MIGRATED', 'HEALTHY'].includes(state.phase)) fail('QUIESCED_STATE_REQUIRED')
  if (action === 'migrate') {
    if (state.phase !== 'QUIESCED' || before.containers.api.State.Running || before.containers.storefront.State.Running) fail('STOPPED_APPLICATIONS_REQUIRED')
    await compose('data-preserving-migration', ['run', '--rm', '--no-deps', 'migrate'])
    await preserveUnrelated(run, state.preserved)
    await atomicPrivate(statePath, { ...base, phase: 'MIGRATED' })
    return { status: 'MIGRATED', target_config: operation.target_config }
  }
  if (action === 'recover') {
    exactKeys(operation.recovery, ['status', 'from_bundle_sha256', 'to_bundle_sha256', 'evidence_file', 'evidence_sha256'], 'MATCHED_BUNDLE_RECOVERY_REQUIRED')
    if (operation.recovery.status !== 'VERIFIED' || operation.recovery.from_bundle_sha256 !== state.bundle_sha256 || operation.recovery.to_bundle_sha256 !== bundle.hash || !literalPath(operation.recovery.evidence_file) || !hashPattern.test(operation.recovery.evidence_sha256) || sha256(await readFile(operation.recovery.evidence_file)) !== operation.recovery.evidence_sha256) fail('UNVERIFIED_RECOVERY_BUNDLE')
    await verifyRecoveryEvidence(operation, bundle)
    if (state.configuration_sha256 !== base.configuration_sha256 && stableKeys.some(key => envOf(before.containers.api)[key] !== configuration[key])) fail('RECOVERY_SECRETS_CHANGED')
  }
  if (action === 'recreate' || action === 'recover') {
    if (action === 'recreate' && state.phase !== 'MIGRATED' || before.containers.api.State.Running || before.containers.storefront.State.Running) fail('MIGRATION_AND_STOPPED_APPLICATIONS_REQUIRED')
    await compose('recreate-api', ['up', '--no-deps', '--force-recreate', '--wait', '--wait-timeout', '240', 'api'])
    await compose('recreate-storefront', ['up', '--no-deps', '--force-recreate', '--wait', '--wait-timeout', '240', 'storefront'])
  }
  const apiIds = (await compose('current-api-id', ['ps', '-q', 'api'])).split('\n').filter(Boolean)
  const frontendIds = (await compose('current-storefront-id', ['ps', '-q', 'storefront'])).split('\n').filter(Boolean)
  if (apiIds.length !== 1 || frontendIds.length !== 1) fail('SINGLE_APPLICATION_PAIR_REQUIRED')
  const api = JSON.parse(await run('running-api', ['inspect', apiIds[0]]))[0], frontend = JSON.parse(await run('running-storefront', ['inspect', frontendIds[0]]))[0]
  if (api.Image !== bundle.manifest.images.api.image_id || frontend.Image !== bundle.manifest.images.storefront.image_id || frontend.HostConfig.NetworkMode !== 'container:' + api.Id || !api.State.Running || !frontend.State.Running) fail('MATCHED_SHARED_NAMESPACE_BUNDLE_REQUIRED')
  const published = Object.entries(api.HostConfig.PortBindings || {})
  if (published.length !== 1 || published[0][0] !== '3000/tcp' || published[0][1].length !== 1 || published[0][1][0].HostIp !== '127.0.0.1' || published[0][1][0].HostPort !== configuration.DIDAR_AUTH_HOST_PORT || Object.keys(frontend.HostConfig.PortBindings || {}).length) fail('PRIVATE_LISTENER_ISOLATION_REQUIRED')
  for (const key of stableKeys) if (envOf(api)[key] !== configuration[key]) fail('RUNNING_SECRETS_CHANGED')
  if (envOf(api).DIDAR_AUTH_PROXY_POLICY !== 'require-proof' || envOf(frontend).DIDAR_AUTH_INGRESS_MODE !== 'verified-relay' || envOf(frontend).DIDAR_AUTH_INGRESS_PEERS !== configuration.DIDAR_AUTH_INGRESS_PEERS || envOf(frontend).DIDAR_AUTH_NETWORK_KEY !== configuration.DIDAR_AUTH_NETWORK_KEY) fail('RUNNING_TRUST_POLICY_CHANGED')
  await run('api-loopback-health', ['exec', api.Id, 'node', '-e', "fetch('http://127.0.0.1:9000/health').then(r=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1))"])
  await run('relay-tls-health', ['exec', frontend.Id, 'node', 'runtime/health.mjs'])
  await run('private-next-unsigned-denied', ['exec', frontend.Id, 'node', '-e', "fetch('http://127.0.0.1:3001/api/didar/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'private-denial@invalid.test',password:'invalid'})}).then(r=>process.exit(r.status===403?0:1)).catch(()=>process.exit(1))"])
  await preserveUnrelated(run, state.preserved)
  await atomicPrivate(statePath, { ...base, phase: 'HEALTHY', containers: { api: api.Id, storefront: frontend.Id } })
  return { status: 'HEALTHY_INTERNAL_ONLY', source_sha: base.source_sha, target_config: operation.target_config, public_https: 'NOT_VERIFIED' }
}

export async function main(argv = process.argv.slice(2), inherited = process.env) {
  if (argv.length !== 5 || !actions.includes(argv[4])) fail('Usage: node stack.mjs /absolute/private/topology.env /absolute/kit/manifest.json MANIFEST_SHA256 /absolute/private/operation.json ACTION')
  const [environmentFile, manifestFile, manifestHash, operationFile, action] = argv
  const childEnvironment = localEnvironment(inherited)
  const configuration = parseConfiguration((await privateFile(environmentFile)).toString('utf8'), inherited)
  const operation = JSON.parse(await privateFile(operationFile)), bundle = await readBundle(manifestFile, manifestHash, { allowFixture: operation.target_config === 'DISPOSABLE_QA' })
  const receipts = [], run = runner(childEnvironment, receipts, configuration), lock = environmentFile + '.didar-nginx.lock', statePath = environmentFile + '.didar-nginx-state.json'
  const lockHandle = await open(lock, 'wx', 0o600).catch(() => fail('OPERATION_LOCK_EXISTS_STOP_FOR_REVIEW'))
  try {
    const result = await operate({ action, configuration, bundle, operation, run, statePath })
    process.stdout.write(JSON.stringify({ ...result, process_exits: receipts }) + '\n')
  } finally {
    try {
      const journal = environmentFile + '.didar-nginx-journal'
      await mkdir(journal, { mode: 0o700 }).catch(error => { if (error.code !== 'EEXIST') throw error })
      const directory = await lstat(journal)
      if (!directory.isDirectory() || directory.isSymbolicLink() || directory.mode & 0o077) fail('PRIVATE_JOURNAL_DIRECTORY_REQUIRED')
      const record = { action, source_sha: bundle.manifest.source_sha, bundle_sha256: manifestHash, configuration_sha256: sha256(canonicalState(configuration)), operation_sha256: sha256(canonicalState(operation)), completed_at: new Date().toISOString(), process_exits: receipts }
      await writeFile(join(journal, Date.now() + '-' + randomBytes(8).toString('hex') + '.json'), JSON.stringify(record, null, 2) + '\n', { mode: 0o600, flag: 'wx' })
    } finally { await lockHandle.close(); await unlink(lock) }
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => {
  // Foreign parser/runtime errors may contain snippets of private input.
  const message = /^[A-Z][A-Z0-9_]*(?::[A-Za-z0-9_.=-]+)*$/.test(error.message || '') ? error.message : 'WRAPPER_FAILED'
  process.stderr.write(message + '\n'); process.exitCode = 2
})
