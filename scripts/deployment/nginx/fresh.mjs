// Candidate operator-kit extension. Does not alter accepted application images.
// Never adopts, removes, stops or reuses secrets from legacy containers.
import { randomBytes } from 'node:crypto'
import { readFile, writeFile, lstat, realpath, open, statfs } from 'node:fs/promises'
import { dirname, resolve, join } from 'node:path'
import { canonicalState, sha256, privateFile, containerSummary, resolveComposition, renderComposition, verifyRelayTLS, versionAtLeast } from './stack.mjs'

const fail = code => { throw Error(code) }
const equal = (a, b) => canonicalState(a) === canonicalState(b)
const exact = (value, keys, error) => { if (!value || !equal(Object.keys(value).sort(), [...keys].sort())) fail(error) }
const labels = (token, qa = false) => ({ 'didar.fresh-owner': token, ...(qa ? { 'didar.disposable-qa': 'true' } : {}) })
const idPattern = /^[a-f0-9]{64}$/
const roles = ['api', 'storefront', 'postgres', 'redis']
const stableConfiguration = env => { const value = { ...env }; delete value.DIDAR_AUTH_INGRESS_PEERS; return value }

export function socketObserverSource({ modulePath = '/app/packages/auth-network/index.cjs', tlsDir = '/run/didar-tls', port = 3000 } = {}) {
  return "const fs=require('node:fs'),https=require('node:https'),{verifyNetwork,HEADER}=require(" + JSON.stringify(modulePath) + ");const s=https.createServer({cert:fs.readFileSync(" + JSON.stringify(tlsDir + '/cert.pem') + "),key:fs.readFileSync(" + JSON.stringify(tlsDir + '/key.pem') + ")},(q,r)=>{const parts=[];let n=0;q.on('data',p=>{n+=p.length;if(n>4096){q.destroy();return}parts.push(p)});q.on('end',()=>{try{const body=Buffer.concat(parts);if(q.method!=='POST'||q.url!=='/api/didar/login'||body.toString()!==JSON.stringify({didar_peer_probe:process.env.PROBE_CHALLENGE}))throw Error();verifyNetwork({key:process.env.DIDAR_AUTH_NETWORK_KEY,assertion:q.headers[HEADER],method:q.method,path:q.url,body});console.log(JSON.stringify({socket_peer:q.socket.remoteAddress,api_namespace:process.env.OBSERVED_API_ID,signed_probe:'PASS'}));r.writeHead(204).end();s.close(()=>process.exit(0))}catch{r.writeHead(403).end()}})});s.listen(" + JSON.stringify(port) + ",'0.0.0.0');setTimeout(()=>{s.close();process.exit(2)},60000).unref()"
}

export async function startOwnedHealthy({ stage, selected, state, bundle, configuration, qa, run, timeout, preserve }) {
  if (!selected.length || selected.some(role => !roles.includes(role) || !idPattern.test(state.ids[role] || ''))) fail('EXACT_JOURNALED_START_IDS_REQUIRED')
  const verify = (c, expectedRole) => {
    const role = c.Config.Labels?.['com.docker.compose.service']
    if (role !== expectedRole || !selected.includes(role) || c.Id !== state.ids[role] || c.Image !== bundle.manifest.images[role].image_id || c.Config.Labels?.['didar.fresh-owner'] !== state.token || c.Config.Labels?.['com.docker.compose.project'] !== configuration.DIDAR_COMPOSE_PROJECT || qa && c.Config.Labels?.['didar.disposable-qa'] !== 'true') fail('FRESH_START_OWNERSHIP_CHANGED')
    return role
  }
  for (const role of selected) {
    const c = JSON.parse(await run(stage + '-before-start-' + role, ['inspect', state.ids[role]]))[0]
    verify(c, role); if (c.State.Running) fail('FRESH_STOPPED_OWNED_START_REQUIRED')
  }
  await run(stage + '-start-exact-ids', ['start', ...selected.map(role => state.ids[role])])
  for (const role of selected) {
    const deadline = Date.now() + timeout * 1000
    let healthy = false
    while (Date.now() < deadline) {
      const c = JSON.parse(await run(stage + '-health-' + role, ['inspect', state.ids[role]]))[0]; verify(c, role)
      if (!c.State.Running || c.State.Health?.Status === 'unhealthy') {
        run.recordFixtureObservation?.('fresh-owned-start-state', { role, container_id: c.Id, container_exit_code: c.State.ExitCode, running: c.State.Running, health: c.State.Health?.Status || null, oom_killed: c.State.OOMKilled })
        fail('FRESH_APPLICATION_OR_DEPENDENCY_UNHEALTHY:' + role)
      }
      if (c.State.Health?.Status === 'healthy') { healthy = true; break }
      if (!c.State.Health) fail('FRESH_HEALTHCHECK_REQUIRED:' + role)
      await new Promise(done => setTimeout(done, 1000))
    }
    if (!healthy) fail('FRESH_HEALTH_TIMEOUT:' + role)
  }
  await preserve()
}

