// Attached real-application acceptance. The caller provisions an owned isolated
// PostgreSQL-backed application bundle and real Nginx first; no owner endpoints.
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createHash, randomBytes } from 'node:crypto'
import { createRequire } from 'node:module'
import { observer } from './process.mjs'

const require = createRequire(import.meta.url)
const { signNetwork } = require('../../packages/auth-network/index.cjs')
const config = JSON.parse(await readFile(resolve(process.argv[2]), 'utf8'))
for (const field of ['run_id', 'source_sha', 'network', 'api', 'frontend', 'edge', 'nginx_image', 'ca_file', 'edge_ip', 'public_host', 'relay_ip', 'key_file', 'output_dir', 'owner_label']) if (!config[field]) throw Error('Missing explicit runtime field: ' + field)
if (!/^[a-f0-9]{40}$/.test(config.source_sha) || !/(?:@|^)sha256:[a-f0-9]{64}$/.test(config.nginx_image)) throw Error('Exact candidate source and pinned Nginx image required')
const output = resolve(config.output_dir), stages = [], results = [], owned = []
await mkdir(output, { recursive: true })
const command = observer(output, stages)
const docker = async (name, args, options) => (await command(name, 'docker', args, options)).stdout.toString('utf8').trim()
const inspect = async (id, name) => JSON.parse(await docker(name, ['inspect', '--format', '{{json .}}', id]))
const protectedIds = (await docker('protected-before', ['ps', '-aq', '--no-trunc'])).split('\n').filter(Boolean)
const key = await readFile(config.key_file, 'utf8')
const caDestination = '/tmp/didar-topology-ca.pem', proofHeader = 'x-didar-auth-network'
const customer = { email: 'customer@didar.test', password: 'DidarDemo2026!' }, wrong = { ...customer, password: 'TopologyWrong2026!' }
const edgePort = config.public_port || 8443, relayPort = config.relay_port || 3000
let success = false, cleanup = true, clients
async function check(name, fn) {
  try { results.push({ name, status: 'PASS', ...await fn() }) }
  catch (error) { results.push({ name, status: 'FAIL', message: error.message }) }
  finally { await writeFile(join(output, 'cases.json'), JSON.stringify(results, null, 2) + '\n') }
}
async function sql(query, values = []) {
  const script = `const {Pool}=require('/app/packages/api/node_modules/pg');let b='';process.stdin.on('data',x=>b+=x);process.stdin.on('end',async()=>{if(process.env.DIDAR_DISPOSABLE_QA!=='true')throw Error('Disposable QA required');const p=new Pool({connectionString:process.env.DATABASE_URL});try{const x=JSON.parse(b);const r=await p.query(x.query,x.values);process.stdout.write(JSON.stringify(r.rows))}finally{await p.end()}})`
  return JSON.parse(await docker('postgres-query-' + stages.length, ['exec', '-i', config.api, 'node', '-e', script], { input: JSON.stringify({ query, values }) }))
}
async function count(kind, ...parts) {
  const script = `const {Pool}=require('/app/packages/api/node_modules/pg'),{createHmac}=require('node:crypto');let b='';process.stdin.on('data',x=>b+=x);process.stdin.on('end',async()=>{if(process.env.DIDAR_DISPOSABLE_QA!=='true')throw Error('Disposable QA required');const p=new Pool({connectionString:process.env.DATABASE_URL});try{const x=JSON.parse(b),key=createHmac('sha256',process.env.COOKIE_SECRET).update(JSON.stringify(['auth-v2',x.kind,...x.parts])).digest('hex');const r=await p.query('SELECT attempts FROM didar_login_attempt WHERE key=$1',[key]);process.stdout.write(String(Number(r.rows[0]?.attempts||0)))}finally{await p.end()}})`
  return Number(await docker('postgres-quota-' + stages.length, ['exec', '-i', config.api, 'node', '-e', script], { input: JSON.stringify({ kind, parts }) }))
}
async function request(client, path, { body, raw, method = body === undefined && raw === undefined ? 'GET' : 'POST', headers = [], target = 'edge', expectedCurl = [0] } = {}) {
  const port = target === 'edge' ? edgePort : relayPort, ip = target === 'edge' ? config.edge_ip : config.relay_ip
  const connectPort = target === 'edge' ? config.edge_listen_port || port : port
  const rawBody = raw === undefined ? body === undefined ? undefined : Buffer.from(JSON.stringify(body)) : raw
  const args = ['exec', '-i', client, 'curl', '--silent', '--show-error', '--noproxy', '*', '--max-time', '20', '--cacert', caDestination, '--connect-to', config.public_host + ':' + port + ':' + ip + ':' + connectPort, '--path-as-is', '-X', method, ...headers.flatMap(x => ['-H', x])]
  if (rawBody !== undefined) args.push('-H', 'Content-Type: application/json', '--data-binary', '@-')
  args.push('-w', '\n%{http_code}', 'https://' + (target === 'edge' ? config.public_host : config.relay_tls_name || config.public_host) + ':' + port + path)
  // Relay uses its independently verified TLS server name; connect-to must use
  // that name as its match key as well as the URL's authority.
  if (target !== 'edge') args[args.indexOf('--connect-to') + 1] = (config.relay_tls_name || config.public_host) + ':' + port + ':' + ip + ':' + port
  const value = await command('http-' + results.length + '-' + stages.length, 'docker', args, { input: rawBody, expected: expectedCurl })
  if (value.code !== 0) return { curl_code: value.code, status: null }
  const text = value.stdout.toString('utf8'), at = text.lastIndexOf('\n'), status = Number(text.slice(at + 1)), response = text.slice(0, at)
  let json; try { json = JSON.parse(response) } catch {}
  return { status, json, bytes: Buffer.byteLength(response), sha256: createHash('sha256').update(response).digest('hex'), text: response }
}
async function createClient(role, network) {
  const name = 'didar-' + config.run_id + '-probe-' + role
  const id = await docker('create-client-' + role, ['create', '--name', name, '--label', 'didar.topology.probe=' + config.run_id, '--network', network, config.nginx_image, '/bin/sh', '-c', "trap 'exit 0' TERM INT QUIT; while :; do sleep 1 & wait $!; done"])
  owned.push({ id, name })
  await docker('copy-ca-' + role, ['cp', config.ca_file, id + ':' + caDestination])
  await docker('start-client-' + role, ['start', id])
  const info = await inspect(id, 'inspect-client-' + role), networks = info.NetworkSettings.Networks
  const peer = networks[Object.keys(networks)[0]]?.IPAddress
  return { id, peer }
}
try {
  for (const role of ['api', 'frontend', 'edge']) {
    const info = await inspect(config[role], 'validate-' + role)
    assert.equal(info.Config.Labels[config.owner_label], config.run_id, 'Owned disposable resource label required')
    assert.equal(info.State.Running, true)
  }
  const env = JSON.parse(await docker('validate-disposable-policy', ['exec', config.api, 'node', '-e', "process.stdout.write(JSON.stringify({disposable:process.env.DIDAR_DISPOSABLE_QA,policy:process.env.DIDAR_AUTH_PROXY_POLICY,peers:process.env.DIDAR_AUTH_PROXY_PEERS}))"]))
  assert.equal(env.disposable, 'true'); assert.equal(env.policy, 'require-proof'); assert.equal(env.peers, '127.0.0.1')
  clients = [await createClient('a', config.network), await createClient('b', config.network), await createClient('trusted-edge-peer', 'container:' + config.edge)]
  assert.ok(clients[0].peer && clients[1].peer); assert.notEqual(clients[0].peer, clients[1].peer)
  const a = clients[0], b = clients[1], trusted = clients[2]
  await check('Customer login uses the actual Docker socket, not supplied forwarding or proof headers', async () => {
    const r = await request(b.id, '/api/didar/login', { body: customer, headers: ['X-Forwarded-For: 198.51.100.71', 'Forwarded: for=198.51.100.72', 'X-Real-IP: 198.51.100.73', 'CF-Connecting-IP: 198.51.100.74', 'X-Didar-Auth-Network: forged', 'X-Didar-Auth-Network: duplicate'] })
    assert.equal(r.status, 200); assert.equal(r.json.user.id, 'demo-customer'); assert.equal(await count('network', b.peer), 1); assert.equal(await count('network', '198.51.100.71'), 0)
    return { http_status: 200, actual_peer: b.peer, caller_claim_quota: 0 }
  })
  await check('SEC-01/02: a real client exhausts its network budget while another real client can still log in', async () => {
    const statuses = []
    for (let i = 0; i < 201; i++) statuses.push((await request(a.id, '/api/didar/login', { body: { email: 'topology-' + config.run_id + '-' + i + '@example.invalid', password: wrong.password }, headers: ['X-Forwarded-For: 198.51.100.' + (1 + i % 200), 'X-Real-IP: 203.0.113.' + (1 + i % 200), 'X-Didar-Auth-Network: ' + randomBytes(12).toString('hex')] })).status)
    assert.ok(statuses.slice(0, 200).every(s => s === 401)); assert.equal(statuses[200], 429)
    const legitimate = await request(b.id, '/api/didar/login', { body: customer }); assert.equal(legitimate.status, 200)
    assert.equal(await count('network', a.peer), 201); assert.equal(await count('network', b.peer), 2)
    return { abusive_peer: a.peer, unrelated_peer: b.peer, unauthorized: 200, rate_limited: 1, legitimate_status: 200, no_forwarding_header_authority: true }
  })
  await check('Verified relay rejects unsigned, bad and correctly signed proof from an untrusted actual sender', async () => {
    const raw = Buffer.from(JSON.stringify(wrong)), path = '/api/didar/login'
    const proof = signNetwork({ key, peer: '198.51.100.9', method: 'POST', path, body: raw })
    const statuses = []
    for (const headers of [[], [proofHeader + ': malformed'], [proofHeader + ': ' + proof]]) statuses.push((await request(b.id, path, { raw, headers, target: 'relay' })).status)
    assert.deepEqual(statuses, [403, 403, 403]); assert.equal(await count('network', '198.51.100.9'), 0)
    return { statuses, even_valid_hmac_requires_exact_observed_sender: true }
  })
  await check('Trusted relay peer still requires proof bound to raw target, body, method, key and freshness', async () => {
    const raw = Buffer.from(JSON.stringify(wrong)), path = '/api/didar/login?q=%2F&a=1&a=2', base = { key, peer: '198.51.100.10', method: 'POST', path, body: raw }
    const proofs = [null, 'invalid', signNetwork({ ...base, ts: Date.now() - 31000 }), signNetwork({ ...base, ts: Date.now() + 6000 }), signNetwork({ ...base, path: path.replace('%2F', '%2f') }), signNetwork({ ...base, body: Buffer.concat([raw, Buffer.from(' ')]) }), signNetwork({ ...base, method: 'GET' }), signNetwork({ ...base, key: 'x'.repeat(32) })]
    const statuses = []
    for (const proof of proofs) statuses.push((await request(trusted.id, path, { raw, headers: proof ? [proofHeader + ': ' + proof] : [], target: 'relay' })).status)
    assert.ok(statuses.every(s => s === 403)); assert.equal(await count('network', base.peer), 0)
    const signed = signNetwork(base), first = await request(trusted.id, path, { raw, target: 'relay', headers: [proofHeader + ': ' + signed] }), replay = await request(trusted.id, path, { raw, target: 'relay', headers: [proofHeader + ': ' + signed] })
    assert.equal(first.status, 401); assert.equal(replay.status, 403); assert.equal(await count('network', base.peer), 1)
    return { negative_statuses: statuses, unmodified_status: 401, replay_after_401: 403, budget_spent_once: true }
  })
  await check('Concurrent valid proofs remain single-use and concurrent account attempts retain an atomic limit', async () => {
    const path = '/api/didar/login', raw = Buffer.from(JSON.stringify(wrong)), peer = '198.51.100.11'
    const proof = signNetwork({ key, peer, method: 'POST', path, body: raw })
    const replay = await Promise.all(Array.from({ length: 8 }, () => request(trusted.id, path, { raw, target: 'relay', headers: [proofHeader + ': ' + proof] })))
    assert.equal(replay.filter(r => r.status === 401).length, 1); assert.equal(replay.filter(r => r.status === 403).length, 7)
    const rs = await Promise.all(Array.from({ length: 32 }, () => request(trusted.id, path, { raw, target: 'relay', headers: [proofHeader + ': ' + signNetwork({ key, peer: '198.51.100.12', method: 'POST', path, body: raw })] })))
    assert.ok(rs.every(r => [401, 429].includes(r.status))); assert.equal(await count('network-account', '198.51.100.12', customer.email), 32)
    const limitedProof = signNetwork({ key, peer: '198.51.100.12', method: 'POST', path, body: raw })
    const limited = await request(trusted.id, path, { raw, target: 'relay', headers: [proofHeader + ': ' + limitedProof] }), limitedReplay = await request(trusted.id, path, { raw, target: 'relay', headers: [proofHeader + ': ' + limitedProof] })
    assert.equal(limited.status, 429); assert.equal(limitedReplay.status, 403)
    return { replay_statuses: replay.map(r => r.status), account_statuses: rs.map(r => r.status), atomic_pair_count_before_final_probe: 32, replay_after_429: 403 }
  })
  await check('Direct signed registration and Next login share the same canonical customer authority', async () => {
    const body = { email: 'topology-register-' + config.run_id + '@example.invalid', password: 'TopologyDisposable2026!', name: 'Topology disposable customer' }
    const registered = await request(b.id, '/didar/register', { body }); assert.equal(registered.status, 200); assert.equal(registered.json.user.role, 'customer')
    const loggedIn = await request(b.id, '/api/didar/login', { body: { email: body.email, password: body.password } }); assert.equal(loggedIn.status, 200); assert.equal(loggedIn.json.user.id, registered.json.user.id)
    const rows = await sql('SELECT count(*)::int n FROM didar_user WHERE email=$1', [body.email]); assert.equal(rows[0].n, 1)
    return { direct_registration: 200, proxied_login: 200, canonical_users_created: 1 }
  })
  await check('Same-origin native Admin and Vendor retain canonical dual-proof linking and tenant denial', async () => {
    const admin = await request(b.id, '/auth/user/emailpass', { body: { email: 'native-admin@didar.test', password: 'DidarNative2026!' } }), vendor = await request(b.id, '/auth/member/emailpass', { body: { email: 'native-supplier@didar.test', password: 'DidarNative2026!' } })
    assert.equal(admin.status, 200); assert.equal(vendor.status, 200)
    const ah = ['Authorization: Bearer ' + admin.json.token]
    await sql("DELETE FROM didar_native_actor WHERE actor_type='user' AND user_id='demo-admin' AND actor_id IN (SELECT id FROM \"user\" WHERE email=$1 AND deleted_at IS NULL)", ['native-admin@didar.test'])
    assert.equal((await request(b.id, '/admin/didar/context', { headers: ah })).status, 403)
    const canonical = await request(b.id, '/didar/login', { body: { email: 'admin@didar.test', password: 'DidarDemo2026!' } }); assert.equal(canonical.status, 200)
    const connected = await request(b.id, '/admin/didar/connect', { body: { didar_token: canonical.json.token }, headers: ah }); assert.equal(connected.status, 200)
    assert.equal((await request(b.id, '/admin/didar/context', { headers: ah })).status, 200)
    const sellers = await sql("SELECT seller_id,supplier_id FROM didar_native_seller WHERE supplier_id IN ('s1','s2')")
    const own = sellers.find(s => s.supplier_id === 's1').seller_id, rival = sellers.find(s => s.supplier_id === 's2').seller_id
    const supplier = await request(b.id, '/didar/login', { body: { email: 'supplier@didar.test', password: 'DidarDemo2026!' } }); assert.equal(supplier.status, 200)
    const vh = ['Authorization: Bearer ' + vendor.json.token, 'X-Seller-Id: ' + own]
    assert.equal((await request(b.id, '/vendor/didar/connect', { body: { didar_token: supplier.json.token }, headers: vh })).status, 200)
    assert.equal((await request(b.id, '/vendor/didar/context', { headers: vh })).status, 200)
    const denied = await request(b.id, '/vendor/didar/context', { headers: ['Authorization: Bearer ' + vendor.json.token, 'X-Seller-Id: ' + rival] }); assert.ok([400, 403].includes(denied.status))
    return { admin_native: 200, missing_canonical_link: 403, canonical_proof: 200, admin_connected: 200, vendor_native: 200, vendor_connected: 200, foreign_seller: denied.status }
  })
  await check('Same-domain B2C, account, native deep links, native API and denied private-media paths route correctly', async () => {
    const paths = ['/', '/account', '/dashboard/login', '/dashboard/products', '/seller/login', '/seller/products', '/didar/catalog', '/api/didar/catalog', '/health']
    const statuses = []
    for (const path of paths) { const r = await request(b.id, path); assert.ok([200, 307, 308].includes(r.status), path + ': ' + r.status); statuses.push({ path, status: r.status, bytes: r.bytes }) }
    for (const path of ['/didar/image?id=topology-nonexistent', '/api/didar/image?id=topology-nonexistent', '/didar/media-file?id=topology-nonexistent', '/api/didar/media-file?id=topology-nonexistent']) assert.equal((await request(b.id, path)).status, 404)
    return { public_routes: statuses, missing_private_media: 404, limit: 'Actual uploaded/public/range media and browser journeys run as separate gates, not inferred from 404s' }
  })
  await check('Private Next and API cannot be reached from a separate bridge client', async () => {
    const privateResult = await command('private-next-loopback-unsigned', 'docker', ['exec', config.api, 'node', '-e', "const body=JSON.stringify({email:'customer@didar.test',password:'DidarDemo2026!'});Promise.all([fetch('http://127.0.0.1:3001/api/didar/login',{method:'POST',headers:{'content-type':'application/json'},body}).then(r=>r.status),fetch('http://127.0.0.1:9000/didar/login',{method:'POST',headers:{'content-type':'application/json'},body}).then(r=>r.status)]).then(s=>{process.stdout.write(JSON.stringify(s));if(s.some(n=>n!==403))process.exit(1)})"])
    assert.deepEqual(JSON.parse(privateResult.stdout), [403, 403])
    const state = await inspect(config.api, 'private-port-inspection'), ports = state.NetworkSettings.Ports || {}
    assert.ok(!ports['3001/tcp']); for (const name of ['9000/tcp', '3000/tcp']) for (const binding of ports[name] || []) assert.ok(['127.0.0.1', '::1'].includes(binding.HostIp))
    for (const port of [9000, 3001]) await command('private-bridge-port-' + port, 'docker', ['exec', b.id, 'curl', '--silent', '--show-error', '--noproxy', '*', '--max-time', '3', 'http://' + config.relay_ip + ':' + port + '/health'], { expected: [7, 28] })
    return { private_unsigned_statuses: [403, 403], published_next: false, bridge_api_and_next_connection_denied: true }
  })
  await check('Explicit policy extension preserves truly direct nonproxy sockets without accepting their assertions', async () => {
    const script = "const http=require('node:http');function call(proof){return new Promise((done,reject)=>{const body=JSON.stringify({email:'customer@didar.test',password:'DidarDemo2026!'}),r=http.request({host:'127.0.0.1',port:9000,path:'/didar/login',method:'POST',localAddress:'127.0.0.2',headers:{'content-type':'application/json','content-length':Buffer.byteLength(body),...(proof?{'x-didar-auth-network':'invalid'}:{})}},s=>{s.resume();s.on('end',()=>done(s.statusCode))});r.on('error',reject);r.end(body)})}Promise.all([call(false),call(true)]).then(s=>{process.stdout.write(JSON.stringify(s));if(s[0]!==200||s[1]!==403)process.exit(1)})"
    const actual = await command('strict-mode-direct-socket-policy', 'docker', ['exec', config.api, 'node', '-e', script])
    assert.deepEqual(JSON.parse(actual.stdout), [200, 403])
    return { actual_direct_peer: '127.0.0.2', unsigned_direct: 200, supplied_assertion_from_untrusted_socket: 403 }
  })
  success = results.length > 0 && results.every(result => result.status === 'PASS')
} finally {
  for (const item of owned.reverse()) {
    try {
      const state = await inspect(item.id, 'cleanup-inspect-' + item.name)
      assert.equal(state.Name, '/' + item.name); assert.equal(state.Config.Labels['didar.topology.probe'], config.run_id)
      await docker('cleanup-stop-' + item.name, ['stop', '--time', '10', item.id])
      const stopped = await inspect(item.id, 'cleanup-exit-' + item.name)
      await writeFile(join(output, item.name + '-exit.json'), JSON.stringify({ code: stopped.State.ExitCode, oom: stopped.State.OOMKilled }) + '\n')
      await docker('cleanup-remove-' + item.name, ['rm', '-v', item.id])
    } catch { cleanup = false }
  }
  const remaining = (await docker('protected-after', ['ps', '-aq', '--no-trunc'])).split('\n')
  if (!protectedIds.every(id => remaining.includes(id))) cleanup = false
  await writeFile(join(output, 'result.json'), JSON.stringify({ status: success && cleanup ? 'PASS' : 'FAIL', source_sha: config.source_sha, run_id: config.run_id, cases: results.length, actual_source_peers: clients?.slice(0, 2).map(c => c.peer), cleanup: cleanup ? 'PASS' : 'FAIL', inherited_evidence: [], not_executed_by_this_runner: ['Real media upload/publication/range checks', 'Browser screenshots', 'Relay crash/API namespace recreation and compatible-bundle recovery', 'Host reboot', 'Owner target discovery/public TLS', 'Complete CI'], actual_child_exits: stages }, null, 2) + '\n')
  if (!cleanup) throw Error('Owned client cleanup/preservation failed')
}
if (!success) throw Error('Application topology acceptance contains failed cases; see cases.json')
