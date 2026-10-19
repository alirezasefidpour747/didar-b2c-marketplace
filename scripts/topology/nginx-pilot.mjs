// Actual Nginx/njs HTTPS + Docker bridge transport probe. This is deliberately
// narrower than PostgreSQL/application/native acceptance and reports that limit.
import assert from 'node:assert/strict'
import https from 'node:https'
import { randomBytes, createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile, mkdtemp, rm } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
import { render } from '../deployment/nginx/render.mjs'
import { observer } from './process.mjs'

const require = createRequire(import.meta.url)
const { verifyNetwork, normalizePeer } = require('../../packages/auth-network/index.cjs')
const image = process.env.TOPOLOGY_NGINX_IMAGE || 'nginx@sha256:a8b39bd9cf0f83869a2162827a0caf6137ddf759d50a171451b335cecc87d236'
if (!/@sha256:[a-f0-9]{64}$/.test(image)) throw Error('Pinned Nginx image digest required')
const runId = 'nginx-pilot-' + Date.now() + '-' + randomBytes(4).toString('hex')
const evidence = resolve(process.argv[2] || '.local/topology/' + runId)
await mkdir(evidence, { recursive: true })
const stages = [], command = observer(evidence, stages)
const docker = async (name, args, options) => (await command(name, 'docker', args, options)).stdout.toString('utf8').trim()
const inspect = async (id, name) => JSON.parse(await docker(name, ['inspect', '--format', '{{json .}}', id]))
const owned = [], protectedIds = (await docker('protected-containers-before', ['ps', '-aq', '--no-trunc'])).split('\n').filter(Boolean)
const root = await mkdtemp(join(tmpdir(), 'didar-nginx-pilot-'))
const key = randomBytes(32).toString('hex'), results = [], observed = []
let network, server, edge, trustedEdge, ok = false, cleanup = true
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const label = 'didar.topology.run=' + runId
const files = join(root, 'files'), config = join(files, 'config'), tls = join(files, 'tls'), signer = join(files, 'signer')
await Promise.all([mkdir(tls, { recursive: true, mode: 0o700 }), mkdir(signer, { recursive: true })])
async function create(role, args, cmd) {
  const name = 'didar-' + runId + '-' + role
  const id = await docker('create-' + role, ['create', '--name', name, '--label', label, '--network', network, ...args, image, ...cmd])
  owned.push({ id, name })
  return id
}
async function check(name, fn) {
  try { results.push({ name, status: 'PASS', ...await fn() }) }
  catch (error) { results.push({ name, status: 'FAIL', message: error.message }); throw error }
  finally { await writeFile(join(evidence, 'cases.json'), JSON.stringify(results, null, 2) + '\n') }
}
async function request(client, path, { body = Buffer.from('{}'), method = 'POST', headers = [] } = {}) {
  const raw = await docker('request-' + results.length + '-' + stages.length, ['exec', '-i', client, 'curl', '--silent', '--show-error', '--noproxy', '*', '--max-time', '15', '--cacert', join(tls, 'cert.pem'), '--connect-to', 'didar.test:8443:' + trustedEdge + ':8443', '--path-as-is', '-X', method, ...headers.flatMap(value => ['-H', value]), '--data-binary', '@-', '-w', '\n%{http_code}', 'https://didar.test:8443' + path], { input: body })
  const at = raw.lastIndexOf('\n'), status = Number(raw.slice(at + 1)), text = raw.slice(0, at)
  let json
  try { json = JSON.parse(text) } catch {}
  return { status, json, text }
}
try {
  await command('qa-certificate', 'openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(tls, 'key.pem'), '-out', join(tls, 'cert.pem'), '-days', '1', '-subj', '/CN=didar.test', '-addext', 'subjectAltName=DNS:didar.test,DNS:relay.test', '-addext', 'basicConstraints=critical,CA:TRUE'])
  await writeFile(join(root, 'secret.env'), 'DIDAR_AUTH_NETWORK_KEY=' + key + '\n', { mode: 0o600 })
  network = await docker('create-network', ['network', 'create', '--label', label, 'didar-' + runId])
  const net = JSON.parse(await docker('inspect-network', ['network', 'inspect', network]))[0]
  const gateway = net.IPAM.Config[0].Gateway
  assert.ok(gateway, 'Observed Docker gateway required')
  server = https.createServer({ key: await readFile(join(tls, 'key.pem')), cert: await readFile(join(tls, 'cert.pem')) }, async (req, res) => {
    const chunks = []; for await (const bytes of req) chunks.push(bytes)
    const body = Buffer.concat(chunks)
    try {
      assert.equal(normalizePeer(req.socket.remoteAddress), trustedEdge)
      const proof = verifyNetwork({ key, assertion: req.headers['x-didar-auth-network'], method: req.method, path: req.url, body })
      const claims = ['x-forwarded-for', 'forwarded', 'x-real-ip', 'cf-connecting-ip', 'true-client-ip', 'cf-connecting-ipv6', 'fastly-client-ip'].filter(name => req.headers[name] !== undefined)
      const value = { peer: proof.peer, method: req.method, path: req.url, bytes: body.length, sha256: hash(body), caller_attribution_headers: claims }
      observed.push(value)
      res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(value))
    } catch { res.writeHead(403); res.end() }
  })
  await new Promise((done, reject) => { server.once('error', reject); server.listen(0, '0.0.0.0', done) })
  const port = server.address().port
  for (const name of ['auth.mjs', 'sign.mjs']) await writeFile(join(signer, name), await readFile(new URL('../deployment/nginx/' + name, import.meta.url)))
  const discovery = { NJS_MODULE_FILE: '/usr/lib/nginx/modules/ngx_http_js_module.so', PID_FILE: '/run/didar-topology-nginx.pid', SIGNER_DIRECTORY: signer, RELAY_ADDRESS: gateway + ':' + port, LISTEN_ADDRESS: '0.0.0.0:8443', PUBLIC_HOST: 'didar.test', PUBLIC_PORT: '8443', TLS_CERT_FILE: join(tls, 'cert.pem'), TLS_KEY_FILE: join(tls, 'key.pem'), UPSTREAM_CA_FILE: join(tls, 'cert.pem'), RELAY_TLS_NAME: 'relay.test' }
  render(discovery, config)
  edge = await create('edge', ['--env-file', join(root, 'secret.env')], ['nginx', '-c', join(config, 'nginx.conf'), '-g', 'daemon off;'])
  // docker cp requires an existing destination parent; copy the whole root to /tmp.
  // The stopped container can safely receive generated nonsecret config and QA TLS.
  await docker('copy-edge-root', ['cp', root, edge + ':/tmp/'])
  await docker('nginx-configuration', ['run', '--rm', '--label', label, '--network', network, '--env-file', join(root, 'secret.env'), '--mount', 'type=bind,src=' + root + ',dst=' + root + ',readonly', image, 'nginx', '-t', '-c', join(config, 'nginx.conf')])
  await docker('start-edge', ['start', edge])
  trustedEdge = (await inspect(edge, 'inspect-edge')).NetworkSettings.Networks[Object.keys((await inspect(edge, 'inspect-edge-network')).NetworkSettings.Networks)[0]].IPAddress
  const clients = []
  for (const role of ['a', 'b']) {
    const id = await create('client-' + role, [], ['sleep', 'infinity'])
    await docker('copy-client-ca-' + role, ['cp', root, id + ':/tmp/'])
    await docker('start-client-' + role, ['start', id])
    const state = await inspect(id, 'inspect-client-' + role)
    const peer = state.NetworkSettings.Networks[Object.keys(state.NetworkSettings.Networks)[0]].IPAddress
    clients.push({ id, peer })
  }
  assert.notEqual(clients[0].peer, clients[1].peer)
  await check('Two actual Docker client sockets remain distinct in verified v1 assertions', async () => {
    const values = []
    for (const client of clients) { const r = await request(client.id, '/api/didar/login'); assert.equal(r.status, 200); assert.equal(r.json.peer, client.peer); values.push(r.json.peer) }
    return { actual_source_peers: values, shared_nginx_peer: trustedEdge }
  })
  await check('Caller proofs and forwarding addresses are replaced at the genuine first hop', async () => {
    const headers = ['X-Forwarded-For: 198.51.100.1', 'Forwarded: for=198.51.100.2', 'X-Real-IP: 198.51.100.3', 'CF-Connecting-IP: 198.51.100.4', 'True-Client-IP: 198.51.100.5', 'X-Didar-Auth-Network: forged', 'X-Didar-Auth-Network: duplicate']
    const r = await request(clients[0].id, '/didar/login', { headers })
    assert.equal(r.status, 200); assert.equal(r.json.peer, clients[0].peer); assert.deepEqual(r.json.caller_attribution_headers, [])
    return { status_code: r.status, socket_preserved: true, forged_headers_removed: true }
  })
  await check('Raw invalid UTF-8, NUL, duplicate query keys and escaped query bytes survive exact HMAC binding', async () => {
    const body = Buffer.from([123, 0, 255, 128, 192, 175, 125]), path = '/api/didar/login?x=%2f%2F&x=%41&plus=+'
    const r = await request(clients[1].id, path, { body, headers: ['Content-Type: application/octet-stream'] })
    assert.equal(r.status, 200); assert.equal(r.json.path, path); assert.equal(r.json.sha256, hash(body)); assert.equal(r.json.bytes, body.length)
    return { status_code: 200, bytes: body.length, digest_match: true, raw_target_match: true }
  })
  await check('All four canonical signed auth endpoints interoperate with the existing verifier', async () => {
    const paths = ['/api/didar/login', '/api/didar/register', '/didar/login', '/didar/register']
    for (const path of paths) assert.equal((await request(clients[0].id, path)).status, 200)
    return { paths, expected_status: 200 }
  })
  await check('Auth method, compressed payload, over-limit bytes and encoded aliases fail closed', async () => {
    const statuses = [
      (await request(clients[0].id, '/didar/login', { method: 'GET' })).status,
      (await request(clients[0].id, '/didar/login', { headers: ['Content-Encoding: gzip'] })).status,
      (await request(clients[0].id, '/didar/login', { body: Buffer.alloc(1200001, 97) })).status,
      (await request(clients[0].id, '/didar/%6cogin')).status,
    ]
    assert.deepEqual(statuses, [405, 415, 413, 400])
    return { statuses }
  })
  await check('Exactly 1,200,000 raw bytes remain signed without temp-file truncation', async () => {
    const body = Buffer.alloc(1200000, 97), r = await request(clients[0].id, '/didar/login', { body })
    assert.equal(r.status, 200); assert.equal(r.json.bytes, body.length); assert.equal(r.json.sha256, hash(body))
    return { bytes: body.length, status_code: r.status, digest_match: true }
  })
  await check('Actual Nginx reload preserves verified source attribution', async () => {
    await docker('reload-edge', ['exec', edge, 'nginx', '-c', join(config, 'nginx.conf'), '-s', 'reload'])
    const r = await request(clients[1].id, '/didar/login'); assert.equal(r.status, 200); assert.equal(r.json.peer, clients[1].peer)
    return { status_code: r.status }
  })
  ok = true
  await writeFile(join(evidence, 'discovery.json'), JSON.stringify({ image, run_id: runId, network: net.Name, gateway, edge_peer: trustedEdge, client_peers: clients.map(c => c.peer), host_relay_port: port, config_sha256: hash(await readFile(join(config, 'nginx.conf'))), signer_sha256: hash(await readFile(join(signer, 'sign.mjs'))), auth_sha256: hash(await readFile(join(signer, 'auth.mjs'))) }, null, 2) + '\n')
} catch (error) {
  await writeFile(join(evidence, 'failure.json'), JSON.stringify({ message: error.message, diagnostic: error.stderr || null }, null, 2) + '\n')
  throw error
} finally {
  if (server) await new Promise(done => server.close(done))
  for (const item of owned.reverse()) {
    try {
      const state = await inspect(item.id, 'cleanup-inspect-' + item.name)
      assert.equal(state.Name, '/' + item.name); assert.equal(state.Config.Labels['didar.topology.run'], runId)
      if (state.State.Running) await docker('cleanup-stop-' + item.name, ['stop', '--time', '10', item.id])
      const stopped = await inspect(item.id, 'cleanup-exit-' + item.name)
      await writeFile(join(evidence, item.name + '-container-exit.json'), JSON.stringify({ code: stopped.State.ExitCode, oom: stopped.State.OOMKilled, error: stopped.State.Error }) + '\n')
      await docker('cleanup-remove-' + item.name, ['rm', '-v', item.id])
    } catch { cleanup = false }
  }
  if (network) { try { await docker('cleanup-network', ['network', 'rm', network]) } catch { cleanup = false } }
  const remaining = (await docker('protected-containers-after', ['ps', '-aq', '--no-trunc'])).split('\n')
  if (!protectedIds.every(id => remaining.includes(id))) cleanup = false
  await rm(root, { recursive: true, force: true })
  await writeFile(join(evidence, 'result.json'), JSON.stringify({ status: ok && cleanup ? 'PASS_TRANSPORT_ONLY' : 'FAIL', run_id: runId, cases: results.length, cleanup: cleanup ? 'PASS' : 'FAIL', protected_containers: protectedIds.length, limits: ['Host TLS verifier is a test-only upstream, not the application relay', 'No PostgreSQL state or quota/native/media/browser acceptance in this transport pilot', 'No owner server or target/public TLS verification', 'Disposable Docker IPv4 bridge; IPv6 not enabled or claimed'], actual_child_exits: stages }, null, 2) + '\n')
  if (!cleanup) throw Error('Owned resource cleanup/preservation failed')
}