export async function provisionNetworkKey(path) {
  if (typeof path !== 'string' || !path.startsWith('/') || resolve(path) !== path) fail('ABSOLUTE_NEW_KEY_PATH_REQUIRED')
  const parent = dirname(path), info = await lstat(parent)
  if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o777) !== 0o700 || info.uid !== process.getuid() || await realpath(parent) !== parent) fail('NEW_PRIVATE_DIRECTORY_0700_REQUIRED')
  // wx refuses an existing file or symlink. No key bytes or hash are printed.
  const file = await open(path, 'wx', 0o600)
  try { await file.writeFile(randomBytes(32).toString('hex') + '\n'); await file.sync() } finally { await file.close() }
  return { status: 'NEW_NETWORK_KEY_PROVISIONED_PRIVATE_ONLY' }
}

export function validateFreshConfiguration(env) {
  const db = new URL(env.DATABASE_URL), redis = new URL(env.REDIS_URL)
  // Match the accepted private-bridge PostgreSQL transport explicitly. Medusa's
  // derived module connections otherwise infer TLS for a non-localhost host.
  // This does not alter relay/public TLS or existing-server URL preservation.
  if (!['postgres:', 'postgresql:'].includes(db.protocol) || db.hostname !== 'postgres' || db.port !== '5432' || db.pathname !== '/' + env.DIDAR_DB_NAME || decodeURIComponent(db.username) !== env.DIDAR_DB_USER || decodeURIComponent(db.password) !== env.DIDAR_DB_PASSWORD || db.search !== '?sslmode=disable' || db.hash || redis.href !== 'redis://redis:6379/0') fail('FRESH_LOCAL_DEPENDENCY_URLS_REQUIRED')
  if (env.DIDAR_PUBLIC_ORIGIN_VERIFIED !== 'false') fail('FRESH_PUBLIC_HTTPS_NOT_VERIFIED')
  if (env.DIDAR_AUTH_TLS_DIR.includes(',')) fail('FRESH_LITERAL_TLS_MOUNT_PATH_REQUIRED')
  if (new Set([env.JWT_SECRET, env.COOKIE_SECRET, env.DIDAR_AUTH_NETWORK_KEY, env.DIDAR_DB_PASSWORD]).size !== 4 || [env.JWT_SECRET, env.COOKIE_SECRET, env.DIDAR_AUTH_NETWORK_KEY, env.DIDAR_DB_PASSWORD].some(value => Buffer.byteLength(value) < 32)) fail('DISTINCT_STRONG_FRESH_SECRETS_REQUIRED')
}

// Full private Config/HostConfig are hashed rather than logged. Volatile health
// probe timing is excluded; identities, running state, mounts and peers remain.
export async function observeDaemon(run) {
  const result = { containers: {}, networks: {}, volumes: {} }
  for (const id of (await run('fresh-list-containers', ['ps', '-aq', '--no-trunc'])).split('\n').filter(Boolean).sort()) {
    const c = JSON.parse(await run('fresh-observe-container-' + id.slice(0, 12), ['inspect', id]))[0]
    result.containers[id] = { ...containerSummary(c), configuration_sha256: sha256(canonicalState({ Config: c.Config, HostConfig: c.HostConfig, Networks: c.NetworkSettings?.Networks })) }
  }
  for (const id of (await run('fresh-list-networks', ['network', 'ls', '-q', '--no-trunc'])).split('\n').filter(Boolean).sort()) {
    const n = JSON.parse(await run('fresh-observe-network-' + id.slice(0, 12), ['network', 'inspect', id]))[0]
    const { Containers: endpoints = {}, ...metadata } = n
    result.networks[id] = { name: n.Name, project: n.Labels?.['com.docker.compose.project'] || null, sha256: sha256(canonicalState(metadata)), endpoints }
  }
  for (const name of (await run('fresh-list-volumes', ['volume', 'ls', '-q'])).split('\n').filter(Boolean).sort()) {
    const v = JSON.parse(await run('fresh-observe-volume-' + name, ['volume', 'inspect', name]))[0]
    result.volumes[name] = { project: v.Labels?.['com.docker.compose.project'] || null, sha256: sha256(canonicalState(v)) }
  }
  return result
}

export function assertDaemonPreserved(baseline, actual, owned = { containers: [], networks: [], volumes: [] }) {
  for (const type of ['containers', 'networks', 'volumes']) {
    for (const [id, state] of Object.entries(baseline[type])) {
      const current = actual[type][id]
      if (type !== 'networks') { if (!equal(current, state)) fail('PREEXISTING_DAEMON_RESOURCE_CHANGED:' + type); continue }
      if (!current || current.name !== state.name || current.project !== state.project || current.sha256 !== state.sha256) fail('PREEXISTING_DAEMON_RESOURCE_CHANGED:networks')
      for (const [endpoint, value] of Object.entries(state.endpoints || {})) if (!equal(current.endpoints?.[endpoint], value)) fail('PREEXISTING_NETWORK_ENDPOINT_CHANGED')
      for (const endpoint of Object.keys(current.endpoints || {})) if (!Object.hasOwn(state.endpoints || {}, endpoint) && !owned.containers.includes(endpoint)) fail('UNJOURNALED_NETWORK_ENDPOINT')
    }
    for (const id of Object.keys(actual[type])) if (!Object.hasOwn(baseline[type], id) && !owned[type].includes(id)) fail('UNJOURNALED_DAEMON_RESOURCE:' + type)
  }
}

