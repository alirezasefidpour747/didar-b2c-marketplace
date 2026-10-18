// Transport/config contracts; PostgreSQL nonce and real Nginx tests are separate gates.
import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import https from 'node:https'
import { spawn, execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { randomBytes } from 'node:crypto'
import { HEADER, signNetwork, verifyNetwork, exactPeers, apiNetworkPolicy } from '../packages/auth-network/index.cjs'

const key = randomBytes(32).toString('hex'), temp = mkdtempSync(join(tmpdir(), 'didar-relay-contract-'))
const children = [], servers = [], requests = []
let relay, socket, api, next, ca
async function listen(server) {
  servers.push(server)
  await new Promise(r => server.listen(0, '127.0.0.1', r))
  return server.address().port
}
function send(origin, path, body = Buffer.alloc(0), headers = {}, localAddress = '127.0.0.1', method = 'POST') {
  return new Promise((resolve, reject) => {
    const url = new URL(origin)
    const req = (url.protocol === 'https:' ? https : http).request({ hostname: url.hostname, port: url.port, path, method, ca, localAddress,
      headers: { 'content-type': 'application/json', 'content-length': body.length, ...headers } }, res => {
      const chunks = []; res.on('data', b => chunks.push(b)); res.on('end', () => {
        const bytes = Buffer.concat(chunks); let data; try { data = JSON.parse(bytes) } catch {}
        resolve({ status: res.statusCode, data, bytes })
      })
    }); req.setTimeout(5000, () => req.destroy(Error('request timeout'))); req.on('error', reject); req.end(body)
  })
}
async function start(mode, extra = {}) {
  const reserve = http.createServer(); await new Promise(r => reserve.listen(0, '127.0.0.1', r))
  const port = reserve.address().port; await new Promise(r => reserve.close(r))
  const env = { ...process.env, DIDAR_AUTH_NETWORK_KEY: key, DIDAR_AUTH_STOREFRONT_URL: next,
    DIDAR_AUTH_INGRESS_HOST: '127.0.0.1', DIDAR_AUTH_INGRESS_PORT: String(port), DIDAR_AUTH_INGRESS_MODE: mode,
    DIDAR_AUTH_NATIVE_URL: mode === 'verified-relay' ? api : '', DIDAR_AUTH_INGRESS_PEERS: '127.0.0.1',
    DIDAR_AUTH_INGRESS_TLS_CERT_FILE: mode === 'verified-relay' ? join(temp, 'cert.pem') : '',
    DIDAR_AUTH_INGRESS_TLS_KEY_FILE: mode === 'verified-relay' ? join(temp, 'key.pem') : '', ...extra }
  const child = spawn(process.execPath, [resolve('apps/storefront/auth-ingress.mjs')], { env, stdio: ['ignore', 'pipe', 'pipe'] })
  const done = new Promise(r => child.once('close', (code, signal) => r({ code, signal })))
  children.push({ child, done }); let logs = ''
  child.stdout.on('data', b => { logs += b }); child.stderr.on('data', b => { logs += b })
  for (let i = 0; i < 100; i++) {
    if (logs.includes('signed auth ingress ready')) return { origin: `${mode === 'verified-relay' ? 'https' : 'http'}://127.0.0.1:${port}`, child, done }
    if (child.exitCode !== null || child.signalCode !== null) throw Error('Ingress startup failed: ' + logs)
    await new Promise(r => setTimeout(r, 20))
  }
  throw Error('Ingress startup timeout')
}
before(async () => {
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1', '-keyout', join(temp, 'key.pem'), '-out', join(temp, 'cert.pem')], { stdio: 'ignore' })
  ca = readFileSync(join(temp, 'cert.pem'))
  function stub(role) { return http.createServer(async (req, res) => {
    const chunks = []; for await (const b of req) chunks.push(b)
    const body = Buffer.concat(chunks), assertion = req.headers[HEADER]
    let proof = null
    if (assertion) proof = verifyNetwork({ key, assertion, method: req.method, path: req.url, body })
    requests.push({ role, path: req.url })
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ role, path: req.url, body: body.toString('hex'), assertion, proof, headers: req.headers }))
  }) }
  api = 'http://127.0.0.1:' + await listen(stub('api'))
  next = 'http://127.0.0.1:' + await listen(stub('next'))
  relay = await start('verified-relay'); socket = await start('socket')
})
after(async () => {
  for (const { child, done } of children) {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM')
    const result = await done
    assert.deepEqual(result, { code: null, signal: 'SIGTERM' })
  }
  for (const server of servers) { server.closeAllConnections(); await new Promise(r => server.close(r)) }
  rmSync(temp, { recursive: true, force: true })
})
test('explicit API policy extends only known proxy peers; invalid configuration fails closed', () => {
  assert.deepEqual(apiNetworkPolicy({}), { mode: 'direct', peers: [] })
  assert.deepEqual(apiNetworkPolicy({ DIDAR_AUTH_PROXY_POLICY: 'require-proof', DIDAR_AUTH_PROXY_PEERS: '::ffff:127.0.0.1', DIDAR_AUTH_NETWORK_KEY: key }), { mode: 'require-proof', peers: ['127.0.0.1'] })
  for (const value of ['127.0.0.0/8', '*', 'hostname', '127.0.0.1,', '127.0.0.1,::ffff:127.0.0.1']) assert.throws(() => exactPeers(value, true))
  for (const mode of ['', 'proxy', 'DIRECT']) assert.throws(() => apiNetworkPolicy({ DIDAR_AUTH_PROXY_POLICY: mode }))
  assert.throws(() => apiNetworkPolicy({ DIDAR_AUTH_PROXY_POLICY: 'require-proof' }))
  assert.throws(() => apiNetworkPolicy({ DIDAR_AUTH_PROXY_POLICY: 'require-proof', DIDAR_AUTH_PROXY_PEERS: '127.0.0.1' }))
})
test('verified relay preserves exact signed raw bytes, original peer, URI/query and nonce for all four auth paths', async () => {
  const body = Buffer.from([0x7b, 0xff, 0xc3, 0x28, 0x00, 0x7d])
  for (const prefix of ['/api/didar/', '/didar/']) for (const action of ['login', 'register']) {
    const path = prefix + action + '?a=%2f&b=+&a=%2F', assertion = signNetwork({ key, peer: '2001:db8::1', method: 'POST', path, body })
    const r = await send(relay.origin, path, body, { [HEADER]: assertion, forwarded: 'for=192.0.2.99', 'x-forwarded-for': '192.0.2.99' })
    assert.equal(r.status, 200); assert.equal(r.data.role, prefix.startsWith('/api/') ? 'next' : 'api')
    assert.equal(r.data.path, path); assert.equal(r.data.body, body.toString('hex')); assert.equal(r.data.assertion, assertion)
    assert.equal(r.data.proof.peer, '2001:db8::1'); assert.equal(r.data.headers.forwarded, undefined); assert.equal(r.data.headers['x-forwarded-for'], undefined)
  }
})
test('verified relay rejects absent, malformed, duplicate, wrong-key, wrong-body, expired/future and unknown-socket proof', async () => {
  const path = '/api/didar/login', body = Buffer.from('{}'), before = requests.length
  const proof = signNetwork({ key, peer: '192.0.2.1', method: 'POST', path, body })
  for (const assertion of [undefined, 'invalid', proof + ', ' + proof,
    signNetwork({ key: 'x'.repeat(32), peer: '192.0.2.1', method: 'POST', path, body }),
    signNetwork({ key, peer: '192.0.2.1', method: 'POST', path, body: Buffer.from('{ }') }),
    signNetwork({ key, peer: '192.0.2.1', method: 'POST', path, body, ts: Date.now() - 40000 }),
    signNetwork({ key, peer: '192.0.2.1', method: 'POST', path, body, ts: Date.now() + 20000 })]) {
    assert.equal((await send(relay.origin, path, body, assertion ? { [HEADER]: assertion } : {})).status, 403)
  }
  assert.equal((await send(relay.origin, path, body, { [HEADER]: proof }, '127.0.0.2')).status, 403)
  assert.equal((await send(relay.origin, path + '?changed=1', body, { [HEADER]: proof })).status, 403)
  assert.equal(requests.length, before)
})
test('auth input bounds and encoding fail closed; boundary-sized binary data stays intact', async () => {
  const path = '/didar/login', body = Buffer.alloc(1200000, 0xff)
  const assertion = signNetwork({ key, peer: '192.0.2.2', method: 'POST', path, body })
  const r = await send(relay.origin, path, body, { [HEADER]: assertion })
  assert.equal(r.status, 200); assert.equal(r.data.body, body.toString('hex'))
  assert.equal((await send(relay.origin, path, Buffer.alloc(1200001))).status, 413)
  assert.equal((await send(relay.origin, path, Buffer.from('{}'), { 'content-encoding': 'gzip' })).status, 415)
})
test('native/API segment routing preserves deep links and nonauth streams without forwarding caller proof', async () => {
  for (const path of ['/dashboard/products/x?x=%2F', '/seller/settings', '/admin/didar/pages', '/vendor/didar/pages', '/auth/member/emailpass', '/store/products', '/didar/catalog', '/static/media.jpg', '/health']) {
    const r = await send(relay.origin, path, Buffer.from('stream'), { [HEADER]: 'forged' })
    assert.equal(r.data.role, 'api'); assert.equal(r.data.path, path); assert.equal(r.data.assertion, undefined)
  }
  for (const path of ['/dashboard-other', '/sellerish', '/', '/account', '/_next/static/x', '/api/didar/image?id=x']) assert.equal((await send(relay.origin, path)).data.role, 'next')
})
test('legacy socket mode still replaces forged client attribution with the original socket', async () => {
  const r = await send(socket.origin, '/api/didar/login', Buffer.from('{}'), { [HEADER]: 'forged', 'x-real-ip': '192.0.2.8' }, '127.0.0.2')
  assert.equal(r.status, 200); assert.equal(r.data.proof.peer, '127.0.0.2'); assert.equal(r.data.headers['x-real-ip'], undefined)
})
