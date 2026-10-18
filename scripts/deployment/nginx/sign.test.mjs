import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { readFileSync, mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import signer from './sign.mjs'
import handler from './auth.mjs'
import { render, validate } from './render.mjs'

const shared = createRequire(import.meta.url)('../../../packages/auth-network/index.cjs')
const { normalizePeer, signNetwork } = signer
const key = 'test-only-key-0123456789abcdef0123456789', ts = 1770000000000
const nonce = '1234567890abcdef1234567890abcdef'
const peers = ['127.0.0.1', '192.0.2.19', '0.0.0.0', '255.255.255.255', '::', '::1', '2001:0DB8:0000:0000:0001:0000:0000:0001', '2001:db8:0:1:0:0:0:1', '::ffff:192.0.2.9', '0:0:0:0:0:FFFF:c000:0209', '::192.0.2.9', '1:2:3:4:5:6:7:8']
const invalid = ['', '01.2.3.4', '256.2.3.4', '1.2.3', '[::1]', 'fe80::1%eth0', '::ffff:192.0.2.999', '::ffff:192.0.02.9', '1:2:3:4:5:6:7', '1:2:3:4:5:6:7:8:9', '1::2::3', ':::1', '1:2:3:4:5:6:7:8::', ':1:2:3:4:5:6:7', '0x7f000001', ' 127.0.0.1']

test('njs canonical peers equal the existing v1 implementation, including mapped IPv6 and compression ties', () => {
  for (const peer of peers) assert.equal(normalizePeer(peer), shared.normalizePeer(peer), peer)
  for (const peer of invalid) {
    assert.throws(() => normalizePeer(peer), undefined, peer)
    assert.throws(() => shared.normalizePeer(peer), undefined, peer)
  }
  // Deterministic broad IPv6 corpus also exercises first-longest zero compression.
  let n = 1949
  for (let i = 0; i < 2048; i++) {
    const words = Array.from({ length: 8 }, () => { n = (Math.imul(n, 1664525) + 1013904223) >>> 0; return n % 4 === 0 ? '0' : (n & 65535).toString(16) })
    const peer = words.join(':')
    assert.equal(normalizePeer(peer), shared.normalizePeer(peer), peer)
  }
})

test('wire proof matches v1 exactly for raw bytes, UTF-8, query encodings and four auth routes', () => {
  const bodies = [Buffer.alloc(0), Buffer.from('{"email":"مشتری@example.test"}'), Buffer.from([0, 255, 192, 175, 13, 10, 128]), Buffer.alloc(1200000, 255)]
  for (const peer of peers) for (const body of bodies) for (const path of ['/api/didar/login?x=%2f&x=+&q=%D8%B7', '/api/didar/register', '/didar/login', '/didar/register?z=1&z=2']) {
    const vector = { key, peer, method: 'POST', path, body, ts, nonce }
    const actual = signNetwork(vector)
    assert.equal(actual, shared.signNetwork(vector))
    assert.equal(shared.verifyNetwork({ ...vector, assertion: actual, now: ts }).peer, normalizePeer(peer))
  }
})

test('changed method/path/query/body, wrong key and time cannot verify the proof', () => {
  const vector = { key, peer: '2001:db8::9', method: 'POST', path: '/didar/login?q=%2f', body: Buffer.from([255, 0, 13]), ts, nonce }
  const assertion = signNetwork(vector)
  for (const change of [{ method: 'GET' }, { path: '/didar/login?q=%2F' }, { path: '/didar/register?q=%2f' }, { body: Buffer.from([239, 191, 189, 0, 13]) }, { key: key + 'x' }, { now: ts + 30001 }, { now: ts - 5001 }]) {
    assert.throws(() => shared.verifyNetwork({ ...vector, assertion, now: ts, ...change }))
  }
  assert.throws(() => signNetwork({ ...vector, body: Buffer.alloc(1200001) }))
  assert.throws(() => signNetwork({ ...vector, key: 'short' }))
  assert.throws(() => signNetwork({ ...vector, nonce: '' }))
  assert.throws(() => signNetwork({ ...vector, ts: NaN }))
})

function request(changes = {}) {
  const r = {
    method: 'POST', headersIn: {}, requestBuffer: Buffer.from([0, 255, 128]),
    variables: { request_uri: '/api/didar/login?x=%2f', realip_remote_addr: '192.0.2.7', remote_addr: '192.0.2.7', proxy_protocol_addr: '', request_body_file: '' },
    return(status) { this.status = status }, internalRedirect(target) { this.target = target },
    ...changes,
  }
  return r
}

test('content handler signs original raw bytes and redirects only to fixed named TLS relay', () => {
  const previous = process.env.DIDAR_AUTH_NETWORK_KEY
  process.env.DIDAR_AUTH_NETWORK_KEY = key
  try {
    for (const path of ['/api/didar/login?x=%2f', '/api/didar/register', '/didar/login', '/didar/register']) {
      const r = request()
      r.variables.request_uri = path
      r.headersIn = { 'X-Didar-Auth-Network': 'spoof', 'X-Forwarded-For': '203.0.113.2' }
      handler.authenticate(r)
      assert.equal(r.status, undefined)
      assert.equal(r.target, '@didar_signed_relay')
      const proof = shared.verifyNetwork({ key, assertion: r.variables.didar_network_proof, method: 'POST', path, body: r.requestBuffer })
      assert.equal(proof.peer, '192.0.2.7')
    }
  } finally {
    if (previous === undefined) delete process.env.DIDAR_AUTH_NETWORK_KEY
    else process.env.DIDAR_AUTH_NETWORK_KEY = previous
  }
})

test('missing key, rewritten socket, PROXY protocol, temp-file, encoding and entropy failures fail closed', () => {
  const previous = process.env.DIDAR_AUTH_NETWORK_KEY, cryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto')
  process.env.DIDAR_AUTH_NETWORK_KEY = key
  try {
    const cases = [
      [request({ method: 'GET' }), 405],
      [request({ headersIn: { 'Content-Encoding': 'gzip' } }), 415],
      [request({ headersIn: { 'Content-Length': '1200001' } }), 413],
      [request({ headersIn: { 'Content-Length': '3' }, requestBuffer: undefined }), 413],
      [request({ headersIn: { 'Transfer-Encoding': 'chunked' }, requestBuffer: undefined }), 413],
      [request({ requestBuffer: Buffer.alloc(1200001) }), 413],
    ]
    for (const [name, value] of [['realip_remote_addr', ''], ['remote_addr', '203.0.113.1'], ['proxy_protocol_addr', '192.0.2.7'], ['request_body_file', '/tmp/body']]) {
      const r = request(); r.variables[name] = value; cases.push([r, name === 'request_body_file' ? 413 : 503])
    }
    const encoded = request(); encoded.variables.request_uri = '/api/didar/%6cogin'; cases.push([encoded, 400])
    for (const [r, expected] of cases) { handler.authenticate(r); assert.equal(r.status, expected); assert.equal(r.target, undefined) }
    delete process.env.DIDAR_AUTH_NETWORK_KEY
    const noKey = request(); handler.authenticate(noKey); assert.equal(noKey.status, 503)
    process.env.DIDAR_AUTH_NETWORK_KEY = key
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { getRandomValues() { throw Error('entropy unavailable') } } })
    const entropy = request(); handler.authenticate(entropy); assert.equal(entropy.status, 503)
  } finally {
    Object.defineProperty(globalThis, 'crypto', cryptoDescriptor)
    if (previous === undefined) delete process.env.DIDAR_AUTH_NETWORK_KEY
    else process.env.DIDAR_AUTH_NETWORK_KEY = previous
  }
})