export function assertFreshNames(configuration, baseline, projectLabels) {
  if (projectLabels.includes(configuration.DIDAR_COMPOSE_PROJECT) || [...Object.values(baseline.networks), ...Object.values(baseline.volumes)].some(resource => resource.project === configuration.DIDAR_COMPOSE_PROJECT) || Object.values(baseline.networks).some(n => n.name === configuration.DIDAR_COMPOSE_NETWORK) || ['DIDAR_POSTGRES_VOLUME', 'DIDAR_REDIS_VOLUME', 'DIDAR_UPLOADS_VOLUME'].some(key => Object.hasOwn(baseline.volumes, configuration[key]))) fail('FRESH_RESOURCE_ALREADY_EXISTS_NO_ADOPTION')
}

export async function verifyCandidateApproval(operation, bundle) {
  exact(operation.approval, ['path', 'sha256'], 'FRESH_KIT_APPROVAL_REQUIRED')
  const bytes = await privateFile(operation.approval.path)
  if (sha256(bytes) !== operation.approval.sha256) fail('FRESH_KIT_APPROVAL_HASH_MISMATCH')
  const receipt = JSON.parse(bytes)
  const fixture = operation.kind === 'PARALLEL_FRESH_INSTALL_PROTOCOL_FIXTURE' && operation.target_config === 'DISPOSABLE_QA' && bundle.manifest.kind === 'didar-nginx-wrapper-protocol-fixture'
  if (fixture ? receipt.status !== 'FIXTURE_ONLY' || receipt.scope !== 'QA_ONLY' : receipt.status !== 'APPROVED' || receipt.authority !== 'Chief Architect' || receipt.scope !== 'PARALLEL_FRESH_INSTALL_KIT') fail('FRESH_KIT_CHIEF_ARCHITECT_APPROVAL_REQUIRED')
  if (receipt.preparation_only_mutations !== true || receipt.domain_cutover_authorized !== false || receipt.source_sha !== bundle.manifest.source_sha || !receipt.approval_url?.startsWith('https://') || !receipt.reviewer) fail('FRESH_KIT_CHIEF_ARCHITECT_APPROVAL_REQUIRED')
  const expected = Object.fromEntries(['stack.mjs', 'fresh.mjs', 'fresh-restore.mjs', 'compose.topology.json', 'provision-node.sh', 'fresh-operator-bundle.mjs'].map(name => [name, bundle.manifest.files[name]]))
  if (Object.values(expected).some(digest => !/^[a-f0-9]{64}$/.test(digest || '')) || !equal(receipt.files, expected) || !equal(receipt.images, Object.fromEntries(roles.map(role => [role, bundle.manifest.images[role].image_id])))) fail('FRESH_KIT_APPROVAL_SUBJECT_MISMATCH')
}

export function freshComposition(bundle, configuration, token, qa = false) {
  const template = structuredClone(bundle.composition)
  for (const service of Object.values(template.services)) service.labels = { ...(service.labels || {}), ...labels(token, qa) }
  const desired = resolveComposition(template, configuration)
  for (const role of ['api', 'migrate']) if (desired.services[role].environment.DIDAR_SEED_DEMO !== 'false' || desired.services[role].environment.DIDAR_ENVIRONMENT !== 'staging' || desired.services[role].environment.DIDAR_PAYMENT_MODE !== 'sandbox') fail('FRESH_NO_DEMO_SANDBOX_REQUIRED')
  // Only the reviewed additive migration/bootstrap command, never demo/admin seed.
  if (!equal(template.services.migrate.command, ['sh', '-c', 'cd packages/api && NODE_ENV=development bun x --no-install medusa db:migrate && NODE_ENV=development bun x --no-install medusa exec ./src/scripts/didar-seed.ts'])) fail('FRESH_REVIEWED_ADDITIVE_MIGRATION_REQUIRED')
  return renderComposition(template, configuration)
}

