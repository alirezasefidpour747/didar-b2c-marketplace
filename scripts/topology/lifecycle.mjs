// Isolated, owned candidate runtime only. Compatible bundle recovery keeps
// business data, existing sessions, manifest and actual trust configuration.
import assert from 'node:assert/strict'
import https from 'node:https'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createHash, randomBytes } from 'node:crypto'
import { createRequire } from 'node:module'
import { resolve, join } from 'node:path'
import { observer } from './process.mjs'
const require = createRequire(import.meta.url), { signNetwork } = require('../../packages/auth-network/index.cjs')
const config = JSON.parse(await readFile(resolve(process.argv[2]), 'utf8'))
const output = resolve(config.lifecycle_output), command = observer(output), results = []
await mkdir(output, { recursive: true })
const ca = await readFile(config.ca_file), key = await readFile(config.key_file, 'utf8')
const docker = async (name, args, options) => (await command(name, 'docker', args, options)).stdout.toString('utf8').trim()
const inspect = async (id, name) => JSON.parse(await docker(name, ['inspect', '--format', '{{json .}}', id]))
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const privateResult = async script => JSON.parse(await docker('private-check-' + Date.now(), ['exec', config.api, 'node', '-e', script]))
const rawCredential = Buffer.from(JSON.stringify({ email: 'customer@didar.test', password: 'DidarDemo2026!' }))
const check = async (name, fn) => { try { results.push({ name, status: 'PASS', ...await fn() }) } catch (error) { results.push({ name, status: 'FAIL', message: error.message }); throw error } finally { await writeFile(join(output, 'cases.json'), JSON.stringify(results, null, 2) + '\n') } }
const request = (path, { body, headers = {}, method = body ? 'POST' : 'GET' } = {}) => new Promise((done, reject) => {
  const req = https.request(config.origin + path, { ca, method, headers: { ...(body ? { 'content-type': 'application/json', 'content-length': body.length } : {}), ...headers }, timeout: 10000 }, response => {
    const chunks = []; response.on('data', b => chunks.push(b)); response.on('end', () => { const raw = Buffer.concat(chunks); let json; try { json = JSON.parse(raw) } catch {} done({ status: response.statusCode, json, bytes: raw.length, sha256: sha(raw) }) })
  }); req.on('timeout', () => req.destroy(Error('HTTPS timeout'))); req.on('error', reject); req.end(body)
})
async function wait(name, fn, milliseconds = 90000) { const end = Date.now() + milliseconds; let message; while (Date.now() < end) { try { if (await fn()) return } catch (error) { message = error.message } await new Promise(done => setTimeout(done, 250)) } throw Error(name + ' readiness timeout: ' + message) }
async function fingerprints() {
  const script = "const{Pool}=require('/app/packages/api/node_modules/pg');const p=new Pool({connectionString:process.env.DATABASE_URL});(async()=>{if(process.env.DIDAR_DISPOSABLE_QA!=='true')throw Error('Disposable required');const names=['didar_product','didar_offer','didar_inventory_item','didar_order','didar_fin_event','didar_fin_posting','didar_user','didar_native_actor','didar_native_seller','didar_media_asset','didar_media_variant'];const present=(await p.query('SELECT tablename FROM pg_tables WHERE schemaname=\'public\' AND tablename=ANY($1::text[])',[names])).rows.map(r=>r.tablename);const out={};for(const table of present)out[table]=(await p.query('SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,\'[]\')) h FROM '+table+' t')).rows[0].h;process.stdout.write(JSON.stringify(out))})().finally(()=>p.end())"
  return privateResult(script)
}
async function frontendReady() {
  return (await command('packaged-health-' + Date.now(), 'docker', ['exec', config.frontend, 'node', 'runtime/health.mjs'], { expected: [0, 1] })).code === 0
}
async function runtimeVersions() {
  const script = "const c=require('node:crypto');const out={};for(const key of ['JWT_SECRET','COOKIE_SECRET','DIDAR_AUTH_NETWORK_KEY']){const v=process.env[key];if(!v)throw Error('Missing runtime secret');out[key]=c.createHash('sha256').update(v).digest('hex')}process.stdout.write(JSON.stringify(out))"
  const result = {}
  for (const role of ['api', 'frontend']) result[role] = JSON.parse(await docker('runtime-secret-versions-' + role + '-' + Date.now(), ['exec', config[role], 'node', '-e', script]))
  assert.deepEqual(result.api, result.frontend)
  return result
}
async function signedRelay(raw, proof) {
  const response = await docker('trusted-relay-request-' + Date.now(), ['exec', '-i', config.edge, 'curl', '--silent', '--show-error', '--noproxy', '*', '--max-time', '10', '--cacert', config.edge_ca_file, '--connect-to', 'didar.test:3000:' + config.relay_ip + ':3000', '-H', 'content-type: application/json', '-H', 'x-didar-auth-network: ' + proof, '--data-binary', '@-', '-w', '\n%{http_code}', 'https://didar.test:3000/api/didar/login'], { input: raw })
  return Number(response.slice(response.lastIndexOf('\n') + 1))
}
let originalConfig, baseline, originalSession, media, privateHash, secretVersions, success = false, restoredConfig = true
try {
  for (const role of ['api', 'frontend', 'edge']) {
    const state = await inspect(config[role], 'validate-' + role); assert.equal(state.Config.Labels[config.owner_label], config.run_id); assert.equal(state.State.Running, true)
    if (role === 'api') { assert.equal(state.Mounts.length, 1); assert.equal(state.Mounts[0].Type, 'volume'); assert.equal(state.Mounts[0].Name, config.upload_volume); assert.equal(state.Mounts[0].Destination, '/app/packages/api/.medusa/server/static') }
    else assert.equal(state.Mounts.length, 0, 'No source, dependency, or undeclared runtime mounts')
  }
  secretVersions = await runtimeVersions()
  originalConfig = await readFile(config.nginx_config_file)
  baseline = await fingerprints(); assert.ok(Object.keys(baseline).length >= 9)
  privateHash = { nginx_config: sha(originalConfig), signer_key_version_sha256: sha(key), manifest_sha256: config.frontend_manifest_sha256 }
  const login = await request('/api/didar/login', { body: rawCredential }); assert.equal(login.status, 200); originalSession = login.json.token
  media = Buffer.from('Disposable topology media ' + randomBytes(16).toString('hex'))
  await docker('write-owned-upload-volume-sentinel', ['exec', '-i', config.api, 'node', '-e', "const fs=require('node:fs');fs.writeFileSync('/app/packages/api/.medusa/server/static/topology-recovery.txt',fs.readFileSync(0),{mode:0o644})"], { input: media })
  const beforeMedia = await request('/static/topology-recovery.txt'); assert.equal(beforeMedia.status, 200); assert.equal(beforeMedia.sha256, sha(media))
  await check('Real relay child crash makes original packaged supervisor exit1 and public auth fails closed', async () => {
    const killed = await docker('kill-owned-original-relay-child', ['exec', config.frontend, 'node', '-e', "const fs=require('node:fs');const ids=fs.readFileSync('/proc/1/task/1/children','utf8').trim().split(' ').filter(Boolean).map(Number);const matches=ids.filter(id=>id>1&&fs.readFileSync('/proc/'+id+'/cmdline','utf8').includes('/apps/storefront/auth-ingress.mjs'));if(matches.length!==1)throw Error('Expected exactly one original relay child');process.kill(matches[0],'SIGKILL');process.stdout.write(JSON.stringify({matched_original_child:true,signal:'SIGKILL'}))"])
    assert.equal(JSON.parse(killed).matched_original_child, true)
    await wait('Supervisor fail-closed exit', async () => !(await inspect(config.frontend, 'wait-supervisor-exit-' + Date.now())).State.Running)
    const state = await inspect(config.frontend, 'original-supervisor-exit'); assert.equal(state.State.ExitCode, 1); assert.equal(state.State.OOMKilled, false)
    const closed = await request('/api/didar/login', { body: rawCredential }); assert.ok([502, 503, 504].includes(closed.status))
    await docker('recover-same-packaged-supervisor', ['start', config.frontend]); await wait('Supervisor recovery', frontendReady)
    assert.equal((await request('/api/didar/login', { body: rawCredential })).status, 200)
    return { original_supervisor_container_exit: 1, relay_child_signal: 'SIGKILL', public_status_while_down: closed.status, recovered_login: 200 }
  })
  await check('Actual API network namespace recreation preserves proof nonces, sessions, media and business state', async () => {
    const namespace = await docker('namespace-before', ['exec', config.api, 'readlink', '/proc/self/ns/net'])
    const raw = Buffer.from(JSON.stringify({ email: 'lifecycle-replay@example.invalid', password: 'DisposableWrong2026!' })), ts = Date.now(), nonce = randomBytes(16).toString('hex')
    const proof = signNetwork({ key, peer: '198.51.100.199', method: 'POST', path: '/api/didar/login', body: raw, ts, nonce })
    assert.equal(await signedRelay(raw, proof), 401)
    await docker('stop-frontend-before-namespace-recreate', ['stop', '--time', '25', config.frontend])
    const stoppedFront = await inspect(config.frontend, 'graceful-frontend-exit-before-namespace-recreate'); assert.equal(stoppedFront.State.ExitCode, 0); assert.equal(stoppedFront.State.OOMKilled, false)
    await docker('stop-api-for-namespace-recreate', ['stop', '--time', '25', config.api])
    const stoppedApi = await inspect(config.api, 'graceful-api-exit-before-namespace-recreate'); assert.equal(stoppedApi.State.ExitCode, 0); assert.equal(stoppedApi.State.OOMKilled, false)
    const closed = await request('/api/didar/login', { body: rawCredential }); assert.ok([502, 503, 504].includes(closed.status))
    await docker('start-same-api-new-namespace', ['start', config.api])
    await wait('API recovery', async () => (await command('api-recovery-health-' + Date.now(), 'docker', ['exec', config.api, 'node', '-e', "fetch('http://127.0.0.1:9000/health').then(r=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1))"], { expected: [0, 1] })).code === 0)
    const newNamespace = await docker('namespace-after', ['exec', config.api, 'readlink', '/proc/self/ns/net']); assert.notEqual(newNamespace, namespace)
    const state = await inspect(config.api, 'api-peer-after-namespace-recreate'), actualIp = state.NetworkSettings.Networks[Object.keys(state.NetworkSettings.Networks)[0]].IPAddress
    assert.equal(actualIp, config.relay_ip, 'Frozen relay peer address must be reconciled, never silently broadened')
    await docker('start-frontend-in-current-api-namespace', ['start', config.frontend]); await wait('Frontend current namespace', frontendReady)
    const frontendNamespace = await docker('frontend-current-namespace', ['exec', config.frontend, 'readlink', '/proc/self/ns/net']); assert.equal(frontendNamespace, newNamespace)
    const age = Date.now() - ts; assert.ok(age >= 0 && age < 30000, 'Replay must still be fresh; stale rejection is not persistence proof')
    assert.equal(await signedRelay(raw, proof), 403)
    const me = await request('/api/didar/me', { headers: { authorization: 'Bearer ' + originalSession } }); assert.equal(me.status, 200); assert.equal(me.json.user.id, 'demo-customer')
    const recoveredMedia = await request('/static/topology-recovery.txt'); assert.equal(recoveredMedia.status, 200); assert.equal(recoveredMedia.sha256, sha(media))
    assert.deepEqual(await fingerprints(), baseline)
    assert.deepEqual(await runtimeVersions(), secretVersions)
    return { same_api_container_id: config.api, namespace_before: namespace, namespace_after: newNamespace, frontend_namespace_after: frontendNamespace, namespace_inode_changed: true, container_recreation_claimed: false, frozen_relay_peer_preserved: true, replay_age_ms: age, replay_status: 403, existing_session: 200, uploaded_media: 200, business_fingerprints_unchanged: true, runtime_secret_versions_unchanged: true, graceful_frontend_exit: stoppedFront.State.ExitCode, graceful_api_exit: stoppedApi.State.ExitCode }
  })
  await check('Mismatched signing bundle fails closed and recovery restores exact accepted config and key version', async () => {
    const wrong = originalConfig.toString().replace('env DIDAR_AUTH_NETWORK_KEY;', 'env DIDAR_AUTH_NETWORK_KEY=' + 'public-test-only-wrong-key-00000000' + ';')
    assert.notEqual(wrong, originalConfig.toString())
    restoredConfig = false
    await docker('install-owned-mismatched-test-config', ['exec', '-i', config.edge, 'sh', '-c', 'cat > "$1"', 'topology', config.nginx_config_file], { input: wrong })
    await docker('validate-mismatched-test-config', ['exec', config.edge, 'nginx', '-t', '-c', config.nginx_config_file])
    await docker('reload-owned-mismatched-key', ['exec', config.edge, 'nginx', '-c', config.nginx_config_file, '-s', 'reload'])
    await wait('Mismatched key actually active', async () => (await request('/api/didar/login', { body: rawCredential })).status === 403, 15000)
    await docker('restore-exact-compatible-nginx-config', ['exec', '-i', config.edge, 'sh', '-c', 'cat > "$1"', 'topology', config.nginx_config_file], { input: originalConfig })
    await docker('validate-restored-compatible-config', ['exec', config.edge, 'nginx', '-t', '-c', config.nginx_config_file])
    await docker('reload-exact-compatible-config', ['exec', config.edge, 'nginx', '-c', config.nginx_config_file, '-s', 'reload'])
    await wait('Compatible bundle actual login', async () => (await request('/api/didar/login', { body: rawCredential })).status === 200, 15000)
    const actual = await docker('readback-restored-config', ['exec', config.edge, 'cat', config.nginx_config_file]); assert.equal(sha(Buffer.from(actual + '\n')), sha(originalConfig))
    restoredConfig = true
    assert.deepEqual(await fingerprints(), baseline)
    const manifest = await docker('manifest-after-compatible-recovery', ['exec', config.frontend, 'node', '-e', "process.stdout.write(require('node:crypto').createHash('sha256').update(require('node:fs').readFileSync('PACKAGING.json')).digest('hex'))"])
    assert.equal(manifest, config.frontend_manifest_sha256)
    assert.deepEqual(await runtimeVersions(), secretVersions)
    return { wrong_key_public_auth: 403, recovered_customer_login: 200, exact_config_restored: true, stable_key_version: true, package_manifest_unchanged: true, business_fingerprints_unchanged: true, no_cookie_jwt_rotation_or_quota_flush: true }
  })
  await check('Recovered native login, media, TLS and private proof boundaries remain functional', async () => {
    const statuses = []
    for (const [path, email] of [['/auth/user/emailpass', 'native-admin@didar.test'], ['/auth/member/emailpass', 'native-supplier@didar.test']]) { const r = await request(path, { body: Buffer.from(JSON.stringify({ email, password: 'DidarNative2026!' })) }); assert.equal(r.status, 200); statuses.push(r.status) }
    const closed = await privateResult("const body=JSON.stringify({email:'customer@didar.test',password:'DidarDemo2026!'});Promise.all([9000,3001].map(port=>fetch('http://127.0.0.1:'+port+(port===9000?'/didar/login':'/api/didar/login'),{method:'POST',headers:{'content-type':'application/json'},body}).then(r=>r.status))).then(x=>process.stdout.write(JSON.stringify(x)))")
    assert.deepEqual(closed, [403, 403]); const staticMedia = await request('/static/topology-recovery.txt'); assert.equal(staticMedia.sha256, sha(media))
    return { native_admin_vendor_statuses: statuses, unsigned_private_statuses: closed, media_bytes_unchanged: true, certificate_validation: 'QA CA plus hostname verification enabled' }
  })
  success = true
} finally {
  if (!restoredConfig && originalConfig) {
    await docker('finally-restore-exact-owned-config', ['exec', '-i', config.edge, 'sh', '-c', 'cat > "$1"', 'topology', config.nginx_config_file], { input: originalConfig })
    await docker('finally-reload-restored-config', ['exec', config.edge, 'nginx', '-c', config.nginx_config_file, '-s', 'reload'])
  }
  await writeFile(join(output, 'result.json'), JSON.stringify({ status: success ? 'PASS' : 'FAIL', source_sha: config.source_sha, run_id: config.run_id, cases: results.length, private_configuration_hashes: privateHash, actual_runtime_secret_version_hashes: secretVersions, not_executed: ['Host reboot', 'Owner server/public Internet TLS', 'Force-removal/recreation with a different API container ID', 'Rollback to a different published application release'], no_schema_or_identity_rewrite: true }, null, 2) + '\n')
}