test('template keeps fixed TLS relay, attribution clearing and private transport protections', () => {
  const config = readFileSync(new URL('./nginx.conf.template', import.meta.url), 'utf8')
  const headers = readFileSync(new URL('./proxy-headers.conf', import.meta.url), 'utf8')
  assert.equal((config.match(/proxy_pass https:\/\/didar_relay;/g) || []).length, 2)
  assert.doesNotMatch(config, /proxy_pass http:|real_ip_header|set_real_ip_from|proxy_protocol;/)
  assert.match(config, /client_body_buffer_size 1200000;/)
  assert.match(config, /X-Didar-Auth-Network "";/)
  assert.match(headers, /proxy_ssl_verify on;/)
  for (const header of ['Forwarded', 'X-Forwarded-For', 'X-Real-IP', 'True-Client-IP', 'CF-Connecting-IP', 'CF-Connecting-IPv6', 'Fastly-Client-IP']) assert.ok(headers.includes(`proxy_set_header ${header} "";`))
})

test('candidate rendering requires explicit observed values and refuses injection or overwrites', () => {
  const values = {
    NJS_MODULE_FILE: '/usr/lib/nginx/modules/ngx_http_js_module.so', PID_FILE: '/tmp/didar-nginx.pid',
    SIGNER_DIRECTORY: '/etc/didar-nginx', RELAY_ADDRESS: '192.0.2.12:3000', LISTEN_ADDRESS: '0.0.0.0:8443',
    PUBLIC_HOST: 'didar.example.test', PUBLIC_PORT: '8443', TLS_CERT_FILE: '/run/tls/edge.pem', TLS_KEY_FILE: '/run/tls/edge.key',
    UPSTREAM_CA_FILE: '/run/tls/ca.pem', RELAY_TLS_NAME: 'relay.example.test',
  }
  for (const invalid of [
    { ...values, unexpected: 'yes' }, { ...values, NJS_MODULE_FILE: undefined },
    { ...values, PUBLIC_HOST: 'didar.test;include /etc/other;' }, { ...values, RELAY_ADDRESS: 'attacker.test:3000' },
    { ...values, RELAY_ADDRESS: '127.0.0.1:0' }, { ...values, TLS_KEY_FILE: '/run/../secret' },
    { ...values, SIGNER_DIRECTORY: '/etc/foo\ninclude /etc/bypass;' }, { ...values, PUBLIC_PORT: '65536' },
  ]) assert.throws(() => validate(invalid))
  validate({ ...values, RELAY_ADDRESS: '[2001:db8::2]:3000', LISTEN_ADDRESS: '[::]:8443' })
  const output = mkdtempSync(join(tmpdir(), 'didar-nginx-render-'))
  try {
    render(values, output)
    const config = readFileSync(join(output, 'nginx.conf'), 'utf8')
    assert.doesNotMatch(config, /__[A-Z_]+__/)
    assert.match(config, /upstream didar_relay \{ server 192\.0\.2\.12:3000; \}/)
    assert.equal(statSync(join(output, 'nginx.conf')).mode & 0o777, 0o600)
    assert.throws(() => render(values, output), { code: 'EEXIST' })
  } finally { rmSync(output, { recursive: true, force: true }) }
})