export async function verifyFreshRestore(operation, configuration, state) {
  exact(operation.restoration, ['path', 'sha256', 'publication'], 'FRESH_ISOLATED_RESTORE_REQUIRED')
  const bytes = await privateFile(operation.restoration.path)
  if (sha256(bytes) !== operation.restoration.sha256) fail('FRESH_RESTORE_HASH_MISMATCH')
  const evidence = JSON.parse(bytes)
  const expected = { postgres: state.ids.postgres, redis: state.ids.redis }
  if (evidence.status !== 'PASS' || evidence.scope !== 'PARALLEL_FRESH_INITIALIZED_STATE' || evidence.database_restoration !== 'PASS' || !equal(evidence.source_container_ids, expected) || evidence.initialization_state_sha256 !== state.initialization_state_sha256) fail('FRESH_RESTORE_SUBJECT_MISMATCH')
  exact(evidence.restoration, ['postgres', 'redis', 'uploads', 'configuration'], 'COMPLETE_FRESH_RESTORE_REQUIRED')
  exact(evidence.isolated_volumes, ['postgres', 'redis', 'uploads'], 'COMPLETE_FRESH_RESTORE_REQUIRED')
  const names = Object.values(evidence.isolated_volumes), authoritative = [configuration.DIDAR_POSTGRES_VOLUME, configuration.DIDAR_REDIS_VOLUME, configuration.DIDAR_UPLOADS_VOLUME]
  if (Object.values(evidence.restoration).some(value => value !== 'PASS') || names.some(name => !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(name) || authoritative.includes(name)) || new Set(names).size !== 3 || !evidence.evidence_url?.startsWith('https://')) fail('COMPLETE_FRESH_RESTORE_REQUIRED')
  exact(evidence.backup_sha256, ['postgres', 'redis', 'uploads', 'configuration'], 'FRESH_COMPLETE_BACKUP_HASHES_REQUIRED')
  if (Object.values(evidence.backup_sha256).some(value => !/^[a-f0-9]{64}$/.test(value))) fail('FRESH_COMPLETE_BACKUP_HASHES_REQUIRED')
  exact(operation.restoration.publication, ['path', 'sha256'], 'FRESH_BACKUP_DURABLE_READBACK_REQUIRED')
  const published = await privateFile(operation.restoration.publication.path)
  if (sha256(published) !== operation.restoration.publication.sha256) fail('FRESH_BACKUP_READBACK_HASH_MISMATCH')
  const proof = JSON.parse(published)
  if (proof.status !== 'PASS' || proof.scope !== 'FRESH_BACKUP_DURABLE_READBACK' || proof.exit_code !== 0 || proof.restore_receipt_sha256 !== operation.restoration.sha256 || proof.destination_url !== evidence.evidence_url || !equal(proof.backup_sha256, evidence.backup_sha256) || !equal(proof.source_container_ids, expected) || proof.initialization_state_sha256 !== state.initialization_state_sha256) fail('FRESH_BACKUP_DURABLE_READBACK_REQUIRED')
}

async function verifyEdge(operation, configuration, bundle) {
  const edge = operation.edge
  const fixture = operation.kind === 'PARALLEL_FRESH_INSTALL_PROTOCOL_FIXTURE' && operation.target_config === 'DISPOSABLE_QA' && bundle.manifest.kind === 'didar-nginx-wrapper-protocol-fixture'
  if ((!fixture && operation.target_config !== 'VERIFIED') || configuration.DIDAR_AUTH_INGRESS_PEERS === 'PENDING' || !edge || edge.maintenance !== true || edge.public_routes_enabled !== false || edge.observed_peers !== configuration.DIDAR_AUTH_INGRESS_PEERS || edge.tls_name !== configuration.DIDAR_AUTH_TLS_SERVER_NAME) fail('FRESH_TARGET_CONFIG_BLOCKED')
  exact(edge.matched_files, ['module', 'nginx_config', 'signer_auth', 'signer_sign'], 'FRESH_MATCHED_EDGE_FILES_REQUIRED')
  for (const item of [{ path: edge.discovery_file, sha256: edge.discovery_sha256 }, ...Object.values(edge.matched_files)]) if (sha256(await readFile(item.path)) !== item.sha256) fail('FRESH_EDGE_HASH_MISMATCH')
  if (edge.matched_files.signer_auth.sha256 !== bundle.manifest.files['auth.mjs'] || edge.matched_files.signer_sign.sha256 !== bundle.manifest.files['sign.mjs']) fail('FRESH_SIGNER_BUNDLE_MISMATCH')
  await verifyRelayTLS(configuration)
}

export async function operateFresh({ action, configuration, bundle, operation, run, statePath }) {
  exact(operation, ['format', 'kind', 'target_config', 'project', 'approval', 'edge', 'restoration', 'admin'], 'INVALID_FRESH_OPERATION')
  const qa = operation.kind === 'PARALLEL_FRESH_INSTALL_PROTOCOL_FIXTURE' && operation.target_config === 'DISPOSABLE_QA' && bundle.manifest.kind === 'didar-nginx-wrapper-protocol-fixture'
  const target = operation.kind === 'PARALLEL_FRESH_INSTALL' && ['BLOCKED', 'VERIFIED'].includes(operation.target_config) && bundle.manifest.kind === 'didar-nginx-verified-topology'
  if (operation.format !== 1 || (!qa && !target) || operation.project !== configuration.DIDAR_COMPOSE_PROJECT) fail('EXPLICIT_FRESH_OPERATION_REQUIRED')
  validateFreshConfiguration(configuration)
  if (process.versions.node !== '24.19.0') fail('FRESH_NODE_24_19_REQUIRED')
  if (!bundle.manifest.files['fresh.mjs'] || sha256(await readFile(new URL('./fresh.mjs', import.meta.url))) !== bundle.manifest.files['fresh.mjs'] || sha256(await readFile(new URL('./stack.mjs', import.meta.url))) !== bundle.manifest.files['stack.mjs']) fail('EXECUTING_FRESH_KIT_HASH_MISMATCH')
  if (await run('fresh-docker-context', ['context', 'show']) !== 'default') fail('LOCAL_DOCKER_CONTEXT_ONLY')
  const version = JSON.parse(await run('fresh-docker-version', ['version', '--format', '{{json .Server}}']))
  if (![26, 27, 28].some(major => versionAtLeast(version.Version, major === 26 ? '26.1.5' : major + '.0.0', major))) fail('UNSUPPORTED_DOCKER_VERSION')
  if (!versionAtLeast(await run('fresh-compose-version', ['compose', 'version', '--short']), '2.26.1', 2)) fail('UNSUPPORTED_COMPOSE_VERSION')
  const info = JSON.parse(await run('fresh-docker-resources', ['info', '--format', '{{json .}}']))
  if (info.OSType !== 'linux' || !['amd64', 'x86_64'].includes(info.Architecture)) fail('INSUFFICIENT_OR_UNSUPPORTED_DOCKER_RESOURCES')
  // Emergency quiesce can only stop journaled application IDs. Capacity failure
  // must not prevent that stop; all creation/start/migration paths retain guards.
  if (action !== 'fresh-quiesce') {
    if (info.MemTotal < 4 * 1024 ** 3 || info.NCPU < 2) fail('INSUFFICIENT_OR_UNSUPPORTED_DOCKER_RESOURCES')
    const storage = await statfs(info.DockerRootDir)
    if (Number(storage.bavail) * Number(storage.bsize) < 2 * 1024 ** 3) fail('INSUFFICIENT_DOCKER_FREE_SPACE')
  }
  for (const role of roles) {
    const image = bundle.manifest.images[role]
    if (configuration['DIDAR_' + role.toUpperCase() + '_IMAGE'] !== image.reference) fail('FRESH_IMAGE_CONFIGURATION_MISMATCH')
    const actual = JSON.parse(await run('fresh-image-' + role, ['image', 'inspect', image.reference]))[0]
    if (actual.Id !== image.image_id || actual.Os !== 'linux' || actual.Architecture !== 'amd64' || ['api', 'storefront'].includes(role) && actual.Config.Labels?.['org.opencontainers.image.revision'] !== bundle.manifest.source_sha) fail('FRESH_IMAGE_PROVENANCE_MISMATCH')
  }
  if (action === 'fresh-preflight') {
    // Exclusive state creation means rerunning cannot silently reset ownership.
    const baseline = await observeDaemon(run), projects = []
    for (const id of Object.keys(baseline.containers)) {
      const c = JSON.parse(await run('fresh-project-' + id.slice(0, 12), ['inspect', id]))[0]
      projects.push(c.Config.Labels?.['com.docker.compose.project'])
    }
    assertFreshNames(configuration, baseline, projects)
    const state = { format: 1, phase: 'PREFLIGHT', qa_fixture: qa, bundle_sha256: bundle.hash, configuration_sha256: sha256(canonicalState(stableConfiguration(configuration))), operation_sha256: sha256(canonicalState(operation)), token: randomBytes(24).toString('hex'), baseline, owned: { containers: [], networks: [], volumes: [] }, ids: {} }
    await writeFile(statePath, JSON.stringify(state) + '\n', { mode: 0o600, flag: 'wx' })
    return { status: 'FRESH_PREFLIGHT_ONLY', target_config: operation.target_config, candidate_approval: 'REQUIRED_BEFORE_MUTATION', public_https: 'NOT_VERIFIED' }
  }
  const state = JSON.parse(await privateFile(statePath))
  if (Boolean(state.qa_fixture) !== qa) fail('FRESH_QA_STATE_CANNOT_AUTHORIZE_TARGET')
  if (state.bundle_sha256 !== bundle.hash || state.configuration_sha256 !== sha256(canonicalState(stableConfiguration(configuration)))) fail('FRESH_STATE_SUBJECT_CHANGED')
  if (!/^[a-f0-9]{48}$/.test(state.token)) fail('FRESH_STATE_OWNERSHIP_REQUIRED')
  await verifyCandidateApproval(operation, bundle)
  const persist = async () => { await writeFile(statePath, JSON.stringify(state) + '\n', { mode: 0o600 }) }
  const preserve = async () => {
    assertDaemonPreserved(state.baseline, await observeDaemon(run), state.owned)
    for (const id of state.owned.containers) {
      const c = JSON.parse(await run('fresh-recheck-container-owner', ['inspect', id]))[0]
      if (c.Config.Labels?.['didar.fresh-owner'] !== state.token || c.Config.Labels?.['com.docker.compose.project'] !== configuration.DIDAR_COMPOSE_PROJECT || qa && c.Config.Labels?.['didar.disposable-qa'] !== 'true') fail('FRESH_CONTAINER_OWNERSHIP_CHANGED')
      const role = c.Config.Labels?.['com.docker.compose.service']
      const extra = state.restore_containers?.[id]
      if (extra ? extra.service !== role || extra.image_id !== c.Image : !roles.includes(role) || state.ids[role] !== id || c.Image !== bundle.manifest.images[role].image_id) fail('FRESH_CONTAINER_ID_IMAGE_CHANGED')
    }
    for (const id of state.owned.networks) {
      const n = JSON.parse(await run('fresh-recheck-network-owner', ['network', 'inspect', id]))[0]
      if (n.Labels?.['didar.fresh-owner'] !== state.token || n.Name !== configuration.DIDAR_COMPOSE_NETWORK || qa && n.Labels?.['didar.disposable-qa'] !== 'true') fail('FRESH_NETWORK_OWNERSHIP_CHANGED')
    }
    for (const name of state.owned.volumes) {
      const v = JSON.parse(await run('fresh-recheck-volume-owner', ['volume', 'inspect', name]))[0]
      if (v.Labels?.['didar.fresh-owner'] !== state.token || v.Name !== name || qa && v.Labels?.['didar.disposable-qa'] !== 'true') fail('FRESH_VOLUME_OWNERSHIP_CHANGED')
    }
  }
  await preserve()
  if (qa) run.enableFixtureDiagnostics?.(stage => !/^fresh-(?:observe-|list-|project-)/.test(stage))
  const compose = (stage, args) => run(stage, ['compose', '--project-name', configuration.DIDAR_COMPOSE_PROJECT, '--project-directory', bundle.root, '--env-file', '/dev/null', '-f', '-', ...args], freshComposition(bundle, configuration, state.token, qa))
  await compose('fresh-compose-config', ['config', '--quiet'])
  const capture = async role => {
    const id = await compose('fresh-id-' + role, ['ps', '--all', '-q', role])
    if (!idPattern.test(id)) fail('FRESH_SINGLE_CONTAINER_REQUIRED')
    if (state.ids[role] && state.ids[role] !== id) fail('FRESH_RECORDED_CONTAINER_ID_CHANGED')
    const c = JSON.parse(await run('fresh-owned-' + role, ['inspect', id]))[0]
    if (c.Config.Labels?.['didar.fresh-owner'] !== state.token || c.Config.Labels?.['com.docker.compose.project'] !== configuration.DIDAR_COMPOSE_PROJECT || c.Config.Labels?.['com.docker.compose.service'] !== role || c.Image !== bundle.manifest.images[role].image_id || qa && c.Config.Labels?.['didar.disposable-qa'] !== 'true') fail('FRESH_CONTAINER_OWNERSHIP_MISMATCH')
    state.ids[role] = id; if (!state.owned.containers.includes(id)) state.owned.containers.push(id)
    await persist(); return c
  }
  const createAndStart = async (stage, selected, timeout) => {
    try { await compose(stage + '-create', ['up', '--no-start', '--no-deps', ...selected]) }
    catch (error) {
      // Only exact random-token/project/service/image matches are journaled;
      // an unsuccessful observation never becomes permission to adopt anything.
      for (const role of selected) await capture(role).catch(() => {})
      throw error
    }
    for (const role of selected) await capture(role)
    await preserve()
    // Compose start has no portable --wait contract (including v2.40.3).
    // Start only the exact IDs already captured and ownership-verified above.
    await startOwnedHealthy({ stage, selected, state, bundle, configuration, qa, run, timeout, preserve })
  }
  if (action === 'fresh-dependencies') {
    if (state.phase !== 'PREFLIGHT') fail('FRESH_PREFLIGHT_PHASE_REQUIRED')
    // Recheck absence after approval and immediately before creating anything.
    assertFreshNames(configuration, await observeDaemon(run), [])
    const extraLabels = qa ? ['--label', 'didar.disposable-qa=true'] : []
    const network = await run('fresh-create-network', ['network', 'create', '--driver', 'bridge', '--label', 'didar.fresh-owner=' + state.token, ...extraLabels, configuration.DIDAR_COMPOSE_NETWORK])
    const actualNetwork = JSON.parse(await run('fresh-verify-created-network', ['network', 'inspect', network]))[0]
    if (actualNetwork.Id !== network || actualNetwork.Name !== configuration.DIDAR_COMPOSE_NETWORK || actualNetwork.Labels?.['didar.fresh-owner'] !== state.token) fail('FRESH_NETWORK_CREATION_OWNERSHIP_MISMATCH')
    state.owned.networks.push(network); await persist()
    for (const key of ['DIDAR_POSTGRES_VOLUME', 'DIDAR_REDIS_VOLUME', 'DIDAR_UPLOADS_VOLUME']) {
      const name = await run('fresh-create-volume', ['volume', 'create', '--label', 'didar.fresh-owner=' + state.token, ...extraLabels, configuration[key]])
      const actualVolume = JSON.parse(await run('fresh-verify-created-volume', ['volume', 'inspect', name]))[0]
      if (name !== configuration[key] || actualVolume.Name !== name || actualVolume.Labels?.['didar.fresh-owner'] !== state.token) fail('FRESH_VOLUME_CREATION_OWNERSHIP_MISMATCH')
      state.owned.volumes.push(name); await persist()
    }
    await preserve()
    await createAndStart('fresh-start-dependencies', ['postgres', 'redis'], 180)
    await capture('postgres'); await capture('redis'); state.phase = 'DEPENDENCIES'; await persist(); await preserve()
    return { status: 'FRESH_DEPENDENCIES_READY_NO_APPLICATIONS', target_config: operation.target_config }
  }
  if (action === 'fresh-migrate') {
    if (state.phase !== 'DEPENDENCIES') fail('FRESH_DEPENDENCIES_PHASE_REQUIRED')
    await compose('fresh-additive-migration-no-demo', ['run', '--rm', '--no-deps', 'migrate'])
    state.phase = 'MIGRATED'; state.initialization_state_sha256 = sha256(canonicalState({ bundle: bundle.hash, configuration: state.configuration_sha256, ids: state.ids, volumes: state.owned.volumes })); await persist(); await preserve()
    return { status: 'FRESH_MIGRATED_FIRST_ADMIN_REQUIRED', dependency_container_ids: state.ids, target_config: operation.target_config }
  }
  if (action === 'fresh-admin') {
    if (state.phase !== 'MIGRATED') fail('FRESH_MIGRATED_PHASE_REQUIRED')
    exact(operation.admin, ['path', 'sha256'], 'EXPLICIT_PRIVATE_FIRST_ADMIN_REQUIRED')
    const bytes = await privateFile(operation.admin.path)
    if (sha256(bytes) !== operation.admin.sha256) fail('FIRST_ADMIN_INPUT_HASH_MISMATCH')
    const credentials = JSON.parse(bytes)
    exact(credentials, ['DIDAR_BOOTSTRAP_EMAIL', 'DIDAR_BOOTSTRAP_PASSWORD', 'NATIVE_BOOTSTRAP_PASSWORD'], 'EXPLICIT_PRIVATE_FIRST_ADMIN_REQUIRED')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(credentials.DIDAR_BOOTSTRAP_EMAIL) || [credentials.DIDAR_BOOTSTRAP_PASSWORD, credentials.NATIVE_BOOTSTRAP_PASSWORD].some(value => typeof value !== 'string' || value.length < 16) || credentials.DIDAR_BOOTSTRAP_PASSWORD === credentials.NATIVE_BOOTSTRAP_PASSWORD) fail('DISTINCT_EXPLICIT_FIRST_ADMIN_PASSWORDS_REQUIRED')
    run.addPrivateDiagnosticSource?.(credentials)
    const template = structuredClone(bundle.composition)
    template.services.migrate.labels = labels(state.token, qa)
    template.services.migrate.command = ['sh', '-c', 'cd packages/api && NODE_ENV=development bun x --no-install medusa exec ./src/scripts/provision-first-admin.ts']
    for (const key of Object.keys(credentials)) template.services.migrate.environment[key] = '${' + key + '}'
    await run('fresh-explicit-first-admin-no-bridge', ['compose', '--project-name', configuration.DIDAR_COMPOSE_PROJECT, '--project-directory', bundle.root, '--env-file', '/dev/null', '-f', '-', 'run', '--rm', '--no-deps', 'migrate'], renderComposition(template, { ...configuration, ...credentials }))
    state.phase = 'INITIALIZED'; state.initialization_state_sha256 = sha256(canonicalState({ bundle: bundle.hash, configuration: state.configuration_sha256, ids: state.ids, volumes: state.owned.volumes, admin_input_sha256: operation.admin.sha256 })); await persist(); await preserve()
    return { status: 'FRESH_INITIALIZED_ISOLATED_RESTORE_REQUIRED', dependency_container_ids: state.ids, initialization_state_sha256: state.initialization_state_sha256, target_config: operation.target_config }
  }
  if (action === 'fresh-prepare-api') {
    if (state.phase !== 'INITIALIZED') fail('FRESH_INITIALIZED_PHASE_REQUIRED')
    await verifyFreshRestore(operation, configuration, state)
    await createAndStart('fresh-prepare-api-private-only', ['api'], 240); await capture('api')
    state.phase = 'API_READY'; state.probe_challenge = randomBytes(32).toString('hex'); await persist(); await preserve()
    return { status: 'FRESH_API_READY_NO_RELAY_TARGET_CONFIG_BLOCKED', api_container_id: state.ids.api, diagnostic_body: JSON.stringify({ didar_peer_probe: state.probe_challenge }), target_config: 'BLOCKED', public_https: 'NOT_VERIFIED' }
  }
  if (action === 'fresh-restore-check' || action === 'fresh-checkpoint') {
    if (state.phase !== (action === 'fresh-checkpoint' ? 'QUIESCED' : 'INITIALIZED')) fail('FRESH_REQUIRED_RESTORATION_PHASE_MISSING')
    if (!bundle.manifest.files['fresh-restore.mjs'] || sha256(await readFile(new URL('./fresh-restore.mjs', import.meta.url))) !== bundle.manifest.files['fresh-restore.mjs']) fail('EXECUTING_RESTORE_HELPER_HASH_MISMATCH')
    exact(operation.restoration, ['path', 'evidence_url'], 'EXPLICIT_FRESH_RESTORE_DESTINATION_REQUIRED')
    const helper = await import('./fresh-restore.mjs')
    const restore = action === 'fresh-checkpoint' ? helper.runFreshCheckpoint : helper.runFreshRestore
    const result = await restore({ config: configuration, state, saveState: persist, run, evidenceUrl: operation.restoration.evidence_url, receiptPath: operation.restoration.path, preserve, applicationSource: bundle.manifest.source_sha, applicationImages: { api: bundle.manifest.images.api.image_id, storefront: bundle.manifest.images.storefront.image_id } })
    await preserve()
    return result
  }
  if (action === 'fresh-observe-peer') {
    if (state.phase !== 'API_READY') fail('FRESH_ACTUAL_API_NAMESPACE_REQUIRED')
    await verifyRelayTLS(configuration)
    // Fixed diagnostic in the actual final API namespace. Proof is checked with
    // the unchanged accepted v1 implementation, exact bytes and one-time body.
    // No authentication is processed and no request reaches application APIs.
    const code = socketObserverSource()
    const diagnostic = structuredClone(bundle.composition)
    diagnostic.services.observer = { image: configuration.DIDAR_API_IMAGE, network_mode: 'service:api', pull_policy: 'never', labels: labels(state.token, qa), volumes: [{ type: 'bind', source: configuration.DIDAR_AUTH_TLS_DIR, target: '/run/didar-tls', read_only: true, bind: { create_host_path: false } }], entrypoint: ['node'], command: ['-e', code], environment: { DIDAR_AUTH_NETWORK_KEY: '${DIDAR_AUTH_NETWORK_KEY}', OBSERVED_API_ID: state.ids.api, PROBE_CHALLENGE: state.probe_challenge } }
    const observation = JSON.parse(await run('fresh-observe-actual-relay-peer', ['compose', '--project-name', configuration.DIDAR_COMPOSE_PROJECT, '--project-directory', bundle.root, '--env-file', '/dev/null', '-f', '-', 'run', '--rm', '--no-deps', 'observer'], renderComposition(diagnostic, configuration)))
    if (observation.api_namespace !== state.ids.api || typeof observation.socket_peer !== 'string' || observation.signed_probe !== 'PASS') fail('FRESH_ACTUAL_PEER_OBSERVATION_REQUIRED')
    state.observation = observation; await persist(); await preserve()
    return { status: 'FRESH_SOCKET_OBSERVED_NOT_TRUST_APPROVAL', ...observation, target_config: 'BLOCKED', public_https: 'NOT_VERIFIED' }
  }
  if (action === 'fresh-quiesce') {
    if (!state.ids.api && !state.ids.storefront) return { status: 'FRESH_NO_APPLICATIONS_RUNNING_DEPENDENCIES_PRESERVED' }
    if (state.ids.storefront) await run('fresh-stop-storefront', ['stop', '--time', '25', state.ids.storefront])
    if (state.ids.api) await run('fresh-stop-api', ['stop', '--time', '25', state.ids.api])
    state.phase = 'QUIESCED'; await persist(); await preserve()
    return { status: 'FRESH_APPLICATIONS_QUIESCED_DEPENDENCIES_PRESERVED' }
  }
  if (!['fresh-start', 'fresh-bind-peer'].includes(action) || state.phase !== 'API_READY') fail('FRESH_ACTUAL_API_NAMESPACE_REQUIRED')
  if (!state.observation || state.observation.api_namespace !== state.ids.api) fail('FRESH_ACTUAL_PEER_OBSERVATION_REQUIRED')
  const observed = state.observation.socket_peer.replace(/^::ffff:/, '')
  // This bounded bootstrap records one actual Nginx socket. Extra peers cannot
  // be smuggled into the allowlist; multi-hop/peer support needs separate review.
  if (configuration.DIDAR_AUTH_INGRESS_PEERS !== observed) fail('FRESH_EXACT_SINGLE_OBSERVED_PEER_REQUIRED')
  await verifyFreshRestore(operation, configuration, state); await verifyEdge(operation, configuration, bundle)
  const binding = sha256(canonicalState({ configuration, operation, api: state.ids.api, observation: state.observation }))
  if (action === 'fresh-bind-peer') {
    state.binding_sha256 = binding; await persist(); await preserve()
    return { status: 'FRESH_PEER_BOUND_TO_ACTUAL_API_NAMESPACE', api_container_id: state.ids.api, target_config: operation.target_config, public_https: 'NOT_VERIFIED' }
  }
  if (state.binding_sha256 !== binding) fail('FRESH_CLOSED_PEER_BINDING_REQUIRED')
  const api = await capture('api')
  await createAndStart('fresh-start-storefront', ['storefront'], 240); const front = await capture('storefront')
  if (front.HostConfig.NetworkMode !== 'container:' + api.Id) fail('FRESH_SHARED_NAMESPACE_REQUIRED')
  const ports = api.HostConfig.PortBindings
  if (Object.keys(ports).join(',') !== '3000/tcp' || ports['3000/tcp'].length !== 1 || ports['3000/tcp'][0].HostIp !== '127.0.0.1' || ports['3000/tcp'][0].HostPort !== configuration.DIDAR_AUTH_HOST_PORT || Object.keys(front.HostConfig.PortBindings || {}).length) fail('FRESH_PRIVATE_LISTENERS_REQUIRED')
  await run('fresh-relay-health', ['exec', front.Id, 'node', 'runtime/health.mjs'])
  await run('fresh-private-next-denial', ['exec', front.Id, 'node', '-e', "fetch('http://127.0.0.1:3001/api/didar/login',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}).then(r=>process.exit(r.status===403?0:1)).catch(()=>process.exit(1))"])
  state.phase = 'HEALTHY'; await persist(); await preserve()
  return { status: 'FRESH_HEALTHY_INTERNAL_ONLY', source_sha: bundle.manifest.source_sha, qa_fixture: qa, target_config: operation.target_config, containers: state.ids, network_id: state.owned.networks[0], public_https: 'NOT_VERIFIED', lifecycle_handoff: 'TAKE_REAL_FOUR_CONTAINER_BACKUP_AND_ISOLATED_RESTORE_BEFORE_EXISTING_WRAPPER_OPERATIONS' }
}
